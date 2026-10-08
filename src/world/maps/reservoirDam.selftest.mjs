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
//   4. its collision is the road's parapets and the pocket's kerb only — thin walls off the road's core and out of the
//      water — and only Skybridge's dressing lays it, last in the stream.
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
for (const s of [-28, -13, 0]) assert.ok(wet(s, -18), `the tailwater lies in the pocket (${s} m along)`);
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
assert.ok(receipt.triangles > 1500 && receipt.triangles < 6000, `inside its budget (${receipt.triangles} triangles)`);
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
assert.ok(parts.length >= 7, `the road's two parapets, the pocket's kerb and the rims' kerbs (${parts.length})`);
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
for (const id of MAP_IDS) assert.equal((getMapConfig(id).props?.extraKits ?? []).includes('dam'), id === 'skybridge', `${id}: only Skybridge's dressing lays the dam`);
const kits = readFileSync(new URL('./mapKits.ts', import.meta.url), 'utf8');
const call = kits.indexOf("if (kits.includes('dam') && mapId === 'skybridge') dressReservoirDam(");
assert.ok(call > kits.indexOf('if (L.railSpurs?.length) dressRailSpurs(focused, L.railSpurs);'), 'laid last in the stream');
console.log(`reservoirDam: ${receipt.chordM} m arch with ${receipt.sagM} m of sag, ${receipt.towers} intakes, faces ${receipt.upstreamFaceM}/${receipt.downstreamFaceM} m, ${receipt.triangles} triangles, ${parts.length} walls (${receipt.parapetM} m of parapet, ${receipt.kerbM} m of kerb); ${water * 4} m² of water, none dry under it`);
