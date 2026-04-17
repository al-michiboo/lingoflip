# 🌐 LingoFlip — Firefox Extension

> Dual subtitles, one-click word lookup, and vocabulary building — for YouTube, Netflix, and more.

![Manifest v2](https://img.shields.io/badge/manifest-2-blue)
![Firefox](https://img.shields.io/badge/Firefox-120%2B-orange)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

### 🎯 Dual Subtitles
- Displays **L1 (native)** and **L2 (learning language)** subtitles simultaneously
- Panel is **draggable**, collapsible, and fully styled via settings
- Works on **YouTube**, **Netflix**, Udemy, and Babbel (configurable)

### 📚 Vocabulary Builder
- Click **any word** in the subtitle panel to instantly translate it
- Saves word + translation + sentence context + video URL + timestamp
- View, manage, and **export your vocabulary to CSV**

### ⚡ Translation
- Powered by the free **MyMemory API** (no API key needed)
- Built-in translation **cache** to avoid redundant API calls
- Fallback gracefully if the service is unavailable

### ⚙️ Customizable
- Font size, subtitle color, background opacity
- Top or bottom position
- Per-site enable/disable (YouTube, Netflix, Udemy, Babbel)
- Import/Export settings

### 🖱️ Right-Click Lookup
- Select any text on any page → "Look up with LingoFlip"
- Opens the translation popup directly in context

---

## 🔧 Installation (Developer / Temporary)

Since this extension is not yet submitted to AMO, you can load it temporarily:

1. Open Firefox
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Browse to and select the `manifest.json` file in this directory
5. The extension loads — click the toolbar icon to get started

> **Note:** Temporary add-ons are removed when Firefox closes. For persistence, you need to sign the extension at [addons.mozilla.org](https://addons.mozilla.org).

---

## 🔧 Installation (Signed / Production)

1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lingoflip.git
   cd lingoflip
   ```
2. Sign the extension at [addons.mozilla.org](https://addons.mozilla.org/developers/)
3. Download the `.xpi` after approval
4. Install in Firefox

---

## 🧪 Running Tests

```bash
npm install
npm test
```

Coverage report will be printed to stdout. Target: >60% on all metrics.

---

## 📁 File Structure

```
lingoflip/
├── manifest.json        # Extension manifest (MV2)
├── background.js         # Service worker — menus, storage, API proxy
├── content.js            # Injected into video pages
├── content.css           # Styles for all UI panels
├── popup.html/js         # Browser action popup
├── settings.js           # Shared settings helpers (also used by content)
├── icons/
│   └── icon.svg          # Extension icon
├── _locales/
│   └── en/messages.json  # i18n strings
├── tests/
│   ├── test-background.js
│   ├── test-content.js
│   └── test-vocabulary.js
├── SPEC.md               # Full feature specification
└── README.md
```

---

## 🔑 Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access current tab for settings and vocab toggling |
| `storage` | Persist settings, vocabulary, and translation cache |
| `contextMenus` | Right-click "Look up with LingoFlip" |
| `webNavigation` | Detect page transitions on supported sites |
| `*://*.youtube.com/*` etc. | Content script injection on video sites |
| `https://api.mymemory.translated.net/*` | Free translation API calls |

---

## 🌍 Supported Languages

English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese, Arabic, Dutch, Polish, Swedish, Turkish, Hindi.

---

## 🚀 Development

```bash
# Watch tests
npm run test:watch

# Re-sign when editing:
# 1. zip -r lingoflip.zip manifest.json background.js content.js content.css popup.html popup.js settings.js icons/ _locales/
# 2. Upload at https://addons.mozilla.org/developers/
```

---

## 📝 License

MIT — use freely, modify, redistribute.

---

## 🤝 Contributing

Pull requests welcome! Please run `npm test` before submitting. See `SPEC.md` for feature design notes.
