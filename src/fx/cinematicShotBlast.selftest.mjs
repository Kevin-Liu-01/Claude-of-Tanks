// Scene Studio cinematic explosions: a shell burst (cause 'shot') is not a tank kill — it lights no ammunition
// cook-offs, whose hatch blowtorch jets and secondary pops would burn in mid-air over open ground (2026-10-03: the site
// fifty's shell hits used a tank blast and showed a floating fire). A kill's blast keeps them.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudioCinematics } from './cinematicFx.ts';

function blast(size, cause) {
  const tex = () => new THREE.Texture();
  const sharing = {
    uTime: { value: 10 }, uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 }, uLightTint: { value: new THREE.Color(1, 1, 1) },
    textures: { smoke: tex(), fire: tex(), prop: tex(), dust: tex(), flash: tex(), jet: tex() },
  };
  const port = {
    group: new THREE.Group(), sharing,
    heightField: { getWaterMaskAt: () => 0, getTrackSurfaceAt: () => 0, getGroundType: () => 'medium' },
    explosionLight: new THREE.PointLight(0xff7f38, 0, 13, 2), explosionPeak: 520,
    groundY: () => 0, explosionFlashAgeS: () => 1e9, flashExplosion: () => {},
    setLateFxActive: () => {}, setColumnCap: () => {}, setLightTintShading: () => {}, setMuzzleExposure: () => {}, stampTrackPrint: () => {},
  };
  const cin = createStudioCinematics({ port, scene: new THREE.Scene(), light: null, palette: () => 'verdant', seed: () => 5000 });
  cin.setQuality('cinematic');
  cin.beginEffect(0);
  cin.explosion('hit', new THREE.Vector3(20, 0, 30), size, cause);
  for (let t = 1 / 60; t <= 6; t += 1 / 60) { sharing.uTime.value += 1 / 60; cin.update(1 / 60, t, [], []); }
  return cin.stats();
}

for (const size of ['large', 'huge']) {
  const kill = blast(size, undefined), shot = blast(size, 'shot');
  assert.ok(kill['pool.flash'] > shot['pool.flash'], `${size}: a kill's blast pops cook-offs (${kill['pool.flash']} vs ${shot['pool.flash']} flashes)`);
  assert.equal(shot['pool.jet'], 0, `${size}: a shell burst raises no blowtorch jet`);
  assert.ok(shot['pool.fire'] > 0 && shot['pool.smoke'] > 0, `${size}: the shell burst keeps its fireball and smoke`);
}
assert.ok(blast('huge', undefined)['pool.jet'] > 0, 'the kill blast this test compares against does raise blowtorch jets');
console.log('cinematicShotBlast.selftest: shell bursts keep their fireball and raise no cook-offs');
