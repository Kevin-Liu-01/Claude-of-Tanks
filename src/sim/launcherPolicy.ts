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

/** A gun's own mouths (gun.muzzles: the twin cannons, aft10's fixed canisters), gun-local x and y about its bore. */
interface CannonGun extends LauncherGun {
  muzzles?: unknown;
}
/** One of the gun's own mouths, read off the spec (x across, y up, gun-local; its z is the barrel's length). */
export interface CannonMouth { x: number; y: number }
/** The hull's barrel cursor: the next shot's mouth is (muzzleCursor % mouths); a shot leaves it at that index + 1. */
export interface CannonMuzzleCursor { muzzleCursor?: number }

const mouthCount = (gun: CannonGun | null | undefined): number => (Array.isArray(gun?.muzzles) ? gun.muzzles.length : 0);

/**
 * Which of the gun's own mouths a round leaves (round 8 Y1 s5-01): every round that is not a launcher round
 * (usesLauncherMuzzles) on a gun with two or more mouths, the 268 twin air-defence cannons (gepard_1a2, tunguska_m,
 * pantsir_s1, pgz95, pgz09, the 0.15-0.20 m twin plants) and aft10's fixed canisters. -1 for a single bore or a launcher
 * round (launcherMuzzleIndex owns those). Pure: `cursor` is the hull's combat.muzzleCursor.
 */
export function cannonMuzzleIndex(gun: CannonGun | null | undefined, round: LauncherRound | null | undefined, cursor = 0): number {
  const count = mouthCount(gun);
  if (count < 2 || usesLauncherMuzzles(gun, round)) return -1;
  const at = Number.isFinite(cursor) ? Math.trunc(cursor) : 0;
  return ((at % count) + count) % count;
}

/**
 * The barrel's one owner (round 8 Y1 s5-01): the mouth this shot leaves, and the hull's cursor moved past it. Both
 * drivers call it at the shot, the solo step (game/state.ts prepareMuzzleDirection) and the authority
 * (sim/authoritativeMatch.ts tryFire, which offsets the round's origin to that mouth and names it in shell_fired), and a
 * network client mirrors the authority's index into its own hull and its visual's kick (battlePresentation), so the flash,
 * the round and the hit leave one barrel on every screen. The bots' clear-shot lane (sim/botGunLane.ts) stays on the gun's
 * centre line: an autocannon's dispersion dwarfs the bores' spacing. A host change resets the alternation (cosmetic).
 */
export function nextCannonMuzzle(gun: CannonGun | null | undefined, round: LauncherRound | null | undefined,
  combat: CannonMuzzleCursor): number {
  const index = cannonMuzzleIndex(gun, round, combat.muzzleCursor ?? 0);
  if (index >= 0) combat.muzzleCursor = index + 1;
  return index;
}

/** The gun's mouth at `index` (cannonMuzzleIndex) into `out` (no allocation at a shot); false when there is none. */
export function cannonMouth(gun: CannonGun | null | undefined, index: number, out: CannonMouth): boolean {
  if (index < 0 || !Array.isArray(gun?.muzzles)) return false;
  const mouth = gun.muzzles[index] as { x?: unknown; y?: unknown } | undefined;
  if (!mouth) return false;
  out.x = typeof mouth.x === 'number' && Number.isFinite(mouth.x) ? mouth.x : 0;
  out.y = typeof mouth.y === 'number' && Number.isFinite(mouth.y) ? mouth.y : 0;
  return true;
}
