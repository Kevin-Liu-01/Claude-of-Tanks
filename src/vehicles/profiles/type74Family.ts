// 262 (owner, 2026-10-27, handing over an STB-1 model: "both the type 74 and stb should be based from this"): the Type 74
// family's one hull, running gear and cast turret, measured on that model, and each tank's own kit on them. The model is
// an authoring oracle only (public/models/community-candidates/stb_1_owner_20261027.glb, gitignored; docs/ATTRIBUTION.md):
// no vertex, index or texture of it is used, only the stations measured by rays and recorded in
// docs/references/tanks/stb1.md "Owner model". Its frame maps to ours by x and y 0.972 (the tracks' 3.27 to the
// published 3.18; Main's 262 ruling keeps the model's own proportions, so its 2.36 m crown stands at 2.30 m, where the
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
//     the commander's raised station with its remote gun, four-pane boxes on the turret's flanks, smoke dischargers on
//     its rear sides and two mesh vents on its rear roof. Track: chevron single-pin.
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
  // ENGINE DECK: the large grille in its frame between two narrow ones, an access plate ahead of them
  const grille = (x: number, w: number, panels: number) => {
    const z0 = -2.02, z1 = -2.88, d = z0 - z1;
    P.add('hullDark', box(w - 0.04, 0.006, d - 0.04), x, DECK + 0.001, (z0 + z1) / 2);
    for (const dz of [-1, 1]) P.add('hull', box(w, 0.026, 0.04), x, DECK + 0.011, (z0 + z1) / 2 + dz * (d / 2 - 0.02));
    for (const dx of [-1, 1]) P.add('hull', box(0.04, 0.026, d - 0.08), x + dx * (w / 2 - 0.02), DECK + 0.011, (z0 + z1) / 2);
    for (let k = 1; k < panels; k++) P.add('hull', box(w - 0.08, 0.022, 0.03), x, DECK + 0.009, z0 - (d * k) / panels);
    P.add('hullDetail', openRackGrid(w - 0.08, d - 0.08, 0.010, Math.round(w * 14), 12), x, DECK + 0.008, (z0 + z1) / 2);
  };
  grille(0, 0.84, 3);
  for (const s of [-1, 1]) grille(s * 0.78, 0.20, 1);
  P.add('hull', box(1.30, 0.016, 0.42), 0, DECK + 0.006, -1.72);
  P.add('hullDark', box(1.30, 0.012, 0.02), 0, DECK + 0.006, -1.505);
  // the mesh-topped boxes standing on the rear sponsons, flush with the deck, and the silencers in mesh guards behind
  // them on the slopes, their outlets turned out
  for (const s of [-1, 1]) {
    const x0 = DECK_EDGE, x1 = 1.53, z0 = -1.25, z1 = -2.55, top = DECK + 0.012;
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
  // hooks on the raked lower plate and the rail along the vertical plate's foot
  const rz = -3.41, rake = 0.41 / (STERN_FOOT_Y - BELLY);
  P.add('hull', box(0.72, 0.50, 0.02), -0.22, 1.22, rz - 0.01);
  P.add('hullDark', box(0.75, 0.53, 0.010), -0.22, 1.22, rz - 0.003);
  for (const dx of [-0.30, 0.30]) P.add('hullDetail', box(0.05, 0.10, 0.04), -0.22 + dx, 1.47, rz - 0.02);
  P.add('hullDetail', box(0.10, 0.16, 0.06), -0.62, 1.19, rz - 0.03);
  P.add('hullGlass', box(0.05, 0.12, 0.05), 0.40, 1.19, rz - 0.025);
  for (const [x, y] of [[-0.80, 1.38], [-0.93, 1.38], [0.86, 1.33]] as const) {
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
// (the foot ring stays 2 cm into the deck; the rest at the model's own proportions)
const RINGS: PolyMultiLoftRing[] = [
  { height: -0.02, inset: mirror18([0.88, 0.90, 0.97, 0.96, 0.94, 0.92, 0.89, 0.80, 0.58, 0.54]) },
  { height: 0.078, inset: mirror18([0.96, 0.97, 1.00, 0.99, 0.98, 0.98, 0.95, 0.88, 0.66, 0.62]) },
  { height: 0.175, inset: mirror18([1.00, 1.00, 0.99, 0.98, 0.98, 1.00, 0.99, 0.97, 0.85, 0.81]) },
  { height: 0.272, inset: mirror18([1.00, 0.98, 0.95, 0.94, 0.94, 0.96, 0.96, 0.98, 0.99, 1.00]) },
  { height: 0.370, inset: mirror18([0.98, 0.93, 0.90, 0.89, 0.87, 0.90, 0.91, 0.94, 0.98, 0.99]) },
  { height: 0.467, inset: mirror18([0.89, 0.86, 0.85, 0.83, 0.81, 0.83, 0.84, 0.87, 0.94, 0.98]) },
  { height: 0.564, inset: mirror18([0.72, 0.74, 0.77, 0.76, 0.76, 0.76, 0.78, 0.83, 0.91, 0.97]) },
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
    dispose() { material.dispose(); },
  };
}

function addProductionTurretKit(P: TankBuilderPort, at: ShellProbe): void {
  const { box, cylY, cupola, periscope, liftEye, openRackGrid } = KIT;
  // the commander's cupola on the right with the M2 on its ring (VH.14: every drawn gun works); the loader's low oval
  // hatch on the left; the gunner's and loader's periscopes; the rangefinder head's armoured end on the right shoulder
  const cy = at.top(0.45, -0.50) - 0.02;
  cupola(P, 'turret', 0.45, cy, -0.50, 0.21, 0.17, 6);
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 7, working: true, ridingCradle: true });
  m2.name = 'type74RoofM2';
  m2.position.set(0.49, cy + 0.15, -0.52);
  P.turretG.add(m2);
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

function addPrototypeTurretKit(P: TankBuilderPort, at: ShellProbe): void {
  const { box, cylY, torus, periscope, openRackGrid } = KIT;
  // the commander's raised station at -x (the model's side): a two-tier drum ringed with vision blocks, its sight box,
  // the remote gun on its ring (VH.14: every drawn gun works)
  {
    const x = -0.45, z = -0.55, y = at.top(x, z) - 0.02;
    P.addCupola('turret', cylY(0.30, 0.33, 0.10, 20), x, y + 0.05, z);
    P.addCupola('turret', cylY(0.25, 0.28, 0.08, 20), x, y + 0.14, z);
    P.add('turretDark', torus(0.25, 0.014, 24), x, y + 0.18, z);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      P.add('turretGlass', box(0.09, 0.05, 0.03), x + Math.sin(a) * 0.31, y + 0.075, z + Math.cos(a) * 0.31, 0, a, 0);
    }
    P.addCupola('turret', box(0.30, 0.13, 0.22), x, y + 0.245, z + 0.04);
    P.add('turretDark', box(0.22, 0.07, 0.022), x, y + 0.25, z + 0.155);
    P.add('turretGlass', box(0.16, 0.045, 0.016), x, y + 0.25, z + 0.168);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.82, elev: 0.06,
      shield: false, ammo: true, ring: { r: 0.15, stubs: 3 }, seed: 1110, working: true, ridingCradle: true });
    mg.position.set(x + 0.20, y + 0.18, z - 0.06);
    P.turretG.add(mg);
  }
  // the loader's round hatch at +x, its ring, lid and hinge, a periscope ahead of it
  {
    const x = 0.45, z = -0.25, y = at.top(x, z) - 0.015;
    P.add('turret', cylY(0.25, 0.27, 0.06, 20), x, y + 0.03, z);
    P.add('turret', cylY(0.22, 0.22, 0.04, 20), x, y + 0.08, z);
    P.add('turretDark', torus(0.235, 0.012, 24), x, y + 0.06, z);
    P.add('turretDetail', box(0.06, 0.05, 0.16), x - 0.24, y + 0.08, z);
    P.snapGroup('stb1-loader-periscope', () => periscope(P, 'turretDetail', x - 0.05, at.top(x - 0.05, 0.18) + 0.03, 0.18, -0.2), { reachM: 0.10, mode: 'down' });
  }
  // the gunner's square sight head forward at -x and the small round vent forward at +x
  {
    const x = -0.40, z = 0.40, y = at.top(x, z);
    P.add('turret', box(0.20, 0.12, 0.20), x, y + 0.03, z);
    P.add('turretDark', box(0.16, 0.05, 0.02), x, y + 0.055, z + 0.10);
    P.add('turretGlass', box(0.12, 0.03, 0.012), x, y + 0.055, z + 0.112);
    const vy = at.top(0.36, 0.25);
    P.add('turret', cylY(0.09, 0.11, 0.07, 14), 0.36, vy + 0.015, 0.25);
    P.add('turretDark', cylY(0.06, 0.06, 0.01, 14), 0.36, vy + 0.052, 0.25);
  }
  // the two mesh vents on the rear roof
  for (const s of [-1, 1]) {
    const x = s * 0.27, z = -1.40, y = Math.min(at.top(x - 0.18, z), at.top(x + 0.18, z), at.top(x, z - 0.16), at.top(x, z + 0.16));
    P.add('turret', box(0.42, 0.04, 0.36), x, y + 0.008, z);
    P.add('turretDark', box(0.36, 0.006, 0.30), x, y + 0.029, z);
    P.add('turretDetail', openRackGrid(0.36, 0.30, 0.008, 9, 8), x, y + 0.032, z);
  }
  // the four-pane boxes on the flanks, the smoke dischargers on the rear sides, the antennas, the rear rail
  for (const s of [-1, 1]) {
    const y = 0.25, z = -0.22, roll = s * 0.30;
    const nx = Math.cos(roll) * s, ny = Math.sin(Math.abs(roll)), ux = -Math.sin(roll), uy = Math.cos(roll);
    const cx = at.flank(s, y, z) + s * 0.035;
    P.addEquipment('turret', box(0.11, 0.29, 0.60), cx, y, z, 0, 0, roll);
    for (const dy of [-0.068, 0.068]) for (const dz of [-0.14, 0.14]) {
      P.add('turretDark', box(0.012, 0.11, 0.24), cx + nx * 0.056 + ux * dy, y + ny * 0.056 + uy * dy, z + dz, 0, 0, roll);
    }
    const sz = -1.10, sy = 0.475;
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 3, splay: s * 0.95, pitch: -0.35, seed: 1120 + s });
    smoke.position.set(at.flank(s, sy, sz) - s * 0.02, sy, sz);
    P.turretG.add(smoke);
    P.snapGroup(`stb1-whip-${s < 0 ? 'left' : 'right'}`, () => {
      const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.98, rake: s * 0.05, seed: 1140 + s });
      whip.position.set(s * 0.74, at.top(s * 0.74, -1.62) - 0.01, -1.62);
      P.turretG.add(whip);
    }, { reachM: 0.10, mode: 'down' });
    KIT.liftEye(P, 'turretDetail', s * 0.95, at.top(s * 0.95, -1.15), -1.15, s * 0.4);
  }
  // the rear rail round the bustle's face, its returns into the face
  const zr = -2.30, rails = [0.27, 0.50] as const;
  for (const y of rails) P.add('turretDetail', box(1.30, 0.025, 0.025), 0, y, zr);
  for (const s of [-1, 1]) for (const y of rails) P.add('turretDetail', box(0.025, 0.025, 0.26), s * 0.64, y, zr + 0.12);
  for (let k = 0; k <= 4; k++) P.add('turretDetail', box(0.022, rails[1] - rails[0], 0.022), -0.64 + k * 0.32, (rails[0] + rails[1]) / 2, zr);
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
  const len = proto ? 4.10 : 3.91;
  KIT.buildGun(P, { len, r: 0.062, sleeve: false, evac: proto ? 0.50 : 0.445, evacR: 1.75, collar: false, baseR: 0.105 });
  P.add('gun', KIT.cylZ(0.068, 0.09, 10), 0, 0, len - 0.06);
  muzzleBore(P, { z: len - 0.015, r: 0.062 });
  P.topY = CROWN + 0.40;
}
