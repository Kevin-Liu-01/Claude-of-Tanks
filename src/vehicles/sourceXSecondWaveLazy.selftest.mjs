import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank,ensureTankBuilder,isTankBuilderReady} from './fleetFactory.ts';
import {SECOND_WAVE_X_IDS} from './sourceXSecondWaveSpecs.ts';
import {combatAnatomyCalibration} from './combatAnatomyCalibrationRegistry.ts';
import {vehicleMarkingSeats} from './vehicleMarkingSeatRegistry.ts';

// This process intentionally never imports the eager tankFactory/profile
// registry. A CPU geometry test on that route cannot verify browser loading.
assert.equal(SECOND_WAVE_X_IDS.length,23);
for(const id of SECOND_WAVE_X_IDS){
  assert.equal(isTankBuilderReady(id),false,`${id}: independently demand-loaded`);
  assert.equal(combatAnatomyCalibration(id),null,`${id}: no eager anatomy pack`);
  assert.equal(vehicleMarkingSeats(id),null,`${id}: no eager marking pack`);
}
for(const id of SECOND_WAVE_X_IDS){
  await ensureTankBuilder(id);
  assert.equal(isTankBuilderReady(id),true,`${id}: complete playable loading path`);
  assert.ok(combatAnatomyCalibration(id),`${id}: real generated anatomy group`);
  assert.ok(vehicleMarkingSeats(id),`${id}: real generated marking group`);
  if(id==='leclerc_x')assert.equal(isTankBuilderReady('leclerc_classic_x'),false,
    'the separately requested older Leclerc has its own lazy owner');
  const tank=createTank(id,null,{quality:'low',proceduralOnly:true,geometryReceipt:true});
  try{
    for(const name of ['hull','rig_hull','rig_turret','rig_gun'])
      assert.ok(tank.root.getObjectByName(name),`${id}: loaded native ${name}`);
    if(id==='jpz_e100_x'){
      assert.equal(tank.root.getObjectByName('turret'),undefined,
        'the E100 casemate is fixed hull stock, not a rotating turret');
      const hull=tank.root.getObjectByName('hull');
      hull.geometry.computeBoundingBox();
      assert.ok(hull.geometry.boundingBox.max.y>3.15,
        'the actual tall casemate is included in hull-owned native geometry');
    }else assert.ok(tank.root.getObjectByName('turret'),`${id}: native rotating turret stock`);
    assert.equal(tank.root.getObjectByName('rig_hull').userData.runningGearReceipts.length,1,
      `${id}: one independently authored native running assembly`);
    assert.ok(tank.gunMuzzleWorld(new THREE.Vector3()).toArray().every(Number.isFinite),
      `${id}: loaded actual firing anchor`);
  }finally{tank.dispose();}
}
console.log('sourceXSecondWaveLazy: all23 actual cold-loaded X models, independent Leclerc owners, anatomy/marking packs and firing anchors PASS');
