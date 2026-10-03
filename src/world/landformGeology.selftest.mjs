// Landform geology (src/world/landformGeology.ts; maps lane, 2026-10-03): the gauntlet's wave-0 critics read every
// landform as a smooth shell. A landform with `geology` takes a lobed outline, a butte or cone profile, rills, bedding
// and a knobbly surface; one without it keeps its exact smooth shape. This receipt holds both halves of that contract.
import assert from 'node:assert/strict';
import { createHeightField, sampleLandformHeight } from './terrain.ts';
import {
  createGeologyZoneSampler, geologyBoulderSite, geologyZoneWeights, knollGeologyHeight, ridgeGeologyHeight,
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
// (steeper than 3:1 by design), where the rise is still spread over the step, as a seam's is not.
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
      assert.ok(form.geology.profile === 'inselberg' && jump <= 0.06 && split < 0.8,
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

console.log(`landformGeology.selftest: ${smoothForms} smooth landforms unchanged; cone flank ${steepest.toFixed(3)} `
  + `(predicted ${predicted.toFixed(3)}), ${notches} rills, lobed reach ${Math.min(...reach)}-${Math.max(...reach)} m, `
  + `${benches} benches on ${benchedBearings} of 12 bearings, `
  + `flow margin ${Math.min(...edges)}-${Math.max(...edges)} m, ${seamSamples} seam samples continuous (${wallSamples} on an inselberg's wall), ${fanPeaks} talus fans, flow levee ${(levee - channel).toFixed(2)} m front ${frontSlope.toFixed(2)} vent ${ventSlope.toFixed(2)}; zones: flow ${flowInside} inside, ${flowFaded} faded, cone ${coneInside} inside, fans ${fanPositive} of ${fanSamples} toe samples, sampler ${samplerPoints} points; Caldera's mask = its flow zone at ${maskPoints} points (${onFlows} on flows); inselberg wall ${steepestWall.toFixed(2)}, foot ${Math.min(...breaks)}-${Math.max(...breaks)} m, ${nearFoot} of ${boulderSites} boulder sites near the foot`);
