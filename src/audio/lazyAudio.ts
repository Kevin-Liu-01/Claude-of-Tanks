/**
 * Boot-light audio facade.
 *
 * The full synthesized/spatial mixer is intentionally loaded only after
 * explicit sound intent. A Battle click still creates and resumes an
 * AudioContext synchronously inside the gesture, then starts this module's
 * tiny oscillator-only loading bed immediately. The dynamically imported
 * mixer adopts that exact context and replaces the fallback without an
 * autoplay-policy gap.
 */

import type { AudioListenerPose } from './listenerPoseRuntime.ts';
import type { AudioMixer } from './audio.ts';
import type { EventBus } from '../game/stateCore.ts';

interface FallbackLoadingTone {
  context: AudioContext;
  gain: GainNode;
  nodes: OscillatorNode[];
}

interface AudioMixerModule {
  createAudio(options: { context: AudioContext | null }): AudioMixer;
}

export interface LazyAudioOptions {
  loadMixer?(): Promise<AudioMixerModule | null>;
  createContext?(): AudioContext | null;
}

export interface LazyAudio {
  preload(): Promise<AudioMixerModule | null>;
  resume(): void;
  bindBus(bus: EventBus): void;
  update(dtSeconds: number, listener: AudioListenerPose, tanks: readonly unknown[]): void;
  setMasterVolume(value: number): void;
  mute(muted: boolean): void;
  playGarageSting(): void;
  loadingOn(active: boolean): void;
  warmBattleEvents(): Promise<unknown>;
  ambientOn(active: boolean): void;
  hitConfirm(kind: string, damage?: number): void;
  readonly ready: boolean;
  readonly loadingActive: boolean;
}

function stopFallback(record: FallbackLoadingTone | null, fadeS = 0.08): void {
  if (!record) return;
  const { context, gain, nodes } = record;
  const now = context.currentTime;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
  } catch (_) { /* context may have been reclaimed */ }
  for (const node of nodes) {
    try { node.stop(now + fadeS + 0.02); } catch (_) { /* already stopped */ }
  }
  nodes[0].onended = () => {
    try { gain.disconnect(); } catch (_) { /* detached */ }
  };
}

/** Immediate loading sound: no fetch, decode, timer, or frame-loop work. */
export function startFallbackLoadingTone(context: AudioContext | null): FallbackLoadingTone | null {
  if (!context) return null;
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
  gain.connect(context.destination);

  const rumble = context.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.value = 54;
  const machinery = context.createOscillator();
  machinery.type = 'triangle';
  machinery.frequency.value = 108;
  const rumbleGain = context.createGain();
  const machineryGain = context.createGain();
  rumbleGain.gain.value = 0.72;
  machineryGain.gain.value = 0.14;
  rumble.connect(rumbleGain); rumbleGain.connect(gain);
  machinery.connect(machineryGain); machineryGain.connect(gain);

  // An unmistakable one-shot mechanical engage cue confirms the Battle click
  // even when the full mixer chunk has not arrived yet. Oscillator-only means
  // it starts in the gesture-created context with no fetch/decode dependency.
  const engage = context.createOscillator();
  engage.type = 'sawtooth';
  engage.frequency.setValueAtTime?.(148, now);
  engage.frequency.exponentialRampToValueAtTime?.(62, now + 0.24);
  const engageGain = context.createGain();
  engageGain.gain.setValueAtTime(0.0001, now);
  engageGain.gain.exponentialRampToValueAtTime(0.19, now + 0.008);
  engageGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  engage.connect(engageGain); engageGain.connect(gain);

  rumble.start(now); machinery.start(now); engage.start(now);
  engage.stop(now + 0.36);
  return { context, gain, nodes: [rumble, machinery, engage] };
}

export function createLazyAudio({
  loadMixer = () => import('./audio.ts'),
  createContext = () => {
    const scope = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AC = scope.AudioContext || scope.webkitAudioContext;
    return AC ? new AC({ latencyHint: 'interactive' }) : null;
  },
}: LazyAudioOptions = {}): LazyAudio {
  let context: AudioContext | null = null;
  let real: AudioMixer | null = null;
  let modulePromise: Promise<AudioMixerModule | null> | null = null;
  let realPromise: Promise<AudioMixer | null> | null = null;
  let bus: EventBus | null = null;
  let fallback: FallbackLoadingTone | null = null;
  let loadingRequested = false;
  let ambientRequested = false;
  let muted = false;
  let garageStingPending = false;

  const unlockContext = (): AudioContext | null => {
    if (!context) context = createContext();
    if (!context) return null;
    if (context.state === 'suspended') void context.resume();
    return context;
  };

  const settleReal = (created: AudioMixer): AudioMixer => {
    real = created;
    if (bus) real.bindBus(bus);
    // createAudio may adopt an already-unlocked context. Construct its graph
    // before invoking methods that write graph nodes (mute/applyMaster). The
    // previous order rejected this promise and left a half-initialized mixer
    // whose first engine update tried to connect to a null bus.
    if (context) real.resume();
    real.mute(muted);
    if (fallback) {
      stopFallback(fallback);
      fallback = null;
    }
    real.loadingOn(loadingRequested);
    real.ambientOn(ambientRequested);
    if (garageStingPending) {
      garageStingPending = false;
      real.playGarageSting();
    }
    return real;
  };

  const preload = (): Promise<AudioMixerModule | null> => {
    if (!modulePromise) {
      modulePromise = loadMixer().catch((error) => {
        modulePromise = null;
        console.warn('[audio] deferred mixer load failed:', error);
        return null;
      });
    }
    return modulePromise;
  };

  const ensureReal = (): Promise<AudioMixer | null> => {
    if (real) return Promise.resolve(real);
    if (!realPromise) {
      realPromise = preload().then((module) => (
        module ? settleReal(module.createAudio({ context })) : null
      )).finally(() => {
        if (!real) realPromise = null;
      });
    }
    return realPromise;
  };

  const resume = (): void => {
    unlockContext();
    if (real) real.resume();
    else void ensureReal();
  };

  const loadingOn = (on: boolean): void => {
    loadingRequested = !!on;
    if (real) {
      real.loadingOn(loadingRequested);
      return;
    }
    if (loadingRequested) {
      const unlocked = unlockContext();
      if (unlocked && !fallback) fallback = startFallbackLoadingTone(unlocked);
      void ensureReal();
    } else if (fallback) {
      stopFallback(fallback, 0.16);
      fallback = null;
    }
  };

  return {
    preload,
    resume,
    bindBus(nextBus: EventBus) {
      bus = nextBus;
      if (real) real.bindBus(nextBus);
    },
    update(dt: number, listener: AudioListenerPose, tanks: readonly unknown[]) {
      real?.update(dt, listener, tanks);
    },
    setMasterVolume(value: number) { real?.setMasterVolume(value); },
    mute(on: boolean) {
      muted = !!on;
      if (fallback) fallback.gain.gain.value = muted ? 0.0001 : 0.055;
      real?.mute(muted);
    },
    playGarageSting() {
      if (real) real.playGarageSting();
      else { garageStingPending = true; void ensureReal(); }
    },
    loadingOn,
    warmBattleEvents() {
      return ensureReal().then((mixer) => mixer?.warmBattleEvents?.());
    },
    ambientOn(on: boolean) {
      ambientRequested = !!on;
      real?.ambientOn(ambientRequested);
    },
    hitConfirm(kind: string, damage = 0) { real?.hitConfirm(kind, damage); },
    get ready() { return !!real; },
    get loadingActive() { return !!fallback || loadingRequested; },
  };
}
