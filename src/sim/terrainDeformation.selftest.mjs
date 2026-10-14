// The ground a match deforms (docs/DESTRUCTION.md §7): crater and rubble profiles, determinism, the clamps and bucket
// bounds, the contact surface equal to a mesh whose lattice vertices moved by the overlay, and a wrapper that never
// touches its base field.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  RUBBLE_GROW_S, STAMPS_PER_BUCKET, craterProfile, craterWobblePhases, createDeformedHeightField, createTerrainDeformation, stampBounds,
  rubbleFalloffM, rubbleGrowth, rubbleHeightFor, rubbleProfile,
} from './terrainDeformation.ts';
import { createTerrainContactSampler } from '../world/terrainContactSurface.ts';

const near = (actual, expected, eps, label) => assert.ok(Math.abs(actual - expected) <= eps,
  `${label}: ${actual} is not within ${eps} of ${expected}`);

// ---- a rolling base field with an exact contact sampler (the rendered near mesh's lattice)
const baseHeight = (x, z) => 3 + 2 * Math.sin(x * 0.013) * Math.cos(z * 0.017) + 0.4 * Math.sin((x + z) * 0.05);
const up = new Vector3(0, 1, 0);
function makeBase() {
  return {
    getHeightAt: baseHeight,
    getHeightAtFast: baseHeight,
    getContactHeightAt: createTerrainContactSampler(baseHeight),
    getNormalAt: () => up,
    getGroundType: () => 'medium',
    maxY: 6,
    size: 1024,
    _layout: { marker: 'layout' },
    bridgeDecks: [],
  };
}

// ---- profiles
{
  const overlay = createTerrainDeformation();
  assert.equal(overlay.addCrater(10, 20, 2.4, 0.84, 0.29, 0x1234), true);
  const crater = overlay.stamps[0];
  near(craterProfile(crater, 0, 0), -0.84, 1e-3, 'the bowl at the centre (the rim\'s steep inner flank adds nothing there)');
  assert.ok(craterProfile(crater, 2.4, 1.1) > 0.15, 'the rim stands at the radius');
  assert.equal(craterProfile(crater, 2.4 * 2.3, 0.3), 0, 'nothing past the reach');
  // crater round 3: the rim broken round the crater by the seed (0.55–1.45 of it), and broad enough outside that the
  // 1.333 m lattice keeps most of it
  {
    const crests = [];
    for (let a = 0; a < 64; a++) {
      const angle = (a / 64) * Math.PI * 2;
      let top = -Infinity;
      for (let r = 1.5; r <= 3.6; r += 0.01) top = Math.max(top, craterProfile(crater, r, angle));
      crests.push(top);
    }
    const lo = Math.min(...crests), hi = Math.max(...crests);
    assert.ok(lo >= 0.29 * 0.55 - 1e-6 && hi <= 0.29 * 1.45 + 1e-6 && hi - lo > 0.29 * 0.35,
      `the crest's height broken round the crater (${lo.toFixed(3)}..${hi.toFixed(3)} m of a 0.29 m rim)`);
    near(overlay.maxRaiseM, 0.29 * 1.45, 1e-9, 'the ray march ceiling holds the highest crest');
    // the outer flank 0.67 m (half a lattice step) past the crest keeps over half the crest's height
    let kept = Infinity;
    for (let a = 0; a < 64; a++) {
      const angle = (a / 64) * Math.PI * 2;
      let topR = 0, top = -Infinity;
      for (let r = 1.5; r <= 3.6; r += 0.01) { const v = craterProfile(crater, r, angle); if (v > top) { top = v; topR = r; } }
      kept = Math.min(kept, craterProfile(crater, topR + 0.67, angle) / top);
    }
    assert.ok(kept > 0.5, `the flank half a lattice step out keeps ${(kept * 100).toFixed(0)} % of the crest`);
  }
  assert.ok(overlay.offsetAt(10, 20) < -0.8, 'the overlay carries the bowl');
  assert.equal(overlay.offsetAt(10 + 8, 20), 0, 'and nothing 8 m off');
  // rubble: the plateau, the skirt, climbable
  const h = rubbleHeightFor(7);
  near(h, 1.26, 1e-9, 'a 7 m house leaves a 1.26 m heap');
  assert.equal(rubbleHeightFor(40), 2.6, 'capped');
  assert.equal(rubbleHeightFor(1), 0.6, 'floored');
  overlay.addRubble(-100, 50, 5, 4, 0.4, h);
  const rubble = overlay.stamps[1];
  // the crown (2026-10-13, the owner: rubble that does not "end up on a flat 2d plane"): the plateau's top leans and
  // swells, between 0.58 h and h, never past h; another footprint raises another heap
  {
    const tops = [];
    const c = Math.cos(0.4), s = Math.sin(0.4);
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
      const a = (i / 10) * 4 * 0.7, b = (j / 10) * 5 * 0.7;
      tops.push(rubbleProfile(rubble, -100 + b * c + a * s, 50 - b * s + a * c));
    }
    const lo = Math.min(...tops), hi = Math.max(...tops);
    assert.ok(hi <= h + 1e-9 && lo >= 0.58 * h - 1e-9, `the crown stays within 0.58-1 of the heap's height (${(lo / h).toFixed(2)}-${(hi / h).toFixed(2)})`);
    assert.ok(hi - lo > 0.2 * h, `and is not level (${(hi - lo).toFixed(2)} m between its high and low points)`);
    const other = createTerrainDeformation();
    other.addRubble(-60, 50, 5, 4, 0.4, h);
    let differs = 0;
    for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
      const a = (i / 10) * 4 * 0.7, b = (j / 10) * 5 * 0.7;
      differs = Math.max(differs, Math.abs(rubbleProfile(rubble, -100 + b * c + a * s, 50 - b * s + a * c)
        - rubbleProfile(other.stamps[0], -60 + b * c + a * s, 50 - b * s + a * c)));
    }
    assert.ok(differs > 0.1 * h, `two heaps of one footprint in two places differ (${differs.toFixed(2)} m)`);
  }
  const falloff = rubbleFalloffM(5, 4, h);
  near(falloff, 0.3 * 4 + 3, 1e-9, 'the skirt: 0.3 of the shorter half extent plus max(3, 2.2 h)');
  // the steepest grade across the skirt, sampled outward from the plateau's edge along the footprint's across axis
  const c = Math.cos(0.4), s = Math.sin(0.4);
  let steepest = 0;
  for (let t = 0; t < falloff + 0.5; t += 0.05) {
    const d = 5 * 0.7 + t;
    const a = rubbleProfile(rubble, -100 + c * d, 50 - s * d);
    const b = rubbleProfile(rubble, -100 + c * (d + 0.05), 50 - s * (d + 0.05));
    steepest = Math.max(steepest, Math.abs(b - a) / 0.05);
  }
  assert.ok(steepest < 0.5, `every hull climbs the heap (steepest grade ${steepest.toFixed(3)})`);
  near(rubbleProfile(rubble, -100 + c * (5 * 0.7 + falloff + 0.01), 50 - s * (5 * 0.7 + falloff + 0.01)), 0, 1e-9, 'flat past the skirt');
  assert.ok(overlay.maxRaiseM >= h, 'the ray march ceiling rises with the heap');
}

// ---- determinism: the same stamps in the same order give the same bits
{
  const build = () => {
    const overlay = createTerrainDeformation();
    overlay.addCrater(3.3, -7.1, 2.1, 0.7, 0.25, 77);
    overlay.addRubble(5, -4, 4, 6, 1.2, 1.4);
    overlay.addCrater(4.1, -6.2, 1.8, 0.6, 0.2, 911);
    return overlay;
  };
  const a = build(), b = build();
  const bytes = (overlay) => {
    const out = new Float64Array(41 * 41);
    for (let i = 0; i < 41; i++) for (let j = 0; j < 41; j++) out[i * 41 + j] = overlay.contactOffsetAt(-10 + i * 0.6, -16 + j * 0.6) + overlay.offsetAt(-10 + i * 0.6, -16 + j * 0.6);
    return Buffer.from(out.buffer).toString('base64');
  };
  assert.equal(bytes(a), bytes(b), 'same stamps, same bits');
  assert.equal(a.revision, 3);
}

// ---- clamps and bucket bounds
{
  const overlay = createTerrainDeformation();
  let admitted = 0;
  for (let i = 0; i < STAMPS_PER_BUCKET + 4; i++) if (overlay.addCrater(200, 200, 2, 1.5, 0.2, i)) admitted++;
  assert.equal(admitted, STAMPS_PER_BUCKET, 'a pit under repeated fire stops deepening at the bucket bound');
  assert.ok(overlay.offsetAt(200, 200) >= -2.5, 'and never sinks past 2.5 m');
  overlay.addRubble(200, 200, 6, 6, 0, 2.6);
  assert.ok(overlay.stamps.at(-1).kind === 'rubble', 'a heap always lands, even on a full bucket');
  assert.equal(overlay.addCrater(0, 0, 0, 1, 1, 1), false, 'a crater of no radius is refused');
  overlay.reset();
  assert.equal(overlay.stamps.length, 0);
  assert.equal(overlay.offsetAt(200, 200), 0, 'a reset leaves flat ground');
  assert.equal(overlay.maxRaiseM, 0);
}

// ---- the contact surface: exactly a mesh whose lattice vertices moved by the overlay
{
  const base = makeBase();
  const overlay = createTerrainDeformation();
  overlay.addCrater(12.3, -40.7, 3.4, 1.2, 0.41, 4242);
  overlay.addRubble(30, -30, 6, 9, 0.7, 2.0);
  const field = createDeformedHeightField(base, overlay);
  // the reference: a contact sampler over (base + overlay) built from scratch, the surface a deformed mesh carries
  const reference = createTerrainContactSampler((x, z) => baseHeight(x, z) + overlay.offsetAt(x, z));
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const x = 5 + (i % 20) * 1.9 + 0.123, z = -55 + Math.floor(i / 20) * 2.1 + 0.071;
    worst = Math.max(worst, Math.abs(field.getContactHeightAt(x, z) - reference(x, z)));
  }
  assert.ok(worst < 1e-5, `the contact surface matches a deformed mesh (worst ${worst.toExponential(2)} m)`);
  near(field.getHeightAt(12.3, -40.7), baseHeight(12.3, -40.7) + overlay.offsetAt(12.3, -40.7), 1e-12, 'heights add the overlay');
  near(field.getHeightAtFast(12.3, -40.7), baseHeight(12.3, -40.7) + overlay.offsetAt(12.3, -40.7), 1e-12, 'fast heights too');
  const normal = field.getNormalAt(12.3 + 2.4, -40.7);
  assert.ok(normal.x < -0.05, `the crater wall leans the normal inward (${normal.x.toFixed(3)})`);
  assert.equal(field.getNormalAt(400, 400), up, 'far from every stamp the base normal answers');
  // the wrapper reads through and never writes its base
  assert.equal(field._layout.marker, 'layout');
  assert.equal(field.getGroundType(0, 0), 'medium');
  assert.equal(field.maxY, 6 + overlay.maxRaiseM);
  assert.equal(base.getHeightAt, baseHeight, 'the base field keeps its own functions');
  assert.equal(Object.keys(base).includes('stamps'), false);
  const other = createDeformedHeightField(base, createTerrainDeformation());
  near(other.getHeightAt(12.3, -40.7), baseHeight(12.3, -40.7), 1e-12, 'another match on the same base sees no stamp');
}

// ---- the wobble the presentation's decal edge follows is the stamp's own
{
  const overlay = createTerrainDeformation();
  overlay.addCrater(5, 5, 2.4, 0.8, 0.3, 40321);
  const [stamp] = overlay.stamps;
  assert.deepEqual(craterWobblePhases(40321), [stamp.p1, stamp.p2, stamp.p3]);
}

// ---- the bounds a renderer re-reads: nothing moves outside them
{
  const overlay = createTerrainDeformation();
  overlay.addCrater(30, -40, 3.4, 1.2, 0.4, 777);
  overlay.addRubble(-60, 25, 5, 7, 0.6, 2);
  for (const stamp of overlay.stamps) {
    const [x0, z0, x1, z1] = stampBounds(stamp, [0, 0, 0, 0]);
    for (let k = 0; k < 400; k++) {
      const a = k * 2.399963, r = 1 + (k % 40) * 0.6;
      const x = (x0 + x1) / 2 + Math.cos(a) * r * (x1 - x0) / 2, z = (z0 + z1) / 2 + Math.sin(a) * r * (z1 - z0) / 2;
      if (x < x0 || x > x1 || z < z0 || z > z1) {
        const only = createTerrainDeformation();
        if (stamp.kind === 'crater') only.addCrater(stamp.x, stamp.z, stamp.radiusM, stamp.depthM, stamp.rimM, stamp.seed);
        else only.addRubble(stamp.cx, stamp.cz, stamp.hw, stamp.hd, stamp.yaw, stamp.heightM);
        assert.equal(only.offsetAt(x, z), 0, `${stamp.kind} moves nothing outside its bounds (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
    }
  }
}

// a heap rises on the overlay's clock (physics stream, 2026-10-13; the census: a hull rammed into a falling building was
// lifted 0.38 m in a step by the heap stamped whole under it): eased over RUBBLE_GROW_S, never faster than its height's
// share a step; with no clock set (a consumer that never steps one) or settled, it stands risen at once
{
  // (the risen heap's top at its centre: its crown's, under its nominal 2.4 m — a clockless heap stands risen at once)
  const clockless = createTerrainDeformation();
  clockless.addRubble(0, 0, 6, 8, 0.3, 2.4);
  const risenTop = clockless.offsetAt(0, 0);
  assert.ok(risenTop > 1 && risenTop <= 2.4 + 1e-9, `no clock: risen at once, as before (${risenTop.toFixed(3)} m)`);
  const rising = createTerrainDeformation();
  rising.setTime(10);
  rising.addRubble(0, 0, 6, 8, 0.3, 2.4);
  assert.ok(rising.growing, 'a heap stamped on a clock rises');
  near(rising.offsetAt(0, 0), 0, 1e-12, 'nothing at its first instant');
  let prev = 0, steepest = 0, revision = rising.growthRevision;
  for (let tick = 1; tick <= Math.ceil(RUBBLE_GROW_S * 60) + 2; tick++) {
    rising.setTime(10 + tick / 60);
    const h = rising.offsetAt(0, 0);
    assert.ok(h >= prev - 1e-12, 'it only rises');
    steepest = Math.max(steepest, h - prev);
    prev = h;
  }
  near(prev, risenTop, 1e-9, 'risen to its height');
  assert.ok(!rising.growing && rising.growthRevision > revision, 'done, its growth revision moved while it rose');
  assert.ok(steepest <= 2.4 * 1.5 / (RUBBLE_GROW_S * 60) + 1e-9, `never more than the eased share a step (${(steepest * 100).toFixed(2)} cm)`);
  near(rubbleGrowth(RUBBLE_GROW_S / 2), 0.5, 1e-12, 'half risen at half its time');
  const settled = createTerrainDeformation();
  settled.setTime(10);
  settled.addRubble(0, 0, 6, 8, 0.3, 2.4, -Infinity);
  near(settled.offsetAt(0, 0), risenTop, 1e-9, 'a settled heap (a restored host, a late seat) stands risen');
  assert.ok(!settled.growing, 'and does not rise');
}

console.log('terrainDeformation: crater and rubble profiles (heaps every hull climbs), same stamps same bits, clamps and '
  + 'bucket bounds, the contact surface of a deformed mesh, a wrapper that reads through and never writes its base, '
  + 'heaps rising on the match clock PASS');
