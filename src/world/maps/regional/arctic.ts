// src/world/maps/regional/arctic.ts — the arctic kit (Whiteout Station: DYE-M, the Distant Early Warning Line's eastern
// main station at Cape Dyer, Baffin Island, in the 1980s, as the North Warning System replaced the line; map-revival
// lane 2, 2026-10-05). Nothing stands on the permafrost: the station's buildings are prefabricated insulated modules raised on
// steel piles so their heat cannot thaw the ground, joined end to end in the module train under the white radome;
// the tropospheric-scatter antennas stand beside it, great curved billboards on lattice frames facing the next station
// over the horizon; a radar on a lattice tower under its own small radome; the steel vehicle garages and the warehouse,
// insulated sheds with their overhead doors; the arched Jamesway huts of the construction camps; the plywood utility
// sheds on skids; a module stripped and left to the wind.
import {
  PartSink, faceBox, facePoint, rgb, shade,
  type EmitOptions, type Face, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
// (the looks lane's r2 sweep, 2026-10-16: the module train, the billboard, the derelict, the radar tower and the Jamesway hut
// are the looks lane's, in arcticStation.ts)
import { derelict, jamesway, moduleTrain, radarTower, tropo } from './arcticStation.ts';
import { shed } from './arcticShed.ts'; // (props census #17: the utility shed, the looks lane's)

const STEEL = rgb(0x5d6266);
export const STEEL_DARK = rgb(0x34383b);
const WHITE = rgb(0xe8e9e6), ORANGE = rgb(0xc4602b), BLUE = rgb(0x6f8796);
export const OLIVE = rgb(0x5a5a3e), PLY = rgb(0xa58a60);
const RADOME = rgb(0xf0f0ec);
/** (round 3, wave 130: the radar tower's dark lattice under its white dome read as "a wooden water tower") hot-dip
 * galvanised steel, the pale grey the line's towers weathered to */
export const GALV = rgb(0xa3aaae);
/** The renders of the kit (its tones): white panels, safety orange, a pale blue-grey. */
type Paint = 'plaster' | 'plaster2' | 'plaster3';
const PAINT_RGB: Readonly<Record<Paint, Rgb>> = { plaster: WHITE, plaster2: ORANGE, plaster3: BLUE };

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** The base geometry's measured box less the kit's own overhang (the coordinator's rule: fill the base's bounds). */
export function wallsIn(ctx: RegionalBuildContext, ex: number, ez: number): { cx: number; cz: number; w: number; d: number } {
  const b = ctx.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX - 2 * ex, d: b.maxZ - b.minZ - 2 * ez };
}
export const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
/** A look-only choice from the building's own identity, drawn from a fork of its variant stream's seed. */
const hashPlot = (ctx: RegionalBuildContext): number => { const v = ctx.variant; const a = v(), b = v(); return (a + b * 0.5) % 1; };

export const WINDOW: WindowStyle = {
  frame: STEEL_DARK, frameWidth: 0.06, frameOut: 0.03, bars: 'none',
  surround: { bucket: 'structureMetal', width: 0.08, out: 0.03, colour: STEEL },
  // (the sill is the steel drip flashing: it stands well proud of the skin)
  sill: { bucket: 'structureMetal', out: 0.1, colour: STEEL }, shutters: null,
};

/**
 * An insulated sectional overhead door (round 2, gauntlet wave 112b: "a door of vertical boards ... a plastered barn rather
 * than a steel-panel garage with a sectional overhead door"): the steel frame, the leaf of five horizontal sections in the
 * wall's paint, the joints between them, a row of small panes in the second section from the top, the bottom seal.
 */
function overheadDoor(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, paint: Paint): void {
  const steel = { colour: STEEL, decor: true } as const;
  faceBox(sink, 'structureMetal', face, u - w / 2 - 0.07, y + h / 2, 0.04, 0.14, h + 0.1, 0.08, steel);
  faceBox(sink, 'structureMetal', face, u + w / 2 + 0.07, y + h / 2, 0.04, 0.14, h + 0.1, 0.08, steel);
  faceBox(sink, 'structureMetal', face, u, y + h + 0.07, 0.04, w + 0.28, 0.14, 0.08, steel, 'ends');
  const leaf = { colour: shade(PAINT_RGB[paint], 0.9), decor: true };
  // (props census #4, lane B 2026-10-14: "dark panes stuck on the door") the leaf's sections, the glazed one cut: the
  // leaf under and over the pane row, the stiles between the panes, the glass 1 cm back in each cut and the garage's dark
  // behind it (a box against the leaf's back)
  const py0 = y + h * 0.66, py1 = y + h * 0.74, pw = w * 0.16, pm = (py0 + py1) / 2;
  faceBox(sink, 'structureMetal', face, u, (y + py0) / 2, -0.02, w, py0 - y, 0.04, leaf);
  faceBox(sink, 'structureMetal', face, u, (py1 + y + h) / 2, -0.02, w, y + h - py1, 0.04, leaf);
  const cuts = [0, 1, 2, 3].map((k) => u - w * 0.375 + k * w * 0.25);
  const edges = [u - w / 2, ...cuts.flatMap((c) => [c - pw / 2, c + pw / 2]), u + w / 2];
  for (let i = 0; i + 1 < edges.length; i += 2) faceBox(sink, 'structureMetal', face, (edges[i] + edges[i + 1]) / 2, pm, -0.02, edges[i + 1] - edges[i], py1 - py0, 0.04, leaf, 'caps');
  for (const c of cuts) faceBox(sink, 'glass', face, c, pm, -0.01, pw, py1 - py0, 0.008, { decor: true });
  faceBox(sink, 'dark', face, u, pm, -0.14, w - 0.04, py1 - py0 + 0.06, 0.2, { decor: true });
  for (let k = 1; k < 5; k++) faceBox(sink, 'structureMetal', face, u, y + h * k / 5, 0.0, w, 0.035, 0.02, { colour: STEEL_DARK, decor: true, fine: true }, 'ends');
  faceBox(sink, 'structureMetal', face, u, y + 0.03, 0.01, w, 0.06, 0.03, { colour: STEEL_DARK, decor: true }, 'ends');
}

/**
 * The snow banked against a building that stands on the ground (round 2, wave 112b: "set straight onto a featureless snow
 * plane with no piles, drifts, contact shadows"): a bank along each ground-storey wall, deeper on the windward side,
 * running past the corners and cut away before every door and gate (the ploughed way in). Dressing.
 */
function drifts(sink: PartSink, frame: HouseFrame, openings: readonly Opening[], look: () => number): void {
  const foot = -0.3;
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    // (round 4, gauntlet wave 175: "no occlusion or drifts against buildings, so everything floats") the banks two to four
    // times what round 2 laid: a metre and more up the wall, two to three out
    const out = 1.6 + look() * 1.1;
    const cuts = openings.filter((o) => o.face === name && o.storey === 0 && (o.kind === 'door' || o.kind === 'gate'))
      .map((o) => [o.u - o.w / 2 - 0.8, o.u + o.w / 2 + 0.8] as const).sort((a, b) => a[0] - b[0]);
    let u = -half - out * 0.8;
    const runs: Array<[number, number]> = [];
    for (const [c0, c1] of cuts) { if (c0 > u) runs.push([u, c0]); u = Math.max(u, c1); }
    if (half + out * 0.8 > u) runs.push([u, half + out * 0.8]);
    const seed = face.origin[0] * 0.37 + face.origin[2] * 0.61 + name.length;
    for (const [u0, u1] of runs) {
      if (u1 - u0 < 0.8) continue;
      const h0 = 0.7 + look() * 0.7, h1 = 0.7 + look() * 0.7;
      bank(sink, face, u0, u1, h0, h1, out, foot, seed);
    }
  }
}

/** A bank's undulation along its run, 0–1: a fixed function of the place (no draw, so no build or look stream moves). */
export const wave = (u: number, s: number): number => 0.5 + 0.32 * Math.sin(u * 0.83 + s) + 0.18 * Math.sin(u * 1.91 + s * 2.3);

/**
 * One drift bank against a face from u0 to u1 (round 5, gauntlet wave 224: the banks "flat, unshaded pure-white faceted
 * polygons ... wedges with ruler-straight edges that read as cut paper"): stations a metre apart, each its own height up
 * the wall and its own reach (`wave`), the bank rising from both ends of the run over 1.4 m; at each station a steep face
 * from the wall to a rounded crest a third of the way out, then the long tail to the toe — so the bank takes the light in
 * facets and its crest and toe wander. h0 and h1 are its heights up the wall at the two ends, out its mean reach.
 */
export function bank(sink: PartSink, face: Face, u0: number, u1: number, h0: number, h1: number, out: number, foot: number, seed: number): void {
  const n = Math.max(2, Math.round((u1 - u0) / 1.0));
  const st: Array<{ wall: Vec3; crest: Vec3; toe: Vec3; base: Vec3 }> = [];
  for (let k = 0; k <= n; k++) {
    const u = u0 + (u1 - u0) * k / n;
    const e = Math.min(1, Math.min(u - u0, u1 - u) / 1.4), rise = e * e * (3 - 2 * e);
    const h = foot + ((h0 + (h1 - h0) * k / n) * (0.82 + 0.36 * wave(u, seed)) - foot) * (0.15 + 0.85 * rise);
    const reach = out * (0.82 + 0.36 * wave(u, seed + 1.9)) * (0.35 + 0.65 * rise);
    st.push({ wall: facePoint(face, u, h, 0.01), crest: facePoint(face, u, foot + (h - foot) * 0.82, reach * 0.3),
      toe: facePoint(face, u, foot, reach), base: facePoint(face, u, foot, 0.01) });
  }
  for (let k = 0; k < n; k++) {
    const a = st[k], b = st[k + 1];
    sink.polygon('plaster', [a.wall, a.crest, b.crest, b.wall], { decor: true });
    sink.polygon('plaster', [a.crest, a.toe, b.toe, b.crest], { decor: true });
  }
  const s = st[0], e = st[n];
  sink.polygon('plaster', [s.wall, s.base, s.toe, s.crest], { decor: true });
  sink.polygon('plaster', [e.wall, e.crest, e.toe, e.base], { decor: true });
}

/**
 * Rust run down painted steel (round 3, gauntlet wave 130: "uniformly clean with no rust streaking ... for decades-old
 * Arctic infrastructure"): thin streaks from under the eaves and the sills, each its own length, a few to a face. Dressing.
 */
const RUST = rgb(0x6a4630);
/** A dressing-only stream of its own (seeded from a part's place), so the streaks never shift the build or look streams. */
function rustStream(seed: number): () => number {
  let a = (Math.floor(seed * 1000) ^ 0x5bd1e995) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function rustStreaks(sink: PartSink, face: Face, top: number, look: () => number, per = 0.35, holes: readonly HoleRect[] = []): void {
  const n = Math.max(1, Math.round(face.width * per));
  for (let k = 0; k < n; k++) {
    const u = (look() - 0.5) * (face.width - 0.6), run = 0.5 + look() * 1.8, w = 0.03 + look() * 0.05;
    const colour = shade(RUST, 0.8 + look() * 0.4);
    // (a run a dozen times as long as it is wide at the least: a short dark tab reads as a slot, never as a rust run)
    const len = Math.max(run, 14 * w);
    // a run stops at the head of an opening cut under it (it ran round it; never across the cut); cut short, a stub is
    // left out (a dark tab over the head would read as a slot)
    let foot = top - len;
    for (const h of holes) if (u + w / 2 > h.u0 - 0.02 && u - w / 2 < h.u1 + 0.02 && h.y1 > foot && h.y0 < top) foot = Math.max(foot, h.y1 + 0.01);
    if (top - foot >= (foot > top - len ? Math.max(0.12, 14 * w) : 0.12)) faceBox(sink, 'structureMetal', face, u, (top + foot) / 2, 0.005, w, top - foot, 0.008, { colour, decor: true, fine: true });
  }
}

/** The cuts of a house's openings on one face, in its frame (for the rust runs to stop at). */
function openingCuts(frame: HouseFrame, openings: readonly Opening[], name: 'front' | 'back' | 'left' | 'right'): HoleRect[] {
  return openings.filter((o) => o.face === name).map((o) => {
    const y = frame.bodies[o.storey].y0 + o.y0;
    return { u0: o.u - o.w / 2, u1: o.u + o.w / 2, y0: y, y1: y + o.h };
  });
}

function dialect(rng: () => number, paint: Paint): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, WINDOW, rng, 0.5),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        overheadDoor(sink, face, o.u, y0 + o.y0, o.w, o.h, paint);
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: STEEL, frame: { bucket: 'structureMetal', width: 0.1, out: 0.04, colour: STEEL_DARK },
        steps: o.storey === 0 ? { bucket: 'stone' } : null, leafKind: 'panel', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** A face of an axis-aligned box: `side` 'n' (-z), 's' (+z), 'e' (+x), 'w' (-x). */
export function boxFace(x0: number, z0: number, x1: number, z1: number, side: 'n' | 's' | 'e' | 'w'): Face {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (side === 's') return { origin: [cx, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 };
  if (side === 'n') return { origin: [cx, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: x1 - x0 };
  if (side === 'e') return { origin: [x1, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: z1 - z0 };
  return { origin: [x0, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: z1 - z0 };
}

/** A white sphere of stacked frustums (the radome) on its ring beam, `y` the ring beam's top. */
export function radome(sink: PartSink, cx: number, y: number, cz: number, r: number, segments: number): void {
  sink.cylinder('structureMetal', [cx, y - 0.4, cz], 'y', 0.4, r * 0.82, segments, { colour: STEEL });
  const rings = 7;
  // from the ring beam (a little under the equator: the dome is three-quarters of a sphere) to the top
  const a0 = -0.55;
  for (let k = 0; k < rings; k++) {
    const t0 = a0 + (Math.PI / 2 - a0) * k / rings, t1 = a0 + (Math.PI / 2 - a0) * (k + 1) / rings;
    const y0 = y + r * (Math.sin(t0) - Math.sin(a0)), y1 = y + r * (Math.sin(t1) - Math.sin(a0));
    sink.cylinder('plaster', [cx, y0, cz], 'y', y1 - y0, r * Math.cos(t0), segments, { colour: RADOME }, Math.max(0.02, r * Math.cos(t1)), k === 0);
  }
}

// ------------------------------------------------------------------------------------------------ the station

/**
 * The vehicle garage (the depot's plot, its doors to +x): a long insulated steel shed under a low gable of ribbed
 * sheet, three overhead doors on the apron side, the man door and a few small windows, the concrete apron before it.
 */
const garage: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const bb = ctx.bounds;
  const apron = clamp((bb.maxX - bb.minX) * 0.24, 2.2, 3.2);
  const W = clamp(bb.maxX - bb.minX - apron - 0.6, 7, 12), D = clamp(bb.maxZ - bb.minZ - 0.6, 12, 24);
  const paint: Paint = look() < 0.6 ? 'plaster2' : look() < 0.5 ? 'plaster3' : 'plaster';
  sink.placed(0, bb.minX + 0.3 + W / 2, 0, (bb.minZ + bb.maxZ) / 2, () => {
    const n = Math.max(2, Math.min(4, Math.round(D / 6)));
    const openings: Opening[] = [];
    for (let k = 0; k < n; k++) openings.push({ face: 'right', storey: 0, kind: 'gate', u: -D / 2 + D * (k + 0.5) / n, w: 3.6, y0: 0, h: 3.8 });
    openings.push({ face: 'front', storey: 0, kind: 'door', u: -W * 0.25, w: 1.0, y0: 0, h: 2.1 });
    for (const o of windowRhythm('left', 0, D, { w: 1.0, h: 0.7, sill: 2.4, spacing: 3.2, margin: 1.6, max: 6 })) openings.push(o);
    for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 0.7, sill: 2.4, spacing: 2.4, margin: W * 0.45, max: 1 })) openings.push(o);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 10, eave: 0.35, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: 4.6, wall: paint }], roof, gableBucket: paint, openings,
      chimneys: [{ x: -W * 0.25, z: -D * 0.3, sx: 0.3, sz: 0.3, above: 1.4, bucket: 'structureMetal', cap: 'none' }],
      gutters: null, verge: null, reveal: 0.14, spall: null,
    }, dialect(rng, paint));
    drifts(sink, frame, openings, look);
    // (round 3, wave 130: "uniformly clean, no rust streaking") the rust run from under the eaves on every wall
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      rustStreaks(sink, frame.faces[name], frame.eaveY - 0.15, rustStream(frame.eaveY * 13.1 + frame.faces[name].width * 5.3 + name.length), 0.3,
        openingCuts(frame, openings, name));
    }
    // the apron along the doors
    sink.span('stone', W / 2, -0.3, -D / 2, W / 2 + apron, 0.08, D / 2);
  });
  return sink.finish();
};

/**
 * The fuel tank farm (on some of the depots' plots): two vertical tanks of white steel under shallow cones inside the
 * gravel berm that would hold a spill, their ladders and the walkway between their tops, the pump house in a corner and
 * the pipe run from the tanks to it.
 */
const tankFarm: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, z1 = bb.maxZ - 0.15;
  const t = 1.2, bh = 1.1;
  // the berm: four gravel banks round the plot
  sink.span('stone', x0, -0.3, z0, x1, bh, z0 + t);
  sink.span('stone', x0, -0.3, z1 - t, x1, bh, z1);
  sink.span('stone', x0, -0.3, z0 + t, x0 + t, bh, z1 - t);
  sink.span('stone', x1 - t, -0.3, z0 + t, x1, bh, z1 - t);
  const iw = x1 - x0 - 2 * t, id = z1 - z0 - 2 * t, cx = (x0 + x1) / 2;
  const R = clamp(Math.min(iw / 2 - 0.5, id / 4 - 0.6), 2.2, 4.4), H = 6.2;
  const zs = [z0 + t + 0.5 + R, z1 - t - 0.5 - R];
  for (const tz of zs) {
    sink.cylinder('plaster', [cx, -0.2, tz], 'y', H + 0.2, R, 16, {});
    sink.cylinder('roof', [cx, H, tz], 'y', 0.9, R + 0.08, 16, {}, 0.35);
    // the ladder up the side to the roof and the walkway rail
    if (!mobile) {
      for (const s of [-1, 1]) sink.span('structureMetal', cx + R + 0.05, 0.2, tz + s * 0.25 - 0.03, cx + R + 0.11, H + 0.6, tz + s * 0.25 + 0.03, { colour: STEEL_DARK, decor: true });
      for (let y = 0.5; y < H; y += 0.4) sink.span('structureMetal', cx + R + 0.05, y, tz - 0.25, cx + R + 0.11, y + 0.04, tz + 0.25, { colour: STEEL_DARK, decor: true, fine: true });
    }
  }
  // the walkway between the tops
  if (!mobile) sink.span('structureMetal', cx - 0.5, H + 0.3, zs[0], cx + 0.5, H + 0.42, zs[1], { colour: STEEL, decor: true });
  // the pump house in a corner inside the berm, the pipe run along the tanks to it
  const px0 = x1 - t - 2.4, pz0 = (zs[0] + zs[1]) / 2 - 1.3;
  sink.span('plaster2', px0, 0, pz0, x1 - t - 0.1, 2.5, pz0 + 2.6);
  sink.span('roof', px0 - 0.1, 2.5, pz0 - 0.1, x1 - t, 2.65, pz0 + 2.7);
  if (!mobile) sink.cylinder('structureMetal', [px0 - 0.2, 0.6, zs[0]], 'z', zs[1] - zs[0], 0.14, 8, { colour: STEEL, decor: true });
  return sink.finish();
};

/**
 * The warehouse (the warehouse's plot): a big insulated steel building under a low ribbed gable, the rolling door and
 * the man door in its front gable to the apron, a row of small windows high in its long sides.
 */
const warehouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const bb = ctx.bounds;
  const apron = clamp((bb.maxZ - bb.minZ) * 0.1, 2.0, 3.0);
  const W = clamp(bb.maxX - bb.minX - 0.7, 10, 18), D = clamp(bb.maxZ - bb.minZ - apron - 0.6, 14, 28);
  const paint: Paint = look() < 0.55 ? 'plaster3' : 'plaster';
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, bb.minZ + 0.3 + D / 2, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: -W * 0.12, w: Math.min(5.0, W * 0.36), y0: 0, h: 4.6 },
      { face: 'front', storey: 0, kind: 'door', u: W * 0.3, w: 1.0, y0: 0, h: 2.1 },
      { face: 'back', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.6 },
    ];
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.2, h: 0.6, sill: 4.4, spacing: 3.6, margin: 2.0, max: 7 })) openings.push(o);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 9, eave: 0.35, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [{ h: 6.4, wall: paint }], roof, gableBucket: paint, openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.14, spall: null,
    }, dialect(rng, paint));
    drifts(sink, frame, openings, look);
    // (round 3, wave 130: "uniformly clean, no rust streaking") the rust run from under the eaves on every wall
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      rustStreaks(sink, frame.faces[name], frame.eaveY - 0.15, rustStream(frame.eaveY * 13.1 + frame.faces[name].width * 5.3 + name.length), 0.3,
        openingCuts(frame, openings, name));
    }
    sink.span('stone', -W / 2, -0.3, D / 2, W / 2, 0.08, D / 2 + apron);
    // the band of the station's colour round the eaves
    sink.span('plaster2', -W / 2 - 0.03, 5.85, -D / 2 - 0.03, W / 2 + 0.03, 6.35, D / 2 + 0.03);
  });
  return sink.finish();
};

export const ARCTIC_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  foundryoffice: (ctx) => moduleTrain(ctx),
  firestation: (ctx) => tropo(ctx),
  watertower: (ctx) => radarTower(ctx),
  // a depot's plot is the vehicle garage, or on some (one in three) the fuel tank farm in its berm
  depot: (ctx) => (hashPlot(ctx) < 0.34 ? tankFarm(ctx) : garage(ctx)),
  warehouse,
  containerRow: (ctx) => jamesway(ctx),
  ruin: (ctx) => derelict(ctx),
  woodshed: shed,
});

export const ARCTIC_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'arctic',
  region: 'Cape Dyer, Baffin Island, 1980s: DYE-M, a DEW Line main station on its plateau above Davis Strait (module train, radome, tropo-scatter billboards, Jamesways, steel garages)',
  surfaces: {
    // ribbed sheet steel
    roof: { kind: 'sheet', tint: [0.72, 0.74, 0.76] },
    // the concrete of the aprons and the footings
    stone: { kind: 'block', tint: [0.66, 0.66, 0.65] },
    sourced: { plaster: false, wood: true },
    tones: {
      // the insulated panels, white
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.06), Math.min(1, l * 0.22 + 0.72)],
      // safety orange, sun-faded
      plaster2: (_h, s, l) => [0.055, Math.min(1, 0.6 + s * 0.2), Math.min(1, l * 0.3 + 0.36)],
      // a pale blue-grey
      plaster3: (_h, s, l) => [0.56, Math.min(1, 0.1 + s * 0.1), Math.min(1, l * 0.3 + 0.44)],
    },
    // round 2 (the render canvas read as stucco on the station's steel: the warehouse walls "popcorn" at 10 m): the
    // painted panels nearly smooth, the canvas's grain a faint skin (surfaces.relief)
    relief: { plasterUv: 2.6, normal: 0.14, ao: 0.3 },
  },
  builders: ARCTIC_BUILDERS,
  // painted steel under the wind and the cold: little damp, no moss, the rust at the feet
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.98, 0.97], [0.96, 0.97, 0.98]],
    stone: [[1, 1, 1], [0.96, 0.96, 0.95], [0.92, 0.92, 0.92]],
    roof: [[1, 1, 1], [0.94, 0.94, 0.95], [0.88, 0.86, 0.84]],
    damp: 0.25, moss: 0,
  },
  wear: 0.1,
});
