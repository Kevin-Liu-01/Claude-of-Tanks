// felledTreeOwners.selftest.mjs — (2026-11-02 audit M9, round 2 U28) one owner for each fact of a felled tree or a crushed
// prop, and one declared driver for the falls.
//   1. The solo step's crush (game/state.ts resolveCrushContacts and fellBlastProps, compiled from the source) runs the
//      world's crush on a record still standing, and the world's crush fells the tree's canopy: over the headless world
//      (the one driverStepParity seats the page's driver on) the step marked the record first, the headless world refused a
//      record already marked, and the tree's and the prop's other records stayed up while the step felled the canopy itself.
//      A world that crushes nothing still has its canopy felled by the step.
//   2. The authority's restore of a destroyed set fells a restored tree's canopy (the headless world's crush).
//   3. The canopy is felled in one place per world: the steps call fellConcealersAt only where the world crushes nothing,
//      and the page world's crushObstacle writes no trunk flag of its own after the felled-tree owner (map.ts).
//   4. The Studio declares the falls' driver as it takes and gives back a world (studioCrush.ts): from the first frame the
//      world's own update moves no fall the timeline drives, a paused timeline holds them, and the update drives them again
//      once the Studio leaves. It was a per-call latch: the first frame advanced a fall twice, a paused Studio's update
//      went on finishing falls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';
import { createFelledTrees } from './felledTrees.ts';
import { setCircleShape } from './collision.ts';
import { fellConcealersAt } from '../sim/spotting.ts';
import { isFortifiedCoverRecord } from '../sim/fortifiedCover.ts';
import { PROP_FELL_PER_BLAST, PROP_FELL_PER_TICK, propFellRadiusM } from '../sim/munitionBlast.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createStudioCrushes } from '../game/studioCrush.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';
import '../vehicles/tankFactory.ts';

const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), maxY: 0, minY: 0 };

/** A tree (its movement record and its shell record), a two-record prop, the tree's canopy disc and a bush beside it. */
function headlessWorld() {
  const trunk = (extra) => setCircleShape({ min: [9.7, 0, -4.3], max: [10.3, 8, -3.7], crushable: true, treeIdx: 0, kind: 'tree', ...extra }, 10, -4, 0.3);
  const fence = { min: [20, 0, -1], max: [24, 1.2, 1], crushable: true, propIdx: 0, kind: 'fence' };
  const world = createHeadlessCollisionWorld({ mapId: 'verdant', heightField: flat, manifest: {
    obstacles: [packCollisionRecord(trunk({})), packCollisionRecord(fence)],
    colliders: [packCollisionRecord(trunk({ shell: true })), packCollisionRecord({ ...fence, shell: true })],
    concealers: [[10, -4, 3, 0.08], [14, -4, 2, 0.35]] } });
  return world;
}
const flags = (world) => [...world.getObstacles(), ...world.getColliders()].map((r) => `${r.kind}:${r.crushed ? 'c' : '-'}${r.dead ? 'd' : '-'}`);

// the solo step's functions, compiled from game/state.ts as they stand
const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
function soloFunction(name, deps) {
  const start = solo.indexOf(`function ${name}(`);
  const end = solo.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start, `state.ts ${name}`);
  const body = stripTypeScriptTypes(solo.slice(start, end + 2));
  return new Function(...Object.keys(deps), `${body}\nreturn ${name};`)(...Object.values(deps));
}
let stepFells = 0;
const countedFell = (...args) => { stepFells++; return fellConcealersAt(...args); };
const resolveCrushContacts = soloFunction('resolveCrushContacts', { CRUSH_SPEED_KEEP: 0.94, fellConcealersAt: countedFell });
const fellBlastProps = soloFunction('fellBlastProps', {
  stepObstacleQuery: (_game, world) => world.queryObstacles, PROP_FELL_PER_TICK, PROP_FELL_PER_BLAST, propFellRadiusM,
  isFortifiedCoverRecord, _blastCandidates: [], _blastFelled: [],
});
const bus = { emit() {} };
const hull = { id: 'p', specId: 't90am', isPlayer: true, state: { speed: 9, yaw: Math.PI / 2 } };

// ---- 1. the solo step's crush: the world's crush on a standing record, the world's canopy
{
  const world = headlessWorld();
  const [tree, fence] = world.getObstacles();
  stepFells = 0;
  resolveCrushContacts({ pendingCrush: [{ ob: tree, ent: hull }, { ob: fence, ent: hull }] }, world, bus);
  assert.deepEqual(flags(world), ['tree:c-', 'fence:c-', 'tree:cd', 'fence:cd'],
    'a hull\'s overrun: every record of the tree and of the prop down (before: the step marked the record first, the headless world refused it, and their shell records stood)');
  assert.deepEqual(world.getConcealment().map((d) => !!d.dead), [true, false], 'the tree\'s canopy stops concealing, the bush beside does not');
  assert.equal(stepFells, 0, 'felled by the world\'s crush: the step fells no canopy of its own');
  assert.equal(hull.state.speed < 9, true, 'the hull still pays the crush');
}
{
  const world = headlessWorld();
  const game = { _destructionBlasts: [10, 0.5, -5, 6] };
  stepFells = 0;
  fellBlastProps(game, bus, world);
  assert.deepEqual(flags(world).filter((f) => f.startsWith('tree')), ['tree:c-', 'tree:cd'], 'a burst beside it: the tree and its shell record down');
  assert.deepEqual(world.getConcealment().map((d) => !!d.dead), [true, false], 'its canopy with it');
  assert.equal(stepFells, 0, 'by the world\'s crush');
}
{
  // a world that crushes nothing (a bare collision world): the step's own mark and canopy
  const world = headlessWorld();
  const bare = { getConcealment: () => world.getConcealment() };
  const [tree] = world.getObstacles();
  stepFells = 0;
  resolveCrushContacts({ pendingCrush: [{ ob: tree, ent: { ...hull, state: { speed: 9, yaw: 0 } } }] }, bare, bus);
  assert.equal(tree.crushed, true, 'crushless world: the step marks the record');
  assert.deepEqual(world.getConcealment().map((d) => !!d.dead), [true, false], 'crushless world: and fells its canopy');
  assert.equal(stepFells, 1);
}

// ---- 2. the authority's restore of a destroyed set fells a restored tree's canopy (host migration, rejoin, rematch)
{
  const world = headlessWorld();
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'a', specId: 't90am', team: 'alpha', spawn: { x: 0, z: -380, yaw: 0 } },
    { id: 'b', specId: 'bmp2', team: 'bravo', spawn: { x: 0, z: 380, yaw: Math.PI } }] });
  match.onMatchReady();
  assert.equal(match.restoreDestroyedObstacles([0], 1).restored, 1);
  assert.deepEqual(world.getConcealment().map((d) => !!d.dead), [true, false], 'the restored tree conceals nothing, as on the host it fell on');
}

// ---- 3. one canopy writer per world, one trunk-flag writer on the page
{
  const callsOf = (text) => [...text.matchAll(/^.*fellConcealersAt\(.*$/gm)].map((m) => m[0].trim()).filter((line) => !line.startsWith('import'));
  const soloCalls = callsOf(solo);
  assert.deepEqual(soloCalls, ['fellConcealersAt(world.getConcealment(), obstacle.shape2.cx, obstacle.shape2.cz);'],
    'the solo step fells a canopy in one place');
  assert.match(solo, /if \(world\.crushObstacle\) world\.crushObstacle\(obstacle, directionX, directionZ, overrunMps\);\s*else if \(obstacle\.treeIdx != null && obstacle\.shape2 && world\.getConcealment\) \{\s*fellConcealersAt\(/,
    'and only where its world crushes nothing');
  const authority = readFileSync(new URL('../sim/authoritativeMatch.ts', import.meta.url), 'utf8');
  assert.deepEqual(callsOf(authority), ['if (!worldCrushes && obstacle.treeIdx != null && obstacle.shape2) fellConcealersAt(worldConcealers, obstacle.shape2.cx, obstacle.shape2.cz);'],
    'the authority fells a canopy only where its world crushes nothing');
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  const crush = map.slice(map.indexOf('    crushObstacle: ('), map.indexOf('    clearCoverAt: ('));
  assert.match(crush, /if \(isTreeObstacle\(ob\)\) return vegetation\.crushTree\(ob, dx, dz, settled\);/, 'the page world hands a tree to its owner');
  assert.doesNotMatch(crush, /ob\.(crushed|dead) =/, 'and writes no trunk flag of its own after it');
}

// ---- 4. the Studio declares the falls' driver
{
  const felledTree = () => {
    const tree = { x: 10, z: -4, mat: new THREE.Matrix4().makeTranslation(10, 0, -4), fallH: 8, fallR: 0.3 };
    const record = setCircleShape({ min: [9.7, 0, -4.3], max: [10.3, 8, -3.7], crushable: true, treeIdx: 0, kind: 'tree' }, 10, -4, 0.3);
    const felled = createFelledTrees({ trees: [tree], records: [record], concealers: [], heightField: flat,
      write() {}, poseChanged() {}, standingChanged() {} });
    return { tree, record, felled };
  };
  const studio = felledTree(), reference = felledTree();
  // the page world's seams over its felled trees (map.ts: update is the frame's driver, the Studio steps the timeline)
  const world = {
    update: (dt) => studio.felled.advance(dt, 'frame'),
    advanceToppledVegetation: (dt) => studio.felled.advance(dt, 'timeline'),
    advanceDestruction: (dt) => studio.felled.advance(dt, 'timeline'),
    crushObstacle: (ob, dx, dz) => studio.felled.fell(ob, dx, dz),
    crushProp: () => false, resetDestructibles: () => studio.felled.restoreAll(),
    setCrushSweeps() {}, setFallDriver: (driver) => studio.felled.setDriver?.(driver),
  };
  const crushes = createStudioCrushes();
  crushes.setPlan(world, [{ tMs: 0, record: studio.record, crushable: -1, dirX: 1, dirZ: 0, speedMps: 8 }]);
  crushes.advanceTo(world, 0); // the hull's overrun at the take's start fells the tree
  reference.felled.fell(reference.record, 1, 0);
  for (let frame = 0; frame < 10; frame++) {
    world.update(1 / 60); // the page's frame first (the first Studio frame's order)
    world.advanceToppledVegetation(1 / 60); // then the Studio's timeline step
    reference.felled.advance(1 / 60, 'frame'); // one step a frame
  }
  const pose = (m) => m.elements.map((v) => v.toFixed(9)).join();
  assert.equal(pose(studio.tree.mat), pose(reference.tree.mat),
    'the fall runs at the timeline\'s pace from the first frame, never twice a frame');
  const held = pose(studio.tree.mat);
  for (let frame = 0; frame < 6; frame++) world.update(1 / 60); // a paused Studio: its timeline steps nothing
  assert.equal(pose(studio.tree.mat), held, 'a paused timeline holds the fall (before: the world\'s update finished it)');
  crushes.restore(world); // the Studio leaves the world
  world.update(1 / 60);
  assert.notEqual(pose(studio.tree.mat), held, 'given back, the world\'s update drives its falls again');
}

console.log('felledTreeOwners.selftest: the world\'s crush owns a felled tree\'s records and canopy in the solo step, the restore and the page world, and the Studio declares the falls\' driver PASS');
