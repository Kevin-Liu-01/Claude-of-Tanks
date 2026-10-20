// hullBurstEarth.selftest.mjs — (lane ac130-fx-228 r3, the r5 blind critic: the gunship's 152 mm on a hull "undersized ...
// gone by f6" against the same shell on the ground, and no hot signature in the infrared lens) a heavy charge (the
// howitzer's shell, a missile's warhead) bursting on a hull that sits on the ground throws the ground's earth round the
// hull's own fireball — the heavy round's fountain and column, clods, dust sheet and ring (blastRecipes.ts heavyHullBurst
// -> groundBurst earthOnly) — from a turret's roof too (effects.ts: a heavy charge reaches the ground from 4 m). Measured
// on the real runtime: the volume media a 20 kg howitzer shell draws on the ground, on a hull top, on a roof and high;
// and (the engineering critic's m1-m4) the contract through a recording blast context: the earth adds no flash, fire,
// starburst or light, counts the patch's crowding once, is exactly the earth of 0.6 of the charge, and a light warhead
// (under HULL_EARTH_MIN_KG) keeps only the dust surge and the ring.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';
import { groundBurst, HULL_EARTH_MIN_KG, plateBurst } from './blastRecipes.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

/** the media bodies 0.4 s after a gunship howitzer shell bursts `where` ('ground', or on a hull at height `y` m) */
function bodies(where, y = 0) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(0, 3, -300); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5 });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
    emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
  fx.bindBus(bus);
  bus.emit('shell:fired', { shellId: 'g1', shooterId: 'pilot', pos: [0, 240, -200], muzzlePos: [0, 240, -200], dir: [0, -0.8, 0.6],
    shellType: 'HE', caliberMm: 152, shellName: '152 mm HE', munition: 'howitzer', chargeKg: 20 });
  if (where === 'hull') bus.emit('shell:hit', { shellId: 'g1', attackerId: 'pilot', targetId: 't1', kind: 'he_pen', damage: 276,
    pos: [0, y, 0], normal: [0, 1, 0], caliberMm: 152, shellType: 'HE', destroyed: false });
  bus.emit('shell:expired', { shellId: 'g1', pos: [0, y, 0], hitTerrain: where === 'ground', hitKind: where === 'hull' ? 'tank' : undefined,
    munition: 'howitzer', chargeKg: 20, caliberMm: 152, shellType: 'HE' });
  for (let i = 0; i < 24; i++) fx.update(1 / 60, [], camera, () => null);
  const n = fx.group.getObjectByName('fx-volume-media')?.children?.[0]?.geometry?.instanceCount ?? 0;
  fx.resetAll();
  return n;
}

const ground = bodies('ground');
const hullTop = bodies('hull', 1.8);
const roof = bodies('hull', 3.2);
const high = bodies('hull', 6);
assert.ok(ground > 0 && high > 0, 'every burst draws its media');
assert.ok(hullTop >= high * 2.5, `a heavy burst on a hull top throws the ground's earth (${hullTop} bodies vs ${high} high above it)`);
assert.ok(roof >= high * 2.5, `and from a turret's roof (${roof} at 3.2 m)`);
assert.ok(hullTop <= ground, `a hull burst throws no more earth than the shell on the ground itself (${hullTop} vs ${ground})`);

// ---- the contract, through a recording blast context (seeded; every call counted) ----
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function recording(seed) {
  const rng = mulberry(seed);
  const n = { media: 0, chunk: 0, flash: 0, fire: 0, sparks: 0, jet: 0, ring: 0, lightPulse: 0, glow: 0, crowd: 0 };
  const scratch = () => new Proxy({}, { get(t, key) { if (typeof key === 'symbol' || key === 'toJSON' || key === 'then') return t[key];
    if (!(key in t)) t[key] = [0, 0, 0, 0]; return t[key]; } });
  const C = { tier: 1, m: scratch(), k: scratch(), lp: scratch(), ls: scratch(), lj: scratch(), rand: rng, groundY: () => 0, distBoost: () => 1,
    media: () => n.media++, chunk: () => n.chunk++, flash: () => n.flash++, fire: () => n.fire++, sparks: () => n.sparks++, jet: () => n.jet++,
    shockRing: () => n.ring++, lightPulse: () => n.lightPulse++, glow: () => n.glow++, crowd: () => { n.crowd++; return 0; } };
  return { C, n };
}
const onHull = (kg, ground, munition = 'howitzer') => { const r = recording(7);
  plateBurst(r.C, { x: 0, y: 1.8, z: 0, nx: 0, ny: 1, nz: 0, munition, chargeKg: kg, ground, birthOffset: 0 }); return r.n; };
const earthOf = (kg) => { const r = recording(7);
  groundBurst(r.C, { x: 0, y: 0, z: 0, munition: 'howitzer', chargeKg: kg, surface: 'soil', birthOffset: 0, earthOnly: true, crowd: 0 }); return r.n; };
const air = onHull(20, null), low = onHull(20, 'soil');
for (const k of ['flash', 'fire', 'sparks', 'lightPulse', 'glow', 'jet']) {
  assert.equal(low[k], air[k], `the earth adds no ${k} (the hull's own fireball, flash and light only; no starburst)`);
}
assert.equal(low.crowd, 1, 'the burst is counted once with the salvo governor');
assert.equal(air.ring, 0); assert.equal(low.ring, 1, 'the earth brings the ring');
const share = earthOf(20 * 0.6);
assert.deepEqual([low.media - air.media, low.chunk - air.chunk], [share.media, share.chunk],
  `the earth is exactly 0.6 of the charge's (${share.media} bodies, ${share.chunk} clods)`);
assert.notDeepEqual([earthOf(20).media, earthOf(20).chunk], [share.media, share.chunk], 'and distinguishable from the full charge\'s');
assert.notDeepEqual([earthOf(2).media, earthOf(2).chunk], [share.media, share.chunk], 'and from a tenth of it');
const sam = onHull(0.62, 'soil', 'missile'), samAir = onHull(0.62, null, 'missile');
assert.ok(0.62 < HULL_EARTH_MIN_KG && sam.chunk === 0 && sam.ring === 1 && sam.media > samAir.media && sam.media - samAir.media < 20,
  `a light warhead keeps only the dust surge and the ring (${sam.media - samAir.media} bodies, no clods)`);
console.log(`hullBurstEarth: the gunship's 152 mm on a hull top throws the ground's earth (${hullTop} media bodies; ${roof} from a roof; ${high} high above the ground; ${ground} on the ground)`);
