// src/world/worldFlags.ts — the world's flags (world-flags-278, 2026-11-26; Kevin on the badlands fort's flag of Jordan:
// "that flag looks too much like a real flag. fix"; the facades lane had heard the same of Wadi Rum's fort in 2026-10:
// "uses a country flag that we shouldn't use").
//
// Every flag that map dressing flies is one of these invented designs, drawn by this module: no nation's (or party's, or
// organisation's) layout and colours on a mast in the world. One grammar, so they read as one invented country's
// field banners: a swallowtail cloth in two earth or stone tones (a field and a band along its head or foot) and one
// plain device in the field, an annulet or an open lozenge. Grey, sand, umber and slate are colours no national flag
// flies, and the swallowtail is a shape almost none has. worldFlags.selftest.mjs rasterises each design (and each site's
// drawn cloth) against a table of real flags.
//
// Out of scope by design: the vehicles' national markings, the nation picker and the gallery's flags (src/ui/flags.ts),
// which name a vehicle's real nation on purpose; plain one-colour pennants and survey flags (no design to borrow).
import * as THREE from 'three';
// (types only: the structure kit draws these too, and stays clear of the regional kits' module)
import type { EmitOptions, PartSink, RegionalBucket, Rgb, Vec3 } from './maps/regional/geometry.ts';

/** A point on the cloth: u from the hoist (0) to the fly's tips (1), v from the foot (0) to the head (1). */
type FlagUV = readonly [number, number];

interface WorldFlagDesign {
  /** sRGB: the field, the band across its head or foot, the device */
  readonly field: number;
  readonly band: { readonly hex: number; readonly edge: 'head' | 'foot'; readonly share: number };
  readonly device: { readonly kind: 'annulet' | 'lozenge'; readonly hex: number; readonly u: number; readonly v: number; readonly r: number };
  /** the swallowtail's cut into the fly (a share of the length) */
  readonly notch: number;
}

/** The designs, one per kind of place that flies one. */
export const WORLD_FLAG_DESIGNS = Object.freeze({
  // the desert: a sand field, a terracotta band at its foot, an umber annulet (the badlands fort's tower)
  dune: { field: 0xc9a46a, band: { hex: 0x9c4f2e, edge: 'foot', share: 0.3 }, device: { kind: 'annulet', hex: 0x4b3526, u: 0.36, v: 0.64, r: 0.2 }, notch: 0.2 },
  // the coast: a stone field, a slate-teal band at its foot, a teal lozenge (the Dalmatian square's stendardo)
  quay: { field: 0xe0d8c6, band: { hex: 0x2f5f66, edge: 'foot', share: 0.28 }, device: { kind: 'lozenge', hex: 0x2f5f66, u: 0.36, v: 0.63, r: 0.22 }, notch: 0.2 },
  // the uplands: a slate field, a sand band at its head, a sand annulet (the border post's mast)
  march: { field: 0x56626b, band: { hex: 0xd6c7a1, edge: 'head', share: 0.28 }, device: { kind: 'annulet', hex: 0xd6c7a1, u: 0.36, v: 0.37, r: 0.2 }, notch: 0.2 },
  // the survey: a steel-blue field, a white band at its foot, a white lozenge (the lunar site's mission banner)
  survey: { field: 0x5d7896, band: { hex: 0xf1efe8, edge: 'foot', share: 0.3 }, device: { kind: 'lozenge', hex: 0xf1efe8, u: 0.36, v: 0.64, r: 0.21 }, notch: 0.2 },
} satisfies Record<string, WorldFlagDesign>);
export type WorldFlagId = keyof typeof WORLD_FLAG_DESIGNS;

/** One convex piece of the cloth in one colour; layer 1 lies on layer 0 (the device on the field and band). */
interface WorldFlagPanel { readonly poly: readonly FlagUV[]; readonly hex: number; readonly layer: 0 | 1 }

interface WorldFlagOptions {
  /** the cloth's length over its height (keeps the device round or square on it); default 1.6 */
  readonly aspect?: number;
  /** strips along the length, so a rippling cloth bends between them; default 1 */
  readonly columns?: number;
  /** sun-bleached toward a pale linen by this share (0..1) */
  readonly fade?: number;
}

/** Sutherland–Hodgman: the part of a convex polygon where the linear `f` is ≥ 0. */
function clip(poly: readonly FlagUV[], f: (p: FlagUV) => number): FlagUV[] {
  const out: FlagUV[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

const PALE = 0xf1efe8;
function faded(hex: number, t: number): number {
  if (!(t > 0)) return hex;
  let out = 0;
  for (const s of [16, 8, 0]) out |= Math.round(((hex >> s) & 255) + (((PALE >> s) & 255) - ((hex >> s) & 255)) * Math.min(1, t)) << s;
  return out;
}

/** The design's convex panels in cloth coordinates: the swallowtail's two halves, cut into `columns` strips. */
export function worldFlagPanels(id: WorldFlagId, opts: WorldFlagOptions = {}): WorldFlagPanel[] {
  const d: WorldFlagDesign = WORLD_FLAG_DESIGNS[id];
  const aspect = opts.aspect ?? 1.6, columns = Math.max(1, Math.round(opts.columns ?? 1)), fade = opts.fade ?? 0;
  const n = d.notch, b = d.band.share;
  const [b0, b1] = d.band.edge === 'foot' ? [0, b] : [1 - b, 1];
  const [f0, f1] = d.band.edge === 'foot' ? [b, 1] : [0, 1 - b];
  const rect = (v0: number, v1: number): FlagUV[] => [[0, v0], [1, v0], [1, v1], [0, v1]];
  const shapes: Array<{ poly: FlagUV[]; hex: number; layer: 0 | 1 }> = [
    { poly: rect(f0, f1), hex: d.field, layer: 0 },
    { poly: rect(b0, b1), hex: d.band.hex, layer: 0 },
  ];
  // the device: a ring of 16 quads (annulet) or 4 (lozenge), its stroke a third of its radius, round on the cloth
  const { u, v, r } = d.device, k = d.device.kind === 'annulet' ? 16 : 4, ri = r * (2 / 3);
  const at = (a: number, rr: number): FlagUV => [u + Math.cos(a) * rr / aspect, v + Math.sin(a) * rr];
  for (let i = 0; i < k; i++) {
    const a0 = (i / k) * Math.PI * 2, a1 = ((i + 1) / k) * Math.PI * 2;
    shapes.push({ poly: [at(a0, ri), at(a0, r), at(a1, r), at(a1, ri)], hex: d.device.hex, layer: 1 });
  }
  // the swallowtail: the cloth's two convex halves either side of the cut from the fly's corners to (1 - n, 1/2)
  const halves: Array<Array<(p: FlagUV) => number>> = [
    [(p) => p[1] - 0.5, (p) => n * (p[1] - 0.5) - 0.5 * (p[0] - 1 + n)],
    [(p) => 0.5 - p[1], (p) => n * (0.5 - p[1]) - 0.5 * (p[0] - 1 + n)],
  ];
  const out: WorldFlagPanel[] = [];
  for (const s of shapes) for (const half of halves) for (let c = 0; c < columns; c++) {
    const lo = c / columns, hi = (c + 1) / columns;
    let poly: FlagUV[] = s.poly;
    for (const f of [...half, (p: FlagUV) => p[0] - lo, (p: FlagUV) => hi - p[0]]) poly = clip(poly, f);
    // (a cut through a corner repeats it: a sink takes its normal from the first three points)
    poly = poly.filter((p, i) => { const q = poly[(i + poly.length - 1) % poly.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-9; });
    if (poly.length >= 3) out.push({ poly, hex: faded(s.hex, fade), layer: s.layer });
  }
  return out;
}

/** The device's lift off the field and band (m), each face its own way. */
export const WORLD_FLAG_LIFT = 0.008;

/**
 * A world flag into a part sink, both faces: `cloth` places a cloth point (u, v) in the piece's frame, `lift` metres off
 * the cloth along its front's normal (the front is counter-clockwise in u, v). The back is shaded a little (its own
 * light), dressing (no collision).
 */
export function drawWorldFlag(sink: PartSink, bucket: RegionalBucket, id: WorldFlagId,
  cloth: (u: number, v: number, lift: number) => Vec3, opts: WorldFlagOptions & { emit?: EmitOptions; back?: number } = {}): void {
  const back = opts.back ?? 0.82, c = new THREE.Color();
  for (const p of worldFlagPanels(id, opts)) {
    c.setHex(p.hex, THREE.SRGBColorSpace);
    const colour: Rgb = [c.r, c.g, c.b], lift = p.layer * WORLD_FLAG_LIFT;
    sink.polygon(bucket, p.poly.map(([u, v]) => cloth(u, v, lift)), { ...opts.emit, colour, decor: true });
    sink.polygon(bucket, p.poly.map(([u, v]) => cloth(u, v, -lift)).reverse(), { ...opts.emit, colour: [c.r * back, c.g * back, c.b * back], decor: true });
  }
}
