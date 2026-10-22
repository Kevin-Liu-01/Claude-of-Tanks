// missileTrails.selftest.mjs — FX lane 10-14 (the owner: "make missile trails a lot better and not randomly get cut off
// like if i launch the missile the smoke disappears either quickly or looks like its not actually attached to the
// missile and instead looks like a fixed width ribbon flapping behind the missile").
// The trail is a chain of segments from the point the motor lit to the nozzle this frame; it is never cut short (a long
// flight keeps every stretch, coarser), never taken by another missile while it lives (any key, negative too), never cut
// by its missile's end (it ends where the round struck and dissolves there); each segment draws as a screen-space soft
// mitred screen-space band: one layer of fill, neighbours sharing their corners, bounded seen down the trail's length.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Vector3, PerspectiveCamera } from 'three';
import { MISSILE_LOOKS, MISSILE_TRAILS, missileTrailOf } from './missileLooks.ts';
import { createMissileTrails, TRAIL_SEGS, TRAIL_SLOTS, TRAIL_STEP_M } from './missileTrails.ts';
import { createSceneLightUniforms } from './sceneLight.ts';
import { missileTailM } from './missileBodies.ts';

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
// (ac130-fx-228 r2) no family's own trail fades near the camera; only the gunship's own missile (born beside its lens)
for (const [id, t] of Object.entries(T)) if (t) assert.equal(t.nearM ?? 0, 0, `${id}: no near fade of its own`);
{
  const { readFileSync } = await import('node:fs');
  const trails = readFileSync(new URL('./missileTrails.ts', import.meta.url), 'utf8');
  assert.match(trails, /v\[i \* 6 \+ 3\]\.set\(look\.rise, look\.windK, look\.glow, look\.nearM \?\? 0\);/, 'the near fade rides in the look table');
  assert.match(trails, /if \( vNear > 0\.0 \) T \*= smoothstep\( 0\.2 \* vNear, vNear, vR\.z \);/, 'none within a fifth of it, full past it');
  const effects = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8');
  // (ac130-barrels-230) and off the lens's rail its own narrow look (lensTrailOf), the gunship's near fade with it
  assert.match(effects, /const tl = trail\.pylon \? \(trail\.lensK !== undefined \? lensTrailOf\(base\) : gunshipTrailOf\(base\)\) : base;/,
    "only the gunship's missile (drawn off its pylon) takes it");
}
assert.ok(T.hellfire.life >= 9 && T.kornet.life <= 4, 'a dense trail hangs, a wisp is soon gone');
assert.ok(T.mclos.c0[0] < T.hellfire.c0[0], 'an old motor is greyer');

// ---- 2. the strip (a mirror of the vertex shader's corners): one layer of fill, neighbours share their joint corners ---
// exactly, the band's width is the profile's (never a fixed width), and nothing in it depends on a side vector in the world
const norm = (v) => { const l = Math.hypot(v[0], v[1]); return l > 1e-3 ? [v[0] / l, v[1] / l] : null; };
function corners(sP, sA, sB, sN, hwA, hwB) {
  const dn = norm([sB[0] - sA[0], sB[1] - sA[1]]) ?? [1, 0];
  const joint = (other, sign) => {
    if (!other) return dn;
    const q = norm(sign > 0 ? [sA[0] - other[0], sA[1] - other[1]] : [other[0] - sB[0], other[1] - sB[1]]);
    if (!q || q[0] * dn[0] + q[1] * dn[1] <= 0.8) return dn;
    return norm([dn[0] + q[0], dn[1] + q[1]]);
  };
  const dA = joint(sP, 1), dB = joint(sN, -1);
  const nd = [-dn[1], dn[0]], nA = [-dA[1], dA[0]], nB = [-dB[1], dB[0]];
  const kA = hwA / Math.max(nA[0] * nd[0] + nA[1] * nd[1], 0.6), kB = hwB / Math.max(nB[0] * nd[0] + nB[1] * nd[1], 0.6);
  return { A: [[sA[0] - nA[0] * kA, sA[1] - nA[1] * kA], [sA[0] + nA[0] * kA, sA[1] + nA[1] * kA]],
    B: [[sB[0] - nB[0] * kB, sB[1] - nB[1] * kB], [sB[0] + nB[0] * kB, sB[1] + nB[1] * kB]] };
}
{
  // a curving trail on screen: four points, three segments
  const pts = [[100, 400], [300, 380], [480, 330], [640, 250], [760, 150]];
  const hw = [6, 9, 12, 15, 18];
  for (let k = 1; k < pts.length - 2; k++) {
    const segK = corners(pts[k - 1], pts[k], pts[k + 1], pts[k + 2], hw[k], hw[k + 1]);
    const segN = corners(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], hw[k + 1], hw[k + 2]);
    for (let e = 0; e < 2; e++) {
      assert.ok(Math.hypot(segK.B[e][0] - segN.A[e][0], segK.B[e][1] - segN.A[e][1]) < 1e-9,
        `segments ${k} and ${k + 1} share their joint corner exactly (no seam, no overlap)`);
    }
  }
  // the band's half width at a joint is the profile's there (mitred: its perpendicular reach is hw)
  const c = corners([0, 0], [100, 0], [200, 50], null, 10, 10);
  const nd = norm([100, 50]);
  const reach = Math.abs((c.A[1][0] - 100) * -nd[1] + (c.A[1][1] - 0) * nd[0]);
  assert.ok(Math.abs(reach - 10) < 1e-9, `the band reaches its half width from the segment's own line (${reach.toFixed(3)})`);
  // a joint turning sharply on screen (seen nearly down the trail) is not mitred: no spike past the band's width
  const hairpin = corners([0, 0], [100, 0], [20, 10], null, 10, 10);
  for (const c of [...hairpin.A, ...hairpin.B]) {
    const nd2 = norm([20 - 100, 10]);
    const off = Math.abs((c[0] - 100) * -nd2[1] + (c[1] - 0) * nd2[0]);
    assert.ok(off <= 10 + 1e-6 || Math.abs((c[0] - 20) * -nd2[1] + (c[1] - 10) * nd2[0]) <= 10 + 1e-6, 'no corner reaches past the band');
  }
  // seen straight down its length a segment has no length on screen: a sliver, never a disc stacking up depth
  const endOn = corners(null, [500, 300], [500.0004, 300.0002], null, 30, 30);
  const area = Math.abs((endOn.B[0][0] - endOn.A[0][0]) * (endOn.A[1][1] - endOn.A[0][1]) - (endOn.B[0][1] - endOn.A[0][1]) * (endOn.A[1][0] - endOn.A[0][0]));
  assert.ok(area < 0.1, `end-on: next to no area (${area.toExponential(1)} px^2), so a sight down the line keeps its target`);
}
{
  const src = (await import('node:fs/promises')).readFile(new URL('./missileTrails.ts', import.meta.url), 'utf8');
  const text = await src;
  assert.match(text, /if \( T < 0\.002 \) discard;/, 'a pixel with next to no smoke leaves before the noise');
  assert.match(text, /min\( len3 \* 0\.5 \* \( pA \+ pB \) \/ max\( Ld, 1e-3 \), \$\{OBLIQUE_CAP/, 'a slant draws at most OBLIQUE_CAP deeper');
  assert.ok(!/sin\(/.test(text.slice(text.indexOf('const FRAG'))), 'no sine hashes in the fragment stage');
  assert.match(text, /bool knot = Ld < 2\.0 \* hwM;/, 'a segment shorter on screen than its width draws as a round knot');
  assert.match(text, /min\( 1\.0, \( Ld \+ 1\.0 \) \/ \( 2\.0 \* hwM \) \)/, 'a knot is as deep as its projected length covers (a run down the line stays bounded)');
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
  assert.match(soft.mesh.material.fragmentShader, /sceneM - \( vR\.z - h \)/, 'the part of the chord before the scene');
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
  const back = missileTailM('tow', 0);
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
console.log('missileTrails: every look its trail; one mitred band (shared corners, bounded end-on); born at the nozzle each frame; never cut short, never taken while flying, outlives its round; time, reset');
