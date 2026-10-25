#!/usr/bin/env node
// Copyright (c) Kevin B. Liu. See NOTICE.md.
//
// The Rust kernels' fixture corpus, recorded from a real authoritative battle: every terrain contact sample the hulls
// take (src/world/terrainContactSurface.ts) and every obstacle-grid query the match makes (createObstacleGrid in
// src/world/collision.ts), each with the TypeScript's answer, plus the data the kernels need to answer them alone: the
// contact lattice's Float32 corners (the map's height function at every vertex), the centre heights of its steep-fold
// cells, and the obstacle records' plan boxes in the grid's own order. tools/rust-kernel-bench.mjs replays it through
// the TypeScript and the WebAssembly kernels, proves both reproduce every recorded answer bit for bit, and times them.
//
//   node tools/rust-kernel-fixtures.mjs [--map=verdant] [--ticks=3600] [--bots=16] [--out=.qa-dev/rust/fixtures]
//
// Files (little-endian): lattice.f32 (769 × 769 corners, z-major), folds.f64 (ix, iz, centre per fold candidate),
// samples.f64 (x, z, height per contact sample), boxes.f64 (minX, minZ, maxX, maxZ per record), queries.f64 (the
// boxes asked), counts.u32 and indices.u32 (each answer), meta.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import '../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { SIM_DT } from '../src/sim/movement.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { terrainCellFoldCandidate } from '../src/world/terrainContactSurface.ts';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const mapId = arg('map', 'verdant');
const ticks = Number(arg('ticks', 3600));
const bots = Number(arg('bots', 16));
const out = path.resolve(arg('out', '.qa-dev/rust/fixtures'));
const MAX_SAMPLES = Number(arg('max-samples', 3_000_000));
const MAX_QUERIES = Number(arg('max-queries', 600_000));

// the lattice terrainContactSurface lays out (SIZE 1024, CHUNK 128, SEGMENTS 96)
const SIZE = 1024, HALF = SIZE / 2, CHUNK = 128, SEGMENTS = 96, CELLS = SIZE / CHUNK * SEGMENTS, N = CELLS + 1;
const STEP = CHUNK / SEGMENTS;
const exact = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const chunk = Math.min(Math.floor(i / SEGMENTS), SIZE / CHUNK - 1);
  exact[i] = -HALF + chunk * CHUNK + (i - chunk * SEGMENTS) * STEP;
}

const world = createDedicatedWorldCollision(mapId, { retain: true });
const heightField = world.heightField;

// the recorders, installed before the match binds either function
const samples = new Float64Array(MAX_SAMPLES * 3);
let sampleCount = 0, offSquare = 0, samplesSeen = 0;
const contact = heightField.getContactHeightAt;
const recordContact = Object.assign((x, z) => {
  const h = contact(x, z);
  samplesSeen++;
  if (x < -HALF || x > HALF || z < -HALF || z > HALF) offSquare++;
  else if (sampleCount < MAX_SAMPLES) {
    samples[sampleCount * 3] = x; samples[sampleCount * 3 + 1] = z; samples[sampleCount * 3 + 2] = h;
    sampleCount++;
  }
  return h;
}, { normalAt: contact.normalAt, cellFlippedAt: contact.cellFlippedAt, seedGrid: contact.seedGrid });
heightField.getContactHeightAt = recordContact;

const records = [...new Set(world.getObstacles())];
const slot = new Map(records.map((r, i) => [r, i]));
const queries = new Float64Array(MAX_QUERIES * 4);
const counts = new Uint32Array(MAX_QUERIES);
let indices = new Uint32Array(1 << 22), indexCount = 0, queryCount = 0, queriesSeen = 0;
const query = world.queryObstacles;
world.queryObstacles = Object.assign(function recordQuery(minX, minZ, maxX, maxZ, list) {
  const result = query(minX, minZ, maxX, maxZ, list);
  queriesSeen++;
  if (queryCount < MAX_QUERIES) {
    queries.set([minX, minZ, maxX, maxZ], queryCount * 4);
    counts[queryCount] = result.length;
    if (indexCount + result.length > indices.length) { const grown = new Uint32Array(indices.length * 2); grown.set(indices); indices = grown; }
    for (const r of result) indices[indexCount++] = slot.get(r);
    queryCount++;
  }
  return result;
}, { rayOrder: query.rayOrder });

const specs = ['m1a1_abrams_hc', 't90am', 'leo2_improved', 'leclerc_sxxi', 'merkava4', 'challenger2', 'm1a2_abrams_sepv3', 'k2_black_panther'];
const players = [{ id: 'h1', specId: 'm1a1_abrams_hc', team: 'alpha' }, { id: 'h2', specId: 't90am', team: 'bravo' }];
for (let i = 0; i < bots; i++) players.push({ id: `b${i}`, specId: specs[i % specs.length], team: i % 2 ? 'bravo' : 'alpha', bot: true, difficulty: ['easy', 'normal', 'hard'][i % 3] });
const scripted = (index, tick) => {
  const t = tick + index * 97;
  return { throttle: t > 120 ? (t % 1400 < 1100 ? 1 : 0.2) : 0, steer: Math.sin(t / 240) * 0.6, brake: false, fire: t % 240 === 0 && t > 200,
    fireIntentSeq: t % 240 === 0 && t > 200 ? Math.floor(t / 240) : null, aimLocked: false, shellSlot: 0, actionBits: 0,
    aimYaw: Math.sin(t / 400) * 1.2, aimPitch: 0.02, aimDistance: 300 };
};
const match = createAuthoritativeMatch({ players, mapId, seed: 7, countdownS: 0, worldCollision: world });
match.onMatchReady();
const inputs = new Map();
for (let tick = 1; tick <= ticks; tick++) {
  inputs.set('h1', scripted(0, tick));
  inputs.set('h2', scripted(1, tick));
  match.step({ dt: SIM_DT, inputs });
  match.eventsForViewer('__fixtures__');
  match.afterEventBroadcast();
}

// the lattice and the folds, from the height function the sampler fills from
const lattice = new Float32Array(N * N);
for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) lattice[iz * N + ix] = heightField.getHeightAt(exact[ix], exact[iz]);
const folds = [];
for (let iz = 0; iz < CELLS; iz++) for (let ix = 0; ix < CELLS; ix++) {
  const a = lattice[iz * N + ix], b = lattice[iz * N + ix + 1], c = lattice[(iz + 1) * N + ix], d = lattice[(iz + 1) * N + ix + 1];
  if (terrainCellFoldCandidate(a, b, c, d)) folds.push(ix, iz, heightField.getHeightAt(exact[ix] + STEP * 0.5, exact[iz] + STEP * 0.5));
}
const boxes = new Float64Array(records.length * 4);
records.forEach((r, i) => boxes.set([r.min[0], r.min[2], r.max[0], r.max[2]], i * 4));

mkdirSync(out, { recursive: true });
const save = (name, typed) => writeFileSync(path.join(out, name), new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength));
save('lattice.f32', lattice);
save('folds.f64', new Float64Array(folds));
save('samples.f64', samples.subarray(0, sampleCount * 3));
save('boxes.f64', boxes);
save('queries.f64', queries.subarray(0, queryCount * 4));
save('counts.u32', counts.subarray(0, queryCount));
save('indices.u32', indices.subarray(0, indexCount));
const meta = { mapId, ticks, players: players.length, node: process.version, v8: process.versions.v8, arch: process.arch,
  samples: sampleCount, samplesSeen, offSquare, folds: folds.length / 3, records: records.length, queries: queryCount, queriesSeen, indices: indexCount };
writeFileSync(path.join(out, 'meta.json'), `${JSON.stringify(meta, null, 1)}\n`);
world.release?.();
console.log(`[rust-kernel-fixtures] ${JSON.stringify(meta)}`);
