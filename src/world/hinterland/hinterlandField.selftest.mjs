// HL-0 (the horizons stream, 2026-10-13; B-architecture §4.0–§4.1): the Hinterland's spec, its 26 regions and its
// field's terms 1–3 and 6. Pure, dark: no map carries a block yet, so production is untouched.
//   - every region resolves into a complete spec, and every one of the 33 maps has a region;
//   - the switch: a block migrates its map, a lab block only under ?hinterland=1, ?hinterland=0 always keeps the ring;
//   - the seam: inside the square the field IS the ground, and its step across 512 m is the ground's own (term 1);
//   - term 2: within the near hold the field is the battlefield's own outland (a flat place: the edge's datum, flat);
//   - term 3: a planner's pad levels its yard and a road grades its line; term 6: sea, lake, river and flood water;
//   - cover: the map's own field system runs on past the line (crops), water reads as water;
//   - determinism (two builds agree) and a pin of the hinterland's own law on a synthetic ground (no lane's map edit
//     can move it).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const { HINTERLAND_REGIONS, HINTERLAND_REGION_IDS, HINTERLAND_MAP_REGIONS } = await import('./regions.ts');
const { resolveHinterlandSpec, hinterlandActive, arcWeight, bearingInArc, hinterlandPoint, hinterlandBearing } = await import('./spec.ts');
const { createHinterlandField, createHinterlandCover, createHinterlandWater, HL_COVER } = await import('./field.ts');
const { MAP_IDS, getMapConfig } = await import('../maps/index.ts');
const { createHeightField } = await import('../terrain.ts');

// ---- the region library: 26 regions, every map placed, every field present
assert.equal(HINTERLAND_REGION_IDS.length, 26, 'B-architecture §4.0: 26 regions');
for (const id of MAP_IDS) assert.ok(HINTERLAND_MAP_REGIONS[id], `map ${id} has a region`);
for (const id of HINTERLAND_REGION_IDS) {
  const spec = resolveHinterlandSpec({ id: `probe-${id}`, hinterland: { place: 'probe', region: id } });
  const walk = (v, path) => {
    if (v === undefined) assert.fail(`${id}: ${path} unresolved`);
    if (typeof v === 'number') assert.ok(!Number.isNaN(v), `${id}: ${path} NaN`);
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, w] of Object.entries(v)) walk(w, `${path}.${k}`);
  };
  walk(spec, 'spec');
  assert.equal(spec.region, HINTERLAND_REGIONS[id]);
  assert.ok(spec.far.length >= 1 && spec.far[0].form === HINTERLAND_REGIONS[id].far.form, `${id}: far default`);
  const s = spec.outland.settle;
  assert.ok(s.villages >= 0 && s.hamlets >= 0 && s.farms >= 0, `${id}: settlement counts`);
}
assert.equal(resolveHinterlandSpec({ id: 'verdant' }), null, 'no block, no spec');
assert.throws(() => resolveHinterlandSpec({ id: 'x', hinterland: { place: 'p', region: 'atlantis' } }), /unknown region/);

// ---- the switch (§7.1)
const block = { id: 'polders', hinterland: { place: 'p', region: 'zeelandPolder' } };
const lab = { id: 'verdant', hinterland: { place: 'p', region: 'forestSteppe', lab: true } };
assert.equal(hinterlandActive({ id: 'verdant' }, ''), false, 'no block: the old ring');
assert.equal(hinterlandActive({ id: 'verdant' }, '?hinterland=1'), false, 'the override never invents a block');
assert.equal(hinterlandActive(block, ''), true);
assert.equal(hinterlandActive(block, '?a=1&hinterland=0'), false, 'the one-line A/B back to the ring');
assert.equal(hinterlandActive(lab, ''), false, 'a lab block stays dark in production');
assert.equal(hinterlandActive(lab, '?hinterland=1'), true);

// ---- bearings
const p = hinterlandPoint({ azDeg: 90, distM: 1000 });
assert.ok(Math.abs(p.x - 1000) < 1e-9 && Math.abs(p.z) < 1e-9, 'bearing 90 is east (+x)');
assert.ok(Math.abs(hinterlandBearing(0, 10)) < 1e-9 && Math.abs(hinterlandBearing(-10, 0) - 270) < 1e-9);
assert.ok(bearingInArc(350, [300, 20]) && !bearingInArc(100, [300, 20]) && bearingInArc(123, [0, 360]));
assert.equal(arcWeight(10, [300, 20], 5), 1);
assert.equal(arcWeight(200, [300, 20], 5), 0);

// ---- a synthetic ground: the pin of the hinterland's own law (terms 1, 2, 3 and 6, cover)
const synth = {
  getHeightAt: (x, z) => 2 + 3 * Math.sin(x / 97) * Math.cos(z / 131),
  getOutlandHeightAt: (x, z) => 2.4 + 3 * Math.sin(x / 97) * Math.cos(z / 131) + 6 * Math.sin((x + z) / 900),
  getBorderWoodsAt: (x, z) => (Math.sin(x / 300) * Math.sin(z / 260) > 0.6 ? 1 : 0),
};
const synthSpec = resolveHinterlandSpec({ id: 'synthetic', terrain: { rimH: 24 }, hinterland: {
  place: 'synthetic', region: 'zeelandPolder',
  water: [
    { kind: 'sea', arc: { azDeg: [150, 210] }, coastM: 1800, coastWanderM: 200, level: -1 },
    { kind: 'lake', at: { azDeg: 60, distM: 1500 }, radiusM: 180 },
    { kind: 'river', toAzDeg: 300, widthM: 30 },
    { kind: 'flood', arc: { azDeg: [240, 280] }, level: 3, coastM: 900 },
  ],
} });
const sf = createHinterlandField(synthSpec, 1337, synth);
// inside: the ground
for (const [x, z] of [[0, 0], [300, -200], [511.9, 400]]) assert.equal(sf.heightAt(x, z), synth.getHeightAt(x, z));
// term 1: the step at the edge is the ground's own (the residual continues it)
let worstStep = 0;
for (let i = 0; i < 1024; i++) {
  const t = -511 + (i % 256) * 4, side = i >> 8;
  const [x0, z0, x1, z1] = side === 0 ? [512, t, 512.05, t] : side === 1 ? [-512, t, -512.05, t] : side === 2 ? [t, 512, t, 512.05] : [t, -512, t, -512.05];
  worstStep = Math.max(worstStep, Math.abs(sf.heightAt(x1, z1) - synth.getHeightAt(x0, z0)));
}
assert.ok(worstStep < 0.01, `synthetic seam step ${worstStep.toFixed(3)} m`);
// term 6
const w = createHinterlandWater();
const seaPt = hinterlandPoint({ azDeg: 180, distM: 2800 });
sf.waterAt(seaPt.x, seaPt.z, w);
assert.ok(w.kind === 1 && w.wet > 0.9 && sf.heightAt(seaPt.x, seaPt.z) < -1, 'the sea past its coast');
const lakePt = hinterlandPoint({ azDeg: 60, distM: 1500 });
sf.waterAt(lakePt.x, lakePt.z, w);
assert.ok(w.kind === 2 && w.wet > 0.9, 'the lake at its centre');
let riverWet = 0;
for (let az = 280; az <= 320; az += 0.25) {
  const q = hinterlandPoint({ azDeg: az, distM: 1100 });
  sf.waterAt(q.x, q.z, w);
  if (w.kind === 3) riverWet = Math.max(riverWet, w.wet);
}
assert.ok(riverWet > 0.9, 'the river leaving the edge runs on');
// term 3: a yard levelled, a road graded with its crown
const yard = { x: 700, z: 900, r: 20, featherM: 15, y: 9, kind: 'yard' };
const road = { xs: [600, 900, 1200], zs: [-700, -760, -800], halfWidthM: 3, featherM: 6, crownM: 1, kind: 'road' };
const sfp = sf.withFeatures({ pads: [yard], lines: [road] });
assert.ok(Math.abs(sfp.heightAt(705, 905) - 9) < 1e-9, 'a yard stands at its level');
assert.ok(Math.abs(sfp.heightAt(760, 960) - sf.heightAt(760, 960)) < 1e-9, 'past its feather the land is untouched');
const onRoad = sfp.heightAt(900, -760), beside = sf.heightAt(900, -760);
assert.ok(Math.abs(onRoad - beside - 1) < 1.5, `the road's crown over the land (${(onRoad - beside).toFixed(2)} m)`);
const cover = createHinterlandCover();
sfp.coverAt(900, -760, cover);
assert.equal(cover.cls, HL_COVER.road, 'the road is road');
sfp.coverAt(705, 905, cover);
assert.ok(cover.settle > 0.5, 'the yard is settlement ground');

// the pin: the hinterland's own law on the synthetic ground, 200 points from the edge to 12 km
const pinPoints = [];
for (let i = 0; i < 200; i++) {
  const az = (i * 137.508) % 360, d = 520 + (i * i * 0.3) % 11500;
  pinPoints.push(hinterlandPoint({ azDeg: az, distM: d }, { x: 0, z: 0 }));
}
const pinOf = (field) => {
  const h = createHash('sha256');
  const c = createHinterlandCover();
  for (const pt of pinPoints) {
    field.coverAt(pt.x, pt.z, c);
    h.update(`${field.heightAt(pt.x, pt.z).toFixed(3)}|${c.cls}|${c.crop};`);
  }
  return h.digest('hex').slice(0, 16);
};
const pinA = pinOf(sf), pinB = pinOf(createHinterlandField(synthSpec, 1337, synth));
assert.equal(pinA, pinB, 'two builds of one spec agree');
const PIN = process.env.HINTERLAND_PIN_PRINT ? null : 'f726caff327f7a54';
if (PIN === null || PIN === '__PIN__') console.log(`hinterlandField pin: ${pinA}`);
else assert.equal(pinA, PIN, 'the hinterland law moved: re-pin with the reason (HINTERLAND_PIN_PRINT=1)');

// ---- real maps: Polders and Verdant on their own ground
for (const id of ['polders', 'verdant']) {
  const cfg = getMapConfig(id);
  const ground = createHeightField(1337, cfg);
  const spec = resolveHinterlandSpec({ ...cfg, hinterland: { place: id, region: HINTERLAND_MAP_REGIONS[id] } });
  const field = createHinterlandField(spec, 1337, ground);
  // the seam: inside the square the field is the ground; across 512 m the step is the ground's own slope
  let step = 0, slope = 0;
  for (let i = 0; i < 1024; i++) {
    const t = -511 + (i % 256) * 4, side = i >> 8;
    const at = (s, d) => side === 0 ? [s, d] : side === 1 ? [-s, d] : side === 2 ? [d, s] : [d, -s];
    const [xa, za] = at(511.95, t), [xb, zb] = at(512.05, t), [xc, zc] = at(511.85, t);
    assert.equal(field.heightAt(xa, za), ground.getHeightAt(xa, za));
    step = Math.max(step, Math.abs(field.heightAt(xb, zb) - field.heightAt(xa, za)));
    slope = Math.max(slope, Math.abs(ground.getHeightAt(xa, za) - ground.getHeightAt(xc, zc)));
  }
  assert.ok(step < Math.max(0.06, slope * 3), `${id}: seam step ${step.toFixed(3)} m against the ground's own ${slope.toFixed(3)} m`);
  // term 2: the near hold is the battlefield's continued ground, exactly — except in a flat place, which does not continue
  // the old rim's hills: there the land past the residual is the edge's datum and its creek ridges, flat to a metre or two
  if (spec.outland.flat) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 256; i++) {
      const az = i * 1.40625, pt = hinterlandPoint({ azDeg: az, distM: 760 + (i % 16) * 180 });
      if (Math.max(Math.abs(pt.x), Math.abs(pt.z)) - 512 < 200) continue; // (the residual's 180 m eases the edge in)
      const rel = field.baseHeightAt(pt.x, pt.z) - field.datumAt(az);
      lo = Math.min(lo, rel); hi = Math.max(hi, rel);
    }
    assert.ok(lo > -spec.outland.riseM[0] - 0.05 && hi < spec.outland.riseM[1] + 0.05, `${id}: flat past the edge (${lo.toFixed(2)}..${hi.toFixed(2)} m)`);
  } else for (let i = 0; i < 64; i++) {
    // (past the residual's 180 m and inside the 700 m hold: the battlefield's own outland, exactly)
    const az = i * 5.625, d = 760 + (i % 8) * 60;
    const pt = hinterlandPoint({ azDeg: az, distM: d });
    const out = Math.max(Math.abs(pt.x), Math.abs(pt.z)) - 512;
    if (out < 182 || out > 690) continue;
    assert.equal(field.baseHeightAt(pt.x, pt.z), ground.getOutlandHeightAt(pt.x, pt.z), `${id}: term 2 at ${az}°`);
  }
  // far out, the region's relief round the datum, inside the region's rise
  const [lo, hi] = spec.outland.riseM;
  for (let i = 0; i < 32; i++) {
    const az = i * 11.25, pt = hinterlandPoint({ azDeg: az, distM: 3500 });
    const rel = field.baseHeightAt(pt.x, pt.z) - field.datumAt(az);
    assert.ok(rel >= -lo - 1e-6 && rel <= hi + 1e-6, `${id}: far relief ${rel.toFixed(1)} m in [${-lo}, ${hi}]`);
  }
  // the field system carries on past the line: crops past the edge
  const c = createHinterlandCover();
  let crops = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const pt = hinterlandPoint({ azDeg: i * 1.8, distM: 560 + (i % 5) * 60 });
    field.coverAt(pt.x, pt.z, c, 2);
    n++; if (c.crop !== 31) crops++;
  }
  assert.ok(crops / n > 0.3, `${id}: fields past the edge (${crops}/${n})`);
  console.log(`hinterlandField: ${id} seam step ${step.toFixed(3)} m (ground ${slope.toFixed(3)}), crops ${crops}/${n}`);
}
console.log('hinterlandField.selftest: ok');
