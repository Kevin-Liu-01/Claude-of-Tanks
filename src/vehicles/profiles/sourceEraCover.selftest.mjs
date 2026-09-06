import assert from 'node:assert/strict';
import * as THREE from 'three';
import { partitionEraCover } from './sourceEraCover.ts';
import { sectionSolid } from './sectionSolid.ts';

const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const shape=sectionSolid([
  {z:-2,ring:[[-2,0],[2,0],[2,1.8],[-2,1.8]]},
  {z:0,ring:[[-2,0],[2,0],[2,1.5],[-2,1.5]]},
  {z:2,ring:[[-2,0],[2,0],[2,.8],[-2,.8]]},
]);
const mask=[[-.8,-1.4],[.9,-1.2],[.6,1.5],[-.7,1.3]];
const {backing,cover}=partitionEraCover(shape,mask,.018);
assert.ok(cover,'actual source-plan cover was extracted');
const original=new THREE.Mesh(shape,material),base=new THREE.Mesh(backing,material),cap=new THREE.Mesh(cover,material);
for(const mesh of [original,base,cap])mesh.updateMatrixWorld(true);
function cast(meshes,x,z,from=4,dir=-1){
  return new THREE.Raycaster(new THREE.Vector3(x,from,z),new THREE.Vector3(0,dir,0),0,8)
    .intersectObjects(meshes,false)[0];
}
let sampled=0,covered=0;
for(let x=-1.93;x<2;x+=.079)for(let z=-1.91;z<2;z+=.083){
  const before=cast([original],x,z),after=cast([base,cap],x,z);
  assert.ok(before&&after,'unspent skin has no sampling holes');
  assert.ok(before.point.distanceTo(after.point)<.000002,'unspent outer planes remain invariant');
  assert.ok(before.face.normal.dot(after.face.normal)>1-.000001,'unspent source normals stay unchanged');
  const permanent=cast([base],x,z),bottom=cast([base],x,z,-1,1);
  assert.ok(permanent&&bottom&&permanent.point.y-bottom.point.y>.7,'spent layer retains closed thick backing');
  const layer=cast([cap],x,z);
  if(layer){assert.ok(Math.abs(before.point.y-permanent.point.y-.018)<.000002,'only concealed cover depth is removed');covered++;}
  sampled++;
}
function volume(g){const p=g.attributes.position;let sum=0;for(let i=0;i<p.count;i+=3){
  const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
  sum+=a.dot(b.cross(c))/6;
}return sum;}
assert.ok(covered>400,'dense rays actually exercise the bounded patch');
assert.ok(volume(backing)>0&&volume(cover)>0,'both closed solids retain positive winding');
assert.ok(Math.abs(volume(backing)+volume(cover)-volume(shape))<.000005,'closed partition conserves original occupied volume');
assert.ok(backing.attributes.uv&&cover.attributes.uv,'both merged meshes retain UV attributes');
for(const g of [shape,backing,cover])g.dispose();material.dispose();
console.log(`sourceEraCover: ${sampled} exact exterior rays, ${covered} physical cover/backing rays and closed-volume conservation pass`);
