/**
 * Auto-pause — PolyLingo 0.6
 *
 * "Pause after each sentence". No polling: one timer is armed for the end of the
 * scene on screen and re-armed on the events that can move it (play, seek,
 * rate change) and when the controller reports a scene change. While the video is
 * paused or the feature is off no timer exists.
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

  const EVENTS = ['play', 'playing', 'seeked', 'ratechange', 'pause', 'emptied'];

  class AutoPause {
    /**
     * @param {{video: HTMLVideoElement,
     *          getTimeline: () => ({indexAt:(t:number)=>number, cueAtIndex:(i:number)=>({endTime:number}|null)}|null),
     *          onPause?: (scene:object)=>void,
     *          lead?: number, minRemaining?: number,
     *          timers?: {set:(fn:()=>void, ms:number)=>unknown, clear:(id:unknown)=>void}}} options
     */
    constructor(options) {
      this.video = options.video;
      this.getTimeline = options.getTimeline;
      this.onPause = options.onPause ?? (() => {});
      /** Pause this many seconds before the scene ends so the text is still on screen. */
      this.lead = options.lead ?? 0.04;
      /** Do not arm for a scene that is about to end: pressing play at its end must move on. */
      this.minRemaining = options.minRemaining ?? 0.15;
      this.timers = options.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
      this.enabled = false;
      this.timer = undefined;
      this.abort = null;
    }

    setEnabled(enabled) {
      this.enabled = Boolean(enabled);
      if (this.enabled) {
        this.attach();
        this.rearm();
      } else {
        this.detach();
      }
    }

    attach() {
      if (this.abort) return;
      this.abort = new AbortController();
      for (const type of EVENTS) this.video.addEventListener(type, this.rearm, { signal: this.abort.signal });
    }

    detach() {
      this.abort?.abort();
      this.abort = null;
      this.clear();
    }

    clear() {
      if (this.timer !== undefined) this.timers.clear(this.timer);
      this.timer = undefined;
    }

    /** The scene on screen changed (called by the controller). */
    sceneChanged() {
      this.rearm();
    }

    rearm = () => {
      this.clear();
      if (!this.enabled) return;
      const video = this.video;
      if (video.paused || video.ended) return;
      const rate = video.playbackRate;
      if (!(rate > 0)) return;
      const timeline = this.getTimeline();
      if (!timeline) return;
      const time = video.currentTime;
      const index = timeline.indexAt(time);
      if (index < 0) return;
      const scene = timeline.cueAtIndex(index);
      if (!scene) return;
      const remaining = scene.endTime - time;
      if (remaining < this.minRemaining) return;
      this.timer = this.timers.set(() => {
        this.timer = undefined;
        if (video.paused) return;
        video.pause();
        this.onPause(scene);
      }, Math.max(0, ((remaining - this.lead) / rate) * 1000));
    };

    destroy() {
      this.setEnabled(false);
    }
  }

  return { AutoPause };
});
