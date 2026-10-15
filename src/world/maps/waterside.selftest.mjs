// waterside.selftest.mjs — #16 r2 (Lane C, 2026-10-14): the waterside family in its members, per coast.
//   - the jetty form of every map that builds one (jettyKit.ts), and per form on a sloping, flooding bed: every support
//     planted 10 cm into the bed under it (a vertical line through its point meets the timber or the masonry at or
//     under its receipt), the deck carried to its top, the deck's extent the old kit's (the moorings and the plans key on
//     it), one merged piece a bucket, the old kit's draws counted (legacyJettyDraws);
//   - the gangway and the riva's stair from the sand to the deck top;
//   - the driftwood stems seated 2 cm into the sand under the kit's pose, the buoys riding the surface on a chain to
//     the bed, the ford markers driven 25 cm, the mooring stake's hitch where the kit ties its line;
//   - the reed dressing reads its culms only (no draw, no ground query) and dresses every region's clumps.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import {
  JETTY_DECK_TOP_OVER_Y, JETTY_HALF_WIDTH_M, buildGangway, buildJetty, buildRivaSteps, jettyFormForMap, legacyJettyDraws,
} from './jettyKit.ts';
import { DRIFT_SEAT_Y, buildDriftLog, buildMooringBuoy, driftCoastForMap, fordMarker, fordStyleForMap, mooringStakeGeometry } from './waterside.ts';
import { dressReedClump, reedFormForMap } from './reedBeds.ts';

// ------------------------------------------------------------------ helpers
/** The lowest and the highest surface a vertical line through (x, z) meets in a list of geometries. */
function column(geometries, x, z) {
  let lo = Infinity, hi = -Infinity;
  for (const g of geometries) {
    const p = g.attributes.position, idx = g.index, n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
      const y = u * p.getY(a) + v * p.getY(b) + w * p.getY(c);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
  }
  return [lo, hi];
}
const finite = (g) => { for (const a of Object.values(g.attributes)) assert.ok(a.array.every(Number.isFinite)); };

// ------------------------------------------------------------------ the forms per map
assert.equal(jettyFormForMap('coastal'), 'estacade');
assert.equal(jettyFormForMap('fjord'), 'brygge');
assert.equal(jettyFormForMap('saltwind'), 'riva');
assert.equal(jettyFormForMap('mangrove'), 'stilts');
for (const id of ['alpine', 'winter', 'whiteout']) assert.equal(jettyFormForMap(id), 'stage');
assert.equal(driftCoastForMap('fjord'), 'nordland'); assert.equal(driftCoastForMap('coastal'), 'breton');
assert.equal(fordStyleForMap('delta'), 'bamboo'); assert.equal(fordStyleForMap('autumn'), 'gauge');
assert.deepEqual(['autumn', 'delta', 'mangrove', 'winter'].map(reedFormForMap), ['phragmites', 'kash', 'nipa', 'frost']);
// the old two-row kit drew a turn and a UV jitter a pile, a UV jitter a deck slab
assert.equal(legacyJettyDraws(7.5), 10 * 5 + 4 * 4);
assert.equal(legacyJettyDraws(15.2), 10 * 9 + 4 * 8);

// ------------------------------------------------------------------ every form on a sloping strand that floods
const slope = 0.12, surface = 0.15;
const ground = {
  getHeightAt: (x, z) => 0.6 - slope * x + 0.02 * Math.sin(z * 3),
  getWaterMaskAt: (x, z) => (ground.getHeightAt(x, z) < surface ? 1 : 0),
  getWaterDepthAt: (x, z) => Math.max(0, surface - ground.getHeightAt(x, z)),
};
const ang = 0.4, dx = Math.cos(ang), dz = Math.sin(ang);
const y = surface + 0.45 - JETTY_DECK_TOP_OVER_Y;
const tris = {};
for (const form of ['estacade', 'stage', 'brygge', 'riva', 'stilts']) {
  for (const len of [7.6, 15.2]) {
    const buckets = { wood: [], stone: [], baked: [] }, receipts = [];
    const x0 = 3, z0 = -2;
    const f = buildJetty(buckets, form, x0, z0, ang, y, len, ground, receipts, -1);
    const n = Math.round(len / 1.9);
    assert.equal(f.spans, n);
    assert.equal(receipts.length, 2 * (n + 1), `${form}: two supports a station`);
    for (const list of Object.values(buckets)) assert.ok(list.length <= 1, `${form}: one merged piece a bucket`);
    const solid = [...buckets.wood, ...buckets.stone];
    for (const [i, r] of receipts.entries()) {
      assert.equal(r.kind, 'jetty-pile');
      assert.ok(Math.abs(r.y - (ground.getHeightAt(r.x, r.z) - 0.10)) < 1e-9, `${form}: the receipt 10 cm into its bed`);
      let lo = Infinity, hi = -Infinity;
      for (const o of [-0.04, 0, 0.04]) {
        const [l, h] = column(solid, r.x + dx * o, r.z + dz * o);
        lo = Math.min(lo, l); hi = Math.max(hi, h);
      }
      assert.ok(lo <= r.y + 2e-6, `${form} ${len}: support ${i} planted (${(lo - r.y).toFixed(4)})`);
      assert.ok(hi >= f.deckTop - 0.1, `${form} ${len}: support ${i} carries the deck (${(hi - f.deckTop).toFixed(3)})`);
    }
    // the deck: the old kit's extent (from 2.5 cm behind the shore end to 2.5 cm past the head, ±0.75 m), its top the
    // caller's y + 0.865
    assert.ok(Math.abs(f.deckTop - (y + JETTY_DECK_TOP_OVER_Y)) < 1e-12);
    assert.deepEqual([f.deck.minT, f.deck.maxT, f.deck.minS, f.deck.maxS], [-0.025, f.end + 0.025, -JETTY_HALF_WIDTH_M, JETTY_HALF_WIDTH_M]);
    let decked = 0, samples = 0;
    for (let t = 0; t <= f.end; t += 0.37) for (const s of [-0.5, 0.1, 0.55]) {
      const [, h] = column(solid, x0 + dx * t - dz * s, z0 + dz * t + dx * s);
      samples++;
      if (h >= f.deckTop - 0.005 && h <= f.deckTop + 0.6) decked++;
    }
    // (a line down a board's gap meets the stringer under it: the boards' gaps are at most a fifth of the deck)
    assert.ok(decked / samples > 0.75, `${form}: the deck is walkable (${decked}/${samples})`);
    for (const list of Object.values(buckets)) for (const g of list) { finite(g); assert.ok(g.userData.jetty === form); }
    // tide: a form standing in the sea carries its weed (the stage on a frozen lake does not; the brygge's piles do)
    if (form !== 'stage') assert.ok(buckets.baked.length === 1, `${form}: the weed and barnacles, or the iron`);
    let t = 0;
    for (const list of Object.values(buckets)) for (const g of list) t += g.index.count / 3;
    tris[`${form}/${n}`] = t;
    for (const list of Object.values(buckets)) for (const g of list) g.dispose();
  }
}
// bounded: about two thousand triangles for a 15 m timber jetty, five for a riva or a crib pier
for (const [key, t] of Object.entries(tris)) assert.ok(t <= (key.startsWith('riva') || key.startsWith('brygge') ? 6000 : 3500), `${key}: ${t} triangles`);
// the same seat builds the same jetty (its own stream keyed on the seat)
{
  const a = { wood: [], stone: [], baked: [] }, b = { wood: [], stone: [], baked: [] };
  buildJetty(a, 'estacade', 3, -2, ang, y, 7.6, ground, null);
  buildJetty(b, 'estacade', 3, -2, ang, y, 7.6, ground, null);
  assert.deepEqual([...a.wood[0].attributes.position.array], [...b.wood[0].attributes.position.array]);
}

// ------------------------------------------------------------------ the gangway and the riva's stair
{
  const flat = { getHeightAt: (x) => (x < 0 ? 0 : -0.6) };
  const wood = [], stone = [];
  const g = buildGangway(wood, 0, 0, 0, 0, 0.75, 2.6), st = buildRivaSteps(stone, 0, 0, 0, flat, 0, 0.75, 2.6);
  for (const piece of [g, st]) { piece.computeBoundingBox(); finite(piece); }
  assert.ok(Math.abs(g.boundingBox.max.y - (0.75 + 0.95 - 0.045 + 0.035)) < 0.05, 'the handrails over the treads');
  assert.ok(g.boundingBox.min.y < -0.1, 'the stringers set into the sand');
  assert.ok(Math.abs(st.boundingBox.max.y - 0.75) < 1e-6 && st.boundingBox.min.y <= -0.1 + 1e-9, 'the stair from under the sand to the deck top');
  const [, treadTop] = column([g], -1.3, 0);
  assert.ok(treadTop > 0.25 && treadTop < 0.5, 'a tread halfway up the gangway');
}

// ------------------------------------------------------------------ driftwood, buoys, ford markers, the stake
for (const coast of ['breton', 'nordland']) for (const v of [[0.1, 0.2, 0.3, 0.4], [0.5, 0.9, 0.1, 0.6], [0.9, 0.5, 0.8, 0.2]]) {
  const log = buildDriftLog(coast, 3, 0.11, v);
  finite(log);
  assert.ok(log.attributes.color, 'painted');
  log.computeBoundingBox();
  // the stem's lowest point lies at the seat (2 cm into the sand under the kit's 0.12 / 0.03 pose); a root plate deeper
  assert.ok(log.boundingBox.min.y <= DRIFT_SEAT_Y + 1e-6, `${coast}: seated`);
  const [lo] = column([log], 0.3, 0);
  assert.ok(lo > DRIFT_SEAT_Y - 0.12 && lo < 0.05, `${coast}: the stem lies along the sand (${lo.toFixed(3)})`);
  log.dispose();
}
for (const coast of ['breton', 'nordland']) {
  const r = 0.38, buoy = buildMooringBuoy(coast, r, [0.3, 0.6, 0.5, 0.5], 4, 0.2, -1.6, -3);
  finite(buoy);
  buoy.computeBoundingBox();
  assert.ok(buoy.boundingBox.max.y > 0.2 + 0.4 * r && buoy.boundingBox.max.y < 0.2 + 1.3 * r, `${coast}: the float rides the surface`);
  assert.ok(buoy.boundingBox.min.y <= -1.6 + 0.05, `${coast}: its chain reaches the bed`);
  buoy.dispose();
}
for (const style of ['gauge', 'bamboo']) {
  const m = fordMarker(style, 2, 1, -4, [0.2, 0.5, 0.5, 0.5, 0.1]);
  finite(m);
  m.computeBoundingBox();
  assert.ok(Math.abs(m.boundingBox.min.y - (1 - 0.25)) < 0.02, `${style}: driven 25 cm`);
  assert.ok(m.boundingBox.max.y > 1 + 1.4, `${style}: stands over the ford`);
  m.dispose();
}
{
  const stake = mooringStakeGeometry();
  stake.computeBoundingBox();
  assert.ok(Math.abs(stake.boundingBox.min.y + 0.35) < 0.01 && Math.abs(stake.boundingBox.max.y - 0.375) < 0.01, 'the old stake\'s 0.7 m');
  assert.deepEqual(Object.keys(stake.attributes).sort(), ['normal', 'position', 'uv'], 'the timber bucket\'s streams');
  stake.dispose();
}

// ------------------------------------------------------------------ the reeds: the kit's own clump, dressed
{
  const kitUrl = new URL('./mapKits.ts', import.meta.url);
  const text = readFileSync(kitUrl, 'utf8') + '\nexport const probeReed = (b, r, f, x, z) => reedClump(b, r, f, x, z);';
  const url = `${kitUrl.href}?waterside-reeds`;
  const hook = registerHooks({ load(target, context, next) {
    const result = next(target, context);
    return target === url ? { ...result, source: text } : result;
  } });
  let kit;
  try { kit = await import(url); } finally { hook.deregister(); }
  for (const form of ['phragmites', 'kash', 'nipa', 'frost']) for (const seed of [3, 17, 91]) {
    let s = seed, draws = 0;
    const rng = () => { draws++; s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
    let queries = 0;
    const field = { getHeightAt: (x, z) => { queries++; return 0.3 * x - 0.1 * z; } };
    const b = { straw: [], baked: [] };
    kit.probeReed(b, rng, field, 5, 7);
    const [d0, q0] = [draws, queries];
    dressReedClump(form, b.straw, 0, b.baked);
    assert.deepEqual([draws, queries], [d0, q0], `${form}: the dressing draws nothing and asks the ground nothing`);
    assert.equal(b.baked.length, 1, `${form}: one painted piece a clump`);
    const g = b.baked[0];
    finite(g);
    assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'uv'], 'the painted bucket\'s streams');
    for (let i = 0; i < g.attributes.normal.count; i++) {
      assert.ok(Math.hypot(g.attributes.normal.getX(i), g.attributes.normal.getY(i), g.attributes.normal.getZ(i)) > 0.5, `${form}: lit (no cancelled normal)`);
    }
    for (const list of Object.values(b)) for (const piece of list) piece.dispose();
  }
  // a kit without a painted bucket keeps the bare culms
  const b = { straw: [] };
  let s = 5;
  kit.probeReed(b, () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; }, { getHeightAt: () => 0 }, 0, 0);
  dressReedClump('kash', b.straw, 0, undefined);
  for (const g of b.straw) g.dispose();
}
console.log(`waterside.selftest: five jetty forms planted and decked (${Object.entries(tris).map(([k, t]) => `${k} ${t}`).join(', ')} triangles), gangway and stair, driftwood, buoys, ford markers, stake, four reed regions`);
