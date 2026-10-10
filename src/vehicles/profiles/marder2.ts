import { markVehicleNightLens } from '../vehicleNightLighting.ts';
// Photo-led Marder 2 VT 001 / TS503. No Puma donor geometry is used.
// Dimensions of individual fittings are photographic estimates; see reference packet.
import { KIT } from './kit.ts';
import { MARDER2_TURRET_SCALE as T } from '../marder2Frame.ts';
import { armorLoft, optic, antenna, openTube, smokeBank } from './europeSourcePrimitives.ts';
import { sectionSolid } from './sectionSolid.ts';
import { mirrorX } from '../runningGearPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylY,cylX,cylZ}=KIT;

export function buildMarder2(P: TankBuilderPort): void {
  // The narrow lower tub rises vertically inside the belt. The broad upper
  // shoulders start above the complete shoe envelope, leaving a real track tunnel.
  P.add('hull',sectionSolid([
    [-3.655,1.10,1.66,1.53,.44,1.38,2.01],
    [-3.32,1.12,1.72,1.57,.44,1.38,2.01],
    [1.16,1.12,1.72,1.54,.44,1.38,2.01],
    [2.22,1.10,1.70,1.48,.47,1.38,1.82],
    [3.10,1.02,1.17,1.16,.67,1.30,1.38],
    [3.655,.92,1.16,1.14,.78,1.02,1.09],
  ].map(([z,belly,shoulder,roofHalf,floor,knee,roof])=>({z,ring:[
    [-belly,floor],[belly,floor],[belly,knee],[shoulder,knee],
    [roofHalf,roof],[-roofHalf,roof],[-shoulder,knee],[-belly,knee],
  ]})), {sideQuadDiagonal:'convex'}));
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',dishR:.72,wheelR:.385,wheelW:.25,wheelY:.49,xc:1.47,
    wheelZs:[2.32,1.52,.72,-.08,-.88,-1.68,-2.48],
    sprocket:{z:3.03,y:.86,r:.39},idler:{z:-3.14,y:.85,r:.35},
    rollers:[{z:1.98,y:1.16},{z:.61,y:1.16},{z:-.75,y:1.16},{z:-2.02,y:1.16}],rollerR:.085,
    trackW:.52,trackTh:.09,topY:1.29,botY:.055,trackPattern:'compact-ifv',
    linkPitchM:.15,paintedEnds:true,arms:true,coveredTop:false,contactZF:2.71,contactZR:-2.87,
  });
  for(const side of [-1,1]) {
    // Single plain skirt course with real hinge seams, not modern Puma AMAP blocks.
    P.add('hull',box(.30,.13,7.25),side*1.755,1.435,-.08);
    for(let i=0;i<7;i++) {
      const z=-3.20+i*.98;
      P.addExternalArmor('hull',box(.065,.57,.954),side*1.8875,1.08,z);
      for(const y of [.83,1.31]) for(const dz of [-.41,.41])
        P.addEquipment('hullDetail',cylX(.014,.016,8),side*1.926,y,z+dz);
      P.addEquipment('hullDetail',cylZ(.032,.18,10),side*1.915,1.388,z+.31);
    }
    // Deep diagonal side ventilation: distinct broad grilles in the forward shoulders.
    P.addEquipment('hullDark',box(.018,.43,1.95),side*1.725,1.60,1.09);
    for(let i=0;i<10;i++) {
      const y=1.405+i*.044,front=2.18-i*.092;
      P.addEquipment('hullDetail',box(.07,.020,front-.12),side*1.743,y,(front+.12)/2);
    }
    for(const z of [-2.76,-1.77,-.78]) {
      P.addEquipment('hullDetail',box(.024,.50,.84),side*1.696,1.62,z,0,0,-side*.19);
      for(const dz of [-.33,.33]) P.addEquipment('hullDetail',cylX(.022,.024,10),side*1.72,1.85,z+dz);
    }
    P.addEquipment('hullRubber',box(.49,.55,.034),side*1.47,1.105,-3.69);
    P.addEquipment('hullDetail',box(.33,.19,.23),side*1.02,1.22,3.32);
    P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.059,.012,16), 'headlight'),side*1.02,1.24,3.442);
    KIT.liftEye(P,'hullDetail',side*.78,1.13,3.30);
    KIT.liftEye(P,'hullDetail',side*1.28,2.035,-3.05);
    for(const z of [-2.88,-2.45,-2.02]) KIT.periscope(P,'hullDetail',side*.90,2.03,z);
    // Mirrors attach through a short steel stalk to the glacis shoulder.
    P.addEquipment('hullDark',cylY(.014,.016,.42,8),side*1.25,1.54,2.82);
    P.addEquipment('hullDark',box(.12,.28,.033),side*1.25,1.83,2.82);
    P.addEquipment('hullGlass',box(.09,.24,.009),side*1.25,1.83,2.80);
  }
  P.addHatch('hull',box(.64,.045,.63),.64,2.03,1.01);
  for(const dx of [-.20,0,.20]) KIT.periscope(P,'hullDetail',.64+dx,2.06,1.36);
  P.addHatch('hull',box(1.42,.045,1.07),0,2.034,-2.63);
  P.addHatch('hull',box(1.67,1.29,.06),0,1.18,-3.67);
  for(const x of [-.72,.72]) for(const y of [.80,1.55]) P.addEquipment('hullDetail',box(.17,.11,.09),x,y,-3.70);
  P.addEquipment('hullDark',box(.08,.21,.04),.60,1.33,-3.72);
  for(let i=0;i<12;i++) P.addEquipment('hullDetail',box(.86,.018,.032),-.70,2.027,.94-i*.082);

  const [,py,pz]=P.spec.armor.turretPivot;
  P.add('turret',cylY(.92,.98,.11,40),0,.018,0);
  // Tall TS503 two-man fighting compartment, square bustle and sharply raked front.
  P.add('turret',armorLoft([
    [-1.55,.85,1.09,1.04,.08,.44,.85],
    [-1.25,.90,1.12,1.06,.04,.44,.89],
    [.20,.92,1.12,1.01,.04,.43,.90],
  ],0,0,{sideQuadDiagonal:'convex'}));
  // Separate cheek solids leave the real elevation bay open around the mask.
  // A solid front loft would swallow the canvas collar when the gun pitches.
  for (const side of [-1,1]) {
    const cheek = sectionSolid([
      {z:.18,ring:[[.39,.04],[.92,.04],[1.12,.43],[1.01,.90],[.39,.90]]},
      {z:.82,ring:[[.39,.06],[.83,.06],[1.00,.37],[.62,.89],[.39,.89]]},
      {z:1.25,ring:[[.39,.08],[.57,.08],[.74,.29],[.42,.59],[.39,.59]]},
    ], {sideQuadDiagonal:'convex'});
    P.add('turret',side<0?mirrorX(cheek):cheek);
    P.add('turret',cylX(.15,.18,20),side*.39,.54,1.12);
  }
  P.add('turret',box(.79,.08,1.02),0,.08,.70);
  for(const side of [-1,1]) {
    P.addHatch('turret',cylY(.285,.30,.046,28),side*.52,.924,-.37);
    for(const dx of [-.18,0,.18]) KIT.periscope(P,'turretDetail',side*.52+dx,.958,-.045);
    for(const z of [-1.29,-.79,-.29,.20]) {
      P.addEquipment('turretDetail',cylX(.026,.016,12),side*1.116,.46,z);
      P.addEquipment('turretDetail',cylX(.021,.016,12),side*1.077,.79,z);
    }
    smokeBank(P,side,1.08,py+.30,pz-.16,6);
    antenna(P,side*.84,py+.85,3.90,pz-1.18);
    P.addEquipment('turretDetail',box(.033,.10,.73),side*.73,.95,-.97);
  }
  optic(P,.51,py+.96,pz+.33,.27,.18,.23);
  optic(P,-.43,py+.72,pz+.83,.26,.22,.19);
  // The rocking armored mask and its canvas collar share elevation. Only the
  // long cylindrical barrel recoils; nothing is glued across both frames.
  P.addGunExtra(box(.57,.43,.35),0,0,.02);
  P.add('gunMountCanvasSkin',armorLoft([
    [-.24,.26,.35,.33,-.31,-.05,.31],
    [.02,.23,.30,.28,-.25,-.04,.25],
  ]));
  P.addGunExtraDark(cylX(.105,.055,20),-.31,.015,0);
  P.addGunExtraDark(cylX(.105,.055,20),.31,.015,0);
  P.add('gun',cylZ(.115,.40,24),0,0,.22);
  openTube(P,.055,.34,4.835,.025 / T);
  P.add('gun',cylZ(.071,.13,24),0,0,4.56);
  P.addGunExtraDark(cylZ(.022,.46,12),.25,-.13,.36);
  // Bake around the unchanged bearing; the gun pivot is already installed
  // at 90% by the spec. Keep the physical 50 mm bore and all owner rigs at scale 1.
  P.scaleBuckets(['turret', 'turretHatch', 'turretDetail', 'turretDark',
    'turretGlass', 'gun', 'gunDark', 'gunMount', 'gunMountDark',
    'gunMountCanvasSkin'], T, T, T);
  P.muzzleZ *= T;
  P.physicalMuzzleBore = { outerRadiusM: .055 * T, innerRadiusM: .025, depthM: .20 * T };
  P.topY=(3.90-py)*T;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretHatch']};
}
