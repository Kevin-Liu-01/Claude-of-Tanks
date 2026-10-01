// Native hulls and fenders remain recognizable beneath national modernization
// packages. Country modules own cast-turret proportions, armor and equipment.
import {KIT} from './kit.ts';
import {buildT80UXRunningGear,buildT80UXFenders,buildT80UXHullCore} from './t80uX.ts';
import {buildT72B3MXRunningGear,buildT72B3MXFenders,buildT72B3MXHullCore} from './t72b3mX.ts';
import {buildT72B3XRunningGear,buildT72B3XFenders,buildT72B3XHullCore} from './t72b3X.ts';
import {buildNationalUkraine} from './nationalUkraine.ts';
import {buildNationalPoland} from './nationalPoland.ts';
import {buildNationalChina} from './nationalChina.ts';
import {buildNationalRussia} from './nationalRussia.ts';
import {buildHetmanII} from './hetmanII.ts';
import {buildZubrII} from './zubrII.ts';
import {NATIONAL_LEGACY_CONFIG} from '../nationalLegacyConfig.ts';
import {boxSections} from './measuredPrimitives.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {NATIONAL_MODERNIZATION_CONFIG,type NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import {nationalModernizationDesign,NATIONAL_GUN_PIVOT,NATIONAL_BARREL_LENGTH} from '../nationalModernizationDesign.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylY,cylX,cylZ}=KIT;

function mainWeapon(P:TankBuilderPort,c:Pick<NationalModernizationConfig,'package'>):void {
 P.gunG.position.set(...NATIONAL_GUN_PIVOT);
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
 P.add('gunMountDark',cylZ(.181,.045,32),0,0,.785);
 KIT.buildGun(P,{len:NATIONAL_BARREL_LENGTH,r:.105,baseR:.14,sleeve:false,collar:false});
 for(const [start,end,r]of [[.37,1.80,.139],[1.87,3.04,.126],[3.12,3.61,.161],[3.67,4.89,.118]])
  P.add('gun',cylZ(r,end-start,32),0,0,(start+end)/2);
 for(const z of [.48,1.72,2.95,3.69,4.84])P.add('gunDark',cylZ(.144,.027,28),0,0,z);
 P.addEquipment('gun',box(.035,.039,.74),0,.154,3.37);
 // A national mantlet collar changes the shield outline without changing its
 // articulation owner or masking the intentional clearance at the cheeks.
 if(c.package==='pl')P.add('gunMount',box(.72,.51,.09),0,0,.30);
 if(c.package==='cn')P.add('gunMount',boxSections([[.28,.368,.264,-.255],[.57,.36,.23,-.23]]));
 if(c.package==='ru')P.add('gunMount',cylZ(.229,.15,32),0,0,.65);
 P.muzzleZ=NATIONAL_BARREL_LENGTH;
}
function roofWeapon(P:TankBuilderPort,c:Pick<NationalModernizationConfig,'package'>,
 d:{rws:readonly[number,number,number];cupola:readonly[number,number,number]}):void {
 const [x,baseY,z]=d.rws,y=baseY+.05;
 const gun=sourceMachineGun(P,[0,0,0],{name:`${c.package}ModernRws`,caliberMm:12.7,
  yaw:[x,baseY,z],pivot:[x,y+.36,z-.03],muzzle:[x,y+.36,z+1.05]});
 gun.stage('yaw');
 gun.add('turretDetail',cylY(.19,.23,.13,24),x,baseY+.055,z);
 // An extra 50 mm at the supported trunnion clears the neighboring cupola
 // at full depression without reducing the roof weapon's operating range.
 gun.add('turretDetail',box(.17,.28,.22),x,baseY+.230,z);
 for(const side of [-1,1])gun.add('turretDetail',box(.045,.21,.30),x+side*.115,y+.30,z);
 gun.stage('pitch');
 gun.add('turretDark',box(.16,.13,.43),x,y+.36,z-.08);
 gun.add('turretDark',cylZ(.044,.14,24),x,y+.36,z+.17);
 gun.add('turretDark',cylZ(.027,.84,24),x,y+.36,z+.60);
 gun.add('turretDark',cylZ(.035,.08,20),x,y+.36,z+1.01);
 gun.add('turretDetail',box(.24,.22,.30),x+.22,y+.31,z-.06);
 // Side-mounted feed channel physically joins the ammo case to receiver.
 gun.add('turretDark',box(.10,.07,.08),x+.115,y+.39,z-.02);
 // National receiver guards and sights retain the same real yaw/pitch rig.
 if(c.package==='ua') {
  gun.add('turretDetail',box(.13,.14,.15),x-.145,y+.36,z+.09);
  gun.add('turretDark',box(.094,.075,.009),x-.145,y+.37,z+.17);
  for(const side of [-1,1])gun.add('turretDetail',box(.028,.18,.39),x+side*.098,y+.35,z+.09);
 } else if(c.package==='pl') {
  gun.add('turretDetail',box(.15,.20,.23),x-.165,y+.38,z+.06);
  gun.add('turretDark',cylZ(.041,.014,16),x-.165,y+.425,z+.183);
  gun.add('turretDark',cylZ(.027,.014,16),x-.165,y+.335,z+.183);
  gun.add('turretDetail',box(.19,.026,.46),x,y+.444,z-.07);
 } else if(c.package==='cn') {
  gun.add('turretDetail',boxSections([[z-.27,.14,y+.45,y+.29],[z+.22,.11,y+.425,y+.29]]),x,0,0);
  gun.add('turretDetail',box(.16,.16,.20),x-.185,y+.355,z+.12);
  gun.add('turretDark',box(.112,.073,.012),x-.185,y+.377,z+.225);
 } else {
  gun.add('turretDetail',cylZ(.081,.25,24),x-.17,y+.36,z+.065);
  gun.add('turretDark',cylZ(.062,.013,24),x-.17,y+.36,z+.195);
  gun.add('turretDetail',box(.037,.20,.31),x-.265,y+.33,z+.02);
  gun.add('turretDetail',box(.09,.09,.12),x-.10,y+.36,z+.05);
  gun.add('turretDetail',box(.29,.032,.34),x+.22,y+.435,z-.06);
 }
 gun.finish();
 const [cx,cy,cz]=d.cupola;
 KIT.cupola(P,'turret',cx,cy-.006,cz,.27,.11,8);
}
function build(P:TankBuilderPort,c:NationalModernizationConfig):void {
 P.hullG.position.set(0,0,0);P.turretG.position.set(.008,c.y,c.z);
 if(c.model===0){buildT80UXRunningGear(P);buildT80UXHullCore(P);buildT80UXFenders(P);}
 else if(c.model===1){buildT72B3MXRunningGear(P);buildT72B3MXHullCore(P);buildT72B3MXFenders(P);}
 else {buildT72B3XRunningGear(P);buildT72B3XHullCore(P);buildT72B3XFenders(P);}
 ({ua:buildNationalUkraine,pl:buildNationalPoland,cn:buildNationalChina,ru:buildNationalRussia}[c.package])(P,c);
 P.add('turret',cylY(.94,.94,.20,64),0,.005,0);
 mainWeapon(P,c);roofWeapon(P,c,nationalModernizationDesign(c));
 P.topY=nationalModernizationDesign(c).roofY;
 P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,model:c.model,revision:5,concept:true,
  preserved:'native-hull-core-running-gear-and-fenders',primaryHull:'donor-with-add-on-modernization',primaryTurret:'cast-ancestry-with-national-armor'};
}
export const NATIONAL_MODERNIZATION_PROFILES={
 ...Object.fromEntries(NATIONAL_MODERNIZATION_CONFIG.map(c=>[c.id,{build:(P:TankBuilderPort)=>build(P,c)}])),
 ...Object.fromEntries(NATIONAL_LEGACY_CONFIG.map(c=>[c.id,{build:(P:TankBuilderPort)=>{
   (c.package==='ua'?buildHetmanII:buildZubrII)(P);
   // Hetman II owns its deeper bearing; Zubr II shares the compact ring.
   if(c.package==='pl')P.add('turret',cylY(.94,.94,.20,64),0,.005,0);
   mainWeapon(P,c);roofWeapon(P,c,c.design);
   P.topY=c.design.roofY;
   P.hullG.userData.familyRebuild={donor:c.donor,package:c.package,revision:1,concept:true,
     preserved:'earlier-welded-turret-concept-lineage',primaryTurret:'independent-national-welded-turret'};
 }}])),
};
