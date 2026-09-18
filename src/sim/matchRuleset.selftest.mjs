// Rulesets are the contract every mode plays by (owner 2026-09-14 evening): pin the values the
// sim reads, their determinism, the campaign difficulty fold, and the rule lines the cards show.
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from './matchModes.ts';
import {
  matchRulesetFor, rulesetLines, rulesetAmmoCapacity, rulesetReloadMultiplier, RULESET_SCORE_TARGETS,
  applyRulesetToCombat, rulesetLoadout, refillUnlimitedAmmunition, rulesetAllyCap,
  FLAG_CARRIER_SPEED_SCALE, HORDE_WAVE_REPAIR, TEAM_ARRANGEMENT_LIMITS, normalizeTeamArrangement,
  acceptsTeamArrangement, hordeWaveSize,
} from './matchRuleset.ts';

for (const mode of GAME_MODE_IDS) {
  const a = matchRulesetFor(mode), b = matchRulesetFor(mode);
  assert.deepEqual(a, b, `${mode}: the ruleset is a pure function of the mode`);
  assert.equal(a.mode, mode);
  assert.ok(Object.isFrozen(a), `${mode}: rulesets are immutable`);
  assert.ok(a.gravityScale > 0 && a.speedMultiplier > 0 && a.hpScale > 0 && a.damageScale > 0 && a.reloadScale > 0,
    `${mode}: every scale is positive`);
}

const standard = matchRulesetFor('standard');
assert.deepEqual(rulesetLines(standard), [], 'Standard is the baseline: no rule lines');
assert.equal(standard.timeLimitS, 900); assert.equal(standard.respawnS, null); assert.equal(standard.equipmentSlots, 3);

const turbo = matchRulesetFor('turbo_ball');
assert.equal(turbo.gravityScale, 0.6, 'Turbo Ball plays at 0.6 g');
assert.equal(turbo.speedMultiplier, 1.85);
assert.equal(turbo.ammo, 'unlimited'); assert.equal(turbo.equipmentSlots, 0); assert.equal(turbo.consumables, false);
assert.equal(turbo.criticalDamage, false, 'owner 2026-09-15: no consumables, so modules, crew and fires never break in Turbo Ball');
assert.equal(matchRulesetFor('standard').criticalDamage, true);
assert.equal(turbo.respawnS, 3); assert.equal(turbo.timeLimitS, 600);
assert.equal(rulesetReloadMultiplier(turbo), 0.7);
const turboKeys = rulesetLines(turbo).map((line) => line.key);
assert.equal(turbo.jumpMps, 9, 'owner 2026-09-16: the F key jumps in Turbo Ball');
assert.equal(turbo.recoilLaunchScale, 12, 'recoil launches the hull in Turbo Ball'); assert.equal(turbo.shellKnockScale, 2.5, 'impacts knock harder in Turbo Ball');
const standardPhysics = matchRulesetFor('standard');
assert.equal(standardPhysics.jumpMps, null); assert.equal(standardPhysics.recoilLaunchScale, 1); assert.equal(standardPhysics.shellKnockScale, 0.3, 'the whole game keeps the baseline impact knock');
assert.deepEqual(turboKeys, ['gravity', 'speed', 'hp', 'damage', 'reload', 'ammoUnlimited', 'noEquipment', 'noConsumables', 'noCriticalDamage', 'jump', 'recoilLaunch', 'shellKnock', 'respawn', 'clock'],
  'the Turbo Ball card lists exactly the rules the code applies, in order');
assert.equal(rulesetLines(turbo)[0].values.value, '0.6 g');
assert.equal(rulesetLines(turbo)[1].values.value, '+85 %');
assert.equal(rulesetLines(turbo)[4].values.value, '+43 %', 'reload shows as a rate gain');

const horde = matchRulesetFor('endless_horde');
assert.equal(horde.allies, 2, 'Horde fields the player with two allied bots (co-op humans join alpha)');
assert.equal(horde.enemies, 14, 'owner 2026-09-15: fourteen hostile identities in the pool');
assert.deepEqual(horde.horde, { waveSize: 5, waveStep: 1, surgeEvery: 3 }, 'five on the first wave, one more each wave, a surge every third');
assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((w) => hordeWaveSize(horde.horde, w)), [5, 6, 7, 9, 10, 11, 13], 'the wave law grows without a cap');
assert.equal(horde.timeLimitS, null); assert.equal(horde.respawnS, null); assert.equal(horde.hpScale, 1.25);
assert.deepEqual(rulesetLines(horde).map((line) => line.key), ['hp', 'noRespawn', 'noClock', 'allies', 'enemyPool', 'hordeWaves', 'waveRepair']);
assert.equal(rulesetLines(horde)[6].values.value, '30 %');
assert.deepEqual(rulesetLines(horde)[5].values, { value: '5', step: '1' });
assert.equal(HORDE_WAVE_REPAIR, 0.3);

// team arrangement (owner 2026-09-15): the co-op modes take the player's side arrangement, clamped
assert.ok(acceptsTeamArrangement('endless_horde') && acceptsTeamArrangement('frontline_assault') && !acceptsTeamArrangement('standard'));
assert.equal(normalizeTeamArrangement('standard', { allies: 1 }), null, 'only the co-op modes arrange their sides');
assert.equal(normalizeTeamArrangement('endless_horde', null), null); assert.equal(normalizeTeamArrangement('endless_horde', {}), null);
assert.deepEqual(normalizeTeamArrangement('endless_horde', { allies: 9, enemies: 3, waveSize: 40, enemyNation: 'germany' }),
  { allies: TEAM_ARRANGEMENT_LIMITS.allies[1], enemies: TEAM_ARRANGEMENT_LIMITS.enemies.endless_horde[0], waveSize: TEAM_ARRANGEMENT_LIMITS.waveSize[1], enemyNation: 'germany' },
  'every field clamps to the published limits');
assert.equal(normalizeTeamArrangement('frontline_assault', { waveSize: 8 }), null, 'the wave size is a Horde setting');
assert.equal(normalizeTeamArrangement('endless_horde', { enemyNation: 'not a nation!' }), null, 'a malformed nation id is dropped');
const arrangedHorde = matchRulesetFor('endless_horde', null, { allies: 0, enemies: 18, waveSize: 8, enemyNation: 'russia' });
assert.equal(arrangedHorde.allies, 0); assert.equal(arrangedHorde.enemies, 18); assert.equal(arrangedHorde.horde.waveSize, 8);
assert.equal(arrangedHorde.enemyNation, 'russia');
assert.ok(Object.isFrozen(arrangedHorde) && Object.isFrozen(arrangedHorde.horde));
assert.deepEqual(rulesetLines(arrangedHorde).map((line) => line.key), ['hp', 'noRespawn', 'noClock', 'noAllies', 'enemyPool', 'enemyNation', 'hordeWaves', 'waveRepair']);
assert.equal(matchRulesetFor('endless_horde', null, { waveSize: 12, enemies: 6 }).horde.waveSize, 6, 'the first wave never exceeds the pool');
assert.equal(matchRulesetFor('endless_horde', null, {}), horde, 'an empty arrangement is the base ruleset');
assert.equal(matchRulesetFor('standard', null, { allies: 0 }), standard, 'Standard ignores arrangements');

const ctf = matchRulesetFor('capture_the_flag');
assert.equal(ctf.respawnS, 6); assert.equal(RULESET_SCORE_TARGETS.capture_the_flag, 3);
assert.deepEqual(rulesetLines(ctf).map((line) => line.key), ['respawn', 'carrierSpeed']);
assert.equal(rulesetLines(ctf)[1].values.value, '-15 %'); assert.equal(FLAG_CARRIER_SPEED_SCALE, 0.85);
assert.equal(RULESET_SCORE_TARGETS.zone_control, 750, 'zone target resolves inside the clock');

const assault = matchRulesetFor('frontline_assault');
assert.equal(assault.timeout, 'defeat', 'an expired assault clock loses the operation');
assert.equal(assault.timeLimitS, 720); assert.equal(assault.allies, 3); assert.equal(assault.respawnS, null);
assert.equal(assault.enemies, 10, 'ten defenders in the formation pool'); assert.equal(assault.enemyNation, null, 'a free sortie names no nation unless arranged');
assert.deepEqual(assault.assault, { initialActive: 3, extraDefenders: 0, hpPerLine: 0.16, difficultyHp: 0, holdS: 20 });
const op4 = matchRulesetFor('frontline_assault', { difficulty: 4, enemy: 'russia' });
assert.equal(op4.assault.extraDefenders, 1, 'operation 4 fields one extra defender per sector');
assert.equal(op4.enemyNation, 'russia', 'the operation names the formation');
assert.equal(matchRulesetFor('frontline_assault', { difficulty: 4, enemy: 'russia' }, { enemyNation: 'germany', allies: 1 }).enemyNation, 'russia',
  'a free-sortie nation setting never overrides the operation\'s formation');
assert.equal(matchRulesetFor('frontline_assault', { difficulty: 4, enemy: 'russia' }, { enemyNation: 'germany', allies: 1 }).allies, 1,
  'but the ally count is the player\'s');
assert.equal(matchRulesetFor('frontline_assault', null, { enemyNation: 'china' }).enemyNation, 'china', 'a free sortie takes the nation setting');
assert.ok(Math.abs(op4.assault.difficultyHp - 0.18) < 1e-9, 'operation 4 defenders carry +18 % hull');
const op4Short = matchRulesetFor('frontline_assault', { difficulty: 4, timeLimitS: 600 });
assert.equal(op4Short.timeLimitS, 600, 'an operation may shorten the clock');
assert.equal(matchRulesetFor('standard', { difficulty: 4 }), standard, 'difficulty only folds into Frontline Assault');
assert.ok(rulesetLines(op4).some((line) => line.key === 'assaultWaves' && line.values.value === '4' && line.values.hp === '+18 %'));
assert.ok(rulesetLines(assault).some((line) => line.key === 'clockDefeat' && line.values.value === '12'));

assert.equal(rulesetAmmoCapacity(turbo, 'AP', 24), 24, 'unlimited keeps the loadout shape (the sim refills it)');
const heOnly = { ...turbo, ammo: 'he_only' };
assert.equal(rulesetAmmoCapacity(heOnly, 'AP', 24), 0); assert.equal(rulesetAmmoCapacity(heOnly, 'HE', 12), 12);
assert.equal(rulesetAmmoCapacity(heOnly, 'HE', 0), 1, 'HE-only always leaves at least one HE round');

// spawn stamps: what setupBattle / the authority / the revive hooks apply to a fresh combat state
{
  const shells = [{ type: 'APFSDS' }, { type: 'HE' }];
  const combat = { hp: 2000, maxHp: 2000, ammo: [30, 10], ammoCapacity: [30, 10], equipMults: { reload: 0.9 } };
  applyRulesetToCombat(combat, shells, turbo);
  assert.equal(combat.maxHp, 3000); assert.equal(combat.hp, 3000);
  assert.equal(combat.modeDamageTakenScale, 0.5);
  assert.ok(Math.abs(combat.equipMults.reload - 0.63) < 1e-9, 'the reload scale folds into the equipment multiplier');
  assert.deepEqual(combat.ammoCapacity, [30, 10], 'unlimited keeps the loadout shape');
  combat.ammo[0] = 29;
  refillUnlimitedAmmunition(turbo, combat, 0);
  assert.equal(combat.ammo[0], 30, 'a fired channel refills under unlimited ammunition');
  refillUnlimitedAmmunition(standard, combat, 1); combat.ammo[1] = 9; refillUnlimitedAmmunition(standard, combat, 1);
  assert.equal(combat.ammo[1], 9, 'Standard never refills');
}
{
  const combat = { hp: 1000, maxHp: 1000, ammo: [20, 12], ammoCapacity: [20, 12] };
  applyRulesetToCombat(combat, [{ type: 'AP' }, { type: 'HE' }], matchRulesetFor('endless_horde'), 1.32);
  assert.equal(combat.maxHp, 1650, 'the wave health scale multiplies the ruleset hull scale (1.25 × 1.32)');
  assert.equal(combat.modeDamageTakenScale, 1);
  assert.equal(combat.equipMults, undefined, 'a unit reload scale leaves the multipliers alone');
  const only = { hp: 1000, maxHp: 1000, ammo: [20, 12], ammoCapacity: [20, 12] };
  applyRulesetToCombat(only, [{ type: 'AP' }, { type: 'HE' }], heOnly);
  assert.deepEqual(only.ammoCapacity, [0, 12]); assert.deepEqual(only.ammo, [0, 12]);
  const none = { hp: 1000, maxHp: 1000, ammo: [20], ammoCapacity: [20] };
  applyRulesetToCombat(none, [{ type: 'AP' }], heOnly);
  assert.deepEqual(none.ammo, [20], 'a vehicle without HE keeps its own rounds rather than sortieing empty');
}
assert.deepEqual(rulesetLoadout(turbo, ['a', 'b', 'c']), [], 'Turbo Ball honours no equipment');
assert.deepEqual(rulesetLoadout(standard, ['a', 'b', 'c']), ['a', 'b', 'c']);
assert.deepEqual(rulesetLoadout({ ...standard, equipmentSlots: 1 }, ['a', 'b', 'c']), ['a']);
assert.deepEqual(rulesetLoadout(standard, null), []);
assert.equal(rulesetAllyCap(standard, 6), 6); assert.equal(rulesetAllyCap(horde, 6), 2); assert.equal(rulesetAllyCap(assault, 6), 3);

console.log('matchRuleset: per-mode values, determinism, campaign difficulty fold, team arrangement clamps, horde wave law, rule-card lines, spawn stamps and ammo/reload helpers verified');
