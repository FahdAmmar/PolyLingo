/**
 * Virtual list maths — PolyLingo 0.6 (no DOM, unit-tested)
 *
 * Focus reading used to build one DOM row per scene. A 3-hour lecture has ~4 700
 * scenes (~24 000 nodes). The panel now renders only the rows around the viewport;
 * this class answers "which rows are visible" and "where does row i start" for rows
 * of different heights.
 *
 * - Rows start with an estimated height; once rendered they are measured and the
 *   measurement replaces the estimate.
 * - Offsets are maintained in a Fenwick tree: measurements update in O(log n), prefix
 *   offsets and total height are O(log n), and index lookup uses binary lifting in O(log n).
 * - A global estimate change rebuilds the tree in O(n); it is rare compared with row measurements.
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

  const DEFAULT_ESTIMATE = 76;

  class HeightIndex {
    /** @param {number} count @param {number} estimate */
    constructor(count = 0, estimate = DEFAULT_ESTIMATE) {
      this.reset(count, estimate);
    }

    reset(count, estimate = this.estimate) {
      this.count = Math.max(0, Math.floor(count) || 0);
      this.estimate = estimate > 0 ? estimate : DEFAULT_ESTIMATE;
      this.heights = new Float64Array(this.count);
      this.known = new Uint8Array(this.count);
      // Fenwick tree: point updates and prefix sums are O(log n), unlike rebuilding
      // a full prefix array after every newly measured virtual row.
      this.tree = new Float64Array(this.count + 1);
      this.knownSum = 0;
      this.knownCount = 0;
      this.buildTree();
    }

    buildTree() {
      this.tree.fill(0);
      for (let i = 1; i <= this.count; i++) {
        this.tree[i] += this.known[i - 1] === 1 ? this.heights[i - 1] : this.estimate;
        const parent = i + (i & -i);
        if (parent <= this.count) this.tree[parent] += this.tree[i];
      }
    }

    /** Add a height delta at a zero-based row. */
    add(index, delta) {
      for (let i = index + 1; i <= this.count; i += i & -i) this.tree[i] += delta;
    }

    /** Sum the first `end` rows (end is exclusive). */
    prefix(end) {
      let sum = 0;
      for (let i = Math.min(Math.max(end, 0), this.count); i > 0; i -= i & -i) sum += this.tree[i];
      return sum;
    }

    /** Compatibility hook: the tree is kept current, so no deferred rebuild is needed. */
    flush() {
      return false;
    }

    get total() {
      return this.prefix(this.count);
    }

    isMeasured(index) {
      return index >= 0 && index < this.count && this.known[index] === 1;
    }

    heightOf(index) {
      return index >= 0 && index < this.count && this.known[index] === 1 ? this.heights[index] : this.estimate;
    }

    offsetOf(index) {
      return this.prefix(index);
    }

    /** @returns {boolean} true when the stored height changed by half a pixel or more */
    setMeasured(index, height) {
      if (!(index >= 0 && index < this.count) || !(height >= 0)) return false;
      const previous = this.known[index] === 1 ? this.heights[index] : this.estimate;
      if (this.known[index] === 1 && Math.abs(previous - height) < 0.5) return false;
      if (this.known[index] !== 1) {
        this.known[index] = 1;
        this.knownCount += 1;
      } else {
        this.knownSum -= previous;
      }
      this.heights[index] = height;
      this.knownSum += height;
      this.add(index, height - previous);
      return true;
    }

    meanMeasured() {
      return this.knownCount > 0 ? this.knownSum / this.knownCount : this.estimate;
    }

    /** Height assumed for rows that were never rendered. */
    setEstimate(value) {
      if (!(value > 0) || Math.abs(value - this.estimate) < 0.5) return;
      this.estimate = value;
      // Rebuild in O(n), once per estimate adjustment; point measurements remain O(log n).
      this.buildTree();
    }

    /** Forget every measurement (the row width, font or content layout changed). */
    invalidate() {
      this.known.fill(0);
      this.knownSum = 0;
      this.knownCount = 0;
      this.buildTree();
    }


    /** Row containing vertical position `y` (clamped); -1 for an empty list. */
    indexAt(y) {
      if (this.count === 0) return -1;
      if (!(y > 0)) return 0;
      if (y >= this.total) return this.count - 1;
      // Fenwick binary lifting finds the largest prefix sum <= y in O(log n).
      let index = 0;
      let sum = 0;
      let bit = 1;
      while ((bit << 1) <= this.count) bit <<= 1;
      for (; bit > 0; bit >>= 1) {
        const next = index + bit;
        if (next <= this.count && sum + this.tree[next] <= y) {
          index = next;
          sum += this.tree[next];
        }
      }
      return Math.min(index, this.count - 1);
    }

    /** Inclusive [first, last] rows intersecting [top, bottom]; null for an empty list. */
    range(top, bottom) {
      if (this.count === 0) return null;
      return [this.indexAt(top), this.indexAt(Math.max(top, bottom))];
    }
  }

  return { HeightIndex, VIRTUAL_DEFAULT_ESTIMATE: DEFAULT_ESTIMATE };
});
