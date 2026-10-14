// studio-snow-contact.selftest — media wave f1's "hulls hover: no contact shadow under the tracks" on the snow maps
// (the engine-cs lane, 2026-10-14; the worst takes s125 Frosthollow and s164 Whiteout: "no contact shadow or snow
// displacement under its tracks, bright snow shows beneath them").
//
// 1. The solve is not the cause. The two takes' heroes are replayed on the Studio's own support (tools/studio-contact-gap.mjs:
//    conformStudioActor over the structure support, the timeline's 60 Hz grid, the wheels on the Studio's ground sampler)
//    from their scenes' first keys (the Borsuk at 13 m/s across Frosthollow's village road, the CV90-105 climbing a
//    Whiteout slope pitched 14°): at 400 ms every bin of each drawn run along its ground run stands within 4 cm of the
//    RENDERED ground (heightField.getContactHeightAt).
// 2. The renderer was. On the same built hulls (measureVehicleGroundHull) the ground occlusion's ordinary joint cap
//    (round 4's 0.35) leaves the snow under a belly 0.65 of its sky; on snowy terrain (contact r2: the snow cover each
//    receiver's scene alpha carries, sceneAlpha.ts) the cap lifts (the belly keeps 0.2, about the geometry's own share) and
//    the run's foot stands in a groove (round 4's core, wider and over the rim's vertical reach), while bare ground keeps
//    the ordinary law exactly.
import assert from 'node:assert/strict';
import { installCanvasFixture } from '../src/vehicles/canvasFixture.test-support.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { createTank } from '../src/vehicles/tankFactory.ts';
import {
  GROUND_AO_OCC_MAX, GROUND_AO_OCC_MAX_SNOW, combineVehicleGroundOcclusion, contactCoreOcclusion, createVehicleGroundOcclusionUniforms,
  groundOcclusionCap, groundWallSoft, measureVehicleGroundHull, updateVehicleGroundOcclusionUniforms, vehicleGroundOcclusionLocal,
  vehicleGroundStrengths,
} from '../src/engine/vehicleGroundOcclusion.ts';
import { decodeSceneSnow, encodeSceneAlpha } from '../src/engine/sceneAlpha.ts';
import { replayStudioActorGaps } from './studio-contact-gap.mjs';

// the scenes' first keys (shots/media-r5 site50 renders-fleet, cinema receipts of 2026-10-13)
const TAKES = [
  { take: 's125-borsuk-winter', map: 'winter', actor: { id: 'borsuk', name: 'hero', pos: [-45.186, -17.718], facingDeg: 61.982, camoSeed: 5775 },
    keys: [[0, -45.186, -17.718, 61.982], [110, -43.73, -16.942, 61.887], [220, -42.275, -16.163, 61.803], [330, -40.822, -15.383, 61.77],
      [440, -39.368, -14.602, 61.788]] },
  { take: 's164-cv90105-tml-x-whiteout', map: 'whiteout', actor: { id: 'cv90105_tml_x', name: 'hero', pos: [50.878, -186.925], facingDeg: -22.689, camoSeed: 6048 },
    keys: [[0, 50.878, -186.925, -22.689], [110, 50.235, -185.405, -23.453], [220, 49.566, -183.897, -24.307], [330, 48.878, -182.397, -24.98],
      [440, 48.174, -180.905, -25.476]] },
];
const BIN_LIMIT_CM = 4;
const rows = [];

// ---- 1. the support solve seats both heroes on the rendered snow
for (const t of TAKES) {
  const keys = t.keys.map(([tMs, x, z, facingDeg], i) => ({ id: `k${i}`, tMs, pos: [x, z], facingDeg, turretDeg: 0, gunDeg: 1, transition: 'linear' }));
  const { samples: [s] } = await replayStudioActorGaps({ map: t.map, actor: t.actor, keys, times: [400] });
  assert.ok(s.vertices > 1000, `${t.take}: the running gear measured (${s.vertices} vertices)`);
  for (const side of ['left', 'right']) {
    // the eight bins along the ground run (the end bins hold the wraps, which rise off the ground by design)
    const run = s[side].binsCm.slice(1, 9);
    assert.ok(run.every((g) => Math.abs(g) <= BIN_LIMIT_CM), `${t.take} ${side}: the drawn run stands on the rendered ground (${run.join(', ')} cm)`);
  }
  rows.push(`${t.take} pitch ${s.pitchDeg}°, runs ${s.left.minCm}/${s.right.minCm} cm (bins within ±${BIN_LIMIT_CM} cm)`);
}

// ---- 2. the ground occlusion on the same hulls: the snow under a belly and at a face, the ordinary law against the snow's
installCanvasFixture();
const SNOW = 0.799; // Frosthollow's lever 0xe5e7ec in luminance (Whiteout spreads Frosthollow's sky)
// (contact r2) the law is on in every frame; a receiver weighs it by the snow cover its own alpha carries — the snow the
// takes' heroes stand on (the terrain's whole cover) is weight 1, bare ground 0
const u = createVehicleGroundOcclusionUniforms();
updateVehicleGroundOcclusionUniforms(u, [], true, SNOW);
assert.equal(u.uVehGroundSnow.value, 1, 'the snow law on');
const SNOW_W = u.uVehGroundSnow.value * decodeSceneSnow(encodeSceneAlpha(0.5, 1));
const BARE_W = u.uVehGroundSnow.value * decodeSceneSnow(encodeSceneAlpha(0.5, 0));
assert.equal(SNOW_W, 1, 'snowy terrain: the whole law'); assert.equal(BARE_W, 0, 'bare ground: the ordinary law');
const UP = { x: 0, y: 1, z: 0 };
for (const t of TAKES) {
  await ensureAuthorityFleet([t.actor.id]);
  const visual = createTank(t.actor.id, null, { proceduralOnly: true, quality: 'high' });
  visual.root.updateMatrixWorld(true);
  const h = measureVehicleGroundHull(visual.root);
  assert.ok(h, `${t.take}: the hull measured`);
  // overcast and clear: whiteout's deck (sun over sky 0.2) and a clear Frosthollow day (0.65)
  for (const k of [0.2, 0.65]) {
    const strengths = vehicleGroundStrengths(SNOW, k);
    // the GLSL's law on a lit receiver of snow weight w: the softening, the core (its groove) and the cap by it
    const kept = (x, z, w, st = strengths) => {
      const q = { x, y: 0, z };
      return 1 - combineVehicleGroundOcclusion([vehicleGroundOcclusionLocal(q, UP, h, st, false, null, groundWallSoft(w))], 10,
        contactCoreOcclusion(q, h, null, 1, w), groundOcclusionCap(w));
    };
    const zMid = 0.5 * (h.cz0 + h.cz1);
    const points = {
      belly: [0, zMid], gap: [h.xi - 0.15, zMid], face: [h.xo + 0.01, zMid], groove: [h.xo + 0.05, zMid], out30: [h.xo + 0.3, zMid],
      out100: [h.xo + 1.0, zMid],
    };
    const before = Object.fromEntries(Object.entries(points).map(([n, [x, z]]) => [n, kept(x, z, BARE_W)]));
    const after = Object.fromEntries(Object.entries(points).map(([n, [x, z]]) => [n, kept(x, z, SNOW_W)]));
    const r3 = (n) => before[n].toFixed(2), now = (n) => after[n].toFixed(2);
    if (process.env.COT_SNOW_CONTACT_PRINT) console.log(t.take, k, JSON.stringify({ before, after }));
    assert.ok(Math.abs(before.belly - (1 - GROUND_AO_OCC_MAX)) < 1e-9, `${t.take}: the ordinary law keeps the cap's ${(1 - GROUND_AO_OCC_MAX).toFixed(2)} under the belly`);
    assert.ok(Math.abs(after.belly - (1 - GROUND_AO_OCC_MAX_SNOW)) < 1e-9 && after.gap <= 0.25,
      `${t.take} k ${k}: the snow under the belly reads shaded (${now('belly')}, between the runs ${now('gap')})`);
    assert.ok(after.face <= 0.26 && after.groove < before.groove - 0.1,
      `${t.take} k ${k}: a dark line at the run's foot, a groove 5 cm out (${now('face')}, ${now('groove')}; ordinary ${r3('face')}, ${r3('groove')})`);
    assert.ok(after.face >= 0.2 && after.belly >= 0.14, `${t.take} k ${k}: never black`);
    assert.ok(after.out30 > after.groove && after.out100 >= after.out30 - 0.02, `${t.take} k ${k}: lighter away from the run (no band)`);
    rows.push(`${t.actor.id} k ${k}: belly ${r3('belly')}→${now('belly')}, between the runs ${r3('gap')}→${now('gap')}, face ${r3('face')}→${now('face')}, 5 cm out ${r3('groove')}→${now('groove')}, 0.3 m out ${now('out30')}`);
    // ordinary ground: the same hull, the same points, weight 0 — the round-4/5 law (its cap, its core, its softening) to the bit
    const ordinary = vehicleGroundStrengths(0.25, k);
    for (const [x, z] of Object.values(points)) {
      const q = { x, y: 0, z }, occ = vehicleGroundOcclusionLocal(q, UP, h, ordinary);
      assert.equal(1 - kept(x, z, BARE_W, ordinary), combineVehicleGroundOcclusion([occ], 10, contactCoreOcclusion(q, h)),
        `${t.take}: ordinary ground unchanged at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
  visual.dispose?.();
}
console.log(`studio-snow-contact.selftest: the support seats the snow takes' heroes on the rendered ground (${rows.slice(0, 2).join('; ')}); the snow's ground occlusion, kept light ordinary → snow (${rows.slice(2).join('; ')}); ordinary ground the round-4/5 law's PASS`);
