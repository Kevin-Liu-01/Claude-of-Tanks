// collisionRestoreIndex.selftest (physics stream, 2026-10-16; the coordinator: "restoring 4,641 crushed spans took 9-20 s
// ... it matters for host migration, rematch and late-join restores"): a restore of a whole destroyed set is linear.
//   1. Saltwind's committed shard on the authority's world: every crushable record (a prop's, a tree's) restored at once
//      through the authority (authoritativeMatch.ts restoreDestroyedObstacles: a set asks whether an index is in, and
//      headlessCollisionWorld.ts crushObstacle marks a prop's or a tree's records through their index) in linear work,
//      and the world's flags after it are exactly those the old per-crush scan of every record leaves.
//   2. A synthetic world of 12,000 crushable props (two records each, the walls' and more): the same.
// (The world-events audit, tools/mp-world-events-audit.selftest.mjs, runs the restores of a rejoin and a migration.)
// (round 2 Q13) Linear is proven by counting, not by a clock: the restore's reads of the records' prop and tree ids and
// of the canopy discs' centres stay within a few per record and disc (the per-crush scan read every record per crush; the
// round-1 canopy fell read every disc per tree: Saltwind 22.6 M centre reads). The 0.2 s wall bound passed 3 of 5 runs at
// load 150-280 on 18 cores (thread CPU 18-20 ms; the wait is the machine's). The restore's thread CPU is printed, with a
// coarse 1 s bound against the 9-20 s restores the index replaced.
import assert from 'node:assert/strict';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import '../src/vehicles/tankFactory.ts';

/**
 * The pre-index law: a crush marks every record of the prop's or the tree's, the movement records crushed and the shell
 * records crushed and dead (the reference the index must equal). (round 2 Q13) The law's records are grouped once per
 * reference world, not scanned per crush: the same marks, without the per-crush scan of every record that made this
 * reference the receipt's whole cost (40 s of Saltwind's and minutes of the synthetic world's at load 500).
 */
const groupsOf = new WeakMap();
function scanCrush(world, obstacle) {
  if (!obstacle || obstacle.crushed) return;
  obstacle.crushed = true;
  if (obstacle.propIdx == null && obstacle.treeIdx == null) return;
  let groups = groupsOf.get(world);
  if (!groups) {
    groups = new Map();
    const add = (record, list) => {
      for (const key of [record.propIdx != null ? `p${record.propIdx}` : null, record.treeIdx != null ? `t${record.treeIdx}` : null]) {
        if (key === null) continue;
        if (!groups.has(key)) groups.set(key, { obstacles: [], colliders: [] });
        groups.get(key)[list].push(record);
      }
    };
    for (const record of world.getObstacles()) add(record, 'obstacles');
    for (const record of world.getColliders()) add(record, 'colliders');
    groupsOf.set(world, groups);
  }
  const same = groups.get(obstacle.propIdx != null ? `p${obstacle.propIdx}` : `t${obstacle.treeIdx}`);
  for (const r of same?.obstacles ?? []) r.crushed = true;
  for (const r of same?.colliders ?? []) { r.crushed = true; r.dead = true; }
}
const flags = (world) => JSON.stringify([world.getObstacles().map((r) => [!!r.crushed, !!r.dead]), world.getColliders().map((r) => [!!r.crushed, !!r.dead])]);

/** Count every read of the records' prop and tree ids and of the discs' centres from here on. */
function countReads(world) {
  const counter = { reads: 0 };
  const watch = (object, key) => {
    const had = Object.prototype.hasOwnProperty.call(object, key);
    let value = object[key];
    Object.defineProperty(object, key, {
      get() { counter.reads++; return value; }, set(next) { value = next; }, enumerable: had, configurable: true,
    });
  };
  for (const record of [...world.getObstacles(), ...world.getColliders()]) { watch(record, 'propIdx'); watch(record, 'treeIdx'); }
  for (const disc of world.getConcealment()) { watch(disc, 'x'); watch(disc, 'z'); }
  return counter;
}
const threadCpuMs = () => { const usage = process.threadCpuUsage(); return (usage.user + usage.system) / 1000; };

function check(label, makeWorld) {
  const world = makeWorld(), reference = makeWorld();
  const indices = world.getObstacles().map((r, i) => (r.crushable || r.treeIdx != null ? i : -1)).filter((i) => i >= 0);
  const match = createAuthoritativeMatch({ mapId: world.mapId ?? 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'a', specId: 't90am', team: 'alpha', spawn: { x: 0, z: -380, yaw: 0 } }, { id: 'b', specId: 'bmp2', team: 'bravo', spawn: { x: 0, z: 380, yaw: Math.PI } }] });
  match.onMatchReady();
  const records = world.getObstacles().length + world.getColliders().length, discs = world.getConcealment().length;
  const counter = countReads(world);
  const c0 = threadCpuMs(), t0 = performance.now();
  const result = match.restoreDestroyedObstacles(indices, indices.length);
  const cpuMs = threadCpuMs() - c0, ms = performance.now() - t0;
  const reads = counter.reads;
  assert.equal(result.restored, indices.length, `${label}: every index restored`);
  for (const i of indices) scanCrush(reference, reference.getObstacles()[i]);
  assert.equal(flags(world), flags(reference), `${label}: the same records crushed and dead as the per-crush scan leaves`);
  const listed = match.snapshot({ tick: 1, serverTimeMs: 50, viewerId: 'a' }).meta.destroyedObstacleIndices;
  assert.deepEqual(listed, indices, `${label}: the destroyed list in restore order, each index once`);
  // (a second restore of the same set adds nothing)
  match.restoreDestroyedObstacles(indices, indices.length);
  assert.equal(match.snapshot({ tick: 2, serverTimeMs: 100, viewerId: 'a' }).meta.destroyedObstacleIndices.length, indices.length, `${label}: no index twice`);
  const bound = 8 * (records + discs + indices.length); // a few reads each; the scans it replaced read millions
  assert.ok(reads <= bound,
    `${label}: ${indices.length} restored with ${reads} id and centre reads over ${records} records and ${discs} discs (linear: at most ${bound})`);
  assert.ok(cpuMs < 1000, `${label}: ${indices.length} restored in ${cpuMs.toFixed(1)} ms of thread CPU (a coarse bound: the index replaced 9-20 s)`);
  return `${label} ${indices.length} with ${reads} reads (bound ${bound}), ${cpuMs.toFixed(1)} ms CPU, ${ms.toFixed(1)} ms wall`;
}

const lines = [check('saltwind', () => createDedicatedWorldCollision('saltwind'))];
// a synthetic world: 12,000 props of two records each, in rows, on a flat field
const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), maxY: 0, minY: 0 };
const synthetic = () => {
  const obstacles = [], colliders = [];
  for (let i = 0; i < 12000; i++) {
    const x = -450 + (i % 150) * 6, z = -450 + Math.floor(i / 150) * 11;
    const box = { b: [x, 0, z, x + 4, 1, z + 0.8], k: 'field-wall', q: 1, p: i };
    obstacles.push(box); colliders.push(box);
  }
  const world = createHeadlessCollisionWorld({ heightField: flat, manifest: { obstacles, colliders } });
  return Object.assign(world, { mapId: 'saltwind' });
};
lines.push(check('synthetic', synthetic));
console.log(`collisionRestoreIndex.selftest: a whole destroyed set restores in linear time, flags as the per-crush scan's: ${lines.join('; ')}`);
