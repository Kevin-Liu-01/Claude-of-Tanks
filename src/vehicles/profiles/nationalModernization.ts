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
import {buildUkraineDonorKit,buildHetmanIIDonorKit} from './ukraineDonorTurretKit.ts';
import {buildPolandDonorKit,buildZubrIIDonorKit} from './polandDonorTurretKit.ts';
import {buildChinaDonorKit} from './chinaDonorTurretKit.ts';
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
function fitDonorTurret(P:TankBuilderPort,id:string,kit:()=>void):void {
 const d=buildNationalDonorTurret(P,id),l=NATIONAL_ROOF_LOADOUTS[id],[x,z]=d.station;
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
 kit();
 P.topY=d.roofY;
}

function build(P:TankBuilderPort,c:NationalModernizationConfig):void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
 P.hullG.position.set(0,0,0);P.turretG.position.set(.008,c.y,c.z);
 if(c.model===0){buildT80UXRunningGear(P);buildT80UXHullCore(P);buildT80UXFenders(P);}
 else if(c.model===1){buildT72B3MXRunningGear(P);buildT72B3MXHullCore(P);buildT72B3MXFenders(P);}
 else {buildT72B3XRunningGear(P);buildT72B3XHullCore(P);buildT72B3XFenders(P);}
 const donor=nationalDonorTurret(c.id);
 if(donor){
  fitDonorTurret(P,c.id,()=>({ua:buildUkraineDonorKit,pl:buildPolandDonorKit,cn:buildChinaDonorKit} as const)[c.package as 'ua'|'pl'|'cn'](P,c));
  // The Chinese concepts keep their rear field rack (cans and unditching log) on the native transom.
  if(c.package==='cn')addRearFieldStowage(P,true);
  P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,model:c.model,revision:7,concept:true,
   preserved:'native-hull-core-running-gear-and-fenders',primaryHull:'donor-with-add-on-modernization',
   primaryTurret:`${donor.donor}-turret-with-national-up-armour`,turretDonor:donor.donor};
  return;
 }
 // Release 227: every Chinese concept carries a donor fleet turret (nationalDonorTurrets.ts); the cast CN turrets are gone.
 if(c.package==='cn')throw new Error(`${c.id}: the Chinese concepts carry donor turrets (nationalDonorTurrets.ts)`);
 ({ua:buildNationalUkraine,pl:buildNationalPoland,ru:buildNationalRussia}[c.package])(P,c);
 P.add('turret',cylY(.94,.94,.20,64),0,.005,0);
 mainWeapon(P,c);
 const d=nationalModernizationDesign(c),l=NATIONAL_ROOF_LOADOUTS[c.id];
 nationalRoofSystems(P,l);nationalRoofWeapon(P,d.rws,d.cupola,l);
 if(c.package==='ua')addFieldRoofCage(P);
 // Zoria's roof gun sweeps all of its roof inboard of the left cage wing, so
 // its drone rides on a receiver laid across that wing (missionAttachmentReceiver.ts).
 if(c.id==='t80u_zoria')addMissionAttachmentReceiver(P,'t80u_zoria');
 if(c.id==='t72b3m_bulat_m')addRearFieldStowage(P,false);
 P.topY=nationalModernizationDesign(c).roofY;
 P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,model:c.model,revision:6,concept:true,
  preserved:'native-hull-core-running-gear-and-fenders',primaryHull:'donor-with-add-on-modernization',primaryTurret:'cast-ancestry-with-national-armor'};
}
export const NATIONAL_MODERNIZATION_PROFILES={
 ...Object.fromEntries(NATIONAL_MODERNIZATION_CONFIG.map(c=>[c.id,{build:(P:TankBuilderPort)=>build(P,c)}])),
 ...Object.fromEntries(NATIONAL_LEGACY_CONFIG.map(c=>[c.id,{build:(P:TankBuilderPort)=>{
   const donor=nationalDonorTurret(c.id);
   if(donor){
    P.hullG.position.set(0,0,0);
    if(c.package==='ua'){
     // Hetman II (as buildHetmanII): the native T-72B3M hull, then its own heavy hull package (the kit). Release 227: its
     // own frontal package (ukraineFrontEra.ts) replaces the native glacis Relikt, skirt boxes and glacis lamps; the deck
     // cover strap in its mantlet's sweep is left off.
     buildT72B3MXHull(P,{nativeEra:false,glacisLamps:false,sweptStrap:false});
     fitDonorTurret(P,c.id,()=>buildHetmanIIDonorKit(P));
    }else{
     buildZubrIIHull(P);
     fitDonorTurret(P,c.id,()=>buildZubrIIDonorKit(P));
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
 }}])),
};
