// Four additive, independently authored source-study Leopards. No donor
// builder, source loader, external topology, or texture is used here.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { bindPartitionedEraCover } from './sourceEraCover.ts';
import { markEraFurniture } from './eraHitFaces.ts';
import { addLeopardA5XSourceDetails } from './leopardA5XDetails.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Station = readonly [z: number, half: number, bottom: number, top: number];
type ShellStation = readonly [z: number, left: number, right: number, bottom: number, top: number];
interface Datum {
  readonly widthM: number;
  readonly hullLengthM: number;
  readonly overallLengthM: number;
  readonly heightM: number;
  readonly turretPivot: readonly [number, number, number];
  readonly trunnion: readonly [number, number, number];
  readonly muzzleZ: number;
}

// Physical meters in the same hull-centered, ground-zero frame as the local
// source receipt. These are integration datums, not self-certifying tests.
export const LEOPARD_X_DATUMS: Readonly<Record<string, Datum>> = Object.freeze({
  leo2a7v_x: { widthM: 4, hullLengthM: 7.72, overallLengthM: 10.97, heightM: 2.64,
    turretPivot: [0, 1.79, .52], trunnion: [0, 2.0326, 2.02], muzzleZ: 6.969 },
  leo2a6m_x: { widthM: 3.98, hullLengthM: 7.72, overallLengthM: 10.97, heightM: 3.03,
    turretPivot: [.006, 1.719, .508], trunnion: [-.0005, 2.0894, 1.95], muzzleZ: 7.025 },
  leo2a4m_x: { widthM: 3.77, hullLengthM: 7.72, overallLengthM: 9.96, heightM: 2.62,
    turretPivot: [-.05, 1.65, .36], trunnion: [-.1273, 1.908, 1.91], muzzleZ: 6.10 },
  leo2a5_x: { widthM: 3.75, hullLengthM: 7.72, overallLengthM: 9.97, heightM: 2.64,
    turretPivot: [0, 1.662, .661], trunnion: [.0238, 1.9979, 1.659], muzzleZ: 6.11 },
});

function begin(P: TankBuilderPort, d: Datum): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...d.turretPivot);
  P.gunG.position.set(d.trunnion[0] - d.turretPivot[0],
    d.trunnion[1] - d.turretPivot[1], d.trunnion[2] - d.turretPivot[2]);
  P.topY = d.heightM - d.turretPivot[1];
}

/** A geometric tub, not a family hull template. The concave shoulder keeps
 * lower armor inboard of the moving belt until the return-run clearance. */
function tub([z, half, bottom, top]: Station, shoulderY: number): SolidSection {
  const keel = Math.min(.99, half * .82);
  const shoulder = Math.min(top - Math.min(.055, (top - bottom) * .18),
    Math.max(bottom + .01, shoulderY));
  return { z, ring: [
    [-keel, bottom], [keel, bottom], [keel + .014, shoulder],
    [half, shoulder], [half, top], [-half, top], [-half, shoulder], [-keel - .014, shoulder],
  ] };
}

function shellSection(d: Datum, [z, left, right, bottom, top]: ShellStation,
  bevelWidth=.12,upperDepth=.16): SolidSection {
  const depth = top - bottom;
  const lower = Math.min(.105, depth * .23);
  const upper = Math.min(upperDepth, depth * .32);
  const bevel = Math.min(bevelWidth, (right-left) * .16);
  const x = d.turretPivot[0], y = d.turretPivot[1];
  return { z: z - d.turretPivot[2], ring: [
    [left + bevel - x, bottom - y], [right - bevel - x, bottom - y],
    [right - x, bottom + lower - y], [right - x, top - upper - y],
    [right - bevel - x, top - y], [left + bevel - x, top - y],
    [left - x, top - upper - y], [left - x, bottom + lower - y],
  ] };
}

function shell(P: TankBuilderPort, d: Datum, stations: readonly ShellStation[],
  bevelWidth=.12,upperDepth=.16): void {
  P.add('turret', sectionSolid(stations.map((station) => shellSection(d, station,bevelWidth,upperDepth))));
}

function equip(P: TankBuilderPort, d: Datum, bucket: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, geometry, x - d.turretPivot[0], y - d.turretPivot[1], z - d.turretPivot[2], rx, ry, rz);
}

/** Actual open sight approach: closed floor, two closed armor reveals, and
 * rear bulkhead. The glass is behind the opening; no hidden face spans it. */
function opticPocket(P: TankBuilderPort, d: Datum, cfg: {
  back: number; mouth: number; x0: number; x1: number;
  floor: number; roof: number; outerLeft: number; outerRight: number; bottom: number; frontRoof?: number;
  cheekShoulder?:number; mouthInset?:number; frontBottomRise?:number;
  sourceA7Cheek?:boolean;
}): void {
  const { back, mouth, x0, x1, floor, roof, outerLeft, outerRight, bottom } = cfg;
  const frontRoof = cfg.frontRoof ?? Math.max(floor + .026, roof - .30);
  const inset=cfg.mouthInset??.31, rise=cfg.frontBottomRise??.16;
  const left:ShellStation[]=[[back,outerLeft,x0,bottom,roof]];
  const right:ShellStation[]=[[back,x1,outerRight,bottom,roof]];
  if(cfg.cheekShoulder!==undefined) {
    const k=(cfg.cheekShoulder-back)/(mouth-back);
    left.push([cfg.cheekShoulder,outerLeft-.03,x0,bottom,roof+(frontRoof-roof)*k]);
    right.push([cfg.cheekShoulder,x1,outerRight+.03,bottom,roof+(frontRoof-roof)*k]);
  }
  left.push([mouth,Math.min(outerLeft+inset,x0-.065),x0,bottom+rise,frontRoof]);
  right.push([mouth,x1,Math.max(outerRight-inset,x1+.065),bottom+rise,frontRoof]);
  shell(P,d,left);
  if(cfg.sourceA7Cheek)a7ForwardCheek(P,d);
  else shell(P,d,right);
  shell(P, d, [[back, x0 - .012, x1 + .012, bottom, floor],
    [mouth + .005, x0 - .012, x1 + .012, bottom + .16, floor - .012]]);
  const mid = (x0 + x1) / 2;
  equip(P, d, 'turretDark', box(x1 - x0 - .02, roof - floor - .05, .055), mid,
    (floor + roof) / 2, back + .025);
  equip(P, d, 'turretGlass', box(x1 - x0 - .09, roof - floor - .12, .012), mid,
    (floor + roof) / 2, back + .060);
  equip(P, d, 'turretDetail', box(x1 - x0 + .04, .028, .18), mid, roof + .007, back + .02);
}

function a7ForwardCheek(P:TankBuilderPort,d:Datum): void {
  // Actual source positive cheek is not transversely flat: its raised
  // ridge runs diagonally in plan and the outer armor falls about .27 m
  // per lateral meter. The negative-X optic opening remains independent.
  const rows=[
    [1.65,1.48,.70,1.75,2.61,2.61,2.40],
    [2.10,1.45,.45,1.8306,2.54285,2.56965,2.3017],
    [2.30,1.39,.30,1.8927,2.45903,2.52886,2.2363],
    [2.51,1.17,.10,1.930,2.3709,2.4904,2.2057],
  ];
  const sections=rows.map(([z,outer,ridge,bottom,leftTop,peak,outerTop])=>({z:z-d.turretPivot[2],
    ring:[[-.60,bottom],[ridge,bottom],[outer,Math.min(outerTop-.045,bottom+.24)],
      [outer,outerTop],[ridge,peak],[-.60,leftTop]].map(([x,y])=>[
      x-d.turretPivot[0],y-d.turretPivot[1],
    ] as [number,number]),
  }));
  P.add('turret',sectionSolid(sections));
}

function mainGun(P: TankBuilderPort, d: Datum, radius: number, long: boolean): void {
  const length = d.muzzleZ - d.trunnion[2];
  KIT.buildGun(P, { len: length, r: radius, baseR: radius * 1.6,
    sleeve: true, evac: long ? .43 : .35, evacR: 1.66, collar: true, paintSleeveBands: true });
  // The existing physical collar pitches but is not part of barrel recoil.
  P.add('gunMount', box(.41, .41, .52), 0, .025, .18);
  P.add('gunDark', cylZ(radius * .84, .016, 24), 0, 0, length + .001);
  P.add('gun', torus(radius * .93, radius * .10, 24, 6), 0, 0, length + .007, Math.PI / 2);
  P.addEquipment('gun', box(.066, .055, .15), 0, radius + .025, length - .41);
}

/** A5's complete gun includes the breech behind the trunnion and a long
 * armored moving mantlet. These are physical parts, not diagnostic masks. */
function a5Gun(P: TankBuilderPort, d: Datum): void {
  const [gx,gy,gz]=d.trunnion;
  const length=d.muzzleZ-gz;
  KIT.buildGun(P,{len:length,r:.0795,baseR:.175,sleeve:false,evac:null});
  const add=(geometry:THREE.BufferGeometry,x:number,y:number,z:number) =>
    P.add('gun',geometry,x-gx,y-gy,z-gz);
  const breech:Station[]=[[-.062,.246,2.025,2.085],[.002,.246,1.75,2.188],
    [.05,.246,1.639,2.072],[.15,.246,1.64,2.00],
    [.55,.246,1.64,2.03],[.65,.295,1.64,2.14],[.96,.295,1.627,2.20],
    [1.055,.295,1.64,2.173]];
  P.add('gun',sectionSolid(breech.map(([z,half,bottom,top])=>({z:z-gz,
    ring:[[-half+.024-gx,bottom-gy],[half+.024-gx,bottom-gy],
      [half+.024-gx,top-gy],[-half+.024-gx,top-gy]]}))));
  add(cylZ(.174,1.60,28),.024,1.997,1.47);
  P.add('gunMount',cylX(.224,.70,28),.048-gx,2.017-gy,1.659-gz);
  for(const x of [-.194,.292]) add(cylZ(.043,.58,16),x,1.885,1.306);
  add(cylZ(.169,.22,28),.024,1.997,2.355);
  add(cylZ(.1484,.060,28,.169),.024,1.997,2.495);
  add(cylZ(.1484,.753,28),.024,1.997,2.9015);
  a5Evacuator(P,d);
  add(cylZ(.130,.075,28),.024,1.997,4.13);
  add(cylZ(.107,1.63,28),.024,1.997,5.015);
  add(cylZ(.094,.77,28),.024,1.997,5.69);
  // Original first-party folded mantlet loft, with the measured exposed top
  // descending toward the cannon sleeve; the cannon remains independently
  // visible below it in the shallow air channel.
  P.add('gunMount',sectionSolid([
    {z:1.80-gz,ring:[[-.17-gx,2.23-gy],[.09-gx,2.23-gy],[.09-gx,2.48-gy],[-.17-gx,2.48-gy]]},
    {z:1.85-gz,ring:[[-.17-gx,2.23-gy],[.09-gx,2.23-gy],[.09-gx,2.51-gy],[-.17-gx,2.51-gy]]},
    {z:2.00-gz,ring:[[-.15-gx,2.19-gy],[.12-gx,2.19-gy],[.12-gx,2.489-gy],[-.15-gx,2.489-gy]]},
    {z:2.10-gz,ring:[[-.15-gx,2.19-gy],[.12-gx,2.19-gy],[.12-gx,2.489-gy],[-.15-gx,2.489-gy]]},
    {z:2.15-gz,ring:[[-.15-gx,2.16-gy],[.12-gx,2.16-gy],[.12-gx,2.375-gy],[-.15-gx,2.375-gy]]},
    {z:2.50-gz,ring:[[-.17-gx,2.13-gy],[.29-gx,2.13-gy],[.29-gx,2.345-gy],[-.17-gx,2.345-gy]]},
    {z:2.65-gz,ring:[[-.17-gx,2.10-gy],[.29-gx,2.10-gy],[.29-gx,2.331-gy],[-.17-gx,2.331-gy]]},
    {z:2.93-gz,ring:[[-.17-gx,2.06-gy],[.29-gx,2.06-gy],[.29-gx,2.184-gy],[-.17-gx,2.184-gy]]},
    {z:3.23-gz,ring:[[-.16-gx,2.04-gy],[.285-gx,2.04-gy],[.285-gx,2.14-gy],[-.16-gx,2.14-gy]]},
  ]));
  for(const x of [-.157,.277]) P.add('gunMount',sectionSolid([
    {z:1.90-gz,ring:[[x-.013-gx,1.70-gy],[x+.013-gx,1.70-gy],[x+.013-gx,2.34-gy],[x-.013-gx,2.34-gy]]},
    {z:2.37-gz,ring:[[x-.013-gx,1.828-gy],[x+.013-gx,1.828-gy],[x+.013-gx,2.34-gy],[x-.013-gx,2.34-gy]]},
  ]));
  P.add('gunDark',cylZ(.069,.014,28),0,0,length+.001);
  P.add('gun',torus(.075,.0075,28,6),0,0,length+.007,Math.PI/2);
  // Two source-measured MRS housings project to the negative-X muzzle side.
  // The aft bracket and the wider forward box are distinct physical parts.
  add(box(.05922,.06232,.08931),-.0941,1.99791,5.92395);
  add(box(.08771,.06389,.06897),-.08363,1.99795,5.96821);
}

function a5Evacuator(P:TankBuilderPort,d:Datum): void {
  // Source radial section witnesses distinguish the narrow rear collar
  // from the eccentric evacuator. The generic centered cone began too far
  // aft, removing the lower collar and lifting the forward taper off bore.
  const rows=[
    [3.278,1.99475,.1328,.13285],[3.420,1.99475,.1328,.13285],
    [3.516,2.0366,.1781,.1767],[3.900,2.0365,.1781,.1766],
    [3.950,2.0256,.17555,.1657],[4.000,2.00075,.14515,.14085],
    [4.025,1.9948,.1322,.1322],[4.125,1.99475,.1307,.13175],
  ];
  const sections=rows.map(([z,y,rx,ry])=>({z:z-d.trunnion[2],
    ring:Array.from({length:32},(_,i)=>{
      const angle=i*Math.PI/16;
      return [.0238+rx*Math.cos(angle)-d.trunnion[0],
        y+ry*Math.sin(angle)-d.trunnion[1]] as [number,number];
    }),
  }));
  P.add('gun',sectionSolid(sections));
}

function fans(P: TankBuilderPort, y: number, z: number, radius = .51): void {
  for (const x of [-.54, .54]) {
    P.addEquipment('hullDark', cylY(radius, radius, .026, 36), x, y, z);
    P.addEquipment('hullDetail', torus(radius - .015, .021, 36, 7), x, y + .024, z);
    for (let i = -8; i <= 8; i++) {
      const off = i * radius / 9;
      const length = 2 * Math.sqrt(Math.max(0, (radius - .035) ** 2 - off ** 2));
      P.addEquipment('hullDetail', box(Math.max(.04, length), .012, .015), x, y + .028, z + off);
    }
  }
}

function bowFittings(P: TankBuilderPort, y: number, z: number, spareTracks: boolean): void {
  for (const side of [-1, 1]) {
    P.addEquipment('hullDark', box(.35, .17, .09), side * 1.22, y, z);
    P.addEquipment('hullGlass', box(.22, .085, .014), side * 1.22, y + .018, z + .05);
    P.addEquipment('hullDetail', box(.41, .025, .18), side * 1.22, y + .108, z - .008);
    for (const x of [1.04, 1.4]) P.addEquipment('hullDetail', cylY(.012, .012, .15, 8), side * x, y + .057, z + .085);
    P.addEquipment('hullDark', cylZ(.092, .12, 12), side * .82, y - .07, z + .06);
    P.addEquipment('hullDetail', torus(.072, .026, 12, 6), side * .82, y - .065, z + .12, Math.PI / 2);
    if (spareTracks) for (let i = 0; i < 3; i++) {
      const x = side * (.15 + i * .18);
      P.addEquipment('hullDark', box(.16, .027, .36), x, y + .105, z - .11, -.20);
      P.addEquipment('hullDetail', box(.12, .044, .12), x, y + .135, z - .11, -.20);
      P.addEquipment('hullDetail', cylX(.018, .19, 8), x, y + .125, z + .04);
    }
  }
}

function sternFittings(P: TankBuilderPort, y: number, z: number, half: number): void {
  P.add('hull', box(1.9, .48, .24), 0, y - .37, z + .09);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDark', box(.60, .24, .04), side * (half - .38), y - .05, z - .055);
    for (let i = 0; i < 7; i++) P.addEquipment('hullDetail', box(.53, .014, .024), side * (half - .38), y - .14 + i * .029, z - .084);
    P.addEquipment('hullDark', cylZ(.078, .035, 12), side * .84, y - .40, z - .07);
    P.addEquipment('hullDetail', torus(.07, .022, 12, 6), side * .85, y - .50, z - .09, Math.PI / 2);
    P.addEquipment('hullDetail', box(.19, .083, .052), side * (half - .16), y + .09, z - .04);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * .85, y - .48, z - .11),
      new THREE.Vector3(side * .30, y - .37, z - .13),
      new THREE.Vector3(-side * .65, y - .02, z - .12),
    ]);
    P.addEquipment('hullDark', new THREE.TubeGeometry(curve, 12, .016, 6, false));
  }
}

/** Measured recovery rope only. Its exterior loop is not armored interior;
 * keep the actual tube visible and subject to running-gear clearance. */
function recoveryCable(P:TankBuilderPort,name:string,path:THREE.CatmullRomCurve3,
  segments:number,radius=.018): void {
  const geometry=new THREE.TubeGeometry(path,segments,radius,7,false);
  const mesh=new THREE.Mesh(geometry,P.mats.detail);
  mesh.name=name;
  mesh.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment',
    continuityRole:'open-lattice',sourceEquipment:'recovery-cable'};
  mesh.castShadow=mesh.receiveShadow=true;
  P.disposables.push(geometry);
  P.hullG.add(mesh);
}

function driver(P: TankBuilderPort, y: number, x: number, z: number): void {
  P.addHatch('hull', box(.66, .027, .58), x, y + .011, z);
  for (let i = -1; i <= 1; i++) {
    P.addEquipment('hullDark', box(.145, .085, .12), x + i * .165, y + .07, z + .18);
    P.addEquipment('hullGlass', box(.114, .043, .009), x + i * .165, y + .08, z + .245);
  }
  P.addEquipment('hullDetail', box(.18, .028, .035), x, y + .041, z - .06);
}

function roofHatch(P: TankBuilderPort, d: Datum, x: number, y: number, z: number, r = .32): void {
  equip(P, d, 'turretDark', cylY(r + .027, r + .027, .025, 28), x, y + .012, z);
  P.addHatch('turretHatch', cylY(r, r, .032, 28), x - d.turretPivot[0], y + .039 - d.turretPivot[1], z - d.turretPivot[2]);
  equip(P, d, 'turretDetail', box(.16, .034, .035), x, y + .074, z);
  equip(P, d, 'turretDetail', box(.24, .040, .083), x, y + .041, z - r + .025);
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * .42;
    equip(P, d, 'turretDark', box(.12, .055, .075), x + Math.sin(a) * (r + .09), y + .055, z + Math.cos(a) * (r + .09), 0, a);
    equip(P, d, 'turretGlass', box(.091, .024, .008), x + Math.sin(a) * (r + .133), y + .063, z + Math.cos(a) * (r + .133), 0, a);
  }
}

function panorama(P: TankBuilderPort, d: Datum, x: number, y: number, z: number): void {
  equip(P, d, 'turretDetail', cylY(.215, .235, .17, 24), x, y + .085, z);
  equip(P, d, 'turretDetail', box(.34, .25, .34), x, y + .286, z);
  equip(P, d, 'turretDark', box(.245, .17, .022), x, y + .30, z + .18);
  equip(P, d, 'turretGlass', box(.19, .119, .01), x, y + .307, z + .196);
  equip(P, d, 'turretDetail', box(.39, .024, .39), x, y + .42, z);
}

function sightHousing(P: TankBuilderPort, d: Datum, x: number, bottom: number,
  z: number, width: number, height: number): void {
  equip(P,d,'turretDetail',box(width,height,.31),x,bottom+height/2,z);
  equip(P,d,'turretDark',box(width-.055,height-.045,.022),x,bottom+height/2,z+.165);
  equip(P,d,'turretGlass',box(width-.115,height-.105,.010),x,bottom+height/2,z+.182);
  equip(P,d,'turretDetail',box(width+.035,.026,.38),x,bottom+height+.009,z+.015);
}

function mast(P: TankBuilderPort, d: Datum, x: number, y: number, z: number, top: number,
  rake = 0, topR = .009, bottomR = .014): void {
  equip(P, d, 'turretDetail', cylY(.053, .068, .13, 12), x, y + .062, z);
  equip(P, d, 'turretDark', cylY(topR, bottomR, top-y-.11, 8), x, (top+y+.11)/2, z - rake/2, -Math.atan2(rake, top-y));
}

function mg(P: TankBuilderPort, d: Datum, x: number, y: number, z: number, remote = false,
  lengthScale = 1, heightScale = 1): void {
  equip(P, d, 'turretDetail', cylY(.12, .15, remote ? .23 : .105, 20), x, y + (remote ? .11 : .05), z);
  const weapon = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: .76,
    tone: 'two-tone', elev: 0, ammo: true, shield: false, ring: false, seed: 260905 });
  weapon.name = `${P.spec.id}RoofMachineGun`;
  weapon.scale.set(1,heightScale,lengthScale);
  weapon.position.set(x-d.turretPivot[0], y+(remote ? .22 : .08)-d.turretPivot[1], z-d.turretPivot[2]);
  P.turretG.add(weapon);
  if (remote) {
    equip(P, d, 'turretDetail', box(.25, .19, .27), x - .29, y + .30, z);
    equip(P, d, 'turretDark', box(.18, .14, .024), x - .29, y + .31, z + .145);
    equip(P, d, 'turretGlass', box(.115, .086, .01), x - .29, y + .31, z + .163);
  }
}

function smokeBank(P: TankBuilderPort, d: Datum, side: number, x: number, y: number, z: number, count = 8): void {
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    const zz = z + (col - 1.5) * .18 + row * .13;
    const yy = y + row * .17;
    equip(P, d, 'turretDark', box(.10, .12, .13), side * (x - .045), yy - .045, zz);
    equip(P, d, 'turretDetail', cylZ(.043, .22, 12), side * x, yy, zz, -.48, side * 1.00);
    equip(P, d, 'turretDark', cylZ(.034, .012, 12), side * (x + .084), yy + .052, zz + .050, -.48, side * 1.00);
  }
}

type PlanPoint = readonly [x:number,z:number];

/** First-party panel seams are physically seated on the authored carrier.
 * The hand-planned corner stations describe removable plates, not source
 * vertices. Sampling the carrier keeps each thin rim and bolt attached when
 * its surrounding armor slope is refined. No plane spans an optic opening. */
function surfacePanel(P:TankBuilderPort,d:Datum,owner:'hull'|'turret',corners:readonly PlanPoint[],reactive=false): void {
  const offset=owner==='turret'?new THREE.Vector3(...d.turretPivot):new THREE.Vector3();
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const carriers:THREE.Mesh[]=[];
  P.forEachBucketPart([owner,`${owner}ExternalArmor`],geometry=>carriers.push(new THREE.Mesh(geometry,material)));
  const cast=new THREE.Raycaster();
  const project=(x:number,z:number):THREE.Vector3|null=>{
    cast.set(new THREE.Vector3(x-offset.x,8,z-offset.z),new THREE.Vector3(0,-1,0));
    const hit=cast.intersectObjects(carriers,false)[0];
    return hit?hit.point.clone().add(new THREE.Vector3(0,.008,0)):null;
  };
  for(let edge=0;edge<corners.length;edge++) {
    const a=corners[edge],b=corners[(edge+1)%corners.length];
    const path:THREE.Vector3[]=[];
    for(let i=0;i<=8;i++) {
      const p=project(a[0]+(b[0]-a[0])*i/8,a[1]+(b[1]-a[1])*i/8);
      if(p)path.push(p);
    }
    if(path.length!==9)continue;
    const seam=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),12,.0045,5,false);
    P.addEquipment(`${owner}Dark`,reactive?markEraFurniture(seam):seam);
    for(const i of [1,4,7]) {
      const p=path[i];
      const bolt=cylY(.017,.019,.013,6);
      P.addEquipment(`${owner}Detail`,reactive?markEraFurniture(bolt):bolt,p.x,p.y+.002,p.z);
    }
  }
  material.dispose();
}

function roofPlateEdges(P:TankBuilderPort,d:Datum,front:number,rear:number,eraPrefix?:string): void {
  // Positive cheek's broad top cover, the narrow opposite outer cheek, and
  // two accessible roof lids. The EMES approach at negative X is untouched.
  const right:PlanPoint[]=[[.25,rear],[1.04,rear+.08],[.66,front],[.29,front+.05]];
  const left:PlanPoint[]=[[-1.24,rear],[-1.11,rear+.04],[-1.10,front-.43],[-1.22,front-.48]];
  if(eraPrefix) {
    bindPartitionedEraCover(P,'turret',`${eraPrefix}_R`,right);
    bindPartitionedEraCover(P,'turret',`${eraPrefix}_L`,left);
    P.destructibleCluster(`${eraPrefix}_R`,()=>surfacePanel(P,d,'turret',right,true));
    P.destructibleCluster(`${eraPrefix}_L`,()=>surfacePanel(P,d,'turret',left,true));
  } else {
    surfacePanel(P,d,'turret',right);
    surfacePanel(P,d,'turret',left);
  }
  for(const side of [-1,1]) surfacePanel(P,d,'turret',[
    [side*.95,-1.55],[side*.39,-1.55],[side*.39,-.68],[side*.95,-.68],
  ]);
}

function hullDeckEdges(P:TankBuilderPort,d:Datum,eraName?:string): void {
  const cover:PlanPoint[]=[[-.88,2.03],[.85,2.03],[.88,3.14],[-.88,3.14]];
  if(eraName) {
    bindPartitionedEraCover(P,'hull',eraName,cover);
    P.destructibleCluster(eraName,()=>surfacePanel(P,d,'hull',cover,true));
  } else surfacePanel(P,d,'hull',cover);
  for(const side of [-1,1]) surfacePanel(P,d,'hull',[
    [side*1.05,-3.27],[side*1.54,-3.27],[side*1.54,-1.74],[side*1.05,-1.74],
  ]);
}

function skirt(P: TankBuilderPort, side: number, rear: number, front: number,
  x: number, inner: number, bottom: number, rearTop: number, frontTop = rearTop): void {
  P.add('hull', orientedSlab(
    [side*inner,bottom,rear], [side*x,bottom,rear], [side*x,bottom,front], [side*inner,bottom,front],
    [side*inner,rearTop,rear], [side*x,rearTop-.09,rear], [side*x,frontTop-.09,front], [side*inner,frontTop,front],
  ));
  for (const z of [rear+.11, front-.11]) {
    const y = rearTop + (frontTop-rearTop)*(z-rear)/(front-rear) - .15;
    P.addEquipment('hullDetail', box(.022,.051,.13), side*(x+.012), y, z);
    P.addEquipment('hullDark', cylX(.015,.018,8), side*(x+.029), y, z);
  }
}

function a7Skirts(P: TankBuilderPort): void {
  // Narrow hanging rear panels and stepped forward AMAP modules are not a
  // uniform four-metre-wide box. These broad dimensions precede rendering.
  const rear=[-3.665,-2.791,-1.939,-1.081,-.219,.642,1.497];
  const outer=[1.933,1.899,1.878,1.951,1.882,1.878];
  const bottom=[1.253,.997,.985,.970,.957,.945];
  const top=[1.478,1.465,1.451,1.441,1.426,1.411];
  const front=[1.50,2.08,2.71,3.305];
  const cap=[1.783,1.700,1.580,1.575];
  for(const side of [-1,1]) {
    for(let i=0;i<6;i++) {
      skirt(P,side,rear[i],rear[i+1]-.012,outer[i],1.855,bottom[i],top[i]+.09);
    }
    P.add('hull',box(.025,.10,5.16),side*1.868,1.54,-1.08);
    for(let i=0;i<3;i++) {
      skirt(P,side,front[i],front[i+1]-.012,1.967,1.855,.922-i*.006,1.54-i*.009);
      skirt(P,side,front[i],front[i+1]-.012,1.912,1.855,1.44-i*.009,cap[i],cap[i+1]);
    }
    a7TerminalSkirt(P,side);
    P.add('hull',box(.30,.39,1.49),side*1.71,1.76,-3.06);
    P.addMudguard('a7v-x-front-flap','hullRubber',box(.62,.17,.045),side*1.49,1.08,3.79,-.14);
    P.addMudguard('a7v-x-rear-flap','hullRubber',box(.63,.50,.045),side*1.48,.76,-3.86,.10);
  }
}

function a7TerminalSkirt(P:TankBuilderPort,side:number): void {
  // The source has a fourth terminal module ahead of the three long lower
  // panels. Its outboard face tapers in plan and its lower edge rises.
  const sections:SolidSection[]=[];
  // A 38 mm relief on the hidden inner return clears the unchanged native
  // belt. The exposed source face and tapered outer silhouette stay fixed.
  for(const [z,inner,outer,bottom,top] of [
    [3.302,1.838,2.0,.909,1.421],[3.405,1.838,2.0,.914,1.420],
    [3.58,1.838,1.863,1.030,1.387],[3.61,1.813,1.839,1.050,1.381],
    [3.642,1.8004,1.814,1.071,1.375],[3.644,1.8004,1.807,1.20,1.375],
  ]) {
    const ring:[number,number][]=[
      [side*inner,bottom],[side*outer,bottom],[side*outer,top],[side*inner,top],
    ];
    if(side<0)ring.reverse();
    sections.push({z,ring});
  }
  P.add('hull',sectionSolid(sections));
}

function a6HullCage(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    for(let i=0;i<7;i++) skirt(P,side,-3.65+i*1.01,-2.66+i*1.01,1.805,1.68,
      i<2?1.0:.92,1.68,i===6?1.41:1.68);
    for(let i=0;i<8;i++) {
      const z=-3.90+i*1.00;
      P.addEquipment('hullOpenLattice',box(.035,.93,.035),side*1.972,1.44,z);
      P.addEquipment('hullOpenLatticeDark',box(.26,.035,.044),side*1.86,1.64,z);
    }
    for(let j=0;j<13;j++) P.addEquipment('hullOpenLattice',box(.027,.018,7.05),side*1.972,.983+j*.071,-.38);
    P.addMudguard('a6m-x-rear-flap','hullRubber',box(.55,.48,.045),side*1.34,.72,-3.69);
  }
  for(let j=0;j<13;j++) P.addEquipment('hullOpenLattice',box(3.96,.018,.027),0,.983+j*.071,-3.93);
  for(const x of [-1.96,-.66,.66,1.96]) P.addEquipment('hullOpenLattice',box(.036,.94,.036),x,1.445,-3.93);
}

function a5Skirts(P: TankBuilderPort): void {
  for(const side of [-1,1]) {
    for(const [rear,front,bottom,top] of [
      [1.493,2.274,.896,1.343],[2.274,2.877,.814,1.343],
      [2.877,3.483,.896,1.343],[3.483,3.793,.905,1.432],
    ]) P.add('hull',box(.139,top-bottom,front-rear-.010),side*1.8055,(top+bottom)/2,(front+rear)/2);
    for(const [rear,front,top] of [[1.672,2.269,1.684],[2.277,2.875,1.610],[2.881,3.478,1.509]]) {
      P.add('hull',orientedSlab(
        [side*1.738,1.344,rear],[side*1.779,1.344,rear],[side*1.779,1.344,front],[side*1.738,1.344,front],
        [side*1.738,top,rear],[side*1.779,top-.06,rear],[side*1.779,top-.12,front],[side*1.738,top-.06,front],
      ));
    }
    const rear=[-3.49,-2.65,-1.77,-.91,-.05,.81,1.50];
    for(let i=0;i<rear.length-1;i++) {
      const hem=i===0?1.10:i%2===0?.88:.70;
      P.add('hull',box(.016,1.308-hem,rear[i+1]-rear[i]-.014),side*1.729,(1.308+hem)/2,(rear[i]+rear[i+1])/2);
      for(const z of [rear[i]+.10,rear[i+1]-.10]) P.addEquipment('hullDetail',box(.012,.033,.09),side*1.729,1.28,z);
    }
    P.add('hull',box(.12,.10,5.21),side*1.66,1.515,-.94);
    a5FrontGuard(P,side);
    P.addMudguard('a5-x-rear-flap','hullRubber',box(.60,.45,.045),side*1.371,.85,-3.53);
    a5BowTowEye(P,side);
    P.addEquipment('hullDetail',box(.10,.11,.08),side*.646,1.207,3.74);
  }
}

function a5BowTowEye(P:TankBuilderPort,side:number): void {
  // KIT torus starts in XZ. The forged shackle stands in YZ, not flat
  // across the plan view; its source opening is transverse to the hull.
  const geometry=torus(.082,.018,20,8).scale(1,2.74,1);
  const mesh=new THREE.Mesh(geometry,P.mats.detail);
  mesh.name=`leo2a5_xBowTowEye_${side}`;
  mesh.position.set(side*.646,1.151,3.855);mesh.rotation.z=Math.PI/2;
  mesh.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment'};
  mesh.castShadow=mesh.receiveShadow=true;
  P.disposables.push(geometry);P.hullG.add(mesh);
}

function a5FrontGuard(P:TankBuilderPort,side:number): void {
  const sections:SolidSection[]=[];
  for(const [z,bottom,top,drop] of [
    [3.790,1.280,1.288,0],[3.823,1.295,1.314,0],
    [3.850,1.288,1.304,0],[3.954,1.107,1.140,.030],
  ]) {
    const ring:[number,number][]=[
      [side*1.001,bottom],[side*1.705,bottom-drop],[side*1.705,top-drop],[side*1.001,top],
    ];
    if(side<0)ring.reverse();
    sections.push({z,ring});
  }
  P.addMudguard('a5-x-front-flap','hullRubber',sectionSolid(sections));
  for(const x of [1.027,1.682]) P.addEquipment('hullDetail',box(.052,.092,.085),
    side*x,1.316,3.790);
}

function a5Stern(P:TankBuilderPort): void {
  // The source's wide louvres and two recovery cables are separate from the
  // main hull island. Their rear envelope must not become a solid apron.
  P.addEquipment('hullDark',box(3.23,.438,.036),0,1.547,-3.615,-.17);
  for(let i=0;i<12;i++) P.addEquipment('hullDetail',box(3.205+i*.00655,.023,.048),
    0,1.745-i*.03617,-3.656+i*.00615,-.42);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.16,.075,.036),side*1.37,1.64,-3.661);
    P.addEquipment('hullDetail',torus(.062,.020,14,6),side*.49,.856,-3.521,Math.PI/2);
    P.addEquipment('hullDetail',box(.09,.075,.11),side*.49,.887,-3.473);
    const path=new THREE.CatmullRomCurve3([
      new THREE.Vector3(side*1.525,1.744,-1.744),
      new THREE.Vector3(side*1.629,1.77,-2.49),
      new THREE.Vector3(side*1.61,1.806,-3.03),
      new THREE.Vector3(side*1.409,1.826,-3.576),
      new THREE.Vector3(side*1.304,1.616,-3.838),
      new THREE.Vector3(side*1.064,1.346,-3.743),
      new THREE.Vector3(side*.815,1.240,-3.636),
      new THREE.Vector3(side*.69,1.227,-3.620),
      new THREE.Vector3(side*.25,1.136,-3.580),
      new THREE.Vector3(-side*.26,.960,-3.550),
      new THREE.Vector3(-side*.46,.819,-3.535),
      new THREE.Vector3(-side*.49,.845,-3.499),
    ]);
    recoveryCable(P,`leo2a5_xRecoveryCable_${side}`,path,56);
  }
}

function a5InnerSuspension(P:TankBuilderPort): void {
  // Source x_root_107 contains separate inboard torsion/crank housings;
  // the .553 m armored keel itself must not be lowered to their .419 m feet.
  for(const side of [-1,1]) for(const z of [-1.77,-.92,-.084,.76,1.532,2.319]) {
    P.addEquipment('hullDetail',cylX(.1759,.304,18),side*.8249,.5951,z);
    P.addEquipment('hullDetail',box(.070,.18,.39),side*.992,.677,z+.135);
    P.addEquipment('hullDark',cylX(.1425,.04,18),side*1.005,.5806,z-.085);
  }
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',cylX(.166,.28,18),side*.844,.6383,3.04);
    P.addEquipment('hullDetail',box(.062,.20,.27),side*.989,.758,3.16);
  }
}

function a5HullShell(P:TankBuilderPort): void {
  const stations:Station[]=[[-3.6927,1.612,1.742,1.755],
    [-3.31677,1.704,.96975,1.78672],[-2.94279,1.704,.55806,1.76938],
    [-.64,1.704,.556,1.665],[1.74,1.704,.553,1.661],
    [2.78,1.704,.553,1.5003],[3.20,1.704,.6442,1.44445],
    [3.30,1.015,.6598,1.42939],[3.40,1.015,.7122,1.38614],
    [3.55,1.015,.8291,1.27006],[3.70,1.015,.9465,1.15456],
    [3.7907,1.015,1.029,1.084]];
  P.add('hull',sectionSolid(stations.map(s=>tub(s,1.48))));
  // Forward fenders are thin sheets over exterior air, not the maximum
  // width of a solid central nose. Their source skin stays near Y1.34 as
  // the narrower center glacis descends toward Y1.09 at its lip.
  for(const side of [-1,1]) {
    const rows=[[3.195,1.3411,1.3587],[3.40,1.3411,1.3556],
      [3.55,1.3283,1.3451],[3.70,1.3151,1.3337],[3.7907,1.302,1.330]];
    const sections=rows.map(([z,bottom,top])=>{
      const ring:[number,number][]=[[side*1.001,bottom],[side*1.704,bottom],
        [side*1.704,top],[side*1.001,top]];
      if(side<0)ring.reverse();
      return {z,ring};
    });
    P.add('hull',sectionSolid(sections));
  }
}

function a5BowSpare(P:TankBuilderPort,x:number,y:number,z:number): void {
  const slope=.637;
  P.addEquipment('hullDetail',box(.1207,.018,.239),x,y-.0295,z-.012,slope);
  P.addEquipment('hullDark',box(.105,.025,.056),x,y+.012,z-.004,slope);
  for(const k of [-1,1]) {
    const along=k*.094;
    P.addEquipment('hullDetail',cylX(.014,.130,10),x,
      y-Math.sin(slope)*along,z+Math.cos(slope)*along);
  }
}

function a5BowFittings(P:TankBuilderPort): void {
  for(const side of [-1,1]) {
    for(const x of [.4055,.5355,.66645])a5BowSpare(P,side*x,1.3533,3.5042);
    a5BowSpare(P,side*.4055,1.2122,3.6926);
    // Source circular headlamp has a separate low mounting clevis and
    // forward glass face; it is not a raised generic rearward light box.
    P.addEquipment('hullDetail',box(.191,.045,.110),side*.8359,1.1753,3.7372);
    P.addEquipment('hullDark',cylZ(.093,.089,18),side*.8359,1.276,3.751);
    P.addEquipment('hullDetail',torus(.083,.012,18,6),side*.8359,1.276,3.797,Math.PI/2);
    P.addEquipment('hullGlass',cylZ(.077,.008,18),side*.8359,1.276,3.799);
    P.addEquipment('hullDetail',box(.126,.1512,.0764),side*1.5705,1.4092,3.648);
  }
}

function a7Stern(P:TankBuilderPort): void {
  // Full-width sloped louvre field and suspended recovery cables visible in
  // the source rear elevation, not a generic pair of low exhaust boxes.
  P.add('hull',box(3.50,.44,.075),0,1.738,-3.752,-.18);
  for(let i=0;i<11;i++) P.addEquipment('hullDetail',box(3.50,.024,.058),0,
    1.548+i*.0366,-3.723-i*.00696,-.18);
  for(const side of [-1,1]) {
    for(const x of [.527,1.223]) P.addEquipment('hullDark',box(.038,.425,.030),side*x,1.735,-3.787,-.18);
    P.addEquipment('hullDark',cylZ(.098,.08,16),side*1.219,1.353,-3.738);
    P.addEquipment('hullDetail',torus(.068,.025,14,6),side*.94,1.162,-3.754,Math.PI/2);
    const path=new THREE.CatmullRomCurve3([
      new THREE.Vector3(side*1.31,2.018,-3.076),
      new THREE.Vector3(side*1.31,2.018,-3.60),
      new THREE.Vector3(side*1.26,2.006,-3.83),
      new THREE.Vector3(side*1.08,1.45,-3.966),
      new THREE.Vector3(side*.91,1.01,-3.815),
      new THREE.Vector3(side*.88,1.00,-3.67),
      new THREE.Vector3(side*.99,1.20,-3.57),
    ]);
    recoveryCable(P,`leo2a7v_xRecoveryCable_${side}`,path,40);
  }
  P.addEquipment('hullDetail',box(.34,.16,.17),0,1.28,-3.69);
}

function a6Stern(P:TankBuilderPort): void {
  // Source Object_4 has one full-width raked louvre field and a narrow
  // returned top skin. The earlier pair of generic exhaust boxes omitted it.
  P.addEquipment('hullDark',orientedSlab(
    [-1.646,1.3713,-3.7242],[1.661,1.3713,-3.7242],[1.661,1.3713,-3.7134],[-1.646,1.3713,-3.7134],
    [-1.646,1.8474,-3.7626],[1.661,1.8474,-3.7626],[1.661,1.8474,-3.7497],[-1.646,1.8474,-3.7497],
  ));
  P.addEquipment('hullDetail',sectionSolid([
    {z:-3.803,ring:[[-1.646,1.80415],[1.661,1.80415],[1.661,1.82171],[-1.646,1.82171]]},
    {z:-3.760,ring:[[-1.646,1.80415],[1.661,1.80415],[1.661,1.84902],[-1.646,1.84902]]},
  ]));
  for(let i=0;i<12;i++)P.addEquipment('hullDetail',box(3.23-i*.0052,.023,.037),
    .00765,1.418+i*.0335,-3.745-i*.00275,-.38);
  for(const side of [-1,1]) {
    P.addEquipment('hullDark',cylZ(.127,.047,20),side*.844,1.197,-3.662);
    P.addEquipment('hullDetail',torus(.079,.023,18,7),side*.916,.840,-3.650,Math.PI/2);
    P.addEquipment('hullDetail',box(.083,.11,.10),side*.916,.928,-3.59);
    a6RecoveryCable(P,side);
  }
}

function a6RecoveryCable(P:TankBuilderPort,side:number): void {
  const centerX=.00765, zOffset=side>0?0:.02184;
  const path=new THREE.CatmullRomCurve3([
    new THREE.Vector3(centerX+side*1.462,1.792,-1.850),
    new THREE.Vector3(centerX+side*1.602,1.824,-2.48),
    new THREE.Vector3(centerX+side*1.602,1.8303,-2.65),
    new THREE.Vector3(centerX+side*1.602,1.844,-2.95),
    new THREE.Vector3(centerX+side*1.602,1.8555,-3.20),
    new THREE.Vector3(centerX+side*1.568,1.866,-3.456),
    new THREE.Vector3(centerX+side*1.445,1.870,-3.657),
    new THREE.Vector3(centerX+side*1.10,1.766,-3.843+zOffset),
    new THREE.Vector3(centerX+side*.610,1.438,-3.845+zOffset),
    new THREE.Vector3(centerX-side*.240,1.035,-3.750+zOffset),
    new THREE.Vector3(centerX-side*.567,.890,-3.645+zOffset),
    new THREE.Vector3(centerX-side*.890,.836,-3.628),
  ]);
  recoveryCable(P,`leo2a6m_xRecoveryCable_${side}`,path,56,.013);
}

function a6HullShell(P:TankBuilderPort): void {
  const stations:Station[]=[[-3.76,1.62,1.819,1.852],[-3.38,1.66,1.15,1.835],
    [-2.65,1.66,.64,1.803],[-.72,1.66,.63,1.72],[1.52,1.66,.63,1.72],
    [2.63,1.80,.63,1.58],[3.15,1.015,.73139,1.52003],
    [3.25,1.015,.78577,1.50842],[3.30,1.015,.82045,1.47173],
    [3.40,1.015,.8898,1.38043],[3.50,1.015,.95915,1.28914],
    [3.60,1.015,1.0285,1.19784],[3.70,1.01,1.084,1.10655],
    [3.705,1.01,1.088,1.102]];
  P.add('hull',sectionSolid(stations.map(s=>tub(s,1.45))));
  for(const side of [-1,1])a6FrontFender(P,side);
}

function a6FrontFender(P:TankBuilderPort,side:number): void {
  const plate=[[3.06,1.37176,1.47866],[3.40,1.37176,1.44419],
    [3.60,1.37176,1.42391],[3.70,1.37176,1.41376]];
  const flap=[[3.698,1.37176,1.41396],[3.75,1.33362,1.36963],
    [3.80,1.23945,1.27862],[3.85,1.16006,1.18459],[3.86,1.09879,1.133]];
  const sections=(rows:number[][]):SolidSection[]=>rows.map(([z,bottom,top])=>{
    const ring:[number,number][]=[[side*1.005,bottom],[side*1.665,bottom],
      [side*1.665,top],[side*1.005,top]];
    if(side<0)ring.reverse();
    return {z,ring};
  });
  P.add('hull',sectionSolid(sections(plate)));
  P.addMudguard('a6m-x-front-flap','hullRubber',sectionSolid(sections(flap)));
}

function a6BowSpare(P:TankBuilderPort,x:number,dy:number,dz:number): void {
  const rake=.7378;
  P.addEquipment('hullDetail',box(.10504,.0032,.268),x,1.4188+dy,3.36925+dz,rake);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.0198,.026,.237),x+side*.0648,1.415+dy,3.379+dz,rake);
    P.addEquipment('hullDetail',cylX(.019,.018,12),x+side*.0648,1.504+dy,3.285+dz);
    P.addEquipment('hullDetail',cylX(.019,.018,12),x+side*.0648,1.359+dy,3.444+dz);
  }
  P.addEquipment('hullDark',box(.077,.022,.038),x,1.454+dy,3.337+dz,rake);
}

function a6BowFittings(P:TankBuilderPort): void {
  for(const side of [-1,1]) {
    for(const x of [.39703,.5281,.66044])a6BowSpare(P,.00765+side*x,0,0);
    a6BowSpare(P,.00765+side*.39703,-.15465,.17012);
    const lampX=.00765+side*.82270;
    P.addEquipment('hullDetail',box(.12,.09,.10),lampX,1.300,3.520);
    P.addEquipment('hullDark',cylZ(.0952,.16797,22),lampX,1.34070,3.52656);
    P.addEquipment('hullDetail',torus(.084,.010,22,7),lampX,1.34070,3.6106,Math.PI/2);
    P.addEquipment('hullGlass',cylZ(.073,.005,22),lampX,1.34070,3.60809);
    // An open protective hoop follows the circular lamp, not a broad
    // raised opaque box. Its lower feet land on the true lamp carrier.
    P.addEquipment('hullDetail',torus(.106,.006,24,6),lampX,1.3407,3.629,Math.PI/2);
    P.addEquipment('hullDetail',box(.038,.140,.130),.00765+side*.597,1.220,3.56);
    P.addEquipment('hullDetail',torus(.073,.012,20,8).scale(1,3.3,1.15),
      .00765+side*.597,1.224,3.68,0,0,Math.PI/2);
  }
}

function a7BowSpare(P:TankBuilderPort,x:number,dy:number,dz:number): void {
  const rake=.688;
  P.addEquipment('hullDetail',box(.15488,.017,.258),x,1.3663+dy,3.4015+dz,rake);
  // Separate side webs and end pins give the real folded shoe its depth;
  // these are not broad rectangles pasted over the glacis.
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.01792,.043,.245),x+side*.06314,1.388+dy,3.419+dz,rake);
    P.addEquipment('hullDetail',cylX(.0287,.01792,12),x+side*.06314,1.466285+dy,3.342+dz);
    P.addEquipment('hullDetail',cylX(.0287,.01792,12),x+side*.06314,1.333155+dy,3.504+dz);
  }
  P.addEquipment('hullDark',box(.106,.021,.054),x,1.399+dy,3.420+dz,rake);
}

function a7BowFittings(P:TankBuilderPort): void {
  for(const side of [-1,1]) {
    for(const x of [.40916,.57280,.73085])a7BowSpare(P,side*x,0,0);
    a7BowSpare(P,side*.40916,-.15610,.190037);
    P.addEquipment('hullDetail',box(.06793,.07436,.0635),side*.911,1.17336,3.6338);
    P.addEquipment('hullDark',cylZ(.1065,.128,22),side*.911,1.2872,3.6187);
    P.addEquipment('hullDetail',torus(.095,.0115,22,7),side*.911,1.2872,3.6735,Math.PI/2);
    P.addEquipment('hullGlass',cylZ(.081,.007,22),side*.911,1.2872,3.68151);
    // The vertical towing eye is normal to X; its slender width must not
    // become a horizontal ring across the roof-continuity projection.
    P.addEquipment('hullDetail',torus(.064,.018,20,8).scale(1,1,1.50),
      side*.68697,1.22550,3.7324,0,0,Math.PI/2);
    P.addEquipment('hullDetail',box(.10,.116,.126),side*.638,1.202,3.633);
    P.addEquipment('hullDetail',cylX(.0323,.123,16),side*.6619,1.25188,3.6617);
  }
}

function a5CrewBasket(P: TankBuilderPort,d:Datum): void {
  // Source floor extrema fix an ellipse: retain transverse radius and Y,
  // correcting only the former circular contour's 10.4 mm axial overhang.
  const axialScale=.97573431/.986,centerZ=.66115932;
  const band=(bottom:number,top:number) => new THREE.LatheGeometry([
    new THREE.Vector2(.921,bottom),new THREE.Vector2(.986,bottom),
    new THREE.Vector2(.986,top),new THREE.Vector2(.921,top),
    new THREE.Vector2(.921,bottom),
  ],48).scale(1,1,axialScale);
  equip(P,d,'turretDetail',band(.84,1.025),0,0,centerZ);
  equip(P,d,'turretDetail',band(1.515,1.71),0,0,centerZ);
  equip(P,d,'turretDetail',cylY(.986,.986,.025,40).scale(1,1,axialScale),0,.8328,centerZ);
  for(let i=0;i<4;i++) {
    const start=Math.PI/8+i*Math.PI/2;
    const outline:THREE.Vector2[]=[];
    for(let j=0;j<=12;j++) {
      const a=start+j*Math.PI/48;
      outline.push(new THREE.Vector2(.986*Math.cos(a),.986*Math.sin(a)));
    }
    for(let j=12;j>=0;j--) {
      const a=start+j*Math.PI/48;
      outline.push(new THREE.Vector2(.921*Math.cos(a),.921*Math.sin(a)));
    }
    const wall=new THREE.ExtrudeGeometry(new THREE.Shape(outline),{depth:.49,steps:1,bevelEnabled:false});
    wall.rotateX(-Math.PI/2);
    wall.scale(1,1,axialScale);
    equip(P,d,'turretDetail',wall,0,1.025,centerZ);
  }
  // Open cardinal windows are real: the source carrier is not a solid drum.
  equip(P,d,'turretDetail',box(.019,1.10,1.35),-.298,1.418,.846);
  for(const [x,z] of [[-.575,.866],[.560,.217]]) {
    equip(P,d,'turretDetail',box(.38,.04,.29),x,1.309,z);
    equip(P,d,'turretDetail',box(.045,.43,.045),x,1.067,z);
  }
}

function a5ArrowheadWraps(P:TankBuilderPort,d:Datum): void {
  for(const side of [-1,1]) {
    const sections:SolidSection[]=[];
    for(const [z,inner,outer,bottom,top] of [
      [side>0?.32:.44,1.50,1.515,2.01,2.055],
      [.70,1.242,side>0?1.516:1.485,1.704,2.455],
      [1.67,1.238,1.430,1.704,2.365],
    ]) {
      const middle=2.028;
      const shoulder=inner+(outer-inner)*.42;
      const contour:[number,number][]=[
        [inner,bottom],[shoulder,bottom+(middle-bottom)*.63],[outer,middle],
        [shoulder,middle+(top-middle)*.27],[inner,top],
      ];
      const ring=contour.map(([x,y])=>[side*x-d.turretPivot[0],y-d.turretPivot[1]] as [number,number]);
      if(side<0)ring.reverse();
      sections.push({z:z-d.turretPivot[2],ring});
    }
    P.add('turret',sectionSolid(sections));
  }
}

function a5Optics(P:TankBuilderPort,d:Datum): void {
  // The source EMES is a long shallow housing. A short tall substitute
  // incorrectly removes the forward roof silhouette and obscures its frame.
  const [px,py,pz]=d.turretPivot;
  P.addEquipment('turretDetail',sectionSolid([
    {z:1.28-pz,ring:[[-.958-px,2.33-py],[-.456-px,2.33-py],[-.456-px,2.605-py],[-.958-px,2.605-py]]},
    {z:1.94-pz,ring:[[-.958-px,2.315-py],[-.456-px,2.315-py],[-.456-px,2.56-py],[-.958-px,2.56-py]]},
  ]));
  equip(P,d,'turretDark',box(.445,.195,.018),-.707,2.438,1.949);
  equip(P,d,'turretGlass',box(.364,.13,.010),-.707,2.438,1.962);
  equip(P,d,'turretDetail',box(.47,.020,.23),-.687,2.578,1.834);
  equip(P,d,'turretDetail',box(.023,.25,.21),-.49,2.45,2.025);
  a5Panorama(P,d);
  equip(P,d,'turretDetail',box(.394,.114,.127),-.630,2.675,.562);
  equip(P,d,'turretDark',box(.344,.084,.015),-.630,2.681,.631);
  equip(P,d,'turretGlass',box(.301,.051,.009),-.630,2.681,.643);
}

function a5Panorama(P:TankBuilderPort,d:Datum): void {
  // The .461 m round lower bearing stops at 2.799 m. The raised optical
  // head is only .273 m wide; a full-diameter top cap erases this step.
  equip(P,d,'turretDetail',cylY(.2304,.2304,.17186,32),-.27768,2.71286,-.37184);
  equip(P,d,'turretDetail',box(.2495,.2189,.2425),-.27822,2.9072,-.38895);
  for(const x of [-.4122,-.1432]) equip(P,d,'turretDetail',box(.004,.2005,.232),x,2.9133,-.4014);
  equip(P,d,'turretDetail',box(.273,.012,.252),-.2777,3.0106,-.391);
  equip(P,d,'turretDark',box(.213,.151,.008),-.2793,2.9146,-.2655);
  equip(P,d,'turretGlass',box(.176,.118,.004),-.2793,2.9146,-.2599);
  equip(P,d,'turretDetail',box(.295,.08597,.0586),-.27784,2.83142,-.5608);
}

function a5SmokeBanks(P:TankBuilderPort,d:Datum): void {
  // Upper tubes are rearward and nearly forward-facing; lower tubes sit
  // further out and forward. A generic stacked outboard bank is not this
  // source arrangement and makes the roof silhouette too wide.
  for(const [x,y,z,yaw] of [
    [1.289,2.279,-1.658,.03],[1.296,2.279,-1.441,.03],
    [1.303,2.278,-1.220,.03],[1.310,2.277,-.987,.03],
    [1.394,2.046,-1.192,.30],[1.368,2.049,-.821,.25],
    [1.353,2.049,-.615,.20],[1.367,2.049,-.392,.03],
    // The source's negative-X bank is staggered differently; mirroring the
    // positive bank creates a false long outboard shelf in the plan view.
    [-1.200,2.307,-1.646,-.055],[-1.230,2.302,-1.433,-.055],
    [-1.261,2.308,-1.217,-.055],[-1.293,2.308,-.979,-.055],
    [-1.325,2.071,-1.443,-.47],[-1.343,2.071,-1.215,-.47],
    [-1.355,2.073,-.850,-.39],[-1.375,2.074,-.629,-.30],
  ]) {
    equip(P,d,'turretDetail',cylZ(.044,.26,14),x,y,z,-.79,yaw);
    equip(P,d,'turretDark',cylZ(.034,.012,14),x+Math.sin(yaw)*.10,y+.097,z+.09,-.79,yaw);
    equip(P,d,'turretDetail',box(.11,.068,.13),x-Math.sign(x)*.014,y-.089,z-.031);
  }
}

function a5Whip(P:TankBuilderPort,d:Datum,x:number,yOffset:number,zOffset:number): void {
  const put=(geometry:THREE.BufferGeometry,y:number,z:number,rx=0) =>
    equip(P,d,'turretDetail',geometry,x,y+yOffset,z+zOffset,rx);
  // The two source bases differ: the right socket is farther forward,
  // while the left has a low stem followed by a separate round bearing.
  if(x>0) equip(P,d,'turretDetail',cylY(.0409,.0409,.09144,20),x,2.54463,-1.78797);
  else {
    put(cylY(.046,.046,.0807,16),2.53333,-1.82227);
    put(cylY(.049,.049,.03476,20),2.590465,-1.82227);
  }
  put(box(.034,.025,.112),2.603,-1.779);
  put(cylY(.01295,.01295,.13717,14),2.67516,-1.745,-.087);
  put(cylY(.0103,.0103,.11449,12),2.79641,-1.7547,-.06);
  put(torus(.015,.004,12,6),2.777,-1.763,Math.PI/2);
  equip(P,d,'turretDark',cylY(.00455,.00455,1.279,8),x,
    3.47994+yOffset,-1.81638+zOffset,-.088);
}

function a5RearClamps(P:TankBuilderPort,d:Datum): void {
  for(const x of [-.314,-.0515]) {
    equip(P,d,'turretDetail',box(.075,.48,.13),x,2.157,-2.711);
    equip(P,d,'turretDetail',box(.262,.060,.140),x,2.209,-2.759);
    equip(P,d,'turretDetail',cylZ(.025,.030,12),x,2.372,-2.821);
  }
  P.addHatch('turretHatch',box(.94,.026,.414),-.282-d.turretPivot[0],
    2.446-d.turretPivot[1],-2.537-d.turretPivot[2]);
}

function a7CurvedWhip(P:TankBuilderPort,d:Datum,x:number,bottom:number,top:number): void {
  // Independent horizontal ray sections fix the bow of the two whips;
  // their different lengths do not share one straight rake angle.
  const stations=x<0?[[bottom,-1.854],[3.4,-1.8626],[3.6,-1.8707],
    [4.2,-1.9191],[4.8,-1.9904],[top,-2.12]]:
    [[bottom,-1.854],[3.4,-1.8630],[3.6,-1.8726],
      [4.2,-1.9262],[4.8,-2.0092],[top,-2.12]];
  const points=stations.map(([y,z])=>new THREE.Vector3(0,y,z));
  const shaft=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.0167,8,false);
  shaft.scale(1.287,1,1);
  equip(P,d,'turretDark',shaft,x,0,0);
}

function a6Whip(P:TankBuilderPort,d:Datum,x:number): void {
  equip(P,d,'turretDetail',cylY(.0306,.0306,.0722,12),x,2.562,-1.87188);
  equip(P,d,'turretDark',cylY(.00348,.0171,.047,10),x,2.6215,-1.8716);
  equip(P,d,'turretDark',cylY(.00348,.00348,.74385,10),x,3.016925,-1.8716);
}

function a6RoofEquipment(P:TankBuilderPort,d:Datum): void {
  equip(P,d,'turretDetail',cylY(.2135,.2135,.06,28),-.2614,2.69,-.282);
  equip(P,d,'turretDetail',cylY(.195,.195,.1215,28),-.2614,2.757,-.282);
  a6PanoramaHead(P,d);
  // The 33.6 mm source island includes its foot; actual shaft rays measure
  // only 6.94 mm through Y 2.7–3.35. Do not extrude the foot up the whip.
  a6Whip(P,d,-.9885);
  a6Whip(P,d,1.0005);
  // This reference has an unarmed crew-hatch rail. Preserve it independently
  // of the low MG augmentation required by BUILD-STANDARD §B3 even when the
  // source is unarmed. The bearing sits directly on the measured roof skin.
  const rail=new THREE.Mesh(box(.324,.084,.066),P.mats.detail);
  rail.name='leo2a6m_xCrewHatchRail';
  rail.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment'};
  rail.position.set(-.5985-d.turretPivot[0],2.698-d.turretPivot[1],.5335-d.turretPivot[2]);
  P.turretG.add(rail);
  P.disposables.push(rail.geometry);
  a6LowHatchMG(P,d);
}

function a6PanoramaHead(P:TankBuilderPort,d:Datum): void {
  // The source head has a curved/chamfered rear crown and a shallow inset
  // optical pane. Its front glass is not a slab laid outside the housing.
  const rows=[[-.40863,2.866,2.953],[-.400,2.8643,2.97555],
    [-.385,2.8612,2.99083],[-.370,2.8582,2.99741],[-.170,2.8191,2.99831]];
  const sections=rows.map(([z,bottom,top])=>({z,ring:[
    [-.3749,bottom],[-.1479,bottom],[-.1479,top],[-.3749,top],
  ] as [number,number][]}));
  equip(P,d,'turretDetail',sectionSolid(sections),0,0,0);
  for(const x of [-.3644,-.1584])
    equip(P,d,'turretDetail',box(.021,.1805,.0215),x,2.90795,-.16415);
  for(const y of [2.8235,2.9906])
    equip(P,d,'turretDetail',box(.227,.0154,.0215),-.2614,y,-.16415);
  equip(P,d,'turretDark',box(.183,.138,.003),-.2614,2.91,-.16735);
  equip(P,d,'turretGlass',box(.139,.09,.004),-.2614,2.91,-.16485);
}

function a6LowHatchMG(P:TankBuilderPort,d:Datum): void {
  // Full, unscaled-height pintle seats directly on the hatch flank. The
  // source rail remains alongside the barrel, not pierced by it; there is
  // no added tall pedestal above the already complete pintle assembly.
  const weapon=FITTINGS.pintleMG({mats:P.mats,cls:'mag',scale:.76,
    tone:'two-tone',elev:0,ammo:true,shield:false,ring:false,seed:260905});
  weapon.name='leo2a6m_xRoofMachineGun';
  weapon.scale.set(1,1,1.75);
  weapon.position.set(-.80-d.turretPivot[0],2.546-d.turretPivot[1],.12-d.turretPivot[2]);
  P.turretG.add(weapon);
}

function a4RemoteMount(P:TankBuilderPort,d:Datum): void {
  equip(P,d,'turretDetail',cylY(.12,.16,.36,20),.743,2.62,-.926);
  // Source crossbar is a broad low cradle, separate from the tall weapon
  // cheeks and from the outboard receiver/ammunition body.
  equip(P,d,'turretDetail',box(.55891,.12256,.40355),.73998,2.7160,-.9222);
  for(const x of [.634,.854]) equip(P,d,'turretDetail',box(.024,.185,.266),x,2.868,-.929);
  mg(P,d,.766,2.79,-.969,false,1.713,.74);
  a4OutboardReceiver(P,d);
  equip(P,d,'turretDetail',box(.257,.184,.306),.381,3.005,-1.055);
  equip(P,d,'turretDark',box(.204,.138,.014),.381,3.005,-.897);
  equip(P,d,'turretGlass',box(.151,.091,.008),.381,3.005,-.884);
}

function a4OutboardReceiver(P:TankBuilderPort,d:Datum): void {
  equip(P,d,'turretDetail',box(.24246,.13465,.12096),1.00921,2.89435,-.89815);
  const cap=[[-.95863,0],[-.83767,.0001]].map(([z,dy])=>({z,
    ring:[[.88798,2.9614+dy],[1.13044,2.9622+dy],
      [1.13044,2.9663+dy],[.928,3.0397+dy],[.897,3.0398+dy],
      [.88798,3.0329+dy]] as [number,number][],
  }));
  equip(P,d,'turretDetail',sectionSolid(cap),0,0,0);
  // A small feed/yoke connection carries the outboard body from the low
  // measured cradle; it does not broaden the protected main MG receiver.
  equip(P,d,'turretDetail',box(.032,.101,.079),.902,2.817,-.914);
  equip(P,d,'turretDark',box(.126,.032,.085),.847,2.870,-.916);
}

function a7FrontalRack(P:TankBuilderPort,d:Datum): void {
  const trayRows=[[2.48247,2.44990,2.46519],[2.96793,2.59932,2.61461]];
  const tray=trayRows.map(([z,bottom,top])=>({z,
    ring:[[.3325,bottom],[1.26655,bottom],[1.26655,top],[.3325,top]] as [number,number][],
  }));
  equip(P,d,'turretDetail',sectionSolid(tray),0,0,0);
  for(const x of [.40,1.10])equip(P,d,'turretDetail',box(.030,.21,.047),x,2.390,2.492);
  const radius=.0480369,length=.2234353,rake=.27477,zScale=.92099385;
  const outline=new THREE.Shape();
  outline.absarc(0,0,radius,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.absarc(0,0,.0345,0,Math.PI*2,true);outline.holes.push(hole);
  const tube=new THREE.ExtrudeGeometry(outline,{depth:length,steps:1,curveSegments:20,bevelEnabled:false});
  tube.translate(0,0,-length/2);tube.rotateX(-rake);tube.scale(1,1,zScale);
  const backstop=new THREE.CircleGeometry(.0345,24);
  backstop.translate(0,0,-length/2+.014);backstop.rotateX(-rake);backstop.scale(1,1,zScale);
  P.disposables.push(tube,backstop);
  const rack=new THREE.Group();rack.name='leo2a7v_xFrontalRack';
  rack.position.set(-d.turretPivot[0],-d.turretPivot[1],-d.turretPivot[2]);
  for(const [count,xStart,y,z] of [[9,.4056825,2.5411375,2.56696],[8,.4551395,2.6222165,2.5459115]]) {
    for(let i=0;i<count;i++) {
      const casing=new THREE.Mesh(tube,P.mats.detail);
      casing.name=`leo2a7v_xFrontalTube_${count}_${i}`;
      casing.position.set(xStart+i*.100876,y,z);
      casing.userData={appearanceRole:'fittingPaint',combatHitboxRole:'equipment'};
      const rear=new THREE.Mesh(backstop,P.mats.dark);
      rear.position.copy(casing.position);
      rear.userData={appearanceRole:'fittingDark',combatHitboxRole:'equipment'};
      rack.add(casing,rear);
    }
  }
  P.turretG.add(rack);
}

function a4Whip(P:TankBuilderPort,d:Datum,x:number,dy:number,dz:number): void {
  equip(P,d,'turretDetail',cylY(.045,.049,.13,12),x,2.487+dy,-1.956+dz);
  const rise=1.829,rake=.3264;
  equip(P,d,'turretDark',cylY(.0008,.0155,Math.hypot(rise,rake),10),x,
    3.4645+dy,-2.1417+dz,-Math.atan2(rake,rise));
}

// A7V: separate authored tub, low broad asymmetric shell, deep actual EMES
// recess, full-height modules, and the source's two rear tall masts.
export function buildLeopard2A7VX(P: TankBuilderPort): void {
  const d = LEOPARD_X_DATUMS.leo2a7v_x;
  begin(P, d);
  const stations: Station[] = [
    [-3.86,1.80,1.955,2.00], [-3.47,1.80,1.22,1.994], [-3.08,1.80,.64,1.99],
    [-1.52,1.80,.61,1.967], [-.85,1.80,.60,1.819], [1.64,1.80,.575,1.785],
    [2.43,1.98,.56,1.628],[3.21,1.015,.68394,1.48155],
    [3.25,1.015,.71025,1.47377],[3.30,1.015,.74314,1.43897],
    [3.40,1.015,.85212,1.35682],[3.50,1.015,.96001,1.27468],
    [3.60,1.015,1.02578,1.19254],[3.70,1.01,1.079,1.1104],
    [3.715,1.01,1.085,1.098],
  ];
  P.add('hull', sectionSolid(stations.map((s) => tub(s, 1.51))));
  P.gear = KIT.buildRunningGear(P, { style:'rubber', wheelR:.375, wheelW:.37,
    wheelZs:[-2.38,-1.57,-.76,.05,.86,1.67,2.48], wheelY:.46, xc:1.48,
    trackW:.66, trackTh:.074, topY:1.32, botY:.105,
    sprocket:{z:-3.120,y:.9647,r:.3813}, idler:{z:3.247,y:.9063,r:.2785},
    paintedEnds:true, arms:true, coveredTop:true });
  a7Skirts(P);
  fans(P,2.018,-2.82,.54);
  driver(P,1.783,-.54,1.14);
  a7BowFittings(P);
  a7Stern(P);
  shell(P,d,[[-2.80,-1.11,1.25,2.092,2.235],[-2.49,-1.14,1.26,2.084,2.628],
    [-1.35,-1.30,1.29,2.057,2.658],[-.77,-1.38,1.30,2.01,2.672],
    [-.13,-1.43,1.30,1.778,2.674],[.75,-1.605,1.486,1.763,2.637],
    [1.65,-1.56,1.48,1.748,2.601]]);
  P.add('turret',cylY(1.02,1.02,.11,40),0,.023,0);
  opticPocket(P,d,{back:1.65,mouth:2.51,x0:-1.025,x1:-.60,
    floor:2.352,roof:2.61,outerLeft:-1.56,outerRight:1.48,bottom:1.75,sourceA7Cheek:true});
  shell(P,d,[[2.505,-1.13,1.16,1.91,2.340],[2.82,-.72,.77,2.016,2.286],
    [3.11,-.22,.29,2.146,2.181]]);
  roofHatch(P,d,-.61,2.675,-.35);
  roofHatch(P,d,.66,2.670,-.35);
  equip(P,d,'turretDetail',cylY(.20,.22,.16,24),-.301,2.74,-.433);
  panorama(P,d,-.301,2.817,-.433);
  sightHousing(P,d,-.785,2.362,1.47,.54,.42);
  equip(P,d,'turretDetail',cylY(.075,.10,.21,20),.965,2.81,-.15);
  mg(P,d,.965,2.91,-.15,false,2.10,.82);
  a7CurvedWhip(P,d,-1.00,3.113,5.56);
  a7CurvedWhip(P,d,1.055,3.119,5.35);
  for(const x of [-1.00,1.055]) equip(P,d,'turretDetail',cylY(.037,.055,.48,12),x,2.89,-1.84);
  // The OBJ places the real two-row rack in a hull-detail node; physical
  // ownership is the turret. Every tube has an actual recessed open mouth.
  a7FrontalRack(P,d);
  for(const side of [-1,1]) {
    smokeBank(P,d,side,1.46,2.38,-1.12,8);
    for(const z of [-2.4,-1.7]) equip(P,d,'turretDetail',box(.025,.11,.12),side*1.14,2.65,z);
  }
  roofPlateEdges(P,d,2.77,1.72);
  hullDeckEdges(P,d,'a7v_upper_glacis_era');
  mainGun(P,d,.096,true);
}

// A6M CAN: clean low tub and compact central turret. The cage is genuine
// stand-off equipment, not solid armor sheets or a second running-gear copy.
export function buildLeopard2A6MX(P: TankBuilderPort): void {
  const d=LEOPARD_X_DATUMS.leo2a6m_x;
  begin(P,d);
  a6HullShell(P);
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.3579,wheelW:.35,
    wheelZs:[-2.389,-1.592,-.804,.021,.828,1.625,2.422],wheelY:.4586,xc:1.339,
    trackW:.558,trackTh:.040,topY:1.29678,botY:.07031,
    trackShoeDimensions:{padHeight:.040,grouserHeight:.016,webHeight:.03363,hornHeight:.11086},
    sprocket:{z:-3.080,y:.9733,r:.3579,trackR:.2785},
    idler:{z:3.401,y:1.0108,r:.2627,trackR:.2410},
    // Source outer return/web planes are measured; these occluded support
    // stations are mechanical inference, not fabricated source mesh islands.
    rollers:[{z:-2.0,y:1.167,r:.105},{z:-.75,y:1.169,r:.105},
      {z:.50,y:1.172,r:.105},{z:1.80,y:1.175,r:.105}],
    returnRollerWidthM:.18,returnRollerInsetM:.03,
    paintedEnds:true,arms:true,coveredTop:true});
  a6HullCage(P);
  fans(P,1.853,-2.86,.48);
  driver(P,1.72,-.56,1.15);
  a6BowFittings(P);
  a6Stern(P);
  shell(P,d,[[-2.70,-1.14,1.15,1.948,1.979],[-2.39,-1.14,1.15,1.93,1.979],
    [-1.70,-1.14,1.16,1.908,2.546],
    [-.37,-1.27,1.283,1.869,2.546],[.34,-1.27,1.283,1.741,2.546],
    [.75,-1.27,1.283,1.741,2.536],[1.66,-1.27,1.283,1.741,2.459]]);
  P.add('turret',cylY(1.027,1.027,.16,40),0,.015,0);
  opticPocket(P,d,{back:1.64,mouth:2.43,x0:-1.04,x1:-.56,floor:2.15,
    roof:2.46,frontRoof:2.302,outerLeft:-1.27,outerRight:1.283,bottom:1.738});
  shell(P,d,[[2.42,-1.12,1.14,1.895,2.302],[2.95,-.60,.64,2.038,2.219],
    [3.28,-.20,.29,2.104,2.126]]);
  // Turret cage extends around the bustle but never closes its stand-off air.
  for(const side of [-1,1]) {
    for(let j=0;j<9;j++) equip(P,d,'turretOpenLattice',box(.025,.017,2.60),side*1.496,1.947+j*.074,-1.45);
    for(const z of [-2.75,-1.85,-.15]) {
      equip(P,d,'turretOpenLattice',box(.033,.70,.033),side*1.496,2.23,z);
      equip(P,d,'turretOpenLatticeDark',box(.34,.03,.04),side*1.35,2.45,z);
    }
    smokeBank(P,d,side,1.30,2.30,-.72,8);
  }
  for(let j=0;j<9;j++) equip(P,d,'turretOpenLattice',box(3.01,.017,.025),.006,1.947+j*.074,-2.78);
  for(const x of [-1.49,0,1.49]) equip(P,d,'turretOpenLattice',box(.033,.69,.033),x,2.23,-2.78);
  roofHatch(P,d,-.61,2.546,-.13);
  roofHatch(P,d,.66,2.546,-.13);
  sightHousing(P,d,-.78,2.20,1.44,.48,.37);
  a6RoofEquipment(P,d);
  roofPlateEdges(P,d,2.85,1.68,'a6m_turret_cheek_era');
  hullDeckEdges(P,d,'a6m_upper_glacis_era');
  mainGun(P,d,.090,true);
}

// A4M: full-width forward hull modules and the distinctive broad, low
// AMAP shell; the stern frame is intentionally left-offset, not a generic rack.
export function buildLeopard2A4MX(P: TankBuilderPort): void {
  const d=LEOPARD_X_DATUMS.leo2a4m_x;
  begin(P,d);
  const stations: Station[]=[[-3.83,1.60,1.67,1.70],[-3.44,1.675,1.23,1.79],
    [-3.06,1.675,.523,1.816],[-1.86,1.675,.525,1.778],[-1.14,1.70,.528,1.616],
    [-.77,1.85,.529,1.618],[1.60,1.85,.533,1.684],[2.75,1.85,.536,1.45],
    [3.44,1.82,.75,1.32],[3.86,1.018,.97,.994]];
  P.add('hull',sectionSolid(stations.map(s=>tub(s,1.40))));
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.3459,wheelW:.35,
    wheelZs:[-2.469,-1.693,-.846,-.054,.719,1.516,2.353],wheelY:.444,xc:1.352,
    trackW:.590,trackTh:.072,topY:1.242,botY:.106,
    sprocket:{z:-3.064,y:.874,r:.368},idler:{z:3.209,y:.846,r:.290},
    paintedEnds:true,arms:true,coveredTop:true});
  for(const side of [-1,1]) {
    for(let i=0;i<5;i++) skirt(P,side,-.79+i*.82,.012+i*.82,1.852,1.69,.87,
      i<3?1.68:1.68-(i-2)*.15,i<2?1.68:1.68-(i-1)*.15);
    for(let i=0;i<3;i++) skirt(P,side,-3.72+i*.97,-2.765+i*.97,1.72,1.687,1.00,1.69);
    P.addMudguard('a4m-x-front-flap','hullRubber',box(.57,.18,.045),side*1.36,1.07,3.73,-.11);
    P.addMudguard('a4m-x-rear-flap','hullRubber',box(.57,.43,.045),side*1.36,.75,-3.69,.07);
  }
  fans(P,1.833,-2.95,.51);
  driver(P,1.68,-.58,1.0);
  bowFittings(P,1.33,3.56,false);
  sternFittings(P,1.47,-3.79,1.65);
  shell(P,d,[[-2.82,-1.02,-.64,1.873,2.33],[-2.53,-1.05,.98,1.856,2.387],
    [-2.24,-1.405,1.33,1.842,2.437],[-1.36,-1.50,1.412,1.846,2.444],
    [-.78,-1.512,1.417,1.671,2.446],[.39,-1.519,1.408,1.674,2.448],
    [1.36,-1.496,1.374,1.675,2.374]]);
  P.add('turret',cylY(1.015,1.015,.11,40),0,.018,0);
  opticPocket(P,d,{back:1.355,mouth:2.28,x0:-1.10,x1:-.65,floor:2.12,
    roof:2.38,outerLeft:-1.497,outerRight:1.375,bottom:1.675});
  shell(P,d,[[2.27,-1.27,1.15,1.742,2.129],[2.70,-.76,.63,1.813,2.139],
    [3.02,.10,.16,1.978,1.997]]);
  roofHatch(P,d,-.62,2.448,-.24);
  roofHatch(P,d,.62,2.448,-.24);
  panorama(P,d,-.342,2.487,-.529);
  sightHousing(P,d,-.86,2.13,1.42,.48,.33);
  a4RemoteMount(P,d);
  a4Whip(P,d,-.954,0,0);
  a4Whip(P,d,.874,.0065,.0098);
  // Real left stern parapet with feet onto the bustle, not a floating deck.
  for(const z of [-2.73,-2.15]) equip(P,d,'turretDetail',box(.04,.22,.04),-.86,2.42,z);
  equip(P,d,'turretDetail',box(.04,.08,.63),-.86,2.565,-2.44);
  equip(P,d,'turretDetail',box(.82,.08,.04),-.45,2.565,-2.74);
  for(const side of [-1,1]) smokeBank(P,d,side,1.445,2.16,-1.25,8);
  roofPlateEdges(P,d,2.75,1.50);
  hullDeckEdges(P,d);
  mainGun(P,d,.079,false);
}

// A5: separately laid out basic armor tub and arrowhead modules, restrained
// thin rear skirts, clear frontal optic approach and L/44 instead of L/55.
export function buildLeopard2A5X(P: TankBuilderPort): void {
  const d=LEOPARD_X_DATUMS.leo2a5_x;
  begin(P,d);
  a5HullShell(P);
  P.gear=KIT.buildRunningGear(P,{style:'rubber',wheelR:.3516,wheelW:.34,
    wheelZs:[-2.25,-1.40,-.57,.28,1.06,1.86,2.70],wheelY:.44,xc:1.371,
    // Source flat-course rays: outer pad Y0, broad web to .08837, guide
    // tip .16344, return outer face1.31284. Rim and pitch radii differ.
    trackW:.648,trackTh:.0389,topY:1.24558,botY:.06726,
    trackShoeDimensions:{padHeight:.0389,grouserHeight:.01636,webHeight:.04948,
      hornHeight:.06464,pinRadius:.01636,pinCentreY:-.01945},
    shoeWidthScale:1.032,
    sprocket:{z:-2.91,y:.914,r:.360,trackR:.2712},idler:{z:3.46,y:.915,r:.273,trackR:.2471},
    paintedEnds:true,arms:true,coveredTop:true});
  a5Skirts(P);
  a5InnerSuspension(P);
  fans(P,1.811,-2.89,.514);
  driver(P,1.661,-.54,1.20);
  a5BowFittings(P);
  a5Stern(P);
  // Rear hull marker rod, present in the supplied x_root_107 node; unlike
  // the roof masts it stays on the hull when the turret turns.
  P.addEquipment('hullDetail',cylY(.018,.020,.062,12),-.085,1.87,-3.75);
  P.addEquipment('hullDetail',cylY(.0034,.0034,.49,8),-.085,2.135,-3.802,-.213);
  P.addEquipment('hullDetail',cylY(.009,.009,.019,10),-.085,2.37,-3.855);
  shell(P,d,[[-2.725,-.56,.21,2.35,2.405],[-2.64,-.56,.50,1.92,2.414],
    [-2.48,-.68,.76,1.92,2.431],
    [-1.72,-1.10,1.18,1.869,2.511],[-1.50,-1.16,1.225,1.866,2.519],
    [-.78,-1.24,1.245,1.72,2.519],[-.45,-1.28,1.26,1.679,2.519],
    [.40,-1.26,1.245,1.679,2.519],[1.64,-1.22,1.22,1.679,2.37]],.028,.045);
  P.add('turret',cylY(1.013,1.013,.12,40),0,.015,0);
  a5CrewBasket(P,d);
  a5ArrowheadWraps(P,d);
  a5SmokeBanks(P,d);
  a5RearClamps(P,d);
  opticPocket(P,d,{back:1.62,mouth:2.41,x0:-1.02,x1:-.55,floor:2.10,
    roof:2.39,frontRoof:2.235,outerLeft:-1.39,outerRight:1.39,bottom:1.704,
    cheekShoulder:2.06,mouthInset:.17,frontBottomRise:0});
  shell(P,d,[[2.40,-1.22,1.22,1.85,2.235],[2.90,-.70,.72,2.01,2.140],
    [3.23,-.19,.29,2.104,2.126]]);
  // Rear stowage and launchers remain separate from the faceted arrowheads.
  for(const side of [-1,1]) {
    const basketX=side>0?.994:-.911;
    equip(P,d,'turretDetail',box(.72,.53,.89),basketX,2.186,-2.337);
    equip(P,d,'turretDark',box(.67,.015,.84),basketX,2.457,-2.337);
  }
  for(const [x,z] of [[-.604,.070],[.589,.050]]) {
    P.add('turret',cylY(.37,.40,.049,32),x-d.turretPivot[0],2.543-d.turretPivot[1],z-d.turretPivot[2]);
    roofHatch(P,d,x,2.566,z);
  }
  a5Optics(P,d);
  mg(P,d,.954,2.612,-.161,false,1.92,1.077);
  equip(P,d,'turretDetail',box(.386,.036,.247),1.041,2.663,.013);
  equip(P,d,'turretDetail',box(.20,.13,.20),1.137,2.777,.030);
  equip(P,d,'turretDark',box(.20,.025,.22),1.137,2.854,.030);
  a5Whip(P,d,-.962,0,0);
  a5Whip(P,d,1.061,-.00646,-.05711);
  roofPlateEdges(P,d,2.84,1.73);
  hullDeckEdges(P,d);
  a5Gun(P,d);
  addLeopardA5XSourceDetails(P);
}

export const LEOPARD_X_PROFILES = Object.freeze({
  leo2a7v_x: { build: buildLeopard2A7VX },
  leo2a6m_x: { build: buildLeopard2A6MX },
  leo2a4m_x: { build: buildLeopard2A4MX },
  leo2a5_x: { build: buildLeopard2A5X },
});
