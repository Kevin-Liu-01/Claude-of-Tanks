// Round 75 (2026-09-26): the yard dressing planner and kit — deterministic placements that keep off roads, water,
// steep ground, the rail berth, every solid and every structure envelope; a budget that caps the count; a martian
// mix without wood; and one bounded, instance-ready geometry per family on the right material. The props producer
// wires the pass after the destructible pools with no collision record (source pins below).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { YARD_FAMILY_RADIUS, planYardDressing, yardStructureKinds } from './yardDressing.ts';
import {
  YARD_FAMILY_MATERIAL, YARD_FAMILY_TRIANGLE_CAP, YARD_LIVERIES, buildYardFamily, yardInstanceLivery,
} from './maps/yardClutterKit.ts';

// --- a flat yard with one road down x = 0, a pond, a berth strip and a few solids
const field = {
  getHeightAt: (x, z) => 3 + 0.01 * x + 0.002 * z,
  getNormalAt: (x, z) => ({ y: x > 120 ? 0.6 : 0.99 }),
  _roadDist: (x, _z) => Math.abs(x),
  getWaterMaskAt: (x, z) => (Math.hypot(x - 60, z + 40) < 6 ? 1 : 0),
  _noVeg: (x, z) => z > 90 && z < 96,
};
const structures = [
  { kind: 'containerRow', x: 30, z: 0, w: 15.3, d: 8.3, rot: 0.3 },
  { kind: 'warehouse', x: 62, z: 40, w: 16.0, d: 26.0, rot: 0 },
  { kind: 'cottage', x: 90, z: -60, w: 8, d: 8, rot: 1 },
  { kind: 'shed', x: 30, z: 60, w: 10, d: 7, rot: -0.4 },
  { kind: 'gantry', x: 60, z: 92, w: 20, d: 5.4, rot: 0 },
  { kind: 'factory', x: 140, z: 0, w: 12, d: 19.4, rot: 0.2 },
];
const solids = [
  { min: [20, 0, -12], max: [40, 3, -8] },      // a wall along the container row's south apron
  { min: [70, 0, 20], max: [78, 4, 60] },       // a neighbour beside the warehouse
];
const inside = (s, x, z, pad) => {
  const c = Math.cos(s.rot), n = Math.sin(s.rot), dx = x - s.x, dz = z - s.z;
  const u = dx * c - dz * n, v = dx * n + dz * c;
  return Math.abs(u) < s.w / 2 + pad && Math.abs(v) < s.d / 2 + pad;
};

const plan = planYardDressing(structures, field, solids, 1337, { budget: 40 });
assert.ok(plan.placements.length >= 18 && plan.placements.length <= 40, `a yard's worth of pieces (${plan.placements.length})`);
assert.equal(plan.perStructure[2], 0, 'a cottage attracts no yard dressing');
assert.equal(plan.perStructure[5], 0, 'the factory on steep ground gets nothing its checks refuse');
assert.ok(plan.perStructure[0] >= 3 && plan.perStructure[1] >= 3, 'the container row and the warehouse are dressed');
for (const p of plan.placements) {
  const r = YARD_FAMILY_RADIUS[p.family];
  assert.ok(Math.abs(field._roadDist(p.x, p.z)) >= 4.5 + r - 1e-9, 'off the road');
  assert.equal(field.getWaterMaskAt(p.x, p.z), 0, 'off the water');
  assert.equal(field._noVeg(p.x, p.z), false, 'off the berth');
  assert.ok(field.getNormalAt(p.x, p.z).y >= 0.9, 'on ground a piece can stand on');
  assert.equal(p.y, field.getHeightAt(p.x, p.z), 'seated on the ground height');
  for (const s of structures) assert.equal(inside(s, p.x, p.z, r + 0.2 - 1e-9) && structures.indexOf(s) !== p.structure, false, 'outside every other structure envelope');
  assert.equal(inside(structures[p.structure], p.x, p.z, 0), false, 'outside its own envelope');
  assert.ok(inside(structures[p.structure], p.x, p.z, 0.6 + r + 2.0 + 1e-6), 'inside the apron band of its structure');
  for (const solid of solids) {
    const clear = p.x + r + 0.15 < solid.min[0] || p.x - r - 0.15 > solid.max[0] || p.z + r + 0.15 < solid.min[2] || p.z - r - 0.15 > solid.max[2];
    assert.ok(clear, 'clear of every solid');
  }
  assert.ok(p.scale >= 0.92 && p.scale <= 1.08 && Number.isFinite(p.yaw) && p.variant >= 0 && p.variant < 8);
}
for (let i = 0; i < plan.placements.length; i++) for (let j = i + 1; j < plan.placements.length; j++) {
  const a = plan.placements[i], b = plan.placements[j];
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= YARD_FAMILY_RADIUS[a.family] + YARD_FAMILY_RADIUS[b.family] + 0.25 - 1e-9, 'pieces keep their spacing');
}
assert.deepEqual(planYardDressing(structures, field, solids, 1337, { budget: 40 }), plan, 'the plan is a function of its seed');
assert.notDeepEqual(planYardDressing(structures, field, solids, 1338, { budget: 40 }).placements, plan.placements, 'another seed lays another yard');
assert.equal(planYardDressing(structures, field, solids, 1337, { budget: 0 }).placements.length, 0, 'no budget, no dressing');
const capped = planYardDressing(structures, field, solids, 1337, { budget: 5 });
assert.ok(capped.placements.length > 0 && capped.placements.length <= 5, `the budget caps the count (${capped.placements.length})`);
assert.ok(planYardDressing(structures, field, solids, 1337, { budget: 12 }).placements.length <= 12, 'a cap is a cap');
const martian = planYardDressing(structures, field, solids, 1337, { budget: 40, palette: 'martian' });
assert.ok(martian.placements.length > 0);
for (const p of martian.placements) assert.notEqual(YARD_FAMILY_MATERIAL[p.family], 'wood', 'no wooden pallets on Mars');
const polar = planYardDressing(structures, field, solids, 1337, { budget: 40, palette: 'polar' });
assert.ok(polar.placements.length < plan.placements.length, 'a polar yard is sparser');
assert.ok(yardStructureKinds().includes('containerRow') && yardStructureKinds().includes('warehouse'));

// --- the kit: one bounded geometry per family, on the ground, on its material, within its radius
const seen = new Set();
for (const family of Object.keys(YARD_FAMILY_RADIUS)) {
  const built = buildYardFamily(family);
  assert.equal(built.family, family);
  assert.equal(built.material, YARD_FAMILY_MATERIAL[family]);
  const g = built.geometry;
  for (const name of ['position', 'normal', 'uv']) assert.ok(g.getAttribute(name), `${family}: ${name} attribute`);
  assert.equal(!!g.getAttribute('color'), built.material !== 'wood', `${family}: vertex colour only on the tinted materials`);
  assert.ok(built.triangles > 10 && built.triangles <= YARD_FAMILY_TRIANGLE_CAP[family], `${family}: ${built.triangles} triangles within its cap`);
  g.computeBoundingBox();
  const b = g.boundingBox;
  assert.ok(b.min.y >= -0.05 && b.min.y <= 0.05, `${family}: stands on y = 0 (${b.min.y})`);
  assert.ok(b.max.y > 0.2 && b.max.y < 3.0, `${family}: a plausible height (${b.max.y})`);
  const reach = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z));
  assert.ok(reach <= YARD_FAMILY_RADIUS[family] + 0.05, `${family}: inside its planning radius (${reach} vs ${YARD_FAMILY_RADIUS[family]})`);
  for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite), `${family}: finite attributes`);
  if (built.material === 'steel') {
    // sheet UVs stay inside the plain strip's v range so the atlas never bleeds a marked strip onto a drum
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) assert.ok(uv.getY(i) > 0.25 && uv.getY(i) < 0.5, `${family}: uv v in the plain strip`);
  }
  seen.add(family);
  g.dispose();
}
assert.equal(seen.size, 9, 'nine families');
for (const palette of Object.keys(YARD_LIVERIES)) {
  assert.equal(yardInstanceLivery('pallets', 3, palette), null, 'wood takes no livery');
  for (const family of ['drum', 'drumRank', 'skip', 'fuelTank']) {
    for (let v = 0; v < 8; v++) assert.equal(typeof yardInstanceLivery(family, v, palette), 'number', `${palette} ${family} ${v}`);
  }
}

// --- the producer wires the pass before the bucket merge, adds no record and no mesh of its own
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const pass = source.slice(source.indexOf('  function* placeYardDressing('), source.indexOf('  yield* placeYardDressing();'));
assert.ok(pass.length > 200, 'the yard pass exists');
assert.ok(source.indexOf('  yield* finalizeDestructiblePools();') > source.indexOf('  yield* placeYardDressing();'), 'the pools finalize after the yard');
assert.ok(source.indexOf('  yield* placeYardDressing();') < source.indexOf('  yield* mergeMaterialBuckets();'), 'before the bucket merge');
assert.match(pass, /planYardDressing\(structures, heightField, obstacles, seed/);
// follow-up 2 (2026-09-26): no draw of its own — every piece is pushed into the map's wood / steel / baked bucket and
// merged with the structures, the livery baked into its vertex colours first
assert.match(pass, /buckets\[bucket\]\.push\(piece\)/, 'the pieces join the material buckets');
assert.match(pass, /conformYardPiece\(piece, buckets\[bucket\]\)/, 'one attribute set per bucket');
assert.equal(pass.includes('InstancedMesh'), false, 'no instanced draw per family');
assert.equal(pass.includes('new THREE.Mesh('), false, 'no mesh of its own');
assert.equal(pass.includes('group.add('), false, 'nothing added to the group but the record');
assert.match(pass, /draws: 0/, 'the record says so');
assert.match(pass, /color\.setXYZ\(i, color\.getX\(i\) \* tint\.r/, 'the livery is baked into the vertex colours');
for (const forbidden of ['addDestructible(', 'obstacles.push', 'colliders.push', 'crushables.push']) {
  assert.equal(pass.includes(forbidden), false, `the yard pass never publishes a record (${forbidden})`);
}
assert.match(source, /kind: structureId \}\);/, 'planned buildings carry their kind for the planner');
console.log(`yardDressing self-test passed: ${plan.placements.length} pieces planned over ${structures.length} structures, ${seen.size} families bounded`);
