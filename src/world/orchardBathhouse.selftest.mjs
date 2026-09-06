import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES, makeBathhouse, makeTimberBathhouse } from './maps/structureKit.ts';
import { addCatalogExterior, addConnectedExterior } from './maps/exteriorDetailKit.ts';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import { jitterUV } from './propGeometry.ts';
import { mulberry32 } from './props.ts';
import { createHeightField } from './terrain.ts';
import { sampleObbGround } from './propPlacement.ts';
import { deriveRuntimeStructureCollisionProfile, appendStructureCollisionBand } from './structureCollision.ts';
import { certifyGroundedStructureParts, measureBoundsJoint } from './structureConnectivity.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const names = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const emptyBuckets = () => Object.fromEntries(names.map(name => [name, []]));
const dispose = buckets => Object.values(buckets).flat().forEach(geometry => geometry.dispose());
// Captured from the full 15-builder catalog before the Orchard variant. This
// includes actual addCatalogExterior + UV jitter, dimensions and both RNG tails.
const legacyHashes = {
  1337: '04c9e11e9589e03b8a156e90a8a5a7024b93fddc072b5a8956918120baeeb44c',
  2025: '55c23be9043b02a9bb08652c8a58affc2c43fb83f45c5ab8b1bf0c07657ada5c',
  7719: 'eb17dbf59bf6ab68566515ab083fbfeddd1bb47c4805f7e5e244cd8c91c20919',
};
// Captured before this frontage edit from frozen V25 source68890fe286a6.
// Counts are actual parts/vertices/indices/attribute+index bytes, not budgets
// inferred from catalog metadata. Only material routing and five balcony
// primitives change; the complementary shape hash preserves all65 other
// geometries regardless of their explicitly reassigned material bucket.
const v25Totals = { parts: 70, vertices: 1888, indices: 2892, bytes: 66008 };
const v25UnchangedShapes = 'b188c77835bfba1529183fa2a7bc6362983566b3a45561d65c4df9a387ad1c1d';
const v25RoofHash = 'a0a3280d6e6bbb095fe4cbab0306104ba4503a91a8dcd3427831dbe17bd0d04e';
const frontageLedger = {
  plaster: [2, 48, 72, 1680], stone: [7, 168, 252, 5880], roof: [4, 120, 216, 4272],
  wood: [43, 1104, 1608, 38352], dark: [10, 352, 600, 12464],
  glass: [2, 48, 72, 1680], curtain: [2, 48, 72, 1680],
};
// Production also retains its existing42-part addCatalogExterior pass. Its
// geometry/allocation is preserved, with an explicit material-only variant.
const finalTotals = { parts: 112, vertices: 2980, indices: 4584, bytes: 104336 };
const finalLedger = {
  plaster: [2, 48, 72, 1680], stone: [12, 288, 432, 10080], roof: [4, 120, 216, 4272],
  wood: [68, 1704, 2508, 59352], dark: [22, 724, 1212, 25592],
  glass: [2, 48, 72, 1680], curtain: [2, 48, 72, 1680],
};

function hashGeometry(hash, geometry) {
  for (const name of Object.keys(geometry.attributes).sort()) {
    const a = geometry.attributes[name].array;
    hash.update(name); hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  if (geometry.index) {
    const a = geometry.index.array;
    hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
}

function assertLegacyCatalog(seed) {
  const hash = createHash('sha256');
  for (const [id, build] of Object.entries(STRUCTURE_BUILDERS)) {
    const buckets = emptyBuckets(), random = mulberry32(seed), detail = mulberry32(seed + 990);
    let calls = 0;
    const rng = () => { calls++; return random(); };
    try {
      const info = build(rng, buckets, 'plaster');
      addCatalogExterior(buckets, { id, info, variant: 0 });
      for (const name of names) {
        hash.update(name);
        for (const geometry of buckets[name]) {
          jitterUV(geometry, geometry.userData?.detailUv ? detail : rng);
          hashGeometry(hash, geometry);
        }
      }
      hash.update(JSON.stringify({ id, info, calls, next: random(), detail: detail() }));
    } finally { dispose(buckets); }
  }
  assert.equal(hash.digest('hex'), legacyHashes[seed],
    'all non-Orchard catalog constructors and post-construction RNG stay byte-identical');
}

function bucketStats(geometries) {
  return geometries.reduce((sum, g) => {
    sum.parts++;
    sum.vertices += g.attributes.position.count;
    sum.indices += g.index?.count ?? g.attributes.position.count;
    sum.bytes += Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0)
      + (g.index?.array.byteLength ?? 0);
    return sum;
  }, { parts: 0, vertices: 0, indices: 0, bytes: 0 });
}

function assertBudget(before, after) {
  const oldTotal = bucketStats(Object.values(before).flat()), nextTotal = bucketStats(Object.values(after).flat());
  assert.deepEqual(nextTotal, v25Totals, 'frontage changes no constructor/merged geometry capacity versus V25');
  assert.equal(nextTotal.parts, oldTotal.parts, 'same total UV-jitter draws and primitive allocations');
  for (const name of names) {
    assert.deepEqual(Object.values(bucketStats(after[name])), frontageLedger[name] || [0, 0, 0, 0],
      `${name}: exact declared material transfer, not an exemption for unbounded bucket growth`);
  }
  const savedBytes = oldTotal.bytes - nextTotal.bytes, savedFinalBytes = (oldTotal.indices - nextTotal.indices) * 32;
  assert.ok(savedBytes > 9000 && savedFinalBytes > 40000,
    'the actual constructor and final nonindexed merge both get smaller');
  return { savedBytes, savedFinalBytes };
}

function geometryDigest(geometry) {
  const hash = createHash('sha256'); hashGeometry(hash, geometry); return hash.digest('hex');
}

function assertPlacedBudget(before, after) {
  const totals = bucketStats(Object.values(after).flat());
  assert.deepEqual(totals, finalTotals, 'actual source emits its full112-part V25 allocation, not just the70-part core');
  assert.equal(bucketStats(Object.values(before).flat()).parts, totals.parts);
  for (const name of names) assert.deepEqual(Object.values(bucketStats(after[name])),
    finalLedger[name] || [0, 0, 0, 0], `${name}: exact final production material transfer`);
}

function assertRetainedCatalogPass(seed) {
  const before = emptyBuckets(), after = emptyBuckets();
  try {
    const oldInfo = makeBathhouse(mulberry32(seed), before, 'stone');
    const newInfo = makeTimberBathhouse(mulberry32(seed), after, 'stone');
    const oldCounts = names.map(name => before[name].length), newCounts = names.map(name => after[name].length);
    addCatalogExterior(before, { id: 'bathhouse', info: oldInfo, variant: 0 });
    addCatalogExterior(after, { id: 'bathhouse', info: newInfo, variant: 0, bathhouseStyle: 'timber' });
    const suffix = (buckets, counts) => names.flatMap((name, i) => buckets[name].slice(counts[i]));
    const oldParts = suffix(before, oldCounts), newParts = suffix(after, newCounts);
    assert.equal(newParts.length, 42);
    assert.deepEqual(newParts.map(geometryDigest).sort(), oldParts.map(geometryDigest).sort(),
      'the retained42-part production pass changes only material ownership, not geometry/UVs/normals');
    for (const name of names) assert.deepEqual(Object.values(bucketStats(after[name])),
      finalLedger[name] || [0, 0, 0, 0], `${name}: exact premerge final material ledger`);
  } finally { dispose(before); dispose(after); }
}

function assertUnchangedConstructorShapes(buckets) {
  const shapes = Object.values(buckets).flat().filter(g => !g.userData.structureSupport?.part.startsWith('bathhouse-entry-'));
  assert.equal(shapes.length, 65);
  const hash = createHash('sha256').update(shapes.map(geometryDigest).sort().join('\n')).digest('hex');
  assert.equal(hash, v25UnchangedShapes, 'all65 non-balcony shapes/UVs/normals remain byte-identical to V25');
  assert.equal(createHash('sha256').update(buckets.roof.map(geometryDigest).join('\n')).digest('hex'), v25RoofHash,
    'accepted swept roof geometry and metric UVs are untouched');
}

function bounds(buckets) {
  const result = new THREE.Box3();
  for (const geometry of Object.values(buckets).flat()) {
    geometry.computeBoundingBox(); result.union(geometry.boundingBox);
  }
  return result;
}

function assertRoofGeometry(buckets) {
  const surfaces = buckets.roof;
  assert.equal(surfaces.length, 4);
  assert.equal(surfaces.filter(g => g.name === 'orchard-bathhouse-swept-roof').length, 2);
  assert.ok(surfaces.every(g => g.type !== 'SphereGeometry'), 'the visible landmark is no longer a dome cluster');
  for (const geometry of surfaces) {
    const p = geometry.attributes.position, normal = geometry.attributes.normal;
    assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
    for (const a of Object.values(geometry.attributes)) assert.ok(a.array.every(Number.isFinite));
    for (let i = 0; i < normal.count; i++) assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-5);
    // Every closed solid has paired welded geometric edges. Hard-normal/UV
    // seams may duplicate vertices, but no roof end or underside may be open.
    const edges = new Map();
    const key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 10000)).join(':');
    for (let i = 0; i < geometry.index.count; i += 3) {
      const ids = [0, 1, 2].map(k => geometry.index.getX(i + k));
      for (let edge = 0; edge < 3; edge++) {
        const a = key(ids[edge]), b = key(ids[(edge + 1) % 3]);
        const pair = [a, b].sort().join('/'), directed = a < b ? 1 : -1;
        const old = edges.get(pair) || { count: 0, balance: 0 };
        edges.set(pair, { count: old.count + 1, balance: old.balance + directed });
      }
    }
    for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, balance: 0 },
      'all actual roof triangles close with consistent outward winding');
  }
  const all = Object.values(buckets).flat();
  const support = certifyGroundedStructureParts('orchard-timber-bathhouse', all);
  assert.equal(support.connected, all.length);
  const canopy = surfaces.find(g => g.name === 'orchard-bathhouse-entry-roof');
  canopy.computeBoundingBox();
  assert.ok(canopy.boundingBox.min.z < 5.5 && canopy.boundingBox.max.z > 7.35,
    'the finite entry canopy joins the main wall and covers the existing vestibule');
  assert.ok(canopy.boundingBox.max.y < 4.5, 'lower entry roof tucks into the main body, not a floating pavilion');
}

function assertTimberFrontage(buckets) {
  const main = buckets.plaster.find(g => g.parameters.width === 12.4);
  const vestibule = buckets.plaster.find(g => g.parameters.width === 4);
  assert.ok(main && vestibule, 'both full wall envelopes use warm sourced plaster regardless of the wall picker');
  assert.equal(buckets.stone.length, 7, 'only foundation, four plinths, threshold and service base remain masonry');
  const timberNames = buckets.wood.map(g => g.name);
  assert.equal(timberNames.filter(n => n === 'orchard-bathhouse-timber-gable').length, 2);
  assert.ok(timberNames.includes('orchard-bathhouse-entry-braces'));
  const frame = buckets.wood.filter(g => g.userData.structureSupport
    && !g.userData.structureSupport.part.startsWith('bathhouse-entry-'));
  assert.equal(frame.length, 25, 'existing cornices, posts, rear window frames and door surround reuse timber');
  const parts = Object.values(buckets).flat();
  assert.ok(!parts.some(g => g.userData.structureSupport?.part.startsWith('balcony-')),
    'civic balcony is actually replaced, not left competing with the lower entrance canopy');
  const entry = parts.filter(g => g.userData.structureSupport?.part.startsWith('bathhouse-entry-'));
  assert.equal(entry.length, 5, 'exact five-part balcony allocation funds the entrance');
  const supports = new Map([['bathhouse-vestibule', vestibule]]);
  for (const g of entry) supports.set(g.userData.structureSupport.part, g);
  for (const g of entry) {
    const owner = supports.get(g.userData.structureSupport.support);
    assert.ok(owner, 'the named support is an actual emitted part or the actual existing vestibule');
    g.computeBoundingBox(); owner.computeBoundingBox();
    const joint = measureBoundsJoint(g.boundingBox, owner.boundingBox);
    assert.equal(joint.gap, 0, 'every entrance piece physically overlaps its intended support');
    assert.ok(joint.contactAxes >= 2 && joint.minContactSpan >= 0.015,
      'support spans are real finite faces, not zero-area corners');
    assert.ok(g.boundingBox.min.y > 1.8 && g.boundingBox.max.z <= 7.49001,
      'the approved2cm extension remains strictly above the tank-contact band');
    assert.equal(g.attributes.position.count, 24); assert.equal(g.index.count, 36);
    assert.ok(g.userData.detailUv, 'every replacement retains the original independent detail-jitter RNG stream');
  }
  const panels = buckets.curtain.filter(g => g.userData.structureSupport?.part.startsWith('bathhouse-entry-panel-'));
  assert.equal(panels.length, 2, 'split cloth is emitted into the existing opaque fabric material');
  panels.sort((a, b) => a.boundingBox.min.x - b.boundingBox.min.x);
  assert.ok(Math.abs(panels[1].boundingBox.min.x - panels[0].boundingBox.max.x - 0.12) < 0.00001,
    'the two hanging panels have an actual12cm central split');
  const door = buckets.dark.find(g => g.parameters?.width === 1.6 && g.parameters?.height === 2.7);
  assert.ok(door, 'the original real door remains behind the fabric'); door.computeBoundingBox();
  for (const panel of panels) assert.ok(panel.boundingBox.min.z - door.boundingBox.max.z >= 0.0039,
    'at least3.9mm separates cloth and door: no coplanar overlay/Z-fighting workaround');
}

function assertExistingVillageBuckets(seed) {
  const buckets = emptyBuckets();
  try {
    for (const id of ['farmhouse', 'granary']) {
      assert.ok(getMapConfig('orchard').props.plan.includes(id));
      VILLAGE_BUILDERS[id](mulberry32(seed), buckets);
    }
    for (const name of Object.keys(frontageLedger)) assert.ok(buckets[name].length,
      `${name} is already emitted by the unchanged authored village, not a new map draw family`);
  } finally { dispose(buckets); }
}

function assertExplicitFrontageOwner() {
  const parts = emptyBuckets(), vestibule = new THREE.BoxGeometry(4, 3.8, 2).translate(0, 1.9, 6.4);
  const options = { id: 'bathhouse', w: 12.4, d: 11, wallH: 4.5, profile: 'civic',
    bathhouseStyle: 'timber', timberBathhouseEntry: vestibule };
  try {
    assert.throws(() => addConnectedExterior(parts, { ...options, id: 'schoolhouse' }), /explicit.*owner/,
      'the map-specific frontage cannot accidentally alter another catalog owner');
    assert.throws(() => addConnectedExterior(parts, { ...options, bathhouseStyle: undefined }), /explicit.*owner/,
      'a vestibule attachment cannot silently select the timber entrance without its matching explicit style');
    delete parts.curtain;
    assert.throws(() => addConnectedExterior(parts, options), /existing wood and curtain/,
      'missing fabric owner fails explicitly rather than silently drawing black substitute panels');
    assert.equal(Object.values(parts).flat().length, 0, 'invalid variants fail before allocating decoration');
  } finally { vestibule.dispose(); dispose(parts); }
}

// Execute the real first-landmark road-candidate, wall selection, grounding,
// exterior, UV, collision and world-transform stages at an explicit RNG
// checkpoint. Unselected legacy house constructors fail loudly if reached.
// This is not a DOM/GPU/full-world census or a duplicate placement algorithm.
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `actual production stage found: ${start}`);
  return source.slice(a, b);
}
const dependencies = { THREE, STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES, makeTimberBathhouse,
  addCatalogExterior, jitterUV, mulberry32, sampleObbGround, deriveRuntimeStructureCollisionProfile,
  appendStructureCollisionBand };
const makePlacement = new Function(...Object.keys(dependencies), `return ${stripTypeScriptTypes(`function* build(config, heightField, seed) {
  const P = { maxSpread: 1.7, ...config.props, plan: ['bathhouse'] };
  const L = heightField._layout, v = L.village, mapId = config.id, noVeg = heightField._noVeg;
  const rng = mulberry32(seed), detailUvRng = mulberry32(seed + 990);
  const buckets = Object.fromEntries(${JSON.stringify(names)}.map(name => [name, []]));
  const obstacles = [], colliders = [], buildingFeatures = [];
  const _mat4 = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _posv = new THREE.Vector3();
  const _upAxis = new THREE.Vector3(0,1,0), _one = new THREE.Vector3(1,1,1);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const unexpected = () => { throw new Error('First-bathhouse fixture reached a different house'); };
  const makeCottage = unexpected, makeBarn = unexpected, makeTower = unexpected, makeRuin = unexpected;
  const makeAdobe = unexpected, makeRowhouse = unexpected, URBAN_BUILDERS = {}, VILLAGE_BUILDERS = {};
  ${section('function mergeInto(', 'type GroundDecalKind')}
  ${section('  function groundFit(', "  yield { stage: 'yard-clutter' };")}
  ${section('  const roads = L.roads;', '  // heaped masonry chunks')}
  return { buckets, obstacles, colliders, buildingFeatures, placedB, next: rng(), detail: detailUvRng() };
}`)}`)(...Object.values(dependencies));

function placed(config, field, seed) {
  const iterator = makePlacement(config, field, seed);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

assert.deepEqual(MAP_IDS.filter(id => getMapConfig(id).props.bathhouseStyle), ['orchard'],
  'only the explicit Orchard config selects this variant');
const orchard = getMapConfig('orchard');
assert.equal(orchard.props.plan[0], 'bathhouse', 'no new catalog ID or additional building slot');
const previous = { ...orchard, props: { ...orchard.props, bathhouseStyle: undefined } };
assertExplicitFrontageOwner();
let savings;
for (const seed of [1337, 2025, 7719]) {
  assertLegacyCatalog(seed);
  assertExistingVillageBuckets(seed);
  assertRetainedCatalogPass(seed);
  const oldBuckets = emptyBuckets(), newBuckets = emptyBuckets();
  try {
    assert.deepEqual(makeTimberBathhouse(mulberry32(seed), newBuckets, 'plaster'),
      makeBathhouse(mulberry32(seed), oldBuckets, 'plaster'), 'exact original ground-fit dimensions');
    savings = assertBudget(oldBuckets, newBuckets);
    assertUnchangedConstructorShapes(newBuckets);
    assertTimberFrontage(newBuckets);
    assertRoofGeometry(newBuckets);
    const oldBounds = bounds(oldBuckets), newBounds = bounds(newBuckets);
    assert.equal(newBounds.min.x, oldBounds.min.x); assert.equal(newBounds.max.x, oldBounds.max.x);
    assert.equal(newBounds.min.z, oldBounds.min.z);
    assert.ok(Math.abs(newBounds.max.z - oldBounds.max.z - 0.02) < 0.00001,
      'only the approved2cm upper entry envelope grows; contact remains exact below');
    assert.equal(newBounds.min.y, oldBounds.min.y);
    assert.ok(newBounds.max.y < oldBounds.max.y);
    const oldProfile = deriveRuntimeStructureCollisionProfile(oldBuckets);
    const newProfile = deriveRuntimeStructureCollisionProfile(newBuckets);
    assert.deepEqual(newProfile.contact, oldProfile.contact, 'exact authoritative movement footprint survives');
    assert.notDeepEqual(newProfile.shell, oldProfile.shell, 'shell fixture must follow the actual new roof, not stale domes');
  } finally { dispose(oldBuckets); dispose(newBuckets); }
  const field = createHeightField(seed, orchard);
  const before = placed(previous, field, seed), after = placed(orchard, field, seed), replay = placed(orchard, field, seed);
  try {
    assert.equal(after.buildingFeatures.length, 1, `${seed}: actual source road placement accepts the first landmark`);
    assert.deepEqual(after.buildingFeatures, before.buildingFeatures);
    assert.deepEqual(after.placedB, before.placedB);
    assert.deepEqual(after.obstacles, before.obstacles, 'actual placed movement-contact records stay exact');
    assert.notDeepEqual(after.colliders, before.colliders, 'actual shell bands reflect the changed roof/entry solids');
    assert.equal(after.next, before.next, 'placement + wall picker + complete real UV pass preserves the RNG tail');
    assert.equal(after.detail, before.detail, 'connected exterior detail keeps its independent RNG tail');
    assertPlacedBudget(before.buckets, after.buckets);
    for (const name of names) for (let i = 0; i < after.buckets[name].length; i++) {
      assert.deepEqual(after.buckets[name][i].attributes.position.array,
        replay.buckets[name][i].attributes.position.array, 'actual transformed vertex positions replay deterministically');
    }
    console.log(`Orchard/${seed}: grounded landmark ${JSON.stringify(after.buildingFeatures[0])}, both RNG tails exact`);
  } finally { dispose(before.buckets); dispose(after.buckets); dispose(replay.buckets); }
}
console.log(`orchardBathhouse: all legacy builders exact; V25 totals70parts/1888vertices/2892indices/66008bytes unchanged with explicit material transfers; ${savings.savedBytes} fewer constructor bytes, ${savings.savedFinalBytes} fewer merged bytes than domes; CPU only, native acceptance required`);
console.log('orchardBathhouse: actual112-part production output2980vertices/4584indices/104336bytes unchanged; all42 retained catalog-pass shapes exact, material routing explicit');
