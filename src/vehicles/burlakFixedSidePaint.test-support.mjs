// Historical geometry hashes include merged bucket ownership and UVs. Restore
// only the eight declared fixed-sheet material buckets for that legacy check;
// current physical/ballistic rays still use the real painted native tank.
import assert from 'node:assert/strict';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildT90BurlakX} from './profiles/t90BurlakX.ts';

export function withHistoricalBurlakSideFinish(build){
  let sheets=0;
  registerProfiledBuilders({t90a_burlak_x:P=>buildT90BurlakX(new Proxy(P,{get(target,key){
    if(key!=='addMudguard')return Reflect.get(target,key);
    return(label,bucket,...args)=>{
      if(label==='burlak-x-fixed-skirt'){
        const g=args[0],side=Math.sign(args[1]);sheets++;
        assert.equal(bucket,side<0?'hullTrackGuardL':'hullTrackGuardR');
        assert.equal(g.parameters.width,.011);assert.equal(g.parameters.height,.5801);
        bucket='hullRubber';
      }
      return target.addMudguard(label,bucket,...args);
    };
  }}))});
  try{const result=build();assert.equal(sheets,8,'only eight declared material changes are inverted');return result;}
  finally{registerProfiledBuilders({t90a_burlak_x:buildT90BurlakX});}
}
