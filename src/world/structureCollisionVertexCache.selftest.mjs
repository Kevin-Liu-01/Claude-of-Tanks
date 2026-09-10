import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { makeOnionChurch } from './maps/villageKit.ts';
import { makeWaterTower } from './maps/railKit.ts';
import { STRUCTURE_BUILDERS } from './maps/structureKit.ts';

// Verbatim functions read from HEAD d942e1284a1130061387b4a4ac2e34c765b8f121.
// Whole source SHA256: 260f8a6f1b6c5a54dffcbe237c25bc9a5c75a5dbd17d0665a032f2b0756d3b75.
// Frozen here so ordinary/shallow/source-only test checkouts need no Git history.
const originals = {
  joinTrianglesBySharedVertex: `function joinTrianglesBySharedVertex(
  position: PositionAttribute,
  index: BufferAttribute | null,
  triangleCount: number,
  sets: DisjointSet,
): void {
  const owners = new Map<string, number>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const vertex = streamVertex(index, triangle * 3 + corner);
      const key = vertexKey(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      const owner = owners.get(key);
      if (owner == null) owners.set(key, triangle);
      else sets.join(triangle, owner);
    }
  }
}`,
  collectSolidComponents: `function collectSolidComponents(
  position: PositionAttribute,
  index: BufferAttribute | null,
  triangleCount: number,
  sets: DisjointSet,
): Map<number, SolidComponent> {
  const components = new Map<number, SolidComponent>();
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const root = sets.find(triangle);
    let component = components.get(root);
    if (!component) {
      component = {
        minY: Infinity,
        maxY: -Infinity,
        vertices: new Map(),
        projectedTriangles: [],
      };
      components.set(root, component);
    }
    const projected: number[] = [];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = streamVertex(index, triangle * 3 + corner);
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      component.minY = Math.min(component.minY, y);
      component.maxY = Math.max(component.maxY, y);
      component.vertices.set(
        \`\${Math.round(x * WELD_SCALE)},\${Math.round(z * WELD_SCALE)}\`,
        [x, z],
      );
      projected.push(x, z);
    }
    if (Math.abs(polygonArea(projected)) >= 1e-6) component.projectedTriangles.push(projected);
  }
  return components;
}`,
  geometrySolids: `function geometrySolids(geometry: BufferGeometry, bucket: string): LocalSolid[] {
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return [];
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  const sets = disjointSet(triangleCount);
  joinTrianglesBySharedVertex(position, index, triangleCount, sets);
  const components = collectSolidComponents(position, index, triangleCount, sets);
  return solidsFromComponents(components.values(), bucket);
}`,
};

const url = new URL('./structureCollision.ts', import.meta.url);
const source = readFileSync(url, 'utf8');
const pattern = name => new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm');
const hook = registerHooks({ load(request, context, next) {
  if (!request.startsWith(`${url.href}?vertex-`)) return next(request, context);
  let text = source;
  if (request.includes('original')) for (const [name, original] of Object.entries(originals)) {
    assert.ok(pattern(name).test(text), `${name}: actual owner boundary remains present`);
    text = text.replace(pattern(name), original);
  }
  if (request.endsWith('-trace')) {
    text = text.replace('function vertexKey(x: number, y: number, z: number) {',
      'function vertexKey(x: number, y: number, z: number) { __counts.weld++;');
    const projection = '`${Math.round(x * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`';
    assert.ok(text.includes(projection));
    text = text.replaceAll(projection, `(__counts.projection++, ${projection})`);
    text = text.replace('else sets.join(triangle, owner);',
      'else { __joins.push([triangle, owner]); sets.join(triangle, owner); }');
    text = text.replace('projected.push(x, z);',
      '__sets.push([root, x, z]); projected.push(x, z);');
  }
  text += `
    const __counts = { weld: 0, projection: 0 }, __joins = [], __sets = [];
    export { geometrySolids as extract, collectSolids as extractBuckets };
    export function resetTrace() { __counts.weld = 0; __counts.projection = 0; __joins.length = 0; __sets.length = 0; }
    export function trace() { return { counts: { ...__counts }, joins: __joins.slice(), sets: __sets.slice() }; }
    export function inspectComponents(geometry) {
      const position = geometry.getAttribute('position'), index = geometry.getIndex();
      if (!position || position.count < 3) return [];
      const count = Math.floor((index?.count ?? position.count) / 3), sets = disjointSet(count);
      const vertices = index ? new Map() : null;
      joinTrianglesBySharedVertex(position, index, count, sets, vertices);
      const components = collectSolidComponents(position, index, count, sets, vertices);
      return { parents: Array.from(sets.parent), components: Array.from(components, ([root, part]) =>
        [root, part.minY, part.maxY, Array.from(part.vertices), part.projectedTriangles]) };
    }`;
  return { format: 'module-typescript', source: text, shortCircuit: true };
} });
let candidate, original, plainCandidate, plainOriginal;
try {
  candidate = await import(`${url.href}?vertex-candidate-trace`);
  original = await import(`${url.href}?vertex-original-trace`);
  plainCandidate = await import(`${url.href}?vertex-candidate-plain`);
  plainOriginal = await import(`${url.href}?vertex-original-plain`);
} finally { hook.deregister(); }

const owned = new Set();
const own = geometry => { owned.add(geometry); return geometry; };
function hashGeometry(geometry) {
  const hash = createHash('sha256');
  for (const attribute of [geometry.index, ...Object.values(geometry.attributes)]) {
    if (!attribute) continue;
    const data = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
    hash.update(`${attribute.itemSize}/${attribute.normalized}/${attribute.offset ?? 0}`);
    hash.update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return hash.digest('hex');
}

function compare(geometry, label) {
  const before = hashGeometry(geometry);
  candidate.resetTrace(); original.resetTrace();
  const expected = original.inspectComponents(geometry), actual = candidate.inspectComponents(geometry);
  assert.deepEqual(actual, expected, `${label}: exact union roots, Map insertion/overwrite values and triangle order`);
  const a = candidate.trace(), b = original.trace();
  assert.deepEqual(a.joins, b.joins, `${label}: every original owner and join in its original order`);
  assert.deepEqual(a.sets, b.sets, `${label}: every original component Map.set in its original order`);
  assert.ok(a.counts.weld <= b.counts.weld && a.counts.projection <= b.counts.projection);
  if (!geometry.index) assert.deepEqual(a.counts, b.counts, `${label}: nonindexed work path unchanged`);
  assert.deepEqual(candidate.extract(geometry, 'stone'), original.extract(geometry, 'stone'),
    `${label}: complete solids, exact numeric values including signed zero, and polygon order`);
  assert.equal(hashGeometry(geometry), before, `${label}: source attributes untouched`);
  return { actual, counts: { candidate: a.counts, original: b.counts } };
}

const tetraPositions = [0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 3, 0];
const tetraIndices = [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3];
const tetra = (array = new Float64Array(tetraPositions), indices = tetraIndices) => own(new THREE.BufferGeometry()
  .setAttribute('position', new THREE.BufferAttribute(array, 3)).setIndex(indices));
const bucketsFor = () => Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'stone', 'roof',
  'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'].map(name => [name, []]));
let randomCalls = 0;
const seeded = () => { let seed = 0x51a7c7; return () => {
  randomCalls++; seed += 0x6D2B79F5; let v = seed;
  v = Math.imul(v ^ v >>> 15, v | 1); v ^= v + Math.imul(v ^ v >>> 7, v | 61);
  return ((v ^ v >>> 14) >>> 0) / 4294967296;
}; };
const samples = [];
try {
  const cases = [own(new THREE.BufferGeometry()),
    own(new THREE.BoxGeometry(2, 6, 3)), own(new THREE.CylinderGeometry(1, 2, 6, 16, 3)),
    own(new THREE.SphereGeometry(2, 16, 8)), tetra(), tetra(new Float32Array(tetraPositions)),
    tetra(new Float64Array(tetraPositions), [...tetraIndices, 0, 0, 0, 3, 1]),
    own(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3)))];
  const normalized = tetra(new Int16Array(tetraPositions.map(value => value * 10000)));
  normalized.attributes.position.normalized = true; cases.push(normalized);
  const interleaved = tetra();
  interleaved.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(
    new Float64Array(Array.from({ length: 4 }, (_, i) => [99, ...tetraPositions.slice(i * 3, i * 3 + 3), -99]).flat()), 5), 3, 1));
  cases.push(interleaved);
  const interleavedNormalized = tetra();
  interleavedNormalized.setAttribute('position', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(
    new Int16Array(Array.from({ length: 4 }, (_, i) => [7, ...tetraPositions.slice(i * 3, i * 3 + 3).map(value => value * 10000), 8]).flat()), 5), 3, 1, true));
  cases.push(interleavedNormalized);
  for (const geometry of [...cases]) {
    if (geometry.index) cases.push(own(geometry.toNonIndexed()));
  }
  for (const delta of [0, -0, 0.000049999, 0.00005, 0.000050001, -0.000049999, -0.00005, -0.000050001]) {
    cases.push(tetra(new Float64Array([...tetraPositions, delta, 0, -0]), [...tetraIndices, 4, 1, 3]));
  }
  for (const [index, geometry] of cases.entries()) compare(geometry, `fixture ${index}`);

  const reused = tetra();
  reused.setIndex(new THREE.BufferAttribute(new Uint32Array(Array.from({ length: 128 }, () => tetraIndices).flat()), 1));
  const reduction = compare(reused, 'heavily reused Uint32 indices');
  assert.deepEqual(reduction.counts.candidate, { weld: 4, projection: 4 });
  assert.deepEqual(reduction.counts.original, { weld: 1536, projection: 1536 },
    'negative control must fail the deterministic reduction gate');
  samples.push({ fixture: 'reused indexed tetrahedra', ...reduction.counts });
  const unused = tetra(new Float64Array([...tetraPositions, ...Array(3000).fill(100)]));
  assert.deepEqual(compare(unused, 'unused positions').counts.candidate, { weld: 4, projection: 4 },
    'scratch is bounded by referenced indices, not unused attribute size');
  const beforeMove = compare(reused, 'before position mutation').actual;
  reused.translate(0.125, 0.5, -0.25);
  assert.notDeepEqual(compare(reused, 'same geometry after position mutation').actual, beforeMove);
  reused.index.setX(0, 1);
  compare(reused, 'same geometry after index mutation');
  normalized.attributes.position.normalized = false;
  compare(normalized, 'normalization changes between calls');
  const modifiedOutput = candidate.extract(reused, 'stone');
  modifiedOutput[0].points[0] += 100;
  compare(reused, 'caller result mutation cannot poison a later extraction');

  const corpus = [];
  for (const [name, build] of [['onionchurch', makeOnionChurch], ['waterTower', makeWaterTower],
    ['megatower', STRUCTURE_BUILDERS.megatower]]) {
    const buckets = bucketsFor(); build(seeded(), buckets, 'plaster');
    const geometries = Object.values(buckets).flat(); geometries.forEach(own);
    const draws = randomCalls;
    let candidateKeys = 0, originalKeys = 0;
    for (const [index, geometry] of geometries.entries()) {
      const result = compare(geometry, `${name}/${index}`);
      candidateKeys += result.counts.candidate.weld + result.counts.candidate.projection;
      originalKeys += result.counts.original.weld + result.counts.original.projection;
    }
    assert.equal(randomCalls, draws, 'collision extraction consumes no builder randomness');
    assert.deepEqual(candidate.extractBuckets(buckets), original.extractBuckets(buckets), `${name}: exact bucket/solid order`);
    assert.ok(candidateKeys < originalKeys, `${name}: actual authored structure reduces key work`);
    samples.push({ fixture: name, geometries: geometries.length, candidateKeys, originalKeys });
    corpus.push([name, buckets]);
  }
  const simpleBuckets = { stone: [own(new THREE.BoxGeometry(2, 4, 3).translate(0, 2, 0))],
    glass: [own(new THREE.BoxGeometry(30, 30, 30))], curtain: [] };
  for (const api of ['deriveRuntimeStructureCollisionProfile', 'deriveRuntimeStructureCollisionWithSolids',
    'deriveRuntimeStructureContactBand', 'deriveStructureCollisionProfile']) {
    assert.deepEqual(candidate[api](simpleBuckets), original[api](simpleBuckets), `${api}: exact public/runtime/authoring result`);
  }

  if (process.argv.includes('--bench')) {
    // Fixed ABBA order, warm JS/module state, no timing assertions or dropped
    // samples. Only actual extraction is timed, never parity/serialization.
    const measured = [];
    for (const arm of ['original', 'candidate', 'candidate', 'original']) {
      const implementation = arm === 'original' ? plainOriginal : plainCandidate;
      const started = performance.now();
      let solids = 0;
      for (let repeat = 0; repeat < 8; repeat++) for (const [, buckets] of corpus) {
        solids += implementation.extractBuckets(buckets).length;
      }
      measured.push({ arm, elapsedMs: performance.now() - started, repetitions: 8, solids });
    }
    console.log(JSON.stringify({ protocol: 'structure-indexed-vertex-extraction-ABBA-v1',
      nativeEvidence: false, timingGate: false, node: process.version, rows: measured }));
  }
} finally { for (const geometry of owned) geometry.dispose(); }
console.log(JSON.stringify({ pass: true, protocol: 'structure-indexed-vertex-parity-v1', samples }));
