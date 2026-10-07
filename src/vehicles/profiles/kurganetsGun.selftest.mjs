import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

// Independent source witnesses: the receiver sits above an open-topped
// recess, not inside the former continuous turret roof. See the 2026-09-21
// gun study for immutable Object_29/Object_31 calipers and source hash.
const id = 'kurganets25_x', scale = .90; // Owner-approved complete vehicle resize.
await ensureInteriorFills([id]);
for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { proceduralOnly:true, geometryReceipt:true,
    quality, camoSeed:4242, batchStatic:false });
  try {
    const root=tank.root, pitch=root.getObjectByName('rig_gun');
    const mount=root.getObjectByName('gunMount'), gun=root.getObjectByName('gun');
    const turret=root.getObjectByName('turret');
    root.updateMatrixWorld(true);
    const visible=[];
    root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowOnly&&[].concat(o.material).some(m=>m.colorWrite!==false))visible.push(o);});
    const downward=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x,3.5,z).multiplyScalar(scale),new THREE.Vector3(0,-1,0),0,1.1*scale).intersectObjects(visible,false)[0];
    function recess() {
      for(const x of [-.18,.18])for(const z of [-1,-.5,-.35]) {
        const hit=downward(x,z);
        assert.ok(hit?.object===turret,`${quality}: exposed recess floor remains structural armor`);
        assert.ok(Math.abs(hit.point.y/scale-2.71465)<.002,`${quality}: approved source floor; no roof burying the gun`);
      }
    }
    recess();
    const cap=downward(0,-.8);
    assert.ok(cap?.object===mount,`${quality}: receiver cover is visible above the recess`);
    assert.ok(Math.abs(cap.point.y/scale-3.0764)<.002);
    for(const z of [0,.2,.5,1.30,1.60]) {
      const hit=downward(-.004,z);
      assert.ok(hit?.object===gun,`${quality}: enlarged cannon remains exposed`);
      assert.ok(hit.point.y/scale>2.979&&hit.point.y/scale<3.03,`${quality}: substantial tube/jacket above its retained 57 mm bore`);
    }
    assert.ok(Math.abs(root.getObjectByName('rig_muzzle').position.z-2.45*scale)<1e-6,
      `${quality}: firing anchor follows the longer physical cannon`);
    // Recreate the old closed roof. This must fail the same scene-level rays.
    const oldRoof=new THREE.Mesh(new THREE.BoxGeometry(.48*scale,.03*scale,1*scale),turret.material);
    oldRoof.position.set(0,2.95,-.7).multiplyScalar(scale);root.add(oldRoof);visible.push(oldRoof);root.updateMatrixWorld(true);
    assert.throws(recess,assert.AssertionError);
    visible.pop();root.remove(oldRoof);oldRoof.geometry.dispose();

    const spec=getSpec(id),state=createTankState(spec,new THREE.Vector3(),0);
    assert.equal(spec.gun.caliberMm,57,`${quality}: source weapon configuration retained`);
    assert.ok(Math.abs(spec.armor.gunBarrel.lengthM-2.45*scale)<1e-6,`${quality}: combat muzzle matches native cannon length`);
    assert.ok(Math.abs(spec.armor.gunBarrel.radiusM-.069*scale)<1e-6,`${quality}: combat barrel matches its native outer radius`);
    for(const degrees of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]) {
      state.gunPitch=THREE.MathUtils.degToRad(degrees);state.turretYaw=.7;
      tank.syncFromState(state,1);tank.recoilKick(0,.36);tank.syncFromState(state,.06);root.updateMatrixWorld(true);
      // Both ends of the real transverse trunnion remain seated in their
      // fixed receiving feet at the rotation axis, including during recoil.
      for(const side of [-1,1]) {
        const origin=pitch.localToWorld(new THREE.Vector3(side*.4*scale,0,0));
        const direction=new THREE.Vector3(-side,0,0).transformDirection(pitch.matrixWorld);
        const hit=new THREE.Raycaster(origin,direction,0,.6).intersectObject(mount,false)[0];
        assert.ok(hit,`${quality}: physical trunnion cap`);
        const local=pitch.worldToLocal(hit.point.clone());
        assert.ok(Math.abs(Math.abs(local.x)/scale-.26)<.001,`${quality}: trunnion remains in receiving foot`);
        const feet=root.getObjectByName('turretDetail'),material=feet.material,oldSide=material.side;
        material.side=THREE.DoubleSide;
        try {
          const contacts=new THREE.Raycaster(origin,direction,0,.22).intersectObject(feet,false);
          assert.ok(contacts.length>=2,`${quality}: both walls of the fixed bearing foot exist`);
          assert.ok(contacts[0].distance<hit.distance-.01&&contacts.at(-1).distance>hit.distance+.01,
            `${quality}: real trunnion penetrates receiving stock by positive depth`);
        } finally {material.side=oldSide;}
      }
      // Open 57 mm muzzle: center sees the dark inner termination behind the
      // lip, while the annulus still presents a physical front face.
      const recoil=root.getObjectByName('rig_recoil');
      const cast=x=>new THREE.Raycaster(recoil.localToWorld(new THREE.Vector3(x*scale,0,2.55*scale)),
        new THREE.Vector3(0,0,-1).transformDirection(recoil.matrixWorld),0,.4).intersectObject(recoil,true)[0];
      const bore=cast(0),lip=cast(.052);
      assert.ok(bore&&lip,`${quality}: bore termination and lip exist`);
      assert.ok(bore.distance-lip.distance>.15*scale,`${quality}: muzzle is visibly open`);
    }
  } finally {tank.dispose();}
}
console.log('kurganetsGun: HIGH/LOW source recess, receiver exposure, enlarged barrel, physical trunnions and open muzzle at legal elevations pass');
