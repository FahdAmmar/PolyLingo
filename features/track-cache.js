/**
 * Subtitle cache — PolyLingo 0.6
 *
 * Re-watching a lesson (the whole point of a language-learning tool) used to download and
 * re-parse every subtitle track each time. Parsed cues of the last few videos are kept in
 * `chrome.storage.local`.
 *
 * Design decisions
 * - Extension storage, NOT IndexedDB: a content script's IndexedDB belongs to the page origin,
 *   so youtube.com's own scripts could read what the extension stored there.
 * - A hard byte budget (default 3 MB) and a video limit; the least recently used video goes first.
 *   chrome.storage.local has a 10 MB quota that the saved vocabulary shares.
 * - One record per video holds all its tracks; a small index records time + size.
 * - Best effort: every failure is swallowed and means "not cached".
 * - Concurrent tabs: the index is last-writer-wins, so a rare orphaned record can remain until
 *   "Clear cache" (which scans by key prefix) — it is bounded by the per-entry size limit.
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

  const INDEX_KEY = 'polylingo.tc.index';
  const DATA_PREFIX = 'polylingo.tc.v.';
  const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
  const DAY = 86400000;

  const DEFAULT_LIMITS = Object.freeze({
    maxBytes: 3000000,
    maxVideos: 8,
    maxEntryBytes: 1400000,
    ttlMs: 30 * DAY,
    touchAfterMs: 3600000,
  });

  function round3(value) {
    return Math.round(value * 1000) / 1000;
  }

  class TrackCache {
    /** @param {{area:{get:Function,set:Function,remove:Function}, now?:()=>number} & Partial<typeof DEFAULT_LIMITS>} options */
    constructor(options) {
      this.area = options.area;
      this.now = options.now ?? Date.now;
      this.limits = { ...DEFAULT_LIMITS };
      for (const name of Object.keys(DEFAULT_LIMITS)) if (typeof options[name] === 'number') this.limits[name] = options[name];
      this.enabled = true;
    }

    async readIndex() {
      const stored = (await this.area.get(INDEX_KEY))[INDEX_KEY];
      return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? stored : {};
    }

    /** @returns {Promise<Array<{id:number,startTime:number,endTime:number,text:string}>|null>} */
    async get(videoId, key) {
      if (!this.enabled || !VIDEO_ID.test(videoId) || typeof key !== 'string') return null;
      try {
        const dataKey = DATA_PREFIX + videoId;
        const record = (await this.area.get(dataKey))[dataKey];
        const rows = record?.tracks?.[key];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const age = this.now() - (typeof record.t === 'number' ? record.t : 0);
        if (age > this.limits.ttlMs) return null;
        const cues = [];
        let previousEnd = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row) || row.length !== 3) return null;
          const [startTime, endTime, text] = row;
          if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || typeof text !== 'string' || text === '') return null;
          if (endTime <= startTime || startTime < previousEnd - 0.001) return null;
          previousEnd = endTime;
          cues.push({ id: i, startTime, endTime, text });
        }
        if (age > this.limits.touchAfterMs) void this.touch(videoId);
        return cues;
      } catch {
        return null;
      }
    }

    async touch(videoId) {
      try {
        const index = await this.readIndex();
        if (!index[videoId]) return;
        index[videoId] = { ...index[videoId], t: this.now() };
        await this.area.set({ [INDEX_KEY]: index });
      } catch {
        /* best effort */
      }
    }

    /** @returns {Promise<boolean>} true when stored */
    async put(videoId, key, cues) {
      if (!this.enabled || !VIDEO_ID.test(videoId) || typeof key !== 'string' || !Array.isArray(cues) || cues.length === 0) return false;
      try {
        const rows = cues.map((cue) => [round3(cue.startTime), round3(cue.endTime), cue.text]);
        const entryBytes = JSON.stringify(rows).length;
        if (entryBytes > this.limits.maxEntryBytes) return false;
        const dataKey = DATA_PREFIX + videoId;
        const existing = (await this.area.get(dataKey))[dataKey];
        const tracks = typeof existing?.tracks === 'object' && existing.tracks !== null ? { ...existing.tracks } : {};
        tracks[key] = rows;
        const now = this.now();
        const bytes = JSON.stringify(tracks).length;
        if (bytes > this.limits.maxBytes) return false;
        const index = await this.readIndex();
        index[videoId] = { t: now, b: bytes };
        const drop = this.victims(index, videoId, now);
        for (const id of drop) delete index[id];
        await this.area.set({ [dataKey]: { t: now, tracks }, [INDEX_KEY]: index });
        if (drop.length > 0) await this.area.remove(drop.map((id) => DATA_PREFIX + id));
        return true;
      } catch {
        return false;
      }
    }

    /** Videos to evict: expired ones, then least recently used until count and bytes fit. */
    victims(index, keep, now) {
      const drop = [];
      let entries = Object.entries(index).filter(([id, meta]) => {
        const expired = id !== keep && now - (meta?.t ?? 0) > this.limits.ttlMs;
        if (expired || typeof meta?.b !== 'number') drop.push(id);
        return !expired && typeof meta?.b === 'number';
      });
      entries.sort((a, b) => b[1].t - a[1].t);
      let bytes = 0;
      let count = 0;
      for (const [id, meta] of entries) {
        const fits = count < this.limits.maxVideos && bytes + meta.b <= this.limits.maxBytes;
        if (fits || id === keep) {
          bytes += meta.b;
          count += 1;
        } else {
          drop.push(id);
        }
      }
      return drop;
    }

    /** Drop everything cached for one video (used by "retry subtitles"). */
    async forget(videoId) {
      if (!VIDEO_ID.test(videoId)) return;
      try {
        const index = await this.readIndex();
        if (index[videoId]) {
          delete index[videoId];
          await this.area.set({ [INDEX_KEY]: index });
        }
        await this.area.remove(DATA_PREFIX + videoId);
      } catch {
        /* best effort */
      }
    }

    async stats() {
      try {
        const index = await this.readIndex();
        const metas = Object.values(index);
        return { videos: metas.length, bytes: metas.reduce((sum, meta) => sum + (typeof meta?.b === 'number' ? meta.b : 0), 0) };
      } catch {
        return { videos: 0, bytes: 0 };
      }
    }

    /** Remove every cached record, including orphans (scan by key prefix). @returns {Promise<number>} records removed */
    async clear() {
      try {
        const all = await this.area.get(null);
        const keys = Object.keys(all).filter((name) => name === INDEX_KEY || name.startsWith(DATA_PREFIX));
        if (keys.length > 0) await this.area.remove(keys);
        return keys.length;
      } catch {
        return 0;
      }
    }
  }

  let shared = null;
  /** Shared instance on chrome.storage.local, or null where there is no extension storage. */
  function getTrackCache() {
    if (shared) return shared;
    const area = globalThis.chrome?.storage?.local;
    if (!area) return null;
    shared = new TrackCache({ area });
    return shared;
  }

  return { TrackCache, getTrackCache, TRACK_CACHE_LIMITS: DEFAULT_LIMITS };
});
