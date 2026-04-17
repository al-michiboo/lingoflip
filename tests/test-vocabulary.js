/**
 * test-vocabulary.js — vocabulary CRUD logic tests
 */

const vocabStore = [];
function lrGenId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
function lrAddWord(entry) {
  const rec = { id: lrGenId(), ...entry, date: new Date().toISOString().split('T')[0] };
  vocabStore.unshift(rec);
  return rec;
}
function lrRemoveWord(id) {
  const idx = vocabStore.findIndex(w => w.id === id);
  if (idx !== -1) vocabStore.splice(idx, 1);
}
function lrClearVocab() { vocabStore.length = 0; }

beforeEach(() => { vocabStore.length = 0; });

describe('lrAddWord', () => {
  it('adds a word with auto-generated id', () => {
    const word = lrAddWord({ word: 'gato', translation: 'cat', sentence: 'El gato', videoUrl: 'https://yt.com', timestamp: '0:05' });
    expect(word.id).toBeDefined();
    expect(word.id.length).toBeGreaterThan(5);
    expect(word.word).toBe('gato');
    expect(word.translation).toBe('cat');
    expect(word.date).toBeDefined();
  });
  it('prepends to list (newest first)', () => {
    lrAddWord({ word: 'uno', translation: 'one' });
    lrAddWord({ word: 'dos', translation: 'two' });
    expect(vocabStore[0].word).toBe('dos');
    expect(vocabStore[1].word).toBe('uno');
  });
});

describe('lrRemoveWord', () => {
  it('removes word by id', () => {
    const w = lrAddWord({ word: 'test', translation: 'test' });
    expect(vocabStore.length).toBe(1);
    lrRemoveWord(w.id);
    expect(vocabStore.length).toBe(0);
  });
  it('handles non-existent id gracefully', () => {
    expect(() => lrRemoveWord('nonexistent')).not.toThrow();
  });
});

describe('lrClearVocab', () => {
  it('empties the vocabulary', () => {
    lrAddWord({ word: 'a', translation: 'a' });
    lrAddWord({ word: 'b', translation: 'b' });
    expect(vocabStore.length).toBe(2);
    lrClearVocab();
    expect(vocabStore.length).toBe(0);
  });
});

describe('ID generation', () => {
  it('generates unique ids', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(lrGenId());
    expect(ids.size).toBe(100);
  });
});
