// killGlow.selftest.mjs — (FX lane 10-14, the media lane's combat review of HE look v2: "the kill fireball and hot
// sheets leave a large white-hot glow over a knocked-out hull at ~5.8 s", 1.3 s after s229's kill; the owner's rule:
// tanks stay visible) a wreck's fire takes hold over seconds once the fireball has gone; its licks are orange tongues
// thin enough that a fire's worth overlapping never sheets to white; one fire per hull (a scene's 'burning' on a hull its
// kill already set burning added a second, stacked fire).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { burningEmitter, cineRng } from './cinematicRecipes.ts';
import { createStudioCinematics } from './cinematicFx.ts';
import { createParticleSystem } from './particles.ts';

// ---- 1. the licks: few white-hot, thin additive cards --------------------------------------------------------------
{
  const log = [];
  const ctx = {
    sink: { puff: (pool, o) => log.push({ pool, ...structuredClone(o) }), streak: () => {}, chunk: () => {}, jet: () => {} },
    world: { groundY: () => 0, tone: (x, z, out) => out, water: () => 0 }, env: { night: 0 }, rng: cineRng(77), shift: 0,
    pulse: () => {}, addEmitter: () => {}, scorch: () => {}, shockRing: () => {},
  };
  const sources = [{ x: 0, y: 1.5, z: -2, size: 1.2 }, { x: 0, y: 1.9, z: 0.2, size: 1.0 }, { x: 0.9, y: 1.4, z: 0, size: 0.75 }];
  const em = burningEmitter('k', cineRng(5), 0, Infinity, sources, 1.15, 26, 3);
  for (let k = 1; k <= 30 * 8; k++) em.tick(ctx, k / 30, 0, k / 30);
  const fire = log.filter((p) => p.pool === 'fire');
  assert.ok(fire.length > 200, `the fire licks (${fire.length} in 8 s)`);
  // white-hot (0xfff0b0) against the flame yellow (0xffd070): told apart by blue, linear 0.43 against 0.16
  const white = fire.filter((p) => p.col0[2] > 0.3).length / fire.length;
  assert.ok(fire.some((p) => p.col0[2] > 0.3), "a few white-hot licks remain (the fire has a hot heart)");
  assert.ok(white < 0.08, `few white-hot licks (${(white * 100).toFixed(1)} %)`);
  assert.ok(fire.every((p) => p.alpha <= 0.7), 'thin additive cards');
  // a source's additive load at full fire: licks a second times their life times their alpha (the licks stacked at
  // once) — measured from the last two seconds (well past the ramp); the white sheet's was ~19 (0.38-0.80 s at 0.85-1.0)
  const tail = fire.slice(-Math.floor(fire.length / 4));
  const perLick = tail.reduce((s, p) => s + p.life * p.alpha, 0) / tail.length;
  const perSource = 30 * (tail.length / (sources.length * 30 * 2)) * perLick;
  assert.ok(perSource < 12, `a source's stacked additive load ~${perSource.toFixed(1)} alpha-units`);
  // it ramps: the first second after it starts is a small fire
  const early = fire.filter((p) => p.size0 > 0).slice(0, 30);
  const late = fire.slice(-30);
  const mean = (a) => a.reduce((s, p) => s + p.size0, 0) / a.length;
  assert.ok(mean(early) < mean(late), 'the fire grows as it takes hold');
}

// ---- 2. the Studio layer: the kill's fire starts as the fireball dies and grows over 3 s; one fire per hull ------------
{
  const src = await readFile(new URL('./cinematicFx.ts', import.meta.url), 'utf8');
  assert.match(src, /burningEmitter\(`\$\{id\}:burn`, rngFor\(id, 52\), now \+ 0\.6, timelineEnd, sources, rack \? 1\.15 : 1, 26, 3\)/,
    "the kill's fire starts 0.6 s on (the fireball's core is gone by 0.4 s) and takes 3 s to take hold");
  const tex = () => new THREE.Texture();
  const sharing = {
    uTime: { value: 10 }, uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 }, uLightTint: { value: new THREE.Color(1, 1, 1) },
    textures: { smoke: tex(), fire: tex(), prop: tex(), dust: tex(), flash: tex(), jet: tex() },
  };
  const port = {
    group: new THREE.Group(), sharing, createParticleSystem,
    heightField: { getWaterMaskAt: () => 0, getTrackSurfaceAt: () => 0, getGroundType: () => 'medium' },
    explosionLight: new THREE.PointLight(0xff7f38, 0, 13, 2), explosionPeak: 520, groundY: () => 0,
    explosionFlashAgeS: () => 99, flashExplosion: () => {}, setLateFxActive: () => {}, setColumnCap: () => {},
    setLightTintShading: () => {}, setMuzzleExposure: () => {}, stampTrackPrint: () => {},
  };
  const actor = { uid: 'foe0', x: 0, y: 0.3, z: 0, yaw: 0.4, turretYaw: 0, lengthM: 7, widthM: 3.6, heightM: 2.4, pivot: [0, 1.5, 0] };
  const cin = createStudioCinematics({ port, scene: new THREE.Scene(), light: new THREE.PointLight(0xfff0dc, 0, 18, 2),
    palette: () => 'verdant', seed: () => 5000 });
  cin.setQuality('cinematic');
  cin.tankKill('kill', actor, 'ammorack');
  const afterKill = cin.stats().emitters;
  cin.burning('burn', actor, true);
  assert.equal(cin.stats().emitters, afterKill, "a 'burning' on a hull its kill set burning adds no second fire");
  const other = { ...actor, uid: 'foe1', x: 30 };
  cin.burning('burn2', other, true);
  assert.equal(cin.stats().emitters, afterKill + 2, 'a hull not yet burning catches fire');
  cin.dispose();
}
console.log('killGlow: orange licks thin enough not to sheet white, the kill fire taking hold over 3 s from 0.6 s, one fire per hull');
