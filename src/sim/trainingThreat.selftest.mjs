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
//     line to ring Q; the step waits for either track hit and stands it down, then the repair kit, the kit row and smoke.
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
const s9 = ids.slice(ids.indexOf('training.toF'), ids.indexOf('training.toF') + 3);
assert.deepEqual(s9, ['training.toF', 'training.angle', 'training.volley'], 'S9: drive to F, angle, take its fire');
const angle = TRAINING_STEPS.find((step) => step.id === 'training.angle');
assert.deepEqual({ ...angle.advance }, { on: 'angle', actor: sentry.specId, ...ANGLE_WINDOW, holdS: 2 }, 'the angle step holds the window 2 s');
assert.equal(angle.guide.angle.id, sentry.specId, 'and draws the arc against the Sentry');
assert.ok(!angle.cue, 'the Sentry holds its fire until the angle is set');
const volley = TRAINING_STEPS.find((step) => step.id === 'training.volley');
assert.equal(volley.cue, 'sentry', 'the volley step cues the Sentry');
assert.deepEqual([...volley.advance.kinds].sort(), ['nonpen', 'ricochet', 'spaced_absorb'], 'and counts the rounds the plate holds');
assert.equal(volley.advance.by, 'actor');
assert.equal(volley.advance.count, 2);
assert.ok(volley.penBody, 'a round through the plate brings the re-prompt');
const runner = readFileSync(new URL('../ui/tutorial/tutorialRunner.ts', import.meta.url), 'utf8');
assert.match(runner, /port\.cue\?\.\(cue, true\);\s*stepOff\.push\(\(\) => port\.cue\?\.\(cue, false\)\);/, 'the runner cues while the step shows, and stands it down after');
assert.match(runner, /if \(advance\.on === 'camera' && advance\.freeLook && port\.view\?\.\(\)\?\.freeLookAvailable === false\)/,
  'a free-look step moves on by itself where the game has no free look (cursor aim, a virtual stick)');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /freeLookAvailable: !input\.isCursorAim\(\) && !input\.virtualActive\(\),/, 'read as the game gates it (playerFrameInput.ts)');
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
const s10 = ids.slice(ids.indexOf('training.toG'), ids.indexOf('training.toP'));
assert.deepEqual(s10.filter((id) => !id.endsWith('Touch')), ['training.toG', 'training.hullDown', 'training.hullDownFire', 'training.fireBack'],
  'S10: behind the berm, hull down, its rounds on the turret, fire back');
const hd = TRAINING_STEPS.find((step) => step.id === 'training.hullDown');
assert.deepEqual({ ...hd.advance }, { on: 'hullDown', actor: sentry2.specId, holdS: 2 });
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
const s11 = ids.slice(ids.indexOf('training.toP'), ids.indexOf('training.toKit'));
assert.equal(new Set(ids).size, ids.length, 'every training step id is unique');
assert.deepEqual(s11, ['training.toP', 'training.peekShoot', 'training.finish3'], 'S11: into cover, peek twice, finish it');
const peek = TRAINING_STEPS.find((step) => step.id === 'training.peekShoot');
assert.deepEqual({ ...peek.advance }, { on: 'peek', actor: sentry3.specId, cycles: 2 });
assert.equal(peek.cue, 'sentry3', 'the peek step brings Sentry 3 in and lets it fire');
assert.ok(peek.guide.reload && peek.penBody, 'with its reload ring, and a re-prompt when it catches the player out');
assert.match(state, /if \(!isPlayer && game\.ruleset\.training\) parkTrainingActor\(game, entity\);/, 'the setup parks a hull that enters on its cue');
assert.match(state, /if \(entity && entity\.modeActive === false\) \{\s*entity\.modeActive = true;/, 'its first cue brings it in');

// 7. S12.
const sentry4 = trainingActor(TRAINING_RULES, 'sentry4');
assert.ok(sentry4.entersOnCue && sentry4.volley.shellType === 'HE', 'Sentry 4: parked, firing HE');
assert.ok(TANK_SPECS[sentry4.specId].gun.shells.some((round) => round.type === 'HE'), 'from its own rack');
const Qpose = { x: Q.x, y: 0, z: Q.z, yaw: 0 };
const leftAim = trainingVolleyAim(Qpose, sentry4.volley, { x: 0, y: 0, z: 0 }, { x: Q.x + 50, z: Q.z });
const rightAim = trainingVolleyAim(Qpose, sentry4.volley, { x: 0, y: 0, z: 0 }, { x: Q.x - 50, z: Q.z });
assert.ok(leftAim.x - Q.x > 1.4 && Q.x - rightAim.x > 1.4 && Math.abs(leftAim.y - 0.45) < 1e-9, 'it aims low on the side the hull shows it');
const s12 = ids.slice(ids.indexOf('training.toKit')).filter((id) => !id.endsWith('Touch'));
assert.deepEqual(s12, ['training.toKit', 'training.trackHit', 'training.repair', 'training.kitRow', 'training.smoke'], 'S12 (keyboard)');
const trackHit = TRAINING_STEPS.find((step) => step.id === 'training.trackHit');
assert.equal(trackHit.cue, 'sentry4', 'Sentry 4 fires only while the track step shows');
assert.deepEqual({ ...trackHit.advance, module: [...trackHit.advance.module], state: [...trackHit.advance.state] },
  { on: 'module', module: ['trackL', 'trackR'], state: ['yellow', 'red'] }, 'either track, damaged or broken');

console.log(`trainingThreat.selftest: PASS (the Sentry ${range.toFixed(0)} m from F; its HEAT on the loaner's plate amber nose on, red ${ANGLE_WINDOW.minDeg - 2} to ${ANGLE_WINDOW.maxDeg + 2} degrees either way, green at 75; S9's steps and wiring; S10: Sentry 2 red on the turret, green on the hull, hull down at ring G behind the 1.9 m berm; S11: hidden at P behind the 2.8 m wall, seen at Q, Sentry 3 parked until cued; S12: Sentry 4's HE on the running gear)`);
