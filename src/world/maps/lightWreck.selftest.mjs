// Receipt for E1 (the props census, 2026-10-14; maps/lightWreck.ts, maps/craftAnatomy.ts): a light kind built part by
// part names its pieces (craftAnatomy), the anatomy passes checkKitFracture against the merged build, and its settled
// wreck (settleLightWreck) lays every piece and meets the r2 standard's wreck rules — a heap, not a raft: at least 25 %
// of the intact height (area-weighted 90th percentile of the triangles' heights) over at least 60 % of the intact plan,
// within 1.5 x the intact triangles, nothing under the ground — deterministic in its seed, and props.ts breaks a kind
// with an anatomy this way unless the kind keeps its own broken builder (a map's structure variant, the pillbox).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { checkKitFracture } from '../fractureAnatomy.ts';
import { craftAnatomy, piece } from './craftAnatomy.ts';
import { settleLightWreck } from './lightWreck.ts';

// a test hut: a floor on the ground, four corner posts, board walls (a door in the front), plates, a two-slope plank roof
// on its rafters and ridge, a stovepipe and a crate inside
function hut() {
  const parts = [];
  const add = (geo, spec, group = null, colour = [0.5, 0.4, 0.3]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(colour, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(piece(g, spec, group));
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const W = 3.0, D = 4.0, wallH = 2.4;
  add(box(W + 0.2, 0.15, D + 0.2, 0, 0.075, 0), { role: 'slab', material: 'timber' });
  for (const x of [-1, 1]) for (const z of [-1, 1]) add(box(0.14, wallH, 0.14, x * (W / 2 - 0.07), 0.15 + wallH / 2, z * (D / 2 - 0.07)), { role: 'post', material: 'timber' });
  for (const [name, z, x, along] of [['front', D / 2, 0, 'x'], ['back', -D / 2, 0, 'x'], ['right', 0, W / 2, 'z'], ['left', 0, -W / 2, 'z']]) {
    const len = along === 'x' ? W - 0.28 : D - 0.28, n = Math.round(len / 0.2);
    for (let k = 0; k < n; k++) {
      const u = -len / 2 + (k + 0.5) * len / n;
      if (name === 'front' && Math.abs(u) < 0.45) continue;
      const g = along === 'x' ? box(len / n - 0.01, wallH - 0.1, 0.04, u, 0.15 + wallH / 2, z) : box(0.04, wallH - 0.1, len / n - 0.01, x, 0.15 + wallH / 2, u);
      add(g, { role: 'wall', material: 'plank', face: name }, `wall-${name}`, [0.45, 0.36, 0.28]);
    }
  }
  add(box(0.86, 2.0, 0.05, 0, 0.15 + 1.0, D / 2 + 0.01), { role: 'door', material: 'plank', face: 'front' }, null, [0.3, 0.24, 0.2]);
  for (const z of [-1, 1]) add(box(W, 0.12, 0.12, 0, 0.15 + wallH + 0.06, z * (D / 2 - 0.07)), { role: 'plate', material: 'timber' });
  for (const x of [-1, 1]) add(box(0.12, 0.12, D, x * (W / 2 - 0.07), 0.15 + wallH + 0.06, 0), { role: 'plate', material: 'timber' });
  const rise = 1.2, top = 0.15 + wallH + 0.12, slope = Math.hypot(W / 2 + 0.25, rise), pitch = Math.atan2(rise, W / 2 + 0.25);
  for (const side of [-1, 1]) {
    for (const z of [-D / 2 + 0.1, -D / 6, D / 6, D / 2 - 0.1]) {
      const r = new THREE.BoxGeometry(slope, 0.1, 0.08).rotateZ(side * -pitch).translate(side * (W / 4 + 0.06), top + rise / 2 - 0.02, z);
      add(r, { role: 'rafter', material: 'timber' });
    }
    const roof = new THREE.BoxGeometry(slope + 0.1, 0.05, D + 0.4).rotateZ(side * -pitch).translate(side * (W / 4 + 0.06), top + rise / 2 + 0.06, 0);
    add(roof, { role: 'roof', material: 'plank', face: 'roof' }, null, [0.35, 0.3, 0.26]);
  }
  add(box(0.12, 0.12, D + 0.2, 0, top + rise, 0), { role: 'purlin', material: 'timber' });
  add(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 8).translate(0.6, top + 0.6, -1.0), { role: 'chimney', material: 'metal' }, null, [0.2, 0.2, 0.2]);
  add(box(0.6, 0.5, 0.5, -0.8, 0.15 + 0.25, -1.2), { role: 'fitting', material: 'plank', anchor: false });
  const geometry = mergeGeometries(parts, false);
  geometry.userData.fracture = craftAnatomy('testhut', parts, 'structureWood');
  return geometry;
}

// the r2 wreck metrics (tools/r2-standard.mjs planAndHeight / wreckVolume, Lane A's E14)
function planAndHeight(g, cell) {
  const P = g.getAttribute('position').array, count = P.length / 9;
  const cells = new Set(), heights = [];
  let maxX = -Infinity, minX = Infinity, maxZ = -Infinity, minZ = Infinity;
  const mark = (x, z) => cells.add(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
  for (let t = 0; t < count; t++) {
    const o = t * 9, ax = P[o], az = P[o + 2], bx = P[o + 3], bz = P[o + 5], cx = P[o + 6], cz = P[o + 8];
    minX = Math.min(minX, ax, bx, cx); maxX = Math.max(maxX, ax, bx, cx); minZ = Math.min(minZ, az, bz, cz); maxZ = Math.max(maxZ, az, bz, cz);
    const e1 = [bx - ax, P[o + 4] - P[o + 1], bz - az], e2 = [cx - ax, P[o + 7] - P[o + 1], cz - az];
    const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
    heights.push([(P[o + 1] + P[o + 4] + P[o + 7]) / 3, area]);
    for (const [x0, z0, x1, z1] of [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]]) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (cell / 2)));
      for (let s = 0; s <= steps; s++) mark(x0 + (x1 - x0) * s / steps, z0 + (z1 - z0) * s / steps);
    }
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) continue;
    for (let i = Math.floor(Math.min(ax, bx, cx) / cell); i <= Math.floor(Math.max(ax, bx, cx) / cell); i++) {
      for (let k = Math.floor(Math.min(az, bz, cz) / cell); k <= Math.floor(Math.max(az, bz, cz) / cell); k++) {
        const px = (i + 0.5) * cell, pz = (k + 0.5) * cell;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) cells.add(`${i},${k}`);
      }
    }
  }
  heights.sort((a, b) => a[0] - b[0]);
  const total = heights.reduce((s, h) => s + h[1], 0);
  let acc = 0, p90 = 0;
  for (const [y, a] of heights) { acc += a; p90 = y; if (acc >= 0.9 * total) break; }
  return { cells: cells.size, p90, size: [maxX - minX, maxZ - minZ] };
}
const flat = (g) => (g.index ? g.toNonIndexed() : g);

const intact = flat(hut());
const anatomy = intact.userData.fracture ?? hut().userData.fracture;
const problems = checkKitFracture(anatomy, intact.getAttribute('position').array);
assert.deepEqual(problems, [], `the test hut's anatomy: ${problems.join('; ')}`);
assert.ok(anatomy.pieces.some((p) => p.anchor) && anatomy.pieces.filter((p) => p.role === 'wall').length === 4, 'the walls are four panels (grouped boards), the floor and posts anchor it');
const intactTris = intact.getAttribute('position').count / 3;
const pre = planAndHeight(intact, 1);
const cell = Math.max(0.02, Math.max(...pre.size) / 48);
const ref = planAndHeight(intact, cell);
for (const seed of [1, 7, 42, 2026, 31337]) {
  const wreck = settleLightWreck(intact, anatomy, seed);
  const tris = wreck.getAttribute('position').count / 3;
  const m = planAndHeight(wreck, cell);
  assert.ok(tris <= 1.5 * intactTris, `seed ${seed}: the wreck within 1.5 x the intact triangles (${tris} / ${intactTris})`);
  assert.ok(m.p90 >= 0.25 * ref.p90, `seed ${seed}: a heap, not a raft (p90 ${m.p90.toFixed(2)} of ${ref.p90.toFixed(2)} m)`);
  assert.ok(m.cells >= 0.6 * ref.cells, `seed ${seed}: over the intact plan (${m.cells} of ${ref.cells} cells)`);
  const P = wreck.getAttribute('position').array;
  let minY = Infinity;
  for (let i = 1; i < P.length; i += 3) minY = Math.min(minY, P[i]);
  assert.ok(minY > -0.08, `seed ${seed}: nothing under the ground (${minY.toFixed(3)})`);
  const again = settleLightWreck(intact, anatomy, seed).getAttribute('position').array;
  assert.deepEqual(Array.from(again), Array.from(P), `seed ${seed}: deterministic`);
  console.log(`seed ${seed}: tris ${tris}/${intactTris} p90 ${(m.p90 / ref.p90 * 100).toFixed(0)} % plan ${(m.cells / ref.cells * 100).toFixed(0)} %`);
}

// props.ts: a kind with an anatomy breaks into its settled wreck; a kind that keeps its own broken builder keeps it
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.match(props, /settleLightWreck\(geoI, anatomy!?, fractureSeed\(seed, kind\)\)/, 'the settled wreck from the intact build and its anatomy');
assert.match(props, /ownBroken/, 'a structure variant\'s or the pillbox\'s own broken builder is never replaced');
console.log('lightWreck.selftest: anatomy, settled heap (height, plan, cost, ground, determinism) and the props route pass');
