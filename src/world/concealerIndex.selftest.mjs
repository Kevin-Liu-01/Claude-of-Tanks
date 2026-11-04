// concealerIndex.selftest.mjs — a felled tree's canopy found in constant time (2026-11-02 audit M9, concealerIndex.ts).
//
// Once both worlds' tree crushes felled their canopy with the trunk (felledTrees.ts fell; the headless world's
// crushObstacle), each fell scanned the world's whole disc list (spotting.ts fellConcealersAt), so a whole destroyed set
// restored at once (the authority's restoreDestroyedObstacles on a host migration, keyframe, rejoin or rematch; a late
// joiner applying the destroyed list) cost trees x discs — Saltwind's 2,762 trees x 4,095 discs — and broke
// server/collisionRestoreIndex.selftest.mjs's linear-time restore. Here, without a clock (the machine's load decides
// nothing), by counting the discs' centre reads:
//   - the index fells exactly the discs fellConcealersAt fells, at its 1 cm reach and around its cell edges, and indexes
//     again when the list grew;
//   - the headless world's crush of every tree fells every canopy and no bush, reading each disc's centre a bounded
//     number of times, not once per tree;
//   - the page world's felled-tree owner (felledTrees.ts) the same, and restoreAll stands them all again.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createConcealerIndex } from './concealerIndex.ts';
import { fellConcealersAt } from '../sim/spotting.ts';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';
import { createFelledTrees } from './felledTrees.ts';
import { setCircleShape } from './collision.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';

let seed = 0x5eed;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---- the same law as fellConcealersAt: the 1 cm reach, its edges, the cell edges, coincident discs, a grown list
{
  const centres = [];
  for (let i = 0; i < 400; i++) centres.push([Math.round((rand() - 0.5) * 3000 * 50) / 50, Math.round((rand() - 0.5) * 3000 * 50) / 50]);
  centres.push([0, 0], [-0.01, 0.01], [0.02, -0.02], [1e-9, -1e-9]);
  const offsets = [0, 0, 0.01, -0.01, 0.0099999, -0.0099999, 0.0100001, -0.0100001, 0.005, 0.015, -0.019, 0.02];
  const discs = [];
  for (const [x, z] of centres) {
    for (let k = 0; k < 4; k++) {
      const ox = offsets[Math.floor(rand() * offsets.length)], oz = offsets[Math.floor(rand() * offsets.length)];
      discs.push({ x: x + ox, z: z + oz, r: 3, add: 0.08 });
    }
  }
  const scanned = discs.map((d) => ({ ...d }));
  const index = createConcealerIndex(discs);
  const queries = [...centres];
  for (let i = 0; i < 200; i++) queries.push([discs[i * 7 % discs.length].x + (rand() - 0.5) * 0.04, discs[i * 7 % discs.length].z + (rand() - 0.5) * 0.04]);
  let felledTotal = 0;
  for (const [x, z] of queries) {
    const want = fellConcealersAt(scanned, x, z);
    assert.equal(index.fellAt(x, z), want, `the index fells as many discs at (${x}, ${z}) as the scan`);
    felledTotal += want;
  }
  assert.deepEqual(discs.map((d) => !!d.dead), scanned.map((d) => !!d.dead), 'and the same discs');
  assert.ok(felledTotal > centres.length && felledTotal < discs.length, `a mix felled and standing (${felledTotal} of ${discs.length})`);
  discs.push({ x: 5000.005, z: -5000.005, r: 3, add: 0.08 });
  assert.equal(index.fellAt(5000, -5000), 1, 'a disc added after the first fell is found (the list grew: indexed again)');
}

/** A disc that counts its centre's reads (the work a fell does). */
class CountedDisc {
  static reads = 0;
  constructor(x, z, r, add) { this._x = x; this._z = z; this.r = r; this.add = add; }
  get x() { CountedDisc.reads++; return this._x; }
  get z() { return this._z; }
}

const N = 3000;
const treeAt = (i) => [-600 + (i % 60) * 20, -600 + Math.floor(i / 60) * 24];

// ---- the headless world: every tree crushed at once fells every canopy, in work linear in discs
{
  const obstacles = [], concealers = [];
  for (let i = 0; i < N; i++) {
    const [x, z] = treeAt(i);
    obstacles.push(packCollisionRecord(setCircleShape({ min: [x - 0.3, 0, z - 0.3], max: [x + 0.3, 9, z + 0.3], crushable: true, crushed: false, treeIdx: i, kind: 'tree' }, x, z, 0.3)));
    concealers.push([x, z, 3, 0.08], [x + 0.004, z - 0.004, 2.5, 0.08], [x + 6, z, 2, 0.35]); // two canopy discs, a bush
  }
  const world = createHeadlessCollisionWorld({ mapId: 'canopy-index', heightField: { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) },
    manifest: { obstacles, colliders: [], concealers } });
  const discs = world.getConcealment();
  // (the index is built at the first fell: the counted discs are the ones it holds)
  for (let i = 0; i < discs.length; i++) discs[i] = new CountedDisc(discs[i].x, discs[i].z, discs[i].r, discs[i].add);
  CountedDisc.reads = 0;
  let crushed = 0;
  for (const record of world.getObstacles()) if (world.crushObstacle(record)) crushed++;
  assert.equal(crushed, N, 'every tree falls');
  assert.ok(discs.every((d, i) => !!d.dead === (i % 3 !== 2)), 'every canopy disc stops concealing, every bush still conceals');
  assert.ok(CountedDisc.reads <= 3 * discs.length,
    `${N} trees felled with ${CountedDisc.reads} centre reads over ${discs.length} discs (linear: at most ${3 * discs.length}; a scan per tree reads ~${N * discs.length / 2})`);
}

// ---- the page world's felled-tree owner: the same work, and restoreAll stands every canopy again
{
  const trees = [], records = [], concealers = [];
  for (let i = 0; i < N; i++) {
    const [x, z] = treeAt(i);
    trees.push({ x, z, mat: new THREE.Matrix4().makeTranslation(x, 0, z), fallH: 8, fallR: 0.3 });
    records.push(setCircleShape({ min: [x - 0.3, 0, z - 0.3], max: [x + 0.3, 9, z + 0.3], crushable: true, crushed: false, treeIdx: i, kind: 'tree' }, x, z, 0.3));
    concealers.push(new CountedDisc(x, z, 3, 0.08), new CountedDisc(x - 0.004, z + 0.004, 2.5, 0.08), new CountedDisc(x, z + 6, 2, 0.35));
  }
  const felled = createFelledTrees({ trees, records, concealers, heightField: { getHeightAt: () => 0 },
    write() {}, poseChanged() {}, standingChanged() {} });
  CountedDisc.reads = 0;
  let fell = 0;
  for (const record of records) if (felled.fell(record, 1, 0, true)) fell++;
  assert.equal(fell, N, 'every tree falls');
  assert.ok(concealers.every((d, i) => !!d.dead === (i % 3 !== 2)), 'every canopy disc stops concealing, every bush still conceals');
  assert.ok(CountedDisc.reads <= 3 * concealers.length,
    `${N} trees felled with ${CountedDisc.reads} centre reads over ${concealers.length} discs (linear: at most ${3 * concealers.length})`);
  felled.restoreAll();
  assert.ok(concealers.every((d) => !d.dead) && records.every((r) => !r.crushed && !r.dead), 'restoreAll: every canopy and trunk record stands');
  assert.equal(felled.fell(records[7], 1, 0), true, 'a stood tree falls again');
  assert.deepEqual([!!concealers[21].dead, !!concealers[22].dead, !!concealers[23].dead], [true, true, false], 'its canopy with it, not the bush beside');
}

console.log('concealerIndex.selftest: a felled tree\'s canopy found in constant time, the same discs as the scan, in both worlds');
