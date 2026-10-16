import * as THREE from 'three';
import {KIT,orientedSlab} from './kit.ts';
import {boxSections,blindTube,beamBetween} from './measuredPrimitives.ts';
import {MG_CLASSES,addPintleBarrel,addPintleReceiver,createPintleLayout,machinedRing,type MgClassKey} from '../machineGunGeometry.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import type {NationalRoofLoadout} from '../nationalRoofConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {tankSeedId} from '../tankIdAliases.ts';
type Point=readonly[number,number,number];
type Gun=ReturnType<typeof sourceMachineGun>;
const {box,cylX,cylY,cylZ}=KIT;

/** All pieces share an actual yaw/pitch owner, including the feed and sight.
 * The pedestal and fork stay below pitch stock; the trunnion passes through it.
 * A null cupola leaves the turret's own commander's cupola (a donor turret's)
 * as the station's seat instead of adding a second one. */
export function nationalRoofWeapon(P:TankBuilderPort,rws:Point,cupola:Point|null,l:NationalRoofLoadout):void {
 const [x,b,z]=rws,y=b+l.axisHeight;
 const gun=sourceMachineGun(P,[0,0,0],{name:l.name,caliberMm:l.caliber,
  yaw:rws,pivot:[x,y,z],muzzle:[x,y,z+l.muzzleZ]});
 const cannon=l.caliber===30,w=cannon?.245:.185,half=supportHalfWidth(l,w);
 gun.stage('yaw');
 gun.add('turretDetail',cylY(.21,.26,.13,32),x,b+.055,z);
 // 2026-10-11 (fleet-weapons lane, round 4; wave 386's critics: "a camo-painted drum on a U-shaped yoke on a cone",
 // "a camo box on a plain U-shaped yoke over a smooth cone"): the station stands on a tapered armoured pedestal from its
 // bearing ring up to the yoke's cross-beam (half a millimetre under it), not a round cone.
 const pb=b+.10,pt=y-.38-.0005;
 gun.add('turretDetail',orientedSlab(
  [x-.15,pb,z-.14],[x+.15,pb,z-.14],[x+.15,pb,z+.14],[x-.15,pb,z+.14],
  [x-.12,pt,z-.06],[x+.12,pt,z-.06],[x+.12,pt,z+.06],[x-.12,pt,z+.06]),0,0,0);
 gun.add('turretDetail',box(half*2+.10,.08,.12),x,y-.34,z);
 for(const side of [-1,1]) {
  gun.add('turretDetail',box(.044,.40,.12),x+side*(half+.028),y-.16,z);
  gun.add('turretDark',cylX(.073,.065,20),x+side*(half+.045),y,z);
 }
 gun.stage('pitch');
 gun.add('turretDark',cylX(.055,half*2+.095,20),x,y,z);
 // 2026-10-10 (fleet-weapons lane, round 3; wave 348a's critics on these stations: "a fat, featureless dark-grey tube
 // with only a muzzle ring and a collar, no receiver, feed or cooling"): the 12.7 mm gun is the fleet's heavy machine
 // gun construction (machineGunGeometry.ts: receiver with feed cover and feedway, barrel, gas tube and flash hider) lying
 // in an open cradle of two side rails on a tray, its bore on the station's axis and its muzzle at the loadout's muzzle;
 // the 30 mm gun keeps its receiver and gains a cooling jacket, a gas cylinder and a baffled muzzle brake.
 if(cannon)nationalCannon(gun,l,x,y,z,w);
 else nationalMachineGun(gun,l,x,y,z,w,nationalMgClass(P));
 housing(gun,l,x,y,z,w);
 feed(gun,l,x,y,z,w);
 sight(gun,l,x,y,z,w);
 const root=gun.finish();root.userData.nationalRoofLoadout=l.name;
 if(!cupola)return;
 const [cx,cy,cz]=cupola;KIT.cupola(P,'turret',cx,cy-.006,cz,.27,.11,8);
}

/** The 12.7 mm class each nation's concept station carries: the NSV family in Ukraine and Poland, the Kord in Russia,
 * the QJC-88 in China (MG_CLASSES). */
function nationalMgClass(P:TankBuilderPort):MgClassKey {
 // The nation prefix is schema-1 vocabulary (tankIdAliases.ts): the rename drops ua_/pl_/cn_/ru_ from these ids.
 const nation=tankSeedId(String(P.spec?.id??'')).split('_')[0];
 return nation==='ru'?'kord':nation==='cn'?'qjc88':'nsvt';
}

/** The fleet heavy machine gun in an open cradle: receiver centred where the old receiver block stood (z - 0.08),
 * bore on the trunnion axis, muzzle at the loadout's muzzle. */
function nationalMachineGun(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number,cls:MgClassKey):void {
 const def=MG_CLASSES[cls];
 const sink:{add(slot:string,geometry:THREE.BufferGeometry,px?:number,py?:number,pz?:number,rx?:number,ry?:number,rz?:number):void}={
  add(){},
 };
 // the Kord at 102 %: its ported brake's mouth (29.7 mm in radius at the class's scale) then meets the station's 30 mm
 // muzzle-rim receipt, as the NSV's and the QJC-88's wider devices already do
 const scale=cls==='kord'?1.02:1;
 const probe=createPintleLayout({cls,scale,remote:true,ammo:false,mount:'external-cradle',feed:l.feedSide>0?'left':'right'},sink);
 const recCentreZ=z-.08, dz=recCentreZ-probe.recZ, dy=y-probe.trunY;
 const flash=def.flashL*probe.s;
 // the muzzle device's front on the loadout's firing socket, with a real 70 mm recessed bore behind it (the station's
 // bore receipt looks into it from the socket, as it did into the old station gun's blind tube)
 const barrelLength=z+l.muzzleZ-dz-probe.trunZ-.10*probe.s-flash;
 const parts={add(slot:string,geometry:THREE.BufferGeometry,px=0,py=0,pz=0,rx=0,ry=0,rz=0):void{
  if(slot==='shadow')return;
  g.add(slot==='glass'?'turretGlass':'turretDark',KIT.xform(geometry,px,py,pz,rx,ry,rz),x,dy,dz);
 }};
 const layout=createPintleLayout({cls,scale,remote:true,ammo:false,mount:'external-cradle',
  feed:l.feedSide>0?'left':'right',barrelLength,muzzleBoreDepth:.07},parts);
 addPintleReceiver(layout);
 addPintleBarrel(layout);
 // the open cradle: a tray under the receiver and two side rails the trunnion, the sight foot and the feed bridge bear on
 const trayTop=dy+layout.bodyBottom-.002, depth=.46;
 g.add('turretDark',box(w,.012,depth),x,trayTop-.006,recCentreZ);
 for(const side of [-1,1])g.add('turretDark',box(.012,y+.06-(trayTop-.012),depth),x+side*(w/2-.006),(y+.06+trayTop-.012)/2,recCentreZ);
}

/** The 30 mm gun: its receiver block, a ribbed cooling jacket, the barrel with a gas cylinder beneath it, and a
 * three-baffle muzzle brake around a blind bore. */
function nationalCannon(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 g.add('turretDark',box(w,.20,.58),x,y,z-.08);
 const tip=l.muzzleZ,barrelStart=.23,brakeL=.16;
 g.add('turretDark',cylZ(.059,.18,24),x,y,z+.20);
 for(const at of [.14,.19,.24])g.add('turretDark',cylZ(.066,.012,24),x,y,z+at);
 g.add('turretDark',cylZ(.036,tip-barrelStart-brakeL,24),x,y,z+(barrelStart+tip-brakeL)/2);
 const gasEnd=barrelStart+(tip-barrelStart-brakeL)*.55;
 g.add('turretDark',cylZ(.016,gasEnd-barrelStart,16),x,y-.058,z+(barrelStart+gasEnd)/2);
 g.add('turretDark',box(.022,.04,.03),x,y-.038,z+gasEnd-.015);
 g.add('turretDark',blindTube(.050,l.caliber/2000,brakeL,.070,24),x,y,z+tip-brakeL/2);
 // the brake's baffles are rings round its body (round 4: solid discs closed the bore the station receipt looks into)
 for(const at of [-.115,-.07,-.025])g.add('turretDark',machinedRing(.048,.058,.014,.003,24).rotateX(Math.PI/2),x,y,z+tip+at-.007);
}

function housing(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 if(l.mount==='fork') {
  for(const side of [-1,1])g.add('turretDetail',beamBetween([x+side*(half+.10),y-.085,z-.23],[x+side*(half+.10),y+.14,z+.30],.017),0,0,0);
  g.add('turretDetail',box(w+.24,.025,.19),x,y+.12,z+.20);
  g.add('turretDetail',box(w+.24,.030,.050),x,y-.060,z-.24);
 } else if(l.mount==='shield') {
  for(const side of [-1,1])g.add('turretDetail',boxSections([[z-.39,.035,y+.18,y-.14],[z+.27,.035,y+.24,y-.12],[z+.43,.025,y+.09,y-.07]]),x+side*(half+.12),0,0);
  g.add('turretDetail',box(w+.32,.035,.31),x,y+.22,z+.08);
  g.add('turretDetail',box(w+.32,.065,.075),x,y+.06,z-.31);
 } else if(l.mount==='wedge') {
  g.add('turretDetail',boxSections([[z-.39,w*.72,y+.12,y-.14],[z+.24,w*.65,y+.19,y-.11],[z+.53,w*.31,y+.055,y-.055]]),x,0,0);
  for(const at of [-.21,-.08,.05,.18])g.add('turretDark',box(w*.95,.009,.025),x,y+.193,z+at);
 } else if(l.caliber===30) {
  g.add('turretDetail',cylZ(w*.69,.43,24),x,y,z-.12);
  g.add('turretDetail',cylZ(w*.43,.35,24),x,y,z+.22);
  for(const at of [-.30,-.05,.32])g.add('turretDark',cylZ(w*(at===.32?.47:.73),.026,24),x,y,z+at);
 }
 // round 4 (wave 386 on the T-72B3's station: "the machine gun is reduced to a thin rod with a knob, with no receiver,
 // feed or ammunition box"): a drum-fed 12.7 mm gun lies open in its cradle, its receiver, feed cover and barrel in
 // view; the round shroud that hid all but the muzzle is gone and the drum is its ammunition.
}

function feed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 const side=l.feedSide,fx=x+side*(half+.18),cannon=l.caliber===30;
 // round 4: the ammunition drum and box are issue drab, not the hull's camouflage ('turretAmmo', rendered builds)
 if(l.mount==='drum') {
  g.add('turretAmmo',cylX(cannon?.205:.165,.25,24),fx,y+.005,z-.10);
  g.add('turretDark',cylX(cannon?.153:.115,.018,24),fx+side*.126,y+.005,z-.10);
 } else {
  const h=cannon?.30:.23;
  g.add('turretAmmo',box(.25,h,.38),fx,y+.045,z-.15);
  g.add('turretAmmo',box(.269,.026,.399),fx,y+.045+h/2,z-.15);
  for(const dz of [-.26,-.04])g.add('turretDark',box(.036,.048,.032),fx+side*.13,y+.015,z+dz);
 }
 g.add('turretDark',box(.22,.07,.12),x+side*(half+.06),y+(l.mount==='drum'?.17:.19),z-.05);
 g.add('turretDark',box(.065,.15,.12),x+side*(half-.025),y+.125,z-.05);
}

function sight(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 const side=-l.feedSide,sx=x+side*(half+.16);
 // This foot enters the actual receiver; a high transverse bracket alone
 // leaves daylight above the round drum housing. Beside the fleet 12.7 mm receiver (narrower than the old block) the
 // foot runs on down the receiver's flank to the cradle's level, so its column carries no air gap (round 4).
 if(l.caliber===30)g.add('turretDetail',box(.065,.15,.12),x+side*(w/2-.025),y+.135,z+.015);
 else g.add('turretDetail',box(.065,.19,.12),x+side*(w/2-.025),y+.115,z+.015);
 g.add('turretDetail',box(.15,.07,.12),x+side*(half+.02),y+.17,z+.03);
 g.add('turretDetail',box(.155,.19,.23),sx,y+.20,z+.075);
 for(const dy of [-.043,.046])g.add('turretGlass',cylZ(dy<0?.035:.047,.015,20),sx,y+.20+dy,z+.196);
}

function supportHalfWidth(l:NationalRoofLoadout,w:number):number {
 return w*(l.mount==='drum'||l.mount==='wedge'?.74:.5);
}
