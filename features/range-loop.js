/**
 * Range loop — PolyLingo 0.7
 *
 * Repeats a chosen stretch of the video (A -> B), e.g. "0:00 to 0:19" or a run
 * of several scenes, until the viewer turns it off.
 *
 * Same engineering rules as auto-pause.js:
 * - No polling. One timer is armed for the end of the range and re-armed on the
 *   events that can move it (play, seek, rate change). While the loop is off no
 *   listener and no timer exists, so an idle loop costs nothing.
 * - `timeupdate` and `ended` are a safety net: a throttled timer (hidden tab) or a
 *   range that reaches the end of the video still loops correctly.
 * - Seeking outside the range yourself releases the loop (the range is kept, so one
 *   click turns it back on). Seeks made by the loop itself are recognised and ignored.
 *
 * All times are in VIDEO time (seconds).
 *
 * Classic script (content-script friendly) and CommonJS module, so the logic can be
 * unit-tested in Node without a browser.
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

  /** Same nudge as scene seeks, so float rounding cannot land before the start. */
  const SEEK_PAD = 0.005;
  /** Shortest range that makes sense: below this the seek itself takes longer than the clip. */
  const MIN_LENGTH = 0.1;
  /** Jump back this many seconds before the end so the last frame is not overshot. */
  const LEAD = 0.02;
  /** A seek this close outside the range still counts as "inside" (float / keyframe slack). */
  const EDGE_TOLERANCE = 0.05;
  /** Longest accepted time text; keeps the parser trivially cheap. */
  const MAX_TEXT = 16;

  const round3 = (value) => Math.round(value * 1000) / 1000;

  /** Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9, Arabic decimal mark -> ".". */
  function normalizeDigits(text) {
    return text
      .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
        const code = ch.charCodeAt(0);
        return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
      })
      .replace(/[\u066B,]/g, '.');
  }

  /**
   * Parse a time typed by a person.
   *   "19" / "12.5" / "0.19" -> plain seconds      "0:19" / "1:05.5" -> m:ss
   *   "1:02:05"              -> h:mm:ss
   * @param {unknown} input
   * @returns {number|null} seconds, or null when the text is not a time
   */
  function parseTime(input) {
    if (typeof input !== 'string') return null;
    const text = normalizeDigits(input).trim();
    if (text === '' || text.length > MAX_TEXT) return null;
    let match = /^(\d+(?:\.\d+)?|\.\d+)$/.exec(text);
    if (match) return Number(match[1]);
    match = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(text);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
    match = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(text);
    if (match) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return null;
  }

  /** 19 -> "0:19", 0.19 -> "0:00.19", 83.5 -> "1:23.5", 3725 -> "1:02:05" */
  function formatTime(seconds) {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const centi = Math.round(safe * 100);
    const whole = Math.floor(centi / 100);
    const fraction = centi % 100;
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, '0');
    const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    if (fraction === 0) return base;
    return `${base}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
  }

  /**
   * Validate a range. Reversed marks are swapped (B before A is a natural slip);
   * an end past the video is clamped to the video's end.
   * @param {number} a
   * @param {number} b
   * @param {{duration?:number, minLength?:number}} [options]
   * @returns {{ok:true,start:number,end:number}|{ok:false,reason:'invalid'|'too-short'|'out-of-range'}}
   */
  function normalizeRange(a, b, options = {}) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return { ok: false, reason: 'invalid' };
    const minLength = options.minLength ?? MIN_LENGTH;
    const duration = options.duration;
    let start = Math.min(a, b);
    let end = Math.max(a, b);
    if (Number.isFinite(duration) && duration > 0) {
      if (start >= duration) return { ok: false, reason: 'out-of-range' };
      end = Math.min(end, duration);
    }
    start = round3(start);
    end = round3(end);
    if (end - start < minLength - 1e-9) return { ok: false, reason: 'too-short' };
    return { ok: true, start, end };
  }

  const MEDIA_EVENTS = ['play', 'playing', 'ratechange', 'pause', 'emptied'];

  /**
   * @typedef {{start:number|null,end:number|null,active:boolean,wraps:number}} RangeState
   * @typedef {{ok:true}|{ok:false,reason:string}} Result
   */
  class RangeLoop {
    /**
     * @param {{video: HTMLVideoElement,
     *          onChange?: (state:RangeState, reason:string)=>void,
     *          isSuspended?: ()=>boolean,
     *          lead?: number, minLength?: number, seekPad?: number, edgeTolerance?: number,
     *          timers?: {set:(fn:()=>void, ms:number)=>unknown, clear:(id:unknown)=>void}}} options
     *   `isSuspended` is true while something else owns the video (an ad): the loop then stays out of the way.
     */
    constructor(options) {
      this.video = options.video;
      this.onChange = options.onChange ?? (() => {});
      this.isSuspended = options.isSuspended ?? (() => false);
      this.lead = options.lead ?? LEAD;
      this.minLength = options.minLength ?? MIN_LENGTH;
      this.seekPad = options.seekPad ?? SEEK_PAD;
      this.edgeTolerance = options.edgeTolerance ?? EDGE_TOLERANCE;
      this.timers = options.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
      /** @type {number|null} */
      this.start = null;
      /** @type {number|null} */
      this.end = null;
      this.active = false;
      /** Completed repeats since the loop was switched on or its range changed. */
      this.wraps = 0;
      this.timer = undefined;
      this.abort = null;
      /** True between the loop's own seek and its `seeked`, so it is not mistaken for the viewer's seek. */
      this.selfSeek = false;
    }

    get hasRange() {
      return this.start !== null && this.end !== null;
    }

    /** @returns {RangeState} */
    snapshot() {
      return { start: this.start, end: this.end, active: this.active, wraps: this.wraps };
    }

    emit(reason) {
      this.onChange(this.snapshot(), reason);
    }

    /** @returns {number|undefined} */
    knownDuration() {
      const { duration } = this.video;
      return Number.isFinite(duration) && duration > 0 ? duration : undefined;
    }

    /** Mark the start (A). With an end already set the pair is re-validated. @returns {Result} */
    setStart(time) {
      if (!Number.isFinite(time) || time < 0) return { ok: false, reason: 'invalid' };
      if (this.end === null) {
        this.start = round3(time);
        this.emit('range');
        return { ok: true };
      }
      return this.setRange(time, this.end);
    }

    /** Mark the end (B). With a start already set the pair is re-validated. @returns {Result} */
    setEnd(time) {
      if (!Number.isFinite(time) || time < 0) return { ok: false, reason: 'invalid' };
      if (this.start === null) {
        this.end = round3(time);
        this.emit('range');
        return { ok: true };
      }
      return this.setRange(this.start, time);
    }

    /** Set both ends at once. Does not switch the loop on. @returns {Result} */
    setRange(a, b) {
      const range = normalizeRange(a, b, { duration: this.knownDuration(), minLength: this.minLength });
      if (!range.ok) return range;
      this.start = range.start;
      this.end = range.end;
      this.wraps = 0;
      if (this.active) {
        this.moveInsideRange();
        this.rearm();
      }
      this.emit('range');
      return { ok: true };
    }

    /** Switch the loop on. A playhead outside the range is moved to its start. @returns {Result} */
    activate() {
      if (!this.hasRange) return { ok: false, reason: 'no-range' };
      if (!this.active) {
        this.active = true;
        this.wraps = 0;
        this.attach();
      }
      this.moveInsideRange();
      this.rearm();
      this.emit('activated');
      return { ok: true };
    }

    /** Switch the loop off; the range stays so it can be switched back on. */
    deactivate(reason = 'deactivated') {
      if (!this.active) return;
      this.active = false;
      this.detach();
      this.emit(reason);
    }

    /** @returns {Result} */
    toggle() {
      if (this.active) {
        this.deactivate();
        return { ok: true };
      }
      return this.activate();
    }

    /** Forget the range entirely. */
    clear() {
      this.active = false;
      this.detach();
      this.start = null;
      this.end = null;
      this.wraps = 0;
      this.emit('cleared');
    }

    destroy() {
      this.active = false;
      this.detach();
    }

    // ---- internals ----------------------------------------------------------

    attach() {
      if (this.abort) return;
      this.abort = new AbortController();
      const { signal } = this.abort;
      for (const type of MEDIA_EVENTS) this.video.addEventListener(type, this.rearm, { signal });
      this.video.addEventListener('seeking', this.onSeeking, { signal });
      this.video.addEventListener('seeked', this.onSeeked, { signal });
      this.video.addEventListener('timeupdate', this.onTimeUpdate, { signal });
      this.video.addEventListener('ended', this.onEnded, { signal });
    }

    detach() {
      this.abort?.abort();
      this.abort = null;
      this.selfSeek = false;
      this.clearTimer();
    }

    clearTimer() {
      if (this.timer !== undefined) this.timers.clear(this.timer);
      this.timer = undefined;
    }

    /** Put the playhead at the start when it is not already inside [start, end). */
    moveInsideRange() {
      const time = this.video.currentTime;
      if (time < this.start - this.edgeTolerance || time >= this.end) this.seekToStart();
    }

    seekToStart() {
      this.selfSeek = true;
      this.video.currentTime = Math.min(this.start + this.seekPad, this.end);
    }

    /** One repeat: back to the start, and keep playing if the video had run out. */
    wrap(resume = false) {
      this.clearTimer();
      this.seekToStart();
      this.wraps += 1;
      if (resume) Promise.resolve(this.video.play()).catch(() => void 0);
      // Do not depend on `seeked` alone to arm the next repeat: if it never comes, the loop would stop silently.
      this.rearm();
      this.emit('wrap');
    }

    rearm = () => {
      this.clearTimer();
      if (!this.active || this.isSuspended()) return;
      const video = this.video;
      if (video.paused || video.ended) return;
      const rate = video.playbackRate;
      if (!(rate > 0)) return;
      const time = video.currentTime;
      if (time >= this.end - this.lead) {
        this.wrap();
        return;
      }
      this.timer = this.timers.set(this.onTimer, Math.max(0, ((this.end - this.lead - time) / rate) * 1000));
    };

    onTimer = () => {
      this.timer = undefined;
      const video = this.video;
      if (!this.active || video.paused || this.isSuspended()) return;
      // A timer that fired early (buffering stalled the clock) simply waits again.
      if (video.currentTime >= this.end - this.lead - 0.001) this.wrap();
      else this.rearm();
    };

    onTimeUpdate = () => {
      const video = this.video;
      if (!this.active || video.paused || this.isSuspended()) return;
      if (video.currentTime >= this.end) this.wrap();
    };

    onEnded = () => {
      if (!this.active || this.isSuspended()) return;
      this.wrap(true);
    };

    onSeeking = () => {
      if (this.selfSeek || !this.active || this.isSuspended()) return;
      const time = this.video.currentTime;
      if (time < this.start - this.edgeTolerance || time > this.end + this.edgeTolerance) this.deactivate('left');
    };

    onSeeked = () => {
      this.selfSeek = false;
      this.rearm();
    };
  }

  return {
    RANGE_SEEK_PAD: SEEK_PAD,
    RANGE_MIN_LENGTH: MIN_LENGTH,
    parseTime,
    formatTime,
    normalizeRange,
    RangeLoop,
  };
});
