#!/usr/bin/env node
// trainingThreat.selftest.mjs — the training battle's scripted shooter and its angling scene, held to the simulation (273).
// Copyright © 2026 Kevin B. Liu.
//
// Kevin, 2026-11-18 (S9, option (a)): a T-72BU firing HEAT; the player's front plate amber square on and red turned 35
// degrees, in the reticle's own colours; real rounds with the shot card; no rule changed. Holds:
//  1. the Sentry: a scripted shooter whose round is in its own rack, facing ring F nose on, apart from the targets;
//  2. its fire: no trigger before the telegraph, the trigger held after it; its aim on the loaner's upper front plate,
//     turning with the hull; the same inputs give the same aim (no clock, no random);
//  3. the colours (sim/trainingThreat.ts, the reticle's solver and bands): at ring F the Sentry's HEAT on the loaner's
//     plate reads amber nose on and red at 35 degrees either way, red through the whole of the angle step's window
//     (ui/tutorial/tutorialSteps.ts ANGLE_WINDOW) with room either side, and green once the side shows (the arc's three
//     colours); the hull angle reads 0 nose on and the turn's size either way;
//  4. the steps: S9 drives to F, holds the window, then cues the Sentry and counts the rounds the plate holds; the
//     runner cues a step's shooter while it shows and stands it down after (wiring);
//  5. S10, hull down: Sentry 2's APFSDS reads red on the loaner's turret front and green on its hull; the berm is stamped
//     across the line to it; on its ground (level, the berm raised) a tank at ring G is hull down to Sentry 2 (its hull
//     hidden, its turret seen: sim/trainingSight.ts trainingExposure), and one whose nose climbs the back slope shows its
//     hull; the steps drive to G, hold hull down, take Sentry 2's rounds and fire back;
//  6. S11, peek, shoot, hide: the wall is stamped between ring P and Sentry 3; from Sentry 3 a tank at P is hidden whole and
//     one at ring Q seen; Sentry 3 stands parked until its cue and never fires at what it cannot see; the steps take cover,
//     count two peek cycles and finish it;
//  7. S12, the kit: Sentry 4 (parked until its cue) lays HE on the running gear on the side the hull shows it, from a
//     line to ring Q; the step waits for either track hit and stands it down, then the repair kit, the kit row and smoke;
//  8. S13, flank the heavy: Bulwark's front reads mostly red to the loaner's APFSDS and its side mostly green (the
//     reticle's solver over a grid on each face); its turret turns 8 degrees a second; rings U and V stand outside its
//     firing arc, U where its front shows and V at its side; it fires only on the player and inside the arc;
//  9. S14, the real fight: the roster is the actors, then the skirmish's allies and enemies, each its own tank; the range
//     layout seats each on its mark in that order; the ruleset fields them; the ally split takes the allies; the fight's
//     cue brings every bot in; the step waits for every enemy bot destroyed, then the chapter's closing card;
// 10. the battle's life: a scene's finished goal and the skirmish stay down (the controller's respawns hook, which only
//     the solo training host passes; every other caller keeps every hull's respawn), the targets and the player come
//     back, the player at the checkpoint (each ring reached), and the chapter's last card ends the battle quietly and
//     returns to the Garage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';

await import('../vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../vehicles/specs.ts');
const { TRAINING_POINTS, TRAINING_RULES, trainingActor, trainingActorYawDeg, trainingVolleyAim, trainingVolleyFires } = await import('./trainingGround.ts');
const { hullAngleToDeg, trainingThreatVerdicts } = await import('./trainingThreat.ts');
const { ANGLE_WINDOW, TRAINING_STEPS } = await import('../ui/tutorial/tutorialSteps.ts');
const { planTrainingRange } = await import('./trainingGround.ts');
const { createTerrainDeformation } = await import('./terrainDeformation.ts');
const { trainingExposure } = await import('./trainingSight.ts');
const { trainingArcAllows, trainingTraverse, trainingRoster, trainingSkirmishSide, trainingRespawns, TRAINING_SKIRMISH_CUE } = await import('./trainingGround.ts');
const { matchRulesetFor } = await import('./matchRuleset.ts');
const { splitBattleAllies } = await import('../game/rosterState.ts');
const { aimArmorAlong, aimPenRatio } = await import('./aimPenetration.ts');
const { penVerdict } = await import('./penVerdict.ts');

const DEG = Math.PI / 180;

// 1. The Sentry.
const sentry = trainingActor(TRAINING_RULES, 'sentry');
assert.ok(sentry?.volley, 'the Sentry is a scripted shooter');
assert.equal(sentry.specId, 't72bu_1989', 'a T-72BU (Kevin\'s option (a))');
const shell = TANK_SPECS[sentry.specId].gun.shells.find((round) => round.type === sentry.volley.shellType);
assert.ok(shell && shell.type === 'HEAT', 'it fires HEAT from its own rack');
assert.equal(sentry.faces, 'fireF', 'it faces ring F');
assert.equal(sentry.presentDeg, 0, 'nose on');
const F = TRAINING_POINTS.fireF;
const range = Math.hypot(sentry.x - F.x, sentry.z - F.z);
assert.ok(range >= 150 && range <= 220, `170 m or so from F (${range.toFixed(0)} m)`);
for (const actor of TRAINING_RULES.actors) if (actor.key.startsWith('target')) assert.ok(!actor.volley, `${actor.key} never fires`);
assert.equal(new Set(TRAINING_RULES.actors.map((actor) => actor.specId)).size, TRAINING_RULES.actors.length, 'each actor its own spec (a solo roster keys hulls by spec)');
assert.ok(!TRAINING_RULES.actors.some((actor) => actor.specId === TRAINING_RULES.loanerSpecId), 'none the loaner');

// 2. Its fire.
assert.equal(trainingVolleyFires(sentry.volley, 10, 10 + sentry.volley.firstS - 0.01), false, 'no trigger before the telegraph');
assert.equal(trainingVolleyFires(sentry.volley, 10, 10 + sentry.volley.firstS), true, 'the trigger held from it on');
const square = Math.atan2(sentry.x - F.x, sentry.z - F.z);
const at = (yaw) => trainingVolleyAim({ x: F.x, y: 2, z: F.z, yaw }, sentry.volley, { x: 0, y: 0, z: 0 });
const nose = at(square);
assert.ok(Math.abs(Math.hypot(nose.x - F.x, nose.z - F.z) - sentry.volley.aim.alongM) < 1e-9 && nose.y === 2 + sentry.volley.aim.upM,
  'the aim stands on the hull\'s nose line, up the plate');
assert.ok(((nose.x - F.x) * (sentry.x - F.x) + (nose.z - F.z) * (sentry.z - F.z)) > 0, 'nose on, the aim lies toward the Sentry');
const turned = at(square + 35 * DEG);
assert.ok(Math.abs(Math.atan2(turned.x - F.x, turned.z - F.z) - (square + 35 * DEG)) < 1e-9, 'the aim turns with the hull');
assert.deepEqual(at(square + 0.3), at(square + 0.3), 'the same pose gives the same aim');

// 3. The colours.
const player = (offsetDeg) => ({ pos: new Vector3(F.x, 0, F.z), yaw: square + offsetDeg * DEG, visualPitch: 0, visualRoll: 0, turretYaw: -offsetDeg * DEG, gunPitch: 0 });
const verdict = (deg) => trainingThreatVerdicts({ x: sentry.x, y: 0, z: sentry.z }, player(0), TANK_SPECS[TRAINING_RULES.loanerSpecId].armor,
  undefined, shell, sentry.volley, [deg])[0];
assert.equal(verdict(0), 'marginal', 'nose on, amber: it may go through');
for (const sign of [1, -1]) {
  assert.equal(verdict(sign * 35), 'nopen', `turned 35 degrees (${sign > 0 ? 'left' : 'right'}), red`);
  for (let deg = ANGLE_WINDOW.minDeg - 2; deg <= ANGLE_WINDOW.maxDeg + 2; deg += 1) {
    assert.equal(verdict(sign * deg), 'nopen', `red through the window and 2 degrees past it (${sign * deg} degrees)`);
  }
  assert.equal(verdict(sign * 75), 'pen', `the side shows: green (${sign * 75} degrees)`);
}
assert.ok(ANGLE_WINDOW.minDeg >= 30 && ANGLE_WINDOW.maxDeg <= 60 && ANGLE_WINDOW.maxDeg - ANGLE_WINDOW.minDeg >= 15, 'a window wide enough to hold');
const pose = (offsetDeg) => ({ x: F.x, z: F.z, yaw: square + offsetDeg * DEG });
assert.ok(Math.abs(hullAngleToDeg(pose(0), sentry)) < 1e-9, 'nose on reads 0');
assert.ok(Math.abs(hullAngleToDeg(pose(40), sentry) - 40) < 1e-9 && Math.abs(hullAngleToDeg(pose(-40), sentry) - 40) < 1e-9, 'a turn reads its size either way');
assert.ok(Math.abs(trainingActorYawDeg(sentry) - square / DEG) < 1e-9 || Math.abs(Math.abs(trainingActorYawDeg(sentry) - square / DEG) - 180) < 1e-9,
  'the Sentry\'s yaw is the line between them');

// 4. The steps and the wiring.
const ids = TRAINING_STEPS.map((step) => step.id);
const s9 = ids.slice(ids.indexOf('training.angle'), ids.indexOf('training.angle') + 2);
assert.deepEqual(s9, ['training.angle', 'training.volley'], 'S9: drive to F and angle (one card), take its fire');
const angle = TRAINING_STEPS.find((step) => step.id === 'training.angle');
assert.deepEqual({ ...angle.advance }, { on: 'angle', actor: sentry.specId, ...ANGLE_WINDOW, holdS: 2 }, 'the angle step holds the window 2 s');
assert.equal(angle.guide.angle.id, sentry.specId, 'and draws the arc against the Sentry');
assert.ok(angle.arrive && angle.guide.marker.x === F.x && angle.guide.marker.z === F.z, 'the angle counts only once at ring F');
assert.ok(!angle.cue, 'the Sentry holds its fire until the angle is set');
const volley = TRAINING_STEPS.find((step) => step.id === 'training.volley');
assert.equal(volley.cue, 'sentry', 'the volley step cues the Sentry');
assert.deepEqual([...volley.advance.kinds].sort(), ['nonpen', 'ricochet', 'spaced_absorb'], 'and counts the rounds the plate holds');
assert.equal(volley.advance.by, 'actor');
assert.equal(volley.advance.count, 2);
assert.ok(volley.penBody, 'a round through the plate brings the re-prompt');
const runner = readFileSync(new URL('../ui/tutorial/tutorialRunner.ts', import.meta.url), 'utf8');
assert.match(runner, /port\.cue\?\.\(cue, true\);\s*stepOff\.push\(\(\) => port\.cue\?\.\(cue, false\)\);/, 'the runner cues while the step shows, and stands it down after');
const state = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
assert.match(state, /else if \(training && entity\._provingMark && !entity\.combat\.destroyed\) driveTrainingActor\(game, entity\);/,
  'the solo step drives the training hulls');
assert.ok(!/Math\.random|Date\.now|performance\.now/.test(state.slice(state.indexOf('function driveTrainingActor'), state.indexOf('export function trainingThreatFor'))),
  'the shooter\'s controls read no clock and no random');

// 5. S10, hull down.
const sentry2 = trainingActor(TRAINING_RULES, 'sentry2');
const s2shell = TANK_SPECS[sentry2.specId].gun.shells.find((round) => round.type === sentry2.volley.shellType);
const G = TRAINING_POINTS.ringG;
const line = Math.atan2(sentry2.x - G.x, sentry2.z - G.z);
const s2verdict = (aim) => trainingThreatVerdicts({ x: sentry2.x, y: 0, z: sentry2.z },
  { pos: new Vector3(G.x, 0, G.z), yaw: line, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 },
  TANK_SPECS[TRAINING_RULES.loanerSpecId].armor, undefined, s2shell, { ...sentry2.volley, aim }, [0])[0];
assert.equal(s2verdict(sentry2.volley.aim), 'nopen', 'Sentry 2\'s round on the turret it aims at: red');
assert.equal(s2verdict(sentry.volley.aim), 'pen', 'and on the hull it cannot see: green (the berm is what saves it)');
const layout = planTrainingRange(TRAINING_RULES);
assert.equal(layout.course.stamps.length, TRAINING_RULES.earthworks.length, 'each earthwork stamped');
const overlay = createTerrainDeformation();
for (const stamp of layout.course.stamps) overlay.addCourse(stamp);
const ground = (x, z) => overlay.offsetAt(x, z);
const berm = TRAINING_RULES.earthworks[0];
assert.ok(Math.abs(ground(berm.x, berm.z) - 1.9) < 0.05, `the crest stands 1.9 m (${ground(berm.x, berm.z).toFixed(2)})`);
const toward = { x: Math.sin(line), z: Math.cos(line) };
const exposedAt = (back) => {
  const x = berm.x - toward.x * back, z = berm.z - toward.z * back;
  return trainingExposure({ x: sentry2.x, y: ground(sentry2.x, sentry2.z), z: sentry2.z }, { x, y: ground(x, z), z, yaw: line }, ground);
};
assert.deepEqual(trainingExposure({ x: sentry2.x, y: 0, z: sentry2.z }, { x: G.x, y: ground(G.x, G.z), z: G.z, yaw: line }, ground),
  { hull: false, turret: true }, 'at ring G: hull hidden, turret seen');
for (const back of [9, 10, 12, 14]) assert.deepEqual(exposedAt(back), { hull: false, turret: true }, `hull down ${back} m behind the crest`);
assert.equal(exposedAt(5).hull, true, 'the nose up the back slope shows the hull');
assert.equal(trainingExposure({ x: sentry2.x, y: 0, z: sentry2.z }, { x: G.x, y: 0, z: G.z, yaw: line }, () => 0).hull, true,
  'without the berm, the hull is seen');
const s10 = ids.slice(ids.indexOf('training.hullDown'), ids.indexOf('training.toP'));
assert.deepEqual(s10.filter((id) => !id.endsWith('Touch')), ['training.hullDown', 'training.hullDownFire', 'training.fireBack'],
  'S10: to ring G and hull down (one card), its rounds on the turret, APFSDS and fire back');
const hd = TRAINING_STEPS.find((step) => step.id === 'training.hullDown');
assert.deepEqual({ ...hd.advance }, { on: 'hullDown', actor: sentry2.specId, holdS: 2 });
assert.ok(hd.arrive && hd.guide.marker.x === G.x && hd.guide.marker.z === G.z, 'hull down counts only once at ring G');
assert.equal(TRAINING_STEPS.find((step) => step.id === 'training.hullDownFire').cue, 'sentry2', 'Sentry 2 fires once hull down');
assert.deepEqual({ ...TRAINING_STEPS.find((step) => step.id === 'training.fireBack').advance }, { on: 'destroy', actor: sentry2.specId });

// 6. S11.
const sentry3 = trainingActor(TRAINING_RULES, 'sentry3');
assert.ok(sentry3.entersOnCue, 'Sentry 3 stands parked until its scene cues it');
assert.ok(sentry3.volley.whenSeen, 'and fires only at what it sees');
assert.equal(trainingVolleyFires(sentry3.volley, 0, 60, false), false, 'never at a tank out of its sight');
assert.equal(trainingVolleyFires(sentry3.volley, 0, 60, true), true, 'at one in it, once its telegraph has run');
const P = TRAINING_POINTS.ringP, Q = TRAINING_POINTS.ringQ;
const s3eye = { x: sentry3.x, y: ground(sentry3.x, sentry3.z), z: sentry3.z };
const facing = Math.atan2(sentry3.x - P.x, sentry3.z - P.z);
// the peek: the hull alongside the wall, its nose toward Q, at the cover spot and at the peek spot
const along = Math.atan2(Q.x - P.x, Q.z - P.z);
for (const yaw of [facing, along]) {
  const atP = trainingExposure(s3eye, { x: P.x, y: ground(P.x, P.z), z: P.z, yaw }, ground);
  assert.deepEqual(atP, { hull: false, turret: false }, `behind the wall at ring P the whole tank is hidden (yaw ${(yaw / DEG).toFixed(0)})`);
  const atQ = trainingExposure(s3eye, { x: Q.x, y: ground(Q.x, Q.z), z: Q.z, yaw }, ground);
  assert.ok(atQ.hull && atQ.turret, `out at ring Q, seen (yaw ${(yaw / DEG).toFixed(0)})`);
}
assert.ok(trainingExposure(s3eye, { x: P.x, y: 0, z: P.z, yaw: facing }, () => 0).hull, 'without the wall, ring P is in its sight');
const s11 = ids.slice(ids.indexOf('training.toP'), ids.indexOf('training.repair'));
assert.equal(new Set(ids).size, ids.length, 'every training step id is unique');
assert.deepEqual(s11, ['training.toP', 'training.peekShoot'], 'S11: into cover, then peek, shoot and hide until it is destroyed');
const peek = TRAINING_STEPS.find((step) => step.id === 'training.peekShoot');
assert.deepEqual({ ...peek.advance }, { on: 'destroy', actor: sentry3.specId });
assert.equal(peek.cue, 'sentry3', 'the peek step brings Sentry 3 in and lets it fire');
assert.ok(peek.guide.reload && peek.penBody, 'with its reload ring, and a re-prompt when it catches the player out');
assert.match(state, /if \(!isPlayer && game\.ruleset\.training\) parkTrainingActor\(game, entity\);/, 'the setup parks a hull that enters on its cue');
assert.match(state, /if \(entity && game\._trainingParked\?\.has\(entity\.id\)\) \{\s*game\._trainingParked\.delete\(entity\.id\);\s*entity\.modeActive = true;/, 'its first cue brings it in');

// 7. S12.
const sentry4 = trainingActor(TRAINING_RULES, 'sentry4');
assert.ok(sentry4.entersOnCue && sentry4.volley.shellType === 'HE', 'Sentry 4: parked, firing HE');
assert.ok(TANK_SPECS[sentry4.specId].gun.shells.some((round) => round.type === 'HE'), 'from its own rack');
const Qpose = { x: Q.x, y: 0, z: Q.z, yaw: 0 };
const leftAim = trainingVolleyAim(Qpose, sentry4.volley, { x: 0, y: 0, z: 0 }, { x: Q.x + 50, z: Q.z });
const rightAim = trainingVolleyAim(Qpose, sentry4.volley, { x: 0, y: 0, z: 0 }, { x: Q.x - 50, z: Q.z });
assert.ok(leftAim.x - Q.x > 1.4 && Q.x - rightAim.x > 1.4 && Math.abs(leftAim.y - 0.45) < 1e-9, 'it aims low on the side the hull shows it');
const s12 = ids.slice(ids.indexOf('training.repair'), ids.indexOf('training.toU')).filter((id) => !id.endsWith('Touch'));
assert.deepEqual(s12, ['training.repair', 'training.smoke'], 'S12 (keyboard): out to ring Q and repair the track (one card), smoke');
const repair = TRAINING_STEPS.find((step) => step.id === 'training.repair');
assert.equal(repair.cue, 'sentry4', 'Sentry 4 fires only while the repair step shows');
assert.ok(repair.arrive && repair.guide.marker.x === Q.x && repair.guide.marker.z === Q.z, 'from ring Q');
assert.deepEqual({ ...repair.advance }, { on: 'consumable', item: 'repair' }, 'until the repair kit is used');

// 8. S13.
const bulwark = trainingActor(TRAINING_RULES, 'bulwark');
const heavy = TANK_SPECS[bulwark.specId];
const loanerAp = TANK_SPECS[TRAINING_RULES.loanerSpecId].gun.shells.find((round) => round.type === 'APFSDS');
const faceShare = (sideDeg) => {
  const pose = { pos: new Vector3(0, 0, 0), yaw: sideDeg * DEG, visualPitch: 0, visualRoll: 0, turretYaw: -sideDeg * DEG, gunPitch: 0 };
  const count = { pen: 0, marginal: 0, nopen: 0, n: 0 };
  const span = sideDeg ? heavy.dims.hullLengthM : heavy.dims.widthM;
  for (let a = -0.4; a <= 0.41; a += 0.1) for (let h = 0.15; h <= 0.96; h += 0.1) {
    const from = new Vector3(0, 2.4, 120), to = new Vector3(a * span, h * heavy.dims.heightM, 0);
    const dir = to.clone().sub(from); const len = dir.length(); dir.normalize();
    const info = aimArmorAlong(from, dir, len + 20, pose, heavy.armor, undefined, {});
    if (info) { count.n++; count[penVerdict(aimPenRatio(loanerAp, info))]++; }
  }
  return { red: count.nopen / count.n, green: count.pen / count.n };
};
const front = faceShare(0), side = faceShare(90);
assert.ok(front.red >= 0.7, `Bulwark's front mostly red to the loaner's APFSDS (${Math.round(front.red * 100)} %)`);
assert.ok(side.green >= 0.75, `its side mostly green (${Math.round(side.green * 100)} %)`);
assert.ok(Math.abs(trainingTraverse(0, Math.PI / 2, 1, 8) - 8 * DEG) < 1e-9, 'its turret turns 8 degrees in a second');
assert.ok(Math.abs(trainingTraverse(0, 2 * DEG, 1, 8) - 2 * DEG) < 1e-9, 'and stops on its mark');
const hullYaw = trainingActorYawDeg(bulwark) * DEG;
const bearingTo = (p) => Math.atan2(p.x - bulwark.x, p.z - bulwark.z);
const offNose = (p) => Math.abs(Math.atan2(Math.sin(bearingTo(p) - hullYaw), Math.cos(bearingTo(p) - hullYaw))) / DEG;
const U = TRAINING_POINTS.ringU, V = TRAINING_POINTS.ringV;
assert.ok(Math.abs(offNose(U) - 45) < 2, `ring U 45 degrees off its nose (${offNose(U).toFixed(1)})`);
assert.ok(Math.abs(offNose(V) - 90) < 3, `ring V at its side (${offNose(V).toFixed(1)})`);
for (const [name, p] of [['U', U], ['V', V]]) {
  assert.equal(trainingArcAllows(bulwark.volley, hullYaw, bearingTo(p), bearingTo(p)), false, `no fire at ring ${name}, outside its arc`);
}
const ahead = { x: bulwark.x + Math.sin(hullYaw) * 80, z: bulwark.z + Math.cos(hullYaw) * 80 };
assert.equal(trainingArcAllows(bulwark.volley, hullYaw, bearingTo(ahead), bearingTo(ahead)), true, 'fire in front of it, its gun on the player');
assert.equal(trainingArcAllows(bulwark.volley, hullYaw, bearingTo(ahead) + 5 * DEG, bearingTo(ahead)), false, 'not while its gun is still turning');
const s13 = ids.slice(ids.indexOf('training.toU'), ids.indexOf('training.fight'));
assert.deepEqual(s13, ['training.toU', 'training.flank'], 'S13: its front from ring U, then round to ring V and through its side');
const flank = TRAINING_STEPS.find((step) => step.id === 'training.flank');
assert.ok(flank.arrive && flank.guide.marker.x === V.x && flank.guide.marker.z === V.z, 'from ring V');
assert.deepEqual({ ...flank.advance }, { on: 'destroy', actor: bulwark.specId }, 'until Bulwark is destroyed');

// 9. S14.
const roster = trainingRoster(TRAINING_RULES);
const skirmish = TRAINING_RULES.skirmish;
assert.deepEqual(roster, [...TRAINING_RULES.actors.map((a) => a.specId), ...skirmish.allies.map((b) => b.specId), ...skirmish.enemies.map((b) => b.specId)],
  'the roster: the actors, then the allies, then the enemies');
assert.equal(new Set(roster).size, roster.length, 'each its own tank');
assert.ok(!roster.includes(TRAINING_RULES.loanerSpecId), 'none the loaner');
for (const id of roster) assert.ok(TANK_SPECS[id], `${id} is a fleet tank`);
assert.equal(planTrainingRange(TRAINING_RULES).lanes.length, roster.length, 'a mark for each, in roster order');
const lastLane = planTrainingRange(TRAINING_RULES).lanes.at(-1);
assert.ok(Math.abs(lastLane.x - skirmish.enemies.at(-1).x) < 1e-9 && Math.abs(lastLane.z - skirmish.enemies.at(-1).z) < 1e-9, 'the last mark the last enemy\'s');
const trainingRules = matchRulesetFor('training');
assert.equal(trainingRules.allies, skirmish.allies.length, 'the ruleset fields the allies');
assert.equal(trainingRules.enemies, TRAINING_RULES.actors.length + skirmish.enemies.length, 'and the actors with the enemies');
const fakes = roster.map((specId) => ({ id: specId, specId, spec: TANK_SPECS[specId] }));
assert.deepEqual(splitBattleAllies(fakes, { playerSpecId: TRAINING_RULES.loanerSpecId, randomBattle: true, ruleset: trainingRules,
  campaignOperationId: null, nationalAllyIds: null }).map((e) => e.specId), skirmish.allies.map((b) => b.specId), 'the ally split takes the allies alone');
assert.equal(trainingSkirmishSide(TRAINING_RULES, skirmish.enemies[0].specId), 'enemy');
assert.equal(trainingSkirmishSide(TRAINING_RULES, sentry.specId), null);
const fight = TRAINING_STEPS.find((step) => step.id === 'training.fight');
assert.equal(fight.cue, TRAINING_SKIRMISH_CUE, 'the fight step brings the skirmish in');
assert.deepEqual([...fight.advance.actors], skirmish.enemies.map((b) => b.specId), 'and ends when every enemy bot is down');
assert.equal(ids.at(-1), 'training.fight', 'the chapter (and the battle) closes on the fight');
assert.match(state, /if \(!isPlayer && context\.provingLayout && !skirmishBot\) seatProvingTarget\(context, entity, spawn\);/, 'skirmish bots get brains, not marks');
assert.match(state, /if \(rules && key === TRAINING_SKIRMISH_CUE\)/, 'its cue brings every bot in');
// (Main: the training rows alone move; every other mode's limits and field as main e5e937cb71 has them)
const pinned = JSON.parse(readFileSync(new URL('../../tools/fixtures/training-other-mode-limits.json', import.meta.url), 'utf8'));
const { TEAM_ARRANGEMENT_LIMITS } = await import('./matchRuleset.ts');
assert.equal(TEAM_ARRANGEMENT_LIMITS.field, pinned.field, 'the field limit unchanged');
assert.deepEqual([...TEAM_ARRANGEMENT_LIMITS.waveSize], pinned.waveSize, 'the wave size unchanged');
const otherModes = Object.keys(TEAM_ARRANGEMENT_LIMITS.allies).filter((mode) => mode !== 'training').sort();
assert.deepEqual(otherModes, Object.keys(pinned.modes), 'the same modes');
for (const mode of otherModes) {
  const ruleset = matchRulesetFor(mode);
  assert.deepEqual({ allies: [...TEAM_ARRANGEMENT_LIMITS.allies[mode]], enemies: [...TEAM_ARRANGEMENT_LIMITS.enemies[mode]],
    rulesetAllies: ruleset.allies ?? null, rulesetEnemies: ruleset.enemies ?? null, respawnS: ruleset.respawnS ?? null }, pinned.modes[mode],
  `${mode}: its limits and field unchanged`);
}

// 10. The battle's life.
for (const key of ['sentry2', 'sentry3', 'bulwark']) assert.equal(trainingRespawns(TRAINING_RULES, trainingActor(TRAINING_RULES, key).specId), false, `${key} stays down`);
for (const key of ['target1', 'target2', 'sentry', 'sentry4']) assert.equal(trainingRespawns(TRAINING_RULES, trainingActor(TRAINING_RULES, key).specId), true, `${key} comes back`);
for (const bot of [...skirmish.allies, ...skirmish.enemies]) assert.equal(trainingRespawns(TRAINING_RULES, bot.specId), false, `${bot.specId} (the skirmish) stays down`);
assert.equal(trainingRespawns(TRAINING_RULES, TRAINING_RULES.loanerSpecId), true, 'the player comes back');
const modes = readFileSync(new URL('./matchModes.ts', import.meta.url), 'utf8');
assert.match(modes, /respawns = \(\) => true,/, 'the controller keeps every hull\'s respawn unless its host says otherwise');
assert.match(modes, /if \(ruleset\.respawnS != null && respawns\(entity\)\) respawnAt\.set/, 'and asks the host per hull');
assert.equal((modes.match(/respawns\(entity\)/g) ?? []).length, 1, 'in one place');
assert.match(state, /\.\.\.\(game\.ruleset\.training \? \{ respawns: \(ent: SoloEntity\) => trainingRespawns\(game\.ruleset\.training!, ent\.specId\) \} : \{\}\),/,
  'only the solo training host passes it');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
assert.ok(!/respawns:/.test(authority), 'the authority keeps the shared rule');
assert.match(state, /const checkpoint = game\.ruleset\.training && ent\.isPlayer \? game\._trainingCheckpoint : null;/, 'the training player revives at the checkpoint');
assert.match(state, /game\._trainingCues = undefined;\s*game\._trainingGunYaw = undefined;\s*game\._trainingCheckpoint = null;/, 'each battle starts its scenes clean');
const { finishTrainingBattle, setTrainingCheckpoint } = await import('../game/state.ts');
const ended = [];
const fakeGame = { ruleset: { training: TRAINING_RULES }, result: null, resultReason: null, player: { state: { yaw: 1.25 } },
  matchModeController: { matchEnded: (winner, reason) => ended.push([winner, reason]) } };
assert.equal(setTrainingCheckpoint(fakeGame, 10, 20), true);
assert.deepEqual(fakeGame._trainingCheckpoint, { x: 10, z: 20, yaw: 1.25 }, 'a ring reached, with the hull\'s heading then');
assert.equal(finishTrainingBattle(fakeGame), true, 'the chapter complete ends the battle');
assert.deepEqual([fakeGame.result, fakeGame.resultReason, ended], ['victory', 'training_complete', [['alpha', 'training_complete']]]);
assert.equal(finishTrainingBattle(fakeGame), false, 'once');
assert.equal(finishTrainingBattle({ ruleset: {}, result: null }), false, 'and only a training battle');
// (the whole-chapter walk, 2026-11-18: the controller's start put every hull on the field, so the skirmish fought from
// S1 on; the solo host keeps a parked hull off until its cue)
assert.match(state, /setActive\(modeEntity, active\) \{ trainingHostSetActive\(game, modeEntity, active\); \},/, 'the solo host answers setActive by the training rule');
// the exact failure, on a real mode controller: the hulls seated and parked, then the controller is built (its
// construction writes modeActive = true on every hull, no setActive) and steps (its setLife answers through setActive).
// The old host (no hold after the construction, modeActive = active) leaves the hull unparked; the training host (the hold
// after construction, the parked-aware setActive) keeps it off until its cue, and on after it.
{
  const { createMatchModeController } = await import('./matchModes.ts');
  const { trainingHostSetActive, trainingHoldParked } = await import('../game/state.ts');
  const hull = (id, team, x) => ({ id, team, bot: team === 'bravo', state: { pos: { x, y: 0, z: 0 }, yaw: 0, speed: 0 },
    combat: { hp: 100, maxHp: 100, destroyed: false, ammo: [10], ammoCapacity: [10] } });
  const start = (setActive, hold = () => {}) => {
    const player = hull('player', 'alpha', 0), parked = hull('parked', 'bravo', 200), live = hull('live', 'bravo', 300);
    parked.modeActive = false;
    const match = createMatchModeController({ mode: 'training', ruleset: matchRulesetFor('training'), entities: [player, parked, live],
      seed: 27301, terrainHeight: () => 0, setActive, revive() {} });
    hold([player, parked, live]);
    for (let tick = 1; tick <= 120; tick++) match.step(1 / 60, tick / 60);
    return { match, parked, live };
  };
  const old = start((target, active) => { target.modeActive = active; });
  assert.notEqual(old.parked.modeActive, false, 'the failure as the walk met it: the controller\'s start unparks a hull under the old host');
  const parkedSet = { _trainingParked: new Set(['parked']) };
  const run = start((target, active) => trainingHostSetActive(parkedSet, target, active), (all) => trainingHoldParked(parkedSet, all));
  assert.match(state, /\}\);\s*\/\/ the controller's construction puts every hull on the field outright[\s\S]{0,200}trainingHoldParked\(game, game\.tanks\);/,
    'the solo setup holds the parked hulls right after the controller is built');
  assert.equal(run.parked.modeActive, false, 'under the training rule the parked hull stays off through the controller\'s start and 120 steps');
  assert.notEqual(run.live.modeActive, false, 'and a hull that was never parked stands on the field');
  parkedSet._trainingParked.delete('parked');
  run.parked.modeActive = true; // its cue (game/state.ts cueTrainingActor)
  for (let tick = 121; tick <= 240; tick++) run.match.step(1 / 60, tick / 60);
  assert.equal(run.parked.modeActive, true, 'released by its cue, it stays on');
}
assert.match(state, /\(game\._trainingParked \?\?= new Set\(\)\)\.add\(entity\.id\);/, 'parking records the hull');
assert.equal((state.match(/game\._trainingParked\.delete\(entity\.id\);/g) ?? []).length, 2, 'and only a cue releases it (an actor\'s, the skirmish\'s)');
assert.ok(state.indexOf('game._trainingParked = undefined;') < state.indexOf('spawnBattleEntities(spawnContext);'), 'cleared before each battle seats its hulls');
const runner2 = readFileSync(new URL('../ui/tutorial/tutorialRunner.ts', import.meta.url), 'utf8');
assert.match(runner2, /port\.checkpoint\?\.\(marker\.x, marker\.z\);\s*reached\(\);/, 'each ring reached (a drive, or a step that asks for its ring first) is the checkpoint');
const access = readFileSync(new URL('../app/tutorialAccess.ts', import.meta.url), 'utf8');
assert.match(access, /if \(chapter === 'training'\) \{\s*if \(outcome !== 'skipped' && training\) \{[\s\S]{0,160}deps\.trainingComplete\(\);/,
  'the last card ends the battle (a Skip ends the run only)');

console.log(`trainingThreat.selftest: PASS (the Sentry ${range.toFixed(0)} m from F; its HEAT on the loaner's plate amber nose on, red ${ANGLE_WINDOW.minDeg - 2} to ${ANGLE_WINDOW.maxDeg + 2} degrees either way, green at 75; S9's steps and wiring; S10: Sentry 2 red on the turret, green on the hull, hull down at ring G behind the 1.9 m berm; S11: hidden at P behind the 2.8 m wall, seen at Q, Sentry 3 parked until cued; S12: Sentry 4's HE on the running gear; S13: Bulwark ${Math.round(front.red * 100)} % red in front, ${Math.round(side.green * 100)} % green at its side; S14: ${skirmish.allies.length} allied and ${skirmish.enemies.length} enemy bots, parked until the fight; goals stay down, the player back at the last ring, the last card ends the battle)`);
