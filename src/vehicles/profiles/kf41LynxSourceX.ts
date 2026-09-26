// Independent KF41 Lynx prototype study. See docs/references/tanks/kf41_lynx_x.md.
import * as THREE from 'three';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid } from './sectionSolid.ts';
import { kf41LynxWheelStock } from './kf41LynxWheelStock.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { armorLoft, turretEquipment, openTube, optic, antenna, deckGrille, mirrorX, chassisLoft } from './europeSourcePrimitives.ts';
const { box, cylY, cylZ, cylX } = KIT;

function addLynxTurretCheek(P: TankBuilderPort, side: number, py: number, pz: number): void {
    const cheek=sectionSolid([
      {z:.48-pz,ring:[[.34,2.319-py],[1.36,2.319-py],[1.50,2.46-py],[1.26,3.013-py],[.34,3.013-py]]},
      {z:1.43-pz,ring:[[.35,2.372-py],[.99,2.372-py],[1.25,2.61-py],[1.05,2.916-py],[.35,2.916-py]]},
    ]);
    if(side<0) mirrorX(cheek);
    P.add('turret',cheek);
    // The sloping front armor surrounds a real equipment pocket. Its rear wall
    // remains the closed cheek stock; the optical recess is not painted on top.
    const outer=new THREE.Shape();
    outer.moveTo(.35,2.40);outer.lineTo(1.07,2.40);outer.lineTo(1.19,2.61);
    outer.lineTo(1.01,2.825);outer.lineTo(.35,2.825);outer.closePath();
    const pocket=new THREE.Path();
    const left=side>0?.555:.490,right=side>0?.937:.60;
    pocket.moveTo(left,2.52);pocket.lineTo(left,2.79);pocket.lineTo(right,2.79);
    pocket.lineTo(right,2.52);pocket.closePath();outer.holes.push(pocket);
    const plate=new THREE.ExtrudeGeometry(outer,{depth:.21,bevelEnabled:false,steps:1});
    const pos=plate.attributes.position;
    for(let j=0;j<pos.count;j++) {
      const y=pos.getY(j);
      const front=y<=2.76?1.63+.525*(y-2.64):1.693-1.75*(y-2.76);
      pos.setXYZ(j,pos.getX(j),y-py,pos.getZ(j)+front-.21-pz);
    }
    if(side<0)mirrorX(plate);else plate.computeVertexNormals();
    P.add('turret',plate);
    if(side>0) {
      turretEquipment(P,'turretDark',box(.34,.22,.02),.745,2.659,1.51,-.483);
      turretEquipment(P,'turretGlass',box(.20,.105,.018),.745,2.656,1.577,-.483);
      turretEquipment(P,'turretDetail',box(.34,.022,.04),.745,2.801,1.634,-.483);
    } else {
      turretEquipment(P,'turretDark',box(.071,.27,.035),-.545,2.66,1.51,-.483);
      for(const [x,y] of [[-.558,2.65],[-.543,2.622],[-.527,2.65]])
        turretEquipment(P,'turretDark',cylZ(.014,.115,P.q?12:8),x,y,1.672);
      turretEquipment(P,'turretDetail',box(.033,.34,.045),-.596,2.70,1.58,-.483);
    }
}

function addLynxCrewCover(P: TankBuilderPort, side: number, py: number, pz: number): void {
    // Polygonal raised cover, source width0.795m and length0.786m.
    const hx=side*.47;
    P.addHatch('turret',sectionSolid([
      {z:-.236-pz,ring:[[hx-.27,3.011-py],[hx+.27,3.011-py],[hx+.27,3.163-py],[hx-.27,3.163-py]]},
      {z:-.12-pz,ring:[[hx-.3975,3.011-py],[hx+.3975,3.011-py],[hx+.36,3.163-py],[hx-.36,3.163-py]]},
      {z:.30-pz,ring:[[hx-.36,3.011-py],[hx+.36,3.011-py],[hx+.33,3.163-py],[hx-.33,3.163-py]]},
      {z:.55-pz,ring:[[hx-.15,3.011-py],[hx+.15,3.011-py],[hx+.15,3.163-py],[hx-.15,3.163-py]]},
    ]));
    turretEquipment(P,'turretDetail',cylX(.034,.62,P.q?16:8),hx,3.05,-.335);
    for(const dx of [-.25,.25])turretEquipment(P,'turretDetail',box(.060,.067,.19),hx+dx,3.045,-.27);
    for(const dx of [-.22,0,.22]) {
      const z=dx===0?.554:.41;
      turretEquipment(P,'turretDark',box(.18,.055,.023),hx+dx,3.078,z,0,dx===0?0:-Math.sign(dx)*.65);
      turretEquipment(P,'turretGlass',box(.145,.033,.014),hx+dx,3.08,z+.01,0,dx===0?0:-Math.sign(dx)*.65);
    }
}

function buildLynxHull(P: TankBuilderPort): void {
  P.add('hull', chassisLoft([
    [-3.36, .82, 1.617, 1.59, .67, 1.45, 2.283],
    [-2.80, .76, 1.617, 1.59, .48, 1.45, 2.283],
    [1.28, .76, 1.617, 1.59, .48, 1.45, 2.283],
    [1.65, .76, 1.617, 1.59, .48, 1.45, 2.279],
    [1.90, .76, 1.617, 1.59, .48, 1.45, 2.115],
    [3.34, .86, 1.617, 1.59, .83, 1.45, 1.696],
    [3.83, .90, 1.53, 1.48, 1.34, 1.45, 1.57],
  ], .965));
  // Broad continuous side cells, with real tapered lower return at each end.
  for (const side of [-1, 1]) {
    const cell = sectionSolid([
      { z: -3.82, ring: [[1.60,1.30],[1.80,1.30],[1.80,2.283],[1.60,2.283]] },
      { z: -3.18, ring: [[1.60,.84],[1.80,.84],[1.80,2.283],[1.60,2.283]] },
      { z: 1.34, ring: [[1.60,.83],[1.80,.83],[1.80,2.283],[1.60,2.283]] },
      { z: 3.68, ring: [[1.60,.90],[1.80,.90],[1.80,1.62],[1.60,1.62]] },
    ]);
    if (side < 0) mirrorX(cell);
    P.addExternalArmor('hull',cell);
    for (const z of [-2.78,-1.42,-.02,1.35]) P.addEquipment('hullDark',box(.012,1.28,.014),side*1.803,1.55,z);
    P.addEquipment('hullDetail',box(.24,.11,.13),side*1.38,1.565,3.75,.27);
    P.addEquipment('hullGlass',box(.17,.055,.015),side*1.38,1.562,3.819,.27);
    deckGrille(P,side*1.10,2.293,-3.24,1.02,.90);
  }
  // The source ramp is recessed roughly 0.45m between the two aft vent wings.
  // These are closed hull solids; the central recess is not a missing rear face.
  for (const side of [-1, 1]) {
    const wing = sectionSolid([
      {z:-3.828,ring:[[.57,1.22],[1.61,1.22],[1.61,2.283],[.57,2.283]]},
      {z:-3.34,ring:[[.57,.70],[1.61,1.04],[1.61,2.283],[.57,2.283]]},
    ]);
    P.add('hull',side < 0 ? mirrorX(wing) : wing);
    // Horizontal louver blades sit on a dark recessed receiver at each side.
    P.addEquipment('hullDark',box(.58,.48,.016),side*1.45,1.53,-3.84);
    for(let i=0;i<13;i++)P.addEquipment('hullDetail',box(.58,.017,.029),side*1.45,1.306+i*.034,-3.853,-.18);
    P.addEquipment('hullDetail',box(.048,.26,.14),side*.96,1.35,-3.86);
    P.addEquipment('hullDetail',box(.61,.072,.035),side*1.328,2.116,-3.847);
    P.addEquipment('hullGlass',box(.49,.024,.008),side*1.328,2.116,-3.869);
  }
  P.addHatch('hull',box(1.08,1.12,.055),0,1.75,-3.39);
  for(const x of [-.51,.51])P.addEquipment('hullDetail',box(.035,1.08,.027),x,1.75,-3.433);
  for(const y of [1.21,2.27])P.addEquipment('hullDetail',box(1.05,.030,.027),0,y,-3.433);
  P.addEquipment('hullDetail',cylX(.035,.29,P.q?16:8),0,1.20,-3.45);
  // Broad chamfered driver cover is on +X in the supplied model.
  P.addHatch('hull',sectionSolid([
    {z:1.49,ring:[[.35,2.22],[.95,2.22],[.95,2.289],[.35,2.289]]},
    {z:1.66,ring:[[.23,2.19],[1.05,2.19],[1.05,2.29],[.23,2.29]]},
    {z:2.04,ring:[[.23,2.075],[1.05,2.075],[1.05,2.26],[.23,2.26]]},
    {z:2.12,ring:[[.37,2.07],[.91,2.07],[.91,2.235],[.37,2.235]]},
  ]));
  for(const x of [.39,.64,.89]) {
    P.addEquipment('hullDark',box(.215,.064,.08),x,2.233,2.065);
    P.addEquipment('hullGlass',box(.17,.035,.013),x,2.234,2.11);
  }
  for(const x of [.34,.94])P.addEquipment('hullDetail',cylX(.027,.11,P.q?12:8),x,2.29,1.54);
}

function buildLynxRunningGear(P: TankBuilderPort): void {
  // Source-backed asymmetric wheel stock stays on the native suspension train.
  const wheels = kf41LynxWheelStock(Boolean(P.q));
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,
    style:'rubber',trackPattern:'nato-double-pin',
    wheelR:.3675,wheelW:.4297,wheelY:.4705,
    wheelTireBands:[{centerM:-.1246,widthM:.1805,innerRadiusM:.307},{centerM:.1246,widthM:.1805,innerRadiusM:.307}],
    wheelCoreGeometry:{disc:wheels.core},
    wheelFaceLayers:wheels.faces.flatMap(({side,steel,dark})=>[
      {geometry:steel,material:P.mats.wheels,side,name:`kf41SourceWheelSteel${side}`,appearanceRole:'wheelDish'},
      {geometry:dark,material:P.mats.rubber,side,name:`kf41SourceWheelFasteners${side}`,appearanceRole:'wheelInset'},
    ]),
    wheelZs:[-1.8858,-1.0331,-.1804,.6724,1.5251,2.3778],xc:1.277,trackW:.590,trackTh:.035,
    trackShoeDimensions:{padHeight:.036,grouserHeight:.013,webHeight:.025,hornHeight:.10,pinRadius:.018,pinCentreY:0},
    sprocket:{z:3.2509,y:1.0299,r:.295,trackR:.282,toothTipRadiusM:.351},idler:{z:-2.9123,y:.9582,r:.26,trackR:.254},
    rollers:[{z:-1.40,y:1.18,r:.105},{z:0,y:1.18,r:.105},{z:1.40,y:1.18,r:.105}],
    topY:1.34,botY:.06,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function buildLynxTurretArmor(P: TankBuilderPort, py: number, pz: number): void {
  P.add('turret',cylY(1.06,1.06,.040,P.q?48:24),0,2.301-py,0);
  P.add('turret',armorLoft([
    [-1.85,.94,1.10,.95,2.57,2.70,2.87],[-1.45,1.10,1.27,1.11,2.40,2.63,3.013],
    [-.85,1.27,1.43,1.30,2.30,2.44,3.013],[.48,1.36,1.50,1.26,2.30,2.46,3.013],
    [.70,1.24,1.46,1.21,2.31,2.46,3.013],
  ],py,pz));
  for(const side of [-1,1]) {
    addLynxTurretCheek(P,side,py,pz);
    addLynxCrewCover(P,side,py,pz);
    // Eight measured diagonal fasteners on the steep cheek, not roof dots.
    for(let i=0;i<8;i++) {
      const y=2.638+.050*i,z=.409-.072*i;
      const station=(z+.85)/1.33,shoulder=1.43+.07*station,roof=1.30-.04*station;
      const knee=2.44+.02*station;
      const x=side*(shoulder+(roof-shoulder)*(y-knee)/(3.013-knee));
      turretEquipment(P,'turretDark',cylY(.032,.032,.008,8),x,y,z,0,0,-side*1.17);
      turretEquipment(P,'turretDetail',cylY(.019,.019,.014,6),x+side*.008,y+.004,z,0,0,-side*1.17);
    }
    antenna(P,side*.855,3.02,6.4346,-1.43);
  }
}

function buildLynxRoofSensor(P: TankBuilderPort): void {
  // Source neck, wider collar and faceted sensor head are separate solids.
  turretEquipment(P,'turretDetail',cylY(.219,.219,.020,P.q?32:16),.63,3.004,-.732);
  turretEquipment(P,'turretDetail',cylY(.199,.199,.060,P.q?32:16),.63,3.027,-.732);
  turretEquipment(P,'turretDetail',cylY(.275,.275,.082,P.q?32:16),.63,3.094,-.732);
  turretEquipment(P,'turretDetail',cylY(.243,.243,.010,P.q?32:16),.63,3.135,-.732);
  turretEquipment(P,'turretDetail',cylY(.229,.229,.338,8),.63,3.306,-.749);
  for(let i=0;i<10;i++) {
    const a=i*Math.PI/5;
    turretEquipment(P,'turretDetail',cylY(.007,.007,.011,6),.63+Math.sin(a)*.227,3.145,-.732+Math.cos(a)*.227);
  }
  optic(P,.542,3.366,-.616,.084,.139,.065);
  turretEquipment(P,'turretDetail',box(.326,.045,.096),.643,3.159,-.546);
  turretEquipment(P,'turretDetail',box(.054,.208,.028),.542,3.332,-.658);
  turretEquipment(P,'turretDetail',box(.047,.064,.17),.785,3.422,-.675);
  turretEquipment(P,'turretDark',cylZ(.028,.017,P.q?16:8),.542,3.387,-.600);
}

function buildLynxCannon(P: TankBuilderPort): void {
  // Source tip axis is y2.59916 before ground registration. The tall
  // asymmetric shroud sits above it; its bounding-box center is not the bore.
  const gunY=2.60336;
  // The main receiver is distinct from its projecting bolt heads. Source rays
  // retain its broad parallel sides to the forward shoulder, then a faceted
  // tapered shroud. Rounded whole-assembly bounds had hidden those stages.
  const receiverRows=[
    [.54,.287,2.49,2.52,2.80,2.86,.24,.25],
    [.90,.287,2.347,2.40,2.98,3.035,.257,.27],
    [1.80,.286,2.50,2.58,2.91,3.00,.255,.18],
    [1.94,.286,2.51,2.58,2.85,2.949,.235,.174],
    [2.35,.227,2.529,2.59,2.72,2.88,.175,.159],
    [4.05,.127,2.527,2.565,2.66,2.734,.105,.09],
    [4.27,.090,2.538,2.56,2.66,2.684,.075,.075],
  ];
  P.add('gunMount',sectionSolid(receiverRows.map(([z,half,floor,low,high,top,roof,belly])=>({z:z-.70,
    ring:[[-belly+.002,floor-gunY],[belly+.002,floor-gunY],[half+.002,low-gunY],[half+.002,high-gunY],
      [roof+.002,top-gunY],[-roof+.002,top-gunY],[-half+.002,high-gunY],[-half+.002,low-gunY]],
  }))));
  for(const y of [2.5734,2.8544])P.addEquipment('gunMount',cylX(.026,.062,P.q?12:6),-.3155,y-gunY,.85765);
  for(const x of [-.21845,.2014])P.addEquipment('gunMount',box(.142,.046,.080),x+.01164,2.3487-gunY,.30075);
  for(const x of [-.2524,-.18575,.16745,.2341])P.addEquipment('gunMount',cylY(.018,.018,.018,6),x+.01164,2.3405-gunY,.30395);
  // Raised source side handle is separate moving stock, seated by two feet.
  for(const z of [2.371,2.805]) {
    P.addEquipment('gunMount',box(.048,.013,.033),-.1821+.01164,2.785-gunY,z-.70);
    P.addEquipment('gunMount',cylY(.007,.007,.044,8),-.199+.01164,2.807-gunY,z-.70);
  }
  P.addEquipment('gunMount',cylZ(.007,.434,P.q?12:8),-.199+.01164,2.829-gunY,2.588-.70);
  // Large source-visible brake cavity surrounds the recessed 35mm bore.
  openTube(P,.044,3.55,3.94,.0175);
  // The larger brake is an open sleeve around the actual 35 mm mouth.
  // A second openTube would introduce a wide solid backstop across that bore.
  const mouthSegments=P.q?28:14;
  P.add('gun',new THREE.CylinderGeometry(.07855,.07855,.11649,mouthSegments,1,true)
    .rotateX(Math.PI/2),0,0,(3.915+4.03149)/2);
  const brakeWall=new THREE.CylinderGeometry(.0526,.0526,.12949,mouthSegments,1,true)
    .rotateX(Math.PI/2);
  const brakeIndex=brakeWall.index!;
  for(let i=0;i<brakeIndex.count;i+=3){const a=brakeIndex.getX(i+1);brakeIndex.setX(i+1,brakeIndex.getX(i+2));brakeIndex.setX(i+2,a);}
  brakeWall.computeVertexNormals();
  P.add('gunDark',brakeWall,0,0,(3.902+4.03149)/2);
  P.add('gun',new THREE.RingGeometry(.0526,.07855,mouthSegments),0,0,4.03149);
  P.add('gun',new THREE.RingGeometry(.0175,.0526,P.q?28:14),0,0,3.902);
  P.add('gunDark',new THREE.CircleGeometry(.0175,P.q?28:14),0,0,3.83);
  // The circular firing mouth is recessed inside the outer brake extremum.
  P.muzzleZ=3.94;
  P.physicalMuzzleBore={outerRadiusM:.044,innerRadiusM:.0175,depthM:.11};
}

/** Shared only by explicitly KF41-derived vehicles; no turret is constructed. */
export function buildKf41Chassis(P: TankBuilderPort): void {
  buildLynxHull(P);
  buildLynxRunningGear(P);
}

export function buildKf41LynxX(P: TankBuilderPort): void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor', 'hullHatch'],
    turret: ['turretHatch'],
  };
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, 2.29, -.15);
  P.gunG.position.set(-.01164, .31336, .85);
  buildKf41Chassis(P);
  const py=P.turretG.position.y,pz=P.turretG.position.z;
  buildLynxTurretArmor(P,py,pz);
  buildLynxRoofSensor(P);
  buildLynxCannon(P);
  preserveSourceStudyGunMountAppearance(P);
  P.topY=3.49-py;
  P.hullG.userData.xRebuild={candidate:'kf41_lynx_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
export const KF41_LYNX_SOURCE_X_PROFILES={kf41_lynx_x:{build:buildKf41LynxX}} as const;
