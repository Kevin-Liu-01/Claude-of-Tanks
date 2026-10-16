// Interior-fill face cull (tank-opt HIDDEN, 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we dont
// have unneeded geometry"): interiorFills.ts no longer draws a fill box face that lies inside its component's own
// solid (interiorFillFaces.ts). This receipt proves the cull is exact, on every shipped record:
//   - controls: a lone box keeps all six faces, a shared face is culled on both sides, a face half covered stays, a
//     face tiled by two neighbours goes, overlapping neighbours whose areas add up but leave a hole keep it, the
//     centre of a 3x3x3 block loses all six, and seeded random voxel blobs (greedy-meshed like the generator) agree
//     with a voxel-grid oracle face for face;
//   - every record and component (hull, turret, gun) of the fleet: its boxes are disjoint, and the culled faces are
//     exactly the faces whose whole outer voxel layer is solid in an independent voxel grid (so no face on the
//     solid's outer surface is ever cut, and none fully buried is left);
//   - the mesh applyInteriorFills attaches is the full six-face mesher's output (reproduced here as it shipped before
//     the cull) with exactly the culled faces' triangles removed: the remaining positions and normals are the same
//     float32 bits in the same order, so the outer surface is unchanged in every pose (each component is rigid) and at
//     every quality (the records carry no quality: HIGH and LOW build the same fills). A dented wreck is the one
//     non-rigid state: the live-crumple shader moves face corners, T-junction seams open hairline cracks, and a culled
//     face no longer backs them (tools/interior-fill-surface-compare.mjs raster --dents measures it).
// It prints the fleet's fill triangles before and after. The fills feed neither collision nor combat anatomy: the
// authority's Worker never loads interiorFills.ts (src/mp/host/hostFleet.selftest.mjs) and the anatomy generator
// builds without the fill registry; the watertight and sealed gates read the fills and are unchanged by the cull
// (tools/interior-fill-surface-compare.mjs records the before/after proof on the whole fleet's battle builds).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { drawnFillFaces, internalFillFaces } from './interiorFillFaces.ts';
import { applyInteriorFills, interiorFillFaceCounts, interiorFillSpans } from './interiorFills.ts';
import { INTERIOR_FILL_GROUP_LOADERS } from './interiorFillLoaders.generated.ts';
import { FLEET_GROUP_BY_ID } from './fleetManifest.ts';

const COMPONENTS = ['hull', 'turret', 'gun'];

/** Voxel-grid oracle: overlap count and, per box, the faces whose whole outer layer is solid. */
function voxelOracle(spans) {
  const count = spans.length / 6;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let b = 0; b < count; b++) {
    x0 = Math.min(x0, spans[6 * b]); y0 = Math.min(y0, spans[6 * b + 1]); z0 = Math.min(z0, spans[6 * b + 2]);
    x1 = Math.max(x1, spans[6 * b + 3]); y1 = Math.max(y1, spans[6 * b + 4]); z1 = Math.max(z1, spans[6 * b + 5]);
  }
  const ox = x0 - 1, oy = y0 - 1, oz = z0 - 1, nx = x1 - x0 + 3, ny = y1 - y0 + 3, nz = z1 - z0 + 3;
  const solid = new Uint8Array(nx * ny * nz);
  const at = (x, y, z) => ((z - oz) * ny + (y - oy)) * nx + (x - ox);
  let overlaps = 0;
  for (let b = 0; b < count; b++) {
    for (let z = spans[6 * b + 2]; z <= spans[6 * b + 5]; z++) for (let y = spans[6 * b + 1]; y <= spans[6 * b + 4]; y++) {
      for (let x = spans[6 * b]; x <= spans[6 * b + 3]; x++) { const k = at(x, y, z); if (solid[k]) overlaps++; solid[k] = 1; }
    }
  }
  const mask = new Uint8Array(count);
  for (let b = 0; b < count; b++) {
    const lo = [spans[6 * b], spans[6 * b + 1], spans[6 * b + 2]], hi = [spans[6 * b + 3], spans[6 * b + 4], spans[6 * b + 5]];
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3, v = (a + 2) % 3;
      for (const [bit, layer] of [[2 * a, hi[a] + 1], [2 * a + 1, lo[a] - 1]]) {
        let full = true;
        for (let i = lo[u]; i <= hi[u] && full; i++) for (let j = lo[v]; j <= hi[v]; j++) {
          const p = [0, 0, 0]; p[a] = layer; p[u] = i; p[v] = j;
          if (!solid[at(p[0], p[1], p[2])]) { full = false; break; }
        }
        if (full) mask[b] |= 1 << bit;
      }
    }
  }
  return { overlaps, mask };
}

const sextets = (...boxes) => Uint16Array.from(boxes.flat());
const maskOf = (...boxes) => [...internalFillFaces(sextets(...boxes))];

// --- controls -----------------------------------------------------------------------------------------------------
assert.deepEqual(maskOf([0, 0, 0, 3, 2, 1]), [0], 'a lone box keeps all six faces');
assert.deepEqual(maskOf([0, 0, 0, 1, 1, 1], [2, 0, 0, 3, 1, 1]), [0b000001, 0b000010], 'a shared face is culled on both sides');
assert.deepEqual(maskOf([0, 0, 0, 3, 1, 1], [4, 0, 0, 5, 0, 1]), [0, 0b000010],
  'a face half covered by a smaller neighbour stays; the neighbour face it fully covers goes');
assert.deepEqual(maskOf([0, 0, 0, 1, 3, 1], [2, 0, 0, 3, 1, 1], [2, 2, 0, 3, 3, 1]), [0b000001, 0b000110, 0b001010],
  'a face tiled by two neighbours goes (and the neighbours\' shared face too)');
assert.deepEqual(maskOf([0, 0, 0, 1, 3, 0], [2, 0, 0, 3, 1, 0], [2, 1, 0, 3, 2, 0])[0], 0,
  'overlapping neighbours whose areas add up to the face but leave a cell open keep it');
{
  const block = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) block.push([2 * x, 2 * y, 2 * z, 2 * x + 1, 2 * y + 1, 2 * z + 1]);
  const mask = maskOf(...block);
  assert.equal(mask[13], 0b111111, 'the centre of a 3x3x3 block loses all six faces');
  assert.equal(mask.reduce((n, m) => n + (m === 0 ? 1 : 0), 0), 0, 'every box of a block shares at least one face');
  assert.equal(drawnFillFaces(Uint8Array.from(mask)), 54, 'a 3x3x3 block draws only its outer 54 faces');
}
{
  // Seeded voxel blobs greedy-meshed into boxes exactly as tools/gen-interior-fills.mjs meshes its cells.
  let seed = 0x2f6e2b1;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 40; trial++) {
    const n = 6 + Math.floor(random() * 10);
    const cell = new Uint8Array(n * n * n);
    const at = (x, y, z) => (z * n + y) * n + x;
    for (let i = 0; i < cell.length; i++) cell[i] = random() < 0.62 ? 1 : 0;
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
    const oracle = voxelOracle(spans);
    assert.equal(oracle.overlaps, 0);
    assert.deepEqual([...internalFillFaces(spans)], [...oracle.mask], `random blob ${trial}: the cull matches the voxel oracle`);
  }
}

// --- the shipped fleet ---------------------------------------------------------------------------------------------
/** The six-face mesher as it shipped before the cull (interiorFills.ts, 2026-09-13 .. 2026-10-15), positions in metres. */
function fullMesh(record, spans) {
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
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

const records = {};
for (const load of Object.values(INTERIOR_FILL_GROUP_LOADERS)) Object.assign(records, (await load()).INTERIOR_FILLS);
assert.deepEqual(Object.keys(records).sort(), Object.keys(FLEET_GROUP_BY_ID).sort(), 'every fleet tank has a fill record');
const material = new THREE.MeshBasicMaterial();
const total = { records: 0, components: 0, boxes: 0, faces: 0, internal: 0, before: 0, after: 0 };
let largest = { id: '', saved: 0 };
for (const [id, record] of Object.entries(records).sort(([a], [b]) => a.localeCompare(b))) {
  total.records++;
  // the factory's own attach path, on rigs at the origin so the mesh frame is the tank frame
  const rigs = { hull: new THREE.Group(), turret: new THREE.Group(), gun: new THREE.Group() };
  rigs.turret.add(rigs.gun);
  const disposables = [];
  const counts = applyInteriorFills({ specId: id, hullG: rigs.hull, turretG: rigs.turret, gunG: rigs.gun, material, disposables, record });
  let saved = 0;
  for (const component of COMPONENTS) {
    if (!record[component]) continue;
    // the shipped decoder (the provenance audit's one admitted reader of the packed spans)
    const spans = interiorFillSpans(record, component);
    const boxes = spans.length / 6;
    const oracle = voxelOracle(spans);
    assert.equal(oracle.overlaps, 0, `${id} ${component}: fill boxes are disjoint`);
    const mask = internalFillFaces(spans);
    assert.deepEqual([...mask], [...oracle.mask], `${id} ${component}: culled faces are exactly the faces buried in the solid`);
    assert.equal(counts[component], boxes, `${id} ${component}: every box attached`);
    const mesh = rigs[component].children.find((child) => child.name === `${component}InteriorFill`);
    assert.ok(mesh, `${id} ${component}: fill mesh attached`);
    const reference = fullMesh(record, spans);
    reference.applyMatrix4(new THREE.Matrix4().copy(rigs[component].matrixWorld).invert());
    const refPos = new Uint32Array(reference.getAttribute('position').array.buffer), refNor = new Uint32Array(reference.getAttribute('normal').array.buffer);
    const pos = new Uint32Array(mesh.geometry.getAttribute('position').array.buffer), nor = new Uint32Array(mesh.geometry.getAttribute('normal').array.buffer);
    const drawn = drawnFillFaces(mask);
    assert.equal(pos.length, drawn * 18, `${id} ${component}: six vertices per drawn face`);
    let k = 0;
    for (let face = 0; face < boxes * 6; face++) {
      if (mask[Math.floor(face / 6)] & (1 << (face % 6))) continue;
      for (let i = face * 18; i < face * 18 + 18; i++, k++) {
        if (pos[k] !== refPos[i] || nor[k] !== refNor[i]) assert.fail(`${id} ${component}: drawn face ${face} differs from the full mesher at float ${i}`);
      }
    }
    assert.equal(k, pos.length);
    const counts1 = interiorFillFaceCounts(record, component);
    assert.equal(2 * (counts1.faces - counts1.internal), 2 * drawn, `${id} ${component}: per-component counts agree with the mesh`);
    total.components++; total.boxes += boxes; total.faces += 6 * boxes; total.internal += 6 * boxes - drawn;
    total.before += 12 * boxes; total.after += 2 * drawn; saved += 2 * (6 * boxes - drawn);
    reference.dispose();
  }
  const census = interiorFillFaceCounts(record);
  assert.equal(2 * census.internal, saved, `${id}: interiorFillFaceCounts agrees with the mesher`);
  if (saved > largest.saved) largest = { id, saved };
  for (const resource of disposables) resource.dispose();
}
assert.equal(total.before - total.after, 2 * total.internal);
// the cull is live: on 2026-10-16 it removed 19.15 % of the fleet's fill triangles
assert.ok(total.internal >= 0.15 * total.faces, `the cull removes at least 15 % of fill faces (${total.internal} of ${total.faces})`);
console.log(`interior-fill faces: ${total.records} records, ${total.components} components, ${total.boxes} boxes; `
  + `fill triangles ${total.before} -> ${total.after} (-${total.before - total.after}, `
  + `${(100 * (total.before - total.after) / total.before).toFixed(2)} %), largest cut ${largest.id} -${largest.saved}`);
console.log('interiorFillFaces selftest PASS');
