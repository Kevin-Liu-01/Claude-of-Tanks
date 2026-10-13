import assert from 'node:assert/strict';
import * as THREE from 'three';
import { auxiliaryState, requestAuxiliary, smokeBlocks, stepRoofGun, auxiliaryShot } from './auxiliarySystems.ts';
import { smokeVolume, SMOKE_WIND_X, SMOKE_WIND_Z } from './smokeScreen.ts';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
function entity(id='a',team='alpha',specId='m1a2'){
 return {id,team,spec:{id:specId,dims:{heightM:2.8},armor:{turretPivot:[0,1.4,0]}},state:{pos:{x:0,y:0,z:0},yaw:0,turretYaw:0,visualPitch:0,visualRoll:0},combat:{destroyed:false,reload:{t:4},ammo:[7,8,9]}};
}
const tank=entity();
assert.equal(auxiliaryState(tank).gunOn,true,'equipped vehicles start with automatic fire enabled');
assert.equal(requestAuxiliary(tank,'roofGun',0),true);
assert.equal(auxiliaryState(tank).gunOn,false,'the first toggle turns the default-on gun off');
assert.equal(requestAuxiliary(tank,'roofGun',0),true);
assert.equal(auxiliaryState(tank).gunOn,true,'the second toggle restores automatic fire');
assert.equal(auxiliaryState(entity('unsupported','alpha','missing')).gunOn,false,'unequipped vehicles stay off');
const aircraft=entity();aircraft.aerial={kind:'gunship'};
assert.equal(stepRoofGun(aircraft,0,1/60,{entities:[],visible:()=>{throw Error('aircraft cannot target with tank equipment');},clear:()=>true}),false);

assert.equal(requestAuxiliary(tank,'smoke',0),true);
const screen=tank.combat.auxiliary.smoke;
assert.equal(requestAuxiliary(tank,'smoke',.1),false);
assert.equal(tank.combat.auxiliary.smokeCharges,2);
const center=smokeVolume(screen,3,-2,{});
const a={x:center.x,y:center.y,z:center.z-20},b={x:center.x,y:center.y,z:center.z+20};
assert.equal(smokeBlocks([screen],a,b,.2),false,'grenades have flight time');
assert.equal(smokeBlocks([screen],a,b,3),true);
assert.equal(smokeBlocks([screen],{...a,y:30},{...b,y:30},3),false,'smoke is not an infinite vertical wall');
assert.equal(smokeBlocks([screen],a,b,19),false,'cover expires');
tank.combat={destroyed:false};
assert.equal(smokeBlocks([screen],a,b,4),true,'match-owned smoke survives the emitting tank respawning');
assert.equal(requestAuxiliary(tank,'lights',2),true);assert.equal(tank.combat.auxiliary.lights,1);
assert.equal(requestAuxiliary(tank,'lightsOff',3),true);assert.equal(tank.combat.auxiliary.lights,0);
for(const now of [0,28,56]) {const fresh=now===0?entity():tank; if(now===0)tank.combat=fresh.combat;assert.equal(requestAuxiliary(tank,'smoke',now),true);}
assert.equal(requestAuxiliary(tank,'smoke',84),false,'three salvos per vehicle life');
tank.combat.destroyed=true;assert.equal(requestAuxiliary(tank,'roofGun',90),false);
assert.equal(requestAuxiliary(entity('unsupported','alpha','missing'),'roofGun',0),false);
// No shooting through unseen enemies, hard cover, or teammates. Main ammunition is independent.
const shooter=entity(),target=entity('b','bravo');target.state.pos.z=100;

const context={entities:[shooter,target],visible:()=>false,clear:()=>true};
for(let i=0;i<120;i++)assert.equal(stepRoofGun(shooter,i/60,1/60,context),false);
context.visible=()=>true;context.clear=()=>false;
assert.equal(stepRoofGun(shooter,3,1/60,context),false);
context.clear=()=>true;
const ally=entity('friend');ally.state.pos.z=50;context.entities.push(ally);
for(let i=0;i<120;i++)assert.equal(stepRoofGun(shooter,3+i/60,1/60,context),false);
context.entities.pop();let fired=0;
for(let i=0;i<600;i++)if(stepRoofGun(shooter,5+i/60,1/60,context))fired++;
assert.ok(fired>=20&&fired<=30,`finite five-round bursts: ${fired}`);
assert.deepEqual(shooter.combat.ammo,[7,8,9]);assert.equal(shooter.combat.reload.t,4);
requestAuxiliary(shooter,'roofGun',20);assert.equal(stepRoofGun(shooter,21,1/60,context),false);
// Independent geometry math: a tilted, scaled station emits from the same
// hierarchy as the visible mesh, including turret yaw and pitch trunnion.
const scaled=entity('scaled','alpha','cv90');scaled.state.visualPitch=.14;scaled.state.visualRoll=-.08;scaled.state.yaw=.2;scaled.state.turretYaw=-.12;
context.entities=[scaled,target];
let didFire=false;for(let i=0;i<500&&!didFire;i++)didFire=stepRoofGun(scaled,i/60,1/60,context);
assert.ok(didFire);const gun=AUXILIARY_INVENTORY.cv90.guns[0],state=auxiliaryState(scaled);
const hull=new THREE.Group(),turret=new THREE.Group(),mount=new THREE.Group(),pitch=new THREE.Group();
hull.rotation.set(-scaled.state.visualPitch,scaled.state.yaw,scaled.state.visualRoll,'YXZ');
turret.position.fromArray(AUXILIARY_INVENTORY.cv90.turretPivot);turret.rotation.y=scaled.state.turretYaw;hull.add(turret);
mount.position.fromArray(gun.position);mount.quaternion.fromArray(gun.rotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),state.gunYaw));mount.scale.fromArray(gun.scale);turret.add(mount);
pitch.position.fromArray(gun.pivot);pitch.rotation.x=-state.gunPitch;mount.add(pitch);hull.updateMatrixWorld(true);
const actual=new THREE.Vector3().fromArray(gun.muzzle).sub(new THREE.Vector3().fromArray(gun.pivot)).applyMatrix4(pitch.matrixWorld);
assert.ok(actual.distanceTo(auxiliaryShot.origin)<1e-6,'authoritative muzzle matches the articulated rendered muzzle');
console.log('auxiliarySystems: smoke lifetime/charges/height, explicit lamps, target visibility, friendly lanes, burst cadence and scaled/sloped muzzle parity PASS');

const start={...smokeVolume(screen,screen.born+4,-2,{})};
const later={...smokeVolume(screen,screen.born+12,-2,{})};
assert.ok(Math.abs(later.x-start.x-SMOKE_WIND_X*8)<1e-9);
assert.ok(Math.abs(later.z-start.z-SMOKE_WIND_Z*8)<1e-9);
assert.equal(smokeVolume(screen,screen.born+.5,-2,{}).density,0,'no instant wall before grenades arrive');
assert.ok(smokeVolume(screen,screen.born+16,-2,{}).density<start.density,'smoke thins before expiration');
assert.equal(smokeBlocks([screen],{x:later.x,y:later.y,z:later.z-10},{x:later.x,y:later.y,z:later.z+10},screen.born+12),true);
assert.equal(smokeBlocks([screen],{x:later.x,y:later.y+9,z:later.z-10},{x:later.x,y:later.y+9,z:later.z+10},screen.born+12),false);

// Authority and visible lobes use the same destination terrain, including a
// hillside higher or lower than the tank which fired the smoke canisters.
for (const elevation of [-8, 8]) {
  const ground = (x,z) => elevation + z*.04;
  const v = smokeVolume(screen,screen.born+4,-2,{},ground);
  const a={x:v.x,y:v.y,z:v.z-10},b={x:v.x,y:v.y,z:v.z+10};
  assert.ok(Math.abs(v.y-(ground(v.x,v.z)+1.4+(4-screen.canisters[screen.banks[0]][6])*.055))<1e-9);
  assert.equal(smokeBlocks([screen],a,b,screen.born+4,ground),true,'terrain-seated visible smoke blocks sight');
  assert.equal(smokeBlocks([screen],{...a,y:v.y+9},{...b,y:v.y+9},screen.born+4,ground),false,'clear air above the bank stays visible');
}

// The mount can see past an edge while its articulated muzzle is obstructed.
// Visibility from the pivot alone must never authorize that shot.
const edgeShooter=entity('edge');
const edgeTarget=entity('edge-target','bravo');edgeTarget.state.pos.z=100;

let pivotZ=null, blockedMuzzles=0;
const edgeContext={entities:[edgeShooter,edgeTarget],visible:()=>true,clear:from=>{
  if(pivotZ===null)pivotZ=from.z;
  if(Math.abs(from.z-pivotZ)>.05){blockedMuzzles++;return false;}
  return true;
}};
for(let i=0;i<300;i++)assert.equal(stepRoofGun(edgeShooter,i/60,1/60,edgeContext),false);
assert.ok(blockedMuzzles>0,'clear pivot does not bypass a blocked moving muzzle');
console.log('auxiliarySystems: actual muzzle obstruction veto PASS');

// Same-caliber mounts must retain their own cartridge identity when different
// vehicles fire consecutively; the emitted shell is also the hit-feed source.
for (const [id, name] of [
  ['m1a2', '12.7×99 mm M2 AP'],
  ['t90a_x', '12.7×108 mm B-32 API'],
  ['ztz100_x', '12.7×108 mm Type 54 API'],
  ['vt4a1', '12.7×108 mm Type 54 API'],
  ['t14_x', '7.62×54R mm B-32 API'],
  ['challenger2e', '7.62×51 mm M61 AP'],
  ['t14', '30×165 mm 3UBR6 AP-T'],
  ['abramsx', '30×113 mm M789 HEDP'],
  // 2026-10-09 (owner order): the TTS carries its 30 mm station again and its M2 on the loader's ring; the M2 (its first
  // gun) fires first here
  ['m551a1_tts', '12.7×99 mm M2 AP'],
  ['m1a2', '12.7×99 mm M2 AP'],
]) {
  const namedShooter=entity('named','alpha',id), namedTarget=entity('named-target','bravo');
  namedTarget.state.pos.z=100;

  const namedContext={entities:[namedShooter,namedTarget],visible:()=>true,clear:()=>true};
  let emitted=false;
  for(let i=0;i<600&&!emitted;i++)emitted=stepRoofGun(namedShooter,i/60,1/60,namedContext);
  assert.ok(emitted,id+' emits named ammunition');
  assert.equal(auxiliaryShot.shell.name,name,id+' uses its own cartridge');
  assert.deepEqual(namedShooter.combat.ammo,[7,8,9]);
  assert.equal(namedShooter.combat.reload.t,4);
}
console.log('auxiliarySystems: vehicle-specific cartridge names and independent main ammo PASS');
