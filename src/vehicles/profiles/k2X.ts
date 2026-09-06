// First-party K2 X. The owner's quarantined source is a measurement/reference
// input only; this module has no source loader, mesh buffers or donor builder.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylZ, torus } = KIT;
const cylY = (radius: number, height: number, segments: number): THREE.BufferGeometry =>
  KIT.cylY(radius, radius, height, segments);
const CENTER_Z = 0.13185;
const GROUND = 0.0045;
const YAW_Y = 1.59 + GROUND;
const YAW_Z = 0.35 - CENTER_Z;
const GUN_Y = 1.99253;
const GUN_Z = 1.50 - CENTER_Z;

export const K2_X_DATUMS = Object.freeze({
  hullLengthM: 7.8535, widthM: 3.71906, overallLengthM: 10.8448,
  roofHeightM: 2.369, overallHeightM: 4.73527,
  turretPivot: [0, YAW_Y, YAW_Z] as const,
  trunnion: [0, GUN_Y, GUN_Z] as const,
  muzzleZ: 7.0499 - CENTER_Z,
  wheelStations: [-2.044, -1.149, -0.254, 0.641, 1.536, 2.431] as const,
});

function tub(z: number, half: number, top: number, bottom: number): SolidSection {
  const shoulder = Math.max(bottom + 0.015, top - Math.min(z >= 2.885 ? .032 : .18, (top - bottom) * .25));
  return { z: z - CENTER_Z, ring: [
    [-1.045, bottom + GROUND], [1.045, bottom + GROUND],
    [1.055, shoulder + GROUND], [half, shoulder + GROUND],
    [half, top + GROUND], [-half, top + GROUND],
    [-half, shoulder + GROUND], [-1.055, shoulder + GROUND],
  ] };
}

function turret(z: number, half: number, roofHalf: number, low: number, high: number): SolidSection {
  const depth = high - low;
  const lowerBevel = Math.min(.11, depth * .22);
  const upperBevel = Math.min(.22, depth * .35);
  return { z: z - CENTER_Z - YAW_Z, ring: [
    [-half + 0.07, low + GROUND - YAW_Y], [half - 0.07, low + GROUND - YAW_Y],
    [half, low + lowerBevel + GROUND - YAW_Y], [half, high - upperBevel + GROUND - YAW_Y],
    [roofHalf, high + GROUND - YAW_Y], [-roofHalf, high + GROUND - YAW_Y],
    [-half, high - upperBevel + GROUND - YAW_Y], [-half, low + lowerBevel + GROUND - YAW_Y],
  ] };
}

function onTurret(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  // Armor cassettes and the carrier floor are structural surfaces. Routing
  // them through addEquipment would silently relabel them turretEquipment.
  if (bucket === 'turret') {
    P.add(bucket, geometry, x, y + GROUND - YAW_Y, z - CENTER_Z - YAW_Z, rx, ry, rz);
  } else {
    P.addEquipment(bucket, geometry, x, y + GROUND - YAW_Y, z - CENTER_Z - YAW_Z, rx, ry, rz);
  }
}

function hullFurniture(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    // Bow shoulder follows the glacis and stays above the single native belt.
    P.addMudguard('k2-x-front-shoulder', 'hull', orientedSlab(
      [side * 1.08, 1.265, 3.73 - CENTER_Z], [side * 1.86, 1.265, 3.73 - CENTER_Z],
      [side * 1.86, 1.350, 3.29 - CENTER_Z], [side * 1.08, 1.350, 3.29 - CENTER_Z],
      [side * 1.08, 1.335, 4.05 - CENTER_Z], [side * 1.86, 1.335, 4.05 - CENTER_Z],
      [side * 1.86, 1.402, 3.29 - CENTER_Z], [side * 1.08, 1.402, 3.29 - CENTER_Z],
    ));
    P.addMudguard('k2-x-front-flap', 'hullRubber', box(.64, .34, .045), side * 1.43, 1.17, 3.99 - CENTER_Z, -.12);
    // Object_4's continuous inner skirt lies at X 1.7285..1.7754. The six
    // additional outer plates do not replace it: doing so left an exposed
    // 70 mm longitudinal hole between the body and forward skirt.
    for (const [rear,front,hem] of [
      [-3.3926,-1.8926,.7389],[-1.8906,-.4092,.7389],
      [-.4077,.8604,.6940],[.8618,2.123,.6944],[2.125,3.5703,.6940],
    ]) {
      P.add('hull',box(.0424,1.3404-hem,front-rear),side*1.7542,(1.3404+hem)/2,(rear+front)/2-CENTER_Z);
      // The upper return lip closes onto the deck. The plate below it is
      // relieved 5.5 mm inboard for the native animated band's real width.
      P.add('hull',box(.0481,.014,front-rear),side*1.75145,1.3334,(rear+front)/2-CENTER_Z);
    }
    for (const [rear,front] of [[-.4054,.222],[.224,.8486],[.8681,1.4907],[1.4927,2.1163],[2.1327,2.5563],[2.5582,2.9848]]) {
      P.add('hull',box(.1255, .6021,front-rear),side*1.79675,1.03958,(rear+front)/2-CENTER_Z);
      P.addEquipment('hullDetail',box(.025,.024,.070),side*1.7565,1.352,(rear+front)/2-CENTER_Z);
    }
    // Distinct upper corner lamp berths (Object_29), above the front guards.
    P.addEquipment('hullDetail',box(.637,.031,.525),side*1.4775,1.3853,3.204-CENTER_Z);
    P.addEquipment('hullDetail',box(.156,.134,.090),side*1.627,1.4555,2.969-CENTER_Z);
    P.addEquipment('hullDark',cylZ(.051,.012,20),side*1.627,1.4555,3.019-CENTER_Z);
    P.addEquipment('hullGlass',cylZ(.036,.014,20),side*1.627,1.4555,3.027-CENTER_Z);
    for(const x of[1.549,1.705])P.addEquipment('hullDetail',box(.018,.132,.128),side*x,1.460,2.985-CENTER_Z);
    P.addEquipment('hullDetail',box(.184,.018,.132),side*1.627,1.531,2.985-CENTER_Z);
    // Low paired towing lugs are not the headlamps. Their real seats are on
    // the sloped beak near Y1.21, not below the lower glacis at Y.82.
    for(const x of[.687,.911])P.addEquipment('hullDetail',box(.038,.15,.19),side*x,1.210,3.641-CENTER_Z);
    P.addEquipment('hullDetail',cylX(.036,.248,16),side*.799,1.229,3.628-CENTER_Z);
    P.addEquipment('hullDetail',box(.278,.024,.278),side*.799,1.322,3.643-CENTER_Z,.10);
    P.addEquipment('hullDetail',torus(.071,.022,12,6),side*.86,.82,-3.24-CENTER_Z);
    P.addEquipment('hullDetail',box(.1573,.1972,.1504),side*1.48585,1.5045,-3.6826-CENTER_Z);
    P.addEquipment('hullDark',box(.103,.095,.013),side*1.48585,1.509,-3.764-CENTER_Z);
    P.addEquipment('hullGlass',box(.070,.058,.010),side*1.48585,1.509,-3.776-CENTER_Z);
    // These measured aft supports, not the armor shell, define the exterior
    // hull endpoint at raw Z -3.7949.
    P.addEquipment('hullDetail',box(.0312,.3642,.2051),side*1.0967,1.5206+GROUND,-3.69235-CENTER_Z);
    P.addMudguard('k2-x-rear-flap', 'hullRubber', box(.7148, .6758, .043), side * 1.4053, 1.0035, -3.3428 - CENTER_Z, .07);
    P.addMudguard('k2-x-rear-hanger', 'hullDark', box(.68, .22, .055), side * 1.4053, 1.437, -3.3428 - CENTER_Z);
  }
  // Three central radiator bays occupy the source rear bulkhead. The draft's
  // two side boxes left the recognizable central louvered panel absent.
  P.addEquipment('hullDetail',box(2.0566,.5537,.4454),0,1.28955+GROUND,-3.4375-CENTER_Z);
  P.addEquipment('hullDark',box(1.995,.396,.013),0,1.278,-3.668-CENTER_Z);
  for(let j=0;j<18;j++)P.addEquipment('hullDetail',box(1.995,.009,.018),0,1.091+j*.021,-3.680-CENTER_Z);
  for(const x of[-.343,.343])P.addEquipment('hullDetail',box(.024,.410,.023),x,1.280,-3.686-CENTER_Z);
  P.addEquipment('hullDetail',box(2.0566,.066,.04),0,1.525,-3.668-CENTER_Z);
  for (const x of [-.57, .57]) {
    P.addEquipment('hullDark', box(.88, .019, 1.04), x, 1.710, -2.87 - CENTER_Z);
    for (let j = 0; j < 15; j++) P.addEquipment('hullDetail', box(.83, .013, .033), x, 1.725, -3.33 + j * .066 - CENTER_Z);
  }
  hullDeckFittings(P);
}

function deckPanel(x0: number,x1: number,z0: number,z1: number,
  rearY: number,frontY: number,thickness: number): THREE.BufferGeometry {
  return sectionSolid([
    {z:z0,ring:[[x0,rearY-thickness],[x1,rearY-thickness],[x1,rearY],[x0,rearY]]},
    {z:z1,ring:[[x0,frontY-thickness],[x1,frontY-thickness],[x1,frontY],[x0,frontY]]},
  ]);
}

function hullDeckFittings(P: TankBuilderPort): void {
  // Source Object_29 places the driver's low hatch and vision bank on +X.
  // The former elevated -X box invented a second, much taller hatch.
  P.addEquipment('hullDetail',deckPanel(.1694,.8975,1.88185,2.34085,1.518,1.455,.014));
  for(const [x,width,rear,front,roof] of [
    [.323,.148,1.99115,2.16505,1.5524],[.729,.148,1.99115,2.16505,1.5524],
    [.5315,.2182,1.95605,2.22165,1.5611],
  ]) {
    P.addEquipment('hullDetail',deckPanel(x-width/2,x+width/2,rear,front,roof,roof-.020,.066));
    P.addEquipment('hullDark',box(width-.025,.038,.011),x,roof-.039,front+.002);
    P.addEquipment('hullGlass',box(width-.046,.025,.005),x,roof-.039,front+.009);
  }
  for(const x of[.253,.818])P.addEquipment('hullDetail',cylX(.018,.088,12),x,1.517,1.953);
  // Independent central vision hood ahead of the turret: a low sloping
  // armored housing, not another flat block on the hatch.
  P.addEquipment('hullDetail',deckPanel(-.1627,.0809,1.75775,2.06155,1.6236,1.598,.100));
  P.addEquipment('hullDark',box(.1121,.0839,.011),-.03075,1.55235,2.04395);
  P.addEquipment('hullGlass',box(.091,.061,.004),-.03075,1.55235,2.0515);
  // The asymmetric port service panel follows the glacis exactly. Its
  // stepped footprint leaves room for the center hood; it is not raised ERA.
  P.addEquipment('hullDetail',deckPanel(-1.07018,-.22,1.9578,2.396,1.504,1.444,.011));
  P.addEquipment('hullDetail',deckPanel(-1.07018,-.04958,2.397,2.68988,1.444,1.4035,.011));
  for(const x of[-1.025,-.264])for(const z of[2.012,2.32]) {
    const y=1.504-(z-1.9578)*.137;
    P.addEquipment('hullDark',cylY(.009,.006,8),x,y+.002,z);
  }
  P.addEquipment('hullDetail',deckPanel(.1621,.2581,2.63575,3.41115,1.424,1.315,.014));
  for(const side of[-1,1]) {
    P.addEquipment('hullDetail',box(.6387,.0137,.0117),side*1.40915,1.40585,3.1592);
    P.addEquipment('hullDetail',cylZ(.0742,.1484,16),side*1.6494,1.32575,3.60645);
    P.addEquipment('hullGlass',cylZ(.0464,.009,20),side*1.6494,1.32575,3.6875);
  }
}

function worldTurretEquipment(P: TankBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  x: number,y: number,z: number,rx=0,ry=0): void {
  P.addEquipment(slot,geometry,x,y-YAW_Y,z-YAW_Z,rx,ry);
}

function roundedSightRing(radius: number): [number,number][] {
  const halfSlot=.0835,cut=Math.asin(halfSlot/radius),points: [number,number][]=[];
  for(let i=0;i<=28;i++){
    const a=cut+(Math.PI*2-cut*2)*i/28;
    points.push([-.6365+Math.sin(a)*radius,-(.65412+Math.cos(a)*radius)]);
  }
  points.push([-.7200,-.78607],[-.5530,-.78607]);
  return points;
}

function gunnerRoundedSight(P: TankBuilderPort): void {
  // Object_20 is rounded, with a true open-front slot. The glass belongs at
  // canonical Z .78627, not 112 mm ahead on a rectangular housing face.
  worldTurretEquipment(P,'turretDetail',cylY(.1272,.0879,16),-.6365,2.33859,.66212);
  const base=new THREE.LatheGeometry([
    new THREE.Vector2(.146,0),new THREE.Vector2(.146,.0317),
    new THREE.Vector2(.190,.1123),
  ],28);
  worldTurretEquipment(P,'turretDetail',base,-.6365,2.37814,.65412);
  const shell=sectionSolid([[2.49044,.190],[2.58314,.218],[2.69594,.218],[2.73114,.184]]
    .map(([y,r])=>({z:y,ring:roundedSightRing(r)}))).rotateX(-Math.PI/2);
  worldTurretEquipment(P,'turretDetail',shell,0,0,0);
  worldTurretEquipment(P,'turretDark',box(.153,.242,.014),-.63645,2.58514,.77877);
  worldTurretEquipment(P,'turretGlass',box(.1479,.2412,.002),-.63645,2.58514,.78527);
}

function commanderEyeBank(P: TankBuilderPort): void {
  // The source head has eight separate round apertures in three staggered
  // rows. A single large blue rectangle erased its recognizable structure.
  worldTurretEquipment(P,'turretDetail',box(.3642,.2827,.090),.0078,2.82529,-1.608, -.166);
  for(const [x,y,z,r]of[
    [-.1222,2.75314,-1.4474,.040],[.0373,2.75994,-1.4474,.039],[.1370,2.75314,-1.4474,.040],
    [-.1222,2.84784,-1.4640,.040],[-.0142,2.85469,-1.4659,.040],[.1370,2.84784,-1.4640,.040],
    [-.07505,2.93424,-1.4776,.040],[.08335,2.93424,-1.4776,.040],
  ]){
    const bezel=new THREE.LatheGeometry([
      new THREE.Vector2(r,-.096),new THREE.Vector2(r,0),
      new THREE.Vector2(r*.74,0),new THREE.Vector2(r*.74,-.091),
    ],20).rotateX(Math.PI/2);
    worldTurretEquipment(P,'turretDetail',bezel,x,y,z,-.166);
    worldTurretEquipment(P,'turretDark',cylZ(r*.74,.004,20),x,y-.0152,z-.0908,-.166);
    worldTurretEquipment(P,'turretGlass',cylZ(r*.59,.002,20),x,y-.0149,z-.0897,-.166);
  }
}

function sourceSmokeTube(P: TankBuilderPort, side: number, datum: readonly number[]): void {
  const [x,y,z,ax,ay,az]=datum;
  const direction=new THREE.Vector3(side*ax,ay,az).normalize();
  const rotation=new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction));
  const shape=new THREE.LatheGeometry([
    new THREE.Vector2(.050,-.160),new THREE.Vector2(.050,.014),
    new THREE.Vector2(.039,.014),new THREE.Vector2(.039,.006),
  ],20).rotateX(Math.PI/2).applyMatrix4(rotation);
  worldTurretEquipment(P,'turretDetail',shape,side*x,y,z);
  const mouth=cylZ(.038,.003,20).applyMatrix4(rotation);
  worldTurretEquipment(P,'turretDark',mouth,side*x+direction.x*.005,y+direction.y*.005,z+direction.z*.005);
}

function sourceSmokeBanks(P: TankBuilderPort): void {
  const mouths=[
    [1.39065,2.01214,1.80947,.494,.218,.842],
    [1.53905,1.92169,1.64687,.786,.289,.548],
    [1.50245,2.01004,1.64442,.729,.417,.544],
    [1.42385,1.92029,1.80947,.642,.098,.760],
    [1.29930,1.93954,1.96767,.310,.150,.939],
    [1.25245,2.02849,1.97202,.174,.356,.918],
  ];
  for(const side of[-1,1])for(const datum of mouths)sourceSmokeTube(P,side,datum);
}

function roofFurniture(P: TankBuilderPort): void {
  gunnerRoundedSight(P);
  onTurret(P, 'turretDetail', cylY(.163, .2681, 24), 0, 2.49689, -1.52743);
  onTurret(P, 'turretDetail', box(.20, .11, .16), .0078, 2.650, -1.43);
  commanderEyeBank(P);
  sourceSmokeBanks(P);
  for (const [x, z] of [[-.51, -.70], [.58, .21]]) {
    P.addCupola('turret', cylY(.285, .076, 28), x, 2.420 + GROUND - YAW_Y, z - CENTER_Z - YAW_Z);
    onTurret(P, 'turretDetail', box(.20, .019, .040), x, 2.472, z + .11);
  }
  for (const side of [-1, 1]) {
    onTurret(P, 'turretDetail', box(.47, .035, .65), side * 1.15, 2.372, -.92);
    for (const z of [-1.40, -.66]) onTurret(P, 'turretDetail', torus(.043, .012, 12, 6), side * 1.21, 2.388, z, Math.PI / 2);
    // Source Object_21 has a projecting seat and spring base under Object_25's
    // continuous whip. The initial generic base left a real 60 mm air gap.
    onTurret(P, 'turretDetail', box(.415, .110, .393), side * .9365, 2.295, -1.9015);
    onTurret(P, 'turretDetail', cylY(.064, .097, 16), side * .8355, 2.3975, -2.0202);
    onTurret(P, 'turretDark', cylY(.006, 2.291, 8), side * .8355, 3.58527, -2.0202);
    // Paired roof sensor cradles, including their open gap and inclined feet.
    // Their high cheek plates are not cupolas or an enlarged MG ammunition box.
    for(const z of[-1.078,-.715]){
      onTurret(P,'turretDetail',box(.184,.316,.073),side*.670,2.618,z,0,0,side*.20);
    }
    onTurret(P,'turretDetail',box(.118,.137,.285),side*.649,2.6915,-.897);
    for(const z of[-.970,-.8235]){
      onTurret(P,'turretDetail',box(.231,.105,.104),side*.735,2.6915,z);
      onTurret(P,'turretGlass',box(.012,.068,.079),side*.856,2.695,z);
    }
  }
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', scale: 1.275, seed: 2042, tone: 'two-tone', ammo: true, shield: false, ring: false });
  mg.position.set(-.74, 2.53032 + GROUND - YAW_Y, .5425 - CENTER_Z - YAW_Z);
  P.turretG.add(mg);
}

function launcherCheek(P: TankBuilderPort, side: number): void {
  // Object_21's source outer face retreats behind the forward launcher bank.
  // The prior two-station wall buried the upper mouth by 95 mm along its
  // firing axis. These local cross-sections retain a thick armored backing.
  const stations=[
    [1.28915,.432,1.521,1.6845,1.90,1.521,2.0945,.80,2.25,.48,2.3225],
    [1.65,.55,1.42677,1.769,2.00,1.30,2.08,.80,2.104,.55,2.14],
    [1.81,.58,1.3545,1.774,1.92,1.20,2.046,.80,2.085,.58,2.105],
    [1.972,.62,1.30,1.778,1.88,1.197585,2.03,.80,2.066,.62,2.083],
    [2.10,.65,1.222,1.783,1.94,1.18025,2.03,1.15,2.055,.65,2.061],
    [2.25,.67,1.22,1.80,1.83,1.15123,2.03,1.0,2.055,.67,2.059],
    [2.38,.69,1.05,1.814,1.83,1.03,1.869,.90,1.869,.69,1.884],
    [2.38915,.692,1.03,1.82,1.83,1.015,1.855,.90,1.855,.692,1.87],
  ];
  P.add('turret',sectionSolid(stations.map(([z,inner,outer,low,middle,xu,yu,xr,yr,xi,yi])=>{
    const ring: [number,number][]=[[inner,low],[outer,low],[outer,middle],[xu,yu],[xr,yr],[xi,yi]];
    const worldRing=ring.map(([x,y]): [number,number]=>[side*x,y-YAW_Y]);
    return {z:z-YAW_Z,ring:side<0?worldRing.reverse():worldRing};
  })));
  innerCheekBlade(P,side);
}

function innerCheekBlade(P: TankBuilderPort, side: number): void {
  // The smoke-bank relief stops at the steep inboard blade. Object_21's
  // permanent armor still occupies X .4568.. .522 beside the gun hood;
  // letting the relief grow inboard erased this real 21 cm tall face.
  const steepY=(x: number,z: number)=>(1.157558191-.95313666*x-.011928039*z)/.302304853;
  const roofY=(x: number,z: number)=>(2.346541267-.090977841*x-.116893650*z)/.988968608;
  const stations=[1.60,1.68347,1.79577,2.12,2.22837].map(z=>{
    const outer=Math.min(.85,(2.242527156-.819241068*z)/.573449276);
    const floor=1.693939917+(z-1.9)*.246368708;
    const crease=((1.157558191-.011928039*z)*.988968608
      -(2.346541267-.116893650*z)*.302304853)
      /(.95313666*.988968608-.090977841*.302304853);
    const ring: [number,number][]=[
      [.4568,floor],[outer,floor],[outer,roofY(outer,z)],
      [crease,roofY(crease,z)],[.4568,steepY(.4568,z)],
    ];
    const local=ring.map(([x,y]): [number,number]=>[side*x,y-YAW_Y]);
    return {z:z-YAW_Z,ring:side<0?local.reverse():local};
  });
  P.add('turret',sectionSolid(stations));
}

function armorModules(P: TankBuilderPort): void {
  // Vertical replaceable flank cassettes are separate from the central shell.
  // The paired transverse joints at -1.187/-1.156 are actual panel breaks.
  for (const side of [-1,1]) {
    for (const [rear,front] of [[-1.891,-1.187],[-1.156,-.384]]) {
      onTurret(P,'turret',box(.511,.499,front-rear),side*1.2655,2.0735,(rear+front)/2);
      onTurret(P,'turretDetail',box(.505,.025,front-rear-.015),side*1.2655,2.3365,(rear+front)/2);
    }
    for (const [rear,front] of [[-.333,.18],[.20,.786],[.808,1.421]]) {
      const roofRear=2.237-.104*rear,roofFront=2.237-.104*front;
      const sections: SolidSection[]=[
        {z:rear-CENTER_Z-YAW_Z,ring:[[1.271,1.760+GROUND-YAW_Y],[1.521,1.760+GROUND-YAW_Y],[1.521,roofRear+GROUND-YAW_Y],[1.271,roofRear+GROUND-YAW_Y]]},
        {z:front-CENTER_Z-YAW_Z,ring:[[1.271,1.760+GROUND-YAW_Y],[1.521,1.760+GROUND-YAW_Y],[1.521,roofFront+GROUND-YAW_Y],[1.271,roofFront+GROUND-YAW_Y]]},
      ];
      P.add('turret',sectionSolid(side<0?sections.map(station=>({...station,ring:station.ring.map(([x,y])=>[-x,y] as [number,number]).reverse()})):sections));
      onTurret(P,'turretDetail',box(.025,.34,front-rear-.045),side*1.554,1.941,(rear+front)/2);
    }
    launcherCheek(P,side);
    for(const z of[-1.81,-1.26,-1.06,-.48,.26,.68,1.31])onTurret(P,'turretDark',cylX(.016,.020,8),side*1.538,2.20,z);
  }
  // Rear bustle is a carrier with discrete stores, not a full-width solid loaf.
  onTurret(P,'turret',box(3.04,.034,1.04),0,1.813,-2.44);
  onTurret(P,'turretDetail',box(.828,.576,.828),-1.098,2.125,-2.518);
  onTurret(P,'turretDetail',box(.901,.546,.629),1.0885,2.041,-2.2595);
  onTurret(P,'turretDetail',box(.503,.453,.457),-.1255,2.0355,-2.3185);
  for(const y of[2.0115,2.113])onTurret(P,'turretOpenLattice',box(.032,.032,2.333),-1.573,y,-1.8215);
  for(const z of[-2.978,-2.52,-2.06,-1.60,-1.14,-.68])onTurret(P,'turretOpenLattice',box(.022,.345,.022),-1.573,1.982,z);
  onTurret(P,'turretOpenLattice',box(.70,.028,.028),-1.244,2.113,-2.978);
  for(const z of[-2.88,-2.12])onTurret(P,'turretDetail',box(.83,.026,.035),-1.098,2.428,z);
}

function gunPrism(x0: number, x1: number, outline: readonly (readonly [number,number])[]): THREE.BufferGeometry {
  // The owner's canonical Y/Z plane measurements define a fresh side
  // profile. Extrusion across X preserves its stepped back and raked face.
  const ring=outline.map(([y,z]): [number,number]=>[-(z-GUN_Z),y-GUN_Y]).reverse();
  return sectionSolid([{z:x0,ring},{z:x1,ring}]).rotateY(Math.PI/2);
}

function addGunMantlet(P: TankBuilderPort): void {
  // The source face retreats at its top and bottom; the old full-height box
  // protruded 0.28 m above the real forward face at canonical Z2.36.
  P.add('gunMount',gunPrism(-.3162,.4319,[
    [1.63853,1.64502],[1.63853,1.732],[1.770,2.219],
    [1.955,2.36902],[2.0567,2.36],[2.188,2.302],[2.330,2.241],
    [2.34023,1.740],[2.310,1.771],[2.307,1.897],
    [2.042,1.897],[2.040,1.64502],
  ]));
  addGunHood(P);
  // Source circular collar stands ahead of the raked face, not hidden in a
  // rectangular armored block. The ordinary circular barrel remains native.
  P.addEquipment('gunMount',cylZ(.1803,.23,28),0,.01045,2.29337-GUN_Z);
  P.addEquipment('gunMountDark',cylZ(.188,.026,28),0,.01045,2.184-GUN_Z);
}

function addGunHood(P: TankBuilderPort): void {
  // Two differently sloped cover sheets with real side reveals, thin skins
  // and a positive-X optical opening. No box fills the space under the lid.
  P.addEquipment('gunMount',gunPrism(-.2898,.4028,[
    [2.435,1.36165],[2.514,1.74765],[2.5417,1.74765],[2.467,1.36165],
  ]));
  P.addEquipment('gunMount',gunPrism(-.2969,.4128,[
    [2.5084,1.74772],[2.4805,2.151],[2.5125,2.151],[2.54043,1.74772],
  ]));
  for(const [x0,x1] of [[-.2969,-.277],[.394,.4128]]) {
    P.addEquipment('gunMount',gunPrism(x0,x1,[
      [2.332,1.74772],[2.32973,2.23422],[2.5125,2.151],[2.54043,1.74772],
    ]));
  }
  P.addEquipment('gunMount',gunPrism(-.2969,.012,[
    [2.32973,2.217],[2.32973,2.23422],[2.5125,2.151],[2.496,2.143],
  ]));
  P.addEquipment('gunMount',box(.364,.028,.187),.210,2.34623-GUN_Y,2.1275-GUN_Z);
  addGunOptic(P);
}

function addGunOptic(P: TankBuilderPort): void {
  // Four enclosing rails and recessed glazing; a solid dark cuboid would
  // occlude the window and erase the actual cavity under the hood.
  for(const x of[.07925,.34335]) {
    P.addEquipment('gunMountDark',box(.0105,.1396,.0774),x,2.43003-GUN_Y,2.08452-GUN_Z);
  }
  for(const y of[2.36718,2.49458]) {
    P.addEquipment('gunMountDark',box(.2536,.0105,.0774),.2113,y-GUN_Y,2.08452-GUN_Z);
  }
  P.addEquipment('gunMountDark',box(.2536,.1169,.004),.2113,2.43173-GUN_Y,2.04782-GUN_Z);
  P.addEquipment('gunMountGlass',box(.2534,.1152,.004),.2112,2.43173-GUN_Y,2.121-GUN_Z);
}

export function buildK2X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, YAW_Y, YAW_Z);
  P.gunG.position.set(0, GUN_Y - YAW_Y, GUN_Z - YAW_Z);
  P.add('hull', sectionSolid([
    tub(-3.5918, 1.728, 1.699, .80), tub(-3.10, 1.728, 1.699, .426),
    tub(-1.98, 1.728, 1.699, .426), tub(-1.02, 1.728, 1.573, .426),
    tub(1.544, 1.728, 1.573, .426), tub(2.885, 1.728, 1.389, .48),
    tub(3.29, 1.728, 1.380, .67), tub(3.75, 1.080, 1.125, .83),
  ]));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .3225, wheelW: .387, wheelY: .405 + GROUND,
    wheelZs: K2_X_DATUMS.wheelStations.map(z => z - CENTER_Z),
    xc: 1.407, trackW: .619, trackTh: .066,
    sprocket: { z: -2.675 - CENTER_Z, y: .822 + GROUND, r: .351 },
    idler: { z: 3.316 - CENTER_Z, y: .813 + GROUND, r: .300 },
    topY: 1.175 + GROUND, botY: .095, paintedEnds: true, arms: true, coveredTop: true,
  });
  hullFurniture(P);
  P.add('turret', sectionSolid([
    turret(-1.941,.982,.96,1.753,2.363),
    turret(-.788,1.271,.982,1.638,2.363),
    turret(-.377,1.271,.982,1.636,2.364),
    turret(.133,1.271,.465,1.636,2.397),
    turret(1.034,1.271,.43,1.636,2.355),
    turret(1.816,.432,.38,1.636,2.318),
  ]));
  // The ring has a true solid seat, without broad hidden filler planes.
  P.add('turret', cylY(1.12, .085, 48), 0, .030, 0);
  armorModules(P);
  roofFurniture(P);
  addGunMantlet(P);
  KIT.buildGun(P, { len: K2_X_DATUMS.muzzleZ - GUN_Z, r: .0878, baseR: .15, sleeve: true, evac: .39, evacR: 1.90, collar: true });
  P.muzzleZ = K2_X_DATUMS.muzzleZ - GUN_Z;
  P.topY = 3.05 - YAW_Y;
  P.hullG.userData.xRebuild = { candidate: 'k2_x', independent: true, datumVersion: 1, sourceLocalOnly: true };
}

export const K2_X_PROFILES = { k2_x: { build: buildK2X } } as const;
