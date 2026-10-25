#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The whole authoritative tick with the WebAssembly kernels behind the same interfaces: two matches from the same
// roster and seed in one process, A on the TypeScript (the shipping path), B with its terrain contact sampler and its
// obstacle grid answered by crates/cot-sim-wasm (the contact lattice filled lazily from the map's own height function,
// exactly as the TypeScript fills its own). Ticks alternate A B B A on thread CPU, so load drift cancels; a
// full-precision digest of every tank, shell and destroyed record is compared every 300 ticks — identical digests
// prove the kernels change no bit of the simulation.
//
//   node tools/rust-kernel-tick-ab.mjs [--map=verdant] [--ticks=3600] [--bots=16] [--kernels=contact,grid]
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';
import '../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { createCollisionManifestLoader } from '../server/collisionManifestLoader.ts';
import { loadCotSimWasmNode } from './cot-sim-wasm.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mapId = arg('map', 'verdant');
const ticks = Number(arg('ticks', 3600));
const bots = Number(arg('bots', 16));
const kernels = new Set(arg('kernels', 'contact,grid').split(','));
const N = 769;

/** The WebAssembly contact sampler over `heightAt`, behind the TypeScript sampler's interface. */
function wasmContactSampler(w, heightAt, js) {
  const heightsPtr = w.lattice_heights_ptr(), readyPtr = w.lattice_ready_ptr();
  w.lattice_flips_ptr();
  const coordinate = new Float64Array(N);
  for (let i = 0; i < N; i++) coordinate[i] = w.lattice_vertex_coordinate(i);
  const sample = w.contact_sample;
  const fill = (ix, iz) => {
    const heights = new Float32Array(w.memory.buffer, heightsPtr, N * N), ready = new Uint8Array(w.memory.buffer, readyPtr, Math.ceil(N * N / 8));
    for (const [x, z] of [[ix, iz], [ix + 1, iz], [ix, iz + 1], [ix + 1, iz + 1]]) {
      const i = z * N + x, byte = i >>> 3, bit = 1 << (i & 7);
      if (ready[byte] & bit) continue;
      heights[i] = heightAt(coordinate[x], coordinate[z]);
      ready[byte] |= bit;
    }
  };
  const slow = (x, z) => {
    for (;;) {
      const status = w.contact_status();
      if (status === 1) return heightAt(x, z);
      const ix = w.contact_missing_ix(), iz = w.contact_missing_iz();
      if (status === 2) fill(ix, iz);
      else if (status === 3) w.lattice_set_flip_from_centre(ix, iz, heightAt(coordinate[ix] + 128 / 96 * 0.5, coordinate[iz] + 128 / 96 * 0.5));
      const h = sample(x, z);
      if (h === h) return h;
    }
  };
  return Object.assign((x, z) => { const h = sample(x, z); return h === h ? h : slow(x, z); },
    { normalAt: js.normalAt, cellFlippedAt: js.cellFlippedAt, seedGrid: js.seedGrid });
}

/** The WebAssembly obstacle grid over the world's own records, behind the query interface (answers as records). */
function wasmObstacleQuery(w, records, js) {
  const boxes = new Float64Array(records.length * 4);
  records.forEach((r, i) => boxes.set([r.min[0], r.min[2], r.max[0], r.max[2]], i * 4));
  const ptr = w.scratch_ptr(boxes.byteLength);
  new Float64Array(w.memory.buffer, ptr, boxes.length).set(boxes);
  const handle = w.grid_new(ptr, records.length, 24);
  const base = w.grid_out_ptr(handle) >> 2;
  const query = w.grid_query;
  let u32 = new Uint32Array(w.memory.buffer);
  return Object.assign(function wasmQuery(minX, minZ, maxX, maxZ, out) {
    const m = query(handle, minX, minZ, maxX, maxZ);
    if (u32.buffer !== w.memory.buffer) u32 = new Uint32Array(w.memory.buffer);
    out.length = 0;
    for (let k = 0; k < m; k++) out.push(records[u32[base + k]]);
    return out;
  }, { rayOrder: js.rayOrder });
}

function digest(match) {
  const hash = createHash('sha256');
  for (const e of match.entities) {
    const s = e.state, c = e.combat;
    hash.update(`${e.id}|${s.pos.x},${s.pos.y},${s.pos.z}|${s.yaw}|${s.speed}|${s.turretYaw}|${s.gunPitch}|${c.hp}|${c.destroyed}|${c.ammo?.join(',')}|${c.reload?.t}|${e.kills}|${e.damage}\n`);
  }
  const snap = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: '__ab__', ackInputSeq: null });
  for (const sh of snap.shells) hash.update(`${sh.id} ${sh.x} ${sh.y} ${sh.z} ${sh.vx} ${sh.vy} ${sh.vz}\n`);
  hash.update(JSON.stringify(snap.meta.destroyedObstacleIndices ?? []));
  return hash.digest('hex').slice(0, 16);
}

const specs = ['m1a1_abrams_hc', 't90am', 'leo2_improved', 'leclerc_sxxi', 'merkava4', 'challenger2', 'm1a2_abrams_sepv3', 'k2_black_panther'];
const players = [{ id: 'h1', specId: 'm1a1_abrams_hc', team: 'alpha' }, { id: 'h2', specId: 't90am', team: 'bravo' }];
for (let i = 0; i < bots; i++) players.push({ id: `b${i}`, specId: specs[i % specs.length], team: i % 2 ? 'bravo' : 'alpha', bot: true, difficulty: ['easy', 'normal', 'hard'][i % 3] });
const scripted = (index, tick) => {
  const t = tick + index * 97;
  return { throttle: t > 120 ? (t % 1400 < 1100 ? 1 : 0.2) : 0, steer: Math.sin(t / 240) * 0.6, brake: false, fire: t % 240 === 0 && t > 200,
    fireIntentSeq: t % 240 === 0 && t > 200 ? Math.floor(t / 240) : null, aimLocked: false, shellSlot: 0, actionBits: 0,
    aimYaw: Math.sin(t / 400) * 1.2, aimPitch: 0.02, aimDistance: 300 };
};

const worldA = createDedicatedWorldCollision(mapId, { retain: true });
const w = await loadCotSimWasmNode();
const hf = worldA.heightField;
const heightFieldB = kernels.has('contact') ? { ...hf, getContactHeightAt: wasmContactSampler(w, hf.getHeightAt, hf.getContactHeightAt) } : { ...hf };
const worldB = createHeadlessCollisionWorld({ mapId, heightField: heightFieldB, manifest: createCollisionManifestLoader().get(mapId) });
if (kernels.has('grid')) worldB.queryObstacles = wasmObstacleQuery(w, [...new Set(worldB.getObstacles())], worldB.queryObstacles);

const build = (world) => {
  const match = createAuthoritativeMatch({ players: players.map((p) => ({ ...p })), mapId, seed: 7, countdownS: 0, worldCollision: world });
  match.onMatchReady();
  return match;
};
const sides = [{ name: 'A', match: build(worldA), cpu: [] }, { name: 'B', match: build(worldB), cpu: [] }];
const inputs = new Map();
const load0 = loadavg()[0];
let firstDiff = null;
const warm = 300;
for (let tick = 1; tick <= ticks; tick++) {
  inputs.set('h1', scripted(0, tick));
  inputs.set('h2', scripted(1, tick));
  const order = tick % 2 ? sides : [sides[1], sides[0]];
  for (const side of order) {
    const c0 = process.threadCpuUsage();
    side.match.step({ dt: SIM_DT, inputs });
    const c1 = process.threadCpuUsage(c0);
    if (tick > warm) side.cpu.push((c1.user + c1.system) / 1000);
    side.match.eventsForViewer('__ab__');
    side.match.afterEventBroadcast();
  }
  if (tick % 300 === 0) {
    const [da, db] = sides.map((s) => digest(s.match));
    if (da !== db && firstDiff === null) firstDiff = tick;
    console.log(`[tick-ab] tick ${tick}: A ${da} B ${db} ${da === db ? 'identical' : 'DIFFER'}`);
  }
}
const stats = (list) => { const sorted = [...list].sort((a, b) => a - b); return { mean: list.reduce((a, b) => a + b, 0) / list.length, p50: sorted[sorted.length >> 1], p95: sorted[Math.floor(sorted.length * 0.95)] }; };
const [sa, sb] = sides.map((s) => stats(s.cpu));
console.log(`[tick-ab] ${mapId}, ${players.length} tanks, ${ticks} ticks, kernels ${[...kernels].join('+')}, load ${load0.toFixed(1)} -> ${loadavg()[0].toFixed(1)}`);
console.log(`[tick-ab] A (TypeScript) mean ${sa.mean.toFixed(3)} ms p50 ${sa.p50.toFixed(3)} p95 ${sa.p95.toFixed(3)}; B (WebAssembly kernels) mean ${sb.mean.toFixed(3)} ms p50 ${sb.p50.toFixed(3)} p95 ${sb.p95.toFixed(3)}; B/A ${(sb.mean / sa.mean).toFixed(3)} (${((1 - sb.mean / sa.mean) * 100).toFixed(1)} % less tick CPU)`);
console.log(`[tick-ab] digests ${firstDiff === null ? 'identical at every check' : `DIFFER from tick ${firstDiff}`}`);
process.exitCode = firstDiff === null ? 0 : 1;
worldA.release?.();
