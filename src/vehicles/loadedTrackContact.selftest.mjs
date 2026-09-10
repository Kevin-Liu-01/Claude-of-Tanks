import assert from 'node:assert/strict';
import {loadedSpanDrop,TRACK_BAND_ENDPOINT_ONE,loadedContactScratch,fitLoadedTrackContact} from './loadedTrackContact.ts';
import {KIT} from './tankFactoryCore.ts';

// Independent dense finite-span check covers each tangent, clipped endpoint,
// reversed span and zero-length/outside case. No production result is used
// as the expected clearance.
let spans=0;
for(const slope of [-1.7,-.4,0,.25,1.2])for(const start of [-2,-.3,.2,2])for(const direction of [-1,1]) {
  const z0=start,z1=start+direction*.8,y0=-.8+slope*z0,y1=-.8+slope*z1;
  const drop=loadedSpanDrop(z0,y0,z1,y1,0,.3,.7);
  for(let i=0;i<=4000;i++) {
    const z=z0+(z1-z0)*i/4000,y=y0+(y1-y0)*i/4000-drop;
    if(Math.abs(z)<.7)assert.ok(y<=.3-Math.sqrt(.49-z*z)+1e-12);
  }
  spans++;
}
assert.equal(loadedSpanDrop(2,0,3,0,0,0,.5),0);
assert.equal(loadedSpanDrop(0,0,0,1,0,0,.5),0);
assert.ok(loadedSpanDrop(-1,-.45,1,-.45,0,0,.5)>.049,'Intersecting chord is rejected');

const points=[[-2,1],[2,1],[2,0],[.3,0],[-.3,0],[-2,0]];
const g=KIT.trackBandGeo(points,.5,.09,.64),rest=g.attributes.position.array.slice();
const a=g.attributes.position.array;
try {
  // Derive endpoint ownership from actual geometry, independently of the
  // table consumed by deformation. This catches the old mismatched sides.
  for(let i=0;i<points.length;i++)for(let k=0;k<24;k++) {
    const base=i*72,at=base+k*3,endpoint=TRACK_BAND_ENDPOINT_ONE[k];
    const outer=base+(endpoint?0:6),inner=base+(endpoint?24:18);
    assert.ok([outer,inner].some(p=>rest[at+1]===rest[p+1]&&rest[at+2]===rest[p+2]),
      `Actual cell ${i} vertex ${k} retains its own cross-section`);
  }
  // An actual deformed band must retain welded duplicate coordinates.
  const wheel={z:0,y:.30,r:.3,voff:-.20};
  const scratch=loadedContactScratch(points.length);
  fitLoadedTrackContact(a,rest,[wheel],.045,scratch);
  const seen=new Map();
  for(let i=0;i<a.length;i+=3) {
    const key=Array.from(rest.slice(i,i+3)).join(',');
    if(seen.has(key))assert.equal(a[i+1],seen.get(key),'No split between duplicate faces');
    seen.set(key,a[i+1]);
  }
  assert.ok(scratch.drop.some(x=>x>.2),'Actual lower run moves below dropped rim');
  for(let i=0;i<72;i++)assert.equal(a[i],rest[i],'Upper return remains fixed');
  a.set(rest);scratch.drop.fill(123);
  fitLoadedTrackContact(a,rest,[],.045,scratch);
  assert.deepEqual(a,rest,'Scratch does not retain previous suspension drops');
}finally{g.dispose();}
console.log('loadedTrackContact:',JSON.stringify({spans,actualCarrierSections:true,closedDeformation:true}));
