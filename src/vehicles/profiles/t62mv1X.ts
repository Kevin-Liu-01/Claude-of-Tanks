// T-62MV-1 X: independently authored solids from the owner-supplied fused
// FBX's scalar sections. No donor builder, model buffer or source texture.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T62MV1_X_ERA_ZONE_NAMES} from '../t62mv1XArmor.ts';
import {addT62MV1Sight} from './t62mv1XSight.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const YAW:Point3=[0,1.446436,.3041853764];
const GUN:Point3=[0,1.6650417561,1.5303753764];
export const T62MV1_X_DATUMS={
  dims:{hullLengthM:6.363553662,overallLengthM:9.510790337,widthM:3.30,heightM:2.082969},
  turretPivot:YAW,trunnion:GUN,muzzleZ:5.920914939,
  highestFittingM:2.757345597,
  structuralRoofM:2.082969,sourceHullBoundsZ:[-3.181776831,3.181776831],
} as const;

// Zone identity is explicit; root supplies X-only Kontakt-1 combat values.
// Backing rails and the permanent cast/hull shells are never depleted.
export const T62MV1_X_ERA_ZONES=T62MV1_X_ERA_ZONE_NAMES;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=24)=>KIT.cylY(r,r,h,n);

function turretPart(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}

function hull(P:TankBuilderPort):void {
  P.add('hull',boxSections([
    [-3.18178,.890,1.084,1.067],[-2.910,.890,1.423205,.780],[-2.470,.890,1.423205,.377],
    [1.890,.890,1.423205,.377],[2.510,.890,1.090,.377],[3.111,.890,.762,.746],
  ]));
  // Source fender carriers are only 51 mm high over the straight course.
  for(const side of [-1,1]) {
    const a=Math.min(side*.885,side*1.55694),b=Math.max(side*.885,side*1.55694);
    P.addMudguard('t62mv1-x-roof','hull',roofSheet([
      [-3.18178,a,b,1.160,1.160],[-2.80,a,b,1.184,1.184],
      [2.50,a,b,1.184,1.184],[2.75,a,b,1.173,1.173],
      [2.94,a,b,1.119,1.119],[3.10,a,b,.994,.994],[3.18178,a,b,.855,.855],
    ],.051));
    P.addMudguard('t62mv1-x-rear','hullRubber',box(.64,.224,.026),side*1.226,1.037,-3.16);
    P.addEquipment('hullDetail',box(.023,.035,5.47),side*1.541,1.196,-.13);
    for(const z of [-2.47,-.57,2.14])P.addEquipment('hullDetail',box(.54,.046,.032),side*1.15,1.194,z);
    for(let i=0;i<10;i++) {
      const a=side*1.650,b=side*1.548,ring:readonly(readonly[number,number])[]=side<0?
        [[a,.492],[a+.008,.492],[b+.008,1.25229],[b,1.25229]]:
        [[a-.008,.492],[a,.492],[b,1.25229],[b-.008,1.25229]];
      const z=-1.52442+i*.284;
      P.addMudguard('t62mv1-x-skirt','hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid([{z,ring},{z:z+.281,ring}]),'t62mv1-x-skirt','hullRubber'));
      P.addEquipment('hullDetail',box(.075,.046,.236),side*1.55,1.230,z+.14);
    }
  }
}

function runningGear(P:TankBuilderPort):void {
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',
    wheelR:.391615,wheelY:.459085,wheelW:.440,wheelFaceDepthScale:.83,
    // The five painted road-wheel faces remain visible through closed rubber rings.
    wheelTireInnerRadiusM:.33679,
    wheelZs:[-1.858795,-.805165,.24309,1.14781,2.00987],xc:1.199465,trackW:.60725,
    sprocket:{z:-2.626375,y:.632135,r:.25066,trackR:.252},
    idler:{z:2.78935,y:.698255,r:.272295,trackR:.270},
    sprocketDepthScale:.91,idlerDepthScale:.86,topY:.891,botY:.073,trackTh:.024,
    paintedEnds:true,arms:true,coveredTop:false,linkPitchM:.135,
    trackShoeDimensions:{padHeight:.031,grouserHeight:.012,webHeight:.016,hornHeight:.073,pinRadius:.011,pinCentreY:0},
  });
}

function deck(P:TankBuilderPort):void {
  P.addEquipment('hullDetail',box(1.627,.053,.469),0,1.449,-1.467);
  for(const x of [-.423,.423]) {
    P.addEquipment('hullDetail',box(.66,.030,.304),x,1.438,-2.60);
    for(let i=0;i<8;i++)P.addEquipment('hullDark',box(.54,.009,.018),x,1.456,-2.718+i*.035);
  }
  for(const side of [-1,1])for(const z of [-2.0,-1.08,1.63]) {
    const x=side*1.19;
    P.addEquipment('hullDetail',box(.56,.17,.845),x,1.263,z);
    P.addEquipment('hullDetail',box(.574,.016,.858),x,1.353,z);
    for(const dz of [-.29,.29])P.addEquipment('hullDark',box(.072,.055,.029),x+side*.280,1.311,z+dz);
  }
  P.addEquipment('hullDetail',box(.221,.197,1.085),1.407,1.275,-.480);
  P.addEquipment('hullDetail',box(.481,.212,.869),1.266,1.286,1.65);
  // Rear drums and the real four narrow inclined hangers, not a filled rack.
  for(const x of [-.458286,.464882]) {
    P.addEquipment('hullDetail',cylX(.305994,.843657,28),x,1.524218,-3.268563);
    for(const dx of [-.269,.269]) {
      P.addEquipment('hullDark',torus(.307,.009,28,6).rotateZ(Math.PI/2),x+dx,1.524218,-3.268563);
    }
  }
  for(const x of [-.71746,-.177,.177,.71746])P.addEquipment('hullDetail',beamBetween([x,1.174,-2.80],[x,1.428,-3.577],.018));
  P.addEquipment('hullDetail',cylY(.264,.043,28),.49,1.441,1.65);
  for(const x of [-.69,-.34])P.addEquipment('hullDetail',cylY(.078,.04,20),x,1.439,1.73);
  for(const x of [-.99,.99]) {
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.061,.073,20),'headlight'),x,1.289,2.178);
    P.addEquipment('hullDark',torus(.068,.010,20,6).rotateX(Math.PI/2),x,1.289,2.218);
  }
}

function hullEra(P:TankBuilderPort):void {
  for(const side of [-1,1]) {
    const zone=`glacis_era_${side<0?'L':'R'}`;
    for(const [z,y,width,x]of [[2.095,1.347,.76,side*.49],[2.374,1.213,.755,side*.39],[2.671,1.035,.765,side*.443]]) {
      P.addEquipment('hullDetail',box(width,.035,.28),x,y-.035,z,.49);
      P.destructibleCluster(zone,()=>{
        P.addExternalArmor('hull',markEraHitFaces(box(width,.065,.305),[0,1,0]),x,y,z,.49);
        for(let i=1;i<5;i++)P.addEquipment('hullDetail',markEraFurniture(box(.006,.007,.290)),x-width/2+i*width/5,y+.035,z,.49);
      });
    }
  }
}

function casting(P:TankBuilderPort):void {
  P.add('turret',castSections([
    [-.9195,.020,.020,1.460,1.446436,1.451],[-.75,.616,.622,1.847,1.446436,1.57],
    [-.45,.95,.95,2.059,1.446436,1.64],[-.15,1.125,1.125,2.082969,1.446436,1.64],
    [.304,1.224,1.224,2.082969,1.446436,1.64],[.60,1.184,1.184,2.082969,1.446436,1.64],
    [.90,1.066,1.066,2.046,1.446436,1.64],[1.12,.920,.920,1.985,1.446436,1.64],
  ],YAW));
  // Independent cheek returns preserve the internal space occupied by the
  // pitching canvas/cradle instead of projecting a solid block through it.
  for(const side of [-1,1]) {
    const rows=[[1.11,.925,1.988],[1.35,.697,1.904],[1.595,.243,1.791]];
    P.add('turret',sectionSolid(rows.map(([z,w,top])=>{
      const l=side<0?-w:.235,r=side<0?-.235:w;
      return {z:z-YAW[2],ring:[[l,1.446436-YAW[1]],[r,1.446436-YAW[1]],[r,top-YAW[1]],[l,top-YAW[1]]]};
    })));
  }
  P.add('turret',cylY(1.156,.045,48),0,-.015,0);
}

function cheekArmor(P:TankBuilderPort):void {
  const tiles:readonly(readonly[number,number,number,number,number,number])[]=[
    [-.835,1.992,.813,.66,.70,-.49],[-1.056,1.851,.924,.65,.70,-.49],
    [.51,2.022,1.133,.76,.62,.52],[.68,1.883,1.307,.76,.62,.52],
  ];
  for(const [x,y,z,w,d,ry]of tiles) {
    turretPart(P,'turretDetail',box(w,.030,d),x,y-.07,z,.27,ry);
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>{
      P.addExternalArmor('turret',markEraHitFaces(box(w,.115,d),[0,1,0]),x,y-YAW[1],z-YAW[2],.27,ry);
      for(let i=1;i<5;i++)turretPart(P,'turretDetail',markEraFurniture(box(.005,.008,d*.94)),x+(i-2.5)*w/5,y+.061,z,.27,ry);
    });
  }
}

function roofEquipment(P:TankBuilderPort):void {
  for(const [x,z,r,y]of [[.495,-.154,.342,2.118],[-.593,.087,.321,2.118]]) {
    P.addCupola('turret',cylY(r,.038,32),x,y+.019-YAW[1],z-YAW[2]);
    turretPart(P,'turretDetail',cylY(r*.92,.035,32),x,y+.052,z);
  }
  turretPart(P,'turretDetail',box(.69,.17,.61),-.83,1.854,-.40,0,-.18);
  turretPart(P,'turretDetail',box(.71,.016,.63),-.83,1.947,-.40,0,-.18);
  turretPart(P,'turretDetail',box(.62,.155,.66),.86,1.802,-.40,0,.18);
  turretPart(P,'turretDetail',box(.64,.016,.68),.86,1.887,-.40,0,.18);
  for(const x of [-.72,.73])turretPart(P,'turretDetail',box(.045,.046,.14),x,1.96,-.67);
  // Source raised fore sight: two actual legs leave daylight below its roof.
  for(const x of [-.55,-.31])turretPart(P,'turretDetail',box(.032,.252,.155),x,1.90,1.377);
  turretPart(P,'turretDetail',box(.40,.038,.220),-.405,2.045,1.444);
  turretPart(P,'turretDark',box(.244,.108,.052),-.43,2.099,1.492);
  turretPart(P,'turretDetail',cylZ(.216,.154,28),-.432,2.283,1.439);
  turretPart(P,'turretDetail',box(.034,.259,.069),-.54,2.267,1.44);
  turretPart(P,'turretDetail',box(.034,.259,.069),-.32,2.267,1.44);
  turretPart(P,'turretDetail',cylY(.029,.467,16),.884,2.171,.37);
}

function machineGun(P:TankBuilderPort):void {
  const gun=sourceMachineGun(P,YAW);
  // Measured asymmetrical DShK/NSV-style receiver, cradle forks and open
  // forward sight. All pieces belong to one real visible fitting group.
  gun.add('turretDetail',box(.55,.045,.048),-.585,2.207,-.252);
  for(const x of [-.677,-.509]) {
    gun.add('turretDetail',box(.040,.35,.10),x,2.384,.305);
    gun.add('turretDetail',box(.034,.088,.460),x,2.322,.727);
  }
  gun.add('turretDark',box(.096,.100,.51),-.59,2.492,.369);
  gun.add('turretDark',box(.298,.188,.145),-.342,2.464,.473);
  gun.add('turretDetail',box(.074,.145,.12),-.651,2.615,.215);
  gun.add('turretDark',box(.092,.145,.154),-.628,2.684,.212);
  gun.add('turretDark',cylZ(.029,.628,20),-.590,2.502,.920);
  gun.add('turretDark',cylZ(.016,.255,20),-.590,2.504,1.34);
  gun.add('turretDark',blindTube(.033,.017,.047,.032,20),-.590,2.501,1.485);
  gun.add('turretDetail',box(.013,.132,.025),-.590,2.539,1.316);
  gun.finish();
}

function gunAssembly(P:TankBuilderPort):void {
  // The solid core ends at the actual collar joint, behind its recessed floor.
  KIT.buildGun(P,{len:5.6434312227-GUN[2]+.02,r:.08475,baseR:.12090,sleeve:false,collar:false});
  P.add('gun',cylZ(.106,.871,28),0,0,4.0635-GUN[2]);
  P.add('gun',blindTube(.09785,.0575,5.920914939-5.643431223,5.920914939-5.65940,28),0,0,(5.920914939+5.643431223)/2-GUN[2]);
  P.add('gunMount',cylX(.227,.454,28),0,0,-.02);
  const ring=(z:number,w:number,top:number,low:number)=>({z:z-GUN[2],ring:[[-w,low-GUN[1]],[w,low-GUN[1]],[w,top-GUN[1]],[-w,top-GUN[1]]] as const});
  P.add('gunMount',sectionSolid([ring(1.276,.227,1.9707,1.4903),ring(1.525,.227,1.8834,1.52),ring(1.69,.17,1.7898,1.5437)]));
  P.muzzleZ=T62MV1_X_DATUMS.muzzleZ-GUN[2];
}

export function buildT62MV1X(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.muzzleZ=T62MV1_X_DATUMS.muzzleZ-GUN[2];P.topY=T62MV1_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);deck(P);hullEra(P);casting(P);cheekArmor(P);roofEquipment(P);machineGun(P);gunAssembly(P);
  addT62MV1Sight(P);
}

export const T62MV1_X_PROFILES={t62mv1_x:{build:buildT62MV1X}} as const;
