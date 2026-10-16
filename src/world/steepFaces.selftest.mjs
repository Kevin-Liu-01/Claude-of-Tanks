// steepFaces.selftest (2026-10-15, the ground lane; the maps critics on Aegis' gorge (-0.80) and Redrock: "one smooth
// stretched ochre wall with a sawtooth crest and no strata or ledges", "smeared into vertical streaks"). Two render-only
// laws, neither read by the sim (the contact surface takes the drawn triangle's own face normal and the heights):
// (1) a steep vertex's normal is the mean gradient over three spans (one, two and three fine steps, never under half,
//     one and one and a half of the chunk's own step), so a crest's and a wall foot's normals no longer swing from
//     column to column and stripe the wall triangles; every vertex under ~50 deg keeps its one-step central difference;
// (2) every sheer face carries beds: the strata's strength never under the map's cliff floor past ~55 deg
//     (splat.cliffStrata, CLIFF_STRATA_FLOOR by default; a map that authors strata 0 carries none), and the sheerest
//     faces keep three quarters of the beds (they kept 40 %).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { CLIFF_STRATA_FLOOR, STEEP_NORMAL_G2 } from './terrain.ts';
// (2026-10-15) the chunk builder's steep-cell split (terrainContactSurface.ts terrainCellFlipped, the steep-diagonal item)
// reaches this sandbox the way terrain.ts imports it; read off the module so either landing order evaluates
import * as contactSurface from './terrainContactSurface.ts';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const chunks = source.slice(source.indexOf('const CHUNKS = 8'));
const api = new Function('THREE', 'terrainCellFlipped', 'terrainCellHeight', stripTypeScriptTypes(`
  const MAP_SIZE = 1024, HALF = 512;
  ${chunks.replace(/^export /gm, '')}
`) + 'return { buildFineGridSteps, buildChunkGeometrySteps, CHUNK_SIZE, FINE_SEGS };')(THREE,
  contactSurface.terrainCellFlipped, contactSurface.terrainCellHeight);
const drain = (steps) => { let r; do { r = steps.next(); } while (!r.done); return r.value; };

// a gorge wall: 34 m of rock rising over ~6 m along x near x = 40, its crest wandering in z (a crest no grid aligns
// with), and a gentle 4 % slope everywhere else
const crestX = (z) => 40 + 3.2 * Math.sin(z * 0.37) + 1.7 * Math.sin(z * 0.91 + 1.3);
const height = (x, z) => 0.04 * z + 34 / (1 + Math.exp(-(x - crestX(z)) / 1.1));
const hf = { getHeightAt: height };
const stepF = api.CHUNK_SIZE / api.FINE_SEGS;
const oneStep = (x, z) => {
  const nx = (height(x - stepF, z) - height(x + stepF, z)) / (2 * stepF), nz = (height(x, z - stepF) - height(x, z + stepF)) / (2 * stepF);
  const il = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
  return [nx * il, il, nz * il];
};
for (const segs of [96, 48, 24]) {
  const fine = drain(api.buildFineGridSteps(hf, 0, -64));
  const geometry = drain(api.buildChunkGeometrySteps(hf, 0, -64, segs, fine));
  const pos = geometry.getAttribute('position'), nrm = geometry.getAttribute('normal');
  const n = segs + 1;
  let gentle = 0, steep = 0, swingOld = 0, swingNew = 0;
  for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
    const i = gz * n + gx, x = pos.getX(i), z = pos.getZ(i);
    const old = oneStep(x, z);
    const g2 = (old[0] / old[1]) ** 2 + (old[2] / old[1]) ** 2;
    if (g2 <= STEEP_NORMAL_G2) {
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(nrm.getComponent(i, k) - old[k]) < 2e-4, `${segs}: a gentle vertex keeps its one-step normal (to its float32 position)`);
      gentle++;
    } else steep++;
    // the swing along the wall: each vertex against its +z neighbour, where both stand on the face
    if (gz + 1 < n && g2 > STEEP_NORMAL_G2) {
      const j = i + n, oldJ = oneStep(pos.getX(j), pos.getZ(j));
      swingOld += Math.hypot(old[0] - oldJ[0], old[2] - oldJ[2]);
      swingNew += Math.hypot(nrm.getX(i) - nrm.getX(j), nrm.getZ(i) - nrm.getZ(j));
    }
  }
  assert.ok(gentle > steep && steep > 20, `${segs} segments: the wall is steep, the rest gentle (${steep} / ${gentle})`);
  assert.ok(swingNew < swingOld * 0.85, `${segs} segments: the wall's normals swing less along it (${swingNew.toFixed(1)} vs ${swingOld.toFixed(1)})`);
  for (let i = 0; i < nrm.count; i++) assert.ok(Math.abs(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) - 1) < 1e-5, 'unit normals');
}

// the shader: the cliff floor, the sheerest faces' beds, the uniform's default
const flat = source.replace(/\s+/g, ' ');
assert.ok(flat.includes('float strataK = max(uStrata, uCliffStrata * smoothstep(0.42, 0.62, slope)); if (strataK > 0.001) {'), 'every sheer face is bedded rock');
assert.ok(flat.includes('float bedAmp = strataK * steep * (0.65 + gCliffJ * 0.7) * (1.0 - 0.25 * smoothstep(0.80, 0.97, slope))'), 'the sheerest faces keep three quarters of their beds');
assert.ok(flat.includes('float jointAmp = smoothstep(0.06, 0.16, strataK) * steep;'), 'the joint blocks and the varnish on the cliff floor too');
assert.ok(source.includes('shader.uniforms.uCliffStrata = { value: S.cliffStrata ?? (S.strata === 0 ? 0 : CLIFF_STRATA_FLOOR) };'),
  'the floor by default, none where a map authors no strata at all');
assert.ok(CLIFF_STRATA_FLOOR > 0.1 && CLIFF_STRATA_FLOOR < 0.2);
// render only: the contact surface (the sim's ground) reads the heights and the drawn face, never the vertex normals
const contact = readFileSync(new URL('./terrainContactSurface.ts', import.meta.url), 'utf8');
assert.ok(!/getAttribute\(['"]normal['"]\)/.test(contact), 'the sim\'s contact surface never reads the vertex normals');
console.log(`steepFaces.selftest: steep normals over three spans (gentle vertices unchanged; the wall's swing down at 96/48/24 segments), the cliff floor ${CLIFF_STRATA_FLOOR} and the sheerest faces' beds PASS`);
