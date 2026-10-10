import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {createThermalVehicles} from './thermalVehicles.ts';
const scene=new Group(),source=new MeshStandardMaterial({color:0x476234,alphaTest:.5}),geometry=new BoxGeometry();
const actors=Array.from({length:5},(_,i)=>{
 const root=new Group(),mesh=new Mesh(geometry,source);root.add(mesh);scene.add(root);
 return {team:i?'enemy':'ally',visual:{root},combat:{destroyed:i===3},networkVisible:i!==2,mesh};
});
actors[4].visual.root.visible=false;
const heat=createThermalVehicles();
heat.begin(actors,false,'ally');assert.equal(actors[1].mesh.material,source);
heat.begin(actors,true,'ally');
const enemy=actors[1].mesh.material,ally=actors[0].mesh.material;
assert.notEqual(enemy,source);assert.ok(enemy.emissive.r>ally.emissive.r);
assert.equal(enemy.alphaTest,.5);assert.equal(enemy.depthTest,true,'heat respects wall and terrain occlusion');
for(const i of [2,3,4])assert.equal(actors[i].mesh.material,source,'unseen, destroyed and hidden actors get no hot treatment');
assert.equal(source.emissive.r,0,'original shared material remains untouched');
heat.end();for(const actor of actors)assert.equal(actor.mesh.material,source);
heat.begin(actors,true,'ally');assert.equal(actors[1].mesh.material,enemy,'cached material reused');heat.end();
let disposed=0;enemy.addEventListener('dispose',()=>disposed++);source.dispose();assert.equal(disposed,1,'cache follows source lifetime');geometry.dispose();
console.log('thermalVehicles: visibility, depth, cutouts, friends, original restoration, reuse and disposal passed');

// Cold loading primes the exact owner later used by battle frames, including
// locally staged hidden opponents without exposing them at a checkpoint.
{
 const source=new MeshStandardMaterial(), root=new Group(), mesh=new Mesh(new BoxGeometry(),source);
 new Group().add(root);root.add(mesh);root.visible=false;
 const actor={team:'enemy',networkVisible:false,visual:{root}}, heat=createThermalVehicles();
 let clones=0, prepared=0, warmedMaterial;
 const clone=source.clone.bind(source);source.clone=()=>{clones++;return clone();};
 function* prepare(node){
  assert.equal(node,root);assert.equal(root.visible,true);
  assert.equal(mesh.frustumCulled,false,'off-camera tanks exercise draw-time bindings too');
  assert.notEqual(mesh.material,source);warmedMaterial=mesh.material;
  prepared++;yield;
  assert.equal(mesh.material,warmedMaterial,'same variant on continuation');
 }
 const steps=heat.warmSteps([actor],'ally',prepare);
 for(const _ of steps){
  assert.equal(root.visible,false);assert.equal(mesh.material,source);
  assert.equal(mesh.frustumCulled,true);
  heat.begin([actor],true,'ally');assert.equal(mesh.material,source);heat.end();
 }
 assert.equal(clones,2,'both team variants prepared once');
 root.visible=true;actor.networkVisible=true;
 heat.begin([actor],true,'ally');assert.equal(mesh.material,warmedMaterial);heat.end();
 assert.equal(clones,2,'first live infrared frame performs no material cloning');
 assert.equal([...heat.warmSteps([actor],'ally',prepare)].length,0,'completed warm reused');
 heat.invalidateWarm();root.visible=false;
 const cancelled=heat.warmSteps([actor],'ally',prepare);cancelled.next();cancelled.return();
 assert.equal(root.visible,false);assert.equal(mesh.material,source);
 assert.throws(()=>[...heat.warmSteps([actor],'ally',function*(){throw Error('GPU failure');})],/GPU failure/);
 assert.equal(root.visible,false);assert.equal(mesh.material,source);assert.equal(mesh.frustumCulled,true);
 [...heat.warmSteps([actor],'ally',prepare)];
 assert.equal(prepared,3,'context restore and cancelled warm can retry');
 assert.equal(clones,2,'context restore retains CPU material cache');
 source.dispose();mesh.geometry.dispose();
}
console.log('thermalVehicles: cold preparation, zero switch-time clones, hidden actors, cancellation, failure and context restore passed');
