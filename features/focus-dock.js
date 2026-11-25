/**
 * Focus-reading control dock — PolyLingo 0.6
 *
 * The control stack under the video in Focus reading (modelled on the reference screenshots):
 *   search box · display-mode chips (RECALL / BOTH / <L1> / <L2>) · icon toolbar ·
 *   scrubber with times · transport (previous, back 10 s, play, forward 10 s, next, speed) · scene counter
 * plus a settings popover (panel side, recall behaviour, auto-pause, lite mode, drag lock,
 * subtitle cache, and remappable shortcuts).
 *
 * The dock owns no playback logic: it calls the callbacks it is given and shows what it is told.
 * Built with DOM APIs only (no innerHTML). Key presses typed inside it never reach YouTube's hotkeys.
 */
(function (root, factory) {
  const api = factory(typeof require === 'function' && typeof module === 'object' ? require : null);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PolyLingoFeatures = Object.assign(root.PolyLingoFeatures || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (nodeRequire) {
  'use strict';

  const features = nodeRequire
    ? { ...nodeRequire('./scene-timeline.js'), ...nodeRequire('./focus-prefs.js') }
    : globalThis.PolyLingoFeatures;
  const { formatClock, keyLabel, validateKeyAssignment, FOCUS_KEY_ACTIONS, FOCUS_DEFAULT_KEYS, FONT_MIN, FONT_MAX } = features;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const SEEK_STEPS = 1000;

  /** [tag, attributes] — `data-fill` shapes use currentColor as fill; `text` makes an SVG <text>. */
  const ICONS = {
    search: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l4.5 4.5' }]],
    close: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
    up: [['path', { d: 'M6 14.5l6-6 6 6' }]],
    down: [['path', { d: 'M6 9.5l6 6 6-6' }]],
    settings: [
      ['path', { d: 'M4 7h7M19 7h1M4 17h1M13 17h7' }],
      ['circle', { cx: 15, cy: 7, r: 2.6 }],
      ['circle', { cx: 9, cy: 17, r: 2.6 }],
    ],
    copy: [['rect', { x: 9, y: 9, width: 11, height: 11, rx: 2 }], ['path', { d: 'M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5' }]],
    loop: [['path', { d: 'M17 3l3 3-3 3' }], ['path', { d: 'M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20' }], ['path', { d: 'M7 21l-3-3 3-3' }], ['path', { d: 'M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4' }]],
    clock: [['circle', { cx: 12, cy: 12, r: 8.5 }], ['path', { d: 'M12 7v5.2l3.2 2' }]],
    swap: [['path', { d: 'M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4' }]],
    star: [['path', { d: 'M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.1l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z' }]],
    pauseCircle: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M10 9v6M14 9v6' }]],
    eye: [['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }], ['circle', { cx: 12, cy: 12, r: 2.8 }]],
    play: [['path', { d: 'M7.5 4.8v14.4L19 12z', 'data-fill': '' }]],
    pause: [['path', { d: 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z', 'data-fill': '' }]],
    back10: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5' }], ['path', { d: 'M4 4.5V9h4.5' }], ['text', { x: 12, y: 15.2, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 700, 'data-fill': '', text: '10' }]],
    forward10: [['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.4-5.5' }], ['path', { d: 'M20 4.5V9h-4.5' }], ['text', { x: 12, y: 15.2, 'text-anchor': 'middle', 'font-size': 7.5, 'font-weight': 700, 'data-fill': '', text: '10' }]],
    previous: [['path', { d: 'M6 5v14' }], ['path', { d: 'M19 6.5 9.5 12l9.5 5.5z', 'data-fill': '' }]],
    next: [['path', { d: 'M18 5v14' }], ['path', { d: 'M5 6.5 14.5 12 5 17.5z', 'data-fill': '' }]],
  };

  const STRINGS = {
    en: {
      region: 'Playback controls',
      search: 'Search transcript…',
      searchLabel: 'Search the transcript',
      clear: 'Clear search',
      prevMatch: 'Previous match',
      nextMatch: 'Next match',
      modes: 'Display mode',
      recall: 'Recall: hide one language until you click it',
      both: 'Show both languages',
      only: (code) => `Show ${code} only`,
      settings: 'Settings',
      copy: 'Copy sentence',
      loop: 'Loop sentence',
      times: 'Show timestamps',
      swap: 'Swap language order',
      bigger: 'Larger text',
      smaller: 'Smaller text',
      save: 'Save sentence',
      autoPause: 'Pause after each sentence',
      reveal: 'Reveal or hide the hidden line',
      play: 'Play',
      pause: 'Pause',
      back10: 'Back 10 seconds',
      forward10: 'Forward 10 seconds',
      speed: 'Playback speed',
      seek: 'Seek',
      previous: 'Previous scene',
      next: 'Next scene',
      settingsTitle: 'Focus reading settings',
      side: 'Panel side',
      left: 'Left',
      right: 'Right',
      recallHides: 'Recall hides',
      first: 'First language',
      second: 'Second language',
      lite: 'Lite mode (no animations, instant scrolling)',
      lockDrag: 'Lock subtitle dragging',
      cacheTracks: 'Remember subtitles on this device',
      clearCache: 'Clear cache',
      cacheCleared: 'Cache cleared.',
      shortcuts: 'Shortcuts',
      pressKey: 'Press a key…',
      resetKeys: 'Reset shortcuts',
      resetPanel: 'Reset panel width',
      keyErrors: { reserved: 'That key belongs to YouTube.', duplicate: 'That key is already used.', invalid: 'Use a letter or one of / [ ] ; \' ` \\' },
      actions: { search: 'Search', cycleView: 'Change display mode', reveal: 'Reveal / hide line', autoPause: 'Auto-pause', save: 'Save sentence', fontBigger: 'Larger text', fontSmaller: 'Smaller text' },
      noMatches: 'No matches',
    },
    ar: {
      region: 'أدوات التحكم بالتشغيل',
      search: 'ابحث في النص...',
      searchLabel: 'البحث في النص',
      clear: 'مسح البحث',
      prevMatch: 'النتيجة السابقة',
      nextMatch: 'النتيجة التالية',
      modes: 'وضع العرض',
      recall: 'استدعاء: إخفاء إحدى اللغتين حتى تضغط عليها',
      both: 'عرض اللغتين',
      only: (code) => `عرض ${code} فقط`,
      settings: 'الإعدادات',
      copy: 'نسخ الجملة',
      loop: 'تكرار الجملة',
      times: 'إظهار الأوقات',
      swap: 'تبديل ترتيب اللغتين',
      bigger: 'تكبير النص',
      smaller: 'تصغير النص',
      save: 'حفظ الجملة',
      autoPause: 'إيقاف مؤقت بعد كل جملة',
      reveal: 'إظهار السطر المخفي أو إخفاؤه',
      play: 'تشغيل',
      pause: 'إيقاف مؤقت',
      back10: 'رجوع 10 ثوانٍ',
      forward10: 'تقديم 10 ثوانٍ',
      speed: 'سرعة التشغيل',
      seek: 'التنقل في الفيديو',
      previous: 'المشهد السابق',
      next: 'المشهد التالي',
      settingsTitle: 'إعدادات القراءة المركّزة',
      side: 'جانب اللوحة',
      left: 'يسار',
      right: 'يمين',
      recallHides: 'الاستدعاء يخفي',
      first: 'اللغة الأولى',
      second: 'اللغة الثانية',
      lite: 'الوضع الخفيف (بلا حركات، تمرير فوري)',
      lockDrag: 'قفل سحب الترجمة',
      cacheTracks: 'تذكّر الترجمات على هذا الجهاز',
      clearCache: 'مسح الذاكرة المؤقتة',
      cacheCleared: 'تم مسح الذاكرة المؤقتة.',
      shortcuts: 'الاختصارات',
      pressKey: 'اضغط مفتاحاً...',
      resetKeys: 'إعادة الاختصارات',
      resetPanel: 'إعادة عرض اللوحة',
      keyErrors: { reserved: 'هذا المفتاح يخص يوتيوب.', duplicate: 'هذا المفتاح مستخدم بالفعل.', invalid: 'استخدم حرفاً أو أحد الرموز / [ ] ; \' ` \\' },
      actions: { search: 'البحث', cycleView: 'تغيير وضع العرض', reveal: 'إظهار / إخفاء السطر', autoPause: 'إيقاف تلقائي', save: 'حفظ الجملة', fontBigger: 'تكبير النص', fontSmaller: 'تصغير النص' },
      noMatches: 'لا نتائج',
    },
  };

  const MESSAGES = {
    en: {
      copied: 'Copied',
      copyFailed: 'Could not copy',
      saved: 'Sentence saved ✓',
      removed: 'Removed from saved sentences',
      saveFailed: 'Could not save.',
      full: 'Storage is full. Export or delete saved items in Settings.',
      noScene: 'No sentence on screen',
      autoPauseOn: 'Auto-pause: on',
      autoPauseOff: 'Auto-pause: off',
    },
    ar: {
      copied: 'تم النسخ',
      copyFailed: 'تعذّر النسخ',
      saved: 'تم حفظ الجملة ✓',
      removed: 'أُزيلت من الجمل المحفوظة',
      saveFailed: 'تعذّر الحفظ.',
      full: 'التخزين ممتلئ. صدّر العناصر المحفوظة أو احذفها من الإعدادات.',
      noScene: 'لا توجد جملة على الشاشة',
      autoPauseOn: 'الإيقاف التلقائي: تشغيل',
      autoPauseOff: 'الإيقاف التلقائي: إيقاف',
    },
  };

  function focusMessages(language) {
    return MESSAGES[language] ?? MESSAGES.en;
  }

  const CSS = `
.dk {
  display: none; position: absolute; bottom: 0; left: var(--pl-split, 42%); width: calc(100% - var(--pl-split, 42%)); z-index: 11;
  box-sizing: border-box; flex-direction: column; gap: .3rem; padding: .45rem .9rem .6rem; pointer-events: auto;
  direction: ltr; color: #eef0f6; font-family: system-ui, "Segoe UI", Tahoma, sans-serif; font-size: 13px;
  background: rgba(8,9,13,.97);
}
.dk::before { content: ""; position: absolute; left: 0; right: 0; bottom: 100%; height: 1.2rem; pointer-events: none; background: linear-gradient(to top, rgba(8,9,13,.97), rgba(8,9,13,0)); }
.dk[data-side="right"] { left: 0; }
.dk[data-open] { display: flex; }
.dk button { font: inherit; color: inherit; }
.dk-row { display: flex; align-items: center; gap: .4rem; min-width: 0; }
.dk-search { height: 32px; padding: 0 .35rem 0 .65rem; border-radius: .75rem; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); }
.dk-search:focus-within { border-color: rgba(45,212,191,.7); box-shadow: 0 0 0 2px rgba(45,212,191,.18); }
.dk-search > svg { flex: none; width: 16px; height: 16px; color: #8d97ad; }
.dk-search > svg, .dk-mini svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.dk-input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
.dk-input::placeholder { color: #7c8397; }
.dk-found { flex: none; font: 600 11px/1 ui-monospace, "IBM Plex Mono", Consolas, monospace; color: #8d97ad; font-variant-numeric: tabular-nums; padding-inline: .25rem; }
.dk-found[data-none] { color: #fda4af; }
.dk-mini { flex: none; width: 26px; height: 26px; padding: 0; display: grid; place-items: center; border-radius: .5rem; border: 0; background: transparent; cursor: pointer; color: #b6bdd0; }
.dk-mini:hover { background: rgba(255,255,255,.12); color: #fff; }
.dk-mini svg { width: 15px; height: 15px; }
.dk-chips { gap: .4rem; flex-wrap: wrap; justify-content: flex-end; }
.dk-chip {
  padding: .24rem .65rem; border-radius: .6rem; cursor: pointer; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04);
  font: 600 11.5px/1.2 ui-monospace, "IBM Plex Mono", Consolas, monospace; letter-spacing: .04em; color: #cbd2e3;
}
.dk-chip::before { content: "[ "; opacity: .55; } .dk-chip::after { content: " ]"; opacity: .55; }
.dk-chip:hover { background: rgba(255,255,255,.1); }
.dk-chip[aria-pressed="true"] { border-color: #2dd4bf; color: #5eead4; background: rgba(45,212,191,.12); }
.dk-tools { gap: .3rem; justify-content: flex-end; flex-wrap: wrap; }
.dk-tool {
  position: relative; min-width: 34px; height: 30px; padding: 0 .4rem; display: inline-grid; place-items: center; cursor: pointer;
  border-radius: .65rem; border: 1px solid transparent; background: transparent; color: #cbd2e3; font-weight: 700;
}
.dk-tool:hover { background: rgba(255,255,255,.1); color: #fff; }
.dk-tool[aria-pressed="true"], .dk-tool[aria-expanded="true"] { background: rgba(45,212,191,.18); color: #5eead4; border-color: rgba(45,212,191,.35); }
.dk-tool[hidden], .dk-chip[hidden] { display: none; }
.dk-tool svg, .dk-play svg, .dk-step svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.dk svg [data-fill] { fill: currentColor; stroke: none; }
.dk-tool[data-saved] svg path { fill: currentColor; }
.dk-seek-row { gap: .6rem; margin-top: .1rem; }
.dk-time { flex: none; min-width: 3.1em; font: 600 11px/1 ui-monospace, "IBM Plex Mono", Consolas, monospace; color: #8d97ad; font-variant-numeric: tabular-nums; text-align: center; }
.dk-seek {
  --dk-p: 0%; flex: 1; min-width: 0; height: 18px; margin: 0; cursor: pointer; appearance: none; background: transparent;
}
.dk-seek::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(to right, #2dd4bf var(--dk-p), rgba(255,255,255,.2) var(--dk-p)); }
.dk-seek::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #2dd4bf; border: 2px solid #0b0c13; box-shadow: 0 0 0 1px rgba(45,212,191,.6); }
.dk-seek:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 3px; border-radius: 4px; }
.dk-transport { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: .5rem; }
.dk-count { font: 600 12px/1 ui-monospace, "IBM Plex Mono", Consolas, monospace; color: #9aa3b8; font-variant-numeric: tabular-nums; justify-self: start; }
.dk-main { display: inline-flex; align-items: center; gap: .35rem; }
.dk-step, .dk-play { display: inline-grid; place-items: center; cursor: pointer; border: 0; background: transparent; color: #eef0f6; border-radius: 50%; }
.dk-step { width: 34px; height: 34px; }
.dk-step:hover { background: rgba(255,255,255,.1); }
.dk-play { width: 42px; height: 42px; }
.dk-play svg { width: 26px; height: 26px; }
.dk-play:hover { background: rgba(255,255,255,.1); }
.dk-step:focus-visible, .dk-play:focus-visible, .dk-tool:focus-visible, .dk-chip:focus-visible, .dk-mini:focus-visible, .dk-speed:focus-visible, .dk-seg button:focus-visible, .dk-key:focus-visible, .dk-ghost:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.dk-speed { justify-self: end; min-width: 3.4em; padding: .3rem .55rem; border-radius: .6rem; cursor: pointer; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.05); font: 700 12px/1 ui-monospace, "IBM Plex Mono", Consolas, monospace; }
.dk-speed:hover { background: rgba(255,255,255,.12); }
.dk-pop {
  display: none; position: absolute; right: .9rem; bottom: calc(100% - 1rem); width: min(340px, calc(100% - 1.8rem)); max-height: min(70vh, 480px); overflow: auto;
  box-sizing: border-box; padding: .8rem .9rem; border-radius: .9rem; background: #12141f; border: 1px solid rgba(255,255,255,.16);
  box-shadow: 0 20px 50px -12px rgba(0,0,0,.75); scrollbar-width: thin;
}
.dk[data-side="right"] .dk-pop { right: auto; left: .9rem; }
.dk-pop[data-open] { display: block; }
.dk-pop h3 { margin: 0 0 .5rem; font-size: 13px; }
.dk-pop h4 { margin: .8rem 0 .35rem; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8d97ad; }
.dk-field { display: flex; align-items: center; justify-content: space-between; gap: .6rem; padding: .3rem 0; }
.dk-field > span { min-width: 0; }
.dk-seg { display: inline-flex; border: 1px solid rgba(255,255,255,.18); border-radius: .55rem; overflow: hidden; flex: none; }
.dk-seg button { padding: .3rem .6rem; border: 0; background: transparent; cursor: pointer; font-size: 12px; }
.dk-seg button[aria-pressed="true"] { background: rgba(45,212,191,.22); color: #5eead4; }
.dk-switch { flex: none; width: 38px; height: 22px; padding: 2px; border-radius: 99px; border: 0; cursor: pointer; background: rgba(255,255,255,.2); display: flex; }
.dk-switch::before { content: ""; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 120ms ease; }
.dk-switch[aria-checked="true"] { background: #2dd4bf; }
.dk-switch[aria-checked="true"]::before { transform: translateX(16px); }
.dk-key { flex: none; min-width: 3.2em; padding: .28rem .55rem; border-radius: .5rem; cursor: pointer; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); font: 700 12px/1 ui-monospace, "IBM Plex Mono", Consolas, monospace; }
.dk-key[data-capturing] { border-color: #facc15; color: #facc15; }
.dk-ghost { padding: .35rem .65rem; border-radius: .55rem; cursor: pointer; border: 1px solid rgba(255,255,255,.2); background: transparent; font-size: 12px; }
.dk-ghost:hover { background: rgba(255,255,255,.1); }
.dk-note { min-height: 1.3em; margin: .4rem 0 0; font-size: 12px; color: #fbbf24; }
.dk-foot { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .6rem; }
.dk[data-lite] *, .dk[data-lite] *::before { transition: none !important; animation: none !important; }
@media (max-width: 700px) { .dk { left: 0; width: 100%; } }
`;

  function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(doc, name) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tag, attributes] of ICONS[name]) {
      const shape = doc.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attributes)) {
        if (key === 'text') shape.textContent = value;
        else shape.setAttribute(key, String(value));
      }
      svg.append(shape);
    }
    return svg;
  }

  function button(doc, className, iconName) {
    const node = el(doc, 'button', className);
    node.type = 'button';
    if (iconName) node.append(icon(doc, iconName));
    return node;
  }

  function stopKeys(node) {
    // Keys typed here must not reach YouTube's hotkeys (k = play, f = fullscreen ...).
    for (const type of ['keydown', 'keyup', 'keypress']) node.addEventListener(type, (event) => event.stopPropagation());
  }

  function speedLabel(rate) {
    return `${Number(rate.toFixed(2))}×`;
  }

  class FocusDock {
    /**
     * @param {Document} doc
     * @param {{onAction:(action:'previous'|'replay'|'next'|'loop')=>void,
     *          onTogglePlay:()=>void, onSkip:(seconds:number)=>void, onSeek:(time:number)=>void, onSpeed:(rate:number)=>void,
     *          onSearch:(query:string)=>void, onSearchStep:(direction:1|-1)=>void, onSearchCommit:()=>void,
     *          onPrefs:(patch:object)=>void, onCopy:()=>void, onSave:()=>void, onReveal:()=>void,
     *          onClearCache:()=>Promise<void>|void, onResetPanel:()=>void,
     *          legacyCodes:()=>string[]}} options
     */
    constructor(doc, options) {
      this.doc = doc;
      this.options = options;
      this.language = 'en';
      this.langCodes = { primary: '', secondary: '' };
      this.prefs = null;
      this.duration = 0;
      this.shownSecond = -1;
      this.rate = 1;
      this.shownRate = 0;
      this.dragging = false;
      this.capturing = null;
      this.searchTimer = undefined;
      this.searchPending = false;
      this.abort = new AbortController();
      this.build();
      this.applyLabels('en', null, this.langCodes);
    }

    get capturingKey() {
      return this.capturing !== null;
    }

    build() {
      const { doc } = this;
      const root = el(doc, 'div', 'dk');
      root.setAttribute('role', 'group');
      this.element = root;

      // search
      const search = el(doc, 'div', 'dk-row dk-search');
      this.input = el(doc, 'input', 'dk-input');
      this.input.type = 'text';
      this.input.autocomplete = 'off';
      this.input.spellcheck = false;
      this.input.enterKeyHint = 'search';
      this.found = el(doc, 'span', 'dk-found');
      this.found.setAttribute('role', 'status');
      this.prevMatch = button(doc, 'dk-mini', 'up');
      this.nextMatch = button(doc, 'dk-mini', 'down');
      this.clearButton = button(doc, 'dk-mini', 'close');
      for (const node of [this.prevMatch, this.nextMatch, this.clearButton]) node.hidden = true;
      search.append(icon(doc, 'search'), this.input, this.found, this.prevMatch, this.nextMatch, this.clearButton);

      // chips
      this.chipsRow = el(doc, 'div', 'dk-row dk-chips');
      this.chipsRow.setAttribute('role', 'group');
      this.chips = {};
      for (const view of ['recall', 'both', 'primary', 'secondary']) {
        const chip = el(doc, 'button', 'dk-chip');
        chip.type = 'button';
        chip.dataset.view = view;
        this.chips[view] = chip;
        this.chipsRow.append(chip);
      }

      // tools
      this.toolsRow = el(doc, 'div', 'dk-row dk-tools');
      this.tools = {};
      const tools = [['settings', 'settings'], ['copy', 'copy'], ['loop', 'loop'], ['times', 'clock'], ['swap', 'swap'], ['bigger', null], ['smaller', null], ['save', 'star'], ['autoPause', 'pauseCircle'], ['reveal', 'eye']];
      for (const [name, iconName] of tools) {
        const tool = button(doc, 'dk-tool', iconName);
        if (name === 'bigger') tool.textContent = 'A↑';
        if (name === 'smaller') tool.textContent = 'A↓';
        tool.dataset.tool = name;
        this.tools[name] = tool;
        this.toolsRow.append(tool);
      }
      this.tools.reveal.hidden = true;

      // seek
      const seekRow = el(doc, 'div', 'dk-row dk-seek-row');
      this.elapsed = el(doc, 'span', 'dk-time', '0:00');
      this.total = el(doc, 'span', 'dk-time', '0:00');
      this.seek = el(doc, 'input', 'dk-seek');
      this.seek.type = 'range';
      this.seek.min = '0';
      this.seek.max = String(SEEK_STEPS);
      this.seek.step = '1';
      this.seek.value = '0';
      seekRow.append(this.elapsed, this.seek, this.total);

      // transport
      const transport = el(doc, 'div', 'dk-transport');
      this.count = el(doc, 'span', 'dk-count');
      const main = el(doc, 'div', 'dk-main');
      this.steps = {
        previous: button(doc, 'dk-step', 'previous'),
        back10: button(doc, 'dk-step', 'back10'),
        forward10: button(doc, 'dk-step', 'forward10'),
        next: button(doc, 'dk-step', 'next'),
      };
      this.play = button(doc, 'dk-play', 'play');
      main.append(this.steps.previous, this.steps.back10, this.play, this.steps.forward10, this.steps.next);
      this.speed = el(doc, 'button', 'dk-speed', '1×');
      this.speed.type = 'button';
      transport.append(this.count, main, this.speed);

      // popover
      this.pop = el(doc, 'div', 'dk-pop');
      this.pop.setAttribute('role', 'dialog');
      root.append(this.pop, search, this.chipsRow, this.toolsRow, seekRow, transport);

      this.bind();
    }

    bind() {
      const { signal } = this.abort;
      const on = (node, type, handler, extra) => node.addEventListener(type, handler, { signal, ...extra });
      const o = this.options;

      stopKeys(this.input);
      stopKeys(this.seek);
      on(this.input, 'input', () => {
        clearTimeout(this.searchTimer);
        this.syncClear();
        this.searchPending = true;
        this.searchTimer = setTimeout(() => {
          this.searchPending = false;
          o.onSearch(this.input.value);
        }, 120);
      });
      on(this.input, 'keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          // Only a query typed in the last moment still needs running; re-running an
          // unchanged one would put the current match back on the first result.
          if (this.searchPending) {
            clearTimeout(this.searchTimer);
            this.searchPending = false;
            o.onSearch(this.input.value);
          }
          if (event.shiftKey) o.onSearchStep(-1);
          else o.onSearchCommit();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          o.onSearchStep(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          o.onSearchStep(-1);
        }
      });
      on(this.prevMatch, 'click', () => o.onSearchStep(-1));
      on(this.nextMatch, 'click', () => o.onSearchStep(1));
      on(this.clearButton, 'click', () => {
        this.setQuery('');
        o.onSearch('');
        this.input.focus();
      });

      for (const [view, chip] of Object.entries(this.chips)) on(chip, 'click', () => o.onPrefs({ view }));

      on(this.tools.settings, 'click', () => this.togglePopover());
      on(this.tools.copy, 'click', () => o.onCopy());
      on(this.tools.loop, 'click', () => o.onAction('loop'));
      on(this.tools.times, 'click', () => o.onPrefs({ showTimes: !this.prefs.showTimes }));
      on(this.tools.swap, 'click', () => o.onPrefs({ swap: !this.prefs.swap }));
      on(this.tools.bigger, 'click', () => o.onPrefs({ fontScale: Math.min(FONT_MAX, Math.round((this.prefs.fontScale + 0.1) * 10) / 10) }));
      on(this.tools.smaller, 'click', () => o.onPrefs({ fontScale: Math.max(FONT_MIN, Math.round((this.prefs.fontScale - 0.1) * 10) / 10) }));
      on(this.tools.save, 'click', () => o.onSave());
      on(this.tools.autoPause, 'click', () => o.onPrefs({ autoPause: !this.prefs.autoPause }));
      on(this.tools.reveal, 'click', () => o.onReveal());

      on(this.steps.previous, 'click', () => o.onAction('previous'));
      on(this.steps.next, 'click', () => o.onAction('next'));
      on(this.steps.back10, 'click', () => o.onSkip(-10));
      on(this.steps.forward10, 'click', () => o.onSkip(10));
      on(this.play, 'click', () => o.onTogglePlay());
      on(this.speed, 'click', () => {
        const next = SPEEDS.find((rate) => rate > this.rate + 0.001) ?? SPEEDS[0];
        o.onSpeed(next);
      });

      on(this.seek, 'pointerdown', () => (this.dragging = true));
      const endDrag = () => {
        this.dragging = false;
        this.seek.blur();
      };
      on(this.seek, 'pointerup', endDrag);
      on(this.seek, 'pointercancel', endDrag);
      on(this.seek, 'input', () => {
        const time = (Number(this.seek.value) / SEEK_STEPS) * this.duration;
        if (Number.isFinite(time)) {
          this.paintProgress(time);
          o.onSeek(time);
        }
      });

      // Clicks inside the dock never reach YouTube (it would toggle play on the player).
      on(this.element, 'click', (event) => event.stopPropagation());
      on(this.element, 'dblclick', (event) => event.stopPropagation());
    }

    t() {
      return STRINGS[this.language] ?? STRINGS.en;
    }

    applyLabels(language, codes, langCodes) {
      this.language = language in STRINGS ? language : 'en';
      this.langCodes = langCodes ?? this.langCodes;
      this.lastCodes = codes;
      const t = this.t();
      const hint = (action, text) => (codes && codes[action] ? `${text} (${keyLabel(codes[action])})` : text);
      const hintFocus = (action, text) => (this.prefs ? `${text} (${keyLabel(this.prefs.keys[action])})` : text);
      this.element.setAttribute('aria-label', t.region);
      this.element.dir = this.language === 'ar' ? 'rtl' : 'ltr';
      this.element.style.direction = 'ltr';
      this.input.placeholder = t.search;
      this.input.dir = this.language === 'ar' ? 'rtl' : 'ltr';
      this.input.setAttribute('aria-label', hintFocus('search', t.searchLabel));
      this.prevMatch.title = this.prevMatch.ariaLabel = t.prevMatch;
      this.nextMatch.title = this.nextMatch.ariaLabel = t.nextMatch;
      this.clearButton.title = this.clearButton.ariaLabel = t.clear;
      this.chipsRow.setAttribute('aria-label', t.modes);
      const code = (which) => (this.langCodes[which] || (which === 'primary' ? 'L1' : 'L2')).split('-')[0].toUpperCase();
      const chipText = { recall: 'RECALL', both: 'BOTH', primary: code('primary'), secondary: code('secondary') };
      const chipTitle = { recall: hintFocus('cycleView', t.recall), both: t.both, primary: t.only(code('primary')), secondary: t.only(code('secondary')) };
      for (const [view, chip] of Object.entries(this.chips)) {
        chip.textContent = chipText[view];
        chip.title = chip.ariaLabel = chipTitle[view];
      }
      const labels = {
        settings: t.settings,
        copy: t.copy,
        loop: hint('loop', t.loop),
        times: t.times,
        swap: t.swap,
        bigger: hintFocus('fontBigger', t.bigger),
        smaller: hintFocus('fontSmaller', t.smaller),
        save: hintFocus('save', t.save),
        autoPause: hintFocus('autoPause', t.autoPause),
        reveal: hintFocus('reveal', t.reveal),
      };
      for (const [name, text] of Object.entries(labels)) this.tools[name].title = this.tools[name].ariaLabel = text;
      this.steps.previous.title = this.steps.previous.ariaLabel = hint('previous', t.previous);
      this.steps.next.title = this.steps.next.ariaLabel = hint('next', t.next);
      this.steps.back10.title = this.steps.back10.ariaLabel = t.back10;
      this.steps.forward10.title = this.steps.forward10.ariaLabel = t.forward10;
      this.speed.title = this.speed.ariaLabel = t.speed;
      this.seek.setAttribute('aria-label', t.seek);
      this.setPlaying(this.playing ?? false);
      this.buildPopover();
    }

    /** @param {import('./focus-prefs.js').FocusPrefs} prefs */
    setPrefs(prefs) {
      const keysChanged = !this.prefs || JSON.stringify(prefs.keys) !== JSON.stringify(this.prefs.keys);
      const popoverChanged = !this.prefs || ['panelSide', 'recallHides', 'autoPause', 'lite', 'lockDrag', 'cacheTracks'].some((key) => prefs[key] !== this.prefs[key]);
      this.prefs = prefs;
      this.element.toggleAttribute('data-lite', prefs.lite);
      this.element.dataset.side = prefs.panelSide;
      for (const [view, chip] of Object.entries(this.chips)) chip.setAttribute('aria-pressed', String(prefs.view === view));
      this.tools.times.setAttribute('aria-pressed', String(prefs.showTimes));
      this.tools.swap.setAttribute('aria-pressed', String(prefs.swap));
      this.tools.autoPause.setAttribute('aria-pressed', String(prefs.autoPause));
      this.tools.bigger.disabled = prefs.fontScale >= FONT_MAX - 0.001;
      this.tools.smaller.disabled = prefs.fontScale <= FONT_MIN + 0.001;
      this.tools.reveal.hidden = prefs.view !== 'recall';
      if (keysChanged) this.applyLabels(this.language, this.lastCodes ?? null, this.langCodes);
      else if (popoverChanged) this.buildPopover();
    }

    setPlaying(playing) {
      this.playing = playing;
      const t = this.t();
      this.play.replaceChildren(icon(this.doc, playing ? 'pause' : 'play'));
      this.play.title = this.play.ariaLabel = playing ? t.pause : t.play;
    }

    /** @param {{paused:boolean,time:number,duration:number,rate:number}} state */
    setPlayback({ paused, time, duration, rate }) {
      if (this.playing !== !paused) this.setPlaying(!paused);
      if (rate !== this.shownRate) {
        this.shownRate = rate;
        this.rate = rate;
        this.speed.textContent = speedLabel(rate);
      }
      const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
      if (length !== this.duration) {
        this.duration = length;
        this.total.textContent = length > 0 ? formatClock(length) : '0:00';
      }
      const second = Math.floor(time);
      if (second !== this.shownSecond) {
        this.shownSecond = second;
        this.elapsed.textContent = formatClock(time);
      }
      if (!this.dragging) this.paintProgress(time);
    }

    paintProgress(time) {
      const fraction = this.duration > 0 ? Math.min(1, Math.max(0, time / this.duration)) : 0;
      this.seek.value = String(Math.round(fraction * SEEK_STEPS));
      this.seek.style.setProperty('--dk-p', `${(fraction * 100).toFixed(2)}%`);
    }

    setCount(position, total) {
      this.count.textContent = total > 0 ? `${position} / ${total}` : '';
    }

    setLoop(on) {
      this.tools.loop.setAttribute('aria-pressed', String(on));
    }

    setSaved(on) {
      this.tools.save.toggleAttribute('data-saved', on);
      this.tools.save.setAttribute('aria-pressed', String(on));
    }

    syncClear() {
      const has = this.input.value !== '';
      this.clearButton.hidden = !has;
      this.prevMatch.hidden = !has;
      this.nextMatch.hidden = !has;
      if (!has) this.found.textContent = '';
    }

    setQuery(value) {
      this.input.value = value;
      this.syncClear();
    }

    /** @param {{total:number, position:number}} state position is 1-based, 0 when there is no current match */
    setSearchState({ total, position }) {
      if (this.input.value === '') {
        this.found.textContent = '';
        this.found.removeAttribute('data-none');
        return;
      }
      this.found.toggleAttribute('data-none', total === 0);
      this.found.textContent = total === 0 ? this.t().noMatches : `${position} / ${total}`;
    }

    focusSearch() {
      this.input.focus();
      this.input.select();
    }

    get query() {
      return this.input.value;
    }

    /** True while the search box has focus or a shortcut is being captured. */
    isTyping() {
      if (this.capturing !== null) return true;
      const root = this.element.getRootNode();
      return 'activeElement' in root && root.activeElement === this.input;
    }

    setOpen(open) {
      this.element.toggleAttribute('data-open', open);
      if (!open) this.setPopover(false);
    }

    height() {
      return this.element.offsetHeight;
    }

    // ---- settings popover ------------------------------------------------

    togglePopover() {
      this.setPopover(!this.pop.hasAttribute('data-open'));
    }

    setPopover(open) {
      this.pop.toggleAttribute('data-open', open);
      this.tools.settings.setAttribute('aria-expanded', String(open));
      this.outside?.abort();
      this.outside = null;
      if (!open) {
        this.stopCapture();
        return;
      }
      this.buildPopover();
      // Never taller than the room above the dock: the player clips whatever leaves it.
      const rootBox = this.element.getRootNode().host?.getBoundingClientRect();
      const room = this.element.getBoundingClientRect().top - (rootBox ? rootBox.top : 0);
      this.pop.style.maxHeight = `${Math.max(140, Math.floor(room) + 12)}px`;
      // Close on a press anywhere else. The overlay lives in a closed shadow root, so a press inside
      // it is seen with its real target on the root, and a press on the page is checked against the host.
      const rootNode = this.element.getRootNode();
      const { signal } = (this.outside = new AbortController());
      const inside = (target) => target instanceof Node && this.element.contains(target);
      rootNode.addEventListener('pointerdown', (event) => !inside(event.target) && this.setPopover(false), { capture: true, signal });
      this.doc.addEventListener(
        'pointerdown',
        (event) => {
          const host = rootNode.host;
          if (!host || !event.composedPath().includes(host)) this.setPopover(false);
        },
        { capture: true, signal },
      );
    }

    buildPopover() {
      const { doc, prefs } = this;
      if (!prefs) return;
      const t = this.t();
      const o = this.options;
      const note = el(doc, 'p', 'dk-note');
      note.setAttribute('role', 'status');
      this.note = note;

      const segmented = (items, current, onPick) => {
        const group = el(doc, 'div', 'dk-seg');
        for (const [value, label] of items) {
          const item = el(doc, 'button', '', label);
          item.type = 'button';
          item.setAttribute('aria-pressed', String(current === value));
          item.addEventListener('click', () => onPick(value));
          group.append(item);
        }
        return group;
      };
      const field = (label, control) => {
        const row = el(doc, 'div', 'dk-field');
        row.append(el(doc, 'span', '', label), control);
        return row;
      };
      const toggle = (label, key, onChange) => {
        const sw = el(doc, 'button', 'dk-switch');
        sw.type = 'button';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-checked', String(Boolean(prefs[key])));
        sw.setAttribute('aria-label', label);
        sw.addEventListener('click', () => (onChange ? onChange(!prefs[key]) : o.onPrefs({ [key]: !prefs[key] })));
        return field(label, sw);
      };

      const nodes = [el(doc, 'h3', '', t.settingsTitle)];
      nodes.push(field(t.side, segmented([['left', t.left], ['right', t.right]], prefs.panelSide, (panelSide) => o.onPrefs({ panelSide }))));
      nodes.push(field(t.recallHides, segmented([['secondary', t.second], ['primary', t.first]], prefs.recallHides, (recallHides) => o.onPrefs({ recallHides }))));
      nodes.push(toggle(t.autoPause, 'autoPause'));
      nodes.push(toggle(t.lite, 'lite'));
      nodes.push(toggle(t.lockDrag, 'lockDrag'));
      nodes.push(toggle(t.cacheTracks, 'cacheTracks'));

      nodes.push(el(doc, 'h4', '', t.shortcuts));
      this.keyButtons = {};
      for (const action of FOCUS_KEY_ACTIONS) {
        const key = el(doc, 'button', 'dk-key', keyLabel(prefs.keys[action]));
        key.type = 'button';
        key.dataset.action = action;
        key.setAttribute('aria-label', `${t.actions[action]}: ${keyLabel(prefs.keys[action])}`);
        key.addEventListener('click', () => this.startCapture(action));
        this.keyButtons[action] = key;
        nodes.push(field(t.actions[action], key));
      }
      nodes.push(note);

      const foot = el(doc, 'div', 'dk-foot');
      const resetKeys = el(doc, 'button', 'dk-ghost', t.resetKeys);
      const resetPanel = el(doc, 'button', 'dk-ghost', t.resetPanel);
      const clearCache = el(doc, 'button', 'dk-ghost', t.clearCache);
      for (const node of [resetKeys, resetPanel, clearCache]) node.type = 'button';
      resetKeys.addEventListener('click', () => o.onPrefs({ keys: { ...FOCUS_DEFAULT_KEYS } }));
      resetPanel.addEventListener('click', () => o.onResetPanel());
      clearCache.addEventListener('click', async () => {
        await o.onClearCache();
        if (this.note) this.note.textContent = t.cacheCleared;
      });
      foot.append(resetKeys, resetPanel, clearCache);
      nodes.push(foot);
      this.pop.replaceChildren(...nodes);
    }

    startCapture(action) {
      this.stopCapture();
      this.capturing = action;
      const button = this.keyButtons?.[action];
      if (button) {
        button.textContent = this.t().pressKey;
        button.setAttribute('data-capturing', '');
      }
      this.captureAbort = new AbortController();
      this.doc.addEventListener('keydown', this.onCaptureKey, { capture: true, signal: this.captureAbort.signal });
    }

    stopCapture() {
      if (this.capturing === null) return;
      this.captureAbort?.abort();
      const action = this.capturing;
      this.capturing = null;
      const button = this.keyButtons?.[action];
      if (button && this.prefs) {
        button.textContent = keyLabel(this.prefs.keys[action]);
        button.removeAttribute('data-capturing');
      }
    }

    onCaptureKey = (event) => {
      if (/^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$/.test(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const action = this.capturing;
      if (event.code === 'Escape' || !action) {
        this.stopCapture();
        return;
      }
      const verdict = validateKeyAssignment(action, event.code, this.prefs.keys, this.options.legacyCodes());
      if (!verdict.ok) {
        if (this.note) this.note.textContent = this.t().keyErrors[verdict.reason];
        return;
      }
      this.stopCapture();
      this.options.onPrefs({ keys: { ...this.prefs.keys, [action]: event.code } });
    };

    destroy() {
      clearTimeout(this.searchTimer);
      this.captureAbort?.abort();
      this.outside?.abort();
      this.abort.abort();
      this.element.remove();
    }
  }

  return { FocusDock, FOCUS_DOCK_CSS: CSS, focusMessages };
});
