/**
 * Scene timeline — PolyLingo 0.5
 *
 * Merges the primary and secondary subtitle tracks into "scenes". One scene is
 * one sentence the viewer can jump to, repeat, or see highlighted in the
 * Focus-reading panel.
 *
 * Why time-based merging: the previous panel paired `primary[i + k]` with
 * `secondary[j + k]` by array index. Two tracks rarely have the same cue count
 * (manual vs. auto-translated, different segmentation), so the pairs drifted.
 * Here every secondary cue is attached to the primary cue it overlaps most in
 * *video time*, so a row always holds text that was spoken together.
 *
 * Scene fields deliberately mirror the cue shape (`id`, `startTime`, `endTime`,
 * `text`) so a timeline can also be used as the index of the practice engine
 * (previous / next / replay / loop) without a second code path.
 *
 * All times are in VIDEO time (cue time + track offset).
 *
 * This file is a classic script (content-script friendly) and also a CommonJS
 * module so the logic can be unit-tested in Node without a browser.
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

  /** Nudge added to seek targets so float rounding cannot land in the previous cue. */
  const SEEK_EPSILON = 0.005;

  /**
   * @typedef {{id:number,startTime:number,endTime:number,text:string}} Cue
   * @typedef {{id:number,startTime:number,endTime:number,text:string,
   *            primary:Cue|null,secondary:Cue[]}} Scene
   */

  /** Index of the first scene whose end is after `time` (scenes are disjoint and sorted). */
  function firstEndingAfter(scenes, time) {
    let lo = 0;
    let hi = scenes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (scenes[mid].endTime > time) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  class SceneTimeline {
    /** @param {Scene[]} scenes sorted by start time, `scenes[i].id === i` */
    constructor(scenes) {
      this.scenes = scenes;
      this.size = scenes.length;
      this.starts = Float64Array.from(scenes, (scene) => scene.startTime);
      /** @type {Map<number, number>} primary cue id -> scene index */
      this.primaryMap = new Map();
      /** @type {Map<number, number>} secondary cue id -> scene index */
      this.secondaryMap = new Map();
      for (const scene of scenes) {
        if (scene.primary) this.primaryMap.set(scene.primary.id, scene.id);
        for (const cue of scene.secondary) this.secondaryMap.set(cue.id, scene.id);
      }
    }

    /** @returns {Scene|null} */
    cueAtIndex(index) {
      return this.scenes[index] ?? null;
    }

    /** Index of the last scene that started at or before `time`, or -1. */
    lastStartedIndex(time) {
      let lo = 0;
      let hi = this.size - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (this.starts[mid] <= time) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return found;
    }

    /** Index of the scene that contains `time`, or -1 when `time` is in a gap. */
    indexAt(time) {
      const index = this.lastStartedIndex(time);
      const scene = index >= 0 ? this.scenes[index] : undefined;
      return scene && time < scene.endTime ? index : -1;
    }

    /** Index of the first scene that starts after `time`, or -1. */
    upcomingIndex(time) {
      const next = this.lastStartedIndex(time) + 1;
      return next < this.size ? next : -1;
    }

    /**
     * The scene the viewer sees right now, derived from the very cues the
     * on-video overlay is showing, so panel and video can never disagree.
     * A primary cue wins; a secondary-only moment maps to that cue's home scene.
     * @param {Cue|null} primaryCue
     * @param {Cue|null} secondaryCue
     */
    sceneForCues(primaryCue, secondaryCue) {
      if (primaryCue) {
        const index = this.primaryMap.get(primaryCue.id);
        if (index !== undefined) return index;
      }
      if (secondaryCue) {
        const index = this.secondaryMap.get(secondaryCue.id);
        if (index !== undefined) return index;
      }
      return -1;
    }
  }

  /**
   * @param {{primary?:Cue[]|null, secondary?:Cue[]|null,
   *          primaryOffset?:number, secondaryOffset?:number}} input
   *   cues are track-local and sorted; offsets are in seconds
   * @returns {SceneTimeline}
   */
  function buildTimeline(input) {
    const primaryOffset = input.primaryOffset || 0;
    const secondaryOffset = input.secondaryOffset || 0;
    const primaryCues = input.primary || [];
    const secondaryCues = input.secondary || [];

    /** @type {Scene[]} */
    const scenes = primaryCues.map((cue) => ({
      id: -1,
      startTime: cue.startTime + primaryOffset,
      endTime: cue.endTime + primaryOffset,
      text: cue.text,
      primary: cue,
      secondary: [],
    }));

    /** @type {Scene[]} */
    const orphans = [];
    for (const cue of secondaryCues) {
      const start = cue.startTime + secondaryOffset;
      const end = cue.endTime + secondaryOffset;
      let best = -1;
      let bestOverlap = 0;
      for (let i = firstEndingAfter(scenes, start); i < scenes.length && scenes[i].startTime < end; i++) {
        const overlap = Math.min(end, scenes[i].endTime) - Math.max(start, scenes[i].startTime);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = i;
        }
      }
      if (best >= 0) {
        scenes[best].secondary.push(cue);
      } else {
        orphans.push({ id: -1, startTime: start, endTime: end, text: cue.text, primary: null, secondary: [cue] });
      }
    }

    const merged = orphans.length > 0 ? scenes.concat(orphans).sort((a, b) => a.startTime - b.startTime) : scenes;
    merged.forEach((scene, index) => {
      scene.id = index;
    });
    return new SceneTimeline(merged);
  }

  /** 83 -> "1:23", 3725 -> "1:02:05" */
  function formatClock(seconds) {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  return { SEEK_EPSILON, SceneTimeline, buildTimeline, formatClock };
});
