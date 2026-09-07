import assert from 'node:assert/strict';
import * as THREE from 'three';
import { box, cylZ, xform, mergeAll } from './factoryGeometry.ts';
import {
  markVehicleNightLens, prepareVehicleNightLensParts, registerVehicleNightLensMesh,
  transferVehicleNightLenses, finalizeVehicleNightLighting, vehicleNightLightEmittersFor,
} from './vehicleNightLighting.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../engine/nightEmissionMaterial.ts';
import { createNightLightingRuntime } from '../engine/nightLightingRuntime.ts';

const close = (actual, expected, message) => assert.ok(actual.distanceTo(expected) < 2e-6, message);
const material = new THREE.MeshStandardMaterial({ emissive: 0x010203, emissiveIntensity: .2 });
const plain = xform(box(.2, .03, .1), 0, 2, 0);
const head = markVehicleNightLens(cylZ(.08, .02, 16), 'headlight');
const originalHead = head.getAttribute('position').array.slice();
const clonedHead = head.clone(); // authored profile cloning preserves semantic faces
const pose = new THREE.Matrix4().compose(new THREE.Vector3(1, 1.7, 3),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(.15, .2, -.1)), new THREE.Vector3(1.2, .8, 1.6));
clonedHead.applyMatrix4(pose);
const red = xform(markVehicleNightLens(box(.17, .18, .03), 'shtora'), -.7, .5, 1.4);
const parts = [plain, clonedHead, red];
prepareVehicleNightLensParts(parts);
assert.deepEqual(head.getAttribute('position').array, originalHead, 'semantic marker never changes source vertices');
assert.ok([...plain.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].every(value => value === 0), 'periscope remains entirely unlit');
for (const part of [clonedHead, red]) assert.ok([...part.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].some(value => value > 0));
const merged = mergeAll(parts), mesh = new THREE.Mesh(merged, material);
registerVehicleNightLensMesh(mesh, parts);
const lamps = vehicleNightLightEmittersFor(mesh);
assert.equal(lamps.length, 2);
close(new THREE.Vector3().fromArray(lamps[0].position), new THREE.Vector3(0, 0, .01).applyMatrix4(pose), 'emitter sits on transformed real lens aperture');
close(new THREE.Vector3().fromArray(lamps[0].direction), new THREE.Vector3(0, 0, 1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(pose)), 'direction follows actual transformed front normal');
assert.deepEqual(lamps.map(lamp => lamp.kind), ['headlight', 'shtora']);
assert.strictEqual(lamps[0].emission.material, lamps[1].emission.material, 'mixed lens colors share the existing draw/material');

const scene = new THREE.Scene(), tank = new THREE.Group(), turret = new THREE.Group();
scene.add(tank); tank.add(turret); turret.add(mesh);
const plainOptic = new THREE.Mesh(box(.1, .1, .1), material); tank.add(plainOptic);
finalizeVehicleNightLighting(tank);
assert.ok([...plainOptic.geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].every(value => value === 0));
assert.deepEqual(tank.userData.nightLightCoverage, { headlights: 1, shtora: 1 });
const oldColor = material.emissive.clone(), oldIntensity = material.emissiveIntensity;
let alive = true;
const runtime = createNightLightingRuntime(scene);
runtime.prepare([{ root: tank, isActive: () => alive }], true);
assert.equal(runtime.emitterCount, 2);
tank.rotation.set(.3, .7, Math.PI); turret.rotation.y = -.6;
tank.position.set(4, 2, -3); tank.updateMatrixWorld(true);
runtime.update(tank.position);
const spot = runtime.lights.find(light => light.isSpotLight && light.intensity > 0);
assert.ok(spot, 'authored headlamp activates within bounded runtime');
close(spot.position, new THREE.Vector3().fromArray(lamps[0].position).applyMatrix4(mesh.matrixWorld), 'upside-down hull and turret yaw keep light seated');
close(spot.target.position.clone().sub(spot.position).normalize(), new THREE.Vector3().fromArray(lamps[0].direction).transformDirection(mesh.matrixWorld), 'beam follows rotated lens, not global or inferred tank forward');
alive = false; runtime.update(tank.position);
assert.ok(runtime.lights.every(light => light.intensity === 0), 'destroyed tank has no active light');
assert.deepEqual(material.emissive.toArray(), oldColor.toArray());
assert.equal(material.emissiveIntensity, oldIntensity);
alive = true; runtime.update(tank.position);
runtime.reset();
assert.deepEqual(material.emissive.toArray(), oldColor.toArray(), 'garage returns exact original emissive color');
assert.equal(material.emissiveIntensity, oldIntensity);

// Mobile's existing static batch replaces unnamed direct Shtora meshes. The
// source registration is transported into that existing replacement mesh.
const replacement = new THREE.Mesh(merged.clone(), material);
mesh.position.set(2, 3, 4); mesh.rotation.y = .8; mesh.updateMatrix();
transferVehicleNightLenses([mesh], replacement);
const moved = vehicleNightLightEmittersFor(replacement);
assert.equal(moved.length, lamps.length);
close(new THREE.Vector3().fromArray(moved[0].position), new THREE.Vector3().fromArray(lamps[0].position).applyMatrix4(mesh.matrix), 'static-batch replacement preserves source seat');
assert.equal(tank.children.length, 2, 'night setup adds no vehicle mesh/rig owners');
runtime.dispose(); material.dispose(); head.dispose(); merged.dispose(); plainOptic.geometry.dispose(); replacement.geometry.dispose();
console.log('vehicleNightLighting: authored aperture/clone/scale/roll/yaw, periscope exclusion, zero added owners, batch transport, destruction/garage restoration PASS');

// Opt-in CPU integration oracle. --baseline=<ref> loads only the three edited
// builders from that known revision, making geometry/draw-order parity visible
// without maintaining duplicate builders or requiring a native renderer.
if (process.argv.includes('--fleet')) {
  const { createHash } = await import('node:crypto');
  const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11);
  if (baseline) {
    const { registerHooks, stripTypeScriptTypes } = await import('node:module');
    const { execFileSync } = await import('node:child_process');
    const paths = ['tankFactoryCore.ts', 'profiles/russia.ts', 'profiles/t90X.ts', 'profiles/abrams.ts'];
    const sources = new Map(paths.map(path => [new URL(path, import.meta.url).href,
      stripTypeScriptTypes(execFileSync('git', ['show', `${baseline}:src/vehicles/${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))]));
    registerHooks({ load(url, context, next) {
      return sources.has(url) ? { format: 'module', source: sources.get(url), shortCircuit: true } : next(url, context);
    } });
  }
  const { createTank } = await import('./tankFactory.ts');
  const tejasIds = ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tusk', 'm1a2_sepv2', 'm1a2_sepv3'];
  const ids = ['m48', ...tejasIds, 't90a_vladimir', 't90a_x'];
  const rows = [];
  for (const id of ids) for (const quality of ['high', 'low']) {
    const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    const hash = createHash('sha256');
    let meshCount = 0, vertices = 0, maskBytes = 0;
    visual.root.updateMatrixWorld(true);
    visual.root.traverse(node => {
      if (!node.isMesh) return;
      meshCount++;
      hash.update(JSON.stringify([node.name, node.matrixWorld.elements, node.castShadow, node.receiveShadow, node.count ?? null]));
      for (const key of ['position', 'normal', 'uv', 'color']) {
        const attribute = node.geometry.getAttribute(key);
        if (attribute) hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
      }
      if (node.geometry.index) hash.update(Buffer.from(node.geometry.index.array.buffer));
      if (node.instanceMatrix) hash.update(Buffer.from(node.instanceMatrix.array.buffer));
      if (node.instanceColor) hash.update(Buffer.from(node.instanceColor.array.buffer));
      vertices += node.geometry.getAttribute('position').count;
      maskBytes += node.geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE)?.array.byteLength ?? 0;
    });
    const coverage = visual.root.userData.nightLightCoverage ?? { headlights: 0, shtora: 0 };
    if (!baseline) {
      if (id === 'm48') assert.ok(coverage.headlights >= 2, `${id}/${quality} shared helper lenses survive full build`);
      if (id.startsWith('t90a')) assert.equal(coverage.shtora, 2, `${id}/${quality} real Shtora pair survives batch/rig setup`);
      if (tejasIds.includes(id)) {
        const hull = visual.root.getObjectByName('hull');
        assert.ok(hull, `${id}/${quality} has the authored hull to test against`);
        let checked = 0;
        visual.root.traverse(owner => {
          for (const lamp of vehicleNightLightEmittersFor(owner)) {
            if (lamp.kind !== 'headlight') continue;
            const point = new THREE.Vector3().fromArray(lamp.position).applyMatrix4(owner.matrixWorld);
            const direction = new THREE.Vector3().fromArray(lamp.direction).transformDirection(owner.matrixWorld);
            const ray = new THREE.Raycaster(point.clone().addScaledVector(direction, .002), direction, .001, .5);
            assert.equal(ray.intersectObject(hull, false).length, 0,
              `${id}/${quality} actual emitting aperture is not buried behind the rebuilt bow`);
            checked++;
          }
        });
        assert.ok(checked >= 2, `${id}/${quality} tests both real bow lenses, not an empty registration`);
      }
    }
    rows.push({ id, quality, meshCount, vertices, digest: hash.digest('hex'), maskBytes, coverage });
    visual.dispose();
  }
  console.log('NIGHT_FLEET_ORACLE ' + JSON.stringify(rows));
}
