import assert from 'node:assert/strict';
import {Group,Vector3,Box3,Object3D} from 'three';
import {DRONE_DESIGNS,createDroneModelKit,poseDroneRotor,droneRotorDirection} from './droneModel.ts';
import {DRONE_DOCK_ENVELOPE,DRONE_DOCK_VOLUMES,DRONE_DOCK_HEIGHT_M} from '../sim/missionAttachment.ts';
import {createDronePresentation,droneHiddenFromCamera} from './dronePresentation.ts';
import {PerspectiveCamera} from 'three';
const shapes=new Set(),colors=new Set(),pose=new Object3D(),point=new Vector3();
const e=DRONE_DOCK_ENVELOPE,allowed=new Box3(new Vector3(-e.halfWidth,e.bottom,-e.halfDepth),new Vector3(e.halfWidth,e.top,e.halfDepth));
const fits=box=>allowed.containsBox(box);
let rotorChecks=0;
const trianglePoints=[new Vector3(),new Vector3(),new Vector3()];
const stock=DRONE_DOCK_VOLUMES.map(v=>new Box3(new Vector3(...v.min),new Vector3(...v.max)));
const pointFits=p=>stock.some(b=>b.containsPoint(p));
const proveCovered=geometry=>{
 const pos=geometry.attributes.position,index=geometry.index;
 for(let i=0;i<(index?.count??pos.count);i+=3){
  for(let v=0;v<3;v++){trianglePoints[v].fromBufferAttribute(pos,index?index.getX(i+v):i+v).y+=DRONE_DOCK_HEIGHT_M;}
  assert.ok(stock.some(b=>trianglePoints.every(p=>b.containsPoint(p))),'whole finite triangle belongs to a protected stock volume: '+trianglePoints.map(v=>v.toArray()));
 }
};
for(const nation of Object.keys(DRONE_DESIGNS))for(const detail of ['full','lite']){
 const kit=createDroneModelKit(nation,detail);kit.body.computeBoundingBox();
 if(detail==='full')assert.ok(kit.body.getAttribute('position').count>1800,'motor bells, wiring, guards and feet are modeled');
 assert.equal(kit.parts.length,4,'four merged airframe materials: composite, paint, metal, glass');
 assert.ok(kit.body.boundingBox.min.y>=-.25,'landing gear clears the dock');
 const assembly=new Box3();
 for(const geometry of [kit.body,kit.equipment,kit.metal,kit.lens]){proveCovered(geometry);geometry.computeBoundingBox();assembly.union(geometry.boundingBox);assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite),'finite mesh positions');}
 kit.rotor.computeBoundingBox();
 for(const rotor of [kit.rotor,kit.rotorBlur])for(let i=0;i<4;i++)for(let step=0;step<72;step++){poseDroneRotor(pose,i,step*Math.PI/36);for(let v=0;v<rotor.attributes.position.count;v++){point.fromBufferAttribute(rotor.attributes.position,v).applyMatrix4(pose.matrix);assembly.expandByPoint(point);point.y+=DRONE_DOCK_HEIGHT_M;assert.ok(pointFits(point),'spinning rotor (blades and blur disc) stays inside finite rotor stock');}rotorChecks++;}
 assembly.translate(new Vector3(0,DRONE_DOCK_HEIGHT_M,0));assert.ok(fits(assembly),nation+': complete rotating airframe is inside the clearance envelope');
 assert.ok(Math.abs(assembly.min.y-.039)<.001,nation+': landing skids contact the actual cradle pads');
 assert.ok(!fits(assembly.clone().expandByScalar(.1)),'oversize airframe negative control fails');
 if(detail==='full'){shapes.add(kit.body.getAttribute('position').count);colors.add(kit.equipmentMaterial.color.getHex());}
 kit.dispose();
}
// Counter-rotating diagonal pairs: each prop's twist faces its own airflow (mirrored blade set).
assert.deepEqual([0,1,2,3].map(droneRotorDirection),[1,-1,-1,1],'diagonal rotors share a direction, neighbours oppose');
assert.ok(shapes.size>=4,'four distinct structural airframes');assert.ok(colors.size>=12,'national service palettes');
const root=new Group(),pool=createDronePresentation(root);pool.begin(1);
for(let i=0;i<60;i++)pool.write(new Vector3(),new Vector3(),i,0,1,i%2?'China':'USA');pool.end();
assert.equal(root.children.filter(m=>m.name.includes('airframes')).reduce((sum,m)=>sum+m.count,0),42,'bounded shared aircraft capacity');
pool.begin(2);pool.end();assert.ok(root.children.every(m=>!m.visible),'expired aircraft hidden');pool.reset();
// Self-hide: only the pilot's own drone, only while its aerial camera rides it. A film camera 1.99 m from the dock
// (the 2026-10-10 vanishing frame) and any other observer draw it.
{
 const camera=new PerspectiveCamera(),at=new Vector3(0,.43,0);camera.position.set(1.25,.42,-1.55);
 assert.equal(droneHiddenFromCamera(at,'p1',true,camera),false,'an observer 1.99 m away draws the drone');
 camera.userData.aerialPilotId='p1';
 assert.equal(droneHiddenFromCamera(at,'p1',true,camera),true,'the riding pilot camera skips its own airframe');
 assert.equal(droneHiddenFromCamera(at,'p2',true,camera),false,'another player\'s drone stays drawn beside the pilot camera');
 assert.equal(droneHiddenFromCamera(at,'p1',false,camera),false,'a finished flight never hides');
 camera.position.set(3,.42,0);assert.equal(droneHiddenFromCamera(at,'p1',true,camera),false,'beyond 2 m the pilot sees its launch silhouette');
}
console.log(`droneModel: ${rotorChecks} rotor poses, national geometry, finite dock envelope, physical skid contact, oversize negative control and bounded rendering passed`);
