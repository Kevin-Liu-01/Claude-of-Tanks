// src/world/maps/regional/shanghaiParts.ts — the Shanghai kit's (shanghai.ts, shanghaiBund.ts) shared parts: the lot's
// fill, the creek's banks, the paints and window styles, the street rows' roofs and their stepped party walls, the
// war's marks on a wall (shell pocks, a shell's breach, soot), the shop signboards, the sandbags at a door.
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofGeometry, type RoofSpec } from './house.ts';
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
 * A street row's gable roof, its ridge along x (the eaves to the street and the yard), over the body x0..x1, z0..z1.
 * Returns the roof's geometry in its own frame: topAt(a, 0) is the roof top at a metres across from the ridge.
 */
export function streetRoof(sink: PartSink, x0: number, x1: number, z0: number, z1: number, eaveY: number, roof: RoofSpec, colour?: Rgb): RoofGeometry {
  const rg = roofGeometry(z1 - z0, x1 - x0, eaveY, roof);
  sink.placed(Math.PI / 2, (x0 + x1) / 2, 0, (z0 + z1) / 2, () => emitRoof(sink, rg, roof, colour));
  return rg;
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
    sink.polygon('dark', pts, { decor: true });
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
      faceBox(sink, 'structureWood', face, bu, y + 0.105 + r * 0.2, 0.32, w / per * 0.94, 0.19, 0.5,
        { colour: shade(HESSIAN, 0.86 + look() * 0.22), decor: true });
    }
  }
}

/** Brick bands through a wall (the red courses of the later lanes in their grey brick): thin strips at `ys`. */
export function brickBands(sink: PartSink, face: Face, u0: number, u1: number, ys: readonly number[], colour: Rgb): void {
  if (u1 - u0 < 0.3) return;
  for (const y of ys) faceBox(sink, 'structureMetal', face, (u0 + u1) / 2, y, 0.012, u1 - u0, 0.16, 0.025, { colour, decor: true, fine: true });
}
