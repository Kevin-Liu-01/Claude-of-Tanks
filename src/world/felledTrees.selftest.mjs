// felledTrees.selftest.mjs — one owner for a felled tree (2026-11-02 audit M9, felledTrees.ts).
//
// "This tree is down" lived in three places with two reset paths: the tree record and its trunk's collision record
// (vegetation.ts, reset by resetToppled), and its canopy's concealment disc (sim/spotting.ts, felled by each authority's
// step, reset only by the solo battle's setup). A reset that ran one and not the other (the Studio's scene reset) left a
// standing tree that hid nothing. The upright pose was captured once ever, so a tree a crater had re-seated before its
// first fall stood again with the crater's lift; and the frame's update and the Studio's timeline could both advance one
// fall in a frame. On the owner, with a plain trunk record and concealment discs:
//   - fell: the tree, its trunk record (crushed, dead) and its canopy's disc (dead) together; a bush's disc beside stays;
//   - restoreAll: all three stand again, the tree at its placement, never a crater's lift;
//   - one declared driver: the Studio's timeline once it has the world (setDriver), else the frame's update;
//   - settled: the final pose at the next advance, no fall in between.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFelledTrees } from './felledTrees.ts';
import { setCircleShape } from './collision.ts';

function world() {
  const placement = new THREE.Matrix4().makeTranslation(10, 2, -4);
  const tree = { x: 10, z: -4, mat: placement.clone(), fallH: 8, fallR: 0.3, slot: 0, fslot: -1 };
  const record = setCircleShape({ min: [9.7, 2, -4.3], max: [10.3, 10, -3.7], crushable: true, crushed: false, treeIdx: 0, kind: 'tree' }, 10, -4, 0.3);
  const canopy = { x: 10, z: -4, r: 3, add: 0.08 }, bush = { x: 14, z: -4, r: 2, add: 0.35 };
  const writes = [];
  const counts = { pose: 0, standing: 0 };
  const felled = createFelledTrees({
    trees: [tree], records: [record], concealers: [canopy, bush], heightField: { getHeightAt: () => 2 },
    write: (t) => writes.push(t.mat.clone()), poseChanged: () => { counts.pose++; }, standingChanged: () => { counts.standing++; },
  });
  return { placement, tree, record, canopy, bush, writes, counts, felled };
}

// ---- fell: the tree, its trunk record and its canopy together
{
  const w = world();
  assert.equal(w.felled.fell(w.record, 1, 0), true, 'the tree falls');
  assert.equal(w.tree.crushed, true, 'the tree record is down');
  assert.deepEqual([w.record.crushed, w.record.dead], [true, true], 'its trunk record a ghost (hulls, shells and sight pass)');
  assert.equal(w.canopy.dead, true, 'its canopy conceals nothing');
  assert.notEqual(w.bush.dead, true, 'a bush beside it still conceals');
  assert.equal(w.felled.fell(w.record, 1, 0), false, 'a felled tree falls once');
  for (let i = 0; i < 90; i++) w.felled.advance(1 / 60, 'frame');
  assert.equal(w.felled.falling, 0, 'the fall settles');
  assert.ok(Math.abs(w.tree.mat.elements[13] - 2) < 1.5, 'the trunk lies on the ground');
  // ---- restoreAll: all three stand again (the Studio's scene reset and the battle's reset are this one call)
  w.felled.restoreAll();
  assert.equal(w.tree.crushed, false, 'the tree stands');
  assert.deepEqual(w.tree.mat.elements, w.placement.elements, 'at its placement');
  assert.deepEqual([w.record.crushed, w.record.dead], [false, false], 'its trunk record blocks again');
  assert.equal(w.canopy.dead, false, 'and its canopy conceals again');
}

// ---- a crater re-seated the tree before its first fall: it stands again at its placement, not with the crater's lift
{
  const w = world();
  w.tree.craterBase = w.tree.mat.clone();
  w.tree.mat.elements[13] += 0.7; // groundCoverCraters.ts reseatCraterTrees: the trunk rooted on the thrown rim
  w.felled.fell(w.record, 0, 1);
  w.felled.advance(2, 'frame');
  w.felled.restoreAll();
  assert.deepEqual(w.tree.mat.elements, w.placement.elements, 'the upright pose is the placement (the crater\'s lift is the follower\'s)');
}

// ---- one declared driver (round 2 U28; it was a per-call latch): the Studio's timeline drives the falls once it has taken
// the world, the frame's update moves none of them meanwhile, and the frame drives them again once the timeline leaves
{
  const timelineOnly = world(), both = world();
  for (const w of [timelineOnly, both]) { w.felled.setDriver('timeline'); w.felled.fell(w.record, 1, 0); }
  assert.equal(both.felled.driver, 'timeline');
  for (let frame = 0; frame < 20; frame++) {
    both.felled.advance(1 / 60, 'frame'); // the world's own update first in the frame (the first Studio frame's order)
    timelineOnly.felled.advance(1 / 60, 'timeline');
    both.felled.advance(1 / 60, 'timeline');
  }
  assert.deepEqual(both.tree.mat.elements, timelineOnly.tree.mat.elements, 'the fall runs at the timeline\'s pace, never twice a frame');
  const paused = both.tree.mat.clone();
  for (let frame = 0; frame < 5; frame++) both.felled.advance(1 / 60, 'frame'); // a paused Studio: no timeline call
  assert.deepEqual(both.tree.mat.elements, paused.elements, 'a paused timeline holds the fall: the frame\'s update moves nothing');
  both.felled.setDriver('frame');
  both.felled.advance(1 / 60, 'frame');
  assert.notDeepEqual(both.tree.mat.elements, timelineOnly.tree.mat.elements, 'with the timeline gone the frame drives the fall again');
  both.felled.advance(1 / 60, 'timeline');
  const framed = both.tree.mat.clone();
  both.felled.advance(1 / 60, 'timeline');
  assert.deepEqual(both.tree.mat.elements, framed.elements, 'and a stray timeline call moves nothing');
}

// ---- settled (a late joiner's destroyed list): the final pose at the next advance, no fall in between
{
  const live = world(), late = world();
  live.felled.fell(live.record, 1, 0);
  for (let i = 0; i < 90; i++) live.felled.advance(1 / 60, 'frame');
  late.felled.fell(late.record, 1, 0, true);
  late.felled.advance(1 / 60, 'frame');
  assert.equal(late.felled.falling, 0, 'retired after one advance');
  assert.equal(late.writes.length, 1, 'one write of its pose');
  for (let k = 0; k < 16; k++) assert.ok(Math.abs(late.tree.mat.elements[k] - live.tree.mat.elements[k]) < 1e-9, 'the pose the live fall settles in');
  assert.ok(late.counts.standing >= 1 && late.counts.pose >= 1, 'the near tier is told');
}

// ---- the headless authority's world fells the canopy with the trunk too (its crushObstacle; the authority's own
// fellConcealersAt call is then a no-op)
{
  const { createHeadlessCollisionWorld } = await import('./headlessCollisionWorld.ts');
  const { packCollisionRecord } = await import('../../tools/headlessWorldCollision.mjs');
  const trunk = setCircleShape({ min: [9.7, 2, -4.3], max: [10.3, 10, -3.7], crushable: true, crushed: false, treeIdx: 0, kind: 'tree' }, 10, -4, 0.3);
  const headless = createHeadlessCollisionWorld({ mapId: 'felled-trees', heightField: { getHeightAt: () => 2, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
    manifest: { obstacles: [packCollisionRecord(trunk)], colliders: [], concealers: [[10, -4, 3, 0.08], [14, -4, 2, 0.35]] } });
  assert.ok(headless.crushObstacle(headless.getObstacles()[0]), 'the authority fells the trunk');
  assert.deepEqual(headless.getConcealment().map((d) => !!d.dead), [true, false], 'its canopy stops concealing, the bush beside does not');
}

console.log('felledTrees.selftest: a felled tree, its trunk record and its canopy fall and stand together, at its placement, one driver a frame');
