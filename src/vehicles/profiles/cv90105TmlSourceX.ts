// Independent TML source reconstruction; source OBJ stays a local comparison.
import * as THREE from 'three';
import { preserveSourceStudyGunMountAppearance } from './sourceStudyGunMount.ts';
import { sectionSolid } from './sectionSolid.ts';
import { KIT } from './kit.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { armorLoft, turretEquipment, openTube, optic, antenna, smokeBank, deckGrille, sideWall, chassisLoft } from './europeSourcePrimitives.ts';
const {box,cylY,cylZ,cylX}=KIT;

function buildTmlRearRamp(P: TankBuilderPort): void {
  // Actual rear ramp rakes forward at its foot, between two vertical side boxes.
  for(const side of [-1,1])P.add('hull',box(.63,.69,.26),side*1.21,1.338,-3.13);
  P.addHatch('hull',box(1.47,1.15,.055),.04,1.135,-3.095,-.30);
  const rampZ=(y:number)=>-3.095-(y-1.135)*Math.tan(.30)-.030;
  for(const x of [-.685,.765])P.addEquipment('hullDetail',box(.028,1.12,.036),x,1.135,-3.14,-.30);
  for(const y of [.61,1.66])P.addEquipment('hullDetail',box(1.42,.027,.036),.04,y,rampZ(y),-.30);
  // Three open climbing steps measured on the +X half of the ramp.
  for(const y of [.884,1.22,1.562]) {
    const z=rampZ(y)-.038;
    P.addEquipment('hullOpenLattice',box(.42,.035,.042),.63,y-.095,z-.027);
    for(const x of [.437,.823])P.addEquipment('hullOpenLattice',box(.032,.21,.056),x,y,z);
    P.addEquipment('hullOpenLattice',box(.42,.028,.045),.63,y+.103,z+.032);
  }
  // Diagonal locking brace retains a physical bar and two seated receivers.
  const braceA=new THREE.Vector3(-.65,1.52,rampZ(1.52)-.032),braceB=new THREE.Vector3(-.04,.84,rampZ(.84)-.032);
  const delta=braceB.clone().sub(braceA),brace=box(.042,delta.length(),.045).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  const mid=braceA.clone().add(braceB).multiplyScalar(.5);P.addEquipment('hullDetail',brace,mid.x,mid.y,mid.z);
  for(const p of [braceA,braceB])P.addEquipment('hullDetail',box(.18,.10,.064),p.x,p.y,p.z+.008,-.30);
  P.addEquipment('hullDark',box(.57,.53,.014),-1.215,1.27,-3.267);
  for(let i=0;i<15;i++)P.addEquipment('hullDetail',box(.57,.016,.024),-1.215,1.017+i*.035,-3.28,-.14);
  P.addHatch('hull',box(.23,.19,.022),1.22,1.275,-3.272);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.39,.028,.22),side*1.205,1.713,-3.14);
    P.addEquipment('hullGlass',box(.21,.055,.012),side*1.205,1.654,-3.262);
  }
}

function buildTmlHull(P: TankBuilderPort): void {
  P.add('hull',chassisLoft([
    [-3.27,.79,1.539,1.50,1.64,1.67,1.694],[-2.93,.79,1.539,1.50,.55,1.08,1.69],[-2.71,.61,1.539,1.50,.34,.964,1.678],
    [-1.40,.60,1.539,1.50,.33,.966,1.633],[.65,.60,1.539,1.50,.33,.976,1.58],
    [1.45,.60,1.539,1.50,.33,.993,1.509],[2.58,.65,1.539,1.49,.36,1.044,1.27],
    [2.98,.70,1.49,1.45,.67,1.071,1.182],
    [3.28,.74,1.43,1.38,.84,1.018,1.13],
  ],.904));
  for(const side of [-1,1]) {
    sideWall(P,side,1.5135,1.5585,[
      [-3.205,.975,1.694],[-1.40,.975,1.633],[.65,.975,1.58],
      [1.45,.975,1.509],[2.58,.975,1.27],[3.18,1.015,1.15],
    ]);
    for(let i=0;i<6;i++) {
      const z=-2.18+i*.86;
      P.addExternalArmor('hull',box(.016,.31,.83),side*1.539,.80,z);
      for(const dz of [-.27,.27]) P.addEquipment('hullDetail',box(.026,.052,.062),side*1.56,.971,z+dz);
    }
    P.addMudguard('cv90105-front-'+side,'hullRubber',box(.46,.24,.06),side*1.25,1.04,3.32,-.23);
    P.addMudguard('cv90105-rear-'+side,'hullRubber',box(.48,.22,.055),side*1.24,.77,-3.04,.10);
    P.addEquipment('hullDetail',box(.22,.095,.13),side*1.13,1.24,2.97);
    P.addEquipment('hullGlass',box(.15,.045,.015),side*1.13,1.25,3.044);
    for(const z of [-2.60,-1.96])P.addHatch('hullDetail',box(.76,.025,.46),side*.91,1.685,z);
    P.addEquipment('hullDetail',box(.035,.045,1.48),side*1.30,1.54,1.01);
  }
  buildTmlRearRamp(P);
  P.addHatch('hullDetail',cylY(.30,.30,.045,8),-.62,1.553,1.27);
  P.addEquipment('hullDetail',box(.37,.12,.15),-.62,1.62,1.53);
  P.addEquipment('hullGlass',box(.27,.065,.018),-.62,1.635,1.613);
  deckGrille(P,.79,1.573,.84,.82,.76);
}

function buildTmlRunningGear(P: TankBuilderPort): void {
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,
    style:'rubber',wheelPattern:'armored-hub-six',trackPattern:'nato-double-pin',
    wheelR:.306,wheelW:.289,wheelY:.364,xc:1.2435,trackW:.523,trackTh:.032,
    // The source lower course is 58mm from shoe ground to wheel tire, with a
    // compact 22mm pad; generic MBT grousers exceed that measured envelope.
    trackShoeDimensions:{padHeight:.022,grouserHeight:.008,webHeight:.016,hornHeight:.070,pinRadius:.012,pinCentreY:0},
    wheelZs:[-1.854,-1.2045,-.555,.0945,.743,1.4415,2.146],
    wheelZsLeftM:[-1.978,-1.322,-.675,-.025,.626,1.325,2.041],
    wheelZsRightM:[-1.854,-1.2045,-.555,.0945,.743,1.4415,2.146],
    sprocket:{z:2.989,y:.672,r:.264,trackR:.218,toothTipRadiusM:.328},idler:{z:-2.6345,y:.55,r:.24,trackR:.212},
    // Source return shoes sag to y0.76–0.79m; roller crowns carry that course.
    rollers:[{z:-1.42,y:.640,r:.085},{z:.02,y:.621,r:.085},{z:1.40,y:.674,r:.085}],
    topY:.78,botY:.037,paintedEnds:true,coveredTop:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function buildTmlTurretArmor(P: TankBuilderPort, py: number, pz: number): void {
  P.add('turret',armorLoft([
    [-2.70,.83,.92,.63,1.76,1.93,2.18],[-2.28,.94,1.07,.77,1.67,1.91,2.25],
    [-1.56,1.04,1.13,.72,1.64,1.87,2.28],[-.75,1.08,1.20,.73,1.63,1.84,2.28],
    [-.13,1.08,1.20,.66,1.63,1.87,2.245],[.32,.92,1.05,.62,1.63,1.94,2.18],
    [.72,.65,.81,.52,1.64,1.97,2.135],
  ],py,pz));
  for(const side of [-1,1]) {
    smokeBank(P,side,1.13,1.98,.31,4);
    smokeBank(P,side,.94,2.23,-2.02,3);
    for(const z of [-1.57,-1.03,-.48]) {
      turretEquipment(P,'turretDetail',box(.07,.12,.36),side*1.115,1.92,z);
      turretEquipment(P,'turretDetail',box(.035,.15,.045),side*1.15,1.93,z-.16);
      turretEquipment(P,'turretDetail',box(.035,.15,.045),side*1.15,1.93,z+.16);
    }
    for(const z of [-2.43,-.13])turretEquipment(P,'turretDetail',box(.055,.10,.33),side*.71,2.30,z);
  }
}

function buildTmlRoofFittings(P: TankBuilderPort, py: number, pz: number): void {
  // Broad, low source cupola and polygonal cover; no thin generic sight tower.
  P.addCupola('turret',cylY(.48,.51,.145,10).scale(1,1,1.055),-.471,2.386-py,-.885-pz);
  P.addHatch('turret',cylY(.435,.455,.075,8).scale(1,1,.87),-.472,2.524-py,-.99-pz);
  for(const [x,z,ry]of[[-.80,-.785,-1.1],[-.766,-1.162,-2.2],[-.205,-1.24,2.5],[-.09,-.91,1.4]]) {
    turretEquipment(P,'turretDetail',box(.18,.09,.12),x,2.486,z,0,ry);
    turretEquipment(P,'turretGlass',box(.13,.045,.014),x+Math.sin(ry)*.064,2.49,z+Math.cos(ry)*.064,0,ry);
  }
  turretEquipment(P,'turretDetail',cylX(.031,.43,P.q?16:8),-.455,2.568,-1.27);
  optic(P,-.314,2.645,-.615,.273,.17,.19);
  P.addHatch('turret',box(.49,.046,.49),.548,2.313-py,-.303-pz);
  for(const x of [.365,.735])turretEquipment(P,'turretDetail',box(.044,.035,.13),x,2.348,-.49);
  turretEquipment(P,'turretDetail',box(.21,.023,.035),.564,2.352,-.13);
  antenna(P,-.58,2.355,4.64523,-2.265);antenna(P,.714,2.237,4.528,.025);
}

function buildTmlMantlet(P: TankBuilderPort): void {
  // Source mantlet is asymmetric: its left hood projects far beyond the
  // right optical face. Keep the receiving shell behind both actual apertures.
  const gunPrism=(left:number,right:number,yz:readonly (readonly [number,number])[])=>
    sectionSolid([left,right].map(x=>({z:x,ring:yz.map(([y,z])=>[-z,y] as const)})))
      .rotateY(Math.PI/2).translate(-.016,-1.878,-.700);
  P.add('gunMount',gunPrism(-.581,.522,[
    [1.69,.54],[2.126,.54],[2.126,.65],[2.094,.672],
    [1.98,.753],[1.90,.807],[1.85,.814],[1.80,.792],[1.705,.665],
  ]));
  P.add('gunMount',gunPrism(-.581,-.203,[
    [1.691,.645],[2.127,.645],[2.09,.901],[1.731,.901],
  ]));
  // Soft mantlet boot is authored as a few folded elliptical sections.
  const boot=[{z:.28,rx:.185,ry:.186},{z:.46,rx:.170,ry:.176},{z:.69,rx:.145,ry:.166},{z:.89,rx:.142,ry:.160},{z:1.215,rx:.125,ry:.137}];
  P.add('gunMount',sectionSolid(boot.map(({z,rx,ry})=>({z,ring:Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return [Math.cos(a)*rx,Math.sin(a)*ry-.008] as [number,number];})}))));
  for(const z of [.45,.68,.91])P.add('gunMount',cylZ(.148,.022,P.q?24:12).scale(1,1.10,1),0,-.005,z);
  // The left armored hood surrounds a recessed circular optical receiver.
  // These are sparse source scalar dimensions, not duplicated source topology.
  const hood=new THREE.Shape();
  hood.moveTo(-.560,1.735);hood.lineTo(-.517,1.689);hood.lineTo(-.266,1.689);
  hood.lineTo(-.223,1.735);hood.lineTo(-.223,2.075);hood.lineTo(-.265,2.114);
  hood.lineTo(-.518,2.114);hood.lineTo(-.560,2.075);hood.closePath();
  const opening=new THREE.Path();opening.moveTo(-.491,1.758);opening.lineTo(-.491,1.980);
  opening.lineTo(-.297,1.980);opening.lineTo(-.297,1.758);opening.closePath();hood.holes.push(opening);
  P.add('gunMount',new THREE.ExtrudeGeometry(hood,{depth:.103,steps:1,bevelEnabled:false})
    .translate(-.016,-1.878,.901-.700));
  P.add('gunMount',gunPrism(-.560,-.223,[[1.960,1.004],[2.114,.968],[1.965,1.286]]));
  P.add('gunMount',gunPrism(-.517,-.266,[[1.689,.901],[1.758,1.004],[1.731,1.096]]));
  for(const [a,b]of[[-.560,-.491],[-.297,-.223]])
    P.add('gunMount',gunPrism(a,b,[[1.758,1.004],[1.96,1.004],[1.96,1.23],[1.82,1.195]]));
  P.add('gunMount',box(.1939,.2526,.0169),-.39455-.016,1.854-1.878,.99545-.700);
  P.add('gunMount',box(.1436,.2339,.0352),-.3921-.016,1.8741-1.878,1.0217-.700);
  const opticX=-.3898-.016,opticY=1.85355-1.878,opticFront=1.143-.700;
  P.add('gunMount',cylZ(.0641,.016,P.q?24:12),opticX,opticY,1.039-.700);
  P.add('gunMount',new THREE.CylinderGeometry(.0641,.0641,.1403,P.q?24:12,1,true).rotateX(Math.PI/2),opticX,opticY,opticFront-.07015);
  P.add('gunMount',new THREE.RingGeometry(.043,.0641,P.q?24:12),opticX,opticY,opticFront);
  P.add('gunMountDark',cylZ(.0413,.016,P.q?24:12),opticX,opticY,1.052-.700);
  // The smaller right receiver is 216mm behind the left lens, on the source
  // sloped root. Its actual open circular seat remains ahead of that stock.
  const right=new THREE.Shape();right.moveTo(-.106,-.097);right.lineTo(.106,-.097);
  right.lineTo(.106,.097);right.lineTo(-.106,.097);right.closePath();
  const rightAir=new THREE.Path();rightAir.absarc(0,0,.061,0,Math.PI*2,true);right.holes.push(rightAir);
  P.add('gunMount',new THREE.ExtrudeGeometry(right,{depth:.076,steps:1,bevelEnabled:false,curveSegments:P.q?12:6}),.400,.046,.0985);
  P.add('gunMount',cylZ(.066,.052,P.q?24:12),.400,.046,.108);
  P.add('gunMountDark',cylZ(.0603,.012,P.q?24:12),.400,.046,.1375);
}

function buildTmlCannon(P: TankBuilderPort): void {
  // Measured taper and stepped terminal; the extreme tip is a pair of side lips.
  const barrelStations=[[.109,1.19339],[.078,2.0],[.055,3.53709],[.0943,3.64249],
    [.0856,3.85149],[.13195,3.94719],[.13195,3.98239],[.118,4.04289]];
  P.add('gun',new THREE.LatheGeometry(barrelStations.map(([r,z])=>new THREE.Vector2(r,z)),P.q?32:16).rotateX(Math.PI/2));
  openTube(P,.118,3.99,4.04289,.0525);
  for(const side of [-1,1])P.add('gun',box(.022,.0696,.0371),side*.0982,0,4.06144);
  P.physicalMuzzleBore = { outerRadiusM:.118, innerRadiusM:.0525, depthM:.20, rimProjectionM:.0371 };
  for(const z of [1.23,2.0,3.64])P.add('gun',cylZ(z<1.5?.115:z<3?.083:.096,.025,P.q?24:12),0,0,z);
}

export function buildCv90105TmlX(P: TankBuilderPort): void {
  // Measured fixed armor extends the shadow silhouette; omit small fittings.
  P.additionalShadowSources = {
    hull: ['hullExternalArmor', 'hullHatch'],
    turret: ['turretCupola', 'turretHatch'],
  };
  P.hullG.position.set(0,0,0); P.turretG.position.set(.016,1.595,-.62);
  P.gunG.position.set(0,.283,1.32);
  buildTmlHull(P);
  buildTmlRunningGear(P);
  const py=P.turretG.position.y,pz=P.turretG.position.z;
  buildTmlTurretArmor(P,py,pz);
  buildTmlRoofFittings(P,py,pz);
  buildTmlMantlet(P);
  buildTmlCannon(P);
  preserveSourceStudyGunMountAppearance(P);
  P.topY=2.73-py;
  P.hullG.userData.xRebuild={candidate:'cv90105_tml_x',independent:true,sourceLocalOnly:true,datumVersion:1};
}
export const CV90105_TML_SOURCE_X_PROFILES={cv90105_tml_x:{build:buildCv90105TmlX}} as const;
