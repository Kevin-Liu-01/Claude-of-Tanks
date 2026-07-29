/**
 * src/audio/audio.js — fully synthesized WebAudio for Claude of Tanks.
 *
 * Everything is generated at runtime: oscillators, seeded noise buffers, filter
 * sweeps. No assets, no fetch. The AudioContext is created lazily inside
 * `resume()` (user gesture); before that every method is a silent no-op so the
 * headless screenshot harness never touches audio hardware.
 *
 * Contract: ARCHITECTURE.md §3.9.
 *   - distance gain  = clamp(10/dist, 0, 1)^2
 *   - equal-power stereo pan from listener-relative azimuth (StereoPannerNode)
 *   - max ~24 simultaneous one-shot voices, steal oldest
 */

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const MAX_VOICES = 24;
const SPEED_OF_SOUND_MPS = 340;
const ENGINE_HEAR_IN_M = 120;   // start an engine loop when a tank comes this close
const ENGINE_HEAR_OUT_M = 140;  // stop it when it drifts beyond this (hysteresis)
const MAX_ENGINE_VOICES = 8;
const MIN_WHIZZ_SPEED_MPS = 300;
const WHIZZ_MAX_MISS_M = 15;

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
 * }} Audio interface per ARCHITECTURE.md §3.9.
 */
export function createAudio() {
  /** @type {AudioContext|null} */
  let ctx = null;
  let master = null;      // final volume gain
  let comp = null;        // safety compressor (24 voices never clip)
  let sfxBus = null, engineBus = null, ambientBus = null, musicBus = null;
  let whiteBuf = null;    // 2 s seeded white noise, looped everywhere
  let crackleBuf = null;  // sparse impulse train for fire crackle / debris
  let windBuf = null;     // pink-ish noise for wind bed

  let masterVolume = 0.8;
  let muted = false;

  // SOUND SETTINGS (controls_gunnery r2): channel mix persisted by the
  // settings panel (cot.settings.v1) and live-updated via 'ui:volumes'.
  const chanVol = { engine: 1, combat: 1, ambience: 1, ui: 1 };
  const clamp01 = (v, d) => (typeof v === 'number' ? Math.max(0, Math.min(1, v)) : d);
  try {
    const s = JSON.parse(localStorage.getItem('cot.settings.v1') || 'null');
    if (s && typeof s === 'object') {
      masterVolume = clamp01(s.volMaster, masterVolume);
      chanVol.engine = clamp01(s.volEngine, 1);
      chanVol.combat = clamp01(s.volCombat, 1);
      chanVol.ambience = clamp01(s.volAmbience, 1);
      chanVol.ui = clamp01(s.volUi, 1);
    }
  } catch (_) { /* private mode */ }
  function applyChannelVolumes(smooth) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (bus, v) => (smooth ? bus.gain.setTargetAtTime(v, t, 0.03) : (bus.gain.value = v));
    set(sfxBus, 1.0 * chanVol.combat);
    set(engineBus, 0.75 * chanVol.engine);
    set(ambientBus, 0.55 * chanVol.ambience);
    set(musicBus, 0.9 * chanVol.ui);
  }

  const rng = mulberry32(9001);

  // Listener pose (world space), refreshed each update().
  let lx = 0, ly = 0, lz = 0;   // position
  let lfx = 0, lfz = 1;         // forward (XZ, normalized-ish)
  let listenerValid = false;

  /** Active one-shot voices: { start, end, in: GainNode, pan, sources[], dead } */
  const voices = [];
  /** tankId -> engine loop voice */
  const engines = new Map();
  /** tankId -> burning-fire loop */
  const fireLoops = new Map();
  /** Ambient wind nodes (null when off). */
  let windRig = null;
  let birdTimerId = null;

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
  }

  function applyMaster() {
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.02);
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
   * Layered gunshot by caliber class: ≤76 mm sharp crack, ≤105 mm boom,
   * ≥120 mm heavy boom. Noise burst layers + 40–60 Hz sine thump, lowpassed
   * and delayed by distance.
   */
  function gunshot(x, y, z, caliberMm) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const heavy = caliberMm >= 120;
    const medium = !heavy && caliberMm > 76;
    const dur = heavy ? 1.5 : medium ? 0.9 : 0.5;
    const v = spawnVoice(when, dur, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);

    if (heavy) {
      // Body boom.
      wire(v, nsrc(v, when, 0.7), flt('lowpass', 950, 0.7), env(when, 0.006, 1.15, 0.55), lp);
      // Sharp muzzle crack.
      wire(v, nsrc(v, when, 0.2), flt('highpass', 1200, 0.7), env(when, 0.002, 0.7, 0.09), lp);
      // Deep thump 42 → 28 Hz.
      const sub = osrc(v, 'sine', 42, when, 0.7);
      sub.frequency.exponentialRampToValueAtTime(28, when + 0.45);
      wire(v, sub, env(when, 0.006, 1.15, 0.55), lp);
      // Long rolling rumble.
      wire(v, nsrc(v, when, 1.3), flt('lowpass', 220, 0.6), env(when, 0.02, 0.8, 1.0), lp);
    } else if (medium) {
      wire(v, nsrc(v, when, 0.45), flt('lowpass', 2300, 0.8), env(when, 0.005, 1.0, 0.3), lp);
      wire(v, nsrc(v, when, 0.15), flt('highpass', 1600, 0.7), env(when, 0.002, 0.6, 0.06), lp);
      const sub = osrc(v, 'sine', 52, when, 0.45);
      sub.frequency.exponentialRampToValueAtTime(36, when + 0.3);
      wire(v, sub, env(when, 0.005, 0.9, 0.32), lp);
    } else {
      wire(v, nsrc(v, when, 0.25), flt('highpass', 900, 0.7), env(when, 0.003, 1.0, 0.13), lp);
      wire(v, nsrc(v, when, 0.2), flt('bandpass', 3200, 1.2), env(when, 0.002, 0.55, 0.07), lp);
      const sub = osrc(v, 'sine', 60, when, 0.25);
      sub.frequency.exponentialRampToValueAtTime(44, when + 0.15);
      wire(v, sub, env(when, 0.004, 0.5, 0.16), lp);
    }
  }

  // -------------------------------------------------------------- impacts ---

  /**
   * Hull-on-obstacle thud (gameplay_feel r2): dull lowpassed noise burst +
   * one low inharmonic partial — 60 tons meeting masonry, NOT the
   * penetration clang (no ring partials). Gain scales with closing speed.
   */
  function onTankImpact(e) {
    const s = spat(e.pos[0], e.pos[1], e.pos[2]);
    const k = Math.min(1, e.speedMps / 12);
    if (s.gain * k < 0.002) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.5, s.gain * (0.4 + 0.6 * k), s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.12), flt('lowpass', 420, 0.7), env(when, 0.002, 0.9, 0.1), lp);
    wire(v, osrc(v, 'triangle', 138, when, 0.22), env(when, 0.002, 0.5 * k, 0.18), lp);
    wire(v, nsrc(v, when, 0.05), flt('bandpass', 1400, 1.1), env(when, 0.001, 0.35 * k, 0.04), lp);
  }

  /** Armor penetration clang: inharmonic metal partials + transient. */
  function clang(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.8, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    const partials = [812, 1378, 2466, 3417, 5124];
    const gains = [1.0, 0.7, 0.5, 0.34, 0.2];
    const decays = [0.55, 0.42, 0.3, 0.22, 0.14];
    for (let i = 0; i < partials.length; i++) {
      const detune = 1 + (rng() - 0.5) * 0.012;
      wire(v, osrc(v, 'triangle', partials[i] * detune, when, decays[i] + 0.1),
        env(when, 0.001, gains[i] * 0.6, decays[i]), lp);
    }
    // Impact transient.
    wire(v, nsrc(v, when, 0.06), flt('highpass', 2400, 0.7), env(when, 0.001, 0.9, 0.03), lp);
    // Interior body thud.
    wire(v, nsrc(v, when, 0.18), flt('lowpass', 500, 0.7), env(when, 0.003, 0.6, 0.14), lp);
  }

  /**
   * Ricochet / non-pen ping: descending whine with vibrato.
   * @param {boolean} deflected true = ricochet (long whine), false = nonpen thud+ping
   */
  function ping(x, y, z, deflected) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, deflected ? 0.7 : 0.45, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    // Metallic tick.
    wire(v, nsrc(v, when, 0.04), flt('highpass', 3000, 0.7), env(when, 0.001, 0.8, 0.02), lp);
    // Whine: sine sweeping down with fast vibrato.
    const f0 = 2500 * (0.9 + rng() * 0.25);
    const dur = deflected ? 0.55 : 0.3;
    const whine = osrc(v, 'sine', f0, when, dur);
    whine.frequency.exponentialRampToValueAtTime(deflected ? 750 : 1100, when + dur);
    const vib = osrc(v, 'sine', 27, when, dur);
    const vibG = ctx.createGain();
    vibG.gain.value = 45;
    vib.connect(vibG);
    vibG.connect(whine.frequency);
    wire(v, whine, env(when, 0.004, deflected ? 0.5 : 0.35, dur), lp);
    // Short ring partial.
    wire(v, osrc(v, 'triangle', 1900 * (0.95 + rng() * 0.1), when, 0.2),
      env(when, 0.001, 0.25, 0.15), lp);
    if (!deflected) {
      // Blunt shell shatter thud.
      wire(v, nsrc(v, when, 0.15), flt('lowpass', 750, 0.7), env(when, 0.002, 0.6, 0.12), lp);
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

  /**
   * Non-spatial hit-confirm blip for the PLAYER's own shells (WoT "your shot
   * connected" feedback, layered on top of the 3-D impact sound at the target).
   * @param {boolean} pen true = damaging hit (bright two-tone dink);
   *                      false = bounce/absorb (short dull knock)
   */
  function hitConfirmSound(pen) {
    if (!ctx) return;
    const when = ctx.currentTime + 0.01;
    if (pen) {
      const v = spawnVoice(when, 0.3, 0.5, 0, sfxBus);
      wire(v, osrc(v, 'triangle', 1560, when, 0.09), env(when, 0.002, 0.5, 0.07));
      wire(v, osrc(v, 'triangle', 2140, when + 0.055, 0.12), env(when + 0.055, 0.002, 0.42, 0.1));
      wire(v, nsrc(v, when, 0.03), flt('highpass', 4200, 0.8), env(when, 0.001, 0.25, 0.02));
    } else {
      const v = spawnVoice(when, 0.22, 0.42, 0, sfxBus);
      const o = osrc(v, 'square', 340, when, 0.1);
      o.frequency.exponentialRampToValueAtTime(210, when + 0.09);
      wire(v, o, flt('lowpass', 900, 0.8), env(when, 0.002, 0.5, 0.09));
      wire(v, nsrc(v, when, 0.04), flt('bandpass', 1200, 1.2), env(when, 0.001, 0.3, 0.035));
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

  // --------------------------------------------------------- engine loops ---

  function createEngineVoice(entity) {
    const isTurbine = entity.specId === 'm1a2';
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
        const p = 0.8 + 0.6 * frac;                      // RPM pitch — §3.9
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
        const load = 0.5 + 0.5 * frac;
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
    gunshot(mp[0], mp[1], mp[2], e.caliberMm);
    if (!e.isPlayer) scheduleWhizz(e);
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
  }

  function onTankDestroyed(e) {
    const p = e.pos;
    explosion(p[0], p[1], p[2], 1.8, false, true);
    const eng = engines.get(e.id);
    if (eng) { eng.kill(); engines.delete(e.id); }
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
  }

  /**
   * Subscribe to game events. Safe to call before resume() — handlers no-op
   * until the context exists.
   * @param {{on: (ev: string, fn: Function) => Function}} bus injected event bus
   */
  function bindBus(bus) {
    bus.on('shell:fired', (e) => { if (ctx) onShellFired(e); });
    bus.on('shell:hit', (e) => { if (ctx) onShellHit(e); });
    bus.on('tank:destroyed', (e) => { if (ctx) onTankDestroyed(e); });
    // gameplay_feel r2: blocked-drive collision feedback (state.js emits once
    // per genuine hit, 5.4 km/h closing-speed floor)
    bus.on('tank:impact', (e) => { if (ctx) onTankImpact(e); });
    bus.on('tank:fire', (e) => {
      if (!ctx) return;
      if (e.burning) startFireLoop(e.id); else stopFireLoop(e.id);
    });
    bus.on('ui:click', () => { if (ctx) uiClick(); });
    // SOUND SETTINGS (controls_gunnery r2): live channel-mix updates from the
    // settings panel sliders.
    bus.on('ui:volumes', (v) => {
      if (!v) return;
      if (typeof v.master === 'number') setMasterVolume(v.master);
      chanVol.engine = clamp01(v.engine, chanVol.engine);
      chanVol.combat = clamp01(v.combat, chanVol.combat);
      chanVol.ambience = clamp01(v.ambience, chanVol.ambience);
      chanVol.ui = clamp01(v.ui, chanVol.ui);
      applyChannelVolumes(true);
    });
  }

  /**
   * Per-frame update: listener pose, engine loop pitch/spatialization,
   * fire loop spatialization, voice pruning.
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

    if (!tanks) return;

    for (let i = 0; i < tanks.length; i++) {
      const ent = tanks[i];
      const id = ent.id;
      const dead = !!(ent.combat && ent.combat.destroyed);
      const eng = engines.get(id);
      if (eng) {
        if (dead) { eng.kill(); engines.delete(id); continue; }
        const dist = eng.update(ent);
        if (dist > ENGINE_HEAR_OUT_M && !ent.isPlayer) {
          eng.kill();
          engines.delete(id);
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

  return {
    resume, bindBus, update, setMasterVolume, mute, playGarageSting, ambientOn,
    /** Non-spatial player hit-confirm blip. @param {boolean} pen damaging hit */
    hitConfirm(pen) { if (ctx) hitConfirmSound(pen); },
  };
}
