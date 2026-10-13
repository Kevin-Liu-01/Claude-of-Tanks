/**
 * wreckTurretDriverLoader.ts — the wreck turret's physics, loaded only where turrets pop (physics lane, 2026-10-11).
 *
 * A popped turret is a rigid body (wreckTurretDriver.ts over sim/rigidBody.ts), but every page that draws a tank loads
 * the tank factory: the gallery and the garage carried about 30 KB gzip of wreck physics they never run (218's bundle
 * budget). The factory imports only this module, which holds the physics behind a dynamic import(). The battle's combat
 * warm path and the Studio start that import; a turret that pops before it lands keeps the factory's scripted arc and
 * settle pose for that one kill, and the frame never waits.
 */
import type { WreckTurretDriver, WreckTurretDriverOptions } from './wreckTurretDriver.ts';

type DriverModule = typeof import('./wreckTurretDriver.ts');

let loaded: DriverModule | null = null;
let loading: Promise<DriverModule> | null = null;

/**
 * Start loading the wreck turret's physics (the battle's combat warm path, the Studio). Idempotent: concurrent calls
 * share one request, and a failed load can be retried by the next call. Resolves once a pop can use it.
 */
export function preloadWreckTurretDriver(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= import('./wreckTurretDriver.ts').then(
    (module) => { loaded = module; return module; },
    (error: unknown) => { loading = null; throw error; },
  );
  return loading.then(() => undefined);
}

/** Whether a pop now would follow its body (the physics has loaded). */
export function wreckTurretDriverReady(): boolean {
  return loaded !== null;
}

/** A turret's driver if the physics has loaded, else null (the caller keeps its scripted arc for this kill). */
export function createWreckTurretDriverIfLoaded(options: WreckTurretDriverOptions): WreckTurretDriver | null {
  return loaded ? loaded.createWreckTurretDriver(options) : null;
}
