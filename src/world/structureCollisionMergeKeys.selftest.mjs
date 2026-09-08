import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { makeOnionChurch } from './maps/villageKit.ts';
import { addCatalogExterior } from './maps/exteriorDetailKit.ts';

// Exact source-control algorithms from immutable v1.0.0+g3cca022ff:
// structureCollision.ts SHA256 2cac73132b9c1f53d686fd516f739b3ed919a08c44908592d44bb51e84f2cbbb.
// Only these three functions are replaced, so the separate per-solid runtime
// reuse optimization and real geometry/scoring dependencies remain identical.
const originals = {
  sharedVertexCount: `function sharedVertexCount(keys: ReadonlySet<string>, polygon: number[]): number {
  let shared = 0;
  for (const key of polygonVertexKeys(polygon)) if (keys.has(key)) shared++;
  return shared;
}`,
  mergeFirstProjectedPair: `function mergeFirstProjectedPair(polygons: number[][]): boolean {
  for (let first = 0; first < polygons.length; first++) {
    const firstKeys = polygonVertexKeys(polygons[first]);
    for (let second = first + 1; second < polygons.length; second++) {
      if (sharedVertexCount(firstKeys, polygons[second]) < 2) continue;
      const hull = combinedConvexHull(polygons[first], polygons[second]);
      if (!hull) continue;
      polygons[first] = hull;
      polygons.splice(second, 1);
      return true;
    }
  }
  return false;
}`,
  mergeProjectedTriangles: `function mergeProjectedTriangles(triangles: number[][]) {
  const polygons = dedupeProjectedTriangles(triangles);
  while (mergeFirstProjectedPair(polygons)) { /* restart after each exact merge */ }
  return uniquePolygons(polygons);
}`,
};
const originalHashes = {
  sharedVertexCount: '2f918a6665014d639d03cb4be23ecd96213d25465505976f97c68d58eec913ac',
  mergeFirstProjectedPair: 'f076d48de68a0b4c050f30e453c8a655599f0610c7f5cd4983df5bc95782bdc6',
  mergeProjectedTriangles: 'cc8d03fad5a500dc72aaa8cb93662a138737ade75981ad360a7b0450975e5665',
};
const sha256 = text => createHash('sha256').update(text).digest('hex');
for (const [name, source] of Object.entries(originals)) {
  assert.equal(sha256(source), originalHashes[name], `${name}: preserved original source, not a rewritten oracle`);
}
const moduleUrl = new URL('./structureCollision.ts', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const functionPattern = name => new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm');
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (![`${moduleUrl.href}?keys-candidate`, `${moduleUrl.href}?keys-original`].includes(url)) return nextLoad(url, context);
  let text = source;
  if (url.endsWith('?keys-original')) for (const [name, original] of Object.entries(originals)) {
    assert.ok(functionPattern(name).test(text), `${name}: actual function boundary exists`);
    text = text.replace(functionPattern(name), original);
  }
  for (const [name, counter] of [['polygonVertexKeys', 'keys'], ['sharedVertexCount', 'pairs'], ['combinedConvexHull', 'hulls']]) {
    const declaration = text.match(new RegExp(`function ${name}\\([^]*?\\{`))?.[0];
    assert.ok(declaration, `${name}: instrumentation stays inside actual source function`);
    text = text.replace(declaration, `${declaration} __mergeCounts.${counter}++;`);
  }
  const accepted = 'polygons[first] = hull;';
  assert.equal(text.split(accepted).length, 2);
  text = text.replace(accepted, `__mergeTrace.push({ first, second, hull: hull.slice() }); ${accepted}`);
  text += `
    const __mergeCounts = { keys: 0, pairs: 0, hulls: 0 };
    const __mergeTrace = [];
    export { mergeProjectedTriangles as testMerge };
    export function mergeReceipt() { return { counts: { ...__mergeCounts }, trace: __mergeTrace.slice() }; }
    export function resetMergeReceipt() {
      for (const key of Object.keys(__mergeCounts)) __mergeCounts[key] = 0;
      __mergeTrace.length = 0;
    }`;
  return { format: 'module-typescript', source: text, shortCircuit: true };
} });
let candidate, original;
try {
  candidate = await import(`${moduleUrl.href}?keys-candidate`);
  original = await import(`${moduleUrl.href}?keys-original`);
} finally { hooks.deregister(); }

/** Preserve every numeric IEEE-754 bit (including negative zero) plus complete
 * array/object order; decimal serialization alone is not the parity oracle. */
function fingerprint(value) {
  const hash = createHash('sha256'), number = Buffer.alloc(8);
  function visit(item) {
    if (typeof item === 'number') { number.writeDoubleLE(item); hash.update('number:').update(number); }
    else if (ArrayBuffer.isView(item)) {
      hash.update(item.constructor.name).update(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
    } else if (item && typeof item === 'object') {
      hash.update(Array.isArray(item) ? 'array[' : 'object{');
      for (const [key, child] of Object.entries(item)) { hash.update(JSON.stringify(key)); visit(child); }
      hash.update('end');
    } else hash.update(`${typeof item}:${JSON.stringify(item)}`);
  }
  visit(value); return hash.digest('hex');
}
function compare(entrypoint, input, label) {
  candidate.resetMergeReceipt(); original.resetMergeReceipt();
  const expected = original[entrypoint](input), actual = candidate[entrypoint](input);
  assert.deepEqual(actual, expected, `${label}: exact values and polygon/band order`);
  assert.equal(fingerprint(actual), fingerprint(expected), `${label}: exact Float64 output bits and structure`);
  const control = original.mergeReceipt(), cached = candidate.mergeReceipt();
  assert.equal(fingerprint(cached.trace), fingerprint(control.trace), `${label}: exact accepted first/second pair and hull sequence`);
  assert.equal(cached.counts.pairs, control.counts.pairs, `${label}: pair-search/restart order unchanged`);
  assert.equal(cached.counts.hulls, control.counts.hulls, `${label}: convexity math admission unchanged`);
  assert.ok(cached.counts.keys <= control.counts.keys, `${label}: vertex key construction never increases`);
  return { actual, counts: { candidate: cached.counts, original: control.counts }, accepted: cached.trace.length };
}
const square = (x = 0, z = 0) => [[x, z, x + 1, z, x, z + 1], [x + 1, z, x + 1, z + 1, x, z + 1]];
const cases = [
  ['empty', []], ['single', [[-0, 0, 1, 0, 0, 1]]],
  ['adjacent triangles', square()],
  ['restart-sensitive grid', [...square(), ...square(1), ...square(2), ...square(0, 1), ...square(1, 1)]],
  ['reflex L footprint', [...square(), ...square(1), ...square(0, 1)]],
  ['one shared vertex only', [[0, 0, 1, 0, 0, 1], [1, 0, 2, 0, 2, -1]]],
  ['same-side overlap', [[0, 0, 2, 0, 0, 2], [0, 0, 2, 0, 1, 0.5]]],
  ['crossing overlap', [[0, 0, 2, 0, 1, 2], [0, 1, 2, 1, 1, -1]]],
  ['duplicate orientation and shared references', [...square(), square()[0], [0, 1, 1, 0, 0, 0]]],
  ['disconnected and equal-area input order', [...square(6, 4), ...square(-2, 3), ...square(2, -5)]],
];
for (const delta of [0.000049999, 0.00005, 0.000050001, -0.000049999, -0.00005, -0.000050001]) {
  cases.push([`weld rounding ${delta}`, [[0, 0, 1, 0, 0, 1], [1 + delta, 0, 1, 1, delta, 1]]]);
}
for (const [label, triangles] of cases) {
  const before = fingerprint(triangles);
  const result = compare('testMerge', triangles, label);
  assert.equal(fingerprint(triangles), before, `${label}: callers' input numbers and order untouched`);
  const repeat = compare('testMerge', triangles, `${label} repeated`);
  assert.equal(fingerprint(result.actual), fingerprint(repeat.actual));
  assert.deepEqual(result.counts, repeat.counts, `${label}: no cross-call cache survives`);
}
const pairHeavy = Array.from({ length: 32 }, (_, index) => [index * 3, 0, index * 3 + 1, 0, index * 3, 1]);
const work = compare('testMerge', pairHeavy, 'deterministic rejected-pair work reduction');
assert.ok(work.counts.candidate.keys < work.counts.original.keys / 2,
  'negative control: restoring original functions must fail material key-work reduction');
const mutable = square();
mutable.push(mutable[0]);
const first = compare('testMerge', mutable, 'shared input array references').actual;
mutable[0][0] -= 0.75;
const changed = compare('testMerge', mutable, 'same identity, changed input coordinates').actual;
assert.notEqual(fingerprint(first), fingerprint(changed), 'fresh merge call observes current coordinates');
changed[0][0] += 100;
compare('testMerge', mutable, 'caller output mutation cannot persist a key cache');

const ownedGeometry = new Set();
function geometryFingerprint(buckets) {
  return fingerprint(Object.entries(buckets).map(([name, geometries]) => [name, geometries.map(geometry => ({
    index: geometry.index?.array ?? null,
    attributes: Object.entries(geometry.attributes).map(([key, attribute]) => [key, attribute.itemSize, attribute.normalized, attribute.array]),
    groups: geometry.groups, userData: geometry.userData,
  }))]));
}
function seeded(seed) {
  let draws = 0;
  return { draws: () => draws, rng: () => {
    draws++; seed += 0x6D2B79F5; let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  } };
}
const samples = [];
try {
  const geometry = new THREE.BoxGeometry(2, 6, 3).translate(0, 3, 0); ownedGeometry.add(geometry);
  const box = { stone: [geometry] };
  for (const api of ['deriveRuntimeStructureCollisionProfile', 'deriveRuntimeStructureCollisionWithSolids', 'deriveStructureCollisionProfile']) {
    compare(api, box, `${api} multi-band box`);
  }
  const beforeMove = candidate.deriveRuntimeStructureCollisionProfile(box);
  geometry.translate(0.375, 0, -0.625);
  const moved = compare('deriveRuntimeStructureCollisionProfile', box, 'mutated position attribute').actual;
  assert.notEqual(fingerprint(beforeMove), fingerprint(moved));

  const random = seeded(0x51a7c7);
  const buckets = Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'stone', 'roof',
    'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'].map(name => [name, []]));
  const info = makeOnionChurch(random.rng, buckets);
  addCatalogExterior(buckets, { id: 'onionchurch', info, variant: 0 });
  const geometries = Object.values(buckets).flat();
  for (const part of geometries) ownedGeometry.add(part);
  assert.equal(geometries.length, 75, 'the real placed onionchurch, including authored exterior');
  const geometryBefore = geometryFingerprint(buckets), draws = random.draws();
  for (const api of ['deriveRuntimeStructureCollisionProfile', 'deriveRuntimeStructureCollisionWithSolids', 'deriveStructureCollisionProfile']) {
    const result = compare(api, buckets, `75-geometry onionchurch ${api}`);
    assert.ok(result.counts.candidate.keys < result.counts.original.keys / 2,
      `${api}: real geometry materially reduces keys, including the authoring caller`);
    const profile = result.actual.profile ?? result.actual;
    assert.equal(profile.shell.length, 10);
    samples.push({ api, geometries: geometries.length, outputSha256: fingerprint(result.actual),
      counts: result.counts, accepted: result.accepted });
  }
  const timed = { candidate: [], original: [] };
  // Exactly four additional runtime profile calls, alternating order. CPU
  // observations are reported but never used as a pass gate or native evidence.
  for (let run = 0; run < 2; run++) for (const name of run ? ['candidate', 'original'] : ['original', 'candidate']) {
    const api = name === 'candidate' ? candidate : original;
    api.resetMergeReceipt(); const started = performance.now();
    const profile = api.deriveRuntimeStructureCollisionProfile(buckets);
    timed[name].push(performance.now() - started);
    assert.equal(fingerprint(profile), samples[0].outputSha256);
  }
  assert.equal(geometryFingerprint(buckets), geometryBefore, 'collision extraction preserves every geometry attribute/index bit and bucket order');
  assert.equal(random.draws(), draws, 'collision/profile/scoring work consumes no builder RNG');
  console.log('structureCollisionMergeKeys.selftest: original-source merge trace/Float-bit parity, weld/overlap/reflex/duplicates/mutation/repeated-call coverage, and runtime+authoring real-builder parity pass');
  console.log(JSON.stringify({ mergeCases: cases.length, deterministicWork: work.counts, samples,
    profileMs: timed, meaning: 'bounded same-process CPU attribution; no time gate, whole world, browser, or GPU claim' }));
} finally {
  candidate.resetMergeReceipt(); original.resetMergeReceipt();
  for (const geometry of ownedGeometry) geometry.dispose();
}
