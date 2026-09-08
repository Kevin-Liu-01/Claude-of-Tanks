import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { SOURCED_STRUCTURE_TYPES } from './sourcedStructureTypes.ts';

// Verbatim pre-filter raster. Only this function is replaced in the control;
// projection reuse, polygon merging and all real dependencies stay identical.
const originalRaster = `function rasterFootprintRectangles(source: number[][], resolution: number) {
  const bounds = boundsOf(source);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width <= 1e-6 || depth <= 1e-6) return [];
  const dx = width / resolution, dz = depth / resolution;
  interface Span { x0: number; x1: number; z0: number; z1: number }
  let active = new Map<string, Span>();
  const complete: Span[] = [];
  for (let zIndex = 0; zIndex < resolution; zIndex++) {
    const next = new Map<string, Span>();
    let runStart = -1;
    const flush = (runEnd: number) => {
      if (runStart < 0) return;
      const key = \`\${runStart}:\${runEnd}\`;
      const prior = active.get(key);
      next.set(key, prior
        ? { ...prior, z1: bounds.minZ + (zIndex + 1) * dz }
        : {
          x0: bounds.minX + runStart * dx,
          x1: bounds.minX + runEnd * dx,
          z0: bounds.minZ + zIndex * dz,
          z1: bounds.minZ + (zIndex + 1) * dz,
        });
      runStart = -1;
    };
    for (let xIndex = 0; xIndex < resolution; xIndex++) {
      const x = bounds.minX + (xIndex + 0.5) * dx;
      const z = bounds.minZ + (zIndex + 0.5) * dz;
      const occupied = containsAny(x, z, source);
      if (occupied && runStart < 0) runStart = xIndex;
      if (!occupied && runStart >= 0) flush(xIndex);
    }
    flush(resolution);
    for (const [key, span] of active) if (!next.has(key)) complete.push(span);
    active = next;
  }
  complete.push(...active.values());
  return complete.map((span) => [
    span.x0, span.z0,
    span.x1, span.z0,
    span.x1, span.z1,
    span.x0, span.z1,
  ]);
}`;
const moduleUrl = new URL('./structureCollision.ts', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url !== `${moduleUrl.href}?raster-filtered` && url !== `${moduleUrl.href}?raster-control`) {
    return nextLoad(url, context);
  }
  let text = source;
  if (url.endsWith('?raster-control')) {
    const current = text.match(/function rasterFootprintRectangles\([\s\S]*?\n}/)?.[0];
    assert.ok(current, 'complete raster boundary must exist');
    text = text.replace(current, originalRaster);
  }
  const predicate = 'function pointInPolygon(x: number, z: number, points: number[]) {';
  assert.equal(text.split(predicate).length, 2);
  text = text.replace(predicate, `${predicate} __rasterPredicates++;`);
  text += `
    let __rasterPredicates = 0;
    export { rasterFootprintRectangles as raster };
    export function resetRasterCounts() { __rasterPredicates = 0; }
    export function rasterCounts() { return __rasterPredicates; }`;
  return { format: 'module-typescript', source: text, shortCircuit: true };
} });
let filtered, control;
try {
  filtered = await import(`${moduleUrl.href}?raster-filtered`);
  control = await import(`${moduleUrl.href}?raster-control`);
} finally { hooks.deregister(); }

function compareRaster(polygons, resolution, label, fallback = false, useBounds = true) {
  const before = structuredClone(polygons);
  filtered.resetRasterCounts(); control.resetRasterCounts();
  const expected = control.raster(polygons, resolution, useBounds);
  const actual = filtered.raster(polygons, resolution, useBounds);
  assert.deepEqual(actual, expected, `${label}: exact occupied spans, coordinates and order`);
  assert.deepEqual(polygons, before, `${label}: no source mutation`);
  const counts = { filtered: filtered.rasterCounts(), control: control.rasterCounts() };
  if (fallback) assert.deepEqual(counts.filtered, counts.control, `${label}: original numeric predicate path`);
  assert.ok(counts.filtered <= counts.control, `${label}: no additional point predicates`);
  return { actual, counts };
}

const anchors = [[0, 0, 4, 0], [0, 4, 4, 4]];
const edgeSource = [...anchors, [0.5, 0.5, 1.5, 0.5, 1.5, 3.5, 0.5, 3.5],
  [2.5, 0.5, 3.5, 3.5, 2.5, 3.5, 3.5, 0.5]];
const fixtures = [
  [], [[]], [[0, 0, 0, 2, 0, 4]], edgeSource,
  [[0, 0, 4, 0, 4, 1, 1, 1, 1, 4, 0, 4]],
  [...edgeSource].reverse().map(points => {
    const pairs = [];
    for (let index = 0; index < points.length; index += 2) pairs.push(points.slice(index, index + 2));
    return pairs.reverse().flat();
  }),
  [...edgeSource, ...edgeSource],
  [[-0, -0, 4, -0, 4, 4, -0, 4], [-0, 2, 4, 2, 4, 2]],
];
for (const [index, polygons] of fixtures.entries()) {
  for (const resolution of [1, 2, 4, 16, 24, 32, 64]) {
    compareRaster(polygons, resolution, `fixture ${index}/${resolution}`);
  }
}
assert.ok(compareRaster(edgeSource, 32, 'edge predicate rejection').counts.filtered
  < compareRaster(edgeSource, 32, 'edge repeated call').counts.control);
compareRaster(edgeSource, 32, 'authoring remains opt-out', true, false);

// Non-Float32 inputs must fall back even when finite: tiny products and huge
// products can change the original ray predicate through under/overflow.
const unsafe = [
  [...anchors, [0.1, 0.1, 2.1, 0.1, 0.1, 2.1]],
  [[-1e200, -1e200, 1e200, -1e200, 1e200, 1e200, -1e200, 1e200]],
  [[-1e308, -1e308, 1e308, -1e308, 1e308, 1e308]],
  [...anchors, [1e-320, 0, 2e-320, 4, 3e-320, 0]],
  [[1e-320, 1e-320, 2e-320, 1e-320, 1e-320, 2e-320]],
  [...anchors, [NaN, 0, 2, 0, 2, 4]],
  [...anchors, [Infinity, 0, 2, 0, 2, 4]],
  [...anchors, [-Infinity, 0, 2, 0, 2, 4]],
  [...anchors, [0, 0, 4]],
  [...anchors, []],
];
for (const [index, polygons] of unsafe.entries()) {
  compareRaster(polygons, 4, `numeric fallback ${index}`, true);
}
const f32max = Math.fround(3.4028234663852886e38), f32min = 2 ** -149;
for (const resolution of [1, 3, 16, 32]) {
  compareRaster([[-f32max, -f32max, f32max, -f32max, f32max, f32max, -f32max, f32max]],
    resolution, `Float32 maximum/${resolution}`);
  compareRaster([...anchors, [-f32min, 0, f32min, 4, f32min, 0]],
    resolution, `Float32 subnormal/${resolution}`);
}
for (let seed = 0; seed < 48; seed++) {
  let state = seed + 1;
  const next = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) % 129 / 8 - 8; };
  const polygons = Array.from({ length: 12 }, () => Array.from({ length: 6 }, next));
  compareRaster(polygons, 16, `seeded triangle mixture ${seed}`);
}
const mutated = structuredClone(edgeSource);
const previous = compareRaster(mutated, 32, 'before input mutation').actual;
mutated[2][0] = 2;
const after = compareRaster(mutated, 32, 'after input mutation').actual;
assert.notDeepEqual(after, previous, 'each raster invocation derives fresh envelopes');
after[0][0] += 100;
assert.deepEqual(filtered.raster(mutated, 32, true), control.raster(mutated, 32),
  'returned rectangle mutation cannot poison a later call');
for (const invalid of [null, [null], [undefined]]) {
  const receipt = api => {
    try { api.raster(invalid, 4, true); }
    catch (error) { return { name: error.name, message: error.message }; }
    assert.fail('invalid raster input must keep its original error');
  };
  assert.deepEqual(receipt(filtered), receipt(control), 'invalid input preserves original errors');
}

const sourcedModels = JSON.parse(readFileSync(new URL('./props-models.json', import.meta.url), 'utf8'));
function sourcedSandbag(spec) {
  const model = sourcedModels[spec.model];
  assert.ok(model);
  // Match the runtime packed/fallback Float32 source and bakedGeometry's
  // canonical centering, target-height and sink transform; no world is built.
  const input = new Float32Array(model.positions);
  const [minX, minY, minZ] = model.bbox.min;
  const [maxX, maxY, maxZ] = model.bbox.max;
  const scale = spec.targetH / Math.max(1e-6, maxY - minY);
  const centerX = (minX + maxX) * 0.5, centerZ = (minZ + maxZ) * 0.5;
  const positions = new Float32Array(input.length);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = (input[index] - centerX) * scale;
    positions[index + 1] = (input[index + 1] - minY) * scale - spec.sink;
    positions[index + 2] = (input[index + 2] - centerZ) * scale;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(model.indices), 1));
  return geometry;
}
const geometryHash = geometry => {
  const hash = createHash('sha256');
  for (const attribute of [geometry.attributes.position, geometry.index]) {
    hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  return hash.digest('hex');
};
const timings = [];
for (const [id, spec] of Object.entries(SOURCED_STRUCTURE_TYPES)) {
  const geometry = sourcedSandbag(spec);
  try {
    const buckets = { baked: [geometry] }, before = geometryHash(geometry);
    filtered.resetRasterCounts(); control.resetRasterCounts();
    const expected = control.deriveRuntimeStructureCollisionProfile(buckets);
    const actual = filtered.deriveRuntimeStructureCollisionProfile(buckets);
    assert.deepEqual(actual, expected, `${id}: exact real-source contact/shell profiles and part order`);
    const predicates = { filtered: filtered.rasterCounts(), control: control.rasterCounts() };
    assert.ok(predicates.control > 0 && predicates.filtered < predicates.control / 2,
      `${id}: actual dense source substantially reduces exact predicate calls`);
    assert.deepEqual(filtered.deriveRuntimeStructureCollisionWithSolids(buckets),
      control.deriveRuntimeStructureCollisionWithSolids(buckets), `${id}: exact WithSolids consumer output`);
    const runs = { filtered: [], control: [] };
    for (let run = 0; run < 3; run++) {
      for (const name of run % 2 ? ['filtered', 'control'] : ['control', 'filtered']) {
        const api = name === 'filtered' ? filtered : control;
        const start = performance.now();
        const profile = api.deriveRuntimeStructureCollisionProfile(buckets);
        runs[name].push(performance.now() - start);
        assert.deepEqual(profile, expected, `${id}/${run}: independent repeat is exact`);
      }
    }
    assert.equal(geometryHash(geometry), before, `${id}: source vertex/index streams are untouched`);
    geometry.translate(0.125, 0, -0.25);
    const shifted = filtered.deriveRuntimeStructureCollisionWithSolids(buckets);
    assert.deepEqual(shifted, control.deriveRuntimeStructureCollisionWithSolids(buckets),
      `${id}: later geometry mutation cannot reuse a stale envelope`);
    assert.notDeepEqual(shifted.profile, expected);
    timings.push({ id, triangles: geometry.index.count / 3, predicates, milliseconds: runs });
  } finally { geometry.dispose(); }
}
console.log('structureCollisionRaster.selftest: ok');
console.log(JSON.stringify({ note: 'same-process CPU attribution with predicate instrumentation; not native/GPU frame acceptance', timings }));
