// Ground lane (2026-10-03): the land use (landUse.ts) — the per-map field system the terrain material draws and the
// tiers that grow on the ground stand on. Pins: every row names a real map and packs into the material's three vec4
// uniforms; the CPU twin is deterministic, lays fields of one crop each in the region's rotation, rings them with a
// margin and agrees on a track from both sides of its boundary; and the GLSL (LAND_USE_GLSL) carries the same
// rotation, warp and hash constants as the twin (the SwiftShader parity run of `.qa-dev/landuse-parity.mjs` measured
// 0.05 % crop disagreement — boundary hairlines — on Amberford). No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createLandFieldSample, LAND_CROP, LAND_USE_GLSL, landUseAt, landUseProfileIds, landUseUniformValues,
  resolveLandUseProfile,
} from './landUse.ts';
import { MAP_IDS } from './maps/catalog.ts';

// the table: real maps, packing in range, zero strength without a row
for (const id of landUseProfileIds()) assert.ok(MAP_IDS.includes(id), `${id} is a map`);
assert.equal(resolveLandUseProfile('no-such-map'), null);
assert.deepEqual(landUseUniformValues(null).landA[0], 0, 'no row: strength 0 (the material draws no fields)');
for (const id of landUseProfileIds()) {
  const p = resolveLandUseProfile(id);
  const v = landUseUniformValues(p);
  assert.ok(v.landA[0] > 0 && v.landA[0] <= 1, `${id}: strength in (0, 1]`);
  assert.ok(v.landA[2] >= 40 && v.landA[3] >= 40, `${id}: blocks at least 40 m`);
  assert.ok(v.landB[0] >= 1 && v.landB[0] <= 4 && Number.isInteger(v.landB[0]), `${id}: 1..4 fields a block`);
  assert.ok(v.landB[2] >= 0 && v.landB[2] <= 1 && v.landB[3] >= 0 && v.landB[3] <= 1, `${id}: shares in [0, 1]`);
}

// the twin over Amberford: determinism, one crop per field, the rotation, margins and tracks
const verdant = resolveLandUseProfile('verdant');
assert.ok(verdant, 'Amberford carries the steppe field system');
const s = createLandFieldSample(), t = createLandFieldSample();
const hist = new Map();
const fields = new Map();
let trackPts = 0, marginPts = 0, n = 0;
for (let z = -500; z <= 500; z += 4) {
  for (let x = -500; x <= 500; x += 4) {
    landUseAt(verdant, x, z, s);
    landUseAt(verdant, x, z, t);
    assert.deepEqual({ ...s }, { ...t }, 'the twin is a pure function of the point');
    assert.equal(s.active, 1);
    n++;
    hist.set(s.crop, (hist.get(s.crop) ?? 0) + 1);
    if (s.track > 0.5) trackPts++;
    if (s.edgeM < s.marginM) marginPts++;
    const prior = fields.get(s.id);
    if (prior === undefined) fields.set(s.id, s.crop);
    else assert.equal(prior, s.crop, `field ${s.id} carries one crop`);
    assert.ok(Math.abs(Math.hypot(s.rowX, s.rowZ) - 1) < 1e-9, 'the row direction is a unit vector');
    assert.ok(s.marginM >= verdant.marginM * 0.7 - 1e-9 && s.marginM <= verdant.marginM * 1.3 + 1e-9, 'the margin stays within ±30 %');
  }
}
assert.ok(fields.size >= 30, `a battlefield of fields, not a few (${fields.size})`);
for (const crop of [LAND_CROP.pasture, LAND_CROP.wheat, LAND_CROP.barley, LAND_CROP.green, LAND_CROP.plough, LAND_CROP.stubble]) {
  assert.ok((hist.get(crop) ?? 0) / n > 0.03, `crop ${crop} is sown somewhere (${((hist.get(crop) ?? 0) / n * 100).toFixed(1)} %)`);
}
assert.ok(trackPts / n > 0.005 && trackPts / n < 0.08, `tracks are lines, not fields (${(trackPts / n * 100).toFixed(2)} %)`);
assert.ok(marginPts / n > 0.01 && marginPts / n < 0.15, `margins ring the fields (${(marginPts / n * 100).toFixed(2)} %)`);

// a track is the boundary's, not a block's: both sides of a long boundary agree on it
{
  const ch = Math.cos(verdant.heading), sh = Math.sin(verdant.heading);
  let agree = 0, checked = 0;
  for (let i = 0; i < 400; i++) {
    // walk across the rows (the v axis) and find the row lines by the boundary distance minimum
    const u = -300 + (i % 20) * 31, v0 = -400 + Math.floor(i / 20) * 41;
    let best = null;
    for (let dv = 0; dv < 160; dv += 0.5) {
      const qv = v0 + dv, x = ch * u - sh * qv, z = sh * u + ch * qv;
      landUseAt(verdant, x, z, s);
      if (s.track > 0.99 && (best === null || s.edgeM < best.edge)) best = { edge: s.edgeM, x, z };
    }
    if (!best) continue;
    // one metre to either side across the line
    landUseAt(verdant, best.x - sh * 1.0 * -1, best.z + ch * 1.0 * -1, s);
    landUseAt(verdant, best.x - sh * 1.0, best.z + ch * 1.0, t);
    checked++;
    if (Math.abs(s.track - t.track) < 0.05) agree++;
  }
  assert.ok(checked > 20 && agree / checked > 0.95, `both sides of a track agree (${agree}/${checked})`);
}

// the GLSL carries the twin's constants: the rotations' cumulative weights, the warp, the hash
{
  const src = readFileSync(new URL('./landUse.ts', import.meta.url), 'utf8');
  const rot = (region) => {
    const m = new RegExp(`${region}: \\[([^\\n]*)\\],`).exec(src);
    return [...m[1].matchAll(/\[(\d), ([0-9.]+)\]/g)].map((r) => Number(r[2]));
  };
  const steppe = rot('steppe'), bocage = rot('bocage');
  const cum = (w) => w.slice(0, 6).reduce((acc, x) => [...acc, (acc.at(-1) ?? 0) + x], []);
  const glslPairs = [...LAND_USE_GLSL.matchAll(/c(\d) = (?:c\d \+ )?\(region > 0\.5 \? ([0-9.]+) : ([0-9.]+)\)/g)]
    .map((m) => [Number(m[2]), Number(m[3])]);
  const c0 = /float c0 = region > 0\.5 \? ([0-9.]+) : ([0-9.]+);/.exec(LAND_USE_GLSL);
  const glslBocage = [Number(c0[1]), ...glslPairs.map((p) => p[0])];
  const glslSteppe = [Number(c0[2]), ...glslPairs.map((p) => p[1])];
  const close = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(close(cum(glslSteppe), cum(steppe)), `the GLSL steppe rotation matches (${glslSteppe} vs ${steppe})`);
  assert.ok(close(cum(glslBocage), cum(bocage)), `the GLSL bocage rotation matches (${glslBocage} vs ${bocage})`);
  for (const k of ['0.00523', '0.00311', '-0.00197', '0.00877', '0.00409', '0.00587', '0.00913', '0.00241']) {
    assert.ok(src.split(k).length >= 3, `warp coefficient ${k} appears in both the twin and the GLSL`);
  }
  for (const k of ['0x7feb352d', '0x846ca68b', '0x9e3779b1', '0x85ebca6b']) {
    assert.ok(src.split(k).length >= 3, `hash constant ${k} appears in both the twin and the GLSL`);
  }
  assert.ok(!/sampler2D/.test(LAND_USE_GLSL), 'the field layout takes no sampler (the material sits at 16 units)');
}

console.log(`landUse: ${landUseProfileIds().length} map row(s), ${fields.size} Amberford fields, crops ${[...hist.entries()].sort().map(([c, k]) => `${c}:${(k / n * 100).toFixed(0)}%`).join(' ')}, tracks agree across their boundary, GLSL constants match the twin PASS; no GPU/art claim`);
