// The map-revival lane (2026-10-06, Skybridge round 4; gauntlet waves 170-171: "a deep, sheer-walled canyon arm holding
// the water against a curved dam", "the dam needs arch curvature, a crest road, intake towers and the powerhouse reading
// at its toe"): Lake Powell's arm and Glen Canyon Dam in the battlefield (skybridge.ts armTerrain, reservoirDam.ts).
//
//   1. the dam stands on road 5 where it crosses the arm's end: the road keeps its strip at its own height between the
//      arm's square end and the tailwater pocket, and the water lies on both sides of it;
//   2. the water lies wall to wall: no ground under a waterline stays dry anywhere in the arm or the pocket, and the
//      bots route round all of it ('avoid-liquid');
//   3. the dam is an arch convex to the reservoir (about 8 m of sag over 70 m), its upstream face from the walkway into
//      the reservoir's bed, four intake towers, the battered downstream face 29 m into the pocket, the powerhouse at its
//      toe; inside its triangle budget, finite, drawn in the shared buckets (no draw of its own), deterministic;
//   4. its collision is the road's parapets and the rims' kerbs only — thin walls off the road's core and out of the
//      water — and only Skybridge's dressing lays it, last in the stream;
//   5. (round 7) the tailwater is rock: a D below the face (its start square under the concrete, its far end a nose),
//      no kerb ring round it, fallen blocks on its brow, the outlet's portal in its far wall; the dam's concrete carries
//      its lifts, joints, the lake's ring and the runoff in the kit's weathered render, and no hoist house stands on the
//      walkway.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { installWorldBuildFixture } = await import('../../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const { MAP_IDS, getMapConfig } = await import('./index.ts');
const { createHeightField } = await import('../terrain.ts');
const { SKYBRIDGE_DAM: D } = await import('./skybridge.ts');
const { dressReservoirDam } = await import('./reservoirDam.ts');

const cfg = getMapConfig('skybridge');
const field = createHeightField(1337, cfg);
const rd = D.roadDeg * Math.PI / 180, u = [Math.cos(rd), Math.sin(rd)], v = [u[1], -u[0]];
const at = (s, t) => [D.x + u[0] * s + v[0] * t, D.z + u[1] * s + v[1] * t];
const height = (s, t) => field.getHeightAt(...at(s, t));
const wet = (s, t) => field.getWaterMaskAt(...at(s, t)) > 0.5;

// 1. on road 5, its strip at the road's height, the water either side
const road5 = cfg.terrain.roads.paths[4];
let near = Infinity;
for (let i = 1; i < road5.length; i++) {
  const [ax, az] = road5[i - 1], [bx, bz] = road5[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const k = Math.max(0, Math.min(1, ((D.x - ax) * dx + (D.z - az) * dz) / l2));
  near = Math.min(near, Math.hypot(D.x - ax - dx * k, D.z - az - dz * k));
}
assert.ok(near < 0.5, `the dam's crest is road 5 (${near.toFixed(2)} m off its line)`);
for (const s of [-28, -13, 0, 12, 25]) {
  const road = height(s, 0);
  for (const t of [-4.5, -2, 2, 4.5]) assert.ok(Math.abs(height(s, t) - road) < 0.6, `the strip keeps the road's height (${s}, ${t})`);
}
// (round 6: the arm meets the dam 68 m wide at its rim, its floor 50 m: the water against the dam across the floor)
for (const s of [-20, -10, 0, 10, 20]) assert.ok(wet(s, 18), `the reservoir lies against the dam (${s} m along)`);
// (round 7: the tailwater's D runs downstream from the face, its floor 25 m across along the road under it)
for (const s of [-22, -13, -4]) assert.ok(wet(s, -18), `the tailwater lies in the pocket (${s} m along)`);
assert.ok(!wet(20, -18) && height(20, -18) > -3, 'past the pocket the plain runs on under the road');

// 2. wall to wall, and the bots keep out
let dry = 0, water = 0;
// (round 6: the meander's bends and its head reach further out than round 4's straight arm)
for (let z = -110; z <= 290; z += 2) for (let x = -140; x <= 80; x += 2) {
  let best = Infinity, level = null;
  for (const lake of cfg.terrain.lakes) {
    const d = Math.hypot(x - lake.x, z - lake.z) / lake.r;
    if (d < best) { best = d; level = lake.level; }
  }
  if (best > 1.6) continue;
  if (field.getWaterMaskAt(x, z) > 0.5) { water++; continue; }
  if (field.getHeightAt(x, z) < level - 0.3) dry++;
}
// (round 6: the meander is narrower than round 4's arm — 26-68 m of water across, about 1.4 ha with the pocket)
assert.ok(water > 3000, `the arm and the pocket hold their water (${water * 4} m²)`);
assert.equal(dry, 0, `no ground under a waterline stays dry (${dry * 4} m²)`);
// (round 6: the arm's discs are ellipses along its curve, the pocket's round)
assert.ok(cfg.terrain.lakes.every((lake) => lake.radii?.length === 16 && lake.radii.every((r, i) => Math.abs(r - lake.radii[(i + 8) & 15]) < 1e-9)),
  'the discs are ellipses or round');
assert.equal(cfg.navigationWaterPolicy, 'avoid-liquid', 'the bots route round the water');

// 3. the dam
const lay = () => {
  const buckets = { plaster2: [], dark: [], structureMetal: [] };
  const obstacles = [], colliders = [];
  const receipt = dressReservoirDam(D, field, buckets, obstacles, colliders);
  return { buckets, obstacles, colliders, receipt };
};
const { buckets, obstacles, colliders, receipt } = lay();
assert.ok(receipt.chordM >= 66 && receipt.chordM <= 76, `the arch spans the arm (${receipt.chordM} m)`);
assert.ok(receipt.sagM >= 6 && receipt.sagM <= 10, `and bows into the reservoir (${receipt.sagM} m)`);
assert.equal(receipt.towers, 4, 'four intake towers');
assert.ok(receipt.upstreamFaceM > 22 && receipt.downstreamFaceM > 26, `faces of ${receipt.upstreamFaceM} and ${receipt.downstreamFaceM} m`);
assert.ok(Math.abs(receipt.crestY - height(0, 0)) < 0.01, 'the walkway stands at the road');
// (round 7: the lattice gantry, the lamp standards' arms and the concrete's painted bands; about 2.6 times round 6's)
assert.ok(receipt.triangles > 1500 && receipt.triangles < 16000, `inside its budget (${receipt.triangles} triangles)`);
assert.ok(receipt.lifts >= 6, `the upstream face's lift lines over the lake's ring (${receipt.lifts})`);
let lowFace = Infinity, minT = Infinity, maxT = -Infinity;
for (const g of [...buckets.plaster2, ...buckets.dark, ...buckets.structureMetal]) {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), 'finite');
    const t = (x - D.x) * v[0] + (z - D.z) * v[1], along = (x - D.x) * u[0] + (z - D.z) * u[1];
    // (the dam's own span: the rims' kerbs run on up the arm past the abutments; the head's kerbs, 250 m up the arm
    // (Skybridge round 5b), stand in line with the dam's span but far from it)
    if (Math.abs(along) < D.halfChordM - 5 && Math.hypot(x - D.x, z - D.z) < 120) { minT = Math.min(minT, t); maxT = Math.max(maxT, t); }
    if (t > 12) lowFace = Math.min(lowFace, y);
  }
}
assert.ok(lowFace < D.reservoirBedY, 'the upstream face runs into the reservoir\'s bed');
assert.ok(maxT > D.abutmentM + receipt.sagM - 1 && maxT < D.abutmentM + receipt.sagM + 8, `the crown stands upstream of the abutments (${maxT.toFixed(1)} m)`);
assert.ok(minT < -(D.pocketWallM + 10), 'the downstream works stand in the pocket');
const again = lay();
assert.deepEqual(again.receipt, receipt, 'deterministic');

// 4. collision: the parapets and the kerb, thin, off the road's core and out of the water
assert.equal(obstacles.length, 1, 'one compound record');
assert.equal(colliders.length, 1, 'mirrored for the colliders');
const parts = obstacles[0].shape2.kind === 'compound' ? obstacles[0].shape2.parts : [obstacles[0].shape2];
assert.ok(parts.length >= 4, `the road's two parapets and the rims' kerbs (${parts.length})`);
for (const part of parts) {
  assert.equal(part.kind, 'obb');
  assert.ok(part.hw <= 0.4, 'a thin wall');
  for (const f of [-1, 0, 1]) {
    const x = part.cx + Math.sin(part.yaw) * part.hl * f, z = part.cz + Math.cos(part.yaw) * part.hl * f;
    let road = Infinity;
    for (const path of cfg.terrain.roads.paths) for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      road = Math.min(road, Math.hypot(x - ax - dx * k, z - az - dz * k));
    }
    assert.ok(road > 4.2, `a wall keeps out of the road's core (${road.toFixed(1)} m at ${x.toFixed(0)}, ${z.toFixed(0)})`);
    assert.ok(field.getWaterMaskAt(x, z) < 0.5, 'and out of the water');
  }
}
// 5. (round 7) the rock tailwater: no kerb ring (the walls above are the road's parapets and the rims' two guards), its
// brow's fallen blocks on dry ground at the lip and off the roads, the outlet's portal at the foot of its far wall
assert.ok(D.naturalTailwater && D.outlet, 'the tailwater is rock, its outlet in its far wall');
assert.equal(parts.length, 2 + (D.rimGuards ?? []).length, 'no kerb ring round the tailwater');
{
  let wetNear = false;
  for (let a = 0; a < 16; a++) {
    const x = D.outlet.x + Math.cos(a / 16 * Math.PI * 2) * 2.5, z = D.outlet.z + Math.sin(a / 16 * Math.PI * 2) * 2.5;
    if (field.getWaterMaskAt(x, z) > 0.5) wetNear = true;
  }
  assert.ok(wetNear, `the outlet's portal stands at the water (${D.outlet.x}, ${D.outlet.z})`);
  assert.ok(field.getHeightAt(D.outlet.x, D.outlet.z) < D.tailwaterBedY + 6, 'at the foot of the far wall');
}
const blocks = (cfg.scenery.rocks ?? []).filter((r) => /tailwater/.test(r.name ?? ''));
assert.ok(blocks.length >= 6, `fallen blocks on the tailwater's brow (${blocks.length})`);
for (const b of blocks) {
  assert.ok(field.getHeightAt(b.x, b.z) > -2.5 && field.getWaterMaskAt(b.x, b.z) < 0.05, `a block on the lip, dry (${b.x}, ${b.z})`);
}
// the concrete in the kit's weathered render: unindexed and painted, the lake's ring, the lifts and the joints among its
// tints; no hoist house stands over the walkway (round 6's four boxes read as "a row of grey towers")
{
  const seed = new (await import('three')).BoxGeometry(1, 1, 1).toNonIndexed();
  seed.setAttribute('color', new (await import('three')).BufferAttribute(new Float32Array(seed.getAttribute('position').count * 3).fill(1), 3));
  const regional = { regionalPlaster2: [seed], plaster2: [], dark: [], structureMetal: [] };
  dressReservoirDam(D, field, regional, [], []);
  const laid = regional.regionalPlaster2.slice(1);
  assert.ok(laid.length > 20 && laid.every((g) => !g.index && g.getAttribute('color')), 'the dam\'s concrete in the regional bucket, unindexed and painted');
  const tints = laid.map((g) => { const c = g.getAttribute('color'); return [c.getX(0), c.getY(0), c.getZ(0)]; });
  for (const tint of [[1, 0.985, 0.95], [0.68, 0.66, 0.62], [0.58, 0.56, 0.53], [0.84, 0.82, 0.78]]) {
    assert.ok(tints.some((c) => c.every((x, i) => Math.abs(x - tint[i]) < 1e-3)), `the concrete carries the tint ${tint.join(', ')}`);
  }
  const crest = receipt.crestY + 0.15 + 1.1;
  let tall = 0;
  for (const g of laid) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (x - D.x) * v[0] + (z - D.z) * v[1], along = (x - D.x) * u[0] + (z - D.z) * u[1];
      if (t > D.roadHalfM + 1 && Math.abs(along) < D.halfChordM && y > crest + 0.9) tall++;
    }
  }
  assert.equal(tall, 0, 'no concrete stands over the walkway past the parapet (no hoist houses)');
}
for (const id of MAP_IDS) assert.equal((getMapConfig(id).props?.extraKits ?? []).includes('dam'), id === 'skybridge', `${id}: only Skybridge's dressing lays the dam`);
const kits = readFileSync(new URL('./mapKits.ts', import.meta.url), 'utf8');
const call = kits.indexOf("if (kits.includes('dam') && mapId === 'skybridge') dressReservoirDam(");
assert.ok(call > kits.indexOf('if (L.railSpurs?.length) dressRailSpurs(focused, L.railSpurs);'), 'laid last in the stream');
console.log(`reservoirDam: ${receipt.chordM} m arch with ${receipt.sagM} m of sag, ${receipt.towers} intakes, faces ${receipt.upstreamFaceM}/${receipt.downstreamFaceM} m, ${receipt.triangles} triangles, ${parts.length} walls (${receipt.parapetM} m of parapet, ${receipt.kerbM} m of kerb); ${water * 4} m² of water, none dry under it`);
