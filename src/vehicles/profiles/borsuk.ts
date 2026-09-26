// Polish amphibious Borsuk with the unmanned ZSSW-30 and twin Spike LR mount.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { chassisLoft, armorLoft, sideWall, openTube, optic, antenna, turretEquipment, mirrorX } from './europeSourcePrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { weaponAssembly } from './weaponStock.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ}=KIT;

function buildHull(P: TankBuilderPort): void {
  P.add('hull',chassisLoft([
    [-3.68,.92,1.51,1.40,.80,1.31,2.05],
    [-2.98,1.01,1.53,1.41,.42,1.31,2.05],
    [1.02,1.01,1.53,1.41,.42,1.31,2.05],
    [2.24,1.01,1.53,1.42,.65,1.31,1.94],
    [3.66,1.00,1.47,1.41,1.13,1.31,1.62],
  ],1.055));
  // Buoyancy/armor cassettes have a continuous upper belt, individual lower
  // doors and circular fastener recesses characteristic of the supplied photo.
  for (const side of [-1,1]) {
    for (let i=0;i<6;i++) {
      const z=-2.73+i*.93, roof=z>1?2.02-(z-1)*.12:2.05;
      sideWall(P,side,1.61,1.685,[[z-.45,.84,roof-.025],[z+.45,.84,roof-.025]]);
      P.addEquipment('hullDark',box(.008,.016,.89),side*1.69,1.28,z);
      for (const dz of [-.31,.31]) {
        P.addEquipment('hullDark',cylX(.053,.010,16),side*1.693,roof-.17,z+dz);
        P.addEquipment('hullDetail',cylX(.020,.017,8),side*1.703,roof-.17,z+dz);
        P.addEquipment('hullDetail',box(.035,.13,.07),side*1.71,1.18,z+dz);
      }
    }
    // End cells taper upward to remain clear of the complete moving shoes.
    sideWall(P,side,1.625,1.68,[[-3.65,1.36,2.04],[-3.19,.84,2.04]]);
    sideWall(P,side,1.50,1.66,[[2.39,1.25,1.85],[3.54,1.54,1.64]]);
    P.addMudguard(`borsuk-front-${side}`,'hullRubber',box(.53,.25,.028),side*1.34,1.27,3.61,-.57);
    P.addMudguard(`borsuk-rear-${side}`,'hullRubber',box(.51,.28,.028),side*1.34,.96,-3.41,.10);
    P.addEquipment('hullDark',box(.37,.16,.026),side*1.17,1.80,2.99,-.23);
    for (const dx of [-.085,.085]) P.addEquipment('hullGlass',cylZ(.045,.022,16),side*1.17+dx,1.80,3.013,-.23);
    KIT.liftEye(P,'hullDetail',side*1.23,1.58,3.50);
    // Wing mirrors have continuous stalks fixed to the front deck.
    P.addEquipment('hullDark',cylY(.014,.014,.38,8),side*1.18,2.00,2.15);
    P.addEquipment('hullDetail',box(.15,.21,.043),side*1.18,2.24,2.15);
    P.addEquipment('hullGlass',box(.12,.175,.008),side*1.18,2.24,2.123);
    for (const z of [-2.83,-1.97]) P.addHatch('hull',box(.86,.03,.65),side*.73,2.07,z);
  }
  // Stowed bow wave-breaker is a sloping plate; the ramp closes the stern.
  P.addExternalArmor('hull',box(2.52,.040,.85),0,1.824,2.85,.22);
  for (const x of [-.82,.82]) P.addEquipment('hullDetail',cylX(.032,.17,12),x,1.929,2.47);
  P.addHatch('hull',box(.61,.042,.68),-.79,2.065,1.13);
  for (const x of [-.98,-.79,-.60]) KIT.periscope(P,'hullDetail',x,2.114,1.40);
  P.addEquipment('hullDark',box(.97,.022,1.14),.70,2.058,.75);
  for (let i=0;i<13;i++) P.addEquipment('hullDetail',box(.94,.014,.033),.70,2.08,.25+i*.081);
  P.addHatch('hull',box(1.21,1.17,.065),0,1.41,-3.70);
  for (const x of [-.56,.56]) P.addEquipment('hullDetail',cylX(.040,.16,12),x,.865,-3.75);
  P.addEquipment('hullDetail',box(.16,.03,.032),.41,1.47,-3.747);
  for (const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.28,.14,.12),side*1.21,1.82,-3.69);
    P.addEquipment('hullGlass',box(.21,.07,.014),side*1.21,1.82,-3.76);
    // Twin water-jet outlets recessed into stern shoulders, closed internally.
    P.addEquipment('hullDetail',cylZ(.20,.18,20),side*1.17,.98,-3.70);
    P.addEquipment('hullDark',cylZ(.155,.012,20),side*1.17,.98,-3.797);
    for (let i=-2;i<=2;i++) P.addEquipment('hullDetail',box(.25,.020,.024),side*1.17,.98+i*.05,-3.807);
  }
}

function buildTurret(P: TankBuilderPort): void {
  const [,py,pz]=P.spec.armor.turretPivot;
  P.add('turret',cylY(.82,.87,.08,32),0,.025,0);
  P.add('turret',armorLoft([
    [-1.88,.72,.98,.85,2.18,2.42,2.92],
    [-1.46,.91,1.16,1.02,2.08,2.34,2.94],
    [.26,.93,1.18,.99,2.08,2.35,2.94],
    [.46,.74,1.00,.82,2.11,2.37,2.87],
  ],py,pz));
  for (const side of [-1,1]) {
    // Split forward cheeks, leaving an actual cradle opening through elevation.
    const cheek=sectionSolid([
      {z:.22-pz,ring:[[.32,2.18-py],[1.17,2.34-py],[.99,2.94-py],[.32,2.94-py]]},
      {z:.95-pz,ring:[[.32,2.30-py],[.88,2.40-py],[.70,2.85-py],[.32,2.85-py]]},
    ]);
    P.add('turret',side<0?mirrorX(cheek):cheek);
    for (const z of [-1.40,-1.04,-.68,-.32,.04]) {
      turretEquipment(P,'turretDark',cylX(.025,.018,8),side*1.139,2.63,z);
      turretEquipment(P,'turretDetail',cylX(.014,.024,6),side*1.15,2.63,z);
    }
    // Three smoke launchers per side, distinct from the Spike battery.
    for (let i=0;i<3;i++) {
      turretEquipment(P,'turretDetail',cylZ(.052,.25,12),side*(1.02+i*.095),2.40,-.12-i*.06,-.32,side*.12);
      turretEquipment(P,'turretDark',cylZ(.040,.014,12),side*(1.03+i*.095),2.44,.005-i*.06,-.32,side*.12);
    }
  }
  optic(P,-.62,2.66,.79,.42,.29,.23);
  turretEquipment(P,'turretDetail',cylY(.17,.19,.12,20),-.24,2.98,-.63);
  optic(P,-.24,3.12,-.59,.42,.26,.33);
  antenna(P,.61,2.96,4.35,-1.45);
  P.addHatch('turret',box(.56,.035,.60),.46,2.96-py,-.87-pz);
  P.addGunExtra(box(.52,.38,.61),0,0,.08);
  P.addGunExtra(cylZ(.10,.25,20),0,0,.51);
  P.add('gun',cylZ(.05,1.36,24),0,0,1.25);
  openTube(P,.060,1.90,2.35,.015);
  P.addGunExtraDark(cylZ(.020,.65,12),.31,-.035,.27);
}

function buildSpike(P: TankBuilderPort): void {
  weaponAssembly(P,()=>{
    // Two forward-facing launch mouths, gun-frame metadata is deliberately not
    // used: this remote pod follows turret yaw, independently of cannon pitch.
    turretEquipment(P,'turretDetail',box(.18,.39,.36),1.12,2.67,-.66);
    for (const x of [1.1375,1.5425]) turretEquipment(P,'turretDetail',box(.035,.52,1.48),x,2.69,-.45);
    for (const y of [2.4475,2.9325]) turretEquipment(P,'turretDetail',box(.44,.035,1.48),1.34,y,-.45);
    turretEquipment(P,'turretDetail',box(.44,.52,.035),1.34,2.69,-1.2075);
    for (const y of [2.565,2.815]) {
      const tube=new THREE.CylinderGeometry(.106,.106,.15,24,1,true).rotateX(Math.PI/2);
      turretEquipment(P,'turretDark',tube,1.34,y,.21);
      turretEquipment(P,'turretDetail',new THREE.RingGeometry(.083,.108,24),1.34,y,.29);
      // The recessed end plate spans the sleeve, not only the smaller front
      // aperture. Finite stock closes the annular gap from rear oblique views.
      turretEquipment(P,'turretDark',cylZ(.107,.025,24),1.34,y,.20);
      // Match the inward-facing finite bore used by the shared cannon mouth.
      const mouth=new THREE.CylinderGeometry(.083,.083,.09,24,1,true).rotateX(Math.PI/2);
      const index=mouth.index!;
      for(let i=0;i<index.count;i+=3){const a=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,a);}
      mouth.computeVertexNormals();
      turretEquipment(P,'turretDark',mouth,1.34,y,.245);
    }
  });
}

export function buildBorsuk(P: TankBuilderPort): void {
  buildHull(P);
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'compact-ifv',
    wheelR:.365,wheelW:.35,wheelY:.442,wheelZs:[-2.37,-1.49,-.61,.27,1.15,2.03],
    xc:1.34,trackW:.51,trackTh:.025,
    sprocket:{z:2.88,y:.88,r:.30,trackR:.321,toothTipRadiusM:.345},
    idler:{z:-3.01,y:.83,r:.28,trackR:.298},
    rollers:[{z:-1.96,y:1.105,r:.095},{z:-.20,y:1.105,r:.095},{z:1.58,y:1.105,r:.095}],
    topY:1.21,botY:.044,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
  buildTurret(P);buildSpike(P);P.topY=1.25;
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretHatch']};
}
