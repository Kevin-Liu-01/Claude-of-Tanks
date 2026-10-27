// consumables.selftest — the shared display rules over the catalog (2026-10-26): the ready mark, every item's timing
// from the ruleset in catalog order (the original kits' cooldowns kept), and the cooldown arithmetic.
import {
  CONSUMABLE_READY_MARK, CONSUMABLE_RULES, cooldownRemaining,
} from './consumables.ts';
import { CONSUMABLE_CATALOG } from '../sim/consumableRules.ts';

if (CONSUMABLE_READY_MARK !== '∞') throw new Error('ready marker must communicate infinite uses');
if (CONSUMABLE_RULES.map((r) => r.id).join(',') !== CONSUMABLE_CATALOG.map((item) => item.id).join(',')) {
  throw new Error('the rules list every catalog item in catalog order');
}
const byId = Object.fromEntries(CONSUMABLE_RULES.map((r) => [r.id, r]));
if ([byId.repair, byId.first_aid, byId.extinguisher].map((r) => r.cooldownS).join(',') !== '35,45,25') {
  throw new Error('consumable cooldown tuning changed unexpectedly');
}
if ([byId.repair, byId.first_aid, byId.extinguisher].some((r) => r.charges !== null)) throw new Error('the kits stay unlimited');
if (cooldownRemaining(40, 47) !== 7 || cooldownRemaining(47, 47) !== 0 || cooldownRemaining(50, 47) !== 0) {
  throw new Error('cooldown arithmetic');
}
console.log(`consumables: ${CONSUMABLE_RULES.length} items, the kits' cooldowns kept`);
