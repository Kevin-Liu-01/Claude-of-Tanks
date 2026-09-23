/** Physical launch stock is independent of guidance or warhead type. */
interface LauncherGun {
  fixedLaunchCanisters?: boolean;
  launcherMuzzles?: readonly { x: number; y: number; z: number }[];
}
interface LauncherRound { guided?: boolean }

/** Separate pitching mouths serve guided rails and explicitly fixed rocket racks. */
export function usesLauncherMuzzles(
  gun: LauncherGun | null | undefined,
  round: LauncherRound | null | undefined,
): boolean {
  return !!round && !!gun?.launcherMuzzles?.length
    && (round.guided === true || gun.fixedLaunchCanisters === true);
}

/** Presentation classification only: never enables steering or bypasses magazines. */
export function isUnguidedRocket(
  gun: LauncherGun | null | undefined,
  round: LauncherRound | null | undefined,
): boolean {
  return usesLauncherMuzzles(gun, round) && round?.guided !== true;
}
