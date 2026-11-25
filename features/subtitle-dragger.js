/**
 * Subtitle dragger — PolyLingo 0.5
 *
 * Lets the viewer drag each subtitle line (first language / second language)
 * anywhere over the video, independently of the other.
 *
 * How it works
 * - Each line lives in a "slot". By default both slots stack in the flow
 *   container (`flow`), exactly like before.
 * - Dragging a slot "floats" it: it is re-parented to the full-size `layer`
 *   and placed by `left/top` in percent of the layer, so it survives player
 *   resizes, theatre mode and fullscreen.
 * - On the first drag both visible slots are frozen at their current spot so
 *   the other line does not jump when its neighbour leaves the stack.
 *
 * Interaction
 * - Mouse/touch/pen: drag the grip or the text itself. A 5 px threshold separates
 *   a drag from a click, so a plain click still performs the word lookup.
 * - Keyboard: focus the grip, arrow keys move 1 % (Shift = 5 %), Home/Delete reset.
 * - Double-click the grip: reset that line.
 *
 * The component never persists anything itself; it reports through `onCommit`.
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

  const KEYS = ['primary', 'secondary'];
  const DRAG_THRESHOLD_PX = 5;
  const COMMIT_DELAY_MS = 300;

  const LABELS = {
    en: {
      primary: 'Move first-language subtitle. Arrow keys move it, Home resets.',
      secondary: 'Move second-language subtitle. Arrow keys move it, Home resets.',
      hint: 'Drag to move · double-click to reset',
    },
    ar: {
      primary: 'تحريك ترجمة اللغة الأولى. أسهم لوحة المفاتيح تحرّكها، Home لإعادتها.',
      secondary: 'تحريك ترجمة اللغة الثانية. أسهم لوحة المفاتيح تحرّكها، Home لإعادتها.',
      hint: 'اسحب للتحريك · انقر مرتين لإعادة الموضع',
    },
  };

  const CSS = `
.slot { position: relative; display: none; max-width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; }
.slot:has(> .line[data-visible]) { display: block; }
.slot[data-floating] {
  position: absolute; width: max-content; max-width: var(--pl-maxw, 80%);
  translate: calc(-50% + var(--pl-dx, 0px)) calc(-50% + var(--pl-dy, 0px));
}
.slot > .line { cursor: grab; }
.slot[data-locked] > .line { cursor: inherit; }
.slot[data-locked] > .grip { display: none; }
.slot[data-dragging] > .line { cursor: grabbing; outline: 2px dashed rgba(45,212,191,.95); outline-offset: 3px; }
.float { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
:host([data-focus]) .float { inset: 0 0 0 var(--pl-split, 42%); }
.grip {
  position: absolute; top: 50%; inset-inline-start: -30px; translate: 0 -50%; width: 24px; height: 34px; padding: 0;
  border: 1px solid rgba(255,255,255,.28); border-radius: .55rem; cursor: grab; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle, rgba(255,255,255,.92) 1.5px, transparent 1.8px) 0 0 / 8px 8px, rgba(12,14,22,.78);
  background-position: 3px 5px, 0 0; background-repeat: space, no-repeat;
  opacity: .55; transition: opacity 120ms ease, border-color 120ms ease;
}
.slot:hover > .grip, .grip:focus-visible, .slot[data-dragging] > .grip { opacity: 1; border-color: rgba(45,212,191,.8); }
.grip:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.slot[data-dragging] > .grip { cursor: grabbing; }
:host-context(.html5-video-player.ytp-autohide) .slot:not([data-dragging]) > .grip { opacity: 0; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .grip { transition: none; } }
`;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  class SubtitleDragger {
    /**
     * @param {{doc:Document, layer:HTMLElement, flow:HTMLElement,
     *          slots:{primary:HTMLElement,secondary:HTMLElement},
     *          onCommit:(positions:{primary:{x:number,y:number}|null,secondary:{x:number,y:number}|null})=>void,
     *          onChange?:()=>void}} options
     */
    constructor(options) {
      this.doc = options.doc;
      this.layer = options.layer;
      this.flow = options.flow;
      this.slots = options.slots;
      this.onCommit = options.onCommit;
      this.onChange = options.onChange ?? (() => {});
      /** @type {{primary:{x:number,y:number}|null,secondary:{x:number,y:number}|null}} */
      this.pos = { primary: null, secondary: null };
      this.session = null;
      this.locked = false;
      this.sessionAbort = null;
      this.commitTimer = undefined;
      this.refitFrame = 0;
      this.abort = new AbortController();
      this.grips = {};
      const { signal } = this.abort;
      for (const key of KEYS) {
        const slot = this.slots[key];
        const grip = this.doc.createElement('button');
        grip.type = 'button';
        grip.className = 'grip';
        grip.dataset.line = key;
        slot.prepend(grip);
        this.grips[key] = grip;
        slot.addEventListener('pointerdown', (event) => this.onPointerDown(key, event), { signal });
        grip.addEventListener('keydown', (event) => this.onGripKey(key, event), { signal });
        grip.addEventListener('dblclick', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.reset(key);
        }, { signal });
        // A grip click must never reach YouTube (it would toggle play/pause).
        grip.addEventListener('click', (event) => event.stopPropagation(), { signal });
      }
      this.applyLabels('en');
    }

    /** @param {'en'|'ar'} language */
    applyLabels(language) {
      const labels = LABELS[language] ?? LABELS.en;
      for (const key of KEYS) {
        this.grips[key].setAttribute('aria-label', labels[key]);
        this.grips[key].title = labels.hint;
      }
    }

    /** Current stored positions (copies). */
    positions() {
      return {
        primary: this.pos.primary && { ...this.pos.primary },
        secondary: this.pos.secondary && { ...this.pos.secondary },
      };
    }

    hasMoved() {
      return this.pos.primary !== null || this.pos.secondary !== null;
    }

    /** Apply positions coming from storage. Never echoes back through onCommit. */
    setPositions(positions) {
      for (const key of KEYS) {
        if (this.session?.active && this.session.key === key) continue;
        const target = positions[key];
        if (target) this.float(key, target);
        else this.unfloat(key);
      }
      this.onChange();
    }

    /**
     * Move a slot to another parent. Re-parenting blurs the focused element, so
     * keyboard users (arrow keys on the grip) would lose focus after the first
     * key press; restore it.
     */
    reparent(slot, move) {
      const active = slot.getRootNode().activeElement;
      const hadFocus = active instanceof HTMLElement && slot.contains(active);
      move();
      if (hadFocus) active.focus({ preventScroll: true });
    }

    float(key, position) {
      const slot = this.slots[key];
      if (slot.parentElement !== this.layer) this.reparent(slot, () => this.layer.append(slot));
      slot.setAttribute('data-floating', '');
      this.place(key, position);
    }

    place(key, position) {
      const slot = this.slots[key];
      this.pos[key] = { x: round2(position.x), y: round2(position.y) };
      slot.style.left = `${this.pos[key].x}%`;
      slot.style.top = `${this.pos[key].y}%`;
      slot.style.removeProperty('--pl-dx');
      slot.style.removeProperty('--pl-dy');
    }

    unfloat(key) {
      const slot = this.slots[key];
      if (this.pos[key] === null && !slot.hasAttribute('data-floating')) return;
      this.pos[key] = null;
      slot.removeAttribute('data-floating');
      for (const property of ['left', 'top', '--pl-dx', '--pl-dy']) slot.style.removeProperty(property);
      this.reparent(slot, () => (key === 'primary' ? this.flow.prepend(slot) : this.flow.append(slot)));
    }

    reset(key) {
      this.unfloat(key);
      this.onChange();
      this.commit();
    }

    /** Return both lines to the default stacked position (one storage write). */
    resetAll() {
      for (const key of KEYS) this.unfloat(key);
      this.onChange();
      this.commit();
    }

    /**
     * Turn the slot's current on-screen spot into a floating position without
     * any visual jump. Returns false when the slot is not visible.
     */
    freeze(key) {
      if (this.pos[key]) return true;
      const slot = this.slots[key];
      const rect = slot.getBoundingClientRect();
      const bounds = this.layer.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || bounds.width === 0 || bounds.height === 0) return false;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const to = (px, py) => ({ x: ((px - bounds.left) / bounds.width) * 100, y: ((py - bounds.top) / bounds.height) * 100 });
      this.float(key, to(cx, cy));
      // Re-parenting can change shrink-wrap width; correct any residual shift.
      const after = slot.getBoundingClientRect();
      const dx = after.left + after.width / 2 - cx;
      const dy = after.top + after.height / 2 - cy;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const current = this.pos[key];
        this.place(key, { x: current.x - (dx / bounds.width) * 100, y: current.y - (dy / bounds.height) * 100 });
      }
      return true;
    }

    /** Freeze every visible slot; `required` must succeed. */
    freezeVisible(required) {
      let ok = false;
      for (const key of KEYS) {
        const frozen = this.freeze(key);
        if (key === required) ok = frozen;
      }
      if (ok) this.onChange();
      return ok;
    }

    /** Lock dragging (prevents moving a line by accident); positions already set stay as they are. */
    setLocked(locked) {
      this.locked = Boolean(locked);
      for (const key of KEYS) this.slots[key].toggleAttribute('data-locked', this.locked);
    }

    onPointerDown(key, event) {
      if (this.locked || event.button !== 0 || this.session || !(event.target instanceof Element)) return;
      if (event.target.closest('.grip') === null && event.target.closest('.line') === null) return;
      this.session = { key, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, offsetX: 0, offsetY: 0, width: 0, height: 0 };
      // Both grip and text use the drag threshold: capturing the pointer on press would
      // retarget click/dblclick to the slot and the grip's double-click reset would never fire.
      this.sessionAbort = new AbortController();
      const options = { capture: true, signal: this.sessionAbort.signal };
      this.doc.addEventListener('pointermove', this.onPointerMove, options);
      this.doc.addEventListener('pointerup', this.onPointerUp, options);
      this.doc.addEventListener('pointercancel', this.onPointerUp, options);
    }

    begin() {
      const session = this.session;
      if (!session || !this.freezeVisible(session.key)) {
        this.endSession();
        return;
      }
      const slot = this.slots[session.key];
      const rect = slot.getBoundingClientRect();
      // Grab point = where the press happened, so the line stays under the pointer
      // and the first few pixels of movement are not lost to the threshold.
      session.offsetX = session.startX - (rect.left + rect.width / 2);
      session.offsetY = session.startY - (rect.top + rect.height / 2);
      session.width = rect.width;
      session.height = rect.height;
      session.active = true;
      try {
        slot.setPointerCapture(session.pointerId);
      } catch {
        // The pointer may already be gone; the document listeners still end the drag.
      }
      slot.setAttribute('data-dragging', '');
    }

    onPointerMove = (event) => {
      const session = this.session;
      if (!session || event.pointerId !== session.pointerId) return;
      if (!session.active) {
        if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < DRAG_THRESHOLD_PX) return;
        this.begin();
        if (!this.session?.active) return;
      }
      const bounds = this.layer.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      this.place(session.key, this.clampCentre(
        ((event.clientX - session.offsetX - bounds.left) / bounds.width) * 100,
        ((event.clientY - session.offsetY - bounds.top) / bounds.height) * 100,
        session.width,
        session.height,
        bounds,
      ));
    };

    onPointerUp = (event) => {
      const session = this.session;
      if (!session || event.pointerId !== session.pointerId) return;
      const { active, key } = session;
      this.endSession();
      if (!active) return;
      // A grip left focused after a mouse drag would swallow YouTube's Space = play/pause.
      const focused = this.slots[key].getRootNode().activeElement;
      if (focused instanceof HTMLElement && this.slots[key].contains(focused)) focused.blur();
      // The click that ends a drag must not trigger a word lookup or YouTube's play/pause.
      // Only the click retargeted to the slot by pointer capture is the drag's own
      // click; a genuine later click on a word targets the word and passes through.
      const slot = this.slots[key];
      const swallow = (clickEvent) => {
        if (clickEvent.target !== slot) return;
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
        slot.removeEventListener('click', swallow, true);
      };
      slot.addEventListener('click', swallow, true);
      setTimeout(() => slot.removeEventListener('click', swallow, true), 300);
      this.commit();
    };

    endSession() {
      const session = this.session;
      this.session = null;
      this.sessionAbort?.abort();
      this.sessionAbort = null;
      if (!session) return;
      const slot = this.slots[session.key];
      slot.removeAttribute('data-dragging');
      try {
        slot.releasePointerCapture(session.pointerId);
      } catch {
        // Already released.
      }
    }

    /** Keep the whole line inside the layer. */
    clampCentre(x, y, width, height, bounds) {
      const halfW = (width / 2 / bounds.width) * 100;
      const halfH = (height / 2 / bounds.height) * 100;
      return {
        x: halfW >= 50 ? 50 : clamp(x, halfW, 100 - halfW),
        y: halfH >= 50 ? 50 : clamp(y, halfH, 100 - halfH),
      };
    }

    onGripKey(key, event) {
      if (event.key === 'Home' || event.key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        this.reset(key);
        return;
      }
      const step = event.shiftKey ? 5 : 1;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[event.key];
      if (!move) return;
      // Stop YouTube's arrow = seek / volume shortcuts while the viewer positions a line.
      event.preventDefault();
      event.stopPropagation();
      if (!this.freezeVisible(key)) return;
      const bounds = this.layer.getBoundingClientRect();
      const rect = this.slots[key].getBoundingClientRect();
      const current = this.pos[key];
      this.place(key, this.clampCentre(current.x + move[0], current.y + move[1], rect.width, rect.height, bounds));
      this.scheduleCommit();
    }

    scheduleCommit() {
      clearTimeout(this.commitTimer);
      this.commitTimer = setTimeout(() => this.commit(), COMMIT_DELAY_MS);
    }

    commit() {
      clearTimeout(this.commitTimer);
      this.onChange();
      this.onCommit(this.positions());
    }

    /** Coalesced re-fit (text changed or the player was resized). */
    refitSoon() {
      if (this.refitFrame || !this.hasMoved()) return;
      const view = this.doc.defaultView;
      if (!view) return;
      this.refitFrame = view.requestAnimationFrame(() => {
        this.refitFrame = 0;
        this.refit();
      });
    }

    /** Nudge floating lines back inside the layer when they grew or the player shrank. */
    refit() {
      const bounds = this.layer.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      for (const key of KEYS) {
        if (!this.pos[key]) continue;
        const slot = this.slots[key];
        const rect = slot.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = slot.style;
        const currentDx = Number.parseFloat(style.getPropertyValue('--pl-dx')) || 0;
        const currentDy = Number.parseFloat(style.getPropertyValue('--pl-dy')) || 0;
        const left = rect.left - currentDx;
        const top = rect.top - currentDy;
        const fit = (start, size, min, max) => (size >= max - min ? (min + max) / 2 - (start + size / 2) : Math.min(0, max - (start + size)) + Math.max(0, min - start));
        const dx = fit(left, rect.width, bounds.left, bounds.right);
        const dy = fit(top, rect.height, bounds.top, bounds.bottom);
        if (Math.abs(dx - currentDx) < 0.5 && Math.abs(dy - currentDy) < 0.5) continue;
        style.setProperty('--pl-dx', `${dx}px`);
        style.setProperty('--pl-dy', `${dy}px`);
      }
    }

    destroy() {
      clearTimeout(this.commitTimer);
      if (this.refitFrame) this.doc.defaultView?.cancelAnimationFrame(this.refitFrame);
      this.endSession();
      this.abort.abort();
      for (const key of KEYS) this.grips[key].remove();
    }
  }

  return { SUBTITLE_DRAGGER_CSS: CSS, SubtitleDragger };
});
