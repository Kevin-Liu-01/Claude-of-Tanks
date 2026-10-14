// HL-1 (the horizons stream, 2026-10-13; B-architecture §4.4, §7.3): the Hinterland's CPU pipeline — the field with
// its landforms, the outland plan, the plan levelled back into the field, the height pyramid — on the Polders lab draft
// over a synthetic ground (fast, and no lane's map edit moves it):
//   - the plan is deterministic (two builds agree to the byte);
//   - every road leaving the square runs on past the edge; the dykes carry their roads and poplar rows;
//   - settlements at the region's density, a church tower at every village, the polders' mills, the named landmarks;
//   - no building stands in water or floats: its yard is levelled to within 0.3 m of the field under it;
//   - the sea and the flood are coasts in the world (no sector), the dyke stands its authored height;
//   - the pyramid agrees with the field it baked (64 points, 0.5 m) — the CPU twin the mesh's textures come from.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const { resolveHinterlandSpec, hinterlandPoint } = await import('./spec.ts');
const { HINTERLAND_LAB_DRAFTS } = await import('./drafts/index.ts');
const { selectHinterland } = await import('./select.ts');
const { buildHinterland } = await import('./pipeline.ts');
const { samplePyramid, levelFor } = await import('./pyramid.ts');
const { createHinterlandWater } = await import('./field.ts');

// the lab switch: a draft draws only under ?hinterland=1, never in production
assert.equal(selectHinterland({ id: 'polders' }, ''), null);
assert.equal(selectHinterland({ id: 'polders' }, '?hinterland=1'), HINTERLAND_LAB_DRAFTS.polders);
assert.equal(selectHinterland({ id: 'polders' }, '?hinterland=0'), null);
assert.equal(selectHinterland({ id: 'mars' }, '?hinterland=1'), null, 'no draft, no hinterland');

const ground = {
  getHeightAt: (x, z) => 0.6 + 0.4 * Math.sin(x / 140) * Math.cos(z / 170),
  getOutlandHeightAt: (x, z) => 0.8 + 0.6 * Math.sin(x / 140) * Math.cos(z / 170) + 0.8 * Math.sin((x - z) / 1300),
  _roadExitLines: () => [
    { xs: [500, 530, 560, 590], zs: [-40, -42, -45, -47], length: 90 },
    { xs: [80, 82, 85, 88], zs: [-500, -530, -560, -590], length: 90 },
  ],
};
const spec = resolveHinterlandSpec({ id: 'polders', terrain: { rimH: 18 }, hinterland: HINTERLAND_LAB_DRAFTS.polders });
const LEVELS = [{ texelM: 8, halfM: 1152 }, { texelM: 48, halfM: 6144 }, { texelM: 384, halfM: 24576 }];
const a = buildHinterland(spec, 1337, ground, { levels: LEVELS });
const b = buildHinterland(spec, 1337, ground, { levels: LEVELS });
const digest = (build) => createHash('sha256').update(JSON.stringify({ s: build.plan.settlements, r: build.plan.roads, v: build.plan.verticals, b: build.plan.buildings, w: build.plan.rows })).digest('hex');
assert.equal(digest(a), digest(b), 'the plan is deterministic');
assert.deepEqual(Array.from(a.pyramid.levels[0].heights.slice(0, 4096)), Array.from(b.pyramid.levels[0].heights.slice(0, 4096)), 'the bake is deterministic');
const { plan, field } = a;

// roads run on: both exits continue at least a kilometre past the edge; the dykes' roads and rows are laid
for (const exit of ['exit:0', 'exit:1']) {
  const road = plan.roads.find((r) => r.from === exit);
  assert.ok(road, `${exit} runs on`);
  const last = road.xs.length - 1;
  assert.ok(Math.max(Math.abs(road.xs[last]), Math.abs(road.zs[last])) > 1500, `${exit} reaches past 1.5 km`);
}
assert.ok(plan.roads.filter((r) => r.kind === 'dikeRoad').length >= 5, 'the dykes carry their roads');
assert.ok(plan.rows.filter((r) => r.kind === 'dike').length >= 7, 'the dykes carry their poplar rows');

// settlements, towers, mills, landmarks
const near = plan.settlements.filter((s) => s.near);
assert.ok(near.filter((s) => s.kind === 'village').length >= 2, 'dyke villages near the edge');
assert.ok(near.filter((s) => s.kind === 'farm').length >= 8, 'farms past the edge');
for (const s of plan.settlements.filter((s) => s.kind === 'village')) {
  assert.ok(plan.verticals.some((v) => v.settlement === s.id && v.kind === 'churchTower'), `village ${s.id} raises its church tower`);
}
assert.ok(plan.verticals.filter((v) => v.kind === 'windmill').length >= 8, "the polders' mills");
assert.ok(plan.verticals.some((v) => v.name === 'Lange Jan, Middelburg' && v.heightM === 90), 'Lange Jan stands over Walcheren');
assert.ok(plan.verticals.filter((v) => v.kind === 'pylonLine').length >= 10, 'the 150 kV line strides out');
assert.ok(plan.buildings.length >= 60, `buildings past the edge (${plan.buildings.length})`);

// no building in water; every yard level with the field under it (K12 in the distance)
const water = createHinterlandWater();
for (const bd of plan.buildings) {
  assert.ok(field.waterAt(bd.x, bd.z, water).wet < 0.05, `building at (${bd.x.toFixed(0)}, ${bd.z.toFixed(0)}) stands dry`);
  const h0 = field.heightAt(bd.x, bd.z);
  const c = Math.cos(bd.yaw), s = Math.sin(bd.yaw);
  for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    const x = bd.x + u * bd.width * c + v * bd.depth * s, z = bd.z - u * bd.width * s + v * bd.depth * c;
    assert.ok(Math.abs(field.heightAt(x, z) - h0) < 0.3, 'no footprint corner floats or sinks past 0.3 m');
  }
}

// the waters: the Westerschelde past its coast, its far shore across, the flood west, all running past the arc's ends
const sea = hinterlandPoint({ azDeg: 180, distM: 5000 });
assert.ok(field.waterAt(sea.x, sea.z, water).kind === 1 && water.wet > 0.9, 'the Westerschelde');
const shore = hinterlandPoint({ azDeg: 180, distM: 9800 });
assert.ok(field.waterAt(shore.x, shore.z, water).wet < 0.5, "Zeeuws-Vlaanderen's shore across the channel");
const offArc = { x: 4000, z: -5000 }; // beyond the arc's bearings: the coast runs on, no sector edge
assert.ok(field.waterAt(offArc.x, offArc.z, water).kind === 1, 'the estuary runs on past its arc (a coast, not a sector)');
let flooded = 0;
for (let i = 0; i < 40; i++) { const p = hinterlandPoint({ azDeg: 255 + i, distM: 3600 + (i % 5) * 300 }); if (field.waterAt(p.x, p.z, water).kind === 5) flooded++; }
assert.ok(flooded >= 20, `Walcheren lies under the flood (${flooded}/40)`);

// the dyke stands its authored height over the polder beside it
const dyke = spec.landforms.find((l) => l.name === 'the north polder dyke');
const crest = hinterlandPoint(dyke.at), strike = dyke.strikeDeg * Math.PI / 180;
const off = { x: crest.x + Math.cos(strike) * 60, z: crest.z - Math.sin(strike) * 60 };
const rise = field.baseHeightAt(crest.x, crest.z) - field.baseHeightAt(off.x, off.z);
assert.ok(Math.abs(rise - dyke.heightM) < 1.2, `the north dyke stands ${rise.toFixed(2)} m (authored ${dyke.heightM})`);

// the pyramid is the field it baked
let worst = 0;
for (let i = 0; i < 64; i++) {
  // (at the level's own samples: between them the bilinear is the resolution's, not the bake's)
  const q = hinterlandPoint({ azDeg: i * 5.625, distM: 560 + (i % 8) * 900 });
  const L = levelFor(a.pyramid, q.x, q.z);
  const p = { x: Math.round((q.x + L.halfM) / L.texelM) * L.texelM - L.halfM, z: Math.round((q.z + L.halfM) / L.texelM) * L.texelM - L.halfM };
  if (Math.max(Math.abs(p.x), Math.abs(p.z)) < 520) continue; // (inside the square the bake keeps only an edge band)
  worst = Math.max(worst, Math.abs(samplePyramid(a.pyramid, p.x, p.z) - field.displayHeightAt(p.x, p.z, L.texelM)));
}
assert.ok(worst < 0.5, `pyramid against field: ${worst.toFixed(3)} m`);
// the drawn land stands at the water's surface over open water (a level sheet), and at the ground beside it
let open = 0, offLevel = 0;
for (let i = 0; i < 60; i++) {
  const p = hinterlandPoint({ azDeg: 172 + (i % 16), distM: 4200 + 120 * Math.floor(i / 16) });
  field.waterAt(p.x, p.z, water);
  if (water.wet < 0.99) continue;
  open++; offLevel = Math.max(offLevel, Math.abs(field.displayHeightAt(p.x, p.z) - water.level));
  assert.ok(field.heightAt(p.x, p.z) < water.level, 'the floor lies under the water');
}
assert.ok(open >= 20 && offLevel < 1e-6, `the Westerschelde draws level (${open} open, ${offLevel.toFixed(4)} m off)`);
console.log(`hinterlandPlan.selftest: ok — ${plan.settlements.length} settlements (${near.length} near), ${plan.buildings.length} buildings, ${plan.verticals.length} verticals, ${plan.roads.length} roads; build ${Math.round(a.ms.total)} ms`);
