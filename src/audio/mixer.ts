/**
 * The mix graph.
 *
 *   world buses (weapons, impacts, environment, vehicles) + reverb return
 *        → worldSum → snapshot lowpass → snapshot level → voice duck ─┐
 *   own hull → snapshot lowpass → level ─────────────────────────────┤
 *   interior, cinematic, ambience (voice-ducked) ────────────────────┼→ body
 *   body → concussion lowpass → level ─┐
 *   ui, music, voice, alarm ───────────┴→ glue compressor → soft clip → master
 *
 * Snapshots (battle, scoped interior, paused, kill-cam, spectating, garage)
 * crossfade the filter/level targets; a concussion overlays a muffle that
 * recovers; the HDR window (see admit) trims new voices that fall well
 * below the loudest recent event and culls what drops out of the bottom of
 * the window; crew speech ducks the beds. Settings channels scale the buses
 * they own; gunfire, impacts and the hull's gun carry a low shelf.
 */

import { dbToGain, clamp, mulberry32 } from './audioMath.ts';
import {
  BUS_CHANNEL, BUS_LEVELS, CONCUSSION, HDR, HDR_BUSES, REVERB_PRESETS, SNAPSHOTS, VOICE_DUCK,
  type MixSnapshot, type ReverbId, type SettingsChannel, type SnapshotId,
} from './mixPolicy.ts';
import type { BusId } from './soundCues.ts';

interface MixerOptions {
  context: AudioContext;
  reverb: boolean;
  channelVolumes: Record<SettingsChannel, number>;
  masterVolume: number;
  muted: boolean;
}

export interface Mixer {
  readonly ctx: AudioContext;
  input(bus: BusId): AudioNode;
  readonly reverbInput: AudioNode;
  readonly master: GainNode;
  readonly snapshot: SnapshotId;
  /** Logical-dB top of the HDR window. */
  readonly hdrTop: number;
  setChannel(channel: SettingsChannel, value: number): void;
  setMaster(value: number): void;
  setMuted(muted: boolean): void;
  setSnapshot(id: SnapshotId, fadeS?: number): void;
  setReverb(id: ReverbId): void;
  /**
   * Report a starting voice's logical loudness: the HDR trim to apply to it
   * (dB, ≤ 0; the loudest sound is never trimmed), or null when it falls out
   * of the window and should not start.
   */
  admit(loudDb: number, priority: number, drivesWindow?: boolean): number | null;
  /** Muffle the mix and recover over CONCUSSION.recoverS; false while cooling down. */
  concussion(strength: number): boolean;
  duckForVoice(active: boolean): void;
  cabinLevel(): number;
  update(dtS: number): void;
  busGains(): Record<string, number>;
  dispose(): void;
}

function makeSoftClip(ctx: BaseAudioContext): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const n = 4097;
  const curve = new Float32Array(n);
  const knee = 0.86;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/**
 * A stereo impulse response for an outdoor environment: exponentially
 * decaying noise whose brightness closes towards `dampHz`, a pre-delay, and
 * discrete terrain/façade echoes. Seeded so a map always sounds the same.
 */
function buildImpulse(ctx: BaseAudioContext, id: ReverbId, maxS = 2.4): AudioBuffer {
  const preset = REVERB_PRESETS[id];
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.round(Math.min(maxS, preset.preDelayS + preset.decayS * 1.3) * sr));
  const buffer = ctx.createBuffer(2, length, sr);
  const random = mulberry32(0x5eed + id.length * 977);
  const pre = Math.round(preset.preDelayS * sr);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.91 * t) / Math.max(0.05, preset.decayS));
      // One-pole lowpass whose cutoff falls from ~12 kHz to dampHz over the tail.
      const cutoff = preset.dampHz + (12000 - preset.dampHz) * Math.exp(-t * 3.2);
      const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
      lp += alpha * ((random() * 2 - 1) - lp);
      const fadeIn = Math.min(1, (i - pre) / (0.004 * sr));
      data[i] = lp * env * fadeIn;
    }
    for (const [delay, gain] of preset.taps) {
      const at = pre + Math.round((delay + (c ? 0.0035 : 0)) * sr);
      for (let k = 0; k < 96 && at + k < length; k++) {
        data[at + k] += (random() * 2 - 1) * gain * Math.exp(-k / 18);
      }
    }
    let energy = 0;
    for (let i = 0; i < length; i++) energy += data[i] * data[i];
    const norm = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let i = 0; i < length; i++) data[i] *= norm * 1.6;
  }
  return buffer;
}

export function createMixer({ context: ctx, reverb, channelVolumes, masterVolume, muted }: MixerOptions): Mixer {
  const now = () => ctx.currentTime;
  const bus = {} as Record<BusId, GainNode>;
  const chan: Record<SettingsChannel, number> = { ...channelVolumes };
  let masterLevel = masterVolume;
  let isMuted = muted;
  let snapshot: SnapshotId = 'garage';
  let hdrTop: number = HDR.floorDb;
  let concussionK = 0;
  let concussionActive = false;
  let concussionCooldown = 0;
  let voiceDuck = 0;
  let reverbId: ReverbId = 'none';

  // ---- master chain.
  const master = ctx.createGain();
  master.gain.value = isMuted ? 0 : masterLevel;
  const clip = makeSoftClip(ctx);
  const glue = ctx.createDynamicsCompressor();
  // Glue, not a limiter: a 12 ms attack lets cannon transients through to
  // the soft clip, which catches the peaks.
  glue.threshold.value = -8;
  glue.knee.value = 8;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.012;
  glue.release.value = 0.2;
  const preMaster = ctx.createGain();
  preMaster.connect(glue);
  glue.connect(clip);
  clip.connect(master);
  master.connect(ctx.destination);

  // ---- body (everything that a concussion muffles).
  const body = ctx.createGain();
  const concussionLp = ctx.createBiquadFilter();
  concussionLp.type = 'lowpass';
  concussionLp.frequency.value = 20000;
  concussionLp.Q.value = 0.5;
  const concussionGain = ctx.createGain();
  body.connect(concussionLp);
  concussionLp.connect(concussionGain);
  concussionGain.connect(preMaster);

  // ---- world group.
  const worldSum = ctx.createGain();
  const worldLp = ctx.createBiquadFilter();
  worldLp.type = 'lowpass';
  worldLp.frequency.value = 20000;
  worldLp.Q.value = 0.6;
  const worldSnap = ctx.createGain();
  const worldDuck = ctx.createGain();
  worldSum.connect(worldLp);
  worldLp.connect(worldSnap);
  worldSnap.connect(worldDuck);
  worldDuck.connect(body);

  // ---- own hull.
  const ownLp = ctx.createBiquadFilter();
  ownLp.type = 'lowpass';
  ownLp.frequency.value = 20000;
  ownLp.Q.value = 0.6;
  const ownSnap = ctx.createGain();
  ownLp.connect(ownSnap);
  ownSnap.connect(body);

  const interiorSnap = ctx.createGain();
  interiorSnap.connect(body);
  const ambienceSnap = ctx.createGain();
  const ambienceDuck = ctx.createGain();
  ambienceSnap.connect(ambienceDuck);
  ambienceDuck.connect(body);

  const destinations: Record<BusId, AudioNode> = {
    weapons: worldSum, impacts: worldSum, environment: worldSum, vehicles: worldSum,
    own: ownLp, ownCombat: ownLp, interior: interiorSnap, cinematic: body, ambience: ambienceSnap,
    ui: preMaster, music: preMaster, voice: preMaster, alarm: preMaster,
  };
  // Weight: gunfire, impacts and the hull's own gun get a low shelf (the
  // generated reports are lean below 100 Hz), the interface a gentle top cut.
  // The beds lose their sub-bass: loudness-normalised (K-weighted) beds carry
  // far more rumble than they sound like, and it masks the guns' low end
  // (tools/audio-mix-balance.mjs measured the idle bed 79 % below 200 Hz).
  const SHELVES: Partial<Record<BusId, readonly [BiquadFilterType, number, number]>> = {
    weapons: ['lowshelf', 110, 5], impacts: ['lowshelf', 110, 4], ownCombat: ['lowshelf', 110, 5], ui: ['highshelf', 5200, -6],
    ambience: ['highpass', 90, 0],
  };
  const busFilters: BiquadFilterNode[] = [];
  for (const id of Object.keys(destinations) as BusId[]) {
    const g = ctx.createGain();
    g.gain.value = BUS_LEVELS[id] * chan[BUS_CHANNEL[id]];
    const shelf = SHELVES[id];
    if (shelf) {
      const f = ctx.createBiquadFilter();
      f.type = shelf[0];
      f.frequency.value = shelf[1];
      f.gain.value = shelf[2];
      if (shelf[0] === 'highpass') f.Q.value = Math.SQRT1_2;
      g.connect(f);
      f.connect(destinations[id]);
      busFilters.push(f);
    } else {
      g.connect(destinations[id]);
    }
    bus[id] = g;
  }

  // ---- reverb send/return (desktop tier only; mobile keeps the dry mix).
  const reverbInput = ctx.createGain();
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0;
  let convolver: ConvolverNode | null = null;
  if (reverb) {
    convolver = ctx.createConvolver();
    convolver.normalize = false;
    reverbInput.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(worldSum);
  }

  // Pinned smoothing: a bare setTargetAtTime on a sleeping (input-less) node
  // can wake from a stale value in Chrome, so every move lands exactly.
  function glide(param: AudioParam, value: number, tau = 0.08, settle = tau * 6): void {
    const t = now();
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, tau);
    param.setValueAtTime(value, t + settle);
  }

  function applyBuses(smooth = true): void {
    for (const id of Object.keys(bus) as BusId[]) {
      const value = BUS_LEVELS[id] * chan[BUS_CHANNEL[id]];
      if (smooth) glide(bus[id].gain, value, 0.03, 0.2); else bus[id].gain.value = value;
    }
  }

  function applySnapshot(target: MixSnapshot, fadeS: number): void {
    const tau = Math.max(0.01, fadeS / 3);
    glide(worldLp.frequency, target.worldHz, tau);
    glide(worldSnap.gain, dbToGain(target.worldDb), tau);
    glide(ownLp.frequency, target.ownHz, tau);
    glide(ownSnap.gain, dbToGain(target.ownDb), tau);
    glide(interiorSnap.gain, dbToGain(target.interiorDb), tau);
    glide(ambienceSnap.gain, dbToGain(target.ambienceDb), tau);
    glide(reverbReturn.gain, convolver ? dbToGain(target.reverbDb) * REVERB_PRESETS[reverbId].wet : 0, tau);
  }

  applySnapshot(SNAPSHOTS.garage, 0.01);

  function applyMaster(): void {
    glide(master.gain, isMuted ? 0 : masterLevel, 0.02, 0.15);
  }


  return {
    ctx,
    input: (id) => bus[id],
    reverbInput,
    master,
    get snapshot() { return snapshot; },
    get hdrTop() { return hdrTop; },
    setChannel(channel, value) {
      chan[channel] = clamp(Number.isFinite(value) ? value : 1, 0, 1);
      applyBuses();
    },
    setMaster(value) {
      masterLevel = clamp(value, 0, 1);
      applyMaster();
    },
    setMuted(on) {
      isMuted = !!on;
      applyMaster();
    },
    setSnapshot(id, fadeS = 0.35) {
      if (id === snapshot) return;
      snapshot = id;
      applySnapshot(SNAPSHOTS[id], fadeS);
    },
    setReverb(id) {
      if (!convolver || id === reverbId) return;
      reverbId = id;
      convolver.buffer = id === 'none' ? null : buildImpulse(ctx, id);
      glide(reverbReturn.gain, dbToGain(SNAPSHOTS[snapshot].reverbDb) * REVERB_PRESETS[id].wet, 0.2);
    },
    admit(loudDb, priority, drivesWindow = true) {
      if (drivesWindow && loudDb > hdrTop) hdrTop = loudDb;
      const below = hdrTop - loudDb;
      if (below > HDR.windowDb && priority < HDR.protectPriority) return null;
      return below > HDR.kneeDb ? -Math.min(HDR.maxTrimDb, (below - HDR.kneeDb) * HDR.slope) : 0;
    },
    concussion(strength) {
      if (concussionCooldown > 0) return false;
      concussionK = Math.max(concussionK, clamp(strength, 0, 1));
      concussionCooldown = CONCUSSION.cooldownS;
      return true;
    },
    duckForVoice(active) {
      voiceDuck = active ? 1 : 0;
      const tau = active ? VOICE_DUCK.attackS : VOICE_DUCK.releaseS;
      glide(ambienceDuck.gain, dbToGain(VOICE_DUCK.ambienceDb * voiceDuck), tau);
      glide(worldDuck.gain, dbToGain(VOICE_DUCK.worldDb * voiceDuck), tau);
    },
    cabinLevel: () => dbToGain(SNAPSHOTS[snapshot].cabinDb),
    update(dtS) {
      const dt = clamp(dtS, 0, 0.25);
      hdrTop = Math.max(HDR.floorDb, hdrTop - HDR.releaseDbPerS * dt);
      concussionCooldown = Math.max(0, concussionCooldown - dt);
      if (concussionK > 0.001) {
        const target = SNAPSHOTS.concussion;
        const hz = 20000 * Math.pow(target.worldHz / 20000, concussionK);
        concussionLp.frequency.setTargetAtTime(hz, now(), 0.02);
        concussionGain.gain.setTargetAtTime(dbToGain(target.worldDb * concussionK), now(), 0.02);
        concussionK = Math.max(0, concussionK - dt / CONCUSSION.recoverS);
        concussionActive = true;
      } else if (concussionActive) {
        concussionLp.frequency.setTargetAtTime(20000, now(), 0.2);
        concussionGain.gain.setTargetAtTime(1, now(), 0.2);
        concussionActive = false;
      }
    },
    busGains() {
      const out: Record<string, number> = {
        master: master.gain.value, hdrTop, concussion: concussionK, voiceDuck,
        worldSnap: worldSnap.gain.value, ownSnap: ownSnap.gain.value,
        interiorSnap: interiorSnap.gain.value, ambienceSnap: ambienceSnap.gain.value,
      };
      for (const id of Object.keys(bus) as BusId[]) out[id] = bus[id].gain.value;
      return out;
    },
    dispose() {
      for (const node of [master, clip, glue, preMaster, body, concussionLp, concussionGain, worldSum, worldLp, worldSnap,
        worldDuck, ownLp, ownSnap, interiorSnap, ambienceSnap, ambienceDuck, reverbInput, reverbReturn,
        ...(convolver ? [convolver] : []), ...busFilters, ...Object.values(bus)]) {
        try { node.disconnect(); } catch { /* detached */ }
      }
    },
  };
}

/** HDR world buses, re-exported for the voice pool's window bookkeeping. */
export const WORLD_BUSES = new Set<BusId>(HDR_BUSES);
