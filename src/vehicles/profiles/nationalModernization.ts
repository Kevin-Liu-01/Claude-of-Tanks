import {addRearFieldStowage} from './rearFieldStowage.ts';
import {addFieldRoofCage} from './fieldRoofCage.ts';
import {addMissionAttachmentReceiver} from '../missionAttachmentReceiver.ts';
// Native hulls and fenders remain recognizable beneath national modernization
// packages. Country modules own cast-turret proportions, armor and equipment.
import {KIT} from './kit.ts';
import {buildT80UXRunningGear,buildT80UXFenders,buildT80UXHullCore} from './t80uX.ts';
import {buildT72B3MXRunningGear,buildT72B3MXFenders,buildT72B3MXHullCore} from './t72b3mX.ts';
import {buildT72B3XRunningGear,buildT72B3XFenders,buildT72B3XHullCore} from './t72b3X.ts';
import {buildNationalUkraine} from './nationalUkraine.ts';
import {buildNationalPoland} from './nationalPoland.ts';
import {buildNationalRussia} from './nationalRussia.ts';
import {buildHetmanII} from './hetmanII.ts';
import {buildZubrII} from './zubrII.ts';
import {NATIONAL_LEGACY_CONFIG} from '../nationalLegacyConfig.ts';
import {boxSections} from './measuredPrimitives.ts';
import {nationalCupolaPintle,nationalPintleSocket,nationalRoofWeapon} from './nationalRoofWeapon.ts';
import {nationalRoofSystems} from './nationalRoofSystems.ts';
import {NATIONAL_ROOF_LOADOUTS} from '../nationalRoofConfig.ts';
import {NATIONAL_MODERNIZATION_CONFIG,type NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import {nationalModernizationDesign,NATIONAL_GUN_PIVOT,NATIONAL_BARREL_LENGTH} from '../nationalModernizationDesign.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addNationalMantlet,nationalGland} from './nationalMantlet.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import {buildT72B3MXHull} from './t72b3mX.ts';
import {buildZubrIIHull} from './zubrII.ts';
import {buildNationalDonorTurret,donorTurretSeatY,nationalDonorTurret} from './nationalDonorTurret.ts';
import {addRearSlopeFuelDrums} from './rearSlopeFuelDrums.ts';
import {buildUkraineDonorKit,buildHetmanIIDonorKit} from './ukraineDonorTurretKit.ts';
import {buildPolandDonorKit,buildZubrIIDonorKit} from './polandDonorTurretKit.ts';
import {buildChinaDonorKit} from './chinaDonorTurretKit.ts';
import {steppedBuilder,type TankProfileBuild} from '../tankBuildCooperation.ts';
import {addGunFloodlight,type GunFloodlightSeat} from './gunFloodlight.ts';
import {buildLongweiTurret} from './longwei.ts';
import {chinaDonorHull} from './nationalChina.ts';
import {LONGWEI_FAMILY} from '../longweiFamilyConfig.ts';
const {box,cylY,cylX,cylZ}=KIT;

function mainWeapon(P:TankBuilderPort,c:NationalModernizationConfig|Pick<NationalModernizationConfig,'package'>):void {
 P.gunG.position.set(...NATIONAL_GUN_PIVOT);
 const fitted='model' in c;
 if(fitted)addNationalMantlet(P,c);
 else {
 // The closed mantlet sleeve and trunnion move with pitch; only the barrel
 // slides under recoil. Its rear lies inside the open cheek throat.
 P.add('gunMount',cylX(.245,.84,32),0,0,-.06);
 // A full-width rotating shield follows the cheek throat with a 9 mm side
 // seam. The old narrow sleeve left 125 mm of daylight on either side.
 // Pitch changes Y/Z only, so these side clearances remain constant.
 P.add('gunMount',boxSections([[-.27,.371,.285,-.285],[.47,.371,.25,-.25],[.65,.365,.21,-.21],[.79,.20,.17,-.17]]));
 for(const side of [-1,1])P.add('gunMountDark',cylX(.276,.020,32),side*.367,0,-.04);
 // The rear dust seal and front cuff share the elevating owner. Neither is
 // a fixed cap across the gun's depression/elevation corridor.
 P.add('gunMountCanvasSkin',boxSections([[-.29,.369,.28,-.28],[-.20,.369,.28,-.28]]));
 nationalGland(P,.785,.045);
 }
 KIT.buildGun(P,{len:NATIONAL_BARREL_LENGTH,r:.105,baseR:.14,sleeve:false,collar:false});
 for(const [start,end,r]of [[.37,1.80,.139],[1.87,3.04,.126],[3.12,3.61,.161],[3.67,4.89,.118]])
  P.add('gun',cylZ(r,end-start,32),0,0,(start+end)/2);
 for(const z of [.48,1.72,2.95,3.69,4.84])P.add('gunDark',cylZ(.144,.027,28),0,0,z);
 P.addEquipment('gun',box(.035,.039,.74),0,.154,3.37);
 // A national mantlet collar changes the shield outline without changing its
 // articulation owner or masking the intentional clearance at the cheeks.
 if(!fitted&&c.package==='pl')P.add('gunMount',box(.72,.51,.09),0,0,.30);
 if(!fitted&&c.package==='cn')P.add('gunMount',boxSections([[.28,.368,.264,-.255],[.57,.36,.23,-.23]]));
 if(!fitted&&c.package==='ru')P.add('gunMount',cylZ(.229,.15,32),0,0,.65);
 P.muzzleZ=NATIONAL_BARREL_LENGTH;
}
/** Owner 2026-10-15 (VEH-19..VEH-22): the donor fleet turret on this hull, its remote station on the commander's
 * cupola (replacing the donor's own commander gun), then the country's hull package and turret up-armour. */
function* fitDonorTurret(P:TankBuilderPort,id:string,kit:()=>TankProfileBuild):TankProfileBuild {
 const d=buildNationalDonorTurret(P,id),l=NATIONAL_ROOF_LOADOUTS[id],[x,z]=d.station;
 // the donor turret, its station and the kit's stages each a slice of the factory's stepped build (UI-LOCKDOWN E)
 yield 'donor-turret';
 if(l.mount==='pintle'){
  // Release 227: a classic emplacement on the commander's cupola. Its flange sits 2 mm into the cupola's own top (the
  // highest permanent surface inside the 0.10 m foot, never the periscopes beyond it). Round 4 (critics D10, S1): with a
  // rim socket it sits 2 mm into the socket post's collar at the cupola's rim instead, off the hatch lid.
  const base=(d.socket?nationalPintleSocket(P,[x,donorTurretSeatY(P,x,z),z],d.socket):donorTurretSeatY(P,x,z,.10))-.002;
  nationalCupolaPintle(P,[x,base,z],l);
  P.turretG.userData.nationalDonorStation={seat:[x,base,z],loadout:l.name,emplacement:true};
 }else{
  // The pedestal stands on the cupola's own top (or the roof seat the donor row lists): probes stay inside its rim.
  const base=donorTurretSeatY(P,x,z,.12);
  nationalRoofWeapon(P,[x,base,z],null,l);
  P.turretG.userData.nationalDonorStation={seat:[x,base,z],loadout:l.name};
 }
 yield 'donor-station';
 yield* kit();
 P.topY=d.roofY;
}

// 2026-10-24 (the owner: "make the husarz and wilk and zoria ... have floodlights at front by guns"): a gun floodlight
// right of the gun (gunFloodlight.ts), its back 6-7 cm ahead of both the cheek armour's front beside the gun (gun frame
// 0.69, 0.74, 0.88) and the mantlet's nose with its gland (0.71, 0.75, 0.99), its bracket's foot in the nose 19 cm off
// the bore (the gland's collar is 18.1 cm)
const NATIONAL_GUN_FLOODLIGHTS:Readonly<Record<string,GunFloodlightSeat>>={
 t80u_husarz:{side:'right',x:.40,y:.02,backZ:.77,anchorX:.19,anchorY:.05,anchorZ:.64},
 t72b3m_wilk:{side:'right',x:.40,y:.02,backZ:.81,anchorX:.19,anchorY:.05,anchorZ:.68},
 t80u_zoria:{side:'right',x:.40,y:.02,backZ:1.05,anchorX:.19,anchorY:.05,anchorZ:.92},
};

// 2026-10-26 (owner): two fuel drums across the upper rear slope, on the Bulat-M and Bastion-M (the markup's plate) and,
// beside their back drums, on the Qilin, Kunlun and Yun (rearSlopeFuelDrums.ts)
const REAR_SLOPE_DRUM_IDS=new Set(['t72b3m_bulat_m','t72b3_bastion_m','t72b3_qilin','t72b3m_kunlun','t80u_yun']);

function* build(P:TankBuilderPort,c:NationalModernizationConfig):TankProfileBuild {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
 P.hullG.position.set(0,0,0);P.turretG.position.set(.008,c.y,c.z);
 if(c.model===0){buildT80UXRunningGear(P);yield 'running-gear';buildT80UXHullCore(P);yield 'hull-core';buildT80UXFenders(P);}
 else if(c.model===1){buildT72B3MXRunningGear(P);yield 'running-gear';buildT72B3MXHullCore(P);yield 'hull-core';buildT72B3MXFenders(P);}
 else {buildT72B3XRunningGear(P);yield 'running-gear';buildT72B3XHullCore(P);yield 'hull-core';buildT72B3XFenders(P);}
 yield 'fenders';
 const donor=nationalDonorTurret(c.id);
 if(donor){
  yield* fitDonorTurret(P,c.id,()=>({ua:buildUkraineDonorKit,pl:buildPolandDonorKit,cn:buildChinaDonorKit} as const)[c.package as 'ua'|'pl'|'cn'](P,c));
  // The Chinese concepts keep their rear field rack (cans and unditching log) on the native transom.
  if(c.package==='cn')addRearFieldStowage(P,true);
  if(REAR_SLOPE_DRUM_IDS.has(c.id))addRearSlopeFuelDrums(P);
  P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,model:c.model,revision:7,concept:true,
   preserved:'native-hull-core-running-gear-and-fenders',primaryHull:'donor-with-add-on-modernization',
   primaryTurret:`${donor.donor}-turret-with-national-up-armour`,turretDonor:donor.donor};
  return;
 }
 // Release 227: every Chinese concept carries a donor fleet turret (nationalDonorTurrets.ts); the cast CN turrets are gone.
 if(c.package==='cn')throw new Error(`${c.id}: the Chinese concepts carry donor turrets (nationalDonorTurrets.ts)`);
 ({ua:buildNationalUkraine,pl:buildNationalPoland,ru:buildNationalRussia}[c.package])(P,c);
 yield 'national-package';
 P.add('turret',cylY(.94,.94,.20,64),0,.005,0);
 mainWeapon(P,c);
 const floodlight=NATIONAL_GUN_FLOODLIGHTS[c.id];
 if(floodlight)addGunFloodlight(P,floodlight);
 yield 'main-weapon';
 const d=nationalModernizationDesign(c),l=NATIONAL_ROOF_LOADOUTS[c.id];
 nationalRoofSystems(P,l);nationalRoofWeapon(P,d.rws,d.cupola,l);
 if(c.package==='ua')addFieldRoofCage(P);
 // Zoria's roof gun sweeps all of its roof inboard of the left cage wing, so
 // its drone rides on a receiver laid across that wing (missionAttachmentReceiver.ts).
 if(c.id==='t80u_zoria')addMissionAttachmentReceiver(P,'t80u_zoria');
 if(c.id==='t72b3m_bulat_m')addRearFieldStowage(P,false);
 if(REAR_SLOPE_DRUM_IDS.has(c.id))addRearSlopeFuelDrums(P);
 P.topY=nationalModernizationDesign(c).roofY;
 P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,model:c.model,revision:6,concept:true,
  preserved:'native-hull-core-running-gear-and-fenders',primaryHull:'donor-with-add-on-modernization',primaryTurret:'cast-ancestry-with-national-armor'};
}
/** Release 264 (owner 2026-10-28): the Longwei family's two members on the Qilin's T-72B3 and the Kunlun's T-72B3M
 * (longweiFamilyConfig.ts): the native hull, running gear and fenders, the host's Chinese hull package and rear rack, and a
 * modernized Longwei turret on the host's Type 96B ring. The hosts' upper-slope drums are left off: the Longwei's long
 * bustle overhangs that slope (critic round 1: the bustle and its screen rode on the drums' tops). */
function* buildLongweiFamily72(P:TankBuilderPort,m:(typeof LONGWEI_FAMILY)[number]):TankProfileBuild {
 addVehicleGhillieSuit(P);
 const c=NATIONAL_MODERNIZATION_CONFIG.find(x=>x.id===m.host);
 if(!c)throw new Error(`${m.id}: host ${m.host} is not a national modernization`);
 P.hullG.position.set(0,0,0);
 if(c.model===1){buildT72B3MXRunningGear(P);yield 'running-gear';buildT72B3MXHullCore(P);yield 'hull-core';buildT72B3MXFenders(P);}
 else {buildT72B3XRunningGear(P);yield 'running-gear';buildT72B3XHullCore(P);yield 'hull-core';buildT72B3XFenders(P);}
 yield 'fenders';
 chinaDonorHull(P,c);
 yield 'chinese-hull';
 addRearFieldStowage(P,true);
 buildLongweiTurret(P,m.kit);
 P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,model:c.model,revision:1,concept:true,
  preserved:'native-hull-core-running-gear-and-fenders',primaryHull:'donor-with-add-on-modernization',
  primaryTurret:'modernized-longwei-turret',turretDonor:'ztz99_longwei',host:m.host};
}
const LONGWEI_FAMILY_72_PROFILES=Object.fromEntries(LONGWEI_FAMILY.filter(m=>m.host==='t72b3_qilin'||m.host==='t72b3m_kunlun')
 .map(m=>[m.id,{build:steppedBuilder((P:TankBuilderPort)=>buildLongweiFamily72(P,m))}]));

export const NATIONAL_MODERNIZATION_PROFILES={
 ...LONGWEI_FAMILY_72_PROFILES,
 ...Object.fromEntries(NATIONAL_MODERNIZATION_CONFIG.map(c=>[c.id,{build:steppedBuilder((P:TankBuilderPort)=>build(P,c))}])),
 ...Object.fromEntries(NATIONAL_LEGACY_CONFIG.map(c=>[c.id,{build:steppedBuilder(function*(P:TankBuilderPort):TankProfileBuild{
   const donor=nationalDonorTurret(c.id);
   if(donor){
    P.hullG.position.set(0,0,0);
    if(c.package==='ua'){
     // Hetman II (as buildHetmanII): the native T-72B3M hull, then its own heavy hull package (the kit). Release 227: its
     // own frontal package (ukraineFrontEra.ts) replaces the native glacis Relikt, skirt boxes and glacis lamps; the deck
     // cover strap in its mantlet's sweep is left off.
     buildT72B3MXHull(P,{nativeEra:false,glacisLamps:false,sweptStrap:false});
     yield 'hull';
     yield* fitDonorTurret(P,c.id,()=>buildHetmanIIDonorKit(P));
    }else{
     buildZubrIIHull(P);
     yield 'hull';
     yield* fitDonorTurret(P,c.id,()=>buildZubrIIDonorKit(P));
    }
    P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,revision:3,concept:true,
     preserved:'native-hull-and-national-hull-package',primaryTurret:`${donor.donor}-turret-with-national-up-armour`,
     turretDonor:donor.donor};
    return;
   }
   (c.package==='ua'?buildHetmanII:buildZubrII)(P);
   // Hetman II owns its deeper bearing; Zubr II shares the compact ring.
   if(c.package==='pl')P.add('turret',cylY(.94,.94,.20,64),0,.005,0);
   mainWeapon(P,c);
   const l=NATIONAL_ROOF_LOADOUTS[c.id];
   nationalRoofSystems(P,l);nationalRoofWeapon(P,c.design.rws,c.design.cupola,l);
   if(c.package==='ua')addFieldRoofCage(P);
   P.topY=c.design.roofY;
   P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,revision:2,concept:true,
     preserved:'earlier-welded-turret-concept-lineage',primaryTurret:'independent-national-welded-turret'};
 })}])),
};
