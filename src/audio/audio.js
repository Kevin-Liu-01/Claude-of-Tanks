/**
 * src/audio/audio.js — the Claude of Tanks sound system (SOUND overhaul).
 *
 * Almost everything is generated at runtime: oscillators, seeded noise
 * buffers, filter sweeps, pre-rendered PCM gun beds. The ONE sampled category
 * is the crew radio (src/audio/voices.js): original macOS-TTS lines processed
 * offline into tiny Opus files (tools/make-voices.mjs, logged in
 * docs/ATTRIBUTION.md). The AudioContext is created lazily inside `resume()`
 * (user gesture); before that every method is a silent no-op so the headless
 * screenshot harness never touches audio hardware.
 *
 * Contract: ARCHITECTURE.md §3.9.
 *   - distance gain  = clamp(10/dist, 0, 1)^2
 *   - equal-power stereo pan from listener-relative azimuth (StereoPannerNode)
 *   - max ~24 simultaneous one-shot voices, steal oldest
 *   - bus graph: {combat, engine, ambience, ui, voice} → compressor → master
 *     (per-channel gains driven by the settings sliders via 'ui:volumes')
 *
 * What lives where:
 *   - combat one-shots (gunfire by caliber class, penetration clang, ricochet
 *     zing variants, HE / destruction, track snap, dirt splash)  → sfxBus
 *   - engine loops (UNTOUCHED diesel/turbine character), turret-traverse whir,
 *     suspension landing thumps                                   → engineBus
 *   - wind/birds battle bed, garage workshop room tone            → ambientBus
 *   - UI ticks, battle horn, kill sting, result fanfares, sting   → musicBus
 *   - crew radio lines + tank alarms (fire klaxon, ammo-rack beep,
 *     critical-HP heartbeat)                                      → voiceBus
 */

import { createVoiceRadio } from './voices.js';

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const MAX_VOICES = 24;
const SPEED_OF_SOUND_MPS = 340;
const ENGINE_HEAR_IN_M = 120;   // start an engine loop when a tank comes this close
const ENGINE_HEAR_OUT_M = 140;  // stop it when it drifts beyond this (hysteresis)
const MAX_ENGINE_VOICES = 8;
const MIN_WHIZZ_SPEED_MPS = 300;
const WHIZZ_MAX_MISS_M = 15;
const LANDING_VY_MPS = 2.8;     // downward speed that reads as a hard landing
const TRAVERSE_RATE_FULL = 0.45; // rad/s of turret yaw ≈ full traverse-whir gain
const HEARTBEAT_HP_FRAC = 0.25; // critical-HP alarm threshold
const HEARTBEAT_WINDOW_S = 6;   // pulse window per threshold crossing (not a drone)

/** Rough muzzle velocities by shell type, for scheduling flyby whizzes (m/s). */
const WHIZZ_VEL_MPS = { AP: 800, APCR: 1080, HEAT: 1000, HE: 790, APFSDS: 1700 };

/**
 * Create the game audio system. Pure factory — no AudioContext, no DOM access
 * until `resume()` is called from a user gesture.
 *
 * @returns {{
 *   resume: () => void,
 *   bindBus: (bus: {on: Function}) => void,
 *   update: (dt: number,
 *            listener: {pos: {x:number,y:number,z:number}, forward: {x:number,y:number,z:number}},
 *            tanks: Array<object>) => void,
 *   setMasterVolume: (v: number) => void,
 *   mute: (m: boolean) => void,
 *   playGarageSting: () => void,
 *   ambientOn: (on: boolean) => void,
 *   hitConfirm: (kind: string, damage?: number) => void,
 * }} Audio interface per ARCHITECTURE.md §3.9.
 */
export function createAudio() {
  /** @type {AudioContext|null} */
  let ctx = null;
  let master = null;      // final volume gain
  let comp = null;        // safety compressor (24 voices never clip)
  let sfxBus = null, engineBus = null, ambientBus = null, musicBus = null, voiceBus = null;
  let whiteBuf = null;    // 2 s seeded white noise, looped everywhere
  let crackleBuf = null;  // sparse impulse train for fire crackle / debris
  let windBuf = null;     // pink-ish noise for wind bed
  let gunBufs = null;     // pre-synthesized caliber beds (one source per shot)

  let masterVolume = 0.8;
  let muted = false;

  // SOUND SETTINGS: channel mix persisted by the settings panel
  // (cot.settings.v1) and live-updated via 'ui:volumes'.
  const chanVol = { engine: 1, combat: 1, ambience: 1, ui: 1, voice: 1 };
  let alarmHeartbeatOn = true; // critical-HP heartbeat option (settings toggle)
  const clamp01 = (v, d) => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : d);
  try {
    const s = JSON.parse(localStorage.getItem('cot.settings.v1') || 'null');
    if (s && typeof s === 'object') {
      masterVolume = clamp01(s.volMaster, masterVolume);
      chanVol.engine = clamp01(s.volEngine, 1);
      chanVol.combat = clamp01(s.volCombat, 1);
      chanVol.ambience = clamp01(s.volAmbience, 1);
      chanVol.ui = clamp01(s.volUi, 1);
      chanVol.voice = clamp01(s.volVoice, 1);
      if (typeof s.alarmHeartbeat === 'boolean') alarmHeartbeatOn = s.alarmHeartbeat;
    }
  } catch (_) { /* private mode */ }

  // KILL-CAM DUCK: replay slow-mo pulls the battle mix down (combat/engine/
  // ambience only — the radio and result stings stay up front).
  let duckK = 1;
  // PAUSE DUCK ('ui:pause' from main.js tick): while the Esc overlay freezes
  // a live battle, the engine + combat buses drop to near-silence — the
  // frozen sim still has engine loops holding their last RPM and gun tails
  // ringing out. Near-zero (not zero) so resume never clicks. UI/music stays
  // up (menu clicks, slider reference blips) and so do crew voices.
  let pauseK = 1;
  function applyChannelVolumes(smooth) {
    if (!ctx) return;
    const t = ctx.currentTime;
    // Robustness (found by tools/audio-probe.mjs): a bare setTargetAtTime on a
    // bus with NO active inputs is unreliable in Chrome — the renderer puts
    // input-less nodes to sleep, and on wake the exponential can resume from
    // the STALE gain, leaking ~200 ms of the old volume into the first sound
    // played after a slider change. Smoothing is therefore always PINNED with
    // an exact setValueAtTime shortly after (6.7τ — inaudible step), so a
    // woken bus lands on the correct target no matter when it slept.
    const set = (bus, v) => {
      const g = bus.gain;
      g.cancelScheduledValues(t);
      if (smooth) {
        g.setTargetAtTime(v, t, 0.03);
        g.setValueAtTime(v, t + 0.2);
      } else {
        g.value = v;
      }
    };
    set(sfxBus, 1.0 * chanVol.combat * duckK * pauseK);
    set(engineBus, 0.75 * chanVol.engine * duckK * pauseK);
    set(ambientBus, 0.55 * chanVol.ambience * duckK);
    set(musicBus, 0.9 * chanVol.ui);
    set(voiceBus, 1.0 * chanVol.voice);
  }

  const rng = mulberry32(9001);
  const radio = createVoiceRadio(mulberry32(0xC0FFEE));

  // Listener pose (world space), refreshed each update().
  let lx = 0, ly = 0, lz = 0;   // position
  let lfx = 0, lfz = 1;         // forward (XZ, normalized-ish)
  let listenerValid = false;

  // Game context tracked listener-side (NO new emitter-side hooks needed):
  // player identity comes from update(tanks); phase from 'phase:change'.
  let playerId = null;
  let phase = 'garage';
  /** id -> {team, isPlayer} minimal roster mirror for spotted-voice checks */
  const tankInfo = new Map();
  /** `${id}:${module}` -> last known module state, for damage/repair edges */
  const moduleState = new Map();

  /** Active one-shot voices: { start, end, in: GainNode, pan, sources[], dead } */
  const voices = [];
  /** tankId -> engine loop voice */
  const engines = new Map();
  /** tankId -> burning-fire loop */
  const fireLoops = new Map();
  /** tankId -> {prevY, vy, lastThumpT} suspension landing tracker */
  const landing = new Map();
  /** Ambient wind nodes (null when off). */
  let windRig = null;
  let birdTimerId = null;
  /** Garage workshop room tone (null when off). */
  let garageRig = null;
  /** Player turret-traverse / gun-elevation whir rig (null until battle). */
  let traverseRig = null;
  /** Alarm rigs (player only). */
  let fireAlarmRig = null;
  let heartbeatRig = null;
  let heartbeatArmedBelow = 0;   // last hp fraction that triggered a pulse window
  let playerBurning = false;
  let battleOver = false;
  let _uiVolEvents = 0;   // debug: ui:volumes deliveries (tools/audio-probe.mjs)

  // ---------------------------------------------------------------- graph ---

  function buildGraph() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterVolume;
    comp.connect(master);
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();     sfxBus.gain.value = 1.0;   sfxBus.connect(comp);
    engineBus = ctx.createGain();  engineBus.gain.value = 0.75; engineBus.connect(comp);
    ambientBus = ctx.createGain(); ambientBus.gain.value = 0.55; ambientBus.connect(comp);
    musicBus = ctx.createGain();   musicBus.gain.value = 0.9;  musicBus.connect(comp);
    voiceBus = ctx.createGain();   voiceBus.gain.value = 1.0;  voiceBus.connect(comp);
    applyChannelVolumes(false);
  }

  function buildBuffers() {
    const sr = ctx.sampleRate;

    // White noise (2 s), seeded.
    whiteBuf = ctx.createBuffer(1, (sr * 2) | 0, sr);
    {
      const d = whiteBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
    }

    // Pink-ish noise for wind (Paul Kellet economy filter over seeded white).
    windBuf = ctx.createBuffer(1, (sr * 4) | 0, sr);
    {
      const d = windBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      }
    }

    // Crackle: sparse decaying impulses (fire crackle, debris patter).
    crackleBuf = ctx.createBuffer(1, (sr * 2) | 0, sr);
    {
      const d = crackleBuf.getChannelData(0);
      for (let e = 0; e < 160; e++) {
        const at = (rng() * d.length) | 0;
        const amp = 0.25 + rng() * 0.75;
        const len = 12 + ((rng() * 80) | 0);
        const sign = rng() < 0.5 ? -1 : 1;
        for (let i = 0; i < len && at + i < d.length; i++) {
          d[at + i] += sign * amp * Math.exp(-i / (len * 0.3)) * (rng() * 2 - 1);
        }
      }
    }

    // Render the layered gun timbres into PCM beds once (SOUND overhaul: four
    // caliber classes, each with a sharper crack, a resonant mid "bark" and a
    // longer sub/rumble tail than the old three-class beds — the live shot
    // still schedules just one source + one distance filter, plus a cheap
    // 2-node crack overlay for nearby shots).
    //   light ≤76 mm | medium ≤105 mm | heavy ≤130 mm | huge >130 mm (152/380)
    const makeGunBed = (kind) => {
      const P = {
        light:  { dur: 0.55, crackT: 0.030, bodyT: 0.10, rumT: 0.20, f0: 62, f1: 46, subT: 0.16, bark: 195, barkT: 0.045, out: 0.78 },
        medium: { dur: 1.00, crackT: 0.040, bodyT: 0.17, rumT: 0.42, f0: 54, f1: 34, subT: 0.32, bark: 150, barkT: 0.060, out: 0.86 },
        heavy:  { dur: 1.70, crackT: 0.055, bodyT: 0.25, rumT: 0.80, f0: 46, f1: 27, subT: 0.50, bark: 120, barkT: 0.080, out: 0.92 },
        huge:   { dur: 2.60, crackT: 0.070, bodyT: 0.34, rumT: 1.25, f0: 40, f1: 22, subT: 0.75, bark: 96,  barkT: 0.110, out: 0.97 },
      }[kind];
      const out = ctx.createBuffer(1, Math.ceil(sr * P.dur), sr);
      const d = out.getChannelData(0);
      const grng = mulberry32(0x6a09e667 ^ (P.bark | 0));
      let low = 0, prevNoise = 0, phaseAcc = 0;
      const barkW1 = Math.PI * 2 * P.bark / sr;
      const barkW2 = Math.PI * 2 * P.bark * 1.53 / sr;
      let bp1 = 0, bp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = grng() * 2 - 1;
        low += (n - low) * (kind === 'huge' ? 0.02 : kind === 'heavy' ? 0.025 : kind === 'medium' ? 0.05 : 0.09);
        const high = n - prevNoise;
        prevNoise = n;
        const sweepT = Math.min(1, t / (P.subT * 0.9));
        phaseAcc += Math.PI * 2 * (P.f0 + (P.f1 - P.f0) * sweepT) / sr;
        bp1 += barkW1; bp2 += barkW2;
        const crack = high * Math.exp(-t / P.crackT);
        const body = n * Math.exp(-t / P.bodyT);
        const rumble = low * Math.exp(-t / P.rumT);
        const sub = Math.sin(phaseAcc) * Math.exp(-t / P.subT);
        // Resonant muzzle "bark": slightly inharmonic damped partial pair —
        // this is the mid-range punch the flat noise beds were missing.
        const bark = (Math.sin(bp1) + 0.45 * Math.sin(bp2)) * Math.exp(-t / P.barkT);
        const attack = Math.min(1, t / 0.003);
        const v = attack * (crack * 0.34 + body * 0.40 + rumble * 0.68 + sub * 0.60 + bark * 0.30);
        d[i] = v;
      }
      // Normalize the bed to a consistent peak so caliber classes mix predictably.
      let peak = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
      const k = peak > 0 ? P.out / peak : 1;
      for (let i = 0; i < d.length; i++) d[i] *= k;
      return out;
    };
    gunBufs = {
      light: makeGunBed('light'),
      medium: makeGunBed('medium'),
      heavy: makeGunBed('heavy'),
      huge: makeGunBed('huge'),
    };
  }

  function applyMaster() {
    if (!ctx) return;
    // Same sleeping-node pin as applyChannelVolumes (probe-found Chrome quirk).
    const t = ctx.currentTime;
    const v = muted ? 0 : masterVolume;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(v, t, 0.02);
    master.gain.setValueAtTime(v, t + 0.15);
  }

  // ---------------------------------------------------------- spatializer ---

  // Scratch result — never allocated per call.
  const _sp = { dist: 1, gain: 1, pan: 0 };

  /** Distance gain + equal-power pan for a world position. Mutates _sp. */
  function spat(x, y, z) {
    const dx = x - lx, dy = y - ly, dz = z - lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    _sp.dist = d < 0.5 ? 0.5 : d;
    const g = Math.min(10 / _sp.dist, 1);
    _sp.gain = g * g;
    if (d > 0.001) {
      // rightAxis of listener forward (fx,0,fz) is (fz, 0, -fx) — §1.1 convention.
      const lateral = (dx * lfz - dz * lfx) / d;
      _sp.pan = Math.max(-1, Math.min(1, lateral)) * 0.85;
    } else {
      _sp.pan = 0;
    }
    return _sp;
  }

  // ------------------------------------------------------------ one-shots ---

  function disposeVoice(v) {
    if (v.dead) return;
    v.dead = true;
    for (const s of v.sources) { try { s.stop(); } catch (_) { /* already stopped */ } }
    try { v.in.disconnect(); } catch (_) { /* detached */ }
    try { v.pan.disconnect(); } catch (_) { /* detached */ }
  }

  /** Steal-oldest capped voice allocator. All one-shots flow through here. */
  function spawnVoice(when, durS, gainVal, panVal, dest) {
    // Prune finished voices first, then steal the oldest if still over budget.
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end <= now || voices[i].dead) { disposeVoice(voices[i]); voices.splice(i, 1); }
    }
    if (voices.length >= MAX_VOICES) {
      disposeVoice(voices[0]);
      voices.shift();
    }
    const g = ctx.createGain();
    g.gain.value = gainVal;
    const p = ctx.createStereoPanner();
    p.pan.value = panVal;
    g.connect(p);
    p.connect(dest || sfxBus);
    const v = { start: when, end: when + durS, in: g, pan: p, sources: [], dead: false };
    voices.push(v);
    return v;
  }

  /** Looping seeded-noise source, registered on the voice for stealing. */
  function nsrc(v, when, durS, rate, buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf || whiteBuf;
    s.loop = true;
    s.playbackRate.value = rate || 1;
    s.start(when, rng() * 1.7);
    s.stop(when + durS + 0.1);
    v.sources.push(s);
    return s;
  }

  /** Oscillator source registered on the voice. */
  function osrc(v, type, freq, when, durS) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, freq), when);
    o.start(when);
    o.stop(when + durS + 0.1);
    v.sources.push(o);
    return o;
  }

  function flt(type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q == null ? 1 : q;
    return f;
  }

  /** Attack/exponential-decay envelope gain node. */
  function env(when, attack, peak, decay) {
    const g = ctx.createGain();
    const a = Math.max(0.001, attack);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + a + decay);
    return g;
  }

  /** Connect src → …nodes → v.in. */
  function wire(v, src, ...rest) {
    let n = src;
    for (const x of rest) { n.connect(x); n = x; }
    n.connect(v.in);
  }

  /** Air-absorption lowpass by distance (bright at 0 m, muffled far away). */
  function distLowpass(dist) {
    const cutoff = Math.max(450, Math.min(18000, 18000 * (40 / (40 + dist))));
    return flt('lowpass', cutoff, 0.5);
  }

  /** Propagation delay for far events (capped so nothing feels broken). */
  function travelDelay(dist) {
    return dist > 40 ? Math.min(1.6, dist / SPEED_OF_SOUND_MPS) : 0;
  }

  // ------------------------------------------------------------- gunfire ---

  /**
   * Layered gunshot by caliber class (SOUND overhaul):
   *   ≤76 mm sharp crack | ≤105 mm boom | ≤130 mm heavy boom | >130 mm siege
   * Pre-rendered bed (crack/body/bark/sub/rumble) + per-shot pitch jitter so
   * repeats never machine-gun, + a live crack overlay for nearby shots.
   * The PLAYER's own gun gets a mechanical action tail: breech clank at the
   * end of recoil and a brass-casing tinkle.
   */
  function gunshot(x, y, z, caliberMm, isPlayer) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const cls = caliberMm > 130 ? 'huge' : caliberMm > 105 ? 'heavy' : caliberMm > 76 ? 'medium' : 'light';
    const dur = { light: 0.55, medium: 1.0, heavy: 1.7, huge: 2.6 }[cls];
    const v = spawnVoice(when, dur + (isPlayer ? 1.0 : 0), s.gain * (isPlayer ? 1.08 : 1), s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    const src = ctx.createBufferSource();
    src.buffer = gunBufs[cls];
    src.playbackRate.value = 0.94 + rng() * 0.12;   // ±6% per-shot variation
    src.start(when);
    src.stop(when + dur / src.playbackRate.value + 0.05);
    v.sources.push(src);
    wire(v, src, lp);
    // Live crack overlay: only audible up close where the bed's baked crack
    // has been dulled by the shared lowpass — restores the whip-snap.
    if (s.dist < 120) {
      wire(v, nsrc(v, when, 0.03), flt('highpass', 2400 + rng() * 900, 0.8),
        env(when, 0.001, cls === 'light' ? 0.55 : 0.42, 0.018), lp);
    }
    if (isPlayer) {
      // Muzzle-blast wind over the hull.
      wire(v, nsrc(v, when, 0.3), flt('lowpass', 850, 0.6), env(when, 0.01, 0.30, 0.26), lp);
      // Breech clank at the end of recoil (~0.22 s): metal-on-metal latch.
      const tCl = when + 0.20 + rng() * 0.05;
      wire(v, osrc(v, 'triangle', 290 * (0.95 + rng() * 0.1), tCl, 0.16),
        env(tCl, 0.002, 0.28, 0.12), lp);
      wire(v, nsrc(v, tCl, 0.05), flt('bandpass', 1150, 1.6), env(tCl, 0.001, 0.30, 0.04), lp);
      // Brass casing tinkle on the turret floor (autoloaders forgive us).
      if (caliberMm <= 105) {
        const tBr = when + 0.65 + rng() * 0.2;
        for (let i = 0; i < 3; i++) {
          const at = tBr + i * (0.05 + rng() * 0.05);
          wire(v, osrc(v, 'triangle', 3400 + rng() * 1600, at, 0.09),
            env(at, 0.001, 0.055 - i * 0.012, 0.07));
        }
      }
    }
  }

  // -------------------------------------------------------------- impacts ---

  /**
   * Hull-on-obstacle thud (gameplay_feel r2): dull lowpassed noise burst +
   * one low inharmonic partial — 60 tons meeting masonry, NOT the
   * penetration clang (no ring partials). Gain scales with closing speed.
   * SOUND overhaul: fast rams (>6 m/s — the marketing shots feature ramming)
   * add a metal grind/scrape tail so a full-speed ram reads as a crunch.
   */
  function onTankImpact(e) {
    const s = spat(e.pos[0], e.pos[1], e.pos[2]);
    const k = Math.min(1, e.speedMps / 12);
    if (s.gain * k < 0.002) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.8, s.gain * (0.4 + 0.6 * k), s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.12), flt('lowpass', 420, 0.7), env(when, 0.002, 0.9, 0.1), lp);
    wire(v, osrc(v, 'triangle', 138, when, 0.22), env(when, 0.002, 0.5 * k, 0.18), lp);
    wire(v, nsrc(v, when, 0.05), flt('bandpass', 1400, 1.1), env(when, 0.001, 0.35 * k, 0.04), lp);
    if (e.speedMps > 6) {
      // Ram crunch: dragging metal squeal + plate rattle after the initial hit.
      const grind = nsrc(v, when + 0.03, 0.4, 0.9);
      const gBp = flt('bandpass', 640 + rng() * 260, 6);
      wire(v, grind, gBp, env(when + 0.03, 0.02, 0.30 * k, 0.34), lp);
      wire(v, nsrc(v, when + 0.05, 0.35, 1, crackleBuf), flt('bandpass', 900, 1.4),
        env(when + 0.05, 0.01, 0.35 * k, 0.3), lp);
    }
  }

  /** gameplay_feel r6: sapling/trunk crush under a hull — sharp wood crack,
   * low trunk-snap body, foliage crunch tail. Fired by 'prop:crushed'. */
  function onPropCrushed(e) {
    const s = spat(e.pos[0], e.pos[1], e.pos[2]);
    if (s.gain < 0.002) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.7, s.gain * 0.8, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.05), flt('bandpass', 950, 1.3), env(when, 0.001, 0.9, 0.045), lp);
    wire(v, osrc(v, 'triangle', 92, when, 0.2), env(when, 0.002, 0.55, 0.16), lp);
    wire(v, nsrc(v, when, 0.38), flt('lowpass', 1500, 0.8), env(when, 0.012, 0.4, 0.32), lp);
  }

  /**
   * Armor penetration clang: inharmonic metal partials + transient, plus
   * (SOUND overhaul) two short interior echo taps and a spall hiss — a shell
   * entering a steel box, not a dinner bell.
   */
  function clang(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 1.0, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    // Ring collector so the interior echo taps hear the whole partial stack.
    const ring = ctx.createGain();
    ring.gain.value = 1;
    ring.connect(lp);
    const d1 = ctx.createDelay(0.2); d1.delayTime.value = 0.055;
    const g1 = ctx.createGain(); g1.gain.value = 0.24;
    ring.connect(d1); d1.connect(g1); g1.connect(lp);
    const d2 = ctx.createDelay(0.2); d2.delayTime.value = 0.128;
    const g2 = ctx.createGain(); g2.gain.value = 0.11;
    ring.connect(d2); d2.connect(g2); g2.connect(lp);
    const partials = [812, 1378, 2466, 3417, 5124];
    const gains = [1.0, 0.7, 0.5, 0.34, 0.2];
    const decays = [0.55, 0.42, 0.3, 0.22, 0.14];
    for (let i = 0; i < partials.length; i++) {
      const detune = 1 + (rng() - 0.5) * 0.012;
      const e = env(when, 0.001, gains[i] * 0.6, decays[i]);
      const o = osrc(v, 'triangle', partials[i] * detune, when, decays[i] + 0.25);
      o.connect(e); e.connect(ring);
    }
    // Impact transient.
    wire(v, nsrc(v, when, 0.06), flt('highpass', 2400, 0.7), env(when, 0.001, 0.9, 0.03), lp);
    // Spall hiss: fragments sanding the interior right behind the punch.
    wire(v, nsrc(v, when + 0.01, 0.18), flt('bandpass', 4300, 1.1), env(when + 0.01, 0.004, 0.28, 0.14), lp);
    // Interior body thud.
    wire(v, nsrc(v, when, 0.18), flt('lowpass', 500, 0.7), env(when, 0.003, 0.6, 0.14), lp);
  }

  /**
   * Ricochet / non-pen (SOUND overhaul). Deflections play one of THREE
   * distinct bright metallic zings — classic long whine, double-skip, or
   * short shriek — each with randomized sweep + shard ticks, so back-to-back
   * bounces never sound like the same sample. Non-pens are a blunt shell
   * shatter: hard transient, dull knock, one dry ring.
   * @param {boolean} deflected true = ricochet, false = nonpen/absorb
   */
  function ping(x, y, z, deflected) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const lp = distLowpass(s.dist);
    if (deflected) {
      const variant = (rng() * 3) | 0;
      const v = spawnVoice(when, 0.9, s.gain, s.pan, sfxBus);
      lp.connect(v.in);
      // Hard metallic strike transient — every variant opens with the hit.
      wire(v, nsrc(v, when, 0.04), flt('highpass', 3200, 0.7), env(when, 0.001, 0.95, 0.02), lp);
      wire(v, nsrc(v, when, 0.1), flt('lowpass', 900, 0.7), env(when, 0.002, 0.4, 0.07), lp);
      const sweep = (f0, f1, at, dur, peak, q) => {
        const o = osrc(v, 'sine', f0, at, dur + 0.05);
        o.frequency.exponentialRampToValueAtTime(Math.max(80, f1), at + dur);
        const vib = osrc(v, 'sine', 24 + rng() * 10, at, dur);
        const vibG = ctx.createGain();
        vibG.gain.value = f0 * 0.02;
        vib.connect(vibG); vibG.connect(o.frequency);
        wire(v, o, flt('bandpass', (f0 + f1) * 0.5, q == null ? 0.9 : q), env(at, 0.004, peak, dur));
      };
      if (variant === 0) {
        // Classic long singing whine, falling away with the shell.
        sweep(2600 + rng() * 700, 720 + rng() * 200, when, 0.55 + rng() * 0.15, 0.5);
      } else if (variant === 1) {
        // Double-skip: two falling zings, the second higher and fainter
        // (shell grazing twice along the plate).
        const d1 = 0.2 + rng() * 0.06;
        sweep(2400 + rng() * 500, 950, when, d1, 0.48);
        const t2 = when + d1 + 0.02 + rng() * 0.03;
        wire(v, nsrc(v, t2, 0.02), flt('highpass', 3600, 0.8), env(t2, 0.001, 0.4, 0.012), lp);
        sweep(3100 + rng() * 700, 1250, t2, 0.28 + rng() * 0.08, 0.3);
      } else {
        // Short shriek: steep bright sweep, gone in a third of a second.
        sweep(3900 + rng() * 900, 1350 + rng() * 250, when, 0.30 + rng() * 0.08, 0.55, 1.6);
      }
      // Shard ticks: sparks/fragments pattering off after the deflection.
      const n = 2 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const at = when + 0.05 + rng() * 0.25;
        wire(v, nsrc(v, at, 0.03), flt('bandpass', 2400 + rng() * 2800, 3),
          env(at, 0.001, 0.10 + rng() * 0.12, 0.02 + rng() * 0.02), lp);
      }
      // Faint ring partial hanging on the plate.
      wire(v, osrc(v, 'triangle', 1900 * (0.9 + rng() * 0.2), when, 0.25),
        env(when, 0.001, 0.2, 0.2), lp);
    } else {
      // Non-pen: the shell breaks up on the plate — no flight whine.
      const v = spawnVoice(when, 0.5, s.gain, s.pan, sfxBus);
      lp.connect(v.in);
      wire(v, nsrc(v, when, 0.05), flt('highpass', 2600, 0.7), env(when, 0.001, 0.85, 0.025), lp);
      wire(v, nsrc(v, when, 0.15), flt('lowpass', 700 * (0.9 + rng() * 0.2), 0.7), env(when, 0.002, 0.7, 0.12), lp);
      wire(v, osrc(v, 'triangle', 1750 * (0.92 + rng() * 0.16), when, 0.2),
        env(when, 0.001, 0.22, 0.16), lp);
      // Fragments dropping off the plate.
      const at = when + 0.06 + rng() * 0.08;
      wire(v, nsrc(v, at, 0.04, 1, crackleBuf), flt('bandpass', 1900, 1.6),
        env(at, 0.002, 0.2, 0.06), lp);
    }
  }

  /**
   * Explosion (HE burst / destruction). scale ~1 = 122 mm HE; bigger = longer,
   * deeper. dirt=true muffles it (ground burst).
   */
  function explosion(x, y, z, scale, dirt, debris) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const k = Math.max(0.4, Math.min(2.2, scale));
    const dur = 1.4 * k + (debris ? 1.6 : 0);
    const v = spawnVoice(when, dur, s.gain, s.pan, sfxBus);
    const lp = distLowpass(dirt ? s.dist + 120 : s.dist);
    lp.connect(v.in);

    // Sub thump.
    const sub = osrc(v, 'sine', 50, when, 0.9 * k);
    sub.frequency.exponentialRampToValueAtTime(26, when + 0.55 * k);
    wire(v, sub, env(when, 0.008, 1.25, 0.85 * k), lp);
    // Main boom: noise through a collapsing lowpass.
    const boomLp = flt('lowpass', 1600, 0.7);
    boomLp.frequency.setValueAtTime(1600, when);
    boomLp.frequency.exponentialRampToValueAtTime(120, when + 0.6 * k);
    wire(v, nsrc(v, when, 1.0 * k), boomLp, env(when, 0.008, 1.3, 0.8 * k), lp);
    // Crackle sizzle.
    wire(v, nsrc(v, when, 0.9 * k, 1, crackleBuf), flt('bandpass', 2400, 0.8),
      env(when, 0.01, dirt ? 0.25 : 0.55, 0.8 * k), lp);
    if (dirt) {
      // Dirt/earth slap.
      wire(v, nsrc(v, when, 0.35), flt('lowpass', 420, 0.7), env(when, 0.004, 0.9, 0.28), lp);
    }
    if (debris) {
      // Debris patter: scattered ticks raining down after the blast.
      const n = 12 + ((rng() * 8) | 0);
      for (let i = 0; i < n; i++) {
        const at = when + 0.3 + rng() * 1.6;
        wire(v, nsrc(v, at, 0.05), flt('bandpass', 1400 + rng() * 3200, 2.5),
          env(at, 0.001, 0.12 + rng() * 0.18, 0.03 + rng() * 0.05), lp);
      }
      // Secondary pop.
      const at2 = when + 0.5 + rng() * 0.6;
      const lp2 = flt('lowpass', 700, 0.7);
      lp2.connect(v.in);
      wire(v, nsrc(v, at2, 0.3), flt('lowpass', 900, 0.7), env(at2, 0.006, 0.5, 0.3), lp2);
    }
  }

  /** ERA tile detonation: sharp pop + clang overtone. */
  function eraPop(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.5, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.15), flt('lowpass', 2800, 0.8), env(when, 0.002, 1.0, 0.1), lp);
    const sub = osrc(v, 'sine', 70, when, 0.2);
    sub.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    wire(v, sub, env(when, 0.003, 0.7, 0.15), lp);
    wire(v, osrc(v, 'triangle', 1620 * (0.95 + rng() * 0.1), when, 0.3),
      env(when, 0.001, 0.3, 0.25), lp);
  }

  /** Track link snapped (module trackL/R → red): metal snap + chain clatter. */
  function trackSnap(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.002) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.8, s.gain * 0.9, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    // Tensioned link letting go: sharp metallic snap.
    wire(v, nsrc(v, when, 0.03), flt('highpass', 2100, 0.8), env(when, 0.001, 0.9, 0.02), lp);
    wire(v, osrc(v, 'triangle', 1420 * (0.94 + rng() * 0.12), when, 0.16),
      env(when, 0.001, 0.4, 0.12), lp);
    // Low clunk of the run dropping onto the wheels.
    wire(v, osrc(v, 'triangle', 128, when + 0.05, 0.24), env(when + 0.05, 0.003, 0.55, 0.2), lp);
    // Chain clatter spilling off.
    wire(v, nsrc(v, when + 0.06, 0.5, 0.85, crackleBuf), flt('bandpass', 860, 1.3),
      env(when + 0.06, 0.01, 0.5, 0.45), lp);
  }

  /** Shell landing in dirt with no target (shell:expired hitTerrain). */
  function dirtImpact(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.003) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.5, s.gain * 0.7, s.pan, sfxBus);
    const lp = distLowpass(s.dist + 60);
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.14), flt('lowpass', 500, 0.7), env(when, 0.003, 0.9, 0.11), lp);
    wire(v, osrc(v, 'sine', 72, when, 0.18), env(when, 0.004, 0.5, 0.15), lp);
    wire(v, nsrc(v, when + 0.03, 0.2, 1, crackleBuf), flt('bandpass', 1700, 1.4),
      env(when + 0.03, 0.01, 0.22, 0.16), lp);
  }

  /** Hard suspension landing: hull slam + bogie rattle, scaled by sink speed. */
  function suspensionThump(x, y, z, vyMps) {
    const s = spat(x, y, z);
    const k = Math.min(1, (vyMps - LANDING_VY_MPS) / 7);
    if (s.gain * k < 0.002) return;
    const when = ctx.currentTime + 0.005;
    const v = spawnVoice(when, 0.5, s.gain * (0.35 + 0.65 * k), s.pan, engineBus);
    wire(v, nsrc(v, when, 0.1), flt('lowpass', 340, 0.7), env(when, 0.002, 0.9, 0.09));
    const sub = osrc(v, 'sine', 64, when, 0.22);
    sub.frequency.exponentialRampToValueAtTime(38, when + 0.16);
    wire(v, sub, env(when, 0.003, 0.7 * k, 0.18));
    // Road-wheel / fender rattle settling after the slam.
    wire(v, nsrc(v, when + 0.02, 0.3, 0.9, crackleBuf), flt('bandpass', 640, 1.2),
      env(when + 0.02, 0.01, 0.35 * k, 0.24));
  }

  // ---------------------------------------------------------- shell whizz ---

  /**
   * Schedule a flyby whizz from a shell:fired event: closest approach of the
   * fired ray to the listener, timed by estimated shell velocity.
   */
  function scheduleWhizz(e) {
    if (!listenerValid) return;
    const mp = e.muzzlePos, d = e.dir;
    const rx = lx - mp[0], ry = ly - mp[1], rz = lz - mp[2];
    const t = rx * d[0] + ry * d[1] + rz * d[2];   // meters along the ray
    if (t < 12 || t > 900) return;
    const cx = mp[0] + d[0] * t, cy = mp[1] + d[1] * t, cz = mp[2] + d[2] * t;
    const px = cx - lx, py = cy - ly, pz = cz - lz;
    const miss = Math.sqrt(px * px + py * py + pz * pz);
    if (miss > WHIZZ_MAX_MISS_M) return;
    const vel = WHIZZ_VEL_MPS[e.shellType] || 900;
    if (vel <= MIN_WHIZZ_SPEED_MPS) return;

    const when = ctx.currentTime + t / vel;
    const closeness = 1 - miss / WHIZZ_MAX_MISS_M;     // 0..1
    const gain = 0.15 + 0.7 * closeness * closeness;
    // Pan by which side the shell passes on.
    const pan = miss > 0.001
      ? Math.max(-1, Math.min(1, (px * lfz - pz * lfx) / miss)) * 0.9 : 0;

    const v = spawnVoice(when - 0.12, 0.45, gain, pan, sfxBus);
    const w0 = when - 0.12;
    // Doppler-ish whoosh: bandpassed noise sweeping down through the pass.
    const bp = flt('bandpass', 4200, 1.8);
    bp.frequency.setValueAtTime(4200, w0);
    bp.frequency.exponentialRampToValueAtTime(600, w0 + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, w0);
    g.gain.linearRampToValueAtTime(1.0, when);          // peak exactly at pass
    g.gain.exponentialRampToValueAtTime(0.0001, w0 + 0.4);
    wire(v, nsrc(v, w0, 0.45, 1.4), bp, g);
    // Thin supersonic crack lick on very close passes.
    if (closeness > 0.6) {
      wire(v, nsrc(v, when, 0.05), flt('highpass', 3500, 0.7),
        env(when, 0.001, 0.6, 0.025));
    }
  }

  // --------------------------------------------------------------- ui/fx ---

  function uiClick() {
    const when = ctx.currentTime;
    // UI blips route through the UI/music channel so the Interface slider
    // governs clicks as well as the garage sting (hitConfirm stays on sfxBus).
    const v = spawnVoice(when, 0.1, 0.4, 0, musicBus);
    wire(v, nsrc(v, when, 0.03), flt('highpass', 2200, 0.7), env(when, 0.001, 0.6, 0.015));
    wire(v, osrc(v, 'sine', 1250, when, 0.06), env(when, 0.001, 0.3, 0.045));
  }

  /** Quieter sibling of uiClick for pointer hover over buttons. */
  function uiHover() {
    const when = ctx.currentTime;
    const v = spawnVoice(when, 0.06, 0.13, 0, musicBus);
    wire(v, osrc(v, 'sine', 1900, when, 0.035), env(when, 0.001, 0.5, 0.025));
  }

  let _lastHoverEl = null;
  let _lastHoverT = 0;
  /** Delegated hover ticks for buttons/toggles/tabs (installed at resume()). */
  function installHoverTicks() {
    if (typeof document === 'undefined') return;
    document.addEventListener('mouseover', (ev) => {
      if (!ctx || muted) return;
      if (document.pointerLockElement) return;   // battle mouselook — no cursor
      const t = ev.target;
      if (!t || !t.closest) return;
      const el = t.closest('button, .cot-set-toggle, .cot-set-tab');
      if (!el || el === _lastHoverEl) return;
      _lastHoverEl = el;
      const now = ctx.currentTime;
      if (now - _lastHoverT < 0.07) return;
      _lastHoverT = now;
      uiHover();
    }, { capture: true, passive: true });
  }

  /**
   * Non-spatial hit-confirm blip for the PLAYER's own shells (WoT "your shot
   * connected" feedback, layered on top of the 3-D impact sound at the target).
   * @param {boolean} pen true = damaging hit (bright two-tone dink);
   *                      false = bounce/absorb (short dull knock)
   */
  function hitConfirmSound(kind, damage = 0) {
    if (!ctx) return;
    const when = ctx.currentTime + 0.01;
    const pen = kind === 'pen' || kind === 'he_pen' || damage > 0;
    const ricochet = kind === 'ricochet';
    if (pen) {
      const v = spawnVoice(when, 0.3, 0.55, 0, sfxBus);
      wire(v, osrc(v, 'triangle', 1560, when, 0.09), env(when, 0.002, 0.5, 0.07));
      wire(v, osrc(v, 'triangle', 2140, when + 0.055, 0.12), env(when + 0.055, 0.002, 0.42, 0.1));
      wire(v, nsrc(v, when, 0.03), flt('highpass', 4200, 0.8), env(when, 0.001, 0.25, 0.02));
    } else if (ricochet) {
      // Rising, ringing skid: unmistakably different from the low absorbed
      // thud below even when the spatial target impact is far away.
      const v = spawnVoice(when, 0.34, 0.46, 0, sfxBus);
      const o = osrc(v, 'triangle', 1150, when, 0.25);
      o.frequency.exponentialRampToValueAtTime(2350, when + 0.16);
      wire(v, o, flt('bandpass', 1900, 1.1), env(when, 0.002, 0.55, 0.23));
      wire(v, nsrc(v, when, 0.035), flt('highpass', 3600, 0.8), env(when, 0.001, 0.34, 0.025));
    } else {
      const v = spawnVoice(when, 0.22, 0.42, 0, sfxBus);
      const o = osrc(v, 'square', 340, when, 0.1);
      o.frequency.exponentialRampToValueAtTime(210, when + 0.09);
      wire(v, o, flt('lowpass', 900, 0.8), env(when, 0.002, 0.5, 0.09));
      wire(v, nsrc(v, when, 0.04), flt('bandpass', 1200, 1.2), env(when, 0.001, 0.3, 0.035));
    }
  }

  /** Non-spatial breech latch: the loaded gun is ready to fire again. */
  function reloadReadySound() {
    if (!ctx) return;
    const when = ctx.currentTime + 0.004;
    const v = spawnVoice(when, 0.24, 0.36, 0, sfxBus);
    wire(v, nsrc(v, when, 0.035), flt('bandpass', 1250, 1.8), env(when, 0.001, 0.55, 0.028));
    const latch = osrc(v, 'triangle', 420, when + 0.025, 0.13);
    latch.frequency.exponentialRampToValueAtTime(690, when + 0.1);
    wire(v, latch, flt('lowpass', 1500, 0.8), env(when + 0.025, 0.002, 0.45, 0.11));
  }

  // -------------------------------------------------- stingers / fanfares ---

  /** Battle-open horn: short two-note brass rise, distinct from the garage sting. */
  function battleHorn() {
    const when = ctx.currentTime + 0.02;
    const v = spawnVoice(when, 1.6, 0.55, 0, musicBus);
    const notes = [[110.0, 0], [146.83, 0.16]];         // A2 → D3
    for (const [f, at0] of notes) {
      const at = when + at0;
      const o = osrc(v, 'sawtooth', f, at, 1.2);
      const o2 = osrc(v, 'sawtooth', f * 2.004, at, 1.2);
      const shape = flt('lowpass', 380, 0.9);
      shape.frequency.setValueAtTime(380, at);
      shape.frequency.linearRampToValueAtTime(2100, at + 0.18);
      shape.frequency.exponentialRampToValueAtTime(520, at + 1.0);
      const g = env(at, 0.03, 0.26, 1.0);
      o.connect(shape); o2.connect(shape); shape.connect(g); g.connect(v.in);
    }
    // Kick-drum style thump under the second note.
    const sub = osrc(v, 'sine', 92, when + 0.16, 0.5);
    sub.frequency.exponentialRampToValueAtTime(42, when + 0.5);
    wire(v, sub, env(when + 0.16, 0.005, 0.6, 0.4));
  }

  /** Kill-confirm sting: quick bright arpeggio (player scored a kill). */
  function killSting() {
    const when = ctx.currentTime + 0.01;
    const v = spawnVoice(when, 0.8, 0.34, 0, musicBus);
    const notes = [659.26, 987.77, 1318.5];             // E5 B5 E6
    for (let i = 0; i < notes.length; i++) {
      const at = when + i * 0.085;
      wire(v, osrc(v, 'triangle', notes[i], at, 0.3), env(at, 0.004, 0.34 - i * 0.06, 0.26));
    }
    wire(v, nsrc(v, when + 0.17, 0.2), flt('highpass', 6200, 0.7), env(when + 0.17, 0.01, 0.08, 0.18));
  }

  /**
   * Result fanfare on 'battle:ended'.
   * @param {'victory'|'defeat'|'draw'} result
   */
  function resultFanfare(result) {
    const when = ctx.currentTime + 0.05;
    if (result === 'victory') {
      const v = spawnVoice(when, 3.4, 0.6, 0, musicBus);
      // Rising D-major brass: D3 F#3 A3 D4, staggered, bright filter bloom.
      const seq = [[146.83, 0], [185.0, 0.14], [220.0, 0.28], [293.66, 0.46]];
      for (const [f, at0] of seq) {
        const at = when + at0;
        const o = osrc(v, 'sawtooth', f, at, 2.4);
        const o2 = osrc(v, 'sawtooth', f * 1.996, at, 2.4);
        const shape = flt('lowpass', 420, 0.8);
        shape.frequency.setValueAtTime(420, at);
        shape.frequency.linearRampToValueAtTime(2600, at + 0.4);
        shape.frequency.exponentialRampToValueAtTime(600, at + 2.2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.16, at + 0.07);
        g.gain.setValueAtTime(0.16, at + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 2.3);
        o.connect(shape); o2.connect(shape); shape.connect(g); g.connect(v.in);
      }
      // Timpani + cymbal on the top note.
      const tAt = when + 0.46;
      const timp = osrc(v, 'sine', 116, tAt, 1.0);
      timp.frequency.exponentialRampToValueAtTime(56, tAt + 0.3);
      wire(v, timp, env(tAt, 0.004, 0.8, 0.9));
      wire(v, nsrc(v, tAt, 1.2), flt('highpass', 5400, 0.7), env(tAt, 0.002, 0.2, 1.1));
    } else if (result === 'defeat') {
      const v = spawnVoice(when, 3.2, 0.55, 0, musicBus);
      // Low minor fall: D2+F2 dyad bending down a semitone into a dark rumble.
      for (const f of [73.42, 87.31]) {
        const o = osrc(v, 'sawtooth', f, when, 2.6);
        o.frequency.setValueAtTime(f, when + 0.8);
        o.frequency.exponentialRampToValueAtTime(f * 0.944, when + 1.7);
        const shape = flt('lowpass', 700, 0.7);
        shape.frequency.setValueAtTime(700, when);
        shape.frequency.exponentialRampToValueAtTime(160, when + 2.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.20, when + 0.25);
        g.gain.setValueAtTime(0.20, when + 1.5);
        g.gain.exponentialRampToValueAtTime(0.0001, when + 2.6);
        o.connect(shape); shape.connect(g); g.connect(v.in);
      }
      wire(v, nsrc(v, when + 0.2, 2.0), flt('lowpass', 240, 0.6), env(when + 0.2, 0.4, 0.30, 2.2));
      const sub = osrc(v, 'sine', 49, when, 2.4);
      sub.frequency.exponentialRampToValueAtTime(30, when + 2.0);
      wire(v, sub, env(when, 0.15, 0.35, 2.1));
    } else {
      // Draw: two flat horn calls, no resolution.
      const v = spawnVoice(when, 2.2, 0.45, 0, musicBus);
      for (const at0 of [0, 0.55]) {
        const at = when + at0;
        const o = osrc(v, 'sawtooth', 110, at, 0.9);
        const shape = flt('lowpass', 640, 0.9);
        wire(v, o, shape, env(at, 0.04, 0.22, 0.75));
      }
    }
  }

  // ----------------------------------------------------------- fire loops ---

  function startFireLoop(id) {
    if (fireLoops.has(id)) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    out.connect(pan);
    pan.connect(sfxBus);

    const now = ctx.currentTime;
    // Roaring flame bed.
    const roar = ctx.createBufferSource();
    roar.buffer = whiteBuf; roar.loop = true; roar.start(now, rng() * 1.7);
    const roarLp = flt('lowpass', 480, 0.7);
    const roarG = ctx.createGain(); roarG.gain.value = 0.5;
    roar.connect(roarLp); roarLp.connect(roarG); roarG.connect(out);
    // Flicker LFO on the roar.
    const lfo = ctx.createOscillator(); lfo.type = 'sine';
    lfo.frequency.value = 6.5 + rng() * 2; lfo.start(now);
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.14;
    lfo.connect(lfoG); lfoG.connect(roarG.gain);
    // Crackle.
    const crk = ctx.createBufferSource();
    crk.buffer = crackleBuf; crk.loop = true;
    crk.playbackRate.value = 0.9 + rng() * 0.2; crk.start(now, rng() * 1.7);
    const crkBp = flt('bandpass', 2300, 0.9);
    const crkG = ctx.createGain(); crkG.gain.value = 0.55;
    crk.connect(crkBp); crkBp.connect(crkG); crkG.connect(out);

    out.gain.setTargetAtTime(1, now, 0.25);
    fireLoops.set(id, {
      out, pan,
      kill() {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.15);
        try { roar.stop(t + 0.6); crk.stop(t + 0.6); lfo.stop(t + 0.6); } catch (_) { /* stopped */ }
        roar.onended = () => { try { out.disconnect(); pan.disconnect(); } catch (_) { /* detached */ } };
      },
    });
  }

  function stopFireLoop(id) {
    const f = fireLoops.get(id);
    if (!f) return;
    f.kill();
    fireLoops.delete(id);
  }

  // ---------------------------------------------------------------- alarms ---

  /** Two-tone fire klaxon while the PLAYER burns (voice bus — crew compartment). */
  function startFireAlarm() {
    if (fireAlarmRig || !ctx) return;
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(voiceBus);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 690;
    // Square LFO flips the pitch between the two klaxon tones.
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.5;
    const lfoG = ctx.createGain(); lfoG.gain.value = 118;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    const bp = flt('bandpass', 950, 1.1);
    o.connect(bp); bp.connect(out);
    o.start(now); lfo.start(now);
    out.gain.setTargetAtTime(0.12, now, 0.08);
    fireAlarmRig = {
      kill() {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.1);
        try { o.stop(t + 0.4); lfo.stop(t + 0.4); } catch (_) { /* stopped */ }
        o.onended = () => { try { out.disconnect(); } catch (_) { /* detached */ } };
      },
    };
  }

  function stopFireAlarm() {
    if (!fireAlarmRig) return;
    fireAlarmRig.kill();
    fireAlarmRig = null;
  }

  /** Urgent triple beep — ammo rack took damage. One-shot, non-spatial. */
  function ammoRackWarning() {
    const when = ctx.currentTime + 0.01;
    const v = spawnVoice(when, 0.6, 0.30, 0, voiceBus);
    for (let i = 0; i < 3; i++) {
      const at = when + i * 0.15;
      wire(v, osrc(v, 'square', 980, at, 0.09), flt('lowpass', 2600, 0.8),
        env(at, 0.003, 0.5, 0.07));
    }
  }

  /** 6-second low heartbeat pulse window (critical HP). One osc, no pool use. */
  function heartbeatPulse() {
    if (heartbeatRig || !ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 56;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(voiceBus);
    o.start(now);
    // Schedule lub-dub pairs across the window up front — no timers needed.
    const beat = 60 / 58;                     // 58 bpm
    for (let t0 = now + 0.05; t0 < now + HEARTBEAT_WINDOW_S; t0 += beat) {
      for (const [off, amp] of [[0, 0.16], [0.28, 0.10]]) {
        const a = t0 + off;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.linearRampToValueAtTime(amp, a + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, a + 0.18);
      }
    }
    o.stop(now + HEARTBEAT_WINDOW_S + 0.5);
    heartbeatRig = { o, g };
    o.onended = () => {
      try { g.disconnect(); } catch (_) { /* detached */ }
      heartbeatRig = null;
    };
  }

  // --------------------------------------------------------- engine loops ---

  function createEngineVoice(entity) {
    const isTurbine = /^(m1a|m1a2|abramsx)/.test(entity.specId || '');
    const modern = entity.spec && entity.spec.era === 'modern';
    const f0 = isTurbine ? 58 : modern ? 50 : 41;   // fundamental at idle pitch 1.0

    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner();
    out.connect(pan); pan.connect(engineBus);
    const now = ctx.currentTime;

    // Twin detuned saws — the mechanical growl.
    const sawA = ctx.createOscillator(); sawA.type = 'sawtooth'; sawA.frequency.value = f0;
    const sawB = ctx.createOscillator(); sawB.type = 'sawtooth'; sawB.frequency.value = f0 * 2.02;
    const sub = ctx.createOscillator();  sub.type = 'sine';      sub.frequency.value = f0 * 0.5;
    const sawLp = flt('lowpass', 900, 0.7);
    const gSaw = ctx.createGain(); gSaw.gain.value = isTurbine ? 0.07 : 0.15;
    const gSub = ctx.createGain(); gSub.gain.value = 0.22;
    sawA.connect(sawLp); sawB.connect(sawLp); sawLp.connect(gSaw); gSaw.connect(out);
    sub.connect(gSub); gSub.connect(out);
    // Rattle FM wobble on the saws (diesel unevenness).
    const wob = ctx.createOscillator(); wob.type = 'sine';
    wob.frequency.value = 9 + rng() * 4;
    const wobG = ctx.createGain(); wobG.gain.value = isTurbine ? 0.6 : 2.4;
    wob.connect(wobG); wobG.connect(sawA.frequency); wobG.connect(sawB.frequency);

    // Combustion / intake noise.
    const noi = ctx.createBufferSource();
    noi.buffer = whiteBuf; noi.loop = true; noi.start(now, rng() * 1.7);
    const noiBp = flt('bandpass', 180, 0.9);
    const gNoi = ctx.createGain(); gNoi.gain.value = isTurbine ? 0.3 : 0.22;
    noi.connect(noiBp); noiBp.connect(gNoi); gNoi.connect(out);

    // Track squeak/rattle: resonant noise band, gated above 2 m/s.
    const sq = ctx.createBufferSource();
    sq.buffer = whiteBuf; sq.loop = true; sq.playbackRate.value = 0.8; sq.start(now, rng() * 1.7);
    const sqBp = flt('bandpass', 1450, 9);
    const gSq = ctx.createGain(); gSq.gain.value = 0;
    sq.connect(sqBp); sqBp.connect(gSq); gSq.connect(out);
    const sqLfo = ctx.createOscillator(); sqLfo.type = 'sine';
    sqLfo.frequency.value = 2.3 + rng() * 1.2;
    const sqLfoG = ctx.createGain(); sqLfoG.gain.value = 320;
    sqLfo.connect(sqLfoG); sqLfoG.connect(sqBp.frequency);
    // Track link clatter band.
    const clat = ctx.createBufferSource();
    clat.buffer = crackleBuf; clat.loop = true; clat.start(now, rng() * 1.7);
    const clatBp = flt('bandpass', 900, 1.5);
    const gClat = ctx.createGain(); gClat.gain.value = 0;
    clat.connect(clatBp); clatBp.connect(gClat); gClat.connect(out);

    // Turbine whine (m1a2 signature): high sine 900 → 1400 Hz with speed.
    let tur = null, gTur = null;
    if (isTurbine) {
      tur = ctx.createOscillator(); tur.type = 'sine'; tur.frequency.value = 900;
      gTur = ctx.createGain(); gTur.gain.value = 0.05;
      tur.connect(gTur); gTur.connect(out);
      tur.start(now);
    }

    sawA.start(now); sawB.start(now); sub.start(now); wob.start(now); sqLfo.start(now);

    const topMps = Math.max(1, ((entity.spec && entity.spec.topSpeedKmh) || 40) / 3.6);

    return {
      out, pan,
      update(ent) {
        const t = ctx.currentTime;
        const spd = Math.abs(ent.state.speed);
        const frac = Math.min(1, spd / topMps);
        // Perceived throttle bite: engine load responds on the input edge,
        // before 60 tonnes have gained visible speed. Speed still owns cruise
        // RPM; throttle/spool adds the immediate turbine/diesel surge.
        const demand = Math.min(1, Math.abs((ent.input && ent.input.throttle) || 0));
        const spool = Math.min(1, ent.state._spool || 0);
        const rpm = Math.max(frac, demand * (0.34 + 0.44 * spool));
        const p = 0.8 + 0.6 * rpm;                       // RPM pitch — §3.9
        sawA.frequency.setTargetAtTime(f0 * p, t, 0.08);
        sawB.frequency.setTargetAtTime(f0 * 2.02 * p, t, 0.08);
        sub.frequency.setTargetAtTime(f0 * 0.5 * p, t, 0.08);
        noiBp.frequency.setTargetAtTime(180 * p, t, 0.08);
        if (tur) {
          tur.frequency.setTargetAtTime(900 + 500 * frac, t, 0.12);
          gTur.gain.setTargetAtTime(0.05 + 0.09 * frac, t, 0.12);
        }
        const squeak = spd > 2 ? Math.min(1, (spd - 2) / 5) : 0;
        gSq.gain.setTargetAtTime(squeak * 0.28, t, 0.1);
        gClat.gain.setTargetAtTime(squeak * 0.4, t, 0.1);

        const pos = ent.state.pos;
        const s = spat(pos.x, pos.y, pos.z);
        gNoi.gain.setTargetAtTime((isTurbine ? 0.3 : 0.22) + demand * 0.12, t, 0.055);
        const load = 0.44 + 0.30 * frac + 0.26 * demand;
        out.gain.setTargetAtTime(s.gain * load, t, 0.1);
        pan.pan.setTargetAtTime(s.pan, t, 0.1);
        return s.dist;
      },
      kill() {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.1);
        const all = [sawA, sawB, sub, wob, noi, sq, sqLfo, clat, tur];
        for (const n of all) { if (n) { try { n.stop(t + 0.4); } catch (_) { /* stopped */ } } }
        sawA.onended = () => { try { out.disconnect(); pan.disconnect(); } catch (_) { /* detached */ } };
      },
    };
  }

  // ------------------------------------------------------ turret traverse ---

  /** Player-only turret traverse whir + gun elevation servo (engine bus). */
  function createTraverseRig() {
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 1;
    out.connect(engineBus);
    // Traverse motor: low saw through a resonant band + gear noise.
    const motor = ctx.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 84;
    const mLp = flt('lowpass', 330, 1.2);
    const gMotor = ctx.createGain(); gMotor.gain.value = 0;
    motor.connect(mLp); mLp.connect(gMotor); gMotor.connect(out);
    const gearN = ctx.createBufferSource();
    gearN.buffer = whiteBuf; gearN.loop = true; gearN.playbackRate.value = 0.7;
    gearN.start(now, rng() * 1.7);
    const gearBp = flt('bandpass', 760, 2.2);
    const gGear = ctx.createGain(); gGear.gain.value = 0;
    gearN.connect(gearBp); gearBp.connect(gGear); gGear.connect(out);
    // Gear-mesh AM texture.
    const am = ctx.createOscillator(); am.type = 'sine'; am.frequency.value = 13;
    const amG = ctx.createGain(); amG.gain.value = 0;
    am.connect(amG); amG.connect(gGear.gain);
    // Elevation servo: thinner, higher band.
    const servoN = ctx.createBufferSource();
    servoN.buffer = whiteBuf; servoN.loop = true; servoN.playbackRate.value = 1.1;
    servoN.start(now, rng() * 1.7);
    const servoBp = flt('bandpass', 1480, 4);
    const gServo = ctx.createGain(); gServo.gain.value = 0;
    servoN.connect(servoBp); servoBp.connect(gServo); gServo.connect(out);
    motor.start(now); am.start(now);

    let lastPitch = null;
    return {
      update(ent, dt) {
        const t = ctx.currentTime;
        const rate = Math.min(1, Math.abs(ent.state.turretYawRate || 0) / TRAVERSE_RATE_FULL);
        gMotor.gain.setTargetAtTime(rate * 0.085, t, 0.06);
        gGear.gain.setTargetAtTime(rate * 0.075, t, 0.06);
        amG.gain.setTargetAtTime(rate * 0.03, t, 0.06);
        motor.frequency.setTargetAtTime(84 * (0.9 + 0.35 * rate), t, 0.08);
        const pitch = ent.state.gunPitch || 0;
        if (lastPitch != null && dt > 0.0001) {
          const pr = Math.min(1, Math.abs(pitch - lastPitch) / dt / 0.35);
          gServo.gain.setTargetAtTime(pr > 0.06 ? pr * 0.045 : 0, t, 0.05);
        }
        lastPitch = pitch;
      },
      kill() {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.08);
        for (const n of [motor, gearN, servoN, am]) { try { n.stop(t + 0.3); } catch (_) { /* stopped */ } }
        motor.onended = () => { try { out.disconnect(); } catch (_) { /* detached */ } };
      },
    };
  }

  function stopTraverseRig() {
    if (!traverseRig) return;
    traverseRig.kill();
    traverseRig = null;
  }

  // -------------------------------------------------------------- ambient ---

  function maybeBird() {
    if (!ctx || rng() > 0.32) return;
    const when = ctx.currentTime + rng() * 0.4;
    const panV = (rng() * 2 - 1) * 0.9;
    const notes = 2 + ((rng() * 4) | 0);
    const v = spawnVoice(when, notes * 0.15 + 0.3, 0.045 + rng() * 0.05, panV, ambientBus);
    let at = when;
    for (let i = 0; i < notes; i++) {
      const f = 2400 + rng() * 1900;
      const dur = 0.05 + rng() * 0.06;
      const o = osrc(v, 'sine', f, at, dur + 0.05);
      o.frequency.linearRampToValueAtTime(f + (rng() < 0.5 ? -1 : 1) * (250 + rng() * 650), at + dur);
      wire(v, o, env(at, 0.012, 1.0, dur));
      at += dur + 0.04 + rng() * 0.07;
    }
  }

  function ambientStart() {
    if (windRig) return;
    const now = ctx.currentTime;
    // Wind bed: pink noise, slow amplitude swell.
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = windBuf; wsrc.loop = true; wsrc.start(now, rng() * 3.5);
    const wLp = flt('lowpass', 420, 0.6);
    const wG = ctx.createGain(); wG.gain.value = 0;
    wsrc.connect(wLp); wLp.connect(wG); wG.connect(ambientBus);
    const swell = ctx.createOscillator(); swell.type = 'sine';
    swell.frequency.value = 0.07; swell.start(now);
    const swellG = ctx.createGain(); swellG.gain.value = 0.16;
    swell.connect(swellG); swellG.connect(wG.gain);
    // Gust layer: airier band, slower cycle out of phase.
    const gsrc = ctx.createBufferSource();
    gsrc.buffer = whiteBuf; gsrc.loop = true; gsrc.playbackRate.value = 0.55;
    gsrc.start(now, rng() * 1.7);
    const gBp = flt('bandpass', 640, 0.6);
    const gG = ctx.createGain(); gG.gain.value = 0;
    gsrc.connect(gBp); gBp.connect(gG); gG.connect(ambientBus);
    const gust = ctx.createOscillator(); gust.type = 'sine';
    gust.frequency.value = 0.043; gust.start(now);
    const gustG = ctx.createGain(); gustG.gain.value = 0.05;
    gust.connect(gustG); gustG.connect(gG.gain);

    wG.gain.setTargetAtTime(0.45, now, 1.2);
    gG.gain.setTargetAtTime(0.09, now, 1.6);

    windRig = {
      kill() {
        const t = ctx.currentTime;
        wG.gain.setTargetAtTime(0, t, 0.4);
        gG.gain.setTargetAtTime(0, t, 0.4);
        for (const n of [wsrc, gsrc, swell, gust]) { try { n.stop(t + 1.5); } catch (_) { /* stopped */ } }
        wsrc.onended = () => {
          try { wG.disconnect(); gG.disconnect(); } catch (_) { /* detached */ }
        };
      },
    };
    birdTimerId = setInterval(maybeBird, 700);
  }

  function ambientStop() {
    if (!windRig) return;
    windRig.kill();
    windRig = null;
    if (birdTimerId != null) { clearInterval(birdTimerId); birdTimerId = null; }
  }

  // -------------------------------------------------------- garage ambient ---

  /** One distant workshop clank (or a short ratchet burst), random pan. */
  function garageClank() {
    if (!ctx) return;
    const when = ctx.currentTime + rng() * 0.3;
    const panV = (rng() * 2 - 1) * 0.8;
    if (rng() < 0.3) {
      // Ratchet: 3-5 fast dry ticks.
      const n = 3 + ((rng() * 3) | 0);
      const v = spawnVoice(when, n * 0.09 + 0.15, 0.05 + rng() * 0.04, panV, ambientBus);
      for (let i = 0; i < n; i++) {
        const at = when + i * (0.07 + rng() * 0.02);
        wire(v, nsrc(v, at, 0.02), flt('bandpass', 1400 + rng() * 500, 3),
          env(at, 0.001, 0.7, 0.015));
      }
    } else {
      // Single distant metal clank with a touch of shop-floor ring.
      const v = spawnVoice(when, 0.7, 0.045 + rng() * 0.05, panV, ambientBus);
      const f = 520 + rng() * 480;
      wire(v, osrc(v, 'triangle', f, when, 0.4), flt('lowpass', 2200, 0.8),
        env(when, 0.002, 0.8, 0.32));
      wire(v, osrc(v, 'triangle', f * 1.62, when, 0.25), env(when, 0.001, 0.3, 0.2));
      wire(v, nsrc(v, when, 0.03), flt('highpass', 1800, 0.8), env(when, 0.001, 0.4, 0.02));
    }
  }

  /** Garage room tone: mains hum + HVAC air + sparse workshop clanks. */
  function garageToneStart() {
    if (garageRig || !ctx) return;
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(ambientBus);
    // Fluorescent/mains hum.
    const hum1 = ctx.createOscillator(); hum1.type = 'sine'; hum1.frequency.value = 60;
    const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 120;
    const gH1 = ctx.createGain(); gH1.gain.value = 0.05;
    const gH2 = ctx.createGain(); gH2.gain.value = 0.022;
    hum1.connect(gH1); gH1.connect(out);
    hum2.connect(gH2); gH2.connect(out);
    // HVAC air wash.
    const air = ctx.createBufferSource();
    air.buffer = windBuf; air.loop = true; air.playbackRate.value = 0.6;
    air.start(now, rng() * 3.5);
    const airLp = flt('lowpass', 260, 0.5);
    const gAir = ctx.createGain(); gAir.gain.value = 0.5;
    air.connect(airLp); airLp.connect(gAir); gAir.connect(out);
    const swell = ctx.createOscillator(); swell.type = 'sine'; swell.frequency.value = 0.05;
    const swellG = ctx.createGain(); swellG.gain.value = 0.1;
    swell.connect(swellG); swellG.connect(gAir.gain);
    hum1.start(now); hum2.start(now); swell.start(now);
    out.gain.setTargetAtTime(0.5, now, 0.8);
    // Sparse workshop life: a clank roughly every 5-10 s.
    const timerId = setInterval(() => { if (rng() < 0.14) garageClank(); }, 900);
    garageRig = {
      kill() {
        clearInterval(timerId);
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.3);
        for (const n of [hum1, hum2, air, swell]) { try { n.stop(t + 1.2); } catch (_) { /* stopped */ } }
        hum1.onended = () => { try { out.disconnect(); } catch (_) { /* detached */ } };
      },
    };
  }

  function garageToneStop() {
    if (!garageRig) return;
    garageRig.kill();
    garageRig = null;
  }

  // --------------------------------------------------------- garage sting ---

  function garageSting() {
    const when = ctx.currentTime + 0.02;
    const v = spawnVoice(when, 3.2, 0.8, 0, musicBus);

    // Timpani hit.
    const timp = osrc(v, 'sine', 108, when, 1.2);
    timp.frequency.exponentialRampToValueAtTime(50, when + 0.35);
    wire(v, timp, env(when, 0.004, 1.0, 1.0));
    // Cymbal shimmer.
    wire(v, nsrc(v, when, 1.4), flt('highpass', 5600, 0.7), env(when, 0.002, 0.22, 1.3));
    // Brass-ish D-minor power chord, staggered entries: D2 A2 D3 F3 A3.
    const notes = [73.42, 110.0, 146.83, 174.61, 220.0];
    const amps = [0.2, 0.17, 0.15, 0.12, 0.1];
    for (let i = 0; i < notes.length; i++) {
      const at = when + i * 0.07;
      const o = osrc(v, 'sawtooth', notes[i], at, 2.6);
      const shape = flt('lowpass', 300, 0.8);
      shape.frequency.setValueAtTime(300, at);
      shape.frequency.linearRampToValueAtTime(2300, at + 0.5);
      shape.frequency.exponentialRampToValueAtTime(500, at + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(amps[i], at + 0.08);
      g.gain.setValueAtTime(amps[i], at + 1.4);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.5);
      wire(v, o, shape, g);
    }
    // Sub root swell.
    wire(v, osrc(v, 'sine', 36.7, when, 2.8), env(when, 0.3, 0.28, 2.2));
  }

  // -------------------------------------------------------------- events ---

  function onShellFired(e) {
    const mp = e.muzzlePos;
    gunshot(mp[0], mp[1], mp[2], e.caliberMm, !!e.isPlayer);
    if (!e.isPlayer) scheduleWhizz(e);
    else radio.say('firing', { prob: 0.25 });
  }

  function onShellHit(e) {
    const p = e.pos;
    switch (e.kind) {
      case 'pen':
        clang(p[0], p[1], p[2]);
        break;
      case 'ricochet':
        ping(p[0], p[1], p[2], true);
        break;
      case 'nonpen':
      case 'spaced_absorb':
        ping(p[0], p[1], p[2], false);
        break;
      case 'era':
        eraPop(p[0], p[1], p[2]);
        break;
      case 'he_pen':
      case 'he_splash':
        explosion(p[0], p[1], p[2], 0.55 + (e.caliberMm || 122) / 160, false, false);
        break;
      case 'terrain':
        explosion(p[0], p[1], p[2], 0.4 + (e.caliberMm || 100) / 220, true, false);
        break;
      default:
        break;
    }
    // Crew reactions — listener-side only, no new emitters (§3.9).
    if (playerId == null) return;
    if (e.targetId === playerId) {
      if (e.kind === 'ricochet' || e.kind === 'nonpen' || e.kind === 'spaced_absorb') {
        radio.say('bounced_us');
      } else if ((e.damage || 0) > 0) {
        radio.say('were_hit');
      }
    } else if (e.attackerId === playerId && e.kind === 'ricochet') {
      radio.say('ricochet');
    }
  }

  function onTankDestroyed(e) {
    const p = e.pos;
    explosion(p[0], p[1], p[2], 1.8, false, true);
    const eng = engines.get(e.id);
    if (eng) { eng.kill(); engines.delete(e.id); }
    landing.delete(e.id);
    if (playerId != null && e.id === playerId) {
      stopFireAlarm();
      stopTraverseRig();
      playerBurning = false;
    } else if (playerId != null && e.killerId === playerId) {
      killSting();
      radio.say('target_destroyed');
    }
  }

  /** Player module damage/repair → alarms + crew calls (edge-triggered). */
  function onModuleState(e) {
    const key = `${e.id}:${e.module}`;
    const prev = moduleState.get(key) || 'ok';
    moduleState.set(key, e.state);
    if (e.state === prev) return;
    const RANK = { ok: 0, yellow: 1, red: 2 };
    const worse = (RANK[e.state] || 0) > (RANK[prev] || 0);
    // Track break is a WORLD sound (any tank in earshot, spatial).
    if (worse && e.state === 'red' && (e.module === 'trackL' || e.module === 'trackR')) {
      const info = tankInfo.get(e.id);
      if (info && info.pos) trackSnap(info.pos.x, info.pos.y, info.pos.z);
    }
    if (playerId == null || e.id !== playerId || phase !== 'battle') return;
    if (worse) {
      switch (e.module) {
        case 'ammoRack': ammoRackWarning(); radio.say('ammo_rack'); break;
        case 'engine': radio.say('engine_damaged'); break;
        case 'trackL':
        case 'trackR': if (e.state === 'red') radio.say('track_gone'); break;
        case 'gun': radio.say('gun_damaged'); break;
        default: break;
      }
    } else {
      radio.say('repairs', { prob: 0.7 });
    }
  }

  // ----------------------------------------------------------- public API ---

  /**
   * Create (or resume) the AudioContext. MUST be called from a user gesture.
   * Before this, every other method is a silent no-op.
   */
  function resume() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;   // headless / unsupported: stay silently inert
    ctx = new AC({ latencyHint: 'interactive' });
    buildGraph();
    buildBuffers();
    applyMaster();
    if (ctx.state === 'suspended') ctx.resume();
    radio.load(ctx, voiceBus);
    installHoverTicks();
    if (phase === 'garage') garageToneStart();
    installDebugSurface();
  }

  /**
   * Subscribe to game events. Safe to call before resume() — handlers no-op
   * until the context exists.
   * @param {{on: (ev: string, fn: Function) => Function}} bus injected event bus
   */
  function bindBus(bus) {
    bus.on('shell:fired', (e) => { if (ctx) onShellFired(e); });
    bus.on('shell:hit', (e) => { if (ctx) onShellHit(e); });
    // Shells that terminate in the world (dirt/rubble) were silent before the
    // SOUND overhaul — fx already keyed off this event, audio now does too.
    bus.on('shell:expired', (e) => {
      if (ctx && e && e.hitTerrain && e.pos) dirtImpact(e.pos[0], e.pos[1], e.pos[2]);
    });
    bus.on('player:reload', (e) => {
      if (!ctx || !e || !e.done) return;
      reloadReadySound();
      // Loader calls it every time (WoT "Loaded!"); the 3 s line cooldown and
      // multi-second reloads keep it from ever spamming.
      radio.say('reloaded');
    });
    bus.on('tank:destroyed', (e) => { if (ctx) onTankDestroyed(e); });
    // gameplay_feel r2: blocked-drive collision feedback (state.js emits once
    // per genuine hit, 5.4 km/h closing-speed floor)
    bus.on('tank:impact', (e) => { if (ctx) onTankImpact(e); });
    bus.on('prop:crushed', (e) => { if (ctx) onPropCrushed(e); }); // gameplay_feel r6
    bus.on('tank:fire', (e) => {
      if (!ctx) return;
      if (e.burning) startFireLoop(e.id); else stopFireLoop(e.id);
      if (playerId != null && e.id === playerId) {
        if (e.burning && !playerBurning) {
          playerBurning = true;
          startFireAlarm();
          radio.say('fire');
        } else if (!e.burning && playerBurning) {
          playerBurning = false;
          stopFireAlarm();
          radio.say('fire_out', { prob: 0.8 });
        }
      }
    });
    // Module damage/repair (alarms + crew calls + track-snap world sound).
    bus.on('module:state', (e) => { if (ctx && e) onModuleState(e); });
    // Spotting: the crew calls out NEW enemy contacts made by the player team.
    bus.on('tank:spotted', (e) => {
      if (!ctx || !e || phase !== 'battle') return;
      if (e.team !== 'player') return;
      const info = tankInfo.get(e.id);
      if (info && info.team === 'enemy') radio.say('enemy_spotted');
    });
    bus.on('ui:click', () => { if (ctx) uiClick(); });
    // Phase flow: battle horn + crew move-out / garage workshop room tone.
    bus.on('phase:change', (e) => {
      const next = (e && e.phase) || 'garage';
      const prev = phase;
      phase = next;
      battleOver = false;
      if (!ctx) return;
      if (next === 'battle' && prev !== 'battle') {
        garageToneStop();
        moduleState.clear();
        heartbeatArmedBelow = 0;
        battleHorn();
        setTimeout(() => { if (phase === 'battle') radio.say('on_the_move', { prob: 0.9 }); }, 1400);
      } else if (next === 'garage' && prev !== 'garage') {
        stopFireAlarm();
        stopTraverseRig();
        radio.silence();
        playerBurning = false;
        garageToneStart();
      }
    });
    bus.on('battle:ended', (e) => {
      if (!ctx || battleOver) return;
      battleOver = true;
      stopFireAlarm();
      resultFanfare(e && e.result ? e.result : 'draw');
    });
    // KILL-CAM: replay slow-mo ducks the battle beds under the narration.
    bus.on('killcam:begin', () => {
      if (!ctx) return;
      duckK = 0.35;
      applyChannelVolumes(true);
    });
    bus.on('killcam:done', () => {
      if (!ctx) return;
      duckK = 1;
      applyChannelVolumes(true);
    });
    // PAUSE (Esc overlay over a live battle — main.js tick edge): duck the
    // battle beds to near-silence, restore on resume. pauseK is tracked even
    // before the context exists so a later resume() builds the graph with
    // the correct level (buildGraph -> applyChannelVolumes reads it).
    bus.on('ui:pause', (e) => {
      pauseK = e && e.on ? 0.04 : 1;
      if (ctx) applyChannelVolumes(true);
    });
    // SOUND SETTINGS: live channel-mix updates from the settings panel sliders.
    bus.on('ui:volumes', (v) => {
      if (!v) return;
      _uiVolEvents++;
      if (typeof v.master === 'number') setMasterVolume(v.master);
      chanVol.engine = clamp01(v.engine, chanVol.engine);
      chanVol.combat = clamp01(v.combat, chanVol.combat);
      chanVol.ambience = clamp01(v.ambience, chanVol.ambience);
      chanVol.ui = clamp01(v.ui, chanVol.ui);
      chanVol.voice = clamp01(v.voice, chanVol.voice);
      if (typeof v.alarmHeartbeat === 'boolean') alarmHeartbeatOn = v.alarmHeartbeat;
      applyChannelVolumes(true);
    });
  }

  /**
   * Per-frame update: listener pose, engine loop pitch/spatialization,
   * fire loop spatialization, voice pruning, traverse whir, landing thumps,
   * critical-HP alarm, radio queue.
   * @param {number} dt render delta, seconds (audio runs on its own clock)
   * @param {{pos: {x,y,z}, forward: {x,y,z}}} listener camera pose
   * @param {Array<object>} tanks all TankEntity objects (alive and dead)
   */
  function update(dt, listener, tanks) {
    if (!ctx) return;
    // Refresh listener pose (XZ forward, normalized defensively).
    lx = listener.pos.x; ly = listener.pos.y; lz = listener.pos.z;
    const fx = listener.forward.x, fz = listener.forward.z;
    const fl = Math.sqrt(fx * fx + fz * fz);
    if (fl > 0.001) { lfx = fx / fl; lfz = fz / fl; }
    listenerValid = true;

    // Prune finished one-shots.
    const now = ctx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end <= now || voices[i].dead) { disposeVoice(voices[i]); voices.splice(i, 1); }
    }

    radio.update();

    if (!tanks) return;

    for (let i = 0; i < tanks.length; i++) {
      const ent = tanks[i];
      // Deferred battle staging leaves roster shells in game.tanks while the
      // garage is open; they intentionally have no simulation state yet.
      // Audio must ignore them until setupBattle supplies a world position.
      if (!ent || !ent.state || !ent.state.pos) continue;
      const id = ent.id;
      // Roster mirror for listener-side event decisions (spotted voice,
      // track-snap position) — no emitter-side changes needed.
      let info = tankInfo.get(id);
      if (!info) { info = { team: ent.team, isPlayer: !!ent.isPlayer, pos: ent.state.pos }; tankInfo.set(id, info); }
      else { info.team = ent.team; info.isPlayer = !!ent.isPlayer; info.pos = ent.state.pos; }
      if (ent.isPlayer) playerId = id;

      const dead = !!(ent.combat && ent.combat.destroyed);
      const eng = engines.get(id);
      if (eng) {
        if (dead) { eng.kill(); engines.delete(id); landing.delete(id); continue; }
        const dist = eng.update(ent);
        if (dist > ENGINE_HEAR_OUT_M && !ent.isPlayer) {
          eng.kill();
          engines.delete(id);
          landing.delete(id);
        }
      } else if (!dead) {
        const pos = ent.state.pos;
        const s = spat(pos.x, pos.y, pos.z);
        if ((s.dist < ENGINE_HEAR_IN_M && engines.size < MAX_ENGINE_VOICES) || ent.isPlayer) {
          const nv = createEngineVoice(ent);
          nv.update(ent);
          engines.set(id, nv);
        }
      }

      // Suspension landing detection for engine-audible tanks: a fast sink
      // that suddenly stops is a hard landing (listener-side, no sim hooks).
      if (!dead && engines.has(id) && dt > 0.0001) {
        const y = ent.state.pos.y;
        let tr = landing.get(id);
        if (!tr) { tr = { prevY: y, vy: 0, lastThumpT: -1 }; landing.set(id, tr); }
        else {
          const vy = (y - tr.prevY) / dt;
          // |vy| > 30 m/s is a teleport (battle staging/respawn), not physics.
          if (tr.vy < -LANDING_VY_MPS && tr.vy > -30 && vy > -0.6 &&
              now - tr.lastThumpT > 0.7) {
            tr.lastThumpT = now;
            suspensionThump(ent.state.pos.x, y, ent.state.pos.z, -tr.vy);
          }
          tr.vy = vy;
          tr.prevY = y;
        }
      }

      // Player-only mechanical + alarm state.
      if (ent.isPlayer && !dead && phase === 'battle') {
        if (!traverseRig) traverseRig = createTraverseRig();
        traverseRig.update(ent, dt);
        // Critical-HP heartbeat: a bounded pulse window per threshold
        // crossing (never a permanent drone), optional via settings.
        if (alarmHeartbeatOn && !battleOver && ent.combat && ent.combat.maxHp > 0) {
          const frac = ent.combat.hp / ent.combat.maxHp;
          if (frac > HEARTBEAT_HP_FRAC) {
            heartbeatArmedBelow = 0;
          } else if (heartbeatArmedBelow === 0 || frac < heartbeatArmedBelow - 0.05) {
            heartbeatArmedBelow = frac;
            heartbeatPulse();
          }
        }
      }

      // Re-spatialize any burning-tank fire loop.
      const fire = fireLoops.get(id);
      if (fire) {
        const pos = ent.state.pos;
        const s = spat(pos.x, pos.y, pos.z);
        fire.out.gain.setTargetAtTime(s.gain, now, 0.15);
        fire.pan.pan.setTargetAtTime(s.pan, now, 0.15);
      }
    }
  }

  /**
   * Set master volume.
   * @param {number} v 0..1
   */
  function setMasterVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    applyMaster();
  }

  /**
   * Mute / unmute everything (volume setting is preserved).
   * @param {boolean} m
   */
  function mute(m) {
    muted = !!m;
    applyMaster();
  }

  /** Play the garage music sting (short synthesized brass/timpani hit). */
  function playGarageSting() {
    if (!ctx) return;
    garageSting();
  }

  /**
   * Toggle the ambient bed: wind + sparse seeded bird chirps.
   * @param {boolean} on
   */
  function ambientOn(on) {
    if (!ctx) return;
    if (on) ambientStart(); else ambientStop();
  }

  // ---------------------------------------------------------- debug surface ---

  // Verification-only introspection for tools/audio-probe.mjs: a PCM tap on
  // the master output plus the radio's play log. Zero cost until startTap().
  let tap = null;
  function installDebugSurface() {
    if (typeof window === 'undefined') return;
    window.__COT_AUDIO = {
      get ctx() { return ctx; },
      get voiceLog() { return radio.log; },
      get voicesLoaded() { return radio.loaded; },
      // force: the probe tests the BUS level, not the radio discipline —
      // cooldowns must never turn a slider check into a false silence.
      sayVoice(id) { return radio.say(id, { force: true }); },
      startTap(maxS = 40) {
        if (!ctx || tap) return false;
        const sp = ctx.createScriptProcessor(4096, 2, 2);
        const sink = ctx.createGain();
        sink.gain.value = 0;
        master.connect(sp);
        sp.connect(sink);
        sink.connect(ctx.destination);
        const maxChunks = Math.ceil((maxS * ctx.sampleRate) / 4096);
        const chunks = [];
        sp.onaudioprocess = (ev) => {
          if (chunks.length >= maxChunks) return;
          const l = ev.inputBuffer.getChannelData(0);
          const r = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : l;
          const out = new Int16Array(l.length * 2);
          for (let i = 0; i < l.length; i++) {
            out[i * 2] = Math.max(-32768, Math.min(32767, (l[i] * 32767) | 0));
            out[i * 2 + 1] = Math.max(-32768, Math.min(32767, (r[i] * 32767) | 0));
          }
          chunks.push(out);
        };
        tap = { sp, sink, chunks, data: null };
        return true;
      },
      stopTap() {
        if (!tap) return 0;
        try { master.disconnect(tap.sp); } catch (_) { /* detached */ }
        try { tap.sp.disconnect(); tap.sink.disconnect(); } catch (_) { /* detached */ }
        tap.sp.onaudioprocess = null;
        let n = 0;
        for (const c of tap.chunks) n += c.length;
        const all = new Int16Array(n);
        let o = 0;
        for (const c of tap.chunks) { all.set(c, o); o += c.length; }
        tap.data = all;
        tap.chunks = [];
        return n;   // total Int16 samples (interleaved stereo)
      },
      readTapB64(offset, count) {
        if (!tap || !tap.data) return '';
        const view = tap.data.subarray(offset, offset + count);
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(s);
      },
      clearTap() { tap = null; },
      get sampleRate() { return ctx ? ctx.sampleRate : 0; },
      busGains() {
        if (!ctx) return null;
        return {
          master: master.gain.value,
          sfx: sfxBus.gain.value,
          engine: engineBus.gain.value,
          ambient: ambientBus.gain.value,
          music: musicBus.gain.value,
          voice: voiceBus.gain.value,
          chanVol: { ...chanVol },
          pauseK, // PAUSE duck factor (tools/pause-probe.mjs)
          uiVolEvents: _uiVolEvents,
        };
      },
      // Raw node handles — probe-only introspection, never used by the game.
      get _nodes() { return { master, comp, sfxBus, engineBus, ambientBus, musicBus, voiceBus }; },
    };
  }

  return {
    resume, bindBus, update, setMasterVolume, mute, playGarageSting, ambientOn,
    /** Non-spatial player result cue; preserves pen/ricochet/nonpen identity. */
    hitConfirm(kind, damage = 0) { if (ctx) hitConfirmSound(kind, damage); },
  };
}
