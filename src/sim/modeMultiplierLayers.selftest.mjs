// modeMultiplierLayers.selftest — combat.equipMults as named layers (audit M5, 2026-11-02). The equipment's own values,
// the mode's stamps (the Juggernaut boss's reload, the wave hostiles', the infected's, the AC-130 convoy's) and the
// active consumables' factors are each a layer; one function composes them, so a timed item's use or end no longer
// rebuilds the multipliers from a snapshot taken before the mode stamped them (the boss lost its x0.5 reload to its first
// rations), and the hostile and infection stamps no longer share one "already applied" latch. Both drivers make a tank's
// consumables before the controller stamps it (at spawn) and inside the revive hook (at a revive): the fixtures do too.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { applyRulesetToCombat, consumableTiming, matchRulesetFor } from './matchRuleset.ts';
import { applyEquipmentToCombat, computeEquipMults } from './equipmentRules.ts';
import * as consumableRules from './consumableRules.ts';
import { ESCORT_RULES, createGunshipEscort } from './gunshipEscort.ts';

const { GOVERNOR_POWER_MULT, RATIONS_RELOAD_MULT, createConsumableState, tickConsumables, useConsumableSlot } = consumableRules;
const host = (timeS) => ({ timeS, repairAll: () => [], repair: () => [], restock: () => 0, smoke: null, moduleRepaired() {}, fireOut() {} });
const combat = () => ({ hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20], crew: { commander: true },
  fire: { burning: false, ticksLeft: 0, tickTimer: 0 }, equipMults: { reload: 1, aimTime: 1, repair: 1, power: 1 } });
const tank = (id, team, bot, x, z) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 }, combat: combat() });
const ITEMS = ['rations', 'governor_override', 'repair'];
const arm = (entity) => { entity.consumables = createConsumableState(ITEMS, consumableTiming, entity.combat); };
const use = (entity, slot, timeS) => assert.ok(useConsumableSlot(entity.consumables, slot, entity.combat, host(timeS), consumableTiming).ok,
  `${entity.id}: slot ${slot} used`);
const expire = (entity, timeS) => tickConsumables(entity.consumables, entity.combat, timeS, () => 1, () => false);

// ---- the Juggernaut boss keeps its x0.5 reload through a timed item's use and its end
{
  const jugg = matchRulesetFor('juggernaut');
  const boss = tank('boss', 'alpha', false, 0, -100), hunter = tank('hunter', 'bravo', true, 0, 100);
  arm(boss); arm(hunter);
  createMatchModeController({ mode: 'juggernaut', entities: [boss, hunter], ruleset: jugg, revive() {} });
  const scale = jugg.juggernaut.reloadScale;
  assert.equal(boss.combat.equipMults.reload, scale, 'the boss is stamped');
  use(boss, 0, 1);
  assert.equal(boss.combat.equipMults.reload, scale * RATIONS_RELOAD_MULT, 'rations bend the boss\'s own reload, not the base one');
  expire(boss, 1 + 41);
  assert.equal(boss.combat.equipMults.reload, scale, 'the boss keeps its x0.5 after the rations end');
  use(boss, 1, 50);
  assert.equal(boss.combat.equipMults.power, GOVERNOR_POWER_MULT);
  assert.equal(boss.combat.equipMults.reload, scale, 'another item\'s use leaves the stamp');
  expire(boss, 50 + 11);
  assert.equal(boss.combat.equipMults.power, 1);
  assert.equal(boss.combat.equipMults.reload, scale, 'and its end');
  assert.equal(hunter.combat.equipMults.reload, 1, 'the hunters are not stamped');
}

// ---- the wave hostiles' reload and the infection's stamp are separate: both land on an infected bot
{
  const infected = matchRulesetFor('infected');
  const mixed = { ...infected, horde: { ...matchRulesetFor('endless_horde').horde, hostileReloadScale: 1.35 } };
  const survivor = tank('s0', 'alpha', false, 0, -150), ally = tank('s1', 'alpha', true, 12, -150);
  const zombie = tank('z0', 'bravo', true, 0, 150);
  for (const entity of [survivor, ally, zombie]) arm(entity);
  let clock = 0;
  const controller = createMatchModeController({ mode: 'infected', entities: [survivor, ally, zombie], ruleset: mixed,
    revive(entity, spawn) {
      Object.assign(entity.state.pos, { x: spawn.x, y: 0, z: spawn.z });
      entity.combat = combat();
      arm(entity); // the drivers' revive hooks make the life's consumables before the controller stamps it
    } });
  assert.equal(zombie.combat.maxHp, Math.round(1000 * infected.infection.infectedHpScale),
    'an infected bot takes the infection\'s hull beside the hostile reload (one latch skipped it)');
  assert.equal(zombie.combat.equipMults.reload, 1.35 * infected.infection.infectedReloadScale, 'and both reload factors');
  assert.equal(survivor.combat.maxHp, Math.round(1000 * infected.infection.survivorHpScale), 'a survivor takes its own hull');
  // a converted bot: its new life's consumables are made in the revive hook, then the controller stamps it
  ally.combat.destroyed = true;
  controller.step(1 / 60, clock += 0.5);
  assert.equal(ally.team, 'bravo', 'the bot is infected');
  controller.step(1 / 60, clock += infected.respawnS + 0.5);
  assert.equal(ally.combat.destroyed, false, 'and rises again');
  const stamped = 1.35 * infected.infection.infectedReloadScale;
  assert.equal(ally.combat.equipMults.reload, stamped, 'the revive stamps the new life');
  use(ally, 0, clock);
  assert.equal(ally.combat.equipMults.reload, stamped * RATIONS_RELOAD_MULT, 'its rations bend the stamped reload');
  expire(ally, clock + 41);
  assert.equal(ally.combat.equipMults.reload, stamped, 'and the stamp outlives them');
}

// ---- the AC-130 convoy's reload stamp
{
  const friend = tank('convoy', 'alpha', true, 0, 0);
  arm(friend);
  createGunshipEscort([friend], { x: 500, y: 0, z: 500 }, () => {});
  assert.equal(friend.combat.equipMults.reload, ESCORT_RULES.reloadScale);
  use(friend, 0, 1);
  expire(friend, 1 + 41);
  assert.equal(friend.combat.equipMults.reload, ESCORT_RULES.reloadScale, 'the convoy keeps its stamp after an item ends');
}

// ---- the layers themselves: one composition, a source set twice counts once
{
  const { composeMultiplier, setModeMultiplier } = consumableRules;
  assert.equal(typeof composeMultiplier, 'function', 'one function composes the layers');
  const c = combat();
  c.equipMults.reload = 0.9; // the equipment's (and the ruleset's) value as the life began
  setModeMultiplier(c, 'juggernaut', 'reload', 0.5);
  setModeMultiplier(c, 'juggernaut', 'reload', 0.5);
  assert.equal(c.equipMults.reload, 0.9 * 0.5, 'a stamp set twice is set once');
  setModeMultiplier(c, 'hostile', 'reload', 2);
  assert.equal(c.equipMults.reload, 0.9 * 0.5 * 2, 'two sources multiply');
  const items = createConsumableState(ITEMS, consumableTiming, c);
  assert.equal(c.equipMults.reload, 0.9 * 0.5 * 2, 'making the consumables keeps the equipment and mode layers');
  assert.equal(items.base.reload, 0.9, 'the consumables\' base is the equipment layer');
  setModeMultiplier(c, 'hostile', 'reload', 1);
  assert.equal(composeMultiplier(c, 'reload'), 0.9 * 0.5, 'a source set back to 1 drops out');
}

// ---- round 2 U10: the equipment layer takes its writers' word in any order. applyRulesetToCombat folds the ruleset's
// reload into equipMults and applyEquipmentToCombat replaces equipMults whole; both know nothing of the layers, and the
// layers relied on the drivers running them first. Run after the layers exist, each was overwritten at the next item.
{
  const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} vs ${expected}`);
  const holder = { id: 'late', combat: combat() };
  holder.combat.equipMults.reload = 0.9;
  arm(holder); // the layers exist
  consumableRules.setModeMultiplier(holder.combat, 'juggernaut', 'reload', 0.5);
  const slow = { ...matchRulesetFor('standard'), reloadScale: 1.6 };
  applyRulesetToCombat(holder.combat, [], slow); // the ruleset's reload fold, after the layers
  near(holder.combat.equipMults.reload, 0.9 * 0.5 * 1.6, 'the fold lands');
  use(holder, 0, 1);
  near(holder.combat.equipMults.reload, 0.9 * 1.6 * 0.5 * RATIONS_RELOAD_MULT, 'the rations bend the folded reload');
  expire(holder, 1 + 41);
  near(holder.combat.equipMults.reload, 0.9 * 1.6 * 0.5, 'and the fold outlives them (it was lost to the old equipment value)');

  const kit = computeEquipMults(['rammer']).reload;
  assert.notEqual(kit, 1, 'the rammer bends the reload');
  const refit = { id: 'refit', combat: combat() };
  arm(refit);
  consumableRules.setModeMultiplier(refit.combat, 'juggernaut', 'reload', 0.5);
  applyEquipmentToCombat(refit.combat, ['rammer']); // a re-equip on the live state: a new equipMults object
  use(refit, 0, 1);
  near(refit.combat.equipMults.reload, kit * 0.5 * RATIONS_RELOAD_MULT, 'the next item composes the new equipment with the stamp');
  expire(refit, 1 + 41);
  near(refit.combat.equipMults.reload, kit * 0.5, 'the new equipment and the stamp both hold');
}

console.log('modeMultiplierLayers: the boss keeps x0.5 through an item\'s use and end; hostile and infection stamps both land; layers compose once');
