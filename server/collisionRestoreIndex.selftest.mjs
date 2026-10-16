// collisionRestoreIndex.selftest (physics stream, 2026-10-16; the coordinator: "restoring 4,641 crushed spans took 9-20 s
// ... it matters for host migration, rematch and late-join restores"): a restore of a whole destroyed set is linear.
//   1. Saltwind's committed shard on the authority's world: every crushable record (a prop's, a tree's) restored at once
//      through the authority (authoritativeMatch.ts restoreDestroyedObstacles: a set asks whether an index is in, and
//      headlessCollisionWorld.ts crushObstacle marks a prop's or a tree's records through their index) in under 0.2 s,
//      and the world's flags after it are exactly those the old per-crush scan of every record leaves.
//   2. A synthetic world of 12,000 crushable props (two records each, the walls' and more): the same, under 0.2 s.
// (The world-events audit, tools/mp-world-events-audit.selftest.mjs, runs the restores of a rejoin and a migration.)
import assert from 'node:assert/strict';
import { createDedicatedWorldCollision } from './dedicatedWorldCollision.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import '../src/vehicles/tankFactory.ts';

/** The pre-index law: a crush scans every record for the prop's or the tree's (the reference the index must equal). */
function scanCrush(world, obstacle) {
  if (!obstacle || obstacle.crushed) return;
  obstacle.crushed = true;
  if (obstacle.propIdx == null && obstacle.treeIdx == null) return;
  const same = (r) => (obstacle.propIdx != null ? r.propIdx === obstacle.propIdx : r.treeIdx === obstacle.treeIdx);
  for (const r of world.getObstacles()) if (same(r)) r.crushed = true;
  for (const r of world.getColliders()) if (same(r)) { r.crushed = true; r.dead = true; }
}
const flags = (world) => JSON.stringify([world.getObstacles().map((r) => [!!r.crushed, !!r.dead]), world.getColliders().map((r) => [!!r.crushed, !!r.dead])]);

function check(label, makeWorld) {
  const world = makeWorld(), reference = makeWorld();
  const indices = world.getObstacles().map((r, i) => (r.crushable || r.treeIdx != null ? i : -1)).filter((i) => i >= 0);
  const match = createAuthoritativeMatch({ mapId: world.mapId ?? 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'a', specId: 't90am', team: 'alpha', spawn: { x: 0, z: -380, yaw: 0 } }, { id: 'b', specId: 'bmp2', team: 'bravo', spawn: { x: 0, z: 380, yaw: Math.PI } }] });
  match.onMatchReady();
  const t0 = performance.now();
  const result = match.restoreDestroyedObstacles(indices, indices.length);
  const ms = performance.now() - t0;
  assert.equal(result.restored, indices.length, `${label}: every index restored`);
  for (const i of indices) scanCrush(reference, reference.getObstacles()[i]);
  assert.equal(flags(world), flags(reference), `${label}: the same records crushed and dead as the per-crush scan leaves`);
  const listed = match.snapshot({ tick: 1, serverTimeMs: 50, viewerId: 'a' }).meta.destroyedObstacleIndices;
  assert.deepEqual(listed, indices, `${label}: the destroyed list in restore order, each index once`);
  // (a second restore of the same set adds nothing)
  match.restoreDestroyedObstacles(indices, indices.length);
  assert.equal(match.snapshot({ tick: 2, serverTimeMs: 100, viewerId: 'a' }).meta.destroyedObstacleIndices.length, indices.length, `${label}: no index twice`);
  assert.ok(ms < 200, `${label}: ${indices.length} restored in ${ms.toFixed(1)} ms (under 0.2 s)`);
  return `${label} ${indices.length} in ${ms.toFixed(1)} ms`;
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
