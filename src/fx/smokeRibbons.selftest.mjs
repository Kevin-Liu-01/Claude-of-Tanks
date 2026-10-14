// smokeRibbons.selftest.mjs — EF.04 (the owner: "fix the missile trace from launching missiles, make that look a lot
// better and be unique for different tank types and missile types!"). A missile's smoke trail is one continuous ribbon:
// every point the motor passed joins its neighbour (no beads), oldest to newest even after the ring wraps; a point is
// written once and only its own ranges upload; slots are reused stalest first; the ribbon ages and drifts in the shader
// with the media's own light. Round 9a's media-only trail (puffs 3.5-12 m apart, born 0.3-1.2 m wide) covered 4-27 % of
// its young length from the side (the trailCadence side-view measure on round 9a's recipe: TOW 0.15, Kornet 0.04, Hellfire 0.19,
// Stinger 0.10); the ribbon covers all of it by construction.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSmokeRibbons, RIBBON_POINTS, RIBBON_SLOTS } from './smokeRibbons.ts';

const shading = {
  uTime: { value: 0 }, uWind: { value: new THREE.Vector3(1, 0, 0.5) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Vector3(1, 1, 1) }, uSkyCol: { value: new THREE.Vector3(0.3, 0.3, 0.3) },
  uGroundCol: { value: new THREE.Vector3(0.1, 0.1, 0.1) },
};
const look = Object.freeze({ width0: 0.3, width1: 2.2, life: 5, density: 0.5, c0: [0.6, 0.6, 0.58], c1: [0.65, 0.64, 0.62],
  rise: 0.15, windK: 0.8, tear: 0.5 });
const r = createSmokeRibbons(shading);
const geo = r.mesh.geometry, index = geo.index.array;
const mat = r.mesh.material;
assert.equal(mat.uniforms.uSunCol, shading.uSunCol, 'lit by the media\'s own light uniforms (the time of day)');
assert.equal(mat.uniforms.uWind, shading.uWind, 'and carried by their wind');
assert.ok(mat.transparent && !mat.depthWrite && mat.blending === THREE.NormalBlending, 'normal-blended smoke, no depth write');
assert.ok(r.mesh.renderOrder > 21 && r.mesh.renderOrder < 21.4, 'drawn in the late pass just under the media');
assert.equal(r.mesh.visible, false, 'nothing drawn while no ribbon is alive');

const quadsOf = (slot) => {
  const out = [];
  const o0 = slot * (RIBBON_POINTS - 1) * 6, base = slot * RIBBON_POINTS * 2;
  for (let j = 0; j < RIBBON_POINTS - 1; j++) {
    const o = o0 + j * 6;
    if (index[o] === index[o + 1] && index[o] === index[o + 2]) continue;
    out.push([(index[o] - base) / 2, (index[o + 2] - base) / 2]);
  }
  return out;
};
const posOf = (slot, k) => geo.getAttribute('aP').array.slice((slot * RIBBON_POINTS + k) * 8, (slot * RIBBON_POINTS + k) * 8 + 4);

// 1. a ribbon joins every point to the next: 40 points, 39 quads, in flight order
const a = r.begin(101, look, 0.3);
for (let i = 0; i < 40; i++) r.point(a, 0, 2, i * 2.5, i * 0.0125);
let q = quadsOf(a);
assert.equal(q.length, 39, 'one quad between each pair of neighbours');
assert.ok(q.every(([p0, p1], j) => p0 === j && p1 === j + 1), 'oldest to newest');
assert.equal(r.slotOf(101), a);
r.update(0.5);
assert.equal(r.mesh.visible, true, 'drawn while it lives');
// 2. a long flight wraps the ring: still one strip, oldest point first, the newest last
for (let i = 40; i < 250; i++) r.point(a, 0, 2, i * 2.5, i * 0.0125);
q = quadsOf(a);
assert.equal(q.length, RIBBON_POINTS - 1, 'a wrapped ribbon keeps every point it holds joined');
const zs = q.map(([p0]) => posOf(a, p0)[2]);
assert.ok(zs.every((z, i) => i === 0 || z > zs[i - 1]), 'in flight order across the seam');
assert.equal(posOf(a, q.at(-1)[1])[2], 249 * 2.5, 'the newest point ends it');
// 3. the tangent: each point toward its successor; both edges of a point share it with opposite sides
const aT = geo.getAttribute('aT').array;
const k = q[5][0], o = (a * RIBBON_POINTS + k) * 8;
assert.deepEqual([aT[o], aT[o + 1], aT[o + 2], aT[o + 3], aT[o + 7]], [0, 0, 1, -1, 1], 'tangent along the flight; sides -1 and +1');
// 4. only what changed uploads: a point marks its own two vertices (and its predecessor's tangent), never the buffer
const aP = geo.getAttribute('aP');
aP.clearUpdateRanges();
r.point(a, 0, 2, 250 * 2.5, 250 * 0.0125);
assert.equal(aP.updateRanges.length, 1, 'one range');
assert.equal(aP.updateRanges[0].count, 8, 'two vertices x 4 floats');
// 5. slots: a key keeps its slot; when every slot is taken the one burning out soonest is reused
const slots = new Set([a]);
for (let i = 0; i < RIBBON_SLOTS - 1; i++) { const s = r.begin(200 + i, look, i / 30); r.point(s, i, 2, 0, 1 + i * 0.01); slots.add(s); }
assert.equal(slots.size, RIBBON_SLOTS);
assert.equal(r.begin(101, look, 0.3), a, 'a live key keeps its slot');
const first = r.slotOf(200);
const reused = r.begin(999, look, 0.9);
assert.equal(reused, first, 'all taken: the ribbon that burns out soonest (its last point the oldest) gives way');
assert.equal(quadsOf(reused).length, 0, 'and starts empty');
// 6. time shifts move every birth; reset clears every ribbon
const live = r.slotOf(201), before = posOf(live, 0)[3];
r.shiftTime(10);
assert.ok(Math.abs(posOf(live, 0)[3] - (before + 10)) < 1e-4, 'the fx clock rebase moves the births');
r.reset();
assert.equal(r.mesh.visible, false);
for (let s = 0; s < RIBBON_SLOTS; s++) assert.equal(quadsOf(s).length, 0, 'reset: no quads');
// 7. no allocation per point: the attributes and the index keep their buffers
const arrays = ['aP', 'aT', 'aW', 'aC0', 'aC1', 'aS'].map((n) => geo.getAttribute(n).array);
const s0 = r.begin(5, look, 0.1);
for (let i = 0; i < 300; i++) r.point(s0, 1, 2, i, i * 0.01);
assert.ok(['aP', 'aT', 'aW', 'aC0', 'aC1', 'aS'].every((n, i) => geo.getAttribute(n).array === arrays[i]), 'buffers kept');
assert.equal(geo.index.array, index, 'index kept');
// 8. the shader ages, swells and tears it (the receipt reads the production GLSL)
assert.match(mat.vertexShader, /float grow = 1\.0 - pow\( 1\.0 - t, 2\.6 \);/, 'it swells fast behind the motor');
assert.match(mat.vertexShader, /uSunCol \* fwd/, 'the sun through thin smoke, brighter toward it');
assert.match(mat.fragmentShader, /float edge = 1\.0 - smoothstep\(/, 'a soft torn edge');
// the first ~1.5 s of a flight lays a denser, warmer-grey, wider line (read at play distance), then the motor's own
assert.match(mat.vertexShader, /float early = 1\.0 - smoothstep\( 0\.7, 1\.6, aS\.w \);/, 'the launch stretch is marked by flight time');
{
  const r2 = createSmokeRibbons(shading), sl = r2.begin(1, look, 0.2);
  r2.point(sl, 0, 2, 0, 1, 0.4); r2.point(sl, 0, 2, 2.5, 1.01, 2.2);
  const s2 = r2.mesh.geometry.getAttribute('aS').array;
  assert.deepEqual([s2[3], s2[7], s2[11]].map((v) => +v.toFixed(2)), [0.4, 0.4, 2.2], 'each point carries its flight time');
}
console.log('smokeRibbons.selftest: continuous ribbons, ring order, per-point uploads, slot reuse, time shift, reset, no allocation');
