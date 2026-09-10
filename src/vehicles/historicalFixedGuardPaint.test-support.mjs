// Restore only the declared fixed-sheet finish for a legacy whole-model
// fingerprint. Actual receiving surfaces and ballistics use the painted tank.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildLeclercX} from './profiles/leclercX.ts';
import {AMX40_X_PROFILES} from './profiles/amx40X.ts';
import {buildLeopard2A6X} from './profiles/leopardA6X.ts';
import {buildType10X} from './profiles/type10X.ts';
import {beforeFixedStockPaint} from './fixedStockPaintHistory.test-support.mjs';
import {historicalType10Skirt} from './type10SkirtHistory.test-support.mjs';

const cases = {
  leclerc_x: {build:buildLeclercX, source:'leclercXSourceFittings.ts',
    label:'leclerc-fixed-bow-guard', names:['leclerc_x_bow_guard_-1','leclerc_x_bow_guard_1']},
  amx40_x: {build:AMX40_X_PROFILES.amx40_x.build, source:'amx40XHullSkirts.ts',
    label:'amx40-fixed-folded-skirt', names:['amx40-x-aft-skin','amx40-x-fore-apron',
      'amx40-x-aft-skin','amx40-x-fore-apron']},
  leo2a6_x: {build:buildLeopard2A6X, source:'leopardA6X.ts',
    label:'a6-fixed-front-guard', names:['a6x_front_guard_-1','a6x_front_guard_1'],
    equipmentLabel:'a6-fixed-upper-sheet',equipmentCount:6},
  type10_x: {build:buildType10X, source:['type10X.ts','type10XSkirts.ts'],names:[],
    equipmentLabel:['type10-painted-folded-skirt','type10-painted-upper-fascia','type10-painted-rear-fascia'],equipmentCount:14},
};
const keys=['fixedPaintedPanel','materialOnlyPaintMigration','materialOnlyPaintSourceBucket'];

export function withHistoricalFixedGuardPaint(id, build) {
  const row=cases[id];assert.ok(row,'Only declared fixed-bodywork finish migrations');
  // Authenticate the complete source against independently committed pre-paint
  // bytes, not a newly refreshed recipe or a wildcard material-name exclusion.
  for(const source of [row.source].flat())
    beforeFixedStockPaint(source,readFileSync(new URL('./profiles/'+source,import.meta.url),'utf8'));
  const names=[];let equipment=0,foldedSkirts=0;
  registerProfiledBuilders({[id]:P=>row.build(new Proxy(P,{get(target,key){
    if(key!=='addMudguard'&&key!=='addEquipment')return Reflect.get(target,key);
    return(...args)=>{
      const bucketIndex=key==='addMudguard'?1:0;
      let geometry=args[bucketIndex+1];
      const guard=key==='addMudguard'&&row.names.includes(args[0]);
      const sheet=key==='addEquipment'&&row.equipmentLabel
        &&[row.equipmentLabel].flat().includes(geometry.userData.fixedPaintedPanel);
      if(guard||sheet){
        assert.equal(args[bucketIndex],'hullPaintedDetail');
        if(guard)assert.equal(geometry.userData.fixedPaintedPanel,row.label);
        else assert.ok([row.equipmentLabel].flat().includes(geometry.userData.fixedPaintedPanel));
        assert.equal(geometry.userData.materialOnlyPaintMigration,true);
        assert.equal(geometry.userData.materialOnlyPaintSourceBucket,'hullDetail');
        if(id==='type10_x'&&geometry.userData.fixedPaintedPanel==='type10-painted-folded-skirt') {
          geometry=historicalType10Skirt(geometry,foldedSkirts++);
          args[bucketIndex+1]=geometry;
        }
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
    assert.equal(foldedSkirts,id==='type10_x'?10:0,'Only the ten Type 10 folded skirts restore historical stations');
    assert.equal(equipment,row.equipmentCount??0,'Every declared sheet exactly once');return result;}
  finally{registerProfiledBuilders({[id]:row.build});}
}
