// Receipt for the continued ground's pass sampler and the seam's skipped samples (the time-to-battle lane, 2026-10-08):
// horizonSurface.ts continuedGroundSampler keeps the square-clamped residual by its point, and horizonSeam.ts
// refineHorizonGroundSeam takes no ground samples for a vertex its correction does not reach (weight 0). Neither may move a
// bit: the sampler is held against continuedGroundAt point by point (Object.is, so -0 and NaN count), and the refinement
// against the pre-change refinement (frozen below, as it stood at 7fa8749ca) on real rings — every attribute byte and the
// index the same — while asking the ground for a fraction of the heights.
import assert from 'node:assert/strict';
import { BufferAttribute, BufferGeometry } from 'three';
import { continuedGroundAt, continuedGroundSampler } from './horizonSurface.ts';
import { refineHorizonGroundSeam } from './horizonSeam.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';

/** A ground that counts what it is asked. */
function counted(ground) {
  const calls = { height: 0, outland: 0 };
  return {
    calls,
    ground: {
      getHeightAt: (x, z) => { calls.height++; return ground.getHeightAt(x, z); },
      getOutlandHeightAt: (x, z) => { calls.outland++; return ground.getOutlandHeightAt(x, z); },
    },
  };
}

// --- the sampler: continuedGroundAt, point for point ----------------------------------------------------------------
for (const mapId of ['verdant', 'titan_gorge']) {
  const field = createHeightField(1337, getMapConfig(mapId));
  const direct = counted(field), kept = counted(field);
  const sample = continuedGroundSampler(kept.ground);
  const points = [];
  // inside, on and past every edge, the corners, the zero coordinates (-0 and +0 clamp to themselves), repeats
  for (const v of [-1400, -900.25, -600, -512.5, -512, -511.75, -511.5, -300, -1.5, -0, 0, 1.5, 300, 511.5, 511.75, 512, 512.5, 600, 900.25, 1400]) {
    for (const w of [-1400, -700, -512.25, -0, 0, 133.7, 512.25, 700, 1400]) points.push([v, w], [w, v]);
  }
  let s = 7;
  const rand = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 4000; i++) {
    const r = 500 + rand() * 900, a = rand() * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
    points.push([x, z]);
    // a vertex's normal samples (the seam's and matchHorizonGroundNormals'): two of four clamp to one edge point
    const e = 128 / 96;
    points.push([x - e, z], [x + e, z], [x, z - e], [x, z + e]);
  }
  for (const [x, z] of points.concat(points.slice(0, 500))) {
    const a = continuedGroundAt(direct.ground, x, z), b = sample(x, z);
    assert.ok(Object.is(a, b), `${mapId} (${x}, ${z}): the sampler ${b} is continuedGroundAt's ${a}`);
  }
  const directCalls = direct.calls.height + direct.calls.outland, keptCalls = kept.calls.height + kept.calls.outland;
  assert.ok(keptCalls < directCalls * 0.8, `${mapId}: the kept residuals save height evaluations (${keptCalls} of ${directCalls})`);
  assert.equal(kept.calls.height + kept.calls.outland > 0, true);
}

// --- the seam: the pre-change refinement, frozen -------------------------------------------------------------------
const DIVISIONS = 8, REACH = 16;
function detailWeight(x, z) {
  const t = Math.max(0, Math.min(1, (Math.max(Math.abs(x), Math.abs(z)) - 514) / (REACH - 2)));
  return 1 - t * t * (3 - 2 * t);
}
function refineOriginal(geometry, columns, ground) {
  const attributes = geometry.attributes, position = attributes.position;
  const stride = columns + 1, rows = position.count / stride;
  const arrays = Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, Array.from(attribute.array)]));
  const indices = [], vertices = new Map();
  const sample = (x, z) => continuedGroundAt(ground, x, z);
  const groundHeights = new Float64Array(position.count);
  const sampled = new Uint8Array(position.count);
  function groundAtVertex(index) {
    if (!sampled[index]) {
      groundHeights[index] = sample(position.getX(index), position.getZ(index));
      sampled[index] = 1;
    }
    return groundHeights[index];
  }
  function vertex(row, column, u, w) {
    const key = `${row + w}:${(column + u) % columns}`;
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const a = row * stride + column, corners = [a, a + 1, a + stride, a + stride + 1];
    const weights = u + w <= 1 ? [1 - u - w, u, w, 0] : [0, 1 - w, 1 - u, u + w - 1];
    const blend = (data, size, axis) => weights.reduce((sum, weight, k) => sum + data[corners[k] * size + axis] * weight, 0);
    const x = blend(position.array, 3, 0), z = blend(position.array, 3, 2);
    const weight = row === 0 && w === 0 ? 0 : detailWeight(x, z);
    const base = weights.reduce((sum, value, k) => sum + groundAtVertex(corners[k]) * value, 0);
    const y = blend(position.array, 3, 1) + (sample(x, z) - base) * weight;
    const id = arrays.position.length / 3;
    for (const [name, attribute] of Object.entries(attributes)) {
      if (name === 'position') { arrays[name].push(x, y, z); continue; }
      if (name === 'normal') {
        const e = 128 / 96;
        let nx = sample(x - e, z) - sample(x + e, z), ny = 2 * e;
        let nz = sample(x, z - e) - sample(x, z + e);
        const length = Math.hypot(nx, ny, nz);
        nx = blend(attribute.array, 3, 0) * (1 - weight) + nx / length * weight;
        ny = blend(attribute.array, 3, 1) * (1 - weight) + ny / length * weight;
        nz = blend(attribute.array, 3, 2) * (1 - weight) + nz / length * weight;
        const inverse = 1 / Math.hypot(nx, ny, nz);
        arrays[name].push(nx * inverse, ny * inverse, nz * inverse);
      } else for (let axis = 0; axis < attribute.itemSize; axis++) arrays[name].push(blend(attribute.array, attribute.itemSize, axis));
    }
    vertices.set(key, id);
    return id;
  }
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns; column++) {
    const a = row * stride + column, corners = [a, a + 1, a + stride, a + stride + 1];
    const edgeOut = Math.min(...corners.slice(row === 0 ? 2 : 0).map(i =>
      Math.max(Math.abs(position.getX(i)), Math.abs(position.getZ(i))) - 512));
    if (edgeOut >= REACH) {
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      continue;
    }
    const radial = row === 0 ? 1 : 2;
    for (let j = 0; j < radial; j++) for (let i = 0; i < DIVISIONS; i++) {
      const v00 = vertex(row, column, i / DIVISIONS, j / radial);
      const v01 = vertex(row, column, (i + 1) / DIVISIONS, j / radial);
      const v10 = vertex(row, column, i / DIVISIONS, (j + 1) / radial);
      const v11 = vertex(row, column, (i + 1) / DIVISIONS, (j + 1) / radial);
      indices.push(v00, v10, v01, v01, v10, v11);
    }
  }
  for (const [name, attribute] of Object.entries(attributes)) {
    geometry.setAttribute(name, new BufferAttribute(new attribute.array.constructor(arrays[name]), attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
}

/** A ring's geometry as the seam receives it: rows of columns + 1 vertices, a normal and a uv per vertex. */
function ringGeometry(config, field) {
  const ring = sampleHorizonGeometry(config, 1337, field), n = HORIZON_SEGMENTS, stride = n + 1;
  const p = new Float32Array(ring.rows.length * stride * 3), normals = new Float32Array(p.length), uv = new Float32Array(ring.rows.length * stride * 2);
  const indices = [];
  for (let row = 0; row < ring.rows.length; row++) for (let col = 0; col <= n; col++) {
    const source = (row * n + col % n) * 3, target = (row * stride + col) * 3;
    p.set(ring.positions.subarray(source, source + 3), target);
    // a tilted normal and a varying uv, so the blends of both are exercised
    normals[target] = Math.sin(col * 0.37) * 0.2; normals[target + 1] = 1; normals[target + 2] = Math.cos(row * 0.53) * 0.2;
    uv[(row * stride + col) * 2] = col / n; uv[(row * stride + col) * 2 + 1] = row / ring.rows.length - 0.25;
    if (row < ring.rows.length - 1 && col < n) { const a = row * stride + col; indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p, 3)); g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setIndex(indices);
  return g;
}
const bytesOf = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

const delta = getMapConfig('delta');
for (const [label, config] of [['verdant', getMapConfig('verdant')], ['titan_gorge', getMapConfig('titan_gorge')],
  ['delta (classic border)', { ...delta, terrain: { ...delta.terrain, border: { classic: true } } }]]) {
  const field = createHeightField(1337, config);
  const before = ringGeometry(config, field), after = before.clone();
  const old = counted(field), now = counted(field);
  refineOriginal(before, HORIZON_SEGMENTS, old.ground);
  refineHorizonGroundSeam(after, HORIZON_SEGMENTS, now.ground);
  for (const name of Object.keys(before.attributes)) {
    const a = before.attributes[name].array, b = after.attributes[name].array;
    assert.equal(b.length, a.length, `${label} ${name}: as many values`);
    assert.ok(bytesOf(a).equals(bytesOf(b)), `${label} ${name}: every byte as the pre-change refinement's`);
  }
  assert.deepEqual(Array.from(after.index.array), Array.from(before.index.array), `${label}: the same triangles`);
  const asked = (c) => c.height + c.outland;
  assert.ok(asked(now.calls) < asked(old.calls) * 0.75, `${label}: fewer height evaluations (${asked(now.calls)} of ${asked(old.calls)})`);
  console.log(`horizonSeamSampler: ${label} — ${after.attributes.position.count} vertices byte-identical, ${asked(now.calls)} height evaluations of ${asked(old.calls)}`);
}
console.log('horizonSeamSampler: the pass sampler is continuedGroundAt point for point, and the seam is the pre-change seam byte for byte with a fraction of the samples PASS');
