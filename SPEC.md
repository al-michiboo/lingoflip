# LingoFlip — Firefox Web Extension

## 1. Project Overview

**Type:** Firefox Web Extension (Manifest V2 — MV2)
**Summary:** A language learning companion that displays dual subtitles on streaming video platforms, saves vocabulary, and provides one-click translations. Inspired by LingoFlip (formerly Language Learning with YouTube).
**Target Users:** Language learners watching foreign-language video content.

---

## 2. Feature Specification

### 2.1 Dual Subtitles
- Inject a subtitle display panel overlay onto video player pages.
- Show **L1 (native language)** and **L2 (learning language)** subtitles simultaneously.
- Subtitle panel is draggable, resizable, and collapsible.
- Configurable font size, font family, background opacity, and position (top/bottom).

### 2.2 Video Platform Support (inject on these domains)
- YouTube (`youtube.com`, `youtu.be`)
- Netflix (`netflix.com`)
- OpenSubtitles / OpenEDU domains
- Custom URL pattern support via settings

### 2.3 Vocabulary Builder
- Click any word in L2 subtitles to:
  - Instantly show translation popup (primary language → learning language)
  - Save word + translation + sentence context + timestamp + video URL to local storage.
- Vocabulary list panel (toggleable) showing all saved words.
- Export vocabulary to CSV.
- Delete individual words or clear all.

### 2.4 Translation Service
- Use a free API for translations (LibreTranslate or MyMemory API — no API key required).
- Cache translations in localStorage to avoid repeated API calls.
- Graceful fallback if API is unavailable (show "translation unavailable").

### 2.5 Settings Panel
- Learning language (L2) and native language (L1) pickers.
- Subtitle style customization (color, size, bg opacity, position).
- Enable/disable per site.
- Import/Export extension settings.

### 2.6 Popup UI
- Browser-action popup with:
  - Toggle extension on/off for current site.
  - Current L1 / L2 language display.
  - Quick link to vocabulary list.
  - Quick link to settings.

### 2.7 Context Menu
- Right-click menu item: "Look up selected text" → opens translation popup.

---

## 3. Technical Specification

### 3.1 Manifest V2 (Firefox MV2)
```json
{
  "manifest_version": 2,
  "name": "LingoFlip",
  "version": "1.0.0",
  "description": "Learn languages from streaming videos with dual subtitles and vocabulary builder",
  "permissions": ["activeTab", "storage", "contextMenus", "webNavigation"],
  "host_permissions": ["*://*.youtube.com/*", "*://*.netflix.com/*"],
  "background": { "scripts": ["background.js"], "persistent": false },
  "content_scripts": [
    { "matches": ["*://*.youtube.com/*", "*://*.netflix.com/*"], "js": ["content.js"], "css": ["content.css"], "run_at": "document_end" }
  ],
  "browser_action": { "default_popup": "popup.html", "default_icon": "icons/icon.svg" },
  "icons": { "48": "icons/icon.svg" }
}
```

### 3.2 Files
```
lingoflip-ext/
├── manifest.json
├── background.js        # Handles context menus, storage, translation API calls
├── content.js           # Injected into video pages — subtitle parsing & display
├── content.css          # Styles for subtitle panel and popup
├── popup.html           # Browser action popup
├── popup.js             # Popup logic
├── settings.js          # Shared settings storage helpers
├── icons/
│   └── icon.svg
├── locales/
│   └── en/
│       └── messages.json
├── tests/
│   ├── test-background.js
│   ├── test-content.js
│   └── test-vocabulary.js
└── README.md
```

### 3.3 Translation API
- Endpoint: `https://api.mymemory.translated.net/get?q={text}&langpair={L2}|{L1}`
- Free, no API key required. Rate limit: 1000 req/day.
- Fallback: return error string if rate limited.

### 3.4 Content Script — Subtitle Detection
- **YouTube:** Parse `ytd-player-py-flux` tracks → pull active `innerText` from `.ytp-caption-segment-inner` elements. Watch for `caption-window` mutations via MutationObserver.
- **Netflix:** Parse `netflix-video` player tracks → pull text from Netflix's caption display elements (`[data-purpose="subtitle"]`).
- Generic fallback: scan page for visible text matching subtitle patterns.

### 3.5 Storage Schema
```js
// localStorage keys:
"lr_vocabulary"  → Array<{ id, word, translation, sentence, timestamp, videoUrl, date }>
"lr_settings"   → { L1, L2, fontSize, fontColor, bgOpacity, position, enabledSites }
"lr_cache"      → Object<wordKey, translation>  // translation cache
```

---

## 4. Testing Requirements

### 4.1 Unit Tests (jest or mocha)
- `test-background.js` — translation API response parsing, storage helpers.
- `test-content.js` — subtitle text extraction logic (mock DOM).
- `test-vocabulary.js` — CRUD operations on vocabulary store.

### 4.2 Manual QA Checklist
- [ ] Install extension in Firefox (temporary load)
- [ ] YouTube: dual subtitles appear and are draggable
- [ ] Netflix: subtitles visible (if account has captions)
- [ ] Click word → translation popup appears
- [ ] Save word → appears in vocabulary panel
- [ ] Export CSV → valid file with correct data
- [ ] Settings change → persists after reload
- [ ] Popup → shows correct status and language pair
- [ ] Context menu → "Look up selected text" → works on any page

### 4.3 Test Commands
```bash
npm install   # install test deps
npm test      # run jest tests
```

---

## 5. GitHub Integration
- Initialize git repo at `/workspace/lingoflip-ext`
- Push to GitHub: user creates a repo, then add remote and push.
- Note: Extension ID will change after signing — mention this in README.

---

## 6. Acceptance Criteria
- Extension loads in Firefox without errors.
- YouTube dual subtitles functional.
- Word-click translation works.
- Vocabulary save/export works.
- Settings persist correctly.
- Tests pass with >80% coverage on core logic.
- README has clear installation and development instructions.
