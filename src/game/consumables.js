// Shared consumable rules. Kits are reusable for the whole battle; successful
// use starts the item's own cooldown, while no-op presses remain free.

export const CONSUMABLE_RULES = Object.freeze([
  Object.freeze({ id: 'repair', label: 'Repair Kit', cooldownS: 35 }),
  Object.freeze({ id: 'first_aid', label: 'First Aid Kit', cooldownS: 45 }),
  Object.freeze({ id: 'extinguisher', label: 'Fire Extinguisher', cooldownS: 25 }),
]);

export const CONSUMABLE_READY_MARK = '∞';

export function cooldownRemaining(nowS, readyAtS) {
  return Math.max(0, (Number(readyAtS) || 0) - (Number(nowS) || 0));
}

/** Start a slot cooldown. The caller must first prove the kit did useful work. */
export function startConsumableCooldown(readyAt, slot, nowS) {
  const rule = CONSUMABLE_RULES[slot];
  if (!rule || !Array.isArray(readyAt)) return null;
  const remainingS = cooldownRemaining(nowS, readyAt[slot]);
  if (remainingS > 0) return { ok: false, remainingS };
  readyAt[slot] = nowS + rule.cooldownS;
  return { ok: true, cooldownS: rule.cooldownS, readyAt: readyAt[slot] };
}

export function resetConsumableCooldowns(readyAt) {
  for (let i = 0; i < CONSUMABLE_RULES.length; i++) readyAt[i] = 0;
}
