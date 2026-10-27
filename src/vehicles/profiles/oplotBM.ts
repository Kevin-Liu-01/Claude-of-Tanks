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
// longer rear stowage basket, a stern boarding ladder and its own skirt layout (Duplet on the three forward panels).
//
// Frames: hull metres with +Z forward and +X the tank's left, authored at 4.0 times the print and baked once to the
// registered 4.10 (resizeAuthoredVehicle, OPLOT_BM_SCALE). The turret frame sits on the ring at
// OPLOT_BM_AUTHORING.turret; the gun frame at OPLOT_BM_AUTHORING.gun inside it.

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { loftHull, tubeGun, ruSaddle, ruBoot } from './russia.ts';
import { eraCassette, glacisEraCassette } from './modernizationFittings.ts';
import { markEraHitFaces } from './eraHitFaces.ts';
import { addFieldRoofWeapon } from './fieldRoofWeapon.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { fabricRollParts } from '../accessoryPrimitives.ts';
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
    P.add('hullDark', KIT.torus(0.075, 0.02, 12), side(s, 0.84), 0.66, stern - 0.01, Math.PI / 2, 0, 0);
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
    const stations = [
      box5(-3.06, 1.42, 1.02, 2.00), box5(-2.96, DECK_Y, bottomY, outerX), box5(1.80, DECK_Y, bottomY, outerX),
      box5(3.30, skirtTop(3.30), bottomY, outerX), box5(3.52, 1.22, 0.91, 2.06), box5(3.68, 1.11, 0.87, 2.03),
      box5(3.78, 0.98, 0.86, 1.98),
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
      P.hangMudguard(`oplot-bm-skirt-${s}-${i}`, 'hullRubber', orientedSlab(
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
// Turret (frame: the ring at OPLOT_BM_AUTHORING.turret, 4.0 about the ring). Sections measured from the print: a welded body widening from
// |x| 0.86 over the bustle to 1.47 at z 0.51, its roof 0.69 falling to 0.58 at the nose (z 0.97), the gun slot |x|
// 0.41 between two Duplet stacks 0.43 m high whose fronts sweep from z 1.82 inboard to 1.21 at the flank (|x| 1.72),
// flank ERA from the body side to |x| 1.72, smoke-launcher housings on the rear flanks, the bustle box offset right.

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
    z, ring: [[-w, -0.01], [w, -0.01], [w, roof - 0.09], [w - 0.09, roof], [-w + 0.09, roof], [-w, roof - 0.09]] as Ring,
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
    P.addEquipment('turretDetail', cylY(0.05, 0.06, 0.07, 14), side(s, 0.74), ROOF_Y + 0.03, -1.12);
    P.addEquipment('turretDark', cylY(0.035, 0.035, 0.03, 14), side(s, 0.74), ROOF_Y + 0.08, -1.12);
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

function buildRemoteWeapon(P: TankBuilderPort): void {
  // KT-12.7 laid from the PNK-6 (the commander's sight controls the remote AA gun, KMDB): on the roof's right rear edge
  // behind the cupola, its base ring overhanging onto the smoke housing's roof-flush top.
  addFieldRoofWeapon(P, [-0.97, ROOF_Y, -0.86], 12.7, 'KT-12.7 remote anti-aircraft gun', 0.0, 0.92);
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

/** Thai export fittings on the hull: the APU on the left rear fender, the boarding ladder on the stern. */
function buildThaiHullFittings(P: TankBuilderPort): void {
  P.add('hull', box(0.50, 0.32, Z(0.74)), 1.46, DECK_Y + 0.16, Z(-2.10));
  for (let i = 0; i < 5; i++) P.add('hullDark', box(0.012, 0.18, 0.08), 1.713, DECK_Y + 0.17, Z(-2.36 + i * 0.13));
  P.add('hullDark', cylY(0.035, 0.035, 0.16, 12), 1.58, DECK_Y + 0.40, Z(-2.36));
  P.add('hullDark', box(0.52, 0.02, Z(0.76)), 1.46, DECK_Y + 0.33, Z(-2.10));
  const stern = -HULL_HALF_L;
  for (const x of [-1.08, -0.84]) P.addEquipment('hullDetail', box(0.03, 0.62, 0.03), x, 1.02, stern - 0.045);
  for (let i = 0; i < 4; i++) P.addEquipment('hullDetail', box(0.27, 0.025, 0.03), -0.96, 0.78 + i * 0.15, stern - 0.05);
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
  buildRemoteWeapon(P);
  buildGun(P);
  // tactical numbers on the smoke housings' outer faces, behind their tubes
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [1.603, 0.37, -0.86], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [-1.603, 0.37, -0.86], -Math.PI / 2);
  P.topY = DECK_Y;
  // the registered comparison scale (print x 4.10): one uniform bake of the 4.0 authoring frame
  resizeAuthoredVehicle(P, OPLOT_BM_SCALE);
}
