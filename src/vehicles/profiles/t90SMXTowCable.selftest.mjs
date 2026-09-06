import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addT90SMTowCable } from './t90SMXTowCable.ts';

function meshes(root) {
  const found=[];root.traverse(o=>{if(o.isMesh)found.push(o);});return found;
}

function ray(root,origin,direction,far=2) {
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far)
    .intersectObject(root,true).find(hit=>{
      for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow/.test(hit.object.name);
    });
}

function section(mesh,z) {
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  const result=new THREE.Box3();
  for(let i=0;i<(index?.count??p.count);i+=3) {
    const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
    for(let j=0;j<3;j++) {
      const a=points[j],b=points[(j+1)%3];
      if(Math.abs(a.z-b.z)<1e-8||z<Math.min(a.z,b.z)||z>Math.max(a.z,b.z))continue;
      result.expandByPoint(a.clone().lerp(b,(z-a.z)/(b.z-a.z)));
    }
  }
  return result;
}

function near(value,target,tolerance,label) {
  assert.ok(Number.isFinite(value)&&Math.abs(value-target)<=tolerance,
    `${label}: ${value} versus independent source ${target} ± ${tolerance}`);
}

function inside(mesh,point,label) {
  assert.ok(ray(mesh,point,[0,0,1],.12)&&ray(mesh,point,[0,0,-1],.12),label);
}

for(const quality of ['high','low']) {
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  const helper=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  addT90SMTowCable({addEquipment(bucket,geometry,x=0,y=0,z=0){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=bucket;mesh.position.set(x,y,z);helper.add(mesh);
  }});
  helper.updateMatrixWorld(true);
  try {
    tank.root.updateMatrixWorld(true);
    const parts=meshes(helper),cable=parts.find(m=>m.geometry.userData.sourceRecoveryPart==='cable');
    assert.ok(cable,`${quality}: one physical source-sized continuous cable`);
    // Held-out Z planes between the independently authored curve stations.
    for(const [z,minX,minY,maxX,maxY]of [
      [-3.625,-1.01509,.91249,-.98115,1.06924],
      [-3.575,-1.00784,.83586,-.94992,1.16467],
      [-3.525,-.99058,.78732,-.91385,1.24591],
    ]) {
      const b=section(cable,z);
      near(b.min.x,minX,.009,`${quality}: cable left at ${z}`);
      near(b.max.x,maxX,.009,`${quality}: cable right at ${z}`);
      near(b.min.y,minY,.012,`${quality}: cable low at ${z}`);
      near(b.max.y,maxY,.012,`${quality}: cable high at ${z}`);
    }
    for(const [x,y,z]of [[-.73,.88,-3.4089778],[-.69,.93,-3.3970557],
      [-.58,.86,-3.3973175],[-.63,.96,-3.3993757],
      [-.64,1.03,-3.3834939],[-.64,.95,-3.3984954],
      [1.41,1.43,-3.4298064],[1.59,1.42,-3.4303404]]) {
      near(ray(tank.root,[x,y,-4.2],[0,0,1])?.point.z,z,.006,
        `${quality}: measured eye/hanger front ${x}/${y}`);
    }
    const leftEye=parts.find(m=>m.geometry.userData.sourceRecoveryPart==='left-eye');
    // Here the source hanger correctly sits 13 mm ahead of the eye. Check
    // the eye separately as well as the complete-model first surface above.
    near(ray(leftEye,[-.63,.96,-4.2],[0,0,1])?.point.z,-3.3864241,.006,
      `${quality}: source eye face behind the independently checked hanger`);
    const leftAir=ray(tank.root,[-.69,.847,-3.46],[0,0,1]);
    assert.ok(leftAir?.point.z> -3.20,`${quality}: left eye is open to the rear hull, never a solid disk`);
    const rightAir=ray(tank.root,[1.50,1.42,-3.46],[0,0,1]);
    near(rightAir?.point.z,-3.301877,.006,`${quality}: right eye air reaches its separate source backing`);
    const hanger=parts.find(m=>m.geometry.userData.sourceRecoveryPart==='left-hanger');
    assert.equal(ray(hanger,[-.64,.965,-3.352],[0,0,1],.018),undefined,
      `${quality}: narrow hanger keeps its actual internal opening`);
    const rightNeck=parts.find(m=>m.geometry.userData.sourceRecoveryPart==='right-neck');
    inside(leftEye,[-.792,.755,-3.415],`${quality}: cable's lower end enters the real left eye`);
    inside(rightNeck,[1.296,1.477,-3.391],`${quality}: cable's far end enters the real right neck`);
    inside(leftEye,[-.64,.96,-3.380],`${quality}: eye overlaps its narrow hanger`);
    inside(hanger,[-.64,.96,-3.380],`${quality}: hanger overlaps the eye without a backing disk`);
    const hull=tank.root.getObjectByName('hull');
    const hullJoin=ray(hull,[-.642,1.036,-3.302],[0,0,1],.04);
    assert.ok(hullJoin&&hullJoin.point.z< -3.272,
      `${quality}: hidden 8 mm seat positively overlaps actual native tub`);
    const bounds=new THREE.Box3().setFromObject(cable);
    near(bounds.min.y,.7294303,.006,`${quality}: rear cable low point`);
    near(bounds.min.z,-3.6489184,.006,`${quality}: rear cable stand-off`);
    assert.ok(bounds.max.x<1.315&&bounds.min.x> -1.02,`${quality}: cable stays inboard of running gear`);
    const actualCable=ray(tank.root,[-1.022,1.00,-3.634],[1,0,0],.05);
    near(actualCable?.point.x,-1.01,.008,`${quality}: cable is present on complete runtime model`);
  } finally {tank.dispose();for(const mesh of meshes(helper))mesh.geometry.dispose();material.dispose();}
}
console.log('t90SMXTowCable: measured continuous cable, hollow terminal eyes, folded hanger and rear backing pass high/low');
