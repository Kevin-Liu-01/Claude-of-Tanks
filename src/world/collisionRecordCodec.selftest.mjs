// One collision geometry for every driver (migration-parity, 275): the rendered world's records take their shard's
// geometry in place (collisionRecordCodec.ts canonicalizeCollisionRecords, from world/map.ts), so a local battle and
// the client's prediction collide on what the authority decodes. Before, they collided on the build's full-precision
// records: every number up to 0.05 mm off the shard's, a part's extent up to 1 mm, a centre up to 13 cm (Urban).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { setCircleShape, setCompoundShape, setConvexTopShape, setObbShape } from './collision.ts';
import { canonicalizeCollisionRecords, packCollisionRecord, unpackCollisionRecord } from './collisionRecordCodec.ts';
import { canonicalRecordMismatch, recordGeometry } from './collisionRecordCodec.test-support.mjs';

const record = (y0, y1, extra = {}) => ({ min: [0, y0, 0], max: [0, y1, 0], ...extra });

// 1. each rule the shard applies, on records as builders make them
const fence = setObbShape(record(0.123456789, 1.987654321, { crushable: true, crushMin: 1.23456789, crushKeep: 0.87654321,
  kind: 'fenceplank', propIdx: 7, crushed: false, hedgehogId: 3 }), 10.123456789, -5.987654321, 0.0512345, 2.4987654, 0.7123456789);
const house = setCompoundShape(record(0.25, 6.4, { kind: 'structure', structureIdx: 4, structureRole: 'fixed' }), [
  // its band: an extent within 1 mm of the record's range, which the shard drops (the record's range is read)
  { kind: 'convex', cx: 0, cz: 0, points: [20.1, 30.1, 28.3, 30.1, 28.3, 39.7, 20.1, 39.7], y0: 0.2504, y1: 6.4 },
  // its roof strip: an extent of its own, kept (0.1 mm)
  { kind: 'convex', cx: 0, cz: 0, points: [20.123456, 30.123456, 28.3, 30.1, 28.3, 32.4], y0: 5.1234567, y1: 6.3987654 },
  { kind: 'obb', cx: 24.2, cz: 41.13579, hw: 1.0000001, hl: 0.4, yaw: 0.1, y0: 0.25, y1: 6.4 },
]);
const stone = setConvexTopShape(record(-0.31, 1.7, { kind: 'rock' }), [40.1, 40.2, 42.3456789, 40.1, 41.2, 42.987654],
  [41.2345678, 41.0987654, 0.1234567, -0.2345678, 1.6543219], -0.3123456, 1.6987654);
// a tree trunk: an obstacle and a collider at once, its crush policy the shared runtime one
const tree = setCircleShape(record(0, 9.87654321, { kind: 'tree', treeIdx: 12 }), -71.23456789, 88.87654321, 0.3456789);
// a coordinate that rounds to -0, which the shard's JSON writes as 0
const post = setObbShape(record(0, 2), -0.00001, 3, 0.1, 0.1, 0);
const obstacles = [fence, house, stone, tree, post];
const colliders = [fence, house, tree];
const all = [fence, house, stone, tree, post];
const packedBefore = all.map(packCollisionRecord);
const held = all.map((r) => ({ min: r.min, max: r.max, shape: r.shape2, parts: r.shape2.parts?.slice() ?? [],
  points: (r.shape2.parts ?? [r.shape2]).map((part) => part.points ?? null) }));
canonicalizeCollisionRecords(obstacles, colliders);
all.forEach((r, i) => {
  const kind = r.kind ?? 'post';
  assert.ok(isDeepStrictEqual(recordGeometry(r), recordGeometry(unpackCollisionRecord(packedBefore[i]))),
    `${kind}: its geometry is its shard's, bit for bit: ${JSON.stringify(recordGeometry(r))}`);
  const h = held[i];
  assert.ok(r.min === h.min && r.max === h.max && r.shape2 === h.shape, `${kind}: its bounds and shape stay the objects the world holds`);
  (r.shape2.parts ?? []).forEach((part, j) => assert.equal(part, h.parts[j], `${kind} part ${j} stays its object`));
  (r.shape2.parts ?? [r.shape2]).forEach((part, j) => {
    if (h.points[j]) assert.equal(part.points, h.points[j], `${kind} part ${j}: its corners stay in their own array`);
  });
  assert.deepEqual(packCollisionRecord(r), packedBefore[i], `${kind}: it packs to the shard it packed to before`);
});
assert.equal(fence.crushed, false, 'runtime flags stay');
assert.equal(fence.hedgehogId, 3, 'presentation links stay');
assert.ok(fence.propIdx === 7 && fence.crushable === true && fence.crushMin === 1.2346 && fence.crushKeep === 0.8765,
  'the crush policy is the shard\'s (0.1 mm)');
assert.ok(!('y0' in house.shape2.parts[0]) && !('y1' in house.shape2.parts[0]), 'a band within 1 mm of its record\'s range reads that range');
assert.deepEqual([house.shape2.parts[1].y0, house.shape2.parts[1].y1], [5.1235, 6.3988], 'a roof strip keeps its own extent');
assert.equal(house.shape2.cx, (house.min[0] + house.max[0]) / 2, 'a compound\'s centre is its bounds\' middle');
assert.ok(stone.shape2.tp.every((v) => Math.round(v * 1e4) / 1e4 === v) && stone.shape2.y0 === -0.3123, 'a drawn top\'s planes and extent');
assert.ok(tree.crushMin === 0 && tree.crushKeep === 1, 'a trunk takes the shared tree policy');
assert.ok(Object.is(post.shape2.cx, 0) && Object.is(post.min[0], -0.1), 'never -0');
const once = all.map((r) => structuredClone(recordGeometry(r)));
canonicalizeCollisionRecords(obstacles, colliders);
assert.deepEqual(all.map(recordGeometry), once, 'idempotent');
// the capture page evaluates the packer's source: it packs alike standalone
const standalone = new Function(`return (${packCollisionRecord.toString()})`)();
assert.deepEqual(all.map(standalone), packedBefore, 'the packer\'s source packs alike on its own');

// 2. world/map.ts gives its records the shard's geometry after the craters (decided on the records as built, as the
// shard's capture decides them) and before its grids and its ground occlusion read them
const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
const at = (text) => { const index = mapSource.indexOf(text); assert.ok(index > 0, `map.ts: ${text}`); return index; };
const canonicalAt = at('canonicalizeCollisionRecords(obstacles, colliders);');
assert.ok(at('const obstacles = [...props.obstacles, ...vegetation.treeObstacles];') < canonicalAt
  && at('const colliders = [...props.colliders, ...vegetation.treeObstacles];') < canonicalAt
  && at('mapCraterStamps(props.mapCraterSites, obstacles, heightField)') < canonicalAt, 'map.ts canonicalizes its built lists after the craters');
assert.ok(canonicalAt < at('createStructureGroundOcclusion(props.obstacles') && canonicalAt < at('const queryObstacles = createObstacleGrid(obstacles);')
  && canonicalAt < at('const queryColliders = createObstacleGrid(colliders);'), 'map.ts canonicalizes before anything reads its records');

// 3. a real map: Verdant's records as the rendered world builds them, canonicalized, are its committed shard's (among
// them the corner the rounding brings within 1 mm of its chord, which the shard drops: a bale's, obstacle 202 part 41)
const { buildWorldCollisionData } = await import('../../tools/headlessWorldCollision.mjs');
const { createCollisionManifestLoader } = await import('../../server/collisionManifestLoader.ts');
let world = null;
const packed = await buildWorldCollisionData('verdant', { inspect: ({ flora, dressing }) => {
  world = { obstacles: [...dressing.obstacles, ...flora.treeObstacles], colliders: [...dressing.colliders, ...flora.treeObstacles] };
} });
const committed = createCollisionManifestLoader().get('verdant', null);
const current = isDeepStrictEqual(packed.obstacles, committed.obstacles) && isDeepStrictEqual(packed.colliders, committed.colliders);
assert.ok(current, 'Verdant\'s shard matches the tree (regenerate: node tools/capture-world-collision-manifests.mjs --node --maps verdant)');
const before = canonicalRecordMismatch(world, committed);
assert.ok(before.mismatch, 'the build\'s full-precision records are not the shard\'s (the gap this closes)');
canonicalizeCollisionRecords(world.obstacles, world.colliders);
const after = canonicalRecordMismatch(world, committed);
assert.equal(after.mismatch, null, `every Verdant record is its shard's, bit for bit (${after.mismatch})`);

console.log(`collisionRecordCodec.selftest: ${all.length} rule records and ${after.compared} Verdant records take their shard's`
  + ' geometry bit for bit in place (objects, flags and links kept, the shard bytes unchanged, idempotent); map.ts canonicalizes'
  + ' after the craters and before its grids');
