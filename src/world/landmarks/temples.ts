// src/world/landmarks/temples.ts — temples (the landmarks lane, 2026-10-05): the Bengal terracotta aat-chala temple of
// the Jamuna's villages (Jade River Delta) — a square brick cella on a plinth under a curved four-sided roof (the
// char-chala, its eaves drooping to the corners like a thatched hut's), a smaller cella on top under its own, eight
// slopes in all (aat-chala), the kalasa finial, a triple-arched front faced with terracotta plaques.
//
// The frame: the front (+z) is the arched façade and the steps; y = 0 the lowest ground under the plinth.
import { PartSink, rgb, shade, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { archedBody, revolve, type ArchHole, type FaceName } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const TERRACOTTA = rgb(0xa45a3a), PLAQUE: readonly ReturnType<typeof rgb>[] = [0xa65c3c, 0x9a5236, 0xb06a46, 0x8e4a30].map(rgb);
const DARK = rgb(0x1f1a17), FINIAL = rgb(0x7a5a3a);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/**
 * A char-chala roof: four curved slopes from an eave square `h0` (half side, its eave at `y0` mid-side, `droop` lower at
 * the corners — the Bengal roof's curve) up to a square `h1` at `y1` (or a point when h1 is 0), bulging outward by
 * `bulge` at mid-slope along the radial direction (so the hips close), and a fascia under the eave curve.
 */
function charChala(sink: PartSink, bucket: RegionalBucket, h0: number, y0: number, droop: number, h1: number, y1: number, bulge: number,
  opts: { decor?: boolean } = {}): void {
  const NU = 10, NT = 6;
  const point = (k: number, u: number, t: number): Vec3 => {
    // the front face's point (k = 0), turned a quarter per face about y
    const lower: Vec3 = [u * h0, y0 - droop * u * u, h0], upper: Vec3 = [u * h1, y1, h1];
    let x = lower[0] + (upper[0] - lower[0]) * t, y = lower[1] + (upper[1] - lower[1]) * t, z = lower[2] + (upper[2] - lower[2]) * t;
    const r = Math.hypot(x, z) || 1, b = bulge * Math.sin(Math.PI * t) * (1 - 0.25 * u * u);
    x += (x / r) * b; z += (z / r) * b; y += b * 0.35;
    const a = k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    return [x * c + z * s, y, -x * s + z * c];
  };
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < NU; i++) for (let j = 0; j < NT; j++) {
      const u0 = -1 + 2 * i / NU, u1 = -1 + 2 * (i + 1) / NU, t0 = j / NT, t1 = (j + 1) / NT;
      const a = point(k, u0, t0), b = point(k, u1, t0), c = point(k, u1, t1), d = point(k, u0, t1);
      if (h1 === 0 && j === NT - 1) sink.polygon(bucket, [a, b, c], opts); else sink.quad(bucket, a, b, c, d, opts);
    }
    // the fascia: a band under the eave curve, its face outward and its soffit back to the wall head
    for (let i = 0; i < NU; i++) {
      const u0 = -1 + 2 * i / NU, u1 = -1 + 2 * (i + 1) / NU;
      const a = point(k, u0, 0), b = point(k, u1, 0);
      const a2: Vec3 = [a[0], a[1] - 0.22, a[2]], b2: Vec3 = [b[0], b[1] - 0.22, b[2]];
      sink.quad(bucket, a2, b2, b, a, { decor: true });
      // the soffit (seen from below) inward to the wall head
      const inA: Vec3 = [a[0] * 0.86, a[1] - 0.22, a[2] * 0.86], inB: Vec3 = [b[0] * 0.86, b[1] - 0.22, b[2] * 0.86];
      sink.quad(bucket, inA, inB, b2, a2, { decor: true });
    }
  }
}

/**
 * The aat-chala temple (plan.ts bengalTemple): see the module's note.
 */
export const bengalTemple: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const S = Math.max(5, Number(ctx.params.side)), base = -0.6 - ctx.groundFall, plinth = 1.0;
  const wallH = Math.max(3.4, S * 0.55), y0 = plinth + wallH;
  const wall: RegionalBucket = 'stone';
  // the plinth and its steps up to the front
  sink.span(wall, -S / 2 - 0.9, base, -S / 2 - 0.9, S / 2 + 0.9, plinth, S / 2 + 0.9);
  for (let k = 0; k < 4; k++) sink.span(wall, -1.6, plinth - 0.25 * (k + 1), S / 2 + 0.9 + k * 0.32, 1.6, plinth - 0.25 * k, S / 2 + 0.9 + (k + 1) * 0.32, { decor: true });
  // the cella: three arches across the front (the middle the door), one blind arch on each other face
  const aw = Math.min(1.5, S * 0.18), spring = y0 - 1.1;
  const holes: Partial<Record<FaceName, ArchHole[]>> = {
    front: [-S * 0.28, 0, S * 0.28].map((u) => ({ u, w: aw, y0: plinth, spring, form: 'pointed' as const })),
    back: [{ u: 0, w: aw, y0: plinth + 0.6, spring, form: 'pointed' as const }],
    left: [{ u: 0, w: aw, y0: plinth + 0.6, spring, form: 'pointed' as const }],
    right: [{ u: 0, w: aw, y0: plinth + 0.6, spring, form: 'pointed' as const }],
  };
  archedBody(sink, wall, 0, 0, S, S, plinth, y0, holes, 0.4);
  // the dark of the sanctum behind the arches (and the blind arches' backs)
  sink.span('structureWood', -S / 2 + 0.42, plinth, -S / 2 + 0.42, S / 2 - 0.42, y0 - 0.2, S / 2 - 0.42, { colour: DARK, decor: true });
  // the terracotta plaques: rows across the front between and over the arches, a band round the other faces
  const plaque = (x: number, y: number, z: number, w: number, h: number, nx: number, nz: number, i: number) => {
    const c = PLAQUE[i % PLAQUE.length];
    const ox = nx * 0.03, oz = nz * 0.03;
    sink.span('structureMetal', x - (nz !== 0 ? w / 2 : 0.02) + ox, y - h / 2, z - (nx !== 0 ? w / 2 : 0.02) + oz,
      x + (nz !== 0 ? w / 2 : 0.02) + ox, y + h / 2, z + (nx !== 0 ? w / 2 : 0.02) + oz, { colour: shade(c, 0.95 + (i % 5) * 0.03), decor: true, fine: true });
  };
  let n = 0;
  for (let row = 0; row < 3; row++) {
    const y = spring + 0.9 + row * 0.42;
    if (y > y0 - 0.25) break;
    for (let k = 0; k < 14; k++) plaque(-S / 2 + 0.35 + (S - 0.7) * (k + 0.5) / 14, y, S / 2 + 0.02, (S - 0.7) / 14 * 0.82, 0.34, 0, 1, n++);
  }
  for (const u of [-S * 0.43, -S * 0.14, S * 0.14, S * 0.43]) for (let row = 0; row < 5; row++) {
    plaque(u, plinth + 0.5 + row * 0.5, S / 2 + 0.02, 0.32, 0.4, 0, 1, n++);
  }
  // the lower char-chala, the upper cella and its roof, the finial
  const h1 = S * 0.27, yRoof1 = y0 + S * 0.32;
  charChala(sink, wall, S / 2 + 0.55, y0 + 0.2, Math.min(0.75, S * 0.09), h1, yRoof1, S * 0.07);
  const upperH = Math.max(1.3, S * 0.2), yUp = yRoof1 + upperH;
  sink.span(wall, -h1 + 0.05, yRoof1 - 0.3, -h1 + 0.05, h1 - 0.05, yUp, h1 - 0.05);
  for (const [u, nx, nz] of [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]] as const) {
    void u;
    const x = nx * (h1 - 0.03), z = nz * (h1 - 0.03);
    sink.span('structureWood', x - (nz ? 0.32 : 0.02), yRoof1 + 0.1, z - (nx ? 0.32 : 0.02), x + (nz ? 0.32 : 0.02), yUp - 0.35, z + (nx ? 0.32 : 0.02), { colour: DARK, decor: true });
  }
  const yApex = yUp + S * 0.33;
  charChala(sink, wall, h1 + 0.35, yUp + 0.12, Math.min(0.45, S * 0.06), 0, yApex, S * 0.05);
  revolve(sink, 'structureMetal', 0, 0, [[0.34, yApex - 0.15], [0.42, yApex + 0.12], [0.18, yApex + 0.42], [0.3, yApex + 0.7], [0.12, yApex + 1.0], [0.03, yApex + 1.45]], 10,
    { colour: FINIAL });
  return { parts: sink.finish(), tints: { stone: [TERRACOTTA[0] * 1.55, TERRACOTTA[1] * 1.55, TERRACOTTA[2] * 1.55] } };
};
