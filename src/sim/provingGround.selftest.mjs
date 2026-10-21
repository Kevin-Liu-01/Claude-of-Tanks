// The proving ground (v2 progression, owner 2026-10-17: "build out all the options": proving ground / test drive): the
// ruleset row every rule lives in, the practice-mode partition (rooms and the battle lists never see it), the range
// layout (deterministic, fail-closed, clear sightlines, nearer hulls never hiding farther ones) on synthetic ground and
// on the real battlefield, the moving-target drive, and the range card's ballistics (the aim overlay's estimate).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  BATTLE_MODE_IDS, GAME_MODE_DEFINITIONS, GAME_MODE_IDS, PRACTICE_MODE_IDS, isPracticeMode, normalizeGameMode,
} from './matchModes.ts';
import {
  PROVING_GROUND_RULES, TEST_DRIVE, TEAM_ARRANGEMENT_LIMITS, matchRulesetFor, normalizeTeamArrangement, rulesetKeepsRecords,
  rulesetLines, acceptsTeamArrangement,
} from './matchRuleset.ts';
import {
  PROVING_PEN_RATIO, planProvingRange, plateLimitMm, provingCentreAim, provingOutcome, provingPatrolInput, provingShellCard,
  wrapAngle,
} from './provingGround.ts';
import { penAtDistanceMm } from './ballistics.ts';
import { createTankState } from './movement.ts';
import { defaultRoomSettings } from '../mp/room/roomPolicy.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import { getSpec } from '../vehicles/specs.ts';
import '../vehicles/tankFactory.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { planSoloProvingRange, provingRangePresentation } from '../game/provingRange.ts';

const DEG = Math.PI / 180;
const rules = PROVING_GROUND_RULES;

// --- the ruleset row: every rule of the range lives here ---------------------------------------------------------------
const ruleset = matchRulesetFor('proving_ground');
assert.equal(ruleset.mode, 'proving_ground');
assert.equal(ruleset.provingGround, rules, 'the range rules ride on the ruleset');
assert.equal(ruleset.allies, 0, 'no allied bot on the range');
assert.equal(ruleset.enemies, rules.lanes.length, 'one target hull per lane');
assert.equal(ruleset.alwaysVisible, true, 'every target is in sight');
assert.equal(ruleset.ammo, 'unlimited', 'unlimited rounds of the tank\'s own loadout');
assert.equal(ruleset.timeLimitS, null, 'no clock');
assert.equal(ruleset.respawnS, 3, 'a destroyed hull stands again on its mark');
assert.equal(ruleset.records, false, 'nothing recorded');
assert.equal(ruleset.provingGround.moving, false, 'the targets hold still by default');
for (const key of ['speedMultiplier', 'hpScale', 'damageScale', 'reloadScale', 'gravityScale']) {
  assert.equal(ruleset[key], matchRulesetFor('standard')[key], `${key}: the range plays the battle's own physics and damage`);
}
assert.equal(ruleset.criticalDamage, true, 'modules, crew and fires break on the range as in battle');
assert.deepEqual(rulesetLines(ruleset).map((line) => line.key), ['alwaysVisible', 'ammoUnlimited', 'respawn', 'noClock', 'provingLanes', 'noRecords'],
  'the rule card lists exactly what the range changes');
assert.equal(rulesetLines(ruleset).find((line) => line.key === 'provingLanes').values.value, String(rules.lanes.length));
const moving = matchRulesetFor('proving_ground', null, { movingTargets: true });
assert.equal(moving.provingGround.moving, true, 'the arrangement switches moving targets on');
assert.ok(rulesetLines(moving).some((line) => line.key === 'movingTargets'));
assert.equal(rules.moving, false, 'the switch never mutates the shared rules');
assert.ok(acceptsTeamArrangement('proving_ground'));
assert.deepEqual(normalizeTeamArrangement('proving_ground', { allies: 5, enemies: 9, movingTargets: true }), { movingTargets: true },
  'the moving-target switch is the range\'s only arrangement');
assert.equal(normalizeTeamArrangement('proving_ground', { allies: 5, enemies: 9 }), null);
assert.deepEqual([...TEAM_ARRANGEMENT_LIMITS.allies.proving_ground], [0, 0]);
assert.deepEqual([...TEAM_ARRANGEMENT_LIMITS.enemies.proving_ground], [rules.lanes.length, rules.lanes.length]);
assert.equal(rulesetKeepsRecords('proving_ground'), false);
assert.equal(rulesetKeepsRecords('standard'), true);
assert.equal(rulesetKeepsRecords('frontline_assault'), true);
assert.equal(rulesetKeepsRecords(null), true, 'an unknown mode keeps its records (fail toward the record)');
for (const mode of BATTLE_MODE_IDS) assert.equal(matchRulesetFor(mode).records, true, `${mode} keeps records`);

// --- the practice-mode partition ----------------------------------------------------------------------------------------
assert.deepEqual([...PRACTICE_MODE_IDS], ['proving_ground']);
assert.deepEqual([...GAME_MODE_IDS], [...BATTLE_MODE_IDS, ...PRACTICE_MODE_IDS], 'the simulation plays the battle modes, then the practice modes');
assert.ok(!BATTLE_MODE_IDS.includes('proving_ground'), 'the range is never listed as a battle');
assert.ok(isPracticeMode('proving_ground') && !isPracticeMode('standard') && !isPracticeMode(null) && !isPracticeMode('bogus'));
assert.equal(normalizeGameMode('proving_ground'), 'proving_ground', 'the solo sim plays the range');
assert.equal(GAME_MODE_DEFINITIONS.proving_ground.respawns, true);
assert.ok(uiIconSVG(GAME_MODE_DEFINITIONS.proving_ground.icon).includes('<path'), 'the mode wears an icon of the shared set');
assert.equal(defaultRoomSettings({ gameMode: 'proving_ground' }).gameMode, 'standard', 'a room never hosts the range');
assert.equal(defaultRoomSettings({ gameMode: 'zone_control' }).gameMode, 'zone_control', 'rooms keep every battle mode');
assert.equal(TEST_DRIVE.gameMode, 'proving_ground');
assert.equal(TEST_DRIVE.mapId, rules.mapId);
assert.ok(MAP_IDS.includes(rules.mapId), 'the range stands on a registered battlefield');

// --- the layout on synthetic ground -------------------------------------------------------------------------------------
const flat = { heightAt: () => 0, standable: () => true };
const layout = planProvingRange(rules, flat);
assert.deepEqual(planProvingRange(rules, flat), layout, 'the layout is a pure function of the rules and the ground');
assert.ok(Object.isFrozen(layout) && Object.isFrozen(layout.lanes[0]));
assert.deepEqual([layout.origin.x, layout.origin.z], [rules.firingLine.x, rules.firingLine.z], 'the firing line stands at its point');
assert.ok(Math.abs(layout.origin.yaw - rules.firingLine.bearingDeg * DEG) < 1e-9, 'the player faces down the range');
assert.equal(layout.lanes.length, rules.lanes.length);
const fx = Math.sin(rules.firingLine.bearingDeg * DEG), fz = Math.cos(rules.firingLine.bearingDeg * DEG);
for (const [index, lane] of layout.lanes.entries()) {
  const rule = rules.lanes[index];
  assert.equal(lane.index, index);
  assert.equal(lane.lateralM, rule.lateralM, `lane ${index}: open ground keeps the preferred offset`);
  const down = (lane.x - layout.origin.x) * fx + (lane.z - layout.origin.z) * fz;
  assert.ok(Math.abs(down - rule.rangeM) < 1e-6, `lane ${index}: ${rule.rangeM} m down the range`);
  assert.ok(Math.abs(lane.measuredM - Math.hypot(rule.rangeM, rule.lateralM)) < 1e-6, `lane ${index}: the measured range`);
  // the presented angle: the hull's nose against the line to the firing line
  const toShooter = Math.atan2(layout.origin.x - lane.x, layout.origin.z - lane.z);
  assert.ok(Math.abs(wrapAngle(lane.yaw - toShooter) - rule.presentDeg * DEG) < 1e-9, `lane ${index}: presents ${rule.presentDeg} deg`);
}
// no nearer silhouette covers a farther one, seen from the firing line
const bearings = layout.lanes.map((lane) => {
  const dx = lane.x - layout.origin.x, dz = lane.z - layout.origin.z, distance = Math.hypot(dx, dz);
  const angle = Math.atan2(dx * Math.cos(rules.firingLine.bearingDeg * DEG) - dz * Math.sin(rules.firingLine.bearingDeg * DEG), dx * fx + dz * fz);
  return { angle, half: Math.asin(rules.targetRadiusM / distance) };
});
for (let i = 0; i < bearings.length; i++) for (let j = i + 1; j < bearings.length; j++) {
  const gap = Math.abs(bearings[i].angle - bearings[j].angle) - bearings[i].half - bearings[j].half;
  assert.ok(gap >= rules.separationDeg * DEG - 1e-9, `lanes ${i} and ${j} stay apart in the sight (${(gap / DEG).toFixed(2)} deg)`);
}
// a blocked mark moves across the axis; a ridge across the sightline moves the lane; nowhere to stand fails closed
const blockedFirst = planProvingRange(rules, { heightAt: () => 0, standable: (x, z) => !(Math.abs(x - layout.lanes[0].x) < 1 && Math.abs(z - layout.lanes[0].z) < 1) });
assert.notEqual(blockedFirst.lanes[0].lateralM, rules.lanes[0].lateralM, 'a blocked mark takes the next clear offset');
assert.equal(Math.abs(blockedFirst.lanes[0].lateralM - rules.lanes[0].lateralM) % rules.lateralStepM, 0, 'offsets step by the rules');
const ridgeX = layout.origin.x + 50;
const ridged = planProvingRange(rules, { heightAt: (x, z) => (Math.abs(x - ridgeX) < 3 && z > 5 && z < 40 ? 8 : 0), standable: () => true });
{
  const lane = ridged.lanes[0], zAtRidge = layout.origin.z + (lane.z - layout.origin.z) * (ridgeX - layout.origin.x) / (lane.x - layout.origin.x);
  assert.notEqual(lane.lateralM, rules.lanes[0].lateralM, 'a lane behind a ridge moves across the axis');
  assert.ok(zAtRidge <= 5 || zAtRidge >= 40, `to a sightline clear of the ridge (${zAtRidge.toFixed(1)} m at the ridge)`);
}
assert.throws(() => planProvingRange(rules, { heightAt: () => 0, standable: () => false }), /no standable firing line/);
assert.throws(() => planProvingRange(rules, { heightAt: () => 0, standable: (x) => x < layout.origin.x + 10 }), /no clear mark/,
  'a lane with nowhere to stand fails closed');

// --- the layout on the real battlefield ---------------------------------------------------------------------------------
const world = createDedicatedWorldCollision(rules.mapId);
let real;
try {
  real = planSoloProvingRange(rules, world);
  assert.equal(real.lanes.length, rules.lanes.length, `${rules.mapId}: every lane finds a clear mark`);
  for (const [index, lane] of real.lanes.entries()) {
    assert.ok(Math.abs(lane.measuredM - rules.lanes[index].rangeM) / rules.lanes[index].rangeM < 0.02,
      `${rules.mapId}: lane ${index} measures ${lane.measuredM.toFixed(1)} m for ${rules.lanes[index].rangeM} m`);
  }
  assert.deepEqual(planSoloProvingRange(rules, world), real, 'the battlefield layout is deterministic');

  // --- the range card on real hulls -------------------------------------------------------------------------------------
  const seat = (specId, mark) => {
    const spec = getSpec(specId);
    const state = createTankState(spec, new Vector3(mark.x, world.heightField.getHeightAt(mark.x, mark.z), mark.z), mark.yaw);
    return { id: `${specId}#${mark.x}`, specId, state, spec };
  };
  const player = seat('m1a1_abrams_hc', real.origin);
  const targets = real.lanes.map((lane, index) => seat(['t72b3', 'leo2a4', 'type59', 'm1a2_abrams_sepv2', 'ztz99a'][index] ?? 't72b3', lane));
  const missing = targets.filter((target) => !target.spec);
  assert.equal(missing.length, 0);
  const presentation = provingRangePresentation(rules, real, player, targets, (x, z) => world.heightField.getHeightAt(x, z));
  assert.equal(presentation.lanes.length, rules.lanes.length);
  assert.deepEqual(presentation.plateAnglesDeg, [...rules.plateAnglesDeg]);
  for (const lane of presentation.lanes) {
    assert.equal(lane.shells.length, player.spec.gun.shells.length, 'a card per round of the loadout');
    assert.equal(lane.targetId, targets[lane.index].id);
    for (const card of lane.shells) {
      assert.ok(card.penMm > 0);
      assert.equal(card.plateMm.length, rules.plateAnglesDeg.length);
      for (let k = 1; k < card.plateMm.length; k++) assert.ok(card.plateMm[k] <= card.plateMm[k - 1], 'more slope, less plate defeated');
      assert.equal(card.outcome, provingOutcome(card.ratio));
    }
  }
  // the old Type 59 at 300 m broadside falls to the Abrams' first round; the nose-on card is a real aim query, not a guess
  assert.equal(presentation.lanes[2].shells[0].outcome, 'pen', 'a broadside Type 59 at 300 m is defeated');
  const aim = provingCentreAim({ x: real.origin.x, y: world.heightField.getHeightAt(real.origin.x, real.origin.z) + rules.sightHeightM, z: real.origin.z }, targets[0]);
  assert.ok(aim && aim.plate && aim.distM > 90 && aim.distM < 110, 'the centre-of-mass line meets the 100 m hull');
} finally {
  world.release();
}

// --- the ballistics of the card -----------------------------------------------------------------------------------------
const shell = getSpec('m1a1_abrams_hc').gun.shells[0];
for (const distM of [100, 450, 650]) {
  const pen = penAtDistanceMm(shell, distM), limit = plateLimitMm(shell, distM, 0);
  assert.ok(Math.abs(limit - pen) <= Math.max(3, pen * 0.03), `${distM} m: the flat plate limit is the round's penetration (${limit} vs ${pen.toFixed(0)})`);
  assert.ok(plateLimitMm(shell, distM, 30) <= limit && plateLimitMm(shell, distM, 60) <= plateLimitMm(shell, distM, 30));
}
assert.ok(plateLimitMm(shell, 650, 0) <= plateLimitMm(shell, 100, 0), 'penetration falls with range');
assert.ok(plateLimitMm(shell, 100, 85) < plateLimitMm(shell, 100, 0) * 0.2, 'near grazing only an overmatched plate falls');
assert.deepEqual([provingOutcome(PROVING_PEN_RATIO.pen), provingOutcome(1), provingOutcome(PROVING_PEN_RATIO.marginal - 0.01), provingOutcome(0), provingOutcome(NaN)],
  ['pen', 'marginal', 'nopen', 'nopen', 'nopen'], 'the aim overlay\'s bands');
const blind = provingShellCard(shell, 200, null, rules.plateAnglesDeg);
assert.equal(blind.outcome, 'nopen'); assert.equal(blind.ratio, 0); assert.ok(blind.plateMm[0] > 0, 'the plates still measure with no hull on the line');

// --- the moving-target drive --------------------------------------------------------------------------------------------
const mark = { x: 0, z: 0, yaw: 0.6 };
const out = { throttle: 0, steer: 0 };
const state = { dir: 1 };
provingPatrolInput(mark, { pos: { x: 0, z: 0 }, yaw: mark.yaw, speed: 0 }, rules.patrol, state, out);
assert.equal(out.throttle, rules.patrol.throttle, 'drives forward first'); assert.ok(Math.abs(out.steer) < 1e-9, 'on its line, no steer');
const end = rules.patrol.halfLengthM + 0.5;
provingPatrolInput(mark, { pos: { x: Math.sin(mark.yaw) * end, z: Math.cos(mark.yaw) * end }, yaw: mark.yaw, speed: 3 }, rules.patrol, state, out);
assert.equal(state.dir, -1, 'turns back at the end of its run'); assert.equal(out.throttle, -rules.patrol.throttle);
provingPatrolInput(mark, { pos: { x: -Math.sin(mark.yaw) * end, z: -Math.cos(mark.yaw) * end }, yaw: mark.yaw, speed: -3 }, rules.patrol, state, out);
assert.equal(state.dir, 1, 'and forward again at the other end');
const drift = { dir: 1 };
provingPatrolInput(mark, { pos: { x: 0, z: 0 }, yaw: mark.yaw - 0.3, speed: 2 }, rules.patrol, drift, out);
assert.ok(out.steer > 0, 'a hull turned off its line steers back');
// a kinematic hull on the drive stays in its lane and shuttles end to end
{
  const pose = { pos: { x: 0, z: 0 }, yaw: mark.yaw, speed: 0 }, patrol = { dir: 1 };
  let minAlong = 0, maxAlong = 0, maxOff = 0;
  for (let i = 0; i < 60 * 60; i++) {
    provingPatrolInput(mark, pose, rules.patrol, patrol, out);
    pose.speed += (out.throttle * 8 - pose.speed) * (1 / 60) * 2;
    pose.yaw += out.steer * 0.9 * (1 / 60) * (pose.speed < 0 ? -1 : 1);
    pose.pos.x += Math.sin(pose.yaw) * pose.speed / 60; pose.pos.z += Math.cos(pose.yaw) * pose.speed / 60;
    const along = pose.pos.x * Math.sin(mark.yaw) + pose.pos.z * Math.cos(mark.yaw);
    const off = pose.pos.x * Math.cos(mark.yaw) - pose.pos.z * Math.sin(mark.yaw);
    minAlong = Math.min(minAlong, along); maxAlong = Math.max(maxAlong, along); maxOff = Math.max(maxOff, Math.abs(off));
  }
  assert.ok(maxAlong >= rules.patrol.halfLengthM && minAlong <= -rules.patrol.halfLengthM, `the hull runs end to end (${minAlong.toFixed(1)}..${maxAlong.toFixed(1)} m)`);
  assert.ok(maxAlong < rules.patrol.halfLengthM + 15 && minAlong > -rules.patrol.halfLengthM - 15, 'and never runs off its lane');
  assert.ok(maxOff < 4, `it holds its line (${maxOff.toFixed(2)} m off)`);
}

console.log(`provingGround.selftest: ruleset row, practice partition (rooms refuse it), ${rules.lanes.length}-lane layout on synthetic ground and ${rules.mapId}, range card ballistics and the moving-target drive pass`);
