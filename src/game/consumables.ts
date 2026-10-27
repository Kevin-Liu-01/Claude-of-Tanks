import type { RuntimeValue } from '../runtimeTypes.ts';
import { CONSUMABLE_CATALOG, type ConsumableId } from '../sim/consumableRules.ts';
import { consumableTiming } from '../sim/matchRuleset.ts';
// Shared consumable display rules. The catalog, its gates and every item's effect are sim/consumableRules.ts; the
// cooldowns and charges are the ruleset's (sim/matchRuleset.ts CONSUMABLE_TIMING); a crew's loadout is the Garage's
// (game/consumableLoadout.ts). A use with nothing to do stays free, as the kits always have.

interface ConsumableRule {
  readonly id: ConsumableId;
  readonly cooldownS: number;
  /** Uses per life; null is unlimited. */
  readonly charges: number | null;
}

/** Every catalog item with its timing, in catalog order (the field manual's kit list). */
export const CONSUMABLE_RULES: readonly ConsumableRule[] = Object.freeze(CONSUMABLE_CATALOG.map((item) => {
  const timing = consumableTiming(item.id);
  return Object.freeze({ id: item.id, cooldownS: timing.cooldownS, charges: timing.charges });
}));

export const CONSUMABLE_READY_MARK = '∞';

export function cooldownRemaining(nowS: RuntimeValue, readyAtS: RuntimeValue): number {
  return Math.max(0, (Number(readyAtS) || 0) - (Number(nowS) || 0));
}
