import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90SMLeftSmokeMounts} from './t90SMXLeftSmokeMounts.ts';

const source=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90sm_x.smoke-source.json',import.meta.url),'utf8'));
function near(value,target,tolerance,label) {
  assert.ok(Number.isFinite(value)&&Math.abs(value-target)<=tolerance,`${label}: ${value} versus source ${target} ± ${tolerance}`);
}
function helperGeometry() {
  const root=new THREE.Group(),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});root.position.set(.008,1.532,.359);
  addT90SMLeftSmokeMounts({addEquipment(bucket,geometry,x,y,z){
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);root.add(m);
  }});root.updateMatrixWorld(true);return {root,material};
}
function intervals(mesh,point,axis) {
  return new THREE.Raycaster(point.clone().addScaledVector(axis,.04),axis.clone().negate(),0,.16)
    .intersectObject(mesh,true).map(hit=>hit.distance-.04).sort((a,b)=>a-b);
}
function section(mesh,x) {
  const p=mesh.geometry.attributes.position,bounds=new THREE.Box3();
  for(let i=0;i<p.count;i+=3) {
    const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j).applyMatrix4(mesh.matrixWorld));
    for(let j=0;j<3;j++) {
      const a=points[j],b=points[(j+1)%3];
      if(Math.abs(a.x-b.x)<1e-8||x<Math.min(a.x,b.x)||x>Math.max(a.x,b.x))continue;
      bounds.expandByPoint(a.clone().lerp(b,(x-a.x)/(b.x-a.x)));
    }
  }return bounds;
}
function actualSurfaces(root,material) {
  const group=new THREE.Group();
  root.traverse(mesh=>{
    if(!mesh.isMesh||/shadow/.test(mesh.name))return;
    for(let o=mesh;o;o=o.parent)if(!o.visible)return;
    const copy=new THREE.Mesh(mesh.geometry,material);copy.name=mesh.name;
    copy.matrix.copy(mesh.matrixWorld);copy.matrixAutoUpdate=false;group.add(copy);
  });group.updateMatrixWorld(true);return group;
}
function integratedGeometry(actual,helper,label) {
  const positions=new Map(),cell=p=>p.toArray().map(v=>Math.floor(v*100));
  actual.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name!=='turretDetail')return;
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),key=cell(point).join(',');
      if(!positions.has(key))positions.set(key,[]);positions.get(key).push(point);
    }
  });
  const present=point=>{
    const [x,y,z]=cell(point);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++) {
      if(positions.get([x+dx,y+dy,z+dz].join(','))?.some(p=>p.distanceToSquared(point)<4e-12))return true;
    }return false;
  };
  for(const mesh of helper.children) {
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(present(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld)),
      `${label}: every ${mesh.geometry.userData.leftSmokeMount} vertex is present within2µm on the actual visible turretDetail owner`);
  }
}
function carrierCaseContact(actual,carrier,label) {
  const point=new THREE.Vector3(-1.44,2.070,-.067);
  for(const sign of [-1,1]) {
    const ray=new THREE.Raycaster(point,new THREE.Vector3(0,sign,0),0,.30);
    const local=ray.intersectObject(carrier)[0];
    assert.ok(local&&local.distance<.014,`${label}: common seating point is inside actual closed carrier wall`);
    const sourceBoundary=sign>0?2.157067:1.813437;
    assert.ok(ray.intersectObject(actual,true).some(hit=>Math.abs(hit.point.y-sourceBoundary)<.004),
      `${label}: same carrier point lies between the actual canted case roof and bottom, not beside a floating proxy`);
  }
}
for(const quality of ['high','low']) {
  const tank=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  const helper=helperGeometry();
  try {
    tank.root.updateMatrixWorld(true);
    // Read-only double-sided views of the actual built buffers make inside/
    // outside witnesses independent of renderer back-face culling. No source
    // or substitute geometry is added, and factory materials are untouched.
    const actual=actualSurfaces(tank.root,helper.material);
    integratedGeometry(actual,helper.root,quality);
    const parts=Object.fromEntries(helper.root.children.map(m=>[m.geometry.userData.leftSmokeMount,m]));
    assert.equal(helper.root.children.length,8,'three measured backing plates, three folded carriers and two actual lower ties');
    for(const [i,row]of source.measurements.slice(0,6).entries()) {
      const bank=i<3?0:i<5?1:2,back=new THREE.Vector3(...row.back),axis=new THREE.Vector3(...row.axis);
      const occupied=intervals(parts[`backing-${bank}`],back,axis);
      assert.ok(occupied[0]<-.001&&occupied.at(-1)>.003,
        `${quality}: source stock ${row.island} rear center is inside its actual backing plate`);
      const floor=back.clone().addScaledVector(axis,row.length-row.floorDepth);
      assert.equal(new THREE.Raycaster(floor.clone().addScaledVector(axis,.01),axis,0,.14)
        .intersectObject(helper.root,true).length,0,`${quality}: mounts never intrude into stock ${row.island}'s cavity`);
    }
    // Intermediate X witnesses are independent of the authored profile stations.
    for(const [bank,x,low,high]of [[0,-1.30,2.203493,2.295765],[0,-1.21,2.210131,2.301675],
      [1,-1.30,2.143108,2.246726],[1,-1.20,2.145663,2.247798],
      [2,-1.35,2.062744,2.165578],[2,-1.30,2.063980,2.166058]]) {
      const b=section(parts[`backing-${bank}`],x);
      near(b.min.y,low,.004,`${quality}: bank${bank} lower edge atX${x}`);
      near(b.max.y,high,.004,`${quality}: bank${bank} upper edge atX${x}`);
    }
    const m=source.measurements[1],axis=new THREE.Vector3(...m.axis);
    const air=new THREE.Vector3(...m.back).addScaledVector(axis,-.016);
    for(const sign of [-1,1])assert.equal(new THREE.Raycaster(air,new THREE.Vector3(0,sign,0),0,.008)
      .intersectObject(helper.root,true).length,0,`${quality}: actual upper-bank center stand-off air remains between plate and carrier`);
    const heldOrigin=new THREE.Vector3(-1.23113109,2.25189474,-.33902155);
    const held=new THREE.Raycaster(heldOrigin,new THREE.Vector3(0,-1,0),0,.05)
      .intersectObject(tank.root,true).find(hit=>{
        for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;
      });
    near(held?.point.y,2.226325158,.004,`${quality}: held-out complete-model source carrier first surface`);
    const carrier2=new THREE.Box3().setFromObject(parts['carrier-2']);
    assert.ok(carrier2.min.y<2.05&&carrier2.min.x< -1.44,
      `${quality}: lower physical carrier reaches actual left case/outer shelf seating region`);
    carrierCaseContact(actual,parts['carrier-2'],quality);
  } finally {
    tank.dispose();helper.root.traverse(m=>{if(m.isMesh)m.geometry.dispose();});helper.material.dispose();
  }
}
console.log('t90SMXLeftSmokeMounts: six measured rear-stock engagements, held-out backing heights and real stand-off air pass high/low');
