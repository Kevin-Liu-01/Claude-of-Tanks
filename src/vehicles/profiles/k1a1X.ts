// Original metre-space K1A1 X solids. The owner-supplied OBJ is a local-only
// scalar/ray oracle: no source vertices, indices, textures or rig are shipped.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addK1A1XRoof } from './k1a1XRoof.ts';
import { k1a1XWheelSolids } from './k1a1XWheels.ts';
import { addK1A1XMachineGun } from './k1a1XMachineGun.ts';

const { box, cylX, cylZ } = KIT;
const cylY = (r: number, h: number, segments = 32): THREE.BufferGeometry =>
  KIT.cylY(r, r, h, segments);
const RING_Y = 1.49566, RING_Z = .42564;
// OBJ has no pivot nodes. X/Y are the measured circular bore axis; Z is the
// explicitly inferred pitch bearing at the rear boot, not a recovered rig.
const GUN_X = .0352, GUN_Y = 1.81797, GUN_Z = 1.57716;
export const K1A1_X_DATUMS = Object.freeze({
  dims: { hullLengthM: 7.627, overallLengthM: 9.72264, widthM: 3.6758, heightM: 2.20756 },
  roofHeightM: 2.20756, highestFittingM: 4.07025,
  turretPivot: [0, RING_Y, RING_Z] as const,
  trunnion: [GUN_X, GUN_Y, GUN_Z] as const,
  muzzleZ: 5.9052399, forwardFittingZ: 5.9091399,
  wheelStations: [-2.157, -1.2769, -.4408, .5487, 1.6046, 2.5251] as const,
  wheelRadiusM: .3313, wheelY: .3978,
});

function turretPart(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x, y - RING_Y, z - RING_Z, rx, ry, rz);
}

function gunPart(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number): void {
  P.add(bucket, g, x - GUN_X, y - GUN_Y, z - GUN_Z);
}

function hullSection(z: number, half: number, top: number, bottom: number): SolidSection {
  // The lower tub is genuinely narrow. The source shoulder underside lies
  // at1.296–1.297; native rotating shoe wrap needs a small hidden allowance.
  const keel = Math.min(1.012, half - .014);
  const edge = Math.min(.012, (top - bottom) * .20);
  const nativeRearWrap=1.322+.054*Math.max(0,1-Math.abs(z+2.8851)/.72);
  const shoulder = Math.min(top - edge - .004, Math.max(bottom + .005, nativeRearWrap));
  return { z, ring: [[-keel,bottom],[keel,bottom],[keel,shoulder],
    [half,shoulder],[half,top-edge],[half-edge,top],[-half+edge,top],
    [-half,top-edge],[-half,shoulder],[-keel,shoulder]] };
}

function hullBody(P: TankBuilderPort): void {
  P.add('hull', sectionSolid([
    hullSection(-3.4541,1.6836,1.6399,.7998),
    hullSection(-3.20,1.6836,1.6399,.5438),
    hullSection(-2.8851,1.6836,1.6399,.5056),
    hullSection(-2.42,1.6836,1.6399,.4493),
    hullSection(-1.9893,1.6836,1.6399,.3968),
    hullSection(-1.928,1.6836,1.6399,.3968),
    hullSection(-1.10,1.6836,1.4827,.3968),
    hullSection(1.03,1.6836,1.4827,.3968),
    hullSection(2.18,1.6836,1.3686,.3968),
  ]));
  // The centre bow narrows independently of the two forward mudguards.
  P.add('hull', sectionSolid([
    hullSection(2.175,1.0176,1.372,.3968),
    hullSection(2.70,1.0176,1.30553,.53606),
    hullSection(3.12,.9722,1.23927,.72690),
    hullSection(3.30,.844,1.1110,.80869),
    hullSection(3.4873,.844,.8938,.8928),
  ]));
  // Rear exhaust face is a separate folded grille housing, not a wide shelf.
  P.add('hull',sectionSolid([
    hullSection(-3.612,1.012,1.236,.884),
    hullSection(-3.454,1.0176,1.6399,.7998),
  ]));
  // Permanent hull collar, distinct from the rotating turret bearing. The
  // source has a real open centre and a shallow bevel on its outer crown.
  const collar=new THREE.LatheGeometry([[1.272,1.3772],[1.3574,1.3772],
    [1.3574,1.5078],[1.335,1.519],[1.290,1.5218],[1.272,1.5218],
    [1.272,1.3772]].map(([r,y])=>new THREE.Vector2(r,y)),72);
  P.add('hull',collar,0,0,.4448);
}

function guardSheet(side: number): THREE.BufferGeometry {
  return sectionSolid([
    [2.175,1.675,1.357,1.322],[2.84,1.6904,1.349,1.326],
    [3.0322,1.6904,1.3587,1.347],[3.54,1.6904,1.3587,1.342],
    [3.60,1.6904,1.2962,1.2744],[3.70,1.6904,1.169,1.153],
    [3.785,1.682,1.116,1.101],[3.8135,1.24,1.097,1.095],
  ].map(([z,out,top,bottom])=>{
    const ring:[number,number][]=[[.88,bottom],[out-.014,bottom],[out,top-.010],
      [out-.010,top],[.88,top]];
    return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  }));
}

function guardOuterFold(P:TankBuilderPort,side:number):void {
  // The outer source wing turns down around the forward idler. It is not a
  // broad horizontal extension of the fender roof (the first draft was).
  const g=sectionSolid([
    [3.270,1.69,1.351,1.800,1.278,1.800,1.21],
    [3.36,1.69,1.351,1.75,1.292,1.8066,1.064],
    [3.44,1.69,1.352,1.737,1.340,1.8066,.918],
    [3.52,1.69,1.352,1.696,1.350,1.793,.902],
    [3.60,1.69,1.289,1.70,1.264,1.769,.990],
    [3.70,1.69,1.167,1.70,1.157,1.736,1.031],
    [3.790,1.66,1.103,1.674,1.100,1.684,1.075],
  ].map(([z,inner,top,knee,ky,out,low])=>{
    const ring:[number,number][]=[[inner-.014,top-.015],[out-.017,low],
      [out,low],[knee,ky],[inner,top]];
    return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  }));
  P.addMudguard('k1a1-x-outer-return','hull',g);
}

function skirtsAndGuards(P: TankBuilderPort): void {
  for (const side of [-1,1]) {
    sideSkirtPanels(P,side);
    P.addMudguard('k1a1-x-forward-fold','hull',guardSheet(side));
    guardOuterFold(P,side);
    P.addEquipment('hullDetail',box(.1719,.054,.1563),side*1.75195,1.402,3.24315);
    P.addEquipment('hullDark',cylZ(.0425,.0312,20),side*1.5825,1.24,3.7002);
    P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.033,.003,20),'headlight'),side*1.5825,1.24,3.7173);
    rearGuardFold(P,side);
  }
}

function rearGuardFold(P:TankBuilderPort,side:number):void {
  // The measured sheet rises only97mm per100mm forward. Its short rear
  // folded flap supplies the low hem; a single diagonal would fill that air.
  const outline=new THREE.Shape([
    [-3.4697,1.0208],[-3.478,.993],[-3.665,.8118],[-3.6748,.632],
    [-3.6497,.5203],[-3.6464,.5588],[-3.663,.639],[-3.660,.772],
    [-3.651,.811],[-3.4697,.9886],
  ].map(([z,y])=>new THREE.Vector2(-side*z,y)));
  const g=new THREE.ExtrudeGeometry(outline,{depth:.7373,bevelEnabled:false,steps:1});
  g.rotateY(side*Math.PI/2);
  P.addMudguard('k1a1-x-rear-fold','hullRubber',g,side>0?1.0078:-1.0088,0,0);
}

function sideSkirtPanels(P: TankBuilderPort,side: number): void {
  // Six source panel spans; hem and roof changes belong to their actual
  // longitudinal stations, not the bounds of small attached hinges/lugs.
  const panels=[
    [[-3.4717,1.638,1.0035],[-2.6006,1.638,.7334]],
    [[-2.6748,1.6204,.6814],[-1.914,1.6204,.6814],[-1.3359,1.5237,.6814]],
    [[-1.333,1.5244,.6814],[-1.014,1.471,.6814],[.0022,1.471,.6814]],
    [[.0116,1.472,.6814],[.9985,1.472,.6814]],
    [[1.0044,1.4759,.6814],[1.7461,1.4015,.6814]],
    [[1.749,1.4081,.6814],[2.700,1.319,.6814],[3.4697,1.247,.9044]],
  ];
  for(const rows of panels) {
    P.add('hull',sectionSolid(rows.map(([z,top,bottom])=>{
      const ring:[number,number][]=[[1.6934,bottom],[1.7871,bottom],
        [1.7871,top],[1.6934,top]];
      return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    })));
    const rear=rows[0],front=rows.at(-1)!;
    P.addEquipment('hullDetail',box(.070,.018,.092),side*1.744,(rear[1]+front[1])/2+.007,(rear[0]+front[0])/2);
  }
}

function engineDeck(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',cylY(.485,.0185,48),side*.4996,1.64725,-2.90625);
    for(let i=0;i<11;i++) {
      const x=side*.4996+(i-5)*.080;
      const half=Math.sqrt(Math.max(0,.459**2-((i-5)*.080)**2));
      P.addEquipment('hullDark',box(.010,.004,half*2),x,1.6575,-2.90625);
    }
    P.addEquipment('hullDetail',box(.39,.015,.42),side*1.432,1.647,-2.40);
    for(const z of [-1.85,-1.485])
      P.addEquipment('hullDetail',box(.1684,.022,.10),side*.6936,z< -1.7?1.626:1.570,z);
  }
  P.addEquipment('hullDetail',box(1.83,.027,.10),0,1.592,-3.515,.41);
  for(let i=0;i<10;i++)
    P.addEquipment('hullDark',box(1.81,.026,.020),0,1.05+i*.045,-3.574+i*.014);
  for(const side of [-1,1])rearExhaustBracket(P,side);
}

function rearExhaustBracket(P:TankBuilderPort,side:number):void {
  // Two real 45mm-wide folded exhaust guards project aft above the rear grille.
  // Their triangular opening is deliberately retained, not a filled bbox fin.
  const points=[[-3.7275,1.537],[-3.703,1.603],[-3.667,1.638],
    [-3.4502,1.638],[-3.4502,1.096],[-3.479,1.103],[-3.7275,1.510]];
  const outline=new THREE.Shape(points.map(([z,y])=>new THREE.Vector2(-side*z,y)));
  const hole=new THREE.Path([[-3.688,1.521],[-3.570,1.497],[-3.570,1.5827]]
    .map(([z,y])=>new THREE.Vector2(-side*z,y)));
  outline.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(outline,{depth:.0454,bevelEnabled:false,steps:1});
  g.rotateY(side*Math.PI/2);
  P.addEquipment('hullDetail',g,side>0?.9434:-.9438,0,0);
}

function bowFurniture(P: TankBuilderPort): void {
  P.addHatch('hull',box(.7078,.036,.4512),.5362,1.390,2.0801,.103);
  for(const x of [.256,.794])P.addEquipment('hullDetail',cylX(.027,.102,12),x,1.424,1.968);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.244,.093,.070),side*.7366,1.090,3.404);
    P.addEquipment('hullDark',cylZ(.065,.027,20),side*.7366,1.090,3.445);
    P.addEquipment('hullDetail',box(.03,.133,.161),side*.832,1.295,3.101);
    P.addEquipment('hullDetail',box(.21,.017,.31),side*1.096,1.362,3.043);
  }
  P.addEquipment('hullDetail',box(.066,.161,.21),0,.9666,-3.7065);
}

function turretSection(z: number, left: number, right: number, low: number,
  leftTop: number, rightTop: number, roofHalf: number): SolidSection {
  const lowerBevel=Math.min(.08,(Math.min(leftTop,rightTop)-low)*.22);
  const upperBevel=Math.min(.08,(Math.min(leftTop,rightTop)-low)*.22);
  const ring:[number,number][]=[[-left*.91,low],[right*.91,low],
    [right,low+lowerBevel],[right-.17,rightTop-upperBevel],[roofHalf,rightTop],
    [-roofHalf,leftTop],[-left+.17,leftTop-upperBevel],[-left,low+lowerBevel]];
  return {z:z-RING_Z,ring:ring.map(([x,y])=>[x,y-RING_Y])};
}

function turretBody(P: TankBuilderPort): void {
  P.add('turret',sectionSolid([
    turretSection(-1.43,.54,.93,1.75,1.775,1.78,.42),
    turretSection(-1.20,.866,1.01,1.65,2.0204,2.0214,.60),
    turretSection(-.65,1.405,1.45,1.50,2.15476,2.15626,.92),
    turretSection(-.10,1.60,1.58,1.506,2.15476,2.15626,1.20),
    turretSection(.48,1.6152,1.5977,1.521,2.113,2.15626,.92),
    turretSection(1.05,1.58,1.565,1.53,2.043,2.053,.77),
  ]));
  P.add('turret',cylY(1.348,.038,64),0,-.005,0,0,0,0,[1.0094,1,1]);
  turretPart(P,'turret',sectionSolid([[-.22,2.152,2.20756],[1.425,1.94,2.20756],
    [1.548,1.94,2.1089]].map(([z,low,top])=>({z,ring:[[-.3656,low],[.3325,low],
      [.3325,top],[-.3656,top]] as [number,number][]}))),0,0,0);
  for(const side of [-1,1])addForwardCheek(P,side);
  // Separate rear stowage boxes retain the bustle's undercuts and cage air.
  for(const [x,w,z,d]of[[-1.068,.775,-1.281,1.146],[1.064,.8276,-1.283,1.156],
    [-.167,.958,-1.463,.751],[-1.30,.67,-.56,.90],[1.35,.63,-.37,.61]]) {
    turretPart(P,'turretDetail',box(w,.365,d),x,1.961,z);
    turretPart(P,'turretDetail',box(w+.012,.026,d+.012),x,2.1325,z);
  }
}

function addForwardCheek(P: TankBuilderPort,side: number): void {
  const inner=side<0?.3656:.3324;
  // The left lower chine stays broad until1.70; the right turns at1.20.
  // Each station records independent outer-edge and two crown-plane samples,
  // not a full-height bounding prism or a mirrored nominal wedge.
  const rows=side<0?[
    [1.05,1.594,1.556,1.3,1.954,.8,2.052,2.20,1.495],
    [1.32,1.567,1.572,1.3,1.918,.8,1.996,2.18,1.509],
    [1.60,1.538,1.598,1.3,1.880,.8,1.958,2.18,1.518],
    [1.70,1.505,1.605,1.3,1.735,.8,1.944,2.16,1.52],
    [1.90,1.061,1.585,.8,1.750,.6,1.90,2.04,1.53],
    [2.00,.822,1.590,.70,1.668,.5,1.817,1.906,1.545],
    [2.10,.406,1.714,.397,1.720,.38,1.730,1.740,1.714],
    [2.118,.395,1.718,.390,1.719,.38,1.719,1.720,1.716],
  ]:[
    [1.05,1.579,1.590,1.3,2.003,.8,2.056,2.145,1.48],
    [1.20,1.560,1.600,1.3,1.867,.8,2.034,2.145,1.488],
    [1.45,1.250,1.587,1.1,1.734,.8,1.996,2.147,1.50],
    [1.70,.906,1.588,.8,1.694,.6,1.98,2.18,1.53],
    [1.90,.630,1.590,.5,1.804,.43,1.884,2.024,1.54],
    [2.10,.390,1.689,.38,1.700,.35,1.721,1.736,1.683],
    [2.118,.379,1.705,.37,1.718,.35,1.719,1.720,1.704],
  ];
  for(let i=1;i<rows.length;i++) {
    const a=rows[i-1],b=rows[i],steps=Math.ceil((b[0]-a[0])/.025);
    for(let step=0;step<steps;step++) {
      const row=(t:number)=>a.map((value,j)=>value+(b[j]-value)*t);
      cheekPlaneSpan(P,side,inner,row(step/steps),row((step+1)/steps));
    }
  }
}

// Independent half-space planes encode the crown, steep outer bevel and
// sloping nose. Their intersections retain the sharp physical ridge instead
// of blending a source-sized 100mm depression into a nominal five-point loft.
function cheekRoofPlanes(side:number):number[][] {
  return side<0?[
    [-.857200,.514936,.006973,2.177536],[-.895423,.442343,.050497,2.164433],
    [-.152784,.979350,.132407,2.251270],[-.329962,.521715,.786726,2.671297],
  ]:[
    [.836483,.547978,-.004112,2.187817],[.105642,.983593,.146231,2.260161],
    [.524860,.512476,.679626,2.454813],[.507116,.508808,.695664,2.450183],
  ];
}

function cheekRoof(planes:number[][],x:number,z:number):number {
  return Math.min(...planes.map(([nx,ny,nz,d])=>(d-nx*x-nz*z)/ny));
}

function cheekCreases(planes:number[][],side:number,inner:number,row:number[]):number[] {
  const z=row[0],width=row[1]-inner,ratios:number[]=[];
  for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++) {
    const a=planes[i],b=planes[j],divisor=a[0]/a[1]-b[0]/b[1];
    if(Math.abs(divisor)<1e-8)continue;
    const x=((a[3]-a[2]*z)/a[1]-(b[3]-b[2]*z)/b[1])/divisor;
    const ratio=(side*x-inner)/width;
    if(ratio>.00001&&ratio<.99999)ratios.push(ratio);
  }
  return ratios;
}

function cheekPlaneSpan(P:TankBuilderPort,side:number,inner:number,a:number[],b:number[]):void {
  const planes=cheekRoofPlanes(side);
  const cuts=[0,1,...cheekCreases(planes,side,inner,a),...cheekCreases(planes,side,inner,b)]
    .sort((x,y)=>y-x).filter((value,i,all)=>i===0||all[i-1]-value>.00001);
  const sections=[a,b].map(row=>{
    const [z,out,edge]=row,bottom=row[8];
    const roof=cuts.map(t=>{
      const x=inner+(out-inner)*t;
      return [x,Math.max(bottom+.002+(edge-bottom-.002)*t,cheekRoof(planes,side*x,z))] as [number,number];
    });
    const ring:[number,number][]=[[inner,bottom],[out,edge-.002],...roof];
    return {z:z-RING_Z,ring:(side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring)
      .map(([x,y])=>[x,y-RING_Y] as [number,number])};
  });
  P.add('turret',sectionSolid(sections));
}

function rail(P: TankBuilderPort,a: readonly number[],b: readonly number[],r=.0137): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),axis=end.clone().sub(start);
  const g=cylY(r,axis.length(),10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize()));
  const center=start.add(end).multiplyScalar(.5);
  turretPart(P,'turretOpenLattice',g,center.x,center.y,center.z);
}

function basket(P: TankBuilderPort): void {
  // The rear cage is a bent open frame with narrow rails, never a filled box.
  const corners=[[-1.65,-.75],[-1.65,-1.90],[-1.325,-2.409],
    [1.278,-2.409],[1.628,-1.899],[1.628,-.75]];
  for(const y of [1.775,1.92,2.064])for(let i=1;i<corners.length;i++)
    rail(P,[corners[i-1][0],y,corners[i-1][1]],[corners[i][0],y,corners[i][1]]);
  // Independently measured rail centres; the source spacing is not uniform.
  for(const x of [-1.20995,-1.05955,-.9922,-.83935,-.7002,-.56985,-.4358,-.30665,
    -.16805,-.0503,.0746,.1892,.3164,.42825,.5459,.6675,.7842,.8999,1.0293,1.1787]) {
    rail(P,[x,1.764,-2.419],[x,2.064,-2.419]);
    rail(P,[x,1.764,-2.419],[x,1.77,-1.854]);
  }
  for(const side of [-1,1])for(const z of [-1.84,-1.64,-1.45,-1.26,-1.10,-.95]) {
    const x=side<0?-1.65:1.628;
    rail(P,[x,1.775,z],[x,2.064,z]);
    rail(P,[x,1.775,z],[side*1.36,1.775,z+.15]);
  }
  forwardCageRails(P);
  cageTieCables(P);
}

function cageTieCables(P:TankBuilderPort):void {
  // These two source cables sag between their supports. A straight chord
  // falsely blocks a genuine opening at X.02/Y1.84 and misses the low centre.
  const path=[[-.38,1.8542,-2.4513],[-.23,1.8525,-2.4513],
    [.10,1.8663,-2.4513],[.423,1.8276,-2.4513],[.53,1.8276,-2.4513],
    [.93,1.8663,-2.4494],[1.04,1.8663,-2.4489],[1.317,1.8413,-2.4],
    [1.390,1.8489,-2.3],[1.460,1.8635,-2.2],[1.528,1.8663,-2.1],
    [1.650,1.8663,-1.9],[1.657,1.8663,-1.7],[1.674,1.881,-1.35]];
  for(const upper of [false,true])for(let i=1;i<path.length;i++) {
    const points=[path[i-1],path[i]].map(([x,y,z])=>[x,
      y+(upper?.1228+Math.max(0,Math.min(1,(.1-x)/.33))*.015:0),z]);
    cageCableSegment(P,points[0],points[1],i<8?.02145:.0176);
  }
  for(const y of [1.84326,1.95996]) {
    const shape=new THREE.Shape([[1.6299,y],[1.675,y],[1.6895,y+.0095],
      [1.6895,y+.0508],[1.6833,y+.0508],[1.679,y+.015],
      [1.675,y+.0088],[1.6299,y+.0088]].map(p=>new THREE.Vector2(...p)));
    const g=new THREE.ExtrudeGeometry(shape,{depth:.0293,bevelEnabled:false,steps:1});
    turretPart(P,'turretOpenLattice',g,0,0,-1.85956);
  }
}

function cageCableSegment(P:TankBuilderPort,a:number[],b:number[],halfWidth:number):void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
  const axis=end.clone().sub(start),length=axis.length();axis.normalize();
  const up=new THREE.Vector3(0,1,0).addScaledVector(axis,-axis.y).normalize();
  const across=new THREE.Vector3().crossVectors(up,axis);
  const g=cylY(.02145,length,12);
  g.scale(1,1,halfWidth/.02145);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(up,axis,across));
  const centre=start.add(end).multiplyScalar(.5);
  turretPart(P,'turretOpenLattice',g,centre.x,centre.y,centre.z);
}

function forwardCageRails(P:TankBuilderPort):void {
  // Source rails turn in at unequal stations: the left extends to1.53 while
  // the right curves in at.98 and ends1.15. Their X/Y/Z paths are not mirrored.
  for(const [rear,front]of[[1.744,1.706],[1.902,1.793],[2.050,1.876]]) {
    rail(P,[-1.65,rear,-.75],[-1.65,rear,0]);
    rail(P,[-1.65,rear,0],[-1.65,front,1.39]);
    rail(P,[-1.65,front,1.39],[-1.57,front-.010,1.50]);
    rail(P,[-1.57,front-.010,1.50],[-1.43,front-.015,1.527]);
  }
  for(const [rear,knee,front]of[[1.755,1.755,1.742],[1.909,1.891,1.855],[2.064,2.030,1.919]]) {
    rail(P,[1.628,rear,-.75],[1.671,rear,-.67]);
    rail(P,[1.671,rear,-.67],[1.671,knee,.5]);
    rail(P,[1.671,knee,.5],[1.661,front,.975]);
    rail(P,[1.661,front,.975],[1.381,front-.04,1.157]);
  }
}

function smokeBanks(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    const z0=side<0?1.935:1.508,y0=side<0?1.87:1.91;
    turretPart(P,'turretDetail',box(.37,.24,.29),side*1.16,y0-.07,z0-.045,-.32,side*.27);
    for(let i=0;i<6;i++) {
      const row=i%3,tier=Math.floor(i/3),x=side*(1.020+row*.095+tier*.036);
      const y=y0+.045-row*.038-tier*.078,z=z0+.104-row*.033+tier*.024;
      turretPart(P,'turretDark',cylZ(.035,.153,16),x,y,z,-.66,side*(.08+row*.29));
      // Supplied source explicitly has closed launcher caps, not dark open tubes.
      turretPart(P,'turretDetail',cylZ(.036,.014,16),x,y+.049,z+.062,-.66,side*(.08+row*.29));
    }
  }
}

function stowageBag(width: number,height: number,depth: number): THREE.BufferGeometry {
  // A deliberately authored folded pillow, not a copied triangulated source bag.
  return sectionSolid([[-.5,.66,.30],[-.32,1,.88],[.18,1,1],[.50,.65,.47]]
    .map(([z,w,h])=>({z:z*depth,ring:[[-width*w/2,0],[width*w/2,0],
      [width*w/2,height*h*.68],[width*w*.22,height*h],[-width*w*.31,height*h*.97],
      [-width*w/2,height*h*.63]] as [number,number][]})));
}

function rearStowage(P: TankBuilderPort): void {
  for(const [x,z,w,h,d,base]of[
    [-.192,-2.151,.556,.522,.518,1.761],[.468,-2.079,.836,.409,.439,1.770],
    [-1.246,-1.923,.495,.409,.502,1.775],[-.726,-2.063,.459,.451,.430,1.747],
    [-1.488,-1.616,.355,.282,.350,1.810],
    [-1.228,-2.229,.320,.292,.293,1.855],[-1.39,-1.433,.542,.233,.713,1.801],
  ])turretPart(P,'turretCloth',stowageBag(w,h,d),x,base,z);
  diagonalRightBag(P);
}

function diagonalRightBag(P:TankBuilderPort):void {
  // Source pouch follows the diagonal aft cage, not the axes of its bbox.
  const rows=[[-2.410,1.14,1.16,1.990,2.010],[-2.30,.946,1.243,1.821,2.175],
    [-2.10,.974,1.328,1.838,2.168],[-1.90,1.026,1.445,1.805,2.189],
    [-1.70,1.125,1.535,1.801,2.184],[-1.60,1.184,1.5455,1.798,2.180],
    [-1.55,1.207,1.548,1.815,2.183],
    [-1.53,1.215,1.554,1.824,2.179],
    [-1.50,1.228,1.585,1.837,2.169],[-1.45,1.264,1.616,1.831,2.172],
    [-1.40,1.303,1.628,1.830,2.174],[-1.30,1.329,1.573,1.838,2.160],
    [-1.222,1.388,1.40,1.980,2.00]];
  const g=sectionSolid(rows.map(([z,lo,hi,bottom,top])=>{
    const w=hi-lo,h=top-bottom;
    return{z,ring:[[lo+w*.16,bottom],[hi-w*.16,bottom],[hi,bottom+h*.52],
      [hi-w*.08,bottom+h*.75],[lo+w*.56,top],[lo+w*.18,top-h*.08],
      [lo,bottom+h*.56]] as [number,number][]};
  }));
  turretPart(P,'turretCloth',g,0,0,0);
}

function gunnerSight(P: TankBuilderPort): void {
  // Source front lens is behind the front lips by12–38mm, not a black cuboid.
  turretPart(P,'turretDetail',box(.6226,.092,.4187),-.76,2.075,.9477,.06);
  for(const x of [-1.051,-.469])turretPart(P,'turretDetail',box(.041,.211,.30),x,2.204,.987,-.11);
  turretPart(P,'turretDetail',box(.6226,.024,.4187),-.76,2.31276,.9477);
  turretPart(P,'turretDark',box(.535,.160,.012),-.76,2.200,1.112,-.16);
  turretPart(P,'turretGlass',box(.47,.135,.004),-.76,2.203,1.121,-.16);
}

function roofFurniture(P: TankBuilderPort): void {
  turretPart(P,'turretDetail',cylY(.285,.0923,40),-.81055,2.18291,.29604);
  addK1A1XRoof(P);
  addK1A1XMachineGun(P);
  turretPart(P,'turretHatch',cylY(.342,.087,40),-.5231,2.220,-.204,.11,0,0);
  turretPart(P,'turretHatch',cylY(.296,.0585,40),.44845,2.1792,-.00591,0,0,0);
  turretPart(P,'turretDetail',box(.764,.0205,1.5281),.76945,2.19091,.07149);
  const whipBase=new THREE.LatheGeometry([[0,2.16996],[.0785,2.16996],
    [.0785,2.195],[.0432,2.23],[.0428,2.30],[.0368,2.40],[.024,2.50],
    [.01415,2.55],[.01315,2.59226],[0,2.59226]].map(([r,y])=>new THREE.Vector2(r,y)),24);
  turretPart(P,'turretDetail',whipBase,.4161,0,-1.22526);
  antennaWhip(P);
  // Small central vertical station is present in the source independent of the whip.
  const pole=new THREE.LatheGeometry([[0,2.16796],[.052,2.16796],[.052,2.33],
    [.0441,2.455],[.0441,2.902],[.0489,2.922],[.0489,3.037],
    [.0515,3.051],[.0515,3.069],[.001,3.08056],[0,3.08056]]
    .map(([r,y])=>new THREE.Vector2(r,y)),24);
  turretPart(P,'turretDetail',pole,-.1031,0,-.57536);
  gunnerSight(P);
}

function antennaWhip(P:TankBuilderPort):void {
  // The source is a short thick collar plus a genuinely tapered six-sided
  // whip, not a constant broad cylinder all the way to its unchanged tip.
  const g=new THREE.LatheGeometry([[0,2.56705],[.0126,2.56705],
    [.0126,2.874],[.0085,2.884],[.0058,4.07025],[0,4.07025]]
    .map(([r,y])=>new THREE.Vector2(r,y)),6);
  g.rotateY(Math.PI/6);
  turretPart(P,'turretDark',g,.41674,0,-1.22533);
}

function gunBoot(P: TankBuilderPort): void {
  // The source boot folds below the rear bearing, rises, then drops again;
  // its full transverse width continues to the thin forward return.
  const mount=sectionSolid([[1.564,.312,1.9518,1.9533],[1.579,.349,1.8968,2.2123],
    [1.65,.349,1.6601,2.2019],[1.82,.349,1.7142,2.1774],
    [1.982,.349,1.5558,2.1541],[2.222,.349,1.5914,2.1195],
    [2.244,.349,1.5950,2.0784],[2.394,.349,1.8165,1.8175]]
    .map(([z,half,bottom,top])=>({z:z-GUN_Z,ring:[
      [-.01662-half-GUN_X,bottom-GUN_Y],[-.01662+half-GUN_X,bottom-GUN_Y],
      [-.01662+half-GUN_X,top-GUN_Y],[-.01662-half-GUN_X,top-GUN_Y],
    ] as [number,number][]})));
  P.add('gunMount',mount);
  // Actual offset coax tube and its closed rear seat, not a black front disk.
  const coax=new THREE.LatheGeometry([new THREE.Vector2(0,0),
    new THREE.Vector2(.0433,0),new THREE.Vector2(.0433,.4643),
    new THREE.Vector2(.031,.4643),new THREE.Vector2(.031,.40),
    new THREE.Vector2(0,.40)],20).rotateX(Math.PI/2);
  gunPart(P,'gunMount',coax,-.26552,2.03022,2.25156);
  gunPart(P,'gunMount',box(.108,.063,.086),-.26552,2.027,2.270);
  for(const x of [-.2525,.196])
    gunPart(P,'gunMount',box(.1008,.020,.0667),x,2.212,1.6069);
}

function barrelSections(P: TankBuilderPort): void {
  for(const [rear,front,r,backR,offset,backOffset] of [
    [2.27356,2.51666,.190,.190,0,0],[2.51194,2.778,.12065,.12065,0,0],
    [2.778,2.850,.1319,.1319,0,0],[2.850,3.163,.1117,.1117,0,0],
    [3.163,3.270,.1222,.1205,0,0],[3.270,3.307,.1485,.1222,.0262,0],
    [3.307,3.363,.1591,.1485,.0351,.0262],[3.363,3.831,.1591,.1591,.0351,.0351],
    [3.831,3.864,.151,.1591,.027,.0351],[3.864,3.896,.12225,.151,0,.027],
    [3.896,4.023,.12225,.12225,0,0],[4.023,4.045,.1074,.12225,0,0],
    [4.045,5.499,.1074,.1074,0,0],[5.499,5.590,.1167,.1167,0,0],
    [5.590,5.670,.0921,.0921,0,0],[5.670,5.689,.0879,.0879,0,0],
    [5.689,K1A1_X_DATUMS.muzzleZ-.020,.0963,.0963,0,0],
  ]) {
    const g=cylZ(r,front-rear,P.q?32:20,backR),p=g.attributes.position;
    for(let i=0;i<p.count;i++) {
      const t=p.getZ(i)/(front-rear)+.5;
      p.setY(i,p.getY(i)+backOffset+(offset-backOffset)*t);
    }
    g.computeVertexNormals();gunPart(P,'gun',g,GUN_X,GUN_Y,(rear+front)/2);
  }
}

function mainGun(P: TankBuilderPort): void {
  gunBoot(P);barrelSections(P);
  gunPart(P,'gun',cylZ(.09695,.0528,24),GUN_X,GUN_Y,5.63084);
  gunPart(P,'gun',box(.1229,.0378,.1484),.03545,1.90867,5.81544);
  gunPart(P,'gun',box(.0599,.063,.1641),.03545,1.95847,5.76269);
  gunPart(P,'gun',box(.1049,.066,.0527),.03545,1.96057,5.87109);
  gunPart(P,'gun',box(.0437,.0461,.0117),.03545,1.96032,5.90329);
  P.muzzleZ=K1A1_X_DATUMS.muzzleZ-GUN_Z;
}

export function buildK1A1X(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(0,RING_Y,RING_Z);
  P.gunG.position.set(GUN_X,GUN_Y-RING_Y,GUN_Z-RING_Z);
  hullBody(P);
  const wheels=k1a1XWheelSolids();
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelR:.3313,wheelW:.3701,wheelY:.3978,
    // 2026-09-12 fleet visual standard: the source tire opening (.2971) left
    // the dish's rolled rim and shoulder showing as a pale groove between the
    // rubber and the dish, which read as a split tire on every study. The
    // rubber now runs in to .2700 (61 mm band, 18% of the radius, the M1-style
    // broad tire the K1 actually wears); the outer radius and every axle datum
    // are unchanged, so the silhouette gate is unaffected.
    wheelTireInnerRadiusM:.2700,wheelCoreGeometry:{disc:wheels.core},
    wheelFaceLayers:[
      {geometry:wheels.left,material:P.mats.wheels,side:-1,name:'k1SourceWheelFacesL'},
      {geometry:wheels.right,material:P.mats.wheels,side:1,name:'k1SourceWheelFacesR'},
    ],
    wheelZs:[...K1A1_X_DATUMS.wheelStations],xc:1.3376,trackW:.5832,trackTh:.028,
    // Source tread is67.1mm thick, with a67.8mm inward guide. Separate pitch
    // radii seat its course through the drive teeth without changing axles.
    trackShoeDimensions:{padHeight:.030,grouserHeight:.012,webHeight:.0195,
      hornHeight:.068,pinRadius:.012,pinCentreY:0},
    idler:{z:3.2984,y:.8305,r:.3313,trackR:.298},
    sprocket:{z:-2.8851,y:.81225,r:.39725,trackR:.318},
    rollerR:.1245,returnRollerWidthM:.2853,returnRollerInsetM:.01255,
    rollers:[{z:-1.9636,y:1.0256,r:.1245},{z:-.1046,y:1.0259,r:.1245},
      {z:1.6717,y:1.0141,r:.1245}],
    // Source return skin floats above its actual rollers. The native course
    // rests on those measured rollers; the oracle is deliberately unchanged.
    // Actual rigid shoes remain2.4mm above the source ground plane, within
    // its0–5.4mm flat-tread ripple, without transition-corner penetration.
    topY:1.209,botY:.0554,paintedEnds:true,arms:true,coveredTop:true,
  });
  skirtsAndGuards(P);engineDeck(P);bowFurniture(P);
  turretBody(P);basket(P);rearStowage(P);smokeBanks(P);roofFurniture(P);mainGun(P);
  P.topY=2.62456-RING_Y;
  P.hullG.userData.xRebuild={candidate:'k1a1_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}

export const K1A1_X_PROFILES={k1a1_x:{build:buildK1A1X}} as const;
