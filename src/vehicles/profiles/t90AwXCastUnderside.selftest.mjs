import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addT90AWCastUnderside} from './t90AwXCastUnderside.ts';
import {T90_AW_X_SOURCE_DATUMS as D} from '../t90AwXArmor.ts';
const packet=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90_x.cast-underside-heldouts.json',import.meta.url),'utf8'));
const pivot=new THREE.Vector3(...D.turretPivot),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const key=p=>p.toArray().map(n=>Math.round(n*1e6)).join(',');
const triKey=ps=>ps.map(key).sort().join('|');
function closed(g){
  const a=g.attributes.position,edges=new Map();let volume=0;
  for(let i=0;i<a.count;i+=3){
    const ps=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(a,i+j));
    assert.ok(ps.every(p=>p.toArray().every(Number.isFinite)));
    assert.ok(ps[1].clone().sub(ps[0]).cross(ps[2].clone().sub(ps[0])).lengthSq()>1e-18,'no collapsed triangles');
    volume+=ps[0].dot(ps[1].clone().cross(ps[2]))/6;
    for(let j=0;j<3;j++){
      const from=key(ps[j]),to=key(ps[(j+1)%3]),edge=[from,to].sort().join('|');
      const row=edges.get(edge)??[0,0];row[0]++;row[1]+=from<to?1:-1;edges.set(edge,row);
    }
  }
  assert.ok([...edges.values()].every(([count,direction])=>count===2&&direction===0),'closed, consistently outward edge winding');
  assert.ok(volume>0,'positive outward volume');return volume;
}
function helper(){
  const meshes=[];
  addT90AWCastUnderside({add(slot,g){assert.equal(slot,'turret');closed(g);g.translate(...D.turretPivot);
    const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();meshes.push(m);}});
  assert.equal(meshes.length,3,'main casting, actual annulus and recessed floor');return meshes;
}
function ray(ms,origin,direction,far=2){return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,far).intersectObjects(ms,false)[0];}
function inside(m,p){
  const hs=new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(.371,.791,.486).normalize(),0,10).intersectObject(m,false);
  return hs.filter((h,i)=>!i||Math.abs(h.distance-hs[i-1].distance)>.000002).length%2===1;
}
function sourceRays(ms,label){
  for(const r of packet.bottom){
    const h=ray(ms,[r.x,1,r.z],[0,1,0]);
    assert.ok(h&&Math.abs(h.point.y-r.y)<.006,`${label} source bottom ${r.x}/${r.z}: ${h?.point.y} vs ${r.y}`);
    if(Math.abs(r.normal[1])>.99)assert.ok(h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(new THREE.Vector3(...r.normal))>.99,'source-facing lower stock normal');
  }
  for(const r of packet.aperture){const h=ray(ms,r.origin,r.direction,1);
    assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<.001,'actual polygonal bearing cavity remains open to its source wall');}
  assert.equal(ray(ms,[0,1.45,0],[0,1,0],.05),undefined,'central low bearing height is genuine air, not a slab');
}
const upper=[
  [-1.2408,.02,.02,1.74,1.67],[-1.2,.2422,.2393,2.03097,1.79],[-1,.5939,.5917,2.13694,1.88],
  [-.8,.8211,.8183,2.18385,1.87],[-.6,.9876,.9880,2.23083,1.84],[-.4,1.1150,1.1131,2.27398,1.82],
  [-.2,1.2116,1.2219,2.27398,1.77],[0,1.3109,1.3173,2.27398,1.72],[.2,1.3829,1.3817,2.23361,1.695],
  [.4,1.4057,1.40365,2.18879,1.68],[.6,1.3809,1.3744,2.16066,1.665],[.8,1.3064,1.3043,2.10394,1.64],
  [1,1.1985,1.1964,2.04946,1.625],[1.2,1.0364,1.0396,1.99417,1.68],[1.4,.6689,.6585,1.78358,1.63],[1.4301,.12,.12,1.62,1.57],
];
function unchangedUpper(g){
  const p=g.attributes.position,actual=new Set();
  for(let k=0;k<p.count;k+=3)actual.add(triKey([0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(p,k+i))));
  const rings=upper.map(([z,l,r,top,shoulder])=>{
    const pts=[[r,shoulder]];for(let i=1;i<12;i++){const a=i*Math.PI/12,x=Math.cos(a);pts.push([x*(x>=0?r:l),shoulder+(top-shoulder)*Math.sin(a)**.56]);}pts.push([-l,shoulder]);
    // Same Float32 local-to-world sequence as the native authored geometry.
    return pts.map(([x,y])=>new THREE.Vector3(...[x,y,z].map((v,i)=>Math.fround(Math.fround(v-D.turretPivot[i])+D.turretPivot[i]))));
  });
  let count=0;for(let s=0;s<rings.length-1;s++)for(let i=0;i<12;i++){
    for(const triangle of[[rings[s][i],rings[s][i+1],rings[s+1][i+1]],[rings[s][i],rings[s+1][i+1],rings[s+1][i]]]){
      assert.ok(actual.has(triKey(triangle)),'every original upper casting triangle is unchanged');count++;}}
  assert.equal(count,360);
}
const own=helper();
try{
  assert.equal(packet.bottom.length,75);assert.equal(packet.aperture.length,16);
  unchangedUpper(own[0].geometry);sourceRays(own,'helper');
  const ringVolume=closed(own[1].geometry);assert.ok(ringVolume>.097&&ringVolume<.100,'annular volume excludes its actual central aperture');
  for(const quality of['high','low']){
    const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
    try{
      t.root.updateMatrixWorld(true);const original=t.root.getObjectByName('turret');assert.ok(original?.isMesh);
      const proxy=new THREE.Mesh(original.geometry,mat);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(original.matrixWorld);
      sourceRays([proxy],quality);
      const shared=[.98,1.538,.116],hull=t.root.getObjectByName('hull'),hullProxy=new THREE.Mesh(hull.geometry,mat);
      hullProxy.matrixAutoUpdate=false;hullProxy.matrixWorld.copy(hull.matrixWorld);
      assert.ok(inside(proxy,shared)&&inside(hullProxy,shared),'actual permanent hull bearing and turret stock overlap without an invented support');
      const surface=new THREE.Vector3().fromBufferAttribute(original.geometry.attributes.position,0).applyMatrix4(original.matrixWorld);
      assert.ok(surface.toArray().every(Number.isFinite));
      const yaw=.41,rig=t.root.getObjectByName('rig_turret');rig.rotation.y=yaw;t.root.updateMatrixWorld(true);proxy.matrixWorld.copy(original.matrixWorld);
      for(const r of packet.bottom.filter((_,i)=>i%8===0)){
        const p=new THREE.Vector3(r.x,1,r.z).sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(pivot);
        const expected=new THREE.Vector3(r.x,r.y,r.z).sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(pivot);
        const h=ray([proxy],p.toArray(),[0,1,0]);assert.ok(h&&h.point.distanceTo(expected)<.006,'lower casting and bearing follow actual turret yaw');
      }
    }finally{t.dispose();}
  }
}finally{for(const m of own)m.geometry.dispose();mat.dispose();}
console.log('t90AwXCastUnderside:75 source floors+16 aperture rays high/low, closed outward annulus, 360 unchanged upper triangles, real fixed-ring contact and yaw pass');
