// Ground lane (2026-10-08, the coordinator's backlog after wave 265's weathering critics: "tank track marks … a decaying
// ring buffer of marks (soil, sand, snow) … grass flattened in the hull's path; MP-safe, cosmetic only"): the track
// marks. The ring and its material (one draw, a 2x modulate of the drawn ground, no depth write, no shadow, never
// culled), the strips a driving hull lays (a pair every 0.8 m of each track's travel, across the track at its
// centreline, on the ground mesh lifted 3 cm, u/v/birth/ground per vertex), what lays none (a standing hull, a hull past
// the fade, the water — the FX layer's wakes), a jump that breaks a strip, the grounds' codes, the ring's wrap and its
// fade, the battle's reset; and the wiring (the world lays and clears them, the presentation stamps every presented
// hull, the FX layer's dry prints stand down, the tufts lie down in the hulls' press) — no renderer, no GPU/art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { TRACK_MARKS, TRACK_MARK_GROUND, createTrackMarks } from './trackMarks.ts';
import { terrainNearMeshHeightAt } from './terrain.ts';

const height = (x, z) => 0.6 * Math.sin(x * 0.07) + 0.4 * Math.cos(z * 0.05) + 0.002 * x;
const field = {
  getHeightAt: height,
  // a road along x = 100, sand east of x = 200, snow north of z = 200, a marsh at (-100, 0), a pond at (0, -100)
  getGroundType: (x, z) => (Math.abs(x - 100) < 4 ? 'hard' : Math.hypot(x + 100, z) < 20 ? 'soft' : 'medium'),
  getTrackSurfaceAt: (x, z) => (x > 200 ? 2 : z > 200 ? 3 : 0),
  getWaterMaskAt: (x, z) => (Math.hypot(x, z + 100) < 10 ? 1 : 0),
};
const meshAt = (x, z) => terrainNearMeshHeightAt(height, x, z);

// 1. The ring and its material.
const marks = createTrackMarks(field, { segments: 256 });
const geo = marks.mesh.geometry, mat = marks.mesh.material;
assert.equal(geo.getAttribute('position').count, 256 * 4, 'four vertices a segment');
assert.equal(geo.getAttribute('aMark').itemSize, 4, 'u, v, birth, ground');
assert.equal(geo.index.count, 256 * 6, 'two triangles a segment, one draw');
assert.ok(mat.isShaderMaterial && mat.transparent && !mat.depthWrite && mat.depthTest && mat.polygonOffset && !mat.fog, 'a decal pass over the ground');
assert.equal(mat.blending, THREE.CustomBlending);
assert.equal(mat.blendSrc, THREE.DstColorFactor); assert.equal(mat.blendDst, THREE.SrcColorFactor);
assert.equal(mat.blendEquation, THREE.AddEquation, 'out = 2 · src · dst: the ground modulated, its own light kept');
assert.equal(mat.blendSrcAlpha, THREE.ZeroFactor); assert.equal(mat.blendDstAlpha, THREE.OneFactor, 'the target\'s alpha untouched');
assert.ok(mat.fragmentShader.includes('gl_FragColor = vec4(m * 0.5, 1.0);'), '0.5 leaves the ground as it is');
assert.ok(mat.vertexShader.includes('gl_Position = a <= 0.001 ? vec4(0.0, 0.0, 2.0, 1.0)'), 'the dead and the far are dropped in the vertex stage');
assert.ok(!marks.mesh.frustumCulled && !marks.mesh.castShadow && !marks.mesh.receiveShadow, 'never culled, no shadow');
for (let i = 0; i < 256 * 4; i++) assert.equal(geo.getAttribute('aMark').getZ(i), 1e9, 'every slot unborn (invisible) at first');
{
  // every uniform finite (an infinite edge made the ring's fade NaN on the GPU and every mark vanished) and the ring's
  // fade off until it wraps
  const u = mat.uniforms.uLife.value;
  assert.ok([u.x, u.y, u.z, u.w].every(Number.isFinite) && u.w === 0, 'no ring fade before the ring wraps');
  assert.ok(mat.vertexShader.includes('if (uLife.w > 0.0) a *= smoothstep(uLife.z, uLife.z + uLife.w, birth);'), 'the shader skips it then');
}

// 2. A hull driving 20 m north at 8 m/s, stamped at 60 Hz: each track lays a pair every 0.8 m of its travel.
const tank = {};
const halfGauge = 1.5, trackW = 0.6;
marks.update(0, { x: 0, y: 5, z: -30 });
let z = 0;
for (let i = 0; i <= 150; i++) {
  marks.update(1 / 60, { x: 0, y: 5, z: z - 30 });
  marks.stamp(tank, 0, z, 0, 1, 8, halfGauge, trackW);
  z += 8 / 60;
}
const st = marks.stats();
assert.equal(st.tracks, 2, 'two tracks followed');
// (a pair is laid at the first frame a track has gone 1 m: at 8 m/s in 60 Hz frames that is every 1.0–1.07 m)
assert.ok(st.written >= 2 * Math.floor(20 / 1.07) && st.written <= 2 * Math.floor(20.2 / TRACK_MARKS.spacingM),
  `two strips of a pair every 1.0–1.07 m (${st.written} segments)`);
const pos = geo.getAttribute('position'), mk = geo.getAttribute('aMark');
for (let s = 0; s < st.written; s++) {
  const xs = [0, 1, 2, 3].map((k) => pos.getX(s * 4 + k));
  const centre = (xs[0] + xs[1]) / 2;
  assert.ok(Math.abs(Math.abs(centre) - halfGauge) < 1e-4, 'the strip at a track\'s centreline');
  assert.ok(Math.abs(Math.abs(xs[1] - xs[0]) - trackW) < 1e-4, 'across the track\'s width');
  for (let k = 0; k < 4; k++) {
    const v = s * 4 + k;
    assert.ok(Math.abs(pos.getY(v) - (meshAt(pos.getX(v), pos.getZ(v)) + TRACK_MARKS.liftM)) < 1e-4, 'on the drawn ground, lifted 3 cm');
    assert.equal(Math.abs(mk.getX(v)), 1, 'u at the edges');
    assert.equal(mk.getW(v), TRACK_MARK_GROUND.earth, 'on earth');
  }
  assert.ok(mk.getY(s * 4 + 2) - mk.getY(s * 4) >= TRACK_MARKS.spacingM - 1e-6, 'v runs along the strip in metres');
  // both triangles face up (the material culls back faces: a downward quad is dropped seen from above)
  for (let t = 0; t < 2; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => {
      const v = geo.index.getX(s * 6 + t * 3 + k);
      return new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
    });
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    assert.ok(n.y > 0, 'a mark\'s triangle faces up');
  }
  assert.ok(mk.getZ(s * 4) > 0 && mk.getZ(s * 4) <= 151 / 60 + 1e-6, 'born on the marks\' clock');
}

// 3. What lays nothing: a standing hull, a hull past the fade, the water; a jump breaks the strip.
{
  const m = createTrackMarks(field, { segments: 64 });
  m.update(0, { x: 0, y: 5, z: 0 });
  const k = {};
  for (let i = 0; i < 60; i++) m.stamp(k, 0, i * 0.05, 0, 1, 0.2, halfGauge, trackW);
  assert.equal(m.stats().written, 0, 'a crawling hull (0.2 m/s) lays nothing');
  for (let i = 0; i < 60; i++) m.stamp({}, 0, 300 + i * 0.2, 0, 1, 8, halfGauge, trackW);
  assert.equal(m.stats().written, 0, 'a hull past the camera gate lays nothing');
  // the capture tools' staging path lays its hulls past the gate, and the gate holds again after it
  const laid = m.layPaths([[0, 300, 0, 320]]);
  assert.ok(laid > 100 && m.stats().written >= 2 * Math.floor(20 / 1.07), `layPaths drives past the gate (${m.stats().written} segments)`);
  const after = m.stats().written;
  for (let i = 0; i < 60; i++) m.stamp({}, 0, 330 + i * 0.2, 0, 1, 8, halfGauge, trackW);
  assert.equal(m.stats().written, after, 'the gate holds again after the staging');
  m.reset(); m.update(0, { x: 0, y: 5, z: -100 });
  const w = {};
  // across the 20 m pond and 15 m of bank either side
  for (let i = 0; i <= 200; i++) m.stamp(w, -25 + i * 0.25, -100, 1, 0, 8, halfGauge, trackW);
  const across = m.stats().written;
  assert.ok(across >= 2 * Math.floor(28 / 1.07) && across <= 2 * Math.floor(32 / TRACK_MARKS.spacingM), `no mark in the pond (${across} on its banks)`);
  for (let s = 0; s < across; s++) {
    const x = m.mesh.geometry.getAttribute('position').getX(s * 4 + 2);
    assert.ok(Math.abs(x) > 8, `nothing laid inside the water (a pair at x ${x.toFixed(2)})`);
  }
  const j = {};
  m.stamp(j, 0, 20, 0, 1, 8, halfGauge, trackW);
  const before = m.stats().written;
  m.stamp(j, 30, 20, 0, 1, 8, halfGauge, trackW);
  assert.equal(m.stats().written, before, 'a jump (a respawn) starts a new strip: no segment across it');
}

// 4. The grounds: a road's hard surface, the marsh's mud, sand, snow.
{
  const m = createTrackMarks(field, { segments: 64 });
  const groundOf = (x0, z0) => {
    m.reset();
    m.update(0, { x: x0, y: 5, z: z0 });
    const k = {};
    for (let i = 0; i < 20; i++) m.stamp(k, x0, z0 + i * 0.3, 0, 1, 8, 0.5, 0.6);
    return m.mesh.geometry.getAttribute('aMark').getW(0);
  };
  assert.equal(groundOf(100, 0), TRACK_MARK_GROUND.hard, 'a road: hard');
  assert.equal(groundOf(-100, 0), TRACK_MARK_GROUND.mud, 'a marsh: mud');
  assert.equal(groundOf(250, 0), TRACK_MARK_GROUND.sand, 'sand');
  assert.equal(groundOf(0, 250), TRACK_MARK_GROUND.snow, 'snow');
}

// 5. The ring wraps: the oldest marks are overwritten, and the fade runs over the oldest fifth of the span it holds.
{
  const m = createTrackMarks(field, { segments: 64 });
  const k = {};
  let zz = 0;
  for (let i = 0; i < 1200; i++) {
    m.update(1 / 60, { x: 0, y: 5, z: zz });
    m.stamp(k, 0, zz, 0, 1, 8, halfGauge, trackW);
    zz += 8 / 60;
  }
  assert.ok(m.stats().written > 64, 'more written than the ring holds');
  const u = m.mesh.material.uniforms.uLife.value;
  assert.ok(Number.isFinite(u.z) && u.z > 0 && u.w > 0, 'the oldest held mark\'s birth');
  const now = m.mesh.material.uniforms.uTime.value;
  assert.ok(Math.abs(u.w - Math.max(1, (now - u.z) * TRACK_MARKS.ringFade)) < 1e-9, 'its fade over a fifth of the span held');
  // 6. A battle's reset: nothing held, the strips forgotten
  m.reset();
  assert.equal(m.stats().written, 0);
  for (let i = 0; i < 64 * 4; i++) assert.equal(m.mesh.geometry.getAttribute('aMark').getZ(i), 1e9, 'every slot unborn again');
  m.update(1 / 60, { x: 0, y: 5, z: zz });
  m.stamp(k, 0, zz, 0, 1, 8, halfGauge, trackW);
  assert.equal(m.stats().written, 0, 'the hull\'s first frame after the reset starts new strips');
  m.dispose();
}

// 7. The wiring.
{
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  assert.ok(map.includes('trackMarks.reset(); // ground lane: every battle starts on clean ground'), 'the world clears them with the destructibles');
  assert.ok(map.includes('trackMarks.update(dt, cameraPos);'), 'their clock and fade ride the world\'s update');
  assert.ok(map.includes('heightField.trackMarksActive = () => true;'), 'the FX layer is told');
  assert.ok(map.includes('vegetation.bindGroundPressure?.(tallGrass.pressure);'), 'the tufts lie down in the hulls\' press');
  assert.ok(map.includes('stampTrackMarks(key, x, z, fx, fz, speed, halfGaugeM, trackWidthM) { trackMarks.stamp('), 'the world takes the stamps');
  const pres = readFileSync(new URL('../game/battlePresentationRuntime.ts', import.meta.url), 'utf8');
  assert.ok(pres.includes('world.stampTrackMarks(entity, presented.pos.x, presented.pos.z, forward.x, forward.z, speed,'),
    'every presented hull stamps (a hidden one is never presented)');
  const fx = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
  assert.ok(fx.includes('if (intensity > 0.08 && !frozen && !heightField?.trackMarksActive?.()) stampTrackPrint(pos, dir, false, surface);'),
    'the FX layer\'s dry prints stand down (its wakes stay)');
  const veg = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  assert.ok(veg.includes('transformed.y *= 1.0 - 0.75 * tuftPress;') && veg.includes("'world-grass-wind-v12'") && veg.includes("'world-grass-carpet-v11'"),
    'the tufts pressed to a quarter of their height (their programs re-keyed)');
}

console.log(`trackMarks: the ring and its modulate material, two strips of ${st.written} segments on the drawn ground, nothing from a standing `
  + 'or far hull or in water, the jump break, the grounds, the wrap fade, the reset and the wiring PASS; no GPU/art claim');
