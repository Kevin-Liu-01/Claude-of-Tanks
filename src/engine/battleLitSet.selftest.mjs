// battleLitSet.selftest (local-fps-266, Main's ruling on the 266 ranking): a battle's lit set is fixed once at its covered
// prepare and holds for the battle. A day battle keeps the night pool out of the scene (a daylight headlight lights its
// lens, no light); a night battle's pool joins it; the Studio's default prepare is unchanged. The access fixes the rig's
// zero lights with the pool's (fixLitSet, then the pool by isNight). The rig drops a zero hemisphere and a zero anti-sun
// fill from a battle and the Garage takes both back. Frames in between never change the scene's visible lights.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNightLightingRuntime, registerNightLightEmitters } from './nightLightingRuntime.ts';
import { createNightLightingAccess } from './nightLightingAccess.ts';
import { createLighting } from './lighting.ts';

/** The lights three would gather for a frame: visible, on the camera's layers. */
function litSet(scene, camera = new THREE.PerspectiveCamera()) {
  const lights = [];
  scene.traverseVisible((object) => { if (object.isLight && object.layers.test(camera.layers)) lights.push(object); });
  return lights;
}
const signature = (lights) => lights.map((light) => light.type).join(',');

// the night pool: out of a day battle's set, in a night battle's, in by default (the Studio)
{
  const scene = new THREE.Scene(), tank = new THREE.Group();
  scene.add(tank);
  const lens = new THREE.MeshStandardMaterial({ emissive: 0x000000, emissiveIntensity: 0 });
  registerNightLightEmitters(tank, [{ kind: 'headlight', position: [0, 1, 2], direction: [0, 0, 1], intensity: 90,
    emission: { material: lens, color: 0xffe2ad, intensity: 2 } }]);
  let lamps = true;
  const runtime = createNightLightingRuntime(scene, { spotLights: 2, pointLights: 1 });
  const roots = [{ root: tank, priority: 1, isActive: () => lamps }];

  runtime.prepare(roots, true, { lightPool: false });
  const daySet = signature(litSet(scene));
  assert.equal(scene.children.includes(runtime.group), false, 'a day battle keeps the pool out of the scene');
  assert.equal(litSet(scene).length, 0, 'a day battle gathers no pool light');
  for (let frame = 0; frame < 30; frame++) {
    lamps = frame % 10 < 5;
    runtime.update(new THREE.Vector3(0, 1, -6), true, new THREE.Vector3(0, 0, 1));
    assert.equal(signature(litSet(scene)), daySet, `frame ${frame}: the day set never changes`);
    assert.ok(runtime.lights.every((light) => light.intensity === 0), 'no pool light is driven by day');
    if (lamps) assert.ok(lens.emissiveIntensity > 0, 'a daylight headlight lights its lens');
  }
  assert.ok(runtime.emitterCount > 0, 'the day emitters are still prepared');

  runtime.prepare(roots, true, { lightPool: true });
  assert.equal(scene.children.includes(runtime.group), true, 'a night battle adds the pool');
  const nightSet = signature(litSet(scene));
  assert.equal(litSet(scene).length, runtime.lights.length);
  for (let frame = 0; frame < 30; frame++) {
    lamps = frame % 10 < 5;
    runtime.update(new THREE.Vector3(0, 1, -6), true, new THREE.Vector3(0, 0, 1));
    assert.equal(signature(litSet(scene)), nightSet, `frame ${frame}: the night set never changes`);
  }
  lamps = true; runtime.update(new THREE.Vector3(0, 1, -6), true, new THREE.Vector3(0, 0, 1));
  assert.ok(runtime.lights.some((light) => light.intensity > 0), 'a night headlight lights its spot');

  runtime.prepare(roots, true);
  assert.equal(scene.children.includes(runtime.group), true, 'the default prepare (the Studio) keeps the pool');
  runtime.reset();
  assert.equal(scene.children.includes(runtime.group), false, 'the Garage reset removes it');
  runtime.dispose();
}

// the access: the rig's zero lights first, then the pool by the battle's time of day
{
  const calls = [];
  const runtime = {
    prepare(_sources, night, options) { calls.push(['prepare', night, options?.lightPool]); },
    appendRoot() {}, update() {}, reset() { calls.push(['reset']); }, dispose() {},
  };
  let night = false;
  const scene = new THREE.Scene();
  const access = createNightLightingAccess({ scene, getWorldRoot: () => null, getEntities: () => [],
    getCameraPosition: () => new THREE.Vector3(), isNight: () => night, isBattlePresentation: () => true,
    isEntityVisible: () => true, fixLitSet: () => calls.push(['fixLitSet']) },
  async () => ({ createNightLightingRuntime: () => runtime }));
  await access.prepare();
  assert.deepEqual(calls, [['fixLitSet'], ['prepare', true, false]], 'a day battle: rig set fixed, no pool (nothing to reset yet)');
  calls.length = 0; night = true; await access.prepare();
  assert.deepEqual(calls, [['reset'], ['fixLitSet'], ['prepare', true, true]], 'a night battle: rig set fixed, the pool');
}

// the rig: a zero hemisphere and a zero fill leave a battle's set, the Garage takes them back
{
  const scene = new THREE.Scene();
  const lighting = createLighting(scene, new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000), new THREE.Vector3(1, 1, 1).normalize());
  const hemi = lighting.hemi;
  const fill = litSet(scene).find((light) => light.isDirectionalLight && !light.castShadow);
  assert.ok(hemi && fill, 'the rig adds a hemisphere and an unshadowed fill');
  const garageSet = signature(litSet(scene));

  lighting.setSun(new THREE.Vector3(1, 1, 1).normalize(), { fillIntensity: 0 });
  assert.equal(fill.intensity, 0);
  assert.ok(hemi.intensity > 0);
  lighting.setBattleLitSet(true);
  assert.equal(fill.visible, false, 'a zero fill leaves the battle set');
  assert.equal(hemi.visible, true, 'a lit hemisphere stays');
  assert.equal(litSet(scene).includes(fill), false);

  hemi.intensity = 0; // the physical rig under an open sky (lighting.ts setSun: model.hemiIntensity)
  lighting.setBattleLitSet(true);
  assert.equal(hemi.visible, false, 'a zero hemisphere leaves the battle set');
  const battleSet = signature(litSet(scene));
  assert.ok(litSet(scene).every((light) => light.isDirectionalLight && light.castShadow), 'a clear day battle lights the cascades alone');
  for (let frame = 0; frame < 30; frame++) {
    lighting.update?.();
    assert.equal(signature(litSet(scene)), battleSet, `frame ${frame}: the rig's set never changes in battle`);
  }

  lighting.setBattleLitSet(false);
  assert.equal(hemi.visible && fill.visible, true, 'the Garage takes both back');
  assert.equal(signature(litSet(scene)), garageSet, 'the Garage keeps the set its boot linked');
}

console.log('battleLitSet.selftest: a day battle keeps the night pool out (its headlights light their lenses), a night battle and the Studio keep it in; the access fixes the rig set then the pool; zero hemisphere and fill leave a battle, the Garage takes them back; no frame changes a battle set PASS');
