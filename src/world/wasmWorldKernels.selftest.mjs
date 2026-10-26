// The world's WebAssembly kernels (wasmWorldKernels.ts) behind the production seam (headlessCollisionWorld.ts `kernels`)
// answer every query bit for bit as the TypeScript does: on two dedicated worlds (Verdant and Titan Gorge's cliffs, folds
// split both ways) the contact heights and splits of 38,007 points (on and off the square, cell corners and edges,
// non-finite), 20,000 obstacle queries (records and their order) and 4,000 collider rays (marched along the grid's own
// order: distance, normal, record), then a whole match on each, whose state digests agree at every check.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts';
import { compileWorldKernels } from './wasmWorldKernels.ts';
import { createHullFootprint, hullFootprint } from './collision.ts';
import { createStructureSupportField } from '../sim/structureSupport.ts';
import { createDeformedHeightField, createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { serverWorldKernels } from '../../server/match/simKernels.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { SIM_DT } from '../sim/movement.ts';

const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));
let seed = 0x2545f491;
const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const STEP = 128 / 96;

for (const mapId of ['verdant', 'titan_gorge']) {
  const ts = createDedicatedWorldCollision(mapId);
  const wasm = createDedicatedWorldCollision(mapId, { kernels: module });
  assert.notEqual(wasm.heightField.getContactHeightAt, ts.heightField.getContactHeightAt, `${mapId}: the kernel world reads its own surface`);
  assert.equal(wasm.heightField.getHeightAt, ts.heightField.getHeightAt, `${mapId}: over the same height function`);

  let points = 0, folds = 0;
  const point = (x, z) => {
    const a = ts.heightField.getContactHeightAt(x, z), b = wasm.heightField.getContactHeightAt(x, z);
    assert.ok(Object.is(a, b), `${mapId}: contact height at (${x}, ${z}): ${b} where the TypeScript gives ${a}`);
    const fa = ts.heightField.getContactCellFlippedAt(x, z), fb = wasm.heightField.getContactCellFlippedAt(x, z);
    assert.equal(fb, fa, `${mapId}: the split at (${x}, ${z})`);
    if (fa) folds++;
    points++;
  };
  for (let i = 0; i < 30000; i++) point(random() * 1040 - 520, random() * 1040 - 520);
  // the lattice's own coordinates (corners, Float32-rounded cell edges) and a hair either side of them
  for (let i = 0; i < 8000; i++) {
    const ix = Math.floor(random() * 769), iz = Math.floor(random() * 769);
    const x = -512 + ix * STEP, z = -512 + iz * STEP, e = [0, 1e-9, -1e-9, STEP * 0.5][i & 3];
    point(x + e, z - e);
  }
  for (const [x, z] of [[NaN, 0], [0, Infinity], [-Infinity, 3], [512, 512], [-512, -512], [512.0000001, 0], [0, -600]]) point(x, z);
  assert.ok(folds > 0 || mapId === 'verdant', `${mapId}: the cliffs fold some cells the a–d way (${folds})`);

  const obstaclesTs = ts.getObstacles(), obstaclesWasm = wasm.getObstacles();
  const outTs = [], outWasm = [];
  for (let i = 0; i < 20000; i++) {
    const x = random() * 1100 - 550, z = random() * 1100 - 550, w = random() < 0.9 ? random() * 30 : random() * 300, d = random() < 0.9 ? random() * 30 : random() * 300;
    ts.queryObstacles(x, z, x + w, z + d, outTs);
    wasm.queryObstacles(x, z, x + w, z + d, outWasm);
    assert.deepEqual(outWasm.map((r) => obstaclesWasm.indexOf(r)), outTs.map((r) => obstaclesTs.indexOf(r)), `${mapId}: obstacle query ${i}`);
  }
  const collidersTs = ts.getColliders(), collidersWasm = wasm.getColliders();
  let rayHits = 0;
  for (let i = 0; i < 4000; i++) {
    const origin = new Vector3(random() * 1000 - 500, ts.heightField.getHeightAt(0, 0) + random() * 6, random() * 1000 - 500);
    const angle = random() * Math.PI * 2;
    const direction = new Vector3(Math.cos(angle), (random() - 0.5) * 0.1, Math.sin(angle)).normalize();
    const reach = random() < 0.5 ? random() * 60 : random() * 600;
    const a = ts.raycast(origin, direction, reach), b = wasm.raycast(origin, direction, reach);
    assert.equal(b === null, a === null, `${mapId}: ray ${i} hits on both or neither`);
    if (!a) continue;
    rayHits++;
    assert.ok(Object.is(b.distance, a.distance) && b.normal.equals(a.normal) && b.point.equals(a.point), `${mapId}: ray ${i}: the same hit`);
    assert.equal(b.record ? collidersWasm.indexOf(b.record) : -1, a.record ? collidersTs.indexOf(a.record) : -1, `${mapId}: ray ${i}: the same record`);
  }
  assert.ok(rayHits > 100, `${mapId}: the rays meet the world (${rayHits})`);
  console.log(`wasmWorldKernels.selftest: ${mapId}: ${points} contact points (${folds} on a–d folds), 20000 obstacle queries, 4000 rays (${rayHits} hits) identical`);
  ts.release?.(); wasm.release?.();
}

// the match's support on the kernel (one call a sample: the contact surface, the overlay mirrored onto it, the tops over
// it): Urban's roofed buildings, an overlay of craters and heaps laid before and after the bind, its clock stepped while
// heaps rise, crushed records; every hull begun posed and unposed reads the same field as the TypeScript's
{
  const ts = createDedicatedWorldCollision('urban');
  const wasm = createDedicatedWorldCollision('urban', { kernels: module });
  assert.equal(typeof wasm.kernelSupportField, 'function', 'a kernel world offers its support field');
  const grounds = [createTerrainDeformation(), createTerrainDeformation()];
  const lay = (ground, phase) => {
    let r = 0x9e3779b9 ^ phase;
    const next = () => { r = (Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((r >>> 0) % 100000) / 100000; };
    for (let i = 0; i < 40; i++) ground.addCrater(-200 + next() * 400, -200 + next() * 400, 0.6 + next() * 3, 0.3 + next(), next() * 0.5, (next() * 4294967296) >>> 0);
    for (let i = 0; i < 4; i++) ground.addRubble(-150 + next() * 300, -150 + next() * 300, 4 + next() * 8, 4 + next() * 8, next() * 6, 0.8 + next() * 2, phase ? 3 + i * 0.4 : undefined);
  };
  for (const ground of grounds) lay(ground, 0);
  ts.bindGroundOverlay(grounds[0]);
  wasm.bindGroundOverlay(grounds[1]);
  const fieldTs = createStructureSupportField(createDeformedHeightField(ts.heightField, grounds[0]), { queryObstacles: ts.queryObstacles.bind(ts) });
  const fieldWasm = wasm.kernelSupportField(createDeformedHeightField(wasm.heightField, grounds[1]));
  const obstaclesTs = [...new Set(ts.getObstacles())], obstaclesWasm = [...new Set(wasm.getObstacles())];
  const roofed = obstaclesTs.map((r, i) => [r, i]).filter(([r]) => r.shape2?.kind === 'compound' && !r.crushable);
  for (let k = 0; k < 8; k++) { obstaclesTs[k * 97].crushed = true; obstaclesWasm[k * 97].crushed = true; }
  const rect = { centerX: 0.02, centerZ: 0.2, halfLength: 3.6, halfWidth: 1.75, frontLiftM: 0.45, rearLiftM: 0.3 };
  let samples = 0, lifted = 0;
  for (const phase of [0, 1, 2, 3]) {
    if (phase === 1) for (const ground of grounds) lay(ground, 1);
    if (phase === 2) for (const ground of grounds) ground.setTime(3.9);
    if (phase === 3) for (const ground of grounds) { ground.setTime(9); ground.reset(); ground.addCrater(10, 10, 3, 1, 0.4, 7); }
    for (let h = 0; h < 60; h++) {
      const [target] = roofed[(h * 7919 + phase * 31) % roofed.length];
      const x = target.min[0] + random() * (target.max[0] - target.min[0]), z = target.min[2] + random() * (target.max[2] - target.min[2]);
      const belly = target.max[1] - 1 + random() * 1.5;
      const pose = h % 2 ? hullFootprint(rect, x, z, random() * 6.28, (random() - 0.5) * 0.5, (random() - 0.5) * 0.4, createHullFootprint()) : null;
      fieldTs.beginHull(x, z, belly, pose);
      fieldWasm.beginHull(x, z, belly, pose);
      assert.equal(fieldWasm.candidateCount, fieldTs.candidateCount, `phase ${phase} hull ${h}: candidates`);
      assert.equal(fieldWasm.standingDeck, fieldTs.standingDeck, `phase ${phase} hull ${h}: the deck it stands on`);
      for (let k = 0; k < 24; k++) {
        const sx = x + (random() - 0.5) * 14, sz = z + (random() - 0.5) * 14;
        const read = {};
        for (const name of ['getContactHeightAt', 'getTerrainContactHeightAt', 'getHeightAt', 'getHeightAtFast']) {
          const a = fieldTs[name](sx, sz), b = fieldWasm[name](sx, sz);
          assert.ok(Object.is(a, b), `phase ${phase} hull ${h}: ${name}(${sx}, ${sz}) ${b} where the TypeScript gives ${a}`);
          read[name] = a;
        }
        if (read.getContactHeightAt > read.getTerrainContactHeightAt) lifted++;
        samples++;
      }
    }
  }
  assert.equal(fieldWasm.recordReads, fieldTs.recordReads, 'the same reads answered by a top');
  assert.ok(lifted > 500, `the roofs lift the samples (${lifted})`);
  console.log(`wasmWorldKernels.selftest: urban support on the kernel: ${samples} samples x 4 samplers over 240 hulls (${lifted} on a top), through stamps laid before and after the bind, a clock step and a reset, identical`);
  ts.release?.(); wasm.release?.();
}

// the server's switch (on by default since 2026-10-25): unset and `wasm` are the module, `ts` the TypeScript, anything
// else refused
assert.ok((await serverWorldKernels('')) instanceof WebAssembly.Module);
assert.equal(await serverWorldKernels('ts'), null);
assert.ok((await serverWorldKernels('wasm')) instanceof WebAssembly.Module);
await assert.rejects(serverWorldKernels('rust'), /COT_SIM_KERNELS=rust/);

// a whole match on each world: every tank's pose and combat, every shell and the destroyed records agree at every check
const specs = ['m1a1_abrams_hc', 't90am', 'leo2_improved', 'leclerc_sxxi', 'merkava4', 'challenger2'];
const players = [{ id: 'h1', specId: 'm1a1_abrams_hc', team: 'alpha' }, { id: 'h2', specId: 't90am', team: 'bravo' }];
for (let i = 0; i < 8; i++) players.push({ id: `b${i}`, specId: specs[i % specs.length], team: i % 2 ? 'bravo' : 'alpha', bot: true, difficulty: ['easy', 'normal', 'hard'][i % 3] });
const build = (kernels) => {
  const match = createAuthoritativeMatch({ players: players.map((p) => ({ ...p })), mapId: 'verdant', seed: 7, countdownS: 0, worldCollision: createDedicatedWorldCollision('verdant', { kernels }) });
  match.onMatchReady();
  return match;
};
const digest = (match) => {
  const hash = createHash('sha256');
  for (const e of match.entities) {
    const s = e.state, c = e.combat;
    hash.update(`${e.id}|${s.pos.x},${s.pos.y},${s.pos.z}|${s.yaw}|${s.speed}|${s.turretYaw}|${s.gunPitch}|${c.hp}|${c.destroyed}|${c.ammo?.join(',')}|${c.reload?.t}|${e.kills}|${e.damage}\n`);
  }
  const snap = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: '__k__', ackInputSeq: null });
  for (const sh of snap.shells) hash.update(`${sh.id} ${sh.x} ${sh.y} ${sh.z} ${sh.vx} ${sh.vy} ${sh.vz}\n`);
  hash.update(JSON.stringify(snap.meta.destroyedObstacleIndices ?? []));
  return hash.digest('hex');
};
const scripted = (index, tick) => {
  const t = tick + index * 97, fire = t % 240 === 0 && t > 200;
  return { throttle: t > 120 ? (t % 1400 < 1100 ? 1 : 0.2) : 0, steer: Math.sin(t / 240) * 0.6, brake: false, fire, fireIntentSeq: fire ? Math.floor(t / 240) : null,
    aimLocked: false, shellSlot: 0, actionBits: 0, aimYaw: Math.sin(t / 400) * 1.2, aimPitch: 0.02, aimDistance: 300 };
};
const matches = [build(null), build(module)];
const inputs = new Map();
let checks = 0;
for (let tick = 1; tick <= 900; tick++) {
  inputs.set('h1', scripted(0, tick));
  inputs.set('h2', scripted(1, tick));
  for (const match of matches) { match.step({ dt: SIM_DT, inputs }); match.eventsForViewer('__k__'); match.afterEventBroadcast(); }
  if (tick % 150 === 0) { assert.equal(digest(matches[1]), digest(matches[0]), `the match on the kernels at tick ${tick}`); checks++; }
}
console.log(`wasmWorldKernels.selftest: a 900-tick match of ${players.length} tanks on the kernels shares the TypeScript's state digest at all ${checks} checks`);
