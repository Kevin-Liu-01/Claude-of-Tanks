/**
 * turretRingLoader.ts — the turret ring presentation kept off the game's boot graph (235 bundle budget). tankFactoryCore
 * builds every Garage tank at boot, but the ring a kill leaves (turretRingWell.ts, ~60 KB) acts only at a kill: each
 * visual asks for the module when it is built (a lazy chunk, loaded long before a battle's first kill), and
 * turretRingWell.ts registers itself here as it evaluates, so a static importer (world/wrecks.ts, the ring probe) makes
 * it available at once. Presentation only: the simulation never reads it.
 */
import type * as TurretRingWell from './turretRingWell.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

type TurretRingModule = Pick<typeof TurretRingWell, 'createTurretRingPresentation' | 'capTurretRingDents'>;

let ringModule: TurretRingModule | null = null;
// (2026-11-02 audit R6) one lazyChunk: a failed chunk no longer stands for the session (`loading ??=` kept the
// rejection, so no kill left a ring until a reload); the next visual's ask past the backoff loads it again
const loading = createLazyChunk((): Promise<TurretRingModule> | TurretRingModule =>
  ringModule ?? import('./turretRingWell.ts').then((module) => (ringModule = module)));

/** turretRingWell.ts, as it evaluates. */
export function registerTurretRingModule(module: TurretRingModule): void {
  ringModule = module;
}

/** The module when it has loaded, else null. */
export function turretRingModule(): TurretRingModule | null {
  return ringModule;
}

/** Load the module once (every visual asks as it is built; the first ask fetches the chunk). */
export function loadTurretRingModule(): Promise<TurretRingModule> {
  return ringModule ? Promise.resolve(ringModule) : loading.load();
}
