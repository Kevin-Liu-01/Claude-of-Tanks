import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
import {DRONE_DESIGNS,createDroneModelKit} from './droneModel.ts';
import {createDronePresentation} from './dronePresentation.ts';
const shapes=new Set(),colors=new Set();
for(const nation of Object.keys(DRONE_DESIGNS)){
 const kit=createDroneModelKit(nation);kit.body.computeBoundingBox();
 assert.ok(kit.body.getAttribute('position').count>1800,'motor bells, wiring, guards and feet are modeled');
 assert.ok(kit.body.boundingBox.min.y>=-.25,'landing gear clears the dock');
 shapes.add(kit.body.getAttribute('position').count);colors.add(kit.equipmentMaterial.color.getHex());kit.dispose();
}
assert.ok(shapes.size>=4,'four distinct structural airframes');assert.ok(colors.size>=12,'national service palettes');
const root=new Group(),pool=createDronePresentation(root);pool.begin(1);
for(let i=0;i<60;i++)pool.write(new Vector3(),new Vector3(),i,0,1,i%2?'China':'USA');pool.end();
assert.equal(root.children.filter(m=>m.name.includes('airframes')).reduce((sum,m)=>sum+m.count,0),42,'bounded shared aircraft capacity');
pool.begin(2);pool.end();assert.ok(root.children.every(m=>!m.visible),'expired aircraft hidden');pool.reset();
console.log('droneModel: national geometry, detail, dock clearance and bounded rendering passed');
