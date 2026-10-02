/**
 * Per-vehicle continuous sound: the engine bank, the running gear and the
 * hull machinery of one tank, driven every frame by the vehicle audio model.
 *
 *   engine bank  – idle/low/mid/high loops of the powertrain family,
 *                  pitched by RPM (≤ ±30 %) and crossfaded by RPM band,
 *                  brightened by load, roughened by damage
 *   running gear – slow/fast track loops for the surface under the hull,
 *                  rate-locked to track speed, crossfaded across surfaces;
 *                  pivot scrub, brake skid, fording wash
 *   machinery    – turret drive and gun servo (occupied hull), procedural
 *                  gear-mesh / turbo / electric-drive whines, cabin hum and
 *                  rattle in the gunner's sight, fire on the engine deck
 *
 * Level of detail: the occupied hull gets everything; near tanks get three
 * engine bands, both track loops and the scrub; far tanks one engine band.
 * Every rig ends in one gain → lowpass → stereo pan chain on its bus.
 */

import {
  airAbsorptionCutoffHz, bandWeight, clamp, dbToGain, distanceAttenuationDb,
  type AtmosphereProfile, type RelativePosition,
} from './audioMath.ts';
import type { AssetLibrary } from './assetLibrary.ts';
import type { Mixer } from './mixer.ts';
import type { VoicePool } from './voicePool.ts';
import {
  engineFallback, whine, type EngineFallback, type NoiseBank, type WhineRig,
} from './procedural.ts';
import {
  createVehicleAudioEvents, createVehicleAudioState, stepVehicleAudio,
  type ModuleHealth, type SurfaceId, type VehicleAudioInput, type VehicleAudioState,
} from './vehicleAudioModel.ts';
import { ENGINE_FAMILIES, type VehicleAudioIdentity } from './vehicleAudioProfiles.ts';

export type RigLod = 'own' | 'near' | 'far';

interface RigDeps {
  readonly mixer: Mixer;
  readonly library: AssetLibrary;
  readonly pool: VoicePool;
  readonly noise: NoiseBank;
  readonly random: () => number;
  readonly reverb: boolean;
}

/** Per-frame facts the engine resolves for a rig. */
export interface RigFrame {
  dtS: number;
  rel: RelativePosition;
  x: number;
  y: number;
  z: number;
  own: boolean;
  scoped: boolean;
  surface: SurfaceId;
  waterDepthM: number;
  atmosphere: AtmosphereProfile;
  occluded: number;
  doppler: number;
  /** Turret slew rate (rad/s) and gun pitch rate (rad/s), occupied hull only. */
  turretRate: number;
  pitchRate: number;
  cabin: number;
  input: VehicleAudioInput;
}

interface Layer {
  asset: string;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  baseRate: number;
  lastGain: number;
  lastRate: number;
}

const BAND_NAMES = ['idle', 'low', 'mid', 'high'] as const;
/** Slow/fast track loop centres, m/s of track speed. */
const TRACK_CENTRES: readonly number[] = [2.5, 10];

function bandsFor(lod: RigLod): readonly (typeof BAND_NAMES[number])[] {
  if (lod === 'own') return BAND_NAMES;
  if (lod === 'near') return ['idle', 'mid', 'high'];
  return ['mid'];
}

function bandCentres(idle: number, names: readonly string[]): number[] {
  const table: Record<string, number> = { idle, low: 0.5, mid: 0.72, high: 0.95 };
  return names.map((n) => table[n]);
}

export interface VehicleRig {
  readonly id: string;
  readonly lod: RigLod;
  readonly state: VehicleAudioState;
  readonly identity: VehicleAudioIdentity;
  readonly lastGain: number;
  readonly lastDistance: number;
  /** Rig-level lowpass (air absorption + occlusion), Hz. */
  readonly lastCutoff: number;
  /** The air-absorption part of that lowpass alone, Hz. */
  readonly lastAirHz: number;
  setLod(lod: RigLod): void;
  setBurning(burning: boolean): void;
  startEngine(): void;
  update(frame: RigFrame): void;
  kill(fadeS?: number): void;
}

export function createVehicleRig(deps: RigDeps, id: string, identity: VehicleAudioIdentity, initialLod: RigLod): VehicleRig {
  const { mixer, library, pool, noise, random } = deps;
  const ctx = mixer.ctx;
  const family = ENGINE_FAMILIES[identity.engine];
  const state = createVehicleAudioState(family);
  const events = createVehicleAudioEvents();
  let lod: RigLod = initialLod;
  let dead = false;
  let lastGain = 0;
  let lastDistance = 0;
  let lastCutoff = 20000;
  let lastAirHz = 20000;
  let surface: SurfaceId | null = null;
  let engineStartAt = 0;
  let burning = false;

  // ---- output chain.
  const output = ctx.createGain();
  output.gain.value = 0;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 20000;
  lowpass.Q.value = 0.55;
  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  const engineTone = ctx.createBiquadFilter();
  engineTone.type = 'lowpass';
  engineTone.frequency.value = 9000;
  engineTone.Q.value = 0.5;
  const engineSum = ctx.createGain();
  const gearSum = ctx.createGain();
  engineSum.connect(engineTone);
  engineTone.connect(output);
  gearSum.connect(output);
  output.connect(lowpass);
  if (panner) lowpass.connect(panner);
  let sendGain: GainNode | null = null;
  let busNode: AudioNode = mixer.input(initialLod === 'own' ? 'own' : 'vehicles');
  const tail: AudioNode = panner ?? lowpass;
  tail.connect(busNode);
  if (deps.reverb) {
    sendGain = ctx.createGain();
    sendGain.gain.value = 0.06;
    tail.connect(sendGain);
    sendGain.connect(mixer.reverbInput);
  }

  const engineLayers = new Map<string, Layer>();
  const gearLayers = new Map<string, Layer>();
  // Engine band assets of the current LOD and their RPM centres (rebuilt on LOD change).
  let bandAssets: string[] = [];
  let bandCentresNow: number[] = [];
  let fallback: EngineFallback | null = null;
  const whines: { gear?: WhineRig; turbo?: WhineRig; electric?: WhineRig; turbine?: WhineRig } = {};

  function makeLayer(asset: string, dest: AudioNode): Layer {
    // A live loop's buffer must outlive the library's idle eviction.
    library.pin([asset]);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(dest);
    return { asset, source: null, gain, baseRate: 1, lastGain: 0, lastRate: 1 };
  }

  /** Start a layer's loop once its buffer has decoded (no-op until then). */
  function ensureSource(layer: Layer): boolean {
    if (layer.source) return true;
    const buffer = library.variant(layer.asset, 0);
    if (!buffer) {
      library.pick(layer.asset, random); // kick the load
      return false;
    }
    const record = library.record(layer.asset);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const loop = record?.l;
    if (loop) {
      source.loopStart = loop[0];
      source.loopEnd = Math.min(loop[1], buffer.duration);
    }
    source.connect(layer.gain);
    const span = loop ? loop[1] - loop[0] : buffer.duration;
    const offset = (loop ? loop[0] : 0) + random() * Math.max(0.01, span);
    source.start(ctx.currentTime + 0.01, offset);
    layer.source = source;
    return true;
  }

  function setLayer(layer: Layer, gain: number, rate: number): void {
    if (!ensureSource(layer)) return;
    const t = ctx.currentTime;
    if (Math.abs(gain - layer.lastGain) > 0.004) {
      layer.gain.gain.setTargetAtTime(gain, t, 0.06);
      layer.lastGain = gain;
    }
    const r = clamp(rate, 0.5, 2);
    if (Math.abs(r - layer.lastRate) > 0.002) {
      layer.source!.playbackRate.setTargetAtTime(r, t, 0.05);
      layer.lastRate = r;
    }
  }

  function dropLayer(layer: Layer, fadeS = 0.35): void {
    const t = ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(t);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, t);
    layer.gain.gain.linearRampToValueAtTime(0, t + fadeS);
    if (layer.source) {
      try { layer.source.stop(t + fadeS + 0.02); } catch { /* stopped */ }
      const g = layer.gain;
      layer.source.onended = () => { try { g.disconnect(); } catch { /* detached */ } };
    } else {
      try { layer.gain.disconnect(); } catch { /* detached */ }
    }
  }

  function engineAsset(band: string): string {
    return `engine_${identity.engine}_${band}`;
  }

  function rebuildEngine(): void {
    const names = bandsFor(lod);
    bandAssets = names.map(engineAsset);
    bandCentresNow = bandCentres(family.idleRpm, names);
    const wanted = new Set(bandAssets);
    for (const [asset, layer] of engineLayers) {
      if (!wanted.has(asset)) { dropLayer(layer); engineLayers.delete(asset); }
    }
    for (const asset of wanted) if (!engineLayers.has(asset)) engineLayers.set(asset, makeLayer(asset, engineSum));
  }

  function gearAsset(kind: string, speed: 'slow' | 'fast'): string {
    return `tracks_${identity.tracks}_${kind}_${speed}`;
  }

  function trackSurfaceAsset(s: SurfaceId): string {
    return s === 'water' ? 'mud' : s;
  }

  function retrack(next: SurfaceId): void {
    surface = next;
    const kind = trackSurfaceAsset(next);
    const speeds: ('slow' | 'fast')[] = lod === 'far' ? ['fast'] : ['slow', 'fast'];
    const wanted = new Set(speeds.map((sp) => gearAsset(kind, sp)));
    for (const [asset, layer] of gearLayers) {
      if (asset.startsWith('tracks_') && !wanted.has(asset)) {
        dropLayer(layer, 0.45);
        gearLayers.delete(asset);
      }
    }
    for (const asset of wanted) if (!gearLayers.has(asset)) gearLayers.set(asset, makeLayer(asset, gearSum));
    if (lod !== 'far') {
      for (const asset of ['track_squeal_loop', 'track_skid_loop', 'water_wade_loop', 'engine_knock_loop']) {
        if (!gearLayers.has(asset)) gearLayers.set(asset, makeLayer(asset, asset === 'engine_knock_loop' ? engineSum : gearSum));
      }
    } else {
      for (const asset of ['track_squeal_loop', 'track_skid_loop', 'water_wade_loop', 'engine_knock_loop']) {
        const layer = gearLayers.get(asset);
        if (layer) { dropLayer(layer); gearLayers.delete(asset); }
      }
    }
    library.load([...wanted]);
  }

  function ownExtras(on: boolean): void {
    const extras = [identity.turretDrive === 'hydraulic' ? 'turret_hydraulic_loop' : 'turret_electric_loop',
      'elevation_servo_loop', 'interior_hum_loop', 'interior_rattle_loop'];
    for (const asset of extras) {
      const layer = gearLayers.get(asset);
      if (on && !layer) gearLayers.set(asset, makeLayer(asset, asset.startsWith('interior') ? mixer.input('interior') : gearSum));
      if (!on && layer) { dropLayer(layer); gearLayers.delete(asset); }
    }
    if (on) library.load(extras);
  }

  function syncWhines(): void {
    const wantGear = lod !== 'far';
    if (wantGear && !whines.gear) whines.gear = whine(ctx, gearSum, 'gear');
    if (!wantGear && whines.gear) { whines.gear.stop(); delete whines.gear; }
    const wantTurbo = lod !== 'far' && identity.turboWhistle > 0.3;
    if (wantTurbo && !whines.turbo) whines.turbo = whine(ctx, engineSum, 'turbo');
    if (!wantTurbo && whines.turbo) { whines.turbo.stop(); delete whines.turbo; }
    const wantElectric = lod !== 'far' && identity.electricDrive > 0;
    if (wantElectric && !whines.electric) whines.electric = whine(ctx, gearSum, 'electric');
    if (!wantElectric && whines.electric) { whines.electric.stop(); delete whines.electric; }
    const wantTurbine = lod !== 'far' && identity.turbineAux > 0;
    if (wantTurbine && !whines.turbine) whines.turbine = whine(ctx, engineSum, 'turbo');
    if (!wantTurbine && whines.turbine) { whines.turbine.stop(); delete whines.turbine; }
  }

  function applyLod(next: RigLod): void {
    const busId = next === 'own' ? 'own' : 'vehicles';
    const nextBus = mixer.input(busId);
    if (nextBus !== busNode) {
      try { tail.disconnect(busNode); } catch { /* detached */ }
      tail.connect(nextBus);
      busNode = nextBus;
    }
    lod = next;
    rebuildEngine();
    if (surface) retrack(surface);
    ownExtras(next === 'own');
    syncWhines();
    library.load(bandsFor(next).map(engineAsset));
  }

  applyLod(initialLod);

  function emitEvents(frame: RigFrame): void {
    for (let i = 0; i < events.count; i++) {
      const event = events.items[i];
      const hull = frame.own;
      const at = hull ? { space: 'hull' as const, bus: 'own' as const } : { x: frame.x, y: frame.y, z: frame.z };
      switch (event.type) {
        case 'shiftUp':
        case 'shiftDown':
          if (lod !== 'far' && family.shift !== 'none') pool.play('gear_shift', { ...at, gainDb: -4 + 6 * event.strength });
          break;
        case 'brakeSqueal':
          if (lod !== 'far') pool.play('brake_squeal', { ...at, gainDb: -8 + 8 * event.strength });
          break;
        case 'skidStart':
          if (lod !== 'far' && (frame.surface === 'hard' || frame.surface === 'earth')) pool.play('brake_hiss', { ...at, gainDb: -6 });
          break;
        case 'land':
          pool.play('susp_land', { ...at, gainDb: -10 + 12 * event.strength + 4 * identity.mass });
          if (hull && event.strength > 0.35) pool.play('susp_creak', { space: 'hull', bus: 'own', delayS: 0.25, gainDb: -6 });
          break;
        case 'bump':
          if (lod !== 'far') pool.play('susp_bump', { ...at, gainDb: -12 + 10 * event.strength });
          break;
        case 'stall':
          // The powertrain's own wind-down (a turbine spools down, a diesel
          // coughs out); the generic stall covers an undecoded family.
          if (!pool.play(`engine_${identity.engine}_stop`, { ...at, gainDb: -2 })) pool.play('engine_stall', { ...at, gainDb: -2 });
          break;
        case 'restart':
          pool.play(`engine_${identity.engine}_start`, { ...at, gainDb: -3 });
          engineStartAt = ctx.currentTime + 1.4;
          break;
        default:
          break;
      }
    }
  }

  function update(frame: RigFrame): void {
    if (dead) return;
    stepVehicleAudio(state, family, frame.input, events);
    emitEvents(frame);
    if (frame.surface !== surface) retrack(frame.surface);
    const t = ctx.currentTime;

    // ---- spatial level, filter and pan.
    let levelDb: number;
    let cutoff: number;
    if (frame.own) {
      levelDb = 0;
      cutoff = 20000;
      if (panner) panner.pan.setTargetAtTime(0, t, 0.1);
    } else {
      levelDb = distanceAttenuationDb(frame.rel.distance, 10, 1, 5) + frame.atmosphere.transmissionDb - 9 * frame.occluded;
      lastAirHz = airAbsorptionCutoffHz(frame.rel.distance, frame.atmosphere, 0.8);
      cutoff = Math.min(lastAirHz, 20000 * Math.pow(0.06, frame.occluded));
      const pan = frame.rel.distance > 0.01 ? clamp(frame.rel.right / frame.rel.distance, -1, 1) * 0.9 : 0;
      if (panner) panner.pan.setTargetAtTime(pan, t, 0.08);
    }
    const startFade = engineStartAt > t ? clamp(1 - (engineStartAt - t) / 1.4, 0, 1) : 1;
    const gain = dbToGain(levelDb);
    output.gain.setTargetAtTime(gain, t, 0.08);
    lowpass.frequency.setTargetAtTime(clamp(cutoff, 120, 20000), t, 0.08);
    if (sendGain) sendGain.gain.setTargetAtTime(frame.own ? 0.04 : clamp(0.06 + frame.rel.distance / 1400, 0, 0.5), t, 0.2);
    lastGain = gain;
    lastDistance = frame.rel.distance;
    lastCutoff = clamp(cutoff, 120, 20000);

    // ---- engine bank.
    const running = state.running ? 1 : 0;
    const engineLevel = running * startFade * (0.5 + 0.5 * state.load) * (lod === 'far' ? 0.9 : 1);
    const rpm = Math.max(family.idleRpm * 0.5, state.rpm);
    let anyReady = false;
    for (let i = 0; i < bandAssets.length; i++) {
      const layer = engineLayers.get(bandAssets[i]);
      if (!layer) continue;
      const weight = bandAssets.length === 1 ? 1 : bandWeight(rpm, bandCentresNow, i);
      const rate = clamp(rpm / bandCentresNow[i], 0.78, 1.32) * identity.enginePitch * frame.doppler;
      setLayer(layer, weight * engineLevel, rate);
      if (layer.source) anyReady = true;
    }
    engineTone.frequency.setTargetAtTime(2600 + 14000 * Math.max(state.load, frame.own ? 0.35 : 0.6), t, 0.12);
    if (!anyReady && running) {
      if (!fallback) fallback = engineFallback(ctx, engineSum, noise, random);
      fallback.set(rpm, state.load, family.turbine);
    } else if (fallback) {
      fallback.stop(0.4);
      fallback = null;
    }

    // ---- running gear.
    const speed = state.trackMps;
    const kind = trackSurfaceAsset(frame.surface);
    const slow = gearLayers.get(gearAsset(kind, 'slow'));
    const fast = gearLayers.get(gearAsset(kind, 'fast'));
    const gearLevel = clamp(speed / 1.6, 0, 1) * (frame.surface === 'water' ? 0.35 : 1) * (0.7 + 0.5 * identity.mass);
    if (slow) setLayer(slow, gearLevel * bandWeight(speed, TRACK_CENTRES, 0), clamp(speed / 3, 0.6, 1.5) * frame.doppler);
    if (fast) setLayer(fast, gearLevel * (slow ? bandWeight(speed, TRACK_CENTRES, 1) : clamp((speed - 2) / 6, 0, 1)), clamp(speed / 10, 0.65, 1.45) * frame.doppler);
    const squeal = gearLayers.get('track_squeal_loop');
    if (squeal) setLayer(squeal, state.scrub * 0.85, 0.9 + 0.2 * state.scrub);
    const skid = gearLayers.get('track_skid_loop');
    if (skid) setLayer(skid, state.skid * (frame.surface === 'hard' ? 0.9 : frame.surface === 'earth' ? 0.55 : 0.25), 0.95 + 0.1 * state.skid);
    const wade = gearLayers.get('water_wade_loop');
    if (wade) setLayer(wade, clamp(frame.waterDepthM / 1.1, 0, 1) * clamp(0.25 + speed / 7, 0, 1), 0.9 + speed * 0.02);
    const knock = gearLayers.get('engine_knock_loop');
    if (knock) setLayer(knock, state.rough * running * 0.8, clamp(0.85 + state.rpm * 0.4, 0.7, 1.4));

    // ---- occupied-hull machinery.
    if (lod === 'own') {
      const turret = gearLayers.get(identity.turretDrive === 'hydraulic' ? 'turret_hydraulic_loop' : 'turret_electric_loop');
      const slew = clamp(Math.abs(frame.turretRate) / 0.45, 0, 1);
      if (turret) setLayer(turret, slew * 0.75, 0.82 + 0.3 * slew);
      const servo = gearLayers.get('elevation_servo_loop');
      const pitch = clamp(Math.abs(frame.pitchRate) / 0.3, 0, 1);
      if (servo) setLayer(servo, pitch > 0.05 ? pitch * 0.5 : 0, 0.9 + 0.25 * pitch);
      const hum = gearLayers.get('interior_hum_loop');
      if (hum) setLayer(hum, frame.cabin * 0.9, 1);
      const rattle = gearLayers.get('interior_rattle_loop');
      if (rattle) setLayer(rattle, frame.cabin * clamp(speed / 6, 0, 1), 0.85 + speed * 0.025);
    }

    // ---- procedural whines.
    whines.gear?.set(28 + speed * 36, clamp(speed / 12, 0, 1) * (0.06 + 0.12 * state.load) * (0.6 + family.whine));
    whines.turbo?.set(2400 + 2600 * state.rpm, identity.turboWhistle * state.load * state.rpm * 0.12 * running);
    whines.electric?.set(160 + speed * 92, identity.electricDrive * clamp(speed / 5, 0, 1) * 0.16);
    whines.turbine?.set(3800 + 2400 * state.rpm, identity.turbineAux * 0.07 * running);

    // ---- engine-deck fire rides the rig, so it follows a tank that keeps driving.
    const fire = gearLayers.get('fire_small_loop');
    if (fire) setLayer(fire, burning ? 0.8 : 0, 1);
  }

  return {
    id,
    get lod() { return lod; },
    state,
    identity,
    get lastGain() { return lastGain; },
    get lastDistance() { return lastDistance; },
    get lastCutoff() { return lastCutoff; },
    get lastAirHz() { return lastAirHz; },
    setLod(next) {
      if (next !== lod && !dead) applyLod(next);
    },
    setBurning(on) {
      if (on === burning || dead) return;
      burning = on;
      const existing = gearLayers.get('fire_small_loop');
      if (on && !existing) {
        gearLayers.set('fire_small_loop', makeLayer('fire_small_loop', gearSum));
        library.load(['fire_small_loop']);
      } else if (!on && existing) {
        dropLayer(existing, 0.8);
        gearLayers.delete('fire_small_loop');
      }
    },
    startEngine() {
      // Only the occupied hull hears its own start-up; remote engines are already idling.
      if (lod !== 'own') return;
      engineStartAt = ctx.currentTime + 1.6;
      pool.play(`engine_${identity.engine}_start`, { space: 'hull', bus: 'own', gainDb: -2 });
    },
    update,
    kill(fadeS = 0.4) {
      if (dead) return;
      dead = true;
      for (const layer of engineLayers.values()) dropLayer(layer, fadeS);
      for (const layer of gearLayers.values()) dropLayer(layer, fadeS);
      engineLayers.clear();
      gearLayers.clear();
      fallback?.stop(fadeS);
      for (const rig of Object.values(whines)) rig?.stop(fadeS);
      const t = ctx.currentTime;
      output.gain.cancelScheduledValues(t);
      output.gain.setValueAtTime(output.gain.value, t);
      output.gain.linearRampToValueAtTime(0, t + fadeS);
      setTimeout(() => {
        for (const node of [output, lowpass, engineTone, engineSum, gearSum, ...(panner ? [panner] : []), ...(sendGain ? [sendGain] : [])]) {
          try { node.disconnect(); } catch { /* detached */ }
        }
      }, (fadeS + 0.1) * 1000);
    },
  };
}

/** Build the model input from a runtime entity without allocating. */
export function fillVehicleInput(
  target: VehicleAudioInput,
  dtS: number,
  speed: number,
  topSpeedMps: number,
  reverseTopMps: number,
  throttle: number,
  brake: boolean,
  yawRate: number,
  grounded: boolean,
  verticalSpeed: number,
  landingImpactMps: number,
  gripLost: boolean,
  engine: ModuleHealth,
  immobilized: boolean,
): VehicleAudioInput {
  target.dtS = dtS;
  target.speedMps = speed;
  target.topSpeedMps = topSpeedMps;
  target.reverseTopMps = reverseTopMps;
  target.throttle = throttle;
  target.brake = brake;
  target.yawRate = yawRate;
  target.grounded = grounded;
  target.verticalSpeedMps = verticalSpeed;
  target.landingImpactMps = landingImpactMps;
  target.gripLost = gripLost;
  target.engine = engine;
  target.immobilized = immobilized;
  return target;
}
