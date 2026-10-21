import * as THREE from 'three';
import {KIT,FITTINGS,orientedSlab} from './kit.ts';
import {mount} from './fittingMount.ts';
import {boxSections,blindTube,beamBetween} from './measuredPrimitives.ts';
import {MG_CLASSES,addPintleBarrel,addPintleReceiver,createPintleLayout,machinedRing,type MgClassKey} from '../machineGunGeometry.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {captureAuxiliaryStock} from './auxiliaryStation.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {crosswiseSolid} from './eraModuleKit.ts';
import {nationalStationWidth,type NationalRoofLoadout,type NationalRoofMount} from '../nationalRoofConfig.ts';
import type {NationalPintleSocket} from '../nationalDonorTurrets.ts';
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
 const bored=mount.boredTrunnion===true;
 if(bored)boredYoke(gun,x,y,z,half);
 else {
  gun.add('turretDetail',box(half*2+.10,.08,.12),x,y-.34,z);
  for(const side of [-1,1]) {
   gun.add('turretDetail',box(.044,.40,.12),x+side*(half+.028),y-.16,z);
   gun.add('turretDark',cylX(.073,.065,20),x+side*(half+.045),y,z);
  }
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
 // a bored trunnion's pitch group recoils inside its bearing's air only (the presentation's whole-group recoil)
 if(bored)root.userData.auxiliaryRecoilM=TRUNNION.air/2;
 if(l.yawArc)root.userData.yawArc=[...l.yawArc];
 if(l.depressionByYaw)root.userData.depressionByYaw=l.depressionByYaw.map(r=>[...r]);
 mount.finish?.(P,l,x,y,z,w);
 if(!cupola)return;
 const [cx,cy,cz]=cupola;KIT.cupola(P,'turret',cx,cy-.006,cz,.27,.11,8);
}

/**
 * Release 227 (owner 2026-10-16: "make their machine guns much smalelr and make thhem into the more classic machine gunn
 * emplacement on the turrets"): the loadout's emplacement on the commander's cupola, its foot at `seat` (the cupola's
 * own top, 2 mm into it). It is the fleet's open pintle mount (FITTINGS.pintleMG: flange, column, cradle and trunnion,
 * the class's receiver, feed, ammunition can and barrel, a race ring round the foot and a light shield) in the working
 * station's rig, so the auxiliary roof-gun control (src/sim/auxiliarySystems.ts) turns and fires it by itself; a
 * crew-served emplacement keeps its spade grips, leaf sight and true crew barrel, the solenoid form its back plate.
 * There is no second cupola and no collar: any riser is the pintle's own sleeve and clamp. Round 3 (critic D4): its
 * cradle, trunnion pin and shield ride the gun on a low yoke with one side arm (FittingOptions.ridingCradle), so the
 * moving gun never passes through its own mount; its race ring and shield recesses take the mount's and the gun's steel.
 * Round 4 (critics D10, S1): on a rim socket (nationalPintleSocket) the foot is the socket's collar and the emplacement
 * draws no race ring of its own.
 */
export function nationalCupolaPintle(P:TankBuilderPort,seat:Point,l:NationalRoofLoadout):THREE.Group {
 const e=l.emplacement;
 if(l.mount!=='pintle'||!e)throw new Error(`${P.spec?.id}: ${l.name} is not a pintle emplacement`);
 const fitting=FITTINGS.pintleMG({mats:P.mats,cls:e.cls,scale:1,tone:'two-tone',elev:.08,shield:e.shield,ammo:true,
  ring:e.ring?{...e.ring}:false,riser:e.riserM,working:e.crewServed,remoteControlled:!e.crewServed,datumBarrel:false,ridingCradle:true,
  seed:emplacementSeed(l.name)}) as THREE.Group;
 if(fitting.userData.caliberMm!==l.caliber)throw new Error(`${P.spec?.id}: ${l.name} draws a ${fitting.userData.caliberMm} mm gun`);
 fitting.name=l.name;
 fitting.userData.nationalRoofLoadout=l.name;
 fitting.userData.auxiliaryMuzzle=[0,fitting.userData.barrelAxisLocalY,fitting.userData.muzzleLocalZ];
 if(l.yawArc)fitting.userData.yawArc=[...l.yawArc];
 if(l.depressionByYaw)fitting.userData.depressionByYaw=l.depressionByYaw.map(r=>[...r]);
 mount(P,'turret',fitting,seat[0],seat[1],seat[2]);
 return fitting;
}

/**
 * Release 227, round 4 (geometry critic D10, visual critic S1: "the pintle column stands on the hatch lid, so the hatch
 * could not open"): the emplacement's socket post at the cupola's rim, a classic hatch-side pintle socket. A turned
 * post stands 8 mm into the turret roof under it (`seat`: its plan seat and that roof's height) and 4 mm into the
 * cupola's fixed ring, with a clamp collar 6 mm wider at its top (the pintle flange's seat, `socket.topY`) and the
 * collar's lock bolt facing outboard; a tall post (`socket.web`) is welded to the cupola by a web plate on the radial.
 * It is turret stock in the turret's detail paint; the pintle turns in it and the hatch lid inside the ring stays free.
 * Returns the seat's height.
 */
export function nationalPintleSocket(P:TankBuilderPort,seat:Point,socket:NationalPintleSocket):number {
 const [x,roof,z]=seat,{topY,postR}=socket,collarH=.024,collarR=postR+.006,bottom=roof-.008,postH=topY-collarH-bottom;
 if(postH<.02)throw new Error(`${P.spec?.id}: no room for the pintle socket's post (roof ${roof.toFixed(3)}, top ${topY})`);
 const seg=P.q?20:12,out=Math.atan2(x-socket.cupola[0],z-socket.cupola[1]),ox=Math.sin(out),oz=Math.cos(out);
 P.add('turretDetail',cylY(postR,postR+.004,postH,seg),x,bottom+postH/2,z);
 P.add('turretDetail',cylY(collarR,collarR,collarH,seg),x,topY-collarH/2,z);
 // the lock bolt: its stem 18 mm into the collar, its head 7 mm proud of it (cylX turned onto the outboard radial)
 const boltY=topY-collarH/2,ry=out-Math.PI/2;
 P.add('turretDark',cylX(.006,.022,8),x+ox*(collarR-.007),boltY,z+oz*(collarR-.007),0,ry,0);
 P.add('turretDark',cylX(.011,.007,6),x+ox*(collarR+.0035),boltY,z+oz*(collarR+.0035),0,ry,0);
 // a tall post's web plate (22 mm thick) on the radial, from inside the cupola's stock to the post's axis
 if(socket.web){
  const {innerR,topY:webTop}=socket.web,outerR=Math.hypot(x-socket.cupola[0],z-socket.cupola[1]),h=webTop-bottom,mid=(innerR+outerR)/2;
  if(h<.02||outerR-innerR<postR)throw new Error(`${P.spec?.id}: the pintle socket's web plate has no room`);
  P.add('turretDetail',box(.022,h,outerR-innerR),socket.cupola[0]+ox*mid,bottom+h/2,socket.cupola[1]+oz*mid,0,out,0);
 }
 return topY;
}

/** A stable fitting seed from the loadout's name (FITTINGS seeds only small finish variations). */
function emplacementSeed(name:string):number {
 let h=2166136261;
 for(let i=0;i<name.length;i++){h^=name.charCodeAt(i);h=Math.imul(h,16777619);}
 return (h>>>0)%100000;
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
 // 2026-10-20 (release 227 coplanar census: the gas block's front face lay in the gas cylinder's front cap, 3.2 cm2):
 // the block's front stands 1 mm ahead of the cap, its back where it was
 g.add('turretDark',box(.022,.04,.031),x,y-.038,z+gasEnd-.0145);
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

/** The feed's inner and outer faces off the station's axis, past the yoke's half span: the inner face 12.5 mm clear of
 * the bearing housing's outer end (half + .0775, boredYoke), the outer face where the 25 cm feeds' stood. */
const FEED = {inner: .09, outer: .305} as const;

/** The box-fed station's ammunition box with its lid and latches, and the feed bridge into the receiver. Release 227 land
 * stage (geometry critic CN4-2 on the wedge stations, then the fork and shield stations: the box rides the pitch stage
 * and its inner face, at half + .055, passed 22.5 mm through the yoke's trunnion boss at every pitch, as the Zubrs' did
 * before UAPL-R5C-7): its inner face stands at FEED.inner and its outer face, lid edge and latches stay where the 25 cm
 * box's were (half + .305), so the station's swept envelope does not grow (the Yun's arc and every 360-degree sweep keep
 * their clearances); 21.5 cm wide, its lid with it. */
function feed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),inner=half+FEED.inner,outer=half+FEED.outer,bw=outer-inner;
 const side=l.feedSide,fx=x+side*(inner+outer)/2,cannon=l.caliber===30;
 // round 4: the ammunition drum and box are issue drab, not the hull's camouflage ('turretAmmo', rendered builds)
 const h=cannon?.30:.23;
 g.add('turretAmmo',box(bw,h,.38),fx,y+.045,z-.15);
 g.add('turretAmmo',box(bw+.019,.026,.399),fx,y+.045+h/2,z-.15);
 for(const dz of [-.26,-.04])g.add('turretDark',box(.036,.048,.032),x+side*(half+.31),y+.015,z+dz);
 feedBridge(g,side,half,x,y,y+.19,z);
}

/** The drum-fed station's ammunition drum with its end cap, and the feed bridge into the receiver. Release 227 land stage
 * (as the box): the drum passed 22.5 mm through the trunnion boss at every pitch; its inner face stands at FEED.inner, its
 * outer face and end cap where they were (half + .305, half + .315); 21.5 cm long. The chute keeps its height and its
 * column stands 4 mm inside the chute's front and back faces (11.2 cm): at 2 mm the column's rounded top corners, 5 mm
 * under the chute's, put one pair of their facets in one plane (the critic's coplanar census, 0.06 cm2). */
function drumFeed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),inner=half+FEED.inner,outer=half+FEED.outer;
 const side=l.feedSide,fx=x+side*(inner+outer)/2,cannon=l.caliber===30;
 g.add('turretAmmo',cylX(cannon?.205:.165,outer-inner,24),fx,y+.005,z-.10);
 g.add('turretDark',cylX(cannon?.153:.115,.018,24),x+side*(half+.306),y+.005,z-.10);
 feedBridge(g,side,half,x,y,y+.17,z,.112);
}

/** The link chute over the yoke into the receiver and its column, the column (`columnDepth`) 2 mm inside the chute's
 * front and back faces (land stage 227, UAPL-R6C-3: the two shared those planes). */
function feedBridge(g:Gun,side:number,half:number,x:number,y:number,bridgeY:number,z:number,columnDepth=.116):void {
 g.add('turretDark',box(.22,.07,.12),x+side*(half+.06),bridgeY,z-.05);
 g.add('turretDark',box(.065,.15,columnDepth),x+side*(half-.025),y+.125,z-.05);
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
const SHIELD_FLANGE_INSET = .002;
function cradleShield(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const c=SHIELD,sz=z+c.z,W=2*c.half,[pw,ph]=c.port;
 g.add('turretDetail',box(W,c.top-ph/2,c.t),x,y+(c.top+ph/2)/2,sz);
 g.add('turretDetail',box(W,-c.bottom-ph/2,c.t),x,y+(c.bottom-ph/2)/2,sz);
 for(const s of [-1,1])g.add('turretDetail',box((W-pw)/2,ph,c.t),x+s*(pw/2+(W-pw)/4),y,sz);
 // the bolted flange round the face (its bars 2 mm into the plate, the side bars between the top and bottom bars).
 // Round 6 (the critic's UAPL-R5C-6: the bars' outer faces lay in the plate's edge planes over their 2 mm seat, a
 // z-fight): the flange stands 2 mm in from the plate's edges, the side bars 1 mm clear of the top and bottom bars.
 const f=c.flange,fz=sz+c.t/2+f.t/2-.002,e=SHIELD_FLANGE_INSET;
 for(const v of [c.top-e-f.w/2,c.bottom+e+f.w/2])g.add('turretDark',box(W-2*e,f.w,f.t),x,y+v,fz);
 for(const s of [-1,1])g.add('turretDark',box(f.w,c.top-c.bottom-2*f.w-2*e-.002,f.t),x+s*(c.half-e-f.w/2),y+(c.top+c.bottom)/2,fz);
 // the wings: from the shield's side edges back and out at 30 degrees, under the sight head's floor (y + .105)
 for(const s of [-1,1]){
  const a=[x+s*c.half,sz-c.t/2],b=[x+s*(c.half+c.wing.depth*Math.sin(c.wing.rake)),sz-c.t/2-c.wing.depth*Math.cos(c.wing.rake)];
  const n=[-(b[1]-a[1]),b[0]-a[0]],ln=Math.hypot(n[0],n[1]),ox=n[0]/ln*c.t*s,oz=n[1]/ln*c.t*s;
  const y0=y+c.bottom,y1=y+c.wing.top;
  g.add('turretDetail',orientedSlab([a[0],y0,a[1]+.002],[b[0],y0,b[1]],[b[0]+ox,y0,b[1]+oz],[a[0]+ox,y0,a[1]+oz+.002],
   [a[0],y1,a[1]+.002],[b[0],y1,b[1]],[b[0]+ox,y1,b[1]+oz],[a[0]+ox,y1,a[1]+oz+.002]),0,0,0);
 }
 // the gussets from the cradle rails' front ends (z + .15) to the shield's back face (round 6: 10 mm, 1 mm inside the
 // 12 mm rails' side planes over their 2 mm lap: no shared face)
 const railX=w/2-.006,front=z-.08+.23;
 for(const s of [-1,1])g.add('turretDetail',box(.010,.08,sz-c.t/2-front+.004),x+s*railX,y-.03,(front+sz-c.t/2)/2);
 // bolt heads on the flange, top and bottom
 for(const v of [c.top-e-f.w/2,c.bottom+e+f.w/2])for(const s of [-.14,-.07,0,.07,.14])g.add('turretDark',cylZ(.007,.006,8),x+s,y+v,fz+f.t/2+.002);
 void l;
}

/** The Zubr's 150-round box (issue drab) on the feed side, its lid, and the link chute into the receiver. Round 6 (the
 * critic's UAPL-R5C-7: the box rides the pitch stage and its inner face passed 27.5 mm through the yoke's trunnion boss
 * at every pitch; UAPL-R5C-6: the chute's underside lay in the lid's underside plane): the box stands 12.5 mm clear of
 * the boss (its inner face at half + .09, the boss's outer at half + .0775) and the chute 3 mm over the lid's underside. */
function cradleFeed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),side=l.feedSide,fx=x+side*(half+.19);
 g.add('turretAmmo',box(.20,.17,.30),fx,y+.03,z-.12);
 g.add('turretAmmo',box(.214,.02,.314),fx,y+.125,z-.12);
 for(const dz of [-.22,-.02])g.add('turretDark',box(.03,.04,.028),fx+side*.105,y+.04,z+dz);
 feedBridge(g,side,half,x,y,y+.153,z);
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
 // land stage 227 (UAPL-R6C-3: the side and floor plates' undersides lay in the front plate's underside over their 2 mm
 // seats, and the roof plate's top in the front plate's top over its seat, z-fights): the undersides stand 1 mm over the
 // front plate's foot and the roof's top 1 mm under the front plate's top
 const wallTop=c.top-c.roof,under=c.bottom+.001;
 for(const s of [-1,1])plate(Math.min(s*c.xIn,s*c.xOut),Math.max(s*c.xIn,s*c.xOut),under,wallTop);
 plate(-c.xOut,c.xOut,wallTop,c.top-.001);
 plate(-c.xIn,c.xIn,under,c.bottom+c.floor);
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

/** The Zubr II's 200-round bin on the feed side and the chute over the casemate's roof into the receiver (round 4: it
 * lies 4 mm into the roof plate, the receiver's feed port under it). Round 6: the bin stands 17.5 mm clear of the yoke's
 * trunnion boss (the critic's UAPL-R5C-7: it pitched 17.5 mm through it), and it is a fitted bin rather than a plain
 * cube (D8: "a plain olive cube ... toy-like"): its front-top edge chamfered, its lid on a rear hinge with a carry handle
 * and two latches on its outer face; on the lid's outer front stands the illuminator's housing (UAPL-R5C-2: under the
 * sensor head, .31 m off the main gun's line, the searchlight's cone took in the main gun's muzzle once the gun rose
 * past 4 degrees; here, a metre outboard of it, the cone passes beside the barrel at every main-gun pitch). The bin is
 * 4 cm shorter at the rear than round 5's box: at full elevation its rear corner swings down past the right rear
 * stanchion's sensor at yaw 280 (nationalRoof's 360-degree sweep). */
const BIN = {at: .215, w: .24, h: .20, d: .30, y: .02, z: -.11, chamfer: .05, lid: .02} as const;
function binFrame(l:NationalRoofLoadout,x:number,y:number,z:number,w:number){
 const half=supportHalfWidth(l,w),side=l.feedSide,fx=x+side*(half+BIN.at);
 return {side,fx,y0:y+BIN.y-BIN.h/2,y1:y+BIN.y+BIN.h/2,z0:z+BIN.z-BIN.d/2,z1:z+BIN.z+BIN.d/2};
}
function casemateFeed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),B=BIN,{side,fx,y0,y1,z0,z1}=binFrame(l,x,y,z,w),c=B.chamfer;
 const ring:[number,number][]=[[z0,y0],[z1,y0],[z1,y1-c],[z1-c,y1],[z0,y1]];
 g.add('turretAmmo',crosswiseSolid([fx-B.w/2,fx+B.w/2].map(px=>({x:px,ring}))),0,0,0);
 // the lid over the flat top, 7 mm over the bin's sides and rear, its front edge 4 mm onto the chamfer's crest
 g.add('turretAmmo',box(B.w+.014,B.lid,z1-c+.004-(z0-.007)),fx,y1-.002+B.lid/2,(z1-c+.004+z0-.007)/2);
 // the hinge along the lid's rear edge, the carry handle on its inner half, the latches on the outer face
 g.add('turretDark',cylX(.011,B.w*.8,P_SEG),fx,y1+.006,z0-.012);
 // (land stage 227, UAPL-R6C-3: the posts 1 mm proud of the bar's sides, the bar's ends 2 mm inside the posts' outer
 // faces: no shared planes; the handle 25 mm further aft, its front post and bar 4-6 mm behind the link chute's rear
 // face, where they stood 17-19 mm inside the chute)
 const hx=fx-side*.06,ht=y1-.002+B.lid,hz=z0+.085;
 for(const dz of [-.055,.055])g.add('turretDark',box(.014,.032,.012),hx,ht+.014,hz+dz);
 g.add('turretDark',box(.012,.012,.118),hx,ht+.034,hz);
 for(const dz of [-.26,-.04])g.add('turretDark',box(.036,.048,.032),fx+side*.13,y+.015,z+dz);
 // the illuminator's housing on the lid's outer front: its foot 4 mm into the lid, its mouth 6 mm past the lid's front
 // edge over the chamfer's crest (no shared face)
 const I=ILLUMINATOR,ix=fx+side*I.out,hy=ht-.004+I.h/2,front=z1-c+I.lip,back=front-I.depth;
 g.add('turretDark',box(I.w,I.h,I.depth-I.bore.depth),ix,hy,back+(I.depth-I.bore.depth)/2);
 for(const s of [-1,1]){
  g.add('turretDark',box(I.w,(I.h-I.bore.h)/2,I.bore.depth),ix,hy+s*(I.bore.h/2+(I.h-I.bore.h)/4),front-I.bore.depth/2);
  g.add('turretDark',box((I.w-I.bore.w)/2,I.bore.h,I.bore.depth),ix+s*(I.bore.w/2+(I.w-I.bore.w)/4),hy,front-I.bore.depth/2);
 }
 const top=CASEMATE.top-.004,h=.07;
 g.add('turretDark',box(.22,h,.12),x+side*(half+.06),y+top+h/2,z-.05);
}

/** The Zubr II's sensor head (a Horus-type concept: day, thermal and rangefinder windows) on its bracket opposite the
 * feed, its foot through the casemate's roof into the receiver. (Round 6: its illuminator moved to the feed bin.) */
function casemateSight(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w),side=-l.feedSide,sx=x+side*(half+.16);
 g.add('turretDetail',box(.065,.19,.12),x+side*(w/2-.025),y+.115,z+.015);
 g.add('turretDetail',box(.15,.07,.12),x+side*(half+.02),y+.17,z+.03);
 g.add('turretDetail',box(.20,.18,.25),sx,y+.20,z+.075);
 const face=z+.075+.125+.006;
 g.add('turretGlass',box(.075,.05,.012),sx-side*.045,y+.235,face);
 g.add('turretGlass',cylZ(.035,.012,20),sx+side*.045,y+.235,face);
 g.add('turretGlass',cylZ(.018,.012,12),sx,y+.16,face);
}

/** The illuminator: a searchlight boresighted with the weapon (the runtime's narrow searchlight cone, on the station's
 * line), .15 x .095, its .125 x .07 bore 22 mm deep, centred `out` towards the bin's outer side. */
const ILLUMINATOR = {w: .15, h: .095, depth: .12, out: .045, lip: .010, bore: {w: .125, h: .07, depth: .022},
  lens: [.124, .069, .017] as const, recess: .010} as const;
const P_SEG = 12;

/** The illuminator's lens, authored in the turret frame at the rest pose as factory stock captured into the station's
 * pitch stage (the factory moves it under auxiliaryWeaponPitch and registers its night emitter there). Its face 10 mm
 * inside the bore's mouth, its body lapping into the bore's floor. */
function casemateIlluminator(P:TankBuilderPort,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const I=ILLUMINATOR,{side,fx,y1,z1}=binFrame(l,x,y,z,w),ht=y1-.002+BIN.lid,front=z1-BIN.chamfer+I.lip;
 const done=captureAuxiliaryStock(P,l.name,'pitch');
 P.addEquipment('turretGlass',markVehicleNightLens(box(...I.lens),'headlight',{searchlight:true}),fx+side*I.out,ht-.004+I.h/2,front-I.recess-I.lens[2]/2);
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

/**
 * Release 227 land stage (geometry critic CN4-2 on the Yun's faceted station, and the same yoke under the Hetman II's,
 * the Wilk's and both Zubrs' stations: "its trunnion is modelled through solid uprights, and the whole pitch group
 * recoils 25 mm through them"; UAPL-R6C-2: the Zubr's sight foot slid through the cheek's top; UAPL-R6C-3: the cheeks'
 * outer and end faces lay in the cross-beam's planes): the yoke of a bored-trunnion row. Each cheek stops 5 mm under
 * the pitch group's trunnion pin (r .055); a bearing housing (a bored ring, r .058 to .073, capped at its outer end)
 * sits 13 mm into the cheek's top round the pin, so the pin turns in 3 mm of air and the pitch group never passes
 * through its yoke; the cross-beam ends 2 mm inside the cheeks' outer faces and its front and back faces 2 mm inside
 * theirs. The pitch group recoils 1.5 mm (`auxiliaryRecoilM`), half that air, so the pin keeps 1.5 mm from its bore. The plain yoke's
 * span, heights and the bosses' outer form are kept, so the station's silhouette does not change. The fork, shield and
 * drum rows had the same defects (the Zoria's, Hetman's, Sich's, Husarz's, Bulat-M's, Bars-M's and Bastion-M's stations:
 * the pin through solid cheeks and bosses, 25 mm of recoil through them, the box or drum 22.5 mm through the boss, and on
 * the 12.7 mm fork and shield stations the sight foot 1.5 mm through the cheek's top) and are bored as well.
 */
const TRUNNION = {pin: .055, air: .003, outer: .073, length: .065, cap: .003, cheekTop: -.060, sides: 16} as const;
function boredYoke(g:Gun,x:number,y:number,z:number,half:number):void {
 // the bore's flats stand the air off the pin's (circumscribed) radius
 const T=TRUNNION,cheekBottom=-.36,bore=(T.pin+T.air)/Math.cos(Math.PI/T.sides);
 g.add('turretDetail',box(half*2+.096,.08,.116),x,y-.34,z);
 for(const side of [-1,1]) {
  g.add('turretDetail',box(.044,T.cheekTop-cheekBottom,.12),x+side*(half+.028),y+(T.cheekTop+cheekBottom)/2,z);
  // the bored housing (a plain lathe tube along +Y turned onto X, 16 sides) and its end cap, a disc 3 mm inside the
  // bore's mouth whose rim meets the bore's corners, 27 mm off the pin's end: one yaw-stage piece a side, as the solid
  // boss was, and no heavier (the Hetman II's triangle budget, frontEraPackages)
  const tube=[[bore,0],[T.outer,0],[T.outer,T.length],[bore,T.length],[bore,0]].map(([r,h])=>new THREE.Vector2(r,h));
  const lathe=new THREE.LatheGeometry(tube,T.sides),ring=lathe.toNonIndexed().rotateZ(-side*Math.PI/2).translate(-side*T.length/2,0,0);
  lathe.dispose();
  const disc=new THREE.CircleGeometry(bore,T.sides,Math.PI/2),cap=disc.toNonIndexed().rotateY(side*Math.PI/2).translate(side*(T.length/2-T.cap),0,0);
  disc.dispose();
  g.add('turretDark',KIT.mergeAll([ring,cap]),x+side*(half+.045),y,z);
 }
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
 /** The yoke carries the trunnion pin in bored, capped bearing housings with 3 mm of air (boredYoke; land stage 227). */
 boredTrunnion?:boolean;
}
const NATIONAL_MOUNTS:Readonly<Partial<Record<NationalRoofMount,NationalMountRow>>>={
 fork:{halfShare:.5,housing:forkHousing,boredTrunnion:true},
 shield:{halfShare:.5,housing:shieldHousing,boredTrunnion:true},
 wedge:{halfShare:.74,housing:wedgeHousing,boredTrunnion:true},
 drum:{halfShare:.74,housing:drumHousing,feed:drumFeed,boredTrunnion:true},
 cradle:{halfShare:.5,housing:cradleShield,feed:cradleFeed,boredTrunnion:true},
 casemate:{halfShare:.74,housing:casemateHousing,feed:casemateFeed,sight:casemateSight,bearing:casemateBearing,
  finish:casemateIlluminator,boredTrunnion:true},
};
function nationalMount(mount:NationalRoofMount):NationalMountRow {
 // the classic cupola emplacement has no station row: fitDonorTurret builds it with nationalCupolaPintle
 if(mount==='pintle')throw new Error("national roof station: a 'pintle' emplacement is built by nationalCupolaPintle, not nationalRoofWeapon");
 const row=NATIONAL_MOUNTS[mount];
 if(!row)throw new Error(`national roof station: no mount row for '${mount}'`);
 return row;
}
