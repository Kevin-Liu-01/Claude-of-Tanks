// Source-measured Puma S1 replica. The separate upgraded Puma S1 is preserved.
// Coordinates are metres; no source mesh is loaded by the playable builder.
import * as THREE from 'three';
import { KIT, convexSlab } from './kit.ts';
import { chassisLoft, sideWall, turretEquipment, optic, deckGrille, openTube, mirrorX } from './europeSourcePrimitives.ts';
import { sectionSolid } from './sectionSolid.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { weaponAssembly } from './weaponStock.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ } = KIT;

function hull(P: TankBuilderPort): void {
  P.add('hull', chassisLoft([
    [-3.68,.82,1.71,1.60,.93,1.41,1.916],
    [-3.42,.90,1.76,1.63,.90,1.41,1.916],
    [-3.24,.98,1.78,1.65,.393,1.40,1.916],
    [-.67,.98,1.78,1.65,.393,1.40,1.916],
    [.94,.98,1.78,1.64,.393,1.40,1.98],
    [2.63,.99,1.71,1.65,.61,1.40,1.59],
    [3.59,1.03,1.66,1.57,1.09,1.25,1.41],
    [3.68,.78,1.18,1.12,1.16,1.27,1.39],
  ],1.045));
  // Broad protection cells have a rounded/chamfered roof, not a tall flat box.
  for(const side of [-1,1]) {
    const shell=sectionSolid([
      {z:-3.64,ring:[[1.57,1.31],[1.88,1.31],[1.88,1.65],[1.77,1.916],[1.59,1.936]]},
      {z:-.67,ring:[[1.57,1.31],[1.88,1.31],[1.88,1.65],[1.77,1.916],[1.59,1.936]]},
      {z:1.98,ring:[[1.57,1.26],[1.88,1.26],[1.88,1.42],[1.77,1.71],[1.59,1.74]]},
      {z:2.92,ring:[[1.57,1.24],[1.84,1.24],[1.84,1.36],[1.75,1.56],[1.59,1.58]]},
    ]);
    P.addExternalArmor('hull',side<0?mirrorX(shell):shell);
    sideWall(P,side,1.83,1.89,[[-2.39,.85,1.33],[-1.95,.62,1.33],[1.60,.62,1.33],[1.91,.85,1.33],[2.63,1.05,1.45],[2.95,1.12,1.35]]);
    for(const z of [-2.18,-1.30,-.42,.46,1.34,2.10]) {
      P.addEquipment('hullDetail',box(.027,.075,.115),side*1.90,.86,z);
      P.addEquipment('hullDetail',box(.028,.045,.19),side*1.90,1.34,z);
    }
    // Slat rear corners and lower rails retain actual negative space.
    for(let i=0;i<6;i++)P.addEquipment('hullOpenLattice',box(.035,.022,1.10),side*1.861,.94+i*.102,-3.06);
    for(const z of [-3.60,-3.08,-2.51])P.addEquipment('hullOpenLattice',box(.028,.66,.028),side*1.865,1.18,z);
    for(const y of [.66,.74])P.addEquipment('hullOpenLattice',box(.035,.023,4.51),side*1.85,y,-.20);
    P.addMudguard(`puma-x-front-${side}`,'hullRubber',box(.56,.43,.028),side*1.22,.94,3.43,-.20);
    P.addMudguard(`puma-x-rear-${side}`,'hullRubber',box(.64,.24,.025),side*1.30,1.06,-3.36,.23);
    P.addEquipment('hullDetail',box(.34,.14,.18),side*1.40,1.34,3.43);
    for(const dx of [-.075,.075])P.addEquipment('hullGlass',cylZ(.044,.015,12),side*1.40+dx,1.34,3.53);
    // Both mirror heads and their continuous stalk use the measured bow
    // station; the upper head must remain above the roof from front/rear.
    P.addEquipment('hullDetail',box(.027,.734,.027),side*1.795,1.805,2.891,0,0,-side*.323);
    P.addEquipment('hullDetail',box(.154,.290,.028),side*1.908,1.858,2.852);
    P.addEquipment('hullGlass',box(.124,.260,.008),side*1.908,1.858,2.833);
    P.addEquipment('hullDetail',box(.212,.154,.032),side*1.922,2.106,2.862);
    P.addEquipment('hullGlass',box(.180,.122,.008),side*1.922,2.106,2.841);
  }
  // Inclined front engine covers follow the glacis datum.
  for(const x of [-.48,.48])P.addHatch('hull',box(.91,.032,1.70),x,1.775,1.93,.23);
  // Engine-panel hinges and fasteners sit on the inclined roof rather than
  // disappearing under it. The source bow has a continuous service lip.
  for(const x of [-.89,-.08,.08,.89])for(const z of [1.17,2.66]) {
    const y=1.98-(z-.94)*.39/1.69;
    P.addEquipment('hullDetail',cylY(.018,.018,.024,6),x,y+.031,z,.227);
  }
  for(const x of [-.70,-.29,.29,.70])P.addEquipment('hullDetail',cylX(.024,.12,10),x,1.972,1.12,.23);
  P.addEquipment('hullDetail',box(2.78,.035,.035),0,1.325,3.53);
  for(let i=0;i<12;i++) {
    const x=-1.23+i*.224;
    P.addEquipment('hullDetail',box(.028,.037,.16),x,1.36,3.39,.27);
  }
  for(const side of [-1,1]){
    P.addEquipment('hullDetail',box(.16,.15,.07),side*.85,1.24,3.72);
    P.addEquipment('hullDark',cylZ(.039,.080,12),side*.85,1.22,3.77);
  }
  deckGrille(P,-1.43,1.69,1.76,.24,1.15);
  P.add('hull',box(.59,.19,.48),.63,1.901,.73);
  P.addHatch('hull',box(.59,.048,.48),.63,2.01,.73);
  for(const x of [.40,.63,.86])KIT.periscope(P,'hullDetail',x,2.06,.99);
  // The raised rear access platform is local; it does not raise the entire
  // troop-compartment roof or its flank protection by the same 240 mm.
  P.addHatch('hull',box(1.922,.24,1.006),.027,2.037,-3.25);
  P.addEquipment('hullDark',box(1.42,1.02,.045),0,1.46,-3.69);
  P.addHatch('hull',box(1.29,.95,.055),0,1.44,-3.715);
  P.addEquipment('hullDetail',box(1.30,.08,.05),0,1.62,-3.755);
  for(const x of [-.51,.51])P.addEquipment('hullDetail',cylX(.055,.18,12),x,.58,-3.27);
  P.addEquipment('hullDetail',box(.18,.035,.04),.39,1.49,-3.788);
  for(const s of [-1,1]) {
    P.addEquipment('hullDetail',box(.028,.16,1.18),s*1.18,1.996,-3.04);
    P.addEquipment('hullDetail',box(.96,.028,.028),s*.71,2.066,-3.60);
    P.addEquipment('hullGlass',box(.19,.09,.018),s*1.29,1.75,-3.735);
  }
  P.addEquipment('hullDark',cylY(.010,.020,2.24,P.q?10:6),-1.31,3.26,-3.49);
  P.addEquipment('hullDetail',cylY(.055,.07,.30,12),-1.31,2.066,-3.49);
  for(const z of [-3.22,-2.18,.37,2.79])for(const x of [-1.46,1.46])KIT.liftEye(P,'hullDetail',x,z>2?1.47:z>0?1.86:1.94,z);
}

function runningGear(P: TankBuilderPort): void {
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'compact-ifv',
    wheelR:.358,wheelW:.36,wheelY:.428,wheelZs:[-2.1695,-1.428,-.679,.2465,1.0075,1.7875],
    xc:1.30,trackW:.489,trackTh:.027,
    sprocket:{z:2.653,y:.961,r:.345,trackR:.342,toothTipRadiusM:.368},
    idler:{z:-2.8095,y:.837,r:.303,trackR:.308},
    rollers:[{z:-1.88,y:1.12,r:.11},{z:0,y:1.12,r:.11},{z:1.74,y:1.12,r:.11}],
    topY:1.32,botY:.043,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function turret(P: TankBuilderPort): void {
  const [px,py,pz]=P.spec.armor.turretPivot;
  P.add('turret',cylY(.62,.69,.16,P.q?40:20),0,.075,0);
  // Strongly asymmetric RCT30: low central roof spine, deep right electronics
  // flank and tapering left shoulder. Independent front cheeks leave a cradle.
  const shell=sectionSolid([
    {z:-2.64,ring:[[-.25,2.24],[1.15,2.24],[1.15,2.72],[1.05,2.83],[-.18,2.83]]},
    {z:-1.61,ring:[[-.25,1.98],[1.15,1.98],[1.15,2.75],[1.06,2.83],[-.21,2.83]]},
    {z:-.97,ring:[[-.25,1.98],[1.15,1.98],[1.15,2.73],[1.06,2.79],[-.21,2.79]]},
  ]).translate(-px,-py,-pz);
  P.add('turret',shell);
  // The forward body is asymmetric too: the cannon occupies the left slot,
  // with a thin wall on its outside and a broad electronic cheek on its right.
  // Keeping those walls separate leaves a real elevating-cradle opening.
  P.add('turret',sectionSolid([
    {z:-.98,ring:[[.385,1.98],[1.15,1.98],[1.15,2.70],[1.05,2.79],[.385,2.79]]},
    {z:.22,ring:[[.385,2.24],[1.15,2.24],[1.15,2.61],[1.07,2.70],[.385,2.70]]},
    {z:.529,ring:[[.48,2.35],[1.06,2.35],[1.06,2.48],[.99,2.55],[.48,2.55]]},
  ]).translate(-px,-py,-pz));
  turretEquipment(P,'turretDetail',box(.036,.60,.52),-.234,2.54,-.71);
  turretEquipment(P,'turretDetail',box(.87,.055,.64),.43,2.814,-1.29);
  turretEquipment(P,'turretDetail',cylY(.25,.27,.29,16),.43,2.96,-1.29);
  optic(P,.43,3.10,-1.29,.46,.37,.43);
  for(const x of [.17,.68])turretEquipment(P,'turretDetail',box(.045,.41,.045),x,3.08,-1.30);
  turretEquipment(P,'turretDetail',box(.55,.045,.045),.43,3.28,-1.30);
  turretEquipment(P,'turretDetail',cylY(.13,.17,.10,14),.43,3.36,-1.18);
  // MUSS has a rising back and a short chamfered crown, not a rectangular
  // full-height box. The stations are measured in the frozen source frame.
  const head=sectionSolid([
    {z:-1.324,ring:[[.343,3.405],[.522,3.405],[.522,3.471],[.514,3.479],[.351,3.479],[.343,3.471]]},
    {z:-1.289,ring:[[.314,3.405],[.552,3.405],[.552,3.523],[.544,3.531],[.322,3.531],[.314,3.523]]},
    {z:-1.098,ring:[[.295,3.405],[.570,3.405],[.570,3.610],[.532,3.647],[.333,3.647],[.295,3.610]]},
    {z:-1.029,ring:[[.295,3.405],[.570,3.405],[.570,3.610],[.532,3.647],[.333,3.647],[.295,3.610]]},
  ]);
  turretEquipment(P,'turretDetail',head,0,0,0);
  turretEquipment(P,'turretGlass',box(.16,.08,.008),.4325,3.558,-1.024);
  optic(P,.79,2.56,.23,.52,.39,.59);
  for(const side of [-1,1]) {
    const x=side<0?-.48:1.27;
    turretEquipment(P,'turretDetail',box(.075,.48,.22),x,2.55,-2.16);
    for(let i=0;i<4;i++)turretEquipment(P,'turretDetail',cylZ(.036,.16,10),x,2.36+i*.109,-2.02,-.42,side*.53);
  }
}

function gun(P: TankBuilderPort): void {
  // The receiver and barrel shroud share the gun rig. The open nose exposes
  // the MK30 barrel and correctly follows elevation/recoil.
  P.addGunExtra(cylX(.275,.39,P.q?32:16),0,0,.0);
  P.addGunExtra(convexSlab(
    [-.19,-.18,.0],[.19,-.18,.0],[.13,-.095,2.48],[-.13,-.095,2.48],
    [-.19,.22,.0],[.19,.22,.0],[.13,.095,2.48],[-.13,.095,2.48],
  ));
  P.add('gun',cylZ(.046,.42,P.q?24:12),0,0,2.69);
  openTube(P,.067,2.90,3.258,.015);
  for(const x of [-.26,.26])P.addGunExtraDark(box(.055,.04,.34),x,-.055,.49);
  P.addGunExtraDark(cylZ(.024,.59,12),-.27,-.06,.72);
  // MELLS is a separate two-cell gun-follow bank. No invented roof cannon.
  const tx=1.3855-.0195, ty=2.467-2.5132, front=.7294;
  weaponAssembly(P,()=>{
    for(const dx of [-.219,.219])P.addGunExtra(box(.033,.48,1.84),tx+dx,ty,front-.92);
    for(const dy of [-.255,.255])P.addGunExtra(box(.472,.035,1.84),tx,ty+dy,front-.92);
    P.addGunExtra(box(.47,.53,.045),tx,ty,front-1.84);
    P.addGunExtra(box(.78,.095,.47),tx-.23,ty-.245,-.25);
    for(const dx of [-.1005,.1005]) {
      P.addGunExtra(new THREE.CylinderGeometry(.082,.082,1.28,P.q?20:10,1,true).rotateX(Math.PI/2),tx+dx,ty,front-.67);
      P.addGunExtra(new THREE.RingGeometry(.062,.084,P.q?20:10),tx+dx,ty,front);
      P.addGunExtraDark(new THREE.CircleGeometry(.062,P.q?20:10),tx+dx,ty,front-.20);
    }
  });
}

export function buildPumaS1X(P: TankBuilderPort): void {
  hull(P);runningGear(P);turret(P);gun(P);P.topY=1.15;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretHatch']};
}
