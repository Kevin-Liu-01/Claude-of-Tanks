import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT,registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildK2X} from './k2X.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {auditVisibleReturnRollerContact} from '../returnRollerContactTest.mjs';
import {continuousShoeClearance,moving} from '../returnRollerPhysicsTest.mjs';

// Independent scalar measurements from the original owner's Object_30.
// Original GLB SHA256 3e514bedb40be0fde6787dad6513f625ba077cd0c1da04d29defe94e9c156140.
const close=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b}`);
for(const quality of ['high','low']) {
  let gear,port,cfg,tank;
  const buildGear=KIT.buildRunningGear;
  KIT.buildRunningGear=(p,input)=>{cfg=input;return buildGear(p,input);};
  registerProfiledBuilders({k2_x:p=>{port=p;buildK2X(p);gear=p.gear;}});
  try {tank=createTank('k2_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});}
  finally {KIT.buildRunningGear=buildGear;registerProfiledBuilders({k2_x:buildK2X});}
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('rig_hull');
    const rotors=hull.getObjectByName('gearReturnRollerRotors');
    assert.equal(rotors.count,6,'three actual spinning return wheels per side');
    rotors.geometry.computeBoundingBox();
    const bounds=rotors.geometry.boundingBox;
    close(bounds.max.x-bounds.min.x,.0826,2e-7,'original narrow axial span');
    close(bounds.max.y-bounds.min.y,.19035,.00166,'both source crown diameters fit within 1.66 mm');
    const matrix=new T.Matrix4(),axis=new T.Vector3(),rollerBounds=[];
    for(let i=0;i<rotors.count;i++) {
      rotors.getMatrixAt(i,matrix);axis.setFromMatrixPosition(matrix);
      close(Math.abs(axis.x),1.2165,2e-7,'source inboard axle');
      close(axis.y,1.005725,.00003,'source axle height');
      close(Math.min(...[-1.77835,.013,1.8319].map(z=>Math.abs(z-axis.z))),0,.00006,'source longitudinal station');
      rollerBounds.push({center:axis.clone(),minX:axis.x-.0826/2,maxX:axis.x+.0826/2,r:.095175});
    }
    const shafts=[];hull.traverse(o=>{if(o.name==='gearReturnRollerSpindles')shafts.push(o);});
    assert.equal(shafts.reduce((n,o)=>n+o.count,0),6,'every wheel has a finite hull shaft');
    for(const shaft of shafts) {
      shaft.geometry.computeBoundingBox();
      for(let i=0;i<shaft.count;i++) {
        shaft.getMatrixAt(i,matrix);axis.setFromMatrixPosition(matrix);
        const half=(shaft.geometry.boundingBox.max.x-shaft.geometry.boundingBox.min.x)/2;
        close(Math.abs(axis.x)-half,1.05,2e-7,'shaft reaches existing sloped tub');
        assert.ok(Math.abs(axis.x)+half>1.2165-.0826/2,'positive receiving lap inside rotor');
      }
    }
    const before=Array.from(rotors.instanceMatrix.array);
    gear.update(.13,-.17,1/60);
    assert.notDeepEqual(Array.from(rotors.instanceMatrix.array),before,'real differential track scrolling rotates the wheels');
    const state=createTankState(getSpec('k2_x'),new T.Vector3(),0);
    const rows=auditVisibleReturnRollerContact(tank,gear,state,{radiusM:.095175});
    console.log(JSON.stringify({id:'k2_x',quality,rows}));
    assert.ok(rows.every(r=>r.contact==='PASS'),'all selected LODs and 27 phases retain actual visible support within 6 mm');
    gear.resetPose();tank.root.updateMatrixWorld(true);
    const context={tank,port,cfg,gear,receipt:hull.userData.runningGearReceipts[0]};
    const continuous=continuousShoeClearance(context,rollerBounds),movement=moving(context,rollerBounds);
    assert.ok(movement.minimum>=-2e-6,`full suspension stroke must not push stock through return rollers: ${movement.minimum}`);
    console.log(JSON.stringify({quality,continuous,movement}));
  } finally {tank.dispose();registerProfiledBuilders({k2_x:buildK2X});}
}
