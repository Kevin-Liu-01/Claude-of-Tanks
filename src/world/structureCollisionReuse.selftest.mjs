import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { makeOnionChurch } from './maps/villageKit.ts';
import { addCatalogExterior } from './maps/exteriorDetailKit.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { SOURCED_STRUCTURE_TYPES } from './sourcedStructureTypes.ts';
import { createObstacleGrid } from './collision.ts';
import { createGroundCoverClearance, createGroundCoverSolidProfile,
  attachGroundCoverSolidProfile } from './groundCoverClearance.ts';

// The complete pre-cache source algorithm, not a second handwritten geometry
// implementation. Load it in memory over the same module and real dependencies.
const uncachedCollisionSource = `function collisionSource(solids: LocalSolid[], groundContact: boolean): number[][] {
  // Open-ended decorative cylinders high on towers (rails, collars and trim)
  // have no projected cap area. Ground-bearing open solids remain physical
  // because they can be structural walls or posts. Triangle-pair merging is
  // useful for ordinary primitives but quadratic on dense scanned meshes.
  const collisionSolids = groundContact
    ? solids
    : solids.filter((solid) => solid.projectedTriangles.length > 0 || solid.minY <= CONTACT_TOP);
  const activeSolids = collisionSolids.length ? collisionSolids : solids;
  const projectedCount = activeSolids.reduce(
    (total, solid) => total + solid.projectedTriangles.length, 0,
  );
  if (projectedCount > 512) {
    return activeSolids.flatMap((solid) => solid.projectedTriangles.length
      ? solid.projectedTriangles
      : [solid.points]);
  }
  return uniquePolygons(activeSolids.flatMap((solid) => {
    const projected = mergeProjectedTriangles(solid.projectedTriangles);
    return projected.length ? projected : [solid.points];
  }));
}`;
const moduleUrl = new URL('./structureCollision.ts', import.meta.url);
const source = readFileSync(moduleUrl, 'utf8');
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url !== `${moduleUrl.href}?reuse-cached` && url !== `${moduleUrl.href}?reuse-control`) {
    return nextLoad(url, context);
  }
  let text = source;
  if (url.endsWith('?reuse-control')) {
    const original = text.match(/function collisionSource\([\s\S]*?\n}/)?.[0];
    assert.ok(original, 'the original collision source boundary must exist');
    text = text.replace(original, uncachedCollisionSource);
  }
  const merge = 'function mergeProjectedTriangles(triangles: number[][]) {';
  const dense = 'if (projectedCount > 512) {';
  const band = text.match(/function makeRuntimeBand\([\s\S]*?\): StructureCollisionRuntimeBand \{/)?.[0];
  assert.equal(text.split(merge).length, 2);
  assert.equal(text.split(dense).length, 2);
  assert.ok(band, 'runtime band boundary must exist');
  text = text.replace(merge, `${merge}
    __reuseCounts.merges++;
    if (!triangles.length) __reuseCounts.empty++;
    if (__reuseInputs.has(triangles)) __reuseCounts.repeated++;
    __reuseInputs.add(triangles);`)
    .replace(dense, `${dense} __reuseCounts.dense++;`)
    .replace(band, `${band} __reuseCounts.bands++;`);
  text += `
    const __reuseCounts = { merges: 0, empty: 0, repeated: 0, dense: 0, bands: 0 };
    const __reuseInputs = new Set();
    export function reuseCounts() { return { ...__reuseCounts }; }
    export function resetReuseCounts() {
      for (const key of Object.keys(__reuseCounts)) __reuseCounts[key] = 0;
      __reuseInputs.clear();
    }`;
  return { format: 'module-typescript', source: text, shortCircuit: true };
} });
let cached, control;
try {
  cached = await import(`${moduleUrl.href}?reuse-cached`);
  control = await import(`${moduleUrl.href}?reuse-control`);
} finally { hooks.deregister(); }

const ownedGeometry = new Set();
const own = geometry => { ownedGeometry.add(geometry); return geometry; };
const box = (height = 6) => own(new THREE.BoxGeometry(2, height, 3).translate(0, height / 2, 0));
// The actual licensed source streams and shared authored scale/sink settings,
// using the same collision fixture transform as structureCollision.selftest.
function sourcedSandbag(spec, models) {
  const model = models[spec.model];
  assert.ok(model, `${spec.model}: real source model exists`);
  const [minX, minY, minZ] = model.bbox.min;
  const [maxX, maxY, maxZ] = model.bbox.max;
  const scale = spec.targetH / Math.max(1e-6, maxY - minY);
  const centerX = (minX + maxX) * 0.5, centerZ = (minZ + maxZ) * 0.5;
  const positions = new Float32Array(model.positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = (model.positions[index] - centerX) * scale;
    positions[index + 1] = (model.positions[index + 1] - minY) * scale - spec.sink;
    positions[index + 2] = (model.positions[index + 2] - centerZ) * scale;
  }
  return own(new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(positions, 3))
    .setIndex(new THREE.BufferAttribute(new Uint16Array(model.indices), 1)));
}
function seeded(seed = 0x51a7c7) {
  let draws = 0;
  const rng = () => {
    draws++;
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  return { rng, draws: () => draws };
}
function geometryHash(buckets) {
  const hash = createHash('sha256');
  for (const [bucket, geometries] of Object.entries(buckets)) {
    hash.update(bucket);
    for (const geometry of geometries ?? []) {
      for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
        if (attribute) hash.update(new Uint8Array(attribute.array.buffer,
          attribute.array.byteOffset, attribute.array.byteLength));
      }
    }
  }
  return hash.digest('hex');
}
function compare(buckets, label) {
  const before = geometryHash(buckets);
  cached.resetReuseCounts(); control.resetReuseCounts();
  const expected = control.deriveRuntimeStructureCollisionProfile(buckets);
  const actual = cached.deriveRuntimeStructureCollisionProfile(buckets);
  assert.deepEqual(actual, expected, `${label}: exact contact/shell bounds, polygon values and order`);
  const counts = { cached: cached.reuseCounts(), control: control.reuseCounts() };
  assert.equal(counts.cached.repeated, 0, `${label}: each solid projection is merged at most once per profile`);
  assert.equal(counts.cached.dense, counts.control.dense, `${label}: dense branch selection is unchanged`);
  cached.resetReuseCounts();
  const withSolids = cached.deriveRuntimeStructureCollisionWithSolids(buckets);
  assert.equal(cached.reuseCounts().repeated, 0, `${label}: WithSolids also merges each projection at most once`);
  assert.ok(cached.reuseCounts().merges <= withSolids.solids.length);
  assert.deepEqual(withSolids, control.deriveRuntimeStructureCollisionWithSolids(buckets),
    `${label}: consumer source solids and contactTop remain exact, with no cache field added`);
  assert.deepEqual(withSolids.profile, actual, `${label}: both runtime APIs use the same profile`);
  cached.resetReuseCounts();
  const contact = cached.deriveRuntimeStructureContactBand(buckets);
  assert.deepEqual(contact, expected.contact, `${label}: contact-only matches the complete original profile exactly`);
  assert.equal(cached.reuseCounts().bands, 1, `${label}: contact-only constructs no discarded shell bands`);
  assert.notEqual(contact, actual.contact, `${label}: separate calls own their result band`);
  assert.notEqual(contact.parts, actual.contact.parts, `${label}: separate calls own their polygon array`);
  assert.equal(geometryHash(buckets), before, `${label}: all source geometry streams remain untouched`);
  return { profile: actual, counts, withSolids };
}
function consumerOutput(api, buckets) {
  const { profile, solids, contactTop } = api.deriveRuntimeStructureCollisionWithSolids(buckets);
  const detail = createGroundCoverSolidProfile(solids, contactTop);
  const record = { min: [-4, 0, -4], max: [4, 6, 4] };
  api.applyStructureCollisionBand(record, profile.contact, 0, 0, 0);
  if (detail) attachGroundCoverSolidProfile(record, detail, new THREE.Matrix4().elements);
  const blocked = createGroundCoverClearance(createObstacleGrid([record]));
  const samples = [];
  for (const y of [-0.03, 1, 3]) for (const x of [-2, -1.2, 0, 1.2, 2]) {
    for (const z of [-2, -1.2, 0, 1.2, 2]) for (const height of [0.4, 1.5]) {
      samples.push(blocked(x, y, z, height, 0.15));
    }
  }
  return { detail, record, samples };
}
function errorReceipt(api, entrypoint, buckets) {
  try { api[entrypoint](buckets); }
  catch (error) { return { name: error.name, message: error.message }; }
  assert.fail('invalid geometry must retain its original error');
}

try {
  const ordinary = { stone: [box()] };
  const ordinaryResult = compare(ordinary, 'multi-band solid');
  assert.ok(ordinaryResult.counts.cached.merges < ordinaryResult.counts.control.merges);
  cached.resetReuseCounts(); control.resetReuseCounts();
  assert.deepEqual(cached.deriveStructureCollisionProfile(ordinary), control.deriveStructureCollisionProfile(ordinary),
    'authoring profiles and independent quality scoring remain outside the runtime cache');
  assert.deepEqual(cached.reuseCounts(), control.reuseCounts(), 'authoring keeps the original uncached work path');
  assert.ok(cached.reuseCounts().repeated > 0);

  const open = { stone: [own(new THREE.CylinderGeometry(1, 1, 6, 8, 1, true).translate(0, 3, 0))] };
  const openResult = compare(open, 'empty projection uses original hull fallback');
  assert.equal(openResult.counts.cached.empty, 1, 'an empty result is cached, not repeatedly treated as absent');
  assert.ok(openResult.counts.control.empty > 1);
  compare({ ...open, dark: [own(new THREE.CylinderGeometry(1, 1, 2, 8, 1, true).translate(0, 8, 0))] },
    'high open decoration filtering and empty-active fallback');

  for (const count of [128, 129]) {
    const buckets = { stone: Array.from({ length: count }, () => box(1.5)) };
    const result = compare(buckets, `${count * 4} projected triangle threshold`);
    assert.equal(result.counts.cached.dense > 0, count === 129, 'strict >512 threshold is unchanged');
    if (count === 129) assert.equal(result.counts.cached.merges, 0, 'dense path bypasses the merge cache entirely');
  }
  const mixed = compare({ stone: [box(), ...Array.from({ length: 129 }, () => box(1.5))] },
    'dense lower bands and ordinary upper bands in the same profile');
  assert.ok(mixed.counts.cached.dense > 0);
  assert.equal(mixed.counts.cached.merges, 1, 'the later ordinary bands reuse only their active tall solid');
  assert.ok(mixed.counts.control.merges > 1);
  const ignored = { ...ordinary, glass: [box(20)], curtain: [box(30)], unused: undefined };
  assert.deepEqual(compare(ignored, 'ignored buckets').profile, ordinaryResult.profile);
  for (const buckets of [{}, { roof: [box()] }, { glass: [box()], curtain: [box()] },
    { stone: [own(new THREE.BufferGeometry())] },
    { stone: [own(new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3)))] },
    { stone: [box(0.01)] }, { stone: [box().translate(0, 10, 0)] },
    { stone: [{ getAttribute() { throw new TypeError('source position unavailable'); } }] }]) {
    for (const entrypoint of ['deriveRuntimeStructureCollisionProfile', 'deriveRuntimeStructureCollisionWithSolids',
      'deriveRuntimeStructureContactBand']) {
      assert.deepEqual(errorReceipt(cached, entrypoint, buckets), errorReceipt(control, entrypoint, buckets),
        `${entrypoint}: original extraction/error semantics`);
    }
    assert.deepEqual(errorReceipt(cached, 'deriveRuntimeStructureContactBand', buckets),
      errorReceipt(control, 'deriveRuntimeStructureCollisionProfile', buckets),
      'contact-only rejects the same unsupported/groundless sources as the complete profile');
  }

  const sandbagSamples = [];
  const models = JSON.parse(readFileSync(new URL('./props-models.json', import.meta.url), 'utf8'));
  for (const id of ['sandbagsmall', 'sandbagbig']) {
    const buckets = { baked: [sourcedSandbag(SOURCED_STRUCTURE_TYPES[id], models)] };
    const result = compare(buckets, `real ${id}`);
    const times = {};
    for (const entrypoint of ['deriveRuntimeStructureCollisionProfile', 'deriveRuntimeStructureContactBand']) {
      const started = performance.now();
      const output = cached[entrypoint](buckets);
      times[entrypoint] = performance.now() - started;
      assert.deepEqual(output.contact ?? output, result.profile.contact);
    }
    sandbagSamples.push({ id, shellBandsSkipped: result.profile.shell.length, milliseconds: times });
  }

  const guardRng = seeded();
  const guard = { baked: [own(DESTRUCTIBLE_BUILDING_TYPES.guardpost.build(guardRng.rng))] };
  const guardDraws = guardRng.draws();
  compare(guard, 'real raised guardpost');
  const consumer = consumerOutput(cached, guard);
  assert.ok(consumer.detail, 'the real WithSolids consumer exercises raised-solid refinement');
  assert.ok(consumer.samples.includes(true) && consumer.samples.includes(false));
  assert.deepEqual(consumer, consumerOutput(control, guard), 'exact collision records and cosmetic admission decisions');
  assert.equal(guardRng.draws(), guardDraws, 'profile extraction consumes no builder RNG');

  const original = structuredClone(ordinaryResult.profile);
  const shellBefore = structuredClone(ordinaryResult.profile.shell);
  ordinaryResult.profile.contact.parts[0].points[0] += 100;
  assert.deepEqual(ordinaryResult.profile.shell, shellBefore, 'bands retain independently copied output polygons');
  ordinaryResult.withSolids.solids[0].points[0] += 200;
  ordinaryResult.withSolids.solids[0].projectedTriangles[0][0] += 300;
  assert.deepEqual(cached.deriveRuntimeStructureCollisionProfile(ordinary), original,
    'mutated caller outputs cannot poison another extraction');
  const contact = cached.deriveRuntimeStructureContactBand(ordinary);
  contact.parts[0].points[0] += 400;
  assert.deepEqual(cached.deriveRuntimeStructureContactBand(ordinary), original.contact,
    'contact-only calls own fresh polygons and retain no mutated output');
  ordinary.stone[0].translate(3, 0.5, -2);
  const changed = compare(ordinary, 'mutated input geometry in an independent call').profile;
  assert.notDeepEqual(changed, original, 'later calls re-extract current geometry rather than reuse stale projections');
  assert.deepEqual(cached.deriveRuntimeStructureCollisionProfile(ordinary), changed, 'repeated independent calls remain stable');

  const samples = [];
  for (const seed of [0x51a7c7, 0xa1139e]) {
    const buckets = Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'stone', 'roof',
      'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'].map(name => [name, []]));
    const rng = seeded(seed);
    const buildStart = performance.now();
    const info = makeOnionChurch(rng.rng, buckets);
    addCatalogExterior(buckets, { id: 'onionchurch', info, variant: 0 });
    const buildMs = performance.now() - buildStart;
    for (const geometries of Object.values(buckets)) for (const geometry of geometries) own(geometry);
    const draws = rng.draws();
    const result = compare(buckets, `real onionchurch ${seed}`);
    assert.ok(result.counts.cached.merges < result.counts.control.merges, 'real multi-band church reduces exact merge work');
    assert.ok(result.counts.control.repeated > 0, 'uncached real church control exercises repeated work');
    const times = { cached: [], control: [] };
    // Six explicitly bounded profile calls; order alternates. CPU attribution
    // only, not native frames, whole-world latency, or a flaky wall-time gate.
    for (let run = 0; run < 3; run++) {
      for (const variant of run % 2 ? ['cached', 'control'] : ['control', 'cached']) {
        const api = variant === 'cached' ? cached : control;
        api.resetReuseCounts();
        const started = performance.now();
        const profile = api.deriveRuntimeStructureCollisionProfile(buckets);
        times[variant].push(performance.now() - started);
        assert.deepEqual(profile, result.profile);
      }
    }
    assert.equal(rng.draws(), draws);
    samples.push({ seed, geometries: Object.values(buckets).flat().length, shellBands: result.profile.shell.length,
      buildMs, merges: result.counts, profileMs: times });
  }
  console.log('structureCollisionReuse.selftest: exact uncached-source/profile/contact-only/consumer parity, empty/dense/error/mutation cases, real sandbags and bounded real-builder CPU attribution pass');
  console.log(JSON.stringify({ meaning: 'same-process CPU attribution, not GPU/native-frame acceptance', sandbagSamples, samples }));
} finally {
  cached.resetReuseCounts(); control.resetReuseCounts();
  for (const geometry of ownedGeometry) geometry.dispose();
}
