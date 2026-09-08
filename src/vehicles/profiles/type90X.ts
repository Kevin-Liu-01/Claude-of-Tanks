// Original parametric Type90 X; local source supplies scalar landmarks only.
// Visual X follows the supplied uniformly registered source. Published
// 9.80×3.40×2.30m dimensions remain separately documented, never oracle warps.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {roundedTrackContact} from './roundedTrackContact.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylX,cylZ}=KIT;
const cylinder=(r:number,h:number,n=32)=>KIT.cylY(r,r,h,n);
const PIVOT=[0,1.681682,.156993] as const;
const GUN=[0,1.997083,1.650032] as const;
export const TYPE90_X_DATUMS=Object.freeze({
  dims:{hullLengthM:7.798844,overallLengthM:9.80,widthM:3.61781384,heightM:2.459472},
  roofHeightM:2.459472,highestFittingM:4.657996,
  turretPivot:PIVOT,trunnion:GUN,muzzleZ:5.754624,
  wheelStations:[-2.228306,-1.303397,-.252275,.546421,1.492415,2.438410] as const,
  wheelRadiusM:.357347,wheelY:.44142,
});

function turret(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,
  x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(slot,g,x-PIVOT[0],y-PIVOT[1],z-PIVOT[2],rx,ry,rz);
}

function gun(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,
  x:number,y:number,z:number):void {
  P.add(slot,g,x-GUN[0],y-GUN[1],z-GUN[2]);
}

function hullRow(z:number,roof:number,floor:number):SolidSection {
  const bevel=Math.min(.055,(roof-floor)*.3);
  return{z,ring:[[-.922,floor],[.922,floor],[.94,roof-bevel],
    [.915,roof],[-.915,roof],[-.94,roof-bevel]]};
}

function hull(P:TankBuilderPort):void {
  P.add('hull',sectionSolid([
    hullRow(-3.899422,1.849889,1.545),hullRow(-3.6356,1.846384,.91),
    hullRow(-3.0938,1.839188,.582),hullRow(-2.551999,1.831992,.447),
    hullRow(-2.250,1.734454,.447),hullRow(-1.797,1.702761,.447),
    hullRow(-.40,1.702761,.447),hullRow(-.30,1.639667,.447),
    hullRow(1.355,1.639666,.447),hullRow(2.324,1.467672,.447),
    hullRow(3.408,1.275149,.647),hullRow(3.570,1.0827,.902),
  ]));
  P.add('hull',cylinder(1.159,.062,64),0,1.659,.156993);
  for(const side of [-1,1]) {shoulder(P,side);skirts(P,side);endSheets(P,side);}
  frontEquipment(P);rearEquipment(P);
}

function shoulder(P:TankBuilderPort,side:number):void {
  const rows=[[-3.899422,1.849889,1.849889,1.58],[-3.6356,1.846384,1.831422,1.39],
    [-3.094,1.839191,1.793512,1.287],[-2.55,1.831965,1.755435,1.287],
    [-2.250,1.734454,1.734454,1.287],[-1.797,1.702761,1.702761,1.287],
    [-.40,1.702761,1.702761,1.287],[-.30,1.639667,1.639667,1.287],
    [1.355,1.639666,1.639666,1.287],[2.324,1.467672,1.467672,1.287],
    [2.834,1.377,1.377,1.287],[3.57,1.377,1.377,1.287],
    [3.899422,1.251,1.251,1.15]];
  P.add('hull',sectionSolid(rows.map(([z,top,sideTop,bottom])=>{
    const ring:[number,number][]=[[.932,bottom],[1.681714,bottom],
      [1.681714,sideTop],[1.40,sideTop],[1.398,top],[.932,top]];
    return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  })));
  // Source high shoulder ends at X1.6817. The separate lowered wing reaches
  // X1.7868; widening the high block would erase this full-length step.
  P.add('hull',sectionSolid([[-3.49,1.377,1.287],[3.563,1.377,1.287],
    [3.899422,1.251,1.15]].map(([z,top,bottom])=>{
    const ring:[number,number][]=[[1.674,bottom],[1.786824,bottom],[1.786824,top],[1.674,top]];
    return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  })));
}

function skirts(P:TankBuilderPort,side:number):void {
  P.addEquipment('hullDetail',sectionSolid([[-3.50,1.103646],[-3.0,1.103646],[-2.54,.694]].map(([z,bottom])=>{
    const ring:[number,number][]=[[1.694,bottom],[1.786824,bottom],[1.786824,1.377],[1.694,1.377]];
    return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  })));
  for(const [a,b,bottom]of[[-2.54,-1.60,.694],[-1.60,-.56,.694],[-.56,.49,.694],
    [.49,1.55,.694],[1.55,2.57,.694],[2.57,3.40,.8456]]) {
    P.addEquipment('hullRubber',box(.024,1.377-bottom,b-a-.014),side*1.774824,(1.377+bottom)/2,(a+b)/2);
    P.addEquipment('hullDetail',box(.032,.030,.10),side*1.770,1.381,(a+b)/2);
  }
}

function endSheets(P:TankBuilderPort,side:number):void {
  for(const [tag,points,width,x]of[
    ['forward',[[3.889,1.167],[4.0397,.8432],[4.026,.837],[3.8753,1.1606]],.853471,.955435],
  ] as const) {
    const shape=new THREE.Shape(points.map(([z,y])=>new THREE.Vector2(-side*z,y)));
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,steps:1,bevelEnabled:false});g.rotateY(side*Math.PI/2);
    P.addMudguard(`type90-x-${tag}-fold`,'hullRubber',g,side*x,0,0);
  }
  P.addMudguard('type90-x-rear-flat-sheet','hullRubber',box(.735774,.388895,.010468),
    side*1.376871,.9092,-3.494915);
  const rearFold=sectionSolid([[-3.668232,1.156132],[-3.50,1.156132],[-3.437043,1.336]].map(([z,bottom])=>{
    const ring:[number,number][]=[[1.003795,bottom],[1.61867,bottom],[1.61867,1.347508],
      [1.15616,1.347508],[1.003795,1.198285]];
    if(bottom>1.198285)ring[4][1]=bottom+.004;
    return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  }));
  P.addEquipment('hullDetail',rearFold);
  for(const x of [.962435,1.801906]) {
    const sideFold=new THREE.Shape([[3.164,.699],[3.889,1.167],[4.004,.829],[3.904,.828]]
      .map(([z,y])=>new THREE.Vector2(-side*z,y)));
    const g=new THREE.ExtrudeGeometry(sideFold,{depth:.014,steps:1,bevelEnabled:false});
    g.rotateY(side*Math.PI/2);
    P.addMudguard('type90-x-front-side-return','hullRubber',g,side*(x-.007),0,0);
  }
}

function frontEquipment(P:TankBuilderPort):void {
  // Three separate cast periscope hoods; source puts the driver to +X.
  for(const [x,width,roof,z]of[[.14447,.24489,1.618727,2.04362],
    [.438826,.278455,1.639666,2.028519],[.708669,.245111,1.618727,2.03914]]) {
    const g=sectionSolid([[z-.105,roof-.10],[z-.035,roof],[z+.105,roof]].map(([station,top])=>({z:station,
      ring:[[-width/2,1.492539],[width/2,1.492539],[width/2,top],[-width/2,top]] as [number,number][],
    })));
    P.addEquipment('hullDetail',g,x,0,0);
    P.addEquipment('hullGlass',box(width*.74,.038,.004),x,roof-.033,z+.107);
  }
  for(const side of [-1,1]) {
    for(const [x,y,r,depth]of[[1.355893,1.439983,.042086,.096604],[1.269718,1.431538,.033641,.073575]]) {
      P.addEquipment('hullDetail',cylZ(r,depth,24),side*x,y,3.510617-depth/2);
      P.addEquipment('hullGlass',markVehicleNightLens(cylZ(r*.82,.004,24),'headlight'),side*x,y,3.510617);
      P.addEquipment('hullDetail',box(.0252,.042017,.020936),side*x,1.397967,3.468446);
    }
    for(const z of [3.400256,3.526319]) {
      for(const x of [1.210,1.424])P.addEquipment('hullDetail',box(.016,.13917,.031403),side*x,1.446544,z);
      P.addEquipment('hullDetail',box(.230095,.016,.031403),side*1.317029,1.508129,z);
    }
    for(const [x,y,z]of[[.819851,.93502,3.689617],[.630664,1.15166,3.571928]]) {
      const eye=new THREE.TorusGeometry(.052,.017,8,24);eye.rotateY(Math.PI/2);
      P.addEquipment('hullDetail',eye,side*x,y,z);
      P.addEquipment('hullDetail',box(.041955,.10,.06),side*x,y-.028,z-.048);
    }
  }
}

function rearEquipment(P:TankBuilderPort):void {
  const stern=sectionSolid([[-3.962528,1.10365,1.828951,1.129884],
    [-3.889,1.07642,1.828951,1.129884],[-3.80,1.043457,1.477149,.914473],
    [-3.6787,.998536,1.015,.914473]].map(([z,low,top,outer])=>({z,
    ring:[[-.914473,low],[.914473,low],[outer,Math.min(top-.006,1.50)],
      [outer,Math.min(top-.003,1.75)],[Math.min(.94594,outer),top],
      [-Math.min(.94594,outer),top],[-outer,Math.min(top-.003,1.75)],
      [-outer,Math.min(top-.006,1.50)]] as [number,number][],
  })));
  P.addEquipment('hullDetail',stern);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',sectionSolid([[-3.962528,1.439916,1.755248],
      [-3.87,1.439916,1.754],[-3.789061,1.439916,1.442]].map(([z,low,top])=>({z,
      ring:[[1.292849,low],[1.602881,low],[1.602881,top],[1.292849,top]] as [number,number][],
    }))),side<0?-2.89573:0,0,0);
    const eye=new THREE.TorusGeometry(.105,.021033,8,28);eye.rotateY(Math.PI/2);
    P.addEquipment('hullDetail',eye,side*1.639703,1.7039,-3.9185);
    P.addEquipment('hullDetail',box(.042066,.075,.11),side*1.639703,1.8111,-3.8801);
  }
}

function armorRow(z:number,left:number,right:number,low:number,top:number):SolidSection {
  const rightRoof=Math.min(top,2.459472-.874946*(right-1.05105));
  const leftRoof=Math.min(top,2.459472-.874946*(left-1.14567));
  return{z:z-PIVOT[2],ring:[[-left+.030,low-PIVOT[1]],[right-.030,low-PIVOT[1]],
    [right,low+.036-PIVOT[1]],[right,rightRoof-PIVOT[1]],
    [Math.min(right-.003,1.05105),top-PIVOT[1]],
    [-Math.min(left-.003,1.14567),top-PIVOT[1]],
    [-left,leftRoof-PIVOT[1]],[-left,low+.036-PIVOT[1]]]};
}

function turretArmor(P:TankBuilderPort):void {
  P.add('turret',sectionSolid([
    armorRow(-2.007733,1.229805,1.114095,1.82880,2.459472),
    armorRow(-1.47,1.262868,1.152498,1.734308,2.459472),
    armorRow(-.927,1.296256,1.191278,1.734308,2.459472),
    armorRow(.157,1.313827,1.219205,1.681682,2.459472),
    armorRow(.557,1.313827,1.219205,1.681682,2.459472),
    armorRow(.699,1.313827,1.219205,1.681682,2.436957),
    armorRow(1.241,1.292065,1.193370,1.681682,2.350904),
    armorRow(1.649,1.198815,1.082671,1.681682,2.286126),
  ]));
  for(const side of [-1,1]) {
    const a=side<0?1.198815:1.082671,b=side<0?.767568:.692089;
    const rows=[[1.646,a,1.681682,2.2866],[2.053,b,1.71295,2.222014],
      [2.100,side<0?.663935:.602328,1.72152,2.214555],[2.112711,.515,1.733,2.21254]];
    P.add('turret',sectionSolid(rows.map(([z,out,low,top])=>{
      const ring:[number,number][]=[[.4729,low],[out,low],[out,top-.022],[.4729,top]];
      return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    })),0,-PIVOT[1],-PIVOT[2]);
  }
  turret(P,'turret',cylinder(1.155,.070,64),0,1.680,.156993);
}

function frameBar(P:TankBuilderPort,a:number[],b:number[],radius=.011):void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),axis=end.clone().sub(start);
  const g=cylinder(radius,axis.length(),10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize()));
  const c=start.add(end).multiplyScalar(.5);turret(P,'turretOpenLattice',g,c.x,c.y,c.z);
}

function basket(P:TankBuilderPort):void {
  // Source three horizontal courses, inclined floor and narrow open posts.
  const rear=-2.465,front=-2.007733,left=-1.193,right=1.0774;
  for(const y of [2.03163,2.15468,2.35967]) {
    frameBar(P,[left,y,rear],[right,y,rear],.021);
    for(const x of [left,right])frameBar(P,[x,y,rear],[x,y,front],.021);
  }
  for(const x of [-.951737,-.688960,-.426184,-.163407,.047808,.310584,.573360,.836137])
    frameBar(P,[x,2.024374,rear],[x,2.359667,rear],.021);
  for(const x of [left,right])for(const [z,low]of[[-2.32296,1.97440],[-2.10748,1.898605]])
    frameBar(P,[x,low,z],[x,2.359667,z],.021);
  const g=sectionSolid([[-2.452168,1.876131],[-2.007733,2.032470]].map(([z,roof])=>({z,
    ring:[[-1.178243,roof-.01047],[1.062644,roof-.01047],[1.062644,roof],[-1.178243,roof]] as [number,number][],
  })));
  turret(P,'turretOpenLattice',g,0,0,0);
}

function optic(P:TankBuilderPort):void {
  // Right front hood: closed 10mm top over a true frontal recess.
  turret(P,'turretDetail',box(.578108,.31533,.36187),.656886,2.491089,1.011185);
  const lid=sectionSolid([[1.145,2.650038,.289054],[1.312,2.679472,.289054],
    [1.467293,2.706543,.210]].map(([z,roof,half])=>({z,
    ring:[[-half,roof-.010646],[half,roof-.010646],[half,roof],[-half,roof]] as [number,number][],
  })));
  turret(P,'turretDetail',lid,.656886,0,0);
  turret(P,'turretGlass',box(.492,.206,.006),.656886,2.526,1.19512);
  const cupola=cylinder(.38362,.115719,40);cupola.scale(1,1,.3599445/.38362);
  turret(P,'turretHatch',cupola,-.641153,2.517331,.123371);
  turret(P,'turretDetail',KIT.cylY(.1682,.2775,.157596,12),-.641153,2.653989,.115596);
  for(let i=0;i<7;i++) {
    const a=i*Math.PI*2/7;turret(P,'turretGlass',box(.09,.057,.030),-.641153+Math.sin(a)*.370,2.522,.123371+Math.cos(a)*.346,0,a);
  }
  turret(P,'turretHatch',box(.609575,.02108,.430976),.525553,2.47015,.152382);
  turret(P,'turretDetail',cylinder(.131388,.225994,24),-.494031,2.593546,.55704);
  for(const x of [-.31533,.31533]) {
    const eye=new THREE.TorusGeometry(.047,.013,8,20);eye.rotateY(Math.PI/2);
    turret(P,'turretDetail',eye,x,2.29692,1.90156);
  }
}

function roofWeapon(P:TankBuilderPort):void {
  const w=sourceMachineGun(P,PIVOT);
  w.add('turretDetail',box(.084133,.021078,.104978),.084077,2.470010,.420359);
  w.add('turretDetail',cylinder(.03157,.127,16),.084077,2.5436,.420359);
  w.add('turretDetail',box(.084133,.211,.104978),.084077,2.71185,.420359);
  w.add('turretDetail',box(.168155,.210221,.210255),.084133,2.669693,.704187);
  w.add('turretDetail',box(.063154,.073564,.126212),.084077,2.727552,.535954);
  w.add('turretDark',box(.105111,.168066,.578124),.084077,2.900991,.278595);
  w.add('turretDark',box(.094511,.094641,.210254),.084077,2.911460,.672784);
  w.add('turretDark',cylZ(.03157,.724974,20),.084077,2.911460,1.140398);
  w.add('turretDetail',box(.294243,.189143,.168383),.325821,2.848436,.472998);
  w.add('turretDetail',box(.042066,.021078,.126212),.157666,2.848436,.472848);
  for(const x of [.01579,.15242])w.add('turretDetail',box(.031467,.126049,.031403),x,2.921999,-.086284);
  for(const z of [.073425,.541338])w.add('turretDetail',box(.031578,.031547,.031703),.084077,3.000798,z);
  w.finish();
}

function smokeBank(P:TankBuilderPort,side:number):void {
  const x=side<0?-1.387471:1.28236;
  turret(P,'turretDetail',box(.157666,.052486,.630464),side*1.27706,2.075882,-.956462);
  for(const z of [-1.224102,-1.066486,-.908870,-.745871]) {
    const axis=new THREE.Vector3(0,.86627,.49957).normalize();
    const back=new THREE.Vector3(x,2.10355,z),front=back.clone().addScaledVector(axis,.30487);
    const outer=.052555,inner=.040,shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(shape,{depth:.30487,steps:1,bevelEnabled:false,curveSegments:16});
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
    turret(P,'turretDetail',g,back.x,back.y,back.z);
    const rimShape=new THREE.Shape();rimShape.absarc(0,0,.0631,0,Math.PI*2,false);rimShape.holes.push(hole.clone());
    const rim=new THREE.ExtrudeGeometry(rimShape,{depth:.04209,steps:1,bevelEnabled:false,curveSegments:16});
    rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
    const r=front.clone().addScaledVector(axis,-.04209);turret(P,'turretDetail',rim,r.x,r.y,r.z);
    const cap=cylZ(inner,.012,16);cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
    const c=front.clone().addScaledVector(axis,-.033);turret(P,'turretDark',cap,c.x,c.y,c.z);
  }
}

function antennas(P:TankBuilderPort):void {
  for(const side of [-1,1]) {
    const x=side*1.1772495;
    turret(P,'turretDetail',cylinder(.05255,.248,20),x,2.32,-1.91);
    const a=new THREE.Vector3(x,2.435,-1.91),b=new THREE.Vector3(x,4.657996,-2.516);
    const d=b.clone().sub(a),g=KIT.cylY(.0024,.011,d.length(),8);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
    const c=a.add(b).multiplyScalar(.5);turret(P,'turretDark',g,c.x,c.y,c.z);
  }
  turret(P,'turretDetail',box(.126199,.262846,.157615),-.010489,2.443769,-2.086540);
  turret(P,'turretDetail',cylinder(.0578,.10511,20),-.010489,2.627747,-2.102242);
  turret(P,'turretDark',cylinder(.047311,.472927,20),-.010489,2.916766,-2.102242);
}

function mainGun(P:TankBuilderPort):void {
  const boot=sectionSolid([[1.650032,1.6965,2.285962],[1.80,1.686893,2.262163],
    [1.99,1.701462,2.232012],[2.112711,1.72384,2.21254]].map(([z,low,top])=>({z,
    ring:[[-.515009,low],[.472942,low],[.472942,top],[-.515009,top]] as [number,number][],
  })));
  gun(P,'gunMount',boot,0,0,0);
  gun(P,'gunMount',cylX(.180,.930,32),-.021034,1.997083,1.876);
  for(const [a,b,rr,rf]of[[2.106,2.396,.208,.208],[2.396,2.765,.208,.134],
    [2.765,3.302,.134,.131],[3.302,3.690,.149,.172],[3.690,3.961,.172,.102],
    [3.961,5.541,.102,.095],[5.541,5.734625,.081,.081]])
    gun(P,'gun',cylZ(rf,b-a,P.q?32:20,rr),0,1.997083,(a+b)/2);
  for(const z of [2.71,2.82,3.95])gun(P,'gun',cylZ(.139,.014,28),0,1.997083,z);
  gun(P,'gun',box(.074,.068,.162),-.076,1.997083,5.6075);
  gun(P,'gun',box(.135584,.094641,.157616),.123494,1.997012,5.586391);
  P.muzzleZ=TYPE90_X_DATUMS.muzzleZ-GUN[2];
}

function roadWheelCore(quality:boolean):THREE.BufferGeometry {
  // Independent lathed forging: the source dish is ~120mm behind its rubber
  // front face, while the small clipped hub projects back toward that face.
  const profile=[[0,-.246988],[.316,-.246988],[.316,.246988],
    [.309,.13170],[.111,.12499],[.111,.194432],[.096,.194432],
    [.079,.22650],[0,.252278],[0,-.246988]];
  return new THREE.LatheGeometry(profile.map(([r,x])=>new THREE.Vector2(r,x)),quality?32:20)
    .rotateZ(-Math.PI/2);
}

export function buildType90X(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(...PIVOT);
  P.gunG.position.set(GUN[0]-PIVOT[0],GUN[1]-PIVOT[1],GUN[2]-PIVOT[2]);
  hull(P);
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.357347,wheelW:.493976,wheelY:.44142,
    wheelTireInnerRadiusM:.3158,wheelCoreGeometry:{disc:roadWheelCore(Boolean(P.q))},roadWheelOutsetM:.015776,
    wheelZs:[...TYPE90_X_DATUMS.wheelStations],xc:1.366395,trackW:.630667,trackTh:.032,
    trackShoeDimensions:{padHeight:.064,grouserHeight:.022,webHeight:.032,hornHeight:.103},
    idler:{z:3.510616,y:.81982,r:.357347,trackR:.3161},
    sprocket:{z:-2.94311,y:.86132,r:.36981,trackR:.2852},
    rollerR:.10,rollers:[{z:-1.92,y:1.0559,r:.10},{z:.04,y:1.0559,r:.10},{z:2.03,y:1.0559,r:.10}],
    // One native course. Explicit source skin centerline compensates the
    // renderer's12mm band-to-shoe offset, so actual shoe inner faces contact
    // the unchanged physical rollers instead of hovering above them.
    loopPoints:roundedTrackContact(KIT.trackLoopPoints({
      idler:{z:3.510616,y:.81982,r:.3161},sprocket:{z:-2.94311,y:.86132,r:.2852},
      botY:.0865,topY:1.242,sag:.022,
      contact:KIT.runningGearContactPatch(TYPE90_X_DATUMS.wheelStations,.357347),
      supports:[-1.92,.04,2.03].map(z=>({z,y:1.1599})),
    }),.0865,.389),
    topY:1.242,botY:.0865,paintedEnds:true,coveredTop:true,arms:true,
  });
  turretArmor(P);basket(P);optic(P);roofWeapon(P);smokeBank(P,-1);smokeBank(P,1);antennas(P);mainGun(P);
  P.topY=3.153229-PIVOT[1];
  P.hullG.userData.xRebuild={candidate:'type90_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}

export const TYPE90_X_PROFILES={type90_x:{build:buildType90X}} as const;
