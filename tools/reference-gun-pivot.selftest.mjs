import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadReferenceGlb } from './reference-glb-loader.ts';
import {createHash} from 'node:crypto';
import {SOURCE_WORLD_FRAMES,validateSourceWorldFrame} from './source-world-registration.mjs';
if (!globalThis.ProgressEvent) globalThis.ProgressEvent=class { constructor(type, values){this.type=type;Object.assign(this,values);} };
// Synthetic tool-only scene with gun vertices authored in world coordinates
// but zero node origin, exactly the common material-fused OBJ export problem.
const points=new Float32Array([0,2,1, .3,2,2, 0,2.3,2, -1.5,0,-4, 1.5,0,4, -1.5,1.5,4]);
const encoded=Buffer.from(points.buffer).toString('base64');
const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,2]}],
  nodes:[{name:'Turret',children:[1]},{name:'Gun',mesh:0},{name:'Hull',mesh:1}],
  meshes:[{primitives:[{attributes:{POSITION:0}}]},{primitives:[{attributes:{POSITION:1}}]}],
  buffers:[{uri:`data:application/octet-stream;base64,${encoded}`,byteLength:points.byteLength}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:points.byteLength}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,2,1],max:[.3,2.3,2]},
    {bufferView:0,byteOffset:36,componentType:5126,count:3,type:'VEC3',min:[-1.5,0,-4],max:[1.5,1.5,4]}]};
const path=`data:model/gltf+json;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`;
const cfg={path,turretNode:'^Turret$',gunNode:'^Gun$',autoPivot:true,pivot:[0,1.5,.3]};
const legacy=await loadReferenceGlb({source:'glb',glb:cfg},'synthetic',null);
const corrected=await loadReferenceGlb({source:'glb',glb:{...cfg,gunPivot:[0,2,1]}},'synthetic',null);
const coordinates=root=>{
  const mesh=root.getObjectByName('Gun'),p=mesh.geometry.getAttribute('position');
  root.updateMatrixWorld(true);
  return Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray());
};
assert.deepEqual(coordinates(legacy.root),coordinates(corrected.root),'pivot correction must not move neutral source vertices');
const gun=corrected.root.getObjectByName('rig_gun');
assert.deepEqual(gun.getWorldPosition(new THREE.Vector3()).toArray(),[0,2,1]);
gun.rotation.x=.3;corrected.root.updateMatrixWorld(true);
assert.deepEqual(coordinates(corrected.root)[0],[0,2,1],'trunnion stays fixed during pitch');
assert.notDeepEqual(coordinates(corrected.root)[1],coordinates(legacy.root)[1]);
await assert.rejects(loadReferenceGlb({source:'glb',glb:{...cfg,gunPivot:[0,NaN,1]}},'synthetic',null),/finite/);
// A casemate cannon can have coincident limited-traverse and pitch axes
// without a separate rotating exterior shell. Reparent the complete gun,
// never duplicate it or misclassify the fixed hull as a turret.
const casemate=await loadReferenceGlb({source:'glb',glb:{...cfg,turretNode:'^Gun$',
  pivot:[0,2,1],gunPivot:[0,2,1]}},'synthetic',null);
assert.deepEqual(coordinates(casemate.root),coordinates(legacy.root));
assert.deepEqual(casemate.root.getObjectByName('rig_turret').getWorldPosition(new THREE.Vector3()).toArray(),[0,2,1]);
assert.equal(casemate.root.getObjectByName('Gun').parent.name,'rig_gun');
let actualGunMeshes=0;casemate.root.traverse(o=>{if(o.isMesh&&o.name==='Gun')actualGunMeshes++;});
assert.equal(actualGunMeshes,1);
assert.notEqual(casemate.root.getObjectByName('Hull').parent.name,'rig_turret');

// Actual loader regression for a pre-registered metre-space fused oracle.
// Replace only this process's certificate hash with synthetic fixture bytes;
// no source certificate or real oracle on disk is altered by this test.
const fixtureBytes=Buffer.from(JSON.stringify(gltf));
const fixturePath='/models/community-candidates/synthetic-meter-test.glb';
const certificate=SOURCE_WORLD_FRAMES.type10;
const oldHash=certificate.sha256,oldFetch=globalThis.fetch;
try {
  certificate.sha256=createHash('sha256').update(fixtureBytes).digest('hex');
  globalThis.fetch=(url,...args)=>url===fixturePath
    ? Promise.resolve(new Response(fixtureBytes)):oldFetch(url,...args);
  const fusedCfg={path:fixturePath};
  const fused=await loadReferenceGlb({source:'glb',glb:fusedCfg},'type10',{dims:{widthM:2.4}});
  assert.deepEqual(coordinates(fused.root),coordinates(legacy.root),
    'a published-width conflict may not shrink a measured source in the loader');
  assert.deepEqual(fused.root.scale.toArray(),[1,1,1]);
  assert.equal(new THREE.Box3().setFromObject(fused.root).getSize(new THREE.Vector3()).x,3);
  for(const name of ['rig_hull','rig_turret','rig_gun'])
    assert.deepEqual(fused.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray(),[0,0,0]);
  const identity=new THREE.Matrix4().toArray();
  const sourceFrame={rootMatrix:identity,hull:[0,0,0],turret:[0,0,0],gun:[0,0,0]};
  const nativeFrame={rootMatrix:identity,hull:[0,0,0],turret:[...certificate.turret],gun:[...certificate.gun]};
  assert.equal(validateSourceWorldFrame(certificate,certificate.sha256,
    {reference:sourceFrame,procedural:nativeFrame}).passed,true);
  sourceFrame.gun=[...certificate.gun];
  assert.equal(validateSourceWorldFrame(certificate,certificate.sha256,
    {reference:sourceFrame,procedural:nativeFrame}).passed,false,
    'fused oracle may not manufacture component owners');
  certificate.sha256='0'.repeat(64);
  await assert.rejects(loadReferenceGlb({source:'glb',glb:fusedCfg},'type10',null),/hash/i);
  await assert.rejects(loadReferenceGlb({source:'glb',glb:{path}},'type10',null),/private local/);
} finally {certificate.sha256=oldHash;globalThis.fetch=oldFetch;}
console.log('reference-gun-pivot: explicit trunnion fixes articulation without changing neutral source geometry');

// A graft (267, the Burlak prototype's composite): one certified source's hull under another certified source's turret and
// gun. The host's own turret and gun leave, the graft's named meshes move by the certificate's ring-to-ring translation,
// their islands under the plane stay behind, and both files are hash-verified. Synthetic fixtures under the prototype's
// certificate (hashes and translation replaced in this process only); the owner's 1.05 applies as for the real files.
{
  const tri=(x,y,z,s=.2)=>[x,y,z, x+s,y,z, x,y+s,z];
  const fixture=(names,triangles)=>{
    const points=new Float32Array(triangles.flat(2));
    const nodes=[],meshes=[],accessors=[];
    for(const [n,[name,count]] of names.entries()){
      const first=names.slice(0,n).reduce((a,[,c])=>a+c,0);
      const values=triangles.slice(first,first+count).flat(2);
      const min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k))),max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));
      accessors.push({bufferView:0,byteOffset:first*36,componentType:5126,count:count*3,type:'VEC3',min,max});
      meshes.push({primitives:[{attributes:{POSITION:n},indices:names.length+n}]});
      nodes.push({name,mesh:n});
    }
    const index=new Uint16Array(names.flatMap(([,count])=>Array.from({length:count*3},(_,i)=>i)));
    for(const [n,[,count]] of names.entries())accessors.push({bufferView:1,byteOffset:names.slice(0,n).reduce((a,[,c])=>a+c*6,0),componentType:5123,count:count*3,type:'SCALAR'});
    const bytes=Buffer.concat([Buffer.from(points.buffer),Buffer.from(index.buffer)]);
    return Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,
      buffers:[{uri:`data:application/octet-stream;base64,${bytes.toString('base64')}`,byteLength:bytes.length}],
      bufferViews:[{buffer:0,byteOffset:0,byteLength:points.byteLength},{buffer:0,byteOffset:points.byteLength,byteLength:index.byteLength}],accessors}));
  };
  const host=fixture([['Hull',1],['OracleTurret',1],['OracleGun',1]],[[tri(0,1,0)],[tri(0,2,0)],[tri(0,2,1)]]);
  // GTurret: one island over the plane and one under it (the hidden ring floor); GGun; GHull stays in its source
  const donor=fixture([['GTurret',2],['GGun',1],['GHull',1]],[[tri(0,2.2,0)],[tri(0,1.1,0)],[tri(0,2.3,1)],[tri(0,1,0)]]);
  const hostPath='/models/community-candidates/synthetic-graft-host.glb',donorPath='/models/community-candidates/synthetic-graft-donor.glb';
  const cert=SOURCE_WORLD_FRAMES.t90a_burlak_proto,seat=cert.graft,saved={sha256:cert.sha256,graft:seat.sha256,translation:seat.translation};
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const cfg={path:hostPath,graft:{path:donorPath,replaces:'^Oracle(?:Turret|Gun)$',nodes:'^G(?:Turret|Gun)$',worldMinY:1.5},
    turretNode:'^GTurret$',gunNode:'^GGun$',autoPivot:true,pivot:[0,1.6,.1],gunPivot:[0,2,1.1]};
  const oldFetch=globalThis.fetch;
  try {
    cert.sha256=sha(host);seat.sha256=sha(donor);seat.translation=[0,-.5,.1];
    globalThis.fetch=(url,...args)=>url===hostPath?Promise.resolve(new Response(host))
      :url===donorPath?Promise.resolve(new Response(donor))
        :typeof url==='string'&&url.startsWith('/models/')?Promise.resolve(new Response(null,{status:404})):oldFetch(url,...args);
    const composite=(await loadReferenceGlb({source:'glb',glb:cfg},'t90a_burlak_proto',null)).root;
    const names=[];composite.traverse(o=>{if(o.isMesh)names.push(o.name);});
    assert.deepEqual(names.sort(),['GGun','GTurret','Hull'],'the host turret and gun leave; the graft hull stays behind');
    const turret=composite.getObjectByName('GTurret'),gunMesh=composite.getObjectByName('GGun');
    assert.equal(turret.parent.name,'rig_turret');assert.equal(gunMesh.parent.name,'rig_gun');
    assert.equal(turret.geometry.getAttribute('position').count,3,'the island under the plane stays behind');
    const corner=mesh=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld).toArray().map(v=>+v.toFixed(6));
    assert.deepEqual(corner(turret),[0,1.7*1.05,.1*1.05].map(v=>+v.toFixed(6)),'moved by the certified translation, installed at 1.05');
    assert.deepEqual(corner(gunMesh),[0,1.8*1.05,1.1*1.05].map(v=>+v.toFixed(6)));
    assert.deepEqual(composite.getObjectByName('rig_turret').getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(6)),[0,1.6*1.05,.1*1.05].map(v=>+v.toFixed(6)));
    // negative controls: a changed graft file, a graft without a certificate, a graft mesh named like a host mesh
    seat.sha256='0'.repeat(64);
    await assert.rejects(loadReferenceGlb({source:'glb',glb:cfg},'t90a_burlak_proto',null),/hash/i);
    seat.sha256=sha(donor);
    const plain=SOURCE_WORLD_FRAMES.type10,plainHash=plain.sha256;
    try { plain.sha256=sha(host);
      await assert.rejects(loadReferenceGlb({source:'glb',glb:cfg},'type10',null),/certified private local graft/);
    } finally {plain.sha256=plainHash;}
    await assert.rejects(loadReferenceGlb({source:'glb',glb:{...cfg,graft:{...cfg.graft,path:'/models/community-candidates/absent.glb'}}},
      't90a_burlak_proto',null),/reference source unavailable/);
    const clash=fixture([['GTurret',1],['Hull',1]],[[tri(0,2.2,0)],[tri(0,2.4,0)]]);seat.sha256=sha(clash);
    globalThis.fetch=(url,...args)=>url===hostPath?Promise.resolve(new Response(host))
      :url===donorPath?Promise.resolve(new Response(clash)):oldFetch(url,...args);
    await assert.rejects(loadReferenceGlb({source:'glb',glb:{...cfg,graft:{...cfg.graft,nodes:'^(?:GTurret|Hull)$'}}},'t90a_burlak_proto',null),/shares a name/);
  } finally {cert.sha256=saved.sha256;seat.sha256=saved.graft;seat.translation=saved.translation;globalThis.fetch=oldFetch;}
  console.log('reference-gun-pivot: a certified graft replaces the host turret and gun on its ring; changed or uncertified grafts fail');
}
