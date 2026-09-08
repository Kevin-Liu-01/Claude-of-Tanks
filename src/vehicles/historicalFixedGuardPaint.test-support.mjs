// Restore only the declared fixed-sheet finish for a legacy whole-model
// fingerprint. Actual receiving surfaces and ballistics use the painted tank.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildLeclercX} from './profiles/leclercX.ts';
import {AMX40_X_PROFILES} from './profiles/amx40X.ts';
import {buildLeopard2A6X} from './profiles/leopardA6X.ts';
import {beforeFixedStockPaint} from './fixedStockPaintHistory.test-support.mjs';

const cases = {
  leclerc_x: {build:buildLeclercX, source:'leclercXSourceFittings.ts',
    label:'leclerc-fixed-bow-guard', names:['leclerc_x_bow_guard_-1','leclerc_x_bow_guard_1']},
  amx40_x: {build:AMX40_X_PROFILES.amx40_x.build, source:'amx40XHullSkirts.ts',
    label:'amx40-fixed-folded-skirt', names:['amx40-x-aft-skin','amx40-x-fore-apron',
      'amx40-x-aft-skin','amx40-x-fore-apron']},
  leo2a6_x: {build:buildLeopard2A6X, source:'leopardA6X.ts',
    label:'a6-fixed-front-guard', names:['a6x_front_guard_-1','a6x_front_guard_1'],
    equipmentLabel:'a6-fixed-upper-sheet',equipmentCount:6},
};
const keys=['fixedPaintedPanel','materialOnlyPaintMigration','materialOnlyPaintSourceBucket'];

export function withHistoricalFixedGuardPaint(id, build) {
  const row=cases[id];assert.ok(row,'Only the three declared fixed-guard finish migrations');
  // Authenticate the complete source against independently committed pre-paint
  // bytes, not a newly refreshed recipe or a wildcard material-name exclusion.
  beforeFixedStockPaint(row.source,readFileSync(new URL('./profiles/'+row.source,import.meta.url),'utf8'));
  const names=[];let equipment=0;
  registerProfiledBuilders({[id]:P=>row.build(new Proxy(P,{get(target,key){
    if(key!=='addMudguard'&&key!=='addEquipment')return Reflect.get(target,key);
    return(...args)=>{
      const bucketIndex=key==='addMudguard'?1:0,geometry=args[bucketIndex+1];
      const guard=key==='addMudguard'&&row.names.includes(args[0]);
      const sheet=key==='addEquipment'&&row.equipmentLabel
        &&geometry.userData.fixedPaintedPanel===row.equipmentLabel;
      if(guard||sheet){
        assert.equal(args[bucketIndex],'hullPaintedDetail');
        assert.equal(geometry.userData.fixedPaintedPanel,guard?row.label:row.equipmentLabel);
        assert.equal(geometry.userData.materialOnlyPaintMigration,true);
        assert.equal(geometry.userData.materialOnlyPaintSourceBucket,'hullDetail');
        if(guard)names.push(args[0]);else equipment++;
        args[bucketIndex]='hullDetail';
        geometry.userData={...geometry.userData};
        for(const metadata of keys)delete geometry.userData[metadata];
      }
      return target[key](...args);
    };
  }}))});
  try{const result=build();
    assert.deepEqual(names,row.names,'Every declared guard exactly once, in original order');
    assert.equal(equipment,row.equipmentCount??0,'Only the six declared A6 upper sheets');return result;}
  finally{registerProfiledBuilders({[id]:row.build});}
}
