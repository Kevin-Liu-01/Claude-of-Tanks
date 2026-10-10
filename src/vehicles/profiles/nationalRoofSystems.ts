import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween,boxSections} from './measuredPrimitives.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import type {NationalRoofLoadout} from '../nationalRoofConfig.ts';
const {box,cylY,cylZ}=KIT;

/** Freeze permanent receiving stock before adding the new equipment. ERA is
 * removable and therefore cannot be a mounting foot for a lamp or sensor. */
export function nationalRoofSystems(P:TankBuilderPort,l:NationalRoofLoadout):void {
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),stock:THREE.Mesh[]=[];
 P.forEachBucketPart(['turret','turretExternalArmor'],g=>{
  if(Object.hasOwn(g.userData,'eraHitFaceVertexStarts'))return;
  const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);stock.push(mesh);
 });
 const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
 const seat=(x:number,z:number):number=>{
  ray.ray.origin.set(x,3,z);const hit=ray.intersectObjects(stock,false)[0];
  if(!hit)throw Error(`${P.spec.id}: missing roof-equipment seat at ${x},${z}`);
  return hit.point.y;
 };
 try {
  for(const side of [-1,1])lamp(P,side*.68,.96,seat(side*.68,.96),l.lamp);
  const sides=l.eyes==='twin'?[-1,1]:l.eyes==='monocle-left'?[-1]:[1];
  const cheekEyes=['ru_t80u_modern','ru_t72b3m_modern','cn_t72b3m_modern'].includes(P.spec.id);
  if(cheekEyes) {
   const anchors:number[][]=[];
   for(const side of [-1,1]) {
    const x=side*.90,y=.43;
    const hit=new THREE.Raycaster(new THREE.Vector3(x,y,4),new THREE.Vector3(0,0,-1)).intersectObjects(stock,false)[0];
    if(!hit)throw Error(`${P.spec.id}: missing cheek optic receiver`);
    // Keep the optical head ahead of removable ERA; its bracket reaches the permanent shell.
    const z=hit.point.z+.24;
    P.addEquipment('turretDetail',box(.18,.13,.31),x,y-.08,hit.point.z+.12);
    eye(P,x,z,y-l.eyeRadius-.06,l);
    anchors.push([x,y,hit.point.z]);
   }
   P.turretG.userData.cheekOptics={anchors,axisY:.43};
  }else for(const side of sides)eye(P,side*1.03,.52,seat(side*1.03,.52),l);
  roof(P,-.06,l.roofZ,seat(-.06,l.roofZ),l);
 }finally{material.dispose();}
}

function lamp(P:TankBuilderPort,x:number,z:number,base:number,shape:NationalRoofLoadout['lamp']):void {
 const y=base+.117;
 P.addEquipment('turretDetail',box(.13,.11,.13),x,base+.043,z);
 const round=shape==='round',w=shape==='slit'?.26:.20,h=shape==='slit'?.10:.17;
 P.addEquipment('turretDetail',box(w+.062,.035,.16),x,base+.011,z);
 P.addEquipment('turretDetail',round?cylZ(.11,.19,24):box(w,h,.19),x,y,z+.018);
 P.addEquipment('turretGlass',markVehicleNightLens(round?cylZ(.085,.014,24):box(w-.035,h-.035,.014),'headlight'),x,y,z+.118);
 for(const side of [-1,1])P.addEquipment('turretDark',beamBetween([x+side*(w/2+.022),base-.006,z-.07],[x+side*(w/2+.022),y+h/2+.04,z+.13],.009));
 P.addEquipment('turretDark',box(w+.062,.018,.020),x,y+h/2+.04,z+.13);
}

function eye(P:TankBuilderPort,x:number,z:number,base:number,l:NationalRoofLoadout):void {
 const r=l.eyeRadius,y=base+r+.06;
 P.addEquipment('turretDetail',box(.20,.12,.20),x,base+.05,z);
 if(l.eyes==='flat') {
  P.addEquipment('turretDetail',box(.32,.15,.24),x,base+.18,z);
  P.addModuleVisual('optics','turretGlass',box(.25,.095,.014),x,base+.18,z+.124);
 }else {
  P.addEquipment('turretDetail',cylZ(r+.026,.27,32),x,y,z);
  P.addEquipment('turretDark',cylZ(r,.021,32),x,y,z+.143);
  P.addModuleVisual('optics','turretGlass',cylZ(r*.78,.014,32),x,y,z+.16);
  P.addEquipment('turretDetail',box((r+.035)*2,.021,.22),x,y+r+.037,z+.014);
  for(const side of [-1,1])P.addEquipment('turretDetail',box(.026,r+.10,.18),x+side*(r+.033),y-.02,z);
 }
}

function roof(P:TankBuilderPort,x:number,z:number,base:number,l:NationalRoofLoadout):void {
 P.addEquipment('turretDetail',box(.35,.055,.33),x,base+.017,z);
 if(l.roof==='radome') {
  P.addEquipment('turretDetail',cylY(.10,.16,.18,24),x,base+.125,z);
  P.addEquipment('turretFittingPaint',cylY(.064,.103,.085,24),x,base+.246,z);
  P.addModuleVisual('optics','turretGlass',box(.055,.043,.015),x,base+.25,z+.078);
 } else if(l.roof==='split-panels') {
  P.addEquipment('turretDetail',box(.29,.16,.21),x,base+.10,z);
  for(const side of [-1,1]) {
   P.addEquipment('turretDetail',box(.035,.25,.31),x+side*.16,base+.16,z);
   P.addModuleVisual('optics','turretGlass',box(.011,.12,.22),x+side*.183,base+.16,z);
  }
 } else if(l.roof==='spine') {
  P.addEquipment('turretDetail',boxSections([[z-.16,.155,base+.12,base+.03],[z+.08,.10,base+.28,base+.03],[z+.16,.09,base+.20,base+.03]]),x,0,0);
  for(const dx of [-.057,.057])P.addModuleVisual('optics','turretGlass',cylZ(.035,.014,16),x+dx,base+.16,z+.162);
 } else {
  P.addEquipment('turretDetail',cylY(.065,.105,.12,20),x,base+.075,z);
  P.addEquipment('turretDetail',box(.31,.14,.17),x,base+.19,z);
  P.addModuleVisual('optics','turretGlass',box(.255,.09,.014),x,base+.19,z+.090);
 }
}
