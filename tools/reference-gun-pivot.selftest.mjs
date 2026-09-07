import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadReferenceGlb } from './reference-glb-loader.ts';
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
console.log('reference-gun-pivot: explicit trunnion fixes articulation without changing neutral source geometry');
