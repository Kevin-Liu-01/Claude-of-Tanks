import * as THREE from 'three';
import {KIT,orientedSlab} from './kit.ts';
import {boxSections,blindTube,beamBetween} from './measuredPrimitives.ts';
import {MG_CLASSES,addPintleBarrel,addPintleReceiver,createPintleLayout,machinedRing,type MgClassKey} from '../machineGunGeometry.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {captureAuxiliaryStock} from './auxiliaryStation.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {nationalStationWidth,type NationalRoofLoadout,type NationalRoofMount} from '../nationalRoofConfig.ts';
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
 const cannon=l.caliber===30,w=nationalStationWidth(l),half=supportHalfWidth(l,w),mount=nationalMount(l.mount);
 gun.stage('yaw');
 if(mount.bearing)mount.bearing(gun,x,b,z);
 else gun.add('turretDetail',cylY(.21,.26,.13,32),x,b+.055,z);
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
 mount.yaw?.(gun,l,x,b,y,z,w);
 gun.stage('pitch');
 gun.add('turretDark',cylX(.055,half*2+.095,20),x,y,z);
 // 2026-10-10 (fleet-weapons lane, round 3; wave 348a's critics on these stations: "a fat, featureless dark-grey tube
 // with only a muzzle ring and a collar, no receiver, feed or cooling"): the 12.7 mm gun is the fleet's heavy machine
 // gun construction (machineGunGeometry.ts: receiver with feed cover and feedway, barrel, gas tube and flash hider) lying
 // in an open cradle of two side rails on a tray, its bore on the station's axis and its muzzle at the loadout's muzzle;
 // the 30 mm gun keeps its receiver and gains a cooling jacket, a gas cylinder and a baffled muzzle brake.
 if(cannon)nationalCannon(gun,l,x,y,z,w);
 else nationalMachineGun(gun,l,x,y,z,w,nationalMgClass(P),mount.cradle!==false);
 mount.housing(gun,l,x,y,z,w);
 (mount.feed??feed)(gun,l,x,y,z,w);
 (mount.sight??sight)(gun,l,x,y,z,w);
 mount.pitch?.(gun,l,x,y,z,w);
 const root=gun.finish();root.userData.nationalRoofLoadout=l.name;
 mount.finish?.(P,l,x,y,z,w);
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
function nationalMachineGun(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number,cls:MgClassKey,cradle=true):void {
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
 if(!cradle)return;
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

function forkHousing(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 for(const side of [-1,1])g.add('turretDetail',beamBetween([x+side*(half+.10),y-.085,z-.23],[x+side*(half+.10),y+.14,z+.30],.017),0,0,0);
 g.add('turretDetail',box(w+.24,.025,.19),x,y+.12,z+.20);
 g.add('turretDetail',box(w+.24,.030,.050),x,y-.060,z-.24);
}

function shieldHousing(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 for(const side of [-1,1])g.add('turretDetail',boxSections([[z-.39,.035,y+.18,y-.14],[z+.27,.035,y+.24,y-.12],[z+.43,.025,y+.09,y-.07]]),x+side*(half+.12),0,0);
 g.add('turretDetail',box(w+.32,.035,.31),x,y+.22,z+.08);
 g.add('turretDetail',box(w+.32,.065,.075),x,y+.06,z-.31);
}

function wedgeHousing(g:Gun,_l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 g.add('turretDetail',boxSections([[z-.39,w*.72,y+.12,y-.14],[z+.24,w*.65,y+.19,y-.11],[z+.53,w*.31,y+.055,y-.055]]),x,0,0);
 for(const at of [-.21,-.08,.05,.18])g.add('turretDark',box(w*.95,.009,.025),x,y+.193,z+at);
}

function drumHousing(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 // round 4 (wave 386 on the T-72B3's station: "the machine gun is reduced to a thin rod with a knob, with no receiver,
 // feed or ammunition box"): a drum-fed 12.7 mm gun lies open in its cradle, its receiver, feed cover and barrel in
 // view; the round shroud that hid all but the muzzle is gone and the drum is its ammunition.
 if(l.caliber!==30)return;
 g.add('turretDetail',cylZ(w*.69,.43,24),x,y,z-.12);
 g.add('turretDetail',cylZ(w*.43,.35,24),x,y,z+.22);
 for(const at of [-.30,-.05,.32])g.add('turretDark',cylZ(w*(at===.32?.47:.73),.026,24),x,y,z+at);
}

/** The box-fed station's ammunition box with its lid and latches, and the feed bridge into the receiver. */
function feed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 const side=l.feedSide,fx=x+side*(half+.18),cannon=l.caliber===30;
 // round 4: the ammunition drum and box are issue drab, not the hull's camouflage ('turretAmmo', rendered builds)
 const h=cannon?.30:.23;
 g.add('turretAmmo',box(.25,h,.38),fx,y+.045,z-.15);
 g.add('turretAmmo',box(.269,.026,.399),fx,y+.045+h/2,z-.15);
 for(const dz of [-.26,-.04])g.add('turretDark',box(.036,.048,.032),fx+side*.13,y+.015,z+dz);
 feedBridge(g,side,half,x,y,y+.19,z);
}

/** The drum-fed station's ammunition drum with its end cap, and the feed bridge into the receiver. */
function drumFeed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 const side=l.feedSide,fx=x+side*(half+.18),cannon=l.caliber===30;
 g.add('turretAmmo',cylX(cannon?.205:.165,.25,24),fx,y+.005,z-.10);
 g.add('turretDark',cylX(cannon?.153:.115,.018,24),fx+side*.126,y+.005,z-.10);
 feedBridge(g,side,half,x,y,y+.17,z);
}

function feedBridge(g:Gun,side:number,half:number,x:number,y:number,bridgeY:number,z:number):void {
 g.add('turretDark',box(.22,.07,.12),x+side*(half+.06),bridgeY,z-.05);
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

// ---------------------------------------------------------------------------------------------------------------------
// Release 227 (owner 2026-10-16: "make thhe zubr 2 and zubr autocannons into proper machine gun emplacements that are
// aut ocontrolled"): the Zubr's and Zubr II's 12.7 mm WKM-B emplacements. Both lay the fleet's NSV-class heavy machine
// gun (machineGunGeometry.ts, Poland's class) in the open cradle; the auxiliary roof-station logic aims and fires them.

/** The Zubr's field emplacement: a square-cut 10 mm light shield of four bolted plates round a .10 x .09 barrel port,
 * braced by two gussets to the cradle rails. No receiver housing: the gun lies open in its cradle. (Round 2, 2026-10-16:
 * a splinter plate for the receiver's front.) Round 4 (2026-10-17; the critic's ST-1: "Zubr has no visible light
 * shield ... they read as two variants of the same open yoke remote station"): the shield is the station's front, .36 x
 * .28, twice the receiver's width, a bolted flange round its face and two short wings raked back 30 degrees under the
 * sight head; from the front quarters the open receiver, its feed and its box read behind and beside it, where the Zubr
 * II's casemate closes them in. */
const SHIELD = {z: .25, t: .010, half: .18, top: .17, bottom: -.11, port: [.10, .09] as const, wing: {depth: .09, top: .095, rake: 30 * Math.PI / 180},
  flange: {w: .022, t: .008}} as const;
function cradleShield(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const c=SHIELD,sz=z+c.z,W=2*c.half,[pw,ph]=c.port;
 g.add('turretDetail',box(W,c.top-ph/2,c.t),x,y+(c.top+ph/2)/2,sz);
 g.add('turretDetail',box(W,-c.bottom-ph/2,c.t),x,y+(c.bottom-ph/2)/2,sz);
 for(const s of [-1,1])g.add('turretDetail',box((W-pw)/2,ph,c.t),x+s*(pw/2+(W-pw)/4),y,sz);
 // the bolted flange round the face (its bars 2 mm into the plate, the side bars between the top and bottom bars)
 const f=c.flange,fz=sz+c.t/2+f.t/2-.002;
 for(const v of [c.top-f.w/2,c.bottom+f.w/2])g.add('turretDark',box(W,f.w,f.t),x,y+v,fz);
 for(const s of [-1,1])g.add('turretDark',box(f.w,c.top-c.bottom-2*f.w,f.t),x+s*(c.half-f.w/2),y+(c.top+c.bottom)/2,fz);
 // the wings: from the shield's side edges back and out at 30 degrees, under the sight head's floor (y + .105)
 for(const s of [-1,1]){
  const a=[x+s*c.half,sz-c.t/2],b=[x+s*(c.half+c.wing.depth*Math.sin(c.wing.rake)),sz-c.t/2-c.wing.depth*Math.cos(c.wing.rake)];
  const n=[-(b[1]-a[1]),b[0]-a[0]],ln=Math.hypot(n[0],n[1]),ox=n[0]/ln*c.t*s,oz=n[1]/ln*c.t*s;
  const y0=y+c.bottom,y1=y+c.wing.top;
  g.add('turretDetail',orientedSlab([a[0],y0,a[1]+.002],[b[0],y0,b[1]],[b[0]+ox,y0,b[1]+oz],[a[0]+ox,y0,a[1]+oz+.002],
   [a[0],y1,a[1]+.002],[b[0],y1,b[1]],[b[0]+ox,y1,b[1]+oz],[a[0]+ox,y1,a[1]+oz+.002]),0,0,0);
 }
 // the gussets from the cradle rails' front ends (z + .15) to the shield's back face
 const railX=w/2-.006,front=z-.08+.23;
 for(const s of [-1,1])g.add('turretDetail',box(.012,.08,sz-c.t/2-front+.004),x+s*railX,y-.03,(front+sz-c.t/2)/2);
 // bolt heads on the flange, top and bottom
 for(const v of [c.top-f.w/2,c.bottom+f.w/2])for(const s of [-.14,-.07,0,.07,.14])g.add('turretDark',cylZ(.007,.006,8),x+s,y+v,fz+f.t/2+.002);
 void l;
}

/** The Zubr's 150-round box (issue drab) on the feed side, its lid, and the link chute into the receiver. */
function cradleFeed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),side=l.feedSide,fx=x+side*(half+.15);
 g.add('turretAmmo',box(.20,.17,.30),fx,y+.03,z-.12);
 g.add('turretAmmo',box(.214,.02,.314),fx,y+.125,z-.12);
 for(const dz of [-.22,-.02])g.add('turretDark',box(.03,.04,.028),fx+side*.105,y+.04,z+dz);
 feedBridge(g,side,half,x,y,y+.15,z);
}

/** The Zubr II's armoured emplacement. Round 4 (2026-10-17; the critic's D1: "the casemate is not a closed armoured box.
 * Its side plates pierce the raked front plate and stand proud of it at the top. At the bottom the front plate hangs 5 cm
 * clear of the side plates, and the roof strips overhang its top edge with an open slot"; ST-1: "neither looks
 * armoured"): a closed armoured box round the receiver. Two side plates ride 1 cm inside the yoke's cheeks (they pitch
 * between them, the trunnion passing through them), a roof plate lies on them, a floor plate closes them under the
 * cradle tray, and all four end 2 mm into the back face of a front plate raked 30 degrees, built in four pieces round
 * the barrel port; the rear stays open for the gun's service. Station frame: v up from the bore axis, z along it. */
const CASEMATE = {xIn: .121, xOut: .133, bottom: -.10, top: .112, roof: .012, floor: .012, rear: -.30,
  /** the front plate's front face at its foot, its thickness, rake and half width; the port round the bore at its mid-plane */
  front: .29, plate: .014, rake: 30 * Math.PI / 180, half: .145, port: {half: .046, low: -.056, high: .082}} as const;
function casemateHousing(g:Gun,_l:NationalRoofLoadout,x:number,y:number,z:number,_w:number):void {
 const c=CASEMATE,tan=Math.tan(c.rake),dz=c.plate/Math.cos(c.rake);
 const faceZ=(v:number)=>c.front-(v-c.bottom)*tan, backZ=(v:number)=>faceZ(v)-dz, seat=(v:number)=>backZ(v)+.002;
 const at=(px:number,v:number,pz:number):[number,number,number]=>[x+px,y+v,z+pz];
 /** A plate between two x planes and two v planes, from the open rear to the front plate's back face. */
 const plate=(x0:number,x1:number,v0:number,v1:number)=>g.add('turretDetail',orientedSlab(
  at(x0,v0,c.rear),at(x1,v0,c.rear),at(x1,v0,seat(v0)),at(x0,v0,seat(v0)),
  at(x0,v1,c.rear),at(x1,v1,c.rear),at(x1,v1,seat(v1)),at(x0,v1,seat(v1))),0,0,0);
 const wallTop=c.top-c.roof;
 for(const s of [-1,1])plate(Math.min(s*c.xIn,s*c.xOut),Math.max(s*c.xIn,s*c.xOut),c.bottom,wallTop);
 plate(-c.xOut,c.xOut,wallTop,c.top);
 plate(-c.xIn,c.xIn,c.bottom,c.bottom+c.floor);
 // the front plate: four pieces between its back and front faces round the port
 const piece=(x0:number,x1:number,v0:number,v1:number)=>g.add('turretDetail',orientedSlab(
  at(x0,v0,backZ(v0)),at(x1,v0,backZ(v0)),at(x1,v1,backZ(v1)),at(x0,v1,backZ(v1)),
  at(x0,v0,faceZ(v0)),at(x1,v0,faceZ(v0)),at(x1,v1,faceZ(v1)),at(x0,v1,faceZ(v1))),0,0,0);
 const p=c.port;
 piece(-c.half,c.half,p.high,c.top);
 piece(-c.half,c.half,c.bottom,p.low);
 for(const s of [-1,1])piece(Math.min(s*p.half,s*c.half),Math.max(s*p.half,s*c.half),p.low,p.high);
 // bolt heads across the front plate's top and foot, square to its face
 const n=new THREE.Vector3(0,Math.sin(c.rake),Math.cos(c.rake));
 for(const v of [c.top-.016,c.bottom+.016])for(const s of [-.11,-.055,0,.055,.11]){
  const head=cylZ(.007,.006,8).rotateX(-c.rake);
  g.add('turretDark',head,x+s,y+v+n.y*.002,z+faceZ(v)+n.z*.002);
 }
}

/** The Zubr II's 200-round box on the feed side (outside its side plate) and the chute over the casemate's roof into
 * the receiver (round 4: it lies 4 mm into the roof plate, the receiver's feed port under it). */
function casemateFeed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),side=l.feedSide,fx=x+side*(half+.18);
 g.add('turretAmmo',box(.24,.20,.34),fx,y+.02,z-.13);
 g.add('turretAmmo',box(.254,.02,.354),fx,y+.13,z-.13);
 const top=CASEMATE.top-.004,h=.07;
 g.add('turretDark',box(.22,h,.12),x+side*(half+.06),y+top+h/2,z-.05);
}

/** The Zubr II's sensor head (a Horus-type concept: day, thermal and rangefinder windows) on its bracket opposite the
 * feed, its foot through the casemate's roof into the receiver, and under the head the illuminator: a boresighted
 * housing (round 4, 2026-10-17; the critic: "only a small emitter on the station's sight head glows"), .15 x .095, its
 * .125 x .07 bore 22 mm deep, hung 4 mm into the head's floor. */
function casemateSight(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),side=-l.feedSide,sx=x+side*(half+.16);
 g.add('turretDetail',box(.065,.19,.12),x+side*(w/2-.025),y+.115,z+.015);
 g.add('turretDetail',box(.15,.07,.12),x+side*(half+.02),y+.17,z+.03);
 g.add('turretDetail',box(.20,.18,.25),sx,y+.20,z+.075);
 const face=z+.075+.125+.006;
 g.add('turretGlass',box(.075,.05,.012),sx-side*.045,y+.235,face);
 g.add('turretGlass',cylZ(.035,.012,20),sx+side*.045,y+.235,face);
 g.add('turretGlass',cylZ(.018,.012,12),sx,y+.16,face);
 const I=ILLUMINATOR,hy=y+I.y,front=z+I.front,back=front-I.depth;
 g.add('turretDark',box(I.w,I.h,I.depth-I.bore.depth),sx,hy,back+(I.depth-I.bore.depth)/2);
 for(const s of [-1,1]){
  g.add('turretDark',box(I.w,(I.h-I.bore.h)/2,I.bore.depth),sx,hy+s*(I.bore.h/2+(I.h-I.bore.h)/4),front-I.bore.depth/2);
  g.add('turretDark',box((I.w-I.bore.w)/2,I.bore.h,I.bore.depth),sx+s*(I.bore.w/2+(I.w-I.bore.w)/4),hy,front-I.bore.depth/2);
 }
}

/** The illuminator (round 4): boresighted with the weapon (the runtime's narrow searchlight cone: on the station's line,
 * level, its lower edge 6.3 degrees under it passes over the main gun's barrel 1.1 m below at every station yaw); the
 * housing's top 4 mm into the sensor head's floor (y + .11), its mouth flush with the head's front (z + .20). */
const ILLUMINATOR = {w: .15, h: .095, depth: .12, y: .11 + .004 - .095 / 2, front: .20, bore: {w: .125, h: .07, depth: .022},
  lens: [.124, .069, .017] as const, recess: .010} as const;

/** The illuminator's lens, authored in the turret frame at the rest pose as factory stock captured into the station's
 * pitch stage (the factory moves it under auxiliaryWeaponPitch and registers its night emitter there). Its face 10 mm
 * inside the bore's mouth, its body lapping into the bore's floor. */
function casemateIlluminator(P:TankBuilderPort,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),side=-l.feedSide,sx=x+side*(half+.16),I=ILLUMINATOR;
 const done=captureAuxiliaryStock(P,l.name,'pitch');
 P.addEquipment('turretGlass',markVehicleNightLens(box(...I.lens),'headlight',{searchlight:true}),sx,y+I.y,z+I.front-I.recess-I.lens[2]/2);
 done();
}

/** The Zubr II's bearing ring with a low armoured ring guard round it (16 sides), one yaw-stage piece. */
function casemateBearing(g:Gun,x:number,b:number,z:number):void {
 const profile=[[.27,0],[.30,0],[.30,.07],[.27,.07]].map(([r,h])=>new THREE.Vector2(r,h));
 const guard=new THREE.LatheGeometry(profile,16).translate(0,-.004-.055,0).toNonIndexed();
 g.add('turretDetail',KIT.mergeAll([cylY(.21,.26,.13,32).toNonIndexed(),guard]),x,b+.055,z);
}

function supportHalfWidth(l:NationalRoofLoadout,w:number):number {
 return w*nationalMount(l.mount).halfShare;
}

type StationPart=(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number)=>void;
/** One row per mount type (nationalRoofConfig.ts NationalRoofMount). Release 227 S0 (2026-10-16): the per-mount
 * pieces that were branches on l.mount are table rows, so a new mount adds a row and changes no existing station. */
interface NationalMountRow {
 /** The yoke's half span as a share of the receiver width (nationalStationWidth). */
 halfShare:number;
 /** The pitching housing (shield, shroud, wedge or drum jacket) round the gun. */
 housing:StationPart;
 /** The ammunition feed (default: the drum on a drum mount, else the box) and the sight (default: the side sight). */
 feed?:StationPart;
 sight?:StationPart;
 /** The bearing ring at the station's foot (default: the plain ring), as one yaw-stage piece. */
 bearing?:(g:Gun,x:number,b:number,z:number)=>void;
 /** Further pieces on the yaw stage (after the yoke) and on the pitch stage (after the sight). */
 yaw?:(g:Gun,l:NationalRoofLoadout,x:number,b:number,y:number,z:number,w:number)=>void;
 pitch?:StationPart;
 /** Factory-bucket stock authored after the station is finished (e.g. a night lens through captureAuxiliaryStock). */
 finish?:(P:TankBuilderPort,l:NationalRoofLoadout,x:number,y:number,z:number,w:number)=>void;
 /** false: the 12.7 mm gun is laid without the open cradle's tray and rails (the mount carries its own). */
 cradle?:boolean;
}
const NATIONAL_MOUNTS:Readonly<Partial<Record<NationalRoofMount,NationalMountRow>>>={
 fork:{halfShare:.5,housing:forkHousing},
 shield:{halfShare:.5,housing:shieldHousing},
 wedge:{halfShare:.74,housing:wedgeHousing},
 drum:{halfShare:.74,housing:drumHousing,feed:drumFeed},
 cradle:{halfShare:.5,housing:cradleShield,feed:cradleFeed},
 casemate:{halfShare:.74,housing:casemateHousing,feed:casemateFeed,sight:casemateSight,bearing:casemateBearing,
  finish:casemateIlluminator},
};
function nationalMount(mount:NationalRoofMount):NationalMountRow {
 const row=NATIONAL_MOUNTS[mount];
 if(!row)throw new Error(`national roof station: no mount row for '${mount}'`);
 return row;
}
