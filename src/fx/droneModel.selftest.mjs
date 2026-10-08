import assert from 'node:assert/strict';
import {Group,Vector3,Box3,Object3D} from 'three';
import {DRONE_DESIGNS,createDroneModelKit,poseDroneRotor} from './droneModel.ts';
import {DRONE_DOCK_ENVELOPE,DRONE_DOCK_VOLUMES,DRONE_DOCK_HEIGHT_M} from '../sim/missionAttachment.ts';
import {createDronePresentation} from './dronePresentation.ts';
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
for(const nation of Object.keys(DRONE_DESIGNS)){
 const kit=createDroneModelKit(nation);kit.body.computeBoundingBox();
 assert.ok(kit.body.getAttribute('position').count>1800,'motor bells, wiring, guards and feet are modeled');
 assert.ok(kit.body.boundingBox.min.y>=-.25,'landing gear clears the dock');
 const assembly=new Box3();
 for(const geometry of [kit.body,kit.equipment,kit.lens]){proveCovered(geometry);geometry.computeBoundingBox();assembly.union(geometry.boundingBox);assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite),'finite mesh positions');}
 kit.rotor.computeBoundingBox();
 for(let i=0;i<4;i++)for(let step=0;step<72;step++){poseDroneRotor(pose,i,step*Math.PI/36);for(let v=0;v<kit.rotor.attributes.position.count;v++){point.fromBufferAttribute(kit.rotor.attributes.position,v).applyMatrix4(pose.matrix);assembly.expandByPoint(point);point.y+=DRONE_DOCK_HEIGHT_M;assert.ok(pointFits(point),'spinning rotor stays inside finite rotor stock');}rotorChecks++;}
 assembly.translate(new Vector3(0,DRONE_DOCK_HEIGHT_M,0));assert.ok(fits(assembly),nation+': complete rotating airframe is inside the clearance envelope');
 assert.ok(Math.abs(assembly.min.y-.039)<.001,nation+': landing skids contact the actual cradle pads');
 assert.ok(!fits(assembly.clone().expandByScalar(.1)),'oversize airframe negative control fails');
 shapes.add(kit.body.getAttribute('position').count);colors.add(kit.equipmentMaterial.color.getHex());kit.dispose();
}
assert.ok(shapes.size>=4,'four distinct structural airframes');assert.ok(colors.size>=12,'national service palettes');
const root=new Group(),pool=createDronePresentation(root);pool.begin(1);
for(let i=0;i<60;i++)pool.write(new Vector3(),new Vector3(),i,0,1,i%2?'China':'USA');pool.end();
assert.equal(root.children.filter(m=>m.name.includes('airframes')).reduce((sum,m)=>sum+m.count,0),42,'bounded shared aircraft capacity');
pool.begin(2);pool.end();assert.ok(root.children.every(m=>!m.visible),'expired aircraft hidden');pool.reset();
console.log(`droneModel: ${rotorChecks} rotor poses, national geometry, finite dock envelope, physical skid contact, oversize negative control and bounded rendering passed`);
