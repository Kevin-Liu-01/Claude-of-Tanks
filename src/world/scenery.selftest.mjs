// The scenery lane (2026-10-03): the rock forms, the landmark kit and the composer that places them.
//
//   1. every rock form builds closed, finite, welded-then-split geometry with the attributes the props rock material
//      reads (position, normal, colour, aRockGround, uv), inside its triangle budget on both tiers, deterministically;
//      standing forms publish a convex collision mass, pavements and scree none (they lie under a hull's step); a
//      hill's bedrock rings only the flanks no hull climbs, faces outward and publishes no mass;
//   2. the kit's destructible landmarks keep their collision inside their visible geometry and certify like every
//      other small item, and the config-only footprints (sceneryPlan.ts) equal the kit's radii; the sandbag stacks
//      fill the sourced models' envelopes and certify the same way;
//   3. the composer admits a feature only inside the square, off the pads, out of the road core, out of the water and
//      off the hard solids, says why it refused, appends static masses, and draws only its own streams; the field
//      boundaries' walls and banks stand on the land use's lines only;
//   4. every map that authors scenery places all of it on its real ground (a headless props build), its standing
//      masses reach the collision lists, and no tree stands inside one; on the maps with field works (Saltwind,
//      Saltmere) no wall or bank stands inside an apron (the hardstands and runways, the yards' dressing), an
//      objective disc (every mode's, as the match placement places them on this world, and the authored targets), a
//      spawn pad, a road or a bridge with its approaches, and none stands taller than 1.05 m;
//   5. props.ts and vegetation.ts carry the pass, the late field works, the field walls' own rubble print (pool, posts
//      and masonry tint on it, never on the house masonry), the mud walls' own worn render, the walls' feet, drifts
//      and snow loads, the turned modules, and the keep-out (source pins).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { buildBedrock, buildRockFormation } from './sceneryRocks.ts';
import {
  SANDBAG_WEAVE_UV, SCENERY_DESTRUCTIBLE_TYPES, buildConductor, buildPylon, buildSandbagBedding, buildSandbagHeap, buildSandbagStack, paintBurlap,
  sandbagBag,
} from './maps/sceneryKit.ts';
import {
  BEDROCK_TREE_CLEAR, LANDMARK_RADIUS, STONE_LANDMARKS, isDestructibleLandmark, isStoneLandmark, pylonLegHalf, rockReach,
  sceneryClearances, withGroundCoverHoles,
} from './sceneryPlan.ts';
import { composeScenery } from './scenery.ts';
import { buildFieldWorks } from './fieldWorks.ts';
import { certifyStructureCollisionProfile, deriveRuntimeStructureCollisionProfile } from './structureCollision.ts';
import { collisionFootprintContainsPoint } from './collision.ts';

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------- 1. the rock forms

const slope = { getHeightAt: (x, z) => 2 + 0.05 * x - 0.02 * z + Math.sin(z * 0.07) * 0.8 };
const noise = new SimplexNoise({ random: mulberry32(4242) });
const FORMS = [
  // form, geology, radius, height, desktop triangle cap, mobile cap, standing
  ['tor', 'granite', 7, 5.5, 9000, 3000, true],
  ['outcrop', 'sandstone', 8, 4.5, 3000, 1600, true],
  ['outcrop', 'limestone', 7, 3.2, 3000, 1600, true],
  ['crag', 'slate', 6, 5, 4500, 2200, true],
  ['pavement', 'limestone', 15, 0, 5000, 2600, false],
  ['scree', 'slate', 10, 0, 3500, 1500, false],
  ['menhir', 'granite', 1.2, 4.5, 1200, 500, true],
  ['cairn', 'limestone', 4.2, 2.6, 6000, 1400, true],
  ['calvary', 'granite', 1.6, 5.6, 1200, 400, true],
  ['hoodoo', 'sandstone', 3.2, 6, 3000, 1500, true],
];
for (const [form, geology, radius, height, capDesktop, capMobile, standing] of FORMS) {
  for (const mobile of [false, true]) {
    const spec = { form, geology, x: 30, z: -20, radius, height, yawDeg: 25 };
    const a = buildRockFormation(spec, slope, noise, mulberry32(77), { mobile });
    const b = buildRockFormation(spec, slope, noise, mulberry32(77), { mobile });
    const label = `${geology} ${form}${mobile ? ' (mobile)' : ''}`;
    assert.ok(a.geometry, `${label}: builds`);
    const g = a.geometry;
    for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(g.attributes[name], `${label}: carries ${name}`);
    assert.equal(g.index, null, `${label}: non-indexed (per-corner cleavage normals)`);
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
    assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite) && c.every(Number.isFinite), `${label}: finite`);
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
      assert.ok(Math.abs(len - 1) < 1e-3, `${label}: unit normals`);
    }
    assert.ok(c.every((v) => v >= 0 && v <= 1), `${label}: colour in gamut`);
    assert.ok(a.triangles <= (mobile ? capMobile : capDesktop), `${label}: ${a.triangles} triangles within ${mobile ? capMobile : capDesktop}`);
    assert.deepEqual(Array.from(b.geometry.attributes.position.array), Array.from(p), `${label}: deterministic on its stream`);
    if (standing) {
      assert.equal(a.masses.length, 1, `${label}: one standing mass`);
      const mass = a.masses[0];
      assert.ok(mass.points.length >= 6 && mass.y1 > mass.y0, `${label}: a convex hull with height`);
      // the hull is counter-clockwise and convex
      let sign = 0;
      for (let i = 0; i < mass.points.length; i += 2) {
        const j = (i + 2) % mass.points.length, k = (i + 4) % mass.points.length;
        const cross = (mass.points[j] - mass.points[i]) * (mass.points[k + 1] - mass.points[j + 1]) - (mass.points[j + 1] - mass.points[i + 1]) * (mass.points[k] - mass.points[j]);
        if (Math.abs(cross) < 1e-9) continue;
        if (!sign) sign = Math.sign(cross);
        assert.equal(Math.sign(cross), sign, `${label}: convex hull`);
      }
      assert.ok(sign > 0, `${label}: counter-clockwise hull`);
    } else {
      assert.equal(a.masses.length, 0, `${label}: lies flat under a hull's step (no mass)`);
    }
    a.geometry.dispose(); b.geometry.dispose();
  }
}
// a tor reaches its authored height within a fifth; a pavement's clints stay under a hull's step
{
  const tor = buildRockFormation({ form: 'tor', geology: 'granite', x: 0, z: 0, radius: 6, height: 5 }, { getHeightAt: () => 0 }, noise, mulberry32(3));
  assert.ok(Math.abs(tor.masses[0].y1 - 5) < 1.0, `the tor stands its 5 m (${tor.masses[0].y1.toFixed(2)})`);
  const pave = buildRockFormation({ form: 'pavement', geology: 'limestone', x: 0, z: 0, radius: 12, height: 0 }, { getHeightAt: () => 0 }, noise, mulberry32(3));
  assert.equal(pave.masses.length, 0, 'a pavement without a scar publishes no mass');
  const top = Math.max(...pave.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));
  assert.ok(top < 0.55, `the clints stay under a hull's 0.55 m step (${top.toFixed(2)})`);
}

// ---------------------------------------------------------------------------------------------- 2. the kit

for (const [kind, meta] of Object.entries(SCENERY_DESTRUCTIBLE_TYPES)) {
  assert.equal(LANDMARK_RADIUS[kind], meta.r, `${kind}: the config-only footprint radius is the kit's`);
  assert.ok(isDestructibleLandmark(kind) && !isStoneLandmark(kind), `${kind}: a destructible landmark`);
  const geometry = meta.build(() => 0.5);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const hw = (box.max.x - box.min.x) / 2, hl = (box.max.z - box.min.z) / 2;
  assert.ok(box.min.y > -0.3 && box.max.y <= meta.h + 0.05, `${kind}: stands on its origin within its record height (${box.max.y.toFixed(2)} <= ${meta.h})`);
  if (meta.shape === 'circle') assert.ok(meta.collisionR <= Math.hypot(hw, hl) + 0.08, `${kind}: round collision inside the visible geometry`);
  else {
    assert.ok(meta.hw <= hw + 0.10, `${kind}: collision width follows the geometry (${meta.hw} vs ${hw.toFixed(2)})`);
    assert.ok(meta.hl <= hl + 0.10, `${kind}: collision length follows the geometry (${meta.hl} vs ${hl.toFixed(2)})`);
  }
  // the textured materials read UVs, the vertex-coloured ones colour
  for (const name of ['wood', 'straw', 'stone', 'fieldStone', 'plaster'].includes(meta.mat) ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color']) {
    assert.ok(geometry.attributes[name], `${kind}: the ${meta.mat} material's ${name}`);
  }
  const buckets = { baked: [meta.build(mulberry32(91))] };
  const profile = deriveRuntimeStructureCollisionProfile(buckets);
  const certification = certifyStructureCollisionProfile(buckets, profile);
  assert.ok(certification.minimumScore > 90, `${kind}: small-item collision certification above 90 (${certification.minimumScore.toFixed(1)})`);
  if (meta.broken) { const broken = meta.broken(() => 0.5); assert.ok(broken.attributes.position.count > 0, `${kind}: a broken state`); broken.dispose(); }
  geometry.dispose();
}
for (const kind of Object.keys(STONE_LANDMARKS)) assert.ok(isStoneLandmark(kind) && !isDestructibleLandmark(kind), `${kind}: a stone landmark`);
// the sandbag stacks: laid in the sourced models' envelopes (their cover stays where it was), certified like every small
// item, the canvas weave's UVs and the bags' colours, varied bag by bag, deterministic, the remnant spends its draws
{
  const ENVELOPES = { sandbagbig: [1.787, 0.438, 1.23], sandbagsmall: [1.304, 0.421, 0.95], sandbagwall: [0.497, 1.477, 0.9] };
  for (const [kind, [hx, hz, top]] of Object.entries(ENVELOPES)) {
    const g = buildSandbagStack(kind), again = buildSandbagStack(kind);
    g.computeBoundingBox();
    const b = g.boundingBox;
    assert.ok(Math.abs(b.max.x - hx) < 0.06 && Math.abs(b.min.x + hx) < 0.06 && Math.abs(b.max.z - hz) < 0.06 && Math.abs(b.min.z + hz) < 0.06,
      `${kind}: fills the sourced envelope's plan (${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} x ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)})`);
    assert.ok(Math.abs(b.max.y - top) < 0.06, `${kind}: stands the sourced height (${b.max.y.toFixed(2)} vs ${top})`);
    for (const name of ['position', 'normal', 'uv', 'color']) assert.ok(g.attributes[name], `${kind}: carries ${name}`);
    assert.deepEqual(Array.from(again.attributes.position.array), Array.from(g.attributes.position.array), `${kind}: deterministic`);
    // (wave 52: closed pillow bags, headers every third course — 6036 / 3340 / 3816 at the redo; the batch-4 stacks were
    // 4064 / 2300 / 2918)
    assert.ok(g.attributes.position.count / 3 < 6500, `${kind}: under 6500 triangles (${g.attributes.position.count / 3})`);
    const col = g.attributes.color.array, tones = new Set();
    for (let i = 0; i < col.length; i += 3 * 44 * 3) tones.add(`${col[i].toFixed(2)},${col[i + 1].toFixed(2)}`);
    assert.ok(tones.size > 8, `${kind}: its bags are not one tone (${tones.size})`);
    const buckets = { baked: [buildSandbagStack(kind)] };
    const profile = deriveRuntimeStructureCollisionProfile(buckets);
    const certification = certifyStructureCollisionProfile(buckets, profile);
    assert.ok(certification.minimumScore > 90, `${kind}: small-item collision certification above 90 (${certification.minimumScore.toFixed(1)})`);
    assert.ok(profile.contact.parts.length <= 64, `${kind}: its contact stays bounded (${profile.contact.parts.length} parts)`);
    // no daylight through it (wave 52): every line of sight square through the stack, below its uneven top course and
    // inside its ends, meets a bag or the stack's core
    {
      const p = g.attributes.position, across = kind === 'sandbagwall' ? 0 : 2, along = 2 - across;
      const tris = p.count / 3, o = new THREE.Vector3(), d = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3();
      const hits = (ray) => {
        for (let t = 0; t < tris; t++) {
          v0.fromBufferAttribute(p, t * 3); v1.fromBufferAttribute(p, t * 3 + 1); v2.fromBufferAttribute(p, t * 3 + 2);
          e1.subVectors(v1, v0); e2.subVectors(v2, v0); pv.crossVectors(ray.d, e2);
          const det = e1.dot(pv);
          if (Math.abs(det) < 1e-12) continue;
          tv.subVectors(ray.o, v0);
          const u = tv.dot(pv) / det;
          if (u < 0 || u > 1) continue;
          qv.crossVectors(tv, e1);
          const v = ray.d.dot(qv) / det;
          if (v < 0 || u + v > 1) continue;
          if (e2.dot(qv) / det > 0) return true;
        }
        return false;
      };
      const extent = { sandbagbig: 1.787, sandbagsmall: 1.304, sandbagwall: 1.477 }[kind];
      let rays = 0, through = 0;
      for (let a = -extent + 0.1; a <= extent - 0.1; a += 0.17) {
        for (let y = 0.04; y <= top - 0.3; y += 0.07) {
          o.set(0, y, 0); o.setComponent(along, a); o.setComponent(across, -3);
          d.set(0, 0, 0); d.setComponent(across, 1);
          rays++;
          if (!hits({ o, d })) through++;
        }
      }
      assert.equal(through, 0, `${kind}: no daylight through the stack (${through} of ${rays} sight lines pass)`);
    }
    let spent = 0;
    const heap = buildSandbagHeap(kind, () => { spent++; });
    assert.equal(spent, 1, `${kind}: the remnant spends the old remnant's draws first`);
    assert.ok(heap.attributes.position.count > 0 && heap.attributes.uv && heap.attributes.color, `${kind}: a breached heap`);
    for (const geometry of [g, again, heap, ...buckets.baked]) geometry.dispose();
  }
}
// one bag (wave 52, "pillow bags", "round log ends"): closed, its section flat-topped and wider than thick, both ends
// drawn in to a squashed lens (never a log end), its weave wrapped round it without stretch, a function of its stream
{
  const rng = (seed) => { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  for (const seam of [1, -1]) {
    const bag = sandbagBag(0.56, 0.18, 0.4, rng(7), { fill: 1, seam }), again = sandbagBag(0.56, 0.18, 0.4, rng(7), { fill: 1, seam });
    assert.deepEqual(Array.from(again.attributes.position.array), Array.from(bag.attributes.position.array), 'a bag is a function of its stream');
    const p = bag.attributes.position, uv = bag.attributes.uv, index = bag.index.array;
    // closed: every edge (welded by position) between exactly two triangles
    const key = (i) => `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`; // (a signed zero welds)
    const edges = new Map();
    for (let t = 0; t < index.length; t += 3) for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const a = key(index[t + i]), b = key(index[t + j]), k = a < b ? a + '|' + b : b + '|' + a;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
    assert.ok([...edges.values()].every((c) => c === 2), 'a loose bag is closed');
    assert.equal(index.length / 3, 80, 'a closed bag is 80 triangles');
    // the section at its middle and at its ends: thick at the middle, a squashed lens at each end
    const span = (pred) => { let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 0; i < p.count; i++) if (pred(p.getX(i) * seam)) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); } return [y1 - y0, z1 - z0]; };
    const [midT, midW] = span((x) => Math.abs(x) < 0.01);
    const [seamT, seamW] = span((x) => x > 0.27);
    const [mouthT, mouthW] = span((x) => x < -0.27);
    assert.ok(midW > midT * 1.8, `flat: wider than thick (${midW.toFixed(2)} x ${midT.toFixed(2)})`);
    assert.ok(seamT < midT * 0.5 && seamW > midW * 0.9, `the seam end a squashed lens across the bag (${seamT.toFixed(3)} x ${seamW.toFixed(3)})`);
    assert.ok(mouthT < midT * 0.65 && mouthW > midW * 0.8, `the folded mouth drawn in, never a log end (${mouthT.toFixed(3)} x ${mouthW.toFixed(3)})`);
    // the weave without stretch: uv area against surface area near the weave's own scale on every body triangle
    let lo = Infinity, hi = 0;
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
      const ax = p.getX(b) - p.getX(a), ay = p.getY(b) - p.getY(a), az = p.getZ(b) - p.getZ(a);
      const bx = p.getX(c) - p.getX(a), by = p.getY(c) - p.getY(a), bz = p.getZ(c) - p.getZ(a);
      const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
      const uArea = Math.abs((uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) - (uv.getX(c) - uv.getX(a)) * (uv.getY(b) - uv.getY(a))) / 2;
      if (Math.abs(p.getX(a)) > 0.18 || Math.abs(p.getX(b)) > 0.18 || Math.abs(p.getX(c)) > 0.18) continue; // the body
      const ratio = uArea / (area * SANDBAG_WEAVE_UV * SANDBAG_WEAVE_UV);
      lo = Math.min(lo, ratio); hi = Math.max(hi, ratio);
    }
    assert.ok(lo > 0.6 && hi < 1.5, `the weave wraps the body without stretch (${lo.toFixed(2)}..${hi.toFixed(2)})`);
    bag.dispose(); again.dispose();
  }
  // a laid bag draws only what its stack shows
  const laid = sandbagBag(0.56, 0.18, 0.4, rng(9), { seam: 1, laid: { from: -45, to: 135, caps: [false, false], whole: [false, false] } });
  assert.equal(laid.index.count / 3, 32, 'a stretcher inside a course: its outer side and its top');
  // the hessian: 32 threads a tile (2.5 mm at the weave uv), deterministic, near-white with the weave's relief
  const cloth = paintBurlap(128), again = paintBurlap(128);
  assert.deepEqual(Array.from(again.lum), Array.from(cloth.lum), 'the hessian is deterministic');
  assert.ok(Math.abs(1 / SANDBAG_WEAVE_UV / 32 - 0.0025) < 1e-6, 'a jute thread every 2.5 mm');
  let mean = 0, sq = 0, hMin = 1, hMax = 0;
  for (let i = 0; i < cloth.lum.length; i++) { mean += cloth.lum[i]; sq += cloth.lum[i] ** 2; hMin = Math.min(hMin, cloth.height[i]); hMax = Math.max(hMax, cloth.height[i]); }
  mean /= cloth.lum.length;
  const sd = Math.sqrt(sq / cloth.lum.length - mean * mean);
  assert.ok(mean > 0.78 && mean < 0.95 && sd > 0.04, `near-white with its weave (mean ${mean.toFixed(2)}, sd ${sd.toFixed(3)})`);
  assert.ok(hMin >= 0 && hMax <= 1.2 && hMax > 0.7, 'the threads stand proud of their gaps');
  // over and under: along a weft row the warp is on top at every other crossing
  const at = (x, y) => cloth.height[y * 128 + x];
  assert.ok(at(2, 2) > at(2, 6) - 1 && at(6, 2) !== at(2, 2), 'crossings alternate');
}
// the nests' bedding (wave 34, "a stacked prop on a bare mound — no berm, trench or spilled sand"): the spoil banked on
// the face toward the threat, two fifths of the stack's height, lower on its inner face; its toe on the ground; a spill
// heaped at an end and the emptied bag by it; in the soil it was given; deterministic, and a few hundred triangles
{
  const flatGround = { getHeightAt: () => 0 }, soil = [0.12, 0.08, 0.05];
  for (const [kind, toward, axis] of [['sandbagbig', [0, 1], 2], ['sandbagsmall', [0, -1], 2], ['sandbagwall', [1, 0], 0]]) {
    const g = buildSandbagBedding(kind, flatGround, 0, 0, 0, 1.2, 0x5bed, soil, false, toward);
    const again = buildSandbagBedding(kind, flatGround, 0, 0, 0, 1.2, 0x5bed, soil, false, toward);
    assert.deepEqual(Array.from(again.attributes.position.array), Array.from(g.attributes.position.array), `${kind}: its bedding is deterministic`);
    for (const name of ['position', 'normal', 'color']) assert.ok(g.attributes[name], `${kind}: its bedding carries ${name}`);
    const p = g.attributes.position, sign = toward[axis === 2 ? 1 : 0];
    let front = 0, back = 0, lowest = Infinity;
    for (let i = 0; i < p.count; i++) {
      const side = (axis === 2 ? p.getZ(i) : p.getX(i)) * sign, y = p.getY(i);
      if (side > 0.3) front = Math.max(front, y); else if (side < -0.3) back = Math.max(back, y);
      lowest = Math.min(lowest, y);
    }
    const H = { sandbagbig: 1.23, sandbagsmall: 0.95, sandbagwall: 0.9 }[kind] * 1.2;
    assert.ok(front > H * 0.3 && front < H * 0.6, `${kind}: the spoil stands a third to three fifths up its outer face (${(front / H).toFixed(2)})`);
    assert.ok(back < front * 0.75, `${kind}: its inner face's bank is lower (${back.toFixed(2)} vs ${front.toFixed(2)})`);
    assert.ok(lowest < 0 && lowest > -0.05, `${kind}: its toes sink into the ground`);
    assert.ok(p.count / 3 < 600, `${kind}: its bedding stays a few hundred triangles (${p.count / 3})`);
    g.dispose(); again.dispose();
  }
}
{
  const pylon = buildPylon(mulberry32(5), 34);
  assert.equal(pylon.legHalf, pylonLegHalf(34), 'the pylon footprint the vegetation reserves is the tower\'s');
  // (the lattice's secondary members and the disc insulator strings, wave 16, cost about a thousand more)
  assert.ok(pylon.geometry.attributes.position.count / 3 < 4600, `a pylon stays under 4600 triangles (${pylon.geometry.attributes.position.count / 3})`);
  assert.ok(pylon.arms.length >= 5, 'the pylon carries its phases and its earth wire');
  const wire = buildConductor(0, 20, 0, 300, 22, 0, 9, 18, 0.045);
  const ys = wire.attributes.position.array.filter((_, i) => i % 3 === 1);
  assert.ok(Math.min(...ys) < 13 && Math.min(...ys) > 10, 'a conductor sags between its towers');
}

// a hill's bedrock: a dome (the terrain's knoll profile) on a plain; the beds start above the highest ground a hull
// climbs (grade 0.9) and never below it, face out of the hill, and carry no mass; the phones draw fewer triangles
{
  const dome = { getHeightAt: (x, z) => {
    const q = Math.hypot(x / 34, z / 30), w = 1 - (q <= 0.12 ? 0 : q >= 1 ? 1 : ((q - 0.12) / 0.88) ** 2 * (3 - 2 * (q - 0.12) / 0.88));
    return 2 + 26 * w * w * (3 - 2 * w);
  } };
  // the highest ground a hull climbs: the outermost point on each ray steeper than 0.9
  let climbTop = -Infinity;
  for (let j = 0; j < 72; j++) {
    const a = j / 72 * Math.PI * 2;
    for (let r = 45; r > 1; r -= 0.25) {
      const h0 = dome.getHeightAt(Math.cos(a) * (r - 0.5), Math.sin(a) * (r - 0.5)), h1 = dome.getHeightAt(Math.cos(a) * (r + 0.5), Math.sin(a) * (r + 0.5));
      if (h0 - h1 > 0.9) { climbTop = Math.max(climbTop, dome.getHeightAt(Math.cos(a) * r, Math.sin(a) * r)); break; }
    }
  }
  const spec = { geology: 'sandstone', x: 0, z: 0, radius: 42 };
  const desk = buildBedrock(spec, dome, noise, mulberry32(91));
  const again = buildBedrock(spec, dome, noise, mulberry32(91));
  const phone = buildBedrock(spec, dome, noise, mulberry32(91), { mobile: true });
  assert.ok(desk.geometry && phone.geometry, 'the dome shows its bedrock on both tiers');
  assert.equal(desk.masses.length, 0, 'bedrock is a skin: no collision mass');
  assert.deepEqual(Array.from(again.geometry.attributes.position.array), Array.from(desk.geometry.attributes.position.array), 'bedrock: deterministic on its stream');
  for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(desk.geometry.attributes[name], `bedrock: carries ${name}`);
  const p = desk.geometry.attributes.position.array, n = desk.geometry.attributes.normal.array;
  assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite), 'bedrock: finite');
  let lowest = Infinity, outward = 0, inward = 0;
  for (let i = 0; i < p.length; i += 3) {
    lowest = Math.min(lowest, p[i + 1]);
    const r = Math.hypot(p[i], p[i + 2]);
    // the beds' faces (steep normals) point out of the hill, none into it (a block's ends face along its run)
    if (r > 4 && Math.abs(n[i + 1]) < 0.5) {
      const d = (n[i] * p[i] + n[i + 2] * p[i + 2]) / r;
      if (d > 0.5) outward++; else if (d < -0.5) inward++;
    }
  }
  assert.ok(lowest > climbTop + 1.2, `bedrock starts above the highest climbable ground (${lowest.toFixed(2)} > ${climbTop.toFixed(2)})`);
  assert.ok(outward > 300 && inward <= outward * 0.02, `bedrock faces out of the hill (${outward} out, ${inward} in)`);
  assert.ok(desk.triangles <= 14000, `bedrock: ${desk.triangles} triangles within 14000`);
  assert.ok(phone.triangles < desk.triangles, `bedrock: the phones draw fewer (${phone.triangles} < ${desk.triangles})`);
  // a plain shows none
  const flat = buildBedrock(spec, { getHeightAt: () => 3 }, noise, mulberry32(91));
  assert.equal(flat.geometry, null, 'a plain has no flank to show rock');
  // on a world with the terrain's bed law (terrain.ts terrainBedWobbleAt) the beds lie on its bedY surfaces: level beds
  // of the skin's own thicknesses, every bench top at its bed's level plus the wobble (a block set a little high or low,
  // ±0.08 m), and lifted with the wobble
  const benchTops = (wobble) => {
    const b = buildBedrock({ ...spec, crown: false }, dome, noise, mulberry32(91), { strata: { wobbleAt: () => wobble } });
    const bp = b.geometry.attributes.position.array, bn = b.geometry.attributes.normal.array, ys = [];
    for (let i = 0; i < bp.length; i += 3) if (bn[i + 1] > 0.97 && Math.hypot(bp[i], bp[i + 2]) > 4) ys.push(bp[i + 1]);
    ys.sort((x, y) => x - y);
    const levels = [];
    for (let i = 0, start = 0; i < ys.length; i++) {
      if (i + 1 < ys.length && ys[i + 1] - ys[i] < 0.12) continue;
      levels.push([ys[start], ys[i]]);
      start = i + 1;
    }
    b.geometry.dispose();
    return levels;
  };
  const still = benchTops(0), raised = benchTops(0.7);
  assert.ok(still.length >= 4 && still.every(([lo, hi]) => hi - lo <= 0.2), `the beds lie level on the bed law (${still.length} bench levels, each within 0.2 m)`);
  const near = (y, set) => set.some(([lo, hi]) => y >= lo - 0.03 && y <= hi + 0.03);
  const followed = still.filter(([lo, hi]) => near((lo + hi) / 2 + 0.7, raised)).length;
  assert.ok(followed >= still.length * 0.8, `the beds move with the terrain's bedY (${followed}/${still.length} levels 0.7 m higher)`);
  // the map's two formations: the skin takes the terrain's multipliers below and above the boundary
  const lower = [1.16, 1.144, 1.12], upper = [1.048, 0.958, 0.934];
  const plain = buildBedrock(spec, dome, noise, mulberry32(91), { strata: { wobbleAt: () => 0.4 } });
  const formed = buildBedrock(spec, dome, noise, mulberry32(91), { strata: { wobbleAt: () => 0.4, formation: { boundaryAt: () => 12, lower, upper } } });
  const pc = plain.geometry.attributes.color.array, fc = formed.geometry.attributes.color.array, fp = formed.geometry.attributes.position.array;
  let below = 0, above = 0;
  for (let i = 0; i < fp.length; i += 3) {
    const bedY = fp[i + 1] - 0.4;
    const want = bedY < 12 - 1.2 ? lower : bedY > 12 + 1.2 ? upper : null;
    if (!want || pc[i] < 0.01) continue;
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(fc[i + c] / pc[i + c] - want[c]) < 1e-3, `formation tint ${want === lower ? 'below' : 'above'} the boundary`);
    if (want === lower) below++; else above++;
  }
  assert.ok(below > 100 && above > 100, `both formations show on the skin (${below} below, ${above} above)`);
  for (const b of [desk, again, phone, plain, formed]) b.geometry.dispose();
}

// ---------------------------------------------------------------------------------------------- 3. the composer

const field = {
  getHeightAt: (x, z) => 0.02 * x,
  getWaterMaskAt: (x, z) => (Math.hypot(x - 200, z) < 40 ? 1 : 0),
  _roadDist: (x, _z) => Math.abs(x - 100),
};
function compose(scenery, solids = [], mobile = false) {
  const obstacles = [...solids], colliders = [], baked = [new THREE.BufferGeometry()], destructibles = [];
  baked[0].setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  baked[0].setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  baked[0].setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  const steps = composeScenery({
    mapId: 'test', scenery, heightField: field, spawns: [{ x: 0, z: -300 }], obstacles, colliders, baked,
    conform: (piece, bucket) => { for (const name of Object.keys(piece.attributes)) if (!bucket[0].attributes[name]) piece.deleteAttribute(name); },
    addDestructible: (kind, x, y, z, yaw, scale) => destructibles.push({ kind, x, y, z, yaw, scale }),
    seed: 2002, mobile,
  });
  let step = steps.next();
  while (!step.done) step = steps.next();
  return { ...step.value, obstacles, colliders, baked, destructibles };
}
{
  const wall = { min: [-55, 0, 45], max: [-45, 3, 55], kind: 'structure' };
  const built = compose({
    rocks: [
      { form: 'tor', geology: 'granite', x: -100, z: 0, radius: 6, height: 5, name: 'free' },
      { form: 'tor', geology: 'granite', x: 98, z: 0, radius: 6, height: 5, name: 'on the road' },
      { form: 'tor', geology: 'granite', x: 200, z: 0, radius: 6, height: 5, name: 'in the lake' },
      { form: 'tor', geology: 'granite', x: 0, z: -290, radius: 6, height: 5, name: 'on the pad' },
      { form: 'tor', geology: 'granite', x: -50, z: 50, radius: 6, height: 5, name: 'in a building' },
      { form: 'tor', geology: 'granite', x: 470, z: 0, radius: 15, height: 5, name: 'past the square' },
      { form: 'pavement', geology: 'limestone', x: -200, z: 100, radius: 12, height: 0, name: 'flat' },
    ],
    landmarks: [
      { kind: 'calvary', x: -150, z: -100, name: 'calvary' },
      { kind: 'bildstock', x: -150, z: 100, yawDeg: 30, name: 'shrine' },
      { kind: 'windpump', x: 101, z: 100, name: 'pump on the road' },
    ],
    powerLines: [{ towers: [[-300, 200], [-20, 220]], name: 'line' }],
  }, [wall]);
  const by = Object.fromEntries(built.receipt.features.map((f) => [f.name + (f.family === 'powerLine' ? `@${f.x}` : ''), f]));
  assert.equal(by.free.status, 'placed');
  assert.equal(by['on the road'].reason, 'road');
  assert.equal(by['in the lake'].reason, 'water');
  assert.equal(by['on the pad'].reason, 'spawn pad');
  assert.equal(by['in a building'].reason, 'solid structure');
  assert.equal(by['past the square'].reason, 'outside the square');
  assert.equal(by.flat.status, 'placed');
  assert.equal(by.calvary.status, 'placed');
  assert.equal(by.shrine.status, 'placed');
  assert.equal(by['pump on the road'].reason, 'road');
  assert.equal(by['line@-300'].status, 'placed'); assert.equal(by['line@-20'].status, 'placed');
  assert.deepEqual(built.destructibles.map((d) => d.kind), ['bildstock'], 'the shrine joins the destructible pools');
  assert.equal(built.rockPieces.length, 3, 'one geometry per placed rock formation (tor, pavement, calvary)');
  // the pavement's ground is a hole in the ground cover (no blade grows through a clint); the standing forms seal theirs
  assert.deepEqual(built.receipt.groundCoverHoles.map((h) => [h.x, h.z]), [[-200, 100]], 'the pavement, and only it, is a ground-cover hole');
  const sealed = () => false, holed = withGroundCoverHoles(sealed, built.receipt.groundCoverHoles);
  assert.equal(holed(-200, 0, 100, 0.5, 0.2), true, 'a blade on the pavement is refused');
  assert.equal(holed(-180, 0, 100, 0.5, 0.2), false, 'a blade beyond it grows');
  assert.equal(withGroundCoverHoles(sealed, []), sealed, 'a world without holes keeps its admission');
  // two masses (tor, calvary) + eight pylon legs; the pavement publishes none
  assert.equal(built.receipt.colliders, 2 + 8);
  assert.equal(built.obstacles.length, 1 + 10); assert.equal(built.colliders.length, 10);
  assert.ok(built.obstacles.slice(1).every((r) => !r.crushable && r.shape2), 'static shaped masses');
  assert.ok(built.baked.length >= 3, 'the towers fold into the baked bucket');
  assert.ok(built.baked.slice(1).every((g) => !g.attributes.uv && g.attributes.color), 'baked pieces conformed to the bucket');
  // (wave 48: the conductors are their own ribbons, for the wire material — never a sub-pixel tube in the baked bucket)
  assert.ok(built.wires.length >= 5 && built.wires.every((g) => g.attributes.aWireTangent && g.attributes.aWireRadius),
    `the conductors hand over as wire ribbons (${built.wires.length})`);
  // deterministic and independent of any outer stream: the same config builds the same bytes
  const again = compose({ rocks: [{ form: 'tor', geology: 'granite', x: -100, z: 0, radius: 6, height: 5, name: 'free' }] });
  assert.deepEqual(Array.from(again.rockPieces[0].attributes.position.array), Array.from(built.rockPieces[0].attributes.position.array),
    'a feature draws its own stream: other features do not move it');
}
{
  // the tiers lay the same colliders: the phones get fewer stones and facets, never fewer formations or landmarks
  const scenery = {
    rocks: [{ form: 'tor', geology: 'granite', x: -100, z: 0, radius: 6, height: 5 }],
    rockFields: [{ geology: 'limestone', x: -250, z: 150, radius: 60, count: 6, slopeBias: 0 }],
    landmarks: [{ kind: 'bildstock', x: -150, z: 100 }, { kind: 'menhir', x: -170, z: 60 }],
  };
  const desk = compose(scenery), phone = compose(scenery, [], true);
  assert.equal(phone.receipt.colliders, desk.receipt.colliders, 'the same standing masses on both tiers');
  assert.deepEqual(phone.destructibles, desk.destructibles, 'the same landmarks on both tiers');
  assert.ok(phone.receipt.rockTriangles < desk.receipt.rockTriangles * 0.75, 'the phones draw fewer rock triangles');
}
{
  // the vegetation keep-out covers every feature from the config alone
  const clear = sceneryClearances({
    rocks: [{ form: 'tor', geology: 'granite', x: 10, z: 20, radius: 6, height: 5 }, { form: 'scree', geology: 'slate', x: 0, z: 0, radius: 9, height: 0 }],
    landmarks: [{ kind: 'calvary', x: 50, z: 0 }, { kind: 'windpump', x: -50, z: 0, scale: 1.2 }],
    powerLines: [{ towers: [[100, 100], [300, 100]] }],
  });
  assert.equal(clear.length, 2 + 2 + 2, 'two rocks, two landmarks, two towers (the spans keep their trees: the towers stand over them)');
  const hill = sceneryClearances({ bedrock: [{ geology: 'sandstone', x: 5, z: 6, radius: 40 }] });
  assert.deepEqual(hill.map((c) => [c.x, c.z, c.halfWidth]), [[5, 6, 40 * BEDROCK_TREE_CLEAR]], 'a bedrock hill keeps the trees off its flanks');
  assert.equal(clear[0].halfWidth, rockReach({ form: 'tor', radius: 6 }) + 1.5);
  assert.equal(clear[1].halfWidth, 9, 'a scree fan claims its own ground only');
  assert.ok(Math.abs(clear[3].halfWidth - (2.4 * 1.2 + 1.2)) < 1e-9);
  assert.deepEqual(sceneryClearances(undefined), []);
}

// the field boundaries' works on a synthetic land use (fields 40 x 30 m; a road along z = 75): the dry stone walls
// stand on the field lines and nowhere else — low, off the road and the pad, deterministic, fewer triangles on the
// phones — and a margin system's hedge lines get banks; without the hook nothing is built
{
  const fields = (boundary, hedgeLines) => ({
    getHeightAt: (x) => 2 + 0.01 * x, getNormalAt: () => ({ y: 1 }), getWaterMaskAt: () => 0, _villageMask: () => 0,
    _roadDist: (x, z) => Math.abs(z - 75),
    _landUseAt: (x, z, out) => {
      const u = ((x % 40) + 40) % 40, v = ((z % 30) + 30) % 30, du = Math.min(u, 40 - u), dv = Math.min(v, 30 - v);
      out.active = 1; out.edgeM = Math.min(du, dv); out.boundary = boundary; out.track = 0; out.hedge = hedgeLines && du < 1.2 ? 1 : 0;
      return out;
    },
  });
  const lay = (ground, options) => {
    const steps = buildFieldWorks(ground, noise, { spawns: [{ x: 0, z: -300 }], mobile: false, merged: true, ...options });
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  };
  const walls = lay(fields(3, false), { walls: true, banks: false });
  assert.ok(walls.geometry && walls.receipt.wallM > 20000, `the walls run the field lines (${Math.round(walls.receipt.wallM)} m)`);
  // (b13: the walls draw their own dry stone, so they carry no rock-material ground; fieldWalls.selftest pins the rubble)
  for (const name of ['position', 'normal', 'color', 'uv']) assert.ok(walls.geometry.attributes[name], `field walls: carry ${name}`);
  const p = walls.geometry.attributes.position.array;
  let off = 0, high = 0, onRoad = 0, onPad = 0;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const u = ((x % 40) + 40) % 40, v = ((z % 30) + 30) % 30;
    if (Math.min(u, 40 - u, v, 30 - v) > 0.9) off++;
    if (y - (2 + 0.01 * x) > 1.0) high++;
    if (Math.abs(z - 75) < 4) onRoad++;
    if (Math.hypot(x, z + 300) < 22) onPad++;
  }
  assert.equal(off, 0, 'every wall stands on a field line');
  assert.equal(high, 0, 'a field wall stays under a metre');
  assert.equal(onRoad, 0, 'no wall on the road or bridging it');
  assert.equal(onPad, 0, 'no wall on the spawn pad');
  const again = lay(fields(3, false), { walls: true, banks: false });
  assert.deepEqual(Array.from(again.geometry.attributes.position.array), Array.from(p), 'field walls: deterministic');
  const phone = lay(fields(3, false), { walls: true, banks: false, mobile: true });
  assert.ok(phone.receipt.triangles < walls.receipt.triangles, `field walls: the phones draw fewer (${phone.receipt.triangles} < ${walls.receipt.triangles})`);
  const banks = lay(fields(0, true), { walls: false, banks: true });
  assert.ok(banks.geometry && banks.receipt.bankM > 5000 && banks.receipt.wallM === 0, `banks run the hedge lines (${Math.round(banks.receipt.bankM)} m)`);
  for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(banks.geometry.attributes[name], `field banks: carry ${name}`);
  const bp = banks.geometry.attributes.position.array;
  let bankOff = 0;
  for (let i = 0; i < bp.length; i += 3) { const u = ((bp[i] % 40) + 40) % 40; if (Math.min(u, 40 - u) > 1.6) bankOff++; }
  assert.equal(bankOff, 0, 'every bank stands under a hedge line');
  // a placed solid on a field line (a barn across the x = 40 line): the wall stops short of it
  const fenced = lay(fields(3, false), { walls: true, banks: false, solids: [{ min: [34, 0, -6], max: [46, 4, 6] }] });
  const fp = fenced.geometry.attributes.position.array;
  let inBarn = 0;
  for (let i = 0; i < fp.length; i += 3) if (fp[i] > 34 && fp[i] < 46 && fp[i + 2] > -6 && fp[i + 2] < 6) inBarn++;
  assert.equal(inBarn, 0, 'no wall runs through a placed solid');
  fenced.geometry.dispose();
  const none = lay({ ...fields(3, false), _landUseAt: undefined }, { walls: true, banks: true });
  assert.equal(none.geometry, null, 'no land use, no field works');
  for (const b of [walls, again, phone, banks]) b.geometry.dispose();
}

// ---------------------------------------------------------------------------------------------- 4. the maps

const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const [maps, terrain, vegetationModule, props, fleet, models, placementModule, layouts, assault, yards, collision] = await Promise.all([
  import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'),
  import('../vehicles/fleetFactory.ts'), import('./propsModelStore.ts'), import('../sim/matchPlacement.ts'),
  import('../sim/matchObjectiveLayouts.ts'), import('../sim/assaultLines.ts'), import('./yardDressing.ts'), import('./collision.ts'),
]);

/**
 * The field works' clearances on a built world (the maps lane's layouts): every footprint the works must keep off, from
 * the sources the game reads — the terrain's hardstands (aprons and runways), the yard structures' dressing reach, the
 * match placement's objective discs for every mode on this world (and the authored targets), the Frontline Assault
 * sectors, the spawn pads' flats, the roads' painted core and the bridge decks with their approaches — and the
 * largest height a work stands over its own ground.
 */
function fieldWorksClearances(mapId, config, heightField, dressing, flora, works) {
  const spawns = heightField._layout.spawns;
  const anchors = placementModule.matchPlacementAnchors(spawns);
  const obstacles = [...dressing.obstacles, ...flora.treeObstacles];
  const world = { mapId, heightField, obstacles, queryObstacles: collision.createObstacleGrid(obstacles), anchors };
  const discs = []; // [x, z, r, what]
  const disc = (p, r, what) => discs.push([p.x, p.z, r, what]);
  for (const mode of ['zone_control', 'capture_the_flag', 'turbo_ball', 'ac130']) {
    const placed = placementModule.createMatchPlacement({ ...world, mode });
    if (mode === 'zone_control') placed.zones.forEach((zone, i) => disc(zone, 30, `zone ${i + 1}`));
    if (mode === 'capture_the_flag') for (const team of ['alpha', 'bravo']) disc(placed.centers[team], 12, `${team} flag base`);
    if (mode === 'turbo_ball') {
      for (const team of ['alpha', 'bravo']) disc(placed.centers[team], 18, `${team} goal`);
      disc(placed.middle, 12, 'kickoff');
    }
    if (mode === 'ac130') disc(placed.middle, 30, 'extraction');
  }
  const authored = layouts.MATCH_OBJECTIVE_LAYOUTS[mapId];
  for (const [i, zone] of (authored?.zones ?? []).entries()) disc(zone, 30, `authored zone ${i + 1}`);
  if (authored?.kickoff) disc(authored.kickoff, 12, 'authored kickoff');
  const { alpha, bravo } = anchors;
  const axis = Math.hypot(bravo.x - alpha.x, bravo.z - alpha.z);
  for (const [i, f] of assault.ASSAULT_LINE_FRACTIONS.entries()) {
    disc({ x: alpha.x + (bravo.x - alpha.x) * f, z: alpha.z + (bravo.z - alpha.z) * f }, 30, `assault sector ${i + 1}`);
  }
  assert.ok(axis > 0);
  for (const pad of [spawns.player, ...spawns.enemies]) disc(pad, 22, 'spawn pad');
  const rects = []; // [x, z, ux, uz, halfAlong, halfAcross, what]
  for (const strip of config.terrain?.hardstands ?? []) {
    const a = (strip.yawDeg ?? 0) * Math.PI / 180;
    rects.push([strip.x, strip.z, Math.sin(a), Math.cos(a), strip.length / 2, strip.width / 2, 'apron']);
  }
  const yardKinds = new Set(yards.yardStructureKinds());
  for (const b of dressing.features.buildings) {
    if (!b.kind || !yardKinds.has(b.kind)) continue;
    // the structure's frame (yardDressing.ts insideEnvelope): u across its width, v along its depth
    rects.push([b.x, b.z, Math.sin(b.rot ?? 0), Math.cos(b.rot ?? 0), b.d / 2 + 7.6, b.w / 2 + 7.6, `${b.kind} yard`]);
  }
  for (const deck of heightField.bridgeDecks ?? []) {
    rects.push([deck.x, deck.z, deck.ux, deck.uz, deck.halfLength + deck.approachM, deck.halfWidth, 'bridge']);
  }
  const p = works.geometry.attributes.position.array;
  let height = 0, discGap = Infinity, rectGap = Infinity, roadGap = Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    height = Math.max(height, y - heightField.getHeightAt(x, z));
    for (const [dx, dz, r, what] of discs) {
      const gap = Math.hypot(x - dx, z - dz) - r;
      assert.ok(gap > 0, `${mapId}: a field work stands inside the ${what} (${x.toFixed(1)}, ${z.toFixed(1)})`);
      discGap = Math.min(discGap, gap);
    }
    for (const [rx, rz, ux, uz, ha, hc, what] of rects) {
      const ox = x - rx, oz = z - rz, along = Math.abs(ox * ux + oz * uz), across = Math.abs(-ox * uz + oz * ux);
      const gap = Math.max(along - ha, across - hc);
      assert.ok(gap > 0, `${mapId}: a field work stands inside the ${what} (${x.toFixed(1)}, ${z.toFixed(1)})`);
      rectGap = Math.min(rectGap, gap);
    }
    const road = heightField._roadDist(x, z);
    assert.ok(road > 5.7, `${mapId}: a field work stands on the road's core (${x.toFixed(1)}, ${z.toFixed(1)}: ${road.toFixed(2)} m)`);
    roadGap = Math.min(roadGap, road);
  }
  assert.ok(height <= 1.05, `${mapId}: the field works stand at most 1.05 m (${height.toFixed(3)} m)`);
  return { discs: discs.length, rects: rects.length, height, discGap, rectGap, roadGap };
}
await models.preloadPropModels();
let mapsWithScenery = 0;
for (const mapId of maps.MAP_IDS) {
  const config = maps.getMapConfig(mapId);
  if (!config.scenery) continue;
  mapsWithScenery++;
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const heightField = terrain.createHeightField(1337, config);
  const flora = vegetationModule.createVegetation(heightField, engine, 2001, config);
  // a map with field works on a world without the ground lane's land use: a synthetic field system (fields 40 x 30 m;
  // a wall on every line, or a hedge on every other) so the clearances below are proven against works that run
  // everywhere the land would let them
  const works = config.scenery.fieldWorks;
  if (works && !heightField._landUseAt) {
    heightField._landUseAt = (x, z, out) => {
      const u = ((x % 40) + 40) % 40, v = ((z % 30) + 30) % 30, du = Math.min(u, 40 - u), dv = Math.min(v, 30 - v);
      out.active = 1; out.edgeM = Math.min(du, dv); out.boundary = works.walls ? 3 : 0; out.track = 0;
      out.hedge = works.banks && du < 1.2 ? 1 : 0;
      return out;
    };
  }
  const dressing = props.createProps(heightField, engine, 2002, config, flora);
  const receipt = dressing.group.userData.scenery;
  let worksLine = '';
  if (works) {
    const built = dressing.group.getObjectByName('props-field-works');
    assert.ok(built && receipt.fieldWorks, `${mapId}: the field works stand`);
    // (b13: a map's walls are two batches, the cells' near forms and their far forms; both keep the clearances)
    const far = dressing.group.getObjectByName('props-field-works-far');
    if (far) fieldWorksClearances(mapId, config, heightField, dressing, flora, far);
    const c = fieldWorksClearances(mapId, config, heightField, dressing, flora, built);
    worksLine = `; field works ${Math.round(receipt.fieldWorks.wallM)} m walls + ${Math.round(receipt.fieldWorks.bankM)} m banks clear of ${c.discs} discs `
      + `(${c.discGap.toFixed(1)} m) and ${c.rects} aprons/yards/bridges (${c.rectGap.toFixed(1)} m), ${c.roadGap.toFixed(1)} m off the roads, `
      + `${c.height.toFixed(2)} m tall at most`;
  }
  assert.ok(receipt, `${mapId}: the scenery pass ran`);
  for (const feature of receipt.features) {
    assert.equal(feature.status, 'placed', `${mapId}: ${feature.name ?? feature.kind} stands (${feature.reason ?? ''})`);
  }
  const authored = (config.scenery.rocks?.length ?? 0) + (config.scenery.landmarks?.length ?? 0)
    + (config.scenery.rockFields?.length ?? 0) + (config.scenery.bedrock?.length ?? 0)
    + (config.scenery.powerLines ?? []).reduce((n, line) => n + line.towers.length, 0);
  for (const feature of receipt.features.filter((f) => f.family === 'rockField')) {
    assert.ok(feature.placedOf[0] >= Math.ceil(feature.placedOf[1] * 0.75), `${mapId}: ${feature.name} lays most of its count (${feature.placedOf.join('/')})`);
  }
  assert.equal(receipt.placed, authored, `${mapId}: every authored feature placed`);
  const rock = dressing.group.getObjectByName('props-scenery-rock');
  assert.equal(!!rock, receipt.rockTriangles > 0, `${mapId}: one rock mesh when rock stands`);
  if (rock) assert.ok(rock.castShadow && rock.receiveShadow, `${mapId}: the rock mesh casts and receives`);
  // no tree trunk stands inside a scenery rock's standing mass (a mass is a feature's when its centre is within 10 m of
  // the feature's; another lane's convex solids — the jebels' boulder aprons — are not this receipt's)
  // (2026-10-07, the hitbox lane: a formation's movement record is its blocks' own outlines, a compound when they part)
  const masses = dressing.obstacles.filter((r) => (r.shape2?.kind === 'convex' || r.shape2?.kind === 'compound') && !r.crushable && r.kind === undefined && r.max[1] - r.min[1] > 2.4);
  for (const tree of flora.treeObstacles) {
    const x = (tree.min[0] + tree.max[0]) / 2, z = (tree.min[2] + tree.max[2]) / 2;
    for (const mass of masses) {
      if (x < mass.min[0] || x > mass.max[0] || z < mass.min[2] || z > mass.max[2]) continue;
      const mx = (mass.min[0] + mass.max[0]) / 2, mz = (mass.min[2] + mass.max[2]) / 2;
      for (const feature of receipt.features) {
        if (feature.family !== 'rock' || Math.hypot(feature.x - mx, feature.z - mz) > 10) continue;
        assert.ok(!collisionFootprintContainsPoint(mass, x, z), `${mapId}: no tree inside ${feature.name}`);
      }
    }
  }
  // a pylon line stands its towers over the crowns under its spans (wave 16): its conductors clear them in their sag
  const pylons = receipt.features.filter((f) => f.family === 'powerLine' && f.status === 'placed');
  for (const p of pylons) assert.ok(p.heightM >= p.authoredHeightM && p.heightM <= 70, `${mapId}: a pylon stands ${p.heightM} m (authored ${p.authoredHeightM} m)`);
  const pylonLine = pylons.length ? `; pylons ${pylons[0].authoredHeightM} -> ${pylons[0].heightM.toFixed(1)} m` : '';
  console.log(`scenery.selftest: ${mapId} — ${receipt.placed} features, ${receipt.rockTriangles} rock + ${receipt.bakedTriangles} baked triangles, ${receipt.colliders} colliders${worksLine}${pylonLine}`);
}

// ---------------------------------------------------------------------------------------------- 5. the wiring

const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
// (b15: the regions' field stacks follow the kit's kinds: maps/haystackKit.ts, haystacks.selftest.mjs)
assert.match(propsSource, /\{ \.\.\.DESTRUCTIBLE_TYPES, \.\.\.SCENERY_DESTRUCTIBLE_TYPES, \.\.\.HAYSTACK_DESTRUCTIBLE_TYPES \}/, 'the kit\'s kinds follow the inhabiting kit\'s');
const yard = propsSource.indexOf('  yield* placeYardDressing();'), pass = propsSource.indexOf('  yield* placeScenery();');
const merge = propsSource.indexOf('  yield* mergeMaterialBuckets();');
assert.ok(yard > 0 && pass > yard && merge > pass, 'the pass runs after every placement and before the bucket merge');
assert.match(propsSource, /new THREE\.Mesh\(merged, mats\.rock\)/, 'the rock forms draw on the props rock material (its cascade setup and hook)');
const pools = propsSource.indexOf('  yield* finalizeDestructiblePools();'), works = propsSource.indexOf('  yield* placeFieldBoundaryWorks();');
assert.ok(pools > merge && works > pools, 'the field works build once the pools\' refit has made every solid final (the placement they keep off reads those)');
assert.match(propsSource, /mats\.fieldStone\.color\.setRGB\(masonryTint\[0\], masonryTint\[1\], masonryTint\[2\]\)/, 'a map\'s masonry tint reaches the field walls\' print');
assert.doesNotMatch(propsSource, /mats\.stone\.color\.setRGB\(masonryTint/, 'the masonry tint never multiplies the house masonry (a regional kit\'s print under it burns out)');
// the dry-stone walls draw the field print, never the house masonry (a regional kit's brick, block or dressed stone)
assert.match(propsSource, /const fieldWallBucket = P\.wallStyle === 'adobe' \|\| sourcedStoneIsBrick\(mapId\) \? 'stone' : 'fieldStone';/, 'the field print is the dry-stone walls\'');
assert.match(propsSource, /wallstone: \{ \.\.\.DESTRUCTIBLE_TYPES\.wallstone, mat: fieldWallBucket[,} ]/, 'the wall pool draws the field print');
assert.match(propsSource, /const wallB = style === 'adobe' \? wallDressing\.adobeBucket : fieldWallBucket;/, 'the run posts, breach stubs and tumbled blocks draw the field print (or the mud print)');
assert.match(propsSource, /fieldStone: new THREE\.MeshStandardMaterial\(\{ map: fieldStone\.albedo,/, 'the field print has its own material');
// wave 20: the mud walls' own worn render; the walls' feet, drifts and snow loads; the modules turned round by place
assert.match(propsSource, /walladobe: \{ \.\.\.DESTRUCTIBLE_TYPES\.walladobe, mat: adobeWallBucket \}/, 'the mud wall pool draws the mud print');
assert.match(propsSource, /fieldMud: new THREE\.MeshStandardMaterial\(\{ map: fieldMud\.albedo,/, 'the mud print has its own material');
assert.match(propsSource, /\.\.\.\(snowCap \? \{ build: snowLoadedWallstone \} : \{\}\)/, 'a snow map\'s module carries its snow load');
assert.match(propsSource, /const wallDressing = createWallDressing\(\{/, 'the wall runs dress their islands through one owner');
assert.match(propsSource, /mesh\.name = 'props-snow-drifts';/, 'the snow drifts draw as one mesh of their own (the frame-budget probe\'s field-walls toggle hides them)');
assert.match(propsSource, /if \(prevBuilt\) \{ endPost\(x1, z1, 1\); dressIsland\(islandFrom, along\); \}/, 'a run\'s last island is dressed');
assert.match(propsSource, /const fallen = wallDressing\.tumble\(style === 'adobe', px, pz, tx \* out, tz \* out, thick \* 0\.5\);/, 'a run\'s ends tumble out past its heads (wave 34)');
assert.match(propsSource, /if \(wallB === 'fieldStone'\) wallDressing\.stoneUv\(head, rng\); else jitterUV\(head, rng\);/, 'a head\'s print window stays in the field print\'s face band');
assert.match(propsSource, /mesh\.name = 'props-sandbag-beds';/, 'the nests\' bedding draws as one mesh of its own');
assert.equal((propsSource.match(/cls: 'break', mat: 'burlap', contact: 'ob'/g) ?? []).length, 3, 'the three stacks draw the hessian (wave 52)');
assert.match(propsSource, /materialKind === 'burlap' \? 'structureCanvas'/, 'the hessian shares the canvas program');
assert.match(propsSource, /materialKind === 'fieldStone' \? fieldStoneHook : materialKind === 'pole' \? poleHook\s*(?:: materialKind === 'ballast' \? ballastHook\s*)?: materialKind === 'fieldMud' \? mudHook : grimeHook/,
  'the field print has its own hook (wave 48), the telegraph poles theirs (after wave 57), the rail kit\'s ballast its own (the ground lane, wave 234) and the mud print its own (b14)');
assert.match(propsSource, /vMapUv \+= cotStoneShift;/, 'each wall module shifts its print window along the wall (wave 48: "the coursing visibly repeats")');
assert.match(propsSource, /bedSandbagNest\(kind, sx, sz, yaw \+ sideIndex \* 0\.12, 1\.18, \[fwdX, fwdZ\]\);/, 'a redoubt\'s stacks are bedded, their spoil thrown forward');
assert.match(propsSource, /bedSandbagNest\(kind, bx, bz, moduleYaw, moduleScale, \[fx, fz\]\);/, 'a breastwork\'s modules are bedded toward the threat');
assert.match(propsSource, /bedSandbagNest\(kind, sx, sz, yaw, scale\);/, 'a road nest is bedded');
assert.match(propsSource, /cx \+ tz \* nudge, cy - 0\.13, cz - tx \* nudge, yaw \+ turn,/, 'a run turns its modules round by place, neighbours apart');
const vegetationSource = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.match(vegetationSource, /placedStructureClearances\([^;]*\(cfg as SceneryMapConfig \| null\)\?\.scenery\)/s, 'the trees keep off the scenery');
const clearanceSource = readFileSync(new URL('./vegetationClearance.ts', import.meta.url), 'utf8');
assert.match(clearanceSource, /\.\.\.sceneryClearances\(scenery\)/, 'the placed-structure keep-out carries the scenery footprints');

console.log(`scenery.selftest: ${FORMS.length} rock forms x 2 tiers, ${Object.keys(SCENERY_DESTRUCTIBLE_TYPES).length} landmark kinds, the composer's admission, ${mapsWithScenery} maps placed`);
