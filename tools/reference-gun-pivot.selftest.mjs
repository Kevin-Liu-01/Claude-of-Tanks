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
const certificate=SOURCE_WORLD_FRAMES.type10_x;
const oldHash=certificate.sha256,oldFetch=globalThis.fetch;
try {
  certificate.sha256=createHash('sha256').update(fixtureBytes).digest('hex');
  globalThis.fetch=(url,...args)=>url===fixturePath
    ? Promise.resolve(new Response(fixtureBytes)):oldFetch(url,...args);
  const fusedCfg={path:fixturePath};
  const fused=await loadReferenceGlb({source:'glb',glb:fusedCfg},'type10_x',{dims:{widthM:2.4}});
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
  await assert.rejects(loadReferenceGlb({source:'glb',glb:fusedCfg},'type10_x',null),/hash/i);
  await assert.rejects(loadReferenceGlb({source:'glb',glb:{path}},'type10_x',null),/private local/);
} finally {certificate.sha256=oldHash;globalThis.fetch=oldFetch;}
console.log('reference-gun-pivot: explicit trunnion fixes articulation without changing neutral source geometry');
