// Independently authored first-party Panther X. GRIP420 / David Falke's FBX
// remains a local comparison oracle; no source geometry or texture is loaded.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ, cylX, torus } = KIT;
const cylY = (radius: number, height: number, segments: number): THREE.BufferGeometry =>
  KIT.cylY(radius, radius, height, segments);
const RING_Y = 1.4596;
const RING_Z = .5185;
const GUN_Y = 1.85491175;
const GUN_Z = 1.3478;
export const KF51_X_DATUMS = Object.freeze({
  hullLengthM: 7.70, widthM: 3.5603123, overallLengthM: 10.7497,
  roofHeightM: 2.5603, overallHeightM: 5.7214742,
  turretPivot: [0, RING_Y, RING_Z] as const,
  trunnion: [0, GUN_Y, GUN_Z] as const, muzzleZ: 6.8997,
  wheelStations: [-2.2118, -1.4265, -.6365, .1300, .8573, 1.5808, 2.3520] as const,
});

function hullRing(z: number, half: number, top: number, bottom: number): SolidSection {
  const bevel = Math.min(.08, (top - bottom) * .22);
  const shoulder = Math.max(bottom + (top - bottom) * .15, Math.max(1.285, top - .29));
  return { z, ring: [
    [-.923,bottom],[.923,bottom],[.938,Math.min(shoulder, top - bevel - .01)],
    [half,top-bevel],[half-.025,top],[-half+.025,top],[-half,top-bevel],
    [-.938,Math.min(shoulder, top - bevel - .01)],
  ] };
}

function turretRing(z: number, half: number, roofHalf: number, bottom: number, top: number, keel = bottom): SolidSection {
  const lowBevel = Math.min(.09, (top - bottom) * .20);
  const highBevel = Math.min(.095, (top - bottom) * .24);
  return { z: z - RING_Z, ring: [
    [-Math.min(.95,half-.07),keel-RING_Y],[Math.min(.95,half-.07),keel-RING_Y],
    [half-.07,bottom-RING_Y],[half,bottom+lowBevel-RING_Y],[half-.13,top-highBevel-RING_Y],
    [roofHalf,top-RING_Y],[-roofHalf,top-RING_Y],
    [-half+.13,top-highBevel-RING_Y],[-half,bottom+lowBevel-RING_Y],[-half+.07,bottom-RING_Y],
  ] };
}

function pantherCheek(side: number): THREE.BufferGeometry {
  // The cannon sits in an actual longitudinal well between two cheek modules.
  // These independently drawn six-sided sections retain the source's full-width
  // forward shoulders and thin pointed tips, rather than bridging the gun well.
  const inner = side < 0 ? .3807 : .2985;
  return sectionSolid([
    [1.03,1.495,1.095,1.61,2.469], [1.528,1.495,1.09,1.638,2.469],
    [2.25,1.495,1.08,1.734,2.205], [2.50,1.455,1.08,1.769,2.100],
    [2.92,1.251,1.08,1.824,1.945], [3.16,.610,.53,1.855,1.875],
  ].map(([z,outer,roof,bottom,top])=>{
    const bevel=Math.min(.08,(top-bottom)*.24);
    const ring: [number,number][]=[
      [inner,bottom-RING_Y],[outer-.025,bottom-RING_Y],
      [outer,bottom+bevel-RING_Y],[Math.max(roof,outer-.13),top-bevel-RING_Y],
      [roof,top-RING_Y],[inner,top-RING_Y],
    ];
    return {z:z-RING_Z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
  }));
}

function pantherLeftCheek(): THREE.BufferGeometry {
  // The gunner's sight has its own open trough. Its floor is not a solid
  // continuation of the neighboring sloping cheek or the central gun well.
  const inner=.3807;
  return sectionSolid([
    [1.03,1.495,1.095,1.610,2.469,2.468],
    [1.3475,1.495,1.093,1.633,2.469,2.468],
    [1.3480,1.495,1.093,1.633,2.469,2.17568],
    [1.758,1.495,1.080,1.668,2.3428,2.17568],
    [2.25,1.495,1.080,1.734,2.205,2.17568],
    [2.298,1.487,1.080,1.741,2.1758,2.1748],
    [2.50,1.455,1.080,1.769,2.100,2.099],
    [2.92,1.251,1.080,1.824,1.945,1.944],
    [3.16,.610,.530,1.855,1.875,1.874],
  ].map(([z,outer,roof,bottom,top,floor])=>{
    const bevel=Math.min(.08,(top-bottom)*.24);
    const notchOuter=Math.min(.966,roof-.025),notchInner=Math.min(.499,notchOuter-.025);
    const ring:[number,number][]=[[inner,bottom],[outer-.025,bottom],[outer,bottom+bevel],
      [Math.max(roof,outer-.13),top-bevel],[roof,top],[notchOuter,top],
      [notchOuter,floor],[notchInner,floor],[notchInner,top],[inner,top]];
    return {z:z-RING_Z,ring:ring.map(([x,y])=>[-x,y-RING_Y] as [number,number]).reverse()};
  }));
}

function fitting(P: TankBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(slot, geometry, x, y - RING_Y, z - RING_Z, rx, ry, rz);
}

function pantherWhip(): THREE.BufferGeometry {
  // Analytic flexible mast: a tapered circular tube along a gently bowed
  // axis. A straight cylinder missed both the source mid-height stations
  // and its changing diameter; the measured tip remains unchanged.
  const length=2.713115,g=new THREE.CylinderGeometry(.00449,.01257,length,12,18);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),radial=p.getZ(i),t=(p.getY(i)+length/2)/length;
    const dz=.01605-.5279*t,n=Math.hypot(length,dz);
    p.setXYZ(i,x,3.00752+length*t-radial*dz/n,-2.13537+.01605*t-.26395*t*t+radial*length/n);
  }
  g.computeVertexNormals();return g;
}

function pantherSkirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    // Independently drawn cross sections preserve the Panther's two sloping
    // flank planes, raised rear hem and thin terminal fenders. Flat boxes
    // had put low, full-width armor into both wrap zones.
    // This is the removable outer skirt, not the independent closed inner
    // hull. Its attached fasteners leave with it; separate guards stay fixed.
    P.destructibleCluster(`kf51_skirt_era_${side<0?'L':'R'}`,()=>{
    P.add('hull',markEraHitFaces(sectionSolid([
      // z, inner hem, outer width, outer hem, outer belt top, upper edge x/y, roof
      [-3.85,1.758,1.668,1.759,1.764,1.661,1.769,1.7711],
      [-3.80,1.4889,1.712,1.751,1.756,1.694,1.790,1.80405],
      [-3.75,1.2113,1.729,1.602,1.790,1.700,1.7945,1.83701],
      [-3.70,1.2113,1.735,1.299,1.780,1.713,1.8112,1.86889],
      [-3.50,1.2113,1.735,1.299,1.647,1.706,1.812,1.82641],
      [-2.80,1.2113,1.742,1.285,1.582,1.714,1.758,1.77335],
      [-2.30,.8429,1.770,.959,1.195,1.735,1.6979,1.7357],
      [-1.995,.8285,1.780156,.9502,1.135,1.734,1.678,1.713],
      [-1.00,.8285,1.780156,.9502,1.135,1.734,1.606,1.6371],
      [-.543,.8285,1.780156,.9502,1.135,1.734,1.577,1.6025],
      [1.68,.8285,1.780156,.9502,1.135,1.734,1.577,1.6025],
      [2.38,.8285,1.780156,.9502,1.135,1.734,1.454,1.4784],
      [3.005,.8285,1.780156,.9502,1.135,1.734,1.348,1.3667],
      [3.55,.8285,1.780156,1.021,1.135,1.734,1.253,1.2692],
      [3.605,.9342,1.780156,1.132,1.139,1.734,1.242,1.2594],
      [3.745,1.233,1.668,1.233,1.234,1.650,1.234,1.2342],
    ].map(([z,hem,outer,outerHem,beltTop,edgeX,edgeY,roof])=>{
      const ring:[number,number][]=[[1.602,hem],[Math.min(1.668,outer-.005),hem],[outer,outerHem],
        [outer,beltTop],[edgeX,edgeY],[1.650,roof],[1.602,roof]];
      return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as [number,number]).reverse():ring};
    })),[side,0,0],.01));
    for(const [z,y,x]of[[-3.25,1.71,1.728],[-2.63,1.66,1.735],[-1.74,1.565,1.745],
      [-.74,1.46,1.755],[.44,1.44,1.755],[1.56,1.44,1.755],[2.68,1.30,1.766]]){
      P.addEquipment('hullDetail',markEraFurniture(box(.018,.041,.10)),side*x,y,z);
      P.addEquipment('hullDark',markEraFurniture(cylX(.013,.018,8)),side*(x+.002),y,z);
    }
    });
    P.addMudguard('panther-x-front-guard','hull',orientedSlab(
      [side*.94,1.14,3.80],[side*1.61,1.14,3.80],[side*1.61,1.27,3.19],[side*.94,1.27,3.19],
      [side*.94,1.24,3.85],[side*1.61,1.24,3.745],[side*1.61,1.36,3.04],[side*.94,1.36,3.04],
    ));
    P.addMudguard('panther-x-front-flap','hullRubber',box(.57,.26,.046),side*1.27,1.096,3.75,-.13);
    P.addMudguard('panther-x-rear-flap','hullRubber',orientedSlab(
      [side*.986,.751,-3.364],[side*1.546,.751,-3.364],[side*1.546,1.210,-3.746],[side*.986,1.210,-3.746],
      [side*.986,.770,-3.349],[side*1.546,.770,-3.349],[side*1.546,1.229,-3.731],[side*.986,1.229,-3.731],
    ));
    P.addMudguard('panther-x-rear-hanger','hullDark',box(.56,.30,.045),side*1.27,1.50,-3.54);
    P.addEquipment('hullDark',box(.5563,.1072,.0296),side*1.26445,1.556,-3.7949);
    for(let j=0;j<7;j++)P.addEquipment('hullDetail',box(.5225,.0052,.005),side*1.26435,1.525+j*.010,-3.807);
    P.addEquipment('hullDetail',torus(.058,.020,12,6),side*.81,.75,-3.26);
    const towEye=torus(.098,.024,16,8);towEye.scale(.62,1,1);
    P.addEquipment('hullDetail',towEye,side*.661,.675,3.535,0,Math.PI/2);
    P.addEquipment('hullDetail',box(.098,.084,.098),side*.661,.837,3.513);
    // Source front lamps sit in the broad shallow berth at Z3.66..3.83.
    P.addEquipment('hullDetail',box(.557,.148,.171),side*1.2635,1.144,3.7445);
    P.addEquipment('hullDark',cylZ(.055,.027,20),side*1.0825,1.141,3.778);
    P.addEquipment('hullGlass',cylZ(.041,.012,20),side*1.0825,1.141,3.795);
    P.addEquipment('hullDark',cylZ(.037,.020,16),side*1.181,1.1245,3.78);
    P.addEquipment('hullDetail',box(.317,.023,.064),side*1.3315,1.1805,3.735);
  }
}

function pantherSightHood(P: TankBuilderPort): void {
  // Thin faceted cover over the left sight recess, with separate forward
  // supports. The opening stays between Y2.17568 and its Y2.533 underside.
  fitting(P,'turretDetail',sectionSolid([
    [1.080,-1.229,-1.084,-1.080],
    [1.3478,-1.190,-1.037,-.428],
    [1.7576,-1.136,-.966,-.428],
  ].map(([z,outer,roof,right])=>({z,ring:[
    [outer,2.445],[roof,2.5331],[right,2.5331],
    [right,2.5615],[roof,2.5615],[outer,2.4734],
  ] as [number,number][]}))),0,0,0);
  // Rear bevel descends to the roof. The measured plane normal is roughly
  // (.283,.663,-.693); a floating horizontal cap omitted this seating face.
  fitting(P,'turretDetail',orientedSlab(
    [-1.084,2.444,.9917],[-.428,2.444,1.2595],[-.428,2.5365,1.348],[-1.084,2.5365,1.0801],
    [-1.084,2.469,.9917],[-.428,2.469,1.2595],[-.428,2.5615,1.348],[-1.084,2.5615,1.0801],
  ),0,0,0);
  fitting(P,'turretDetail',box(.4674,.3574,.078),-.73245,2.3544,1.513);
  for(const x of[-.94695,-.518]){
    fitting(P,'turretDetail',box(.0384,.3574,.2135),x,2.3544,1.8643);
  }
}

function pantherVisionBand(P: TankBuilderPort): void {
  // The right hatch has an L-shaped periscope bank, not a full-height box
  // across its center. Independent end posts seat the thin cap on the roof.
  fitting(P,'turretDetail',box(.1357,.01007,.372),1.0133,2.64397,.53375);
  fitting(P,'turretDetail',box(.4179,.01007,.150),.5754,2.64397,.8788);
  fitting(P,'turretDetail',orientedSlab(
    [.748,2.63893,.8038],[.946,2.63893,.672],[1.08116,2.63893,.720],[.819,2.63893,.9538],
    [.748,2.649,.8038],[.946,2.649,.672],[1.08116,2.649,.720],[.819,2.649,.9538],
  ),0,0,0);
  for(const [x,z,w,d] of [[.5834,.8534,.33885,.0743],[.9985,.5227,.0743,.2993]]){
    fitting(P,'turretDetail',box(w,.16968,d),x,2.55409,z);
  }
  fitting(P,'turretDetail',box(.292,.16968,.0743),.9226,2.55409,.8109,0,-.70);
  for(const [x,z,w,d] of [[.400,.8537,.0089,.0997],[1.004,.361,.0947,.0089]]){
    fitting(P,'turretDetail',box(w,.14008,d),x,2.56889,z);
  }
}

function pantherHatches(P: TankBuilderPort): void {
  for(const [x,z,w,d] of [[-.6525,.6888,.6243,.6545],[.499,.469,.628,.619]]){
    const half=w/2,bevel=.058;
    const hatch=sectionSolid([[-d/2,half-bevel],[-d/2+bevel,half],[d/2-bevel,half],[d/2,half-bevel]]
      .map(([z,r])=>({z,ring:[[-r,2.4692],[r,2.4692],[r,2.51254],[-r,2.51254]] as [number,number][]})));
    P.addCupola('turret',hatch,x,-RING_Y,z-RING_Z);
  }
  for(const x of[-.93395,-.371]){
    fitting(P,'turretDetail',box(.1044,.1125,.1049),x,2.52548,.9728);
    fitting(P,'turretDark',cylX(.04934,.04861,16),x,2.52927,.97277);
  }
  fitting(P,'turretDetail',box(.1049,.1125,.1044),.2201,2.52548,.7354);
  pantherVisionBand(P);
  pantherSightHood(P);
}

function pantherRoof(P: TankBuilderPort): void {
  // Low, broad commander's periscope rises from its own seated circular race.
  fitting(P,'turretDetail',cylY(.32435,.128,32),-.49455,2.5181,-.06805);
  fitting(P,'turretDetail',sectionSolid([
    [-.312,.186,2.54,2.969],[-.227,.2395,2.54,3.1012],
    [.036,.2395,2.54,3.1012],[.18,.215,2.54,2.96],[.2563,.16,2.58,2.70],
  ].map(([z,half,bottom,top])=>({z,ring:[[-half,bottom],[half,bottom],[half,top-.018],
    [half-.018,top],[-half+.018,top],[-half,top-.018]] as [number,number][]}))),-.49455,0,0);
  fitting(P,'turretDark',box(.31,.19,.02),-.49455,2.843,.192);
  fitting(P,'turretGlass',box(.25,.135,.008),-.49455,2.858,.205);
  pantherHatches(P);
  // Raised roof border is a solid low crown, with the drone bay visibly inset.
  fitting(P,'turretDetail',box(2.29,.083,.42),0,2.515,-2.40);
  for(const side of[-1,1]){
    fitting(P,'turretDetail',box(.15,.090,2.41),side*1.14,2.515,-1.21);
    fitting(P,'turretDetail',box(.115,.095,.42),side*1.02,2.515,.10,0,side*.42);
    fitting(P,'turretDetail',cylY(.057,.17,14),side*1.02234,2.679,-2.13537);
    // The source has a vertical lower neck, then an aft-leaning upper rod.
    // Keeping the bend at Y3.00752 retains the actual tip and base datums.
    fitting(P,'turretDark',cylY(.01257,.259,10),side*1.02234,2.87802,-2.13537);
    fitting(P,'turretDark',cylY(.02270,.01289,12),side*1.02234,3.00107,-2.13537);
    fitting(P,'turretDark',pantherWhip(),side*1.02234,0,0);
    for(const z of[-1.87,-.36])fitting(P,'turretDetail',torus(.045,.014,12,6),side*.97,2.48,z,Math.PI/2);
  }
  fitting(P,'turretDark',box(.53,.026,1.38),.428,2.477,-1.40);
  fitting(P,'turretDetail',box(.49,.04,1.34),.428,2.507,-1.40);
  for(let j=0;j<9;j++)fitting(P,'turretDark',box(.45,.008,.025),.428,2.531,-1.91+j*.12);
  fitting(P,'turretDetail',cylY(.24,.16,24),.37,2.584,-2.56);
  // The upper receiver rides between separate inclined yoke cheeks. A box
  // from the pedestal to the receiver roof erased the source's fork opening.
  for(const x of[.075,.593]){
    fitting(P,'turretDetail',box(.108,.025,.275),x,2.6255,-2.865);
    fitting(P,'turretDetail',orientedSlab(
      [x-.054,2.613,-3.013],[x+.054,2.613,-3.013],[x+.054,2.613,-2.941],[x-.054,2.613,-2.941],
      [x-.054,3.0,-2.966],[x+.054,3.0,-2.966],[x+.054,3.0,-2.906],[x-.054,3.0,-2.906],
    ),0,0,0);
    fitting(P,'turretDetail',orientedSlab(
      [x-.054,2.613,-2.775],[x+.054,2.613,-2.775],[x+.054,2.613,-2.710],[x-.054,2.613,-2.710],
      [x-.054,2.945,-2.588],[x+.054,2.945,-2.588],[x+.054,2.945,-2.523],[x-.054,2.945,-2.523],
    ),0,0,0);
    fitting(P,'turretDetail',cylX(.066,.119,20),x,2.867,-2.705);
  }
  fitting(P,'turretDetail',sectionSolid([
    {z:-3.04,ring:[[-.205,2.789],[.205,2.789],[.205,2.979],[-.205,2.979]]},
    {z:-2.55,ring:[[-.2366,2.789],[.2366,2.789],[.2366,2.979],[-.2366,2.979]]},
    {z:-2.218,ring:[[-.2366,2.789],[.2366,2.789],[.17,2.961],[-.2366,2.961]]},
    {z:-2.086,ring:[[-.15,2.812],[.15,2.812],[.15,2.89],[-.15,2.89]]},
  ].map(station=>({z:station.z,ring:station.ring.map(([x,y])=>[x,y] as [number,number])}))),.3337,0,0);
  fitting(P,'turretDetail',box(.3072,.3922,.618),-.1625,2.811,-2.8592);
  fitting(P,'turretDetail',box(.0988,.3321,.5312),.7163,2.643,-2.752);
  // Measured right-hand RWS trunnion cover extends beyond the slim ammo bay.
  fitting(P,'turretDetail',orientedSlab(
    [.647,2.841,-2.976],[.9376,2.841,-2.976],[.9376,2.841,-2.755],[.647,2.841,-2.755],
    [.647,3.0,-2.976],[.9376,2.9312,-2.976],[.9376,2.9312,-2.755],[.647,2.998,-2.755],
  ),0,0,0);
  fitting(P,'turretDark',box(.17,.20,.018),.3337,2.79,-2.077);
  fitting(P,'turretGlass',box(.12,.13,.009),.3337,2.805,-2.063);
  const mg=FITTINGS.pintleMG({mats:P.mats,cls:'mag',scale:.84,tone:'two-tone',ammo:false,shield:false,ring:false,seed:51051});
  mg.position.set(.10,2.712-RING_Y,-2.54-RING_Z);P.turretG.add(mg);
  // Source rear service plates sit on the tapered bustle, not at maximum
  // cheek width. Their actual footprints do not widen the aft turret.
  for(const side of[-1,1]){
    fitting(P,'turretDetail',box(.025,.4044,.5533),side*1.3337,2.1022,-2.53415);
    for(const y of[1.94295,2.1843])fitting(P,'turretDark',cylX(.0165,.033,12),side*1.3643,y,-2.2314);
    fitting(P,'turretDetail',box(.0446,.1532,.0258),side*1.319,2.2279,-2.8835);
  }
}

export function buildKF51X(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);P.turretG.position.set(0,RING_Y,RING_Z);
  P.gunG.position.set(0,GUN_Y-RING_Y,GUN_Z-RING_Z);
  P.add('hull',sectionSolid([
    // The raised aft lip is thin; the source lower tub rises from Z−2.973
    // through the rear bulkhead instead of carrying its floor to the stern.
    hullRing(-3.85,1.61,1.7711,1.749),hullRing(-3.80,1.61,1.80405,1.48806),
    hullRing(-3.751,1.61,1.83635,1.21149),hullRing(-3.70,1.61,1.86889,1.14991),
    hullRing(-3.60,1.61,1.86045,1.02930),hullRing(-3.51,1.61,1.827,.92091),
    hullRing(-3.365,1.61,1.827,.74638),hullRing(-3.322,1.61,1.827,.74638),
    hullRing(-2.973,1.61,1.827,.4699),
    hullRing(-2.33,1.61,1.827,.47),hullRing(-1.00,1.61,1.761,.47),
    hullRing(-.845,1.61,1.603,.47),hullRing(1.47,1.61,1.603,.47),
    hullRing(2.447,1.61,1.420,.47),hullRing(3.005,1.61,1.366,.52),
    hullRing(3.745,1.61,1.234,1.06),hullRing(3.85,.95,1.225,1.16),
  ]));
  P.gear=KIT.buildRunningGear(P,{
    style:'rubber',wheelR:.3280,wheelW:.36,wheelY:.4323,xc:1.2770,
    wheelZs:[...KF51_X_DATUMS.wheelStations],trackW:.5770,trackTh:.070,
    sprocket:{z:-2.9275,y:.7982,r:.318},idler:{z:3.1721,y:.7422,r:.293},
    topY:1.154,botY:.097,paintedEnds:true,arms:true,coveredTop:true,
  });
  pantherSkirts(P);
  for(const x of[-.53,.53]){
    P.addEquipment('hullDark',box(.88,.024,1.07),x,1.843,-2.86);
    for(let j=0;j<14;j++)P.addEquipment('hullDetail',box(.83,.014,.036),x,1.864,-3.34+j*.074);
  }
  P.addEquipment('hullDetail',box(.54,.050,.68),-.57,1.505,2.12,.18);
  for(let i=0;i<3;i++){
    P.addEquipment('hullDark',box(.13,.074,.13),-.75+i*.18,1.632,1.82);
    P.addEquipment('hullGlass',box(.095,.042,.009),-.75+i*.18,1.638,1.891);
  }
  P.add('turret',sectionSolid([
    turretRing(-3.079,1.21,1.13,2.085,2.416),
    turretRing(-2.71,1.35,1.20,1.966,2.431),
    turretRing(-2.25,1.376,1.10,1.875,2.469),
    turretRing(-.984,1.435,1.10,1.725,2.469),
    turretRing(-.50,1.461,1.093,1.638,2.469,1.4596),
    turretRing(.304,1.484,1.093,1.60,2.469,1.4596),
    turretRing(1.03,1.495,1.095,1.610,2.469,1.4596),
  ]));
  P.add('turret',pantherLeftCheek());P.add('turret',pantherCheek(1));
  P.add('turret',sectionSolid([
    {z:1.03-RING_Z,ring:[[-.3807,0],[.2985,0],[.2985,2.469-RING_Y],[-.3807,2.469-RING_Y]]},
    {z:1.485-RING_Z,ring:[[-.3807,0],[.2985,0],[.2985,1.655-RING_Y],[-.3807,1.655-RING_Y]]},
  ]));
  P.add('turret',cylY(1.037,.19,48),0,.11,0);
  pantherRoof(P);
  P.add('gunMount',sectionSolid([
    [.9622,-.3807,.2985,2.0549,.23,2.4049], [1.1074,-.3807,.2985,1.9049,.25,2.4692],
    [1.3478,-.3807,.2985,1.726,.25,2.4692], [1.952,-.3807,.2985,1.726,.22,2.2816],
    [2.297,-.3807,.2985,1.6975,.1727,2.1758], [3.16,-.2997,.2985,1.6975,.162,2.1266],
    [3.83,-.2565,.2565,1.6975,.150,2.0875], [4.42,-.229,.229,1.7255,.143,2.0536],
    [4.6613,-.13,.13,1.7449,.105,2.0249],
  ].map(([z,left,right,bottom,roof,top])=>({z:z-GUN_Z,ring:[
    [left,bottom-GUN_Y],[right,bottom-GUN_Y],[right,top-.065-GUN_Y],
    [roof,top-GUN_Y],[-roof,top-GUN_Y],[left,top-.065-GUN_Y],
  ] as [number,number][]}))));
  for(const [z,y,w]of[[.11,.59,.65],[.57,.445,.65],[1.15,.313,.35],[1.91,.266,.33],[2.75,.218,.30]])
    P.addEquipment('gunMount',box(w,.018,.043),0,y,z);
  // The 130 mm source tube has a constant-diameter fore section, not the
  // generic gun helper's 25% base-to-muzzle taper or bore evacuator.
  P.add('gun',cylZ(.1294,3.2091,28),0,0,1.4973);
  P.add('gun',cylZ(.0892,2.43005,28),0,0,4.316875);
  // Actual exposed tube jacket is 204 mm diameter through Z 6.527. Only
  // the final muzzle neck reduces to 178.4 mm; terminal radius is not a
  // valid measurement for the entire fore tube.
  P.add('gun',cylZ(.102,2.07746,28),0,0,4.14058);
  // Source collar Z 5.452418..5.655017: its full 202.6 mm axial sleeve
  // is distinct from the 204 mm jacket and the final native muzzle assembly.
  P.add('gun',cylZ(.1077255,.20259905,28),0,0,4.2059176);
  P.addEquipment('gun',sectionSolid([
    [6.599,.032,1.9956],[6.664,.0429,2.0719],[6.725,.0429,2.0719],
    [6.756,.0429,2.0454],[6.832,.023,1.9774],
  ].map(([z,half,top])=>({z:z-GUN_Z,ring:[[-half,.088],[half,.088],[half,top-GUN_Y],[-half,top-GUN_Y]]}))));
  P.addEquipment('gun',orientedSlab(
    [-.0362,.1340,5.2322],[.0362,.1340,5.2322],[.0362,.2064,5.1793],[-.0362,.2064,5.1793],
    [-.0362,.1340,5.2510],[.0362,.1340,5.2510],[.0362,.2064,5.1981],[-.0362,.2064,5.1981],
  ));
  P.addEquipment('gunDark',cylZ(.025,.73,12),-.28,.13,1.34);
  P.muzzleZ=KF51_X_DATUMS.muzzleZ-GUN_Z;P.topY=3.10-RING_Y;
  P.hullG.userData.xRebuild={candidate:'kf51_x',independent:true,datumVersion:1,sourceLocalOnly:true};
}

export const KF51_X_PROFILES = { kf51_x: { build: buildKF51X } } as const;
