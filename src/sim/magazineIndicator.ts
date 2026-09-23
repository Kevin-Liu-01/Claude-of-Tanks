/**
 * The multi-round group the reticle's autoloader indicator shows.
 *
 * Two constructions fire more than one round before a long reload: a cannon autoloader (`gun.autoloader`, tracked in
 * `combat.magazine`) and a guided rack salvo (`gun.launcherSalvo`: a short cycle inside the group, then the launcher's
 * normal reload — `combat.launcherSalvoShots` counts the group). Until round 41 only the first reached the HUD, so a
 * salvo launcher such as the ZTZ-100 prototype's twin HJ-P9 rack read as a single-shot weapon that "fired twice": a
 * held trigger releases the next missile the moment the intra-salvo cycle ends. Owner 2026-09-22: "we need to show the
 * autoloader ammo indicator even if they fire on their own". This module is the one derivation every presentation
 * path reads — the solo aim frame, the authoritative snapshot, the reload-progress event — so the indicator can never
 * again depend on which construction a hull uses. Presentation only: firing rules keep reading `combat.magazine`.
 *
 * Node-runnable, DOM-free, allocation-free when `out` is supplied.
 */

export interface MagazineIndicator {
  /** Rounds ready in the current group (0 while the whole group reloads). */
  rounds: number;
  /** Rounds in a full group; the HUD hides the indicator at 1 or below. */
  capacity: number;
  /** A guided rack salvo rather than a cannon magazine: its group reload is the launcher's own 'shell' cycle. */
  launcher: boolean;
}

/** The combat fields the derivation reads (a structural subset of sim/damage CombatState and its mirrors). */
interface MagazineIndicatorCombat {
  shellSlot?: number | null;
  reload?: { t?: number | null; kind?: string | null } | null;
  magazine?: { rounds?: number | null; capacity?: number | null } | null;
  /** Successful guided shots in the current rack salvo (sim/damage startPostShotReload). */
  launcherSalvoShots?: number | null;
  /** Network mirror only: the authority's indicator, decoded from the snapshot. The simulation never sets it. */
  magazineIndicator?: MagazineIndicator | null;
}

/** The spec fields the derivation reads. */
export interface MagazineIndicatorSpec {
  gun?: {
    shells?: ReadonlyArray<{ guided?: boolean } | undefined> | null;
    launcherSalvo?: { rounds: number } | null;
  } | null;
}

function writeIndicator(
  out: MagazineIndicator | null,
  rounds: number,
  capacity: number,
  launcher: boolean,
): MagazineIndicator {
  const indicator = out || { rounds: 0, capacity: 0, launcher: false };
  indicator.rounds = rounds;
  indicator.capacity = capacity;
  indicator.launcher = launcher;
  return indicator;
}

/**
 * Rounds ready in the current multi-round group, or null for a single-shot weapon.
 * - Guided round loaded on a salvo rack: the missiles left in the current salvo group. After the group's last shot the
 *   counter wraps to 0 and the launcher runs its full 'shell' cycle, during which nothing is ready.
 * - Otherwise the cannon magazine, when the hull has one.
 */
export function magazineIndicator(
  combat: MagazineIndicatorCombat | null | undefined,
  spec: MagazineIndicatorSpec | null | undefined,
  out: MagazineIndicator | null = null,
): MagazineIndicator | null {
  if (!combat) return null;
  if (combat.magazineIndicator !== undefined) {
    const mirrored = combat.magazineIndicator;
    return mirrored ? writeIndicator(out, mirrored.rounds, mirrored.capacity, mirrored.launcher) : null;
  }
  // The salvo branch needs the weapon table; the cannon magazine is complete in the combat state alone (fixtures and
  // snapshot sources may carry no spec).
  const slot = Math.max(0, combat.shellSlot ?? 0);
  const loaded = spec?.gun?.shells?.[slot];
  const salvo = spec?.gun?.launcherSalvo;
  if (loaded?.guided === true && salvo && salvo.rounds > 1) {
    const capacity = Math.floor(salvo.rounds);
    const fired = Math.max(0, Math.min(capacity - 1, Math.floor(combat.launcherSalvoShots ?? 0)));
    const reload = combat.reload;
    const groupReloading = fired === 0 && reload?.kind === 'shell' && (reload.t ?? 0) > 1e-3;
    return writeIndicator(out, fired > 0 ? capacity - fired : groupReloading ? 0 : capacity, capacity, true);
  }
  const magazine = combat.magazine;
  const capacity = Math.max(0, Math.floor(magazine?.capacity ?? 0));
  if (!magazine || capacity <= 0) return null;
  return writeIndicator(out, Math.max(0, Math.min(capacity, Math.floor(magazine.rounds ?? 0))), capacity, false);
}

/** True when a hull's weapon table contains any multi-round group (for fleet audits and the garage). */
export function hasMultiRoundGroup(spec: MagazineIndicatorSpec & {
  gun?: { autoloader?: { magazineSize?: number } | null } | null;
} | null | undefined): boolean {
  const gun = spec?.gun;
  if (!gun) return false;
  if ((gun.autoloader?.magazineSize ?? 0) > 1) return true;
  return (gun.launcherSalvo?.rounds ?? 0) > 1 && !!gun.shells?.some((shell) => shell?.guided === true);
}
