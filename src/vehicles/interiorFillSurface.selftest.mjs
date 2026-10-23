// Interior-fill surface (tank-opt HIDDEN, 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we dont
// have unneeded geometry"): a rendered tank draws each fill component (hull, turret, gun) as its boundary surface on
// the voxel lattice (interiorFillSurface.ts) instead of closed boxes, and a geometry-only build (a map hulk's bake)
// keeps the closed boxes. This receipt proves, on controls and on every shipped record:
//   - EXACT: on every lattice plane and outward direction, the triangles' boundary chain equals the voxel oracle's
//     boundary-cell chain, and every triangle lies in its plane, wound outward, with positive area. A planar 2-chain
//     with no boundary is zero, so the triangles cover every boundary cell exactly once, and nothing else: the surface
//     an intact tank shows is the closed boxes' outer surface, in every pose (each component is rigid);
//   - CONFORMING: every directed edge is matched by its reverse, edge for edge, so no vertex sits on another
//     triangle's edge (a T-junction leaves a long edge unmatched). This is what the first cut (dropping wholly buried
//     box faces) lacked: its T-junctions opened under the GPU's sub-pixel snapping and the wreck's per-vertex dents,
//     and nothing stood behind the cracks any more. The check runs again on the float32 vertex bits of the mesh
//     applyInteriorFills attaches (through a scaled, offset rig too), so the GPU's buffer shares every edge's endpoints;
//   - the closed boxes, where they are drawn (fewer triangles, `closed: true`), are the mesher of 2026-09-13..10-15
//     bit for bit, so a map hulk's bake (and its wreck-budget count, props.ts) is unchanged.
// It prints the fleet's fill triangles before and after. The fills feed neither collision nor combat anatomy (the
// authority's Worker never loads interiorFills.ts, src/mp/host/hostFleet.selftest.mjs; the anatomy generator builds
// without the fill registry).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { interiorFillSurface } from './interiorFillSurface.ts';
import { applyInteriorFills, drawnFillTriangles, interiorFillSpans, interiorFillTriangleCounts } from './interiorFills.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';

const COMPONENTS = ['hull', 'turret', 'gun'];

/** The voxel grid of a component's boxes, with an empty layer around it; null-safe overlap count. */
function voxels(spans) {
  const count = spans.length / 6;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let b = 0; b < count; b++) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], spans[6 * b + a]); hi[a] = Math.max(hi[a], spans[6 * b + 3 + a]);
  }
  const o = lo.map((v) => v - 1), n = [0, 1, 2].map((a) => hi[a] - lo[a] + 3);
  const solid = new Uint8Array(n[0] * n[1] * n[2]);
  const at = (x, y, z) => ((z - o[2]) * n[1] + (y - o[1])) * n[0] + (x - o[0]);
  let overlaps = 0;
  for (let b = 0; b < count; b++) {
    for (let z = spans[6 * b + 2]; z <= spans[6 * b + 5]; z++) for (let y = spans[6 * b + 1]; y <= spans[6 * b + 4]; y++) {
      for (let x = spans[6 * b]; x <= spans[6 * b + 3]; x++) { const k = at(x, y, z); if (solid[k]) overlaps++; solid[k] = 1; }
    }
  }
  const filled = (p) => p[0] >= o[0] && p[1] >= o[1] && p[2] >= o[2] && p[0] < o[0] + n[0] && p[1] < o[1] + n[1] && p[2] < o[2] + n[2]
    && solid[at(p[0], p[1], p[2])] === 1;
  return { o, n, filled, overlaps };
}

// A unit lattice edge on a plane, undirected, as one exact number: face (0..5), plane, start point (u, v), along v?
const S = 2 ** 10;
const unitKey = (face, plane, u, v, alongV) => (((face * S + plane) * S + u) * S + v) * 2 + (alongV ? 1 : 0);
function addUnit(map, key, sign) {
  const value = (map.get(key) || 0) + sign;
  if (value) map.set(key, value); else map.delete(key);
}

/** The oracle's boundary chain: per boundary cell face, its four unit edges counter-clockwise about the outward normal. */
function oracleChain(spans) {
  const { o, n, filled } = voxels(spans);
  const chain = new Map();
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let z = o[2]; z < o[2] + n[2]; z++) for (let y = o[1]; y < o[1] + n[1]; y++) for (let x = o[0]; x < o[0] + n[0]; x++) {
    p[0] = x; p[1] = y; p[2] = z;
    if (!filled(p)) continue;
    for (let a = 0; a < 3; a++) for (let side = 0; side < 2; side++) {
      q[0] = x; q[1] = y; q[2] = z; q[a] += side === 0 ? 1 : -1;
      if (filled(q)) continue;
      const u = (a + 1) % 3, v = (a + 2) % 3, face = 2 * a + side, plane = side === 0 ? p[a] + 1 : p[a];
      const u0 = p[u], v0 = p[v];
      // counter-clockwise in (u, v) about +axis; the min face's outward normal is -axis, so its loop runs the other way
      const s = side === 0 ? 1 : -1;
      addUnit(chain, unitKey(face, plane, u0, v0, false), s);       // (u0,v0) -> (u0+1,v0)
      addUnit(chain, unitKey(face, plane, u0 + 1, v0, true), s);    // (u0+1,v0) -> (u0+1,v0+1)
      addUnit(chain, unitKey(face, plane, u0, v0 + 1, false), -s);  // (u0+1,v0+1) -> (u0,v0+1)
      addUnit(chain, unitKey(face, plane, u0, v0, true), -s);       // (u0,v0+1) -> (u0,v0)
    }
  }
  return chain;
}

/**
 * Check one component's surface against the oracle: exact cover and conforming. Returns the triangle count. `label`
 * names the component in failures.
 */
function checkSurface(spans, surface, label) {
  const { corners, faces } = surface;
  const tris = faces.length;
  assert.equal(corners.length, 9 * tris, `${label}: nine coordinates a triangle`);
  // each triangle: on its plane, wound outward, positive area
  const triChain = new Map(), full = new Map();
  for (let t = 0; t < tris; t++) {
    const f = faces[t], a = f >> 1, u = (a + 1) % 3, v = (a + 2) % 3, sign = f & 1 ? -1 : 1, k = 9 * t;
    const plane = corners[k + a];
    assert.ok(corners[k + 3 + a] === plane && corners[k + 6 + a] === plane, `${label}: triangle ${t} off its plane`);
    const cu = [corners[k + u], corners[k + 3 + u], corners[k + 6 + u]], cv = [corners[k + v], corners[k + 3 + v], corners[k + 6 + v]];
    const area2 = (cu[1] - cu[0]) * (cv[2] - cv[0]) - (cv[1] - cv[0]) * (cu[2] - cu[0]);
    assert.ok(area2 * sign > 0, `${label}: triangle ${t} degenerate or wound inward`);
    for (let e = 0; e < 3; e++) {
      const f0 = (e + 1) % 3;
      // per plane: the full edges with cancellation (sign = direction against the lexicographic order)
      const forward = cu[e] < cu[f0] || (cu[e] === cu[f0] && cv[e] < cv[f0]);
      const key = `${f}|${plane}|${forward ? `${cu[e]},${cv[e]},${cu[f0]},${cv[f0]}` : `${cu[f0]},${cv[f0]},${cu[e]},${cv[e]}`}`;
      const value = (triChain.get(key) || 0) + (forward ? 1 : -1);
      if (value) triChain.set(key, value); else triChain.delete(key);
      // globally: the directed edge, to be matched by its reverse
      const from = `${corners[k + 3 * e]},${corners[k + 3 * e + 1]},${corners[k + 3 * e + 2]}`;
      const to = `${corners[k + 3 * f0]},${corners[k + 3 * f0 + 1]},${corners[k + 3 * f0 + 2]}`;
      const reverse = `${to}>${from}`, back = full.get(reverse) || 0;
      if (back) { if (back === 1) full.delete(reverse); else full.set(reverse, back - 1); }
      else full.set(`${from}>${to}`, (full.get(`${from}>${to}`) || 0) + 1);
    }
  }
  assert.equal(full.size, 0, `${label}: ${full.size} directed edges unmatched (a crack or a T-junction): ${[...full.keys()].slice(0, 3)}`);
  // the triangles' boundary chain per plane, in unit edges (a diagonal that survives cancellation is a hole or overlap)
  const units = new Map();
  for (const [key, value] of triChain) {
    const [f, plane, coords] = key.split('|');
    const [u0, v0, u1, v1] = coords.split(',').map(Number);
    assert.ok(u0 === u1 || v0 === v1, `${label}: a diagonal edge on plane ${plane} is not matched within its region`);
    if (v0 === v1) for (let x = u0; x < u1; x++) addUnit(units, unitKey(+f, +plane, x, v0, false), value);
    else for (let y = v0; y < v1; y++) addUnit(units, unitKey(+f, +plane, u0, y, true), value);
  }
  const oracle = oracleChain(spans);
  assert.equal(units.size, oracle.size, `${label}: ${units.size} boundary unit edges, the oracle has ${oracle.size}`);
  for (const [key, value] of oracle) assert.equal(units.get(key), value, `${label}: boundary chain differs from the oracle`);
  return tris;
}

const sextets = (...boxes) => Uint16Array.from(boxes.flat());

// --- controls -------------------------------------------------------------------------------------------------------
{
  const lone = sextets([0, 0, 0, 3, 2, 1]);
  const s = interiorFillSurface(lone);
  assert.equal(checkSurface(lone, s, 'lone box'), 12, 'a lone box is its own 12 triangles');
  assert.equal(drawnFillTriangles(lone), 12, 'a tie keeps the closed box');
}
{
  const pair = sextets([0, 0, 0, 1, 1, 1], [2, 0, 0, 3, 1, 1]);
  assert.equal(checkSurface(pair, interiorFillSurface(pair), 'two boxes'), 12, 'two boxes sharing a whole face are one box');
  assert.equal(drawnFillTriangles(pair), 12);
}
{
  // a T-junction: the short box's top corners lie on the tall box's edges
  const t = sextets([0, 0, 0, 1, 1, 1], [2, 0, 0, 3, 3, 1]);
  const s = interiorFillSurface(t);
  checkSurface(t, s, 'T-junction');
  assert.ok(s.faces.length < 24, 'the stepped pair takes fewer triangles than two closed boxes');
}
{
  // a 3x3 slab with its centre cell empty: the top and bottom regions are rings (a hole), cut into rectangles
  const ring = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) ring.push([i, 0, j, i, 0, j]);
  const s = interiorFillSurface(sextets(...ring));
  checkSurface(sextets(...ring), s, 'ring');
  assert.ok(s.rectangleRegions >= 2, 'a region with a hole is cut into rectangles');
}
{
  // a hole pinched to the outside at a corner (the outline meets itself there): also cut into rectangles
  const cells = [[0, 0], [1, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
  const s = interiorFillSurface(sextets(...cells.map(([i, j]) => [i, 0, j, i, 0, j])));
  checkSurface(sextets(...cells.map(([i, j]) => [i, 0, j, i, 0, j])), s, 'pinched hole');
  assert.ok(s.rectangleRegions >= 2, 'a pinched outline is cut into rectangles');
}
{
  // two boxes touching along an edge only, and two touching at a corner only
  for (const [label, boxes] of [['edge contact', [[0, 0, 0, 1, 1, 3], [2, 2, 0, 3, 3, 3]]], ['corner contact', [[0, 0, 0, 1, 1, 1], [2, 2, 2, 3, 3, 3]]]]) {
    const spans = sextets(...boxes);
    assert.equal(checkSurface(spans, interiorFillSurface(spans), label), 24, `${label}: two closed surfaces`);
  }
}
{
  // seeded voxel blobs, greedy-meshed into boxes exactly as tools/gen-interior-fills.mjs meshes its cells
  let seed = 0x2f6e2b1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 60; trial++) {
    const n = 5 + Math.floor(random() * 10), fill = 0.35 + 0.5 * random();
    const cell = new Uint8Array(n * n * n);
    const at = (x, y, z) => (z * n + y) * n + x;
    for (let i = 0; i < cell.length; i++) cell[i] = random() < fill ? 1 : 0;
    const used = new Uint8Array(cell.length), boxes = [];
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!cell[at(x, y, z)] || used[at(x, y, z)]) continue;
      let x1 = x; while (x1 + 1 < n && cell[at(x1 + 1, y, z)] && !used[at(x1 + 1, y, z)]) x1++;
      let y1 = y; grow: while (y1 + 1 < n) { for (let xx = x; xx <= x1; xx++) if (!cell[at(xx, y1 + 1, z)] || used[at(xx, y1 + 1, z)]) break grow; y1++; }
      let z1 = z; deepen: while (z1 + 1 < n) { for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) if (!cell[at(xx, yy, z1 + 1)] || used[at(xx, yy, z1 + 1)]) break deepen; z1++; }
      for (let zz = z; zz <= z1; zz++) for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[at(xx, yy, zz)] = 1;
      boxes.push([x, y, z, x1, y1, z1]);
    }
    const spans = sextets(...boxes);
    const s = interiorFillSurface(spans);
    assert.ok(s, `random blob ${trial}: meshed`);
    checkSurface(spans, s, `random blob ${trial}`);
  }
}

// --- the shipped fleet ------------------------------------------------------------------------------------------------
/** The closed-box mesher of 2026-09-13..10-15 (interiorFills.ts as it shipped), positions in metres. */
function closedMesh(record, spans) {
  const faces = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [-1, 1, -1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  const count = spans.length / 6;
  const positions = new Float32Array(count * 108), normals = new Float32Array(count * 108);
  let k = 0;
  for (let b = 0; b < count; b++) {
    const [x0, y0, z0, x1, y1, z1] = spans.subarray(6 * b, 6 * b + 6);
    const cx = record.o[0] + ((x0 + x1 + 1) / 2) * record.v, cy = record.o[1] + ((y0 + y1 + 1) / 2) * record.v;
    const cz = record.o[2] + ((z0 + z1 + 1) / 2) * record.v;
    const sx = (x1 - x0 + 1) * record.v, sy = (y1 - y0 + 1) * record.v, sz = (z1 - z0 + 1) * record.v;
    for (const [normal, corners] of faces) for (const [ux, uy, uz] of corners) {
      positions[k] = cx + ux * sx / 2; positions[k + 1] = cy + uy * sy / 2; positions[k + 2] = cz + uz * sz / 2;
      normals[k] = normal[0]; normals[k + 1] = normal[1]; normals[k + 2] = normal[2];
      k += 3;
    }
  }
  return { positions, normals };
}

/** Directed edges of a float32 triangle soup, matched by their reverses on the exact bits. */
function unmatchedBitEdges(positions) {
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, positions.length);
  const open = new Map();
  for (let t = 0; t < positions.length / 9; t++) for (let e = 0; e < 3; e++) {
    const i = 9 * t + 3 * e, j = 9 * t + 3 * ((e + 1) % 3);
    const from = `${bits[i]},${bits[i + 1]},${bits[i + 2]}`, to = `${bits[j]},${bits[j + 1]},${bits[j + 2]}`;
    const reverse = `${to}>${from}`, back = open.get(reverse) || 0;
    if (back) { if (back === 1) open.delete(reverse); else open.set(reverse, back - 1); }
    else open.set(`${from}>${to}`, (open.get(`${from}>${to}`) || 0) + 1);
  }
  return open.size;
}

const records = {};
for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
assert.deepEqual(Object.keys(records).sort(), Object.keys(FLEET_GROUP_BY_ID).sort(), 'every fleet tank has a fill record');
const material = new THREE.MeshBasicMaterial();
const total = { records: 0, components: 0, boxes: 0, closed: 0, drawn: 0, surfaceDrawn: 0, rectangleRegions: 0, ms: 0 };
let largest = { id: '', saved: 0 };
const rigged = new Set(['leo2a6_ua', 't90sm_2013', 'm1a2_abrams']);
for (const [id, record] of Object.entries(records).sort(([a], [b]) => a.localeCompare(b))) {
  total.records++;
  // the factory's attach path, on rigs at the origin (the mesh frame is the tank frame) and, for a few tanks, on a
  // scaled, offset, turned rig as profiles carry them; and the geometry-only build's closed boxes
  const builds = [['origin', false], ['closed', true]];
  if (rigged.has(id)) builds.push(['rig', false]);
  const meshes = {};
  const disposables = [];
  for (const [build, closed] of builds) {
    const rigs = { hull: new THREE.Group(), turret: new THREE.Group(), gun: new THREE.Group() };
    rigs.hull.add(rigs.turret); rigs.turret.add(rigs.gun);
    if (build === 'rig') {
      rigs.hull.scale.setScalar(1.037); rigs.turret.position.set(0.013, 1.71, -0.42); rigs.turret.rotation.y = 0.3;
      rigs.gun.position.set(0, 0.27, 1.1); rigs.gun.rotation.x = -0.05;
    }
    const counts = applyInteriorFills({ specId: id, hullG: rigs.hull, turretG: rigs.turret, gunG: rigs.gun, material, disposables, record, closed });
    for (const component of COMPONENTS) {
      const spans = interiorFillSpans(record, component);
      assert.equal(counts[component], spans.length / 6, `${id} ${component} ${build}: every box attached`);
      meshes[`${component}:${build}`] = rigs[component].children.find((child) => child.name === `${component}InteriorFill`) ?? null;
    }
  }
  let saved = 0;
  for (const component of COMPONENTS) {
    if (!record[component]) continue;
    const spans = interiorFillSpans(record, component);
    const boxes = spans.length / 6;
    assert.equal(voxels(spans).overlaps, 0, `${id} ${component}: fill boxes are disjoint`);
    const started = performance.now();
    const surface = interiorFillSurface(spans);
    total.ms += performance.now() - started;
    assert.ok(surface, `${id} ${component}: the boxes bound a lattice solid`);
    checkSurface(spans, surface, `${id} ${component}`);
    total.rectangleRegions += surface.rectangleRegions;
    const useSurface = surface.faces.length < 12 * boxes;
    const drawn = useSurface ? surface.faces.length : 12 * boxes;
    assert.equal(drawnFillTriangles(spans), drawn, `${id} ${component}: the drawn count is the cheaper mesh`);
    assert.equal(interiorFillTriangleCounts(record, component).drawn, drawn);
    const reference = closedMesh(record, spans);
    // the closed boxes, bit for bit, wherever they are drawn
    for (const build of useSurface ? ['closed'] : ['closed', 'origin']) {
      const mesh = meshes[`${component}:${build}`];
      const pos = new Uint32Array(mesh.geometry.getAttribute('position').array.buffer), nor = new Uint32Array(mesh.geometry.getAttribute('normal').array.buffer);
      const refPos = new Uint32Array(reference.positions.buffer), refNor = new Uint32Array(reference.normals.buffer);
      assert.equal(pos.length, refPos.length, `${id} ${component} ${build}: the closed boxes' 36 vertices a box`);
      for (let i = 0; i < pos.length; i++) if (pos[i] !== refPos[i] || nor[i] !== refNor[i]) assert.fail(`${id} ${component} ${build}: closed boxes differ from the shipped mesher at float ${i}`);
    }
    if (useSurface) {
      // the surface mesh: each lattice point at origin + index * voxel, the face's normal, edges shared on the bits
      const mesh = meshes[`${component}:origin`];
      const pos = mesh.geometry.getAttribute('position').array, nor = mesh.geometry.getAttribute('normal').array;
      assert.equal(pos.length, surface.corners.length, `${id} ${component}: three vertices a surface triangle`);
      for (let i = 0; i < pos.length; i++) {
        if (pos[i] !== Math.fround(record.o[i % 3] + surface.corners[i] * record.v)) assert.fail(`${id} ${component}: vertex ${i} is not its lattice point`);
      }
      for (let t = 0; t < surface.faces.length; t++) {
        const axis = surface.faces[t] >> 1, sign = surface.faces[t] & 1 ? -1 : 1;
        for (let c = 0; c < 9; c++) if (nor[9 * t + c] !== (c % 3 === axis ? sign : 0)) assert.fail(`${id} ${component}: triangle ${t} normal`);
      }
      assert.equal(unmatchedBitEdges(pos), 0, `${id} ${component}: the float32 mesh shares every edge's endpoints`);
      if (rigged.has(id)) assert.equal(unmatchedBitEdges(meshes[`${component}:rig`].geometry.getAttribute('position').array), 0,
        `${id} ${component}: still shared through a scaled, offset, turned rig`);
      total.surfaceDrawn++;
    }
    total.components++; total.boxes += boxes; total.closed += 12 * boxes; total.drawn += drawn; saved += 12 * boxes - drawn;
  }
  assert.equal(interiorFillTriangleCounts(record).drawn, interiorFillTriangleCounts(record).closed - saved, `${id}: record counts agree`);
  if (saved > largest.saved) largest = { id, saved };
  for (const resource of disposables) resource.dispose();
}
// the surface is live: on 2026-10-16 it removed 18.1 % of the fleet's fill triangles, conforming
assert.ok(total.drawn <= 0.85 * total.closed, `the surface removes at least 15 % of fill triangles (${total.drawn} of ${total.closed})`);
console.log(`interior-fill surface: ${total.records} records, ${total.components} components (${total.surfaceDrawn} drawn as the surface, `
  + `${total.rectangleRegions} holed regions cut into rectangles), ${total.boxes} boxes; fill triangles ${total.closed} -> ${total.drawn} `
  + `(-${total.closed - total.drawn}, ${(100 * (total.closed - total.drawn) / total.closed).toFixed(2)} %), largest cut ${largest.id} -${largest.saved}; `
  + `mesher ${total.ms.toFixed(0)} ms`);
console.log('interiorFillSurface selftest PASS');
