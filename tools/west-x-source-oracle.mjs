// Local-only comparison oracle preparation. No output is a playable asset.
// Usage: node tools/west-x-source-oracle.mjs <mk4|mk3d|k2|kf51> <unpacked-input>
// The dated owner exception/provenance findings live in the source packet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
globalThis.createImageBitmap = async () => ({width:1,height:1,close(){}});
globalThis.self=globalThis;
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(b => { this.result=b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(b => {this.result='data:application/octet-stream;base64,'+Buffer.from(b).toString('base64');this.onloadend?.();}); }
};
const id=process.argv[2],file=process.argv[3];
const ids={mk4:'merkava4_x',mk3d:'merkava3d_x',k2:'k2_x',kf51:'kf51_x'};
if(!Object.hasOwn(ids,id)||!file)throw new Error('Expected candidate key and unpacked local FBX, OBJ or GLB input');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cot-west-x-oracle-'));
const repo=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(repo,'public/models/community-candidates');
const target=path.join(output,ids[id]+'_source.glb');
// Refuse to create a source asset unless Git confirms its quarantine rule.
execFileSync('git',['check-ignore','--no-index',target],{cwd:repo,stdio:'pipe'});
const b=fs.readFileSync(file),ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
let scene;
if(id==='k2') scene=(await new GLTFLoader().parseAsync(ab,'')).scene;
else if(id==='mk3d') scene=new OBJLoader().parse(b.toString());
else scene=new FBXLoader().parse(ab,'');
if(id==='kf51') for(const name of ['KF51_Turret_Msh','Gun_Msh']) { const o=scene.getObjectByName(name);o.position.set(0,0,0);o.quaternion.identity();o.scale.set(1,1,1); }
scene.updateMatrixWorld(true);
const report={id,rawBounds:new THREE.Box3().setFromObject(scene),meshes:[]};
const islandMaps=new Map();
const v=new THREE.Vector3();
scene.traverse(o=>{if(!o.isMesh)return;
  const pos=o.geometry.attributes.position,ix=o.geometry.index;
  const count=ix?.count??pos.count,parent=new Int32Array(pos.count);for(let i=0;i<parent.length;i++)parent[i]=i;
  const find=a=>{let r=a;while(parent[r]!==r)r=parent[r];while(parent[a]!==a){let n=parent[a];parent[a]=r;a=n;}return r;};
  const unite=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  const map=new Map();
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);const key=v.toArray().map(n=>Math.round(n*1e5)).join(',');if(map.has(key))unite(i,map.get(key));else map.set(key,i);}
  for(let i=0;i<count;i+=3){const a=ix?ix.getX(i):i;unite(a,ix?ix.getX(i+1):i+1);unite(a,ix?ix.getX(i+2):i+2);}
  const comps=new Map();for(let i=0;i<pos.count;i++){const key=find(i);let c=comps.get(key);if(!c){c={n:0,box:new THREE.Box3()};comps.set(key,c);}c.n++;v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);c.box.expandByPoint(v);}
  const rows=[...comps.values()].sort((a,b)=>b.n-a.n).map(c=>({vertices:c.n,min:c.box.min.toArray(),max:c.box.max.toArray(),size:c.box.getSize(new THREE.Vector3()).toArray(),center:c.box.getCenter(new THREE.Vector3()).toArray()}));
  report.meshes.push({name:o.name,triangles:count/3,components:rows});
  islandMaps.set(o,{find,comps});
});
fs.writeFileSync(dir+'/'+id+'-inventory.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({id,bounds:report.rawBounds,meshes:report.meshes.map(m=>({name:m.name,triangles:m.triangles,islands:m.components.length,largest:m.components.slice(0,1)}))},null,2));
const normalized=new THREE.Group();
const material=new THREE.MeshStandardMaterial({color:0x798167,roughness:.8,metalness:.1});
scene.traverse(o=>{if(o.isMesh){const g=o.geometry.clone().applyMatrix4(o.matrixWorld);for(const name of Object.keys(g.attributes))if(name!=='position')g.deleteAttribute(name);g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.name=o.name;normalized.add(mesh);}});
// Neutral, grounded render-only oracle: authoring coordinates are retained in
// the inventory. Uniform scale/rig normalization is selected after inspection.
const bytes=await new GLTFExporter().parseAsync(normalized,{binary:true});
fs.writeFileSync(dir+'/'+id+'-neutral-raw.glb',Buffer.from(bytes));

function isMk4FrontHullWhip(bb,size) {
  return bb.min.z>2.6&&bb.min.y<2.0
    &&Math.min(Math.abs(bb.min.x),Math.abs(bb.max.x))>2
    &&size.x<.22&&size.z<.22&&size.y>.18;
}

function isMk4LowChainLink(component,size) {
  const bb=component.box;
  return (component.n===288||component.n===180||component.n===36)
    &&size.y<.081&&bb.min.y>2.015&&bb.max.z< -2;
}

function isMk4TurretIsland(component) {
  const bb=component.box,size=bb.getSize(new THREE.Vector3());
  if(isMk4FrontHullWhip(bb,size))return false;
  return bb.max.y>2.25||isMk4LowChainLink(component,size)
    ||(bb.max.z< -3.3&&bb.max.x<.2&&bb.min.y>2.015);
}

function canonicalVertex(point,key,mesh,index,mk4Scale) {
  if(key==='kf51')point.applyAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2)
    .sub(new THREE.Vector3(0,.1375615597,4.5264759064)).multiplyScalar(7.70/77.9067192078);
  if(key==='k2')point.add(new THREE.Vector3(0,.0045,-.13185));
  if(key==='mk3d')point.add(new THREE.Vector3(0,.02034,.2258175));
  if(key==='mk4'){
    const {find,comps}=islandMaps.get(mesh);
    if(isMk4TurretIsland(comps.get(find(index))))point.sub(new THREE.Vector3(0,0,-1.03))
      .applyAxisAngle(new THREE.Vector3(0,1,0),-25*Math.PI/180).add(new THREE.Vector3(0,0,-1.03));
    point.add(new THREE.Vector3(0,-.0073919296,.5225)).multiplyScalar(mk4Scale);
  }
}

function canonicalMeshOrigin(mesh,key) {
  if(key==='kf51'&&mesh.name==='KF51_Turret_Msh')mesh.position.set(0,1.4596,.5185);
  if(key==='kf51'&&mesh.name==='Gun_Msh')mesh.position.set(0,1.85491175,1.3478);
}

{
  const canonical=new THREE.Group();
  const mk4Scale=7.60/(4.415-(-5.460));
  scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld);
    for(const name of Object.keys(g.attributes))if(name!=='position')g.deleteAttribute(name);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i);
      canonicalVertex(v,id,o,i,mk4Scale);
      p.setXYZ(i,v.x,v.y,v.z);
    }
    const m=new THREE.Mesh(g,material);m.name=o.name;
    canonicalMeshOrigin(m,id);
    g.translate(-m.position.x,-m.position.y,-m.position.z);
    g.computeVertexNormals();g.computeBoundingBox();canonical.add(m);
  });
  fs.mkdirSync(output,{recursive:true});
  const data=await new GLTFExporter().parseAsync(canonical,{binary:true});
  fs.writeFileSync(target,Buffer.from(data));
  console.log('CANONICAL',ids[id],new THREE.Box3().setFromObject(canonical));
  console.log('Ignored oracle:',target,'\nExternal inventory/study:',dir);
}
