// First-party T-80U solids, authored from scalar studies of the supplied fused
// two-object model. No donor builder or external source topology is imported.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {t80uXWheelSolids} from './t80uXWheels.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const YAW:Point3=[0,1.55158,.0718698169];
const GUN:Point3=[0,1.7564274071,1.4199398169];
export const T80U_X_DATUMS={
  dims:{hullLengthM:6.720291335,overallLengthM:9.534282731,widthM:3.60,heightM:2.172451481},
  turretPivot:YAW,trunnion:GUN,muzzleZ:6.002754533,highestFittingM:2.496602805,
  structuralRoofM:2.172451481,sourceHullBoundsZ:[-3.360145667,3.360145667],
} as const;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=24)=>KIT.cylY(r,r,h,n);
function onTurret(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}
function sight(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0):void {
  P.addModuleVisual('optics',bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,0,0);
}

function hull(P:TankBuilderPort):void {
  P.add('hull',boxSections([
    [-3.36,.533,1.347,1.126],[-3.13,1.038,1.547,1.119],[-2.99,1.038,1.558,.950],
    [-2.65,1.038,1.559,.623],[-2.41,1.038,1.560,.478],[-1.50,1.038,1.563,.478],
    [0,1.038,1.544,.478],[1.50,1.038,1.522,.478],[1.84,1.038,1.487,.478],
    [2.10,1.038,1.387,.478],[2.40,1.038,1.252,.548],[2.70,1.038,1.150,.728],
    [3.015,1.038,1.010,.916],
  ]));
  for(const side of [-1,1]) {
    const a=Math.min(side*1.030,side*1.722),b=Math.max(side*1.030,side*1.722);
    P.addMudguard('t80u-x-fender','hull',roofSheet([
      [-3.36,a,b,1.180,1.180],[-2.86,a,b,1.411,1.411],[-2.40,a,b,1.451,1.451],
      [-1.20,a,b,1.497,1.497],[.60,a,b,1.467,1.467],[2.40,a,b,1.430,1.430],
      [2.90,a,b,1.414,1.414],[3.07,a,b,1.363,1.363],[3.20,a,b,1.226,1.226],
      [3.36,a,b,.939,.939],
    ],.024));
    skirt(P,side);
    for(const z of [-1.834,-1.270,-.705,-.141,.424,.988,1.552])P.addEquipment('hullDetail',box(.028,.045,.561),side*1.709,1.484,z);
  }
  // The broad low apron is a separate thin hanging sheet, not a filled hull.
  P.addMudguard('t80u-x-bow-apron','hullRubber',box(2.04451,.68890,.00902),0,.566517,3.011124);
  for(const x of [-.72,-.591,-.463,-.067,.067,.463,.591,.72])P.addEquipment('hullDetail',beamBetween([x,.925,3.025],[x,.976,3.129],.018));
}

function skirt(P:TankBuilderPort,side:number):void {
  const ring=(bottom:number,top:number)=>{
    const inner=side*1.685,outer=side*1.8,offset=side*.010;
    const points:readonly(readonly[number,number])[]=side<0?
      [[outer,bottom],[outer-offset,bottom],[inner-offset,top],[inner,top]]:
      [[outer-offset,bottom],[outer,bottom],[inner,top],[inner-offset,top]];
    return points;
  };
  P.addMudguard('t80u-x-side-apron','hullRubber',sectionSolid([
    {z:-2.882,ring:ring(.886,1.414)},{z:-2.45,ring:ring(.815,1.458)},
    {z:-1.22,ring:ring(.782,1.504)},{z:1.75,ring:ring(.762,1.449)},
    {z:2.886,ring:ring(.782,1.418)},
  ]));
}

function runningGear(P:TankBuilderPort):void {
  const wheels=t80uXWheelSolids(P.q?26:12);
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.35247,wheelY:.42629,
    wheelW:.347,wheelFaceDepthScale:.81,wheelZs:[-1.96246,-1.107005,-.274385,.47443,1.317665,2.088745],
    wheelTireInnerRadiusM:.2671,wheelCoreGeometry:{disc:wheels.core},
    wheelFaceLayers:[
      {geometry:wheels.left,material:P.mats.wheels,side:-1,name:'t80uXWheelShellL',appearanceRole:'wheelDish'},
      {geometry:wheels.right,material:P.mats.wheels,side:1,name:'t80uXWheelShellR',appearanceRole:'wheelDish'},
      {geometry:wheels.shoulder,material:P.mats.rubber,name:'t80uXWheelRubberShoulders',appearanceRole:'wheelTire'},
    ],
    xc:1.35185,trackW:.55684,trackTh:.024,
    sprocket:{z:-2.676505,y:.917215,r:.292985,trackR:.286},
    idler:{z:2.83887,y:.917215,r:.292985,trackR:.286},
    rollers:[{z:-1.38,y:1.073,r:.10},{z:.20,y:1.073,r:.10},{z:1.78,y:1.073,r:.10}],
    rollerR:.10,returnRollerWidthM:.18,returnRollerInsetM:.10,
    topY:1.173,botY:.082,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.143,
    sprocketDepthScale:.83,idlerDepthScale:.83,
    trackShoeDimensions:{padHeight:.031,grouserHeight:.012,webHeight:.016,hornHeight:.070,pinRadius:.011,pinCentreY:0},
  });
}

function engineDeck(P:TankBuilderPort):void {
  P.addEquipment('hullDetail',box(1.33,.028,.846),0,1.572,-1.647);
  P.addEquipment('hullDetail',box(1.891,.052,.56),-.0015,1.586,-2.801);
  for(let i=0;i<13;i++)P.addEquipment('hullDark',box(1.759,.006,.014),0,1.615,-3.045+i*.041);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.494,.052,1.388),side*1.35,1.516,-2.043);
    for(const z of [-2.884,-2.10,-1.04,.32,1.73])P.addEquipment('hullDetail',box(.568,.029,.079),side*1.364,1.507,z);
    for(const z of [-2.855,-2.61]) {
      P.addEquipment('hullDetail',box(.118,.016,.021),side*.346,1.646,z);
      for(const dx of [-.053,.053])P.addEquipment('hullDetail',box(.014,.05,.021),side*.346+dx,1.629,z);
    }
    P.addEquipment('hullDetail',box(.08,.096,.41),side*1.688,1.235,-.482);
    // This supplied T-80U carries empty drum cradles. Do not invent fuel drums.
    for(const x of [side*1.179,side*1.542]) {
      P.addEquipment('hullDetail',beamBetween([x,1.238,-2.98],[x,1.368,-3.516],.015));
      P.addEquipment('hullDetail',beamBetween([x,1.368,-3.516],[x,1.454,-3.418],.013));
    }
    P.addEquipment('hullDetail',beamBetween([side*1.18,1.30,-3.225],[side*1.542,1.30,-3.225],.017));
  }
  P.addEquipment('hullDark',box(1.094,.181,.286),0,1.329,-3.17);
}

function glacisEra(P:TankBuilderPort):void {
  for(const side of [-1,1]) {
    const a=side<0?-1.025:.077,b=side<0?-.077:1.025;
    const g=roofSheet([[1.85,a,b,1.504,1.504],[2.10,a,b,1.424,1.424],
      [2.40,a,b,1.289,1.289],[2.70,a,b,1.187,1.187],[3.005,a,b,1.053,1.053]],.041);
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(g,[0,1,0]));
      P.addExternalArmor('hull',markEraFurniture(box(.325,.011,.268)),side*.647,1.277,2.480,.40);
      for(const x of [side*.546,side*.670])P.addExternalArmor('hull',markEraFurniture(box(.029,.018,.143)),x,1.351,2.291,.38);
    });
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.0735,.074,24),'headlight'),side*.8475,1.28473,2.62253);
    for(const dx of [-.066,.066])P.addEquipment('hullDetail',beamBetween([side*.8475+dx,1.199,2.60],[side*.8475+dx,1.346,2.67],.0108));
    P.addEquipment('hullDetail',beamBetween([side*.8475-.067,1.366,2.557],[side*.8475+.067,1.366,2.557],.010));
  }
  P.addEquipment('hullDetail',box(.79994,.022,.089),0,1.216,2.7015,.42);
}

function casting(P:TankBuilderPort):void {
  P.add('turret',castSections([
    [-1.35564,.016,.016,1.744,1.55158,1.65],[-1.20,.631,.634,1.871,1.55158,1.74],
    [-.90,.942,.975,2.052,1.55158,1.75],[-.60,1.149,1.161,2.121,1.55158,1.75],
    [-.30,1.311,1.301,2.155,1.55158,1.75],[0,1.380,1.371,2.169,1.55158,1.75],
    [.15,1.401,1.366,2.172451,1.55158,1.75],[.45,1.367,1.314,2.147,1.55158,1.75],
    [.75,1.294,1.205,2.093,1.55158,1.75],[1.05,1.136,1.016,2.027,1.55158,1.75],
    [1.18,.990,.916,1.999,1.55158,1.75],
  ],YAW));
  for(const side of [-1,1])P.add('turret',sectionSolid([[1.17,1.001,2.001],[1.35,.695,1.911],[1.47,.227,1.825]].map(([z,w,y])=>{
    const a=side<0?-w:.222,b=side<0?-.222:w;
    return{z:z-YAW[2],ring:[[a,1.55158-YAW[1]],[b,1.55158-YAW[1]],[b,y-YAW[1]],[a,y-YAW[1]]]};
  })));
  P.add('turret',cylY(.994,.044,40),0,-.006,0);
}

function cheek(P:TankBuilderPort,side:number,x:number,z:number,w:number,depth:number,yaw:number,high:number):void {
  const g=sectionSolid([
    {z:-depth/2,ring:[[-w/2,1.566],[w/2,1.566],[w/2,high],[-w/2,high]]},
    {z:depth/2,ring:[[-w/2,1.566],[w/2,1.566],[w/2,1.605],[-w/2,1.605]]},
  ]);
  onTurret(P,'turretDetail',box(w*.88,.040,depth*.80),x,1.551,z,0,yaw);
  P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>{
    P.addExternalArmor('turret',markEraHitFaces(g,[0,1,0]),x,-YAW[1],z-YAW[2],0,yaw);
  });
}

function turretEra(P:TankBuilderPort):void {
  cheek(P,-1,-1.47,.032,.36,.255,-1.52,1.803);
  cheek(P,-1,-1.438,.484,.48,.272,-1.23,1.831);
  cheek(P,-1,-1.284,.915,.44,.266,-.91,1.834);
  cheek(P,-1,-1.046,1.231,.43,.27,-.59,1.830);
  cheek(P,-1,-.696,1.442,.44,.273,-.28,1.826);
  cheek(P,1,1.443,.091,.459,.230,1.51,1.857);
  cheek(P,1,1.345,.623,.551,.278,1.12,1.861);
  cheek(P,1,1.134,1.047,.364,.274,.77,1.857);
  cheek(P,1,.897,1.286,.336,.261,.46,1.841);
}

function roofEquipment(P:TankBuilderPort):void {
  P.addCupola('turret',cylY(.3455,.076,28),-.6265,2.193-YAW[1],-.225-YAW[2]);
  onTurret(P,'turretDetail',cylY(.328,.028,28),-.6265,2.235,-.225);
  P.addCupola('turret',cylY(.3555,.065,28),.4495,2.1815-YAW[1],-.4315-YAW[2]);
  onTurret(P,'turretDetail',cylY(.333,.025,28),.4495,2.219,-.4315);
  onTurret(P,'turretDetail',cylX(.1965,1.957,28),.0075,1.9205,-1.4725);
  for(const side of [-1,1]) {
    onTurret(P,'turretDetail',box(.025,.433,.422),side*.982,1.918,-1.466);
    onTurret(P,'turretDark',torus(.199,.011,28,6).rotateZ(Math.PI/2),side*.708,1.9205,-1.4725);
    onTurret(P,'turretDetail',beamBetween([side*.61,1.602,-1.02],[side*.80,1.724,-1.45],.015),0,0,0);
  }
  sight(P,'turretDetail',box(.190,.134,.217),.733,2.139,.2645);
  sight(P,'turretDark',box(.146,.062,.014),.733,2.148,.379);
  sight(P,'turretDetail',box(.325,.122,.410),-.7565,2.106,.534,.05);
  sight(P,'turretDark',box(.248,.074,.018),-.7565,2.111,.740);
  onTurret(P,'turretDetail',cylZ(.1935,.150,28),.5355,1.756,1.439);
  onTurret(P,'turretDetail',box(.095,.065,.095),.5355,1.586,1.394);
  onTurret(P,'turretDetail',box(.058,.042,.064),.772,1.740,1.623);
}

function smoke(P:TankBuilderPort):void {
  for(const side of [-1,1])for(const [x,y,z]of [[1.262,1.935,.306],[1.204,1.953,.492],[1.129,1.980,.679],[1.048,1.980,.865]]) {
    onTurret(P,'turretDark',blindTube(.044,.033,.266,.168,20),side*x,y,z,-.66,side*.11);
    onTurret(P,'turretDetail',beamBetween([side*x,y-.084,z-.09],[side*(x-.092),y-.145,z-.112],.016),0,0,0);
  }
}

function machineGun(P:TankBuilderPort):void {
  const gun=sourceMachineGun(P,YAW);
  gun.add('turretDetail',cylY(.035,.273,20),-.955,2.1735,.251);
  gun.add('turretDetail',box(.110,.040,.150),-.955,2.314,.252);
  for(const x of [-.975,-.935])gun.add('turretDetail',box(.016,.142,.069),x,2.342,.2575);
  gun.add('turretDark',box(.045,.080,.610),-.955,2.4566,.424);
  gun.add('turretDetail',box(.094,.061,.174),-.968,2.355,.278);
  gun.add('turretDark',box(.265,.279,.075),-1.1105,2.3515,.4445);
  gun.add('turretDark',cylZ(.012,.477,20),-.955,2.475,.9665);
  gun.add('turretDark',cylZ(.018,.769,20),-.955,2.432,1.1125);
  gun.add('turretDark',blindTube(.025,.012,.130,.110,20),-.955,2.432,1.552);
  gun.add('turretDetail',box(.022,.053,.017),-.955,2.458,1.14);
  gun.finish();
}

function mainGun(P:TankBuilderPort):void {
  const muzzle=T80U_X_DATUMS.muzzleZ,floor=5.83777;
  KIT.buildGun(P,{len:floor-GUN[2],r:.100,baseR:.124,sleeve:false,collar:false});
  // Correct the source's nonphysical elliptical stock with a circular section
  // of equal area; no longitudinal source scaling or silhouette fitting.
  const jacket=(a:number,b:number,rx:number,ry:number)=>P.add('gun',cylZ(Math.sqrt(rx*ry),b-a,32),0,0,(a+b)/2-GUN[2]);
  jacket(1.47523,2.1578,.140465,.123664);jacket(2.1578,3.631,.116514,.102591);
  jacket(3.64995,4.48854,.138267,.121668);
  P.add('gun',blindTube(Math.sqrt(.116514*.102591),.0625,muzzle-4.5077,muzzle-floor,32),0,0,(muzzle+4.5077)/2-GUN[2]);
  P.add('gun',box(.03263,.03482,.83858),0,1.890702-GUN[1],4.069245-GUN[2]);
  P.add('gunMount',cylX(.203,.446,28),0,0,-.004);
  P.add('gunMount',boxSections([[1.18-GUN[2],.21,.238,-.17],[1.37-GUN[2],.224,.223,-.185],[1.58-GUN[2],.142,.126,-.127]]));
  P.muzzleZ=muzzle-GUN[2];
}

export function buildT80UX(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.muzzleZ=T80U_X_DATUMS.muzzleZ-GUN[2];P.topY=T80U_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);engineDeck(P);glacisEra(P);casting(P);turretEra(P);roofEquipment(P);smoke(P);machineGun(P);mainGun(P);
}
export const T80U_X_PROFILES={t80u_x:{build:buildT80UX}} as const;
