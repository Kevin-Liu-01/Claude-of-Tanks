import type { CombatState } from '../sim/damage.ts';
import { shellAmmunitionCapacity } from '../sim/ammunition.ts';
import { magazineFedRounds, type MagazineIndicatorSpec } from '../sim/magazineIndicator.ts';
import { specialActionDescriptor, type SpecialActionSpec } from '../sim/specialActionPolicy.ts';

/** A mode can replace the gun without changing the vehicle ID. Read the live
 * capability each frame; repaint only when its descriptor or vehicle changes. */
export function createSpecialActionPresentationReader() {
  let previousId: string | null | undefined;
  let previousDescriptor: ReturnType<typeof specialActionDescriptor> | undefined;
  return (spec: (SpecialActionSpec & { id: string }) | null | undefined) => {
    const id = spec?.id ?? null;
    const descriptor = specialActionDescriptor(spec);
    if (id === previousId && descriptor === previousDescriptor) return null;
    previousId = id;
    previousDescriptor = descriptor;
    return descriptor;
  };
}

/** Match exhausted smoke controls: retain the shortcut with its empty inventory.
 * Read live ammunition, so resupply restores it without a vehicle/spec change. */
export function depletedMissileLabel(
  combat: Pick<CombatState, 'ammo' | 'ammoCapacity'> | null | undefined,
  slot: number,
  shell: { type?: string; count?: number | null } | null | undefined,
): string | null {
  if (!Number.isInteger(slot) || slot < 0 || !combat?.ammo || (combat.ammo[slot] ?? 0) > 0) return null;
  return `0/${combat.ammoCapacity?.[slot] ?? shellAmmunitionCapacity(shell)}`;
}

/** Owner 2026-10-17 (out of ammo): a magazine reload with no magazine-fed round left to load is spent, not a countdown.
 * The ruleset's unlimited-rounds mark (the shell cards') never reads spent, whatever the stowage counters say — the same
 * read as the aim frame's rack and the reticle; a state without inventory never reads spent. */
export function magazineFeedEmpty(
  combat: { ammo?: ArrayLike<number> | null; magazine?: { capacity?: number | null } | null } | null | undefined,
  spec: MagazineIndicatorSpec | null | undefined,
  unlimited = false,
): boolean {
  if (unlimited || !combat?.magazine || !((combat.magazine.capacity ?? 0) > 0)) return false;
  return magazineFedRounds(combat, spec) <= 0;
}
