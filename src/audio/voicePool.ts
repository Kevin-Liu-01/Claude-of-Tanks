/**
 * One-shot voices: every positioned or flat sample the engine fires.
 *
 * A world voice is placed in the listener frame (equal-power stereo pan),
 * attenuated by its cue's distance law and the battlefield's atmosphere,
 * darkened by air absorption and terrain occlusion, delayed by the speed of
 * sound, admitted (or culled) by the HDR window, and sent to the reverb in
 * proportion to distance. Instance caps, re-trigger cooldowns and a global
 * voice budget with priority stealing keep a 14v14 volley legible.
 */

import {
  airAbsorptionCutoffHz, clamp, dbToGain, distanceAttenuationDb, panFromRelative,
  propagationDelayS, toListenerFrame, ATMOSPHERES,
  type AtmosphereProfile, type ListenerFrame, type RelativePosition,
} from './audioMath.ts';
import { cueProfile, type BusId, type CueProfile, type CueSpace } from './soundCues.ts';
import type { AssetLibrary } from './assetLibrary.ts';
import { WORLD_BUSES, type Mixer } from './mixer.ts';

export interface PlayOptions {
  x?: number;
  y?: number;
  z?: number;
  gainDb?: number;
  rate?: number;
  delayS?: number;
  bus?: BusId;
  space?: CueSpace;
  loudDb?: number;
  priority?: number;
  /** Apply the speed-of-sound delay (world voices; default true). */
  propagate?: boolean;
  lowpassHz?: number;
  send?: number;
  offsetS?: number;
  /** Cut the voice after this long (with a short fade). */
  maxDurS?: number;
  pan?: number;
  /** Whether this voice may raise the HDR window (default: world buses + own). */
  drivesWindow?: boolean;
  /** Play this exact buffer instead of picking a variant. */
  buffer?: AudioBuffer;
  /** Loop the asset between its manifest loop points until stopped. */
  loop?: boolean;
}

export interface ActiveVoice {
  readonly id: string;
  readonly start: number;
  end: number;
  readonly priority: number;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly output: GainNode;
  dead: boolean;
}

/** One started voice: asset, start time, linear gain, rate, distance (m) and bus. */
interface SfxLogEntry {
  seq: number;
  n: string;
  t: number;
  g: number;
  r: number;
  d: number;
  b: BusId;
}

interface VoicePoolOptions {
  mixer: Mixer;
  library: AssetLibrary;
  random: () => number;
  budget: number;
  reverb: boolean;
}

export interface VoicePool {
  play(id: string, options?: PlayOptions): ActiveVoice | null;
  setListener(frame: ListenerFrame): void;
  setAtmosphere(atmosphere: AtmosphereProfile): void;
  /** 0 (clear) .. 1 (fully behind terrain) for a world position. */
  setOcclusionProbe(probe: ((x: number, y: number, z: number) => number) | null): void;
  stop(filter: (voice: ActiveVoice) => boolean, fadeS?: number): void;
  prune(now: number): void;
  readonly active: readonly ActiveVoice[];
  readonly log: readonly SfxLogEntry[];
  readonly culled: number;
}

export function createVoicePool({ mixer, library, random, budget, reverb }: VoicePoolOptions): VoicePool {
  const ctx = mixer.ctx;
  const voices: ActiveVoice[] = [];
  const lastStart = new Map<string, number>();
  const log: SfxLogEntry[] = [];
  let seq = 0;
  let culled = 0;
  const frame: ListenerFrame = { x: 0, y: 0, z: 0, fx: 0, fz: 1 };
  const rel: RelativePosition = { right: 0, up: 0, ahead: 0, distance: 0 };
  let atmosphere: AtmosphereProfile = ATMOSPHERES.earth;
  let occlusion: ((x: number, y: number, z: number) => number) | null = null;

  function release(voice: ActiveVoice, at: number, fadeS: number): void {
    if (voice.dead) return;
    voice.dead = true;
    try {
      voice.output.gain.cancelScheduledValues(at);
      voice.output.gain.setValueAtTime(voice.output.gain.value, at);
      voice.output.gain.linearRampToValueAtTime(0, at + fadeS);
      voice.source.stop(at + fadeS + 0.01);
    } catch { /* already stopped */ }
  }

  function prune(now: number): void {
    for (let i = voices.length - 1; i >= 0; i--) {
      const voice = voices[i];
      if (voice.dead || voice.end <= now) {
        voices.splice(i, 1);
      }
    }
  }

  function makeRoom(id: string, profile: CueProfile, priority: number, now: number): boolean {
    let same = 0;
    let oldestSame: ActiveVoice | null = null;
    for (const voice of voices) {
      if (voice.dead || voice.id !== id) continue;
      same++;
      if (!oldestSame || voice.start < oldestSame.start) oldestSame = voice;
    }
    if (same >= profile.maxInstances && oldestSame) release(oldestSame, now, 0.02);
    prune(now);
    if (voices.length < budget) return true;
    let victim: ActiveVoice | null = null;
    for (const voice of voices) {
      if (voice.priority > priority) continue;
      if (!victim || voice.priority < victim.priority || (voice.priority === victim.priority && voice.start < victim.start)) victim = voice;
    }
    if (!victim) return false;
    release(victim, now, 0.025);
    prune(now);
    return true;
  }

  function play(id: string, options: PlayOptions = {}): ActiveVoice | null {
    const record = library.record(id);
    if (!record && !options.buffer) return null;
    const base = cueProfile(id, record?.g ?? 'impacts');
    const bus = options.bus ?? base.bus;
    const space = options.space ?? base.space;
    const priority = options.priority ?? base.priority;
    const now = ctx.currentTime;
    const previous = lastStart.get(id);
    if (previous != null && now - previous < base.cooldownS) return null;
    const buffer = options.buffer ?? library.pick(id, random);
    if (!buffer) return null;

    let levelDb = base.gainDb + (options.gainDb ?? 0);
    let delay = Math.max(0, options.delayS ?? 0);
    let cutoff = options.lowpassHz ?? 22000;
    let pan = options.pan ?? 0;
    let distance = 0;
    let send = options.send ?? base.send;
    if (space === 'world' && options.x != null && options.z != null) {
      toListenerFrame(frame, options.x, options.y ?? frame.y, options.z, rel);
      distance = rel.distance;
      if (distance > base.maxM) { culled++; return null; }
      const attenuation = distanceAttenuationDb(distance, base.refM, base.rolloff) + atmosphere.transmissionDb;
      levelDb += attenuation;
      const occluded = occlusion ? occlusion(options.x, options.y ?? frame.y, options.z) : 0;
      if (occluded > 0) {
        levelDb -= 9 * occluded;
        cutoff = Math.min(cutoff, 20000 * Math.pow(0.06, occluded));
      }
      if (levelDb < -72) { culled++; return null; }
      const loud = (options.loudDb ?? base.loudDb) + (options.gainDb ?? 0) + attenuation - 9 * occluded;
      const drives = options.drivesWindow ?? (WORLD_BUSES.has(bus) || bus === 'own');
      if ((WORLD_BUSES.has(bus) || bus === 'own') && !mixer.admit(loud, priority, drives)) { culled++; return null; }
      if (options.propagate !== false) delay += propagationDelayS(distance, atmosphere);
      cutoff = Math.min(cutoff, airAbsorptionCutoffHz(distance, atmosphere, base.absorb));
      pan = panFromRelative(rel, 0.92);
      send = clamp(send * (1 + distance / 180), 0, 0.95);
    } else if (bus === 'own') {
      mixer.admit((options.loudDb ?? base.loudDb) + (options.gainDb ?? 0), priority, options.drivesWindow ?? true);
    }
    if (!makeRoom(id, base, priority, now)) { culled++; return null; }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const [lo, hi] = base.pitch;
    const rate = (options.rate ?? 1) * (lo + (hi - lo) * random());
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = dbToGain(levelDb);
    const output = ctx.createGain();
    source.connect(gain);
    let tail: AudioNode = gain;
    if (cutoff < 20000) {
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = clamp(cutoff, 80, 20000);
      lowpass.Q.value = 0.5;
      tail.connect(lowpass);
      tail = lowpass;
    }
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(output);
    output.connect(mixer.input(bus));
    if (reverb && send > 0.01) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      output.connect(sendGain);
      sendGain.connect(mixer.reverbInput);
    }
    const when = now + 0.004 + delay;
    let offset = clamp(options.offsetS ?? 0, 0, Math.max(0, buffer.duration - 0.01));
    let end: number;
    if (options.loop) {
      const loop = record?.l;
      source.loop = true;
      if (loop) {
        source.loopStart = loop[0];
        source.loopEnd = Math.min(loop[1], buffer.duration);
      }
      const lo0 = loop ? loop[0] : 0;
      const span = (loop ? Math.min(loop[1], buffer.duration) : buffer.duration) - lo0;
      offset = lo0 + random() * Math.max(0.01, span);
      // Fade in so a loop never starts on a click.
      output.gain.setValueAtTime(0, when);
      output.gain.linearRampToValueAtTime(1, when + 0.25);
      source.start(when, offset);
      end = Infinity;
    } else {
      const playable = (buffer.duration - offset) / rate;
      const dur = options.maxDurS != null ? Math.min(playable, options.maxDurS) : playable;
      source.start(when, offset);
      if (options.maxDurS != null && options.maxDurS < playable) {
        output.gain.setValueAtTime(1, when + Math.max(0, dur - 0.06));
        output.gain.linearRampToValueAtTime(0, when + dur);
        source.stop(when + dur + 0.02);
      }
      end = when + dur + 0.05;
    }
    const voice: ActiveVoice = { id, start: when, end, priority, source, gain, output, dead: false };
    source.onended = () => {
      voice.dead = true;
      try { output.disconnect(); } catch { /* detached */ }
    };
    voices.push(voice);
    lastStart.set(id, now);
    library.touch(id);
    log.push({ seq: ++seq, n: id, t: +when.toFixed(3), g: +dbToGain(levelDb).toFixed(4), r: +rate.toFixed(3), d: +distance.toFixed(1), b: bus });
    if (log.length > 256) log.shift();
    return voice;
  }

  return {
    play,
    setListener(next) {
      frame.x = next.x; frame.y = next.y; frame.z = next.z;
      frame.fx = next.fx; frame.fz = next.fz;
    },
    setAtmosphere(next) { atmosphere = next; },
    setOcclusionProbe(probe) { occlusion = probe; },
    stop(filter, fadeS = 0.05) {
      const now = ctx.currentTime;
      for (const voice of voices) if (!voice.dead && filter(voice)) release(voice, now, fadeS);
      prune(now);
    },
    prune,
    get active() { return voices; },
    get log() { return log; },
    get culled() { return culled; },
  };
}
