import assert from 'node:assert/strict';
import { weaponHitKind } from '../game/weaponHitKind.ts';
import { shouldShowShotReadout, keepMissileDirectHit, MissileBlastLedger } from './shotReadoutPolicy.ts';
for (const caliberMm of [7.62,12.7,14.5]) assert.equal(weaponHitKind({caliberMm}),'machineGun');
for (const caliberMm of [20,25,30,57,120]) assert.equal(weaponHitKind({caliberMm}),'cannon');
for (const caliberMm of [undefined,NaN,0]) assert.equal(weaponHitKind({caliberMm}),'cannon','legacy events retain old treatment');
assert.equal(weaponHitKind({guided:true,shellType:'HEAT',caliberMm:150}),'missile','missiles are not identified by their localized names');
const hit={targetId:'enemy1',attackerId:'me',caliberMm:12.7,shellName:'M2',damage:.4,kind:'pen'};
for (const caliberMm of [7.62, 12.7, 20, 30, 40, 50, 57]) {
 for (const kind of ['nonpen','ricochet','era','spaced_absorb','screen_pierce','he_splash']) {
  assert.equal(shouldShowShotReadout({...hit,caliberMm,kind}),false, `${caliberMm} ${kind} leaves main card intact`);
 }
 for (const kind of ['pen','he_pen']) assert.equal(shouldShowShotReadout({...hit,caliberMm,kind,damage:0}),true,
  'penetrations remain eligible even when only modules are damaged');
}
for (const caliberMm of [60, 76, 90, 120, undefined])
 assert.equal(shouldShowShotReadout({...hit,caliberMm,kind:'ricochet'}),true,'main/legacy gun feedback unchanged');
assert.equal(shouldShowShotReadout({...hit,guided:true,kind:'he_splash'}),true,'missiles keep their readout');
const direct={...hit,guided:true,shellId:9,caliberMm:150,damage:400};
const splash={...direct,kind:'he_splash',targetId:'enemy2',damage:120};
assert.equal(keepMissileDirectHit(direct,splash),true);
assert.equal(keepMissileDirectHit(direct,{...splash,shellId:10}),false);
assert.equal(keepMissileDirectHit(direct,{...splash,attackerId:'other'}),false);
assert.equal(keepMissileDirectHit(splash,direct),false,'direct impact replaces an earlier splash receipt');
assert.equal(keepMissileDirectHit({...direct,shellId:undefined},{...splash,shellId:undefined}),false);
const blasts=new MissileBlastLedger();blasts.record(direct);assert.equal(blasts.get(direct),null);
blasts.record(splash);blasts.record({...splash,targetId:'enemy3',damage:30});
assert.deepEqual(blasts.get(direct),{targets:2,damage:150});
assert.equal(blasts.get({...direct,attackerId:'other'}),null);
for(let i=10;i<20;i++)blasts.record({...splash,shellId:i});
assert.equal(blasts.get(direct),null,'blast history is bounded');
blasts.clear();assert.equal(blasts.get({...splash,shellId:19}),null);
console.log('shotReadoutPolicy: weapon identity, penetration-only automatic fire and direct-hit/splash priority PASS');
