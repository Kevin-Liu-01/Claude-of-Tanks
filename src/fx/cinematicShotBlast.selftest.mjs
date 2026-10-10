// Scene Studio cinematic explosions: a shell burst (cause 'shot') is not a tank kill — it lights no ammunition
// cook-offs, whose hatch blowtorch jets and secondary pops would burn in mid-air over open ground (2026-10-03: the site
// fifty's shell hits used a tank blast and showed a floating fire). A kill's blast keeps them. Its flame also burns out
// fast and low (the same day: orange lobes still climbing 1.5 s after a hit, a fireball held over the river it landed
// in, an 18 s ground fire on the ice), while the kill's fireball, ground fire and embers stay as they were.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudioCinematics } from './cinematicFx.ts';
import { createParticleSystem } from './particles.ts';

/** Stats of one blast at each of `atS` seconds after it (ascending). */
function blast(size, cause, atS = [6]) {
  const tex = () => new THREE.Texture();
  const sharing = {
    uTime: { value: 10 }, uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 }, uLightTint: { value: new THREE.Color(1, 1, 1) },
    textures: { smoke: tex(), fire: tex(), prop: tex(), dust: tex(), flash: tex(), jet: tex() },
  };
  const port = {
    group: new THREE.Group(), sharing, createParticleSystem,
    heightField: { getWaterMaskAt: () => 0, getTrackSurfaceAt: () => 0, getGroundType: () => 'medium' },
    explosionLight: new THREE.PointLight(0xff7f38, 0, 13, 2), explosionPeak: 520,
    groundY: () => 0, explosionFlashAgeS: () => 1e9, flashExplosion: () => {},
    setLateFxActive: () => {}, setColumnCap: () => {}, setLightTintShading: () => {}, setMuzzleExposure: () => {}, stampTrackPrint: () => {},
  };
  const cin = createStudioCinematics({ port, scene: new THREE.Scene(), light: null, palette: () => 'verdant', seed: () => 5000 });
  cin.setQuality('cinematic');
  cin.beginEffect(0);
  cin.explosion('hit', new THREE.Vector3(20, 0, 30), size, cause);
  const out = [];
  let t = 0;
  for (const at of atS) {
    for (; t < at - 1e-9; t += 1 / 60) { sharing.uTime.value += 1 / 60; cin.update(1 / 60, t + 1 / 60, [], []); }
    out.push(cin.stats());
  }
  return atS.length === 1 ? out[0] : out;
}

for (const size of ['large', 'huge']) {
  const kill = blast(size, undefined), shot = blast(size, 'shot');
  assert.ok(kill['pool.flash'] > shot['pool.flash'], `${size}: a kill's blast pops cook-offs (${kill['pool.flash']} vs ${shot['pool.flash']} flashes)`);
  assert.equal(shot['pool.jet'], 0, `${size}: a shell burst raises no blowtorch jet`);
  assert.ok(shot['pool.fire'] > 0 && shot['pool.smoke'] > 0, `${size}: the shell burst keeps its fireball and smoke`);
  // flame lifetime: the burst flares like the kill, then its fireball lobes (the billow cards that climbed as orange
  // puffs) burn out while the kill's still roll; burning fragments ('fire' trails off debris) may arc on
  const [killPeak, killMid, killLate] = blast(size, undefined, [0.25, 1.4, 2.5]);
  const [shotPeak, shotMid, shotLate] = blast(size, 'shot', [0.25, 1.4, 2.5]);
  const flame = s => s['alive.fire'] + s['alive.billow'];
  assert.ok(flame(shotPeak) >= 0.8 * flame(killPeak), `${size}: the burst still flares (${flame(shotPeak)} vs ${flame(killPeak)} flame cards at 0.25 s)`);
  assert.ok(shotMid['alive.billow'] <= 0.5 * killMid['alive.billow'], `${size}: the burst's lobes are cooling out at 1.4 s (${shotMid['alive.billow']} vs the kill's ${killMid['alive.billow']})`);
  assert.equal(shotLate['alive.billow'], 0, `${size}: the burst's lobes are gone at 2.5 s`);
  assert.ok(killLate['alive.billow'] > 0, `${size}: the kill's fireball still rolls at 2.5 s`);
}
// the kill's fire field keeps burning on the ground; the shell burst leaves none
const killFire = blast('huge', undefined, [8])['alive.fire'], shotFire = blast('huge', 'shot', [8])['alive.fire'];
assert.ok(killFire > 0, `the kill blast still burns on the ground at 8 s (${killFire} fire cards)`);
assert.equal(shotFire, 0, 'a heavy shell burst leaves no ground fire at 8 s');
assert.ok(blast('huge', undefined)['pool.jet'] > 0, 'the kill blast this test compares against does raise blowtorch jets');
console.log('cinematicShotBlast.selftest: shell bursts flare and burn out fast, raise no cook-offs and leave no ground fire');
