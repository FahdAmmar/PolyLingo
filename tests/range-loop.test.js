'use strict';
/**
 * Range loop tests — run with:  node --test tests/
 * No dependencies: node:test + a tiny fake <video> and fake timers.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTime, formatTime, normalizeRange, RangeLoop } = require('../features/range-loop.js');
const { formatRange, rangeLoopText, bindRangeLoopKeys, RANGE_LOOP_KEYS } = require('../features/range-loop-controls.js');

// ---- fakes ------------------------------------------------------------------

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this._time = 0;
    this.paused = true;
    this.ended = false;
    this.playbackRate = 1;
    this.duration = 100;
    this.playCalls = 0;
    this.seeks = [];
  }
  get currentTime() {
    return this._time;
  }
  set currentTime(value) {
    this._time = value;
    this.seeks.push(value);
    this.dispatchEvent(new Event('seeking'));
  }
  /** Viewer seeks: position changes, then both events arrive. */
  userSeek(value) {
    this.currentTime = value;
    this.dispatchEvent(new Event('seeked'));
  }
  play() {
    this.paused = false;
    this.ended = false;
    this.playCalls += 1;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  /** The playhead moved by playback (no seek events). */
  advanceTo(value) {
    this._time = value;
  }
  emit(type) {
    this.dispatchEvent(new Event(type));
  }
}

function fakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    set(fn, ms) {
      const id = nextId++;
      pending.set(id, { fn, ms });
      return id;
    },
    clear(id) {
      pending.delete(id);
    },
    count: () => pending.size,
    /** The delay of the one armed timer. */
    delay() {
      assert.equal(pending.size, 1, 'exactly one timer armed');
      return [...pending.values()][0].ms;
    },
    fire() {
      assert.equal(pending.size, 1, 'exactly one timer armed');
      const [id, { fn }] = [...pending.entries()][0];
      pending.delete(id);
      fn();
    },
  };
}

function setup(options = {}) {
  const video = new FakeVideo();
  const timers = fakeTimers();
  const changes = [];
  const loop = new RangeLoop({ video, timers, onChange: (state, reason) => changes.push({ ...state, reason }), ...options });
  return { video, timers, changes, loop };
}

// ---- parseTime / formatTime --------------------------------------------------

test('parseTime: plain seconds, clock forms and the 0.19 case', () => {
  assert.equal(parseTime('19'), 19);
  assert.equal(parseTime('12.5'), 12.5);
  assert.equal(parseTime('0.19'), 0.19, '"0.19" is read literally as 0.19 seconds');
  assert.equal(parseTime('0:19'), 19, '"0:19" is nineteen seconds');
  assert.equal(parseTime('1:05.5'), 65.5);
  assert.equal(parseTime('1:02:05'), 3725);
  assert.equal(parseTime('  7  '), 7);
  assert.equal(parseTime('.5'), 0.5);
});

test('parseTime: Arabic-Indic and Persian digits, Arabic decimal mark', () => {
  assert.equal(parseTime('٠:١٩'), 19);
  assert.equal(parseTime('١٢٫٥'), 12.5);
  assert.equal(parseTime('۰:۱۹'), 19);
  assert.equal(parseTime('0,5'), 0.5);
});

test('parseTime: rejects anything that is not a time', () => {
  for (const bad of ['', '  ', 'abc', '1:75', '-5', '1:2:3:4', '1::2', '19.', '1e3', '0x10', '१२', '9'.repeat(40), null, undefined, 12]) {
    assert.equal(parseTime(bad), null, `should reject ${String(bad).slice(0, 12)}`);
  }
});

test('formatTime: m:ss with trimmed centiseconds, h:mm:ss over an hour', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(19), '0:19');
  assert.equal(formatTime(0.19), '0:00.19');
  assert.equal(formatTime(83.5), '1:23.5');
  assert.equal(formatTime(65.05), '1:05.05');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(-3), '0:00');
  assert.equal(formatTime(NaN), '0:00');
});

test('formatTime and parseTime round-trip', () => {
  for (const value of [0, 0.19, 5, 19, 65.5, 599.99, 3725]) assert.equal(parseTime(formatTime(value)), value);
});

// ---- normalizeRange -----------------------------------------------------------

test('normalizeRange: valid, swapped, clamped', () => {
  assert.deepEqual(normalizeRange(0, 19), { ok: true, start: 0, end: 19 });
  assert.deepEqual(normalizeRange(19, 0), { ok: true, start: 0, end: 19 }, 'B before A is swapped');
  assert.deepEqual(normalizeRange(10, 500, { duration: 60 }), { ok: true, start: 10, end: 60 }, 'end clamps to the video');
  assert.deepEqual(normalizeRange(0, 0.19), { ok: true, start: 0, end: 0.19 }, 'the literal 0.19 s range is allowed');
});

test('normalizeRange: rejects bad input', () => {
  assert.deepEqual(normalizeRange(5, 5.05), { ok: false, reason: 'too-short' });
  assert.deepEqual(normalizeRange(NaN, 5), { ok: false, reason: 'invalid' });
  assert.deepEqual(normalizeRange(-1, 5), { ok: false, reason: 'invalid' });
  assert.deepEqual(normalizeRange(70, 80, { duration: 60 }), { ok: false, reason: 'out-of-range' });
  assert.deepEqual(normalizeRange(Infinity, 5), { ok: false, reason: 'invalid' });
});

// ---- RangeLoop: setting the range ----------------------------------------------

test('setStart / setEnd: a lone mark does not make a range; the pair does', () => {
  const { loop, changes } = setup();
  assert.equal(loop.hasRange, false);
  assert.deepEqual(loop.setStart(12), { ok: true });
  assert.equal(loop.hasRange, false);
  assert.deepEqual(loop.activate(), { ok: false, reason: 'no-range' });
  assert.deepEqual(loop.setEnd(19), { ok: true });
  assert.equal(loop.hasRange, true);
  assert.equal(loop.start, 12);
  assert.equal(loop.end, 19);
  assert.equal(changes.at(-1).reason, 'range');
});

test('setEnd before setStart: the later mark swaps when reversed', () => {
  const { loop } = setup();
  loop.setEnd(5);
  loop.setStart(20);
  assert.equal(loop.start, 5);
  assert.equal(loop.end, 20);
});

test('setRange failures leave the previous range untouched', () => {
  const { loop } = setup();
  loop.setRange(2, 10);
  assert.deepEqual(loop.setRange(5, 5.01), { ok: false, reason: 'too-short' });
  assert.deepEqual(loop.setRange(NaN, 5), { ok: false, reason: 'invalid' });
  assert.equal(loop.start, 2);
  assert.equal(loop.end, 10);
});

test('end is clamped to the known duration', () => {
  const { loop, video } = setup();
  video.duration = 30;
  loop.setRange(10, 99);
  assert.equal(loop.end, 30);
});

// ---- RangeLoop: looping ------------------------------------------------------------

test('activate outside the range seeks to the start; inside it does not', () => {
  const a = setup();
  a.video.advanceTo(50);
  a.loop.setRange(10, 20);
  a.loop.activate();
  assert.equal(a.video.currentTime, 10.005);

  const b = setup();
  b.video.advanceTo(15);
  b.loop.setRange(10, 20);
  b.loop.activate();
  assert.deepEqual(b.video.seeks, [], 'already inside: no jump');
});

test('timer is armed for the end of the range, scaled by playback rate', () => {
  const { loop, video, timers } = setup();
  loop.setRange(0, 19);
  video.advanceTo(5);
  video.play();
  loop.activate();
  assert.ok(Math.abs(timers.delay() - (19 - 0.02 - 5) * 1000) < 1e-6);

  video.playbackRate = 2;
  video.emit('ratechange');
  assert.ok(Math.abs(timers.delay() - ((19 - 0.02 - 5) / 2) * 1000) < 1e-6, 'rate 2 halves the wait');
});

test('timer firing at the end jumps back to the start and counts the repeat', () => {
  const { loop, video, timers, changes } = setup();
  loop.setRange(0, 19);
  video.advanceTo(1);
  video.play();
  loop.activate();
  video.advanceTo(18.99);
  timers.fire();
  assert.equal(video.currentTime, 0.005);
  assert.equal(loop.wraps, 1);
  assert.equal(changes.at(-1).reason, 'wrap');
  video.emit('seeked');
  assert.equal(timers.count(), 1, 'next repeat is armed');
});

test('a timer that fires early (stalled clock) waits again instead of jumping', () => {
  const { loop, video, timers } = setup();
  loop.setRange(0, 19);
  video.advanceTo(1);
  video.play();
  loop.activate();
  video.advanceTo(10); // buffering: the playhead is far from the end
  const seeksBefore = video.seeks.length;
  timers.fire();
  assert.equal(video.seeks.length, seeksBefore, 'no jump');
  assert.equal(loop.wraps, 0);
  assert.equal(timers.count(), 1, 're-armed');
});

test('timeupdate safety net: a throttled timer still loops', () => {
  const { loop, video } = setup();
  loop.setRange(0, 19);
  video.advanceTo(1);
  video.play();
  loop.activate();
  video.advanceTo(19.4); // timer never fired (hidden tab)
  video.emit('timeupdate');
  assert.equal(video.currentTime, 0.005);
  assert.equal(loop.wraps, 1);
});

test('timeupdate does nothing while paused', () => {
  const { loop, video } = setup();
  loop.setRange(0, 19);
  video.advanceTo(1);
  video.play();
  loop.activate();
  video.pause();
  video.advanceTo(25);
  video.emit('timeupdate');
  assert.equal(loop.wraps, 0);
});

test('a range that ends with the video loops on `ended` and keeps playing', () => {
  const { loop, video } = setup();
  loop.setRange(90, 100);
  video.advanceTo(95);
  video.play();
  loop.activate();
  video.advanceTo(100);
  video.ended = true;
  video.paused = true;
  video.emit('ended');
  assert.equal(video.currentTime, 90.005);
  assert.equal(video.playCalls, 2, 'play() called again after the video ended');
  assert.equal(loop.wraps, 1);
});

test('pause clears the timer; pressing play at the very end repeats at once', () => {
  const { loop, video, timers } = setup();
  loop.setRange(0, 19);
  video.advanceTo(5);
  video.play();
  loop.activate();
  assert.equal(timers.count(), 1);
  video.pause();
  assert.equal(timers.count(), 0, 'paused: no timer');

  video.advanceTo(18.995); // paused right at the end
  video.play();
  assert.equal(loop.wraps, 1, 'play at the end wraps immediately');
  assert.equal(video.currentTime, 0.005);
});

test('very short range (the literal 0 to 0.19 s) does not spin', () => {
  const { loop, video, timers } = setup();
  loop.setRange(0, 0.19);
  video.play();
  loop.activate();
  assert.equal(video.currentTime, 0, 'already inside the range: no jump on activation');
  assert.equal(timers.count(), 1);
  assert.ok(Math.abs(timers.delay() - (0.19 - 0.02) * 1000) < 1e-6, `delay ${timers.delay()} ms`);
  video.advanceTo(0.19);
  timers.fire();
  assert.equal(loop.wraps, 1, 'one repeat, no runaway');
  assert.equal(video.currentTime, 0.005);
  assert.equal(video.seeks.length, 1, 'exactly one seek per repeat');
});

// ---- RangeLoop: leaving the range -----------------------------------------------------

test('the viewer seeking outside the range releases the loop but keeps the range', () => {
  const { loop, video, changes, timers } = setup();
  loop.setRange(10, 20);
  video.advanceTo(12);
  video.play();
  loop.activate();
  video.userSeek(60);
  assert.equal(loop.active, false);
  assert.equal(loop.start, 10);
  assert.equal(loop.end, 20);
  assert.equal(changes.at(-1).reason, 'left');
  assert.equal(timers.count(), 0);
  // and it is truly detached
  video.advanceTo(70);
  video.emit('timeupdate');
  assert.equal(loop.wraps, 0);
});

test('seeking inside the range keeps the loop running', () => {
  const { loop, video, timers } = setup();
  loop.setRange(10, 20);
  video.advanceTo(12);
  video.play();
  loop.activate();
  video.userSeek(15);
  assert.equal(loop.active, true);
  assert.equal(timers.count(), 1);
  assert.ok(Math.abs(timers.delay() - (20 - 0.02 - 15) * 1000) < 1e-6);
});

test('the loop’s own seek is not mistaken for the viewer leaving', () => {
  const { loop, video } = setup();
  loop.setRange(10, 20);
  video.advanceTo(19.5);
  video.play();
  loop.activate();
  video.advanceTo(20.1); // ran past the end
  video.emit('timeupdate'); // wraps: seeks to 10.005 and emits `seeking` synchronously
  assert.equal(video.currentTime, 10.005);
  assert.equal(loop.active, true, 'still on after its own seek');
  assert.equal(loop.wraps, 1);
  video.emit('seeked');
  assert.equal(loop.active, true);
});

test('changing the range while active moves a playhead that is now outside', () => {
  const { loop, video } = setup();
  loop.setRange(10, 20);
  video.advanceTo(15);
  video.play();
  loop.activate();
  loop.setRange(30, 40);
  assert.equal(video.currentTime, 30.005);
  assert.equal(loop.active, true);
  assert.equal(loop.wraps, 0, 'repeat counter restarts with a new range');
});

test('isSuspended (an ad) keeps the loop out of the way', () => {
  let ad = true;
  const { loop, video, timers } = setup({ isSuspended: () => ad });
  loop.setRange(10, 20);
  video.advanceTo(19.9);
  video.play();
  loop.activate(); // moveInsideRange is not suspended-aware on purpose: the viewer asked for it
  video.advanceTo(25);
  video.emit('timeupdate');
  assert.equal(loop.wraps, 0, 'no repeat while suspended');
  video.userSeek(0);
  assert.equal(loop.active, true, 'an ad starting is not "the viewer left the range"');
  assert.equal(timers.count(), 0);
  ad = false;
  video.emit('playing');
  assert.equal(timers.count(), 1, 're-armed once the ad is gone');
});

// ---- RangeLoop: lifecycle -----------------------------------------------------------------

test('deactivate / toggle / clear', () => {
  const { loop, video, timers, changes } = setup();
  loop.setRange(0, 10);
  video.play();
  assert.deepEqual(loop.toggle(), { ok: true });
  assert.equal(loop.active, true);
  assert.deepEqual(loop.toggle(), { ok: true });
  assert.equal(loop.active, false);
  assert.equal(loop.hasRange, true, 'range survives switching off');
  assert.equal(timers.count(), 0);

  loop.activate();
  loop.clear();
  assert.equal(loop.hasRange, false);
  assert.equal(loop.active, false);
  assert.equal(changes.at(-1).reason, 'cleared');
  assert.deepEqual(loop.toggle(), { ok: false, reason: 'no-range' });
});

test('idle loop has no listeners and no timers; destroy detaches everything', () => {
  const { loop, video, timers, changes } = setup();
  loop.setRange(0, 10);
  video.play();
  video.advanceTo(10.5);
  video.emit('timeupdate');
  video.emit('ended');
  assert.equal(changes.filter((c) => c.reason === 'wrap').length, 0, 'inactive loop never reacts');
  assert.equal(timers.count(), 0);

  loop.activate();
  loop.destroy();
  const before = changes.length;
  video.advanceTo(30);
  video.emit('timeupdate');
  video.userSeek(50);
  assert.equal(changes.length, before, 'destroyed loop is silent');
  assert.equal(timers.count(), 0);
});

// ---- controls: text and key binder -----------------------------------------------------------

test('formatRange and rangeLoopText', () => {
  assert.equal(formatRange(0, 19), '0:00 – 0:19');
  assert.equal(formatRange(12, null), '0:12 – …');
  assert.equal(formatRange(null, 19), '… – 0:19');
  assert.equal(rangeLoopText('en', 'on', '0:00 – 0:19'), 'Range loop on · 0:00 – 0:19');
  assert.match(rangeLoopText('ar', 'on', '0:00 – 0:19'), /تكرار المقطع.*0:00 – 0:19/);
  assert.equal(rangeLoopText('xx', 'off'), 'Range loop off', 'unknown language falls back to English');
  assert.equal(rangeLoopText('en', 'no-such-key'), '');
});

test('every English message has an Arabic twin', () => {
  for (const key of ['startSet', 'endSet', 'on', 'off', 'cleared', 'needRange', 'left', 'invalid', 'too-short', 'out-of-range', 'no-range', 'unavailable']) {
    assert.notEqual(rangeLoopText('en', key, 'x'), '', `en ${key}`);
    assert.notEqual(rangeLoopText('ar', key, 'x'), '', `ar ${key}`);
  }
});

function keyEvent(code, { target, path, ...flags } = {}) {
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...flags });
  // Event.target is read-only: define it the way the platform would expose it.
  if (target !== undefined) Object.defineProperty(event, 'target', { value: target });
  if (path !== undefined) event.composedPath = () => path;
  return event;
}

function keyHarness(overrides = {}) {
  const doc = new EventTarget();
  const abort = new AbortController();
  const calls = [];
  bindRangeLoopKeys({
    doc,
    signal: abort.signal,
    enabled: () => true,
    isTyping: () => false,
    reserved: () => [],
    handlers: { markStart: () => calls.push('A'), markEnd: () => calls.push('B'), toggle: () => calls.push('toggle') },
    ...overrides,
  });
  const press = (code, extra) => {
    const event = keyEvent(code, extra);
    doc.dispatchEvent(event);
    return event;
  };
  return { press, calls, abort };
}

test('keys: Q marks A, E marks B, X toggles', () => {
  const { press, calls } = keyHarness();
  assert.deepEqual(RANGE_LOOP_KEYS, { markStart: 'KeyQ', markEnd: 'KeyE', toggle: 'KeyX' });
  const event = press('KeyQ');
  press('KeyE');
  press('KeyX');
  assert.deepEqual(calls, ['A', 'B', 'toggle']);
  assert.equal(event.defaultPrevented, true);
});

test('keys: ignored with modifiers, while repeating, while typing, when disabled, or when re-assigned', () => {
  const plain = keyHarness();
  plain.press('KeyQ', { ctrlKey: true });
  plain.press('KeyQ', { shiftKey: true });
  plain.press('KeyQ', { altKey: true });
  plain.press('KeyQ', { metaKey: true });
  plain.press('KeyQ', { repeat: true });
  plain.press('KeyZ');
  assert.deepEqual(plain.calls, []);

  const typing = keyHarness({ isTyping: () => true });
  typing.press('KeyQ');
  const off = keyHarness({ enabled: () => false });
  off.press('KeyQ');
  const taken = keyHarness({ reserved: () => ['KeyQ'] });
  taken.press('KeyQ');
  taken.press('KeyE');
  assert.deepEqual([...typing.calls, ...off.calls], []);
  assert.deepEqual(taken.calls, ['B'], 'only the re-assigned key yields');
});

test('keys: text fields are left alone (event.target and composedPath), and the binder detaches with its signal', () => {
  const direct = keyHarness();
  direct.press('KeyQ', { target: { tagName: 'INPUT' } });
  assert.deepEqual(direct.calls, [], 'event.target is an INPUT');

  const shadowed = keyHarness();
  shadowed.press('KeyQ', { path: [{ tagName: 'TEXTAREA' }] });
  assert.deepEqual(shadowed.calls, [], 'composedPath()[0] is a TEXTAREA');

  const editable = keyHarness();
  editable.press('KeyQ', { target: { tagName: 'DIV', isContentEditable: true } });
  assert.deepEqual(editable.calls, [], 'contenteditable');

  const page = keyHarness();
  page.press('KeyQ', { target: { tagName: 'BODY' } });
  assert.deepEqual(page.calls, ['A'], 'a plain page target still works');

  page.abort.abort();
  page.press('KeyQ');
  assert.deepEqual(page.calls, ['A'], 'aborted signal removes the listener');
});
