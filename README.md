<div align="center">
  <img src="icons/icon128.png" alt="PolyLingo logo" width="112" height="112">
  <h1>PolyLingo</h1>
  <p><strong>Dual subtitles for focused language learning on YouTube.</strong></p>
  <p>Learn from real video content with synchronized subtitles, transcript search, scene navigation, and a distraction-free reading mode.</p>

  <p>
    <a href="https://developer.chrome.com/docs/extensions/develop/concepts/manifest"><img src="https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extension Manifest V3"></a>
    <a href="https://www.youtube.com/"><img src="https://img.shields.io/badge/Platform-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube"></a>
    <img src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111827" alt="JavaScript">
    <img src="https://img.shields.io/badge/Privacy-No%20Tracking-38D6C0?style=for-the-badge&logo=shield&logoColor=white" alt="No tracking">
  </p>
</div>

![PolyLingo interface preview](https://private-us-east-1.manuscdn.com/sessionFile/QmV7Hdc0oj22H6xmogHtTu/sandbox/CiFOw1v6whc8yTEIfmDe1r-images_1795584372275_na1fn_L2hvbWUvdWJ1bnR1L1BvbHlMaW5nby0wLjAuMC9kb2NzL3BvbHlsaW5nby1wcmV2aWV3.svg?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvUW1WN0hkYzBvajIySDZ4bW9nSHRUdS9zYW5kYm94L0NpRk93MXY2d2hjOHlURUlmbURlMXItaW1hZ2VzXzE3OTU1ODQzNzIyNzVfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwxQnZiSGxNYVc1bmJ5MHdMakF1TUM5a2IyTnpMM0J2Ykhsc2FXNW5ieTF3Y21WMmFXVjMuc3ZnIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk3MjkyODAwfX19XX0_&Key-Pair-Id=K2QY5QTL8JSY6C&Signature=MEUCIQCBH6u9P9fxLQdQxcyIMXov8EOUfLRkFllkfNCfJaJ0qwIgL~~Q~W7lz7hY3SZ30t7c7vLojVve7-Sr3v3wI9OZTrQ_)

## Overview

PolyLingo is a lightweight Chrome extension designed for people who want to turn YouTube into a practical language-learning environment. It displays two subtitle languages together, keeps them synchronized with the video, and adds tools for deliberate practice without leaving the player.

The extension is intentionally private and focused: it runs on YouTube pages, stores preferences in Chrome storage, and does not include analytics, tracking, or a remote application backend.

> **Current release:** `0.0.0`  
> **Minimum Chrome version:** `117`

## Why PolyLingo?

Watching videos is useful for language learning, but switching between translations, replaying sentences, and searching transcripts can interrupt the learning flow. PolyLingo brings those actions into one consistent interface:

- See primary and secondary subtitles at the same time.
- Adjust subtitle appearance, position, timing, and language direction.
- Practice one sentence at a time in **Focus Reading** mode.
- Move through a video scene by scene with keyboard shortcuts.
- Search transcripts with Unicode-aware matching across accents, Arabic diacritics, tatweel, alef variants, and German `ß`/`ss` equivalence.
- Drag subtitle placement and preserve layout preferences.

## Key features

### Dual subtitles

Display a primary and secondary subtitle line over YouTube videos. Each language has its own style, including font family, size, weight, color, outline, alignment, line height, and text direction. Independent timing offsets help compensate for subtitle-track differences.

### Focus Reading

Open a dedicated reading surface for sentence-by-sentence practice. Focus Reading supports:

- Both-language, primary-only, secondary-only, and recall views.
- Optional hiding of the target line for active recall.
- Auto-pause while working through a sentence.
- Font scaling and panel-side selection.
- A lightweight mode and a drag lock for a calmer workspace.
- Customizable, conflict-aware keyboard shortcuts.

### Transcript search

Search the loaded transcript and jump directly to matching scenes. PolyLingo normalizes case and combining marks while preserving a map back to the original text, so matches can be highlighted accurately without altering the displayed subtitles.

### Scene navigation and replay

Use scene controls to move to the previous scene, next scene, or repeat the current scene. Built-in shortcuts make repetitive listening and shadowing practice quick and predictable.

### Subtitle controls

PolyLingo includes draggable subtitles, configurable line spacing and width, primary/secondary timing offsets, track caching, and an automatic pause option for focused practice.

### Keyboard shortcuts

The extension registers browser-level commands and Focus Reading shortcuts. The defaults are designed to complement YouTube's own controls and avoid reserved YouTube keys.

| Action | Default shortcut |
| --- | --- |
| Toggle Focus Reading | `Alt+Shift+F` |
| Previous scene | `Alt+Shift+A` |
| Next scene | `Alt+Shift+D` |
| Repeat current scene | `Alt+Shift+S` |
| Cycle Focus Reading view | `V` |
| Reveal / recall control | `W` |
| Toggle auto-pause | `P` |
| Save sentence | `B` |
| Search transcript | `/` |
| Increase / decrease font | `]` / `[` |

Shortcuts can be customized in the extension settings, subject to validation against YouTube's reserved keys and duplicate assignments.

## Interface preview

The visual below summarizes the extension's core experience: a YouTube-style player with synchronized dual subtitles and a Focus Reading panel for deliberate practice.

![Dual subtitles and Focus Reading preview](https://private-us-east-1.manuscdn.com/sessionFile/QmV7Hdc0oj22H6xmogHtTu/sandbox/CiFOw1v6whc8yTEIfmDe1r-images_1795584372275_na1fn_L2hvbWUvdWJ1bnR1L1BvbHlMaW5nby0wLjAuMC9kb2NzL3BvbHlsaW5nby1wcmV2aWV3.svg?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvUW1WN0hkYzBvajIySDZ4bW9nSHRUdS9zYW5kYm94L0NpRk93MXY2d2hjOHlURUlmbURlMXItaW1hZ2VzXzE3OTU1ODQzNzIyNzVfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwxQnZiSGxNYVc1bmJ5MHdMakF1TUM5a2IyTnpMM0J2Ykhsc2FXNW5ieTF3Y21WMmFXVjMuc3ZnIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk3MjkyODAwfX19XX0_&Key-Pair-Id=K2QY5QTL8JSY6C&Signature=MEUCIQCBH6u9P9fxLQdQxcyIMXov8EOUfLRkFllkfNCfJaJ0qwIgL~~Q~W7lz7hY3SZ30t7c7vLojVve7-Sr3v3wI9OZTrQ_)

The extension branding is available in multiple Chrome icon sizes:

<p>
  <img src="icons/icon16.png" alt="PolyLingo 16px icon" width="32" height="32">
  <img src="icons/icon32.png" alt="PolyLingo 32px icon" width="48" height="48">
  <img src="icons/icon48.png" alt="PolyLingo 48px icon" width="64" height="64">
  <img src="icons/icon128.png" alt="PolyLingo 128px icon" width="96" height="96">
</p>

## Technology stack

<div align="center">
  <img src="https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111827" alt="JavaScript">
  <img src="https://img.shields.io/badge/HTML5-Extension%20UI-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-Responsive%20UI-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/Chrome%20Extensions-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extensions">
  <img src="https://img.shields.io/badge/Web%20Storage-Sync%20%26%20Local-7C3AED?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Chrome storage">
  <img src="https://img.shields.io/badge/YouTube-Content%20Integration-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube integration">
</div>

### Architectural building blocks

- **Manifest V3:** declares the action popup, options page, service worker, content scripts, commands, icons, and the minimal `storage` permission.
- **Service worker:** initializes default settings and forwards browser command events to the active YouTube tab.
- **Main-world bridge:** integrates with the YouTube page at `document_start` where page-level interaction is required.
- **Content-script feature modules:** implement timeline synchronization, layout persistence, scene controls, Focus Reading, transcript search, auto-pause, track caching, the reading panel, and subtitle dragging.
- **Chrome Storage API:** persists synchronized general settings and local Focus Reading preferences.
- **Plain JavaScript modules:** feature modules expose small, testable APIs and can run in both extension and CommonJS-style test environments where applicable.

## Project structure

```text
PolyLingo/
├── manifest.json             # Manifest V3 configuration
├── service-worker.js          # Defaults and browser command forwarding
├── main-world.js              # YouTube page integration bridge
├── content.js                 # Main content-script coordinator
├── popup/
│   └── popup.html             # Toolbar popup entry point
├── options/
│   └── options.html           # Full settings entry point
├── features/
│   ├── auto-pause.js
│   ├── focus-dock.js
│   ├── focus-prefs.js
│   ├── layout-store.js
│   ├── reading-panel.js
│   ├── scene-controls.js
│   ├── scene-timeline.js
│   ├── subtitle-dragger.js
│   ├── track-cache.js
│   ├── transcript-search.js
│   └── virtual-list.js
├── assets/                    # Bundled UI JavaScript and CSS
├── icons/                     # 16, 32, 48, and 128px extension icons
└── docs/
    └── polylingo-preview.svg  # README interface illustration
```

## Installation for development

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or a Chromium-based browser.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the PolyLingo project directory—the directory containing `manifest.json`.
6. Open a YouTube video that provides captions.
7. Open the PolyLingo toolbar popup and enable dual subtitles.

PolyLingo is distributed as an unpacked extension in this source package. The repository already contains the bundled UI assets referenced by `popup/popup.html` and `options/options.html`; no package manager is required for a basic load-unpacked installation.

## Usage

1. Turn on captions in the YouTube player.
2. Open the PolyLingo popup and select the primary and secondary languages available for the video.
3. Adjust subtitle styling, placement, and timing from the options page.
4. Use **Focus Reading** to practice one sentence at a time.
5. Use scene shortcuts to go backward, forward, or replay the current sentence.
6. Search the transcript when you want to revisit a phrase or vocabulary item.

If YouTube does not provide captions for the selected language, PolyLingo cannot generate a track by itself; choose another available language or enable captions for the video.

## Privacy and permissions

PolyLingo is designed to keep the permission surface small:

- **Host scope:** content scripts target `https://www.youtube.com/*` only.
- **Permission:** the manifest requests `storage` for preferences and learning state.
- **No tracking:** there is no analytics SDK, advertising code, telemetry, or user account system in this source package.
- **Local-first preferences:** general settings use Chrome synchronized storage, while Focus Reading preferences use local storage.

Always review the source and the final packaged extension before publishing to an extension store.

## Development notes

The codebase separates page integration from feature modules so individual behaviors can be maintained independently. Feature modules are loaded before `content.js`, which validates that the required APIs are available before starting the main coordinator.

When changing the manifest or content-script order, preserve the dependency order defined in `manifest.json`. In particular, feature modules must be available before `content.js` starts.

## Roadmap ideas

Potential future improvements include richer vocabulary review, exportable study sessions, more granular subtitle-track diagnostics, automated tests for additional script systems, and optional packaging/release automation.

## Contributing

Contributions are welcome. For a focused pull request:

1. Create a feature branch.
2. Keep changes scoped to one behavior or UI area.
3. Preserve the minimal permission model.
4. Test on YouTube videos with different caption languages and subtitle availability.
5. Document user-facing changes and keyboard-shortcut changes.
6. Open a pull request with a clear description and testing notes.

## License

No license file is included in the source archive. Add an explicit `LICENSE` file before distributing PolyLingo publicly or accepting external contributions.

---

<div align="center">
  <strong>PolyLingo — Learn languages through the videos you already watch.</strong>
</div>
