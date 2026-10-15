import * as THREE from 'three';
import { writeFileSync, readFileSync } from 'node:fs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { ALL_TANK_IDS } from '../src/vehicles/specs.ts';
import { smokeSocketsFor } from '../src/vehicles/vehicleAuxiliaryGeometry.ts';
// 2026-10-08: each launcher's tubes fan across its side's arc as the real launchers do (src/vehicles/smokeFan.ts)
import { fanSmokeMounts } from '../src/vehicles/smokeFan.ts';
const check=process.argv.includes('--check');
// Functional smoke pins (2026-10-07, coordinator ruling on the tank-accessories lane): a decor rebuild must not change
// a vehicle's gameplay counts. Round 2 moved the decor smoke banks into the functional decor group, so the M2A2
// Bradley's second visual bank began registering launch sockets (14 -> 20). The bank stays as decor. The salvo keeps
// its pre-round-2 count: the authored fittings' sockets first, then the decor sockets in build order, cut at the pin.
const FUNCTIONAL_SMOKE_PIN={m2a2_bradley:14};
const rows={}; const bad=[];const missing=[];
// VH.14 (coordinator ruling 2026-10-14: "roof weapons match the real vehicle and every drawn gun works"): every drawn
// weapon fitting outside the main gun's rig that is not a working station (no remote-control datum on it or an
// ancestor) is recorded, so roofWeaponPolicy.selftest can fail on a decorative gun.
const WEAPON_FITTINGS=new Set(['pintleMG','openYokeRws','weaponStationMount','auxiliaryWeapon']);
const inert={};
const stationOf=o=>{for(let p=o;p;p=p.parent)if(p.userData?.remoteControlled&&p.userData?.auxiliaryPivot)return p;return null;};
const gunOwned=o=>{for(let p=o;p;p=p.parent)if(p.name==='rig_gun'||p.name==='rig_recoil')return true;return false;};
const round=a=>a.map(x=>+x.toFixed(4));
for(const id of ALL_TANK_IDS){
 const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,decor:true});
 tank.root.updateMatrixWorld(true);
 const hull=tank.root.getObjectByName('rig_hull'), turret=tank.root.getObjectByName('rig_turret');
 const smoke=[], guns=[];
 const drawn=[];
 tank.root.traverse(o=>{
  let owner='hull', parent=o; while(parent){if(parent===turret)owner='turret';parent=parent.parent;}
  if(o.userData.fittingRoot&&WEAPON_FITTINGS.has(o.userData.fitting)&&o.userData.hasWeapon!==false&&!stationOf(o)&&!gunOwned(o))
   drawn.push({name:o.name,fitting:o.userData.fitting,caliberMm:o.userData.caliberMm??null,owner});
  const rig=owner==='turret'?turret:hull;
  const m=new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(o.matrixWorld);
  // Authority articulates an unscaled hull/turret frame. Bake authored rig
  // scale and fixed offsets into each aperture instead of stripping them out.
  const smokeFrame=new THREE.Matrix4().copy(tank.root.matrixWorld).invert().multiply(o.matrixWorld);
  if(owner==='turret')smokeFrame.premultiply(new THREE.Matrix4().makeTranslation(-turret.position.x,-turret.position.y,-turret.position.z));
  for(const socket of smokeSocketsFor(o)){
   const p=new THREE.Vector3(...socket.position).applyMatrix4(smokeFrame), d=new THREE.Vector3(...socket.direction).transformDirection(smokeFrame);
   smoke.push({owner,position:round(p.toArray()),direction:round(d.toArray())});
   if(d.z<-.001||d.y<-.001)bad.push({id,position:round(p.toArray()),direction:round(d.toArray())});
  }
  if(!o.userData.primaryWeapon&&o.userData.remoteControlled&&o.userData.firingAxis==='+Z'&&o.userData.hasWeapon!==false){
   if(!o.userData.auxiliaryPivot || !Number.isFinite(o.userData.muzzleLocalZ)) { missing.push({id,name:o.name}); return; }
   const pitch=o.getObjectByName('auxiliaryWeaponPitch'), collisionParts=[];
   if(pitch){
    const inv=new THREE.Matrix4().copy(pitch.matrixWorld).invert();
    pitch.traverse(mesh=>{
     if(!mesh.isMesh||!mesh.geometry)return;
     mesh.geometry.computeBoundingBox();
     const box=mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().copy(inv).multiply(mesh.matrixWorld));
     if(!box.isEmpty())collisionParts.push({min:round(box.min.toArray()),max:round(box.max.toArray())});
    });
   }
   guns.push({collisionParts,name:o.name,owner,position:round(new THREE.Vector3().setFromMatrixPosition(m).toArray()),caliberMm:o.userData.caliberMm||12.7,muzzle:o.userData.auxiliaryMuzzle??[0,o.userData.barrelAxisLocalY,o.userData.muzzleLocalZ],pivot:o.userData.auxiliaryPivot,scale:new THREE.Vector3().setFromMatrixScale(m).toArray(),rotation:new THREE.Quaternion().setFromRotationMatrix(m.clone().extractRotation(m)).toArray(),...(o.userData.yawArc?{yawArc:o.userData.yawArc.map(v=>Math.round(v*1e4)/1e4)}:{}),...(o.userData.depressionByYaw?{depressionByYaw:o.userData.depressionByYaw.map(([y,d])=>[Math.round(y*1e4)/1e4,Math.round(d*1e4)/1e4])}:{})});
  }
 });
 // The working roof gun is a vehicle's heaviest station. The sim, the presentation, combat anatomy, bots and the HUD
 // drive only guns[0], which was the first station in scene-graph order, so build order alone picked it. On the
 // M551A1 TTS (the only vehicle with two stations) the 12.7 mm roof M2 was built first and fired, while the 30 mm never
 // aimed or fired. 2026-10-12 owner order: "make the big roof autocannon on the m551 tts the autocannon, not the tiny
 // machine gun in front of the cupola". The sort is stable, so equal calibres keep build order and every one-station
 // vehicle is unchanged.
 guns.sort((a,b)=>b.caliberMm-a.caliberMm);
 if(FUNCTIONAL_SMOKE_PIN[id]!==undefined){
  if(smoke.length<FUNCTIONAL_SMOKE_PIN[id])throw new Error(`${id}: ${smoke.length} smoke sockets, below its functional pin ${FUNCTIONAL_SMOKE_PIN[id]}`);
  smoke.length=FUNCTIONAL_SMOKE_PIN[id];
 }
 rows[id]={turretPivot:round(turret.position.toArray()),smoke:fanSmokeMounts(id,smoke),guns,lights:!!tank.root.userData.nightLightCoverage?.headlights};
 if(!rows[id].lights)missing.push({id,name:'driving lights'});
 if(drawn.length)inert[id]=drawn;
 tank.dispose?.();
}
const output=`// Generated from authored fittings by tools/vehicle-controls-inventory.mjs.\nimport type { AuxiliaryInventory } from './auxiliaryInventory.ts';\nexport const AUXILIARY_INVENTORY: Readonly<Record<string, AuxiliaryInventory>> = ${JSON.stringify(rows)};\n`;
// Combat anatomy reads only each vehicle's first roof gun, and only when it has collision parts (the damageable
// external module): a small table, so the spec finalizer keeps the mount geometry above out of the garage boot.
const roofGuns=Object.fromEntries(Object.entries(rows).filter(([,kit])=>kit.guns[0]?.collisionParts?.length).map(([id,kit])=>[id,kit.guns[0]]));
const roofGunOutput=`// Generated by tools/vehicle-controls-inventory.mjs: each vehicle's first roof gun when it has collision parts.\n// Combat anatomy reads this table; the battle path keeps the full mount geometry in src/vehicles/auxiliaryInventory.generated.ts.\nimport type { AuxiliaryInventory } from './auxiliaryInventory.ts';\nexport const AUXILIARY_ROOF_GUNS: Readonly<Record<string, AuxiliaryInventory['guns'][number]>> = ${JSON.stringify(roofGuns)};\n`;
// The garage only shows which controls a vehicle has (FE-P2): counts, not the mount geometry above.
const summary=Object.fromEntries(Object.entries(rows).map(([id,kit])=>[id,[kit.smoke.length,kit.lights?1:0,kit.guns.length]]));
const summaryOutput=`// Generated by tools/vehicle-controls-inventory.mjs: per vehicle [smoke launchers, driving lights (0|1), roof guns].\n// The garage reads these counts; the battle path keeps the mount geometry in src/vehicles/auxiliaryInventory.generated.ts.\nexport const GARAGE_AUXILIARY_SUMMARY: Readonly<Record<string, readonly [smoke: number, lights: 0 | 1, guns: number]>> = ${JSON.stringify(summary)};\n`;
if(bad.length||missing.length)throw new Error(JSON.stringify({bad,missing}));
const inertOutput=`// Generated by tools/vehicle-controls-inventory.mjs: drawn weapon fittings that are not working stations (VH.14).\n// roofWeaponPolicy.selftest fails on any entry: every drawn gun works, and a vehicle whose real counterpart carries no\n// roof weapon draws none (src/vehicles/roofWeaponPolicy.ts).\nexport const INERT_DRAWN_WEAPONS: Readonly<Record<string, readonly { name: string; fitting: string; caliberMm: number | null; owner: 'hull' | 'turret' }[]>> = ${JSON.stringify(inert)};\n`;
for(const [path,text] of [['src/vehicles/auxiliaryInventory.generated.ts',output],['src/vehicles/inertDrawnWeapons.generated.ts',inertOutput],
 ['src/vehicles/auxiliaryRoofGuns.generated.ts',roofGunOutput],['src/ui/garageAuxiliarySummary.generated.ts',summaryOutput]]) {
 if(check){if(readFileSync(path,'utf8')!==text)throw new Error(`${path} is stale; run tools/vehicle-controls-inventory.mjs`);}
 else writeFileSync(path,text);
}
console.log(JSON.stringify({tanks:Object.keys(rows).length,smoke:Object.values(rows).filter(x=>x.smoke.length).length,guns:Object.entries(rows).filter(([,x])=>x.guns.length).map(([id,x])=>[id,x.guns]),bad},null,2));
