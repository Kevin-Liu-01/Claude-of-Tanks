// Independently authored T-72B3 X. Only measured dimensions/planes inform these
// mathematical solids; no source mesh, rig, texture or donor builder is used.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {boxSections,roofSheet,beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces,markEraFurniture} from './eraHitFaces.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {T72B3_X_SOURCE_DATUMS} from '../t72b3XArmor.ts';
import {addT72B3Stowage,addT72B3MgMount,addT72B3MgBracket,addT72B3Optics} from './t72b3XEquipment.ts';
import {addT72B3RearDrums} from './t72b3XRearDrums.ts';
import {addT72B3MachineGunBody} from './t72b3XMachineGunBody.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export const T72B3_X_DATUMS=T72B3_X_SOURCE_DATUMS;
const YAW=T72B3_X_DATUMS.turretPivot,GUN=T72B3_X_DATUMS.trunnion;
const {box,cylX,cylZ,torus}=KIT;
const cylY=(r:number,h:number,n=28)=>KIT.cylY(r,r,h,n);
function turretPart(P:TankBuilderPort,bucket:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(bucket,g,x-YAW[0],y-YAW[1],z-YAW[2],rx,ry,rz);
}

function hull(P:TankBuilderPort):void {
  P.add('hull',boxSections([
    [-3.17815,1.1104,1.222,1.206],[-3.10,1.1104,1.285,1.145],[-2.93,1.1104,1.390,.954],
    [-2.70,1.1104,1.3925,.585],[-2.46,1.1104,1.3949,.418],[-1.402,1.1104,1.4053,.4160],
    [-1.401,1.1104,1.4571,.4160],[1.81,1.1104,1.4599,.4096],
    [2.20,1.1104,1.3078,.4090],[2.49,1.1104,1.1637,.397],
    [2.80,1.1104,1.0096,.611],[3.17815,1.1104,.8215,.819],
  ]));
  // The real collar projects beyond the narrow tub, above the return course.
  P.add('hull',roofSheet([
    [-.85,-1.11,1.11,1.4571,1.4571],[-.35,-1.316,1.316,1.4571,1.4571],
    [.067,-1.3911,1.3911,1.4571,1.4571],[.49,-1.316,1.316,1.4571,1.4571],
    [.88,-1.11,1.11,1.4571,1.4571],
  ],.021));
  for(const side of [-1,1])fender(P,side);
}

function fender(P:TankBuilderPort,side:number):void {
  const left=side<0?-1.7905:1.105,right=side<0?-1.105:1.8113;
  P.addMudguard('t72b3-x-fender','hull',roofSheet([
    [-3.36035,left,right,1.118,1.118],[-3.18,left,right,1.2395,1.2395],[-2.96,left,right,1.400,1.400],
    [-2.76,left,right,1.422,1.422],[-1.89,left,right,1.444,1.444],[.395,left,right,1.4438,1.4438],
    [1.70,left,right,1.392,1.392],[2.50,left,right,1.30735,1.30735],[3.08,left,right,1.242,1.242],
    [3.22,left,right,1.209,1.209],[3.34,left,right,1.120,1.120],[3.43,left,right,1.026,1.026],
    [3.51805,left,right,.838, .838],
  ],.020));
  const x=side<0?-1.769:1.781;
  P.addMudguard('t72b3-x-lower-skirt','hullRubber',sectionSolid([
    [-3.023,.851,1.238],[-2.84,.721,1.128],[2.90,.719,1.128],[3.459,.782,1.123],
  ].map(([z,low,top])=>({z,ring:[[x-.010,low],[x+.010,low],[x+.010,top],[x-.010,top]]}))));
  const upper=side<0?-1.66:1.674;
  P.addMudguard('t72b3-x-inner-apron','hullRubber',box(.018,.200,5.62),upper,1.340,-.209);
  for(const z of [-2.12,-.587,.805,2.222,3.178])P.addEquipment('hullDetail',box(.019,.26,.022),x+side*.012,1.02,z);
  P.addMudguard('t72b3-x-rear-guard','hullRubber',roofSheet([
    [-3.36035,Math.min(side*1.052,side*1.786),Math.max(side*1.052,side*1.786),1.116,1.116],
    [-3.03395,Math.min(side*1.052,side*1.786),Math.max(side*1.052,side*1.786),1.242,1.242],
  ],.014));
}

function runningGear(P:TankBuilderPort):void {
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.3568,wheelY:.395,
    wheelW:.453,wheelFaceDepthScale:.81,wheelZs:[-1.70205,-.91970,-.12865,.67990,1.47690,2.28460],
    // Fitted annular rubber exposes the existing recessed six-rib steel face;
    // it does not move the dish or enlarge the original rolling envelope.
    wheelTireInnerRadiusM:.30685,
    xc:1.4491,xcLeft:1.4518,xcRight:1.4464,trackW:.5564,trackTh:.018,
    sprocket:{z:-2.55065,y:.7365,r:.3305,trackR:.291},idler:{z:2.96555,y:.78960,r:.2844,trackR:.270},
    rollers:[{z:-1.51910,y:.98965,r:.10905},{z:.34900,y:.98965,r:.10905},{z:1.94500,y:.98965,r:.10905}],
    rollerR:.10905,returnRollerWidthM:.312,returnRollerInsetM:.190,
    topY:1.117,botY:.055,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.137,
    sprocketDepthScale:.80,idlerDepthScale:.80,
    trackShoeDimensions:{padHeight:.026,grouserHeight:.009,webHeight:.014,hornHeight:.052,pinRadius:.010,pinCentreY:0},
  });
}

function engineDeck(P:TankBuilderPort):void {
  P.addEquipment('hullDetail',box(1.874,.039,.619),.00315,1.4905,-1.71335);
  for(const x of [-.455,.46]){
    P.addEquipment('hullDetail',box(.856,.043,.995),x,1.4352,-2.590);
    for(let i=0;i<17;i++)P.addEquipment('hullDark',box(.794,.006,.016),x,1.4598,-3.04+i*.055);
  }
  for(const [x,z,w,d,y]of [[-1.42,-2.44,.50,.92,1.428],[1.42,-1.7,.51,1.04,1.489],
    [-1.42,-.22,.48,2.64,1.441],[1.43,-.63,.49,.98,1.447],[1.43,.91,.47,1.13,1.439]]){
    P.addEquipment('hullDetail',box(w,.022,d),x,y,z);
    for(const dz of [-d*.38,d*.38])P.addEquipment('hullDetail',box(.075,.024,.043),x,y+.021,z+dz);
  }
  P.addEquipment('hullDark',box(.173,.106,.654),1.752,1.3365,-1.70625);
  for(const z of [-1.934,-1.79,-1.646,-1.502])P.addEquipment('hullDetail',box(.024,.122,.029),1.837,1.336,z);
  P.addEquipment('hullDetail',cylY(.338,.036,32),-.0429,1.4813,1.61995);
  P.addEquipment('hullDark',box(.365,.019,.064),.039,1.49165,1.7325);
  for(const x of [-.859,.866]){
    P.addEquipment('hullDetail',markVehicleNightLens(cylZ(.082,.104,24),'headlight'),x,1.144,2.777);
    for(const dx of [-.093,.093])P.addEquipment('hullDetail',beamBetween([x+dx,1.11,2.699],[x+dx,1.30,2.79],.008));
  }
}

function rearFittings(P:TankBuilderPort):void {
  addT72B3RearDrums(P);
  P.addEquipment('hullDetail',cylX(.1156,3.1592,24),-.0002,.8958,-3.15755);
  for(const x of [-.760,.768])P.addEquipment('hullDetail',torus(.070,.021,20,8),x,.720,-2.944);
  // One retained physical rear mount, not its five coincident source options.
  P.addEquipment('hullDetail',box(.54,.19,.15),-.364,.817,-2.907);
  P.addEquipment('hullDetail',box(.54,.19,.15),.387,.817,-2.907);
  P.addEquipment('hullDetail',box(.08,.055,.078),-.30645,.726,-2.82);
}

function hullEra(P:TankBuilderPort):void {
  const cells:readonly(readonly[number,number,number,number,number])[]=[
    [-.6625,2.4845,.405,.580,1.2026],[-.2331,2.4914,.431,.580,1.2026],
    [.2123,2.4987,.437,.580,1.2026],[.6417,2.5057,.399,.580,1.2026],
    [-.6349,2.9772,.331,.383,.9545],[-.2407,2.9818,.436,.384,.9551],
    [.2059,2.9871,.437,.381,.9551],[.5988,2.9973,.326,.382,.9545],
  ];
  for(const [x,z,w,d,y]of cells)P.destructibleCluster(`glacis_era_${x<0?'L':'R'}`,()=>{
    P.addExternalArmor('hull',markEraHitFaces(box(w,.029,d/.895),[0,1,0]),x,y,z,.464);
    for(const dz of [-d*.38,d*.38])P.addExternalArmor('hull',markEraFurniture(box(w*.90,.012,.025)),x,y+.027,z+dz,.464);
  });
  for(const side of [-1,1])for(const [z,y,d]of side<0?[[2.3098,1.0328,1.701529775],[1.6327,1.1537,1.701982646],[.9518,1.1717,1.700164178]]:
    [[2.3695,1.0327,1.78502],[1.6925,1.1537,1.784594155],[1.0115,1.1716,1.783052918]])sideCassette(P,side,z,y,d);
}

function sideCassette(P:TankBuilderPort,side:number,z:number,y:number,planeDistance:number):void {
  const normal=new THREE.Vector3(side*.99605885,-.08720394,side*.01619345).normalize();
  const point=new THREE.Vector3((planeDistance-normal.y*y-normal.z*z)/normal.x,y,z);
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(side,0,0),normal);
  // Source frame inner plane is about19.7mm behind its removable outer skin.
  // Close the source's uncapped rear with a12mm cover and separate8mm carrier;
  // their0.3mm lap preserves real physical contact and leaves the belt air.
  const backing=point.clone().addScaledVector(normal,-.0157);
  P.addEquipment('hullDetail',new THREE.BoxGeometry(.008,.45,.622).applyQuaternion(rotation),...backing.toArray());
  const center=point.clone().addScaledVector(normal,-.006);
  P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('hull',
    markEraHitFaces(new THREE.BoxGeometry(.012,.488,.637),[side,0,0]).applyQuaternion(rotation),...center.toArray()));
  for(const dz of [-.27,.27])P.addEquipment('hullDetail',beamBetween([side*1.67,y+.18,z+dz],
    [backing.x,y+.18,z+dz],.014));
}

function casting(P:TankBuilderPort):void {
  const stations:readonly(readonly[number,number,number,number])[]=[
    [-1.32765,.026,.046,1.902],[-1.15,.5103,.5398,2.057],[-.85,.9317,.9105,2.195],
    [-.55,1.1223,1.1415,2.274],[-.25,1.2315,1.2574,2.254],
    [.05,1.2654,1.2999,2.187],[.35,1.2438,1.287,2.1255],[.65,1.1212,1.179,2.0449],
    [.95,.8663,.9434,1.9433],[1.10,.6679,.7381,1.8857],
  ];
  const rows=stations.map(([z,l,r,top])=>{
    const low=1.446,leftShoulder=1.575,rightShoulder=1.650;
    const ring:Array<readonly[number,number]>=[[-l*.98,low],[r*.98,low],[r,rightShoulder]];
    // Fixed source transverse sections have broad cast shoulders rather than
    // an ellipse. The right course is fuller than the left around the sights.
    for(let i=1;i<24;i++){
      const a=i*Math.PI/24,c=Math.cos(a),w=c<0?l:r,shoulder=c<0?leftShoulder:rightShoulder;
      ring.push([c*w,shoulder+(top-shoulder)*Math.pow(Math.sin(a),c<0?.72:.60)]);
    }
    ring.push([-l,leftShoulder]);return{z:z-YAW[2],ring:ring.map(([x,y])=>[x-YAW[0],y-YAW[1]] as const)};
  });
  P.add('turret',sectionSolid(rows));
  for(const side of [-1,1])P.add('turret',sectionSolid([[1.09,.746,1.89],[1.20,.38,1.82],[1.259,.20,1.643]].map(([z,w,y])=>{
    const a=side<0?-w:.18,b=side<0?-.18:w;
    return{z:z-YAW[2],ring:[[a,1.447-YAW[1]],[b,1.447-YAW[1]],[b,y-YAW[1]],[a,y-YAW[1]]]};
  })));
  P.add('turret',cylY(1.10204,.030,40),0,-.005,0);
}

type CassettePlane=readonly[x:number,y:number,z:number,width:number,length:number,pitch:number,yaw:number];
function turretCassette(P:TankBuilderPort,plane:CassettePlane,thickness:number):void {
  const [x,y,z,w,d,pitch,yaw]=plane;
  const nx=Math.sin(yaw)*Math.sin(pitch),ny=Math.cos(pitch),nz=Math.cos(yaw)*Math.sin(pitch);
  // Apply the rotations to the original box in physical pitch-then-yaw order.
  // The measured point is on the exposed plane, not its bounds centroid.
  const g=markEraHitFaces(new THREE.BoxGeometry(w,thickness,d),[0,1,0]).rotateX(pitch).rotateY(yaw);
  P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>P.addExternalArmor('turret',g,
    x-nx*thickness/2-YAW[0],y-ny*thickness/2-YAW[1],z-nz*thickness/2-YAW[2]));
}

function cheekEra(P:TankBuilderPort):void {
  // Nine upper and nine separately inclined lower cassettes, with actual air
  // between their courses. Their retained narrow carriers are not ERA armor.
  const upper:readonly CassettePlane[]=[
    [-1.509584,1.919239,.330020,.302965,.582761,.290104,-1.047309],
    [-1.315550,1.919250,.633050,.302976,.582762,.290104,-.872803],
    [-1.129350,1.932351,.918400,.302925,.623033,.293590,-.785398],
    [-.867540,1.918100,1.149207,.303100,.633799,.294618,-.610617],
    [-.573150,1.919250,1.321350,.302961,.582678,.290147,-.523773],
    [.644700,1.919250,1.336100,.303006,.582761,.290104,.523609],
    [.939072,1.918089,1.163931,.303043,.633744,.294580,.611078],
    [1.200850,1.932350,.933200,.302925,.623033,.293591,.785398],
    [1.406600,1.919250,.672700,.302901,.582688,.290142,.872592],
  ];
  const lower:readonly CassettePlane[]=[
    [-1.523750,1.702201,.338150,.316823,.576011,.442408,2.094211],
    [-1.328100,1.702201,.643550,.316782,.576030,.442393,2.269011],
    [-1.154100,1.702200,.943200,.316855,.575963,.442448,2.356194],
    [-.896650,1.702200,1.190800,.316820,.576013,.442407,2.530737],
    [-.581323,1.702200,1.335565,.316837,.576011,.442446,2.618062],
    [.652860,1.702210,1.350268,.316858,.576011,.442408,-2.617904],
    [.968217,1.702200,1.205573,.316815,.576013,.442449,-2.530996],
    [1.225650,1.702200,.957950,.316855,.575963,.442447,-2.356195],
    [1.419130,1.702200,.683225,.316879,.576030,.442449,-2.269050],
  ];
  for(const plane of upper){
    turretCassette(P,plane,.084);
    const [x,,z,,,pitch,yaw]=plane,nx=Math.sin(yaw)*Math.sin(pitch),nz=Math.cos(yaw)*Math.sin(pitch);
    turretPart(P,'turretDetail',beamBetween([x-nx*.30,1.72,z-nz*.30],[x-nx*.045,1.80,z-nz*.045],.015),0,0,0);
  }
  for(const plane of lower)turretCassette(P,plane,.0808);
}

function roofEra(P:TankBuilderPort):void {
  const covers:readonly CassettePlane[]=[
    [-.542549,2.149450,.332200,.147700,.314639,.262015,0],
    [-.374549,2.173650,.338700,.147700,.314639,.262015,0],
    [-.200099,2.160700,.414300,.147800,.314613,.261708,0],
    [-.03209965,2.16110032,.41440002,.147800,.314639,.261710,0],
    [.142851,2.169950,.416750,.147700,.314735,.261933,0],
    [-.115149,2.238300,.047650,.147700,.314575,.174451,0],
    [.05285036,2.23500029,.04710001,.147700,.314639,.174396,0],
    [.227801,2.244100,.048700,.147800,.314673,.174396,0],
    [-.0384496,2.3246002,-.3131,.147700,.314700,.087213,0],
  ];
  for(const plane of covers)turretCassette(P,plane,.0584);
  for(const [x,y,z,w,d,pitch]of [[-.031071,2.172685,.417496,.1594,.401793,.261821],
    [.052074,2.246823,.049195,.1593,.401792,.174355],[-.039120,2.336610,-.312099,.1594,.401827,.087213]]){
    P.destructibleCluster(`turret_era_${x<0?'L':'R'}`,()=>turretPart(P,'turretDetail',
      markEraFurniture(box(w,.012,d).rotateX(pitch)),x,y-.006*Math.cos(pitch),z-.006*Math.sin(pitch)));
  }
}

function roofEquipment(P:TankBuilderPort):void {
  P.addCupola('turret',cylY(.405,.111,32),-.6042,2.285-YAW[1],-.265-YAW[2]);
  turretPart(P,'turretDetail',cylY(.358,.078,28),-.61355,2.411,-.363);
  P.addCupola('turret',cylY(.345,.068,28),.56485,2.205-YAW[1],-.462-YAW[2]);
  turretPart(P,'turretDetail',cylY(.323,.033,28),.56485,2.274,-.462);
  turretPart(P,'turretDetail',box(.402,.077,.337),.0657,2.271,-.75675);
  addT72B3Stowage(P);addT72B3Optics(P);
}

function antennae(P:TankBuilderPort):void {
  for(const [x,z,low,wideTop,neckTop]of [[-.2288,-1.0235,2.0291,2.0832,2.2685],[1.0391,-.18205,2.0272,2.1725,2.3577]]){
    turretPart(P,'turretDetail',cylY(.07895,wideTop-low,6),x,(low+wideTop)/2,z);
    turretPart(P,'turretDetail',cylY(.03095,neckTop-wideTop,6),x,(wideTop+neckTop)/2,z);
  }
  taperedWhip(P,-.2274,[[2.185,-1.02321667,.01266667],[2.983,-1.03671667,.01086667],
    [3.6303,-1.06755,.0084],[4.2775,-1.12241667,.00326667]]);
  taperedWhip(P,1.0405,[[2.2743,-.18178333,.01273333],[3.2332,-.18128333,.01093333],
    [4.2167,-.21335,.0084],[5.457,-.29361667,.00326667]]);
  compactAntenna(P);
}

function taperedWhip(P:TankBuilderPort,x:number,sections:readonly(readonly[number,number,number])[]):void {
  // The source's three-sided low-poly rod has three distinct bend segments.
  // Independent radius/axis stations define an analytic prism loft, not a
  // straight needle or transferred source vertex/index array.
  const g=sectionSolid(sections.map(([y,z,r])=>({z:y,ring:Array.from({length:3},(_,i)=>{
    const a=-Math.PI/2+i*Math.PI*2/3;return[x+r*Math.cos(a),-z+r*Math.sin(a)] as const;
  })}))).rotateX(-Math.PI/2);
  turretPart(P,'turretDetail',g,0,0,0);
}

function compactAntenna(P:TankBuilderPort):void {
  const profile=[[0,2.0154],[.028,2.0154],[.028,2.333],[.0322,2.4574],
    [.0287,2.6058],[.0287,2.6516],[.01055,2.685],[.01055,2.7524],[0,2.7524]];
  const g=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),6).rotateY(-.0518);
  turretPart(P,'turretDetail',g,.4146,0,-.9184);
  for(const[w,low,high,d]of [[.06685,2.4542,2.5151,.12955],[.058,2.5106,2.6093,.10975],
    [.0198,2.7476,2.7847,.0518]])turretPart(P,'turretDetail',box(w,high-low,d),.4146,(low+high)/2,-.9184,0,-.0518);
}

function smoke(P:TankBuilderPort):void {
  const stations:readonly Point3[]=[[1.23465,2.10945,.04465],[1.37475,2.10965,.04485],[1.5124,2.10985,.04505],
    [1.30765,1.97605,.16515],[1.44775,1.97625,.16525],[1.58535,1.97645,.16545],
    [1.38285,1.85265,.27655],[1.52295,1.85285,.27675]];
  for(const [x,y,z]of stations){
    turretPart(P,'turretDetail',beamBetween([x,y-.080,z-.085],[1.24,y-.10,z-.15],.020),0,0,0);
    turretPart(P,'turretDark',blindTube(.04825,.035,.273,.170,20),x,y,z,-.70);
  }
}

function machineGun(P:TankBuilderPort):void {
  const mg=sourceMachineGun(P,YAW);
  addT72B3MgMount(mg);
  addT72B3MachineGunBody(mg);
  addT72B3MgBracket(mg);
  const group=mg.finish();
  // Preserve the actual aft-pointing stock while making +Z in the fitting's
  // own frame truthful. Counter-rotation leaves every world-space solid fixed.
  for(const child of group.children)if(child instanceof THREE.Mesh)child.geometry.rotateY(Math.PI);
  group.rotation.y=Math.PI;
}

function mainGun(P:TankBuilderPort):void {
  const muzzle=T72B3_X_DATUMS.muzzleZ,floor=4.505949855;
  KIT.buildGun(P,{len:floor-GUN[2],r:.08535,baseR:.122,sleeve:false,collar:false});
  P.add('gun',boxSections([[.02755-GUN[2],.187, .062,-.255],[.98-GUN[2],.211,.062,-.255],[1.13415-GUN[2],.20,-.03,-.255]]));
  for(const [a,b,r]of [[1.51715,2.087,.1231],[2.087,3.62795,.0959],[3.62795,4.45015,.114]])P.add('gun',cylZ(r,b-a,32),0,0,(a+b)/2-GUN[2]);
  // Source has a large conical hole. The approved physical125mm cylinder
  // retains its measured deep end, with the full source exterior unchanged.
  P.add('gun',blindTube(.08535,.0625,muzzle-4.45015,muzzle-floor,32),0,0,(muzzle+4.45015)/2-GUN[2]);
  for(const [a,b]of [[2.14685,2.76535],[2.88565,3.54455],[4.52255,4.98975],[5.11675,5.58865]])P.add('gun',box(.0053,.0296,b-a),.001,1.8572-GUN[1],(a+b)/2-GUN[2]);
  P.add('gunMount',cylX(.205,.586,28),0,0,.012);
  P.add('gunMount',boxSections([[.94005-GUN[2],.240,.060,-.260],[1.09655-GUN[2],.293,.15,-.15],[1.56425-GUN[2],.130,.123,-.123]]));
  P.add('gunMount',cylZ(.0081,.1607,12),-.31085,1.61635-GUN[1],1.17030-GUN[2]);
  P.muzzleZ=muzzle-GUN[2];
}

export function buildT72B3X(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...YAW);
  P.gunG.position.set(GUN[0]-YAW[0],GUN[1]-YAW[1],GUN[2]-YAW[2]);
  P.muzzleZ=T72B3_X_DATUMS.muzzleZ-GUN[2];P.topY=T72B3_X_DATUMS.highestFittingM-YAW[1];
  hull(P);runningGear(P);engineDeck(P);rearFittings(P);hullEra(P);casting(P);cheekEra(P);roofEra(P);
  roofEquipment(P);antennae(P);smoke(P);machineGun(P);mainGun(P);
}
export const T72B3_X_PROFILES={t72b3_x:{build:buildT72B3X}} as const;
