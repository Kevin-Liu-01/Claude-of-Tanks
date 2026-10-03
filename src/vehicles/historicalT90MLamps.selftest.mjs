import assert from 'node:assert/strict';
import {createTank} from './tankFactory.ts';
import {assertCurrentT90MLampSeats} from './historicalT90MLamps.test-support.mjs';
import {vehicleNightLightEmittersFor} from './vehicleNightLighting.ts';

// 2026-10-01 (owner: retire frozen pins): the pinned post-lamp profile source digest, the historical
// lamp-pose inverse and the pre-X golden are gone. What remains is the live physical contract for the
// four reseated T-90M headlights (repair 37de0b6aa) and the negative controls proving it bites.
const rows=[];
for(const quality of ['high','low']){
  const current=createTank('t90m',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  try{
    rows.push({quality,actualLampPositions:assertCurrentT90MLampSeats(current)});
    let lamp;current.root.traverse(m=>{lamp??=vehicleNightLightEmittersFor(m).find(l=>l.kind==='headlight');});
    const direction=lamp.direction;
    try{lamp.direction=[direction[0],Math.abs(direction[1]),direction[2]];
      assert.throws(()=>assertCurrentT90MLampSeats(current),/downward road aim/,'An upward optical beam remains a real failure');
    }finally{lamp.direction=direction;}
    try{const [x,y,z]=direction,c=Math.cos(.01),s=Math.sin(.01);lamp.direction=[x*c+z*s,y,z*c-x*s];
      assert.throws(()=>assertCurrentT90MLampSeats(current),/physical aperture azimuth/,'A real azimuth error cannot pass the Float32 cap tolerance');
    }finally{lamp.direction=direction;}
    assertCurrentT90MLampSeats(current);
  }finally{current.dispose();}
}
console.log(JSON.stringify({pass:true,repairCommit:'37de0b6aa784f17c9491949ce92d7bdf979ff7a6',rows}));
