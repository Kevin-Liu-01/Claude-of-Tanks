// Landform geology (src/world/landformGeology.ts; maps lane, 2026-10-03): the gauntlet's wave-0 critics read every
// landform as a smooth shell. A landform with `geology` takes a lobed outline, a butte or cone profile, rills, bedding
// and a knobbly surface; one without it keeps its exact smooth shape. This receipt holds both halves of that contract.
import assert from 'node:assert/strict';
import { sampleLandformHeight } from './terrain.ts';
import { knollGeologyHeight, ridgeGeologyHeight } from './landformGeology.ts';
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
// (where the bearing wraps) and none at a breached crater's centre, where every bearing meets. A 1 cm step never moves
// the ground more than 3 cm on these forms (no strata here, whose risers are walls by design).
const seamTests = [
  frame({ kind: 'knoll', x: 0, z: 0, rx: 48, rz: 60, height: 24, yawDeg: 0, geology: { profile: 'cone',
    crater: { rim: 0.16, depthM: 4, breachDeg: 200 }, outline: 0.1, gullies: { count: 11, depthM: 3.2, width: 0.6 },
    rough: 1.1 } }),
  frame({ kind: 'knoll', x: 0, z: 0, rx: 60, rz: 60, height: 18, yawDeg: 0, geology: { profile: 'cone',
    crater: { rim: 0.15, depthM: 2.5, breachDeg: 180 }, outline: 0.14, gullies: { count: 12, depthM: 3.5, width: 0.6 },
    rough: 1.1 } }),
  frame({ kind: 'ridge', x: 0, z: 0, length: 200, width: 60, height: 7, yawDeg: 0, geology: { profile: 'butte',
    wall: [0.4, 0.58], apron: 0.25, outline: 0.28, rough: 0.7, gullies: { count: 3, depthM: 1.2, width: 0.6 } } }),
];
let seamSamples = 0;
for (const form of seamTests) {
  const reach = Math.max(form.rx ?? 0, form.rz ?? 0, (form.length ?? 0) / 2, form.width ?? 0) * 1.4;
  for (let z = -reach; z <= reach; z += 0.37) for (let x = -reach; x <= reach; x += 0.37) {
    const h = sampleLandformHeight(form, x, z);
    for (const [dx, dz] of [[0.01, 0], [0, 0.01]]) {
      seamSamples++;
      const jump = Math.abs(sampleLandformHeight(form, x + dx, z + dz) - h);
      assert.ok(jump <= 0.03, `${form.kind} geology is continuous at (${x.toFixed(2)}, ${z.toFixed(2)}): ${jump.toFixed(3)} m in 1 cm`);
    }
  }
}

console.log(`landformGeology.selftest: ${smoothForms} smooth landforms unchanged; cone flank ${steepest.toFixed(3)} `
  + `(predicted ${predicted.toFixed(3)}), ${notches} rills, lobed reach ${Math.min(...reach)}-${Math.max(...reach)} m, `
  + `${benches} benches on ${benchedBearings} of 12 bearings, `
  + `flow margin ${Math.min(...edges)}-${Math.max(...edges)} m, ${seamSamples} seam samples continuous`);
