// 262 (owner, 2026-10-27, handing over an STB-1 model: "both the type 74 and stb should be based from this"): the Type 74
// family's one hull, running gear and cast turret, measured on that model, and each tank's own kit on them. The model is
// an authoring oracle only (public/models/community-candidates/stb_1_owner_20261027.glb, gitignored; docs/ATTRIBUTION.md):
// no vertex, index or texture of it is used, only the stations measured by rays and recorded in
// docs/references/tanks/stb1.md "Owner model". Its frame maps to ours by x and y 0.972 (the tracks' 3.27 to the
// published 3.18; Main's 262 ruling keeps the model's own proportions, so its 2.36 m crown stands at 2.31 m, where the
// sources' 2.25 m with the cupola would squash it by 0.86) and z 0.989 (its hull to the published 6.70), read in the one
// node frame its hull, tracks and turret share.
//   - Shared (the model): a tub between the tracks under sponsons whose sides slope 46 degrees from the tracks' outer
//     edge to the deck edge, the deck at 1.58 over the whole length, a long 22 degree upper glacis from a crest at z 1.87
//     to the nose at 3.37 over a steep lower plate, five 0.84 m road wheels on a 1.01 m pitch with a raised idler and
//     sprocket and the hull's stern overhanging the sprocket, and a tall cast turret (0.71 m) whose sides roll in from a
//     full belt at 0.1-0.3 m to a broad flat crown, its bustle undercut over the deck, the bore 0.29 m over the ring.
//   - Type 74 (production): the canvas-covered external mask with the cradle searchlight (japaneseMantlets.ts), a sloped
//     rear plate with its door, rail, shackles and tow eyes, muffler covers on both rear slopes, recessed four-lamp boxes
//     and ribbed mudguards at the front corners, the flush driver's hatch, engine-deck grilles and louvres, stowage
//     lockers on the side slopes, the commander's cupola with its M2, smoke dischargers at the turret's front corners
//     and a bustle basket. Track: double-pin (trackPatterns.ts).
//   - STB-1 (prototype, the model's own kit): the oval mask with its rim, two ports and six-lens searchlight box, a
//     vertical rear plate over a raked lower plate, mesh-topped boxes on the rear sponsons and mesh-guarded silencers
//     behind them, caged twin headlights and plain mudguards at the front corners, the raised octagonal driver's hatch,
//     the commander's oval raised station with its sight head and remote gun, four-pane boxes lying on the turret's
//     shoulders, three-tube smoke columns on its rear sides and two mesh vents on its rear roof, each where the model has
//     it (263), and (265, the owner's, not the model's) two 200 L fuel drums on a shelf across the stern. Track: chevron
//     single-pin.
// Program frame (BUILD-STANDARD §A): +x is the vehicle's right, +z its front, metres; the turret frame's origin is the
// ring datum at (0, 1.60, 0.50). The STB-1's handed kit stands on the side the owner's model shows it (Main's 262 ruling,
// a per-tank placement, not a fleet flip): the model is in glTF chirality, so the commander's station, the gunner's
// sight and the glacis lamp sit at -x and the driver's and loader's hatches and the searchlight box at +x. The
// production Type 74's kit, from its photographs, keeps the program frame.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT, FITTINGS, MUDGUARDS, muzzleBore } from './kit.ts';
import { refineCastLoft, type PolyMultiLoftRing } from '../factoryGeometry.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { addSTB1Mantlet, addType74Mantlet } from './japaneseMantlets.ts';
import { cagedLampBox, guardedSilencer, mufflerCover, ribbedMudguard, tailLamp, towShackle, uTowEye } from './japaneseHullKit.ts';
import { addSternShelfFuelDrums } from './rearSlopeFuelDrums.ts';
import { ownerKitGroup } from './ownerKitGroup.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type Type74Variant = 'production' | 'prototype';

// ---------------------------------------------------------------------------------------------------------------------
// The hull's measured stations
// ---------------------------------------------------------------------------------------------------------------------
const DECK = 1.58, BELLY = 0.43, TUB = 0.98;
/** the sponson's floor over the track's top run, its outer edge (inside the ±1.59 sprocket-ring width anchor) */
const FLOOR = 1.23, LIP = 0.035, SPONSON_X = 1.575, DECK_EDGE = 1.27, SPONSON_FRONT = 2.40;
const CREST_Z = 1.87, NOSE_TOP_Y = 0.99, NOSE_TOP_Z = 3.35;
/** the lower nose plate, from the belly at z 2.55 up to the nose's foot */
const LOWER_Z = 2.55, NOSE_FOOT_Y = 0.90, NOSE_FOOT_Z = 3.33;
const GLACIS = (DECK - NOSE_TOP_Y) / (NOSE_TOP_Z - CREST_Z);
const LOWER_TILT = Math.atan2(NOSE_FOOT_Z - LOWER_Z, NOSE_FOOT_Y - BELLY);
/** the lower nose plate's face at height y */
const lowerZ = (y: number): number => LOWER_Z + (y - BELLY) * ((NOSE_FOOT_Z - LOWER_Z) / (NOSE_FOOT_Y - BELLY));
/** metres the side slope runs outward per metre it falls */
const SLOPE = (SPONSON_X - DECK_EDGE) / (DECK - FLOOR - LIP);
const SLOPE_ANGLE = Math.atan2(DECK - FLOOR - LIP, SPONSON_X - DECK_EDGE);
const roofY = (z: number): number => (z <= CREST_Z ? DECK : DECK - (z - CREST_Z) * GLACIS);
const slopeX = (y: number): number => DECK_EDGE + (DECK - y) * SLOPE;
/** the side slope's height over |x| */
const slopeY = (x: number): number => DECK - (Math.abs(x) - DECK_EDGE) / SLOPE;
/** the turret's ring datum and the trunnion in the turret frame */
const TURRET_PIVOT = [0, 1.60, 0.50] as const, TRUNNION = [0, 0.29, 1.18] as const;

/** the prototype's vertical stern plate's foot; the production tank's sloped rear plate's foot at z -3.40 */
const STERN_FOOT_Y = 0.86, REAR_FOOT_Y = 0.54;

/** The tub between the tracks: rows of (z, belly, top), its lower edges chamfered. */
function tubSolid(rows: readonly (readonly [number, number, number])[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, b, t]) => {
    const c = Math.min(0.08, (t - b) * 0.4);
    return { z, ring: [[-TUB + c, b], [TUB - c, b], [TUB, b + c], [TUB, t], [-TUB, t], [-TUB, b + c]] };
  }));
}

/** One sponson: its floor over the track from the tub's wall to the outer lip, the sloped side up to the deck edge and
 * the deck strip back to the tub; rows of (z, top), the top following the deck and the glacis. */
function sponsonSolid(side: 1 | -1, rows: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, top]) => {
    const right: SectionPoint[] = [[TUB, FLOOR], [SPONSON_X, FLOOR], [SPONSON_X, FLOOR + LIP],
      [Math.min(SPONSON_X - 0.004, slopeX(top)), top], [TUB, top]];
    return { z, ring: side > 0 ? right : right.map(([x, y]): SectionPoint => [-x, y]).reverse() };
  }));
}

/** A point `t` of the way up a side slope (0 at its lip, 1 at the deck edge), `out` metres off its face, and the
 * rotation about z that lays a part's local x along the slope and its y along the face's outward normal. */
function onSlope(side: number, t: number, out = 0): { x: number; y: number; rz: number } {
  const x0 = SPONSON_X, y0 = FLOOR + LIP, x1 = DECK_EDGE, y1 = DECK;
  const nx = Math.sin(SLOPE_ANGLE), ny = Math.cos(SLOPE_ANGLE);
  return { x: side * (x0 + (x1 - x0) * t + nx * out), y: y0 + (y1 - y0) * t + ny * out, rz: -side * SLOPE_ANGLE };
}

function addHullBody(P: TankBuilderPort, proto: boolean): void {
  const front: [number, number, number][] = [
    [CREST_Z, BELLY, DECK], [LOWER_Z, BELLY, roofY(LOWER_Z)], [NOSE_FOOT_Z, NOSE_FOOT_Y, roofY(NOSE_FOOT_Z)],
    [3.37, 0.945, roofY(3.37)],
  ];
  // the prototype's vertical stern over its raked lower plate (the owner's model); the production tank's upper plate
  // leans forward from a short lower plate (docs/references/tanks/type74.md "Hull")
  const stern: [number, number, number][] = proto
    ? [[-3.41, STERN_FOOT_Y, DECK], [-3.00, BELLY, DECK]]
    : [[-3.40, 0.475, REAR_FOOT_Y], [-3.24, BELLY, 1.13], [-3.12, BELLY, DECK]];
  P.add('hull', tubSolid([...stern, ...front]));
  const sponsonRows: [number, number][] = [
    ...(proto ? [[-3.41, DECK]] as [number, number][] : [[-3.21, FLOOR + LIP + 0.005], [-3.12, DECK]] as [number, number][]),
    [CREST_Z, DECK], [SPONSON_FRONT, roofY(SPONSON_FRONT)],
  ];
  for (const s of [-1, 1] as const) P.add('hull', sponsonSolid(s, sponsonRows));
  // the front fender caps over the idlers, run out from the sponsons' front faces
  for (const s of [-1, 1]) P.add('hull', KIT.box(SPONSON_X - TUB, LIP, 0.62), s * (SPONSON_X + TUB) / 2, FLOOR + LIP / 2, SPONSON_FRONT + 0.30);
  // the weld bead along the nose and the crest's seam
  P.add('hullDark', KIT.box(TUB * 2, 0.014, 0.03), 0, roofY(3.352) - 0.001, 3.352);
  P.add('hullDark', KIT.box(TUB * 2 - 0.04, 0.008, 0.02), 0, DECK + 0.002, CREST_Z);
  // the side slopes' welded seams and the bolt course along the lip
  const seams = proto ? [1.30, 0.10, -1.10] : [1.45, 0.35, -0.75, -1.85];
  for (const s of [-1, 1]) {
    for (const z of seams) {
      const p = onSlope(s, 0.5, 0.003);
      P.add('hullDark', KIT.box(Math.hypot(SPONSON_X - DECK_EDGE, DECK - FLOOR - LIP) - 0.02, 0.008, 0.016), p.x, p.y, z, 0, 0, p.rz);
    }
    for (let k = 0; k < 16; k++) P.add('hullDetail', KIT.cylX(0.013, 0.012, 8), s * (SPONSON_X + 0.004), FLOOR + LIP / 2, 2.20 - k * 0.36);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The production Type 74's hull kit
// ---------------------------------------------------------------------------------------------------------------------
function addProductionHullKit(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus, openRackGrid, liftEye, shovelTool } = KIT;
  // BOW: two clevis tow shackles on the lower plate (its face 59 degrees off vertical)
  for (const s of [-1, 1]) towShackle(P, s * 0.46, 0.70, lowerZ(0.70) + 0.01, 1, LOWER_TILT);
  // the lamp boxes on the front fender caps, their backs on the sponsons' faces: amber marker and blackout lamp
  // outboard, the IR lamp, the sealed-beam headlight inboard (NDA 2024 photographs); the ribbed mudguards under them
  for (const s of [-1, 1]) {
    cagedLampBox(P, { x: s * 1.28, y: FLOOR + LIP, z: SPONSON_FRONT + 0.27, w: 0.44, h: 0.18, d: 0.27, side: s,
      lamps: ['marker', 'ir', 'head'], bars: 4 });
    ribbedMudguard(P, s * 1.28, FLOOR + 0.004, SPONSON_FRONT + 0.60, 0.50, 0.30, 0.42);
  }
  // the driver's flush single-piece hatch on the glacis' upper left and the three JM17 periscopes ahead of it
  // (HistoryOfWar), laid on the plate
  const tilt = Math.atan(GLACIS);
  P.add('hull', cylY(0.23, 0.23, 0.035, 16), -0.55, roofY(2.15) + 0.012, 2.15, tilt, 0, 0);
  P.add('hullDark', cylY(0.236, 0.236, 0.012, 16), -0.55, roofY(2.15) + 0.004, 2.15, tilt, 0, 0);
  P.add('hullDetail', box(0.16, 0.022, 0.035), -0.42, roofY(2.10) + 0.035, 2.10, tilt, 0, 0);
  for (const x of [-0.73, -0.55, -0.37]) P.add('hull', box(0.15, 0.07, 0.10), x, roofY(2.43) + 0.03, 2.43, tilt, 0, 0);
  for (const x of [-0.73, -0.55, -0.37]) P.add('hullGlass', box(0.12, 0.03, 0.012), x, roofY(2.43) + 0.045, 2.485, tilt, 0, 0);
  // the tow cable laid across the glacis ahead of the periscopes (the NDA photographs: the rope runs across the plate)
  P.hullG.add(FITTINGS.towCable({ mats: P.mats, pts: [[-0.88, roofY(2.80) + 0.02, 2.80], [0, roofY(2.70) + 0.02, 2.70], [0.88, roofY(2.80) + 0.02, 2.80]], seed: 11 }));
  P.decal('hull', 'number', '74-4302', 0.22, [-0.55, roofY(3.06) + 0.006, 3.06], 0, -tilt);
  // ENGINE DECK: two radiator grilles in raised frames over dark wells behind the turret's sweep, a hinged access plate
  // between them, two filler caps; aft of them the cooling-air louvre banks
  for (const s of [-1, 1]) {
    const gx = s * 0.52, gz = -1.95, gw = 0.78, gd = 0.62;
    P.add('hullDark', box(gw - 0.04, 0.006, gd - 0.04), gx, DECK + 0.001, gz);
    for (const dz of [-1, 1]) P.add('hull', box(gw, 0.024, 0.035), gx, DECK + 0.010, gz + dz * (gd / 2 - 0.0175));
    for (const dx of [-1, 1]) P.add('hull', box(0.035, 0.024, gd - 0.07), gx + dx * (gw / 2 - 0.0175), DECK + 0.010, gz);
    P.add('hullDetail', openRackGrid(gw - 0.07, gd - 0.07, 0.010, 9, 12), gx, DECK + 0.009, gz);
    for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.72, 0.012, 0.07), gx, DECK + 0.012, -2.42 - k * 0.11, -0.42, 0, 0);
    P.add('hullDark', box(0.80, 0.006, 0.68), gx, DECK + 0.001, -2.70);
    P.add('hull', cylY(0.075, 0.08, 0.026, 14), s * 1.05, DECK + 0.013, -1.40);
    P.add('hullDark', torus(0.068, 0.008, 14), s * 1.05, DECK + 0.026, -1.40);
  }
  P.add('hull', box(0.24, 0.022, 0.58), 0, DECK + 0.010, -1.95);
  P.add('hullDark', box(0.24, 0.016, 0.03), 0, DECK + 0.007, -1.645);
  // STERN: the sloped upper plate's large bolted access door, its handle, the pipe rail and clamps, two low tow shackles
  // and the big tow eyes at its top corners
  const rearZ = (y: number): number => -3.40 + ((y - REAR_FOOT_Y) / (DECK - REAR_FOOT_Y)) * 0.28;
  const lean = Math.atan2(0.28, DECK - REAR_FOOT_Y);
  const doorY = 1.04;
  P.add('hull', box(0.94, 0.59, 0.024), 0, doorY, rearZ(doorY) - 0.012, lean, 0, 0);
  P.add('hullDark', box(0.97, 0.62, 0.012), 0, doorY, rearZ(doorY) - 0.004, lean, 0, 0);
  for (let k = 0; k < 18; k++) {
    const t = k / 18, along = t < 0.5 ? (t / 0.5) * 2 - 1 : ((t - 0.5) / 0.5) * 2 - 1, top = t < 0.5;
    const by = doorY + (top ? 0.265 : -0.265);
    P.add('hullDetail', cylZ(0.012, 0.016, 8), along * 0.43, by, rearZ(by) - 0.028, lean, 0, 0);
  }
  P.add('hullDetail', box(0.16, 0.025, 0.035), 0.30, 0.90, rearZ(0.90) - 0.03, lean, 0, 0);
  for (const x of [-0.82, 0, 0.82]) P.add('hullDetail', box(0.05, 0.06, 0.07), x, 1.42, rearZ(1.42) - 0.03, lean, 0, 0);
  P.add('hullDetail', beamBetween([-0.86, 1.42, rearZ(1.42) - 0.06], [0.86, 1.42, rearZ(1.42) - 0.06], 0.02, 12));
  for (const s of [-1, 1]) {
    towShackle(P, s * 0.55, 0.68, rearZ(0.68), -1);
    uTowEye(P, s * 0.86, DECK, -3.06);
  }
  // the exhaust: a long tubular muffler cover on each rear side slope, its outlet turned rearward and outward
  // (HistoryOfWar; the Katsura photographs), a tail lamp on the sponson's rear corner; the rear mudflaps behind the
  // sprockets
  for (const s of [-1, 1]) {
    const m = onSlope(s, 0.55);
    mufflerCover(P, m.x + s * 0.02, m.y - 0.02, -1.20, -3.05, 0.09, s);
    tailLamp(P, s * 1.47, FLOOR + LIP + 0.01, -3.215);
    MUDGUARDS.add(P, { hang: true, label: `type74-mudflap-${s < 0 ? 'left' : 'right'}-rear`,
      x: s * 1.2835, y: FLOOR - 0.10, z: -3.22, thickness: 0.035, length: 0.52, height: 0.18,
      material: 'rubber', rotation: [0, Math.PI / 2, 0], crown: 0.007, frontCut: 0.018, rearCut: 0.013 });
  }
  // stowage lockers on the side slopes, low on them: their tops stay under the deck line, where the mask and the bustle
  // swing over them, and their outer edges inside the width anchor
  for (const s of [-1, 1]) for (const [z, len] of [[0.85, 0.80], [-0.30, 0.90]] as const) {
    const p = onSlope(s, 0.45, 0.05);
    P.addEquipment('hull', box(0.16, 0.10, len), p.x, p.y, z, 0, 0, p.rz);
    const lid = onSlope(s, 0.45, 0.102);
    P.add('hullDark', box(0.17, 0.008, len - 0.06), lid.x, lid.y, z, 0, 0, lid.rz);
  }
  // the pioneer tools on the rear deck strip, outside the bustle's sweep; the rear deck's lifting eyes
  shovelTool(P, -1.12, DECK + 0.015, -2.40);
  for (const s of [-1, 1]) liftEye(P, 'hullDetail', s * 1.05, DECK + 0.01, -2.95);
}

// ---------------------------------------------------------------------------------------------------------------------
// The STB-1's hull kit: the owner's model, each handed part on the side the model shows it
// ---------------------------------------------------------------------------------------------------------------------
function addPrototypeHullKit(P: TankBuilderPort): void {
  const { box, cylY, cylZ, openRackGrid, liftEye, shovelTool } = KIT;
  const tilt = Math.atan(GLACIS);
  // BOW: tow hooks on the lower plate; the caged twin headlights on the front fender caps; the single hooded lamp on
  // the glacis at -x; plain mudguards
  for (const s of [-1, 1]) towShackle(P, s * 0.45, 0.68, lowerZ(0.68) + 0.01, 1, LOWER_TILT);
  for (const s of [-1, 1]) {
    cagedLampBox(P, { x: s * 1.30, y: FLOOR + LIP, z: SPONSON_FRONT + 0.24, w: 0.34, h: 0.22, d: 0.22, side: s,
      lamps: ['head', 'head'], bars: 3 });
    P.add('hull', box(0.52, 0.012, 0.30), s * 1.28, FLOOR - 0.051, SPONSON_FRONT + 0.76, 0.35, 0, 0);
  }
  {
    const x = -0.78, z = 2.42, y = roofY(z);
    P.add('hull', box(0.14, 0.05, 0.10), x, y + 0.02, z, tilt, 0, 0);
    P.add('hullDetail', cylZ(0.065, 0.10, 14), x, y + 0.10, z + 0.02);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.055, 0.012, 14), 'headlight'), x, y + 0.10, z + 0.075);
    P.add('hullDark', box(0.16, 0.012, 0.12), x, y + 0.172, z + 0.02);
  }
  // the raised octagonal driver's hatch on the glacis' upper +x side, its periscopes round its foot
  {
    const x = 0.55, z = 2.25, y = roofY(z), seg = 8;
    P.add('hull', cylY(0.30, 0.32, 0.07, seg).rotateY(Math.PI / 8), x, y + 0.025, z, tilt, 0, 0);
    P.add('hull', cylY(0.25, 0.28, 0.035, seg).rotateY(Math.PI / 8), x, y + 0.07, z, tilt, 0, 0);
    P.add('hullDark', box(0.40, 0.010, 0.025), x, y + 0.09, z, tilt, 0, 0);
    for (const a of [-0.55, 0, 0.55]) {
      const px = x + Math.sin(a) * 0.31, pz = z + Math.cos(a) * 0.31;
      P.add('hullGlass', box(0.11, 0.028, 0.012), px, roofY(pz) + 0.045, pz + 0.006, tilt, a, 0);
    }
  }
  // ENGINE DECK, where the owner's model has it (263; the 262 stations were read before its yaw registration was fixed
  // and stood 0.5 m aft): the large three-panel grille from z -1.25 to -2.57 between two long narrow ones running from
  // the bustle's edge, a hinged access plate ahead of the large one
  const grille = (x: number, w: number, z0: number, z1: number, panels: number) => {
    const d = z0 - z1;
    P.add('hullDark', box(w - 0.04, 0.006, d - 0.04), x, DECK + 0.001, (z0 + z1) / 2);
    for (const dz of [-1, 1]) P.add('hull', box(w, 0.026, 0.04), x, DECK + 0.011, (z0 + z1) / 2 + dz * (d / 2 - 0.02));
    for (const dx of [-1, 1]) P.add('hull', box(0.04, 0.026, d - 0.08), x + dx * (w / 2 - 0.02), DECK + 0.011, (z0 + z1) / 2);
    for (let k = 1; k < panels; k++) P.add('hull', box(w - 0.08, 0.022, 0.03), x, DECK + 0.009, z0 - (d * k) / panels);
    P.add('hullDetail', openRackGrid(w - 0.08, d - 0.08, 0.010, Math.round(w * 14), Math.round(d * 14)), x, DECK + 0.008, (z0 + z1) / 2);
  };
  grille(0, 0.90, -1.25, -2.57, 3);
  for (const s of [-1, 1]) grille(s * 0.90, 0.20, -1.02, -2.24, 2);
  P.add('hull', box(1.30, 0.016, 0.20), 0, DECK + 0.006, -1.13);
  P.add('hullDark', box(1.30, 0.012, 0.02), 0, DECK + 0.006, -1.02);
  // the mesh-topped boxes standing on the rear sponsons, flush with the deck, and the silencers in mesh guards behind
  // them on the slopes, their outlets turned out
  for (const s of [-1, 1]) {
    const x0 = DECK_EDGE, x1 = 1.53, z0 = -1.02, z1 = -2.47, top = DECK + 0.012;
    // a wedge filling the space over the slope: its foot 2 cm into the plate, its top flush with the deck
    P.add('hull', sectionSolid([z1, z0].map((z) => {
      const right: SectionPoint[] = [[x0, slopeY(x0) - 0.02], [x1, slopeY(x1) - 0.02], [x1, top], [x0, top]];
      return { z, ring: s > 0 ? right : right.map(([x, y]): SectionPoint => [-x, y]).reverse() };
    })));
    P.add('hullDark', box(x1 - x0 - 0.06, 0.006, z0 - z1 - 0.08), s * (x0 + x1) / 2, top + 0.001, (z0 + z1) / 2);
    P.add('hullDetail', openRackGrid(x1 - x0 - 0.08, z0 - z1 - 0.10, 0.009, 4, 14), s * (x0 + x1) / 2, top + 0.006, (z0 + z1) / 2);
    P.add('hullDark', box(0.006, 0.17, z0 - z1 - 0.10), s * (x1 + 0.002), top - 0.10, (z0 + z1) / 2);
    P.add('hullDetail', openRackGrid(0.15, z0 - z1 - 0.12, 0.008, 3, 14), s * (x1 + 0.006), top - 0.10, (z0 + z1) / 2, 0, 0, Math.PI / 2);
    const m = onSlope(s, 0.45);
    guardedSilencer(P, m.x, m.y - 0.03, -2.62, -3.36, 0.09, s);
  }
  // STERN: the vertical plate's large door, the extinguisher handle, the tail lamps (two at -x, one at +x), the tow
  // hooks on the raked lower plate and the rail along the vertical plate's foot. 265 (owner: "make the stb 1 have two
  // big fuel barrels and back"): the fleet's 200 L pair across the plate on a welded shelf (rearSlopeFuelDrums.ts), 11 cm
  // off it, clear of the door's ring and handle, and the tail lamps move out onto the sponsons' rear faces beside them.
  // Then (owner: "raise em a little higher!!", and 266: "raise the drums on the stb1 so theyre visible in the hero images
  // a lil more!!!") the saddles stand 23.5 cm tall, so the drums' tops (1.73 m) stand 15 cm over the deck in the hero's
  // three-quarter view: the shelf stays under the plate's foot rail, and the gun's curve rides up over them from about
  // 167 degrees round (japan.ts STB1_GUN_PITCH_BY_YAW_DEG, re-swept). Higher, the level gun would meet them astern.
  // The whole pair (shelf, gussets, saddles, drums, straps) is one owner-kit group (Main 266: set aside from the owner's
  // model's comparison, which has no drums; tools/owner-kit-targets.mjs)
  const rz = -3.41, rake = 0.41 / (STERN_FOOT_Y - BELLY);
  ownerKitGroup(P, 'hull', 'stb1KitSternDrums', () => addSternShelfFuelDrums(P,
    { plateZ: rz, footY: STERN_FOOT_Y, rake, shelfY: 0.90, halfWidth: 0.97, standoff: 0.11, seat: 0.235, gussets: [-0.80, 0, 0.80] }));
  P.add('hull', box(0.72, 0.50, 0.02), -0.22, 1.22, rz - 0.01);
  P.add('hullDark', box(0.75, 0.53, 0.010), -0.22, 1.22, rz - 0.003);
  for (const dx of [-0.30, 0.30]) P.add('hullDetail', box(0.05, 0.10, 0.04), -0.22 + dx, 1.47, rz - 0.02);
  P.add('hullDetail', box(0.10, 0.16, 0.06), -0.62, 1.19, rz - 0.03);
  P.add('hullGlass', box(0.05, 0.12, 0.05), 0.40, 1.19, rz - 0.025);
  for (const [x, y] of [[-1.08, 1.40], [-1.21, 1.40], [1.14, 1.37]] as const) {
    P.add('hullDetail', cylZ(0.045, 0.04, 12), x, y, rz - 0.02);
    P.add('hullGlass', cylZ(0.036, 0.012, 12), x, y, rz - 0.042);
  }
  P.add('hullDark', KIT.torus(0.07, 0.014, 14, 8).rotateX(Math.PI / 2), 0.68, 1.20, rz - 0.015);
  // the rail stands 2.2 cm off the plate: at 4 cm it left a slot over open ground that the plan raster reads as a hole
  P.add('hullDetail', beamBetween([-0.80, 0.95, rz - 0.04], [0.80, 0.95, rz - 0.04], 0.018, 12));
  for (const x of [-0.80, 0, 0.80]) P.add('hullDetail', box(0.04, 0.05, 0.04), x, 0.95, rz - 0.02);
  for (const s of [-1, 1]) towShackle(P, s * 0.52, 0.745, rz + (STERN_FOOT_Y - 0.745) * rake + 0.01, -1, -Math.atan(rake));
  for (const s of [-1, 1]) {
    liftEye(P, 'hullDetail', s * 1.05, DECK + 0.01, -3.20);
    MUDGUARDS.add(P, { hang: true, label: `stb1-mudflap-${s < 0 ? 'left' : 'right'}-rear`,
      x: s * 1.2835, y: FLOOR - 0.10, z: -3.39, thickness: 0.035, length: 0.52, height: 0.18,
      material: 'rubber', rotation: [0, Math.PI / 2, 0], crown: 0.007, frontCut: 0.018, rearCut: 0.013 });
  }
  shovelTool(P, -1.12, DECK + 0.015, -2.95);
  P.decal('hull', 'number', 'STB-1', 0.18, [0.50, roofY(2.95) + 0.006, 2.95], 0, -tilt);
}

// ---------------------------------------------------------------------------------------------------------------------
// The running gear (both): five road wheels on the model's pitch, the raised idler and sprocket
// ---------------------------------------------------------------------------------------------------------------------
function addRunningGear(P: TankBuilderPort): void {
  // §D WIDTH ANCHOR: the kit's sprocket tooth ring spans the band edges +0.031; at xc 1.2835 it seats exactly at the
  // published ±1.59, so authored = world, scale 1.0. The dead track rides the wheel tops (no return rollers).
  KIT.buildRunningGear(P, {
    trackShoeBuilder: buildFleetTrackShoe, fitLoadedRun: true, dedupeLoopPoints: true,
    style: 'rubber', wheelR: 0.42, wheelW: 0.26, wheelY: 0.49, xc: 1.2835,
    wheelZs: [2.00, 0.99, 0.00, -1.01, -2.02],
    sprocket: { z: -2.95, y: 0.79, r: 0.29 }, idler: { z: 3.00, y: 0.75, r: 0.32 },
    rollers: [], trackW: 0.55, topY: 1.13, botY: 0.055, deadSag: 0.10,
    paintedEnds: true, coveredTop: false, arms: true,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The cast turret (both): the model's plan and rings
// ---------------------------------------------------------------------------------------------------------------------
const HALF_PLAN = [[0, 1.489], [0.487, 1.362], [0.845, 1.025], [1.106, 0.650], [1.272, 0.228],
  [1.332, -0.239], [1.311, -0.770], [1.121, -1.359], [0.711, -1.990], [0, -2.117]] as const;
const PLAN: [number, number][] = [...HALF_PLAN.map(([x, z]): [number, number] => [x, z]),
  ...HALF_PLAN.slice(1, 9).reverse().map(([x, z]): [number, number] => [-x, z])];
const mirror18 = (half: readonly number[]): number[] => [...half, ...half.slice(1, 9).reverse()];
// insets about the plan's mean, measured from the model's turret at each height (turret frame, metres)
// (the foot ring stays 2 cm into the deck; the rest at the model's own proportions). 263: the three front stations
// re-measured with the nose the gun leaves through counted as the turret's (it is the mask's face now): the model's nose
// stands 10 cm further out on the bore line under the collar, 5 cm at 0.49 m out and 2.5 cm at 0.85 m, less toward the
// crown. The ring 8 cm over the foot takes half that and the foot none, so at full depression the mask's chin keeps the
// gun's 26 mm off the deck kit ahead (both per-yaw curves unchanged, tools/gun-depression-sweep.mjs)
const RINGS: PolyMultiLoftRing[] = [
  { height: -0.02, inset: mirror18([0.88, 0.90, 0.97, 0.96, 0.94, 0.92, 0.89, 0.80, 0.58, 0.54]) },
  { height: 0.078, inset: mirror18([0.98, 0.987, 1.011, 0.99, 0.98, 0.98, 0.95, 0.88, 0.66, 0.62]) },
  { height: 0.175, inset: mirror18([1.064, 1.03, 1.007, 0.98, 0.98, 1.00, 0.99, 0.97, 0.85, 0.81]) },
  { height: 0.272, inset: mirror18([1.04, 1.011, 0.967, 0.94, 0.94, 0.96, 0.96, 0.98, 0.99, 1.00]) },
  { height: 0.370, inset: mirror18([1.01, 0.955, 0.917, 0.89, 0.87, 0.90, 0.91, 0.94, 0.98, 0.99]) },
  { height: 0.467, inset: mirror18([0.92, 0.876, 0.864, 0.83, 0.81, 0.83, 0.84, 0.87, 0.94, 0.98]) },
  { height: 0.564, inset: mirror18([0.745, 0.766, 0.786, 0.76, 0.76, 0.76, 0.78, 0.83, 0.91, 0.97]) },
  { height: 0.613, inset: mirror18([0.59, 0.63, 0.69, 0.71, 0.72, 0.73, 0.73, 0.81, 0.88, 0.95]) },
  { height: 0.661, inset: mirror18([0.41, 0.45, 0.53, 0.62, 0.67, 0.69, 0.69, 0.70, 0.72, 0.70]) },
  { height: 0.706, inset: mirror18([0.10, 0.18, 0.30, 0.42, 0.50, 0.55, 0.56, 0.56, 0.55, 0.52]), centerHeight: 0.714 },
];
const CROWN = 0.709, CREASE_DEG = 50;

/** The cast shell (turret frame, unadded: the mask cuts its seat into it). Its flat foot ring rests on the deck. */
function castTurretShell(P: TankBuilderPort, variant: Type74Variant): THREE.BufferGeometry {
  const cast = refineCastLoft(PLAN, RINGS);
  const shell = toCreasedNormals(KIT.polyMultiLoft(cast.plan, cast.rings), (CREASE_DEG * Math.PI) / 180);
  P.turretG.userData.japaneseCastTurretReceipt = {
    family: 'type74-family-owner-model-cast',
    variant,
    authoredStations: PLAN.length,
    planStations: cast.plan.length,
    verticalRings: cast.rings.length,
    flatCrown: true,
    circularLathe: false,
    creaseAngleDeg: CREASE_DEG,
    shellHeightM: 0.714,
    roofEquipment: variant === 'production'
      ? { cupolas: 1, hatches: 1, machineGuns: 1, opticHeads: 2, searchlights: 1 }
      : { cupolas: 1, hatches: 1, machineGuns: 1, opticHeads: 2, searchlights: 1, flankBoxes: 2, roofVents: 2 },
  };
  return shell;
}

/** Where the cast shell's skin is (turret frame), found by rays on the shell before the mask cuts it: the roof's
 * height over (x, z), and a flank's outer x at (y, z). Every roof and flank fitting is seated on these. */
interface ShellProbe {
  top(x: number, z: number): number;
  flank(side: number, y: number, z: number): number;
  /** the bustle's rear face at (x, y): the shell's rearmost z there */
  aft(x: number, y: number): number;
  dispose(): void;
}

function shellProbe(shell: THREE.BufferGeometry): ShellProbe {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(shell, material);
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), dir = new THREE.Vector3();
  const cast = (): THREE.Vector3 | null => { ray.set(origin, dir); return ray.intersectObject(mesh, false)[0]?.point ?? null; };
  return {
    top(x, z) { origin.set(x, 2, z); dir.set(0, -1, 0); return cast()?.y ?? CROWN; },
    flank(side, y, z) { origin.set(side * 3, y, z); dir.set(-side, 0, 0); return cast()?.x ?? side * 1.2; },
    aft(x, y) { origin.set(x, y, -4); dir.set(0, 0, 1); return cast()?.z ?? -2.0; },
    dispose() { material.dispose(); },
  };
}

function addProductionTurretKit(P: TankBuilderPort, at: ShellProbe): void {
  const { box, cylY, cupola, periscope, liftEye, openRackGrid } = KIT;
  // the commander's cupola on the right with the M2 on its ring (VH.14: every drawn gun works); the loader's low oval
  // hatch on the left; the gunner's and loader's periscopes; the rangefinder head's armoured end on the right shoulder
  const cy = at.top(0.45, -0.50) - 0.02;
  cupola(P, 'turret', 0.45, cy, -0.50, 0.21, 0.17, 6);
  // the M2 on its socket at the cupola's front-left rim, 40 degrees inboard of dead ahead and clear of the hatch lid, its
  // flange 3 cm over the lid
  {
    const a = (-40 * Math.PI) / 180, px = 0.45 + 0.258 * Math.sin(a), pz = -0.50 + 0.258 * Math.cos(a);
    roofM2(P, 'type74RoofM2', px, pintleSocket(P, px, at.top(px, pz), pz, cy + 0.24, 0.03, [0.45, -0.50], 0.17), pz, 7);
  }
  const ly = at.top(-0.45, -0.30) - 0.015;
  P.add('turret', cylY(0.20, 0.21, 0.05, 16), -0.45, ly + 0.025, -0.30);
  P.add('turret', cylY(0.17, 0.17, 0.045, 16), -0.45, ly + 0.07, -0.30);
  P.add('turretDark', box(0.32, 0.013, 0.03), -0.45, ly + 0.10, -0.30);
  P.snapGroup('type74-gunner-periscope', () => periscope(P, 'turretDetail', 0.28, at.top(0.28, 0.45) + 0.03, 0.45), { reachM: 0.10, mode: 'down' });
  P.snapGroup('type74-loader-periscope', () => periscope(P, 'turretDetail', -0.45, at.top(-0.45, 0.05) + 0.03, 0.05, 0.3), { reachM: 0.10, mode: 'down' });
  {
    const x = 0.78, z = 0.10, y = at.top(x, z);
    P.add('turret', box(0.24, 0.17, 0.22), x, y + 0.06, z, -0.06, 0, 0);
    P.add('turretDark', box(0.19, 0.10, 0.024), x, y + 0.07, z + 0.115);
    P.add('turretGlass', box(0.14, 0.06, 0.018), x, y + 0.07, z + 0.131);
  }
  {
    const y = at.top(0.72, -0.74) + 0.065;
    P.add('turretDetail', box(0.23, 0.17, 0.16), 0.72, y, -0.74);
    P.add('turretDark', box(0.025, 0.11, 0.12), 0.846, y, -0.74);
  }
  // the production tank's smoke dischargers: three tubes at each front corner of the turret, fired forward and outward
  for (const s of [-1, 1]) {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 3, splay: s * 0.62, pitch: -0.42, seed: 9 + s });
    smoke.position.set(at.flank(s, 0.41, 0.62) - s * 0.02, 0.41, 0.62);
    P.turretG.add(smoke);
  }
  // the bustle basket: pipe rails round the rear face, an open mesh floor and back, a canvas load
  {
    const xb = 0.92, z0 = -2.00, z1 = -2.42, y0 = 0.18, y1 = 0.475, ym = (y0 + y1) / 2;
    for (const y of [y0, y1]) {
      P.add('turretDetail', box(2 * xb, 0.03, 0.03), 0, y, z1);
      for (const s of [-1, 1]) P.add('turretDetail', box(0.03, 0.03, z0 - z1), s * xb, y, (z0 + z1) / 2);
    }
    for (let k = 0; k <= 6; k++) P.add('turretDetail', box(0.026, y1 - y0, 0.026), -xb + (2 * xb * k) / 6, ym, z1);
    for (const s of [-1, 1]) P.add('turretDetail', box(0.026, y1 - y0, 0.026), s * xb, ym, (z0 + z1) / 2);
    P.add('turretDetail', box(2 * xb, 0.012, z0 - z1), 0, y0, (z0 + z1) / 2);
    P.add('turretDark', openRackGrid(2 * xb - 0.06, y1 - y0 - 0.025, 0.012, 14, 5), 0, ym, z1 - 0.004, Math.PI / 2, 0, 0);
    P.add('turretCloth', box(2 * xb - 0.16, 0.23, z0 - z1 - 0.12), 0, y0 + 0.125, (z0 + z1) / 2 - 0.02);
  }
  for (const s of [-1, 1]) {
    P.snapGroup(`type74-whip-${s < 0 ? 'left' : 'right'}`, () => {
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.98, rake: s * 0.05, seed: 3 + s });
      whip.position.set(s * 0.78, at.top(s * 0.78, -1.45) - 0.01, -1.45);
      P.turretG.add(whip);
    }, { reachM: 0.10, mode: 'down' });
    // the flank's grab rail on its stand-offs, over the number
    const ry = 0.27, rx = at.flank(s, ry, -0.45);
    P.add('turretDetail', box(0.022, 0.022, 0.80), rx + s * 0.05, ry, -0.45);
    for (const dz of [-0.34, 0.34]) {
      const fx = at.flank(s, ry, -0.45 + dz);
      P.add('turretDetail', box(Math.abs(rx + s * 0.05 - fx) + 0.02, 0.016, 0.016), (rx + s * 0.05 + fx) / 2, ry, -0.45 + dz);
    }
    liftEye(P, 'turretDetail', s * 0.95, at.top(s * 0.95, -1.20), -1.20, s * 0.4);
    P.decal('turret', 'number', P.spec.visual.number || '74', 0.20, [at.flank(s, 0.15, -0.55) + s * 0.004, 0.15, -0.55], s * Math.PI / 2, 0, s * 0.10);
  }
}

/**
 * 263 (owner 2026-10-29: "add mounted machine guns on both of these guys"): a classic emplacement's socket post at a
 * hatch ring's rim, as the fleet's (nationalRoofWeapon.ts nationalPintleSocket): a turned post from 8 mm into the roof
 * under it (`roof`) up to `topY`, its clamp collar 6 mm wider and the lock bolt facing outboard, and a web plate on the
 * radial from inside the ring's stock (`innerR` round `ring`) to the post. Returns the flange's seat, the collar's top.
 */
function pintleSocket(P: TankBuilderPort, x: number, roof: number, z: number, topY: number, postR: number,
  ring: readonly [number, number], innerR: number): number {
  const { box, cylX, cylY } = KIT;
  const collarH = 0.024, collarR = postR + 0.006, bottom = roof - 0.008, postH = topY - collarH - bottom;
  if (postH < 0.02) throw new Error(`${P.spec?.id}: no room for the pintle socket's post (roof ${roof.toFixed(3)}, top ${topY.toFixed(3)})`);
  const seg = P.q ? 20 : 12, out = Math.atan2(x - ring[0], z - ring[1]), ox = Math.sin(out), oz = Math.cos(out);
  P.add('turretDetail', cylY(postR, postR + 0.004, postH, seg), x, bottom + postH / 2, z);
  P.add('turretDetail', cylY(collarR, collarR, collarH, seg), x, topY - collarH / 2, z);
  const boltY = topY - collarH / 2, ry = out - Math.PI / 2;
  P.add('turretDark', cylX(0.006, 0.022, 8), x + ox * (collarR - 0.007), boltY, z + oz * (collarR - 0.007), 0, ry, 0);
  P.add('turretDark', cylX(0.011, 0.007, 6), x + ox * (collarR + 0.0035), boltY, z + oz * (collarR + 0.0035), 0, ry, 0);
  const outerR = Math.hypot(x - ring[0], z - ring[1]), webTop = topY - collarH, h = webTop - bottom, mid = (innerR + outerR) / 2;
  P.add('turretDetail', box(0.022, h, outerR - innerR), ring[0] + ox * mid, bottom + h / 2, ring[1] + oz * mid, 0, out, 0);
  return topY;
}

/** The 12.7 mm M2 on its socket (the fleet's classic emplacement: pintle column, riding cradle, the class's receiver,
 * feed and ammunition can, the true crew barrel), its flange 2 mm into the collar, a `riser` lifting it on the fleet's
 * sleeve and clamp collar; a working station the auxiliary roof-gun control turns and fires. */
function roofM2(P: TankBuilderPort, name: string, x: number, seat: number, z: number, seed: number, riser = 0): void {
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', scale: 1, tone: 'two-tone', elev: 0.08, shield: false, ammo: true,
    ring: false, riser, working: true, datumBarrel: false, ridingCradle: true, seed });
  m2.name = name;
  m2.userData.auxiliaryMuzzle = [0, m2.userData.barrelAxisLocalY, m2.userData.muzzleLocalZ];
  m2.position.set(x, seat - 0.002, z);
  P.turretG.add(m2);
}

/** A geometry turned into the basis whose x, y and z axes are the given unit vectors (the frame its parts are drawn in) */
function inBasis(geometry: THREE.BufferGeometry, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): THREE.BufferGeometry {
  return geometry.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
}

/** An elliptical tier of the commander's station: a cylinder stretched along z */
function ovalTier(rTop: number, rBottom: number, h: number, zStretch: number): THREE.BufferGeometry {
  return KIT.cylY(rTop, rBottom, h, 24).scale(1, 1, zStretch);
}

function addPrototypeTurretKit(P: TankBuilderPort, at: ShellProbe): void {
  const { box, cylY, cylZ, torus, periscope, openRackGrid } = KIT;
  // 263 (Main: the STB-1's turret kit where the owner's model has it): every station below is measured on the model in
  // the turret frame (docs/references/tanks/stb1.md "Turret kit"); the shell, mask and hull were already its own.
  // The commander's raised station at -x: an oval two-tier station 0.76 by 0.97 m at its foot, its crown 0.23 m over the
  // roof, its sight head at the front of the crown, vision blocks round the foot, and the AA gun (sourced: STB-1 and
  // STB-2; the model leaves it off) on a socket at the station's inboard rim (VH.14: every drawn gun works).
  {
    const x = -0.39, z = -0.45, y = at.top(x, z) - 0.02;
    P.addCupola('turret', ovalTier(0.36, 0.38, 0.12, 1.28), x, y + 0.06, z);
    P.addCupola('turret', ovalTier(0.25, 0.31, 0.12, 1.45), x, y + 0.18, z - 0.08);
    P.add('turretDark', torus(0.20, 0.013, 24).scale(1, 1, 1.45), x, y + 0.24, z - 0.12);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      P.add('turretGlass', box(0.09, 0.05, 0.03), x + Math.sin(a) * 0.375, y + 0.07, z + Math.cos(a) * 0.48, 0, a, 0);
    }
    const hz = -0.20, hy = y + 0.25;
    P.addCupola('turret', box(0.29, 0.10, 0.16), -0.435, hy, hz);
    P.add('turretDark', box(0.23, 0.055, 0.022), -0.435, hy + 0.005, hz + 0.08);
    P.add('turretGlass', box(0.17, 0.035, 0.016), -0.435, hy + 0.005, hz + 0.093);
    // the commander's 12.7 mm M2 (the sourced anti-aircraft gun) on a socket at the upper tier's right rim, standing on
    // the lower tier (1 cm into the upper tier's foot, flush with the lower tier's edge), its flange 4 cm over the crown
    // and its pintle in the fleet's 5 cm riser sleeve. Wave 5 (blind critics): with the gun close over the crown the
    // station hid the post, and the gun read as floating on its cradle's arm; the sleeve carries the column into view.
    const sx = x + 0.33, sz = z - 0.08;
    roofM2(P, 'stb1RoofM2', sx, pintleSocket(P, sx, y + 0.12, sz, y + 0.28, 0.03, [x, sz], 0.24), sz, 1110, 0.05);
  }
  // the loader's round hatch at +x, its ring, lid and hinge, a periscope at its inboard front corner
  {
    const x = 0.53, z = -0.40, y = at.top(x, z) - 0.015;
    P.add('turret', cylY(0.25, 0.27, 0.06, 20), x, y + 0.03, z);
    P.add('turret', cylY(0.22, 0.22, 0.04, 20), x, y + 0.08, z);
    P.add('turretDark', torus(0.235, 0.012, 24), x, y + 0.06, z);
    P.add('turretDetail', box(0.06, 0.05, 0.16), x - 0.24, y + 0.08, z);
    P.snapGroup('stb1-loader-periscope', () => periscope(P, 'turretDetail', 0.24, at.top(0.24, -0.02) + 0.03, -0.02, -0.2), { reachM: 0.10, mode: 'down' });
  }
  // the gunner's square sight head forward at -x and the small round vent forward at +x
  {
    const x = -0.48, z = 0.44, y = at.top(x, z);
    P.add('turret', box(0.20, 0.12, 0.20), x, y + 0.03, z);
    P.add('turretDark', box(0.16, 0.05, 0.02), x, y + 0.055, z + 0.10);
    P.add('turretGlass', box(0.12, 0.03, 0.012), x, y + 0.055, z + 0.112);
    const vx = 0.56, vz = 0.21, vy = at.top(vx, vz);
    P.add('turret', cylY(0.11, 0.13, 0.07, 14), vx, vy + 0.015, vz);
    P.add('turretDark', cylY(0.075, 0.075, 0.01, 14), vx, vy + 0.052, vz);
  }
  // the two mesh vents side by side over the rear roof, 0.9 m across at z -1.65
  for (const s of [-1, 1]) {
    const x = s * 0.235, z = -1.64, y = Math.min(at.top(x - 0.21, z), at.top(x + 0.21, z), at.top(x, z - 0.15), at.top(x, z + 0.15));
    P.add('turret', box(0.44, 0.04, 0.30), x, y + 0.008, z);
    P.add('turretDark', box(0.38, 0.006, 0.24), x, y + 0.029, z);
    P.add('turretDetail', openRackGrid(0.38, 0.24, 0.008, 9, 7), x, y + 0.032, z);
  }
  // the four-pane boxes lying on the shoulders ahead of the ring, the smoke dischargers' columns behind them, the
  // antennas at the rear corners
  for (const s of [-1, 1]) {
    // a 0.78 m slab across the 46 degree shoulder from z -0.08 to 0.70, toed in with the shell's plan, its outer face two
    // rows of two panes; seated by the shell's flank 0.42 m up at its ends
    {
      const z0 = -0.08, z1 = 0.70, ys = 0.42, roll = 0.80, half = 0.07;
      const xa = at.flank(s, ys, z0 + 0.06), xb = at.flank(s, ys, z1 - 0.06);
      const along = new THREE.Vector3(xb - xa, 0, z1 - z0 - 0.12).normalize();
      const normal = new THREE.Vector3(s * Math.cos(roll), Math.sin(roll), 0);
      normal.addScaledVector(along, -normal.dot(along)).normalize();
      const across = new THREE.Vector3().crossVectors(along, normal);
      const c = new THREE.Vector3((xa + xb) / 2, ys, (z0 + z1) / 2).addScaledVector(normal, half);
      P.addEquipment('turret', inBasis(box(0.14, 0.41, 0.78), normal, across, along), c.x, c.y, c.z);
      for (const du of [-0.10, 0.10]) for (const dv of [-0.18, 0.18]) {
        const p = c.clone().addScaledVector(normal, half + 0.004).addScaledVector(across, du).addScaledVector(along, dv);
        P.add('turretDark', inBasis(box(0.012, 0.15, 0.32), normal, across, along), p.x, p.y, p.z);
      }
      for (const dv of [-0.36, 0, 0.36]) {
        const p = c.clone().addScaledVector(normal, half + 0.006).addScaledVector(along, dv);
        P.add('turretDetail', inBasis(box(0.014, 0.41, 0.03), normal, across, along), p.x, p.y, p.z);
      }
    }
    // three 0.42 m tubes in a column on a bracket, pointing forward, out and up, their tips about z -0.45 and 1.28 m out
    {
      const tube = new THREE.Vector3(s * 0.42, 0.37, 0.83).normalize();
      const column = new THREE.Vector3(s * 0.13, -0.99, 0);
      column.addScaledVector(tube, -column.dot(tube)).normalize();
      const third = new THREE.Vector3().crossVectors(tube, column);
      const mid = new THREE.Vector3(s * 1.215, 0.553, -0.59);
      const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 3, r: 0.04, len: 0.42, splay: 0, pitch: 0, arc: 0,
        spacing: 0.155, base: false, seed: 1120 + s });
      smoke.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(column, third, tube));
      smoke.position.copy(mid);
      P.turretG.add(smoke);
      const foot = mid.clone().addScaledVector(tube, -0.23);
      P.add('turretDetail', inBasis(box(0.46, 0.10, 0.12), column, third, tube), foot.x, foot.y, foot.z);
      const cuff = mid.clone().addScaledVector(tube, -0.12);
      P.add('turretDetail', inBasis(box(0.44, 0.012, 0.03), column, third, tube), cuff.x, cuff.y, cuff.z);
      P.add('turretDetail', inBasis(cylZ(0.012, 0.30, 8), column, third, tube), foot.x + s * 0.03, foot.y - 0.06, foot.z + 0.08);
    }
    // the whips stand upright 0.99 m out at z -1.50, their tips 1.55 m over the ring datum
    P.snapGroup(`stb1-whip-${s < 0 ? 'left' : 'right'}`, () => {
      const wy = at.top(s * 0.99, -1.50) - 0.01;
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h: Math.max(0.70, 1.55 - wy - 0.12), rake: 0, seed: 1140 + s });
      whip.position.set(s * 0.99, wy, -1.50);
      P.turretG.add(whip);
    }, { reachM: 0.10, mode: 'down' });
    KIT.liftEye(P, 'turretDetail', s * 0.95, at.top(s * 0.95, -1.15), -1.15, s * 0.4);
  }
  // the rear rail 0.12 m behind the bustle's face, 1.50 m across, its returns into the face
  const xr = 0.75, rails = [0.34, 0.52] as const;
  const zr = Math.min(...rails.map((y) => at.aft(0, y))) - 0.12;
  for (const y of rails) P.add('turretDetail', box(2 * xr, 0.025, 0.025), 0, y, zr);
  for (const s of [-1, 1]) for (const y of rails) {
    const zf = at.aft(s * xr, y) + 0.015;
    P.add('turretDetail', box(0.025, 0.025, zf - zr), s * xr, y, (zr + zf) / 2);
  }
  for (let k = 0; k <= 4; k++) P.add('turretDetail', box(0.022, rails[1] - rails[0], 0.022), -xr + k * (xr / 2), (rails[0] + rails[1]) / 2, zr);
  P.decal('turret', 'number', 'STB-1', 0.18, [at.flank(-1, 0.15, -0.80) - 0.004, 0.15, -0.80], -Math.PI / 2, 0, -0.10);
}

/** The Type 74 family on the owner's model: the production Type 74 or the STB-1 prototype. */
export function buildType74Family(P: TankBuilderPort, variant: Type74Variant): void {
  const proto = variant === 'prototype';
  P.turretG.position.set(...TURRET_PIVOT);
  addHullBody(P, proto);
  if (proto) addPrototypeHullKit(P); else addProductionHullKit(P);
  addRunningGear(P);
  const shell = castTurretShell(P, variant);
  const at = shellProbe(shell);
  if (proto) addPrototypeTurretKit(P, at); else addProductionTurretKit(P, at);
  at.dispose();
  // L7A1 105 mm in its mask: the mask, its cover or rim, ports, collar, searchlight and the seat cut into the cast shell
  // (profiles/japaneseMantlets.ts); the tube's root inside the collar
  P.gunG.position.set(...TRUNNION);
  if (proto) addSTB1Mantlet(P, shell); else addType74Mantlet(P, shell);
  // the tube ahead of the trunnion. 266 (Main, from the height-gate lane): the Type 74 read 9.06 m overall against its
  // published 9.42 (en.wikipedia 9.41, militaryfactory 9.42; docs/references/tanks/type74.md), its 3.91 m tube 0.36 m
  // short, so it reaches 4.27 m (the STB-1's 4.10 makes its 9.25 against 9.20); its fume extractor keeps its place,
  // 1.74 m out
  const len = proto ? 4.10 : 4.27;
  KIT.buildGun(P, { len, r: 0.062, sleeve: false, evac: proto ? 0.50 : 1.74 / 4.27, evacR: 1.75, collar: false, baseR: 0.105 });
  P.add('gun', KIT.cylZ(0.068, 0.09, 10), 0, 0, len - 0.06);
  muzzleBore(P, { z: len - 0.015, r: 0.062 });
  P.topY = CROWN + 0.40;
}
