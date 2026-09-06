// Independent first-party Merkava X constructions. Source archives are local
// comparison inputs only; neither builder calls an earlier Merkava profile.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { markEraHitFaces } from './eraHitFaces.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { merkava4RearFoldSolids } from './merkava4RearHull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ, cylX, torus } = KIT;
const cylY = (radius: number, height: number, segments: number): THREE.BufferGeometry =>
  KIT.cylY(radius, radius, height, segments);
type Frame = { y: number; z: number; ground: number; center: number };
const MK3: Frame = { y: 1.68034, z: -.72418, ground: .02034, center: -.2258175 };
const MK4: Frame = { y: 1.605, z: -.3906, ground: 0, center: 0 };

export const MERKAVA3D_X_DATUMS = Object.freeze({
  hullLengthM: 7.9645, widthM: 3.976352, overallLengthM: 8.8382,
  roofHeightM: 2.59, overallHeightM: 5.15869,
  turretPivot: [0,MK3.y,MK3.z] as const,
  trunnion: [0,2.0898,1.4258] as const, muzzleZ: 4.8560,
  wheelStations: [-2.5495,-1.6665,-.5365,.3215,1.180,2.033] as const,
});
export const MERKAVA4_X_DATUMS = Object.freeze({
  hullLengthM: 7.60, widthM: 3.7768898, overallLengthM: 8.7050,
  roofHeightM: 2.565, overallHeightM: 4.9327283,
  turretPivot: [0,MK4.y,MK4.z] as const,
  trunnion: [0,1.9934619,1.93] as const, muzzleZ: 4.8055,
  wheelStations: [-2.062,-1.267,-.199,.739,1.617,2.417] as const,
});

function bodyStation(z: number, half: number, roof: number, floor: number, frame: Frame, inner: number, shoulderDepth = .19): SolidSection {
  const depth=roof-floor, bevel=Math.min(.06,depth*.2);
  const shoulder=roof-Math.min(shoulderDepth,depth*.32);
  return {z:z-frame.center,ring:[
    [-inner,floor+frame.ground],[inner,floor+frame.ground],
    [inner+.015,shoulder+frame.ground],[half,roof-bevel+frame.ground],
    [half-.025,roof+frame.ground],[-half+.025,roof+frame.ground],
    [-half,roof-bevel+frame.ground],[-inner-.015,shoulder+frame.ground],
  ]};
}

function shellStation(z: number, half: number, roofHalf: number, low: number, high: number, frame: Frame): SolidSection {
  const lower=Math.min(.09,(high-low)*.23),upper=Math.min(.34,(high-low)*.42);
  return {z:z-frame.center-frame.z,ring:[
    [-half+.06,low+frame.ground-frame.y],[half-.06,low+frame.ground-frame.y],
    [half,low+lower+frame.ground-frame.y],[half,high-upper+frame.ground-frame.y],
    [roofHalf,high+frame.ground-frame.y],[-roofHalf,high+frame.ground-frame.y],
    [-half,high-upper+frame.ground-frame.y],[-half,low+lower+frame.ground-frame.y],
  ]};
}

function topPart(P: TankBuilderPort, frame: Frame, slot: string, geometry: THREE.BufferGeometry,
  x: number,y: number,z: number,rx=0,ry=0,rz=0): void {
  P.addEquipment(slot,geometry,x,y+frame.ground-frame.y,z-frame.center-frame.z,rx,ry,rz);
}

function armorTile(P: TankBuilderPort, frame: Frame, side: number, rear: number, front: number,
  innerRear: number, outerRear: number, innerFront: number, outerFront: number,
  roofRear: number, edgeRear: number, roofFront: number, edgeFront: number, reactive = false): void {
  const ring = (inner: number, outer: number, roof: number, edge: number): [number,number][] => {
    const p: [number,number][]=[[inner,roof-.042],[outer,edge-.042],[outer,edge],[inner,roof]];
    return side<0?p.map(([x,y])=>[-x,y] as [number,number]).reverse():p;
  };
  const sections=[{z:rear-frame.center-frame.z,ring:ring(innerRear,outerRear,roofRear,edgeRear)},
    {z:front-frame.center-frame.z,ring:ring(innerFront,outerFront,roofFront,edgeFront)}];
  for(const s of sections)s.ring=s.ring.map(([x,y])=>[x,y+frame.ground-frame.y]);
  const geometry=sectionSolid(sections);
  P.add('turret',reactive?markEraHitFaces(geometry,[0,1,0]):geometry);
}

function handrail(P: TankBuilderPort, frame: Frame, x: number, rear: number, front: number, y: number): void {
  topPart(P,frame,'turretOpenLattice',box(.025,.025,front-rear),x,y,(front+rear)/2);
  for(const z of[rear,front])topPart(P,frame,'turretOpenLattice',box(.025,.17,.025),x,y-.082,z);
}

function cageBar(P: TankBuilderPort, frame: Frame, a: [number,number,number], b: [number,number,number], width = .025): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  const g=box(width,delta.length(),width).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
  const mid=start.add(end).multiplyScalar(.5);
  topPart(P,frame,'turretOpenLattice',g,mid.x,mid.y,mid.z);
}

function chainCurtain(P: TankBuilderPort, frame: Frame, rear: number, half: number, railY: number, drop = .25): void {
  // Real separated rail-and-chain equipment; open space remains open.
  topPart(P,frame,'turretOpenLattice',box(half*2,.035,.035),0,railY,rear);
  for(let i=0;i<23;i++){
    const x=-half+.06+i*(half*2-.12)/22;
    topPart(P,frame,'turretOpenLatticeDark',cylY(.009,drop,6),x,railY-drop/2-.015,rear);
    topPart(P,frame,'turretOpenLattice',new THREE.SphereGeometry(.030,8,6),x,railY-drop-.033,rear);
  }
}

function deckField(P: TankBuilderPort, slot: string, stations: readonly (readonly number[])[], depth: number): void {
  P.addEquipment(slot,sectionSolid(stations.map(([z,left,right,yl,yr])=>({z,ring:[
    [left,yl-depth],[right,yr-depth],[right,yr],[left,yl],
  ]}))));
}

function merkava3FrontDeck(P: TankBuilderPort): void {
  // Canonical source armor has three slopes and a raised left-center field.
  // The earlier uniform wedge sat 15–20 cm below these visible armor planes.
  deckField(P,'hull',[
    [.82,-1.24,.47,1.82,1.82],[1.057,-1.24,.47,1.83705,1.83705],
    [1.502,-1.24,.47,1.765,1.83705],[2.068,-1.20,.40,1.728,1.7647],
    [2.656,-1.17,.35,1.659,1.659],
  ],.24);
  // The flatter central crest is separate from the left transverse bevel.
  deckField(P,'hull',[
    [1.502,-.648,.165,1.83705,1.83705],[1.836,-.495,.408,1.807,1.807],
    [2.068,-.495,.294,1.785,1.785],[2.656,-1.10,.215,1.659,1.659],
  ],.09);
  deckField(P,'hull',[[1.502,-1.24,-.648,1.765,1.837],
    [2.068,-1.20,-.495,1.727,1.785],[2.656,-1.17,-1.10,1.659,1.659]],.065);
  deckField(P,'hull',[[.82,.50,1.39,1.75972,1.75972],[1.40,.50,1.39,1.75972,1.75972],
    [1.77,.50,1.39,1.726,1.726],[2.69,.50,1.39,1.471,1.471]],.13);
  deckField(P,'hull',[[1.77,.949,1.25,1.759,1.759],
    [2.69,.949,1.25,1.504,1.504]],.050);
  deckField(P,'hullDetail',[[1.731,.516,.949,1.769,1.769],
    [2.692,.516,.949,1.5022,1.5022]],.03325);
  deckField(P,'hullDetail',[[2.687,-1.195,.43,1.636,1.636],
    [2.80,-1.195,.43,1.6055,1.6055],[3.074,-1.18,.296,1.523,1.523],
    [3.171,-1.175,.282,1.4906,1.4906]],.055);
  // Driver cover, transverse hinge and right-hand access cover are distinct
  // fitted parts, not a generic grille repeated over the entire glacis.
  deckField(P,'hullDetail',[[2.79,-.67,-.53,1.675,1.675],
    [2.97,-.78,-.52,1.622,1.622],[3.119,-.81,-.55,1.576,1.576]],.022);
  P.addEquipment('hullDetail',torus(.084,.016,20,8),-.527,1.671,2.73,1.285);
  P.addEquipment('hullDetail',box(.21,.019,.033),-.666,1.626,3.005,.29,.16);
  P.addEquipment('hullDetail',box(.649,.0483,.4816),.88868,1.78628,1.20122);
  P.addEquipment('hullDetail',box(.5413,.0480,.2621),1.08541,1.8190,1.26188);
  for(const x of[.6397,1.1070]){
    P.addEquipment('hullDetail',box(.183,.020,.186),x,1.76972,1.458);
    P.addEquipment('hullDetail',cylX(.037,.161,16),x,1.80972,1.448);
    P.addEquipment('hullDetail',box(.12,.035,.070),x,1.794,1.516);
  }
  P.addEquipment('hullDetail',box(1.429,.026,.070),-.4414,1.481,3.211);
  for(const x of[-1.06,-.76,-.06,.20])P.addEquipment('hullDetail',cylX(.024,.10,12),x,1.488,3.215);
}

function merkava3SmokeTube(P: TankBuilderPort, side: number, row: number, i: number): void {
  const right=side>0,baseY=right?2.163:1.984,baseZ=right?1.173:.936;
  const rx=right?-.18:-.22,ry=side*.157;
  const x=side*(1.196+i*.0901+(row===0?.010:0));
  const y=baseY+(row? .087:.005)+(right?i*.0081:0);
  const z=baseZ+.088-i*.0143-(row?.017:0);
  const tube=new THREE.LatheGeometry([
    new THREE.Vector2(.043,-.124),new THREE.Vector2(.043,.124),
    new THREE.Vector2(.034,.124),new THREE.Vector2(.034,.045),
  ],16);tube.rotateX(Math.PI/2);
  topPart(P,MK3,'turretDetail',tube,x,y-MK3.ground,z+MK3.center,rx,ry);
  topPart(P,MK3,'turretDark',cylZ(.034,.005,16),x,y-.020-MK3.ground,z-.047+MK3.center,rx,ry);
}

function merkava3SmokeBanks(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    const right=side>0,baseY=right?2.163:1.984,baseZ=right?1.173:.936;
    const slope=right?.09:0,rx=right?-.18:-.22,ry=side*.157;
    // The asymmetric banks follow their different cheek seats; the outboard
    // bank is neither a mirrored floating box nor a six-disc decal.
    const g=box(.337,.152,.335);g.rotateX(rx);g.rotateY(ry);g.rotateZ(side*slope);
    topPart(P,MK3,'turretDetail',g,side*1.294,baseY-MK3.ground,baseZ+MK3.center);
    for(let row=0;row<2;row++)for(let i=0;i<3;i++)merkava3SmokeTube(P,side,row,i);
  }
}

function merkava3HullDetails(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    for(let i=0;i<10;i++){
      const z=-3.49+i*.648;
      const hem=i===0?.745:i===9?.726:.663;
      P.add('hull',box(.082,1.416-hem,.634),side*1.92,(hem+1.416)/2+MK3.ground,z+.317-MK3.center);
      for(const at of[z+.12,z+.49]){
        P.addEquipment('hullDetail',box(.037,.055,.13),side*1.968,1.356,at-MK3.center);
        P.addEquipment('hullDark',cylX(.016,.030,8),side*1.973176,1.356,at-MK3.center);
      }
    }
    P.addMudguard('merkava3d-x-front-shoulder','hull',orientedSlab(
      [side*1.18,1.39,3.45-MK3.center],[side*1.84,1.39,3.45-MK3.center],
      [side*1.84,1.47,2.78-MK3.center],[side*1.18,1.47,2.78-MK3.center],
      [side*1.18,1.44,3.58-MK3.center],[side*1.84,1.44,3.58-MK3.center],
      [side*1.84,1.55,2.78-MK3.center],[side*1.18,1.55,2.78-MK3.center],
    ));
    P.addMudguard('merkava3d-x-front-flap','hullRubber',box(.56,.36,.045),side*1.56,1.25,3.59-MK3.center,-.12);
    P.addMudguard('merkava3d-x-rear-flap','hullRubber',box(.74964,.40821,.05),side*1.4531,1.13577,-3.95226-MK3.center,.10);
    P.addMudguard('merkava3d-x-rear-hanger','hullDark',box(.72,.28,.36),side*1.475,1.47,-3.78-MK3.center);
    const z=side<0?2.90:2.28;
    P.addEquipment('hullDetail',box(.24,.23,.20),side*1.55,1.575,z-MK3.center);
    P.addEquipment('hullDark',box(.19,.17,.032),side*1.55,1.575,z+.105-MK3.center);
    P.addEquipment('hullGlass',box(.13,.11,.010),side*1.55,1.575,z+.124-MK3.center);
    // Rear containers have a separate overhanging cap and horizontal ribs.
    P.addEquipment('hullDetail',box(.7399,.5649,.4767),side*.73815,1.22325+MK3.ground,-3.91415-MK3.center);
    P.addEquipment('hullDetail',box(.7781,.1323,.515),side*.75655,1.52955+MK3.ground,-3.9305-MK3.center);
    for(let i=0;i<5;i++)P.addEquipment('hullDetail',box(.735,.022,.019),side*.751,.9507+i*.120+MK3.ground,-4.164-MK3.center);
    P.addEquipment('hullDetail',torus(.068,.021,12,6),side*.69,.97,-3.38-MK3.center);
    // The forward towing eyes, not an extended armored nose, set this
    // source's hull exterior length. Preserve their open side-view aperture.
    const eye=torus(.079,.0205,16,8);eye.scale(1.15,1,1);
    P.addEquipment('hullDetail',eye,side*.6768,1.0131+MK3.ground,3.6452-MK3.center,0,Math.PI/2);
    P.addEquipment('hullDetail',box(.1038,.101,.099),side*.6768,1.024+MK3.ground,3.566-MK3.center);
  }
  merkava3FrontDeck(P);
}

function merkava3TurretDetails(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>topPart(P,MK3,slot,g,x,y,z,rx,ry,rz);
  for(const side of[-1,1]){
    // Only the three existing bolt-on panels deplete. The independently
    // closed turret shell, handrail, smoke mounts and roof furniture remain.
    P.destructibleCluster(`merkava_merkava3d_turret_era_${side<0?'L':'R'}`,()=>{
      for(let i=0;i<3;i++){
        const rear=-2.20+i*.65,front=rear+.626;
        armorTile(P,MK3,side,rear,front,1.24,1.68+i*.06,1.24,1.74+i*.045,
          2.578-i*.043,2.34-i*.035,2.54-i*.043,2.30-i*.035,true);
      }
    });
    handrail(P,MK3,side*1.64,-2.33,-.05,2.18);
    for(const z of[-2.38,-1.14,.24])put('turretDetail',torus(.035,.011,10,6),side*1.03,2.565,z,Math.PI/2);
  }
  merkava3SmokeBanks(P);
  for(const [x,z]of[[-.42,-1.55],[.42,-1.45]]){
    P.addCupola('turret',cylY(.303,.10,28),x,2.612+MK3.ground-MK3.y,z-MK3.center-MK3.z);
    put('turretDetail',box(.21,.027,.042),x,2.675,z+.10);
  }
  put('turretDetail',cylY(.171,.27,24),-.41,2.711,-.98);
  put('turretDark',box(.27,.15,.017),-.41,2.746,-.80);
  put('turretGlass',box(.21,.095,.008),-.41,2.747,-.788);
  put('turretDetail',box(.42,.18,.37),-.91,2.529,-.34);
  put('turretDark',box(.31,.12,.02),-.91,2.537,-.14);
  put('turretGlass',box(.24,.083,.008),-.91,2.547,-.126);
  put('turretDetail',box(.81,.044,.66),.41,2.565,-2.43);
  for(let j=0;j<12;j++)put('turretDark',box(.74,.011,.020),.41,2.592,-2.71+j*.045);
  put('turretDetail',box(.56,.042,.46),-.79,2.560,-2.65);
  // Sloping basket floor and open braces are separate from its stored links.
  // The source rear rail is lower than its forward mounting plane.
  for(const side of[-1,1]){
    cageBar(P,MK3,[side*1.04,2.3847,-4.10],[side*1.04,2.55,-3.115]);
    cageBar(P,MK3,[side*1.04,2.024,-4.10],[side*1.04,2.118,-3.115]);
    for(let j=0;j<6;j++){
      const z=-4.07+j*.165,y=2.39+(z+4.10)*.168;
      cageBar(P,MK3,[side*1.04,2.024+(z+4.1)*.095,z],[side*1.04,y,z+.16]);
    }
    cageBar(P,MK3,[side*1.04,2.06,-4.02],[side*1.61,2.145,-2.30]);
    cageBar(P,MK3,[side*1.04,2.04,-3.99],[side*1.63,2.11,-2.60]);
  }
  for(let j=0;j<5;j++)put('turretOpenLattice',box(2.08,.024,.024),0,2.04+j*.084,-4.10);
  P.add('turretDetail',sectionSolid([
    {z:-3.912-MK3.center-MK3.z,ring:[[-1.04,2.024+MK3.ground-MK3.y],[1.04,2.024+MK3.ground-MK3.y],[1.04,2.038+MK3.ground-MK3.y],[-1.04,2.038+MK3.ground-MK3.y]]},
    {z:-3.135-MK3.center-MK3.z,ring:[[-1.04,2.118+MK3.ground-MK3.y],[1.04,2.118+MK3.ground-MK3.y],[1.04,2.132+MK3.ground-MK3.y],[-1.04,2.132+MK3.ground-MK3.y]]},
  ]));
  for(const [x,y,z]of[[.354,2.14,-3.727],[.354,2.162,-3.576],[-.446,2.13,-3.805],[-.446,2.152,-3.655]]){
    put('turretDetail',box(.64,.15,.18),x,y,z,.145);
    for(const dx of[-.21,0,.21])put('turretDark',box(.065,.04,.188),x+dx,y+.036,z,.145);
  }
  chainCurtain(P,MK3,-4.04,1.04,2.06,.10);
  // Measured mounting flange, lower neck and spring base seat the whip on
  // the actual turret roof; none of these sections is suspended in space.
  put('turretDetail',box(.1565,.0242,.1565),.21147,2.5174,-3.1848);
  put('turretDetail',cylY(.0496,.1051,16),.21144,2.58133,-3.18473);
  put('turretDetail',cylY(.02725,.22533,14),.21147,2.74652,-3.18475);
  put('turretDark',cylY(.0055,2.28859,8),.21147,3.994055,-3.18475);
  // Source right MAG pedestal: roof foot, vertical neck and forward cantilever.
  // The receiver retains its measured firing height, with an actual load path.
  put('turretDetail',box(.2808,.1189,.1135),1.0387,2.48885,-1.20835);
  put('turretDetail',cylY(.04055,.095,14),1.12405,2.5893,-1.20765);
  put('turretDetail',cylY(.06675,.010,14),1.12405,2.63675,-1.20765);
  put('turretDetail',cylY(.04465,.073,14),1.12405,2.674,-1.20765);
  put('turretDetail',box(.0581,.058,.5552),1.12405,2.7177,-.9707);
  put('turretDetail',box(.0581,.080,.091),1.12405,2.7567,-.7215);
  put('turretDetail',box(.0581,.052,.130),1.112,2.7758,-.6635);
  for(const [x,y,z,cls,scale]of[[-.87,2.6619,-.91,'mag',.96],[1.12405,2.7498,-.61,'mag',.8667]] as const){
    const mg=FITTINGS.pintleMG({mats:P.mats,cls,scale,seed:330+Math.round(x*10),tone:'two-tone',ammo:true,shield:false,ring:false});
    mg.position.set(x,y+MK3.ground-MK3.y,z-MK3.center-MK3.z);P.turretG.add(mg);
  }
}

function merkava3Shell(): THREE.BufferGeometry {
  // Source Mk3D's forward left shoulder drops beside the gunner's berth;
  // the right armor cheek stays high. Preserve that asymmetry in the body.
  return sectionSolid([
    // world z, left/right envelope, keel, left/right roof half-width,
    // left/right roof height, ridge, left drop, left/right shoulder height.
    [-3.054,1.04,1.04,2.065,.85,.85,2.52,2.52,2.54,2.49,2.27,2.27],
    [-2.50,1.30,1.26,2.05,1.05,1.04,2.572,2.572,2.572,2.54,2.42,2.40],
    [-1.90,1.72,1.71,1.88,1.18,1.18,2.57,2.57,2.572,2.54,2.34,2.34],
    [-.90,1.875,1.87,1.82,1.14,1.14,2.545,2.54,2.572,2.51,2.23,2.24],
    [-.10,1.82,1.825,1.80,.60,1.02,2.55,2.48,2.61,2.28,2.12,2.26],
    [.60,1.35,1.56,1.80,.30,.90,2.53,2.433,2.565,2.31,2.04,2.19],
    [1.10,1.20,1.32,1.80,.30,.86,2.42,2.35,2.46,2.13,1.92,2.11],
    [1.60,.72,.80,1.82,.24,.60,2.26,2.30,2.34,2.08,1.91,2.06],
    [1.85,.31,.41,1.86,.21,.25,2.19,2.19,2.21,2.12,1.99,1.99],
  ].map(([z,left,right,low,roofL,roofR,highL,highR,ridge,drop,edgeL,edgeR])=>({
    z:z-MK3.z,ring:[
      [-left+.04,low-MK3.y],[right-.04,low-MK3.y],[right,low+.04-MK3.y],
      [right-.08,edgeR-MK3.y],[roofR,highR-MK3.y],[0,ridge-MK3.y],
      [-roofL,highL-MK3.y],[-roofL-.04,drop-MK3.y],
      [-left+.08,edgeL-MK3.y],[-left,low+.04-MK3.y],
    ],
  })));
}

export function buildMerkava3DX(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(0,MK3.y,MK3.z);
  P.gunG.position.set(0,2.0898-MK3.y,1.4258-MK3.z);
  P.add('hull',sectionSolid([
    bodyStation(-3.69,1.835,1.62,.93,MK3,1.10),bodyStation(-2.96,1.865,1.734,.405,MK3,1.10),
    bodyStation(-2.21,1.865,1.687,.405,MK3,1.10),bodyStation(.58,1.865,1.687,.405,MK3,1.10),
    bodyStation(2.18,1.865,1.49,.43,MK3,1.10),bodyStation(2.69,1.865,1.44,.48,MK3,1.10,.035),
    bodyStation(3.18,1.865,1.42,.73,MK3,1.10,.035),bodyStation(3.556,1.08,1.10,.96,MK3,.99,.025),
  ]));
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.371,wheelW:.38,wheelY:.446,xc:1.532,
    wheelZs:MERKAVA3D_X_DATUMS.wheelStations.map(z=>z-MK3.center),trackW:.637,trackTh:.068,
    sprocket:{z:3.040-MK3.center,y:.874,r:.350},idler:{z:-3.365-MK3.center,y:.844,r:.342},
    topY:1.230,botY:.0976,paintedEnds:true,arms:true,coveredTop:true});
  merkava3HullDetails(P);
  P.add('turret',merkava3Shell());
  P.add('turret',cylY(1.07,.23,40),0,.09,0);
  merkava3TurretDetails(P);
  P.add('gunMount',sectionSolid([
    {z:-.40,ring:[[-.31,-.27],[.40,-.27],[.40,.54],[-.31,.54]]},
    {z:.18,ring:[[-.31,-.27],[.40,-.27],[.40,.51],[-.31,.51]]},
    {z:.43,ring:[[-.20,-.15],[.20,-.15],[.20,.20],[-.20,.20]]},
  ]));
  KIT.buildGun(P,{len:3.4302,r:.08485,baseR:.14,sleeve:true,evac:.43,evacR:2.0,collar:true});
  const coax=FITTINGS.pintleMG({mats:P.mats,cls:'m2',scale:1.073,seed:333,tone:'two-tone',ammo:true,shield:false,ring:false});
  coax.position.set(.17,.2967,-.16);P.gunG.add(coax);
  P.muzzleZ=3.4302;P.topY=3.04-MK3.y;
  P.hullG.userData.xRebuild={candidate:'merkava3d_x',independent:true,datumVersion:1,sourceLocalOnly:true};
}

function merkava4HullDetails(P: TankBuilderPort): void {
  for(const side of[-1,1]){
    for(let i=0;i<8;i++){
      const z=-2.98+i*.75,hem=.65+(i%2)*.018;
      P.add('hull',box(.07,1.25-hem,.733),side*1.8384,(1.25+hem)/2,z+.366);
      P.addEquipment('hullDetail',box(.035,.045,.16),side*1.8709449,1.228,z+.20);
      for(const at of[z+.10,z+.63])P.addEquipment('hullDark',cylX(.016,.023,8),side*1.8769449,1.196,at);
    }
    // The source fender descends to the beak. A level raised guard made the
    // draft 14–22 cm too high at the bow. The 20 mm skin has only a modest
    // local crown for the native animated sprocket wrap, not a lifted nose.
    P.addMudguard('merkava4-x-front-guard','hull',sectionSolid([
      [2.78,1.351,1.316,1.81],[3.0,1.295,1.285,1.79],
      [3.15,1.250,1.250,1.77],[3.30,1.235,1.235,1.77],
      [3.45,1.219,1.219,1.77],[3.60,1.115,1.115,1.77],
      [3.76,1.048,1.048,1.77],
    ].map(([z,innerY,outerY,outer])=>{
      const ring: [number,number][]=[[1.04,innerY-.020],[outer,outerY-.020],[outer,outerY],[1.04,innerY]];
      return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    })));
    P.addMudguard('merkava4-x-front-flap','hullRubber',box(.57,.235,.045),side*1.44,.928,3.76,-.13);
    P.addMudguard('merkava4-x-rear-flap','hullRubber',box(.58,.45,.043),side*1.45,.92,-3.56,.09);
    P.addEquipment('hullDetail',box(.66,.36,.35),side*.66,1.37,-3.69);
    for(const z of[-3.49,3.50])P.addEquipment('hullDetail',torus(.065,.019,12,6),side*.67,.79,z);
    // Measured paired glacis tow lugs, with transverse pins and open eyes.
    for(const x of[.930,1.010])P.addEquipment('hullDetail',box(.033,.065,.105),side*x,1.1875,3.3065);
    P.addEquipment('hullDetail',cylX(.020,.117,16),side*.970,1.185,3.322);
    P.addEquipment('hullDetail',torus(.044,.0145,16,8),side*.970,1.1925,3.373,0,Math.PI/2);
    P.addEquipment('hullDark',box(.24,.15,.07),side*1.48,1.414,2.80);
    P.addEquipment('hullGlass',box(.17,.082,.010),side*1.48,1.420,2.840);
    P.addEquipment('hullDetail',box(.125,.025,.23),side*1.80,1.199,3.20);
    P.addEquipment('hullDetail',box(.025,.055,.15),side*1.773,1.220,3.16);
    P.addEquipment('hullDetail',cylY(.028,.1999,12),side*1.8237,1.30635,3.2452);
    P.addEquipment('hullDark',cylY(.0044,.555,8),side*1.8237,1.6743,3.2452);
  }
  P.addEquipment('hullDetail',orientedSlab(
    [-.204,1.388,2.719],[.186,1.388,2.719],[.186,1.277,3.230],[-.204,1.277,3.230],
    [-.204,1.410,2.719],[.186,1.410,2.719],[.186,1.300,3.230],[-.204,1.300,3.230],
  ));
  P.addEquipment('hullDetail',box(.366,.084,.163),-.009,1.404,2.6495);
  P.addEquipment('hullDark',box(.29,.050,.010),-.009,1.414,2.736);
  P.addEquipment('hullDetail',box(.384,.084,.092),-.009,1.258,3.177);
  merkava4EngineAccess(P);
}

function merkava4EngineAccess(P: TankBuilderPort): void {
  // The source access pack sits on the right, with a stepped sliding cover
  // and two separated hinge saddles. It is not a central radiator grille.
  P.addEquipment('hullDetail',box(.7399,.0211,.5017),.74765,1.62294,1.40051);
  P.addEquipment('hullDetail',box(.4980,.02477,.2301),.99953,1.64587,1.47904);
  P.addEquipment('hullDetail',box(.1883,.0081,.1883),1.18837,1.61714,1.53830);
  for(const x of[.5243,1.0121]){
    P.addEquipment('hullDetail',box(.1923,.00762,.1706),x,1.60096,1.68669);
    P.addEquipment('hullDetail',cylX(.0486,.1634,16),x,1.6534,1.6892);
    P.addEquipment('hullDetail',box(.12,.022,.075),x,1.615,1.724);
  }
  P.addEquipment('hullDetail',box(.2587,.008,.0965),.7682,1.601,1.734);
  P.addEquipment('hullDetail',cylX(.030,.193,16),.7682,1.6347,1.722);
  for(const [x,y,z]of[[-.1649,1.5758,2.0756],[.7694,1.3879,2.6885],[-.8750,1.3879,2.6885],
    [.9808,1.3376,2.889],[-.9808,1.3376,2.889]]){
    P.addEquipment('hullDetail',torus(.027,.010,14,6),x,y,z,1.273);
  }
}

function merkava4GunnerStation(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>topPart(P,MK4,slot,g,x,y,z,rx,ry,rz);
  put('turretDetail',box(.5507,.2593,.6035),-.40125,2.53105,-1.14625);
  put('turretDark',box(.29,.15,.024),-.40125,2.549,-.837);
  put('turretGlass',box(.22,.10,.010),-.40125,2.555,-.818);
  for(const x of[-.68255,-.12045]){
    put('turretDetail',box(.0481,.2014,.0352),x,2.5007,-1.6831);
    put('turretDetail',box(.0119,.1008,.456),x,2.6193,-1.4695);
  }
  for(const [x,z,w,d,ry]of[[-.79435,-1.1394,.0779,.2386,0],[-.00365,-1.15305,.0779,.2386,0],
    [-.689,-.842,.25,.05,-.7854],[-.1097,-.842,.25,.05,.7854],[-.399,-.7223,.2386,.0778,0]]){
    put('turretDetail',box(w,.0973,d),x,2.62765,z,0,ry);
  }
}

function merkava4Roof(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>topPart(P,MK4,slot,g,x,y,z,rx,ry,rz);
  P.addCupola('turret',cylY(.34,.25,8),-.635,2.550-MK4.y,.046-MK4.z);
  put('turretDetail',cylY(.31,.052,8),-.635,2.676,.046);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=-.635+Math.cos(a)*.31,z=.046+Math.sin(a)*.31;
    put('turretDark',box(.13,.063,.027),x,2.645,z,0,-a);
  }
  put('turretDetail',cylY(.23,.3015,24),.507,2.6823,-.516);
  put('turretDark',box(.26,.12,.016),.507,2.727,-.278);
  put('turretGlass',box(.20,.075,.009),.507,2.736,-.266);
  merkava4GunnerStation(P);
  put('turretDetail',box(1.10,.038,.60),.10,2.422,-2.13);
  for(let i=0;i<14;i++)put('turretDark',box(.43,.013,.024),-.20,2.449,-2.38+i*.035);
  for(const side of[-1,1]){
    handrail(P,MK4,side*1.23,-2.28,-.81,2.43);
    handrail(P,MK4,side*1.25,-3.30,-2.58,2.42);
    for(const [x,y,z]of[[1.114,2.415,.037],[1.041,2.418,.176],[.969,2.421,.319],[1.134,2.369,.219],[1.062,2.372,.354],[.988,2.375,.499]]){
      put('turretDetail',cylZ(.043,.42,14),side*(x+(side<0?-.055:0)),y,z,-.22,side*.46);
      put('turretDark',cylZ(.034,.016,14),side*(x+.090+(side<0?-.055:0)),y+.044,z+.184,-.22,side*.46);
    }
    for(const z of[-2.22,-.95,.55])put('turretDetail',torus(.035,.011,10,6),side*.89,2.415,z,Math.PI/2);
  }
  for(const [x,z,base,tip] of [
    [-.82038,-3.10476,2.6732,4.9327283],[.89347,-3.10476,2.6732,4.9327283],
    [-1.5179,-2.203,2.4419,4.70146],[1.674,-1.898,2.4004,4.6600],
  ]){
    put('turretDetail',cylY(.042,.17,12),x,base-.078,z);
    put('turretDark',cylY(.0047,tip-base-.020,8),x,(tip+base-.020)/2,z);
    put('turretDetail',new THREE.SphereGeometry(.020,8,6),x,tip-.020,z);
  }
  for(const x of[-.82038,.89347])put('turretDetail',box(.21,.29,.26),x,2.527,-3.015);
  merkava4Basket(P);
  const mg=FITTINGS.pintleMG({mats:P.mats,cls:'mag',scale:1.48,seed:444,tone:'two-tone',ammo:true,shield:false,ring:false});
  mg.position.set(-.83,2.577-MK4.y,-.752-MK4.z);P.turretG.add(mg);
}

function merkava4Basket(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number)=>topPart(P,MK4,slot,g,x,y,z);
  const backAt=(y:number)=>-3.626-(y-1.826)*.23;
  put('turretDetail',box(1.882,.009,.601),.022,1.8225,-3.3205);
  for(const y of[1.826,1.93,2.034,2.138,2.242,2.348]){
    put('turretOpenLattice',box(1.86,.024,.024),.022,y,backAt(y));
    for(const side of[-1,1]){
      cageBar(P,MK4,[side*.930+.022,y,backAt(y)],[side*1.167+.022,y,-3.015]);
      cageBar(P,MK4,[side*1.167+.022,y,-3.015],[side*1.58+.022,y,-1.98]);
    }
  }
  for(const side of[-1,1]){
    cageBar(P,MK4,[side*.930+.022,1.826,backAt(1.826)],[side*.930+.022,2.348,backAt(2.348)]);
    for(const [x,z]of[[1.167,-3.015],[1.40,-2.43],[1.58,-1.98]])
      cageBar(P,MK4,[side*x+.022,1.826,z],[side*x+.022,2.348,z]);
    for(let i=0;i<19;i++){
      const z=-3.61+i*.086,x=.944+(z+3.645)*.365;
      put('turretOpenLatticeDark',cylY(.009,.145,6),side*x+.022,1.735,z);
      put('turretOpenLattice',new THREE.SphereGeometry(.030,8,6),side*x+.022,1.647,z);
    }
  }
  chainCurtain(P,MK4,backAt(1.826),.930,1.826,.146);
}

function merkava4CoaxMount(P: TankBuilderPort): void {
  const put=(g:THREE.BufferGeometry,x:number,y:number,z:number)=>P.addEquipment('gunMount',g,x,y-1.9934619,z-1.93);
  // Source coax has a long receiver stock and an offset two-post cradle.
  // These parts move with the pitching mount, not with cannon recoil.
  put(box(.0742,.11095,.58784),.02212,2.59413,1.31816);
  put(box(.14716,.12013,.16549),.02212,2.59413,.94149);
  for(const x of[-.03881,.08305])put(cylZ(.02583,.25099,14),x,2.71433,.88842);
  put(box(.12537,.06696,.04155),.02212,2.69890,1.00530);
  put(box(.27459,.13384,.07214),.02212,2.32365,1.37610);
  put(cylY(.0226,.11067,14),.02212,2.36305,1.07010);
  put(box(.13742,.05403,.43933),.02212,2.41759,1.19975);
  put(cylY(.02061,.10961,14),.02212,2.46520,1.58029);
  put(box(.16092,.09972,.26879),.06785,2.47435,1.44589);
}

function merkava4Shell(): THREE.BufferGeometry {
  // Measured transverse shoulder sections replace the coarse triangular
  // applique slabs: the rim steepens outward and rolls down toward the bow.
  const stations=[
    [-3.018,1.18,1.812,2.23,1.12,2.401,1.05,2.401,.94,2.401,2.401],
    [-2.21,1.57,1.815,2.09,1.40,2.23,1.20,2.40,1.0,2.42,2.401],
    [-1.50,1.72,1.78,2.05,1.40,2.296,1.20,2.447,1.0,2.542,2.401],
    [-.80,1.752,1.73,1.997,1.40,2.262,1.20,2.423,1.0,2.526,2.401],
    [0,1.752,1.70,1.963,1.40,2.238,1.20,2.397,1.0,2.483,2.401],
    [.60,1.665,1.69,2.00,1.40,2.092,1.20,2.221,1.0,2.422,2.374],
    [1.0,1.451,1.72,2.00,1.40,2.018,1.20,2.091,1.0,2.22,2.321],
    [1.40,1.251,1.735,1.985,1.20,2.012,1.0,2.086,.882,2.213,2.213],
    [1.86,.977,1.75,1.99,.91,2.025,.80,2.087,.58,2.087,2.087],
    [2.08,.69,1.77,1.88,.63,1.93,.59,1.99,.54,1.99,1.99],
  ];
  return sectionSolid(stations.map(([z,half,low,edge,xm,ym,xu,yu,xr,yr,center])=>({
    z:z-MK4.z,ring:[
      [-half+.06,low-MK4.y],[half-.06,low-MK4.y],[half,low+.06-MK4.y],
      [half,edge-MK4.y],[xm,ym-MK4.y],[xu,yu-MK4.y],[xr,yr-MK4.y],
      [.88*xr,center-MK4.y],[-.88*xr,center-MK4.y],[-xr,yr-MK4.y],
      [-xu,yu-MK4.y],[-xm,ym-MK4.y],[-half,edge-MK4.y],[-half,low+.06-MK4.y],
    ],
  })));
}

function merkava4RearHullStations(): SolidSection[] {
  // Canonical-source rear shoulder: a low folded end, flat landing and
  // forward-rising deck. The former high crest at Z -3.36 made a false wing
  // below the correctly seated basket. These are independent section/plane
  // measurements, not source buffers. Retain the existing closed lower tub.
  const roofs: readonly (readonly [number,number])[]=[
    [-3.800,.993577],[-3.764838,1.180262],[-3.749848,1.224095],
    [-3.666707,1.224095],[-3.602664,1.533695],[-3.3645,1.533695],
    [-3.3640,1.556411],[-3.360,1.556735],[-2.700,1.610190],
    [-2.670,1.612620],[-2.640,1.601641],
  ];
  return roofs.map(([z,roof])=>{
    const floor=z < -3.36 ? .73+(.419-.73)*(z+3.80)/.44 : .419;
    return bodyStation(z,1.77,roof,floor,MK4,.97);
  });
}

function merkava4Hull(): THREE.BufferGeometry {
  const pieces=[sectionSolid([
    ...merkava4RearHullStations(),
    bodyStation(-2.00,1.77,1.604,.419,MK4,.97),bodyStation(1.963,1.77,1.604,.419,MK4,.97),
    bodyStation(2.80,1.77,1.347,.48,MK4,.97,.03),bodyStation(3.15,1.04,1.284,.59,MK4,.97,.03),
    bodyStation(3.31,1.04,1.255,.64,MK4,.97,.03),bodyStation(3.80,1.025,1.034,.96,MK4,.96,.02),
  ]),...merkava4RearFoldSolids()];
  const merged=mergeGeometries(pieces);
  for(const piece of pieces)piece.dispose();
  if(!merged)throw new Error('Merkava 4 rear hull primitives did not merge');
  return merged;
}

export function buildMerkava4X(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(0,MK4.y,MK4.z);
  P.gunG.position.set(0,1.9934619-MK4.y,1.93-MK4.z);
  P.add('hull',merkava4Hull());
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.3467,wheelW:.34,wheelY:.387,xc:1.444,
    wheelZs:[...MERKAVA4_X_DATUMS.wheelStations],trackW:.548,trackTh:.064,
    sprocket:{z:3.285,y:.761,r:.336},idler:{z:-3.020,y:.722,r:.314},
    topY:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true});
  merkava4HullDetails(P);
  P.add('turret',merkava4Shell());
  // The source has a raised asymmetric central roof, not one flat turtle
  // shell: its rear ledge is right of the gunner's lower optic berth and
  // broadens around the forward cupola before descending into the cheeks.
  P.add('turret',sectionSolid([
    [-1.62,-.05,1.10,2.542,2.365],[-.90,-.08,1.10,2.565,2.365],[-.68,-.90,1.00,2.553,2.365],
    [-.20,-.91,.95,2.528,2.365],[.20,-.387,.92,2.504,2.365],
    [.338,-.353,.882,2.489,2.30],[.846,-.802,.882,2.363,2.23],[1.983,-.845,.882,2.054,1.97],
  ].map(([z,xl,xr,top,bottom])=>({z:z-MK4.z,ring:[
    [xl,bottom-MK4.y],[xr,bottom-MK4.y],[xr,top-.02-MK4.y],
    [xr-.04,top-MK4.y],[xl+.04,top-MK4.y],[xl,top-.02-MK4.y],
  ]}))));
  P.add('turret',cylY(1.08,.16,40),0,.064,0);
  merkava4Roof(P);
  P.add('gunMount',sectionSolid([
    {z:-.40,ring:[[-.27,-.27],[.27,-.27],[.27,.25],[-.27,.25]]},
    {z:.20,ring:[[-.25,-.25],[.25,-.25],[.25,.24],[-.25,.24]]},
    {z:.39,ring:[[-.15,-.14],[.15,-.14],[.15,.16],[-.15,.16]]},
  ]));
  P.add('gun',cylZ(.104,2.49,24),0,0,1.395);
  P.add('gun',cylZ(.0811,.2155,24),0,0,2.74775);
  P.add('gun',cylZ(.156,.632,24),0,.0262,.886);
  P.add('gun',cylZ(.1395,.052,20),0,.0262,.6151);
  // Source clamp centers, eccentric clamp shells and their real top clasps.
  // Draft .085 m rings were buried inside the thermal sleeve and invisible.
  for(const worldZ of[3.2669,3.5715,3.876,4.1805,4.4851]){
    P.addEquipment('gun',cylZ(.1165,.042,24),0,.0076,worldZ-1.93);
    P.addEquipment('gun',box(.104,.020,.043),.013,.112,worldZ-1.93);
    P.addEquipment('gunDark',cylX(.010,.125,10),.013,.112,worldZ-1.93);
  }
  const coax=FITTINGS.pintleMG({mats:P.mats,cls:'m2',scale:1.10,seed:445,tone:'two-tone',ammo:false,shield:false,ring:false});
  coax.position.set(.0221,.26418,-.3127);P.gunG.add(coax);
  merkava4CoaxMount(P);
  P.muzzleZ=2.8755;P.topY=2.75-MK4.y;
  P.hullG.userData.xRebuild={candidate:'merkava4_x',independent:true,datumVersion:1,sourceLocalOnly:true};
}

export const MERKAVA_X_PROFILES = {
  merkava4_x: { build: buildMerkava4X }, merkava3d_x: { build: buildMerkava3DX },
} as const;
