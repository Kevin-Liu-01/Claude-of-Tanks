// src/world/maps/regional/weather.ts — per-building tone and weathering of the regional kits' masonry, render and
// roofs (regional-buildings lane, 2026-10-03; gauntlet wave 0: "box buildings with one tiled texture and no wear or
// ground contact").
//
// A kit builds its walls and roofs in the plain props buckets (plaster, plaster2, plaster3, stone, roof). After the
// build, this pass moves them into three vertex-coloured buckets that share those surfaces' textures
// (regionalPlaster, regionalStone, regionalRoof in props.ts) and paints every vertex:
//   - the building's own tint: one house's limewash a shade warmer, its neighbour's roof older and browner;
//   - ground contact: the splash and rising-damp band darkens the lowest metre of every wall toward the ground;
//   - occlusion: soffits, jetty undersides and the reveals of the openings (the `shade` the kernel recorded) darker;
//   - roofs: lichen and moss toward the eaves, sun-bleached toward the ridge.
// Wall triangles are cut at the band heights first so the gradient follows the band, not the whole wall. The cut
// keeps every edge it shares with a neighbour bit-identical (the intersection is taken from the canonical end of the
// edge), so the collision derivation's welded solids are unchanged.
import * as THREE from 'three';
import type { RegionalBucket, RegionalParts, Rgb } from './geometry.ts';

/** The plain bucket a kit fills → the vertex-coloured bucket the map renders it from. */
export const WEATHER_ROUTE: Readonly<Partial<Record<RegionalBucket, RegionalBucket>>> = Object.freeze({
  // each render keeps its own canvas (a kit's plaster2 / plaster3 tones are often other paints, not shades)
  plaster: 'regionalPlaster', plaster2: 'regionalPlaster2', plaster3: 'regionalPlaster3',
  stone: 'regionalStone', roof: 'regionalRoof',
});

export interface WeatherTints {
  plaster: Rgb;
  plaster2: Rgb;
  plaster3: Rgb;
  stone: Rgb;
  roof: Rgb;
}

/** A style's weathering: tint palettes (around 1.0, multiplied into the shared surface textures) and strengths. */
export interface WeatherPalette {
  plaster: readonly Rgb[];
  stone: readonly Rgb[];
  roof: readonly Rgb[];
  /** rising damp and splash at the wall foot, 0 (arid) – 1 (wet) */
  damp: number;
  /** moss and lichen toward the eaves, 0 – 1 */
  moss: number;
  /** the growth's colour multiplier (green moss inland, orange-yellow lichen on Atlantic slate and granite) */
  mossTint?: Rgb;
}

export const DEFAULT_WEATHER: WeatherPalette = Object.freeze({
  plaster: [[1, 1, 1], [1.0, 0.97, 0.9], [0.95, 0.95, 0.93], [1.0, 0.95, 0.88]],
  stone: [[1, 1, 1], [0.94, 0.93, 0.9], [1.0, 0.97, 0.92], [0.9, 0.9, 0.9]],
  roof: [[1, 1, 1], [0.9, 0.84, 0.78], [0.82, 0.8, 0.76], [1.04, 0.98, 0.94]],
  damp: 0.8, moss: 0.5,
} as WeatherPalette);

/**
 * (the map-revival lane, 2026-10-07) one plaster paint's linear colour over another's at the plaster print's mean:
 * props.ts makePlaster's base (hue 0.085, saturation 0.12, its mean lightness 0.49) as the texture's bytes, through each
 * tone as terrain.ts applyTone takes it (to HSL, the tone, back), then linear — the tint a folded paint's walls take in
 * the other's bucket. A kit's own paints (its surfaces.tones); a map that authored its own plaster2 / plaster3 tones over
 * a folding kit's would fold by the kit's.
 */
export function paintRatio(from: ((h: number, s: number, l: number) => readonly [number, number, number]) | undefined,
  to: ((h: number, s: number, l: number) => readonly [number, number, number]) | undefined): Rgb {
  const col = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const at = (tone: typeof from): number[] => {
    col.setHSL(0.085, 0.12, 0.49);
    const px = new Uint8ClampedArray([col.r * 255, col.g * 255, col.b * 255]);
    if (tone) {
      col.setRGB(px[0] / 255, px[1] / 255, px[2] / 255);
      col.getHSL(hsl);
      const [h, s, l] = tone(hsl.h, hsl.s, hsl.l);
      col.setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l)));
      px[0] = col.r * 255; px[1] = col.g * 255; px[2] = col.b * 255;
    }
    return [lin(px[0] / 255), lin(px[1] / 255), lin(px[2] / 255)];
  };
  const a = at(from), b = at(to);
  return [b[0] / Math.max(1e-4, a[0]), b[1] / Math.max(1e-4, a[1]), b[2] / Math.max(1e-4, a[2])];
}

/** Pick one building's tints from a palette (its own stream: the build stream is never touched). */
export function pickWeatherTints(palette: WeatherPalette, rng: () => number): WeatherTints {
  const pick = (list: readonly Rgb[]): Rgb => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  const jitter = (c: Rgb, k: number): Rgb => {
    const v = 1 + (rng() - 0.5) * k;
    return [c[0] * v, c[1] * v, c[2] * v];
  };
  // the render variants carry their own canvas tone: the building's tint only shifts them a shade
  const plaster = jitter(pick(palette.plaster), 0.06);
  return {
    plaster, plaster2: plaster, plaster3: plaster,
    stone: jitter(pick(palette.stone), 0.08),
    roof: jitter(pick(palette.roof), 0.08),
  };
}

/** Heights (building-local, above the placed ground at y = 0) where the wall-foot band changes slope. */
const DAMP_BREAKS = [0.35, 1.0, 1.8] as const;
/** The wall-foot darkening at each height (before the damp strength): piecewise linear between the rows. */
const DAMP_TABLE: ReadonlyArray<readonly [number, number]> = [[-0.6, 0.6], [0, 0.66], [0.35, 0.8], [1.0, 0.93], [1.8, 1]];

function dampK(y: number): number {
  if (y <= DAMP_TABLE[0][0]) return DAMP_TABLE[0][1];
  for (let i = 1; i < DAMP_TABLE.length; i++) {
    const [y1, k1] = DAMP_TABLE[i];
    if (y <= y1) {
      const [y0, k0] = DAMP_TABLE[i - 1];
      return k0 + (k1 - k0) * (y - y0) / (y1 - y0);
    }
  }
  return 1;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Vert { p: [number, number, number]; n: [number, number, number]; uv: [number, number]; s: number }

function lerpVert(a: Vert, b: Vert, y: number): Vert {
  // canonical edge direction: both triangles sharing the edge compute the identical point
  const forward = a.p[0] < b.p[0] || (a.p[0] === b.p[0] && (a.p[1] < b.p[1] || (a.p[1] === b.p[1] && a.p[2] <= b.p[2])));
  const [s, e] = forward ? [a, b] : [b, a];
  const t = (y - s.p[1]) / (e.p[1] - s.p[1]);
  return {
    p: [s.p[0] + (e.p[0] - s.p[0]) * t, y, s.p[2] + (e.p[2] - s.p[2]) * t],
    n: [s.n[0] + (e.n[0] - s.n[0]) * t, s.n[1] + (e.n[1] - s.n[1]) * t, s.n[2] + (e.n[2] - s.n[2]) * t],
    uv: [s.uv[0] + (e.uv[0] - s.uv[0]) * t, s.uv[1] + (e.uv[1] - s.uv[1]) * t],
    s: s.s + (e.s - s.s) * t,
  };
}

/** Split a convex polygon by the plane y = h into its parts below and above. */
function splitAt(poly: Vert[], h: number): [Vert[], Vert[]] {
  const below: Vert[] = [], above: Vert[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ab = a.p[1] < h, bb = b.p[1] < h;
    if (a.p[1] === h) { below.push(a); above.push(a); } else if (ab) below.push(a); else above.push(a);
    if (a.p[1] !== h && b.p[1] !== h && ab !== bb) {
      const m = lerpVert(a, b, h);
      below.push(m); above.push(m);
    }
  }
  return [below.length >= 3 ? below : [], above.length >= 3 ? above : []];
}

/** Read a non-indexed regional geometry's triangles. */
function readTriangles(geometry: THREE.BufferGeometry): Vert[][] {
  const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  const shade = geometry.getAttribute('shade');
  const out: Vert[][] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const tri: Vert[] = [];
    for (let k = 0; k < 3; k++) {
      const j = i + k;
      tri.push({ p: [pos.getX(j), pos.getY(j), pos.getZ(j)], n: [nor.getX(j), nor.getY(j), nor.getZ(j)],
        uv: [uv.getX(j), uv.getY(j)], s: shade ? shade.getX(j) : 1 });
    }
    out.push(tri);
  }
  return out;
}

export interface WeatherOptions {
  damp: number;
  moss: number;
  mossTint?: Rgb;
  /**
   * The map-revival lane (2026-10-07, Amberford's cost trim; the coordinator's ruling): a kit that folds its third
   * plaster paint into its second's bucket (ArchitectureStyle.foldThirdPlaster) gives its plaster3 walls the
   * regionalPlaster2 bucket under this colour ratio (the third paint over the second at the plaster print's mean, linear:
   * paintRatio) — the two renders share one relief and differ only in albedo tone, so one bucket draws both. Unset,
   * every wall keeps its own bucket as before.
   */
  plaster3Fold?: Rgb;
}

/**
 * Move a finished building's walls and roofs into the vertex-coloured buckets with their tint and weathering. The
 * input geometries are disposed; every other bucket passes through untouched.
 */
export function weatherRegionalParts(parts: RegionalParts, tints: WeatherTints, options: WeatherOptions): RegionalParts {
  // the roof's own height range: moss gathers at its lowest courses
  let roofLo = Infinity, roofHi = -Infinity;
  for (const geometry of parts.roof) {
    const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) < 0.3) continue;
      roofLo = Math.min(roofLo, pos.getY(i)); roofHi = Math.max(roofHi, pos.getY(i));
    }
  }
  const roofSpan = Math.max(0.5, roofHi - roofLo);
  const damp = Math.min(1, Math.max(0, options.damp)), moss = Math.min(1, Math.max(0, options.moss));
  const MOSS: Rgb = options.mossTint ?? [0.84, 0.92, 0.74];
  for (const [source, target] of Object.entries(WEATHER_ROUTE) as Array<[RegionalBucket, RegionalBucket]>) {
    const list = parts[source];
    if (!list.length) continue;
    const tint = tints[source as keyof WeatherTints];
    const isRoof = source === 'roof';
    // (the third paint folded into the second's bucket: its own tint and weathering, then the paint's colour ratio)
    const fold = source === 'plaster3' && options.plaster3Fold ? options.plaster3Fold : null;
    const into: RegionalBucket = fold ? 'regionalPlaster2' : target;
    for (const geometry of list) {
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
      const emit = (v: Vert) => {
        pos.push(v.p[0], v.p[1], v.p[2]);
        nor.push(v.n[0], v.n[1], v.n[2]);
        uv.push(v.uv[0], v.uv[1]);
        const ny = v.n[1];
        let k: number, c: Rgb = tint;
        if (isRoof) {
          if (ny < -0.5) k = 0.58;
          else {
            const t = (v.p[1] - roofLo) / roofSpan;
            k = 0.8 + 0.2 * smooth(0, 0.6, t);
            const m = moss * 0.6 * (1 - smooth(0, 0.45, t)) * (ny > 0.3 ? 1 : 0.4);
            c = [tint[0] * (1 + (MOSS[0] - 1) * m), tint[1] * (1 + (MOSS[1] - 1) * m), tint[2] * (1 + (MOSS[2] - 1) * m)];
          }
        } else if (ny > 0.6) k = 1;
        else if (ny < -0.6) k = 0.62;
        else k = 1 - (1 - dampK(v.p[1])) * damp;
        k *= v.s;
        if (fold) col.push(Math.min(1.2, c[0] * k) * fold[0], Math.min(1.2, c[1] * k) * fold[1], Math.min(1.2, c[2] * k) * fold[2]);
        else col.push(Math.min(1.2, c[0] * k), Math.min(1.2, c[1] * k), Math.min(1.2, c[2] * k));
      };
      for (const tri of readTriangles(geometry)) {
        let pieces: Vert[][] = [tri];
        if (!isRoof) {
          for (const h of DAMP_BREAKS) {
            const next: Vert[][] = [];
            for (const poly of pieces) {
              let lo = Infinity, hi = -Infinity;
              for (const v of poly) { lo = Math.min(lo, v.p[1]); hi = Math.max(hi, v.p[1]); }
              if (lo >= h || hi <= h) { next.push(poly); continue; }
              const [b, a] = splitAt(poly, h);
              if (b.length) next.push(b);
              if (a.length) next.push(a);
            }
            pieces = next;
          }
        }
        for (const poly of pieces) for (let i = 1; i + 1 < poly.length; i++) { emit(poly[0]); emit(poly[i]); emit(poly[i + 1]); }
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      out.userData = { ...geometry.userData };
      geometry.dispose();
      parts[into].push(out);
    }
    parts[source] = [];
  }
  // a shade attribute left on any other bucket (a kit that dressed a non-weathered bucket) never reaches the merge
  for (const list of Object.values(parts)) for (const geometry of list) if (geometry.getAttribute('shade')) geometry.deleteAttribute('shade');
  return parts;
}
