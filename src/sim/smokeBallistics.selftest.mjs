import assert from 'node:assert/strict';
import * as THREE from 'three';
import { requestAuxiliary, smokeBlocks } from './auxiliarySystems.ts';
import { smokeCanisterPosition, SMOKE_GRAVITY_MPS2, SMOKE_LAUNCH_SPEED_MPS, SMOKE_CANISTER_RADIUS_M } from './smokeBallistics.ts';
import { smokeVolume, smokeBankCount } from './smokeScreen.ts';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { createSpottingSystem } from './spotting.ts';

let tubes=0;
for(const [id,kit] of Object.entries(AUXILIARY_INVENTORY)) {
 if(!kit.smoke.length)continue;
 for(const slope of [0,.12,-.12]) {
  const ground=(x,z)=>slope*z;
  const tank={id,team:'a',spec:{id,dims:{heightM:2.6},armor:{turretPivot:[0,1.5,0]}},
   state:{pos:{x:0,y:0,z:0},yaw:.35,turretYaw:-.7,visualPitch:.1,visualRoll:-.04},combat:{}};
  assert.equal(requestAuxiliary(tank,'smoke',10,ground),true);
  const screen=tank.combat.auxiliary.smoke;
  const hull=new THREE.Group(),turret=new THREE.Group();
  hull.rotation.set(-.1,.35,-.04,'YXZ');turret.rotation.y=-.7;turret.position.set(0,1.5,0);hull.add(turret);hull.updateMatrixWorld(true);
  assert.equal(screen.canisters.length,kit.smoke.length);
  for(let i=0;i<kit.smoke.length;i++){
   const socket=kit.smoke[i],frame=socket.owner==='turret'?turret:hull,shot=screen.canisters[i];
   const origin=new THREE.Vector3(...socket.position).applyMatrix4(frame.matrixWorld);
   const direction=new THREE.Vector3(...socket.direction).transformDirection(frame.matrixWorld);
   assert.ok(origin.distanceTo(new THREE.Vector3(...shot.slice(0,3)))<1e-9,`${id}: authored aperture`);
   assert.ok(direction.distanceTo(new THREE.Vector3(...shot.slice(3,6)).normalize())<1e-9,`${id}: authored launch axis`);
   assert.ok(Math.abs(Math.hypot(...shot.slice(3,6))-SMOKE_LAUNCH_SPEED_MPS)<1e-9);
   const t=shot[6]*.5,p=smokeCanisterPosition(shot,t,{});
   assert.ok(Math.abs(p.y-(shot[1]+shot[4]*t-.5*SMOKE_GRAVITY_MPS2*t*t))<1e-9);
   const landing=smokeCanisterPosition(shot,shot[6],{});
   assert.ok(Math.abs(landing.y-ground(landing.x,landing.z)-SMOKE_CANISTER_RADIUS_M)<.002,`${id}: terrain contact`);
   const before=smokeCanisterPosition(shot,Math.max(0,shot[6]-.001),{});
   assert.ok(before.y>=ground(before.x,before.z)+SMOKE_CANISTER_RADIUS_M-.002,`${id}: first contact`);
   assert.deepEqual(smokeCanisterPosition(JSON.parse(JSON.stringify(shot)),t,{}),p,'wire round-trip preserves trajectory');
   tubes++;
  }
  for(let bank=-2;bank<smokeBankCount(screen)-2;bank++){
   const shot=screen.canisters[screen.banks[bank+2]],age=shot[6]+3;
   assert.equal(smokeVolume(screen,screen.born+shot[6]-.01,bank,{},ground).density,0,'no invisible optical cover before impact');
   const v=smokeVolume(screen,screen.born+age,bank,{},ground);
   const a={x:v.x,y:v.y,z:v.z-15},b={x:v.x,y:v.y,z:v.z+15};
   assert.equal(smokeBlocks([screen],a,b,screen.born+age,ground),true,'visible landing smoke blocks sight');
   assert.equal(smokeBlocks([screen],a,b,screen.born+19,ground),false,'expired smoke clears sight');
  }
 }
}
// Test the actual spotting owner, not only the volume intersection helper.
const shooter={id:'shooter',team:'player',spec:{id:'m1a3',dims:{heightM:2.6},armor:{turretPivot:[0,1.5,0]}},state:{pos:{x:0,y:0,z:0},yaw:0,turretYaw:0},combat:{}};
requestAuxiliary(shooter,'smoke',0,()=>0);
const screen=shooter.combat.auxiliary.smoke,v=smokeVolume(screen,5,-2,{},()=>0);
const viewer={...shooter,id:'viewer',state:{pos:{x:v.x,y:0,z:v.z-100}}};
const enemy={...shooter,id:'enemy',team:'enemy',state:{pos:{x:v.x,y:0,z:v.z+100}}};
for(const blocked of [true,false]){
 const spotting=createSpottingSystem({getTanks:()=>[viewer,enemy],opticalBlocked:(a,b)=>blocked&&smokeBlocks([screen],a,b,5,()=>0)});
 spotting.forceCheck(5);
 assert.equal(spotting.isSpotted(enemy.id,viewer.team,viewer),!blocked,'deployed smoke changes actual target acquisition');
}
console.log(`smokeBallistics: ${tubes} fleet/slope launches, real socket axes, terrain contact, wire parity and spotting passed`);

const {packSmokeScreen,restoreSmokeScreen}=await import('./smokeReceipt.ts');
const packed=packSmokeScreen(screen);
assert.equal(packed.canisters,undefined,'wire receipt contains no repeated world transforms');
assert.strictEqual(packSmokeScreen(screen),packed,'immutable salvos pack once');
const restored=restoreSmokeScreen(JSON.parse(JSON.stringify(packed)));
assert.equal(restored.canisters.length,screen.canisters.length);
for(let i=0;i<screen.canisters.length;i++){
 const a=smokeCanisterPosition(screen.canisters[i],screen.canisters[i][6],{}),b=smokeCanisterPosition(restored.canisters[i],restored.canisters[i][6],{});
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.025,'compact snapshot lands within 2.5 cm of authority');
}
