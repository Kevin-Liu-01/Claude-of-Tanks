// src/world/maps/regional/lorrainMill.ts — Amberford's water mill on the Moselle reach above the town, in the Lorraine
// kit (props census #22, Lane C 2026-10-15). Three structures, each built through the kit's own pipeline
// (index.ts buildRegionalParts: the building's tints, weathering, war wear and its plan for the damage seam):
//
//  - the moulin: a bank mill of two storeys under the low canal-tile roof of the Lorraine plain, its ridge along the
//    river, the mill room's rubble walls below and the miller's crépi above, Jaumont quoins and surrounds, the double
//    mill doors and the sack door over them on the lane front with the hoist beam under the eave, the iron tie anchors,
//    a spare millstone leaning by the door; on the river side the wheel's axle enters the wall through a hole cut for it.
//    Every opening is cut through its wall with reveals (house.ts buildHouse); the house reads, breaks and falls as a
//    house through the sections path (damage.ts describeHouse reads the plan).
//  - the wheel: a breastshot wheel in its masonry race against the house wall, two shrouds with their arms on an iron
//    hub, the floats between the shrouds, the oak axle banded in iron from its bearing on the race wall into the house,
//    the still water of the race between the walls.
//  - the vanne: the weir's sluice between two dressed piers with their cutwaters, the plank gate in iron grooves raised
//    on two toothed racks through the oak headstock, the pinion's iron standard and its hand wheel.
//
// Each is built in its own frame: y up from the frame's base, the caller places it (mapKits.ts addWeirAndMill).
import * as THREE from 'three';
import { getDeviceTier } from '../../../engine/quality.ts';
import {
  LocalFrame, PartSink, faceBox, facePoint, hashSeed, pick, rgb, shade, streamFrom, REGIONAL_BUCKETS,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { buildRegionalParts } from './index.ts';
import { millAxle, ringSolid, waterWheel } from './millWorks.ts';
import { LORRAIN_STYLE } from './lorrain.ts';
import type { RegionalBuildContext, RegionalBuilder, RegionalGround } from './types.ts';

/** The Lorraine kit's shutter and door paints (lorrain.ts), the painted joinery, the iron, the oak and the hemp. */
const SHUTTERS: readonly Rgb[] = [0x7a8a78, 0xa4a69e, 0x6a5040, 0x6a7e8e, 0x7a3a30, 0x8a9a7a].map(rgb);
const DOORS: readonly Rgb[] = [0x5e4632, 0x3f5a46, 0x55687a, 0x8a6a3a, 0x7a3a2c].map(rgb);
const FRAME = rgb(0xd6d2c6), IRON = rgb(0x1e1e1e), OAK = rgb(0x5a4632), WET_OAK = rgb(0x3e3226), HEMP = rgb(0x9a8a66);

/** The mill house's frame: W along the river (local x), D across it (local z, +z the lane front). */
export const MILL_HOUSE_W = 7.6;
export const MILL_HOUSE_D = 9.2;
const PLINTH = 0.35, STOREY0 = 3.1, STOREY1 = 2.6;
/** The wheel: its radius, the half width over its shrouds, and the gap from its centre to the house plinth's face. */
export const MILL_WHEEL_R = 2.3;
const WHEEL_HALF = 0.46;
export const MILL_WHEEL_OFFSET = 0.9;

const canal = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.32, verge: 0.18, thickness: 0.16, bucket: 'roof', ridge: 'round' });

/** The Jaumont quoins at a body's four corners, long and short stones in turn (lorrain.ts quoins). */
function quoins(sink: PartSink, b: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number): void {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    let k = 0;
    for (let y = y0; y < y1 - 0.2; y += 0.42, k++) {
      const lx = k % 2 ? 0.28 : 0.52, lz = k % 2 ? 0.52 : 0.28, top = Math.min(y1, y + 0.4);
      sink.quoin('stone', x - sx * lx, y, z - sz * lz, x + sx * 0.04, top, z + sz * 0.04, sx, sz, { decor: true });
    }
  }
}

/** The iron tie anchors on a front at a floor: an S of flat bar over each joist end (lorrain.ts anchors). */
function anchors(sink: PartSink, face: Face, y: number, us: readonly number[]): void {
  const fine = { colour: IRON, decor: true, fine: true } as const;
  for (const u of us) {
    faceBox(sink, 'structureMetal', face, u, y + 0.16, 0.025, 0.05, 0.36, 0.03, fine);
    for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + s * 0.1, y + 0.16 + s * 0.17, 0.025, 0.2, 0.05, 0.03, fine);
  }
}

interface MillHouseParams {
  /** the local x sign of downstream (+1: the river flows toward +x) */
  down: 1 | -1;
  /** the wheel's axle where it meets the river wall: its local x and height over the base; null builds no hole */
  axle: { x: number; y: number } | null;
}

/** The moulin (see the head of the file). Built a quarter turned like the maison: the house's ridge (its z) is local x. */
function moulin(ctx: RegionalBuildContext, p: MillHouseParams): RegionalParts {
  const sink = new PartSink([ctx.rng() * 7.31, ctx.rng() * 5.17]);
  const rng = ctx.rng, look = ctx.variant;
  const shutter = pick(rng, SHUTTERS), door = pick(rng, DOORS);
  const wall: RegionalBucket = ctx.wallBucket === 'plaster2' || ctx.wallBucket === 'plaster3' ? ctx.wallBucket : 'plaster';
  const dwelling: WindowStyle = {
    frame: FRAME, frameWidth: 0.06, frameOut: 0.05, bars: 'six',
    surround: { bucket: 'stone', width: 0.17, out: 0.05, lintel: 0.24 }, sill: { bucket: 'stone', out: 0.1 },
    shutters: { colour: shade(shutter, 0.86 + rng() * 0.26), kind: 'plank', closed: 0.22 },
  };
  // the mill room's windows: two lights behind iron bars, no shutters
  const millRoom: WindowStyle = { ...dwelling, bars: 'two', shutters: null };
  const W = MILL_HOUSE_W, D = MILL_HOUSE_D, up = -p.down;
  const floors = [PLINTH, PLINTH + STOREY0];
  const openings: Opening[] = [];
  // the lane front (the house's left face: u along local +x): the mill doors toward the upstream end with the sack door
  // over them, a window of the mill room and one of the dwelling toward the downstream end
  const doorU = up * 1.7, winU = -up * 1.9;
  openings.push({ face: 'left', storey: 0, kind: 'gate', u: doorU, w: 1.9, y0: 0, h: 2.45 });
  openings.push({ face: 'left', storey: 0, kind: 'window', u: winU, w: 0.9, h: 1.2, y0: 0.95 });
  openings.push({ face: 'left', storey: 1, kind: 'loft', u: doorU, w: 1.05, h: 1.6, y0: 0.15 });
  openings.push({ face: 'left', storey: 1, kind: 'window', u: winU, w: 0.85, h: 1.15, y0: 0.75 });
  // the river face (right: u along local -x): the axle's hole, and the dwelling's window clear of the wheel
  const axleStorey = p.axle ? (p.axle.y < floors[1] - 0.45 ? 0 : 1) : -1;
  if (p.axle && axleStorey >= 0) {
    const y0 = p.axle.y - floors[axleStorey] - 0.28, top = axleStorey === 0 ? STOREY0 : STOREY1;
    if (y0 > 0.2 && y0 + 0.56 < top - 0.25) openings.push({ face: 'right', storey: axleStorey, kind: 'loft', u: -p.axle.x, w: 0.56, h: 0.56, y0 });
  }
  const wheelX = p.axle?.x ?? 0;
  for (const x of [2.75, -2.75]) {
    if (Math.abs(x - wheelX) < MILL_WHEEL_R + 0.55) continue;
    openings.push({ face: 'right', storey: 1, kind: 'window', u: -x, w: 0.75, h: 1.1, y0: 0.75 });
    break;
  }
  // the gables: the upstream one is the dwelling's (its door at the lane end, a window each storey), the downstream one
  // stands in the bank (a window up in the dwelling). 'back' is the house's -z (local -x), its u toward local +z.
  const upGable = up < 0 ? 'back' : 'front', downGable = up < 0 ? 'front' : 'back';
  const lane = upGable === 'back' ? 1 : -1;
  openings.push({ face: upGable, storey: 0, kind: 'door', u: lane * 2.6, w: 0.95, y0: 0, h: 2.1 });
  openings.push({ face: upGable, storey: 0, kind: 'window', u: -lane * 1.0, w: 0.8, h: 1.0, y0: 1.0 });
  for (const u of [-1.6, 1.6]) openings.push({ face: upGable, storey: 1, kind: 'window', u, w: 0.8, h: 1.1, y0: 0.75 });
  openings.push({ face: downGable, storey: 1, kind: 'window', u: 0, w: 0.8, h: 1.1, y0: 0.75 });
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => {
      const r = s.recess;
      if (o.kind === 'loft' && o.w < 0.7) {
        // the axle's hole: the mill room's dark round the shaft at the back of its reveal
        faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -r + 0.01, o.w, o.h, 0.02, { decor: true });
        return;
      }
      if (o.kind === 'loft') {
        // the sack door: a ledged plank leaf in its dressed frame, no steps (the hoist serves it)
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.16, out: 0.05 }, steps: null, leafKind: 'plank' });
        return;
      }
      if (o.storey === 0) {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, millRoom, rng, 0);
        // three iron bars in the reveal, from its sill to its head
        for (const k of [-1, 0, 1]) faceBox(s, 'structureMetal', face, o.u + k * o.w * 0.27, y0 + o.y0 + o.h / 2, -Math.min(r, 0.12), 0.03, o.h, 0.03,
          { colour: IRON, decor: true, fine: true }, 'caps');
        return;
      }
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, dwelling, rng, 0.4);
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(door, 0.92), { bucket: 'stone', width: 0.26, out: 0.06 }, { wicket: false });
        // the dressed lintel stone over the mill doors and its keystone
        faceBox(s, 'stone', face, o.u, y0 + o.y0 + o.h + 0.17, 0.04, o.w + 0.62, 0.34, 0.08, { decor: true, fineSides: true });
        faceBox(s, 'stone', face, o.u, y0 + o.y0 + o.h + 0.24, 0.07, 0.34, 0.46, 0.1, { decor: true, fineSides: true });
        return;
      }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: door, frame: { bucket: 'stone', width: 0.2, out: 0.06 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, frame.floors[o.storey] + o.y0);
    },
  };
  sink.placed(Math.PI / 2, 0, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: D, d: W, plinth: { h: PLINTH, out: 0.06, bucket: 'stone' },
      storeys: [{ h: STOREY0, wall: 'stone' }, { h: STOREY1, wall }], roof: canal(24 + rng() * 3), gableBucket: wall, openings,
      // the dwelling's stack on the ridge over the upstream gable
      chimneys: [{ x: -0.3, z: up * (W / 2 - 1.1), sx: 0.6, sz: 0.6, above: 0.8, bucket: wall, cap: 'slab' }],
      gutters: { colour: rgb(0x6a6e6c) }, verge: null, reveal: 0.3, core: 'rubble',
    }, dialect);
    quoins(sink, frame.bodies[0], PLINTH, frame.eaveY);
    const f = frame.faces.left;
    anchors(sink, f, frame.floors[1] - 0.1, [-up * 0.4, -up * 3.0]);
    // the sack hoist: an oak beam out from under the eave over the sack door, its iron pulley, the hemp rope and hook
    const beamY = frame.eaveY - 0.48;
    faceBox(sink, 'structureWood', f, doorU, beamY, 0.6, 0.16, 0.2, 1.2, { colour: OAK, decor: true });
    faceBox(sink, 'structureMetal', f, doorU, beamY - 0.16, 1.0, 0.03, 0.14, 0.03, { colour: IRON, decor: true, fine: true });
    sink.cylinder('structureMetal', facePoint(f, doorU - 0.035, beamY - 0.3, 1.0), 'z', 0.07, 0.12, 10, { colour: IRON, decor: true });
    const ropeTop = beamY - 0.3, ropeBottom = frame.floors[1] - 0.2 + look() * 0.3;
    // the rope comes over the pulley from the loft and hangs on its outer side
    faceBox(sink, 'structureWood', f, doorU, (ropeTop + ropeBottom) / 2, 1.12, 0.025, ropeTop - ropeBottom, 0.025, { colour: HEMP, decor: true });
    faceBox(sink, 'structureMetal', f, doorU, ropeBottom - 0.06, 1.12, 0.05, 0.12, 0.03, { colour: IRON, decor: true, fine: true });
    // the spare millstone on its edge by the mill doors, its eye open through
    const stoneU = doorU - up * 1.85, stoneR = 0.6;
    ringSolid(sink, 'stone', facePoint(f, stoneU, stoneR + 0.02, 0.38), [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.13, stoneR, 0.28, 18,
      { decor: true, tint: [0.92, 0.93, 0.96] });
  });
  return sink.finish();
}

interface MillWheelParams {
  /** the race's water over the frame's base, the wheel's centre over it, and the race's length along the river */
  water: number;
  centre: number;
  length: number;
  /** the local x sign of the race's low end (its end wall) */
  lowEnd: 1 | -1;
}

/** The wheel in its race (see the head of the file): local z toward the house (its plinth face at MILL_WHEEL_OFFSET). */
function roue(ctx: RegionalBuildContext, p: MillWheelParams): RegionalParts {
  const sink = new PartSink([ctx.rng() * 7.31, ctx.rng() * 5.17]);
  const R = MILL_WHEEL_R, cy = p.centre, L = p.length, top = p.water + 0.55;
  const zo = WHEEL_HALF + 0.3, zi = WHEEL_HALF + 0.08, zHouse = MILL_WHEEL_OFFSET;
  // the race: its outer wall, the revetment against the house, the end wall at the low end, their copings
  sink.span('stone', -L / 2, 0, -zo - 0.5, L / 2, top, -zo);
  // (its back to the house wall's face, over the plinth's 6 cm: no seam between them)
  sink.span('stone', -L / 2, 0, zi, L / 2, top, zHouse + 0.06);
  const end = p.lowEnd * (L / 2);
  sink.span('stone', Math.min(end, end + p.lowEnd * 0.5), 0, -zo - 0.5, Math.max(end, end + p.lowEnd * 0.5), top, zHouse);
  for (const [z0, z1] of [[-zo - 0.56, -zo + 0.04], [zi - 0.05, zHouse]] as const) sink.band('stone', -L / 2 - 0.03, top, z0, L / 2 + 0.03, top + 0.09, z1, { decor: true });
  // the still water between the walls (dressing; the glass bucket's dark reflection)
  sink.quad('glass', [-L / 2, p.water, zi], [L / 2, p.water, zi], [L / 2, p.water, -zo], [-L / 2, p.water, -zo], { decor: true });
  // the bearing: a stone pier on the outer wall up to the oak plummer block under the axle, its iron cap
  const bearingZ0 = -zo - 0.48, bearingZ1 = -zo - 0.02;
  sink.span('stone', -0.36, top, bearingZ0, 0.36, cy - 0.36, bearingZ1);
  sink.span('structureWood', -0.3, cy - 0.36, bearingZ0 + 0.04, 0.3, cy - 0.17, bearingZ1 - 0.04, { colour: WET_OAK });
  sink.span('structureMetal', -0.22, cy + 0.15, bearingZ0 + 0.1, 0.22, cy + 0.2, bearingZ1 - 0.1, { colour: IRON, decor: true });
  // the axle from over the bearing through the house wall (its hole is the house's), banded in iron; the wheel on it
  sink.placed(0, 0, cy, 0, () => {
    millAxle(sink, bearingZ0 + 0.06, zHouse + 0.36, WET_OAK, IRON, [-WHEEL_HALF - 0.12, WHEEL_HALF + 0.12, zHouse - 0.05]);
    waterWheel(sink, { R, half: WHEEL_HALF, kind: 'breast', wood: WET_OAK, boards: OAK, iron: IRON, solid: true });
  });
  return sink.finish();
}

interface SluiceParams {
  /** the river's surface over the frame's base (the weir's bed) */
  water: number;
  /** the local z sign of downstream */
  down: 1 | -1;
}
/** The sluice's opening between its piers (m) and a pier's breadth across the river. */
export const SLUICE_GATE_W = 1.6;
export const SLUICE_PIER_W = 0.9;

/** The vanne (see the head of the file): local x across the river, z along the flow. */
function vanne(ctx: RegionalBuildContext, p: SluiceParams): RegionalParts {
  const sink = new PartSink([ctx.rng() * 7.31, ctx.rng() * 5.17]);
  const gw = SLUICE_GATE_W, pw = SLUICE_PIER_W, pl = 2.0, ph = p.water + 1.9, upZ = -p.down;
  for (const side of [-1, 1]) {
    const x0 = side * gw / 2, x1 = side * (gw / 2 + pw), lo = Math.min(x0, x1), hi = Math.max(x0, x1), xc = (lo + hi) / 2;
    sink.span('stone', lo, 0, -pl / 2, hi, ph, pl / 2);
    // the cutwater on the upstream face, to under the coping
    const zf = upZ * pl / 2, zn = upZ * (pl / 2 + 0.55);
    const tri: Vec3[] = [[lo, 0, zf], [hi, 0, zf], [xc, 0, zn]];
    const area = (tri[1][0] - tri[0][0]) * (tri[2][2] - tri[0][2]) - (tri[2][0] - tri[0][0]) * (tri[1][2] - tri[0][2]);
    sink.prism('stone', area < 0 ? tri : [tri[0], tri[2], tri[1]], [0, 1, 0], ph - 0.3);
    sink.band('stone', lo - 0.05, ph, -pl / 2 - 0.05, hi + 0.05, ph + 0.12, pl / 2 + 0.05);
    // the iron grooves the gate runs in, on the pier's face to the opening
    for (const gz of [-0.09, 0.09]) sink.span('structureMetal', x0 - side * 0.035, 0.15, gz - 0.025, x0, ph, gz + 0.025, { colour: IRON, decor: true });
  }
  // the gate's sill between the piers
  sink.span('stone', -gw / 2, 0, -pl / 2, gw / 2, 0.14, pl / 2);
  // the gate: four planks in the grooves, raised a little off its sill; its battens and strap on the downstream face
  const g0 = p.water + 0.15, plank = 0.3;
  for (let k = 0; k < 4; k++) {
    sink.span('structureWood', -gw / 2 - 0.02, g0 + k * plank + 0.006, -0.05, gw / 2 + 0.02, g0 + (k + 1) * plank - 0.006, 0.05,
      { colour: shade(WET_OAK, 0.9 + ((k * 7) % 3) * 0.07) });
  }
  const gTop = g0 + 4 * plank;
  for (const bx of [-0.45, 0.45]) sink.span('structureWood', bx - 0.06, g0 + 0.05, p.down * 0.05, bx + 0.06, gTop - 0.05, p.down * 0.09, { colour: WET_OAK, decor: true });
  sink.span('structureMetal', -gw / 2 + 0.05, gTop - 0.14, p.down * 0.09, gw / 2 - 0.05, gTop - 0.1, p.down * 0.1, { colour: IRON, decor: true });
  // the headstock across the pier tops
  const hs0 = ph + 0.12, hs1 = hs0 + 0.3;
  sink.span('structureWood', -(gw / 2 + pw), hs0, -0.16, gw / 2 + pw, hs1, 0.16, { colour: OAK });
  // the two toothed racks from the gate's head up through the headstock
  const rackTop = hs1 + 0.55 + (gTop - g0) * 0.4;
  for (const rx of [-0.45, 0.45]) {
    sink.span('structureMetal', rx - 0.03, gTop - 0.25, -0.02, rx + 0.03, rackTop, 0.02, { colour: IRON });
    for (let y = gTop + 0.05; y < rackTop - 0.05; y += 0.09) sink.span('structureMetal', rx - 0.025, y, 0.02, rx + 0.025, y + 0.04, 0.045, { colour: IRON, decor: true, fine: true });
  }
  // the pinion's iron standard on the headstock, its shaft across the racks, and the hand wheel on its end
  sink.span('structureMetal', -0.7, hs1, -0.15, 0.7, hs1 + 0.05, 0.15, { colour: IRON, decor: true });
  const shaftY = hs1 + 0.34, shaftZ = 0.1;
  for (const sx of [-0.62, 0.62]) sink.span('structureMetal', sx - 0.04, hs1 + 0.05, shaftZ - 0.07, sx + 0.04, shaftY + 0.08, shaftZ + 0.07, { colour: IRON });
  sink.cylinder('structureMetal', [-0.72, shaftY, shaftZ], 'x', 1.62, 0.035, 8, { colour: IRON, decor: true });
  for (const rx of [-0.45, 0.45]) sink.cylinder('structureMetal', [rx - 0.035, shaftY, shaftZ], 'x', 0.07, 0.09, 10, { colour: IRON, decor: true });
  const hw: Vec3 = [0.9, shaftY, shaftZ];
  ringSolid(sink, 'structureMetal', hw, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.27, 0.31, 0.03, 16, { colour: IRON, decor: true });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, c = Math.cos(a), s = Math.sin(a);
    sink.box('structureMetal', [hw[0] + 0.015, shaftY + c * 0.15, shaftZ + s * 0.15], [0.14, 0.015, 0.012], { colour: IRON, decor: true, fine: true },
      new LocalFrame([0, c, s], [0, -s, c], [1, 0, 0], [0, 0, 0]));
  }
  return sink.finish();
}

/** Where a mill structure stands: its world base and yaw (three's rotateY), the map, its seed and the ground. */
interface MillPlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  mapId: string;
  seed: number;
  /** the terrain's height at a world point (the wall-foot strip lies on it) */
  heightAt?: (x: number, z: number) => number;
}

function buildPiece(id: string, place: MillPlacement, info: { w: number; d: number; h: number }, build: RegionalBuilder): RegionalParts {
  const style = { ...LORRAIN_STYLE, builders: { [id]: build } };
  const c = Math.cos(place.yaw), s = Math.sin(place.yaw);
  const heightAt = place.heightAt;
  const ground: RegionalGround | undefined = heightAt
    ? { at: (x, z) => heightAt(place.x + x * c + z * s, place.z - x * s + z * c) - place.y } : undefined;
  const ctx: RegionalBuildContext = {
    structureId: id, info, bounds: { minX: -info.w / 2, maxX: info.w / 2, minZ: -info.d / 2, maxZ: info.d / 2, maxY: info.h },
    wallBucket: 'plaster', rng: streamFrom(hashSeed(`lorrain:${place.mapId}:${id}`, place.seed)),
    variant: streamFrom(hashSeed(`lorrain:variant:${place.mapId}:${id}`, place.seed)),
    mapId: place.mapId, snowCap: false, tier: getDeviceTier() === 'mobile' ? 'mobile' : 'desktop',
    x: place.x, z: place.z, yaw: place.yaw, ...(ground ? { ground } : {}),
  };
  return buildRegionalParts(style, ctx, streamFrom(hashSeed(`lorrain:weather:${place.mapId}:${id}`, place.seed)));
}

/** The mill house in its frame (the plan rides the parts for the damage seam: index.ts regionalKitPlanOf). */
export function buildMillHouse(place: MillPlacement, down: 1 | -1, axle: { x: number; y: number } | null): RegionalParts {
  return buildPiece('mill-house', place, { w: MILL_HOUSE_W, d: MILL_HOUSE_D, h: PLINTH + STOREY0 + STOREY1 + 2.4 },
    (ctx) => moulin(ctx, { down, axle }));
}

/** The wheel and its race in their frame. */
export function buildMillWheel(place: MillPlacement, water: number, centre: number, length: number, lowEnd: 1 | -1): RegionalParts {
  return buildPiece('mill-wheel', place, { w: length + 1, d: 2.6, h: centre + MILL_WHEEL_R },
    (ctx) => roue(ctx, { water, centre, length, lowEnd }));
}

/** The weir's sluice in its frame. */
export function buildWeirSluice(place: MillPlacement, water: number, down: 1 | -1): RegionalParts {
  return buildPiece('weir-sluice', place, { w: SLUICE_GATE_W + 2 * SLUICE_PIER_W, d: 3.1, h: water + 3.4 },
    (ctx) => vanne(ctx, { water, down }));
}

/** The plain dressing bucket a regional bucket's parts go to where a caller has no kit buckets (a sandboxed dressing). */
const PLAIN: Readonly<Record<string, readonly string[]>> = {
  structureWood: ['wood'], structureMetal: ['dark'], regionalStone: ['stone'], regionalRoof: ['roof'],
  regionalPlaster: ['plaster'], regionalPlaster2: ['plaster2', 'plaster'], regionalPlaster3: ['plaster3', 'plaster'],
  glass: ['glass', 'dark'], curtain: ['curtain', 'glass', 'dark'], plaster2: ['plaster2', 'plaster'], plaster3: ['plaster3', 'plaster'],
};

/**
 * A mill structure's parts placed into a caller's plain buckets (no structure sink: the receipts' sandboxed dressings),
 * each geometry carrying only its position, normal and uv streams so it merges with the plain dressing.
 */
export function mergeMillPlain(parts: RegionalParts, place: Pick<MillPlacement, 'x' | 'y' | 'z' | 'yaw'>,
  buckets: Record<string, THREE.BufferGeometry[] | undefined>): void {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(place.x, place.y, place.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), place.yaw), new THREE.Vector3(1, 1, 1));
  for (const name of REGIONAL_BUCKETS) {
    const list = parts[name];
    if (!list?.length) continue;
    const target = (PLAIN[name] ?? [name]).map((key) => buckets[key]).find((b) => !!b);
    for (const g of list) {
      if (!target) { g.dispose(); continue; }
      const plain = new THREE.BufferGeometry();
      for (const stream of ['position', 'normal', 'uv']) {
        const attribute = g.getAttribute(stream);
        if (attribute) plain.setAttribute(stream, attribute);
      }
      if (g.index) plain.setIndex(g.index);
      plain.applyMatrix4(m);
      target.push(plain);
    }
  }
}
