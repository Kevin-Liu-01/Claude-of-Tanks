// Independent T-72B obr.1987 source study. The supplied two-object model is
// fused; only geometric scalar measurements inform these original solids.
import * as THREE from 'three';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const YAW:Point3=[-.0000548974,1.4040902854,-.0343498434];
const GUN:Point3=[-.0000548633,1.6208176016,1.2669569241];
export const T72B1987_X_DATUMS={
  dims:{hullLengthM:6.737070506,overallLengthM:9.703027867,widthM:3.59,heightM:2.105640266},
  turretPivot:YAW,trunnion:GUN,muzzleZ:5.766827075,highestFittingM:2.880735150,
  structuralRoofM:2.105640266,sourceHullBoundsZ:[-3.368535253,3.368535253],
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
    [-3.36854,1.038,1.229,1.128],[-2.870,1.038,1.229,.630],[-2.530,1.038,1.3269,.41986],
    [-1.48,1.038,1.3269,.41986],[-1.275,1.038,1.38950,.41986],
    [1.58,1.038,1.38950,.41986],[1.84,1.038,1.284,.41986],
    [2.23,1.038,1.124,.495],[2.80,1.038,.890,.650],[3.018,1.038,.801,.794],
  ]));
  for(const side of [-1,1]) {
    const a=Math.min(side*1.032,side*1.7185),b=Math.max(side*1.032,side*1.7185);
    P.addMudguard('t72b1987-x-fender','hull',roofSheet([
      [-3.36854,a,b,1.112,1.112],[-3.17,a,b,1.229,1.229],
      [1.84,a,b,1.237,1.237],[2.72,a,b,1.213,1.213],
      [3.01,a,b,1.194,1.194],[3.15,a,b,1.148,1.148],
      [3.27,a,b,1.065,1.065],[3.36854,a,b,.930,.930],
    ],.052));
    const left=side<0?-1.7185:1.7065,right=left+.012;
    // The forward run under the Kontakt-1 bank is rigid painted steel; the
    // rear rubber-fabric sections are painted in the vehicle scheme as well
    // (fleet paint standard 2026-09-11), so only mud flaps stay black.
    P.addMudguard('t72b1987-x-skirt-rear','hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid([
      [-3.36854,.992,1.112],[-3.05,.904,1.229],[-2.80,.848,1.229],[-1.38,.655,1.231],
    ].map(([z,low,top])=>({z,ring:[[left,low],[right,low],[right,top],[left,top]]}))),'t72b1987-x-skirt-rear','hullRubber'));
    P.addMudguard('t72b1987-x-skirt','hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid([
      [-1.38,.655,1.231],[2.55,.655,1.216],[3.01,.874,1.195],[3.36,.899,.946],
    ].map(([z,low,top])=>({z,ring:[[left,low],[right,low],[right,top],[left,top]]}))),'t72b1987-x-skirt','hullRubber'));
    P.addEquipment('hullDetail',box(.026,.030,5.61),side*1.626,1.439,-.325);
  }
}

function runningGear(P:TankBuilderPort):void {
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.360825,wheelY:.429605,
    wheelW:.369,wheelFaceDepthScale:.81,wheelZs:[-1.835365,-1.024875,-.17634,.599355,1.400955,2.228465],
    // A closed annular tire exposes the recessed painted pressed-steel dish.
    // The old capped rubber cylinders masked it; retain the source axle,
    // rolling radius and steel face, with a fitted 15 mm radial rim overlap.
    wheelTireInnerRadiusM:.3103,
    // Supplied rear tub wall intersects its own inner band by about6 mm.
    // Shift each native lane outward12 mm for real mechanical clearance;
    // retain measured belt width, all axle Z/Y and terminal wheel radii.
    xc:1.3629,xcLeft:1.375065,xcRight:1.359965,trackW:.60311,trackTh:.024,
    sprocket:{z:-2.581595,y:.684305,r:.24317,trackR:.252},
    idler:{z:2.88586,y:.762015,r:.254875,trackR:.250},
    rollers:[{z:-1.30,y:.941,r:.095},{z:.37,y:.949,r:.095},{z:1.74,y:.951,r:.095}],
    rollerR:.095,returnRollerWidthM:.18,returnRollerInsetM:.10,
    topY:1.037,botY:.0813,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.143,
    sprocketDepthScale:.78,idlerDepthScale:.80,
    trackShoeDimensions:{padHeight:.031,grouserHeight:.012,webHeight:.016,hornHeight:.072,pinRadius:.011,pinCentreY:0},
  });
}

function engineDeck(P:TankBuilderPort):void {
  P.addEquipment('hullDetail',box(1.876,.072,.656),0,1.354,-1.848);
  for(const x of [-.49,.49]) {
    P.addEquipment('hullDetail',box(.93,.051,.661),x,1.352,-2.56);
    for(let i=0;i<10;i++)P.addEquipment('hullDark',box(.81,.006,.018),x,1.380,-2.845+i*.060);
  }
  for(const [x,z,w,d,y]of [[-.35,-3.14,.71,.244,1.283],[.61,-3.14,.71,.244,1.283],
    [1.396,-2.74,.393,.777,1.420],[1.395,-.81,.402,.991,1.416],[1.41,.98,.35,.971,1.372],
    [1.375,2.06,.397,.84,1.293],[-1.34,-2.7,.55,.8,1.335],[-1.34,-1.86,.55,.82,1.335]]) {
    P.addEquipment('hullDetail',box(w,.07,d),x,y,z);P.addEquipment('hullDetail',box(w+.012,.009,d+.009),x,y+.04,z);
  }
  for(const side of [-1,1])for(const z of [-2.29,-1.47,.40,1.54])P.addEquipment('hullDetail',box(.559,.029,.078),side*1.34,1.43,z);
  for(const x of [-.592,.592]) {
    P.addEquipment('hullDetail',cylX(.252,.716,28),x,1.520,-3.653);
    for(const dx of [-.229,.229]) {
      P.addEquipment('hullDark',torus(.255,.012,28,6).rotateZ(Math.PI/2),x+dx,1.520,-3.653);
      P.addEquipment('hullDetail',beamBetween([x+dx,1.152,-3.32],[x+dx,1.295,-3.905],.025));
    }
  }
  P.addEquipment('hullDetail',cylX(.090,2.15,24),0,1.04,-3.305);
  P.addEquipment('hullDetail',cylY(.249,.037,28),-.472,1.413,1.693);
  for(const x of [-.795,.795]) {
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.075,.064,20),'headlight'),x,1.047,2.595);
    P.addEquipment('hullDetail',beamBetween([x-.069,1.095,2.52],[x-.069,1.12,2.65],.009));
    P.addEquipment('hullDetail',beamBetween([x+.069,1.095,2.52],[x+.069,1.12,2.65],.009));
  }
}

function glacisEra(P:TankBuilderPort):void {
  for(let row=0;row<4;row++)for(let col=0;col<12;col++) {
    const x=-.920+col*.155,z=1.925+row*.239;
    // The driver's raised round hatch interrupts the top left-center field.
    if(row===0&&col>=2&&col<=7)continue;
    if(row===1&&(col===1||col===10))continue;
    const top=1.36384-row*.098,zone=`glacis_era_${x<0?'L':'R'}`;
    P.addEquipment('hullDetail',box(.140,.025,.239),x,top-.113,z,.393);
    P.destructibleCluster(zone,()=>P.addExternalArmor('hull',markEraHitFaces(box(.1499,.044,.262),[0,1,0]),x,top-.064,z,.393));
  }
}

function skirtEra(P:TankBuilderPort):void {
  for(const side of [-1,1])for(let row=0;row<3;row++)for(let col=0;col<12;col++) {
    const z=-.534+col*.261,y=.877+row*.155,x=side*(side<0?1.753:1.747);
    P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(box(.065,.147,.248),[side,0,0]),x,y,z);
    });
  }
}

function casting(P:TankBuilderPort):void {
  P.add('turret',castSections([
    [-1.360,.018,.018,1.790,1.41439,1.61],[-1.20,.497,.512,1.932,1.41439,1.61],
    [-.90,.832,.829,2.052,1.41439,1.60],[-.60,1.031,1.03,2.092,1.41439,1.60],
    [-.30,1.205,1.203,2.104,1.41439,1.60],[0,1.270,1.270,2.10564,1.41439,1.60],
    [.30,1.25,1.25,2.086,1.41439,1.60],[.60,1.156,1.155,2.010,1.41439,1.60],
    [.90,.958,.957,1.938,1.41439,1.60],[1.04,.798,.798,1.905,1.41439,1.60],
  ],YAW));
  for(const side of [-1,1])P.add('turret',sectionSolid([[1.03,.81,1.909],[1.20,.570,1.835],[1.266,.210,1.794]].map(([z,w,y])=>{
    const a=side<0?-w:.198,b=side<0?-.198:w;
    return {z:z-YAW[2],ring:[[a,1.41439-YAW[1]],[b,1.41439-YAW[1]],[b,y-YAW[1]],[a,y-YAW[1]]]};
  })));
  P.add('turret',cylY(.864824,.101,40),0,0,0);
}

function turretEra(P:TankBuilderPort):void {
  // The upright cheek course follows the bearing arc and its changing yaw.
  for(const side of [-1,1])for(let i=0;i<8;i++) {
    const angle=.18+i*.163,x=side*Math.sin(angle)*1.31,z=YAW[2]+Math.cos(angle)*1.38;
    const yaw=side*angle,zone=`turret_era_${side<0?'L':'R'}`;
    onTurret(P,'turretDetail',box(.186,.238,.035),x,1.570,z-.047,0,yaw);
    P.destructibleCluster(zone,()=>P.addExternalArmor('turret',markEraHitFaces(box(.179,.247,.075),[0,0,1]),x-YAW[0],1.690-YAW[1],z-YAW[2],-.12,yaw));
  }
  // Separate compact roof rows; their pitch follows the real dome station.
  for(const [z,top,start,end,rx]of [[.31,2.174,-.75,.19,.20],[.55,2.126,-.69,.25,.32],[.805,2.064,-.61,.34,.42],[1.036,2.00,-.32,.47,.47]]) {
    for(let x=start;x<=end+.001;x+=.159)P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>{
      onTurret(P,'turretDetail',markEraHitFaces(box(.150,.044,.260),[0,1,0]),x,top-.055,z,rx);
    });
  }
  for(const side of [-1,1])for(const [x,z,y]of [[.84,.51,2.005],[1.00,.50,1.978],[1.13,.20,1.999]]) {
    P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>onTurret(P,'turretDetail',markEraHitFaces(box(.151,.048,.257),[0,1,0]),side*x,y,z,.22,0,-side*.4));
  }
}

function roofEquipment(P:TankBuilderPort):void {
  P.addCupola('turret',cylY(.367,.118,28),-.60,2.135-YAW[1],-.38-YAW[2]);
  onTurret(P,'turretDetail',cylY(.348,.044,28),-.60,2.212,-.38);
  P.addCupola('turret',cylY(.347,.061,28),.568,2.061-YAW[1],-.507-YAW[2]);
  onTurret(P,'turretDetail',cylY(.326,.039,28),.568,2.116,-.507);
  for(const side of [-1,1]) {
    onTurret(P,'turretDetail',box(.68,.328,.82),side*1.02,1.720,-.846,0,side*.51);
    onTurret(P,'turretDetail',box(.70,.019,.83),side*1.02,1.920,-.846,0,side*.51);
    for(const z of [-1.07,-.82])onTurret(P,'turretDark',box(.088,.038,.033),side*1.08,1.949,z);
  }
  onTurret(P,'turretDetail',box(.854,.377,.504),.013,1.738,-1.57);
  onTurret(P,'turretDetail',box(.706,.025,.296),.016,1.951,-1.618);
  onTurret(P,'turretDetail',cylY(.028,.954,14),-.233,2.403,-1.115);
  onTurret(P,'turretDetail',cylZ(.155,.121,24),.947,2.200,-.14);
  onTurret(P,'turretDetail',box(.055,.089,.045),.938,1.995,-.167);
  sight(P,'turretDetail',box(.263,.167,.453),.444,2.036,.557,.15);
  sight(P,'turretDark',box(.207,.086,.020),.444,2.059,.790);
  onTurret(P,'turretDetail',cylZ(.170,.04,24),-.526,1.748,1.303);
}

function smoke(P:TankBuilderPort):void {
  // Source has one twelve-tube bank on the positive side only.
  onTurret(P,'turretDetail',box(.425,.665,.031),1.413,1.799,-.124,-.19,-.19);
  for(let row=0;row<4;row++)for(let col=0;col<3;col++) {
    const x=1.306+col*.119,y=1.569+row*.147,z=.080-row*.045-col*.022;
    onTurret(P,'turretDark',blindTube(.044,.034,.212,.130,18),x,y,z,-.49,-.31);
  }
}

function machineGun(P:TankBuilderPort):void {
  const gun=sourceMachineGun(P,YAW);
  gun.add('turretDetail',box(.104,.117,.061),-.59,2.156,-.779);
  // Upright open hatch plate with a chamfered crown, independently supported.
  const shield:readonly(readonly[number,number])[]=[[-.788,2.158],[-.393,2.158],[-.393,2.64],[-.447,2.723],[-.735,2.723],[-.788,2.64]];
  gun.add('turretDetail',sectionSolid([
    {z:-.817,ring:shield},{z:-.775,ring:shield},
  ]),0,0,0);
  gun.add('turretDark',box(.073,.129,.610),-.587,2.473,-.447);
  gun.add('turretDetail',box(.09,.088,.43),-.587,2.298,-.535);
  gun.add('turretDark',cylZ(.028,.63,20),-.587,2.443,.53);
  gun.add('turretDark',cylZ(.031,.367,20),-.587,2.444,.033);
  gun.add('turretDark',box(.245,.177,.079),-.741,2.38,-.394);
  gun.add('turretDetail',box(.032,.134,.035),-.587,2.46,.548);
  gun.finish();
}

function mainGun(P:TankBuilderPort):void {
  const muzzle=T72B1987_X_DATUMS.muzzleZ,floor=5.59804;
  KIT.buildGun(P,{len:floor-GUN[2],r:.100,baseR:.125,sleeve:false,collar:false});
  // Source stock was anisotropically widened. Preserve its section area, not
  // that physical defect: both axes become sqrt(Rx*Ry), axial datums unchanged.
  const jacket=(a:number,b:number,rx:number,ry:number)=>P.add('gun',cylZ(Math.sqrt(rx*ry),b-a,32),0,0,(a+b)/2-GUN[2]);
  jacket(1.418,2.1159,.12523,.12654);jacket(2.1159,3.59862,.11515,.105);
  jacket(3.61817,4.49972,.13476,.12456);
  // One continuous terminal stock leaves its real bore empty all the way to
  // the source-depth floor; no hidden full-cylinder cap is left in the mouth.
  P.add('gun',blindTube(Math.sqrt(.11515*.105),.0625,muzzle-4.51927,muzzle-floor,32),0,0,(muzzle+4.51927)/2-GUN[2]);
  P.add('gunMount',cylX(.213,.423,28),0,0,-.029);
  P.add('gunMount',boxSections([[1.03-GUN[2],.204,.245,-.18],[1.20-GUN[2],.218,.239,-.185],[1.49-GUN[2],.138,.129,-.13]]));
  P.muzzleZ=muzzle-GUN[2];
}

export function buildT72B1987X(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.muzzleZ=T72B1987_X_DATUMS.muzzleZ-GUN[2];P.topY=T72B1987_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);engineDeck(P);glacisEra(P);skirtEra(P);casting(P);turretEra(P);roofEquipment(P);smoke(P);machineGun(P);mainGun(P);
}
export const T72B1987_X_PROFILES={t72b_1987_x:{build:buildT72B1987X}} as const;
