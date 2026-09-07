import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {TYPE10_X_DATUMS} from './type10X.ts';

const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,
  `${label}: ${a} versus ${b} ±${e}`);
const identity=new THREE.Matrix4();
function hit(root,position,direction,far=5,pose=identity) {
  return new THREE.Raycaster(new THREE.Vector3(...position).applyMatrix4(pose),
    new THREE.Vector3(...direction).transformDirection(pose),0,far).intersectObject(root,true)[0];
}
const plates=[[-.9,-1.5,2.196917569],[-.9,-1,2.201939204],
  [-.6,-1.5,2.198530656],[-.6,-1,2.203745570],[-.6,-.5,2.208767216],
  [0,-1,2.203745637],[.3,-1,2.203745637],[.6,-1,2.203745641],
  [.6,-1.5,2.196737080],[.9,-1.5,2.196737080],
  [1.051983,-1.35,2.199805321],[1.051983,-.4015,2.244400052]];
const rails=[[-1.9,2.364476574],[-1.88,2.378367908],[-1.84,2.390854673],
  [-1.75,2.391758708],[-1.6,2.393265420],[-1.42,2.395073454],
  [-1.36,2.372024760],[-1.35,2.359457795]];
function evidence(tank,pose=identity) {
  const root=tank.root,detail=root.getObjectByName('turretDetail'),shell=root.getObjectByName('turret');
  for(const[x,z,y]of plates)near(hit(root,[x,3,z],[0,-1,0],1.1,pose)?.distance,3-y,.0008,
    'independent complete-source cover or pull-handle crown');
  for(const x of[.0018409,.1690486]) {
    for(const[z,y]of rails)near(hit(root,[x,3,z],[0,-1,0],1.1,pose)?.distance,3-y,.0035,
      'complete-source longitudinal bent rail crown');
    assert.ok(!hit(root,[x-.06,2.30,-1.75],[1,0,0],.12,pose),
      'real broad air below each lifting rail');
    for(const z of[-1.905233,-1.350435]) {
      const skin=hit(shell,[x,3,z],[0,-1,0],1.1,pose);
      const foot=hit(detail,[x,2.10,z],[0,1,0],.15,pose);
      assert.ok(skin&&foot,'positive capped receiving foot and permanent armor');
      near((3-skin.distance)-(2.10+foot.distance),.00295,.0003,
        'concealed rail root overlaps armor; no floating loop');
    }
  }
  // Source's small L catches have a thin overhang above their receiving lid.
  assert.ok(!hit(root,[-.473651,2.211,-1.150],[0,0,-1],.025,pose),
    'thin catch exposes a real underside gap');
  assert.ok(hit(root,[-.473651,2.218,-1.150],[0,0,-1],.025,pose),
    'positive catch tongue borders the gap');
  for(const z of[-.401516,-.929938]) {
    assert.ok(!hit(root,[1.051983,2.229+(.401516+z)*.0100435,z+.04],[0,0,-1],.08,pose),
      'small lid pull has a real open middle');
    assert.ok(hit(root,[1.051983,2.243+(.401516+z)*.0100435,z+.04],[0,0,-1],.08,pose),
      'small lid pull retains the surrounding crown');
  }
}
for(const quality of['high','low']) {
  const tank=createTank('type10_x',null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);evidence(tank);
    const turret=tank.root.getObjectByName('rig_turret');
    const gear=JSON.stringify(tank.root.getObjectByName('rig_hull').userData.runningGearReceipts);
    for(const yaw of[-1.1,.8,Math.PI]) {
      turret.rotation.y=yaw;tank.root.getObjectByName('rig_gun').rotation.x=.2;
      tank.root.updateMatrixWorld(true);
      const p=TYPE10_X_DATUMS.turretPivot;
      const pose=turret.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(-p[0],-p[1],-p[2]));
      evidence(tank,pose);
      assert.equal(JSON.stringify(tank.root.getObjectByName('rig_hull').userData.runningGearReceipts),gear,
        'roof revision preserves all axle, tire, native course and end-wheel inputs');
    }
  }finally{tank.dispose();}
}
console.log('type10XRoofPanels.selftest: high/low held-out covers, bent rail air, roots, catches, pull handles and yaw ownership passed');
