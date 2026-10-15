// missileTrails.selftest.mjs — FX lane 10-14 (the owner: "make missile trails a lot better and not randomly get cut off
// like if i launch the missile the smoke disappears either quickly or looks like its not actually attached to the
// missile and instead looks like a fixed width ribbon flapping behind the missile").
// The trail is a chain of segments from the point the motor lit to the nozzle this frame; it is never cut short (a long
// flight keeps every stretch, coarser), never taken by another missile while it lives (any key, negative too), never cut
// by its missile's end (it ends where the round struck and dissolves there); each segment draws as a screen-space soft
// capsule whose optical depths sum seamlessly at any point spacing and stay bounded seen down the trail's length.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Vector3, PerspectiveCamera } from 'three';
import { MISSILE_LOOKS, MISSILE_TRAILS, missileTrailOf } from './missileLooks.ts';
import { createMissileTrails, TRAIL_SEGS, TRAIL_SLOTS, TRAIL_STEP_M } from './missileTrails.ts';
import { createSceneLightUniforms } from './sceneLight.ts';

// ---- 1. every look's trail, and the kinds differ ---------------------------------------------------------------------
const T = MISSILE_TRAILS;
for (const id of Object.keys(MISSILE_LOOKS)) assert.ok(id in T, `${id}: a trail entry`);
assert.equal(missileTrailOf(MISSILE_LOOKS.mrm), null, 'the hypersonic dart lays no smoke');
for (const [id, t] of Object.entries(T)) {
  if (!t) continue;
  assert.ok(t.r0 < t.rJet && t.rJet < t.r1, `${id}: thin at the nozzle, swelling`);
  assert.ok(t.life >= 3 && t.tau > 0 && t.boostK >= 1 && t.boostW >= 1, `${id}: lasts seconds; the boost is denser and wider`);
}
assert.ok(T.tow.boostS >= 1.4 && T.spike.boostS <= 0.7 && T.stinger.boostS <= 0.5,
  "a TOW's flight motor burns ~1.6 s; a soft-launched round's and a MANPADS' first stage a fraction of a second");
assert.ok(T.tow.puff >= 0.4 && T.mclos.puff >= 0.5 && T.hellfire.puff <= 0.1 && T.kornet.puff === 0,
  'a pulsing sustainer lays lumps; a steady motor a smooth line');
assert.ok(T.hellfire.tau > T.tow.tau && T.tow.tau > T.spike.tau && T.spike.tau > T.kornet.tau && T.kornet.tau > T.arkan.tau,
  'dense rail trail > TOW > fire-and-forget > beam-rider wisps');
assert.ok(T.hellfire.life >= 9 && T.kornet.life <= 4, 'a dense trail hangs, a wisp is soon gone');
assert.ok(T.mclos.c0[0] < T.hellfire.c0[0], 'an old motor is greyer');

// ---- 2. the depth a pixel takes (a mirror of the fragment shader's integral) ----------------------------------------
const cdf = (z) => 1 / (1 + Math.exp(-1.702 * z));
function segDepth(px, py, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy);
  const tx = L > 1e-3 ? dx / L : 1, ty = L > 1e-3 ? dy / L : 0;
  const qx = px - s.ax, qy = py - s.ay;
  const x = qx * tx + qy * ty, y = -qx * ty + qy * tx;
  const us = L > 1e-3 ? Math.min(1, Math.max(0, x / L)) : 0.5;
  const rp = s.rA + (s.rB - s.rA) * us;
  const sig = 0.65 * rp, sa = Math.max(sig, 0.5);
  const across = Math.exp(-0.5 * (Math.abs(y) / sig) ** 2);
  const A = (cdf(x / sa) - cdf((x - L) / sa)) * Math.min(s.lenPx / Math.max(L, 1e-3), 2);
  return s.tau * across * A;
}
// a straight trail seen from the side, its radius growing along it: points every `space` px; the centre line's depth
for (const space of [0.5, 3, 12, 40, 160]) {
  const segs = [], n = Math.max(30, Math.ceil(400 / space));
  const rAt = (px) => 3 + 0.01 * px;
  for (let k = 0; k < n; k++) {
    segs.push({ ax: k * space, ay: 0, bx: (k + 1) * space, by: 0, rA: rAt(k * space), rB: rAt((k + 1) * space), tau: 1, lenPx: space });
  }
  let lo = Infinity, hi = 0;
  for (let px = 0.3 * n * space; px <= 0.7 * n * space; px += Math.max(0.25, space / 7)) {
    let d = 0;
    for (const s of segs) d += segDepth(px, 0, s);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  assert.ok(hi / lo < 1.03 && Math.abs(hi - 1) < 0.03, `points ${space} px apart: one seamless line (depth ${lo.toFixed(3)}..${hi.toFixed(3)})`);
}
// seen down its length: a stretch adds only what its projection covers (a sight laid down the missile's own line keeps
// the target beyond it), a little deeper than from the side when seen at a slant, and never a sliver that turns with the
// view (no world-space side vector shapes it)
{
  const endOn = { ax: 100, ay: 100, bx: 100.0004, by: 100.0002, rA: 6, rB: 6, tau: 0.5, lenPx: 300 };
  const c = segDepth(100, 100, endOn);
  assert.ok(c < 0.01, `straight down its length: next to nothing (${c.toExponential(2)})`);
  // a 300 m stretch of 2.5 m segments converging on the vanishing point, each projected 1.5 px long: a bounded depth
  let stack = 0;
  for (let k = 0; k < 120; k++) stack += segDepth(100, 100, { ax: 100 + k * 1.5, ay: 100, bx: 100 + (k + 1) * 1.5, by: 100, rA: 6, rB: 6, tau: 0.5, lenPx: 300 });
  assert.ok(stack < 0.5 * 2 + 1e-9, `a long stretch converging on the eye's line stays see-through (${stack.toFixed(2)})`);
  const slant = { ax: 0, ay: 0, bx: 20, by: 0, rA: 6, rB: 6, tau: 0.5, lenPx: 60 };
  assert.ok(Math.abs(segDepth(10, 0, slant) - 1.0) < 0.05, 'at a slant twice as deep as from the side, no more');
}

// ---- 3. the trail's chain ------------------------------------------------------------------------------------------
const light = createSceneLightUniforms();
const tr = createMissileTrails(light);
assert.equal(tr.mesh.visible, false, 'nothing drawn while no trail lives');
assert.ok(tr.mesh.material.transparent && !tr.mesh.material.depthWrite, 'blended smoke, no depth write');
assert.ok(tr.mesh.renderOrder > 21 && tr.mesh.renderOrder < 21.4, 'drawn in the late pass just under the media');
const tow = tr.lookIndex(T.tow), kornet = tr.lookIndex(T.kornet);
assert.ok(tow !== kornet && tr.lookIndex(T.tow) === tow, 'one shader look each');
const segs = (slot) => {
  const a = tr.segmentsOf(slot), out = [];
  for (let i = 0; i < a.length; i += 8) out.push(a.slice(i, i + 8));
  return out;
};
const chained = (ss) => ss.every((s, k) => k === 0 || Math.hypot(s[0] - ss[k - 1][4], s[1] - ss[k - 1][5], s[2] - ss[k - 1][6]) < 1e-4);
// (the old ribbon's bug: a ribbon whose round hashed to a negative key counted as a free slot and the next missile took it)
const neg = tr.begin(-123456, tow, 0.3);
const pos = tr.begin(77, kornet, 0.6);
assert.notEqual(neg, pos, 'a negative key holds its slot');
assert.equal(tr.slotOf(-123456), neg);
// a TOW flying +x at 195 m/s for 10 s at 60 fps (it lights at 9 m): points every 2.5 m, the nozzle every frame
let now = 0, x = 0, nextP = 9;
for (let f = 1; f <= 600; f++) {
  now = f / 60; x = 195 * now;
  while (nextP <= x) { tr.point(neg, nextP, 2.5, 0, now - (x - nextP) / 195, nextP / 195); nextP += Math.max(TRAIL_STEP_M, tr.stepOf(neg)); }
  tr.head(neg, x, 2.5, 0, now, x / 195);
  tr.update(now, 1.2, 0.4);
  if (f === 30) {
    const s = segs(neg);
    assert.ok(chained(s), 'every segment joins the next');
    assert.ok(Math.abs(s.at(-1)[4] - x) < 1e-3 && s.at(-1)[7] === now, 'the newest reaches the nozzle, born now (no gap)');
    assert.ok(Math.abs(s[0][0] - 9) < 1e-3, 'it starts where the motor lit');
  }
}
assert.equal(tr.mesh.visible, true);
let s = segs(neg);
assert.ok(s.length <= TRAIL_SEGS && chained(s), `a 1.95 km flight: one chain in ${s.length} segments`);
assert.ok(Math.abs(s[0][0] - 9) < 1e-3 && Math.abs(s.at(-1)[4] - x) < 1e-3, 'still from where the motor lit to the nozzle: never cut short');
assert.ok(tr.stepOf(neg) > TRAIL_STEP_M, 'its older points merged and the spacing grew instead');
// the round strikes: the trail ends there, outlives it, and dissolves where it was laid
tr.end(neg, now, x + 1.2, 2.4, 0);
s = segs(neg);
assert.ok(Math.abs(s.at(-1)[4] - (x + 1.2)) < 1e-4, 'it ends where the round struck');
tr.head(neg, x + 50, 2.5, 0, now + 0.1, 99);
assert.ok(Math.abs(segs(neg).at(-1)[4] - (x + 1.2)) < 1e-4, 'nothing moves it after');
tr.update(now + T.tow.life - 0.5, 1.2, 0.4);
assert.equal(tr.slotOf(-123456), neg, 'it hangs for its life after the strike');
tr.update(now + T.tow.life + 0.1, 1.2, 0.4);
assert.equal(tr.slotOf(-123456), -1, 'then it is gone');

// ---- 4. the pool: ending trails give way, flying ones never ----------------------------------------------------------
tr.reset();
const slots = [];
for (let i = 0; i < TRAIL_SLOTS; i++) { const sl = tr.begin(1000 + i, tow, i / 97); tr.point(sl, i, 2, 0, 10, 0); tr.head(sl, i, 2, 3, 10.1, 0.1); slots.push(sl); }
assert.equal(new Set(slots).size, TRAIL_SLOTS, `${TRAIL_SLOTS} trails at once`);
tr.end(slots[40], 10.2);
const taken = tr.begin(5000, kornet, 0.5);
assert.equal(taken, slots[40], 'all taken: an ended trail gives way before any flying one');
assert.ok(slots.every((sl, i) => i === 40 || tr.slotOf(1000 + i) === sl), 'no flying trail was cut');
tr.update(10.3, 0, 0);
assert.equal(tr.mesh.geometry.instanceCount, TRAIL_SLOTS * TRAIL_SEGS);

// ---- 4b. the scene in front: with the late pass's scene depth the trail meets the ground and hulls in the shader (no
// straight depth-test cut along a dense trail), without it the depth test does ------------------------------------------
{
  const { Texture, Vector2 } = await import('three');
  const depth = { uSceneDepth: { value: null }, uSoftViewport: { value: new Vector2(1, 1) }, uCameraNear: { value: 0.5 }, uCameraFar: { value: 3000 } };
  const soft = createMissileTrails(createSceneLightUniforms(), depth);
  const fakeRenderer = { getCurrentViewport: (v) => v.set(0, 0, 1280, 720) };
  soft.mesh.onBeforeRender(fakeRenderer);
  assert.ok(soft.mesh.material.depthTest && soft.mesh.material.uniforms.uSoftOn.value === 0, 'no scene depth: the depth test');
  depth.uSceneDepth.value = new Texture();
  soft.mesh.onBeforeRender(fakeRenderer);
  assert.ok(!soft.mesh.material.depthTest && soft.mesh.material.uniforms.uSoftOn.value === 1, 'the scene depth: met in the shader');
  assert.equal(soft.mesh.material.uniforms.uSceneDepth, depth.uSceneDepth, 'the late pass\'s own depth uniform');
  assert.match(soft.mesh.material.fragmentShader, /sceneM - \( axisM - h \)/, 'the part of the chord before the scene');
}

// ---- 5. time shifts, reset ------------------------------------------------------------------------------------------
const before = segs(slots[3]).map((q) => q[3]);
tr.shiftTime(4);
assert.deepEqual(segs(slots[3]).map((q) => q[3]), before.map((b) => b + 4), 'a time shift moves every birth');
tr.reset();
tr.update(20, 0, 0);
assert.equal(tr.mesh.visible, false, 'reset clears every trail');
assert.equal(tr.mesh.geometry.instanceCount, 0);

// ---- 6. the live runtime: the trail born at the nozzle every frame, outliving its round, on every tier ----------------
const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement: (tag) => { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const { createFx } = await import('./effects.ts');
const { createBus } = await import('../game/state.ts');
const { disposeObject3DResources } = await import('../engine/resourceLifetime.ts');
const flat = { getHeightAt: () => 0, getGroundType: () => 'medium', getNormalAt: () => new Vector3(0, 1, 0) };
let fx;
try {
  fx = createFx({ anisotropy: 1 }, flat, { seed: 5 });
  const bus = createBus(); fx.bindBus(bus);
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 3000); camera.position.set(-30, 6, 40); camera.lookAt(80, 2, 0);
  camera.updateMatrixWorld();
  let mesh = null; fx.group.traverse((c) => { if (c.name === 'fx-missile-trails') mesh = c; });
  assert.ok(mesh, 'the runtime draws missile trails');
  const live = () => {
    const a = mesh.geometry.getAttribute('iA'), b = mesh.geometry.getAttribute('iB'), out = [];
    for (let i = 0; i < mesh.geometry.instanceCount; i++) if (a.getW(i) > -1e8) out.push([a.getX(i), a.getY(i), a.getZ(i), b.getX(i), b.getY(i), b.getZ(i), b.getW(i)]);
    return out;
  };
  const fly = (id, name, sound, speed, frames) => {
    bus.emit('shell:fired', { shellId: id, shooterId: 'x', muzzlePos: [0, 2.2, 0], dir: [1, 0, 0], caliberMm: 152,
      shellType: 'HEAT', shellName: name, weaponSound: sound });
    const shell = { id, pos: new Vector3(0, 2.2, 0), prevPos: new Vector3(0, 2.2, 0), vel: new Vector3(speed, 0, 0),
      distM: 0, ageS: 0, spec: { guided: true, tracer: 'ATGM', name, soundProfile: sound, type: 'HEAT' } };
    const heads = [];
    for (let f = 0; f < frames; f++) {
      const dt = 1 / 60;
      shell.prevPos.copy(shell.pos); shell.pos.x += speed * dt; shell.distM += speed * dt; shell.ageS += dt;
      fx.update(dt, [shell], camera);
      const l = live();
      if (l.length) heads.push([shell.pos.x - l.reduce((m, q) => Math.max(m, q[3]), -1e9)]);
    }
    return { shell, heads };
  };
  fx.resetAll();
  const { shell, heads } = fly(31, 'BGM-71E TOW-2A', 'tow-launch', 195, 90);
  const back = 0.65 + 0.625 * MISSILE_LOOKS.tow.bodyLen;
  assert.ok(heads.length > 60 && heads.every(([g]) => Math.abs(g - back) < 0.2),
    `every frame the newest smoke is at the nozzle (${back.toFixed(2)} m behind the round's nose, within its steering)`);
  const laid = live();
  assert.ok(laid.length >= 50, `the trail laid along the flight (${laid.length} segments)`);
  bus.emit('shell:hit', { shellId: 31, pos: [shell.pos.x + 0.5, 2.2, 0], normal: [-1, 0, 0], caliberMm: 152, kind: 'pen' });
  for (let f = 0; f < 60 * 4; f++) fx.update(1 / 60, [], camera);
  assert.ok(live().length >= laid.length, 'four seconds after the strike the whole trail still hangs');
  assert.ok(live().some((q) => Math.abs(q[3] - (shell.pos.x + 0.5)) < 1e-3), 'out to where the round struck');
  assert.ok(fx.group.userData.softParticles.isActive(), 'hanging, it keeps the late FX pass on');
  const src = await (await import('node:fs/promises')).readFile(new URL('./effects.ts', import.meta.url), 'utf8');
  assert.match(src, /\|\| smokeTrails\.mesh\.visible/,
    'a hanging trail keeps the late FX pass on (post.ts skips it otherwise: the old ribbon vanished with the strike\'s media)');
  for (let f = 0; f < 60 * 6; f++) fx.update(1 / 60, [], camera);
  assert.equal(mesh.visible, false, 'then it has dissolved');
  // a soft launch coasts unlit, then its trail starts where the motor lit
  fx.resetAll();
  fly(32, 'Spike LR', 'spike-launch', 117, 3);
  assert.equal(live().length, 0, 'a Spike coasting out of its tube lays no smoke');
  fly(33, 'XM1210 MRM-H Hypersonic GATGM', 'spike-launch', 2050, 20);
  assert.equal(live().length, 0, 'a hypersonic dart lays none');
} finally {
  if (fx) { fx.resetAll(); disposeObject3DResources(fx.group); }
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else delete globalThis.document;
}
console.log('missileTrails: every look its trail; seamless depth at any spacing, bounded end-on; born at the nozzle each frame; never cut short, never taken while flying, outlives its round; time, reset');
