// src/world/maps/regional/sarajevoParts.ts — the shared parts of the Sarajevo kit (sarajevo.ts; Ruinspires, the city
// under siege 1992-1996): its paints and the siege's marks on a wall. UNHCR plastic sheeting nailed over a window whose
// glass the blasts took; sandbags filling a ground-floor window to a firing slit; the shell pocks a mortar burst leaves
// across a facade (the render chipped to the masonry round a dark crater); a shell hole through a wall; the soot of a
// burnt storey; a cast-iron balcony railing; the white turbaned stones (nišani) of a Muslim graveyard. All dressing (no
// collision); the kit draws their choices from the building's look stream (ctx.variant), never the build stream.
import { PartSink, faceBox, facePanel, facePoint, rgb, type Face, type RegionalBucket, type Rgb } from './geometry.ts';

/** The Austro-Hungarian casements, painted cream; the mahala's dark timber; the doors' oil paints. */
export const AH_FRAME = rgb(0xe2dccb);
export const DARK_FRAME = rgb(0x45372b);
export const DOOR_LEAVES: readonly Rgb[] = [0x3e2e22, 0x2f4434, 0x5a2a20, 0x34404c, 0x4b3a2a].map(rgb);
export const TIMBER: readonly Rgb[] = [0x3a2a1e, 0x4a3424, 0x2f251d, 0x55402e].map(rgb);
/** Sheet metal: zinc, the copper of the domes gone green, the lead of the mosques' domes and minaret caps. */
export const ZINC = rgb(0x7f868a), COPPER = rgb(0x5f8b76), LEAD = rgb(0x858b90);
export const IRON = rgb(0x2b2e30), HESSIAN = rgb(0x8c7b58), ROLL_SHUTTER = rgb(0x6c6457);
/** UNHCR sheeting: white polythene with the agency's blue band. */
const UNHCR_WHITE = rgb(0xdfe5e3), UNHCR_BLUE = rgb(0x2b63aa);
/** The coloured parapet panels of the 1970s and 80s estates (Alipašino Polje, Grbavica, Mojmilo). */
export const PANEL_PAINTS: readonly Rgb[] = [0xa9583c, 0xcfa23c, 0x5d895b, 0x496d98, 0xc6bfaf, 0x8a4a3a].map(rgb);
export const CHAR: Rgb = [0.06, 0.05, 0.045];

const DECOR = { decor: true } as const;

/**
 * The footprint a kit building fills: the base geometry's measured bounds (ctx.bounds; the coordinator's rule of
 * 2026-10-05 — a body short of them opens lanes between buildings), inset, with an optional limit on the +z (street)
 * side. Edges, sizes and centre in the building's frame.
 */
export interface Fill { x0: number; x1: number; z0: number; z1: number; w: number; d: number; cx: number; cz: number }
export function fillOf(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, inset = 0.05, front = Infinity): Fill {
  const x0 = bounds.minX + inset, x1 = bounds.maxX - inset, z0 = bounds.minZ + inset, z1 = Math.min(bounds.maxZ, front) - inset;
  return { x0, x1, z0, z1, w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/** Clamp helper shared by the kit's builders. */
export const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** A pick from a list by a [0, 1) draw. */
export function choose<T>(r: number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

/**
 * UNHCR plastic sheeting nailed over a window mouth (the glass gone): the pale sheet a little proud of the wall, the
 * agency's blue band across it, battens holding its edges. (u, y) is the bottom-centre of the opening.
 */
export function unhcrSheet(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number): void {
  const sag = 0.02 + look() * 0.03;
  facePanel(sink, 'structureMetal', face, u, y + h / 2, 0.025 + sag, w + 0.08, h + 0.08, { ...DECOR, colour: UNHCR_WHITE });
  if (h > 0.7) facePanel(sink, 'structureMetal', face, u, y + h * (0.42 + look() * 0.2), 0.03 + sag, w + 0.06, Math.min(0.22, h * 0.14), { ...DECOR, colour: UNHCR_BLUE });
  const batten: Rgb = [0.42, 0.35, 0.27];
  faceBox(sink, 'structureWood', face, u, y + h + 0.04, 0.05, w + 0.16, 0.06, 0.04, { ...DECOR, colour: batten, fine: true });
  faceBox(sink, 'structureWood', face, u, y - 0.04, 0.05, w + 0.16, 0.06, 0.04, { ...DECOR, colour: batten, fine: true });
}

/**
 * Sandbags filling a window to a firing slit: courses of bags across the opening's mouth, each course its own shade,
 * the slit dark above them. (u, y) is the bottom-centre of the opening.
 */
export function sandbagWindow(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number): void {
  const fill = h * (0.62 + look() * 0.16), course = 0.15;
  const rows = Math.max(2, Math.floor(fill / course));
  for (let r = 0; r < rows; r++) {
    const k = 0.84 + look() * 0.22;
    const off = (r % 2 ? 0.08 : -0.08);
    faceBox(sink, 'structureWood', face, u + off * 0.3, y + course * (r + 0.5), 0.12, w + 0.12, course - 0.012, 0.32,
      { ...DECOR, colour: [HESSIAN[0] * k, HESSIAN[1] * k, HESSIAN[2] * k] });
  }
}

/** A hole through a wall face to avoid. */
export interface Keep { u0: number; u1: number; y0: number; y1: number }

/**
 * Shell pocks across a face: small ragged scars where splinters chipped the render to the masonry (`under`), each
 * with a dark crater, kept clear of the openings. Fanned polygons 14-16 mm proud (the depth buffer resolves them to
 * ~280 m, where a pock is a pixel). All `count` pocks are drawn from the look stream; only the first `drawn` are
 * emitted (a phone keeps fewer, and its look stream stands where the desktop's does after them).
 */
export function shellPocks(sink: PartSink, face: Face, rect: Keep, count: number, keep: readonly Keep[], look: () => number,
  under: RegionalBucket = 'stone', drawn = count): void {
  for (let k = 0; k < count; k++) {
    const r = 0.07 + look() * look() * 0.32;
    const cu = rect.u0 + r + look() * Math.max(0, rect.u1 - rect.u0 - 2 * r);
    const cy = rect.y0 + r + look() * Math.max(0, rect.y1 - rect.y0 - 2 * r);
    const sides = 7, ring: Array<[number, number]> = [];
    for (let j = 0; j < sides; j++) {
      const t = (j / sides) * Math.PI * 2, rr = r * (0.6 + look() * 0.4);
      ring.push([cu + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
    }
    if (k >= drawn) continue;
    if (keep.some((h) => cu + r > h.u0 - 0.05 && cu - r < h.u1 + 0.05 && cy + r > h.y0 - 0.05 && cy - r < h.y1 + 0.05)) continue;
    sink.polygon(under, [[cu, cy], ...ring, ring[0]].map(([uu, yy]) => facePoint(face, uu, yy, 0.014)), { ...DECOR, shade: 0.8 });
    const c = r * 0.42;
    sink.polygon('dark', [0, 1, 2, 3, 4].map((j) => {
      const t = (j / 5) * Math.PI * 2 + 0.3;
      return facePoint(face, cu + Math.cos(t) * c, cy + Math.sin(t) * c, 0.016);
    }), DECOR);
  }
}

/**
 * A shell hole through a wall: a ragged dark breach with the masonry torn round it (the render gone in a wider ring).
 * (u, y) is its centre, r its radius.
 */
export function shellHole(sink: PartSink, face: Face, u: number, y: number, r: number, look: () => number, under: RegionalBucket = 'stone'): void {
  const n = 9, outer: Array<[number, number]> = [], inner: Array<[number, number]> = [];
  for (let j = 0; j < n; j++) {
    const t = (j / n) * Math.PI * 2;
    const ro = r * (1.25 + look() * 0.35), ri = r * (0.62 + look() * 0.38);
    outer.push([u + Math.cos(t) * ro, y + Math.sin(t) * ro * 0.85]);
    inner.push([u + Math.cos(t) * ri, y + Math.sin(t) * ri * 0.85]);
  }
  sink.polygon(under, [[u, y], ...outer, outer[0]].map(([uu, yy]) => facePoint(face, uu, yy, 0.016)), { ...DECOR, shade: 0.72 });
  sink.polygon('dark', [[u, y], ...inner, inner[0]].map(([uu, yy]) => facePoint(face, uu, yy, 0.02)), DECOR);
}

/**
 * The soot of a burnt storey on a face: a dark band over the storey's window heads fading up the wall (the weathering
 * pass multiplies its shade into the render), 12 mm proud.
 */
export function sootBand(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y0: number, y1: number): void {
  const mid = (y0 + y1) / 2;
  sink.quad(bucket, facePoint(face, u0, y0, 0.012), facePoint(face, u1, y0, 0.012), facePoint(face, u1, y1, 0.012), facePoint(face, u0, y1, 0.012),
    { ...DECOR, shadeAt: (p) => (p[1] < mid ? 0.34 : 0.78) });
}

/**
 * A cast-iron balcony railing along a face at height y (its foot), `out` metres from the wall: the top and bottom rails
 * and the balusters (fine joinery), the two returns to the wall.
 */
export function railing(sink: PartSink, face: Face, u0: number, u1: number, y: number, out: number, h = 0.95): void {
  const c = { ...DECOR, colour: IRON };
  faceBox(sink, 'structureMetal', face, (u0 + u1) / 2, y + h, out, u1 - u0, 0.05, 0.05, c);
  faceBox(sink, 'structureWood', face, (u0 + u1) / 2, y + 0.08, out, u1 - u0, 0.04, 0.04, { ...c, fine: true });
  for (const uu of [u0, u1]) faceBox(sink, 'structureMetal', face, uu, y + h / 2, out / 2, 0.05, h, out, c);
  for (let uu = u0 + 0.12; uu < u1 - 0.06; uu += 0.13) faceBox(sink, 'structureWood', face, uu, y + h / 2, out, 0.022, h, 0.022, { ...c, fine: true });
}

/**
 * A nišan: the white headstone of a Muslim grave, a slender shaft on a low plinth, a turban (a man's grave) or a
 * pointed head. (x, z) its foot, `yaw` its facing.
 */
export function nisan(sink: PartSink, x: number, z: number, h: number, turban: boolean, lean: number): void {
  sink.placed(lean, x, 0, z, () => {
    sink.span('stone', -0.14, -0.2, -0.1, 0.14, 0.12, 0.1, DECOR);
    sink.span('stone', -0.09, 0.12, -0.065, 0.09, h, 0.065, DECOR);
    if (turban) sink.cylinder('stone', [0, h, 0], 'y', 0.2, 0.13, 6, DECOR, 0.1);
    else sink.cylinder('stone', [0, h, 0], 'y', 0.16, 0.09, 4, DECOR, 0.01, true, Math.PI / 4);
  });
}

/**
 * A dark arch head over an opening: the half-disc of the arched glazing or void above a rectangular opening, with a
 * stone archivolt round it. (u, y) is the springing line's centre, r the arch radius.
 */
export function archHead(sink: PartSink, face: Face, u: number, y: number, r: number, ring: RegionalBucket | null, ringW = 0.16, segments = 7): void {
  const fan: Array<[number, number]> = [[u, y]];
  for (let j = 0; j <= segments; j++) {
    const t = Math.PI * (j / segments);
    fan.push([u + Math.cos(t) * r, y + Math.sin(t) * r]);
  }
  // ccw seen from outside: from the right springer over the crown to the left one
  sink.polygon('dark', fan.map(([uu, yy]) => facePoint(face, uu, yy, 0.012)), DECOR);
  if (!ring) return;
  for (let j = 0; j < segments; j++) {
    const a = Math.PI * (j / segments), b = Math.PI * ((j + 1) / segments);
    const r0 = r, r1 = r + ringW;
    sink.quad(ring, facePoint(face, u + Math.cos(a) * r0, y + Math.sin(a) * r0, 0.04), facePoint(face, u + Math.cos(a) * r1, y + Math.sin(a) * r1, 0.04),
      facePoint(face, u + Math.cos(b) * r1, y + Math.sin(b) * r1, 0.04), facePoint(face, u + Math.cos(b) * r0, y + Math.sin(b) * r0, 0.04), { ...DECOR, shade: 0.95 });
  }
}

/** A triangular pediment over a window (the piano nobile's hood), a thin prism proud of the wall. */
export function pediment(sink: PartSink, face: Face, u: number, y: number, w: number, rise: number, bucket: RegionalBucket = 'stone'): void {
  const out = 0.1;
  const pts = [[u - w / 2, y], [u + w / 2, y], [u, y + rise]] as const;
  // a prism from the wall plane outward: points ccw seen from outside (+out), extruded along the face's normal
  sink.prism(bucket, pts.map(([uu, yy]) => facePoint(face, uu, yy, 0)), face.out, out, { ...DECOR, fineSides: true });
}
