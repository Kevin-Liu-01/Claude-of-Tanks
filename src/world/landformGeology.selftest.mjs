// Landform geology (src/world/landformGeology.ts; maps lane, 2026-10-03): the gauntlet's wave-0 critics read every
// landform as a smooth shell. A landform with `geology` takes a lobed outline, a butte or cone profile, rills, bedding
// and a knobbly surface; one without it keeps its exact smooth shape. This receipt holds both halves of that contract.
import assert from 'node:assert/strict';
import { createHeightField, sampleLandformHeight } from './terrain.ts';
import {
  createGeologyRockSampler, createGeologyZoneSampler, geologyBoulderSite, geologyRockWeight, geologyZoneWeights,
  inselbergSection, isRockLandform, knollGeologyHeight, ridgeGeologyHeight,
} from './landformGeology.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const smoothstep = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const frame = (form) => {
  const yaw = (form.yawDeg ?? 0) * Math.PI / 180;
  return { ...form, _c: Math.cos(yaw), _s: Math.sin(yaw) };
};
const local = (form, x, z) => {
  const dx = x - form.x, dz = z - form.z;
  return [dx * form._c + dz * form._s, -dx * form._s + dz * form._c];
};

// 1. Without geology a landform keeps the smooth shapes exactly (the formulas terrain.ts has always used).
function smoothKnoll(form, x, z) {
  const [lx, lz] = local(form, x, z);
  const rx = Math.max(1, form.rx || form.r || 70), rz = Math.max(1, form.rz || form.r || rx);
  const w = 1 - smoothstep(0.12, 1, Math.sqrt(lx * lx / (rx * rx) + lz * lz / (rz * rz)));
  return (form.height || 0) * w * w * (3 - 2 * w);
}
function smoothRidge(form, x, z) {
  const [lx, lz] = local(form, x, z);
  const half = Math.max(1, (form.length || 100) * 0.5), width = Math.max(1, form.width || 45);
  const along = 1 - smoothstep(half * 0.72, half, Math.abs(lx));
  const across = 1 - smoothstep(width * 0.22, width, Math.abs(lz));
  const shoulder = across * across * (3 - 2 * across);
  return (form.height || 0) * along * shoulder;
}
let smoothForms = 0;
for (const mapId of MAP_IDS) {
  for (const raw of getMapConfig(mapId).terrain?.landforms ?? []) {
    if (raw.geology || raw.relief || raw.kind === 'gorge') continue;
    const form = frame(raw);
    for (let i = 0; i < 64; i++) {
      const x = form.x + Math.cos(i * 2.39996) * (i * 1.9), z = form.z + Math.sin(i * 2.39996) * (i * 1.9);
      const expected = form.kind === 'ridge' ? smoothRidge(form, x, z) : smoothKnoll(form, x, z);
      assert.equal(sampleLandformHeight(form, x, z), expected,
        `${mapId} ${form.kind} at (${form.x}, ${form.z}) keeps its smooth shape`);
    }
    smoothForms++;
  }
}
assert.ok(smoothForms > 40, 'the fleet\'s smooth landforms were all compared');

// 2. Determinism, and a pattern of its own per landform.
const cone = frame({ kind: 'knoll', x: 40, z: -60, rx: 50, rz: 50, height: 20, geology: { profile: 'cone',
  crater: { rim: 0.16, depthM: 3, breachDeg: 90 }, gullies: { count: 9, depthM: 1.5 }, rough: 0.5, outline: 0.12 } });
const twin = frame({ ...cone, x: 140 });
let differs = 0;
for (let i = 0; i < 200; i++) {
  const a = (i * 0.7) % 6.283, r = (i * 0.21) % 50;
  const h1 = sampleLandformHeight(cone, cone.x + Math.cos(a) * r, cone.z + Math.sin(a) * r);
  assert.equal(h1, sampleLandformHeight(cone, cone.x + Math.cos(a) * r, cone.z + Math.sin(a) * r), 'deterministic');
  assert.ok(Number.isFinite(h1), 'finite');
  if (Math.abs(h1 - sampleLandformHeight(twin, twin.x + Math.cos(a) * r, twin.z + Math.sin(a) * r)) > 0.05) differs++;
}
assert.ok(differs > 40, `two landforms do not share a pattern (${differs} of 200 samples differ)`);

// 3. Bounds: never above the summit plus its roughness, never below the crater, the rills and the roughness.
for (let x = -20; x <= 100; x += 1.7) for (let z = -120; z <= 0; z += 1.7) {
  const h = sampleLandformHeight(cone, x, z);
  assert.ok(h <= 20 + 0.5 + 1e-9 && h >= -(1.5 + 0.5) - 1e-9, `bounded at (${x}, ${z}): ${h}`);
}
assert.equal(sampleLandformHeight(cone, 40 + 80, -60), 0, 'nothing beyond the lobed outline');

// 4. A cone's flank: its steepest point is 1.14 x height / (radius x (1 - rim)), and the crater dips below its rim.
const bare = { kind: 'knoll', x: 0, z: 0, rx: 60, rz: 60, height: 18,
  geology: { profile: 'cone', crater: { rim: 0.15, depthM: 3 } } };
let steepest = 0;
for (let r = 0.5; r < 60; r += 0.25) {
  steepest = Math.max(steepest, (knollGeologyHeight(bare, r - 0.25, 0) - knollGeologyHeight(bare, r + 0.25, 0)) / 0.5);
}
const predicted = 1.138 * 18 / (60 * (1 - 0.15));
assert.ok(Math.abs(steepest - predicted) / predicted < 0.05,
  `cone flank ${steepest.toFixed(3)} vs ${predicted.toFixed(3)}`);
assert.ok(knollGeologyHeight(bare, 0, 0) < knollGeologyHeight(bare, 60 * 0.15, 0) - 2.9,
  'the crater floor lies its depth below the rim');
assert.ok(knollGeologyHeight(cone, 0, 50 * 0.16) < knollGeologyHeight(cone, 0, -50 * 0.16) - 0.5,
  'the breach lowers the rim on its bearing');

// 5. Rills: round the mid-flank of a cone, roughly `count` notches, not one and not a comb.
const rilled = { kind: 'knoll', x: 0, z: 0, rx: 60, rz: 60, height: 18,
  geology: { profile: 'cone', crater: { rim: 0.15, depthM: 3 }, gullies: { count: 9, depthM: 2 } } };
const ring = [];
for (let i = 0; i < 720; i++) {
  const a = i / 720 * Math.PI * 2;
  ring.push(knollGeologyHeight(rilled, Math.cos(a) * 33, Math.sin(a) * 33));
}
let notches = 0;
for (let i = 0; i < ring.length; i++) {
  const prev = ring[(i + ring.length - 1) % ring.length], next = ring[(i + 1) % ring.length];
  if (ring[i] < prev && ring[i] <= next && Math.max(...ring) - ring[i] > 0.3) notches++;
}
assert.ok(notches >= 5 && notches <= 11, `about nine rills round the flank (${notches})`);
assert.ok(Math.max(...ring) - Math.min(...ring) <= 2 + 1e-9, 'a rill cuts no deeper than its depth');

// 6. A lobed outline: the radius where a dome falls to a tenth of its height varies with the bearing.
const lobed = { kind: 'knoll', x: 0, z: 0, rx: 80, rz: 80, height: 10, geology: { outline: 0.25 } };
const reach = [];
for (let i = 0; i < 36; i++) {
  const a = i / 36 * Math.PI * 2;
  let r = 0;
  while (r < 120 && knollGeologyHeight(lobed, Math.cos(a) * r, Math.sin(a) * r) > 1) r += 0.5;
  reach.push(r);
}
assert.ok(Math.max(...reach) - Math.min(...reach) > 0.25 * 80 * 0.5,
  `lobed reach ${Math.min(...reach)}-${Math.max(...reach)} m`);

// 7. A butte: a cap that is not level, a steep wall, a concave apron; bedding adds benches down the wall.
const butte = { kind: 'knoll', x: 0, z: 0, rx: 70, rz: 70, height: 24,
  geology: { profile: 'butte', strata: { stepM: 4 } } };
const profile = [];
for (let r = 0; r <= 70; r += 0.5) profile.push(knollGeologyHeight(butte, r, 0));
const slopeAt = (i) => (profile[i] - profile[i + 1]) / 0.5;
assert.ok(profile[0] - profile[Math.round(0.45 * 70 / 0.5)] > 0.5, 'the cap is gently domed, not a level table');
assert.ok(Math.max(...profile.slice(0, -1).map((_, i) => slopeAt(i))) > 1.0, 'the wall is steep');
// benches show on most bearings, but the bedding wanders and fades under talus, so not on every one
let benches = 0, benchedBearings = 0;
for (let k = 0; k < 12; k++) {
  const a = k / 12 * Math.PI * 2, line = [];
  for (let r = 0; r <= 70; r += 0.5) line.push(knollGeologyHeight(butte, Math.cos(a) * r, Math.sin(a) * r));
  let here = 0;
  for (let i = Math.round(0.44 * 70 / 0.5); i < Math.round(0.64 * 70 / 0.5); i++) {
    const s0 = (line[i - 1] - line[i]) / 0.5, s1 = (line[i] - line[i + 1]) / 0.5;
    if (s1 < 0.35 && s0 >= 0.35) here++;
  }
  benches += here;
  if (here) benchedBearings++;
}
assert.ok(benchedBearings >= 4 && benchedBearings <= 12, `bedding breaks the wall into benches on most bearings `
  + `(${benchedBearings} of 12)`);
const apronStart = Math.round(0.62 * 70 / 0.5), apronEnd = Math.round(0.98 * 70 / 0.5);
assert.ok(slopeAt(apronStart + 2) > slopeAt(apronEnd - 2),
  'the talus apron is concave: steep below the wall, flat at the toe');

// 8. A ridge with a butte profile and a lobed margin keeps its tapered ends and varies its edge along the axis.
const flow = frame({ kind: 'ridge', x: 0, z: 0, length: 200, width: 60, height: 7, yawDeg: 0,
  geology: { profile: 'butte', outline: 0.25, rough: 0.6, gullies: { count: 3, depthM: 1 } } });
assert.equal(sampleLandformHeight(flow, 101, 0), 0, 'past its end the flow is gone');
const edges = [];
for (let x = -60; x <= 60; x += 10) {
  let z = 0;
  while (z < 90 && sampleLandformHeight(flow, x, z) > 1) z += 0.5;
  edges.push(z);
}
assert.ok(Math.max(...edges) - Math.min(...edges) > 3,
  `the flow's margin is lobed (${Math.min(...edges)}-${Math.max(...edges)} m)`);
assert.equal(ridgeGeologyHeight({ kind: 'ridge', x: 0, z: 0, height: 5 }, 0, 0, 1), null, 'no geology, no override');

// 9. Continuous everywhere: no seam where one rill's ground hands over to the next, none round a knoll's back bearing
// (where the bearing wraps) and none at a breached crater's centre, where every bearing meets. A 1 cm step moves the
// ground at most 3 cm on these forms (no strata here, whose risers are walls by design), except on an inselberg's wall
// (steeper than 3:1 by design; a sheer jebel's up to 30:1 where its lobes pinch the wall), where the rise is still spread over the step, as a seam's is
// not.
const seamTests = [
  frame({ kind: 'knoll', x: 0, z: 0, rx: 48, rz: 60, height: 24, yawDeg: 0, geology: { profile: 'cone',
    crater: { rim: 0.16, depthM: 4, breachDeg: 200 }, outline: 0.1, gullies: { count: 11, depthM: 3.2, width: 0.6 },
    rough: 1.1 } }),
  frame({ kind: 'knoll', x: 0, z: 0, rx: 60, rz: 60, height: 18, yawDeg: 0, geology: { profile: 'cone',
    crater: { rim: 0.15, depthM: 2.5, breachDeg: 180 }, outline: 0.14, gullies: { count: 12, depthM: 3.5, width: 0.6 },
    rough: 1.1 } }),
  frame({ kind: 'knoll', x: 0, z: 0, rx: 48, rz: 60, height: 24, yawDeg: 0, geology: { profile: 'cone',
    crater: { rim: 0.16, depthM: 4, breachDeg: 200 }, outline: 0.1, gullies: { count: 11, depthM: 5, width: 0.55 },
    fans: { reach: 0.32, heightM: 2.4 }, rough: 1.1 } }),
  frame({ kind: 'knoll', x: 0, z: 0, rx: 34, rz: 40, height: 24, yawDeg: 0, geology: { profile: 'inselberg', outline: 0.18,
    foot: 0.66, footVary: 0.14, apron: 0.18, crown: 3.2, rough: 1.3, gullies: { count: 12, depthM: 4, width: 0.4 },
    fans: { reach: 0.35, heightM: 2.6 } } }),
  frame({ kind: 'knoll', x: 0, z: 0, rx: 36, rz: 30, height: 26, yawDeg: 0, geology: { profile: 'inselberg', outline: 0.18,
    foot: 0.66, footVary: 0.14, apron: 0.18, rim: 0.86, bosses: { count: 5, heightM: 5 }, flutes: { count: 18, depth: 0.5 },
    rough: 1.3, gullies: { count: 10, depthM: 7, width: 0.35 }, fans: { reach: 0.35, heightM: 2.6 } } }),
  frame({ kind: 'ridge', x: 0, z: 0, length: 220, width: 50, height: 7, yawDeg: 0, geology: { profile: 'flow', front: 1,
    outline: 0.25, rough: 0.7, gullies: { count: 3, depthM: 1.2, width: 0.4 } } }),
  frame({ kind: 'ridge', x: 0, z: 0, length: 200, width: 60, height: 7, yawDeg: 0, geology: { profile: 'butte',
    wall: [0.4, 0.58], apron: 0.25, outline: 0.28, rough: 0.7, gullies: { count: 3, depthM: 1.2, width: 0.6 } } }),
];
let seamSamples = 0, wallSamples = 0;
for (const form of seamTests) {
  const reach = Math.max(form.rx ?? 0, form.rz ?? 0, (form.length ?? 0) / 2, form.width ?? 0) * 1.4;
  for (let z = -reach; z <= reach; z += 0.37) for (let x = -reach; x <= reach; x += 0.37) {
    const h = sampleLandformHeight(form, x, z);
    for (const [dx, dz] of [[0.01, 0], [0, 0.01]]) {
      seamSamples++;
      const next = sampleLandformHeight(form, x + dx, z + dz), jump = Math.abs(next - h);
      if (jump <= 0.03) continue;
      const mid = sampleLandformHeight(form, x + dx / 2, z + dz / 2);
      const split = Math.max(Math.abs(mid - h), Math.abs(next - mid)) / jump;
      assert.ok(form.geology.profile === 'inselberg' && jump <= (form.geology.rim ? 0.3 : 0.06) && split < 0.8,
        `${form.kind} geology is continuous at (${x.toFixed(2)}, ${z.toFixed(2)}): ${jump.toFixed(3)} m in 1 cm, ${(split * 100).toFixed(0)} % of it in one half`);
      wallSamples++;
    }
  }
}

// 10. Talus fans: below a rilled cone's toe the ground rises in fans on the rills' bearings, thins between them and is
// gone past the fans' reach; a cone without fans keeps nothing past its toe.
const fanned = { kind: 'knoll', x: 0, z: 0, rx: 60, rz: 60, height: 18,
  geology: { profile: 'cone', crater: { rim: 0.15, depthM: 3 }, gullies: { count: 9, depthM: 3 }, fans: { reach: 0.3 } } };
const bareFans = { ...fanned, geology: { ...fanned.geology, fans: undefined } };
const toeRing = [];
for (let i = 0; i < 720; i++) {
  const a = i / 720 * Math.PI * 2;
  toeRing.push(knollGeologyHeight(fanned, Math.cos(a) * 60 * 1.08, Math.sin(a) * 60 * 1.08));
  assert.equal(knollGeologyHeight(bareFans, Math.cos(a) * 60 * 1.08, Math.sin(a) * 60 * 1.08), 0, 'no fans, nothing past the toe');
  assert.equal(knollGeologyHeight(fanned, Math.cos(a) * 60 * 1.31, Math.sin(a) * 60 * 1.31), 0, 'nothing past the fans\' reach');
}
const fanPeaks = toeRing.filter((h, i) => h > 0.3 && h >= toeRing[(i + 719) % 720] && h >= toeRing[(i + 1) % 720]).length;
assert.ok(fanPeaks >= 5 && fanPeaks <= 11, `about nine fans spread past the toe (${fanPeaks})`);
assert.ok(Math.max(...toeRing) <= 3 * 0.6 + 1e-9, 'a fan stands no higher than its height at the toe');
assert.ok(Math.min(...toeRing) < 0.05, 'the fans thin out between the rills');

// 11. A lava flow: its channel a step below its levees, a steep margin, and a steep blocky front at its downhill end
// while its vent end thins out gently.
const lava = frame({ kind: 'ridge', x: 0, z: 0, length: 200, width: 50, height: 8, yawDeg: 0,
  geology: { profile: 'flow', front: 1 } });
const channel = sampleLandformHeight(lava, 0, 0), levee = sampleLandformHeight(lava, 0, 50 * 0.74);
assert.ok(levee - channel > 1.2, `the levees stand above the channel (${(levee - channel).toFixed(2)} m)`);
const axisSlope = (from, to) => {
  let worst = 0;
  for (let x = from; x < to; x += 0.5) worst = Math.max(worst, Math.abs(sampleLandformHeight(lava, x + 0.5, 0) - sampleLandformHeight(lava, x, 0)) / 0.5);
  return worst;
};
const frontSlope = axisSlope(85, 100), ventSlope = axisSlope(-100, -45);
assert.ok(frontSlope > 0.6 && ventSlope < 0.3, `a steep front (${frontSlope.toFixed(2)}) and a thinning vent end (${ventSlope.toFixed(2)})`);
assert.ok(sampleLandformHeight(lava, 0, 50 * 0.95) < levee * 0.4, 'a steep margin below the levee');

// 12. Zones (the terrain material's and the dressing's keys): a flow's whole lobed footprint is flow, fading over 4 m past
// its margin and its ends; a cone's lobed base is cone, fading over 3 m; past a cone's base a fan's zone is its height
// share, exactly the ground the fans raise there.
const zone = [0, 0, 0];
const lobedFlow = frame({ kind: 'ridge', x: 30, z: -20, length: 220, width: 50, height: 7, yawDeg: 35, geology: {
  profile: 'flow', front: 1, outline: 0.25, rough: 0.7, gullies: { count: 3, depthM: 1.2, width: 0.4 } } });
const toWorld = (form, lx, lz) => [form.x + lx * form._c - lz * form._s, form.z + lx * form._s + lz * form._c];
let flowInside = 0, flowFaded = 0;
for (let lx = -110; lx <= 110; lx += 2.5) {
  // the margin along this station, where the flow's ground meets the plain
  for (const side of [1, -1]) {
    let edge = 0;
    while (edge < 90 && sampleLandformHeight(lobedFlow, ...toWorld(lobedFlow, lx, side * (edge + 0.25))) > 1e-9) edge += 0.25;
    for (let lz = 0; lz < edge; lz += 1) {
      assert.equal(geologyZoneWeights(lobedFlow, ...toWorld(lobedFlow, lx, side * lz), zone)[0], 1,
        `flow zone 1 over the footprint (${lx}, ${side * lz})`);
      flowInside++;
    }
    if (Math.abs(lx) < 100) {
      assert.equal(geologyZoneWeights(lobedFlow, ...toWorld(lobedFlow, lx, side * (edge + 4.6)), zone)[0], 0,
        `flow zone gone 4 m past the margin (${lx})`);
      flowFaded++;
    }
  }
}
assert.equal(geologyZoneWeights(lobedFlow, ...toWorld(lobedFlow, 110 + 4.01, 0), zone)[0], 0, 'flow zone gone past the front');
assert.ok(geologyZoneWeights(lobedFlow, ...toWorld(lobedFlow, 110 + 2, 0), zone)[0] > 0.2, 'the front fades, not cut');
assert.equal(geologyZoneWeights(lobedFlow, ...toWorld(lobedFlow, -110, 0), zone)[0], 1, 'the vent end is flow to its tip');
const fannedCone = frame({ kind: 'knoll', x: -40, z: 70, rx: 48, rz: 60, height: 24, yawDeg: 20, geology: { profile: 'cone',
  crater: { rim: 0.16, depthM: 4, breachDeg: 200 }, outline: 0.1, gullies: { count: 11, depthM: 5, width: 0.55 },
  fans: { reach: 0.32, heightM: 2.4 }, rough: 1.1 } });
const unfanned = { ...fannedCone, geology: { ...fannedCone.geology, fans: undefined } };
let coneInside = 0, fanSamples = 0, fanPositive = 0;
for (let i = 0; i < 1440; i++) {
  const a = i / 1440 * Math.PI * 2;
  // the base along this bearing: where the cone (without its fans) meets the plain
  let r = 0;
  while (r < 120 && knollGeologyHeight(unfanned, Math.cos(a) * (r + 0.25), Math.sin(a) * (r + 0.25)) !== 0) r += 0.25;
  for (const f of [0.2, 0.6, 0.97]) {
    const [x, z] = toWorld(fannedCone, Math.cos(a) * r * f, Math.sin(a) * r * f);
    assert.equal(geologyZoneWeights(fannedCone, x, z, zone)[1], 1, `cone zone 1 inside the base (${i}, ${f})`);
    coneInside++;
  }
  const [ox, oz] = toWorld(fannedCone, Math.cos(a) * (r + 3.4), Math.sin(a) * (r + 3.4));
  assert.equal(geologyZoneWeights(fannedCone, ox, oz, zone)[1], 0, `cone zone gone 3 m past the base (${i})`);
  for (const extra of [0.5, 4, 9, 15]) {
    const lx = Math.cos(a) * (r + extra), lz = Math.sin(a) * (r + extra);
    const share = geologyZoneWeights(fannedCone, ...toWorld(fannedCone, lx, lz), zone)[2];
    assert.ok(Math.abs(knollGeologyHeight(fannedCone, lx, lz) - 2.4 * share) < 1e-9,
      `past the base the ground is the fans' height share (${i}, +${extra} m)`);
    fanSamples++;
    if (share > 0) fanPositive++;
  }
}
assert.ok(fanPositive > fanSamples * 0.15 && fanPositive < fanSamples, `fans cover much of the toe ring, not all (${fanPositive} of ${fanSamples})`);
assert.deepEqual(geologyZoneWeights({ kind: 'ridge', x: 0, z: 0, height: 5, geology: { profile: 'butte' } }, 0, 0, zone), [0, 0, 0],
  'a butte names no zone');
// the map's sampler: null without zones, and the strongest of each zone over the zoned landforms everywhere
assert.equal(createGeologyZoneSampler([{ kind: 'knoll', x: 0, z: 0, height: 9 }, { kind: 'ridge', x: 0, z: 0, height: 4,
  geology: { profile: 'butte' } }]), null, 'no zoned landform, no sampler');
const zonedForms = [lobedFlow, fannedCone, frame({ kind: 'knoll', x: 300, z: 300, rx: 40, rz: 40, height: 10, yawDeg: 0,
  geology: { profile: 'butte' } })];
const sampler = createGeologyZoneSampler(zonedForms);
const each = [0, 0, 0], best = [0, 0, 0];
let samplerPoints = 0;
for (let z = -160; z <= 200; z += 3.3) for (let x = -200; x <= 200; x += 3.3) {
  best.fill(0);
  for (const form of zonedForms) {
    geologyZoneWeights(form, x, z, each);
    for (let k = 0; k < 3; k++) best[k] = Math.max(best[k], each[k]);
  }
  assert.deepEqual(sampler(x, z, zone), best, `the sampler is the strongest zone at (${x}, ${z})`);
  samplerPoints++;
}

// 13. The height field publishes the zones (_geologyZoneAt) on a map that authors them, and a map whose landforms author
// lava flows gates its rock on their footprints: inside the rim band Caldera's landform mask (it has no mesa wall) is
// exactly the flow zone. A map without flows or mesas keeps no mask and publishes no zones.
const caldera = createHeightField(1337, getMapConfig('caldera'));
assert.equal(typeof caldera._geologyZoneAt, 'function', 'Caldera publishes its zones');
let maskPoints = 0, onFlows = 0;
for (let z = -400; z <= 400; z += 7.3) for (let x = -400; x <= 400; x += 7.3) {
  const flow = caldera._geologyZoneAt(x, z, zone)[0];
  assert.equal(caldera._mesaW(x, z), flow, `Caldera's landform mask is its flow zone at (${x}, ${z})`);
  maskPoints++;
  if (flow === 1) onFlows++;
}
assert.ok(onFlows > maskPoints * 0.04, `the six flows cover their share of the floor (${onFlows} of ${maskPoints})`);
const plain = createHeightField(1337, getMapConfig('verdant'));
assert.equal(plain._mesaW, null, 'no flows and no mesas: no landform mask');
assert.equal(plain._geologyZoneAt, undefined, 'and no zones');

// 14. An inselberg (gauntlet wave 4, Redrock's "clay-loaf inselbergs ... a perfectly regular terrace ring round each
// base"): a broad rounded crown, a near-vertical wall, a concave talus apron; the wall's foot, the slope break, wanders
// round the dome instead of tracing one ring, and its boulder sites fall on the talus between the foot and the fans'
// reach, crowded towards the foot.
const jebel = { kind: 'knoll', x: 0, z: 0, rx: 40, rz: 40, height: 24,
  geology: { profile: 'inselberg', foot: 0.66, footVary: 0.14, apron: 0.18, crown: 3.2 } };
const slopeAlong = (form, a, r) => (knollGeologyHeight(form, Math.cos(a) * (r - 0.25), Math.sin(a) * (r - 0.25))
  - knollGeologyHeight(form, Math.cos(a) * (r + 0.25), Math.sin(a) * (r + 0.25))) / 0.5;
const breaks = [];
let steepestWall = 0;
for (let k = 0; k < 36; k++) {
  const a = k / 36 * Math.PI * 2;
  let best = 0, at = 0;
  for (let r = 1; r < 40; r += 0.25) { const g = slopeAlong(jebel, a, r); if (g > best) { best = g; at = r; } }
  breaks.push(at);
  steepestWall = Math.max(steepestWall, best);
  assert.ok(slopeAlong(jebel, a, 2) < 0.05, 'the crown is rounded, level at the top');
  assert.ok(slopeAlong(jebel, a, at + 4) < best * 0.5, 'below the wall the talus apron is far gentler');
  assert.ok(slopeAlong(jebel, a, 37) < slopeAlong(jebel, a, at + 4), 'and concave, flattening to the toe');
}
assert.ok(steepestWall > 1.4, `the wall is steep (${steepestWall.toFixed(2)})`);
const breakSpread = Math.max(...breaks) - Math.min(...breaks);
assert.ok(breakSpread > 0.14 * 0.66 * 40, `the wall's foot wanders round the dome (${Math.min(...breaks)}-${Math.max(...breaks)} m)`);
const boulderForm = frame({ ...seamTests[3] });
const boulderReach = 0.35, footOf = (lx, lz) => {
  // the site's normalized radius on the lobed outline, as knollGeologyHeight measures it
  const nx = lx / boulderForm.rx, nz = lz / boulderForm.rz;
  return Math.hypot(nx, nz);
};
let boulderSites = 0, nearFoot = 0;
for (let i = 0; i < 400; i++) {
  const u = (i * 0.618034) % 1, v = (i * 0.414214) % 1;
  const [x, z] = geologyBoulderSite(boulderForm, u, v);
  assert.deepEqual(geologyBoulderSite(boulderForm, u, v), [x, z], 'deterministic');
  const [lx, lz] = local(boulderForm, x, z), q = footOf(lx, lz);
  assert.ok(q >= 0.66 * (1 - 0.14) * (1 - 0.18) - 1e-9 && q <= (1 + boulderReach) * (1 + 0.18) + 1e-9,
    `a boulder site lies on the talus (q ${q.toFixed(3)})`);
  if (q < 0.9) nearFoot++;
  boulderSites++;
}
assert.ok(nearFoot > boulderSites * 0.35, `boulders crowd towards the wall's foot (${nearFoot} of ${boulderSites} inside q 0.9)`);

// 15. Rock landforms and cliff ends (Titan Gorge's redesign, 2026-10-03). A map without a mesa field can gate its rock
// on its authored rock landforms instead (terrain `landformRock`): butte, inselberg and lava-flow profiles, and anything
// made of slag. A ridge's cliff end keeps the full section out to 94 % of the half-length and then drops to nothing in a
// wall; an end without one keeps the smooth taper.
const rockCases = [
  [{ kind: 'knoll', x: 0, z: 0, rx: 40, height: 20, geology: { profile: 'butte' } }, true, 'a butte'],
  [{ kind: 'ridge', x: 0, z: 0, length: 200, width: 40, height: 20, geology: { profile: 'butte' } }, true, 'a mesa shelf'],
  [{ kind: 'knoll', x: 0, z: 0, rx: 40, height: 20, geology: { profile: 'inselberg' } }, true, 'an inselberg'],
  [{ kind: 'ridge', x: 0, z: 0, length: 200, width: 40, height: 6, geology: { profile: 'flow' } }, true, 'a lava flow'],
  [{ kind: 'knoll', x: 0, z: 0, rx: 40, height: 20, geology: { profile: 'cone' } }, false, 'a cinder cone'],
  [{ kind: 'knoll', x: 0, z: 0, rx: 40, height: 20, geology: { outline: 0.2 } }, false, 'a lobed dome'],
  [{ kind: 'knoll', x: 0, z: 0, rx: 40, height: 20 }, false, 'a smooth knoll'],
  [{ kind: 'knoll', x: 0, z: 0, rx: 40, height: 9, geology: { outline: 0.1, material: 'slag' } }, true, 'a slag tip'],
];
for (const [form, rock, label] of rockCases) assert.equal(isRockLandform(form), rock, `${label} is${rock ? '' : ' not'} rock`);
const shelf = frame({ kind: 'ridge', x: 30, z: -20, length: 200, width: 40, height: 20, yawDeg: 90,
  geology: { profile: 'butte', cliffEnd: 'both' } });
const tip = frame({ kind: 'knoll', x: -150, z: 60, rx: 40, rz: 30, height: 9, yawDeg: 20, geology: { material: 'slag' } });
const atLocal = (form, lx, lz) => [form.x + lx * form._c - lz * form._s, form.z + lx * form._s + lz * form._c];
assert.equal(geologyRockWeight(shelf, ...atLocal(shelf, 95, 38)), 1, 'a shelf is rock to its margin and its end');
assert.equal(geologyRockWeight(shelf, ...atLocal(shelf, 0, 44.5)), 0, 'and nothing 4 m past its margin');
assert.equal(geologyRockWeight(shelf, ...atLocal(shelf, 104.5, 0)), 0, 'or 4 m past its end');
assert.equal(geologyRockWeight(tip, ...atLocal(tip, 39, 0)), 1, 'a tip is rock out to its base');
assert.equal(geologyRockWeight(tip, ...atLocal(tip, 44.5, 0)), 0, 'and nothing 4 m past it');
assert.equal(createGeologyRockSampler(rockCases.filter(([, rock]) => !rock).map(([form]) => form)), null,
  'no rock landform: no sampler');
const rockSampler = createGeologyRockSampler([shelf, tip, cone]);
let rockPoints = 0, onRock = 0;
for (let z = -200; z <= 200; z += 3.7) for (let x = -250; x <= 200; x += 3.7) {
  const w = rockSampler(x, z);
  assert.equal(w, Math.max(geologyRockWeight(shelf, x, z), geologyRockWeight(tip, x, z)),
    `the sampler is the strongest rock footprint at (${x}, ${z})`);
  rockPoints++;
  if (w === 1) onRock++;
}
// a cliff end: the full section out to 94 % of the half-length, a wall to nothing by the end; the other end tapers
const plainShelf = frame({ ...shelf, geology: { profile: 'butte' } });
const southCliff = frame({ ...shelf, geology: { profile: 'butte', cliffEnd: 1 } });
const crestAt = (form, lx) => sampleLandformHeight(form, ...atLocal(form, lx, 0));
assert.equal(crestAt(shelf, 0.93 * 100), crestAt(shelf, 0), 'a cliff end keeps the full section to 94 % of the half-length');
assert.equal(crestAt(shelf, 100), 0, 'and is gone at the end');
const cliffDrop = (crestAt(shelf, 94) - crestAt(shelf, 100)) / 6;
assert.ok(cliffDrop > 2, `the end is a wall (${cliffDrop.toFixed(2)} m per m)`);
assert.ok(crestAt(plainShelf, 90) < crestAt(plainShelf, 0) * 0.5, 'without a cliff end the crest tapers away');
assert.equal(crestAt(southCliff, 90), crestAt(shelf, 90), 'a +1 cliff end walls the +x end');
assert.equal(crestAt(southCliff, -90), crestAt(plainShelf, -90), 'and leaves the -x end its taper');
// the height field's rock gate: on a map that opts in, inside the rim band the landform mask is the rock footprint
const verdantConfig = getMapConfig('verdant');
const rockMap = createHeightField(1337, { ...verdantConfig, id: undefined,
  terrain: { ...verdantConfig.terrain, mesas: null, landformRock: true, landforms: [shelf, tip, cone].map(({ _c, _s, ...form }) => form) } });
assert.equal(typeof rockMap._mesaW, 'function', 'a map that gates on its rock landforms keeps a landform mask');
let gatePoints = 0;
for (let z = -200; z <= 200; z += 9.1) for (let x = -250; x <= 200; x += 9.1) {
  assert.ok(Math.abs(rockMap._mesaW(x, z) - rockSampler(x, z)) < 1e-9, `the mask is the rock footprint at (${x}, ${z})`);
  gatePoints++;
}

// 16. A sheer jebel (gauntlet wave 16 read Redrock's jebels as "rounded loaf-shaped mounds"; Wadi Rum's are sheer fluted
// sandstone walls rising from flat sand): with a rim the cap stays nearly level, the wall drops most of the height
// near-vertically, flutes set the wall back in grooves, clefts bite back into the cap's edge, bosses break the cap, and
// the talus apron stays at the foot. inselbergSection is the one section the horizon's far jebels share; without a rim
// it is the bornhardt's formula unchanged.
for (let q = 0; q <= 1.0001; q += 0.01) {
  const bornhardt = q >= 1 ? 0 : q <= 0.66 ? 1 - (1 - 0.18) * (q / 0.66) ** 3.2 : 0.18 * ((1 - q) / (1 - 0.66)) ** 2;
  assert.ok(Math.abs(inselbergSection(Math.min(q, 1), 0.66, 0.18, 3.2) - (q >= 1 ? 0 : bornhardt)) < 1e-12,
    `a bornhardt's section is unchanged at q ${q.toFixed(2)}`);
}
const capTop = 0.66 * 0.86;
assert.ok(Math.abs(inselbergSection(0, 0.66, 0.18, 4, 0.86) - inselbergSection(capTop, 0.66, 0.18, 4, 0.86) - 0.08) < 1e-12,
  'the cap falls 8 % of the height to its edge');
assert.ok(Math.abs(inselbergSection(capTop, 0.66, 0.18, 4, 0.86) - inselbergSection(0.66, 0.66, 0.18, 4, 0.86) - 0.74) < 1e-12,
  'the wall drops the rest down to the apron: 74 % of the height');
const bareSheer = { kind: 'knoll', x: 0, z: 0, rx: 40, rz: 40, height: 24,
  geology: { profile: 'inselberg', foot: 0.66, footVary: 0, apron: 0.18, rim: 0.86 } };
let sheerWall = Infinity;
for (let k = 0; k < 24; k++) {
  const a = k / 24 * Math.PI * 2;
  let steepestHere = 0;
  for (let r = 1; r < 40; r += 0.1) steepestHere = Math.max(steepestHere, slopeAlong(bareSheer, a, r));
  sheerWall = Math.min(sheerWall, steepestHere);
  assert.ok(slopeAlong(bareSheer, a, 4) < 0.1, 'the cap is nearly level');
  assert.ok(slopeAlong(bareSheer, a, 0.66 * 40 + 3) < steepestHere * 0.2 && slopeAlong(bareSheer, a, 38) < slopeAlong(bareSheer, a, 0.66 * 40 + 3),
    'below the wall the apron is far gentler, and concave');
}
assert.ok(sheerWall > 6, `the wall is near-vertical on every bearing (${sheerWall.toFixed(1)} m per m, ${(Math.atan(sheerWall) * 180 / Math.PI).toFixed(0)} degrees)`);
// flutes: the wall's foot (where the height falls through the apron's top) wanders round the bearings in grooves
const fluted = { ...bareSheer, geology: { ...bareSheer.geology, flutes: { count: 24, depth: 0.5 } } };
const wallAt = (form, a) => { let r = 0; while (r < 40 && knollGeologyHeight(form, Math.cos(a) * r, Math.sin(a) * r) > 24 * 0.5) r += 0.05; return r; };
const fluteRadii = [];
for (let k = 0; k < 240; k++) fluteRadii.push(wallAt(fluted, k / 240 * Math.PI * 2));
const wallWidth = (0.66 - capTop) * 40;
assert.ok(Math.max(...fluteRadii) - Math.min(...fluteRadii) > 0.3 * wallWidth,
  `flutes set the wall back in grooves (${(Math.max(...fluteRadii) - Math.min(...fluteRadii)).toFixed(2)} m of a ${wallWidth.toFixed(2)} m wall)`);
// bosses break the cap, and never reach past the cap's edge
const bossed = { ...bareSheer, geology: { ...bareSheer.geology, bosses: { count: 5, heightM: 5 } } };
let bossRise = 0;
for (let i = 0; i < 2000; i++) {
  const a = (i * 2.39996) % (Math.PI * 2), r = Math.sqrt((i % 997) / 997) * 40;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const rise = knollGeologyHeight(bossed, x, z) - knollGeologyHeight(bareSheer, x, z);
  if (r >= capTop * 40) assert.equal(rise, 0, `no boss past the cap's edge (${x.toFixed(1)}, ${z.toFixed(1)})`);
  bossRise = Math.max(bossRise, rise);
}
assert.ok(bossRise > 2.5, `bosses rise on the cap (${bossRise.toFixed(2)} m)`);
// clefts bite back into the cap's edge
const clefted = { ...bareSheer, geology: { ...bareSheer.geology, gullies: { count: 10, depthM: 7, width: 0.35 } } };
let cleftBite = 0;
for (let k = 0; k < 360; k++) {
  const a = k / 360 * Math.PI * 2, r = capTop * 40 - 0.5;
  cleftBite = Math.max(cleftBite, knollGeologyHeight(bareSheer, Math.cos(a) * r, Math.sin(a) * r) - knollGeologyHeight(clefted, Math.cos(a) * r, Math.sin(a) * r));
}
assert.ok(cleftBite > 2, `clefts cut back into the cap's edge (${cleftBite.toFixed(2)} m)`);

// 17. Ridge noses (Skybridge's shoulders, 2026-10-03): with `cliffEnd: 'nose'` a ridge's whole section turns round each
// end on a half-disc as wide as the ridge, wall and apron alike. The end's section is the side's; the apron runs on
// round the end where a cliff end cuts it; the margin lobes and rills blend by bearing, so nothing steps at the tip; the
// nose stays inside the ridge's length; and its rock footprint turns round with it.
const noseRidge = frame({ kind: 'ridge', x: 0, z: 0, length: 270, width: 34, height: 18, yawDeg: 90,
  geology: { profile: 'butte', wall: [0.35, 0.6], apron: 0.28, cliffEnd: 'nose' } });
const noseFull = frame({ ...noseRidge, geology: { ...noseRidge.geology, strata: { stepM: 4.5, riser: 0.35 }, outline: 0.25,
  rough: 0.8, gullies: { count: 3, depthM: 2, width: 0.5 } } });
const cutRidge = frame({ ...noseRidge, geology: { ...noseRidge.geology, cliffEnd: 'both' } });
const noseAt = (form, lx, lz) => sampleLandformHeight(form, ...atLocal(form, lx, lz));
let noseWorst = 0;
for (let d = 0; d <= 34; d += 0.5) noseWorst = Math.max(noseWorst, Math.abs(noseAt(noseRidge, 135 - 34 + d, 0) - noseAt(noseRidge, 0, d)));
assert.ok(noseWorst < 1e-9, `a nose's end section is its side section (${noseWorst})`);
let tipStep = 0;
for (let lx = 135 - 34 * 1.25; lx <= 135; lx += 0.25) {
  tipStep = Math.max(tipStep, Math.abs(noseAt(noseFull, lx, 0.01) - noseAt(noseFull, lx, -0.01)));
}
assert.ok(tipStep < 0.01, `nothing steps at the nose's tip (${tipStep.toFixed(4)} m across 2 cm)`);
for (let lz = -45; lz <= 45; lz += 1.5) assert.equal(noseAt(noseFull, 135.5, lz), 0, 'the nose stays inside the ridge\'s length');
// along the apron (22 m off the axis) the nose's ground falls away gently, under half the cliff end's steepest drop
let noseApronDrop = 0, cutApronDrop = 0;
for (let lx = 100; lx < 135; lx += 0.5) {
  noseApronDrop = Math.max(noseApronDrop, (noseAt(noseRidge, lx, 22) - noseAt(noseRidge, lx + 0.5, 22)) / 0.5);
  cutApronDrop = Math.max(cutApronDrop, (noseAt(cutRidge, lx, 22) - noseAt(cutRidge, lx + 0.5, 22)) / 0.5);
}
assert.ok(noseApronDrop < cutApronDrop * 0.5,
  `the apron runs on round a nose (${noseApronDrop.toFixed(2)} m per m) where a cliff end cuts it (${cutApronDrop.toFixed(2)})`);
assert.equal(geologyRockWeight(noseRidge, ...atLocal(noseRidge, 133, 33)), 0, 'a nose\'s rock footprint turns round its end');
assert.equal(geologyRockWeight(cutRidge, ...atLocal(cutRidge, 133, 33)), 1, 'a cut end\'s footprint runs square');

// a dyke (the map-revival lane, 2026-10-06, the Polders): a level crest out to `crest` of the half-width, a batter that
// never rises outward, reaching 0 at the toe, its steepest grade the straight batter's own (height over the batter's
// run, a little more where the rounded shoulder and toe hand the slope on), continuous across the crest's edge and the toe
let dykeSteepest = 0;
{
  const dyke = { kind: 'ridge', x: 0, z: 0, length: 400, width: 16, height: 4.8, yawDeg: 0, geology: { profile: 'dyke', crest: 0.25 } };
  const h = (lz) => sampleLandformHeight(dyke, 0, lz);
  for (const lz of [0, 1, 2, 3.9]) assert.ok(Math.abs(h(lz) - 4.8) < 1e-9 && Math.abs(h(-lz) - 4.8) < 1e-9, `a dyke's crest is level (${lz} m: ${h(lz)})`);
  assert.ok(h(16) === 0 && h(17) === 0, 'a dyke ends at its toe');
  let prev = h(4);
  for (let lz = 4.05; lz <= 16; lz += 0.05) {
    const v = h(lz);
    assert.ok(v <= prev + 1e-9, `a dyke's batter never rises outward (${lz.toFixed(2)} m)`);
    assert.ok(prev - v < 4.8 * 0.05 / (12 * 0.875) + 1e-6, `no step in a dyke's batter at ${lz.toFixed(2)} m (${(prev - v).toFixed(4)})`);
    dykeSteepest = Math.max(dykeSteepest, (prev - v) / 0.05);
    prev = v;
  }
  const straight = 4.8 / 12;
  assert.ok(dykeSteepest > straight && dykeSteepest < straight / 0.875 + 1e-6, `the batter's grade is the straight batter's (${dykeSteepest.toFixed(3)} vs ${straight.toFixed(3)})`);
  // the profile is the analytic one with or without the dome's fields: a dyke is never rock and names no zone
  assert.equal(isRockLandform(dyke), false, 'a dyke is earth, not rock');
}

console.log(`landformGeology.selftest: ${smoothForms} smooth landforms unchanged; cone flank ${steepest.toFixed(3)} `
  + `(predicted ${predicted.toFixed(3)}), ${notches} rills, lobed reach ${Math.min(...reach)}-${Math.max(...reach)} m, `
  + `${benches} benches on ${benchedBearings} of 12 bearings, `
  + `flow margin ${Math.min(...edges)}-${Math.max(...edges)} m, ${seamSamples} seam samples continuous (${wallSamples} on an inselberg's wall), ${fanPeaks} talus fans, flow levee ${(levee - channel).toFixed(2)} m front ${frontSlope.toFixed(2)} vent ${ventSlope.toFixed(2)}; zones: flow ${flowInside} inside, ${flowFaded} faded, cone ${coneInside} inside, fans ${fanPositive} of ${fanSamples} toe samples, sampler ${samplerPoints} points; Caldera's mask = its flow zone at ${maskPoints} points (${onFlows} on flows); inselberg wall ${steepestWall.toFixed(2)}, foot ${Math.min(...breaks)}-${Math.max(...breaks)} m, ${nearFoot} of ${boulderSites} boulder sites near the foot; rock: ${onRock} of ${rockPoints} sampler points on rock, cliff end ${cliffDrop.toFixed(2)} m per m, the rock gate matches at ${gatePoints} points; sheer jebel wall ${sheerWall.toFixed(1)} m per m, flutes ${(Math.max(...fluteRadii) - Math.min(...fluteRadii)).toFixed(2)} m, bosses ${bossRise.toFixed(2)} m, clefts ${cleftBite.toFixed(2)} m; nose apron ${noseApronDrop.toFixed(2)} m per m (a cut end ${cutApronDrop.toFixed(2)}); dyke batter ${dykeSteepest.toFixed(3)} per m`);
