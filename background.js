/* ================================================
   Language Reactor — Background Service Worker
   ================================================ */

// ─── Context Menu Setup ──────────────────────────────────────────────────────
browser.runtime.onInstalled.addListener(() => {
  // Primary context menu
  browser.contextMenus.create({
    id: 'lr-lookup',
    title: 'Look up "%s" with Language Reactor',
    contexts: ['selection']
  });

  // Vocab panel shortcut
  browser.contextMenus.create({
    id: 'lr-open-vocab',
    title: 'Open Vocabulary Panel',
    contexts: ['page']
  });

  // Settings shortcut
  browser.contextMenus.create({
    id: 'lr-open-settings',
    title: 'Open Language Reactor Settings',
    contexts: ['page']
  });
});

// ─── Context Menu Handlers ────────────────────────────────────────────────────
browser.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'lr-lookup': {
      const selected = info.selectionText;
      if (!selected) return;
      // Inject a lookup popup into the active tab
      browser.tabs.sendMessage(tab.id, {
        type: 'LR_LOOKUP',
        text: selected.trim()
      });
      break;
    }
    case 'lr-open-vocab':
      browser.tabs.sendMessage(tab.id, { type: 'LR_TOGGLE_VOCAB' });
      break;
    case 'lr-open-settings':
      browser.tabs.sendMessage(tab.id, { type: 'LR_OPEN_SETTINGS' });
      break;
  }
});

// ─── Translation API Proxy ────────────────────────────────────────────────────
// background.js acts as middleware for translation calls from content script
// to avoid CORS issues — uses browser.runtime.sendMessage pattern

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'LR_TRANSLATE') {
    lrTranslate(msg.text, msg.fromLang, msg.toLang)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === 'LR_GET_SETTINGS') {
    browser.storage.local.get('lr_settings', (result) => {
      sendResponse(result.lr_settings || {});
    });
    return true;
  }

  if (msg.type === 'LR_SAVE_SETTINGS') {
    browser.storage.local.set({ lr_settings: msg.settings }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'LR_GET_VOCAB') {
    browser.storage.local.get('lr_vocabulary', (result) => {
      sendResponse(result.lr_vocabulary || []);
    });
    return true;
  }

  if (msg.type === 'LR_ADD_WORD') {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      word: msg.entry.word,
      translation: msg.entry.translation,
      sentence: msg.entry.sentence || '',
      timestamp: msg.entry.timestamp || '',
      videoUrl: msg.entry.videoUrl || '',
      date: new Date().toISOString().split('T')[0]
    };
    browser.storage.local.get('lr_vocabulary', (result) => {
      const vocab = result.lr_vocabulary || [];
      vocab.unshift(entry);
      browser.storage.local.set({ lr_vocabulary: vocab }, () => {
        sendResponse({ ok: true, entry });
      });
    });
    return true;
  }

  if (msg.type === 'LR_REMOVE_WORD') {
    browser.storage.local.get('lr_vocabulary', (result) => {
      const vocab = result.lr_vocabulary || [];
      const filtered = vocab.filter(w => w.id !== msg.id);
      browser.storage.local.set({ lr_vocabulary: filtered }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === 'LR_CLEAR_VOCAB') {
    browser.storage.local.set({ lr_vocabulary: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'LR_EXPORT_CSV') {
    browser.storage.local.get('lr_vocabulary', (result) => {
      const vocab = result.lr_vocabulary || [];
      const header = 'Word,Translation,Context,Video URL,Timestamp,Date\n';
      const rows = vocab.map(w =>
        `"${w.word}","${w.translation}","${(w.sentence||'').replace(/"/g,'""')}","${w.videoUrl||''}","${w.timestamp||''}","${w.date||''}"`
      ).join('\n');
      const csv = header + rows;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      sendResponse({ ok: true, url });
    });
    return true;
  }

  if (msg.type === 'LR_GET_CACHE') {
    browser.storage.local.get('lr_cache', (result) => {
      sendResponse(result.lr_cache || {});
    });
    return true;
  }

  if (msg.type === 'LR_SET_CACHE') {
    browser.storage.local.set({ lr_cache: msg.cache }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'LR_CACHED_TRANSLATE') {
    // Try cache first, then API
    const cacheKey = `${msg.fromLang}|${msg.toLang}|${msg.text}`;
    browser.storage.local.get('lr_cache', async (result) => {
      const cache = result.lr_cache || {};
      if (cache[cacheKey]) {
        sendResponse({ ok: true, result: cache[cacheKey], cached: true });
        return;
      }
      // Not cached — fetch
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(msg.text)}&langpair=${msg.fromLang}|${msg.toLang}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const translation = data.responseData?.translatedText || '__no_translation__';
        cache[cacheKey] = translation;
        browser.storage.local.set({ lr_cache: cache }, () => {});
        sendResponse({ ok: true, result: translation, cached: false });
      } catch(e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }

  return false;
});

// ─── MyMemory Translation ────────────────────────────────────────────────────
async function lrTranslate(text, fromLang, toLang) {
  const cacheKey = `${fromLang}|${toLang}|${text}`;
  return new Promise((resolve, reject) => {
    browser.storage.local.get('lr_cache', async (result) => {
      const cache = result.lr_cache || {};
      if (cache[cacheKey]) {
        resolve(cache[cacheKey]);
        return;
      }
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
        const resp = await fetch(url);
        const data = await resp.json();
        const translation = data.responseData?.translatedText || '__no_translation__';
        cache[cacheKey] = translation;
        browser.storage.local.set({ lr_cache: cache }, () => {});
        resolve(translation);
      } catch(e) {
        reject(e);
      }
    });
  });
}
