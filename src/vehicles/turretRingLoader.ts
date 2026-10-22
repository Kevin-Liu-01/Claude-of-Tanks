/**
 * turretRingLoader.ts — the turret ring presentation kept off the game's boot graph (235 bundle budget). tankFactoryCore
 * builds every Garage tank at boot, but the ring a kill leaves (turretRingWell.ts, ~60 KB) acts only at a kill: each
 * visual asks for the module when it is built (a lazy chunk, loaded long before a battle's first kill), and
 * turretRingWell.ts registers itself here as it evaluates, so a static importer (world/wrecks.ts, the ring probe) makes
 * it available at once. Presentation only: the simulation never reads it.
 */
import type * as TurretRingWell from './turretRingWell.ts';

type TurretRingModule = Pick<typeof TurretRingWell, 'createTurretRingPresentation'>;

let ringModule: TurretRingModule | null = null;
let loading: Promise<TurretRingModule> | null = null;

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
  loading ??= ringModule ? Promise.resolve(ringModule) : import('./turretRingWell.ts').then((module) => (ringModule = module));
  return loading;
}
