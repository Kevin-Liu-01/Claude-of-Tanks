// Independently authored Type10 X. Supplied GLB is a local scalar oracle only.
// X follows the supplied uniformly anchored visual source; the conflicting
// official9.42×3.24m dimensions remain documented. No source buffers ship.
import * as THREE from 'three';
import { antennaPart } from './antennaPart.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {KIT} from './kit.ts';
import {fieldChestParts,reserveDecorVolume} from './fieldChest.ts';
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import {sourceMachineGun} from './sourceMachineGun.ts';
import {libraryStationGun} from './libraryRoofMg.ts';
import {addType10CoaxSurround} from './type10XCoax.ts';
import {addType10BowLinks} from './type10XBow.ts';
import {addType10Skirts} from './type10XSkirts.ts';
import {buildType10XGear} from './type10XGear.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {addType10XRoofPanels} from './type10XRoofPanels.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylX,cylZ}=KIT;
const cylinder=(r:number,h:number,n=32)=>KIT.cylY(r,r,h,n);
const PIVOT=[-.00276,1.50832,.20655] as const;
const GUN=[0,1.851,2.0529] as const;
const EQUIPMENT_X_DATUM=1.0460794000221123;
export const TYPE10_X_DATUMS=Object.freeze({
  dims:{hullLengthM:7.22996,overallLengthM:9.42,widthM:3.38929737,heightM:2.2148683143},
  roofHeightM:2.2148683143,highestFittingM:4.12156,
  turretPivot:PIVOT,trunnion:GUN,muzzleZ:5.628774,
  wheelStations:[-1.94594,-.88563,.17466,1.23495,2.29524] as const,
  wheelRadiusM:.33617,wheelY:.405,
});

function turret(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,
  x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  // Local equipment positions use the measured source transverse datum.
  // Geometry dimensions are authored separately; no completed group scales.
  P.addEquipment(slot,g,x*EQUIPMENT_X_DATUM-PIVOT[0],y-PIVOT[1],z-PIVOT[2],rx,ry,rz);
}

function gun(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,
  x:number,y:number,z:number):void {
  P.add(slot,g,x-GUN[0],y-GUN[1],z-GUN[2]);
}

function tubSection(z:number,top:number,bottom:number):SolidSection {
  const bevel=Math.min(.028,(top-bottom)*.45);
  return{z,ring:[[-.875,bottom],[.875,bottom],[.882,top-bevel],
    [.862,top],[-.862,top],[-.882,top-bevel]]};
}

function hull(P:TankBuilderPort,bowLinks:boolean):void {
  P.add('hull',sectionSolid([
    tubSection(-3.615,1.515,1.45),tubSection(-3.552,1.516,.908),
    tubSection(-3.15,1.520,.625),
    tubSection(-2.0,1.532,.393),tubSection(-1.91,1.532,.394),
    tubSection(-1.47,1.463,.400),tubSection(1.52,1.493,.430),
    tubSection(1.75,1.376,.432),tubSection(2.50,1.370,.440),
    // Actual source lower bow has two planes, not a straight floor-to-tip
    // diagonal. Upper roofs remain on the previous exact interpolation.
    ...TYPE10_X_BOW_SECTIONS.map(([z,top,bottom])=>tubSection(z,top,bottom)),
  ]));
  for(const side of [-1,1]) {
    const rows=[[-3.615,1.515,1.50],[-1.96,1.532,1.512],[-1.47,1.463,1.443],
      [1.45,1.492,1.472],[1.88,1.378,1.360],[3.35,1.31,1.291],
      [3.53,1.208,1.180],[3.615,1.168,1.141]];
    P.add('hull',sectionSolid(rows.map(([z,roof,floor])=>{
      const ring:[number,number][]=[[.867,floor],[1.57958,floor],[1.57958,roof],[.867,roof]];
      return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    })));
    P.add('hull',sectionSolid(rows.map(([z,roof])=>{
      const floor=Math.min(1.216,roof-.020);
      const ring:[number,number][]=[[1.54402,floor],[1.551345,floor],[1.551345,roof],[1.54402,roof]];
      return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    })));
    sideArmor(P,side);mudguards(P,side);
  }
  P.add('hull',cylinder(1.31519,.041,64),-.00276,1.485,.20655);
  deckEquipment(P);frontEquipment(P,bowLinks);
}

// The tub's bow stations [z, roof, floor]: the floor rises over the lower bow's two planes to the nose and the roof
// falls over the beak. The dozer kit seats on them (type10Dozer.ts).
export const TYPE10_X_BOW_SECTIONS=Object.freeze([
  [2.8980457874,1.3389330117,.4439975738],[3.3136651848,1.3064944246,.7213660983],
  [3.32,1.306,.7303013235],[3.615,1.166,1.1463973487],
] as const);

function sideArmor(P:TankBuilderPort,side:number):void {
  addType10Skirts(P,side);
  P.addEquipment('hullPaintedDetail',markFixedPaintedPanel(box(.030964,.4627,6.0704),
    'type10-painted-upper-fascia','hullDetail'),side*1.559035,.99065,.5545);
  P.addEquipment('hullPaintedDetail',markFixedPaintedPanel(box(.030964,.4065,.9621),
    'type10-painted-rear-fascia','hullDetail'),side*1.559035,.96097,-2.95899);
}

function mudguards(P:TankBuilderPort,side:number):void {
  const front=new THREE.Shape([[3.598,1.170],[3.665,1.111],[3.779,.891],
    [3.814,.833],[3.814,.812],[3.779,.871],[3.665,1.093],[3.598,1.15]]
    .map(([z,y])=>new THREE.Vector2(-side*z,y)));
  const fg=new THREE.ExtrudeGeometry(front,{depth:.651709,steps:1,bevelEnabled:false});
  fg.rotateY(side*Math.PI/2);
  P.addMudguard('type10-x-forward-fold','hull',fg,side*.92055,0,0);
  const rear=new THREE.Shape([[-3.1989,1.1690],[-3.3216,.7600],[-3.3406,.6793],
    [-3.3551,.5088],[-3.3598,.3951],[-3.3523,.380],[-3.3476,.505],
    [-3.3330,.677],[-3.3070,.757],[-3.1850,1.1690]]
    .map(([z,y])=>new THREE.Vector2(-side*z,y)));
  const rg=new THREE.ExtrudeGeometry(rear,{depth:.60568,steps:1,bevelEnabled:false});
  rg.rotateY(side*Math.PI/2);
  P.hangMudguard('type10-x-rear-flexible-flap','hullRubber',rg,side*.91845,0,0);
}

function deckEquipment(P:TankBuilderPort):void {
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.601,.032,1.73),side*.64,1.546,-2.77);
    for(let i=0;i<13;i++)
      P.addEquipment('hullDark',box(.465,.005,.018),side*.64,1.565,-3.45+i*.113);
    // 2026-10-19 (owner float sweep): the deck plate stood 15 mm over the raked sponson roof; it sits on it now
    P.addEquipment('hullDetail',box(.293,.020,.335),side*1.26,1.531,-2.70);
    for(const z of [-3.40,-2.70,-2.0])
      P.addEquipment('hullDetail',cylX(.015,.113,12),side*.96,1.565,z);
  }
  rearTransom(P);
}

function rearTransom(P:TankBuilderPort):void {
  // Source42 is an open transverse tray: upper/lower sheets and side returns,
  // not a closed bounding-box exhaust block. Its rear centre air stays open.
  for(const [rear,front]of[[1.427,1.466],[.923,.956]]) {
    P.addEquipment('hullDetail',sectionSolid([
      {z:-3.79125,ring:[[-.848,rear-.009],[.818,rear-.009],[.818,rear],[-.848,rear]]},
      {z:-3.70,ring:[[-.848,rear-.008],[.818,rear-.008],[.818,rear+.001],[-.848,rear+.001]]},
      {z:-3.568,ring:[[-.848,front-.009],[.818,front-.009],[.818,front],[-.848,front]]},
    ]));
  }
  for(const x of [-.843,.813])P.addEquipment('hullDetail',box(.010,.527,.210),x,1.1885,-3.680);
  for(const x of [-.330,.218])P.addEquipment('hullDetail',box(.014,.513,.029),x,1.1795,-3.730);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.590,.386,.055),side*1.175,1.223,-3.580);
    P.addEquipment('hullDetail',box(.237,.320,.156),side*1.025,1.190,-3.650);
    for(let i=0;i<14;i++)
      P.addEquipment('hullDark',box(.228,.007,.012),side*1.025,1.053+i*.0167,-3.733);
  }
}

function frontEquipment(P:TankBuilderPort,bowLinks:boolean):void {
  // the production tanks' spare links across the lower bow; the TK-X prototypes' lower plate was plain (photographs, 267)
  if(bowLinks)addType10BowLinks(P);
  // Driver sits right of the bore; the broad central glacis stays unblocked.
  P.addHatch('hull',box(.646,.057,.456),.335,1.402,2.18,.020);
  for(const x of [.08,.24,.40,.56])P.addEquipment('hullGlass',box(.105,.038,.018),x,1.458,2.09);
  for(const side of [-1,1]) {
    for(const [x,r]of[[1.16,.054],[1.277,.061]]) {
      P.addEquipment('hullDetail',cylZ(r+.010,.073,20),side*x,1.281,3.459);
      P.addEquipment('hullGlass',markVehicleNightLens(cylZ(r,.004,20),'headlight'),side*x,1.281,3.497);
    }
    P.addEquipment('hullDetail',box(.330,.153,.017),side*1.19,1.279,3.552);
    const eye=new THREE.TorusGeometry(.041,.010,8,18);
    // 2026-10-19 (owner float sweep): the tow eye and its lug hung 25 mm under the lower bow; seated on it
    P.snapGroup('type10-bow-tow-eye',()=>{
      P.addEquipment('hullDetail',eye,side*.466,.790,3.536);
      P.addEquipment('hullDetail',box(.064,.063,.139),side*.466,.759,3.455);
    },{reachM:.04});
    // the round headlight in its box on the bow's corner, behind its wire guard (267, the photo critic: "mesh-guarded
    // headlight boxes on the glacis corners"; type10_production_front.jpg), on the bow roof where the source's block stood
    P.addEquipment('hullDetail',box(.17,.12,.12),side*.74,1.281,3.50);
    P.addEquipment('hullDark',cylZ(.05,.004,18),side*.74,1.281,3.5615);
    P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.044,.004,18),'headlight'),side*.74,1.281,3.5645);
    for(const dy of [-.035,0,.035])P.addEquipment('hullDark',box(.15,.006,.006),side*.74,1.281+dy,3.574);
    for(const dx of [-.05,0,.05])P.addEquipment('hullDark',box(.006,.10,.006),side*.74+dx,1.281,3.580);
  }
}

const SOURCE_YZ_SCALE=1.1366241623942464;
const SOURCE_Y_OFFSET=1.24758034095187;
const SOURCE_Z_OFFSET=.25532557439914;
const AUTHORED_X_SCALE=1.1366241623942464;

function armorRoof(rawZ:number):number {
  return Math.min(.84498869+.0100435*rawZ,.91644796-.10898541*rawZ,
    1.48583350-.47606013*rawZ)*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET;
}

function shelfRoof(x:number,z:number):number {
  // The low outboard shelf has a separate crossfall and longitudinal rake;
  // it is not the lower edge of a single generic bevel from the main roof.
  const rawX=Math.abs(x/AUTHORED_X_SCALE),rawZ=(z-SOURCE_Z_OFFSET)/SOURCE_YZ_SCALE;
  const rawY=rawZ<=.60?.8492378-.04836747*rawX-.15408421*rawZ:
    .8449752-.04832130*rawX-.14713491*rawZ;
  return (rawY+(x<0?.0002052:0))*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET;
}

function outerRoof(x:number,z:number):number {
  const rawX=Math.abs(x/AUTHORED_X_SCALE),rawZ=(z-SOURCE_Z_OFFSET)/SOURCE_YZ_SCALE;
  if(rawZ>=1.55) {
    const folded=Math.max(3.84784839-1.04736424*rawX-1.41120741*rawZ,
      2.96781084-.76172360*rawX-1.03706310*rawZ);
    return (folded+(x<0?.00444:0))*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET;
  }
  const rear=1.9196598-.9831060*rawX+.0100435*rawZ;
  const middle=1.8263785-.95318657*rawX-.05211275*rawZ;
  const front=1.9271657-.85797679*rawX-.28120764*rawZ;
  const middleFold=Math.min(2.0250577-1.09709776*rawX-.01177306*rawZ,
    2.0126500-1.10301254*rawX-.07596176*rawZ);
  const rawY=Math.min(rear,front,Math.max(middle,middleFold));
  return (rawY+(x<0?.00415:0))*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET;
}

function roofHalf(rawZ:number):number {
  // Independent planar-footprint measurements: the raised roof narrows above
  // a lower shelf. These are crease datums, not source contour vertices.
  if(rawZ<=-.75)return 1.094*AUTHORED_X_SCALE;
  if(rawZ<=-.25)return (1.094-(rawZ+.75)*.030)*AUTHORED_X_SCALE;
  if(rawZ<=.60)return (1.047-.128*rawZ)*AUTHORED_X_SCALE;
  if(rawZ<=1.55)return (.967-.105*(rawZ-.60))*AUTHORED_X_SCALE;
  return (.873-.890*(rawZ-1.55))*AUTHORED_X_SCALE;
}

function shelfKnee(side:number,z:number,edge:number,half:number):number {
  let inner=edge+.0001,outer=half-.0001;
  for(let i=0;i<24;i++) {
    const x=(inner+outer)/2;
    if(outerRoof(side*x,z)>shelfRoof(side*x,z))inner=x;
    else outer=x;
  }
  return Math.max(edge+.001,Math.min(half-.001,(inner+outer)/2));
}

function cheekRoof(side:number,z:number,half:number,low:number):[number,number][] {
  const rawZ=(z-SOURCE_Z_OFFSET)/SOURCE_YZ_SCALE;
  const roof=armorRoof(rawZ),edge=Math.min(half-.005,roofHalf(rawZ));
  const outer=Math.max(low+.020,Math.min(roof-.001,outerRoof(side*half,z)));
  const step=rawZ>=1.55?roof-.0002:
    Math.max(low+.021,Math.min(roof-.0002,shelfRoof(side*edge,z)));
  const foldX=(.88003754-.37414431*rawZ)/.28564064*AUTHORED_X_SCALE;
  const knee=rawZ>=1.55?Math.max(edge+.001,Math.min(half-.001,foldX)):
    shelfKnee(side,z,edge,half);
  const kneeY=rawZ<-.25?roof+(outer-roof)*(knee-edge)/(half-edge):rawZ>=1.55?
    Math.min(roof,outerRoof(side*knee,z)):
    Math.max(low+.0205,Math.min(shelfRoof(side*knee,z),outerRoof(side*knee,z)));
  return [[side*half,outer],[side*knee,kneeY],[side*edge,step],[side*edge,roof]];
}

function turretSection(z:number,half:number,low:number):SolidSection {
  half*=EQUIPMENT_X_DATUM;
  const top=[...cheekRoof(1,z,half,low),...cheekRoof(-1,z,half,low).reverse()];
  return{z:z-PIVOT[2],ring:[[-half*.91,low],[half*.91,low],
    [half,low+.010],...top,[-half,low+.010]]
    .map(([x,y])=>[x-PIVOT[0],y-PIVOT[1]] as [number,number])};
}

function turretArmor(P:TankBuilderPort):void {
  P.add('turret',sectionSolid([
    turretSection(-2.017,1.26,1.623),turretSection(-1.88,1.408,1.623),
    turretSection(-1.05,1.408,1.515),turretSection(-.60,1.408,1.520),
    turretSection(-.029,1.408,1.527),turretSection(.2553256,1.408,1.529),
    turretSection(.9373001,1.408,1.535),turretSection(1.3919497,1.401,1.537),
    turretSection(1.6192746,1.354,1.552),turretSection(1.82,1.286,1.560),
  ]));
  turret(P,'turret',cylinder(1.31519,.111438,64),PIVOT[0]/EQUIPMENT_X_DATUM,1.508317,PIVOT[2]);
  for(const side of [-1,1]) {
    // Deliberate central cutout: separate closed cheek noses flank the boot.
    const sections=[[1.815,1.286,1.560],[1.96026,1.240,1.561],
      [2.0740,1.120,1.572],[2.18759,.982,1.575],
      [2.30125,.839,1.657],[2.41491,.679,1.755],[2.4915,.570,1.801]]
      .map(([z,out,low])=>{
        out*=EQUIPMENT_X_DATUM;
        const inner=side>0?.4315*AUTHORED_X_SCALE:.17888;
        const ring:[number,number][]=[[side*inner,low],[side*out,low+.010],
          ...cheekRoof(side,z,out,low),[side*inner,armorRoof((z-SOURCE_Z_OFFSET)/SOURCE_YZ_SCALE)]];
        return{z,ring:side<0?ring.reverse():ring};
      });
    P.add('turret',sectionSolid(sections),-PIVOT[0],-PIVOT[1],-PIVOT[2]);
    // 2026-10-19 (owner float sweep): the forward edge strips stood 5-34 mm off the falling cheek; each seats on it.
    // 2026-10-21 (float-gaps 230): straight down at its authored x: along the shortest vector the front strip slid 26 mm
    // inboard onto the 45-degree cheek bevel, over the source raised-roof facet at x 1.2 (type10X.selftest).
    for(let i=0;i<5;i++)P.snapGroup('type10-side-strip',()=>turret(P,'turretDetail',box(.027,.009,.19),side*1.34,2.030,-1.22+i*.50),{reachM:.05,mode:'down'});
  }
  addType10CoaxSurround(P,PIVOT);
}

function frameBar(P:TankBuilderPort,a:number[],b:number[],r=.012):void {
  const start=new THREE.Vector3(a[0]*EQUIPMENT_X_DATUM,a[1],a[2]);
  const end=new THREE.Vector3(b[0]*EQUIPMENT_X_DATUM,b[1],b[2]),delta=end.clone().sub(start);
  const g=cylinder(r,delta.length(),10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  const c=start.add(end).multiplyScalar(.5);turret(P,'turretOpenLattice',g,c.x/EQUIPMENT_X_DATUM,c.y,c.z);
}

function rearRack(P:TankBuilderPort,mark:Type10Mark,stowage:boolean):void {
  // 2026-10-19 (owner float sweep): the basket stood 48 mm behind the bustle; its front bars now end 5 mm into it
  const left=-1.268,right=1.12,rear=-3.227,front=-2.012;
  for(const y of [1.622,1.731,2.125]) {
    frameBar(P,[left,y,front],[left,y,rear]);
    frameBar(P,[right,y,front],[right,y,rear]);
    frameBar(P,[left,y,rear],[right,y,rear]);
  }
  for(const x of [left,-1.011,-.78,-.55,-.319,-.089,.090,.321,.551,.782,1.012,right])
    frameBar(P,[x,1.622,rear],[x,2.125,rear]);
  for(const z of [-2.216,-2.403,-2.590,-2.777,-2.965]) {
    frameBar(P,[left,1.622,z],[right,1.622,z]);
    frameBar(P,[left,2.125,z],[right,2.125,z]);
    for(const x of [left,right])frameBar(P,[x,1.622,z],[x,2.125,z]);
  }
  // production baskets carry expanded-mesh panels in the tube frame; the TK-X ran the open fence (photographs, 267)
  if(mark==='production')basketMesh(P,left,right,rear,front);
  else prototypeFence(P,left,right,rear,front);
  if(stowage)rearBasketStowage(P);
}

// Owner markup 2026-10-14 ("actual tank equipment ... in lieu of random thingies"): the basket held two canvas blocks
// and two upright canvas drums. The JGSDF calls the Type 10's external turret stowage its "basket": crew equipment in
// closed steel chests (a 20 L can stands 0.49 m, taller than the basket's 0.48 m clear height). Rear row: three chests
// across the basket; front row: three lower chests against the bustle. Every chest stands on the floor slats (y 1.622) inside the frame (x -1.268..1.12,
// z -3.227..-2.065, top bar 2.125), clear of the bars by at least 3 cm.
function rearBasketStowage(P:TankBuilderPort):void {
  const floor=1.632;                                                        // on the 1.634 floor-slat tops (6 mm over them before, owner 2026-10-19 sweep)
  const chest=(w:number,h:number,d:number,x:number,z:number,front:1|-1,handles=true)=>{
    const {paint,dark}=fieldChestParts(w,h,d,{high:!!P.q,front,handles});
    for(const g of paint)turret(P,'turret',g,x/EQUIPMENT_X_DATUM,floor,z);
    for(const g of dark)turret(P,'turretDark',g,x/EQUIPMENT_X_DATUM,floor,z);
  };
  // rear row, latches facing out of the basket's rear mesh; the chests stand side by side and the front row against
  // the rear row, so no narrow crevice runs down between them (a 5-14 cm slot between chests under the bustle read as
  // an opening into the hull to the watertight check: tools/track-lane-boxes.selftest)
  // (no end handles: each chest's end stands against its neighbour's)
  chest(.86,.36,.46,-.76,-2.935,-1,false);
  chest(.52,.36,.46,-.07,-2.935,-1,false);
  chest(.74,.36,.46,.56,-2.935,-1,false);
  // front row, latches facing aft over the rear row's lids
  chest(.62,.30,.40,-.86,-2.505,-1,false);
  chest(.50,.26,.40,-.30,-2.505,-1,false);
  chest(.70,.30,.40,.30,-2.505,-1,false);
  // critic panel 2026-10-15: the basket stays the chests' (the canvas loads stood here before), so the decor's loads
  // keep the seats they had (fieldChest.ts reserveDecorVolume)
  reserveDecorVolume(P.turretG,[-1.25-PIVOT[0],floor-PIVOT[1],-3.2-PIVOT[2]],[1.25-PIVOT[0],floor+.55-PIVOT[1],-2.18-PIVOT[2]]);
}

function sightCavity(P:TankBuilderPort,x:number,y:number,z:number,w:number,h:number,d:number,glassZ:number):void {
  turret(P,'turretDetail',box(w,.022,d),x,y,z);
  for(const side of [-1,1])turret(P,'turretDetail',box(.024,h,d),x+side*(w-.024)/(2*EQUIPMENT_X_DATUM),y+h/2,z);
  turret(P,'turretDetail',box(w,.020,d),x,y+h,z);
  turret(P,'turretDetail',box(w,h,.036),x,y+h/2,glassZ-.024);
  // the housing's back wall (267: seen from behind, the open end read as a hollow box)
  turret(P,'turretDetail',box(w,h,.02),x,y+h/2,z-d/2+.01);
  turret(P,'turretGlass',box(w-.070,h-.051,.006),x,y+h/2,glassZ-.003);
  // the hood's mouth lined dark from the window out (round 3: the open hood read as a hollow box; the source keeps its
  // window recessed): 1 mm inside the walls
  const depth=z+d/2-glassZ,mouth=glassZ+depth/2;
  turret(P,'turretDark',box(w-.05,.003,depth),x,y+.0125,mouth);
  turret(P,'turretDark',box(w-.05,.003,depth),x,y+h-.012,mouth);
  for(const side of [-1,1])turret(P,'turretDark',box(.003,h-.046,depth),x+side*(w-.054)/(2*EQUIPMENT_X_DATUM),y+h/2,mouth);
}

function roofEquipment(P:TankBuilderPort,remoteM2:boolean):void {
  turret(P,'turretHatch',cylinder(.32747,.127,40),-.511,2.317,.271);
  // 2026-10-19 (owner float sweep): the cupola stood 42-49 mm over the roof; a collar ring carries it from the roof
  turret(P,'turretDetail',cylinder(.33,.058,40),-.511,2.2295,.271);
  turret(P,'turretDetail',cylinder(.436787,.038,48),-.511,2.397,.270);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    turret(P,'turretGlass',box(.092,.057,.036),-.511+Math.sin(a)*.335,2.340,.270+Math.cos(a)*.350437,0,a);
  }
  turret(P,'turretHatch',box(.523039,.060,.282),.658,2.235,-.115);
  sightCavity(P,.632,2.215,1.165,.501072,.230,.610,1.3104);
  sightCavity(P,-.976,2.515,-.501,.281395,.201,.287,-.41652);
  const pedestal=sectionSolid([[-.927,2.187,2.191,.207],[-.627,2.187,2.493,.162],
    [-.298,2.193,2.496,.113]].map(([z,low,high,half])=>({z,ring:[
      [(-.976-half)*EQUIPMENT_X_DATUM,low],[(-.976+half)*EQUIPMENT_X_DATUM,low],
      [(-.976+half*.87)*EQUIPMENT_X_DATUM,high],[(-.976-half*.87)*EQUIPMENT_X_DATUM,high],
    ] as [number,number][]})));
  turret(P,'turretDetail',pedestal,0,0,0);
  turret(P,'turretDetail',box(.240,.025,.235),-.976,2.505,-.501);
  addType10XRoofPanels(P,PIVOT);
  if(remoteM2)roofWeapon(P);
  antennas(P);
}

function roofWeapon(P:TankBuilderPort):void {
  const weapon=sourceMachineGun(P,PIVOT,{name:'type10RemoteM2',caliberMm:12.7,
    yaw:[-.227075,2.69277,.64549],pivot:[-.224478,2.825,.64549],muzzle:[-.224478,2.887,1.8175]});
  weapon.stage('yaw');
  weapon.add('turretDetail',cylinder(.209,.045,32),-.3086,2.405,.496);
  for(const [x0,z0,x1,z1,w]of[[-.175,.424,-.213,.611,.050],[-.35,.636,-.257,.636,.030]]) {
    const a=new THREE.Vector3(x0,2.424,z0),b=new THREE.Vector3(x1,2.644,z1),d=b.clone().sub(a);
    const g=box(w,d.length(),.030);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
    const c=a.add(b).multiplyScalar(.5);weapon.add('turretDetail',g,c.x,c.y,c.z);
  }
  weapon.add('turretDetail',cylinder(.0359,.089,20),-.227075,2.6385,.64549);
  weapon.add('turretDetail',cylinder(.020362,.028,16),-.227075,2.69277,.64549);
  weapon.add('turretDetail',box(.079216,.140,.106583),-.227075,2.7575,.64549);
  weapon.stage('pitch');
  // Owner 2026-10-28 ("... show actual machine guns that need to be actual machine guns of current dimensions"): the
  // remote M2 is the fleet's M2 construction (libraryRoofMg.ts libraryStationGun) on the station's bore and published
  // muzzle, in place of the traced receiver block, rods, grips and sights; the ammunition box stays on its right.
  libraryStationGun(weapon,{cls:'m2',x:-.224478,boreY:2.887,pivotZ:.64549,muzzleZ:1.8175});
  weapon.add('turretDetail',box(.167,.154,.080),-.3965,2.864,.735);
  weapon.stage('yaw');
  weaponCradle(weapon);
  weapon.add('turretDetail',box(.196514,.075,.075),-.380257,2.7495,.7415);
  weapon.finish();
}

function weaponCradle(weapon:ReturnType<typeof sourceMachineGun>):void {
  // Object_5:112 is a stepped open sheet cradle. Separate side/end returns
  // preserve its measured centre air instead of filling the whole ramp.
  const ramp=sectionSolid([[.704,2.7114,2.72046],[.774,2.71213,2.72117],
    [.80,2.69743,2.70940],[.90,2.64455,2.66656],[.920,2.630,2.64325]]
    .map(([z,low,top])=>({z,ring:[[-.277,low],[-.177,low],[-.177,top],[-.277,top]] as [number,number][]})));
  weapon.add('turretDetail',ramp,0,0,0);
  for(const x of [-.273,-.181])weapon.add('turretDetail',sectionSolid([
    [.774,2.719,2.787],[.90,2.664,2.7296],
  ].map(([z,low,top])=>({z,ring:[[x-.004,low],[x+.004,low],[x+.004,top],[x-.004,top]] as [number,number][]}))),0,0,0);
  weapon.add('turretDetail',sectionSolid([.9125,1.116].map(z=>{
    const top=2.51166356+(z-1)*.0100433;
    return{z,ring:[[-.317553,top-.010723],[-.136597,top-.010723],[-.136597,top],[-.317553,top]]};
  })),0,0,0);
  for(const side of [-1,1]) {
    const center=-.227075;
    weapon.add('turretDetail',sectionSolid([.898,1.128].map(z=>{
      const rake=(z-1)*.0100433;
      const ring:[number,number][]=[[.081447,2.50094],[.090478,2.50094],
        [.090478,2.64486],[.102644,2.663],[.102644,2.730603],
        [.092396,2.730603],[.092396,2.664],[.081447,2.643]];
      const measured=ring.map(([x,y])=>[center+side*x,y+rake] as [number,number]);
      return{z,ring:side<0?measured.reverse():measured};
    })),0,0,0);
  }
  for(const rear of [.91172084,1.10603206]) {
    const face=new THREE.Shape([[rear+.001,2.501],[rear+.010033,2.501],
      [rear+.00857,2.646],[rear-.00046,2.646]].map(([z,y])=>new THREE.Vector2(-z,y)));
    const wall=new THREE.ExtrudeGeometry(face,{depth:.180956,steps:1,bevelEnabled:false});
    wall.rotateY(Math.PI/2);weapon.add('turretDetail',wall,-.317553,0,0);
  }
}

function antenna(P:TankBuilderPort,base:number[],top:number[]):void {
  const a=new THREE.Vector3(...base),b=new THREE.Vector3(...top),axis=b.clone().sub(a);
  const g=KIT.cylY(.0025,.015,axis.length(),8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize()));
  const c=a.add(b).multiplyScalar(.5);turret(P,'turretDark',antennaPart(g),c.x,c.y,c.z);
}

function antennas(P:TankBuilderPort):void {
  for(const x of [-1.315,1.315]) {
    const crown=x<0?2.373987:2.373856;
    // 2026-10-19 (owner float sweep): the bases stood 26 mm off the falling cheek edge; they reach down into it
    turret(P,'turretDetail',cylinder(.052,crown-2.105,20),x,(crown+2.105)/2,-1.915);
  }
  steppedWhip(P,-1);steppedWhip(P,1);
  rearAntennaMount(P);
  turret(P,'turretDetail',antennaPart(cylinder(.034,.511,16)),.022,2.5825,-2.06);
  antenna(P,[.022,2.815,-2.06],[.022,3.643,-2.06]);
}

function steppedWhip(P:TankBuilderPort,side:number):void {
  const ranges=side<0?[[2.3676,2.5141,.0292,.0292],[2.5114,2.6917,.024287,.02117],
    [2.6890,3.3274,.019178,.01790],[3.3257,3.6963,.015,.01116],[3.6952,4.121557,.009366,.00782]]:
    [[2.3553,2.5087,.0292,.0292],[2.4961,2.6801,.024287,.02117],
      [2.66994,3.2981,.019178,.01790],[3.2903,3.6558,.015,.01116],[3.6509,4.069011,.009366,.00782]];
  const slope=side<0?.0513075:-.242314,at245=side<0?-1.874916:-1.974761;
  for(const [i,[low,high,r0,r1]]of ranges.entries()) {
    // Source high is the outer crown, not the tilted centreline endpoint.
    const endY=high-(i===ranges.length-1?r1*Math.abs(slope)/Math.hypot(1,slope):0);
    const a=new THREE.Vector3(side*1.37605,low,at245+slope*(low-2.45));
    const b=new THREE.Vector3(side*1.37605,endY,at245+slope*(endY-2.45)),d=b.clone().sub(a);
    const g=KIT.cylY(r1,r0,d.length(),12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
    const c=a.add(b).multiplyScalar(.5);turret(P,'turretDark',antennaPart(g),c.x/EQUIPMENT_X_DATUM,c.y,c.z);
  }
}

function rearAntennaMount(P:TankBuilderPort):void {
  // Two measured closed mounting stages below source Object_6:68. The lower
  // folded foot crosses the rear roof edge; the mast does not float above it.
  const foot=sectionSolid([
    [-2.083528,.733424],[-2.040,.723663],[-1.997763,.724087],
  ].map(([rawZ,low])=>({z:rawZ*SOURCE_YZ_SCALE+SOURCE_Z_OFFSET,ring:[
    [-.024609*AUTHORED_X_SCALE,low*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET],
    [.069869*AUTHORED_X_SCALE,low*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET],
    [.069869*AUTHORED_X_SCALE,(.892227+rawZ*.0100435)*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET],
    [-.024609*AUTHORED_X_SCALE,(.892227+rawZ*.0100435)*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET],
  ] as [number,number][]})));
  turret(P,'turretDetail',foot,0,0,0);
  const cap=sectionSolid([-2.078189,-1.989637].map(rawZ=>({
    z:rawZ*SOURCE_YZ_SCALE+SOURCE_Z_OFFSET,ring:[
      [-.017696,(.89210+rawZ*.0100435)],[.062956,(.89210+rawZ*.0100435)],
      [.062956,(.974633+rawZ*.0100446)],[-.017696,(.974633+rawZ*.0100446)],
    ].map(([x,y])=>[x*AUTHORED_X_SCALE,y*SOURCE_YZ_SCALE+SOURCE_Y_OFFSET] as [number,number]),
  })));
  turret(P,'turretDetail',cap,0,0,0);
}

/** Place a turret part at a hull-frame point (no transverse datum: the turret wall's measured x). */
function onTurret(P:TankBuilderPort,slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0):void {
  P.addEquipment(slot,g,x-PIVOT[0],y-PIVOT[1],z-PIVOT[2],rx,ry,rz);
}

// The turret's bolted side modules (267; JGSDF Type 10 photographs, docs/references/photos/type10b-20261031.json): the
// vertical wall at |x| 1.4729 from y 1.565 to the chamfer at 1.875 is split by seams into the rear block, the middle
// block and the narrow block ahead of it, with the front block running on to the wedge. Each seam carries its latches
// and a lifting hook over it on the chamfer. Production blocks carry hinged stowage doors with their handles; the TK-X
// prototypes' blocks were plain.
export const TYPE10_X_SIDE_WALL=Object.freeze({x:1.4729,low:1.565,high:1.875});
const {x:WALL_X,low:WALL_LOW,high:WALL_HIGH}=TYPE10_X_SIDE_WALL;
const MODULE_SEAMS=[-1.13,-.30,.23] as const;
// the TK-X's plain blocks show five seams (tkx_no1_left_side.jpg): two more in the rear block and one in the middle
const PROTOTYPE_SEAMS=[-1.62,-1.13,-.72,-.30,.23] as const;
const STOWAGE_DOORS=[[-1.84,-1.22],[-1.06,-.72],[-.66,-.36]] as const;

function sideModules(P:TankBuilderPort,side:number,stowageDoors:boolean,mark:Type10Mark):void {
  const h=WALL_HIGH-WALL_LOW,mid=(WALL_HIGH+WALL_LOW)/2,at=(proud:number)=>side*(WALL_X+proud);
  // the bevel break: the wall's top edge under the chamfer in shadow along the blocks (round 3: "the horizontal bevel break")
  onTurret(P,'turretDark',box(.004,.012,3.20),at(.001),WALL_HIGH-.008,-.25);
  for(const z of mark==='production'?MODULE_SEAMS:PROTOTYPE_SEAMS) {
    onTurret(P,'turretDark',box(.006,h,.05),at(.001),mid,z);
    for(const dz of [-.037,.037])onTurret(P,'turretDetail',box(.024,h,.022),at(.011),mid,z+dz);   // the blocks' raised edges
    for(const y of [WALL_LOW+.055,mid,WALL_HIGH-.055]) {
      onTurret(P,'turretDetail',box(.026,.05,.07),at(.024),y,z);                                 // the latch body
      onTurret(P,'turretDark',box(.012,.016,.05),at(.0435),y+.012,z);                            // its lever
    }
    const hook=new THREE.TorusGeometry(.03,.008,6,10,Math.PI);hook.rotateY(Math.PI/2);
    onTurret(P,'turretDetail',hook,side*(WALL_X-.022),WALL_HIGH+.02,z);
  }
  if(!stowageDoors)return;
  for(const [z0,z1] of STOWAGE_DOORS) {
    const y0=WALL_LOW+.03,y1=WALL_HIGH-.035,len=z1-z0,zc=(z0+z1)/2;
    for(const y of [y0,y1])onTurret(P,'turretDetail',box(.008,.016,len),at(.004),y,zc);
    for(const z of [z0,z1])onTurret(P,'turretDetail',box(.008,y1-y0,.016),at(.004),(y0+y1)/2,z);
    for(const z of [z0+len*.2,z1-len*.2])onTurret(P,'turretDark',cylZ(.011,.05,10),at(.011),y1+.004,z);
    onTurret(P,'turretDark',box(.012,.022,.09),at(.024),(y0+y1)/2-.02,z1-.06);
    for(const dz of [-.035,.035])onTurret(P,'turretDark',box(.016,.012,.01),at(.014),(y0+y1)/2-.02,z1-.06+dz);
  }
}

// Smoke: four 76 mm dischargers a side in the front block's sloped top face (photographs, 267: the 45-degree chamfer over
// the side wall, which runs |x| 1.435 at z 0.55 to 1.408 at z 1.0 at y 1.94). Production tanks fire them through one oval
// slot; the TK-X prototypes had four separate round ports. The tubes look up and out of the face, a little forward.
function smokeDischargers(P:TankBuilderPort,side:number,mark:Type10Mark):void {
  const y=1.94,zs=[.52,.69,.86,1.03],faceX=(z:number)=>1.4353-.0607*(z-.55);   // round 3: half the block, deep bores
  const normal=new THREE.Vector3(side*.7071,.7071,0),axis=new THREE.Vector3(side*.70,.70,.12).normalize();
  if(mark==='production') {
    const mid=(zs[0]+zs[3])/2,slot=cylinder(.074,.010,20);slot.scale(1,1,(zs[3]-zs[0]+.148)/.148);slot.rotateZ(-side*Math.PI/4);
    onTurret(P,'turretDark',slot,side*faceX(mid)+normal.x*.002,y+normal.y*.002,mid);
  }
  for(const z of zs) {
    const outer=.06,inner=.05,shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
    const g=new THREE.ExtrudeGeometry(shape,{depth:.11,steps:1,bevelEnabled:false,curveSegments:14});
    g.translate(0,0,-.105);
    markSmokeTube(g).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis));
    const at=new THREE.Vector3(side*faceX(z),y,z).addScaledVector(normal,.004);
    onTurret(P,'turretDetail',g,at.x,at.y,at.z);
    // the bore reads deep and black from outside: a dark cap 3 cm down the tube
    const bore=cylinder(.049,.006,14);bore.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis));
    const deep=at.clone().addScaledVector(axis,-.06);
    onTurret(P,'turretDark',bore,deep.x,deep.y,deep.z);
    if(mark!=='production') {
      const rim=new THREE.TorusGeometry(.068,.009,6,18);
      rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal));
      onTurret(P,'turretDetail',rim,at.x,at.y,at.z);
    }
  }
}

// Laser warning receivers at the turret's four corners (photographs, 267): the front pair angled boxes with three
// stacked windows looking forward and out, the rear pair smaller heads over the bustle corners.
function laserWarners(P:TankBuilderPort):void {
  for(const side of [-1,1]) {
    const yaw=side*Math.PI/4;
    onTurret(P,'turretDetail',box(.15,.19,.13),side*1.25,2.004+.09,1.21,0,yaw,0);
    for(let i=0;i<3;i++) {
      const g=box(.09,.034,.006);
      onTurret(P,'turretGlass',g,side*1.25+Math.sin(yaw)*.067,2.004+.035+i*.052,1.21+Math.cos(yaw)*.067,0,yaw,0);
    }
    onTurret(P,'turretDetail',box(.10,.12,.10),side*1.24,2.13+.055,-1.86,0,side*Math.PI*.75,0);
    onTurret(P,'turretGlass',box(.06,.05,.006),side*1.24+side*.036,2.13+.065,-1.86-.036,0,side*Math.PI*.75,0);
  }
}

// The TK-X's open fence (TRDI photographs): close-set uprights between the frame's posts and a solid lower band round the
// rear and both sides, without the production mesh.
function prototypeFence(P:TankBuilderPort,left:number,right:number,rear:number,front:number):void {
  // round 3 (tkx_rear_left.jpg, tkx_no3_left_rear_top.jpg): the band fills the lower 45 % as slats on a backing sheet
  const y0=1.622,y1=2.125,band=.225;
  for(let x=left+.115;x<right-.05;x+=.23)frameBar(P,[x,y0+band,rear],[x,y1,rear]);
  for(let z=rear+.094;z<front-.05;z+=.187)for(const x of [left,right])frameBar(P,[x,y0+band,z],[x,y1,z]);
  turret(P,'turretDetail',box((right-left)*EQUIPMENT_X_DATUM,band,.006),(left+right)/2,y0+band/2,rear);
  for(const x of [left,right])turret(P,'turretDetail',box(.006,band,front-rear),x,y0+band/2,(rear+front)/2);
  for(let i=0;i<4;i++) {
    const y=y0+.03+i*.055;
    turret(P,'turretDetail',box((right-left)*EQUIPMENT_X_DATUM-.04,.034,.012),(left+right)/2,y,rear-.0095);
    for(const x of [left,right])turret(P,'turretDetail',box(.012,.034,front-rear-.06),x+Math.sign(x)*.0095/EQUIPMENT_X_DATUM,y,(rear+front)/2);
  }
}

// The basket's expanded-mesh panels: a grid of wire across the rear and both sides inside the tube frame.
function basketMesh(P:TankBuilderPort,left:number,right:number,rear:number,front:number):void {
  const y0=1.622,y1=2.125,pitch=.115,wire=(a:number[],b:number[])=>frameBar(P,a,b,.0045);
  for(let x=left+pitch;x<right-.02;x+=pitch)wire([x,y0,rear],[x,y1,rear]);
  for(let z=rear+pitch;z<front-.02;z+=pitch)for(const x of [left,right])wire([x,y0,z],[x,y1,z]);
  for(let y=y0+pitch;y<y1-.02;y+=pitch) {
    wire([left,y,rear],[right,y,rear]);
    for(const x of [left,right])wire([x,y,rear],[x,y,front]);
  }
}

// Hull fittings the photographs show (267): wire grilles over the headlight recesses in the bolted front module, and the
// tow cable looped across the rear grille between its eyes, the tail-light clusters at the stern's corners.
function hullFittings(P:TankBuilderPort):void {
  for(const side of [-1,1])for(const x of [1.16,1.277])for(const dy of [-.03,0,.03])
    P.addEquipment('hullDark',box(.13,.006,.006),side*x,1.281+dy,3.536);
  // the cable hangs in the open centre of the transom tray (its back sheet ends at z -3.791, the certified stern), under
  // its upper sheet (1.418)
  const cable=new THREE.CatmullRomCurve3([[-.70,1.33,-3.765],[-.35,1.37,-3.765],[0,1.35,-3.765],[.35,1.37,-3.765],
    [.70,1.33,-3.765],[.50,1.14,-3.765],[0,1.12,-3.765],[-.50,1.14,-3.765]]
    .map(([x,y,z])=>new THREE.Vector3(x,y,z)),true,'centripetal');
  P.addEquipment('hullDark',new THREE.TubeGeometry(cable,48,.014,6,true));
  for(const side of [-1,1]) {
    // the tail-light clusters on the rear grille boxes' back faces (z -3.6075)
    P.addEquipment('hullDetail',box(.14,.09,.03),side*1.38,1.33,-3.6215);
    P.addEquipment('hullGlass',box(.055,.05,.006),side*1.41,1.335,-3.6395);
    P.addEquipment('hullGlass',box(.045,.05,.006),side*1.345,1.335,-3.6395);
  }
}

function mainGun(P:TankBuilderPort,mark:Type10Mark):void {
  // The muzzle section runs to the measured muzzle face, the muzzle/FX datum (official 9.42 m overall). It stopped
  // 20 mm short (5.60875) for the factory's seated bore lip, which the carved cannon bores (a28e4d8e6) no longer add
  // (type10X: overall length 9.400 vs 9.42).
  gun(P,'gunMount',cylX(.216,.348,32),0,1.857,2.230);
  gun(P,'gunMount',box(.364,.385,.235),0,1.865,2.075);
  for(const [a,b,rr,rf]of[[2.216,2.424,.187,.154],[2.424,2.901,.154,.140],
    [2.901,3.16,.140,.125],[3.16,3.254,.125,.155],[3.254,3.784,.155,.155],
    [3.784,3.914,.155,.102],[3.914,5.186,.102,.102],
    [5.186,5.456,.102,.092],[5.456,TYPE10_X_DATUMS.muzzleZ,.082,.082]])
    gun(P,'gun',cylZ(rf,b-a,P.q?32:20,rr),0,1.851,(a+b)/2);
  for(const z of [2.90,3.0,3.10])gun(P,'gun',cylZ(.144,.017,28),0,1.851,z);
  for(const side of [-1,1]) {
    const hardware=sectionSolid([[5.438031,1.833966,1.895528,.15281],
      [5.53,1.83489,1.896451,.15281],[5.56716,1.835263,1.896824,.123]].map(([z,low,top,out])=>{
      const ring:[number,number][]=[[.073663,low],[out,low],[out,top],[.073663,top]];
      return{z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    }));
    gun(P,'gun',hardware,0,0,0);
  }
  // the muzzle reference mirror's housing over the barrel (photographs, 267): upper right on production tanks, upper left
  // on the TK-X prototypes
  const mirrorX=mark==='production'?-.072:.072;
  gun(P,'gun',box(.062,.034,.05),mirrorX*.6,1.851+.105,5.47);
  gun(P,'gun',box(.074,.072,.096),mirrorX,1.851+.152,5.47);
  gun(P,'gunDark',box(.006,.05,.07),mirrorX+(mirrorX>0?-.038:.038),1.851+.152,5.47);
  P.muzzleZ=TYPE10_X_DATUMS.muzzleZ-GUN[2];
}

/** The mark the shared base draws: the production tank, or the TK-X prototype's forms of the parts the series changed
 *  (267, the Japan line: plain side modules, round smoke ports, the open basket fence, the muzzle mirror on the left). */
export type Type10Mark='production'|'prototype';

interface Type10XBuildOptions {
  /** False where a variant seats its own roof stations (the dozer's autocannons, type10DozerFieldKit.ts). */
  readonly remoteM2?:boolean;
  readonly mark?:Type10Mark;
  /** The production side blocks' stowage doors; false where a mark covers the blocks with its own armour (the 10B). */
  readonly stowageDoors?:boolean;
  /** The front blocks' smoke dischargers; false where a variant's appliqué covers those blocks and carries its own banks
   *  (the Kaitaku, type10DozerFieldKit.ts). */
  readonly smoke?:boolean;
  /** The field chests in the rear basket; false for the TK-X's empty trials basket (its photographs). */
  readonly basketStowage?:boolean;
  /** The spare links across the lower bow (production; the TK-X's lower plate was plain). */
  readonly bowLinks?:boolean;
}

export function buildType10X(P:TankBuilderPort,{remoteM2=true,mark='production',stowageDoors=mark==='production',smoke=true,
  basketStowage=true,bowLinks=mark==='production'}:Type10XBuildOptions={}):void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(...PIVOT);
  P.gunG.position.set(GUN[0]-PIVOT[0],GUN[1]-PIVOT[1],GUN[2]-PIVOT[2]);
  hull(P,bowLinks);
  P.gear=buildType10XGear(P,{style:'rubber',wheelR:.33617,wheelW:.358099,wheelY:.405,
    wheelZs:[...TYPE10_X_DATUMS.wheelStations],xc:1.27414,trackW:.486738,trackTh:.035,
    idler:{z:3.2069,y:.8113,r:.33617},sprocket:{z:-2.8495,y:.7480,r:.3131},
    rollerR:.095,rollers:[{z:-1.78,y:1.10,r:.095},{z:.20,y:1.10,r:.095},{z:2.06,y:1.10,r:.095}],
    returnRollerHullHalfWidthM:.878,
    topY:1.249,botY:.0805,paintedEnds:true,coveredTop:true,arms:true,
  });
  turretArmor(P);rearRack(P,mark,basketStowage);roofEquipment(P,remoteM2);mainGun(P,mark);
  for(const side of [-1,1]){sideModules(P,side,stowageDoors,mark);if(smoke)smokeDischargers(P,side,mark);}
  laserWarners(P);hullFittings(P);
  P.topY=2.989-PIVOT[1];
  P.hullG.userData.xRebuild={candidate:'type10',independent:true,sourceLocalOnly:true,datumVersion:1};
}

export const TYPE10_X_PROFILES={type10:{build:(P:TankBuilderPort)=>buildType10X(P)}} as const;
