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
import { KIT, FITTINGS, muzzleTipDot } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { eraCassette } from './modernizationFittings.ts';
import { equipmentFoot, lowOptic, permanentParts, serviceCable, serviceCase } from './nationalChina.ts';
import { place } from '../accessoryPrimitives.ts';
import { machinedRing } from '../machineGunGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { markEraFurniture, markEraHitFaces } from './eraHitFaces.ts';
import { addGunFloodlight } from './gunFloodlight.ts';
import { nationalRoofWeapon } from './nationalRoofWeapon.ts';
import type { NationalRoofLoadout } from '../nationalRoofConfig.ts';
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
/** The arrowhead cheeks: their throat walls stand at |x| 0.30 and run 0.85 m back; the front line sweeps 37 degrees off
 * square from the tip at z 1.55 (0.41 m ahead of the mantlet's face) to the outer corner, flush with the side modules'
 * faces (|x| 1.57). The 99A's arrowhead blocks (262 critic rounds): vertical faces from just over the deck, their
 * front-top edge falling from 0.62 m at the outer corner to 0.28 m at the gun throat, so each face narrows toward the
 * mantlet and the profile reads as a raked beak; one planar top climbs from that edge to the roof line. The bottom clears
 * the roof's front fittings by 2.4 cm as the outer corners traverse over them. */
const THROAT_X = 0.30;
const CHEEK_OUTER_X = 1.57;
const CHEEK_TIP_Z = 1.55;
const CHEEK_SWEEP = (1.55 - 0.72) / (1.42 - 0.30);
const CHEEK_DEPTH = 0.85;
const CHEEK_BOTTOM_Y = 0.045;
const CHEEK_THROAT_TOP_Y = 0.28;
const CHEEK_OUTER_TOP_Y = 0.62;
/** The top plane rises 1 m per 1.4 m run back from the front-top edge to the roof line. */
const CHEEK_TOP_RUN_PER_RISE = 1.4;
/** The brow over the gun throat: its underside clears the mantlet's top corner at full elevation. */
const BROW_UNDER_Y = 0.70;
const MANTLET_HALF_W = 0.25;
/** The welded core runs from behind the cheek roots to the bustle's rear wall; the side modules end at the bins. */
const CORE_FRONT_Z = 0.66;
const CORE_REAR_Z = -2.60;
const SIDE_MODULE_REAR_Z = -1.05;
/** The skirt's one FY-5 course: five bricks from z 2.80, between these heights (the armor envelope reads them). */
const SKIRT_ERA_FRONT_Z = 2.80;
const SKIRT_ERA_LOW_Y = 0.86;
const SKIRT_ERA_HIGH_Y = 1.17;
/** The skirt panels' lower edge between the wheels (the armor envelope's skirt zones start here). */
export const SKIRT_LOW_Y = 0.50;

/** A modernized Longwei turret (release 264, owner 2026-10-28: "make 4 new chinnese tannks combining variations of vt4a1,
 * qilin, kunlun, annd ztz 99a2 with modernized versions of the lonngwei turret which i like the shape of"): the arrowhead
 * shell, its core, cheeks, side modules, mantlet and gun as drawn, carrying a different kit on another hull's ring. The
 * default kit is the Longwei's own and builds it unchanged. */
export interface LongweiTurretKit {
  readonly revision: string;
  /** The ring centre on the host hull (hull frame); the trunnion and the 6.454 m gun keep the turret's own datums. */
  readonly pivot: Vec3;
  /** The arrowhead faces' reactive armour, fitted to the face (cheekFaceColumns): the Longwei's two large dual-reactive
   * modules a face, a 3 x 2 grid of FY-5 cassettes, two V-ridged chevron cassettes a face (the VT-4 and Kunlun
   * language), or four columns of three small FY-4-style tiles. */
  readonly faceEra: 'pair' | 'grid' | 'chevron' | 'tiles';
  /** Two rows of three cassettes on each side module's outer face. */
  readonly sideEra: boolean;
  /** The commander's QJC-88 on its pintle, or a remote 12.7 mm station in a low armoured casemate on the same seat. */
  readonly roofGun: 'pintle' | 'rws';
  /** The GL-5-style hard-kill suite, the suite with a rear launcher pair, laser-warning receivers alone, or the warners
   * with two infrared dazzler heads on the side modules' front shoulders. */
  readonly protection: 'gl5' | 'gl5-plus' | 'lwr' | 'eyes';
  /** The lidded bins and mesh rear basket, or closed armoured boxes along both flanks and across the rear. */
  readonly bustle: 'bins' | 'boxes';
  /** A slat screen round the bustle's flanks and rear. */
  readonly bustleCage: boolean;
  /** A big searchlight drum right of the gun on the mantlet (gunFloodlight.ts), pitching with the gun. */
  readonly floodlight: boolean;
  /** Each cheek block and bustle box takes its own patch of the camouflage (userData.camoUvOffset, the Sabra Mk 2 cheek
   * covers' precedent), so on a busy or dark coat the blocks read as separate plates, not a band under one pattern. */
  readonly blockCamo: boolean;
}
/** The Longwei's own kit. */
export const LONGWEI_TURRET_KIT: LongweiTurretKit = Object.freeze({
  revision: 'longwei-arrowhead-r262', pivot: PIVOT,
  faceEra: 'pair', sideEra: false, roofGun: 'pintle', protection: 'gl5', bustle: 'bins', bustleCage: false, floodlight: false,
  blockCamo: false,
});

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

// ---------------------------------------------------------------------------
// Hull — release 262: a new hull on the ZTZ-99/99A family's proportions (owner 2026-10-27: "longweii needs a completely
// new hhull too"). The certified print-loft hull of releases 232-261 is retired; the six measured wheel stations, the
// ring seat (pivot 0/1.57/0.64) and the raised powerpack deck stay, so the turret's clearances and datums hold.
// ---------------------------------------------------------------------------
// T-72/99 pattern: a pointed nose 0.92 m off the ground where a long 22-degree upper glacis meets a 52-degree lower
// glacis; a 2.20 m tub between the tracks over a 0.47 m belly; sponsons out to ±1.70 m over the tracks, their fronts
// sloped up behind the fender boxes; the fighting-compartment roof at 1.50 m, the powerpack deck raised to 1.78 m over
// z -1.02..-1.42; an inclined rear plate with its access grille. Body -3.50..+3.62 m; 7.6 m with the stern rack.
const HULL = Object.freeze({
  noseZ: 3.62, noseY: 0.92, deckEdgeZ: 2.18, deckY: 1.50, engineY: 1.78, rampZ0: -1.02, rampZ1: -1.42,
  bellyY: 0.47, bellyFrontZ: 3.27, rearTopZ: -3.50, rearKneeZ: -3.42, rearKneeY: 0.64, bellyRearZ: -3.18,
  tubX: 1.10, sponsonX: 1.70, sponsonFloorY: 1.30, shoulderFrontZ: 3.00,
});
/** The upper glacis: y at z, from the deck edge (2.18, 1.50) down to the nose (3.62, 0.92), 21.9 degrees. */
const GLACIS_TAN = (HULL.deckY - HULL.noseY) / (HULL.noseZ - HULL.deckEdgeZ);
const glacisY = (z: number): number => HULL.deckY - (z - HULL.deckEdgeZ) * GLACIS_TAN;
const GLACIS_ANGLE = Math.atan(GLACIS_TAN);
const GLACIS_SIN = Math.sin(GLACIS_ANGLE), GLACIS_COS = Math.cos(GLACIS_ANGLE);
/** Deck height at z over the tub and sponsons (the 1.50 roof, the ramp, the 1.78 powerpack deck). */
function deckY(z: number): number {
  if (z >= HULL.rampZ0) return HULL.deckY;
  if (z <= HULL.rampZ1) return HULL.engineY;
  return HULL.deckY + (HULL.rampZ0 - z) / (HULL.rampZ0 - HULL.rampZ1) * (HULL.engineY - HULL.deckY);
}
/** Stations at ≤0.35 m pitch through the given knots (every gate slice holds real section faces). */
function stationsThrough(knots: readonly number[]): number[] {
  const zs: number[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const n = Math.max(1, Math.ceil((knots[i + 1] - knots[i]) / 0.35));
    for (let k = 0; k < n; k++) zs.push(knots[i] + (knots[i + 1] - knots[i]) * k / n);
  }
  zs.push(knots.at(-1)!);
  return zs;
}

function buildLongweiHullStructure(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  KIT.buildRunningGear(P, {
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
  // ---- the tub between the tracks: belly, lower glacis, upper glacis to the deck, the ramp and the inclined rear ----
  const tubTop = (z: number): number => Math.min(deckY(z), z > HULL.deckEdgeZ ? glacisY(z) : Infinity);
  const tubBottom = (z: number): number => {
    if (z >= HULL.bellyFrontZ) return HULL.bellyY + (z - HULL.bellyFrontZ) / (HULL.noseZ - HULL.bellyFrontZ) * (HULL.noseY - HULL.bellyY);
    if (z <= HULL.rearKneeZ) return HULL.rearKneeY + (HULL.rearKneeZ - z) / (HULL.rearKneeZ - HULL.rearTopZ) * (deckY(z) - 0.10 - HULL.rearKneeY);
    if (z <= HULL.bellyRearZ) return HULL.bellyY + (HULL.bellyRearZ - z) / (HULL.bellyRearZ - HULL.rearKneeZ) * (HULL.rearKneeY - HULL.bellyY);
    return HULL.bellyY;
  };
  const tubZs = stationsThrough([HULL.rearTopZ, HULL.rearKneeZ, HULL.bellyRearZ, HULL.rampZ1, HULL.rampZ0, HULL.deckEdgeZ,
    HULL.bellyFrontZ, HULL.noseZ - 0.004]);
  P.add('hull', sectionSolid(tubZs.map((z) => {
    let b = tubBottom(z), t = tubTop(z);
    if (t - b < 0.04) { const m = (t + b) / 2; b = m - 0.02; t = m + 0.02; }
    const c = Math.min(0.03, (t - b) / 4), w = HULL.tubX;
    return { z, ring: [[-w, b], [w, b], [w, t - c], [w - c, t], [-w + c, t], [-w, t - c]] as SectionPoint[] };
  })));
  // ---- sponsons over the tracks: their floor 1.30, their tops the deck; each front a shoulder sloped down behind the
  // fender box, the rear closed square at the rear plate ----
  const sponsonTop = (z: number): number => (z <= HULL.deckEdgeZ ? deckY(z)
    : HULL.deckY - (z - HULL.deckEdgeZ) / (HULL.shoulderFrontZ - HULL.deckEdgeZ) * (HULL.deckY - HULL.sponsonFloorY - 0.02));
  for (const side of [-1, 1]) {
    const zs = stationsThrough([HULL.rearTopZ + 0.02, HULL.rampZ1, HULL.rampZ0, HULL.deckEdgeZ, HULL.shoulderFrontZ]);
    P.add('hull', sectionSolid(zs.map((z) => {
      const r: SectionPoint[] = [[HULL.tubX - 0.02, HULL.sponsonFloorY], [HULL.sponsonX, HULL.sponsonFloorY],
        [HULL.sponsonX, sponsonTop(z)], [HULL.tubX - 0.02, sponsonTop(z)]];
      return { z, ring: side > 0 ? r : mirrorRing(r) };
    })));
  }
  // the fender shelf from the sponson wall to the skirt band, the full length of the course. Release 264 (envelope
  // honesty): the shelves, the front fender boxes, the hood cheeks and the skirts are not the hull's armour; in `hull`
  // they set the anatomy's armour envelope 0.16 m out from the sponson walls a side and 0.46 m behind the stern. The
  // sheet metal is painted bodywork (silhouette and paint kept), the skirts are spaced armour, the stern rack equipment.
  for (const side of [-1, 1]) {
    const x0 = HULL.sponsonX - 0.02, x1 = 1.84, z0 = HULL.rearTopZ - 0.02, z1 = 2.96;
    P.add('hullFixedPaintedBodywork', box(x1 - x0, 0.03, z1 - z0), side * (x0 + x1) / 2, 1.475, (z0 + z1) / 2);
  }
  P.add('hull', cylY(0.86, 0.86, 0.07, P.q ? 28 : 18), 0, 1.475, 0.28);        // turret ring seat
  // ---- front fenders (the 99A's solid rounded boxes over the idlers) + flaps ----
  for (const s of [-1, 1]) {
    const x0 = 1.13, x1 = 1.85, r = 0.06;
    const section = (lo: number, hi: number): SectionPoint[] => {
      const pts: SectionPoint[] = [[x0, lo], [x1, lo]];
      for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI / 2; pts.push([x1 - r + Math.cos(a) * r, hi - r + Math.sin(a) * r]); }
      pts.push([x0, hi]);
      return s > 0 ? pts : mirrorRing(pts);
    };
    P.add('hullFixedPaintedBodywork', sectionSolid([[2.92, 1.30, 1.485], [3.30, 1.30, 1.485], [3.44, 1.285, 1.45], [3.54, 1.27, 1.36]]
      .map(([z, lo, hi]) => ({ z, ring: section(lo, hi) }))));
    P.hangMudguard('ztz99-longwei-front-flap', 'hullRubber', box(0.60, 0.30, 0.028), s * 1.47, 1.11, 3.53);
    // the hood's outer cheek from the skirt band's front end to the flap, closing the open slot over the idler
    P.add('hullFixedPaintedBodywork', box(0.022, 0.20, 0.27), s * 1.845, 1.205, 3.405);
  }
  // ---- stern: the rear access grille, tail lamps, tow hooks, flaps, the stern rack's shelf and its cable ----
  const rearN = new THREE.Vector3(0, HULL.rearTopZ - HULL.rearKneeZ, -(HULL.engineY - HULL.rearKneeY)).normalize();
  const rearTilt = Math.atan2(-rearN.y, -rearN.z);
  const rearAt = (y: number): number => HULL.rearKneeZ + (y - HULL.rearKneeY) / (HULL.engineY - 0.10 - HULL.rearKneeY) * (HULL.rearTopZ - HULL.rearKneeZ);
  P.add('hullDark', box(1.30, 0.50, 0.03), 0, 1.20, rearAt(1.20) - 0.004, rearTilt, 0, 0);       // access grille well
  for (const k of KIT.grilleIndices(P.q, 7, 4)) {
    const y = 0.98 + k * 0.07;
    P.add('hullDetail', box(1.26, 0.024, 0.04), 0, y, rearAt(y) - 0.012, rearTilt, 0, 0);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.16, 0.10, 0.06), s * 0.86, 1.56, rearAt(1.56) - 0.02, rearTilt, 0, 0);  // tail lamps
    P.add('hullDetail', box(0.12, 0.14, 0.12), s * 0.62, 0.72, rearAt(0.72) - 0.04);                   // tow hook blocks
    P.add('hullDark', KIT.torus(0.06, 0.016, 12), s * 0.62, 0.66, rearAt(0.66) - 0.10, Math.PI / 2 - 0.3, 0, 0);
    P.add('hullRubber', box(0.60, 0.26, 0.028), s * 1.47, 1.34, HULL.rearTopZ - 0.04);                // rear flaps
    P.add('hullDetail', box(0.07, 0.10, 0.09), s * 1.62, 1.46, HULL.rearTopZ - 0.02);
    P.add('hullDetail', box(0.07, 0.10, 0.09), s * 1.30, 1.46, HULL.rearTopZ - 0.02);
  }
  // the stern rack: a backed shelf off the deck edge carrying the armoured bin, the tow cable laid flat behind it
  P.addEquipment('hull', box(1.60, 0.040, 0.48), 0, 1.70, -3.72);
  for (const x of [-0.70, 0.70]) P.add('hullDetail', box(0.08, 0.20, 0.44), x, 1.60, -3.70, 0.25, 0, 0);
  P.hullG.add(FITTINGS.towCable({ mats: P.mats, r: 0.022, seed: 12,
    pts: [[-0.66, 1.742, -3.88], [-0.35, 1.742, -3.93], [0, 1.742, -3.94], [0.35, 1.742, -3.93], [0.66, 1.742, -3.88]] }));
  // ---- driver's hatch flush in the roof ahead of the ring, his three periscopes on the glacis ----
  P.add('hull', box(0.56, 0.03, 0.46), 0, HULL.deckY + 0.012, 2.00);
  P.addHatch('hull', KIT.cylY(0.22, 0.22, 0.025, P.q ? 24 : 14), 0, HULL.deckY + 0.034, 2.00);
  for (const x of [-0.16, 0, 0.16]) {
    const z = 2.32;
    KIT.periscope(P, 'hullDetail', x, glacisY(z) + 0.03, z, x * 0.8);
  }
  // ---- engine deck: grille field, intake mesh and the low filter hump; lift eyes ----
  P.add('hullDark', box(1.55, 0.02, 1.30), 0, HULL.engineY + 0.005, -2.40);
  for (const k of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDetail', box(1.45, 0.02, 0.055), 0, HULL.engineY + 0.012, -1.95 - k * 0.16);
  }
  P.add('hullDark', box(0.72, 0.02, 0.52), -0.52, HULL.engineY + 0.01, -1.66);
  P.add('hull', box(0.92, 0.05, 0.72), 0.48, HULL.engineY - 0.008, -1.76);
  P.add('hullDark', box(0.80, 0.02, 0.60), 0.48, HULL.engineY + 0.012, -1.76);
  // the transverse exhaust louvre along the deck's rear edge
  P.add('hullDark', box(1.90, 0.02, 0.20), 0, HULL.engineY + 0.006, -3.30);
  for (const k of KIT.grilleIndices(P.q, 3, 2)) P.add('hullDetail', box(1.86, 0.018, 0.035), 0, HULL.engineY + 0.014, -3.23 - k * 0.06);
  for (const [x, y, z] of [[-1.30, HULL.deckY, 1.70], [1.30, HULL.deckY, 1.70], [-1.30, HULL.engineY, -3.05], [1.30, HULL.engineY, -3.05]]) {
    KIT.liftEye(P, 'hullDetail', x, y - 0.01, z);
  }
}

// ---------------------------------------------------------------------------
// Hull dress
// ---------------------------------------------------------------------------

/**
 * The straight FY-5 glacis field (the Longwei's own; the 99A's is a chevron): per side three columns in three rows on
 * the 22-degree plate, the driver's periscope lane clear; every brick top stays 15 cm or more under the main gun at full
 * depression.
 */
function addGlacisField(P: TankBuilderPort): void {
  // the outer column ends at 1.13, inside the track's inner face (1.158; 262 track-clip gate: the bottom row's outer
  // brick stood in the belt where it climbs the idler)
  const w = 0.29, h = 0.30, d = 0.065;
  for (const side of [-1, 1] as const) {
    P.eraCluster(side < 0 ? 'glacis_era_L' : 'glacis_era_R', (put) => {
      for (const s of [0.42, 0.76, 1.10]) for (const x of [0.375, 0.68, 0.985]) {
        // s metres down the plate from the deck edge; bedded 5 mm into the plate along its normal (0, cos, sin)
        const out = d / 2 - 0.005;
        put(side * x, HULL.deckY - s * GLACIS_SIN + out * GLACIS_COS, HULL.deckEdgeZ + s * GLACIS_COS + out * GLACIS_SIN,
          -(Math.PI / 2 - GLACIS_ANGLE), 0, 0, w / 0.28, h / 0.13, d / 0.07);
      }
    });
  }
}

/** Headlights on the front fender boxes (the 99A's): an armoured cowl with paired round lenses facing forward. */
function addFenderLamps(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  for (const side of [-1, 1]) {
    const x = side * 1.36, z = 3.33, top = 1.485;
    P.addEquipment('hullDetail', box(0.26, 0.12, 0.16), x, top + 0.055, z);
    P.addEquipment('hullDetail', box(0.28, 0.016, 0.20), x, top + 0.122, z + 0.01);
    for (const dx of [-0.06, 0.06]) {
      P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.042, 0.016, 16), 'headlight'), x + dx, top + 0.055, z + 0.085);
    }
  }
}

/**
 * The nose: a slim bolted towing bar across the lower glacis just under the nose (the Longwei's), its two towing eyes,
 * and below it the 99A's row of four appliqué boxes. The gun at -7 degrees passes well over both.
 */
function addNoseDress(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const lowerTan = (HULL.noseY - HULL.bellyY) / (HULL.noseZ - HULL.bellyFrontZ);
  const lowerZ = (y: number): number => HULL.bellyFrontZ + (y - HULL.bellyY) / lowerTan;
  const tilt = -(Math.PI / 2 - Math.atan(lowerTan));
  P.add('hullDetail', box(1.90, 0.07, 0.04), 0, 0.84, lowerZ(0.84) + 0.012, tilt, 0, 0);
  for (const x of [-0.84, -0.56, -0.28, 0.28, 0.56, 0.84]) P.add('hullDark', cylZ(0.014, 0.014, 8), x, 0.84, lowerZ(0.84) + 0.036, tilt, 0, 0);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.08, 0.10, 0.10), side * 0.98, 0.80, lowerZ(0.80) + 0.03);
    P.add('hullDark', place(KIT.torus(0.045, 0.014, 12), side * 0.98, 0.74, lowerZ(0.74) + 0.07, Math.PI / 2));
  }
  for (const x of [-0.66, -0.22, 0.22, 0.66]) {
    P.add('hullDetail', box(0.40, 0.18, 0.07), x, 0.62, lowerZ(0.62) + 0.03, tilt, 0, 0);
    for (const dx of [-0.15, 0.15]) P.add('hullDark', cylZ(0.013, 0.012, 8), x + dx, 0.66, lowerZ(0.66) + 0.066, tilt, 0, 0);
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
    // top band from the bow to the stern, on the fender's outer edge (the band, panels and nose plate are spaced armour)
    P.addExternalArmor('hull', sectionSolid([
      { z: joints.at(-1)!, ring: ring(bandIn, bandOut, 1.225, 1.47) },
      { z: joints[0], ring: ring(bandIn, bandOut, 1.225, 1.47) },
    ]));
    for (let i = 0; i < joints.length - 1; i++) {
      // a 3 cm V-gap between panels (the 99A's panel breaks)
      const front = joints[i], rear = joints[i + 1], gap = 0.03;
      const z0 = rear + gap / 2, z1 = front - gap / 2;
      // the lower edge reaches near the hubs (the 99A's), scalloped up over each wheel's middle; the bow panel's nose
      // rakes up from that edge to 0.98 m over its last 0.45 m
      // angular notches (the 99A's), not round arches
      const scallop = (z: number): number => SKIRT_LOW_Y + 0.18 * (1 - Math.abs(2 * (z - z0) / (z1 - z0) - 1));
      const bottom = (z: number): number => {
        if (i === 0 && z > 2.85) return scallop(2.85) + (z - 2.85) / (z1 - 2.85) * (0.98 - scallop(2.85));
        return scallop(z);
      };
      const zs = Array.from({ length: 7 }, (_, k) => z0 + (z1 - z0) * k / 6);
      if (i === 0) zs.splice(zs.findIndex((z) => z > 2.85), 0, 2.85);
      P.addExternalArmor('hull', sectionSolid(zs.map((z) => ({ z, ring: ring(panelIn, panelOut, bottom(z), 1.235) }))));
      // the joint behind each panel: a dark seam strip on the band
      if (i > 0) P.add('hullDark', KIT.box(0.006, 1.235 - SKIRT_LOW_Y, 0.014), side * (panelOut + 0.001), (1.235 + SKIRT_LOW_Y) / 2, front);
      // two small access holes per panel
      for (const f of [0.30, 0.70]) {
        const z = z0 + (z1 - z0) * f;
        P.add('hullDark', KIT.box(0.006, 0.06, 0.06), side * (panelOut + 0.001), 0.82, z);
      }
    }
    // the bow panel's front edge closed back to just outside the track's outer face (1.788; 262 track-clip gate: from
    // 1.765 it stood in the belt over the idler), so the skirt reads as a plate with a closed nose, not an open slot
    P.addExternalArmor('hull', KIT.box(panelOut - 1.81, 1.235 - 0.98, 0.012), side * (1.81 + panelOut) / 2, (1.235 + 0.98) / 2, joints[0] - 0.012);
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
 * A low armoured tool box on the stern rack (where the 99A family carries fuel drums), behind the exhaust louvre:
 * bevelled, two latches, a hinge line and two webbing straps.
 */
function addSternBin(P: TankBuilderPort): void {
  const { box } = KIT;
  const x0 = -0.46, x1 = 0.46, z0 = -3.86, z1 = -3.56, y0 = 1.716, y1 = 1.87;
  const ring: SectionPoint[] = [[x0, y0], [x1, y0], [x1, y1 - 0.03], [x1 - 0.03, y1], [x0 + 0.03, y1], [x0, y1 - 0.03]];
  P.addEquipment('hullDetail', sectionSolid([{ z: z0, ring }, { z: z1, ring }]));
  P.addEquipment('hullDark', box(x1 - x0 - 0.08, 0.012, 0.012), 0, y1 - 0.004, z1 - 0.02);   // hinge line
  for (const x of [-0.24, 0.24]) {
    P.addEquipment('hullDark', box(0.06, 0.06, 0.016), x, y1 - 0.06, z0 - 0.004);              // latches
    P.addEquipment('hullCloth', box(0.05, y1 - y0 + 0.012, z1 - z0 + 0.012), x * 1.45, (y0 + y1) / 2 + 0.005, (z0 + z1) / 2);
  }
}

function dressLongweiHull(P: TankBuilderPort): void {
  addGlacisField(P);
  addNoseDress(P);
  addFenderLamps(P);
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
  // the brow over the gun throat from the core's front to where the cheeks' tops meet the roof beside it (no further:
  // ahead of that the throat's tops fall away and a longer brow stood out over them)
  const browFront = CHEEK_TIP_Z - CHEEK_TOP_RUN_PER_RISE * (ROOF_Y - 0.02 - CHEEK_THROAT_TOP_Y);
  P.add('turret', KIT.box(THROAT_X * 2 + 0.04, ROOF_Y - BROW_UNDER_Y, browFront - CORE_FRONT_Z), 0, (ROOF_Y + BROW_UNDER_Y) / 2,
    (browFront + CORE_FRONT_Z) / 2);
  // the throat's floor between the wedges under the mantlet (critic round 3: the gap read as a hole into the turret);
  // its top 1.3 cm under the mantlet's lowest corner at full depression
  P.add('turret', KIT.box(THROAT_X * 2 + 0.02, 0.05, CHEEK_TIP_Z - CORE_FRONT_Z), 0, 0.005, (CHEEK_TIP_Z + CORE_FRONT_Z) / 2);
}

/** One cheek wedge's section at |x| = a: its front line runs from the throat tip (z 1.55 at |x| 0.30) back to 0.72 at
 * the outer corner (|x| 1.42), 37 degrees off square in plan; the face leans back 0.08 m, the top falls 0.32 m from the
 * roof to its front edge at 45 degrees (the arrowhead in profile), and its root buries 0.85 m back into the core. */
const cheekFrontZ = (a: number): number => CHEEK_TIP_Z - (a - THROAT_X) * CHEEK_SWEEP;
// straight bottom and front-top lines on a vertical face keep the face planar, and the top's constant rake keeps it
// planar too (the combat plates trace them exactly)
const cheekBottomY = (_a: number): number => CHEEK_BOTTOM_Y;
const cheekFrontTopY = (a: number): number =>
  CHEEK_THROAT_TOP_Y + (CHEEK_OUTER_TOP_Y - CHEEK_THROAT_TOP_Y) * (a - THROAT_X) / (CHEEK_OUTER_X - THROAT_X);
const cheekTopRun = (a: number): number => CHEEK_TOP_RUN_PER_RISE * (ROOF_Y - 0.02 - cheekFrontTopY(a));
const CHEEK_LEAN = 0;
function cheekSection(a: number): ZY[] {
  const zf = cheekFrontZ(a), yb = cheekBottomY(a), yt = cheekFrontTopY(a);
  return [[zf, yb], [zf - CHEEK_LEAN, yt], [zf - cheekTopRun(a), ROOF_Y - 0.02], [zf - CHEEK_DEPTH, ROOF_Y - 0.02], [zf - CHEEK_DEPTH, yb]];
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

/** Release 264 (owner 2026-10-28: "make the squares on frront cheeks adjusted properly so its not weird and properly
 * varies"): the cheek face is a planar trapezoid, level along its bottom and rising from 0.28 m at the throat to 0.62 m
 * at the outer corner, so a box laid on it stood past the top edge at its inner corner and left bare face under that edge
 * at its outer one. Each cassette is now a block whose four corners lie on the face, 25 mm over its bottom and 45 mm
 * under its top edge (clear of the edge's bolt row), from |x| 0.36 by the throat to 1.47 inside the outer corner, so its top runs parallel to the edge; the rows take fixed shares of
 * each column's height, and the columns' widths follow the face's height (narrow by the throat, broad at the corner),
 * so each block is about as wide as its column is tall. */
// (critic round 2: ending at 1.53 the outer block's end stood flush with the side module's wall, a fin at the corner;
// at 1.47 it ends 5 cm inside the corner)
const FACE_IN_X = 0.36, FACE_OUT_X = 1.47, FACE_LOW_M = 0.025, FACE_TOP_M = 0.045;
/** Metres along the face per metre of |x|. */
const FACE_ALONG = Math.hypot(1, CHEEK_SWEEP);
const faceLowY = (_a: number): number => CHEEK_BOTTOM_Y + FACE_LOW_M;
const faceHighY = (a: number): number => cheekFrontTopY(a) - FACE_TOP_M;

/** The count of columns that makes each of `rows` rows' tiles square: the face's run over the mean row height. */
function squareColumnCount(rows: number, gapM: number, rowGapM: number): number {
  let best = 1, bestError = Infinity;
  for (let n = 1; n <= 16; n++) {
    const columns = cheekFaceColumns(n, gapM);
    const error = columns.reduce((sum, [a0, a1]) => {
      const h = (faceHighY((a0 + a1) / 2) - faceLowY((a0 + a1) / 2) - rowGapM * (rows - 1)) / rows;
      return sum + Math.abs(Math.log(((a1 - a0) * FACE_ALONG) / h));
    }, 0) / n;
    if (error < bestError) { best = n; bestError = error; }
  }
  return best;
}

/** The face's columns, [|x| inner, |x| outer], `gapM` apart along the face, each as wide as the face is tall at its
 * middle (relative to the others). */
function cheekFaceColumns(count: number, gapM: number): [number, number][] {
  const gap = gapM / FACE_ALONG, span = FACE_OUT_X - FACE_IN_X - gap * (count - 1);
  let widths = Array.from({ length: count }, () => span / count);
  for (let pass = 0; pass < 8; pass++) {
    let a = FACE_IN_X;
    const heights = widths.map((w) => { const h = faceHighY(a + w / 2) - faceLowY(a + w / 2); a += w + gap; return h; });
    const total = heights.reduce((sum, h) => sum + h, 0);
    widths = heights.map((h) => (h / total) * span);
  }
  const columns: [number, number][] = [];
  let a = FACE_IN_X;
  for (const w of widths) { columns.push([a, a + w]); a += w + gap; }
  return columns;
}

/** A closed six-faced block from its four base corners and four top corners (in order round the base); each face wound
 * outward, uv planar on the face's two widest axes. */
function hexahedron(base: readonly THREE.Vector3[], top: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const centre = [...base, ...top].reduce((c, v) => c.add(v), new THREE.Vector3()).multiplyScalar(1 / 8);
  const quads = [[...top], [...base].reverse(), ...[0, 1, 2, 3].map((i) => [base[i], base[(i + 1) % 4], top[(i + 1) % 4], top[i]])];
  const position: number[] = [], normal: number[] = [], uv: number[] = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3();
  for (const q of quads) {
    n.crossVectors(e1.subVectors(q[1], q[0]), e2.subVectors(q[3], q[0])).normalize();
    mid.copy(q[0]).add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25);
    const quad = n.dot(mid.sub(centre)) < 0 ? (n.negate(), [...q].reverse()) : q;
    const ax = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 0 : Math.abs(n.y) > Math.abs(n.z) ? 1 : 2;
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const v = quad[k];
      position.push(v.x, v.y, v.z); normal.push(n.x, n.y, n.z);
      const c = v.toArray(); c.splice(ax, 1); uv.push(c[0], c[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** One face-fitted cassette on the cheek face (sign: +1 on +X) over [a0, a1], its bottom and top at fractions f0 and f1
 * of the column's height: `thick` proud of the face (6 mm into it), its lid inset on its top, bound to its ERA sector as
 * one destructible cluster. `ridge` raises a vertical ridge down the middle that far again (a V-ridged chevron). */
function faceCassette(P: TankBuilderPort, sector: string, sign: number, a0: number, a1: number, f0: number, f1: number,
  thick: number, ridge = 0, ownCamo = false): void {
  const n = cheekFaceNormal(sign);
  const at = (a: number, f: number, out: number): THREE.Vector3 =>
    cheekFacePoint(sign, a, faceLowY(a) + f * (faceHighY(a) - faceLowY(a))).addScaledVector(n, out);
  const halves: [number, number, number, number][] = ridge > 0
    ? [[a0, (a0 + a1) / 2, 0, ridge], [(a0 + a1) / 2, a1, ridge, 0]] : [[a0, a1, 0, 0]];
  P.destructibleCluster(sector, () => {
    for (const [b0, b1, r0, r1] of halves) {
      const base = [at(b0, f0, -0.006), at(b1, f0, -0.006), at(b1, f1, -0.006), at(b0, f1, -0.006)];
      const top = [at(b0, f0, thick - 0.006 + r0), at(b1, f0, thick - 0.006 + r1), at(b1, f1, thick - 0.006 + r1), at(b0, f1, thick - 0.006 + r0)];
      const block = markEraHitFaces(hexahedron(base, top), n.toArray());
      const shift = ownCamo ? blockCamoShift(sign * a0, f0, a1) : null;
      if (shift) block.userData.camoUvOffset = shift;
      P.addExternalArmor('turret', block);
      // the lid: the top face inset 8 % toward its middle, 8 mm proud along its own normal (critic round 2: inset 4 % and
      // 12 mm proud, the lids read as loose slats on the blocks)
      const middle = top.reduce((c, v) => c.clone().add(v), new THREE.Vector3()).multiplyScalar(0.25);
      const lidN = new THREE.Vector3().crossVectors(top[1].clone().sub(top[0]), top[3].clone().sub(top[0])).normalize();
      if (lidN.dot(n) < 0) lidN.negate();
      const inset = top.map((v) => v.clone().lerp(middle, 0.08));
      const lid = markEraFurniture(hexahedron(inset.map((v) => v.clone().addScaledVector(lidN, -0.002)),
        inset.map((v) => v.clone().addScaledVector(lidN, 0.008))));
      if (shift) lid.userData.camoUvOffset = shift;
      P.addExternalArmor('turret', lid);
    }
  });
}

/** A block's own camouflage shift (camouflage-tile units, deterministic from where it stands): a different patch from
 * its neighbours and from the face under it. */
function blockCamoShift(x: number, y: number, z: number): [number, number] {
  const fract = (v: number): number => v - Math.floor(v);
  return [0.25 + 0.5 * fract(x * 7.31 + z * 3.17 + y * 1.9), 0.25 + 0.5 * fract(x * 2.53 + z * 5.71 + y * 4.3)];
}

/** Each kit's face layout: its columns (a count, or 'square': as many as make every tile square) and its rows' shares of
 * each column's height. Critic round 2: a 3 x 2 grid on this long low face read as louvre strips, the tiles four times as
 * wide as tall; the tiled kits now size their columns to their rows. */
const FACE_ROW_GAP_M = 0.03;
const FACE_LAYOUTS: Readonly<Record<LongweiTurretKit['faceEra'], { columns: number | 'square'; gapM: number; rows: readonly number[]; ridge: boolean }>> = Object.freeze({
  pair: { columns: 2, gapM: 0.08, rows: [1], ridge: false },
  grid: { columns: 'square', gapM: 0.035, rows: [0.52, 0.48], ridge: false },
  chevron: { columns: 2, gapM: 0.06, rows: [1], ridge: true },
  tiles: { columns: 'square', gapM: 0.045, rows: [1], ridge: false },
});
function faceLayoutColumns(layout: (typeof FACE_LAYOUTS)[LongweiTurretKit['faceEra']]): [number, number][] {
  const count = layout.columns === 'square' ? squareColumnCount(layout.rows.length, layout.gapM, FACE_ROW_GAP_M) : layout.columns;
  return cheekFaceColumns(count, layout.gapM);
}

/** The arrowhead front: a welded composite wedge either side of the gun throat, the kit's reactive armour on its face, a
 * row of bolt heads along its top edge. */
function addCheekWedges(P: TankBuilderPort, kit: LongweiTurretKit): void {
  const steps = [THROAT_X, 0.55, 0.85, 1.10, 1.35, CHEEK_OUTER_X];
  for (const sign of [-1, 1]) {
    P.add('turret', loftX(steps.map((a) => ({ x: sign * a, ring: cheekSection(a) }))));
    // critic round 2: 65 mm blocks read as flush plates; 80 mm stand proud of the face
    const n = cheekFaceNormal(sign), thick = 0.08;
    const sector = sign < 0 ? 'turret_era_L' : 'turret_era_R';
    const layout = FACE_LAYOUTS[kit.faceEra], rowGap = FACE_ROW_GAP_M;
    for (const [a0, a1] of faceLayoutColumns(layout)) {
      // each row's share of the column, less half the row gap at a joint (as a share of the column's middle height)
      const gapShare = rowGap / (faceHighY((a0 + a1) / 2) - faceLowY((a0 + a1) / 2));
      let f = 0;
      layout.rows.forEach((share, row) => {
        const f0 = f + (row > 0 ? gapShare / 2 : 0), f1 = f + share - (row < layout.rows.length - 1 ? gapShare / 2 : 0);
        f += share;
        // critic round 1: a 9-degree ridge read as flat slabs; round 4: at 16 degrees (9 cm at most) the V was lost at
        // hero distance; the chevron's ridge stands 24 degrees off each half, 12 cm at most
        const ridge = layout.ridge ? Math.min(0.12, ((a1 - a0) * FACE_ALONG / 2) * Math.tan(24 * D2R)) : 0;
        faceCassette(P, sector, sign, a0, a1, f0, f1, thick, ridge, kit.blockCamo);
      });
    }
    // the wedge's joint with its side module: a dark seam down the outer corner's rear edge
    P.add('turretDark', KIT.box(0.006, ROOF_Y - 0.02 - CHEEK_BOTTOM_Y, 0.014), sign * (CHEEK_OUTER_X + 0.003),
      (ROOF_Y - 0.02 + CHEEK_BOTTOM_Y) / 2, cheekFrontZ(CHEEK_OUTER_X) - CHEEK_DEPTH);
    for (const a of [0.45, 0.85, 1.20, 1.50]) {
      const p = cheekFacePoint(sign, a, cheekFrontTopY(a) - 0.02).addScaledVector(n, 0.004);
      const bolt = KIT.cylY(0.013, 0.013, 0.014, 8);
      bolt.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      P.add('turretDark', bolt, p.x, p.y, p.z);
    }
  }
}

/** Slab side modules from the cheek root to the bustle bins, bevelled at the lower lip, their front edge chamfered into
 * the cheek's outer corner; bolt heads on the outer face. */
function addSideModules(P: TankBuilderPort, kit: LongweiTurretKit): void {
  const { cylX } = KIT;
  // the lower lip stands 4 cm over the ring plane at the front and rises to 0.16 at the rear corner, which sweeps the
  // powerpack deck's ramp at 1.89 m from the ring (its 1.66 m line at local 0.09) when the turret traverses
  const section = (lip: number): SectionPoint[] => [[1.27, lip], [1.52, lip], [1.568, lip + 0.05], [1.568, ROOF_Y - 0.07],
    [1.53, ROOF_Y - 0.03], [1.27, ROOF_Y - 0.03]];
  // the module's front runs into the cheek wedge's rear (the wedge's outer face continues the module's)
  const front = 0.0, rear = SIDE_MODULE_REAR_Z;
  for (const side of [-1, 1]) {
    const ring = (lip: number): SectionPoint[] => (side > 0 ? section(lip) : mirrorRing(section(lip)));
    P.addExternalArmor('turret', sectionSolid([{ z: rear, ring: ring(0.16) }, { z: front, ring: ring(0.04) }]));
    for (const z of [front - 0.26, (front + rear) / 2, rear + 0.10]) for (const y of [0.30, ROOF_Y - 0.16]) {
      P.add('turretDark', cylX(0.013, 0.012, 8), side * 1.575, y, z);
    }
    // the module's seam with its bin: a dark joint line
    P.add('turretDark', KIT.box(0.30, 0.012, 0.012), side * 1.42, ROOF_Y - 0.03, rear + 0.01);
    // release 264: two rows of three cassettes on the outer face, over the module's rising lower lip, 9 cm deep and 1 cm
    // apart (critic round 1: thinner, wider-spaced plates read as cards)
    if (kit.sideEra) for (const z of [-0.18, -0.495, -0.81]) for (const [y, h] of [[0.33, 0.21], [0.555, 0.20]]) {
      eraCassette(P, 'turret', side < 0 ? 'turret_side_era_L' : 'turret_side_era_R', [side * (1.568 + 0.045), y, z],
        [0.09, h, 0.305]);
    }
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
  // 266 (roof-pocket census): the mantlet's upper shield under the brow, its top an arc about the trunnion 5 mm inside
  // the brow's underside, so it fills the throat there at every pitch and never meets the brow, out to 5 mm off the throat
  // walls (the throat stood open 16 cm over the mantlet under the brow, and 5 cm beside it: 0.11 m2 of see-through)
  const shieldR = BROW_UNDER_Y - TRUNNION[1] - 0.005, shieldHalfW = THROAT_X - 0.005;
  P.add('gunMount', sectionSolid([-0.10, -0.05, 0, 0.05, 0.10, 0.14].map((z) => {
    const top = Math.sqrt(shieldR * shieldR - z * z);
    return { z, ring: [[-shieldHalfW, 0.18], [shieldHalfW, 0.18], [shieldHalfW, top], [-shieldHalfW, top]] as SectionPoint[] };
  })));
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

/** Release 264, the Baihu's searchlight (owner 2026-10-28: "add a big floodlight on thhe baihu"): a drum half again the
 * Luna's, right of the gun over the cheek's top, on the fleet's gun-floodlight bracket (gunFloodlight.ts). Critic round 2
 * (the lamp read as perched on a strap, its lens as a pipe mouth): a yoke cradles it, a saddle under the drum and a cheek
 * either side with trunnion bosses, and a guard grille crosses the lens. Every part of it clears the wedge's top by 2.5
 * cm or more at full depression (the saddle's back corner is the nearest). */
function addLongweiFloodlight(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const x = -0.48, y = 0.30, r = 0.17, backZ = 0.70, depth = 0.28, zc = backZ + depth / 2;
  addGunFloodlight(P, { side: 'right', x: -x, y, backZ, anchorX: 0.20, anchorY: 0.15, anchorZ: 0.30, radius: r, depth,
    bucket: 'gunMountLamp' });
  const saddleY = y - r - 0.016;
  P.add('gunMountLamp', box(2 * r - 0.04, 0.032, 0.12), x, saddleY, zc);
  for (const side of [-1, 1]) {
    const cx = x + side * (r + 0.018);
    P.add('gunMountLamp', box(0.028, y - saddleY + 0.02, 0.10), cx, (y + saddleY) / 2, zc);
    P.add('gunMountDark', cylX(0.045, 0.04, 14), cx + side * 0.012, y, zc);
  }
  // the lens guard: three uprights and a cross bar 8 mm off the glass
  const front = backZ + depth + 0.012, span = 2 * r * 0.80;
  for (const dx of [-0.075, 0, 0.075]) {
    P.add('gunMountDark', box(0.012, Math.sqrt(Math.max(0, (span / 2) ** 2 - dx * dx)) * 2, 0.012), x + dx, y, front);
  }
  P.add('gunMountDark', box(span, 0.012, 0.012), x, y, front);
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

/** Release 264: a closed armoured box from z0 to z1 (z0 < z1) between x0 and x1 and y0 and y1, chamfered round its outer
 * top edge on `side`, its lid line and two latches on the outer face. */
function armouredBox(P: TankBuilderPort, side: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  ownCamo = false): void {
  const { box } = KIT;
  const base: SectionPoint[] = [[x0, y0], [x1 - 0.04, y0], [x1, y0 + 0.04], [x1, y1 - 0.04], [x1 - 0.04, y1], [x0, y1]];
  const ring = side > 0 ? base : mirrorRing(base);
  const body = sectionSolid([{ z: z0, ring }, { z: z1, ring }]);
  if (ownCamo) body.userData.camoUvOffset = blockCamoShift(side * x1, y0, z0);
  P.addEquipment('turretDetail', body);
  P.addEquipment('turretDark', box(0.012, 0.010, z1 - z0 - 0.06), side * (x1 + 0.001), y1 - 0.08, (z0 + z1) / 2);
  for (const f of [0.25, 0.75]) {
    P.addEquipment('turretDark', box(0.016, 0.06, 0.045), side * (x1 + 0.006), y1 - 0.13, z0 + (z1 - z0) * f);
  }
}

/** The bustle: two lidded bins a side behind the side modules (or, release 264, one closed armoured box a side), the
 * blow-off panels over the ammunition compartment and the rear basket (or a closed rear box). Bins bottom at 0.36 and the
 * basket floor at 0.38: the engine deck's dress tops out at local 0.29. */
function addBustle(P: TankBuilderPort, kit: LongweiTurretKit): void {
  const { box } = KIT;
  if (kit.bustle === 'boxes') {
    for (const side of [-1, 1]) {
      armouredBox(P, side, 1.06, 1.54, 0.36, ROOF_Y - 0.05, CORE_REAR_Z + 0.08, SIDE_MODULE_REAR_Z - 0.02, kit.blockCamo);
    }
    // the rear box across the rear wall: its floor at the basket's 0.38, 0.62 m deep, lid line and three latches
    const rearRing: SectionPoint[] = [[-1.00, 0.38], [1.00, 0.38], [1.00, 0.66], [0.96, 0.70], [-0.96, 0.70], [-1.00, 0.66]];
    const rearBox = sectionSolid([{ z: CORE_REAR_Z - 0.62, ring: rearRing }, { z: CORE_REAR_Z + 0.004, ring: rearRing }]);
    if (kit.blockCamo) rearBox.userData.camoUvOffset = blockCamoShift(0, 0.38, CORE_REAR_Z - 0.62);
    P.addEquipment('turretDetail', rearBox);
    P.addEquipment('turretDark', box(1.94, 0.010, 0.012), 0, 0.62, CORE_REAR_Z - 0.621);
    for (const x of [-0.62, 0, 0.62]) P.addEquipment('turretDark', box(0.06, 0.05, 0.016), x, 0.56, CORE_REAR_Z - 0.626);
  }
  if (kit.bustleCage) addBustleCage(P, kit);
  for (const side of [-1, 1]) {
    if (kit.bustle === 'boxes') break;
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
    P.add('turretDark', box(0.74, 0.012, 0.66), x, ROOF_Y + 0.004, -2.02);
    P.add('turretDetail', box(0.70, 0.022, 0.62), x, ROOF_Y + 0.011, -2.02);
    P.addEquipment('turretDark', box(0.14, 0.022, 0.022), x, ROOF_Y + 0.03, -2.02);
  }
  if (kit.bustle === 'boxes') return;
  // rear basket against the rear wall, floor at 0.38
  const rack = FITTINGS.stowageRack({
    mats: P.mats, w: 2.00, d: 0.62, h: 0.30, posts: 7, fill: 0.82, rails: 2, mesh: true,
    rotation: [0, Math.PI, 0], seed: 23310,
  });
  rack.position.set(0, 0.38, CORE_REAR_Z - 0.30);
  rack.rotation.set(0, Math.PI, 0);
  P.turretG.add(rack);
}

/** Release 264: a slat screen 0.10 m off the bustle's flanks and rear: flat slats edge-on to the threat every 0.09 m
 * between a top and a bottom rail, on short arms from the bins (or boxes) and the rear basket's frame (critic round 1:
 * round bars every 0.12 m read as a railing). */
function addBustleCage(P: TankBuilderPort, kit: LongweiTurretKit): void {
  const { box } = KIT;
  // critic round 2: run the whole side module, the screen read as an empty fence; it guards the rear bins and basket
  const x = 1.64, zFront = -1.76, zRear = CORE_REAR_Z - 0.62 - 0.10, y0 = 0.38, y1 = 0.74;
  const rail = (len: number) => box(0.035, 0.035, len);
  for (const side of [-1, 1]) {
    for (const y of [y0 + 0.02, y1 - 0.02]) P.add('turretDark', rail(zFront - zRear), side * x, y, (zFront + zRear) / 2);
    for (let z = zFront - 0.05; z > zRear + 0.03; z -= 0.09) P.add('turretDark', box(0.055, y1 - y0, 0.012), side * x, (y0 + y1) / 2, z);
    // arms back to the bins (or boxes) at three stations
    for (const z of [zFront - 0.10, (zFront + zRear) / 2, zRear + 0.10]) {
      P.add('turretDark', box(x - 1.54 + 0.02, 0.03, 0.03), side * (1.54 + x) / 2, y1 - 0.08, z);
    }
  }
  for (const y of [y0 + 0.02, y1 - 0.02]) P.add('turretDark', box(2 * x + 0.035, 0.035, 0.035), 0, y, zRear);
  for (let xx = -x + 0.08; xx < x - 0.04; xx += 0.09) P.add('turretDark', box(0.012, y1 - y0, 0.055), xx, (y0 + y1) / 2, zRear);
  for (const xx of [-0.70, 0.70]) {
    P.add('turretDark', box(0.03, 0.03, (kit.bustle === 'boxes' ? 0.10 : 0.11)), xx, y1 - 0.08, zRear + 0.05);
  }
  // the crew's kit inside it: two rolled tarpaulins strapped across the basket's top
  for (const xx of [-0.46, 0.46]) {
    P.addEquipment('turretCloth', KIT.cylX(0.10, 0.80, P.q ? 16 : 10), xx, 0.38 + 0.30 + 0.10 - 0.01, CORE_REAR_Z - 0.30);
    for (const dx of [-0.25, 0.25]) P.addEquipment('turretDark', KIT.cylX(0.104, 0.03, P.q ? 16 : 10), xx + dx, 0.38 + 0.30 + 0.10 - 0.01, CORE_REAR_Z - 0.30);
  }
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

/** Release 264: the remote station a modernized kit seats behind the commander's hatch (the fleet's national station
 * construction, profiles/nationalRoofWeapon.ts): a 12.7 mm in a low armoured casemate (critic round 1: a wedge pedestal
 * stood as tall as the turret). */
const LONGWEI_RWS: NationalRoofLoadout = Object.freeze({ name: 'Longwei remote 12.7 mm station', caliber: 12.7,
  mount: 'casemate', feedSide: -1, axisHeight: 0.55, muzzleZ: 1.14, eyes: 'monocle-right', eyeRadius: 0.15, roof: 'spine',
  roofZ: -0.16, lamp: 'slit' });

/** Release 264: a laser-warning receiver on a short plinth: a squat head with a dark sensor band. */
function addWarningReceiver(P: TankBuilderPort, x: number, y: number, z: number): void {
  const { cylY } = KIT;
  P.addEquipment('turretDetail', cylY(0.07, 0.08, 0.05, 14), x, y + 0.025 - 0.004, z);
  P.addEquipment('turretDetail', cylY(0.055, 0.06, 0.08, 14), x, y + 0.09, z);
  P.addModuleVisual('optics', 'turretDark', cylY(0.058, 0.058, 0.025, 14), x, y + 0.095, z);
  P.addEquipment('turretDetail', cylY(0.03, 0.055, 0.03, 14), x, y + 0.145, z);
}

/** Release 264: an infrared dazzler head on the side module's front shoulder, facing forward: an armoured box, its round
 * dark emitter and a rain hood. */
function addDazzler(P: TankBuilderPort, x: number, y: number, z: number): void {
  const { box, cylZ } = KIT;
  P.addEquipment('turretDetail', box(0.22, 0.05, 0.22), x, y + 0.025 - 0.004, z);
  P.addEquipment('turretDetail', box(0.28, 0.22, 0.24), x, y + 0.16, z);
  P.addModuleVisual('optics', 'turretDark', cylZ(0.085, 0.02, 16), x, y + 0.16, z + 0.125);
  P.addEquipment('turretDetail', box(0.30, 0.018, 0.30), x, y + 0.28, z + 0.03);
}

function addTurretRoof(P: TankBuilderPort, kit: LongweiTurretKit): void {
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
    const mastTop = footTop + 0.12;
    P.addEquipment('turretDetail', cylY(0.065, 0.075, mastTop + 0.02 - footTop - 0.05, P.q ? 20 : 12), x, (footTop + 0.05 + mastTop + 0.02) / 2, z);
    const headY = mastTop + 0.14;
    P.addEquipment('turretDetail', box(0.34, 0.28, 0.32), x, headY, z);
    P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.10, 0.020), x, headY + 0.02, z + 0.162);
    P.addModuleVisual('optics', 'turretGlass', box(0.18, 0.08, 0.020), x, headY + 0.02, z - 0.162);
    P.addEquipment('turretDetail', box(0.36, 0.022, 0.38), x, headY + 0.15, z + 0.02);
    P.add('turretDark', box(0.28, 0.012, 0.012), x, headY + 0.08, z + 0.162);
  }
  // QJC-88 12.7 mm on a socket post behind the commander's hatch, with its shield, on the working station's cradle
  if (kit.roofGun !== 'pintle') {
    // release 264: a remote station on the same seat, set back clear of the commander's hatch ring
    nationalRoofWeapon(P, [-0.18, ROOF_Y, -1.34], null, LONGWEI_RWS);
  } else {
    const x = -0.22, z = -1.24, roof = ROOF_Y;
    P.add('turretDetail', cylY(0.075, 0.085, 0.10, P.q ? 20 : 12), x, roof + 0.05 - 0.004, z);
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'qjc88', tone: 'two-tone', scale: 1.0, ammo: true, shield: true, elev: 0.03,
      seed: 23305, working: true, ridingCradle: true,
    });
    mg.position.set(x, roof + 0.096, z);
    P.turretG.add(mg);
  }
  if (kit.protection === 'gl5' || kit.protection === 'gl5-plus') {
    // the GL-5-style hard-kill suite: radar faces at the four corners, launchers on the roof sides
    for (const side of [-1, 1]) {
      addRadarFace(P, side * 1.40, ROOF_Y - 0.03, 0.02, side * 0.75);
      addRadarFace(P, side * 0.92, ROOF_Y, CORE_REAR_Z + 0.24, side * (Math.PI - 0.80));
      addLauncher(P, side * 1.00, ROOF_Y, -1.02, side * 0.32);
      // release 264: the rear launcher pair, facing back and out beside the blow-off panels
      if (kit.protection === 'gl5-plus') addLauncher(P, side * 0.98, ROOF_Y, -1.60, side * (Math.PI - 0.60));
    }
    // the suite's processor case and its cables to the rear radar faces, routed round the blow-off panels
    serviceCase(P, parts, 0.34, -1.30, 0.38, 0.18, 0.26);
    serviceCable(P, parts, [[0.34, -1.43], [0.86, -1.50], [0.86, -2.22], [0.92, -2.28]], false);
    serviceCable(P, parts, [[0.20, -1.43], [-0.86, -1.50], [-0.86, -2.22], [-0.92, -2.28]], false);
  } else {
    // release 264: laser-warning receivers at the rear corners, and at the front corners unless dazzlers stand there
    for (const side of [-1, 1]) {
      addWarningReceiver(P, side * 0.92, ROOF_Y, CORE_REAR_Z + 0.24);
      if (kit.protection === 'eyes') addDazzler(P, side * 1.36, ROOF_Y - 0.03, 0.02);
      else addWarningReceiver(P, side * 1.36, ROOF_Y - 0.03, 0.02);
    }
  }
  // the smoke dischargers on each cheek wedge's outer face (the 99A's stacked cluster beside the star): two three-tube
  // banks, one over the other, fanned forward, up and out
  for (const side of [-1, 1]) for (const [y, k] of [[0.26, 0], [0.44, 1]] as const) {
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.040, len: 0.25, spacing: 0.085,
      splay: side * 0.30, pitch: -0.40, arc: 0.30, seed: 23320 + (side > 0 ? 1 : 0) + k * 2,
    });
    bank.position.set(side * (CHEEK_OUTER_X + 0.06), y, 0.14);
    bank.rotation.set(0, side * 1.05, 0);
    P.turretG.add(bank);
  }
  // antennas and the meteorological mast on the bustle
  for (const side of [-1, 1]) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: side < 0 ? 1.20 : 1.05, r: 0.011, seed: 23330 + side });
    whip.position.set(side * 0.62, ROOF_Y, CORE_REAR_Z + 0.08);
    P.turretG.add(whip);
  }
  P.addEquipment('turretDetail', box(0.10, 0.02, 0.10), -0.20, ROOF_Y + 0.006, CORE_REAR_Z + 0.06);
  P.addEquipment('turretDetail', cylY(0.018, 0.024, 0.36, 10), -0.20, ROOF_Y + 0.18 - 0.004, CORE_REAR_Z + 0.06);
  // the meteorological sensor's head and vane on the mast (critic round 2: a bare cross bar read as a stray post)
  P.addEquipment('turretDetail', cylY(0.04, 0.04, 0.09, 12), -0.20, ROOF_Y + 0.36 + 0.04, CORE_REAR_Z + 0.06);
  P.addEquipment('turretDetail', box(0.012, 0.06, 0.12), -0.20, ROOF_Y + 0.36 + 0.04, CORE_REAR_Z + 0.06 - 0.10);
  // lift eyes on the roof behind the cheek roots and on the bustle's rear edge
  for (const [x, z] of [[-1.08, 0.28], [1.08, 0.28], [-0.62, CORE_REAR_Z + 0.20], [0.62, CORE_REAR_Z + 0.20]]) {
    KIT.liftEye(P, 'turretDetail', x, ROOF_Y, z);
  }
  // turret numbers on the side modules (release 264: on the bins or boxes when cassettes cover the modules)
  const num = P.spec.visual.number || '';
  const numberAt: Vec3 = kit.sideEra ? [1.545, 0.50, -1.38] : [1.570, 0.46, -0.62];
  P.decal('turret', 'number', num, 0.20, numberAt, Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-numberAt[0], numberAt[1], numberAt[2]], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.40);
}

/** The Longwei turret with `kit` (the Longwei's own by default) on the ring at `kit.pivot`. */
export function buildLongweiTurret(P: TankBuilderPort, kit: LongweiTurretKit = LONGWEI_TURRET_KIT): void {
  P.turretG.position.set(...kit.pivot);
  P.gunG.position.set(...TRUNNION);
  addTurretCore(P);
  addCheekWedges(P, kit);
  addSideModules(P, kit);
  addMantlet(P);
  // release 264 (owner 2026-10-28: "add a big floodlight on thhe baihu"): a drum half again the Luna's, right of the gun
  // over the cheek's top, its back ahead of the wedge's top at full depression and its bracket's foot in the mantlet
  if (kit.floodlight) addLongweiFloodlight(P);
  addLongweiGun(P);
  addBustle(P, kit);
  addTurretRoof(P, kit);
  P.turretG.userData.longweiTurretReceipt = Object.freeze({
    architecture: kit.revision,
    pivotLocalM: Object.freeze([...kit.pivot]), trunnionLocalM: Object.freeze([...TRUNNION]),
    muzzleWorldZM: kit.pivot[2] + TRUNNION[2] + GUN_LENGTH,
    roofLocalY: ROOF_Y, cheekTipZ: CHEEK_TIP_Z, cheekSweepDeg: Math.atan(CHEEK_SWEEP) / D2R,
    widthOverModulesM: 1.57 * 2, lengthM: CHEEK_TIP_Z - (CORE_REAR_Z - 0.41),
    throatHalfWidthM: THROAT_X, mantletHalfWidthM: MANTLET_HALF_W,
    kit: Object.freeze({ faceEra: kit.faceEra, sideEra: kit.sideEra, roofGun: kit.roofGun, protection: kit.protection,
      bustle: kit.bustle, bustleCage: kit.bustleCage, floodlight: kit.floodlight, blockCamo: kit.blockCamo }),
    cheekCassettesPerSide: faceLayoutColumns(FACE_LAYOUTS[kit.faceEra]).length * FACE_LAYOUTS[kit.faceEra].rows.length,
    cheekFaceFit: 'face-fitted-r264', floodlight: kit.floodlight,
    radarFaces: kit.protection.startsWith('gl5') ? 4 : 0,
    launchers: kit.protection === 'gl5-plus' ? 4 : kit.protection === 'gl5' ? 2 : 0, smokePerSide: 6,
    commanderSide: 'right', gunnerSide: 'left', dazzlerSide: 'left',
    bustleUndersideM: 0.34, legacyVtDerivativeRetired: true, terracedFrontRetired: true,
  });
}

export function buildLongwei(P: TankBuilderPort): void {
  buildLongweiHullStructure(P);
  dressLongweiHull(P);
  buildLongweiTurret(P);
}
