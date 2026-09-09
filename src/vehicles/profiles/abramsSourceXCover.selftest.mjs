import assert from 'node:assert/strict';
import * as THREE from 'three';
import { partitionEraCover } from './abramsSourceXCover.ts';
import { partitionEraCover as legacyPartition } from './sourceEraCover.ts';
import { sectionSolid } from './sectionSolid.ts';
import { authoredEraSurfaces } from '../eraAuthoredFaces.ts';

const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const shape=sectionSolid([
  {z:-2,ring:[[-2,0],[2,0],[2,1.8],[-2,1.8]]},
  {z:0,ring:[[-2,0],[2,0],[2,1.5],[-2,1.5]]},
  {z:2,ring:[[-2,0],[2,0],[2,.8],[-2,.8]]},
]);
const mask=[[-.8,-1.4],[.9,-1.2],[.6,1.5],[-.7,1.3]];
const {backing,cover}=partitionEraCover(shape,mask,.018);
assert.ok(cover,'actual source-plan cover was extracted');
function exactClosed(g){
  const p=g.attributes.position,edges=new Map();
  for(let i=0;i<p.count;i+=3){
    const vertices=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)].join(','));
    for(let j=0;j<3;j++){
      const a=vertices[j],b=vertices[(j+1)%3],key=[a,b].sort().join('/');
      const entry=edges.get(key)||{count:0,balance:0};entry.count++;entry.balance+=a<b?1:-1;edges.set(key,entry);
    }
  }
  for(const [edge,value]of edges)assert.deepEqual(value,{count:2,balance:0},`exact native closed edge, no tolerance weld: ${edge}`);
}
exactClosed(backing);exactClosed(cover);
// Tiny, remote original faces are not failed clipping slivers. A partition
// nowhere near them must preserve their complete native triangle sequence.
const tiny=new THREE.BoxGeometry(.00001,.00001,.0000001).toNonIndexed();
const remote=partitionEraCover(tiny,[[2,2],[3,2],[3,3],[2,3]],.002);
assert.equal(remote.cover,null);
assert.deepEqual(remote.backing.attributes.position.array,tiny.attributes.position.array);
exactClosed(remote.backing);remote.backing.dispose();tiny.dispose();
// Two real-style banks share their z planes but not their footprint. The
// second call must preserve the first call's rounded cut, not peel a new
// sub-ULP strip from the same native boundary.
const successive=shape.clone().translate(0,0,2);
let remaining=successive.clone();
for(const [near,far]of[[-1.06,-.12],[.12,1.06]]){
  const next=partitionEraCover(remaining,[[near,2.64],[far,2.64],[far,3.46],[near,3.46]],.012);
  assert.ok(next.cover);exactClosed(next.backing);exactClosed(next.cover);
  remaining.dispose();next.cover.dispose();remaining=next.backing;
}
remaining.dispose();successive.dispose();
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
// A footprint just inside an existing vertex creates a double-precision
// sliver smaller than Float32's ULP. It must not become an authored zero-area
// combat triangle after the geometry is stored or transformed.
const quantized=partitionEraCover(shape,[[Math.fround(-2)+1e-8,-1.9],[1.8,-1.9],[1.8,1.9],[Math.fround(-2)+1e-8,1.9]],.002);
const rejected=legacyPartition(shape,mask,.018);
assert.throws(()=>exactClosed(rejected.backing), /exact native closed edge/,
  'retained current-main independent cuts do not preserve the shared boundary');
rejected.backing.dispose();rejected.cover.dispose();
assert.ok(quantized.cover);
assert.doesNotThrow(()=>authoredEraSurfaces(quantized.cover),'Float32-clipped ERA faces remain nondegenerate');
for(const g of [quantized.backing,quantized.cover])g.dispose();
for(const g of [shape,backing,cover])g.dispose();material.dispose();
console.log(`sourceEraCover: ${sampled} exact exterior rays, ${covered} physical cover/backing rays and closed-volume conservation pass`);
