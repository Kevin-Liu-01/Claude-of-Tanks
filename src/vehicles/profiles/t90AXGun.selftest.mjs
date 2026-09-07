import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';

// Held-out canonical owner-source weapon.001 rays (source hash is pinned
// independently by the QA source-world certificate, not loaded at runtime).
const SECTIONS=[
  [1.9,1.93014047,1.70448549,-.10855794,.11747120],
  [2.1,1.92122183,1.71346848,-.09957498,.10855412],
  [2.3,1.91433552,1.72042748,-.09253147,.10170395],
  [3.88,1.91013430,1.72498517,-.08697338,.09880101],
  [4.36,1.93314632,1.70200357,-.11085352,.12029274],
  [4.83,1.90740166,1.72793231,-.08362173,.09704581],
  [5.5,1.90547443,1.73001082,-.08125794,.09580793],
  [6.05,1.90389237,1.73171706,-.07931752,.09479176],
  [6.10,1.90374855,1.73187217,-.07914111,.09469938],
  [6.20,1.90346067,1.73218240,-.07878831,.09451462],
];
function near(actual,wanted,tolerance,label){assert.ok(Number.isFinite(actual)&&Math.abs(actual-wanted)<tolerance,`${label}: ${actual} vs source ${wanted} ±${tolerance}`);}
function first(mesh,origin,direction,axis){return new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)).intersectObject(mesh,true)[0]?.point[axis];}
function sourceSections(gun,label){
  for(const[z,top,bottom,left,right]of SECTIONS){
    near(first(gun,[.005,3,z],[0,-1,0],'y'),top,.0035,`${label} top@${z}`);
    near(first(gun,[.005,0,z],[0,1,0],'y'),bottom,.0035,`${label} bottom@${z}`);
    near(first(gun,[-1,1.8174,z],[1,0,0],'x'),left,.0035,`${label} left@${z}`);
    near(first(gun,[1,1.8174,z],[-1,0,0],'x'),right,.0035,`${label} right@${z}`);
  }
}
function seamsAndAir(gun,label){
  // True raised strips and their four independently measured interruptions.
  for(const[z,top]of[[2.5,1.932092],[3.3,1.932198],[4.9,1.932468],[5.9,1.932285]]){
    near(first(gun,[.005,3,z],[0,-1,0],'y'),top,.0006,`${label} narrow seam@${z}`);
    assert.ok(first(gun,[.015,3,z],[0,-1,0],'y')<top-.01,`${label} seam is not a wide MRS housing`);
  }
  for(const z of[3.05,3.88,5.45,6.10])assert.ok(first(gun,[.005,3,z],[0,-1,0],'y')<1.92,`${label} real axial seam gap@${z}`);
  assert.equal(new T.Raycaster(new T.Vector3(-.2,1.945,6.10),new T.Vector3(1,0,0),0,.4).intersectObject(gun,true).length,0,`${label} removed false near-muzzle MRS box is genuine source air`);
}
for(const quality of['high','low']){
  const tank=createTank('t90a_x',null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false});
  try{
    tank.root.updateMatrixWorld(true);
    const recoil=tank.root.getObjectByName('rig_recoil'),gun=recoil.getObjectByName('gun');
    sourceSections(gun,quality);seamsAndAir(gun,quality);
    const before=new T.Vector3(0,0,4.7).applyMatrix4(gun.matrixWorld);
    recoil.position.z=-.20;tank.root.updateMatrixWorld(true);
    near(new T.Vector3(0,0,4.7).applyMatrix4(gun.matrixWorld).z-before.z,-.20,1e-8,`${quality} real recoil ownership`);
    recoil.position.z=0;tank.root.updateMatrixWorld(true);
    const mouth=tank.root.getObjectByName('muzzleBoreShadowFallbackDisc');
    assert.ok(mouth.visible&&mouth.userData.cannonBorePrimaryPart,`${quality} real visible bore remains`);
    // The unchanged low-LOD policy omits the separate toroidal rim.
    if(quality==='high'){
      const rim=tank.root.getObjectByName('muzzleBoreShadowFallbackRim'),bounds=new T.Box3().setFromObject(rim);
      assert.ok(rim.visible&&rim.userData.cannonBorePrimaryPart,'real visible muzzle rim remains');
      near(bounds.max.z,6.2641814,.004,'physical muzzle endpoint');
      near((bounds.max.x-bounds.min.x)/2,.0866358,.006,'source-sized visible muzzle lip');
    }
  }finally{tank.dispose();}
}
console.log('t90AXGun: measured A-only taper, evacuated jacket, four narrow seam spans, genuine MRS air and actual recoil/lip pass high+low');
