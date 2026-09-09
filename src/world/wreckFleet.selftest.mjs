import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreckSteps } from './wrecks.ts';
import { isPublicWreckDonor, WRECK_ROSTER_POOLS } from './wreckRoster.ts';

// Admission smoke, not a fidelity/performance or original-painter parity gate.
// Existing wrecks/wreckPaintDedup tests own independent old-output goldens.
assert.equal(typeof globalThis.document, 'undefined', 'No DOM or Canvas fixture');
assert.equal(typeof globalThis.OffscreenCanvas, 'undefined', 'No offscreen painter fixture');
const FLOAT32_SLACK = 8 * 2 ** -23;
// Direct envelope of the existing char and rust branches; allow Float32 storage
// and normalization roundoff, but not a brighter replacement paint palette.
const RGB_MIN = [0.046 * 1.05, 0.046, 0.046 * 0.93];
const RGB_MAX = [(0.085 + 0.075) * 1.75, (0.085 + 0.075) * 0.9,
  (0.046 + 0.022 + 0.017 + 0.020) * 0.93];
const REPEATS = [
  { specId: 'leo2a7v', seed: 2401, pop: false },
  { specId: 'm551_sheridan', seed: 2402, pop: true },
  { specId: 'marder1a3', seed: 2403, pop: false },
  { specId: 'bmpt_t90', seed: 2404, pop: true },
];

function requireAttribute(attribute, count, label) {
  assert.ok(attribute?.isBufferAttribute && attribute.array.constructor === Float32Array, `${label}: Float32 stream`);
  assert.equal(attribute.itemSize, 3, `${label}: XYZ/RGB triples`);
  assert.equal(attribute.normalized, false, `${label}: native floating-point values`);
  assert.equal(attribute.count, count, `${label}: matching vertex count`);
  assert.equal(attribute.array.length, count * 3, `${label}: complete stream`);
}

function positionBounds(position, label) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < position.array.length; offset++) {
    const value = position.array[offset], axis = offset % 3;
    if (!Number.isFinite(value)) assert.fail(`${label}: nonfinite position at ${offset}`);
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
  }
  return { min, max };
}

function validateTopology(geometry, label, visible) {
  const count = geometry?.attributes.position?.count;
  assert.ok(Number.isSafeInteger(count) && count > 0, `${label}: nonempty vertex stream`);
  const expectedNames = visible ? ['color', 'normal', 'position'] : ['position'];
  assert.deepEqual(Object.keys(geometry.attributes).sort(), expectedNames, `${label}: only consumed streams retained`);
  for (const [name, attribute] of Object.entries(geometry.attributes)) requireAttribute(attribute, count, `${label}/${name}`);
  assert.deepEqual(geometry.groups, [], `${label}: no stale material groups`);
  assert.deepEqual(geometry.morphAttributes, {}, `${label}: no discarded morph residency`);
  assert.equal(geometry.drawRange.start, 0); assert.equal(geometry.drawRange.count, Infinity);
  const corners = geometry.index?.count ?? count;
  assert.ok(Number.isSafeInteger(corners) && corners > 0 && corners % 3 === 0, `${label}: complete triangles`);
  assert.ok(count <= corners, `${label}: no unreferenced vertex expansion`);
  if (geometry.index) {
    assert.equal(geometry.index.itemSize, 1); assert.equal(geometry.index.array.length, corners);
    assert.ok([Uint16Array, Uint32Array].includes(geometry.index.array.constructor), `${label}: supported unsigned indices`);
    if (geometry.index.array.constructor === Uint16Array) assert.ok(count <= 65535, `${label}: no WebGL2 restart index`);
    for (const index of geometry.index.array) assert.ok(index < count, `${label}: in-range index`);
  }
  if (!visible) assert.equal(geometry.index, null, `${label}: authored proxy remains nonindexed`);
  const bytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    + (geometry.index?.array.byteLength ?? 0);
  // This is proportional to this donor's actual ordered triangles, not an
  // invented fleet triangle ceiling. Compaction is installed only if smaller.
  const expandedBytes = corners * (visible ? 9 : 3) * Float32Array.BYTES_PER_ELEMENT;
  assert.ok(bytes <= expandedBytes, `${label}: retained storage cannot exceed its expanded source streams`);
  if (geometry.index) assert.ok(bytes < expandedBytes, `${label}: indexed storage must actually save bytes`);
  return { vertices: count, triangles: corners / 3, bytes, bounds: positionBounds(geometry.attributes.position, label) };
}

function validateNormals(normal, label) {
  let zeroNormals = 0;
  for (let offset = 0; offset < normal.array.length; offset += 3) {
    const x = normal.array[offset], y = normal.array[offset + 1], z = normal.array[offset + 2];
    if (![x, y, z].every(Number.isFinite)) assert.fail(`${label}: nonfinite normal at ${offset / 3}`);
    if (x === 0 && y === 0 && z === 0) { zeroNormals++; continue; }
    if (Math.abs(Math.hypot(x, y, z) - 1) > FLOAT32_SLACK) assert.fail(`${label}: non-unit normal at ${offset / 3}`);
  }
  // Three normalizes nonzero vectors, while authored degenerate or averaged-
  // cancelling normals stay zero. Preserve and report those; do not invent a
  // fleet-wide percentage allowance or silently normalize the tested output.
  assert.ok(zeroNormals < normal.count, `${label}: some renderable unit normals must remain`);
  return zeroNormals;
}

function validateColors(color, label) {
  for (let offset = 0; offset < color.array.length; offset++) {
    const value = color.array[offset], channel = offset % 3;
    if (!Number.isFinite(value) || value < RGB_MIN[channel] - FLOAT32_SLACK
      || value > RGB_MAX[channel] + FLOAT32_SLACK) assert.fail(`${label}: invalid wreck RGB at ${offset}`);
  }
}

function validateBake(baked, label) {
  assert.ok(baked, `${label}: real factory bake cannot be silently skipped`);
  const visible = validateTopology(baked.geo, label, true);
  assert.ok(baked.shadowGeo, `${label}: eligible donor retains its shadow proxy`);
  const shadow = validateTopology(baked.shadowGeo, `${label}/shadow`, false);
  assert.equal(baked.tris, visible.triangles, `${label}: returned triangle metadata`);
  assert.ok([baked.hx, baked.hz, baked.h].every(value => Number.isFinite(value) && value > 0), `${label}: finite positive envelope`);
  assert.ok(Math.abs(visible.bounds.min[1]) <= FLOAT32_SLACK, `${label}: ground-seated visible base`);
  const extents = visible.bounds.max.map((max, axis) => max - visible.bounds.min[axis]);
  for (const [actual, expected] of [[baked.hx, extents[0] / 2], [baked.hz, extents[2] / 2], [baked.h, extents[1]]]) {
    assert.ok(Math.abs(actual - expected) <= FLOAT32_SLACK * Math.max(1, expected), `${label}: envelope matches actual vertices`);
  }
  // The popped pose is asymmetric. Neither XZ centering nor shadow seating/
  // containment is a contract of the current authored proxy bake.
  const zeroNormals = validateNormals(baked.geo.attributes.normal, label);
  validateColors(baked.geo.attributes.color, label);
  return { triangles: baked.tris, vertices: visible.vertices, bytes: visible.bytes + shadow.bytes,
    visibleBytes: visible.bytes, shadowTriangles: shadow.triangles, zeroNormals, bounds: [baked.hx, baked.hz, baked.h] };
}

function streamFingerprint(attribute) {
  if (!attribute) return null;
  const array = attribute.array;
  return { itemSize: attribute.itemSize, normalized: attribute.normalized, name: attribute.name,
    usage: attribute.usage, gpuType: attribute.gpuType, type: array.constructor.name, length: array.length,
    hash: createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex') };
}

function fingerprint(baked) {
  const geometry = value => ({
    attributes: Object.entries(value.attributes).map(([name, attribute]) => [name, streamFingerprint(attribute)]),
    index: streamFingerprint(value.index), groups: value.groups,
    drawRange: [value.drawRange.start, String(value.drawRange.count)],
    box: value.boundingBox && [value.boundingBox.min.toArray(), value.boundingBox.max.toArray()],
    sphere: value.boundingSphere && [value.boundingSphere.center.toArray(), value.boundingSphere.radius],
  });
  return createHash('sha256').update(JSON.stringify({ dimensions: [baked.hx, baked.hz, baked.h, baked.tris],
    visible: geometry(baked.geo), shadow: geometry(baked.shadowGeo) })).digest('hex');
}

function dispose(baked) {
  try { baked?.geo.dispose(); } finally { baked?.shadowGeo?.dispose(); }
}

async function bakeFixture(fixture) {
  await ensureTankBuilder(fixture.specId);
  const steps = bakeTankWreckSteps(null, fixture.specId, fixture);
  let baked = null, checkpoints = 0;
  try {
    for (;;) {
      const next = steps.next();
      if (next.done) { baked = next.value; break; }
      assert.equal(next.value.fine, true); assert.equal(next.value.progress, false);
      assert.ok(next.value.stage.startsWith(`wreck-${fixture.specId}:`));
      assert.ok(++checkpoints < 100000, `${fixture.specId}: runaway generator, not a fleet triangle budget`);
    }
    const receipt = validateBake(baked, fixture.specId);
    return { ...fixture, ...receipt, checkpoints, fingerprint: fingerprint(baked) };
  } finally { try { steps.return(null); } finally { dispose(baked); } }
}

// Tiny negative controls verify the smoke checks before acquiring any family.
function tinyBake() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 1], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([0.063, 0.06, 0.0558, 0.063, 0.06, 0.0558, 0.063, 0.06, 0.0558], 3));
  geo.setIndex([0, 1, 2, 0, 1, 2]);
  const shadowGeo = new THREE.BufferGeometry(); shadowGeo.setAttribute('position', geo.attributes.position.clone());
  return { geo, shadowGeo, hx: 0.5, hz: 0.5, h: 1, tris: 2 };
}
for (const mutate of [
  baked => { baked.geo.attributes.position.array[0] = NaN; },
  baked => { baked.geo.attributes.normal.array[1] = 0.5; },
  baked => { baked.geo.attributes.normal.array.fill(0); },
  baked => { baked.geo.attributes.color.array[0] = 1; },
  baked => { baked.geo.index.array[0] = 3; },
  baked => { baked.geo.translate(0, 1, 0); },
  baked => { baked.shadowGeo.attributes.position.array[0] = Infinity; },
  baked => { baked.tris++; },
]) {
  const baked = tinyBake();
  try { validateBake(baked, 'negative-control'); mutate(baked); assert.throws(() => validateBake(baked, 'negative-control')); }
  finally { dispose(baked); }
}
const zeroNormal = tinyBake();
try {
  zeroNormal.geo.attributes.normal.array.fill(0, 0, 3);
  assert.equal(validateBake(zeroNormal, 'authored-zero-control').zeroNormals, 1);
} finally { dispose(zeroNormal); }

const donorIds = [...new Set(Object.values(WRECK_ROSTER_POOLS).flat())];
assert.ok(donorIds.length > 0);
for (const fixture of REPEATS) assert.ok(donorIds.includes(fixture.specId), `${fixture.specId}: new-family representative is eligible`);
const fixtures = donorIds.map((specId, index) => REPEATS.find(fixture => fixture.specId === specId)
  ?? { specId, seed: 9000 + index * 131, pop: index % 2 === 1 });
const receipts = [], failures = [];
for (const fixture of fixtures) {
  try {
    assert.ok(isPublicWreckDonor(fixture.specId), `${fixture.specId}: no hidden/retired donor enters real-bake smoke`);
    receipts.push(await bakeFixture(fixture));
  } catch (error) { failures.push(`${fixture.specId}: ${String(error)}`); }
}
// Repeat after other families have been acquired, so cache/registration order
// cannot silently change these donors. Only four extra real constructions.
for (const fixture of REPEATS) {
  const first = receipts.find(receipt => receipt.specId === fixture.specId);
  if (!first) continue; // The first failure remains fatal and is reported below.
  try { assert.deepEqual(await bakeFixture(fixture), first, `${fixture.specId}: same-seed pose and streams remain deterministic`); }
  catch (error) { failures.push(`${fixture.specId}/repeat: ${String(error)}`); }
}
assert.equal(typeof globalThis.document, 'undefined');
assert.equal(typeof globalThis.OffscreenCanvas, 'undefined');
assert.equal(failures.length, 0, `Every eligible wreck donor must bake successfully:\n${failures.join('\n')}`);
assert.equal(receipts.length, donorIds.length);
console.log('wreckFleet.selftest: all eligible real donors, finite posed streams, paint envelope, shadow proxies, proportional storage and four new-family deterministic repeats pass',
  JSON.stringify({ donors: receipts.length, repeats: REPEATS, receipts }));
