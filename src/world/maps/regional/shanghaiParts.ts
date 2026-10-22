// src/world/maps/regional/shanghaiParts.ts — the Shanghai kit's (shanghai.ts, shanghaiLanes.ts, shanghaiBund.ts) shared
// parts: the lot's fill and a street row's, the creek's banks, the paints and window styles, the street rows' raised
// ridges and their stepped party walls, a segmental arch's outline, the war's marks on a wall (shell pocks, a shell's
// breach, soot, a roof fallen in), the shop signboards, the sandbags at a door.
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import type { RoofSpec } from './house.ts';
import type { WindowStyle } from './openings.ts';
import type { RegionalBuildContext } from './types.ts';

export function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The lot a building fills: the base's measured reach (ctx.bounds) inset by `inset`, its street edge held to `front`. */
export interface Fill { w: number; d: number; cx: number; cz: number }
export function fillOf(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, inset = 0.1, front = Infinity): Fill {
  const x0 = bounds.minX + inset, x1 = bounds.maxX - inset, z0 = bounds.minZ + inset, z1 = Math.min(bounds.maxZ, front) - inset;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

export const clampTo = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const choose = <T>(r: number, list: readonly T[]): T => list[Math.min(list.length - 1, Math.max(0, Math.floor(r * list.length)))];
export const DEG = Math.PI / 180;

/**
 * A street-row building's footprint: the base geometry's bounds (the row's houses meet and the gaps between them stay
 * the base's), its street front no further out than the plot's (the base's steps and porches reach past it), and its
 * sides no further out than the plot's width (the buildings stream, 2026-10-13, the weird-buildings survey: the base's
 * eaves, downpipes and side dressing reach 0.5-1.5 m past its walls, so a house filling them stood 1-2 m into each
 * neighbour of a row laid wall to wall, its walls through theirs and the roofs crossed).
 */
export const rowFill = (ctx: RegionalBuildContext): Fill => {
  const half = ctx.info.w / 2 - 0.15;
  return fillOf({ ...ctx.bounds, minX: Math.max(ctx.bounds.minX, -half), maxX: Math.min(ctx.bounds.maxX, half) }, 0.05, ctx.info.d / 2 - 0.1);
};

/** A segmental arch's outline on a face (convex, counter-clockwise seen from outside): base from u - r to u + r at y. */
export function archOutline(face: Face, u: number, y: number, r: number, rise: number, o = 0, n = 8): Vec3[] {
  const pts: Vec3[] = [facePoint(face, u - r, y, o), facePoint(face, u + r, y, o)];
  for (let k = 1; k < n; k++) {
    const a = (k / n) * Math.PI;
    pts.push(facePoint(face, u + Math.cos(a) * r, y + Math.sin(a) * rise, o));
  }
  return pts;
}

/**
 * A roof fallen in where the fire took it: the dark hole on the front slope and the charred rafters across it.
 * Dressing over the roof slab (the slab keeps the building's collision).
 */
export function roofHole(sink: PartSink, ridgeTopY: number, zc: number, s: number, roof: RoofSpec, u: number, look: () => number): void {
  const tanP = Math.tan(roof.pitchDeg * DEG), w = 1.6 + look() * 1.4;
  const a0 = s * 0.12, a1 = s * 0.82;
  const y0 = ridgeTopY - a0 * tanP + 0.02, y1 = ridgeTopY - a1 * tanP + 0.02;
  sink.quad('dark', [u - w / 2, y1, zc + a1], [u + w / 2, y1, zc + a1], [u + w / 2, y0, zc + a0], [u - w / 2, y0, zc + a0], { decor: true });
  for (let k = 0; k < 3; k++) {
    const x = u - w / 2 + (k + 0.5) * w / 3;
    // (looks 227, the contact audit: the rafters lay 2 cm over the slab, both ends free) bedded on it
    sink.member('structureWood', [x, y0 + 0.02, zc + a0], [x + (look() - 0.5) * 0.3, y1 + 0.02, zc + a1], 0.1, 0.1, [0, 1, 0], { colour: CHAR, decor: true, exposed: true }, 0);
  }
}


/**
 * Suzhou Creek's line across the district (blackglass.ts CREEK_STATIONS, coarsened): the kit reads a building's bank
 * from it, a look choice only (types.ts RegionalBuildContext). +z of the creek is Zhabei, the Chinese district north of
 * the creek, shelled and burnt in the autumn of 1937; the other bank is the International Settlement.
 */
const CREEK_LINE: ReadonlyArray<readonly [number, number]> = [[-512, -40], [-265, -16], [-213, -10], [-165, 10], [-130, 34],
  [-100, 70], [-65, 100], [-20, 105], [25, 104], [70, 100], [165, 95], [512, 90]];
export type Bank = 'zhabei' | 'settlement';
/** The building's bank of the creek, or null without a place (the receipts' unposed builds). */
export function bankOf(ctx: RegionalBuildContext): Bank | null {
  if (ctx.x === undefined || ctx.z === undefined) return null;
  let best = Infinity, side = 0;
  for (let i = 0; i + 1 < CREEK_LINE.length; i++) {
    const [ax, az] = CREEK_LINE[i], [bx, bz] = CREEK_LINE[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = clampTo(((ctx.x - ax) * dx + (ctx.z - az) * dz) / len2, 0, 1);
    const d = Math.hypot(ctx.x - ax - t * dx, ctx.z - az - t * dz);
    if (d < best) { best = d; side = dx * (ctx.z - az) - dz * (ctx.x - ax); }
  }
  return side > 0 ? 'zhabei' : 'settlement';
}

/** Black lacquer of a shikumen's gate leaves, the teak of the shopfronts and window frames, the temples' red, gilt. */
export const LACQUER = rgb(0x1f1b19), TEAK = rgb(0x5a3b28), CHINA_RED = rgb(0x8c2b22), GILT = rgb(0xb08a3c);
/** The Bund's copper gone green, dark bronze window frames, the sandbags' hessian, charred timber, wrought iron. */
export const COPPER_GREEN = rgb(0x4e7b69), BRONZE = rgb(0x3a3430), HESSIAN = rgb(0x9a8a6a), CHAR = rgb(0x1a1716), IRON = rgb(0x2b2c2c);
/** The red brick of the Settlement's later lanes, laid in bands through the grey brick. */
export const RED_BRICK = rgb(0x8a4434), TILE_COPING = rgb(0x3a3936), WHITE_TRIM = rgb(0xe2ddd0);
/** The shop signs' boards: lacquer red, black, dark green, brown, each lettered in gilt (a strip). */
export const SIGN_BOARDS: readonly Rgb[] = [0x7f2420, 0x1d1c1b, 0x23402f, 0x5a2f1e].map(rgb);
/** Canvas of the shop awnings and the paper of the lanterns. */
export const AWNINGS: readonly Rgb[] = [0x5f6b55, 0x8a5a3a, 0x4d5560, 0x9a8f78].map(rgb);

/** A shikumen's or shophouse's casement: teak frame, small panes, a brick sill. */
export const CASEMENT: WindowStyle = {
  frame: TEAK, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.08 }, shutters: null,
};
/** The Settlement's sash windows: white frames in a stucco surround. */
export const SASH: WindowStyle = {
  frame: rgb(0xe4e0d4), frameWidth: 0.07, frameOut: 0.05, bars: 'cross',
  surround: { bucket: 'plaster', width: 0.14, out: 0.05, lintel: 0.24 }, sill: { bucket: 'plaster', out: 0.1 }, shutters: null,
};
/** The Bund's tall windows: dark bronze frames in granite surrounds. */
export const BUND_WINDOW: WindowStyle = {
  frame: BRONZE, frameWidth: 0.07, frameOut: 0.05, bars: 'cross',
  surround: { bucket: 'plaster3', width: 0.18, out: 0.07, lintel: 0.32 }, sill: { bucket: 'plaster3', out: 0.12 }, shutters: null,
};
/** A godown's window: an iron frame behind iron shutters, most of them shut. */
export const GODOWN_WINDOW: WindowStyle = {
  frame: IRON, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster3', out: 0.08 },
  shutters: { colour: rgb(0x2f3a33), kind: 'plank', closed: 0.55 },
};

/** The faces of a convex plan (counter-clockwise seen from above): one wall face per edge. */
export function planFaces(points: ReadonlyArray<readonly [number, number]>): Face[] {
  const out: Face[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const u: Vec3 = [(bx - ax) / len, 0, (bz - az) / len];
    out.push({ origin: [(ax + bx) / 2, 0, (az + bz) / 2], u, out: [-u[2], 0, u[0]], width: len });
  }
  return out;
}

/** A plan prism from y0 to y1 (points counter-clockwise seen from above). */
export function planPrism(sink: PartSink, bucket: RegionalBucket, points: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, opts: EmitOptions = {}): void {
  if (y1 - y0 < 1e-3) return;
  sink.prism(bucket, points.map(([x, z]): Vec3 => [x, y0, z]), [0, 1, 0], y1 - y0, opts);
}

/** A rectangle's plan, counter-clockwise seen from above (front edge first: planFaces gives front, right, back, left). */
export const rect = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];

/** A square pyramid (a tower's cap): its base square of half size h at y0, its apex at y1. Convex, so one solid. */
export function pyramid(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, opts: EmitOptions = {}): void {
  const a: Vec3 = [cx - hx, y0, cz + hz], b: Vec3 = [cx + hx, y0, cz + hz], c: Vec3 = [cx + hx, y0, cz - hz], d: Vec3 = [cx - hx, y0, cz - hz];
  const apex: Vec3 = [cx, y1, cz];
  for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]] as const) sink.polygon(bucket, [p, q, apex], opts);
  sink.polygon(bucket, [d, c, b, a], opts);
}

/**
 * The raised ridge of a Jiangnan roof: a stack of tiles along the ridge from x0 to x1 at height y over z, its ends
 * curled up (the shophouses' modest version of the temples' swallow-tail ridges). Dressing that casts a shadow.
 */
export function raisedRidge(sink: PartSink, x0: number, x1: number, y: number, z: number, curl: number): void {
  const opts = { decor: true, shadow: true };
  sink.span('roof', x0, y - 0.08, z - 0.17, x1, y + 0.26, z + 0.17, opts);
  if (curl <= 0) return;
  const b = y + 0.26, zz = z - 0.12;
  for (const end of [-1, 1]) {
    const xe = end < 0 ? x0 : x1, xi = xe - end * 0.9;
    // the curl: a wedge rising from the ridge to the tip, swept past the ridge's end (counter-clockwise seen from +z)
    const pts: Vec3[] = end > 0
      ? [[xi, b, zz], [xe - 0.2, b, zz], [xe + 0.25, b + curl * 0.6, zz], [xe + 0.25, b + curl, zz]]
      : [[xe - 0.25, b + curl, zz], [xe - 0.25, b + curl * 0.6, zz], [xe + 0.2, b, zz], [xi, b, zz]];
    sink.prism('roof', pts, [0, 0, 1], 0.24, opts);
  }
}

/**
 * A party wall carried up past the roof in steps — the "horse-head" fire wall of the Jiangnan towns and the older
 * Shanghai lanes — each step capped with dark tiles, its end tipped up. The wall stands in the plane x = px, `side` the
 * way its outer face looks (+1: +x, so the wall lies on px - t .. px); it spans the roof from zc - S to zc + S, and
 * `top(a)` is the roof's top surface a metres across from the ridge. Dressing that casts its shadow.
 */
export function horseHeadWall(sink: PartSink, bucket: RegionalBucket, px: number, side: 1 | -1, zc: number, S: number, eaveY: number,
  top: (a: number) => number, over = 0.45): void {
  const t = 0.24, x0 = side > 0 ? px - t : px, x1 = side > 0 ? px : px + t;
  const opts = { decor: true, shadow: true }, cap = { decor: true, shadow: true, colour: TILE_COPING };
  const tiers: Array<readonly [number, number]> = [[0, S * 0.32], [S * 0.32, S * 0.66], [S * 0.66, S]];
  tiers.forEach(([a0, a1], i) => {
    const y1 = top(a0) + over;
    const spans: Array<readonly [number, number]> = i === 0 ? [[zc - a1, zc + a1]] : [[zc - a1, zc - a0], [zc + a0, zc + a1]];
    for (const [za, zb] of spans) {
      sink.span(bucket, x0, eaveY, za, x1, y1, zb, opts);
      sink.span('structureMetal', x0 - 0.08, y1, za - 0.05, x1 + 0.08, y1 + 0.12, zb + 0.05, cap);
      // the step's outer end tipped up (the "horse's head")
      if (i > 0) {
        const outer = za < zc ? za : zb, dir = za < zc ? -1 : 1;
        sink.span('structureMetal', x0 - 0.08, y1 + 0.12, Math.min(outer, outer - dir * 0.42), x1 + 0.08, y1 + 0.32, Math.max(outer, outer - dir * 0.42), cap);
      }
    }
  });
}

/**
 * Shell pocks across a wall: small dark craters with a pale spalled rim, kept off the `keep` rectangles (the openings).
 * Decor; `count` of them in (u0..u1, y0..y1).
 */
export function pocks(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, count: number, look: () => number,
  keep: ReadonlyArray<{ u0: number; u1: number; y0: number; y1: number }> = [], rim: RegionalBucket = 'plaster3'): void {
  if (u1 - u0 < 0.3 || y1 - y0 < 0.3) return;
  for (let k = 0; k < count; k++) {
    const u = u0 + look() * (u1 - u0), y = y0 + look() * (y1 - y0), r = 0.08 + look() * 0.16;
    if (keep.some((q) => u > q.u0 - r && u < q.u1 + r && y > q.y0 - r && y < q.y1 + r)) continue;
    const pts: Vec3[] = [];
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2, rr = r * (0.7 + look() * 0.5);
      pts.push(facePoint(face, u + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.012));
    }
    // (props census #7, lane B 2026-10-14: a pock is the facing knocked off and the brick bruised under it, not a hole:
    // the brick a shade darker than the facing, never the dark of a room)
    sink.polygon(rim, pts, { decor: true, shade: 0.7 });
    if (look() < 0.5) faceBox(sink, rim, face, u + r * 0.2, y - r * 0.9, 0.01, r * 1.6, r * 0.5, 0.02, { decor: true, fine: true });
  }
}

/** A shell's breach in a wall: a ragged dark hole, its broken bricks spilled at the wall foot. (u, y) its centre. */
export function breach(sink: PartSink, face: Face, u: number, y: number, r: number, look: () => number): void {
  const pts: Vec3[] = [];
  for (let j = 0; j < 9; j++) {
    const a = (j / 9) * Math.PI * 2, rr = r * (0.65 + look() * 0.6);
    pts.push(facePoint(face, u + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85, 0.02));
  }
  sink.polygon('dark', pts, { decor: true });
  for (let k = 0; k < 4; k++) {
    const s = 0.18 + look() * 0.22;
    faceBox(sink, 'stone', face, u + (look() - 0.5) * r * 2, s / 2, 0.3 + look() * 0.8, s * 1.4, s, s * 1.2, { decor: true });
  }
}

/** Soot up a wall from a burnt opening: a darkened band (decor) from y0 to y1 over (u0..u1). */
export function soot(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number): void {
  if (y1 - y0 < 0.2 || u1 - u0 < 0.2) return;
  facePanel(sink, 'structureMetal', face, (u0 + u1) / 2, (y0 + y1) / 2, 0.008, u1 - u0, y1 - y0, { decor: true, colour: CHAR });
}

/**
 * A vertical shop signboard hung off a facade: the board (`colour`), its gilt lettering strip down both faces, the iron
 * bracket. (u, y) is the board's top centre; it hangs `out` metres off the wall, edge-on to the facade so the street
 * reads it end to end.
 */
export function signboard(sink: PartSink, face: Face, u: number, y: number, h: number, colour: Rgb, out = 0.75): void {
  faceBox(sink, 'structureWood', face, u, y - h / 2, out, 0.07, h, 0.6, { colour, decor: true });
  faceBox(sink, 'structureWood', face, u, y - h / 2, out, 0.09, h * 0.8, 0.16, { colour: GILT, decor: true, fine: true });
  faceBox(sink, 'structureMetal', face, u, y + 0.04, out / 2, 0.05, 0.05, out, { colour: IRON, decor: true, fine: true });
}

/** A horizontal name board over a shopfront: lacquer with a gilt lettering strip. (u, y) its centre. */
export function nameBoard(sink: PartSink, face: Face, u: number, y: number, w: number, colour: Rgb): void {
  if (w < 0.6) return;
  faceBox(sink, 'structureWood', face, u, y, 0.05, w, 0.52, 0.06, { colour, decor: true, fineSides: true });
  faceBox(sink, 'structureWood', face, u, y, 0.09, w * 0.72, 0.26, 0.02, { colour: GILT, decor: true, fine: true });
}

/** A paper lantern hung under an eave (decor): a red drum on a cord. (u, y) its top. */
export function lantern(sink: PartSink, face: Face, u: number, y: number, out = 0.5): void {
  const p = facePoint(face, u, y - 0.62, out);
  sink.cylinder('structureWood', p, 'y', 0.46, 0.17, 6, { colour: CHINA_RED, decor: true }, 0.17);
  faceBox(sink, 'structureMetal', face, u, y - 0.08, out, 0.02, 0.16, 0.02, { colour: IRON, decor: true, fine: true });
}

/** Sandbags stacked across a doorway's foot (or a window's): courses of bags, `w` wide, `h` high, standing off the face. */
export function sandbags(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number): void {
  const rows = Math.max(1, Math.round(h / 0.21)), per = Math.max(1, Math.round(w / 0.62));
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < per; k++) {
      const bu = u - w / 2 + (k + 0.5 + (r % 2) * 0.25) * (w / per);
      if (bu > u + w / 2 - 0.15) continue;
      // (the buildings stream, 2026-10-12, the integrity check: the stack stood 7 cm proud of the wall on nothing) the
      // bags packed against the wall
      faceBox(sink, 'structureWood', face, bu, y + 0.105 + r * 0.2, 0.27, w / per * 0.94, 0.19, 0.5,
        { colour: shade(HESSIAN, 0.86 + look() * 0.22), decor: true });
    }
  }
}

/** Brick bands through a wall (the red courses of the later lanes in their grey brick): thin strips at `ys`. */
export function brickBands(sink: PartSink, face: Face, u0: number, u1: number, ys: readonly number[], colour: Rgb): void {
  if (u1 - u0 < 0.3) return;
  for (const y of ys) faceBox(sink, 'structureMetal', face, (u0 + u1) / 2, y, 0.012, u1 - u0, 0.16, 0.025, { colour, decor: true, fine: true });
}

// ------------------------------------------------------------------------------------------------ the street's life (230)

/**
 * (the owner, 2026-10-21: "improve the shanghai buildings a ton") the stream the street's life draws from — the rows' end
 * walls, the painted advertisements, the rooftop hoardings, the bamboo poles — forked from the building's identity (the house grammar still draws from the building's own stream for each window, so a
 * row with new end windows reshuffles its later dressing). Tier-independent: the end walls' windows are structural.
 */
export function streetLifeRng(ctx: RegionalBuildContext): () => number {
  let a = 0x6a09e667;
  for (const ch of `${ctx.structureId}|${Math.round((ctx.x ?? 0) * 10)}|${Math.round((ctx.z ?? 0) * 10)}`) a = Math.imul(a ^ ch.charCodeAt(0), 0x5bd1e995) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A sign's characters in a cell `cell` square centred (cu, cy): two or three bars across, a stem down, now and then a short
 * hook — read from the street as brushed characters. `stroke(u0, u1, y0, y1)` lays each.
 */
export function glyph(cu: number, cy: number, cell: number, rng: () => number, stroke: (u0: number, u1: number, y0: number, y1: number) => void): void {
  const half = cell / 2, s = cell * 0.13, bars = 2 + (rng() < 0.5 ? 1 : 0);
  for (let j = 0; j < bars; j++) {
    const by = cy - half + (j + 0.5) * cell / bars + (rng() - 0.5) * s, bw = cell * (0.55 + rng() * 0.45);
    stroke(cu - bw / 2, cu + bw / 2, by - s / 2, by + s / 2);
  }
  const sx = cu + (rng() - 0.5) * cell * 0.5;
  stroke(sx - s / 2, sx + s / 2, cy - half, cy + half);
  if (rng() < 0.45) { const hx = cu + (rng() < 0.5 ? -1 : 1) * cell * 0.32; stroke(hx - s / 2, hx + s / 2, cy - half * 0.9, cy); }
}

/** The painted advertisements' grounds as paint on the limewash: a vermilion, a black, a cream, a dark green, an ochre. */
const AD_GROUNDS: readonly Rgb[] = [[0.98, 0.44, 0.36], [0.34, 0.33, 0.32], [1.12, 1.08, 0.94], [0.5, 0.66, 0.58], [1.1, 0.86, 0.52]];
const AD_INK_LIGHT: Rgb = [1.16, 1.13, 1.02], AD_INK_DARK: Rgb = [0.26, 0.25, 0.24], AD_INK_RED: Rgb = [0.92, 0.36, 0.3];

/**
 * A painted advertisement on a blank wall (the cigarette, soap and medicine signs painted across Shanghai's end walls in
 * the 1930s): its ground in a band of the ink, the characters down a standing panel or across a lying one with a
 * romanised line under them, faded toward the wall. Paint on a rendered panel 2 cm proud (the render bucket's, so on brick
 * it is a painted panel): the paint takes the wall's damp and grime (weather.ts). (u, y) the panel's bottom centre, w × h.
 * Dressing; the ground reads at any range, the lettering within the fine-detail distance.
 */
export function wallAd(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, rng: () => number): void {
  if (w < 1.6 || h < 1.2) return;
  const fade = 0.15 + rng() * 0.45;
  const toward = (c: Rgb): Rgb => [c[0] + (1 - c[0]) * fade, c[1] + (1 - c[1]) * fade, c[2] + (1 - c[2]) * fade];
  const gi = Math.min(AD_GROUNDS.length - 1, Math.floor(rng() * AD_GROUNDS.length));
  const light = gi === 1 || gi === 3 || (gi === 0 && rng() < 0.6);
  const ink = toward(light ? AD_INK_LIGHT : gi === 2 && rng() < 0.5 ? AD_INK_RED : AD_INK_DARK);
  const paint = (u0: number, u1: number, y0: number, y1: number, o: number, tint: Rgb, fine: boolean) =>
    sink.polygon('plaster', [facePoint(face, u0, y0, o), facePoint(face, u1, y0, o), facePoint(face, u1, y1, o), facePoint(face, u0, y1, o)],
      fine ? { decor: true, tint, fine: true } : { decor: true, tint });
  const l = u - w / 2, r = u + w / 2, t = y + h, b = Math.min(0.14, h * 0.06);
  paint(l, r, y, t, 0.02, toward(AD_GROUNDS[gi]), false);
  paint(l, r, t - b, t, 0.026, ink, false); paint(l, r, y, y + b, 0.026, ink, false);
  paint(l, l + b, y + b, t - b, 0.026, ink, false); paint(r - b, r, y + b, t - b, 0.026, ink, false);
  const tall = h > w * 1.2, pad = b * 2.4;
  const run = (tall ? h : w) - 2 * pad, across = (tall ? w : h) - 2 * pad;
  const cell = Math.min(across * (tall ? 0.78 : 0.5), run / 3);
  const n = Math.max(2, Math.min(6, Math.floor(run / (cell * 1.2))));
  const stroke = (u0: number, u1: number, y0: number, y1: number) => paint(u0, u1, y0, y1, 0.032, ink, true);
  for (let k = 0; k < n; k++) {
    const along = -run / 2 + (k + 0.5) * run / n;
    if (tall) glyph(u, (y + t) / 2 - along, cell, rng, stroke);
    else glyph(u + along, y + pad + across * 0.66, cell, rng, stroke);
  }
  // the romanised line under a lying panel's characters
  if (!tall && across > 1.4) {
    const ly = y + pad + across * 0.12, lh = Math.min(0.22, across * 0.1);
    for (let lu = l + pad; lu < r - pad - 0.3;) {
      const ww = 0.25 + rng() * 0.9;
      paint(lu, Math.min(r - pad, lu + ww), ly, ly + lh, 0.032, ink, true);
      lu += ww + 0.18;
    }
  }
}

/** The rooftop hoardings' boards: a lacquer red, a cream, a dark green, a navy, a yellow ochre; their lettering's paint. */
const HOARDING_BOARDS: readonly Rgb[] = [0x8c2b22, 0xd9cfb4, 0x2f4a3c, 0x2b3a55, 0xc29a3a].map(rgb);
const HOARDING_INK: readonly Rgb[] = [WHITE_TRIM, rgb(0x8c2b22), WHITE_TRIM, WHITE_TRIM, rgb(0x1d1c1b)];

/**
 * A hoarding on a Settlement block's flat roof (the advertising frames over the tram streets of 1937): a painted board on
 * its iron frame, lifted clear of the parapet and set `back` metres behind the street face, its characters to the street;
 * the frame's posts carried down to the roof and raked back to it. (u, roofY) the frame's foot centre on the face's line,
 * w × h the board. Dressing that casts its shadow.
 */
export function rooftopHoarding(sink: PartSink, face: Face, u: number, roofY: number, back: number, w: number, h: number, rng: () => number): void {
  const lift = 1.4, y0 = roofY + lift, o = -back;
  const gi = Math.min(HOARDING_BOARDS.length - 1, Math.floor(rng() * HOARDING_BOARDS.length));
  faceBox(sink, 'structureWood', face, u, y0 + h / 2, o, w, h, 0.08, { colour: HOARDING_BOARDS[gi], decor: true, shadow: true });
  faceBox(sink, 'structureWood', face, u, y0 + h - 0.06, o + 0.06, w + 0.1, 0.12, 0.1, { colour: shade(HOARDING_BOARDS[gi], 0.6), decor: true });
  const ink = HOARDING_INK[gi], n = Math.max(2, Math.min(7, Math.floor(w / (h * 0.62)))), cell = Math.min(h * 0.56, (w - 0.6) / n / 1.15);
  for (let k = 0; k < n; k++) {
    glyph(u - w / 2 + 0.3 + (k + 0.5) * (w - 0.6) / n, y0 + h * 0.56, cell, rng, (u0, u1, a, b) =>
      faceBox(sink, 'structureWood', face, (u0 + u1) / 2, (a + b) / 2, o + 0.045, u1 - u0, b - a, 0.012, { colour: ink, decor: true, fine: true }));
  }
  faceBox(sink, 'structureWood', face, u, y0 + h * 0.17, o + 0.045, w * 0.7, h * 0.09, 0.012, { colour: ink, decor: true, fine: true });
  // the frame: its posts behind the board down to the roof, a rail under the board, a raking strut back from each post
  const posts = Math.max(2, Math.round(w / 2.4) + 1);
  for (let k = 0; k < posts; k++) {
    const pu = u - w / 2 + 0.2 + k * (w - 0.4) / (posts - 1);
    faceBox(sink, 'structureMetal', face, pu, roofY + (lift + h) / 2, o - 0.1, 0.09, lift + h, 0.09, { colour: IRON, decor: true, shadow: true });
    sink.member('structureMetal', facePoint(face, pu, y0 + h * 0.6, o - 0.14), facePoint(face, pu, roofY, o - 0.14 - (lift + h * 0.6) * 0.55),
      0.07, 0.07, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
  }
  faceBox(sink, 'structureMetal', face, u, y0 - 0.06, o - 0.1, w, 0.1, 0.1, { colour: IRON, decor: true, shadow: true });
}

/** Bamboo, cut and dried. */
const BAMBOO = rgb(0x9a8a5a);
/** The washing on the poles: a white, an indigo, a faded red, a grey, a blue-and-white print's blue, a khaki. */
const WASHING: readonly Rgb[] = [0xd8d4c8, 0x2f3d5c, 0x9a4a3a, 0x8a8a84, 0x6a86a8, 0xa8986a].map(rgb);

/**
 * Bamboo poles run out of an upper window over the street, the washing pegged along them (the lanes' and the shophouses'
 * everyday sight): one or two from the sill at (u, y), rising a little as they reach `reach` metres out. Dressing.
 */
export function laundryPoles(sink: PartSink, face: Face, u: number, y: number, reach: number, rng: () => number): void {
  const poles = rng() < 0.55 ? 1 : 2;
  for (let k = 0; k < poles; k++) {
    const pu = u + (poles === 2 ? (k - 0.5) * 0.46 : 0), py = y + k * 0.1, rise = 0.1 + rng() * 0.08;
    const drift = (rng() - 0.5) * 0.5;
    sink.member('structureWood', facePoint(face, pu, py, -0.12), facePoint(face, pu + drift, py + reach * rise, reach), 0.045, 0.045, [0, 1, 0],
      { colour: BAMBOO, decor: true, exposed: true }, 0);
    // the clothes along the pole, edge-on to the facade: a side face through the pole's line
    const side: Face = { origin: facePoint(face, pu, 0, 0), u: face.out, out: face.u, width: reach };
    for (let along = 0.45 + rng() * 0.2; along < reach - 0.25;) {
      const gw = 0.35 + rng() * 0.45, gh = 0.35 + rng() * 0.55, at = along + gw / 2;
      if (at + gw / 2 > reach - 0.1) break;
      const top = py + at * rise - 0.02;
      faceBox(sink, 'structureWood', side, at, top - gh / 2, drift * at / reach, gw, gh, 0.012, { colour: choose(rng(), WASHING), decor: true, fine: true });
      along += gw + 0.08 + rng() * 0.35;
    }
  }
}
