// The shortest cycle a gun fires at between two rounds of one magazine (startPostShotReload in damage.ts). Every gun's
// floor is three 60 Hz ticks, 1,200 rounds a minute. A rotary gun (`autoloader.rotary`, default off: the M163's M61
// Vulcan, release 270) may cycle once a tick, the fixed step itself (movement.ts SIM_DT, pinned by
// fireCycleFloor.selftest): 3,600 rounds a minute, one round per tick at most, since the step fires once after it ticks
// the reload. Dependency-free so the spec passes, the balance audit and the catalog read the same floor as the sim.
// First-party: Kevin B. Liu (NOTICE.md).

/** Every gun's floor between two rounds of a magazine, seconds (three ticks). */
export const FIRE_CYCLE_FLOOR_S = 0.05;

/** A rotary gun's floor, seconds: one tick (movement.ts SIM_DT). */
export const ROTARY_FIRE_CYCLE_FLOOR_S = 1 / 60;

/** The part of an autoloader the floor reads. */
export interface FireCycleAutoloader {
  intraClipS?: number;
  /** a rotary gun (a Gatling's barrel cluster): its floor is one tick, not three */
  rotary?: boolean;
}

/** A gun's autoloader as the sim reads it: one type for damage.ts DamageGunSpec and movement.ts MovementGunSpec, which
 *  the solo gun spec extends together. */
export interface GunAutoloader extends FireCycleAutoloader {
  magazineSize: number;
  fullReloadS?: number;
}

/** The floor this autoloader's gun fires at. */
export function fireCycleFloorS(autoloader: FireCycleAutoloader | null | undefined): number {
  return autoloader?.rotary === true ? ROTARY_FIRE_CYCLE_FLOOR_S : FIRE_CYCLE_FLOOR_S;
}

/** (272) A round's share of one floor cycle's shocks (movement.ts fireRecoil): a rotary gun fires three rounds to the
 *  floor's one, so each round kicks the hull, shoves it and blooms the aim a third as much, and a second of its fire
 *  disturbs the gun as a second at the floor does. 1 for every other gun. */
export function floorShotShare(autoloader: FireCycleAutoloader | null | undefined): number {
  return fireCycleFloorS(autoloader) / FIRE_CYCLE_FLOOR_S;
}

/** The delay between two rounds of one magazine as the simulation runs it (the authored cycle, held at the floor). */
export function intraClipCycleS(autoloader: FireCycleAutoloader, reloadS: number): number {
  return Math.max(fireCycleFloorS(autoloader), Number(autoloader.intraClipS) || reloadS);
}

/**
 * A presentation's thinning of rotary fire to the floor's density (one per shooter, created by each emitter of
 * `shell:fired`): a rotary gun's round fired within the floor of its last full one is thinned, so its muzzle flash, report
 * and camera kick play on every third round at one round a tick, the per-shot effects and voices any other gun at the
 * floor costs; every round still flies, hits and impacts in full. Any gun at or above the floor is never thinned, and a
 * clock that runs back (a new battle) starts the shooter over. Allocation-free once a shooter is known.
 */
export function createRotaryShotThinning(): (shooterId: string, timeS: number) => boolean {
  const lastFullS = new Map<string, number>();
  return (shooterId, timeS) => {
    const last = lastFullS.get(shooterId);
    if (last !== undefined && timeS >= last && timeS - last < FIRE_CYCLE_FLOOR_S - 1e-6) return true;
    lastFullS.set(shooterId, timeS);
    return false;
  };
}
