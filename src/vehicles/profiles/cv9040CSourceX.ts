// Swedish CV9040C photo reconstruction, separate from the upgraded CV90 slot.
// The C's appliqué cheek packets, 40 mm mount and troop-cell roof are authored
// independently of the later Mk IV X. See the dated reference packet.
import * as THREE from 'three';
import { KIT, convexSlab } from './kit.ts';
import { chassisLoft, armorLoft, sideWall, openTube, optic, antenna, deckGrille, turretEquipment } from './europeSourcePrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ}=KIT;

function hull(P: TankBuilderPort): void {
  P.add('hull',chassisLoft([
    [-3.32,.78,1.51,1.40,.65,1.22,1.93],
    [-2.96,.93,1.52,1.43,.37,1.22,1.94],
    [-1.48,.94,1.52,1.43,.37,1.16,1.94],
    [-.95,.94,1.52,1.43,.37,1.16,1.76],
    [1.22,.94,1.52,1.43,.37,1.16,1.76],
    [2.62,.94,1.51,1.40,.58,1.25,1.40],
    [3.36,.97,1.43,1.38,.85,1.18,1.21],
  ],1.06));
  for(const side of [-1,1]) {
    // External C-standard protection follows the low front / high rear cell.
    sideWall(P,side,1.50,1.64,[[-3.28,1.15,1.90],[-1.49,1.15,1.90],[-.97,1.15,1.73],[1.16,1.15,1.73],[2.60,1.25,1.36],[3.21,1.18,1.23]]);
    for(let i=0;i<6;i++) {
      const z=-2.65+i*.98;
      sideWall(P,side,1.61,1.685,[[z-.474,.56,1.19],[z+.474,.56,1.19]]);
      for(const dz of [-.33,.33])P.addEquipment('hullDetail',box(.045,.074,.10),side*1.69,1.19,z+dz);
    }
    P.addMudguard(`cv9040c-front-${side}`,'hullRubber',box(.54,.30,.025),side*1.32,.99,3.31,-.65);
    P.addMudguard(`cv9040c-rear-${side}`,'hullRubber',box(.51,.33,.025),side*1.32,.73,-3.17,.13);
    P.addEquipment('hullDetail',box(.37,.16,.26),side*1.19,1.31,3.12);
    for(const dx of [-.10,.10])P.addEquipment('hullGlass',cylZ(.045,.018,12),side*1.19+dx,1.32,3.26);
    for(const z of [-2.62,-2.02])P.addHatch('hull',box(.99,.033,.50),side*.77,1.965,z);
    for(const z of [-3.12,.75,2.62])KIT.liftEye(P,'hullDetail',side*1.25,z>2?1.43:z>0?1.78:1.96,z);
  }
  // Driver at the left front, engine and cooling package to the right.
  P.addHatch('hull',box(.62,.052,.71),-.79,1.78,1.11);
  for(const x of [-.99,-.79,-.59])KIT.periscope(P,'hullDetail',x,1.835,1.41);
  P.addHatch('hull',box(1.20,.03,1.58),.66,1.588,1.94,.23);
  deckGrille(P,1.10,1.754,.80,.55,.90);
  for(let i=0;i<8;i++)P.addEquipment('hullDark',box(.014,.18,.61),1.65,1.46,-.10+i*.075);
  P.addEquipment('hullDark',box(1.30,1.20,.03),.06,1.27,-3.33);
  P.addHatch('hull',box(1.21,1.12,.065),.06,1.27,-3.367);
  for(const x of [-.49,.61])P.addEquipment('hullDetail',cylX(.047,.16,12),x,.72,-3.41);
  P.addEquipment('hullDetail',box(.16,.028,.038),.44,1.37,-3.415);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.38,.32,.20),side*1.20,1.55,-3.33);
    P.addEquipment('hullGlass',box(.22,.08,.018),side*1.20,1.65,-3.44);
  }
  KIT.towCable(P,[[-.80,1.22,3.33],[-.37,1.01,3.39],[.39,1.01,3.39],[.81,1.22,3.33]]);
}

function gear(P: TankBuilderPort): void {
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'compact-ifv',
    wheelR:.325,wheelW:.35,wheelY:.403,wheelZs:[-2.24,-1.41,-.58,.25,1.08,1.91],
    xc:1.32,trackW:.50,trackTh:.025,
    sprocket:{z:2.74,y:.81,r:.29,trackR:.31,toothTipRadiusM:.332},
    idler:{z:-2.83,y:.77,r:.272,trackR:.283},
    rollers:[{z:-1.86,y:.96,r:.09},{z:-.14,y:.96,r:.09},{z:1.60,y:.96,r:.09}],
    topY:1.105,botY:.044,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function turret(P: TankBuilderPort): void {
  const [,py,pz]=P.spec.armor.turretPivot;
  P.add('turret',cylY(.83,.87,.065,P.q?40:20),0,.015,0);
  // Two-man Bofors turret: tall flat crew roof, clipped bustle and nearly
  // vertical upper flanks. The lower front returns remain steeply raked.
  P.add('turret',armorLoft([
    [-2.03,.75,.84,.77,1.94,2.42,2.55],
    [-1.57,.93,1.05,.96,1.78,2.39,2.56],
    [-.02,.95,1.10,.97,1.78,2.40,2.56],
    [.32,.75,.91,.73,1.83,2.34,2.54],
  ],py,pz));
  for(const side of [-1,1]) {
    // Broad separate appliqué packets frame an actual open gun throat.
    P.addExternalArmor('turret',convexSlab(
      [side*.29,.02,1.26],[side*1.18,.02,.56],[side*1.11,.73,.25],[side*.29,.73,.85],
      [side*.29,.03,.93],[side*1.02,.03,.34],[side*.99,.73,.12],[side*.29,.73,.64],
    ));
    turretEquipment(P,'turretDetail',box(.17,.51,1.21),side*1.10,2.18,-.87);
    for(const z of [-1.30,-.72,-.19])turretEquipment(P,'turretDetail',box(.019,.035,.08),side*1.195,2.37,z);
    // Three Galix tubes per side, canted outwards; never offensive launchers.
    for(let i=0;i<3;i++) {
      turretEquipment(P,'turretDetail',cylZ(.050,.20,12),side*(.81+i*.11),2.56,-.25-i*.12,-.63,side*.40);
      turretEquipment(P,'turretDark',cylZ(.039,.012,12),side*(.85+i*.11),2.62,-.17-i*.12,-.63,side*.40);
    }
  }
  P.addCupola('turret',cylY(.29,.32,.09,20),.45,.81,-.18);
  P.addHatch('turret',cylY(.255,.27,.033,20),.45,.865,-.18);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;KIT.periscope(P,'turretDetail',.45+Math.cos(a)*.29,.875,-.18+Math.sin(a)*.29,a);}
  P.addHatch('turret',box(.59,.033,.62),-.45,.80,-.32);
  optic(P,-.46,2.77,.02,.39,.35,.34);
  optic(P,.46,2.75,-.36,.31,.22,.24);
  turretEquipment(P,'turretDetail',box(1.45,.42,.31),0,2.26,-2.00);
  for(const x of [-.59,.59])antenna(P,x,2.55,4.17,-1.74);
  for(const x of [-.75,.75])KIT.liftEye(P,'turretDetail',x,.82,-.84);
}

function gun(P: TankBuilderPort): void {
  // The wide rectangular rocking shield belongs to the gun, not the cheeks.
  P.addGunExtra(box(.51,.47,.61),0,0,.09);
  P.addGunExtra(cylZ(.12,.29,20),0,0,.52);
  P.add('gun',cylZ(.070,1.22,P.q?24:12),0,0,1.23);
  P.add('gun',cylZ(.052,.64,P.q?24:12),0,0,2.15);
  openTube(P,.067,2.43,2.75,.020);
  P.addGunExtraDark(cylZ(.022,.62,12),-.325,-.06,.39);
  P.addGunExtraDark(new THREE.CircleGeometry(.010,12),-.325,-.06,.708);
}

export function buildCv9040CX(P: TankBuilderPort): void {
  hull(P);gear(P);turret(P);gun(P);P.topY=1.03;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretExternalArmor','turretHatch']};
}
