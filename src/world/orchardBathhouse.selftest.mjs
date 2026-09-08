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
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';

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
// Production retains its existing42-part addCatalogExterior pass. Only its
// two five-piece aperture packages move from the rear to the side elevations.
const finalTotals = { parts: 112, vertices: 2980, indices: 4584, bytes: 104336 };
const finalLedger = {
  plaster: [2, 48, 72, 1680], stone: [12, 288, 432, 10080], roof: [4, 120, 216, 4272],
  wood: [68, 1704, 2508, 59352], dark: [22, 724, 1212, 25592],
  glass: [2, 48, 72, 1680], curtain: [2, 48, 72, 1680],
};
// Actual complete production-stage output captured before window relocation,
// from frozen ART8d089c51d/V27. Exclude only the ten named catalog apertures;
// all 102 other parts retain their exact bucket/index/position/normal/UV bytes.
const v27Placement = {
  1337: { hash: 'b0351c4f644a34288e118a229a8ec2f9e88e671973ca644b745b2d9dcce8a6a3',
    next: 0.5986086630728096, detail: 0.1450007522944361,
    min: [-39.841426849365234, -1.8057814836502075, -73.73188018798828],
    max: [-25.519432067871094, 4.929218292236328, -59.519901275634766] },
  2025: { hash: 'b4b420782f1f8a0569f7d33dd11c1f40ad3cb51a735c8e7ef88cdd371c6a0969',
    next: 0.17094760527834296, detail: 0.41312244231812656,
    min: [-38.692893981933594, 0.18397000432014465, -73.4675521850586],
    max: [-24.981157302856445, 6.918969631195068, -59.6763801574707] },
  7719: { hash: 'b12491f1d47427af9d57e8445bc42886453e6d9d0c461e264a5a871bde0c24ca',
    next: 0.6194300358183682, detail: 0.905945718055591,
    min: [-62.229461669921875, -2.718656063079834, -71.2048110961914],
    max: [-48.242431640625, 4.016343593597412, -57.221858978271484] },
};

function hashGeometry(hash, geometry) {
  // Retain frozen V25/V27 shape/UV/index/RNG receipts. The later one-byte
  // night mask has independent exact-surface coverage and memory tests.
  for (const name of Object.keys(geometry.attributes).filter(name => name !== NIGHT_EMISSION_ATTRIBUTE).sort()) {
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
    sum.bytes += Object.entries(g.attributes).reduce((n, [name, a]) => n + (name === NIGHT_EMISSION_ATTRIBUTE ? 0 : a.array.byteLength), 0)
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
    const oldInfo = makeTimberBathhouse(mulberry32(seed), before, 'stone');
    const newInfo = makeTimberBathhouse(mulberry32(seed), after, 'stone');
    const oldCounts = names.map(name => before[name].length), newCounts = names.map(name => after[name].length);
    addCatalogExterior(before, { id: 'bathhouse', info: oldInfo, variant: 0 });
    addCatalogExterior(after, { id: 'bathhouse', info: newInfo, variant: 0, bathhouseStyle: 'timber' });
    const suffix = (buckets, counts) => names.flatMap((name, i) => buckets[name].slice(counts[i]));
    const oldParts = suffix(before, oldCounts), newParts = suffix(after, newCounts);
    assert.equal(newParts.length, 42);
    const stable = parts => parts.filter(g => !isAperture(g));
    assert.equal(stable(newParts).length, 32);
    assert.deepEqual(stable(newParts).map(geometryDigest).sort(), stable(oldParts).map(geometryDigest).sort(),
      'all32 non-window catalog shapes/UVs/normals stay exact; only ten named aperture boxes move');
    assert.deepEqual(bucketStats(newParts.filter(isAperture)),
      { parts: 10, vertices: 240, indices: 360, bytes: 8400 }, 'window redistribution keeps its actual source budget');
    assert.throws(() => assertNoWindowOverlap(before), /coplanar window overlap/,
      'the real previous rear-window collision is rejected, not an always-passing empty fixture');
    assertSideWindows(after);
    for (const name of names) assert.deepEqual(Object.values(bucketStats(after[name])),
      finalLedger[name] || [0, 0, 0, 0], `${name}: exact premerge final material ledger`);
  } finally { dispose(before); dispose(after); }
}

function isAperture(geometry) {
  return geometry.userData.structureSupport?.part.startsWith('aperture-');
}

function isCatalogAperture(name, index, geometry) {
  return index >= (frontageLedger[name]?.[0] || 0) && isAperture(geometry);
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
  const windows = packages.map(p => p.bounds).concat(buckets.glass.map(g => {
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
  assert.equal(certifyGroundedStructureParts('orchard-complete-bathhouse', all).connected, 112);
}

function assertPlacedWindowPreservation(result, seed) {
  const expected = v27Placement[seed], hash = createHash('sha256');
  let excluded = 0;
  for (const name of names) for (let index = 0; index < result.buckets[name].length; index++) {
    const geometry = result.buckets[name][index];
    if (isCatalogAperture(name, index, geometry)) { excluded++; continue; }
    hash.update(`${name}:${index}`); hashGeometry(hash, geometry);
  }
  assert.equal(excluded, 10);
  assert.equal(hash.digest('hex'), expected.hash, 'all102 non-target production parts retain exact bytes and indices');
  assert.equal(result.next, expected.next); assert.equal(result.detail, expected.detail);
  const actualBounds = bounds(result.buckets);
  assert.deepEqual(actualBounds.min.toArray(), expected.min);
  assert.deepEqual(actualBounds.max.toArray(), expected.max, 'actual rotated world silhouette bounds stay exact');
  const feature = result.buildingFeatures[0], local = emptyBuckets();
  const main = result.buckets.plaster.find(g => g.parameters.width === 12.4);
  const transform = new THREE.Matrix4().compose(new THREE.Vector3(feature.x, main.boundingBox.min.y, feature.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), feature.rot), new THREE.Vector3(1, 1, 1)).invert();
  try {
    for (const name of names) local[name] = result.buckets[name].map(g => g.clone().applyMatrix4(transform));
    assertSideWindows(local);
  } finally { dispose(local); }
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
    assertPlacedWindowPreservation(after, seed);
    for (const name of names) for (let i = 0; i < after.buckets[name].length; i++) {
      assert.deepEqual(after.buckets[name][i].attributes.position.array,
        replay.buckets[name][i].attributes.position.array, 'actual transformed vertex positions replay deterministically');
    }
    console.log(`Orchard/${seed}: grounded landmark ${JSON.stringify(after.buildingFeatures[0])}, both RNG tails exact`);
  } finally { dispose(before.buckets); dispose(after.buckets); dispose(replay.buckets); }
}
console.log(`orchardBathhouse: all legacy builders exact; V25 totals70parts/1888vertices/2892indices/66008bytes unchanged with explicit material transfers; ${savings.savedBytes} fewer constructor bytes, ${savings.savedFinalBytes} fewer merged bytes than domes; CPU only, native acceptance required`);
console.log('orchardBathhouse: actual112-part production output2980vertices/4584indices/104336bytes unchanged; ten catalog window boxes relocated, all102 other placed parts and both V27 RNG tails exact');
