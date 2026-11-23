// src/world/maps/regional/ruhr.ts — the coalfield railway kit (Cinder Junction: a junction on the Ruhr / Upper Silesian
// coalfield). Soot-darkened red brick with bands of yellow brick, segmental-arched windows, slate roofs: the station
// building with its gabled central block, low wings and a platform canopy on cast columns; long goods sheds with a
// loading dock under a deep canopy; the brick water tower carrying its tank house; colliery cottages in pairs with
// two doors and a dormer each; the colony's terraced rows (terraceLayout.ts); a shelled brick shell.
import { PartSink, alongPlot, faceBox, plotAxes, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, holedPolygon, leanTo, roofGeometry, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofGeometry, type RoofPatch, type RoofRelief, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { dentilCornice, facadeOn, faceSlab, pilaster, sillStreaks, trimRing, trimRun, windowHead } from './facade.ts';
import { DOME_MIN_SEGMENTS, smoothProfile } from './domes.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { factoryStack } from './shared.ts';
import { terraceLayout, terraceUnits } from '../terraceLayout.ts';

const YELLOW_BRICK = 'plaster2' as const; // the bands and dressings: the map's second render family
const FRAME = rgb(0xc8c2b4), DOOR: readonly Rgb[] = [0x3e5a46, 0x6a2c22, 0x3e4e5a].map(rgb);
const IRON = rgb(0x3a4246);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const WINDOW: WindowStyle = { frame: FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: { bucket: YELLOW_BRICK, width: 0.14, out: 0.05, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null,
  // (facade craft, desktop: the segmental arch of yellow brick the flat lintel stood in for, a keystone at its crown)
  head: { kind: 'segment', bucket: YELLOW_BRICK, h: 0.15, out: 0.05, ext: 0, rise: 0.12 } };

/**
 * A coalfield building's brick masonry (facade craft, desktop): a corbelled dentil cornice under the eaves of the
 * `eaves` faces, returned round the corners; brick piers at the corners and between the bays of the `piers` faces;
 * a round vent in a yellow-brick ring high in each gable.
 */
function brickMasonry(frame: HouseFrame, sink: PartSink, eaves: readonly ('left' | 'right' | 'front' | 'back')[],
  piers: readonly ('left' | 'right' | 'front' | 'back')[], vents: boolean, cornice: 'dentil' | 'console' = 'dentil'): void {
  const base = frame.floors[0], top = frame.eaveY;
  for (const name of eaves) {
    const face = frame.faces[name], half = face.width / 2;
    if (cornice === 'dentil') { dentilCornice(sink, 'stone', face, -half, half, top - 0.31, { ret: 0.35 }); continue; }
    // (dome-detail-275) a works' console frieze: a plain course, brick consoles a long pace apart standing out under the
    // corbelled courses over them (the dentils of a cottage's eave, at a hall's scale)
    trimRun(sink, 'stone', face, -half, half, top - 0.46, [{ h: 0.08, out: 0.05 }], { ret: 0.35 });
    const n = Math.max(2, Math.round(2 * half / 1.15));
    for (let k = 0; k < n; k++) faceBox(sink, 'stone', face, -half + 2 * half * (k + 0.5) / n, top - 0.27, 0.07, 0.2, 0.22, 0.14, { decor: true, fine: 'near' });
    trimRun(sink, 'stone', face, -half, half, top - 0.16, [{ h: 0.08, out: 0.16 }, { h: 0.08, out: 0.21 }], { ret: 0.35 });
  }
  for (const name of piers) {
    const face = frame.faces[name], half = face.width / 2;
    const us = frame.spec.openings.filter((o) => o.face === name && o.storey === 0).map((o) => o.u).sort((a, b) => a - b);
    const at = [-half + 0.25, half - 0.25];
    for (let k = 0; k + 1 < us.length; k++) if (us[k + 1] - us[k] > 2.2) at.push((us[k] + us[k + 1]) / 2);
    for (const u of at) pilaster(sink, 'stone', face, u, base, top - (eaves.includes(name) ? 0.31 : 0.05), 0.48, 0.07);
  }
  if (vents && frame.roof.gable) {
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name], vy = top + (frame.roof.ridgeY - top) * 0.5;
      // the yellow-brick ring round the vent: its twelve voussoirs about the opening
      for (let k = 0; k < 12; k++) {
        const a0 = Math.PI * 2 * k / 12, a1 = Math.PI * 2 * (k + 1) / 12;
        faceSlab(sink, YELLOW_BRICK, face, [[Math.cos(a0) * 0.48, vy + Math.sin(a0) * 0.48], [Math.cos(a1) * 0.48, vy + Math.sin(a1) * 0.48],
          [Math.cos(a1) * 0.36, vy + Math.sin(a1) * 0.36], [Math.cos(a0) * 0.36, vy + Math.sin(a0) * 0.36]], 0, 0.04);
      }
      // (props census #4, lane B 2026-10-14: the vent was a dark disc painted on the gable) the vent cut through the gable
      // (the dialect's gableOpenings), its louvres set back in it
      for (const dy of [-0.2, -0.05, 0.1]) faceBox(sink, 'structureWood', face, 0, vy + dy, -frame.gableReveal * 0.5, 0.6, 0.06, 0.03, { colour: shade(DOOR[0], 0.7), decor: true, fine: true });
    }
  }
}

/** The gable vent's opening, cut on every tier (the phones' solids are the desktop's): a round-headed hole at mid-gable. */
const gableVent = (_face: Face, _poly: Array<[number, number]>, frame: HouseFrame): HoleRect[] => {
  const vy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.5;
  return [{ u0: -0.3, u1: 0.3, y0: vy - 0.34, y1: vy + 0.3, spring: vy }];
};

function dialect(rng: () => number, door: Rgb, vents = false): HouseDialect {
  return {
    ...(vents ? { gableOpenings: gableVent } : {}),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...WINDOW, bars: 'cross' } : WINDOW, rng, 0.42),
    door: (s, face, o, y0) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(door, 0.9), { bucket: YELLOW_BRICK, width: 0.24, out: 0.08 }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: YELLOW_BRICK, width: 0.18, out: 0.06, arch: true }, transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0);
    },
  };
}

const slate = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.35, verge: 0.2, thickness: 0.13, bucket: 'roof', ridge: 'saddle' });

/** A yellow-brick band round a body at height y. */
function band(sink: PartSink, b: { x0: number; x1: number; z0: number; z1: number }, y: number): void {
  sink.band(YELLOW_BRICK, b.x0 - 0.04, y, b.z0 - 0.04, b.x1 + 0.04, y + 0.24, b.z1 + 0.04, { decor: true });
}

// ---- (dome-detail-275) the slates in their courses, the coalfield's ironwork, the yards' coal and goods ----

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** A planar polygon wound to face `toward` (dome-detail-275). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const n = cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]));
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** A slope's frame (dome-detail-275): `P(v, t, h)` a point `v` up it from its foot, `t` along it, `h` off it. */
interface SlateSlope { P: (v: number, t: number, h: number) => Vec3; n: Vec3; down: Vec3; along: Vec3 }

/**
 * One run of a slate course (dome-detail-275): the slates' butts a step `b` high across the slope from `t0` to `t1` at
 * `v`, the course's face thinning up to the butts of the next `len` over it; `ends` closes the run's ends where no
 * neighbour abuts (a verge, a hip, the stripped patch's edge).
 */
function slateStep(sink: PartSink, sl: SlateSlope, v: number, t0: number, t1: number, b: number, len: number, o: EmitOptions,
  ends: readonly [boolean, boolean]): void {
  const A0 = sl.P(v, t0, -0.01), A1 = sl.P(v, t1, -0.01), B0 = sl.P(v, t0, b), B1 = sl.P(v, t1, b);
  const C0 = sl.P(v + len, t0, -0.004), C1 = sl.P(v + len, t1, -0.004);
  facing(sink, 'roof', [A0, A1, B1, B0], sl.down, o);
  facing(sink, 'roof', [B0, B1, C1, C0], sl.n, o);
  if (ends[0]) facing(sink, 'roof', [A0, B0, C0], [-sl.along[0], -sl.along[1], -sl.along[2]], o);
  if (ends[1]) facing(sink, 'roof', [A1, B1, C1], sl.along, o);
}

/** The slates' course up a slope (m): the butt lines the long view reads (dome-detail-275). */
const SLATE_COURSE = 0.36;
/** (dome-detail-275) the shared roof relief's slates in the same courses (house.ts RoofSpec.relief): the terrace rows' roofs */
const SLATE_RELIEF: RoofRelief = { kind: 'slate', gauge: SLATE_COURSE };

/** A slate run's tone (dome-detail-275): the soot-dulled field, now and then a run relaid in new slate or one sooted black. */
function slateTone(look: () => number): number {
  const r = look();
  return r < 0.05 ? 1.08 : r < 0.1 ? 0.68 : 0.84 + look() * 0.14;
}

/**
 * The slates of a gable roof in relief (dome-detail-275; the work list: "plain"; the roof bar: "courses, tiles, slates,
 * sheets with laps"), laid on its slab in the house's roof frame (house.ts roofGeometry: the ridge along z): on each
 * slope the courses' butts a step a finger high from the eave up to the ridge's saddle, each course laid in runs of a
 * few metres, each run its own tone of the soot-dulled slate; the eave course doubled, its butt deeper. Dressing: the
 * slab keeps the collision. Over the war's stripped patch (HouseFrame.roofPatch) the courses stop at its edges.
 */
function slateRoof(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, look: () => number, patch: RoofPatch | null, course = SLATE_COURSE): void {
  if (rg.kind !== 'gable') return;
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const ye = rg.ridgeY + roof.thickness / cosP - xe * rg.tanP, D = rg.halfD + roof.verge - 0.02;
  const top = xe / cosP - 0.17 / cosP;
  for (const side of [1, -1] as const) {
    const up: Vec3 = [-side * cosP, sinP, 0], n: Vec3 = [side * sinP, cosP, 0], down: Vec3 = [side * cosP, -sinP, 0];
    const P = (v: number, t: number, h: number): Vec3 => [side * xe + up[0] * v + n[0] * h, ye + up[1] * v + n[1] * h, t];
    const sl: SlateSlope = { P, n, down, along: [0, 0, 1] };
    const uv = { kind: 'plane' as const, origin: P(0, 0, 0), u: [0, 0, 1] as Vec3, v: down };
    const gap = patch && patch.side === side ? { v0: (xe - patch.x1) / cosP - 0.05, v1: (xe - patch.x0) / cosP + 0.05, t0: patch.z0 - 0.05, t1: patch.z1 + 0.05 } : null;
    for (let k = 0, v = 0.02; v < top - 0.1; k++, v += course) {
      const len = Math.min(course, top - v), b = k === 0 ? 0.05 : 0.028;
      const runs: Array<[number, number]> = gap && v + len > gap.v0 && v < gap.v1 ? [[-D, gap.t0], [gap.t1, D]] : [[-D, D]];
      for (const [c0, c1] of runs) {
        for (let t = c0; t < c1 - 0.1;) {
          let w = 2.4 + look() * 3.4;
          if (c1 - (t + w) < 0.8) w = c1 - t;
          slateStep(sink, sl, v, t, t + w, b, len, { decor: true, uv, shade: k === 0 ? 0.72 : slateTone(look) }, [t === c0, t + w >= c1]);
          t += w;
        }
      }
    }
  }
}

/**
 * A ventilator astride a shed's ridge (dome-detail-275): a boarded hood with louvres in its cheeks under its own little
 * slate roof, its foot in the ridge's saddle; at `z` along the ridge.
 */
function ridgeVent(sink: PartSink, rg: RoofGeometry, z: number): void {
  const y0 = rg.ridgeTopY - 0.25, y1 = rg.ridgeTopY + 0.45;
  sink.span('structureWood', -0.32, y0, z - 0.42, 0.32, y1, z + 0.42, { colour: rgb(0x3a3c3e), decor: true });
  for (const sx of [-1, 1]) for (const dy of [0.1, 0.27]) {
    sink.span('structureWood', sx * 0.32 - 0.02, y0 + 0.25 + dy, z - 0.34, sx * 0.32 + 0.02, y0 + 0.31 + dy, z + 0.34, { colour: rgb(0x26282a), decor: true, fine: true });
  }
  // its cap: a slab to each side from the ridge out past the cheeks, falling at 32 degrees
  const run = 0.46, drop = run * Math.tan(32 * Math.PI / 180), cl = Math.hypot(run, drop);
  for (const sx of [-1, 1]) {
    const n: Vec3 = [sx * drop / cl, run / cl, 0];
    const pts: Vec3[] = [[0, y1 + drop - 0.09, z - 0.54], [0, y1 + drop - 0.09, z + 0.54], [sx * run, y1 - 0.09, z + 0.54], [sx * run, y1 - 0.09, z - 0.54]];
    const k = cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]));
    sink.prism('roof', k[0] * n[0] + k[1] * n[1] >= 0 ? pts : [...pts].reverse(), n, 0.05, { decor: true, shade: 0.86 });
  }
}

/** A wall anchor (Maueranker; dome-detail-275): the iron bar of a tie rod's end across a brick face, its plate on it, `o` off the face. */
function wallAnchor(sink: PartSink, face: Face, u: number, y: number, o = 0, plate = true): void {
  faceBox(sink, 'structureMetal', face, u, y, o + 0.015, 0.05, 0.64, 0.03, { colour: IRON, decor: true, fine: 'near' });
  if (plate) faceBox(sink, 'structureMetal', face, u, y, o + 0.035, 0.12, 0.12, 0.02, { colour: IRON, decor: true, fine: 'near' });
}

/** A heap of coal tipped on the ground (dome-detail-275): a smooth mound of radius `r`, `h` high, its foot bedded. */
function coalHeap(sink: PartSink, x: number, z: number, r: number, h: number, look: () => number): void {
  sink.revolve('dark', [x, -0.05, z], 'y', smoothProfile([[0, r], [h * 0.3, r * 0.86], [h * 0.68, r * 0.5], [h, 0]], 3), DOME_MIN_SEGMENTS, { decor: true, shade: 0.42 + look() * 0.1 });
}

/** The colliery cottage pair: two storeys of brick, two doors, a dormer each, a stack at each gable. */
const cottagePair: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(7.6, ctx.info.w - 0.3), D = Math.max(7.6, Math.min(10, ctx.info.d - 0.3));
  const door = DOOR[Math.floor(rng() * DOOR.length) % DOOR.length];
  const openings: Opening[] = [];
  for (const u of [-W * 0.28, W * 0.28]) openings.push({ face: 'front', storey: 0, kind: 'door', u, w: 0.95, y0: 0, h: 2.2 });
  for (const i of [0, 1]) for (const o of windowRhythm('front', i, W, { w: 0.9, h: 1.3, sill: 0.9, spacing: 1.8, margin: 0.8, avoid: i === 0 ? [[-W * 0.28 - 0.6, -W * 0.28 + 0.6], [W * 0.28 - 0.6, W * 0.28 + 0.6]] : [] })) openings.push(o);
  for (const i of [0, 1]) for (const o of windowRhythm('back', i, W, { w: 0.8, h: 1.1, sill: 1.0, spacing: 2.4, margin: 1.0 })) openings.push(o);
  // the ridge runs along the street: built along local z and turned a quarter, its local -x side faces the street (+z)
  sink.placed(Math.PI / 2, 0, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: D, d: W, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: 2.8, wall: 'stone' }, { h: 2.6, wall: 'stone' }],
      roof: slate(45), gableBucket: 'stone', openings: openings.map((o) => ({ ...o, face: o.face === 'front' ? 'left' : o.face === 'back' ? 'right' : o.face })),
      chimneys: [{ x: 0, z: W / 2 - 0.6, sx: 0.6, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'pots' }, { x: 0, z: -W / 2 + 0.6, sx: 0.6, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'pots' }],
      gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, door));
    band(sink, frame.bodies[0], frame.floors[1] - 0.12);
    if (facadeOn()) {
      brickMasonry(frame, sink, ['left', 'right'], ['front', 'back'], false);
      // the party wall between the pair, a pier up the street front
      pilaster(sink, 'stone', frame.faces.left, 0, frame.floors[0], frame.eaveY - 0.31, 0.5, 0.07);
    }
  });
  return sink.finish();
};

/**
 * The colony terrace (a 'terrace' plot: map-revival's authored rows on Cinder Junction; terraceLayout.ts is the plot
 * contract): two-storey houses of soot-dark brick sharing party walls across the plot's width, the pairs' doors side by
 * side at their shared walls under yellow-brick arches with their steps on the pavement line, segmental-arched windows,
 * a yellow band at the first floor and a corbelled cornice, a pier up the street front at every party wall, a stack
 * with pots on the ridge at each party wall and inside each end gable, a continuous slate roof with verge boards at the
 * end gables and a socle 4 cm proud; behind each pair, where the plot is deep enough, the wash-house they share under
 * a lean-to falling to the yard, its copper's flue and a door for each house.
 */
const terraceRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const L = terraceLayout(ctx.info);
  const { partyWalls, houses } = terraceUnits(L);
  const door = DOOR[Math.floor(rng() * DOOR.length) % DOOR.length];
  const zc = (L.front + L.back) / 2;
  // openings in the row's frame: the street face (+z) and the back (-z); the body is built along local z and turned a
  // quarter (as the cottage pair is), its local -x side (left) to the street, its +x side (right) to the back, whose
  // u runs the other way
  const openings: Opening[] = [];
  const street = (o: Omit<Opening, 'face'>): void => { openings.push({ ...o, face: 'left' }); };
  const back = (o: Omit<Opening, 'face'>): void => { openings.push({ ...o, face: 'right', u: -o.u }); };
  const sills: Array<[number, number]> = [];
  for (const h of houses) {
    const xc = (h.x0 + h.x1) / 2, uw = h.x1 - h.x0;
    // (the doors 0.9 m off the party wall: the pier up the front stands between the pair's frames)
    const xd = h.door > 0 ? h.x1 - 0.9 : h.x0 + 0.9, xw = xc - h.door * uw * 0.17;
    street({ storey: 0, kind: 'door', u: xd, w: 0.95, y0: 0, h: 2.2 });
    street({ storey: 0, kind: 'window', u: xw, w: 1.1, y0: 0.85, h: 1.35 });
    for (const x of [xc - uw * 0.2, xc + uw * 0.2]) { street({ storey: 1, kind: 'window', u: x, w: 0.9, y0: 0.7, h: 1.2 }); sills.push([x, 0.9]); }
    if (!L.washhouses) back({ storey: 0, kind: 'door', u: xd, w: 0.85, y0: 0, h: 2.05 });
    back({ storey: 0, kind: 'window', u: xw, w: 0.9, y0: 1.0, h: 1.1 });
    back({ storey: 1, kind: 'window', u: xc, w: 0.9, y0: 0.85, h: 1.15 });
  }
  const stacks = [-L.w / 2 + 0.5, ...partyWalls, L.w / 2 - 0.5].map((z) => ({ x: 0, z, sx: 0.55, sz: 0.75, above: 1.0, bucket: 'stone' as const, cap: 'pots' as const }));
  sink.placed(Math.PI / 2, 0, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: L.depth, d: L.w, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.9, wall: 'stone' }, { h: 2.7, wall: 'stone' }],
      roof: { ...slate(40), relief: SLATE_RELIEF }, gableBucket: 'stone', openings, chimneys: stacks,
      gutters: { colour: rgb(0x5a5e60) }, verge: { colour: rgb(0x34302c), bucket: 'structureWood' }, reveal: 0.15,
    }, dialect(rng, door));
    band(sink, frame.bodies[0], frame.floors[1] - 0.12);
    if (facadeOn()) {
      brickMasonry(frame, sink, ['left', 'right'], ['front', 'back'], false);
      for (const x of partyWalls) pilaster(sink, 'stone', frame.faces.left, x, frame.floors[0], frame.eaveY - 0.31, 0.46, 0.06);
      // the soot run off the first-floor sills
      for (const [u, w] of sills) sillStreaks(sink, 'stone', frame.faces.left, u, frame.floors[1] + 0.7, w, frame.floors[1]);
    }
  });
  if (L.washhouses) {
    // the wash-houses behind the pairs, astride their party walls (an odd last house has its own): built along local z
    // and turned a quarter, so the lean-to's fall (local +x) runs to the yard (-z)
    const zw = L.back - L.washDepth / 2;
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 14, eave: 0.25, verge: 0.12, thickness: 0.1, bucket: 'roof', relief: SLATE_RELIEF };
    const yard: HouseDialect = {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...WINDOW, bars: 'cross', head: null }, rng, 0.2),
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(door, 0.85), frame: { bucket: 'stone', width: 0.1, out: 0.04 }, steps: null, leafKind: 'plank' }, y0 + o.y0),
    };
    for (let i = 0; i < houses.length; i += 2) {
      const pair = i + 1 < houses.length;
      const x = pair ? houses[i].x1 : houses[i].x0 + 1.25, ww = pair ? 4.2 : 2.3;
      const doors: Opening[] = (pair ? [-1, 1] : [0]).map((k) => ({ face: 'right', storey: 0, kind: 'door', u: -k * 1.05, w: 0.8, y0: 0, h: 1.9 }));
      sink.placed(Math.PI / 2, x, 0, zw, () => {
        buildHouse(sink, {
          w: L.washDepth, d: ww, plinth: { h: 0.25, out: 0.03, bucket: 'stone' }, storeys: [{ h: 2.15, wall: 'stone' }],
          roof: lean, gableBucket: 'stone', openings: doors,
          chimneys: [{ x: -L.washDepth / 2 + 0.35, z: pair ? 0 : -0.4, sx: 0.38, sz: 0.38, above: 0.8, bucket: 'stone', cap: 'pots' }],
          gutters: null, verge: null, reveal: 0.12, skirt: null,
        }, yard);
      });
    }
  }
  return sink.finish();
};

/**
 * The goods shed: a long brick shed, sliding doors along a loading dock under a deep canopy on brackets. A yard shed's
 * plot (11.7 x 7.2 m) is wider than deep: the shed lies along it (plotAxes), its loading dock down one long side,
 * instead of running 16 m deep across the plot, 4.4 m past either side.
 */
const goodsShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const plot = plotAxes(ctx.info);
  const D = Math.max(plot.turned ? 8 : 16, Math.min(26, plot.d - 0.6));
  // (map-revival's wave 362: on a yard shed the dock read as "a protruding slab plinth") a shed under 12 m has no dock:
  // it fills its plot's width instead, its floor and its doors at the ground
  const dock = D >= 12;
  const W = dock ? Math.max(plot.turned ? 4.4 : 9, Math.min(14, plot.w - 3.5)) : Math.max(4.4, Math.min(14, plot.w - 0.6));
  const floor = dock ? 1.1 : 0.35;
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(3, Math.round(D / 5)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    // (dome-detail-275: the heights were taken from the ground, where the storey's floor is the plinth's top, and the
    // dock's gates stood a metre over its deck) the gates at the floor, the windows over them under the band
    openings.push(k % 2 === 0 ? { face: 'right', storey: 0, kind: 'gate', u, w: 2.6, y0: 0, h: dock ? 2.6 : 2.7 }
      : { face: 'right', storey: 0, kind: 'window', u, w: 1.1, y0: dock ? 1.1 : 1.4, h: 1.3 });
    if (k % 2 === 1) openings.push({ face: 'left', storey: 0, kind: 'window', u, w: 1.1, y0: dock ? 1.1 : 1.4, h: 1.3 });
  }
  // the body against one side of the plot, the dock beside it (turned: in the plot-axes frame)
  const cx = plot.turned ? -plot.w / 2 + 0.3 + W / 2 : ctx.bounds.minX + 0.3 + W / 2;
  alongPlot(sink, plot.turned, () => sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: floor, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.4, wall: 'stone' }],
      roof: slate(28), gableBucket: 'stone', openings, chimneys: [], gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, DOOR[1], true));
    band(sink, frame.bodies[0], floor + 2.8);
    if (facadeOn()) brickMasonry(frame, sink, ['left', 'right'], ['left'], true);
    // (dome-detail-275) the slates in their courses; ventilators astride the ridge, one to every eight metres or so
    slateRoof(sink, frame.roof, frame.spec.roof, look, frame.roofPatch);
    const vents = Math.max(1, Math.round(D / 8));
    for (let k = 0; k < vents; k++) ridgeVent(sink, frame.roof, -D / 2 + (k + 0.5) * D / vents + (look() - 0.5) * 0.6);
    // (dome-detail-275) each sliding door's iron rail over its opening, run on past it the leaf's width to one side
    const right = frame.faces.right;
    for (const o of openings) {
      if (o.kind !== 'gate') continue;
      const yr = frame.floors[0] + o.y0 + o.h + 0.3, run = dock ? o.w * 1.9 : o.w + 0.5, uc = o.u + (o.u > 0 ? -1 : 1) * (run - o.w) / 2;
      faceBox(sink, 'structureMetal', right, uc, yr, 0.05, run, 0.09, 0.1, { colour: IRON, decor: true });
      for (const du of [-run / 2 + 0.1, 0, run / 2 - 0.1]) faceBox(sink, 'structureMetal', right, uc + du, yr - 0.12, 0.03, 0.06, 0.2, 0.06, { colour: IRON, decor: true, fine: 'near' });
    }
    // (dome-detail-275) each gable's name board under the eave (the station's goods office: Güterabfertigung) in a light
    // frame, and the tie rods' anchors either side of it
    for (const name of ['front', 'back'] as const) {
      const g = frame.faces[name], yb = frame.eaveY - 0.62, bw = Math.min(3.0, W * 0.36);
      faceBox(sink, 'structureWood', g, 0, yb, 0.02, bw + 0.12, 0.62, 0.04, { colour: rgb(0xc8c0a8), decor: true });
      faceBox(sink, 'structureWood', g, 0, yb, 0.05, bw, 0.5, 0.02, { colour: rgb(0x2c3a30), decor: true });
      if (facadeOn()) for (const u of [-W / 2 + 0.7, W / 2 - 0.7]) wallAnchor(sink, g, u, yb);
    }
    if (!dock) return;
    // the loading dock: its stone coping along the edge, oak fenders and a rubbing strake down its face, a flight of
    // steps up its end; its canopy on brackets
    sink.span('stone', W / 2, -0.4, -D / 2, W / 2 + 2.4, 1.1, D / 2);
    sink.span('stone', W / 2 + 2.12, 1.1, -D / 2, W / 2 + 2.46, 1.18, D / 2, { decor: true, shade: 0.92 });
    for (let z = -D / 2 + 0.9; z < D / 2 - 0.5; z += 2.6) sink.span('structureWood', W / 2 + 2.4, 0.15, z - 0.12, W / 2 + 2.52, 1.06, z + 0.12, { colour: rgb(0x4a3c30), decor: true });
    sink.span('structureWood', W / 2 + 2.4, 0.7, -D / 2 + 0.3, W / 2 + 2.47, 0.85, D / 2 - 0.3, { colour: rgb(0x3e332a), decor: true });
    for (let k = 0; k < 3; k++) sink.span('stone', W / 2 + 2.4 + (2 - k) * 0.25, -0.3, -D / 2 + 0.15, W / 2 + 2.4 + (3 - k) * 0.25, 0.32 + k * 0.26, -D / 2 + 1.35);
    const canopy: RoofSpec = { kind: 'shed', pitchDeg: 7, eave: 0.1, verge: 0.3, thickness: 0.08, bucket: 'roof' };
    const cw = plot.turned ? 2.6 : 3.0;
    const crg = roofGeometry(cw, D + 0.4, 4.9, canopy);
    sink.placed(Math.PI, W / 2 + cw / 2, 0, 0, () => emitRoof(sink, crg, canopy));
    // (the connectivity sweep: the brackets stopped 0.3 m under the canopy, which rises from the wall) each bracket up to
    // the canopy's underside, and an iron ledger along the wall under its inner edge
    const under = (x: number) => (crg.topAt(cw / 2 - (x - W / 2), 0) ?? 4.9) - canopy.thickness;
    sink.span('structureWood', W / 2, under(W / 2 + 0.06) - 0.14, -D / 2, W / 2 + 0.1, under(W / 2 + 0.06) + 0.01, D / 2, { colour: IRON, decor: true });
    for (let z = -D / 2 + 1; z < D / 2; z += 3.2) {
      sink.member('structureWood', [W / 2 + 0.05, 3.8, z], [W / 2 + 2.4, under(W / 2 + 2.4) - 0.05, z], 0.12, 0.12, [0, 0, 1], { colour: IRON, decor: true, exposed: true });
    }
    // (dome-detail-275) the canopy's valance (the Prussian railway's Holzbehang): a board along its eave, its foot cut in
    // a row of points
    const xv = W / 2 + cw + 0.03, yv = (crg.topAt(-cw / 2 - 0.03, 0) ?? 4.6) - canopy.thickness + 0.01, L = D / 2 + 0.45;
    const val = rgb(0x5a4a38), teeth = Math.round(2 * L / 0.3);
    sink.span('structureWood', xv - 0.02, yv - 0.4, -L, xv + 0.02, yv + 0.02, L, { colour: val, decor: true });
    for (let k = 0; k < teeth; k++) {
      const z0 = -L + 2 * L * k / teeth, z1 = -L + 2 * L * (k + 1) / teeth;
      for (const sx of [-1, 1]) {
        facing(sink, 'structureWood', [[xv + sx * 0.02, yv - 0.4, z0], [xv + sx * 0.02, yv - 0.4, z1], [xv + sx * 0.02, yv - 0.58, (z0 + z1) / 2]], [sx, 0, 0], { colour: val, decor: true, fine: true });
      }
    }
    // (dome-detail-275) the goods waiting on the dock under the canopy: crates stacked, sacks, a barrel or two
    for (let g = 0, n = 3 + Math.floor(look() * 3); g < n; g++) {
      const z = -D / 2 + 2.2 + look() * (D - 4.4), x = W / 2 + 0.75 + look() * 0.7, wood = shade(rgb(0x8a6e4c), 0.8 + look() * 0.3);
      const a = 0.4 + look() * 0.3, b = 0.35 + look() * 0.25, c = 0.45 + look() * 0.3;
      sink.span('structureWood', x - a, 1.1, z - b, x + a, 1.1 + c, z + b, { colour: wood, decor: true });
      if (look() < 0.5) sink.span('structureWood', x - a * 0.7, 1.1 + c, z - b * 0.8, x + a * 0.6, 1.1 + c + 0.4, z + b * 0.7, { colour: shade(wood, 0.9), decor: true });
      if (look() < 0.6) sink.cylinder('structureWood', [x + 0.1, 1.1, z + b + 0.42], 'y', 0.86, 0.3, 10, { colour: rgb(0x4e3c2c), decor: true });
      else sink.span('structureWood', x - 0.35, 1.1, z + b + 0.1, x + 0.35, 1.36, z + b + 0.6, { colour: rgb(0x9a8a68), decor: true });
    }
  }), 1);
  return sink.finish();
};

/**
 * The slates of an octagonal cap in relief (dome-detail-275; the work list: "plain"): on each of its eight faces the
 * courses' butts a step a finger high from the eave toward the apex, each face's course its own tone, the steps closed
 * at the hips; a zinc roll down each hip over their ends. The cap a frustum from radius `r0` at `y0` to `r1` at `y0 + h`
 * (to its corners), corners at pi/8 + k pi/4 as the kit's octagons.
 */
function octagonSlates(sink: PartSink, y0: number, r0: number, r1: number, h: number, look: () => number): void {
  const c8 = Math.cos(Math.PI / 8), da = (r1 - r0) * c8, slant = Math.hypot(da, h), stop = slant - 0.5;
  for (let k = 0; k < 8; k++) {
    const phi = k * Math.PI / 4, c: Vec3 = [Math.cos(phi), 0, Math.sin(phi)];
    const nl = Math.hypot(h, -da), n: Vec3 = [c[0] * h / nl, -da / nl, c[2] * h / nl];
    const along: Vec3 = [-Math.sin(phi), 0, Math.cos(phi)];
    // a point `v` up the face's middle from its eave, `t` along it (a fraction -1..1 of its half-width there), `hh` off it
    const P = (v: number, t: number, hh: number): Vec3 => {
      const f = v / slant, r = r0 + (r1 - r0) * f, a = r * c8, w = t * r * Math.sin(Math.PI / 8);
      return [c[0] * a + along[0] * w + n[0] * hh, y0 + h * f + n[1] * hh, c[2] * a + along[2] * w + n[2] * hh];
    };
    const down: Vec3 = [-c[0] * da / slant, -h / slant, -c[2] * da / slant];
    const sl: SlateSlope = { P, n, down, along };
    for (let j = 0, v = 0.05; v < stop; j++, v += SLATE_COURSE * 0.85) {
      slateStep(sink, sl, v, -1, 1, j === 0 ? 0.045 : 0.026, Math.min(SLATE_COURSE * 0.85, stop + 0.3 - v), { decor: true, shade: j === 0 ? 0.72 : slateTone(look) }, [true, true]);
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * Math.PI / 4, lift = 0.04;
    sink.pipe('structureMetal', [Math.cos(a) * (r0 + lift), y0 + 0.02, Math.sin(a) * (r0 + lift)], [Math.cos(a) * (r1 + lift), y0 + h - 0.05, Math.sin(a) * (r1 + lift)],
      0.05, 6, { colour: rgb(0x6e7476), decor: true });
  }
}

/** The water tower: a brick shaft and a riveted tank house with a hipped cap. */
const waterTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the tank house stays over the plot (a 5.4 m plot: the cap's eaves reach its edge)
  const half = Math.min(ctx.info.w, ctx.info.d) / 2;
  const R = Math.max(1.5, Math.min(2.2, half - 0.75)), H = 11.0;
  // (props census #3, lane B 2026-10-14; the judges: "no stair windows, no corbel table or cornice where the tank house
  // sits, the tank house a solid sheet box with no windows, gallery or vent; a square box on an octagon") the brick
  // octagon on its battered plinth, its eight faces each a wall with the door and the stair's slit windows cut in
  // reveals, the yellow bands round it; a corbel table stepping out under the tank house; the tank house an octagon of
  // sheet on battens with a window cut in every other face; its octagonal slate cap and the vent lantern on it
  sink.cylinder('stone', [0, -0.4, 0], 'y', 0.9, R + 0.25, 8, {}, R + 0.2, true, Math.PI / 8);
  const Rs = R * 0.95, sin8 = Math.sin(Math.PI / 8), cos8 = Math.cos(Math.PI / 8), shaftTop = 0.5 + H;
  const faceOf = (k: number, r: number): Face => {
    const t = k * Math.PI / 4;
    return { origin: [Math.sin(t) * r * cos8, 0, Math.cos(t) * r * cos8], u: [Math.cos(t), 0, -Math.sin(t)], out: [Math.sin(t), 0, Math.cos(t)], width: 2 * r * sin8 };
  };
  const hw = Rs * sin8;
  // the stair's slits: up the faces either side of the back, staggered between the bands
  const slits: Array<[number, number]> = [[3, 1.6], [5, 4.3], [3, 7.4], [5, 8.4]];
  for (let k = 0; k < 8; k++) {
    const f = faceOf(k, Rs);
    const holes = [
      ...(k === 0 ? [{ u0: -0.5, u1: 0.5, y0: 0.5, y1: 0.5 + 2.2 }] : []),
      ...slits.filter(([fk]) => fk === k).map(([, y]) => ({ u0: -0.17, u1: 0.17, y0: y, y1: y + 0.95 })),
    ];
    holedPolygon(sink, 'stone', f, [[-hw, 0.5], [hw, 0.5], [hw, shaftTop], [-hw, shaftTop]], holes, 0.38, 0.3);
    // the slits' sills and the door in its reveal
    for (const [fk, y] of slits) if (fk === k) faceBox(sink, 'stone', f, 0, y - 0.04, 0.03, 0.46, 0.08, 0.12, { decor: true });
    if (k === 0) {
      sink.recess = 0.3;
      try {
        doorUnit(sink, f, 0, 0.5, 1.0, 2.2, { leaf: DOOR[0], frame: { bucket: YELLOW_BRICK, width: 0.16, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.5);
      } finally { sink.recess = 0; }
    }
  }
  for (const y of [3.2, 6.6, 10.0]) sink.cylinder(YELLOW_BRICK, [0, y, 0], 'y', 0.3, Rs + 0.05, 8, { decor: true }, Rs + 0.05, true, Math.PI / 8);
  const look = ctx.variant;
  // (dome-detail-275) the brick lisenes up the octagon's corners, between the yellow bands, a few centimetres proud
  for (let k = 0; k < 8; k++) {
    const t = (k + 0.5) * Math.PI / 4;
    const corner: Face = { origin: [Math.sin(t) * (Rs - 0.09), 0, Math.cos(t) * (Rs - 0.09)], u: [Math.cos(t), 0, -Math.sin(t)], out: [Math.sin(t), 0, Math.cos(t)], width: 0 };
    for (const [y0, y1] of [[0.5, 3.2], [3.5, 6.6], [6.9, 10.0], [10.3, H + 0.5 - 0.66]]) pilaster(sink, 'stone', corner, 0, y0, y1, 0.34, 0.15);
  }
  // (dome-detail-275) a segmental head of yellow brick over each stair slit
  for (const [fk, y] of slits) windowHead(sink, faceOf(fk, Rs), 0, y + 0.95, 0.34, { kind: 'segment', bucket: YELLOW_BRICK, h: 0.1, out: 0.04, ext: 0.06, rise: 0.1 });
  // (dome-detail-275) the overflow pipe down the back face from the tank house's floor to a gully at its foot, clipped to
  // the brick every couple of metres
  {
    const back = faceOf(4, Rs), top = H + 0.5 - 0.66, po = 0.16, uP = 0.42;
    const at = (y: number, o = po): Vec3 => [back.origin[0] + back.u[0] * uP + back.out[0] * o, y, back.origin[2] + back.u[2] * uP + back.out[2] * o];
    const cast = { colour: rgb(0x2e3438), decor: true };
    sink.pipe('structureMetal', at(0.6), at(top + 0.56), 0.075, 8, cast);
    sink.pipe('structureMetal', at(0.6, po - 0.075), at(0.6, po + 0.58), 0.075, 8, cast);
    sink.pipe('structureMetal', at(0.675, po + 0.5), at(0.2, po + 0.5), 0.075, 8, cast);
    for (let y = 1.4; y < top - 0.4; y += 2.3) faceBox(sink, 'structureMetal', back, uP, y, 0.06, 0.24, 0.07, 0.12, { colour: IRON, decor: true, fine: 'near' });
    const g = at(0, po + 0.5);
    sink.span('stone', g[0] - 0.24, -0.05, g[2] - 0.24, g[0] + 0.24, 0.24, g[2] + 0.24, { decor: true, shade: 0.7 });
  }
  // (dome-detail-275) the clinker apron round the plinth, laid flat and a little sunk at its rim
  sink.cylinder('stone', [0, -0.05, 0], 'y', 0.1, Math.min(half + 0.3, R + 0.95), 8, { decor: true, shade: 0.62 }, Math.min(half + 0.3, R + 0.95) - 0.06, true, Math.PI / 8);
  // the corbel table: three courses stepping out to the tank house
  const T = Math.max(R + 0.3, Math.min(3.4, half - 0.4)), th = 3.6, ty = H + 0.5;
  // (the integrity gate, 2026-10-14: the courses' radii are the octagons' corners, as the tank house's faces are laid on
  // its corners' circle T / cos(pi/8); stepping out only to T left the tank house 10 cm clear of its top course)
  const Tc = T / Math.cos(Math.PI / 8);
  for (let c = 0; c < 3; c++) {
    const r0 = Rs + (Tc - Rs) * (c / 3), r1 = Rs + (Tc - Rs) * ((c + 1) / 3);
    sink.cylinder(c === 1 ? YELLOW_BRICK : 'stone', [0, ty - 0.66 + c * 0.22, 0], 'y', 0.22, r0 + 0.06, 8, { shade: 0.9 }, r1, true, Math.PI / 8);
  }
  // (dome-detail-275) the corbel frieze under the table: three brick consoles to a face, stepped out from the shaft
  for (let k = 0; k < 8; k++) {
    const f = faceOf(k, Rs);
    for (const u of [-hw * 0.55, 0, hw * 0.55]) {
      faceBox(sink, 'stone', f, u, ty - 0.84, 0.06, 0.2, 0.36, 0.12, { decor: true, shade: 0.86 }, { top: true });
      faceBox(sink, YELLOW_BRICK, f, u, ty - 1.05, 0.04, 0.14, 0.08, 0.08, { decor: true, fine: 'near' });
    }
  }
  // the tank house: eight faces, a window cut in every other face. (dome-detail-275; the work list: "a boarded tank,
  // plain") its walls a timber frame (Fachwerk) round rendered infill, as the Prussian railways built their tank houses:
  // a post at every corner, a rail under the windows and one over them, a pair of braces in each blank face
  const Tf = T / cos8, tw = Tf * sin8, oak = { colour: rgb(0x2e2620), decor: true };
  for (let k = 0; k < 8; k++) {
    const f = faceOf(k, Tf);
    const win = k % 2 === 1;
    holedPolygon(sink, 'plaster', f, [[-tw, ty], [tw, ty], [tw, ty + th], [-tw, ty + th]],
      win ? [{ u0: -0.4, u1: 0.4, y0: ty + 1.4, y1: ty + 2.5 }] : [], 0.12, 0.1, { shade: 0.84 });
    if (win) {
      sink.recess = 0.1;
      try {
        windowUnit(sink, f, 0, ty + 1.4, 0.8, 1.1, { frame: rgb(0x3e4448), frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.06 }, shutters: null }, ctx.rng, 0);
      } finally { sink.recess = 0; }
    }
    for (const y of [ty + 1.27, ty + 2.6]) faceBox(sink, 'structureWood', f, 0, y, 0.025, 2 * tw, 0.15, 0.05, oak);
    if (!win) {
      for (const sx of [-1, 1]) {
        faceSlab(sink, 'structureWood', f, [[sx * (tw - 0.08), ty + 0.12], [sx * (tw - 0.08), ty + 0.36], [sx * 0.08, ty + 1.2], [sx * 0.08, ty + 0.96]], 0, 0.05, oak);
        faceSlab(sink, 'structureWood', f, [[sx * (tw - 0.08), ty + 2.67], [sx * (tw - 0.08), ty + 2.91], [sx * 0.08, ty + th - 0.12], [sx * 0.08, ty + th - 0.36]], 0, 0.05, oak);
      }
      faceBox(sink, 'structureWood', f, 0, ty + th / 2, 0.025, 0.16, th, 0.05, oak);
    } else {
      for (const sx of [-1, 1]) faceBox(sink, 'structureWood', f, sx * 0.5, ty + 1.93, 0.025, 0.14, 1.2, 0.05, oak);
    }
    const t = (k + 0.5) * Math.PI / 4;
    const corner: Face = { origin: [Math.sin(t) * (Tf - 0.06), 0, Math.cos(t) * (Tf - 0.06)], u: [Math.cos(t), 0, -Math.sin(t)], out: [Math.sin(t), 0, Math.cos(t)], width: 0 };
    faceBox(sink, 'structureWood', corner, 0, ty + th / 2, 0.06, 0.2, th, 0.12, oak);
  }
  // (dome-detail-275) the tank house's sill plate on the table and the fascia under the cap's eave
  sink.cylinder('structureWood', [0, ty - 0.02, 0], 'y', 0.2, Tf + 0.05, 8, { colour: rgb(0x2c2622), decor: true }, Tf + 0.05, true, Math.PI / 8);
  // the octagonal slate cap, the vent lantern on its apex: its louvred drum and little cap
  const capR = Tf + 0.35, capH = 2.2;
  sink.cylinder('structureWood', [0, ty + th - 0.2, 0], 'y', 0.22, capR + 0.02, 8, { colour: rgb(0x2c2622), decor: true }, capR + 0.02, true, Math.PI / 8);
  sink.cylinder('roof', [0, ty + th, 0], 'y', capH, capR, 8, {}, 0.35, true, Math.PI / 8);
  octagonSlates(sink, ty + th, capR, 0.35, capH, look);
  sink.cylinder('structureMetal', [0, ty + th + capH - 0.1, 0], 'y', 0.7, 0.32, 8, { colour: rgb(0x4a5054) }, 0.32, true, Math.PI / 8);
  sink.cylinder('roof', [0, ty + th + capH + 0.6, 0], 'y', 0.55, 0.48, 8, {}, 0.04, true, Math.PI / 8);
  for (let y = ty + th + capH; y < ty + th + capH + 0.55; y += 0.14) {
    sink.cylinder('structureMetal', [0, y, 0], 'y', 0.04, 0.34, 8, { colour: rgb(0x2e3236), decor: true, fine: true }, 0.34, false, Math.PI / 8);
  }
  // (dome-detail-275) the weathervane on the lantern's point: its rod, a ball, the vane and the compass arms
  const vy = ty + th + capH + 1.1;
  sink.pipe('structureMetal', [0, vy - 0.1, 0], [0, vy + 1.0, 0], 0.025, 6, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [0, vy + 0.12, 0], 'y', 0.14, 0.07, 8, { colour: rgb(0x6a5a3a), decor: true });
  sink.span('structureMetal', -0.32, vy + 0.36, -0.012, 0.3, vy + 0.4, 0.012, { colour: IRON, decor: true, fine: true });
  sink.span('structureMetal', -0.012, vy + 0.36, -0.32, 0.012, vy + 0.4, 0.3, { colour: IRON, decor: true, fine: true });
  sink.span('structureMetal', 0.02, vy + 0.66, -0.01, 0.62, vy + 0.92, 0.01, { colour: IRON, decor: true });
  return sink.finish();
};

/** The station building: a gabled two-storey block between single-storey wings, arched windows, a platform canopy. */
const station: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the body and the platform canopy (3.4 m past its track side) inside the plot
  const W = Math.max(6.4, Math.min(10, ctx.info.w - 4.6)), D = Math.max(14, Math.min(22, ctx.info.d - 2));
  const coreD = Math.min(9, D * 0.45), wingD = (D - coreD) / 2;
  const door = DOOR[0];
  const coreOpenings: Opening[] = [{ face: 'left', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.8 }];
  for (const i of [0, 1]) for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, i, coreD, { w: 1.1, h: 1.7, sill: 0.9, spacing: 2.1, margin: 1.0, avoid: face === 'left' && i === 0 ? [[-1.0, 1.0]] : [] })) coreOpenings.push(o);
  const cx = ctx.bounds.minX + 0.3 + W / 2;
  sink.placed(0, cx, 0, 0, () => {
    const core = buildHouse(sink, {
      w: W, d: coreD, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }, { h: 3.2, wall: 'stone' }],
      roof: slate(42), gableBucket: 'stone', openings: coreOpenings,
      chimneys: [{ x: W * 0.25, z: 0, sx: 0.6, sz: 0.6, above: 1.0, bucket: 'stone', cap: 'pots' }], gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, door, true));
    band(sink, core.bodies[0], core.floors[1] - 0.15);
    if (facadeOn()) brickMasonry(core, sink, ['left', 'right'], ['left', 'right'], true);
    for (const end of [1, -1]) {
      sink.placed(0, 0, 0, end * (coreD / 2 + wingD / 2 - 0.05), () => {
        const wingOpenings: Opening[] = [];
        for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, wingD, { w: 1.1, h: 1.8, sill: 0.8, spacing: 2.2, margin: 0.8 })) wingOpenings.push(o);
        const wing = buildHouse(sink, {
          w: W - 1.2, d: wingD, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 4.0, wall: 'stone' }],
          roof: slate(30, 'hip'), gableBucket: 'stone', openings: wingOpenings, chimneys: [], gutters: { colour: rgb(0x6a6e70) }, verge: null,
        }, dialect(rng, door));
        band(sink, wing.bodies[0], 3.5);
        if (facadeOn()) trimRing(sink, 'stone', wing.bodies[0], wing.eaveY - 0.24, [{ h: 0.08, out: 0.05 }, { h: 0.08, out: 0.1 }, { h: 0.08, out: 0.14 }]);
      });
    }
    // the platform canopy along the track side (+x) on cast columns (props census E4, lane B 2026-10-14: it rose from
    // the wall and its columns stopped 0.34 m under it): it falls from the wall over the platform to an iron girder on
    // the columns' heads, the columns' feet sunk in the platform
    const side: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const cols: number[] = [];
    for (let z = -D / 2 + 1.2; z < D / 2; z += 3.4) cols.push(-z);
    leanTo(sink, { face: side, u0: -D / 2, u1: D / 2, depth: 3.3, highY: 4.65,
      roof: { pitchDeg: 6, eave: 0.4, verge: 0.3, thickness: 0.09, bucket: 'roof' },
      posts: { at: cols, size: 0.2, bucket: 'structureMetal', colour: IRON, round: true },
      plate: { h: 0.3, w: 0.16, bucket: 'structureMetal', colour: IRON } });
  });
  return sink.finish();
};

/** A shelled brick building: walls broken to jagged stubs, a gable standing, the roof slates down. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(6, ctx.info.w - 0.3), D = Math.max(7, ctx.info.d - 0.3), t = 0.38;
  // (props census #7, lane B 2026-10-14; the judges: "slices to random tops") the ruin grammar: the brick house's own
  // two storeys broken — a gable standing to its broken peak, the long walls falling away from it, its windows cut through
  // with their lintels and sills — the floor's joists broken off, the slates down over the heaps
  const openings: Opening[] = [];
  for (const s of [0, 1]) for (const face of ['front', 'back', 'right', 'left'] as const) {
    for (const o of windowRhythm(face, s, face === 'front' || face === 'back' ? W : D - 2 * t, { w: 1.0, h: 1.5, sill: s === 0 ? 0.9 : 0.8, spacing: 2.4, margin: 1.0, max: 3 })) openings.push(o);
  }
  const gable = rng() < 0.5 ? 'front' : 'back';
  const high = (): RuinHead => ({ a: 4.0 + rng() * 1.2, b: 4.0 + rng() * 1.2, at: 0.5, dip: -0.25, ragged: 0.35 });
  const low = (): RuinHead => ({ a: 1.0 + rng() * 2.6, b: 1.0 + rng() * 2.6, at: rng(), dip: 0.3 + rng() * 0.3, ragged: 0.35 });
  ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [3.0, 2.8], openings,
    heads: { front: gable === 'front' ? high() : low(), back: gable === 'back' ? high() : low(),
      right: { a: gable === 'front' ? 3.4 : 1.4, b: gable === 'front' ? 1.4 : 3.4, ragged: 0.4 }, left: { a: gable === 'front' ? 1.4 : 3.4, b: gable === 'front' ? 3.4 : 1.4, ragged: 0.4 } },
    stub: 0.6, lintel: { bucket: 'stone' }, roof: { bucket: 'roof', piece: [0.5, 0.3, 0.02] }, timber: rgb(0x2b2622), mobile: ctx.tier === 'mobile',
  }, rng, look);
  return sink.finish();
};

/**
 * (the looks lane, 2026-10-13; LOOKS-BRIEF section 6: Cinder Junction's two works drawn by the generic factory) the
 * junction's works (a Zeche's Maschinenhalle or a Ruhr wire works of about 1900): a two-storey hall of soot-dark brick
 * on a stone plinth, yellow-brick bands at its floors, brick piers between the bays of tall segment-arched windows, a
 * dentil cornice; its gable to the yard with a great round-arched window and the gable's vent; the slate roof's ridge
 * lantern; the boiler house against its back under a shed roof; the works' chimney on its plinth at the plot's corner.
 */
const works: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const bb = ctx.bounds, plotW = bb.maxX - bb.minX, plotD = bb.maxZ - bb.minZ;
  // the boiler house wants 3.6 m behind the hall: a deep plot keeps it (the hall drawn forward), a short one goes without
  const boiler = plotD >= 13 + 1.2 + 3.6;
  const W = Math.max(9, Math.min(12.5, plotW - 4.2)), D = Math.max(13, Math.min(20, plotD - 1.2 - (boiler ? 3.6 : 0)));
  const cx = bb.minX + 0.6 + W / 2, cz = boiler ? bb.maxZ - 0.6 - D / 2 : (bb.minZ + bb.maxZ) / 2;
  const storeys = [{ h: 4.6, wall: 'stone' as const }, { h: 4.2, wall: 'stone' as const }];
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.2, y0: 0, h: 3.8 }];
  openings.push({ face: 'front', storey: 1, kind: 'window', u: 0, w: 2.2, y0: 0.5, h: 3.0 });
  for (const u of [-W * 0.32, W * 0.32]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.3, y0: 1.2, h: 2.5 }, { face: 'front', storey: 1, kind: 'window', u, w: 1.3, y0: 0.8, h: 2.4 });
  const bays = Math.max(4, Math.round(D / 3.4));
  for (const face of ['left', 'right'] as const) {
    for (let k = 0; k < bays; k++) {
      const u = -D / 2 + (k + 0.5) * (D / bays);
      openings.push({ face, storey: 0, kind: 'window', u, w: 1.5, y0: 1.2, h: 2.6 }, { face, storey: 1, kind: 'window', u, w: 1.5, y0: 0.8, h: 2.5 });
    }
  }
  sink.placed(0, cx, 0, cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: 'stone' }, storeys, roof: slate(32), gableBucket: 'stone', openings,
      chimneys: [], gutters: { colour: rgb(0x5e6264) }, verge: null, reveal: 0.36,
    }, dialect(rng, DOOR[2]));
    band(sink, frame.bodies[0], 0.6 + storeys[0].h - 0.12);
    band(sink, frame.bodies[0], 0.6 + 1.0);
    if (facadeOn()) {
      brickMasonry(frame, sink, ['left', 'right'], ['left', 'right', 'front'], true, 'console');
      // (dome-detail-275) the floor's tie rods anchored on the piers between the bays, over the yellow band
      for (const name of ['left', 'right'] as const) {
        for (let k = 1; k < bays; k++) wallAnchor(sink, frame.faces[name], -D / 2 + k * D / bays, frame.floors[1] + 0.55, 0.07, false);
      }
    }
    // (dome-detail-275) the slates in their courses (the war's stripped patch left open)
    slateRoof(sink, frame.roof, frame.spec.roof, look, frame.roofPatch, 0.45);
    // the ridge lantern: a raised louvred stage along the ridge under its own slate roof
    const rg = frame.roof, ly = rg.ridgeTopY - 0.08, len = D * 0.55;
    sink.span('stone', -0.8, ly - 0.3, -len / 2, 0.8, ly + 0.7, len / 2);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      sink.span('structureWood', sx * 0.81 - 0.02, ly + 0.05 + k * 0.2, -len / 2 + 0.2, sx * 0.81 + 0.02, ly + 0.12 + k * 0.2, len / 2 - 0.2, { colour: rgb(0x2e3032), decor: true });
    }
    const cap = slate(26);
    emitRoof(sink, roofGeometry(1.7, len + 0.2, ly + 0.7, cap), cap);
  });
  // the boiler house against the hall's back, its shed roof leaning on the hall
  const BW = Math.min(5.4, W - 2), BD = Math.min(4.6, (cz - D / 2) - bb.minZ - 0.4);
  if (boiler && BD >= 3.2) {
    sink.placed(0, cx - W / 2 + BW / 2 + 0.5, 0, cz - D / 2 - BD / 2 + 0.05, () => {
      const f2 = buildHouse(sink, {
        w: BW, d: BD, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 4.8, wall: 'stone' }],
        roof: { kind: 'shed', pitchDeg: 14, eave: 0.3, verge: 0.25, thickness: 0.12, bucket: 'roof' }, gableBucket: 'stone',
        openings: [{ face: 'left', storey: 0, kind: 'window', u: 0, w: 1.4, y0: 1.2, h: 2.8 }, { face: 'back', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 }],
        chimneys: [], gutters: { colour: rgb(0x5e6264) }, verge: null, reveal: 0.34,
      }, dialect(rng, DOOR[0]));
      band(sink, f2.bodies[0], 0.5 + 3.2);
    });
    // (dome-detail-275) the boiler house's flue to the chimney: a brick duct along the ground under its coping, and the
    // coal tipped beside it for the boilers
    const bx = cx - W / 2 + 0.5 + BW, sx = bb.maxX - 1.9 - 1.6, bz0 = cz - D / 2 - BD + 0.05, back = cz - D / 2;
    const fz0 = Math.max(bz0 + 0.3, bb.minZ + 0.6), fz1 = Math.min(back - 0.4, bb.minZ + 3.4);
    if (sx - bx > 1.2 && fz1 - fz0 > 0.8) {
      const fz = fz0 + 0.45;
      sink.span('stone', bx - 0.05, -0.1, fz - 0.42, sx + 0.05, 0.95, fz + 0.42, { decor: true, shade: 0.82 });
      sink.span('stone', bx - 0.05, 0.95, fz - 0.5, sx + 0.05, 1.07, fz + 0.5, { decor: true, shade: 0.95 });
      const r = Math.min(1.7, (sx - bx) / 2 - 0.2, (back - 0.3 - (fz + 0.6)) / 2);
      if (r > 0.8) coalHeap(sink, (bx + sx) / 2, fz + 0.6 + r, r, r * 0.75, look);
    }
  }
  // the chimney at the plot's free corner beside the hall (the kit's own stack, moved to its seat)
  const parts = sink.finish();
  const stack = factoryStack({ ...ctx, info: { w: 3.2, d: 3.2, h: 26 }, bounds: { minX: -1.6, maxX: 1.6, minZ: -1.6, maxZ: 1.6, maxY: 26 } });
  for (const [bucket, list] of Object.entries(stack) as Array<[keyof RegionalParts, RegionalParts[keyof RegionalParts]]>) {
    for (const g of list) parts[bucket].push(g.translate(bb.maxX - 1.9, 0, bb.minZ + 2.0));
  }
  return parts;
};

export const RUHR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse: cottagePair,
  terrace: terraceRow,
  warehouse: goodsShed,
  watertower: waterTower,
  depot: station,
  ruin,
  shed: goodsShed,
  stack: factoryStack,
  // (the looks lane, 2026-10-13) the junction's works in the coalfield's brick
  factory: works,
});

export const RUHR_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'ruhr',
  region: 'Ruhr and Upper Silesian coalfield junctions: soot-dark brick with yellow-brick bands under slate',
  surfaces: {
    roof: { kind: 'slate', tint: [0.25, 0.26, 0.28] },
    // (buildings-270, the census and round 2: the brick lit fresh orange-red; the junctions' photos show it soot-darkened to
    // purple-brown, #5a3b33-#6e4a3e) the brick #58403b (was #76483b) and soiled as a coal town's is, soot down every course
    stone: { kind: 'brick', tint: [0.34, 0.22, 0.2], weathered: true },
    // (buildings-270, the sourced-plaster class: under the photo set none of the map's render tones showed) the walls the
    // procedural limeRender canvas, the primary family's tone measured on it against the reference photos (the sooty render: the map's tone, #877e75)
    sourced: { plaster: false, wood: true },
    render: { kind: 'limeRender', seed: 0x3e56 },
    tones: { plaster2: (_h, s, l) => [0.11, Math.min(1, s * 0.6 + 0.2), Math.min(1, l * 1.1 + 0.08)] },
  },
  builders: RUHR_BUILDERS,
  // soot from the junction's engines and the pits' stacks on every wall and roof (map-revival's wave 362: "clean orange
  // brick boxes ... nothing like the dense, soot-darkened terraced streets round a 1962 Ruhr junction"): the brick from
  // red to smoke-dark, the yellow bands dulled, the slate blackened
  weather: {
    plaster: [[0.9, 0.88, 0.84], [0.82, 0.8, 0.77], [0.74, 0.72, 0.7]],
    stone: [[0.8, 0.76, 0.74], [0.7, 0.66, 0.64], [0.6, 0.57, 0.56], [0.75, 0.71, 0.68]],
    roof: [[0.92, 0.92, 0.92], [0.8, 0.79, 0.79], [0.7, 0.69, 0.7]],
  },
  // the colliery cottages' gardens: a board fence round the vegetable plot behind the pair, a gate (yards.ts; the
  // facades lane, 2026-10-06, after waves 182-184 read the white picket as American: a Ruhr colony fenced its gardens in
  // rough boards)
  yard: { kinds: ['rowhouse'], fence: 'fenceplank', gate: 'gate', shed: null, garden: true },
});

export type { RegionalParts };
