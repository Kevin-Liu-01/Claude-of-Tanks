// Item 45 (2026-10-22, world-ruts-rocks-241): the ruts behind the tanks (world/trackMarks.ts; the ground lane's track
// marks of 2026-10-08 re-cut onto today's ground). The ring and its material (one draw, a 2x modulate of the drawn
// ground, no depth write, no shadow, never culled), the strips a driving hull lays (a pair every TRACK_MARKS.spacingM of
// each track's own path, placed on the path so the same drive lays the same pairs at any stamp rate, across the track
// and its berms at its centreline, on the ground mesh lifted), what lays none (a standing hull, water, a paved road, a
// rock slope, ice and a bridge deck), the grounds and their lives, a jump that breaks a strip, the ring's wrap and its
// fade, a crater's bowl and flank, the battle's reset, the quality presets' budget, and the wiring (the simulation's
// poses lay them, the world clears them, the FX layer's dry prints stand down) — no renderer, no GPU/art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { TRACK_MARKS, TRACK_MARK_GROUND, TRACK_MARK_GROUND_LIFE, createTrackMarks, trackMarkSegmentsFor } from './trackMarks.ts';
import { terrainNearMeshHeightAt } from './terrain.ts';

const height = (x, z) => 0.6 * Math.sin(x * 0.07) + 0.4 * Math.cos(z * 0.05) + 0.002 * x
  // a steep bank (a rock face's slope) east of x = 400
  + (x > 400 ? (x - 400) * 0.9 : 0);
const field = {
  getHeightAt: height,
  // a dirt road along x = 100, a paved street along x = 140, sand east of x = 200, snow north of z = 200, a marsh at
  // (-100, 0), a pond at (0, -100), an iced lake at (-200, -200), a ploughed field west of x = -300
  getGroundType: (x, z) => (Math.abs(x - 100) < 4 || Math.abs(x - 140) < 4 ? 'hard'
    : Math.hypot(x + 200, z + 200) < 20 ? 'hard' : Math.hypot(x + 100, z) < 20 ? 'soft' : 'medium'),
  _roadDist: (x) => Math.min(Math.abs(x - 100), Math.abs(x - 140)),
  getRoadPaveAt: (x) => (Math.abs(x - 140) < 4 ? 1 : 0),
  getTrackSurfaceAt: (x, z) => (x > 200 && x < 400 ? 2 : z > 200 ? 3 : 0),
  getWaterMaskAt: (x, z) => (Math.hypot(x, z + 100) < 10 ? 1 : 0),
  _landUseAt: (x, z, out) => {
    out.active = x < -300 ? 1 : 0; out.crop = 4; out.edgeM = 50; out.marginM = 3; out.track = 0;
    return out;
  },
};
const meshAt = (x, z) => terrainNearMeshHeightAt(height, x, z);
const halfGauge = 1.5, trackW = 0.6;
const STEP = 1 / 60;
/** Drive `key` along z from z0 by `metres` at `speed`, stamped `rate` times a simulated second (the clock at 60 Hz). */
function drive(m, key, x, z0, metres, speed = 8, rate = 60, yaw = 0) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const n = Math.round(metres / speed * rate);
  for (let i = 0; i <= n; i++) {
    m.advance(i === 0 ? 0 : 1 / rate);
    const d = i * speed / rate;
    m.stamp(key, x + fx * d, z0 + fz * d, yaw, halfGauge, trackW, 1);
  }
}

// 1. The ring and its material.
const marks = createTrackMarks(field, { segments: 256 });
const geo = marks.mesh.geometry, mat = marks.mesh.material;
assert.equal(geo.getAttribute('position').count, 256 * 4, 'four vertices a segment');
assert.equal(geo.getAttribute('aMark').itemSize, 4, 'u, v, birth, ground and weight');
assert.equal(geo.getAttribute('aMark2').itemSize, 4, 'depth, slip, the across direction by the half track');
assert.equal(geo.index.count, 256 * 6, 'two triangles a segment, one draw');
assert.ok(mat.isShaderMaterial && mat.transparent && !mat.depthWrite && mat.depthTest && mat.polygonOffset && !mat.fog, 'a decal pass over the ground');
assert.equal(mat.blending, THREE.CustomBlending);
assert.equal(mat.blendSrc, THREE.DstColorFactor); assert.equal(mat.blendDst, THREE.SrcColorFactor);
assert.equal(mat.blendEquation, THREE.AddEquation, 'out = 2 · src · dst: the ground modulated, its own light kept');
assert.equal(mat.blendSrcAlpha, THREE.ZeroFactor); assert.equal(mat.blendDstAlpha, THREE.OneFactor, 'the target\'s alpha untouched');
assert.ok(mat.fragmentShader.includes('gl_FragColor = vec4(clamp(m * 0.5, 0.0, 1.0), 1.0);'), '0.5 leaves the ground as it is');
assert.ok(mat.fragmentShader.includes('float lit = clamp(max(dot(n, sun), 0.0) / level'), 'the relief lit by the sun against the level ground');
assert.ok(mat.vertexShader.includes('gl_Position = a <= 0.001 ? vec4(0.0, 0.0, 2.0, 1.0)'), 'the dead and the far are dropped in the vertex stage');
assert.ok(!marks.mesh.frustumCulled && !marks.mesh.castShadow && !marks.mesh.receiveShadow, 'never culled, no shadow');
for (let i = 0; i < 256 * 4; i++) assert.equal(geo.getAttribute('aMark').getZ(i), 1e9, 'every slot unborn (invisible) at first');
{
  const u = mat.uniforms.uLife.value;
  assert.ok([u.x, u.y, u.z, u.w].every(Number.isFinite) && u.w === 0, 'no ring fade before the ring wraps');
  assert.ok(mat.vertexShader.includes('if (uLife.w > 0.0) a *= smoothstep(uLife.z, uLife.z + uLife.w, birth);'), 'the shader skips it then');
  const g0 = mat.uniforms.uGroundLife0.value, g1 = mat.uniforms.uGroundLife1.value;
  assert.deepEqual([g0.x, g0.y, g0.z, g0.w, g1.x, g1.y], [0, 1, 2, 3, 4, 5].map((g) => TRACK_MARK_GROUND_LIFE[g]), 'each ground\'s life');
  assert.ok(TRACK_MARK_GROUND_LIFE[TRACK_MARK_GROUND.snow] > TRACK_MARK_GROUND_LIFE[TRACK_MARK_GROUND.sand]
    && TRACK_MARK_GROUND_LIFE[TRACK_MARK_GROUND.mud] > TRACK_MARK_GROUND_LIFE[TRACK_MARK_GROUND.grass], 'snow and mud keep them longest');
}

// 2. A hull driving 20 m north at 8 m/s, stamped at the simulation's 60 Hz: each track lays a pair every spacing.
const tank = {};
marks.update({ x: 0, y: 5, z: -30 });
drive(marks, tank, 0, 0, 20);
const st = marks.stats();
assert.equal(st.hulls, 1, 'one hull followed');
assert.equal(st.written, 2 * Math.floor(20 / TRACK_MARKS.spacingM + 1e-9), `two strips of a pair every ${TRACK_MARKS.spacingM} m (${st.written})`);
const pos = geo.getAttribute('position'), mk = geo.getAttribute('aMark'), mk2 = geo.getAttribute('aMark2');
const stripHalf = trackW * 0.5 * TRACK_MARKS.berm;
for (let s = 0; s < st.written; s++) {
  const xs = [0, 1, 2, 3].map((k) => pos.getX(s * 4 + k));
  const centre = (xs[0] + xs[1]) / 2;
  assert.ok(Math.abs(Math.abs(centre) - halfGauge) < 1e-4, 'the strip at a track\'s centreline');
  assert.ok(Math.abs(Math.abs(xs[1] - xs[0]) - 2 * stripHalf) < 1e-4, 'across the track and its berms');
  for (let k = 0; k < 4; k++) {
    const v = s * 4 + k;
    assert.ok(Math.abs(pos.getY(v) - (meshAt(pos.getX(v), pos.getZ(v)) + TRACK_MARKS.liftM)) < 1e-4, 'on the drawn ground, lifted');
    assert.equal(Math.abs(mk.getX(v)), 1, 'u at the edges');
    assert.equal(Math.floor(mk.getW(v)), TRACK_MARK_GROUND.grass, 'on grass');
    assert.ok(mk.getW(v) - Math.floor(mk.getW(v)) > 0.99, 'its whole weight on level ground');
    assert.ok(Math.abs(Math.hypot(mk2.getZ(v), mk2.getW(v)) - trackW / 2) < 1e-6, 'the across direction scaled by the half track');
    assert.equal(mk2.getX(v), 1, 'the hull\'s depth');
  }
  assert.ok(Math.abs(mk.getY(s * 4 + 2) - mk.getY(s * 4) - TRACK_MARKS.spacingM) < 1e-6, 'v runs along the strip in metres');
  // both triangles face up (a downward quad is culled seen from above)
  for (let t = 0; t < 2; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => {
      const v = geo.index.getX(s * 6 + t * 3 + k);
      return new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v));
    });
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    assert.ok(n.y > 0, 'a mark\'s triangle faces up');
  }
  assert.ok(mk.getZ(s * 4) >= 0 && mk.getZ(s * 4) <= 20 / 8 + 1e-6, 'born on the marks\' clock');
}

// 2b. The same drive at any stamp rate lays the same pairs (the pairs sit on the path between stamps): a 30 Hz, a 60 Hz
//     and a 144 Hz stamping of one straight drive, and of a turning one's polyline sampled twice per step.
{
  const lay = (rate) => {
    const m = createTrackMarks(field, { segments: 256 });
    drive(m, {}, 3, 10, 30, 7.5, rate, 0.3);
    return { m, n: m.stats().written, p: Array.from(m.mesh.geometry.getAttribute('position').array) };
  };
  const a = lay(60), b = lay(30), c = lay(144);
  assert.equal(a.n, b.n); assert.equal(a.n, c.n);
  for (let i = 0; i < a.n * 12; i++) {
    assert.ok(Math.abs(a.p[i] - b.p[i]) < 1e-4 && Math.abs(a.p[i] - c.p[i]) < 1e-4, `the same vertex at 30, 60 and 144 Hz (${i})`);
  }
  // a stamp repeated within one step (a render frame between two steps) lays nothing more
  const twice = createTrackMarks(field, { segments: 256 });
  const k = {};
  for (let i = 0; i <= 240; i++) {
    twice.advance(i ? STEP : 0);
    const yaw = 0.002 * i;
    const x = 40 * Math.sin(yaw) * 10, z = i * 0.13;
    twice.stamp(k, x, z, yaw, halfGauge, trackW, 1);
    twice.stamp(k, x, z, yaw, halfGauge, trackW, 1);
  }
  const once = createTrackMarks(field, { segments: 256 });
  const k1 = {};
  for (let i = 0; i <= 240; i++) {
    once.advance(i ? STEP : 0);
    const yaw = 0.002 * i;
    once.stamp(k1, 40 * Math.sin(yaw) * 10, i * 0.13, yaw, halfGauge, trackW, 1);
  }
  assert.deepEqual(Array.from(twice.mesh.geometry.getAttribute('position').array), Array.from(once.mesh.geometry.getAttribute('position').array),
    'a repeated stamp adds nothing');
}

// 2c. Active only while hulls lay ruts, on the marks' own clock (the FX layer's dry prints stand down then and only then).
{
  const m = createTrackMarks(field, { segments: 64 });
  assert.equal(m.active(), false, 'idle before any hull drives');
  drive(m, {}, 0, 0, 4);
  assert.equal(m.active(), true, 'active once a hull lays');
  for (let i = 0; i < 60 * TRACK_MARKS.activeS + 2; i++) m.advance(STEP);
  assert.equal(m.active(), false, 'idle again once no hull has laid for a while');
  drive(m, {}, 0, 10, 4);
  m.reset();
  assert.equal(m.active(), false, 'idle again after a battle\'s reset');
}

// 3. What lays nothing: a standing hull, the water, a paved street, ice, a rock slope; a jump breaks the strip.
{
  const m = createTrackMarks(field, { segments: 512 });
  const k = {};
  for (let i = 0; i < 120; i++) { m.advance(STEP); m.stamp(k, 0, 0, 0, halfGauge, trackW, 1); }
  assert.equal(m.stats().written, 0, 'a standing hull lays nothing');
  // across the 20 m pond and 15 m of bank either side
  const w = {};
  for (let i = 0; i <= 200; i++) { m.advance(STEP); m.stamp(w, -25 + i * 0.25, -100, Math.PI / 2, halfGauge, trackW, 1); }
  const across = m.stats().written;
  assert.ok(across >= 2 * Math.floor(28 / TRACK_MARKS.spacingM) && across <= 2 * Math.ceil(32 / TRACK_MARKS.spacingM), `no rut in the pond (${across} on its banks)`);
  for (let s = 0; s < across; s++) {
    const x = m.mesh.geometry.getAttribute('position').getX(s * 4 + 2);
    assert.ok(Math.abs(x) > 8, `nothing laid inside the water (a pair at x ${x.toFixed(2)})`);
  }
  const none = (x0, z0, label) => {
    const before = m.stats().written;
    drive(m, {}, x0, z0, 12);
    assert.equal(m.stats().written, before, label);
  };
  none(140 - halfGauge, 0, 'a paved street: none');
  none(-200 - halfGauge, -205, 'an iced lake (hard, off the roads): none');
  // a rock face: the slope past the band the terrain turns to rock across
  {
    const before = m.stats().written;
    for (let i = 0; i <= 120; i++) { m.advance(STEP); m.stamp({ k: 1 }, 405 + i * 0.1, 0, Math.PI / 2, halfGauge, trackW, 1); }
    assert.equal(m.stats().written, before, 'a rock slope (0.9 rise a metre): none');
  }
  const j = {};
  m.stamp(j, 0, 20, 0, halfGauge, trackW, 1);
  const before = m.stats().written;
  m.stamp(j, 30, 20, 0, halfGauge, trackW, 1);
  assert.equal(m.stats().written, before, 'a jump (a respawn) starts a new strip: no segment across it');
}

// 4. The grounds: a dirt road's faint compaction, the marsh's mud, sand, snow, a ploughed field's soil.
{
  const m = createTrackMarks(field, { segments: 64 });
  const groundOf = (x0, z0) => {
    m.reset();
    m.update({ x: x0, y: 5, z: z0 });
    drive(m, {}, x0, z0, 6);
    assert.ok(m.stats().written > 0, `laid at (${x0}, ${z0})`);
    return Math.floor(m.mesh.geometry.getAttribute('aMark').getW(0));
  };
  assert.equal(groundOf(100 - halfGauge, 0), TRACK_MARK_GROUND.road, 'a dirt road: its faint compaction');
  assert.equal(groundOf(-100, 0), TRACK_MARK_GROUND.mud, 'a marsh: mud');
  assert.equal(groundOf(250, 0), TRACK_MARK_GROUND.sand, 'sand');
  assert.equal(groundOf(0, 250), TRACK_MARK_GROUND.snow, 'snow');
  assert.equal(groundOf(-350, 0), TRACK_MARK_GROUND.soil, 'a ploughed field: soil');
  assert.equal(groundOf(0, 30), TRACK_MARK_GROUND.grass, 'the open sward: grass');
}

// 5. The ring wraps: the oldest ruts are overwritten, and the fade runs over the oldest fifth of the span it holds.
{
  const m = createTrackMarks(field, { segments: 64 });
  const k = {};
  drive(m, k, 0, 0, 150);
  m.update({ x: 0, y: 5, z: 150 });
  assert.ok(m.stats().written > 64, 'more written than the ring holds');
  const u = m.mesh.material.uniforms.uLife.value;
  assert.ok(Number.isFinite(u.z) && u.z > 0 && u.w > 0, 'the oldest held rut\'s birth');
  const now = m.mesh.material.uniforms.uTime.value;
  assert.ok(Math.abs(u.w - Math.max(1, (now - u.z) * TRACK_MARKS.ringFade)) < 1e-9, 'its fade over a fifth of the span held');
  // 6. A battle's reset: nothing held, the strips forgotten
  m.reset();
  assert.equal(m.stats().written, 0);
  for (let i = 0; i < 64 * 4; i++) assert.equal(m.mesh.geometry.getAttribute('aMark').getZ(i), 1e9, 'every slot unborn again');
  m.advance(STEP);
  m.stamp(k, 0, 151, 0, halfGauge, trackW, 1);
  assert.equal(m.stats().written, 0, 'the hull\'s first stamp after the reset starts new strips');
  m.dispose();
}

// 6b. A crater (the ground cover's law): the ruts in its bowl go, those on its flank re-seat on the dug ground; hulls
//     crossing it afterwards lay new ones on it.
{
  const m = createTrackMarks(field, { segments: 256 });
  const k = {};
  drive(m, k, 0, -16, 32);
  const laid = m.stats().written;
  const posC = m.mesh.geometry.getAttribute('position'), mkC = m.mesh.geometry.getAttribute('aMark');
  const mid = (s) => [(posC.getX(s * 4) + posC.getX(s * 4 + 2)) / 2, (posC.getZ(s * 4) + posC.getZ(s * 4 + 2)) / 2];
  const R = 6;
  const law = {
    epoch: 1, count: 1, active: true, overlay: null,
    holeAt: (x, z) => Math.hypot(x, z) < 0.9 * R,
    liftAt: (x, z) => { const d = Math.hypot(x, z); return d < 1.8 * R ? -0.4 * (1 - d / (1.8 * R)) : 0; },
    bounds: (_i, out) => { out[0] = -2 * R; out[1] = -2 * R; out[2] = 2 * R; out[3] = 2 * R; return out; },
  };
  const want = Array.from({ length: laid }, (_, s) => s).filter((s) => law.holeAt(...mid(s))).length;
  assert.ok(want > 4 && want < laid, 'the fixture lays ruts in and out of the bowl');
  m.followCraters(law);
  for (let s = 0; s < laid; s++) {
    const [x, z] = mid(s);
    const dead = mkC.getZ(s * 4) === 1e9;
    assert.equal(dead, law.holeAt(x, z), 'inside the bowl cleared, outside kept');
    if (!dead) for (let j = 0; j < 4; j++) {
      const v = s * 4 + j;
      const want = meshAt(posC.getX(v), posC.getZ(v)) + law.liftAt(posC.getX(v), posC.getZ(v)) + TRACK_MARKS.liftM;
      assert.ok(Math.abs(posC.getY(v) - want) < 1e-4, 'a flank\'s rut re-seated on the dug ground');
    }
  }
  m.followCraters(law);
  assert.equal(m.stats().written, laid, 'the stamp is applied once');
  drive(m, k, 2, -8, 16);
  assert.ok(m.stats().written > laid, 'a hull crossing the bowl afterwards lays new ruts');
  m.dispose();
}

// 7. The budget by quality preset: bounded, smaller on the phones and the lower presets.
{
  const desk = ['ultra', 'high', 'medium', 'low', 'ultralow'].map(trackMarkSegmentsFor);
  const phone = ['mobile-high', 'mobile', 'mobile-low', 'mobile-ultralow'].map(trackMarkSegmentsFor);
  for (let i = 1; i < desk.length; i++) assert.ok(desk[i] < desk[i - 1], 'each lower desktop preset holds fewer');
  for (let i = 1; i < phone.length; i++) assert.ok(phone[i] < phone[i - 1], 'each lower phone preset holds fewer');
  assert.ok(desk[0] <= 16384 && phone[0] <= desk[3], 'Ultra 16 384 at most; a phone\'s best no more than Low');
  assert.equal(trackMarkSegmentsFor(null), trackMarkSegmentsFor('medium'), 'no preset: the medium ring');
}

// 8. The wiring.
{
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  assert.ok(map.includes('trackMarks.reset(); // item 45: every battle starts on unmarked ground'), 'the world clears them with the destructibles');
  assert.ok(map.includes('trackMarks.update(cameraPos);'), 'their fade rides the world\'s update');
  assert.ok(map.includes('trackMarks.followCraters(groundCoverCraters);'), 'they follow the craters with the ground cover');
  assert.ok(map.includes('.trackMarksActive = () => trackMarks.active();'), 'the FX layer is told while hulls lay them');
  assert.ok(map.includes('createTrackMarks(heightField, { segments: trackMarkSegmentsFor(trackMarkPreset) })'), 'sized by the preset');
  const pres = readFileSync(new URL('../game/battlePresentationRuntime.ts', import.meta.url), 'utf8');
  assert.ok(pres.includes('world.stampTrackMarks!(entity, state.pos.x, state.pos.z, state.yaw, halfGaugeM, trackWidthM, depth);'),
    'every hull stamps from the simulation\'s pose');
  assert.ok(pres.includes('world.advanceTrackMarks?.(TRACK_MARK_STEP_S);'), 'a solo battle\'s ruts step with the simulation');
  assert.ok(/captureSoloPoses\(\) \{[\s\S]{0,400}stampTrackMarks\(entity, world, spotState, currentPlayer\)/.test(pres), 'at every fixed step');
  assert.ok(pres.includes('&& !spotState.isSpotted(entity.id, currentPlayer?.team ?? \'player\', currentPlayer)) return;'),
    'an unspotted enemy lays none');
  const fx = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
  assert.ok(fx.includes('if (intensity > 0.08 && !frozen && !heightField?.trackMarksActive?.()) stampTrackPrint(pos, dir, false, surface);'),
    'the FX layer\'s dry prints stand down (its wakes stay)');
}

console.log(`trackMarks: the ring and its modulate material, two strips of ${st.written} segments on the drawn ground, the same pairs at `
  + '30/60/144 Hz, nothing from a standing hull or in water, on paving, ice or rock, the grounds, the wrap fade, the craters, '
  + 'the reset, the presets\' budget and the wiring PASS; no GPU/art claim');
