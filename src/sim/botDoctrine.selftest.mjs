// Bot doctrine (gameplay-modes-228): how a bot plays its side of a mode, one table per side in sim/matchRuleset.ts read
// live by both builders. Pins CLASSIC (today's controller, knob for knob, so a mode without a table plays byte-identical:
// server/battlePacing and the aggression harness's standard and juggernaut rows), the side map (an Infected convert
// switches tables on its first tick), the memoised frozen tables (a tick allocates nothing), and the ordering the owner
// asked for: the Horde's zombies the most aggressive, the infected second, the survivors fighting back at range.
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from './matchModes.ts';
import { CLASSIC_BOT_DOCTRINE, HUNT_RULES, RUSH_DRIVE, STRIKER_JUMP, matchRulesetFor, rulesetBotDoctrine, rulesetRoutePush } from './matchRuleset.ts';

assert.deepEqual({ ...CLASSIC_BOT_DOCTRINE }, {
  openingRead: true, holdBandScale: 1, engageRangeScale: 1, coverScale: 1, fallbackScale: 1, hitReactions: 'all',
  scoutKite: true, scoot: true, spearheadGuard: true, conserveRounds: true, stalemateSilentS: 12, missionSpeed: 0.85,
  missionBreakOffHp: 0.25, missionOwnsRoute: false, missionLocalReachM: 0, zoneSortieM: 0, settleShots: true, jockeyS: 0,
  rush: false, rollingTurns: false, noRamLane: false, offensiveJump: false, searchRouting: 'live',
  routeRefreshS: null, routeMoveM: null, claimRangeM: null, packFire: 0,
}, 'CLASSIC is the controller as it stood on integ/228: every multiplier 1, every gate as it was, each builder\'s own route push');
assert.ok(Object.isFrozen(CLASSIC_BOT_DOCTRINE));

// the modes without a doctrine of their own play CLASSIC on both sides, under every team name either builder uses
for (const mode of ['standard', 'realistic', 'zone_control', 'gun_game', 'drone', 'ac130', 'juggernaut', 'mars']) {
  for (const team of ['alpha', 'bravo', 'player', 'enemy']) {
    assert.equal(rulesetBotDoctrine(matchRulesetFor(mode), team), CLASSIC_BOT_DOCTRINE, `${mode} ${team}: classic`);
  }
}
// the route push each builder ran before the doctrine (round 2, the critic's E9: one figure for both changed the solo
// battle's 4 s / 18 m): the solo battle 4 s / 18 m (Turbo Ball 1.25 s on any move), the authority 3 s / 12 m (Turbo
// Ball, Endless Horde and Mars 1.25 s on any move); a doctrine's own figures win in both
const push = (mode, team, builder) => ({ ...rulesetRoutePush(matchRulesetFor(mode), team, builder) });
for (const mode of ['zone_control', 'ac130', 'gun_game', 'drone', 'juggernaut', 'realistic', 'mars']) {
  assert.deepEqual(push(mode, 'alpha', 'solo'), { refreshS: 4, moveM: 18 }, `${mode}: the solo battle's legacy push`);
}
for (const mode of ['zone_control', 'ac130', 'juggernaut']) assert.deepEqual(push(mode, 'bravo', 'authority'), { refreshS: 3, moveM: 12 }, `${mode}: the authority's`);
assert.deepEqual(push('mars', 'alpha', 'authority'), { refreshS: 1.25, moveM: 0 }, 'Mars keeps the authority\'s fast route there alone');
for (const builder of ['solo', 'authority']) {
  assert.deepEqual(push('turbo_ball', 'alpha', builder), { refreshS: 1.25, moveM: 0 }, `Turbo Ball's doctrine in the ${builder}`);
  assert.deepEqual(push('endless_horde', 'bravo', builder), { refreshS: 1.25, moveM: 8 }, `the zombies' doctrine in the ${builder}`);
}
assert.equal(rulesetRoutePush(matchRulesetFor('zone_control'), 'alpha', 'solo'), rulesetRoutePush(matchRulesetFor('zone_control'), 'player', 'solo'), 'memoised');

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
// a labelled mission owns its route in every tuned table; the classic controller keeps the old search (round 2, E9)
for (const [mode, team] of [['frontline_assault', 'alpha'], ['frontline_assault', 'bravo'], ['capture_the_flag', 'alpha'], ['turbo_ball', 'bravo'],
  ['endless_horde', 'alpha'], ['endless_horde', 'bravo'], ['infected', 'alpha'], ['infected', 'bravo']]) {
  assert.equal(rulesetBotDoctrine(matchRulesetFor(mode), team).missionOwnsRoute, true, `${mode} ${team}: the mission owns its route`);
}
assert.equal(CLASSIC_BOT_DOCTRINE.missionOwnsRoute, false, 'classic: the search may take a mission hull, as on integ/228');
assert.equal(rulesetBotDoctrine(matchRulesetFor('turbo_ball'), 'alpha').offensiveJump, true, 'strikers jump at the ball');
// the drive and hunt tables the controller and the mode controller read
// round 3: the run-in beside the quarry and the pack's orbit rings; round 3b: the wider, longer no-ram lane, the lane
// keepers' back-off where they stand
assert.deepEqual({ ...RUSH_DRIVE }, { directM: 70, orbitInM: 28, orbitMinM: 16, orbitMaxM: 28, noRamM: 12, runInSideM: 24, orbitStepM: 10,
  orbitRings: 3, tangentLeadM: 18, closingLeadM: 6, laneMarginM: 3, lookaheadS: 1, brakeGapM: 3, backOffGapM: 1.5, backOffThrottle: 0.5,
  swerveThrottle: 0.45, laneBackOffGapM: 3 });
assert.ok(RUSH_DRIVE.laneBackOffGapM <= RUSH_DRIVE.brakeGapM, 'a lane keeper backs off only inside the brake gap');
for (const id of ['frontline_assault', 'infected', 'endless_horde', 'turbo_ball']) {
  for (const side of ['alpha', 'bravo']) {
    const d = rulesetBotDoctrine(matchRulesetFor(id), side);
    if (!d.rush) assert.equal(d.noRamLane, true, `${id} ${side}: a lane keeper (no fodder hull is driven into)`);
  }
}
assert.equal(CLASSIC_BOT_DOCTRINE.noRamLane, false, 'classic keeps driving as it did');
assert.ok(RUSH_DRIVE.swerveThrottle > 0 && RUSH_DRIVE.backOffGapM < RUSH_DRIVE.brakeGapM, 'the no-ram rule swerves on with way on, stops only short of a touch');
assert.ok(RUSH_DRIVE.orbitMinM > RUSH_DRIVE.noRamM, 'the orbit always stands off the hull: a rusher steers off a ram');
assert.equal(HUNT_RULES.lastSeenMaxS, 45); assert.equal(HUNT_RULES.assignEveryS, 1);
assert.ok(STRIKER_JUMP.rangeM === 25 && STRIKER_JUMP.coneRad > 0);
console.log('botDoctrine.selftest: CLASSIC knob for knob, side-keyed memoised tables, the convert switch, zombies > infected > the rest');
