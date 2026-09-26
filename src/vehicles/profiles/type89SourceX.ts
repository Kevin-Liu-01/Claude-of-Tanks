// Independent Japanese Type 89 X; the upgraded Light Tiger remains unchanged.
// All stock is authored here; the local source is only a measurement oracle.
import * as THREE from 'three';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { armorLoft, chassisLoft, sideWall, openTube, turretEquipment, optic, antenna, deckGrille } from './europeSourcePrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { weaponAssembly } from './weaponStock.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ } = KIT;

function hull(P: TankBuilderPort): void {
  // Long shallow bow, narrow wheel bays and clipped troop-compartment roof.
  P.add('hull', chassisLoft([
    [-3.34,.91,1.58,1.26,.49,1.47,1.82],
    [-2.76,.96,1.58,1.27,.48,1.47,1.82],
    [-.25,.96,1.58,1.27,.48,1.47,1.82],
    [.74,.96,1.58,1.37,.48,1.45,1.80],
    [2.60,.96,1.57,1.43,.58,1.23,1.39],
    [3.30,1.00,1.53,1.43,.85,1.18,1.31],
  ],1.06));
  for (const side of [-1,1]) {
    // Thin skirts expose the road wheels; no invented deep composite jacket.
    for(let i=0;i<5;i++) {
      const z=-2.64+i*1.16;
      sideWall(P,side,1.576,1.603,[[z-.565,.85,1.20],[z+.565,.85,1.20]]);
      for(const dz of [-.42,.42])P.addEquipment('hullDetail',box(.012,.045,.09),side*1.604,1.21,z+dz);
    }
    for(const z of [-2.54,-1.58,-.62]) {
      P.add('hull',cylX(.175,.06,P.q?24:12),side*1.49,1.61,z,0,0,side*.38);
      P.addEquipment('hullDark',cylX(.105,.065,P.q?20:10),side*1.518,1.63,z,0,0,side*.38);
      P.addEquipment('hullDetail',cylX(.080,.07,P.q?18:10),side*1.523,1.63,z,0,0,side*.38);
      P.addEquipment('hullDetail',box(.05,.05,.40),side*1.40,1.79,z);
    }
    P.addMudguard(`type89-front-${side}`,'hullRubber',box(.48,.27,.028),side*1.34,1.01,3.16,-.18);
    P.addMudguard(`type89-rear-${side}`,'hullRubber',box(.45,.37,.035),side*1.34,.89,-3.19,.10);
    P.addEquipment('hullDetail',box(.32,.10,.18),side*1.33,1.31,3.10);
    P.addEquipment('hullDark',cylZ(.073,.045,16),side*1.34,1.28,3.185);
    P.addEquipment('hullGlass',cylZ(.054,.008,16),side*1.34,1.28,3.210);
    for(const z of [-2.82,.64,2.42])KIT.liftEye(P,'hullDetail',side*1.27,z>1?1.46:1.84,z);
  }
  // Engine left of the driver's tandem access covers (vehicle +X is right).
  deckGrille(P,-.78,1.724,1.01,.71,.78);
  deckGrille(P,-1.23,1.68,.64,.28,1.28);
  for(const [z,y] of [[1.32,1.74],[2.11,1.55]]) {
    P.addHatch('hull',cylY(.31,.33,.055,16),.70,y,z);
    for(const dx of [-.18,0,.18]) KIT.periscope(P,'hullDetail',.70+dx,y+.055,z+.26);
  }
  for(const x of [-.63,.65]) {
    P.addHatch('hull',box(.92,.03,.91),x,1.84,-2.55);
    P.addEquipment('hullDetail',box(.32,.025,.03),x,1.87,-2.48);
  }
  P.addEquipment('hullDark',box(1.69,1.15,.035),0,1.15,-3.349);
  P.addHatch('hull',box(1.56,1.05,.06),0,1.15,-3.373);
  for(const x of [-.61,.61])P.addEquipment('hullDetail',cylX(.048,.16,12),x,.64,-3.40);
  P.addHatch('hull',box(.56,.84,.035),.34,1.17,-3.42);
  P.addEquipment('hullDetail',box(.14,.03,.035),.48,1.24,-3.446);
  for(const s of [-1,1])P.addEquipment('hullGlass',box(.20,.075,.025),s*1.27,1.63,-3.36);
  KIT.towCable(P,[[-.85,1.12,3.30],[-.35,.94,3.34],[.38,.94,3.34],[.86,1.12,3.30]]);
}

function runningGear(P: TankBuilderPort): void {
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'japanese-modular',
    wheelR:.325,wheelW:.29,wheelY:.404,wheelZs:[-2.0482,-1.2602,-.4722,.3158,1.1038,1.8918],
    wheelZsLeftM:[-2.0482,-1.2602,-.4722,.3158,1.1038,1.8918],
    wheelZsRightM:[-1.8686,-1.0806,-.2926,.4953,1.2834,2.0694],
    xc:1.34,trackW:.45,trackTh:.026,
    sprocket:{z:2.7865,y:.8226,r:.285,trackR:.29,toothTipRadiusM:.313},
    idler:{z:-2.8049,y:.7773,r:.275,trackR:.258},
    rollers:[{z:-1.7,y:.97,r:.08},{z:0,y:.97,r:.08},{z:1.6,y:.97,r:.08}],
    topY:1.08,botY:.045,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,
    fitStaggeredGroundRun:true,dedupeLoopPoints:true,
  });
}

function launchers(P: TankBuilderPort): void {
  // One Type 79 canister on each side, attached to the turret rather than the gun.
  weaponAssembly(P,()=>{
    for(const side of [-1,1]) {
      const x=.08+side*1.25;
      turretEquipment(P,'turretDetail',box(.25,.15,.72),x,2.265,-1.09);
      turretEquipment(P,'turretDetail',box(.08,.27,.42),.08+side*1.10,2.22,-1.10);
      for(const dx of [-.155,.155])turretEquipment(P,'turretDetail',box(.035,.33,1.19),x+dx,2.43,-1.055);
      for(const dy of [-.17,.17])turretEquipment(P,'turretDetail',box(.345,.032,1.19),x,2.43+dy,-1.055);
      turretEquipment(P,'turretDetail',box(.34,.35,.035),x,2.43,-1.667);
      const tube=new THREE.CylinderGeometry(.126,.126,1.16,P.q?24:12,1,true).rotateX(Math.PI/2);
      turretEquipment(P,'turretDark',tube,x,2.43,-1.055);
      turretEquipment(P,'turretDetail',new THREE.RingGeometry(.107,.129,P.q?24:12),x,2.43,-.46);
      turretEquipment(P,'turretDark',new THREE.CircleGeometry(.107,P.q?24:12),x,2.43,-.68);
    }
  });
}

function turret(P: TankBuilderPort): void {
  const py=1.80,pz=-.82;
  P.add('turret',cylY(.81,.84,.07,P.q?40:20),0,.005,0);
  // The compact two-man compartment has upright sides and clipped corners;
  // it does not share the Swedish wedge or Puma's asymmetric roof spine.
  P.add('turret',armorLoft([
    [-1.96,.74,.83,.77,1.93,2.20,2.43],
    [-1.65,.92,1.06,.96,1.82,2.20,2.44],
    [-.20,.92,1.06,.96,1.82,2.20,2.44],
    [.04,.70,.86,.74,1.84,2.19,2.40],
  ],py,pz));
  for(const side of [-1,1]) {
    P.add('turret',convexSlab(
      [side*.29,.035,1.26],[side*.91,.035,.70],[side*.86,.52,.82],[side*.29,.50,1.15],
      [side*.29,.035,.75],[side*.91,.035,.63],[side*.86,.52,.68],[side*.29,.50,.80],
    ));
    const bank=FITTINGS.smokeBank({mats:P.mats,count:3,r:.037,len:.20,spacing:.092,pitch:-.50,splay:side*.08,seed:894+side});
    bank.position.set(side*1.03,.26,.60);bank.rotation.y=side*.28;P.turretG.add(bank);
  }
  P.addCupola('turret',cylY(.285,.32,.085,20),.43,.68,-.16);
  P.addHatch('turret',cylY(.245,.265,.035,20),.43,.737,-.16);
  for(let i=0;i<6;i++) {const a=i*Math.PI/3;KIT.periscope(P,'turretDetail',.43+Math.cos(a)*.28,.755,-.16+Math.sin(a)*.28,a);}
  P.addHatch('turret',box(.56,.025,.67),-.43,.66,-.57);
  // Separate source-measured sight housings; the old undersized pair also
  // lowered the silhouette ruler despite correctly placed antenna tips.
  turretEquipment(P,'turretDetail',box(.39,.065,.23),-.6185,2.465,-.385);
  turretEquipment(P,'turretDetail',box(.41,.065,.28),.7385,2.465,-.3765);
  optic(P,-.6185,2.6035,-.385,.447,.243,.274);
  optic(P,.7385,2.5965,-.3765,.467,.259,.329);
  for(const x of [-.76,.92])antenna(P,x,2.45,4.145,-1.62);
  P.addEquipment('turretDetail',box(1.52,.17,.22),0,.53,-1.20);
  for(const x of [-.56,.56])KIT.liftEye(P,'turretDetail',x,.66,-.95);
  launchers(P);
  // Compact rocking shield carries the real KDE-35 and coax; no roof RWS.
  P.addGunExtra(box(.43,.35,.63),0,0,.09);
  P.addGunExtra(cylZ(.096,.39,20),0,0,.48);
  P.add('gun',cylZ(.061,1.08,P.q?24:12),0,0,1.105);
  openTube(P,.037,1.62,2.774,.0175);
  P.addGunExtraDark(cylZ(.019,.77,12),.244,-.023,.39);
  P.addGunExtraDark(new THREE.CircleGeometry(.009,12),.244,-.023,.778);
}

export function buildType89X(P: TankBuilderPort): void {
  hull(P);runningGear(P);turret(P);P.topY=.96;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretHatch']};
}
