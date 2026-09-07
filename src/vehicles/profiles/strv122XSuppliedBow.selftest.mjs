import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

// Full-source held-out forward rays, recorded independently before reseating
// the buried draft lights/eyes. Source files are never needed by this test.
const near=(a,b,e,name)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${name}: ${a} vs ${b}`);
for(const quality of ['high','low']){
 const t=createTank('strv122_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
 try{
  t.root.updateMatrixWorld(true);const meshes=[];
  t.root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)meshes.push(m);});
  const cast=(x,y,z=4,far=1)=>new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(0,0,-1),0,far).intersectObjects(meshes,false)[0];
  for(const side of [-1,1]){
   for(const [x,z]of [[1.269,3.748891],[1.43,3.716144],[1.591,3.704431]]){
    const hit=cast(side*x,1.10);
    near(hit?.point.z,z,.020,'three independent exposed source lens stations');
    assert.equal(hit?.object.name,'hullGlass','lens is visible ahead of actual shoulder stock');
   }
   for(const x of [.83,.90])assert.ok(!cast(side*x,.988,3.83,.125),
    'real towing-eye opening stays empty forward of the bow');
   const ring=cast(side*.928,.988);
   near(ring?.point.z,3.804007,.020,'source outboard eye metal remains beside opening');
   assert.equal(ring?.object.name,'hullDetail');
   near(cast(side*.83,.950)?.point.z,3.769536,.015,'lower transverse pin behind the open eye');
  }
 }finally{t.dispose();}
}
console.log('strv122XSuppliedBow: actual high/low exposed source lights, open towing eyes and lower pin pass');
