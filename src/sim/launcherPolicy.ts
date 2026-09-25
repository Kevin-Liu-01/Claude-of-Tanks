/** Physical launch stock is independent of guidance or warhead type. */
export type LauncherMuzzle = {
  x: number; y: number; z: number;
  /** Default: pitching, non-recoiling gun frame. Fixed roof pods use turret. */
  frame?: 'gun' | 'turret';
  pitch?: number;
  yaw?: number;
  /** Omitted for a shared rack. Separate weapon banks name their ammo slots. */
  shellSlots?: number[];
  /** A launch-cover terminal, rather than an exposed annular bore. */
  covered?: boolean;
};
interface LauncherGun {
  fixedLaunchCanisters?: boolean;
  launcherMuzzles?: readonly LauncherMuzzle[];
  shells?: readonly LauncherRound[];
}
interface LauncherRound { name?: string; guided?: boolean; launcherTubes?: number }

/** Return the physical tube index, skipping banks belonging to another weapon. */
export function launcherMuzzleIndex(
  gun: LauncherGun | null | undefined,
  round: LauncherRound | null | undefined,
  cursor = 0,
): number {
  const mouths = gun?.launcherMuzzles;
  if (!round || !mouths?.length || round.launcherTubes === 0
      || (round.guided !== true && gun?.fixedLaunchCanisters !== true)) return -1;
  let slot = gun?.shells?.indexOf(round) ?? -1;
  if (slot < 0 && round.name) slot = gun?.shells?.findIndex(candidate => candidate.name === round.name) ?? -1;
  const start = ((Math.trunc(cursor) % mouths.length) + mouths.length) % mouths.length;
  for (let offset = 0; offset < mouths.length; offset++) {
    const index = (start + offset) % mouths.length;
    if (!mouths[index]!.shellSlots || mouths[index]!.shellSlots!.includes(slot)) return index;
  }
  return -1;
}

/** Separate pitching mouths serve guided rails and explicitly fixed rocket racks. */
export function usesLauncherMuzzles(
  gun: LauncherGun | null | undefined,
  round: LauncherRound | null | undefined,
): boolean {
  return launcherMuzzleIndex(gun, round) >= 0;
}

/** Presentation classification only: never enables steering or bypasses magazines. */
export function isUnguidedRocket(
  gun: LauncherGun | null | undefined,
  round: LauncherRound | null | undefined,
): boolean {
  return usesLauncherMuzzles(gun, round) && round?.guided !== true;
}
