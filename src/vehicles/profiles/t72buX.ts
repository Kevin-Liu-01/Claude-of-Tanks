// First-party T-72BU X: independent scalar construction, never a donor build
// or an imported reference mesh. Source units and joint inference are recorded
// in the accompanying measurement packet.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T72BU_X_SOURCE_DATUMS} from '../t72buXArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export const T72BU_X_DATUMS=T72BU_X_SOURCE_DATUMS;
const YAW=T72BU_X_DATUMS.turretPivot,GUN=T72BU_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function equipment(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
function hull(P:TankBuilderPort):void{
  P.add('hull',boxSections([
    [-3.17171,1.069,1.067,1.051],[-3.1,1.071,1.18317,1.02132],[-2.9,1.071,1.29554,.69208],
    [-2.7,1.0715,1.33870,.40221],[-2.6,1.0715,1.33950,.34735],
    [1.7,1.0715,1.37385,.37084],[1.79,1.0715,1.35845,.37133],
    [2.5,1.0715,1.08940,.37521],[2.7,1.0715,1.013435,.37630],
    [2.9,1.0715,.937475,.470907],[3.1,1.0715,.861514,.708315],[3.17171,1.071,.834,.820],
  ]));
  P.add('hull',cylY(1.058824,.034,48),YAW[0],1.340,YAW[2]);
  for(const side of [-1,1])fender(P,side);
}
function fender(P:TankBuilderPort,side:number):void{
  const left=Math.min(side*.916,side*1.730),right=Math.max(side*.916,side*1.730);
  const rows:readonly(readonly[number,number,number])[]=[[-3.307,1.050,1.034],[-3.15,1.18551,1.1553],
    [-2.80,1.36119,1.2483],[-2,1.37463,1.2424],[0,1.38997,1.2278],[1.7,1.39921,1.2168],
    [2.7,1.34357,1.2108],[3.1,1.31974,1.2083],[3.5,1.28346,1.1920],
    [3.7,1.26377,1.0570],[3.77,1.16,1.010],[3.8914,.978,.922]];
  P.addMudguard('t72bu-x-crowned-fender','hull',sectionSolid(rows.map(([z,top,bottom])=>({z,ring:[
    [left,bottom],[right,bottom],[right,top-.006],[left,top],
  ]}))));
  // Thin outboard vertical skirt is distinct from the over-track deck.
  const lane=side<0?-1.755:1.742;
  for(const [a,b,low]of [[-2.85,-1.90,.736],[-1.89,-.91,.741],[-.90,.10,.745],[.11,1.09,.751],[1.10,2.1,.757],[2.11,3.18,.764]]){
    const top=1.388+(a>1.7?-.061*(a-1.7):.008*a);
    P.addMudguard('t72bu-x-side-leaf','hullFixedPaintedBodywork',markFixedPaintedPanel(box(.011,top-low,b-a),'t72bu-x-side-leaf','hullRubber'),lane,(top+low)/2,(a+b)/2);
    P.addEquipment('hullDetail',box(.026,.031,b-a),lane-side*.01,top,(a+b)/2);
  }
}
function runningGear(P:TankBuilderPort):void{
  // Hidden return rollers are a documented mechanical inference, constrained
  // by the source's visible return-course envelope, not claimed source parts.
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.380115,wheelY:.451075,wheelW:.38270,
    // Source band-to-tub clearance is only2–10mm. The whole native animated
    // lane is placed12mm farther outboard for positive mechanical clearance.
    wheelZs:[-1.58720,-.72760,.14085,1.00566,1.85831,2.72517],xc:1.371,roadWheelOutsetM:.053,trackW:.56169,trackTh:.014,
    idler:{z:3.32755,y:.72631,r:.23219,trackR:.228},sprocket:{z:-2.45990,y:.642,r:.28250,trackR:.268},
    rollers:[{z:-1.63,y:.902,r:.092},{z:.21,y:.902,r:.092},{z:1.91,y:.902,r:.092}],rollerR:.092,
    returnRollerWidthM:.25,returnRollerInsetM:.10,topY:1.011,botY:.055,arms:true,coveredTop:true,paintedEnds:true,
    wheelFaceDepthScale:.78,sprocketDepthScale:.82,idlerDepthScale:.82,linkPitchM:.137,
    // Open the tire around the recessed painted steel, retaining its rolling radius.
    wheelTireInnerRadiusM:.32690,
    trackShoeDimensions:{padHeight:.026,grouserHeight:.009,webHeight:.013,hornHeight:.042,pinRadius:.009,pinCentreY:0},
  });
}
function reactiveHull(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const a=side<0?-1.052:.012,b=side<0?-.012:1.052;
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      // Thin covers remain above the independently authored permanent tub.
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[1.80,a,b,1.373,1.373],[3.12,a,b,.873,.873]],.014),[0,1,0]));
      for(const z of [2.02,2.61])P.addExternalArmor('hull',markEraFurniture(box(b-a,.017,.027)),(a+b)/2,1.373-(z-1.8)*.379+.012,z,.362);
    });
    for(const [z,y]of [[1.30329,1.15166],[2.03784,1.10262],[2.77459,1.04784]]){
      const x=side<0?-1.7754:1.7619;
      P.addEquipment('hullDetail',box(.013,.453,.697),x-side*.025,y,z);
      P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('hull',markEraHitFaces(box(.038,.47504,.70581),[side,0,0]),x,y,z));
    }
  }
}
function deck(P:TankBuilderPort):void{
  for(const [z,y]of [[-1.68162,1.36593],[-2.41648,1.35308]]){
    P.addEquipment('hullDetail',box(1.88577,.045,.6856),-.0017,y,z);
    for(const dz of [-.30,.30])P.addEquipment('hullDark',box(1.77,.006,.011),-.0017,y+.024,z+dz);
  }
  for(const x of [-.18615,.60259]){
    P.addEquipment('hullDetail',box(.73877,.075,.24664),x,1.403,-2.973);
    for(let i=0;i<7;i++)P.addEquipment('hullDark',box(.014,.008,.215),x-.28+i*.093,1.447,-2.973);
  }
  for(const side of [-1,1])for(const [z,w,d,y]of [[-2.42153,.301,.52264,1.38385],[-1.55277,.45961,.77086,1.3942],
    [.02353,.29593,.89813,1.39938],[1.22766,.29593,.87855,1.40633],[2.19874,.30118,.6177,1.39303]]){
    P.addEquipment('hullDetail',box(w,.025,d),side*1.363,y,z);
  }
  P.addEquipment('hullDetail',cylY(.252,.030,24),-.011,1.382,1.574);
  P.addEquipment('hullDark',box(.22537,.075,.09),0,1.32907,1.90868);
  for(const x of [-.774,.775]){
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.0695,.1222,20),'headlight'),x,1.09069,2.70575);
    for(const dx of [-.101,.101])P.addEquipment('hullDetail',beamBetween([x+dx,.954,2.66],[x+dx,1.202,2.70],.008));
  }
  for(const x of [-.545,0,.547])P.addEquipment('hullDetail',roofSheet([[2.62,x-.1907,x+.1907,1.043,1.043],[3.179,x-.1907,x+.1907,.795,.795]],.018));
  for(const x of [-.85,-.426,-.152,.152,.426,.85])P.addEquipment('hullDetail',beamBetween([x,.585,3.02],[x,.787,3.14],.017,8));
}
function rear(P:TankBuilderPort):void{
  for(const x of [-.59360,.58002]){
    P.addEquipment('hullDetail',cylX(.295645,.8858,32),x,1.47009,-3.4954);
    for(const dx of [-.255,.255]){
      P.addEquipment('hullDark',torus(.298,.009,28,6).rotateZ(Math.PI/2),x+dx,1.47009,-3.4954);
      P.addEquipment('hullDetail',beamBetween([x+dx,1.355,-3.125],[x+dx,1.083,-3.69],.009,8));
    }
  }
  P.addEquipment('hullDetail',cylX(.098,3.10,24),-.0068,.90353,-3.23376);
  for(const x of [-.937,.924]){
    P.addEquipment('hullDetail',torus(.063,.020,20,8).rotateX(Math.PI/2),x,.944,-3.29);
    P.addEquipment('hullDetail',beamBetween([x,.88,-3.25],[x,1.11,-3.09],.012));
  }
}
function turret(P:TankBuilderPort):void{
  P.add('turret',castSections([
    [-1.1686,.03,.03,1.86,1.72,1.78],[-1.1,.3884,.3966,2.01648,1.67268,1.88],
    [-.9,.6233,.6281,2.04657,1.4009,1.84],[-.7,.8134,.8134,2.07666,1.3241,1.80],
    [-.5,.9553,.9554,2.11379,1.3245,1.765],[-.3,1.0722,1.0726,2.15865,1.3253,1.71],
    [-.1,1.1833,1.1897,2.16247,1.3261,1.66],[.1,1.2687,1.2785,2.16179,1.3271,1.62],
    [.3,1.3472,1.3567,2.1495,1.3282,1.59],[.5,1.3733,1.3828,2.05272,1.3294,1.58],
    [.7,1.3514,1.3615,2.02239,1.3306,1.57],[.9,1.2794,1.2892,1.98369,1.332,1.56],
    [1.1,1.1467,1.1569,1.92219,1.3336,1.54],[1.3,.9573,.9679,1.86069,1.3359,1.51],
    [1.5,.5791,.5907,1.5373,1.4311,1.48],[1.5482,.02,.02,1.46,1.45,1.455],
  ],YAW));
}
type Cell=readonly[x:number,y:number,z:number,nx:number,ny:number,nz:number,w:number,d:number];
function cheeks(P:TankBuilderPort):void{
  const cells:readonly Cell[]=[
    [-1.402282,1.797121,.594820,-.406352,.907893,.102992,.263,.443],
    [-1.309265,1.798867,.876574,-.381428,.908345,.171529,.263,.443],
    [-1.165,1.8007,1.121,-.364249,.908646,.20417,.263,.443],
    [1.410653,1.803720,.596746,.402105,.909726,.103493,.263,.443],
    [1.316,1.805,.878,.376897,.910116,.172153,.262,.443],
    [1.174904,1.806096,1.127996,.360096,.910295,.204192,.261,.442],
    [-.525,1.839,1.4384,.002372,.891785,.452454,.2295,.412],
    [.527,1.839,1.4384,-.002372,.891785,.452454,.2295,.412],
    [-.9583,1.77858,1.3914,-.203054,.888535,.41143,.59,.400],
    [.96027,1.77862,1.3914,.203147,.888427,.411618,.59,.400],
  ];
  for(const [x,y,z,nx,ny,nz,w,d]of cells){
    const n=new THREE.Vector3(nx,ny,nz).normalize(),pitch=Math.acos(n.y),yaw=Math.atan2(n.x,n.z);
    const g=roofSheet([[-d/2,-w/2,w/2,0,0],[d/2,-w/2,w/2,0,0]],.036);
    const lower=roofSheet([[-d/2,-w/2,w/2,-.22,-.22],[d/2,-w/2,w/2,-.030,-.030]],.024);
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>{
      for(const solid of [g,lower])P.addExternalArmor('turret',markEraHitFaces(solid,[0,1,0]).rotateX(pitch).rotateY(yaw),x-YAW[0],y-YAW[1],z-YAW[2]);
    });
    equipment(P,'turretDetail',beamBetween([x*.82,1.55,z*.82],[x,y-.16,z],.017),0,0,0);
  }
}
function roofArmor(P:TankBuilderPort):void{
  const cells:readonly(readonly[number,number,number,number])[]=[
    [-.667,2.0442,-.6003,.26],[-.39,2.0699,-.7551,.27],[-.1135,2.0713,-.8509,.276],
    [.0409,2.0565,-.9431,.276],[.1949,2.072,-.8509,.276],[.6387,2.0194,-.7778,.25],
    [.4906,2.0807,-.5932,.132],[-.0409,2.1446,-.1342,.273],
    [.1534,2.1189,.1445,.276],[.0191,2.1220,.1445,.276],[-.1153,2.1202,.1445,.276],
    [-.2902,2.0656,.4309,.276],[-.1559,2.0732,.4309,.276],[-.0216,2.0766,.4312,.276],
    [.1127,2.0769,.4312,.276],[.2471,2.0707,.4312,.276],
  ];
  for(const [x,y,z,d]of cells)P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',
    markEraHitFaces(box(.123,.046,d),[0,1,0]),x-YAW[0],y-YAW[1],z-YAW[2]));
}
function cases(P:TankBuilderPort):void{
  equipment(P,'turretDetail',boxSections([[-1.431,.586,1.964,1.548],[-1.37,.586,2.001,1.548],[-1.08,.586,2.005,1.548]]),.0055,0,0);
  for(const [x,z,yaw,y]of [[-1.04752,-.61486,-.576,1.74873],[1.05754,-.61344,.576,1.7536]]){
    // Source side cases have diagonally canted footprints and sloping lower
    // outer walls, not axis-aligned rectangular boxes.
    equipment(P,'turretDetail',boxSections([[-.367,.166,.224,-.18],[-.30,.192,.224,-.224],[.367,.192,.224,-.224]]).rotateY(yaw),x,y,z);
    equipment(P,'turretDetail',box(.392,.012,.72).rotateY(yaw),x,y+.226,z);
    equipment(P,'turretDetail',beamBetween([x*.75,1.59,z],[x,1.57,z],.018),0,0,0);
  }
  equipment(P,'turretDetail',cylX(.08,1.208,20),.022,1.744,-1.526);
  for(const x of [-.647,.674])equipment(P,'turretDetail',beamBetween([x,1.63,-1.47],[x,1.85,-1.44],.02),0,0,0);
}
function roofFittings(P:TankBuilderPort):void{
  P.addCupola('turret',cylY(.34791,.11848,32),-.58057-YAW[0],2.17808-YAW[1],-.03332-YAW[2]);
  equipment(P,'turretDetail',cylY(.320,.035,24),-.58057,2.227,-.03332);
  P.addCupola('turret',cylY(.35985,.114,28).scale(1,1,.665),.49511-YAW[0],2.052-YAW[1],-.2119-YAW[2]);
  equipment(P,'turretDetail',cylY(.339,.035,28).scale(1,1,.665),.49511,2.165,-.2119);
  for(const x of [-.735,-.453])equipment(P,'turretDetail',box(.04766,.10447,.18506),x,2.23818,.09963);
  for(const [x,y,z,w,h,d]of [[-.59585,2.23834,.13185,.24235,.09361,.10737],[-.43353,2.226,-.17179,.189,.104,.197],
    [-.71571,2.2261,-.16958,.197,.101,.190],[.7839,2.07777,.29559,.280,.229,.243],
    [.50267,2.03381,.64896,.352,.161,.339],[.00345,2.06909,.76502,.362,.136,.157],
    [.4412,2.13509,-.88044,.184,.165,.082]])equipment(P,'turretDetail',box(w,h,d),x,y,z);
  // Fused source mesh_324 island9012 identifies this separate sight hood.
  P.addModuleVisual('optics','turretDetail',boxSections([[.837,.0996,2.105,1.85],[1.08,.0996,2.14,1.85],[1.257,.0996,1.98,1.85]]).translate(.5025,0,0),-YAW[0],-YAW[1],-YAW[2]);
  P.addModuleVisual('optics','turretDark',box(.176,.085,.009),.5025-YAW[0],1.983-YAW[1],1.26-YAW[2]);
  equipment(P,'turretDetail',cylY(.0284,.7654,16),.32841,2.43068,-.83118);
  equipment(P,'turretDetail',box(.0731,.2721,.0742),.32814,2.51682,-.83181);
  equipment(P,'turretDetail',cylY(.022,.095,16),-.24975,2.131,-.81318);
  equipment(P,'turretDark',cylY(.0053,1.291,10),-.24975,2.75206,-.81318);
}
function smoke(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    for(const [x,y,z,yaw]of [[1.309,1.8968,.0709,.41],[1.435,1.9019,.0371,.41],
      [1.3494,1.7719,.1312,.65],[1.4931,1.7732,.0624,.65],[1.5142,1.6385,.0807,.82],[1.4044,1.6436,.1527,.82]]){
      equipment(P,'turretDark',blindTube(.049,.032,.275,.100,20).rotateX(-.27).rotateY(side*yaw),side*(x-.002),y,z);
    }
    for(const [y,z]of [[1.80,-.0404],[1.684,.0014],[1.614,.0136]])equipment(P,'turretDetail',box(.365,.035,.224).rotateY(side*.2),side*1.324,y,z);
    equipment(P,'turretDetail',beamBetween([side*1.10,1.62,-.13],[side*1.32,1.86,-.08],.025),0,0,0);
  }
}
function machineGun(P:TankBuilderPort):void{
  for(const [x,y,z,w,h,d]of [[-.95625,2.58946,.3938,.51045,.33676,.44685],[-.4267,2.49225,.38464,.1063,.3572,.402],
    [-.4265,2.4587,.7467,.191,.444,.298],[-.5955,2.2467,.2605,.184,.229,.116]])equipment(P,'turretDetail',box(w,h,d),x,y,z);
  equipment(P,'turretDetail',beamBetween([-.61,2.22,.22],[-.61,2.58,.55],.035),0,0,0);
  const mg=sourceMachineGun(P,YAW);
  mg.add('turretDark',box(.15886,.11767,.6897),-.61393,2.625,.62165);
  mg.add('turretDetail',box(.07286,.14285,1.19466),-.6096,2.67241,.86528);
  mg.add('turretDark',cylZ(.0199,.65654,20),-.60653,2.68942,1.85594);
  mg.add('turretDetail',box(.10463,.02406,.31138),-.60938,2.74389,.66017);
  mg.add('turretDark',box(.02651,.03249,.15),-.60615,2.64089,1.59225);mg.finish();
}
function mainGun(P:TankBuilderPort):void{
  const muzzle=T72BU_X_DATUMS.muzzleZ,floor=T72BU_X_DATUMS.boreFloorZ;
  KIT.buildGun(P,{len:floor-GUN[2],r:.084,baseR:.13,sleeve:false,collar:false});
  P.add('gunMount',cylX(.21,.52,28));
  P.add('gunMount',castSections([[1.13766,.274,.274,1.955,1.435,1.67],[1.37095,.274,.274,1.96625,1.4346,1.71],
    [1.59493,.179,.179,1.803,1.4436,1.63],[1.88831,.143,.143,1.773,1.486,1.63]],GUN));
  for(const [a,b,ra,rb]of [[1.870624,4.214154,.12742,.11131],[4.214154,4.22647,.11131,.129446],
    [4.22647,5.003331,.129446,.1241],[5.003331,5.015647,.1241,.105813]])P.add('gun',KIT.cylY(rb,ra,b-a,32).rotateX(Math.PI/2),0,0,(a+b)/2-GUN[2]);
  const profile=[[0,5.015647],[.105813,5.015647],[.09522,muzzle],[.0625,muzzle],[.0625,floor],[0,floor]];
  P.add('gun',new THREE.LatheGeometry(profile.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2),0,0,-GUN[2]);
  for(const [z,d,y]of [[2.82465,.76233,1.74025],[3.70856,.76233,1.73766],[5.40345,.55896,1.72989],[6.08525,.55896,1.72624]])
    P.add('gun',box(.01074,.03919,d),0,y-GUN[1],z-GUN[2]);
  P.muzzleZ=muzzle-GUN[2];
}
export function buildT72BUX(P:TankBuilderPort):void{
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);P.topY=T72BU_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);reactiveHull(P);deck(P);rear(P);turret(P);cheeks(P);roofArmor(P);cases(P);roofFittings(P);smoke(P);machineGun(P);mainGun(P);
}
export const T72BU_X_PROFILES={t72bu_x:{build:buildT72BUX}} as const;
