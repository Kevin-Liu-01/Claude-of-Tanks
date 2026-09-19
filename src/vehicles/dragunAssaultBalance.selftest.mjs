import assert from 'node:assert/strict';
import './tankFactory.ts';
import { getSpec } from './specs.ts';
import { synchronizeSuppliedSourceCombatMetadata } from './suppliedSourceFleetSpecs.ts';
import { createCombatState, startReload, tickReload } from '../sim/damage.ts';
import { totalAmmunitionCapacity } from '../sim/ammunition.ts';

const spec=getSpec('bmp3m_dragun125_x'), mbt=getSpec('ztz99a2');
const originalPeer=JSON.stringify(mbt);
assert.equal(spec.gun.caliberMm,125);
assert.deepEqual(spec.gun.shells.map(s=>[s.type,s.caliberMm,s.count]),[['APFSDS',125,24],['HEAT',125,10],['HE',125,6]]);
assert.ok(spec.gun.shells.every(s=>!s.guided && !s.launcherTubes),'three real main-gun channels');
assert.equal(totalAmmunitionCapacity(createCombatState(spec)),40);
assert.equal(spec.gun.autoloader,undefined,'continuous 125 mm cycle, no borrowed burst magazine');
const plate=(name)=>spec.armor.hullPlates.find(p=>p.name===name);
assert.deepEqual([plate('upper_glacis').physicalMm,plate('upper_glacis').keMm,plate('upper_glacis').ceMm],[45,75,100]);
assert.ok(spec.armor.hullPlates.filter(p=>p.name.startsWith('hull_side')).every(p=>p.physicalMm===25));
assert.ok(![...spec.armor.hullPlates,...spec.armor.turretPlates].some(p=>p.kind==='era'),'light assault chassis has no borrowed reactive armor');
assert.equal(spec.hp,1850);assert.ok(spec.hp<mbt.hp*.75,'substantially less durability than its gun peer');
assert.ok(spec.enginePowerHp/spec.weightTons>mbt.enginePowerHp/mbt.weightTons);
assert.equal(spec.topSpeedKmh,72);assert.equal(spec.reverseSpeedKmh,30);
assert.ok(spec.hullTraverseDegS>mbt.hullTraverseDegS && spec.gun.aimTimeS<mbt.gun.aimTimeS);
assert.ok(spec.gun.bloom.move>mbt.gun.bloom.move && spec.gun.bloom.afterShot>mbt.gun.bloom.afterShot,
  'mobility does not grant MBT stabilization: stop to use the faster aiming cycle');
assert.ok(spec.gun.shells[0].dmg/spec.gun.reloadS>mbt.gun.shells[0].dmg/mbt.gun.reloadS);
for(let i=0;i<spec.gun.shells.length;i++){
 const state=createCombatState(spec);state.shellSlot=i;startReload(state,spec);
 assert.equal(state.reload.totalS,5.4);tickReload(state,5.39);assert.ok(state.reload.t>0);
 tickReload(state,.02);assert.equal(state.reload.t,0);
}
const balance=()=>JSON.stringify({hp:spec.hp,gun:spec.gun,armor:[...spec.armor.hullPlates,...spec.armor.turretPlates].map(p=>[p.name,p.physicalMm,p.keMm,p.ceMm]),weight:spec.weightTons,power:spec.enginePowerHp});
const once=balance();synchronizeSuppliedSourceCombatMetadata();assert.equal(balance(),once,'metadata refresh does not stack or restore the gun donor balance');
assert.equal(JSON.stringify(mbt),originalPeer,'the source gun peer remains untouched');
console.log('Dragun assault balance PASS: thin armor/1850 HP, mobile chassis, stop-and-fire tradeoff, 40 actual rounds and three 5.4 s reload channels');
