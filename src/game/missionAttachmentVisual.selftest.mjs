import assert from 'node:assert/strict';
import { Group, Vector3, Euler } from 'three';
import { syncMissionAttachment } from './missionAttachmentVisual.ts';
import { missionAttachmentFor, DRONE_DOCK_HEIGHT_M } from '../sim/missionAttachment.ts';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
for(const id of ['m1a2','kf41_lynx_x','strv103'])for(const scale of [1,.8]){
 const spec=TANK_SPECS[id],seat=missionAttachmentFor(spec),root=new Group(),turret=new Group();
 root.position.set(10,2,20);root.rotation.set(-.12,.6,-.08,'YXZ');
 turret.name='rig_turret';turret.position.set(...spec.armor.turretPivot);turret.scale.setScalar(scale);root.add(turret);
 const view={kind:'drone',active:false,cooldownS:0};
 syncMissionAttachment(root,spec,view,false);
 const rail=root.getObjectByName('Reusable mission payload rail'),drone=root.getObjectByName('Docked FPV mission payload');
 assert.equal(rail.parent,seat.frame==='turret'?turret:root);
 for(const yaw of [0,Math.PI/2,-2.1]){
  turret.rotation.y=yaw;root.updateMatrixWorld(true);
  const expected=new Vector3(seat.x,seat.y+DRONE_DOCK_HEIGHT_M,seat.z);
  if(seat.frame==='turret')expected.applyEuler(new Euler(0,yaw,0)).add(new Vector3(...spec.armor.turretPivot));
  expected.applyEuler(root.rotation).add(root.position);
  assert.ok(drone.getWorldPosition(new Vector3()).distanceTo(expected)<1e-8,`${id}: visual follows launch datum at ${yaw}, parent scale ${scale}`);
 }
 view.active=true;syncMissionAttachment(root,spec,view,false);assert.equal(drone.visible,false);
 syncMissionAttachment(root,spec,view,true);assert.equal(rail.visible,false);
 root.dispatchEvent({type:'removed'});assert.equal(rail.parent,null);
}
console.log('missionAttachmentVisual: turret/casemate ownership, rotation, scaled parents, launch alignment and disposal passed');
