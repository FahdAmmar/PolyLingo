(function () {
  // [PolyLingo 0.5/0.6] Feature modules are separate files loaded before this one.
  const PL = globalThis.PolyLingoFeatures;
  if (
    !PL ||
    !PL.buildTimeline ||
    !PL.ReadingPanel ||
    !PL.SubtitleDragger ||
    !PL.loadLayout ||
    !PL.FocusDock ||
    !PL.loadFocusPrefs ||
    !PL.HeightIndex ||
    !PL.TranscriptIndex ||
    !PL.AutoPause ||
    !PL.getTrackCache
  ) {
    console.error(
      `[PolyLingo] feature modules are missing; content script not started`,
    );
    return;
  }
  var e = [
      `timeupdate`,
      `seeking`,
      `seeked`,
      `ratechange`,
      `play`,
      `playing`,
      `pause`,
      `waiting`,
      `emptied`,
    ],
    t = 8,
    n = 3e4,
    r = 4,
    i = -2,
    a = class {
      video;
      onChange;
      onPosition;
      primary = null;
      secondary = null;
      primaryOffset = 0;
      secondaryOffset = 0;
      lastPrimary = i;
      lastSecondary = i;
      timer;
      abort = null;
      constructor(e, t, n = null) {
        ((this.video = e), (this.onChange = t), (this.onPosition = n));
      }
      get running() {
        return this.abort !== null;
      }
      setTracks(e, t) {
        ((this.primary = e), (this.secondary = t), this.invalidate());
      }
      setOffsets(e, t) {
        ((this.primaryOffset = e / 1e3),
          (this.secondaryOffset = t / 1e3),
          this.invalidate());
      }
      start() {
        if (this.abort) return;
        let t = new AbortController();
        this.abort = t;
        for (let n of e)
          this.video.addEventListener(n, this.handleEvent, {
            signal: t.signal,
          });
        this.sync();
      }
      stop() {
        (this.abort?.abort(), (this.abort = null), this.clearTimer());
      }
      handleEvent = () => {
        this.sync();
      };
      invalidate() {
        ((this.lastPrimary = i),
          (this.lastSecondary = i),
          this.running && this.sync());
      }
      clearTimer() {
        (this.timer !== void 0 && clearTimeout(this.timer),
          (this.timer = void 0));
      }
      sync() {
        this.clearTimer();
        let e = this.video.currentTime;
        this.onPosition?.(e);
        let t = e - this.primaryOffset,
          n = e - this.secondaryOffset,
          r = this.primary ? this.primary.indexAt(t) : -1,
          i = this.secondary ? this.secondary.indexAt(n) : -1;
        ((r !== this.lastPrimary || i !== this.lastSecondary) &&
          ((this.lastPrimary = r),
          (this.lastSecondary = i),
          this.onChange({
            primary: this.primary?.cueAtIndex(r) ?? null,
            secondary: this.secondary?.cueAtIndex(i) ?? null,
          })),
          this.schedule(t, n));
      }
      schedule(e, i) {
        let a = this.video;
        if (a.paused || a.ended) return;
        let o = a.playbackRate;
        if (!(o > 0)) return;
        let s = 1 / 0;
        if (
          (this.primary && (s = Math.min(s, this.primary.nextBoundary(e) - e)),
          this.secondary &&
            (s = Math.min(s, this.secondary.nextBoundary(i) - i)),
          !Number.isFinite(s))
        )
          return;
        let c = Math.min(n, Math.max(t, (s / o) * 1e3 + r));
        this.timer = setTimeout(() => {
          this.sync();
        }, c);
      }
    },
    o = {
      fontFamily: `system-ui, "Segoe UI", Roboto, Tahoma, Arial, sans-serif`,
      fontSize: 22,
      fontWeight: 600,
      textColor: `#ffffff`,
      backgroundColor: `#000000`,
      backgroundOpacity: 0.65,
      textShadow: !1,
      outlineColor: `#000000`,
      outlineWidth: 0,
      lineHeight: 1.35,
      letterSpacing: 0,
      alignment: `center`,
      direction: `auto`,
    },
    s = { ...o, fontSize: 20, fontWeight: 500, textColor: `#55d6be` };
  function c() {
    return {
      version: 1,
      enabled: !0,
      uiLanguage: `auto`,
      theme: `system`,
      primaryLanguage: `en`,
      secondaryLanguage: `de`,
      primary: { ...o },
      secondary: { ...s },
      position: {
        preset: `bottom`,
        offsetPercent: 10,
        lineGapPx: 6,
        maxWidthPercent: 80,
      },
      timing: { primaryOffsetMs: 0, secondaryOffsetMs: 0 },
      learning: {
        shortcuts: !0,
        shortcutCodes: {
          previous: `KeyA`,
          next: `KeyD`,
          replay: `KeyS`,
          loop: `KeyR`,
        },
        wordLookup: !0,
        slowLoopRate: 1,
      },
      debug: !1,
    };
  }
  var l = new Set([`ar`, `fa`, `ur`, `he`, `iw`, `ps`, `sd`, `yi`, `dv`, `ug`]);
  function u(e) {
    let t = e.toLowerCase().split(/[-_]/),
      n = t[0] ?? ``;
    return n === `zh` && (t[1] === `hans` || t[1] === `hant`)
      ? `zh-${t[1]}`
      : n;
  }
  function d(e, t) {
    let n = e.toLowerCase(),
      r = t.toLowerCase();
    return n === r || u(n) === u(r);
  }
  function f(e) {
    return l.has(u(e));
  }
  var p = /^[a-zA-Z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;
  function m(e) {
    return typeof e == `string` && p.test(e);
  }
  var ee = `polylingo/get-status`,
    te = `polylingo/retry-tracks`,
    ne = `polylingo/run-diagnostics`;
  function re(e) {
    if (typeof e != `object` || !e) return null;
    let t = e;
    return t.type === `polylingo/get-status`
      ? { type: ee }
      : t.type === `polylingo/retry-tracks`
        ? { type: te }
        : t.type === `polylingo/command` &&
            typeof t.command === `string` &&
            t.command.length <= 40
          ? { type: `polylingo/command`, command: t.command }
          : t.type === `polylingo/run-diagnostics`
          ? { type: ne, withDriver: t.withDriver === !0 }
          : null;
  }
  var ie = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    ae = [1, 0.75, 0.5],
    oe = /^[\p{L}\p{N} ,'"._-]{1,120}$/u,
    se =
      /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-2])|Space|Arrow(?:Up|Down|Left|Right))$/;
  function h(e, t, n, r) {
    return typeof e != `number` || !Number.isFinite(e)
      ? r
      : Math.min(n, Math.max(t, e));
  }
  function g(e, t) {
    return typeof e == `boolean` ? e : t;
  }
  function _(e, t, n) {
    return typeof e == `string` && t.includes(e) ? e : n;
  }
  function ce(e, t, n) {
    return typeof e == `number` && t.includes(e) ? e : n;
  }
  function v(e, t) {
    return typeof e == `string` && ie.test(e) ? e : t;
  }
  function y(e) {
    return typeof e == `object` && e && !Array.isArray(e) ? e : {};
  }
  function b(e, t) {
    return typeof e == `string` && se.test(e) ? e : t;
  }
  function x(e, t) {
    let n = y(e);
    return {
      fontFamily:
        typeof n.fontFamily == `string` && oe.test(n.fontFamily)
          ? n.fontFamily
          : t.fontFamily,
      fontSize: h(n.fontSize, 10, 72, t.fontSize),
      fontWeight:
        Math.round(h(n.fontWeight, 100, 900, t.fontWeight) / 100) * 100,
      textColor: v(n.textColor, t.textColor),
      backgroundColor: v(n.backgroundColor, t.backgroundColor),
      backgroundOpacity: h(n.backgroundOpacity, 0, 1, t.backgroundOpacity),
      textShadow: g(n.textShadow, t.textShadow),
      outlineColor: v(n.outlineColor, t.outlineColor),
      outlineWidth: h(n.outlineWidth, 0, 6, t.outlineWidth),
      lineHeight: h(n.lineHeight, 1, 2.4, t.lineHeight),
      letterSpacing: h(n.letterSpacing, -1, 6, t.letterSpacing),
      alignment: _(n.alignment, [`left`, `center`, `right`], t.alignment),
      direction: _(n.direction, [`auto`, `ltr`, `rtl`], t.direction),
    };
  }
  function S(e) {
    let t = c(),
      n = y(e),
      r = y(n.position),
      i = y(n.timing),
      a = y(n.learning);
    return {
      version: 1,
      enabled: g(n.enabled, t.enabled),
      uiLanguage: _(n.uiLanguage, [`auto`, `en`, `ar`], t.uiLanguage),
      theme: _(n.theme, [`dark`, `light`, `system`], t.theme),
      primaryLanguage: m(n.primaryLanguage)
        ? n.primaryLanguage
        : t.primaryLanguage,
      secondaryLanguage: m(n.secondaryLanguage)
        ? n.secondaryLanguage
        : t.secondaryLanguage,
      primary: x(n.primary, t.primary),
      secondary: x(n.secondary, t.secondary),
      position: {
        preset: _(r.preset, [`bottom`, `top`], t.position.preset),
        offsetPercent: h(r.offsetPercent, 0, 40, t.position.offsetPercent),
        lineGapPx: h(r.lineGapPx, 0, 40, t.position.lineGapPx),
        maxWidthPercent: h(
          r.maxWidthPercent,
          30,
          100,
          t.position.maxWidthPercent,
        ),
      },
      timing: {
        primaryOffsetMs: Math.round(h(i.primaryOffsetMs, -1e4, 1e4, 0)),
        secondaryOffsetMs: Math.round(h(i.secondaryOffsetMs, -1e4, 1e4, 0)),
      },
      learning: {
        shortcuts: g(a.shortcuts, t.learning.shortcuts),
        shortcutCodes: {
          previous: b(
            y(a.shortcutCodes).previous,
            t.learning.shortcutCodes.previous,
          ),
          next: b(y(a.shortcutCodes).next, t.learning.shortcutCodes.next),
          replay: b(y(a.shortcutCodes).replay, t.learning.shortcutCodes.replay),
          loop: b(y(a.shortcutCodes).loop, t.learning.shortcutCodes.loop),
        },
        wordLookup: g(a.wordLookup, t.learning.wordLookup),
        slowLoopRate: ce(a.slowLoopRate, ae, t.learning.slowLoopRate),
      },
      debug: g(n.debug, t.debug),
    };
  }
  var C = `polylingo.settings`;
  async function le(e = chrome.storage.sync) {
    try {
      let t = await e.get(C);
      return t[`polylingo.settings`] === void 0 ? c() : S(t[C]);
    } catch (e) {
      return (console.error(`[PolyLingo] failed to load settings`, e), c());
    }
  }
  function ue(e, t = chrome.storage.onChanged) {
    let n = (t, n) => {
      if (n !== `sync`) return;
      let r = t[C];
      r?.newValue !== void 0 && e(S(r.newValue));
    };
    return (t.addListener(n), () => t.removeListener(n));
  }
  function w(e, t) {
    return e === `en` || e === `ar`
      ? e
      : t.toLowerCase().startsWith(`ar`)
        ? `ar`
        : `en`;
  }
  var T = /\p{L}/u,
    de = /\u0640|[\u064B-\u065F\u0670]/g,
    fe = /([\p{L}\p{M}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}]+)*)/u,
    pe = new Map();
  function me(e) {
    if (typeof Intl.Segmenter != `function`) return null;
    let t = pe.get(e);
    if (!t) {
      try {
        t = new Intl.Segmenter(e === `` ? void 0 : e, { granularity: `word` });
      } catch {
        t = new Intl.Segmenter(void 0, { granularity: `word` });
      }
      pe.set(e, t);
    }
    return t;
  }
  function he(e, t) {
    let n = me(t);
    if (!n)
      return e
        .split(fe)
        .filter((e) => e !== ``)
        .map((e) => ({ text: e, word: T.test(e) }));
    let r = [];
    for (let t of n.segment(e))
      r.push({
        text: t.segment,
        word: t.isWordLike === !0 && T.test(t.segment),
      });
    return r;
  }
  function ge(e, t) {
    let n = e.normalize(`NFC`).replace(de, ``).trim();
    try {
      return n.toLocaleLowerCase(t === `` ? void 0 : t);
    } catch {
      return n.toLowerCase();
    }
  }
  var _e = `polylingo.vocab.`,
    E = { word: 120, sentence: 400, note: 600 },
    ve = /^[\w-]{11}$/,
    D = /[\u202A-\u202E\u2066-\u2069]/g,
    ye = /[\uD800-\uDBFF]$/;
  function O(e, t) {
    let n = e.length > t ? e.slice(0, t) : e;
    return ye.test(n) ? n.slice(0, -1) : n;
  }
  function k(e, t) {
    return typeof e == `string`
      ? O(
          e
            .replace(/\p{Cc}/gu, ` `)
            .replace(D, ``)
            .replace(/\s+/g, ` `)
            .trim(),
          t,
        )
      : ``;
  }
  function be(e) {
    return typeof e == `string`
      ? O(
          e
            .replace(
              /\r\n?/g,
              `
`,
            )
            .replace(/[^\P{Cc}\n]/gu, ` `)
            .replace(D, ``)
            .trim(),
          E.note,
        )
      : ``;
  }
  function xe(e, t) {
    return `w:${u(e)}:${ge(t, e)}`;
  }
  function Se(e, t, n) {
    return `s:${u(e)}:${t}:${Math.round(n * 1e3)}`;
  }
  function A(e, t, n) {
    return typeof e == `number` && Number.isFinite(e)
      ? Math.min(n, Math.max(t, e))
      : 0;
  }
  function Ce(e, t) {
    if (typeof t != `object` || !t || Array.isArray(t)) return null;
    let n = t,
      r = n.kind;
    if (r !== `word` && r !== `sentence`) return null;
    let i = k(n.text, r === `word` ? E.word : E.sentence);
    if (i === `` || !m(n.language)) return null;
    let a = k(n.translation, E.sentence),
      o = n.videoId;
    return {
      id: e,
      kind: r,
      text: i,
      language: n.language,
      sentence: r === `word` ? k(n.sentence, E.sentence) : ``,
      translation: a,
      translationLanguage:
        a !== `` && m(n.translationLanguage) ? n.translationLanguage : ``,
      note: be(n.note),
      videoId: typeof o == `string` && ve.test(o) ? o : ``,
      time: A(n.time, 0, 1e6),
      createdAt: A(n.createdAt, 0, 2 ** 53 - 1),
    };
  }
  function j(e, t) {
    let n = k(e.text, e.kind === `word` ? E.word : E.sentence);
    return n === ``
      ? null
      : Ce(
          e.kind === `word`
            ? xe(e.language, n)
            : Se(e.language, e.videoId, e.time),
          { ...e, text: n, note: ``, createdAt: t },
        );
  }
  var M = (e) => `${_e}${e}`;
  function we(e) {
    return e instanceof Error && /quota/i.test(e.message);
  }
  async function Te(e, t = chrome.storage.local) {
    try {
      return (await t.get(M(e)))[M(e)] !== void 0;
    } catch {
      return !1;
    }
  }
  async function Ee(e, t = chrome.storage.local) {
    try {
      return (await t.get(M(e.id)))[M(e.id)] === void 0
        ? (await t.set({ [M(e.id)]: e }), `saved`)
        : `exists`;
    } catch (e) {
      return we(e)
        ? `full`
        : (console.error(`[PolyLingo] failed to save vocabulary entry`, e),
          `error`);
    }
  }
  async function De(e, t = chrome.storage.local) {
    await t.remove(M(e));
  }
  var Oe = 3,
    ke = 0.001,
    Ae = 0.05;
  function je(e) {
    for (let t = 0; t < e.length; t++) {
      let n = e[t];
      if (!n || !(n.endTime > n.startTime)) return !1;
      let r = e[t + 1];
      if (r && n.endTime > r.startTime) return !1;
    }
    return !0;
  }
  function N(e) {
    let t = e
        .filter(
          (e) =>
            Number.isFinite(e.startTime) && e.startTime >= 0 && e.text !== ``,
        )
        .sort((e, t) => e.startTime - t.startTime),
      n = [];
    for (let e = 0; e < t.length; e++) {
      let r = t[e];
      if (!r) continue;
      let i = t[e + 1],
        a = r.endTime;
      if (
        ((!Number.isFinite(a) || a <= r.startTime) &&
          (a = i ? i.startTime : r.startTime + Oe),
        i && a > i.startTime && (a = i.startTime),
        a - r.startTime < ke)
      )
        continue;
      let o = n[n.length - 1];
      o && o.text === r.text && r.startTime - o.endTime <= Ae
        ? (o.endTime = a)
        : n.push({ startTime: r.startTime, endTime: a, text: r.text });
    }
    return n.map((e, t) => ({
      id: t,
      startTime: e.startTime,
      endTime: e.endTime,
      text: e.text,
    }));
  }
  var P = 2e4,
    F = class extends Error {
      constructor(e) {
        (super(e), (this.name = `SubtitleParseError`));
      }
    },
    Me = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\uFEFF]/g;
  function Ne(e) {
    return e
      .replace(
        /\r\n?/g,
        `
`,
      )
      .replace(Me, ``)
      .split(
        `
`,
      )
      .map((e) => e.replace(/[ \t\u00A0]+/g, ` `).trim())
      .filter((e) => e !== ``)
      .join(
        `
`,
      )
      .slice(0, 600);
  }
  function I(e) {
    return typeof e == `object` && !!e && !Array.isArray(e);
  }
  function L(e) {
    if (e.length > 8e6) throw new F(`input too large`);
    let t;
    try {
      t = JSON.parse(e);
    } catch {
      throw new F(`invalid JSON`);
    }
    if (!I(t) || !Array.isArray(t.events)) throw new F(`missing events array`);
    let n = t.events,
      r = n.length > P,
      i = [];
    for (let e of n.slice(0, P)) {
      if (!I(e)) continue;
      let t = e.tStartMs,
        n = e.segs;
      if (typeof t != `number` || !Array.isArray(n)) continue;
      let r = ``;
      for (let e of n) I(e) && typeof e.utf8 == `string` && (r += e.utf8);
      let a = Ne(r);
      if (a === ``) continue;
      let o = e.dDurationMs;
      i.push({
        startTime: t / 1e3,
        endTime: typeof o == `number` && o > 0 ? (t + o) / 1e3 : NaN,
        text: a,
      });
    }
    return { cues: N(i), truncated: r };
  }
  async function R(e, t, n) {
    if (t === null)
      return {
        name: e,
        ok: !1,
        detail: `no URL could be built (no tracklist?)`,
      };
    try {
      let r = await n(t),
        i = `n/a`;
      if (r.text.trim() !== ``)
        try {
          i = String(L(r.text).cues.length);
        } catch {
          i = `parse-error`;
        }
      return {
        name: e,
        ok: r.status === 200 && /^[1-9]\d*$/.test(i),
        detail: `status=${r.status} length=${r.text.length} cues=${i}`,
      };
    } catch (t) {
      return { name: e, ok: !1, detail: `error: ${String(t)}` };
    }
  }
  async function Pe(e) {
    let { loader: t, fetchCaption: n, settings: r } = e,
      i = t.inspect(),
      a = [];
    (a.push(await R(`first-track / no auth`, t.experimentUrl(0, null, !1), n)),
      i.hasAuth
        ? (a.push(
            await R(
              `first-track / with player auth`,
              t.experimentUrl(0, null, !0),
              n,
            ),
          ),
          a.push(
            await R(
              `translation to "${r.secondaryLanguage}" / with player auth`,
              t.experimentUrl(0, r.secondaryLanguage, !0),
              n,
            ),
          ))
        : a.push({
            name: `player auth`,
            ok: !1,
            detail: `no player request captured yet — turn on YouTube CC once, then rerun`,
          }));
    let o = i.tracklist?.tracks[0];
    if (e.withDriver && o) {
      let t = await e.runDriver(o.languageCode, null);
      a.push({
        name: `player driver (setOption captions.track)`,
        ok: t.captured,
        detail: `captured=${String(t.captured)} pot=${String(t.hadPot)}${t.error ? ` error=${t.error}` : ``}`,
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      extensionVersion: e.extensionVersion,
      userAgent: e.userAgent,
      videoId: i.videoId,
      tracklist: i.tracklist,
      auth: { hasAuth: i.hasAuth, hasPot: i.hasPot },
      cachedTracks: i.cachedKeys,
      experiments: a,
    };
  }
  var z = `https://www.youtube.com`,
    Fe = `/api/timedtext`,
    Ie = /^[A-Za-z0-9_-]{6,20}$/,
    B = 4e3;
  function V(e) {
    if (e.length > B * 2) return null;
    let t;
    try {
      t = new URL(e, z);
    } catch {
      return null;
    }
    return t.origin === z && t.pathname === Fe ? t : null;
  }
  function H(e) {
    let t = e.searchParams.get(`pot`);
    if (!t || t.length > B) return null;
    let n = e.searchParams.get(`potc`),
      r = e.searchParams.get(`c`);
    return {
      pot: t,
      potc: n && n.length <= 8 ? n : null,
      client: r && /^[A-Z_]{2,24}$/.test(r) ? r : null,
    };
  }
  function U(e) {
    let t = V(e);
    if (!t) return null;
    let n = t.searchParams.get(`v`),
      r = t.searchParams.get(`lang`),
      i = t.searchParams.get(`tlang`);
    return !n || !Ie.test(n) || !m(r) || (i !== null && !m(i))
      ? null
      : {
          videoId: n,
          lang: r,
          tlang: i,
          kind: t.searchParams.get(`kind`) === `asr` ? `asr` : `manual`,
          auth: H(t),
        };
  }
  function W(e) {
    let t = V(e);
    return t ? H(t) : null;
  }
  function Le(e, t) {
    let n = V(e);
    return !n || (t.translateTo !== null && !m(t.translateTo))
      ? null
      : (n.searchParams.set(`fmt`, `json3`),
        t.translateTo !== null && n.searchParams.set(`tlang`, t.translateTo),
        t.auth &&
          (n.searchParams.set(`pot`, t.auth.pot),
          t.auth.potc && n.searchParams.set(`potc`, t.auth.potc),
          n.searchParams.set(`c`, t.auth.client ?? `WEB`)),
        n.href);
  }
  var Re = `polylingo:from-main`,
    ze = `polylingo:to-main`,
    Be = 8e3,
    Ve = /^[A-Za-z0-9_-]{6,20}$/;
  function G(e) {
    return typeof e == `object` && e && !Array.isArray(e) ? e : null;
  }
  function He(e) {
    if (typeof e != `string` || e.length > 4e6) return null;
    try {
      return G(JSON.parse(e));
    } catch {
      return null;
    }
  }
  function Ue(e) {
    let t = G(e);
    if (
      !t ||
      typeof t.videoId != `string` ||
      !Ve.test(t.videoId) ||
      !Array.isArray(t.tracks) ||
      !Array.isArray(t.translationLanguages) ||
      t.tracks.length > 100 ||
      t.translationLanguages.length > 400
    )
      return null;
    let n = [];
    for (let e of t.tracks) {
      let t = G(e);
      !t ||
        !m(t.languageCode) ||
        (t.kind !== `asr` && t.kind !== `manual`) ||
        typeof t.name != `string` ||
        typeof t.baseUrl != `string` ||
        t.baseUrl.length > Be ||
        typeof t.isTranslatable != `boolean` ||
        U(t.baseUrl) === null ||
        n.push({
          languageCode: t.languageCode,
          kind: t.kind,
          name: t.name.slice(0, 120),
          baseUrl: t.baseUrl,
          isTranslatable: t.isTranslatable,
        });
    }
    let r = t.translationLanguages.filter(m);
    return { videoId: t.videoId, tracks: n, translationLanguages: r };
  }
  function We(e) {
    let t = G(e);
    if (
      !t ||
      typeof t.url != `string` ||
      typeof t.body != `string` ||
      t.url.length > Be
    )
      return null;
    let n = U(t.url);
    return n
      ? {
          videoId: n.videoId,
          lang: n.lang,
          tlang: n.tlang,
          kind: n.kind,
          url: t.url,
          body: t.body,
        }
      : null;
  }
  function Ge(e) {
    let t = He(e);
    if (!t) return null;
    switch (t.type) {
      case `tracklist`: {
        if (t.data === null) return { type: `tracklist`, data: null };
        let e = Ue(t.data);
        return e ? { type: `tracklist`, data: e } : null;
      }
      case `capture`: {
        let e = We(t.data);
        return e ? { type: `capture`, data: e } : null;
      }
      case `driver-result`:
        return typeof t.ok == `boolean`
          ? {
              type: `driver-result`,
              ok: t.ok,
              error: typeof t.error == `string` ? t.error.slice(0, 200) : ``,
            }
          : null;
      default:
        return null;
    }
  }
  var Ke = class {
      onMessage;
      abort = null;
      constructor(e) {
        this.onMessage = e;
      }
      start() {
        if (this.abort) return;
        let e = new AbortController();
        ((this.abort = e),
          document.addEventListener(
            Re,
            (e) => {
              let t = Ge(e.detail);
              t && this.onMessage(t);
            },
            { signal: e.signal },
          ));
      }
      stop() {
        (this.abort?.abort(), (this.abort = null));
      }
      send(e) {
        document.dispatchEvent(
          new CustomEvent(ze, { detail: JSON.stringify(e) }),
        );
      }
    },
    qe = `
.card {
  display: none; position: absolute; left: 50%; transform: translateX(-50%); z-index: 12;
  box-sizing: border-box; width: min(440px, 92%); padding: 12px 14px; border-radius: 14px;
  background: rgba(17, 20, 28, 0.96); color: #e8ecf4; pointer-events: auto; user-select: text;
  font: 14px/1.5 system-ui, "Segoe UI", Tahoma, sans-serif;
  box-shadow: 0 10px 30px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.12);
}
.card[data-open] { display: block; }
.card[data-place="top"] { top: 6%; }
.card[data-place="bottom"] { bottom: max(16%, 64px); }
:host-context(.ad-showing) .card { display: none; }
.card .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card .word { margin: 0; font-size: 22px; font-weight: 700; color: #55d6be; overflow-wrap: anywhere; }
.card .label { margin: 10px 0 2px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #8d97ad; }
.card .text { margin: 0; overflow-wrap: anywhere; }
.card .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.card button {
  font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px; cursor: pointer;
  color: #e8ecf4; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16);
}
.card button:hover { background: rgba(255,255,255,.16); }
.card button:focus-visible { outline: 2px solid #55d6be; outline-offset: 2px; }
.card button[data-on] { color: #04211c; background: #2dd4bf; border-color: #2dd4bf; }
.card .x { padding: 2px 9px; font-size: 18px; line-height: 1.2; }
.card .msg { min-height: 1.4em; margin: 8px 0 0; font-size: 12px; color: #8d97ad; }
`;
  function K(e, t, n) {
    let r = e.createElement(t);
    return ((r.className = n), r);
  }
  function q(e, t) {
    let n = K(e, `button`, ``);
    return ((n.type = `button`), (n.dataset.action = t), n);
  }
  var Je = class {
      card;
      wordEl;
      sentenceBox;
      sentenceEl;
      translationBox;
      translationEl;
      sentenceLabel;
      translationLabel;
      saveWord;
      saveSentence;
      copy;
      replay;
      closeButton;
      msg;
      onAction = null;
      constructor(e) {
        let t = e.ownerDocument,
          n = t.createElement(`style`);
        ((n.textContent = qe),
          (this.card = K(t, `div`, `card`)),
          this.card.setAttribute(`role`, `dialog`),
          (this.wordEl = K(t, `p`, `word`)),
          (this.closeButton = q(t, `close`)),
          this.closeButton.classList.add(`x`),
          (this.closeButton.textContent = `×`));
        let r = K(t, `div`, `head`);
        (r.append(this.wordEl, this.closeButton),
          (this.sentenceLabel = K(t, `p`, `label`)),
          (this.sentenceEl = K(t, `p`, `text`)),
          (this.sentenceBox = K(t, `div`, ``)),
          this.sentenceBox.append(this.sentenceLabel, this.sentenceEl),
          (this.translationLabel = K(t, `p`, `label`)),
          (this.translationEl = K(t, `p`, `text`)),
          (this.translationBox = K(t, `div`, ``)),
          this.translationBox.append(this.translationLabel, this.translationEl),
          (this.saveWord = q(t, `save-word`)),
          (this.saveSentence = q(t, `save-sentence`)),
          (this.copy = q(t, `copy`)),
          (this.replay = q(t, `replay`)));
        let i = K(t, `div`, `actions`);
        (i.append(this.saveWord, this.saveSentence, this.copy, this.replay),
          (this.msg = K(t, `p`, `msg`)),
          this.msg.setAttribute(`role`, `status`),
          this.card.append(
            r,
            this.sentenceBox,
            this.translationBox,
            i,
            this.msg,
          ),
          this.card.addEventListener(`click`, (e) => {
            e.stopPropagation();
            let t = e.target;
            if (!(t instanceof Element)) return;
            let n = t.closest(`button[data-action]`)?.dataset.action;
            n && this.onAction?.(n);
          }),
          this.card.addEventListener(`dblclick`, (e) => {
            e.stopPropagation();
          }),
          e.append(n, this.card));
      }
      get isOpen() {
        return this.card.hasAttribute(`data-open`);
      }
      open(e, t) {
        this.onAction = t;
        let n = (e) => (f(e) ? `rtl` : `ltr`);
        ((this.wordEl.textContent = e.word),
          (this.wordEl.dir = n(e.language)),
          (this.sentenceEl.textContent = e.sentence),
          (this.sentenceEl.dir = n(e.language)),
          (this.translationEl.textContent = e.translation),
          (this.translationEl.dir = n(e.translationLanguage)),
          (this.translationBox.hidden = e.translation === ``),
          (this.card.dataset.place = e.placement),
          this.card.setAttribute(`aria-label`, e.word),
          (this.msg.textContent = ``),
          this.update(e.wordSaved, e.sentenceSaved, e.strings),
          this.card.setAttribute(`data-open`, ``));
      }
      update(e, t, n) {
        ((this.sentenceLabel.textContent = n.sentence),
          (this.translationLabel.textContent = n.translation),
          this.closeButton.setAttribute(`aria-label`, n.close),
          (this.copy.textContent = n.copy),
          (this.replay.textContent = n.replay));
        let r = (e, t, r, i) => {
          ((e.textContent = t ? r : i),
            (e.title = t ? n.removeHint : ``),
            e.toggleAttribute(`data-on`, t),
            e.setAttribute(`aria-pressed`, String(t)));
        };
        (r(this.saveWord, e, n.savedWord, n.saveWord),
          r(this.saveSentence, t, n.savedSentence, n.saveSentence));
      }
      message(e) {
        this.msg.textContent = e;
      }
      close() {
        (this.card.removeAttribute(`data-open`), (this.onAction = null));
      }
    },
    Ye = `polylingo-host`,
    J = `data-polylingo`,
    Xe = `polylingo-native-style`,
    Ze = 900,
    Qe = `
:host { all: initial; position: absolute; inset: 0; display: block; z-index: 20; pointer-events: none; }
:host([data-focus]) { z-index: 30; }
[hidden] { display: none !important; }
.lines {
  position: absolute; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center;
  width: max-content; pointer-events: none; z-index: 10; contain: layout style;
}
:host-context(.ad-showing) .lines, :host-context(.ad-showing) .float { display: none; }
:host([data-focus]) .lines {
  display: flex; top: auto !important; bottom: 7% !important;
  left: calc(var(--pl-split, 42%) + (100% - var(--pl-split, 42%)) / 2) !important;
  width: calc((100% - var(--pl-split, 42%)) * .96) !important; max-width: calc((100% - var(--pl-split, 42%)) * .96) !important;
}
.toolbar {
  position: absolute; top: 1rem; inset-inline-end: 1rem; z-index: 50; pointer-events: auto;
  display: flex; align-items: center; gap: .45rem; transition: opacity 160ms ease;
}
:host-context(.html5-video-player.ytp-autohide) .toolbar { opacity: 0; pointer-events: none; }
:host([data-focus]) .toolbar { display: none; }
.focus-button, .reset-button {
  border: 1px solid rgba(255,255,255,.3); border-radius: .55rem; padding: .45rem .7rem; cursor: pointer;
  color: #fff; background: rgba(0,0,0,.65); font: 600 13px system-ui, sans-serif; height: 34px; box-sizing: border-box;
}
.reset-button { padding: .3rem .55rem; }
.focus-button:hover, .reset-button:hover { background: rgba(45,212,191,.22); border-color: rgba(45,212,191,.6); }
.focus-button:focus-visible, .reset-button:focus-visible { outline: 2px solid #2dd4bf; outline-offset: 2px; }
.line {
  display: none; box-sizing: border-box; max-width: 100%; margin: 0; padding: 0.12em 0.5em;
  border-radius: 0.28em; white-space: pre-line; overflow-wrap: anywhere;
  font-family: var(--ff); font-weight: var(--fw); line-height: var(--lh);
  font-size: calc(var(--fs) * var(--pl-scale, 1) * 1px);
  color: var(--c); background: var(--bg); text-align: var(--ta); letter-spacing: var(--ls);
  text-shadow: var(--ts); -webkit-text-stroke: var(--sw) var(--sc); paint-order: stroke fill;
  opacity: 0; transform: translateY(6px);
  transition: opacity 140ms ease-out, transform 140ms ease-out, display 140ms allow-discrete;
}
.line[data-visible] { display: block; opacity: 1; transform: none; }
@starting-style { .line[data-visible] { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { .line { transition: none; transform: none; } .toolbar { transition: none; } }
[data-lookup] .line { pointer-events: auto; }
[data-lookup] .w { cursor: pointer; border-radius: 0.2em; }
[data-lookup] .w:hover { background: rgba(45, 212, 191, 0.35); }
.toast {
  display: none; position: absolute; top: 12%; left: 50%; transform: translateX(-50%);
  padding: 0.45em 1em; border-radius: 999px; pointer-events: none; z-index: 11;
  font: 600 15px system-ui, "Segoe UI", Tahoma, sans-serif; color: #04211c; background: #2dd4bf;
}
.toast[data-show] { display: block; animation: toast 1400ms ease-out forwards; }
@keyframes toast { 0% { opacity: 0; } 12% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
${PL.READING_PANEL_CSS}
${PL.SUBTITLE_DRAGGER_CSS}
${PL.FOCUS_DOCK_CSS}
/* [PolyLingo 0.6] display modes, side, lite mode, dock offsets */
:host([data-view="primary"]) .slot[data-line="secondary"] .line,
:host([data-view="secondary"]) .slot[data-line="primary"] .line { display: none !important; }
:host([data-view="recall"]) .line { pointer-events: auto; }
:host([data-view="recall"][data-recall-hides="secondary"]) .slot[data-line="secondary"] .line:not([data-revealed]),
:host([data-view="recall"][data-recall-hides="primary"]) .slot[data-line="primary"] .line:not([data-revealed]) { filter: blur(7px); cursor: pointer; }
:host([data-lite]) .line, :host([data-lite]) .toolbar { transition: none !important; }
:host([data-focus]) .lines { bottom: calc(var(--pl-vb, 0px) + 5%) !important; }
:host([data-focus][data-side="right"]) .lines { left: calc((100% - var(--pl-split, 42%)) / 2) !important; }
:host([data-focus]) .float { inset: 0 0 var(--pl-dock-h, 0px) var(--pl-split, 42%); }
:host([data-focus][data-side="right"]) .float { inset: 0 var(--pl-split, 42%) var(--pl-dock-h, 0px) 0; }
:host([data-focus]) .card { left: calc(var(--pl-split, 42%) + (100% - var(--pl-split, 42%)) / 2); }
:host([data-focus][data-side="right"]) .card { left: calc((100% - var(--pl-split, 42%)) / 2); }
:host([data-focus]) .card[data-place="bottom"] { bottom: auto; top: 6%; }
`,
    $e = `.html5-video-player[${J}] .ytp-caption-window-container { visibility: hidden !important; }`,
    et = `.html5-video-player[data-polylingo-focus] video { transform-origin: center center !important; transform: translate(var(--pl-vx, 0px), var(--pl-vy, 0px)) scale(var(--pl-vk, 1)) !important; } .html5-video-player[data-polylingo-focus] { background: #08090d !important; } .html5-video-player[data-polylingo-focus] .ytp-chrome-bottom, .html5-video-player[data-polylingo-focus] .ytp-gradient-bottom, .html5-video-player[data-polylingo-focus] .ytp-chrome-top, .html5-video-player[data-polylingo-focus] .ytp-gradient-top, .html5-video-player[data-polylingo-focus] .ytp-pause-overlay, .html5-video-player[data-polylingo-focus] .ytp-ce-element { display: none !important; }`;
  function tt(e, t) {
    let n = e.replace(`#`, ``),
      r = n.length === 3 ? [...n].map((e) => e + e).join(``) : n,
      i = Number.parseInt(r, 16),
      a = Math.min(1, Math.max(0, t));
    return `rgba(${(i >> 16) & 255}, ${(i >> 8) & 255}, ${i & 255}, ${a})`;
  }
  function nt(e, t) {
    let n = (t, n) => {
      e.style.setProperty(t, n);
    };
    (n(`--ff`, t.fontFamily),
      n(`--fw`, String(t.fontWeight)),
      n(`--fs`, String(t.fontSize)),
      n(`--lh`, String(t.lineHeight)),
      n(`--c`, t.textColor),
      n(`--bg`, tt(t.backgroundColor, t.backgroundOpacity)),
      n(`--ta`, t.alignment),
      n(`--ls`, `${t.letterSpacing}px`),
      n(
        `--ts`,
        t.textShadow
          ? `0 1px 3px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.8)`
          : `none`,
      ),
      n(`--sw`, `${t.outlineWidth}px`),
      n(`--sc`, t.outlineColor));
  }
  function rt(e, t) {
    return e.direction === `auto`
      ? t === ``
        ? `auto`
        : f(t)
          ? `rtl`
          : `ltr`
      : e.direction;
  }
  var it = class e {
      container;
      host;
      shadow;
      root;
      floatLayer;
      primarySlot;
      secondarySlot;
      primaryLine;
      secondaryLine;
      toolbar;
      sceneButtons;
      resetButton;
      focusButton;
      panel;
      dragger;
      toastEl;
      resizeObserver;
      settings = null;
      primaryLanguage = ``;
      secondaryLanguage = ``;
      lookupHandler = null;
      card = null;
      focus = !1;
      focusFullscreen = !1;
      seekHandler = null;
      actionHandler = null;
      layoutHandler = null;
      layout = PL.defaultLayout();
      splitNow = PL.SPLIT_DEFAULT;
      videoFrame = 0;
      videoWarned = !1;
      observedVideo = null;
      uiLang = `en`;
      focusLabels = {
        en: {
          enter: `Focus reading`,
          exit: `Exit focus`,
          reset: `Reset subtitle positions`,
        },
        ar: {
          enter: `وضع القراءة المركّزة`,
          exit: `الخروج من وضع القراءة`,
          reset: `إعادة مواضع الترجمة`,
        },
      };
      constructor(t) {
        this.container = t;
        const n = t.ownerDocument;
        this.host = n.createElement(`div`);
        this.host.id = Ye;
        const r = this.host.attachShadow({ mode: `closed` });
        this.shadow = r;
        const i = n.createElement(`style`);
        i.textContent = Qe;

        // Subtitle lines live in slots so each one can be dragged on its own.
        const slot = (key) => {
          const line = n.createElement(`div`);
          line.className = `line`;
          const el = n.createElement(`div`);
          el.className = `slot`;
          el.dataset.line = key;
          el.append(line);
          return { el, line };
        };
        const p = slot(`primary`);
        const s = slot(`secondary`);
        this.primarySlot = p.el;
        this.secondarySlot = s.el;
        this.primaryLine = p.line;
        this.secondaryLine = s.line;
        this.root = n.createElement(`div`);
        this.root.className = `lines`;
        this.root.append(this.primarySlot, this.secondarySlot);
        this.floatLayer = n.createElement(`div`);
        this.floatLayer.className = `float`;

        this.panel = new PL.ReadingPanel(n, {
          segment: (text, language) => he(text, language),
          onCount: (position, total) => this.dock?.setCount(position, total),
          onWord: (hit) =>
            this.lookupHandler?.({
              line: hit.line,
              word: hit.word,
              scene: hit.scene,
            }),
          onSeek: (time) => this.seekHandler?.(time),
          onAction: (action) => this.actionHandler?.(action),
          onClose: () => this.setFocus(!1),
          onSplit: (percent) => this.applySplit(percent),
          onSplitCommit: (percent) => {
            this.layout = { ...this.layout, split: percent };
            this.layoutHandler?.(this.layout);
          },
        });
        this.dragger = new PL.SubtitleDragger({
          doc: n,
          layer: this.floatLayer,
          flow: this.root,
          slots: { primary: this.primarySlot, secondary: this.secondarySlot },
          onCommit: (positions) => {
            this.layout = { ...this.layout, ...positions };
            this.layoutHandler?.(this.layout);
          },
          onChange: () => this.syncResetButton(),
        });

        // [PolyLingo 0.6] Control dock under the video in Focus reading.
        const withVideo = (fn) => {
          const video = this.findVideo();
          video && fn(video);
        };
        this.dock = new PL.FocusDock(n, {
          onAction: (action) => this.actionHandler?.(action),
          onTogglePlay: () =>
            withVideo((v) => (v.paused ? v.play().catch(() => void 0) : v.pause())),
          onSkip: (seconds) =>
            withVideo((v) => {
              const end = Number.isFinite(v.duration) ? v.duration : Infinity;
              v.currentTime = Math.min(end, Math.max(0, v.currentTime + seconds));
            }),
          onSeek: (time) =>
            withVideo((v) => {
              Number.isFinite(time) && (v.currentTime = Math.max(0, time));
            }),
          onSpeed: (rate) =>
            withVideo((v) => {
              v.playbackRate = rate;
            }),
          onSearch: (query) => this.runSearch(query),
          onSearchStep: (direction) => this.stepSearch(direction),
          onSearchCommit: () => this.commitSearch(),
          onPrefs: (patch) => this.prefsHandler?.(patch),
          onCopy: () => this.copyScene(),
          onSave: () => this.saveHandler?.(),
          onReveal: () => this.toggleReveal(),
          onClearCache: () => this.clearCacheHandler?.(),
          onResetPanel: () => this.resetPanel(),
          legacyCodes: () => this.legacyCodesGetter?.() ?? [],
        });

        this.toolbar = n.createElement(`div`);
        this.toolbar.className = `toolbar`;
        this.sceneButtons = PL.createSceneButtons(n, {
          onAction: (action) => this.actionHandler?.(action),
        });
        this.resetButton = n.createElement(`button`);
        this.resetButton.className = `reset-button`;
        this.resetButton.type = `button`;
        this.resetButton.textContent = `⟲`;
        this.resetButton.hidden = !0;
        this.focusButton = n.createElement(`button`);
        this.focusButton.className = `focus-button`;
        this.focusButton.type = `button`;
        this.focusButton.textContent = this.focusLabels.en.enter;
        this.focusButton.setAttribute(`aria-label`, this.focusLabels.en.enter);
        this.focusButton.title = `Ctrl+Shift+F`;
        this.toolbar.append(
          this.sceneButtons.element,
          this.resetButton,
          this.focusButton,
        );
        this.toastEl = n.createElement(`div`);
        this.toastEl.className = `toast`;
        this.toastEl.setAttribute(`role`, `status`);
        this.toastEl.addEventListener(`animationend`, () => {
          this.toastEl.removeAttribute(`data-show`);
        });
        r.append(
          i,
          this.root,
          this.floatLayer,
          this.panel.element,
          this.dock.element,
          this.toolbar,
          this.toastEl,
        );
        // A button that keeps focus after a mouse click would swallow Space (YouTube's play/pause).
        r.addEventListener(
          `click`,
          (e) => {
            e.detail > 0 &&
              e.target instanceof Element &&
              e.target.closest(`button`)?.blur();
          },
          !0,
        );
        for (const layer of [this.root, this.floatLayer]) {
          layer.addEventListener(`click`, this.onLineClick);
          layer.addEventListener(`dblclick`, this.onLineDoubleClick);
        }
        this.focusButton.addEventListener(`click`, this.toggleFocus);
        this.resetButton.addEventListener(`click`, this.onResetLayout);
        n.addEventListener(`fullscreenchange`, this.onFullscreenChange);
        n.addEventListener(`keydown`, this.onFocusShortcut, { capture: !0 });
        e.ensureNativeStyle(n);
        e.ensureFocusStyle(n);
        t.appendChild(this.host);
        t.setAttribute(J, ``);
        this.resizeObserver =
          typeof ResizeObserver > `u`
            ? null
            : new ResizeObserver(() => {
                this.setScale(this.container.clientWidth);
                this.dragger.refitSoon();
                this.scheduleVideoLayout();
              });
        this.resizeObserver?.observe(t);
        this.setScale(t.clientWidth);
      }
      static ensureFocusStyle(e) {
        if (e.getElementById(`polylingo-focus-style`)) return;
        let t = e.createElement(`style`);
        ((t.id = `polylingo-focus-style`),
          (t.textContent = et),
          (e.head ?? e.documentElement).appendChild(t));
      }
      static ensureNativeStyle(e) {
        if (e.getElementById(Xe)) return;
        let t = e.createElement(`style`);
        ((t.id = Xe),
          (t.textContent = $e),
          (e.head ?? e.documentElement).appendChild(t));
      }
      setScale(e) {
        if (!(e > 0)) return;
        const t = Math.round(Math.min(2.2, Math.max(0.6, e / Ze)) * 100) / 100;
        this.root.style.setProperty(`--pl-scale`, String(t));
        this.floatLayer.style.setProperty(`--pl-scale`, String(t));
      }
      applySettings(e) {
        this.settings = e;
        this.uiLang = w(
          e.uiLanguage,
          this.container.ownerDocument.defaultView?.navigator.language ?? `en`,
        );
        nt(this.primaryLine, e.primary);
        nt(this.secondaryLine, e.secondary);
        const { position: n } = e,
          r = this.root.style;
        r.gap = `${n.lineGapPx}px`;
        r.maxWidth = `${n.maxWidthPercent}%`;
        r.top = n.preset === `top` ? `${n.offsetPercent}%` : `auto`;
        r.bottom =
          n.preset === `bottom` ? `max(${n.offsetPercent}%, 56px)` : `auto`;
        this.floatLayer.style.setProperty(`--pl-maxw`, `${n.maxWidthPercent}%`);
        this.panel.applyTheme({
          primaryColor: e.primary.textColor,
          secondaryColor: e.secondary.textColor,
          fontFamily: e.primary.fontFamily,
        });
        this.applyLabels();
        this.applyDirections();
        this.dragger.refitSoon();
      }
      applyLabels() {
        const t = this.focusLabels[this.uiLang];
        const text = this.focus ? t.exit : t.enter;
        this.focusButton.textContent = text;
        this.focusButton.setAttribute(`aria-label`, text);
        this.resetButton.title = t.reset;
        this.resetButton.setAttribute(`aria-label`, t.reset);
        const codes = this.settings?.learning.shortcuts
          ? this.settings.learning.shortcutCodes
          : null;
        this.sceneButtons.update(this.uiLang, codes);
        this.panel.applyLabels(this.uiLang, codes);
        this.dragger.applyLabels(this.uiLang);
        this.dock.applyLabels(this.uiLang, codes, {
          primary: this.primaryLanguage,
          secondary: this.secondaryLanguage,
        });
      }
      setLanguages(e, t) {
        this.primaryLanguage = e;
        this.secondaryLanguage = t;
        this.applyDirections();
        this.panel.setLanguages(e, t);
        this.dock.applyLabels(this.uiLang, this.dock.lastCodes ?? null, {
          primary: e,
          secondary: t,
        });
      }
      applyDirections() {
        if (!this.settings) return;
        this.primaryLine.dir = rt(this.settings.primary, this.primaryLanguage);
        this.secondaryLine.dir = rt(
          this.settings.secondary,
          this.secondaryLanguage,
        );
        this.panel.setDirections(this.primaryLine.dir, this.secondaryLine.dir);
      }
      // ---- scenes / reading panel ------------------------------------------
      setReadingSeek(e) {
        this.seekHandler = e;
      }
      setSceneActionHandler(e) {
        this.actionHandler = e;
      }
      setScenes(e) {
        this.panel.setTimeline(e);
        this.searchIndex = e ? new PL.TranscriptIndex(e.scenes) : null;
        this.runSearch(this.dock.query, { scroll: !1 });
      }
      // ---- [PolyLingo 0.6] focus controls, search, preferences ---------------
      setFocusHandlers(h) {
        this.prefsHandler = h.onPrefs;
        this.saveHandler = h.onSave;
        this.clearCacheHandler = h.onClearCache;
        this.legacyCodesGetter = h.legacyCodes;
        this.focusOpenHandler = h.onOpen;
      }
      applyPrefs(prefs) {
        this.prefs = prefs;
        const host = this.host;
        host.dataset.view = prefs.view;
        host.dataset.recallHides = prefs.recallHides;
        host.dataset.side = prefs.panelSide;
        host.toggleAttribute(`data-lite`, prefs.lite);
        this.panel.setDisplay({
          view: prefs.view,
          recallHides: prefs.recallHides,
          showTimes: prefs.showTimes,
          swap: prefs.swap,
          fontScale: prefs.fontScale,
          side: prefs.panelSide,
          lite: prefs.lite,
        });
        this.dock.setPrefs(prefs);
        this.dragger.setLocked(prefs.lockDrag);
        if (prefs.view !== `recall`)
          for (const line of [this.primaryLine, this.secondaryLine])
            line.removeAttribute(`data-revealed`);
        this.focus && this.scheduleVideoLayout();
      }
      /** Recall mode: is this on-video line currently blurred? */
      isRecallHidden(line) {
        const p = this.prefs;
        if (!p || p.view !== `recall` || line.hasAttribute(`data-revealed`))
          return !1;
        return (
          line ===
          (p.recallHides === `primary` ? this.primaryLine : this.secondaryLine)
        );
      }
      toggleReveal() {
        const panelDid = this.panel.toggleRevealActive();
        const p = this.prefs;
        if (p?.view === `recall`) {
          const line =
            p.recallHides === `primary` ? this.primaryLine : this.secondaryLine;
          line.hasAttribute(`data-visible`) &&
            line.toggleAttribute(`data-revealed`);
        }
        return panelDid;
      }
      isTyping() {
        return this.dock.isTyping();
      }
      focusSearch() {
        this.focus && this.dock.focusSearch();
      }
      runSearch(query, { scroll = !0 } = {}) {
        const folded = PL.foldQuery(query);
        const matches =
          this.searchIndex && folded !== `` ? this.searchIndex.search(query) : [];
        this.matches = matches;
        let pos = -1;
        if (matches.length > 0) {
          const from = Math.max(0, this.panel.activeIndex);
          pos = matches.findIndex((i) => i >= from);
          if (pos < 0) pos = 0;
        }
        this.matchPos = pos;
        this.panel.setSearch(
          matches.length > 0 ? folded : ``,
          matches,
          pos >= 0 ? matches[pos] : -1,
          { scroll },
        );
        this.dock.setSearchState({ total: matches.length, position: pos + 1 });
      }
      stepSearch(direction) {
        const n = this.matches?.length ?? 0;
        if (n === 0) return;
        this.matchPos = (this.matchPos + direction + n) % n;
        this.panel.setSearch(this.panel.query, this.matches, this.matches[this.matchPos]);
        this.dock.setSearchState({ total: n, position: this.matchPos + 1 });
      }
      commitSearch() {
        const index = this.matches?.[this.matchPos];
        index !== void 0 && this.panel.seekIndex(index);
      }
      copyScene() {
        const scene = this.panel.activeScene;
        const m = PL.focusMessages(this.uiLang);
        if (!scene) {
          this.toast(m.noScene);
          return;
        }
        const text = [
          scene.primary?.text,
          scene.secondary.map((cue) => cue.text).join(` `),
        ]
          .filter(Boolean)
          .join(`\n`);
        const clipboard = this.container.ownerDocument.defaultView?.navigator.clipboard;
        clipboard
          ? clipboard.writeText(text).then(
              () => this.toast(m.copied),
              () => this.toast(m.copyFailed),
            )
          : this.toast(m.copyFailed);
      }
      resetPanel() {
        this.applySplit(PL.SPLIT_DEFAULT);
        this.panel.setSplit(PL.SPLIT_DEFAULT);
        this.layout = { ...this.layout, split: PL.SPLIT_DEFAULT };
        this.layoutHandler?.(this.layout);
      }
      /** The dock only listens to the video while Focus reading is open and the tab is visible. */
      bindDockVideo() {
        this.dockAbort?.abort();
        this.dockAbort = null;
        if (!this.focus || this.live === !1) return;
        const video = this.findVideo();
        if (!video) return;
        this.dockAbort = new AbortController();
        const update = () => this.updateDock(video);
        for (const type of [
          `timeupdate`,
          `play`,
          `pause`,
          `ratechange`,
          `durationchange`,
          `seeking`,
          `loadedmetadata`,
          `emptied`,
        ])
          video.addEventListener(type, update, { signal: this.dockAbort.signal });
        update();
      }
      updateDock(video) {
        this.dock.setPlayback({
          paused: video.paused,
          time: video.currentTime,
          duration: video.duration,
          rate: video.playbackRate,
        });
      }
      /** false while the tab is hidden (nobody can see the dock). */
      setLive(live) {
        this.live = live;
        this.bindDockVideo();
      }
      setActiveScene(e, t = -1) {
        this.panel.setActive(e, t);
      }
      // ---- layout (dragged lines, panel width) -----------------------------
      setLayoutHandler(e) {
        this.layoutHandler = e;
      }
      setLayout(e) {
        this.layout = e;
        this.dragger.setPositions(e);
        this.applySplit(e.split);
      }
      applySplit(e) {
        this.splitNow = e;
        this.panel.setSplit(e);
        this.focus && this.container.style.setProperty(`--pl-split`, `${e}%`);
        this.scheduleVideoLayout();
        this.dragger.refitSoon();
      }
      // ---- video placement in focus mode ----------------------------------
      // YouTube sizes <video> with inline px and its container can have height 0, so
      // percentage CSS makes the video vanish. Instead we measure the video's real box
      // and move/scale it (transform) to fit the right-hand region, whatever the CSS.
      findVideo() {
        return (
          this.container.querySelector(`video.html5-main-video`) ??
          this.container.querySelector(`video`)
        );
      }
      scheduleVideoLayout() {
        if (!this.focus || this.videoFrame) return;
        const view = this.container.ownerDocument.defaultView;
        view &&
          (this.videoFrame = view.requestAnimationFrame(() => {
            this.videoFrame = 0;
            this.layoutVideo();
          }));
      }
      clearVideoLayout() {
        for (const name of [`--pl-vx`, `--pl-vy`, `--pl-vk`])
          this.container.style.removeProperty(name);
      }
      layoutVideo() {
        if (!this.focus) return;
        const video = this.findVideo();
        if (!video) return;
        if (video !== this.observedVideo) {
          this.observedVideo &&
            this.resizeObserver?.unobserve(this.observedVideo);
          this.resizeObserver?.observe(video);
          this.observedVideo = video;
        }
        // Measure the untransformed box (our CSS falls back to the identity transform).
        this.clearVideoLayout();
        const player = this.container.getBoundingClientRect(),
          box = video.getBoundingClientRect();
        if (!(
          player.width > 0 &&
          player.height > 0 &&
          box.width > 0 &&
          box.height > 0
        ))
          return;
        const split = this.splitNow / 100,
          width = player.width * (1 - split),
          dockHeight = Math.min(this.dock.height(), player.height * 0.7),
          left =
            this.prefs?.panelSide === `right`
              ? player.left
              : player.left + player.width * split,
          target = {
            cx: left + width / 2,
            cy: player.top + (player.height - dockHeight) / 2,
            w: width,
            h: player.height - dockHeight,
          };
        this.container.style.setProperty(`--pl-dock-h`, `${dockHeight}px`);
        let k = Math.min(target.w / box.width, target.h / box.height),
          dx = target.cx - (box.left + box.width / 2),
          dy = target.cy - (box.top + box.height / 2);
        const style = this.container.style,
          apply = () => {
            style.setProperty(`--pl-vk`, String(k));
            style.setProperty(`--pl-vx`, `${dx}px`);
            style.setProperty(`--pl-vy`, `${dy}px`);
          };
        apply();
        // One corrective pass in case an ancestor transform skewed the first estimate.
        const after = video.getBoundingClientRect();
        if (after.width > 0 && after.height > 0) {
          const ratio = Math.min(
              target.w / after.width,
              target.h / after.height,
            ),
            ex = target.cx - (after.left + after.width / 2),
            ey = target.cy - (after.top + after.height / 2);
          if (
            Math.abs(ratio - 1) > 0.02 ||
            Math.abs(ex) > 3 ||
            Math.abs(ey) > 3
          ) {
            ((k *= ratio), (dx += ex), (dy += ey), apply());
          }
        }
        // Diagnostics for the one thing we cannot test off-site: real YouTube layout.
        const done = video.getBoundingClientRect(),
          rnd = (r) => [r.left, r.top, r.width, r.height].map(Math.round);
        // [PolyLingo 0.6] The lines belong on the (smaller, centred) video, not on the player's bottom edge.
        this.container.style.setProperty(`--pl-vb`, `${Math.max(0, Math.round(player.bottom - done.bottom))}px`);
        if (
          !this.videoWarned &&
          (done.width < 40 ||
            done.height < 40 ||
            done.left < target.cx - target.w / 2 - 6 ||
            done.right > target.cx + target.w / 2 + 6)
        ) {
          this.videoWarned = !0;
          console.warn(
            `[PolyLingo] could not fit the video into the right half`,
            JSON.stringify({
              target: rnd({
                left: target.cx - target.w / 2,
                top: player.top,
                width: target.w,
                height: target.h,
              }),
              video: rnd(done),
              player: rnd(player),
              k,
              dx,
              dy,
            }),
          );
        }
      }
      syncResetButton() {
        this.resetButton.hidden = !this.dragger.hasMoved();
      }
      onResetLayout = () => {
        this.dragger.resetAll();
      };
      // ---- focus mode ------------------------------------------------------
      toggleFocus = () => {
        this.setFocus(!this.focus);
        const doc = this.container.ownerDocument;
        if (
          this.focus &&
          !doc.fullscreenElement &&
          this.container.requestFullscreen
        ) {
          this.focusFullscreen = !0;
          this.container.requestFullscreen().catch(() => {
            this.focusFullscreen = !1;
          });
        }
      };
      onFullscreenChange = () => {
        this.scheduleVideoLayout();
        // Leave focus only when the fullscreen WE asked for ends (Esc / exit button).
        if (
          this.focus &&
          this.focusFullscreen &&
          !this.container.ownerDocument.fullscreenElement
        ) {
          this.focusFullscreen = !1;
          this.setFocus(!1);
        }
      };
      onFocusShortcut = (e) => {
        let t = e.target;
        !e.ctrlKey ||
          !e.shiftKey ||
          e.code !== `KeyF` ||
          t instanceof HTMLInputElement ||
          t instanceof HTMLTextAreaElement ||
          (t instanceof HTMLElement && t.isContentEditable) ||
          (e.preventDefault(), e.stopPropagation(), this.toggleFocus());
      };
      setFocus(e) {
        this.focus = e;
        this.host.toggleAttribute(`data-focus`, e);
        this.container.toggleAttribute(`data-polylingo-focus`, e);
        if (e) {
          this.videoWarned = !1;
          this.splitNow = this.layout.split;
          this.container.style.setProperty(`--pl-split`, `${this.splitNow}%`);
          this.resizeObserver?.observe(this.dock.element);
          this.scheduleVideoLayout();
        } else {
          this.container.style.removeProperty(`--pl-split`);
          this.container.style.removeProperty(`--pl-dock-h`);
          this.container.style.removeProperty(`--pl-vb`);
          this.resizeObserver?.unobserve(this.dock.element);
          this.clearVideoLayout();
          this.observedVideo &&
            this.resizeObserver?.unobserve(this.observedVideo);
          this.observedVideo = null;
        }
        this.panel.setSplit(this.layout.split);
        this.panel.setOpen(e);
        this.dock.setOpen(e);
        this.bindDockVideo();
        e && this.focusOpenHandler?.();
        this.applyLabels();
        // The float layer changes size with the mode; re-fit once layout settled.
        this.dragger.refitSoon();
      }
      // ---- on-video lines --------------------------------------------------
      show(e, t) {
        this.host.isConnected || this.container.appendChild(this.host);
        this.setLine(this.primaryLine, e, this.primaryLanguage);
        this.setLine(this.secondaryLine, t, this.secondaryLanguage);
        this.dragger.refitSoon();
      }
      setLine(e, t, n) {
        t === null
          ? e.removeAttribute(`data-visible`)
          : (e.textContent !== t &&
              (this.fill(e, t, n), e.removeAttribute(`data-revealed`)),
            e.setAttribute(`data-visible`, ``));
      }
      fill(e, t, n) {
        if (!this.lookupHandler) {
          e.textContent = t;
          return;
        }
        let r = e.ownerDocument,
          i = [];
        for (let e of he(t, n))
          if (e.word) {
            let t = r.createElement(`span`);
            ((t.className = `w`),
              t.setAttribute(`data-w`, ``),
              (t.textContent = e.text),
              i.push(t));
          } else i.push(e.text);
        e.replaceChildren(...i);
      }
      refill(e, t) {
        let n = e.textContent;
        n && this.fill(e, n, t);
      }
      setWordLookup(e) {
        let t = (e === null) != (this.lookupHandler === null);
        this.lookupHandler = e;
        this.panel.setWordLookup(e !== null);
        if (t) {
          for (const layer of [this.root, this.floatLayer])
            layer.toggleAttribute(`data-lookup`, e !== null);
          this.refill(this.primaryLine, this.primaryLanguage);
          this.refill(this.secondaryLine, this.secondaryLanguage);
        }
      }
      onLineClick = (e) => {
        let t = this.lookupHandler,
          n = e.target;
        if (!(n instanceof Element)) return;
        let r = n.closest(`.line`);
        if (r && this.isRecallHidden(r)) {
          r.setAttribute(`data-revealed`, ``);
          e.stopPropagation();
          return;
        }
        if (!t || !r) return;
        e.stopPropagation();
        let i = n.closest(`[data-w]`)?.textContent;
        i &&
          t({
            line: r === this.primaryLine ? `primary` : `secondary`,
            word: i,
          });
      };
      onLineDoubleClick = (e) => {
        this.lookupHandler &&
          e.target instanceof Element &&
          e.target.closest(`.line`) &&
          e.stopPropagation();
      };
      wordCard() {
        return ((this.card ??= new Je(this.shadow)), this.card);
      }
      owns(e) {
        return e.composedPath().includes(this.host);
      }
      toast(e) {
        let t = this.toastEl;
        ((t.textContent = e),
          t.removeAttribute(`data-show`),
          t.offsetWidth,
          t.setAttribute(`data-show`, ``));
      }
      toastText() {
        return this.toastEl.hasAttribute(`data-show`)
          ? this.toastEl.textContent
          : null;
      }
      visibleText() {
        let e = (e) => (e.hasAttribute(`data-visible`) ? e.textContent : null);
        return {
          primary: e(this.primaryLine),
          secondary: e(this.secondaryLine),
        };
      }
      destroy() {
        const doc = this.container.ownerDocument;
        doc.removeEventListener(`fullscreenchange`, this.onFullscreenChange);
        doc.removeEventListener(`keydown`, this.onFocusShortcut, {
          capture: !0,
        });
        doc.fullscreenElement === this.container &&
          doc.exitFullscreen?.().catch(() => void 0);
        this.videoFrame &&
          doc.defaultView?.cancelAnimationFrame(this.videoFrame);
        this.clearVideoLayout();
        this.dockAbort?.abort();
        this.dragger.destroy();
        this.dock.destroy();
        this.panel.destroy();
        this.sceneButtons.destroy();
        this.card?.close();
        this.resizeObserver?.disconnect();
        this.host.remove();
        this.container.style.removeProperty(`--pl-split`);
        this.container.style.removeProperty(`--pl-dock-h`);
        this.container.style.removeProperty(`--pl-vb`);
        this.container.removeAttribute(J);
        this.container.removeAttribute(`data-polylingo-focus`);
      }
    },
    at = {
      en: { "loop-on": `Loop on`, "loop-off": `Loop off` },
      ar: {
        "loop-on": `تكرار الجملة: تشغيل`,
        "loop-off": `تكرار الجملة: إيقاف`,
      },
    };
  function ot(e, t, n = 1) {
    let r = at[e][t];
    return t === `loop-on` && n < 1 ? `${r} · ${String(n)}×` : r;
  }
  var ct = 0.8,
    lt = class {
      video;
      getTrack;
      notify;
      getSlowRate;
      loopIndex = -1;
      savedRate = null;
      appliedRate = 0;
      constructor(e, t, n, r = () => 1) {
        ((this.video = e),
          (this.getTrack = t),
          (this.notify = n),
          (this.getSlowRate = r));
      }
      get looping() {
        return this.loopIndex >= 0;
      }
      previous() {
        let e = this.context();
        if (!e) return;
        let { track: t, current: n, index: r } = e;
        // [PolyLingo 0.5] Strict previous scene. Inside a scene -> the one before
        // it; in the gap after a scene -> that scene. "Repeat" is its own action.
        let i = e.local < n.endTime;
        this.seekTo(
          i ? (r === 0 ? n : (t.index.cueAtIndex(r - 1) ?? n)) : n,
          t,
        );
      }
      next() {
        let e = this.getTrack();
        if (!e) return;
        let t = this.video.currentTime - e.offsetSeconds,
          n = e.index.cueAtIndex(e.index.lastStartedIndex(t) + 1);
        n && this.seekTo(n, e);
      }
      replay() {
        let e = this.context();
        e && (this.seekTo(e.current, e.track), this.play());
      }
      toggleLoop() {
        if (this.looping) {
          ((this.loopIndex = -1), this.restoreSpeed(), this.notify(`loop-off`));
          return;
        }
        let e = this.context();
        e &&
          ((this.loopIndex = e.index), this.slowDown(), this.notify(`loop-on`));
      }
      onCueChange(e) {
        if (this.loopIndex < 0 || e === this.loopIndex) return;
        let t = this.getTrack(),
          n = t?.index.cueAtIndex(this.loopIndex);
        if (!t || !n) {
          ((this.loopIndex = -1), this.restoreSpeed());
          return;
        }
        let r = this.video.currentTime - t.offsetSeconds;
        r >= n.endTime - 0.1 && r < n.endTime + ct
          ? (this.video.currentTime =
              n.startTime + t.offsetSeconds + PL.SEEK_EPSILON)
          : ((this.loopIndex = -1),
            this.restoreSpeed(),
            this.notify(`loop-off`));
      }
      reset() {
        ((this.loopIndex = -1), this.restoreSpeed());
      }
      get loopRate() {
        return this.savedRate === null ? 1 : this.appliedRate;
      }
      context() {
        let e = this.getTrack();
        if (!e) return null;
        let t = this.video.currentTime - e.offsetSeconds,
          n = e.index.lastStartedIndex(t),
          r = e.index.cueAtIndex(n);
        return r ? { track: e, local: t, index: n, current: r } : null;
      }
      seekTo(e, t) {
        (this.looping && (this.loopIndex = e.id),
          (this.video.currentTime =
            e.startTime + t.offsetSeconds + PL.SEEK_EPSILON));
      }
      slowDown() {
        let e = this.getSlowRate();
        if (this.savedRate !== null || !(e > 0 && e < 1)) return;
        let t = this.video.playbackRate;
        t <= e ||
          ((this.savedRate = t),
          (this.appliedRate = e),
          (this.video.playbackRate = e));
      }
      restoreSpeed() {
        this.savedRate !== null &&
          (Math.abs(this.video.playbackRate - this.appliedRate) < 0.001 &&
            (this.video.playbackRate = this.savedRate),
          (this.savedRate = null));
      }
      play() {
        Promise.resolve(this.video.play()).catch(() => void 0);
      }
    },
    ut = {
      previous: (e) => e.previous(),
      next: (e) => e.next(),
      replay: (e) => e.replay(),
      loop: (e) => e.toggleLoop(),
    };
  function dt(e) {
    let t = e.composedPath()[0] ?? e.target;
    if (!(t instanceof HTMLElement)) return !1;
    let n = t.tagName;
    return (
      n === `INPUT` || n === `TEXTAREA` || n === `SELECT` || t.isContentEditable
    );
  }
  function ft(
    e,
    t,
    n = { previous: `KeyA`, next: `KeyD`, replay: `KeyS`, loop: `KeyR` },
    typing = () => !1,
  ) {
    let r = new Map();
    for (let e of Object.keys(ut)) {
      let t = n[e];
      r.has(t) || r.set(t, ut[e]);
    }
    document.addEventListener(
      `keydown`,
      (t) => {
        if (
          t.defaultPrevented ||
          t.repeat ||
          t.ctrlKey ||
          t.altKey ||
          t.metaKey ||
          t.shiftKey
        )
          return;
        let n = r.get(t.code);
        n &&
          !dt(t) &&
          !typing() &&
          (t.preventDefault(), t.stopImmediatePropagation(), n(e));
      },
      { capture: !0, signal: t },
    );
  }
  var pt = {
    en: {
      sentence: `Sentence`,
      translation: `Sentence translation`,
      saveWord: `Save word`,
      savedWord: `Saved ✓`,
      saveSentence: `Save sentence`,
      savedSentence: `Sentence saved ✓`,
      copy: `Copy`,
      copied: `Copied`,
      replay: `Replay`,
      close: `Close`,
      removeHint: `Click again to remove`,
      full: `Storage is full. Export or delete saved items in Settings.`,
      error: `Could not save.`,
    },
    ar: {
      sentence: `الجملة`,
      translation: `ترجمة الجملة`,
      saveWord: `حفظ الكلمة`,
      savedWord: `تم الحفظ ✓`,
      saveSentence: `حفظ الجملة`,
      savedSentence: `الجملة محفوظة ✓`,
      copy: `نسخ`,
      copied: `تم النسخ`,
      replay: `إعادة`,
      close: `إغلاق`,
      removeHint: `اضغط مجدداً للإزالة`,
      full: `التخزين ممتلئ. صدّر أو احذف عناصر محفوظة من الإعدادات.`,
      error: `تعذّر الحفظ.`,
    },
  };
  function mt(e) {
    return pt[e];
  }
  var ht = class {
      deps;
      session = null;
      serial = 0;
      constructor(e) {
        this.deps = e;
      }
      get isOpen() {
        return this.session !== null;
      }
      async lookup(e) {
        let { deps: t } = this,
          n = e.context ?? t.context(),
          r = e.line === `primary` ? n?.primary : n?.secondary,
          i = e.line === `primary` ? n?.secondary : n?.primary,
          a = t.card();
        if (!n || !r || !a) return;
        let o = ++this.serial,
          s = n.cueStart ?? n.currentTime,
          c = {
            language: r.language,
            translation: i?.text ?? ``,
            translationLanguage: i?.language ?? ``,
            videoId: n.videoId,
            time: s,
          },
          l = (t.now ?? Date.now)(),
          u = j({ kind: `word`, text: e.word, sentence: r.text, ...c }, l);
        if (!u) return;
        let d = j({ kind: `sentence`, text: r.text, sentence: ``, ...c }, l);
        this.session || this.begin(u, d);
        let f = this.session;
        if (!f) return;
        ((f.word = u), (f.sentence = d));
        let [p, m] = await Promise.all([
          t.store.isSaved(u.id),
          d ? t.store.isSaved(d.id) : Promise.resolve(!1),
        ]);
        o === this.serial &&
          this.session === f &&
          ((f.wordSaved = p),
          (f.sentenceSaved = m),
          a.open(
            {
              word: e.word,
              language: r.language,
              sentence: r.text,
              translation: c.translation,
              translationLanguage: c.translationLanguage,
              wordSaved: p,
              sentenceSaved: m,
              placement: n.placement,
              strings: mt(t.ui()),
            },
            (e) => {
              this.onAction(e);
            },
          ));
      }
      close(e = !0) {
        let t = this.session;
        if (!t) return;
        ((this.session = null),
          this.serial++,
          t.abort.abort(),
          this.deps.card()?.close());
        let { video: n } = this.deps;
        e &&
          t.pausedByUs &&
          n.paused &&
          Promise.resolve(n.play()).catch(() => void 0);
      }
      dispose() {
        this.close(!1);
      }
      begin(e, t) {
        let { video: n } = this.deps,
          r = new AbortController(),
          i = !n.paused;
        (i && n.pause(),
          (this.session = {
            pausedByUs: i,
            abort: r,
            word: e,
            sentence: t,
            wordSaved: !1,
            sentenceSaved: !1,
          }));
        let { signal: a } = r;
        (document.addEventListener(
          `keydown`,
          (e) => {
            e.key === `Escape` && this.close();
          },
          { capture: !0, signal: a },
        ),
          document.addEventListener(
            `pointerdown`,
            (e) => {
              this.deps.inside(e) || this.close();
            },
            { capture: !0, signal: a },
          ),
          n.addEventListener(
            `play`,
            () => {
              this.close(!1);
            },
            { signal: a },
          ));
      }
      async onAction(e) {
        let t = this.session,
          n = this.deps.card();
        if (!t || !n) return;
        let r = mt(this.deps.ui());
        if (e === `close`) this.close();
        else if (e === `replay`) (this.close(!1), this.deps.replay());
        else if (e === `copy`)
          try {
            (await navigator.clipboard.writeText(
              t.sentence?.text ?? t.word.sentence,
            ),
              n.message(r.copied));
          } catch {
            n.message(r.error);
          }
        else {
          let i = e === `save-word` ? t.word : t.sentence;
          if (!i) return;
          let a = e === `save-word` ? t.wordSaved : t.sentenceSaved;
          if (a) await this.deps.store.remove(i.id);
          else {
            let e = await this.deps.store.save(i);
            if (e === `full` || e === `error`) {
              this.session === t && n.message(e === `full` ? r.full : r.error);
              return;
            }
          }
          if (this.session !== t) return;
          let o = !a;
          (e === `save-word` ? (t.wordSaved = o) : (t.sentenceSaved = o),
            n.message(``),
            n.update(t.wordSaved, t.sentenceSaved, r));
        }
      }
    },
    gt = class {
      onNavigate;
      onStart;
      abort = null;
      constructor(e, t) {
        ((this.onNavigate = e), (this.onStart = t));
      }
      start() {
        if (this.abort) return;
        let e = new AbortController();
        this.abort = e;
        let t = { signal: e.signal };
        (document.addEventListener(
          `yt-navigate-start`,
          () => this.onStart(),
          t,
        ),
          document.addEventListener(
            `yt-navigate-finish`,
            () => {
              this.onNavigate(new URL(location.href));
            },
            t,
          ),
          this.onNavigate(new URL(location.href)));
      }
      stop() {
        (this.abort?.abort(), (this.abort = null));
      }
    };
  function _t(e) {
    if (e.pathname !== `/watch`) return null;
    let t = e.searchParams.get(`v`);
    return t && /^[A-Za-z0-9_-]{6,20}$/.test(t) ? t : null;
  }
  function vt(e = document) {
    let t = e.getElementById(`movie_player`);
    if (!t) return null;
    let n =
      t.querySelector(`video.html5-main-video`) ?? t.querySelector(`video`);
    return n ? { container: t, video: n } : null;
  }
  function yt(e, { intervalMs: t = 250, timeoutMs: n = 15e3 } = {}) {
    return new Promise((r) => {
      let i = Date.now() + n,
        a,
        o = (t) => {
          (a !== void 0 && clearTimeout(a),
            e.removeEventListener(`abort`, s),
            r(t));
        },
        s = () => {
          o(null);
        },
        c = () => {
          let e = vt();
          if (e) return o(e);
          if (Date.now() >= i) return o(null);
          a = setTimeout(c, t);
        };
      if (e.aborted) return o(null);
      (e.addEventListener(`abort`, s, { once: !0 }), c());
    });
  }
  var bt = class {
    cues;
    starts;
    hint = 0;
    constructor(e) {
      ((this.cues = je(e) ? e : N(e)),
        (this.starts = Float64Array.from(this.cues, (e) => e.startTime)));
    }
    get size() {
      return this.cues.length;
    }
    cueAtIndex(e) {
      return this.cues[e] ?? null;
    }
    locate(e) {
      let t = this.starts.length;
      if (t === 0) return -1;
      let n = this.starts,
        r = this.hint,
        i = (e) => n[e] ?? 1 / 0;
      if (i(r) <= e && (r + 1 >= t || e < i(r + 1))) return r;
      if (r + 1 < t && i(r + 1) <= e && (r + 2 >= t || e < i(r + 2)))
        return ((this.hint = r + 1), r + 1);
      let a = 0,
        o = t - 1,
        s = -1;
      for (; a <= o;) {
        let t = (a + o) >>> 1;
        i(t) <= e ? ((s = t), (a = t + 1)) : (o = t - 1);
      }
      return (s >= 0 && (this.hint = s), s);
    }
    lastStartedIndex(e) {
      return this.locate(e);
    }
    indexAt(e) {
      let t = this.locate(e),
        n = t >= 0 ? this.cues[t] : void 0;
      return n && e < n.endTime ? t : -1;
    }
    nextBoundary(e) {
      let t = this.locate(e),
        n = t >= 0 ? this.cues[t] : void 0;
      return n && e < n.endTime ? n.endTime : (this.starts[t + 1] ?? 1 / 0);
    }
  };
  function Y(e) {
    return e.find((e) => e.kind === `manual`) ?? e[0];
  }
  function xt(e, t, n) {
    if (e.tracks.length === 0)
      return { kind: `unavailable`, reason: `no-captions` };
    let r = Y(e.tracks.filter((e) => d(e.languageCode, t)));
    if (r) return { kind: `native`, track: r };
    let i = e.tracks.filter((e) => e.isTranslatable),
      a =
        e.translationLanguages.find((e) => d(e, t)) ??
        (e.translationLanguages.length === 0 ? t : null);
    if (i.length === 0 || a === null)
      return { kind: `unavailable`, reason: `language-unavailable` };
    let o = Y(n === null ? [] : i.filter((e) => d(e.languageCode, n))) ?? Y(i);
    return o
      ? { kind: `translation`, source: o, target: a }
      : { kind: `unavailable`, reason: `language-unavailable` };
  }
  var St = 6;
  function X(e, t, n) {
    return `${e.toLowerCase()}|${t}|${(n ?? ``).toLowerCase()}`;
  }
  function Z(e) {
    return { status: `unavailable`, reason: e };
  }
  var Ct = class {
      fetchCaption;
      videoId = null;
      tracklist = null;
      auth = null;
      cache = new Map();
      inflight = new Map();
      epoch = 0;
      constructor(e) {
        this.fetchCaption = e;
      }
      reset(e) {
        (this.epoch++,
          (this.videoId = e),
          (this.tracklist = null),
          (this.auth = null),
          this.cache.clear(),
          this.inflight.clear());
      }
      hasTracklist() {
        return this.tracklist !== null;
      }
      hasAuth() {
        return this.auth !== null;
      }
      setTracklist(e) {
        return e.videoId === this.videoId && ((this.tracklist = e), !0);
      }
      ingestCapture(e) {
        if (e.videoId !== this.videoId) return !1;
        let t = W(e.url);
        if ((t && (this.auth = t), e.body === ``)) return !0;
        try {
          let { cues: t } = L(e.body);
          if (t.length === 0) return !0;
          let n = e.tlang !== null;
          void PL.getTrackCache()?.put(
            e.videoId,
            X(e.lang, e.kind, e.tlang),
            t,
          );
          this.remember(
            X(e.lang, e.kind, e.tlang),
            this.build({
              id: X(e.lang, e.kind, e.tlang),
              language: e.tlang ?? e.lang,
              label: e.tlang ?? e.lang,
              source: n ? `translated` : `youtube`,
              isAutoGenerated: !n && e.kind === `asr`,
              cues: t,
            }),
          );
        } catch {}
        return !0;
      }
      async load(e, t) {
        let n = this.tracklist;
        if (!n) return Z(`no-tracklist`);
        let r = xt(n, e, t);
        if (r.kind === `unavailable`) return Z(r.reason);
        let i =
            r.kind === `native`
              ? X(r.track.languageCode, r.track.kind, null)
              : X(r.source.languageCode, r.source.kind, r.target),
          a = this.cache.get(i);
        if (a) return { status: `ready`, loaded: a };
        let o = this.inflight.get(i);
        if (o) return o;
        let s = this.epoch,
          c = this.fetchAndParse(r, i, s).finally(() => {
            this.epoch === s && this.inflight.delete(i);
          });
        return (this.inflight.set(i, c), c);
      }
      inspect() {
        let e = this.tracklist;
        return {
          videoId: this.videoId,
          tracklist: e && {
            trackCount: e.tracks.length,
            tracks: e.tracks.map((e) => ({
              languageCode: e.languageCode,
              kind: e.kind,
              isTranslatable: e.isTranslatable,
            })),
            translationLanguageCount: e.translationLanguages.length,
          },
          hasAuth: this.auth !== null,
          hasPot: this.auth?.pot !== void 0,
          cachedKeys: [...this.cache.keys()],
        };
      }
      experimentUrl(e, t, n) {
        let r = this.tracklist?.tracks[e];
        return r
          ? Le(r.baseUrl, { auth: n ? this.auth : null, translateTo: t })
          : null;
      }
      async fetchAndParse(e, t, n) {
        let r = e.kind === `native` ? e.track : e.source,
          i = e.kind === `translation` ? e.target : null;
        // [PolyLingo 0.6] Cues of recently watched videos are kept on this device.
        const saved = await PL.getTrackCache()?.get(this.videoId, t);
        if (saved && this.epoch === n) {
          const hit = this.cache.get(t);
          if (hit) return { status: `ready`, loaded: hit };
          const built = this.build({
            id: t,
            language: i ?? r.languageCode,
            label: i
              ? `${r.name || r.languageCode} → ${i}`
              : r.name || r.languageCode,
            source: i ? `translated` : `youtube`,
            isAutoGenerated: i === null && r.kind === `asr`,
            cues: saved,
          });
          this.remember(t, built);
          return { status: `ready`, loaded: built };
        }
        for (let e = 0; e < 2; e++) {
          let a = this.auth,
            o = Le(r.baseUrl, { auth: a, translateTo: i });
          if (!o) return Z(`fetch-failed`);
          let s;
          try {
            s = await this.fetchCaption(o);
          } catch {
            return Z(`fetch-failed`);
          }
          let c = this.epoch === n ? this.cache.get(t) : void 0;
          if (c) return { status: `ready`, loaded: c };
          if (s.status !== 200) return Z(`fetch-failed`);
          if (s.text.trim() === ``) {
            if (e === 0 && a === null && this.auth !== null) continue;
            return Z(a ? `empty-response` : `needs-player-captions`);
          }
          let l;
          try {
            l = L(s.text).cues;
          } catch {
            return Z(`parse-failed`);
          }
          if (l.length === 0) return Z(`empty-response`);
          let u = this.build({
            id: t,
            language: i ?? r.languageCode,
            label: i
              ? `${r.name || r.languageCode} → ${i}`
              : r.name || r.languageCode,
            source: i ? `translated` : `youtube`,
            isAutoGenerated: i === null && r.kind === `asr`,
            cues: l,
          });
          this.epoch === n && void PL.getTrackCache()?.put(this.videoId, t, l);
          return (
            this.epoch === n && this.remember(t, u),
            { status: `ready`, loaded: u }
          );
        }
        return Z(`empty-response`);
      }
      build(e) {
        return { track: { ...e }, index: new bt(e.cues) };
      }
      remember(e, t) {
        for (
          this.cache.delete(e), this.cache.set(e, t);
          this.cache.size > St;
        ) {
          let e = this.cache.keys().next().value;
          if (e === void 0) break;
          this.cache.delete(e);
        }
      }
    },
    wt = 800,
    Tt = 4,
    Et = 3e3;
  function Q(e) {
    return { state: `idle`, language: e, reason: null, loaded: null };
  }
  function Dt(e, t) {
    return t.status === `ready`
      ? { state: `ready`, language: e, reason: null, loaded: t.loaded }
      : { state: `unavailable`, language: e, reason: t.reason, loaded: null };
  }
  function Ot(e) {
    return {
      state: e.state,
      language: e.language,
      ...(e.reason ? { reason: e.reason } : {}),
      ...(e.loaded ? { source: e.loaded.track.source } : {}),
    };
  }
  var $ = async (e) => {
    let t = await fetch(e, { credentials: `same-origin` });
    return { status: t.status, text: await t.text() };
  };
  new (class {
    settings = c();
    loader = new Ct($);
    bridge = new Ke((e) => {
      this.onMainMessage(e);
    });
    navigation = new gt(
      (e) => {
        this.onNavigate(e);
      },
      () => {
        this.teardownPlayback();
      },
    );
    unwatchSettings = null;
    videoId = null;
    onWatchPage = !1;
    generation = 0;
    abort = null;
    player = null;
    overlay = null;
    overlayContainer = null;
    sync = null;
    practice = null;
    lookup = null;
    practiceIndex = null;
    // [PolyLingo 0.5] scene timeline + persisted layout
    timeline = null;
    timelineKey = null;
    activeSceneIndex = -2;
    layout = PL.defaultLayout();
    unwatchLayout = null;
    layoutTimer;
    keys = null;
    syncVideo = null;
    primary = Q(`en`);
    secondary = Q(`de`);
    refreshing = !1;
    refreshQueued = !1;
    retries = 0;
    retryTimer;
    prefs = PL.defaultFocusPrefs();
    prefsTimer;
    autoPause = null;
    savedSerial = 0;
    captureWaiters = new Set();
    driverError = null;
    async start() {
      ((this.settings = await le()),
        (this.layout = await PL.loadLayout()),
        (this.prefs = await PL.loadFocusPrefs()),
        this.applyCachePref(),
        (this.primary = Q(this.settings.primaryLanguage)),
        (this.secondary = Q(this.settings.secondaryLanguage)),
        (this.unwatchSettings = ue((e) => {
          this.onSettings(e);
        })),
        (this.unwatchLayout = PL.watchLayout((e) => {
          this.onLayoutChanged(e);
        })),
        (this.unwatchPrefs = PL.watchFocusPrefs((e) => {
          this.onPrefsChanged(e);
        })),
        document.addEventListener(`visibilitychange`, this.onVisibility),
        this.bridge.start(),
        chrome.runtime.onMessage.addListener(this.onRuntimeMessage),
        this.navigation.start());
    }
    stop() {
      (this.navigation.stop(),
        this.bridge.stop(),
        this.unwatchSettings?.(),
        this.unwatchLayout?.(),
        this.unwatchPrefs?.(),
        document.removeEventListener(`visibilitychange`, this.onVisibility),
        clearTimeout(this.prefsTimer),
        clearTimeout(this.layoutTimer),
        chrome.runtime.onMessage.removeListener(this.onRuntimeMessage),
        this.abort?.abort(),
        clearTimeout(this.retryTimer),
        this.teardownPlayback());
    }
    onNavigate(e) {
      let t = _t(e);
      if (t !== null && t === this.videoId && this.onWatchPage) {
        this.requestTracklist();
        return;
      }
      if (
        (this.generation++,
        this.abort?.abort(),
        clearTimeout(this.retryTimer),
        this.teardownPlayback(),
        (this.videoId = t),
        (this.onWatchPage = t !== null),
        (this.retries = 0),
        (this.player = null),
        this.loader.reset(t),
        (this.primary = Q(this.settings.primaryLanguage)),
        (this.secondary = Q(this.settings.secondaryLanguage)),
        t === null)
      )
        return;
      let n = new AbortController();
      this.abort = n;
      let r = this.generation;
      (this.bridge.send({ type: `replay` }),
        this.requestTracklist(),
        yt(n.signal).then((e) => {
          r === this.generation && ((this.player = e), this.applyPlayback());
        }));
    }
    requestTracklist() {
      this.bridge.send({ type: `request-tracklist` });
    }
    scheduleTracklistRetry() {
      !this.onWatchPage ||
        this.retries >= Tt ||
        (this.retries++,
        clearTimeout(this.retryTimer),
        (this.retryTimer = setTimeout(() => {
          this.requestTracklist();
        }, wt)));
    }
    onMainMessage(e) {
      switch (e.type) {
        case `tracklist`:
          e.data && this.loader.setTracklist(e.data)
            ? ((this.retries = 0), this.refresh())
            : this.scheduleTracklistRetry();
          break;
        case `capture`:
          if (this.loader.ingestCapture(e.data)) {
            for (let t of [...this.captureWaiters]) t(e.data);
            this.refreshing
              ? (this.refreshQueued = !0)
              : this.needsRefresh() && this.refresh();
          }
          break;
        case `driver-result`:
          e.ok || this.driverError?.(e.error);
      }
    }
    needsRefresh() {
      return !this.settings.enabled || !this.onWatchPage
        ? !1
        : [this.primary, this.secondary].some((e) => e.state === `unavailable`);
    }
    async refresh() {
      if (this.settings.enabled && this.onWatchPage) {
        if (this.refreshing) this.refreshQueued = !0;
        else {
          this.refreshing = !0;
          try {
            do {
              this.refreshQueued = !1;
              let e = this.generation,
                { primaryLanguage: t, secondaryLanguage: n } = this.settings,
                r = d(t, n);
              ((this.primary = { ...Q(t), state: `loading` }),
                (this.secondary = r ? Q(n) : { ...Q(n), state: `loading` }));
              let [i, a] = await Promise.all([
                this.loader.load(t, r ? null : n),
                r ? Promise.resolve(null) : this.loader.load(n, t),
              ]);
              e === this.generation &&
                ((this.primary = Dt(t, i)),
                (this.secondary = a ? Dt(n, a) : Q(n)),
                this.applyPlayback());
            } while (this.refreshQueued);
          } finally {
            this.refreshing = !1;
          }
        }
      }
    }
    applyPlayback() {
      let e = this.primary.loaded,
        t = this.secondary.loaded,
        n = this.player;
      if (!this.settings.enabled || !n || (!e && !t)) {
        this.teardownPlayback();
        return;
      }
      (this.overlay && this.overlayContainer === n.container) ||
        (this.overlay?.destroy(),
        (this.overlay = new it(n.container)),
        (this.overlayContainer = n.container),
        this.overlay.setLayout(this.layout),
        (this.timelineKey = null));
      let r = this.overlay;
      (r.applySettings(this.settings),
        r.applyPrefs(this.prefs),
        r.setFocusHandlers(this.focusHandlers()),
        r.setLanguages(this.primary.language, this.secondary.language),
        r.setLayoutHandler((e) => {
          this.saveLayout(e);
        }),
        r.setSceneActionHandler((e) => {
          this.practice && ut[e](this.practice);
        }),
        // [PolyLingo 0.5] scene times are already video time (offset applied).
        r.setReadingSeek((e) => {
          n.video.currentTime = Math.max(0, e);
        }),
        (this.sync && this.syncVideo === n.video) ||
          (this.sync?.stop(),
          (this.syncVideo = n.video),
          this.unbindKeys(),
          this.lookup?.dispose(),
          (this.practice = new lt(
            n.video,
            () => this.practiceTrack(),
            (e) => {
              this.onPractice(e);
            },
            () => this.settings.learning.slowLoopRate,
          )),
          (this.sync = new a(
            n.video,
            ({ primary: e, secondary: t }) => {
              // [PolyLingo 0.5] The active scene comes from the very cues being
              // drawn on the video, so panel and picture always agree.
              r.show(e?.text ?? null, t?.text ?? null);
              this.publishActiveScene(e, t);
            },
            (e) => {
              this.onClock(e);
            },
          )),
          (this.lookup = this.createLookup(n.video)),
          this.autoPause?.destroy(),
          (this.autoPause = new PL.AutoPause({
            video: n.video,
            getTimeline: () => this.timeline,
          }))));
      let o = e ?? t;
      ((o?.index ?? null) !== this.practiceIndex &&
        (this.practice?.reset(), (this.practiceIndex = o?.index ?? null)),
        this.rebuildScenes(),
        this.sync.setOffsets(
          this.settings.timing.primaryOffsetMs,
          this.settings.timing.secondaryOffsetMs,
        ),
        this.sync.setTracks(e?.index ?? null, t?.index ?? null),
        // [PolyLingo 0.6] A hidden tab does no subtitle work; onVisibility restarts it.
        document.hidden || this.sync.start(),
        this.applyAutoPause(),
        this.syncKeys(),
        this.syncLookup());
    }
    /** Rebuild the scene timeline when tracks or timing offsets changed. */
    rebuildScenes() {
      const overlay = this.overlay;
      if (!overlay) return;
      const primary = this.primary.loaded?.index ?? null,
        secondary = this.secondary.loaded?.index ?? null,
        primaryOffset = this.settings.timing.primaryOffsetMs / 1e3,
        secondaryOffset = this.settings.timing.secondaryOffsetMs / 1e3,
        key = { primary, secondary, primaryOffset, secondaryOffset },
        old = this.timelineKey;
      if (
        old &&
        old.primary === key.primary &&
        old.secondary === key.secondary &&
        old.primaryOffset === key.primaryOffset &&
        old.secondaryOffset === key.secondaryOffset
      )
        return;
      this.timelineKey = key;
      this.timeline = PL.buildTimeline({
        primary: primary?.cues ?? [],
        secondary: secondary?.cues ?? [],
        primaryOffset,
        secondaryOffset,
      });
      // Scene ids may change with new tracks/offsets, so a running loop is dropped.
      this.practice?.reset();
      overlay.setScenes(this.timeline);
      this.publishCurrentScene();
    }
    /** Resolve the scene for the cues on screen and tell panel + practice engine. */
    publishActiveScene(e, t) {
      const timeline = this.timeline,
        video = this.syncVideo;
      if (!timeline || !video) return;
      const index = timeline.sceneForCues(e, t);
      this.activeSceneIndex = index;
      this.overlay?.setActiveScene(
        index,
        index < 0 ? timeline.upcomingIndex(video.currentTime) : -1,
      );
      this.practice?.onCueChange(index);
      this.autoPause?.sceneChanged();
      this.refreshSaved();
    }
    /** While no scene is on screen, the "upcoming" marker must follow seeks inside the gap. */
    onClock(e) {
      this.activeSceneIndex === -1 &&
        this.timeline &&
        this.overlay?.setActiveScene(-1, this.timeline.upcomingIndex(e));
    }
    /** Same lookup the sync engine does, used right after a rebuild. */
    publishCurrentScene() {
      const video = this.syncVideo;
      if (!video) return;
      const time = video.currentTime,
        primary = this.primary.loaded,
        secondary = this.secondary.loaded,
        p = primary
          ? primary.index.cueAtIndex(
              primary.index.indexAt(
                time - this.settings.timing.primaryOffsetMs / 1e3,
              ),
            )
          : null,
        s = secondary
          ? secondary.index.cueAtIndex(
              secondary.index.indexAt(
                time - this.settings.timing.secondaryOffsetMs / 1e3,
              ),
            )
          : null;
      this.publishActiveScene(p, s);
    }
    saveLayout(e) {
      this.layout = e;
      clearTimeout(this.layoutTimer);
      this.layoutTimer = setTimeout(() => {
        void PL.saveLayout(this.layout);
      }, 150);
    }
    onLayoutChanged(e) {
      // Ignore the echo of our own write; apply changes made in another tab.
      if (JSON.stringify(e) === JSON.stringify(this.layout)) return;
      this.layout = e;
      this.overlay?.setLayout(e);
    }
    createLookup(e) {
      return new ht({
        video: e,
        card: () => this.overlay?.wordCard() ?? null,
        store: {
          isSaved: (e) => Te(e),
          save: (e) => Ee(e),
          remove: (e) => De(e),
        },
        context: () => this.lookupContext(e),
        ui: () => w(this.settings.uiLanguage, navigator.language),
        replay: () => {
          this.practice?.replay();
        },
        inside: (e) => this.overlay?.owns(e) ?? !1,
      });
    }
    lookupContext(e) {
      let t = this.overlay;
      if (!t || !this.videoId) return null;
      let n = t.visibleText(),
        r = (e, t) =>
          e.loaded && t ? { language: e.language, text: t } : null,
        i = this.practiceTrack(),
        a = null;
      if (i) {
        let t = e.currentTime - i.offsetSeconds,
          n = i.index.cueAtIndex(i.index.lastStartedIndex(t));
        n && (a = n.startTime + i.offsetSeconds);
      }
      return {
        videoId: this.videoId,
        cueStart: a,
        currentTime: e.currentTime,
        primary: r(this.primary, n.primary),
        secondary: r(this.secondary, n.secondary),
        placement:
          this.settings.position.preset === `bottom` ? `top` : `bottom`,
      };
    }
    syncLookup() {
      let e = this.lookup,
        t =
          this.settings.enabled &&
          this.settings.learning.wordLookup &&
          e !== null;
      (this.overlay?.setWordLookup(
        t
          ? (t) => {
              e.lookup(
                t.scene === void 0
                  ? t
                  : { ...t, context: this.sceneContext(t.scene) },
              );
            }
          : null,
      ),
        t || e?.dispose());
    }
    practiceTrack() {
      // [PolyLingo 0.5] previous / next / replay / loop navigate scenes.
      return this.timeline && this.timeline.size > 0
        ? { index: this.timeline, offsetSeconds: 0 }
        : null;
    }
    onPractice(e) {
      let t = w(this.settings.uiLanguage, navigator.language);
      this.overlay?.toast(ot(t, e, this.practice?.loopRate ?? 1));
      (e === `loop-on` || e === `loop-off`) &&
        this.overlay?.dock.setLoop(e === `loop-on`);
    }
    // ---- [PolyLingo 0.6] ----------------------------------------------------
    /** Hidden tab: stop all subtitle work; visible again: one resync. */
    onVisibility = () => {
      const hidden = document.visibilityState === `hidden`;
      hidden ? this.sync?.stop() : this.sync?.start();
      this.overlay?.setLive(!hidden);
      this.applyAutoPause();
    };
    focusHandlers() {
      return {
        onPrefs: (patch) => this.setPrefs(patch),
        onSave: () => void this.saveActiveScene(),
        onClearCache: async () => {
          await PL.getTrackCache()?.clear();
        },
        legacyCodes: () =>
          Object.values(this.settings?.learning.shortcutCodes ?? {}),
        onOpen: () => {
          this.overlay?.dock.setLoop(this.practice?.looping === !0);
          this.refreshSaved();
        },
      };
    }
    setPrefs(patch) {
      const next = PL.sanitizeFocusPrefs({ ...this.prefs, ...patch });
      if (JSON.stringify(next) === JSON.stringify(this.prefs)) return;
      const autoPauseChanged = next.autoPause !== this.prefs.autoPause;
      this.applyPrefsNow(next);
      if (autoPauseChanged) {
        const m = PL.focusMessages(w(this.settings.uiLanguage, navigator.language));
        this.overlay?.toast(next.autoPause ? m.autoPauseOn : m.autoPauseOff);
      }
      clearTimeout(this.prefsTimer);
      this.prefsTimer = setTimeout(() => void PL.saveFocusPrefs(this.prefs), 150);
    }
    onPrefsChanged(prefs) {
      JSON.stringify(prefs) !== JSON.stringify(this.prefs) &&
        this.applyPrefsNow(prefs);
    }
    applyPrefsNow(prefs) {
      this.prefs = prefs;
      this.applyCachePref();
      this.overlay?.applyPrefs(prefs);
      this.applyAutoPause();
    }
    applyCachePref() {
      const cache = PL.getTrackCache();
      cache && (cache.enabled = this.prefs.cacheTracks);
    }
    applyAutoPause() {
      this.autoPause?.setEnabled(this.prefs.autoPause && !document.hidden);
    }
    bindFocusKeys() {
      PL.bindFocusKeys({
        signal: this.keys.signal,
        enabled: () => this.settings.enabled && this.settings.learning.shortcuts,
        isFocusOpen: () => this.overlay?.focus === !0,
        isTyping: () => this.overlay?.isTyping() ?? !1,
        getKeys: () => this.prefs.keys,
        legacyCodes: () => Object.values(this.settings.learning.shortcutCodes),
        handlers: {
          search: () => this.overlay?.focusSearch(),
          cycleView: () => this.setPrefs({ view: PL.cycleView(this.prefs.view) }),
          reveal: () => this.overlay?.toggleReveal(),
          autoPause: () => this.setPrefs({ autoPause: !this.prefs.autoPause }),
          save: () => void this.saveActiveScene(),
          fontBigger: () =>
            this.setPrefs({ fontScale: PL.stepFont(this.prefs.fontScale, 1) }),
          fontSmaller: () =>
            this.setPrefs({ fontScale: PL.stepFont(this.prefs.fontScale, -1) }),
        },
      });
    }
    /** Browser-level shortcuts (chrome.commands), forwarded by the service worker. */
    onCommand(command) {
      const scene = {
        "previous-scene": `previous`,
        "next-scene": `next`,
        "repeat-scene": `replay`,
      };
      command === `toggle-focus-reading`
        ? this.overlay?.toggleFocus()
        : scene[command] && this.practice && ut[scene[command]](this.practice);
    }
    /** What the word card needs to know about a scene picked in the reading panel. */
    sceneContext(index) {
      const scene = this.timeline?.scenes[index];
      if (!scene || !this.videoId) return null;
      const secondaryText = scene.secondary.map((cue) => cue.text).join(` `);
      return {
        videoId: this.videoId,
        cueStart: scene.startTime,
        currentTime: scene.startTime,
        primary:
          this.primary.loaded && scene.primary
            ? { language: this.primary.language, text: scene.primary.text }
            : null,
        secondary:
          this.secondary.loaded && secondaryText !== ``
            ? { language: this.secondary.language, text: secondaryText }
            : null,
        placement: `top`,
      };
    }
    /** Vocabulary entry for the sentence on screen (first language, translation attached). */
    activeSceneEntry() {
      const scene =
        this.timeline && this.activeSceneIndex >= 0
          ? this.timeline.scenes[this.activeSceneIndex]
          : null;
      if (!scene || !this.videoId) return null;
      const first = scene.primary?.text ?? ``,
        second = scene.secondary.map((cue) => cue.text).join(` `),
        useFirst = first !== ``;
      return j(
        {
          kind: `sentence`,
          text: useFirst ? first : second,
          sentence: ``,
          language: useFirst ? this.primary.language : this.secondary.language,
          translation: useFirst ? second : ``,
          translationLanguage:
            useFirst && second !== `` ? this.secondary.language : ``,
          videoId: this.videoId,
          time: scene.startTime,
        },
        Date.now(),
      );
    }
    async saveActiveScene() {
      const m = PL.focusMessages(w(this.settings.uiLanguage, navigator.language)),
        entry = this.activeSceneEntry(),
        overlay = this.overlay;
      if (!entry || !overlay) {
        overlay?.toast(m.noScene);
        return;
      }
      if (await Te(entry.id)) {
        await De(entry.id);
        overlay.dock.setSaved(!1);
        overlay.toast(m.removed);
        return;
      }
      const result = await Ee(entry);
      if (result === `full` || result === `error`) {
        overlay.toast(result === `full` ? m.full : m.saveFailed);
        return;
      }
      overlay.dock.setSaved(!0);
      overlay.toast(m.saved);
    }
    refreshSaved() {
      const overlay = this.overlay;
      if (!overlay?.focus) return;
      const entry = this.activeSceneEntry(),
        serial = ++this.savedSerial;
      if (!entry) {
        overlay.dock.setSaved(!1);
        return;
      }
      void Te(entry.id).then((saved) => {
        serial === this.savedSerial && this.overlay?.dock.setSaved(saved);
      });
    }
    syncKeys() {
      this.settings.enabled &&
      this.settings.learning.shortcuts &&
      this.sync !== null &&
      this.practice !== null
        ? !this.keys &&
          this.practice &&
          ((this.keys = new AbortController()),
          ft(
            this.practice,
            this.keys.signal,
            this.settings.learning.shortcutCodes,
            () => this.overlay?.isTyping() ?? !1,
          ),
          this.bindFocusKeys())
        : (this.unbindKeys(), this.practice?.reset());
    }
    unbindKeys() {
      (this.keys?.abort(), (this.keys = null));
    }
    teardownPlayback() {
      (this.autoPause?.destroy(),
        (this.autoPause = null),
        this.unbindKeys(),
        this.lookup?.dispose(),
        (this.lookup = null),
        this.practice?.reset(),
        (this.practice = null),
        (this.practiceIndex = null),
        (this.timeline = null),
        (this.timelineKey = null),
        (this.activeSceneIndex = -2),
        this.sync?.stop(),
        (this.sync = null),
        (this.syncVideo = null),
        this.overlay?.destroy(),
        (this.overlay = null),
        (this.overlayContainer = null));
    }
    onSettings(e) {
      let t = this.settings;
      if (((this.settings = e), !e.enabled)) {
        this.teardownPlayback();
        return;
      }
      let n =
        t.primaryLanguage !== e.primaryLanguage ||
        t.secondaryLanguage !== e.secondaryLanguage;
      !t.enabled || n
        ? this.refresh()
        : (this.overlay?.applySettings(e),
          this.sync?.setOffsets(
            e.timing.primaryOffsetMs,
            e.timing.secondaryOffsetMs,
          ),
          this.rebuildScenes(),
          this.syncKeys(),
          this.syncLookup());
    }
    onRuntimeMessage = (e, t, n) => {
      if (t.id !== chrome.runtime.id) return !1;
      let r = re(e);
      return r
        ? r.type === `polylingo/get-status`
          ? (n(this.statusReport()), !1)
          : r.type === `polylingo/command`
            ? (this.onCommand(r.command), n({ ok: !0 }), !1)
            : r.type === `polylingo/retry-tracks`
            ? (this.retryTracks(), n({ ok: !0 }), !1)
            : (this.diagnose(r.withDriver).then(n, (e) => {
                n({ error: String(e) });
              }),
              !0)
        : !1;
    };
    statusReport() {
      return {
        onWatchPage: this.onWatchPage,
        videoId: this.videoId,
        enabled: this.settings.enabled,
        primary: Ot(this.primary),
        secondary: Ot(this.secondary),
        hasPlayerAuth: this.loader.hasAuth(),
      };
    }
    retryTracks() {
      this.onWatchPage &&
        this.videoId &&
        ((this.retries = 0),
        clearTimeout(this.retryTimer),
        void PL.getTrackCache()?.forget(this.videoId),
        this.loader.reset(this.videoId),
        (this.primary = {
          ...Q(this.settings.primaryLanguage),
          state: `loading`,
        }),
        (this.secondary = {
          ...Q(this.settings.secondaryLanguage),
          state: `loading`,
        }),
        this.requestTracklist());
    }
    diagnose(e) {
      return Pe({
        loader: this.loader,
        fetchCaption: $,
        settings: this.settings,
        extensionVersion: chrome.runtime.getManifest().version,
        userAgent: navigator.userAgent,
        withDriver: e,
        runDriver: (e, t) => this.runDriver(e, t),
      });
    }
    runDriver(e, t) {
      return new Promise((n) => {
        let r = !1,
          i = null,
          a = ``,
          o = () => {
            r ||
              ((r = !0),
              clearTimeout(c),
              this.captureWaiters.delete(s),
              (this.driverError = null),
              this.bridge.send({ type: `driver-restore` }),
              n({
                captured: i !== null,
                hadPot: i !== null && W(i.url) !== null,
                error: a,
              }));
          },
          s = (e) => {
            ((i = e), o());
          },
          c = setTimeout(o, Et);
        (this.captureWaiters.add(s),
          (this.driverError = (e) => {
            ((a = e), o());
          }),
          this.bridge.send({
            type: `driver-set-track`,
            languageCode: e,
            translationLanguage: t,
          }));
      });
    }
  })()
    .start()
    .catch((e) => {
      console.error(`[PolyLingo] failed to start`, e);
    });
})();
