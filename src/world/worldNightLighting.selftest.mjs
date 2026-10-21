import assert from 'node:assert/strict';
import * as THREE from 'three';
import { configureWorldLampMaterial, registerWorldNightLighting, STREET_LAMP_CANDELA, WORLD_LAMP_ACTIVE_ATTRIBUTE } from './worldNightLighting.ts';
import { createNightLightingRuntime } from '../engine/nightLightingRuntime.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.ts';
import { MAP_IDS } from './maps/catalog.ts';
import { clutterTypes } from './maps/clutterKit.ts';
import { LAMP_FORMS } from './maps/streetKit.ts';
import { graphLabels } from '../../tools/receipt-kit.test-support.mjs';

const scene = new THREE.Scene(), root = new THREE.Group();
scene.add(root);
root.position.set(8, 2, -6);
root.rotation.y = .7;
const geometry = DESTRUCTIBLE_TYPES.lamp.build(() => .5);
const mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
assert.equal(mask.count, geometry.getAttribute('position').count);
let bulbVertices = 0;
const positions = geometry.getAttribute('position');
for (let i = 0; i < mask.count; i++) {
  if (!mask.getX(i)) continue;
  bulbVertices++;
  assert.ok(Math.abs(positions.getY(i) - 3.895) < .028, 'only authored bulb faces emit');
  assert.ok(Math.abs(positions.getX(i) - .98) <= .201);
}
assert.ok(bulbVertices > 0 && bulbVertices < mask.count / 3, 'pole, arm and housing remain unlit');
const ordinary = new THREE.MeshStandardMaterial({ color: 0x222222 });
const lampMaterial = ordinary.clone();
configureWorldLampMaterial(lampMaterial);
const curtain = new THREE.MeshStandardMaterial({ emissive: 0x2b190d, emissiveIntensity: .08 });
const originalColor = curtain.emissive.clone();
const lamps = new THREE.InstancedMesh(geometry, lampMaterial, 2);
lamps.name = 'destructible-lamp';
root.add(lamps, new THREE.Mesh(geometry, curtain));
const matrix = new THREE.Matrix4().compose(
  new THREE.Vector3(4, 1, 2),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(.13, -.5, .11)),
  new THREE.Vector3(.92, .92, .92),
);
lamps.setMatrixAt(0, matrix);
lamps.setMatrixAt(1, new THREE.Matrix4().makeTranslation(12, 0, -4));
const records = [{ kind: 'lamp', slot: 0, state: 0 }, { kind: 'lamp', slot: 1, state: 0 }];
const originalAttributes = Object.fromEntries(Object.entries(geometry.attributes).map(([key, attr]) => [key, attr.array.slice()]));
const originalIndex = geometry.index?.array.slice();
const originalInstances = lamps.instanceMatrix.array.slice();
registerWorldNightLighting(root, curtain, records, 'urban');
const originalVersion = curtain.version;
const originalProgramKey = curtain.customProgramCacheKey();
const originalHook = curtain.onBeforeCompile;
const originalChildren = root.children.slice();
assert.equal(curtain.userData.nightEmissionMask, true, 'window bucket uses exact vertex masks, not blanket material glow');
root.updateWorldMatrix(true, true);
lamps.getMatrixAt(0, matrix); // GPU instance matrices have Float32 precision.
const expected = new THREE.Vector3(.98, 3.895, 0).applyMatrix4(matrix).applyMatrix4(lamps.matrixWorld);
const runtime = createNightLightingRuntime(scene);
try {
  runtime.prepare([{ root }], true);
  assert.equal(runtime.emitterCount, 3, 'two real lamp fixtures and the existing curtain material');
  runtime.update(expected);
  const light = runtime.lights.find(light => light.isPointLight);
  assert.ok(light.position.distanceTo(expected) < 1e-10, 'light uses actual tilted/scaled instance lens, not pole base');
  // (the looks lane, 228: at 6 cd — two stops under the captured 24 — no lamp pool showed at any pose; the pool now reads
  // beside a headlight's, its range still bounding the unshadowed spill)
  assert.equal(light.intensity, STREET_LAMP_CANDELA, 'the street lamp pool reads on the pavement');
  assert.equal(light.distance, 17, 'its unshadowed spill bounded to its own stretch of street');
  assert.equal(light.distance, 17, 'the original range/selection footprint is not reduced');
  assert.equal(light.color.getHex(), 0xffc889, 'no lamp palette change');
  assert.equal(curtain.emissive.getHex(), 0xffffff, 'authored mask supplies warm pane/red beacon tint');
  assert.equal(curtain.emissiveIntensity, .225, 'occupied pane input is two stops below captured .9');
  assert.equal(ordinary.emissive.getHex(), 0, 'generic baked props do not glow');
  assert.equal(lampMaterial.emissiveIntensity, 3, 'night radiance is available only to masked lens faces');
  const active = geometry.getAttribute(WORLD_LAMP_ACTIVE_ATTRIBUTE);
  assert.ok(active.isInstancedBufferAttribute);
  assert.equal(active.array.byteLength, 2, 'one byte per lamp, not a per-fixture material or mesh');
  const version = active.version;
  runtime.update(expected);
  assert.equal(active.version, version, 'steady frames do not upload lamp activity');
  assert.equal(curtain.version, originalVersion, 'emission changes do not recompile the material');
  assert.equal(curtain.customProgramCacheKey(), originalProgramKey);
  assert.strictEqual(curtain.onBeforeCompile, originalHook, 'same installed mask shader, no new variants');
  assert.deepEqual(graphLabels(root.children), graphLabels(originalChildren), 'intensity inputs add no scene owners');
  assert.equal(runtime.lights.length, 3, 'original two-spot/one-point pool only');
  assert.ok(runtime.lights.every(light => !light.castShadow && !light.shadow.map), 'no new shadow budget');
  for (const [key, bytes] of Object.entries(originalAttributes)) assert.deepEqual(geometry.getAttribute(key).array, bytes, `${key}: exact authored geometry and masks`);
  assert.deepEqual(geometry.index?.array, originalIndex);
  assert.deepEqual(lamps.instanceMatrix.array, originalInstances, 'light balance cannot move an authored fixture');
  records[0].state = 1;
  runtime.update(expected);
  assert.equal(active.getX(0), 0, 'destroyed bulb stops glowing while intact sibling remains on');
  assert.equal(active.getX(1), 1);
  assert.ok(light.position.distanceTo(expected) > 1, 'destroyed lamp immediately releases its point-light slot');
  records[1].state = 1;
  runtime.update(expected);
  assert.equal(light.intensity, 0);
  records[0].state = 0;
  runtime.update(expected);
  assert.equal(active.getX(0), 1, 'rematch restores the existing bulb activity slot');
  root.visible = false;
  runtime.update(expected);
  assert.deepEqual(curtain.emissive, originalColor, 'dormant world restores shared window material');
  root.visible = true;
  runtime.update(expected);
  assert.equal(curtain.emissiveIntensity, .225);
  runtime.reset();
  assert.deepEqual(curtain.emissive, originalColor);
  assert.equal(curtain.emissiveIntensity, .08);
  assert.equal(runtime.emitterCount, 0, 'Garage return releases retained map/record references');
  runtime.prepare([{ root }], false);
  runtime.update(expected);
  assert.ok(runtime.group.parent === null, 'day maps carry no light pool');

  for (const mapId of MAP_IDS) {
    const mapRoot = new THREE.Group();
    scene.add(mapRoot);
    registerWorldNightLighting(mapRoot, curtain, [], mapId);
    runtime.prepare([{ root: mapRoot }], true);
    runtime.update(new THREE.Vector3());
    const abandoned = mapId === 'ruinspires' || mapId === 'blackglass';
    assert.equal(runtime.emitterCount, abandoned ? 0 : 1, `${mapId}: preserve exact occupied/abandoned role admission`);
    assert.equal(curtain.emissiveIntensity, abandoned ? .08 : .225);
    runtime.reset();
    assert.deepEqual(curtain.emissive, originalColor, `${mapId}: exact authored day/Garage color restored`);
    assert.equal(curtain.emissiveIntensity, .08);
    mapRoot.removeFromParent();
  }
  assert.throws(() => registerWorldNightLighting(root, curtain,
    [{ kind: 'lamp', slot: 2, state: 0 }], 'urban'), /instance slot/);
} finally {
  runtime.dispose(); lamps.dispose(); geometry.dispose(); ordinary.dispose(); lampMaterial.dispose(); curtain.dispose();
}
// (229, the night amber carry: "no lamp pools render beyond Steinburg") every map's street lamp, as its props build it
// (clutterTypes: the map's own form, else the cast-iron lamp), carries its lens seat for the pooled light that
// registerWorldNightLighting gives each standing lamp at night, unless its form is shot out (Ruinspires' cobra heads stay
// dark); the seat stands in the lamp's head, over a hull's height
{
  const lit = [], dark = [];
  for (const mapId of MAP_IDS) {
    const type = clutterTypes(mapId, false).lamp ?? DESTRUCTIBLE_TYPES.lamp;
    const form = type.build(() => .5);
    form.computeBoundingBox();
    const lens = form.userData.lampLens === undefined ? [0.98, 3.895, 0] : form.userData.lampLens;
    if (LAMP_FORMS[mapId]?.broken) {
      assert.equal(lens, null, `${mapId}: a shot-out lamp has no glass and no light`);
      dark.push(mapId);
    } else {
      assert.ok(Array.isArray(lens), `${mapId}: the lamp's lens seat (its pooled light at night)`);
      const box = form.boundingBox;
      assert.ok(lens[1] > 2.5 && lens[1] <= box.max.y + 1e-6 && lens[1] > box.max.y - 1.5, `${mapId}: the seat in the lamp's head (${lens[1].toFixed(2)} m of ${box.max.y.toFixed(2)})`);
      lit.push(mapId);
    }
    form.dispose();
  }
  assert.deepEqual(dark, ['ruinspires'], 'only the shot-out lamps stay dark');
  assert.ok(lit.length === MAP_IDS.length - 1);
  // and only at night: a day's prepare lights nothing and adds no light pool to the scene
  const day = new THREE.Scene(), town = new THREE.Group(), lampMat = new THREE.MeshStandardMaterial();
  day.add(town);
  const lampMesh = new THREE.InstancedMesh(DESTRUCTIBLE_TYPES.lamp.build(() => .5), lampMat, 1);
  lampMesh.name = 'destructible-lamp'; lampMesh.setMatrixAt(0, new THREE.Matrix4()); town.add(lampMesh);
  registerWorldNightLighting(town, new THREE.MeshStandardMaterial(), [{ kind: 'lamp', slot: 0, state: 0 }], 'foundry');
  const pool = createNightLightingRuntime(day, { spotLights: 1, pointLights: 2 });
  pool.prepare([{ root: town }], false);
  pool.update(new THREE.Vector3(-10, 2, 0), true, new THREE.Vector3(1, 0, 0));
  assert.ok(pool.lights.every((light) => light.intensity === 0) && !day.children.includes(pool.group), 'by day no lamp lights');
  pool.prepare([{ root: town }], true);
  pool.update(new THREE.Vector3(-10, 2, 0), true, new THREE.Vector3(1, 0, 0));
  assert.equal(pool.lights.filter((light) => light.intensity > 0).length, 1, 'at night the lamp pools');
  pool.dispose(); lampMesh.geometry.dispose(); lampMat.dispose();
  console.log(`worldNightLighting: ${lit.length} maps' street lamps seat their pooled light (shot out: ${dark.join(', ')}), at night only`);
}
console.log('worldNightLighting: authored lamp transforms, destruction, window emission and exact restoration passed');
