import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b} ±${t}`);
function visible(root){const meshes=[];root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)meshes.push(m);});return meshes;}
function stockAndReceiver(meshes){
  for(const[z,y]of [[-2.185,2.6085741621],[-2.15,2.6037455071],[-2.05,2.5990075655],
    [-1.85,2.5988733041],[-1.6,2.5987055653],[-1.4,2.6125432653],[-1.25,2.6309506003],
    [-1.15,2.6521005630],[-1.1,2.6520911926],[-1,2.6520220381],[-.92,2.6519605938]]){
    const h=new THREE.Raycaster(new THREE.Vector3(-.6155,3,z),new THREE.Vector3(0,-1,0),0,1).intersectObjects(meshes,false)[0];
    near(h?.point.y,y,.002,'source stepped receiver and circular-area corrected thin stock');
    assert.ok(h.face.normal.y>.5,'stock outer surface is outward wound, not a ray hitting the bore or far underside');
  }
  for(const[z,y0,y1]of [[-1.8,2.5268851481,2.5314790748],[-1.75,2.5268556387,2.5314397369],
    [-1.6,2.5267671107,2.5313329733],[-1.5,2.5267080920,2.5312739547],[-1.42,2.5266608771,2.5312267397]]){
    for(const[x,y]of [[-.6155,y0],[-.6105,y1]]){
      const h=new THREE.Raycaster(new THREE.Vector3(x,2.4,z),new THREE.Vector3(0,1,0),0,.3).intersectObjects(meshes,false)[0];
      near(h?.point.y,y,.0005,'source lower diamond-section gas tube, independently from the barrel');
    }
  }
}
function boreAndAir(meshes){
  for(const r of [0,.004])for(let i=0;i<8;i++){
    const a=i*Math.PI/4,origin=new THREE.Vector3(-.6155+r*Math.cos(a),2.5855+r*Math.sin(a),-2.3);
    const h=new THREE.Raycaster(origin,new THREE.Vector3(0,0,1),0,.8).intersectObjects(meshes,false)[0];
    near(h?.point.z,-1.9668499231,.00002,'actual cylindrical12.7mm bore retains independently measured deep source-cone end');
  }
  for(const z of [-1.75,-1.6,-1.5]){
    const ray=new THREE.Raycaster(new THREE.Vector3(-.645,2.561,z),new THREE.Vector3(1,0,0),0,.06);
    assert.equal(ray.intersectObjects(meshes,false).length,0,'actual open longitudinal slot between stock and lower gas tube');
  }
}
function ownerAndContact(tank){
  const mesh=tank.root.getObjectByName('sourceMachineGun_turretDark'),group=mesh.parent,yaw=tank.root.getObjectByName('rig_turret');
  assert.equal(group.parent,yaw);assert.deepEqual(group.userData.barrelAxisLocal,[0,0,1]);
  near(new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld).z,-1,.000001,'declared AA firing axis remains actual aft-facing axis');
  // Source side links overlap both the barrel and gas tube; pin their actual
  // visible central material rather than granting a bounds-only attachment.
  for(const x of [-.6258,-.6053]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,2.5617,-1.8),new THREE.Vector3(0,0,1),0,.3);
    const h=ray.intersectObject(mesh,false)[0];near(h?.point.z,-1.71025,.0001,'measured thin tube-to-gas link is in the visible weapon buffer');
  }
  const local=mesh.worldToLocal(new THREE.Vector3(-.6155,2.5855,-1.8)),before=local.clone().applyMatrix4(mesh.matrixWorld);
  tank.root.getObjectByName('rig_recoil').position.z=-.15;tank.root.updateMatrixWorld(true);
  near(before.distanceTo(local.clone().applyMatrix4(mesh.matrixWorld)),0,1e-9,'main cannon recoil does not drag AA fitting');
  yaw.rotation.y=.3;tank.root.updateMatrixWorld(true);
  assert.ok(before.distanceTo(local.clone().applyMatrix4(mesh.matrixWorld))>.4,'AA physical owner follows turret yaw');
}
for(const quality of ['high','low']){
  const tank=createTank('t72b3_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{tank.root.updateMatrixWorld(true);const meshes=visible(tank.root);stockAndReceiver(meshes);boreAndAir(meshes);ownerAndContact(tank);}
  finally{tank.dispose();}
}
console.log('t72b3XMachineGunBody: high/low source stock/receiver and separate gas tube, real axial air, deep12.7mm bore and actual AA owner pass');
