import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT} from '../tankFactoryCore.ts';
import {roundedTrackContact} from './roundedTrackContact.ts';

assert.throws(()=>roundedTrackContact([[0,0]],0,0),/radius/);
const course=roundedTrackContact([[3,1],[2,0],[-2,0],[-3,1]],0,.4);
assert.ok(course.length>4);
assert.ok(course.every(p=>p.every(Number.isFinite)&&p[1]>=-1e-10));
const matrix=new THREE.Matrix4();
function minimumShoeY(mesh) {
  const a=mesh.geometry.attributes.position;let low=Infinity;
  for(let i=0;i<mesh.count;i++) {
    mesh.getMatrixAt(i,matrix);const e=matrix.elements;
    for(let k=0;k<a.count;k++)low=Math.min(low,e[1]*a.getX(k)+e[5]*a.getY(k)+e[9]*a.getZ(k)+e[13]);
  }
  return low;
}
for(const id of['amx30_x','amx40_x'])for(const quality of['high','low']) {
  // Observe the REAL running-gear unit returned to the actual factory. No
  // alternate mesh or test-only layout replaces the production geometry.
  const original=KIT.buildRunningGear;let gear,tank;
  KIT.buildRunningGear=(...args)=>{gear=original(...args);return gear;};
  try{tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});}
  finally{KIT.buildRunningGear=original;}
  try {
    const mesh=tank.root.getObjectByName('gearTrackPads');
    assert.equal(mesh.userData.trackRigidLinkChords,true);
    const stations=structuredClone(gear.roadWheelLayout);
    const pitch=mesh.userData.trackShoePitchM;
    for(let phase=0;phase<48;phase++) {
      gear.update(pitch*phase/48,-pitch*phase/48,0);
      const y=minimumShoeY(mesh);
      assert.ok(y>=-.0001,`${id}/${quality} phase${phase}: rigid shoe corner below ground ${y}`);
      assert.ok(y<.0001,`${id}/${quality} phase${phase}: loaded shoes must contact the floor ${y}`);
      assert.deepEqual(gear.roadWheelLayout,stations,'ground correction never moves source axle stations');
    }
  } finally{tank.dispose();}
}
console.log('rounded native contact: actual high/low shoes grounded at all 48 opposing scroll phases, fixed axles PASS');
