import assert from 'node:assert/strict';
import { accumulateDamage, canAccumulateDamage } from './damageNumberBurst.ts';
const hit={targetId:'enemy1',attackerId:'me',caliberMm:12.7,shellName:'M2',shellType:'AP',damage:.4};
let burst;
for(let i=0;i<100;i++)burst=accumulateDamage(burst,hit,i*20);
assert.ok(Math.abs(burst.damage-40)<1e-8,'rapid hits accumulate fractional damage before rounding');
const first=burst;
burst=accumulateDamage(burst,{...hit,modulesHit:[{newState:'red'}]},2000);
assert.equal(burst,first);assert.equal(burst.critical,true);
assert.equal(accumulateDamage(burst,{...hit,damage:0},2020),null,'blocks do not add a zero number');
assert.equal(accumulateDamage(burst,{...hit,damage:NaN},2020),null);
for(const patch of [{targetId:'enemy2'},{attackerId:'other'},{caliberMm:30},{shellName:'other'},{shellType:'HE'},{guided:true}])
 assert.equal(canAccumulateDamage(burst,{...hit,...patch},2050),false,'identity changes never mix totals');
assert.equal(canAccumulateDamage(burst,hit,1950),false,'backwards time starts fresh');
assert.equal(canAccumulateDamage(burst,hit,3000),false,'a firing pause starts fresh');
assert.notEqual(accumulateDamage(burst,hit,3000),burst);
const cannon={...hit,caliberMm:120,damage:400};
assert.equal(canAccumulateDamage(accumulateDamage(undefined,cannon,0),cannon,20),false,'main gun shots stay separate');
for(const caliberMm of [20,30,40,50,57]) {
 const auto={...hit,caliberMm,damage:45};const a=accumulateDamage(undefined,auto,0);
 assert.equal(accumulateDamage(a,auto,100).damage,90,'autocannons accumulate');
}
console.log('damageNumberBurst: fractional totals, critical retention, target/weapon isolation, expiry and non-damage passed');
