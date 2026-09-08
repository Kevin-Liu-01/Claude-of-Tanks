// Independent Burlak first-party scalar construction. Its welded bustle,
// asymmetric front curtain and separate supports are not a donor T-90 mesh.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {boxSections,castSections,roofSheet,beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T90_BURLAK_X_SOURCE_DATUMS} from '../t90BurlakXArmor.ts';
import {addT90BurlakSkirtCassettes} from './t90BurlakXSkirts.ts';
import {addT90BurlakRearFurniture} from './t90BurlakXRear.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
export const T90_BURLAK_X_DATUMS=T90_BURLAK_X_SOURCE_DATUMS;
const YAW=T90_BURLAK_X_DATUMS.turretPivot,GUN=T90_BURLAK_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function top(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
function optic(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number):void{
  P.addModuleVisual('optics',bucket,g,x-YAW[0],y-YAW[1],z-YAW[2]);
}
function hull(P:TankBuilderPort):void{
  P.add('hull',boxSections([
    [-3.18165,1.034,1.19,1.175],[-3.1,1.034,1.3483,1.1343],[-2.9,1.035,1.4766,.7468],[-2.7,1.035,1.505,.5269],
    [-2.5,1.035,1.504,.48486],[-2.3,1.033,1.503,.5385],[-2.1,1.032,1.4748,.5941],[-1.9,1.041,1.46,.5959],
    [-1.5,1.066,1.46,.5619],[-1.3,1.066,1.46,.5186],[1.3,1.057,1.459,.5728],[1.9,1.052,1.4314,.5224],
    [2.5,1.043,1.1708,.5243],[2.7,1.032,1.084,.5459],[2.9,1.022,.9972,.6263],[3.1,1.0115,.9104,.7691],[3.18165,1.007,.875,.86],
  ]));
  P.add('hull',cylY(1.24025,.099,48),-.00095,1.4964,.11567);
  for(const side of [-1,1])fenders(P,side);
}
function fenders(P:TankBuilderPort,side:number):void{
  const l=Math.min(side*.944,side*1.795),r=Math.max(side*.944,side*1.795);
  const rows:readonly(readonly[number,number,number])[]=[[-3.367,1.22,1.204],[-3.30,1.2744,1.2518],[-3.10,1.305,1.289],
    [-2.9,1.483,1.2883],[-2,1.495,1.2873],[0,1.491,1.2865],[1,1.452,1.2873],[2,1.3916,1.2863],
    [2.8,1.340,1.2678],[3.1,1.3033,1.237],[3.3,1.268,1.208],[3.5,1.1688,1.123],[3.65,1.016,.969],[3.755,.91,.87]];
  P.addMudguard('burlak-x-source-crown','hull',sectionSolid(rows.map(([z,t,b])=>({z,ring:[[l,b],[r,b],[r,t-.007],[l,t]]}))));
  for(const[z,d]of [[-2.06345,1.959],[-.45925,1.2476],[.8833,1.4287],[2.29245,1.3838]]){
    // Full-height fixed sheets carry vehicle paint. Mudguard registration
    // describes their seating, not a rubber finish; keep the original stock,
    // pose, non-armor role and always-visible silhouette LOD unchanged.
    P.addMudguard('burlak-x-fixed-skirt',side<0?'hullTrackGuardL':'hullTrackGuardR',box(.011,.5801,d-.01),side*1.732,1.016,z);
    P.addEquipment('hullDetail',box(.038,.028,d-.005),side*1.735,1.320,z);
  }
}
function runningGear(P:TankBuilderPort):void{
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'deep-dish-eight',wheelR:.39405,wheelY:.44845,wheelW:.4106,
    wheelZs:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996],xc:1.4426,trackW:.4942,trackTh:.014,
    idler:{z:3.1508,y:.8773,r:.2617,trackR:.251},sprocket:{z:-2.49665,y:.8285,r:.385,trackR:.347},
    rollers:[{z:-1.5033,y:1.07865,r:.12335},{z:.1714,y:1.07865,r:.12335},{z:1.8367,y:1.07865,r:.12335}],rollerR:.12335,
    returnRollerWidthM:.0982,returnRollerInsetM:.1086,topY:1.221,botY:.045,arms:true,coveredTop:true,paintedEnds:true,
    wheelFaceDepthScale:.86,sprocketDepthScale:.82,idlerDepthScale:.82,linkPitchM:.138,
    trackShoeDimensions:{padHeight:.029,grouserHeight:.010,webHeight:.014,hornHeight:.040,pinRadius:.009,pinCentreY:0},
  });
}
function hullEra(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const l=side<0?-.89:.012,r=side<0?-.012:.89;
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>{
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[2.18,l,r,1.329,1.329],[2.643,l,r,1.130,1.130]],.021),[0,1,0]));
      P.addExternalArmor('hull',markEraHitFaces(roofSheet([[2.646,l*.875,r*.875,1.129,1.129],[3.219,l*.875,r*.875,.883,.883]],.025),[0,1,0]));
      for(const z of [2.26,2.43,2.70,2.88,3.09])for(const x of [side*.22,side*.62])P.addExternalArmor('hull',markEraFurniture(box(.24,.01,.024)),x,1.343-(z-2.18)*.429,z,.40);
    });
  }
  addT90BurlakSkirtCassettes(P);
}
function deck(P:TankBuilderPort):void{
  P.addEquipment('hullDetail',box(1.8472,.0694,.665),-.00855,1.5132,-1.66945);
  for(const x of [-.4734,.47275]){
    P.addEquipment('hullDetail',roofSheet([[-2.748,x-.433,x+.433,1.543,1.543],[-2.170,x-.433,x+.433,1.5303,1.5303]],.014));
    for(let i=0;i<15;i++)P.addEquipment('hullDark',box(.82,.007,.014),x,1.544-i*.0008,-2.724+i*.038);
  }
  for(const[x,z,w,d,y,p]of [[1.4619,.8719,.254,1.0921,1.4717,.0413],[1.4171,-.6027,.291,.9744,1.5152,.0221],
    [1.3853,2.063,.335,.7803,1.4102,.066],[-1.39,-2.45,.50,.71,1.514,-.017],[-1.36,-1.47,.52,.83,1.512,.012],
    [-1.36,-.45,.53,1.10,1.508,.017],[-1.36,.75,.53,1.1,1.471,.041],[-1.36,1.94,.53,.85,1.414,.066]]){
    P.addEquipment('hullDetail',box(w,.031,d).rotateX(p),x,y,z);
    for(const dz of [-d*.4,d*.4])P.addEquipment('hullDetail',box(w*.84,.014,.024).rotateX(p),x,y+.023,z+dz);
  }
  P.addEquipment('hullDetail',cylY(.294,.038,32).scale(1,1,.83),-.0561,1.494,1.6091);
  for(const x of [-.774,.771]){
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.066,.11,24),'headlight'),x,1.108,2.858);
    for(const dx of [-.095,.095])P.addEquipment('hullDetail',beamBetween([x+dx,1.015,2.874],[x+dx,1.245,2.73],.009));
  }
  for(const x of [-.18135,.5563])P.addEquipment('hullDetail',box(.6958,.09,.1816).rotateX(.37),x,1.57665,-3.04785);
}
function rear(P:TankBuilderPort):void{
  P.addEquipment('hullDetail',cylX(.105,3.35,28),-.0083,1.0115,-3.2119);
  addT90BurlakRearFurniture(P);
  for(const x of [-.9661,.9696]){
    P.addEquipment('hullDetail',torus(.058,.022,20,8).rotateX(Math.PI/2),x,.90,-3.16);
    P.addEquipment('hullDetail',beamBetween([x,.795,-3.02],[x,1.18,-3.04],.018));
  }
}
function turret(P:TankBuilderPort):void{
  // Source rings, welded bustle and pointed shoulder: flat/raked faces, not a
  // generic rounded casting. Thin inset roof breaks retain the welded edge.
  P.add('turret',cylY(1.19625,.0617,60),-.00125-YAW[0],1.57543-YAW[1],.11467-YAW[2]);
  P.add('turret',cylY(.75,.1592,40),-.00125-YAW[0],1.46718-YAW[1],.11467-YAW[2]);
  const rows:readonly(readonly[number,number,number,number,number])[]=[[-3.1841,.914,.914,2.198,1.773],[-3.1,.956,.956,2.24518,1.73568],
    [-2.9,.956,.956,2.24518,1.68484],[-2.7,.956,.956,2.26368,1.68474],[-1.5,.956,.956,2.26368,1.68415],
    [-1.3,.918,.918,2.24518,1.63526],[-1.1,.7257,.7257,2.24439,1.60438],[-.9,.8184,.8184,2.23773,1.60438],
    [-.7,.911,.911,2.23088,1.60438],[-.5,1.0052,1.0052,2.22394,1.60438],[-.3,1.1008,1.1008,2.21712,1.60438],
    [-.1,1.1963,1.1963,2.20756,1.60438],[.1,1.2919,1.2919,2.17343,1.60438],[.3,1.3875,1.3875,2.13930,1.60438],
    [.5,1.4833,1.4833,2.10517,1.60336],[.7,1.57891,1.56386,2.07104,1.59938],[.9,1.3972,1.3356,2.03952,1.59938],
    [1.1,1.1679,1.1074,2.03517,1.59938],[1.2,1.0533,.9933,2.01808,1.59938]];
  P.add('turret',sectionSolid(rows.map(([z,l,r,t,b])=>({z:z-YAW[2],ring:[[-l-YAW[0],b-YAW[1]],[r-YAW[0],b-YAW[1]],
    [r-YAW[0],t-.06-YAW[1]],[r-.07-YAW[0],t-YAW[1]],[-l+.07-YAW[0],t-YAW[1]],[-l-YAW[0],t-.06-YAW[1]]]}))));
  for(const side of [-1,1]){
    const rows=side<0?[[1.19,-1.065,-.27,2.019],[1.50,-.7094,-.27705,1.94047]]:[[1.19,.29,1.005,2.019],[1.40,.29,.765,1.98]];
    P.add('turret',roofSheet(rows.map(([z,l,r,y])=>[z,l,r,y,y]),.30),-YAW[0],-YAW[1],-YAW[2]);
  }
}
function frontCurtain(P:TankBuilderPort):void{
  // Scalar dimensions in each original panel's own plane, not source vertices.
  const panels:readonly(readonly[number,number,number,number,number,number,number,number,number])[]=[
    [-1.683384,1.851381,1.068387,.340083,.860813,-.378610,.295822,.052410,.774597],
    [1.666856,1.854676,1.030158,-.347716,.854605,-.385673,.289488,.051914,.778306],
    [1.447755,1.829312,1.222835,-.345945,.854710,-.387030,.253421,.052058,.778297],
    [1.244401,1.829278,1.402813,-.347123,.854665,-.386074,.255468,.052194,.778127],
    [1.031672,1.854613,1.586947,-.341855,.854721,-.390625,.269872,.052138,.777988],
    [.558030,1.786134,1.637814,-.001167,.816237,-.577716,.506545,.050357,.465154],
    [-.728908,1.852307,1.723070,.005233,.766893,-.641754,.852367,.049417,.620849],
    [-1.039915,1.854402,1.623855,.342373,.856791,-.385604,.274378,.052894,.765996],
    [-1.254022,1.829426,1.448737,.341786,.856227,-.387373,.254690,.052070,.785017],
    [-1.459577,1.828548,1.269780,.339405,.858068,-.385388,.255748,.052257,.786191],
  ];
  for(const[x,y,z,nx,ny,nz,w,h,d]of panels){
    const pitch=Math.acos(ny),yaw=Math.atan2(nx,nz);
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraHitFaces(box(w,h,d),[0,1,0]).rotateX(pitch).rotateY(yaw),x-YAW[0],y-YAW[1],z-YAW[2]));
    top(P,'turretDetail',beamBetween([x*.77,1.65,z*.64],[x-nx*.07,y-ny*.07,z-nz*.07],.018),0,0,0);
  }
  // Individually thin folded carrier ribs. Their gaps remain actual air.
  for(const[x,y,z,yaw]of [[1.782,1.878,.924,-2.42],[1.568,1.853,1.103,-2.42],[1.363,1.852,1.284,-2.42],
    [1.154,1.878,1.464,-2.42],[.941,1.874,1.642,-2.42],[-1.791,1.875,.964,2.42],[-1.574,1.851,1.151,2.42],
    [-1.365,1.852,1.333,2.42],[-1.150,1.878,1.512,2.42],[-.938,1.881,1.691,2.42]]){
    const g=sectionSolid([{z:-.36,ring:[[-.019,-.142],[.019,-.142],[.019,.035],[-.019,.035]]},
      {z:.36,ring:[[-.019,-.143],[.019,-.143],[.019,.142],[-.019,.142]]}]).rotateX(.28).rotateY(yaw);
    top(P,'turretDetail',g,x,y,z);
  }
}
function bustleAndCases(P:TankBuilderPort):void{
  for(const x of [-.468,.467]){
    top(P,'turretDetail',roofSheet([[-2.886,x-.205,x+.205,2.275,2.275],[-1.515,x-.205,x+.205,2.275,2.275]],.012),0,0,0);
    for(const z of [-2.78,-1.62])top(P,'turretDetail',box(.17,.017,.029),x,2.291,z);
  }
  top(P,'turretDetail',box(.4426,.2051,.6455),.48675,2.31353,-1.02348);
  const left=castSections([[-1.20,.08,.08,2.00,1.68,1.83],[-1.04,.37,.37,2.046,1.625,1.83],[-.6,.50,.50,2.046,1.605,1.80],
    [0,.48,.48,2.03,1.605,1.80],[.30,.30,.30,1.96,1.66,1.81],[.346,.045,.045,1.87,1.73,1.81]],[0,0,0]);
  top(P,'turretDetail',left,-1.2666,0,0);
  for(const side of [-1,1])for(const z of [-2.93,-2.55,-2.16,-1.77]){
    top(P,'turretDetail',box(.03,.023,.27),side*.98,2.16,z);
    top(P,'turretDetail',beamBetween([side*.94,1.78,z],[side*1.01,2.18,z],.011),0,0,0);
  }
}
function roofEquipment(P:TankBuilderPort):void{
  top(P,'turretDetail',cylY(.17485,.4004,32),.9805,2.26858,.31017);
  // Actual Object_16 optical pedestal/body, distinct from Object_17's MG.
  optic(P,'turretDetail',cylY(.24465,.129,32),-.5,2.26518,-.70953);
  optic(P,'turretDetail',cylY(.21715,.2798,32),-.5001,2.46318,-.70953);
  for(const[x,y,z,w,h,d]of [[.63965,2.04628,.82217,.25,.3118,.3984],[.5663,2.10538,.66167,.3879,.2532,.0984],
    [.57855,2.09013,.87752,.4104,.2241,.5701],[-.001,2.09208,1.08417,.3407,.1988,.188],
    [-.8635,2.24178,-.96758,.2105,.1914,.3081],[1.01885,2.01783,-.63043,.2104,.1909,.3086],
    [-.82665,2.35478,-.42913,.1182,.3598,.1184]])top(P,'turretDetail',box(w,h,d),x,y,z);
  optic(P,'turretDetail',box(.2978,.0889,.2803),-.49995,2.64943,-.67338);
  optic(P,'turretDetail',box(.3317,.0117,.0634),-.5001,2.60793,-.58503);
  optic(P,'turretDark',box(.1873,.2056,.012),-.5006,2.47688,-.5598);
  antenna(P);
  top(P,'turretDetail',cylY(.056,.88,16),.2918,2.6643,-.35618);
  for(const y of [2.38,2.60,2.83,3.10353])top(P,'turretDetail',box(.10,.0615,.096),.2918,y,-.35618);
  for(const[x,z,r,y]of [[.59,-.26,.292,2.230],[-.68,.02,.267,2.247]]){
    P.addCupola('turret',cylY(r,.070,32),x-YAW[0],y-YAW[1],z-YAW[2]);
    top(P,'turretDetail',cylY(r*.94,.025,32),x,y+.045,z);
  }
}
function antenna(P:TankBuilderPort):void{
  const rows=[[0,0],[.0129,0],[.0185,.0694],[.0115,.1385],[.012,.5989],[.0094,.6042],[.0093,.7922],
    [.0064,.7986],[.0086,.8041],[.0082,1.0165],[.0078,1.2289],[.0074,1.4414],[.007,1.6538],[.0066,1.8662],[.0062,2.0786],[.0058,2.291],[0,2.291]];
  top(P,'turretDetail',new THREE.LatheGeometry(rows.map(([r,h])=>new THREE.Vector2(r,h)),6).rotateY(Math.PI/6),-.1912,2.33669,-.8695);
}
function machineGun(P:TankBuilderPort):void{
  // Original Object17 is a complete forward-firing MG. Object16 is the remote
  // optical head, not a sideways cannon inferred from its aggregate box.
  top(P,'turretDetail',box(.166,.10,.35),-1.22,2.17,-.755);
  top(P,'turretDetail',beamBetween([-1.10,2.03,-.78],[-1.36,2.20,-.57],.021),0,0,0);
  top(P,'turretDetail',box(.0459,.0501,.2704),-1.41305,2.16652,-.47227);
  const mg=sourceMachineGun(P,YAW);
  mg.add('turretDark',box(.0947,.1225,.4346),-1.35585,2.27072,-.71587);
  mg.add('turretDetail',box(.1518,.0823,.5714),-1.3581,2.25042,-.55247);
  mg.add('turretDark',cylZ(.0253,.2977,24),-1.3613,2.28392,-.18972);
  mg.add('turretDark',cylZ(.01945,.395,24),-1.36935,2.28332,.21863);
  mg.add('turretDark',blindTube(.020,.0064,.1543,.055,24),-1.3739,2.28332,.49128);
  mg.add('turretDetail',box(.0442,.099,.0195),-1.37,2.30967,.22858);mg.finish();
}
function smoke(P:TankBuilderPort):void{
  // Eleven actual source stocks, with measured principal axes; the supplied
  // bank is asymmetric (five left, six right), not an invented mirrored six.
  const rows:readonly(readonly[number,number,number,number,number,number])[]=[
    [-1.588745,1.945825,.983984,-.445211,.620033,.646023],[-1.745049,1.937054,.022267,-.928788,.370611,-.001032],
    [-1.741461,1.927549,.580755,-.928763,.370672,-.000897],[-1.372114,1.936835,1.183703,-.445558,.619833,.645976],
    [-1.164516,1.957622,1.355568,-.445302,.620027,.645967],[1.040403,2.085859,-.928802,.887923,.263429,-.377092],
    [1.313383,2.070785,-.295717,.884929,.442219,.146092],[1.148953,1.909136,1.309635,.490513,.619536,.612840],
    [1.348729,1.910424,1.130039,.490729,.619441,.612762],[1.578230,1.916546,.928224,.490626,.619385,.612901],
    [1.387407,2.164495,-.102897,.884876,.442261,.146283],
  ];
  for(const[x,y,z,dx,dy,dz]of rows){
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(dx,dy,dz).normalize());
    top(P,'turretDark',blindTube(.0608,.037,.36,.115,24).applyQuaternion(q),x,y,z);
    top(P,'turretDetail',beamBetween([x*.89,y-.14,z-.13],[x-dx*.13,y-dy*.13,z-dz*.13],.015),0,0,0);
  }
}
function mainGun(P:TankBuilderPort):void{
  const tip=T90_BURLAK_X_DATUMS.muzzleZ,floor=T90_BURLAK_X_DATUMS.boreFloorZ;
  KIT.buildGun(P,{len:floor-GUN[2],r:.078,baseR:.125,sleeve:false,collar:false});
  P.add('gunMount',cylX(.217,.52,32));
  P.add('gunMount',castSections([[1.15925,.23,.23,1.980,1.5792,1.78445],[1.283482,.27,.27,2.0106,1.5792,1.78445],
    [1.42015,.1514,.1514,1.93585,1.63305,1.78445],[1.60778,.128,.128,1.91245,1.65645,1.78445]],GUN));
  const rows=[[0,1.6078],[.1267,1.6078],[.10921,2.1699],[.10034,3.8774],[.11787,3.8774],[.120615,4.813],
    [.09160,4.813],[.093205,6.0181],[.086625,6.0181],[.086745,6.1470],[.093375,6.1626],[.093505,tip],[.0625,tip],[.0625,floor],[0,floor]];
  P.add('gun',new THREE.LatheGeometry(rows.map(([r,z])=>new THREE.Vector2(r,z)),32).rotateX(Math.PI/2),0,0,-GUN[2]);
  for(const z of [2.39,3.44,5.29])P.add('gun',box(.006,.014,.46),0,.111,z-GUN[2]);
  P.muzzleZ=tip-GUN[2];
}
export function buildT90BurlakX(P:TankBuilderPort):void{
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.topY=T90_BURLAK_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);hullEra(P);deck(P);rear(P);turret(P);frontCurtain(P);bustleAndCases(P);roofEquipment(P);machineGun(P);smoke(P);mainGun(P);
}
export const T90_BURLAK_X_PROFILES={t90a_burlak_x:{build:buildT90BurlakX}} as const;
