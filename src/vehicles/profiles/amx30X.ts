// Independent first-party AMX-30 B X. Source geometry is a private comparison
// instrument only. These are authored solids, not a donor or mesh conversion.
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import {roundedTrackContact} from './roundedTrackContact.ts';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { blindTube } from './measuredPrimitives.ts';
import { addAmx30XAftReturn } from './amx30XAftReturn.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
const YAW_Y = 1.584;
const YAW_Z = .285;
const GUN_X = -.011;
const GUN_Y = 1.87565;
const GUN_Z = 1.60;
export const AMX30_X_DATUMS = Object.freeze({
  dims: { hullLengthM: 6.30289, overallLengthM: 9.54869, widthM: 3.11322, heightM: 2.284 },
  turretPivot: [0, YAW_Y, YAW_Z] as const,
  trunnion: [GUN_X, GUN_Y, GUN_Z] as const,
  muzzleZ: 5.99439,
  overallHeightM: 3.42382,
  wheelStations: [-1.84635, -.86283, .07708, 1.15022, 2.09506] as const,
  // Pitch station is inferred at the rear mantlet seat, not a claimed source
  // rig origin. X/Y come from repeated forward tube circular cross-sections.
  jointBasis: 'cast-foot axis; inferred internal mantlet station; measured bore axis',
});

function equipment(P: TankBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  const turret = slot.startsWith('turret');
  P.addEquipment(slot, geometry, x, y - (turret ? YAW_Y : 0), z - (turret ? YAW_Z : 0), rx, ry, rz);
}

function hullSection(z: number, top: number, bottom: number, shoulder: number, roof: number): SolidSection {
  const rail = Math.max(bottom + .03, Math.min(1.285, top - .06));
  const bilge = bottom + Math.min(.225, (rail - bottom) * .8);
  return { z, ring: [
    [-.40, bottom], [.40, bottom], [.900, bilge], [.925, rail],
    [shoulder, rail + .015], [roof, top], [-roof, top],
    [-shoulder, rail + .015], [-.925, rail], [-.900, bilge],
  ] };
}

function hull(P: TankBuilderPort): void {
  P.add('hull', sectionSolid([
    hullSection(-3.151, 1.535, .657, .940, .910),
    hullSection(-2.99, 1.649, .610, .940, .910),
    hullSection(-2.19, 1.649, .433, .940, .910),
    hullSection(-1.79, 1.649, .433, 1.550, 1.300),
    hullSection(-1.06, 1.595, .433, 1.550, 1.300),
    hullSection(-.70, 1.584, .433, 1.550, 1.300),
    hullSection(.61, 1.584, .433, 1.550, 1.300),
    hullSection(1.36, 1.578, .433, 1.025, .900),
    hullSection(2.15, 1.367, .433, .940, .910),
    hullSection(2.89, 1.088, .555, .940, .910),
    hullSection(3.151, .964, .889, .940, .910),
  ]));
  // Stamped bilge service covers occupy their own short stations. The lower
  // edges remain near the keel, while their outer lips seat onto the inclined
  // belly; do not flatten the entire V-shaped tub to mimic these fittings.
  for (const s of [-1, 1]) for (const [aft, fore] of [[-2.430,-2.082],[-.737,-.139],[1.280,1.756]]) {
    const cross: [number,number][] = [[.384,.425],[.751,.429],[.890,.646],[.872,.653],[.376,.447]];
    const ring = s < 0 ? cross.map(([x,y])=>[-x,y] as [number,number]).reverse() : cross;
    P.add('hullDetail', sectionSolid([{z:aft,ring},{z:fore,ring}]));
  }
  for (const s of [-1, 1]) {
    const lip = (z: number, inner: number, outer: number, y: number): SolidSection => {
      const ring: [number, number][] = [[s * inner, y - .04], [s * outer, y - .04], [s * outer, y], [s * inner, y]];
      return { z, ring: s < 0 ? ring.reverse() : ring };
    };
    // Thin full-length guard rails connect the engine deck and front shoulder.
    // They are not full-height side armor: the five road wheels stay exposed.
    P.addMudguard('amx30-x-side-fender', 'hull', sectionSolid([
      lip(-2.857, 1.02, 1.554, 1.238 + (.443 / 5.78) * .012), lip(2.48, 1.02, 1.554, 1.250),
    ]));
    P.addMudguard('amx30-x-bow-fender', 'hull', sectionSolid([
      lip(2.44, .928, 1.555, 1.264), lip(2.91, .928, 1.555, 1.250),
      lip(3.19, .928, 1.555, 1.150), lip(3.288, .928, 1.555, 1.060),
    ]));
    addAmx30XAftReturn(P, s as -1 | 1);
    // Rear exhaust has an attached canted cover and a real grille face.
    const coverRing: [number, number][] = [[.947, 1.627], [1.210, 1.618], [1.454, 1.400],
      [1.454, 1.419], [1.208, 1.640], [.947, 1.647]];
    P.add('hullDetail', sectionSolid([-3.074, -1.798].map(z => ({z,
      ring: s < 0 ? coverRing.map(([x,y]) => [-x,y] as [number,number]).reverse() : coverRing,
    }))));
    equipment(P, 'hullDark', cylZ(.05556, 1.1523, 24), s * 1.2011, 1.4758, -2.4740);
    for (let i = 0; i < 16; i++) equipment(P, 'hullDetail', box(.017, .160, .020), s * 1.421, 1.447, -2.96 + i * .07, 0, 0, s * .68);
    // Paired bow lamps sit on two legs, under their own open guard.
    for (const [x,r,y] of [[.83167,.05973,1.39096],[1.02767,.07356,1.39702]]) {
      equipment(P, 'hullDetail', box(.024, .120, .038), s * x, 1.329, 2.654);
      equipment(P, 'hullDark', cylZ(r, .100, 20), s * x, y, 2.650);
      equipment(P, 'hullGlass', markVehicleNightLens(cylZ(r*.83, .006, 24), 'headlight'), s * x, y, 2.704);
    }
    for (const x of [.737, 1.108]) equipment(P, 'hullDetail', box(.018, .196, .024), s * x, 1.373, 2.733);
    equipment(P, 'hullDetail', box(.390, .018, .022), s * .9226, 1.471, 2.733);
    equipment(P, 'hullDetail', box(.0846,.0334,.0801),s*.83167,1.4297,2.7407);
  }
  equipment(P,'hullDetail',cylZ(.0557,.4832,24),-1.24406,1.46229,2.01592);
  for(const z of [1.896,2.210])equipment(P,'hullDetail',box(.110,.220,.052),-1.244,1.360,z);
  equipment(P,'hullDark',box(.031,.037,.44),-1.244,1.547,1.997);
  // Engine grilles do not rise into the turret's aft basket volume.
  equipment(P, 'hullDark', box(1.79, .018, 1.18), 0, 1.650, -2.37);
  for (let i = 0; i < 22; i++) equipment(P, 'hullDetail', box(1.75, .014, .020), 0, 1.667, -2.92 + i * .052);
  for (const z of [-2.87, -1.89]) equipment(P, 'hullDetail', box(1.82, .023, .032), 0, 1.668, z);
  for (const x of [.1430, .6552]) equipment(P, 'hullDetail', box(.491, .3745, .1977), x, 1.4249, -3.2204);
  // Central drawbar reaches beyond the rear boxes, leaving its pinned throat
  // open. The barrel-inclusive vehicle length includes this actual fitting.
  equipment(P, 'hullDetail', box(.067, .065, .205), -.0015, .669, -3.2815);
  for (const x of [-.027, .027]) equipment(P, 'hullDetail', box(.014, .178, .173), x, .6635, -3.4678);
  equipment(P, 'hullDark', cylX(.022, .080, 16), -.001, .67, -3.504);
  for (const x of [-.54, .54]) {
    equipment(P, 'hullDetail', box(.15, .14, .16), x, .705, -3.16);
    equipment(P, 'hullDark', torus(.073, .021, 16, 8), x, .71, -3.26);
    equipment(P, 'hullDetail', box(.11, .17, .13), x, .838, 2.982);
  }
  // Low sloped driver's lid and independently raised periscope; no broad
  // central floating plate spans the front fenders.
  equipment(P, 'hullDetail', box(.65, .028, .74), .38, 1.484, 1.675, .25);
  for (const x of [.18, .44, .67]) {
    equipment(P, 'hullDetail', box(.170, .090, .13), x, 1.530, 1.660, .25);
    equipment(P, 'hullGlass', box(.120, .036, .008), x, 1.529, 1.734);
  }
}

type CastRow = readonly [z: number, low: number, high: number, foot: number,
  lower: number, middle: number, upper: number, roofLeft: number, roofRight: number];
function castSection([z, low, high, foot, lower, middle, upper, roofLeft, roofRight]: CastRow): SolidSection {
  // Source-measured casting sections, not a scaled generic dome. The wide
  // belly falls below the narrowing upper flank; the commander's cast plinth
  // gives the roof an intentionally asymmetric outline.
  const lowerY = Math.max(low + .012, Math.min(1.70, high - .055));
  const middleY = Math.min(1.85, high - .038);
  const upperY = Math.min(2.0, high - .018);
  const ring: [number, number][] = [
    [-foot, low], [foot, low], [lower, lowerY], [middle, middleY],
    [upper, upperY], [roofRight, high], [-roofLeft, high],
    [-upper, upperY], [-middle, middleY], [-lower, lowerY],
  ];
  return { z: z - YAW_Z, ring: ring.map(([x, y]) => [x, y - YAW_Y]) };
}

function casting(P: TankBuilderPort): void {
  const rows: CastRow[] = [
    [-1.861, 1.684, 1.738, .185, .223, .213, .202, .19, .19],
    [-1.60, 1.684, 1.9753, .704, .717, .615, .349, .2765, .2742],
    [-1.40, 1.684, 2.1244, .902, .911, .825, .706, .3015, .3015],
    [-1.10, 1.673, 2.246, .04, 1.062, .975, .851, .2861, .2743],
    [-.70, 1.584, 2.2784, .45, 1.118, 1.0215, .920, .7336, .30],
    [-.30, 1.584, 2.284, .97, 1.197, 1.085, 1.006, 1.0439, .7456],
    [.10, 1.584, 2.284, 1.191, 1.303, 1.175, 1.070, .9506, .9204],
    [.50, 1.584, 2.284, 1.182, 1.299, 1.175, 1.071, .962, .9353],
    [.90, 1.584, 2.2135, 1.045, 1.188, 1.043, .952, .9244, .9264],
    [1.20, 1.584, 2.1159, .90, 1.024, .848, .7985, .769, .7676],
    [1.45, 1.597, 2.055, .542, .704, .668, .627, .6113, .6090],
    [1.518, 1.6296, 2.0436, .516, .580, .632, .563, .541, .538],
  ];
  const raw = sectionSolid(rows.map(castSection));
  raw.deleteAttribute('normal');
  const smooth = mergeVertices(raw, .00001); raw.dispose(); smooth.computeVertexNormals();
  P.add('turret', smooth);
  P.add('turret', cylY(1.065, 1.065, .042, 48), 0, .018, 0);
}

function roof(P: TankBuilderPort): void {
  // Asymmetric cast commander's plinth is blended into the left roof.
  equipment(P, 'turretDetail', cylY(.465, .523, .39, 32), -.553, 2.419, -.235);
  // The upper cupola has an open guard arc around a recessed hatch, not a
  // closed full-height drum. Source rear arc spans Y2.618..2.794.
  const arc = new THREE.Shape();
  for (let i = 0; i <= 24; i++) {
    const a = 1.27 + 3.743 * i / 24;
    const x = .453 * Math.sin(a), z = .510 * Math.cos(a);
    if (i === 0) arc.moveTo(x, z); else arc.lineTo(x, z);
  }
  for (let i = 24; i >= 0; i--) {
    const a = 1.27 + 3.743 * i / 24;
    arc.lineTo(.417 * Math.sin(a), .474 * Math.cos(a));
  }
  arc.closePath();
  const guard = new THREE.ExtrudeGeometry(arc, {depth:.176,bevelEnabled:false,steps:1}).rotateX(Math.PI / 2);
  equipment(P, 'turretDetail', guard, -.553, 2.794, -.235);
  equipment(P, 'turretDetail', cylY(.390, .390, .021, 32), -.553, 2.628, -.235);
  for (const [x,w,z,depth] of [[-.55787,.24894,.03597,.12208],[-.73657,.10847,.03338,.17865]]) {
    equipment(P, 'turretDetail', box(w,.2578,depth),x,2.74327,z);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI * .2;
    equipment(P, 'turretDark', box(.134, .079, .015), -.553 + Math.sin(a) * .430, 2.742, -.235 + Math.cos(a) * .430, 0, a);
    equipment(P, 'turretGlass', box(.105, .042, .006), -.553 + Math.sin(a) * .441, 2.742, -.235 + Math.cos(a) * .441, 0, a);
  }
  equipment(P, 'turretDetail', cylY(.335, .350, .025, 32), .552, 2.289, -.154);
  // Two narrow raised periscopes and the hatch handrails are distinct from
  // the round sight. Their source bounding stations fix their roof seats.
  for(const [x,z,w,h,y] of [[.51297,.43834,.16327,.174,2.36427],[-.70081,.54210,.16352,.143,2.33464]]) {
    equipment(P,'turretDetail',box(w,h,.06763),x,y,z);
    equipment(P,'turretGlass',box(w-.024,.032,.004),x,y+h*.24,z+.035);
  }
  for(const [x,z,len,ry] of [[0,-.897,.450,0],[.48,-.129,.47,-.52]]) {
    equipment(P,'turretDetail',box(.022,.016,len),x,2.341,z,0,ry);
    for(const side of[-1,1])equipment(P,'turretDetail',box(.024,.061,.024),
      x+side*Math.sin(ry)*len*.48,2.316,z+side*Math.cos(ry)*len*.48);
  }
  for (const x of [.360, .714]) equipment(P, 'turretDetail', cylX(.018, .11, 12), x, 2.318, -.46);
  for (const [x,z,seat,base,stem,tip] of [[.65449,-1.18238,1.74097,2.33332,2.51256,3.31302],
    [.79306,.44951,2.283,2.41889,2.59952,3.42382]]) {
    equipment(P, 'turretDetail', cylY(.0413, .0413, base - seat, 20), x, (base + seat) / 2, z);
    equipment(P, 'turretDark', cylY(.0161, .0161, stem - base + .025, 12), x, (stem + base - .025) / 2, z);
    equipment(P, 'turretDark', cylY(.0056, .0068, tip - stem + .025, 8), x, (tip + stem - .025) / 2, z);
  }
  // Source has an exposed coaxial/AA station attached to the command cupola.
  // The gun body and barrel share this straight axis, supported at the cradle.
  const mg = sourceMachineGun(P, [0, YAW_Y, YAW_Z]);
  mg.add('turretDetail', box(.024, .108, .1437), -1.1258, 2.6484, .0727);
  mg.add('turretDark', box(.0686, .0772, .3982), -1.1252, 2.7403, .1410);
  mg.add('turretDark', cylZ(.0255, .512, 16), -1.1255, 2.7551, .5923);
  mg.add('turretDark', cylZ(.01045, .174, 16), -1.1255, 2.7551, .9345);
  mg.add('turretDark', box(.09, .027, .15), -1.1252, 2.784, .123);
  mg.add('turretDetail', box(.262, .0201, .448), -.9464, 2.783, .0921);
  mg.finish();
  // Round night sight: actual forward-facing aperture, with its support leg.
  equipment(P, 'turretDetail', box(.050, .180, .08), -.894, 2.725, .49);
  equipment(P, 'turretDetail', blindTube(.14165,.119,.249,.135,28), -.89409, 2.86170, .435735);
  equipment(P, 'turretGlass', cylZ(.105, .003, 28), -.89409, 2.86170, .426735);
}

function basket(P: TankBuilderPort): void {
  // Open side rails follow the cast flank. Empty intervals remain empty,
  // rather than becoming a solid prism shaped like a basket's bounds.
  const rail = (a: THREE.Vector3, b: THREE.Vector3): void => {
    const geometry = new THREE.CylinderGeometry(.013, .013, a.distanceTo(b), 10);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    geometry.applyQuaternion(q);
    const c = a.clone().add(b).multiplyScalar(.5);
    equipment(P, 'turretDetail', geometry, c.x, c.y, c.z);
  };
  for (const side of [-1, 1]) {
    const stations = [[1.00,1.095],[1.24,1.000],[1.34,.950],[1.437,.666],
      [1.447,.58],[1.447,-.15],[1.434,-.35],[1.335,-1.055],
      [1.235,-1.316],[1.015,-1.808],[.805,-2.09],[.455,-2.32],[.10,-2.358]];
    for (let i = 0; i < stations.length - 1; i++) {
      const [x, z] = stations[i], [nx, nz] = stations[i + 1];
      rail(new THREE.Vector3(side*x,2.006,z),new THREE.Vector3(side*nx,2.006,nz));
      // The lower rail is genuinely inset under the flared upper hoop.
      rail(new THREE.Vector3(side*x*.934,1.811,z*.91),new THREE.Vector3(side*nx*.934,1.811,nz*.91));
      if(i%2===0) {
        rail(new THREE.Vector3(side*x*.934,1.62,z*.91),new THREE.Vector3(side*x,2.006,z));
        rail(new THREE.Vector3(side*x*.934,1.62,z*.91),new THREE.Vector3(side*(x-.20),1.68,z*.91));
      }
    }
  }
  rail(new THREE.Vector3(-.10,2.006,-2.358),new THREE.Vector3(.10,2.006,-2.358));
  rail(new THREE.Vector3(-.0934,1.811,-2.146),new THREE.Vector3(.0934,1.811,-2.146));
  // Source aft stowage is a metre-long sloped chest, not the short central
  // box of the first draft. Its outer side hoops remain open beside it.
  const chest=(z:number,roof:number):SolidSection=>({z:z-YAW_Z,ring:[
    [-.499,1.739-YAW_Y],[.497,1.739-YAW_Y],[.497,roof-YAW_Y],[-.499,roof-YAW_Y],
  ]});
  P.add('turretDetail',sectionSolid([
    chest(-2.374,2.027),chest(-2.30,2.054),chest(-1.45,2.155),chest(-1.371,2.04),
  ]));
  equipment(P,'turretDetail',box(.974,.027,.697),0,2.130,-1.879,-.226);
  for(const x of[-.468,0,.468])equipment(P,'turretDetail',box(.012,.022,.814),x,2.110,-1.885,-.217);
  for(const x of[-.482,.482])equipment(P,'turretDark',box(.016,.284,.057),x,1.900,-2.280,-.10);
  for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
    equipment(P, 'turretDetail', box(.065, .10, .065), side * (.85 - i * .15), 1.948, -1.41 - i * .17);
    equipment(P, 'turretDetail', cylY(.050, .056, .255, 16), side * (.85 - i * .15), 2.033, -1.43 - i * .17, -.65, side * .2);
  }
}

function gun(P: TankBuilderPort): void {
  // The sleeve is part of the pitch rig, firmly intersecting the casting at
  // its rear. It tapers toward the barrel, not backward toward the turret.
  const section = (z: number, half: number, low: number, high: number): SolidSection => ({
    z: z - GUN_Z, ring: [[-half - GUN_X, low - GUN_Y], [half - GUN_X, low - GUN_Y],
      [half * .89 - GUN_X, high - GUN_Y], [-half * .89 - GUN_X, high - GUN_Y]],
  });
  P.add('gunMount', sectionSolid([
    section(1.49, .677, 1.603, 2.151), section(1.66, .650, 1.622, 2.144),
    section(1.93, .369, 1.662, 2.097), section(2.13, .161, 1.721, 2.032),
  ]));
  // Gunner's large offset sight is a hollow five-sided hood. Its front glass
  // is recessed behind the armored lip; no box face fills the reveal.
  const add = (slot: string, g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.addEquipment(slot, g, x - GUN_X, y - GUN_Y, z - GUN_Z);
  for (const x of [.839, 1.317]) add('gunMount', box(.027, .529, .25), x, 2.061, 1.657);
  for (const y of [1.810, 2.320]) add('gunMount', box(.501, .025, .25), 1.078, y, 1.657);
  add('gunMount', box(.501, .529, .024), 1.078, 2.061, 1.521);
  add('gunMountDark', box(.451, .469, .009), 1.078, 2.062, 1.665);
  add('gunMountGlass', box(.421, .430, .004), 1.078, 2.062, 1.678);
  // Separate coax tube and its through-mantlet socket.
  add('gunMountDark', cylZ(.054, .23, 20), .412, 1.859, 1.919);
  add('gunMountDark', cylZ(.032, .91, 20), .412, 1.859, 2.453);
  KIT.buildGun(P, { len: 5.65 - GUN_Z, r: .071,
    baseR: .164, sleeve: false, evac: false, collar: false });
  // Source has a long tapered rear jacket, a step at4.22m, and a separate
  // terminal collar. Circular construction uses the area-equivalent radius
  // of the slightly elliptical source sections, without warping the oracle.
  const rows = [[2.12637,.15665],[4.216,.13070],[4.23,.11710],
    [5.775,.10160],[5.795,.11330],[5.827,.11300],[5.868,.08160],
    [5.99439,.08160],[5.99439,.0525],[5.680,.0525],[5.680,0],[2.12637,0]];
  const jacket = new THREE.LatheGeometry(rows.map(([z,r]) => new THREE.Vector2(r,z - GUN_Z)),32).rotateX(Math.PI / 2);
  P.add('gun', jacket);
  P.muzzleZ = AMX30_X_DATUMS.muzzleZ - GUN_Z;
}

export function buildAmx30X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, YAW_Y, YAW_Z);
  P.gunG.position.set(GUN_X, GUN_Y - YAW_Y, GUN_Z - YAW_Z);
  hull(P);
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .36545, wheelW: .4005, wheelY: .41638,
    // Native decorative hubs otherwise protrude96mm past the independently
    // measured400.5mm road-wheel envelope. Keep the rubber and axle fixed.
    wheelFaceDepthScale: .6751,
    wheelZs: [...AMX30_X_DATUMS.wheelStations], xc: 1.2548, trackW: .5715, trackTh: .010,
    // Object_6/8 has a 75 mm lower shell, intersecting the measured wheel
    // bottoms by 25 mm. The seated 43 mm outer shoe plus 4 mm projecting
    // web fits below those axles; the separate source guide rises 85 mm.
    trackShoeDimensions: { padHeight: .035, grouserHeight: .008, webHeight: .008, hornHeight: .085, pinRadius: .007, pinCentreY: 0 },
    // Physical wheel casting radii are unchanged. trackR is the native
    // engagement datum before its fixed wrap allowance, not a smaller wheel.
    sprocket: { z: -2.90252, y: .78493, r: .36207, trackR: .304,
      toothTipRadiusM: .36207, axialScaleLeft: .7373, axialScaleRight: .7373 },
    idler: { z: 2.86334, y: .77268, r: .33920, trackR: .314,
      axialScaleLeft: .68073, axialScaleRight: .68073 },
    // Five source return rollers, separate from the five road stations.
    // Their actual crowns support the raised return run instead of sagging
    // it onto every road wheel as on a dead-track Soviet chassis.
    rollers: [-2.21193, -1.33211, -.35206, .62792, 1.60837].map(z => ({z, y: .94105, r: .16434})),
    rollerR: .16434, returnRollerWidthM: .1873, returnRollerInsetM: .0982, shoeWidthScale: .9346,
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler:{z:2.86334,y:.77268,r:.314},sprocket:{z:-2.90252,y:.78493,r:.304},
      botY:.0425,topY:1.129,sag:.022,
      contact:KIT.runningGearContactPatch(AMX30_X_DATUMS.wheelStations,.36545),
      supports:[-2.21193,-1.33211,-.35206,.62792,1.60837].map(z=>({z,y:1.11289})),
    }),.0425,.37388),
    rigidLinkChords:true,
    topY: 1.129, botY: .0425, paintedEnds: true, arms: true, coveredTop: false,
  });
  casting(P); roof(P); basket(P); gun(P);
  P.topY = AMX30_X_DATUMS.overallHeightM - YAW_Y;
  P.hullG.userData.xRebuild = { candidate: 'amx30_x', independent: true, datumVersion: 1, sourceLocalOnly: true };
}

export const AMX30_X_PROFILES = { amx30_x: { build: buildAmx30X } } as const;
