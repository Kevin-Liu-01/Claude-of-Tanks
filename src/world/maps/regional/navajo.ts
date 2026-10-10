// src/world/maps/regional/navajo.ts — the navajo kit (Titan Gorge: Monument Valley on the Colorado Plateau, the Navajo
// Nation's Oljato chapter round Goulding's trading post). The hogan, the family's house: eight walls of juniper logs
// saddle-notched at the corners on a sandstone footing, chinked with red mud, the roof cribbed inward in rings of logs
// and heaped with earth, a stovepipe through the smoke hole, its one door facing the sunrise; the shade house (chaha'oh),
// a brush roof on forked juniper posts; the trading post in the manner of Goulding's, two storeys of red sandstone under
// a parapet with the store below, the trader's rooms above reached by an outside stair, a wool room beside it and a
// stockade corral behind; the general store with its false front, porch and gas pump; stone ranch houses under
// corrugated iron or a flat mud roof on vigas; corrugated equipment sheds, wool barns and hay sheds on juniper poles;
// the single-wide trailer on block piers with its porch and swamp cooler; the roadside jewellery stands; the windmill
// over its stock tank and the chapter's water tower; the BIA day school of cut sandstone under a hipped tin roof; and
// the abandoned camps: a roofless stone house, a fallen hogan.
import { PartSink, faceBox, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Juniper logs and posts silvered by the sun (a few fresher, browner), and the shadowed underside of a log. */
const JUNIPER: readonly Rgb[] = [0x8c7d6b, 0x7f705f, 0x968874, 0x7a6a58].map(rgb);
const JUNIPER_DARK = rgb(0x5a4d41);
const PLANK = rgb(0x7d6853), PLANK_GREY = rgb(0x8f8579);
/** The reservation's door paints: turquoise, sky blue, barn red, forest green, and bare boards. */
const DOOR_PAINT: readonly Rgb[] = [0x3d8a86, 0x3f6f99, 0x8a3a2c, 0x4d6f45, 0x7d6853].map(rgb);
/** Window trim: white, green, blue, red. */
const TRIM: readonly Rgb[] = [0xd6d0c2, 0x4f7a52, 0x3f6f99, 0x8a3a2c].map(rgb);
const STOVEPIPE = rgb(0x2c2b29), GALV = rgb(0xa4a8a5), RUSTY = rgb(0x7a5641), IRON = rgb(0x3b3d3e);
/** Corrugated iron cladding (structureMetal's profiled sheet under a livery): galvanised, dulled, rusting, oxide brown
 * (Titan round 3: the barn red read as a Midwest barn). */
const CLADDING: readonly Rgb[] = [0xa4a8a5, 0x8f9390, 0x8a6a55, 0x76604e].map(rgb);
/** Hauled water: the blue plastic drum, the old steel one. */
const DRUM: readonly Rgb[] = [0x2f5f98, 0x2f5f98, 0x6a4a3a].map(rgb);
const OCT = Math.PI / 4;

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** A slightly bent juniper post or pole from a to b (round, seven-sided), dressing or structure. */
function pole(sink: PartSink, a: Vec3, b: Vec3, r: number, colour: Rgb, decor: boolean): void {
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
function eastSide(yaw: number | undefined): number {
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
function hoganBody(sink: PartSink, rng: () => number, look: () => number, o: HoganOptions): number {
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
function woodStack(sink: PartSink, x: number, z: number, yaw: number, len: number, h: number, look: () => number, depth = 0.9): void {
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
function endStacks(sink: PartSink, b: RegionalBuildContext['bounds'], hz: number, R: number, door: number, look: () => number, h: number): void {
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
function drum(sink: PartSink, x: number, z: number, look: () => number): void {
  const c = pick(look, DRUM);
  sink.cylinder('structureMetal', [x, 0, z], 'y', 0.88, 0.29, 10, { colour: c, decor: true });
  sink.cylinder('structureMetal', [x, 0.88, z], 'y', 0.03, 0.27, 10, { colour: shade(c, 0.8), decor: true });
}

/** A point on a face: `u` along it, `y` up, `o` out from it. */
function facePoint(f: Face, u: number, y: number, o: number): Vec3 {
  return [f.origin[0] + f.u[0] * u + f.out[0] * o, y, f.origin[2] + f.u[2] * u + f.out[2] * o];
}

/**
 * A pair of plank doors in a wide opening (the wool room, the barns): vertical boards with their joints, two battens
 * and a Z brace on each leaf, strap hinges, the frame round them (gauntlet wave 104: the shared gate's dark wicket
 * read as an unrendered black hole; these leaves are boards all over).
 */
function plankGate(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, leaf: Rgb, frame: { width: number; out: number; colour: Rgb }): void {
  const go = sink.recess > 0 ? -sink.recess + 0.03 : 0.015;
  const lc = { colour: leaf, decor: true, uv: UV_MEMBER };
  const joint = shade(leaf, 0.72), batten = shade(leaf, 0.9);
  for (const side of [-1, 1]) {
    const cu = u + side * w / 4, lw = w / 2 - 0.02, boards = Math.max(3, Math.round(lw / 0.24));
    faceBox(sink, 'structureWood', face, cu, y + h / 2, go, lw, h, 0.05, lc);
    for (let k = 1; k < boards; k++) faceBox(sink, 'structureWood', face, cu - lw / 2 + k * lw / boards, y + h / 2, go + 0.027, 0.025, h - 0.06, 0.008, { colour: joint, decor: true, fine: true });
    for (const t of [0.14, 0.86]) faceBox(sink, 'structureWood', face, cu, y + h * t, go + 0.045, lw - 0.12, 0.14, 0.03, { colour: batten, decor: true, uv: UV_MEMBER });
    // the brace from the lower batten at the hinge side up to the upper batten at the meeting side
    const hu = cu + side * (lw / 2 - 0.12), mu = cu - side * (lw / 2 - 0.12);
    sink.member('structureWood', facePoint(face, hu, y + h * 0.14 + 0.07, go + 0.045), facePoint(face, mu, y + h * 0.86 - 0.07, go + 0.045), 0.12, 0.03, face.out,
      { colour: batten, decor: true, exposed: true }, 0);
    // the strap hinges, black iron across the battens at the hinge side
    for (const t of [0.14, 0.86]) faceBox(sink, 'structureMetal', face, cu + side * (lw / 2 - 0.3), y + h * t, go + 0.065, 0.55, 0.05, 0.01, { colour: IRON, decor: true, fine: true });
  }
  const fo = { decor: true, colour: frame.colour };
  faceBox(sink, 'structureWood', face, u - w / 2 - frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, 'structureWood', face, u + w / 2 + frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, 'structureWood', face, u, y + h + frame.width / 2, frame.out / 2, w + 2 * frame.width, frame.width, frame.out, fo);
}

/**
 * The ground course at a body's foot (Titan round 2; gauntlet wave 104: "buildings sit on the sand with no footings and
 * no darkening where they meet it"): a course of darker dressed sandstone a hand proud of the walls, and the red earth
 * trodden dark round it. Dressing: a building's collision is its body's.
 */
function groundCourse(sink: PartSink, x0: number, z0: number, x1: number, z1: number, top = 0.3, footing = true, earth = 0.75): void {
  if (footing) sink.span('stone', x0 - 0.14, -0.45, z0 - 0.14, x1 + 0.14, top, z1 + 0.14, { decor: true, shade: 0.72 });
  sink.span('plaster2', x0 - earth, -0.09, z0 - earth, x1 + earth, 0.015, z1 + earth, { decor: true, shade: 0.6 });
}

/** The ground course of a house frame's main body. */
function frameCourse(sink: PartSink, frame: HouseFrame, top = 0.3): void {
  const b = frame.bodies[0];
  groundCourse(sink, b.x0, b.z0, b.x1, b.z1, top);
}

/** The hogan: one octagon in its plot, its door facing the sunrise, a woodpile and a water drum by it. */
const hogan: RegionalBuilder = (ctx) => {
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
 * The shade house (chaha'oh): four forked juniper posts, two stringers, cross poles and a roof of juniper and
 * cottonwood boughs that lets the sun through in patches. Its posts are the structure; the brush casts a shadow.
 */
function ramadaBody(sink: PartSink, W: number, D: number, H: number, look: () => number): void {
  const post = pick(look, JUNIPER);
  const px = W / 2 - 0.15, pz = D / 2 - 0.15;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lean = (look() - 0.5) * 0.12;
    pole(sink, [sx * px, -0.3, sz * pz], [sx * px + lean, H, sz * pz], 0.085, shade(post, 0.9 + look() * 0.2), false);
  }
  for (const sz of [-1, 1]) pole(sink, [-px - 0.25, H + 0.06, sz * pz], [px + 0.25, H + 0.06, sz * pz], 0.075, post, true);
  const n = Math.max(4, Math.round(W / 0.55));
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + 0.1 + (W - 0.2) * (k + 0.5) / n;
    pole(sink, [x, H + 0.19, -pz - 0.3], [x + (look() - 0.5) * 0.1, H + 0.19, pz + 0.3], 0.05, shade(post, 1.05), true);
  }
  // the boughs: a mat of juniper and cottonwood branches laid across the poles in two crossing layers, ragged at the
  // edges and hanging over them, with a few thicker bundles; the sun comes through in patches (they cast a shadow)
  const tone = (): Rgb => [0.40 + look() * 0.14, 0.38 + look() * 0.12, 0.25 + look() * 0.07];
  const dry = (): Rgb => [0.52 + look() * 0.1, 0.45 + look() * 0.08, 0.33 + look() * 0.05];
  for (let layer = 0; layer < 2; layer++) {
    const across = layer === 0, len = across ? D : W, span = across ? W : D, n2 = Math.round(span / 0.16);
    for (let k = 0; k < n2; k++) {
      if (look() < 0.12) continue;
      const t = -span / 2 - 0.15 + (span + 0.3) * (k + look() * 0.6) / n2;
      const over0 = 0.1 + look() * 0.45, over1 = 0.1 + look() * 0.45, y = H + 0.27 + layer * 0.07 + look() * 0.04;
      const a: Vec3 = across ? [t, y, -len / 2 - over0] : [-len / 2 - over0, y, t];
      const b: Vec3 = across ? [t + (look() - 0.5) * 0.3, y + (look() - 0.5) * 0.05, len / 2 + over1] : [len / 2 + over1, y + (look() - 0.5) * 0.05, t + (look() - 0.5) * 0.3];
      sink.member('structureWood', a, b, 0.1 + look() * 0.12, 0.05, [0, 1, 0], { colour: look() < 0.3 ? dry() : tone(), decor: true, exposed: true, shadow: true }, 0);
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = (look() - 0.5) * (W - 0.8), z = (look() - 0.5) * (D - 0.8), r = 0.35 + look() * 0.35;
    sink.cylinder('structureWood', [x, H + 0.36, z], 'y', 0.18 + look() * 0.12, r, 6, { colour: tone(), decor: true, shadow: true }, r * 0.55, true, look());
  }
  // the hanging ends of the boughs over the eaves
  for (let k = 0; k < 14; k++) {
    const onX = look() < 0.5, s = look() < 0.5 ? -1 : 1, t = (look() - 0.5) * (onX ? W : D);
    const x = onX ? t : s * (W / 2 + 0.25), z = onX ? s * (D / 2 + 0.25) : t;
    const dx = onX ? 0 : s * 0.3, dz = onX ? s * 0.3 : 0, drop = 0.25 + look() * 0.35;
    sink.member('structureWood', [x, H + 0.3, z], [x + dx, H + 0.3 - drop, z + dz], 0.18 + look() * 0.2, 0.05, onX ? [0, 0, s] : [s, 0, 0],
      { colour: tone(), decor: true, exposed: true, shadow: true }, 0);
  }
}

const ramada: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the shade house fills its plot (its posts stand at the plot's corners)
  const b = ctx.bounds;
  const W = Math.max(2.6, b.maxX - b.minX - 0.3), D = Math.max(2.4, b.maxZ - b.minZ - 0.3);
  const H = 2.25 + ctx.rng() * 0.2;
  sink.placed(0, (b.maxX + b.minX) / 2, 0, (b.maxZ + b.minZ) / 2, () => ramadaBody(sink, W, D, H, ctx.variant));
  return sink.finish();
};

/**
 * A stockade corral of juniper posts set close in the ground (the sheep and goat pens of a camp): each run one
 * structural panel at the posts' common height, the posts' ragged tops standing over it as dressing. Runs as
 * [x0, z0, x1, z1] in the building's frame; a gap of `gate` metres at the middle of the first run.
 */
function stockade(sink: PartSink, runs: ReadonlyArray<readonly [number, number, number, number]>, look: () => number, gate = 0): void {
  const H = 1.45, colour = pick(look, JUNIPER);
  runs.forEach(([x0, z0, x1, z1], i) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.5) return;
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const pieces: Array<[number, number]> = i === 0 && gate > 0 ? [[0, len / 2 - gate / 2], [len / 2 + gate / 2, len]] : [[0, len]];
    for (const [a, b] of pieces) {
      if (b - a < 0.3) continue;
      const yaw = Math.atan2(ux, uz);
      sink.placed(yaw, x0 + ux * (a + b) / 2, 0, z0 + uz * (a + b) / 2, () => {
        sink.span('structureWood', -0.07, -0.3, -(b - a) / 2, 0.07, H, (b - a) / 2, { colour: shade(colour, 0.82) });
        for (let s = -(b - a) / 2 + 0.07; s < (b - a) / 2; s += 0.16 + look() * 0.06) {
          const h = H + 0.05 + look() * 0.42, r = 0.055 + look() * 0.03;
          sink.cylinder('structureWood', [(look() - 0.5) * 0.04, 0.0, s], 'y', h, r, 5, { colour: shade(colour, 0.85 + look() * 0.3), decor: true, uv: UV_MEMBER }, r * 0.8, true, look());
        }
        // a rail of poles bound along the inside
        sink.cylinder('structureWood', [-0.1, 1.05, -(b - a) / 2], 'z', b - a, 0.05, 5, { colour, decor: true, uv: UV_MEMBER });
      });
    }
  });
}

/** Wooden sash windows of the stone and stucco houses: painted trim, a timber lintel, a board sill. */
function sashStyle(trim: Rgb, bars: WindowStyle['bars']): WindowStyle {
  return { frame: trim, frameWidth: 0.07, frameOut: 0.05, bars, surround: null, sill: { bucket: 'structureWood', out: 0.07, colour: PLANK_GREY }, shutters: null };
}

/** The house dialect of the kit: sash windows with a timber lintel in the stone, plank or panel doors. */
function dialectOf(rng: () => number, trim: Rgb, door: Rgb, opts: { lit?: number; bars?: WindowStyle['bars']; leaf?: 'plank' | 'panel' | 'glazed' } = {}): HouseDialect {
  const style = sashStyle(trim, opts.bars ?? 'two');
  return {
    window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...style, bars: 'none', sill: null } : style, rng, o.kind === 'loft' ? 0 : opts.lit ?? 0.5);
      // the lintel: a squared juniper beam over the opening, its ends in the masonry
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.09, 0.025, o.w + 0.36, 0.17, 0.05, { colour: JUNIPER_DARK, decor: true, fineSides: true });
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        plankGate(s, face, o.u, y0 + o.y0, o.w, o.h, PLANK_GREY, { width: 0.16, out: 0.06, colour: JUNIPER_DARK });
        return;
      }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: trim },
        steps: { bucket: 'stone' }, leafKind: opts.leaf ?? (rng() < 0.5 ? 'plank' : 'panel') }, frame.floors[o.storey] + o.y0);
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.2, 0.025, o.w + 0.5, 0.18, 0.05, { colour: JUNIPER_DARK, decor: true, fineSides: true });
    },
  };
}

/** The flat mud roof's vigas: log ends through the wall below the parapet, a canale spouting off each side. */
function vigaEnds(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const y = frame.eaveY - 0.22, b = frame.bodies[frame.bodies.length - 1];
  const W = b.x1 - b.x0;
  const n = Math.max(3, Math.round(W / 0.75));
  for (const z of [b.z1, b.z0]) for (let k = 0; k < n; k++) {
    const x = b.x0 + 0.35 + (W - 0.7) * (k + 0.5) / n;
    sink.cylinder('structureWood', [x, y, z > 0 ? z - 0.02 : z - 0.32], 'z', 0.34, 0.1, 6, { colour: pick(look, JUNIPER), decor: true, uv: UV_MEMBER });
  }
  for (const side of [-1, 1]) {
    const x = side > 0 ? b.x1 : b.x0;
    sink.span('structureWood', side > 0 ? x : x - 0.6, frame.eaveY + 0.05, -0.12, side > 0 ? x + 0.6 : x, frame.eaveY + 0.2, 0.12, { colour: PLANK, decor: true });
  }
}

interface RanchOptions {
  W: number;
  D: number;
  wall: RegionalBucket;
  flat: boolean;
  porch: boolean;
}

/**
 * A ranch house of the valley: one storey of red sandstone (or stucco) on a footing, sash windows under timber lintels,
 * a low gable of corrugated iron with a stovepipe, or a flat mud roof on vigas behind a parapet; a porch of juniper
 * posts under a tin shed roof along the front. Built at the origin facing +z.
 */
function ranchBody(sink: PartSink, rng: () => number, look: () => number, o: RanchOptions): HouseFrame {
  const { W, D } = o;
  const trim = pick(rng, TRIM), door = pick(rng, DOOR_PAINT);
  const du = (rng() - 0.5) * W * 0.3;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: du, w: 0.95, y0: 0, h: 2.05 }];
  for (const o2 of windowRhythm('front', 0, W, { w: 0.9, h: 1.2, sill: 0.95, spacing: 2.3, margin: 0.8, max: 3, avoid: [[du - 0.55, du + 0.55]] })) openings.push(o2);
  for (const face of ['left', 'right'] as const) for (const o2 of windowRhythm(face, 0, D, { w: 0.85, h: 1.1, sill: 1.0, spacing: 2.6, margin: 1.0, max: 2 })) openings.push(o2);
  for (const o2 of windowRhythm('back', 0, W, { w: 0.7, h: 0.9, sill: 1.25, spacing: 3.0, margin: 1.2, max: 1 })) openings.push(o2);
  const roof: RoofSpec = o.flat
    ? { kind: 'flat', pitchDeg: 0, eave: 0.04, verge: 0.04, thickness: 0.24, bucket: 'plaster', parapet: 0.32 }
    : { kind: 'gable', pitchDeg: 15 + rng() * 6, eave: 0.38, verge: 0.3, thickness: 0.07, bucket: 'roof', ridge: 'saddle' };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.32, out: 0.05, bucket: 'stone' }, storeys: [{ h: 2.55 + rng() * 0.25, wall: o.wall }], roof,
    gableBucket: rng() < 0.5 ? o.wall : 'wood', openings,
    chimneys: o.flat ? [] : [{ x: (rng() - 0.5) * W * 0.4, z: -D * 0.25, sx: 0.5, sz: 0.5, above: 0.55, bucket: 'stone', cap: 'slab' }],
    gutters: null, verge: o.flat ? null : { colour: PLANK_GREY, bucket: 'structureWood' }, reveal: o.wall === 'stone' ? 0.3 : 0.18,
    rafters: o.flat ? null : JUNIPER_DARK, spall: o.wall === 'stone' ? null : 'stone',
  }, dialectOf(rng, trim, door));
  frameCourse(sink, frame, 0.36);
  if (o.flat) vigaEnds(sink, frame, look);
  else {
    // a stovepipe through the tin beside the ridge
    const top = frame.roof.topAt(W * 0.22, D * 0.18) ?? frame.roof.ridgeTopY;
    sink.cylinder('structureMetal', [W * 0.22, top - 0.3, D * 0.18], 'y', 1.2, 0.08, 8, { colour: STOVEPIPE, decor: true });
    sink.cylinder('structureMetal', [W * 0.22, top + 0.9, D * 0.18], 'y', 0.12, 0.17, 8, { colour: STOVEPIPE, decor: true }, 0.03);
  }
  if (o.porch) {
    // the porch: juniper posts and a tin shed roof falling away from the front wall
    const y = frame.eaveY - (o.flat ? 0.05 : 0.15), depth = 1.9;
    const n = Math.max(2, Math.round(W / 2.6));
    for (let k = 0; k <= n; k++) {
      const u = -W / 2 + 0.25 + (W - 0.5) * k / n;
      const a: Vec3 = [u, 0.0, D / 2 + depth - 0.12];
      pole(sink, a, [u, y - 0.2, D / 2 + depth - 0.12], 0.08, pick(look, JUNIPER), false);
    }
    const porch: RoofSpec = { kind: 'shed', pitchDeg: 9, eave: 0.12, verge: 0.12, thickness: 0.06, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W, y - 0.25, porch), porch));
    // a plank deck on stones under it
    sink.span('structureWood', -W / 2 + 0.1, 0.0, D / 2 + 0.02, W / 2 - 0.1, 0.22, D / 2 + depth, { colour: PLANK_GREY, decor: true });
  }
  return frame;
}

/** A stone ranch house in a plot (the compound's house, the general store's back house). */
function ranchIn(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.6 ? 'stone' : 'plaster';
  const flat = rng() < 0.35, porch = rng() < 0.6;
  // the house fills the old cottage's reach: its back on the plot's back edge, its front (or its porch's) on the front
  const b = ctx.bounds;
  const W = Math.max(5.2, b.maxX - b.minX - 0.6), D = Math.max(5.6, b.maxZ - b.minZ - 0.6 - (porch ? 1.9 : 0));
  sink.placed(0, (b.maxX + b.minX) / 2, 0, b.minZ + 0.3 + D / 2, () => ranchBody(sink, rng, ctx.variant, { W, D, wall, flat, porch }));
  return sink.finish();
}

/**
 * The family camp (a compound plot): the hogan at one end, door to the east; a stone ranch house at the other; the
 * shade house between them in front; a stockade sheep corral behind; a woodpile and the water drums.
 */
const camp: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the camp fills the old compound's reach: the hogan and the house at its two ends, the shade house on its front
  // edge, the corral along its back (no lane opens through the plot's ends)
  const b = ctx.bounds;
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ, cx = (b.maxX + b.minX) / 2, cz = (b.maxZ + b.minZ) / 2;
  const flip = rng() < 0.5 ? -1 : 1;
  const R = Math.max(2.5, Math.min(3.1, D / 2 - 1.2));
  const A = R * Math.cos(OCT / 2) + 0.06;
  const hx = cx + flip * (W / 2 - A - 0.15), hz = cz - D / 2 + A + 0.9;
  // the hogan's door: its east side in the camp's frame (the camp turns with the plot)
  sink.placed(0, hx, 0, hz, () => hoganBody(sink, rng, look, { r: R, door: eastSide(ctx.yaw) }));
  const rw = Math.min(7.6, W * 0.32), rd = Math.min(6.2, D * 0.45);
  sink.placed(0, cx - flip * (W / 2 - rw / 2 - 0.2), 0, cz - D / 2 + rd / 2 + 0.25, () => {
    const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.65 ? 'stone' : 'plaster';
    ranchBody(sink, rng, look, { W: rw, D: rd, wall, flat: rng() < 0.4, porch: false });
  });
  // the shade house on the front edge between them
  const rDw = 4.2, rDd = 3.4;
  sink.placed(0, cx + flip * W * 0.05, 0, cz + D / 2 - rDd / 2 - 0.15, () => ramadaBody(sink, rDw, rDd, 2.3, look));
  // the sheep corral behind, between the houses
  const cx0 = cx - flip * (W / 2 - rw - 0.6), cx1 = hx - flip * (A + 0.6);
  const za = cz - D / 2 + 0.3, zb = cz - D / 2 + 4.2;
  if (Math.abs(cx1 - cx0) > 3) stockade(sink, [[cx0, zb, cx1, zb], [cx1, zb, cx1, za], [cx1, za, cx0, za], [cx0, za, cx0, zb]], look, 1.6);
  // a cord of juniper along the front by the hogan
  woodStack(sink, hx - flip * 0.4, cz + D / 2 - 0.45, 0, Math.min(2.6, A * 0.9), 1.15, look, 0.6);
  sink.dressing(ctx.tier === 'mobile', () => {
    drum(sink, hx - flip * (A + 0.35), hz + A * 0.6, look);
    drum(sink, hx - flip * (A + 0.95), hz + A * 0.7, look);
  });
  return sink.finish();
};

/**
 * The trading post in the manner of Goulding's (a caravanserai plot): two storeys of red sandstone under a parapet,
 * the store's doors and windows under a juniper-post porch with its sign board, the trader's rooms above reached by an
 * outside stair; a one-storey stone wool room beside it; a stockade corral behind; a gas pump at the porch's end.
 */
const tradingPost: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the post, its wool room and its corral fill the old caravanserai's reach (its measured bounds)
  const bb = ctx.bounds, PW = bb.maxX - bb.minX, PD = bb.maxZ - bb.minZ;
  const W1 = Math.max(8.4, Math.min(10.2, PW * 0.46)), D1 = Math.max(7.2, Math.min(8.6, PD * 0.42));
  const x1 = bb.minX + W1 / 2 + 1.4, z1 = bb.maxZ - D1 / 2 - 2.45;
  const trim = pick(rng, TRIM), door = pick(rng, DOOR_PAINT);
  sink.placed(0, x1, 0, z1, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.3 },
      { face: 'left', storey: 1, kind: 'door', u: D1 / 2 - 1.1, w: 0.9, y0: 0, h: 2.0 },
    ];
    for (const u of [-W1 * 0.3, W1 * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.5, h: 1.5, y0: 0.75 });
    for (const o of windowRhythm('front', 1, W1, { w: 0.85, h: 1.15, sill: 0.8, spacing: 2.4, margin: 1.0, max: 3 })) openings.push(o);
    for (const o of windowRhythm('right', 0, D1, { w: 0.8, h: 1.0, sill: 1.3, spacing: 2.6, margin: 1.2, max: 2 })) openings.push(o);
    for (const o of windowRhythm('right', 1, D1, { w: 0.8, h: 1.1, sill: 0.8, spacing: 2.6, margin: 1.0, max: 2 })) openings.push(o);
    for (const o of windowRhythm('left', 1, D1, { w: 0.8, h: 1.1, sill: 0.8, spacing: 2.6, margin: 1.0, max: 1, avoid: [[D1 / 2 - 1.7, D1 / 2]] })) openings.push(o);
    for (const o of windowRhythm('back', 1, W1, { w: 0.8, h: 1.1, sill: 0.8, spacing: 2.8, margin: 1.2, max: 2 })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W1, d: D1, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.3, wall: 'stone' }, { h: 2.9, wall: 'stone' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.25, bucket: 'plaster', parapet: 0.6 }, gableBucket: 'stone',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.34,
    }, dialectOf(rng, trim, door, { lit: 0.5, leaf: 'glazed' }));
    frameCourse(sink, frame, 0.42);
    vigaEnds(sink, frame, look);
    // the porch across the store front: juniper posts, a tin roof, the plank deck, the sign board on the parapet
    const y = 3.0, depth = 2.2;
    for (let k = 0; k <= 3; k++) {
      const u = -W1 / 2 + 0.3 + (W1 - 0.6) * k / 3;
      pole(sink, [u, 0, D1 / 2 + depth - 0.15], [u, y, D1 / 2 + depth - 0.15], 0.1, pick(look, JUNIPER), false);
    }
    const porch: RoofSpec = { kind: 'shed', pitchDeg: 8, eave: 0.15, verge: 0.2, thickness: 0.07, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D1 / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W1, y, porch), porch));
    sink.span('structureWood', -W1 / 2 + 0.1, 0.0, D1 / 2 + 0.02, W1 / 2 - 0.1, 0.36, D1 / 2 + depth, { colour: PLANK_GREY, decor: true });
    const f = frame.faces.front, top = frame.eaveY + 0.25;
    faceBox(sink, 'structureWood', f, 0, top + 0.3, 0.05, W1 * 0.7, 0.8, 0.06, { colour: rgb(0xe4ddcc), decor: true });
    // the lettering read at range: two dark bars of capitals and a red rule under them
    for (const [yy, w] of [[top + 0.48, 0.62], [top + 0.18, 0.48]] as const) faceBox(sink, 'structureWood', f, 0, yy, 0.085, W1 * w, 0.17, 0.02, { colour: rgb(0x3a2a22), decor: true });
    faceBox(sink, 'structureWood', f, 0, top - 0.02, 0.085, W1 * 0.6, 0.05, 0.02, { colour: rgb(0x9a2e24), decor: true });
    // the outside stair up the west wall to the trader's rooms: stringers, treads and a rail (structure: the stringer)
    const sx = -W1 / 2 - 0.55, floor1 = frame.floors[1];
    const z0 = D1 / 2 - 1.1 - 0.5, run = Math.min(D1 - 1.4, floor1 * 1.15);
    const slope = Math.hypot(run, floor1);
    sink.member('structureWood', [sx, 0.0, z0 - run], [sx, floor1, z0], 0.9, 0.2, [0, run / slope, -floor1 / slope], { colour: PLANK, exposed: true }, 0);
    const steps = Math.round(floor1 / 0.2);
    for (let k = 1; k <= steps; k++) {
      const yy = floor1 * k / steps, zz = z0 - run + run * k / steps;
      sink.span('structureWood', sx - 0.48, yy - 0.05, zz - 0.14, sx + 0.48, yy + 0.02, zz + 0.1, { colour: PLANK_GREY, decor: true });
    }
    sink.span('structureWood', sx - 0.5, floor1 - 0.08, z0 - 0.05, sx + 0.5, floor1 + 0.02, D1 / 2 - 0.4, { colour: PLANK_GREY });
    sink.member('structureWood', [sx - 0.47, 0.9, z0 - run], [sx - 0.47, floor1 + 0.95, z0], 0.06, 0.06, [1, 0, 0], { colour: PLANK, decor: true, exposed: true }, 0);
  });
  // the wool room: one storey of the same stone, a wide plank door on the front, small high windows
  const W2 = Math.max(5.6, Math.min(9.6, PW - W1 - 2.9)), D2 = Math.max(6.4, Math.min(10, PD * 0.48));
  const x2 = x1 + W1 / 2 + 0.9 + W2 / 2, z2 = z1 + D1 / 2 - D2 / 2 - 0.2;
  sink.placed(0, x2, 0, z2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.2, y0: 0, h: 2.4 }];
    for (const o of windowRhythm('right', 0, D2, { w: 0.7, h: 0.5, sill: 2.0, spacing: 2.4, margin: 1.0 })) openings.push({ ...o, kind: 'loft' });
    const frame = buildHouse(sink, {
      w: W2, d: D2, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.0, wall: 'stone' }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.24, bucket: 'plaster', parapet: 0.35 }, gableBucket: 'stone',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.3,
    }, dialectOf(rng, trim, door, { lit: 0 }));
    frameCourse(sink, frame, 0.38);
    vigaEnds(sink, frame, look);
  });
  // the stockade corral behind the buildings, and the gas pump at the porch's east end
  const zc = Math.min(z1 - D1 / 2, z2 - D2 / 2) - 0.6;
  const cz0 = bb.minZ + 0.45, xa = bb.minX + 0.45, xb = bb.maxX - 0.45;
  if (zc - cz0 > 3) stockade(sink, [[xa, zc, xa, cz0], [xa, cz0, xb, cz0], [xb, cz0, xb, zc]], look);
  const gx = x1 + W1 / 2 + 1.5, gz = bb.maxZ - 1.2;
  sink.span('stone', gx - 0.9, -0.2, gz - 0.55, gx + 0.9, 0.18, gz + 0.55, { decor: true });
  sink.span('structureMetal', gx - 0.3, 0.18, gz - 0.25, gx + 0.3, 1.75, gz + 0.25, { colour: rgb(0xb8302a) });
  sink.cylinder('structureMetal', [gx, 1.75, gz], 'y', 0.42, 0.24, 10, { colour: rgb(0xe8e2d4), decor: true });
  return sink.finish();
};

/**
 * The general store (a souk compound plot): one storey of stone or stucco behind a stepped false front with its sign,
 * a porch with a bench, the gas island under a canopy, a stone storeroom behind.
 */
const generalStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the store, its gas island and its storeroom fill the old souk compound's reach (no lane opens at its ends)
  const bb = ctx.bounds, PW = bb.maxX - bb.minX, PD = bb.maxZ - bb.minZ, bx = (bb.maxX + bb.minX) / 2, bz = (bb.maxZ + bb.minZ) / 2;
  const W = Math.max(9, PW - 4.6), D = Math.max(7.5, Math.min(9.5, PD - 5.2));
  const x0 = bx - PW / 2 + W / 2 + 0.2, z0 = bz + PD / 2 - D / 2 - 2.4;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' || rng() < 0.5 ? 'stone' : 'plaster';
  const trim = pick(rng, TRIM), door = pick(rng, DOOR_PAINT);
  sink.placed(0, x0, 0, z0, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.3 }];
    for (const u of [-W * 0.3, W * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.8, h: 1.6, y0: 0.7 });
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 0.9, sill: 1.4, spacing: 2.8, margin: 1.2, max: 2 })) openings.push(o);
    const H = 3.5;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.22, bucket: 'plaster', parapet: 0.35 }, gableBucket: wall,
      openings, chimneys: [], gutters: null, verge: null, reveal: wall === 'stone' ? 0.3 : 0.18,
    }, dialectOf(rng, trim, door, { lit: 0.45, leaf: 'glazed' }));
    frameCourse(sink, frame, 0.3);
    // the false front: the street wall carried up in a stepped parapet over the roof line
    const top = frame.eaveY + 0.22, step = 0.55 + rng() * 0.3;
    const zf = D / 2 - 0.25;
    sink.span(wall, -W / 2, top, zf, W / 2, top + 0.65, D / 2);
    sink.span(wall, -W * 0.32, top + 0.65, zf, W * 0.32, top + 0.65 + step, D / 2);
    sink.span(wall, -W * 0.14, top + 0.65 + step, zf, W * 0.14, top + 0.95 + step, D / 2);
    const f = frame.faces.front;
    faceBox(sink, 'structureWood', f, 0, top + 0.6, 0.04, W * 0.56, 0.7, 0.05, { colour: rgb(0xe8e1d0), decor: true });
    faceBox(sink, 'structureWood', f, 0, top + 0.66, 0.072, W * 0.46, 0.24, 0.02, { colour: rgb(0x9a2e24), decor: true });
    faceBox(sink, 'structureWood', f, 0, top + 0.38, 0.072, W * 0.3, 0.12, 0.02, { colour: rgb(0x2f3e5a), decor: true });
    // the porch, its bench and the hitching rail
    const depth = 2.1, py = H - 0.1;
    for (let k = 0; k <= 4; k++) {
      const u = -W / 2 + 0.3 + (W - 0.6) * k / 4;
      pole(sink, [u, 0, D / 2 + depth - 0.12], [u, py, D / 2 + depth - 0.12], 0.09, pick(look, JUNIPER), false);
    }
    const porch: RoofSpec = { kind: 'shed', pitchDeg: 7, eave: 0.12, verge: 0.15, thickness: 0.07, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + depth / 2, () => emitRoof(sink, roofGeometry(depth, W, py, porch), porch));
    sink.span('structureWood', -W / 2 + 0.1, 0.0, D / 2 + 0.02, W / 2 - 0.1, 0.3, D / 2 + depth, { colour: PLANK_GREY, decor: true });
    faceBox(sink, 'structureWood', f, -W * 0.3, 0.75, 0.42, 2.0, 0.08, 0.4, { colour: PLANK, decor: true });
  });
  // the gas island under its canopy east of the store
  const gx = bx + PW / 2 - 1.75, gz = bz + PD / 2 - 2.6;
  {
    sink.span('stone', gx - 0.6, -0.2, gz - 1.6, gx + 0.6, 0.18, gz + 1.6);
    for (const dz of [-1.1, 1.1]) pole(sink, [gx, 0.18, gz + dz], [gx, 3.6, gz + dz], 0.09, IRON, false);
    sink.span('structureMetal', gx - 1.6, 3.6, gz - 2.0, gx + 1.6, 3.85, gz + 2.0, { colour: rgb(0xe2ddd0) });
    sink.span('structureMetal', gx - 1.62, 3.62, gz - 2.02, gx + 1.62, 3.72, gz + 2.02, { colour: rgb(0x9a2e24), decor: true });
    for (const dz of [-0.45, 0.45]) {
      sink.span('structureMetal', gx - 0.25, 0.18, gz + dz - 0.2, gx + 0.25, 1.6, gz + dz + 0.2, { colour: pick(look, [rgb(0xb8302a), rgb(0x2f6a9a), rgb(0xd8d2c4)]) });
      sink.cylinder('structureMetal', [gx, 1.6, gz + dz], 'y', 0.3, 0.18, 8, { colour: rgb(0xe8e2d4), decor: true });
    }
  }
  // the storeroom behind: a lean stone box under a tin shed roof
  const sw = Math.min(6.5, W * 0.6), sd = Math.max(2.4, Math.min(6.0, (z0 - D / 2) - (bz - PD / 2) - 0.25));
  {
    sink.placed(0, x0 - W / 2 + sw / 2 + 0.3, 0, z0 - D / 2 - sd / 2 - 0.05, () => {
      const sf = buildHouse(sink, {
        w: sw, d: sd, plinth: null, storeys: [{ h: 2.5, wall: 'stone' }],
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.08, bucket: 'roof' }, gableBucket: 'stone',
        openings: [{ face: 'left', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.95 }], chimneys: [], gutters: null, verge: null, reveal: 0.25,
      }, dialectOf(rng, trim, door, { lit: 0 }));
      frameCourse(sink, sf, 0.24);
    });
  }
  return sink.finish();
};

/**
 * The roadside stands (a market row plot): three booths of juniper posts and plywood under brush and plywood shade,
 * their counters laid with the jewellers' boards, the painted signs along the top.
 */
const roadsideStands: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the stands fill the old market row's reach (its measured bounds, which stand off the plot's centre)
  const bb = ctx.bounds;
  const W = Math.max(6, bb.maxX - bb.minX - 0.5), D = Math.max(2.8, bb.maxZ - bb.minZ - 0.5);
  const n = Math.max(2, Math.round(W / 3.8)), bw = W / n, H = 2.35;
  sink.placed(0, (bb.maxX + bb.minX) / 2, 0, (bb.maxZ + bb.minZ) / 2, () => {
  const ply: readonly Rgb[] = [0xb8a07a, 0xa89272, 0xc4b08c].map(rgb);
  const paint: readonly Rgb[] = [0x2f6a9a, 0x9a2e24, 0x3d8a86, 0xd8b04a, 0xe8e1d0].map(rgb);
  for (let k = 0; k <= n; k++) {
    const x = -W / 2 + k * bw;
    for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) pole(sink, [x + (k === 0 ? 0.1 : k === n ? -0.1 : 0), -0.3, z], [x + (k === 0 ? 0.1 : k === n ? -0.1 : 0), H + (z < 0 ? 0.3 : 0), z], 0.07, pick(look, JUNIPER), false);
  }
  // the back wall of plywood sheets and the side panels between the booths (structure), the roof sheets sloping to
  // the front, the brush laid over them
  sink.span('structureWood', -W / 2 + 0.05, 0.0, -D / 2 + 0.02, W / 2 - 0.05, H + 0.2, -D / 2 + 0.1, { colour: pick(look, ply) });
  for (let k = 0; k <= n; k++) {
    const x = Math.max(-W / 2 + 0.06, Math.min(W / 2 - 0.06, -W / 2 + k * bw));
    sink.span('structureWood', x - 0.03, 0.0, -D / 2 + 0.1, x + 0.03, H, D / 2 - 0.25, { colour: shade(pick(look, ply), 0.92) });
  }
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + (k + 0.5) * bw;
    const c = pick(look, ply);
    const dz = D + 0.4, dy = -0.3, sl = Math.hypot(dz, dy);
    sink.member('structureWood', [x, H + 0.33, -D / 2 - 0.15], [x, H + 0.03, D / 2 + 0.25], bw - 0.06, 0.03, [0, dz / sl, -dy / sl], { colour: c, decor: true, exposed: true, shadow: true }, 0);
    // the counter and its boards: dark velvet panels set with silver and turquoise
    sink.span('structureWood', x - bw / 2 + 0.25, 0.0, D / 2 - 0.85, x + bw / 2 - 0.25, 0.85, D / 2 - 0.3, { colour: shade(c, 0.85) });
    sink.span('structureWood', x - bw / 2 + 0.3, 0.85, D / 2 - 0.82, x + bw / 2 - 0.3, 0.87, D / 2 - 0.33, { colour: rgb(0xe9e4da), decor: true });
    for (let b = 0; b < 3; b++) {
      const bx = x - bw / 2 + 0.55 + b * (bw - 1.1) / 2;
      sink.span('structureWood', bx - 0.28, 0.87, D / 2 - 0.75, bx + 0.28, 0.9, D / 2 - 0.4, { colour: pick(look, [rgb(0x1f2a44), rgb(0x3a1f2a), rgb(0x1e1e22)]), decor: true, fine: true });
      for (let j = 0; j < 4; j++) {
        const jx = bx - 0.2 + j * 0.13;
        sink.span('structureWood', jx - 0.035, 0.9, D / 2 - 0.65 + (j % 2) * 0.12, jx + 0.035, 0.925, D / 2 - 0.58 + (j % 2) * 0.12,
          { colour: j % 2 ? rgb(0x3fb3a8) : rgb(0xc9cdd1), decor: true, fine: true });
      }
    }
    // a hanging rug on the back wall and the painted sign board over the front
    const rug = pick(look, [rgb(0x8e2f24), rgb(0x2f3a5e), rgb(0xd8ccb0)]);
    sink.span('structureWood', x - 0.6, 1.0, -D / 2 + 0.1, x + 0.6, 2.0, -D / 2 + 0.13, { colour: rug, decor: true });
    sink.span('structureWood', x - 0.6, 1.3, -D / 2 + 0.13, x + 0.6, 1.4, -D / 2 + 0.145, { colour: rgb(0x1e1e22), decor: true, fine: true });
    sink.span('structureWood', x - 0.6, 1.6, -D / 2 + 0.13, x + 0.6, 1.7, -D / 2 + 0.145, { colour: rgb(0xe8e1d0), decor: true, fine: true });
    const sign: Face = { origin: [x, 0, D / 2 - 0.08], u: [1, 0, 0], out: [0, 0, 1], width: bw };
    // (a board standing free on its posts: its back face is drawn)
    faceBox(sink, 'structureWood', sign, 0, H + 0.55, 0.03, bw - 0.4, 0.5, 0.04, { colour: rgb(0xe8e1d0), decor: true });
    faceBox(sink, 'structureWood', sign, 0, H + 0.6, 0.055, bw - 0.9, 0.16, 0.02, { colour: pick(look, paint), decor: true });
    faceBox(sink, 'structureWood', sign, 0, H + 0.42, 0.055, bw - 1.4, 0.1, 0.02, { colour: pick(look, paint), decor: true });
  }
  sink.span('structureWood', -W / 2, H + 0.32, -D / 2 - 0.05, W / 2, H + 0.42, -D / 2 + 0.6, { colour: rgb(0x6e6450), decor: true, shadow: true });
  // the sign boards' posts
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + (k + 0.5) * bw;
    for (const s of [-1, 1]) sink.span('structureWood', x + s * (bw / 2 - 0.35) - 0.04, H, D / 2 - 0.12, x + s * (bw / 2 - 0.35) + 0.04, H + 0.85, D / 2 - 0.05, { colour: PLANK, decor: true });
  }
  });
  return sink.finish();
};

/**
 * The windmill over its stock tank (a water tower plot): a four-legged galvanised tower, the wheel of sails and the
 * tail vane at the top, the pump rod down the middle; the round stock tank brimming beside it and a storage tank.
 */
const windmill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the tower, the stock tank and the storage tank stand at three corners of the old tower's reach (its bounds)
  const bb = ctx.bounds, PX = bb.maxX - bb.minX, PZ = bb.maxZ - bb.minZ, cx = (bb.maxX + bb.minX) / 2, cz = (bb.maxZ + bb.minZ) / 2;
  const P = Math.max(3.6, Math.min(5.6, Math.min(PX, PZ) - 0.3));
  const base = Math.min(1.15, P * 0.24), H = 9.0 + ctx.rng() * 2.0, top = 0.32;
  const tx = cx - PX / 2 + base + 0.15, tz = cz - PZ / 2 + base + 0.15;
  const steel = GALV;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.member('structureMetal', [tx + sx * base, -0.4, tz + sz * base], [tx + sx * top, H, tz + sz * top], 0.09, 0.09, [sx, 0, 0], { colour: steel, exposed: true }, 0);
    // its concrete pad (dressing)
    sink.span('stone', tx + sx * base - 0.3, -0.3, tz + sz * base - 0.3, tx + sx * base + 0.3, 0.18, tz + sz * base + 0.3, { decor: true, shade: 0.8 });
  }
  // girts and braces (dressing)
  for (let y = 1.6; y < H - 0.5; y += 2.0) {
    const f = 1 - y / H, r = top + (base - top) * f;
    for (const [a, b] of [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]] as const) {
      sink.member('structureMetal', [tx + a[0], y, tz + a[1]], [tx + b[0], y, tz + b[1]], 0.04, 0.04, [0, 1, 0], { colour: steel, decor: true, exposed: true }, 0);
    }
  }
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
  const tr = Math.min(0.85, P * 0.16);
  const stx = cx - PX / 2 + tr + 0.15, stz = cz + PZ / 2 - tr - 0.15;
  sink.cylinder('structureMetal', [stx, -0.2, stz], 'y', 2.2, tr, 12, { colour: pick(look, [GALV, RUSTY, rgb(0x6e7f74)]) });
  sink.cylinder('structureMetal', [stx, 2.0, stz], 'y', 0.25, tr, 12, { colour: shade(GALV, 0.85), decor: true }, 0.1);
  // the pipe from the pump to the tanks
  sink.member('structureMetal', [tx, 0.5, tz], [sxp, 0.75, szp], 0.06, 0.06, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
  return sink.finish();
};

/**
 * The chapter's water tank (a minaret plot): a squat galvanised steel tank under a shallow cone roof on a trestle of
 * four straight steel legs, X-braced, the walkway round the tank's floor, a ladder up one leg; rust streaks down from
 * its seams. (Gauntlet wave 104: the first tank, tall and pale with a red band on tapering legs, read as a seaside
 * lighthouse; this one is wider than its legs and the colour of the iron.)
 */
const waterTank: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const b = ctx.bounds, P = Math.max(3.2, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) - 0.2);
  const legH = 7.2 + ctx.rng() * 1.2, tankR = Math.min(2.4, P / 2 + 0.55), tankH = 3.4;
  const steel = pick(look, [GALV, rgb(0x8f9390), rgb(0x9a9a92)]);
  const lb = P / 2 - 0.15, lt = lb * 0.92;
  sink.placed(0, (b.maxX + b.minX) / 2, 0, (b.maxZ + b.minZ) / 2, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', [sx * lb, -0.4, sz * lb], [sx * lt, legH, sz * lt], 0.2, 0.2, [sx, 0, 0], { colour: shade(steel, 0.78), exposed: true }, 0);
      // its concrete pier (dressing)
      sink.span('stone', sx * lb - 0.35, -0.3, sz * lb - 0.35, sx * lb + 0.35, 0.4, sz * lb + 0.35, { decor: true, shade: 0.8 });
    }
    groundCourse(sink, -lb, -lb, lb, lb, 0, false, 0.7);
    // the X braces between the legs, two bays to a face, and the girt at the bay line (dressing)
    const at = (y: number) => lb + (lt - lb) * y / legH;
    for (const [y0, y1] of [[0.3, legH * 0.5], [legH * 0.5, legH - 0.25]] as const) {
      const r0 = at(y0), r1 = at(y1);
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
        const out: Vec3 = [ax === bx ? ax : 0, 0, az === bz ? az : 0];
        sink.member('structureMetal', [ax * r0, y0, az * r0], [bx * r1, y1, bz * r1], 0.05, 0.05, out, { colour: shade(steel, 0.7), decor: true, exposed: true }, 0);
        sink.member('structureMetal', [bx * r0, y0, bz * r0], [ax * r1, y1, az * r1], 0.05, 0.05, out, { colour: shade(steel, 0.7), decor: true, exposed: true }, 0);
        sink.member('structureMetal', [ax * r1, y1, az * r1], [bx * r1, y1, bz * r1], 0.08, 0.08, [0, 1, 0], { colour: shade(steel, 0.75), decor: true, exposed: true }, 0);
      }
    }
    // the tank: its floor's ring beam, the shell, the seams and the rust run down from them, the shallow cone roof
    sink.cylinder('structureMetal', [0, legH, 0], 'y', 0.3, tankR * 0.82, 20, { colour: shade(steel, 0.72) }, tankR);
    sink.cylinder('structureMetal', [0, legH + 0.3, 0], 'y', tankH, tankR, 24, { colour: steel });
    for (let k = 1; k < 4; k++) sink.cylinder('structureMetal', [0, legH + 0.3 + tankH * k / 4, 0], 'y', 0.06, tankR + 0.015, 24, { colour: shade(steel, 0.82), decor: true }, tankR + 0.015, false);
    for (let k = 0; k < 5; k++) {
      const a = look() * Math.PI * 2, len = 0.8 + look() * 1.6, top = legH + 0.3 + tankH * (0.5 + look() * 0.5);
      const f: Face = { origin: [Math.cos(a) * (tankR + 0.012), 0, Math.sin(a) * (tankR + 0.012)], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 1 };
      faceBox(sink, 'structureMetal', f, 0, top - len / 2, 0.004, 0.12 + look() * 0.1, len, 0.004, { colour: shade(RUSTY, 0.9 + look() * 0.2), decor: true, fine: true });
    }
    sink.cylinder('structureMetal', [0, legH + 0.3 + tankH, 0], 'y', 0.6, tankR + 0.06, 24, { colour: shade(steel, 0.9) }, 0.3);
    sink.cylinder('structureMetal', [0, legH + 0.9 + tankH, 0], 'y', 0.35, 0.18, 8, { colour: shade(steel, 0.8), decor: true }, 0.12);
    // the walkway round the tank's floor and its rail
    sink.cylinder('structureMetal', [0, legH + 0.22, 0], 'y', 0.06, tankR + 0.6, 24, { colour: IRON, decor: true });
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      sink.member('structureMetal', [Math.cos(a) * (tankR + 0.55), legH + 0.28, Math.sin(a) * (tankR + 0.55)], [Math.cos(a) * (tankR + 0.55), legH + 1.2, Math.sin(a) * (tankR + 0.55)],
        0.03, 0.03, [Math.cos(a), 0, Math.sin(a)], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    }
    // the ladder up one leg to the walkway
    for (const dz of [-0.22, 0.22]) sink.member('structureMetal', [lb + 0.12, 0.0, dz], [lt + 0.12, legH + 0.25, dz], 0.04, 0.04, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

/**
 * The BIA day school (a factory plot): one long storey of rough-laid red sandstone on a footing under a low hipped
 * roof of galvanised or rusting iron, tall sash windows in a strict rhythm under stone lintels, a gabled porch over the
 * steps on the front end, a stovepipe flue at each end; the flagpole by the steps. (Titan round 3, gauntlet wave 119:
 * the two-storey block under a green hip with a bell cupola read as "a red-brick schoolhouse" from somewhere else; the
 * reservation's day schools of the 1930s-50s are long single storeys of local stone under tin.)
 */
const daySchool: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the school fills the old factory's reach (its bounds): its back wall on the back edge, its porch to the front
  const bb = ctx.bounds;
  const W = Math.max(9, bb.maxX - bb.minX - 1.0), D = Math.max(14, bb.maxZ - bb.minZ - 3.1);
  const trim = rgb(0xd8d2c4), door = pick(rng, [rgb(0x3d8a86), rgb(0x8a3a2c), rgb(0x3f6f99)]);
  const roofPaint = pick(rng, [GALV, rgb(0x8f9390), RUSTY]);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.7, y0: 0, h: 2.6 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.05, h: 1.9, sill: 0.9, spacing: 2.4, margin: 1.2 })) openings.push(o);
  for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 1.8, sill: 0.9, spacing: 2.6, margin: 1.2, max: 3, avoid: [[-1.2, 1.2]] })) openings.push(o);
  for (const o of windowRhythm('back', 0, W, { w: 1.0, h: 1.8, sill: 0.9, spacing: 2.6, margin: 1.2, max: 3 })) openings.push(o);
  const style: WindowStyle = { frame: trim, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: { bucket: 'stone', width: 0.16, out: 0.05, lintel: 0.28 },
    sill: { bucket: 'stone', out: 0.08 }, shutters: null };
  sink.placed(0, (bb.maxX + bb.minX) / 2, 0, bb.minZ + 0.45 + D / 2, () => {
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.55, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.9, wall: 'stone' }],
    roof: { kind: 'hip', pitchDeg: 22, eave: 0.55, verge: 0.55, thickness: 0.08, bucket: 'structureMetal', ridge: 'saddle' }, roofColour: roofPaint,
    gableBucket: 'stone', openings,
    chimneys: [],
    gutters: { colour: shade(roofPaint, 0.8) }, verge: null, reveal: 0.38, rafters: rgb(0x6a5a48),
  }, {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.55),
    door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.22, out: 0.08, arch: true },
      transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, fr.floors[o.storey] + o.y0),
  });
  frameCourse(sink, frame, 0.62);
  // the porch on the front end: two posts, a gabled roof over the steps, its gable boarded white
  const pd = 2.4, pw = 3.6, py = 3.5;
  for (const s of [-1, 1]) sink.span('structureWood', s * (pw / 2 - 0.15) - 0.13, 0.0, D / 2 + pd - 0.3, s * (pw / 2 - 0.15) + 0.13, py, D / 2 + pd - 0.04, { colour: trim });
  const pr: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.2, verge: 0.15, thickness: 0.08, bucket: 'structureMetal', ridge: null };
  sink.placed(Math.PI / 2, 0, 0, D / 2 + pd / 2, () => emitRoof(sink, roofGeometry(pd + 0.1, pw, py, pr), pr, roofPaint));
  {
    const rise = (pw / 2) * Math.tan(30 * Math.PI / 180);
    sink.prism('structureWood', [[0, py + rise, D / 2 + pd - 0.05], [pw / 2, py, D / 2 + pd - 0.05], [-pw / 2, py, D / 2 + pd - 0.05]], [0, 0, -1], 0.08, { colour: trim, decor: true });
  }
  // the stovepipe flues through the tin at each end of the classrooms
  for (const end of [-1, 1]) {
    const fx = W * 0.22 * end, fz = D * 0.3 * end;
    const top = frame.roof.topAt(fx, fz) ?? frame.roof.ridgeTopY;
    sink.cylinder('structureMetal', [fx, top - 0.3, fz], 'y', 1.5, 0.1, 8, { colour: STOVEPIPE, decor: true });
    sink.cylinder('structureMetal', [fx, top + 1.2, fz], 'y', 0.14, 0.2, 8, { colour: STOVEPIPE, decor: true }, 0.04);
  }
  // the flagpole by the steps
  sink.cylinder('structureMetal', [pw / 2 + 1.0, 0, D / 2 + pd + 0.6], 'y', 9.5, 0.06, 8, { colour: rgb(0xd8d8d4), decor: true }, 0.035);
  });
  return sink.finish();
};

/**
 * The trading post's wool and hay barn (a warehouse plot): a dry-laid sandstone base, walls of corrugated iron over it,
 * a low gable of the same, big plank sliding doors on the gable ends, a loading dock in front, small windows high up.
 */
const woolBarn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the barn fills the old warehouse's reach (its measured bounds, dock and canopy included): a shorter barn opened a
  // tank-wide gap to its neighbour that the bots drove through (Titan's pacing: three of four matches over by 160 s)
  const b = ctx.bounds;
  const W = Math.max(10, Math.min(17, b.maxX - b.minX - 0.3)), D = Math.max(16, Math.min(28, b.maxZ - b.minZ - 1.2));
  const xc = (b.maxX + b.minX) / 2, zc = b.minZ + 0.15 + D / 2;
  const baseH = 1.5 + rng() * 0.4, H = 4.8 + rng() * 0.6;
  sink.placed(0, xc, 0, zc, () => {
    sink.span('stone', -W / 2 - 0.06, -0.5, -D / 2 - 0.06, W / 2 + 0.06, baseH, D / 2 + 0.06);
    groundCourse(sink, -W / 2, -D / 2, W / 2, D / 2, 0, false, 0.9);
    // the walls of corrugated iron over the stone (structureMetal's profiled sheet: a roof covering is never a wall a
    // hull stops at, structureCollision.ts ROOF_BUCKETS), with their gable ends
    const tin = { colour: pick(rng, CLADDING) };
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, -W / 2 + 0.08, D / 2], [W / 2 - 0.08, -D / 2, W / 2, D / 2], [-W / 2, -D / 2, W / 2, -D / 2 + 0.08], [-W / 2, D / 2 - 0.08, W / 2, D / 2]] as const) {
      sink.span('structureMetal', x0, baseH, z0, x1, H, z1, tin);
    }
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 17, eave: 0.45, verge: 0.35, thickness: 0.07, bucket: 'roof', ridge: 'saddle' };
    const rg = roofGeometry(W, D, H, roof);
    emitRoof(sink, rg, roof);
    if (rg.gable) for (const z of [D / 2, -D / 2]) {
      const pts: Vec3[] = rg.gable.map(([u, y]) => [u, y, z] as Vec3);
      sink.prism('structureMetal', z > 0 ? [...pts].reverse() : pts, [0, 0, z > 0 ? -1 : 1], 0.08, tin);
    }
    // the sliding doors on both gable ends, the dock in front of the main one
    for (const [z, out] of [[D / 2, 1], [-D / 2, -1]] as const) {
      const f: Face = { origin: [0, 0, z], u: [out, 0, 0], out: [0, 0, out], width: W };
      plankGate(sink, f, 0, 0.0, Math.min(4.2, W * 0.36), 3.6, shade(PLANK_GREY, 0.95 + look() * 0.1), { width: 0.2, out: 0.08, colour: JUNIPER_DARK });
      faceBox(sink, 'structureMetal', f, 0, 3.75, 0.12, Math.min(4.2, W * 0.36) * 2 + 0.4, 0.12, 0.12, { colour: IRON, decor: true });
    }
    sink.span('stone', -3.0, -0.4, D / 2 - 0.05, 3.0, 1.0, D / 2 + 0.9);
    // high windows down the sides
    for (const side of [-1, 1]) {
      const f: Face = { origin: [side * W / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D };
      for (let u = -D / 2 + 2.5; u < D / 2 - 1.5; u += 4.2) faceBox(sink, 'glass', f, u, H - 1.0, 0.012, 1.2, 0.6, 0.02, { decor: true });
    }
    // bales stacked against the north side
    if (ctx.tier !== 'mobile') {
      for (let k = 0; k < 6; k++) {
        const x = -W / 2 - 0.6, z = -D / 2 + 1.5 + k * 1.1;
        for (let r = 0; r < (k % 3 === 0 ? 3 : 2); r++) sink.span('straw', x - 0.45, r * 0.45, z - 0.5, x + 0.45, r * 0.45 + 0.45, z + 0.5, { decor: true });
      }
    }
  });
  return sink.finish();
};

/**
 * The equipment shed (a depot plot): a pole frame of juniper clad in corrugated iron on three sides, open to the front
 * between its posts, a shed roof falling to the back, a lean-to off the front for the trucks.
 */
const equipmentShed: RegionalBuilder = (ctx) => {
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
  }
  const n = Math.max(3, Math.round(D / 3.6));
  for (let k = 0; k <= n; k++) {
    const z = -D / 2 + 0.15 + (D - 0.3) * k / n;
    pole(sink, [x0 + W - 0.15, 0.15, z], [x0 + W - 0.15, H, z], 0.11, pick(look, JUNIPER), false);
  }
  sink.placed(Math.PI, x0 + W / 2, 0, 0, () => emitRoof(sink, roofGeometry(W, D, H, roof), roof));
  // the lean-to off the front for the trucks: posts and a low tin roof
  if (lw > 1.2) {
    for (let k = 0; k <= n; k += 2) {
      const z = -D / 2 + 0.3 + (D - 0.6) * k / n;
      pole(sink, [x0 + W + lw - 0.12, 0.0, z], [x0 + W + lw - 0.12, H - 0.9, z], 0.09, pick(look, JUNIPER), false);
    }
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 8, eave: 0.12, verge: 0.2, thickness: 0.06, bucket: 'roof' };
    sink.placed(Math.PI, x0 + W + lw / 2, 0, 0, () => emitRoof(sink, roofGeometry(lw, D, H - 1.05, lean), lean));
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
const trailer: RegionalBuilder = (ctx) => {
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
    sink.span('structureMetal', -L / 2, floor, -T / 2, L / 2, top, T / 2, { colour: skin });
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
    for (const side of [-1, 1]) {
      const f: Face = { origin: [0, 0, side * T / 2], u: [side, 0, 0], out: [0, 0, side], width: L };
      faceBox(sink, 'structureMetal', f, 0, floor + 1.15, 0.012, L, 0.22, 0.02, { colour: stripe, decor: true });
      faceBox(sink, 'structureMetal', f, 0, top - 0.25, 0.012, L, 0.08, 0.02, { colour: shade(stripe, 0.85), decor: true });
      const nWin = Math.max(2, Math.floor(L / 3.4));
      for (let k = 0; k < nWin; k++) {
        const u = -L / 2 + (k + 0.5) * L / nWin + (side > 0 && k === 1 ? 1.0 : 0);
        if (side > 0 && Math.abs(u - L * 0.18) < 1.2) continue;
        faceBox(sink, 'glass', f, u, floor + 1.45, 0.012, 1.1, 0.85, 0.02, { decor: true });
        faceBox(sink, 'structureMetal', f, u, floor + 1.45, 0.025, 1.2, 0.95, 0.015, { colour: rgb(0xb8bcbc), decor: true, fine: true }, { back: true });
        faceBox(sink, 'structureMetal', f, u, floor + 1.45, 0.034, 0.04, 0.85, 0.01, { colour: rgb(0xb8bcbc), decor: true, fine: true });
      }
    }
    // the door and the porch on the front (+z) side: a deck on a single-wide's deep lot, a stoop on a double-wide's
    const f: Face = { origin: [0, 0, T / 2], u: [1, 0, 0], out: [0, 0, 1], width: L };
    const du = L * 0.18;
    faceBox(sink, 'structureMetal', f, du, floor + 1.0, 0.015, 0.85, 1.95, 0.03, { colour: shade(skin, 0.92), decor: true });
    faceBox(sink, 'glass', f, du, floor + 1.55, 0.032, 0.4, 0.4, 0.01, { decor: true, fine: true });
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

/** The hay shed (a gantry plot): a long pole barn of juniper posts under a low tin gable, bales stacked under it. */
const hayShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the shed fills the old gantry's reach (its bounds, which stand off the plot's centre)
  const bb = ctx.bounds;
  const L = Math.max(12, bb.maxX - bb.minX - 0.8), Dd = Math.max(4.0, bb.maxZ - bb.minZ - 0.6), H = 4.3;
  const n = Math.max(4, Math.round(L / 3.3));
  sink.placed(0, (bb.maxX + bb.minX) / 2, 0, (bb.maxZ + bb.minZ) / 2, () => {
  // the ground under the shed worn bare and dark (dressing)
  groundCourse(sink, -L / 2, -Dd / 2, L / 2, Dd / 2, 0, false, 0.5);
  for (let k = 0; k <= n; k++) {
    const x = -L / 2 + 0.15 + (L - 0.3) * k / n;
    for (const z of [-Dd / 2 + 0.15, Dd / 2 - 0.15]) pole(sink, [x, -0.3, z], [x + (look() - 0.5) * 0.08, H, z], 0.12, pick(look, JUNIPER), false);
  }
  for (const z of [-Dd / 2 + 0.15, Dd / 2 - 0.15]) sink.span('structureWood', -L / 2, H - 0.25, z - 0.1, L / 2, H, z + 0.1, { colour: JUNIPER_DARK });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 12, eave: 0.45, verge: 0.4, thickness: 0.07, bucket: 'roof', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(Dd, L, H, roof), roof));
  // the bales: stacks two to five high in most bays (one solid stack each: structure, the same on every tier)
  for (let k = 0; k < n; k++) {
    if (ctx.rng() < 0.25) continue;
    const x0 = -L / 2 + 0.4 + (L - 0.3) * k / n, h = 2 + Math.floor(ctx.rng() * 4), x1 = x0 + Math.min(2.6, (L - 0.8) / n - 0.3);
    sink.span('straw', x0, 0, -0.9, x1, h * 0.46, 1.2);
    // the courses' joints and a loose bale on top (dressing)
    sink.dressing(ctx.tier === 'mobile', () => {
      for (let r = 1; r < h; r++) sink.span('straw', x0 - 0.02, r * 0.46 - 0.015, -0.92, x1 + 0.02, r * 0.46 + 0.015, 1.22, { decor: true });
      if (look() < 0.5) sink.span('straw', x0 + 0.3, h * 0.46, -0.4, x0 + 1.3, h * 0.46 + 0.46, 0.5, { decor: true });
    });
  }
  });
  return sink.finish();
};

/**
 * An abandoned camp (a ruin plot): either a roofless stone house, its walls broken down to the window sills in places,
 * a fallen lintel and a doorway, or a hogan whose roof has fallen in.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the ruin fills the old ruin's reach (its bounds)
  const bb = ctx.bounds, cx = (bb.maxX + bb.minX) / 2, cz = (bb.maxZ + bb.minZ) / 2;
  const W = Math.max(5.0, bb.maxX - bb.minX - 0.6), D = Math.max(6.0, bb.maxZ - bb.minZ - 0.6);
  if (rng() < 0.4) {
    // the fallen hogan, the logs of its roof stacked in cords at the plot's ends
    const R = Math.max(2.4, Math.min(3.45, Math.min(W, D) / (2 * Math.cos(OCT / 2)) - 0.12));
    const door = eastSide(ctx.yaw);
    sink.placed(0, cx, 0, cz, () => hoganBody(sink, rng, look, { r: R, door, fallen: true }));
    endStacks(sink, bb, cz, R, door, look, 0.95);
    return sink.finish();
  }
  sink.placed(0, cx, 0, cz, () => {
  const t = 0.42, H = 2.6;
  sink.span('stone', -W / 2 - 0.05, -0.5, -D / 2 - 0.05, W / 2 + 0.05, 0.25, D / 2 + 0.05);
  groundCourse(sink, -W / 2, -D / 2, W / 2, D / 2, 0, false, 0.6);
  const runs: Array<[number, number, number, number, 'x' | 'z']> = [[-W / 2, -D / 2, W / 2, -D / 2 + t, 'x'], [-W / 2, D / 2 - t, W / 2, D / 2, 'x'],
    [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t, 'z'], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t, 'z']];
  runs.forEach(([x0, z0, x1, z1, axis], i) => {
    const len = axis === 'x' ? x1 - x0 : z1 - z0, pieces = Math.max(3, Math.round(len / 1.4));
    for (let k = 0; k < pieces; k++) {
      // the doorway in the front wall, and the broken tops falling toward the corners' standing piers
      if (i === 1 && k === Math.floor(pieces / 2)) continue;
      const a = k / pieces, b = (k + 1) / pieces;
      const corner = k === 0 || k === pieces - 1;
      const top = corner ? H * (0.8 + rng() * 0.25) : 0.6 + rng() * (H - 0.4);
      if (axis === 'x') sink.span('stone', x0 + len * a, 0.25, z0, x0 + len * b, top, z1);
      else sink.span('stone', x0, 0.25, z0 + len * a, x1, top, z0 + len * b);
    }
  });
  // the fallen roof: two vigas across the floor, a heap of the mud roof's earth, the lintel log
  for (let k = 0; k < 2; k++) {
    const z = (k - 0.5) * D * 0.4;
    sink.member('structureWood', [-W / 2 + 0.3, 0.3, z + (rng() - 0.5)], [W / 2 - 0.2, 0.3 + rng() * 1.4, z + (rng() - 0.5) * 1.5], 0.22, 0.22, [0, 1, 0],
      { colour: pick(look, JUNIPER), decor: true, exposed: true }, 0);
  }
  sink.cylinder('plaster2', [W * 0.1, 0.1, -D * 0.1], 'y', 0.55, Math.min(W, D) * 0.3, 7, { decor: true }, Math.min(W, D) * 0.12, true, look());
  });
  return sink.finish();
};

export const NAVAJO_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: hogan,
  compound: camp,
  caravanserai: tradingPost,
  compoundSouk: generalStore,
  marketRow: roadsideStands,
  watertower: windmill,
  minaret: waterTank,
  factory: daySchool,
  warehouse: woolBarn,
  depot: equipmentShed,
  containerRow: trailer,
  gantry: hayShed,
  ruin,
  // the yard's outbuilding by each hogan
  ramada,
  // a ranch house wherever a plan names a cottage
  cottage: ranchIn,
});

export const NAVAJO_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'navajo',
  region: 'Monument Valley, Four Corners (the Navajo Nation round Oljato and Goulding\'s): log-and-earth hogans facing east, a sandstone trading post, stone ranch houses under tin, juniper corrals and windmills',
  surfaces: {
    // corrugated iron, galvanised and rusting; the valley's red de Chelly sandstone laid as field stone in mud
    // (Titan round 3, gauntlet wave 119: the coursed sandstone's even blocks read as red brick, "a red-brick
    // schoolhouse", "oversized tiled block textures": Goulding's and the valley's stone houses are rough-laid field
    // stone; round 3b: the rubble kind's pale joints still drew a brick grid at range, so big blocks in red mud mortar)
    roof: { kind: 'sheet', tint: [0.66, 0.66, 0.63] },
    stone: { kind: 'fieldstone', tint: [0.72, 0.47, 0.35] },
    sourced: { plaster: false, wood: true },
    tones: {
      // stucco the colour of the sand, the red earth of the hogan roofs and the mud chinking, a white-painted trim
      plaster: (_h, s, l) => [0.075, Math.min(1, s * 0.9 + 0.2), Math.min(1, l * 1.02 + 0.1)],
      plaster2: (_h, s, l) => [0.045, Math.min(1, s * 1.1 + 0.34), Math.min(1, l * 0.86 + 0.05)],
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.3), Math.min(1, l * 1.25 + 0.12)],
    },
  },
  builders: NAVAJO_BUILDERS,
  // the desert's dry air: little splash or damp at the wall foot, no moss; the red earth and the stucco a shade apart
  weather: {
    plaster: [[1, 1, 1], [1.04, 1.0, 0.95], [0.95, 0.92, 0.87], [1.02, 0.98, 0.94]],
    stone: [[1, 1, 1], [0.94, 0.9, 0.87], [1.05, 1.0, 0.95], [0.9, 0.87, 0.85]],
    roof: [[1, 1, 1], [0.9, 0.84, 0.78], [1.04, 1.0, 0.96], [0.84, 0.78, 0.72]],
    damp: 0.4, moss: 0.03,
  },
  wear: 0.15,
  // the hogans' yards: a brush corral round the camp's ground, a gate, the shade house in a corner
  yard: { kinds: ['adobe'], fence: 'fencewattle', gate: 'gate', shed: 'ramada', shedSize: [4.0, 3.2], garden: false },
});
