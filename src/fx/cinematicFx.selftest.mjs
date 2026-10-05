// Scene Studio cinematic FX layer: step-size independence, determinism,
// per-effect stream isolation and companion pool budgets (Node, no WebGL).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudioCinematics } from './cinematicFx.ts';
import { createParticleSystem } from './particles.ts';
import { cineRng, cineSeed } from './cinematicRecipes.ts';

function fakePort() {
  const tex = () => new THREE.Texture();
  const sharing = {
    uTime: { value: 37.25 }, uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 }, uLightTint: { value: new THREE.Color(1, 1, 1) },
    textures: { smoke: tex(), fire: tex(), prop: tex(), dust: tex(), flash: tex(), jet: tex() },
  };
  const log = { flashes: [], prints: 0, lateFx: null, columnCap: undefined, tinted: false };
  let flashAt = -1e9;
  const port = {
    group: new THREE.Group(), sharing, createParticleSystem,
    heightField: { getWaterMaskAt: () => 0, getTrackSurfaceAt: () => 0, getGroundType: () => 'medium' },
    explosionLight: new THREE.PointLight(0xff7f38, 0, 13, 2), explosionPeak: 520,
    groundY: (x, z) => 0.03 * x - 0.02 * z,
    explosionFlashAgeS: () => sharing.uTime.value - flashAt,
    flashExplosion: (_pos, peak, ageS = 0) => { flashAt = sharing.uTime.value - ageS; log.flashes.push([flashAt, peak]); },
    setLateFxActive: (fn) => { log.lateFx = fn; },
    setColumnCap: (cap) => { log.columnCap = cap; },
    setLightTintShading: (on) => { log.tinted = on; },
    setMuzzleExposure: (light, cards) => { log.muzzle = [light, cards]; },
    stampTrackPrint: () => { log.prints++; },
  };
  return { port, log, sharing };
}

const ACTOR = Object.freeze({
  uid: 'a2', x: 12, y: 0.3, z: -8, yaw: 0.6, turretYaw: 0.2, lengthM: 7.5, widthM: 3.7, heightM: 2.4, pivot: [0, 1.5, 0.2],
});
const CANISTERS = [
  [10, 2.6, -6, 3, 6, 10, 1.1], [11, 2.6, -6, 6, 6, 9, 1.05], [12.5, 2.6, -6, 9, 6, 6, 1.0],
  [9, 2.6, -6, 0.5, 6, 11, 1.12],
];
const DRIVER = {
  uid: 'a1', halfLengthM: 3.6, halfWidthM: 1.8,
  poseAt(tS, out) {
    // 9 m/s straight run with a gentle turn after 2 s
    const s = Math.min(tS, 5);
    out.x = -20 + s * 9; out.z = 4 + (s > 2 ? (s - 2) * (s - 2) * 0.6 : 0);
    out.yawRad = Math.PI / 2 - (s > 2 ? (s - 2) * 0.25 : 0);
    return true;
  },
};

/** Advance like Studio: step to each authored cue time exactly, fire it, continue. */
function run(nextDt, { endS = 6.4, captureEvery = 0, seed = 5000 } = {}) {
  const { port, log, sharing } = fakePort();
  const cin = createStudioCinematics({
    port, scene: new THREE.Scene(), light: new THREE.PointLight(0xfff0dc, 0, 18, 2),
    palette: () => 'verdant', seed: () => seed,
  });
  cin.setQuality('cinematic');
  cin.setTrackDust(true);
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const cues = [
    [0, () => cin.tankKill('fx1', ACTOR, 'ammorack')],
    [0.25, () => cin.muzzleBlast('fx2', v(-14, 2.1, 4), v(1, 0.02, 0).normalize(), 125)],
    [0.5, () => cin.flare('fx3', v(0, 0.5, 0), { heightM: 70, burnS: 20, driftMps: 1.4, fallMps: 2.6, intensity: 1, color: 0xfff1d6, launch: true })],
    [0.5, () => cin.smokeScreen('fx4', CANISTERS, 9.81, 0.18, 0.1, 18, 1)],
    [1.0, () => cin.explosion('fx5', v(30, 0.4, 10), 'huge')],
    [1.0, () => cin.fireField('fx6', v(-6, 0.2, -14), 5, 12, 1, true)],
    [1.6, () => cin.barrage('fx7', v(20, 0, 30), 5, 12, 'mixed', 23, 2.4)],
    [2.1, () => cin.impact('fx8', 'ricochet', v(13, 1.6, -6), v(0, 0.4, 1).normalize(), 120)],
    [2.4, () => cin.embers('fx9', v(12, 1.8, -8), 3, 30, 4, 3)],
    [3.0, () => cin.burning('fx1b', ACTOR, false)],
  ];
  let now = 0;
  let sinceCapture = 0;
  const advance = (target) => {
    while (now < target - 1e-9) {
      const dt = Math.min(nextDt(), target - now);
      now += dt;
      sharing.uTime.value += dt;
      cin.update(dt, now, [], [DRIVER]);
      sinceCapture += dt;
      if (captureEvery && sinceCapture >= captureEvery) { sinceCapture = 0; cin.update(0, now, [], [DRIVER]); }
    }
  };
  const lightAt = [];
  const sampleLight = () => lightAt.push(log.flashes.length ? log.flashes[log.flashes.length - 1] : null);
  for (const [t, fire] of cues) { advance(t); sampleLight(); cin.beginEffect(t); fire(); }
  for (const t of [3.4, 4.1, 5.2, endS]) { advance(t); sampleLight(); }
  cin.update(0, now, [], [DRIVER]);
  const pools = port.group.children[0].children[0].children.map((mesh) => {
    const out = {};
    for (const [name, attr] of Object.entries(mesh.geometry.attributes)) {
      if (name === 'position' || name === 'uv' || name === 'normal') continue;
      out[name] = Array.from(attr.array);
    }
    return { name: mesh.material.type, count: mesh.geometry.instanceCount, attrs: out };
  });
  return { pools, log, cin, time: sharing.uTime.value, now, lightAt };
}

function assertSame(a, b, label) {
  assert.equal(a.pools.length, b.pools.length);
  let compared = 0;
  for (let p = 0; p < a.pools.length; p++) {
    assert.equal(a.pools[p].count, b.pools[p].count, `${label}: pool ${p} instance count`);
    for (const [name, arr] of Object.entries(a.pools[p].attrs)) {
      const other = b.pools[p].attrs[name];
      assert.equal(arr.length, other.length);
      for (let i = 0; i < arr.length; i++) {
        const x = arr[i], y = other[i];
        // births are clock + offset sums: equal to float rounding, never a step
        const tol = 1e-6 * Math.max(1, Math.abs(x));
        if (Math.abs(x - y) > tol) {
          assert.fail(`${label}: pool ${p} ${name}[${i}] ${x} vs ${y}`);
        }
        compared++;
      }
    }
  }
  assert.ok(compared > 50000, `${label}: compared a populated set (${compared})`);
}

// 1. determinism: identical inputs -> bit-identical pools
const canonical = () => 1 / 60;
const a = run(canonical);
const b = run(canonical);
for (let p = 0; p < a.pools.length; p++) {
  assert.deepEqual(a.pools[p].attrs, b.pools[p].attrs, `pool ${p} is bit-identical across identical runs`);
}
assert.deepEqual(a.log.flashes, b.log.flashes, 'light pulses are deterministic');

// 2. step-size independence: 4 ms, 2-8 ms jitter and capture interleaving
const fine = run(() => 0.004);
assertSame(a, fine, '16.67 ms vs 4 ms');
const jitterRng = cineRng(99);
const jitter = run(() => 0.002 + jitterRng() * 0.006, { captureEvery: 0.05 });
assertSame(a, jitter, '16.67 ms vs 2-8 ms + captures');
// The pooled explosion light at every sampled playhead comes from the same
// pulse (born at its authored time with its peak) whatever the step size;
// pulses superseded inside one coarse step are never visible in a capture.
for (const other of [fine, jitter]) {
  assert.equal(a.lightAt.length, other.lightAt.length);
  for (let i = 0; i < a.lightAt.length; i++) {
    const x = a.lightAt[i], y = other.lightAt[i];
    if (!x || !y) { assert.equal(x, y, `light sample ${i}`); continue; }
    assert.ok(Math.abs(x[0] - y[0]) < 1e-6, `light sample ${i}: pulse born at its authored time`);
    assert.ok(Math.abs(x[1] - y[1]) < 1e-9, `light sample ${i}: pulse keeps its peak`);
  }
}
assert.ok(a.log.flashes.length >= 8, `cook-offs, fireballs and bursts pulse the light (${a.log.flashes.length})`);
assert.equal(a.log.prints, fine.log.prints, 'track prints are distance-keyed, not frame-keyed');
assert.ok(a.log.prints > 40, `the driven actor printed its path (${a.log.prints})`);

// 3. a different scene seed re-rolls every recipe
const reseeded = run(canonical, { seed: 5001 });
assert.notDeepEqual(a.pools[0].attrs.aPB, reseeded.pools[0].attrs.aPB, 'scene seed reaches the cinematic streams');

// 4. budgets: no live particle is recycled by the ring in a heavy key-art scene
for (const pool of a.pools) {
  const pb = pool.attrs.aPB, life = pool.attrs.aVL ?? pool.attrs.aAL;
  if (!pb || !life) continue;
  const capacity = pb.length / 4;
  let live = 0;
  for (let i = 0; i < capacity; i++) {
    const birth = pb[i * 4 + 3], lifeS = life[i * 4 + 3];
    if (lifeS > 0 && birth <= a.time + 1e-6 && birth + lifeS >= a.time) live++;
  }
  assert.ok(live < capacity * 0.92, `${pool.name}: ${live} live of ${capacity} slots`);
}

// 5. integration contract: battle-pool shading, column cap and late pass follow quality
assert.equal(a.log.tinted, true, 'cinematic quality tints the battle smoke for night shots');
assert.equal(a.log.columnCap, 12, 'cinematic quality lifts the wreck-column budget');
assert.equal(typeof a.log.lateFx, 'function', 'companion keeps the late soft pass alive');
a.cin.setQuality('battle');
assert.equal(a.log.tinted, false, 'battle quality restores the untinted battle shaders');
assert.equal(a.log.columnCap, null, 'battle quality restores the battle column budget');
a.cin.dispose();
assert.equal(a.log.lateFx, null, 'dispose releases the late-pass hook');
assert.deepEqual(a.log.muzzle, [1, 1], 'dispose restores the battle muzzle exposure');

// 6. stable effect seeds
assert.equal(cineSeed(5000, 'fx1'), cineSeed(5000, 'fx1'));
assert.notEqual(cineSeed(5000, 'fx1'), cineSeed(5000, 'fx2'));
assert.notEqual(cineSeed(5000, 'fx1', 1), cineSeed(5000, 'fx1', 2));

console.log('cinematicFx.selftest: deterministic, step-size independent (1/60, 4 ms, 2-8 ms + captures), budgets held');
