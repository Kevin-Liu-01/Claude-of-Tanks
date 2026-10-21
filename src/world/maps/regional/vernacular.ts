// src/world/maps/regional/vernacular.ts — the monsoon-belt vernacular shared by the Mekong (mekong.ts) and Bengal
// (bengal.ts) kits: houses raised on posts, walls of corrugated iron sheet or plank or woven bamboo, thatch and sheet
// roofs, verandas with rails, ladders and steps. Corrugated walls ride the light kit's sheet tile (structureMetal) under
// a vertex livery — galvanised, rust or paint — so every house differs without a new material.
import {
  PartSink, faceBox, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type Rgb,
} from './geometry.ts';
import { leanTo, type RoofSpec } from './house.ts';

export const GALVANISED: readonly Rgb[] = [0x9aa0a2, 0x8a9092, 0xa8aaa6].map(rgb);
export const RUSTED: readonly Rgb[] = [0x8a5a3e, 0x7a4c34, 0x96684a].map(rgb);
export const PAINTED_SHEET: readonly Rgb[] = [0x3f6f9a, 0x4f8a62, 0x9a3a32, 0x5a8aa0].map(rgb);
export const WEATHERED_PLANK: readonly Rgb[] = [0x7a6a58, 0x6a5c4c, 0x8a7862, 0x5e544a].map(rgb);
export const BAMBOO_MAT = rgb(0xa08a62);

/** A ring of structural posts under a raised floor, braced on the long sides. */
export function stilts(sink: PartSink, w: number, d: number, lift: number, colour: Rgb, opts: { brace?: boolean; size?: number } = {}): void {
  const size = opts.size ?? 0.18;
  const nx = Math.max(2, Math.round(w / 2.2) + 1), nz = Math.max(2, Math.round(d / 2.2) + 1);
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    if (i > 0 && i < nx - 1 && k > 0 && k < nz - 1) continue; // perimeter posts only
    const x = -w / 2 + 0.15 + (w - 0.3) * i / (nx - 1), z = -d / 2 + 0.15 + (d - 0.3) * k / (nz - 1);
    sink.span('structureWood', x - size / 2, -0.4, z - size / 2, x + size / 2, lift, z + size / 2, { colour, uv: UV_MEMBER });
  }
  if (opts.brace !== false) {
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 0.15);
      for (let k = 0; k + 1 < nz; k++) {
        const z0 = -d / 2 + 0.15 + (d - 0.3) * k / (nz - 1), z1 = -d / 2 + 0.15 + (d - 0.3) * (k + 1) / (nz - 1);
        sink.member('structureWood', [x, 0.2, z0], [x, lift - 0.25, z1], 0.1, 0.08, [side, 0, 0], { colour: shade(colour, 0.9), decor: true, exposed: true });
      }
    }
  }
  // the floor deck the house stands on
  sink.span('structureWood', -w / 2 - 0.05, lift, -d / 2 - 0.05, w / 2 + 0.05, lift + 0.16, d / 2 + 0.05, { colour: shade(colour, 1.05), uv: UV_MEMBER });
}

/** Corrugated sheet cladding on one face rectangle: the sheet tile under a livery, its corrugation running vertical. */
export function sheetWall(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, colour: Rgb, decor = false): void {
  faceBox(sink, 'structureMetal', face, (u0 + u1) / 2, (y0 + y1) / 2, 0.02, u1 - u0, y1 - y0, 0.04, { colour, decor });
}

/** A plank or mat wall panel dressed on a face (vertical boards, a top and bottom rail). */
export function boardWall(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, colour: Rgb): void {
  faceBox(sink, 'structureWood', face, (u0 + u1) / 2, (y0 + y1) / 2, 0.018, u1 - u0, y1 - y0, 0.036, { colour, decor: true, uv: UV_MEMBER });
  for (const y of [y0 + 0.06, y1 - 0.06]) faceBox(sink, 'structureWood', face, (u0 + u1) / 2, y, 0.05, u1 - u0, 0.1, 0.03, { colour: shade(colour, 0.85), decor: true });
}

/**
 * A veranda: a deck along a face, posts, a rail and a lean-to roof from the wall head. (Props census E3, lane B
 * 2026-10-14: the posts ran to the wall head's height and pierced the lean-to by its rise.) The lean-to is house.ts
 * leanTo: it falls from the wall head to a plate over the post line, and every post stands from the ground (through a
 * raised deck) or the deck up to the plate. `under`, the house's own roof: the lean-to passes under its eave.
 */
export function veranda(sink: PartSink, face: Face, floorY: number, wallTop: number, width: number, depth: number, post: Rgb,
  roof: { bucket: RegionalBucket; colour?: Rgb; thatch?: RoofSpec['thatch'] }, rail = true,
  under?: { eaveY: number; eave: number; tanP: number },
  // (the looks lane, 2026-10-17, the Bengal kit) `round`: the posts are bamboo culms, round, not sawn squares
  opts: { round?: boolean } = {}): ReturnType<typeof leanTo> {
  faceBox(sink, 'structureWood', face, 0, floorY + 0.08, depth / 2, width, 0.16, depth, { colour: shade(post, 1.05), uv: UV_MEMBER });
  // (props census #15, Lane C 2026-10-16: "the deck is one plain slab") its boards: a seam between each pair along the
  // face, the deck's edge board proud of them
  for (let o = 0.16; o < depth - 0.1; o += 0.15) faceBox(sink, 'structureWood', face, 0, floorY + 0.163, o, width - 0.04, 0.008, 0.018, { colour: shade(post, 0.62), decor: true, fine: true });
  faceBox(sink, 'structureWood', face, 0, floorY + 0.06, depth - 0.02, width + 0.04, 0.2, 0.05, { colour: shade(post, 0.96), decor: true });
  const n = Math.max(2, Math.round(width / 2.2) + 1);
  const at: number[] = [];
  for (let i = 0; i < n; i++) at.push(-width / 2 + 0.12 + (width - 0.24) * i / (n - 1));
  if (rail) {
    faceBox(sink, 'structureWood', face, 0, floorY + 0.9, depth - 0.1, width - 0.2, 0.07, 0.07, { colour: post, decor: true });
    for (let u = -width / 2 + 0.3; u < width / 2 - 0.2; u += 0.3) {
      faceBox(sink, 'structureWood', face, u, floorY + 0.5, depth - 0.1, 0.05, 0.75, 0.05, { colour: shade(post, 0.9), decor: true });
    }
  }
  // the lean-to: a shed slab from the wall head out over the posts, on a plate over the post line
  const rise = Math.max(0.25, wallTop - floorY - 2.1);
  const pitch = Math.atan2(rise, depth) * 180 / Math.PI;
  return leanTo(sink, { face, u0: -width / 2, u1: width / 2, depth: depth - 0.1, highY: wallTop, ...(under ? { under } : {}),
    roof: { pitchDeg: Math.max(6, pitch), eave: 0.3, verge: 0.2, thickness: 0.07, bucket: roof.bucket, ...(roof.thatch ? { thatch: roof.thatch } : {}) },
    ...(roof.colour ? { roofColour: roof.colour } : {}),
    posts: { at, size: 0.14, bucket: 'structureWood', colour: post, foot: floorY > 0.3 ? -0.4 : floorY, ...(opts.round ? { round: true } : {}) },
    plate: { h: 0.12, w: 0.14, bucket: 'structureWood', colour: shade(post, 0.92) } });
}

/** A ladder of rungs between two rails, from the ground to a floor (decor). */
export function ladder(sink: PartSink, face: Face, u: number, out: number, height: number, colour: Rgb): void {
  for (const du of [-0.28, 0.28]) {
    sink.member('structureWood', [face.origin[0] + face.u[0] * (u + du) + face.out[0] * (out + 0.7), 0, face.origin[2] + face.u[2] * (u + du) + face.out[2] * (out + 0.7)],
      [face.origin[0] + face.u[0] * (u + du) + face.out[0] * out, height, face.origin[2] + face.u[2] * (u + du) + face.out[2] * out],
      0.08, 0.06, face.u, { colour, decor: true, exposed: true });
  }
  const steps = Math.max(3, Math.round(height / 0.3));
  for (let k = 1; k < steps; k++) {
    const t = k / steps, o = out + 0.7 * (1 - t), y = height * t;
    faceBox(sink, 'structureWood', face, u, y, o, 0.62, 0.05, 0.08, { colour, decor: true });
  }
}
