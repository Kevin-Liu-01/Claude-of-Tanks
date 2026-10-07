import type { CombatState } from '../sim/damage.ts';
import { shellAmmunitionCapacity } from '../sim/ammunition.ts';
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
