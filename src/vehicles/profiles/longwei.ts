// ZTZ-99 Longwei — release 233 redesign (owner 2026-10-21: "completely redesign the longwei").
//
// An original PLA game concept on the measured Type 99A hull. The retired VT-4-derived chevron turret, the 99A arrow
// glacis and the drum-carrying stern are gone; the Longwei now reads as its own vehicle:
//   - a TERRACED front: a deep lower composite tier carrying a row of FY-5 bricks, a sloped step and a set-back upper
//     tier, on a shallow 16-degree blunt prow (the 99A family is a sharp arrow wedge, the VT-4 a chevron);
//   - slab sides: three bolt-on spaced composite modules a side, a long bustle with bins, blow-off panels and a basket;
//   - a square box mantlet, a 125 mm gun with a mid-barrel evacuator between two thermal-sleeve runs and an MRS;
//   - a GL-5-style hard-kill suite (four flat radar faces at the turret corners, two two-cell launchers), a mast
//     panoramic sight, a low gunner's sight and a shielded QJC-88 pintle;
//   - hull dress: a straight-gridded FY-5 glacis field with low lamp cowls, two staggered brick courses on the front
//     skirts, slat armour over the engine bay and an armoured stern bin in place of the fuel drums.
// The structural hull (running gear, lofted belly, glacis planes, fenders, transom, recovery tray) is the certified
// Type 99A print-loft hull, carried here unchanged from modern2.ts. Every triangle is first-party procedural geometry;
// no source mesh is loaded. Authorship: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab, muzzleTipDot } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { eraCassette } from './modernizationFittings.ts';
import { equipmentFoot, lowOptic, permanentParts, serviceCable, serviceCase } from './nationalChina.ts';
import { place } from '../accessoryPrimitives.ts';
import { machinedRing } from '../machineGunGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Vec3 = [number, number, number];
type ZY = readonly [number, number];

const D2R = Math.PI / 180;

/** Turret frame (gameplay datums, unchanged by the redesign): pivot, trunnion and the 6.454 m gun. */
const PIVOT: Vec3 = [0, 1.57, 0.64];
const TRUNNION: Vec3 = [0, 0.3198, 0.74];
const GUN_LENGTH = 6.454;

/** Turret roof and the front package's raised top (turret-local). */
const ROOF_Y = 0.70;
const PACKAGE_TOP_Y = 0.712;

/**
 * The terraced front's lower-tier face (turret-local): a plane through the bottom front line z = f(|x|) at y 0.02,
 * leaning back 4.8 degrees. f runs 1.22 at the gun throat (|x| 0.36) to 0.86 at the outer corner (|x| 1.58): a 16.4
 * degree blunt prow in plan.
 */
const THROAT_X = 0.36;
const LOWER_OUTER_X = 1.58;
const UPPER_OUTER_X = 1.48;
const FRONT_Z0 = 1.22;
const FRONT_RAKE = 0.295;
const FRONT_LEAN = 0.03 / 0.36;
const LOWER_TOP_Y = 0.38;
const STEP_SETBACK = 0.26;
const STEP_TOP_Y = 0.47;
const UPPER_LEAN = 0.06;
const frontZ = (ax: number): number => FRONT_Z0 - (ax - THROAT_X) * FRONT_RAKE;
/** The tiers' outer corners are bevelled 45 degrees in plan: the lower from |x| 1.40, the upper from |x| 1.30. */
const LOWER_BEVEL_X = 1.40;
const UPPER_BEVEL_X = 1.30;
const bevel = (ax: number, from: number): number => Math.max(0, ax - from);
const lowerFaceZ = (ax: number, y: number): number => frontZ(ax) - FRONT_LEAN * (y - 0.02);
/** The lower tier's underside: 0.02 at the throat, lifted to 0.08 at the outer corner, which sweeps r 1.80 over the
 * front deck's glacis shoulders (their tops reach local 0.03 there). */
const lowerBottomY = (ax: number): number => 0.02 + 0.06 * (ax - THROAT_X) / (LOWER_OUTER_X - THROAT_X);

function mirrorRing(ring: readonly SectionPoint[]): SectionPoint[] {
  return ring.map(([x, y]) => [-x, y] as const).reverse();
}

function signedArea(ring: readonly SectionPoint[]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area;
}

/** A closed solid lofted along +X from per-station (z, y) profiles: sectionSolid's loft turned onto the X axis. */
function loftX(stations: readonly { x: number; ring: readonly ZY[] }[]): THREE.BufferGeometry {
  const sorted = [...stations].sort((a, b) => a.x - b.x);
  let rings: SectionPoint[][] = sorted.map(({ ring }) => ring.map(([z, y]) => [-z, y] as const));
  if (signedArea(rings[0]) < 0) rings = rings.map((ring) => [...ring].reverse());
  const geometry = sectionSolid(sorted.map((station, i) => ({ z: station.x, ring: rings[i] })));
  // (a, y, x) -> (x, y, -a): a proper rotation, so the outward winding holds
  return geometry.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
}

/** Euler angles taking a box's X/Y/Z onto (u, n, u x n): its width along u, its thickness along the face normal n. */
function faceEuler(n: THREE.Vector3): Vec3 {
  const u = new THREE.Vector3(n.z, 0, -n.x).normalize();
  const w = new THREE.Vector3().crossVectors(u, n);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, n, w));
  return [e.x, e.y, e.z];
}

// ---------------------------------------------------------------------------
// Structural hull — the certified Type 99A print-loft hull (modern2.ts through release 232), unchanged.
// ---------------------------------------------------------------------------
// §D frame: width anchor ±1.85; thick hull body -3.592..+3.52 m with a supported recovery loop to -4.242 m. Deck 1.50
// front / 1.78 powerpack deck rear (ramp z -1.02..-1.42); glacis = two real planes (16.3-deg upper + 62-deg nose, break
// at z 3.02 / y 1.215). Six wheel stations (pitch 0.901, r 0.405).
function buildLongweiHullStructure(P: TankBuilderPort): void {
  const { box, frustum, cylY, buildRunningGear, fenders, periscope, liftEye } = KIT;
  const slab = orientedSlab;
  buildRunningGear(P, {
    // Loose-part measurements of the reference running gear (datums only): r 0.405 m, 0.901 m pitch, the row 14 mm
    // forward; the wheels and linked course are the native system.
    style: 'rubber', wheelR: 0.405, wheelW: 0.24, wheelY: 0.4905, xc: 1.473,
    dishR: 0.80,
    wheelZs: [2.266, 1.365, 0.464, -0.436, -1.337, -2.238],
    // Visible end-wheel radii stay source-exact while the linked course uses the lower pitch radii, keeping the shoes
    // under the measured y 1.276 course ceiling.
    sprocket: { z: -3.066, y: 0.903, r: 0.385, trackR: 0.20 },
    idler: { z: 3.069, y: 0.919, r: 0.255, trackR: 0.18 },
    rollers: [1.60, 0.15, -1.30].map((z) => ({ z, y: 1.14, r: 0.08 })),
    trackW: 0.629, topY: 1.276, botY: 0.025, arms: true, paintedEnds: true, coveredTop: 1.0,
    contactZR: -2.35,
  });
  // ---- hull core: raised central tub between the tracks (real suspension negative space) + full-width decks ----
  P.add('hull', box(2.20, 0.625, 6.82), 0, 0.9925, -0.182);                    // belly ±1.10, y 0.68..1.305
  P.add('hull', box(3.40, 0.16, 3.06), 0, 1.42, 0.50);                         // front sponson band ±1.70, y 1.34..1.50
  P.add('hull', frustum(1.70, -1.02, -1.06, 1.70, -1.28, -1.42, 1.50, 1.78));  // powerpack ramp (one raked course)
  P.add('hull', box(3.40, 0.44, 2.26), 0, 1.56, -2.53);                        // raised rear deck ±1.70, y 1.34..1.78
  P.add('hull', cylY(0.86, 0.86, 0.07, P.q ? 28 : 18), 0, 1.475, 0.28);        // turret ring seat
  // The fender's outer edge runs 5 mm into the skirt's top band (inner face 1.835).
  fenders(P, 1.12, 1.84, 1.47, -3.59, 3.46, 0.03);
  // ---- GLACIS — two real planes: upper 16.3 deg y(z) = 1.50 - 0.284(z - 2.02) to the nose break (3.02, 1.215), then
  // the 62-deg nose plate to the toe (3.30, 0.70); the lower bow drops to the belly. ----
  P.add('hull', slab(                                                          // upper glacis center lane
    [-1.08, 1.215, 3.02], [1.08, 1.215, 3.02], [1.08, 1.165, 2.90], [-1.08, 1.165, 2.90],
    [-1.08, 1.50, 2.02], [1.08, 1.50, 2.02], [1.08, 1.50, 1.84], [-1.08, 1.50, 1.84]));
  // Raised outer shoulder skins continue the glacis while leaving the terminal track lanes open underneath; their rear
  // faces are 28-deg ramps that take the sky (round 3, 2026-10-07).
  P.add('hull', slab(
    [1.08, 1.50, 2.90], [1.70, 1.50, 2.90], [1.70, 1.47, 1.84], [1.08, 1.47, 1.84],
    [1.08, 1.56, 3.02], [1.70, 1.56, 3.02], [1.70, 1.658, 2.20], [1.08, 1.658, 2.20]));
  P.add('hull', slab(
    [-1.70, 1.50, 2.90], [-1.08, 1.50, 2.90], [-1.08, 1.47, 1.84], [-1.70, 1.47, 1.84],
    [-1.70, 1.56, 3.02], [-1.08, 1.56, 3.02], [-1.08, 1.658, 2.20], [-1.70, 1.658, 2.20]));
  // Inner cheeks of the raised shoulders close the track lane's void under the skins' inner edges.
  for (const s of [-1, 1]) {
    const xi = s * 1.052, xo = s * 1.100;
    P.add('hull', slab(
      [xi, 1.48, 2.00], [xo, 1.48, 2.00], [xo, 1.206, 2.98], [xi, 1.206, 2.98],
      [xi, 1.495, 2.00], [xo, 1.495, 2.00], [xo, 1.50, 2.98], [xi, 1.50, 2.98]));
  }
  P.add('hull', slab(                                                          // 62-deg nose plate
    [-1.08, 0.70, 3.30], [1.08, 0.70, 3.30], [1.08, 0.70, 3.18], [-1.08, 0.70, 3.18],
    [-1.08, 1.215, 3.02], [1.08, 1.215, 3.02], [1.08, 1.215, 2.86], [-1.08, 1.215, 2.86]));
  P.add('hull', slab(                                                          // lower bow lane to the belly
    [-1.08, 0.385, 3.34], [1.08, 0.385, 3.34], [1.08, 0.385, 3.20], [-1.08, 0.385, 3.20],
    [-1.08, 0.70, 3.30], [1.08, 0.70, 3.30], [1.08, 0.70, 3.16], [-1.08, 0.70, 3.16]));
  for (const s of [-1, 1]) {                                                   // glacis-to-sponson shoulder wedges
    P.add('hull', slab(
      [s * 1.08, 1.50, 3.10], [s * 1.70, 1.50, 2.96], [s * 1.70, 1.48, 2.86], [s * 1.08, 1.48, 3.00],
      [s * 1.08, 1.57, 3.02], [s * 1.70, 1.57, 2.90], [s * 1.70, 1.52, 2.82], [s * 1.08, 1.52, 2.94]));
  }
  // ---- dozer blade under the bow, on two ram arms to the belly ----
  P.add('hull', box(2.10, 0.15, 0.50), 0, 0.465, 2.74);
  P.add('hullDark', box(2.06, 0.05, 0.06), 0, 0.42, 2.99);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.10, 0.30, 0.55), s * 0.72, 0.545, 2.42);
  // ---- front mudguards + flaps ----
  for (const s of [-1, 1]) {
    P.add('hull', box(0.68, 0.035, 0.30), s * 1.47, 1.455, 3.40);
    P.hangMudguard('ztz99-longwei-front-flap', 'hullRubber', box(0.60, 0.34, 0.028), s * 1.46, 0.91, 3.50);
    P.add('hullDetail', box(0.12, 0.135, 0.20), s * 1.78, 1.3725, 3.43);       // hanger bracket into the fender nose
  }
  // ---- stern: split transom (the low service face between the track lanes, outboard shoulders over the shoes) ----
  P.add('hull', box(2.16, 0.86, 0.10), 0, 1.34, -3.47);
  for (const s of [-1, 1]) P.add('hull', box(0.52, 0.30, 0.10), s * 1.42, 1.62, -3.47);
  P.add('hull', box(2.06, 0.55, 0.09), 0, 0.68, -3.48);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.58, 0.26, 0.05), s * 0.86, 1.58, -3.535);          // exhaust grilles
    for (const k of KIT.grilleIndices(P.q, 4, 2)) {
      P.add('hullDetail', box(0.54, 0.03, 0.05), s * 0.86, 1.49 + k * 0.06, -3.55);
    }
    P.add('hullRubber', box(0.60, 0.24, 0.028), s * 1.46, 1.62, -3.50);        // compact rear flaps above the wrap
    P.add('hullDetail', box(0.07, 0.10, 0.09), s * 1.62, 1.54, -3.515);        // flap hinge straps
    P.add('hullDetail', box(0.07, 0.10, 0.09), s * 1.30, 1.54, -3.515);
    P.add('hullDetail', box(0.10, 0.16, 0.12), s * 0.65, 1.10, -3.54);         // tow hooks
  }
  // convoy light plate, high on the transom over the stern box (the 99A's left-side exhaust port is gone: the slat
  // cage hangs there and the engine breathes through the rear grilles)
  P.add('hullDetail', box(0.30, 0.18, 0.04), 0, 1.68, -3.54);
  // The 7.76 m hull envelope ends in a broad recovery loop behind the -3.47 m transom: a shallow backed tray to z -4.25
  // with the cable lying flat in it, its eyes and run clipped down.
  P.add('hull', box(1.76, 0.040, 0.68), 0, 1.45, -3.91);
  P.hullG.add(FITTINGS.towCable({ mats: P.mats, r: 0.024, seed: 12,
    pts: [
      [-0.70, 1.494, -4.10], [-0.55, 1.494, -4.135], [-0.30, 1.494, -4.205],
      [0, 1.494, -4.24], [0.30, 1.494, -4.205], [0.55, 1.494, -4.135],
      [0.70, 1.494, -4.10],
    ] }));
  for (const x of [-0.78, 0.78]) P.add('hullDetail', box(0.06, 0.03, 0.06), x, 1.484, -4.085);
  for (const x of [-0.42, 0.42]) P.add('hullDetail', box(0.05, 0.03, 0.05), x, 1.484, -4.18);
  // ---- driver's center hatch and periscopes on the 16.3-deg plane ----
  P.add('hull', box(0.50, 0.05, 0.42), 0, 1.44, 2.22, -16.3 * D2R, 0, 0);
  P.add('hullDark', box(0.44, 0.02, 0.36), 0, 1.468, 2.21, -16.3 * D2R, 0, 0);
  periscope(P, 'hullDetail', -0.14, 1.505, 1.94);
  periscope(P, 'hullDetail', 0.14, 1.505, 1.94);
  // ---- engine deck: grille field, intake mesh and the low filter hump; lift eyes ----
  P.add('hullDark', box(1.55, 0.02, 1.30), 0, 1.785, -2.35);
  for (const k of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDetail', box(1.45, 0.02, 0.055), 0, 1.792, -1.90 - k * 0.16);
  }
  P.add('hullDark', box(0.72, 0.02, 0.52), -0.52, 1.79, -1.62);
  P.add('hull', box(0.92, 0.05, 0.72), 0.48, 1.795, -1.72);
  P.add('hullDark', box(0.80, 0.02, 0.60), 0.48, 1.825, -1.72);
  liftEye(P, 'hullDetail', -1.30, 1.52, 1.70);
  liftEye(P, 'hullDetail', 1.30, 1.52, 1.70);
  liftEye(P, 'hullDetail', -1.30, 1.80, -3.05);
  liftEye(P, 'hullDetail', 1.30, 1.80, -3.05);
}

// ---------------------------------------------------------------------------
// Hull dress
// ---------------------------------------------------------------------------

/** Glacis plane: the point s metres down-slope from the deck edge (z 2.02) at x. */
const GLACIS_SIN = Math.sin(16.3 * D2R), GLACIS_COS = Math.cos(16.3 * D2R);
const glacisY = (z: number): number => 1.50 - 0.284 * (z - 2.02);

/**
 * The straight FY-5 glacis field: per side three columns in two rows plus one lower centre brick, square to the hull
 * (the 99A family's field is a chevron). The driver's hatch (x ±0.25, z 1.99..2.43) keeps its lane; every brick top
 * stays 15 cm or more under the main gun at full depression.
 */
function addGlacisField(P: TankBuilderPort): void {
  const bricks = (side: number): [number, number][] => [
    [0.52, 0.30], [0.86, 0.30], [1.20, 0.30],
    [0.18, 0.68], [0.52, 0.68], [0.86, 0.68], [1.20, 0.68],
  ].map(([x, s]) => [side * x, s]);
  const w = 0.30, h = 0.34, d = 0.07;
  for (const side of [-1, 1] as const) {
    P.eraCluster(side < 0 ? 'glacis_era_L' : 'glacis_era_R', (put) => {
      for (const [x, s] of bricks(side)) {
        // bedded 5 mm into the plate along its normal (0, cos, sin)
        const out = d / 2 - 0.005;
        put(x, 1.50 - s * GLACIS_SIN + out * GLACIS_COS, 2.02 + s * GLACIS_COS + out * GLACIS_SIN,
          -73.7 * D2R, 0, 0, w / 0.28, h / 0.13, d / 0.07);
      }
    });
  }
}

/**
 * Low armoured lamp cowls on the glacis's front corners, ahead of the brick field: the underside follows the plate at
 * three stations (6 mm in), the top is flat 95 mm over the plate's rear edge, the paired round lenses sit in the front
 * face under a proud brow. The main gun at -7 degrees passes 20 cm over them.
 */
function addGlacisLamps(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const zr = 2.90, zf = 3.00, w = 0.26, top = glacisY(zr) + 0.095;
  for (const side of [-1, 1]) {
    const x = side * 1.00;
    P.addEquipment('hullDetail', sectionSolid([zr, (zr + zf) / 2, zf].map((z) => ({
      z, ring: [[x - w / 2, glacisY(z) - 0.006], [x + w / 2, glacisY(z) - 0.006], [x + w / 2, top], [x - w / 2, top]] as SectionPoint[],
    }))));
    P.addEquipment('hullDetail', box(w + 0.012, 0.016, 0.045), x, top - 0.005, zf + 0.0125);
    for (const dx of [-0.059, 0.059]) {
      P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.040, 0.016, 16), 'headlight'), x + dx, top - 0.052, zf + 0.006);
    }
  }
}

/**
 * Skirts: a continuous top band on the fender edge, a painted carrier over the front five metres carrying two staggered
 * courses of FY-5 bricks, and slat armour over the engine bay. Everything stays inside the ±1.866 m width envelope and
 * 4.5 cm or more outside the track's outer face (1.76).
 */
function addSkirts(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const bandIn = 1.835, bandOut = 1.857, carrierIn = 1.818, carrierOut = 1.836;
  const carrierFront = 3.30, carrierRear = -1.62, slatFront = -1.66, slatRear = -3.42;
  const carrierBottom = (z: number): number => z <= 2.55 ? 0.52 : 0.52 + (z - 2.55) / (carrierFront - 2.55) * 0.40;
  for (const side of [-1, 1] as const) {
    const ring = (inner: number, outer: number, low: number, high: number): SectionPoint[] => {
      const r: SectionPoint[] = [[inner, low], [outer, low], [outer, high], [inner, high]];
      return side > 0 ? r : mirrorRing(r);
    };
    // top band from the bow to the stern, on the fender's outer edge
    P.add('hull', sectionSolid([
      { z: slatRear, ring: ring(bandIn, bandOut, 1.225, 1.47) },
      { z: carrierFront, ring: ring(bandIn, bandOut, 1.225, 1.47) },
    ]));
    // front carrier: its nose rakes up 0.40 m over the last 0.75 m
    P.add('hull', sectionSolid([carrierRear, 2.55, 2.95, carrierFront].map((z) => ({
      z, ring: ring(carrierIn, carrierOut, carrierBottom(z), 1.30),
    }))));
    // the bow cap: a 48 mm edge over the carrier's and the band's front ends, so the skirt ends square, not in a sheet
    P.add('hull', KIT.box(0.048, 1.47 - carrierBottom(carrierFront), 0.04), side * 1.842,
      (1.47 + carrierBottom(carrierFront)) / 2, carrierFront - 0.01);
    // two courses of bricks, the lower one staggered by half a brick
    const sector = side < 0 ? 'skirt_era_L' : 'skirt_era_R';
    const brickL = 0.58, gap = 0.035, pitch = brickL + gap, t = 0.022;
    const courses: [number, number, number, number][] = [
      // [first front z, count, bottom y, top y]
      [2.80, 7, 0.905, 1.215],
      [2.80 - pitch / 2, 6, 0.565, 0.875],
    ];
    for (const [front, count, low, high] of courses) {
      for (let i = 0; i < count; i++) {
        const z = front - brickL / 2 - i * pitch;
        eraCassette(P, 'hull', sector, [side * (carrierOut + t / 2 - 0.002), (low + high) / 2, z], [t, high - low, brickL]);
      }
    }
    // bolt heads along the carrier's bottom edge between the bricks
    for (let i = 1; i < 7; i++) {
      const z = 2.80 - i * pitch + gap / 2;
      P.add('hullDark', cylX(0.011, 0.012, 8), side * (carrierOut + 0.004), 0.545, z);
    }
    // slat armour: seven flat bars on four posts, hung from the band, a bottom rail
    const slatIn = 1.806, slatOut = 1.862, slatX = side * (slatIn + slatOut) / 2, slatW = slatOut - slatIn;
    const length = slatFront - slatRear, mid = (slatFront + slatRear) / 2;
    for (let k = 0; k < 7; k++) {
      P.add('hullOpenLattice', box(slatW, 0.014, length), slatX, 0.62 + k * 0.10, mid);
    }
    P.add('hullOpenLattice', box(slatW, 0.03, length), slatX, 0.575, mid);
    for (const z of [slatFront - 0.02, -2.25, -2.84, slatRear + 0.02]) {
      P.add('hullOpenLattice', box(slatW, 0.70, 0.03), slatX, 0.92, z);
      // each post's hanger: from the band's inner face up under the fender
      P.add('hullOpenLatticeDark', box(0.05, 0.06, 0.05), side * 1.83, 1.255, z);
    }
  }
  P.decal('hull', 'number', P.spec.visual.number || '', 0.22, [bandOut + 0.001, 1.345, 1.60], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.22, [-bandOut - 0.001, 1.345, 1.60], -Math.PI / 2);
}

/** Low painted bins on the rear fenders, 10 cm tall so the bustle's 0.36 underside clears them at every yaw. */
function addDeckStowage(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    for (const z of [-2.25, -3.02]) {
      P.addEquipment('hullDetail', box(0.30, 0.068, 0.66), side * 1.52, 1.78 + 0.034, z);
      // the lid: 5 mm proud of the body all round (its overhang is the seam), a hinge bar along its inboard edge
      P.addEquipment('hullDetail', box(0.31, 0.014, 0.67), side * 1.52, 1.853, z);
      P.addEquipment('hullDark', box(0.016, 0.012, 0.56), side * 1.367, 1.853, z);
      for (const dz of [-0.20, 0.20]) P.addEquipment('hullDark', box(0.016, 0.045, 0.05), side * 1.672, 1.82, z + dz); // latches
    }
  }
}

/**
 * A low armoured tool box on the recovery tray's forward half (where the 99A family carries fuel drums), between the
 * two exhaust grilles and under the convoy light: bevelled, two latches, a hinge line and two webbing straps.
 */
function addSternBin(P: TankBuilderPort): void {
  const { box } = KIT;
  const x0 = -0.46, x1 = 0.46, z0 = -3.92, z1 = -3.62, y0 = 1.466, y1 = 1.62;
  const ring: SectionPoint[] = [[x0, y0], [x1, y0], [x1, y1 - 0.03], [x1 - 0.03, y1], [x0 + 0.03, y1], [x0, y1 - 0.03]];
  P.addEquipment('hullDetail', sectionSolid([{ z: z0, ring }, { z: z1, ring }]));
  P.addEquipment('hullDark', box(x1 - x0 - 0.08, 0.012, 0.012), 0, y1 - 0.004, z1 - 0.02);   // hinge line
  for (const x of [-0.24, 0.24]) {
    P.addEquipment('hullDark', box(0.06, 0.06, 0.016), x, y1 - 0.06, z0 - 0.004);              // latches
    P.addEquipment('hullCloth', box(0.05, y1 - y0 + 0.012, z1 - z0 + 0.012), x * 1.45, (y0 + y1) / 2 + 0.005, (z0 + z1) / 2);
  }
}

/**
 * A bolted towing beam across the 62-degree nose plate (y 0.70 at z 3.30 to 1.215 at 3.02), 0.30 m down from the
 * nose break: a 0.14 m deep, 0.06 m proud bevelled section bedded 8 mm into the plate, from |x| 0.98, with eight bolt
 * heads and a towing eye on a lug at each end. It breaks the tall nose into two courses; the gun at -7 degrees passes
 * 0.35 m over it.
 */
function addNoseBeam(P: TankBuilderPort): void {
  const { cylY, torus, box } = KIT;
  const up = new THREE.Vector3(0, 0.515, -0.28).normalize(), n = new THREE.Vector3(0, -up.z, up.y);
  const at = (s: number, out: number): THREE.Vector3 =>
    new THREE.Vector3(0, 1.215, 3.02).addScaledVector(up, -s).addScaledVector(n, out);
  const section: ZY[] = [[0.37, -0.008], [0.36, 0.06], [0.24, 0.06], [0.23, -0.008]]
    .map(([s, out]) => { const p = at(s, out); return [p.z, p.y] as const; });
  P.add('hullDetail', loftX([-0.98, 0.98].map((x) => ({ x, ring: section }))));
  const face = at(0.30, 0.06), tilt = Math.atan2(n.z, n.y);
  for (const x of [-0.84, -0.56, -0.28, -0.08, 0.08, 0.28, 0.56, 0.84]) {
    P.add('hullDark', place(cylY(0.016, 0.016, 0.012, 8), x, face.y + n.y * 0.004, face.z + n.z * 0.004, tilt));
  }
  // a lug off the beam's lower face, the eye standing face-forward through it, 2 cm clear of the plate at its foot
  const lug = at(0.37, 0.035);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.05, 0.10, 0.10), side * 0.92, lug.y - 0.045, lug.z + 0.03);
    P.add('hullDark', place(torus(0.045, 0.014, 12), side * 0.92, lug.y - 0.10, lug.z + 0.055, Math.PI / 2));
  }
}

function dressLongweiHull(P: TankBuilderPort): void {
  addGlacisField(P);
  addNoseBeam(P);
  addGlacisLamps(P);
  addSkirts(P);
  addDeckStowage(P);
  addSternBin(P);
  P.topY = 1.40;
}

// ---------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------

/** The cast/welded core: a long box with a lower chamfer belt and a roof chamfer; its underside lifts from 0.02 to
 * 0.34 over z -1.10..-1.75 so the bustle clears the raised engine deck (local 0.21, dress to 0.29) at every yaw. */
function addTurretCore(P: TankBuilderPort): void {
  const ring = (yb: number, xb: number, xs: number, xt: number, xr: number): SectionPoint[] => [
    [-xb, yb], [xb, yb], [xs, yb + 0.16], [xt, 0.64], [xr, ROOF_Y], [-xr, ROOF_Y], [-xt, 0.64], [-xs, yb + 0.16],
  ];
  P.add('turret', sectionSolid([
    { z: -2.86, ring: ring(0.40, 0.94, 1.16, 1.10, 1.00) },
    { z: -2.76, ring: ring(0.34, 1.02, 1.26, 1.20, 1.10) },
    { z: -1.75, ring: ring(0.34, 1.05, 1.30, 1.24, 1.14) },
    { z: -1.10, ring: ring(0.02, 1.15, 1.40, 1.30, 1.20) },
    { z: 0.72, ring: ring(0.02, 1.15, 1.40, 1.30, 1.20) },
  ]));
  // ring collar: bedded 20 mm into the 1.50 deck, its top 20 mm into the core's underside
  P.add('turret', KIT.cylY(1.08, 1.12, 0.13, P.q ? 32 : 20), 0, -0.025, 0);
}

/**
 * The terraced front package, one welded block pair a side: the lower tier (FY-5 bricks on its 4.8-deg face), the
 * step and the upper tier set back 0.26 m, both tiers bevelled 45 degrees at their outer corners. The throat walls
 * stand at |x| 0.36 (lower) and 0.365 (upper, 5 mm behind the lower so the two faces never share a plane); the upper
 * top rides 12 mm proud of the roof and chamfers into it.
 */
function addFrontPackage(P: TankBuilderPort): void {
  const stations = (sign: number, from: number, to: number, ring: (ax: number) => ZY[]) =>
    [from, (from + to) / 2, to].map((ax) => ({ x: sign * ax, ring: ring(ax) }));
  // the block's rear reaches into the core (0.55) or, outboard of the core's belt, into the side module (0.30)
  const rearZ = (ax: number): number => ax > 1.30 ? 0.30 : 0.55;
  for (const sign of [-1, 1]) {
    const lower = (ax: number): ZY[] => {
      const yb = lowerBottomY(ax), b = bevel(ax, LOWER_BEVEL_X), zt = lowerFaceZ(ax, LOWER_TOP_Y) - b;
      return [[lowerFaceZ(ax, yb) - b, yb], [zt, LOWER_TOP_Y], [zt - STEP_SETBACK, STEP_TOP_Y],
        [rearZ(ax), STEP_TOP_Y], [rearZ(ax), yb]];
    };
    P.add('turret', loftX([
      ...stations(sign, THROAT_X, 1.30, lower),
      ...[1.31, LOWER_BEVEL_X, LOWER_OUTER_X].map((ax) => ({ x: sign * ax, ring: lower(ax) })),
    ]));
    const upper = (ax: number): ZY[] => {
      const zu = lowerFaceZ(ax, LOWER_TOP_Y) - STEP_SETBACK - bevel(ax, UPPER_BEVEL_X);
      const topRear = Math.min(0.48, zu - 0.16), rear = Math.min(0.30, topRear - 0.12);
      return [[zu, 0.44], [zu - UPPER_LEAN, 0.655], [zu - UPPER_LEAN - 0.04, PACKAGE_TOP_Y], [topRear, PACKAGE_TOP_Y],
        [topRear - 0.08, 0.69], [rear, 0.69], [rear, 0.44]];
    };
    P.add('turret', loftX([
      ...stations(sign, THROAT_X + 0.005, UPPER_BEVEL_X, upper),
      { x: sign * UPPER_OUTER_X, ring: upper(UPPER_OUTER_X) },
    ]));
    // FY-5 bricks on the lower tier's flat face: three a side, 6 mm into it
    const n = new THREE.Vector3(sign * FRONT_RAKE, FRONT_LEAN, 1).normalize();
    const rotation = faceEuler(n), thick = 0.07, h = 0.26, w = 0.32, yc = 0.22;
    for (const ax of [0.555, 0.885, 1.215]) {
      const c = new THREE.Vector3(sign * ax, yc, lowerFaceZ(ax, yc)).addScaledVector(n, thick / 2 - 0.006);
      eraCassette(P, 'turret', sign < 0 ? 'turret_era_L' : 'turret_era_R', c.toArray(), [w, thick, h], rotation);
    }
    // bolt rows across the upper tier's face
    const nu = new THREE.Vector3(sign * FRONT_RAKE, UPPER_LEAN / 0.215, 1).normalize();
    for (const ax of [0.55, 0.85, 1.15]) {
      for (const y of [0.50, 0.62]) {
        const z = lowerFaceZ(ax, LOWER_TOP_Y) - STEP_SETBACK - UPPER_LEAN * (y - 0.44) / 0.215;
        const bolt = KIT.cylY(0.014, 0.014, 0.016, 8);
        bolt.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nu));
        P.add('turretDark', bolt, sign * ax, y, z + 0.004);
      }
    }
  }
  // brow over the gun throat: from the core's front to 0.84, its underside 0.64 (the mantlet's top-rear corner rises
  // to 0.587 at full elevation, 3 cm under it), 5 mm into each upper block
  P.add('turret', KIT.box(0.74, PACKAGE_TOP_Y - 0.64, 0.14), 0, (PACKAGE_TOP_Y + 0.64) / 2, 0.77);
}

/** Three spaced composite modules a side, their bevelled lower lips at 0.22 (the rear one sweeps r 2.00 over the
 * powerpack ramp, local 0.17 there), inner faces bedded into the core's belt. */
function addSideModules(P: TankBuilderPort): void {
  const { cylX } = KIT;
  const spans: [number, number][] = [[0.66, 0.10], [0.06, -0.50], [-0.54, -1.08]];
  const base: SectionPoint[] = [[1.30, 0.22], [1.63, 0.22], [1.68, 0.27], [1.68, 0.60], [1.645, 0.645], [1.30, 0.645]];
  // the forward module's front-outer edge is chamfered back 0.14 m, following the front tiers' bevel
  const chamfered: SectionPoint[] = base.map(([x, y]) => [1.30 + (x - 1.30) * 0.62, y] as const);
  for (const side of [-1, 1]) {
    const ring = side > 0 ? base : mirrorRing(base), nose = side > 0 ? chamfered : mirrorRing(chamfered);
    for (const [front, rear] of spans) {
      P.addExternalArmor('turret', sectionSolid(front === 0.66
        ? [{ z: rear, ring }, { z: front - 0.14, ring }, { z: front, ring: nose }]
        : [{ z: rear, ring }, { z: front, ring }]));
      // bolt heads on the flat outer face (the forward module's chamfer starts 0.14 m behind its front)
      for (const z of [front - (front === 0.66 ? 0.20 : 0.08), rear + 0.08]) for (const y of [0.30, 0.54]) {
        P.add('turretDark', cylX(0.013, 0.012, 8), side * 1.685, y, z);
      }
    }
  }
}

/** Square box mantlet on the trunnion (gun frame), 5 cm clear of the throat walls; a muzzle-side collar, the coaxial
 * port on its right and four face bolts. */
function addMantlet(P: TankBuilderPort): void {
  const { cylZ } = KIT;
  const ring = (hw: number, lo: number, hi: number, c: number): SectionPoint[] => [
    [-hw + c, lo], [hw - c, lo], [hw, lo + c], [hw, hi - c], [hw - c, hi], [-hw + c, hi], [-hw, hi - c], [-hw, lo + c],
  ];
  P.add('gunMount', sectionSolid([
    { z: 0.10, ring: ring(0.31, -0.27, 0.25, 0.03) },
    { z: 0.40, ring: ring(0.31, -0.27, 0.25, 0.03) },
    { z: 0.46, ring: ring(0.28, -0.24, 0.22, 0.05) },
  ]));
  P.add('gunMount', cylZ(0.17, 0.08, P.q ? 28 : 16), 0, 0, 0.50);
  P.add('gunMountDark', cylZ(0.035, 0.03, 12), 0.20, -0.07, 0.465);
  for (const [x, y] of [[-0.20, 0.15], [0.20, 0.15], [-0.20, -0.17], [0.08, -0.17]]) {
    P.add('gunMountDark', cylZ(0.016, 0.014, 8), x, y, 0.462);
  }
}

/** ZPT-98-class 125 mm tube: a mid-barrel evacuator between two thermal-sleeve runs, a thick muzzle end and an MRS. */
function addLongweiGun(P: TankBuilderPort): void {
  const { cylZ, torus, box } = KIT;
  const len = GUN_LENGTH, seg = P.q ? 24 : 14;
  KIT.buildGun(P, { len, r: 0.071, sleeve: false, collar: false, baseR: 0.105, evac: 0.40, evacR: 1.62 });
  for (const [start, end, r0, r1] of [[1.30, 2.12, 0.100, 0.097], [3.04, 4.30, 0.093, 0.089]]) {
    P.add('gun', cylZ(r0, end - start, seg, r1), 0, 0, (start + end) / 2);
    for (const z of [start, end]) P.add('gunDark', torus(z === start ? r0 + 0.002 : r1 + 0.002, 0.010, seg), 0, 0, z, Math.PI / 2, 0, 0);
  }
  P.add('gunDark', cylZ(0.080, 0.22, seg), 0, 0, len - 0.11);
  // muzzle reference mirror on its clamp band
  P.add('gunDark', torus(0.076, 0.010, seg), 0, 0, len - 0.42, Math.PI / 2, 0, 0);
  P.add('gunDark', box(0.06, 0.035, 0.09), 0, 0.098, len - 0.42);
  muzzleTipDot(P, 0, 0, len + 0.012, 0.057, { parent: 'gunG' });
  P.muzzleZ = len;
}

/** The bustle's side bins (two a side, lids and latches), the blow-off panels over the ammunition compartment and the
 * rear basket. Bins bottom at 0.36 and the basket floor at 0.38: the engine deck's dress tops out at local 0.29. */
function addBustle(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    const base: SectionPoint[] = [[1.06, 0.36], [1.52, 0.36], [1.56, 0.40], [1.56, 0.66], [1.53, 0.69], [1.06, 0.69]];
    const ring = side > 0 ? base : mirrorRing(base);
    for (const [front, rear] of [[-1.16, -1.86], [-1.92, -2.62]]) {
      P.addEquipment('turretDetail', sectionSolid([{ z: rear, ring }, { z: front, ring }]));
      P.addEquipment('turretDark', box(0.012, 0.010, front - rear - 0.04), side * 1.561, 0.62, (front + rear) / 2);  // lid line
      for (const dz of [-0.18, 0.18]) {
        P.addEquipment('turretDark', box(0.016, 0.06, 0.045), side * 1.566, 0.57, (front + rear) / 2 + dz);       // latches
      }
    }
  }
  // blow-off panels: two framed plates over the ammunition compartment, each with a lifting handle
  for (const x of [-0.42, 0.42]) {
    P.add('turretDark', box(0.80, 0.012, 0.82), x, ROOF_Y + 0.004, -2.25);
    P.add('turretDetail', box(0.76, 0.022, 0.78), x, ROOF_Y + 0.011, -2.25);
    P.addEquipment('turretDark', box(0.14, 0.022, 0.022), x, ROOF_Y + 0.03, -2.25);
  }
  // rear basket against the rear wall, floor at 0.38
  const rack = FITTINGS.stowageRack({
    mats: P.mats, w: 2.20, d: 0.46, h: 0.30, posts: 7, fill: 0.82, rails: 2, mesh: true,
    rotation: [0, Math.PI, 0], seed: 23310,
  });
  rack.position.set(0, 0.38, -3.065);
  rack.rotation.set(0, Math.PI, 0);
  P.turretG.add(rack);
}

/** One GL-5-style radar housing angled `yaw` from the turret's nose: a plinth bedded 30 mm into its seat, a deep
 * armoured box on it with the dark array face 3 mm into its front, and a rain lip over the face. */
function addRadarFace(P: TankBuilderPort, x: number, y: number, z: number, yaw: number): void {
  const { box } = KIT;
  const face = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  P.addEquipment('turretDetail', box(0.30, 0.07, 0.18), x, y + 0.005, z, 0, yaw, 0);
  P.addEquipment('turretDetail', box(0.34, 0.28, 0.13), x, y + 0.175, z, 0, yaw, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.29, 0.22, 0.012), x + face.x * 0.068, y + 0.17, z + face.z * 0.068, 0, yaw, 0);
  P.addEquipment('turretDetail', box(0.36, 0.018, 0.17), x + face.x * 0.02, y + 0.322, z + face.z * 0.02, 0, yaw, 0);
}

/** One two-cell hard-kill launcher on a low turntable base, its cells pitched 12 degrees up, facing `yaw`. */
function addLauncher(P: TankBuilderPort, x: number, y: number, z: number, yaw: number): void {
  const { box, cylY, cylZ } = KIT;
  P.addEquipment('turretDetail', cylY(0.13, 0.14, 0.05, P.q ? 20 : 12), x, y + 0.025 - 0.004, z);
  const pitch = -12 * D2R;
  const body = box(0.30, 0.16, 0.40);
  P.addEquipment('turretDetail', body, x, y + 0.05 + 0.08, z, pitch, yaw, 0);
  for (const dx of [-0.072, 0.072]) {
    const mouth = new THREE.Vector3(dx, 0, 0.20).applyEuler(new THREE.Euler(pitch, yaw, 0));
    P.addEquipment('turretDark', cylZ(0.055, 0.012, 14), x + mouth.x, y + 0.13 + mouth.y, z + mouth.z, pitch, yaw, 0);
  }
}

/** Hatch: lid on a machined race with a hinge block and two vision blocks. */
function addHatch(P: TankBuilderPort, x: number, z: number, hingeSide: number): void {
  const { cylY, box } = KIT;
  P.add('turretDetail', machinedRing(0.30, 0.345, 0.024, 0.004, P.q ? 28 : 16), x, ROOF_Y - 0.004, z);
  P.addHatch('turret', cylY(0.315, 0.315, 0.035, P.q ? 28 : 16), x, ROOF_Y + 0.020 + 0.0175 - 0.002, z);
  P.add('turretDark', box(0.10, 0.04, 0.10), x + hingeSide * 0.30, ROOF_Y + 0.035, z);
  for (const a of [-0.55, 0.55]) {
    KIT.periscope(P, 'turretDetail', x + Math.sin(a) * 0.43, ROOF_Y + 0.035, z + Math.cos(a) * 0.43, a);
  }
}

function addTurretRoof(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const parts = permanentParts(P, ['turret']);
  // gunner (left) and commander (right) hatches
  addHatch(P, -0.56, -0.52, -1);
  addHatch(P, 0.52, -0.62, 1);
  // gunner's primary sight: a low armoured box with a rain hood, left front behind the package
  lowOptic(P, parts, -0.70, 0.17, 0.40, 0.30, 0.44, false);
  // commander's panoramic sight on a mast, right front: foot, mast, head with front and rear windows, cap
  {
    const x = 0.78, z = 0.18, footTop = equipmentFoot(P, parts, x, z, 0.30, 0.30);
    P.addEquipment('turretDetail', cylY(0.16, 0.17, 0.06, P.q ? 24 : 14), x, footTop + 0.03 - 0.003, z);
    const mastTop = footTop + 0.55;
    P.addEquipment('turretDetail', cylY(0.065, 0.075, mastTop + 0.02 - footTop - 0.05, P.q ? 20 : 12), x, (footTop + 0.05 + mastTop + 0.02) / 2, z);
    const headY = mastTop + 0.15;
    P.addEquipment('turretDetail', box(0.36, 0.30, 0.34), x, headY, z);
    P.addModuleVisual('optics', 'turretGlass', box(0.24, 0.11, 0.020), x, headY + 0.02, z + 0.172);
    P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.09, 0.020), x, headY + 0.02, z - 0.172);
    P.addEquipment('turretDetail', box(0.38, 0.022, 0.40), x, headY + 0.16, z + 0.02);
    P.add('turretDark', box(0.30, 0.012, 0.012), x, headY + 0.085, z + 0.172);
  }
  // QJC-88 12.7 mm on a socket post behind the hatches, with its shield, on the working station's riding cradle
  {
    const x = 0.10, z = -1.20, roof = ROOF_Y;
    P.add('turretDetail', cylY(0.075, 0.085, 0.10, P.q ? 20 : 12), x, roof + 0.05 - 0.004, z);
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'qjc88', tone: 'two-tone', scale: 1.0, ammo: true, shield: true, elev: 0.03,
      seed: 23305, working: true, ridingCradle: true,
    });
    mg.position.set(x, roof + 0.096, z);
    P.turretG.add(mg);
  }
  // GL-5-style radar faces at the four corners, launchers on the roof sides
  for (const side of [-1, 1]) {
    addRadarFace(P, side * 1.18, PACKAGE_TOP_Y, 0.40, side * 0.75);
    addRadarFace(P, side * 0.95, ROOF_Y, -2.62, side * (Math.PI - 0.80));
    addLauncher(P, side * 1.02, ROOF_Y, -0.98, side * 0.32);
  }
  // the suite's processor case and its cables to the rear radar faces, routed round the blow-off panels
  serviceCase(P, parts, -0.46, -1.52, 0.42, 0.20, 0.30);
  serviceCable(P, parts, [[-0.46, -1.67], [-0.86, -1.75], [-0.86, -2.40], [-0.95, -2.58]], false);
  serviceCable(P, parts, [[-0.25, -1.67], [0.86, -1.75], [0.86, -2.40], [0.95, -2.58]], false);
  // smoke dischargers: two banks of four a side, each on a side module's top (0.645), fanned 35-56 degrees out and
  // 22 degrees up (the decor's cheek pair is dropped for this turret: decorations.ts)
  for (const side of [-1, 1]) {
    for (const [z, seed] of [[0.30, 23320], [-0.22, 23322]]) {
      const bank = FITTINGS.smokeBank({
        mats: P.mats, count: 4, r: 0.042, len: 0.26, spacing: 0.095,
        splay: side * 0.40, pitch: -0.38, arc: 0.36, seed: seed + (side > 0 ? 1 : 0),
      });
      bank.position.set(side * 1.47, 0.645 + 0.085, z);
      bank.rotation.set(0, side * 0.40, 0);
      P.turretG.add(bank);
    }
  }
  // antennas and the meteorological mast on the bustle
  for (const side of [-1, 1]) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: side < 0 ? 1.20 : 1.05, r: 0.011, seed: 23330 + side });
    whip.position.set(side * 1.00, ROOF_Y, -2.30);
    P.turretG.add(whip);
  }
  P.addEquipment('turretDetail', box(0.10, 0.02, 0.10), -0.30, ROOF_Y + 0.006, -2.80);
  P.addEquipment('turretDetail', cylY(0.018, 0.024, 0.36, 10), -0.30, ROOF_Y + 0.18 - 0.004, -2.80);
  P.addEquipment('turretDetail', box(0.16, 0.02, 0.02), -0.30, ROOF_Y + 0.36, -2.80);
  // lift eyes behind the front package's corners and on the bustle's rear edge
  for (const [x, z] of [[-1.15, 0.30], [1.15, 0.30], [-0.70, -2.78], [0.70, -2.78]]) {
    KIT.liftEye(P, 'turretDetail', x, ROOF_Y, z);
  }
  // turret numbers on the front side modules
  const num = P.spec.visual.number || '';
  P.decal('turret', 'number', num, 0.20, [1.682, 0.43, 0.36], Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-1.682, 0.43, 0.36], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.58);
}

function buildLongweiTurret(P: TankBuilderPort): void {
  P.turretG.position.set(...PIVOT);
  P.gunG.position.set(...TRUNNION);
  addTurretCore(P);
  addFrontPackage(P);
  addSideModules(P);
  addMantlet(P);
  addLongweiGun(P);
  addBustle(P);
  addTurretRoof(P);
  P.turretG.userData.longweiTurretReceipt = Object.freeze({
    architecture: 'longwei-terraced-r233',
    pivotLocalM: Object.freeze([...PIVOT]), trunnionLocalM: Object.freeze([...TRUNNION]),
    muzzleWorldZM: PIVOT[2] + TRUNNION[2] + GUN_LENGTH,
    frontRakeDeg: Math.atan(FRONT_RAKE) / D2R, stepSetbackM: STEP_SETBACK,
    throatHalfWidthM: THROAT_X, mantletHalfWidthM: 0.31,
    sideModulesPerSide: 3, frontBricksPerSide: 3, radarFaces: 4, launchers: 2,
    bustleUndersideM: 0.34, legacyVtDerivativeRetired: true,
  });
}

export function buildLongwei(P: TankBuilderPort): void {
  buildLongweiHullStructure(P);
  dressLongweiHull(P);
  buildLongweiTurret(P);
}
