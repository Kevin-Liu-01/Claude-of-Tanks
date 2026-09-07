import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank as createPlayableTank}from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildChallenger1X as photoDraft} from './challenger1XPhotoDraft.ts';
import {buildChallenger1X as supplied} from './challenger1X.ts';
// Historical photo fittings only; never current supplied-file acceptance.
function createTank(...args) {
 registerProfiledBuilders({challenger1_x:photoDraft});
 try{return createPlayableTank(...args);}
 finally{registerProfiledBuilders({challenger1_x:supplied});}
}
const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,`${label}: ${a} vs ${b}`);
for(const quality of ['high','low']) {
 const tank=createTank('challenger1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
 try {
  tank.root.updateMatrixWorld(true);const meshes=[];
  tank.root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)meshes.push(m);});
  const cast=(p,d,far=10)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(meshes,false)[0];
  const frames=meshes.filter(m=>m.name==='hullDetail').map(m=>[m,m.matrixWorld.clone()]);
  // Six hinged access covers, not eight identical grilles: Fig17 separates
  // two narrow fixed center air fields from the broad forward outer covers.
  for(const side of [-1,1])for(const [x,z,length]of[[.25,-3.43,.82],[.81,-3.43,.82],[.72,-2.48,.77]]) {
   const center=z-length/2+.08;
   assert.ok(!cast([side*x,1.868,center+.16],[0,0,-1],.20),'louvre handle center is actual open air');
   const rail=cast([side*x,1.884,center+.16],[0,0,-1],.20);
   assert.equal(rail?.object.name,'hullDetail','open handle retains its upper metal rail');
   near(rail?.point.z,center+.00873,.0002,'drawing-led crossbar seating contract');
   for(const dx of [-.056,.056]) {
    const foot=cast([side*x+dx,2,center],[0,-1,0],.2);
    assert.equal(foot?.object.name,'hullDetail','both feet terminate in actual metal stock');
    assert.ok(foot.point.y>1.878&&foot.point.y<1.90,'short rooted handle, not a free floating high rail');
   }
  }
  for(const side of [-1,1]) {
   assert.ok(!cast([side*.17,1.868,-2.60],[0,0,-1],.20),
    'fixed center air field has no invented hinge-cover grasp handle');
   const gap=cast([side*.35,2,-2.48],[0,-1,0]);
   assert.equal(gap?.object.name,'hull','separate fields expose the retained structural deck in their gap');
   near(gap?.point.y,1.8021052,.00001,'unchanged canted structural deck below separated frames');
   assert.ok(cast([side*.17,2,-2.48],[0,-1,0])?.point.y>1.84,'narrow center field remains solid');
   assert.ok(cast([side*.40,2,-2.48],[0,-1,0])?.point.y>1.84,'broad outer cover starts independently');
  }
  assert.ok(!cast([0,1.712,2.2],[0,0,-1],.20),'driver handle center remains open');
  near(cast([0,1.728,2.2],[0,0,-1],.20)?.point.z,2.04873,.0002,'driver handle rail');
  for(const side of [-1,1])for(const dx of [-.145,.145]) {
   const lamp=cast([side*1.30+dx,1.526,3.7],[0,0,-1],.5);
   assert.equal(lamp?.object.name,'hullGlass','each separate marker has a visible forward lens');
   near(lamp?.point.z,3.504,.0002,'small lens surface, not a large duplicated headlamp');
  }
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  turret.rotation.y=.9;gun.rotation.x=.2;tank.root.updateMatrixWorld(true);
  for(const [mesh,matrix]of frames)assert.ok(mesh.matrixWorld.equals(matrix),'hull fixtures cannot follow gun or turret motion');
 }finally{tank.dispose();}
}
console.log('challenger1XDeckFittings.selftest: high/low open handles, visible markers and permanent hull ownership passed');
