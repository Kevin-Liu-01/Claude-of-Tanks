// ZTZ-99 Longwei — release 262 rebuild on the ZTZ-99/99A family's real proportions (owner 2026-10-27: "... longwei
// ... turrets and hullls as well based on proper historical referrences so they will no longer look so chungus"), in
// the spirit of the national modernization turrets the owner ratified on 2026-10-21 (docs/references/tanks/
// ztz99_longwei.md §262).
//
// An original PLA game concept on the measured Type 99A hull, grounded in the real vehicle:
//   - a welded turret 3.14 m over its side modules and 4.16 m from the cheek tips to the basket, its roof 2.35 m off the
//     ground, with the 99A's ARROWHEAD front: two welded composite wedges swept 33 degrees back from the gun throat,
//     their tops falling to the front edge, six FY-5 cassettes on each face; a slim mantlet with a canvas boot;
//   - slab side modules, lidded bins on the bustle, blow-off panels and a rear basket;
//   - the 99A's crew layout: the commander on the right behind his panoramic sight with the QJC-88, the gunner on the
//     left behind his primary sight, the laser dazzler on its pedestal at the left rear, five smoke tubes a corner;
//   - its own identity: the GL-5-style hard-kill suite (four radar faces, two launchers), the straight-gridded FY-5
//     glacis field with low lamp cowls, the bolted towing beam and the armoured stern bin;
//   - hull dress: eight segmented skirt panels a side with the scalloped lower edge and one FY-5 course up front (the
//     release-233 double brick course, carrier and slat cage are gone, as is the dozer blade).
// The terraced front of release 233 is retired. The structural hull (running gear, lofted belly, glacis planes,
// fenders, transom, recovery tray) is the certified Type 99A print-loft hull, carried here from modern2.ts. Every
// triangle is first-party procedural geometry; no source mesh is loaded. Authorship: Kevin B. Liu (NOTICE.md).

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

/** Turret roof (turret-local): 0.78 m over the ring plane, 2.35 m over the ground (the 99A's published 2.37 m). */
const ROOF_Y = 0.78;
/** The arrowhead cheeks: their throat walls stand at |x| 0.30 and run 0.85 m back; the front line sweeps from the tip
 * at z 1.55 (0.41 m ahead of the mantlet's face) back to 0.72 at the outer corner (|x| 1.42), and the face leans back
 * 0.08 m over its height. */
const THROAT_X = 0.30;
const CHEEK_OUTER_X = 1.42;
const CHEEK_TIP_Z = 1.55;
const CHEEK_SWEEP = (1.55 - 0.72) / (1.42 - 0.30);
const CHEEK_DEPTH = 0.85;
/** The top face falls from the roof line 0.40 m behind the front edge. */
const CHEEK_TOP_RUN = 0.40;
const CHEEK_LEAN = 0.08;
const CHEEK_BOTTOM_Y = 0.02;
const CHEEK_FRONT_TOP_Y = 0.44;
/** The brow over the gun throat: its underside clears the mantlet's top corner at full elevation. */
const BROW_UNDER_Y = 0.70;
const MANTLET_HALF_W = 0.25;
/** The welded core runs from behind the cheek roots to the bustle's rear wall; the side modules end at the bins. */
const CORE_FRONT_Z = 0.66;
const CORE_REAR_Z = -2.30;
const SIDE_MODULE_REAR_Z = -1.05;
/** The skirt's one FY-5 course: five bricks from z 2.80, between these heights (the armor envelope reads them). */
const SKIRT_ERA_FRONT_Z = 2.80;
const SKIRT_ERA_LOW_Y = 0.86;
const SKIRT_ERA_HIGH_Y = 1.17;

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
  // ---- front fenders (release 262: the 99A's solid rounded boxes over the idlers) + flaps ----
  for (const s of [-1, 1]) {
    const x0 = 1.13, x1 = 1.85, r = 0.06;
    const section = (lo: number, hi: number): SectionPoint[] => {
      const pts: SectionPoint[] = [[x0, lo], [x1, lo]];
      for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI / 2; pts.push([x1 - r + Math.cos(a) * r, hi - r + Math.sin(a) * r]); }
      pts.push([x0, hi]);
      return s > 0 ? pts : mirrorRing(pts);
    };
    P.add('hull', sectionSolid([[2.95, 1.30, 1.485], [3.30, 1.30, 1.485], [3.42, 1.285, 1.45], [3.50, 1.27, 1.38]]
      .map(([z, lo, hi]) => ({ z, ring: section(lo, hi) }))));
    P.hangMudguard('ztz99-longwei-front-flap', 'hullRubber', box(0.60, 0.30, 0.028), s * 1.47, 1.11, 3.49);
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
  // (release 240, the owner: "make sure all tank turrets are clear of hulls": the filter hump and its mesh 2-2.3 cm lower,
  // tops 1.797/1.802 under the bustle armour's 1.81 foot (2.0 m off the ring's axis), and the front lift eyes 3 cm lower,
  // under the turret's 1.603 sides)
  P.add('hull', box(0.92, 0.05, 0.72), 0.48, 1.772, -1.72);
  P.add('hullDark', box(0.80, 0.02, 0.60), 0.48, 1.792, -1.72);
  liftEye(P, 'hullDetail', -1.30, 1.49, 1.70);
  liftEye(P, 'hullDetail', 1.30, 1.49, 1.70);
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
 * Skirts (release 262, the 99A's grammar): a continuous top band on the fender edge and eight segmented panels a side,
 * each panel's lower edge scalloped up over the middle of its road wheel; one course of FY-5 bricks on the front three
 * panels; small dark access holes. Everything stays inside the ±1.866 m width envelope and 4.5 cm or more outside the
 * track's outer face (1.76).
 */
function addSkirts(P: TankBuilderPort): void {
  const bandIn = 1.835, bandOut = 1.857, panelIn = 1.818, panelOut = 1.836;
  const joints = [3.30, 2.70, 1.82, 0.92, 0.01, -0.89, -1.79, -2.69, -3.42];
  for (const side of [-1, 1] as const) {
    const ring = (inner: number, outer: number, low: number, high: number): SectionPoint[] => {
      const r: SectionPoint[] = [[inner, low], [outer, low], [outer, high], [inner, high]];
      return side > 0 ? r : mirrorRing(r);
    };
    // top band from the bow to the stern, on the fender's outer edge
    P.add('hull', sectionSolid([
      { z: joints.at(-1)!, ring: ring(bandIn, bandOut, 1.225, 1.47) },
      { z: joints[0], ring: ring(bandIn, bandOut, 1.225, 1.47) },
    ]));
    for (let i = 0; i < joints.length - 1; i++) {
      const front = joints[i], rear = joints[i + 1], gap = 0.012;
      const z0 = rear + gap / 2, z1 = front - gap / 2;
      // the bow panel's nose rakes up 0.36 m over its last 0.45 m
      const bottom = (z: number): number => {
        if (i === 0 && z > 2.85) return 0.62 + (z - 2.85) / (z1 - 2.85) * 0.36;
        const t = (z - z0) / (z1 - z0);
        return 0.60 + 0.15 * Math.sin(Math.PI * t);
      };
      const zs = Array.from({ length: 7 }, (_, k) => z0 + (z1 - z0) * k / 6);
      if (i === 0) zs.splice(zs.findIndex((z) => z > 2.85), 0, 2.85);
      P.add('hull', sectionSolid(zs.map((z) => ({ z, ring: ring(panelIn, panelOut, bottom(z), 1.235) }))));
      // the joint behind each panel: a dark seam strip on the band
      if (i > 0) P.add('hullDark', KIT.box(0.006, 1.235 - 0.60, 0.014), side * (panelOut + 0.001), (1.235 + 0.60) / 2, front);
      // two small access holes per panel
      for (const f of [0.30, 0.70]) {
        const z = z0 + (z1 - z0) * f;
        P.add('hullDark', KIT.box(0.006, 0.06, 0.06), side * (panelOut + 0.001), 0.82, z);
      }
    }
    // one course of FY-5 bricks on the front three panels
    const sector = side < 0 ? 'skirt_era_L' : 'skirt_era_R';
    const brickL = 0.56, pitch = 0.60, t = 0.022;
    for (let i = 0; i < 5; i++) {
      const z = SKIRT_ERA_FRONT_Z - brickL / 2 - i * pitch;
      eraCassette(P, 'hull', sector, [side * (panelOut + t / 2 - 0.002), (SKIRT_ERA_LOW_Y + SKIRT_ERA_HIGH_Y) / 2, z],
        [t, SKIRT_ERA_HIGH_Y - SKIRT_ERA_LOW_Y, brickL]);
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
 * A slim bolted towing bar across the 62-degree nose plate (y 0.70 at z 3.30 to 1.215 at 3.02), 0.30 m down from the
 * nose break (release 262: 0.07 m deep and 0.035 m proud, after critics read the 0.14 m beam as a dozer blade), from
 * |x| 0.98, with eight bolt heads and a towing eye on a lug at each end; below it, on the near-vertical lower bow, the
 * 99A's row of four appliqué boxes. The gun at -7 degrees passes 0.35 m over the bar.
 */
function addNoseBeam(P: TankBuilderPort): void {
  const { cylY, torus, box } = KIT;
  const up = new THREE.Vector3(0, 0.515, -0.28).normalize(), n = new THREE.Vector3(0, -up.z, up.y);
  const at = (s: number, out: number): THREE.Vector3 =>
    new THREE.Vector3(0, 1.215, 3.02).addScaledVector(up, -s).addScaledVector(n, out);
  const section: ZY[] = [[0.335, -0.008], [0.33, 0.035], [0.27, 0.035], [0.265, -0.008]]
    .map(([s, out]) => { const p = at(s, out); return [p.z, p.y] as const; });
  P.add('hullDetail', loftX([-0.98, 0.98].map((x) => ({ x, ring: section }))));
  const face = at(0.30, 0.035), tilt = Math.atan2(n.z, n.y);
  for (const x of [-0.84, -0.56, -0.28, -0.08, 0.08, 0.28, 0.56, 0.84]) {
    P.add('hullDark', place(cylY(0.016, 0.016, 0.012, 8), x, face.y + n.y * 0.004, face.z + n.z * 0.004, tilt));
  }
  // a lug off the beam's lower face, the eye standing face-forward through it, 2 cm clear of the plate at its foot
  const lug = at(0.335, 0.02);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.05, 0.10, 0.10), side * 0.92, lug.y - 0.045, lug.z + 0.03);
    P.add('hullDark', place(torus(0.045, 0.014, 12), side * 0.92, lug.y - 0.10, lug.z + 0.055, Math.PI / 2));
  }
  // the lower bow's appliqué row: four bolted boxes on the lane from y 0.385 to 0.70 (z 3.34 to 3.30)
  for (const x of [-0.66, -0.22, 0.22, 0.66]) {
    P.add('hullDetail', box(0.40, 0.22, 0.07), x, 0.55, 3.345, -0.12, 0, 0);
    for (const dx of [-0.15, 0.15]) P.add('hullDark', KIT.cylZ(0.014, 0.012, 8), x + dx, 0.62, 3.385);
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
// Turret (release 262: the ZTZ-99A-proportioned welded turret)
// ---------------------------------------------------------------------------

/** The welded core: a long body with a lower chamfer belt, inward-leaning upper walls and a roof chamfer; the bustle's
 * underside lifts from 0.02 to 0.34 over z -1.10..-1.75 so it clears the raised engine deck at every yaw. */
function addTurretCore(P: TankBuilderPort): void {
  const ring = (yb: number, xb: number, xs: number, xt: number, xr: number, roof = ROOF_Y): SectionPoint[] => [
    [-xb, yb], [xb, yb], [xs, yb + 0.14], [xt, roof - 0.08], [xr, roof], [-xr, roof], [-xt, roof - 0.08], [-xs, yb + 0.14],
  ];
  P.add('turret', sectionSolid([
    { z: CORE_REAR_Z, ring: ring(0.38, 0.98, 1.10, 1.06, 0.96, ROOF_Y - 0.03) },
    { z: CORE_REAR_Z + 0.10, ring: ring(0.34, 1.06, 1.20, 1.15, 1.05) },
    { z: -1.75, ring: ring(0.34, 1.10, 1.24, 1.18, 1.08) },
    { z: -1.10, ring: ring(0.02, 1.18, 1.30, 1.22, 1.12) },
    { z: CORE_FRONT_Z, ring: ring(0.02, 1.18, 1.30, 1.22, 1.12) },
  ]));
  // ring collar: bedded 20 mm into the 1.50 deck, its top 20 mm into the core's underside
  P.add('turret', KIT.cylY(1.08, 1.12, 0.13, P.q ? 32 : 20), 0, -0.025, 0);
  // the brow over the gun throat, from the core's front to the cheeks' rear roots
  P.add('turret', KIT.box(THROAT_X * 2 + 0.04, ROOF_Y - BROW_UNDER_Y, 0.50), 0, (ROOF_Y + BROW_UNDER_Y) / 2, CORE_FRONT_Z + 0.20);
}

/** One cheek wedge's section at |x| = a: its front line runs from the throat tip (z 1.55 at |x| 0.30) back to 0.72 at
 * the outer corner (|x| 1.42), 37 degrees off square in plan; the face leans back 0.08 m, the top falls 0.32 m from the
 * roof to its front edge at 45 degrees (the arrowhead in profile), and its root buries 0.85 m back into the core. */
const cheekFrontZ = (a: number): number => CHEEK_TIP_Z - (a - THROAT_X) * CHEEK_SWEEP;
// constant bottom and front-top lines keep the face and top planar (the combat plates trace them exactly)
const cheekBottomY = (_a: number): number => CHEEK_BOTTOM_Y;
const cheekFrontTopY = (_a: number): number => CHEEK_FRONT_TOP_Y;
function cheekSection(a: number): ZY[] {
  const zf = cheekFrontZ(a), yb = cheekBottomY(a), yt = cheekFrontTopY(a);
  return [[zf, yb], [zf - CHEEK_LEAN, yt], [zf - CHEEK_TOP_RUN, ROOF_Y - 0.02], [zf - CHEEK_DEPTH, ROOF_Y - 0.02], [zf - CHEEK_DEPTH, yb]];
}
/** The cheek face's outward normal (sign: +1 on +X). */
function cheekFaceNormal(sign: number): THREE.Vector3 {
  const a0 = THROAT_X, a1 = CHEEK_OUTER_X;
  const p0 = new THREE.Vector3(sign * a0, cheekBottomY(a0), cheekFrontZ(a0));
  const p1 = new THREE.Vector3(sign * a1, cheekBottomY(a1), cheekFrontZ(a1));
  const p2 = new THREE.Vector3(sign * a0, cheekFrontTopY(a0), cheekFrontZ(a0) - CHEEK_LEAN);
  const n = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0)).normalize();
  return n.z < 0 ? n.negate() : n;
}
/** The point on the cheek face at |x| a, height y (sign: +1 on +X). */
function cheekFacePoint(sign: number, a: number, y: number): THREE.Vector3 {
  const yb = cheekBottomY(a), yt = cheekFrontTopY(a), t = (y - yb) / (yt - yb);
  return new THREE.Vector3(sign * a, y, cheekFrontZ(a) - CHEEK_LEAN * t);
}

/** The arrowhead front: a welded composite wedge either side of the gun throat, the FY-5 dual-reactive cassettes on its
 * face, a row of bolt heads along its top edge. */
function addCheekWedges(P: TankBuilderPort): void {
  const steps = [THROAT_X, 0.55, 0.80, 1.05, 1.25, CHEEK_OUTER_X];
  for (const sign of [-1, 1]) {
    P.add('turret', loftX(steps.map((a) => ({ x: sign * a, ring: cheekSection(a) }))));
    const n = cheekFaceNormal(sign), rotation = faceEuler(n), thick = 0.065;
    // two large wedge-shaped dual-reactive modules a face (the 99A's), not a tile grid
    for (const a of [0.61, 1.11]) {
      const c = cheekFacePoint(sign, a, 0.215).addScaledVector(n, thick / 2 - 0.006);
      eraCassette(P, 'turret', sign < 0 ? 'turret_era_L' : 'turret_era_R', c.toArray(), [0.47, thick, 0.33], rotation);
    }
    for (const a of [0.45, 0.75, 1.05, 1.32]) {
      const p = cheekFacePoint(sign, a, cheekFrontTopY(a) - 0.02).addScaledVector(n, 0.004);
      const bolt = KIT.cylY(0.013, 0.013, 0.014, 8);
      bolt.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      P.add('turretDark', bolt, p.x, p.y, p.z);
    }
  }
}

/** Slab side modules from the cheek root to the bustle bins, bevelled at the lower lip, their front edge chamfered into
 * the cheek's outer corner; bolt heads on the outer face. */
function addSideModules(P: TankBuilderPort): void {
  const { cylX } = KIT;
  const base: SectionPoint[] = [[1.27, 0.20], [1.52, 0.20], [1.57, 0.25], [1.57, ROOF_Y - 0.07], [1.53, ROOF_Y - 0.03], [1.27, ROOF_Y - 0.03]];
  const chamfered: SectionPoint[] = base.map(([x, y]) => [1.27 + (x - 1.27) * 0.55, y] as const);
  const front = 0.66, rear = SIDE_MODULE_REAR_Z;
  for (const side of [-1, 1]) {
    const ring = side > 0 ? base : mirrorRing(base), nose = side > 0 ? chamfered : mirrorRing(chamfered);
    P.addExternalArmor('turret', sectionSolid([{ z: rear, ring }, { z: front - 0.16, ring }, { z: front, ring: nose }]));
    for (const z of [front - 0.26, (front + rear) / 2, rear + 0.10]) for (const y of [0.30, ROOF_Y - 0.16]) {
      P.add('turretDark', cylX(0.013, 0.012, 8), side * 1.575, y, z);
    }
    // the module's seam with its bin: a dark joint line
    P.add('turretDark', KIT.box(0.30, 0.012, 0.012), side * 1.42, ROOF_Y - 0.03, rear + 0.01);
  }
}

/** A slim cast mantlet on the trunnion between the cheeks (gun frame), 5 cm clear of the throat walls, with the canvas
 * boot gathered onto the tube and the coaxial port on its right. */
function addMantlet(P: TankBuilderPort): void {
  const { cylZ } = KIT;
  const ring = (hw: number, lo: number, hi: number, c: number): SectionPoint[] => [
    [-hw + c, lo], [hw - c, lo], [hw, lo + c], [hw, hi - c], [hw - c, hi], [-hw + c, hi], [-hw, hi - c], [-hw, lo + c],
  ];
  // the root runs 0.25 m behind the trunnion, inside the core's front at every elevation (cnGunMantlet.selftest)
  P.add('gunMount', sectionSolid([
    { z: -0.25, ring: ring(MANTLET_HALF_W, -0.23, 0.22, 0.03) },
    { z: 0.32, ring: ring(MANTLET_HALF_W, -0.23, 0.22, 0.03) },
    { z: 0.40, ring: ring(MANTLET_HALF_W - 0.04, -0.19, 0.18, 0.05) },
  ]));
  // canvas boot from the mantlet face to the tube
  const n = P.q ? 18 : 12, e = 2 / 3;
  const boot = (w: number, h: number): SectionPoint[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** e * w / 2, Math.sign(s) * Math.abs(s) ** e * h / 2] as const;
  });
  P.add('gunMountCanvasSkin', sectionSolid([[0.36, 0.34, 0.30], [0.48, 0.30, 0.27], [0.60, 0.25, 0.24], [0.72, 0.23, 0.23]]
    .map(([z, w, h]) => ({ z, ring: boot(w, h) })), { smoothSideEdges: Array.from({ length: n }, (_, i) => i) }));
  P.add('gunMountDark', cylZ(0.122, 0.035, n), 0, 0, 0.71);
  P.add('gunMountDark', cylZ(0.032, 0.03, 12), -0.15, -0.07, 0.405);
}

/** ZPT-98-class 125 mm tube: two thermal-sleeve runs either side of the evacuator a little past mid-barrel, a thick
 * muzzle end and the muzzle reference sensor. */
function addLongweiGun(P: TankBuilderPort): void {
  const { cylZ, torus, box } = KIT;
  const len = GUN_LENGTH, seg = P.q ? 24 : 14;
  KIT.buildGun(P, { len, r: 0.080, sleeve: false, collar: false, baseR: 0.118, evac: 0.55, evacR: 1.55 });
  for (const [start, end, r0, r1] of [[0.80, 3.05, 0.114, 0.110], [4.05, 5.45, 0.104, 0.100]]) {
    P.add('gun', cylZ(r0, end - start, seg, r1), 0, 0, (start + end) / 2);
    for (const z of [start, end]) P.add('gunDark', torus(z === start ? r0 + 0.002 : r1 + 0.002, 0.010, seg), 0, 0, z, Math.PI / 2, 0, 0);
  }
  P.add('gunDark', cylZ(0.090, 0.22, seg), 0, 0, len - 0.11);
  // muzzle reference mirror on its clamp band
  P.add('gunDark', torus(0.086, 0.010, seg), 0, 0, len - 0.42, Math.PI / 2, 0, 0);
  P.add('gunDark', box(0.06, 0.035, 0.09), 0, 0.108, len - 0.42);
  muzzleTipDot(P, 0, 0, len + 0.012, 0.064, { parent: 'gunG' });
  P.muzzleZ = len;
}

/** The bustle: two lidded bins a side behind the side modules, the blow-off panels over the ammunition compartment and
 * the rear basket. Bins bottom at 0.36 and the basket floor at 0.38: the engine deck's dress tops out at local 0.29. */
function addBustle(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    const base: SectionPoint[] = [[1.06, 0.36], [1.50, 0.36], [1.54, 0.40], [1.54, ROOF_Y - 0.08], [1.51, ROOF_Y - 0.05], [1.06, ROOF_Y - 0.05]];
    const ring = side > 0 ? base : mirrorRing(base);
    for (const [front, rear] of [[SIDE_MODULE_REAR_Z - 0.02, -1.70], [-1.76, CORE_REAR_Z + 0.08]]) {
      P.addEquipment('turretDetail', sectionSolid([{ z: rear, ring }, { z: front, ring }]));
      P.addEquipment('turretDark', box(0.012, 0.010, front - rear - 0.04), side * 1.541, ROOF_Y - 0.12, (front + rear) / 2);  // lid line
      for (const dz of [-0.16, 0.16]) {
        P.addEquipment('turretDark', box(0.016, 0.06, 0.045), side * 1.546, ROOF_Y - 0.17, (front + rear) / 2 + dz);       // latches
      }
    }
  }
  // blow-off panels: two framed plates over the ammunition compartment, each with a lifting handle
  for (const x of [-0.40, 0.40]) {
    P.add('turretDark', box(0.74, 0.012, 0.66), x, ROOF_Y + 0.004, -1.86);
    P.add('turretDetail', box(0.70, 0.022, 0.62), x, ROOF_Y + 0.011, -1.86);
    P.addEquipment('turretDark', box(0.14, 0.022, 0.022), x, ROOF_Y + 0.03, -1.86);
  }
  // rear basket against the rear wall, floor at 0.38
  const rack = FITTINGS.stowageRack({
    mats: P.mats, w: 2.00, d: 0.42, h: 0.30, posts: 7, fill: 0.82, rails: 2, mesh: true,
    rotation: [0, Math.PI, 0], seed: 23310,
  });
  rack.position.set(0, 0.38, CORE_REAR_Z - 0.20);
  rack.rotation.set(0, Math.PI, 0);
  P.turretG.add(rack);
}

/** One GL-5-style radar housing angled `yaw` from the turret's nose: a plinth bedded 30 mm into its seat, a deep
 * armoured box on it with the dark array face 3 mm into its front, and a rain lip over the face. */
function addRadarFace(P: TankBuilderPort, x: number, y: number, z: number, yaw: number): void {
  const { box } = KIT;
  const face = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  P.addEquipment('turretDetail', box(0.26, 0.07, 0.16), x, y + 0.005, z, 0, yaw, 0);
  P.addEquipment('turretDetail', box(0.29, 0.24, 0.12), x, y + 0.155, z, 0, yaw, 0);
  P.addModuleVisual('optics', 'turretDark', box(0.25, 0.19, 0.012), x + face.x * 0.063, y + 0.15, z + face.z * 0.063, 0, yaw, 0);
  P.addEquipment('turretDetail', box(0.31, 0.018, 0.16), x + face.x * 0.02, y + 0.282, z + face.z * 0.02, 0, yaw, 0);
}

/** One two-cell hard-kill launcher on a low turntable base, its cells pitched 12 degrees up, facing `yaw`. */
function addLauncher(P: TankBuilderPort, x: number, y: number, z: number, yaw: number): void {
  const { box, cylY, cylZ } = KIT;
  P.addEquipment('turretDetail', cylY(0.12, 0.13, 0.05, P.q ? 20 : 12), x, y + 0.025 - 0.004, z);
  const pitch = -12 * D2R;
  const body = box(0.28, 0.15, 0.36);
  P.addEquipment('turretDetail', body, x, y + 0.05 + 0.075, z, pitch, yaw, 0);
  for (const dx of [-0.068, 0.068]) {
    const mouth = new THREE.Vector3(dx, 0, 0.18).applyEuler(new THREE.Euler(pitch, yaw, 0));
    P.addEquipment('turretDark', cylZ(0.05, 0.012, 14), x + mouth.x, y + 0.125 + mouth.y, z + mouth.z, pitch, yaw, 0);
  }
}

/** Hatch: lid on a machined race with a hinge block and two vision blocks. */
function addHatch(P: TankBuilderPort, x: number, z: number, hingeSide: number): void {
  const { cylY, box } = KIT;
  P.add('turretDetail', machinedRing(0.29, 0.335, 0.024, 0.004, P.q ? 28 : 16), x, ROOF_Y - 0.004, z);
  P.addHatch('turret', cylY(0.305, 0.305, 0.035, P.q ? 28 : 16), x, ROOF_Y + 0.020 + 0.0175 - 0.002, z);
  P.add('turretDark', box(0.10, 0.04, 0.10), x + hingeSide * 0.29, ROOF_Y + 0.035, z);
  for (const a of [-0.55, 0.55]) {
    KIT.periscope(P, 'turretDetail', x + Math.sin(a) * 0.42, ROOF_Y + 0.035, z + Math.cos(a) * 0.42, a);
  }
}

function addTurretRoof(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const parts = permanentParts(P, ['turret']);
  // the vehicle's left (+X): the gunner's hatch, his primary sight ahead of it, and the laser dazzler at the rear corner
  addHatch(P, 0.52, -0.56, 1);
  lowOptic(P, parts, 0.68, 0.22, 0.40, 0.30, 0.44, false);
  {
    const x = 0.82, z = -1.62, footTop = equipmentFoot(P, parts, x, z, 0.26, 0.26);
    P.addEquipment('turretDetail', cylY(0.08, 0.10, 0.26, P.q ? 20 : 12), x, footTop + 0.13 - 0.004, z);
    const headY = footTop + 0.40;
    P.addEquipment('turretDetail', box(0.30, 0.26, 0.26), x, headY, z);
    P.addModuleVisual('optics', 'turretDark', box(0.20, 0.14, 0.012), x, headY + 0.01, z + 0.131);
    P.addEquipment('turretDetail', box(0.32, 0.018, 0.30), x, headY + 0.139, z + 0.02);
  }
  // the vehicle's right (-X): the commander's hatch and his panoramic sight on a short mast ahead of it
  addHatch(P, -0.54, -0.70, -1);
  {
    const x = -0.80, z = 0.10, footTop = equipmentFoot(P, parts, x, z, 0.30, 0.30);
    P.addEquipment('turretDetail', cylY(0.16, 0.17, 0.06, P.q ? 24 : 14), x, footTop + 0.03 - 0.003, z);
    const mastTop = footTop + 0.30;
    P.addEquipment('turretDetail', cylY(0.065, 0.075, mastTop + 0.02 - footTop - 0.05, P.q ? 20 : 12), x, (footTop + 0.05 + mastTop + 0.02) / 2, z);
    const headY = mastTop + 0.14;
    P.addEquipment('turretDetail', box(0.34, 0.28, 0.32), x, headY, z);
    P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.10, 0.020), x, headY + 0.02, z + 0.162);
    P.addModuleVisual('optics', 'turretGlass', box(0.18, 0.08, 0.020), x, headY + 0.02, z - 0.162);
    P.addEquipment('turretDetail', box(0.36, 0.022, 0.38), x, headY + 0.15, z + 0.02);
    P.add('turretDark', box(0.28, 0.012, 0.012), x, headY + 0.08, z + 0.162);
  }
  // QJC-88 12.7 mm on a socket post behind the commander's hatch, with its shield, on the working station's cradle
  {
    const x = -0.22, z = -1.24, roof = ROOF_Y;
    P.add('turretDetail', cylY(0.075, 0.085, 0.10, P.q ? 20 : 12), x, roof + 0.05 - 0.004, z);
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'qjc88', tone: 'two-tone', scale: 1.0, ammo: true, shield: true, elev: 0.03,
      seed: 23305, working: true, ridingCradle: true,
    });
    mg.position.set(x, roof + 0.096, z);
    P.turretG.add(mg);
  }
  // the GL-5-style hard-kill suite: radar faces at the four corners, launchers on the roof sides
  for (const side of [-1, 1]) {
    addRadarFace(P, side * 1.40, ROOF_Y - 0.03, 0.20, side * 0.75);
    addRadarFace(P, side * 0.92, ROOF_Y, -2.06, side * (Math.PI - 0.80));
    addLauncher(P, side * 1.00, ROOF_Y, -1.02, side * 0.32);
  }
  // the suite's processor case and its cables to the rear radar faces, routed round the blow-off panels
  serviceCase(P, parts, 0.34, -1.30, 0.38, 0.18, 0.26);
  serviceCable(P, parts, [[0.34, -1.43], [0.86, -1.50], [0.86, -1.92], [0.92, -1.98]], false);
  serviceCable(P, parts, [[0.20, -1.43], [-0.86, -1.50], [-0.86, -1.92], [-0.92, -1.98]], false);
  // five-tube smoke dischargers on each front corner, on the side module's top, fanned forward and out
  for (const side of [-1, 1]) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 5, r: 0.040, len: 0.25, spacing: 0.085,
      splay: side * 0.38, pitch: -0.40, arc: 0.40, seed: 23320 + (side > 0 ? 1 : 0),
    });
    bank.position.set(side * 1.42, ROOF_Y - 0.03 + 0.08, 0.42);
    bank.rotation.set(0, side * 0.42, 0);
    P.turretG.add(bank);
  }
  // antennas and the meteorological mast on the bustle
  for (const side of [-1, 1]) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: side < 0 ? 1.20 : 1.05, r: 0.011, seed: 23330 + side });
    whip.position.set(side * 0.62, ROOF_Y, -2.22);
    P.turretG.add(whip);
  }
  P.addEquipment('turretDetail', box(0.10, 0.02, 0.10), -0.20, ROOF_Y + 0.006, -2.24);
  P.addEquipment('turretDetail', cylY(0.018, 0.024, 0.36, 10), -0.20, ROOF_Y + 0.18 - 0.004, -2.24);
  P.addEquipment('turretDetail', box(0.16, 0.02, 0.02), -0.20, ROOF_Y + 0.36, -2.24);
  // lift eyes on the roof behind the cheek roots and on the bustle's rear edge
  for (const [x, z] of [[-1.08, 0.28], [1.08, 0.28], [-0.62, -2.10], [0.62, -2.10]]) {
    KIT.liftEye(P, 'turretDetail', x, ROOF_Y, z);
  }
  // turret numbers on the side modules
  const num = P.spec.visual.number || '';
  P.decal('turret', 'number', num, 0.20, [1.572, 0.46, 0.06], Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-1.572, 0.46, 0.06], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.40);
}

function buildLongweiTurret(P: TankBuilderPort): void {
  P.turretG.position.set(...PIVOT);
  P.gunG.position.set(...TRUNNION);
  addTurretCore(P);
  addCheekWedges(P);
  addSideModules(P);
  addMantlet(P);
  addLongweiGun(P);
  addBustle(P);
  addTurretRoof(P);
  P.turretG.userData.longweiTurretReceipt = Object.freeze({
    architecture: 'longwei-arrowhead-r262',
    pivotLocalM: Object.freeze([...PIVOT]), trunnionLocalM: Object.freeze([...TRUNNION]),
    muzzleWorldZM: PIVOT[2] + TRUNNION[2] + GUN_LENGTH,
    roofLocalY: ROOF_Y, cheekTipZ: CHEEK_TIP_Z, cheekSweepDeg: Math.atan(CHEEK_SWEEP) / D2R,
    widthOverModulesM: 1.57 * 2, lengthM: CHEEK_TIP_Z - (CORE_REAR_Z - 0.41),
    throatHalfWidthM: THROAT_X, mantletHalfWidthM: MANTLET_HALF_W,
    cheekCassettesPerSide: 2, radarFaces: 4, launchers: 2, smokePerSide: 5,
    commanderSide: 'right', gunnerSide: 'left', dazzlerSide: 'left',
    bustleUndersideM: 0.34, legacyVtDerivativeRetired: true, terracedFrontRetired: true,
  });
}

export function buildLongwei(P: TankBuilderPort): void {
  buildLongweiHullStructure(P);
  dressLongweiHull(P);
  buildLongweiTurret(P);
}
