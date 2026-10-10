import { roadBuildingDoorAxis } from './roadBuildingFrontage.ts';
import { roadSettlementJunction } from './roadSettlementJunction.ts';
import { buildingRoadStationIndices } from './maps/roadStations.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES, makeBathhouse, makeTimberBathhouse } from './maps/structureKit.ts';
import { addCatalogExterior, addConnectedExterior, attachStructureBuildContext, carryExteriorChimneyTops } from './maps/exteriorDetailKit.ts';
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import { jitterUV } from './propGeometry.ts';
import { mulberry32 } from './props.ts';
import { createHeightField } from './terrain.ts';
import { sampleObbGround } from './propPlacement.ts';
import { deriveRuntimeStructureCollisionProfile, appendStructureCollisionBand } from './structureCollision.ts';
import { certifyGroundedStructureParts, measureBoundsJoint } from './structureConnectivity.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { rebuildRegionalStructure, resolveRegionalArchitecture } from './maps/regional/index.ts';
import { bindStructureSpans, describeStructure, tagStructureVertices } from './structureDamageSeam.ts';
import { createStructureDamage } from '../sim/structureDamage.ts';

const names = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const emptyBuckets = () => Object.fromEntries(names.map(name => [name, []]));
const dispose = buckets => Object.values(buckets).flat().forEach(geometry => geometry.dispose());
// 2026-10-01 (frozen pins retired): the per-seed sha256 of the 15-builder catalog, the V25 totals/shape/roof digests,
// the per-bucket frontage and final ledgers, the V27 placement digests/RNG cursors/bounds (on historical Orchard roads
// and a historical junction recipe) were change detectors. The live contracts stay: the timber variant against the civic
// bathhouse from the same seed (ground fit, contact footprint, bounds, allocation, byte saving over the domes), the
// catalog pass with and without the timber style (non-window shapes identical, windows redistributed at equal cost),
// closed roofs, connected parts, side-window geometry, and the placed landmark A/B on today's Orchard roads.
const probe = emptyBuckets();
makeTimberBathhouse(mulberry32(1337), probe, 'stone');
// Parts per bucket emitted by the timber bathhouse before the catalog exterior pass (catalog apertures follow them).
const frontageCounts = Object.fromEntries(names.map(name => [name, probe[name].length]));
dispose(probe);

function hashGeometry(hash, geometry) {
  // Same-run shape comparison; the one-byte night mask has its own exact-surface coverage and memory tests.
  for (const name of Object.keys(geometry.attributes).filter(name => name !== NIGHT_EMISSION_ATTRIBUTE).sort()) {
    const a = geometry.attributes[name].array;
    hash.update(name); hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
  if (geometry.index) {
    const a = geometry.index.array;
    hash.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  }
}

function bucketStats(geometries) {
  return geometries.reduce((sum, g) => {
    sum.parts++;
    sum.vertices += g.attributes.position.count;
    sum.indices += g.index?.count ?? g.attributes.position.count;
    sum.bytes += Object.entries(g.attributes).reduce((n, [name, a]) => n + (name === NIGHT_EMISSION_ATTRIBUTE ? 0 : a.array.byteLength), 0)
      + (g.index?.array.byteLength ?? 0);
    return sum;
  }, { parts: 0, vertices: 0, indices: 0, bytes: 0 });
}

function assertBudget(before, after) {
  const oldTotal = bucketStats(Object.values(before).flat()), nextTotal = bucketStats(Object.values(after).flat());
  assert.equal(nextTotal.parts, oldTotal.parts, 'same total UV-jitter draws and primitive allocations');
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
  assert.equal(bucketStats(Object.values(before).flat()).parts, totals.parts,
    'the placed timber variant emits the same part allocation as the civic bathhouse');
}

function assertRetainedCatalogPass(seed) {
  const before = emptyBuckets(), after = emptyBuckets();
  try {
    const oldInfo = makeTimberBathhouse(mulberry32(seed), before, 'stone');
    const newInfo = makeTimberBathhouse(mulberry32(seed), after, 'stone');
    const oldCounts = names.map(name => before[name].length), newCounts = names.map(name => after[name].length);
    addCatalogExterior(before, { id: 'bathhouse', info: oldInfo, variant: 0 });
    addCatalogExterior(after, { id: 'bathhouse', info: newInfo, variant: 0, bathhouseStyle: 'timber' });
    const suffix = (buckets, counts) => names.flatMap((name, i) => buckets[name].slice(counts[i]));
    const oldParts = suffix(before, oldCounts), newParts = suffix(after, newCounts);
    // settlement pass 2026-09-12: the shared window joinery dresses the four
    // bare bathhouse panes with stone jambs/head/sill (+16 pieces, no apertures).
    // settlement pass 3 (2026-09-12): +4 door-lantern pieces (bracket, cage, cap, glass).
    assert.equal(newParts.length, oldParts.length, 'the timber catalog pass allocates exactly the civic pass parts');
    const stable = parts => parts.filter(g => !isAperture(g));
    assert.ok(stable(newParts).length > 0 && newParts.filter(isAperture).length === 10, 'two five-piece catalog windows');
    assert.deepEqual(stable(newParts).map(geometryDigest).sort(), stable(oldParts).map(geometryDigest).sort(),
      'every non-window catalog shape/UV/normal matches the civic pass; only ten named aperture boxes move');
    assert.deepEqual(bucketStats(newParts.filter(isAperture)), bucketStats(oldParts.filter(isAperture)),
      'window redistribution keeps its actual source budget');
    assert.throws(() => assertNoWindowOverlap(before), /coplanar window overlap/,
      'the real previous rear-window collision is rejected, not an always-passing empty fixture');
    assertSideWindows(after);
  } finally { dispose(before); dispose(after); }
}

function isAperture(geometry) {
  return geometry.userData.structureSupport?.part.startsWith('aperture-');
}

function isCatalogAperture(name, index, geometry) {
  return index >= frontageCounts[name] && isAperture(geometry);
}

function aperturePackages(buckets) {
  const packages = new Map();
  for (const name of names) for (let index = 0; index < buckets[name].length; index++) {
    const geometry = buckets[name][index];
    if (!isAperture(geometry)) continue;
    const part = geometry.userData.structureSupport.part;
    const side = part.endsWith('--1') ? -1 : 1;
    const catalog = isCatalogAperture(name, index, geometry), key = `${catalog}:${side}`;
    if (!packages.has(key)) packages.set(key, { catalog, side, parts: [], bounds: new THREE.Box3() });
    const value = packages.get(key);
    geometry.computeBoundingBox(); value.bounds.union(geometry.boundingBox);
    value.parts.push({ name, geometry });
  }
  return [...packages.values()];
}

function assertNoWindowOverlap(buckets) {
  const packages = aperturePackages(buckets);
  assert.equal(packages.length, 4, 'both civic rear windows and both catalog windows are present');
  // settlement pass 3 (2026-09-12): entry-lantern glass is a wall fixture, not a glazing panel.
  const glazing = buckets.glass.filter(g => g.userData.structureSupport?.part !== 'entry-lantern-glass');
  const windows = packages.map(p => p.bounds).concat(glazing.map(g => {
    g.computeBoundingBox(); return g.boundingBox;
  }));
  assert.equal(windows.length, 6, 'the two original front glazing panels are also checked');
  const normalAxis = b => b.max.x - b.min.x < b.max.z - b.min.z ? 'x' : 'z';
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i], b = windows[j], axis = normalAxis(a), along = axis === 'x' ? 'z' : 'x';
    if (normalAxis(b) !== axis || Math.abs(a.min[axis] - b.min[axis]) > 0.25) continue;
    const overlap = key => Math.min(a.max[key], b.max[key]) - Math.max(a.min[key], b.min[key]);
    assert.ok(overlap('y') <= 1e-5 || overlap(along) <= 1e-5, 'coplanar window overlap on an actual wall elevation');
  }
}

function assertWindowSolid(geometry) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
  assert.equal(p.count, 24); assert.equal(geometry.index.count, 36);
  for (const a of Object.values(geometry.attributes)) assert.ok(a.array.every(Number.isFinite));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(normal.fromBufferAttribute(n, i).length() - 1) < 1e-5);
  for (let i = 0; i < geometry.index.count; i += 3) {
    const ia = geometry.index.getX(i), ib = geometry.index.getX(i + 1), ic = geometry.index.getX(i + 2);
    a.fromBufferAttribute(p, ia); b.fromBufferAttribute(p, ib); c.fromBufferAttribute(p, ic);
    assert.ok(b.sub(a).cross(c.sub(a)).dot(normal.fromBufferAttribute(n, ia)) > 1e-5,
      'both rotated window solids retain nondegenerate outward triangle winding');
  }
}

function assertSideWindows(buckets) {
  const main = buckets.plaster.find(g => g.parameters.width === 12.4);
  main.computeBoundingBox();
  const packages = aperturePackages(buckets), sideWindows = packages.filter(p => p.catalog);
  assert.equal(sideWindows.length, 2);
  for (const item of sideWindows) {
    assert.equal(item.parts.length, 5);
    assert.equal(item.parts.filter(p => p.name === 'wood').length, 4);
    assert.equal(item.parts.filter(p => p.name === 'dark').length, 1);
    const b = item.bounds;
    assert.ok(b.min.y > 2.14 && b.max.y < 3.46, 'high privacy windows stay above the 1.8 m tank contact band');
    assert.ok(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) < 6.38,
      'side frames stay inside the existing 6.45 m foundation silhouette, not a new lateral blocker');
    assert.ok(Math.abs(b.min.z + 1.47) < 1e-4 && Math.abs(b.max.z - 1.47) < 1e-4,
      'one broad 2.94 m framed opening is centered on each previously blank side elevation');
    const pane = item.parts.find(p => p.name === 'dark').geometry.boundingBox;
    assert.ok(Math.abs((pane.min.x + pane.max.x) / 2 - item.side * 6.235) < 1e-4);
    assert.ok(Math.abs(pane.max.z - pane.min.z - 2.6) < 1e-4);
    assert.ok(Math.abs(pane.max.y - pane.min.y - 1.02) < 1e-4);
    assert.ok(Math.max(Math.abs(pane.min.x), Math.abs(pane.max.x)) > 6.27,
      'the closed pane has a real visible outer face, not a fully buried placeholder');
    for (const { geometry } of item.parts) {
      const joint = measureBoundsJoint(geometry.boundingBox, main.boundingBox);
      assert.equal(joint.gap, 0); assert.ok(joint.contactAxes >= 2 && joint.minContactSpan > 0.10);
      assert.ok(joint.overlaps[0] > 0.0049, 'even the pane embeds at least 4.9 mm into the actual plaster wall');
      assert.ok(geometry.userData.detailUv, 'the independent detail RNG ownership is unchanged');
      assertWindowSolid(geometry);
    }
  }
  assertNoWindowOverlap(buckets);
  const all = Object.values(buckets).flat();
  assert.equal(certifyGroundedStructureParts('orchard-complete-bathhouse', all).connected, all.length,
    'every part of the complete bathhouse is connected');
}

function assertPlacedWindows(result) {
  const feature = result.buildingFeatures[0], local = emptyBuckets();
  const main = result.buckets.plaster.find(g => g.parameters.width === 12.4);
  main.computeBoundingBox();
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(feature.x, main.boundingBox.min.y, feature.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), feature.rot), new THREE.Vector3(1, 1, 1)).invert();
  try {
    for (const name of names) local[name] = result.buckets[name].map(g => g.clone().applyMatrix4(transform));
    assertSideWindows(local);
  } finally { dispose(local); }
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
  // settlement pass 3 (2026-09-12): the timber style re-buckets the 32 stone quoins as timber corner blocks.
  assert.equal(frame.length, 65, 'existing cornices, posts, rear window frames, door surround and the 2026-09-12 window joinery reuse timber');
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
    for (const name of names.filter(name => frontageCounts[name] > 0)) assert.ok(buckets[name].length,
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
const dependencies = { roadBuildingDoorAxis, roadSettlementJunction, buildingRoadStationIndices,
  // settlement pass 2 (2026-09-12): mergeInto carries chimney tops through the exterior kit helper.
  carryExteriorChimneyTops, THREE, STRUCTURE_BUILDERS, DESTRUCTIBLE_BUILDING_TYPES, makeTimberBathhouse,
  addCatalogExterior, jitterUV, mulberry32, sampleObbGround, deriveRuntimeStructureCollisionProfile,
  appendStructureCollisionBand,
  attachStructureBuildContext, // round 75: the placement stage hands every builder its battlefield context
  // regional-buildings lane: the map's architecture kit swaps a placed building's geometry before its collision
  rebuildRegionalStructure, resolveRegionalArchitecture,
  // destruction (2026-10-07): a placed structure is described and tagged where it is built (props.ts describeStructureAt)
  bindStructureSpans, describeStructure, tagStructureVertices, createStructureDamage,
};
// The map-revival lane (2026-10-05): Orchard Valley adopts the Chouf kit (maps/regional/chouf.ts), which rebuilds the
// placed bathhouse as the hammam over the same seat, filling the base's measured bounds (the timber variant's 2 cm entry
// envelope with them). This receipt holds the variant's own contract on the base pipeline, so the fixture places it with
// the kit off; the kit's rebuild — placements, stream and contacts on today's Orchard — is regionalArchitecture's.
const makePlacement = new Function(...Object.keys(dependencies), `return ${stripTypeScriptTypes(`function* build(config, heightField, seed) {
  // (2026-10-07, Orchard round 4: the square's closers are the Chouf kit's planned sites; this fixture places the bathhouse alone)
  const P = { maxSpread: 1.7, ...config.props, architecture: undefined, plan: ['bathhouse'], plannedSites: undefined };
  const L = heightField._layout, v = L.village, mapId = config.id, noVeg = heightField._noVeg;
  const town = P.town ? { ...v, ...P.town } : v; // the settlement the props dress (props.ts)
  const rng = mulberry32(seed), detailUvRng = mulberry32(seed + 990);
  const buckets = Object.fromEntries(${JSON.stringify(names)}.map(name => [name, []]));
  const obstacles = [], colliders = [], buildingFeatures = [];
  ${section('  const foundryDonors:', '\n')}
  const _mat4 = new THREE.Matrix4(), _quat = new THREE.Quaternion(), _posv = new THREE.Vector3();
  const _upAxis = new THREE.Vector3(0,1,0), _one = new THREE.Vector3(1,1,1);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const unexpected = () => { throw new Error('First-bathhouse fixture reached a different house'); };
  const makeCottage = unexpected, makeBarn = unexpected, makeTower = unexpected, makeRuin = unexpected;
  const makeAdobe = unexpected, makeRowhouse = unexpected, URBAN_BUILDERS = {}, VILLAGE_BUILDERS = {};
  const regionalSun = config.sky?.sunAzimuthDeg !== undefined ? { sunAzimuthDeg: config.sky.sunAzimuthDeg } : {}; // props.ts: the sun the kit's roofs weather by
  const regionalArchitecture = resolveRegionalArchitecture(P.architecture);
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

// 2026-10-06 (the map-revival lane, the coordinator's ruling): Orchard Valley is the Chouf now and its kit builds the
// bathhouse as the hammam, so the old identity's timber variant left its config; no map selects it, and the receipt
// holds the variant's contract on an Orchard fixture that does (the placement with the kit off, above)
assert.deepEqual(MAP_IDS.filter(id => getMapConfig(id).props.bathhouseStyle), [],
  'no map selects the timber variant');
const previous = getMapConfig('orchard');
assert.equal(previous.props.plan[0], 'bathhouse', 'no new catalog ID or additional building slot');
const orchard = { ...previous, props: { ...previous.props, bathhouseStyle: 'timber' } };
assertExplicitFrontageOwner();
let savings;
for (const seed of [1337, 2025, 7719]) {
  assertExistingVillageBuckets(seed);
  assertRetainedCatalogPass(seed);
  const oldBuckets = emptyBuckets(), newBuckets = emptyBuckets();
  try {
    assert.deepEqual(makeTimberBathhouse(mulberry32(seed), newBuckets, 'plaster'),
      makeBathhouse(mulberry32(seed), oldBuckets, 'plaster'), 'exact original ground-fit dimensions');
    savings = assertBudget(oldBuckets, newBuckets);
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
    assertPlacedWindows(after);
    for (const name of names) for (let i = 0; i < after.buckets[name].length; i++) {
      assert.deepEqual(after.buckets[name][i].attributes.position.array,
        replay.buckets[name][i].attributes.position.array, 'actual transformed vertex positions replay deterministically');
    }
    console.log(`Orchard/${seed}: grounded landmark ${JSON.stringify(after.buildingFeatures[0])}, both RNG tails exact`);
  } finally { dispose(before.buckets); dispose(after.buckets); dispose(replay.buckets); }
}
console.log(`orchardBathhouse: timber frontage vs civic bathhouse (same allocation, contact footprint and RNG tails; ${savings.savedBytes} fewer constructor bytes, ${savings.savedFinalBytes} fewer merged bytes than domes), closed roofs, connected parts and relocated side windows on today's Orchard; CPU only, native acceptance required`);
