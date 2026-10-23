// The T-64BV1's own procedural build (owner 2026-10-21, verbatim: "make the t64bv1 look a lot different from the t72b3,
// rn they look identical"). Until this file the T-64BV1 and the Donbas were the T-72B3 study with a few extra cassettes.
// The Ukrainian T-64BV mod. 2017 (t64bv_donbas) went back to that study (owner 2026-10-22: "the ukranian t64bv1 should
// just be its previous model with an updated name"; t64bv2017.ts, with this build's Kontakt-1 layout).
// First-party solids from published facts (docs/references/tanks/t64bv1.md, "2026-10-21 distinct T-64 build"): six small
// steel-tyred dual road wheels with internal shock absorbers and four return rollers per side, a narrower double-pin
// track, a raised front idler and a twelve-tooth rear sprocket; the 68-degree glacis under a Kontakt-1 brick field, the
// rear exhaust louvre and the two droppable 200 l drums on the transom; the low cast turret with its Kontakt-1 horseshoe,
// the L-2G searchlight left of the gun, the 1G42 sight box, the commander's cupola with its remote NSVT, two banks of four
// 902B dischargers on the left of the turret and the OPVT snorkels on the turret rear.
// The vehicle keeps the physical frame its spec carries (fleetRenewalSpecs.ts copyPhysicalFrame, the T-72B3's): the
// turret ring, the trunnion and the 2A46 tube with its mount are the B3's, so the armour envelope, the anatomy datums
// and the gun line are unchanged. Every deck and fender fitting stays under the barrel's -6 degree sweep (the T-64BV1
// carries no per-yaw depression table).
import * as THREE from 'three';
import {KIT,FITTINGS} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {boxSections,roofSheet,beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {stationFromDrawnGun} from './auxiliaryStation.ts';
import {T72B3_X_SOURCE_DATUMS} from '../t72b3XArmor.ts';
import {buildT72B3XMainGun} from './t72b3X.ts';
import {turnedGearStock,returnRollerStock,gearFastener} from '../runningGearPrimitives.ts';
import {mergeAll} from '../factoryGeometry.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=24)=>KIT.cylY(r,r,h,n);
const YAW=T72B3_X_SOURCE_DATUMS.turretPivot,GUN=T72B3_X_SOURCE_DATUMS.trunnion;
const UP=new THREE.Vector3(0,1,0);

// ---------------------------------------------------------------- hull (hull frame: ground y = 0, +Z forward)
const DECK_Y=1.446,ENGINE_DECK_Y=1.41,FENDER_Y=1.38,TUB_W=1.08,FENDER_W=1.755;
const GLACIS_Z0=1.72,NOSE_Z=3.06,NOSE_Y=.917;
const glacisY=(z:number)=>DECK_Y-(z-GLACIS_Z0)*(DECK_Y-NOSE_Y)/(NOSE_Z-GLACIS_Z0);
const GLACIS_RAKE=Math.atan((DECK_Y-NOSE_Y)/(NOSE_Z-GLACIS_Z0));   // 21.5 degrees off the horizontal: the T-64's 68-degree plate
const frontFenderY=(z:number)=>Math.min(FENDER_Y,glacisY(z)+.02);

function hullCore(P:TankBuilderPort):void {
  // The T-64 tub: vertical transom, a deck that steps down over the transverse 5TDF, the long 68-degree glacis and a
  // short lower nose plate. Narrower and shorter than the T-72's.
  P.add('hull',boxSections([
    [-3.07,TUB_W,1.34,.66],[-3.03,TUB_W,1.37,.56],[-2.95,TUB_W,1.40,.47],[-2.80,TUB_W,ENGINE_DECK_Y,.44],
    [-1.46,TUB_W,ENGINE_DECK_Y,.44],[-1.45,TUB_W,DECK_Y,.44],[GLACIS_Z0,TUB_W,DECK_Y,.44],
    [2.40,TUB_W,glacisY(2.40),.44],[2.70,TUB_W,glacisY(2.70),.44+.42*.30/.66],[NOSE_Z,TUB_W,NOSE_Y,.86],
  ]));
  // The turret-deck collar over the sponsons, closed down onto the fender shelf (the turret base overhangs the tub).
  const collar:readonly(readonly[number,number])[]=[[-1.40,1.081],[-1.10,1.22],[-.55,1.31],[.10,1.33],[.70,1.27],[1.15,1.14],[1.42,1.081]];
  for(const side of [-1,1])P.add('hull',roofSheet(collar.map(([z,w])=>side<0
    ?[z,-w,-1.075,DECK_Y,DECK_Y] as const:[z,1.075,w,DECK_Y,DECK_Y] as const),DECK_Y-FENDER_Y+.002));
}

const REAR_FENDER:readonly(readonly[number,number])[]=[[-3.24,1.20],[-3.12,1.30],[-3.00,1.37],[-2.85,FENDER_Y]];
function fenders(P:TankBuilderPort):void {
  for(const side of [-1,1]){
    const span=(a:number,b:number)=>side<0?[-b,-a] as const:[a,b] as const;
    const [l,r]=span(1.075,FENDER_W),[ol,or]=span(1.40,FENDER_W),[wl,wr]=span(1.075,1.40);
    P.addMudguard('t64bv-x-fender','hull',roofSheet([...REAR_FENDER,[1.94,FENDER_Y]]
      .map(([z,y])=>[z,l,r,y,y] as const),.02));
    // Forward of the shelf the outer guard runs down the glacis line over the idler; the glacis itself carries on
    // over the inner track half as a wing plate, and one mudguard spans the whole track width ahead of it.
    P.addMudguard('t64bv-x-fender-front','hull',roofSheet([1.94,2.20,2.45,2.70]
      .map(z=>[z,ol,or,frontFenderY(z),frontFenderY(z)] as const),.02));
    P.addMudguard('t64bv-x-mudguard','hull',roofSheet([2.70,2.90,3.08,3.24]
      .map(z=>[z,l,r,frontFenderY(z),frontFenderY(z)] as const),.02));
    P.add('hull',roofSheet([1.94,2.20,2.45,2.70].map(z=>[z,wl,wr,glacisY(z),glacisY(z)] as const),.045));
    skirt(P,side);
    flaps(P,side);
  }
}

function skirt(P:TankBuilderPort,side:number):void {
  // Rubber skirt on the fender edge: a shallow band over the return run, so the six small wheels and the rollers stay
  // in sight beneath it (the family's acid tell against the T-72's deep skirt over large wheels).
  const x=side*(FENDER_W-.010),bottom=1.00;
  const stations:readonly(readonly[number,number])[]=[[-2.95,FENDER_Y-.02],[1.94,FENDER_Y-.02],[2.10,frontFenderY(2.10)-.02],[2.30,frontFenderY(2.30)-.02]];
  P.addMudguard('t64bv-x-skirt','hullRubber',sectionSolid(stations.map(([z,top])=>({z,
    ring:[[x-.010,bottom],[x+.010,bottom],[x+.010,top],[x-.010,top]] as readonly SectionPoint[]}))));
  // The painted steel hanger strip along the fender edge that carries the rubber, then the panel joints.
  P.addEquipment('hullDetail',sectionSolid(stations.map(([z,top])=>({z,
    ring:[[x+side*.010-.006,top-.075],[x+side*.010+.006,top-.075],[x+side*.010+.006,top+.004],[x+side*.010-.006,top+.004]] as readonly SectionPoint[]}))));
  for(const z of [-2.25,-1.50,-.75,0,.75,1.50])P.addEquipment('hullDark',box(.008,.25,.030),x+side*.013,1.13,z);
}

function flaps(P:TankBuilderPort,side:number):void {
  const x=side*(1.075+FENDER_W)/2,w=FENDER_W-1.075;
  P.addMudguard('t64bv-x-rear-flap','hullRubber',box(w,.20,.012),x,1.088,-3.232);
  P.addMudguard('t64bv-x-front-flap','hullRubber',box(w,.15,.012),x,frontFenderY(3.232)-.095,3.232);
}

/** One Kontakt-1 container: the reactive body (its +Y face is the hit face) and its bolted lid, oriented by `basis`.
 * The T-64BV mod. 2017 (t64bv2017.ts) lays the same containers on the T-72B3 study. */
export function k1Brick(P:TankBuilderPort,owner:'hull'|'turret',sector:string,basis:THREE.Matrix4,size:Point3):void {
  const [w,th,len]=size;
  // HIGH draws the container's rounded edges; LOW the plain block (the fleet LOW tier's cost rule)
  const body=P.q?box(w,th,len):new THREE.BoxGeometry(w,th,len);
  P.destructibleCluster(sector,()=>{
    P.addExternalArmor(owner,markEraHitFaces(body,[0,1,0]).applyMatrix4(basis));
    P.addExternalArmor(owner,markEraFurniture(box(w*.86,.010,len*.86)).translate(0,th/2+.004,0).applyMatrix4(basis));
  });
}

function glacisEra(P:TankBuilderPort):void {
  // Four staggered courses of K-1 containers seated on the glacis plate (3 mm into it), below the splash board.
  const n=new THREE.Vector3(0,Math.cos(GLACIS_RAKE),Math.sin(GLACIS_RAKE)),th=.075;
  const rotation=new THREE.Matrix4().makeRotationX(GLACIS_RAKE);
  [2.02,2.30,2.58,2.86].forEach((z,row)=>{
    const count=row%2?6:7;
    for(let i=0;i<count;i++){
      const x=(i-(count-1)/2)*.27,p=new THREE.Vector3(x,glacisY(z),z).addScaledVector(n,th/2-.003);
      k1Brick(P,'hull',`glacis_era_${x<0?'L':'R'}`,rotation.clone().setPosition(p),[.24,th,.26]);
    }
  });
  // The V splash board ahead of the driver's periscope, its foot let into the plate along its whole length.
  for(const side of [-1,1])P.addEquipment('hullDetail',box(.50,.14,.025),side*.22,glacisY(1.80)+.02,1.80,0,side*.42,0);
}

function skirtEra(P:TankBuilderPort,side:number):void {
  // The BV's leading skirt sections each carry a K-1 container on the rubber face.
  const th=.075,x=side*(FENDER_W+th/2-.003);
  const rotation=new THREE.Matrix4().makeRotationZ(-side*Math.PI/2);
  for(const z of [1.12,1.49,1.86])
    k1Brick(P,'hull',`skirt_era_${side<0?'L':'R'}`,rotation.clone().setPosition(new THREE.Vector3(x,1.15,z)),[.28,th,.34]);
}

function deck(P:TankBuilderPort):void {
  // Driver's station: flush hatch inside the turret's sweep, the periscope and its guard ahead of it.
  P.addEquipment('hullDetail',cylY(.26,.024,28),0,DECK_Y+.010,1.42);
  P.addEquipment('hullDark',box(.16,.012,.05),0,DECK_Y+.026,1.52);
  P.addEquipment('hullDetail',box(.26,.07,.11),0,DECK_Y+.030,1.66);
  P.add('hullGlass',box(.20,.035,.012),0,DECK_Y+.040,1.716);
  // Engine compartment: the transverse intake grille behind the turret, two access panels over the 5TDF and the
  // cooling-air louvre at the deck's rear edge; all at or under 1.44 m.
  P.snapGroup('t64bv-intake',()=>{
    P.addEquipment('hullDetail',box(1.90,.025,.40),0,ENGINE_DECK_Y+.0125,-1.70);
    for(let i=0;i<9;i++)P.addEquipment('hullDark',box(1.82,.008,.022),0,ENGINE_DECK_Y+.029,-1.86+i*.04);
  },{reachM:.04,mode:'down'});
  for(const x of [-.47,.47])P.snapGroup('t64bv-engine-panel',()=>{
    P.addEquipment('hullDetail',box(.86,.018,.74),x,ENGINE_DECK_Y+.009,-2.36);
    for(const dz of [-.22,.22])P.addEquipment('hullDark',beamBetween([x-.08,ENGINE_DECK_Y+.018,-2.36+dz],[x+.08,ENGINE_DECK_Y+.018,-2.36+dz],.009,6));
  },{reachM:.04,mode:'down'});
  P.snapGroup('t64bv-rear-louvre',()=>{
    P.addEquipment('hullDetail',box(1.86,.02,.12),0,ENGINE_DECK_Y+.01,-2.88);
    for(let i=0;i<3;i++)P.addEquipment('hullDark',box(1.80,.008,.02),0,ENGINE_DECK_Y+.024,-2.92+i*.04);
  },{reachM:.04,mode:'down'});
  // Low fender stowage: the right fender's external fuel tank and tool locker, the left fender's lockers.
  for(const [x,z,len]of [[-1.58,1.42,1.05],[-1.58,-1.90,.60],[1.58,1.55,.80],[1.58,-1.90,.60]]){
    P.snapGroup('t64bv-fender-locker',()=>{
      P.addEquipment('hullDetail',box(.30,.07,len),x,FENDER_Y+.035,z);
      for(const dz of [-len*.36,len*.36])P.addEquipment('hullDark',box(.31,.072,.025),x,FENDER_Y+.036,z+dz);
    },{reachM:.04,mode:'down'});
  }
  P.addEquipment('hullDark',cylY(.045,.03,10),-1.58,FENDER_Y+.085,1.80);
}

function front(P:TankBuilderPort):void {
  // Self-entrenching blade across the lower nose plate.
  const rise=Math.atan2(.42,.66),t=new THREE.Vector3(0,Math.sin(rise),Math.cos(rise));
  const n=new THREE.Vector3(1,0,0).cross(t);
  const mid=new THREE.Vector3(0,.44+.42*(2.85-2.40)/.66,2.85).addScaledVector(n,.022);
  P.addEquipment('hullDetail',box(2.06,.30,.05).applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),t,n).setPosition(mid)));
  for(const x of [-.60,.60]){
    P.addEquipment('hullDark',torus(.07,.02,16,6).rotateY(Math.PI/2),x,.84,3.02);
    P.addEquipment('hullDetail',box(.06,.10,.08),x,.87,2.98);
  }
  // Light clusters on the front mudguards with their guard bars.
  for(const x of [-1.58,1.58]){
    // a level housing on a pedestal let into the sloping mudguard
    const y=frontFenderY(2.94),low=frontFenderY(3.06)-.005;
    P.addEquipment('hullDetail',box(.14,y-low+.01,.12),x,(y+low)/2,3.00);
    P.addEquipment('hullDetail',box(.16,.11,.12),x,y+.055,3.00);
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.050,.016,18),'headlight'),x,y+.06,3.064);
    for(const dx of [-.07,.07])P.addEquipment('hullDetail',beamBetween([x+dx,frontFenderY(3.08)-.005,3.08],[x+dx,y+.14,3.09],.008));
  }
}

function rear(P:TankBuilderPort):void {
  // The 5TDF's exhaust leaves through the louvred box across the top of the transom (the T-72 exhausts on its left
  // flank); the drums ride low on the plate, under the barrel's sweep, with the unditching log beneath them.
  const face=-3.07;
  P.addEquipment('hullDetail',box(1.30,.20,.05),0,1.215,face-.025);
  for(let i=0;i<6;i++)P.addEquipment('hullDark',box(1.24,.012,.06),0,1.14+i*.03,face-.055,.5,0,0);
  // The drums ride the rear corners, either side of the louvre, on a cradle of four arms off the plate and saddles.
  const dz=-3.56,dy=1.00;
  for(const side of [-1,1]){
    const x=side*1.02;
    P.addEquipment('hullDetail',cylX(.29,.64,16),x,dy,dz);
    for(const dx of [-.22,.22])P.addEquipment('hullDark',new THREE.LatheGeometry([[.288,-.03],[.302,-.03],[.302,.03],[.288,.03],[.288,-.03]]
      .map(([r,y])=>new THREE.Vector2(r,y)),16).rotateZ(Math.PI/2),x+dx,dy,dz);
    for(const z of [dz+.16,dz-.16])P.addEquipment('hullDetail',box(.74,.09,.05),x,.715,z);
  }
  for(const x of [-1.00,-.62,.62,1.00])P.addEquipment('hullDetail',box(.05,.05,.78),x,.685,-3.40);
  const log=FITTINGS.unditchingLog({mats:P.mats,len:2.00,r:.10,straps:2,seed:643});
  log.position.set(0,.48,-3.14);P.hullG.add(log);
  for(const x of [-.62,.62])P.addEquipment('hullDetail',box(.06,.14,.12),x,.50,-3.02);
  for(const x of [-.95,.95]){
    P.addEquipment('hullDark',torus(.07,.02,16,6).rotateY(Math.PI/2),x,.56,-3.12);
    P.addEquipment('hullDetail',box(.06,.10,.08),x,.62,-3.09);
    P.addEquipment('hullDark',box(.10,.08,.04),x,1.29,face-.018);
    P.addEquipment('hullDetail',markVehicleNightLens(box(.07,.05,.01),'marker',{tint:'red'}),x,1.29,face-.042);
  }
}

// ---------------------------------------------------------------- running gear
function mergeOwned(parts:THREE.BufferGeometry[]):THREE.BufferGeometry {
  try{return mergeAll(parts);}finally{for(const geometry of parts)if(geometry.index)geometry.dispose();}
}
const T64_WHEEL_R=.275;
/** The T-64 road wheel: two identical stamped halves around the guide channel, each a steel tyre ring over the internal
 * shock-absorbing rubber, a twelve-bolt clamp disc and a pressed dish to the hub. No external rubber tyre. */
function t64RoadWheel(high:boolean) {
  const seg=high?24:10,metal:THREE.BufferGeometry[]=[],rubber:THREE.BufferGeometry[]=[],dark:THREE.BufferGeometry[]=[];
  for(const side of [-1,1]){
    if(high){
      // a narrow, recessed rubber ring between the steel tyre and the clamp disc (LOW hides it behind the disc face)
      rubber.push(turnedGearStock([[.226,.066],[.244,.066],[.244,.124],[.226,.124],[.226,.066]],seg,side));
      metal.push(turnedGearStock([[.243,.048],[.270,.048],[T64_WHEEL_R,.056],[T64_WHEEL_R,.142],[.269,.150],[.243,.150],[.243,.048]],seg,side));
      metal.push(turnedGearStock([[.085,.048],[.228,.048],[.228,.126],[.215,.139],[.150,.139],[.108,.166],[.085,.166],[.085,.048]],seg,side));
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;dark.push(gearFastener(.011,.016,true).translate(side*.146,Math.cos(a)*.180,Math.sin(a)*.180));
      }
    // LOW keeps the silhouette: one closed tyre-ring-and-dish section per half, the rubber ring in its recess
    }else metal.push(turnedGearStock([[.085,.048],[T64_WHEEL_R,.048],[T64_WHEEL_R,.150],[.243,.150],[.243,.139],
      [.150,.139],[.108,.166],[.085,.166],[.085,.048]],seg,side));
  }
  metal.push(turnedGearStock([[0,-.184],[.062,-.184],[.088,-.166],[.088,.166],[.062,.184],[0,.184],[0,-.184]],high?16:6));
  return {tire:high?mergeOwned(rubber):null,disc:mergeOwned(metal),dark:high?mergeOwned(dark):null};
}
/** Front idler: a steel-rimmed twin disc with six cast spokes per face. */
function t64Idler(high:boolean,r:number) {
  const seg=high?24:12,body:THREE.BufferGeometry[]=[],dark:THREE.BufferGeometry[]=[];
  for(const side of [-1,1]){
    body.push(turnedGearStock([[r-.03,.045],[r-.004,.045],[r,.052],[r,.128],[r-.004,.135],[r-.03,.135],[r-.03,.045]],seg,side));
    body.push(turnedGearStock([[.09,.052],[r-.028,.052],[r-.028,.084],[.09,.084],[.09,.052]],seg,side));
    const length=r-.03-.09;
    for(let i=0;i<6;i++)body.push(new THREE.BoxGeometry(.035,length,.05).translate(0,.09+length/2,0)
      .rotateX(i*Math.PI/3).translate(side*.101,0,0));
    dark.push(turnedGearStock([[0,.158],[.05,.158],[.05,.176],[0,.176],[0,.158]],high?12:6,side));
  }
  body.push(turnedGearStock([[0,-.16],[.07,-.16],[.09,-.14],[.09,.14],[.07,.16],[0,.16],[0,-.16]],high?16:8));
  return {body:mergeOwned(body),dark:mergeOwned(dark)};
}
/** Rear drive: two twelve-tooth steel rings (the T-64's sprocket count) on a dished hub. */
function t64Sprocket(high:boolean,r:number) {
  const body:THREE.BufferGeometry[]=[],dark:THREE.BufferGeometry[]=[],root=r-.045,step=Math.PI/6;
  const outline:THREE.Vector2[]=[];
  for(let i=0;i<12;i++){
    const a=i*step;
    for(const [da,rr]of [[-.14,root],[-.075,r],[.075,r],[.14,root],[.262,root]] as const)
      outline.push(new THREE.Vector2(Math.cos(a+da)*rr,Math.sin(a+da)*rr));
  }
  for(const side of [-1,1]){
    const shape=new THREE.Shape(outline);
    shape.holes.push(new THREE.Path().absarc(0,0,.20,0,Math.PI*2,true));
    dark.push(new THREE.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:false,curveSegments:high?8:4})
      .translate(0,0,-.02).rotateY(Math.PI/2).translate(side*.07,0,0));
    body.push(turnedGearStock([[.10,.05],[.215,.05],[.215,.09],[.10,.09],[.10,.05]],high?20:10,side));
  }
  body.push(turnedGearStock([[0,-.18],[.085,-.18],[.105,-.16],[.105,.16],[.085,.18],[0,.18],[0,-.18]],high?16:8));
  return {body:mergeOwned(body),dark:mergeOwned(dark)};
}

const T64_WHEEL_STATIONS=[-1.80,-1.02,-.24,.54,1.32,2.10];
function runningGear(P:TankBuilderPort):void {
  const idler={z:2.86,y:.60,r:.265,trackR:.25},sprocket={z:-2.58,y:.70,r:.31,trackR:.272};
  const idlerStock=t64Idler(P.q,idler.r),driveStock=t64Sprocket(P.q,sprocket.r),roller=returnRollerStock(.08,.27,P.q);
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:T64_WHEEL_R,wheelW:.30,wheelY:.33,wheelZs:[...T64_WHEEL_STATIONS],
    xc:1.42,trackW:.54,trackTh:.030,idler,sprocket,
    // four return rollers per side (the T-72 carries three) hold the upper run well clear of the small wheels
    rollers:[-1.43,-.40,.66,1.72].map(z=>({z,y:.86,r:.08})),rollerR:.08,
    topY:.958,botY:.055,paintedEnds:true,arms:true,coveredTop:false,
    trackPattern:'nato-double-pin',linkPitchM:.150,
    roadWheelGeometry:t64RoadWheel(P.q),idlerGeometry:idlerStock,sprocketStockGeometry:driveStock,
    returnRollerStockGeometry:roller,
  });
}

// ---------------------------------------------------------------- turret (turret frame: origin on the ring centre)
type Course=readonly[y:number,front:number,rear:number,side:number];
// The cast shell as horizontal courses: the plan is an egg, blunt over the composite cheeks and full at the rear; the
// front rakes back steeply above the gun line to a low, broad roof (2.16 m) under the hatches.
const CAST_Z=-.08,PX=.86,PF=.92,PR=.80;
const COURSES:readonly Course[]=[
  [-.011,1.14,1.30,1.17],[.12,1.17,1.30,1.18],[.26,1.17,1.28,1.17],[.38,1.10,1.22,1.13],
  [.50,.92,1.12,1.05],[.60,.70,.99,.95],[.67,.48,.86,.84],[.705,.28,.70,.70],
];
const ROOF_Y=COURSES[COURSES.length-1][0];
function courseAt(y:number):Course {
  const above=COURSES.findIndex(c=>c[0]>y),k=Math.max(0,Math.min(COURSES.length-2,(above<0?COURSES.length:above)-1));
  const a=COURSES[k],b=COURSES[k+1],f=Math.max(0,Math.min(1,(y-a[0])/(b[0]-a[0])));
  return [y,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,a[3]+(b[3]-a[3])*f];
}
function shellPlan(course:Course,t:number):[number,number] {
  const s=Math.sin(t),c=Math.cos(t);
  return [course[3]*Math.sign(s)*Math.abs(s)**PX,CAST_Z+(c>=0?course[1]:course[2])*Math.sign(c)*Math.abs(c)**(c>=0?PF:PR)];
}
const shellPoint=(t:number,y:number)=>{const [x,z]=shellPlan(courseAt(y),t);return new THREE.Vector3(x,y,z);};
/** Plan parameter at arc length `s` from the front centre along the course at `y` (side +1 = +X). */
function shellArc(y:number,s:number,side:number):number {
  const course=courseAt(y),dt=.002;let t=0,run=0,[px,pz]=shellPlan(course,0);
  while(run<s&&t<Math.PI){t+=dt;const [x,z]=shellPlan(course,t);run+=Math.hypot(x-px,z-pz);px=x;pz=z;}
  return side*t;
}
/** Shell frame at (t, y): surface point, outward normal, horizontal tangent and the up-slope direction. */
function shellFrame(t:number,y:number) {
  const p=shellPoint(t,y),h=shellPoint(t+.004,y).sub(shellPoint(t-.004,y)).normalize();
  const v=shellPoint(t,y+.006).sub(shellPoint(t,y-.006)).normalize();
  const n=new THREE.Vector3().crossVectors(h,v).normalize();
  if(n.x*p.x+n.z*(p.z-CAST_Z)<0)n.negate();
  const tangent=h.clone().addScaledVector(n,-h.dot(n)).normalize(),along=new THREE.Vector3().crossVectors(tangent,n);
  return {p,n,tangent,along};
}
/** Highest course containing a roof plan point (the shell's surface there, to a few millimetres). */
function roofY(x:number,z:number):number {
  const inside=(c:Course)=>{const dz=z-CAST_Z,a=dz>=0?c[1]:c[2];
    return (Math.abs(x)/c[3])**(2/PX)+(Math.abs(dz)/a)**(2/(dz>=0?PF:PR))<1;};
  let lo=COURSES[0][0],hi=ROOF_Y;
  if(inside(COURSES[COURSES.length-1]))return ROOF_Y;
  for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(inside(courseAt(mid)))lo=mid;else hi=mid;}
  return lo;
}

/** True for a turret-frame point inside the cast shell. */
function insideShell(q:THREE.Vector3):boolean {
  if(q.y<COURSES[0][0]||q.y>ROOF_Y)return false;
  const c=courseAt(q.y),dz=q.z-CAST_Z,a=dz>=0?c[1]:c[2];
  return (Math.abs(q.x)/c[3])**(2/PX)+(Math.abs(dz)/a)**(2/(dz>=0?PF:PR))<1;
}

function casting(P:TankBuilderPort):void {
  const n=P.q?56:32;
  const sections=COURSES.map(course=>({z:course[0],ring:Array.from({length:n},(_,i)=>{
    const [x,z]=shellPlan(course,i*Math.PI*2/n);return [x,-z] as const;})}));
  P.add('turret',sectionSolid(sections,{smoothSideEdges:Array.from({length:n},(_,i)=>i)}).rotateX(-Math.PI/2));
}

function turretEra(P:TankBuilderPort):void {
  // The BV's horseshoe: two tiers of K-1 containers on stand-off struts around the front and flanks, and a roof row
  // ahead of the hatches. The left lower tier leaves room for the searchlight beside the gun; the left roof brick gives
  // way to the 1G42 box. Sector names follow the fleet's (x < 0 is L).
  // Each tier keeps one tilt (upright on the cheeks, 50 degrees round the upper course, nearly flat on the roof) rather
  // than following the casting's changing slope, and every container is let 4 mm into the shell at its nearest corner.
  const place=(t:number,y:number,size:Point3,pitch:number)=>{
    const {p,n}=shellFrame(t,y),[w,th,len]=size;
    const out=new THREE.Vector3(n.x,0,n.z).normalize(),tangent=new THREE.Vector3().crossVectors(UP,out).normalize();
    const normal=out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP,Math.sin(pitch));
    const along=new THREE.Vector3().crossVectors(tangent,normal);
    const back=[-1,0,1].flatMap(a=>[-1,0,1].map(b=>tangent.clone().multiplyScalar(a*w/2).addScaledVector(along,b*len/2)));
    let offset=0;
    while(offset<.25&&back.some(v=>insideShell(p.clone().addScaledVector(normal,offset).add(v))))offset+=.004;
    const centre=p.clone().addScaledVector(normal,offset-.004+th/2);
    k1Brick(P,'turret',`turret_era_${p.x<0?'L':'R'}`,new THREE.Matrix4().makeBasis(tangent,normal,along).setPosition(centre),size);
    if(offset<.02)return;
    // stand-off struts from the casting into the container's back where it stands clear of the shell
    for(const k of [-1,1]){
      const foot=p.clone().addScaledVector(tangent,k*w*.30).addScaledVector(n,-.02);
      P.addEquipment('turretDetail',beamBetween(foot.toArray(),foot.clone().addScaledVector(normal,offset+.024).toArray(),.012,6));
    }
  };
  for(const side of [-1,1]){
    for(let k=side>0?2:0;k<6;k++)place(shellArc(.20,.42+k*.275,side),.20,[.24,.075,.30],0);
    for(let k=0;k<5;k++)place(shellArc(.50,.40+k*.275,side),.50,[.24,.075,.28],.87);
    for(const s of side>0?[.15]:[.15,.40])place(shellArc(.672,s,side),.672,[.22,.06,.24],1.26);
  }
}

function searchlight(P:TankBuilderPort):void {
  // L-2G infrared searchlight on the left of the gun, on a bracket off the cheek (fixed to the turret).
  // The drum stands clear ahead of the cheek at barrel height: an arm off the casting into its back cap and a strut
  // under it.
  const x=.50,y=.30,z=1.21,wall=(h:number)=>{const c=courseAt(h),s=(x/c[3])**(1/PX);return CAST_Z+c[1]*Math.sqrt(1-s*s)**PF;};
  P.addEquipment('turretDetail',cylZ(.165,.20,28),x,y,z);
  P.addEquipment('turretDetail',cylZ(.12,.05,20),x,y,z-.125);
  P.addEquipment('turretDark',torus(.160,.016,24,6),x,y,z+.10);
  P.addModuleVisual('optics','turretGlass',cylZ(.148,.012,28),x,y,z+.102);
  const from=wall(y)-.02,to=z-.14;
  P.addEquipment('turretDetail',box(.10,.10,to-from),x,y,(from+to)/2);
  P.addEquipment('turretDetail',beamBetween([x,.10,wall(.10)-.01],[x,y-.14,z-.06],.02,8));
}

function roofEquipment(P:TankBuilderPort):void {
  // Commander's cupola on the right: a cast boss, the rotating ring, the domed hatch, the PKN-4S sight and the OU-3GK
  // light at its front; the remote NSVT rides on its left.
  const cx=-.50,cz=-.32;
  P.addEquipment('turretDetail',cylY(.40,.18,32),cx,.64,cz);
  P.addCupola('turret',cylY(.385,.08,32),cx,.77,cz);
  P.addEquipment('turretDetail',cylY(.34,.03,28),cx,.825,cz);
  P.addEquipment('turretDetail',KIT.cylY(.30,.32,.05,28),cx,.865,cz);
  P.addEquipment('turretDark',box(.10,.03,.06),cx,.875,cz-.31);
  for(const a of [1.0,1.75,-1.75,-1.0])P.addEquipment('turretDark',box(.08,.055,.05).rotateY(a),cx+Math.sin(a)*.37,.79,cz+Math.cos(a)*.37);
  P.addModuleVisual('optics','turretDetail',box(.20,.16,.16),cx,.89,cz+.36);
  P.addModuleVisual('optics','turretGlass',box(.15,.07,.012),cx,.91,cz+.446);
  P.addEquipment('turretDetail',box(.05,.07,.08),cx-.14,.845,cz+.33);
  P.addEquipment('turretDetail',cylZ(.075,.10,18),cx-.14,.92,cz+.35);
  P.addModuleVisual('optics','turretGlass',cylZ(.065,.010,18),cx-.14,.92,cz+.402);
  // Gunner's hatch on the left and the 1G42 sight box ahead of it, with its sloped window; the TPN night sight head.
  const gx=.52,gz=-.40;
  P.addCupola('turret',cylY(.30,.05,28),gx,ROOF_Y+.015,gz);
  P.addEquipment('turretDetail',cylY(.27,.03,24),gx,ROOF_Y+.05,gz);
  P.addEquipment('turretDark',box(.10,.03,.06),gx,ROOF_Y+.05,gz-.28);
  P.addModuleVisual('optics','turretDetail',sectionSolid([0,.26,.36].map(z=>({z,
    ring:[[.34,.58],[.66,.58],[.66,z<.3?.90:.80],[.34,z<.3?.90:.80]] as readonly SectionPoint[]}))));
  P.addModuleVisual('optics','turretGlass',box(.24,.10,.012).rotateX(-Math.PI/4),.50,.85+.004*Math.SQRT1_2,.31+.004*Math.SQRT1_2);
  P.addEquipment('turretDetail',cylY(.07,.12,16),.28,roofY(.28,.22)+.05,.22);
  P.addModuleVisual('optics','turretGlass',box(.08,.04,.010),.28,roofY(.28,.22)+.08,.295);
  // DVE-BS crosswind sensor mast at the roof rear.
  const my=roofY(0,-.62);
  P.addEquipment('turretDetail',KIT.cylY(.018,.025,.32,10),0,my+.15,-.62);
  P.addEquipment('turretDetail',cylY(.04,.06,12),0,my+.32,-.62);
  // Roof whips on their base pots (they seat themselves on the roof).
  for(const [x,z,h,seed]of [[.38,-.75,2.6,641],[-.12,-.88,2.2,642]]){
    const whip=FITTINGS.antennaWhip({mats:P.mats,h,r:.011,rake:.05,seed});
    whip.position.set(x,roofY(x,z),z);P.turretG.add(whip);
  }
}

function commanderGun(P:TankBuilderPort):void {
  // Remote-controlled NSVT 12.7 mm on the commander's cupola, laid from inside: pedestal, cradle, receiver, barrel,
  // flash hider and the 12.7 mm box on its left.
  const mx=-.27,my=1.00,gun=sourceMachineGun(P,[0,0,0]);
  gun.add('turretDetail',KIT.cylY(.04,.05,.12,16),mx,.87,-.05);
  gun.add('turretDetail',box(.12,.05,.30),mx,.955,.05);
  gun.add('turretDark',box(.085,.09,.56),mx,my,.12);
  gun.add('turretDark',cylZ(.019,.92,16),mx,my+.005,.86);
  gun.add('turretDark',blindTube(.027,.012,.12,.10,16),mx,my+.005,1.38);
  gun.add('turretAmmo',box(.10,.22,.30),mx+.0925,.98,.08);
  // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the exact gun is a working station (auxiliaryStation.ts)
  stationFromDrawnGun(gun.finish(),{name:'t64bvXRoofNsvt',caliberMm:12.7});
}

function smoke(P:TankBuilderPort):void {
  // Two banks of four 902B dischargers on the left of the turret (moved there when the K-1 horseshoe went on).
  for(const s of [2.02,2.42]){
    const t=shellArc(.42,s,1),{p,n,tangent}=shellFrame(t,.42);
    const plate=new THREE.Matrix4().makeBasis(tangent,UP.clone(),new THREE.Vector3().crossVectors(tangent,UP));
    P.addEquipment('turretDetail',box(.46,.10,.05).applyMatrix4(plate.clone().setPosition(p.clone().addScaledVector(n,.015))));
    // both banks fire forward, up and outward at the same low elevation
    const out=new THREE.Vector3(n.x,0,n.z).normalize(),d=out.multiplyScalar(.45).addScaledVector(UP,.35).add(new THREE.Vector3(0,0,.82)).normalize();
    const turn=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),d);
    for(const o of [-.165,-.055,.055,.165]){
      const base=p.clone().addScaledVector(n,.07).addScaledVector(tangent,o);
      P.addEquipment('turretDark',markSmokeTube(blindTube(.045,.034,.26,.16,P.q?20:10),[0,0,1],true)
        .applyQuaternion(turn).translate(...base.clone().addScaledVector(d,.12).toArray()));
      P.addEquipment('turretDetail',beamBetween(base.toArray(),p.clone().addScaledVector(tangent,o).addScaledVector(n,.01).toArray(),.018,6));
    }
  }
}

function sideStowage(P:TankBuilderPort):void {
  // Two 12.7 mm ammunition boxes strapped one above the other on the left flank behind the dischargers, a locker on
  // the right. Each box stands level against the cast wall, let 12 mm into it, with its strap round it.
  const seat=(side:number,s:number,y:number,size:Point3)=>{
    const {p,n}=shellFrame(shellArc(y,s,side),y),out=new THREE.Vector3(n.x,0,n.z).normalize();
    const basis=new THREE.Matrix4().makeBasis(out,UP.clone(),new THREE.Vector3().crossVectors(out,UP));
    const centre=p.clone().addScaledVector(out,size[0]/2-.012);
    P.addEquipment('turretDetail',box(...size).applyMatrix4(basis.clone().setPosition(centre)));
    P.addEquipment('turretDark',box(size[0]+.006,.025,size[2]+.006).applyMatrix4(basis.clone().setPosition(centre.clone().add(new THREE.Vector3(0,size[1]*.25,0)))));
  };
  seat(1,2.80,.22,[.12,.20,.22]);seat(1,2.80,.44,[.12,.20,.22]);
  seat(-1,2.70,.30,[.15,.24,.44]);
}

function rearStowage(P:TankBuilderPort):void {
  // The bustle locker: its front follows the cast rear wall, its back is straight; the OPVT snorkel tubes lie strapped
  // on its lid ("carried on the top rear of the turret").
  const wallZ=(x:number,y:number)=>{const c=courseAt(y),s=Math.min(.999,(Math.abs(x)/c[3])**(1/PX));
    return CAST_Z-c[2]*Math.sqrt(1-s*s)**PR;};
  const low=.10,top=.42,back=-1.67;
  // the right end runs out to x -0.84 so the docked drone's cradle stands wholly on the lid
  P.add('turret',sectionSolid([-.84,-.66,-.48,-.30,-.12,.06,.24,.42,.60,.72].map(x=>({z:x,ring:[
    [-(wallZ(x,low)+.03),low],[-back,low],[-back,top],[-(wallZ(x,top)+.03),top]] as readonly SectionPoint[]})))
    .rotateY(Math.PI/2));
  for(const x of [-.36,.36])P.addEquipment('turretDark',box(.03,.012,.36),x,top+.006,-1.50);
  // the tubes lie on the left half of the lid; its right half stays clear as the drone dock's pad
  P.addEquipment('turretDetail',cylX(.12,.95,20),.225,top+.12-.004,-1.40);
  P.addEquipment('turretDetail',cylX(.07,.80,16),.30,top+.07-.004,-1.595);
  for(const x of [-.18,.63])P.addEquipment('turretDark',torus(.124,.012,P.q?20:10,P.q?6:4).rotateY(Math.PI/2),x,top+.116,-1.40);
  for(const x of [.05,.40])P.addEquipment('turretDark',torus(.125,.009,P.q?20:10,P.q?6:4).rotateY(Math.PI/2),x,top+.116,-1.40);
  P.addEquipment('turretDark',torus(.075,.008,P.q?16:8,P.q?6:4).rotateY(Math.PI/2),.45,top+.066,-1.595);
}

function mainGun(P:TankBuilderPort):void {
  // The 2A46 125 mm tube and its mantlet cover at the B3 trunnion (the gun line, the mount and the gun-hull clearance
  // data stay the B3 study's; the T-64BV1 carries the same 2A46 family).
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  buildT72B3XMainGun(P);
}

export function buildT64BVX(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  hullCore(P);fenders(P);glacisEra(P);for(const side of [-1,1])skirtEra(P,side);deck(P);front(P);
  rear(P);runningGear(P);
  casting(P);turretEra(P);searchlight(P);roofEquipment(P);commanderGun(P);smoke(P);sideStowage(P);
  rearStowage(P);mainGun(P);
  P.topY=roofY(.38,-.75)+.12+2.6;
}

export function buildT64Modern(P:TankBuilderPort):void {
  buildT64BVX(P);
  P.hullG.userData.familyRebuild={donor:'t64bv1',revision:2,variant:'bv1',
    features:['six-small-steel-wheels','four-return-rollers','double-pin-track','k1-horseshoe','k1-glacis',
      'rear-exhaust','l2g-searchlight','remote-nsvt','left-smoke-banks','opvt-snorkels']};
}
