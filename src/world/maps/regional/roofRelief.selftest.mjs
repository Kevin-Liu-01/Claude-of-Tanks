// The roof relief law (dome-detail-275; the roof bar: "roofs in courses, in relief"; the roof scan of 2026-11-22: 83 kit
// builders' roofs smooth slabs, under 0.5 roof triangles a square metre, beside the 1.0-5.7 of every roof the detail waves
// laid in relief). house.ts RoofSpec.relief lays a covering in relief over every slope emitRoof emits (roofRelief.ts);
// layRoofRelief over a roof a builder draws itself. Every kit builder is built (desktop, two seeds):
//   1. every roof emitRoof lays — pitched from PITCHED_MIN_M2 of plan, flat from FLAT_MIN_M2 — carries relief: the
//      triangles of its covering's buckets lying on it (centroid over its plan, within BAND_M of its top) beyond what the
//      same roof's smooth slab lays, or the relief layRoofRelief laid over its plan, at least MIN_RELIEF a square metre
//      of plan (the waves' relief roofs 2.0-12, the smooth slabs 0-0.73);
//   2. a builder whose roof buckets cover ROOFSCAN_MIN_M2 of plan or more (its own roofs, however drawn) lays at least
//      MIN_ROOFSCAN roof-bucket triangles a square metre of their plan (notes roofscan.mjs: smooth under 0.5, relief 1.0+),
//      or lays relief (layRoofRelief) over RELIEF_COVER of its solid roof parts' plan (a slab counts its top and its
//      underside: a flat roof's felt in relief is sparse by nature and stays honest);
//   3. a builder failing either stands on SMOOTH_BY_NATURE (an earth or mud roof, with its reason), and a builder on it
//      that now passes both is an error (the list only shrinks);
//   4. the law sees what it guards (synthetic): a smooth gable, hip and flat roof fail law 1 and pass it in relief; a
//      relief keeps to its allowance and leaves the war's stripped patch open; with no relief the slab is the slab.
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts } from './index.ts';
import { PartSink, streamFrom } from './geometry.ts';
import { emitRoof, roofGeometry, withRoofLog } from './house.ts';
import { layRoofRelief, reliefFlat, withReliefLog } from './roofRelief.ts';
import { INFO } from '../../../../tools/building-detail-census.mjs';

const PITCHED_MIN_M2 = 8, FLAT_MIN_M2 = 40, BAND_M = 0.3, MIN_RELIEF = 0.8;
const ROOFSCAN_MIN_M2 = 40, MIN_ROOFSCAN = 0.8, RELIEF_COVER = 0.4;

// ---- 3. the roofs smooth by nature (dome-detail-275, 2026-11-22: the sweep opted every other kit roof into relief and
// emptied the list of builders not yet in relief). An earth or mud roof is a rolled clay or puddled-mud skin over its
// timbers, smooth by nature: its roller, spouts and parapet carry it (relief courses there would draw tiles that are
// not there). A builder lands here only for such a roof, with its reason; a builder here that passes is an error.
const SMOOTH_BY_NATURE = new Map([
  ['chouf/adobe', 'flat earth roof, rolled clay with its roller and spouts'],
  ['chouf/barn', 'its earth-roofed variant (the tiled variant is in relief)'],
  ['chouf/bathhouse', 'the hammam\'s flat earth roof, rolled clay (approved by Kevin 2026-11-22)'],
  ['chouf/cottage', 'its earth-roofed variant (the tiled variant is in relief)'],
  ['chouf/marketRow', 'the souk\'s flat earth roofs, rolled clay'],
  ['navajo/compound', 'the ranch house\'s flat mud roof on vigas (the tin-gable variant is in relief)'],
]);

const TWIN = { roof: 'regionalRoof', plaster: 'regionalPlaster', plaster2: 'regionalPlaster2', plaster3: 'regionalPlaster3', stone: 'regionalStone' };
const ORIGIN = { yaw: 0, x: 0, y: 0, z: 0 };

/** The triangles of `buckets` lying on a roof: centroid over its plan (|x| <= X, |z| <= Z in its frame), within BAND_M of its top. */
function onRoof(parts, rg, X, Z, place, buckets) {
  const c = Math.cos(place.yaw), s = Math.sin(place.yaw);
  let n = 0;
  for (const b of buckets) for (const g of parts[b] ?? []) {
    const p = g.getAttribute('position'), idx = g.index, m = idx ? idx.count : p.count;
    for (let i = 0; i < m; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const j = idx ? idx.getX(i + k) : i + k; cx += p.getX(j) / 3; cy += p.getY(j) / 3; cz += p.getZ(j) / 3; }
      const dx = cx - place.x, dz = cz - place.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > X + 0.05 || Math.abs(lz) > Z + 0.05) continue;
      const top = rg.topAt(Math.max(-X, Math.min(X, lx)), Math.max(-Z, Math.min(Z, lz)));
      if (top !== null && Math.abs(cy - place.y - top) <= BAND_M) n++;
    }
  }
  return n;
}

/** Law 1 over one build: each qualifying roof's relief a square metre of plan, and the ones under MIN_RELIEF. */
function roofFailures(parts, roofs, reliefs) {
  const out = [];
  for (const { rg, roof, place } of roofs) {
    const X = rg.s + roof.eave, Z = rg.kind === 'flat' ? rg.halfD + roof.eave : rg.halfD + (rg.hipVerge ?? roof.verge), area = 4 * X * Z;
    if (area < (rg.kind === 'flat' ? FLAT_MIN_M2 : PITCHED_MIN_M2)) continue;
    const pl = place ?? ORIGIN, buckets = new Set([roof.bucket, TWIN[roof.bucket], 'roof', 'regionalRoof'].filter(Boolean));
    const laid = onRoof(parts, rg, X, Z, pl, buckets);
    // the same roof's smooth slab, alone in its own frame
    const sink = new PartSink([0, 0]);
    const { relief: _relief, ...smooth } = roof;
    emitRoof(sink, rg, smooth);
    const slab = onRoof(sink.finish(), rg, X, Z, ORIGIN, buckets);
    // the relief a builder laid over this roof's plan itself (layRoofRelief: a north light's sheets over its flat roof)
    const c = Math.cos(pl.yaw), s = Math.sin(pl.yaw);
    let own = 0;
    for (const r of reliefs) {
      const dx = r.centre[0] - pl.x, dz = r.centre[2] - pl.z;
      if (Math.abs(dx * c - dz * s) <= X && Math.abs(dx * s + dz * c) <= Z) own += r.tris;
    }
    const k = Math.max(laid - slab, own) / area;
    if (k < MIN_RELIEF) out.push(`${rg.kind} roof ${area.toFixed(0)} m2 (${roof.bucket}) ${k.toFixed(2)} relief tris/m2`);
  }
  return out;
}

/** Law 2 over one build: its roof buckets' triangles a square metre of their plan (roofscan.mjs) and that plan. */
function roofscan(parts) {
  let tris = 0, area = 0, solid = 0;
  for (const k of Object.keys(parts).filter((b) => /roof/i.test(b))) for (const g of parts[k]) {
    const p = g.getAttribute('position'), idx = g.index, n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      const ax = p.getX(b) - p.getX(a), az = p.getZ(b) - p.getZ(a), bx = p.getX(c) - p.getX(a), bz = p.getZ(c) - p.getZ(a);
      const up = Math.abs(ax * bz - az * bx) / 2;
      if (up > 0) { area += up; tris++; if (!g.userData.noCollision) solid += up; }
    }
  }
  return { k: tris / Math.max(area, 1e-6), area, solid };
}

// ---- 4. the law sees what it guards
{
  const cases = [
    { kind: 'gable', pitchDeg: 40, eave: 0.4, verge: 0.3, thickness: 0.16, bucket: 'roof', ridge: 'round' },
    { kind: 'hip', pitchDeg: 30, eave: 0.4, verge: 0.4, thickness: 0.14, bucket: 'roof', ridge: 'saddle' },
    { kind: 'flat', pitchDeg: 0, eave: 0.1, verge: 0.1, thickness: 0.2, bucket: 'stone', parapet: 0.5 },
  ];
  for (const roof of cases) {
    const rg = roofGeometry(9, 12, 5, roof);
    const smooth = new PartSink([0.4, 0.9]);
    const [, smoothLog] = withRoofLog(() => emitRoof(smooth, rg, roof));
    const smoothParts = smooth.finish();
    assert.equal(roofFailures(smoothParts, smoothLog, []).length, 1, `law 1 catches a smooth ${roof.kind} roof`);
    const relief = { kind: roof.kind === 'flat' ? 'felt' : 'tile' };
    const laid = new PartSink([0.4, 0.9]);
    const [[, log], reliefs] = withReliefLog(() => withRoofLog(() => emitRoof(laid, rg, { ...roof, relief })));
    assert.deepEqual(roofFailures(laid.finish(), log, reliefs), [], `a ${roof.kind} roof in relief passes law 1`);
    // no relief (an absent or undefined field): the slab to the byte
    const again = new PartSink([0.4, 0.9]);
    emitRoof(again, rg, { ...roof, relief: undefined });
    const bytes = (parts) => Buffer.concat(Object.values(parts).flat().flatMap((g) => Object.values(g.attributes).map((at) => Buffer.from(at.array.buffer))));
    assert.ok(bytes(again.finish()).equals(bytes(smoothParts)), `no relief: the ${roof.kind} slab as before`);
  }
  // the default allowance holds on a large roof, and an explicit one too
  for (const budget of [undefined, 300]) {
    const sink = new PartSink();
    const n = layRoofRelief(sink, { kind: 'pantile', ...(budget ? { budget } : {}) }, [reliefFlat(-15, -20, 15, 20, 6)], { bucket: 'roof' });
    assert.ok(n > 0 && n <= (budget ?? 2400), `a relief keeps to its allowance (${n} of ${budget ?? 2400})`);
  }
  // the war's stripped patch is left open: no relief triangle's centroid inside it
  {
    const roof = { ...cases[0], relief: { kind: 'slate' } }, rg = roofGeometry(9, 12, 5, roof);
    const patch = { side: 1, z0: -1.5, z1: 0.5, x0: 1.2, x1: 2.6 };
    const sink = new PartSink([0.1, 0.2]);
    emitRoof(sink, rg, roof, undefined, patch);
    const parts = sink.finish();
    let inside = 0;
    for (const g of parts.roof) {
      if (!g.userData.noCollision) continue;
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i += 3) {
        const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        if (cx > patch.x0 + 0.05 && cx < patch.x1 - 0.05 && cz > patch.z0 + 0.05 && cz < patch.z1 - 0.05) inside++;
      }
    }
    assert.equal(inside, 0, 'the relief leaves the stripped patch open');
  }
}

// ---- 1-3. every kit builder
const failing = new Map();
let roofsSeen = 0;
for (const style of ARCHITECTURE_STYLES) {
  for (const id of Object.keys(style.builders)) {
    const [w, d, h] = INFO[id] ?? [7, 9, 6];
    for (const seed of [11, 29]) {
      const [[parts, roofs], reliefs] = withReliefLog(() => withRoofLog(() => buildRegionalParts(style, {
        structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
        wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'selftest', snowCap: false, tier: 'desktop' }, streamFrom(seed + 1))));
      roofsSeen += roofs.length;
      const why = roofFailures(parts, roofs, reliefs);
      const scan = roofscan(parts), cover = reliefs.reduce((a, r) => a + r.plan, 0);
      if (scan.area >= ROOFSCAN_MIN_M2 && scan.k < MIN_ROOFSCAN && cover < RELIEF_COVER * scan.solid) why.push(`roof buckets ${scan.k.toFixed(2)} tris/m2`);
      const key = `${style.id}/${id}`;
      if (why.length) failing.set(key, [...(failing.get(key) ?? []), ...why.map((y) => `seed ${seed}: ${y}`)]);
    }
  }
}
assert.ok(roofsSeen > 300, `the roof log saw the kits' roofs (${roofsSeen})`);
const fresh = [...failing.keys()].filter((k) => !SMOOTH_BY_NATURE.has(k)).sort();
const stale = [...SMOOTH_BY_NATURE.keys()].filter((k) => !failing.has(k)).sort();
if (fresh.length || stale.length) {
  for (const k of fresh) console.error(`  ${k}: ${failing.get(k).slice(0, 3).join('; ')}`);
  console.error(`builders failing: ${JSON.stringify([...failing.keys()].sort())}`);
}
assert.deepEqual(fresh, [], 'every kit roof is laid in relief, or its builder stands on SMOOTH_BY_NATURE with its reason');
assert.deepEqual(stale, [], 'a builder in relief comes off SMOOTH_BY_NATURE');
console.log(`roof relief: ${roofsSeen} roofs over ${ARCHITECTURE_STYLES.reduce((a, s) => a + Object.keys(s.builders).length, 0)} kit builders; ${SMOOTH_BY_NATURE.size} builders with a roof smooth by nature`);
