import type { RuntimeValue } from '../runtimeTypes.ts';
// Shared consumable rules. Kits are reusable for the whole battle; successful
// use starts the item's own cooldown, while no-op presses remain free.

export interface ConsumableRule {
  readonly id: 'repair' | 'first_aid' | 'extinguisher';
  readonly label: string;
  readonly cooldownS: number;
}

export type ConsumableCooldownResult =
  | { ok: false; remainingS: number }
  | { ok: true; cooldownS: number; readyAt: number };

export const CONSUMABLE_RULES: readonly ConsumableRule[] = Object.freeze([
  Object.freeze({ id: 'repair', label: 'Repair Kit', cooldownS: 35 }),
  Object.freeze({ id: 'first_aid', label: 'First Aid Kit', cooldownS: 45 }),
  Object.freeze({ id: 'extinguisher', label: 'Fire Extinguisher', cooldownS: 25 }),
]);

export const CONSUMABLE_READY_MARK = '∞';

export function cooldownRemaining(nowS: RuntimeValue, readyAtS: RuntimeValue): number {
  return Math.max(0, (Number(readyAtS) || 0) - (Number(nowS) || 0));
}

/** Start a slot cooldown. The caller must first prove the kit did useful work. */
export function startConsumableCooldown(
  readyAt: number[] | null | undefined,
  slot: number,
  nowS: number,
): ConsumableCooldownResult | null {
  const rule = CONSUMABLE_RULES[slot];
  if (!rule || !Array.isArray(readyAt)) return null;
  const remainingS = cooldownRemaining(nowS, readyAt[slot]);
  if (remainingS > 0) return { ok: false, remainingS };
  readyAt[slot] = nowS + rule.cooldownS;
  return { ok: true, cooldownS: rule.cooldownS, readyAt: readyAt[slot] };
}

export function resetConsumableCooldowns(readyAt: number[]): void {
  for (let i = 0; i < CONSUMABLE_RULES.length; i++) readyAt[i] = 0;
}
