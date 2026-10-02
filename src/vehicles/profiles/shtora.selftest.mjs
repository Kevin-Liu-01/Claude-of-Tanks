import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ruShtora } from './russia.ts';
import { vehicleNightLightEmittersFor } from '../vehicleNightLighting.ts';

// The 12 frozen pre-extraction recipe digests are retired (whole-tank change detection is the fleet geometry
// ledger's). Every scale/round/kit recipe still runs live: finite stock, a mirrored round-lens pair on the turret
// group with the canonical red pigment and the night-emission program, or no lens mesh for the flat-glass recipe.
function finite(geometry, label) {
  for (const value of geometry.getAttribute('position').array) assert.ok(Number.isFinite(value), `${label}: finite stock`);
}
for (const scale of [1, 1.32, 1.5]) for (const round of [false, true]) for (const kit of [false, true]) {
  const label = `${scale}/${round}/${kit}`;
  const parts = [], port = { turretG: new THREE.Group(), mats: { dark: new THREE.MeshStandardMaterial() },
    add: (slot, geometry, ...pose) => parts.push([slot, geometry, pose]) };
  ruShtora(port, { rings: [[0, .9], [1, .7]], sz: 1, eyeX: .7, eyeZ: 1.8,
    eyeScale: scale, eyeRound: round, eyeKit: kit }, .4);
  assert.ok(parts.length > 0, `${label}: recipe emits stock`);
  for (const [slot, geometry] of parts) { assert.match(slot, /^turret/, `${label}: turret-owned stock`); finite(geometry, label); geometry.dispose(); }
  const lenses = port.turretG.children;
  assert.equal(lenses.length, round ? 2 : 0, `${label}: round recipes add one lens mesh per side`);
  if (round) assert.ok(Math.abs(lenses[0].position.x + lenses[1].position.x) < 1e-9, `${label}: mirrored lens pair`);
  for (const lens of lenses) {
    finite(lens.geometry, label);
    assert.equal(lens.material.color.getHex(), 0x54180e, `${label}: canonical deep red lens`);
    assert.equal(lens.material.emissive.getHex(), 0x7c2410);
    assert.equal(lens.material.customProgramCacheKey(), 'veh-ambient-floor-v2|night-emission-mask-v1:');
    lens.geometry.dispose();
  }
  port._shtoraRed?.dispose(); port.mats.dark.dispose();
}

for (const id of ['t90_x', 't90a_x', 't90a_vladimir_x', 't90a', 't90a_vladimir']) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), lenses = [];
    if (id === 't90a_x' || id === 't90a_vladimir_x') {
      const sight = tank.root.getObjectByName('turretGlass');
      assert.ok(sight?.geometry.getAttribute('position').count > 0,
        `${id}/${quality} retains a real viewing optic separate from red dazzlers`);
      assert.equal(vehicleNightLightEmittersFor(sight).filter(lamp => lamp.kind === 'shtora').length, 0,
        'viewing glass is not relabeled Shtora geometry');
      const station = id === 't90a_x' ? [-.01,.61,1.0149] : [0,.809,.784];
      const aperture = turret.localToWorld(new THREE.Vector3(...station));
      const forward = new THREE.Vector3(0,0,1).transformDirection(turret.matrixWorld);
      const ray = new THREE.Raycaster(aperture.clone().addScaledVector(forward,.1),forward.clone().negate(),0,.11);
      const hits = ray.intersectObject(sight,false);
      assert.ok(hits.length > 0, `${id}/${quality} actual forward glass occupies its retained bezel`);
      const bezelBack = new THREE.Raycaster(aperture.clone(),forward.clone().negate(),0,.02);
      const bezel = tank.root.getObjectByName('turretDark');
      assert.ok(bezelBack.intersectObject(bezel,false).length > 0,
        `${id}/${quality} glass is seated against the actual existing sight backing`);
    }
    turret.traverse(mesh => {
      if (mesh.isMesh) for (const lamp of vehicleNightLightEmittersFor(mesh)) {
        if (lamp.kind === 'shtora') lenses.push({ mesh, lamp });
      }
    });
    assert.equal(lenses.length, 2, `${id}/${quality} has two real emitters`);
    for (const { mesh: lens, lamp } of lenses) {
      assert.equal(lens.parent, turret, 'eyes belong to the moving turret, not the gun or hull');
      assert.equal(lens.material.color.getHex(), 0x54180e, 'round emitter uses canonical deep red, not blue glass or camouflage');
      assert.equal(lens.material.emissive.getHex(), 0x7c2410);
      // Low detail legitimately batches the pair into one mesh. Inspect each
      // actual aperture's vertices, not the pair's combined bounding box.
      const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
      const positions = lens.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        if (Math.abs(vertex.x - lamp.position[0]) < .25) bounds.expandByPoint(vertex);
      }
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(size.x > .1, 'nonempty physical round emitter');
      assert.ok(Math.abs(size.x - size.y) < 1e-6 && size.z < size.x / 4, 'lens is a forward-facing round disc');
      const local = new THREE.Vector3().fromArray(lamp.position);
      const before = lens.localToWorld(local.clone());
      turret.rotation.y = .61; tank.root.updateMatrixWorld(true);
      const expected = turret.localToWorld(local.clone().applyMatrix4(lens.matrix));
      assert.ok(lens.localToWorld(local.clone()).distanceTo(expected) < 1e-8);
      assert.ok(lens.localToWorld(local.clone()).distanceTo(before) > .05, 'lens actually follows turret yaw');
      turret.rotation.y = 0; tank.root.updateMatrixWorld(true);
      const point = new THREE.Vector3().fromArray(lamp.position).applyMatrix4(lens.matrixWorld);
      const direction = new THREE.Vector3().fromArray(lamp.direction).transformDirection(lens.matrixWorld);
      const stock = ['turret', 'turretExternalArmor', 'turretDetail', 'turretDark'].map(name => tank.root.getObjectByName(name)).filter(Boolean);
      const ray = new THREE.Raycaster(point.clone().addScaledVector(direction, .30), direction.clone().negate(), .001, .295);
      assert.equal(ray.intersectObjects(stock, false).length, 0, `${id}/${quality} red aperture is not buried in casting/ERA`);
    }
  } finally { tank.dispose(); }
}
console.log('shtora: 12 live primitive recipes and high/low canonical red round eyes, turret ownership/yaw and exposed apertures pass');
