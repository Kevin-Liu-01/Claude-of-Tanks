import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90AWAAContainers} from './t90AwXAAContainers.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
const packet=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90_x.aa-containers-heldouts.json',import.meta.url),'utf8'));
function hit(ms,p,d,far=2){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function inside(m,p){return hit([m],p,[0,1,0],.5)&&hit([m],p,[0,-1,0],.5);}
function localPoint(p,yaw){return new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).toArray();}
function helper(){
  const ms=[],mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),pivot=T90_AW_X_SOURCE_DATUMS.turretPivot;
  addT90AWAAContainers({addEquipment(_b,g,x=0,y=0,z=0){g.translate(x+pivot[0],y+pivot[1],z+pivot[2]);const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();ms.push(m);}});
  for(const r of packet.rays){const h=hit(ms,r.origin,r.direction);assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<.006,'isolated actual source container face');}
  const p=localPoint([-.8,2.530,.56],-.41816);
  assert.ok(ms.filter(m=>inside(m,p)).length>=2,'forward canister positively overlaps its actual receiving channel');
  const air=localPoint([-.62,2.72,-.565],.78522);
  assert.equal(hit(ms,air,localPoint([0,0,1],.78522),.035),undefined,'narrow canister retains central air below forward overhang');
  for(const m of ms)m.geometry.dispose();mat.dispose();
}
helper();assert.equal(packet.rays.length,24);
for(const quality of ['high','low']){
  const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const ms=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)ms.push(m);});
    for(const r of packet.rays){const h=hit(ms,r.origin,r.direction);assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<.006,`${quality} whole-source ${r.label}: ${h?.point.toArray()} vs ${r.point}`);
      if(r.label==='forward roof')assert.ok(h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(new THREE.Vector3(...r.normal))>.99999,'true shallow source roof crossfall');
    }
    for(const z of[-.4,-.38,.4,.42])assert.equal(hit(ms,[-.95,3,z],[0,-1,0],.40),undefined,'former rotated-AABB corner is actual source air');
    const turret=t.root.getObjectByName('rig_turret'),before=hit(ms,packet.rays[4].origin,packet.rays[4].direction).point.clone();
    turret.rotation.y=.37;t.root.updateMatrixWorld(true);
    const pivot=new THREE.Vector3(...T90_AW_X_SOURCE_DATUMS.turretPivot),origin=new THREE.Vector3(...packet.rays[4].origin).sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),.37).add(pivot),direction=new THREE.Vector3(...packet.rays[4].direction).applyAxisAngle(new THREE.Vector3(0,1,0),.37),after=hit(ms,origin.toArray(),direction.toArray());
    assert.ok(after&&after.point.distanceTo(before.sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),.37).add(pivot))<.00001,'source canister follows actual yaw owner');
  }finally{t.dispose();}
}
console.log('t90AwXAAContainers: actual high/low source faces, crossfall, removed false corners, open return, receiving contact and yaw pass');
