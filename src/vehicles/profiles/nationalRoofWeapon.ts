import {KIT} from './kit.ts';
import {boxSections,blindTube,beamBetween} from './measuredPrimitives.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import type {NationalRoofLoadout} from '../nationalRoofConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];
type Gun=ReturnType<typeof sourceMachineGun>;
const {box,cylX,cylY,cylZ}=KIT;

/** All pieces share an actual yaw/pitch owner, including the feed and sight.
 * The pedestal and fork stay below pitch stock; the trunnion passes through it. */
export function nationalRoofWeapon(P:TankBuilderPort,rws:Point,cupola:Point,l:NationalRoofLoadout):void {
 const [x,b,z]=rws,y=b+l.axisHeight;
 const gun=sourceMachineGun(P,[0,0,0],{name:l.name,caliberMm:l.caliber,
  yaw:rws,pivot:[x,y,z],muzzle:[x,y,z+l.muzzleZ]});
 const cannon=l.caliber===30,w=cannon?.245:.185,half=supportHalfWidth(l,w);
 gun.stage('yaw');
 gun.add('turretDetail',cylY(.21,.26,.13,32),x,b+.055,z);
 gun.add('turretDetail',cylY(.095,.14,l.axisHeight-.42,20),x,b+(l.axisHeight-.42)/2+.09,z);
 gun.add('turretDetail',box(half*2+.10,.08,.12),x,y-.34,z);
 for(const side of [-1,1]) {
  gun.add('turretDetail',box(.044,.40,.12),x+side*(half+.028),y-.16,z);
  gun.add('turretDark',cylX(.073,.065,20),x+side*(half+.045),y,z);
 }
 gun.stage('pitch');
 gun.add('turretDark',box(w,cannon?.20:.155,cannon?.58:.49),x,y,z-.08);
 gun.add('turretDark',cylX(.055,half*2+.095,20),x,y,z);
 gun.add('turretDark',cylZ(cannon?.059:.047,.18,24),x,y,z+.20);
 const tip=l.muzzleZ,barrelStart=.23;
 gun.add('turretDark',cylZ(cannon?.036:.026,tip-barrelStart-.055,24),x,y,z+(barrelStart+tip-.055)/2);
 gun.add('turretDark',blindTube(cannon?.050:.038,l.caliber/2000,.10,.070,24),x,y,z+tip-.05);
 for(const at of [.31,cannon?.62:.48])gun.add('turretDark',cylZ(cannon?.055:.034,.035,20),x,y,z+at);
 housing(gun,l,x,y,z,w);
 feed(gun,l,x,y,z,w);
 sight(gun,l,x,y,z,w);
 const root=gun.finish();root.userData.nationalRoofLoadout=l.name;
 const [cx,cy,cz]=cupola;KIT.cupola(P,'turret',cx,cy-.006,cz,.27,.11,8);
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
 } else {
  g.add('turretDetail',cylZ(w*.69,.43,24),x,y,z-.12);
  g.add('turretDetail',cylZ(w*.43,.35,24),x,y,z+.22);
  for(const at of [-.30,-.05,.32])g.add('turretDark',cylZ(w*(at===.32?.47:.73),.026,24),x,y,z+at);
 }
}

function feed(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 const side=l.feedSide,fx=x+side*(half+.18),cannon=l.caliber===30;
 if(l.mount==='drum') {
  g.add('turretDetail',cylX(cannon?.205:.165,.25,24),fx,y+.005,z-.10);
  g.add('turretDark',cylX(cannon?.153:.115,.018,24),fx+side*.126,y+.005,z-.10);
 } else {
  const h=cannon?.30:.23;
  g.add('turretDetail',box(.25,h,.38),fx,y+.045,z-.15);
  g.add('turretDetail',box(.269,.026,.399),fx,y+.045+h/2,z-.15);
  for(const dz of [-.26,-.04])g.add('turretDark',box(.036,.048,.032),fx+side*.13,y+.015,z+dz);
 }
 g.add('turretDark',box(.22,.07,.12),x+side*(half+.06),y+(l.mount==='drum'?.17:.19),z-.05);
 g.add('turretDark',box(.065,.15,.12),x+side*(half-.025),y+.125,z-.05);
}

function sight(g:Gun,l:NationalRoofLoadout,x:number,y:number,z:number,w:number):void {
 const half=supportHalfWidth(l,w);
 const side=-l.feedSide,sx=x+side*(half+.16);
 // This foot enters the actual receiver; a high transverse bracket alone
 // leaves daylight above the round drum housing.
 g.add('turretDetail',box(.065,.15,.12),x+side*(w/2-.025),y+.135,z+.015);
 g.add('turretDetail',box(.15,.07,.12),x+side*(half+.02),y+.17,z+.03);
 g.add('turretDetail',box(.155,.19,.23),sx,y+.20,z+.075);
 for(const dy of [-.043,.046])g.add('turretGlass',cylZ(dy<0?.035:.047,.015,20),sx,y+.20+dy,z+.196);
}

function supportHalfWidth(l:NationalRoofLoadout,w:number):number {
 return w*(l.mount==='drum'||l.mount==='wedge'?.74:.5);
}
