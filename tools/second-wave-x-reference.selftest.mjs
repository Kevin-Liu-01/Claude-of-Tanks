import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SECOND_WAVE_X_REFERENCE_OVERRIDES as refs} from './second-wave-x-reference-overrides.ts';
import {SOURCE_WORLD_FRAMES} from './source-world-registration.mjs';
for(const id of Object.keys(refs))assert.ok(SOURCE_WORLD_FRAMES[id],`${id}: a prepared metre oracle must never silently fall back to width fitting`);
const classicTurret=new RegExp(refs.leclerc_classic_x.glb.turretNode);
const classicGun=new RegExp(refs.leclerc_classic_x.glb.gunNode);
for(const n of [187,677,689,725,728,799,859,865,875])
  assert.ok(classicTurret.test(`Object_${n}`),'older Leclerc complete turret owner');
for(const n of [173,191,197,229,692,712,714,723,861,863,877,935])
  assert.equal(classicTurret.test(`Object_${n}`),false,'older Leclerc non-turret owner');
for(const n of [714,715,717,719,720,722,723])assert.ok(classicGun.test(`Object_${n}`));
for(const n of [187,712,725,728])assert.equal(classicGun.test(`Object_${n}`),false);
assert.equal(classicGun.test('Object_689'),false,'fused fixed mantlet is never cut out of turret689');
assert.equal(refs.leclerc_classic_x.glb.directGunComponentMasks,false);
assert.equal(refs.leclerc_classic_x.glb.componentMasks,true);
assert.notEqual(refs.leclerc_classic_x.glb.gunComponentMasks,false,'a real exposed gun remains scored');
// Independent literal source-export owner names. Dots in original DCC mesh
// names are removed by the exporter; a successful pose certificate does not
// prove that a regexp selected the actual casting.
const turret=new RegExp(refs.chieftain_mk10_x.glb.turretNode);
for(const name of ['bone_turret_39_net_c_c_0', ...Array.from({length:9},(_,i)=>
  `bone_turret_3900${i+1}_chieftain_mk_10_${i===2?'add':'turret'}_c_0`)]) {
  assert.ok(turret.test(name),`complete original turret owner missing: ${name}`);
}
for(const name of ['root_7_net_c_c_0','wheel_l_front_83_chieftain_mk_10_body_c_0',
  'turret_barrel_rifled_barrel_b_c_0','ex_armor_body_l_04_28_chieftain_mk_10_body_c_0']) {
  assert.equal(turret.test(name),false,`wrong moving owner: ${name}`);
}
const gun=new RegExp(refs.chieftain_mk10_x.glb.gunNode);
for(const name of ['gun_barrel_44_chieftain_mk_10_gun_c_0','turret_barrel_chieftain_mk_10_gun_c_0','turret_barrel_rifled_barrel_b_c_0'])assert.ok(gun.test(name));
const html=fs.readFileSync(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
const gunBlock=html.slice(html.indexOf('let gunMetric ='),html.indexOf('// Show the exact masks'));
const selectGun=new Function('source','gunComponentMasksAvailable','compare','refGun','procGun',
  'renderMask',`${gunBlock}; return {gunMetric,scoredGunMasks};`);
const refExposed={area:1013},nativeExposed={area:1017};let comparisons=0;
const selected=selectGun(refs.leclerc_classic_x,true,(a,b)=>{
  assert.equal(a,refExposed);assert.equal(b,nativeExposed);comparisons++;return {score:97};
},refExposed,nativeExposed,()=>assert.fail('fused-source Classic cannot use direct gun subtrees'));
assert.equal(comparisons,1,'the actual HTML scores Classic exposed gun exactly once, never N/A');
assert.equal(selected.gunMetric.score,97);
assert.deepEqual(selected.scoredGunMasks,{ref:refExposed,proc:nativeExposed});
assert.ok(/compare\(scoredGunMasks\.ref,\s*scoredGunMasks\.proc\)/.test(html),'gun score uses selected direct masks');
assert.ok(/overlayCanvas\('gun profile',\s*scoredGunMasks\.ref,\s*scoredGunMasks\.proc,\s*gunMetric\)/.test(html),'gun board displays exactly the same masks as the score');
console.log('second-wave reference: complete canonical owners and scored/displayed gun mask agreement pass');
