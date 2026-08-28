import {
  CONSUMABLE_READY_MARK, CONSUMABLE_RULES, cooldownRemaining,
  resetConsumableCooldowns, startConsumableCooldown,
} from './consumables.ts';

const readyAt = [0, 0, 0];
if (CONSUMABLE_READY_MARK !== '∞') throw new Error('ready marker must communicate infinite uses');
if (CONSUMABLE_RULES.map((r) => r.cooldownS).join(',') !== '35,45,25') {
  throw new Error('consumable cooldown tuning changed unexpectedly');
}
const first = startConsumableCooldown(readyAt, 0, 12);
if (!first || !first.ok || first.readyAt !== 47) throw new Error('repair cooldown did not start');
const denied = startConsumableCooldown(readyAt, 0, 20);
if (!denied || denied.ok || denied.remainingS !== 27) throw new Error('active cooldown was not denied');
if (cooldownRemaining(47, readyAt[0]) !== 0) throw new Error('cooldown did not become ready');
const reused = startConsumableCooldown(readyAt, 0, 47);
if (!reused || !reused.ok || reused.readyAt !== 82) throw new Error('kit was not reusable');
resetConsumableCooldowns(readyAt);
if (readyAt.some(Boolean)) throw new Error('battle reset did not ready every kit');
