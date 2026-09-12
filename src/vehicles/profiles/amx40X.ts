// Original AMX-40 X authoring. The private GLB supplies scalar measurements,
// never playable vertex/index buffers, materials or a donor visual builder.
import * as THREE from 'three';
import {roundedTrackContact} from './roundedTrackContact.ts';
import {KIT} from './kit.ts';
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import {beamBetween,blindTube} from './measuredPrimitives.ts';
import {addAmx40CastNose,addAmx40Cupola,addAmx40LauncherGuard,addAmx40SideStowage,
  addAmx40RearInsulator,addAmx40FrontInsulator} from './amx40XTurretEquipment.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {addAmx40RightRoofGrip,addAmx40ObliqueRoofSight,addAmx40WeaponSideMechanism} from './amx40XRoofFixtures.ts';
import {addAmx40RearStowage} from './amx40XRearStowage.ts';
import {addAmx40Mantlet} from './amx40XMantlet.ts';
import {addAmx40HullSkirts,addAmx40HullSideFittings} from './amx40XHullSkirts.ts';
import {addAmx40FrontFittings} from './amx40XFrontFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylX,cylY,cylZ,torus}=KIT;
const YAW=[-.03904,1.56289,.16819] as const;
const GUN=[-.00005,1.94827,1.3413] as const;
export const AMX40_X_DATUMS=Object.freeze({
  dims:{hullLengthM:6.6816,overallLengthM:10.0588002,widthM:3.3585,heightM:2.50869},
  turretPivot:YAW,trunnion:GUN,muzzleZ:6.6028,highestFittingM:5.11445,
  wheelZs:[-2.09295,-1.32125,-.49710,.27870,1.22035,2.15535],
  jointBasis:'measured circular cast-foot centre; inferred internal mantlet station; repeated tube axis',
});

function put(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,
  x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  const frame=slot.startsWith('turret')?YAW:slot.startsWith('gun')?GUN:[0,0,0];
  P.addEquipment(slot,g,x-frame[0],y-frame[1],z-frame[2],rx,ry,rz);
}

function hull(P:TankBuilderPort):void {
  const station=(z:number,top:number,bottom:number,shoulder:number,outerRoof=top):SolidSection=>{
    const wallTop=Math.min(outerRoof-.008,1.272),outerFloor=Math.min(outerRoof-.006,1.289);
    // Rear transmission floor is broad; the central fighting compartment
    // has a narrow flat keel and oblique bilges. A constant-width keel
    // incorrectly removes rear floor while filling the central side air.
    // The source's hidden wall touches the inner belt envelope. Keep 28.9mm
    // of local running clearance without moving its measured wheel stations.
    const wall=Math.min(.956,shoulder-.030);
    const keel=Math.min(z<=-2.05?.972:.3699,wall-.010);
    const measuredBilge=z<=-2.05?bottom+.16:z<=1.9522?
      (.385959*wall+.275229-.00179846*z)/.922514:
      (.406745*wall+.122855*z-.000795)/.905243;
    const bilge=Math.min(wallTop-.020,Math.max(bottom+.012,measuredBilge));
    return{z,ring:[[-keel,bottom],[keel,bottom],[wall,bilge],[wall,wallTop],
      [shoulder,outerFloor],[shoulder,outerRoof],[wall,top],[-wall,top],
      [-shoulder,outerRoof],[-shoulder,outerFloor],[-wall,wallTop],[-wall,bilge]]};
  };
  P.add('hull',sectionSolid([
    station(-3.3408,1.712,.6739,1.593),station(-3.0342,1.712,.471,1.593),
    station(-2.20,1.710,.45922,1.593),station(-2.05,1.710,.4571,1.593),
    station(-2.04,1.709,.4571,1.593),station(-1.06,1.6392,.457,1.593),
    station(1.55,1.6157,.4565,1.593),station(2.26,1.4875,.4671,1.593),
    station(2.70,1.408,.5315,1.593,1.397),station(2.80,1.3899,.6039,1.593,1.3345),
    station(3.00,1.3539,.7807,1.593,1.3142),station(3.20,1.3179,1.137,1.593,1.2925),
    station(3.3408,1.187,1.105,.534),
  ]));
  addAmx40HullSkirts(P);addAmx40HullSideFittings(P);addAmx40FrontFittings(P);
  for(const s of[-1,1]) {
    P.addMudguard('amx40-x-aft-flap','hullRubber',box(.560,.425,.025),s*1.277,.885,-3.39,.14);
    put(P,'hullDetail',box(.17,.14,.13),s*.697,.739,-3.344);
    put(P,'hullDark',torus(.061,.017,18,8),s*.697,.739,-3.408,Math.PI/2);
    put(P,'hullDetail',box(.092,.135,.115),s*.76,.88,3.03);
    put(P,'hullDark',torus(.055,.015,18,8),s*.76,.88,3.10,Math.PI/2);
  }
  hullDeck(P);
}

function hullDeck(P:TankBuilderPort):void {
  for(const x of[-.855,-.315,.320,.865]) {
    put(P,'hullDetail',box(.537,.044,1.02),x,1.739,-2.741);
    for(let i=0;i<17;i++)put(P,'hullDark',box(.488,.011,.023),x,1.766,-3.185+i*.055);
  }
  for(const s of[-1,1]) {
    put(P,'hullDetail',box(.945,.024,1.068),s*.48,1.698,-1.644,.101);
    for(let i=0;i<18;i++)put(P,'hullDark',box(.865,.015,.026),s*.48,1.72+i*.0049,-2.15+i*.056);
    put(P,'hullDark',box(.45,.239,.047),s*1.133,1.430,-3.37);
    for(let i=0;i<7;i++)put(P,'hullDetail',box(.469,.018,.042),s*1.133,1.321+i*.034,-3.40);
    put(P,'hullDetail',cylZ(.046,.78,20),s*1.49,1.448,-2.86);
  }
  P.addHatch('hull',cylY(.347,.347,.030,32),.4107,1.568,2.023,-.174);
  for(const x of[.181,.411,.641]) {
    put(P,'hullDetail',box(.171,.071,.094),x,1.617,1.774);
    put(P,'hullGlass',box(.137,.035,.004),x,1.628,1.823);
  }
  put(P,'hullDetail',box(.72,.084,.031),.04,1.069,-3.443);
  put(P,'hullDetail',box(.112,.22,.064),0,.88,-3.43);
}

type TurretRow=readonly[z:number,low:number,roof:number,left:number,right:number,upper:number];
function turretCasting(P:TankBuilderPort):void {
  const rows:TurretRow[]=[[-1.8748,1.778,2.250,1.035,1.080,.902],
    [-1.5,1.7515,2.295,1.0871,1.1314,.943],[-1,1.7205,2.3551,1.1545,1.1998,.985],
    [-.5,1.6916,2.3847,1.2212,1.2665,1.027],[0,1.6698,2.3845,1.2873,1.3261,1.091],
    [.5,1.6708,2.3853,1.3367,1.3185,1.044],[.934,1.6721,2.3856,1.2276,1.1828,.866],
    [1.28,1.6886,2.2781,1.1351,1.0014,.805]];
  P.add('turret',sectionSolid(rows.map(([z,low,roof,left,right,upper])=>({z:z-YAW[2],ring:[
    [-left*.86,low],[right*.86,low],[right,low+(roof-low)*.12],
    [right*.96,low+(roof-low)*.40],[upper,roof],[-upper,roof],
    [-left*.96,low+(roof-low)*.40],[-left,low+(roof-low)*.12],
  ].map(([x,y])=>[x-YAW[0],y-YAW[1]] as [number,number])}))));
  P.add('turret',cylY(.96,.96,.2056,48),0,.1028,0);
  addAmx40CastNose(P);
  frontRoofBridge(P);
  addAmx40RearStowage(P);
  for(const[x,w]of[[-.610,.5705],[.307,1.2483]])
    put(P,'turretDetail',box(w,.019,.96),x,2.431,-1.383,-.106);
  for(const s of[-1,1]) {
    const path:[number,number,number][]=[[s*.989,2.016,.66],[s*1.537,2.016,.50],[s*1.527,2.016,-1.44],[s*1.02,2.016,-1.807]];
    for(let i=0;i<path.length-1;i++)put(P,'turretDetail',beamBetween(path[i],path[i+1],.015),0,0,0);
    for(const z of[-1.31,-.44,.36])put(P,'turretDetail',beamBetween([s*1.529,2.016,z],[s*1.222,1.809,z],.013),0,0,0);
  }
  turretFittings(P);
}

function frontRoofBridge(P:TankBuilderPort):void {
  // Separate source roof apron, roughly 14mm thick. It spans the clearance
  // over the pitching mantlet; a filled wedge here would destroy that air.
  const row=(z:number,y:number,left:number,right:number):SolidSection=>({z:z-YAW[2],ring:[
    [left-YAW[0],y-.0136-YAW[1]],[right-YAW[0],y-.0136-YAW[1]],
    [right-YAW[0],y-YAW[1]],[left-YAW[0],y-YAW[1]],
  ]});
  P.add('turret',sectionSolid([
    row(.93479,2.39149,-.47944,.40996),
    row(.94989,2.38859,-.68654,.61526),
    row(1.42699,2.24359,-.80764,.73826),
    row(1.51779,2.23669,-.80764,.73826),
  ]));
}

function turretFittings(P:TankBuilderPort):void {
  // Six forward-facing tubes per bank, nested on the inclined cast cheek.
  // The source has a stacked array, not three sideways cylinders on the rail.
  for(const s of[-1,1]) {
    const dz=s<0?.04:0;
    for(const [x,y,z] of [[1.095,1.973,1.184],[1.064,2.096,1.184],[1.037,2.223,1.180],
      [1.194,2.003,1.043],[1.121,2.122,1.030],[1.073,2.246,1.038]]) {
      put(P,'turretDetail',box(.107,.087,.055),s*x,y,z-.089+dz);
      put(P,'turretDetail',blindTube(.057,.043,.207,.017,18),s*x,y,z+dz,-.15,s*.17);
    }
    for(const z of[-1.68,-1.20,-.75,-.29,.17,.47]) {
      put(P,'turretDetail',beamBetween([s*1.533,2.006,z],[s*1.414,1.794,z],.011),0,0,0);
      put(P,'turretDetail',beamBetween([s*1.414,1.794,z],[s*1.262,1.794,z],.010),0,0,0);
    }
    put(P,'turretDetail',beamBetween([s*1.417,1.803,-1.74],[s*1.417,1.803,.52],.010),0,0,0);
  }
  addAmx40LauncherGuard(P);
  addAmx40SideStowage(P);
  // Source roof station hardware; their air gaps are left between real posts.
  for(const[x,z,h]of[[.490,.490,.177],[.935,.019,.160]]) {
    put(P,'turretDetail',cylY(.086,.086,.013,22),x,2.402,z);
    put(P,'turretDetail',box(.095,h,.098),x,2.410+h/2,z);
    put(P,'turretGlass',box(.066,.065,.004),x,2.442+h/2,z+.051);
  }
  addAmx40ObliqueRoofSight(P);
  addAmx40RightRoofGrip(P);
  roofWeapon(P);
}

function roofWeapon(P:TankBuilderPort):void {
  // Cupola-mounted light weapon: receiver, aligned barrel and actual support.
  const mg=sourceMachineGun(P,YAW);
  mg.add('turretDetail',box(.105,.104,.092),-1.112,2.469,-.22);
  mg.add('turretDark',cylY(.039,.050,.12,18),-1.144,2.538,-.20);
  mg.add('turretDark',box(.145,.110,.347),-1.172,2.606,-.0835);
  mg.add('turretDark',box(.102,.081,.146),-1.172,2.587,-.330);
  mg.add('turretDark',cylZ(.019,.522,18),-1.172,2.607,.146);
  mg.add('turretDark',blindTube(.025,.006,.057,.030,18),-1.172,2.607,.378);
  mg.add('turretDetail',cylZ(.118,.013,24),-1.070,2.659,.350);
  addAmx40WeaponSideMechanism(mg);
  for(const z of[-.230,-.060])mg.add('turretDark',box(.167,.015,.014),-1.172,2.671,z);
  mg.finish();
}

function recess(P:TankBuilderPort,slot:string,x:number,y:number,z:number,w:number,h:number,d:number):void {
  const lip=.024;
  for(const s of[-1,1])put(P,slot,box(lip,h,d),x+s*(w-lip)/2,y,z);
  for(const s of[-1,1])put(P,slot,box(w-2*lip,lip,d),x,y+s*(h-lip)/2,z);
  put(P,slot,box(w,h,.017),x,y,z-d/2);
  const glass=slot.startsWith('gun')?'gunMountGlass':'turretGlass';
  put(P,glass,box(w-2*lip,h-2*lip,.004),x,y,z-d*.15);
}

function turretRoof(P:TankBuilderPort):void {
  addAmx40Cupola(P);
  put(P,'turretDetail',cylY(.2845,.2845,.0293,32),.446,2.416,.00919);
  for(const x of[.24,.66])put(P,'turretDetail',beamBetween([x,2.435,-.05],[x,2.48,.10],.014),0,0,0);
  // The separate source rear meteo mast is unchanged by cupola correction.
  const mast=[[0,2.35049],[.114,2.35049],[.114,2.58729],[.04945,2.66349],
    [.04945,2.86369],[.03415,2.86369],[.03415,3.06489],[.04093,3.07069],
    [.04093,3.11269],[0,3.11269]];
  put(P,'turretDetail',new THREE.LatheGeometry(mast.map(([r,y])=>new THREE.Vector2(r,y)),24),.01306,0,-1.77856);
  recess(P,'turretDetail',-.5584,2.787,.0582,.220,.175,.0953);
  for(const x of[-1.007,1.024]) {
    put(P,'turretDetail',box(.112,.095,.126),x,2.194,-1.693);
    addAmx40RearInsulator(P,x);
    put(P,'turretDark',cylY(.004,.008,4.15041-2.64721,10),x,(4.15041+2.64721)/2,-1.693);
  }
  addAmx40FrontInsulator(P);
  put(P,'turretDark',cylY(.004,.009,5.11445-2.82345,10),.7195,(5.11445+2.82345)/2,.7057);
}

function cannon(P:TankBuilderPort):void {
  addAmx40Mantlet(P);
  for(const x of[-.901,-.752])put(P,'gunMount',cylX(.023,.032,16),x,2.163,1.9239);
  // Proud left sight shield and trunnion hinge caps belong to the pitching
  // mantlet, not to the stationary turret shell.
  put(P,'gunMount',box(.2251,.2284,.0474),-.82695,2.28267,1.9239);
  for(const x of[-.635,.560])put(P,'gunMount',cylX(.032,.095,20),x,2.2166,1.563);
  put(P,'gunMount',torus(.027,.007,20,8),.00225,2.1747,1.937,0,0,Math.PI/2);
  put(P,'gunMountDark',blindTube(.0544,.027,.498,.034,24),.39113,1.93393,2.5472);
  // Measured stepped sleeve diameters; the muzzle is the narrow end of the
  // tube, not a larger decorative collar. The source has no forward MRS box.
  const barrel=[[2.1373,.1623],[2.9214,.1377],[2.9214,.1244],
    [3.7337,.1244],[3.7337,.11432],[4.6458,.11432],[4.6458,.10702],
    [5.5579,.10702],[5.5579,.10182],[6.4192,.10503],[6.4427,.07552],
    [6.6028,.07485],[6.6028,.0632],[5.3665,.0614],[5.3665,0],[2.1373,0]];
  P.add('gun',new THREE.LatheGeometry(barrel.map(([z,r])=>new THREE.Vector2(r,z-GUN[2])),32)
    .rotateX(Math.PI/2).rotateZ(Math.PI/32));
  P.muzzleZ=6.6028-GUN[2];
}

function wheelFaces():THREE.BufferGeometry {
  const pieces:THREE.BufferGeometry[]=[];
  for(const s of[-1,1]) {
    pieces.push(torus(.307,.010,32,8).rotateZ(Math.PI/2).translate(s*.164,0,0));
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      pieces.push(box(.033,.055,.176).rotateX(-a).translate(s*.155,
        Math.sin(a)*.190,Math.cos(a)*.190));
      pieces.push(cylX(.019,.042,6).translate(s*.154,Math.sin(a)*.234,Math.cos(a)*.234));
    }
  }
  return KIT.mergeAll(pieces);
}

function buildAmx40X(P:TankBuilderPort):void {
  P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  hull(P);turretCasting(P);turretRoof(P);cannon(P);
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelR:.3401,wheelW:.3211,wheelY:.41530,
    wheelZs:[...AMX40_X_DATUMS.wheelZs],xc:1.2738,trackW:.587,trackTh:.024, // fleet track standard 2026-09-12
    roadWheelOutsetM:.02335,wheelFaceDepthScale:.70,wheelTireInnerRadiusM:.282,
    wheelFaceLayers:[{geometry:wheelFaces(),material:P.mats.wheels,name:'amx40WheelPressedFaces'}],
    trackShoeDimensions:{webHeight:.035,padHeight:.030,grouserHeight:.012,hornHeight:.055,pinRadius:.010,pinCentreY:0},
    sprocket:{z:-2.8357,y:.78885,r:.3506,trackR:.322,toothTipRadiusM:.3506,
      axleOutsetM:.0166,axialScaleLeft:.85,axialScaleRight:.85},
    idler:{z:2.77110,y:.8976,r:.3042,trackR:.274,axleOutsetM:.02895,
      axialScaleLeft:.65,axialScaleRight:.65},
    rollers:[-1.6338,-.6815,.0856,1.0379,1.92295].map(z=>({z,y:.96065,r:.1575})),
    rollerR:.1575,returnRollerWidthM:.24,returnRollerInsetM:.012,
    loopPoints:roundedTrackContact(KIT.trackLoopPoints({
      idler:{z:2.7711,y:.8976,r:.274},sprocket:{z:-2.8357,y:.78885,r:.322},
      botY:.048,topY:1.151,sag:.022,
      contact:KIT.runningGearContactPatch(AMX40_X_DATUMS.wheelZs,.3401),
      supports:[-1.6338,-.6815,.0856,1.0379,1.92295].map(z=>({z,y:1.12815})),
    }),.048,.3673),
    rigidLinkChords:true,
    topY:1.151,botY:.048,arms:true,paintedEnds:true,coveredTop:true,
  });
  P.topY=AMX40_X_DATUMS.highestFittingM-YAW[1];
  P.hullG.userData.xRebuild={candidate:'amx40_x',independent:true,datumVersion:1,sourceLocalOnly:true};
}

export const AMX40_X_PROFILES={amx40_x:{build:buildAmx40X}} as const;
