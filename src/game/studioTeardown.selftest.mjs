// studioTeardown.selftest.mjs — the Studio's teardown runs every step, whatever an earlier one throws (round 3 A7: U28's
// declared fall driver x the Studio's teardown). Runs studio.ts's own tearDownStudio and crush plan (syncCrushPlan,
// advanceCrushes, releaseCrushes) over a battlefield whose felled trees are real (felledTrees.ts behind the page world's
// seams). The Studio's playback hands the felled trees' falls to its timeline (studioCrush.ts setPlan: 'timeline');
// releaseCrushes gives them back ('frame'). tearDownStudio ran four steps that can throw before it (the build plate, a
// recording's stop, the flare's clock, the panel's hide): one throw left the cached battlefield on the timeline driver, so
// every later battle's felled trees opened their collision but never fell, and left the Studio owning the frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createObstacleGrid, setCircleShape } from '../world/collision.ts';
import { createFelledTrees } from '../world/felledTrees.ts';
import { createStudioCrushes, planStudioCrushes } from './studioCrush.ts';
import { createStudioSession } from './studioSession.ts';

const studioSource = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', studioSource, ts.ScriptTarget.Latest, true);
// (and the exit's whole teardown around it: leaveForGarage, tearDownToGarage)
const names = new Set(['crushPlanCurrent', 'syncCrushPlan', 'advanceCrushes', 'releaseCrushes', 'tearDownStudio', 'leaveForGarage',
  'tearDownToGarage']);
const nodes = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) nodes.push(node);
  ts.forEachChild(node, visit);
})(source);
assert.equal(nodes.length, names.size, 'studio.ts declares its crush plan and its teardown');
// the state the functions keep and write, declared beside them as in studio.ts; every other name they read is a port below
const STATE = ['crushes', 'crushStoryboard', 'crushWorld', 'crushSpecs', 'pressHulls', 'entering', 'buildPlateUp', 'active',
  'recording', 'placeArmed', 'dragActor', 'dragging', 'timeScale', 'storyboard', 'selectedShotId', 'shotUidSeq', 'actorKeyUidSeq',
  'closing'];
const free = new Set(), called = new Set(), declared = new Set();
const visitNames = (node) => {
  if (ts.isTypeNode(node)) return;
  if (ts.isIdentifier(node)) {
    const parent = node.parent;
    const declares = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent)
      || ts.isFunctionExpression(parent) || ts.isBindingElement(parent)) && parent.name === node;
    const key = (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent))
      && parent.name === node;
    if (declares) declared.add(node.text);
    else if (!key && !ts.isBindingElement(parent)) free.add(node.text);
    if (ts.isCallExpression(parent) && parent.expression === node) called.add(node.text);
  }
  ts.forEachChild(node, visitNames);
};
nodes.forEach(visitNames);
for (const name of [...free]) if (declared.has(name) || STATE.includes(name) || name in globalThis) free.delete(name);

const pose = (m) => m.elements.map((v) => v.toFixed(9)).join();
/** A battlefield with one tree on the hull's lane (z = 10) and its real felled-tree owner. */
function battlefield() {
  const tree = { x: 0, z: 10, mat: new THREE.Matrix4().makeTranslation(0, 0, 10), fallH: 8, fallR: 0.3 };
  const record = setCircleShape({ min: [-0.3, 0, 9.7], max: [0.3, 8, 10.3], crushable: true, treeIdx: 0, kind: 'tree' }, 0, 10, 0.3);
  const felled = createFelledTrees({ trees: [tree], records: [record], concealers: [], heightField: { getHeightAt: () => 0 },
    write() {}, poseChanged() {}, standingChanged() {} });
  return {
    tree, record, felled, sweeps: true, upright: pose(tree.mat),
    queryObstacles: createObstacleGrid([record]), crushables: [],
    update: (dt) => felled.advance(dt, 'frame'), // the frame's update (vegetation.ts update)
    advanceToppledVegetation: (dt) => felled.advance(dt, 'timeline'),
    advanceDestruction: (dt) => felled.advance(dt, 'timeline'),
    crushObstacle: (ob, dx, dz, _speed, _cause, options) => felled.fell(ob, dx, dz, options?.settled),
    crushProp: () => false,
    resetDestructibles: () => felled.restoreAll(),
    setCrushSweeps(on) { this.sweeps = on; },
    setFallDriver: (driver) => felled.setDriver(driver),
  };
}

const failure = (step) => Object.assign(new Error(`${step} failed`), { step });
/** The Studio, open, its hull's track over the tree; `breaks` names the teardown step that throws. */
function makeStudio(breaks) {
  const calls = [];
  let current = null;
  const noop = () => {};
  const session = createStudioSession();
  session.open(session.beginEntry());
  const ports = {
    // one hull on a track up the lane at 9 m/s: its nose meets the tree at about 690 ms
    DEG: Math.PI / 180, actors: [{ spec: { dims: { hullLengthM: 7 } } }],
    actorTrackFor: () => ({ keys: [] }),
    sampleActorTrack: (_keys, tMs, out) => { out.x = 0; out.z = 9 * tMs / 1000; out.facingDeg = 0; return true; },
    tankContactRect: () => ({ halfLength: 3.5, halfWidth: 1.8, centerX: 0, centerZ: 0 }),
    _crushSample: {}, planStudioCrushes, pressBetween: noop, PRESS_STEP_MS: 1000 / 60, getWorld: () => current, crushBurst: noop,
    // the teardown's parts; the one named by `breaks` throws
    panel: {
      setStage: () => { if (breaks === 'setStage') throw failure('setStage'); calls.push('plate-off'); },
      hide: () => { if (breaks === 'hide') throw failure('hide'); calls.push('panel-hidden'); },
    },
    stopRecording: () => { if (breaks === 'stopRecording') throw failure('stopRecording'); calls.push('recording-stopped'); },
    flareToWallClock: () => { if (breaks === 'flareToWallClock') throw failure('flareToWallClock'); },
    clearActors: () => { if (breaks === 'clearActors') throw failure('clearActors'); calls.push('actors-cleared'); },
    marker: { group: { visible: true } }, keys: new Set(), shells: [], effectLog: [], activeEffectIds: new Set(),
    fx: { resetAll: () => calls.push('fx-reset'), setFrozen: noop }, studioStages: new Map(),
    resetStudioGround: () => calls.push('ground-reset'), releaseStudioFx: () => calls.push('studio-fx-released'),
    camera: { rotation: { z: 0.2 } }, cam: { roll: 0.2 }, normalizeStoryboard: () => ({ durationMs: 12000, shots: [] }),
    rail: { rebuild: noop, updateVisibility: noop }, disposePicture: () => calls.push('picture-disposed'), unsweepPool: noop,
    ctx: { restoreStudioAtmosphere: () => calls.push('atmosphere-restored'), restoreGarageWorld: () => calls.push('garage-world') },
    // the exit's parts around the Studio's half: its session (open), a film left open, the Garage's return
    session, filmRenderer: { active: breaks === 'endFilm' },
    endFilm: () => { if (breaks === 'endFilm') throw failure('endFilm'); calls.push('film-closed'); },
    enterGarage: async () => calls.push('enter-garage'), syncRoute: noop, docBrand: noop,
  };
  for (const name of free) if (!(name in ports)) ports[name] = called.has(name) ? noop : undefined;
  const code = stripTypeScriptTypes(`
    function make(ports, createStudioCrushes) {
      const { ${Object.keys(ports).join(',')} } = ports;
      const crushes = createStudioCrushes();
      let crushStoryboard = null, crushWorld = null;
      const crushSpecs = [], pressHulls = [];
      let entering = null, buildPlateUp = true, active = true, recording = { stopping: false }, placeArmed = 'leo2a4';
      let dragActor = null, dragging = false, timeScale = 0, storyboard = { durationMs: 3000 }, selectedShotId = 'shot-1';
      let shotUidSeq = 4, actorKeyUidSeq = 9, closing = null;
      ${nodes.map((node) => node.getText(source)).join('\n')}
      return { advanceCrushes, tearDownStudio, leaveForGarage, get active() { return active; }, get timeScale() { return timeScale; } };
    }
  `);
  const studio = new Function('ports', 'createStudioCrushes', `${code}\nreturn make(ports, createStudioCrushes);`)(ports, createStudioCrushes);
  return { studio, calls, ports, session, setWorld: (world) => { current = world; } };
}

// A throw in any step before the crushes' release (and one after it): the battlefield's felled trees are the frame's
// again, its sweeps on and its tree standing; the Studio no longer owns the frame; the rest of the teardown ran (the
// battlefield's own light last); and the failure still surfaces for the exit's catch.
for (const breaks of ['setStage', 'stopRecording', 'flareToWallClock', 'hide', 'clearActors']) {
  const h = makeStudio(breaks);
  const world = battlefield();
  h.setWorld(world);
  h.studio.advanceCrushes(0, 1000); // playback over the overrun: the tree falls on the Studio's timeline
  assert.equal(world.felled.driver, 'timeline', `(${breaks}) the Studio's battlefield: the timeline drives its falls`);
  assert.ok(world.tree.crushed && !world.sweeps, `(${breaks}) the overrun felled the tree, the sweeps off`);
  let thrown = null;
  try { h.studio.tearDownStudio(); } catch (error) { thrown = error; }
  assert.equal(thrown?.step, breaks, `(${breaks}) the teardown still reports the step that failed`);
  assert.equal(world.felled.driver, 'frame', `(${breaks}) the battlefield's falls are its frame's again`);
  assert.ok(world.sweeps && !world.tree.crushed && pose(world.tree.mat) === world.upright, `(${breaks}) its sweeps on, its tree standing`);
  assert.equal(h.studio.active, false, `(${breaks}) the Studio no longer owns the frame`);
  for (const after of ['actors-cleared', 'fx-reset', 'ground-reset', 'studio-fx-released', 'picture-disposed', 'atmosphere-restored']) {
    if (after === 'actors-cleared' && breaks === 'clearActors') continue;
    assert.ok(h.calls.includes(after), `(${breaks}) the rest of the teardown ran: ${after}`);
  }
  assert.equal(h.calls.at(-1), 'atmosphere-restored', `(${breaks}) the battlefield's own light is still the last step`);
  assert.equal(h.studio.timeScale, 1, `(${breaks}) the clock is the game's again`);
  // the next battle on it: a hull fells the tree, and its fall moves with the frame
  world.crushObstacle(world.record, 0, 1);
  world.update(1 / 60);
  assert.notEqual(pose(world.tree.mat), world.upright, `(${breaks}) the next battle's felled tree falls with the frame`);
}
// (no throw) the teardown as before: every step, nothing reported
{
  const h = makeStudio(null);
  const world = battlefield();
  h.setWorld(world);
  h.studio.advanceCrushes(0, 1000);
  h.studio.tearDownStudio();
  assert.equal(world.felled.driver, 'frame');
  assert.deepEqual(h.calls, ['plate-off', 'recording-stopped', 'panel-hidden', 'actors-cleared', 'fx-reset', 'ground-reset',
    'studio-fx-released', 'picture-disposed', 'atmosphere-restored'], 'every step, in its order');
}

// The exit's whole teardown (leaveForGarage): a film left open that will not close (endFilm before the Studio's half) stops
// none of it; and for a failed entry whose scene the Garage already took back (returnToGarage false), the Garage's
// presentation of the battlefield comes back even when the Studio's half failed. Each ran after the step that threw only
// when nothing threw.
{
  const h = makeStudio('endFilm');
  const world = battlefield();
  h.setWorld(world);
  h.studio.advanceCrushes(0, 1000);
  h.session.beginExit();
  const left = await h.studio.leaveForGarage().then(() => 'resolved', (error) => error?.step ?? 'rejected');
  assert.equal(left, 'resolved', '(endFilm) the exit goes on past a film that will not close');
  assert.equal(world.felled.driver, 'frame', '(endFilm) the battlefield\'s falls are its frame\'s again');
  assert.equal(h.studio.active, false, '(endFilm) the Studio lets the frame go');
  assert.ok(h.calls.includes('enter-garage'), '(endFilm) the Garage returns');
  assert.equal(h.session.phase, 'closed', '(endFilm) the session closes');
}
for (const breaks of ['setStage', 'hide', 'clearActors']) {
  const h = makeStudio(breaks);
  const world = battlefield();
  h.setWorld(world);
  h.studio.advanceCrushes(0, 1000);
  h.session.beginExit();
  const left = await h.studio.leaveForGarage(false).then(() => 'resolved', (error) => error?.step ?? 'rejected');
  assert.equal(left, breaks, `(${breaks}, handed back) the failure still surfaces`);
  assert.equal(world.felled.driver, 'frame', `(${breaks}, handed back) the battlefield's falls are its frame's again`);
  assert.ok(h.calls.includes('garage-world'), `(${breaks}, handed back) the Garage's presentation comes back`);
  assert.ok(h.calls.indexOf('garage-world') > h.calls.indexOf('atmosphere-restored'), `(${breaks}, handed back) after the battlefield's own light`);
  assert.equal(h.session.phase, 'closed', `(${breaks}, handed back) the session closes`);
}

console.log('studioTeardown.selftest: a teardown step that throws (the plate, a recording, the flare, the panel, the actors, a film left open) skips none of the rest: the battlefield\'s felled trees fall with the frame again, the Studio lets the frame go, a handed-back Garage gets its presentation, and the failure still surfaces');
