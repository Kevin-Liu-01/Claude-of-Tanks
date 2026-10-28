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
// The T-84U Oplot (t84bm_oplot_m, Object 478DU9, the 2000 serial tank; owner 2026-10-27: "make the now t84 u oploot look
// a lot more like a prototype for the oplot M and T") is the same hull, running gear, welded turret and KBA-3 at its
// earlier stage: Kontakt-5 on the glacis, the turret front and the forward skirt panels in place of the Duplet; the
// commander's flat cupola with its TKN-5 sight and the cupola NSVT, no PNK-6 and no remote stations; smoke-grenade
// tubes on the turret's front flanks; side stowage boxes and the OPVT snorkel across the bustle; no kit.
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
import { OPLOT_BM_AUTHORING, OPLOT_BM_ERA, OPLOT_BM_SCALE } from '../oplotFlankLayout.ts';
import { resizeAuthoredVehicle } from './vehicleSize.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type OplotBMVariant = 'm' | 't' | 'u';
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

function buildHull(P: TankBuilderPort, variant: OplotBMVariant): void {
  loftHull(P, {
    deck: [[-HULL_HALF_L, 1.36], [Z(-3.44), 1.43], [Z(-3.20), DECK_Y], [GLACIS_TOP_Z, DECK_Y], [Z(3.48), 0.86], [HULL_HALF_L, 0.83]],
    // the stern: a ledge at 1.04-1.12 back from print z -3.30, a step down to 0.77, the raked plate to the belly (the
    // print's lower rear, measured r12; the fidelity board's right view read the old straight rake as surplus)
    belly: [[-HULL_HALF_L, 1.12], [Z(-3.30), 1.04], [Z(-3.25), 0.77], [Z(-3.10), 0.71], [Z(-3.00), 0.50], [Z(-2.90), 0.43],
      [Z(2.86), 0.42], [Z(3.22), 0.58], [HULL_HALF_L, 0.72]],
    wUp: [[-HULL_HALF_L, 1.10], [HULL_HALF_L, 1.10]],
    wLo: [[-HULL_HALF_L, 1.07], [HULL_HALF_L, 1.07]],
    sponsonY: [[-HULL_HALF_L, 1.20], [HULL_HALF_L, 1.20]],
  });
  // Fender ledges: one welded shelf a side from the stern to the bow, its top running down beside the glacis. Over
  // the idler its underside stays 5 cm above the track band's wrap (measured on the build; the strict track-clip
  // audit found the old falling underside 12 cm inside the band).
  for (const s of [-1, 1]) {
    const ledge = (z: number, bottom: number, top: number) => ({ z: Z(z), ring: sided([[1.08, bottom], [1.80, bottom], [1.80, top], [1.08, top]], s) });
    P.add('hull', sectionSolid([
      ledge(-3.20, 1.20, 1.44), ledge(-3.05, 1.20, DECK_Y), ledge(2.30, 1.20, DECK_Y), ledge(2.70, 1.17, 1.41),
      ledge(3.00, 1.11, 1.34), ledge(3.30, 1.13, 1.27), ledge(3.46, 1.10, 1.22),
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

  // Duplet on the glacis: three courses of four modules a side, nearly flush, seated by downward rays. The T-84U carries
  // the earlier Kontakt-5 panel: two courses of three thicker boxes a side.
  if (variant === 'u') {
    // each course under one bolted cover plate across the glacis, so it reads as the Kontakt-5 slab, not as tiles
    const glacisY = (z: number): number => DECK_Y - (z - GLACIS_TOP_Z) * ((DECK_Y - 0.86) / (Z(3.48) - GLACIS_TOP_Z));
    for (const z of [2.66, 3.12]) {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        glacisEraCassette(P, OPLOT_BM_ERA.glacis, side(s, 0.18 + i * 0.335), Z(z), [0.32, 0.12, Z(0.44)]);
      }
      const z0 = Z(z) - Z(0.23), z1 = Z(z) + Z(0.23), lift = 0.12 / Math.cos(Math.atan((DECK_Y - 0.86) / (Z(3.48) - GLACIS_TOP_Z)));
      const at = (x: number, zz: number, dy: number): [number, number, number] => [x, glacisY(zz) + lift + dy, zz];
      // (inside the outer boxes' edge: the KBA-3 crosses the upper course just outboard of it at its -5 degree stop)
      P.addEquipment('hullEquipment', orientedSlab(at(-0.95, z0, 0), at(0.95, z0, 0), at(0.95, z1, 0), at(-0.95, z1, 0),
        at(-0.95, z0, 0.016), at(0.95, z0, 0.016), at(0.95, z1, 0.016), at(-0.95, z1, 0.016)));
      for (const x of [-0.85, -0.34, 0.34, 0.85]) P.addEquipment('hullDark', cylY(0.018, 0.018, 0.012, 8), x, glacisY((z0 + z1) / 2) + lift + 0.02, (z0 + z1) / 2);
    }
  } else {
    for (const z of [2.48, 2.88, 3.26]) for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      glacisEraCassette(P, OPLOT_BM_ERA.glacis, side(s, 0.135 + i * 0.262), Z(z), [0.25, 0.075, Z(0.385)]);
    }
  }
  // Lower front plate: the self-entrenching blade stowed across the nose (the print's: its cutting edge 0.275 above the
  // ground at z 3.23, its top 0.86 at z 3.50, |x| 0.80; equipment, so the combat hull floor stays at the belly), on two
  // arms back to the lower plate; towing eyes.
  P.addEquipment('hullEquipment', orientedSlab(
    [-0.80, 0.275, 3.23], [0.80, 0.275, 3.23], [0.80, 0.275, 3.275], [-0.80, 0.275, 3.275],
    [-0.80, 0.86, 3.50], [0.80, 0.86, 3.50], [0.80, 0.86, 3.545], [-0.80, 0.86, 3.545]));
  for (const x of [-0.52, 0.52]) {
    P.addEquipment('hullDark', box(0.06, 0.06, 0.32), x, 0.52, 3.19);
    P.addEquipment('hullDark', box(0.05, 0.22, 0.05), x, 0.60, 3.06);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.065, 0.02, 12), side(s, 0.80), 0.82, Z(3.54) + 0.005, Math.PI / 2, 0, 0);
    // headlamp cluster in its guard at the nose corner
    const lz = Z(3.42);
    P.addEquipment('hullDetail', box(0.20, 0.12, 0.10), side(s, 0.94), 0.98, lz, -0.45, 0, 0);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.046, 0.012, 18), 'headlight'), side(s, 0.89), 0.995, lz + 0.055, -0.45, 0, 0);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(0.034, 0.012, 16), 'headlight'), side(s, 0.99), 0.995, lz + 0.055, -0.45, 0, 0);
    for (const dx of [-0.11, 0.11]) P.addEquipment('hullDark', box(0.018, 0.17, 0.018), side(s, 0.94) + dx, 1.02, lz + 0.08, -0.45, 0, 0);
  }

  // Stern: the transom grille on the stern face over the ledge, recovery eyes and the unditching log on its brackets.
  const stern = -HULL_HALF_L;
  P.add('hullDark', box(1.70, 0.20, 0.024), 0, 1.24, stern - 0.013);
  for (let i = 0; i < 7; i++) P.add('hullDetail', box(0.20, 0.08, 0.018), -0.78 + i * 0.26, 1.24, stern - 0.026);
  for (const s of [-1, 1]) {
    // recovery eyes welded to the raked lower rear plate, outboard of the stern drums
    P.add('hullDark', KIT.torus(0.075, 0.02, 12), side(s, 1.00), 0.62, Z(-3.075), Math.PI / 2, 0, 0);
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
    // The bow cowl turns down over the idler through the print's measured nose stations (z, top, underside, outer
    // face), smoothed between them on a Catmull-Rom curve, three sections a span (the references' rounded mudguards).
    const nose: [number, number, number, number][] = [
      [3.30, skirtTop(3.30), bottomY, outerX], [3.52, 1.22, 0.91, 2.06], [3.68, 1.11, 0.87, 2.03], [3.78, 0.98, 0.86, 1.98],
    ];
    const at = (i: number): [number, number, number, number] => nose[Math.max(0, Math.min(nose.length - 1, i))];
    const cowl: { z: number; ring: Ring }[] = [];
    for (let i = 0; i < nose.length - 1; i++) {
      for (const t of [1 / 3, 2 / 3, 1]) {
        const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
        const v = p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t
          + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t));
        cowl.push(box5(v[0], v[1], v[2], v[3]));
      }
    }
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
    // Duplet lids on the flared face: the Oplot-M full length, the Oplot-T on its three forward panels; the T-84U's
    // thicker Kontakt-5 boxes on its four forward panels.
    const sector = s > 0 ? OPLOT_BM_ERA.skirtL : OPLOT_BM_ERA.skirtR;
    const face = new THREE.Vector2(innerX + 0.06 - outerX, DECK_Y - (bottomY + 0.05));
    const tilt = Math.atan2(-face.x, face.y);
    for (let i = 0; i < 9; i++) {
      if (variant === 't' && i < 6) continue;
      if (variant === 'u' && i < 5) continue;
      const z0 = -2.92 + i * (6.20 / 9), z1 = z0 + 6.20 / 9 - 0.03, z = Z((z0 + z1) / 2);
      const top = Math.min(DECK_Y, skirtTop(z1)) - 0.03, h = (top - (bottomY + 0.06)) / Math.cos(tilt);
      const yc = (top + bottomY + 0.06) / 2;
      const k5 = variant === 'u', xc = outerX - (yc - (bottomY + 0.05)) * (face.x / -face.y) + (k5 ? 0.03 : 0.016);
      eraCassette(P, 'hull', sector, [side(s, xc), yc, z], [k5 ? 0.055 : 0.026, h, Z(z1 - z0)], [0, 0, side(s, tilt)]);
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

function buildTurretShell(P: TankBuilderPort, variant: OplotBMVariant): void {
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
    if (variant === 'u') {
      buildT84UTurretSide(P, s);
      continue;
    }
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

/** The T-84U's Kontakt-5 front line: one course of boxes whose fronts sweep from z 1.62 inboard to the flank. */
const k5Front = (x: number): number => 1.62 - Math.max(0, x - 0.90) * 0.85;

/** One side of the T-84U turret: Kontakt-5 boxes round the welded front, lower than the Duplet stacks and single-course,
 * their tops falling toward the nose; the 902B smoke-grenade tubes on the front flank; a stowage box forward of the bin. */
function buildT84UTurretSide(P: TankBuilderPort, s: number): void {
  const sector = s > 0 ? OPLOT_BM_ERA.turretL : OPLOT_BM_ERA.turretR;
  const at = (x: number, y: number, z: number): [number, number, number] => [side(s, x), y, z];
  const boxes: readonly [number, number, number][] = [[0.41, 0.70, 0.95], [0.72, 1.00, 0.95], [1.02, 1.27, 0.80],
    [1.29, 1.50, 0.52]];
  for (const [x0, x1, back] of boxes) {
    const f0 = k5Front(x0), f1 = k5Front(x1);
    const top = (z: number): number => 0.47 - Math.max(0, z - back) * (0.13 / 0.70);
    const outward: [number, number, number] = x0 >= 1.0 ? [side(s, 0.6), 0, 0.8] : [0, 0, 1];
    eraBlock(P, sector, orientedSlab(
      at(x0, 0.03, back), at(x1, 0.03, back), at(x1, 0.03, f1), at(x0, 0.03, f0),
      at(x0, top(back), back), at(x1, top(back), back), at(x1, top(f1), f1 - 0.04), at(x0, top(f0), f0 - 0.04)), outward);
    // the box's bolted lid seam across its sloping top
    const mz = (back + (f0 + f1) / 2) / 2;
    P.add('turretDark', box(x1 - x0 - 0.04, 0.012, 0.03), side(s, (x0 + x1) / 2), top(mz) + 0.004, mz, Math.atan(0.13 / 0.70), 0, 0);
  }
  // 902B smoke-grenade tubes: four in a row on a bracket on the front flank, canted forward, up and out
  P.add('turretDark', box(0.10, 0.04, 0.58), side(s, 1.39), 0.47, 0.20);
  for (let i = 0; i < 4; i++) {
    const z = -0.02 + i * 0.145;
    P.add('turretDark', cylZ(0.046, 0.26, 16), side(s, 1.45), 0.56, z + 0.05, -0.55, side(s, 0.35), 0);
    P.add('turretDetail', cylZ(0.033, 0.012, 14), side(s, 1.50), 0.63, z + 0.15, -0.55, side(s, 0.35), 0);
  }
  // side stowage box forward of the right bin (the left one runs longer), its lid and hasps
  const z0 = s > 0 ? -1.20 : -0.95, z1 = -0.36;
  P.addEquipment('turretEquipment', box(0.48, 0.36, z1 - z0), side(s, 1.22), 0.30, (z0 + z1) / 2);
  P.addEquipment('turretEquipment', box(0.50, 0.018, z1 - z0 + 0.02), side(s, 1.22), 0.488, (z0 + z1) / 2);
  for (const z of [z0 + 0.12, z1 - 0.12]) P.addEquipment('turretDark', box(0.016, 0.07, 0.04), side(s, 1.462), 0.42, z);
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

/** The PNK-6 panoramic sight: pedestal, tapered tower and the twin-window head facing forward, ahead of the cupola. */
function buildPnk6(P: TankBuilderPort): void {
  // (the print's head stands at turret z 0.02..0.37, r12's overlay: 0.15 m behind the first build and shallower)
  P.add('turret', box(0.47, 0.14, 0.378), -0.645, ROOF_Y + 0.05, 0.180);
  P.addModuleVisual('optics', 'turretDetail', orientedSlab(
    [-0.86, ROOF_Y + 0.12, 0.012], [-0.43, ROOF_Y + 0.12, 0.012], [-0.43, ROOF_Y + 0.12, 0.365], [-0.86, ROOF_Y + 0.12, 0.365],
    [-0.84, ROOF_Y + 0.66, 0.038], [-0.45, ROOF_Y + 0.66, 0.038], [-0.45, ROOF_Y + 0.66, 0.348], [-0.84, ROOF_Y + 0.66, 0.348]), 0, 0, 0);
  P.add('turretDetail', orientedSlab(
    [-0.85, ROOF_Y + 0.64, 0.029], [-0.44, ROOF_Y + 0.64, 0.029], [-0.44, ROOF_Y + 0.64, 0.374], [-0.85, ROOF_Y + 0.64, 0.374],
    [-0.83, ROOF_Y + 0.75, 0.046], [-0.46, ROOF_Y + 0.75, 0.046], [-0.46, ROOF_Y + 0.75, 0.348], [-0.83, ROOF_Y + 0.75, 0.348]));
  for (const dx of [-0.09, 0.09]) P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.17, 0.012), -0.645 + dx, ROOF_Y + 0.52, 0.366);
  P.add('turretDark', box(0.38, 0.03, 0.06), -0.645, ROOF_Y + 0.63, 0.382);
}

function buildRoof(P: TankBuilderPort, variant: OplotBMVariant): void {
  // Commander's domed cupola (right, the print's 0.6 m dome standing 0.38 m over the roof) with its vision blocks round
  // the base ring; the gunner's hatch (left). The T-84U's is the earlier flat cupola with its TKN-5 sight head forward.
  if (variant === 'u') {
    P.addCupola('turret', cylY(0.33, 0.35, 0.13, 32), -0.62, ROOF_Y + 0.065, -0.42);
    P.addHatch('turret', cylY(0.25, 0.25, 0.04, 28), -0.62, ROOF_Y + 0.15, -0.46);
    P.addModuleVisual('optics', 'turretDetail', box(0.24, 0.20, 0.18), -0.62, ROOF_Y + 0.23, -0.17);
    P.addModuleVisual('optics', 'turretGlass', box(0.16, 0.07, 0.012), -0.62, ROOF_Y + 0.25, -0.076);
    P.add('turretDark', box(0.26, 0.02, 0.22), -0.62, ROOF_Y + 0.34, -0.18);
    for (let i = 0; i < 6; i++) {
      const a = -1.1 + i * 0.44 + Math.PI;
      P.add('turretGlass', box(0.09, 0.05, 0.02), -0.62 + Math.sin(a) * 0.335, ROOF_Y + 0.09, -0.42 + Math.cos(a) * 0.335, 0.30, a, 0);
    }
  } else {
    P.addCupola('turret', cylY(0.30, 0.33, 0.10, 32), -0.62, ROOF_Y + 0.05, -0.42);
    P.addHatch('turret', KIT.xform(new THREE.SphereGeometry(0.30, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.78, 1]),
      -0.62, ROOF_Y + 0.10, -0.42);
    P.add('turretDark', cylY(0.10, 0.12, 0.05, 20), -0.62, ROOF_Y + 0.335, -0.42);
    for (let i = 0; i < 6; i++) {
      const a = -1.1 + i * 0.44;
      P.add('turretGlass', box(0.09, 0.05, 0.02), -0.62 + Math.sin(a) * 0.31, ROOF_Y + 0.075, -0.42 + Math.cos(a) * 0.31, -0.30, a, 0);
    }
  }
  P.addHatch('turret', cylY(0.24, 0.25, 0.05, 28), 0.58, ROOF_Y + 0.025, -0.52);
  KIT.periscope(P, 'turretDetail', 0.58, ROOF_Y + 0.02, -0.20);

  // the PNK-6 ahead of the cupola (the Oplot-M and Oplot-T only)
  if (variant !== 'u') buildPnk6(P);
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
    // (the T-84U's stand on its Kontakt-5 fronts, lower)
    const hx = side(s, 1.05), hy = variant === 'u' ? 0.30 : 0.40, hz = (variant === 'u' ? k5Front(1.05) + 0.12 : eraFront(1.05) + 0.15);
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
  if (variant === 'u') {
    // the 2000 tank's earlier stowage: the OPVT deep-wading snorkel across the bustle's rear face on two brackets, end
    // caps on, and a closed box beside the bustle on the left
    P.addEquipment('turretDetail', cylX(0.11, 1.32, 20), -0.14, 0.44, -2.12);
    for (const x of [-0.80, 0.52]) P.addEquipment('turretDark', cylX(0.116, 0.03, 20), x, 0.44, -2.12);
    for (const x of [-0.50, 0.22]) P.addEquipment('turretDark', box(0.05, 0.16, 0.16), x, 0.44, -2.05);
    P.addEquipment('turretEquipment', box(0.66, 0.36, 0.62), 0.78, 0.33, -1.62);
    P.addEquipment('turretEquipment', box(0.68, 0.018, 0.64), 0.78, 0.518, -1.62);
    return;
  }
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
  if (heavy) {
    // the KT-12.7's armoured sight-and-ammunition box outboard of the gun (the print's: 0.54 x 0.31 x 0.40 m, its centre
    // 0.36 outboard, level with the trunnion and 0.20 ahead of it), its sight window forward, a lid and hinges
    const bx = S.x - 0.36, bz = pivotZ + 0.20;
    w.add('turretDetail', box(0.54, 0.31, 0.40), bx, pivotY - 0.025, bz);
    w.add('turretDark', box(0.56, 0.02, 0.42), bx, pivotY + 0.14, bz);
    w.add('turretGlass', box(0.12, 0.09, 0.012), bx + 0.12, pivotY + 0.03, bz + 0.206);
    w.add('turretDark', box(0.18, 0.13, 0.03), bx + 0.12, pivotY + 0.03, bz + 0.19);
    for (const dz of [-0.12, 0.12]) w.add('turretDark', cylX(0.012, 0.05, 8), bx + 0.27, pivotY + 0.12, bz + dz);
    w.add('turretDark', box(0.10, 0.05, 0.06), S.x - 0.08, pivotY - 0.02, pivotZ + 0.10);
  } else {
    w.add('turretAmmo', box(0.14, 0.22, 0.34), S.x - 0.18, pivotY - 0.02, pivotZ - 0.04);
    w.add('turretDark', box(0.06, 0.05, 0.12), S.x - 0.10, pivotY + 0.05, pivotZ - 0.02);
    w.add('turretDetail', box(0.15, 0.17, 0.24), S.x + 0.19, pivotY + 0.03, pivotZ + 0.04);
    w.add('turretGlass', box(0.065, 0.065, 0.012), S.x + 0.16, pivotY + 0.06, pivotZ + 0.165);
    w.add('turretGlass', box(0.04, 0.04, 0.012), S.x + 0.22, pivotY + 0.01, pivotZ + 0.165);
    w.add('turretDark', box(0.17, 0.02, 0.27), S.x + 0.19, pivotY + 0.125, pivotZ + 0.06);
  }
  return w.finish();
}

/** An enclosed armoured mini-turret: faceted housing with its sight hood and the gun in a mantlet block. */
function enclosedStation(P: TankBuilderPort, S: Station, searchlight = false, ownRing = false): THREE.Group {
  const race = RACE_Y + (S.rise ?? 0), heavy = S.caliber > 10, pivotY = race + 0.21, pivotZ = S.z + 0.30;
  const muzzleZ = pivotZ + (heavy ? 1.12 : 0.80);
  // an owner-kit station carries its ring in its own group (it turns with the mount: the ring is round)
  const ownRingDone = ownRing ? captureAuxiliaryStock(P, S.name, 'yaw') : null;
  ringPedestal(P, S.x, S.z, 0.28, race);
  ownRingDone?.();
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

/** Twin 200 L drums strapped across the stern under its ledge and the unditching log, on arms to the raked plate (the
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
  const armY = y - 0.225, plateZ = Z(-3.10) + (0.71 - armY) / (0.71 - 0.50) * (Z(-3.00) - Z(-3.10));
  for (const x of [-0.92, -0.08, 0.08, 0.92]) {
    P.add('hullDark', box(0.05, 0.05, plateZ - z), x, armY, (z + plateZ) / 2);
    P.add('hullDark', box(0.05, 0.05, 0.05), x, y - 0.18, z);
  }
  P.add('hullDark', cylX(0.025, 1.90, 12), 0, armY, z - 0.06);
  for (const x of [-0.50, 0.50]) {
    P.add('hullDark', beamBetween([x, 1.10, stern - 0.03], [x, y + 0.19, z + 0.06], 0.012, 8));
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
/** The owner's kit pieces of the Oplot-M that the print does not carry (Main's 262 ruling: exempt from the source
 * comparison, tools/owner-kit-targets.mjs): everything `build` adds to the owner's buckets is drawn in its own named
 * group under that rig (the factory's station routing, stage 'yaw' on a fixed group), so the fidelity page can
 * authenticate and set it aside by name. */
const KIT_BUCKETS = Object.freeze({
  hull: ['hull', 'hullDark', 'hullBark', 'hullDetail', 'hullEquipment', 'hullGlass'],
  turret: ['turret', 'turretEquipment', 'turretDetail', 'turretDark', 'turretGlass'],
});
function ownerKitGroup(P: TankBuilderPort, owner: 'hull' | 'turret', name: string, build: () => void): void {
  const group = new THREE.Group();
  group.name = name;
  Object.assign(group.userData, { ownerKit: true, fitting: 'ownerKit' });
  (owner === 'hull' ? P.hullG : P.turretG).add(group);
  const buckets = [...KIT_BUCKETS[owner]], seen = new Set<THREE.BufferGeometry>();
  P.forEachBucketPart(buckets, (part) => seen.add(part));
  build();
  P.forEachBucketPart(buckets, (part) => { if (!seen.has(part)) part.userData.auxiliaryStation = { name, stage: 'yaw' }; });
}

/** Each station's traverse and, where the roof stock rises under its barrel, its depression (mount-local radians;
 * tools/roof-station-arcs.mjs on this build, 2 degrees and 0.01 rad of margin, the full 0.18 rad between bands). */
function stationLimits(root: THREE.Group, yawArc: [number, number], depressionByYaw?: [number, number][]): void {
  root.userData.yawArc = yawArc;
  if (depressionByYaw) root.userData.depressionByYaw = depressionByYaw;
}

function buildOplotMKit(P: TankBuilderPort): void {
  // the KT-12.7 clear -248..4 degrees (blocked toward the PNK-6 tower and the 7.62 station); the KT-7.62 clear -83..229
  // (blocked toward the KT-12.7's box)
  stationLimits(cradleStation(P, M_STATIONS.kt127), [-4.2935, 0.0349],
    [[-4.2935, 0.015], [-4.1539, 0.015], [-4.0666, 0.18], [-0.0524, 0.18], [0.0349, 0.125]]);
  stationLimits(enclosedStation(P, M_STATIONS.kt762, false, true), [-1.4137, 3.9619],
    [[-1.4137, 0.029], [-1.3614, 0.035], [-1.2741, 0.18]]);
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
  ownerKitGroup(P, 'turret', 'oplotMKitLights', () => {
    for (const s of [-1, 1]) lightBar(P, side(s, 0.80), ERA_Y1 + 0.05, eraFront(0.80) - 0.10);
    workLamp(P, -0.20, 0.68, -1.86, true);
  });
  ownerKitGroup(P, 'hull', 'oplotMKitSternDrums', () => sternDrums(P, DRUM_ISSUE_PAINTS[1], 26230));
}

/** The Thai Oplot-T's export kit: two stations of its own pattern, bolted appliqué on the skirt boxes, a bustle cage,
 *  a searchlight and desert drums. */
function buildOplotTKit(P: TankBuilderPort): void {
  // the M2's mini-turret on its tower carries a boresighted searchlight on its mantlet's left; it clears -248..4 degrees
  // (blocked toward the PNK-6 tower and the 7.62), its depression held up at the far end of that arc; the 7.62 clears
  // -70..245 (blocked toward the PNK-6 tower), its depression held up over the bustle cage astern
  stationLimits(enclosedStation(P, T_STATIONS.m2, true), [-4.2935, 0.0349],
    [[-4.2935, 0.094], [-4.1539, 0.113], [-4.0666, 0.127], [-3.9793, 0.18]]);
  stationLens(P, T_STATIONS.m2);
  stationLimits(cradleStation(P, T_STATIONS.m240), [-1.1868, 4.2412], [[-1.1868, 0.018], [-1.1345, 0.18], [3.0543, 0.18],
    [3.1416, 0.136], [3.2289, 0.074], [3.3161, 0.088], [3.4034, 0.139], [3.4907, 0.065], [3.5779, 0.074], [3.6652, 0.116],
    [3.7525, 0.18]]);
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

/** The T-84U's commander's NSVT on its cupola (the standard mount: no remote stations at this stage), turning about the
 * cupola's axis, the gun on the cupola's right. */
function buildT84UCupolaGun(P: TankBuilderPort): THREE.Group {
  // the trunnion stands high enough that the gun and its box pass over the TKN-5 head at every bearing
  const cx = -0.62, cz = -0.42, pivotY = ROOF_Y + 0.60, gx = -0.86, pivotZ = -0.40, muzzleZ = pivotZ + 1.30;
  const w = sourceMachineGun(P, [0, 0, 0], { name: 'oplotUNsvt', caliberMm: 12.7,
    yaw: [cx, ROOF_Y, cz], pivot: [gx, pivotY, pivotZ], muzzle: [gx, pivotY, muzzleZ] });
  // the yoke: a post on the cupola roof, a low cross-bar and two cheeks to the trunnions, all outside the gun's sweep
  // from -0.18 to +0.75 rad (the receiver's rear swings down between the cheeks, over the bar)
  w.stage('yaw');
  w.add('turretDetail', box(0.08, pivotY - 0.22 - ROOF_Y - 0.12, 0.08), gx, (ROOF_Y + 0.13 + pivotY - 0.21) / 2, pivotZ);
  w.add('turretDetail', box(0.225, 0.03, 0.06), gx, pivotY - 0.22, pivotZ);
  for (const sx of [-1, 1]) {
    w.add('turretDetail', box(0.025, 0.26, 0.10), gx + sx * 0.10, pivotY - 0.09, pivotZ);
    w.add('turretDark', cylX(0.02, 0.03, 10), gx + sx * 0.125, pivotY, pivotZ);
  }
  w.stage('pitch');
  // the receiver rides forward on its trunnion (0.23 m behind it, 0.27 ahead), so its rear clears the TKN-5 head at full
  // elevation
  w.add('turretDark', box(0.12, 0.13, 0.50), gx, pivotY, pivotZ + 0.02);
  w.add('turretDark', box(0.11, 0.025, 0.32), gx, pivotY + 0.075, pivotZ);
  const barrelL = muzzleZ - 0.07 - (pivotZ + 0.28);
  w.add('turretDark', cylZ(0.017, barrelL, P.q ? 14 : 10, 0.02), gx, pivotY, pivotZ + 0.28 + barrelL / 2);
  w.add('turretDark', cylZ(0.024, 0.10, P.q ? 14 : 10), gx, pivotY, muzzleZ - 0.05);
  w.add('turretAmmo', box(0.12, 0.20, 0.30), gx - 0.19, pivotY - 0.03, pivotZ + 0.02);
  w.add('turretDark', box(0.06, 0.03, 0.08), gx - 0.11, pivotY + 0.075, pivotZ + 0.02);
  w.add('turretDetail', box(0.07, 0.08, 0.10), gx + 0.15, pivotY + 0.04, pivotZ + 0.10);
  w.add('turretGlass', box(0.05, 0.04, 0.012), gx + 0.15, pivotY + 0.04, pivotZ + 0.156);
  return w.finish();
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
  buildHull(P, variant);
  buildRunningGear(P);
  buildSkirts(P, variant);
  if (variant === 't') buildThaiHullFittings(P);
  buildTurretShell(P, variant);
  buildMantlet(P);
  buildRoof(P, variant);
  buildBustleStowage(P, variant);
  if (variant === 'm') buildOplotMKit(P);
  else if (variant === 't') buildOplotTKit(P);
  // the cupola NSVT clears -175..178 degrees; its depression held up right astern over the bustle
  // (tools/roof-station-arcs.mjs, 2 degrees and 0.01 rad of margin)
  else stationLimits(buildT84UCupolaGun(P), [-3.0194, 3.0718], [[-3.0194, 0.02], [-2.9671, 0.108], [-2.8798, 0.15],
    [-2.7925, 0.18], [2.9671, 0.18], [3.0543, 0.094], [3.0718, 0.04]]);
  buildGun(P);
  // tactical numbers on the smoke housings' outer faces, behind their tubes (the T-84U's on its side stowage boxes)
  const number = variant === 'u' ? [1.465, 0.30, -0.70] : [1.603, 0.37, -0.86];
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [number[0], number[1], number[2]], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.20, [-number[0], number[1], number[2]], -Math.PI / 2);
  P.topY = DECK_Y;
  // the registered comparison scale (print x 4.10): one uniform bake of the 4.0 authoring frame
  resizeAuthoredVehicle(P, OPLOT_BM_SCALE);
}
