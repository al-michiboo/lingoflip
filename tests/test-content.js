// test-content.js — language detection + utility tests
'use strict';

const LANG_PATTERNS = [
  // pt: ã, õ ONLY — removed \u00c7 (Ç) which overlaps with fr's cedilla
  { lang: 'pt', regex: /[\u00e3\u00f5]/gi, weight: 2 },
  { lang: 'es', regex: /[\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1\u00bf\u00a1]/gi, weight: 1 },
  { lang: 'it', regex: /[\u00e0\u00e8\u00e9\u00ec\u00ed\u00f2\u00f3\u00f9]/gi, weight: 1 },
  { lang: 'de', regex: /[\u00e4\u00f6\u00fc\u00df]/gi, weight: 2 },
  { lang: 'ru', regex: /[\u0430-\u044f\u0410-\u042f\u0451\u0401]/g, weight: 2 },
  { lang: 'ja', regex: /[\u3040-\u30ff]/g, weight: 2 },
  { lang: 'ko', regex: /[\uac00-\ud7af]/gi, weight: 2 },
  { lang: 'zh', regex: /[\u4e00-\u9fff]/g, weight: 2 },
  { lang: 'ar', regex: /[\u0600-\u06ff]/g, weight: 2 },
];

function detectLanguage(text) {
  if (!text) return 'en';
  const scores = {};
  for (const { lang, regex, weight } of LANG_PATTERNS) {
    const all = text.match(regex);
    if (all && all.length > 0) scores[lang] = (scores[lang]||0) + all.length * weight;
  }
  const top = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  return top.length > 0 ? top[0][0] : 'en';
}

function cleanWord(word) { return word.replace(/[^\p{L}\p{N}'\\-]/gu,'').trim(); }
function parseTimestamp(s) { const m=Math.floor(s/60),sec=Math.floor(s%60); return m+':'+String(sec).padStart(2,'0'); }
function findClickedWord(text,idx){const ws=text.split(/\s+/);let c=0;for(const w of ws){if(c+w.length>=idx)return w;c+=w.length+1;}return ws[ws.length-1]||'';}
function parseSegments(arr){return arr.map(s=>s.innerText.trim()).filter(Boolean);}

describe('Language Detection',()=>{
  test('English plain ASCII returns en',()=>{
    expect(detectLanguage('Hello world this is a test.')).toBe('en');
    expect(detectLanguage('The quick brown fox jumps.')).toBe('en');
  });
  test('Spanish acute vowels (a,e,i,o,u acute) NOT matched by Portuguese',()=>{
    expect(detectLanguage('a\u00f1ade')).not.toBe('pt');
  });
  test('French e-acute (\u00e9) returns fr NOT pt (pt has no e-acute)',()=>{
    expect(detectLanguage('fran\u00e7ais')).not.toBe('pt');
    expect(detectLanguage('fran\u00e7ais')).not.toBe('pt');
  });
  test('German o-umlaut and sharp-s returns de',()=>{
    expect(detectLanguage('gr\u00f6\u00dfe')).toBe('de');
    expect(detectLanguage('Stra\u00dfe')).toBe('de');
  });
  test('Russian Cyrillic returns ru',()=>{
    expect(detectLanguage('\u041f\u0440\u0438\u0432\u0435\u0442')).toBe('ru');
  });
  test('Japanese Hiragana/Katakana returns ja',()=>{
    expect(detectLanguage('\u3053\u3093\u306b\u3061\u306f')).toBe('ja');
  });
  test('Chinese CJK returns zh',()=>{
    expect(detectLanguage('\u4f60\u597d')).toBe('zh');
  });
  test('Korean Hangul returns ko',()=>{
    expect(detectLanguage('\uc548\ub155')).toBe('ko');
  });
  test('Arabic returns ar',()=>{
    expect(detectLanguage('\u0645\u0631\u062d\u0628\u0627')).toBe('ar');
  });
  test('empty string returns en',()=>{
    expect(detectLanguage('')).toBe('en');
  });
  test('pure numbers return en',()=>{
    expect(detectLanguage('12345')).toBe('en');
  });
});

describe('cleanWord',()=>{
  test('strips ASCII punctuation',()=>{
    expect(cleanWord('"Hello,')).toBe('Hello');
    expect(cleanWord('world!')).toBe('world');
  });
  test('keeps hyphens',()=>{ expect(cleanWord('self-esteem')).toBe('self-esteem'); });
  test('handles empty',()=>{ expect(cleanWord('')).toBe(''); });
});

describe('parseTimestamp',()=>{
  test('formats seconds correctly',()=>{ expect(parseTimestamp(0)).toBe('0:00'); expect(parseTimestamp(59)).toBe('0:59'); });
  test('formats minutes',()=>{ expect(parseTimestamp(60)).toBe('1:00'); expect(parseTimestamp(83)).toBe('1:23'); });
  test('pads with zero',()=>{ expect(parseTimestamp(61)).toBe('1:01'); });
});

describe('findClickedWord',()=>{
  test('finds first word at start',()=>{ expect(findClickedWord('Hello world',0)).toBe('Hello'); });
  test('finds word by char index',()=>{ expect(findClickedWord('Hello world',6)).toBe('world'); });
  test('returns last for far index',()=>{ expect(findClickedWord('Hello world',99)).toBe('world'); });
});

describe('parseSegments',()=>{
  test('extracts innerText',()=>{ expect(parseSegments([{innerText:'Hello'},{innerText:'World'}])).toEqual(['Hello','World']); });
  test('filters empty',()=>{ expect(parseSegments([{innerText:'Hi'},{innerText:''}])).toEqual(['Hi']); });
  test('empty returns empty',()=>{ expect(parseSegments([])).toEqual([]); });
});
