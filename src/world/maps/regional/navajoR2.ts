// src/world/maps/regional/navajoR2.ts — the navajo kit's builders the looks lane rebuilds to the r2 standard (r2 sweep fix
// b-west, 2026-10-16; extract-then-own from Lane B's navajo.ts): the hogan, the windmill over its stock tank, the
// equipment shed, the trailer home and the hay shed, with the kit's shared palette and helpers they stand on (navajo.ts
// imports those back). See navajo.ts for the kit's sources and the place.
import { PartSink, faceBox, pick, rgb, shade, UV_MEMBER, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { emitRoof, holedFace, leanTo, placeShed, roofGeometry, type HoleRect, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import { latticeFrame } from './lattice.ts';
/** Juniper logs and posts silvered by the sun (a few fresher, browner), and the shadowed underside of a log. */
export const JUNIPER: readonly Rgb[] = [0x8c7d6b, 0x7f705f, 0x968874, 0x7a6a58].map(rgb);
export const JUNIPER_DARK = rgb(0x5a4d41);
export const PLANK = rgb(0x7d6853), PLANK_GREY = rgb(0x8f8579);
/** The reservation's door paints: turquoise, sky blue, barn red, forest green, and bare boards. */
export const DOOR_PAINT: readonly Rgb[] = [0x3d8a86, 0x3f6f99, 0x8a3a2c, 0x4d6f45, 0x7d6853].map(rgb);
export const STOVEPIPE = rgb(0x2c2b29), GALV = rgb(0xa4a8a5), RUSTY = rgb(0x7a5641), IRON = rgb(0x3b3d3e);
/** Corrugated iron cladding (structureMetal's profiled sheet under a livery): galvanised, dulled, rusting, oxide brown
 * (Titan round 3: the barn red read as a Midwest barn). */
export const CLADDING: readonly Rgb[] = [0xa4a8a5, 0x8f9390, 0x8a6a55, 0x76604e].map(rgb);
/** Hauled water: the blue plastic drum, the old steel one. */
const DRUM: readonly Rgb[] = [0x2f5f98, 0x2f5f98, 0x6a4a3a].map(rgb);
export const OCT = Math.PI / 4;

export function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** A slightly bent juniper post or pole from a to b (round, seven-sided), dressing or structure. */
export function pole(sink: PartSink, a: Vec3, b: Vec3, r: number, colour: Rgb, decor: boolean): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return;
  // a member is a square-section box: for a post (mostly vertical) a seven-sided cylinder reads rounder; a sloping one
  // keeps the member
  if (Math.abs(dy) / len > 0.985) {
    sink.cylinder('structureWood', [a[0], Math.min(a[1], b[1]), a[2]], 'y', Math.abs(dy), r, 7, { colour, uv: UV_MEMBER, ...(decor ? { decor: true } : {}) },
      r * 0.85, true, 0.3);
    return;
  }
  sink.member('structureWood', a, b, r * 1.8, r * 1.8, Math.abs(dy) / len > 0.7 ? [1, 0, 0] : [0, 1, 0], { colour, exposed: true, ...(decor ? { decor: true } : {}) }, 0);
}

/** One side of an octagon of circumradius r: its outward direction, apothem and length. */
function octSide(k: number, r: number): { a: number; c: number; s: number; ap: number; len: number } {
  const a = k * OCT;
  return { a, c: Math.cos(a), s: Math.sin(a), ap: r * Math.cos(OCT / 2), len: 2 * r * Math.sin(OCT / 2) };
}

/** Emit `body` in a side's frame: x along the side (left to right seen from outside), +z out, origin at its middle. */
function onSide(sink: PartSink, side: { a: number; c: number; s: number }, ap: number, body: () => void): void {
  sink.placed(Math.PI / 2 - side.a, side.c * ap, 0, side.s * ap, body);
}

/** The octagon side whose outward direction is nearest the world's east, in a building turned `yaw` (props.ts rot). */
export function eastSide(yaw: number | undefined): number {
  // the building's local frame turns by yaw about +Y (THREE's rotateY): world east (+x) is local (cos yaw, sin yaw)
  const a = yaw === undefined ? Math.PI / 2 : yaw;
  return ((Math.round(a / OCT) % 8) + 8) % 8;
}

interface HoganOptions {
  /** circumradius of the log walls' outer face (m) */
  r: number;
  /** the door's side (octSide index) */
  door: number;
  /** a ruin: walls broken down, the roof fallen in */
  fallen?: boolean;
}

/**
 * The hogan at the origin: a sandstone footing, eight walls of juniper logs saddle-notched at the corners over a
 * mud-chinked core, two rings of roof cribbing inward from the wall top and the earth heaped over them, the smoke hole
 * with its stovepipe, the door in a hewn frame under a lintel log. Returns the top of the earth mound.
 */
export function hoganBody(sink: PartSink, rng: () => number, look: () => number, o: HoganOptions): number {
  const R = o.r, t = 0.26, logR = 0.135, pitch = 0.255, courses = o.fallen ? 0 : 8;
  const A = R * Math.cos(OCT / 2); // the walls' outer apothem
  const foot = 0.22, wallTop = foot + 8 * pitch + pitch / 2;
  const logs = [pick(rng, JUNIPER), pick(rng, JUNIPER)];
  // the footing: one octagonal course of sandstone, a hand's breadth proud of the logs
  sink.cylinder('stone', [0, -0.5, 0], 'y', foot + 0.5, (A + 0.06) / Math.cos(OCT / 2), 8, {}, (A + 0.06) / Math.cos(OCT / 2), true, OCT / 2);
  // the earth trodden dark round the footing (dressing)
  sink.cylinder('plaster2', [0, -0.09, 0], 'y', 0.105, (A + 0.85) / Math.cos(OCT / 2), 8, { decor: true, shade: 0.6 }, (A + 0.85) / Math.cos(OCT / 2), true, OCT / 2);
  const dw = 0.88, dh = 1.7;
  for (let k = 0; k < 8; k++) {
    const sd = octSide(k, R), L = 2 * A * Math.tan(OCT / 2);
    // a fallen hogan keeps a ragged stump of each wall
    const top = o.fallen ? foot + 0.35 + rng() * 1.1 : wallTop;
    const isDoor = k === o.door && !o.fallen;
    onSide(sink, sd, A, () => {
      // the mud-chinked core (structure): split round the doorway
      if (isDoor) {
        sink.span('plaster2', -L / 2, foot, -t, -dw / 2, top, 0);
        sink.span('plaster2', dw / 2, foot, -t, L / 2, top, 0);
        sink.span('plaster2', -dw / 2, foot + dh, -t, dw / 2, top, 0);
      } else sink.span('plaster2', -L / 2 - 0.02, foot, -t, L / 2 + 0.02, top, 0);
      // the logs: courses offset half a log side to side, every log running past both corners (the saddle notch)
      const lift = (k % 2) * pitch / 2;
      const n = o.fallen ? Math.max(1, Math.floor((top - foot) / pitch)) : courses;
      for (let c = 0; c < n; c++) {
        const y = foot + logR + lift + c * pitch;
        if (y + logR > top + 0.02) break;
        const ext = 0.16 + look() * 0.12, colour = shade(logs[c % 2], 0.92 + look() * 0.16);
        const cut = isDoor && y - logR < foot + dh + 0.1;
        const runs: Array<[number, number]> = cut ? [[-L / 2 - ext, -dw / 2 - 0.08], [dw / 2 + 0.08, L / 2 + ext]] : [[-L / 2 - ext, L / 2 + ext]];
        for (const [x0, x1] of runs) {
          sink.cylinder('structureWood', [x0, y, logR * 0.3], 'x', x1 - x0, logR * (0.92 + look() * 0.16), 6, { colour, decor: true, uv: UV_MEMBER },
            logR * (0.88 + look() * 0.12), true, look() * 0.5);
        }
      }
      if (isDoor) {
        // the hewn door frame, the plank door and the lintel log running well past the jambs
        const face: Face = { origin: [0, 0, 0], u: [1, 0, 0], out: [0, 0, 1], width: L };
        for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, side * (dw / 2 + 0.07), foot + (dh + 0.12) / 2, 0.06, 0.14, dh + 0.12, 0.2, { colour: JUNIPER_DARK, decor: true });
        sink.recess = 0.12;
        doorUnit(sink, face, 0, foot, dw, dh, { leaf: pick(rng, DOOR_PAINT), frame: { bucket: 'structureWood', width: 0.06, out: 0.04, colour: PLANK_GREY },
          steps: null, leafKind: 'plank' });
        sink.recess = 0;
        sink.cylinder('structureWood', [-dw / 2 - 0.55, foot + dh + 0.2, 0.12], 'x', dw + 1.1, 0.12, 6, { colour: logs[0], decor: true, uv: UV_MEMBER }, 0.11);
        // a step stone at the threshold
        sink.span('stone', -0.6, -0.2, 0.02, 0.6, foot - 0.04, 0.5, { decor: true });
      }
    });
  }
  if (o.fallen) {
    // the roof fell in: cribbing logs lying across the floor and against the stumps, a heap of the roof's earth
    for (let k = 0; k < 6; k++) {
      const a: Vec3 = [(rng() - 0.5) * A * 1.4, foot + 0.2, (rng() - 0.5) * A * 1.4];
      const b: Vec3 = [a[0] + (rng() - 0.5) * 3.2, foot + 0.25 + rng() * 0.9, a[2] + (rng() - 0.5) * 3.2];
      sink.member('structureWood', a, b, 0.22, 0.22, [0, 1, 0], { colour: pick(rng, JUNIPER), decor: true, exposed: true }, 0);
    }
    sink.cylinder('plaster2', [0, foot - 0.1, 0], 'y', 0.65, A * 0.62, 8, { decor: true }, A * 0.3, true, look());
    return foot + 0.6;
  }
  // the roof cribbing: two rings of logs, each ring's logs spanning the corners of the ring below
  let ringR = A * 1.0, y = wallTop + logR * 0.6;
  for (let ring = 0; ring < 2; ring++) {
    const turn = ring % 2 ? 0 : OCT / 2;
    for (let k = 0; k < 8; k++) {
      const a0 = k * OCT + turn, a1 = a0 + OCT;
      const p0: Vec3 = [Math.cos(a0) * ringR, y, Math.sin(a0) * ringR], p1: Vec3 = [Math.cos(a1) * ringR, y, Math.sin(a1) * ringR];
      const ex = 0.18 / Math.max(0.5, Math.hypot(p1[0] - p0[0], p1[2] - p0[2]));
      const a: Vec3 = [p0[0] - (p1[0] - p0[0]) * ex, y, p0[2] - (p1[2] - p0[2]) * ex], b: Vec3 = [p1[0] + (p1[0] - p0[0]) * ex, y, p1[2] + (p1[2] - p0[2]) * ex];
      sink.member('structureWood', a, b, logR * 1.8, logR * 1.8, [0, 1, 0], { colour: shade(logs[(k + ring) % 2], 0.9 + look() * 0.14), decor: true, exposed: true }, 0);
    }
    ringR *= Math.cos(OCT / 2) * 0.97;
    y += pitch;
  }
  // the earth roof (structure): a deck inside the cribbing rings, so both rings show as steps under the earth, and the
  // low mound heaped on it
  const deckTop = wallTop + 0.5;
  sink.cylinder('plaster2', [0, wallTop - 0.1, 0], 'y', deckTop - wallTop + 0.1, A * 0.84 / Math.cos(OCT / 2), 8, {}, A * 0.78 / Math.cos(OCT / 2), true, OCT / 2);
  // the mud packed between the walls' top course and the deck (dressing): the deck stood inside the walls' inner face,
  // the roof hanging 8 cm clear of the walls that carry it
  sink.cylinder('plaster2', [0, wallTop - 0.14, 0], 'y', 0.22, A * 0.97 / Math.cos(OCT / 2), 8, { decor: true, shade: 0.9 }, A * 0.83 / Math.cos(OCT / 2), false, OCT / 2);
  const prof: Array<[number, number]> = [[0.78, 0], [0.6, 0.3], [0.38, 0.6], [0.2, 0.8]];
  let mound = deckTop;
  for (let i = 0; i + 1 < prof.length; i++) {
    const h = (prof[i + 1][1] - prof[i][1]) * (1.0 + R * 0.06);
    // the mound's rings share one phase, so each frustum meets the next edge to edge
    sink.cylinder('plaster2', [0, mound, 0], 'y', h, A * prof[i][0], 12, {}, A * prof[i + 1][0], i === prof.length - 2, 0.13);
    mound += h;
  }
  // a patch of tarpaper and a few stones holding it, the sheet-iron plate at the smoke hole and the stovepipe
  if (look() < 0.55) {
    const pa = look() * Math.PI * 2, pr = A * 0.5;
    sink.span('stone', Math.cos(pa) * pr - 0.18, deckTop + 0.25, Math.sin(pa) * pr - 0.14, Math.cos(pa) * pr + 0.18, deckTop + 0.5, Math.sin(pa) * pr + 0.14, { decor: true });
  }
  sink.span('structureMetal', -0.42, mound - 0.04, -0.42, 0.42, mound + 0.03, 0.42, { colour: RUSTY, decor: true });
  sink.cylinder('structureMetal', [0.12, mound, -0.08], 'y', 1.25, 0.085, 8, { colour: STOVEPIPE, decor: true });
  sink.cylinder('structureMetal', [0.12, mound + 1.25, -0.08], 'y', 0.16, 0.2, 8, { colour: STOVEPIPE, decor: true }, 0.03);
  return mound;
}

/**
 * A straight member along x or z from a0 to a1, its middle at (c, y) across, half sizes hw (across, level) and hh (up),
 * its four long arrises chamfered `ch` (an octagonal section: a dressed coping, a sawn board; the looks lane 2026-10-15).
 */
export function chamferedBeam(sink: PartSink, bucket: RegionalBucket, axis: 'x' | 'z', a0: number, a1: number, c: number, y: number, hw: number, hh: number, ch: number,
  opts: EmitOptions): void {
  const sec: Array<[number, number]> = [[hw, -hh + ch], [hw, hh - ch], [hw - ch, hh], [-hw + ch, hh], [-hw, hh - ch], [-hw, -hh + ch], [-hw + ch, -hh], [hw - ch, -hh]];
  // counter-clockwise seen from the axis's plus end: along z the section's u is +x; along x it is -z
  const pts: Vec3[] = sec.map(([u, v]) => (axis === 'z' ? [c + u, y + v, a0] : [a0, y + v, c - u]) as Vec3);
  sink.prism(bucket, pts, axis === 'z' ? [0, 0, 1] : [1, 0, 0], a1 - a0, opts);
}

/** A juniper woodpile on the ground (dressing): split lengths stacked against each other, a few lying loose. */
function woodpile(sink: PartSink, x: number, z: number, yaw: number, look: () => number): void {
  sink.placed(yaw, x, 0, z, () => {
    for (let row = 0; row < 3; row++) for (let k = 0; k < 6 - row * 2; k++) {
      const r = 0.07 + look() * 0.04, y = r + row * 0.17;
      sink.cylinder('structureWood', [-0.6 + look() * 0.1, y, -0.5 + (k + row) * 0.17], 'x', 1.1 + look() * 0.3, r, 5, { colour: pick(look, JUNIPER), decor: true, uv: UV_MEMBER });
    }
  });
}

/**
 * A stack of split juniper (structure: a hull stops at it): a solid core of the cords, the ends of the lengths over its
 * face as dressing. At (x, z), its length along local x turned `yaw`; it fills a plot's end beside a small house.
 */
export function woodStack(sink: PartSink, x: number, z: number, yaw: number, len: number, h: number, look: () => number, depth = 0.9): void {
  const hd = depth / 2;
  sink.placed(yaw, x, 0, z, () => {
    sink.span('structureWood', -len / 2, -0.2, -hd, len / 2, h, hd, { colour: shade(JUNIPER_DARK, 1.1) });
    for (let k = 0; k < Math.round(len / 0.24) * 2; k++) {
      const u = -len / 2 + 0.12 + look() * (len - 0.24), y = 0.12 + look() * (h - 0.24), r = 0.07 + look() * 0.04;
      for (const side of [-1, 1]) sink.cylinder('structureWood', [u, y, side * hd - (side > 0 ? 0 : 0.03)], 'z', 0.03, r, 6, { colour: pick(look, JUNIPER), decor: true, fine: true });
    }
    sink.span('structureWood', -len / 2 - 0.05, h, -hd - 0.05, len / 2 + 0.05, h + 0.05, hd + 0.05, { colour: pick(look, JUNIPER), decor: true });
  });
}

/**
 * The cords of split juniper stacked at a plot's long ends beside a hogan standing at (0, hz) (structure: the hogan's
 * octagon leaves the ends of its plot open, and a plot's reach is kept so no lane opens beside it), clear of the
 * door's side: a single cord where an end is narrow, a deep stack where it has room.
 */
export function endStacks(sink: PartSink, b: RegionalBuildContext['bounds'], hz: number, R: number, door: number, look: () => number, h: number): void {
  const doorX = Math.cos(door * OCT), doorZ = Math.sin(door * OCT);
  const A = R * Math.cos(OCT / 2) + 0.06;
  for (const end of [-1, 1]) {
    const edge = end > 0 ? b.maxZ : b.minZ, gap = Math.abs(edge - hz) - A;
    if (gap <= 0.45) continue;
    const depth = Math.max(0.4, Math.min(0.9, gap - 0.2)), z = edge - end * (0.15 + depth / 2);
    const sx = doorX > 0.3 ? -1 : doorX < -0.3 ? 1 : (end * doorZ > 0 ? -1 : 1);
    const len = Math.max(1.0, Math.min(2.6, (b.maxX - b.minX) / 2 - 0.6));
    woodStack(sink, sx * ((b.maxX - b.minX) / 2 - len / 2 - 0.1) + (b.maxX + b.minX) / 2, z, 0, len, h, look, depth);
  }
}

/** A water drum on the ground (dressing). */
export function drum(sink: PartSink, x: number, z: number, look: () => number): void {
  const c = pick(look, DRUM);
  sink.cylinder('structureMetal', [x, 0, z], 'y', 0.88, 0.29, 10, { colour: c, decor: true });
  sink.cylinder('structureMetal', [x, 0.88, z], 'y', 0.03, 0.27, 10, { colour: shade(c, 0.8), decor: true });
}

/**
 * The ground course at a body's foot (Titan round 2; gauntlet wave 104: "buildings sit on the sand with no footings and
 * no darkening where they meet it"): a course of darker dressed sandstone a hand proud of the walls, and the red earth
 * trodden dark round it. Dressing: a building's collision is its body's.
 */
export function groundCourse(sink: PartSink, x0: number, z0: number, x1: number, z1: number, top = 0.3, footing = true, earth = 0.75): void {
  if (footing) sink.span('stone', x0 - 0.14, -0.45, z0 - 0.14, x1 + 0.14, top, z1 + 0.14, { decor: true, shade: 0.72 });
  sink.span('plaster2', x0 - earth, -0.09, z0 - earth, x1 + earth, 0.015, z1 + earth, { decor: true, shade: 0.6 });
}


/** The hogan: one octagon in its plot, its door facing the sunrise, a woodpile and a water drum by it. */
export const hogan: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const span = Math.min(ctx.info.w, ctx.info.d) - 0.6;
  const R = Math.max(2.4, Math.min(3.25, span / (2 * Math.cos(OCT / 2)) - 0.12));
  const door = eastSide(ctx.yaw);
  hoganBody(sink, rng, look, { r: R, door });
  endStacks(sink, ctx.bounds, 0, R, door, look, 1.15);
  // the woodpile behind the hogan and a water drum beside the door, kept inside the plot (dressing, not on phones)
  sink.dressing(ctx.tier === 'mobile', () => {
    const clampX = (v: number, m: number) => Math.max(-ctx.info.w / 2 + m, Math.min(ctx.info.w / 2 - m, v));
    const clampZ = (v: number, m: number) => Math.max(-ctx.info.d / 2 + m, Math.min(ctx.info.d / 2 - m, v));
    const back = (door + 4) * OCT, side = (door + 1.5) * OCT;
    woodpile(sink, clampX(Math.cos(back) * (R + 0.8), 0.8), clampZ(Math.sin(back) * (R + 0.8), 0.8), Math.PI / 2 - back, look);
    drum(sink, clampX(Math.cos(side) * (R + 0.45), 0.35), clampZ(Math.sin(side) * (R + 0.45), 0.35), look);
  });
  return sink.finish();
};


/**
 * The windmill over its stock tank (a water tower plot): a four-legged galvanised tower, the wheel of sails and the
 * tail vane at the top, the pump rod down the middle; the round stock tank brimming beside it and a storage tank.
 */
export const windmill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the tower, the stock tank and the storage tank stand at three corners of the old tower's reach (its bounds)
  const bb = ctx.bounds, PX = bb.maxX - bb.minX, PZ = bb.maxZ - bb.minZ, cx = (bb.maxX + bb.minX) / 2, cz = (bb.maxZ + bb.minZ) / 2;
  const P = Math.max(3.6, Math.min(5.6, Math.min(PX, PZ) - 0.3));
  const base = Math.min(1.15, P * 0.24), H = 9.0 + ctx.rng() * 2.0, top = 0.32;
  const tx = cx - PX / 2 + base + 0.15, tz = cz - PZ / 2 + base + 0.15;
  const steel = GALV, mobile = ctx.tier === 'mobile';
  // (props census #3, lane B 2026-10-14; the judges: "no diagonal braces ... only girts are built; no ladder") the tower
  // a lattice of four galvanised legs on concrete pads, girts and X rods in every panel (lattice.ts), a ladder up its
  // -x face to the platform; it falls as its frame with the head and wheel as its crown
  latticeFrame(sink, { foot: base, head: top, cx: tx, cz: tz, y0: 0.18, y1: H, size: 0.09, girt: 0.045, brace: 0.025,
    panels: Math.max(3, Math.round(H / 2)), bucket: 'structureMetal', colour: steel, pad: { bucket: 'stone', size: 0.6, top: 0.18 }, mobile },
    { x0: tx - 1.6, x1: tx + 1.6, y0: H - 0.05, y1: H + 2.1, z0: tz - 2.6, z1: tz + 0.8, bucket: 'structureMetal', tint: steel });
  sink.dressing(mobile, () => {
    for (const dz of [-0.2, 0.2]) sink.member('structureMetal', [tx - base - 0.12, 0.2, tz + dz], [tx - top - 0.12, H, tz + dz * 0.6], 0.035, 0.03, [-1, 0, 0], { colour: steel, decor: true, exposed: true }, 0);
    for (let y = 0.5; y < H - 0.1; y += 0.36) {
      const x = tx - (base + (top - base) * (y / H)) - 0.12, w = 0.2 - 0.08 * (y / H);
      sink.span('structureMetal', x - 0.012, y - 0.012, tz - w, x + 0.012, y + 0.012, tz + w, { colour: steel, decor: true, fine: true });
    }
  });
  // the platform, the head, the wheel and the vane
  sink.span('structureWood', tx - 0.55, H - 0.05, tz - 0.55, tx + 0.55, H + 0.03, tz + 0.55, { colour: PLANK_GREY, decor: true });
  sink.span('structureMetal', tx - 0.22, H + 0.03, tz - 0.3, tx + 0.22, H + 0.5, tz + 0.3, { colour: shade(steel, 0.8), decor: true });
  const hub: Vec3 = [tx, H + 0.55, tz + 0.55], wheelR = 1.35 + look() * 0.3;
  const sails = 18;
  for (let k = 0; k < sails; k++) {
    const a = k / sails * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const inner: Vec3 = [hub[0] + c * 0.3, hub[1] + s * 0.3, hub[2]], outer: Vec3 = [hub[0] + c * wheelR, hub[1] + s * wheelR, hub[2] + 0.12];
    sink.member('structureMetal', inner, outer, 0.17, 0.012, [0, 0, 1], { colour: shade(steel, 0.95 + (k % 2) * 0.08), decor: true, exposed: true }, 0);
  }
  for (let k = 0; k < 12; k++) {
    const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2;
    for (const rr of [wheelR * 0.98, wheelR * 0.55]) {
      sink.member('structureMetal', [hub[0] + Math.cos(a0) * rr, hub[1] + Math.sin(a0) * rr, hub[2] + 0.1], [hub[0] + Math.cos(a1) * rr, hub[1] + Math.sin(a1) * rr, hub[2] + 0.1],
        0.03, 0.03, [0, 0, 1], { colour: steel, decor: true, exposed: true }, 0);
    }
  }
  sink.member('structureMetal', [tx, H + 0.4, tz - 0.2], [tx, H + 0.45, tz - 2.2], 0.06, 0.06, [0, 1, 0], { colour: steel, decor: true, exposed: true }, 0);
  sink.member('structureMetal', [tx, H + 0.75, tz - 1.6], [tx, H + 0.75, tz - 2.6], 1.0, 0.02, [1, 0, 0], { colour: rgb(0xd8d4c8), decor: true, exposed: true }, 0);
  sink.member('structureMetal', [tx, 0.2, tz], [tx, H, tz], 0.03, 0.03, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
  // the stock tank and the storage tank (structure), the water in them
  const sr = Math.min(1.35, P * 0.26), sxp = cx + PX / 2 - sr - 0.15, szp = cz + PZ / 2 - sr - 0.15;
  sink.cylinder('structureMetal', [sxp, -0.2, szp], 'y', 0.9, sr, 16, { colour: shade(steel, 0.92) });
  sink.cylinder('glass', [sxp, 0.62, szp], 'y', 0.02, sr - 0.05, 16, { decor: true });
  // its rolled rim, the float valve on the inlet
  sink.cylinder('structureMetal', [sxp, 0.66, szp], 'y', 0.06, sr + 0.04, 16, { colour: shade(steel, 0.8), decor: true }, sr + 0.04, false);
  sink.cylinder('structureMetal', [sxp - sr * 0.6, 0.66, szp], 'y', 0.06, 0.12, 8, { colour: rgb(0x8a8a82), decor: true }, 0.12, true);
  const tr = Math.min(0.85, P * 0.16);
  const stx = cx - PX / 2 + tr + 0.15, stz = cz + PZ / 2 - tr - 0.15;
  sink.cylinder('structureMetal', [stx, -0.2, stz], 'y', 2.2, tr, 12, { colour: pick(look, [GALV, RUSTY, rgb(0x6e7f74)]) });
  sink.cylinder('structureMetal', [stx, 2.0, stz], 'y', 0.25, tr, 12, { colour: shade(GALV, 0.85), decor: true }, 0.1);
  // its rim and the corrugation's ribs (near the camera only)
  sink.cylinder('structureMetal', [stx, 1.94, stz], 'y', 0.06, tr + 0.03, 12, { colour: shade(GALV, 0.75), decor: true }, tr + 0.03, false);
  sink.dressing(mobile, () => {
    for (let y = 0.2; y < 1.9; y += 0.35) sink.cylinder('structureMetal', [stx, y, stz], 'y', 0.04, tr + 0.015, 12, { colour: shade(GALV, 0.9), decor: true, fine: true }, tr + 0.015, false);
  });
  // the pipe from the pump to the tanks
  sink.member('structureMetal', [tx, 0.5, tz], [sxp, 0.75, szp], 0.06, 0.06, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
  return sink.finish();
};


/**
 * The equipment shed (a depot plot): a pole frame of juniper clad in corrugated iron on three sides, open to the front
 * between its posts, a shed roof falling to the back, a lean-to off the front for the trucks.
 */
export const equipmentShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the shed and its lean-to fill the old depot's reach (its bounds, which stand off the plot's centre): the clad shed
  // on the back (-x) side, the lean-to out to the front (+x) side
  const bb = ctx.bounds, PW = bb.maxX - bb.minX;
  const D = Math.max(12, bb.maxZ - bb.minZ - 0.8), H = 4.2, x0 = bb.minX + 0.2;
  let W = Math.max(6.5, Math.min(12, PW - 0.45 - 3.4)), lw = PW - 0.45 - W;
  if (lw < 1.2) { W += lw; lw = 0; } else if (lw > 4) { W += lw - 4; lw = 4; }
  sink.placed(0, 0, 0, (bb.maxZ + bb.minZ) / 2, () => {
  const roof: RoofSpec = { kind: 'shed', pitchDeg: 9, eave: 0.4, verge: 0.3, thickness: 0.07, bucket: 'roof' };
  const rise = W * Math.tan(9 * Math.PI / 180);
  // the clad walls: back (-x) full height, the ends (gable-trapezoid) and the posts along the open front (+x)
  sink.span('stone', x0 - 0.05, -0.4, -D / 2 - 0.05, x0 + W + 0.05, 0.15, D / 2 + 0.05);
  groundCourse(sink, x0, -D / 2, x0 + W + lw, D / 2, 0, false, 0.7);
  const tin = { colour: pick(ctx.rng, CLADDING) };
  sink.span('structureMetal', x0, 0.15, -D / 2, x0 + 0.08, H, D / 2, tin);
  for (const z of [-D / 2, D / 2]) {
    const pts: Vec3[] = [[x0, 0.15, z], [x0 + W, 0.15, z], [x0 + W, H + rise, z], [x0, H, z]];
    sink.prism('structureMetal', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.08, tin);
  }
  // the winter's hay stacked three bales high behind the open front in every other bay (structure: it stops a hull)
  const bays = Math.max(3, Math.round(D / 3.6));
  for (let k = 0; k < bays; k += 2) {
    const za = -D / 2 + 0.3 + (D - 0.6) * k / bays, zb = -D / 2 + 0.3 + (D - 0.6) * (k + 1) / bays;
    sink.span('straw', x0 + W - 1.4, 0.15, za + 0.15, x0 + W - 0.35, 1.5, zb - 0.15);
    // (props census #4, lane B 2026-10-14: "the bale stack a straw box") its bales' courses and the joints between them
    if (ctx.tier !== 'mobile') {
      for (const y of [0.6, 1.05]) sink.span('straw', x0 + W - 1.42, y - 0.015, za + 0.13, x0 + W - 0.33, y + 0.015, zb - 0.13, { decor: true, shade: 0.78 });
      for (let z = za + 0.15 + 0.9; z < zb - 0.3; z += 0.9) sink.span('straw', x0 + W - 0.36, 0.17, z - 0.015, x0 + W - 0.33, 1.48, z + 0.015, { decor: true, shade: 0.78 });
    }
  }
  // the frame inside the open shed: girts along the back wall and the ends, the sheet's laps outside, its rust at the foot
  sink.dressing(ctx.tier === 'mobile', () => {
    const girt = { colour: shade(pick(look, JUNIPER), 0.85), decor: true, uv: UV_MEMBER };
    for (const y of [1.3, 2.6, 3.7]) {
      sink.span('structureWood', x0 + 0.08, y - 0.06, -D / 2 + 0.1, x0 + 0.18, y + 0.06, D / 2 - 0.1, girt);
      for (const z of [-D / 2 + 0.08, D / 2 - 0.18]) sink.span('structureWood', x0 + 0.1, y - 0.06, z, x0 + W - 0.3, y + 0.06, z + 0.1, girt);
    }
    for (let z = -D / 2 + 0.6; z < D / 2 - 0.2; z += 0.75) sink.span('structureMetal', x0 - 0.02, 0.15, z - 0.02, x0 + 0.005, H - 0.05, z + 0.02, { colour: shade(tin.colour, 0.82), decor: true, fine: true });
    // (the rust band a face on the sheet, not a 17 mm box 19 m long: the integrity gate reads its edges as slivers)
    sink.quad('structureMetal', [x0 - 0.012, 0.15, -D / 2], [x0 - 0.012, 0.15, D / 2], [x0 - 0.012, 0.6, D / 2], [x0 - 0.012, 0.6, -D / 2],
      { colour: [tin.colour[0] * 0.6 + 0.18, tin.colour[1] * 0.55 + 0.1, tin.colour[2] * 0.5 + 0.06], decor: true });
  });
  const n = Math.max(3, Math.round(D / 3.6));
  // (props census E4, lane B 2026-10-14: the front poles stopped 1.0 m under the roof, which rises to the open front)
  // the roof falls to the back wall; the front poles carry a juniper plate under its high eave, the poles up to it
  const shed = placeShed(sink, { cx: x0 + W / 2, cz: 0, run: W, span: D, fall: [-1, 0], highY: H + rise, roof });
  const px = x0 + W - 0.15, plateTop = shed.undersideAt(px, 0) + 0.01, plate = pick(look, JUNIPER);
  sink.span('structureWood', px - 0.09, plateTop - 0.18, -D / 2 - 0.05, px + 0.09, plateTop, D / 2 + 0.05, { colour: shade(plate, 0.9), uv: UV_MEMBER });
  for (let k = 0; k <= n; k++) {
    const z = -D / 2 + 0.15 + (D - 0.3) * k / n;
    pole(sink, [px, -0.3, z], [px, plateTop - 0.18, z], 0.11, pick(look, JUNIPER), false);
  }
  // the lean-to off the front for the trucks: a low tin roof falling away from the shed, hung at its high line on a
  // ledger along the front poles and resting on a plate over its own poles
  if (lw > 1.2) {
    const front: Face = { origin: [x0 + W, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const lean = leanTo(sink, { face: front, u0: -D / 2 + 0.1, u1: D / 2 - 0.1, from: -0.15 + 0.11, depth: lw - 0.12,
      highY: plateTop - 0.18 - 0.2, roof: { pitchDeg: 8, eave: 0.12, verge: 0.2, thickness: 0.06, bucket: 'roof' },
      posts: null, plate: { h: 0.15, w: 0.16, bucket: 'structureWood', colour: shade(plate, 0.95) } });
    faceBox(sink, 'structureWood', front, 0, lean.highY - 0.07, -0.15 + 0.11 + 0.05, D, 0.14, 0.1, { colour: shade(plate, 0.85), decor: true, uv: UV_MEMBER });
    for (let k = 0; k <= n; k += 2) {
      const z = -D / 2 + 0.3 + (D - 0.6) * k / n;
      pole(sink, [x0 + W + lw - 0.12, -0.3, z], [x0 + W + lw - 0.12, lean.postTop, z], 0.09, pick(look, JUNIPER), false);
    }
  }
  // inside: loose bales and a stack of fence posts
  sink.dressing(ctx.tier === 'mobile', () => {
    for (let k = 0; k < 4; k++) for (let r = 0; r < 3 - (k % 2); r++) sink.span('straw', x0 + 0.4, r * 0.45, -D / 2 + 0.6 + k * 1.05, x0 + 1.3, r * 0.45 + 0.45, -D / 2 + 1.6 + k * 1.05, { decor: true });
    for (let k = 0; k < 8; k++) sink.cylinder('structureWood', [x0 + 0.5, 0.08 + (k % 3) * 0.14, D / 2 - 3.6 + k * 0.17], 'z', 0.05, 0.07, 5, { colour: pick(look, JUNIPER), decor: true }, 0.07, true);
  });
  });
  return sink.finish();
};

/**
 * The trailer home (a container row plot): a double-wide on a deep plot, a single-wide otherwise — an aluminium- or
 * siding-skinned box on cinder-block piers behind its skirting, a coloured stripe, sliding windows, a plywood porch
 * with steps and a rail at the door, the swamp cooler on the roof, the propane bottle at one end, a satellite dish.
 */
export const trailer: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const double = ctx.info.d >= 7.8;
  // the home fills the old container row's reach (its bounds): its back on the back edge, a double-wide's front (a
  // single-wide's deck) on the front edge
  const bb = ctx.bounds, PD = bb.maxZ - bb.minZ;
  const L = Math.max(10, bb.maxX - bb.minX - 0.8);
  const T = double ? Math.max(5.6, Math.min(7.4, PD - 0.7)) : Math.max(4.3, Math.min(5.4, PD - 2.4));
  const deckD = double ? 1.2 : Math.max(1.8, Math.min(2.6, PD - 0.6 - T));
  const xc = (bb.maxX + bb.minX) / 2, zc = bb.minZ + 0.3 + T / 2;
  // (Titan round 3: the near-white skins read as "white walled compounds" across the valley; the reservation's homes
  // are faded beige, tan, sage and teal under the dust)
  const skin = pick(rng, [rgb(0xcfc3ae), rgb(0xc2ae92), rgb(0xb3a088), rgb(0xa9b4a6), rgb(0x9fb0aa)]);
  const stripe = pick(rng, [rgb(0x7a5a3e), rgb(0x3f6f99), rgb(0x8a3a2c), rgb(0x56705a)]);
  const roofColour = double ? pick(rng, [rgb(0x6e6a62), rgb(0x8a8a84), rgb(0x5a4a3e)]) : shade(skin, 1.05);
  const floor = 0.75, top = double ? 3.1 : 3.3;
  sink.placed(0, xc, 0, zc, () => {
    // the piers behind the skirting, the skirting (structure) and the box
    sink.span('structureMetal', -L / 2 + 0.1, -0.3, -T / 2 + 0.1, L / 2 - 0.1, floor, T / 2 - 0.1, { colour: shade(skin, 0.82) });
    groundCourse(sink, -L / 2, -T / 2, L / 2, T / 2, 0, false, 0.65);
    const roof: RoofSpec = double
      ? { kind: 'gable', pitchDeg: 11, eave: 0.3, verge: 0.25, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' }
      : { kind: 'gable', pitchDeg: 4, eave: 0.06, verge: 0.06, thickness: 0.05, bucket: 'structureMetal', ridge: null };
    const rg = roofGeometry(T, L, top, roof);
    sink.placed(Math.PI / 2, 0, 0, 0, () => {
      emitRoof(sink, rg, roof, roofColour);
      // the double-wide's gable ends, skinned as its walls
      if (double && rg.gable) for (const z of [L / 2, -L / 2]) {
        const pts: Vec3[] = rg.gable.map(([u, y]) => [u, y, z] as Vec3);
        sink.prism('structureMetal', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.06, { colour: skin });
      }
    });
    // (props census #3, lane B 2026-10-14; the judges: "a span box, its windows glass quads on its skin and its door a
    // painted panel") the skin's long sides and ends with the sliding windows and the door cut through them in thin
    // reveals, the aluminium units set in them (openings.ts), the stripe running under the windows and broken at the door
    const du = L * 0.18, alu = rgb(0xb8bcbc), reveal = 0.07;
    const nWin = Math.max(2, Math.floor(L / 3.4));
    const style = { frame: alu, frameWidth: 0.04, frameOut: 0.015, bars: 'two' as const, surround: null, sill: null, shutters: null };
    sink.paint = skin;
    try {
      for (const side of [-1, 1]) {
        const f: Face = { origin: [0, 0, side * T / 2], u: [side, 0, 0], out: [0, 0, side], width: L };
        const holes: HoleRect[] = [], wins: number[] = [];
        for (let k = 0; k < nWin; k++) {
          const u = -L / 2 + (k + 0.5) * L / nWin + (side > 0 && k === 1 ? 1.0 : 0);
          if (side > 0 && Math.abs(u * side - du) < 1.2) continue;
          wins.push(u);
          holes.push({ u0: u - 0.55, u1: u + 0.55, y0: floor + 1.025, y1: floor + 1.875 });
        }
        if (side > 0) holes.push({ u0: du - 0.43, u1: du + 0.43, y0: floor, y1: floor + 1.97 });
        holedFace(sink, 'structureMetal', f, { u0: -L / 2, u1: L / 2, y0: floor, y1: top }, holes, reveal);
        sink.recess = reveal;
        try {
          for (const u of wins) windowUnit(sink, f, u, floor + 1.025, 1.1, 0.85, style, rng, 0.25);
          if (side > 0) doorUnit(sink, f, du, floor, 0.86, 1.97, { leaf: shade(skin, 0.92), frame: { bucket: 'structureMetal', width: 0.05, out: 0.015, colour: alu }, steps: null, leafKind: 'panel' });
        } finally { sink.recess = 0; }
        const runs: Array<[number, number]> = side > 0 ? [[-L / 2, du - 0.5], [du + 0.5, L / 2]] : [[-L / 2, L / 2]];
        for (const [u0, u1] of runs) faceBox(sink, 'structureMetal', f, (u0 + u1) / 2, floor + 0.85, 0.012, u1 - u0, 0.2, 0.02, { colour: stripe, decor: true });
        faceBox(sink, 'structureMetal', f, 0, top - 0.25, 0.012, L, 0.08, 0.02, { colour: shade(stripe, 0.85), decor: true });
      }
      // the ends: the living room's window in the -x end, the +x end blank but for its vent
      for (const side of [-1, 1]) {
        const f: Face = { origin: [side * L / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: T };
        const holes: HoleRect[] = side < 0 ? [{ u0: -0.6, u1: 0.6, y0: floor + 1.025, y1: floor + 1.875 }] : [];
        holedFace(sink, 'structureMetal', f, { u0: -T / 2, u1: T / 2, y0: floor, y1: top }, holes, reveal);
        if (side < 0) {
          sink.recess = reveal;
          try { windowUnit(sink, f, 0, floor + 1.025, 1.2, 0.85, style, rng, 0.25); } finally { sink.recess = 0; }
        } else faceBox(sink, 'structureMetal', f, 0, top - 0.7, 0.015, 0.45, 0.3, 0.03, { colour: alu, decor: true });
      }
    } finally { sink.paint = null; }
    // the door's porch on the front (+z) side: a deck on a single-wide's deep lot, a stoop on a double-wide's
    const deckW = double ? 2.0 : 2.6;
    sink.span('structureWood', du - deckW / 2, 0.0, T / 2, du + deckW / 2, floor - 0.05, T / 2 + deckD, { colour: PLANK_GREY, ...(double ? { decor: true } : {}) });
    for (let k = 1; k <= 3; k++) sink.span('structureWood', du - 0.6, floor * (3 - k) / 4 - 0.05, T / 2 + deckD + 0.28 * (k - 1), du + 0.6, floor * (4 - k) / 4 - 0.05, T / 2 + deckD + 0.28 * k, { colour: PLANK_GREY, decor: true });
    for (const s2 of [-1, 1]) {
      sink.span('structureWood', du + s2 * (deckW / 2 - 0.05) - 0.04, floor - 0.05, T / 2 + 0.05, du + s2 * (deckW / 2 - 0.05) + 0.04, floor + 0.95, T / 2 + deckD, { colour: PLANK, decor: true, fine: true });
    }
    sink.span('structureWood', du - deckW / 2, floor + 0.88, T / 2 + deckD - 0.05, du + deckW / 2, floor + 0.95, T / 2 + deckD + 0.02, { colour: PLANK, decor: true });
    // the swamp cooler on the roof, the propane bottle and a satellite dish
    const cx = -L * 0.2, roofAt = (double ? rg.ridgeTopY : top) + 0.02;
    sink.span('structureMetal', cx - 0.5, roofAt, -0.5, cx + 0.5, roofAt + 0.9, 0.5, { colour: rgb(0xc4c0b4), decor: true });
    for (let k = 0; k < 5; k++) sink.span('structureMetal', cx - 0.42, roofAt + 0.15 + k * 0.14, 0.5, cx + 0.42, roofAt + 0.19 + k * 0.14, 0.53, { colour: rgb(0x8a8a84), decor: true, fine: true });
    sink.cylinder('structureMetal', [-L / 2 - 0.65, 0.0, -0.4], 'y', 1.2, 0.36, 10, { colour: rgb(0xe8e6e0), decor: true });
    sink.cylinder('structureMetal', [-L / 2 - 0.65, 1.2, -0.4], 'y', 0.25, 0.36, 10, { colour: rgb(0xe8e6e0), decor: true }, 0.12);
    sink.cylinder('structureMetal', [L / 2 - 0.6, top + 0.05, -T / 2 + 0.5], 'y', 0.7, 0.03, 6, { colour: IRON, decor: true });
    sink.cylinder('structureMetal', [L / 2 - 0.6, top + 0.75, -T / 2 + 0.5], 'z', 0.12, 0.38, 12, { colour: rgb(0xd8d8d4), decor: true }, 0.3);
  });
  return sink.finish();
};

/**
 * The hay shed (a gantry plot): a long pole barn of juniper posts under a low tin gable, bales stacked under it. (Props
 * census #3, lane B 2026-10-14; the judges: "the counter-example's posts and slab roof at barn size ... the slab
 * underside in full view; the bales one solid straw span per bay".) The posts carry plates along each side on knee
 * braces; pole trusses across at every post pair carry the purlins; the roof is corrugated sheets in laps over them with
 * a ridge cap, a sheet or two lifted; the bales stacked one by one, offset course on course.
 */
export const hayShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  // the shed fills the old gantry's reach (its bounds, which stand off the plot's centre)
  const bb = ctx.bounds;
  const L = Math.max(12, bb.maxX - bb.minX - 0.8), Dd = Math.max(4.0, bb.maxZ - bb.minZ - 0.6), H = 4.3;
  const n = Math.max(4, Math.round(L / 3.3));
  const pitch = 12 * Math.PI / 180, half = Dd / 2 - 0.15, rise = half * Math.tan(pitch);
  sink.placed(0, (bb.maxX + bb.minX) / 2, 0, (bb.maxZ + bb.minZ) / 2, () => {
  // the ground under the shed worn bare and dark (dressing)
  groundCourse(sink, -L / 2, -Dd / 2, L / 2, Dd / 2, 0, false, 0.5);
  const xs: number[] = [];
  for (let k = 0; k <= n; k++) {
    const x = -L / 2 + 0.15 + (L - 0.3) * k / n;
    xs.push(x);
    for (const z of [-half, half]) pole(sink, [x, -0.3, z], [x + (look() - 0.5) * 0.08, H - 0.25, z], 0.12, pick(look, JUNIPER), false);
  }
  for (const z of [-half, half]) sink.span('structureWood', -L / 2, H - 0.25, z - 0.1, L / 2, H, z + 0.1, { colour: JUNIPER_DARK });
  sink.dressing(mobile, () => {
    for (const x of xs) {
      // the knee braces from each post to the plate, both ways along it
      for (const z of [-half, half]) for (const dx of [-0.7, 0.7]) {
        if (x + dx < -L / 2 || x + dx > L / 2) continue;
        pole(sink, [x, H - 1.0, z], [x + dx, H - 0.25, z], 0.05, pick(look, JUNIPER), true);
      }
      // the truss across: its tie, its rafters to the ridge, a king post
      pole(sink, [x, H - 0.05, -half], [x, H - 0.05, half], 0.06, JUNIPER_DARK, true);
      for (const z of [-half, half]) pole(sink, [x, H, z], [x, H + rise, 0], 0.06, JUNIPER_DARK, true);
      pole(sink, [x, H - 0.05, 0], [x, H + rise - 0.05, 0], 0.05, JUNIPER_DARK, true);
    }
    // the purlins along the rafters
    for (const t of [0.15, 0.5, 0.85]) for (const side of [-1, 1]) {
      const z = side * half * (1 - t), y = H + rise * t + 0.06;
      sink.span('structureWood', -L / 2, y, z - 0.05, L / 2, y + 0.08, z + 0.05, { colour: JUNIPER_DARK, decor: true });
    }
  });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 12, eave: 0.45, verge: 0.4, thickness: 0.03, bucket: 'roof', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0.14, 0, () => emitRoof(sink, roofGeometry(Dd, L, H, roof), roof));
  sink.dressing(mobile, () => {
    // the sheets' laps across each slope, a sheet lifted at the windward eave
    for (let x = -L / 2 - 0.4 + 0.86; x < L / 2 + 0.4; x += 0.86) {
      for (const side of [-1, 1]) {
        sink.member('roof', [x, H + 0.14 + 0.035 - (Dd / 2 + 0.45 - 0.02) * Math.tan(pitch) + rise * 0, side * (Dd / 2 + 0.45)], [x, H + 0.14 + rise + 0.035 + (0.15) * Math.tan(pitch), 0],
          0.06, 0.02, [0, Math.cos(pitch), side * Math.sin(pitch)], { decor: true, fine: true, exposed: true }, 0);
      }
    }
    if (look() < 0.6) {
      const x = -L / 2 + 1 + look() * (L - 2);
      // (still nailed at its upper end on the roof, its eave end lifted: the connectivity receipt)
      sink.member('roof', [x - 0.42, H + 0.14 + 1.6 * Math.tan(pitch) + 0.01, Dd / 2 - 1.6], [x - 0.42, H + 0.62, Dd / 2 + 0.35], 0.82, 0.02, [0, 0.95, 0.3], { decor: true, exposed: true }, 0);
    }
  });
  // the bales: stacks two to five high in most bays, each bale its own block, the courses laid crosswise and offset
  // (the stack's core solid: structure, the same on every tier)
  for (let k = 0; k < n; k++) {
    if (ctx.rng() < 0.25) continue;
    const x0 = -L / 2 + 0.4 + (L - 0.3) * k / n, h = 2 + Math.floor(ctx.rng() * 4), x1 = x0 + Math.min(2.6, (L - 0.8) / n - 0.3);
    sink.span('straw', x0 + 0.05, 0, -0.85, x1 - 0.05, h * 0.46 - 0.04, 1.15);
    sink.dressing(mobile, () => {
      for (let r = 0; r < h; r++) {
        const y0 = r * 0.46, cross = r % 2 === 1, bl = cross ? 0.46 : 0.92, off = cross ? 0 : (r % 4 === 2 ? 0.46 : 0);
        for (let x = x0 + off; x + bl <= x1 + 0.01; x += bl) {
          for (let z = -0.9; z < 1.2; z += cross ? 0.7 : 1.05) {
            const zl = cross ? 0.7 : 1.05, z1 = Math.min(1.2, z + zl);
            sink.span('straw', x + 0.01, y0 + 0.01, z + 0.01, x + bl - 0.01, y0 + 0.45, z1 - 0.01, { decor: true, shade: 0.9 + look() * 0.15 });
          }
        }
      }
      if (look() < 0.5) sink.span('straw', x0 + 0.3, h * 0.46, -0.4, x0 + 1.22, h * 0.46 + 0.45, 0.4, { decor: true });
    });
  }
  });
  return sink.finish();
};
