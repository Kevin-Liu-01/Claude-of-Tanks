// src/world/maps/regional/vernacular.ts — the monsoon-belt vernacular shared by the Mekong (mekong.ts) and Bengal
// (bengal.ts) kits: houses raised on posts, walls of corrugated iron sheet or plank or woven bamboo, thatch and sheet
// roofs, verandas with rails, ladders and steps. Corrugated walls ride the light kit's sheet tile (structureMetal) under
// a vertex livery — galvanised, rust or paint — so every house differs without a new material.
import {
  PartSink, faceBox, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type Rgb, type Vec3,
} from './geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from './house.ts';

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

/** A veranda: a deck along a face, posts, a rail and a lean-to roof from the wall head. */
export function veranda(sink: PartSink, face: Face, floorY: number, wallTop: number, width: number, depth: number, post: Rgb,
  roof: { bucket: RegionalBucket; colour?: Rgb; thatch?: RoofSpec['thatch'] }, rail = true): void {
  faceBox(sink, 'structureWood', face, 0, floorY + 0.08, depth / 2, width, 0.16, depth, { colour: shade(post, 1.05), uv: UV_MEMBER });
  const n = Math.max(2, Math.round(width / 2.2) + 1);
  for (let i = 0; i < n; i++) {
    const u = -width / 2 + 0.12 + (width - 0.24) * i / (n - 1);
    faceBox(sink, 'structureWood', face, u, (floorY + wallTop) / 2, depth - 0.1, 0.14, wallTop - floorY, 0.14, { colour: post, uv: UV_MEMBER });
    if (floorY > 0.3) faceBox(sink, 'structureWood', face, u, (floorY - 0.4) / 2, depth - 0.1, 0.14, floorY + 0.4, 0.14, { colour: post, uv: UV_MEMBER });
  }
  if (rail) {
    faceBox(sink, 'structureWood', face, 0, floorY + 0.9, depth - 0.1, width - 0.2, 0.07, 0.07, { colour: post, decor: true });
    for (let u = -width / 2 + 0.3; u < width / 2 - 0.2; u += 0.3) {
      faceBox(sink, 'structureWood', face, u, floorY + 0.5, depth - 0.1, 0.05, 0.75, 0.05, { colour: shade(post, 0.9), decor: true });
    }
  }
  // the lean-to: a shed slab from the wall head out over the posts
  const rise = Math.max(0.25, wallTop - floorY - 2.1);
  const pitch = Math.atan2(rise, depth) * 180 / Math.PI;
  const spec: RoofSpec = { kind: 'shed', pitchDeg: Math.max(6, pitch), eave: 0.3, verge: 0.2, thickness: 0.07, bucket: roof.bucket,
    ...(roof.thatch ? { thatch: roof.thatch } : {}) };
  const rg = roofGeometry(depth, width, wallTop - rise, spec);
  // a shed rises toward its local -x: turn it so the high side meets the wall
  // local +x (the low side) turned onto the face's outward normal
  const yaw = Math.atan2(-face.out[2], face.out[0]);
  const c: Vec3 = [face.origin[0] + face.out[0] * depth / 2, 0, face.origin[2] + face.out[2] * depth / 2];
  sink.placed(yaw, c[0], 0, c[2], () => emitRoof(sink, rg, spec, roof.colour));
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
