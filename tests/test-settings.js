/**
 * test-settings.js — Unit tests for settings.js helpers
 * Mocks browser.storage.local before requiring the module.
 */

const storageMock = {};

// ─── Browser Global Mock ──────────────────────────────────────────────────────
global.browser = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(k => { if (storageMock[k] !== undefined) result[k] = storageMock[k]; });
        } else if (typeof keys === 'string') {
          if (storageMock[keys] !== undefined) result[keys] = storageMock[keys];
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach(k => { result[k] = storageMock[k] ?? keys[k]; });
        }
        cb(result);
      },
      set: (data, cb) => {
        Object.assign(storageMock, data);
        if (cb) cb();
      }
    }
  }
};

// ─── Load settings module ─────────────────────────────────────────────────────
const {
  lrLoadSettings, lrSaveSettings,
  lrLoadVocab, lrSaveVocab, lrAddWord, lrRemoveWord, lrClearVocab,
  lrLoadCache, lrSaveCache,
  lrExportVocabCSV, lrGenId,
  DEFAULT_SETTINGS
} = require('../settings.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clearStorage() {
  Object.keys(storageMock).forEach(k => delete storageMock[k]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('settings.js — DEFAULT_SETTINGS', () => {
  test('has all required fields', () => {
    expect(DEFAULT_SETTINGS).toHaveProperty('L1', 'en');
    expect(DEFAULT_SETTINGS).toHaveProperty('L2', 'es');
    expect(DEFAULT_SETTINGS).toHaveProperty('fontSize', 20);
    expect(DEFAULT_SETTINGS).toHaveProperty('fontColor', '#FFFFFF');
    expect(DEFAULT_SETTINGS).toHaveProperty('bgOpacity', 0.75);
    expect(DEFAULT_SETTINGS).toHaveProperty('position', 'bottom');
    expect(DEFAULT_SETTINGS).toHaveProperty('enabledSites');
    expect(typeof DEFAULT_SETTINGS.enabledSites).toBe('object');
  });

  test('enabledSites defaults correctly', () => {
    expect(DEFAULT_SETTINGS.enabledSites.youtube).toBe(true);
    expect(DEFAULT_SETTINGS.enabledSites.netflix).toBe(true);
    expect(DEFAULT_SETTINGS.enabledSites.udemy).toBe(false);
    expect(DEFAULT_SETTINGS.enabledSites.babbel).toBe(false);
  });
});

describe('settings.js — lrLoadSettings', () => {
  beforeEach(clearStorage);

  test('returns defaults when storage is empty', (done) => {
    lrLoadSettings((settings) => {
      expect(settings.L1).toBe('en');
      expect(settings.fontSize).toBe(20);
      expect(settings.bgOpacity).toBe(0.75);
      done();
    });
  });

  test('merges stored settings with defaults', (done) => {
    storageMock['lr_settings'] = { L1: 'fr', fontSize: 28 };
    lrLoadSettings((settings) => {
      expect(settings.L1).toBe('fr');
      expect(settings.fontSize).toBe(28);
      expect(settings.L2).toBe('es');      // default preserved
      expect(settings.bgOpacity).toBe(0.75); // default preserved
      done();
    });
  });

  test('unknown fields are dropped', (done) => {
    storageMock['lr_settings'] = { L1: 'de', unknownField: 'ignore me' };
    lrLoadSettings((settings) => {
      expect(settings.unknownField).toBeUndefined();
      done();
    });
  });
});

describe('settings.js — lrSaveSettings', () => {
  beforeEach(clearStorage);

  test('saves and retrieves settings', (done) => {
    const s = { L1: 'de', L2: 'ja', fontSize: 24 };
    lrSaveSettings(s, () => {
      lrLoadSettings((loaded) => {
        expect(loaded.L1).toBe('de');
        expect(loaded.L2).toBe('ja');
        expect(loaded.fontSize).toBe(24);
        done();
      });
    });
  });

  test('overwrites previous settings', (done) => {
    lrSaveSettings({ L1: 'it', fontSize: 18 }, () => {
      lrSaveSettings({ L1: 'pt' }, () => {
        lrLoadSettings((loaded) => {
          expect(loaded.L1).toBe('pt');
          expect(loaded.fontSize).toBe(20); // reset to default
          done();
        });
      });
    });
  });
});

describe('settings.js — lrGenId', () => {
  test('generates unique IDs across 100 calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => lrGenId()));
    expect(ids.size).toBe(100);
  });

  test('returns a string', () => {
    expect(typeof lrGenId()).toBe('string');
  });

  test('ID is alphanumeric only', () => {
    for (let i = 0; i < 20; i++) {
      expect(lrGenId()).toMatch(/^[a-z0-9]+$/);
    }
  });

  test('ID length is sufficient (> 10 chars)', () => {
    expect(lrGenId().length).toBeGreaterThan(10);
  });
});

describe('settings.js — Vocabulary CRUD', () => {
  beforeEach(clearStorage);

  test('lrLoadVocab returns [] when empty', (done) => {
    lrLoadVocab((vocab) => {
      expect(vocab).toEqual([]);
      done();
    });
  });

  test('lrSaveVocab and lrLoadVocab round-trip', (done) => {
    const vocab = [{ id: 'a1', word: 'hola', translation: 'hello', sentence: 'Hola mundo', date: '2026-04-17' }];
    lrSaveVocab(vocab, () => {
      lrLoadVocab((loaded) => {
        expect(loaded).toEqual(vocab);
        done();
      });
    });
  });

  test('lrAddWord prepends new entry', (done) => {
    lrSaveVocab([{ id: 'x', word: 'existing' }], () => {
      lrAddWord({ id: 'y', word: 'nuevo' }, () => {
        lrLoadVocab((vocab) => {
          expect(vocab[0].word).toBe('nuevo');
          expect(vocab.length).toBe(2);
          done();
        });
      });
    });
  });

  test('lrAddWord auto-generates id if missing', (done) => {
    lrAddWord({ word: 'hello' }, (entry) => {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(5);
      done();
    });
  });

  test('lrRemoveWord filters by id', (done) => {
    const vocab = [{ id: 'a', word: 'one' }, { id: 'b', word: 'two' }, { id: 'c', word: 'three' }];
    lrSaveVocab(vocab, () => {
      lrRemoveWord('b', () => {
        lrLoadVocab((loaded) => {
          expect(loaded.map(w => w.id)).toEqual(['a', 'c']);
          done();
        });
      });
    });
  });

  test('lrRemoveWord ignores non-existent id', (done) => {
    lrSaveVocab([{ id: 'x', word: 'test' }], () => {
      lrRemoveWord('nonexistent', () => {
        lrLoadVocab((loaded) => {
          expect(loaded.length).toBe(1);
          done();
        });
      });
    });
  });

  test('lrClearVocab empties storage', (done) => {
    lrSaveVocab([{ id: '1', word: 'uno' }, { id: '2', word: 'dos' }], () => {
      lrClearVocab(() => {
        lrLoadVocab((loaded) => {
          expect(loaded.length).toBe(0);
          done();
        });
      });
    });
  });

  test('100-entry vocabulary round-trips correctly', (done) => {
    const bigVocab = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`, word: `word-${i}`, translation: `t-${i}`,
      sentence: '', videoUrl: '', timestamp: '', date: '2026-04-17'
    }));
    lrSaveVocab(bigVocab, () => {
      lrLoadVocab((loaded) => {
        expect(loaded.length).toBe(100);
        expect(loaded[50].word).toBe('word-50');
        done();
      });
    });
  });

  test('vocabulary persists through chained operations', (done) => {
    lrSaveVocab([], () => {
      lrAddWord({ id: '1', word: 'hello' }, () => {
        lrAddWord({ id: '2', word: 'goodbye' }, () => {
          lrRemoveWord('1', () => {
            lrLoadVocab((vocab) => {
              expect(vocab.map(w => w.word)).toEqual(['goodbye']);
              done();
            });
          });
        });
      });
    });
  });
});

describe('settings.js — lrLoadCache / lrSaveCache', () => {
  beforeEach(clearStorage);

  test('lrLoadCache returns empty object when empty', (done) => {
    lrLoadCache((cache) => {
      expect(cache).toEqual({});
      done();
    });
  });

  test('lrSaveCache persists cache', (done) => {
    const cache = { 'es|en|hola': 'hello', 'de|en|danke': 'thanks' };
    lrSaveCache(cache, () => {
      lrLoadCache((loaded) => {
        expect(loaded['es|en|hola']).toBe('hello');
        expect(loaded['de|en|danke']).toBe('thanks');
        done();
      });
    });
  });

  test('cache updates incrementally', (done) => {
    lrSaveCache({ 'a': '1' }, () => {
      lrSaveCache({ 'b': '2' }, () => {
        lrLoadCache((cache) => {
          expect(cache['a']).toBe('1'); // should be preserved
          expect(cache['b']).toBe('2');
          done();
        });
      });
    });
  });
});

describe('settings.js — CSV Export', () => {
  beforeEach(clearStorage);

  test('lrExportVocabCSV returns a blob URL', () => {
    const vocab = [{ word: 'test', translation: 'prueba', sentence: '', videoUrl: '', timestamp: '', date: '' }];
    const url = lrExportVocabCSV(vocab);
    expect(url.startsWith('blob:')).toBe(true);
  });

  test('empty vocabulary exports without error', () => {
    expect(() => lrExportVocabCSV([])).not.toThrow();
  });

  test('sentence with commas and quotes does not throw', () => {
    const vocab = [{ word: 'say', translation: 'decir', sentence: 'He said, "hello, world!"', videoUrl: '', timestamp: '', date: '' }];
    expect(() => lrExportVocabCSV(vocab)).not.toThrow();
  });

  test('unicode words export without error', () => {
    const vocab = [
      { word: '日本語', translation: 'Japanese', sentence: '', videoUrl: '', timestamp: '', date: '' },
      { word: 'Привет', translation: 'Hello', sentence: '', videoUrl: '', timestamp: '', date: '' },
      { word: '🎉', translation: 'party popper', sentence: '', videoUrl: '', timestamp: '', date: '' }
    ];
    expect(() => lrExportVocabCSV(vocab)).not.toThrow();
  });

  test('all fields included in export of multi-entry vocab', () => {
    const vocab = [{
      word: 'viaje', translation: 'trip', sentence: 'El viaje a España',
      videoUrl: 'https://youtube.com/watch?v=abc', timestamp: '2:34', date: '2026-04-17'
    }];
    expect(() => lrExportVocabCSV(vocab)).not.toThrow();
    const url = lrExportVocabCSV(vocab);
    expect(url.startsWith('blob:')).toBe(true);
  });
});
