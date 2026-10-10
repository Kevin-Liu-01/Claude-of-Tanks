import assert from 'node:assert/strict';
import * as THREE from 'three';
import {verifyCarvedMuzzleBore} from '../src/vehicles/carvedMuzzleBore.ts';

/** Inspect rendered stock, not a mesh-name substitute for an opening. */
export function assertHollowMuzzle(root, expectedTipZ, tolerance = .003) {
  root.updateMatrixWorld(true);
  const frames=[];
  root.traverseVisible(o=>{if(o.userData.physicalMouth)frames.push(o)});
  assert.ok(frames.length,'a physical mouth must exist');
  for(const frame of frames){
    const seat=frame.userData.muzzleSeatReceipt;
    const tip=frame.getWorldPosition(new THREE.Vector3());
    if(expectedTipZ!==undefined)assert.ok(Math.abs(tip.z-expectedTipZ)<=tolerance,
      `native muzzle endpoint ${tip.z} differs from ${expectedTipZ}`);
    const evidence=verifyCarvedMuzzleBore(root,frame);
    assert.ok(evidence.measuredMinimumDepthM>=.01,'mouth has measurable depth');
    assert.equal(frame.getObjectByName('muzzleBoreShadowFallbackDisc'),undefined,'no front black mask');
    const meshes=[];root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowOnly){
      const ms=Array.isArray(o.material)?o.material:[o.material];
      if(ms.some(m=>m.visible&&m.colorWrite&&(!m.transparent||m.opacity>.001)))meshes.push(o);
    }});
    // Independent center and cardinal rays catch holes that only pass the
    // offset angular samples in the runtime gate.
    for(const [x,y]of [[.00001,.000013],[.5,0],[-.5,0],[0,.5],[0,-.5]]){
      const r=seat.physicalInnerRadiusM;
      const ray=new THREE.Raycaster(frame.localToWorld(new THREE.Vector3(x*r,y*r,.02)),
        new THREE.Vector3(0,0,-1).transformDirection(frame.matrixWorld));
      const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit,'recess must have a backstop');
      const local=frame.worldToLocal(hit.point.clone());
      assert.ok(Math.abs(local.z+seat.physicalBoreDepthM)<.001,'first surface is the recessed backstop');
    }
  }
}
