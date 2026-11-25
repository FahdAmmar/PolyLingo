/**
 * Focus-reading preferences and keyboard shortcuts — PolyLingo 0.6
 *
 * Design decisions
 * - Own storage key (`polylingo.focus`, chrome.storage.local), like the layout: the options
 *   page re-saves `polylingo.settings` through its own sanitizer and would drop unknown fields.
 * - Everything read back is re-validated (storage is an input boundary).
 * - New shortcuts are plain keys (no modifiers) and are validated against YouTube's own hotkeys
 *   and against the four scene shortcuts configured on the options page.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PolyLingoFeatures = Object.assign(root.PolyLingoFeatures || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FOCUS_PREFS_KEY = 'polylingo.focus';
  const VIEWS = ['both', 'primary', 'secondary', 'recall'];
  const SIDES = ['left', 'right'];
  const RECALL_TARGETS = ['primary', 'secondary'];
  const FONT_MIN = 0.8;
  const FONT_MAX = 1.8;

  /** action -> KeyboardEvent.code */
  const DEFAULT_KEYS = Object.freeze({
    search: 'Slash',
    cycleView: 'KeyV',
    reveal: 'KeyW',
    autoPause: 'KeyP',
    save: 'KeyB',
    fontBigger: 'BracketRight',
    fontSmaller: 'BracketLeft',
  });
  const KEY_ACTIONS = Object.keys(DEFAULT_KEYS);
  /** Actions that only make sense while Focus reading is open. */
  const FOCUS_ONLY = new Set(['search', 'fontBigger', 'fontSmaller']);

  const KEY_PATTERN = /^(?:Key[A-Z]|Slash|BracketLeft|BracketRight|Semicolon|Quote|Backquote|Backslash)$/;
  /** YouTube's own single-key hotkeys that must keep working. */
  const YOUTUBE_RESERVED = new Set(['KeyK', 'KeyJ', 'KeyL', 'KeyF', 'KeyM', 'KeyC', 'KeyI', 'KeyT']);

  const LABELS = { Slash: '/', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\' };

  /** "KeyV" -> "V", "Slash" -> "/" */
  function keyLabel(code) {
    if (typeof code !== 'string') return '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    return LABELS[code] ?? code;
  }

  function isBool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function oneOf(value, list, fallback) {
    return list.includes(value) ? value : fallback;
  }

  function clampFont(value) {
    const number = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    return Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, number)) * 10) / 10;
  }

  function defaultFocusPrefs() {
    return {
      version: 1,
      view: 'both',
      recallHides: 'secondary',
      showTimes: true,
      swap: false,
      fontScale: 1,
      autoPause: false,
      panelSide: 'left',
      lite: false,
      lockDrag: false,
      cacheTracks: true,
      keys: { ...DEFAULT_KEYS },
    };
  }

  function sanitizeKeys(raw) {
    const input = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
    // Valid custom codes, first come first served among themselves.
    const custom = new Map();
    const taken = new Set();
    for (const action of KEY_ACTIONS) {
      const candidate = input[action];
      if (typeof candidate === 'string' && KEY_PATTERN.test(candidate) && !YOUTUBE_RESERVED.has(candidate) && !taken.has(candidate)) {
        custom.set(action, candidate);
        taken.add(candidate);
      }
    }
    // A custom code may not steal the default of an action that stays on its default.
    // Dropping one custom code can free or occupy other codes, so repeat until stable.
    for (let changed = true; changed; ) {
      changed = false;
      for (const [action, code] of custom) {
        const clash = KEY_ACTIONS.some((other) => other !== action && !custom.has(other) && DEFAULT_KEYS[other] === code);
        if (clash) {
          custom.delete(action);
          changed = true;
        }
      }
    }
    const keys = {};
    for (const action of KEY_ACTIONS) keys[action] = custom.get(action) ?? DEFAULT_KEYS[action];
    return keys;
  }

  function sanitizeFocusPrefs(raw) {
    const input = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
    const defaults = defaultFocusPrefs();
    return {
      version: 1,
      view: oneOf(input.view, VIEWS, defaults.view),
      recallHides: oneOf(input.recallHides, RECALL_TARGETS, defaults.recallHides),
      showTimes: isBool(input.showTimes, defaults.showTimes),
      swap: isBool(input.swap, defaults.swap),
      fontScale: clampFont(input.fontScale),
      autoPause: isBool(input.autoPause, defaults.autoPause),
      panelSide: oneOf(input.panelSide, SIDES, defaults.panelSide),
      lite: isBool(input.lite, defaults.lite),
      lockDrag: isBool(input.lockDrag, defaults.lockDrag),
      cacheTracks: isBool(input.cacheTracks, defaults.cacheTracks),
      keys: sanitizeKeys(input.keys),
    };
  }

  /**
   * @param {string} action @param {string} code
   * @param {Record<string,string>} keys current assignment
   * @param {string[]} legacy codes used by the options-page scene shortcuts (previous/next/replay/loop)
   * @returns {{ok:true}|{ok:false, reason:'invalid'|'reserved'|'duplicate'}}
   */
  function validateKeyAssignment(action, code, keys, legacy = []) {
    if (!KEY_ACTIONS.includes(action) || typeof code !== 'string' || !KEY_PATTERN.test(code)) return { ok: false, reason: 'invalid' };
    if (YOUTUBE_RESERVED.has(code)) return { ok: false, reason: 'reserved' };
    if (legacy.includes(code)) return { ok: false, reason: 'duplicate' };
    for (const other of KEY_ACTIONS) if (other !== action && keys[other] === code) return { ok: false, reason: 'duplicate' };
    return { ok: true };
  }

  /** both -> primary -> secondary -> recall -> both */
  function cycleView(view) {
    return VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
  }

  function stepFont(scale, direction) {
    return clampFont(scale + (direction < 0 ? -0.1 : 0.1));
  }

  function localArea() {
    return globalThis.chrome.storage.local;
  }

  async function loadFocusPrefs(area = localArea()) {
    try {
      const stored = await area.get(FOCUS_PREFS_KEY);
      return stored[FOCUS_PREFS_KEY] === undefined ? defaultFocusPrefs() : sanitizeFocusPrefs(stored[FOCUS_PREFS_KEY]);
    } catch (error) {
      console.error('[PolyLingo] failed to load focus preferences', error);
      return defaultFocusPrefs();
    }
  }

  async function saveFocusPrefs(prefs, area = localArea()) {
    try {
      await area.set({ [FOCUS_PREFS_KEY]: sanitizeFocusPrefs(prefs) });
      return true;
    } catch (error) {
      console.error('[PolyLingo] failed to save focus preferences', error);
      return false;
    }
  }

  /** Subscribe to preference changes made in another tab. Returns an unsubscribe function. */
  function watchFocusPrefs(callback, events = globalThis.chrome.storage.onChanged) {
    const listener = (changes, areaName) => {
      if (areaName !== 'local') return;
      const change = changes[FOCUS_PREFS_KEY];
      if (change) callback(change.newValue === undefined ? defaultFocusPrefs() : sanitizeFocusPrefs(change.newValue));
    };
    events.addListener(listener);
    return () => events.removeListener(listener);
  }

  function isEditable(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
  }

  /**
   * Capture-phase key handling for the Focus-reading shortcuts.
   * @param {{doc?:Document, signal:AbortSignal,
   *          enabled:()=>boolean, isFocusOpen:()=>boolean, isTyping:()=>boolean,
   *          getKeys:()=>Record<string,string>, legacyCodes?:()=>string[],
   *          handlers:Record<string,()=>void>}} options
   */
  function bindFocusKeys(options) {
    const doc = options.doc ?? document;
    doc.addEventListener(
      'keydown',
      (event) => {
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        if (!options.enabled() || options.isTyping()) return;
        const first = typeof event.composedPath === 'function' ? event.composedPath()[0] : null;
        if (isEditable(first) || isEditable(event.target)) return;
        const keys = options.getKeys();
        const legacy = options.legacyCodes ? options.legacyCodes() : [];
        for (const action of KEY_ACTIONS) {
          if (keys[action] !== event.code || legacy.includes(event.code)) continue;
          if (FOCUS_ONLY.has(action) && !options.isFocusOpen()) return;
          const handler = options.handlers[action];
          if (!handler) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          handler();
          return;
        }
      },
      { capture: true, signal: options.signal },
    );
  }

  return {
    FOCUS_PREFS_KEY,
    FOCUS_VIEWS: VIEWS,
    FOCUS_KEY_ACTIONS: KEY_ACTIONS,
    FOCUS_DEFAULT_KEYS: DEFAULT_KEYS,
    FONT_MIN,
    FONT_MAX,
    keyLabel,
    defaultFocusPrefs,
    sanitizeFocusPrefs,
    validateKeyAssignment,
    cycleView,
    stepFont,
    loadFocusPrefs,
    saveFocusPrefs,
    watchFocusPrefs,
    bindFocusKeys,
  };
});
