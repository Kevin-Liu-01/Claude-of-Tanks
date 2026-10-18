// vehicleMaterialRegistration.selftest.mjs — every opaque lit material a tank draws holds its own vehicle registration
// (2026-10-17, the wheel-band lane, round 2; the owner: "in garage, on all tanks, i can see this weird shadow on wheels,
// no matter what garage i switch through").
//
// The band is the ground occlusion (engine/vehicleGroundOcclusion.ts) darkening the untagged pixels of a hull's own
// running gear under the belly line + 2 cm. A drawn material is tagged only through its registration (the cascade setup
// with the readability hook after it: materials.ts vehicleMaterialSetup). Round 1 put the Garage's energy skin back on
// it; this receipt holds the tanks' own materials there:
//   1. the audit (vehicleMaterialRegistrationAudit.test-support.mjs) sees each way a material leaves the registration —
//      a hand re-hooked raw clone, a hook assigned over the registration, an emptied hook — on seeded materials;
//   2. the registered clones the profiles now make compile, in a renderer stub (the Gallery, the boards), exactly what
//      their hand re-hooks did, and the floorless ones what their raw hookless clones did, under the vehicle tag;
//   3. the tanks whose own materials banded or drew outside the cascades (the M46/M47 camouflaged road wheels, the
//      KF51's tyres and track ceiling, the Abrams' track grime and recess shade, the Merkava's voids, the KV-2's pocket
//      tyres, the Challenger's mud flaps, the Leopard 2A5 kit, the T-90's light clusters and Shtora lenses) draw
//      registered materials only, and release every one on dispose.
// The whole fleet is swept by tools/vehicle-material-registration.mjs (tank-release-check runs it on the released ids).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import {
  chainVehicleMaterialHook, cloneFloorlessVehicleMaterial, cloneRehookedVehicleMaterial, registerVehicleMaterial,
  rehookVehicleMaterial, vehicleAmbientFloorHook,
} from './materials.ts';
import {
  auditVehicleMaterialRegistration, createCascadeRecorder, leakedRegistrations,
} from './vehicleMaterialRegistrationAudit.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { createTank, ensureTankBuilder } = await import('./fleetFactory.ts');

const compile = (material) => {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
};
const meshOf = (material, name) => Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), material), { name });

try {
  // --- 1. the audit sees each way out of the registration
  {
    const recorder = createCascadeRecorder();
    const paint = registerVehicleMaterial(recorder.engineCtx, new THREE.MeshStandardMaterial({ name: 'paint' }), 'veh-ambient-floor-v2', true);
    const rawClone = paint.clone(); rawClone.name = 'raw';
    rawClone.onBeforeCompile = vehicleAmbientFloorHook; // the hand re-hook
    const replaced = registerVehicleMaterial(recorder.engineCtx, new THREE.MeshStandardMaterial({ name: 'replaced' }), 'veh-ambient-floor-v2', true);
    replaced.onBeforeCompile = (shader) => vehicleAmbientFloorHook(shader); // a profile's patch assigned as the whole hook
    const emptied = registerVehicleMaterial(recorder.engineCtx, new THREE.MeshStandardMaterial({ name: 'emptied' }), 'veh-ambient-floor-v2', true);
    emptied.onBeforeCompile = () => {}; // a void stripped of its hook
    const chained = chainVehicleMaterialHook(
      registerVehicleMaterial(recorder.engineCtx, new THREE.MeshStandardMaterial({ name: 'chained' }), 'veh-ambient-floor-v2', true),
      'chained-v1', (shader) => { shader.fragmentShader += '\n// patched'; });
    const glass = new THREE.MeshStandardMaterial({ name: 'glass', transparent: true }); // blended: no tag to write
    const root = new THREE.Group();
    for (const material of [paint, rawClone, replaced, emptied, chained, glass]) root.add(meshOf(material, `${material.name}Mesh`));
    const { checked, faults } = auditVehicleMaterialRegistration(root, recorder);
    assert.equal(checked, 5, 'the opaque lit materials are audited, a blended one is not');
    assert.deepEqual(faults.map((f) => `${f.material}:${f.fault}`).sort(), ['emptied:replaced', 'raw:unregistered', 'replaced:replaced'],
      'a hand re-hooked clone, a replaced hook and an emptied hook leave the registration; a chain keeps it');
    assert.ok(compile(chained).fragmentShader.endsWith('// patched'), 'a chained patch runs after the registration');
    assert.equal(chained.customProgramCacheKey(), 'chained-v1', 'under its own program key');
    // a registered material a profile re-hooks keeps its registration; an unregistered one takes the bare hook
    assert.equal(rehookVehicleMaterial(paint).onBeforeCompile, paint.onBeforeCompile);
    const before = new Set(recorder.registered);
    const leaked = registerVehicleMaterial(recorder.engineCtx, new THREE.MeshStandardMaterial({ name: 'leaked' }), 'veh-ambient-floor-v2', true);
    assert.deepEqual(leakedRegistrations(recorder, before), ['leaked'], 'a registration a build never released is a leak');
    recorder.engineCtx.releaseShadowMaterial(leaked);
  }

  // --- 2. a renderer stub compiles the profiles' registered clones as it compiled their hand re-hooks
  {
    const stub = { anisotropy: 1 }; // no cascade setup: the Gallery's, the boards' path
    const source = registerVehicleMaterial(stub, new THREE.MeshStandardMaterial({ color: 0x445533 }), 'veh-ambient-floor-v5', false);
    source.defines = { ...source.defines, COT_WHEEL_PAINT_READABILITY: 1 };
    const hand = source.clone(); hand.onBeforeCompile = vehicleAmbientFloorHook; hand.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    const rehooked = cloneRehookedVehicleMaterial(source);
    assert.equal(rehooked.customProgramCacheKey(), hand.customProgramCacheKey(), 'the hand re-hook\'s program key');
    assert.deepEqual(rehooked.defines, hand.defines, 'and its defines: no switch of the source rides along, as with the raw clone');
    assert.equal(compile(rehooked).fragmentShader, compile(hand).fragmentShader, 'and its shader text');
    const floorless = cloneFloorlessVehicleMaterial(source);
    assert.equal(floorless.defines.COT_VEHICLE_FLOORLESS, 1, 'a floorless clone carries the switch');
    const text = compile(floorless).fragmentShader;
    const at = (needle) => text.indexOf(needle);
    const gate = at('#ifndef COT_VEHICLE_FLOORLESS'), cavity = at('#ifdef COT_GEAR_CAVITY');
    assert.ok(gate >= 0 && gate < at('float vehFill') && at('float vehFill') < at('uVehGround.xyz')
      && at('uVehGround.xyz') < text.lastIndexOf('#endif', cavity), 'the switch holds the readability floors and the ground occlusion out');
    assert.ok(text.includes('gl_FragColor.a += 2.0;'), 'and leaves the vehicle tag');
    for (const m of [source, hand, rehooked, floorless]) m.dispose();
  }

  // --- 3. the tanks whose own materials left the registration
  const recorder = createCascadeRecorder();
  const IDS = ['m46_patton', 'm47_patton', 'kf51_evo', 'm1a1_abrams_hc', 'merkava1b', 'kv2', 'challenger1_mk2', 'leo2a4m', 't90a'];
  let checked = 0;
  for (const id of IDS) {
    await ensureTankBuilder(id);
    const before = new Set(recorder.registered);
    const visual = createTank(id, recorder.engineCtx, { quality: 'low', decor: true });
    await Promise.resolve();
    const audit = auditVehicleMaterialRegistration(visual.root, recorder);
    checked += audit.checked;
    assert.deepEqual(audit.faults.map((f) => `${f.fault} ${f.material} on ${[...new Set(f.meshes)].slice(0, 4).join(', ')}`), [],
      `${id}: every opaque lit material it draws holds its own vehicle registration`);
    visual.dispose();
    assert.deepEqual(leakedRegistrations(recorder, before), [], `${id}: every registration its build made is released on dispose`);
  }
  assert.ok(checked > 150, `real material sets (${checked} drawn materials)`);
  console.log(`vehicleMaterialRegistration.selftest: the audit sees all three exits; registered clones compile their hand `
    + `re-hooks in a stub; ${IDS.length} tanks, ${checked} drawn materials, all registered and released PASS`);
} finally {
  restoreCanvas();
}
