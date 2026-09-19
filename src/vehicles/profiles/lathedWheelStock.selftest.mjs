import assert from 'node:assert/strict';
import * as THREE from 'three';
import {lathedWheelSection} from './lathedWheelStock.ts';
// A raised hub and thin recessed web. A replacement capped cylinder would
// erase the depth difference this fixture measures from both vehicle sides.
const section=[[-.2,0],[-.2,.1],[-.06,.12],[-.02,.28],[.02,.28],[.06,.12],[.2,.1],[.2,0]];
const material=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
for(const segments of [16,32]) for(const stations of [section,[...section].reverse()]) {
  const geometry=lathedWheelSection(stations,segments),mesh=new THREE.Mesh(geometry,material);
  try {
    for(const side of [-1,1]) {
      const depthAt = radius => {
        const a=.173;
        const hit=new THREE.Raycaster(new THREE.Vector3(side,Math.cos(a)*radius,Math.sin(a)*radius),
          new THREE.Vector3(-side,0,0)).intersectObject(mesh)[0];
        return hit ? side*hit.point.x : null;
      };
      assert.ok(Math.abs(depthAt(.03)-.2)<1e-6,'the hub retains its measured depth');
      assert.ok(depthAt(.2)>.02 && depthAt(.2)<.06,'the exposed web is recessed on both sides');
      assert.equal(depthAt(.30),null,'stock does not spill beyond its authored radius');
    }
  } finally {geometry.dispose();}
}
assert.throws(()=>lathedWheelSection([[0,0],[.1,0],[.2,0],[.3,0]],16),/physical area/);
assert.throws(()=>lathedWheelSection([[0,0],[0,NaN],[1,1],[1,0]],16),/finite/);
material.dispose();
console.log('lathedWheelStock: LOW/HIGH retain physical hub/web depths, front-facing stock and authored envelopes');
