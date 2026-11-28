/**
 * Range loop controls — PolyLingo 0.7
 *
 * The on-video widget for the range loop:  [A] [B] [loop] [clock 0:12 – 0:19]
 *   A / B   mark the start / end. They snap to the edges of the scene on screen,
 *           so marking A in scene 3 and B in scene 5 loops scenes 3-5.
 *   loop    switches the loop on or off (shows how many repeats have run).
 *   clock   opens a small editor to type exact times ("0:19", "12.5", "٠:١٩").
 *
 * Built with DOM APIs only (no innerHTML), so there is no injection surface.
 * Keys typed in the editor never reach YouTube's hotkeys (k = play, f = fullscreen ...).
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
    ? { ...nodeRequire('./range-loop.js'), ...nodeRequire('./scene-controls.js') }
    : globalThis.PolyLingoFeatures;
  const { formatTime, parseTime, keyHint } = features;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Plain keys, no modifiers. Q / E / X are free in YouTube and in PolyLingo's own sets
   * (A S D R · / V W P B [ ]); a code the viewer has re-assigned elsewhere is skipped at key time.
   * KeyboardEvent.code is a physical position, so these work on an Arabic layout too.
   */
  const KEYS = Object.freeze({ markStart: 'KeyQ', markEnd: 'KeyE', toggle: 'KeyX' });

  const ICONS = {
    loop: [
      ['path', { d: 'M17 3l3 3-3 3' }],
      ['path', { d: 'M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20' }],
      ['path', { d: 'M7 21l-3-3 3-3' }],
      ['path', { d: 'M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4' }],
    ],
    clock: [
      ['circle', { cx: 12, cy: 12, r: 8.5 }],
      ['path', { d: 'M12 7v5.2l3.2 2' }],
    ],
    /** Crosshair: "take the time the video is at right now". */
    now: [
      ['circle', { cx: 12, cy: 12, r: 4.5 }],
      ['path', { d: 'M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4' }],
    ],
  };

  const MESSAGES = {
    en: {
      group: 'Range loop',
      markStart: 'Set loop start (A)',
      markEnd: 'Set loop end (B)',
      toggle: 'Loop range',
      edit: 'Edit loop times',
      start: 'Start',
      end: 'End',
      now: 'Use current time',
      apply: 'Apply',
      clear: 'Clear',
      hint: 'Type 0:19, 1:05.5 or 12.5 (seconds). Empty start = beginning, empty end = end of video.',
      text: {
        startSet: 'Loop start: {t}',
        endSet: 'Loop end: {t}',
        on: 'Range loop on · {t}',
        off: 'Range loop off',
        cleared: 'Loop range cleared',
        needRange: 'Set the start (A) and the end (B) first',
        left: 'Range loop off — you left the range',
        invalid: 'Enter a time like 0:19 or 12.5',
        'too-short': 'The range must be at least 0.1 s',
        'out-of-range': 'The start is after the end of the video',
        'no-range': 'Set the start (A) and the end (B) first',
        unavailable: 'The video is not ready yet',
      },
    },
    ar: {
      group: 'تكرار مقطع',
      markStart: 'تحديد بداية التكرار (A)',
      markEnd: 'تحديد نهاية التكرار (B)',
      toggle: 'تكرار المقطع',
      edit: 'تعديل أوقات التكرار',
      start: 'البداية',
      end: 'النهاية',
      now: 'استخدام الوقت الحالي',
      apply: 'تطبيق',
      clear: 'مسح',
      hint: 'اكتب 0:19 أو 1:05.5 أو 12.5 (ثانية). البداية الفارغة = أول الفيديو، والنهاية الفارغة = آخره.',
      text: {
        startSet: 'بداية التكرار: {t}',
        endSet: 'نهاية التكرار: {t}',
        on: 'تكرار المقطع: تشغيل · {t}',
        off: 'تكرار المقطع: إيقاف',
        cleared: 'تم مسح مقطع التكرار',
        needRange: 'حدّد البداية (A) والنهاية (B) أولاً',
        left: 'تكرار المقطع: إيقاف — خرجتَ من المقطع',
        invalid: 'اكتب وقتاً صحيحاً مثل 0:19 أو 12.5',
        'too-short': 'يجب ألا يقل المقطع عن 0.1 ثانية',
        'out-of-range': 'البداية بعد نهاية الفيديو',
        'no-range': 'حدّد البداية (A) والنهاية (B) أولاً',
        unavailable: 'الفيديو غير جاهز بعد',
      },
    },
  };

  const CSS = `
.rl { position: relative; display: inline-flex; gap: .25rem; align-items: center; }
.rl-btn {
  min-width: 34px; height: 34px; padding: 0 .35rem; display: inline-flex; gap: .3rem; align-items: center; justify-content: center;
  box-sizing: border-box; border-radius: .6rem; border: 1px solid rgba(255,255,255,.22); cursor: pointer; color: #fff;
  background: rgba(12,14,22,.72); backdrop-filter: blur(8px); font: 700 13px system-ui, "Segoe UI", Tahoma, sans-serif;
  transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.rl-btn:hover { background: rgba(45,212,191,.22); border-color: rgba(45,212,191,.6); }
.rl-btn:active { transform: scale(.93); }
.rl-btn:focus-visible, .rl-input:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.rl-btn[data-set] { border-color: rgba(45,212,191,.55); }
.rl-btn[aria-pressed="true"] { background: rgba(45,212,191,.34); border-color: #2dd4bf; color: #99f6e4; }
.rl-btn svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.rl-time, .rl-count { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 12px; white-space: nowrap; }
.rl-pop {
  position: absolute; top: calc(100% + .45rem); inset-inline-end: 0; z-index: 60; box-sizing: border-box; width: 16rem;
  padding: .75rem; border-radius: .8rem; color: #fff;
  background: rgba(12,14,22,.95); border: 1px solid rgba(255,255,255,.2); backdrop-filter: blur(10px);
  font: 500 13px system-ui, "Segoe UI", Tahoma, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.45);
}
.rl-body { display: grid; gap: .55rem; }
.rl-field { display: grid; grid-template-columns: 1fr auto; gap: .3rem .35rem; align-items: center; }
.rl-field label { grid-column: 1 / -1; font-size: 12px; color: #aab2c5; }
.rl-input {
  height: 32px; min-width: 0; box-sizing: border-box; padding: 0 .55rem; border-radius: .5rem; color: #fff;
  border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.08);
  font: 600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; direction: ltr; text-align: left;
}
.rl-input[aria-invalid="true"] { border-color: #f87171; }
.rl-now { min-width: 32px; height: 32px; padding: 0; }
.rl-hint { margin: 0; font-size: 12px; line-height: 1.45; color: #aab2c5; }
.rl-err { min-height: 1.1em; margin: 0; font-size: 12px; color: #fca5a5; }
.rl-actions { display: flex; gap: .4rem; justify-content: flex-end; }
.rl-text-btn { padding: 0 .8rem; }
.rl-primary { background: #2dd4bf; border-color: #2dd4bf; color: #04211c; }
.rl-primary:hover { background: #5eead4; border-color: #5eead4; }
.toolbar:has(.rl-pop:not([hidden])) { opacity: 1 !important; pointer-events: auto !important; }
/* Focus reading hides the toolbar because the dock repeats its buttons. Nothing in the dock sets a range, so that group stays. */
:host([data-focus]) .toolbar { display: flex; }
:host([data-focus]) .toolbar > :not(.rl) { display: none; }
:host([data-focus][data-side="right"]) .toolbar { inset-inline-end: calc(var(--pl-split, 42%) + 1rem); }
@media (prefers-reduced-motion: reduce) { .rl-btn { transition: none; } }
`;

  /** "0:12 – 0:19", "0:12 – …" while only A is set, "… – 0:19" while only B is set. */
  function formatRange(start, end) {
    const left = start === null || start === undefined ? '…' : formatTime(start);
    const right = end === null || end === undefined ? '…' : formatTime(end);
    return `${left} – ${right}`;
  }

  /** Message for a toast or inline error. `detail` fills the {t} slot. */
  function rangeLoopText(language, key, detail) {
    const text = (MESSAGES[language] ?? MESSAGES.en).text[key] ?? '';
    return text.replace('{t}', detail ?? '');
  }

  function isEditable(node) {
    if (!node || typeof node.tagName !== 'string') return false;
    const tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable === true;
  }

  function createIcon(doc, shapes) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tag, attributes] of shapes) {
      const shape = doc.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
      svg.append(shape);
    }
    return svg;
  }

  function node(doc, tag, className, text) {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function button(doc, className, action) {
    const element = node(doc, 'button', `rl-btn ${className}`);
    element.type = 'button';
    element.dataset.action = action;
    return element;
  }

  function stopKeys(target) {
    for (const type of ['keydown', 'keyup', 'keypress']) target.addEventListener(type, (event) => event.stopPropagation());
  }

  /**
   * @param {Document} doc
   * @param {{onAction:(action:'markStart'|'markEnd'|'toggle'|'clear'|'apply', payload?:{start:number|null,end:number|null})=>({ok:boolean,reason?:string}|void),
   *          getNow:()=>number}} options
   *   `apply` may return a failed result; the editor then stays open and shows the reason.
   */
  function createRangeLoopControl(doc, options) {
    const element = node(doc, 'div', 'rl');
    element.setAttribute('role', 'group');

    const markStart = button(doc, 'rl-mark', 'markStart');
    markStart.textContent = 'A';
    const markEnd = button(doc, 'rl-mark', 'markEnd');
    markEnd.textContent = 'B';
    const toggle = button(doc, 'rl-toggle', 'toggle');
    const count = node(doc, 'span', 'rl-count');
    count.hidden = true;
    toggle.append(createIcon(doc, ICONS.loop), count);
    const edit = button(doc, 'rl-edit', 'edit');
    const time = node(doc, 'span', 'rl-time');
    time.hidden = true;
    edit.append(createIcon(doc, ICONS.clock), time);
    edit.setAttribute('aria-haspopup', 'dialog');
    edit.setAttribute('aria-expanded', 'false');

    // ---- editor ----------------------------------------------------------
    const pop = node(doc, 'div', 'rl-pop');
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');

    /** @param {'start'|'end'} name */
    function field(name) {
      const wrap = node(doc, 'div', 'rl-field');
      const label = node(doc, 'label');
      const input = node(doc, 'input', 'rl-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.inputMode = 'decimal';
      input.maxLength = 16;
      input.id = `rl-${name}`;
      label.htmlFor = input.id;
      const now = button(doc, 'rl-now', `now-${name}`);
      now.append(createIcon(doc, ICONS.now));
      stopKeys(input);
      wrap.append(label, input, now);
      return { wrap, label, input, now };
    }
    const startField = field('start');
    const endField = field('end');
    const hint = node(doc, 'p', 'rl-hint');
    const error = node(doc, 'p', 'rl-err');
    error.setAttribute('role', 'status');
    const actions = node(doc, 'div', 'rl-actions');
    const clearButton = button(doc, 'rl-text-btn', 'clear');
    const applyButton = button(doc, 'rl-text-btn rl-primary', 'apply');
    actions.append(clearButton, applyButton);
    const body = node(doc, 'div', 'rl-body');
    body.append(startField.wrap, endField.wrap, hint, error, actions);
    pop.append(body);

    element.append(markStart, markEnd, toggle, edit, pop);

    let language = 'en';
    let last = null;
    let outsideAbort = null;

    const messages = () => MESSAGES[language] ?? MESSAGES.en;

    function showError(reason, invalidField) {
      error.textContent = rangeLoopText(language, reason);
      startField.input.removeAttribute('aria-invalid');
      endField.input.removeAttribute('aria-invalid');
      if (invalidField) invalidField.input.setAttribute('aria-invalid', 'true');
    }

    function clearError() {
      showError('');
    }

    function closeEditor() {
      if (pop.hidden) return;
      pop.hidden = true;
      edit.setAttribute('aria-expanded', 'false');
      outsideAbort?.abort();
      outsideAbort = null;
      // A focused field would keep swallowing YouTube's Space (play/pause).
      const active = element.getRootNode().activeElement;
      if (active && element.contains(active)) active.blur();
    }

    function openEditor() {
      startField.input.value = last && last.start !== null ? formatTime(last.start) : '';
      endField.input.value = last && last.end !== null ? formatTime(last.end) : '';
      clearError();
      pop.hidden = false;
      edit.setAttribute('aria-expanded', 'true');
      outsideAbort = new AbortController();
      // Click elsewhere closes the editor. Listener exists only while it is open.
      doc.addEventListener(
        'pointerdown',
        (event) => {
          const host = element.getRootNode().host;
          if (!host || !event.composedPath().includes(host)) closeEditor();
        },
        { capture: true, signal: outsideAbort.signal },
      );
      startField.input.focus();
      startField.input.select();
    }

    function apply() {
      const startText = startField.input.value.trim();
      const endText = endField.input.value.trim();
      const start = startText === '' ? null : parseTime(startText);
      const end = endText === '' ? null : parseTime(endText);
      if (startText !== '' && start === null) return showError('invalid', startField);
      if (endText !== '' && end === null) return showError('invalid', endField);
      const result = options.onAction('apply', { start, end });
      if (result && result.ok === false) return showError(result.reason ?? 'invalid');
      closeEditor();
    }

    const onClick = (event) => {
      // Keep YouTube from treating any click in the widget as "toggle play" on the player.
      event.stopPropagation();
      const target = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      if (!target) return;
      event.preventDefault();
      const action = target.dataset.action;
      if (action === 'edit') {
        pop.hidden ? openEditor() : closeEditor();
        return;
      }
      if (action === 'now-start' || action === 'now-end') {
        const input = action === 'now-start' ? startField.input : endField.input;
        input.value = formatTime(options.getNow());
        input.removeAttribute('aria-invalid');
        clearError();
        input.focus();
        return;
      }
      if (action === 'apply') {
        apply();
        return;
      }
      if (action === 'clear') {
        closeEditor();
        options.onAction('clear');
        return;
      }
      // A focused button would also swallow YouTube's Space = play/pause shortcut.
      if (event.detail > 0) target.blur();
      options.onAction(action);
    };
    element.addEventListener('click', onClick);
    // A double click on the widget must not reach YouTube (it toggles fullscreen).
    const onDoubleClick = (event) => event.stopPropagation();
    element.addEventListener('dblclick', onDoubleClick);

    const onEditorKey = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        apply();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeEditor();
      }
    };
    startField.input.addEventListener('keydown', onEditorKey);
    endField.input.addEventListener('keydown', onEditorKey);

    function describe(base, value, code) {
      const hintText = code ? keyHint(code) : '';
      const head = hintText ? `${base} (${hintText})` : base;
      return value ? `${head} — ${value}` : head;
    }

    return {
      element,
      /**
       * @param {'en'|'ar'} nextLanguage
       * @param {{start:number|null,end:number|null,active:boolean,wraps:number}} state
       * @param {{markStart?:string,markEnd?:string,toggle?:string}|null} codes  KeyboardEvent.code per action; null hides hints
       */
      update(nextLanguage, state, codes) {
        const key = [nextLanguage, state.start, state.end, state.active, codes ? 1 : 0].join('|');
        const showCount = state.active && state.wraps > 0;
        count.hidden = !showCount;
        if (showCount) count.textContent = `${state.wraps}×`;
        if (last && last.key === key) {
          last.wraps = state.wraps;
          return;
        }
        language = MESSAGES[nextLanguage] ? nextLanguage : 'en';
        last = { key, start: state.start, end: state.end, wraps: state.wraps };
        const m = messages();
        const has = state.start !== null || state.end !== null;
        const rangeText = has ? formatRange(state.start, state.end) : '';

        element.setAttribute('aria-label', m.group);
        const labels = [
          [markStart, describe(m.markStart, state.start === null ? '' : formatTime(state.start), codes && KEYS.markStart)],
          [markEnd, describe(m.markEnd, state.end === null ? '' : formatTime(state.end), codes && KEYS.markEnd)],
          [toggle, describe(m.toggle, rangeText, codes && KEYS.toggle)],
          [edit, describe(m.edit, rangeText)],
        ];
        for (const [target, text] of labels) {
          target.title = text;
          target.setAttribute('aria-label', text);
        }
        markStart.toggleAttribute('data-set', state.start !== null);
        markEnd.toggleAttribute('data-set', state.end !== null);
        toggle.setAttribute('aria-pressed', String(state.active));
        time.hidden = !has;
        time.textContent = rangeText;

        pop.setAttribute('aria-label', m.edit);
        // Direction lives on the inner body: on the popover itself it would flip its inset-inline-end anchor.
        body.dir = language === 'ar' ? 'rtl' : 'ltr';
        startField.label.textContent = m.start;
        endField.label.textContent = m.end;
        for (const now of [startField.now, endField.now]) {
          now.title = m.now;
          now.setAttribute('aria-label', m.now);
        }
        hint.textContent = m.hint;
        clearButton.textContent = m.clear;
        applyButton.textContent = m.apply;
      },
      /** True while a time field has focus. */
      isTyping() {
        if (pop.hidden) return false;
        const active = element.getRootNode().activeElement;
        return active === startField.input || active === endField.input;
      },
      closeEditor,
      destroy() {
        closeEditor();
        element.removeEventListener('click', onClick);
        element.removeEventListener('dblclick', onDoubleClick);
        element.remove();
      },
    };
  }

  /**
   * Capture-phase shortcuts for the range loop (mark A, mark B, toggle).
   * @param {{doc?:Document, signal:AbortSignal, enabled:()=>boolean, isTyping:()=>boolean,
   *          reserved?:()=>string[], handlers:{markStart?:()=>void,markEnd?:()=>void,toggle?:()=>void}}} options
   *   `reserved` lists KeyboardEvent.codes the viewer assigned to other PolyLingo actions; those win.
   */
  function bindRangeLoopKeys(options) {
    const doc = options.doc ?? document;
    const actionByCode = new Map(Object.entries(KEYS).map(([action, code]) => [code, action]));
    doc.addEventListener(
      'keydown',
      (event) => {
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        const action = actionByCode.get(event.code);
        if (!action) return;
        if (!options.enabled() || options.isTyping()) return;
        if (options.reserved && options.reserved().includes(event.code)) return;
        const first = typeof event.composedPath === 'function' ? event.composedPath()[0] : null;
        if (isEditable(first) || isEditable(event.target)) return;
        const handler = options.handlers[action];
        if (!handler) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        handler();
      },
      { capture: true, signal: options.signal },
    );
  }

  return {
    RANGE_LOOP_CSS: CSS,
    RANGE_LOOP_KEYS: KEYS,
    createRangeLoopControl,
    bindRangeLoopKeys,
    formatRange,
    rangeLoopText,
  };
});
