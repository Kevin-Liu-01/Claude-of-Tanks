import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Boot-light audio facade.
 *
 * The full synthesized/spatial mixer is intentionally loaded only after
 * explicit sound intent. Ready/accepted boot entry may silently prepare the shared AudioContext
 * inside its gesture. Battle gives its opaque loader a rendering opportunity
 * before device startup when sticky activation is available, then starts this module's
 * tiny oscillator-only loading bed immediately. The dynamically imported
 * mixer adopts that exact context and replaces the fallback without an
 * autoplay-policy gap.
 */

import type { AudioListenerPose } from './listenerPoseRuntime.ts';
import type { AudioMixer } from './audio.ts';
import type { PreparedAudioBuffers } from './audioBuffers.ts';
import type { EventBus } from '../game/stateCore.ts';
import { nextPaintFrame } from '../engine/frameScheduler.ts';

interface FallbackLoadingTone {
  context: AudioContext;
  gain: GainNode;
  nodes: OscillatorNode[];
}

interface AudioMixerModule {
  prepareAudioBuffers?(context: AudioContext): Promise<PreparedAudioBuffers>;
  createAudio(options: {
    context: AudioContext | null;
    preparedBuffers?: PreparedAudioBuffers | null;
    getMapId?: () => string | null;
    initialPhase?: string;
  }): AudioMixer;
}

export interface LazyAudioOptions {
  loadMixer?(): Promise<AudioMixerModule | null>;
  createContext?(): AudioContext | null;
  getMapId?(): string | null;
  hasStickyActivation?(): boolean;
}

export interface LazyAudio {
  preload(): Promise<AudioMixerModule | null>;
  /** Unmuted gesture-only device preparation; no mixer, tone, or dependency transfer. */
  prepare(): void;
  resume(): void;
  /** Explicit Battle intent only; preserves legacy gesture-time unlocking. */
  startLoadingAfterPaint(yieldForPaint?: () => Promise<void>): Promise<void>;
  bindBus(bus: EventBus): void;
  update(dtSeconds: number, listener: AudioListenerPose, tanks: readonly RuntimeValue[]): void;
  setMasterVolume(value: number): void;
  mute(muted: boolean): void;
  playGarageSting(): void;
  loadingOn(active: boolean): void;
  warmBattleEvents(): Promise<RuntimeValue>;
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
export function startFallbackLoadingTone(
  context: AudioContext | null, destination?: AudioNode,
): FallbackLoadingTone | null {
  if (!context) return null;
  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
  gain.connect(destination ?? context.destination);

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

function storedMasterVolume(): number {
  try {
    const settings = JSON.parse(localStorage.getItem('cot.settings.v1') || 'null');
    const value = settings?.volMaster;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  } catch { /* unavailable/invalid storage retains the mixer default */ }
  return 0.8;
}

export function createLazyAudio({
  getMapId,
  hasStickyActivation = () => (
    typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true
  ),
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
  let stopPhaseTracking: (() => void) | null = null;
  let stopVolumeTracking: (() => void) | null = null;
  let latestPhase = 'garage';
  let fallback: FallbackLoadingTone | null = null;
  // One output owner also controls fading fallback nodes after handoff. Their
  // envelope automation can never ramp past an exact-zero master/mute gain.
  let fallbackOutput: GainNode | null = null;
  let loadingRequested = false;
  let ambientRequested = false;
  let muted = false;
  let masterVolume = storedMasterVolume();
  let garageStingPending = false;
  let loadingRevision = 0;

  const unlockContext = (): AudioContext | null => {
    if (!context) context = createContext();
    if (!context) return null;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return context;
  };

  const prepare = (): void => {
    // Audio device creation is synchronous in browsers. Pay that first-use
    // cost at explicit Ready intent, not on the synchronized battle edge.
    // Preparation is optional: unavailable devices must not block readiness,
    // and a later Battle gesture still retries the normal unlock path.
    if (muted || masterVolume <= 0) return;
    try { unlockContext(); } catch { /* optional device preparation */ }
  };

  const applyFallbackVolume = (): void => {
    if (fallbackOutput) fallbackOutput.gain.value = muted ? 0 : masterVolume;
  };

  const latchMasterVolume = (value: number): void => {
    if (!Number.isFinite(value)) return;
    masterVolume = Math.max(0, Math.min(1, value));
    applyFallbackVolume();
  };

  const settleReal = (created: AudioMixer): AudioMixer => {
    real = created;
    if (bus) real.bindBus(bus);
    // These setters latch before the first graph is built. Its destination
    // gain must start at the latest intent, not fade down after sources start.
    real.mute(muted);
    real.setMasterVolume(masterVolume);
    if (context) real.resume();
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
      realPromise = preload().then(async (module) => {
        if (!module) return null;
        // Keep the full graph, bus subscriptions and shared sound RNG private
        // while its exact buffers are synthesized. The oscillator-only loading
        // cue remains active, and phase/intent are read again at handoff.
        const preparedBuffers = context && module.prepareAudioBuffers
          ? await module.prepareAudioBuffers(context) : null;
        return settleReal(module.createAudio({ context, preparedBuffers, getMapId, initialPhase: latestPhase }));
      }).finally(() => {
        if (!real) realPromise = null;
      });
    }
    return realPromise;
  };

  const requestReal = (): void => {
    void ensureReal().catch((error) => {
      console.warn('[audio] deferred mixer initialization failed:', error);
    });
  };

  const resume = (): void => {
    unlockContext();
    if (real) real.resume();
    else requestReal();
  };

  const loadingOn = (on: boolean): void => {
    loadingRevision++;
    loadingRequested = !!on;
    if (real) {
      real.loadingOn(loadingRequested);
      return;
    }
    if (loadingRequested) {
      const unlocked = unlockContext();
      if (unlocked && !fallback) {
        if (!fallbackOutput) {
          fallbackOutput = unlocked.createGain();
          applyFallbackVolume();
          fallbackOutput.connect(unlocked.destination);
        }
        fallback = startFallbackLoadingTone(unlocked, fallbackOutput);
      }
      requestReal();
    } else if (fallback) {
      stopFallback(fallback, 0.16);
      fallback = null;
    }
  };

  const startLoadingAfterPaint = async (
    yieldForPaint = nextPaintFrame,
  ): Promise<void> => {
    const revision = ++loadingRevision;
    // Web Audio uses sticky activation in current browsers. Without that
    // positive signal keep the original in-gesture unlock for older engines;
    // neither branch initializes a device merely from preload/hover/boot.
    const afterPaint = hasStickyActivation();
    if (!afterPaint) { resume(); loadingOn(true); }
    await yieldForPaint();
    // Leaving/cancelling loading during the paint wait must not revive audio.
    if (afterPaint && revision === loadingRevision) { resume(); loadingOn(true); }
  };

  return {
    preload,
    prepare,
    resume,
    startLoadingAfterPaint,
    bindBus(nextBus: EventBus) {
      bus = nextBus;
      stopPhaseTracking?.();
      stopVolumeTracking?.();
      stopVolumeTracking = nextBus.on('ui:volumes', (event) => {
        if (event && typeof event === 'object' && 'master' in event
            && typeof event.master === 'number') latchMasterVolume(event.master);
        // The bound mixer independently owns the canonical full channel event.
      });
      // The mixer may arrive after the battle phase edge. Carry that state
      // across the deferred transfer without re-emitting a global event.
      stopPhaseTracking = nextBus.on('phase:change', (event) => {
        if (!event || typeof event !== 'object' || !('phase' in event)
            || typeof event.phase !== 'string') return;
        latestPhase = event.phase;
        if (latestPhase !== 'battle') ambientRequested = false;
      });
      if (real) real.bindBus(nextBus);
    },
    update(dt: number, listener: AudioListenerPose, tanks: readonly RuntimeValue[]) {
      real?.update(dt, listener, tanks);
    },
    setMasterVolume(value: number) {
      latchMasterVolume(value);
      real?.setMasterVolume(masterVolume);
    },
    mute(on: boolean) {
      muted = !!on;
      applyFallbackVolume();
      real?.mute(muted);
    },
    playGarageSting() {
      if (real) real.playGarageSting();
      else { garageStingPending = true; requestReal(); }
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
