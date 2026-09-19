// Independent first-party Merkava X constructions. Source archives are local
// comparison inputs only; neither builder calls an earlier Merkava profile.
import * as THREE from 'three';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { markEraHitFaces } from './eraHitFaces.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { merkava4RearFoldSolids } from './merkava4RearHull.ts';
import { addMerkavaXShoulderReturns } from './merkavaXShoulderReturns.ts';
import { addMerkava3dXFrontReturns } from './merkava3dXFrontReturn.ts';
import { addMerkava4XEndReturns } from './merkava4XEndReturns.ts';
import { merkavaXReturnRollers, lineMerkavaXUpperBand } from './merkavaXReturnRollers.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';

const { box, cylZ, cylX, torus } = KIT;
const cylY = (radius: number, height: number, segments: number): THREE.BufferGeometry =>
  KIT.cylY(radius, radius, height, segments);
type Frame = { y: number; z: number; ground: number; center: number };
const MK3: Frame = { y: 1.68034, z: -.72418, ground: .02034, center: -.2258175 };
const MK4: Frame = { y: 1.605, z: -.3906, ground: 0, center: 0 };
const NAMER: Frame = { y: 2.10, z: -1.15, ground: 0, center: 0 };

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

type LatticeSlot='turretOpenLattice'|'turretOpenLatticeDark';
function cageBar(P: TankBuilderPort, frame: Frame, a: [number,number,number], b: [number,number,number], width = .025, slot: LatticeSlot = 'turretOpenLattice'): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  const g=box(width,delta.length(),width).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
  const mid=start.add(end).multiplyScalar(.5);
  topPart(P,frame,slot,g,mid.x,mid.y,mid.z);
}

function chainCurtain(P: TankBuilderPort, frame: Frame, rear: number, half: number, railY: number, drop = .25): void {
  // Real separated rail-and-chain equipment; open space remains open.
  topPart(P,frame,'turretOpenLattice',box(half*2,.035,.035),0,railY,rear);
  for(let i=0;i<23;i++){
    const x=-half+.06+i*(half*2-.12)/22;
    topPart(P,frame,'turretOpenLatticeDark',cylY(.009,drop,6),x,railY-drop/2-.015,rear);
    // 2026-09-12: the balls are bare steel like their chains; painted spheres
    // read as a white picket fence under the bustle on every study.
    topPart(P,frame,'turretOpenLatticeDark',new THREE.SphereGeometry(.030,8,6),x,railY-drop-.033,rear);
  }
}

function hullBar(P: TankBuilderPort, a: [number,number,number], b: [number,number,number], width = .025, slot = 'hullDark'): void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  const g=box(width,delta.length(),width).applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
  const mid=start.add(end).multiplyScalar(.5);
  P.addEquipment(slot,g,mid.x,mid.y,mid.z);
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
    P.addEquipment('hullGlass',markVehicleNightLens(box(.13,.11,.010), 'headlight'),side*1.55,1.575,z+.124-MK3.center);
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

function addMerkava3dRightCheekModule(P: TankBuilderPort): void {
  // The supplied display tree leaves the vehicle-right (+X) Dor-Dalet cheek
  // course off the forward casting.  The naked shell is intentionally
  // asymmetric around the sight and gun tunnel, but the fielded Mk.3D wraps
  // that shell in fourth-generation modular side armor.  Keep the source
  // casting untouched and add the missing, independently closed module as
  // permanent structural armor.  World-space stations are converted into the
  // turret-local frame so the complete course follows turret yaw.
  const module = sectionSolid([
    {z:-.05-MK3.z,ring:[
      [.28,1.92-MK3.y],[1.82,1.90-MK3.y],
      [1.76,2.30-MK3.y],[.38,2.54-MK3.y],
    ]},
    {z:.65-MK3.z,ring:[
      [.24,1.91-MK3.y],[1.72,1.86-MK3.y],
      [1.66,2.27-MK3.y],[.34,2.52-MK3.y],
    ]},
    {z:1.30-MK3.z,ring:[
      [.18,1.90-MK3.y],[1.36,1.86-MK3.y],
      [1.28,2.18-MK3.y],[.28,2.37-MK3.y],
    ]},
  ]);
  // This is passive Dor-Dalet composite, not one of the three depleted ERA
  // cassettes authored below. Keep it in the permanent turret hit shell so a
  // right-side ERA strike cannot erase the repaired silhouette.
  P.add('turret', module);
  P.turretG.userData.merkava3dRightCheekReceipt = Object.freeze({
    side: '+X',
    configuration: 'Dor-Dalet modular forward cheek course',
    stationWorldZ: Object.freeze([-.05,.65,1.30]),
    outerWorldX: Object.freeze([1.82,1.72,1.36]),
  });
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
  P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{style:'rubber',wheelR:.371,wheelW:.38,wheelY:.446,xc:1.532,
    wheelZs:MERKAVA3D_X_DATUMS.wheelStations.map(z=>z-MK3.center),trackW:.637,trackTh:.068,
    sprocket:{z:3.040-MK3.center,y:.874,r:.350},idler:{z:-3.365-MK3.center,y:.844,r:.342},
    // Inferred supports occupy existing axle gaps at full suspension stroke.
    topY:1.230,botY:.0976,paintedEnds:true,arms:true,coveredTop:true},[-1.8821825,-.8756825,.9765675,1.8323175],1.075,.25,.0027));
  merkava3HullDetails(P);
  addMerkavaXShoulderReturns(P, 'merkava3d_x');
  addMerkava3dXFrontReturns(P);
  P.add('turret',merkava3Shell());
  P.add('turret',cylY(1.07,.23,40),0,.09,0);
  addMerkava3dRightCheekModule(P);
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
    P.addEquipment('hullGlass',markVehicleNightLens(box(.17,.082,.010), 'headlight'),side*1.48,1.420,2.840);
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

function merkava4BarakRoof(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>topPart(P,MK4,slot,g,x,y,z,rx,ry,rz);
  // Barak does not read as the older Mk.4 roof with another optic glued on.
  // Keep the crew openings low, close the rear bustle with equipment cases,
  // and leave the tall silhouette to the two measured rear aerials.
  P.addCupola('turret',cylY(.36,.11,10),-.58,2.545-MK4.y,.04-MK4.z);
  put('turretDetail',cylY(.31,.045,10),-.58,2.615,.04);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=-.58+Math.cos(a)*.315,z=.04+Math.sin(a)*.315;
    put('turretGlass',box(.115,.052,.018),x,2.604,z,0,-a);
  }
  put('turretDetail',sectionSolid([
    {z:-1.64-MK4.z,ring:[[-.82,2.35-MK4.y],[.92,2.35-MK4.y],[.84,2.51-MK4.y],[-.72,2.51-MK4.y]]},
    {z:-.73-MK4.z,ring:[[-.90,2.35-MK4.y],[.98,2.35-MK4.y],[.88,2.55-MK4.y],[-.78,2.55-MK4.y]]},
  ]),0,0,0);
  for(const side of[-1,1]){
    handrail(P,MK4,side*1.18,-2.06,-.88,2.38);
    // Six-tube banks remain tucked below the new sensor crown rather than
    // becoming the dominant high furniture of the older roof package.
    for(let row=0;row<2;row++)for(let i=0;i<3;i++)
      put('turretDark',cylZ(.036,.34,12),side*(1.05+i*.09),2.34+row*.08,.26-i*.07,-.20,side*.46);
  }
  put('turretDetail',box(.58,.14,.74),-.98,2.47,-1.58);
  put('turretDark',box(.46,.09,.025),-.98,2.51,-1.19);
  put('turretGlass',box(.34,.065,.012),-.98,2.515,-1.174);
}

function merkava4Roof(P: TankBuilderPort, candidate: 'merkava4_x'|'merkava4_trophy'|'merkava4_barak'): void {
  if(candidate==='merkava4_barak'){
    merkava4BarakRoof(P);
    return;
  }
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
    if(candidate==='merkava4_trophy')
      put('turretDetail',box(.29,.24,.59),side*1.06,2.45,.285,0,0,side*.08);
  }
  if(candidate==='merkava4_trophy'){
    type WhipStation=readonly [number,number,number,number];
    const taperedWhip=(stations: readonly WhipStation[])=>{
      for(let i=1;i<stations.length;i++){
        const a=stations[i-1],b=stations[i];
        const start=new THREE.Vector3(a[0],a[1],a[2]);
        const end=new THREE.Vector3(b[0],b[1],b[2]);
        const delta=end.clone().sub(start);
        const rotation=new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0,1,0),delta.clone().normalize());
        // Calipers record diameters. A true frustum preserves both endpoint
        // sections; a midpoint-width square bar overfilled every taper.
        const g=KIT.cylY(b[3]/2,a[3]/2,delta.length(),10)
          .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
        const mid=start.add(end).multiplyScalar(.5);
        topPart(P,MK4,'turretOpenLatticeDark',g,mid.x,mid.y,mid.z);
      }
    };
    // Exact horizontal source calipers: the five long aerials curve aft and
    // taper from broad spring feet to 9 mm tips. Fixed-Z cylinders collapsed
    // that swept stock and produced the wrong source-only p95 silhouette.
    const rearCurve=[
      [2.20,0,-3.2051,.152],[2.50,.003,-3.2251,.076],[3.00,.0085,-3.2285,.023],
      [3.50,.0123,-3.2441,.0187],[4.00,.0182,-3.2676,.0143],
      [4.18,.0215,-3.2806,.0127],[4.40,.0256,-3.2965,.0107],[4.6617,.0293,-3.3193,.0090],
    ] as const;
    for(const baseX of[-.9973,-.1703,1.0052])
      taperedWhip(rearCurve.map(([y,dx,z,w])=>[baseX+dx,y,z,w] as const));
    taperedWhip([
      [-1.5512,2.20,-2.3373,.0763],[-1.5485,2.50,-2.3369,.0254],[-1.5466,3.00,-2.3453,.0210],
      [-1.5413,3.50,-2.3670,.0166],[-1.5336,4.00,-2.3975,.0122],[-1.5302,4.18,-2.4105,.0105],
      [-1.5262,4.40,-2.4264,.0085],[-1.5278,4.4153,-2.4233,.0085],
    ]);
    taperedWhip([
      [1.6441,2.20,-2.0386,.0763],[1.6468,2.50,-2.0387,.0253],[1.6488,3.00,-2.0477,.0208],
      [1.6542,3.50,-2.0694,.0164],[1.6621,4.00,-2.1006,.0120],[1.6654,4.18,-2.1136,.0103],
      [1.6677,4.30,-2.1223,.0092],[1.6674,4.3930,-2.1248,.0085],
    ]);
    // The two short spring aerials share the same source taper vocabulary.
    taperedWhip([[1.2864,2.20,-2.9316,.206],[1.3221,2.50,-2.9558,.099],[1.3213,2.5613,-2.9558,.080]]);
    taperedWhip([[-1.2595,2.20,-3.0139,.206],[-1.2952,2.50,-3.0381,.099],[-1.2944,2.5926,-3.0381,.080]]);
  }else for(const [x,z,base,tip] of [
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
  put('turretPaintedDetail',markFixedPaintedPanel(box(1.882,.009,.601),'merkava4-x-basket-floor','turretDetail'),.022,1.8225,-3.3205);
  // 2026-09-12 fleet visual standard: the real basket is a painted frame
  // closed with dark welded mesh; six identical painted rails read as louvres
  // on every study. The frame (floor and top rails, corner and door posts)
  // stays painted at .024; the four intermediate courses are thin dark mesh
  // strands and dark verticals close each panel about every 0.31 m. Every
  // rail height, corner station and the basket floor are unchanged.
  const Y0=1.826,Y1=2.348,MESH=.011,DARK:LatticeSlot='turretOpenLatticeDark';
  for(const y of[Y0,1.93,2.034,2.138,2.242,Y1]){
    const frame=y===Y0||y===Y1,slot:LatticeSlot=frame?'turretOpenLattice':DARK,w=frame?.024:MESH;
    put(slot,box(1.86,w,w),.022,y,backAt(y));
    for(const side of[-1,1]){
      cageBar(P,MK4,[side*.930+.022,y,backAt(y)],[side*1.167+.022,y,-3.015],w,slot);
      cageBar(P,MK4,[side*1.167+.022,y,-3.015],[side*1.58+.022,y,-1.98],w,slot);
    }
  }
  for(const x of[-.62,-.31,0,.31,.62])
    cageBar(P,MK4,[x+.022,Y0,backAt(Y0)],[x+.022,Y1,backAt(Y1)],MESH,DARK);
  for(const side of[-1,1]){
    cageBar(P,MK4,[side*.930+.022,Y0,backAt(Y0)],[side*.930+.022,Y1,backAt(Y1)]);
    for(const [x,z]of[[1.167,-3.015],[1.40,-2.43],[1.58,-1.98]])
      cageBar(P,MK4,[side*x+.022,Y0,z],[side*x+.022,Y1,z]);
    // Mesh verticals on the two slanted side panels: the front panel between
    // the corner post and the door post, and the long panel to the shoulder.
    for(const t of[.5])cageBar(P,MK4,
      [side*(.930+t*(1.167-.930))+.022,Y0,backAt(Y0)+t*(-3.015-backAt(Y0))],
      [side*(.930+t*(1.167-.930))+.022,Y1,backAt(Y1)+t*(-3.015-backAt(Y1))],MESH,DARK);
    for(const t of[.25,.5,.75])cageBar(P,MK4,
      [side*(1.167+t*(1.58-1.167))+.022,Y0,-3.015+t*(-1.98+3.015)],
      [side*(1.167+t*(1.58-1.167))+.022,Y1,-3.015+t*(-1.98+3.015)],MESH,DARK);
    for(let i=0;i<19;i++){
      const z=-3.61+i*.086,x=.944+(z+3.645)*.365;
      put('turretOpenLatticeDark',cylY(.009,.145,6),side*x+.022,1.735,z);
      put('turretOpenLatticeDark',new THREE.SphereGeometry(.030,8,6),side*x+.022,1.647,z);
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

type TrophyConfiguration = 'mk4'|'barak'|'namer';
function addTrophySuite(P: TankBuilderPort, frame: Frame, configuration: TrophyConfiguration): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>
    topPart(P,frame,slot,g,x,y,z,rx,ry,rz);
  const roof=configuration==='namer'?2.48:2.55;
  // The supplied non-Barak Mark IV carries conspicuously outboard Trophy
  // housings; Barak's later installation stays inside the turret envelope.
  const sideX=configuration==='namer'?1.25:configuration==='mk4'?1.78:1.55;
  const frontZ=configuration==='namer'?0:configuration==='mk4'?-.55:-.18;
  const rearZ=configuration==='namer'?-2.55:configuration==='mk4'?-2.90:-2.18;
  for(const side of[-1,1]){
    // Trophy radar faces are dark, slightly canted plates on actual armored
    // pedestals.  They are sensors, not unexplained passive-armor thickness.
    for(const z of[frontZ,rearZ]){
      if(configuration==='mk4')put('turretDetail',sectionSolid([
        {z:-.33,ring:[[-.12,-.30],[.12,-.30],[.12,.22],[0,.37],[-.12,.22]]},
        {z:.33,ring:[[-.12,-.37],[.12,-.37],[.12,.22],[0,.32],[-.12,.22]]},
      ]),side*1.66,2.07,z,0,0,side*.16);
      put('turretDetail',box(.18,.31,.42),side*(sideX-.07),roof-.20,z,0,0,side*.16);
      // Radar faces are black ceramic panels inside a thick armored brow. A
      // full-height blue glass slab made the Namer look like a sci-fi tank
      // and erased the stepped Trophy housing in the native-material view.
      put('turretDark',box(.022,.245,.335),side*sideX,roof-.20,z,0,0,side*.16);
      for(const dy of[-.142,.142])put('turretDetail',box(.035,.035,.40),side*(sideX+.004),roof-.20+dy,z,0,0,side*.16);
      for(const dz of[-.19,.19])put('turretDetail',box(.035,.31,.035),side*(sideX+.004),roof-.20,z+dz,0,0,side*.16);
    }
    const launcherZ=(frontZ+rearZ)*.5;
    put('turretDetail',box(.28,.20,.36),side*(sideX-.16),roof+.02,launcherZ);
    for(let row=0;row<2;row++)for(let i=0;i<3;i++)
      put('turretDark',cylZ(.033,.20,12),side*(sideX-.16)+(i-1)*.075,roof+.055+row*.075,launcherZ+.14,0,side*.12);
  }
  if(configuration==='mk4')put('turretDetail',box(1.30,.10,.50),0,2.48,-2.30);
  P.turretG.userData.trophySuiteReceipt=Object.freeze({configuration,radarFaces:4,launchers:2,owner:'rig_turret'});
}

function addTrophyGlacisSignature(P: TankBuilderPort): void {
  // The older Trophy-equipped Mk.4 keeps the workmanlike bow hardware that
  // separates it from Barak's cleaner sensor-led face: guarded lamps, large
  // towing eyes, a central access cover and two visibly seated cable runs.
  P.addEquipment('hullDetail',box(.62,.045,.48),0,1.30,2.61,-.18);
  for(const side of[-1,1]){
    P.addEquipment('hullDetail',box(.34,.22,.24),side*1.36,1.24,2.77,-.15,side*.08);
    P.addEquipment('hullGlass',markVehicleNightLens(box(.19,.10,.026),'headlight'),side*1.36,1.27,2.91,-.15,side*.08);
    for(const x of[side*.73,side*1.02])
      P.addEquipment('hullDetail',torus(.072,.023,18,8),x,.91,3.53,Math.PI/2);
    hullBar(P,[side*.76,1.31,2.15],[side*.94,1.13,2.70],.032);
    hullBar(P,[side*.94,1.13,2.70],[side*.78,.96,3.25],.032);
  }
}

function addBarakSensorSuite(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>
    topPart(P,MK4,slot,g,x,y,z,rx,ry,rz);
  // Barak retains Mk.4 mobility/firepower and is distinguished by its closed-
  // hatch awareness and target-processing hardware.  The panoramic head and
  // four camera clusters are physically seated on the roof/perimeter.
  put('turretDetail',cylY(.27,.20,8),.50,2.72,-.47);
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    put('turretGlass',box(.22,.075,.014),.50+Math.sin(a)*.255,2.74,-.47+Math.cos(a)*.255,0,a);
  }
  put('turretDetail',box(.38,.08,.38),.50,2.60,-.47);
  // Low transverse IronVision brow: a strong horizontal read, unlike the
  // older Trophy vehicle's tall outboard radar pylons and cupola forest.
  put('turretDetail',box(1.36,.15,.25),.04,2.57,.39);
  for(const x of[-.48,-.16,.16,.48])
    put('turretGlass',box(.20,.068,.014),x,2.585,.522);
  for(const [x,z,ry]of[[0,1.05,0],[0,-2.58,Math.PI],[1.43,-.72,Math.PI/2],[-1.43,-.72,-Math.PI/2]] as const){
    put('turretDetail',box(.27,.17,.19),x,2.53,z,0,ry);
    put('turretGlass',box(.17,.085,.012),x,2.55,z+(Math.abs(ry)<.1?.101:0),0,ry);
  }
  // Source Object_26 resolves into two independent rear whip assemblies at
  // x ±1.03, z -3.63, each seated at y 2.60 and reaching y 5.66.  Instance
  // the identical authored whip primitive: it remains turret-owned while the
  // parent audit correctly evaluates the casting rather than antenna extents.
  const whips=new THREE.InstancedMesh(cylY(.012,3.06,8),P.mats.dark,2);
  whips.name='barakRearWhips';
  for(const [index,side]of[-1,1].entries()){
    // The source aerial feet rise from the near-upright rear equipment wall;
    // diagonal braces here produced a false high triangular tail in profile.
    cageBar(P,MK4,[side*1.025,1.98,-3.57],[side*1.025,2.60,-3.63],.050);
    put('turretDetail',cylY(.052,.13,12),side*1.025,2.64,-3.63);
    const pose=new THREE.Object3D();
    pose.position.set(side*1.025,4.13-MK4.y,-3.63-MK4.z);
    pose.updateMatrix();whips.setMatrixAt(index,pose.matrix);
  }
  whips.instanceMatrix.needsUpdate=true;P.turretG.add(whips);
  P.turretG.userData.barakSensorReceipt=Object.freeze({panoramicHead:true,ironVisionCameraClusters:4,owner:'rig_turret'});
}

function addBarakTurretArmor(P: TankBuilderPort): void {
  // The later turret carries a visibly different modular cheek course and a
  // clean roof-to-bustle transition. Separate closed plates preserve the
  // seams visible in the source without copying any source triangles.
  for(const side of[-1,1]){
    for(let i=0;i<3;i++){
      const rear=-1.72+i*.72,front=rear+.66;
      armorTile(P,MK4,side,rear,front,1.08,1.66-i*.08,1.00,1.55-i*.13,
        2.46-i*.015,2.18-i*.04,2.42-i*.03,2.12-i*.06);
    }
  }
  topPart(P,MK4,'turretDetail',box(3.18,.18,.32),0,2.51,-1.46);
  for(const x of[-1.28,-.85,-.42,0,.42,.85,1.28])
    topPart(P,MK4,'turretDark',box(.22,.075,.018),x,2.55,-1.291);
  topPart(P,MK4,'turretDetail',box(1.76,.10,.50),.06,2.39,-2.05);
  for(const x of[-.62,-.31,0,.31,.62])
    topPart(P,MK4,'turretDark',box(.018,.11,.46),x+.06,2.39,-2.05);
}

function addBarakHullSignature(P: TankBuilderPort): void {
  // Barak source has a clean, deep side protection run. Deliberate panel
  // joints make it read independently from both the clean Mk.4 and the much
  // wider Trophy study while retaining a single physical armor course.
  for(const side of[-1,1]){
    P.addExternalArmor('hull',box(.12,.82,6.10),side*1.78,1.10,-.30);
    for(const z of[-2.75,-2.00,-1.25,-.50,.25,1.00,1.75,2.50])
      P.addEquipment('hullDark',box(.012,.67,.032),side*1.847,1.08,z);
    // Barak's source has a conspicuous flexible side-retention run. Model it
    // as an open chain with real gaps instead of a solid rope or another
    // armor strip; this is the side-profile signature missing from the draft.
    for(let i=0;i<15;i++){
      const z=-2.72+i*.38,y=1.61+(i%2)*-.07;
      P.addEquipment('hullDark',torus(.047,.011,10,6),side*1.857,y,z,Math.PI/2);
      if(i<14)hullBar(P,[side*1.857,y,z+.045],[side*1.857,1.61+((i+1)%2)*-.07,z+.335],.009);
    }
  }
  // The supplied Barak's paired bow cables are silhouette-significant in
  // both side studies. Keep each run open in plan rather than using a closed
  // torus that falsely creates a sealed armor hole in the continuity scan.
  for(const side of[-1,1]){
    P.addEquipment('hullDetail',box(.12,.10,.12),side*.58,.94,3.50);
    const cable: [number,number,number][]=[
      [side*.58,.92,3.54],[side*.62,.66,3.78],[side*.58,.43,3.99],
      [side*.38,.39,4.05],[side*.24,.65,3.88],[side*.31,.83,3.62],
    ];
    for(let i=1;i<cable.length;i++)hullBar(P,cable[i-1],cable[i],.030);
  }
}

function addBarakRearStowage(P: TankBuilderPort): void {
  // Flattened source Object_27 is a many-island rear equipment pack occupying
  // x -1.42..1.48, y 1.67..2.01, z -3.57..-1.88 after registration. Rebuild
  // that occupied envelope as separate seated cases and a slim carrier so the
  // basket keeps honest gaps instead of becoming a copied/filled source slab.
  for(const x of[-1.34,1.34])topPart(P,MK4,'turretOpenLattice',box(.055,.055,1.50),x,1.72,-2.72);
  for(const z of[-3.38,-2.72,-2.06])topPart(P,MK4,'turretOpenLattice',box(2.68,.055,.055),0,1.72,z);
  // The source carrier terminates as a near-upright equipment wall at
  // z -3.60, y 1.68..2.03. Closing that measured case face removes the
  // triangular tail produced by the draft's short floating cases.
  topPart(P,MK4,'turretDetail',box(2.68,.34,.18),0,1.855,-3.50);
  for(const [x,w,d,z]of[[-1.08,.40,1.12,-2.77],[-.55,.46,1.24,-2.69],[0,.40,1.08,-2.80],[.53,.44,1.18,-2.66],[1.07,.39,1.10,-2.75]] as const){
    topPart(P,MK4,'turretDetail',box(w,.22,d),x,1.88,z);
    topPart(P,MK4,'turretDark',box(w-.08,.018,d-.12),x,2.00,z);
  }
}

function addBarakRearMissionModule(P: TankBuilderPort): void {
  // Barak's source upper body does not end at the clean Mk.4 basket line. Its
  // broad rear mission/electronics volume runs from z -3.60 to the crew roof,
  // climbing from a low service wall into the IronVision crown. Reconstruct
  // that measured silhouette as a closed, faceted body beneath the separate
  // stowage cases, leaving the whip aerials and sensor faces fully authored.
  const stations=[
    [-3.60,.95,1.68,2.45,.82],[-3.34,1.06,1.68,2.59,.92],
    [-2.76,1.22,1.70,2.52,1.08],[-2.16,1.46,1.72,2.56,1.25],
    [-1.56,1.60,1.73,2.62,1.36],[-.96,1.62,1.66,2.72,1.38],
  ] as const;
  P.add('turret',sectionSolid(stations.map(([z,half,floor,roof,roofHalf])=>({
    z:z-MK4.z,
    ring:[[-half,floor-MK4.y],[half,floor-MK4.y],[half,roof-.10-MK4.y],
      [roofHalf,roof-MK4.y],[-roofHalf,roof-MK4.y],[-half,roof-.10-MK4.y]],
  }))));
  for(const side of[-1,1]){
    const plate=(z:number,top:number): SolidSection=>{
      const ring: [number,number][]=[
        [1.3007,2.4288-MK4.y],[1.4447,2.4288-MK4.y],
        [1.4447,top-MK4.y],[1.3007,top-MK4.y],
      ];
      return {z:z-MK4.z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    };
    P.add('turret',sectionSolid([plate(-1.7401,2.66),plate(-1.1635,2.8892)]));
  }
  // Object_22 is one connected roof-weapon assembly in the source: a seated
  // square foot, an angled support, a narrow upright and the long receiver.
  // Emitting only the receiver left a detached island at turret yaw 90.
  topPart(P,MK4,'turretDetail',box(.2910,.1518,.2909),-.7176,2.6429,-.8552);
  cageBar(P,MK4,[-.75,2.57,-.86],[-.976,2.85,-.82],.055,'turretOpenLatticeDark');
  // The supported receiver and barrel are the real weapon stock. Register
  // those visible source-measured parts for the fitting census; do not add a
  // dummy marker or a second roof weapon.
  const roofWeapon=new THREE.Group();
  const weaponPart=(geometry: THREE.BufferGeometry,material: THREE.Material,
    x:number,y:number,z:number): void=>{
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;
    roofWeapon.add(mesh);
  };
  weaponPart(box(.0421,.1122,.4768),P.mats.detail,0,0,0);
  weaponPart(box(.0411,.0435,.7131),P.mats.dark,-.0005,.0198,.4932);
  FITTINGS.markExact(roofWeapon,'pintleMG');
  roofWeapon.position.set(-.9759,2.8967-MK4.y,-.9093-MK4.z);
  P.turretG.add(roofWeapon);
}

function addModernMerkavaRearClosure(P: TankBuilderPort, wideTrophySkirts: boolean, rearZ = -3.89): void {
  // Both supplied late-Mk.4 studies carry a deeper armored rear termination
  // than the clean baseline recipe. Keep it hull-owned so turret yaw cannot
  // drag the closure away from the chassis.
  P.addEquipment('hullDetail',box(3.20,.48,.18),0,1.22,rearZ);
  if(!wideTrophySkirts)return;
  for(const side of[-1,1]){
    // This supplied Mk.4 study carries a continuous outboard protection run
    // beneath the Trophy pedestals. Keep it a thin, seated external plate—not
    // a second track course or a duplicate hull shell.
    // Canonical source skirt envelope after its certified transform:
    // y .515..1.360, z -3.100..3.264. Keep the broad Trophy course on those
    // planes; the draft's 1.16 m-high aft-shifted slab polluted every side.
    P.addExternalArmor('hull',box(.30,.845,6.364),side*2.015,.938,.082);
    P.addExternalArmor('hull',box(.18,.12,6.30),side*1.80,1.37,.082);
    for(const z of[-2.85,-1.95,-1.05,-.15,.75,1.65,2.55])
      P.addEquipment('hullDark',box(.015,.82,.035),side*2.173,1.02,z);
  }
}

function addModernMerkavaEndGuards(P: TankBuilderPort, frontZ: number, rearZ: number, height: number): void {
  // The primary 7.60 m hull skin stays untouched. Substantial source end
  // guards extend the assembled side silhouette at both corners without
  // moving the certified axle course or pretending the fittings are hull.
  for(const side of[-1,1]){
    P.addEquipment('hullDetail',box(.26,height,frontZ-3.72),side*1.48,.80,(frontZ+3.72)/2);
    P.addEquipment('hullDetail',box(.30,height,-3.70-rearZ),side*1.45,1.10,(rearZ-3.70)/2);
  }
}

function addTrophyHullEndEquipment(P: TankBuilderPort): void {
  // Measured frontbowdetails and backbasquets are broad centreline fittings,
  // not a hidden extension of the 7.60 m primary hull skin.
  for(const side of[-1,1]){
    P.addEquipment('hullDetail',box(.0152,.4372,.6113),side*1.8102,1.0149,3.4646);
    P.addEquipment('hullDetail',box(.7925,.1732,.1023),side*1.4024,.9652,3.7907);
    P.addEquipment('hullDetail',box(.1494,.7005,.7005),side*.9457,.7839,3.2668);
    P.addEquipment('hullDetail',box(.0859,.2305,.2643),side*.6237,.8361,3.9220);
    // The source aft baskets are sheet-and-rail assemblies. Preserve their
    // open massing instead of filling the complete measured envelope.
    P.addEquipment('hullDetail',box(.6548,.5683,.0193),side*.6735,1.1689,-4.0437);
    P.addEquipment('hullDetail',box(.6548,.0164,.5430),side*.6735,.8716,-3.7692);
    P.addEquipment('hullDetail',box(.6694,.5074,.0385),side*.6747,1.2617,-3.5219);
    P.addEquipment('hullDetail',box(.6694,.1032,.5612),side*.6747,1.4898,-3.7785);
  }
}

function modernMerkavaGlacisCap(topDrop = 0, steepShoulder = true): THREE.BufferGeometry {
  // Both modern source families keep more shoulder height through the forward
  // engine deck than the clean Mk.4 study. This closed cap follows four
  // independently measured longitudinal stations; it is not a flat overlay.
  const shoulder: SolidSection[]=steepShoulder?[
    {z:1.45,ring:[[-1.70,1.56-topDrop],[1.70,1.56-topDrop],[1.70,1.72-topDrop],[-1.70,1.72-topDrop]]},
    {z:2.05,ring:[[-1.70,1.47-topDrop],[1.70,1.47-topDrop],[1.70,1.54-topDrop],[-1.70,1.54-topDrop]]},
  ]:[
    {z:1.85,ring:[[-1.70,1.56-topDrop],[1.70,1.56-topDrop],[1.70,1.66-topDrop],[-1.70,1.66-topDrop]]},
  ];
  return sectionSolid([
    ...shoulder,
    {z:2.75,ring:[[-1.70,1.30],[1.70,1.30],[1.70,1.52-topDrop],[-1.70,1.52-topDrop]]},
    {z:3.35,ring:[[-1.05,1.16],[1.05,1.16],[1.05,1.33-topDrop],[-1.05,1.33-topDrop]]},
    {z:3.72,ring:[[-1.02,1.00],[1.02,1.00],[1.02,1.12-topDrop],[-1.02,1.12-topDrop]]},
    {z:3.80,ring:[[-1.02,.98],[1.02,.98],[1.02,1.06-topDrop],[-1.02,1.06-topDrop]]},
  ]);
}

function trophyMerkavaGlacisCap(): THREE.BufferGeometry {
  // Trophy source sections keep the high engine-deck shoulder, then descend
  // onto the shared hull rather than carrying a second flat roof to the bow.
  // Exact source rays: y 1.396783 at z 2.637701, 1.362322 at z 2.75 and
  // 1.178201 at z 3.35.  The old generic cap was 136–168 mm too high there.
  return sectionSolid([
    // The Trophy hull rig is seated +.01 m, so these local ordinates are the
    // certified world sections above minus that authored source datum.
    {z:1.45,ring:[[-1.70,1.55],[1.70,1.55],[1.70,1.71],[-1.70,1.71]]},
    {z:2.05,ring:[[-1.70,1.46],[1.70,1.46],[1.70,1.53],[-1.70,1.53]]},
    {z:2.637701,ring:[[-1.70,1.33],[1.70,1.33],[1.70,1.386783],[-1.70,1.386783]]},
    {z:2.75,ring:[[-1.70,1.29],[1.70,1.29],[1.70,1.352322],[-1.70,1.352322]]},
    {z:3.35,ring:[[-1.05,1.15],[1.05,1.15],[1.05,1.168201],[-1.05,1.168201]]},
    {z:3.72,ring:[[-1.02,.99],[1.02,.99],[1.02,1.04],[-1.02,1.04]]},
    {z:3.80,ring:[[-1.02,.97],[1.02,.97],[1.02,1.00],[-1.02,1.00]]},
  ]);
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

function buildMerkava4Family(P: TankBuilderPort, candidate: 'merkava4_x'|'merkava4_trophy'|'merkava4_barak'): void {
  // The Trophy study's canonical ground recipe seats the complete assembly
  // 10 mm above the clean family datum; retain that measured registration.
  const sourceY=candidate==='merkava4_trophy'?.01:0;
  P.hullG.position.set(0,sourceY,0);P.turretG.position.set(0,MK4.y+sourceY,MK4.z);
  P.gunG.position.set(0,1.9934619-MK4.y,1.93-MK4.z);
  P.add('hull',merkava4Hull());
  if(candidate==='merkava4_trophy')P.add('hull',trophyMerkavaGlacisCap());
  const trophyGear=candidate==='merkava4_trophy';
  const barakGear=candidate==='merkava4_barak';
  const wheelZs=trophyGear?[-2.334,-1.566,-.494,.444,1.408,2.189]
    :barakGear?[-2.0557,-1.2559,-.2015,.7238,1.5850,2.3770]:[...MERKAVA4_X_DATUMS.wheelStations];
  const wheelR=trophyGear?.364:barakGear?.332:.3467;
  const wheelY=trophyGear?.398:barakGear?.3788:.387;
  P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{style:'rubber',wheelR,wheelW:.34,wheelY,xc:1.444,
    // LOW keeps the family shoe envelope with coarser relief; HIGH and the
    // established Mk.4 X retain their original native shoe construction.
    ...(!P.q && candidate!=='merkava4_x'?{trackShoeBuilder:buildFleetTrackShoe}:{}),
    wheelZs,trackW:.548,trackTh:.064,
    sprocket:trophyGear?{z:3.267,y:.787,r:.359}:barakGear?{z:3.2069,y:.830,r:.353}:{z:3.285,y:.761,r:.336},
    idler:trophyGear?{z:-3.119,y:.758,r:.355}:barakGear?{z:-2.9871,y:.7946,r:.333}:{z:-3.020,y:.722,r:.314},
    // Existing road axles stay fixed; supports sit between their swept wheels.
    // 4.7 mm seat: with the 19 mm heavy pins the rollers still meet the near-shoe stock within 2 mm (2026-09-17)
    topY:trophyGear?1.125:barakGear?1.145:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true},[-1.6645,-.733,.27,2.017],.945,.29,.0047,true));
  lineMerkavaXUpperBand(P,[-1.6645,-.733,.27,2.017],.0038);
  merkava4HullDetails(P);
  addMerkavaXShoulderReturns(P, 'merkava4_x');
  addMerkava4XEndReturns(P);
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
  merkava4Roof(P,candidate);
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
  if(candidate!=='merkava4_barak'){
    const coax=FITTINGS.pintleMG({mats:P.mats,cls:'m2',scale:1.10,seed:445,tone:'two-tone',ammo:false,shield:false,ring:false});
    coax.position.set(.0221,.26418,-.3127);P.gunG.add(coax);
  }
  if(candidate!=='merkava4_barak')merkava4CoaxMount(P);
  P.muzzleZ=2.8755;P.topY=2.75-MK4.y;
  if(candidate==='merkava4_trophy'){
    // The source lower hull closes at y .375, 44 mm below the clean family
    // shell. Rebuild that shallow belly plate directly instead of lowering
    // the whole vehicle and corrupting the measured wheel/track datums.
    P.add('hull',box(3.58,.044,7.55),0,.397,0);
    addTrophyHullEndEquipment(P);
    addModernMerkavaRearClosure(P,true);
    addTrophyGlacisSignature(P);
    addTrophySuite(P,MK4,'mk4');
  }
  if(candidate==='merkava4_barak'){
    addModernMerkavaEndGuards(P,4.03,-4.02,.74);
    addModernMerkavaRearClosure(P,false);
    addBarakHullSignature(P);
    addBarakTurretArmor(P);
    addBarakRearMissionModule(P);
    addTrophySuite(P,MK4,'barak');
    addBarakSensorSuite(P);
    addBarakRearStowage(P);
    // Certified source width is 3.72 m. Keep the independently authored
    // turret unchanged while pulling the Mk.4 running-gear/hull course into
    // Barak's visibly tighter side envelope.
    P.hullG.scale.x=.972;
  }
  P.hullG.userData.xRebuild={candidate,independent:candidate==='merkava4_x',familyRecipe:'merkava4-first-party',datumVersion:1,sourceLocalOnly:true};
}

export function buildMerkava4X(P: TankBuilderPort): void { buildMerkava4Family(P,'merkava4_x'); }
export function buildMerkava4Trophy(P: TankBuilderPort): void { buildMerkava4Family(P,'merkava4_trophy'); }
export function buildMerkava4Barak(P: TankBuilderPort): void { buildMerkava4Family(P,'merkava4_barak'); }

function namerSuperstructure(): THREE.BufferGeometry {
  // The troop compartment grows out of the Mk.4 chassis as one closed volume.
  // Its rear ramp remains a surface detail; the structural rear wall behind it
  // prevents a fake hollow box when the ramp is viewed obliquely.
  const rows=[
    [-3.63,1.69,1.30,1.90,1.56],[-3.25,1.78,1.34,1.92,1.62],
    [-2.20,1.82,1.38,1.92,1.67],[-.40,1.83,1.40,1.84,1.69],
    [1.12,1.79,1.42,1.90,1.68],[1.82,1.52,1.43,1.82,1.43],
  ];
  return sectionSolid(rows.map(([z,half,floor,roof,roofHalf])=>{
    const shoulder=Math.min(.12,(roof-floor)*.28);
    return {z,ring:[
      [-half+.05,floor],[half-.05,floor],[half,floor+shoulder],[half-.03,roof-shoulder],
      [roofHalf,roof],[-roofHalf,roof],[-half+.03,roof-shoulder],[-half,floor+shoulder],
    ]};
  }));
}

function addNamerDetails(P: TankBuilderPort): void {
  P.addEquipment('hullDetail',box(2.82,.055,.18),0,1.91,-3.66,-.05);
  P.addEquipment('hullDetail',box(2.56,.54,.055),0,1.62,-3.71);
  for(const x of[-1.08,-.54,0,.54,1.08])P.addEquipment('hullDark',box(.035,.52,.018),x,1.68,-3.742);
  for(const side of[-1,1]){
    P.addEquipment('hullDetail',box(.28,.16,.22),side*1.43,1.57,1.05);
    P.addEquipment('hullGlass',markVehicleNightLens(box(.17,.08,.012),'headlight'),side*1.43,1.59,1.172);
    for(const z of[-2.55,-1.75,-.95])P.addEquipment('hullDetail',torus(.055,.015,14,8),side*1.70,1.88,z,Math.PI/2);
  }
  for(const [x,z,y]of[[-.72,-2.55,2.12],[.72,-2.55,2.12],[-.55,.82,1.70],[.55,.82,1.70]]){
    P.addEquipment('hullDetail',cylY(.11,.05,18),x,y,z);
    P.addEquipment('hullDark',box(.14,.055,.018),x,y+.04,z+.10);
  }
  // Ten independently seated side modules are the Namer's dominant hull
  // cadence. The gaps keep the troop carrier visually separate from a smooth
  // late-Merkava skirt and remain cheap repeated procedural primitives.
  for(const side of[-1,1])
    P.addExternalArmor('hull',box(.035,.64,6.42),side*1.82,1.10,-.08);
  for(const side of[-1,1])for(let i=0;i<10;i++){
    const z=-3.23+i*.67;
    P.addExternalArmor('hull',box(.06,.84,.61),side*1.86,1.086,z);
    P.addEquipment('hullDark',box(.012,.74,.026),side*1.897,1.086,z+.315);
  }
}

function addNamerWeaponSupport(P: TankBuilderPort): void {
  const put=(slot:string,g:THREE.BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>
    topPart(P,NAMER,slot,g,x,y,z,rx,ry,rz);
  // The source's semantic support/weapon2/weapon3 cluster is a separate high
  // remote station at z -2.68..-1.56 and y 2.34..3.21. Build its ring, open
  // A-frame and paired slim receivers instead of the former solid gantry.
  put('turretDetail',cylY(.31,.11,18),0,2.66,-2.17);
  put('turretDark',cylY(.24,.06,18),0,2.745,-2.17);
  put('turretDetail',box(.62,.08,1.117),0,3.132,-2.044,.097);
  cageBar(P,NAMER,[-.27,2.70,-2.45],[-.19,3.00,-2.15],.055);
  cageBar(P,NAMER,[.27,2.70,-2.45],[.19,3.00,-2.15],.055);
  cageBar(P,NAMER,[-.19,3.00,-2.15],[.19,3.00,-2.15],.055);
  for(const side of[-1,1]){
    put('turretDark',box(.15,.17,.70),side*.18,3.08,-2.12);
    put('turretDetail',box(.19,.055,.16),side*.18,3.17,-2.38);
    put('turretDark',cylZ(.026,.78,10),side*.18,3.10,-1.74);
  }
}

function namerTurretShell(): THREE.BufferGeometry {
  // Five measured longitudinal stations produce the compact unmanned turret:
  // a narrow rear, broad APS shoulders and a tapered gun face. The former
  // three-station helmet hid all of those changes behind one blank surface.
  return sectionSolid([
    {z:-2.75-NAMER.z,ring:[[-.76,-.07],[.76,-.07],[.86,.17],[.58,.42],[-.58,.42],[-.86,.17]]},
    {z:-2.30-NAMER.z,ring:[[-1.17,-.08],[1.17,-.08],[1.31,.18],[.86,.54],[-.86,.54],[-1.31,.18]]},
    {z:-1.38-NAMER.z,ring:[[-1.36,-.08],[1.36,-.08],[1.43,.18],[.82,.60],[-.82,.60],[-1.43,.18]]},
    {z:-.48-NAMER.z,ring:[[-1.30,-.07],[1.30,-.07],[1.38,.16],[.66,.52],[-.66,.52],[-1.38,.16]]},
    {z:.28-NAMER.z,ring:[[-.72,-.04],[.72,-.04],[.82,.14],[.36,.35],[-.36,.35],[-.82,.14]]},
  ]);
}

function addNamerTurretModules(P: TankBuilderPort): void {
  // APS/radar armor is broken into distinct canted modules around the turret
  // perimeter. Dark faceplates and visible seams recover the source's visual
  // hierarchy while every module remains turret-owned and articulated.
  for(const side of[-1,1]){
    for(const [z,w,y]of[[-1.93,1.10,2.41],[-.65,1.08,2.37]] as const){
      topPart(P,NAMER,'turretDetail',box(.14,.30,w),side*1.18,y,z,0,0,side*.13);
      topPart(P,NAMER,'turretDark',box(.014,.21,w-.10),side*1.255,y+.015,z,0,0,side*.13);
      for(const dz of[-(w-.16)/2,(w-.16)/2])
        topPart(P,NAMER,'turretDetail',box(.032,.25,.032),side*1.266,y+.015,z+dz,0,0,side*.13);
    }
    topPart(P,NAMER,'turretDetail',box(.30,.26,.72),side*1.18,2.63,-1.39);
    for(let row=0;row<2;row++)for(let i=0;i<3;i++)
      topPart(P,NAMER,'turretDark',cylZ(.031,.19,10),side*1.18+(i-1)*.073,2.60+row*.073,-1.01,0,side*.10);
  }
  topPart(P,NAMER,'turretDetail',box(.30,.30,.34),-.80,2.72,-.70);
  topPart(P,NAMER,'turretGlass',box(.16,.07,.014),-.80,2.75,-.522);
  topPart(P,NAMER,'turretDetail',box(.45,.27,.48),.76,2.51,-.16);
  topPart(P,NAMER,'turretDark',box(.31,.13,.018),.76,2.54,.09);
  topPart(P,NAMER,'turretGlass',box(.14,.055,.010),.76,2.545,.101);
  // Low paired smoke banks and roof periscopes restore the busy asymmetric
  // fighting-module read visible in the source without inflating the turret
  // into an MBT cupola.
  for(const side of[-1,1])for(let i=0;i<3;i++)
    topPart(P,NAMER,'turretDark',cylZ(.036,.31,12),side*(.79+i*.10),2.37,.18-i*.055,-.18,side*.38);
  for(const [x,z,ry]of[[-.38,-.12,0],[.02,-.05,0],[.38,-.18,0],[-.26,-1.74,Math.PI]] as const){
    topPart(P,NAMER,'turretDetail',box(.22,.11,.17),x,2.64,z,0,ry);
    topPart(P,NAMER,'turretDark',box(.13,.052,.012),x,2.66,z+(ry===0?.091:-.091),0,ry);
  }
  P.turretG.userData.trophySuiteReceipt=Object.freeze({configuration:'namer',radarFaces:4,launchers:2,owner:'rig_turret'});
}

export function buildNamerIfv(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(0,NAMER.y,NAMER.z);
  P.gunG.position.set(.05,.28,1.02);
  P.add('hull',merkava4Hull());
  P.add('hull',modernMerkavaGlacisCap());
  P.add('hull',namerSuperstructure());
  // Source axle centres are reconstructed in world metres then divided by
  // the final .976 chassis length scale. This aligns every wheel gap rather
  // than shortening an already forward-biased Mk.4 pattern uniformly.
  const namerWheels=[-2.226,-1.491,-.464,.434,1.359,2.105];
  const namerRollers=[-1.6645,-.733,.27,2.017];
  P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{style:'rubber',wheelR:.341,wheelW:.34,wheelY:.372,xc:1.444,
    // The same native course, instance palette and guide envelope at LOW.
    ...(!P.q?{trackShoeBuilder:buildFleetTrackShoe}:{}),
    wheelZs:namerWheels,trackW:.548,trackTh:.064,
    sprocket:{z:3.007,y:.831,r:.335},idler:{z:-2.978,y:.708,r:.332},topY:1.125,botY:.0956,
    paintedEnds:true,arms:true,coveredTop:true},namerRollers,.945,.29,.0047,true));
  lineMerkavaXUpperBand(P,namerRollers,.0038);
  merkava4HullDetails(P);
  addMerkavaXShoulderReturns(P,'merkava4_x');
  addMerkava4XEndReturns(P);
  addNamerDetails(P);
  P.add('turret',namerTurretShell());
  P.add('turret',cylY(.88,.12,24),0,-.02,-.85);
  // A low rectangular equipment plinth replaces the old tank-like round
  // cupola. The real Namer station is unmanned; this keeps the roof clearly
  // distinct from both Mk.4 variants even at garage distance.
  P.add('turret',box(.72,.10,.58),0,.55,-.30);
  P.add('gunMount',sectionSolid([
    {z:-.24,ring:[[-.28,-.20],[.28,-.20],[.28,.21],[-.28,.21]]},
    {z:.18,ring:[[-.22,-.16],[.22,-.16],[.22,.17],[-.22,.17]]},
    {z:.36,ring:[[-.10,-.10],[.10,-.10],[.10,.11],[-.10,.11]]},
  ]));
  P.add('gun',cylZ(.037,2.31,18),0,0,1.155);
  P.add('gun',cylZ(.069,.22,18),0,0,2.40);
  P.add('gunDark',box(.16,.07,.18),0,.015,.54);
  addNamerTurretModules(P);
  addNamerWeaponSupport(P);
  const auxiliary=FITTINGS.pintleMG({mats:P.mats,cls:'mag',scale:.72,seed:904,tone:'two-tone',ammo:true,shield:false,ring:false});
  auxiliary.position.set(.46,2.76-NAMER.y,-1.17-NAMER.z);P.turretG.add(auxiliary);
  P.muzzleZ=2.51;P.topY=1.12;
  // The Namer source is a narrower/shorter Merkava-family chassis. Its turret
  // is authored directly at the registered envelope so each sensor and weapon
  // retains its independent world-space seat.
  P.hullG.scale.x=.95;P.hullG.scale.y=1.012;P.hullG.scale.z=.976;
  P.hullG.userData.xRebuild={candidate:'namer_ifv',independent:true,familyRecipe:'merkava4-chassis',datumVersion:1,sourceLocalOnly:true};
  P.hullG.userData.namerLayoutReceipt=Object.freeze({crew:3,dismounts:8,rearRamp:true,unmannedTurret:true,missiles:false});
}

export const MERKAVA_X_PROFILES = {
  merkava4_x: { build: buildMerkava4X }, merkava3d_x: { build: buildMerkava3DX },
  merkava4_trophy: { build: buildMerkava4Trophy },
  merkava4_barak: { build: buildMerkava4Barak },
  namer_ifv: { build: buildNamerIfv },
} as const;
