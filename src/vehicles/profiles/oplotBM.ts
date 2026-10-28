// T-84BM Oplot-M (bm_oplot_m) and its Thai export twin, the T-84BM Oplot-T (bm_oplot_t): first-party procedural
// builds, release 262 (owner 2026-10-27: "make a new tier x t84bm oplot m and t84bm oplot t").
//
// Measured from a private comparison oracle (42manako's "Ukrainian T-84BM Oplot-M", CC-BY-NC-4.0, sha256
// 761c8698003c6729..., ~/cot-lanes/oplot-ref; nothing of it ships) and the owner's two reference images, registered
// source-only (tools/source-x-oracle.mjs: [-x, y, -z], one uniform scale 4.10, which keeps the published hull, track
// width and roof within 3%). Every main form is lofted through cross-sections measured from the print (owner
// 2026-10-27: "match the geometry a lot better"): the hull body, the thick fender ledges, the flared armoured skirt
// boxes and their rolled noses, the turret body narrowing to its arrowhead, the stepped Duplet stacks and the bustle.
// docs/references/tanks/bm_oplot_m.md keeps the registration, the section table and the published-figure conflicts.
//
// Identity, from the sources: the KMDB all-welded turret with its armoured ammunition bustle; Duplet built-in ERA on
// the turret front and flanks, on the glacis and in the upper side skirts; the hinged rubber lower skirts; the 125 mm
// KBA-3 in a stepped thermal sleeve with its fume extractor; the commander's PNK-6 panoramic sight on its tower ahead
// of the cupola; the gunner's sight box; the remotely laid KT-12.7 over the commander's station; the Varta jammer
// heads at the turret's front corners; the 6TD-2 deck with its left-side exhaust; six rubber-tyred road wheels, five
// return rollers, rear drive. The Oplot-T adds, per the KMDB delivery notes and the Royal Thai Army tanks of
// 2014-2018, the air conditioner on the bustle and the auxiliary power unit on the left rear fender; it carries the
// longer rear stowage basket, boarding steps off the left rear fender and its own skirt layout (Duplet on the three forward panels).
//
// Frames: hull metres with +Z forward and +X the tank's left, authored at 4.0 times the print and baked once to the
// registered 4.10 (resizeAuthoredVehicle, OPLOT_BM_SCALE). The turret frame sits on the ring at
// OPLOT_BM_AUTHORING.turret; the gun frame at OPLOT_BM_AUTHORING.gun inside it.

import * as THREE from 'three';
import { KIT, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { loftHull, tubeGun, ruSaddle, ruBoot } from './russia.ts';
import { eraCassette, glacisEraCassette } from './modernizationFittings.ts';
import { markEraHitFaces } from './eraHitFaces.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { DRUM_ISSUE_PAINTS, fabricRollParts, fuelDrumParts, place } from '../accessoryPrimitives.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { OPLOT_BM_AUTHORING, OPLOT_BM_ERA, OPLOT_BM_SCALE } from '../oplotBMLayout.ts';
import { resizeAuthoredVehicle } from './vehicleSize.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type OplotBMVariant = 'm' | 't';
type Ring = [number, number][];
type Plan = [number, number][];

const { box, cylX, cylY, cylZ } = KIT;
const side = (s: number, x: number): number => s * x;
/** A ring authored for the left (+X) side, mirrored for the right and kept counter-clockwise. */
const sided = (ring: Ring, s: number): Ring => (s > 0 ? ring : ring.map(([x, y]) => [-x, y] as [number, number]).reverse());
/** A closed vertical prism over an [x, z] plan between two heights. */
const planPrism = (plan: Plan, y0: number, y1: number): THREE.BufferGeometry =>
  KIT.xform(KIT.polyTurret(plan, y1 - y0, 1, 1, true), 0, y0, 0);
const sidedPlan = (plan: Plan, s: number): Plan => (s > 0 ? plan : plan.map(([x, z]) => [-x, z] as [number, number]).reverse());

// ---------------------------------------------------------------------------------------------------------------
// Hull. Sections measured from the print (at 4.0, the authoring frame; lengths along the hull read in the print's
// own z through Z): a slab-sided body |x| 1.10 from the 0.42 belly to the 1.46 deck, the upper glacis from print
// station 2.14 to the nose at 0.84, fender ledges 0.26 m thick out to |x| 1.80, and outside them the armoured skirt
// boxes, 1.80 at the deck flaring to 2.08 at 0.95, with hinged rubber below to 0.22.

/** A hull station read off the print's 4.194 lengthwise grid, in the 4.0 authoring frame. */
const Z = (z: number): number => z * (4.0 / 4.194);
const DECK_Y = 1.46;
const HULL_HALF_L = Z(3.54);
const GLACIS_TOP_Z = Z(2.14);

function buildHull(P: TankBuilderPort): void {
  loftHull(P, {
    deck: [[-HULL_HALF_L, 1.36], [Z(-3.44), 1.43], [Z(-3.20), DECK_Y], [GLACIS_TOP_Z, DECK_Y], [Z(3.48), 0.86], [HULL_HALF_L, 0.83]],
    belly: [[-HULL_HALF_L, 1.06], [Z(-3.42), 0.74], [Z(-3.18), 0.48], [Z(-2.95), 0.42], [Z(2.86), 0.42], [Z(3.22), 0.58], [HULL_HALF_L, 0.72]],
    wUp: [[-HULL_HALF_L, 1.10], [HULL_HALF_L, 1.10]],
    wLo: [[-HULL_HALF_L, 1.07], [HULL_HALF_L, 1.07]],
    sponsonY: [[-HULL_HALF_L, 1.20], [HULL_HALF_L, 1.20]],
  });
  // Fender ledges: one welded shelf a side from the stern to the bow, its top running down beside the glacis.
  for (const s of [-1, 1]) {
    const ledge = (z: number, bottom: number, top: number) => ({ z: Z(z), ring: sided([[1.08, bottom], [1.80, bottom], [1.80, top], [1.08, top]], s) });
    P.add('hull', sectionSolid([
      ledge(-3.20, 1.20, 1.44), ledge(-3.05, 1.20, DECK_Y), ledge(2.30, 1.20, DECK_Y), ledge(2.70, 1.17, 1.41),
      ledge(3.00, 1.08, 1.34), ledge(3.30, 0.96, 1.27), ledge(3.46, 0.91, 1.22),
    ]));
  }

  // Engine deck: the 6TD-2's two radiator grilles and the transverse grille at the stern step; the opposed-piston
  // diesel exhausts through a flush louvred outlet on the left fender.
  for (const z of [Z(-2.10), Z(-2.82)]) {
    P.add('hullDark', box(1.80, 0.012, Z(0.60)), 0, DECK_Y + 0.004, z);
    for (let i = 0; i < 9; i++) P.add('hullDetail', box(1.72, 0.016, 0.028), 0, DECK_Y + 0.012, z + Z(-0.26 + i * 0.065));
  }
  P.add('hullDark', box(2.00, 0.012, 0.18), 0, 1.415, Z(-3.36), 0.30, 0, 0);
  P.add('hullDark', box(0.40, 0.012, Z(0.62)), 1.42, DECK_Y + 0.004, Z(-2.46));
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(0.36, 0.014, 0.022), 1.42, DECK_Y + 0.011, Z(-2.72 + i * 0.087));

  // Driver's hatch on the centreline at the glacis break and its three periscopes.
  P.addHatch('hull', cylY(0.235, 0.235, 0.045, 24), 0, DECK_Y + 0.012, Z(1.95));
  P.add('hullDark', cylY(0.20, 0.20, 0.02, 24), 0, DECK_Y + 0.036, Z(1.95));
  for (const x of [-0.17, 0, 0.17]) KIT.periscope(P, 'hullDetail', x, 1.47, Z(2.20));

  // Duplet on the glacis: three courses of four modules a side, nearly flush, seated by downward rays.
  for (const z of [2.48, 2.88, 3.26]) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    glacisEraCassette(P, OPLOT_BM_ERA.glacis, side(s, 0.135 + i * 0.262), Z(z), [0.25, 0.075, Z(0.385)]);
  }
  // Lower front plate: the self-entrenching blade, two hinged rubber flaps hung from the nose, towing eyes.
  P.add('hull', orientedSlab(
    [-1.02, 0.46, Z(3.10)], [1.02, 0.46, Z(3.10)], [1.02, 0.46, Z(3.16)], [-1.02, 0.46, Z(3.16)],
    [-1.02, 0.70, Z(3.42)], [1.02, 0.70, Z(3.42)], [1.02, 0.70, Z(3.48)], [-1.02, 0.70, Z(3.48)]));
  for (const s of [-1, 1]) {
    P.hangMudguard(`oplot-bm-bow-flap-${s}`, 'hullRubber', box(0.96, 0.27, 0.022), side(s, 0.56), 0.70, Z(3.54) + 0.035, 0.12, 0, 0);
    P.add('hullDark', KIT.torus(0.065, 0.02, 12), side(s, 0.80), 0.82, Z(3.54) + 0.005, Math.PI / 2, 0, 0);
    // headlamp cluster in its guard at the nose corner
    const lz = Z(3.42);
    P.addEquipment('hullDetail', box(0.20, 0.12, 0.10), side(s, 0.94), 0.98, lz, -0.45, 0, 0);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.046, 0.012, 18), 'headlight'), side(s, 0.89), 0.995, lz + 0.055, -0.45, 0, 0);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.034, 0.012, 16), 'headlight'), side(s, 0.99), 0.995, lz + 0.055, -0.45, 0, 0);
    for (const dx of [-0.11, 0.11]) P.addEquipment('hullDark', box(0.018, 0.17, 0.018), side(s, 0.94) + dx, 1.02, lz + 0.08, -0.45, 0, 0);
  }

  // Stern: the transom grille, recovery eyes and the unditching log on its brackets.
  const stern = -HULL_HALF_L;
  P.add('hullDark', box(1.70, 0.24, 0.024), 0, 1.00, stern - 0.013);
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(0.20, 0.10, 0.018), -0.78 + i * 0.26, 1.00, stern - 0.026);
  for (const s of [-1, 1]) {
    // recovery eyes welded to the raked lower rear plate, outboard of the stern drums
    P.add('hullDark', KIT.torus(0.075, 0.02, 12), side(s, 1.00), 0.62, Z(-3.31), Math.PI / 2, 0, 0);
    P.add('hull', box(0.10, 0.20, 0.16), side(s, 0.95), 1.29, stern - 0.06);
  }
  P.addEquipment('hullDetail', cylX(0.10, 2.10, 20), 0, 1.36, stern - 0.15);
  for (const s of [-1, 1]) P.addEquipment('hullDark', box(0.05, 0.24, 0.05), side(s, 0.70), 1.36, stern - 0.15);
}

// ---------------------------------------------------------------------------------------------------------------
// Running gear and skirts

const WHEEL_ZS = Object.freeze([2.52, 1.66, 0.73, -0.07, -1.03, -1.89].map(Z));
const ROLLER_ZS = Object.freeze([2.15, 1.24, 0.33, -0.53, -1.45].map(Z));

function buildRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: 0.335, wheelW: 0.23, wheelY: 0.43, xc: 1.41, dishR: 0.84,
    wheelZs: [...WHEEL_ZS],
    sprocket: { z: Z(-2.63), y: 0.77, r: 0.30 }, idler: { z: Z(3.29), y: 0.78, r: 0.26 },
    rollers: ROLLER_ZS.map((z) => ({ z, y: 0.965, r: 0.085 })),
    trackW: 0.58, topY: 1.07, botY: 0.06, paintedEnds: true, coveredTop: true, arms: false,
    contactZF: Z(2.55), contactZR: Z(-1.92),
  });
}

const SKIRT_FACE = Object.freeze({ bottomY: 0.95, outerX: 2.08, innerX: 1.80 });
/** The skirt box's top over its run (print stations): level along the hull, falling with the bow. */
const skirtTop = (z: number): number => (z < 1.80 ? DECK_Y : DECK_Y - (z - 1.80) * (0.19 / 1.50));

function buildSkirts(P: TankBuilderPort, variant: OplotBMVariant): void {
  const { bottomY, outerX, innerX } = SKIRT_FACE;
  const box5 = (z: number, top: number, bottom: number, outer: number): { z: number; ring: Ring } => ({
    z: Z(z), ring: [[innerX - 0.01, bottom], [outer - 0.012, bottom], [outer, bottom + 0.05], [innerX + 0.06, top], [innerX - 0.01, top]],
  });
  for (const s of [-1, 1]) {
    // Armoured skirt box: its outer face flares from the deck edge down to 0.95, its nose rolls down over the idler.
    // The bow cowl turns down over the idler on a quarter round (the references' rounded front mudguards): its top on
    // a 0.46 m arc from the skirt line at z 3.30, its underside 0.10 below it once that clears the box's 0.95 bottom.
    const cowl = [18, 36, 52, 66, 78, 87].map((deg) => {
      const a = deg * Math.PI / 180, top = 0.84 + 0.43 * Math.cos(a);
      return box5(3.30 + 0.46 * Math.sin(a), top, Math.min(bottomY, top - 0.10), outerX - 0.10 * (deg / 87) ** 2);
    });
    const stations = [
      box5(-3.06, 1.42, 1.02, 2.00), box5(-2.96, DECK_Y, bottomY, outerX), box5(1.80, DECK_Y, bottomY, outerX),
      box5(3.30, skirtTop(3.30), bottomY, outerX), ...cowl,
    ];
    P.add('hull', sectionSolid(stations.map(({ z, ring }) => ({ z, ring: sided(ring, s) }))));
    // panel seams on the face
    for (let i = 1; i < 10; i++) {
      const zp = -2.96 + i * (6.26 / 10), z = Z(zp);
      const top = skirtTop(zp);
      P.add('hullDark', orientedSlab(
        [side(s, 2.078), 0.97, z - 0.008], [side(s, 2.088), 0.97, z - 0.008], [side(s, 2.088), 0.97, z + 0.008], [side(s, 2.078), 0.97, z + 0.008],
        [side(s, 1.858), top - 0.01, z - 0.008], [side(s, 1.868), top - 0.01, z - 0.008], [side(s, 1.868), top - 0.01, z + 0.008],
        [side(s, 1.858), top - 0.01, z + 0.008]));
    }
    // Hinged rubber skirt under the box: down to 0.22 along the wheels, raked up toward the sprocket and the idler.
    const rubberZ = [-2.96, -2.34, -1.72, -1.10, -0.48, 0.14, 0.76, 1.38, 2.00, 2.62, 3.24];
    const bottomAt = (z: number): number => (z < -1.55 ? 0.22 + (-1.55 - z) * 0.40 : z > 2.60 ? 0.22 + (z - 2.60) * 0.45 : 0.22);
    for (let i = 0; i < rubberZ.length - 1; i++) {
      const pa = rubberZ[i] + 0.008, pb = rubberZ[i + 1] - 0.008, a = Z(pa), b = Z(pb);
      P.hangMudguard(`oplot-bm-skirt-${s}-${i}`, 'hullEquipment', orientedSlab(
        [side(s, 2.052), bottomAt(pa), a], [side(s, 2.070), bottomAt(pa), a], [side(s, 2.070), bottomAt(pb), b], [side(s, 2.052), bottomAt(pb), b],
        [side(s, 2.052), 0.975, a], [side(s, 2.070), 0.975, a], [side(s, 2.070), 0.975, b], [side(s, 2.052), 0.975, b]), 0, 0, 0);
    }
    // Duplet lids on the flared face: the Oplot-M full length, the Oplot-T on its three forward panels.
    const sector = s > 0 ? OPLOT_BM_ERA.skirtL : OPLOT_BM_ERA.skirtR;
    const face = new THREE.Vector2(innerX + 0.06 - outerX, DECK_Y - (bottomY + 0.05));
    const tilt = Math.atan2(-face.x, face.y);
    for (let i = 0; i < 9; i++) {
      if (variant === 't' && i < 6) continue;
      const z0 = -2.92 + i * (6.20 / 9), z1 = z0 + 6.20 / 9 - 0.03, z = Z((z0 + z1) / 2);
      const top = Math.min(DECK_Y, skirtTop(z1)) - 0.03, h = (top - (bottomY + 0.06)) / Math.cos(tilt);
      const yc = (top + bottomY + 0.06) / 2;
      const xc = outerX - (yc - (bottomY + 0.05)) * (face.x / -face.y) + 0.016;
      eraCassette(P, 'hull', sector, [side(s, xc), yc, z], [0.026, h, Z(z1 - z0)], [0, 0, side(s, tilt)]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Turret (frame: the ring at OPLOT_BM_AUTHORING.turret, 4.0 about the ring; its floor on the deck line). Sections
// measured from the print: a welded body widening from |x| 0.86 over the bustle to 1.47 at z 0.51, its roof 0.69
// falling to 0.58 at the nose (z 0.97), the gun slot |x| 0.41 between two Duplet stacks 0.43 m high whose fronts
// sweep from z 1.82 inboard to 1.21 at the flank (|x| 1.72), flank ERA from the body side to |x| 1.72,
// smoke-launcher housings on the rear flanks, the bustle box offset right.

const ROOF_Y = 0.69;
const ERA_Y0 = 0.09, ERA_Y1 = 0.52;
const eraFront = (x: number): number => 1.82 - Math.max(0, x - 1.0) * (0.61 / 0.72);

/** One ERA block of a gameplay sector: its outward faces are the sector's hit faces. */
function eraBlock(P: TankBuilderPort, sector: string, geometry: THREE.BufferGeometry, outward: readonly [number, number, number]): void {
  P.destructibleCluster(sector, () => P.addExternalArmor('turret', markEraHitFaces(geometry, outward, 0.35)));
}

function buildTurretShell(P: TankBuilderPort): void {
  P.turretG.position.set(...OPLOT_BM_AUTHORING.turret);
  const body = (z: number, w: number, roof: number) => ({
    z, ring: [[-w, 0.0], [w, 0.0], [w, roof - 0.09], [w - 0.09, roof], [-w + 0.09, roof], [-w, roof - 0.09]] as Ring,
  });
  P.add('turret', sectionSolid([
    body(-1.28, 0.86, ROOF_Y), body(-0.69, 1.00, ROOF_Y), body(-0.09, 1.23, ROOF_Y), body(0.51, 1.47, 0.63),
    body(0.81, 1.23, 0.60), body(0.97, 1.08, 0.58),
  ]));
  // Turret ring collar and the basket under the roof line.
  P.add('turret', cylY(1.02, 1.06, 0.06, 40), 0, 0.0, 0);
  P.add('turretDark', cylY(0.92, 0.92, 0.60, 24), 0, -0.32, 0);

  for (const s of [-1, 1]) {
    const front = s > 0 ? OPLOT_BM_ERA.turretL : OPLOT_BM_ERA.turretR;
    const flank = s > 0 ? OPLOT_BM_ERA.flankL : OPLOT_BM_ERA.flankR;
    // Cheek stacks: five columns a side, two courses, their fronts on the arrowhead's sweep.
    const columns: readonly [number, number, number][] = [[0.41, 0.72, 0.93], [0.735, 1.00, 0.93], [1.015, 1.20, 0.80],
      [1.215, 1.40, 0.62], [1.415, 1.58, 0.40]];
    // The stacks' undersides rise toward the nose (the print: 0.09 at z 0.95, 0.24 at the front), so each column is
    // two slabs whose courses split at their own mid-height.
    const under = (z: number): number => ERA_Y0 + Math.max(0, z - 0.95) * 0.17;
    for (const [x0, x1, back] of columns) {
      const f0 = eraFront(x0), f1 = eraFront(x1);
      const outward: [number, number, number] = x0 >= 1.0 ? [side(s, 0.646), 0, 0.763] : [0, 0, 1];
      const at = (x: number, y: number, z: number): [number, number, number] => [side(s, x), y, z];
      const mid = (z: number): number => (under(z) + ERA_Y1) / 2;
      for (const [lo, hi] of [[(z: number) => under(z), (z: number) => mid(z) - 0.008], [(z: number) => mid(z) + 0.008, () => ERA_Y1]] as const) {
        eraBlock(P, front, orientedSlab(
          at(x0, lo(back), back), at(x1, lo(back), back), at(x1, lo(f1), f1), at(x0, lo(f0), f0),
          at(x0, hi(back), back), at(x1, hi(back), back), at(x1, hi(f1), f1), at(x0, hi(f0), f0)), outward);
      }
    }
    // Flank layer: the outer course from the smoke housings to the arrowhead, and the fill against the body side.
    eraBlock(P, flank, planPrism(sidedPlan([[1.595, -0.39], [1.72, -0.39], [1.72, eraFront(1.72)], [1.595, eraFront(1.595)]], s),
      ERA_Y0, 0.56), [side(s, 1), 0, 0]);
    eraBlock(P, flank, planPrism(sidedPlan([[1.09, -0.39], [1.58, -0.39], [1.58, 0.40], [1.42, 0.40], [1.23, -0.09]], s),
      ERA_Y0, 0.56), [side(s, 1), 0, 0]);
    // flank seams: three vertical joints
    for (const z of [0.0, 0.42, 0.84]) P.add('turretDark', box(0.012, 0.44, 0.014), side(s, 1.727), 0.325, z);
    // Smoke-launcher housing on the rear flank, four tube mouths a side canted forward and out.
    P.add('turret', planPrism(sidedPlan([[0.86, -1.04], [1.58, -1.04], [1.64, -0.39], [1.09, -0.39]], s), 0.13, ROOF_Y - 0.01));
    P.add('turretDark', planPrism(sidedPlan([[1.10, -1.00], [1.57, -1.00], [1.62, -0.43], [1.30, -0.43]], s), ROOF_Y - 0.015, ROOF_Y - 0.004));
    for (const [y, z] of [[0.27, -0.62], [0.27, -0.48], [0.44, -0.62], [0.44, -0.48]] as const) {
      const xFace = 1.58 + (z + 1.04) * (0.06 / 0.65);
      P.add('turretDark', cylX(0.048, 0.06, 16), side(s, xFace + 0.02), y, z, 0, side(s, -0.35), 0);
      P.add('turretDetail', cylX(0.034, 0.012, 14), side(s, xFace + 0.051), y, z, 0, side(s, -0.35), 0);
    }
  }
  // Ammunition bustle (offset to the right, as the print), its blow-off roof panels; the right-side stowage bin.
  P.add('turret', sectionSolid([
    { z: -1.98, ring: [[-0.75, 0.30], [0.40, 0.30], [0.40, 0.60], [0.34, 0.66], [-0.69, 0.66], [-0.75, 0.60]] },
    { z: -1.26, ring: [[-0.75, 0.10], [0.40, 0.10], [0.40, 0.62], [0.34, 0.68], [-0.69, 0.68], [-0.75, 0.62]] },
  ]));
  for (const x of [-0.45, 0.10]) P.add('turretDark', box(0.50, 0.008, 0.60), x, 0.666, -1.62);
  P.add('turret', sectionSolid([
    { z: -2.24, ring: [[-1.43, 0.32], [-0.83, 0.32], [-0.83, 0.61], [-0.87, 0.65], [-1.39, 0.65], [-1.43, 0.61]] },
    { z: -0.99, ring: [[-1.43, 0.14], [-0.83, 0.14], [-0.83, 0.61], [-0.87, 0.65], [-1.39, 0.65], [-1.43, 0.61]] },
  ]));
  P.add('turretDark', box(0.012, 0.28, 1.10), -1.436, 0.47, -1.60);
  for (const z of [-2.00, -1.62, -1.24]) P.add('turretDark', box(0.016, 0.06, 0.05), -1.44, 0.58, z);
}

function buildMantlet(P: TankBuilderPort): void {
  // the throat frame between the stacks and the cast gun shield that pitches with the gun
  P.add('turret', box(0.84, 0.06, 0.50), 0, 0.535, 1.18);
  P.add('turret', box(0.84, 0.06, 0.50), 0, 0.06, 1.18);
  P.add('gunMount', sectionSolid([
    { z: -0.33, ring: [[-0.26, -0.21], [0.26, -0.21], [0.30, -0.03], [0.26, 0.17], [-0.26, 0.17], [-0.30, -0.03]] },
    { z: 0.14, ring: [[-0.25, -0.20], [0.25, -0.20], [0.29, -0.03], [0.25, 0.16], [-0.25, 0.16], [-0.29, -0.03]] },
    { z: 0.27, ring: [[-0.17, -0.14], [0.17, -0.14], [0.20, -0.02], [0.17, 0.11], [-0.17, 0.11], [-0.20, -0.02]] },
  ]));
}

function buildRoof(P: TankBuilderPort): void {
  // Commander's domed cupola (right, the print's 0.6 m dome standing 0.38 m over the roof) with its vision blocks round
  // the base ring; the gunner's hatch (left).
  P.addCupola('turret', cylY(0.30, 0.33, 0.10, 32), -0.62, ROOF_Y + 0.05, -0.42);
  P.addHatch('turret', KIT.xform(new THREE.SphereGeometry(0.30, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.78, 1]),
    -0.62, ROOF_Y + 0.10, -0.42);
  P.add('turretDark', cylY(0.10, 0.12, 0.05, 20), -0.62, ROOF_Y + 0.335, -0.42);
  for (let i = 0; i < 6; i++) {
    const a = -1.1 + i * 0.44;
    P.add('turretGlass', box(0.09, 0.05, 0.02), -0.62 + Math.sin(a) * 0.31, ROOF_Y + 0.075, -0.42 + Math.cos(a) * 0.31, -0.30, a, 0);
  }
  P.addHatch('turret', cylY(0.24, 0.25, 0.05, 28), 0.58, ROOF_Y + 0.025, -0.52);
  KIT.periscope(P, 'turretDetail', 0.58, ROOF_Y + 0.02, -0.20);

  // PNK-6 panoramic sight: pedestal, tapered tower and the twin-window head facing forward, ahead of the cupola.
  P.add('turret', box(0.47, 0.14, 0.45), -0.645, ROOF_Y + 0.05, 0.33);
  P.addModuleVisual('optics', 'turretDetail', orientedSlab(
    [-0.86, ROOF_Y + 0.12, 0.13], [-0.43, ROOF_Y + 0.12, 0.13], [-0.43, ROOF_Y + 0.12, 0.55], [-0.86, ROOF_Y + 0.12, 0.55],
    [-0.84, ROOF_Y + 0.66, 0.16], [-0.45, ROOF_Y + 0.66, 0.16], [-0.45, ROOF_Y + 0.66, 0.53], [-0.84, ROOF_Y + 0.66, 0.53]), 0, 0, 0);
  P.add('turretDetail', orientedSlab(
    [-0.85, ROOF_Y + 0.64, 0.15], [-0.44, ROOF_Y + 0.64, 0.15], [-0.44, ROOF_Y + 0.64, 0.56], [-0.85, ROOF_Y + 0.64, 0.56],
    [-0.83, ROOF_Y + 0.75, 0.17], [-0.46, ROOF_Y + 0.75, 0.17], [-0.46, ROOF_Y + 0.75, 0.53], [-0.83, ROOF_Y + 0.75, 0.53]));
  for (const dx of [-0.09, 0.09]) P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.17, 0.012), -0.645 + dx, ROOF_Y + 0.52, 0.548);
  P.add('turretDark', box(0.38, 0.03, 0.06), -0.645, ROOF_Y + 0.63, 0.57);

  // Gunner's sight box on the left front of the roof, window forward, and its IR illuminator.
  P.add('turret', orientedSlab(
    [0.35, ROOF_Y - 0.08, 0.50], [0.65, ROOF_Y - 0.08, 0.50], [0.65, ROOF_Y - 0.08, 0.82], [0.35, ROOF_Y - 0.08, 0.82],
    [0.36, ROOF_Y + 0.13, 0.51], [0.64, ROOF_Y + 0.13, 0.51], [0.64, ROOF_Y + 0.10, 0.80], [0.36, ROOF_Y + 0.10, 0.80]));
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.08, 0.012), 0.50, ROOF_Y + 0.02, 0.826);
  P.add('turretDark', box(0.30, 0.02, 0.07), 0.50, ROOF_Y + 0.105, 0.83);
  P.addEquipment('turretDetail', cylY(0.03, 0.03, 0.12, 12), 0.92, ROOF_Y - 0.02, 0.55);
  P.addEquipment('turretDetail', cylZ(0.09, 0.15, 24), 0.92, ROOF_Y + 0.12, 0.58);
  P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.076, 0.012, 24), 'headlight'), 0.92, ROOF_Y + 0.12, 0.658);

  // Varta: the jammer heads forward of the stacks' outer corners on two bars each; laser-warning heads aft.
  for (const s of [-1, 1]) {
    // (the print's heads stand at |x| 1.05, centre 0.40, a hand's width ahead of the stacks)
    const hx = side(s, 1.05), hy = 0.40, hz = eraFront(1.05) + 0.15;
    for (const y of [hy - 0.08, hy + 0.08]) P.addEquipment('turretDark', box(0.035, 0.035, 0.16), hx, y, hz - 0.17);
    P.addEquipment('turretDetail', box(0.24, 0.24, 0.20), hx, hy, hz);
    P.addEquipment('turretDark', cylZ(0.092, 0.03, 24), hx, hy, hz + 0.11);
    P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.078, 0.01, 24), 'shtora'), hx, hy, hz + 0.127);
    const lx = s > 0 ? 0.20 : -0.55;
    P.addEquipment('turretDetail', cylY(0.05, 0.06, 0.07, 14), lx, 0.69, -1.75);
    P.addEquipment('turretDark', cylY(0.035, 0.035, 0.03, 14), lx, 0.74, -1.75);
  }
  // Lifting eyes on the roof and the two whips on the bustle's rear corners.
  for (const [ex, ez] of [[-1.05, 0.30], [1.05, 0.30], [0.10, -1.10]] as const) {
    P.add('turretFittingPaint', box(0.11, 0.022, 0.07), ex, ROOF_Y + 0.008, ez);
    P.add('turretFittingPaint', new THREE.TorusGeometry(0.042, 0.012, 8, 12, Math.PI), ex, ROOF_Y + 0.016, ez);
  }
  // the whips: the print's tall one on the roof behind the PNK-6 (right), a shorter one on the bustle's left corner
  P.add('turretDark', box(0.07, 0.06, 0.07), -0.40, ROOF_Y + 0.02, -1.17);
  P.add('turretDark', cylY(0.012, 0.008, 1.70, 8), -0.40, ROOF_Y + 0.89, -1.17);
  P.add('turretDark', box(0.07, 0.06, 0.07), 0.34, 0.68, -1.90);
  P.add('turretDark', cylY(0.012, 0.009, 1.20, 8), 0.34, 1.30, -1.90);
}

function buildBustleStowage(P: TankBuilderPort, variant: OplotBMVariant): void {
  // Left rear: the open rail basket beside the bustle, its rails at the bustle's roof height.
  const bx0 = 0.42, bx1 = 1.34, bz0 = -2.28, bz1 = -1.30, by = 0.66;
  for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx1, bz1]] as const) P.addEquipment('turretDetail', box(0.03, 0.30, 0.03), x, by - 0.14, z);
  P.addEquipment('turretDetail', box(bx1 - bx0, 0.03, 0.03), (bx0 + bx1) / 2, by, bz0);
  P.addEquipment('turretDetail', box(0.03, 0.03, bz1 - bz0), bx1, by, (bz0 + bz1) / 2);
  P.addEquipment('turretDetail', box(bx1 - bx0, 0.025, bz1 - bz0), (bx0 + bx1) / 2, 0.37, (bz0 + bz1) / 2);
  for (let i = 1; i < 4; i++) P.addEquipment('turretDetail', box(0.02, 0.02, bz1 - bz0), bx0 + i * (bx1 - bx0) / 4, 0.385, (bz0 + bz1) / 2);
  if (variant === 'm') {
    if (P.q === false) P.add('turretCloth', cylX(0.11, 0.86, 12), 0.88, 0.50, -2.05);
    else {
      const roll = fabricRollParts(0.86, 0.11, [-0.30, 0.30], 18, 26220);
      P.add('turretCloth', roll.body, 0.88, 0.50, -2.05);
      for (const end of roll.ends) P.add('turretDark', end, 0.88, 0.50, -2.05);
    }
    P.addEquipment('turretCloth', box(0.40, 0.18, 0.36), 0.80, 0.475, -1.55);
  } else {
    // Oplot-T: the air conditioner on the bustle's rear face, louvred, with its fan, and the fuller basket
    P.add('turret', box(0.80, 0.38, 0.26), -0.20, 0.38, -2.11);
    for (let i = 0; i < 6; i++) P.add('turretDark', box(0.68, 0.022, 0.012), -0.20, 0.24 + i * 0.05, -2.243);
    P.add('turretDetail', cylZ(0.11, 0.025, 24), -0.20, 0.38, -2.245);
    P.add('turretDark', box(0.84, 0.02, 0.28), -0.20, 0.58, -2.11);
    P.addEquipment('turretCloth', box(0.44, 0.20, 0.40), 0.66, 0.485, -1.62);
    P.addEquipment('turretCloth', box(0.40, 0.18, 0.36), 1.06, 0.475, -2.00);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Specialist kits (owner 2026-10-27: "make thesee tannks a lot more visually distinct and specialized with extra side
// armor, fuel barrles inn back, lights, 2 gun towers instead of 1"). Each tank carries two working remote stations of
// its own pair of designs (sourceMachineGun: each a real auxiliary weapon at its calibre), its own extra side armour,
// twin 200 L drums on the stern and its own lights. Turret stock in the turret frame; hull stock in the hull frame.

/** A roof station: its gun, its ring centre and, for a tower, how far its race stands above the common one. */
interface Station { name: string; caliber: 12.7 | 7.62; x: number; z: number; rise?: number }
const RACE_Y = ROOF_Y + 0.08;

/** A bolted ring pedestal standing a station's race above the roof; a tower (rise) gets an armoured drum with ribs and
 * a cable gland. */
function ringPedestal(P: TankBuilderPort, x: number, z: number, r: number, race = RACE_Y): void {
  P.addEquipment('turretDetail', cylY(r, r + 0.03, race - ROOF_Y + 0.012, P.q ? 32 : 20), x, (race + ROOF_Y - 0.012) / 2, z);
  P.addEquipment('turretDark', cylY(r + 0.012, r + 0.012, 0.02, P.q ? 32 : 20), x, race - 0.01, z);
  if (race - RACE_Y > 0.05) {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + Math.PI / 6;
      P.addEquipment('turretDetail', box(0.04, race - ROOF_Y - 0.04, 0.05), x + Math.cos(a) * (r + 0.025), (race + ROOF_Y) / 2 - 0.01, z + Math.sin(a) * (r + 0.025), 0, -a, 0);
    }
    P.addEquipment('turretDark', box(0.16, 0.12, 0.03), x, ROOF_Y + 0.10, z - r - 0.01);
    P.addEquipment('turretDark', cylZ(0.03, 0.06, 10), x + 0.10, ROOF_Y + 0.06, z - r - 0.03);
  }
  if (P.q) for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    P.addEquipment('turretDark', cylY(0.011, 0.011, 0.012, 8), x + Math.cos(a) * (r - 0.015), race + 0.004, z + Math.sin(a) * (r - 0.015));
  }
}

/** An open cradle: low slewing housing, two cheeks to the trunnion, the gun with its ready box and a sight head. */
function cradleStation(P: TankBuilderPort, S: Station): THREE.Group {
  const heavy = S.caliber > 10, pivotY = RACE_Y + (heavy ? 0.40 : 0.34), pivotZ = S.z + 0.08;
  const muzzleZ = pivotZ + (heavy ? 1.32 : 0.86);
  ringPedestal(P, S.x, S.z, 0.28);
  const w = sourceMachineGun(P, [0, 0, 0], { name: S.name, caliberMm: S.caliber,
    yaw: [S.x, RACE_Y, S.z], pivot: [S.x, pivotY, pivotZ], muzzle: [S.x, pivotY, muzzleZ] });
  w.stage('yaw');
  w.add('turretDetail', cylY(0.25, 0.26, 0.06, P.q ? 32 : 20), S.x, RACE_Y + 0.03, S.z);
  w.add('turretDetail', sectionSolid([
    { z: S.z - 0.30, ring: [[S.x - 0.23, RACE_Y + 0.05], [S.x + 0.23, RACE_Y + 0.05], [S.x + 0.21, RACE_Y + 0.21], [S.x - 0.21, RACE_Y + 0.21]] },
    { z: S.z + 0.16, ring: [[S.x - 0.23, RACE_Y + 0.05], [S.x + 0.23, RACE_Y + 0.05], [S.x + 0.21, RACE_Y + 0.21], [S.x - 0.21, RACE_Y + 0.21]] },
    { z: S.z + 0.30, ring: [[S.x - 0.21, RACE_Y + 0.05], [S.x + 0.21, RACE_Y + 0.05], [S.x + 0.19, RACE_Y + 0.12], [S.x - 0.19, RACE_Y + 0.12]] },
  ]), 0, 0, 0);
  for (const side of [-1, 1]) {
    w.add('turretDetail', sectionSolid([
      { z: S.z - 0.18, ring: [[S.x + side * 0.115 - 0.015, RACE_Y + 0.19], [S.x + side * 0.115 + 0.015, RACE_Y + 0.19], [S.x + side * 0.115 + 0.015, pivotY - 0.02], [S.x + side * 0.115 - 0.015, pivotY - 0.02]] },
      { z: pivotZ + 0.10, ring: [[S.x + side * 0.115 - 0.015, RACE_Y + 0.19], [S.x + side * 0.115 + 0.015, RACE_Y + 0.19], [S.x + side * 0.115 + 0.015, pivotY + 0.05], [S.x + side * 0.115 - 0.015, pivotY + 0.05]] },
    ]), 0, 0, 0);
    w.add('turretDark', cylX(0.036, 0.03, 16), S.x + side * 0.135, pivotY, pivotZ);
  }
  w.stage('pitch');
  const recv = heavy ? [0.15, 0.14, 0.58] : [0.10, 0.11, 0.42];
  w.add('turretDark', box(recv[0], recv[1], recv[2]), S.x, pivotY, pivotZ - 0.02);
  w.add('turretDark', box(recv[0] - 0.01, 0.025, recv[2] * 0.65), S.x, pivotY + recv[1] / 2 + 0.01, pivotZ - 0.04);
  w.add('turretDark', cylZ(heavy ? 0.03 : 0.022, 0.09, 16), S.x, pivotY, pivotZ + recv[2] / 2 + 0.04);
  const barrelL = muzzleZ - (pivotZ + recv[2] / 2 + 0.09) - 0.07;
  w.add('turretDark', cylZ(heavy ? 0.016 : 0.010, barrelL, P.q ? 14 : 10, heavy ? 0.019 : 0.012), S.x, pivotY, pivotZ + recv[2] / 2 + 0.09 + barrelL / 2);
  w.add('turretDark', cylZ(heavy ? 0.022 : 0.016, 0.07, P.q ? 14 : 10), S.x, pivotY, muzzleZ - 0.035);
  w.add('turretDetail', box(0.18, 0.035, recv[2] + 0.12), S.x, pivotY - recv[1] / 2 - 0.02, pivotZ + 0.02);
  w.add('turretAmmo', box(0.14, 0.22, 0.34), S.x - 0.18, pivotY - 0.02, pivotZ - 0.04);
  w.add('turretDark', box(0.06, 0.05, 0.12), S.x - 0.10, pivotY + 0.05, pivotZ - 0.02);
  // the sight head: on the KT-12.7 raised on a post above the receiver (the references' box sight), beside it otherwise
  const sightY = heavy ? pivotY + 0.30 : pivotY + 0.03, sightX = heavy ? S.x + 0.14 : S.x + 0.19;
  if (heavy) {
    w.add('turretDark', box(0.05, sightY - pivotY - 0.12, 0.05), sightX, (pivotY + sightY) / 2 + 0.005, pivotZ - 0.02);
    w.add('turretDark', box(0.10, 0.03, 0.08), sightX - 0.03, pivotY + 0.08, pivotZ - 0.02);
  }
  w.add('turretDetail', box(heavy ? 0.20 : 0.15, heavy ? 0.20 : 0.17, heavy ? 0.28 : 0.24), sightX, sightY, pivotZ + 0.04);
  w.add('turretGlass', box(heavy ? 0.09 : 0.065, heavy ? 0.08 : 0.065, 0.012), sightX - 0.03, sightY + 0.03, pivotZ + (heavy ? 0.185 : 0.165));
  w.add('turretGlass', box(0.04, 0.04, 0.012), sightX + (heavy ? 0.06 : 0.03), sightY - (heavy ? 0.05 : 0.02), pivotZ + (heavy ? 0.185 : 0.165));
  w.add('turretDark', box(heavy ? 0.22 : 0.17, 0.02, heavy ? 0.31 : 0.27), sightX, sightY + (heavy ? 0.11 : 0.095), pivotZ + 0.06);
  return w.finish();
}

/** An enclosed armoured mini-turret: faceted housing with its sight hood and the gun in a mantlet block. */
function enclosedStation(P: TankBuilderPort, S: Station, searchlight = false): THREE.Group {
  const race = RACE_Y + (S.rise ?? 0), heavy = S.caliber > 10, pivotY = race + 0.21, pivotZ = S.z + 0.30;
  const muzzleZ = pivotZ + (heavy ? 1.12 : 0.80);
  ringPedestal(P, S.x, S.z, 0.28, race);
  const w = sourceMachineGun(P, [0, 0, 0], { name: S.name, caliberMm: S.caliber,
    yaw: [S.x, race, S.z], pivot: [S.x, pivotY, pivotZ], muzzle: [S.x, pivotY, muzzleZ] });
  w.stage('yaw');
  w.add('turretDetail', cylY(0.25, 0.26, 0.06, P.q ? 32 : 20), S.x, race + 0.03, S.z);
  const ring = (half: number, top: number, roofHalf: number): [number, number][] =>
    [[S.x - half, race + 0.05], [S.x + half, race + 0.05], [S.x + roofHalf, top], [S.x - roofHalf, top]];
  w.add('turretDetail', sectionSolid([
    { z: S.z - 0.40, ring: ring(0.22, race + 0.25, 0.19) },
    { z: S.z - 0.20, ring: ring(0.27, race + 0.30, 0.22) },
    { z: pivotZ - 0.10, ring: ring(0.27, race + 0.30, 0.22) },
    { z: pivotZ + 0.03, ring: ring(0.25, race + 0.13, 0.23) },
  ]), 0, 0, 0);
  w.add('turretDark', box(0.32, 0.02, 0.22), S.x, race + 0.305, S.z - 0.05);
  w.add('turretDetail', box(0.11, 0.16, 0.22), S.x + 0.32, race + 0.20, pivotZ - 0.15);
  w.add('turretGlass', box(0.06, 0.06, 0.012), S.x + 0.32, race + 0.22, pivotZ - 0.035);
  w.add('turretDark', box(0.13, 0.02, 0.26), S.x + 0.32, race + 0.29, pivotZ - 0.14);
  w.stage('pitch');
  w.add('turretDetail', box(0.19, 0.15, 0.13), S.x, pivotY, pivotZ + 0.05);
  w.add('turretDark', cylZ(heavy ? 0.032 : 0.024, 0.20, P.q ? 16 : 12), S.x, pivotY, pivotZ + 0.21);
  w.add('turretDark', cylZ(heavy ? 0.016 : 0.010, muzzleZ - pivotZ - 0.38, P.q ? 12 : 8, heavy ? 0.019 : 0.012), S.x, pivotY, (pivotZ + 0.31 + muzzleZ - 0.07) / 2);
  w.add('turretDark', cylZ(heavy ? 0.022 : 0.016, 0.07, P.q ? 12 : 8), S.x, pivotY, muzzleZ - 0.035);
  if (searchlight) {
    w.add('turretDetail', box(0.07, 0.06, 0.10), S.x - 0.14, pivotY + 0.02, pivotZ + 0.05);
    w.add('turretDark', cylZ(0.10, 0.20, P.q ? 24 : 16), S.x - 0.25, pivotY + 0.04, pivotZ + 0.06);
    w.add('turretDark', cylZ(0.108, 0.025, P.q ? 24 : 16), S.x - 0.25, pivotY + 0.04, pivotZ + 0.15);
  }
  return w.finish();
}

/** The enclosed station's searchlight glass, captured into its pitch stage so it lays with the gun. */
function stationLens(P: TankBuilderPort, S: Station): void {
  const pivotY = RACE_Y + (S.rise ?? 0) + 0.21, pivotZ = S.z + 0.30;
  const done = captureAuxiliaryStock(P, S.name, 'pitch');
  P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.088, 0.012, P.q ? 24 : 16), 'headlight', { searchlight: true, tint: 'cool' }),
    S.x - 0.25, pivotY + 0.04, pivotZ + 0.166);
  done();
}

/** Twin 200 L drums strapped across the lower rear plate under the transom grille and the unditching log (the
 * T-72/T-80 stowage): well below the deck line, so the gun keeps its depression over the stern. */
function sternDrums(P: TankBuilderPort, paint: readonly [number, number, number], seed: number): void {
  const stern = -HULL_HALF_L, z = stern - 0.24, y = 0.86;
  for (const s of [-1, 1]) {
    const drum = fuelDrumParts({ r: 0.20, len: 0.86, straps: [0.15, 0.85], buckleAt: 2.62, bungHead: s > 0 ? 1 : -1,
      detail: P.q === false ? 0 : 1, bold: true, paint, seed: seed + (s > 0 ? 1 : 0) });
    const alongX = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => place(geometry, -0.43, 0, 0, 0, 0, -Math.PI / 2);
    P.add('hullBark', alongX(drum.body), side(s, 0.50), y, z);
    for (const part of [...drum.straps, ...drum.hardware]) P.add('hullDark', alongX(part), side(s, 0.50), y, z);
  }
  // cradle: four arms from the raked plate under the drums, saddles under each, a cross tube, and hold-down straps from
  // the transom's lower edge over each drum
  const armY = y - 0.225, plateZ = Z(-3.42) + (0.74 - armY) / (0.74 - 0.48) * (Z(-3.18) - Z(-3.42));
  for (const x of [-0.92, -0.08, 0.08, 0.92]) {
    P.add('hullDark', box(0.05, 0.05, plateZ - z), x, armY, (z + plateZ) / 2);
    P.add('hullDark', box(0.05, 0.05, 0.05), x, y - 0.18, z);
  }
  P.add('hullDark', cylX(0.025, 1.90, 12), 0, armY, z - 0.06);
  for (const x of [-0.50, 0.50]) {
    P.add('hullDark', beamBetween([x, 0.885, stern - 0.03], [x, y + 0.19, z + 0.06], 0.012, 8));
  }
}

/** A guarded lamp facing forward (or aft), turret frame. */
function workLamp(P: TankBuilderPort, x: number, y: number, z: number, back = false): void {
  const d = back ? -1 : 1, ry = back ? Math.PI : 0;
  P.addEquipment('turretDark', box(0.07, 0.05, 0.07), x, y + 0.025, z);
  P.addEquipment('turretDetail', cylZ(0.058, 0.10, P.q ? 20 : 14), x, y + 0.10, z + d * 0.02, 0, ry, 0);
  P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.046, 0.012, P.q ? 20 : 14), 'headlight'), x, y + 0.10, z + d * 0.072, 0, ry, 0);
  for (const sx of [-1, 1]) P.addEquipment('turretDark', beamBetween([x + sx * 0.065, y + 0.04, z - d * 0.03], [x + sx * 0.065, y + 0.16, z + d * 0.08], 0.006, 8));
}

/** A three-segment LED light bar in its visored box, turret frame. */
function lightBar(P: TankBuilderPort, x: number, y: number, z: number): void {
  P.addEquipment('turretDetail', box(0.36, 0.09, 0.08), x, y, z);
  P.addEquipment('turretDark', box(0.38, 0.015, 0.11), x, y + 0.052, z + 0.012);
  for (const dx of [-0.11, 0, 0.11]) {
    P.addEquipment('turretGlass', markVehicleNightLens(box(0.09, 0.05, 0.01), 'headlight', { tint: 'cool' }), x + dx, y, z + 0.042);
  }
}

const M_STATIONS = Object.freeze({
  kt127: { name: 'oplotMKt127', caliber: 12.7, x: -0.98, z: -0.98 },
  kt762: { name: 'oplotMKt762', caliber: 7.62, x: 0.82, z: -1.06 },
} as const);
const T_STATIONS = Object.freeze({
  m2: { name: 'oplotTM2', caliber: 12.7, x: -0.98, z: -0.98, rise: 0.24 },
  m240: { name: 'oplotTM240', caliber: 7.62, x: 0.82, z: -1.06 },
} as const);

/** The Ukrainian Oplot-M's wartime kit: two stations, a lower Duplet course on the skirts, LED bars, olive drums. */
/** Each station's traverse and, where the roof stock rises under its barrel, its depression (mount-local radians;
 * tools/roof-station-arcs.mjs on this build, 2 degrees and 0.01 rad of margin, the full 0.18 rad between bands). */
function stationLimits(root: THREE.Group, yawArc: [number, number], depressionByYaw?: [number, number][]): void {
  root.userData.yawArc = yawArc;
  if (depressionByYaw) root.userData.depressionByYaw = depressionByYaw;
}

function buildOplotMKit(P: TankBuilderPort): void {
  // the KT-12.7 clear -248..4 degrees (blocked toward the PNK-6 tower and the 7.62 station); the KT-7.62 clear -84..273
  stationLimits(cradleStation(P, M_STATIONS.kt127), [-4.2935, 0.0349], [[-0.0524, 0.18], [0.0349, 0.125]]);
  stationLimits(enclosedStation(P, M_STATIONS.kt762), [-1.4312, 4.7298],
    [[-1.4312, 0.023], [-1.2915, 0.051], [-1.2043, 0.18], [4.6426, 0.18], [4.7298, 0.04]]);
  // a lower Duplet course bolted along each rubber skirt (the owner's extra side armour), seven blocks a side
  for (const s of [-1, 1]) {
    const sector = s > 0 ? OPLOT_BM_ERA.skirtL : OPLOT_BM_ERA.skirtR;
    for (let i = 0; i < 7; i++) {
      const z = Z(-1.70 + i * 0.66);
      eraCassette(P, 'hull', sector, [side(s, 2.1025), 0.64, z], [0.065, 0.38, Z(0.54)]);
      for (const y of [0.47, 0.81]) P.add('hullDark', box(0.03, 0.03, Z(0.56)), side(s, 2.075), y, z);
    }
  }
  // lights: LED bars on the stacks' tops at the front corners, a work lamp astern on the bustle
  for (const s of [-1, 1]) lightBar(P, side(s, 0.80), ERA_Y1 + 0.05, eraFront(0.80) - 0.10);
  workLamp(P, -0.20, 0.68, -1.86, true);
  sternDrums(P, DRUM_ISSUE_PAINTS[1], 26230);
}

/** The Thai Oplot-T's export kit: two stations of its own pattern, bolted appliqué on the skirt boxes, a bustle cage,
 *  a searchlight and desert drums. */
function buildOplotTKit(P: TankBuilderPort): void {
  // the M2's mini-turret carries a boresighted searchlight on its mantlet's left
  // the M2 clear -149..3 degrees (the 7.62 station, the PNK-6 tower and the cage astern); the 7.62 clear -80..246
  stationLimits(enclosedStation(P, T_STATIONS.m2, true), [-2.5656, 0.0175],
    [[-2.5656, 0.04], [-2.5133, 0.18], [-0.0698, 0.18], [0.0175, 0.155]]);
  stationLens(P, T_STATIONS.m2);
  stationLimits(cradleStation(P, T_STATIONS.m240), [-1.3614, 4.2586], [[-1.3614, 0], [-1.3090, 0.18], [4.1888, 0.18], [4.2586, 0.026]]);
  // bolted steel appliqué where the Thai tank carries no Duplet: two courses of 9 cm blocks on each of the six rear skirt
  // panels, flush on the flared face, four bolt heads on each block's outer face
  const face = new THREE.Vector2(SKIRT_FACE.innerX + 0.06 - SKIRT_FACE.outerX, DECK_Y - (SKIRT_FACE.bottomY + 0.05));
  const tilt = Math.atan2(-face.x, face.y), out = 0.05;
  const faceX = (y: number): number => SKIRT_FACE.outerX - (y - (SKIRT_FACE.bottomY + 0.05)) * (face.x / -face.y);
  const span = (DECK_Y - SKIRT_FACE.bottomY - 0.10) / Math.cos(tilt), h = span / 2 - 0.02;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z0 = -2.92 + i * (6.20 / 9), z1 = z0 + 6.20 / 9 - 0.05, z = Z((z0 + z1) / 2);
      for (const course of [-1, 1]) {
        const along = course * (span / 4), yc = (DECK_Y + SKIRT_FACE.bottomY) / 2 + 0.02 + along * Math.cos(tilt);
        const xc = faceX(yc) + out * Math.cos(tilt);
        P.addExternalArmor('hull', box(0.09, h, Z(z1 - z0)), side(s, xc), yc + out * Math.sin(tilt), z, 0, 0, side(s, tilt));
        for (const dy of [-h * 0.32, h * 0.32]) for (const dz of [-0.24, 0.24]) {
          P.add('hullDark', cylX(0.02, 0.03, 8), side(s, xc + 0.05 * Math.cos(tilt) - dy * Math.sin(tilt)),
            yc + out * Math.sin(tilt) + 0.05 * Math.sin(tilt) + dy * Math.cos(tilt), z + Z(dz), 0, 0, side(s, tilt));
        }
      }
    }
  }
  // stand-off slat cage round the turret's rear half: 0.36-0.42 m off the bins, the bustle and the basket, heavy corner
  // posts, three rails, slats at 11 cm, struts back to the turret
  const cageY0 = 0.20, cageY1 = 0.64, cx0 = -1.80, cx1 = 1.70, cz0 = -2.66, czR = -0.90, czL = -1.12;
  const runs: [[number, number], [number, number]][] = [[[cx0, czR], [cx0, cz0]], [[cx0, cz0], [cx1, cz0]], [[cx1, cz0], [cx1, czL]]];
  for (const [x, z] of [[cx0, czR], [cx0, cz0], [cx1, cz0], [cx1, czL], [cx0, -1.78], [-0.05, cz0], [cx1, -1.89]] as const) {
    P.addEquipment('turretDetail', box(0.06, cageY1 - cageY0 + 0.04, 0.06), x, (cageY0 + cageY1) / 2, z);
  }
  for (const [[xa, za], [xb, zb]] of runs) {
    for (const y of [cageY0 + 0.02, (cageY0 + cageY1) / 2, cageY1]) P.addEquipment('turretDetail', beamBetween([xa, y, za], [xb, y, zb], 0.02, 8));
    // horizontal slats at 9 cm between the rails, 3 cm outboard of the posts (each run turns clockwise seen from
    // above, so its right-hand normal points out)
    const len = Math.hypot(xb - xa, zb - za), ox = (zb - za) / len * 0.03, oz = -(xb - xa) / len * 0.03;
    for (let y = cageY0 + 0.07; y < cageY1 - 0.03; y += 0.09) {
      if (Math.abs(y - (cageY0 + cageY1) / 2) < 0.03) continue;
      P.addEquipment('turretOpenLatticeDark', beamBetween([xa + ox, y, za + oz], [xb + ox, y, zb + oz], 0.011, 6));
    }
  }
  for (const y of [0.40, 0.58]) {
    for (const z of [-1.10, -1.95]) P.addEquipment('turretDark', beamBetween([-1.43, y, z], [cx0, y, z], 0.018, 8));
    for (const x of [-1.15, -0.30, 0.30]) P.addEquipment('turretDark', beamBetween([x, y, x < -0.8 ? -2.24 : -1.98], [x, y, cz0], 0.018, 8));
    for (const z of [-1.45, -2.20]) P.addEquipment('turretDark', beamBetween([1.34, y, z], [cx1, y, z], 0.018, 8));
  }
  // lights: a tropical searchlight on the left cheek's top, work lamps fore and aft
  {
    const x = 0.62, y = ERA_Y1 + 0.17, z = 1.38;
    P.addEquipment('turretDark', box(0.12, 0.05, 0.12), x, ERA_Y1 + 0.025, z);
    P.addEquipment('turretDetail', cylY(0.03, 0.035, 0.10, 12), x, ERA_Y1 + 0.08, z);
    P.addEquipment('turretDetail', cylZ(0.15, 0.22, P.q ? 28 : 18), x, y, z + 0.02);
    P.addEquipment('turretDark', cylZ(0.162, 0.03, P.q ? 28 : 18), x, y, z + 0.14);
    P.addEquipment('turretGlass', markVehicleNightLens(cylZ(0.13, 0.012, P.q ? 28 : 18), 'headlight', { tint: 'warm' }), x, y, z + 0.157);
  }
  workLamp(P, -1.15, ERA_Y1 + 0.01, 0.30);
  workLamp(P, 0.10, 0.68, -1.86, true);
  sternDrums(P, DRUM_ISSUE_PAINTS[3], 26240);
}

// ---------------------------------------------------------------------------------------------------------------
// Gun

function buildGun(P: TankBuilderPort): void {
  P.gunG.position.set(...OPLOT_BM_AUTHORING.gun);
  // root cone narrowed to 0.15 (it flared to 0.20 at its front and met the driver's hatch rim at the -5 degree stop)
  ruSaddle(P, { rollR: 0.18, rollW: 0.36, tubeR: 0.10, rootR: 0.15, rootL: 0.50 });
  ruBoot(P, { pts: [[0.27, 0.27, 0.24, -0.01], [0.38, 0.25, 0.23, 0.0], [0.50, 0.24, 0.24, 0.0]] });
  // KBA-3: the thermal sleeve in sections with clamp bands, the fume extractor at mid-length (print z 4.0-4.85 at
  // the hull), the muzzle reference collar.
  tubeGun(P, [
    [0.50, 1.30, 0.112],
    [1.30, 2.51, 0.110],
    [2.51, 3.36, 0.136, 0.132],
    [3.36, 4.20, 0.104],
    [4.20, 4.78, 0.099],
    [4.78, OPLOT_BM_AUTHORING.barrelM, 0.090],
  ], {
    rings: [[0.90, 0.116], [1.30, 0.116], [1.90, 0.114], [2.51, 0.140], [3.36, 0.137], [3.78, 0.108], [4.20, 0.108], [4.78, 0.103]],
    muzzle: OPLOT_BM_AUTHORING.barrelM,
  });
  P.add('gunDark', cylZ(0.095, 0.05, 24), 0, 0, OPLOT_BM_AUTHORING.barrelM - 0.03);
  muzzleBore(P, { r: OPLOT_BM_AUTHORING.boreR });
  // coaxial KT-7.62 port right of the gun in the shield
  P.add('gunMount', cylZ(0.035, 0.08, 14), -0.20, -0.08, 0.27);
  P.add('gunDark', cylZ(0.016, 0.04, 10), -0.20, -0.08, 0.32);
}

/** Thai export fittings on the hull: the APU's low armoured box on the left rear fender (exhaust out of its outboard face,
 * so the gun still clears it), the boarding steps hung off that fender's stern end beside the drums. */
function buildThaiHullFittings(P: TankBuilderPort): void {
  const apuZ = Z(-2.50);
  P.add('hull', box(0.50, 0.15, Z(0.74)), 1.72, DECK_Y + 0.075, apuZ);
  for (let i = 0; i < 5; i++) P.add('hullDark', box(0.012, 0.09, 0.08), 1.973, DECK_Y + 0.075, apuZ + Z(-0.26 + i * 0.13));
  for (const dz of [-0.30, 0.30]) P.add('hullDark', box(0.46, 0.012, 0.03), 1.72, DECK_Y + 0.154, apuZ + Z(dz));
  P.add('hullDark', cylX(0.032, 0.07, 12), 2.005, DECK_Y + 0.06, apuZ + Z(0.26));
  const end = Z(-3.20) - 0.016;
  for (const x of [1.22, 1.46]) P.addEquipment('hullDetail', box(0.035, 0.36, 0.035), x, 1.03, end);
  for (const y of [0.87, 1.04]) P.addEquipment('hullDetail', box(0.275, 0.03, 0.06), 1.34, y, end - 0.01);
}

export function buildOplotBM(P: TankBuilderPort, variant: OplotBMVariant): void {
  buildHull(P);
  buildRunningGear(P);
  buildSkirts(P, variant);
  if (variant === 't') buildThaiHullFittings(P);
  buildTurretShell(P);
  buildMantlet(P);
  buildRoof(P);
  buildBustleStowage(P, variant);
  if (variant === 'm') buildOplotMKit(P); else buildOplotTKit(P);
  buildGun(P);
  // tactical numbers on the smoke housings' outer faces, behind their tubes
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [1.603, 0.37, -0.86], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [-1.603, 0.37, -0.86], -Math.PI / 2);
  P.topY = DECK_Y;
  // the registered comparison scale (print x 4.10): one uniform bake of the 4.0 authoring frame
  resizeAuthoredVehicle(P, OPLOT_BM_SCALE);
}
