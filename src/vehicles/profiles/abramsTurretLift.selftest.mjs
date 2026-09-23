import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

const LIFT_M = 0.012;
const CASES = [
  ['m1a2', 1.57],
  ['m1a1', 1.57],
  ['m1a1ha', 1.57],
  ['m1a2_tusk', 1.57],
  ['m1a2_sepv2', 1.57],
  ['m1a2_sepv3', 1.57],
  ['ua_m1a1', 1.57],
  ['abramsx', 1.95],
];

for (const quality of ['high', 'low']) for (const [id, authoredPivotY] of CASES) {
  const isM1A1 = authoredPivotY === 1.57;
  const expectedY = authoredPivotY + LIFT_M + (isM1A1 ? .050 : 0);
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality,
    camoSeed: 4242,
    geometryReceipt: true,
  });
  await Promise.resolve();

  try {
    const turret = tank.root.getObjectByName('rig_turret');
    const gun = tank.root.getObjectByName('rig_gun');
    assert.ok(turret && gun, `${id}: retains canonical turret and gun rigs`);
    assert.equal(turret.userData.abramsTurretLiftM, LIFT_M,
      `${id}: publishes the shared Abrams turret-lift receipt`);
    assert.ok(Math.abs(turret.position.y - expectedY) <= 1e-9,
      `${id}: complete assembly receives only its requested lift`);
    assert.ok(gun.parent === turret, `${id}: gun rises and yaws with the lifted turret`);
    assert.equal(turret.userData.m1a1AdditionalTurretLiftM, isM1A1 ? .050 : undefined);

    if (isM1A1) {
      const shell = tank.root.getObjectByName('turret');
      const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
      const probe = new THREE.Mesh(shell.geometry, material);
      const ray = new THREE.Raycaster();
      // Sample actual triangles around the entire bearing. A box, buried
      // strip or absent low-detail ring cannot satisfy this cross-section.
      for (let k=0; k<48; k++) {
        const a=(k+.5)/48*Math.PI*2;
        ray.set(new THREE.Vector3(Math.sin(a)*3,-.127,Math.cos(a)*3),
          new THREE.Vector3(-Math.sin(a),0,-Math.cos(a)));
        const hit=ray.intersectObject(probe)[0];
        assert.ok(hit && Math.abs(3-hit.distance-1.25)<.004,
          `${id}/${quality}: circular bearing at azimuth ${k}`);
      }
      material.dispose();
      tank.root.updateMatrixWorld(true);
      const meshes=[];
      tank.root.traverse(object => {
        if (!object.isMesh || object.userData.shadowOnly || object.userData.authoredShadowProxy) return;
        // Camouflage cloth intentionally drapes over the FEP/Ukraine seam.
        // Check structural visibility without treating that cloth as armor.
        if (object.name.includes('_ghillie_')) return;
        for (let parent=object; parent; parent=parent.parent) if (!parent.visible) return;
        meshes.push(object);
      });
      for (const side of [-1,1]) {
        // Equipment can cover a short section without burying the bearing.
        const exposed=[-.6,-.3,0,.3,.6].some(z => {
          ray.set(turret.localToWorld(new THREE.Vector3(side*8,-.127,z)),new THREE.Vector3(-side,0,0));
          const hit=ray.intersectObjects(meshes,false)[0];
          return hit?.object === shell && Math.abs(turret.worldToLocal(hit.point.clone()).x)<1.26;
        });
        assert.ok(exposed, `${id}/${quality}: ring is exposed on side ${side}`);
      }
      const position=shell.geometry.attributes.position;
      const ys=Array.from({length:position.count},(_,i)=>position.getY(i)+turret.position.y);
      assert.ok(ys.some(y=>Math.abs(y-1.450)<1e-5), 'bearing lip overlaps the sloping hull deck');
      assert.ok(ys.some(y=>Math.abs(y-1.533)<1e-5), 'bearing overlaps the shell floor by 3 mm');
      assert.ok(ys.some(y=>Math.abs(y-1.530)<1e-5), 'relieved floor exposes 50 mm above the flat deck');
    }

    const spec=getSpec(id);
    const state=createTankState(spec,new THREE.Vector3(),0);
    for (const yaw of [0, Math.PI / 2, Math.PI]) {
      for (const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]) {
        state.turretYaw=yaw;
        state.gunPitch=THREE.MathUtils.degToRad(pitch);
        tank.syncFromState(state,0);
        tank.root.updateMatrixWorld(true);
        assert.ok(Math.abs(turret.position.y - expectedY) <= 1e-9,
          `${id}: lifted seat remains stable through aiming`);
        assert.ok(tank.root.getObjectByName('gunMount')?.parent === gun,
          `${id}: mantlet pitches with the cannon after reseating`);
      }
    }
  } finally {
    tank.dispose();
  }
}

const mbt70 = createTank('mbt70', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
await Promise.resolve();
try {
  const turret = mbt70.root.getObjectByName('rig_turret');
  assert.ok(Math.abs(turret.position.y - 1.49) <= 1e-9,
    'MBT-70 retains its independent 1.49 m turret pivot');
  assert.equal(turret.userData.abramsTurretLiftM, undefined,
    'MBT-70 does not inherit the Abrams turret lift');
} finally {
  mbt70.dispose();
}

console.log('abramsTurretLift.selftest: seven M1A1 variants gain 50 mm and visible circular bearings in high/low; independent Abrams/MBT-70 seats preserved');
