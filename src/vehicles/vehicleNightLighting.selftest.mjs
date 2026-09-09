import assert from 'node:assert/strict';
import * as THREE from 'three';
import { box, cylY, cylZ, xform, mergeAll } from './factoryGeometry.ts';
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
material.emissive.setHex(0x43120d); // a later Shtora-family authoring adjustment
finalizeVehicleNightLighting(tank);
const authoredShader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
material.onBeforeCompile(authoredShader, {});
assert.deepEqual(authoredShader.uniforms.nightEmissionBase.value.toArray(), material.emissive.clone().multiplyScalar(material.emissiveIntensity).toArray(),
  'late profile emissive edits define the exact day radiance before night starts');
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
// Blackout/parking lamps glow but must never occupy a headlight beam slot.
const markerPart = markVehicleNightLens(box(.06, .02, .01), 'marker', { tint: 'red' });
prepareVehicleNightLensParts([markerPart]);
const markerMaterial = new THREE.MeshStandardMaterial();
const markerMesh = new THREE.Mesh(markerPart, markerMaterial);
registerVehicleNightLensMesh(markerMesh, [markerPart]);
finalizeVehicleNightLighting(markerMesh);
const marker = vehicleNightLightEmittersFor(markerMesh)[0];
assert.equal(marker.kind, 'marker');
assert.equal(marker.intensity, 0);
assert.equal(marker.range, 0);
assert.deepEqual(markerMesh.userData.nightLightCoverage, { headlights: 0, shtora: 0, markers: 1 });
assert.ok([...markerPart.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].some(value => value === 2));
markerPart.dispose(); markerMaterial.dispose();
const serviceCap = markVehicleNightLens(cylY(.068, .068, .012, 16), 'marker', { apertureAxis: 'y' });
const servicePositions = serviceCap.getAttribute('position').array.slice();
prepareVehicleNightLensParts([serviceCap]);
const serviceMaterial = new THREE.MeshStandardMaterial();
const serviceMesh = new THREE.Mesh(serviceCap, serviceMaterial);
registerVehicleNightLensMesh(serviceMesh, [serviceCap]);
const serviceLamp = vehicleNightLightEmittersFor(serviceMesh)[0];
close(new THREE.Vector3().fromArray(serviceLamp.direction), new THREE.Vector3(0, 1, 0), 'authored upward service cap stays upward');
assert.equal(serviceLamp.kind, 'marker');
assert.equal(serviceLamp.intensity, 0, 'service cap never invents a forward beam');
assert.deepEqual(serviceCap.getAttribute('position').array, servicePositions, 'service semantics leave geometry bytes unchanged');
const serviceMask = serviceCap.getAttribute(NIGHT_EMISSION_ATTRIBUTE), serviceNormals = serviceCap.getAttribute('normal');
for (let i = 0; i < serviceMask.count; i++) if (serviceMask.getX(i)) assert.ok(serviceNormals.getY(i) > .98, 'only actual upward aperture glows');
serviceCap.dispose(); serviceMaterial.dispose();

// Authored lens rake is decorative geometry, not necessarily optical aim.
// Exercise azimuth, role and sign independently of any particular builder.
for (const kind of ['headlight', 'shtora', 'marker']) for (const pitch of [-.12, -1e-8, 0, 1e-8, .18]) {
  const lens = markVehicleNightLens(cylZ(.08, .02, 16), kind);
  const lensPose = new THREE.Matrix4().compose(new THREE.Vector3(.7, 1.1, 3.9),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, -.35, 0)), new THREE.Vector3(1.2, .8, 1.6));
  lens.applyMatrix4(lensPose);
  prepareVehicleNightLensParts([lens]);
  const bytes = Object.fromEntries(Object.entries(lens.attributes).map(([key, attr]) => [key, attr.array.slice()]));
  const indices = lens.index?.array.slice();
  const lensMaterial = new THREE.MeshStandardMaterial();
  const owner = new THREE.Mesh(lens, lensMaterial);
  registerVehicleNightLensMesh(owner, [lens]);
  const [emitter] = vehicleNightLightEmittersFor(owner);
  const actual = new THREE.Vector3().fromArray(emitter.direction);
  const outward = new THREE.Vector3(0, 0, 1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(lensPose));
  close(new THREE.Vector3().fromArray(emitter.position), new THREE.Vector3(0, 0, .01).applyMatrix4(lensPose), `${kind}/${pitch}: aperture seat unchanged`);
  if (kind === 'headlight' && pitch < -1e-7) {
    assert.ok(Math.abs(actual.y / Math.hypot(actual.x, actual.z) + .08) < 1e-12, 'upward driving lamp uses the existing downward road slope');
    assert.ok(Math.abs(actual.x * outward.z - actual.z * outward.x) < 2e-7 && actual.dot(outward) > 0,
      'optical correction preserves horizontal azimuth, including its sign');
  } else close(actual, outward, `${kind}/${pitch}: already-valid aim or non-driving role unchanged`);
  assert.equal(emitter.intensity, kind === 'headlight' ? 80 : 0);
  assert.equal(emitter.range, kind === 'headlight' ? 42 : 0);
  for (const [key, original] of Object.entries(bytes)) assert.deepEqual(lens.getAttribute(key).array, original, `${key}: registration leaves every aperture/mask byte unchanged`);
  assert.deepEqual(lens.index?.array, indices);
  assert.strictEqual(emitter.emission.material, lensMaterial);
  lens.dispose(); lensMaterial.dispose();
}
console.log('vehicleNightLighting: authored aperture/clone/scale/roll/yaw, periscope exclusion, zero added owners, batch transport, destruction/garage restoration PASS');

function assertM1A3RoadBeams(root, label) {
  // Exact player pose from the completed cold-night Urban r2 capture. This is
  // a local road-tangent-plane proof, not a claim about unknown terrain ahead.
  const nativePose = new THREE.Matrix4().fromArray([
    .9984977381716386, 0, -.054792945404696376, 0,
    -9.675932139275984e-18, 1, -1.7632555221134806e-16, 0,
    .054792945404696376, 1.7659083788634307e-16, .9984977381716386, 0,
    -7.658522125720524e-19, -1.6163570222854615, -330, 1,
  ]);
  const poses = [nativePose];
  for (const mirror of [1, -1]) poses.push(new THREE.Matrix4().compose(new THREE.Vector3(4, 2, -6),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-.22, .71, .16)), new THREE.Vector3(mirror, 1, 1)));
  const scene = new THREE.Scene(), lightRuntime = createNightLightingRuntime(scene);
  const savedMatrix = root.matrix.clone(), savedAuto = root.matrixAutoUpdate;
  scene.add(root); root.matrixAutoUpdate = false;
  const lamps = [];
  root.traverse(owner => {
    for (const lamp of vehicleNightLightEmittersFor(owner)) if (lamp.kind === 'headlight') lamps.push({ owner, lamp });
  });
  assert.equal(lamps.length, 2, `${label}: test both actual exported M1A3 lamps`);
  lightRuntime.prepare([{ root, priority: 1 }], true);
  for (const [poseIndex, ownerPose] of poses.entries()) {
    root.matrix.copy(ownerPose); root.updateMatrixWorld(true);
    const road = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(ownerPose);
    lightRuntime.update(new THREE.Vector3().setFromMatrixPosition(ownerPose));
    const spots = lightRuntime.lights.filter(light => light.isSpotLight && light.intensity > 0);
    assert.equal(spots.length, 2);
    for (const { owner, lamp } of lamps) {
      const point = new THREE.Vector3().fromArray(lamp.position).applyMatrix4(owner.matrixWorld);
      const beam = new THREE.Vector3().fromArray(lamp.direction).transformDirection(owner.matrixWorld);
      const local = point.clone().applyMatrix4(ownerPose.clone().invert());
      assert.ok(Math.abs(Math.abs(local.x) - .82) < 2e-6 && Math.abs(local.y - 1.1250758171081543) < 2e-6
        && Math.abs(local.z - 3.9420950412750244) < 2e-6, `${label}: original native aperture coordinates retained`);
      const hit = new THREE.Ray(point, beam).intersectPlane(road, new THREE.Vector3());
      assert.ok(hit && point.distanceTo(hit) > 14 && point.distanceTo(hit) < 14.2 && point.distanceTo(hit) < lamp.range,
        `${label}/pose${poseIndex}: center ray reaches the owner's road plane ahead, within the existing 42m range`);
      const actualSpot = spots.find(spot => spot.position.distanceTo(point) < 2e-6);
      assert.ok(actualSpot, `${label}: runtime still seats a pooled spot on this real aperture`);
      close(actualSpot.target.position.clone().sub(actualSpot.position).normalize(), beam, 'runtime transforms housing-local road aim with pitch/roll/mirroring');
      // Actual rejected M1A3 optical direction was the decorative lens's +.12
      // rake. It misses the same road plane ahead under every owner transform.
      const oldUp = new THREE.Vector3(0, Math.sin(.12), Math.cos(.12)).transformDirection(ownerPose);
      assert.equal(new THREE.Ray(point, oldUp).intersectPlane(road, new THREE.Vector3()), null, 'old upward-rake mutation must fail the road intersection');
      if (poseIndex > 0) assert.ok(beam.y > 0, 'pitched hull may aim upward in world Y while still aiming down relative to its roadway');
    }
  }
  lightRuntime.reset(); lightRuntime.dispose(); scene.remove(root);
  root.matrix.copy(savedMatrix); root.matrixAutoUpdate = savedAuto; root.updateMatrixWorld(true);
}

// Opt-in CPU integration oracle. --baseline=<ref> loads edited vehicle sources
// from that known revision, making geometry/draw-order parity visible
// without maintaining duplicate builders or requiring a native renderer.
function assertExteriorHeadlightFaces(root, label, expectedRays) {
  const meshes=[];
  root.traverseVisible(mesh=>{if(mesh.isMesh&&!mesh.userData.shadowOnly)meshes.push(mesh);});
  let checked=0;
  for(const mesh of meshes){
    if(!vehicleNightLightEmittersFor(mesh).some(lamp=>lamp.kind==='headlight'))continue;
    const geometry=mesh.geometry,mask=geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
    const count=geometry.index?.count??position.count;
    for(let offset=0;offset<count;offset+=3){
      const ids=[0,1,2].map(corner=>geometry.index?.getX(offset+corner)??offset+corner);
      if(!ids.every(vertex=>mask.getX(vertex)===1))continue;
      const point=new THREE.Vector3();
      for(const vertex of ids)point.add(new THREE.Vector3().fromBufferAttribute(position,vertex));
      point.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld);
      const direction=new THREE.Vector3().fromBufferAttribute(normal,ids[0])
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
      for(const side of[-.65,0,.65]){
        const camera=point.clone().addScaledVector(direction,4)
          .addScaledVector(new THREE.Vector3(-direction.z,0,direction.x),side)
          .add(new THREE.Vector3(0,side===0?0:.25,0));
        const delta=point.clone().sub(camera),distance=delta.length();
        const hit=new THREE.Raycaster(camera,delta.normalize(),.02,distance+.02).intersectObjects(meshes,false)[0];
        assert.ok(hit?.object===mesh&&hit.faceIndex===offset/3,
          `${label} aperture face ${offset/3}, view ${side}: first exterior hit must be the lens, not ${hit?.object.name}/${hit?.faceIndex}`);
        checked++;
      }
    }
  }
  assert.equal(checked,expectedRays,`${label} all complete authored apertures are visible from front and both quarters`);
}

// Keep the four repaired lamp assemblies in the ordinary npm test path.
// Explicit --fleet still supports the broader opt-in census and baseline mode.
const physicalRun=!process.argv.includes('--fleet')||process.argv.includes('--physical');
{
  const { createHash } = await import('node:crypto');
  const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11);
  if (baseline) {
    const { registerHooks, stripTypeScriptTypes } = await import('node:module');
    const { execFileSync } = await import('node:child_process');
    const paths = execFileSync('git', ['diff', '--name-only', baseline, '--', 'src/vehicles'], { encoding: 'utf8' })
      .trim().split('\n').filter(path => path.endsWith('.ts') && !path.includes('.selftest.'))
      .map(path => path.slice('src/vehicles/'.length));
    const sources = new Map(paths.map(path => [new URL(path, import.meta.url).href,
      stripTypeScriptTypes(execFileSync('git', ['show', `${baseline}:src/vehicles/${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))]));
    registerHooks({ load(url, context, next) {
      return sources.has(url) ? { format: 'module', source: sources.get(url), shortCircuit: true } : next(url, context);
    } });
  }
  const { createTank } = await import('./tankFactory.ts');
  const tejasIds = ['m1a1', 'm1a1ha', 'm1a2', 'm1a2_tusk', 'm1a2_sepv2', 'm1a2_sepv3'];
  const shtoraIds = ['t90a', 't90a_vladimir', 't90a_x', 't90a_vladimir_x', 't90_x'];
  const sourceStudyLampIds = new Set([
    'leo2a6_x', 'k1a1_x', 'amx30_x', 't62mv1_x', 't72b_1987_x', 't80u_x', 'leclerc_x',
    'leclerc_classic_x', 'chieftain_mk10_x', 't72b3_x', 'jpz_e100_x', 'type10_x', 'type90_x',
    'amx40_x', 'ariete_c1_x', 'strv122_x', 't72b3m_x', 'challenger1_x', 't72bu_x',
    'chieftain5_x', 't90_x', 't90a_burlak_x', 't90ms_x',
  ]);
  const requestedIds = process.argv.find(arg => arg.startsWith('--ids='))?.slice(6).split(',');
  const physicalIds = ['m1a3', 'mbt70', 't90m', 't90m_proryv'];
  const allIds = process.argv.includes('--all') ? (await import('./specs.ts')).DEVELOPMENT_TANK_IDS : null;
  const offset = Number(process.argv.find(arg => arg.startsWith('--offset='))?.slice(9) ?? 0);
  const count = Number(process.argv.find(arg => arg.startsWith('--count='))?.slice(8) ?? Infinity);
  const ids = (requestedIds ?? allIds ?? (physicalRun ? physicalIds : ['m48', ...tejasIds, 't90a_vladimir', 't90a_x'])).slice(offset, offset + count);
  const rows = [];
  for (const id of ids) for (const quality of ['high', 'low']) {
    const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality, camoSeed: 4242 });
    const hash = createHash('sha256');
    let meshCount = 0, vertices = 0, maskBytes = 0;
    const materials = new Set();
    visual.root.updateMatrixWorld(true);
    visual.root.traverse(node => {
      if (!node.isMesh) return;
      meshCount++;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      hash.update(JSON.stringify((Array.isArray(node.material) ? node.material : [node.material]).map(material => [
        material.type, material.name, material.color?.toArray(), material.emissive?.toArray(), material.emissiveIntensity,
        material.roughness, material.metalness, material.opacity, material.transparent, material.side,
      ])));
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
      if (id === 'm1a3') assertM1A3RoadBeams(visual.root, `${id}/${quality}`);
      if (sourceStudyLampIds.has(id)) assert.ok(coverage.headlights > 0, `${id}/${quality} retains actual authored front fixtures`);
      if (coverage.headlights + coverage.shtora + (coverage.markers ?? 0) > 0) assert.ok(maskBytes > 0, `${id}/${quality} registration requires real masked aperture vertices`);
      if (id === 'm48') assert.ok(coverage.headlights >= 2, `${id}/${quality} shared helper lenses survive full build`);
      if (shtoraIds.includes(id)) assert.equal(coverage.shtora, 2, `${id}/${quality} real Shtora pair survives batch/rig setup`);
      if (tejasIds.includes(id) || process.argv.includes('--exposed') || physicalRun) {
        const hull = visual.root.getObjectByName('hull');
        assert.ok(hull, `${id}/${quality} has the authored hull to test against`);
        let checked = 0;
        visual.root.traverse(owner => {
          for (const lamp of vehicleNightLightEmittersFor(owner)) {
            if (lamp.kind !== 'headlight') continue;
            const point = new THREE.Vector3().fromArray(lamp.position).applyMatrix4(owner.matrixWorld);
            const direction = new THREE.Vector3().fromArray(lamp.direction).transformDirection(owner.matrixWorld);
            // Start OUTSIDE: an outward ray starting inside a single-sided
            // hull misses its backface and falsely approves a buried lens.
            const ray = new THREE.Raycaster(point.clone().addScaledVector(direction, .5), direction.clone().negate(), .001, .498);
            assert.equal(ray.intersectObject(hull, false).length, 0,
              `${id}/${quality} actual emitting aperture is not buried behind the rebuilt bow`);
            if(physicalIds.includes(id)){
              const support=new THREE.Raycaster(point,direction.clone().negate(),0,.025).intersectObject(hull,false)[0];
              assert.ok(support&&support.distance>.005,
                `${id}/${quality} original pod remains connected to nearby hull stock behind its exposed lens`);
            }
            checked++;
          }
        });
        assert.ok(checked >= 2, `${id}/${quality} tests both real bow lenses, not an empty registration`);
        if (physicalIds.includes(id)) assert.equal(checked, id.startsWith('t90') ? 4 : 2,
          `${id}/${quality} restores only the existing lamp apertures`);
        if(physicalIds.includes(id))assertExteriorHeadlightFaces(visual.root,`${id}/${quality}`,id.startsWith('t90')?120:72);
      }
    }
    const hull = visual.root.getObjectByName('hull'), hullHash = createHash('sha256');
    if (hull?.isMesh) {
      hullHash.update(JSON.stringify(hull.matrixWorld.elements));
      for (const key of ['position', 'normal', 'uv', 'color']) {
        const attribute = hull.geometry.getAttribute(key);
        if (attribute) hullHash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
      }
      if (hull.geometry.index) hullHash.update(Buffer.from(hull.geometry.index.array.buffer));
    }
    rows.push({ id, quality, meshCount, materialCount: materials.size, vertices, digest: hash.digest('hex'), hullDigest: hullHash.digest('hex'), maskBytes, coverage });
    visual.dispose();
  }
  console.log('NIGHT_FLEET_ORACLE ' + JSON.stringify(rows));
}
