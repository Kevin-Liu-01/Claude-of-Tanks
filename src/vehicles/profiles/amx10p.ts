// AMX-10P boat hull, Toucan II and Dragar: authored from photographic studies.
// Dimensions and configuration boundaries: docs/references/batches/amx10p-20260928.md.
import { KIT } from './kit.ts';
import { chassisLoft, armorLoft, openTube, optic, antenna, deckGrille, smokeBank } from './europeSourcePrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { addAmx10p25FieldKit } from './amx10pFieldKit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ } = KIT;

function buildHull(P: TankBuilderPort, upgraded: boolean): void {
  P.add('hull', chassisLoft([
    [-2.88, .83, 1.32, 1.25, .83, 1.18, 1.89],
    [-2.35, .86, 1.34, 1.25, .40, 1.18, 1.89],
    [.95, .86, 1.34, 1.25, .40, 1.18, 1.89],
    [1.88, .86, 1.34, 1.27, .49, 1.18, 1.82],
    [2.95, .87, 1.29, 1.28, 1.03, 1.28, 1.30],
  ], .89));
  // Folded trim vane sits on the falling bow, with hinge and support arms.
  P.addEquipment('hullDetail', box(2.18, .038, .80), 0, 1.565, 2.46, .447);
  P.addEquipment('hullDetail', cylX(.034, 2.18, 14), 0, 1.75, 2.10);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.035, .035, .56), side*.72, 1.60, 2.40, .447);
    // The thin fenders leave the five road wheels visible, unlike an MBT skirt.
    P.addEquipment('hullDetail', box(.50, .045, 4.74), side*1.155, 1.17, -.03);
    P.addMudguard(`amx10p-front-${side}`, 'hullRubber', box(.40, .23, .025), side*1.20,1.12,2.73,-.56);
    P.addMudguard(`amx10p-rear-${side}`, 'hullRubber', box(.40,.25,.025),side*1.20,.83,-2.78,.18);
    P.addEquipment('hullDetail', box(.23,.20,.23), side*1.12,1.62,2.17);
    P.addEquipment('hullGlass', cylZ(.060,.015,14),side*1.12,1.64,2.292);
    P.addEquipment('hullDetail',box(.26,.025,.28),side*1.12,1.735,2.19);
    // Vertical hull stiffeners and their paired footings are a defining feature.
    for (let i=0;i<9;i++) {
      const z=-2.32+i*.40;
      P.addEquipment('hullDetail',box(.028,.34,.027),side*1.305,1.54,z);
      for (const y of [1.36,1.72]) P.addEquipment('hullDetail',box(.038,.07,.075),side*1.307,y,z);
    }
    for (const z of [-2.23,-1.45]) {
      if (upgraded && side === -1 && z === -1.45) continue;
      P.addHatch('hull',box(.72,.028,.63),side*.62,1.914,z);
    }
    for (const z of [-2.56,1.77]) KIT.liftEye(P,'hullDetail',side*1.10,z>0?1.85:1.92,z);
    // Waterjet nozzles: annular lip, recessed blind termination, real rear face.
    P.addEquipment('hullDetail',cylZ(.19,.17,20),side*.78,.98,-2.82);
    P.addEquipment('hullDark',cylZ(.14,.015,20),side*.78,.98,-2.913);
    P.addEquipment('hullDetail',box(.29,.025,.025),side*.78,.98,-2.931);
    P.addEquipment('hullDetail',box(.025,.29,.025),side*.78,.98,-2.931);
    P.addEquipment('hullDetail',box(.18,.14,.06),side*1.17,1.60,-2.895);
    P.addEquipment('hullGlass',box(.12,.055,.014),side*1.17,1.62,-2.935);
  }
  P.addHatch('hull',box(.58,.035,.65),-.70,1.917,1.27);
  for (const x of [-.89,-.70,-.51]) KIT.periscope(P,'hullDetail',x,1.958,1.53);
  deckGrille(P,.66,1.913,.74,.76,1.57);
  // Circular right-side exhaust, protected by a louvered cage.
  P.addEquipment('hullDark',cylX(.18,.10,20),1.30,1.58,.42);
  for (let i=0;i<6;i++) P.addEquipment('hullDetail',box(.032,.022,.35),1.374,1.43+i*.06,.42);
  P.addHatch('hull',box(1.34,1.02,.04),0,1.36,-2.90);
  for (const side of [-1,1]) {
    P.addHatch('hull',box(.57,.83,.025),side*.32,1.37,-2.933);
    P.addEquipment('hullDetail',box(.12,.025,.035),side*.16,1.45,-2.96);
    P.addEquipment('hullDetail',cylX(.025,.19,12),side*.48,.89,-2.933);
  }
  if (upgraded) {
    // The separate commander station replaces the forward troop hatch and
    // stays behind the Dragar's complete swept envelope at every yaw angle.
    P.addCupola('hull',cylY(.23,.25,.075,24),-.82,1.92,-1.58);
    P.addHatch('hull',cylY(.22,.235,.035,24),-.82,1.974,-1.58);
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      KIT.periscope(P,'hullDetail',-.82+.235*Math.sin(a),1.977,-1.58+.235*Math.cos(a),a);
    }
  }
}

function buildToucan(P: TankBuilderPort): void {
  P.add('turret',cylY(.57,.61,.09,32),0,.02,0);
  // Low crew well and two asymmetrical cheek casings; the central weapon is
  // articulated above the roof rather than buried in a generic turret wedge.
  P.add('turret',armorLoft([
    [-.66,.44,.58,.46,.035,.22,.51],
    [-.18,.49,.65,.52,.035,.24,.57],
    [.47,.36,.49,.36,.035,.21,.46],
  ]));
  P.addCupola('turret',cylY(.255,.28,.11,24),-.20,.57,-.22);
  P.addHatch('turret',cylY(.255,.27,.035,24),-.20,.64,-.22);
  for (let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    KIT.periscope(P,'turretDetail',-.20+.27*Math.sin(a),.647,-.22+.27*Math.cos(a),a);
  }
  P.addEquipment('turretDetail',box(.24,.34,.53),-.42,.44,.12);
  optic(P,-.70,2.49,.24,.23,.22,.26);
  // Coax and the broad right-side searchlight cradle follow the main gun.
  P.addGunExtra(box(.25,.23,.52),0,0,-.03);
  P.addGunExtra(cylX(.12,.46,20),0,0,-.11);
  P.addGunExtra(box(.22,.27,.29),.22,.02,.05);
  P.addGunExtraDark(cylZ(.068,.023,18),.22,.02,.208);
  P.addGunExtraDark(cylZ(.018,.43,12),-.16,-.05,.17);
  P.add('gun',cylZ(.034,1.58,24),0,0,1.06);
  P.add('gun',cylZ(.065,.40,20),0,0,.27);
  openTube(P,.043,1.85,2.37,.01);
  for (const side of [-1,1]) smokeBank(P,side,.61,2.24,.17,2);
  antenna(P,-.58,2.49,4.10,-.51);
}

function buildDragar(P: TankBuilderPort): void {
  P.add('turret',cylY(.66,.70,.10,36),0,.02,0);
  P.add('turret',armorLoft([
    [-.94,.54,.73,.55,.035,.28,.66],
    [-.53,.64,.82,.64,.035,.29,.71],
    [.29,.64,.80,.57,.035,.27,.69],
    [.78,.36,.50,.32,.08,.30,.54],
  ]));
  P.addCupola('turret',cylY(.28,.32,.09,24),-.19,.715,-.31);
  P.addHatch('turret',cylY(.28,.29,.035,24),-.19,.77,-.31);
  for (let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    KIT.periscope(P,'turretDetail',-.19+.30*Math.sin(a),.77,-.31+.30*Math.cos(a),a);
  }
  optic(P,-.36,2.60,.54,.28,.26,.32);
  P.addEquipment('turretDetail',box(.19,.32,.73),.76,.39,-.26);
  P.addEquipment('turretDetail',box(1.03,.26,.17),0,.40,-.94);
  for (const side of [-1,1]) {
    smokeBank(P,side,.72,2.32,.39,2);
    KIT.liftEye(P,'turretDetail',side*.54,.70,-.51);
  }
  antenna(P,.47,2.59,4.20,-.72);
  P.addGunExtra(box(.35,.35,.43),0,0,-.05);
  P.addGunExtra(cylX(.23,.55,24),0,0,-.06);
  P.addGunExtra(cylZ(.105,.54,22),0,0,.30);
  P.addGunExtraDark(cylZ(.020,.50,14),.23,-.04,.19);
  P.add('gun',cylZ(.043,1.35,24),0,0,1.00);
  openTube(P,.055,1.64,2.10,.0125);
}

export function buildAmx10p(P: TankBuilderPort): void {
  const upgraded=P.spec.id==='amx10p_25';
  buildHull(P,upgraded);
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'compact-ifv',
    wheelR:.35,wheelW:.28,wheelY:.429,wheelZs:[-1.78,-.88,.02,.92,1.82],
    xc:1.205,trackW:.40,trackTh:.025,
    sprocket:{z:2.45,y:.73,r:.27,trackR:.296,toothTipRadiusM:.313},
    idler:{z:-2.47,y:.76,r:.25,trackR:.271},
    rollers:[{z:-1.70,y:.97,r:.083},{z:0,y:.97,r:.083},{z:1.62,y:.97,r:.083}],
    topY:1.065,botY:.044,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
  if(upgraded) buildDragar(P); else buildToucan(P);
  if(upgraded) addAmx10p25FieldKit(P);
  P.topY=upgraded?.88:.80;
  P.additionalShadowSources={hull:upgraded?['hullHatch','hullCupola','hullExternalArmor']:['hullHatch','hullCupola'],turret:['turretHatch']};
}
