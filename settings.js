/* ================================================
   Language Reactor — Shared Settings Helper
   ================================================ */

/* eslint-disable no-unused-vars */

const LR_SETTINGS_KEY = 'lr_settings';
const LR_VOCAB_KEY   = 'lr_vocabulary';
const LR_CACHE_KEY   = 'lr_cache';

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  L1: 'en',           // native language
  L2: 'es',           // learning language
  fontSize: 20,
  fontColor: '#FFFFFF',
  bgOpacity: 0.75,
  position: 'bottom', // 'top' | 'bottom'
  enabledSites: {
    youtube: true,
    netflix: true,
    udemy: false,
    babbel: false
  }
};

// ─── Load ────────────────────────────────────────────────────────────────────
function lrLoadSettings(callback) {
  browser.storage.local.get(LR_SETTINGS_KEY, (result) => {
    const raw = result[LR_SETTINGS_KEY];
    // Only pick known fields from stored settings (drop unknown keys)
    const known = {};
    if (raw) {
      Object.keys(DEFAULT_SETTINGS).forEach(k => {
        if (k in raw) known[k] = raw[k];
      });
    }
    const settings = Object.assign({}, DEFAULT_SETTINGS, known);
    callback(settings);
  });
}

function lrSaveSettings(settings, callback) {
  browser.storage.local.set({ [LR_SETTINGS_KEY]: settings }, () => {
    if (callback) callback();
  });
}

// ─── Vocabulary CRUD ─────────────────────────────────────────────────────────
function lrLoadVocab(callback) {
  browser.storage.local.get(LR_VOCAB_KEY, (result) => {
    callback(result[LR_VOCAB_KEY] || []);
  });
}

function lrSaveVocab(vocab, callback) {
  browser.storage.local.set({ [LR_VOCAB_KEY]: vocab }, () => {
    if (callback) callback();
  });
}

function lrAddWord(entry, callback) {
  lrLoadVocab((vocab) => {
    if (!entry.id) entry.id = lrGenId();
    vocab.unshift(entry);
    lrSaveVocab(vocab, () => callback(entry));
  });
}

function lrRemoveWord(id, callback) {
  lrLoadVocab((vocab) => {
    vocab = vocab.filter(w => w.id !== id);
    lrSaveVocab(vocab, () => callback());
  });
}

function lrClearVocab(callback) {
  lrSaveVocab([], callback);
}

// ─── Translation Cache ────────────────────────────────────────────────────────
function lrLoadCache(callback) {
  browser.storage.local.get(LR_CACHE_KEY, (result) => {
    callback(result[LR_CACHE_KEY] || {});
  });
}

function lrSaveCache(cache, callback) {
  // Merge with existing cache to avoid overwriting unrelated entries
  browser.storage.local.get(LR_CACHE_KEY, (result) => {
    const existing = result[LR_CACHE_KEY] || {};
    browser.storage.local.set({ [LR_CACHE_KEY]: Object.assign({}, existing, cache) }, () => {
      if (callback) callback();
    });
  });
}

// ─── Translation API (MyMemory) ───────────────────────────────────────────────
async function lrTranslate(text, fromLang, toLang) {
  const cacheKey = `${fromLang}|${toLang}|${text}`;
  return new Promise((resolve) => {
    lrLoadCache(async (cache) => {
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
        lrSaveCache(cache, () => resolve(translation));
      } catch (e) {
        resolve('__error__');
      }
    });
  });
}

// ─── CSV Export ──────────────────────────────────────────────────────────────
function lrExportVocabCSV(vocab) {
  const header = 'Word,Translation,Context,Video URL,Timestamp,Date\n';
  const rows = vocab.map(w =>
    `"${w.word}","${w.translation}","${(w.sentence || '').replace(/"/g, '""')}","${w.videoUrl || ''}","${w.timestamp || ''}","${w.date || ''}"`
  ).join('\n');
  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  return URL.createObjectURL(blob);
}

// ─── ID Generator ─────────────────────────────────────────────────────────────
function lrGenId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  lrLoadSettings, lrSaveSettings,
  lrLoadVocab, lrSaveVocab, lrAddWord, lrRemoveWord, lrClearVocab,
  lrLoadCache, lrSaveCache,
  lrTranslate,
  lrExportVocabCSV, lrGenId,
  DEFAULT_SETTINGS,
  LR_SETTINGS_KEY, LR_VOCAB_KEY, LR_CACHE_KEY
};
