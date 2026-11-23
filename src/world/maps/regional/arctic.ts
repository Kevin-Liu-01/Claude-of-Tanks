// src/world/maps/regional/arctic.ts — the arctic kit (Whiteout Station: DYE-M, the Distant Early Warning Line's eastern
// main station at Cape Dyer, Baffin Island, in the 1980s, as the North Warning System replaced the line; map-revival
// lane 2, 2026-10-05). Nothing stands on the permafrost: the station's buildings are prefabricated insulated modules raised on
// steel piles so their heat cannot thaw the ground, joined end to end in the module train under the white radome;
// the tropospheric-scatter antennas stand beside it, great curved billboards on lattice frames facing the next station
// over the horizon; a radar on a lattice tower under its own small radome; the steel vehicle garages and the warehouse,
// insulated sheds with their overhead doors; the arched Jamesway huts of the construction camps; the plywood utility
// sheds on skids; a module stripped and left to the wind.
import {
  PartSink, faceBox, facePoint, normalize3, rgb, shade,
  type EmitOptions, type Face, type Rgb, type Vec3,
} from './geometry.ts';
import { DOME_MIN_RINGS, domeSegments } from './domes.ts';
import { buildHouse, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofRelief, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { doorCanopy, facadeOn, pilaster } from './facade.ts';
import { roofLadder, wallLantern } from './dressing.ts';
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
/**
 * (dome-detail-275, the roof sweep) The ribbed steel sheets in relief (house.ts RoofSpec.relief): the sheets 0.9 m in
 * cover lapped in their courses, their ribs drawn across them; the utility shed's and the modules' roofs (FELT, the
 * modules' membrane over their insulated panels) likewise.
 */
export const RIBBED: RoofRelief = { kind: 'sheet', pitch: 0.9, ribs: 2 };
export const FELT: RoofRelief = { kind: 'felt' };
/** Snow drawn in steel's coloured bucket on a pinned texel (a tank's skirt of drift; dome-detail-275). */
const SNOW = rgb(0xf4f5f6);
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
  // (the looks lane, 227, BLD-04: the census read the station's windows as single blank lights) the line's insulated
  // horizontal sliders: two sashes, the meeting stile between them
  frame: STEEL_DARK, frameWidth: 0.06, frameOut: 0.03, bars: 'two',
  surround: { bucket: 'structureMetal', width: 0.08, out: 0.03, colour: STEEL },
  // (the sill is the steel drip flashing: it stands well proud of the skin)
  sill: { bucket: 'structureMetal', out: 0.1, colour: STEEL }, shutters: null,
  // (227) and the head flashing over the surround, the drip cap a steel skin's every opening carries (desktop craft: the
  // surround's own head on a phone)
  head: { kind: 'lintel', bucket: 'structureMetal', h: 0.07, out: 0.09, ext: 0.03, colour: STEEL },
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

/** Safety yellow: the guard posts at the vehicle doors. */
const YELLOW = rgb(0xd2a62a);

/**
 * A steel building's finish (the looks lane, 227, BLD-04: the census read 9 of Verdant's 20 elements; the line's steel
 * garages and warehouses as their contractors left them), the facade craft of a desktop build, all of it decor and none of
 * it drawing from the build or look streams: the corner flashings up every corner (broken round the station's colour band
 * at `band`), a steel hood over each man door with the vapour-proof lamp on its bracket beside it, a lamp over each
 * overhead door and the concrete-filled guard posts at its jambs, the flue pipe and its rain cap over each chimney chase,
 * and the roof ladder up to the first flue from the eave on its side.
 */
function steelCraft(sink: PartSink, frame: HouseFrame, openings: readonly Opening[], band: readonly [number, number] | null = null,
  porched: readonly Opening[] = []): void {
  if (!facadeOn()) return;
  const y0 = frame.floors[0] + 0.02, y1 = frame.eaveY - 0.02;
  const runs: Array<[number, number]> = band ? [[y0, band[0] - 0.02], [band[1] + 0.02, y1]] : [[y0, y1]];
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    for (const side of [-1, 1]) for (const [a, b] of runs) pilaster(sink, 'structureMetal', face, side * (half - 0.06), a, b, 0.12, 0.025, { colour: STEEL });
    // the insulated panels' joints every 1.2 m up the wall, a shade under its paint, broken round the openings' frames and
    // the band (the modules' seams, the same panels)
    const wall = PAINT_RGB[frame.spec.storeys[0].wall as Paint] ?? WHITE;
    // (the blind pair: at 0.8 the joints on a long side seen raking read as streaks) a shade under the paint
    const seam = { colour: shade(wall, 0.87), decor: true, fine: true } as const;
    const cuts = openingCuts(frame, openings, name).map((c, k) => {
      const m = openings.filter((o) => o.face === name)[k]?.kind === 'gate' ? 0.2 : 0.15;
      return { u0: c.u0 - m, u1: c.u1 + m, y0: c.y0 - 0.12, y1: c.y1 + 0.2 };
    });
    if (band) cuts.push({ u0: -half, u1: half, y0: band[0] - 0.02, y1: band[1] + 0.02 });
    for (let u = -half + 1.2; u < half - 0.3; u += 1.2) {
      let from = y0;
      for (const c of cuts.filter((q) => u > q.u0 && u < q.u1).sort((p, q) => p.y0 - q.y0)) {
        if (c.y0 - from > 0.1) faceBox(sink, 'structureMetal', face, u, (from + c.y0) / 2, 0.01, 0.04, c.y0 - from, 0.02, seam, 'caps');
        from = Math.max(from, c.y1);
      }
      if (y1 - from > 0.1) faceBox(sink, 'structureMetal', face, u, (from + y1) / 2, 0.01, 0.04, y1 - from, 0.02, seam, 'caps');
    }
  }
  for (const o of openings) {
    if (o.storey !== 0) continue;
    const face = frame.faces[o.face], top = frame.floors[0] + o.y0 + o.h, half = face.width / 2;
    // (dome-detail-275: a door behind an arctic entry takes no hood or lamp of its own; the porch carries them)
    if (porched.includes(o)) continue;
    if (o.kind === 'door') {
      doorCanopy(sink, face, o.u, top, o.w, { kind: 'shed', bucket: 'structureMetal', colour: STEEL, timber: STEEL_DARK, depth: 0.9 });
      // the lamp beside the hood, on the side clearer of the face's other openings (and inside the face)
      const off = (o.w + 0.7) / 2 + 0.25;
      const room = (u: number): number => Math.min(half - Math.abs(u) - 0.2,
        ...openings.filter((q) => q !== o && q.face === o.face && q.storey === 0).map((q) => Math.abs(q.u - u) - q.w / 2 - 0.25));
      const u = room(o.u + off) >= room(o.u - off) ? o.u + off : o.u - off;
      if (room(u) > 0.1) wallLantern(sink, face, u, top + 0.12);
    } else if (o.kind === 'gate') {
      // the lamp over the door's head (its frame stands 14 cm over the opening); the jamb guards beside the frame, concrete-
      // filled pipes in safety yellow a hand off the wall, braced back to it twice (the blind pair: free posts a stride out
      // stood buried to their caps where a slope's snow rose over the apron; on the wall they stand with the door)
      wallLantern(sink, face, o.u, top + 0.36);
      for (const side of [-1, 1]) {
        const u = o.u + side * (o.w / 2 + 0.26), p = facePoint(face, u, -0.2, 0.16);
        sink.cylinder('structureMetal', p, 'y', 1.75, 0.085, 8, { colour: YELLOW, decor: true });
        sink.cylinder('structureMetal', [p[0], 1.55, p[2]], 'y', 0.05, 0.085, 8, { colour: shade(YELLOW, 0.8), decor: true }, 0.04);
        for (const y of [0.55, 1.3]) faceBox(sink, 'structureMetal', face, u, y, 0.06, 0.05, 0.05, 0.12, { colour: STEEL_DARK, decor: true });
      }
    }
  }
  const rg = frame.roof;
  frame.spec.chimneys.forEach((c, k) => {
    const top = (rg.topAt(c.x, c.z) ?? rg.ridgeTopY) + c.above, r = Math.min(c.sx, c.sz) * 0.3;
    sink.cylinder('structureMetal', [c.x, top - 0.05, c.z], 'y', 0.6, r, 8, { colour: STEEL_DARK, decor: true });
    sink.cylinder('structureMetal', [c.x, top + 0.48, c.z], 'y', 0.16, r + 0.13, 8, { colour: STEEL_DARK, decor: true }, 0.03);
    if (k === 0 && rg.s > 0.8) {
      const side = c.x >= 0 ? 1 : -1, z = c.z + (c.z < 0 ? 0.75 : -0.75), rise = Math.max(0.2, 1 - (Math.abs(c.x) + 0.1) / rg.s);
      roofLadder(sink, frame, side, z, rise, GALV);
      // (kitConnectivity: the rails ride 26 mm over the sheet) the hook brackets they ride on, three to a rail, from the sheet
      // up into the rail (roofLadder's rail line: from 0.92 of the slope's run to its top at 1 - rise)
      const xa = rg.s * 0.92, xb = Math.max(0.3, rg.s * (1 - rise));
      for (const dz of [-0.2, 0.2]) for (const t of [0.08, 0.5, 0.92]) {
        const x = side * (xa + (xb - xa) * t), top = rg.topAt(x, z + dz) ?? rg.eaveY;
        sink.span('structureMetal', x - 0.02, top - 0.01, z + dz - 0.025, x + 0.02, top + 0.036, z + dz + 0.025, { colour: STEEL_DARK, decor: true });
      }
    }
  });
}

/**
 * The ribbed steel sheets of a gable roof in relief (dome-detail-275; the roof guidance: "sheets with laps"): the
 * standing ribs at the sheets' side laps every 0.9 m from the eave to the ridge cap, and the end lap across each slope
 * where the upper sheet runs over the lower one. Dressing on the slab (house.ts roofGeometry: the ridge along z); over the
 * war's stripped patch (HouseFrame.roofPatch) the ribs crossing it stop at its edges and the lap with them.
 */
function sheetRibs(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const rg = frame.roof, roof = frame.spec.roof;
  if (rg.kind !== 'gable') return;
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const yEave = rg.ridgeY + roof.thickness / cosP - xe * rg.tanP;
  const D = rg.halfD + roof.verge - 0.08, n = Math.max(4, Math.round((2 * D) / 0.9)), L = xe / cosP - 0.14;
  const patch = frame.roofPatch;
  for (const side of [1, -1] as const) {
    const up: Vec3 = [-side * cosP, sinP, 0], nrm: Vec3 = [side * sinP, cosP, 0];
    const P = (v: number, z: number): Vec3 => [side * xe + up[0] * v, yEave + up[1] * v, z];
    const hole: [number, number] | null = patch && patch.side === side ? [(xe - patch.x1) / cosP - 0.05, (xe - patch.x0) / cosP + 0.05] : null;
    const lay = (v0: number, v1: number, z: number, w: number, h: number, shadeK: number, fine = false): void => {
      if (v1 - v0 > 0.1) sink.member('roof', P(v0, z), P(v1, z), w, h, nrm, { decor: true, shade: shadeK, ...(fine ? { fine: true } : {}) });
    };
    for (let k = 0; k <= n; k++) {
      const z = -D + (k * 2 * D) / n;
      if (hole && patch && z > patch.z0 - 0.05 && z < patch.z1 + 0.05) { lay(0.02, hole[0], z, 0.06, 0.04, 0.86); lay(hole[1], L, z, 0.06, 0.04, 0.86); }
      else lay(0.02, L, z, 0.06, 0.04, 0.86);
    }
    const vl = L * (0.42 + look() * 0.16);
    if (!(hole && vl > hole[0] && vl < hole[1])) sink.member('roof', P(vl, -D), P(vl, D), 0.04, 0.018, nrm, { decor: true, shade: 0.78, fine: true });
  }
}

/** Gravity ventilators straddling the ridge (dome-detail-275): a sheet box on the ridge cap, its louvre band and hood. */
function ridgeVents(sink: PartSink, frame: HouseFrame, zs: readonly number[]): void {
  const top = frame.roof.ridgeTopY;
  for (const z of zs) {
    sink.span('structureMetal', -0.36, top - 0.3, z - 0.36, 0.36, top + 0.32, z + 0.36, { colour: STEEL, decor: true });
    sink.span('structureMetal', -0.33, top + 0.32, z - 0.33, 0.33, top + 0.5, z + 0.33, { colour: STEEL_DARK, decor: true });
    sink.span('structureMetal', -0.5, top + 0.5, z - 0.5, 0.5, top + 0.58, z + 0.5, { colour: STEEL, decor: true });
  }
}

/** A gable louvre (dome-detail-275): the sheet frame, the dark behind, its blades (fine). */
function louvre(sink: PartSink, face: Face, u: number, y: number, w: number, h: number): void {
  faceBox(sink, 'structureMetal', face, u, y, 0.03, w + 0.12, h + 0.12, 0.06, { colour: STEEL, decor: true });
  faceBox(sink, 'structureMetal', face, u, y, 0.065, w, h, 0.01, { colour: STEEL_DARK, decor: true });
  for (let k = 0; k < Math.round(h / 0.12); k++) faceBox(sink, 'structureMetal', face, u, y - h / 2 + 0.06 + k * 0.12, 0.09, w, 0.03, 0.05, { colour: STEEL, decor: true, fine: true });
}

/**
 * A heating-oil day tank on its saddles (dome-detail-275): a horizontal white drum along x from x0 to x1, its bands, the
 * gauge and vent on its crown, and the feed line from under it to the wall at `feed`.
 */
function dayTank(sink: PartSink, x0: number, x1: number, z: number, r: number, feed: Vec3): void {
  for (const x of [x0 + 0.25, x1 - 0.25]) sink.span('structureMetal', x - 0.08, 0, z - r * 0.8, x + 0.08, r * 0.85, z + r * 0.8, { colour: STEEL_DARK });
  sink.revolve('structureMetal', [x0, r + 0.25, z], 'x', [[0, 0.05], [0.06, r * 0.8], [0.14, r], [x1 - x0 - 0.14, r], [x1 - x0 - 0.06, r * 0.8], [x1 - x0, 0.05]], 16,
    { colour: WHITE, colourAt: (p) => shade(WHITE, p[1] < r * 0.6 ? 0.84 : 0.97), uvPin: [0.5, 0.5] });
  for (const x of [x0 + 0.25, x1 - 0.25]) sink.revolve('structureMetal', [x - 0.04, r + 0.25, z], 'x', [[0, r + 0.015], [0.08, r + 0.015]], 16, { colour: STEEL_DARK, decor: true, uvPin: [0.5, 0.5] });
  const xm = (x0 + x1) / 2;
  sink.span('structureMetal', xm - 0.12, 2 * r + 0.2, z - 0.12, xm + 0.12, 2 * r + 0.42, z + 0.12, { colour: STEEL_DARK, decor: true });
  sink.pipe('structureMetal', [xm + 0.4, 2 * r + 0.2, z], [xm + 0.4, 2 * r + 0.75, z], 0.04, 6, { colour: STEEL, decor: true });
  sink.pipe('structureMetal', [xm, feed[1], z], feed, 0.04, 6, { colour: STEEL_DARK, decor: true });
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

/** A white sphere (the radome) on its ring beam, `y` the ring beam's top. */
export function radome(sink: PartSink, cx: number, y: number, cz: number, r: number, segments: number): void {
  sink.cylinder('structureMetal', [cx, y - 0.4, cz], 'y', 0.4, r * 0.82, segments, { colour: STEEL });
  const rings = Math.max(DOME_MIN_RINGS + 3, Math.round(r * 4));
  // from the ring beam (a little under the equator: the dome is three-quarters of a sphere) to the top (dome-detail-275:
  // seven frustums of fourteen flat facets) turned smooth, closed underneath
  const a0 = -0.55, profile: Array<[number, number]> = [[0, 0]];
  for (let k = 0; k <= rings; k++) {
    const t = a0 + (Math.PI / 2 - a0) * k / rings;
    profile.push([r * (Math.sin(t) - Math.sin(a0)), Math.max(0, r * Math.cos(t))]);
  }
  sink.revolve('plaster', [cx, y, cz], 'y', profile, Math.max(segments, domeSegments(r)), { colour: RADOME });
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
      // (227, BLD-04) the rake trim down both gables' verges, the steel flashing over the sheets' cut ends
      gutters: null, verge: { colour: STEEL, bucket: 'structureMetal' }, reveal: 0.14, spall: null,
    }, dialect(rng, paint));
    drifts(sink, frame, openings, look);
    steelCraft(sink, frame, openings);
    // (round 3, wave 130: "uniformly clean, no rust streaking") the rust run from under the eaves on every wall
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      rustStreaks(sink, frame.faces[name], frame.eaveY - 0.15, rustStream(frame.eaveY * 13.1 + frame.faces[name].width * 5.3 + name.length), 0.3,
        openingCuts(frame, openings, name));
    }
    // the apron along the doors
    sink.span('stone', W / 2, -0.3, -D / 2, W / 2 + apron, 0.08, D / 2);
    // (dome-detail-275) the roof's ribbed sheets in relief and the ridge's two gravity ventilators; the intake louvre high
    // on the back wall; the heating-oil day tank on the apron's -z end; the block-heater posts along the apron's edge
    // between the doors, where the vehicles are plugged in against the cold
    sheetRibs(sink, frame, look);
    ridgeVents(sink, frame, [-D * 0.22, D * 0.22]);
    louvre(sink, frame.faces.back, W * 0.15, 4.15, 1.0, 0.6);
    dayTank(sink, W / 2 + 0.3, W / 2 + Math.min(1.6, apron - 0.4), -D / 2 + 0.55, 0.42, [W / 2 - 0.01, 0.42, -D / 2 + 0.55]);
    for (let k = 1; k < n; k++) {
      const z = -D / 2 + (D * k) / n, x = W / 2 + apron - 0.35;
      rod(sink, [x, 0, z], [x, 1.15, z], 0.1, YELLOW);
      sink.span('structureMetal', x - 0.09, 0.85, z - 0.11, x + 0.09, 1.1, z + 0.11, { colour: STEEL_DARK, decor: true });
      sink.span('structureMetal', x - 0.11, 1.15, z - 0.07, x + 0.11, 1.19, z + 0.07, { colour: shade(YELLOW, 0.8), decor: true });
    }
  });
  return sink.finish();
};

/** A straight steel member from a to b, `t` square, every face kept (a stringer, a post, a rail). (dome-detail-275) */
function rod(sink: PartSink, a: Vec3, b: Vec3, t: number, colour: Rgb, extra: EmitOptions = {}): void {
  const d = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = normalize3([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  sink.member('structureMetal', a, b, t, t, out, { colour, decor: true, ...extra, exposed: true }, t / 2);
}

/** A convex polygon's corners in the order that faces `want` (Newell's normal). (dome-detail-275) */
function facing(pts: readonly Vec3[], want: Vec3): Vec3[] {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return nx * want[0] + ny * want[1] + nz * want[2] >= 0 ? [...pts] : [...pts].reverse();
}

/**
 * One fuel tank of the farm (dome-detail-275; the work list: the farm's tanks were sixteen-sided drums under faceted
 * cones on a ruled box berm): the concrete ringwall, the shell in four welded plate courses each its own tone, the top
 * curb, the cone roof of ribbed sheet with its standing seams run to the crown, the vent and the roof hatch, the
 * station's orange band, the shell's manway, rust run down from the curb and the snow banked round its foot. Returns
 * the roof's height at a radius (for what lands on it).
 */
function fuelTank(sink: PartSink, cx: number, tz: number, R: number, H: number, look: () => number): (r: number) => number {
  const segs = domeSegments(R), rise = R * 0.2, eave = H + 0.12, crown = 0.35;
  sink.cylinder('stone', [cx, -0.3, tz], 'y', 0.55, R + 0.3, segs, { shade: 0.86 });
  // (welded plate, plain: the steel tile pinned; each of the four plate courses its own tone of the white, the grime of
  // the camp's dust and exhaust on the lowest)
  const tones = [0.88, 0.97 + look() * 0.03, 0.93 + look() * 0.04, 0.98];
  sink.revolve('structureMetal', [cx, 0.2, tz], 'y', [0, 1, 2, 3, 4].map((k): [number, number] => [k ? (H * k) / 4 - 0.2 : 0, R]), segs,
    { colour: WHITE, bandColour: (band) => shade(WHITE, tones[band]), uvPin: [0.5, 0.5] });
  sink.revolve('structureMetal', [cx, H - 0.02, tz], 'y', [[0, R + 0.05], [0.14, R + 0.05]], segs, { colour: STEEL, decor: true, uvPin: [0.5, 0.5] });
  sink.revolve('roof', [cx, eave, tz], 'y', [[-0.04, R + 0.12], [0, R + 0.12], [rise, crown]], segs, {});
  sink.cylinder('structureMetal', [cx, eave + rise - 0.05, tz], 'y', 0.2, crown + 0.04, 12, { colour: STEEL_DARK, decor: true });
  const roofAt = (r: number): number => eave + rise * (1 - (r - crown) / (R + 0.12 - crown));
  // the standing seams of the cone's sheets from the curb to the crown ring
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.13, c = Math.cos(a), s = Math.sin(a), r0 = R + 0.06, r1 = crown + 0.05;
    const n = normalize3([c * rise, R + 0.12 - crown, s * rise]);
    sink.member('roof', [cx + c * r0, roofAt(r0), tz + s * r0], [cx + c * r1, roofAt(r1), tz + s * r1], 0.05, 0.035, n, { decor: true, shade: 0.8 });
  }
  // the station's orange band under the curb; the gooseneck vent and the roof hatch
  sink.revolve('structureMetal', [cx, H - 1.25, tz], 'y', [[0, R + 0.014], [0.55, R + 0.014]], segs, { colour: ORANGE, decor: true, uvPin: [0.5, 0.5] });
  const va = 2.2, vr = R * 0.45, vx = cx + Math.cos(va) * vr, vz = tz + Math.sin(va) * vr;
  sink.pipe('structureMetal', [vx, roofAt(vr) - 0.05, vz], [vx, roofAt(vr) + 0.55, vz], 0.1, 8, { colour: STEEL, decor: true });
  sink.pipe('structureMetal', [vx, roofAt(vr) + 0.5, vz], [vx + 0.32, roofAt(vr) + 0.32, vz], 0.1, 8, { colour: STEEL, decor: true, caps: true });
  const ha = va + 1.4, hr = R * 0.55, hx = cx + Math.cos(ha) * hr, hzz = tz + Math.sin(ha) * hr;
  sink.span('structureMetal', hx - 0.35, roofAt(hr) - 0.1, hzz - 0.35, hx + 0.35, roofAt(hr) + 0.12, hzz + 0.35, { colour: STEEL_DARK, decor: true });
  // the shell's manway low on its -x side: the neck, the bolted cover
  sink.cylinder('structureMetal', [cx - R - 0.2, 0.95, tz], 'x', 0.25, 0.32, 12, { colour: WHITE, decor: true });
  sink.cylinder('structureMetal', [cx - R - 0.26, 0.95, tz], 'x', 0.07, 0.4, 12, { colour: STEEL, decor: true });
  // rust run from the curb, each run its own length and place (tangent to the shell)
  // (each on a facet's middle, a hair off its chord: kitConnectivity)
  const chord = R * Math.cos(Math.PI / segs) + 0.007;
  for (let k = 0; k < 6; k++) {
    const a = ((Math.floor(look() * segs) + 0.5) / segs) * Math.PI * 2, run = 0.8 + look() * 2.2, w = 0.04 + look() * 0.05;
    sink.placed(Math.PI / 2 - a, cx + Math.cos(a) * chord, 0, tz + Math.sin(a) * chord, () => {
      sink.span('structureMetal', -w / 2, H - 0.05 - run, -0.004, w / 2, H - 0.05, 0.006, { colour: shade(RUST, 0.8 + look() * 0.4), decor: true, fine: true });
    });
  }
  // the snow banked round the foot, up to the ringwall's lip
  sink.revolve('structureMetal', [cx, -0.3, tz], 'y', [[0, R + 1.3], [0.25, R + 0.85], [0.42, R + 0.5], [0.5, R + 0.32]], segs,
    { colour: SNOW, uvPin: [0.5, 0.5], decor: true });
  return roofAt;
}

/**
 * The fuel tank farm (on some of the depots' plots; dome-detail-275): two vertical tanks of white steel (fuelTank) inside
 * a gravel dike that would hold a spill, sloped both sides and capped with snow, a steel stair over its -z end; the
 * spiral stair up the first tank's shell to its roof rail, the walkway between the two roofs; the pump house between them
 * on the +x side (its shed roof, its door, lamp and louvre, its flue, its drifts and rust), the tanks' draw-off lines and
 * valves into it, and the fill line out of it over the dike on its support to the coupling at the plot's edge; a
 * floodlight mast on the dike's corner and the hazard board by the stair.
 */
const tankFarm: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const bb = ctx.bounds;
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, z1 = bb.maxZ - 0.15;
  // the dike: the outer toe on the plot's edge, the crest from 0.6 m in, 0.5 m across, the inner toe 1.7 m in
  const t = 1.7, bh = 1.1;
  const section = (o: number, sgn: 1 | -1): Array<[number, number]> => [[o, -0.3], [o, 0], [o + sgn * 0.6, bh], [o + sgn * 1.1, bh], [o + sgn * t, 0], [o + sgn * t, -0.3]];
  for (const [o, sgn] of [[x0, 1], [x1, -1]] as const) {
    sink.prism('stone', facing(section(o, sgn).map(([x, y]): Vec3 => [x, y, z0]), [0, 0, 1]), [0, 0, 1], z1 - z0);
  }
  for (const [o, sgn] of [[z0, 1], [z1, -1]] as const) {
    sink.prism('stone', facing(section(o, sgn).map(([z, y]): Vec3 => [x0 + 0.6, y, z]), [1, 0, 0]), [1, 0, 0], x1 - x0 - 1.2);
  }
  // the snow lying along the dike's crest in drifts, each its own depth
  const cap = (a: number, b: number, along: 'x' | 'z', o: number, sgn: 1 | -1): void => {
    const n = Math.max(1, Math.round((b - a) / 4));
    for (let k = 0; k < n; k++) {
      const d = 0.08 + look() * 0.14, s0 = a + ((b - a) * k) / n, s1 = a + ((b - a) * (k + 1)) / n + (k < n - 1 ? 0.05 : 0);
      const pts: Array<[number, number]> = [[o + sgn * 0.42, bh * 0.7 - 0.02], [o + sgn * 0.62, bh + d], [o + sgn * 1.08, bh + d * 0.8], [o + sgn * 1.3, bh * 0.66 - 0.02]];
      if (along === 'z') sink.prism('plaster', facing(pts.map(([x, y]): Vec3 => [x, y, s0]), [0, 0, 1]), [0, 0, 1], s1 - s0, { decor: true });
      else sink.prism('plaster', facing(pts.map(([z, y]): Vec3 => [s0, y, z]), [1, 0, 0]), [1, 0, 0], s1 - s0, { decor: true });
    }
  };
  cap(z0, z1, 'z', x0, 1); cap(z0, z1, 'z', x1, -1); cap(x0 + 1.2, x1 - 1.2, 'x', z0, 1); cap(x0 + 1.2, x1 - 1.2, 'x', z1, -1);
  const iw = x1 - x0 - 2 * t, id = z1 - z0 - 2 * t, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const R = clamp(Math.min(iw / 2 - 0.5, id / 4 - 0.6), 2.2, 4.4);
  const zs = [z0 + t + 0.5 + R, z1 - t - 0.5 - R];
  const Hs = [6.2 + (look() - 0.5) * 0.9, 6.2 + (look() - 0.5) * 0.9];
  const roofs = zs.map((tz, i) => fuelTank(sink, cx, tz, R, Hs[i], look));
  // the spiral stair up the first tank: its treads off the shell (grating: their tops and edges), the outer stringer and
  // its handrail on posts, from the floor between the tanks round the -x side to the roof on the -z side
  {
    const tz = zs[0], H = Hs[0], n = 18, a0 = Math.PI / 2 + 0.3 + look() * 0.15, sweep = 3.4, ro = R + 0.8;
    const ang = (k: number): number => a0 + (sweep * k) / (n - 1), lvl = (k: number): number => 0.3 + ((H - 0.3) * k) / (n - 1);
    const at = (k: number, r: number, dy = 0): Vec3 => [cx + Math.cos(ang(k)) * r, lvl(k) + dy, tz + Math.sin(ang(k)) * r];
    for (let k = 0; k < n; k++) sink.member('structureMetal', at(k, R + 0.01), at(k, ro), 0.3, 0.05, [0, 1, 0], { colour: GALV, decor: true, fine: true });
    const nodes = [0, 3, 6, 9, 12, 15, 17];
    rod(sink, [at(0, ro)[0], 0, at(0, ro)[2]], at(0, ro, -0.05), 0.08, GALV);
    for (let i = 0; i + 1 < nodes.length; i++) {
      rod(sink, at(nodes[i], ro + 0.04, -0.05), at(nodes[i + 1], ro + 0.04, -0.05), 0.08, GALV);
      rod(sink, at(nodes[i], ro + 0.04, 1.0), at(nodes[i + 1], ro + 0.04, 1.0), 0.045, YELLOW);
    }
    for (const k of nodes) rod(sink, at(k, ro + 0.04, -0.05), at(k, ro + 0.04, 1.02), 0.045, YELLOW, { fine: true });
    // the roof rail round the stair's head
    const roofAt = roofs[0], aEnd = ang(n - 1), rr = R - 0.1;
    const rail = (a: number, dy: number): Vec3 => [cx + Math.cos(a) * rr, roofAt(rr) + dy, tz + Math.sin(a) * rr];
    for (let k = 0; k < 5; k++) {
      const a = aEnd - 0.55 + k * 0.275;
      rod(sink, rail(a, -0.05), rail(a, 1.05), 0.045, YELLOW, { fine: true });
      if (k < 4) rod(sink, rail(a, 1.05), rail(a + 0.275, 1.05), 0.045, YELLOW);
    }
  }
  // the walkway between the two roofs: its deck from roof to roof, the rails on both sides
  {
    const za = zs[0] + R - 0.7, zb = zs[1] - R + 0.7, ya = roofs[0](R - 0.7) + 0.06, yb = roofs[1](R - 0.7) + 0.06;
    const L = Math.hypot(zb - za, yb - ya), out: Vec3 = [0, (zb - za) / L, -(yb - ya) / L];
    sink.member('structureMetal', [cx, ya, za], [cx, yb, zb], 0.9, 0.12, out, { colour: GALV, decor: true, exposed: true }, 0.06);
    for (const dx of [-0.42, 0.42]) {
      for (const f of [0, 0.5, 1]) rod(sink, [cx + dx, ya + (yb - ya) * f + 0.04, za + (zb - za) * f], [cx + dx, ya + (yb - ya) * f + 1.05, za + (zb - za) * f], 0.045, YELLOW);
      rod(sink, [cx + dx, ya + 1.05, za], [cx + dx, yb + 1.05, zb], 0.045, YELLOW);
    }
  }
  // the pump house between the tanks on the +x side: its body in the station's orange on a footing, the shed roof falling
  // to the dike, the steel door to the -x with its lamp, the louvre, the flue through the roof, the drifts against it
  const px1 = x1 - t - 0.05, px0 = px1 - 2.3, pz0 = cz - 1.2, pz1 = cz + 1.2, ph = 2.5;
  sink.span('stone', px0 - 0.08, -0.3, pz0 - 0.08, px1 + 0.08, 0.15, pz1 + 0.08, { shade: 0.85 });
  sink.span('plaster2', px0, 0.15, pz0, px1, ph, pz1);
  sink.prism('roof', facing([[px0 - 0.25, ph + 0.32, pz0 - 0.2], [px1 + 0.22, ph - 0.05, pz0 - 0.2], [px1 + 0.22, ph + 0.07, pz0 - 0.2], [px0 - 0.25, ph + 0.44, pz0 - 0.2]], [0, 0, 1]),
    [0, 0, 1], pz1 - pz0 + 0.4);
  // (the roof's wedge over the walls: the gap under the slope closed in the walls' paint)
  sink.prism('plaster2', facing([[px0, ph - 0.01, pz0], [px1, ph - 0.01, pz0], [px0, ph + 0.33, pz0]], [0, 0, 1]), [0, 0, 1], pz1 - pz0);
  const west = boxFace(px0, pz0, px1, pz1, 'w'), east = boxFace(px0, pz0, px1, pz1, 'e');
  const north = boxFace(px0, pz0, px1, pz1, 'n'), south = boxFace(px0, pz0, px1, pz1, 's');
  doorUnit(sink, west, 0.3, 0.15, 0.95, 2.05, { leaf: STEEL, frame: { bucket: 'structureMetal', width: 0.1, out: 0.04, colour: STEEL_DARK }, steps: null, leafKind: 'panel', transom: false });
  wallLantern(sink, west, -0.55, 2.0);
  faceBox(sink, 'structureMetal', south, 0.4, 1.7, 0.03, 0.8, 0.55, 0.06, { colour: STEEL_DARK, decor: true });
  for (let k = 0; k < 5; k++) faceBox(sink, 'structureMetal', south, 0.4, 1.48 + k * 0.1, 0.07, 0.76, 0.03, 0.04, { colour: STEEL, decor: true, fine: true });
  sink.cylinder('structureMetal', [px0 + 0.6, ph + 0.1, pz1 - 0.5], 'y', 1.3, 0.12, 8, { colour: STEEL_DARK, decor: true });
  sink.cylinder('structureMetal', [px0 + 0.6, ph + 1.4, pz1 - 0.5], 'y', 0.14, 0.24, 8, { colour: STEEL_DARK, decor: true }, 0.05);
  const seed = px0 * 0.37 + pz0 * 0.61;
  bank(sink, west, -1.2 - 1.2, -0.45, 0.5, 0.7, 1.1, -0.3, seed);
  bank(sink, north, -1.4, 1.4, 0.6 + look() * 0.3, 0.5 + look() * 0.3, 1.0, -0.3, seed + 1);
  bank(sink, south, -1.4, -0.15, 0.5, 0.4, 0.9, -0.3, seed + 2);
  for (const f of [west, north, south, east]) rustStreaks(sink, f, ph - 0.1, rustStream(seed + f.width * 3.1 + f.origin[2]), 0.6);
  // the draw-off line from each tank's foot into the pump house, its gate valve and handwheel
  for (const [i, s] of [[0, -1], [1, 1]] as const) {
    const xn = px0 + 0.55, zShell = zs[i] - s * Math.sqrt(Math.max(0, R * R - (xn - cx) ** 2)), zWall = s < 0 ? pz0 : pz1;
    sink.pipe('structureMetal', [xn, 0.6, zShell + s * 0.05], [xn, 0.6, zWall - s * 0.02], 0.09, 8, { colour: STEEL, decor: true });
    const vz = (zShell + zWall) / 2;
    sink.span('structureMetal', xn - 0.14, 0.45, vz - 0.12, xn + 0.14, 0.75, vz + 0.12, { colour: STEEL_DARK, decor: true });
    rod(sink, [xn, 0.75, vz], [xn, 1.05, vz], 0.03, STEEL_DARK, { fine: true });
    sink.cylinder('structureMetal', [xn, 1.05, vz], 'y', 0.04, 0.17, 10, { colour: ORANGE, decor: true });
  }
  // the fill line out of the pump house over the dike on its support to the coupling at the plot's edge
  {
    const fz = cz + 0.4, fy = bh + 0.4, xe = bb.maxX - 0.25;
    sink.pipe('structureMetal', [px1 - 0.05, fy, fz], [xe, fy, fz], 0.08, 8, { colour: STEEL, decor: true });
    sink.pipe('structureMetal', [xe, fy + 0.08, fz], [xe, 0.75, fz], 0.08, 8, { colour: STEEL, decor: true });
    rod(sink, [x1 - 0.85, bh - 0.05, fz], [x1 - 0.85, fy - 0.08, fz], 0.08, STEEL_DARK);
    rod(sink, [x1 - 0.85, fy - 0.1, fz - 0.2], [x1 - 0.85, fy - 0.1, fz + 0.2], 0.06, STEEL_DARK);
    sink.cylinder('structureMetal', [xe, 0.55, fz], 'y', 0.22, 0.12, 8, { colour: YELLOW, decor: true });
    rod(sink, [xe, 0, fz], [xe, 0.55, fz], 0.07, STEEL_DARK);
    sink.cylinder('structureMetal', [xe - 0.06, fy, fz - 0.14], 'z', 0.28, 0.13, 8, { colour: STEEL_DARK, decor: true });
  }
  // the steel stair over the dike's -z end, near its -x corner: the flight up the outer slope, the landing on the crest,
  // the flight down inside; its stringers, treads and rails
  {
    const sx = x0 + t + 0.9, zA = z0 - 0.45, zB = z0 + 0.55, zC = z0 + 1.15, zD = z0 + t + 0.45, top = bh + 0.12;
    const flight = (za: number, ya: number, zb: number, yb: number): void => {
      for (const dx of [-0.42, 0.42]) {
        rod(sink, [sx + dx, ya, za], [sx + dx, yb, zb], 0.07, GALV);
        rod(sink, [sx + dx, ya + 0.95, za], [sx + dx, yb + 0.95, zb], 0.04, YELLOW);
        rod(sink, [sx + dx, ya, za], [sx + dx, ya + 0.97, za], 0.04, YELLOW, { fine: true });
      }
      const steps = Math.max(3, Math.round(Math.abs(yb - ya) / 0.24));
      for (let k = 1; k < steps; k++) {
        const f = k / steps, y = ya + (yb - ya) * f, z = za + (zb - za) * f;
        sink.member('structureMetal', [sx - 0.4, y, z], [sx + 0.4, y, z], 0.26, 0.04, [0, 1, 0], { colour: GALV, decor: true, fine: true });
      }
    };
    flight(zA, 0, zB, top);
    flight(zD, 0, zC, top);
    // (the rails' heads on the landing's posts, the rail across it)
    for (const dx of [-0.42, 0.42]) {
      for (const z of [zB, zC]) rod(sink, [sx + dx, top - 0.06, z], [sx + dx, top + 0.97, z], 0.04, YELLOW);
      rod(sink, [sx + dx, top + 0.95, zB], [sx + dx, top + 0.95, zC], 0.04, YELLOW);
    }
    sink.span('structureMetal', sx - 0.45, top - 0.06, zB - 0.02, sx + 0.45, top, zC + 0.02, { colour: GALV, decor: true });
    // the hazard board beside the stair's foot: no smoking, diesel arctic grade
    const bx = sx + 1.0, bz = z0 - 0.3;
    for (const dx of [-0.35, 0.35]) rod(sink, [bx + dx, 0, bz], [bx + dx, 1.55, bz], 0.06, STEEL_DARK);
    sink.span('structureMetal', bx - 0.48, 0.95, bz - 0.06, bx + 0.48, 1.55, bz - 0.03, { colour: WHITE, decor: true });
    sink.span('structureMetal', bx - 0.48, 1.32, bz - 0.075, bx + 0.48, 1.47, bz - 0.06, { colour: rgb(0xa8302a), decor: true });
  }
  // the floodlight mast on the dike's (-x, +z) corner crest, its head turned in over the farm
  {
    const mx = x0 + 0.85, mz = z1 - 0.85;
    rod(sink, [mx, bh - 0.1, mz], [mx, 7.5, mz], 0.14, GALV);
    sink.span('structureMetal', mx - 0.05, 7.2, mz - 0.25, mx + 0.4, 7.55, mz + 0.25, { colour: STEEL_DARK, decor: true });
    sink.span('structureMetal', mx + 0.4, 7.24, mz - 0.21, mx + 0.42, 7.51, mz + 0.21, { colour: WHITE, decor: true, fine: true });
  }
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
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 9, eave: 0.35, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle', relief: RIBBED };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [{ h: 6.4, wall: paint }], roof, gableBucket: paint, openings,
      // (227, BLD-04: no stack on the station's biggest heated building) the oil-fired unit heaters' flue chase through the
      // +x slope toward the back, and the rake trim down both gables' verges
      chimneys: [{ x: W * 0.3, z: -D * 0.3, sx: 0.4, sz: 0.4, above: 1.5, bucket: 'structureMetal', cap: 'none' }],
      gutters: null, verge: { colour: STEEL, bucket: 'structureMetal' }, reveal: 0.14, spall: null,
    }, dialect(rng, paint));
    drifts(sink, frame, openings, look);
    steelCraft(sink, frame, openings, [5.85, 6.35], [openings[1]]);
    // (round 3, wave 130: "uniformly clean, no rust streaking") the rust run from under the eaves on every wall
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      rustStreaks(sink, frame.faces[name], frame.eaveY - 0.15, rustStream(frame.eaveY * 13.1 + frame.faces[name].width * 5.3 + name.length), 0.3,
        openingCuts(frame, openings, name));
    }
    sink.span('stone', -W / 2, -0.3, D / 2, W / 2, 0.08, D / 2 + apron);
    // the band of the station's colour round the eaves
    sink.span('plaster2', -W / 2 - 0.03, 5.85, -D / 2 - 0.03, W / 2 + 0.03, 6.35, D / 2 + 0.03);
    // (dome-detail-275) the roof's ribbed sheets in relief (the roof sweep: the shared relief's courses, RIBBED, where the
    // ribs alone stood; their two draws still made, so the look after them lays as before) and the ridge's ventilators;
    // the gable louvres; the heating-oil day tank on the apron beside the big door
    look(); look();
    ridgeVents(sink, frame, [-D * 0.18, D * 0.26]);
    louvre(sink, frame.faces.back, 0, 5.15, 1.2, 0.8);
    louvre(sink, frame.faces.front, 0, frame.eaveY + 0.42, 1.0, 0.4);
    dayTank(sink, -W / 2 + 0.35, -W / 2 + 2.2, D / 2 + Math.min(1.55, apron - 0.55), 0.48, [-W / 2 + 1.27, 0.45, D / 2 - 0.01]);
    // the arctic entry before the man door: an insulated porch on the apron that keeps the drift and the cold out, on its
    // footing, its mono-pitch roof falling to the apron, its own door with the hood and lamp over it, a window in its side
    const vu = openings[1].u, vw = 1.9, vd = 1.6, vh = 2.75, vx0 = vu - vw / 2, vx1 = vu + vw / 2, vz0 = D / 2 - 0.02, vz1 = D / 2 + vd;
    sink.span('stone', vx0 - 0.06, -0.3, vz0, vx1 + 0.06, 0.2, vz1 + 0.06, { shade: 0.88 });
    sink.span(paint, vx0, 0.2, vz0, vx1, vh, vz1);
    sink.prism('roof', facing([[vx0 - 0.15, vh + 0.28, vz0], [vx0 - 0.15, vh, vz1 + 0.25], [vx0 - 0.15, vh + 0.12, vz1 + 0.25], [vx0 - 0.15, vh + 0.4, vz0]], [1, 0, 0]),
      [1, 0, 0], vw + 0.3);
    sink.prism(paint, facing([[vx0, vh - 0.01, vz0], [vx0, vh - 0.01, vz1], [vx0, vh + 0.03, vz1], [vx0, vh + 0.29, vz0]], [1, 0, 0]), [1, 0, 0], vw);
    const vf = boxFace(vx0, vz0, vx1, vz1, 's'), vs = boxFace(vx0, vz0, vx1, vz1, vu > 0 ? 'e' : 'w');
    doorUnit(sink, vf, -0.2, 0.2, 0.95, 2.05, {
      leaf: STEEL, frame: { bucket: 'structureMetal', width: 0.1, out: 0.04, colour: STEEL_DARK }, steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
    });
    doorCanopy(sink, vf, -0.2, 2.25, 0.95, { kind: 'shed', bucket: 'structureMetal', colour: STEEL, timber: STEEL_DARK, depth: 0.7 });
    wallLantern(sink, vf, 0.62, 2.05);
    windowUnit(sink, vs, 0, 1.25, 0.6, 0.6, WINDOW, look, 0.5);
    for (const side of [-1, 1]) pilaster(sink, 'structureMetal', vf, side * (vw / 2 - 0.05), 0.22, vh - 0.02, 0.1, 0.025, { colour: STEEL });
    for (const f of [vf, vs]) rustStreaks(sink, f, vh - 0.1, rustStream(vh * 7.7 + f.width * 3.3 + f.origin[0]), 0.5);
  });
  return sink.finish();
};

const ARCTIC_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
  },
});
