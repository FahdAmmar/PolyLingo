/**
 * Layout store — PolyLingo 0.5
 *
 * Persists where the viewer parked each subtitle line and how wide the
 * Focus-reading panel is.
 *
 * Design decisions
 * - Own storage key (`polylingo.layout`), NOT part of `polylingo.settings`:
 *   the options page re-saves the whole settings object through its own
 *   sanitizer and would silently drop unknown fields.
 * - `chrome.storage.local`: positions are device/screen specific, so there is
 *   no reason to spend sync quota or sync them across machines.
 * - Everything read back is re-validated: storage is an input boundary.
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

  const LAYOUT_KEY = 'polylingo.layout';
  const SPLIT_MIN = 28;
  const SPLIT_MAX = 65;
  const SPLIT_DEFAULT = 42;

  /**
   * @typedef {{x:number,y:number}} Position   centre of the line, % of the video area
   * @typedef {{version:1,primary:Position|null,secondary:Position|null,split:number}} Layout
   */

  function clamp(value, min, max, fallback) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  /** @returns {Position|null} */
  function sanitizePosition(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const x = clamp(raw.x, 0, 100, NaN);
    const y = clamp(raw.y, 0, 100, NaN);
    return Number.isNaN(x) || Number.isNaN(y) ? null : { x: round2(x), y: round2(y) };
  }

  /** @returns {Layout} */
  function defaultLayout() {
    return { version: 1, primary: null, secondary: null, split: SPLIT_DEFAULT };
  }

  /** @returns {Layout} */
  function sanitizeLayout(raw) {
    const input = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
    return {
      version: 1,
      primary: sanitizePosition(input.primary),
      secondary: sanitizePosition(input.secondary),
      split: round2(clamp(input.split, SPLIT_MIN, SPLIT_MAX, SPLIT_DEFAULT)),
    };
  }

  function localArea() {
    return globalThis.chrome.storage.local;
  }

  /** @returns {Promise<Layout>} */
  async function loadLayout(area = localArea()) {
    try {
      const stored = await area.get(LAYOUT_KEY);
      return stored[LAYOUT_KEY] === undefined ? defaultLayout() : sanitizeLayout(stored[LAYOUT_KEY]);
    } catch (error) {
      console.error('[PolyLingo] failed to load layout', error);
      return defaultLayout();
    }
  }

  /** @returns {Promise<boolean>} true when the write succeeded */
  async function saveLayout(layout, area = localArea()) {
    try {
      await area.set({ [LAYOUT_KEY]: sanitizeLayout(layout) });
      return true;
    } catch (error) {
      console.error('[PolyLingo] failed to save layout', error);
      return false;
    }
  }

  /** Subscribe to layout changes made in another tab. Returns an unsubscribe function. */
  function watchLayout(callback, events = globalThis.chrome.storage.onChanged) {
    const listener = (changes, areaName) => {
      if (areaName !== 'local') return;
      const change = changes[LAYOUT_KEY];
      if (change) callback(change.newValue === undefined ? defaultLayout() : sanitizeLayout(change.newValue));
    };
    events.addListener(listener);
    return () => events.removeListener(listener);
  }

  return {
    LAYOUT_KEY,
    SPLIT_MIN,
    SPLIT_MAX,
    SPLIT_DEFAULT,
    defaultLayout,
    sanitizeLayout,
    sanitizePosition,
    loadLayout,
    saveLayout,
    watchLayout,
  };
});
