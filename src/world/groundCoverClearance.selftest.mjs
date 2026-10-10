import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BoxGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from 'three';
import { createObstacleGrid, setObbShape, setCircleShape, setCompoundShape, setConvexShape } from './collision.ts';
import {
  createGroundCoverClearance, compactGroundCoverInstances, createGroundCoverSolidProfile,
  attachGroundCoverSolidProfile, GROUND_COVER_PLACEMENT_BYTES, letGroundCoverLap,
} from './groundCoverClearance.ts';
import {
  applyStructureCollisionBand, deriveRuntimeStructureCollisionProfile,
  deriveRuntimeStructureCollisionWithSolids,
} from './structureCollision.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';

const shed = setObbShape({ min: [-4, 0, -4], max: [4, 3, 4], kind: 'servicegarage' }, 0, 0, 1, 3, Math.PI / 4);
const crate = setObbShape({ min: [7, 0, -1], max: [9, 0.8, 1], kind: 'crate' }, 8, 0, 1, 1);
const bridge = setObbShape({ min: [-2, 3, 8], max: [2, 4, 12], kind: 'bridge' }, 0, 10, 2, 2);
const trunk = setCircleShape({ min: [9, 0, 9], max: [11, 8, 11], kind: 'tree', treeIdx: 0 }, 10, 10, 0.3);
const compound = setCompoundShape({ min: [18, 0, -2], max: [22, 2, 2], kind: 'compound' }, [
  { kind: 'obb', cx: 18.5, cz: 0, hw: 0.5, hl: 2, yaw: 0 },
  { kind: 'obb', cx: 21.5, cz: 0, hw: 0.5, hl: 2, yaw: 0 },
]);
const records = [shed, crate, bridge, trunk, compound];
const before = JSON.stringify(records);
const query = createObstacleGrid(records);
const blocked = createGroundCoverClearance(query);
assert.equal(blocked(0, -0.03, 0, 0.7, 0.4), true, 'shed floor');
assert.equal(blocked(-2, -0.03, 2, 0.7, 0.2), false, 'outside rotated footprint, inside broad AABB');
assert.equal(blocked(8, -0.03, 0, 0.7, 0.4), true, 'crate movement obstacle');
assert.equal(blocked(9.3, -0.03, 0, 0.7, 0.4), true, 'card width cannot poke through crate');
assert.equal(blocked(9.6, -0.03, 0, 0.7, 0.4), false, 'nearby natural ground is not cleared as a yard');
assert.equal(blocked(0, -0.03, 10, 0.7, 0.4), false, 'ground beneath elevated bridge remains');
assert.equal(blocked(0, 2.5, 10, 0.7, 0.4), true, 'tall growth intersects bridge');
assert.equal(blocked(0, 4.1, 10, 0.7, 0.4), false, 'ground above a buried solid remains');
assert.equal(blocked(10, -0.03, 10, 0.7, 0.2), true, 'trunk, not entire canopy');
assert.equal(blocked(11, -0.03, 10, 0.7, 0.2), false);
assert.equal(blocked(20, -0.03, 0, 0.7, 0.2), false, 'compound open passage preserved');
assert.equal(blocked(18.5, -0.03, 0, 0.7, 0.2), true);
// (the scenery lane, b14; wave 97: boulders "sitting on a clean lawn … no grass … creeping up its skirt") a boulder's
// footprint takes the turf to its foot: a tuft is cleared only when its own root lies in the stone's footprint, where
// any other footprint clears every tuft whose disc reaches it; the record itself is unchanged
{
  const ring = [];
  for (let k = 0; k < 8; k++) ring.push(40 + Math.cos((k / 8) * Math.PI * 2) * 1.5, Math.sin((k / 8) * Math.PI * 2) * 1.5);
  const stone = setConvexShape({ min: [40, 0, 0], max: [40, 1.6, 0] }, ring);
  const plain = setConvexShape({ min: [50, 0, 0], max: [50, 1.6, 0] }, ring.map((v, i) => (i % 2 === 0 ? v + 10 : v)));
  const frozen = JSON.stringify([stone, plain]);
  letGroundCoverLap(stone);
  const clear = createGroundCoverClearance(createObstacleGrid([stone, plain]));
  assert.equal(clear(41.6, -0.03, 0, 0.7, 0.4), false, 'a tuft rooted just outside a boulder stands against it');
  assert.equal(clear(51.6, -0.03, 0, 0.7, 0.4), true, 'the same tuft beside any other footprint is cleared by its disc');
  assert.equal(clear(41.2, -0.03, 0, 0.7, 0.4), true, 'a tuft rooted inside the boulder is still cleared');
  assert.equal(JSON.stringify([stone, plain]), frozen, 'the boulder\'s record is unchanged (cosmetic ownership)');
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  assert.match(props, /obstacles\.push\(rec\); colliders\.push\(col\);\n\s*letGroundCoverLap\(rec\);/, 'every boulder\'s obstacle lets the turf lap it');
}
assert.equal(JSON.stringify(records), before,
  'solid-footprint admission must not mutate collision/spotting records');
crate.dead = true; crate.crushed = true;
assert.equal(blocked(8, -0.03, 0, 0.7, 0.4), true, 'no battle-state-dependent grass respawn');

const poses = [[-10, 0, -5], [0, 0, 0], [8, 0, 0], [0, 0, 10], [20, 0, 0]];
const matrices = new Float32Array(poses.length * 16);
const colors = new Float32Array(poses.length * 3);
const matrix = new Matrix4(), rotation = new Quaternion(), scale = new Vector3(1, 1, 1);
for (let i = 0; i < poses.length; i++) {
  matrix.compose(new Vector3(...poses[i]), rotation, scale).toArray(matrices, i * 16);
  colors.set([i * 0.125, -0, i * 0.0625], i * 3);
}
const originalMatrices = matrices.slice(), originalColors = colors.slice();
const matrixBuffer = matrices.buffer, colorBuffer = colors.buffer;
const kept = compactGroundCoverInstances(matrices, colors, poses.length, 0.7, 0.4, blocked);
assert.equal(kept, 3);
assert.equal(matrices.buffer, matrixBuffer); assert.equal(colors.buffer, colorBuffer);
for (const [slot, source] of [0, 3, 4].entries()) {
  assert.deepEqual(matrices.slice(slot * 16, slot * 16 + 16), originalMatrices.slice(source * 16, source * 16 + 16));
  assert.deepEqual(new Uint32Array(colors.buffer, slot * 12, 3), new Uint32Array(originalColors.buffer, source * 12, 3));
}
assert.equal(compactGroundCoverInstances(matrices, colors, kept, 0.7, 0.4, blocked), kept, 'idempotent stable compaction');
assert.equal(compactGroundCoverInstances(matrices, null, kept, 0.7, 0.4, () => true), 0, 'empty pool and no color attribute');

function seededRng(seed = 1337) {
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function geometryHash(geometry) {
  const hash = createHash('sha256');
  for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
    if (attribute) hash.update(new Uint8Array(attribute.array.buffer,
      attribute.array.byteOffset, attribute.array.byteLength));
  }
  return hash.digest('hex');
}

function actualGuardRecord(band, pose = [0, 0, 0], yaw = 0, scale = 1) {
  const meta = DESTRUCTIBLE_BUILDING_TYPES.guardpost;
  const record = {
    min: [pose[0] - meta.hw * scale, pose[1], pose[2] - meta.hl * scale],
    max: [pose[0] + meta.hw * scale, pose[1] + meta.h * scale, pose[2] + meta.hl * scale],
    kind: 'guardpost', crushable: true, crushed: false, propIdx: 0,
  };
  const scaledBand = { ...band, parts: band.parts.map(part => {
    assert.equal(part.kind, 'convex', 'actual guardpost extraction, not a invented collider');
    return { ...part, cx: part.cx * scale, cz: part.cz * scale, points: part.points.map(value => value * scale) };
  }) };
  applyStructureCollisionBand(record, scaledBand, pose[0], pose[2], yaw);
  const actualMatrix = new Matrix4().compose(new Vector3(...pose),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(scale, scale, scale));
  return { record, actualMatrix, blocked: createGroundCoverClearance(createObstacleGrid([record])) };
}

const guardGeometry = DESTRUCTIBLE_BUILDING_TYPES.guardpost.build(seededRng());
const guardBits = geometryHash(guardGeometry);
const extracted = deriveRuntimeStructureCollisionWithSolids({ baked: [guardGeometry] });
assert.deepEqual(extracted.profile, deriveRuntimeStructureCollisionProfile({ baked: [guardGeometry] }),
  'the adapter must preserve original authoritative contact and every shell band');
assert.equal(geometryHash(guardGeometry), guardBits, 'connected-solid extraction must not rewrite geometry');
const detail = createGroundCoverSolidProfile(extracted.solids, extracted.contactTop);
assert.ok(detail, 'actual 1.2 m raised guardpost needs vertical refinement');
assert.ok(Object.isFrozen(detail), 'shared public profile is immutable');
assert.equal(GROUND_COVER_PLACEMENT_BYTES, 48, 'six retained Float64 values per attached placement');

const guard = actualGuardRecord(extracted.profile.contact);
const authoritativeBefore = JSON.stringify(guard.record);
assert.equal(guard.blocked(0, -0.03, 0, 0.7, 0.7), true,
  'same-input control reproduces the old false-positive contact projection under cabin');
const material = new MeshBasicMaterial({ side: DoubleSide });
const mesh = new Mesh(guardGeometry, material);
mesh.updateMatrixWorld(true);
const caster = new Raycaster(new Vector3(), new Vector3(0, 1, 0));
for (const x of [-0.7, 0, 0.7]) for (const z of [-0.7, 0, 0.7]) {
  caster.ray.origin.set(x, 0, z);
  const first = caster.intersectObject(mesh)[0];
  assert.ok(first && Math.abs(first.point.y - 1.2) < 1e-6,
    'actual generated cabin underside is above the entire short-tuft test footprint');
}
assert.equal(attachGroundCoverSolidProfile(guard.record, detail, guard.actualMatrix.elements), true);
assert.equal(guard.blocked(0, -0.03, 0, 0.7, 0.7), false, 'short grass survives beneath actual raised cabin');
for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) {
  assert.equal(guard.blocked(x, -0.03, z, 0.7, 0.1), true, 'actual support post remains clear');
}
assert.equal(guard.blocked(0, -0.03, 0, 1.4, 0.3), true, 'taller tuft intersects cabin');
assert.equal(guard.blocked(1.02, -0.03, 1.02, 0.7, 0.16), true, 'full card width clears post edge');
assert.equal(guard.blocked(0, 4.2, 0, 0.7, 0.3), false, 'above all actual solids');
assert.equal(JSON.stringify(guard.record), authoritativeBefore, 'cosmetic attachment adds no serialized record data');
assert.throws(() => attachGroundCoverSolidProfile(guard.record, detail, guard.actualMatrix.elements), /already sealed/);
guard.record.dead = true; guard.record.crushed = true;
assert.equal(guard.blocked(0, -0.03, 0, 0.7, 0.7), false, 'destruction does not change admission');
assert.equal(guard.blocked(1.2, -0.03, 1.2, 0.7, 0.1), true, 'streamed grass cannot resurrect beneath initial posts');

for (const [yaw, instanceScale, translation] of [
  [Math.PI / 3, 1.25, [25, 2, -13]], [-Math.PI * 0.72, 0.6, [-30, -4, 27]],
]) {
  const instance = actualGuardRecord(extracted.profile.contact, translation, yaw, instanceScale);
  const recordBefore = JSON.stringify(instance.record);
  assert.equal(attachGroundCoverSolidProfile(instance.record, detail, instance.actualMatrix.elements), true);
  const worldPoint = new Vector3();
  for (const [x, z, tuftHeight, tuftRadius, expected] of [
    [0, 0, 0.7, 0.7, false], [-1.2, 1.2, 0.7, 0.1, true], [0, 0, 1.4, 0.3, true],
  ]) {
    worldPoint.set(x, -0.03, z).applyMatrix4(instance.actualMatrix);
    assert.equal(instance.blocked(worldPoint.x, worldPoint.y, worldPoint.z,
      tuftHeight * instanceScale, tuftRadius * instanceScale), expected,
    'final actual rotated/scaled/relocated instance, including vertical translation');
  }
  instance.actualMatrix.makeScale(0, 0, 0); // Destruction/pool writes cannot mutate captured initial pose.
  assert.equal(instance.blocked(translation[0], translation[1] - 0.03, translation[2], 0.4, 0.2), false);
  assert.equal(JSON.stringify(instance.record), recordBefore);
}

for (const invalid of [
  new Matrix4().makeRotationX(0.1), new Matrix4().makeRotationZ(0.1),
  new Matrix4().makeScale(1, 2, 1), new Matrix4().makeScale(-1, 1, 1),
  new Matrix4().makeScale(0, 0, 0),
]) {
  const instance = actualGuardRecord(extracted.profile.contact);
  assert.equal(attachGroundCoverSolidProfile(instance.record, detail, invalid.elements), false,
    'unsupported tilted/nonuniform/reflected transform retains cheap conservative path');
  assert.equal(instance.blocked(0, -0.03, 0, 0.7, 0.7), true);
}

const solidBox = new BoxGeometry(3, 2, 4).translate(0, 1, 0);
const solidSource = deriveRuntimeStructureCollisionWithSolids({ baked: [solidBox] });
assert.equal(createGroundCoverSolidProfile(solidSource.solids, solidSource.contactTop), null,
  'solid ground-bearing structure has no cosmetic profile or placement allocation');
assert.equal(geometryHash(guardGeometry), guardBits, 'admission leaves normals, colors, UVs and triangles untouched');
solidBox.dispose(); guardGeometry.dispose(); material.dispose();

// 2026-10-03 (the physics lane's winding fix, 14c43cca5, found the same counter-clockwise assumption here): footprints
// reach this module in either winding, and a clockwise one used to hold no upper solid and to face its packed planes
// outward. A cabin raised on four posts and a solid two-storey block, each built once with counter-clockwise footprints
// and once with the same squares clockwise, answer alike.
{
  const square = (cx, cz, half, clockwise) => {
    const ccw = [cx - half, cz - half, cx + half, cz - half, cx + half, cz + half, cx - half, cz + half]; // positive area
    if (!clockwise) return ccw;
    const cw = [];
    for (let i = ccw.length - 2; i >= 0; i -= 2) cw.push(ccw[i], ccw[i + 1]);
    return cw;
  };
  for (const clockwise of [false, true]) {
    const label = clockwise ? 'clockwise' : 'counter-clockwise';
    const cabin = [
      ...[[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]].map(([x, z]) =>
        ({ bucket: 'wall', minY: 0, maxY: 1.2, points: square(x, z, 0.15, clockwise) })),
      { bucket: 'wall', minY: 1.2, maxY: 3, points: square(0, 0, 1.5, clockwise) },
    ];
    const profile = createGroundCoverSolidProfile(cabin, 1.2);
    assert.ok(profile, `${label}: a cabin raised on posts takes its cosmetic profile`);
    const record = setObbShape({ min: [-1.5, 0, -1.5], max: [1.5, 3, 1.5], kind: 'guardpost' }, 0, 0, 1.5, 1.5, 0);
    const blockedHere = createGroundCoverClearance(createObstacleGrid([record]));
    assert.equal(attachGroundCoverSolidProfile(record, profile, new Matrix4().elements), true);
    assert.equal(blockedHere(0, -0.03, 0, 0.7, 0.3), false, `${label}: short grass grows under the raised cabin`);
    assert.equal(blockedHere(1.2, -0.03, 1.2, 0.7, 0.1), true, `${label}: a post clears the ground cover under itself`);
    assert.equal(blockedHere(-1.2, -0.03, 1.2, 0.7, 0.1), true, `${label}: every post does`);
    assert.equal(blockedHere(0, -0.03, 0, 1.4, 0.3), true, `${label}: a tall tuft meets the cabin's floor`);
    assert.equal(blockedHere(0.55, -0.03, 1.2, 0.7, 0.1), false, `${label}: the ground between two posts stays`);
    const block = [
      { bucket: 'wall', minY: 0, maxY: 3, points: square(0, 0, 2, clockwise) },
      { bucket: 'wall', minY: 3, maxY: 6, points: square(0, 0, 1.8, clockwise) },
    ];
    assert.equal(createGroundCoverSolidProfile(block, 3), null,
      `${label}: a solid block's upper floor stands on its base (no cosmetic profile, the footprint clears it all)`);
  }
}

const vegetation = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const makeTuft = vegetation.slice(vegetation.indexOf('  function makeTuft('), vegetation.indexOf('  // write a tuft stored'));
assert.ok(makeTuft.indexOf('groundCoverBlocked?.') > makeTuft.lastIndexOf('crng()'), 'clearance cannot shift RNG draws');
assert.match(vegetation, /entry\.total = mesh\.count = kept/, 'density updates cannot restore rejected instances');
assert.match(vegetation, /carpetCache\.clear\(\)/, 'no previously cached grass resurrects');
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
// 2026-10-03 (the scenery lane): the world's ground cover is the sealed movement-solid grid plus the scenery's holes
// (a pavement's clints, a scree fan), composed once in map.ts and handed to the grass, the litter and the tall grass
// 2026-10-07 (the hitbox lane): the stones' colliders became their own (props.ts refitRockColliders), so the ground cover
// reads the movement solids plus the cosmetic twins of the stones' legacy records — the footprints it was sealed against
assert.match(map, /const queryGroundCover = rockGroundCover\.length \? createObstacleGrid\(\[\.\.\.obstacles, \.\.\.rockGroundCover\]\) : queryObstacles;/,
  'the movement-solid grid, plus the stones\' cosmetic twins');
assert.match(map, /const groundCoverClearance = \(\) => withGroundCoverHoles\(createGroundCoverClearance\(queryGroundCover\), groundCoverHoles\)/,
  'share actual accepted movement-solid grid, including crates absent from shell colliders');
assert.match(map, /setGroundCoverClearance\(groundCoverClearance\(\)\)/, 'the grass carpet takes the composed admission');
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(props, /DESTRUCTIBLE_BUILDING_TYPES\[kind\]\s*\? deriveRuntimeStructureCollisionWithSolids/,
  'ordinary crates, walls and moving props do not acquire cosmetic detail');
assert.match(props, /attachGroundCoverSolidProfile\(record\.ob, detail, pool\.mats4\[record\.slot\]\.elements\)/,
  'snapshot actual rendered matrix, never infer placement from collision bounds');
const poolHeaders = [
  '  function* prepareDestructiblePoolGeometry(',
  '  function* finalizeDestructiblePool(',
  '  function* finalizeDestructiblePools(',
];
const preparationSteps = [
  'refitDestructibleColliders(geoI, pool, kind)',
  'fitWallSpan(pool.mats4[record.slot], geoI, heightField, span, record, WALL_SEG)',
  'transferred = true;',
  'return { geoI, groundCoverDetail };',
];
const publicationSteps = [
  'yield* prepareDestructiblePoolGeometry(kind, pool)',
  'sealGroundCoverPlacements(pool, groundCoverDetail)',
  'new THREE.InstancedMesh(geoI, material, pool.mats4.length)',
  'imI.setMatrixAt(i, pool.mats4[i])',
  'group.add(imI)',
];

function orderedOffsets(source, landmarks, label) {
  let previous = -1;
  return landmarks.map(landmark => {
    const offset = source.indexOf(landmark);
    assert.notEqual(offset, -1, `${label}: missing ${landmark}`);
    assert.equal(source.lastIndexOf(landmark), offset, `${label}: ambiguous ${landmark}`);
    assert.ok(offset > previous, `${label}: out of order ${landmark}`);
    previous = offset;
    return offset;
  });
}

function assertFinalPlacementOrder(source) {
  const [prepare, finalize, end] = orderedOffsets(source, poolHeaders, 'pool generators');
  // Fitting is delegated, not performed in the finalizer. Require the fit
  // before preparation transfers ownership, then exhaust it before sealing.
  // wallSpanPlacement.selftest separately executes these real generators to
  // verify every fit completes across yields before any mesh is published.
  orderedOffsets(source.slice(prepare, finalize), preparationSteps, 'fit completion');
  orderedOffsets(source.slice(finalize, end), publicationSteps, 'prepare-seal-publish');
}

assertFinalPlacementOrder(props);
for (const landmark of [...poolHeaders, ...preparationSteps, ...publicationSteps]) {
  assert.throws(() => assertFinalPlacementOrder(props.replace(landmark, '')), /missing/,
    `missing source landmarks cannot pass through indexOf(-1): ${landmark}`);
}
for (const [first, second] of [
  [preparationSteps[1], preparationSteps[3]],
  [publicationSteps[0], publicationSteps[1]],
  [publicationSteps[1], publicationSteps[2]],
  [publicationSteps[3], publicationSteps[4]],
]) {
  const placeholder = '__GROUND_COVER_ORDER_MUTATION__';
  assert.ok(!props.includes(placeholder));
  const reordered = props.replace(first, placeholder).replace(second, first).replace(placeholder, second);
  assert.throws(() => assertFinalPlacementOrder(reordered), /out of order/,
    `reordered source cannot bind or publish an unfinished placement: ${first}`);
}
assert.throws(() => assertFinalPlacementOrder(props.replace(publicationSteps[0],
  'prepareDestructiblePoolGeometry(kind, pool)')), /missing/,
'calling a generator without yield* cannot stand in for completed preparation');
console.log('groundCoverClearance.selftest: actual raised guardpost, source/collision parity, final instance transforms, unsupported fallbacks, solid/bridge/crate contact, either footprint winding, stable compaction and streaming pass');
console.log(JSON.stringify({ guardpost: detail, placementBytes: GROUND_COVER_PLACEMENT_BYTES }));
