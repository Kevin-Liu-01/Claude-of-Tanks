import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTank} from './tankFactory.ts';
import {geometryFingerprint} from './tankAssets.ts';
import {authenticateT90MLampHistory,withHistoricalT90MLamps,assertCurrentT90MLampSeats} from './historicalT90MLamps.test-support.mjs';
import {vehicleNightLightEmittersFor} from './vehicleNightLighting.ts';

const source=readFileSync(new URL('./profiles/t90.ts',import.meta.url),'utf8');
authenticateT90MLampHistory(source);
assert.throws(()=>authenticateT90MLampHistory(source.replace('0.132','0.133')),'Unexpected lamp offset cannot be erased');
assert.throws(()=>authenticateT90MLampHistory(source+'\n'),'Undeclared source differences cannot be erased');
const rows=[];
for(const quality of ['high','low']){
  const opts={proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242};
  const current=createTank('t90m',null,opts),historical=withHistoricalT90MLamps(()=>createTank('t90m',null,opts));
  try{
    const actual=geometryFingerprint(current.root),old=geometryFingerprint(historical.root);
    assert.notEqual(actual,old,'Actual mounted lamps are a physical change, not an ignored shader attribute');
    if(quality==='high')assert.equal(old,'8cbee6a8','Independent pre-X golden is preserved unchanged');
    rows.push({quality,current:actual,historical:old,actualLampPositions:assertCurrentT90MLampSeats(current)});
    let lamp;current.root.traverse(m=>{lamp??=vehicleNightLightEmittersFor(m).find(l=>l.kind==='headlight');});
    const direction=lamp.direction;
    try{lamp.direction=[direction[0],Math.abs(direction[1]),direction[2]];
      assert.throws(()=>assertCurrentT90MLampSeats(current),/downward road aim/,'An upward optical beam remains a real failure');
    }finally{lamp.direction=direction;}
    try{const [x,y,z]=direction,c=Math.cos(.01),s=Math.sin(.01);lamp.direction=[x*c+z*s,y,z*c-x*s];
      assert.throws(()=>assertCurrentT90MLampSeats(current),/physical aperture azimuth/,'A real azimuth error cannot pass the Float32 cap tolerance');
    }finally{lamp.direction=direction;}
  }finally{current.dispose();historical.dispose();}
}
console.log(JSON.stringify({pass:true,repairCommit:'37de0b6aa784f17c9491949ce92d7bdf979ff7a6',rows}));
