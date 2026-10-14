import * as THREE from 'three';
import { KIT, orientedSlab } from './kit.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { boxSections } from './measuredPrimitives.ts';
import { MG_CLASSES, addPintleBarrel, createPintleLayout } from '../machineGunGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];

/** Functional independent yaw/pitch station with a receiver, side feed,
 * trunnions, optical head and open bore. Ammunition follows its real caliber. */
export function addFieldRoofWeapon(P:TankBuilderPort,seat:Point,caliber:12.7|30,name:string,mastLift=0,scale=1):void{
 const [x,b,z]=seat,y=b+.59+mastLift,tip=caliber===30?1.10:.91;
 const g=sourceMachineGun(P,[0,0,0],{name,caliberMm:caliber,yaw:seat,pivot:[x,y,z],muzzle:[x,y,z+tip]});
 const {box,cylY,cylX,cylZ}=KIT;
 g.stage('yaw');
 // 2026-10-11 (fleet-weapons lane, round 3b; wave 348's critics on the Leopard 2A7V: the station "perched on a thin stick
 // high above the roof ... reads as a box on a pole rather than a seated station"): a lifted station stands on a tapered
 // armoured pedestal from the roof up to the yoke's cross-beam (half a millimetre under it), in place of the base ring
 // and post, and the yoke's arms keep their own height above the beam. The lift itself stays the owner's (6763d7cc0).
 if(mastLift>0){
  const pb=b-.008,pt=b+.265+mastLift-.0005;
  g.add('turretDetail',orientedSlab(
   [x-.26,pb,z-.25],[x+.26,pb,z-.25],[x+.26,pb,z+.25],[x-.26,pb,z+.25],
   [x-.16,pt,z-.11],[x+.16,pt,z-.11],[x+.16,pt,z+.11],[x-.16,pt,z+.11]),0,0,0);
 } else {
  g.add('turretDetail',cylY(.19,.235,.09,24),x,b+.037,z);
  g.add('turretDetail',cylY(.10,.15,.22,20),x,b+.18,z);
 }
 g.add('turretDetail',box(.84,.07,.24),x,b+.30+mastLift,z);
 // 2026-10-09 (launch RC; accessoryContact.selftest, leo2_revolution "touch only by crossing another piece's surface"):
 // every part is seated on the face it meets, half a millimetre off it, instead of running through it. The trunnions
 // run from the post to the cradle shroud's cheek; the barrel from the shroud's muzzle face to the sleeve's breech
 // face; the sight's bracket from the shroud's cheek; the lid stands on the box; the feed chute runs from the box's
 // side through the shroud's cheek to the gun body it feeds (and holds). The trunnions, the muzzle sleeve and the lid are
 // the overlaps the Oplot-M's 12.7 mm station had too.
 const seatGap=.0005,cheek=.20,front=.30;
 for(const s of[-1,1]){
  g.add('turretDetail',box(.047,.29,.20),x+s*.40,y-.13,z);
  g.add('turretDark',cylX(.065,.425-cheek-seatGap,20),x+s*(.425+cheek+seatGap)/2,y,z);
 }
 g.stage('pitch');
 g.add('turretDark',box(.20,.16,.52),x,y,z-.05);
 // 2026-10-11 (fleet-weapons lane, round 3b; wave 348's critics: the Leclerc's and the Leopards' station guns "a plain
 // dark rod ending in a rounded knob", the Oplot-M's "a thick, featureless dark-grey cylinder with no muzzle device"):
 // the 30 mm gun is a slimmer barrel ending in a three-baffle muzzle brake around its bore; the 12.7 mm gun is the
 // fleet's NSV-family barrel (gas cylinder and block, flash hider) from the shroud's muzzle face to the muzzle. Each
 // still meets the shroud's face half a millimetre off it.
 if(caliber===30){
  const brakeL=.16, barrelEnd=tip-brakeL;
  g.add('turretDark',cylZ(.036,barrelEnd-front-2*seatGap,24),x,y,z+(barrelEnd+front)/2);
  g.add('turretDark',muzzleBrake(.036,.054,.061,caliber/2000,brakeL,.065),x,y,z+barrelEnd);
 } else {
  const sink={add(){}};
  const probe=createPintleLayout({cls:'nsvt',scale:1,remote:true,ammo:false,mount:'external-cradle'},sink);
  const barrelLength=tip-front-seatGap-.10*probe.s-MG_CLASSES.nsvt.flashL*probe.s-.011;
  const dz=z+front+seatGap-probe.trunZ, dy=y-probe.trunY;
  const layout=createPintleLayout({cls:'nsvt',scale:1,remote:true,ammo:false,mount:'external-cradle',barrelLength},{
   add(slot:string,geometry:THREE.BufferGeometry,px=0,py=0,pz=0,rx=0,ry=0,rz=0){
    if(slot!=='shadow')g.add('turretDark',KIT.xform(geometry,px,py,pz,rx,ry,rz),x,dy,dz);
   },
  });
  addPintleBarrel(layout);
 }
 g.add('turretDetail',boxSections([[z-.33,cheek,y+.16,y-.12],[z+.17,cheek,y+.16,y-.12],[z+front,.12,y+.085,y-.085]]),x,0,0);
 // round 4 (the critics: station ammunition boxes "camo-painted instead of issue drab"): the box and its lid are issue drab
 g.add('turretAmmo',box(.24,.30,.39),x-.67,y+.03,z-.10);
 g.add('turretAmmo',box(.255,.021,.405),x-.67,y+.18+seatGap+.0105,z-.10);
 const chute0=.67-.12-seatGap,chute1=.10+seatGap;
 g.add('turretDark',box(chute0-chute1,.06,.11),x-(chute0+chute1)/2,y+.105,z-.10);
 g.add('turretDetail',box(.15,.23,.23),x+.285,y+.15,z+.035);
 g.add('turretDetail',box(.285-cheek-seatGap,.035,.17),x+(.285+cheek+seatGap)/2,y+.075,z+.035);
 for(const dy of[-.047,.052])g.add('turretGlass',cylZ(dy<0?.036:.047,.013,20),x+.285,y+.15+dy,z+.156);
 const station=g.finish();
 station.scale.setScalar(scale);
 station.userData.fieldWeaponScale=scale;
 // Field kit, not reconstructed source: audits that witness a hull's source
 // surfaces skip it (src/vehicles/fieldKitSurface.test-support.mjs).
 station.userData.fieldKitStation=true;
}

/** A cannon's muzzle brake in one piece along +Z from its rear face (z 0): the barrel's section, three baffle rings and
 * a blind bore at the front. */
function muzzleBrake(barrelR:number,bodyR:number,baffleR:number,boreR:number,length:number,depth:number):THREE.BufferGeometry{
 const L=length,steps:[number,number][]=[[0,0],[barrelR*1.02,0],[barrelR*1.02,L*.08],[bodyR,L*.12]];
 for(const [a,b] of [[.24,.31],[.48,.55],[.72,.79]] as const)steps.push([bodyR,L*a],[baffleR,L*a],[baffleR,L*b],[bodyR,L*b]);
 steps.push([bodyR,L],[boreR,L],[boreR,L-depth],[0,L-depth]);
 const lathe=new THREE.LatheGeometry(steps.map(([r,h])=>new THREE.Vector2(r,h)),24);
 lathe.rotateX(Math.PI/2);
 const flat=lathe.toNonIndexed();lathe.dispose();flat.computeVertexNormals();
 return flat;
}
