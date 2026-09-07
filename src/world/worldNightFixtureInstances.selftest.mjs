import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { makeLighthouse } from './maps/railKit.ts';
import { prepareWorldStaticNightFixture, prepareWorldStructureNightFixture,
  setWorldNightFixtureActive, WORLD_FIXTURE_ACTIVE_ATTRIBUTE } from './worldNightFixtureInstances.ts';
import { registerWorldNightLighting } from './worldNightLighting.ts';
import { createNightLightingRuntime } from '../engine/nightLightingRuntime.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';

const panes = new Set(['fieldhut', 'fishershack', 'saunahut', 'alpinerefuge', 'stilthouse', 'longhouse',
  'guardpost', 'quonsethut', 'checkpointhut', 'securityoffice', 'servicegarage', 'corneroffice']);
function assertExposedAperture(geometry, id) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); mesh.updateMatrixWorld(true);
  const mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE), position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  let visible = 0, tested = 0;
  for (let index = 0; index < position.count; index += 3) {
    if ([0, 1, 2].some(offset => mask.getX(index + offset) !== 1)) continue;
    const point = new THREE.Vector3();
    for (let offset = 0; offset < 3; offset++) point.add(new THREE.Vector3().fromBufferAttribute(position, index + offset));
    point.multiplyScalar(1 / 3);
    const outward = new THREE.Vector3().fromBufferAttribute(normal, index);
    const ray = new THREE.Raycaster(point.clone().addScaledVector(outward, .25), outward.negate(), .001, .3);
    if (ray.intersectObject(mesh, false)[0]?.faceIndex === index / 3) visible++;
    tested++;
  }
  mesh.material.dispose();
  assert(visible > 0 && visible >= tested / 2, `${id}: actual exposed pane faces exist beyond authored mullions/canopies`);
}
const hash = createHash('sha256');
let vertices = 0, indices = 0, totalCalls = 0;
for (const [id, type] of Object.entries(DESTRUCTIBLE_BUILDING_TYPES)) for (const seed of [17, 42, 2026]) {
  let state = seed, calls = 0;
  const rng = () => { calls++; state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
  for (const mode of ['build', 'broken']) {
    const geometry = type[mode](rng), mask = geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    assert(mask && mask.array.byteLength === geometry.getAttribute('position').count, 'one byte per unchanged original vertex');
    const kinds = new Set(mask.array);
    assert.deepEqual(kinds, new Set(mode === 'broken' ? [0] : id === 'relaystation' ? [0, 2] : panes.has(id) ? [0, 1] : [0]),
      `${id}/${mode}: true panes/beacon only; tents, vents, paint and debris remain unlit`);
    if (mode === 'build' && panes.has(id)) assertExposedAperture(geometry, id);
    if (id === 'relaystation' && mode === 'build') {
      const position = geometry.getAttribute('position');
      for (let i = 0; i < mask.count; i++) if (mask.getX(i) === 2) {
        assert(position.getY(i) > 12.7 && Math.hypot(position.getX(i), position.getZ(i)) < .281,
          'only the original relay tip bulb, not antenna legs or cooling louvers');
      }
    }
    hash.update(JSON.stringify([id, mode, seed]));
    for (const name of ['position', 'normal', 'uv', 'color']) {
      const array = geometry.getAttribute(name)?.array;
      if (array) hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
    if (geometry.index) {
      const array = geometry.index.array; hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
    }
    vertices += geometry.getAttribute('position').count; indices += geometry.index?.count ?? 0;
    geometry.dispose();
  }
  totalCalls += calls; hash.update(JSON.stringify([state, calls]));
}
assert.equal(hash.digest('hex'), '1bfadc1f96968aa3e15305e9f25371242f53e0dcd8c05203c842814e9d4bcff5',
  'all 20 intact/debris families × 3 seeds retain exact original positions, normals, UVs, colors, RNG and topology');
assert.deepEqual({ vertices, indices, totalCalls }, { vertices: 101664, indices: 0, totalCalls: 65451 });
const propsSource = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(propsSource, /rec\.state = 1;\s*setWorldNightFixtureActive\(pool\.imI, rec\.slot, false\)/,
  'all authored destruction routes switch off the original instance at the state transition');
assert.match(propsSource, /rec\.state = 0;\s*const pool = dPools\.get\(rec\.kind\);\s*if \(pool && pool\.imI\) \{\s*setWorldNightFixtureActive\(pool\.imI, rec\.slot, true\)/,
  'the existing cached-world rematch owner restores the exact activity slot');

const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
const structureMaterial = new THREE.MeshStandardMaterial({ emissive: 0x221100, emissiveIntensity: .07 });
const type = DESTRUCTIBLE_BUILDING_TYPES.securityoffice;
const intact = new THREE.InstancedMesh(type.build(() => .5), structureMaterial, 2);
const wreck = new THREE.InstancedMesh(type.broken(() => .5), structureMaterial, 2);
prepareWorldStructureNightFixture(intact, true); prepareWorldStructureNightFixture(wreck, false);
root.add(intact, wreck); wreck.count = 0;
const active = intact.geometry.getAttribute(WORLD_FIXTURE_ACTIVE_ATTRIBUTE);
const originalVersion = structureMaterial.version;
assert.equal(active.array.byteLength, 2);
assert.deepEqual([...wreck.geometry.getAttribute(WORLD_FIXTURE_ACTIVE_ATTRIBUTE).array], [0, 0]);
const buckets = Object.fromEntries(['plaster', 'stone', 'roof', 'wood', 'dark', 'glass', 'baked'].map(key => [key, []]));
makeLighthouse(() => .5, buckets);
const lantern = buckets.glass[0], ordinaryGlass = new THREE.BoxGeometry(1, 1, .1);
const beforeGlass = ordinaryGlass.getAttribute('position').array.slice();
const glassMaterial = new THREE.MeshPhysicalMaterial();
prepareWorldStaticNightFixture([lantern, ordinaryGlass], glassMaterial);
assert.deepEqual(new Set(ordinaryGlass.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array), new Set([0]), 'all non-lantern glass stays unlit');
assert.deepEqual(ordinaryGlass.getAttribute('position').array, beforeGlass);
const lampMask = lantern.getAttribute(NIGHT_EMISSION_ATTRIBUTE), lampNormal = lantern.getAttribute('normal');
for (let i = 0; i < lampMask.count; i++) assert.equal(lampMask.getX(i), Math.abs(lampNormal.getY(i)) < .25 ? 1 : 0);
root.add(new THREE.Mesh(lantern, glassMaterial), new THREE.Mesh(ordinaryGlass, glassMaterial));
const curtain = new THREE.MeshStandardMaterial(), plain = new THREE.MeshStandardMaterial();
const fixtures = [{ material: structureMaterial, intensity: 1.2 }, { material: glassMaterial, intensity: 2 }, { material: plain, intensity: 3 }];
registerWorldNightLighting(root, curtain, [], 'coastal', fixtures);
const runtime = createNightLightingRuntime(scene), children = [...root.children], reference = new THREE.Vector3();
try {
  runtime.prepare([{ root }], true); runtime.update(reference);
  assert.equal(runtime.emitterCount, 3, 'one marker per authored shared material, no per-building loop');
  assert.equal(runtime.lights.length, 3); assert(runtime.lights.every(light => light.intensity === 0), 'emission adds no projected-light allocation');
  assert.equal(structureMaterial.emissiveIntensity, 1.2); assert.equal(glassMaterial.emissiveIntensity, 2);
  assert.equal(plain.emissiveIntensity, 1); assert.equal(plain.emissive.getHex(), 0, 'untagged material is never enrolled');
  const version = active.version;
  for (let i = 0; i < 60; i++) runtime.update(reference);
  assert.equal(active.version, version, 'steady-frame lighting does not scan/upload instance activity');
  setWorldNightFixtureActive(intact, 0, false);
  assert.deepEqual([...active.array], [0, 1], 'only destroyed structure switches off');
  const changed = active.version; setWorldNightFixtureActive(intact, 0, false);
  assert.equal(active.version, changed, 'duplicate destruction performs no upload');
  setWorldNightFixtureActive(intact, 0, true); assert.deepEqual([...active.array], [1, 1], 'rematch restores exact slot');
  assert.throws(() => setWorldNightFixtureActive(intact, 2, false), /instance slot/);
  assert.equal(structureMaterial.version, originalVersion, 'activity/night radiance never recompiles shader');
  assert.deepEqual(root.children, children, 'no new scene owners or per-building materials');
  root.visible = false; runtime.update(reference);
  assert.equal(structureMaterial.emissiveIntensity, .07); assert.equal(glassMaterial.emissive.getHex(), 0);
  root.visible = true; runtime.update(reference); assert.equal(glassMaterial.emissiveIntensity, 2);
  runtime.reset();
  assert.equal(structureMaterial.emissive.getHex(), 0x221100); assert.equal(structureMaterial.emissiveIntensity, .07);
  assert.equal(glassMaterial.emissive.getHex(), 0); assert.equal(runtime.group.parent, null);
  runtime.prepare([{ root }], false); runtime.update(reference);
  assert.equal(runtime.emitterCount, 0); assert.equal(glassMaterial.emissive.getHex(), 0, 'day/Garage stays original');
  for (const mapId of ['ruinspires', 'blackglass']) {
    const ruins = new THREE.Group(); scene.add(ruins);
    registerWorldNightLighting(ruins, curtain, [], mapId, fixtures);
    runtime.prepare([{ root: ruins }], true); runtime.update(reference);
    assert.equal(runtime.emitterCount, 0, 'ruined-world panes/beacons are not treated as occupied buildings');
    ruins.removeFromParent();
  }
} finally {
  runtime.dispose(); intact.dispose(); wreck.dispose(); intact.geometry.dispose(); wreck.geometry.dispose();
  for (const geometry of Object.values(buckets).flat()) geometry.dispose(); ordinaryGlass.dispose();
  for (const material of [structureMaterial, glassMaterial, curtain, plain]) material.dispose();
}
console.log('worldNightFixtureInstances: 20-family byte/RNG parity, true apertures, lantern sides, event-owned destruction, stable light/draw owners and day/Garage restoration PASS');
