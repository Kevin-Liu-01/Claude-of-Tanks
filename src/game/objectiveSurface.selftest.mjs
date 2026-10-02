import assert from 'node:assert/strict';
import {Mesh,Group,MeshBasicMaterial,Vector3} from 'three';
import {objectiveRing,fitObjectiveSurface} from './objectiveSurface.ts';
const sample=(x,z)=>Math.sin(x*.13)*3+Math.cos(z*.17)*2;
for(const [inner,outer] of [[0,26.5],[26.5,30],[8.6,9.6],[5.4,6.6]]){
 const a=new Mesh(objectiveRing(inner,outer),new MeshBasicMaterial()),b=new Mesh(objectiveRing(inner,outer),a.material);
 const marker=new Group();marker.position.set(60,12,9);marker.add(a);a.rotation.x=-Math.PI/2;
 fitObjectiveSurface(a,60,12,9,sample);marker.updateMatrixWorld(true);
 const p=a.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const world=new Vector3().fromBufferAttribute(p,i).applyMatrix4(a.matrixWorld);
  assert(Math.abs(world.y - sample(world.x,world.z) - .065)<.00001,'every decal vertex sits above the actual surface');
 }
 assert(b.geometry.attributes.position.array.every((v,i)=>i%3!==2||v===0),'another zone is not deformed');
 const version=p.version;fitObjectiveSurface(a,60,12,9,sample);assert.equal(p.version,version,'stationary marker avoids uploads');
 fitObjectiveSurface(a,80,12,9,sample);assert(p.version>version,'reposition refits');
 a.geometry.dispose();b.geometry.dispose();a.material.dispose();
}
console.log('objectiveSurface: independent rings/discs conform and stationary geometry is retained');
