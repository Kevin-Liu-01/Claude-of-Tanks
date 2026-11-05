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
import type { AudioLandmark, AudioMixer, AudioStructureMakeup, AudioTerrainProbe, AudioWorld } from './audioEngine.ts';
import type { EventBus } from '../game/stateCore.ts';
import { nextPaintFrame } from '../engine/frameScheduler.ts';
import {
  AUDIO_BATTLE_FACT_EVENTS, audioBattleFact, copyAudioBattleMode, createAudioBattleMode, stepAudioBattleMode,
  type AudioBattleMode,
} from './battleMode.ts';
import { killcamOwnsScreen } from '../game/killcamScreen.ts';

interface AudioMixerModule {
  /** Optional cooperative preparation the mixer may want before adoption. */
  prepareAudioBuffers?(context: AudioContext): Promise<unknown>;
  /** Decode the interface's press sounds with no device (boot idle), so the first click finds them ready. */
  prepareInterfaceSounds?(): Promise<void>;
  createAudio(options: {
    context: AudioContext | null;
    /** The facade's device: a mixer built before the first gesture adopts it at resume (never a second context). */
    getContext?: () => AudioContext | null;
    preparedBuffers?: unknown;
    getMapId?: () => string | null;
    getGameMode?: () => string | null;
    getObjectiveTeam?: () => string | null;
    getTerrain?: () => AudioTerrainProbe | null;
    getLandmarks?: () => readonly AudioLandmark[] | null;
    getStructureMakeup?: (structureId: number) => AudioStructureMakeup | null;
    getWorld?: () => AudioWorld | null;
    getTeamRoster?: () => readonly RuntimeValue[] | null;
    getVehicleSpec?: (specId: string) => RuntimeValue;
    initialPhase?: string;
    initialMode?: Readonly<AudioBattleMode>;
  }): AudioMixer;
}

interface LazyAudioOptions {
  loadMixer?(): Promise<AudioMixerModule | null>;
  createContext?(): AudioContext | null;
  getMapId?(): string | null;
  getGameMode?(): string | null;
  getObjectiveTeam?(): string | null;
  getTerrain?(): AudioTerrainProbe | null;
  /** The battlefield's buildings and set pieces (the bells ring from its churches, belfries and campanile). */
  getLandmarks?(): readonly AudioLandmark[] | null;
  /** What a structure is made of (the world's damage anatomy): a building breaks as its walls are built. */
  getStructureMakeup?(structureId: number): AudioStructureMakeup | null;
  /** The battlefield (its landmarks and structures), read by the mixer where a narrower getter is not given. */
  getWorld?(): AudioWorld | null;
  /** The field by side a network seat counts by (its spotted list never is one): the crew's team-count calls. */
  getTeamRoster?(): readonly RuntimeValue[] | null;
  /** A vehicle's whole spec by id: the battle warm resolves each roster hull's powertrain as its rig will. */
  getVehicleSpec?(specId: string): RuntimeValue;
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
  // the world and game getters (map, mode, objective side, terrain, the world, the counted roster, the fleet), handed to the mixer
  ...world
}: LazyAudioOptions = {}): LazyAudio {
  let context: AudioContext | null = null;
  let real: AudioMixer | null = null;
  let modulePromise: Promise<AudioMixerModule | null> | null = null;
  let realPromise: Promise<AudioMixer | null> | null = null;
  let bus: EventBus | null = null;
  let stopPhaseTracking: (() => void) | null = null;
  let stopVolumeTracking: (() => void) | null = null;
  // The battle mode as the bus moves it while no mixer exists (battleMode.ts, the mixer's own owner): the mixer created
  // after a battle edge, its rollout, a pause or a kill-cam starts where they left it (2026-11-02 audit F11).
  const mode = createAudioBattleMode();
  let loadingRequested = false;
  let ambientRequested = false;
  let muted = false;
  let masterVolume = storedMasterVolume();
  let garageStingPending = false;
  let loadingRevision = 0;
  let gestureBound = false;

  // ---- the device's lifecycle (2026-11-02 audit F11). The browser can stop the context under the game: suspended
  // (a backgrounded tab, an autoplay policy) or, on WebKit, 'interrupted' (a phone call, another app's audio). Either
  // is resumed by the next gesture anywhere: the unlock re-arms whenever the device stops, and steps aside while it
  // runs. A page that becomes visible again also tries at once, where the browser allows it without a gesture.
  const audible = (): boolean => !muted && masterVolume > 0;
  const halted = (): boolean => {
    const state: string | undefined = context?.state;
    return state === 'suspended' || state === 'interrupted';
  };
  const GESTURES = ['pointerdown', 'pointerup', 'keydown'] as const;
  let gestureArmed = false;
  const disarmGesture = (): void => {
    if (!gestureArmed) return;
    gestureArmed = false;
    for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
  };
  const armGesture = (): void => {
    if (gestureArmed || typeof document === 'undefined') return;
    gestureArmed = true;
    for (const type of GESTURES) document.addEventListener(type, onGesture, true);
  };
  // Opening the device is synchronous and can take hundreds of milliseconds (click-perf-244: 585 ms of a first Garage
  // press's handlers). Where activation is verified the press paints first and the device opens one frame later,
  // inside the same activation window; a touch's pointerdown carries no activation yet, so its pointerup does. Engines
  // without the activation API keep the in-gesture unlock, and so does a device already open: resuming it is cheap,
  // and WebKit resumes an interrupted context only inside the gesture.
  // A muted or silent game leaves the device alone and keeps the unlock: the gesture after it is heard again resumes.
  function onGesture(): void {
    if (!audible()) return;
    const sticky = hasStickyActivation();
    const activationKnown = typeof navigator !== 'undefined' && !!navigator.userActivation;
    if (!sticky && activationKnown) return;
    disarmGesture();
    if (context || !sticky) { resume(); return; }
    void nextPaintFrame().then(() => { if (!muted && masterVolume > 0) resume(); });
  }
  const onDeviceState = (): void => { if (halted()) armGesture(); };
  // Heard again (unmuted, or the master raised from zero): a device the browser stopped meanwhile resumes now (inside
  // the unmute press, the usual case) or on the next gesture, and one never opened waits for the next gesture.
  const onAudible = (): void => {
    if (!gestureBound) return; // the first bind arms the unlock itself
    if (context && halted()) resume();
    else if (!context || !real) armGesture();
  };
  const onVisibility = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !halted()) return;
    armGesture();
    if (!muted && masterVolume > 0) resume();
  };

  const unlockContext = (): AudioContext | null => {
    if (!context) {
      context = createContext();
      if (context && typeof context.addEventListener === 'function') context.addEventListener('statechange', onDeviceState);
    }
    if (!context) return null;
    // a refused resume (no activation yet, the call still holding the device) leaves the next gesture to try again
    if (halted()) void context.resume().catch(() => { if (halted()) armGesture(); });
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
    const was = audible();
    masterVolume = Math.max(0, Math.min(1, value));
    if (!was && audible()) onAudible();
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
        return settleReal(module.createAudio({
          ...world, context, getContext: () => context, preparedBuffers, initialPhase: mode.phase, initialMode: copyAudioBattleMode(mode),
        }));
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
      // The mixer may arrive after the battle phase edge, its rollout or an overlay. Carry that state across the
      // deferred transfer without re-emitting a global event. The facts are the mixer's own (audioBattleFact: one reading
      // of each payload for both layers; a kill-cam edge reads the replay's own flag, killcamScreen.ts).
      const killcamLive = (): boolean => killcamOwnsScreen(nextBus);
      const stops = AUDIO_BATTLE_FACT_EVENTS.map((event) => nextBus.on(event, (payload) => {
        const next = audioBattleFact(event, payload, killcamLive);
        if (!next || !stepAudioBattleMode(mode, next)) return;
        // the battle's world is wanted per battle (the mixer's rule): any phase edge ends the intent
        if (next.kind === 'phase') ambientRequested = false;
      }));
      stopPhaseTracking = () => { for (const stop of stops) stop(); };
      if (real) real.bindBus(nextBus);
      // The garage has sound of its own (its hangar, its controls): the first
      // gesture anywhere unlocks the context inside the gesture and loads the
      // mixer, so neither waits for a first battle.
      if (!gestureBound && typeof document !== 'undefined') {
        gestureBound = true;
        // the first gesture opens the device and loads the mixer (unless both already happened)
        if (!context || !real || halted()) armGesture();
        document.addEventListener('visibilitychange', onVisibility);
        // Boot idle after the first frame (AU.07, 2026-10-13): the mixer module and the interface's press sounds, decoded
        // with no device, so the first press anywhere is neither silent nor late.
        void nextPaintFrame().then(() => (globalThis.requestIdleCallback ?? setTimeout)(() => void preload().then((module) => module?.prepareInterfaceSounds?.())));
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
      const was = audible();
      muted = !!on;
      real?.mute(muted);
      if (!was && audible()) onAudible();
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
