import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {tankDisplayName} from './tankLabels.ts';
import {createTank} from './tankFactory.ts';
import {getSpec,TANK_SPECS} from './specs.ts';
import {applyVehicleSizePolicy,VEHICLE_SIZE_FACTORS} from './vehicleSizePolicy.ts';
import {synchronizeSuppliedSourceCombatMetadata} from './suppliedSourceFleetSpecs.ts';
import {synchronizeSecondWaveXCombatMetadata} from './sourceXSecondWaveSpecs.ts';
for(const [id,name] of Object.entries({k21_x:'K21',cv90105_tml_x:'CV90105 TML',cv90_x:'CV9040C',cv90_mkiv_x:'CV90 Mk 4',sabra_mk2_x:'Sabra Mk 2',kf41_lynx_x:'KF41 Lynx',spz_puma_s1_x:'Puma S1',ajax_x:'Ajax',griffin50_x:'Griffin 50 mm',spz_puma_s1:'SPz Wotan',marder2:'Marder 2'}))assert.equal(tankDisplayName(getSpec(id)),name,`${id}: owner-selected roster identity`);
const before=JSON.parse(readFileSync(new URL('./vehicleSizeBaseline.fixture.json',import.meta.url)));
const near=(a,b,label,tolerance=.00002)=>assert.ok(Math.abs(a-b)<tolerance,`${label}: ${a} != ${b}`);
// f88172442 measurements, taken before the owner's 2026-09-29 size request.
// These cover finished shell stock, pivots, muzzle and load-bearing contact.
// Upiór's baseline is its complete 0857fff5c AFV builder before the 2026-09-30
// enlargement, measured with the current shared factory and no size override.
// 2026-10-08: c6b60311c (main) rebuilt the KF41 Lynx X turret front after these
// measurements; its turret max z is re-measured as the current build / factor.
for(const [id,b] of Object.entries(before)){
 if(id==='upior')continue; // rebuilt turret/course covered by escortModernization.selftest
 const factor=VEHICLE_SIZE_FACTORS[id];
 const spec=getSpec(id);
 for(const key of Object.keys(b.dims))near(spec.dims[key],b.dims[key]*factor,`${id}/${key}`);
 for(const quality of ['high','low']){
  const t=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality});
  try{
   t.root.updateMatrixWorld(true);
   for(const name of ['rig_hull','rig_turret','rig_gun','rig_recoil'])assert.deepEqual(t.root.getObjectByName(name).scale.toArray(),[1,1,1]);
   for(const [name,box] of Object.entries(b.boxes)){
    const mesh=t.root.getObjectByName(name);assert.ok(mesh,`${id}/${name}`);mesh.geometry.computeBoundingBox();
    for(const side of ['min','max'])mesh.geometry.boundingBox[side].toArray().forEach((v,k)=>near(v,box[side][k]*factor,`${id}/${quality}/${name}/${side}/${k}`,quality==='low'?.015:.00002));
   }
   for(const [name,key] of [['rig_turret','turret'],['rig_gun','gun']])t.root.getObjectByName(name).position.toArray().forEach((v,k)=>near(v,b[key][k]*factor,`${id}/${key}/${k}`));
   // 2026-10-04 (aa5fdca05): the published track run is read off the drawn band, not the profile's pinned flat run the
   // f88172442 fixture measured, so its length and centre follow the spec's published contact (the combat anatomy's
   // 4-decimal receipt of this build); the band's width and floor still scale with the size factor.
   for(const key of ['halfWidM','bottomYM'])near(t.contactGeom[key],b.contact[key]*factor,`${id}/contact/${key}`);
   for(const key of ['halfLenM','zCenterM'])near(t.contactGeom[key],spec.armor.trackContact[key],`${id}/contact/${key} (published)`,.00006);
   t.gunMuzzleWorld(new THREE.Vector3()).toArray().forEach((v,k)=>near(v,b.muzzle[k]*factor,`${id}/muzzle/${k}`));
   const yaw=t.root.getObjectByName('rig_turret'),pitch=t.root.getObjectByName('rig_gun');
   for(const angle of [-Math.PI/2,Math.PI/2,Math.PI]){
    yaw.rotation.y=angle;pitch.rotation.x=-.1;t.root.updateMatrixWorld(true);
    const mouth=t.gunMuzzleWorld(new THREE.Vector3());assert.ok(mouth.toArray().every(Number.isFinite));
    for(let i=0;i<(spec.gun.launcherMuzzles?.length??0);i++){
     const declared=spec.gun.launcherMuzzles[i],owner=declared.frame==='turret'?yaw:pitch;
     const expected=owner.localToWorld(new THREE.Vector3(declared.x,declared.y,declared.z));
     assert.ok(t.gunMuzzleWorld(new THREE.Vector3(),i,true).distanceTo(expected)<.00001,`${id}: launcher ${i} follows the resized tube`);
    }
   }
   t.resetForGaragePresentation();assert.deepEqual(t.root.scale.toArray(),[1,1,1]);
  }finally{t.dispose();}
 }
}
const dims=JSON.stringify(Object.keys(VEHICLE_SIZE_FACTORS).map(id=>getSpec(id).dims));
applyVehicleSizePolicy(TANK_SPECS);
assert.equal(JSON.stringify(Object.keys(VEHICLE_SIZE_FACTORS).map(id=>getSpec(id).dims)),dims);
const installed=Object.fromEntries(Object.keys(VEHICLE_SIZE_FACTORS).map(id=>[id,JSON.stringify([getSpec(id).armor,getSpec(id).gun.launcherMuzzles])]));
for(let i=0;i<2;i++){
 synchronizeSuppliedSourceCombatMetadata();synchronizeSecondWaveXCombatMetadata();
 for(const id of Object.keys(VEHICLE_SIZE_FACTORS))assert.equal(JSON.stringify([getSpec(id).armor,getSpec(id).gun.launcherMuzzles]),installed[id],`${id}: donor refresh preserves the installed frame`);
}
await import('./fleetFactory.ts');
for(const id of Object.keys(VEHICLE_SIZE_FACTORS))assert.equal(JSON.stringify([getSpec(id).armor,getSpec(id).gun.launcherMuzzles]),installed[id],`${id}: both entry points preserve installed dimensions`);
console.log('vehicleSize: retained resize fixtures, high/low stock, articulation, launch exits and idempotence pass');
