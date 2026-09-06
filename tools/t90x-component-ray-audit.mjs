// Local-only physical ray diagnostics. Quantized hit cells identify misplaced
// authored equipment; none are converted into runtime meshes or score masks.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTank } from '../src/vehicles/tankFactory.ts';

const id=process.argv[2]??'t90a_x',part=process.argv[3]??'turret';
if(!/^t90(?:a(?:_vladimir)?|m|sm)_x$/.test(id)||!['turret','hull'].includes(part))throw Error('Invalid scoped T-90 component');
const bytes=fs.readFileSync(new URL(`../public/models/community-candidates/${id}_source.glb`,import.meta.url));
const source=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const tank=createTank(id,null,{proceduralOnly:true,quality:'high',geometryReceipt:true});
function owned(root,exclude) {
  const meshes=[];
  root.traverseVisible(mesh=>{
    if(!mesh.isMesh||/^procShadow/.test(mesh.name))return;
    for(let parent=mesh;parent;parent=parent.parent)if(parent.name===exclude)return;
    meshes.push(mesh);
  });
  return meshes;
}
try {
  source.scene.updateMatrixWorld(true);tank.root.updateMatrixWorld(true);
  const refs=owned(source.scene.getObjectByName(part==='hull'?'OracleHull':'OracleTurret'),'OracleGun');
  const procs=owned(tank.root.getObjectByName(`rig_${part}`),'rig_gun');
  const output={id,part,views:{}};
  for(const view of ['front','side']) {
    const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(view==='side'?-1:0,0,view==='front'?-1:0),0,12);
    const cells=[],summary={referenceOnly:0,proceduralOnly:0,overlap:0,byObject:{}};
    for(let i=0;i<(view==='side'?176:96);i++)for(let j=0;j<100;j++) {
      const u=(view==='side'?-4.3:-2.375)+i*.05,y=.0125+j*.035;
      if(view==='side')ray.ray.origin.set(5,y,u);else ray.ray.origin.set(u,y,6);
      const a=ray.intersectObjects(refs,false)[0],b=ray.intersectObjects(procs,false)[0];
      if(Boolean(a)===Boolean(b)){if(a)summary.overlap++;continue;}
      const role=a?'referenceOnly':'proceduralOnly',name=(a??b).object.name;
      summary[role]++;summary.byObject[`${role}:${name}`]=(summary.byObject[`${role}:${name}`]??0)+1;
      cells.push({u:+u.toFixed(3),y:+y.toFixed(3),role,object:name});
    }
    output.views[view]={summary,cells};
  }
  console.log(JSON.stringify(output,null,2));
} finally {tank.dispose();}
