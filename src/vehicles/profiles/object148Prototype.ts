// Owner-authored Object 148 development vehicle. This replaces the entire old
// production-shaped body; only the qualified seven-wheel course and main-gun
// dimensions are carried forward. All dimensions are metres in the rig frame.
import { KIT } from '../tankFactoryCore.ts';
import { FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { beginAuxiliaryStation } from './auxiliaryStation.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markEraHitFaces } from './eraHitFaces.ts';
import type { Modern2BuilderPort } from '../modern2.ts';

type Port = Modern2BuilderPort;
const { box, cylX, cylY, cylZ } = KIT;

/** A welded octagonal section: broad lower shoulders, narrower chamfered roof. */
function armorSection(z: number, halfWidth: number, bottom: number, roof: number,
  crown: number, bevel = .10): SolidSection {
  return { z, ring: [
    [-halfWidth + bevel, bottom], [halfWidth - bevel, bottom],
    [halfWidth, bottom + bevel], [halfWidth, roof - bevel],
    [crown, roof], [-crown, roof],
    [-halfWidth, roof - bevel], [-halfWidth, bottom + bevel],
  ] };
}

function mirror(section: SolidSection, side: number): SolidSection {
  if (side > 0) return section;
  return {z: section.z, ring: section.ring.map(([x,y]) => [-x,y] as SectionPoint).reverse()};
}

function mirrored(sections: readonly SolidSection[], side: number) {
  return sectionSolid(sections.map(section => mirror(section, side)));
}

function buildCrewHull(P: Port): void {
  // The deep center hull stays inside both shoe lanes. A separate shallow
  // shoulder deck bridges ABOVE their return course and end-wheel wraps.
  P.add('hull', sectionSolid([
    armorSection(-4.24,.94,.80,1.64,.82,.12),
    armorSection(-3.45,1.00,.35,1.65,.92,.12),
    armorSection(2.65,1.00,.35,1.67,.92,.12),
    armorSection(4.32,.90,.88,1.34,.78,.12),
  ]));
  P.add('hull', sectionSolid([
    {z:-4.24, ring:[[-1.58,1.565],[1.58,1.565],[1.62,1.69],[-1.62,1.69]]},
    {z:-3.72, ring:[[-1.75,1.565],[1.75,1.565],[1.63,1.76],[-1.63,1.76]]},
    {z:-1.45, ring:[[-1.75,1.565],[1.75,1.565],[1.64,1.68],[-1.64,1.68]]},
    {z:2.40, ring:[[-1.75,1.565],[1.75,1.565],[1.58,1.70],[-1.58,1.70]]},
    {z:3.86, ring:[[-1.55,1.445],[1.55,1.445],[1.48,1.535],[-1.48,1.535]]},
    {z:4.32, ring:[[-.90,1.25],[.90,1.25],[.78,1.34],[-.78,1.34]]},
  ]));
  // A long three-person protected capsule and stepped engine deck replace
  // the old flat deck, tiny hatch hood and shallow arrow-shaped bow.
  P.add('hull', sectionSolid([
    armorSection(.70,1.24,1.64,1.78,1.06,.055),
    armorSection(1.15,1.24,1.64,1.86,1.06,.055),
    armorSection(2.05,1.24,1.64,1.86,1.06,.055),
    armorSection(2.43,1.12,1.64,1.71,.95,.025),
  ]));
  for (const x of [-.70,0,.70]) {
    P.addEquipment('hullDetail',box(.53,.028,.64),x,1.871,1.56);
    P.add('hullDark',box(.43,.014,.025),x,1.893,1.81);
    for (const dx of [-.14,.14]) {
      P.addEquipment('hullDetail',box(.055,.04,.10),x+dx,1.894,1.27);
    }
    KIT.periscope(P,'hullDetail',x,1.873,2.02);
  }
  // Two broad, flush bow armor leaves retain a readable central seam.
  for (const side of [-1,1]) {
    P.destructibleCluster(`glacis_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('hull',markEraHitFaces(mirrored([
      {z:2.45,ring:[[.045,1.70],[1.49,1.70],[1.49,1.77],[.045,1.77]]},
      {z:3.74,ring:[[.045,1.554],[1.40,1.554],[1.40,1.624],[.045,1.624]]},
    ],side),[0,1,0])));
    for (const z of [2.64,3.45]) {
      P.add('hullDetail',box(.12,.045,.055),side*.91,1.762-(z-2.45)*.113,z,.112,0,0);
    }
  }
  // Engine service panels and physically seated cooling louvres.
  for (const side of [-1,1]) {
    P.addEquipment('hullDetail',box(1.19,.055,1.66),side*.80,1.766,-2.84);
    P.add('hullDark',box(.97,.015,1.26),side*.80,1.799,-2.84);
    for (let row=0;row<8;row++) {
      P.addEquipment('hullDetail',box(.98,.035,.065),side*.80,1.820,-3.38+row*.155,.2,0,0);
    }
    P.addEquipment('hullDetail',box(.54,.22,.16),side*1.05,1.53,-4.25);
    P.add('hullDark',box(.43,.135,.018),side*1.05,1.53,-4.339);
    for(let row=0;row<3;row++)P.add('hullDetail',box(.44,.021,.03),side*1.05,1.485+row*.045,-4.35);
    KIT.headlight(P,side*1.66,1.57,3.995,-.10,.075);
    P.add('hull',box(.22,.17,.43),side*1.67,1.56,3.77);
    P.add('hullDetail',box(.12,.10,.15),side*.72,1.04,4.22);
  }
  const cable=FITTINGS.towCable({mats:P.mats,r:.018,seed:148,
    pts:[[-.73,1.065,4.24],[-.30,.96,4.30],[.30,.96,4.30],[.73,1.065,4.24]]});
  P.hullG.add(cable);
  P.hullG.userData.object148Design={revision:2,crewCapsule:true,newHullShell:true};
}

function buildSideArmor(P: Port): void {
  for (const side of [-1,1]) {
    // Deliberately unequal removable development cassettes. The rear third
    // becomes open cage bays, exposing the seven-wheel suspension underneath.
    for (const [z,len,top] of [[2.96,1.36,1.65],[1.52,1.42,1.75],[.05,1.42,1.75]]) {
      P.destructibleCluster(`skirt_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('hull',markEraHitFaces(sectionSolid([z-len/2,z+len/2].map(zi=>mirror({z:zi,ring:[
        [1.70,.74],[1.80,.78],[1.93,1.07],[1.89,top-.09],[1.75,top],[1.70,top-.03],
      ]},side))),[side,0,0])));
      P.addEquipment('hullDetail',box(.025,.20,len-.16),side*1.923,1.18,z);
      for(const dz of [-len*.31,len*.31]) {
        P.add('hullDetail',cylX(.026,.018,8),side*1.94,1.18,z+dz);
        P.addEquipment('hullDetail',box(.08,.075,.16),side*1.77,top+.012,z+dz);
      }
      P.add('hullRubber',box(.045,.17,len-.04),side*1.72,.665,z);
    }
    // A fixed rail seated on the hull carries both genuinely open cage bays.
    P.add('hull',box(.19,.09,3.00),side*1.78,1.65,-2.24);
    for(const z of [-1.57,-2.94]) {
      for(const y of [.92,1.51])P.addEquipment('hullDetail',box(.045,.045,1.31),side*1.905,y,z);
      for(const dz of [-.63,0,.63])P.addEquipment('hullDetail',box(.045,.74,.04),side*1.905,1.28,z+dz);
      for(let row=0;row<4;row++)P.addEquipment('hullDetail',box(.038,.033,1.24),side*1.905,1.03+row*.12,z);
      for(const dz of [-.63,.63])P.addEquipment('hullDetail',box(.19,.06,.07),side*1.83,1.61,z+dz);
    }
    // High bridges and outer hangers join each guard to the skirt. Nothing
    // spans the idler/sprocket swept stock below their measured upper tangent.
    P.add('hull',box(.12,.075,.78),side*1.76,1.60,3.91);
    P.add('hullDetail',box(.10,.45,.10),side*1.74,1.405,4.24);
    P.addMudguard(`t14_front_mudguard_${side<0?'left':'right'}`,
      'hullRubber',box(.43,.32,.035),side*1.58,1.04,4.255);
    P.add('hull',box(.43,.075,.15),side*1.58,1.21,4.23);
    P.add('hull',box(.20,.10,.63),side*1.74,1.63,-3.89);
    P.add('hullDetail',box(.12,.29,.09),side*1.72,1.475,-4.16);
    P.addMudguard(`t14_rear_mudguard_${side<0?'left':'right'}`,
      'hullRubber',box(.46,.32,.035),side*1.56,1.17,-4.18);
    P.add('hull',box(.47,.075,.15),side*1.55,1.34,-4.16);
    P.decal('hull','number','148',.30,[side*1.944,1.17,1.52],side*Math.PI/2);
  }
}

function buildUnmannedTurret(P: Port): void {
  // Thin circular traverse race, then a complete new service bustle. There
  // is no old production shroud hidden inside these authored shells.
  P.add('turret',cylY(1.05,1.05,.12,48),0,.04,0);
  P.add('turretDark',cylY(1.065,1.065,.025,48),0,.107,0);
  P.add('turret',sectionSolid([
    armorSection(-2.30,.97,.25,.73,.79,.10),
    armorSection(-1.94,1.29,.15,.94,1.08,.12),
    armorSection(-.55,1.29,.12,.94,1.08,.12),
    armorSection(.12,.92,.12,.78,.72,.10),
  ]));
  // Independent left/right armor cheeks leave a wide open central channel.
  // The channel has a shallow sealed floor and no overhead bridging lid.
  P.add('turret',box(.78,.045,.52),0,.0875,.27);
  for (const side of [-1,1]) {
    P.add('turret',mirrored([
      {z:-.60,ring:[[.37,.13],[1.33,.13],[1.57,.34],[1.24,.95],[.43,.84],[.37,.65]]},
      {z:.53,ring:[[.37,.13],[1.37,.13],[1.54,.34],[1.25,.95],[.45,.82],[.37,.65]]},
      {z:1.34,ring:[[.39,.18],[1.20,.18],[1.39,.34],[1.20,.83],[.52,.76],[.39,.58]]},
    ],side));
    // Boxed returns surround a 560 x 250 mm sight aperture. The lenses are
    // 250 mm behind the mouth, rather than decals on solid frontal armor.
    P.add('turret',mirrored([
      {z:1.33,ring:[[.49,.70],[1.24,.70],[1.20,.83],[.52,.76]]},
      {z:1.66,ring:[[.59,.70],[1.22,.70],[1.17,.80],[.62,.78]]},
    ],side));
    P.add('turret',mirrored([
      {z:1.33,ring:[[.49,.27],[1.32,.27],[1.24,.45],[.49,.45]]},
      {z:1.73,ring:[[.59,.34],[1.23,.34],[1.22,.45],[.59,.45]]},
    ],side));
    for(const [x,w] of [[.54,.10],[1.255,.07]]) {
      P.add('turret',box(w,.28,.30),side*x,.575,1.48);
    }
    P.add('turretDark',box(.60,.28,.024),side*.915,.575,1.352);
    P.add('turretGlass',box(.29,.17,.018),side*.81,.575,1.374);
    for(const y of [.514,.637])P.add('turretGlass',box(.12,.073,.018),side*1.065,y,1.378);
    // Seated side access covers and a restrained exposed development rail.
    P.addEquipment('turretDetail',box(.035,.22,.62),side*1.43,.41,-.05,0,0,side*.45);
    for(const z of [-.26,.17])P.add('turretDetail',cylX(.027,.034,8),side*1.494,.35,z);
    // Paired angled APS banks have a real carrying bracket into the race.
    P.addEquipment('turretDetail',box(.25,.10,.71),side*1.19,.135,.28,0,side*.28,0);
    for(let k=0;k<3;k++) {
      P.addEquipment('turretDetail',cylZ(.065,.36,12),side*(1.22+k*.085),.215,.48-k*.23,-.12,side*.63,0);
    }
    P.addEquipment('turretDetail',box(.055,.37,.65),side*1.285,.54,-1.18);
    P.add('turretDark',box(.013,.21,.48),side*1.320,.54,-1.18);
    // Smoke banks sit on their own attached rear shoulder shelves.
    P.addEquipment('turretDetail',box(.29,.06,.62),side*1.18,.91,-1.40);
    for(let k=0;k<4;k++)P.add('turretDetail',markSmokeTube(cylY(.033,.033,.24,10),[0,1,0]),
      side*(1.10+k*.065),1.035,-1.4,0,0,side*.14);
  }
  // Roof service access, rear electronics cover and an open bustle rack.
  P.addEquipment('turretDetail',box(.70,.025,.76),.12,.952,-1.33);
  for(const z of [-1.62,-1.04])P.add('turretDetail',box(.32,.025,.035),.12,.977,z);
  for(const side of [-1,1]) {
    P.addEquipment('turretDetail',box(.075,.08,.57),side*.70,.37,-2.29);
    for(const y of [.35,.61])P.addEquipment('turretDetail',box(1.53,.035,.035),0,y,-2.55);
    P.addEquipment('turretDetail',box(.035,.29,.035),side*.75,.48,-2.55);
    P.addEquipment('turretDetail',cylY(.045,.06,.045,10),side*.82,.94,-1.82);
    const antenna=FITTINGS.antennaWhip({mats:P.mats,h:.73,r:.008,rake:side*.045,seed:148+side});
    antenna.name=`t14_rear_antenna_${side<0?'left':'right'}`;
    antenna.position.set(side*.82,.9625,-1.82);P.turretG.add(antenna);
  }
  P.turretG.userData.object148Design={revision:2,newTurretShell:true,
    openChannelHalfWidthM:.37,sightRecessDepthM:.25,roofCaliberMm:30};
}

function buildObservationTower(P: Port): void {
  // Instrumented prototype sight, asymmetrical to the compact remote weapon.
  P.addEquipment('turretDetail',sectionSolid([
    {z:-.70,ring:[[.51,.94],[.88,.94],[.82,1.21],[.57,1.21]]},
    {z:-.32,ring:[[.51,.86],[.88,.86],[.82,1.21],[.57,1.21]]},
  ]));
  P.addEquipment('turretDark',cylY(.095,.11,.15,16),.695,1.275,-.51);
  P.addEquipment('turretDetail',sectionSolid([
    armorSection(-.68,.23,1.31,1.55,.17,.055),
    armorSection(-.31,.20,1.31,1.55,.15,.055),
  ]),.695,0,0);
  P.add('turretDark',box(.30,.16,.02),.695,1.433,-.298);
  P.add('turretGlass',box(.17,.10,.014),.65,1.447,-.282);
  P.add('turretGlass',box(.058,.058,.014),.795,1.426,-.282);
}

function buildRoofCannon(P: Port): void {
  const x=-.57,z=-.91,deck=.94,axisY=1.21,pivotZ=-.68,muzzleZ=.94;
  P.addEquipment('turretDetail',cylY(.22,.25,.06,20),x,deck+.015,z);
  const station=beginAuxiliaryStation(P,{name:'t14_primary_remote_weapon',caliberMm:30,
    yaw:[x,deck+.045,z],pivot:[x,axisY,pivotZ],muzzle:[x,axisY,muzzleZ]});
  station.root.userData.stationVariant='object148-development-30mm';
  P.addEquipment('turretDetail',cylY(.18,.20,.075,20),x,deck+.0825,z);
  // The two vertical yoke arms connect the bearing to a transverse trunnion.
  for(const side of [-1,1])P.addEquipment('turretDetail',box(.055,.22,.23),x+side*.20,1.12,pivotZ);
  station.mark('yaw');
  P.add('turretDark',cylX(.060,.47,16),x,axisY,pivotZ);
  P.addEquipment('turretDetail',sectionSolid([
    armorSection(-1.15,.155,1.105,1.325,.12,.045),
    armorSection(-.51,.155,1.105,1.325,.12,.045),
  ]),x,0,0);
  P.addEquipment('turretDetail',box(.21,.23,.43),x-.25,axisY,-.93);
  P.add('turretDark',box(.22,.035,.40),x-.25,1.343,-.93);
  P.addEquipment('turretDetail',box(.17,.20,.24),x+.245,axisY,-.79);
  P.add('turretGlass',box(.103,.11,.014),x+.245,axisY,-.66);
  P.add('turretDark',cylZ(.079,.32,18),x,axisY,-.43);
  P.add('turretDark',cylZ(.047,1.04,18),x,axisY,.25);
  P.add('turretDark',cylZ(.063,.15,18),x,axisY,.845);
  P.add('turretDark',cylZ(.035,.02,16),x,axisY,.93);
  station.mark('pitch');
}

function buildGunAndSuspension(P: Port): void {
  // A new short, pitching armored cradle in the open channel. Its barrel
  // sleeve and trunnion now belong to the gun, rather than a fixed roof cap.
  P.addGunExtra(sectionSolid([
    armorSection(-.30,.255,-.215,.215,.20,.035),
    armorSection(.49,.245,-.215,.215,.20,.035),
    armorSection(.79,.17,-.165,.165,.135,.025),
  ]));
  P.addGunExtraDark(cylX(.125,.69,20),0,0,0);
  P.addGunExtra(cylZ(.155,.18,20),0,0,.82);
  KIT.buildGun(P,{len:5.64,r:.07,sleeve:true,evac:null,baseR:.15});
  muzzleBore(P,{len:5.64,r:.07});
  KIT.buildRunningGear(P,{
    style:'rubber',wheelR:.35,wheelW:.44,xc:1.34,dishR:.76,
    wheelZs:[2.85,1.963,1.076,.19,-.697,-1.584,-2.47],
    sprocket:{z:-3.42,y:1.08,r:.28},idler:{z:3.55,y:.94,r:.26},
    rollers:[2.2,.75,-.75,-2.2].map(z=>({z,y:1.12,r:.08})),
    trackW:.50,topY:1.28,contactZF:2.92,contactZR:-2.50,pinCapOuter:.24,
    paintedEnds:true,coveredTop:true,
  });
}

export function buildObject148Prototype(P: Port): void {
  buildCrewHull(P);
  buildSideArmor(P);
  buildUnmannedTurret(P);
  buildObservationTower(P);
  buildRoofCannon(P);
  buildGunAndSuspension(P);
  P.topY=3.16;
}
