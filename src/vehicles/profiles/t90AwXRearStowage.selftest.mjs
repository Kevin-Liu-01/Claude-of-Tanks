import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90AWRearStowage} from './t90AwXRearStowage.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
const packet=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90_x.rear-stowage-heldouts.json',import.meta.url),'utf8'));
function hit(ms,p,d,far=2){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function inside(m,p){
  // Cast toward the real outward faces from outside; the runtime correctly
  // uses front-sided materials, so inside-out rays would miss a sound solid.
  return Boolean(hit([m],[p[0],p[1]-1,p[2]],[0,1,0],1)&&hit([m],[p[0],p[1]+1,p[2]],[0,-1,0],1));
}
function parts(){const ms=[],mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),pivot=T90_AW_X_SOURCE_DATUMS.turretPivot;
  addT90AWRearStowage({addEquipment(_b,g,x=0,y=0,z=0){g.translate(x+pivot[0],y+pivot[1],z+pivot[2]);const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();ms.push(m);}});return{ms,mat};
}
const owned=parts();
try{
  for(const x of[-.355,.355])assert.ok(owned.ms.filter(m=>inside(m,[x,1.9,-1.36])).length>=2,'central case and side wings positively overlap');
  for(const p of[[0,2.13,-1.18],[.30,1.9,-1.14],[-.30,1.9,-1.14]])assert.equal(hit(owned.ms,p,[0,0,1],.03),undefined,'real U-plan front notch remains air');
  assert.equal(hit(owned.ms,[0,1.85,-1.51],[0,0,1],.03),undefined,'real air beneath the rising aft floor');
  for(const side of[-1,1])assert.ok(owned.ms.filter(m=>inside(m,[side*.65,2.158,-1.3])).length>=2,'raised wing stock joins its lower original case');
  for(const quality of['high','low']){
    const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
    try{t.root.updateMatrixWorld(true);const ms=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)ms.push(m);});
      for(const r of packet.rays){const h=hit(ms,r.origin,r.direction,1);assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<.006,`${quality} source rear ${r.label}/${r.origin}: ${h?.point.toArray()} vs ${r.point}`);}
      for(const p of[[0,2.13,-1.18],[0,1.85,-1.51]])assert.equal(hit(ms,p,[0,0,1],.03),undefined,'complete native stowage retains source air');
      const seat=[0,1.731,-1.2406],cast=ms.find(m=>m.name==='turret');
      assert.ok(cast&&inside(cast,seat)&&owned.ms.some(m=>inside(m,seat)),'actual narrow hidden forward lap engages the unchanged rear casting');
      const r=packet.rays.find(r=>r.origin[0]===.5&&r.origin[2]===-1.4&&r.label==='floor'),before=hit(ms,r.origin,r.direction).point.clone(),pivot=new THREE.Vector3(...T90_AW_X_SOURCE_DATUMS.turretPivot),axis=new THREE.Vector3(0,1,0),angle=-.42;
      t.root.getObjectByName('rig_turret').rotation.y=angle;t.root.updateMatrixWorld(true);
      const origin=new THREE.Vector3(...r.origin).sub(pivot).applyAxisAngle(axis,angle).add(pivot),direction=new THREE.Vector3(...r.direction).applyAxisAngle(axis,angle),after=hit(ms,origin.toArray(),direction.toArray());
      assert.ok(after&&after.point.distanceTo(before.sub(pivot).applyAxisAngle(axis,angle).add(pivot))<.00001,'actual shaped stowage follows turret yaw');
    }finally{t.dispose();}
  }
}finally{for(const m of owned.ms)m.geometry.dispose();owned.mat.dispose();}
console.log('t90AwXRearStowage: actual high/low 80 source rays, sloping aft floor, notched front air, rim/lid seats and yaw pass');
