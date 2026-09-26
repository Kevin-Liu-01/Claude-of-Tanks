// Dardo production IFV: HITFIST 25 turret and six-wheel Italian chassis.
// Dimensions and photographed equipment: docs/references/batches/europe-ifvs-20260925.md.
import { KIT } from './kit.ts';
import { chassisLoft, armorLoft, sideWall, openTube, optic, antenna, deckGrille, smokeBank } from './europeSourcePrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ } = KIT;

function buildHull(P: TankBuilderPort): void {
  // Short stern, level troop roof and long falling glacis. The lower chassis
  // remains inside the wheel corridor instead of filling the track bays.
  P.add('hull', chassisLoft([
    [-3.28, .84, 1.38, 1.30, .73, 1.22, 1.75],
    [-2.78, .91, 1.40, 1.30, .40, 1.22, 1.75],
    [-.35, .91, 1.40, 1.30, .40, 1.22, 1.75],
    [.92, .91, 1.40, 1.30, .40, 1.22, 1.75],
    [2.35, .91, 1.40, 1.32, .65, 1.22, 1.45],
    [3.31, .90, 1.37, 1.31, 1.00, 1.23, 1.24],
  ], .95));
  for (const side of [-1, 1]) {
    // Six separate hinged skirt sections; leave both wrap arcs exposed.
    for (let i = 0; i < 6; i++) {
      const z = -2.30 + i * .85;
      sideWall(P, side, 1.505, 1.545, [[z-.412, .67, 1.26], [z+.412, .67, 1.26]]);
      P.addEquipment('hullDetail', box(.043, .035, .64), side*1.545, 1.27, z);
      for (const dz of [-.29, .29]) {
        P.addEquipment('hullDetail', box(.025, .15, .035), side*1.545, .64, z+dz);
        P.addEquipment('hullDetail', box(.025, .025, .13), side*1.545, .57, z+dz+.05);
      }
    }
    P.addMudguard(`dardo-front-${side}`, 'hullRubber', box(.47,.30,.027), side*1.255,1.07,3.23,-.62);
    P.addMudguard(`dardo-rear-${side}`, 'hullRubber', box(.46,.30,.026), side*1.255,.83,-3.22,.17);
    P.addEquipment('hullDetail', box(.30,.23,.24), side*1.15,1.37,2.97);
    P.addEquipment('hullGlass', cylZ(.070,.016,16), side*1.15,1.39,3.095);
    P.addEquipment('hullDetail', box(.29,.045,.25), side*1.15,1.505,2.99);
    for (const z of [-2.52,-1.69]) P.addHatch('hull',box(.77,.032,.67),side*.75,1.772,z);
    // Stern stowage rails are attached at every upright, not floating wires.
    for (const z of [-2.91,-2.25,-1.56]) P.addEquipment('hullDetail',cylY(.015,.015,.27,8),side*1.24,1.89,z);
    P.addEquipment('hullDetail',cylZ(.015,1.38,8),side*1.24,2.025,-2.235);
    for (const z of [-2.91,-1.56]) P.addEquipment('hullDetail',cylX(.015,.26,8),side*1.12,2.025,z);
    for (const z of [-2.7,2.38]) KIT.liftEye(P,'hullDetail',side*1.19,z>0?1.49:1.79,z);
  }
  // Right-side engine grille and the left-front driver cover establish Dardo's asymmetry.
  P.addEquipment('hullDark',box(.027,.40,1.61),1.413,1.50,.23);
  for (let i=0;i<15;i++) P.addEquipment('hullDetail',box(.036,.015,1.60),1.438,1.32+i*.026,.23);
  deckGrille(P,.70,1.758,.43,.84,1.54);
  P.addHatch('hull',box(.63,.043,.71),-.70,1.763,.88);
  for (const x of [-.91,-.70,-.49]) KIT.periscope(P,'hullDetail',x,1.815,1.17);
  P.addHatch('hull',box(1.16,1.10,.06),0,1.18,-3.30);
  for (const x of [-.54,.54]) P.addEquipment('hullDetail',cylX(.034,.14,12),x,.69,-3.35);
  P.addEquipment('hullDetail',box(.17,.028,.035),.39,1.28,-3.347);
  for (const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.29,.19,.15),side*1.10,1.44,-3.28);
    P.addEquipment('hullGlass',box(.21,.062,.014),side*1.10,1.46,-3.363);
  }
}

function buildTurret(P: TankBuilderPort): void {
  const [, py, pz] = P.spec.armor.turretPivot;
  P.add('turret',cylY(.73,.77,.075,32),0,.015,0);
  P.add('turret',armorLoft([
    [-1.45,.68,.91,.64,1.89,2.03,2.40],
    [-1.10,.79,1.01,.74,1.77,1.93,2.42],
    [.02,.82,1.04,.78,1.77,1.97,2.42],
    [.48,.56,.74,.54,1.80,2.02,2.34],
  ],py,pz));
  for (const side of [-1,1]) {
    P.addHatch('turret',cylY(.25,.27,.040,20),side*.41,.735,-.32);
    P.addCupola('turret',cylY(.285,.31,.07,20),side*.41,.68,-.32);
    for (let i=0;i<4;i++) {
      const a=i*Math.PI/2;
      KIT.periscope(P,'turretDetail',side*.41+.27*Math.sin(a),.766,-.32+.27*Math.cos(a),a);
    }
    smokeBank(P,side,.83,2.21,.09,4);
    // Rear bustle storage and tied-down lifting eyes follow the crew box.
    P.addEquipment('turretDetail',box(.20,.28,.78),side*.85,.45,-.73);
    KIT.liftEye(P,'turretDetail',side*.73,.70,-.61);
  }
  optic(P,-.38,2.475,.27,.27,.25,.29);
  optic(P,.38,2.47,.27,.20,.22,.23);
  antenna(P,.53,2.44,4.14,-1.02);
  P.addGunExtra(box(.47,.39,.53),0,0,.05);
  P.addGunExtra(cylZ(.10,.28,20),0,0,.40);
  P.add('gun',cylZ(.043,1.58,24),0,0,1.28);
  openTube(P,.052,2.04,2.45,.0125);
  P.addGunExtraDark(cylZ(.019,.55,12),-.285,-.065,.28);
}

export function buildDardo(P: TankBuilderPort): void {
  buildHull(P);
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'compact-ifv',
    wheelR:.355,wheelW:.32,wheelY:.432,wheelZs:[-2.14,-1.34,-.54,.26,1.06,1.86],
    xc:1.255,trackW:.45,trackTh:.025,
    sprocket:{z:2.60,y:.79,r:.285,trackR:.306,toothTipRadiusM:.327},
    idler:{z:-2.77,y:.76,r:.267,trackR:.284},
    rollers:[{z:-1.73,y:1.01,r:.09},{z:0,y:1.01,r:.09},{z:1.67,y:1.01,r:.09}],
    topY:1.11,botY:.044,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
  buildTurret(P);P.topY=.89;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretHatch']};
}
