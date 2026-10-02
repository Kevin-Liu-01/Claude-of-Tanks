import assert from 'node:assert/strict';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildT90AWX} from './profiles/t90AwX.ts';
import {buildT72BUX} from './profiles/t72buX.ts';
import {buildT62MV1X} from './profiles/t62mv1X.ts';

// The declared fixed sheets each profile paints as bodywork; withHistoricalFixedSkirtFinish builds the CURRENT profile
// with only those sheets routed back to rubber (a live counterfactual). 2026-10-01 (frozen pins retired): the pinned
// pre-finish profile source digests and their authentication replay (verifyHistoricalFixedSkirtSource) are gone.
export const FIXED_SOURCE_SKIRTS=Object.freeze({
  t90_x:{build:buildT90AWX,label:'t90-aw-x-fixed-skirt',count:8},
  t72bu_x:{build:buildT72BUX,label:'t72bu-x-side-leaf',count:12},
  t62mv1_x:{build:buildT62MV1X,label:'t62mv1-x-skirt',count:20},
});

export function withHistoricalFixedSkirtFinish(id,build,wrapBuilder=builder=>builder){
  const row=FIXED_SOURCE_SKIRTS[id];assert.ok(row);let sheets=0;
  registerProfiledBuilders({[id]:wrapBuilder(P=>row.build(new Proxy(P,{get(target,key){
    if(key!=='addMudguard')return Reflect.get(target,key);
    return(label,bucket,g,...pose)=>{
      if(label===row.label){
        assert.equal(bucket,'hullFixedPaintedBodywork');assert.equal(g.userData.fixedPaintedPanel,label);
        assert.equal(g.userData.materialOnlyPaintSourceBucket,'hullRubber');
        assert.equal(g.userData.materialOnlyPaintMigration,true);sheets++;
        g.userData={...g.userData};
        for(const key of ['fixedPaintedPanel','materialOnlyPaintSourceBucket','materialOnlyPaintMigration'])delete g.userData[key];
        bucket='hullRubber';
      }
      return target.addMudguard(label,bucket,g,...pose);
    };
  }})))});
  try{const tank=build();try{assert.equal(sheets,row.count,'only declared fixed sheets have a finish inverse');return tank;}
    catch(error){tank.dispose();throw error;}}
  finally{registerProfiledBuilders({[id]:row.build});}
}
