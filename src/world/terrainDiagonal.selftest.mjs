// terrainDiagonal.selftest.mjs — the steep-cell diagonal (ground lane, 2026-10-15; the maps critics on Aegis' gorge:
// "a sawtooth crest"). One rule (terrainContactSurface.ts terrainCellFlipped) splits a folded steep cell along a–d; the
// drawn mesh, the contact surface the simulation drives on, the battle's ground overlay and the debris ground take it on
// the same Float32 corner heights, so what is drawn is what is driven.
//
// 1. the rule: a cliff's lip flips; a plane (however steep) and ordinary ground keep b–c; symmetric in its corners;
// 2. the two splits agree on every cell border (a flipped cell opens no crack with its neighbours), and a flipped lip
//    keeps its crest where b–c sawed it down;
// 3. the contact sampler on a synthetic lip: the flip, the surface and its normal on both triangles;
// 4. a real steep map (Redrock Divide): every LOD0 cell of the built chunk carries the contact surface's split in its
//    index, real mesh raycasts in flipped cells are the contact height, the near-mesh height agrees, and a chunk with no
//    steep cell keeps the pooled index itself;
// 5. a crater over flipped cells: the deformed contact height is the base-plus-overlay lattice on the base's split, and
//    the debris ground (latticeGround) reads the same surface.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHeightField, terrainNearMeshHeightAt } from './terrain.ts';
import {
  createTerrainContactSampler, terrainCellFlipped, terrainCellHeight, TERRAIN_FLIP_FOLD_M, TERRAIN_FLIP_MARGIN_M,
} from './terrainContactSurface.ts';
import { getMapConfig } from './maps/index.ts';
import { createDeformedHeightField, createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { createLatticeGround } from '../fx/latticeGround.ts';

// ---- 1. the rule
assert.equal(TERRAIN_FLIP_MARGIN_M, 1);
assert.equal(TERRAIN_FLIP_FOLD_M, 0.5);
assert.equal(terrainCellFlipped(0, 0, -4, 0), true, 'a lip along a–d (plateau b, drop c) flips');
assert.equal(terrainCellFlipped(0, -4, 0, 0), true, 'and mirrored');
assert.equal(terrainCellFlipped(0, 3, -3, 0), false, 'a steep plane draws the same either way: no flip');
assert.equal(terrainCellFlipped(0, 0.2, 0.3, 0.5), false, 'ordinary ground keeps b–c');
assert.equal(terrainCellFlipped(0, 0, -1.4, 0), true, 'just past both thresholds');
assert.equal(terrainCellFlipped(0, 0, -0.9, 0), false, 'under the margin');
assert.equal(terrainCellFlipped(0, 1.2, -0.2, 0.75), false, 'a b–c pair 1.4 m apart over a–d 0.75 m: under the margin');
assert.equal(terrainCellFlipped(-4, 0, 0, 0), false, 'a pit at a corner: b–c is already the short diagonal');
let rs = 0x7e11;
const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 2000; i++) {
  const a = (rnd() - .5) * 8, b = (rnd() - .5) * 8, c = (rnd() - .5) * 8, d = (rnd() - .5) * 8;
  const f = terrainCellFlipped(a, b, c, d);
  assert.equal(terrainCellFlipped(a, c, b, d), f, 'symmetric in b, c');
  assert.equal(terrainCellFlipped(d, b, c, a), f, 'symmetric in a, d');
  assert.equal(terrainCellFlipped(a + 7, b + 7, c + 7, d + 7), f, 'blind to the cell\'s height');
}

// ---- 2. the surface: corners, borders, the crest
for (let i = 0; i < 500; i++) {
  const a = (rnd() - .5) * 8, b = (rnd() - .5) * 8, c = (rnd() - .5) * 8, d = (rnd() - .5) * 8, t = rnd();
  for (const flipped of [false, true]) {
    const h = (u, v) => terrainCellHeight(a, b, c, d, u, v, flipped);
    assert.ok(Math.abs(h(0, 0) - a) < 1e-12 && Math.abs(h(1, 0) - b) < 1e-12 && Math.abs(h(0, 1) - c) < 1e-12
      && Math.abs(h(1, 1) - d) < 1e-12, 'the corners');
    // every border is the straight edge between its corners on either split: no crack against a neighbour
    for (const [u, v, want] of [[t, 0, a + (b - a) * t], [0, t, a + (c - a) * t], [t, 1, c + (d - c) * t], [1, t, b + (d - b) * t]]) {
      assert.ok(Math.abs(h(u, v) - want) < 1e-12, `the border at ${u},${v} (${flipped ? 'a–d' : 'b–c'})`);
    }
  }
}
{
  // a cliff's lip on a 1.333 m cell: the a–d edge is the crest; b–c sawed it to the cliff's half height
  const a = 0, b = 0, c = -4, d = 0;
  assert.equal(terrainCellHeight(a, b, c, d, .5, .5, true), 0, 'the lip holds its crest');
  assert.equal(terrainCellHeight(a, b, c, d, .5, .5, false), -2, 'b–c cut it to half the drop');
}

// ---- 3. the contact sampler on a synthetic lip along x = z (the plateau east of it, a 4:1 drop to the west)
{
  const lip = (x, z) => (x - z >= 0 ? 0 : 4 * (x - z));
  const contact = createTerrainContactSampler(lip);
  const STEP = 128 / 96;
  let flippedLip = 0, kept = 0, normals = 0;
  const n = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 400; k++) {
    // a lip cell (its a and d on x = z), the plateau beside it and the face below
    const i = 300 + (k % 200);
    const x0 = -512 + i * STEP, z0 = x0;
    assert.equal(contact.cellFlippedAt(x0 + .4 * STEP, z0 + .7 * STEP), true, `the lip cell ${i} flips`);
    flippedLip++;
    assert.equal(contact.cellFlippedAt(x0 + 2.5 * STEP, z0 + .5 * STEP), false, 'the plateau keeps b–c');
    assert.equal(contact.cellFlippedAt(x0 - 2.5 * STEP, z0 + .5 * STEP), false, 'a plane face keeps b–c');
    kept += 2;
    const u = rnd(), v = rnd();
    const x = x0 + u * STEP, z = z0 + v * STEP;
    const want = u >= v ? 0 : 4 * (x - z);
    assert.ok(Math.abs(contact(x, z) - want) < 1e-4, `the lip surface at ${u.toFixed(3)},${v.toFixed(3)}: ${contact(x, z)} vs ${want}`);
    contact.normalAt(x, z, n);
    const up = u >= v ? [0, 1, 0] : [-4 / Math.hypot(4, 1, 4), 1 / Math.hypot(4, 1, 4), 4 / Math.hypot(4, 1, 4)];
    assert.ok(Math.abs(n.x - up[0]) < 1e-4 && Math.abs(n.y - up[1]) < 1e-4 && Math.abs(n.z - up[2]) < 1e-4,
      `the face's own normal (${n.x.toFixed(4)}, ${n.y.toFixed(4)}, ${n.z.toFixed(4)})`);
    normals++;
    assert.ok(Math.abs(contact((x0 + x0 + STEP) / 2, (z0 + z0 + STEP) / 2)) < 1e-4, 'the crest between a and d is the lip');
  }
  assert.equal(contact.cellFlippedAt(9999, 0), false, 'off the square: no cell');
  console.log(`terrainDiagonal: rule, borders and the synthetic lip (${flippedLip} lip cells, ${kept} kept, ${normals} normals)`);
}

// ---- 4. a real steep map: the built LOD0 carries the contact surface's split
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const chunks = source.slice(source.indexOf('const CHUNKS = 8'));
const api = new Function('THREE', 'terrainCellFlipped', 'terrainCellHeight', stripTypeScriptTypes(`
  const MAP_SIZE = 1024, HALF = 512;
  ${chunks.replace(/^export /gm, '')}
`) + 'return { buildFineGridSteps, buildChunkGeometrySteps, acquireTerrainChunkIndex };')(THREE, terrainCellFlipped, terrainCellHeight);
const drain = (steps) => { let r; do { r = steps.next(); } while (!r.done); return r.value; };
const STEP = 128 / 96;
const redrock = createHeightField(1337, getMapConfig('badlands'));
const pool = new Map();
const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
const material = new THREE.MeshBasicMaterial();
const chunkSplits = (hf, cx0, cz0) => {
  const fine = drain(api.buildFineGridSteps(hf, cx0, cz0));
  const geometry = drain(api.buildChunkGeometrySteps(hf, cx0, cz0, 96, fine, null, pool));
  const index = geometry.index.array;
  let flipped = 0;
  const cells = [];
  for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
    const ii = (j * 96 + i) * 6, a = j * 97 + i, d = a + 98;
    const drawn = index[ii + 1] === d;
    if (drawn) assert.deepEqual([...index.slice(ii, ii + 6)], [a, d, a + 1, a, a + 97, d], 'a flipped cell: (a, d, b), (a, c, d), facing up');
    else assert.deepEqual([...index.slice(ii, ii + 6)], [a, a + 97, a + 1, a + 1, a + 97, d], 'a kept cell: (a, c, b), (b, c, d)');
    const x = cx0 + (i + .5) * STEP, z = cz0 + (j + .5) * STEP;
    assert.equal(drawn, hf.getContactCellFlippedAt(x, z), `cell ${i},${j} of ${cx0},${cz0}: the mesh and the contact surface split alike`);
    if (drawn) { flipped++; cells.push([i, j]); }
  }
  return { geometry, flipped, cells };
};
{
  const { geometry, flipped, cells } = chunkSplits(redrock, 384, -512);
  assert.ok(flipped > 200, `Redrock's south-east chunk holds steep cells (${flipped})`);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  let hits = 0, worst = 0, nearWorst = 0;
  const vertexHeight = (x, z) => redrock.getHeightAt(x, z);
  for (let k = 0; k < cells.length; k += Math.max(1, (cells.length / 120) | 0)) {
    const [i, j] = cells[k];
    for (const [u, v] of [[.7, .2], [.2, .7], [.52, .48]]) {
      const x = 384 + (i + u) * STEP, z = -512 + (j + v) * STEP;
      ray.set(origin.set(x, 400, z), down);
      const hit = ray.intersectObject(mesh, false)[0];
      assert.ok(hit, 'a drawn triangle');
      const contact = redrock.getContactHeightAt(x, z);
      worst = Math.max(worst, Math.abs(contact - hit.point.y));
      nearWorst = Math.max(nearWorst, Math.abs(terrainNearMeshHeightAt(vertexHeight, x, z) - hit.point.y));
      hits++;
    }
  }
  assert.ok(worst < 1e-4, `flipped cells: the drawn triangle is the contact surface (worst ${worst.toExponential(2)} m over ${hits} raycasts)`);
  assert.ok(nearWorst < 1e-3, `and the near-mesh height props seat on (worst ${nearWorst.toExponential(2)} m)`);
  geometry.dispose();
  console.log(`terrainDiagonal: Redrock 384,-512 — ${flipped} flipped cells, mesh = contact split on all 9216, ${hits} raycasts (worst ${worst.toExponential(2)} m)`);
}
{
  const verdant = createHeightField(1337, getMapConfig('verdant'));
  const { geometry, flipped } = chunkSplits(verdant, -128, -128);
  assert.equal(flipped, 0, 'Verdant\'s centre has no folded steep cell');
  assert.equal(geometry.index, pool.get(96).attribute, 'a chunk with no steep cell keeps the pooled index itself');
  geometry.dispose();
}

// ---- 5. a crater over flipped cells: the overlay rides the base's split; the debris ground reads the same surface
{
  const { geometry, cells } = chunkSplits(redrock, 384, -512);
  geometry.dispose();
  const [ci, cj] = cells[(cells.length / 2) | 0];
  const cx = 384 + (ci + .5) * STEP, cz = -512 + (cj + .5) * STEP;
  const overlay = createTerrainDeformation();
  assert.ok(overlay.addCrater(cx, cz, 3.2, 1.1, 0.35, 77));
  assert.ok(overlay.addCrater(cx + 2.1, cz - 1.4, 2.4, 0.8, 0.25, 78));
  const deformed = createDeformedHeightField(redrock, overlay);
  const drawnAt = (x, z) => redrock.getContactHeightAt(x, z) + overlay.contactOffsetAt(x, z, redrock.getContactCellFlippedAt(x, z));
  const ground = createLatticeGround(drawnAt, () => overlay.revision, (x, z) => redrock.getContactCellFlippedAt(x, z));
  let checked = 0, flippedChecked = 0, worst = 0, latticeWorst = 0;
  for (let k = 0; k < 3000; k++) {
    const x = cx - 5 + rnd() * 10, z = cz - 5 + rnd() * 10;
    const ix = Math.floor((x + 512) / STEP), iz = Math.floor((z + 512) / STEP);
    const x0 = -512 + ix * STEP, z0 = -512 + iz * STEP;
    const at = (px, pz) => redrock.getContactHeightAt(px, pz) + overlay.contactOffsetAt(px, pz);
    const flipped = redrock.getContactCellFlippedAt(x, z);
    const want = terrainCellHeight(at(x0, z0), at(x0 + STEP, z0), at(x0, z0 + STEP), at(x0 + STEP, z0 + STEP),
      (x - x0) / STEP, (z - z0) / STEP, flipped);
    worst = Math.max(worst, Math.abs(deformed.getContactHeightAt(x, z) - want));
    latticeWorst = Math.max(latticeWorst, Math.abs(ground(x, z) - deformed.getContactHeightAt(x, z)));
    checked++;
    if (flipped) flippedChecked++;
  }
  assert.ok(flippedChecked > 100, `the craters lie over flipped cells (${flippedChecked} of ${checked} points)`);
  assert.ok(worst < 2e-4, `the deformed contact height is base + overlay on the base's split (worst ${worst.toExponential(2)} m)`);
  assert.ok(latticeWorst < 2e-4, `the debris ground reads the same surface (worst ${latticeWorst.toExponential(2)} m)`);
  console.log(`terrainDiagonal: craters over steep cells — ${checked} points (${flippedChecked} flipped), worst ${worst.toExponential(2)} m, lattice ${latticeWorst.toExponential(2)} m`);
}
material.dispose();
