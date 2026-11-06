// BMPT-72 "Terminator 2" (`bmpt_terminator2`): the Ramka-72 weapon module on the T-72 hull, and the hull kit the BMPT-72
// adds to it. 267 (lane bmpt-family-267, builder U; the owner: "upgrade our BMPT T-72"), from the Army-2016, Army-2018
// and Army-2020 photographs (Vitaly V. Kuzmin, Alexey Vasilenko; CC BY-SA 4.0, Wikimedia Commons):
//   - the low armoured turret on the T-72's ring: raked welded walls, the two big wedge blocks with their hinged lids and
//     the ribbed centre block across its front (photos 01, 09, 10, 14), the crew hatches and the smoke-grenade rows on
//     its roof, the stowage basket of bar frame and mesh wrapped round its rear (photos 03, 04, 08, 12, 13);
//   - the module on it: a low pedestal and two tall shoulder blocks, the elevating armoured cradle of the twin 2A42 30 mm
//     high between them with its louvred top plate (photos 01, 10, 14), the gunner's sight with its sprung armoured doors
//     and the stowage box under the shoulders' fronts, the vision blocks at its foot (photos 01, 10), the commander's
//     panoramic sight (a boxy armoured head with its window, on a mast housing) on the right shoulder and the wind-sensor
//     mast, whip and red marker lamps on the left (photos 01, 02, 07, 08, 10);
//   - the two long ARMOURED Ataka boxes, one a flank, each hung on a big bolted pivot flange on its shoulder: a
//     chamfered box, its belly deepest over the pivot and raked up to the beaks, with the two tube ends side by side in a
//     hood at each end, the end caps ribbed (photos 01-04, 14);
//   - on the hull: slat screens hugging the thin rear skirt over the engine compartment from the skirt's foot to just over
//     the deck's edge, wrapped round the stern corners into a screen close behind the stern, all of horizontal flat bars on
//     upright posts bracketed to the hull (photos 07, 08, 12, 13).
// It is not the BMPT T-90's hammerhead (bmptT90Station.ts): the boxes ride shoulder flanges beside an open cradle, not
// pivot shafts off a head, and the turret under them is a low wedge-fronted tank turret, not an octagonal drum.
//
// Combat wiring: the turret ring is the T-72B3M's (rig_turret at its datum), the trunnion TRUNNION, the twin bores at
// x +-0.16 on their own recoil groups (spec.gun.muzzles, recoilRig.selftest.mjs), the muzzle station 3.22 and four Ataka
// tubes (guidedLauncherTubes.selftest.mjs) whose launch exits are the front caps (fleetLauncherMuzzles.ts).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { weaponAssembly } from './weaponStock.ts';

type P3 = readonly [number, number, number];

// Turret frame: the origin is the T-72B3M ring's axis on its roof plane (y 1.5295 in the hull), +x the vehicle's left.
/** The turret body's roof and its foot over the deck (the ring collar closes the seam below it). */
const ROOF_Y = 0.40, FOOT_Y = 0.06;
/** The twin cannons' trunnion (rig_gun). */
export const BMPT72_TRUNNION = Object.freeze({ y: 0.92, z: 0.10 });
/** The twin 2A42 bores (spec.gun.muzzles) and the muzzle station. */
const BORE_X = 0.16, MUZZLE_Z = 3.22;
/** Shoulder blocks either side of the cradle: inner and outer faces, foot, top, front and rear faces. */
const SHOULDER = Object.freeze({ xi: 0.30, xo: 0.64, y0: 0.50, y1: 1.16, front: 0.44, rear: -0.46 });
/** Ataka boxes: inner and outer faces, the belly's lowest point (over the pivot) and the top, the shell's rear and front
 * ends, and the hood beyond each end. */
const BOX = Object.freeze({ xi: 0.68, xo: 1.18, yb: 0.70, yt: 1.12, rear: -0.80, front: 0.96, hood: 0.08 });
/** The two tubes in each box, side by side in its outboard part (the inboard part is the box's solid housing, photo 10),
 * and their caps' faces. */
const TUBE_X = [0.905, 1.075] as const, TUBE_Y = 0.985, TUBE_R = 0.072, CAP_PROUD = 0.025;
/** The front caps' faces, the launch exits (fleetLauncherMuzzles.ts bmpt_terminator2). */
export const BMPT72_LAUNCH_FACE_Z = BOX.front + CAP_PROUD;
export const BMPT72_TUBES = Object.freeze({ x: TUBE_X, y: TUBE_Y });
/** The sights' top (the station's highest solid point, P.topY). */
const PANO = Object.freeze({ x: -0.47, z: -0.26, top: 1.712 });

/** Convex solid over the given points, with plan-projected UVs (the camouflage box projection replaces them). */
function convex(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

const both = (points: readonly P3[]): P3[] => points.flatMap(([x, y, z]) => [[-x, y, z], [x, y, z]] as P3[]);

/** A section ring authored for the left (+x) side, mirrored to `side` and kept counter-clockwise seen from +z. */
function sideRing(side: number, points: readonly SectionPoint[]): SectionPoint[] {
  const m = points.map(([x, y]) => [side * x, y] as const);
  return side < 0 ? m.reverse() : m;
}

/** A flat plate of thickness y1 - y0 over a plan outline of (x, z) points (any winding). */
function plate(outline: readonly (readonly [number, number])[], y0: number, y1: number): THREE.BufferGeometry {
  let ring: SectionPoint[] = outline.map(([x, z]) => [x, -z] as const);
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) ring = [...ring].reverse();
  return sectionSolid([{ z: y0, ring }, { z: y1, ring }]).rotateX(-Math.PI / 2);
}

// ------------------------------------------------------------------------------------------------------------------
// The turret: ring collar, raked body, frontal blocks, roof fittings and the rear basket
// ------------------------------------------------------------------------------------------------------------------

function addTurretBody(P: TankBuilderPort): void {
  const { box, cylX, cylY } = KIT;
  // The ring collar (the dedicated turntable, its own steel): 1 cm into the hull's ring plate, 1 cm into the body's foot.
  P.add('turretTrack', cylY(0.98, 1.00, 0.08, 32), 0, 0.03, 0);
  // The welded body: raked walls all round, a short nose under the frontal blocks, the rear corners cut.
  P.add('turret', convex(both([
    [0.62, FOOT_Y, 0.98], [1.04, FOOT_Y, 0.56], [1.04, FOOT_Y, -0.66], [0.72, FOOT_Y, -1.06],
    [0.56, ROOF_Y, 0.88], [0.95, ROOF_Y, 0.50], [0.95, ROOF_Y, -0.62], [0.67, ROOF_Y, -0.97],
  ])));
  // The two wedge blocks across the front (photos 01, 09, 10, 14): their tops one plane falling 0.14 m to the front,
  // the faces raked back, their rear buried in the body's front walls; the hinged lid on each with two lifting handles.
  const lidRake = Math.atan2(0.14, 1.36 - 0.59);
  const wedgeTop = (z: number): number => 0.42 - (z - 0.59) * Math.tan(lidRake);
  for (const side of [-1, 1]) {
    P.add('turret', convex([
      [0.26, 0.42, 0.59], [0.84, 0.42, 0.59], [0.26, 0.28, 1.36], [0.78, 0.28, 1.36],
      [0.26, 0.10, 1.43], [0.78, 0.10, 1.43], [0.26, 0.08, 0.90], [0.84, 0.08, 0.72],
    ].map(([x, y, z]) => [side * x, y, z] as P3)));
    const lidZ = 1.02, lidY = wedgeTop(lidZ) + 0.002;
    P.add('turretDetail', KIT.xform(box(0.42, 0.014, 0.44), 0, 0, 0, lidRake, 0, 0), side * 0.53, lidY, lidZ);
    for (const dz of [-0.12, 0.12]) {
      const z = lidZ + dz, y = wedgeTop(z) + 0.009;
      P.add('turretDark', beamBetween([side * 0.44, y, z], [side * 0.44, y + 0.035, z + 0.01], 0.008, 6));
      P.add('turretDark', beamBetween([side * 0.62, y, z], [side * 0.62, y + 0.035, z + 0.01], 0.008, 6));
      P.add('turretDark', beamBetween([side * 0.44, y + 0.035, z + 0.01], [side * 0.62, y + 0.035, z + 0.01], 0.008, 6));
    }
    P.add('turretDark', cylX(0.014, 0.36, 8), side * 0.53, wedgeTop(0.80) + 0.010, 0.80);   // the lid's hinge rod
  }
  // The ribbed centre block between the wedges, recessed behind their faces.
  P.add('turret', convex(both([[0.27, 0.08, 0.84], [0.27, 0.08, 1.20], [0.27, 0.36, 1.18], [0.27, 0.40, 0.80]])));
  for (const y of [0.17, 0.27]) P.add('turretDetail', box(0.50, 0.025, 0.03), 0, y, 1.20 - (y - 0.08) * (0.02 / 0.28) + 0.005);
  // Bolt heads along the side walls' upper edge (the bolted side plates, photo 14).
  for (const side of [-1, 1]) for (const z of [0.30, -0.05, -0.40]) {
    P.add('turretDark', KIT.xform(cylX(0.016, 0.016, 8), 0, 0, 0, 0, 0, side * 0.26), side * 0.970, 0.34, z);
  }
}

function addTurretRoof(P: TankBuilderPort): void {
  const { box, cylX, cylY } = KIT;
  // The commander's and gunner's hatches behind the module, hinged at their rear edge.
  for (const side of [-1, 1]) {
    const x = side * 0.42, z = -0.75;
    P.addHatch('turret', box(0.36, 0.030, 0.40), x, ROOF_Y + 0.010, z);
    P.add('turretDark', cylX(0.016, 0.30, 8), x, ROOF_Y + 0.020, z - 0.205);
    P.add('turretDetail', beamBetween([x - 0.08, ROOF_Y + 0.024, z + 0.08], [x + 0.08, ROOF_Y + 0.024, z + 0.08], 0.010, 6));
  }
  // The smoke-grenade rows along the roof's side edges, firing outward and up under the Ataka boxes (photos 10, 14).
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.12, 0.05, 0.52), side * 0.88, ROOF_Y + 0.015, -0.08);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.038, len: 0.20, spacing: 0.085,
      splay: side * 1.45, pitch: -0.42, arc: 0.20, slot: 'detail', seed: 3940 + (side > 0 ? 1 : 0),
    }), side * 0.885, ROOF_Y + 0.08, -0.08);
  }
  // Vision blocks at the module's foot (photo 01): three on the right, one on the left.
  for (const x of [-0.14, -0.33, -0.52, 0.16]) {
    P.add('turretDetail', box(0.12, 0.08, 0.10), x, ROOF_Y + 0.035, 0.70);
    P.add('turretGlass', box(0.09, 0.04, 0.010), x, ROOF_Y + 0.040, 0.753);
  }
  // A filler cap on each of the roof's front corners.
  for (const side of [-1, 1]) P.add('turretDetail', cylY(0.05, 0.05, 0.03, 12), side * 0.70, ROOF_Y + 0.010, 0.40);
}

/** The stowage basket round the turret's rear: a bar frame with mesh panels on a mesh floor, its inner edge against the
 * body's walls (photos 03, 04, 08, 12, 13). Its floor rides 0.135 over the ring plane, 3 cm over the engine deck's hump
 * and covers at any traverse; its top rail stands 0.135 over the roof. */
function addRearBasket(P: TankBuilderPort): void {
  const { box } = KIT;
  const floorY = 0.135, top = 0.535, rail = 0.012;
  const outX = 1.26, backZ = -1.36, frontZ = -0.30;
  // the floor: inside the outer frame, lapping 4-5 mm into the body's raked walls (x 1.020 / z -1.040 at the floor)
  const inner: (readonly [number, number])[] = [[1.016, frontZ], [1.016, -0.66], [0.705, -1.036], [-0.705, -1.036],
    [-1.016, -0.66], [-1.016, frontZ]];
  const outline = [...inner, [-outX, frontZ], [-outX, backZ], [outX, backZ], [outX, frontZ]] as const;
  P.add('turretOpenLatticeDark', plate(outline, floorY - 0.006, floorY));
  const bar = (a: P3, b: P3, r = rail): void => P.add('turretOpenLattice', beamBetween(a, b, r, 6));
  // the outer frame: floor, mid and top rails round the U, posts at the corners and between
  const path: P3[] = [[outX, 0, frontZ], [outX, 0, backZ], [-outX, 0, backZ], [-outX, 0, frontZ]];
  for (const y of [floorY, 0.33, top]) for (let i = 0; i + 1 < path.length; i++) {
    bar([path[i][0], y, path[i][2]], [path[i + 1][0], y, path[i + 1][2]]);
  }
  const posts: P3[] = [[outX, 0, frontZ], [outX, 0, -0.83], [outX, 0, backZ], [0.63, 0, backZ], [0, 0, backZ],
    [-0.63, 0, backZ], [-outX, 0, backZ], [-outX, 0, -0.83], [-outX, 0, frontZ]];
  for (const [x, , z] of posts) P.add('turretOpenLattice', box(0.025, top - floorY + 0.012, 0.025), x, (floorY + top) / 2, z);
  // the floor's side rails back into the body (the basket's front ends), each a short slat field (photo 03)
  const wallX = (y: number): number => 1.04 - (y - FOOT_Y) / (ROOF_Y - FOOT_Y) * 0.09 - 0.008;
  for (const side of [-1, 1]) {
    for (const y of [floorY, 0.22, 0.32]) bar([side * wallX(y), y, frontZ], [side * outX, y, frontZ]);
    bar([side * 0.872, floorY, -0.83], [side * outX, floorY, -0.83]);
  }
  bar([0.705, floorY, -1.036], [0.63, floorY, backZ]);
  bar([-0.705, floorY, -1.036], [-0.63, floorY, backZ]);
  // mesh panels on the outer faces between the floor and the top rail
  const meshH = top - floorY - 0.02, meshY = (floorY + top) / 2;
  for (const side of [-1, 1]) P.add('turretOpenLatticeDark', box(0.005, meshH, frontZ - backZ - 0.04), side * (outX - 0.004), meshY,
    (frontZ + backZ) / 2);
  P.add('turretOpenLatticeDark', box(2 * outX - 0.04, meshH, 0.005), 0, meshY, backZ + 0.004);
}

// ------------------------------------------------------------------------------------------------------------------
// The module: pedestal, shoulders, cradle and cannons, Ataka boxes, sights
// ------------------------------------------------------------------------------------------------------------------

function addModuleBody(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const { xi, xo, y0, y1, front, rear } = SHOULDER;
  // The low pedestal on the roof (its front raked under the shoulders, which stand 2 cm proud of it).
  P.add('turret', convex(both([
    [0.66, ROOF_Y - 0.01, -0.52], [0.66, ROOF_Y - 0.01, 0.47], [0.645, 0.52, -0.48], [0.645, 0.52, 0.42],
  ])));
  for (const side of [-1, 1]) {
    // The shoulder: square walls, the front's top and the rear's foot chamfered.
    const profile: readonly (readonly [number, number])[] = [
      [front, y0], [front, y1 - 0.14], [0.30, y1], [-0.40, y1], [rear, y1 - 0.08], [rear, 0.56], [-0.40, y0]];
    P.add('turret', convex(profile.flatMap(([z, y]) => [[side * xi, y, z], [side * xo, y, z]] as P3[])));
    // the armoured cover over its front face, hinged at its top (photo 10)
    P.add('turretDetail', box(0.28, 0.22, 0.030), side * 0.47, 0.90, front + 0.010);
    for (const dx of [-0.07, 0.07]) P.add('turretDark', cylX(0.012, 0.07, 8), side * 0.47 + dx, 1.012, front + 0.026);
    P.add('turretGlass', box(0.12, 0.05, 0.010), side * 0.47, 0.86, front + 0.027);
    // the pivot flange the Ataka box hangs on, its lower half and bolts showing under the box's belly (photos 03, 04, 13)
    const flangeX = side * 0.6575, fy = 0.70, fz = 0.05;
    P.add('turretDetail', cylX(0.21, 0.055, 28), flangeX, fy, fz);
    for (const a of [-150, -120, -90, -60, -30]) {
      const t = a * Math.PI / 180;
      P.add('turretDark', cylX(0.014, 0.014, 8), side * 0.689, fy + 0.17 * Math.sin(t), fz + 0.17 * Math.cos(t));
    }
    // the side vision block's window low on the shoulder's flank, behind the flange (photos 03, 04)
    P.add('turretGlass', box(0.010, 0.05, 0.10), side * 0.643, 0.60, -0.33);
  }
}

/** Counter-clockwise box section with chamfered top corners (viewed from +Z). */
function chamferedSection(w: number, bottom: number, top: number, chamfer: number): SectionPoint[] {
  return [[-w, bottom], [w, bottom], [w, top - chamfer], [w - chamfer, top], [-(w - chamfer), top], [-w, top - chamfer]];
}

function addCannonPlant(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  // The trunnion drum through both shoulders (1 cm into each) and the pins inside them.
  P.addGunExtra(cylX(0.11, 0.62, 24), 0, 0, 0);
  P.addGunExtraDark(cylX(0.040, 0.70, 12), 0, 0, 0);
  // The armoured cradle over both receivers: its back raked down to the drum, so at full elevation its heel passes 7 cm
  // over the pedestal; 3 cm inside each shoulder.
  P.addGunExtra(sectionSolid([
    { z: -0.28, ring: chamferedSection(0.25, -0.12, 0.02, 0.03) },
    { z: -0.14, ring: chamferedSection(0.27, -0.13, 0.12, 0.04) },
    { z: 0.62, ring: chamferedSection(0.27, -0.13, 0.12, 0.04) },
    { z: 0.86, ring: chamferedSection(0.25, -0.11, 0.12, 0.03) },
  ]), 0, 0, 0);
  // the louvred top plate (photo 14), 5 mm into the cradle's top, and its two rows of louvres
  P.addGunExtra(box(0.48, 0.018, 0.65), 0, 0.124, 0.535);
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
    P.addGunExtraDark(box(0.05, 0.006, 0.035), sx * 0.19, 0.134, 0.30 + i * 0.105);
  }
  for (const side of [-1, 1]) {
    const barrel = side < 0 ? 0 : 1, x = side * BORE_X;
    P.addGunExtra(cylZ(0.066, 0.06, 16), x, 0, 0.87);                                     // barrel port boss
    P.add(`gunBarrel${barrel}`, cylZ(0.050, 0.55, 14), x, 0, 1.16);                       // the receiver's jacket
    P.add(`gunBarrel${barrel}`, cylZ(0.036, 1.61, 12), x, 0, 2.225);                      // the 2A42's tube
    P.add(`gunBarrel${barrel}Dark`, cylZ(0.056, 0.18, 12), x, 0, 3.10);                   // muzzle brake
    P.add(`gunBarrel${barrel}Dark`, cylZ(0.021, 0.030, 12), x, 0, 3.2025);                // bore-mouth ring, inside the brake
  }
  P.muzzleZ = MUZZLE_Z;
}

function addAtakaBoxes(P: TankBuilderPort): void {
  const { cylZ, box } = KIT;
  const { xi, xo, yb, yt, rear, front, hood } = BOX, t = 0.02, beak = 0.90;
  // The belly (photos 03, 04, 14): deepest (0.42) over the pivot flange, raked up to the beaks under the tube ends.
  const belly: readonly (readonly [number, number])[] = [[rear, beak], [rear + 0.12, 0.86], [-0.30, yb], [0.40, yb],
    [front - 0.12, 0.86], [front, beak]];
  const bottomAt = (z: number): number => {
    for (let i = 0; i + 1 < belly.length; i++) {
      const [z0, y0] = belly[i], [z1, y1] = belly[i + 1];
      if (z >= z0 && z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
    }
    return beak;
  };
  const ring = (y: number, c: number): SectionPoint[] => [[xi, y], [xo - c, y], [xo, y + c], [xo, yt], [xi, yt]];
  const u: SectionPoint[] = [[xi, 0.93], [xi + t, 0.93], [xi + t, yt - t], [xo - t, yt - t], [xo - t, 0.93], [xo, 0.93],
    [xo, yt], [xi, yt]];
  const band = (y: number): SectionPoint[] => [[xi - 0.006, y - 0.008], [xo - 0.057, y - 0.008], [xo + 0.008, y + 0.057],
    [xo + 0.008, yt + 0.008], [xi - 0.006, yt + 0.008]];
  for (const side of [-1, 1]) {
    // The armoured shell over its belly, the ends' bottom corners chamfered less (the beaks).
    const shell = sectionSolid(belly.map(([z, y], i) => ({ z, ring: sideRing(side, ring(y, i === 0 || i === belly.length - 1 ? 0.02 : 0.06)) })));
    shell.userData.rangeSilhouette = true;
    P.addEquipment('turret', shell);
    // the hoods over the tube ends, 1 cm into the shell
    P.addEquipment('turret', sectionSolid([{ z: front - 0.01, ring: sideRing(side, u) }, { z: front + hood, ring: sideRing(side, u) }]));
    P.addEquipment('turret', sectionSolid([{ z: rear - hood, ring: sideRing(side, u) }, { z: rear + 0.01, ring: sideRing(side, u) }]));
    // the housing's solid inboard face in each hood, flush with the hood's mouth, beside the tube pair
    for (const z of [front + (hood - 0.01) / 2, rear - (hood - 0.01) / 2]) {
      P.addEquipment('turret', box(0.14, yt - t - beak, hood + 0.01), side * (xi + 0.07), (yt - t + beak) / 2, z);
    }
    // two clamp bands round the shell, clear of the flange
    for (const z of [-0.48, 0.58]) P.addEquipment('turret', sectionSolid([
      { z: z - 0.025, ring: sideRing(side, band(bottomAt(z - 0.025))) }, { z: z + 0.025, ring: sideRing(side, band(bottomAt(z + 0.025))) }]));
    // the carrying handle on its top
    const cx = side * (xi + xo) / 2, hz = 0.18;
    for (const dx of [-0.09, 0.09]) P.add('turretDark', beamBetween([cx + dx, yt - 0.004, hz], [cx + dx, yt + 0.05, hz], 0.009, 6));
    P.add('turretDark', beamBetween([cx - 0.09, yt + 0.05, hz], [cx + 0.09, yt + 0.05, hz], 0.009, 6));
    for (const tx of TUBE_X) for (const [z, dir] of [[front, 1], [rear, -1]] as const) {
      // the tube's end cap standing 25 mm out of the shell inside the hood, four radial ribs and the centre boss on it
      const capZ = z + dir * (CAP_PROUD - 0.02);
      P.add('turretDetail', cylZ(TUBE_R, 0.04, P.q ? 20 : 14), side * tx, TUBE_Y, capZ);
      // the tube's dark end collar the cap is pressed into, 5 mm into the shell's end face
      P.add('turretDark', cylZ(TUBE_R + 0.010, 0.02, P.q ? 20 : 14), side * tx, TUBE_Y, z + dir * 0.005);
      const face = z + dir * CAP_PROUD;
      for (let k = 0; k < 4; k++) {
        P.add('turretDetail', KIT.xform(box(0.008, 2 * TUBE_R - 0.03, 0.006), 0, 0, 0, 0, 0, k * Math.PI / 4),
          side * tx, TUBE_Y, face + dir * 0.0015);
      }
      P.add('turretDark', cylZ(0.024, 0.012, 12), side * tx, TUBE_Y, face + dir * 0.003);
    }
  }
  // guided-load rule (owner 2026-09-18): the spec's Ataka load is at least one round per tube; the profile publishes its
  // tube census for guidedLauncherTubes.selftest
  P.turretG.userData.launcherTubes = TUBE_X.length * 2;
}

function addSightsAndKit(P: TankBuilderPort): void {
  const { box, cylX, cylY } = KIT;
  // Gunner (left, +x): the sight housing under the left shoulder's front, standing on the roof, its two armoured doors
  // on coil springs (photos 01, 10) and the window under them.
  P.addEquipment('turret', box(0.26, 0.35, 0.24), 0.45, 0.565, 0.54);
  for (const x of [0.385, 0.515]) P.add('turretDetail', box(0.12, 0.20, 0.018), x, 0.62, 0.664);
  for (const x of [0.315, 0.585]) P.add('turretDark', cylY(0.018, 0.018, 0.16, 8), x, 0.62, 0.64);
  P.add('turretGlass', box(0.16, 0.05, 0.012), 0.45, 0.48, 0.664);
  // Right (-x): the stowage box under the right shoulder's front, its lid and two latches.
  P.addEquipment('turret', box(0.28, 0.30, 0.20), -0.45, 0.545, 0.53);
  P.add('turretDetail', box(0.29, 0.015, 0.21), -0.45, 0.698, 0.53);
  for (const x of [-0.52, -0.38]) P.add('turretDark', box(0.04, 0.05, 0.012), x, 0.64, 0.632);
  // Commander (right): the panoramic sight on the right shoulder's rear (photos 01, 02, 07, 10): its octagonal armoured mast
  // housing, the turntable collar, and the boxy armoured head, its front corners cut, its window looking forward under a
  // brow, a lid on its top and a grab handle on its back: the station's highest point.
  const { x, z } = PANO;
  const oct = (h: number, c: number, y: number): P3[] => ([[h - c, h], [h, h - c], [h, c - h], [h - c, -h], [c - h, -h],
    [-h, c - h], [-h, h - c], [c - h, h]] as const).map(([px, pz]) => [x + px, y, z + pz] as P3);
  P.addEquipment('turret', convex([...oct(0.12, 0.035, SHOULDER.y1 - 0.02), ...oct(0.12, 0.035, 1.44)]));
  P.addEquipment('turret', cylY(0.165, 0.165, 0.03, 24), x, 1.45, z);
  const hz = z + 0.02, y0 = 1.46, y1 = 1.70;
  const plan: readonly (readonly [number, number])[] = [[-0.12, 0.17], [0.12, 0.17], [0.17, 0.10], [0.17, -0.12],
    [0.14, -0.15], [-0.14, -0.15], [-0.17, -0.12], [-0.17, 0.10]];
  const headPts: P3[] = plan.flatMap(([px, pz]) => [[x + px, y0, hz + pz], [x + px, pz > 0.15 ? y1 - 0.04 : y1, hz + pz]] as P3[]);
  headPts.push([x - 0.12, y1, hz + 0.13], [x + 0.12, y1, hz + 0.13]);
  const head = convex(headPts);
  head.userData.rangeSilhouette = true;
  P.addEquipment('turret', head);
  P.add('turretGlass', box(0.20, 0.075, 0.014), x, 1.575, hz + 0.173);
  P.add('turretDetail', box(0.26, 0.018, 0.065), x, 1.638, hz + 0.1975);
  P.add('turretDetail', box(0.24, 0.014, 0.20), x, y1 + 0.005, hz - 0.02);
  for (const dx of [-0.08, 0.08]) P.add('turretDark', beamBetween([x + dx, 1.60, hz - 0.145], [x + dx, 1.60, hz - 0.19], 0.008, 6));
  P.add('turretDark', beamBetween([x - 0.08, 1.60, hz - 0.19], [x + 0.08, 1.60, hz - 0.19], 0.008, 6));
  // Left shoulder's rear (photo 02): the wind-sensor mast and the whip on its top, the two red marker lamps on its back.
  P.addEquipment('turret', cylY(0.028, 0.034, 0.40, 10), 0.52, SHOULDER.y1 + 0.19, -0.32);
  P.addEquipment('turret', cylY(0.045, 0.045, 0.09, 12), 0.52, SHOULDER.y1 + 0.43, -0.32);
  P.add('turretDetail', cylY(0.040, 0.048, 0.05, 12), 0.38, SHOULDER.y1 + 0.02, -0.34);
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 0.90, r: 0.011, rake: -0.04, seed: 3950 }),
    0.38, SHOULDER.y1 + 0.04, -0.34);
  P.addEquipment('turret', box(0.22, 0.10, 0.06), 0.47, 1.02, SHOULDER.rear - 0.02);
  for (const dx of [-0.05, 0.05]) {
    P.add('turretGlass', markVehicleNightLens(box(0.07, 0.06, 0.010), 'marker', { tint: 'red' }), 0.47 + dx, 1.02, SHOULDER.rear - 0.054);
  }
  // A cable conduit down the left shoulder's back into the pedestal.
  P.add('turretDark', cylX(0.018, 0.20, 8), 0.47, 0.60, SHOULDER.rear - 0.005);
  // the vehicle number on the left Ataka box's outer face, ahead of the rear band
  P.decal('turret', 'number', 'BMPT-72', 0.17, [BOX.xo + 0.009, 0.99, 0.10], Math.PI / 2);
}

/** The BMPT-72 station on a cleared turret rig (the caller clears the donor's turret and gun buckets first). */
export function buildBmpt72Station(P: TankBuilderPort): void {
  P.turretG.scale.set(1, 1, 1);
  P.gunG.scale.set(1, 1, 1);
  P.gunG.position.set(0, BMPT72_TRUNNION.y, BMPT72_TRUNNION.z);
  // The collar (r 1.00) stays as built: the seat lifts only what lies outside it onto the deck's plane.
  P.turretG.userData.turretSeatKeepR = 1.02;
  addTurretBody(P);
  addTurretRoof(P);
  addRearBasket(P);
  addModuleBody(P);
  addCannonPlant(P);
  // VH.14 (coordinator ruling 2026-10-14): the BMPT-72 carries two 2A42, four Ataka and a coaxial PKTM and no roof
  // machine gun (roofWeaponPolicy.ts).
  weaponAssembly(P, () => addAtakaBoxes(P));
  addSightsAndKit(P);
  P.topY = Math.max(P.topY || 0, PANO.top);
}

// ------------------------------------------------------------------------------------------------------------------
// The hull kit: slat screens over the engine compartment's flanks and across the stern
// ------------------------------------------------------------------------------------------------------------------

/** The slat's bar plane (x of the flank screens' bar centres, 2 cm off the rear skirt's face; z of the stern screen's,
 * 2.4 cm behind the rear screen leaves), its bar depth, row pitch and the stern screen's half-width (the fenders' edge). */
const SLAT = Object.freeze({ x: 2.02, sternZ: -3.72, depth: 0.05, pitch: 0.10, sternHalf: 1.70, cornerZ: -3.46 });

/** Horizontal flat bars, edge-on (50 mm deep, 10 mm thick), along one straight run between posts, at `rows` heights. */
function slatRun(P: TankBuilderPort, a: P3, b: P3, rows: readonly number[], posts: readonly number[]): void {
  const { box } = KIT;
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const lo = Math.min(...rows) - 0.02, hi = Math.max(...rows) + 0.02;
  for (const y of rows) {
    P.add('hullOpenLattice', KIT.xform(box(SLAT.depth, 0.010, len), 0, 0, 0, 0, yaw, 0), (a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2);
  }
  // upright posts (40 mm square tube) the bars pass through
  for (const f of posts) {
    P.add('hullOpenLattice', KIT.xform(box(0.06, hi - lo, 0.035), 0, 0, 0, 0, yaw, 0), a[0] + dx * f, (lo + hi) / 2, a[2] + dz * f);
  }
}

/** The stern's two open slots the T-72B3M X hull leaves behind its stern screen (roof-pocket census): the wedge between each
 * fender's rear end and the rubber rear leaf under it, and the slot between the unditching log's top and the stern plate's
 * sloping underside. Closed with welded fillers following those surfaces (5-8 mm into each), in the fitting paint. */
function closeSternSlots(P: TankBuilderPort): void {
  // the fender's rear sheet (top 1.20 at z -3.47 to 1.3324 at -3.15, 19 mm) and the rear leaf (1.043 at -3.475 to 1.3207
  // at -3.155) between |x| 1.145 and 1.755
  const deckUnder = (z: number): number => 1.20 + (z + 3.47) / 0.32 * 0.1324 - 0.019;
  const leafTop = (z: number): number => 1.043 + (z + 3.475) / 0.32 * 0.2777;
  for (const side of [-1, 1]) {
    const pts: P3[] = [];
    for (const z of [-3.45, -3.27]) for (const x of [1.15, 1.75]) {
      pts.push([side * x, leafTop(z) - 0.005, z], [side * x, deckUnder(z) + 0.005, z]);
    }
    P.add('hullDetail', convex(pts));
  }
  // the stern plate's underside (1.084 at z -3.20 to 1.26 at -3.342) over the log (top 1.127)
  const sternUnder = (z: number): number => 1.084 + (-3.20 - z) / 0.142 * 0.176;
  P.add('hullDetail', convex(both([
    [1.17, 1.115, -3.235], [1.17, sternUnder(-3.235) + 0.008, -3.235],
    [1.17, 1.115, -3.335], [1.17, sternUnder(-3.335) + 0.008, -3.335],
  ])));
}

export function addBmpt72HullKit(P: TankBuilderPort): void {
  closeSternSlots(P);
  const { box } = KIT;
  // One row set all round, from the skirt's foot to 0.11 over the deck's edge (1.51-1.53): the screens hug the hull, not
  // a railing over the deck (photos 07, 08, 12, 13).
  const rows = Array.from({ length: 9 }, (_, i) => 0.84 + i * SLAT.pitch);   // 0.84 .. 1.64
  const { cornerZ, sternHalf } = SLAT;
  for (const side of [-1, 1]) {
    const x = side * SLAT.x;
    // The flank screens over the engine compartment's thin rear skirt, from the fighting compartment's last Relikt box to
    // the stern corner. Their posts stand where the skirt is (its spans z -0.795..-1.389, -1.73..-2.217, -2.559..-3.153),
    // each tied to it by two brackets: one over the skirt's top edge from the fender, one into its backing plate low down.
    const fore = [-0.8426, -1.36, -1.9274], aft = [-2.0126, -2.62, -3.0974];
    const frac = (a: number, b: number, z: number): number => (z - a) / (b - a);
    slatRun(P, [x, 0, -0.82], [x, 0, -1.95], rows, fore.map((z) => frac(-0.82, -1.95, z)));
    slatRun(P, [x, 0, -1.99], [x, 0, cornerZ], rows, [...aft, cornerZ].map((z) => frac(-1.99, cornerZ, z)));
    for (const z of [...fore, ...aft]) {
      P.add('hullOpenLattice', box(SLAT.x - 1.72, 0.03, 0.05), side * (SLAT.x + 1.72) / 2, 1.540, z);
      P.add('hullOpenLattice', box(SLAT.x - 1.942, 0.03, 0.04), side * (SLAT.x + 1.942) / 2, 0.95, z);
    }
    // round the stern corner, from the flank's last post to the stern screen's end post
    slatRun(P, [x, 0, cornerZ], [side * sternHalf, 0, SLAT.sternZ], rows, []);
  }
  // The stern screen across the stern (photo 07), close behind the six rear screen leaves: its four inner posts tied to
  // the leaves' backs (z -3.6715) by two short brackets each, 6 mm into the leaf and 8 mm into the post; its end posts to
  // the fenders' rear ends (z -3.47), 1 cm into each.
  const z = SLAT.sternZ, inner = [-0.946, -0.182, 0.194, 0.946];
  slatRun(P, [-sternHalf, 0, z], [sternHalf, 0, z], rows, [-sternHalf, ...inner, sternHalf].map((px) => (px + sternHalf) / (2 * sternHalf)));
  const leafZ = -3.6715 + 0.006, postZ = z + 0.03 - 0.008;
  for (const px of inner) for (const y of [1.36, 1.60]) {
    P.add('hullOpenLattice', box(0.03, 0.03, leafZ - postZ), px, y, (leafZ + postZ) / 2);
  }
  for (const px of [-sternHalf, sternHalf]) P.add('hullOpenLattice', box(0.03, 0.03, -3.46 - postZ), px, 1.19, (-3.46 + postZ) / 2);
}
