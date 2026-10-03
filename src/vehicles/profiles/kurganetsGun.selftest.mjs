import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { VEHICLE_SIZE_FACTORS } from '../vehicleSizePolicy.ts';

// Independent source witnesses: the receiver sits above an open-topped
// recess, not inside the former continuous turret roof. See the 2026-09-21
// gun study for immutable Object_29/Object_31 calipers and source hash.
const id = 'kurganets25_x';
// Owner-directed whole-vehicle size (2026-10-02, main 245aa4e4e): the factory bakes the source-frame build into the
// installed frame at this factor, so every source caliper and probe below maps by `f` (the articulation frames keep
// unit scale and carry installed metres).
const f = VEHICLE_SIZE_FACTORS[id] ?? 1;
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
    const downward=(x,z)=>new THREE.Raycaster(new THREE.Vector3(x*f,3.5*f,z*f),new THREE.Vector3(0,-1,0),0,1.1*f).intersectObjects(visible,false)[0];
    function recess() {
      for(const x of [-.18,.18])for(const z of [-1,-.5,-.35]) {
        const hit=downward(x,z);
        assert.ok(hit?.object===turret,`${quality}: exposed recess floor remains structural armor`);
        assert.ok(Math.abs(hit.point.y-2.71465*f)<.002,`${quality}: approved source floor; no roof burying the gun`);
      }
    }
    recess();
    const cap=downward(0,-.8);
    assert.ok(cap?.object===mount,`${quality}: receiver cover is visible above the recess`);
    assert.ok(Math.abs(cap.point.y-3.0764*f)<.002);
    for(const z of [0,.2,.5]) {
      const hit=downward(0,z);
      assert.ok(hit?.object===gun,`${quality}: exposed autocannon, not buried or occluded`);
      assert.ok(Math.abs(hit.point.y-2.955*f)<.004);
    }
    // Recreate the old closed roof. This must fail the same scene-level rays.
    const oldRoof=new THREE.Mesh(new THREE.BoxGeometry(.48,.03,1),turret.material);
    oldRoof.position.set(0,2.95*f,-.7*f);oldRoof.scale.setScalar(f);root.add(oldRoof);visible.push(oldRoof);root.updateMatrixWorld(true);
    assert.throws(recess,assert.AssertionError);
    visible.pop();root.remove(oldRoof);oldRoof.geometry.dispose();

    const spec=getSpec(id),state=createTankState(spec,new THREE.Vector3(),0);
    assert.equal(spec.gun.caliberMm,57,`${quality}: source weapon configuration retained`);
    for(const degrees of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]) {
      state.gunPitch=THREE.MathUtils.degToRad(degrees);state.turretYaw=.7;
      tank.syncFromState(state,1);tank.recoilKick(0,.36);tank.syncFromState(state,.06);root.updateMatrixWorld(true);
      // Both ends of the real transverse trunnion remain seated in their
      // fixed receiving feet at the rotation axis, including during recoil.
      for(const side of [-1,1]) {
        const origin=pitch.localToWorld(new THREE.Vector3(side*.4*f,0,0));
        const direction=new THREE.Vector3(-side,0,0).transformDirection(pitch.matrixWorld);
        const hit=new THREE.Raycaster(origin,direction,0,.6).intersectObject(mount,false)[0];
        assert.ok(hit,`${quality}: physical trunnion cap`);
        const local=pitch.worldToLocal(hit.point.clone());
        assert.ok(Math.abs(Math.abs(local.x)-.26*f)<.001,`${quality}: trunnion remains in receiving foot`);
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
      // lip, while the annulus still presents a physical front face. The lip ray
      // sits 0.5 mm off the annulus's radial seam at y=0, where a ray along the
      // shared triangle edge can slip through by rounding (it did at -10 deg once
      // the build was baked to 0.9).
      const recoil=root.getObjectByName('rig_recoil');
      const cast=(x,y=0)=>new THREE.Raycaster(recoil.localToWorld(new THREE.Vector3(x*f,y,1.6*f)),
        new THREE.Vector3(0,0,-1).transformDirection(recoil.matrixWorld),0,.4*f).intersectObject(recoil,true)[0];
      const bore=cast(0),lip=cast(.034,.0005);
      assert.ok(bore&&lip,`${quality}: bore termination and lip exist`);
      assert.ok(bore.distance-lip.distance>.15,`${quality}: muzzle is visibly open`);
    }
  } finally {tank.dispose();}
}
console.log('kurganetsGun: HIGH/LOW source recess, receiver exposure, barrel, physical trunnions and open muzzle at legal elevations pass');
