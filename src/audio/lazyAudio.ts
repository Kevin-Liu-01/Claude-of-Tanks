import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Boot-light audio facade.
 *
 * The full spatial mixer is intentionally loaded only after explicit sound
 * intent. Ready/accepted boot entry may silently prepare the shared
 * AudioContext inside its gesture. Battle gives its opaque loader a rendering
 * opportunity before device startup when sticky activation is available, then
 * unlocks that context and requests the mixer, which adopts the exact context
 * (no autoplay-policy gap) and plays the recorded loading bed. This facade
 * makes no sound of its own: until 2026-10-03 it bridged the transfer with an
 * oscillator rumble, and every sound in the game is now a recording.
 */

import type { AudioListenerPose } from './listenerPoseRuntime.ts';
import type { AudioMixer, AudioTerrainProbe } from './audioEngine.ts';
import type { EventBus } from '../game/stateCore.ts';
import { nextPaintFrame } from '../engine/frameScheduler.ts';

interface AudioMixerModule {
  /** Optional cooperative preparation the mixer may want before adoption. */
  prepareAudioBuffers?(context: AudioContext): Promise<unknown>;
  createAudio(options: {
    context: AudioContext | null;
    preparedBuffers?: unknown;
    getMapId?: () => string | null;
    getGameMode?: () => string | null;
    getTerrain?: () => AudioTerrainProbe | null;
    initialPhase?: string;
  }): AudioMixer;
}

interface LazyAudioOptions {
  loadMixer?(): Promise<AudioMixerModule | null>;
  createContext?(): AudioContext | null;
  getMapId?(): string | null;
  getGameMode?(): string | null;
  getTerrain?(): AudioTerrainProbe | null;
  hasStickyActivation?(): boolean;
}

export interface LazyAudio {
  preload(): Promise<AudioMixerModule | null>;
  /** Unmuted gesture-only device preparation; no mixer, sound, or dependency transfer. */
  prepare(): void;
  resume(): void;
  /** Explicit Battle intent only; preserves legacy gesture-time unlocking. */
  startLoadingAfterPaint(yieldForPaint?: () => Promise<void>): Promise<void>;
  bindBus(bus: EventBus): void;
  update(dtSeconds: number, listener: AudioListenerPose, tanks: readonly RuntimeValue[], shells?: readonly RuntimeValue[]): void;
  setMasterVolume(value: number): void;
  mute(muted: boolean): void;
  playGarageSting(): void;
  loadingOn(active: boolean): void;
  /** Load the battle's sound groups (optionally its planned roster) before rollout. */
  warmBattleEvents(roster?: readonly string[]): Promise<RuntimeValue>;
  ambientOn(active: boolean): void;
  readonly ready: boolean;
  readonly loadingActive: boolean;
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
  getGameMode,
  getTerrain,
  hasStickyActivation = () => (
    typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive === true
  ),
  loadMixer = () => import('./audioEngine.ts'),
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
  let loadingRequested = false;
  let ambientRequested = false;
  let muted = false;
  let masterVolume = storedMasterVolume();
  let garageStingPending = false;
  let loadingRevision = 0;
  let gestureBound = false;

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

  const latchMasterVolume = (value: number): void => {
    if (!Number.isFinite(value)) return;
    masterVolume = Math.max(0, Math.min(1, value));
  };

  const settleReal = (created: AudioMixer): AudioMixer => {
    real = created;
    if (bus) real.bindBus(bus);
    // These setters latch before the first graph is built. Its destination
    // gain must start at the latest intent, not fade down after sources start.
    real.mute(muted);
    real.setMasterVolume(masterVolume);
    if (context) real.resume();
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
        // while its exact buffers are prepared; phase and intent are read
        // again at handoff.
        const preparedBuffers = context && module.prepareAudioBuffers
          ? await module.prepareAudioBuffers(context) : null;
        return settleReal(module.createAudio({ context, preparedBuffers, getMapId, getGameMode, getTerrain, initialPhase: latestPhase }));
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
      // Unlock inside the gesture; the mixer adopts this context and plays the loading bed when it arrives.
      unlockContext();
      requestReal();
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
      // The garage has sound of its own (its hangar, its controls): the first
      // gesture anywhere unlocks the context inside the gesture and loads the
      // mixer, so neither waits for a first battle.
      if (!gestureBound && typeof document !== 'undefined') {
        gestureBound = true;
        const onGesture = (): void => {
          document.removeEventListener('pointerdown', onGesture, true);
          document.removeEventListener('keydown', onGesture, true);
          if (!muted && masterVolume > 0) resume();
        };
        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
      }
    },
    update(dt: number, listener: AudioListenerPose, tanks: readonly RuntimeValue[], shells?: readonly RuntimeValue[]) {
      real?.update(dt, listener, tanks, shells);
    },
    setMasterVolume(value: number) {
      latchMasterVolume(value);
      real?.setMasterVolume(masterVolume);
    },
    mute(on: boolean) {
      muted = !!on;
      real?.mute(muted);
    },
    playGarageSting() {
      if (real) real.playGarageSting();
      else { garageStingPending = true; requestReal(); }
    },
    loadingOn,
    warmBattleEvents(roster?: readonly string[]) {
      return ensureReal().then((mixer) => mixer?.warmBattleEvents?.(roster));
    },
    ambientOn(on: boolean) {
      ambientRequested = !!on;
      real?.ambientOn(ambientRequested);
    },
    get ready() { return !!real; },
    get loadingActive() { return loadingRequested; },
  };
}
