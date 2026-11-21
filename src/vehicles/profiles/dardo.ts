import { markVehicleNightLens } from '../vehicleNightLighting.ts';
// Dardo production IFV: HITFIST 25 turret and six-wheel Italian chassis.
// Dimensions and photographed equipment: docs/references/batches/europe-ifvs-20260925.md.
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { reserveDecorVolume } from './fieldChest.ts';
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
      // a hinge web across the 11 cm between the hull's 1.40 shoulder and the section's top edge, over the track's
      // top run (owner 2026-10-19 sweep: every section floated beside the hull)
      P.addEquipment('hullDetail', box(.13, .045, .80), side * 1.445, 1.2375, z);   // a carrier, not armour
      P.addEquipment('hullDetail', box(.043, .035, .64), side*1.545, 1.27, z);
      for (const dz of [-.29, .29]) {
        P.addEquipment('hullDetail', box(.025, .15, .035), side*1.545, .64, z+dz);
        P.addEquipment('hullDetail', box(.025, .025, .13), side*1.545, .57, z+dz+.05);
      }
    }
    P.hangMudguard(`dardo-front-${side}`, 'hullRubber', box(.47,.30,.027), side*1.255,1.07,3.23,-.62);
    P.hangMudguard(`dardo-rear-${side}`, 'hullRubber', box(.46,.30,.026), side*1.255,.83,-3.22,.17);
    P.addEquipment('hullDetail', box(.30,.23,.24), side*1.15,1.37,2.97);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.070,.016,16), 'headlight'), side*1.15,1.39,3.095);
    P.addEquipment('hullDetail', box(.29,.045,.25), side*1.15,1.505,2.99);
    for (const z of [-2.52,-1.69]) P.addHatch('hull',box(.77,.032,.67),side*.75,1.772,z);
    // Stern stowage rails are attached at every upright, not floating wires.
    for (const z of [-2.91,-2.25,-1.56]) P.addEquipment('hullDetail',cylY(.015,.015,.28,8),side*1.24,1.885,z); // feet 5 mm into the 1.75 roof (they stood 5 mm over it)
    P.addEquipment('hullDetail',cylZ(.015,1.38,8),side*1.24,2.025,-2.235);
    for (const z of [-2.91,-1.56]) P.addEquipment('hullDetail',cylX(.015,.26,8),side*1.12,2.025,z);
    for (const z of [-2.7,2.38]) KIT.liftEye(P,'hullDetail',side*1.19,z>0?1.475:1.775,z); // seated: they stood 15 mm off
  }
  // Right-side engine grille and the left-front driver cover establish Dardo's asymmetry.
  // 2026-10-19 (owner float sweep): the grille stood 14 mm off the inward-leaning side; set onto it.
  P.addEquipment('hullDark',box(.027,.40,1.61),1.384,1.50,.23);
  for (let i=0;i<15;i++) P.addEquipment('hullDetail',box(.036,.015,1.60),1.409,1.32+i*.026,.23);
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

/** The HITFIST mantlet's section (gun-local, viewed from +Z): a welded block, wider on the coaxial side (-x), every
 * edge chamfered by `c`. */
const mantletRing=(left:number,right:number,low:number,high:number,c:number):SectionPoint[]=>[
  [left+c,low],[right-c,low],[right,low+c],[right,high-c],[right-c,high],[left+c,high],[left,high-c],[left,low+c],
];

/** The 25 mm KBA's external mantlet, gun-local (trunnion origin, +z along the bore), pitching with the gun from -10 to
 * +60 degrees (owner 2026-11-20: "give the dardo a special actual turret with mantlet"). It replaces the plain
 * 0.47 x 0.39 x 0.53 box and loose collar the gun carried since 2026-09-25:
 * - the trunnion drum across the turret's nose (r 0.20, its axis the gun pivot), so the joint stays closed through the
 *   whole elevation arc;
 * - the welded shield block in front of it, 0.58 wide and 0.39 tall, its face chamfered back to a smaller front ring;
 * - the coaxial 7.62 mm in the shield's face beside the cannon (it hung 31 mm clear of the old box on a clamp);
 * - the barrel's armoured sleeve, flange and step-down collar to the tube, and four flush bolts on the face. */
function addHitfistMantlet(P: TankBuilderPort): void {
  const n=P.q?32:16;
  P.addGunExtra(cylX(.20,.60,n),-.02,0,0);
  P.addGunExtra(sectionSolid([
    {z:-.02,ring:mantletRing(-.31,.27,-.19,.20,.05)},
    {z:.21,ring:mantletRing(-.31,.27,-.19,.20,.05)},
    {z:.30,ring:mantletRing(-.28,.24,-.16,.17,.07)},
  ]));
  for(const x of [-.335,.295]) P.addGunExtraDark(cylX(.085,.03,P.q?20:12),x,0,0);   // trunnion caps on the drum's ends
  P.addGunExtra(cylZ(.088,.024,n),0,-.01,.312);                                     // sleeve flange on the face
  P.addGunExtra(cylZ(.074,.15,n),0,0,.395);                                         // armoured sleeve
  P.addGunExtra(cylZ(.058,.05,n),0,0,.495);                                         // step-down collar to the tube
  // the coaxial MG's port: a raised collar in the face, its dark mouth and the muzzle standing just proud of it
  P.addGunExtra(cylZ(.034,.03,P.q?16:10),-.20,-.07,.315);
  P.addGunExtraDark(cylZ(.019,.006,P.q?16:10),-.20,-.07,.333);
  P.addGunExtraDark(cylZ(.011,.09,P.q?12:8),-.20,-.07,.375);
  for(const [x,y] of [[-.23,.12],[.17,.12],[.17,-.10],[-.08,-.11]] as const) P.addGunExtraDark(cylZ(.013,.01,8),x,y,.303);
}

function buildTurret(P: TankBuilderPort): void {
  const [, py, pz] = P.spec.armor.turretPivot;
  // Release 240 (the owner: "make sure all tank turrets have a proper turret ring/attachment area"): the ring collar is
  // coaxial and its foot (0.77) reaches past the seat's keep radius (rim 0.711 + 2 cm, turretSeatRace.ts), which lifted
  // that rim and its bottom cap over its top and turned it inside out (gun-junction openings beside the 25 mm). The seat
  // keeps it as built (a body of revolution turns unseen), and it stands up to the seated floor (1.815) so the seam
  // over the deck reads as the collar, not a slot under the turret.
  P.turretG.userData.turretSeatKeepR=.79;
  P.add('turret',cylY(.73,.77,.1125,32),0,.03375,0);
  // The welded two-man shell: sloped sides over the knee, and (2026-11-20) a wedge nose instead of the flat 1.48 m front
  // wall: the upper front plate falls 0.28 m from the roof edge to the nose at the trunnion, the lower plate rises to
  // it, and the sides close in to the mantlet, as the HITFIST's front plates do.
  P.add('turret',armorLoft([
    [-1.45,.68,.91,.64,1.89,2.03,2.40],
    [-1.10,.79,1.01,.74,1.77,1.93,2.42],
    [.02,.82,1.04,.78,1.77,1.97,2.42],
    [.28,.80,1.01,.76,1.77,1.98,2.42],
    [.62,.50,.60,.46,1.97,2.06,2.14],
  ],py,pz));
  for (const side of [-1,1]) {
    P.addHatch('turret',cylY(.25,.27,.040,20),side*.41,.735,-.32);
    P.addCupola('turret',cylY(.285,.31,.07,20),side*.41,.68,-.32);
    for (let i=0;i<4;i++) {
      const a=i*Math.PI/2;
      KIT.periscope(P,'turretDetail',side*.41+.27*Math.sin(a),.766,-.32+.27*Math.cos(a),a);
    }
    smokeBank(P,side,.83,2.21,.02,4);
    // 2026-11-20: the bank's bracket and tubes (turret-local x 0.76-0.97, y 0.41-0.67, z 0.04-0.62) are the decor's to
    // keep out of. The wedge front reseated the decor's cheek smoke banks forward, which freed this side station, and the
    // turret-side tarp hung on it over these tubes (on main it found no station and dropped).
    reserveDecorVolume(P.turretG,side<0?[-.99,.39,.02]:[.74,.39,.02],side<0?[-.74,.69,.64]:[.99,.69,.64]);
    // Rear bustle storage and tied-down lifting eyes follow the crew box.
    P.addEquipment('turretDetail',box(.20,.28,.78),side*.85,.45,-.73);
    KIT.liftEye(P,'turretDetail',side*.73,.70,-.61);
  }
  // The gunner's and commander's sight heads stand at the roof's front edge, behind the upper front plate.
  optic(P,-.38,2.475,.20,.27,.25,.29);
  optic(P,.38,2.47,.20,.20,.22,.23);
  antenna(P,.53,2.418,4.14,-1.02); // 2026-10-19 (owner float sweep): base stood 20 mm over the roof
  addHitfistMantlet(P);
  P.add('gun',cylZ(.043,1.58,24),0,0,1.28);
  openTube(P,.052,2.04,2.45,.0125);
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
