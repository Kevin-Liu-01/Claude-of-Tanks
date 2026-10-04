// Kevin B. Liu — first-party sight package for the upgraded M6 concept.
import * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';

const {box,cylX,cylY,cylZ}=KIT;
type Put=(bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number)=>void;

/** Closed metal barrel with a real aperture; the lens sits inside its rim. */
function lens(P:TankBuilderPort,put:Put,x:number,y:number,z:number,r:number):void {
  const profile=[[r,-.070],[r+.019,-.070],[r+.019,-.009],
    [r+.014,0],[r,0],[r,-.070]].map(([a,b])=>new THREE.Vector2(a,b));
  const rim=new THREE.LatheGeometry(profile,P.q?28:16).rotateX(Math.PI/2);
  put('turretDark',rim,x,y,z);
  put('turretGlass',cylZ(r+.003,.012,P.q?28:16),x,y,z-.049);
}

/** A chamfered rear casting and four separate hood plates leave the face open. */
function hood(put:Put,w:number,h:number,d:number,front:number):void {
  const ring:[number,number][]=[[-w/2+.045,-h/2],[w/2-.045,-h/2],
    [w/2,-h/2+.045],[w/2,h/2-.045],[w/2-.045,h/2],
    [-w/2+.045,h/2],[-w/2,h/2-.045],[-w/2,-h/2+.045]];
  put('turretDetail',sectionSolid([{z:front-d,ring},{z:front-.089,ring}]),0,0,0);
  for(const s of [-1,1]){
    put('turretDetail',box(.035,h-.07,.13),s*(w/2-.0175),0,front-.035);
    put('turretDetail',box(w-.07,.035,.13),0,s*(h/2-.0175),front-.035);
  }
  // Dark recessed instrument face, bolted into the casting behind the lenses.
  put('turretDark',box(w-.05,h-.05,.012),0,0,front-.081);
  for(const x of [-w/2+.051,w/2-.051])for(const y of [-h/2+.051,h/2-.051])
    put('turretDetail',cylZ(.014,.018,8),x,y,front-.066);
}

export function linebackerOptics(P:TankBuilderPort):void {
  const at=(x:number,y:number,z:number,yaw=0):Put=>(bucket,g,dx,dy,dz)=>
    P.addEquipment(bucket,g,x+dx*Math.cos(yaw)+dz*Math.sin(yaw),y+dy,
      z+dz*Math.cos(yaw)-dx*Math.sin(yaw),0,yaw,0);

  // Broad gunner's sight: the mount intersects the sloped right cheek roof.
  P.addEquipment('turretDetail',sectionSolid([
    {z:.02,ring:[[.43,.85],[1.05,.85],[1.05,1.09],[.43,1.09]]},
    {z:.50,ring:[[.47,.78],[1.01,.78],[1.01,1.09],[.47,1.09]]},
  ]));
  const gunner=at(.74,1.255,.26);
  hood(gunner,.70,.38,.45,.25);
  lens(P,gunner,-.16,0,.25,.112); // large thermal channel
  lens(P,gunner,.12,.025,.25,.076); // day channel
  lens(P,gunner,.12,-.105,.25,.025); // separate ranging window
  // Hinged cover stowed along the top, with a hinge barrel and grab handle.
  gunner('turretDetail',box(.56,.025,.31),0,.216,-.015);
  gunner('turretDark',cylX(.024,.54,16),0,.204,-.168);
  for(const x of [-.10,.10])gunner('turretDetail',box(.025,.043,.028),x,.243,.01);
  gunner('turretDetail',box(.225,.023,.028),0,.271,.01);
  for(const y of [-.08,-.025,.03])gunner('turretDark',box(.013,.018,.16),.353,y,-.08);

  // Tall commander panorama: tapered bearing pedestal, fork and a trunnion-
  // mounted sensor head. This is turret-owned equipment, not main armor stock.
  P.addEquipment('turretDetail',box(.43,.06,.42),.77,.93,-.65);
  P.addEquipment('turretDetail',cylY(.17,.205,.16,28),.77,1.035,-.65);
  P.addEquipment('turretDark',cylY(.17,.17,.035,28),.77,1.1275,-.65);
  P.addEquipment('turretDetail',cylY(.115,.15,.17,24),.77,1.2225,-.65);
  P.addEquipment('turretDetail',box(.60,.06,.28),.77,1.3275,-.65);
  for(const side of [-1,1]){
    P.addEquipment('turretDetail',box(.055,.34,.23),.77+side*.271,1.4975,-.65);
    P.addEquipment('turretDark',cylX(.073,.10,20),.77+side*.242,1.63,-.65);
    P.addEquipment('turretDetail',cylX(.046,.012,16),.77+side*.303,1.63,-.65);
  }
  const panorama=at(.77,1.64,-.65);
  hood(panorama,.47,.36,.42,.245);
  lens(P,panorama,-.084,.015,.245,.083);
  lens(P,panorama,.117,.058,.245,.048);
  lens(P,panorama,.117,-.076,.245,.034);
  // Sun shade, rear service lid, cooling slots and armored cable trunk.
  panorama('turretDetail',box(.44,.027,.30),0,.196,.115);
  panorama('turretDark',box(.27,.19,.014),0,0,-.182);
  for(const x of [-.083,0,.083])panorama('turretDetail',box(.032,.14,.021),x,0,-.193);
  P.addEquipment('turretDark',cylY(.028,.028,.28,12),.77,1.15,-.824);
  P.addEquipment('turretDetail',box(.105,.047,.30),.77,.948,-.89);

  // Outward-looking flank cameras on roof-mounted shoes. Recessed circular
  // glass stays exposed in both quality levels; the hoods face away from the gun.
  for(const side of [-1,1]){
    P.addEquipment('turretDetail',box(.19,.13,.24),side*1.055,.96,-.17);
    const camera=at(side*1.055,1.075,-.17,side*Math.PI/2);
    hood(camera,.21,.18,.20,.125);
    lens(P,camera,0,0,.125,.052);
    camera('turretDetail',box(.20,.022,.17),0,.102,.055);
  }
}
