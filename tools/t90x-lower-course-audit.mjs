// CPU-only comparison of physical lower-course rays. No image-space alignment,
// source buffers in runtime, score exclusions, or generated fleet receipts.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTank } from '../src/vehicles/tankFactory.ts';

const id=process.argv[2]??'t90m_x';
if(!/^t90(?:a(?:_vladimir)?|m|sm)_x$/.test(id))throw new Error('Only the four audited T-90 X sources are supported');
const file=new URL(`../public/models/community-candidates/${id}_source.glb`,import.meta.url);
const bytes=fs.readFileSync(file);
const source=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const tank=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
function meshes(root) {
  const result=[];
  root.traverseVisible(o=>{
    if(o.isMesh&&!/^procShadow/.test(o.name)&&o.userData?.geometryAuditIgnore!==true)result.push(o);
  });
  return result;
}
try {
  source.scene.updateMatrixWorld(true);tank.root.updateMatrixWorld(true);
  const reference=meshes(source.scene.getObjectByName('OracleHull'));
  const procedural=meshes(tank.root.getObjectByName('rig_hull'));
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(-1,0,0),0,8);
  const bands=[],mismatches=[];
  for(let j=0;j<27;j++) {
    const y=.0125+j*.025,row={y,referenceOnly:0,proceduralOnly:0,overlap:0};
    for(let i=0;i<145;i++) {
      const z=-3.6+i*.05;ray.ray.origin.set(4,y,z);
      const a=ray.intersectObjects(reference,false)[0],b=ray.intersectObjects(procedural,false)[0];
      if(a&&b)row.overlap++;
      else if(a)row.referenceOnly++;
      else if(b)row.proceduralOnly++;
      if(Boolean(a)!==Boolean(b))mismatches.push({y,z:+z.toFixed(3),reference:a?.object.name??null,procedural:b?.object.name??null});
    }
    bands.push(row);
  }
  console.log(JSON.stringify({id,bands,mismatches},null,2));
} finally {tank.dispose();}
