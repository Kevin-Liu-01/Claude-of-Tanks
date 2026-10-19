// Bot doctrine (gameplay-modes-228): how a bot plays its side of a mode, one table per side in sim/matchRuleset.ts read
// live by both builders. Pins CLASSIC (today's controller, knob for knob, so a mode without a table plays byte-identical:
// server/battlePacing and the aggression harness's standard and juggernaut rows), the side map (an Infected convert
// switches tables on its first tick), the memoised frozen tables (a tick allocates nothing), and the ordering the owner
// asked for: the Horde's zombies the most aggressive, the infected second, the survivors fighting back at range.
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from './matchModes.ts';
import { CLASSIC_BOT_DOCTRINE, HUNT_RULES, RUSH_DRIVE, STRIKER_JUMP, matchRulesetFor, rulesetBotDoctrine } from './matchRuleset.ts';

assert.deepEqual({ ...CLASSIC_BOT_DOCTRINE }, {
  openingRead: true, holdBandScale: 1, engageRangeScale: 1, coverScale: 1, fallbackScale: 1, hitReactions: 'all',
  scoutKite: true, scoot: true, spearheadGuard: true, conserveRounds: true, stalemateSilentS: 12, missionSpeed: 0.85,
  missionBreakOffHp: 0.25, zoneSortieM: 0, rush: false, offensiveJump: false, searchRouting: 'live',
  routeRefreshS: 3, routeMoveM: 12, claimRangeM: null,
}, 'CLASSIC is the controller as it stood on integ/228: every multiplier 1, every gate as it was');
assert.ok(Object.isFrozen(CLASSIC_BOT_DOCTRINE));

// the modes without a doctrine of their own play CLASSIC on both sides, under every team name either builder uses
for (const mode of ['standard', 'realistic', 'zone_control', 'gun_game', 'drone', 'ac130', 'juggernaut']) {
  for (const team of ['alpha', 'bravo', 'player', 'enemy']) {
    assert.equal(rulesetBotDoctrine(matchRulesetFor(mode), team), CLASSIC_BOT_DOCTRINE, `${mode} ${team}: classic`);
  }
}
// Mars keeps the authority's long-standing fast route as a rule, nothing else
assert.deepEqual({ ...rulesetBotDoctrine(matchRulesetFor('mars'), 'alpha') }, { ...CLASSIC_BOT_DOCTRINE, routeRefreshS: 1.25, routeMoveM: 0 });

// every table is complete, frozen, memoised, and keyed by side only (bravo / solo's enemy, everything else alpha)
const keys = Object.keys(CLASSIC_BOT_DOCTRINE).sort();
for (const mode of GAME_MODE_IDS) {
  const rules = matchRulesetFor(mode);
  for (const team of ['alpha', 'bravo']) {
    const doctrine = rulesetBotDoctrine(rules, team);
    assert.deepEqual(Object.keys(doctrine).sort(), keys, `${mode} ${team}: a complete doctrine`);
    assert.ok(Object.isFrozen(doctrine), `${mode} ${team}: frozen`);
    assert.equal(rulesetBotDoctrine(rules, team), doctrine, `${mode} ${team}: memoised (a tick allocates nothing)`);
  }
  assert.equal(rulesetBotDoctrine(rules, 'enemy'), rulesetBotDoctrine(rules, 'bravo'), `${mode}: solo's enemy is bravo`);
  assert.equal(rulesetBotDoctrine(rules, 'player'), rulesetBotDoctrine(rules, 'alpha'), `${mode}: solo's player is alpha`);
  // an arranged ruleset (a new object) reads the same tables
  assert.deepEqual({ ...rulesetBotDoctrine(matchRulesetFor(mode, null, { allies: 2 }), 'bravo') }, { ...rulesetBotDoctrine(rules, 'bravo') });
}

// an Infected convert switches tables on its first tick: the builders pass a live getter over entity.team
{
  const infected = matchRulesetFor('infected');
  const survivor = { team: 'player' };
  const doctrine = () => rulesetBotDoctrine(infected, survivor.team);
  assert.equal(doctrine().rush, false, 'a survivor does not rush');
  survivor.team = 'enemy'; // matchModes converts it
  assert.equal(doctrine().rush, true, 'the convert rushes from its first tick');
}

// the ordering (owner 2026-10-18): zombies, then the infected, both charging, never ducking or retreating
const zombie = rulesetBotDoctrine(matchRulesetFor('endless_horde'), 'bravo');
const infectedBot = rulesetBotDoctrine(matchRulesetFor('infected'), 'bravo');
const survivor = rulesetBotDoctrine(matchRulesetFor('infected'), 'alpha');
for (const [label, d] of [['zombie', zombie], ['infected', infectedBot]]) {
  assert.ok(d.rush && !d.openingRead && d.holdBandScale === 0 && d.coverScale === 0 && d.fallbackScale === 0, `${label}: the charge`);
  assert.ok(!d.scoutKite && !d.scoot && !d.spearheadGuard && !d.conserveRounds && d.missionSpeed === 1 && d.missionBreakOffHp === 0, `${label}: no self-preservation`);
  assert.equal(d.searchRouting, 'spotted', `${label}: honest routing`);
  assert.ok(d.routeRefreshS <= 1.25, `${label}: re-routed every 1.25 s`);
}
assert.equal(zombie.hitReactions, 'none', 'a zombie keeps coming'); assert.equal(infectedBot.hitReactions, 'angle', 'an infected turns its hull to a hit');
assert.ok(zombie.claimRangeM != null && zombie.claimRangeM <= 150, 'a zombie claims its targets close');
assert.ok(!survivor.rush && !survivor.openingRead && !survivor.conserveRounds && survivor.fallbackScale === 0.5, 'the survivors fight back hard');
assert.ok(survivor.spearheadGuard && survivor.scoutKite && survivor.holdBandScale === 1, 'at range, together');
// the objective modes play their objectives at pace: no opening read, full speed, no mission break-off for the attack
for (const [mode, team] of [['frontline_assault', 'alpha'], ['capture_the_flag', 'alpha'], ['capture_the_flag', 'bravo'], ['turbo_ball', 'alpha']]) {
  const d = rulesetBotDoctrine(matchRulesetFor(mode), team);
  assert.ok(!d.openingRead && d.missionSpeed === 1 && d.missionBreakOffHp === 0, `${mode} ${team}: objective pace`);
}
assert.equal(rulesetBotDoctrine(matchRulesetFor('frontline_assault'), 'bravo').zoneSortieM, 80, 'defenders sortie at a SPOTTED attacker');
assert.equal(rulesetBotDoctrine(matchRulesetFor('turbo_ball'), 'alpha').offensiveJump, true, 'strikers jump at the ball');
// the drive and hunt tables the controller and the mode controller read
assert.deepEqual({ ...RUSH_DRIVE }, { directM: 70, orbitInM: 35, orbitMinM: 25, orbitMaxM: 35, noRamM: 12 });
assert.ok(RUSH_DRIVE.orbitMinM > RUSH_DRIVE.noRamM, 'the orbit always stands off the hull: a rusher never rams');
assert.equal(HUNT_RULES.lastSeenMaxS, 45); assert.equal(HUNT_RULES.assignEveryS, 1);
assert.ok(STRIKER_JUMP.rangeM === 25 && STRIKER_JUMP.coneRad > 0);
console.log('botDoctrine.selftest: CLASSIC knob for knob, side-keyed memoised tables, the convert switch, zombies > infected > the rest');
