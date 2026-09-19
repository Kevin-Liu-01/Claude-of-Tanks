// Independent Sabra Mk.2 source study, with permanent shaped armor and open rack.
import * as THREE from 'three';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import { sectionSolid } from './sectionSolid.ts';
import { KIT, FITTINGS } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { armorLoft, turretEquipment, openTube, optic, antenna, smokeBank, deckGrille, mirrorX } from './europeSourcePrimitives.ts';
const {box,cylY,cylZ,cylX}=KIT;

/** Source Object_4 has a thin curved crown, folded side edges and a short
 * sloping terminal sheet. These sparse stations are measured dimensions;
 * sectionSolid independently constructs closed stock, not source triangles. */
function addFrontFender(P: TankBuilderPort, side: number): void {
  const crownRows = [
    [2.330, 1.4386], [2.60, 1.43945], [2.70, 1.43881],
    [2.80, 1.43174], [2.90, 1.40858], [3.00, 1.37224],
    [3.05, 1.34719], [3.15, 1.29577], [3.25, 1.24495],
    [3.30, 1.21954], [3.313, 1.21293],
  ];
  const crown = sectionSolid(crownRows.map(([z,y]) => ({z,ring:[
    [1.010,y-.080],[1.028,y-.080],[1.035,y-.032],[1.055,y-.026],
    [1.695,y-.026],[1.725,y-.035],[1.733,y-.080],[1.752,y-.080],
    [1.750,y-.045],[1.745,y-.026],[1.735,y-.011],[1.720,y-.004],
    [1.700,y],[1.060,y],[1.030,y-.006],[1.020,y-.018],[1.010,y-.032],
  ]})));
  if (side < 0) mirrorX(crown);
  P.addMudguard(`sabra-front-crown-${side}`, 'hull', crown);

  // The source terminal folds back above the sheet, leaving a real narrow
  // channel under its return. Only the forward web closes that channel.
  for (const [part, rows] of [
    ['web', [[3.310,1.197,1.214],[3.328,1.221,1.231]]],
    ['return', [[3.299,1.2375,1.2435],[3.334,1.2218,1.2278]]],
  ] as const) {
    const lip=sectionSolid(rows.map(([z,bottom,top])=>({z,ring:[
      [1.030,bottom],[1.735,bottom],[1.735,top],[1.030,top],
    ]})));
    if(side<0)mirrorX(lip);
    P.addMudguard(`sabra-front-${part}-${side}`, 'hull', lip);
  }
  // Twelve-millimetre terminal sheet follows the source's downward slope;
  // the old upright 240mm flap was detached and hid the curved fender.
  const flap=sectionSolid([
    [3.307,1.2275,0],[3.330,1.1995,0],[3.350,1.1750,0],
    [3.400,1.1084,.014],[3.442,1.0490,.026],
  ].map(([z,y,edgeLift])=>({z,ring:[
    [1.015,y+edgeLift-.028],[1.045,y+edgeLift-.012],
    [1.300,y-.012],[1.450,y-.012],[1.710,y+edgeLift-.012],
    [1.747,y+edgeLift-.028],[1.747,y+edgeLift-.014],
    [1.710,y+edgeLift],[1.450,y],[1.300,y],[1.045,y+edgeLift],
    [1.015,y+edgeLift-.014],
  ]})));
  if(side<0)mirrorX(flap);
  P.addMudguard(`sabra-front-${side}`, 'hullRubber', flap);
}

function addSabraHeadlamps(P: TankBuilderPort, side: number): void {
    // Source has two 100mm lamps in each raised, open protective housing.
    // Their narrow pedestal meets the glacis; no solid guard covers the glass.
    const lampX=side*.7473,lampY=1.31665;
    P.addEquipment('hullDetail',box(.100,.075,.102),lampX,1.1062,3.1504);
    P.addEquipment('hullDetail',cylY(.0342,.0342,.11,P.q?16:8),lampX,1.186,3.1504);
    const guard=new THREE.Shape(),w=.1389,h=.07615,r=.025;
    guard.moveTo(-w+r,-h);guard.lineTo(w-r,-h);guard.quadraticCurveTo(w,-h,w,-h+r);
    guard.lineTo(w,h-r);guard.quadraticCurveTo(w,h,w-r,h);guard.lineTo(-w+r,h);
    guard.quadraticCurveTo(-w,h,-w,h-r);guard.lineTo(-w,-h+r);guard.quadraticCurveTo(-w,-h,-w+r,-h);
    for(const dx of[-.0657,.0657]){const air=new THREE.Path();air.absarc(dx,0,.053,0,Math.PI*2,true);guard.holes.push(air);}
    P.addEquipment('hullDetail',new THREE.ExtrudeGeometry(guard,{depth:.1328,steps:1,bevelEnabled:false,curveSegments:P.q?8:4}),lampX,lampY,3.041);
    for(const dx of[-.0657,.0657]) {
      const segments=P.q?20:12;
      P.addEquipment('hullDetail',new THREE.CylinderGeometry(.058,.058,.098,segments,1,true).rotateX(Math.PI/2),lampX+dx,lampY,3.136);
      P.addEquipment('hullDetail',new THREE.RingGeometry(.047,.058,segments),lampX+dx,lampY,3.185);
      P.addEquipment('hullGlass',cylZ(.0498,.018,segments),lampX+dx,lampY,3.1806);
    }
}

function buildSabraRearDeck(P: TankBuilderPort): void {
  // Source rear radiator face contains two distinct banks with a solid center.
  P.addEquipment('hullDetail',box(1.94,.73,.038),0,1.382,-3.237);
  for(const side of [-1,1]) {
    P.addEquipment('hullDark',box(.68,.59,.014),side*.417,1.442,-3.263);
    for(let i=0;i<10;i++)P.addEquipment('hullDetail',box(.673,.031,.071),side*.417,1.183+i*.0593,-3.272,-.13);
    for(const x of [.071,.761])P.addEquipment('hullDetail',box(.019,.590,.050),side*x,1.442,-3.26);
    for(const y of [1.315,1.537])P.addEquipment('hullDetail',box(.10,.044,.059),side*.96,y,-3.244);
    P.addEquipment('hullDetail',box(.10,.18,.13),side*.64,.58,-3.18);
    P.addEquipment('hullDetail',cylZ(.088,.11,P.q?18:10),side*.687,.944,-3.225);
    P.addEquipment('hullDark',cylZ(.045,.014,P.q?16:8),side*.687,.944,-3.288);
  }
  P.addEquipment('hullDetail',box(.055,.544,.046),0,1.44,-3.255);
  P.addEquipment('hullDetail',box(.24,.18,.15),0,.95,-3.276);
  P.addEquipment('hullDetail',box(.10,.062,.19),-.01,.952,-3.446);
  deckGrille(P,0,1.853,-2.59,1.62,1.05);
  P.addHatch('hullDetail',cylY(.33,.33,.05,10),-.47,1.605,1.46);
  P.addEquipment('hullDetail',box(.42,.10,.15),-.47,1.67,1.73);
  P.addEquipment('hullGlass',box(.29,.048,.015),-.47,1.69,1.815);
}

function buildSabraHull(P: TankBuilderPort): void {
  P.add('hull',armorLoft([
    [-3.25,.75,1.10,.96,.65,1.12,1.76],[-2.90,.87,1.11,.97,.44,1.31,1.84],
    [-1.68,.91,1.11,.98,.44,1.33,1.84],[-.72,.91,1.13,1.02,.44,1.35,1.565],
    [1.51,.91,1.15,1.03,.44,1.34,1.565],[2.46,.93,1.09,1.02,.50,1.18,1.48],
    [3.15,.91,1.09,1.03,.87,1.10,1.105],
  ]));
  for(const side of [-1,1]) {
    // Retain the original aft shelf through z2.34. The source's forward
    // region is a thin rolled fender, not this thick straight box.
    P.add('hull',box(.58,.16,5.38),side*1.405,1.50,-.35);
    addFrontFender(P,side);
    for(let i=0;i<9;i++) {
      const z=-2.64+i*.646;
      const outer=z>.4?1.79+(z-.4)*.031:1.769;
      P.addExternalArmor('hull',box(.014,.645,.623),side*(outer-.007),1.092,z);
      for(const y of [.83,1.36])P.addEquipment('hullDetail',box(.035,.062,.094),side*(z>.4?1.868:1.814),y,z);
    }
    for(const z of [-2.48,-1.59])P.addEquipment('hullDetail',box(.48,.25,.68),side*1.37,1.678,z);
    P.addMudguard('sabra-rear-'+side,'hullRubber',box(.61,.23,.055),side*1.44,1.04,-3.491,.20);
    P.addEquipment('hullDetail',box(.61,.055,.29),side*1.44,1.175,-3.34);
    addSabraHeadlamps(P,side);
    P.addEquipment('hullDetail',box(.055,.07,.95),side*1.38,1.68,1.20);
  }
  buildSabraRearDeck(P);
}

function buildSabraRunningGear(P: TankBuilderPort): void {
  // Paired cast webs meet the measured hub and raised annular rim. No generic
  // decorative wheel cap survives over this native suspension stock.
  const wheelSection:AxialWheelStation[]=[
    [0,0],[.168,0],[.168,.020],[.1415,.050],[.1088,.080],[.0943,.100],
    [.060,.120],[.0324,.140],[.0324,.180],[.0454,.200],[.0725,.220],[.0802,.260],
    [.089,.271],[-.089,.271],[-.0802,.260],[-.0725,.220],[-.0454,.200],
    [-.0324,.180],[-.0324,.140],[-.060,.120],[-.0943,.100],[-.1088,.080],
    [-.1415,.050],[-.168,.020],[-.168,0],
  ];
  const fasteners=[];
  for(const side of [-1,1])for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    fasteners.push(cylX(.012,.013,6).translate(side*.082,Math.sin(a)*.112,Math.cos(a)*.112));
  }
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,
    style:'rubber',wheelPattern:'deep-dish-eight',trackPattern:'nato-double-pin',wheelR:.3274,wheelW:.3445,wheelY:.3597,
    wheelCoreGeometry:{disc:lathedWheelSection(wheelSection,P.q?32:16),dark:KIT.mergeAll(fasteners)},
    wheelTireBands:[{centerM:0,widthM:.3445,innerRadiusM:.269}],
    wheelZs:[-2.1577,-1.3486,-.5171,.3255,1.1309,1.9496],xc:1.4384,trackW:.586,trackTh:.022,
    trackShoeDimensions:{padHeight:.017,grouserHeight:.006,webHeight:.012,hornHeight:.067,pinRadius:.012,pinCentreY:0},
    sprocket:{z:-2.851,y:.9816,r:.2007,trackR:.195,toothTipRadiusM:.2657},idler:{z:2.9729,y:.9143,r:.2455,trackR:.238},
    rollers:[-1.68,-.84,0,.82,1.64].map(z=>({z,y:1.12,r:.097})),
    topY:1.235,botY:.026,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function buildSabraTurretArmor(P: TankBuilderPort, py: number, pz: number): void {
  P.add('turret',cylY(1.00,1.00,.080,P.q?48:24),0,1.593-py,0);
  // The source welded cheeks shape the whole volume; no cast donor sits beneath a flat wedge.
  P.add('turret',armorLoft([
    [-1.73,.80,1.10,1.04,1.86,2.05,2.54],[-1.60,.85,1.18,1.11,1.84,2.00,2.55],
    [-.60,1.26,1.51,1.22,1.62,1.86,2.54],[.52,1.29,1.50,1.16,1.66,1.94,2.49],
  ],py,pz));
  // Source front armor slopes laterally as well as forward. Its narrow raised
  // center and stepped plates must not become one broad flat wedge.
  const frontRows=[
    [.50,1.29,1.50,1.16,1.66,1.94,2.49,2.58],
    [1.40,1.12,1.39,1.05,1.74,1.94,2.16,2.455],
    [1.94,.59,.85,.73,1.95,2.01,2.035,2.265],
  ];
  P.add('turret',sectionSolid(frontRows.map(([z,belly,shoulder,roof,floor,knee,edge,ridge])=>({z:z-pz,
    ring:[[-belly,floor-py],[belly,floor-py],[shoulder,knee-py],[roof,edge-py],[.36,ridge-py],
      [-.36,ridge-py],[-roof,edge-py],[-shoulder,knee-py]],
  }))));
  const cheekTop=(x:number,z:number):number=>{
    const a=z<=1.40?frontRows[0]:frontRows[1],b=z<=1.40?frontRows[1]:frontRows[2];
    const t=(z-a[0])/(b[0]-a[0]),roof=a[3]+(b[3]-a[3])*t,edge=a[6]+(b[6]-a[6])*t,ridge=a[7]+(b[7]-a[7])*t;
    return ridge+(edge-ridge)*(Math.abs(x)-.36)/(roof-.36);
  };
  for(const side of [-1,1]) {
    for(const [za,zb,inner,outerA,outerB] of [[.67,1.19,.43,1.13,1.075],[1.225,1.90,.43,1.065,.735]]) {
      const panel=sectionSolid([[za,outerA],[zb,outerB]].map(([z,outer])=>({z:z-pz,
        ring:[[inner,cheekTop(inner,z)-py-.025],[outer,cheekTop(outer,z)-py-.025],
          [outer,cheekTop(outer,z)-py+.012],[inner,cheekTop(inner,z)-py+.012]],
      })));
      if(side<0)mirrorX(panel);
      P.addExternalArmor('turret',panel);
    }
    for(const [x,z] of [[.69,1.53],[.69,1.87],[.89,1.29],[.94,1.645],[.875,1.326],[.5,.76],[.78,.76]])
      turretEquipment(P,'turretDetail',cylY(.017,.017,.013,6),side*x,cheekTop(x,z)+.025,z,.31,0,side*.42);
    smokeBank(P,side,1.17,2.08,1.16,5);
    for(const z of [-.74,.05,.75]){
      turretEquipment(P,'turretDetail',box(.026,.029,.59),side*1.34,2.05,z,0,side*-.09);
      turretEquipment(P,'turretDetail',cylZ(.025,.025,10),side*1.24,2.40,z);
    }
    turretEquipment(P,'turretDetail',box(.20,.55,.24),side*1.28,2.23,-1.49,0,0,side*.07);
  }
}

function buildSabraBasket(P: TankBuilderPort): void {
  // The open basket ends at the source's -2.417m rear plane. The low
  // support reaching -2.883m is a separate part, not the basket's height.
  for(const z of [-2.39,-2.08,-1.74]) {
    const half=.84+(z+2.39)*.36;
    for(const y of [2.015,2.532])turretEquipment(P,'turretDetail',box(half*2,.025,.027),0,y,z+(z===-2.39?(y-2.015)*.194:0));
    for(const side of [-1,1])turretEquipment(P,'turretDetail',box(.028,.54,.027),side*half,2.274,z+(z===-2.39?.05:0),z===-2.39?.192:0);
  }
  for(const side of [-1,1]) {
    for(const y of [2.13,2.24,2.35,2.46])turretEquipment(P,'turretDetail',box(.028,.025,.72),side*.96,y,-2.06,0,side*-.345);
    turretEquipment(P,'turretDetail',box(.045,.025,1.20),side*.64,1.96,-2.28,.15);
  }
  for(let i=-3;i<=3;i++)turretEquipment(P,'turretDetail',box(.023,.54,.023),i*.26,2.274,-2.34,.192);
  for(const y of [2.13,2.24,2.35,2.46])turretEquipment(P,'turretDetail',box(1.68,.024,.024),0,y,-2.39+(y-2.015)*.194);
}

function buildSabraCupola(P: TankBuilderPort, py: number, pz: number): void {
  // Main source mesh carries the broad rear cupola dome; the separate
  // forward hatch alone is not its whole structural armor volume.
  const domeRows=[[-1.035,.12,2.59],[-.85,.52,2.83],[-.60,.655,2.975],
    [-.40,.655,2.998],[-.20,.645,2.945],[0,.61,2.936],[.20,.44,2.85],[.59,.20,2.66]];
  const arcSteps=P.q?16:8;
  P.addCupola('turret',sectionSolid(domeRows.map(([z,half,top])=>({z:z-pz,
    ring:Array.from({length:arcSteps+1},(_,i)=>{
      const a=i*Math.PI/arcSteps;
      return [-.50+half*Math.cos(a),2.535+(top-2.535)*Math.sin(a)-py] as const;
    }),
  }))));
  // Sparse source-only crown samples replace the over-wide straight cone.
  // The forward cap blends into the existing dome and slopes toward the gun.
  const capRows=[[-.068,.018,2.83],[0,.265,2.940],[.15,.324,2.951],
    [.25,.292,2.928],[.35,.224,2.897],[.45,.128,2.857],[.55,.045,2.800],[.569,.012,2.76]];
  P.addCupola('turretDetail',sectionSolid(capRows.map(([z,half,top])=>({z:z-pz,
    ring:Array.from({length:arcSteps+1},(_,i)=>{
      const a=i*Math.PI/arcSteps;
      return [-.53295+half*Math.cos(a),2.5624+(top-2.5624)*Math.sin(a)-py] as const;
    }),
  }))));
  // Eight measured viewing windows wrap the broad dome, not the forward cap.
  for(const [x,y,z] of [[-.9785,2.687,.0734],[-1.0884,2.687,-.299],[-.9524,2.68,-.7624],
    [-.488,2.695,-.9806],[-.0132,2.684,-.7638],[.1248,2.688,-.2973],
    [.0091,2.694,.0731],[-.2324,2.696,.2831]]) {
    const angle=Math.atan2(x+.50,z+.30),nx=Math.sin(angle),nz=Math.cos(angle);
    const frame=new THREE.Shape();
    frame.moveTo(-.087,-.047);frame.lineTo(.087,-.047);frame.quadraticCurveTo(.121,-.047,.121,-.016);
    frame.lineTo(.121,.017);frame.quadraticCurveTo(.121,.048,.087,.048);frame.lineTo(-.087,.048);
    frame.quadraticCurveTo(-.121,.048,-.121,.017);frame.lineTo(-.121,-.016);frame.quadraticCurveTo(-.121,-.047,-.087,-.047);
    const g=new THREE.ExtrudeGeometry(frame,{depth:.047,steps:1,bevelEnabled:false});
    turretEquipment(P,'turretDetail',g,x-nx*.027,y,z-nz*.027,0,angle);
    turretEquipment(P,'turretGlass',box(.199,.044,.008),x+nx*.022,y,z+nz*.022,0,angle);
  }
  optic(P,-.5758,2.972,-.0975,.326,.1406,.1509);
}

function buildSabraCupolaWeapon(P: TankBuilderPort, py: number, pz: number): void {
  // Source cupola weapon and receiver, seated to the raised structural cupola.
  turretEquipment(P,'turretDetail',box(.12,.11,.33),-.5059,2.778,.36);
  // Register the actual receiver and barrel, retaining their existing stock,
  // dark material and turret frame. Painted cupola supports stay in their
  // original buckets so their camo projection and weathering are unchanged.
  const gunParts=[
    KIT.xform(cylZ(.024,.79,P.q?16:8),-.5059,2.7738-py,.9061-pz),
    KIT.xform(box(.15,.13,.26),-.5059,2.783-py,.41-pz),
  ];
  const roofGunGeometry=KIT.mergeAll(gunParts);
  for(const part of gunParts) if(part.index) part.dispose();
  const roofGunMesh=new THREE.Mesh(roofGunGeometry,P.mats.dark);
  roofGunMesh.name='sabraCupolaReceiverAndBarrel';
  roofGunMesh.castShadow=roofGunMesh.receiveShadow=true;
  P.disposables.push(roofGunGeometry);
  // Match the former turretDark detail LOD, including LOW's shorter range.
  const roofGunLod=new THREE.LOD();
  roofGunLod.addLevel(roofGunMesh,0);
  roofGunLod.addLevel(new THREE.Object3D(),P.q?150:64,.1);
  const roofGun=new THREE.Group();
  roofGun.add(roofGunLod);
  FITTINGS.markExact(roofGun,'pintleMG');
  roofGun.name='sabraSourceCupolaWeapon';
  roofGun.userData.barrelAxisLocal=[0,0,1];
  roofGun.userData.barrelElevationRad=0;
  P.turretG.add(roofGun);
  turretEquipment(P,'turretDetail',box(.22,.10,.24),-.7259,2.783,.34);
}

function buildSabraRoofFittings(P: TankBuilderPort, py: number, pz: number): void {
  // Source rear circular access fitting is behind the cupola on its −X side.
  const rearCover=[[0,2.46232],[.2325,2.46232],[.2230,2.54772],
    [.2089,2.56582],[.1856,2.57702],[0,2.58052]];
  P.addHatch('turretDetail',new THREE.LatheGeometry(rearCover.map(([r,y])=>new THREE.Vector2(r,y-py)),P.q?24:12),-.670,0,-1.36973-pz);
  optic(P,.35,2.64,.30,.34,.17,.27);
  // Raised antenna socket brackets connect the spring bases to the roof.
  turretEquipment(P,'turretDetail',cylY(.035,.062,.24,12),-.141,2.66,-1.313);
  turretEquipment(P,'turretDetail',cylY(.030,.049,.22,12),.67,2.62,-1.624);
  antenna(P,-.141,2.78,5.07108,-1.313);antenna(P,.67,2.72,4.2203,-1.624);
}

function buildSabraCannon(P: TankBuilderPort): void {
  P.add('gunMount',armorLoft([
    [-.16,.54,.63,.55,-.24,.04,.35],[.36,.48,.52,.46,-.21,.02,.27],
    [.83,.24,.28,.24,-.14,.02,.17],
  ]));
  openTube(P,.076,.72,4.29689,.0598);
  P.add('gun',cylZ(.15,.48,P.q?28:14),0,0,2.05);
  for(const z of [1.00,1.78,2.31,3.30,4.17]) {
    // External bands surround the barrel wall; their ends do not cap its bore.
    const n=P.q?24:12;
    P.add('gun',new THREE.CylinderGeometry(.086,.086,.045,n,1,true).rotateX(Math.PI/2),0,0,z);
    for(const side of [-1,1])P.add('gun',new THREE.RingGeometry(.076,.086,n).rotateY(side<0?Math.PI:0),0,0,z+side*.0225);
  }
}

export function buildSabraMk2X(P: TankBuilderPort): void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor'],
    turret: ['turretCupola'],
  };
  P.hullG.position.set(0,0,0);P.turretG.position.set(0,1.57,.05);P.gunG.position.set(0,.444,1.15);
  buildSabraHull(P);
  buildSabraRunningGear(P);
  const py=P.turretG.position.y,pz=P.turretG.position.z;
  buildSabraTurretArmor(P,py,pz);
  buildSabraBasket(P);
  buildSabraCupola(P,py,pz);
  buildSabraCupolaWeapon(P,py,pz);
  buildSabraRoofFittings(P,py,pz);
  buildSabraCannon(P);
  preserveSourceStudyGunMountAppearance(P);
  P.topY=3.11-py;
  P.hullG.userData.xRebuild={candidate:'sabra_mk2_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
export const SABRA_MK2_SOURCE_X_PROFILES={sabra_mk2_x:{build:buildSabraMk2X}} as const;
