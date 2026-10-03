import assert from 'node:assert/strict';
import {aerialTracerProfile,aerialTracerWidth,aerialTracerLength} from './aerialTracers.ts';
const cannon=aerialTracerProfile('gunship-cannon'),heavy=aerialTracerProfile('gunship-howitzer'),missile=aerialTracerProfile('gunship-missile');
assert.equal(aerialTracerProfile('main'),null);assert.equal(aerialTracerProfile(),null);
assert.ok(heavy.width>cannon.width && missile.headScale>cannon.headScale,'weapons have distinct silhouettes, even in monochrome');
for(const p of [cannon,heavy,missile]){
 for(const range of [0,.1,2,50,250,1000,5000]){
  const width=aerialTracerWidth(p,range,1.9);
  assert.ok(width>=p.width && width<=p.maxWidth);
  assert.ok(aerialTracerWidth(p,range,12)<=width,'zoom never makes the projectile oversized');
  const length=aerialTracerLength(p,1300,range);
  assert.ok(length<=range && length<=p.maxLength,'wake cannot precede launch or become a full flight-path laser');
 }
}
assert.ok(aerialTracerLength(cannon,1300,250)>18,'autocannon is readable at high altitude');
assert.ok(aerialTracerLength(heavy,800,250)>aerialTracerLength(cannon,1300,250),'heavy shell leaves a longer wake');
console.log('aerialTracers: weapon profiles, zoom-aware bounds and launch clipping passed');
