import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createNightLightingRuntime, registerNightLightEmitters } from './nightLightingRuntime.ts';

const scene = new THREE.Scene(), player = new THREE.Group(), turret = new THREE.Group();
const building = new THREE.Group(), otherTank = new THREE.Group();
scene.add(player, building, otherTank); player.add(turret);
player.position.set(10, 2, 15); building.position.set(13, 0, 14);
const white = new THREE.MeshStandardMaterial({ emissive: 0x111720, emissiveIntensity: .4 });
const red = new THREE.MeshStandardMaterial({ emissive: 0x7c2410, emissiveIntensity: .23 });
const warm = new THREE.MeshStandardMaterial({ emissive: 0x090807, emissiveIntensity: .31 });
const materials = [white, red, warm];
const authored = materials.map(material => ({ material, color: material.emissive.clone(),
  identity: material.emissive, intensity: material.emissiveIntensity, version: material.version }));
const left = { kind: 'headlight', position: [-.7, .9, 2.6], direction: [0, -.1, 1],
  intensity: 95, range: 48, emission: { material: white, color: 0xffe2ad, intensity: 2 } };
const right = { ...left, position: [.7, .9, 2.6] };
registerNightLightEmitters(player, [left, right]);
registerNightLightEmitters(turret, [{ kind: 'shtora', position: [.6, .4, 1],
  intensity: 300, emission: { material: red, color: 0xff1708, intensity: 1.4 } }]);
registerNightLightEmitters(building, [{ kind: 'building', position: [0, 3, 0],
  color: 0xffdca0, range: 18, intensity: 32,
  emission: { material: warm, color: 0xffdca0, intensity: 1.1 } }]);
registerNightLightEmitters(otherTank, [{ kind: 'headlight', position: [0, 0, 0], intensity: 70 }]);
let alive = true;
const roots = [{ root: player, priority: 1, isActive: () => alive }, { root: building }, { root: otherTank }];
const budget = { spotLights: 2, pointLights: 1 };
const runtime = createNightLightingRuntime(scene, budget);
const objects = [...runtime.group.children], lights = [...runtime.lights];
const positions = lights.map(light => light.position), lightColors = lights.map(light => light.color);
assert.equal(scene.children.includes(runtime.group), false, 'constructor does not light Garage');
assert.equal(lights.length, 3); assert.equal(lights.filter(light => light.isSpotLight).length, 2);
assert.equal(lights.filter(light => light.isPointLight).length, 1);
assert.ok(lights.every(light => !light.castShadow && light.shadow?.map == null));
budget.spotLights = 0; budget.pointLights = 0;
assert.equal(runtime.lights.length, 3, 'budget is fixed at construction, not a live mutable knob');

function assertAuthored() {
  for (const entry of authored) {
    assert.strictEqual(entry.material.emissive, entry.identity);
    assert.deepEqual(entry.material.emissive, entry.color);
    assert.equal(entry.material.emissiveIntensity, entry.intensity);
    assert.equal(entry.material.version, entry.version, 'night emission never marks shader dirty');
  }
}
function near(actual, expected, message) {
  assert.ok(actual.distanceTo(expected) < 1e-10, `${message}: ${actual.toArray()} != ${expected.toArray()}`);
}

try {
  runtime.prepare(roots, false); runtime.update(new THREE.Vector3());
  assert.equal(runtime.emitterCount, 0); assertAuthored();
  runtime.prepare(roots, true);
  assert.equal(runtime.emitterCount, 5); assert.equal(runtime.group.parent, scene);
  let sceneAdds = 0; scene.addEventListener('childadded', () => sceneAdds++);
  const reference = new THREE.Vector3();
  runtime.update(reference);
  assert.ok(lights.slice(0, 2).every(light => light.intensity === 95), 'local player pair wins over closer enemy lamp');
  assert.equal(lights[2].intensity, 32, 'Shtora cannot consume the building point pool');
  assert.equal(white.emissiveIntensity, 2); assert.equal(red.emissiveIntensity, 1.4);
  assert.equal(warm.emissiveIntensity, 1.1);
  near(lights[0].position, player.localToWorld(new THREE.Vector3(...left.position)), 'headlamp starts on authored lens');
  const expectedDirection = new THREE.Vector3(...left.direction).transformDirection(player.matrixWorld);
  near(lights[0].target.position.clone().sub(lights[0].position), expectedDirection, 'world-space beam follows authored direction');

  player.rotation.set(.2, .7, Math.PI); turret.rotation.y = -.8;
  for (let i = 0; i < 100; i++) runtime.update(reference);
  // Both player lamps remain selected; the nearest slot order may swap.
  const expectedPositions = [left, right].map(emitter => player.localToWorld(new THREE.Vector3(...emitter.position)));
  assert.ok(lights.slice(0, 2).every(light => expectedPositions.some(position => position.distanceTo(light.position) < 1e-10)),
    'rolled hull transforms its lamps instead of leaving a floating upright beam');
  for (const light of lights.slice(0, 2)) {
    near(light.target.position.clone().sub(light.position),
      new THREE.Vector3(...left.direction).transformDirection(player.matrixWorld), 'rolled light direction');
  }
  assert.equal(sceneAdds, 0, 'no per-update scene additions');
  assert.deepEqual(runtime.group.children, objects, 'constant night light/target object count');
  assert.deepEqual(runtime.lights, lights);
  lights.forEach((light, index) => {
    assert.strictEqual(light.position, positions[index]); assert.strictEqual(light.color, lightColors[index]);
  });

  alive = false; runtime.update(reference);
  assert.ok(lights.slice(0, 2).every(light => light.intensity !== 95), 'destroyed player cannot retain active beams');
  assert.equal(white.emissiveIntensity, authored[0].intensity);
  assert.equal(red.emissiveIntensity, authored[1].intensity, 'destroyed Shtora restores authored material');
  alive = true; player.visible = false; runtime.update(reference);
  assert.equal(white.emissiveIntensity, authored[0].intensity, 'hidden/unspotted parent cannot reveal lamp glow');
  player.visible = true; runtime.update(reference); assert.equal(white.emissiveIntensity, 2);
  player.removeFromParent(); runtime.update(reference);
  assert.equal(white.emissiveIntensity, authored[0].intensity, 'detached pooled tank cannot leak a light');
  scene.add(player); runtime.update(reference);
  building.visible = false; runtime.update(reference);
  assert.equal(lights[2].intensity, 0); assert.equal(warm.emissiveIntensity, authored[2].intensity);
  building.visible = true;
  runtime.update(reference, false);
  assert.ok(lights.every(light => light.intensity === 0)); assertAuthored();
  assert.equal(runtime.group.parent, scene, 'temporary inactive render does not re-key light count');
  runtime.update(reference); assert.equal(white.emissiveIntensity, 2);
  runtime.reset(); assertAuthored(); assert.equal(runtime.group.parent, null);
  assert.equal(runtime.emitterCount, 0);
  for (let i = 0; i < 16; i++) {
    runtime.prepare(roots, true); runtime.update(reference); runtime.prepare(roots, false); assertAuthored();
  }
  runtime.prepare(roots, true); runtime.update(reference); runtime.dispose(); assertAuthored();
  assert.equal(runtime.group.parent, null); assert.equal(runtime.group.children.length, 0);
  runtime.dispose(); runtime.reset(); runtime.update(reference);
  assert.throws(() => runtime.prepare(roots, true), /disposed/);
} finally { runtime.dispose(); }

// Semantic admission and transactional failure: no untagged glass mutation,
// aliases with conflicting intended emission fail rather than flickering.
const alias = new THREE.Group(); scene.add(alias);
registerNightLightEmitters(alias, [{ kind: 'marker', position: [0, 0, 0],
  emission: { material: white, color: 0xff0000, intensity: 1 } },
{ kind: 'marker', position: [1, 0, 0], emission: { material: white, color: 0x00ff00, intensity: 1 } }]);
const limited = createNightLightingRuntime(scene, { spotLights: 1, pointLights: 1 });
assert.throws(() => limited.prepare([{ root: alias }], true), /conflicting/);
assert.equal(limited.emitterCount, 0); assert.equal(limited.group.parent, null); assertAuthored();
assert.equal(limited.lights.length, 2, 'immutable constrained constructor budget is supported');
let lampIntact = true;
const lateBuilding = new THREE.Group(); scene.add(lateBuilding);
registerNightLightEmitters(lateBuilding, [{ kind: 'building', position: [0, 2, 0], intensity: 25,
  isActive: () => lampIntact, emission: { material: warm, color: 0xffdca0, intensity: 1.1 } }]);
limited.prepare([], true);
limited.appendRoot({ root: lateBuilding }); limited.appendRoot({ root: lateBuilding });
assert.equal(limited.emitterCount, 1, 'late registered roots are deduplicated without re-keying the light pool');
const lateLights = [...limited.lights];
limited.update(new THREE.Vector3()); assert.equal(limited.lights[1].intensity, 25);
lampIntact = false; limited.update(new THREE.Vector3());
assert.equal(limited.lights[1].intensity, 0, 'destroyed lamp retires independently from other props on its root');
assert.equal(warm.emissiveIntensity, authored[2].intensity);
assert.throws(() => limited.appendRoot({ root: alias }), /conflicting/);
assert.equal(limited.emitterCount, 1, 'invalid late registration cannot partially publish');
assert.deepEqual(limited.lights, lateLights, 'late actor registration never adds lights');
limited.reset(); limited.appendRoot({ root: lateBuilding });
assert.equal(limited.emitterCount, 0, 'day/Garage late construction cannot activate night lighting');
limited.dispose();
assert.throws(() => createNightLightingRuntime(scene, { spotLights: 3, pointLights: 1 }), /budget/);
assert.throws(() => createNightLightingRuntime(scene, { spotLights: 2, pointLights: 2 }), /budget/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'glass', position: [0, 0, 0] }]), /kind/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [NaN, 0, 0] }]), /finite/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [0, 0, 0], direction: [0, 0, 0] }]), /nonzero/);
assert.throws(() => registerNightLightEmitters(alias, [{ kind: 'headlight', position: [0, 0, 0], intensity: 301 }]), /intensity/);
const source = readFileSync(new URL('./nightLightingRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /Math\.random\(|performance\.|setTimeout\(|requestAnimationFrame\(|needsUpdate\s*=/);
assert.doesNotMatch(source, /from ['"].*(?:quality|fleet|tankFactory)/, 'runtime stays independent of fleet and quality overrides');
for (const material of materials) material.dispose();
console.log('nightLightingRuntime self-test: bounded lights, authored emission, visibility/death, rolled poses, exact reset and disposal PASS');
