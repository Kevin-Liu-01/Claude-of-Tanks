// Four independently authored September 2026 owner-reference reconstructions.
// Source assets are quarantined comparison inputs only. Every runtime surface
// below is an original solid primitive, not a source contour or mesh buffer.
import * as THREE from 'three';
import { KIT, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { markEraHitFaces, markEraFurniture as eraFurniture } from './eraHitFaces.ts';
import { addT90MFenders, addT90MInnerSidePlates, addT90MRearDrums } from './t90MXHullEnds.ts';
import { addT90MEngineDeck } from './t90MXEngineDeck.ts';
import { addT90ARwsBracket } from './t90AXRwsBracket.ts';
import { addT90AGun } from './t90AXGun.ts';
import { addT90MRwsHousing } from './t90MXRwsHousing.ts';
import { addT90ASmokeTubes } from './t90AXSmoke.ts';
import { addT90VRearGuards } from './t90VXRearGuards.ts';
import { addT90VFrontGuard } from './t90VXFrontGuards.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { addT90SMRearBasket } from './t90SMXRearBasket.ts';
import { addT90ARearGuard } from './t90AXRearGuard.ts';
import { addT90SMEngineDeck, smEngineDeckSupportRoof } from './t90SMXEngineDeck.ts';
import { smHullTub } from './t90SMXHullTub.ts';
import { addT90SMTowCable } from './t90SMXTowCable.ts';
import { addT90SMFenderShoulders } from './t90SMXFenderShoulders.ts';
import { addT90SMFrontEra } from './t90SMXFrontEra.ts';
import { addT90SMGunSaddles } from './t90SMXGunSaddles.ts';
import { addT90SMSmoke } from './t90SMXSmoke.ts';
import { addT90SMRwsBase } from './t90SMXRwsBase.ts';
import { addT90SMLeftLauncherShelf, t90SMLeftCarrierRoof, t90SMLeftCarrierBreakpoints } from './t90SMXLauncherShelf.ts';
import { addT90SMRightLauncherBracket } from './t90SMXRightLauncherBracket.ts';
import { addT90SMLeftSmokeMounts } from './t90SMXLeftSmokeMounts.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylZ, torus } = KIT;
const cylY=(radius:number,height:number,segments=24): THREE.BufferGeometry => KIT.cylY(radius,radius,height,segments);
type V3 = readonly [number, number, number];
type Station = readonly [number, number, number, number];
type Datum = { yaw: V3; gun: V3; muzzle: number; roof: number; height: number };
const A: Datum = { yaw: [.010,1.468,-.0039], gun: [.005,1.8174,1.30], muzzle: 6.2642, roof: 2.2049, height: 2.8266 };
const V: Datum = { yaw: [0,1.416,.298], gun: [0,1.7287,1.34], muzzle: 6.5964, roof: 2.2595, height: 3.8069 };
const M: Datum = { yaw: [.018092,1.336748,-.104459], gun: [.001973,1.608251,1.140604], muzzle: 6.2542, roof: 2.0309, height: 2.9739 };
const S: Datum = { yaw: [.008,1.532,.359], gun: [.001,1.90309,1.56], muzzle: 7.0399, roof: 2.2893, height: 3.1501 };

export const T90_X_DATUMS = Object.freeze({
  t90a_x: { ...A, widthM: 3.78, hullLengthM: 6.86, exteriorHullLengthM: 7.9922, overallLengthM: 10.4586 },
  t90a_vladimir_x: { ...V, widthM: 3.78, hullLengthM: 6.86, exteriorHullLengthM: 8.1115, overallLengthM: 10.7863 },
  t90m_x: { ...M, widthM: 3.78, hullLengthM: 6.86, exteriorHullLengthM: 7.8329, overallLengthM: 10.3513 },
  t90sm_x: { ...S, widthM: 3.78, hullLengthM: 6.86, exteriorHullLengthM: 8.0598, overallLengthM: 11.1371 },
});

function frame(P: TankBuilderPort, d: Datum): void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(...d.yaw);
  P.gunG.position.set(d.gun[0]-d.yaw[0],d.gun[1]-d.yaw[1],d.gun[2]-d.yaw[2]);
  P.muzzleZ = d.muzzle-d.gun[2];
  P.topY = d.height-d.yaw[1];
}

function sourceWheelFaces(P: TankBuilderPort,r:number,halfWidth:number,zScale:number): void {
  const shape=new THREE.Shape();shape.absarc(0,0,r*.865,0,Math.PI*2,false);
  for(let i=0;i<6;i++) {
    const angle=i*Math.PI/3,hole=new THREE.Path();
    hole.absarc(Math.sin(angle)*r*.55,Math.cos(angle)*r*.55,r*.12,0,Math.PI*2,true);
    shape.holes.push(hole);
  }
  const disc=new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:false,curveSegments:16})
    .translate(0,0,-.009).rotateY(Math.PI/2).scale(1,1,zScale);
  const rim=torus(r*.853,.010,32,8).rotateZ(Math.PI/2).scale(1,1,zScale);
  const bolts=Array.from({length:6},(_,i)=>{
    const angle=i*Math.PI/3;
    return cylX(.012,.025,6).translate(0,Math.sin(angle)*r*.30,Math.cos(angle)*r*.30*zScale);
  });
  P.gear?.addRoadWheelLayer(disc,P.mats.wheels,{outset:halfWidth+.004,name:'gearRoadWheelSourcePressedFaces',appearanceRole:'wheelDish'});
  P.gear?.addRoadWheelLayer(rim,P.mats.wheels,{outset:halfWidth+.010,name:'gearRoadWheelSourceRims',appearanceRole:'wheelDish'});
  P.gear?.addRoadWheelLayer(cylX(r*.24,.030,20),P.mats.wheels,{outset:halfWidth+.010,name:'gearRoadWheelSourceHubs',appearanceRole:'wheelDish'});
  P.gear?.addRoadWheelLayer(KIT.mergeAll(bolts),P.mats.dark,{outset:halfWidth+.019,name:'gearRoadWheelSourceBolts',appearanceRole:'wheelInset'});
}

function hullStation([z,half,roof,keel]: Station): SolidSection {
  const bevel = Math.min(.11,(roof-keel)*.2);
  return { z, ring: [
    [-half+.075,keel],[half-.075,keel],[half,keel+bevel],
    [half,roof-bevel],[half-.018,roof],[-half+.018,roof],
    [-half,roof-bevel],[-half,keel+bevel],
  ] };
}

function shellStation(d: Datum,[z,half,roof,chin]: Station): SolidSection {
  const depth=roof-chin,lower=Math.min(.16,depth*.27);
  const transition=Math.min(1,Math.max(0,(z+.12)/.627));
  const upper=d===M?Math.min(depth*.60,.060+transition*.116):Math.min(.23,depth*.39);
  const crown=Math.max(.035,d===M?(z<=-.12?half-.20:.94-transition*.44):half-Math.min(.24,half*.28));
  // Modern castings neck into a circular bearing footprint. Their maximum
  // shoulder width is not the width of the underside at the same station.
  const ringFoot=d===S&&chin<1.59;
  const footHalf=ringFoot?Math.min(half-.055,Math.sqrt(Math.max(.002,.95*.95-(z-d.yaw[2])**2))):half-.055;
  return { z:z-d.yaw[2],ring:[
    [-footHalf-d.yaw[0],chin-d.yaw[1]],[footHalf-d.yaw[0],chin-d.yaw[1]],
    [half-d.yaw[0],chin+lower-d.yaw[1]],[half-d.yaw[0],roof-upper-d.yaw[1]],
    [crown-d.yaw[0],roof-d.yaw[1]],[-crown-d.yaw[0],roof-d.yaw[1]],
    [-half-d.yaw[0],roof-upper-d.yaw[1]],[-half-d.yaw[0],chin+lower-d.yaw[1]],
  ] };
}

function hullSolid(stations: readonly Station[]): THREE.BufferGeometry {
  return sectionSolid(stations.map(hullStation));
}

function turretSolid(d: Datum,stations: readonly Station[]): THREE.BufferGeometry {
  return sectionSolid(stations.map(s=>shellStation(d,s)));
}

function forkedFore(P: TankBuilderPort,d: Datum,stations: readonly Station[],opening: number): void {
  for(const side of [-1,1]) {
    const sections=stations.map(station=>{
      const full=shellStation(d,station),r=full.ring;
      const inner=side*opening-d.yaw[0];
      const profile=side>0?[ [inner,r[1][1]],r[1],r[2],r[3],r[4],[inner,r[4][1]] ]:
        [r[0],[inner,r[0][1]],[inner,r[5][1]],r[5],r[6],r[7]];
      return {z:full.z,ring:profile as readonly (readonly [number,number])[]};
    });
    P.add('turret',sectionSolid(sections));
  }
}

function onTurret(P: TankBuilderPort,d: Datum,bucket: string,g: THREE.BufferGeometry,
  x: number,y: number,z: number,rx=0,ry=0,rz=0): void {
  P.addEquipment(bucket,g,x-d.yaw[0],y-d.yaw[1],z-d.yaw[2],rx,ry,rz);
}

function ring(P: TankBuilderPort,d: Datum,r: number): void {
  P.add('turret',cylY(r,.082,48),0,.029,0);
}

function barrel(P: TankBuilderPort,d: Datum,r: number,evacZ: number,evacLength: number): void {
  const len=d.muzzle-d.gun[2];
  KIT.buildGun(P,{len,r,baseR:r*1.36,sleeve:false,collar:false});
  // Independently measured thermal sleeve spans and long Soviet evacuator.
  const spans: readonly (readonly [number,number,number])[] = [
    [.20,.94,r*1.19],[1.01,evacZ-d.gun[2]-.48,r*1.10],
    [evacZ-d.gun[2]+evacLength*.5,len-.22,r*1.035],
  ];
  for(const [start,end,radius] of spans) {
    if(end<=start)continue;
    P.add('gun',cylZ(radius,end-start,28),0,0,(start+end)/2);
    for(const z of [start,end])P.add('gun',cylZ(radius*1.055,.026,28),0,0,z);
  }
  P.add('gun',cylZ(d===M?.11216:r*1.26,evacLength,28),0,0,evacZ-d.gun[2]);
  P.add('gun',box(.055,.055,.12),0,r+.019,len-.18);
}

function mantlet(P: TankBuilderPort,d: Datum,width: number,front: number,back: number): void {
  if(d===V) { vMantlet(P);return; }
  const sections=[
    {z:back-d.gun[2],ring:[[-width*.46,-.22],[width*.46,-.22],[width*.50,.18],[-width*.50,.18]] as const},
    {z:front-d.gun[2],ring:[[-width*.35,-.15],[width*.35,-.15],[width*.40,.14],[-width*.40,.14]] as const},
  ];
  P.add('gunMount',sectionSolid(sections));
  P.add('gunMount',cylX(.245,width,28),0,-.015,-.05);
  P.addGunExtra(cylZ(.15,.08,24),0,0,front-d.gun[2]+.03);
  if(d===M)mGunBoot(P);
  if(d===S)smGunBoot(P);
}

function smGunBoot(P:TankBuilderPort):void {
  // Source misc_b has a canted, asymmetric upper cradle cover and a
  // separate narrow sight housing above it. These pitch with the cradle;
  // they are not recoil-mounted barrel furniture or a filled muzzle.
  const rows:readonly(readonly[number,number,number,number])[]=[
    [1.328,1.950,2.198,.30],[1.500,1.950,2.211,.30],
    [1.730,1.750,2.112,.30],[1.900,1.790,2.0762,.30],
    [2.140,1.810,2.0278,.28],[2.205,1.810,2.0249,.235],
  ];
  P.add('gunMount',sectionSolid(rows.map(([z,low,high,half]):SolidSection=>{
    const left=-half,right=half+.085,inner=high-.007;
    const ring:readonly(readonly[number,number])[]=[
      [left,low],[left+.007,low],[left+.007,inner-.014],[-.08,inner],[.04,inner],
      [right-.007,inner-.014],[right-.007,low],[right,low],[right,high-.014],
      [.04,high],[-.08,high],[left,high-.014],
    ];
    return {z:z-S.gun[2],ring:ring.map(([x,y])=>[x-S.gun[0],y-S.gun[1]] as const)};
  })));
  const x=-.028627,z=1.76018;
  for(const side of [-1,1])P.addEquipment('gunMount',box(.006,.10056,.32794),
    x+side*.04723-S.gun[0],2.15649-S.gun[1],z-S.gun[2]);
  for(const y of [2.10921,2.20377])P.addEquipment('gunMount',box(.10046,.006,.32794),
    x-S.gun[0],y-S.gun[1],z-S.gun[2]);
  P.addEquipment('gunMount',box(.09446,.09456,.006),x-S.gun[0],2.15649-S.gun[1],1.59921-S.gun[2]);
  P.addEquipment('gunMount',box(.09446,.036,.006),x-S.gun[0],2.18877-S.gun[1],1.92115-S.gun[2]);
  P.addEquipment('gunMount',box(.09,.062,.004),x-S.gun[0],2.13817-S.gun[1],1.91747-S.gun[2]);
}

function mGunBoot(P:TankBuilderPort):void {
  // Source canvas covers a longer pitching cradle than the steel trunnion.
  // Original positive U-section cloth skins keep the underside and forward
  // barrel aperture open; they do not fill a rectangular bounding volume.
  const rows:readonly(readonly[number,number,number,number,number])[]=[
    [.987,-.4149,.3123,1.969,1.982],[1.140,-.4149,.3123,1.421,1.926],
    [1.450,-.4149,.3188,1.4865,1.830],[1.800,-.4149,.3187,1.583,1.718],
  ];
  const sections=rows.map(([z,left,right,low,high]):SolidSection=>({z:z-M.gun[2],ring:[
    [left-M.gun[0],low-M.gun[1]],[left+.007-M.gun[0],low-M.gun[1]],
    [left+.007-M.gun[0],high-.007-M.gun[1]],[right-.007-M.gun[0],high-.007-M.gun[1]],
    [right-.007-M.gun[0],low-M.gun[1]],[right-M.gun[0],low-M.gun[1]],
    [right-M.gun[0],high-M.gun[1]],[left-M.gun[0],high-M.gun[1]],
  ]}));
  P.add('gunMount',sectionSolid(sections));
  for(const side of [-1,1]) {
    const flap:readonly(readonly[number,number,number,number])[]=side<0?
      [[1.800,-.4149,1.583,1.718],[1.950,-.2404,1.6265,1.671],[2.005,-.131,1.641,1.654]]:
      [[1.800,.3187,1.5846,1.718],[1.950,.1854,1.6272,1.671],[2.005,.115,1.641,1.654]];
    P.add('gunMount',sectionSolid(flap.map(([z,outer,low,high]):SolidSection=>{
      const left=Math.min(outer,side*.097),right=Math.max(outer,side*.097);
      return {z:z-M.gun[2],ring:[[left-M.gun[0],low-M.gun[1]],[right-M.gun[0],low-M.gun[1]],
        [right-M.gun[0],high-M.gun[1]],[left-M.gun[0],high-M.gun[1]]]};
    })));
  }
}

function vMantlet(P:TankBuilderPort):void {
  // Canvas boot: a rounded inflated rear collar, tucked shoulder and long
  // circular front cuff. The independently measured station envelope is
  // markedly different from the old triangular steel mantlet approximation.
  const rows:readonly(readonly[number,number,number,number])[]=[
    [1.115,.282,1.514,2.062],[1.230,.329,1.491,2.086],
    [1.370,.298,1.473,2.051],[1.512,.199,1.559,1.954],[1.713,.150,1.579,1.876],
  ];
  const sections=rows.map(([z,r,low,high],station):SolidSection=>({z:z-V.gun[2],ring:Array.from({length:24},(_,i)=>{
    const a=i*Math.PI/12,fold=1+(station===0||station===4?0:.012*Math.cos(a*6+station*.7));
    return [Math.cos(a)*r*fold,(low+high)/2+Math.sin(a)*(high-low)/2*fold-V.gun[1]] as const;
  })}));
  P.add('gunMount',sectionSolid(sections));
  P.add('gunMount',cylZ(.199,.040,32),.008,1.754-V.gun[1],1.514-V.gun[2]);
  P.add('gunMount',cylZ(.151,.026,32),0,0,1.707-V.gun[2]);
}

function fuelDrums(P: TankBuilderPort,rearZ: number,y: number,r: number,length: number,spacing: number,
  strapWidth=.025,zScale=1,strapRatio=.39): void {
  for(const side of [-1,1]) {
    const x=side*spacing,z=rearZ+r*zScale;
    P.addEquipment('hullDetail',cylX(r,length,32).scale(1,1,zScale),x,y,z);
    for(const offset of [-length*strapRatio,length*strapRatio]) {
      P.addEquipment('hullDark',cylX(r+.007,strapWidth,32).scale(1,1,zScale),x+offset,y,z);
      P.addEquipment('hullDetail',cylX(r*.96,.029,32).scale(1,1,zScale),x+offset+Math.sign(offset)*.018,y,z);
      P.addEquipment('hullDetail',box(strapWidth+.012,.034,.062),x+offset,y+r+.015,z+.033);
    }
    P.addEquipment('hullDetail',cylX(r*.16,length+.014,12),x,y,z);
    P.addEquipment('hullDetail',box(.11,.09,.60),x,y-.23,z+.22,-.22);
    P.addEquipment('hullDark',box(.095,.10,.21),x,y-.18,-3.35);
    const hose=new THREE.CatmullRomCurve3([
      new THREE.Vector3(x,y+r*.55,z+.11),new THREE.Vector3(x*.55,y+r*.7,z+.4),
      new THREE.Vector3(x*.5,1.39,-3.19),
    ]);
    P.addEquipment('hullDark',new THREE.TubeGeometry(hose,12,.018,6,false));
  }
}

function engineDeck(P: TankBuilderPort,y: number,rear: number,width: number): void {
  for(const side of [-1,1]) {
    const x=side*width*.25;
    P.addEquipment('hullDark',box(width*.46,.025,1.13),x,y,rear+.69);
    for(let i=0;i<15;i++)P.addEquipment('hullDetail',box(width*.445,.023,.025),x,y+.02,rear+.18+i*.071);
    P.addEquipment('hullDetail',box(width*.465,.02,.035),x,y+.024,rear+.10);
    P.addEquipment('hullDetail',box(width*.465,.02,.035),x,y+.024,rear+1.29);
    P.addEquipment('hullDetail',box(.18,.045,.04),side*.82,y+.034,rear+.2);
  }
  P.addEquipment('hullDetail',box(1.52,.08,.30),0,y+.04,rear+1.38);
}

function bowGear(P: TankBuilderPort,y: number,z: number,modern: boolean,driverY=modern?1.54:1.50,driverZ=1.81,sourceM=false,finalBowStrip=true): void {
  for(const side of [-1,1]) {
    P.addEquipment('hullDark',cylZ(.09,.10,14),side*.85,y,z);
    P.addEquipment('hullGlass',cylZ(.066,.015,16),side*.85,y,z+.062);
    P.addEquipment('hullDetail',box(.27,.028,.28),side*.85,y+.115,z-.018,-.12);
    for(const dx of [-.105,.105])P.addEquipment('hullDetail',cylY(.013,.16,8),side*.85+dx,y+.034,z+.074);
    P.addEquipment('hullDetail',torus(.055,.020,12,6),side*.79,.64,z+.02);
    P.addEquipment('hullDetail',box(.07,.08,.10),side*.79,.64,z-.05);
  }
  if(sourceM)mDriverHatch(P);
  else {
    P.addHatch('hull',box(.64,.045,.49),0,driverY,driverZ);
    for(const x of [-.18,0,.18]) {
      P.addEquipment('hullDark',box(.145,.046,.09),x,driverY+.04,driverZ+.17);
      P.addEquipment('hullGlass',box(.115,.026,.008),x,driverY+.042,driverZ+.218);
    }
  }
  if(finalBowStrip) {
    P.addEquipment('hullDark',box(1.88,.055,.06),0,y-.08,z-.10);
    for(let i=0;i<7;i++)P.addEquipment('hullDetail',cylZ(.019,.012,8),-.79+i*.264,y-.08,z-.06);
  }
}

function mDriverHatch(P: TankBuilderPort): void {
  P.addHatch('hull',box(.5211,.0158,.385),.002,1.3456,1.6383);
  P.addEquipment('hullDetail',box(.0458,.0697,.0479),-.4032,1.3555,1.6859);
  P.addEquipment('hullDark',box(.1597,.0611,.0485),.002,1.3264,1.911);
  P.addEquipment('hullGlass',box(.133,.026,.008),.002,1.337,1.936);
  P.addEquipment('hullDetail',box(.070,.0165,.1089),.182,1.3803,1.6948);
  P.addEquipment('hullDetail',box(.0977,.0165,.0434),-.0928,1.3806,1.748);
}

function fenders(P: TankBuilderPort,tag: string,half: number,top: number): void {
  for(const side of [-1,1]) {
    const inner=1.08,outer=half;
    // A supported longitudinal mudguard skin, above the actual shoe course.
    P.add('hull',box(outer-inner,.06,5.72),side*(outer+inner)/2,top-.03,-.18);
    addT90VFrontGuard(P, side, `${tag}-bow`);
    P.addEquipment('hullDetail',box(.035,.065,5.88),side*(half-.04),top+.019,-.17);
    for(const z of [-2.80,-1.53,-.28,.99,2.20]) {
      P.addEquipment('hullDetail',box(.69,.023,.038),side*1.42,top+.022,z);
      P.addEquipment('hullDetail',torus(.031,.010,10,6),side*(half-.08),top+.04,z,Math.PI/2);
    }
  }
}

function aFenders(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    P.add('hull',box(.595,.025,6.495),side*1.395,1.289,.053);
    P.add('hull',box(.148,.027,3.054),side*1.754,1.247,1.657);
    const rows:readonly (readonly [number,number,number])[]=[
      [3.180,1.278,1.827],[3.300,1.265,1.827],[3.400,1.247,1.827],
      [3.500,1.216,1.826],[3.590,1.161,1.825],[3.685,1.071,1.825],[3.782,.857,1.698],
    ];
    const sections=rows.map(([z,top,outer]):SolidSection=>{
      const profile:readonly (readonly [number,number])[]=[[1.097,top-.014],[outer,top-.014],[outer,top],[1.097,top]];
      return {z,ring:side>0?profile:profile.map(([x,y])=>[-x,y] as const).reverse()};
    });
    P.addMudguard('t90a-x-bow','hull',sectionSolid(sections));
    addT90ARearGuard(P,side);
    for(const z of [-2.80,-1.53,-.28,.99,2.20])P.addEquipment('hullDetail',box(.59,.022,.035),side*1.39,1.319,z);
  }
}

function classicSkirts(P: TankBuilderPort,tag: string,roof: number,rear: number,front: number): void {
  for(const side of [-1,1]) {
    if(tag==='kontakt5-source-a')aHangingSkirts(P,side);
    else for(let i=0;i<6;i++) {
      const z0=rear+i*(front-rear)/6,z1=rear+(i+1)*(front-rear)/6-.014;
      const top=roof-Math.max(0,z0-1.5)*.105,low=.733;
      P.add('hull',box(.032,top-low,z1-z0),side*1.812,(top+low)/2,(z0+z1)/2);
      P.addEquipment('hullDetail',box(.026,.042,.14),side*1.834,top-.043,(z0+z1)/2);
    }
    // Three distinct forward Kontakt-5 heavy side modules, not full-length ERA.
    for(let i=0;i<3;i++) {
      const z=.98+i*.735,high=roof+.11-Math.max(0,z-1.4)*.12;
      if(tag==='kontakt5-source-a') { aSideArmor(P,side,i);continue; }
      bindEra(P,'skirt',side,()=>{
        P.addExternalArmor('hull',eraHitFaces(box(.055,.49,.687),side),side*1.8525,high-.245,z);
        for(const dz of [-.26,.26])P.addEquipment('hullDetail',eraFurniture(box(.022,.07,.040)),side*1.879,high-.10,z+dz);
      });
    }
    if(tag==='kontakt5-source-a'&&side<0)aLeftFenderCase(P);
    else P.addEquipment('hullDetail',box(.57,.17,1.35),side*1.40,roof+.075,-2.06);
    P.addEquipment('hullDetail',box(.57,.17,1.46),side*1.40,roof+.075,-.55);
    P.addEquipment('hullDetail',box(.57,.14,1.39),side*1.40,roof+.06,.96);
    P.addEquipment('hullDark',box(.025,.13,.41),side*1.705,roof+.015,-1.59);
    P.addEquipment('hullDetail',box(.035,.035,.52),side*1.71,roof+.088,-1.59);
  }
  if(tag==='kontakt5-source-a') {
    P.addEquipment('hullDark',box(.058,.147,.336),-1.7145,1.367,-1.8528);
    P.addEquipment('hullDetail',box(.070,.017,.349),-1.7145,1.438,-1.8528);
  }
  P.hullG.userData.sourceSkirtDesign=tag;
}

function aHangingSkirts(P:TankBuilderPort,side:number):void {
  const spans:readonly(readonly[number,number])[]=[[-3.277,-1.351],[-1.403,.123],[.064,1.665],[1.608,3.184]];
  for(const [rear,front]of spans) {
    const sections=[0,.22,.50,.80,1].map((t):SolidSection=>{
      const center=1.804-(t===.22?.028:t===.50?.017:0),low=t===0?.85:.72953;
      const r:readonly(readonly[number,number])[]=[[center-.006,low],[center+.006,low],[1.813,1.1444],[1.801,1.1444]];
      return {z:rear+t*(front-rear),ring:side>0?r:r.map(([x,y])=>[-x,y] as const).reverse()};
    });
    P.add('hull',sectionSolid(sections));
  }
  for(const [rear,front,high]of [[-3.272,-1.517,1.4617],[-1.511,.309,1.4622],[.316,1.689,1.4617],[1.693,2.808,1.4354]] as const) {
    const sections=[rear,front].map((z):SolidSection=>{
      const top=rear>1.69&&z===front?1.278:high;
      const r:readonly(readonly[number,number])[]=[[1.683,1.258],[1.702,1.258],[1.722,top],[1.704,top]];
      return {z,ring:side>0?r:r.map(([x,y])=>[-x,y] as const).reverse()};
    });
    P.addEquipment('hullDetail',sectionSolid(sections));
  }
}

function aLeftFenderCase(P:TankBuilderPort):void {
  // The left aft fuel/tool case is taller and shorter than the right one.
  P.addEquipment('hullDetail',box(.6355,.2845,.928),-1.4083,1.3903,-1.8497);
  for(const [x,z]of [[-1.5327,-1.6569],[-1.2909,-2.0400]] as const)
    P.addEquipment('hullDetail',box(.0324,.0086,.4126),x,1.535,z);
}

function aDrums(P:TankBuilderPort):void {
  fuelDrums(P,-4.1654,1.4645,.3160,.9590,.6143,.06476,1.0660,.311);
  for(const side of [-1,1]) {
    for(const x of [.4439,.7634])P.addEquipment('hullDetail',cylX(.34436,.020,32).scale(1,1,1.0653),side*x,1.46641,-3.8275);
    P.addEquipment('hullDetail',box(.07654,.1097,.1078),side*.5956,1.7694,-3.6273);
    P.addEquipment('hullDetail',box(.09876,.060,.1473),side*.5977,1.738,-3.6456,.50);
  }
}

function aSideArmor(P: TankBuilderPort,side:number,index:number): void {
  const z=[1.0545,1.7911,2.5238][index],top=[1.4379,1.4198,1.2969][index],low=top-.4973;
  const ring:readonly (readonly [number,number])[]=[[1.8348,low],[1.8465,low],[1.8900,top],[1.8783,top]];
  const cross=side>0?ring:ring.map(([x,y])=>[-x,y] as const).reverse();
  bindEra(P,'skirt',side,()=> {
    P.addExternalArmor('hull',eraHitFaces(sectionSolid([{z:z-.346,ring:cross},{z:z+.346,ring:cross}]),side));
    for(const dz of [-.26,.26])P.addEquipment('hullDetail',eraFurniture(box(.012,.036,.040)),side*1.880,top-.08,z+dz);
  });
  const backing=ring.map(([x,y])=>[side*(x-.0101),y] as const);
  const backingCross=side>0?backing:backing.reverse();
  P.addEquipment('hullDetail',sectionSolid([{z:z-.346,ring:backingCross},{z:z+.346,ring:backingCross}]));
}

type ReactiveSector='glacis'|'skirt'|'turret'|'side';
function bindEra(P:TankBuilderPort,sector:ReactiveSector,side:number,fill:()=>void):void {
  P.destructibleCluster(`${sector}_era_${side<0?'L':'R'}`,fill);
}

// Select existing exterior triangles, never a fitted rectangle spanning a
// folded cassette. Local +Z/+Y are the exposed cheek/glacis faces; skirt
// skins instead expose their physical left/right outer wall.
function eraHitFaces(g:THREE.BufferGeometry,side=0):THREE.BufferGeometry {
  if(side!==0)return markEraHitFaces(g,[side,0,0],1e-6);
  markEraHitFaces(g,[0,1,0],1e-6);
  const upper:readonly number[]=g.userData.eraHitFaceVertexStarts;
  markEraHitFaces(g,[0,0,1],1e-6);
  g.userData.eraHitFaceVertexStarts=[...new Set([...upper,...g.userData.eraHitFaceVertexStarts])];
  return g;
}

function inclinedHullPlate(P:TankBuilderPort,x:number,width:number,rear:number,front:number,high:number,low:number,thickness:number,reactive=false):void {
  const angle=Math.atan2(high-low,front-rear),length=Math.hypot(front-rear,high-low);
  const fill=()=> {
    const cover=box(width,thickness,length);
    P.addExternalArmor('hull',reactive?eraHitFaces(cover):cover,x,(high+low)/2,(front+rear)/2,angle);
    for(const side of [-1,1])P.addEquipment('hullDetail',eraFurniture(box(.027,.016,.036)),x+side*width*.30,(high+low)/2+.018,(front+rear)/2,angle);
  };
  if(reactive)bindEra(P,'glacis',x,fill);
  else fill();
}

function aGlacis(P:TankBuilderPort):void {
  // Separate short rear tiles, a four-panel middle course and the shorter
  // forward course; the outer forward panels narrow at the bow corners.
  const mid:readonly (readonly[number,number])[]=[[-.6505,.4079],[-.2146,.4465],[.2376,.4403],[.6735,.4140]];
  for(const [x,w] of mid)inclinedHullPlate(P,x,w,2.387,2.995,1.352,1.086,.070,true);
  const fore:readonly (readonly[number,number])[]=[[-.6153,.3350],[-.2164,.4477],[.2371,.4473],[.6372,.3406]];
  for(const [x,w]of fore)inclinedHullPlate(P,x,w,3.025,3.418,1.055,.869,.054,true);
  for(const side of [-1,1]) {
    inclinedHullPlate(P,side*.782,.306,2.057,2.325,1.482,1.381,.046,true);
    inclinedHullPlate(P,side*.401,.440,2.125,2.306,1.456,1.388,.046,true);
  }
  inclinedHullPlate(P,.0177,2.150,2.650,3.187,.479,.816,.041);
  P.addEquipment('hullDetail',box(.372,.257,1.668),-1.087,1.481,-2.416);
  P.addEquipment('hullDetail',box(1.220,.239,.334),-.2753,1.602,-1.710);
  P.addEquipment('hullDetail',cylX(.099,3.008,20),.0114,.913,-3.419);
  for(const side of [-1,1])P.addEquipment('hullDetail',box(.112,.225,.239),.0114+side*1.548,.910,-3.421);
}

function mGlacis(P:TankBuilderPort):void {
  // The reference laminate has three stepped fields across a 2.035 m face,
  // with a short rear course rather than two generic half-length rows.
  const courses:readonly(readonly[number,number,number,number,number])[]=[
    [1.949,2.168,1.359,1.280,.044],[2.182,2.687,1.305,1.124,.067],
    [2.704,3.456,1.172, .902,.118],
  ];
  for(const [rear,front,high,low,depth]of courses)for(let i=0;i<7;i++) {
    const x0=-1.0157+i*2.0354/7+.004,x1=x0+2.0354/7-.008;
    bindEra(P,'glacis',(x0+x1)/2,()=> {
      P.addExternalArmor('hull',eraHitFaces(sectionSolid([
        {z:rear,ring:[[x0,high-depth],[x1,high-depth],[x1,high],[x0,high]]},
        {z:front,ring:[[x0,low-depth],[x1,low-depth],[x1,low],[x0,low]]},
      ])));
      for(const x of [x0+.046,x1-.046])P.addEquipment('hullDetail',eraFurniture(cylY(.012,.014,6)),x,high-.035,rear+.09);
    });
  }
  // Real lower-front applique follows the rising tub face. It is not a
  // horizontal block bridging a black gap between the front shoulders.
  inclinedHullPlate(P,.0065,1.621,2.758,3.282,.379,.649,.047);
  for(const side of [-1,1])inclinedHullPlate(P,.0065+side*.778,.574,2.760,3.205,.388,.542,.040);
}

function vGlacis(P:TankBuilderPort):void {
  // Source Vladimir has shallow, staggered fittings on a continuous glacis,
  // not eight thick rectangular blocks standing above the hull plane.
  for(const side of [-1,1]) {
    inclinedHullPlate(P,side*.580,.735,1.965,2.133,1.428,1.373,.014,true);
    inclinedHullPlate(P,side*.197,.3366,2.636,2.862,1.202,1.127,.012,true);
    inclinedHullPlate(P,side*.707,.3366,2.636,2.862,1.202,1.127,.012,true);
    inclinedHullPlate(P,side*.365,.3366,2.943,3.169,1.102,1.028,.012,true);
    inclinedHullPlate(P,side*.882,.508,2.906,3.431,.491,.839,.029);
  }
  inclinedHullPlate(P,0,1.7336,2.873,3.308,.399,.811,.026);
  P.addEquipment('hullDetail',box(1.682,.014,.036),0,1.132,2.917);
  for(let i=0;i<9;i++)P.addEquipment('hullDetail',cylZ(.013,.017,6),-.778+i*.1945,.828,3.324);
}

function glacisEra(P: TankBuilderPort,front: number,back: number,low: number,high: number,columns: number): void {
  const angle=Math.atan2(high-low,front-back);
  const length=Math.hypot(front-back,high-low);
  for(let row=0;row<2;row++)for(let c=0;c<columns;c++) {
    const x=-.85+(c+.5)*1.7/columns;
    const z=back+(row+.5)*(front-back)/2;
    const y=high-(row+.5)*(high-low)/2+.031;
    P.addExternalArmor('hull',box(1.7/columns-.012,.063,length/2-.012),x,y,z,angle);
    P.addEquipment('hullDetail',box(.04,.024,.04),x,y+.05,z);
  }
}

type EraModule = { w:number; depth:number; low:number; high:number; nose:number; backLow?:number; noseLow?:number };

function eraWedge(P: TankBuilderPort,d: Datum,x: number,z: number,rotation: number,p: EraModule,sector:ReactiveSector='turret',hitFace=true): void {
  const half=p.w*.5;
  const g=sectionSolid([
    {z:-p.depth*.5,ring:[[-half,p.backLow??p.low],[half,p.backLow??p.low],[half,p.high],[-half,p.high]]},
    {z:p.depth*.5,ring:[[-half,p.noseLow??p.low],[half,p.noseLow??p.low],[half,p.nose],[-half,p.nose]]},
  ]);
  bindEra(P,sector,x-d.yaw[0],()=> {
    P.addExternalArmor('turret',hitFace?eraHitFaces(g):eraFurniture(g),x-d.yaw[0],-d.yaw[1],z-d.yaw[2],0,rotation);
    if(d===A) {
      const seam=box(p.w*.70,.018,.043).rotateX(Math.atan2(p.high-p.nose,p.depth))
        .translate(0,p.high+(p.nose-p.high)*.13+.012,-p.depth*.37).rotateY(rotation);
      onTurret(P,d,'turretDetail',eraFurniture(seam),x,0,z);
    } else onTurret(P,d,'turretDetail',eraFurniture(box(p.w*.70,.018,.043)),x,p.high+.007,z-p.depth*.37,0,rotation);
  });
}

type CheekCourse={count:number;lowerCount:number;x:number;z:number;dx:number;dz:number;angle:number;
  lowerDx:number;lowerDz:number;centerX?:number;firstLift?:number;upper:EraModule;lower:EraModule};

function placeCheekCourse(P: TankBuilderPort,d: Datum,side:number,p:CheekCourse): void {
  for(let i=0;i<p.count;i++) {
    const x=side*(p.x+i*p.dx)+(p.centerX??0),z=p.z-i*p.dz;
    const upper={...p.upper,high:p.upper.high+(i===0?(p.firstLift??0):0)};
    // M's rearmost upper/lower cassette pair wraps around the flank.
    // Its stowage boxes and folded carrier remain permanent geometry.
    const sector=d===M&&i===p.count-1?'side':'turret';
    eraWedge(P,d,x,z,side*p.angle,upper,sector);
    if(i<p.lowerCount)eraWedge(P,d,x+side*p.lowerDx,z+p.lowerDz,side*p.angle,p.lower,sector);
  }
}

function classicCheeks(P: TankBuilderPort,d: Datum,vladimir: boolean): void {
  const common={count:3,lowerCount:3,angle:.73,lowerDx:.040,lowerDz:.051,firstLift:.034};
  const p:CheekCourse=vladimir?{...common,x:1.111,z:1.236,dx:.179,dz:.247,
    upper:{w:.275,depth:.535,low:1.806,high:2.043,nose:1.856},
    lower:{w:.25,depth:.465,low:1.690,high:1.857,nose:1.857}}:
    {...common,x:1.106,z:1.172,dx:.172,dz:.206,
      upper:{w:.275,depth:.535,low:1.754,high:2.024,nose:1.804,backLow:1.919},
      lower:{w:.25,depth:.465,low:1.577,high:1.805,nose:1.805,noseLow:1.745}};
  for(const side of [-1,1])placeCheekCourse(P,d,side,p);
}

function modernCheeks(P: TankBuilderPort,d: Datum,sm: boolean): void {
  if(!sm) {
    const p:CheekCourse={count:4,lowerCount:4,x:.89862,centerX:.018092,z:1.381,dx:.18567,dz:.21047,angle:.80,lowerDx:.012,lowerDz:.013,
      upper:{w:.270,depth:.500,low:1.638,high:1.913,nose:1.738,backLow:1.823},
      lower:{w:.270,depth:.510,low:1.399,high:1.687,nose:1.570,noseLow:1.535}};
    for(const side of [-1,1])placeCheekCourse(P,d,side,p);
    return;
  }
  smCheekPanels(P);
}

function smCheekPanels(P:TankBuilderPort):void {
  const sides:readonly(readonly[number,number,number,number,number,number,number,number,number])[]=[
    [-1,2.165,1.699,.884,1.605,.967,1.692,.823,1.761],
    [1,2.130,1.660,.918,1.635,1.000,1.718,.858,1.792],
  ];
  for(const [side,high,low,coverX,coverZ,lowerX,lowerZ,ribX,ribZ]of sides) {
    for(let i=0;i<5;i++) {
      const dx=i*.204,dz=i*.230,angle=side*.84;
      // Close-seated broad folded covers carry only shallow seams. The
      // narrow tall source islands are their ribs, not the cover width.
      if(i<4) {
        eraWedge(P,S,side*(coverX+dx),coverZ-dz,angle,
          {w:.319,depth:.444,low:high-.231,high,nose:high-.223,backLow:high-.016,noseLow:high-.239});
        if(i===3)smOuterLowerCheek(P,side);
        else eraWedge(P,S,side*(lowerX+dx),lowerZ-dz,angle,
          {w:.324,depth:.451,low,high:low+.016,nose:low+.298,backLow:low,noseLow:low+.282});
      }
      smCheekRib(P,side,i,ribX+dx,ribZ-dz,low,high);
    }
  }
  smCentralCheeks(P);
}

function smOuterLowerCheek(P:TankBuilderPort,side:number):void {
  // The outboard lower cover is a clipped sheet, not a full rotated
  // rectangle. Its corner relief retains the measured outermost air gap.
  const left=side<0,w=left?.33568:.32703,depth=left?.45304:.45680;
  const low=left?1.69664:1.66113,high=left?1.99212:1.94849;
  const x=left?-1.58447:1.60503,z=left?1.00898:1.02933;
  const rows=[[-depth/2,w*.375],[-depth/2+.028,w/2],[depth/2-.028,w/2],[depth/2,w*.375]];
  const sections=rows.map(([along,half]):SolidSection=>{
    const y=low+(high-low-.016)*(along/depth+.5);
    return {z:along,ring:[[-half,y],[half,y],[half,y+.016],[-half,y+.016]]};
  });
  bindEra(P,'turret',side,()=>P.addExternalArmor('turret',eraHitFaces(sectionSolid(sections)),x-S.yaw[0],-S.yaw[1],z-S.yaw[2],0,side*.84));
}

function smCheekRib(P:TankBuilderPort,side:number,index:number,x:number,z:number,low:number,high:number):void {
  const terminal=index===4,terminalX=side>0?1.66653:-1.64553,terminalZ=side>0?.87307:.85182;
  const angle=side*(terminal?(side>0?.780:.752):.840);
  eraWedge(P,S,terminal?terminalX:side*x,terminal?terminalZ:z,angle,
    {w:.030,depth:terminal?.535:.550,low:low+.012,high,nose:low+.296,backLow:high-.018,noseLow:low+.275},'turret',false);
}

type ArmorCross=readonly[number,number,number,number,number];
function smSectionArmor(P:TankBuilderPort,rows:readonly ArmorCross[]):void {
  const sections=rows.map(([z,x0,x1,low,high]):SolidSection=>({z,
    ring:[[x0,low],[x1,low],[x1,high],[x0,high]],
  }));
  bindEra(P,'turret',rows[0][1],()=>P.addExternalArmor('turret',eraHitFaces(sectionSolid(sections)),-S.yaw[0],-S.yaw[1],-S.yaw[2]));
}

function smCentralCheeks(P:TankBuilderPort):void {
  // The final pairs are forward-facing plates, not another repeated
  // diagonal tile. Their positive skins leave the real center gun opening.
  smSectionArmor(P,[[1.594,-.590,-.421,2.116,2.126],[1.622,-.591,-.299,2.101,2.157],
    [2.007,-.599,-.307,1.919,1.976],[2.037,-.476,-.308,1.948,1.959]]);
  smSectionArmor(P,[[1.631,.389,.661,2.067,2.080],[1.658,.389,.662,2.056,2.111],
    [2.036,.386,.660,1.899,1.954],[2.066,.387,.660,1.929,1.943]]);
  smSectionArmor(P,[[1.694,-.601,-.434,1.746,1.753],[1.723,-.602,-.309,1.697,1.768],
    [2.129,-.602,-.308,1.903,1.974],[2.161,-.476,-.309,1.918,1.925]]);
  smSectionArmor(P,[[1.747,.382,.656,1.709,1.721],[1.775,.382,.656,1.667,1.736],
    [2.158,.386,.661,1.889,1.958],[2.188,.386,.661,1.904,1.916]]);
  smCornerCheek(P,-1);smCornerCheek(P,1);
}

function smCornerCheek(P:TankBuilderPort,side:number):void {
  const rows:readonly(readonly[number,number,number])[]=side<0?
    [[1.640,-.721,-.712],[1.705,-.783,-.599],[1.950,-1.020,-.600],[2.127,-.688,-.601],[2.162,-.622,-.615]]:
    [[1.696,.760,.769],[1.758,.654,.830],[2.000,.659,1.055],[2.161,.662,.743],[2.195,.673,.680]];
  const sections=rows.map(([z,x0,x1],i):SolidSection=>{
    // Independently measured broad panel planes have lateral crossfall.
    // Small terminal folds clip the otherwise planar 67 mm armor skin.
    const top=(x:number):number=>side<0?Math.min(1.9997,-.3152*x+.5085*z+.6995):Math.min(1.9512,.2801*x+.5671*z+.5383);
    const left=i===rows.length-1?(side<0?1.9298:1.9084):top(x0);
    const right=i===rows.length-1?left:top(x1),depth=i===0||i===rows.length-1?.007:.067;
    return {z,ring:[[x0,left-depth],[x1,right-depth],[x1,right],[x0,left]]};
  });
  bindEra(P,'turret',side,()=>P.addExternalArmor('turret',eraHitFaces(sectionSolid(sections)),-S.yaw[0],-S.yaw[1],-S.yaw[2]));
}

function mFrontFixtures(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    const x=side<0?-.697:.733;
    onTurret(P,M,'turretDetail',box(.311,.136,.435),x,1.752,1.586);
    onTurret(P,M,'turretDark',cylZ(.040,.043,14),x+side*.038,1.750,1.786);
    eraWedge(P,M,side<0?-.761:.797,1.583,0,
      {w:.449,depth:.531,low:1.399,high:1.687,nose:1.630,noseLow:1.620});
    eraWedge(P,M,side<0?-.499:.446,1.500,0,
      {w:side<0?.141:.250,depth:.384,low:1.641,high:1.872,nose:1.724,backLow:1.80});
    onTurret(P,M,'turretDetail',box(.13,.14,.290),side<0?-.499:.446,1.594,1.572);
  }
}

function classicSensors(P: TankBuilderPort,d: Datum,mirror: number): void {
  // Paired Shtora emitters have independent framed glass apertures, rear
  // housings and attachment brackets, and rotate with the turret shell.
  for(const side of [-1,1]) {
    const x=side*.82,z=1.65;
    onTurret(P,d,'turretDetail',box(.40,.27,.23),x,d.gun[1]-.02,z);
    onTurret(P,d,'turretDark',cylZ(.133,.025,20),x,d.gun[1]-.02,z+.127);
    onTurret(P,d,'turretGlass',cylZ(.108,.012,24),x,d.gun[1]-.02,z+.145);
    onTurret(P,d,'turretDetail',box(.44,.028,.28),x,d.gun[1]+.132,z-.005);
    onTurret(P,d,'turretDetail',box(.16,.14,.18),x,d.gun[1]-.15,z-.19);
  }
  classicBins(P,d);
  const centerTop=d===V?2.295:2.148,centerZ=d===V?.918:.847;
  onTurret(P,d,'turretDetail',box(.47,.19,.30),0,centerTop-.095,centerZ);
  onTurret(P,d,'turretDark',box(.22,.10,.015),0,centerTop-.07,centerZ+.154);
  if(d===A) {
    onTurret(P,d,'turretDetail',box(.314,.311,.359),-.760,2.282,.023);
    onTurret(P,d,'turretDark',box(.225,.14,.013),-.760,2.32,.211);
    onTurret(P,d,'turretGlass',box(.185,.11,.009),-.760,2.32,.220);
    onTurret(P,d,'turretDetail',box(.284,.14,.26),-.485,2.095,.55);
    onTurret(P,d,'turretDetail',box(.196,.14,.265),-.521,2.103,.792);
  }
}

function classicBins(P: TankBuilderPort,d: Datum): void {
  const rows=d===A?[
    [-1.136,1.801,-.835,.37,.396,.91,-.34],[1.091,1.815,-.867,.37,.375,.75,.34],
  ]:[[-1.11,1.833,-.747,.39,.438,.83,-.35],[1.134,1.827,-.713,.42,.421,.89,.35]];
  for(const [x,y,z,w,h,len,angle] of rows) {
    onTurret(P,d,'turretDetail',box(w,h,len),x,y,z,0,angle);
    onTurret(P,d,'turretDetail',box(w+.02,.020,len+.025),x,y+h/2+.007,z,0,angle);
    for(const dz of [-.26,.26])onTurret(P,d,'turretDark',box(.036,.055,.020),x+Math.sign(x)*w*.49,y+h*.28,z+dz,0,angle);
  }
  if(d===A) {
    onTurret(P,d,'turretDetail',box(1.454,.428,.457),.009,1.867,-1.530);
    onTurret(P,d,'turretDetail',box(1.416,.161,.211),.019,1.837,-1.855);
    for(const x of [-.647,.689])onTurret(P,d,'turretDetail',box(.062,.24,.27),x,1.836,-1.855);
  } else {
    onTurret(P,d,'turretDetail',box(1.233,.432,.400),0,1.913,-1.366);
    onTurret(P,d,'turretDetail',box(.39,.44,.79),-1.477,1.89,-.879,0,-.28);
    onTurret(P,d,'turretDetail',box(.44,.04,.83),-1.477,2.109,-.879,0,-.28);
  }
}

function smoke(P: TankBuilderPort,d: Datum,modern: boolean): void {
  if(d===A) { classicASmoke(P); return; }
  if(d===S) { addT90SMSmoke(P);addT90SMRightLauncherBracket(P);addT90SMLeftSmokeMounts(P); return; }
  if(d===M) { mSmoke(P);return; }
  for(const side of [-1,1]) {
    const count=modern?3:2;
    for(let row=0;row<3;row++)for(let c=0;c<count;c++) {
      const x=side*(1.25+c*.13-row*.06),y=d.roof-.42+row*.15,z=-.14+row*.048;
      onTurret(P,d,'turretDetail',box(.12,.085,.10),x,y-.08,z-.1,0,side*.50);
      onTurret(P,d,'turretDark',cylZ(.050,.25,12),x,y,z,-.28,side*.60);
      onTurret(P,d,'turretDetail',cylZ(.057,.036,12),x+side*.064,y+.027,z+.10,-.28,side*.60);
    }
  }
}

function mSmoke(P:TankBuilderPort):void {
  const banks:readonly(readonly[number,number,number,number,number])[]=[
    [-1,-1.1978,1.84054,-.17335,.082],[-1,-1.24516,1.93939,-.20408,.082],
    [1,1.22192,1.81478,-.13633,.0495],[1,1.24439,1.92208,-.19792,.088],
    [1,1.04320,2.05796,-.08150,.0356],
  ];
  for(const [side,x,y,z,step]of banks)for(const i of [-1,0,1]) {
    const cx=x+i*step,cz=z+i*side*.03;
    onTurret(P,M,'turretDetail',box(.075,.036,.119),cx,y-.06,cz-.05,0,side*.72);
    onTurret(P,M,'turretDark',cylZ(.044,.23,16),cx,y,cz,-.30,side*.72);
    onTurret(P,M,'turretDetail',cylZ(.049,.016,16),cx+side*.070,y+.034,cz+.080,-.30,side*.72);
  }
}

function classicASmoke(P: TankBuilderPort): void {
  addT90ASmokeTubes(P);
  for(const side of [-1,1]) {
    const y=side<0?1.86:1.83,x=side<0?-1.278:1.389;
    onTurret(P,A,'turretDetail',box(.038,.39,.28),x,y,-.205,0,side*.42);
    onTurret(P,A,'turretDetail',box(.30,.028,.40),side*1.18,2.115,-.17,0,side*.2,side*.17);
  }
}

function classicRoof(P: TankBuilderPort,d: Datum,mirror: number): void {
  for(const side of [-1,1]) {
    const x=side*.56,z=-.37,roof=d.roof-(side===mirror?.015:.045);
    P.addCupola('turret',cylY(.36,side===mirror?.145:.075,32),x-d.yaw[0],roof-d.yaw[1],z-d.yaw[2]);
    onTurret(P,d,'turretDetail',cylY(.32,.045,32),x,roof+.098,z);
    onTurret(P,d,'turretDetail',box(.18,.024,.035),x,roof+.134,z+.10);
    if(side===mirror)for(let i=0;i<6;i++) {
      const angle=i*Math.PI/3;
      onTurret(P,d,'turretDark',box(.11,.052,.10),x+Math.sin(angle)*.29,roof+.102,z+Math.cos(angle)*.29,0,angle);
    }
  }
  if(d===A) {
    classicACradle(P);
    classicMasts(P,d,mirror);
    return;
  }
  classicVCradle(P);
  classicMasts(P,d,mirror);
}

function classicVCradle(P: TankBuilderPort): void {
  // This supplied gun has a slender NSVT body, not the dimensions of the
  // generic Browning fitting. All spans are authored from hardware bounds.
  const d=V;
  const weapon=sourceMachineGun(P,d.yaw);
  weapon.add('turretDark',box(.0704,.1118,.5967),-.6125,2.7015,.5357);
  weapon.add('turretDark',cylZ(.0225,1.052,20),-.6125,2.7254,1.30785);
  weapon.add('turretDark',cylZ(.0177,.6694,16),-.6125,2.672,.7892+ .6694/2);
  weapon.add('turretDetail',box(.0454,.1046,.0162),-.6125,2.755,1.4727);
  weapon.add('turretDetail',box(.1012,.0343,.1937),-.6244,2.7481,.3273);
  weapon.add('turretDetail',box(.1184,.0373,.2197),-.6248,2.776,.5527);
  weapon.add('turretDetail',box(.208,.183,.140),-.6655,2.3868,-.0258);
  for(const x of [-.7935,-.4772])weapon.add('turretDetail',box(.0481,.2098,.1876),x,2.4069,.2728);
  weapon.add('turretDetail',box(.3342,.1728,.0266),-.6515,2.4185,.0632);
  weapon.add('turretDetail',box(.2682,.030,.1421),-.6353,2.5078,.2909);
  for(const x of [-.725,-.511])weapon.add('turretDetail',box(.0141,.233,.132),x,2.6335,.294);
  weapon.add('turretDetail',box(.1796,.3217,.3059),-.434,2.5566,.5513);
  weapon.add('turretDetail',box(.0882,.2329,.1917),-.4451,2.6043,.1477);
  weapon.add('turretDetail',box(.4744,.2772,.3382),-1.0399,2.6868,.3268);
  weapon.add('turretDetail',box(.5186,.0828,.3825),-1.0173,2.8288,.3435);
  weapon.add('turretDetail',box(.2868,.2853,.3019),-.9469,2.7024,.0768);
  weapon.add('turretDetail',cylX(.025,.470,14),-.8685,2.54,.135);
  weapon.finish();
}

function classicACradle(P: TankBuilderPort): void {
  const d=A;
  const weapon=sourceMachineGun(P,d.yaw);
  weapon.add('turretDark',box(.109,.134,.482),.632,2.657,.275);
  weapon.add('turretDark',cylZ(.014,1.011,16),.632,2.656,1.0215);
  weapon.add('turretDark',cylZ(.011,.65,12),.632,2.607,.806);
  weapon.add('turretDetail',box(.035,.045,.052),.632,2.701,1.415);
  // Two physical ammunition cases flank the open receiver cradle. Their
  // dimensions come from independent source equipment islands, not a mask.
  weapon.add('turretDetail',box(.414,.244,.171),.917,2.547,.303);
  weapon.add('turretDetail',box(.452,.068,.198),.909,2.657,.303);
  weapon.add('turretDetail',box(.320,.334,.206),.901,2.563,.028);
  addT90ARwsBracket(P);
  weapon.add('turretDetail',box(.136,.302,.273),.500,2.538,.332);
  weapon.add('turretDetail',box(.203,.197,.153),.631,2.355,-.155);
  weapon.add('turretDetail',cylY(.092,.195,20),.631,2.304,-.021);
  weapon.add('turretDetail',cylX(.032,.486,16),.800,2.358,-.047);
  weapon.finish();
}

function classicMasts(P: TankBuilderPort,d: Datum,mirror: number): void {
  if(d===V) { classicVMasts(P);return; }
  const x=-.36218,z=-1.00694;
  onTurret(P,d,'turretDetail',KIT.cylY(.0285,.0157,.445,24).scale(1,1,1.205),x,2.2683,z);
  onTurret(P,d,'turretDetail',cylY(.03619,.062,24).scale(1,1,1.970),x,2.522,z);
  onTurret(P,d,'turretDetail',cylY(.03132,.0956,24).scale(1,1,1.928),x,2.6008,z);
  onTurret(P,d,'turretDetail',cylY(.025735,.04294,24).scale(1,1,1.205),x,2.67007,z);
  onTurret(P,d,'turretDetail',KIT.cylY(.009495,.025735,.03406,24).scale(1,1,1.205),x,2.70857,z);
  onTurret(P,d,'turretDark',cylY(.009495,.10105,16).scale(1,1,1.205),x,2.776125,z);
  onTurret(P,d,'turretDetail',KIT.cylY(.01708,.0282,.292,20).scale(1,1,1.208),.2900,2.2571,-1.1932);
}

function classicVMasts(P: TankBuilderPort): void {
  const d=V,x=.3834,z=-.7577;
  onTurret(P,d,'turretDetail',cylY(.046,.416,16),x,2.403,z);
  onTurret(P,d,'turretDetail',cylY(.034,.048,16),x,2.635,z);
  onTurret(P,d,'turretDetail',cylY(.0296,.1496,16),x,2.7337,z);
  onTurret(P,d,'turretDetail',cylY(.0258,.1398,16),x,2.8709,z);
  onTurret(P,d,'turretDetail',cylY(.030,.025,16),x,2.9533,z);
  onTurret(P,d,'turretDark',cylY(.0176,.0243,12),x,2.978,z);
  onTurret(P,d,'turretDetail',cylZ(.0769,.1175,20),.55,2.5142,-.7673);
  onTurret(P,d,'turretDetail',box(.09,.027,.045),.4467,2.4754,z);
  onTurret(P,d,'turretDetail',cylY(.0196,.242,12),-.2478,2.2886,-.9447);
  onTurret(P,d,'turretDark',cylY(.0073,1.398,10),-.2478,3.1079,-.9447);
}

function modernSkirts(P: TankBuilderPort,roof: number): void {
  for(const side of [-1,1]) {
    addT90MInnerSidePlates(P,side);
    const binRoof=roof-.117;
    P.addEquipment('hullDetail',box(.53,.12,1.57),side*1.39,binRoof+.055,-2.23);
    P.addEquipment('hullDetail',box(.53,.10,1.54),side*1.39,binRoof+.045,-.56);
    P.addEquipment('hullDetail',box(.53,.065,1.43),side*1.39,binRoof+.027,1.02);
  }
  mSideCurtains(P);mRearCage(P);
  P.hullG.userData.sourceSkirtDesign='relikt-m';
}

function mCurtain(P:TankBuilderPort,side:number,rows:readonly(readonly[number,number,number])[]):void {
  const shift=side<0?.00394:0;
  const sections=rows.map(([z,low,high]):SolidSection=>{
    const a=side*1.8369+shift,b=side*1.84887+shift;
    const r:readonly(readonly[number,number])[]=[[a,low],[b,low],[b,high],[a,high]];
    return {z,ring:side>0?r:r.slice().reverse()};
  });
  P.addExternalArmor('hull',eraHitFaces(sectionSolid(sections),side));
}

function mSideCurtains(P:TankBuilderPort):void {
  // The source has an independent 12 mm hanging curtain outside the inner
  // upper armor. Its scalloped hem and upper mounting rails are distinct.
  for(const side of [-1,1]) {
    for(const [i,z]of [-1.14978,-.46946,.19725,.86214,1.53518].entries()) {
      const topRear=i===4?1.32591:1.32474,topFront=i===4?1.26351:1.32474;
      bindEra(P,'skirt',side,()=>{
        mCurtain(P,side,[[z,.52291,topRear],[z+.3289,.42440,(topRear+topFront)/2],[z+.6578,.52291,topFront]]);
        for(const dz of [.08,.578])P.addEquipment('hullDetail',eraFurniture(box(.022,.045,.041)),side*1.859,topRear-.112,z+dz);
      });
      P.addEquipment('hullDetail',box(.1152,.027,.5895),side*1.8075,topRear-.12,z+.329);
    }
    bindEra(P,'skirt',side,()=>mCurtain(P,side,[[2.20882,.52291,1.26351],[3.16029,.75055,1.18364]]));
    mCurtain(P,side,[[-3.03672,.75055,1.14445],[-1.18271,.52291,1.14445]]);
    P.addEquipment('hullDetail',box(.160,.012,1.854),side*1.7898,1.138,-2.1097);
  }
}

function mRearCage(P:TankBuilderPort):void {
  // Native open lattice: source rack bars are 3 mm high, not solid bands.
  for(const side of [-1,1]) {
    const x=side*(side<0?1.87472:1.87455);
    for(let j=0;j<8;j++) {
      const y=.93132+j*.055017;
      P.addEquipment('hullOpenLattice',box(.03057,.00306,.7654),x,y,-2.70352);
      if(side>0&&j>=2&&j<=5) {
        P.addEquipment('hullOpenLattice',box(.03057,.00306,.34069),x,y,-2.13459);
        P.addEquipment('hullOpenLattice',box(.03057,.00306,.5708),x,y,-1.39344);
      } else P.addEquipment('hullOpenLattice',box(.03057,.00306,1.19689),x,y,-1.70649);
    }
    for(const [z,low]of [[-2.9536,.92966],[-2.3902,.93022],[-2.2462,.84312],[-1.8015,.71449]] as const) {
      P.addEquipment('hullOpenLattice',box(.02784,1.317-low,.00571),x,(1.317+low)/2,z);
    }
    for(const [z,inset]of [[-2.8856,.198],[-2.3561,.166],[-2.2775,.166],[-1.1755,.128]] as const) {
      P.addEquipment('hullOpenLatticeDark',box(inset,.031,.03782),side*(1.8828-inset/2),1.236,z);
    }
    const dz=.9327,dy=-.27942;
    P.addEquipment('hullOpenLattice',box(.03057,.00306,Math.hypot(dz,dy)),x,.74151,-1.8907,-Math.atan2(dy,dz));
    for(let j=0;j<6;j++) {
      const y=.6018+j*.055017,back=-1.4244-j*.1837;
      P.addEquipment('hullOpenLattice',box(.03057,.00306,-1.10804-back),x,y,(back-1.10804)/2);
    }
  }
}

function smRearCage(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    const face=side>0?1.8513:1.8454;
    for(let j=0;j<9;j++)P.addEquipment('hullOpenLattice',box(.050,.005,2.24),side*face,.960+j*.0658,-2.203);
    for(const z of [-3.01,-2.414])P.addEquipment('hullOpenLattice',box(.051,.458,.0063),side*1.827,1.256,z);
    for(const z of [-2.218,-1.759,-1.094]) {
      P.addEquipment('hullOpenLattice',box(.05092,.458,.0063),side*1.82733,1.252,z);
      smCageFoot(P,side,z);
    }
    P.addEquipment('hullOpenLattice',box(.050,.006,1.305),side*face,.794,-1.713,.255);
    // Two rear support feet terminate at the fender; no occluding solid
    // standoff panel is added between the open rack and the body.
    for(const z of [-2.414,-1.094])P.addEquipment('hullOpenLatticeDark',box(.17,.024,.030),side*1.77,1.32,z);
  }
}

function smCageFoot(P:TankBuilderPort,side:number,z:number):void {
  // The outboard extremum belongs only to a short inclined bracket foot.
  // Its upper post stays inboard; the cage standoff remains real open air.
  const start=z===-2.218?-2.22598:z===-1.759?-1.76184:-1.09668;
  const fold=z===-2.218?-2.22177:z===-1.759?-1.75657:-1.09141;
  const end=z===-2.218?-2.21545:fold+.00526;
  const bottom:readonly(readonly[number,number])[]=[[1.80284,.91984],[1.890,.970],[1.890,1.01155],[1.80284,1.01155]];
  const upper:readonly(readonly[number,number])[]=[[1.80284,.96769],[1.88608,.999],[1.88608,1.01155],[1.80284,1.08831]];
  for(const [rear,front,r]of [[start,fold,bottom],[fold,end,upper]] as const) {
    const cross=side>0?r:r.map(([x,y])=>[-x,y] as const).reverse();
    P.addEquipment('hullOpenLattice',sectionSolid([{z:rear,ring:cross},{z:front,ring:cross}]));
  }
}

function smRearFixtures(P: TankBuilderPort): void {
  // The source rear exhaust casing is stepped over the drive wheel.
  // Its full bounding-box depth exists only aft of the wheel, not along
  // the entire 1.55 m housing. Preserve that functional clearance.
  const exhaustCross=(low:number):readonly (readonly [number,number])[]=>
    [[-1.6628,low],[-1.0282,low],[-1.0282,1.4941],[-1.6628,1.4941]];
  P.addEquipment('hullDetail',sectionSolid([
    {z:-3.8889,ring:exhaustCross(1.1641)},{z:-3.615,ring:exhaustCross(.9453)},
    {z:-3.180,ring:exhaustCross(.9453)},{z:-3.179,ring:exhaustCross(1.3196)},
    {z:-2.3375,ring:exhaustCross(1.3196)},
  ]));
  P.addEquipment('hullDetail',box(.4103,.015,.5452),-1.346,1.4985,-3.389);
  P.addEquipment('hullDetail',box(.247,.056,.095),-1.514,1.4193,-3.9362);
  P.addEquipment('hullDetail',box(2.003,.2452,.3221),.0024,1.3874,-3.2963);
  for(const x of [-.5578,.1819])P.addEquipment('hullDetail',box(.698,.2103,.1916),x,1.6052,-3.2837);
  for(const x of [-.8059,-.3655,.3736,.8001]) {
    smDrumSupport(P,x);
    P.addEquipment('hullDetail',box(.0245,.0947,.20),x,1.2164,-3.4521);
    P.addEquipment('hullDetail',box(.1116,.0907,.1137),x,1.2473,-3.5268);
  }
  P.addEquipment('hullDetail',box(.4013,.3689,.2337),.0018,.855,-3.2142);
  for(const side of [-1,1]) {
    P.addEquipment('hullDark',torus(.10,.018,16,6),side*.839,1.057,-3.466,0,Math.PI/2);
  }
  addT90SMTowCable(P);
}

function smDrumSupport(P:TankBuilderPort,x:number):void {
  // Empty auxiliary-drum cradles retain two separate physical members:
  // a narrow curved web and a wider thin bearing rail. Their measured
  // section heights describe the bowl, not a solid rectangular envelope.
  const web:readonly(readonly[number,number,number])[]=[
    [-4.097,1.2436,1.2451],[-4.050,1.2083,1.2804],[-4.000,1.1828,1.2532],
    [-3.950,1.1690,1.2394],[-3.900,1.1648,1.2337],[-3.800,1.1707,1.2421],
    [-3.750,1.1737,1.2526],[-3.650,1.2079,1.2991],[-3.565,1.2411,1.3646],
    [-3.530,1.2625,1.3264],[-3.4953,1.2837,1.2838],
  ];
  const rail:readonly(readonly[number,number,number])[]=[
    [-4.0888,1.2920,1.3020],[-4.050,1.2713,1.2824],[-4.000,1.2464,1.2565],
    [-3.950,1.2338,1.2442],[-3.900,1.2285,1.2383],[-3.800,1.2355,1.2456],
    [-3.750,1.2463,1.2576],[-3.650,1.2966,1.3096],[-3.600,1.3318,1.3473],
    [-3.5648,1.3613,1.3615],
  ];
  const rightOuter=x>.79,dy=rightOuter?.00299:0,dz=rightOuter?.00842:0;
  for(const [width,rows]of [[.00979,web],[.05092,rail]] as const) {
    const sections=rows.map(([z,low,high]):SolidSection=>({z:z+dz,ring:[
      [x-width/2,low+dy],[x+width/2,low+dy],[x+width/2,high+dy],[x-width/2,high+dy],
    ]}));
    P.addEquipment('hullDetail',sectionSolid(sections));
  }
}

function smFendersAndSkirts(P: TankBuilderPort): void {
  addT90SMFenderShoulders(P);
  for(const side of [-1,1]) {
    for(let i=0;i<6;i++) {
      const z0=-1.082+i*.716,z1=z0+.705,top=i===5?1.337:1.467;
      const inner=side>0?1.7813:1.77053,outer=inner+.01273;
      const cross=(low:number):readonly (readonly [number,number])[]=>{
        const a=Math.min(side*inner,side*outer),b=Math.max(side*inner,side*outer);
        return [[a,low],[b,low],[b,top],[a,top]];
      };
      P.addExternalArmor('hull',sectionSolid([{z:z0,ring:cross(.52)},{z:(z0+z1)/2,ring:cross(.4411)},{z:z1,ring:cross(.52)}]));
      for(const dz of [.08,.61])P.addEquipment('hullDetail',box(.095,.059,.063),side*1.739,top-.108,z0+dz);
    }
  }
  smFrontGuards(P);smRearCage(P);smRearFixtures(P);
}

function smFrontGuards(P:TankBuilderPort):void {
  // Curved sheet roof and separate inner return: the narrowing rounded nose
  // cannot be represented by a full-width low rectangular flap.
  const rows:readonly(readonly[number,number,number,number,number,number,number])[]=[
    [3.220,.980,1.796,1.620,1.348,1.257,.750],
    [3.500,.9714,1.8064,1.668,1.325,1.238,.9037],
    [3.700,1.0082,1.8012,1.683,1.273,1.155,.7928],
    [3.750,1.0309,1.7919,1.658,1.230,1.104,.8143],
    [3.830,1.0677,1.7210,1.536,1.136,1.044,.8487],
    [3.900,1.1015,1.4604,1.385,1.026,.964,.8788],
    [3.950,1.1639,1.2407,1.201,.9454,.928,.9134],
    [3.962,1.186,1.197,1.191,.925,.922,.920],
  ];
  for(const side of [-1,1]) {
    const section=(z:number,points:readonly(readonly[number,number])[]):SolidSection=>({z,
      ring:side>0?points:points.map(([x,y])=>[-x+.01371,y] as const).reverse()});
    const roof=rows.map(([z,inner,outer,shoulder,top,edge])=>section(z,
      [[inner,top-.014],[shoulder,top-.014],[outer,edge-.014],[outer,edge],[shoulder,top],[inner,top]]));
    const returns=rows.map(([z,inner,, ,top,,low])=>section(z,
      [[inner,low],[inner+.012,low],[inner+.012,top-.002],[inner,top-.002]]));
    P.addMudguard('t90sm-x-rounded-bow','hull',sectionSolid(roof));
    P.addMudguard('t90sm-x-inner-return','hull',sectionSolid(returns));
  }
}

type SideBin = { low:number; high:number; z0:number; z1:number; innerRear:number; outerRear:number; innerFront:number; outerFront:number };
function taperedSideBins(P: TankBuilderPort,d: Datum,p: SideBin): void {
  for(const side of [-1,1]) {
    const section=(z:number,inner:number,outer:number): SolidSection=>{
      const left=Math.min(side*inner,side*outer)-d.yaw[0],right=Math.max(side*inner,side*outer)-d.yaw[0];
      return {z:z-d.yaw[2],ring:[[left,p.low-d.yaw[1]],[right,p.low-d.yaw[1]],[right,p.high-d.yaw[1]],[left,p.high-d.yaw[1]]]};
    };
    P.addEquipment('turretDetail',sectionSolid([section(p.z0,p.innerRear,p.outerRear),section(p.z1,p.innerFront,p.outerFront)]));
    for(let j=0;j<3;j++)onTurret(P,d,'turretDark',box(.021,.05,.024),side*(p.outerRear+(p.outerFront-p.outerRear)*(j+.5)/3),p.high-.08,p.z0+(p.z1-p.z0)*(j+.5)/3);
  }
}

function modernBins(P: TankBuilderPort,d: Datum,sm: boolean): void {
  if(sm) {
    smSideBins(P);
    onTurret(P,d,'turretPermanentMarkingSurface',box(1.324,.497,.883),.013,1.970,-1.917);
    onTurret(P,d,'turretDetail',box(1.569,.355,.402),.02,2.007,-2.486);
    onTurret(P,d,'turretDetail',box(.46,.44,.94),.91,1.963,-1.81);
    addT90SMRearBasket(P);
    return;
  }
  taperedSideBins(P,d,{low:1.431,high:1.600,z0:-1.592,z1:-.293,innerRear:.739,outerRear:1.02,innerFront:1.11,outerFront:1.412});
  mMidFoldedSupports(P);
  mForwardFoldedSupports(P);
  for(const side of [-1,1]) {
    const shift=.0181;
    onTurret(P,d,'turretDetail',box(.248,.3866,.940),shift+side*.9675,1.7539,-1.0947,0,side*.345);
    onTurret(P,d,'turretDetail',box(.261,.0162,.950),shift+side*.9675,1.9553,-1.095,0,side*.345);
    onTurret(P,d,'turretDetail',box(.252,.3866,.355),shift+side*1.2192,1.7539,-.4554,0,side*.1);
  }
  onTurret(P,d,'turretPermanentMarkingSurface',box(.34,.41,.87),-.77,1.756,-2.023);
  mTurretBasket(P);
}

function mTurretBasket(P:TankBuilderPort):void {
  // The bustle rail is asymmetric: short rounded left corner and a longer
  // swept right return. A centered rectangular fence misstates both sides.
  const path:readonly(readonly[number,number,number])[]=[
    [-.773,-2.463,1.9068],[-.764,-2.64,1.9068],[-.657,-2.802,1.9128],
    [.810,-2.800,1.9128],[.860,-2.700,1.9128],[.901,-2.320,1.9277],[.973,-1.604,1.9277],
  ];
  for(let row=0;row<7;row++)for(let i=0;i<path.length-1;i++) {
    const [x0,z0,top0]=path[i],[x1,z1,top1]=path[i+1],length=Math.hypot(x1-x0,z1-z0);
    const y=(top0+top1)/2-(6-row)*.0555;
    onTurret(P,M,'turretDetail',box(.0306,.0031,length),
      (x0+x1)/2,y,(z0+z1)/2,0,Math.atan2(x1-x0,z1-z0));
  }
  for(const [x,z,top]of path)onTurret(P,M,'turretDetail',box(.0058,.333,.0306),x,top-.1665,z);
  for(const x of [-.60,.60])onTurret(P,M,'turretDetail',box(.046,.029,.253),x,1.581,-2.674);
}

function mForwardFoldedSupports(P:TankBuilderPort):void {
  // Broad canted armor carrier with an outer return fold. The front corner
  // drops to Y1.624; neither a full-height box nor a flat sheet fits it.
  mFoldedSupports(P,[
    [.175,1.608,1.630,1.610,1.879,1.494,1.909,1.906],
    [.250,1.556,1.646,1.618,1.829,1.508,1.907,1.883],
    [.487,1.389,1.687,1.645,1.407,1.556,1.910,1.817],
    [.600,1.497,1.707,1.658,1.471,1.578,1.844,1.786],
    [.700,1.605,1.720,1.669,1.531,1.591,1.781,1.756],
    [.830,1.739,1.746,1.744,1.619,1.621,1.625,1.624],
  ]);
}

type FoldedSupportStation=readonly[number,number,number,number,number,number,number,number];
function mFoldedSupports(P:TankBuilderPort,rows:readonly FoldedSupportStation[]):void {
  for(const side of [-1,1]) {
    const sections=rows.map(([z,inner,outer,roofX,lowInner,lowOuter,highInner,highOuter]):SolidSection=>{
      const x=(v:number):number=>side<0?-v:v+2*M.yaw[0];
      const r:readonly(readonly[number,number])[]=[[x(inner),lowInner],[x(outer),lowOuter],
        [x(roofX),highOuter],[x(inner),highInner]];
      return {z,ring:side>0?r:r.slice().reverse()};
    });
    onTurret(P,M,'turretDetail',sectionSolid(sections),0,0,0);
  }
}

function mMidFoldedSupports(P:TankBuilderPort):void {
  mFoldedSupports(P,[
    [-.365,1.330,1.333,1.333,1.570,1.572,1.733,1.734],
    [-.350,1.315,1.361,1.361,1.548,1.572,1.736,1.738],
    [0,1.221,1.507,1.503,1.413,1.534,1.787,1.832],
    [.250,1.328,1.610,1.552,1.395,1.507,1.856,1.905],
    [.487,1.38655,1.38692,1.38680,1.40594,1.40609,1.40917,1.40917],
  ]);
  for(const side of [-1,1]) {
    const x=side<0?-1.5608:1.5608+2*M.yaw[0];
    onTurret(P,M,'turretDetail',box(.0348,.3913,.399),x,1.7003,.086,0,side*.391);
  }
}

function smSideBins(P:TankBuilderPort):void {
  // Thin sloping upper shelves and the actual narrow stowage cases are
  // distinct equipment. A full-depth, full-length wedge fills absent air.
  addT90SMLeftLauncherShelf(P);
  for(const side of [1]) {
    const rear=side<0?-1.50:-1.21,front=side<0?.20:-.38;
    const rearInner=side<0?.737:.838,rearOuter=rearInner+.315;
    const frontInner=side<0?1.211:1.057,frontOuter=side<0?1.518:1.352;
    const profile=(z:number,inner:number,outer:number):SolidSection=>{
      const r:readonly(readonly[number,number])[]=[[inner,2.153],[outer,2.153],[outer,2.164],[inner,2.164]];
      return {z,ring:side>0?r:r.map(([x,y])=>[-x,y] as const).reverse()};
    };
    onTurret(P,S,'turretDetail',sectionSolid([
      profile(rear,rearInner,rearOuter),profile(front,frontInner,frontOuter),
    ]),0,0,0);
  }
  const cases:readonly(readonly[number,number,number,number,number])[]=[
    [-1.206,1.997,-1.059,.120,1.056],
    [1.263,1.988,-.865,.110,.800],
  ];
  for(const [x,y,z,w,len]of cases) {
    const a=Math.sign(x)*.27;
    onTurret(P,S,'turretDetail',box(w,.350,len),x,y,z,0,a);
    onTurret(P,S,'turretDetail',box(w+.014,.013,len+.012),x,y+.180,z,0,a);
  }
  smLeftForwardCase(P);
  smFoldedSideBodies(P);
}

function smLeftForwardCase(P:TankBuilderPort):void {
  // Source13977's cover slopes across the narrow case and has a separate
  // small inner bevel. Its bounding-box maximum is not a flat lid height.
  const c=Math.cos(.274),s=Math.sin(.274),lo=-1.49690,hi=-1.40233;
  const top=(u:number,v:number,bevel=false):number=>{
    const x=c*u-s*v,z=s*u+c*v;
    return bevel?(.1171492375-.7824918742*x-.2203618461*z)/.5823633948:
      (2.5792408888+.5692412495*x+.1600834040*z)/.8064351826;
  };
  const section=(z:number):SolidSection=>{
    const d0=top(lo,z)-top(lo,z,true),d1=top(hi,z)-top(hi,z,true);
    const peak=lo+(hi-lo)*(-d0)/(d1-d0);
    return {z,ring:[[lo,1.81344],[hi,1.81344],[hi,top(hi,z,true)],
      [peak,top(peak,z)],[lo,top(lo,z)]]};
  };
  onTurret(P,S,'turretDetail',sectionSolid([section(-.17491),section(.62451)]).rotateY(-.274),0,0,0);
}

type SmSideBodyStation=readonly[number,number,number,number,number];
function smFoldedSideBodies(P:TankBuilderPort):void {
  const left:readonly SmSideBodyStation[]=[
    [.2087,1.2112,1.6131,1.807,2.1637],[.3653,1.2537,1.6476,1.6876,2.1616],
    [.5219,1.2960,1.6821,1.6977,2.1589],[.6784,1.3314,1.7166,1.7079,2.1497],
    [.8350,1.6329,1.7511,1.7787,2.0414],[.9916,1.7823,1.7855,1.9002,1.9434],
  ];
  const right:readonly SmSideBodyStation[]=[
    [-.3801,1.407,1.4447,1.8009,2.1646],[-.2394,1.432,1.4851,1.7871,2.1249],
    [-.0987,1.4503,1.5255,1.7734,2.0042],[.0420,1.4687,1.5659,1.7597,2.0047],
    [.1827,1.3196,1.6064,1.7461,2.0955],[.3234,1.3612,1.6469,1.7332,2.1101],
    [.4641,1.4027,1.6875,1.7202,2.1247],[.6048,1.4438,1.7280,1.7073,2.1393],
    [.7455,1.5433,1.7686,1.6943,2.0901],[.8862,1.6708,1.8091,1.7987,2.0026],
    [1.0268,1.8075,1.8112,1.9108,1.9151],
  ];
  smSideBody(P,-1,left);smSideBody(P,1,right);
}

function smSideBody(P:TankBuilderPort,side:number,rows:readonly SmSideBodyStation[]):void {
  // Closed folded carrier with real roof crossfall and an underside which
  // rises sharply outboard. Section bounds alone must not become a box.
  const sections=rows.map(([z,inner,outer,low,high]):SolidSection=>{
    const width=outer-inner,spread=Math.min(1,width/(side<0?.386:.285));
    const knee=inner+width*(side<0?.61:.37),outerHigh=high-spread*(side<0?.135:.120);
    const outerLow=Math.min(outerHigh-.003,low+.20*spread),kneeLow=Math.min(outerLow,low+.035*spread);
    const kneeHigh=high-spread*(side<0?.017:.027);
    const r:readonly(readonly[number,number])[]=[[inner,low],[knee,kneeLow],[outer,outerLow],
      [outer,outerHigh],[knee,kneeHigh],[inner,high]];
    return side<0?smLeftCarrierSection(z,r):{z,ring:r};
  });
  onTurret(P,S,'turretDetail',sectionSolid(sections),0,0,0);
}

function smLeftCarrierSection(z:number,original:SolidSection['ring']):SolidSection {
  const [inner,knee,outer]=[original[5],original[4],original[3]];
  const xs=Array.from({length:25},(_,i)=>inner[0]+(outer[0]-inner[0])*i/24);
  xs.push(knee[0],...t90SMLeftCarrierBreakpoints(z,-outer[0],-inner[0]).map(x=>-x));
  xs.sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)xs[i]=Math.max(xs[i],xs[i-1]+.000002);
  const sourceRoof=(x:number):number=>{
    const [a,b]=x<=knee[0]?[inner,knee]:[knee,outer];
    const prior=a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
    return t90SMLeftCarrierRoof(-x,z,prior);
  };
  // Preserve the three original underside vertices. Extra roof subdivisions
  // resolve the independent sheet-plane/crown breaks; later sections remain
  // coplanar subdivisions of their original source-measured faces.
  const bottom=original.slice(0,3).map(([x,y])=>[x,Math.min(y,sourceRoof(x)-.003)] as const);
  const upper=xs.slice().reverse().map(x=>[x,sourceRoof(x)] as const);
  return {z,ring:[...bottom,...upper].map(([x,y])=>[-x,y] as const).reverse()};
}

function modernCupolas(P: TankBuilderPort,d: Datum,sm: boolean): void {
  if(sm){smCupolas(P);return;}
  const commanderX=sm?.70:-.61,roof=d.roof;
  const commanderZ=sm?-.06046:-.17;
  const commanderY=sm?2.341:2.121,commanderTop=sm?2.420:2.273;
  P.addCupola('turret',cylY(sm?.36992:.38,sm?.14:.21,32).scale(1,1,sm?1.0386:1),commanderX-d.yaw[0],commanderY-d.yaw[1],commanderZ-d.yaw[2]);
  onTurret(P,d,'turretDetail',cylY(sm?.318:.35,.044,32),commanderX,commanderTop,commanderZ);
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    onTurret(P,d,'turretDark',box(.11,.07,.08),commanderX+Math.sin(a)*.31,commanderTop-.045,commanderZ+Math.cos(a)*.31,0,a);
  }
  const loaderX=sm?-.49502:.535,loaderZ=sm?-.34206:-.35;
  P.addCupola('turret',cylY(sm?.36233:.35,.07,32).scale(1,1,sm?.7291:1),loaderX-d.yaw[0],roof+.012-d.yaw[1],loaderZ-d.yaw[2]);
  onTurret(P,d,'turretDetail',cylY(sm?.332:.32,.035,28).scale(1,1,sm?.7291:1),loaderX,roof+.036,loaderZ);
  onTurret(P,d,'turretDetail',box(.17,.020,.038),loaderX,roof+.060,loaderZ+.12);
}

function smCupolas(P:TankBuilderPort):void {
  P.addCupola('turret',cylY(.36992,.0982,32).scale(1,1,1.0386),.70042-S.yaw[0],2.32193-S.yaw[1],-.060455-S.yaw[2]);
  const lid=new THREE.LatheGeometry([new THREE.Vector2(0,2.36804),new THREE.Vector2(.32867,2.36804),
    new THREE.Vector2(.318,2.400),new THREE.Vector2(.283,2.43832),new THREE.Vector2(0,2.43832)],32).scale(1,1,1.0494);
  onTurret(P,S,'turretDetail',lid,.70153,0,-.08766);
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    onTurret(P,S,'turretDark',box(.103,.040,.072),.70042+Math.sin(a)*.31,2.351,-.060455+Math.cos(a)*.32,0,a);
  }
  P.addCupola('turret',cylY(.36233,.03838,32).scale(1,1,.7291),-.49502-S.yaw[0],2.30548-S.yaw[1],-.34206-S.yaw[2]);
  onTurret(P,S,'turretDetail',box(.167,.018,.038),-.49502,2.330,-.22206);
}

function modernSight(P: TankBuilderPort,d: Datum,sm: boolean): void {
  if(!sm){mSight(P);return;}
  const x=-.693,z=.311,y=2.375;
  onTurret(P,d,'turretDetail',cylY(.178,.045,24),x,y-.146,z);
  onTurret(P,d,'turretDetail',box(.387,.30,.280),x,y,.2645);
  const section=(z:number,half:number,top:number):SolidSection=>({z,ring:[
    [x-half,2.244],[x+half,2.244],[x+half,top],[x-half,top],
  ]});
  onTurret(P,d,'turretDetail',sectionSolid([section(.4045,.1935,2.5365),section(.490,.110,2.5365)]),0,0,0);
  onTurret(P,d,'turretDark',box(.285,.17,.025),x,y+.015,z+.194);
  onTurret(P,d,'turretGlass',box(.22,.13,.012),x,y+.015,z+.210);
  onTurret(P,d,'turretDetail',box(.387,.0115,.280),x,2.53075,.2645);
  for(const fx of [-.83263,-.55403]) {
    onTurret(P,d,'turretDetail',box(.01322,.21982,.013),fx,2.35383,.50011);
    onTurret(P,d,'turretDetail',box(.01322,.012,.134),fx,2.45774,.56061);
  }
}

function mSight(P:TankBuilderPort):void {
  const rows:readonly(readonly[number,number,number])[]=[
    [.048,.151,2.240],[.120,.181,2.276],[.230,.197,2.3124],[.350,.165,2.3124],[.420,.010,2.3124],
  ];
  onTurret(P,M,'turretDetail',sectionSolid(rows.map(([z,half,high])=>({z,ring:[
    [.52195-half,1.97976],[.52195+half,1.97976],[.52195+half,high],[.52195-half,high],
  ]}))),0,0,0);
  onTurret(P,M,'turretDark',box(.167,.130,.012),.52195,2.162,.391);
  onTurret(P,M,'turretGlass',box(.130,.103,.009),.52195,2.162,.400);
  onTurret(P,M,'turretDetail',box(.4261,.01181,.9900),.42208,2.00295,-2.02317);
}

function modernMRws(P: TankBuilderPort): void {
  const d=M,x=-.426,z=-1.031;
  const weapon=sourceMachineGun(P,d.yaw);
  weapon.add('turretDetail',cylY(.309,.291,28).scale(1,1,1.342),x,2.059,z);
  addT90MRwsHousing(P);
  weapon.add('turretDark',box(.112,.106,.48),-.154,2.759,-1.17);
  weapon.add('turretDark',cylZ(.023,.798,16),-.154,2.763,-.531);
  weapon.add('turretDark',cylZ(.012,.72,12),-.154,2.728,-.57);
  weapon.add('turretDetail',box(.246,.477,.035),-.145,2.59,-1.135);
  weapon.add('turretDetail',box(.246,.030,.29),-.145,2.814,-1.007,.15);
  weapon.add('turretDetail',box(.118,.122,.714),-.145,2.752,-1.111);
  weapon.finish();
}

function modernSmRws(P: TankBuilderPort): void {
  const d=S;
  const weapon=sourceMachineGun(P,d.yaw);
  weapon.add('turretDetail',cylY(.299905,.17346,16).scale(1,1,.83672),.553045,2.31421,-.904605);
  addT90SMRwsBase(P);
  smRwsHousing(P);
  // Distinct rear-leaning folded hood, retaining the open weapon channel.
  smFoldedHood(P,.321,.519,.398,-1.621);
  smFoldedHood(P,.630,.790,.651,-1.595);
  weapon.add('turretDetail',box(.44,.30,.035),.555,2.633,-1.607);
  weapon.add('turretDetail',box(.12,.30,.16),.711,2.827,-1.31);
  weapon.add('turretDark',box(.105,.166,.286),.581,2.987,-1.405);
  weapon.add('turretDark',box(.125,.075,.800),.582,3.0505,-1.322);
  weapon.add('turretDark',cylZ(.022,.603,16),.584,3.035,-.8345);
  weapon.finish();
}

function smRwsHousing(P:TankBuilderPort):void {
  const x=.5528,low=2.53203,high=2.77527;
  onTurret(P,S,'turretDetail',cylY(.21776,.1042,16).scale(1,1,1.073),x,2.47997,-.97564);
  // The four sloping side planes meet at the housing's middle, not at
  // two long constant-width side walls. Preserve the clipped rear/front
  // ends and the separate forward optical recess.
  const rows:readonly(readonly[number,number])[]=[[-1.14614,.11518],[-1.0716,.17178],[-.97564,.19585],[-.8796,.17178],[-.85356,.15098]];
  onTurret(P,S,'turretDetail',sectionSolid(rows.map(([z,half])=>({z,ring:[
    [x-half,low],[x+half,low],[x+half,high],[x-half,high],
  ]}))),0,0,0);
  for(const side of [-1,1]) {
    const cross=(outer:number):readonly(readonly[number,number])[]=>{
      const a=Math.min(x+side*.1087,x+side*outer),b=Math.max(x+side*.1087,x+side*outer);
      return [[a,low],[b,low],[b,high],[a,high]];
    };
    onTurret(P,S,'turretDetail',sectionSolid([{z:-.85356,ring:cross(.15098)},{z:-.80725,ring:cross(.11518)}]),0,0,0);
  }
  for(const y of [2.535,2.7718])onTurret(P,S,'turretDetail',box(.2174,.007,.0463),x,y,-.8304);
  onTurret(P,S,'turretDark',box(.212,.222,.006),x,2.653,-.8505);
}

function smFoldedHood(P: TankBuilderPort,left:number,right:number,crown:number,rear:number): void {
  // Four folds measured on the independent hood cross-sections. The crown
  // rises from the raked rear, then descends at the front; a constant-Z
  // trapezoid incorrectly turns this supported sheet into a tall block.
  const rows:readonly (readonly [number,number,number])[]=[
    [rear,2.766,2.838],[-1.515,2.691,3.11521],[-1.380,2.4867,3.11521],
    [-1.320,2.4867,3.11521],[-1.194,2.4867,2.873],
  ];
  const leftHood=left<.6;
  onTurret(P,S,'turretDetail',sectionSolid(rows.map(([z,low,high]):SolidSection=>{
    // The outer left facet has measured lateral crossfall, independent of
    // the descending lower edge. Joining the crown directly to that lower
    // edge omitted 15–29 cm of the actual supported upper housing.
    const outerTop=leftHood?Math.min(high,2.1173+2.351*left):high;
    const plateau=leftHood?Math.max(left+.001,Math.min(right-.001,(high-2.1173)/2.351)):crown;
    const rightTop=leftHood?high:Math.min(high,3.22816-.17456*right);
    return {z,ring:[[left,low],[right,low],[right,rightTop],[plateau,high],[left,outerTop]]};
  })),0,0,0);
}

function modernSmRearAntenna(P: TankBuilderPort): void {
  // Separate bustle-mounted radio antenna, not the roof meteorological mast.
  // The source's four stepped cylinders rise from the permanent rear box.
  const x=.79786,z=-2.33438;
  onTurret(P,S,'turretDetail',box(.075,.089,.122),.7846,2.0515,-2.2807);
  onTurret(P,S,'turretDetail',cylY(.0644,.2522,16).scale(1,1,1.079),x,2.2170,z);
  onTurret(P,S,'turretDetail',cylY(.0198,.1515,12).scale(1,1,.903),x,2.4172,z);
  onTurret(P,S,'turretDetail',cylY(.0130,.1441,12).scale(1,1,.893),x,2.5640,z);
  onTurret(P,S,'turretDark',cylY(.0174,.4157,12).scale(1,1,.908),x,2.84357,z);
}

function modernRoof(P: TankBuilderPort,d: Datum,sm: boolean): void {
  modernCupolas(P,d,sm);modernSight(P,d,sm);
  if(sm){modernSmRws(P);modernSmRearAntenna(P);}else modernMRws(P);
  modernMasts(P,d,sm);
  if(!sm){mWarningReceivers(P);return;}
  for(const side of [-1,1]) {
    onTurret(P,d,'turretDetail',box(.22,.13,.23),side*.88,d.roof+.02,-.86);
    onTurret(P,d,'turretGlass',box(.13,.071,.010),side*.88,d.roof+.025,-.737);
  }
}

function mWarningReceivers(P:TankBuilderPort):void {
  const rows:readonly(readonly[number,number,number,number,number])[]=[
    [-1.004,.754,.910,1.991,2.055],[-.850,.7433,1.0768,2.020,2.174],[-.713,.808,.960,2.032,2.153],
  ];
  onTurret(P,M,'turretDetail',sectionSolid(rows.map(([z,left,right,low,high])=>({z,ring:[
    [left,low],[right,low],[right,high],[left,high-.020],
  ]}))),0,0,0);
  onTurret(P,M,'turretDetail',box(.2397,.1407,.2751),-1.1975,2.00056,-.44568);
  onTurret(P,M,'turretGlass',box(.126,.072,.010),.890,2.084,-.707);
  onTurret(P,M,'turretGlass',box(.126,.058,.010),-1.1975,2.016,-.303);
}

function modernMasts(P: TankBuilderPort,d: Datum,sm: boolean): void {
  const x=sm?-.284:.205,z=sm?-.928:-.879;
  if(sm) {
    onTurret(P,d,'turretDetail',cylY(.029,.474,12),x,2.498,z);
    onTurret(P,d,'turretDetail',box(.242,.065,.277),x,2.717,z);
    onTurret(P,d,'turretDetail',cylY(.042,.313,12),x,2.936,z);
    onTurret(P,d,'turretDark',cylY(.014,.058,10),x,3.121,z);
    onTurret(P,d,'turretDetail',cylY(.081,.165,14),-.374,2.504,-.992);
    onTurret(P,d,'turretDetail',box(.064,.291,.069),-.952,2.400,-.201);
    onTurret(P,d,'turretDetail',cylY(.056065,.01944,24).scale(1,1,1.0958),-.95161,2.55520,-.20063);
    const warningCap=new THREE.LatheGeometry([
      new THREE.Vector2(0,2.56343),new THREE.Vector2(.054105,2.56343),
      new THREE.Vector2(.0393,2.60081),new THREE.Vector2(0,2.60081),
    ],24).scale(1,1,1.0772);
    onTurret(P,d,'turretDetail',warningCap,-.95161,0,-.20063);
    return;
  }
  onTurret(P,d,'turretDetail',cylY(.046,.482,12),x,2.260,z);
  onTurret(P,d,'turretDetail',cylY(.046,.092,12),x,2.541,z);
  onTurret(P,d,'turretDetail',cylY(.05396,.042,20).scale(1,1,1.364),.20521,2.608,z);
  onTurret(P,d,'turretDetail',cylY(.03771,.106,20).scale(1,1,1.502),.20521,2.682,z);
  const windHead=new THREE.LatheGeometry([
    new THREE.Vector2(.026,2.735),new THREE.Vector2(.04617,2.800),
    new THREE.Vector2(.03636,2.850),new THREE.Vector2(.02291,2.900),new THREE.Vector2(.02291,2.9352),
  ],24).scale(1,1,1.045);
  onTurret(P,d,'turretDetail',windHead,.20521,0,-.87908);
  onTurret(P,d,'turretDark',cylY(.01913,.0387,14).scale(1,1,1.376),.20530,2.9545,-.87972);
  onTurret(P,d,'turretDetail',cylY(.063,.126,14),.348,2.380,z);
  onTurret(P,d,'turretDetail',cylX(.018,.143,12),.2765,2.380,z);
}

type RoofStrip = readonly [number,number,number,number,number,number,number,number];
function roofArmorStrips(P: TankBuilderPort,d: Datum,rows: readonly RoofStrip[]): void {
  for(const [x,y,z,w,len,rx,rz,count] of rows) {
    for(let i=0;i<count;i++) {
      const step=len/count,localZ=(i+.5)*step-len*.5;
      const worldY=y-Math.sin(rx)*localZ,worldZ=z+Math.cos(rx)*localZ;
      P.addExternalArmor('turret',box(w,.075,step-.014),x-d.yaw[0],worldY-d.yaw[1],worldZ-d.yaw[2],rx,0,rz);
      onTurret(P,d,'turretDetail',box(w*.72,.018,.027),x,worldY+.041,worldZ-step*.29,rx,0,rz);
    }
  }
}

function sourceRoofArmor(P: TankBuilderPort,d: Datum): void {
  if(d===A) {
    roofArmorStrips(P,d,[[-.15,2.185,-.06,.23,.66,.055,0,3],[.09,2.185,-.06,.23,.66,.055,0,3],
      [-.43,2.171,-1.08,.28,.56,0,0,3],[-.13,2.171,-1.08,.28,.56,0,0,3],[.17,2.171,-1.08,.28,.56,0,0,3],
      [.70,2.071,.53,.23,.68,.15,.10,3],[.96,2.046,.45,.22,.50,.16,.13,2]]);
    return;
  }
  if(d===V) {
    roofArmorStrips(P,d,[[-.14,2.229,-.05,.25,.53,.075,0,3],[.13,2.218,.22,.25,.44,.12,0,2],
      [-.62,2.122,.78,.23,.47,.19,-.12,2],[.66,2.104,.82,.23,.58,.20,.13,3],
      [-.40,2.220,-.92,.27,.31,-.09,0,2],[.01,2.199,-.92,.28,.34,-.07,0,2]]);
    return;
  }
  if(d===M) {
    roofArmorStrips(P,d,[[-.19,2.001,.68,.32,.51,.21,0,3],[.15,2.001,.68,.29,.51,.21,0,3],
      [-.64,1.950,.91,.27,.43,.18,-.10,2],[-.91,1.966,.55,.27,.70,.15,-.15,3],
      [-1.18,1.924,.36,.24,.45,.17,-.18,2],[.80,1.914,.86,.23,.54,.18,.10,3],
      [1.06,1.923,.46,.23,.53,.16,.18,3],[.01,2.028,.20,.32,.35,.08,0,2]]);
    return;
  }
  roofArmorStrips(P,d,[[-.23,2.242,.62,.26,.70,.10,0,3],[.07,2.242,.62,.29,.70,.10,0,3],
    [-.72,2.216,.88,.25,.52,.11,-.10,3],[.85,2.194,1.01,.24,.58,.17,.11,3],
    [-1.05,2.183,.73,.25,.50,.18,-.14,2],[1.10,2.152,.78,.25,.55,.18,.17,3]]);
}

export function buildT90AX(P: TankBuilderPort): void {
  frame(P,A);
  P.add('hull',hullSolid([
    [-3.43,1.138,1.265,1.250],[-3.10,1.138,1.412,.74],[-2.65,1.138,1.417,.402],
    [-1.36,1.138,1.425,.422],[-1.23,1.138,1.479,.422],[1.94,1.138,1.482,.415],
    [2.45,1.138,1.292,.415],[2.98,1.137,1.044,.600],[3.43,1.136,.839,.830],
  ]));
  P.gear=KIT.buildRunningGear(P,{style:'dished',wheelPattern:'pressed-six',wheelR:.351,wheelW:.438,wheelFaceDepthScale:.695,
    wheelZs:[-1.848,-1.002,-.147,.728,1.590,2.464],wheelY:.401,wheelZScale:1.084,
    xc:1.473,xcLeft:1.45825,xcRight:1.48365,trackW:.56712,trackTh:.024,
    sprocket:{z:-2.765,y:.748,r:.336,trackR:.280},idler:{z:3.200,y:.801,r:.289,trackR:.260},sprocketDepthScale:.715,idlerDepthScale:.855,
    rollers:[-1.6497,.3703,2.0961].map(z=>({z,y:1.00456,r:.110695})),rollerR:.110695,
    returnRollerWidthM:.1878,returnRollerInsetM:.14,
    topY:1.108,botY:.0535,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.15,
    trackShoeDimensions:{padHeight:.033,grouserHeight:.013,webHeight:.017,hornHeight:.100,pinRadius:.013,pinCentreY:0}});
  sourceWheelFaces(P,.351,.225,1.084);
  aFenders(P);
  classicSkirts(P,'kontakt5-source-a',1.312,-3.28,3.24);
  engineDeck(P,1.465,-3.36,1.91);aDrums(P);
  bowGear(P,1.092,3.207,false);aGlacis(P);
  P.add('turret',turretSolid(A,[
    [-1.456,.105,2.088,1.522],[-1.10,.82,2.149,1.521],[-.58,1.028,2.205,1.519],
    [.05,1.286,2.154,1.515],[.515,1.476,2.096,1.513],[.84,1.23,2.056,1.512],
    [.98,1.112,2.024,1.511],
  ]));
  forkedFore(P,A,[[.98,1.112,2.024,1.511],[1.13,.985,1.99,1.511],[1.36,.783,1.903,1.510]],.27);
  // The aperture's inclined central seat terminates behind the mantlet.
  P.add('turret',turretSolid(A,[[.98,.27,2.024,1.511],[1.25,.27,1.568,1.510]]));
  ring(P,A,1.137);classicCheeks(P,A,false);classicSensors(P,A,1);classicRoof(P,A,1);smoke(P,A,false);sourceRoofArmor(P,A);
  mantlet(P,A,.59,1.69,1.02);addT90AGun(P);
}

export function buildT90AVladimirX(P: TankBuilderPort): void {
  frame(P,V);
  P.add('hull',hullSolid([
    [-3.43,.997,1.285,1.273],[-3.15,1.123,1.514,.84],[-2.74,1.123,1.514,.48],
    [-1.10,1.123,1.514,.509],[.48,1.123,1.466,.509],[1.12,1.123,1.455,.438],
    [1.90,1.123,1.447,.414],[2.13,1.123,1.371,.414],[2.15,1.123,1.340,.414],
    [2.27,1.123,1.321,.414],[2.56,1.123,1.226,.414],[3.08,1.123,1.053,.643],
    [3.32,.73,1.035,.934],[3.43,.12,1.034,.997],
  ]));
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.368365,wheelW:.424,
    wheelZs:[-1.828225,-.94808,-.067935,.812205,1.69235,2.572495],wheelY:.439685,wheelZScale:1.03568,
    xc:1.449,trackW:.603,trackTh:.026,
    sprocket:{z:-2.70245,y:.80394,r:.36432,trackR:.290},idler:{z:3.31047,y:.87096,r:.23765,trackR:.223},
    rollers:[-1.55863,.39502,2.39302].map(z=>({z,y:.98969,r:.11452})),rollerR:.11452,
    returnRollerWidthM:.1172,returnRollerInsetM:.0983,
    topY:1.115,botY:.0605,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.155,
    trackShoeDimensions:{padHeight:.041,grouserHeight:.015,webHeight:.022,hornHeight:.125,pinRadius:.018,pinCentreY:-.003}});
  fenders(P,'t90a-vladimir-x',1.825,1.344);addT90VRearGuards(P);
  classicSkirts(P,'kontakt5-vladimir',1.344,-3.20,3.14);
  engineDeck(P,1.547,-3.39,2.00);fuelDrums(P,-4.1899,1.517,.366,.83,.59);
  bowGear(P,1.174,3.27,false,1.460);vGlacis(P);
  P.add('turret',turretSolid(V,[
    [-1.218,.12,2.055,1.884],[-1.04,.73,2.174,1.528],[-.55,.914,2.249,1.528],
    [-.37,1.04,2.2595,1.528],[.12,1.254,2.227,1.528],[.53,1.450,2.176,1.528],
    [.80,1.30,2.14,1.528],[1.15,1.03,2.052,1.528],[1.437,.775,1.964,1.542],
  ]));
  ring(P,V,1.023);classicCheeks(P,V,true);classicSensors(P,V,-1);classicRoof(P,V,-1);smoke(P,V,false);sourceRoofArmor(P,V);
  mantlet(P,V,.63,1.80,1.10);barrel(P,V,.095,4.54,.81);
}

export function buildT90MX(P: TankBuilderPort): void {
  frame(P,M);
  P.add('hull',hullSolid([
    [-3.43,1.088,1.167,1.157],[-3.13,1.088,1.167,.682],[-3.00,1.088,1.167,.460],[-2.86,1.088,1.167,.348],
    [-2.01,1.088,1.150,.348],[-1.84,1.088,1.366,.348],[-1.22,1.088,1.339,.348],
    [1.89,1.088,1.339,.348],[2.52,1.088,1.115,.348],[3.04,1.088,.929,.556],
    [3.43,1.088,.790,.756],
  ]));
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelPattern:'pressed-six',wheelR:.36455,wheelW:.438,wheelFaceDepthScale:.695,
    wheelZs:[-1.814,-.9455,-.0512,.8188,1.6715,2.5242],wheelY:.38544,wheelZScale:1.04465,
    xc:1.412,trackW:.608,trackTh:.018,sprocket:{z:-2.570,y:.737,r:.3305,trackR:.2605},idler:{z:3.148,y:.767,r:.2512},
    // Hidden support circles are inferred below the independently measured
    // source return-course height; source M omits their separate meshes.
    rollers:[-1.65,.37,2.096].map(z=>({z,y:.9354,r:.101})),rollerR:.101,
    returnRollerWidthM:.188,returnRollerInsetM:.14,
    topY:1.0454,botY:.038,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.157,
    // Owner source: outer shoe0.0334 m; complete central guide0.0871 m.
    // These are independent native casting dimensions, not a radial squash.
    trackShoeDimensions:{padHeight:.018,grouserHeight:.008,webHeight:.012,hornHeight:.054,pinRadius:.012,pinCentreY:0}});
  sourceWheelFaces(P,.36455,.225,1.04465);
  addT90MFenders(P);
  modernSkirts(P,1.335);
  addT90MEngineDeck(P);addT90MRearDrums(P);
  bowGear(P,1.115,3.31,true,1.345,1.64,true);mGlacis(P);
  P.addEquipment('hullDetail',box(2.07,.028,.87),0,1.354,-1.694);
  // The external chin seats at 1.37 m. The separate source-visible internal
  // rotating neck extends down into the tub; it is not a hull body filler.
  P.add('turret',turretSolid(M,[
    [-2.597,.13,1.936,1.529],[-2.36,.615,2.003,1.49],[-1.57,.681,2.003,1.383],
    [-1.13,.805,2.017,1.372],[-.61,.98,2.031,1.37],[-.12,1.157,2.021,1.37],
    [.507,1.477,1.995,1.37],[.89,1.179,1.947,1.37],[.982,1.107,1.925,1.393],
  ]));
  forkedFore(P,M,[[.982,1.107,1.925,1.393],[1.18,.952,1.877,1.443],[1.426,.758,1.757,1.555]],.272);
  onTurret(P,M,'turretDetail',cylY(1.053955,.496,48).scale(1,1,.9526),.001973,1.127,-.11853);
  ring(P,M,1.058);modernCheeks(P,M,false);mFrontFixtures(P);modernBins(P,M,false);modernRoof(P,M,false);smoke(P,M,true);sourceRoofArmor(P,M);
  mantlet(P,M,.71,1.36,.871);barrel(P,M,.091,4.44,.74);
}

export function buildT90SMX(P: TankBuilderPort): void {
  frame(P,S);
  const hullRows: readonly Station[] = [
    [-3.43,1.035,1.317,1.308],[-3.13,1.039,1.56,.81],[-2.85,1.039,1.56,.524],
    [-2.30,1.04,1.532,.579],[-1.15,1.07,1.533,.580],[-.88,1.07,1.574,.580],
    [1.25,1.062,1.571,.528],[1.88,1.057,1.47,.527],[2.64,1.05,1.213,.528],
    [3.05,1.030,1.045,.603],[3.43,1.006,.891,.881],
  ];
  P.add('hull',smHullTub(hullRows.map(([z,w,y,k]): Station => [z,w,smEngineDeckSupportRoof(z,y),k])));
  P.gear=KIT.buildRunningGear(P,{style:'dished',wheelPattern:'pressed-six',wheelR:.3981,wheelW:.40954,wheelFaceDepthScale:.69595,
    wheelZs:[-1.93988,-.98038,-.02818,.87757,1.77558,2.70061],wheelY:.45513,wheelZScale:1.05575,
    wheelYs:[.47202,.45513,.45513,.45513,.45513,.51461],roadWheelOutsetM:.015135,
    xc:1.40647,xcLeft:1.40818,xcRight:1.404765,trackW:.48891,trackTh:.020,
    sprocket:{z:-2.695,y:.8472,r:.37294,trackR:.3362,axialScaleLeft:.998011,axialScaleRight:1.026922},idler:{z:3.389,y:.8739,r:.2704,trackR:.2316},
    rollers:[-1.65,.37,2.096].map(z=>({z,y:1.055,r:.11})),rollerR:.11,
    returnRollerWidthM:.188,returnRollerInsetM:.14,
    sprocketDepthScale:.897,idlerDepthScale:.79,
    suspensionDimensions:{armWidthM:.07720,armHeightM:.161706555,armAxleHeightM:.194965059,
      armCenterAbsXM:1.14535,armCenterLeftAbsXM:1.144375,armCenterRightAbsXM:1.14633,
      anchorBossWidthM:.38471,anchorBossRadiusM:.066385,anchorBossCenterAbsXM:.92639,
      axleBossWidthM:.19207,axleBossRadiusM:.047265,axleBossCenterAbsXM:1.26208,anchorLiftM:.16946},
    topY:1.19,botY:.051,paintedEnds:true,arms:true,coveredTop:true,linkPitchM:.159,
    trackShoeDimensions:{padHeight:.031,grouserHeight:.0135,webHeight:.015,hornHeight:.0853,pinRadius:.012,pinCentreY:-.004}});
  sourceWheelFaces(P,.3981,.179,1.05575);
  smFendersAndSkirts(P);
  addT90SMEngineDeck(P);bowGear(P,1.068,3.46,true,1.54,1.81,false,false);addT90SMFrontEra(P);
  P.add('turret',turretSolid(S,[
    [-1.477,.728,2.2195,1.711],[-1.02,.868,2.22,1.711],[-.73,.957,2.252,1.565],
    [-.47,1.019,2.2893,1.532],[.04,1.184,2.278,1.532],[.56,1.337,2.226,1.532],
    [.954,1.439,2.193,1.532],[1.34,1.061,2.145,1.532],[1.54,.863,2.098,1.610],
    [1.734,.408,2.051,1.781],
  ]));
  ring(P,S,1.045);modernCheeks(P,S,true);modernBins(P,S,true);modernRoof(P,S,true);smoke(P,S,true);sourceRoofArmor(P,S);
  mantlet(P,S,.682,2.20,1.328);barrel(P,S,.096,4.90,.90);
  addT90SMGunSaddles(P);
}

export const T90_X_PROFILES = {
  t90a_x:{build:buildT90AX},t90a_vladimir_x:{build:buildT90AVladimirX},
  t90m_x:{build:buildT90MX},t90sm_x:{build:buildT90SMX},
} as const;
