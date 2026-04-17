/* ================================================
   LingoFlip — Content Script
   Handles subtitle detection, display, word clicks,
   translation popup, and vocabulary panel.
   ================================================ */

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────────
  let settings     = {};
  let vocabPanel   = null;
  let transPopup   = null;
  let subPanel     = null;
  let settingsPanel= null;
  let isEnabled    = true;
  let currentL1Text = '';
  let currentL2Text = '';
  let observer     = null;
  let panelDrag    = { active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };

  // ─── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    const stored = await browser.runtime.sendMessage({ type: 'LG_GET_SETTINGS' });
    settings = Object.assign({
      L1: 'en', L2: 'es', fontSize: 20,
      fontColor: '#FFFFFF', bgOpacity: 0.75,
      position: 'bottom', enabledSites: {}
    }, stored || {});

    if (!isSiteEnabled()) return;

    buildSubtitlePanel();
    buildVocabPanel();
    buildTransPopup();
    buildSettingsPanel();

    startSubtitleObserver();

    // Listen for messages from background / popup
    browser.runtime.onMessage.addListener(onMessage);
  }

  // ─── Site Detection ──────────────────────────────────────────────────────────
  function isSiteEnabled() {
    const host = window.location.hostname;
    if (host.includes('youtube'))   return settings.enabledSites.youtube;
    if (host.includes('netflix'))   return settings.enabledSites.netflix;
    if (host.includes('udemy'))     return settings.enabledSites.udemy;
    if (host.includes('babbel'))    return settings.enabledSites.babbel;
    return true;
  }

  function getPlatform() {
    const host = window.location.hostname;
    if (host.includes('youtube')) return 'youtube';
    if (host.includes('netflix')) return 'netflix';
    return 'generic';
  }

  // ─── Subtitle Text Extraction ────────────────────────────────────────────────
  function getYouTubeSubtitles() {
    // Method 1: ytd-player caption tracks
    const player = document.querySelector('ytd-player');
    if (player && player.getAudioTrack) {
      try {
        const tracks = player.querySelectorAll('track');
        // fall through
      } catch(e) {}
    }

    // Method 2: Caption display elements (ytp-caption-segment)
    const segs = document.querySelectorAll('.ytp-caption-segment');
    if (segs.length > 0) {
      const texts = Array.from(segs).map(s => s.innerText.trim()).filter(Boolean);
      return texts.join(' ').trim();
    }

    // Method 3: yt-native subtitle window
    const captionWin = document.querySelector('.ytp-caption-window-container');
    if (captionWin) {
      const spans = captionWin.querySelectorAll('span');
      if (spans.length > 0) {
        const texts = Array.from(spans).map(s => s.innerText.trim()).filter(Boolean);
        return texts.join(' ').trim();
      }
    }

    return '';
  }

  function getNetflixSubtitles() {
    // Netflix subtitle container
    const player = document.querySelector('.netflix-video') || document.querySelector('video');
    const captions = document.querySelectorAll('[data-purpose="subtitle"], .player-timed-text, .NMF-internal');

    if (captions.length > 0) {
      const texts = Array.from(captions).map(c => c.innerText.trim()).filter(Boolean);
      return texts.join(' ').trim();
    }

    // Netflix new UI
    const textTracks = document.querySelectorAll('span.text, .previewModal--subtitle span');
    if (textTracks.length > 0) {
      return Array.from(textTracks).map(t => t.innerText.trim()).filter(Boolean).join(' ');
    }
    return '';
  }

  function getGenericSubtitles() {
    // Generic: look for any visible subtitle-like elements
    const candidates = document.querySelectorAll(
      '.subtitle, .cc, [aria-label*="subtitle" i], [data-subtitle], video track'
    );
    for (const el of candidates) {
      const text = (el.innerText || '').trim();
      if (text && text.length < 500 && text.split(' ').length > 2) return text;
    }
    return '';
  }

  function getSubtitleText() {
    const platform = getPlatform();
    if (platform === 'youtube') return getYouTubeSubtitles();
    if (platform === 'netflix')  return getNetflixSubtitles();
    return getGenericSubtitles();
  }

  // ─── Subtitle Observer ───────────────────────────────────────────────────────
  function startSubtitleObserver() {
    // Poll every 500ms for subtitle changes
    let lastText = '';
    const interval = setInterval(() => {
      if (!isEnabled) return;
      const text = getSubtitleText();
      if (text && text !== lastText) {
        lastText = text;
        onSubtitleChange(text);
      }
    }, 500);

    // Also use MutationObserver on the page
    try {
      observer = new MutationObserver(() => {
        if (!isEnabled) return;
        const text = getSubtitleText();
        if (text && text !== lastText) {
          lastText = text;
          onSubtitleChange(text);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch(e) {}

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(interval);
      if (observer) observer.disconnect();
    });
  }

  function onSubtitleChange(text) {
    if (!subPanel) return;
    const isL2 = detectLanguage(text) === settings.L2;
    if (isL2) {
      currentL2Text = text;
      // Show L2 on top, L1 below
      subPanel.querySelector('.lg-sub-l2').textContent = text;
      subPanel.querySelector('.lg-sub-l1').textContent = currentL1Text;
    } else {
      currentL1Text = text;
      subPanel.querySelector('.lg-sub-l1').textContent = text;
      subPanel.querySelector('.lg-sub-l2').textContent = currentL2Text;
    }
  }

  // ─── Language Detection (weighted scoring) ───────────────────────────────────
  // Scores each language by counting distinctive character matches.
  // Highest score wins. English is a fallback only when no distinctive diacritics are found.
  // Order within equal scores: more culturally distinctive languages listed first.
  // Uses Unicode escapes to avoid encoding issues in regex literals.
  const LANG_PATTERNS = [
    { lang: 'pt', regex: /[\u00e3\u00f5\u00c7]/gi,                              weight: 2 },
    { lang: 'fr', regex: /[\u00e0\u00e2\u00c7\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00fb\u00f9\u00fc\u00ff\u0153\u00e6\u00c9]/gi, weight: 1.5 },
    { lang: 'es', regex: /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1\u00bf\u00a1]/gi, weight: 1 },
    { lang: 'it', regex: /[\u00e0\u00e8\u00e9\u00ec\u00ed\u00f2\u00f3\u00f9]/gi, weight: 1 },
    { lang: 'de', regex: /[\u00e4\u00f6\u00fc\u00df]/gi,                           weight: 2 },
    { lang: 'ru', regex: /[\u0430-\u044f\u0410-\u042f\u0451\u0401]/g,              weight: 2 },
    { lang: 'ja', regex: /[\u3040-\u30ff]/g,                                        weight: 2 },
    { lang: 'ko', regex: /[\uac00-\ud7af]/gi,                                       weight: 2 },
    { lang: 'zh', regex: /[\u4e00-\u9fff]/g,                                        weight: 2 },
    { lang: 'ar', regex: /[\u0600-\u06ff]/g,                                        weight: 2 },
  ];

  function detectLanguage(text) {
    if (!text) return 'en';
    const scores = {};
    for (const { lang, regex, weight } of LANG_PATTERNS) {
      const all = text.match(regex); // null if no match
      if (all && all.length > 0) scores[lang] = (scores[lang] || 0) + all.length * weight;
    }
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return top.length > 0 ? top[0][0] : 'en';
  }

  // ─── Build Subtitle Panel ────────────────────────────────────────────────────
  function buildSubtitlePanel() {
    if (subPanel) { subPanel.remove(); subPanel = null; }

    subPanel = document.createElement('div');
    subPanel.id = 'lg-subtitle-panel';
    subPanel.className = `lg-position-${settings.position}`;

    subPanel.innerHTML = `
      <div class="lg-sub-header" id="lg-sub-header">
        <span class="lg-sub-label">L2</span>
        <span class="lg-sub-l2 lg-sub-text"></span>
      </div>
      <div class="lg-sub-body">
        <span class="lg-sub-label">L1</span>
        <span class="lg-sub-l1 lg-sub-text"></span>
      </div>
      <div class="lg-sub-controls">
        <button class="lg-btn lg-btn-sm" id="lg-toggle-vocab" title="Vocabulary">📚</button>
        <button class="lg-btn lg-btn-sm" id="lg-open-settings-btn" title="Settings">⚙️</button>
        <button class="lg-btn lg-btn-sm" id="lg-collapse-panel" title="Collapse">−</button>
      </div>
    `;

    applySubStyle(subPanel);
    document.body.appendChild(subPanel);

    // Collapse button
    subPanel.querySelector('#lg-collapse-panel').addEventListener('click', (e) => {
      e.stopPropagation();
      subPanel.classList.toggle('lg-collapsed');
    });

    // Header drag
    const header = subPanel.querySelector('#lg-sub-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      panelDrag.active = true;
      panelDrag.startX = e.clientX;
      panelDrag.startY = e.clientY;
      const rect = subPanel.getBoundingClientRect();
      panelDrag.startLeft = rect.left;
      panelDrag.startTop  = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!panelDrag.active) return;
      const dx = e.clientX - panelDrag.startX;
      const dy = e.clientY - panelDrag.startY;
      subPanel.style.left = (panelDrag.startLeft + dx) + 'px';
      subPanel.style.top  = (panelDrag.startTop  + dy) + 'px';
      subPanel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      panelDrag.active = false;
    });

    // Vocab toggle button
    subPanel.querySelector('#lg-toggle-vocab').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVocabPanel();
    });

    // Settings button
    subPanel.querySelector('#lg-open-settings-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSettingsPanel();
    });
  }

  function applySubStyle(panel) {
    if (!panel) return;
    const size  = settings.fontSize  || 20;
    const color = settings.fontColor || '#FFFFFF';
    const alpha = settings.bgOpacity ?? 0.75;
    panel.querySelectorAll('.lg-sub-text').forEach(el => {
      el.style.fontSize   = size + 'px';
      el.style.color      = color;
    });
    const bgColor = `rgba(0,0,0,${alpha})`;
    panel.style.setProperty('--lg-bg', bgColor);
  }

  // ─── Vocabulary Panel ───────────────────────────────────────────────────────
  function buildVocabPanel() {
    vocabPanel = document.createElement('div');
    vocabPanel.id = 'lg-vocab-panel';
    vocabPanel.className = 'lg-hidden';
    vocabPanel.innerHTML = `
      <div class="lg-panel-header">
        <span>📚 Vocabulary <span id="lg-vocab-count" class="lg-badge">0</span></span>
        <div class="lg-panel-actions">
          <button class="lg-btn" id="lg-export-csv">Export CSV</button>
          <button class="lg-btn lg-btn-danger" id="lg-clear-vocab">Clear All</button>
          <button class="lg-btn lg-btn-sm" id="lg-close-vocab">✕</button>
        </div>
      </div>
      <div id="lg-vocab-list"></div>
    `;
    document.body.appendChild(vocabPanel);

    vocabPanel.querySelector('#lg-close-vocab').addEventListener('click', () => {
      vocabPanel.classList.add('lg-hidden');
    });

    vocabPanel.querySelector('#lg-export-csv').addEventListener('click', async () => {
      const resp = await browser.runtime.sendMessage({ type: 'LG_EXPORT_CSV' });
      if (resp.ok && resp.url) {
        const a = document.createElement('a');
        a.href = resp.url;
        a.download = `lingoflip-vocab-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(resp.url);
      }
    });

    vocabPanel.querySelector('#lg-clear-vocab').addEventListener('click', async () => {
      if (confirm('Clear all vocabulary?')) {
        await browser.runtime.sendMessage({ type: 'LG_CLEAR_VOCAB' });
        renderVocab([]);
      }
    });

    loadVocab();
  }

  async function loadVocab() {
    const vocab = await browser.runtime.sendMessage({ type: 'LG_GET_VOCAB' });
    renderVocab(Array.isArray(vocab) ? vocab : []);
  }

  function renderVocab(vocab) {
    const list = document.getElementById('lg-vocab-list');
    const count = document.getElementById('lg-vocab-count');
    if (!list) return;
    count.textContent = vocab.length;
    if (vocab.length === 0) {
      list.innerHTML = '<p class="lg-empty">No words saved yet. Click any word in subtitles to add!</p>';
      return;
    }
    list.innerHTML = vocab.map(w => `
      <div class="lg-vocab-item" data-id="${w.id}">
        <div class="lg-vocab-word">${escHtml(w.word)}</div>
        <div class="lg-vocab-translation">${escHtml(w.translation)}</div>
        ${w.sentence ? `<div class="lg-vocab-sentence">"${escHtml(w.sentence)}"</div>` : ''}
        <div class="lg-vocab-meta">
          ${w.videoUrl ? `<a href="${escHtml(w.videoUrl)}" target="_blank">Video ↗</a>` : ''}
          <span>${w.date || ''}</span>
          <button class="lg-btn lg-btn-danger lg-btn-sm lg-delete-word" data-id="${w.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.lg-delete-word').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await browser.runtime.sendMessage({ type: 'LG_REMOVE_WORD', id });
        const vocab = await browser.runtime.sendMessage({ type: 'LG_GET_VOCAB' });
        renderVocab(Array.isArray(vocab) ? vocab : []);
      });
    });
  }

  function toggleVocabPanel() {
    if (!vocabPanel) return;
    vocabPanel.classList.toggle('lg-hidden');
    if (!vocabPanel.classList.contains('lg-hidden')) loadVocab();
  }

  // ─── Translation Popup ──────────────────────────────────────────────────────
  function buildTransPopup() {
    transPopup = document.createElement('div');
    transPopup.id = 'lg-trans-popup';
    transPopup.className = 'lg-hidden';
    transPopup.innerHTML = `
      <div class="lg-popup-word" id="lg-popup-word"></div>
      <div class="lg-popup-loading" id="lg-popup-loading">Translating...</div>
      <div class="lg-popup-translation" id="lg-popup-translation"></div>
      <div class="lg-popup-context" id="lg-popup-context"></div>
      <div class="lg-popup-actions">
        <button class="lg-btn" id="lg-save-word">💾 Save Word</button>
        <button class="lg-btn lg-btn-sm" id="lg-close-popup">✕</button>
      </div>
    `;
    document.body.appendChild(transPopup);

    transPopup.querySelector('#lg-close-popup').addEventListener('click', closeTransPopup);
    transPopup.querySelector('#lg-save-word').addEventListener('click', saveCurrentWord);
  }

  let popupState = { word: '', translation: '', sentence: '', timestamp: '' };

  async function showTransPopup(word, sentence, x, y) {
    if (!transPopup) return;
    popupState = { word, sentence, timestamp: getVideoTimestamp(), translation: '' };
    transPopup.querySelector('#lg-popup-word').textContent = word;
    transPopup.querySelector('#lg-popup-translation').textContent = '';
    transPopup.querySelector('#lg-popup-loading').style.display = '';
    transPopup.querySelector('#lg-popup-context').textContent = sentence ? `"${sentence}"` : '';

    // Position popup
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(x, vw - 320);
    let top  = Math.min(y, vh - 200);
    transPopup.style.left = left + 'px';
    transPopup.style.top  = top  + 'px';
    transPopup.style.right = 'auto';
    transPopup.classList.remove('lg-hidden');

    // Translate L2 → L1
    const L2 = detectLanguage(word);
    const resp = await browser.runtime.sendMessage({
      type: 'LG_CACHED_TRANSLATE',
      text: word,
      fromLang: L2 || settings.L2,
      toLang: settings.L1
    });

    if (resp && resp.ok) {
      transPopup.querySelector('#lg-popup-loading').style.display = 'none';
      transPopup.querySelector('#lg-popup-translation').textContent = resp.result || '—';
      popupState.translation = resp.result || '';
    } else {
      transPopup.querySelector('#lg-popup-loading').style.display = 'none';
      transPopup.querySelector('#lg-popup-translation').textContent = '⚠️ Translation unavailable';
    }
  }

  function closeTransPopup() {
    if (transPopup) transPopup.classList.add('lg-hidden');
    popupState = {};
  }

  async function saveCurrentWord() {
    if (!popupState.word) return;
    const entry = {
      word: popupState.word,
      translation: popupState.translation,
      sentence: popupState.sentence,
      timestamp: popupState.timestamp,
      videoUrl: window.location.href
    };
    await browser.runtime.sendMessage({ type: 'LG_ADD_WORD', entry });
    const btn = document.getElementById('lg-save-word');
    if (btn) {
      btn.textContent = '✅ Saved!';
      setTimeout(() => { btn.textContent = '💾 Save Word'; }, 1500);
    }
    loadVocab();
  }

  function getVideoTimestamp() {
    const v = document.querySelector('video');
    if (!v) return '';
    const s = Math.floor(v.currentTime);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }

  // ─── Settings Panel ─────────────────────────────────────────────────────────
  function buildSettingsPanel() {
    settingsPanel = document.createElement('div');
    settingsPanel.id = 'lg-settings-panel';
    settingsPanel.className = 'lg-hidden';
    settingsPanel.innerHTML = `
      <div class="lg-panel-header">
        <span>⚙️ LingoFlip Settings</span>
        <button class="lg-btn lg-btn-sm" id="lg-close-settings">✕</button>
      </div>
      <div class="lg-settings-body">
        <div class="lg-form-group">
          <label>Native Language (L1)</label>
          <select id="lg-setting-L1"></select>
        </div>
        <div class="lg-form-group">
          <label>Learning Language (L2)</label>
          <select id="lg-setting-L2"></select>
        </div>
        <div class="lg-form-group">
          <label>Font Size: <span id="lg-size-val">${settings.fontSize || 20}px</span></label>
          <input type="range" id="lg-setting-fontSize" min="12" max="36" value="${settings.fontSize || 20}" />
        </div>
        <div class="lg-form-group">
          <label>Subtitle Color</label>
          <input type="color" id="lg-setting-fontColor" value="${settings.fontColor || '#FFFFFF'}" />
        </div>
        <div class="lg-form-group">
          <label>Background Opacity: <span id="lg-opacity-val">${((settings.bgOpacity ?? 0.75)*100).toFixed(0)}%</span></label>
          <input type="range" id="lg-setting-bgOpacity" min="0.1" max="1" step="0.05" value="${settings.bgOpacity ?? 0.75}" />
        </div>
        <div class="lg-form-group">
          <label>Position</label>
          <select id="lg-setting-position">
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </div>
        <div class="lg-form-group">
          <label>Enable Sites</label>
          <div class="lg-checkboxes">
            <label><input type="checkbox" id="lg-site-youtube" /> YouTube</label>
            <label><input type="checkbox" id="lg-site-netflix" /> Netflix</label>
            <label><input type="checkbox" id="lg-site-udemy" /> Udemy</label>
            <label><input type="checkbox" id="lg-site-babbel" /> Babbel</label>
          </div>
        </div>
        <div class="lg-form-actions">
          <button class="lg-btn" id="lg-save-settings">Save Settings</button>
          <button class="lg-btn" id="lg-reset-settings">Reset Defaults</button>
        </div>
      </div>
    `;
    document.body.appendChild(settingsPanel);

    const LANGUAGES = [
      ['en','English'],['es','Spanish'],['fr','French'],['de','German'],
      ['it','Italian'],['pt','Portuguese'],['ru','Russian'],['ja','Japanese'],
      ['ko','Korean'],['zh','Chinese'],['ar','Arabic'],['nl','Dutch'],
      ['pl','Polish'],['sv','Swedish'],['tr','Turkish'],['hi','Hindi']
    ];

    const L1 = document.getElementById('lg-setting-L1');
    const L2 = document.getElementById('lg-setting-L2');
    LANGUAGES.forEach(([code, name]) => {
      L1.append(new Option(name, code));
      L2.append(new Option(name, code));
    });
    L1.value = settings.L1 || 'en';
    L2.value = settings.L2 || 'es';

    // Site checkboxes
    const siteMap = { 'lg-site-youtube': 'youtube', 'lg-site-netflix': 'netflix',
                       'lg-site-udemy': 'udemy', 'lg-site-babbel': 'babbel' };
    Object.entries(siteMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.checked = settings.enabledSites?.[key] ?? false;
    });

    document.getElementById('lg-setting-position').value = settings.position || 'bottom';

    // Range inputs
    document.getElementById('lg-setting-fontSize').addEventListener('input', (e) => {
      document.getElementById('lg-size-val').textContent = e.target.value + 'px';
    });
    document.getElementById('lg-setting-bgOpacity').addEventListener('input', (e) => {
      document.getElementById('lg-opacity-val').textContent = (e.target.value * 100).toFixed(0) + '%';
    });

    settingsPanel.querySelector('#lg-close-settings').addEventListener('click', () => {
      settingsPanel.classList.add('lg-hidden');
    });

    document.getElementById('lg-save-settings').addEventListener('click', async () => {
      const newSettings = {
        L1: L1.value,
        L2: L2.value,
        fontSize: parseInt(document.getElementById('lg-setting-fontSize').value),
        fontColor: document.getElementById('lg-setting-fontColor').value,
        bgOpacity: parseFloat(document.getElementById('lg-setting-bgOpacity').value),
        position: document.getElementById('lg-setting-position').value,
        enabledSites: {
          youtube: document.getElementById('lg-site-youtube').checked,
          netflix: document.getElementById('lg-site-netflix').checked,
          udemy:  document.getElementById('lg-site-udemy').checked,
          babbel: document.getElementById('lg-site-babbel').checked
        }
      };
      await browser.runtime.sendMessage({ type: 'LG_SAVE_SETTINGS', settings: newSettings });
      settings = newSettings;
      applySubStyle(subPanel);
      settingsPanel.classList.add('lg-hidden');
    });

    document.getElementById('lg-reset-settings').addEventListener('click', () => {
      L1.value = 'en'; L2.value = 'es';
      document.getElementById('lg-setting-fontSize').value = 20;
      document.getElementById('lg-size-val').textContent = '20px';
      document.getElementById('lg-setting-fontColor').value = '#FFFFFF';
      document.getElementById('lg-setting-bgOpacity').value = 0.75;
      document.getElementById('lg-opacity-val').textContent = '75%';
      document.getElementById('lg-setting-position').value = 'bottom';
      Object.keys(siteMap).forEach(id => { const el = document.getElementById(id); if(el) el.checked = false; });
      document.getElementById('lg-site-youtube').checked = true;
    });
  }

  function toggleSettingsPanel() {
    if (!settingsPanel) return;
    settingsPanel.classList.toggle('lg-hidden');
  }

  // ─── Word Click Handler ──────────────────────────────────────────────────────
  document.addEventListener('mousedown', (e) => {
    if (!isEnabled) return;
    // Only handle clicks on subtitle panel text
    const target = e.target;
    if (!target.classList.contains('lg-sub-text')) return;
    if (target.tagName !== 'SPAN') return;

    const text = target.innerText.trim();
    if (!text) return;

    // Split into words, find which one was clicked
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX;
    const words = text.split(/\s+/);
    // Simple heuristic: estimate char width
    const charW = rect.width / text.length;
    const relX = clickX - rect.left;
    const charIdx = Math.floor(relX / charW);
    let cumLen = 0;
    let clickedWord = words[0] || text;
    for (const w of words) {
      if (cumLen + w.length >= charIdx) { clickedWord = w; break; }
      cumLen += w.length + 1;
    }
    clickedWord = clickedWord.replace(/[^\p{L}\p{N}'\-]/gu, '').trim();
    if (!clickedWord) return;

    const sentence = currentL2Text;
    const x = Math.min(e.clientX, window.innerWidth  - 320);
    const y = Math.min(e.clientY, window.innerHeight - 250);
    showTransPopup(clickedWord, sentence, x, y);
  });

  // ─── Message Handler ─────────────────────────────────────────────────────────
  function onMessage(msg) {
    switch (msg.type) {
      case 'LG_LOOKUP':
        showTransPopup(msg.text, '', msg.screenX || 200, msg.screenY || 300);
        break;
      case 'LG_TOGGLE_VOCAB':
        toggleVocabPanel();
        break;
      case 'LG_OPEN_SETTINGS':
        toggleSettingsPanel();
        break;
      case 'LG_SET_ENABLED':
        isEnabled = msg.enabled;
        if (subPanel) subPanel.style.display = isEnabled ? '' : 'none';
        break;
    }
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 300); // small delay to let video player init
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  }

})();
