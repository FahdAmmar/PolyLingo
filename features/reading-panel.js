/**
 * Reading panel — PolyLingo 0.5 (the sidebar of "Focus reading")
 *
 * - Shows the WHOLE transcript (both languages per scene), not a 15-row window.
 * - The active scene is pinned at a fixed "spot" (a point ~36 % from the top) and
 *   shown as a glowing card; the list scrolls under it like a lyrics view.
 * - Clicking / pressing Enter on a scene seeks the video to that scene.
 * - If the viewer scrolls manually, auto-follow pauses (so they can read ahead)
 *   and resumes after 5 s of inactivity, on click, or via the "current" button.
 *
 * Sync contract: this class never looks at the video clock. The owner calls
 * `setActive(index)` with the scene derived from the cues the on-video overlay
 * is showing, so the sidebar and the picture cannot disagree.
 *
 * Performance (0.6): up to VIRTUAL_MIN scenes every row is built once and laid out by the
 * browser (the 0.5 behaviour). Longer transcripts (a 3-hour lecture has ~4 700 scenes) are
 * virtualised: only the rows around the viewport exist in the DOM, positioned from measured
 * heights (`virtual-list.js`). An active-scene change touches two rows (O(1)).
 * All subtitle text is inserted with `textContent` (it is untrusted input).
 *
 * 0.6 also adds: view modes (both / one language / recall), search highlighting, word click,
 * timestamps toggle, language swap, font scale and a right-hand panel side.
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
    ? { ...nodeRequire('./scene-timeline.js'), ...nodeRequire('./scene-controls.js'), ...nodeRequire('./virtual-list.js'), ...nodeRequire('./transcript-search.js') }
    : globalThis.PolyLingoFeatures;
  const { SEEK_EPSILON, formatClock, createSceneButtons, SCENE_CONTROLS_CSS, HeightIndex, findRanges, foldQuery } = features;

  /** Where the active scene is pinned, as a fraction of the list height. */
  const SPOT_RATIO = 0.36;
  /** Up to this many scenes every row is rendered; above it the list is virtualised. */
  const VIRTUAL_MIN = 120;
  /** Pixels between two virtualised rows (the flow layout uses a margin instead). */
  const ROW_GAP = 3;
  /** Auto-follow resumes this long after the last manual scroll. */
  const RESUME_MS = 5000;
  const SPLIT_MIN = 28;
  const SPLIT_MAX = 65;

  const LABELS = {
    en: {
      title: 'Focus reading',
      close: 'Exit focus',
      current: 'Current',
      jump: 'Jump to the current scene',
      empty: 'No subtitles loaded yet.',
      resize: 'Resize panel',
      list: 'Subtitles',
      reveal: 'Click to reveal',
    },
    ar: {
      title: 'وضع القراءة المركّزة',
      close: 'الخروج من وضع القراءة',
      current: 'الحالية',
      jump: 'الانتقال إلى المشهد الحالي',
      empty: 'لم تُحمَّل ترجمات بعد.',
      resize: 'تغيير حجم اللوحة',
      list: 'الترجمات',
      reveal: 'اضغط للإظهار',
    },
  };

  const CSS = `${SCENE_CONTROLS_CSS}
.rp {
  display: none; position: absolute; inset: 0 auto 0 0; width: var(--pl-split, 42%); z-index: 5;
  box-sizing: border-box; flex-direction: column; pointer-events: auto; color: #eef0f6;
  /* Chrome stays LTR even on RTL pages (splitter / border must sit on the video side);
     every text block carries its own dir. */
  direction: ltr;
  background: radial-gradient(120% 60% at 0% 0%, #131726 0%, #0b0c13 60%) , #0b0c13;
  border-inline-end: 1px solid rgba(255,255,255,.1);
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
}
.rp[data-side="right"] { inset: 0 0 0 auto; border-inline-end: 0; border-inline-start: 1px solid rgba(255,255,255,.1); }
.rp[data-open] { display: flex; }
.rp-head { display: flex; align-items: center; gap: .6rem; padding: .7rem .8rem .55rem; flex: none; }
.rp-title { display: flex; flex-direction: column; min-width: 0; margin-inline-end: auto; }
.rp-title-text { font-weight: 700; font-size: 14px; letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-close {
  width: 34px; height: 34px; padding: 0; display: grid; place-items: center; cursor: pointer; color: #fff;
  border-radius: .6rem; border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.06); font-size: 16px; line-height: 1;
}
.rp-close:hover { background: rgba(255,255,255,.16); }
.rp-close:focus-visible, .rp-jump:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.rp-main { position: relative; flex: 1; min-height: 0; margin-bottom: var(--pl-controls, 0px); }
.rp-scroll {
  position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; outline: none; overflow-anchor: none;
  padding-block: var(--rp-pad-top, 30%) var(--rp-pad-bottom, 60%);
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.22) transparent;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 88%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 88%, transparent 100%);
}
.rp-scroll:focus-visible { box-shadow: inset 0 0 0 2px rgba(45,212,191,.5); }
.rp-list { position: relative; }
.rp-empty { margin: 0; padding: 1rem; text-align: center; color: #8d97ad; font-size: 13px; }
.rp-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: .75rem; align-items: start;
  margin: .15rem .6rem; padding: .7rem .85rem; border-radius: .85rem; cursor: pointer;
  border: 1px solid transparent; opacity: .5;
  transition: opacity 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}
.rp-list[data-virtual] .rp-row { position: absolute; top: 0; left: .6rem; right: .6rem; margin: 0; box-sizing: border-box; }
.rp[data-times="off"] .rp-row { grid-template-columns: minmax(0, 1fr); }
.rp[data-times="off"] .rp-time { display: none; }
.rp-row:hover { opacity: .92; background: rgba(255,255,255,.05); }
.rp-row:focus-visible { outline: 2px solid #8b6cff; outline-offset: -2px; opacity: 1; }
.rp-row[data-upcoming] { opacity: .85; border-color: rgba(255,255,255,.2); border-style: dashed; }
.rp-row[data-match] { border-color: rgba(250,204,21,.32); }
.rp-row[data-match-current] { border-color: #facc15; opacity: 1; box-shadow: 0 0 0 1px rgba(250,204,21,.5); }
.rp-row[data-active] {
  opacity: 1; border-color: rgba(45,212,191,.55);
  background: linear-gradient(90deg, rgba(45,212,191,.22), rgba(45,212,191,.07));
  box-shadow: inset 3px 0 0 #2dd4bf, 0 10px 26px -14px rgba(45,212,191,.6);
}
.rp-row[data-pending] { border-color: rgba(139,108,255,.7); }
.rp-time { padding-top: .22rem; font: 600 11px/1.5 ui-monospace, "IBM Plex Mono", Consolas, monospace; color: #7c8397; font-variant-numeric: tabular-nums; }
.rp-row[data-active] .rp-time { color: #5eead4; }
.rp-body { min-width: 0; display: flex; flex-direction: column; }
.rp-p, .rp-s { white-space: pre-line; overflow-wrap: anywhere; text-align: start; line-height: 1.42; }
.rp-p { font-size: calc(clamp(15px, 1.3vw, 22px) * var(--rp-fs, 1)); font-weight: 650; color: var(--rp-c1, #f2f2f5); font-family: var(--rp-ff, inherit); }
.rp-s { margin-top: .22rem; font-size: calc(clamp(13px, 1.05vw, 18px) * var(--rp-fs, 1)); color: var(--rp-c2, #7ee0cc); font-family: var(--rp-ff, inherit); }
.rp[data-swap] .rp-s { order: 1; margin-top: 0; }
.rp[data-swap] .rp-p { order: 2; margin-top: .22rem; }
.rp-p[data-recall], .rp-s[data-recall] { filter: blur(7px); cursor: pointer; user-select: none; transition: filter 140ms ease; }
.rp-p[data-recall]:hover, .rp-s[data-recall]:hover { filter: blur(5px); }
.rp-row .w { border-radius: .2em; }
.rp-list[data-lookup] .rp-row .w { cursor: pointer; }
.rp-list[data-lookup] .rp-row .w:hover { background: rgba(45,212,191,.35); }
.rp-row .hit { background: rgba(250,204,21,.3); color: inherit; border-radius: .2em; }
.rp-jump {
  position: absolute; inset-inline-end: .9rem; bottom: .8rem; display: none; align-items: center; gap: .4rem;
  padding: .45rem .8rem; border-radius: 999px; cursor: pointer; font: 600 12px system-ui, sans-serif;
  color: #04211c; background: #2dd4bf; border: 0; box-shadow: 0 8px 22px -8px rgba(45,212,191,.8);
}
.rp-jump[data-show] { display: inline-flex; }
.rp-split { position: absolute; top: 0; bottom: 0; inset-inline-end: -5px; width: 10px; cursor: col-resize; touch-action: none; z-index: 2; }
.rp[data-side="right"] .rp-split { inset-inline-end: auto; left: -5px; }
.rp-split::after { content: ""; position: absolute; top: 50%; left: 4px; width: 2px; height: 44px; margin-top: -22px; border-radius: 2px; background: rgba(255,255,255,.28); transition: background 120ms ease, height 120ms ease; }
.rp-split:hover::after, .rp-split:focus-visible::after, .rp-split[data-drag]::after { background: #2dd4bf; height: 64px; margin-top: -32px; }
.rp-split:focus-visible { outline: none; }
.rp[data-lite] *, .rp[data-lite] *::after { transition: none !important; animation: none !important; }
@media (max-width: 700px) { .rp { width: max(var(--pl-split, 42%), 46%); } .rp-row { margin-inline: .3rem; padding-inline: .55rem; } .rp-list[data-virtual] .rp-row { left: .3rem; right: .3rem; } .rp-time { display: none; } .rp-row { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { .rp-row, .rp-split::after, .rp-p[data-recall], .rp-s[data-recall] { transition: none; } }
`;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function overlaps(ranges, start, end) {
    for (const [from, to] of ranges) if (from < end && to > start) return true;
    return false;
  }

  function inside(ranges, start, end) {
    for (const [from, to] of ranges) if (from <= start && to >= end) return true;
    return false;
  }

  class ReadingPanel {
    /**
     * @param {Document} doc
     * @param {{onSeek:(videoTime:number)=>void,
     *          onAction:(action:'previous'|'replay'|'next')=>void,
     *          onClose:()=>void,
     *          onSplit:(percent:number)=>void,
     *          onSplitCommit:(percent:number)=>void,
     *          onCount?:(position:number,total:number)=>void,
     *          onWord?:(hit:{scene:number,line:'primary'|'secondary',word:string})=>void,
     *          segment?:(text:string,language:string)=>Array<{text:string,word:boolean}>}} options
     */
    constructor(doc, options) {
      this.doc = doc;
      this.options = options;
      this.language = 'en';
      this.timeline = null;
      /** @type {Array<import('./scene-timeline.js').Scene>} */
      this.scenes = [];
      /** scene index -> row element (every row below VIRTUAL_MIN scenes, a window above) */
      this.rendered = new Map();
      this.heights = new HeightIndex(0);
      this.virtual = false;
      this.padTop = 0;
      this.activeIndex = -1;
      this.upcomingIndex = -1;
      this.pendingIndex = -1;
      this.focusIndex = -1;
      this.aimIndex = -1;
      this.aimPasses = 0;
      this.aimUntil = 0;
      this.aimDistance = 0;
      this.following = true;
      this.open = false;
      this.dirs = { primary: 'auto', secondary: 'auto' };
      this.languages = { primary: '', secondary: '' };
      this.display = { view: 'both', recallHides: 'secondary', showTimes: true, swap: false, fontScale: 1, side: 'left', lite: false };
      this.wordLookup = false;
      this.query = '';
      this.matchSet = new Set();
      this.currentMatch = -1;
      this.revealed = new Set();
      this.resumeTimer = undefined;
      this.frame = 0;
      this.lastWidth = 0;
      this.splitPercent = 42;
      this.destroyed = false;
      this.abort = new AbortController();

      const el = doc.createElement('aside');
      el.className = 'rp';
      this.element = el;

      const head = doc.createElement('div');
      head.className = 'rp-head';
      const title = doc.createElement('div');
      title.className = 'rp-title';
      this.titleText = doc.createElement('span');
      this.titleText.className = 'rp-title-text';
      title.append(this.titleText);
      this.buttons = createSceneButtons(doc, { onAction: (action) => options.onAction(action) });
      this.closeButton = doc.createElement('button');
      this.closeButton.type = 'button';
      this.closeButton.className = 'rp-close';
      this.closeButton.textContent = '✕';
      this.closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onClose();
      });
      head.append(title, this.buttons.element, this.closeButton);

      const main = doc.createElement('div');
      main.className = 'rp-main';
      this.scroller = doc.createElement('div');
      this.scroller.className = 'rp-scroll';
      this.scroller.tabIndex = 0;
      this.scroller.setAttribute('role', 'group');
      this.list = doc.createElement('div');
      this.list.className = 'rp-list';
      this.emptyEl = doc.createElement('p');
      this.emptyEl.className = 'rp-empty';
      this.scroller.append(this.list, this.emptyEl);
      this.jumpButton = doc.createElement('button');
      this.jumpButton.type = 'button';
      this.jumpButton.className = 'rp-jump';
      this.jumpButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.resumeFollowing();
      });
      main.append(this.scroller, this.jumpButton);

      this.splitter = doc.createElement('div');
      this.splitter.className = 'rp-split';
      this.splitter.setAttribute('role', 'separator');
      this.splitter.setAttribute('aria-orientation', 'vertical');
      this.splitter.tabIndex = 0;

      el.append(head, main, this.splitter);
      this.bind();
      this.applyLabels('en', null);
      this.refreshEmpty();
    }

    bind() {
      const { signal } = this.abort;
      this.list.addEventListener('click', this.onListClick, { signal });
      this.list.addEventListener('keydown', this.onListKeydown, { signal });
      this.list.addEventListener('focusin', this.onFocusIn, { signal });
      this.list.addEventListener('focusout', () => (this.focusIndex = -1), { signal });
      // Clicking a row must not leave keyboard focus on it (see onListKeydown).
      this.list.addEventListener('mousedown', (event) => event.target instanceof Element && event.target.closest('.rp-row') && event.preventDefault(), { signal });
      const pause = () => this.pauseFollowing();
      this.scroller.addEventListener('wheel', pause, { passive: true, signal });
      this.scroller.addEventListener('touchmove', pause, { passive: true, signal });
      // Dragging the scrollbar targets the scroller itself, not a row.
      this.scroller.addEventListener('pointerdown', (event) => event.target === this.scroller && pause(), { signal });
      this.scroller.addEventListener('scroll', this.onScroll, { passive: true, signal });
      this.scroller.addEventListener(
        'keydown',
        (event) => {
          if (['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) pause();
        },
        { signal },
      );
      this.splitter.addEventListener('pointerdown', this.onSplitDown, { signal });
      this.splitter.addEventListener('keydown', this.onSplitKey, { signal });
      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.scroller);
      }
    }

    /** @param {'en'|'ar'} language @param {{previous?:string,replay?:string,next?:string}|null} codes */
    applyLabels(language, codes) {
      this.language = language in LABELS ? language : 'en';
      const labels = LABELS[this.language];
      this.element.setAttribute('aria-label', labels.title);
      this.titleText.textContent = labels.title;
      this.closeButton.title = labels.close;
      this.closeButton.setAttribute('aria-label', labels.close);
      this.jumpButton.textContent = `↓ ${labels.current}`;
      this.jumpButton.title = labels.jump;
      this.jumpButton.setAttribute('aria-label', labels.jump);
      this.emptyEl.textContent = labels.empty;
      this.scroller.setAttribute('aria-label', labels.list);
      this.splitter.setAttribute('aria-label', labels.resize);
      this.buttons.update(this.language, codes);
    }

    /** @param {{primaryColor:string,secondaryColor:string,fontFamily:string}} theme */
    applyTheme(theme) {
      const style = this.element.style;
      style.setProperty('--rp-c1', theme.primaryColor);
      style.setProperty('--rp-c2', theme.secondaryColor);
      style.setProperty('--rp-ff', theme.fontFamily);
    }

    /** @param {'auto'|'ltr'|'rtl'} primary @param {'auto'|'ltr'|'rtl'} secondary */
    setDirections(primary, secondary) {
      this.dirs = { primary, secondary };
      for (const el of this.list.querySelectorAll('.rp-p')) el.dir = primary;
      for (const el of this.list.querySelectorAll('.rp-s')) el.dir = secondary;
    }

    /** Language codes used to split lines into words (for the word card). */
    setLanguages(primary, secondary) {
      if (primary === this.languages.primary && secondary === this.languages.secondary) return;
      this.languages = { primary, secondary };
      if (this.wordLookup) this.rebuildRows();
    }

    setWordLookup(enabled) {
      const next = Boolean(enabled) && typeof this.options.segment === 'function';
      if (next === this.wordLookup) return;
      this.wordLookup = next;
      this.list.toggleAttribute('data-lookup', next);
      this.rebuildRows();
    }

    /**
     * @param {Partial<{view:string,recallHides:string,showTimes:boolean,swap:boolean,fontScale:number,side:string,lite:boolean}>} patch
     */
    setDisplay(patch) {
      const before = this.display;
      const next = { ...before, ...patch };
      const layoutChanged = ['view', 'recallHides', 'showTimes', 'swap', 'fontScale'].some((key) => next[key] !== before[key]);
      const viewChanged = next.view !== before.view || next.recallHides !== before.recallHides;
      this.display = next;
      const el = this.element;
      el.dataset.view = next.view;
      el.toggleAttribute('data-swap', next.swap);
      el.dataset.times = next.showTimes ? 'on' : 'off';
      el.dataset.side = next.side;
      el.toggleAttribute('data-lite', next.lite);
      el.style.setProperty('--rp-fs', String(next.fontScale));
      if (viewChanged) this.revealed.clear();
      if (layoutChanged) this.rebuildRows();
    }

    /** @param {import('./scene-timeline.js').SceneTimeline|null} timeline */
    setTimeline(timeline) {
      this.timeline = timeline;
      this.scenes = timeline ? timeline.scenes : [];
      this.activeIndex = -1;
      this.upcomingIndex = -1;
      this.pendingIndex = -1;
      this.aimIndex = -1;
      this.revealed.clear();
      this.searchData = null;
      this.matchSet = new Set();
      this.currentMatch = -1;
      this.query = '';
      this.virtual = this.scenes.length > VIRTUAL_MIN;
      this.list.toggleAttribute('data-virtual', this.virtual);
      this.heights.reset(this.scenes.length, this.heights.estimate);
      this.clearRows();
      this.scroller.scrollTop = 0;
      this.syncListHeight();
      this.refreshEmpty();
      this.updateCount();
      this.renderWindow();
    }

    refreshEmpty() {
      this.emptyEl.hidden = this.scenes.length > 0;
    }

    // ---- rows ------------------------------------------------------------

    clearRows() {
      for (const row of this.rendered.values()) row.remove();
      this.rendered.clear();
    }

    createRow(index) {
      const scene = this.scenes[index];
      const row = this.doc.createElement('div');
      row.className = 'rp-row';
      row.setAttribute('role', 'button');
      row.tabIndex = index === this.activeIndex ? 0 : -1;
      row.dataset.i = String(index);
      if (index === this.activeIndex) {
        row.setAttribute('data-active', '');
        row.setAttribute('aria-current', 'true');
      }
      if (index === this.upcomingIndex) row.setAttribute('data-upcoming', '');
      if (index === this.pendingIndex) row.setAttribute('data-pending', '');
      if (this.matchSet.has(index)) row.setAttribute('data-match', '');
      if (index === this.currentMatch) row.setAttribute('data-match-current', '');

      const time = this.doc.createElement('span');
      time.className = 'rp-time';
      time.textContent = formatClock(scene.startTime);
      const body = this.doc.createElement('div');
      body.className = 'rp-body';
      const hasPrimary = Boolean(scene.primary);
      const hasSecondary = scene.secondary.length > 0;
      const { view, recallHides } = this.display;
      const showPrimary = hasPrimary && (view !== 'secondary' || !hasSecondary);
      const showSecondary = hasSecondary && (view !== 'primary' || !hasPrimary);
      const revealed = this.revealed.has(index);
      if (showPrimary) {
        const line = this.doc.createElement('div');
        line.className = 'rp-p';
        line.dir = this.dirs.primary;
        this.fillLine(line, scene.primary.text, 'primary');
        if (view === 'recall' && recallHides === 'primary' && showSecondary && !revealed) this.hideLine(line);
        body.append(line);
      }
      if (showSecondary) {
        const line = this.doc.createElement('div');
        line.className = 'rp-s';
        line.dir = this.dirs.secondary;
        this.fillLine(line, scene.secondary.map((cue) => cue.text).join(' '), 'secondary');
        if (view === 'recall' && recallHides === 'secondary' && showPrimary && !revealed) this.hideLine(line);
        body.append(line);
      }
      row.append(time, body);
      return row;
    }

    hideLine(line) {
      line.setAttribute('data-recall', '');
      line.title = LABELS[this.language].reveal;
    }

    /** Plain text, or word spans (word card) and highlight marks — always through textContent. */
    fillLine(el, text, which) {
      const ranges = this.query ? findRanges(text, this.query) : [];
      const segments = this.wordLookup ? this.options.segment(text, this.languages[which]) : null;
      if (segments) {
        const nodes = [];
        let at = 0;
        for (const segment of segments) {
          const start = at;
          at += segment.text.length;
          if (segment.word) {
            const span = this.doc.createElement('span');
            span.className = 'w';
            span.textContent = segment.text;
            if (ranges.length > 0 && overlaps(ranges, start, at)) span.classList.add('hit');
            nodes.push(span);
          } else if (ranges.length > 0 && (/[\p{L}\p{N}]/u.test(segment.text) ? overlaps(ranges, start, at) : inside(ranges, start, at))) {
            // numbers are not lookup words, and the spaces between two highlighted words belong to the highlight
            const gap = this.doc.createElement('span');
            gap.className = 'hit';
            gap.textContent = segment.text;
            nodes.push(gap);
          } else {
            nodes.push(this.doc.createTextNode(segment.text));
          }
        }
        el.replaceChildren(...nodes);
      } else if (ranges.length > 0) {
        const nodes = [];
        let at = 0;
        for (const [start, end] of ranges) {
          if (start > at) nodes.push(this.doc.createTextNode(text.slice(at, start)));
          const mark = this.doc.createElement('mark');
          mark.className = 'hit';
          mark.textContent = text.slice(start, end);
          nodes.push(mark);
          at = end;
        }
        if (at < text.length) nodes.push(this.doc.createTextNode(text.slice(at)));
        el.replaceChildren(...nodes);
      } else {
        el.textContent = text;
      }
    }

    /** Re-create the rendered rows (display options changed). Keeps the reading position. */
    rebuildRows(invalidateHeights = true) {
      const anchor = this.captureAnchor();
      if (invalidateHeights) this.heights.invalidate();
      this.clearRows();
      this.syncListHeight();
      this.renderWindow();
      this.restoreAnchor(anchor);
      if (this.following) this.scrollToActive(true);
    }

    captureAnchor() {
      if (!this.virtual || this.scenes.length === 0) return null;
      const y = this.scroller.scrollTop - this.padTop;
      const index = this.heights.indexAt(y);
      return { index, within: y - this.heights.offsetOf(index) };
    }

    /** True while a jump is still settling (rows near the target are being measured). */
    get aiming() {
      return this.aimIndex >= 0 && performance.now() < this.aimUntil;
    }

    restoreAnchor(anchor) {
      if (!anchor || this.aiming) return;
      this.scroller.scrollTop = Math.max(0, this.padTop + this.heights.offsetOf(anchor.index) + anchor.within);
      this.renderWindow();
    }

    onScroll = () => {
      if (this.aiming) {
        // Smooth scrolling gets closer to the target; scrolling that moves away from it is not ours
        // (the user, a scripted scroll, assistive tech) and must not be pulled back.
        const target = this.targetTop(this.aimIndex);
        if (target !== null) {
          const distance = Math.abs(target - this.scroller.scrollTop);
          if (distance > this.aimDistance + 6) this.aimIndex = -1;
          else this.aimDistance = distance;
        }
      }
      if (!this.virtual || this.frame) return;
      const view = this.doc.defaultView;
      if (!view) return;
      this.frame = view.requestAnimationFrame(() => {
        this.frame = 0;
        this.renderWindow();
      });
    };

    onResize() {
      if (this.destroyed) return;
      const width = this.scroller.clientWidth;
      const widthChanged = Math.abs(width - this.lastWidth) > 0.5;
      this.lastWidth = width;
      this.measure();
      if (widthChanged && this.scenes.length > 0) this.rebuildRows(true);
      else this.renderWindow();
      if (this.following) this.scrollToActive(true);
    }

    onFocusIn = (event) => {
      const row = event.target instanceof Element ? event.target.closest('.rp-row') : null;
      this.focusIndex = row ? Number(row.dataset.i) : -1;
    };

    /** Make the DOM match the viewport: add the missing rows, drop the far ones, measure the new ones. */
    renderWindow() {
      if (this.destroyed) return;
      const count = this.scenes.length;
      if (count === 0) {
        this.clearRows();
        return;
      }
      let first = 0;
      let last = count - 1;
      if (this.virtual) {
        const viewHeight = this.scroller.clientHeight;
        if (!this.open || viewHeight <= 0) {
          this.clearRows();
          return;
        }
        const overscan = Math.max(240, viewHeight);
        const top = this.scroller.scrollTop - this.padTop;
        [first, last] = this.heights.range(top - overscan, top + viewHeight + overscan);
      }
      const keep = new Set();
      for (const index of [this.activeIndex, this.upcomingIndex, this.pendingIndex, this.focusIndex]) if (index >= 0 && index < count) keep.add(index);
      for (const [index, row] of this.rendered) {
        if ((index < first || index > last) && !keep.has(index)) {
          row.remove();
          this.rendered.delete(index);
        }
      }
      const need = [];
      for (let index = first; index <= last; index++) if (!this.rendered.has(index)) need.push(index);
      for (const index of keep) if ((index < first || index > last) && !this.rendered.has(index)) need.push(index);
      if (need.length === 0) return;
      need.sort((a, b) => a - b);
      const existing = [...this.rendered.keys()].sort((a, b) => a - b);
      let pointer = 0;
      for (const index of need) {
        while (pointer < existing.length && existing[pointer] < index) pointer += 1;
        const reference = pointer < existing.length ? this.rendered.get(existing[pointer]) : null;
        const row = this.createRow(index);
        this.list.insertBefore(row, reference ?? null);
        this.rendered.set(index, row);
        if (this.virtual) row.style.transform = `translateY(${this.heights.offsetOf(index)}px)`;
      }
      if (this.virtual) this.measureRows(need);
    }

    /** Measure freshly rendered rows and move everything that depends on their real height. */
    measureRows(indexes) {
      if (!this.open || this.scroller.clientHeight <= 0) return;
      const y = this.scroller.scrollTop - this.padTop;
      const anchorIndex = this.heights.indexAt(y);
      const anchorOffset = this.heights.offsetOf(anchorIndex);
      let changed = false;
      for (const index of indexes) {
        const row = this.rendered.get(index);
        if (!row) continue;
        const height = row.offsetHeight;
        if (height > 0 && this.heights.setMeasured(index, height + ROW_GAP)) changed = true;
      }
      if (!changed) return;
      const mean = this.heights.meanMeasured();
      if (Math.abs(mean - this.heights.estimate) / this.heights.estimate > 0.08) this.heights.setEstimate(mean);
      this.heights.flush();
      for (const [index, row] of this.rendered) row.style.transform = `translateY(${this.heights.offsetOf(index)}px)`;
      this.syncListHeight();
      const delta = this.heights.offsetOf(anchorIndex) - anchorOffset;
      if (this.aiming) this.reaim();
      else if (Math.abs(delta) > 0.5) this.scroller.scrollTop += delta;
    }

    syncListHeight() {
      this.list.style.height = this.virtual ? `${Math.ceil(this.heights.total)}px` : '';
    }

    // ---- active scene ----------------------------------------------------

    /**
     * @param {number} index scene index shown on the video right now, or -1 in a gap
     * @param {number} upcoming first scene after the gap (only meaningful when index is -1)
     */
    setActive(index, upcoming = -1) {
      if (index === this.activeIndex && upcoming === this.upcomingIndex) return;
      const previous = this.rendered.get(this.activeIndex);
      if (previous) {
        previous.removeAttribute('data-active');
        previous.removeAttribute('aria-current');
        previous.tabIndex = -1;
      }
      this.rendered.get(this.upcomingIndex)?.removeAttribute('data-upcoming');
      this.activeIndex = index;
      this.upcomingIndex = index < 0 ? upcoming : -1;
      if (this.pendingIndex === index) this.pendingIndex = -1;
      let row = this.rendered.get(index);
      if (!row && index >= 0 && this.virtual) {
        this.renderWindow();
        row = this.rendered.get(index);
      }
      if (row) {
        row.setAttribute('data-active', '');
        row.setAttribute('aria-current', 'true');
        row.removeAttribute('data-pending');
        row.tabIndex = 0;
      }
      this.rendered.get(this.upcomingIndex)?.setAttribute('data-upcoming', '');
      this.updateCount();
      if (this.following) this.scrollToActive(false);
    }

    updateCount() {
      const size = this.scenes.length;
      // In a gap `upcomingIndex` equals the number of scenes already finished.
      const position = size === 0 ? 0 : this.activeIndex >= 0 ? this.activeIndex + 1 : Math.max(0, this.upcomingIndex);
      this.options.onCount?.(position, size);
    }

    get size() {
      return this.scenes.length;
    }

    get activeScene() {
      return this.activeIndex >= 0 ? (this.scenes[this.activeIndex] ?? null) : null;
    }

    setOpen(open) {
      this.open = open;
      this.element.toggleAttribute('data-open', open);
      if (!open) {
        if (this.virtual) this.clearRows();
        return;
      }
      this.following = true;
      this.updateJump();
      this.lastWidth = this.scroller.clientWidth;
      this.measure();
      this.renderWindow();
      this.scrollToActive(true);
    }

    setSplit(percent) {
      this.splitPercent = clamp(percent, SPLIT_MIN, SPLIT_MAX);
      this.splitter.setAttribute('aria-valuenow', String(Math.round(this.splitPercent)));
      this.splitter.setAttribute('aria-valuemin', String(SPLIT_MIN));
      this.splitter.setAttribute('aria-valuemax', String(SPLIT_MAX));
    }

    /** Pad the list so the first and last scene can both reach the spot. */
    measure() {
      const height = this.scroller.clientHeight;
      if (height <= 0) return;
      const spot = Math.round(height * SPOT_RATIO);
      this.padTop = spot;
      this.scroller.style.setProperty('--rp-pad-top', `${spot}px`);
      this.scroller.style.setProperty('--rp-pad-bottom', `${Math.max(0, height - spot)}px`);
    }

    /** scrollTop that puts the middle of row `index` on the spot, or null when it cannot be known yet. */
    targetTop(index) {
      const scroller = this.scroller;
      const spot = scroller.clientHeight * SPOT_RATIO;
      let centre;
      if (this.virtual) {
        centre = this.padTop + this.heights.offsetOf(index) + (this.heights.heightOf(index) - ROW_GAP) / 2;
      } else {
        const row = this.rendered.get(index);
        if (!row) return null;
        centre = this.list.offsetTop + row.offsetTop + row.offsetHeight / 2;
      }
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      return clamp(centre - spot, 0, max);
    }

    scrollToActive(instant) {
      if (!this.open) return;
      const index = this.activeIndex >= 0 ? this.activeIndex : this.upcomingIndex;
      if (index < 0 || index >= this.scenes.length) return;
      this.scrollToIndex(index, { instant });
    }

    /** Bring a scene to the spot. Rows far away are measured on arrival and the aim is corrected. */
    scrollToIndex(index, { instant = false } = {}) {
      if (!this.open || index < 0 || index >= this.scenes.length) return;
      this.aimIndex = index;
      this.aimPasses = 0;
      this.aimUntil = performance.now() + 500;
      if (this.virtual && !this.rendered.has(index)) this.rendered.set(index, this.createAndPlace(index));
      const top = this.targetTop(index);
      if (top === null) return;
      const scroller = this.scroller;
      const far = Math.abs(top - scroller.scrollTop) > scroller.clientHeight * 2;
      const reduce = this.display.lite || this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      const smooth = !(instant || far || reduce);
      this.aimDistance = smooth ? Math.abs(top - scroller.scrollTop) : 0;
      scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
      if (!smooth) this.renderWindow();
    }

    createAndPlace(index) {
      const row = this.createRow(index);
      this.list.append(row);
      if (this.virtual) row.style.transform = `translateY(${this.heights.offsetOf(index)}px)`;
      return row;
    }

    /** Heights changed after a jump: aim again (bounded, rows near the target get measured each time). */
    reaim() {
      if (!this.aiming || this.aimPasses >= 4) return;
      const top = this.targetTop(this.aimIndex);
      if (top === null || Math.abs(top - this.scroller.scrollTop) <= 2) return;
      this.aimPasses += 1;
      this.scroller.scrollTop = top;
      this.renderWindow();
    }

    // ---- following / seeking ---------------------------------------------

    pauseFollowing() {
      this.following = false;
      this.aimIndex = -1;
      this.updateJump();
      clearTimeout(this.resumeTimer);
      this.resumeTimer = setTimeout(() => this.maybeResume(), RESUME_MS);
    }

    maybeResume() {
      // Never yank the list away while the pointer is still reading in it.
      if (this.scroller.matches(':hover')) {
        this.resumeTimer = setTimeout(() => this.maybeResume(), RESUME_MS);
        return;
      }
      this.resumeFollowing();
    }

    resumeFollowing() {
      clearTimeout(this.resumeTimer);
      this.following = true;
      this.updateJump();
      this.scrollToActive(false);
    }

    updateJump() {
      this.jumpButton.toggleAttribute('data-show', this.open && !this.following);
    }

    seekIndex(index) {
      const scene = this.scenes[index];
      if (!scene) return;
      this.pendingIndex = index;
      this.rendered.get(index)?.setAttribute('data-pending', '');
      this.following = true;
      clearTimeout(this.resumeTimer);
      this.updateJump();
      this.options.onSeek(scene.startTime + SEEK_EPSILON);
    }

    onListClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target ? target.closest('.rp-row') : null;
      if (!target || !row) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(row.dataset.i);
      if (target.closest('[data-recall]')) {
        this.reveal(index);
        return;
      }
      const word = target.closest('.w');
      if (word && this.wordLookup) {
        const line = word.closest('.rp-s') ? 'secondary' : 'primary';
        this.options.onWord?.({ scene: index, line, word: word.textContent ?? '' });
        return;
      }
      this.seekIndex(index);
    };

    onListKeydown = (event) => {
      const row = event.target instanceof Element ? event.target.closest('.rp-row') : null;
      if (!row) return;
      // Enter only. Space belongs to YouTube (play/pause): handling it here made a
      // paused video jump back to the last clicked sentence.
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.seekIndex(Number(row.dataset.i));
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const next = Number(row.dataset.i) + (event.key === 'ArrowDown' ? 1 : -1);
        if (next < 0 || next >= this.scenes.length) return;
        // Stop YouTube's own arrow = seek ±5 s shortcut while navigating the list.
        event.preventDefault();
        event.stopPropagation();
        this.pauseFollowing();
        this.focusRow(next);
      }
    };

    focusRow(index) {
      let row = this.rendered.get(index);
      if (!row && this.virtual) {
        this.scrollToIndex(index, { instant: true });
        this.aimIndex = -1;
        row = this.rendered.get(index);
      }
      row?.focus({ preventScroll: false });
    }

    // ---- recall mode -----------------------------------------------------

    reveal(index) {
      this.revealed.add(index);
      this.rendered.get(index)?.querySelector('[data-recall]')?.removeAttribute('data-recall');
    }

    /** Recall shortcut: show (or hide again) the hidden line of the active scene. @returns {boolean} true when it did something */
    toggleRevealActive() {
      if (this.display.view !== 'recall' || this.activeIndex < 0) return false;
      if (this.revealed.has(this.activeIndex)) this.revealed.delete(this.activeIndex);
      else this.revealed.add(this.activeIndex);
      this.rendered.get(this.activeIndex)?.remove();
      this.rendered.delete(this.activeIndex);
      this.renderWindow();
      return true;
    }

    // ---- search ----------------------------------------------------------

    /**
     * @param {string} query folded query ('' clears)
     * @param {number[]} matches scene indexes
     * @param {number} current scene index of the current match, or -1
     * @param {{scroll?:boolean}} options
     */
    setSearch(query, matches, current, { scroll = true } = {}) {
      const queryChanged = query !== this.query;
      this.query = query;
      this.matchSet = new Set(matches);
      const previous = this.currentMatch;
      this.currentMatch = current;
      if (queryChanged) {
        for (const [index, row] of this.rendered) {
          row.remove();
          this.rendered.delete(index);
        }
        this.renderWindow();
      } else {
        this.rendered.get(previous)?.removeAttribute('data-match-current');
        this.rendered.get(current)?.setAttribute('data-match-current', '');
      }
      if (scroll && current >= 0) {
        this.pauseFollowing();
        this.scrollToIndex(current, { instant: false });
      }
    }

    // ---- divider ---------------------------------------------------------

    onSplitDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const host = this.element.getRootNode().host;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0) return;
      this.splitter.setPointerCapture(event.pointerId);
      this.splitter.setAttribute('data-drag', '');
      const signal = this.abort.signal;
      const move = (moveEvent) => {
        const fraction = this.display.side === 'right' ? (rect.right - moveEvent.clientX) / rect.width : (moveEvent.clientX - rect.left) / rect.width;
        this.setSplit(fraction * 100);
        this.options.onSplit(this.splitPercent);
      };
      const end = () => {
        this.splitter.removeAttribute('data-drag');
        this.splitter.removeEventListener('pointermove', move);
        this.splitter.removeEventListener('pointerup', end);
        this.splitter.removeEventListener('pointercancel', end);
        this.options.onSplitCommit(this.splitPercent);
      };
      this.splitter.addEventListener('pointermove', move, { signal });
      this.splitter.addEventListener('pointerup', end, { signal });
      this.splitter.addEventListener('pointercancel', end, { signal });
    };

    onSplitKey = (event) => {
      const step = event.shiftKey ? 5 : 2;
      const grow = this.display.side === 'right' ? 'ArrowLeft' : 'ArrowRight';
      const shrink = this.display.side === 'right' ? 'ArrowRight' : 'ArrowLeft';
      const direction = event.key === grow ? 1 : event.key === shrink ? -1 : 0;
      if (direction === 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.setSplit(this.splitPercent + direction * step);
      this.options.onSplit(this.splitPercent);
      this.options.onSplitCommit(this.splitPercent);
    };

    destroy() {
      this.destroyed = true;
      clearTimeout(this.resumeTimer);
      if (this.frame) this.doc.defaultView?.cancelAnimationFrame(this.frame);
      this.abort.abort();
      this.resizeObserver?.disconnect();
      this.buttons.destroy();
      this.element.remove();
    }
  }

  return { READING_PANEL_CSS: CSS, ReadingPanel, SPOT_RATIO, VIRTUAL_MIN };
});
