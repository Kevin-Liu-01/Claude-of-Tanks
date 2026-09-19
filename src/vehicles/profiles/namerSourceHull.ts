// Independent Namer hull stock from sparse source-only planes and sections.
// The rear access lane is exterior air between two closed shoulder wings.
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { namerHullPart as put } from './namerSourceFrame.ts';

function mainSection(z: number, roof: number, floor: number, outside: number,
  lower: number, recessed=false, bay=1.280): SolidSection {
  const edge=Math.min(roof-.004,2.5925-.6047*outside);
  const knee=Math.max(lower+.012,Math.min(1.445,edge-.004));
  const crown=Math.min(outside-.018,Math.max(1.114,(2.5925-roof)/.6047));
  const recess=roof-(recessed?.104:0),rise=Math.max(0,Math.min(.045,(lower-floor)*.6));
  const sideFloor=Math.min(floor+rise+.010,lower-.001);
  return {z,ring:[
    [-.949,sideFloor],[-.411,floor+rise],[0,floor],[.411,floor+rise],[.949,sideFloor],
    [.949,lower],[1.035,lower],[1.065,bay],[1.650,bay],[outside-.015,lower],[outside,knee],[outside,edge],
    [crown,roof],[.977,roof],[.957,recess],[-.883,recess],[-.903,roof],[-crown,roof],
    [-outside,edge],[-outside,knee],[-outside+.015,lower],[-1.650,bay],[-1.065,bay],[-1.035,lower],[-.949,lower],
  ]};
}

function addMainBody(P: TankBuilderPort): void {
  // The preserved native moving shoes stand above the static source track.
  // A bounded internal bay at x±1.065..1.650 clears their measured 1.254 m
  // ceiling; exterior roof, shoulder, side walls and central keel stay on
  // source planes. This is a native clearance adaptation, not source stock.
  // The long glacis is one 13.3° plane until the final 25.7° nose fold.
  // Breakpoints also retain the shallow, closed driver-roof receiving well.
  const rows: SolidSection[]=[
    mainSection(-2.040,1.917,.330,1.782,1.123),
    mainSection(-.375,1.918,.349,1.782,1.136),
    mainSection(-.373,1.918,.349,1.782,1.136,true),
    mainSection(.691,1.919,.360,1.782,1.154,true),
    mainSection(.693,1.919,.360,1.782,1.154),
    mainSection(1.135,1.9193,.3655,1.782,1.154),
    mainSection(2.780,1.5314,.384,1.782,1.180),
    mainSection(2.998,1.480,.529,1.682,1.188),
    mainSection(3.154,1.444,.653,1.682,1.195),
    mainSection(3.350,1.350,.938,1.682,1.204,false,1.218),
    mainSection(3.538,1.2594,1.212,1.682,1.213,false,1.218),
  ];
  put(P,'hull',sectionSolid(rows));
}

function wingSection(z: number, floor: number, side: number, bay: number): SolidSection {
  const roof=1.91118+(z+3.66)*.003414;
  const ring: [number,number][]=[
    [.4074,floor],[.949,floor+.006],[.949,1.1218],[1.035,1.1218],
    [1.065,bay],[1.650,bay],[1.686,1.1218],
    [1.782,1.442],[1.782,roof-.071],[1.461,roof],[.4074,roof],
  ];
  return {z,ring:side>0?ring:ring.map(([x,y])=>[-x,y] as [number,number]).reverse()};
}

function addRearAccess(P: TankBuilderPort): void {
  for(const side of[-1,1])put(P,'hull',sectionSolid([
    wingSection(-3.660,1.116,side,1.128),wingSection(-3.275,1.116,side,1.128),
    wingSection(-2.700,.769,side,1.280),wingSection(-2.038,.369,side,1.280),
  ]));
  // Closed access door at the front of the source's 1.46 m deep rear lane.
  // Its body, not a black plane at the outer stern, terminates the recess.
  put(P,'hull',KIT.box(.807,1.325,.157),0,1.2466,-2.1095,.0218);
  for(const x of[-.249,.249]){
    put(P,'hullDetail',KIT.box(.140,.150,.132),x,.511,-2.127);
    put(P,'hullDark',KIT.cylX(.033,.105,12),x,.475,-2.169);
  }
}

function addRearLights(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    put(P,'hullDetail',KIT.box(.180,.342,.047),side*1.545,1.638,-3.682);
    put(P,'hullDark',KIT.box(.126,.175,.012),side*1.545,1.638,-3.711);
    put(P,'hullDetail',KIT.box(.339,.201,.166),side*1.265,1.751,-3.740);
    for(const x of[.525,.975]){
      put(P,'hullDetail',KIT.box(.085,.165,.101),side*x,1.778,-3.709);
      put(P,'hullDetail',KIT.box(.104,.017,.118),side*x,1.866,-3.709);
    }
  }
}

function towingHook(): ReturnType<typeof sectionSolid> {
  // Sparse Y/Z chords of the source's upright forged U, not a horizontal
  // ring. Its throat remains open above the bent lower stock.
  const chords=[
    [3.410,.919,.945],[3.430,.869,.964],[3.460,.790,.957],
    [3.510,.7616,.8960],[3.540,.7638,.8672],[3.5685,.7695,.8691],
    [3.590,.7892,.8885],[3.620,.8294,.9345],[3.650,.89785,.92574],
    [3.659,.922,.923],
  ];
  return sectionSolid(chords.map(([z,low,high])=>({z,ring:[
    [-.0401,low], [.0401,low], [.0401,high], [-.0401,high],
  ]})));
}

function addBowTowStock(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    const x=side*.5834;
    put(P,'hullDetail',KIT.box(.081,.115,.155),x,.859,3.352,-.61);
    put(P,'hullDetail',towingHook(),x);
    for(const [y,z]of[[.571,3.125],[.860,3.354]])
      put(P,'hullDetail',KIT.cylX(.054,.087,16),x,y,z);
    put(P,'hullDetail',KIT.box(.036,.265,.042),x,.729,3.239,-.70);
  }
}

function addDriverEquipment(P: TankBuilderPort): void {
  put(P,'hullDetail',KIT.box(.786,.075,.747),-.426,1.863,.025);
  put(P,'hullDetail',KIT.box(.588,.114,.417),.5265,1.872,.282,-.0952);
  put(P,'hullDetail',KIT.box(.520,.108,.399),.532,1.997,.256,-.200);
  put(P,'hullDetail',KIT.box(.348,.036,.292),.518,2.057,.229,-.093);
  put(P,'hullDark',KIT.box(.435,.064,.017),.532,2.003,.460,-.095);
  put(P,'hullDetail',KIT.box(.225,.142,.196),-.0407,2.0105,.7403);
  put(P,'hullDark',KIT.box(.165,.078,.016),-.0407,2.020,.846);
  for(const side of[-1,1]){
    put(P,'hullDetail',KIT.box(.214,.021,.194),side*.77,1.536,2.721,.232);
    put(P,'hullDetail',KIT.cylX(.027,.176,16),side*.77,1.553,2.72);
  }
}

export function addNamerSourceHull(P: TankBuilderPort): void {
  addMainBody(P);
  addRearAccess(P);
  addRearLights(P);
  addBowTowStock(P);
  addDriverEquipment(P);
}
