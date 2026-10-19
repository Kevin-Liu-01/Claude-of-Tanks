// Rulesets are the contract every mode plays by (owner 2026-09-14 evening): pin the values the
// sim reads, their determinism, the campaign difficulty fold, and the rule lines the cards show.
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from './matchModes.ts';
import {
  matchRulesetFor, rulesetLines, rulesetAmmoCapacity, rulesetReloadMultiplier, RULESET_SCORE_TARGETS,
  applyRulesetToCombat, rulesetLoadout, refillUnlimitedAmmunition, rulesetAllyCap,
  FLAG_CARRIER_SPEED_SCALE, HORDE_WAVE_REPAIR, TEAM_ARRANGEMENT_LIMITS, normalizeTeamArrangement,
  acceptsTeamArrangement, hordeWaveSize, hordeHostileHull, hordeWaveHealthScale, hordeWaveSpeedScale, cacheHealChance, rulesetBotDifficulty,
  hordeWaveTotal, hordeMaxAlive, hordeWaveSpecial, TEAM_NATIONS_IDS, DEFAULT_TEAM_NATIONS, TEAM_NATIONS_MODE_SCOPE,
  assaultWaveHealthScale, BATTLE_FIELD_LIMIT, SIDES_PRESETS, STANDARD_SIDES, isWaveMode, rulesetSides, sidesPresetOf,
  MARS_CACHE_IDS, MARS_DEFAULT_RULES, MARS_GRAVITY_IDS, ENDING_HOLD_LIMIT_S, endingHoldExpired, STANDARD_PHYSICS, rulesetPhysicsAt,
  AERIAL_RULES,
} from './matchRuleset.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';

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

// owner 2026-09-21: the battle report reads this split — deaths are a stat and `dead` the state at the end
// only where the ruleset revives
assert.deepEqual(GAME_MODE_IDS.filter((mode) => matchRulesetFor(mode).respawnS != null).sort(),
  ['capture_the_flag', 'drone', 'gun_game', 'infected', 'juggernaut', 'mars', 'turbo_ball', 'zone_control'], 'exactly the respawning modes revive');

const turbo = matchRulesetFor('turbo_ball');
assert.equal(turbo.gravityScale, 0.6, 'Turbo Ball plays at 0.6 g');
assert.equal(turbo.speedMultiplier, 1.85);
assert.equal(turbo.ammo, 'unlimited'); assert.equal(turbo.equipmentSlots, 0); assert.equal(turbo.consumables, false);
assert.equal(turbo.criticalDamage, false, 'owner 2026-09-15: no consumables, so modules, crew and fires never break in Turbo Ball');
assert.equal(matchRulesetFor('standard').criticalDamage, true);
assert.equal(turbo.respawnS, 3); assert.equal(turbo.timeLimitS, 600);
assert.equal(rulesetReloadMultiplier(turbo), 0.7);
const turboKeys = rulesetLines(turbo).map((line) => line.key);
assert.equal(turbo.jumpMps, 13, 'owner 2026-09-16: the F key jumps in Turbo Ball (round 30: a rocket boost, 9 -> 13)');
assert.equal(turbo.recoilLaunchScale, 12, 'recoil launches the hull in Turbo Ball'); assert.equal(turbo.shellKnockScale, 2.5, 'impacts knock harder in Turbo Ball');
const standardPhysics = matchRulesetFor('standard');
assert.equal(standardPhysics.jumpMps, null); assert.equal(standardPhysics.recoilLaunchScale, 1); assert.equal(standardPhysics.shellKnockScale, 0.3, 'the whole game keeps the baseline impact knock');
assert.deepEqual(turboKeys, ['gravity', 'speed', 'hp', 'damage', 'reload', 'ammoUnlimited', 'noEquipment', 'noConsumables', 'noCriticalDamage', 'jump', 'recoilLaunch', 'shellKnock', 'bounce', 'fallDamage', 'respawn', 'clock'],
  'the Turbo Ball card lists exactly the rules the code applies, in order (impact physics 2026-09-25: the rebound and the fall threshold)');
assert.equal(rulesetLines(turbo)[0].values.value, '0.6 g');
assert.equal(rulesetLines(turbo)[1].values.value, '+85 %');
assert.equal(rulesetLines(turbo)[4].values.value, '+43 %', 'reload shows as a rate gain');

// the zombies (owner 2026-10-17: "all the zombies actually have low hp"): the humans' hull doubled, the hostiles fodder at
// 15 % of their own, one difficulty tier down; gameplay-modes-228 (owner 2026-10-18: "more enemies per round"): a wave
// TOTAL that rises every round with no cap, at most sixteen on the field at once from the twenty-strong pool
const horde = matchRulesetFor('endless_horde');
assert.equal(horde.allies, 4, 'Horde fields the player with four allied bots (co-op humans join alpha)');
assert.equal(horde.enemies, 20, 'a twenty-strong pool of hostile identities');
{
  const h = horde.horde;
  assert.deepEqual([h.waveSize, h.waveStep, h.waveCurve, h.perHumanTotal], [6, 3, 0.35, 0.25], 'the wave-total law');
  assert.deepEqual([h.maxAlive, h.maxAlivePerHuman, h.maxAliveCap, h.trickleS, h.recycleAfterS], [16, 1, 20, 1.5, 6], 'the field and the trickle');
  assert.deepEqual([...h.spawnRingM], [260, 380]); assert.equal(h.spawnSectors, 3); assert.equal(h.spawnMinHumanM, 150); assert.equal(h.spawnOutOfSight, true);
  assert.deepEqual([h.intermissionS, h.waveRepair, h.hostileHpScale, h.hpPerWave, h.hpPerWaveLate, h.lateFromWave], [8, 0.3, 0.15, 0.02, 0.06, 11]);
  assert.deepEqual([h.runnerEvery, h.runnerSpeed, h.swarmEvery, h.swarmTotalScale, h.swarmHull], [4, 1.25, 5, 1.4, 0.10], 'runner and swarm waves');
  assert.deepEqual([h.hostileDifficultyStep, h.hunt, h.allyLeashM], [1, 'spotted', 120]);
  assert.ok(h.hostileReloadScale >= 1, 'a zombie never reloads faster than its gun');
}
// the base law: 6, 9, 13, 18, 24, 30, 37, 44, 52, 61 — strictly rising, no cap (the pool caps only what stands at once)
const baseLaw = Array.from({ length: 12 }, (_, i) => hordeWaveSize(horde.horde, i + 1));
assert.deepEqual(baseLaw.slice(0, 10), [6, 9, 13, 18, 24, 30, 37, 44, 52, 61], 'the wave law: round(6 + 3(w-1) + 0.35(w-1)^2)');
for (let i = 1; i < baseLaw.length; i++) assert.ok(baseLaw[i] > baseLaw[i - 1], 'the base law rises every round');
assert.equal(hordeWaveSpecial(horde.horde, 4), 'runner'); assert.equal(hordeWaveSpecial(horde.horde, 5), 'swarm');
assert.equal(hordeWaveSpecial(horde.horde, 20), 'swarm', 'a swarm wins when both fall due'); assert.equal(hordeWaveSpecial(horde.horde, 3), null);
assert.equal(hordeWaveTotal(horde.horde, 3, 1), 13); assert.equal(hordeWaveTotal(horde.horde, 5, 1), Math.round(24 * 1.4), 'a swarm brings 1.4x');
assert.equal(hordeWaveTotal(horde.horde, 3, 3), Math.round(13 * 1.5), 'each extra human adds a quarter');
assert.equal(hordeMaxAlive(horde.horde, 1, 20), 16); assert.equal(hordeMaxAlive(horde.horde, 3, 20), 18); assert.equal(hordeMaxAlive(horde.horde, 9, 20), 20, 'never over the cap');
assert.equal(hordeMaxAlive(horde.horde, 1, 6), 6, 'never over the pool');
assert.equal(horde.timeLimitS, null); assert.equal(horde.respawnS, null); assert.equal(horde.hpScale, 2, 'the humans\' hull');
assert.equal(horde.ammo, 'unlimited');
assert.deepEqual(rulesetLines(horde).map((line) => line.key), ['hp', 'ammoUnlimited', 'noRespawn', 'noClock', 'allies', 'enemyPool', 'teamsMono', 'hordeWaves', 'hordeField', 'waveRepair']);
assert.equal(rulesetLines(horde)[0].values.value, '+100 % / -85 %', 'one hull chip: the humans\' hull, then the zombies\' after a slash');
assert.equal(rulesetLines(horde)[9].values.value, '30 %');
assert.deepEqual(rulesetLines(horde)[7].values, { value: '6', step: '3' });
assert.deepEqual(rulesetLines(horde)[8].values, { value: '16', lull: '8' });
assert.equal(HORDE_WAVE_REPAIR, 0.3);
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(hordeHostileHull(horde.horde, 1), 0.15) && near(hordeHostileHull(horde.horde, 9), 0.174), 'a hostile is 15 % of its hull on wave 1, 17.4 % on wave 9');
  assert.ok(near(hordeHostileHull(horde.horde, 14), 0.15 * 1.42) && hordeHostileHull(horde.horde, 14) <= 0.23, 'the late curve (+6 % a wave from 11): still fodder');
  assert.ok(near(hordeHostileHull(horde.horde, 5), 0.10) && near(hordeHostileHull(horde.horde, 15), 0.10), 'a swarm wave arrives at a tenth of its hull');
  assert.ok(near(hordeWaveHealthScale(horde, horde.horde, 1) * horde.hpScale, 0.15), 'the revive scale times the ruleset stamp lands on the fodder hull');
  assert.ok(near(hordeWaveSpeedScale(horde.horde, 1), 1) && near(hordeWaveSpeedScale(horde.horde, 5), 1.18) && near(hordeWaveSpeedScale(horde.horde, 41), 1.55),
    'the wave speed ramp: +4.5 % a wave, capped at +55 %');
  assert.ok(near(hordeWaveSpeedScale(horde.horde, 4), 1.135 * 1.25), 'runners run: the ramp times runnerSpeed');
  assert.equal(cacheHealChance(horde, 1), 1, 'unlimited rounds: every Horde cache is a repair');
  const spec = { ...horde, ammo: 'spec' };
  assert.ok(near(cacheHealChance(spec, 1), 0.62) && near(cacheHealChance(spec, 3), 0.51) && near(cacheHealChance(spec, 40), 0.08), 'the spec-rounds cache law');
  assert.equal(cacheHealChance(matchRulesetFor('mars'), 1), 1); assert.equal(cacheHealChance({ ...matchRulesetFor('mars'), ammo: 'spec' }, 1), 0.5);
  assert.equal(rulesetBotDifficulty(horde, 'bravo', 'normal'), 'easy', 'a Horde zombie plays one tier below the battle');
  assert.equal(rulesetBotDifficulty(horde, 'enemy', 'hard'), 'normal'); assert.equal(rulesetBotDifficulty(horde, 'enemy', 'easy'), 'easy', 'never under the easiest');
  assert.equal(rulesetBotDifficulty(horde, 'alpha', 'normal'), 'normal'); assert.equal(rulesetBotDifficulty(horde, 'player', 'hard'), 'hard', 'the human side keeps its tier');
  for (const mode of GAME_MODE_IDS) if (mode !== 'endless_horde') assert.equal(rulesetBotDifficulty(matchRulesetFor(mode), 'bravo', 'hard'), 'hard', `${mode}: bots keep the battle's tier`);
}

// team arrangement (owner 2026-09-15): the co-op modes take the player's side arrangement, clamped
// sides (owner 2026-09-18): every registered mode arranges its two sides under one field limit
assert.ok(GAME_MODE_IDS.every((mode) => acceptsTeamArrangement(mode)), 'every registered mode arranges its sides');
assert.ok(isWaveMode('endless_horde') && isWaveMode('frontline_assault') && !isWaveMode('standard') && !isWaveMode('turbo_ball'));
assert.equal(TEAM_ARRANGEMENT_LIMITS.field, BATTLE_FIELD_LIMIT);
assert.ok(BATTLE_FIELD_LIMIT >= 28, 'the field limit holds the 14 v 14 preset');
assert.deepEqual(SIDES_PRESETS['7v7'], STANDARD_SIDES); assert.deepEqual(STANDARD_SIDES, { allies: 6, enemies: 7 });
assert.deepEqual(SIDES_PRESETS['14v14'], { allies: 13, enemies: 14 }, 'the player counts on the allied side');
assert.deepEqual(normalizeTeamArrangement('standard', { allies: 1 }), { allies: 1, enemies: null, waveSize: null, enemyNation: null },
  'Standard arranges its sides (owner 2026-09-18)');
assert.equal(normalizeTeamArrangement('endless_horde', null), null); assert.equal(normalizeTeamArrangement('endless_horde', {}), null);
assert.deepEqual(normalizeTeamArrangement('endless_horde', { allies: 9, enemies: 3, waveSize: 40, enemyNation: 'germany' }),
  { allies: TEAM_ARRANGEMENT_LIMITS.allies.endless_horde[1], enemies: TEAM_ARRANGEMENT_LIMITS.enemies.endless_horde[0], waveSize: TEAM_ARRANGEMENT_LIMITS.waveSize[1], enemyNation: 'germany' },
  'every field clamps to the published limits');
assert.equal(TEAM_ARRANGEMENT_LIMITS.allies.endless_horde[1], 6, 'the wave modes keep the co-op allied-bot cap');
assert.deepEqual([...TEAM_ARRANGEMENT_LIMITS.enemies.frontline_assault], [4, 14]);
assert.equal(normalizeTeamArrangement('frontline_assault', { waveSize: 8 }), null, 'the wave size is a Horde setting');
assert.equal(normalizeTeamArrangement('endless_horde', { enemyNation: 'not a nation!' }), null, 'a malformed nation id is dropped');
const arrangedHorde = matchRulesetFor('endless_horde', null, { allies: 0, enemies: 18, waveSize: 8, enemyNation: 'russia' });
assert.equal(arrangedHorde.allies, 0); assert.equal(arrangedHorde.enemies, 18); assert.equal(arrangedHorde.horde.waveSize, 8);
assert.equal(arrangedHorde.enemyNation, 'russia');
assert.ok(Object.isFrozen(arrangedHorde) && Object.isFrozen(arrangedHorde.horde));
assert.deepEqual(rulesetLines(arrangedHorde).map((line) => line.key), ['hp', 'ammoUnlimited', 'noRespawn', 'noClock', 'noAllies', 'enemyPool', 'teamsMono', 'enemyNation', 'hordeWaves', 'hordeField', 'waveRepair']);
assert.equal(arrangedHorde.horde.hostileHpScale, 0.15, 'an arranged wave keeps the fodder law');
assert.equal(matchRulesetFor('endless_horde', null, { waveSize: 12, enemies: 6 }).horde.waveSize, 12,
  'the first wave may exceed the pool: the pool caps only what stands on the field at once (hordeMaxAlive)');
assert.equal(matchRulesetFor('endless_horde', null, {}), horde, 'an empty arrangement is the base ruleset');
assert.equal(matchRulesetFor('standard', null, { allies: 0 }).allies, 0, 'Standard takes the arrangement (owner 2026-09-18)');
// sides: presets, custom counts, the field limit and the card line
const fourteen = matchRulesetFor('standard', null, SIDES_PRESETS['14v14']);
assert.equal(fourteen.allies, 13); assert.equal(fourteen.enemies, 14);
assert.deepEqual(rulesetLines(fourteen), [{ key: 'sides', values: { allies: '14', enemies: '14' } }], 'the card reads 14 v 14');
assert.deepEqual(rulesetLines(matchRulesetFor('standard', null, { allies: 0, enemies: 20 })), [{ key: 'sides', values: { allies: '1', enemies: '20' } }], 'a lone player reads 1 v 20');
assert.deepEqual(rulesetLines(matchRulesetFor('standard', null, { allies: 6, enemies: 7 })), [], 'an explicit 7 v 7 is the baseline');
assert.deepEqual(rulesetSides(matchRulesetFor('standard')), { allies: 6, enemies: 7 });
assert.equal(sidesPresetOf(null), '7v7'); assert.equal(sidesPresetOf({ allies: 13, enemies: 14 }), '14v14'); assert.equal(sidesPresetOf({ allies: 0, enemies: 20 }), 'custom');
const capped = normalizeTeamArrangement('turbo_ball', { allies: 40, enemies: 41 });
assert.equal(capped.enemies, BATTLE_FIELD_LIMIT - 1, 'the enemy count is kept up to the field limit');
assert.equal(capped.allies, 0, 'the allied bots yield to the field limit');
assert.equal(normalizeTeamArrangement('standard', { enemies: BATTLE_FIELD_LIMIT - 1 }).allies, 0, 'an enemy count alone makes the default allies yield');
assert.equal(normalizeTeamArrangement('standard', { allies: 40 }).allies, BATTLE_FIELD_LIMIT - 1 - STANDARD_SIDES.enemies, 'allied bots alone yield to the default hostiles');
assert.equal(normalizeTeamArrangement('standard', { enemies: 99 }).enemies, BATTLE_FIELD_LIMIT - 1); assert.equal(normalizeTeamArrangement('standard', { enemies: 0 }).enemies, 1, 'at least one hostile');
for (const mode of ['capture_the_flag', 'zone_control', 'turbo_ball']) {
  const wide = matchRulesetFor(mode, null, SIDES_PRESETS['14v14']);
  assert.equal(wide.allies, 13); assert.equal(wide.enemies, 14);
  assert.ok(rulesetLines(wide).some((line) => line.key === 'sides'), `${mode}: the card shows the sides`);
}
assert.equal(matchRulesetFor('endless_horde', null, { allies: 13, enemies: 14 }).allies, 6, 'Horde clamps allied bots to its own cap');

const ctf = matchRulesetFor('capture_the_flag');
assert.equal(ctf.respawnS, 6); assert.equal(RULESET_SCORE_TARGETS.capture_the_flag, 3);
assert.deepEqual({ ...ctf.flagBots }, { recoverShare: 0.5, recoverMin: 2, huntWhenHomeFlagTaken: true, escorts: 3, escortAheadM: 24,
  escortSideM: 22, defendShare: 0.15, defendMinSquad: 6, interceptLeadS: 2.5 }, 'the flag bots run the flags (gameplay-modes-228)');
{
  const ball = matchRulesetFor('turbo_ball');
  assert.deepEqual([ball.ballBots.strikers, ball.ballBots.strikerHoldS, ball.ballBots.swapM, ball.ballBots.leadMaxS, ball.ballBots.screens,
    ball.ballBots.screenNear, ball.ballBots.screenFar, ball.ballBots.keepers, ball.ballBots.keeperM, ball.ballBots.crowdCap, ball.ballBots.crowdM],
  [2, 3, 25, 3, 2, 0.85, 0.6, 1, 30, 3, 30], 'two strikers on the intercept, two screens, a keeper, at most three on the ball');
  assert.deepEqual({ ...ball.ballBots.shootBall }, { maxRangeM: 120, coneDeg: 25 });
  assert.equal(ball.ball.idleResetS, 30);
}
// TEAM NATIONS (gameplay-modes-228): MONO-NATION by default, RANDOM the one stored value; every mode has a scope row
assert.deepEqual([...TEAM_NATIONS_IDS], ['mono', 'random']); assert.equal(DEFAULT_TEAM_NATIONS, 'mono');
for (const mode of GAME_MODE_IDS) {
  assert.equal(matchRulesetFor(mode).teamNations, 'mono', `${mode}: MONO-NATION is the default`);
  assert.ok(TEAM_NATIONS_MODE_SCOPE[mode], `${mode}: a TEAM NATIONS scope row`);
  assert.equal(matchRulesetFor(mode, null, { teamNations: 'random' }).teamNations, 'random', `${mode}: RANDOM is arranged`);
}
assert.deepEqual(normalizeTeamArrangement('standard', { teamNations: 'random' }), { allies: null, enemies: null, waveSize: null, enemyNation: null, teamNations: 'random' });
assert.equal(normalizeTeamArrangement('standard', { teamNations: 'mono' }), null, 'mono is the absent default');
assert.equal(normalizeTeamArrangement('standard', { alliedNation: 'player' }), null, 'the retired alliedNation reads as MONO and is dropped');
assert.deepEqual(rulesetLines(matchRulesetFor('standard', null, { teamNations: 'random' })), [{ key: 'teamsRandom', values: {} }], 'RANDOM shows on the card');
assert.deepEqual(rulesetLines(ctf).map((line) => line.key), ['respawn', 'carrierSpeed']);
assert.equal(rulesetLines(ctf)[1].values.value, '-15 %'); assert.equal(FLAG_CARRIER_SPEED_SCALE, 0.85);
assert.equal(RULESET_SCORE_TARGETS.zone_control, 750, 'zone target resolves inside the clock');

const assault = matchRulesetFor('frontline_assault');
assert.equal(assault.timeout, 'defeat', 'an expired assault clock loses the operation');
assert.equal(assault.timeLimitS, 720); assert.equal(assault.allies, 3); assert.equal(assault.respawnS, null);
assert.equal(assault.enemies, 12, 'twelve defenders in the formation pool'); assert.equal(assault.enemyNation, null, 'a free sortie names no nation unless arranged');
assert.deepEqual({ ...assault.assault, lineBandM: [...assault.assault.lineBandM], counterAttack: { ...assault.assault.counterAttack } }, {
  initialActive: 4, extraDefenders: 0, hpPerLine: 0.16, finalLineHp: 1.15, difficultyHp: 0, holdS: 20,
  defendersStartOnLine: true, lineBandM: [30, 70], counterAttack: { squad: 2, afterCaptureS: 8, forS: 40 },
  reinforceTrickleS: 30, reinforceExtra: 2, reinforceRearM: 140, regroupMaxS: 25, regroupRadiusM: 80, regroupHumanM: 250, allyReviveS: null,
}, 'gameplay-modes-228: every sector fought for — defenders on the line, a counter-attack, a trickle, a 25 s regroup');
assert.deepEqual({ ...assault.assaultBots }, { pushAfterS: 15, pushMinGroup: 2, pushGroupM: 80, stageM: 20, flankShare: 0.4, flankOffsetM: 60, flankConvergeM: 80 });
// Frontline's last line (modes lane 2026-10-08, owner decision: attackers win 40-55 % of bot tests): the third sector's
// counter-attack arrives at 1.15x instead of the ramp's 1.32x; the first two sectors keep 1 + sectors taken x 0.16.
const near = (a, b) => Math.abs(a - b) < 1e-9;
assert.ok(near(assaultWaveHealthScale(assault.assault, 0, 3), 1), 'the opening wave arrives at full hull');
assert.ok(near(assaultWaveHealthScale(assault.assault, 1, 3), 1.16), 'the second sector keeps the ramp');
assert.ok(near(assaultWaveHealthScale(assault.assault, 2, 3), 1.15), 'the last sector takes finalLineHp, not 1.32');
assert.ok(near(assaultWaveHealthScale(assault.assault, 0, 1), 1), 'a one-sector front opens at full hull');
const op4 = matchRulesetFor('frontline_assault', { difficulty: 4, enemy: 'russia' });
assert.equal(op4.assault.extraDefenders, 1, 'operation 4 fields one extra defender per sector');
assert.equal(op4.enemyNation, 'russia', 'the operation names the formation');
assert.equal(matchRulesetFor('frontline_assault', { difficulty: 4, enemy: 'russia' }, { enemyNation: 'germany', allies: 1 }).enemyNation, 'russia',
  'a free-sortie nation setting never overrides the operation\'s formation');
assert.equal(matchRulesetFor('frontline_assault', { difficulty: 4, enemy: 'russia' }, { enemyNation: 'germany', allies: 1 }).allies, 1,
  'but the ally count is the player\'s');
assert.equal(matchRulesetFor('frontline_assault', null, { enemyNation: 'china' }).enemyNation, 'china', 'a free sortie takes the nation setting');
assert.ok(Math.abs(op4.assault.difficultyHp - 0.18) < 1e-9, 'operation 4 defenders carry +18 % hull');
assert.ok(near(assaultWaveHealthScale(op4.assault, 2, 3), 1.33), 'the operation\'s difficulty adds to the last line too');
const op4Short = matchRulesetFor('frontline_assault', { difficulty: 4, timeLimitS: 600 });
assert.equal(op4Short.timeLimitS, 600, 'an operation may shorten the clock');
assert.equal(matchRulesetFor('standard', { difficulty: 4 }), standard, 'difficulty only folds into Frontline Assault');
assert.ok(rulesetLines(op4).some((line) => line.key === 'assaultWaves' && line.values.value === '5' && line.values.hp === '+18 %'));
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
  assert.equal(combat.maxHp, 2640, 'the wave health scale multiplies the ruleset hull scale (2 × 1.32)');
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
assert.equal(rulesetAllyCap(standard, 6), 6); assert.equal(rulesetAllyCap(horde, 6), 4); assert.equal(rulesetAllyCap(assault, 6), 3);

// Mars settings (owner 2026-09-18 "boosts and settings"): the gravity world and the boost-cache cadence ride the
// mars arrangement; other modes drop them, unknown ids drop, a gravity-only choice keeps the default caches
{
  const mars = matchRulesetFor('mars');
  assert.deepEqual(mars.mars, { gravity: 'mars', caches: 'standard', cacheFirstS: 12, cacheIntervalS: 22 }, 'the Mars base ruleset carries its settings');
  assert.equal(mars.mars, MARS_DEFAULT_RULES);
  assert.deepEqual(MARS_GRAVITY_IDS, ['mars', 'moon', 'earth']);
  assert.deepEqual(MARS_CACHE_IDS, ['off', 'standard', 'frequent']);
  assert.equal(normalizeTeamArrangement('standard', { marsGravity: 'moon', marsCaches: 'off' }), null, 'Mars settings belong to the mars mode only');
  assert.deepEqual(normalizeTeamArrangement('mars', { marsGravity: 'moon', marsCaches: 'bogus' }),
    { allies: null, enemies: null, waveSize: null, enemyNation: null, marsGravity: 'moon' }, 'unknown Mars ids drop');
  assert.deepEqual(normalizeTeamArrangement('mars', { allies: 3 }), { allies: 3, enemies: null, waveSize: null, enemyNation: null }, 'a sides-only mars arrangement carries no Mars keys');
  const moon = matchRulesetFor('mars', null, { marsGravity: 'moon', marsCaches: 'off' });
  assert.equal(moon.gravityScale, 0.17); assert.equal(moon.jumpMps, 12.5); assert.equal(moon.recoilLaunchScale, 4.5);
  assert.deepEqual(moon.mars, { gravity: 'moon', caches: 'off', cacheFirstS: 0, cacheIntervalS: 0 });
  assert.ok(Object.isFrozen(moon) && Object.isFrozen(moon.mars));
  const moonKeys = rulesetLines(moon).map((line) => line.key);
  assert.ok(moonKeys.includes('marsCachesOff') && !moonKeys.includes('marsCaches'), 'no caches reads as its own line');
  assert.deepEqual(rulesetLines(mars).find((line) => line.key === 'marsCaches')?.values, { value: '22' });
  const earth = matchRulesetFor('mars', null, { marsGravity: 'earth' });
  assert.equal(earth.gravityScale, 1); assert.equal(earth.jumpMps, 6);
  assert.equal(earth.physics.restitution, STANDARD_PHYSICS.restitution, 'Earth gravity lands with the whole game\'s bounce');
  assert.equal(moon.physics.restitution, mars.physics.restitution, 'the Moon keeps the basin\'s bounce');
  assert.ok(Object.isFrozen(earth.physics));
  // the client's prediction knows the mode and the gravity the authority sends, not the Mars settings (round 4)
  assert.deepEqual(rulesetPhysicsAt('mars', 1), earth.physics, 'the prediction lands a 1 g basin hull as the authority does');
  assert.equal(rulesetPhysicsAt('mars', 0.38), mars.physics);
  assert.equal(rulesetPhysicsAt('mars', 0.17), moon.physics);
  assert.equal(rulesetPhysicsAt('standard', 1), STANDARD_PHYSICS);
  assert.equal(earth.mars.caches, 'standard', 'a gravity-only arrangement keeps the default caches');
  assert.equal(matchRulesetFor('mars', null, { allies: 3 }).mars, MARS_DEFAULT_RULES, 'a sides-only arrangement keeps the base Mars rules');
  assert.equal(matchRulesetFor('standard', null, { marsGravity: 'moon' }).gravityScale, 1, 'Standard ignores Mars settings');
}

// battle endings (owner 2026-09-25): every mode declares the post-verdict hold the solo step and the authority
// read — bounded, positive, and the same rule for both simulations
{
  for (const mode of GAME_MODE_IDS) {
    const hold = matchRulesetFor(mode).endingHoldS;
    assert.ok(Number.isFinite(hold) && hold > 0 && hold <= ENDING_HOLD_LIMIT_S, `${mode}: a bounded positive ending hold (${hold})`);
    assert.equal(hold, 8, `${mode}: the whole-game hold covers the 2.5 s beats and the killcam wreck hold`);
  }
  assert.equal(ENDING_HOLD_LIMIT_S, 12, 'the hold ceiling stays under the report gate watchdog (16 s)');
  assert.equal(endingHoldExpired(standard, null, 500), false, 'no verdict yet: the hold never expires');
  assert.equal(endingHoldExpired(standard, 100, 100), false, 'the verdict tick starts the hold');
  assert.equal(endingHoldExpired(standard, 100, 107.99), false, 'the field keeps living through the hold');
  assert.equal(endingHoldExpired(standard, 100, 108), true, 'the hold expires exactly endingHoldS after the verdict');
  assert.equal(endingHoldExpired({ endingHoldS: 99 }, 100, 112), true, 'a hold past the ceiling is clamped to it');
  assert.equal(endingHoldExpired({ endingHoldS: 0 }, 100, 100), true, 'a zero hold freezes at the verdict');
  assert.equal(endingHoldExpired({ endingHoldS: Number.NaN }, 100, 100), true, 'a malformed hold reads as zero');
}

// VH.15 counter-drone (owner 2026-10-16 on the 226 preview: "machine guns targeting drones is a lil too punishinng"): a
// drone falls at AERIAL_RULES.drone.hitsToDown = 1.1 strikes. A capped burst (every round at the profile's droneHitMax,
// the station within about 40 m) sums burstRounds x droneHitMax: the 12.7 (5 x .2 = 1.0) and the 30 mm (3 x .35 = 1.05)
// no longer down a drone alone, the 7.62 (8 x .15 = 1.2) and the 20 mm Rh 202 (5 x .3 = 1.5) still do, and several
// stations' shares still add. The value stays inside (1.07, 1.18) and at least .02 from every capped strike count, so a
// later edit cannot land on a burst sum and turn one burst into a cliff. Measured at 1.1 against 1 (the counter-drone
// harness on the real stepAerial / stepRoofStation / strikeDrone path, seeds 1-240 on flat open ground, non-dive runs):
// lone-station downs 7.62 22.8 -> 14.6 %, 12.7 14.8 -> 10.2 %, 30 mm 17.2 -> 13.1 %; two stations 70-86 -> 62-80 %;
// three 97-99 -> 94-98 %; steep dives unchanged; the 12-match drone field (verdant, steppe, urban) 33.9 -> 28.7 % downed.
{
  const { hitsToDown } = AERIAL_RULES.drone;
  assert.equal(matchRulesetFor('drone').counterDrone, true, 'the drone mode keeps counter-drone fire');
  assert.ok(hitsToDown > 1.07 && hitsToDown < 1.18, `hitsToDown ${hitsToDown} sits between the 30 mm (1.05) and 7.62 (1.2) burst sums`);
  const stations = [['12.7 mm', auxiliaryWeaponProfile(12.7)], ['7.62 mm', auxiliaryWeaponProfile(7.62)],
    ['30 mm', auxiliaryWeaponProfile(30)], ['20 mm Rh 202', auxiliaryWeaponProfile(20, 'mbt70')]];
  const burst = Object.fromEntries(stations.map(([name, p]) => [name, p.burstRounds * p.droneHitMax]));
  assert.ok(burst['12.7 mm'] < hitsToDown && burst['30 mm'] < hitsToDown, `one capped 12.7 (${burst['12.7 mm']}) or 30 mm (${burst['30 mm']}) burst no longer downs a drone`);
  assert.ok(burst['7.62 mm'] >= hitsToDown && burst['20 mm Rh 202'] >= hitsToDown, `one capped 7.62 (${burst['7.62 mm']}) or 20 mm (${burst['20 mm Rh 202']}) burst still does`);
  for (const [name, p] of stations) {
    for (let k = 1; k * p.droneHitMax < hitsToDown + 1; k++) {
      assert.ok(Math.abs(k * p.droneHitMax - hitsToDown) >= .02 - 1e-9, `${name}: ${k} capped rounds (${k * p.droneHitMax}) stay clear of hitsToDown ${hitsToDown}`);
    }
  }
}

console.log('matchRuleset: per-mode values, determinism, campaign difficulty fold, team arrangement clamps, horde wave law, rule-card lines, spawn stamps, ammo/reload helpers, the post-verdict hold and the counter-drone airframe threshold (hitsToDown 1.1, clear of every capped burst sum) verified');
