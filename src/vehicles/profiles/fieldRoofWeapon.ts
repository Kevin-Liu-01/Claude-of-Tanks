import { KIT } from './kit.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { blindTube,boxSections } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Point=readonly[number,number,number];

/** Functional independent yaw/pitch station with a receiver, side feed,
 * trunnions, optical head and open bore. Ammunition follows its real caliber. */
export function addFieldRoofWeapon(P:TankBuilderPort,seat:Point,caliber:12.7|30,name:string,mastLift=0):void{
 const [x,b,z]=seat,y=b+.59+mastLift,tip=caliber===30?1.10:.91;
 const g=sourceMachineGun(P,[0,0,0],{name,caliberMm:caliber,yaw:seat,pivot:[x,y,z],muzzle:[x,y,z+tip]});
 const {box,cylY,cylX,cylZ}=KIT;
 g.stage('yaw');
 g.add('turretDetail',cylY(.19,.235,.09,24),x,b+.037,z);
 g.add('turretDetail',cylY(.10,.15,.22,20),x,b+.18,z);
 g.add('turretDetail',box(.84,.07,.24),x,b+.30,z);
 for(const s of[-1,1]){
  g.add('turretDetail',box(.047,.29+mastLift,.20),x+s*.40,y-.13-mastLift/2,z);
  g.add('turretDark',cylX(.065,.25,20),x+s*.30,y,z);
 }
 g.stage('pitch');
 g.add('turretDark',box(.20,.16,.52),x,y,z-.05);
 g.add('turretDark',cylZ(.041,tip-.325,24),x,y,z+(tip+.175)/2);
 g.add('turretDark',blindTube(.054,caliber/2000,.10,.065,24),x,y,z+tip-.05);
 g.add('turretDetail',boxSections([[z-.33,.20,y+.16,y-.12],[z+.17,.20,y+.16,y-.12],[z+.30,.12,y+.085,y-.085]]),x,0,0);
 g.add('turretDetail',box(.24,.30,.39),x-.67,y+.03,z-.10);
 g.add('turretDetail',box(.255,.021,.405),x-.67,y+.19,z-.10);
 g.add('turretDark',box(.57,.06,.11),x-.385,y+.105,z-.10);
 g.add('turretDetail',box(.15,.23,.23),x+.285,y+.15,z+.035);
 g.add('turretDetail',box(.13,.035,.17),x+.22,y+.075,z+.035);
 for(const dy of[-.047,.052])g.add('turretGlass',cylZ(dy<0?.036:.047,.013,20),x+.285,y+.15+dy,z+.156);
 g.finish();
}
