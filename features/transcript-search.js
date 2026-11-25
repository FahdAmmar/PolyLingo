/**
 * Transcript search — PolyLingo 0.6 (no DOM, unit-tested)
 *
 * Folding makes "fruhstuck" find "Frühstück" and "مرحبا" find "مَرْحَبًا":
 * case, combining marks (umlaut accents, Arabic harakat), tatweel and the alef
 * variants are ignored; ß matches "ss". A map from folded to original indexes lets the
 * panel highlight the real characters.
 *
 * The folded text of the whole transcript is built once, on the first search.
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

  const MARK = /\p{M}/u;
  const ALEF = /[\u0622\u0623\u0625\u0671]/;
  const TATWEEL = '\u0640';

  /** @returns {{folded:string, map:number[]}} map[i] = index in `text` of folded[i]; map has one extra sentinel */
  function foldWithMap(text) {
    let folded = '';
    const map = [];
    let at = 0;
    for (const char of text) {
      for (const part of char.normalize('NFD')) {
        if (MARK.test(part) || part === TATWEEL) continue;
        let low = part.toLowerCase();
        if (low === 'ß') low = 'ss';
        else if (ALEF.test(low)) low = '\u0627';
        for (let k = 0; k < low.length; k++) {
          folded += low[k];
          map.push(at);
        }
      }
      at += char.length;
    }
    map.push(text.length);
    return { folded, map };
  }

  function fold(text) {
    return foldWithMap(String(text)).folded;
  }

  /** Normalise a user query (folded, trimmed, single spaces). */
  function foldQuery(query) {
    return fold(query).replace(/\s+/g, ' ').trim();
  }

  /** Non-overlapping [start, end) ranges of `text` matching the folded query. */
  function findRanges(text, foldedQuery) {
    if (!foldedQuery) return [];
    const { folded, map } = foldWithMap(text);
    const ranges = [];
    let from = 0;
    for (;;) {
      const hit = folded.indexOf(foldedQuery, from);
      if (hit < 0) break;
      const end = hit + foldedQuery.length;
      const start = map[hit];
      const last = map[end - 1];
      let stop = last + (text.codePointAt(last) > 0xffff ? 2 : 1);
      while (stop < text.length && MARK.test(text[stop])) stop += 1;
      if (ranges.length > 0 && start < ranges[ranges.length - 1][1]) {
        ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], stop);
      } else {
        ranges.push([start, stop]);
      }
      from = end;
    }
    return ranges;
  }

  class TranscriptIndex {
    /** @param {Array<{primary:{text:string}|null, secondary:Array<{text:string}>}>} scenes */
    constructor(scenes) {
      this.scenes = scenes;
      this.folded = null;
    }

    build() {
      this.folded = this.scenes.map((scene) => [
        fold(scene.primary ? scene.primary.text : ''),
        fold(scene.secondary.map((cue) => cue.text).join(' ')),
      ]);
    }

    /** @returns {number[]} ascending scene indexes whose text contains the query */
    search(query) {
      const q = foldQuery(query);
      if (q === '') return [];
      if (this.folded === null) this.build();
      const matches = [];
      for (let i = 0; i < this.folded.length; i++) {
        const [primary, secondary] = this.folded[i];
        if (primary.includes(q) || secondary.includes(q)) matches.push(i);
      }
      return matches;
    }
  }

  return { foldWithMap, fold, foldQuery, findRanges, TranscriptIndex };
});
