/**
 * wreckTurretDriverLoader.ts — the wreck turret's physics, loaded only where turrets pop (physics lane, 2026-10-11).
 *
 * A popped turret is a rigid body (wreckTurretDriver.ts over sim/rigidBody.ts), but every page that draws a tank loads
 * the tank factory: the gallery and the garage carried about 30 KB gzip of wreck physics they never run (218's bundle
 * budget). The factory imports only this module, which holds the physics behind a dynamic import(). The battle's combat
 * warm path and the Studio start that import; a turret that pops before it lands keeps the factory's scripted arc and
 * settle pose for that one kill, and the frame never waits. (2026-11-02 audit F10) A wreck whose authority sends its
 * turret's pose before the physics has landed asks for it again (tankFactoryCore requestTurretDriver) and hands its
 * turret to the body once it lands; a failed load is a declared state, reported once per attempt, never swallowed.
 */
import type { WreckTurretDriver, WreckTurretDriverOptions } from './wreckTurretDriver.ts';

type DriverModule = typeof import('./wreckTurretDriver.ts');

/** The physics' load as one declared state: never asked, in flight, landed, or the last attempt failed (retryable). */
export type WreckTurretDriverLoadState = 'idle' | 'loading' | 'loaded' | 'failed';

export interface WreckTurretDriverLoader {
  preload(): Promise<void>;
  readonly state: WreckTurretDriverLoadState;
  /** The last attempt's failure (null unless failed). */
  readonly error: unknown;
  create(options: WreckTurretDriverOptions): WreckTurretDriver | null;
}

/**
 * The loader over an importer (the page's: the driver's own chunk; a selftest's: one that fails). Concurrent preloads
 * share one request; a failure moves to 'failed', is reported through `report` once, and the next preload retries.
 */
export function createWreckTurretDriverLoader(
  importer: () => Promise<DriverModule>,
  report: (message: string, error: unknown) => void = (message, error) => console.warn(message, error),
): WreckTurretDriverLoader {
  let loaded: DriverModule | null = null;
  let loading: Promise<DriverModule> | null = null;
  let state: WreckTurretDriverLoadState = 'idle';
  let error: unknown = null;
  return {
    get state() { return state; },
    get error() { return error; },
    preload() {
      if (loaded) return Promise.resolve();
      if (!loading) {
        state = 'loading';
        error = null;
        loading = importer().then(
          (module) => { loaded = module; state = 'loaded'; return module; },
          (failure: unknown) => {
            loading = null;
            state = 'failed';
            error = failure;
            report('[wreck turret] the turret physics failed to load: turrets keep the scripted pop until a retry lands', failure);
            throw failure;
          },
        );
      }
      return loading.then(() => undefined);
    },
    create(options) {
      return loaded ? loaded.createWreckTurretDriver(options) : null;
    },
  };
}

const pageLoader = createWreckTurretDriverLoader(() => import('./wreckTurretDriver.ts'));

/**
 * Start loading the wreck turret's physics (the battle's combat warm path, the Studio, a wreck whose authority's pose
 * arrived first). Idempotent: concurrent calls share one request, and a failed load can be retried by the next call.
 * Resolves once a pop can use it.
 */
export function preloadWreckTurretDriver(): Promise<void> {
  return pageLoader.preload();
}

/** Whether a pop now would follow its body (the physics has loaded). */
export function wreckTurretDriverReady(): boolean {
  return pageLoader.state === 'loaded';
}

/** The physics' load state (a failure is 'failed' until a retry lands). */
export function wreckTurretDriverLoadState(): WreckTurretDriverLoadState {
  return pageLoader.state;
}

/** A turret's driver if the physics has loaded, else null (the caller keeps its scripted arc for this kill). */
export function createWreckTurretDriverIfLoaded(options: WreckTurretDriverOptions): WreckTurretDriver | null {
  return pageLoader.create(options);
}
