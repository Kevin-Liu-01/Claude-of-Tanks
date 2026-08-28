/**
 * src/audio/audio.js — the Claude of Tanks sound system (COMBAT-SFX r4).
 *
 * COMBAT one-shots (cannon fire, penetrations, deflections, HE bursts, tank
 * explosions) play BAKED layered samples: dense seeded PCM synthesized
 * offline by tools/make-sfx.mjs (100% procedural — CC0 by construction, no
 * recordings), mastered through ffmpeg (saturation/EQ/limiting for weight)
 * into ~30 small Opus files under public/audio/sfx/. They load lazily at
 * resume() exactly like the crew radio (src/audio/voices.ts — the other
 * sampled category, tools/make-voices.mjs); until/unless the whole set
 * decodes, the pre-r2 live-synthesis paths below remain active as a complete
 * fallback (all-or-nothing — never a mixed old/new combat mix). Everything
 * else (engines, traverse, ambience, UI, alarms, fanfares) is still generated
 * live: oscillators, seeded noise buffers, filter sweeps. The AudioContext is
 * created lazily inside `resume()` (user gesture); before that every method
 * is a silent no-op so the headless screenshot harness never touches audio
 * hardware.
 *
 * Contract: ARCHITECTURE.md §3.9.
 *   - distance gain  = clamp(22/dist, 0, 1)^1.5 plus distance lowpass
 *     (tank-death explosions — the biggest sound in the game — carry further:
 *     clamp(26/dist,0,1)^1.6)
 *   - equal-power stereo pan from listener-relative azimuth (StereoPannerNode)
 *   - max ~24 simultaneous one-shot voices, steal oldest
 *   - bus graph: {combat, cinematic, engine, ambience, ui, voice} → compressor →
 *     soft-clip stage → master (the tanh waveshaper is the COMBAT-SFX r4
 *     volley guard: a 7v7 simultaneous barrage saturates musically instead
 *     of folding into digital clip crackle)
 *
 * Baked combat layering (COMBAT-SFX r4):
 *   - cannon fire = sub punch + crack/report + rumble tail per caliber class
 *     (small ≤76 mm | medium ≤105 | large ≤130 | huge >130). Near shots get
 *     all layers; far shots collapse to the tail (+ the distance lowpass), so
 *     distant guns read as rolling thunder. The player's own gun runs a
 *     hotter sub layer. ±4% playbackRate jitter + per-layer start-offset
 *     randomization keep repeats from ever sounding identical.
 *   - pen = clang+thud+debris sample; taking a damaging hit adds a low
 *     interior whump layer. Ricochet = 3 whining piiing variants, no low end
 *     BY DESIGN (a bounce must never thud like a pen). Non-pen = dull thunk.
 *   - tank destruction by cause: 'ammorack' = core blast + debris rain +
 *     turret-pop deep accent; 'shot' = core + debris, slightly smaller;
 *     'fire' burn-out = muffled cook-off whump.
 *
 * What lives where:
 *   - combat one-shots (gunfire by caliber class, penetration clang, ricochet
 *     zing variants, HE / destruction, track snap, dirt splash)  → sfxBus
 *   - slowed kill-cam destruction replay                       → cinematicBus
 *   - engine loops (diesel/turbine character), turret-traverse whir,
 *     suspension landing thumps                                   → engineBus
 *   - wind/birds battle bed, garage workshop room tone            → ambientBus
 *   - UI ticks, battle horn, kill sting, result fanfares, sting   → musicBus
 *   - crew radio lines + tank alarms (fire klaxon, ammo-rack beep,
 *     critical-HP heartbeat)                                      → voiceBus
 */

import { createVoiceRadio } from './voices.ts';
import { isEraActivation } from '../game/eraActivation.ts';

/**
 * Baked combat sample map: log/debug name → file under public/audio/sfx/.
 * tools/make-sfx.mjs imports this in --verify to guarantee the baked payload
 * and the runtime mapping never drift (same pattern as VOICE_LINES).
 */
export const SFX_FILES = {};
for (const cls of ['small', 'medium', 'large', 'huge']) {
  for (const layer of ['sub', 'crack', 'tail']) {
    SFX_FILES[`fire_${cls}_${layer}`] = `fire_${cls}_${layer}.ogg`;
  }
}
for (const n of [
  'impact_pen_a', 'impact_pen_b', 'hit_whump',
  'ricochet_a', 'ricochet_b', 'ricochet_c',
  'impact_absorb_a', 'impact_absorb_b',
  'expl_tank_core_a', 'expl_tank_core_b', 'expl_tank_debris',
  'expl_turret_pop', 'expl_burnout',
  'expl_he_a', 'expl_he_b', 'impact_dirt', 'era_pop',
]) SFX_FILES[n] = `${n}.ogg`;

export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/** Web Audio rejects negative/past automation times, including at startup. */
export function safeAudioStart(now, scheduled, leadS = 0.001) {
  return Math.max(0, Number(now) + leadS, Number(scheduled));
}

const MAX_VOICES = 24;
const SPEED_OF_SOUND_MPS = 340;
// The battlefield must retain an audible horizon. Distance still lowers and
// darkens sources aggressively, but it must not hard-mute a tank just beyond
// brawling range. The old 18 m / 1.65 curve plus a 140 m engine cutoff made
// most of a 7v7 battle disappear from the mix.
export const AUDIO_DISTANCE_MODEL = Object.freeze({
  referenceM: 22,
  rolloff: 1.5,
  engineHearInM: 900,
  engineHearOutM: 1000,
  maxEngineVoices: 10,
  activeEngineBiasM: 24,
});

export const AUDIO_PERSPECTIVE_MIX = Object.freeze({
  arcade: Object.freeze({
    engineGain: 1,
    engineCutoffHz: 18000,
    enginePanScale: 1,
    cannonGain: 1,
    cannonDistanceBiasM: 0,
  }),
  // The gunner's sight is an interior/headset perspective: pressure and
  // machinery remain strong, while exposed track hiss and muzzle crack are
  // filtered and centered. Scope must never behave like a volume mute.
  sniper: Object.freeze({
    engineGain: 1.18,
    engineCutoffHz: 650,
    enginePanScale: 0.15,
    cannonGain: 0.98,
    cannonDistanceBiasM: 220,
  }),
});

// The mix contract is exported so offline tests can guard the two failure
// modes players actually hear: a crushed, always-loud mix and bright narrow
// resonances that turn armor into kitchenware.
export const AUDIO_MIX_PROFILE = Object.freeze({
  compressorThresholdDb: -8,
  compressorRatio: 3,
  compressorAttackS: 0.012,
  compressorReleaseS: 0.18,
  limiterKnee: 0.78,
  combatBodyHz: 360,
  combatBodyGainDb: 1.5,
  combatPresenceHz: 2700,
  combatPresenceGainDb: -2.4,
  combatCeilingHz: 14500,
});

export const ENGINE_SOUND_PROFILES = Object.freeze({
  legacyDiesel: Object.freeze({
    kind: 'legacyDiesel', baseHz: 38, toneCutoffHz: 620,
    pulseGain: 0.10, subGain: 0.13, intakeHz: 155, intakeGain: 0.17,
    wobbleDepthHz: 2.8, trackHz: 470, trackQ: 0.72, trackGain: 0.13,
    clatterHz: 350, clatterGain: 0.18, whineGain: 0,
  }),
  modernDiesel: Object.freeze({
    kind: 'modernDiesel', baseHz: 46, toneCutoffHz: 780,
    pulseGain: 0.085, subGain: 0.12, intakeHz: 230, intakeGain: 0.19,
    wobbleDepthHz: 1.5, trackHz: 540, trackQ: 0.72, trackGain: 0.11,
    clatterHz: 410, clatterGain: 0.15, whineGain: 0,
  }),
  lightDiesel: Object.freeze({
    kind: 'lightDiesel', baseHz: 54, toneCutoffHz: 920,
    pulseGain: 0.075, subGain: 0.09, intakeHz: 290, intakeGain: 0.21,
    wobbleDepthHz: 1.2, trackHz: 620, trackQ: 0.78, trackGain: 0.09,
    clatterHz: 480, clatterGain: 0.13, whineGain: 0,
  }),
  turbine: Object.freeze({
    kind: 'turbine', baseHz: 62, toneCutoffHz: 1080,
    pulseGain: 0.035, subGain: 0.09, intakeHz: 420, intakeGain: 0.25,
    wobbleDepthHz: 0.35, trackHz: 520, trackQ: 0.74, trackGain: 0.10,
    clatterHz: 400, clatterGain: 0.14, whineGain: 0.065,
  }),
});

/** Resolve an audible powertrain family without adding fields to simulation. */
export function resolveEngineSoundProfile(specId, spec = null) {
  const id = String(specId || '').toLowerCase();
  if (/(^|_)(m1a\d?|abrams|t80|strv103)/.test(id) || /^(m1a|abrams|t80|strv103)/.test(id)) {
    return ENGINE_SOUND_PROFILES.turbine;
  }
  const role = String(spec && spec.role || '').toLowerCase();
  const mass = Number(spec && spec.weightTons);
  if (role === 'light' || role === 'ifv' || role === 'spaa' || (Number.isFinite(mass) && mass < 28)) {
    return ENGINE_SOUND_PROFILES.lightDiesel;
  }
  const era = String(spec && spec.era || '').toLowerCase();
  if (era === 'modern' || era === 'coldwar') return ENGINE_SOUND_PROFILES.modernDiesel;
  return ENGINE_SOUND_PROFILES.legacyDiesel;
}

export function worldDistanceGain(distanceM) {
  const d = Math.max(0.5, Number(distanceM) || 0.5);
  const g = Math.min(AUDIO_DISTANCE_MODEL.referenceM / d, 1);
  return Math.pow(g, AUDIO_DISTANCE_MODEL.rolloff);
}

export function distanceLowpassHz(distanceM) {
  const d = Math.max(0, Number(distanceM) || 0);
  return Math.max(450, Math.min(18000, 18000 * (40 / (40 + d))));
}

export function engineAudibleAtDistance(distanceM, alreadyActive = false) {
  if (!Number.isFinite(distanceM)) return false;
  const limit = alreadyActive
    ? AUDIO_DISTANCE_MODEL.engineHearOutM
    : AUDIO_DISTANCE_MODEL.engineHearInM;
  return distanceM <= limit;
}

const MAX_ENGINE_VOICES = AUDIO_DISTANCE_MODEL.maxEngineVoices;
const MIN_WHIZZ_SPEED_MPS = 300;
const WHIZZ_MAX_MISS_M = 15;
const LANDING_VY_MPS = 2.8;     // downward speed that reads as a hard landing
const TRAVERSE_RATE_FULL = 0.45; // rad/s of turret yaw ≈ full traverse-whir gain
const HEARTBEAT_HP_FRAC = 0.25; // critical-HP alarm threshold
const HEARTBEAT_WINDOW_S = 6;   // pulse window per threshold crossing (not a drone)

/** Rough muzzle velocities by shell type, for scheduling flyby whizzes (m/s). */
const WHIZZ_VEL_MPS = { AP: 800, APCR: 1080, HEAT: 1000, HE: 790, APFSDS: 1700 };

// Weapon-native reports for IFVs. These tune the existing baked pressure
// layers and add live mechanical/launcher detail; they do not duplicate
// samples per vehicle or move gameplay decisions into the audio system.
const DEFAULT_WEAPON_REPORT = Object.freeze({
  kind: 'cannon', rate: 1, gain: 1, crackGain: 1, tailGain: 1,
  mechanicalHz: 0, mechanicalGain: 0, toneHz: 0, hissGain: 0,
  durationS: 0, twin: false,
});

export const WEAPON_REPORT_PROFILES = Object.freeze({
  'm242-bushmaster': Object.freeze({ kind: 'autocannon', rate: 1.10, gain: 0.88, crackGain: 1.10, tailGain: 0.68, mechanicalHz: 1180, mechanicalGain: 0.22, toneHz: 0, hissGain: 0, durationS: 0.34, twin: false }),
  '2a42': Object.freeze({ kind: 'autocannon', rate: 0.97, gain: 0.96, crackGain: 1.02, tailGain: 0.78, mechanicalHz: 820, mechanicalGain: 0.25, toneHz: 0, hissGain: 0, durationS: 0.40, twin: false }),
  'mk30-2': Object.freeze({ kind: 'autocannon', rate: 0.92, gain: 1.03, crackGain: 1.08, tailGain: 0.86, mechanicalHz: 690, mechanicalGain: 0.22, toneHz: 0, hissGain: 0, durationS: 0.43, twin: false }),
  'kde-35': Object.freeze({ kind: 'autocannon', rate: 0.86, gain: 1.10, crackGain: 1.04, tailGain: 0.94, mechanicalHz: 610, mechanicalGain: 0.20, toneHz: 0, hissGain: 0, durationS: 0.47, twin: false }),
  'rarden-l21a1': Object.freeze({ kind: 'autocannon', rate: 0.80, gain: 1.12, crackGain: 0.96, tailGain: 0.92, mechanicalHz: 520, mechanicalGain: 0.30, toneHz: 0, hissGain: 0, durationS: 0.54, twin: false }),
  '2a72': Object.freeze({ kind: 'autocannon', rate: 1.02, gain: 0.91, crackGain: 0.98, tailGain: 0.70, mechanicalHz: 910, mechanicalGain: 0.20, toneHz: 0, hissGain: 0, durationS: 0.37, twin: false }),
  'twin-2a42': Object.freeze({ kind: 'autocannon', rate: 0.94, gain: 1.06, crackGain: 1.06, tailGain: 0.82, mechanicalHz: 740, mechanicalGain: 0.32, toneHz: 0, hissGain: 0, durationS: 0.44, twin: true }),
  'rh202': Object.freeze({ kind: 'autocannon', rate: 1.18, gain: 0.76, crackGain: 1.14, tailGain: 0.56, mechanicalHz: 1360, mechanicalGain: 0.18, toneHz: 0, hissGain: 0, durationS: 0.30, twin: false }),
  'bmp3-100mm': Object.freeze({ kind: 'cannon', rate: 1.05, gain: 0.96, crackGain: 0.92, tailGain: 0.84, mechanicalHz: 360, mechanicalGain: 0.12, toneHz: 0, hissGain: 0, durationS: 0.62, twin: false }),
  'tow-launch': Object.freeze({ kind: 'launcher', rate: 0.92, gain: 0.92, crackGain: 0, tailGain: 0, mechanicalHz: 260, mechanicalGain: 0.12, toneHz: 118, hissGain: 0.82, durationS: 1.15, twin: false }),
  'konkurs-launch': Object.freeze({ kind: 'launcher', rate: 0.86, gain: 0.88, crackGain: 0, tailGain: 0, mechanicalHz: 230, mechanicalGain: 0.10, toneHz: 104, hissGain: 0.76, durationS: 1.28, twin: false }),
  'spike-launch': Object.freeze({ kind: 'launcher', rate: 1.08, gain: 0.78, crackGain: 0, tailGain: 0, mechanicalHz: 410, mechanicalGain: 0.16, toneHz: 154, hissGain: 0.68, durationS: 0.94, twin: false }),
  'jyu-mat-launch': Object.freeze({ kind: 'launcher', rate: 0.98, gain: 0.84, crackGain: 0, tailGain: 0, mechanicalHz: 330, mechanicalGain: 0.14, toneHz: 132, hissGain: 0.72, durationS: 1.04, twin: false }),
  'milan-launch': Object.freeze({ kind: 'launcher', rate: 0.82, gain: 0.86, crackGain: 0, tailGain: 0, mechanicalHz: 210, mechanicalGain: 0.11, toneHz: 96, hissGain: 0.74, durationS: 1.34, twin: false }),
  'arkan-launch': Object.freeze({ kind: 'launcher', rate: 1.02, gain: 0.90, crackGain: 0, tailGain: 0, mechanicalHz: 290, mechanicalGain: 0.13, toneHz: 142, hissGain: 0.78, durationS: 1.02, twin: false }),
  'ataka-launch': Object.freeze({ kind: 'launcher', rate: 0.95, gain: 0.98, crackGain: 0, tailGain: 0, mechanicalHz: 300, mechanicalGain: 0.18, toneHz: 126, hissGain: 0.88, durationS: 1.18, twin: true }),
});

export function resolveWeaponReportProfile(id) {
  return WEAPON_REPORT_PROFILES[id] || DEFAULT_WEAPON_REPORT;
}

/** Build the mechanical cue sequence for one authoritative reload cycle. */
export function resolveReloadCuePlan(totalS, kind = 'shell', caliberMm = 100) {
  const total = Math.max(0.05, Number(totalS) || 0.05);
  const caliber = Math.max(12, Number(caliberMm) || 100);
  // The weapon report already contains rapid bolt/feed action. A separate
  // ready voice every 0.2-0.4 s only muddies the mix and burns audio voices.
  if (total < 0.55) return { profile: 'rapid', ready: false, cues: [] };
  if (kind === 'magazine') {
    return { profile: 'magazine', ready: true, cues: [
      { at: 0.02, type: 'motor' }, { at: 0.22, type: 'index' },
      { at: 0.48, type: 'index' }, { at: 0.74, type: 'index' },
      { at: 0.92, type: 'breechClose' },
    ] };
  }
  if (kind === 'intraClip') {
    return { profile: 'intraClip', ready: true, cues: [
      { at: 0.10, type: 'motor' }, { at: 0.48, type: 'index' },
      { at: 0.86, type: 'breechClose' },
    ] };
  }
  const cues = [
    { at: 0.015, type: 'breechOpen' },
    { at: Math.min(0.20, 0.72 / total), type: 'extract' },
    { at: 0.40, type: 'shellLift' },
  ];
  if (caliber >= 105 && total >= 4) cues.push({ at: 0.64, type: 'shellLift' });
  cues.push(
    { at: Math.max(0.72, 1 - 0.70 / total), type: 'ram' },
    { at: Math.max(0.86, 1 - 0.22 / total), type: 'breechClose' },
  );
  return { profile: 'shell', ready: true, cues };
}

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
 *   loadingOn: (on: boolean) => void,
 *   ambientOn: (on: boolean) => void,
 *   hitConfirm: (kind: string, damage?: number) => void,
 * }} Audio interface per ARCHITECTURE.md §3.9.
 */
/** @param {{ context?: AudioContext | null }} [options] */
export function createAudio({ context: initialContext = null } = {}) {
  /** @type {AudioContext|null} */
  let ctx = initialContext;
  let graphReady = false;
  let battleEventsWarmed = false;
  let bakedBattleEventsWarmed = false;
  let master = null;      // final volume gain
  let comp = null;        // safety compressor (24 voices never clip)
  let limiter = null;     // tanh soft-clip stage (COMBAT-SFX r4 volley guard)
  let sfxBus = null, cinematicBus = null, engineBus = null;
  let ambientBus = null, musicBus = null, voiceBus = null;
  let whiteBuf = null;    // 2 s seeded white noise, looped everywhere
  let crackleBuf = null;  // sparse impulse train for fire crackle / debris
  let windBuf = null;     // pink-ish noise for wind bed
  let gunBufs = null;     // pre-synthesized caliber beds (synth-fallback only)

  // BAKED COMBAT SAMPLES (COMBAT-SFX r4): decoded lazily after resume().
  /** @type {Map<string, AudioBuffer>} name → decoded sample */
  const sfxBufs = new Map();
  let sfxReady = false;    // ALL samples decoded — baked paths take over
  let sfxLoading = false;
  /** Probe trail (tools/sfx-smoke.mjs): {n,t,g,r} per baked sample played. */
  const sfxLog = [];
  let sfxSeq = 0;
  /** Replayed kill-cam impacts: auditable time-stretch/pitch trail. */
  const killcamSfxLog = [];

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
  // PAUSE DUCK ('ui:pause' from main.ts tick): while the Esc overlay freezes
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
    // Replayed impact audio must remain legible while the live battle bed is
    // ducked. It still obeys Combat, Master and Pause controls.
    set(cinematicBus, 1.0 * chanVol.combat * pauseK);
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
  let listenerKind = 'camera';
  let listenerOwnerId = null;
  let listenerScoped = false;

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
  // Reused nearest-emitter ranking. The cap protects CPU/headroom; ranking
  // guarantees it is the nearest battlefield, not roster order, that wins.
  const engineCandidates = new Array(MAX_ENGINE_VOICES).fill(null);
  const engineCandidateScore = new Float64Array(MAX_ENGINE_VOICES);
  let engineCandidateCount = 0;
  let probeEngineSoloId = null; // verification-only filter, set via __COT_AUDIO
  /** tankId -> burning-fire loop */
  const fireLoops = new Map();
  /** tankId -> {prevY, vy, lastThumpT} suspension landing tracker */
  const landing = new Map();
  /** Ambient wind nodes (null when off). */
  let windRig = null;
  let birdTimerId = null;
  /** Garage workshop room tone (null when off). */
  let garageRig = null;
  /** Battle-transition mechanical bed (null when off). */
  let loadingRig = null;
  /** Player turret-traverse / gun-elevation whir rig (null until battle). */
  let traverseRig = null;
  /** Alarm rigs (player only). */
  let fireAlarmRig = null;
  let heartbeatRig = null;
  let heartbeatArmedBelow = 0;   // last hp fraction that triggered a pulse window
  let playerBurning = false;
  let battleOver = false;
  let pendingResult = null;
  let reloadCalled = false;
  const reloadCycle = {
    active: false, total: 0, kind: 'ready', caliberMm: 100,
    lastT: 0, nextCue: 0, plan: null,
  };
  let lowHpCalled = false;
  let _uiVolEvents = 0;   // debug: ui:volumes deliveries (tools/audio-probe.mjs)
  const soundLog = [];
  let soundSeq = 0;

  function logSound(type, data = null) {
    soundLog.push({ seq: ++soundSeq, t: ctx ? ctx.currentTime : 0, type, ...(data || {}) });
    if (soundLog.length > 256) soundLog.shift();
  }

  // ---------------------------------------------------------------- graph ---

  function buildGraph() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = AUDIO_MIX_PROFILE.compressorThresholdDb;
    comp.knee.value = 12;
    comp.ratio.value = AUDIO_MIX_PROFILE.compressorRatio;
    comp.attack.value = AUDIO_MIX_PROFILE.compressorAttackS;
    comp.release.value = AUDIO_MIX_PROFILE.compressorReleaseS;

    // r4 leaves single-shot transients intact. Only dense simultaneous volleys
    // reach the soft knee; the former 0.55 knee and 8:1 compressor made every
    // report sound equally flat and metallic.
    limiter = ctx.createWaveShaper();
    {
      const N = 4097;
      const curve = new Float32Array(N);
      const knee = AUDIO_MIX_PROFILE.limiterKnee;
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        const a = Math.abs(x);
        curve[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
      }
      limiter.curve = curve;
      limiter.oversample = '2x';
    }

    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterVolume;
    comp.connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);

    // Combat tone shaping is broad and intentionally low-Q. It adds plate and
    // blast body, trims the old 2–6 kHz “tin can” emphasis, and keeps ultrasonic
    // procedural noise out of the limiter without making distant shots dull.
    const combatHp = flt('highpass', 27, 0.65);
    const combatBody = flt('peaking', AUDIO_MIX_PROFILE.combatBodyHz, 0.62);
    combatBody.gain.value = AUDIO_MIX_PROFILE.combatBodyGainDb;
    const combatPresence = flt('peaking', AUDIO_MIX_PROFILE.combatPresenceHz, 0.72);
    combatPresence.gain.value = AUDIO_MIX_PROFILE.combatPresenceGainDb;
    const combatCeiling = flt('lowpass', AUDIO_MIX_PROFILE.combatCeilingHz, 0.55);
    combatHp.connect(combatBody);
    combatBody.connect(combatPresence);
    combatPresence.connect(combatCeiling);
    combatCeiling.connect(comp);

    sfxBus = ctx.createGain();     sfxBus.gain.value = 1.0;   sfxBus.connect(combatHp);
    cinematicBus = ctx.createGain(); cinematicBus.gain.value = 1.0; cinematicBus.connect(combatHp);

    const enginePresence = flt('peaking', 1850, 0.68);
    enginePresence.gain.value = -3.2;
    const engineCeiling = flt('lowpass', 8200, 0.55);
    enginePresence.connect(engineCeiling); engineCeiling.connect(comp);
    engineBus = ctx.createGain();  engineBus.gain.value = 0.78; engineBus.connect(enginePresence);
    ambientBus = ctx.createGain(); ambientBus.gain.value = 0.55; ambientBus.connect(comp);
    musicBus = ctx.createGain();   musicBus.gain.value = 0.9;  musicBus.connect(comp);
    const voicePresence = flt('peaking', 2850, 0.78);
    voicePresence.gain.value = -1.4;
    voiceBus = ctx.createGain();   voiceBus.gain.value = 1.0;  voiceBus.connect(voicePresence);
    voicePresence.connect(comp);
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
    _sp.gain = worldDistanceGain(_sp.dist);
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
    const v = { start: when, end: when + durS, in: g, pan: p, sources: [], dead: false, baseGain: gainVal };
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
    return flt('lowpass', distanceLowpassHz(dist), 0.5);
  }

  /** Propagation delay for far events (capped so nothing feels broken). */
  function travelDelay(dist) {
    return dist > 40 ? Math.min(1.6, dist / SPEED_OF_SOUND_MPS) : 0;
  }

  // Air absorption already removes most detail at range. A modest tail carry
  // keeps 600–900 m guns readable as distant battlefield thunder after r4's
  // lower, cleaner layer mastering without lifting close shots at all.
  function cannonDistanceCarry(dist) {
    return 1 + 0.85 * Math.max(0, Math.min(1, (dist - 180) / 720));
  }

  // ------------------------------------------------- baked combat samples ---

  /**
   * Fetch + decode the baked combat set (public/audio/sfx/, built by
   * tools/make-sfx.mjs). Lazy like the crew radio — called from resume(), so
   * boot stays untouched. The baked paths only ever take over as a COMPLETE
   * set (sfxReady): a partial decode keeps the live-synthesis fallback for
   * everything rather than mixing old and new combat sounds.
   */
  function loadSfx() {
    if (sfxLoading || !ctx) return;
    sfxLoading = true;
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    const names = Object.keys(SFX_FILES);
    let failures = 0;
    Promise.all(names.map((name) =>
      fetch(`${base}audio/sfx/${SFX_FILES[name]}`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => { sfxBufs.set(name, buf); })
        .catch(() => { failures++; }),
    )).then(() => {
      sfxReady = failures === 0 && sfxBufs.size === names.length;
      if (!sfxReady) {
        console.warn(`[audio] ${failures} baked combat sample(s) failed to load — live-synthesis fallback stays active`);
      }
    });
  }

  /** ±4% playback-rate jitter — repeats never sound identical. */
  function jitterRate() { return 0.96 + rng() * 0.08; }

  /**
   * Start one baked sample on an existing voice, through `through` (usually
   * the shot's shared distance lowpass) with its own layer gain.
   * @returns {number} the layer's end time (ctx clock)
   */
  function sampleLayer(v, name, when, layerGain, rate, through) {
    const buf = sfxBufs.get(name);
    if (!buf) return when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = layerGain;
    src.connect(g);
    g.connect(through || v.in);
    const dur = buf.duration / rate;
    src.start(when);
    src.stop(when + dur + 0.05);
    v.sources.push(src);
    sfxLog.push({ seq: ++sfxSeq, n: name, t: when, g: v.baseGain * layerGain, r: rate });
    if (sfxLog.length > 200) sfxLog.shift();
    return when + dur;
  }

  /**
   * Kill-cam layer retime: the visual impact opens at full speed, eases into
   * its turret-launch slow-motion, holds, then recovers for the smoke settle.
   * AudioBufferSource playbackRate changes both duration and pitch, giving the
   * requested physically stretched cinematic sound instead of an unaffected
   * sample merely played under a slow picture.
   */
  function sampleLayerRetime(v, name, when, layerGain, slowRate, through) {
    const buf = sfxBufs.get(name);
    if (!buf) return when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const r = Math.max(0.4, Math.min(1, Number(slowRate) || 0.55));
    src.playbackRate.setValueAtTime(1, when);
    src.playbackRate.linearRampToValueAtTime(r, when + 0.42);
    src.playbackRate.setValueAtTime(r, when + 1.48);
    src.playbackRate.linearRampToValueAtTime(0.92, when + 2.0);
    const g = ctx.createGain();
    g.gain.value = layerGain;
    src.connect(g);
    g.connect(through || v.in);
    const dur = buf.duration / r + 0.25;
    src.start(when);
    src.stop(when + dur);
    v.sources.push(src);
    sfxLog.push({ seq: ++sfxSeq, n: name, t: when, g: v.baseGain * layerGain, r, killcam: true });
    if (sfxLog.length > 200) sfxLog.shift();
    return when + dur;
  }

  /**
   * Layered baked cannon shot (COMBAT-SFX r4). Near = sub punch + crack +
   * tail; far = tail-dominant (crack fades over ~45-180 m on top of the
   * distance lowpass). Player's own gun: hotter overall, more sub, plus the
   * mechanical action foley (breech clank at end of recoil, brass tinkle).
   */
  function bakedGunshot(x, y, z, caliberMm, isPlayer, profileId, muzzleIndex = -1,
    gainOverride = null) {
    const s = spat(x, y, z);
    if (s.gain < 0.00075) return;
    const report = resolveWeaponReportProfile(profileId);
    const perspective = isPlayer && listenerScoped
      ? AUDIO_PERSPECTIVE_MIX.sniper
      : AUDIO_PERSPECTIVE_MIX.arcade;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const cls = caliberMm > 130 ? 'huge' : caliberMm > 105 ? 'large' : caliberMm > 76 ? 'medium' : 'small';
    const shotGain = gainOverride ?? (s.gain * cannonDistanceCarry(s.dist) *
      (isPlayer ? 1.15 : 1) * report.gain * perspective.cannonGain);
    // Layer model: crack dies toward 180 m, sub keeps a floor (distant guns
    // still thump), tail always rides — thunder is what distance leaves.
    const crackK = Math.max(0, Math.min(1, 1 - (s.dist - 45) / 135));
    const subK = isPlayer ? 1.3 : 0.72 + 0.28 * crackK;
    const tailBuf = sfxBufs.get(`fire_${cls}_tail`);
    const life = (tailBuf ? tailBuf.duration / 0.95 : 2.6) + 0.25 + (isPlayer ? 1.0 : 0);
    const v = spawnVoice(when, life, shotGain,
      s.pan * (isPlayer ? perspective.enginePanScale : 1), sfxBus);
    const lp = distLowpass(s.dist + (isPlayer ? perspective.cannonDistanceBiasM : 0));
    lp.connect(v.in);
    sampleLayer(v, `fire_${cls}_sub`, when, subK, jitterRate() * report.rate, lp);
    if (crackK > 0.02) {
      sampleLayer(v, `fire_${cls}_crack`, when + rng() * 0.006,
        crackK * report.crackGain, jitterRate() * report.rate, lp);
    }
    sampleLayer(v, `fire_${cls}_tail`, when + 0.012 + rng() * 0.018,
      report.tailGain, jitterRate() * report.rate, lp);
    if (report.mechanicalGain > 0) {
      const tAction = when + (report.kind === 'autocannon' ? 0.035 : 0.12);
      wire(v, osrc(v, 'triangle', report.mechanicalHz, tAction, 0.10),
        env(tAction, 0.001, report.mechanicalGain, 0.07), lp);
      wire(v, nsrc(v, tAction, 0.045), flt('bandpass', report.mechanicalHz * 1.45, 0.92),
        env(tAction, 0.001, report.mechanicalGain * 0.62, 0.035), lp);
      if (report.twin) {
        const sidePitch = muzzleIndex === 1 ? 1.08 : 0.94;
        wire(v, osrc(v, 'square', report.mechanicalHz * sidePitch, tAction + 0.014, 0.06),
          env(tAction + 0.014, 0.001, report.mechanicalGain * 0.24, 0.045), lp);
      }
    }
    if (isPlayer) {
      // Muzzle-blast wind over the hull.
      wire(v, nsrc(v, when, 0.3), flt('lowpass', 850, 0.6), env(when, 0.01, 0.26, 0.26), lp);
      // Breech clank at the end of recoil (~0.22 s): metal-on-metal latch.
      const tCl = when + 0.20 + rng() * 0.05;
      wire(v, osrc(v, 'triangle', 290 * (0.95 + rng() * 0.1), tCl, 0.16),
        env(tCl, 0.002, 0.26, 0.12), lp);
      wire(v, nsrc(v, tCl, 0.05), flt('bandpass', 720, 0.82), env(tCl, 0.001, 0.18, 0.04), lp);
      // A restrained casing/loader-floor cue. It must never compete with the
      // report as a handful of high-pitched loose hardware.
      if (caliberMm <= 105) {
        const tBr = when + 0.65 + rng() * 0.2;
        for (let i = 0; i < 2; i++) {
          const at = tBr + i * (0.07 + rng() * 0.05);
          wire(v, osrc(v, 'triangle', 880 + rng() * 620, at, 0.07),
            env(at, 0.001, 0.025 - i * 0.006, 0.05), lp);
        }
      }
    }
  }

  /** Baked pen clang (+ interior whump when WE took the damage). */
  function bakedPen(x, y, z, playerWhumpK) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 1.35, s.gain * 0.95, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    sampleLayer(v, rng() < 0.5 ? 'impact_pen_a' : 'impact_pen_b', when, 1.0, jitterRate(), lp);
    if (playerWhumpK > 0) hitWhump(playerWhumpK);
  }

  /**
   * Interior whump — the receiving end of a hit. Non-spatial (it is OUR hull
   * flexing around us), rides under whatever played at the impact point.
   */
  function hitWhump(k) {
    const when = ctx.currentTime + 0.012;
    const v = spawnVoice(when, 1.0, 0.85 * k, 0, sfxBus);
    sampleLayer(v, 'hit_whump', when, 1.0, jitterRate(), null);
  }

  /** Baked deflection zing / non-pen thunk. */
  function bakedPing(x, y, z, deflected, playerWhumpK) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const lp = distLowpass(s.dist);
    if (deflected) {
      const v = spawnVoice(when, 1.2, s.gain * 0.9, s.pan, sfxBus);
      lp.connect(v.in);
      const variant = ['ricochet_a', 'ricochet_b', 'ricochet_c'][(rng() * 3) | 0];
      sampleLayer(v, variant, when, 1.0, 0.94 + rng() * 0.12, lp);
    } else {
      const v = spawnVoice(when, 0.7, s.gain * 0.95, s.pan, sfxBus);
      lp.connect(v.in);
      sampleLayer(v, rng() < 0.5 ? 'impact_absorb_a' : 'impact_absorb_b', when, 1.0, jitterRate(), lp);
      if (playerWhumpK > 0) hitWhump(playerWhumpK);
    }
  }

  /** Baked HE burst (shell explosion). Caliber re-pitches the one sample. */
  function bakedShellExplosion(x, y, z, caliberMm, dirt) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const rate = Math.max(0.82, Math.min(1.18, 0.9 + (122 - (caliberMm || 122)) / 300)) * (0.97 + rng() * 0.06);
    const v = spawnVoice(when, 2.0 / rate + 0.3, s.gain * (dirt ? 0.85 : 1.0), s.pan, sfxBus);
    const lp = distLowpass(dirt ? s.dist + 120 : s.dist);
    lp.connect(v.in);
    sampleLayer(v, rng() < 0.5 ? 'expl_he_a' : 'expl_he_b', when, 1.0, rate, lp);
    if (dirt) sampleLayer(v, 'impact_dirt', when + 0.01, 0.9, jitterRate(), lp);
  }

  /**
   * Tank-death blast — the biggest sound in the game, so it carries further
   * than the standard (10/d)^2 pool: clamp(26/d,0,1)^1.6 keeps a kill across
   * the map audible as deep thunder.
   * @param {'ammorack'|'shot'|'fire'} cause ammo-rack detonation (turret pop
   *   accent) | regular HP kill | burn-out cook-off
   */
  function bakedTankExplosion(x, y, z, cause, gainOverride = null) {
    const s = spat(x, y, z);
    const g = Math.pow(Math.min(1, 26 / s.dist), 1.6);
    if (g < 0.002) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const lp = distLowpass(s.dist);
    if (cause === 'fire') {
      const v = spawnVoice(when, 4.4, gainOverride ?? g * 0.95, s.pan, sfxBus);
      lp.connect(v.in);
      sampleLayer(v, 'expl_burnout', when, 1.0, jitterRate(), lp);
      sampleLayer(v, 'expl_tank_debris', when + 0.12 + rng() * 0.08, 0.45, jitterRate(), lp);
      return;
    }
    const rack = cause === 'ammorack';
    const rate = (rack ? 0.98 : 1.06) * (0.97 + rng() * 0.06);
    const v = spawnVoice(
      when,
      3.4 / rate + 1.4,
      gainOverride ?? g * (rack ? 1.0 : 0.85),
      s.pan,
      sfxBus,
    );
    lp.connect(v.in);
    sampleLayer(v, rng() < 0.5 ? 'expl_tank_core_a' : 'expl_tank_core_b', when, 1.0, rate, lp);
    sampleLayer(v, 'expl_tank_debris', when + 0.06 + rng() * 0.09, rack ? 0.9 : 0.7, jitterRate(), lp);
    if (rack) {
      // Turret-pop deep accent under the launch.
      sampleLayer(v, 'expl_turret_pop', when + 0.10 + rng() * 0.08, 0.95, jitterRate(), lp);
    }
  }

  /** Replayed destruction, routed outside the ducked live battle bed. */
  function bakedKillcamImpact(x, y, z, cause, slowRate) {
    const s = spat(x, y, z);
    const gain = Math.pow(Math.min(1, 30 / s.dist), 1.45);
    if (gain < 0.002) return;
    const when = ctx.currentTime + 0.005;
    const rack = cause === 'ammorack';
    const r = Math.max(0.4, Math.min(1, Number(slowRate) || 0.55));
    const v = spawnVoice(when, 7.0, gain * (rack ? 1 : 0.9), s.pan, cinematicBus);
    const lp = distLowpass(s.dist * 0.65);
    lp.connect(v.in);
    // The blast front happens before the visual rate reaches its minimum.
    sampleLayer(v, rng() < 0.5 ? 'expl_tank_core_a' : 'expl_tank_core_b',
      when, 1.0, 0.96, lp);
    // Debris and turret launch ride the visual's 0.55x stretch/pitch drop.
    sampleLayerRetime(v, 'expl_tank_debris', when + 0.07, rack ? 0.95 : 0.78, r, lp);
    if (rack) sampleLayerRetime(v, 'expl_turret_pop', when + 0.11, 1.0, r, lp);
    // A dedicated sub fall reinforces the stretched pressure wave without
    // replaying game events or affecting scores/destruction state.
    const sub = osrc(v, 'sine', 48, when, 2.8);
    sub.frequency.exponentialRampToValueAtTime(22, when + 1.9);
    wire(v, sub, env(when, 0.008, rack ? 0.85 : 0.68, 2.1), lp);
    killcamSfxLog.push({ t: when, cause, slowRate: r, baked: true, gain });
    if (killcamSfxLog.length > 32) killcamSfxLog.shift();
  }

  /** Synth fallback for a replay that begins before baked assets decode. */
  function synthKillcamImpact(x, y, z, cause, slowRate) {
    const s = spat(x, y, z);
    const gain = Math.pow(Math.min(1, 30 / s.dist), 1.45);
    if (gain < 0.002) return;
    const when = ctx.currentTime + 0.005;
    const rack = cause === 'ammorack';
    const r = Math.max(0.4, Math.min(1, Number(slowRate) || 0.55));
    const v = spawnVoice(when, 6.5, gain * (rack ? 1 : 0.9), s.pan, cinematicBus);
    const lp = distLowpass(s.dist * 0.65);
    lp.connect(v.in);
    const sub = osrc(v, 'sine', 48, when, 2.7 / r);
    sub.frequency.exponentialRampToValueAtTime(20, when + 2.2 / r);
    wire(v, sub, env(when, 0.008, rack ? 1.0 : 0.78, 2.4 / r), lp);
    wire(v, nsrc(v, when, 2.2 / r, r), flt('lowpass', 1250, 0.7),
      env(when, 0.006, 1.0, 1.7 / r), lp);
    wire(v, nsrc(v, when + 0.08, 2.8 / r, r, crackleBuf),
      flt('bandpass', rack ? 1150 : 850, 1.1), env(when + 0.08, 0.01, 0.62, 2.1 / r), lp);
    killcamSfxLog.push({ t: when, cause, slowRate: r, baked: false, gain });
    if (killcamSfxLog.length > 32) killcamSfxLog.shift();
  }

  function killcamImpact(e) {
    if (!e || !e.pos) return;
    const p = e.pos;
    if (sfxReady) bakedKillcamImpact(p[0], p[1], p[2], e.cause, e.timeScale);
    else synthKillcamImpact(p[0], p[1], p[2], e.cause, e.timeScale);
  }

  /** Baked ERA tile detonation. */
  function bakedEraPop(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.9, s.gain * 0.9, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    sampleLayer(v, 'era_pop', when, 1.0, jitterRate(), lp);
  }

  /** Baked shell-into-dirt thud (shell:expired hitTerrain). */
  function bakedDirtImpact(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.003) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 1.2, s.gain * 0.75, s.pan, sfxBus);
    const lp = distLowpass(s.dist + 60);
    lp.connect(v.in);
    sampleLayer(v, 'impact_dirt', when, 1.0, jitterRate(), lp);
  }

  // ------------------------------------------------------------- gunfire ---

  /** Guided-weapon motor: launch thump, ignition tone and pressure hiss. */
  function missileLaunch(x, y, z, isPlayer, report, muzzleIndex = -1) {
    const s = spat(x, y, z);
    if (s.gain < 0.00075) return;
    const perspective = isPlayer && listenerScoped
      ? AUDIO_PERSPECTIVE_MIX.sniper
      : AUDIO_PERSPECTIVE_MIX.arcade;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, report.durationS + 0.25,
      s.gain * report.gain * (isPlayer ? 1.08 : 1) * perspective.cannonGain,
      s.pan * (isPlayer ? perspective.enginePanScale : 1), sfxBus);
    const lp = distLowpass(s.dist + 25 + (isPlayer ? perspective.cannonDistanceBiasM : 0));
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.09), flt('lowpass', 520, 0.8),
      env(when, 0.002, 0.52, 0.07), lp);
    const motor = osrc(v, 'sawtooth', report.toneHz, when + 0.018, report.durationS);
    motor.frequency.exponentialRampToValueAtTime(
      report.toneHz * report.rate * 1.7, when + report.durationS * 0.72);
    wire(v, motor, flt('lowpass', 780, 0.9),
      env(when + 0.018, 0.025, 0.16, report.durationS * 0.82), lp);
    wire(v, nsrc(v, when + 0.01, report.durationS, 1.1),
      flt('bandpass', 1450 * report.rate, 0.7),
      env(when + 0.01, 0.012, report.hissGain, report.durationS * 0.88), lp);
    if (report.mechanicalGain > 0) {
      const latchAt = when + (muzzleIndex === 1 ? 0.008 : 0);
      wire(v, osrc(v, 'triangle', report.mechanicalHz, latchAt, 0.09),
        env(latchAt, 0.001, report.mechanicalGain, 0.06), lp);
    }
  }

  /** Weapon shot: baked cannon layers, synth fallback, or launcher motor. */
  function gunshot(x, y, z, caliberMm, isPlayer, profileId, muzzleIndex = -1) {
    const report = resolveWeaponReportProfile(profileId);
    if (report.kind === 'launcher') {
      missileLaunch(x, y, z, isPlayer, report, muzzleIndex);
    } else if (sfxReady) {
      bakedGunshot(x, y, z, caliberMm, isPlayer, profileId, muzzleIndex);
    } else {
      synthGunshot(x, y, z, caliberMm, isPlayer, profileId, muzzleIndex);
    }
  }

  /**
   * (Pre-COMBAT-SFX-r2 fallback.) Layered gunshot by caliber class:
   *   ≤76 mm sharp crack | ≤105 mm boom | ≤130 mm heavy boom | >130 mm siege
   * Pre-rendered bed (crack/body/bark/sub/rumble) + per-shot pitch jitter so
   * repeats never machine-gun, + a live crack overlay for nearby shots.
   * The PLAYER's own gun gets a mechanical action tail: breech clank at the
   * end of recoil and a brass-casing tinkle.
   */
  function synthGunshot(x, y, z, caliberMm, isPlayer, profileId, muzzleIndex = -1,
    gainOverride = null) {
    const s = spat(x, y, z);
    if (s.gain < 0.00075) return;
    const report = resolveWeaponReportProfile(profileId);
    const perspective = isPlayer && listenerScoped
      ? AUDIO_PERSPECTIVE_MIX.sniper
      : AUDIO_PERSPECTIVE_MIX.arcade;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const cls = caliberMm > 130 ? 'huge' : caliberMm > 105 ? 'heavy' : caliberMm > 76 ? 'medium' : 'light';
    const dur = { light: 0.55, medium: 1.0, heavy: 1.7, huge: 2.6 }[cls];
    const v = spawnVoice(when, dur + (isPlayer ? 1.0 : 0),
      gainOverride ?? (s.gain * cannonDistanceCarry(s.dist) *
        (isPlayer ? 1.08 : 1) * report.gain * perspective.cannonGain),
      s.pan * (isPlayer ? perspective.enginePanScale : 1), sfxBus);
    const lp = distLowpass(s.dist + (isPlayer ? perspective.cannonDistanceBiasM : 0));
    const src = ctx.createBufferSource();
    src.buffer = gunBufs[cls];
    src.playbackRate.value = (0.94 + rng() * 0.12) * report.rate;
    src.start(when);
    src.stop(when + dur / src.playbackRate.value + 0.05);
    v.sources.push(src);
    wire(v, src, lp);
    // Live crack overlay: only audible up close where the bed's baked crack
    // has been dulled by the shared lowpass — restores the whip-snap.
    if (s.dist < 120) {
      wire(v, nsrc(v, when, 0.03), flt('highpass', 2400 + rng() * 900, 0.8),
        env(when, 0.001, (cls === 'light' ? 0.55 : 0.42) * report.crackGain, 0.018), lp);
    }
    if (report.mechanicalGain > 0) {
      const tAction = when + (report.kind === 'autocannon' ? 0.035 : 0.12);
      const sidePitch = report.twin && muzzleIndex === 1 ? 1.08 : 1;
      wire(v, osrc(v, 'triangle', report.mechanicalHz * sidePitch, tAction, 0.10),
        env(tAction, 0.001, report.mechanicalGain, 0.07), lp);
      wire(v, nsrc(v, tAction, 0.045), flt('bandpass', report.mechanicalHz * 1.45, 0.92),
        env(tAction, 0.001, report.mechanicalGain * 0.60, 0.035), lp);
    }
    if (isPlayer) {
      // Muzzle-blast wind over the hull.
      wire(v, nsrc(v, when, 0.3), flt('lowpass', 850, 0.6), env(when, 0.01, 0.30, 0.26), lp);
      // Breech clank at the end of recoil (~0.22 s): metal-on-metal latch.
      const tCl = when + 0.20 + rng() * 0.05;
      wire(v, osrc(v, 'triangle', 290 * (0.95 + rng() * 0.1), tCl, 0.16),
        env(tCl, 0.002, 0.28, 0.12), lp);
      wire(v, nsrc(v, tCl, 0.05), flt('bandpass', 720, 0.82), env(tCl, 0.001, 0.19, 0.04), lp);
      // Loader-floor cue kept low and sparse beneath the gun report.
      if (caliberMm <= 105) {
        const tBr = when + 0.65 + rng() * 0.2;
        for (let i = 0; i < 2; i++) {
          const at = tBr + i * (0.07 + rng() * 0.05);
          wire(v, osrc(v, 'triangle', 880 + rng() * 620, at, 0.07),
            env(at, 0.001, 0.027 - i * 0.006, 0.05), lp);
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
      const gBp = flt('bandpass', 520 + rng() * 260, 0.92);
      wire(v, grind, gBp, env(when + 0.03, 0.02, 0.30 * k, 0.34), lp);
      wire(v, nsrc(v, when + 0.05, 0.35, 1, crackleBuf), flt('bandpass', 900, 1.4),
        env(when + 0.05, 0.01, 0.35 * k, 0.3), lp);
    }
    logSound('tank:impact', { id: e.id, dist: s.dist, gain: s.gain, speedMps: e.speedMps });
  }

  /** Tank-on-tank collision. This is a distinct replicated event from a hull
   * touching scenery, and needs plate crush plus an interior hit for either
   * locally occupied participant. */
  function onTankRam(e, warmOnly = false) {
    if (!e || !e.pos) return;
    const s = spat(e.pos[0], e.pos[1], e.pos[2]);
    const closing = Math.max(0, Number(e.closingMps) || 0);
    const damage = Math.max(Number(e.dmgA) || 0, Number(e.dmgB) || 0);
    const k = Math.max(0.25, Math.min(1, closing / 11 + damage / 900));
    if (!warmOnly && s.gain * k < 0.0012) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(
      when,
      1.15,
      warmOnly ? 0 : s.gain * (0.58 + 0.42 * k),
      s.pan,
      sfxBus,
    );
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    // Initial hull/body collision.
    wire(v, nsrc(v, when, 0.16), flt('lowpass', 360, 0.8),
      env(when, 0.002, 1.0, 0.13), lp);
    wire(v, osrc(v, 'triangle', 72 + 46 * k, when, 0.42),
      env(when, 0.002, 0.72, 0.34), lp);
    // Plate fold and track/gear scatter after the body hit.
    wire(v, nsrc(v, when + 0.025, 0.62, 0.82),
      flt('bandpass', 480 + 220 * k, 0.88),
      env(when + 0.025, 0.01, 0.48, 0.52), lp);
    wire(v, nsrc(v, when + 0.045, 0.75, 1, crackleBuf),
      flt('bandpass', 1180, 1.2),
      env(when + 0.045, 0.008, 0.42, 0.64), lp);

    const occupied = !warmOnly && !!(e.aIsPlayer || e.bIsPlayer ||
      (listenerOwnerId != null && (e.aId === listenerOwnerId || e.bId === listenerOwnerId)));
    if (occupied) {
      if (sfxReady) {
        hitWhump(0.55 + 0.45 * k);
      } else {
        const cabin = spawnVoice(when + 0.008, 0.65, 0.55 + 0.35 * k, 0, sfxBus);
        wire(cabin, nsrc(cabin, when + 0.008, 0.24), flt('lowpass', 280, 0.8),
          env(when + 0.008, 0.002, 0.8, 0.2));
        wire(cabin, osrc(cabin, 'sine', 54, when + 0.008, 0.38),
          env(when + 0.008, 0.002, 0.55, 0.31));
      }
    }
    if (!warmOnly) {
      logSound('tank:ram', {
        aId: e.aId, bId: e.bId, occupied, dist: s.dist, gain: s.gain, closingMps: closing,
      });
    }
  }

  /**
   * Submit the collision graph once while the battle loader is opaque. Chrome
   * can initialize its first compound WebAudio graph on the calling task;
   * paying that one-time cost on the first live ram created a 50-70 ms frame.
   * The scheduled warm voice has zero gain and uses the exact production nodes.
   */
  function warmBattleEvents() {
    if (!ctx || !graphReady || battleEventsWarmed) return;
    battleEventsWarmed = true;
    onTankRam({
      aId: '__warm_a__', bId: '__warm_b__',
      closingMps: 9, dmgA: 50, dmgB: 75,
      pos: [lx, ly, lz],
    }, true);
    // The live-synthesis path is deliberately heavier than the decoded-sample
    // path. Prime it even when samples are expected to finish downloading so
    // a slow/failed first visit cannot move this setup into the live volley.
    synthGunshot(lx, ly, lz, 152, true, null, -1, 0);
    synthExplosion(lx, ly, lz, 1.8, false, true, 0);
    warmBakedBattleEvents();
  }

  function warmBakedBattleEvents() {
    if (!sfxReady || bakedBattleEventsWarmed) return;
    bakedBattleEventsWarmed = true;
    bakedGunshot(lx, ly, lz, 152, true, null, -1, 0);
    bakedTankExplosion(lx, ly, lz, 'ammorack', 0);
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
    logSound('prop:crushed', { id: e.id, kind: e.kind, dist: s.dist, gain: s.gain });
  }

  /**
   * Armor penetration: baked clang+thud+debris sample (with an interior
   * whump layer when WE are the one holed), or the pre-r2 synth fallback.
   * @param {number} [playerWhumpK] 0..1 — receiving-end whump strength
   */
  function clang(x, y, z, playerWhumpK = 0) {
    if (sfxReady) { bakedPen(x, y, z, playerWhumpK); return; }
    synthClang(x, y, z);
  }

  /**
   * Live fallback for an armor penetration. It mirrors r3's low-mid armor
   * flex and short spall burst so a shot fired during asynchronous sample
   * loading cannot fall back to the old high-Q dinner-bell sound.
   */
  function synthClang(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 1.0, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    // Plate collector so the two tiny interior taps hear the whole flex.
    const ring = ctx.createGain();
    ring.gain.value = 1;
    ring.connect(lp);
    const d1 = ctx.createDelay(0.2); d1.delayTime.value = 0.055;
    const g1 = ctx.createGain(); g1.gain.value = 0.14;
    ring.connect(d1); d1.connect(g1); g1.connect(lp);
    const d2 = ctx.createDelay(0.2); d2.delayTime.value = 0.128;
    const g2 = ctx.createGain(); g2.gain.value = 0.06;
    ring.connect(d2); d2.connect(g2); g2.connect(lp);
    const partials = [185, 318, 515, 785, 1180];
    const gains = [1.0, 0.82, 0.60, 0.36, 0.18];
    const decays = [0.17, 0.14, 0.105, 0.08, 0.055];
    for (let i = 0; i < partials.length; i++) {
      const detune = 1 + (rng() - 0.5) * 0.012;
      const e = env(when, 0.001, gains[i] * 0.42, decays[i]);
      const o = osrc(v, 'triangle', partials[i] * detune, when, decays[i] + 0.25);
      o.connect(e); e.connect(ring);
    }
    // Impact transient.
    wire(v, nsrc(v, when, 0.06), flt('bandpass', 1450, 0.62), env(when, 0.001, 0.38, 0.03), lp);
    // Spall hiss: fragments sanding the interior right behind the punch.
    wire(v, nsrc(v, when + 0.01, 0.16), flt('bandpass', 1750, 0.58), env(when + 0.01, 0.004, 0.20, 0.09), lp);
    // Interior body thud.
    wire(v, nsrc(v, when, 0.18), flt('lowpass', 500, 0.7), env(when, 0.003, 0.6, 0.14), lp);
  }

  /**
   * Ricochet / non-pen: baked variants (three whining piiing deflections
   * with NO low end, or a dull heavy absorb thunk + optional receiving-end
   * whump), or the pre-r2 synth fallback.
   * @param {boolean} deflected true = ricochet, false = nonpen/absorb
   * @param {number} [playerWhumpK] 0..1 — receiving-end whump strength
   */
  function ping(x, y, z, deflected, playerWhumpK = 0) {
    if (sfxReady) { bakedPing(x, y, z, deflected, playerWhumpK); return; }
    synthPing(x, y, z, deflected);
  }

  /**
   * Live r4 fallback. Deflections retain a brief scrape/flight read over a
   * compact plate body; non-pens are a blunt shell shatter. Neither path
   * permits the former long, narrow 3–5 kHz ringing stack.
   * @param {boolean} deflected true = ricochet, false = nonpen/absorb
   */
  function synthPing(x, y, z, deflected) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const lp = distLowpass(s.dist);
    if (deflected) {
      const variant = (rng() * 3) | 0;
      const v = spawnVoice(when, 0.72, s.gain * 0.9, s.pan, sfxBus);
      lp.connect(v.in);
      wire(v, nsrc(v, when, 0.04), flt('bandpass', 1650, 0.68), env(when, 0.001, 0.44, 0.02), lp);
      wire(v, nsrc(v, when, 0.12), flt('bandpass', 520, 0.62), env(when, 0.002, 0.52, 0.08), lp);
      const sweep = (f0, f1, at, dur, peak, q) => {
        const o = osrc(v, 'sine', f0, at, dur + 0.05);
        o.frequency.exponentialRampToValueAtTime(Math.max(80, f1), at + dur);
        const vib = osrc(v, 'sine', 24 + rng() * 10, at, dur);
        const vibG = ctx.createGain();
        vibG.gain.value = f0 * 0.012;
        vib.connect(vibG); vibG.connect(o.frequency);
        wire(v, o, flt('bandpass', (f0 + f1) * 0.5, q == null ? 0.9 : q), env(at, 0.004, peak, dur));
      };
      if (variant === 0) {
        // Classic long singing whine, falling away with the shell.
        sweep(2100 + rng() * 350, 720 + rng() * 160, when, 0.30 + rng() * 0.08, 0.26, 0.72);
      } else if (variant === 1) {
        // Double-skip: two falling zings, the second higher and fainter
        // (shell grazing twice along the plate).
        const d1 = 0.14 + rng() * 0.04;
        sweep(1900 + rng() * 300, 880, when, d1, 0.25, 0.72);
        const t2 = when + d1 + 0.02 + rng() * 0.03;
        wire(v, nsrc(v, t2, 0.02), flt('bandpass', 2100, 0.72), env(t2, 0.001, 0.20, 0.012), lp);
        sweep(2450 + rng() * 350, 1080, t2, 0.20 + rng() * 0.05, 0.18, 0.75);
      } else {
        // Short shriek: steep bright sweep, gone in a third of a second.
        sweep(2850 + rng() * 450, 1180 + rng() * 180, when, 0.20 + rng() * 0.05, 0.24, 0.82);
      }
      // Shard ticks: sparks/fragments pattering off after the deflection.
      const n = 2 + ((rng() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const at = when + 0.05 + rng() * 0.25;
        wire(v, nsrc(v, at, 0.03), flt('bandpass', 1250 + rng() * 1700, 0.9),
          env(at, 0.001, 0.05 + rng() * 0.07, 0.02 + rng() * 0.02), lp);
      }
      // Faint ring partial hanging on the plate.
      wire(v, osrc(v, 'triangle', 620 * (0.9 + rng() * 0.2), when, 0.18),
        env(when, 0.001, 0.14, 0.12), lp);
    } else {
      // Non-pen: the shell breaks up on the plate — no flight whine.
      const v = spawnVoice(when, 0.5, s.gain, s.pan, sfxBus);
      lp.connect(v.in);
      wire(v, nsrc(v, when, 0.05), flt('bandpass', 1300, 0.65), env(when, 0.001, 0.34, 0.025), lp);
      wire(v, nsrc(v, when, 0.15), flt('bandpass', 460 * (0.9 + rng() * 0.2), 0.62), env(when, 0.002, 0.78, 0.12), lp);
      wire(v, osrc(v, 'triangle', 410 * (0.92 + rng() * 0.16), when, 0.18),
        env(when, 0.001, 0.20, 0.13), lp);
      // Fragments dropping off the plate.
      const at = when + 0.06 + rng() * 0.08;
      wire(v, nsrc(v, at, 0.04, 1, crackleBuf), flt('bandpass', 1100, 0.82),
        env(at, 0.002, 0.13, 0.06), lp);
    }
  }

  /**
   * (Pre-COMBAT-SFX-r2 fallback for HE bursts and tank destruction.)
   * Explosion. scale ~1 = 122 mm HE; bigger = longer, deeper. dirt=true
   * muffles it (ground burst).
   */
  function synthExplosion(x, y, z, scale, dirt, debris, gainOverride = null) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const k = Math.max(0.4, Math.min(2.2, scale));
    const dur = 1.4 * k + (debris ? 1.6 : 0);
    const v = spawnVoice(when, dur, gainOverride ?? s.gain, s.pan, sfxBus);
    const lp = distLowpass(dirt ? s.dist + 120 : s.dist);
    lp.connect(v.in);

    // Sub thump.
    const sub = osrc(v, 'sine', 50, when, 0.9 * k);
    sub.frequency.exponentialRampToValueAtTime(26, when + 0.55 * k);
    wire(v, sub, env(when, 0.008, 0.52, 0.65 * k), lp);
    // Main boom: noise through a collapsing lowpass.
    const boomLp = flt('lowpass', 2600, 0.65);
    boomLp.frequency.setValueAtTime(2600, when);
    boomLp.frequency.exponentialRampToValueAtTime(170, when + 0.6 * k);
    wire(v, nsrc(v, when, 1.0 * k), flt('highpass', 82, 0.65), boomLp,
      env(when, 0.006, 1.2, 0.8 * k), lp);
    // Crackle sizzle.
    wire(v, nsrc(v, when, 0.9 * k, 1, crackleBuf), flt('bandpass', 1250, 0.72),
      env(when, 0.01, dirt ? 0.16 : 0.26, 0.8 * k), lp);
    if (dirt) {
      // Dirt/earth slap.
      wire(v, nsrc(v, when, 0.35), flt('lowpass', 420, 0.7), env(when, 0.004, 0.9, 0.28), lp);
    }
    if (debris) {
      // Debris patter: scattered ticks raining down after the blast.
      const n = 12 + ((rng() * 8) | 0);
      for (let i = 0; i < n; i++) {
        const at = when + 0.3 + rng() * 1.6;
        wire(v, nsrc(v, at, 0.05), flt('bandpass', 360 + rng() * 1300, 0.82),
          env(at, 0.001, 0.07 + rng() * 0.10, 0.03 + rng() * 0.05), lp);
      }
      // Secondary pop.
      const at2 = when + 0.5 + rng() * 0.6;
      const lp2 = flt('lowpass', 700, 0.7);
      lp2.connect(v.in);
      wire(v, nsrc(v, at2, 0.3), flt('lowpass', 900, 0.7), env(at2, 0.006, 0.5, 0.3), lp2);
    }
  }

  /** ERA tile detonation (baked, or pre-r2 synth fallback). */
  function eraPop(x, y, z) {
    if (sfxReady) { bakedEraPop(x, y, z); return; }
    synthEraPop(x, y, z);
  }

  /** Live ERA fallback: sharp fracture over a short armor-body pulse. */
  function synthEraPop(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.0015) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.5, s.gain, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    wire(v, nsrc(v, when, 0.15), flt('lowpass', 3600, 0.7), env(when, 0.002, 0.72, 0.08), lp);
    const sub = osrc(v, 'sine', 70, when, 0.2);
    sub.frequency.exponentialRampToValueAtTime(45, when + 0.12);
    wire(v, sub, env(when, 0.003, 0.34, 0.12), lp);
    wire(v, osrc(v, 'triangle', 420 * (0.95 + rng() * 0.1), when, 0.22),
      env(when, 0.001, 0.24, 0.14), lp);
  }

  /** Track link snapped (module trackL/R → red): metal snap + chain clatter. */
  function trackSnap(x, y, z) {
    const s = spat(x, y, z);
    if (s.gain < 0.002) return;
    const when = ctx.currentTime + 0.005 + travelDelay(s.dist);
    const v = spawnVoice(when, 0.8, s.gain * 0.9, s.pan, sfxBus);
    const lp = distLowpass(s.dist);
    lp.connect(v.in);
    // Tensioned link letting go: broad fracture and plate flex, not a bell.
    wire(v, nsrc(v, when, 0.04), flt('bandpass', 1250, 0.7), env(when, 0.001, 0.48, 0.025), lp);
    wire(v, osrc(v, 'triangle', 520 * (0.94 + rng() * 0.12), when, 0.15),
      env(when, 0.001, 0.25, 0.10), lp);
    // Low clunk of the run dropping onto the wheels.
    wire(v, osrc(v, 'triangle', 128, when + 0.05, 0.24), env(when + 0.05, 0.003, 0.55, 0.2), lp);
    // Chain clatter spilling off.
    wire(v, nsrc(v, when + 0.06, 0.5, 0.85, crackleBuf), flt('bandpass', 480, 0.76),
      env(when + 0.06, 0.01, 0.30, 0.42), lp);
  }

  /** Shell landing in dirt with no target (shell:expired hitTerrain). */
  function dirtImpact(x, y, z) {
    if (sfxReady) { bakedDirtImpact(x, y, z); return; }
    synthDirtImpact(x, y, z);
  }

  /** (Pre-COMBAT-SFX-r2 fallback.) Shell landing in dirt with no target. */
  function synthDirtImpact(x, y, z) {
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

    const passAt = ctx.currentTime + t / vel;
    const closeness = 1 - miss / WHIZZ_MAX_MISS_M;     // 0..1
    const gain = 0.15 + 0.7 * closeness * closeness;
    // Pan by which side the shell passes on.
    const pan = miss > 0.001
      ? Math.max(-1, Math.min(1, (px * lfz - pz * lfx) / miss)) * 0.9 : 0;

    const w0 = safeAudioStart(ctx.currentTime, passAt - 0.12);
    // A very near pass can occur before the ideal 120 ms lead-in. Preserve a
    // strictly increasing automation window rather than addressing AudioParam
    // at a negative/past timestamp during the first AudioContext moments.
    const when = Math.max(passAt, w0 + 0.001);
    const v = spawnVoice(w0, 0.45, gain, pan, sfxBus);
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
    wire(v, nsrc(v, when, 0.025), flt('bandpass', 1450, 0.72), env(when, 0.001, 0.34, 0.014));
    wire(v, osrc(v, 'sine', 820, when, 0.055), env(when, 0.001, 0.24, 0.04));
  }

  /** Quieter sibling of uiClick for pointer hover over buttons. */
  function uiHover() {
    const when = ctx.currentTime;
    const v = spawnVoice(when, 0.06, 0.13, 0, musicBus);
    wire(v, osrc(v, 'sine', 1260, when, 0.032), env(when, 0.001, 0.34, 0.022));
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
      wire(v, osrc(v, 'triangle', 720, when, 0.08), env(when, 0.002, 0.34, 0.06));
      wire(v, osrc(v, 'triangle', 980, when + 0.05, 0.10), env(when + 0.05, 0.002, 0.30, 0.08));
      wire(v, nsrc(v, when, 0.025), flt('bandpass', 1750, 0.72), env(when, 0.001, 0.14, 0.016));
    } else if (ricochet) {
      // Rising, ringing skid: unmistakably different from the low absorbed
      // thud below even when the spatial target impact is far away.
      const v = spawnVoice(when, 0.34, 0.46, 0, sfxBus);
      const o = osrc(v, 'triangle', 920, when, 0.22);
      o.frequency.exponentialRampToValueAtTime(1580, when + 0.14);
      wire(v, o, flt('bandpass', 1250, 0.75), env(when, 0.002, 0.34, 0.18));
      wire(v, nsrc(v, when, 0.03), flt('bandpass', 1950, 0.72), env(when, 0.001, 0.16, 0.022));
    } else {
      const v = spawnVoice(when, 0.22, 0.42, 0, sfxBus);
      const o = osrc(v, 'square', 340, when, 0.1);
      o.frequency.exponentialRampToValueAtTime(210, when + 0.09);
      wire(v, o, flt('lowpass', 900, 0.8), env(when, 0.002, 0.5, 0.09));
      wire(v, nsrc(v, when, 0.04), flt('bandpass', 1200, 1.2), env(when, 0.001, 0.3, 0.035));
    }
  }

  /** Interior reload mechanism, keyed to the real reload timer's cue plan. */
  function reloadMechanicalSound(type, caliberMm = 100) {
    if (!ctx) return;
    const when = ctx.currentTime + 0.004;
    const mass = Math.max(0.65, Math.min(1.45, caliberMm / 100));
    const v = spawnVoice(when, type === 'motor' ? 0.46 : 0.30,
      0.26 + mass * 0.10, 0, sfxBus);
    if (type === 'breechOpen') {
      const latch = osrc(v, 'triangle', 330 / mass, when, 0.18);
      latch.frequency.exponentialRampToValueAtTime(185 / mass, when + 0.13);
      wire(v, latch, flt('lowpass', 1350, 0.9), env(when, 0.002, 0.52, 0.15));
      wire(v, nsrc(v, when, 0.055), flt('bandpass', 980, 1.8), env(when, 0.001, 0.42, 0.045));
    } else if (type === 'extract') {
      wire(v, nsrc(v, when, 0.11), flt('bandpass', 760, 0.82), env(when, 0.003, 0.28, 0.09));
      const ring = osrc(v, 'triangle', 980 / Math.sqrt(mass), when + 0.025, 0.14);
      ring.frequency.exponentialRampToValueAtTime(620 / Math.sqrt(mass), when + 0.13);
      wire(v, ring, env(when + 0.025, 0.001, 0.12, 0.11));
    } else if (type === 'shellLift') {
      const shell = osrc(v, 'sine', 118 / mass, when, 0.20);
      shell.frequency.exponentialRampToValueAtTime(74 / mass, when + 0.16);
      wire(v, shell, flt('lowpass', 620, 0.8), env(when, 0.006, 0.55, 0.17));
      wire(v, nsrc(v, when + 0.018, 0.09), flt('bandpass', 720, 1.4),
        env(when + 0.018, 0.003, 0.24, 0.075));
    } else if (type === 'ram') {
      wire(v, nsrc(v, when, 0.15), flt('bandpass', 560 / mass, 0.9),
        env(when, 0.006, 0.38, 0.13));
      const thud = osrc(v, 'triangle', 165 / mass, when + 0.075, 0.15);
      thud.frequency.exponentialRampToValueAtTime(82 / mass, when + 0.19);
      wire(v, thud, flt('lowpass', 720, 0.8), env(when + 0.075, 0.002, 0.52, 0.12));
    } else if (type === 'motor') {
      const motor = osrc(v, 'sawtooth', 92 + 36 / mass, when, 0.40);
      motor.frequency.linearRampToValueAtTime(150 + 42 / mass, when + 0.28);
      wire(v, motor, flt('bandpass', 520, 1.5), env(when, 0.025, 0.24, 0.38));
      wire(v, nsrc(v, when, 0.40), flt('bandpass', 820, 0.86),
        env(when, 0.02, 0.10, 0.38));
    } else if (type === 'index') {
      for (let i = 0; i < 3; i++) {
        const at = when + i * 0.047;
        wire(v, osrc(v, 'square', 640 / mass + i * 75, at, 0.055),
          flt('bandpass', 760, 0.9), env(at, 0.001, 0.18 - i * 0.03, 0.042));
      }
    } else { // breechClose
      wire(v, nsrc(v, when, 0.05), flt('bandpass', 720, 0.82), env(when, 0.001, 0.34, 0.04));
      const close = osrc(v, 'triangle', 285 / mass, when + 0.018, 0.16);
      close.frequency.exponentialRampToValueAtTime(145 / mass, when + 0.14);
      wire(v, close, flt('lowpass', 1200, 0.8), env(when + 0.018, 0.002, 0.58, 0.13));
    }
  }

  /** Non-spatial breech latch: the loaded gun is ready to fire again. */
  function reloadReadySound(caliberMm = 100) {
    if (!ctx) return;
    const when = ctx.currentTime + 0.004;
    const mass = Math.max(0.7, Math.min(1.35, caliberMm / 100));
    const v = spawnVoice(when, 0.24, 0.32 + mass * 0.06, 0, sfxBus);
    wire(v, nsrc(v, when, 0.035), flt('bandpass', 720, 0.82), env(when, 0.001, 0.34, 0.028));
    const latch = osrc(v, 'triangle', 420 / Math.sqrt(mass), when + 0.025, 0.13);
    latch.frequency.exponentialRampToValueAtTime(690 / Math.sqrt(mass), when + 0.1);
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

  function stopWorldLoops(reason) {
    for (const [id, eng] of engines) {
      eng.kill();
      logSound('engine:stop', { id, reason });
    }
    engines.clear();
    landing.clear();
    for (const fire of fireLoops.values()) fire.kill();
    fireLoops.clear();
    probeEngineSoloId = null;
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
    const profile = resolveEngineSoundProfile(entity.specId, entity.spec);
    const isTurbine = profile.kind === 'turbine';
    const f0 = profile.baseHz;   // fundamental at idle pitch 1.0

    const out = ctx.createGain(); out.gain.value = 0;
    const rangeLp = flt('lowpass', 18000, 0.5);
    const pan = ctx.createStereoPanner();
    out.connect(rangeLp); rangeLp.connect(pan); pan.connect(engineBus);
    const now = ctx.currentTime;

    // Broadly filtered firing pulses. The low-Q filter carries engine mass;
    // raw oscillator buzz no longer reaches the mix as a synthetic rasp.
    const sawA = ctx.createOscillator(); sawA.type = isTurbine ? 'triangle' : 'sawtooth'; sawA.frequency.value = f0;
    const sawB = ctx.createOscillator(); sawB.type = 'triangle'; sawB.frequency.value = f0 * 2.02;
    const sub = ctx.createOscillator();  sub.type = 'sine';      sub.frequency.value = f0 * 0.5;
    const sawLp = flt('lowpass', profile.toneCutoffHz, 0.58);
    const gSaw = ctx.createGain(); gSaw.gain.value = profile.pulseGain;
    const gSub = ctx.createGain(); gSub.gain.value = profile.subGain;
    sawA.connect(sawLp); sawB.connect(sawLp); sawLp.connect(gSaw); gSaw.connect(out);
    sub.connect(gSub); gSub.connect(out);
    // Rattle FM wobble on the saws (diesel unevenness).
    const wob = ctx.createOscillator(); wob.type = 'sine';
    wob.frequency.value = 9 + rng() * 4;
    const wobG = ctx.createGain(); wobG.gain.value = profile.wobbleDepthHz;
    wob.connect(wobG); wobG.connect(sawA.frequency); wobG.connect(sawB.frequency);

    // Combustion / intake noise.
    const noi = ctx.createBufferSource();
    noi.buffer = whiteBuf; noi.loop = true; noi.start(now, rng() * 1.7);
    const noiBp = flt('bandpass', profile.intakeHz, 0.62);
    const gNoi = ctx.createGain(); gNoi.gain.value = profile.intakeGain;
    noi.connect(noiBp); noiBp.connect(gNoi); gNoi.connect(out);

    // Tread scrub: a wide low-mid texture. The former 1450 Hz / Q=9 band was
    // the main continuous “metal in a pan” sound while driving.
    const sq = ctx.createBufferSource();
    sq.buffer = whiteBuf; sq.loop = true; sq.playbackRate.value = 0.8; sq.start(now, rng() * 1.7);
    const sqBp = flt('bandpass', profile.trackHz, profile.trackQ);
    const gSq = ctx.createGain(); gSq.gain.value = 0;
    sq.connect(sqBp); sqBp.connect(gSq); gSq.connect(out);
    const sqLfo = ctx.createOscillator(); sqLfo.type = 'sine';
    sqLfo.frequency.value = 2.3 + rng() * 1.2;
    const sqLfoG = ctx.createGain(); sqLfoG.gain.value = 70;
    sqLfo.connect(sqLfoG); sqLfoG.connect(sqBp.frequency);
    // Individual link/road-wheel energy stays below 700 Hz and low-Q so it
    // adds weight without a permanent ringing pitch.
    const clat = ctx.createBufferSource();
    clat.buffer = crackleBuf; clat.loop = true; clat.start(now, rng() * 1.7);
    const clatBp = flt('bandpass', profile.clatterHz, 0.76);
    const gClat = ctx.createGain(); gClat.gain.value = 0;
    clat.connect(clatBp); clatBp.connect(gClat); gClat.connect(out);

    // Turbine whine is a restrained triangle layer, with T-80 and S-tank
    // families correctly joining Abrams in this powertrain profile.
    let tur = null, gTur = null;
    if (isTurbine) {
      tur = ctx.createOscillator(); tur.type = 'triangle'; tur.frequency.value = 620;
      gTur = ctx.createGain(); gTur.gain.value = profile.whineGain * 0.55;
      tur.connect(gTur); gTur.connect(out);
      tur.start(now);
    }

    sawA.start(now); sawB.start(now); sub.start(now); wob.start(now); sqLfo.start(now);

    const topMps = Math.max(1, ((entity.spec && entity.spec.topSpeedKmh) || 40) / 3.6);

    const voice = {
      out, pan, rangeLp,
      id: entity.id,
      lastDist: Infinity,
      lastGain: 0,
      lastCutoffHz: 18000,
      own: false,
      scoped: false,
      update(ent, isOwn, scoped) {
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
        sawA.frequency.setTargetAtTime(f0 * p, t, 0.12);
        sawB.frequency.setTargetAtTime(f0 * 2.02 * p, t, 0.12);
        sub.frequency.setTargetAtTime(f0 * 0.5 * p, t, 0.12);
        noiBp.frequency.setTargetAtTime(profile.intakeHz * (0.82 + 0.55 * rpm), t, 0.11);
        if (tur) {
          tur.frequency.setTargetAtTime(620 + 520 * rpm, t, 0.16);
          gTur.gain.setTargetAtTime(profile.whineGain * (0.55 + 0.45 * rpm), t, 0.16);
        }
        const tread = spd > 1.5 ? Math.min(1, (spd - 1.5) / 8) : 0;
        sqBp.frequency.setTargetAtTime(profile.trackHz * (0.88 + 0.32 * frac), t, 0.16);
        clatBp.frequency.setTargetAtTime(profile.clatterHz * (0.9 + 0.30 * frac), t, 0.16);
        gSq.gain.setTargetAtTime(tread * profile.trackGain, t, 0.14);
        gClat.gain.setTargetAtTime(tread * profile.clatterGain, t, 0.14);

        const pos = ent.state.pos;
        const s = spat(pos.x, pos.y, pos.z);
        const perspective = isOwn && scoped
          ? AUDIO_PERSPECTIVE_MIX.sniper
          : AUDIO_PERSPECTIVE_MIX.arcade;
        gNoi.gain.setTargetAtTime(profile.intakeGain + demand * (isTurbine ? 0.09 : 0.075), t, 0.08);
        const load = 0.44 + 0.30 * frac + 0.26 * demand;
        const gain = s.gain * load * (isOwn ? perspective.engineGain : 1);
        const cutoff = Math.min(distanceLowpassHz(s.dist),
          isOwn ? perspective.engineCutoffHz : 18000);
        out.gain.setTargetAtTime(gain, t, 0.1);
        rangeLp.frequency.setTargetAtTime(cutoff, t, 0.08);
        pan.pan.setTargetAtTime(s.pan * (isOwn ? perspective.enginePanScale : 1), t, 0.1);
        voice.lastDist = s.dist;
        voice.lastGain = gain;
        voice.lastCutoffHz = cutoff;
        voice.own = !!isOwn;
        voice.scoped = !!(isOwn && scoped);
        return s.dist;
      },
      kill() {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.1);
        const all = [sawA, sawB, sub, wob, noi, sq, sqLfo, clat, tur];
        for (const n of all) { if (n) { try { n.stop(t + 0.4); } catch (_) { /* stopped */ } } }
        sawA.onended = () => {
          try { out.disconnect(); rangeLp.disconnect(); pan.disconnect(); } catch (_) { /* detached */ }
        };
      },
    };
    return voice;
  }

  // ------------------------------------------------------ turret traverse ---

  /** Player-only turret traverse whir + gun elevation servo (engine bus). */
  function createTraverseRig() {
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 1;
    out.connect(engineBus);
    // Traverse motor: low pulse and broad gear-mesh noise. Narrow servo bands
    // read as an artificial whistle during every aim correction.
    const motor = ctx.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 84;
    const mLp = flt('lowpass', 330, 1.2);
    const gMotor = ctx.createGain(); gMotor.gain.value = 0;
    motor.connect(mLp); mLp.connect(gMotor); gMotor.connect(out);
    const gearN = ctx.createBufferSource();
    gearN.buffer = whiteBuf; gearN.loop = true; gearN.playbackRate.value = 0.7;
    gearN.start(now, rng() * 1.7);
    const gearBp = flt('bandpass', 560, 0.82);
    const gGear = ctx.createGain(); gGear.gain.value = 0;
    gearN.connect(gearBp); gearBp.connect(gGear); gGear.connect(out);
    // Gear-mesh AM texture.
    const am = ctx.createOscillator(); am.type = 'sine'; am.frequency.value = 13;
    const amG = ctx.createGain(); amG.gain.value = 0;
    am.connect(amG); amG.connect(gGear.gain);
    // Elevation servo remains distinct, but wide enough to avoid a ringing
    // stationary pitch.
    const servoN = ctx.createBufferSource();
    servoN.buffer = whiteBuf; servoN.loop = true; servoN.playbackRate.value = 1.1;
    servoN.start(now, rng() * 1.7);
    const servoBp = flt('bandpass', 980, 0.92);
    const gServo = ctx.createGain(); gServo.gain.value = 0;
    servoN.connect(servoBp); servoBp.connect(gServo); gServo.connect(out);
    motor.start(now); am.start(now);

    let lastPitch = null;
    return {
      update(ent, dt, scoped) {
        const t = ctx.currentTime;
        const cabinK = scoped ? 1.18 : 1;
        const rate = Math.min(1, Math.abs(ent.state.turretYawRate || 0) / TRAVERSE_RATE_FULL);
        gMotor.gain.setTargetAtTime(rate * 0.085 * cabinK, t, 0.06);
        gGear.gain.setTargetAtTime(rate * 0.055 * cabinK, t, 0.06);
        amG.gain.setTargetAtTime(rate * 0.03 * cabinK, t, 0.06);
        motor.frequency.setTargetAtTime(84 * (0.9 + 0.35 * rate), t, 0.08);
        const pitch = ent.state.gunPitch || 0;
        if (lastPitch != null && dt > 0.0001) {
          const pr = Math.min(1, Math.abs(pitch - lastPitch) / dt / 0.35);
          gServo.gain.setTargetAtTime(pr > 0.06 ? pr * 0.032 * cabinK : 0, t, 0.05);
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

  /** One distant workshop tool movement (or dry ratchet), random pan. */
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
        wire(v, nsrc(v, at, 0.025), flt('bandpass', 760 + rng() * 360, 0.82),
          env(at, 0.001, 0.48, 0.018));
      }
    } else {
      // A heavy tool or part set down on a workbench: compact low-mid body,
      // no lingering high-Q sheet-metal ring.
      const v = spawnVoice(when, 0.7, 0.045 + rng() * 0.05, panV, ambientBus);
      const f = 300 + rng() * 320;
      wire(v, osrc(v, 'triangle', f, when, 0.28), flt('lowpass', 1500, 0.72),
        env(when, 0.002, 0.62, 0.20));
      wire(v, osrc(v, 'triangle', f * 1.58, when, 0.16), env(when, 0.001, 0.18, 0.11));
      wire(v, nsrc(v, when, 0.035), flt('bandpass', 1150, 0.76), env(when, 0.001, 0.22, 0.025));
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

  // ------------------------------------------------------- loading sound --

  /**
   * A restrained loader bed built entirely from the already-created shared
   * buffers. It begins synchronously inside the Battle gesture, so world and
   * roster work is never presented as a silent/frozen page. No fetch, decode,
   * timer or per-frame update is added to the loading path.
   */
  function loadingStart() {
    if (loadingRig || !ctx) return;
    garageToneStop();
    ambientStop();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.16, now + 0.16);
    out.connect(musicBus);

    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 58;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.22;
    rumble.connect(rumbleGain); rumbleGain.connect(out);

    const machinery = ctx.createOscillator();
    machinery.type = 'triangle';
    machinery.frequency.value = 116;
    const machineryGain = ctx.createGain();
    machineryGain.gain.value = 0.055;
    machinery.connect(machineryGain); machineryGain.connect(out);

    const air = ctx.createBufferSource();
    air.buffer = windBuf; air.loop = true; air.playbackRate.value = 0.72;
    const airLp = flt('lowpass', 520, 0.55);
    const airGain = ctx.createGain(); airGain.gain.value = 0.16;
    air.connect(airLp); airLp.connect(airGain); airGain.connect(out);

    // Slow ready-rack pulse: movement without a distracting melody.
    const pulse = ctx.createOscillator();
    pulse.type = 'sine'; pulse.frequency.value = 0.82;
    const pulseGain = ctx.createGain(); pulseGain.gain.value = 0.035;
    pulse.connect(pulseGain); pulseGain.connect(out.gain);

    rumble.start(now); machinery.start(now); air.start(now); pulse.start(now);

    // Immediate deployment latch: a short pitch-falling metal/mechanical hit
    // makes Battle entry audible before the continuous bed settles. It is a
    // one-shot on the existing graph and adds no timer, sample decode, fetch,
    // or per-frame work to the loading path.
    const engage = spawnVoice(now + 0.01, 0.48, 0.32, 0, musicBus);
    const engageTone = osrc(engage, 'sawtooth', 152, now + 0.01, 0.34);
    engageTone.frequency.exponentialRampToValueAtTime(58, now + 0.28);
    wire(engage, engageTone, flt('lowpass', 720, 0.8),
      env(now + 0.01, 0.002, 0.5, 0.26));
    wire(engage, nsrc(engage, now + 0.01, 0.045),
      flt('bandpass', 1180, 0.72), env(now + 0.01, 0.001, 0.22, 0.035));
    loadingRig = {
      kill() {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        for (const node of [rumble, machinery, air, pulse]) {
          try { node.stop(t + 0.34); } catch (_) { /* already stopped */ }
        }
        rumble.onended = () => { try { out.disconnect(); } catch (_) { /* detached */ } };
      },
    };
    logSound('loading:start');
  }

  function loadingStop() {
    if (!loadingRig) return;
    loadingRig.kill();
    loadingRig = null;
    logSound('loading:stop');
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
    const ownShot = listenerOwnerId != null
      ? e.shooterId === listenerOwnerId
      : !!e.isPlayer;
    const s = spat(mp[0], mp[1], mp[2]);
    const dist = s.dist, gain = s.gain;
    gunshot(mp[0], mp[1], mp[2], e.caliberMm, ownShot,
      e.weaponSound, e.muzzleIndex);
    if (!ownShot) scheduleWhizz(e);
    if (e.isPlayer) radio.say('firing', { prob: 0.18, delayS: 0.08 });
    logSound('shell:fired', {
      id: e.shellId, shooterId: e.shooterId, own: ownShot,
      scoped: ownShot && listenerScoped, caliberMm: e.caliberMm,
      report: resolveWeaponReportProfile(e.weaponSound).kind, dist, gain,
    });
  }

  const CREW_DAMAGE_CALL = {
    commander: 'commander_down', gunner: 'gunner_down',
    driver: 'driver_down', loader: 'loader_down',
  };
  const MODULE_DAMAGE_CALL = {
    ammoRack: 'ammo_rack', gun: 'gun_damaged', trackL: 'track_gone',
    trackR: 'track_gone', engine: 'engine_damaged', fuelTank: 'fuel_tank',
    optics: 'optics_damaged', radio: 'radio_damaged',
  };
  const MODULE_DAMAGE_ORDER = ['ammoRack', 'gun', 'trackL', 'trackR', 'engine', 'fuelTank', 'optics', 'radio'];
  const CREW_DAMAGE_ORDER = ['commander', 'gunner', 'driver', 'loader'];

  /** One shell gets one context-accurate report, never a hit line plus a
   *  backlog of module lines from the synchronous module:state fan-out. */
  function incomingCallFor(e) {
    if (e.destroyed || e.fireStarted) return null; // fire/death have dedicated edges
    const crew = new Set(e.crewHit || []);
    for (const role of CREW_DAMAGE_ORDER) if (crew.has(role)) return CREW_DAMAGE_CALL[role];
    const modules = new Map((e.modulesHit || []).map((m) => [m.module, m.newState]));
    for (const name of MODULE_DAMAGE_ORDER) {
      if (!modules.has(name)) continue;
      if ((name === 'trackL' || name === 'trackR') && modules.get(name) !== 'red') continue;
      return MODULE_DAMAGE_CALL[name];
    }
    if ((e.damage || 0) > 0) return 'were_hit';
    if (e.kind === 'ricochet' || e.kind === 'nonpen' || e.kind === 'spaced_absorb') return 'bounced_us';
    return null;
  }

  function onShellHit(e) {
    const p = e.pos;
    // Receiving-end feel: a damaging hit on the PLAYER adds
    // an interior low whump + rumble under the impact sound. Deflections
    // deliberately get NONE — a bounce must feel like relief, not damage.
    const playerHit = (listenerOwnerId != null && e.targetId === listenerOwnerId) ||
      (listenerOwnerId == null && playerId != null && e.targetId === playerId);
    // Like the FX path, the reactive charge is additive to the deeper armor
    // result. Play its sharp cassette blast even when the final event is pen.
    if (isEraActivation(e) && e.kind !== 'era') eraPop(p[0], p[1], p[2]);
    switch (e.kind) {
      case 'pen':
        clang(p[0], p[1], p[2], playerHit && (e.damage || 0) > 0 ? 1 : 0);
        break;
      case 'ricochet':
        ping(p[0], p[1], p[2], true);
        break;
      case 'nonpen':
      case 'spaced_absorb':
        // Non-pen still slams the plate — a smaller whump than a pen.
        ping(p[0], p[1], p[2], false, playerHit ? 0.45 : 0);
        break;
      case 'era':
        eraPop(p[0], p[1], p[2]);
        break;
      case 'he_pen':
      case 'he_splash':
        if (sfxReady) {
          bakedShellExplosion(p[0], p[1], p[2], e.caliberMm || 122, false);
          if (playerHit && (e.damage || 0) > 0) hitWhump(0.9);
        } else {
          synthExplosion(p[0], p[1], p[2], 0.55 + (e.caliberMm || 122) / 160, false, false);
        }
        break;
      case 'terrain':
        if (sfxReady) bakedShellExplosion(p[0], p[1], p[2], e.caliberMm || 100, true);
        else synthExplosion(p[0], p[1], p[2], 0.4 + (e.caliberMm || 100) / 220, true, false);
        break;
      default:
        break;
    }
    logSound('shell:hit', {
      id: e.shellId, kind: e.kind, targetId: e.targetId,
      attackerId: e.attackerId, occupied: playerHit, damage: e.damage || 0,
    });
    // Voice director — exactly one report per resolved shell. Incoming damage
    // chooses the most actionable crew/module consequence; outgoing fire
    // reports the final result only after the impact is known.
    if (playerId == null) return;
    if (e.targetId === playerId) {
      const call = incomingCallFor(e);
      if (call) radio.say(call, { delayS: 0.12 });
      if (!lowHpCalled && !e.destroyed && (e.damage || 0) > 0 &&
          (e.targetMaxHp || 0) > 0 && e.targetHpAfter / e.targetMaxHp <= 0.25) {
        // Only add the threshold warning when the shell had no more specific
        // consequence; otherwise it would replace a gun/crew/fire warning.
        if (!call || call === 'were_hit') {
          lowHpCalled = true;
          radio.say('low_hp', { delayS: 0.35 });
        }
      }
    } else if (e.attackerId === playerId && e.targetId != null && !e.destroyed) {
      const rackHit = (e.modulesHit || []).some((m) => m.module === 'ammoRack');
      if (rackHit) radio.say('enemy_ammo_rack', { delayS: 0.18 });
      else if (((e.modulesHit && e.modulesHit.length) || (e.crewHit && e.crewHit.length)) &&
          (e.damage || 0) > 0) radio.say('enemy_crit', { prob: 0.72, delayS: 0.18 });
      else if ((e.kind === 'pen' || e.kind === 'he_pen') && (e.damage || 0) > 0) {
        radio.say('penetration', { prob: 0.82, delayS: 0.18 });
      } else if (e.kind === 'ricochet' || e.kind === 'nonpen' || e.kind === 'spaced_absorb') {
        radio.say('ricochet', { prob: 0.8, delayS: 0.16 });
      }
    }
  }

  function onTankDestroyed(e) {
    const p = e.pos;
    // The kill blast keys off the destruction CAUSE —
    // 'ammorack' detonation (turret-pop accent) > 'shot' > 'fire' burn-out.
    if (sfxReady) {
      bakedTankExplosion(p[0], p[1], p[2],
        e.cause === 'ammorack' || e.cause === 'fire' ? e.cause : 'shot');
    } else {
      synthExplosion(p[0], p[1], p[2], 1.8, false, true);
    }
    const eng = engines.get(e.id);
    if (eng) { eng.kill(); engines.delete(e.id); }
    landing.delete(e.id);
    if (playerId != null && e.id === playerId) {
      stopFireAlarm();
      stopTraverseRig();
      playerBurning = false;
      radio.silence();
    } else if (playerId != null && e.killerId === playerId) {
      killSting();
      radio.say('target_destroyed', { delayS: 0.22 });
    }
    logSound('tank:destroyed', {
      id: e.id, killerId: e.killerId, cause: e.cause || 'shot',
      occupied: e.id === listenerOwnerId,
    });
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
    // The parent shell:hit already selected one best call from the entire hit.
    // Keep alarms/world sounds above, but never enqueue each module again.
    if (e.source === 'hit') {
      if (worse && e.module === 'ammoRack') ammoRackWarning();
      return;
    }
    if (worse) {
      if (e.module === 'ammoRack') ammoRackWarning();
      const call = MODULE_DAMAGE_CALL[e.module];
      if (call && (e.state === 'red' || e.module !== 'trackL' && e.module !== 'trackR')) {
        radio.say(call, { delayS: 0.1 });
      }
    } else if (e.repaired) {
      const call = e.module === 'gun' ? 'gun_repaired'
        : (e.module === 'trackL' || e.module === 'trackR') ? 'track_repaired'
          : e.module === 'engine' ? 'engine_repaired' : 'repairs';
      radio.say(call, { delayS: 0.12 });
    }
  }

  // ----------------------------------------------------------- public API ---

  /**
   * Create (or resume) the AudioContext. MUST be called from a user gesture.
   * Before this, every other method is a silent no-op.
   */
  function resume() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;   // headless / unsupported: stay silently inert
      ctx = new AC({ latencyHint: 'interactive' });
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (graphReady) return;
    buildGraph();
    buildBuffers();
    applyMaster();
    radio.load(ctx, voiceBus);
    loadSfx();
    installHoverTicks();
    if (phase === 'garage') garageToneStart();
    installDebugSurface();
    graphReady = true;
  }

  /**
   * Subscribe to game events. Safe to call before resume() — handlers no-op
   * until the context exists.
   * @param {import('../game/stateCore.ts').EventBus} bus injected event bus
   */
  function bindBus(bus) {
    bus.on('shell:fired', (e) => { if (ctx) onShellFired(e); });
    bus.on('shell:hit', (e) => { if (ctx) onShellHit(e); });
    // Shells that terminate in the world (dirt/rubble) were silent before the
    // SOUND overhaul — fx already keyed off this event, audio now does too.
    bus.on('shell:expired', (e) => {
      if (ctx && e && (e.hitTerrain || e.hitKind === 'prop') && e.pos) {
        dirtImpact(e.pos[0], e.pos[1], e.pos[2]);
        logSound('shell:expired', { id: e.shellId, hitKind: e.hitKind || 'terrain' });
      }
    });
    bus.on('player:reload', (e) => {
      if (!ctx || !e || phase !== 'battle' || battleOver) return;
      const total = Math.max(0.05, Number(e.total) || 0.05);
      const kind = e.kind || 'shell';
      const caliberMm = Math.max(12, Number(e.caliberMm) || 100);
      const restarted = !reloadCycle.active || reloadCycle.kind !== kind ||
        Math.abs(reloadCycle.total - total) > 0.01 || e.t > reloadCycle.lastT + 0.04;
      if (restarted) {
        reloadCycle.active = true;
        reloadCycle.total = total;
        reloadCycle.kind = kind;
        reloadCycle.caliberMm = caliberMm;
        reloadCycle.lastT = e.t;
        reloadCycle.nextCue = 0;
        reloadCycle.plan = resolveReloadCuePlan(total, kind, caliberMm);
        logSound('reload:start', { kind, total, caliberMm });
      }
      const progress = Number.isFinite(e.progress)
        ? Math.max(0, Math.min(1, e.progress))
        : Math.max(0, Math.min(1, 1 - (Number(e.t) || 0) / total));
      const cues = reloadCycle.plan.cues;
      while (reloadCycle.nextCue < cues.length &&
          progress + 1e-6 >= cues[reloadCycle.nextCue].at) {
        const cue = cues[reloadCycle.nextCue++];
        reloadMechanicalSound(cue.type, caliberMm);
        logSound('reload:cue', { cue: cue.type, kind, progress, caliberMm });
      }
      reloadCycle.lastT = Number(e.t) || 0;
      if (e.done) {
        if (reloadCycle.plan.ready) {
          reloadReadySound(caliberMm);
          logSound('reload:ready', { kind, total, caliberMm });
        }
        reloadCycle.active = false;
        reloadCalled = false;
        // Autocannon cycles keep their mechanical cue but do not flood the
        // radio; spoken ready calls are for reloads the player had to wait on.
        if ((e.total || 0) >= 1.25) radio.say('reloaded', { prob: 0.82, delayS: 0.08 });
      } else if (!reloadCalled && (e.total || 0) >= 2.2) {
        reloadCalled = true;
        radio.say('reloading', { prob: 0.5, delayS: 0.1 });
      }
    });
    bus.on('tank:destroyed', (e) => { if (ctx) onTankDestroyed(e); });
    // gameplay_feel r2: blocked-drive collision feedback (state.ts emits once
    // per genuine hit, 5.4 km/h closing-speed floor)
    bus.on('tank:impact', (e) => { if (ctx) onTankImpact(e); });
    bus.on('tank:ram', (e) => { if (ctx) onTankRam(e); });
    bus.on('prop:crushed', (e) => { if (ctx) onPropCrushed(e); }); // gameplay_feel r6
    bus.on('tank:fire', (e) => {
      if (!ctx) return;
      if (e.burning) startFireLoop(e.id); else stopFireLoop(e.id);
      logSound('tank:fire', { id: e.id, burning: !!e.burning, occupied: e.id === listenerOwnerId });
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
      // A crew call belongs to a contact this tank actually acquired, not a
      // teammate's contact hundreds of metres away on the shared radio net.
      if (info && info.team === 'enemy' && e.spotterId === playerId) {
        radio.say('enemy_spotted', { delayS: 0.1 });
      }
    });
    // Match the actual three-second sixth-sense fuse used by the HUD instead
    // of announcing detection on the raw spotting edge.
    bus.on('player:spotted', () => {
      if (ctx && phase === 'battle' && !battleOver) radio.say('sixth_sense', { delayS: 3.0 });
    });
    bus.on('ui:consumableUsed', (e) => {
      if (!ctx || !e || phase !== 'battle' || battleOver) return;
      if (e.slot === 0) radio.say('repairs', { delayS: 0.12 });
      else if (e.slot === 1) radio.say('crew_recovered', { delayS: 0.12 });
    });
    bus.on('ui:click', () => { if (ctx) uiClick(); });
    // Phase flow only prepares the soundscape. The horn and command wait for
    // battle:rollout, emitted exactly when the visible countdown reaches zero.
    bus.on('phase:change', (e) => {
      const next = (e && e.phase) || 'garage';
      const prev = phase;
      phase = next;
      battleOver = false;
      pendingResult = null;
      reloadCalled = false;
      reloadCycle.active = false;
      reloadCycle.plan = null;
      lowHpCalled = false;
      if (!ctx) return;
      if (next === 'battle' && prev !== 'battle') {
        garageToneStop();
        stopWorldLoops('battle-reset');
        tankInfo.clear();
        playerId = null;
        moduleState.clear();
        heartbeatArmedBelow = 0;
      } else if (next !== 'battle' && prev === 'battle') {
        loadingStop();
        stopWorldLoops(`phase:${next}`);
        stopFireAlarm();
        stopTraverseRig();
        radio.silence();
        playerBurning = false;
        listenerOwnerId = null;
        listenerScoped = false;
        if (next === 'garage') garageToneStart();
      } else if (next === 'garage' && prev !== 'garage') {
        // Some presentation flows insert a non-battle results phase before
        // garage. The room tone belongs to the destination, not only to a
        // direct battle -> garage edge.
        loadingStop();
        garageToneStart();
      }
    });
    bus.on('battle:rollout', () => {
      if (!ctx || phase !== 'battle' || battleOver) return;
      battleHorn();
      radio.say('battle_start', { delayS: 0.48 });
    });
    bus.on('battle:ended', (e) => {
      if (!ctx || battleOver) return;
      battleOver = true;
      pendingResult = e && e.result ? e.result : 'draw';
      radio.cancelPending(['shot_result'], true);
      stopFireAlarm();
    });
    // Results wait until the kill-cam/report gate hands presentation back to
    // the battle-over UI. This keeps victory/defeat speech out of the replay.
    bus.on('battle:presented', (e) => {
      if (!ctx) return;
      const result = (e && e.result) || pendingResult || 'draw';
      resultFanfare(result);
      radio.say(result === 'victory' ? 'victory' : result === 'defeat' ? 'defeat' : 'draw',
        { delayS: 0.2 });
      pendingResult = null;
    });
    // KILL-CAM: replay slow-mo ducks the battle beds under the narration.
    bus.on('killcam:begin', () => {
      if (!ctx) return;
      duckK = 0.35;
      // The replay can reach impact only a few milliseconds after this edge
      // when a test/debug fast-forwards. Pin the live buses immediately so a
      // full-level cannon/engine transient never masks the cinematic impact.
      applyChannelVolumes(false);
    });
    bus.on('killcam:done', () => {
      if (!ctx) return;
      duckK = 1;
      applyChannelVolumes(true);
    });
    bus.on('killcam:impact', (e) => { if (ctx) killcamImpact(e); });
    // PAUSE (Esc overlay over a live battle — main.ts tick edge): duck the
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
   * @param {{pos: {x,y,z}, forward: {x,y,z}, kind?: string,
   *   ownerId?: string|null, scoped?: boolean}} listener camera/vehicle pose
   * @param {Array<object>} tanks all TankEntity objects (alive and dead)
   */
  function rankEngineCandidate(ent, score) {
    let at = engineCandidateCount;
    if (at < MAX_ENGINE_VOICES) {
      engineCandidateCount++;
    } else {
      at = MAX_ENGINE_VOICES - 1;
      if (score >= engineCandidateScore[at]) return;
    }
    while (at > 0 && score < engineCandidateScore[at - 1]) {
      engineCandidates[at] = engineCandidates[at - 1];
      engineCandidateScore[at] = engineCandidateScore[at - 1];
      at--;
    }
    engineCandidates[at] = ent;
    engineCandidateScore[at] = score;
  }

  function isEngineCandidate(id) {
    for (let i = 0; i < engineCandidateCount; i++) {
      if (engineCandidates[i] && engineCandidates[i].id === id) return true;
    }
    return false;
  }

  function update(dt, listener, tanks) {
    if (!ctx) return;
    // Refresh listener pose (XZ forward, normalized defensively).
    lx = listener.pos.x; ly = listener.pos.y; lz = listener.pos.z;
    listenerKind = listener.kind || 'camera';
    listenerOwnerId = listener.ownerId ?? null;
    listenerScoped = !!listener.scoped && listenerKind !== 'killcam-camera';
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

    // First pass mirrors identity/position before any event-side decisions,
    // then ranks the nearest audible engines. Existing voices receive a small
    // hysteresis bias so equal-distance tanks do not churn at the cap edge.
    for (let i = 0; i < tanks.length; i++) {
      const ent = tanks[i];
      if (!ent || !ent.state || !ent.state.pos) continue;
      const id = ent.id;
      let info = tankInfo.get(id);
      if (!info) {
        info = { team: ent.team, isPlayer: !!ent.isPlayer, pos: ent.state.pos };
        tankInfo.set(id, info);
      } else {
        info.team = ent.team;
        info.isPlayer = !!ent.isPlayer;
        info.pos = ent.state.pos;
      }
      if (ent.isPlayer) playerId = id;
    }
    if (listenerOwnerId == null && listenerKind === 'player-tank') listenerOwnerId = playerId;

    for (let i = 0; i < engineCandidateCount; i++) engineCandidates[i] = null;
    engineCandidateCount = 0;
    for (let i = 0; i < tanks.length; i++) {
      const ent = tanks[i];
      if (!ent || !ent.state || !ent.state.pos || ent.combat?.destroyed) continue;
      if (probeEngineSoloId != null && ent.id !== probeEngineSoloId) continue;
      const pos = ent.state.pos;
      const dx = pos.x - lx, dy = pos.y - ly, dz = pos.z - lz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const own = ent.id === listenerOwnerId;
      const active = engines.has(ent.id);
      if (!own && !engineAudibleAtDistance(dist, active)) continue;
      const score = own ? -1e9
        : dist - (active ? AUDIO_DISTANCE_MODEL.activeEngineBiasM : 0);
      rankEngineCandidate(ent, score);
    }

    for (const [id, eng] of engines) {
      if (isEngineCandidate(id)) continue;
      eng.kill();
      engines.delete(id);
      landing.delete(id);
      logSound('engine:stop', { id, reason: 'range-or-priority' });
    }

    for (let i = 0; i < tanks.length; i++) {
      const ent = tanks[i];
      // Deferred battle staging leaves roster shells in game.tanks while the
      // garage is open; they intentionally have no simulation state yet.
      // Audio must ignore them until setupBattle supplies a world position.
      if (!ent || !ent.state || !ent.state.pos) continue;
      const id = ent.id;
      const dead = !!(ent.combat && ent.combat.destroyed);
      let eng = engines.get(id);
      if (!dead && isEngineCandidate(id)) {
        if (!eng) {
          eng = createEngineVoice(ent);
          engines.set(id, eng);
          logSound('engine:start', { id, own: id === listenerOwnerId });
        }
        eng.update(ent, id === listenerOwnerId, listenerScoped);
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
        traverseRig.update(ent, dt, listenerScoped);
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

  /** Toggle the audible Battle-loading bed. */
  function loadingOn(on) {
    if (!ctx) return;
    if (on) loadingStart();
    else {
      loadingStop();
      if (phase === 'garage') garageToneStart();
    }
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
      // COMBAT-SFX r4 introspection (tools/sfx-smoke.mjs): baked-sample play
      // trail {n,t,g,r} + load state of the baked combat set.
      get sfxLog() { return sfxLog; },
      get sfxLoaded() { return sfxReady; },
      get sfxCount() { return sfxBufs.size; },
      get killcamSfxLog() { return killcamSfxLog; },
      get soundLog() { return soundLog; },
      get loadingActive() { return !!loadingRig; },
      listenerState() {
        return {
          x: lx, y: ly, z: lz, fx: lfx, fz: lfz,
          kind: listenerKind, ownerId: listenerOwnerId, scoped: listenerScoped,
        };
      },
      spatialAt(x, y, z) { return { ...spat(x, y, z) }; },
      engineState() {
        return [...engines.entries()].map(([id, eng]) => ({
          id,
          dist: eng.lastDist,
          gain: eng.lastGain,
          cutoffHz: eng.lastCutoffHz,
          own: eng.own,
          scoped: eng.scoped,
        })).sort((a, b) => a.dist - b.dist);
      },
      setEngineProbeSolo(id = null) {
        probeEngineSoloId = id || null;
        return probeEngineSoloId;
      },
      // force: the probe tests the BUS level, not the radio discipline —
      // cooldowns must never turn a slider check into a false silence.
      sayVoice(id) { return radio.say(id, { force: true }); },
      clearVoiceQueue() { radio.silence(); },
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
          cinematic: cinematicBus.gain.value,
          engine: engineBus.gain.value,
          ambient: ambientBus.gain.value,
          music: musicBus.gain.value,
          voice: voiceBus.gain.value,
          chanVol: { ...chanVol },
          pauseK, // PAUSE duck factor (tools/pause-probe.mjs)
          duckK,
          uiVolEvents: _uiVolEvents,
        };
      },
      // Raw node handles — probe-only introspection, never used by the game.
      get _nodes() { return { master, comp, limiter, sfxBus, cinematicBus, engineBus, ambientBus, musicBus, voiceBus }; },
    };
  }

  return {
    resume, bindBus, update, setMasterVolume, mute, playGarageSting, loadingOn, ambientOn,
    warmBattleEvents,
    /** Non-spatial player result cue; preserves pen/ricochet/nonpen identity. */
    hitConfirm(kind, damage = 0) { if (ctx) hitConfirmSound(kind, damage); },
  };
}
