/**
 * Scene controls — PolyLingo 0.5
 *
 * A small button group: previous scene · repeat scene · next scene.
 * Used twice: in the on-video toolbar and in the Focus-reading panel header.
 * Built with DOM APIs only (no innerHTML) so there is no injection surface.
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

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ACTIONS = ['previous', 'replay', 'next'];

  /** [tag, attributes] — `filled` shapes use currentColor as fill. */
  const ICONS = {
    previous: [
      ['path', { d: 'M6 5v14' }],
      ['path', { d: 'M19 6.5 9.5 12l9.5 5.5z', 'data-fill': '' }],
    ],
    replay: [
      ['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5' }],
      ['path', { d: 'M4 4.5v4.5h4.5' }],
    ],
    next: [
      ['path', { d: 'M18 5v14' }],
      ['path', { d: 'M5 6.5 14.5 12 5 17.5z', 'data-fill': '' }],
    ],
  };

  const LABELS = {
    en: { previous: 'Previous scene', replay: 'Repeat scene', next: 'Next scene' },
    ar: { previous: 'المشهد السابق', replay: 'إعادة المشهد', next: 'المشهد التالي' },
  };

  const CSS = `
.sc { display: inline-flex; gap: .25rem; align-items: center; }
.sc-btn {
  width: 34px; height: 34px; padding: 0; display: inline-grid; place-items: center;
  border-radius: .6rem; border: 1px solid rgba(255,255,255,.22); cursor: pointer; color: #fff;
  background: rgba(12,14,22,.72); backdrop-filter: blur(8px);
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.sc-btn:hover { background: rgba(45,212,191,.22); border-color: rgba(45,212,191,.6); }
.sc-btn:active { transform: scale(.93); }
.sc-btn:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.sc-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.sc-btn svg [data-fill] { fill: currentColor; }
@media (prefers-reduced-motion: reduce) { .sc-btn { transition: none; } }
`;

  /** "KeyA" -> "A", "ArrowLeft" -> "←", "Digit1" -> "1" */
  function keyHint(code) {
    if (typeof code !== 'string') return '';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
    const arrows = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space' };
    return arrows[code] ?? code;
  }

  function createIcon(doc, shapes) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tag, attributes] of shapes) {
      const shape = doc.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      svg.append(shape);
    }
    return svg;
  }

  /**
   * @param {Document} doc
   * @param {{onAction:(action:'previous'|'replay'|'next')=>void}} options
   */
  function createSceneButtons(doc, options) {
    const element = doc.createElement('div');
    element.className = 'sc';
    element.setAttribute('role', 'group');

    /** @type {Record<string, HTMLButtonElement>} */
    const buttons = {};
    for (const action of ACTIONS) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'sc-btn';
      button.dataset.action = action;
      button.append(createIcon(doc, ICONS[action]));
      buttons[action] = button;
      element.append(button);
    }

    const onClick = (event) => {
      const target = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      if (!target || !(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!ACTIONS.includes(action)) return;
      event.preventDefault();
      // Keep YouTube from treating the click as "toggle play" on the player.
      event.stopPropagation();
      // A focused button would also swallow YouTube's Space = play/pause shortcut.
      if (event.detail > 0) target.blur();
      options.onAction(action);
    };
    element.addEventListener('click', onClick);

    return {
      element,
      /**
       * @param {'en'|'ar'} language
       * @param {{previous?:string,replay?:string,next?:string}|null} codes  KeyboardEvent.code per action; null hides hints
       */
      update(language, codes) {
        const labels = LABELS[language] ?? LABELS.en;
        element.setAttribute('aria-label', language === 'ar' ? 'التنقل بين المشاهد' : 'Scene navigation');
        for (const action of ACTIONS) {
          const hint = codes ? keyHint(codes[action]) : '';
          const text = hint ? `${labels[action]} (${hint})` : labels[action];
          buttons[action].title = text;
          buttons[action].setAttribute('aria-label', text);
        }
      },
      destroy() {
        element.removeEventListener('click', onClick);
        element.remove();
      },
    };
  }

  return { SCENE_CONTROLS_CSS: CSS, createSceneButtons, keyHint };
});
