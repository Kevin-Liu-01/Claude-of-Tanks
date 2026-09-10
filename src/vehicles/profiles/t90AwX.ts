// Independent source-measured AW-labelled T-90 X. Analytic first-party
// solids only: no source topology, old T-90 builder or runtime source loader.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {addT90AWAAReceiver,addT90AWRoofMachineGun} from './t90AwXAAReceiver.ts';
import {addT90AWOpticalHeads} from './t90AwXOpticalHeads.ts';
import {addT90AWSmallOptics} from './t90AwXSmallOptics.ts';
import {addT90AWCastUnderside} from './t90AwXCastUnderside.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
import {addT90AWMeteo,addT90AWSideEra,addT90AWProjectors,addT90AWRearCases} from './t90AwXDetails.ts';
import {addT90AWRearCradles} from './t90AwXHullEnds.ts';
import {addT90AWFender,addT90AWExhaust,addT90AWSkirts} from './t90AwXFenders.ts';
import {addT90AWCheekLeaves} from './t90AwXCheekLeaves.ts';
import {addT90AWTowCables} from './t90AwXTowCables.ts';
import {addT90AWApsHousings} from './t90AwXApsHousings.ts';
import {addT90AWAAContainers} from './t90AwXAAContainers.ts';
import {addT90AWRearStowage} from './t90AwXRearStowage.ts';
import {addT90AWSideMounts} from './t90AwXSideMounts.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export const T90_AW_X_DATUMS=T90_AW_X_SOURCE_DATUMS;
const YAW=T90_AW_X_DATUMS.turretPivot,GUN=T90_AW_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function top(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
function hull(P:TankBuilderPort):void{
  P.add('hull',boxSections([
    [-3.18165,1.034,1.19,1.175],[-3.1,1.034,1.34833,1.13433],[-2.9,1.035,1.47660,.74680],
    [-2.7,1.035,1.505,.5269],[-2.5,1.035,1.504,.48486],[-2.3,1.033,1.503,.53853],
    [-2.1,1.032,1.4748,.5941],[-1.9,1.041,1.46,.5959],[-1.5,1.066,1.46,.5619],
    [-1.3,1.066,1.46,.5186],[1.3,1.057,1.459,.5728],[1.9,1.052,1.43136,.5224],
    [2.5,1.043,1.17081,.5243],[2.7,1.032,1.08402,.54589],[2.9,1.022,.997225,.62625],
    [3.1,1.0115,.910433,.769114],[3.18165,1.007,.875,.86],
  ]));
  P.add('hull',cylY(1.24025,.099,48),-.00095,1.4964,.11567);
  for(const side of [-1,1])fenders(P,side);
}
function fenders(P:TankBuilderPort,side:number):void{
  addT90AWFender(P,side);
  addT90AWSkirts(P,side);
}
function runningGear(P:TankBuilderPort):void{
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.39405,wheelY:.44845,wheelW:.4106,
    wheelZs:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996],xc:1.4426,trackW:.4942,trackTh:.014,
    idler:{z:3.1508,y:.8773,r:.2617,trackR:.251},sprocket:{z:-2.49665,y:.8285,r:.385,trackR:.347},
    rollers:[{z:-1.5033,y:1.07865,r:.12335},{z:.1714,y:1.07865,r:.12335},{z:1.8367,y:1.07865,r:.12335}],rollerR:.12335,
    returnRollerWidthM:.0982,returnRollerInsetM:.1086,topY:1.221,botY:.045,arms:true,coveredTop:true,paintedEnds:true,
    wheelFaceDepthScale:.86,sprocketDepthScale:.82,idlerDepthScale:.82,linkPitchM:.138,
    // Keep the recessed painted dish visible inside closed neutral tire stock.
    wheelTireInnerRadiusM:.33888,
    trackShoeDimensions:{padHeight:.029,grouserHeight:.010,webHeight:.014,hornHeight:.040,pinRadius:.009,pinCentreY:0},
  });
}
function hullEra(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const a=side<0?-.89:.012,b=side<0?-.012:.89;
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[2.180,a,b,1.329,1.329],[2.643,a,b,1.130,1.130]],.021),[0,1,0]));
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[2.646,a*.875,b*.875,1.129,1.129],[3.219,a*.875,b*.875,.883,.883]],.025),[0,1,0]));
      for(const z of [2.26,2.43,2.70,2.88,3.09])for(const x of [side*.22,side*.62])P.addExternalArmor('hull',markEraFurniture(box(.24,.010,.024)),x,1.329-(z-2.18)*.429+.014,z,.40);
    });
  }
  addT90AWSideEra(P);
  addT90AWSideMounts(P);
}
function deck(P:TankBuilderPort):void{
  addT90AWExhaust(P);
  P.addEquipment('hullDetail',box(1.8472,.0694,.665),-.00855,1.5132,-1.66945);
  for(const x of [-.4734,.47275]){
    P.addEquipment('hullDetail',roofSheet([[-2.748,x-.433,x+.433,1.543,1.543],[-2.170,x-.433,x+.433,1.5303,1.5303]],.014));
    for(let i=0;i<15;i++)P.addEquipment('hullDark',box(.82,.007,.014),x,1.544-i*.0008,-2.724+i*.038);
  }
  for(const [x,z,w,d,y,pitch]of [[1.4619,.8719,.254,1.0921,1.4717,.0413],[1.4171,-.6027,.291,.9744,1.5152,.0221],
    [1.3853,2.063,.335,.7803,1.4102,.066],[-1.39,-2.45,.50,.71,1.514,-.017],[-1.36,-1.47,.52,.83,1.512,.012],
    [-1.36,-.45,.53,1.1,1.508,.017],[-1.36,.75,.53,1.10,1.471,.041],[-1.36,1.94,.53,.85,1.414,.066]]){
    P.addEquipment('hullDetail',box(w,.031,d).rotateX(pitch),x,y,z);
    for(const dz of [-d*.4,d*.4])P.addEquipment('hullDetail',box(w*.84,.014,.024).rotateX(pitch),x,y+.023,z+dz);
  }
  for(const x of [-.18135,.5563]){
    P.addEquipment('hullDetail',box(.6958,.090,.1816).rotateX(.37),x,1.57665,-3.04785);
    for(let i=0;i<6;i++)P.addEquipment('hullDark',box(.025,.007,.145).rotateX(.37),x-.26+i*.10,1.625,-3.04785);
  }
  P.addEquipment('hullDetail',cylY(.294,.038,32).scale(1,1,.83),-.0561,1.494,1.6091);
  for(const x of [-.774,.771]){
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.066,.11,24),'headlight'),x,1.108,2.858);
    for(const dx of [-.095,.095])P.addEquipment('hullDetail',beamBetween([x+dx,1.015,2.874],[x+dx,1.245,2.73],.009));
  }
  P.addEquipment('hullDetail',box(1.85,.03,.028),0,1.187,2.593);
}
function rear(P:TankBuilderPort):void{
  // Original reference has empty drum cradles, not mounted fuel drums.
  P.addEquipment('hullDetail',cylX(.105,3.35,28),-.0083,1.0115,-3.2119);
  addT90AWRearCradles(P);
  for(const x of [-.9661,.9696]){
    P.addEquipment('hullDetail',torus(.058,.022,20,8).rotateX(Math.PI/2),x,.90,-3.160);
    P.addEquipment('hullDetail',beamBetween([x,.795,-3.02],[x,1.18,-3.04],.018));
  }
  addT90AWTowCables(P);
}
function turret(P:TankBuilderPort):void{
  addT90AWCastUnderside(P);
}
function cheeks(P:TankBuilderPort):void{
  addT90AWCheekLeaves(P);
  for(const side of [-1,1]){
    for(const [x,y,z,pitch,yaw,w,d]of [[1.48,1.944,.652,.42,1.04,.323,.570],[1.3464,1.95555,.93667,.414,.995,.322,.57],
      [1.14,1.963,1.255,.40,.95,.32,.57],[.486,1.85428,1.52221,.769,0,.161,.410]]){
      if(x<1){
        const upper=roofSheet([[-d/2,-w/2,w/2,0,0],[d/2,-w/2,w/2,0,0]],.034),lower=roofSheet([[-d/2,-w/2,w/2,-.23,-.23],[d/2,-w/2,w/2,-.029,-.029]],.024);
        P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>{for(const g of [upper,lower])P.addExternalArmor('turret',markEraHitFaces(g,[0,1,0]).rotateX(pitch).rotateY(side*yaw),side*x-YAW[0],y-YAW[1],z-YAW[2]);});
      }
      top(P,'turretDetail',beamBetween([side*x*.8,1.67,z*.80],[side*x,y-.17,z],.020),0,0,0);
    }
  }
}
function roofEra(P:TankBuilderPort):void{
  const cells:readonly(readonly[number,number,number,number,number])[]=[[-.5527,2.1654,.6879,.265,.20],[-.7955,2.1597,.4692,.28,.19],[-1.0057,2.1586,.2188,.275,.21],
    [.2188,2.2043,.5003,.137,.18],[.2902,2.2458,.194,.137,.125],[.1416,2.2541,.1945,.137,.12],
    [.0701,2.2117,.5017,.137,.18],[-.0784,2.2149,.5021,.137,.18],[-.2319,2.2174,.4664,.137,.18],
    [-.3822,2.2048,.4642,.137,.2],[-.0097,2.2585,.1946,.137,.114],[.0621,2.2815,-.1163,.137,.035],
    [.0574,2.2021,-.9252,.142,-.315],[-.113,2.218,-.841,.14,-.26],[.218,2.218,-.841,.14,-.26]];
  for(const [x,y,z,w,pitch]of cells)P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraHitFaces(box(w,.058,.295),[0,1,0]).rotateX(pitch),x-YAW[0],y-YAW[1],z-YAW[2]));
}
function casesAndOptics(P:TankBuilderPort):void{
  addT90AWRearStowage(P);
  addT90AWRearCases(P);
  top(P,'turretDetail',cylX(.09535,1.2363,28),-.0444,1.92913,-1.63583);
  for(const x of [-.706,.606])top(P,'turretDetail',torus(.12,.016,24,8).rotateZ(Math.PI/2),x,1.9296,-1.6356);
  P.addCupola('turret',cylY(.352,.115,32),-.603-YAW[0],2.323-YAW[1],-.30873-YAW[2]);
  top(P,'turretDetail',cylY(.345,.038,32).scale(1,1,.73),-.603,2.438,-.30873);
  P.addCupola('turret',cylY(.3394,.10,32).scale(1,1,.707),.47555-YAW[0],2.174-YAW[1],-.39108-YAW[2]);
  top(P,'turretDetail',cylY(.319,.027,32).scale(1,1,.707),.47555,2.283,-.39108);
  for(const[x,y,z,w,h,d]of [[.73785,2.24588,.11327,.3096,.2348,.273],[-.00075,2.14898,.81362,.4486,.2148,.2515],
    [.449,2.16608,.59992,.3687,.1992,.3225],[.47215,2.20393,.79337,.167,.1665,.206],
    [-.593,2.40608,.16547,.2427,.1304,.0818],[-.8325,2.46833,-.01003,.2207,.0977,.116],
    [-.8918,2.47738,-.15923,.2065,.187,.1354],[.73705,2.23878,-.76763,.271,.1504,.249]])top(P,'turretDetail',box(w,h,d),x,y,z);
  addT90AWApsHousings(P);
  antenna(P,-.27255,2.18015,-.89241);antenna(P,1.05213,1.99952,.52246);
  addT90AWMeteo(P);
  addT90AWProjectors(P);
  addT90AWOpticalHeads(P);
  addT90AWSmallOptics(P);
}
function antenna(P:TankBuilderPort,x:number,y:number,z:number):void{
  const rows=[[0,0],[.0129,0],[.0185,.0694],[.0115,.1385],[.012,.5989],[.0094,.6042],[.0093,.7922],
    [.0064,.7986],[.0086,.8041],[.0082,1.0165],[.0078,1.2289],[.0074,1.4414],[.007,1.6538],[.0066,1.8662],[.0062,2.0786],[.0058,2.291],[0,2.291]];
  top(P,'turretDetail',new THREE.LatheGeometry(rows.map(([r,h])=>new THREE.Vector2(r,h)),6).rotateY(Math.PI/6),x,y,z);
}
function smokeAndAA(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    for(const[x,y,z,yaw]of [[1.4693,2.07198,.00827,.24],[1.3404,2.06818,.01427,.24],
      [1.44095,1.93033,.02657,.54],[1.5713,1.92373,-.02658,.54],[1.58,1.79,-.035,.72],[1.45,1.80,.05,.72]])
      top(P,'turretDark',blindTube(.048,.031,.24,.10,20).rotateX(-.32).rotateY(side*yaw),side*x,y,z);
    top(P,'turretDetail',box(.35,.03,.235),side*1.3755,2.025,-.10543);
    top(P,'turretDetail',box(.4,.03,.245),side*1.39,1.805,-.11553);
    top(P,'turretDetail',beamBetween([side*1.16,1.82,-.25],[side*1.39,2.01,-.14],.021),0,0,0);
  }
  top(P,'turretDetail',box(.3052,.1949,.2615),-.59345,2.38213,.00702);
  for(const x of [-.67135,-.50105])top(P,'turretDetail',box(.0155,.2163,.263),x,2.59843,.10137);
  addT90AWAAContainers(P);
  addT90AWAAReceiver(P);
  addT90AWRoofMachineGun(P);
}
function mainGun(P:TankBuilderPort):void{
  const tip=T90_AW_X_DATUMS.muzzleZ,floor=T90_AW_X_DATUMS.boreFloorZ;
  KIT.buildGun(P,{len:floor-GUN[2],r:.078,baseR:.125,sleeve:false,collar:false});
  P.add('gunMount',cylX(.22,.53,32));
  P.add('gunMount',castSections([[.95125,.259,.259,2.04,1.523,1.77],[1.27136,.278,.277,2.0749,1.523,1.79],
    [1.49,.20,.20,1.97,1.56,1.726],[1.71795,.128,.128,1.854,1.599,1.726]],GUN));
  const profile=[[0,1.71802],[.1267,1.71802],[.10921,2.28012],[.10034,3.98762],[.11787,3.98762],
    [.120615,4.92322],[.09160,4.92322],[.093205,6.12832],[.086625,6.12832],[.086745,6.25722],
    [.093375,6.27282],[.093505,tip],[.0625,tip],[.0625,floor],[0,floor]];
  P.add('gun',new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2),0,0,-GUN[2]);
  for(const z of [2.47,3.53,5.37])P.add('gun',box(.006,.014,.46),0,.111,z-GUN[2]);
  P.muzzleZ=tip-GUN[2];
}
export function buildT90AWX(P:TankBuilderPort):void{
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.topY=T90_AW_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);hullEra(P);deck(P);rear(P);turret(P);cheeks(P);roofEra(P);casesAndOptics(P);smokeAndAA(P);mainGun(P);
}
export const T90_AW_X_PROFILES={t90_x:{build:buildT90AWX}} as const;
