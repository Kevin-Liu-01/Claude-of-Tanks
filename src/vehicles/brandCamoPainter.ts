import { GEMINI_BRAND_PATH, GT_BRAND_PATH, OPENAI_BRAND_PATH, X_BRAND_PATH } from './brandCamoMarks.ts';
import type { MaterialCanvasContext } from './materialPainter.ts';

type Brand = 'openai' | 'xai' | 'gemini' | 'gt';
/** gt (272, owner: "used this new logo for both"): the General Translation symbol, a 487-unit circle centred on
 * (243.5, 243.5). Scaled from this width so the tile keeps the ink it carried with the earlier marks. */
const GT_MARK_WIDTH = 656;
const paths: Partial<Record<Brand, Path2D>> = {};
const pathData = { openai: OPENAI_BRAND_PATH, xai: X_BRAND_PATH, gemini: GEMINI_BRAND_PATH, gt: GT_BRAND_PATH };

function paintGeminiMark(ctx: MaterialCanvasContext, path: Path2D) {
  // The official v002 SVG's radial-gradient coordinate transform and stops.
  ctx.save();
  ctx.clip(path);
  ctx.translate(2.77876, 11.3795);
  ctx.rotate(18.6832 * Math.PI / 180);
  ctx.scale(29.8025, 238.737);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(.0671246, '#9168C0');
  gradient.addColorStop(.342551, '#5684D1');
  gradient.addColorStop(.672076, '#1BA1E3');
  ctx.fillStyle = gradient;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
}

const isBrand = (scheme: string): scheme is Brand => scheme === 'openai' || scheme === 'xai' || scheme === 'gemini' || scheme === 'gt';

/** Uniform scale width per mark, in source units: a stamp of `size` maps this many source units onto `size` pixels. */
const MARK_WIDTH: Record<Brand, number> = { openai: 267.198, xai: 1227, gemini: 28, gt: GT_MARK_WIDTH };

/** Complete official mark, uniformly scaled (optionally rotated and faded); no reconstruction or substituted glyph. */
export function paintBrandMark(
  ctx: MaterialCanvasContext, brand: Brand, x: number, y: number, size: number, rotation = 0, alpha = 1,
) {
  const path = paths[brand] ??= new Path2D(pathData[brand]);
  const width = MARK_WIDTH[brand];
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = ctx.globalAlpha * alpha;
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.scale(size / width, size / width);
  if (brand === 'openai') ctx.translate(-280.293, -359.448);
  else if (brand === 'xai') ctx.translate(-600, -613.5);
  else if (brand === 'gt') ctx.translate(-243.5, -243.5);
  else ctx.translate(-14, -14);
  if (brand === 'gemini') paintGeminiMark(ctx, path);
  else {
    ctx.fillStyle = brand === 'openai' ? '#000000' : '#ffffff';
    // gt: the symbol's own even-odd rule keeps the G and T cuts open
    ctx.fill(path, brand === 'gt' ? 'evenodd' : 'nonzero');
  }
  ctx.restore();
}

/**
 * Each mark's bounding circle as a fraction of its stamp size: the farthest inked pixel from the stamp centre at any
 * rotation (measured by rasterizing the mark; brandCamo.selftest checks no ink falls outside it). The GT symbol is a
 * circle of 487 units, so its radius is 243.5 / GT_MARK_WIDTH.
 */
export const MARK_RADIUS: Record<Brand, number> = { openai: 0.51, xai: 0.70, gemini: 0.50, gt: 243.5 / GT_MARK_WIDTH + 0.002 };

/** One placed stamp of the composition; `radius` is its bounding circle in tile pixels. */
interface BrandStamp { x: number; y: number; size: number; rotation: number; alpha: number; radius: number }

/** The clear gap between two stamps' bounding circles, as a fraction of the tile. */
const STAMP_GAP = 0.012;

/** Shortest distance between two points on the wrapped (toroidal) tile: a mark near one edge meets marks near the
 * opposite edge through the seam, so the tiling can never stack two marks. */
function wrappedDistance(ax: number, ay: number, bx: number, by: number, tile: number): number {
  let dx = Math.abs(ax - bx) % tile, dy = Math.abs(ay - by) % tile;
  if (dx > tile / 2) dx = tile - dx;
  if (dy > tile / 2) dy = tile - dy;
  return Math.hypot(dx, dy);
}

/** One mark wrapped across the tile seam: the copies at ±tile land wherever the mark's disc crosses an edge, so the
 * repeating texture never shows a cut mark or a bare seam. */
function paintWrappedBrandMark(ctx: MaterialCanvasContext, brand: Brand, tile: number, stamp: BrandStamp) {
  const { x, y, radius: reach } = stamp;
  for (const dx of [-tile, 0, tile]) {
    for (const dy of [-tile, 0, tile]) {
      const cx = x + dx, cy = y + dy;
      if (cx + reach < 0 || cx - reach > tile || cy + reach < 0 || cy - reach > tile) continue;
      paintBrandMark(ctx, brand, cx, cy, stamp.size, stamp.rotation, stamp.alpha);
    }
  }
}

/** Tries per stamp before it is dropped; every SHRINK_EVERY failed tries the candidate shrinks by SHRINK. */
const TRIES = 96, SHRINK_EVERY = 8, SHRINK = 0.88;

/**
 * Sporadic composition (owner 2026-09-21: "make the openai x and gemini camos more sporadic and random then
 * predictably placed. the claude and claude spark do a good job of feeling like a fun pattern instead of repeating
 * an svg predictably"): the same composition language as the Claude and Claude Spark schemes — one hero mark, four
 * mediums on a loosely jittered 2×2 with alternating weight, then a sprinkle of small marks at any angle — every
 * mark the complete official glyph, wrapped across the tile seam.
 *
 * No overlap (owner 272: "for the gt camo, dont make the logo keep overlapping with other logos"): each candidate is
 * rejection-sampled against every placed stamp's bounding circle plus STAMP_GAP, measured across the wrapped seam, so
 * no two marks touch on the tile or where it repeats. A candidate that does not fit is redrawn (a medium that keeps
 * colliding may then land anywhere on the tile) and, every few tries, shrunk; one that never fits is dropped. All four
 * brand finishes share this layout. The stream is the pattern-keyed camo rng, so one seed lays out identically on
 * every hull.
 */
export function layoutBrandCamo(size: number, brand: Brand, rng: () => number): BrandStamp[] {
  const placed: BrandStamp[] = [];
  const gap = size * STAMP_GAP, k = MARK_RADIUS[brand];
  const place = (draw: (attempt: number) => Omit<BrandStamp, 'radius'>): void => {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const candidate = draw(attempt);
      const s = candidate.size * SHRINK ** Math.floor(attempt / SHRINK_EVERY), radius = s * k;
      if (placed.every(p => wrappedDistance(candidate.x, candidate.y, p.x, p.y, size) >= radius + p.radius + gap)) {
        placed.push({ ...candidate, size: s, radius });
        return;
      }
    }
  };
  // the hero mark anchors the tile
  place(() => ({ x: size * (0.3 + rng() * 0.4), y: size * (0.3 + rng() * 0.4), size: size * (0.46 + rng() * 0.12),
    rotation: (rng() - 0.5) * 0.5, alpha: 1 }));
  // mediums: one per loose quadrant, wandering up to 30 % of a cell, alternating full and faded weight
  const cell = size / 2;
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      place(attempt => {
        const wander = attempt < SHRINK_EVERY;
        const x = wander ? (gx + 0.5 + (rng() - 0.5) * 0.6) * cell : rng() * size;
        const y = wander ? (gy + 0.5 + (rng() - 0.5) * 0.6) * cell : rng() * size;
        return { x, y, size: cell * (0.40 + rng() * 0.14), rotation: (rng() - 0.5) * 0.6, alpha: (gx + gy) % 2 ? 0.66 : 0.92 };
      });
    }
  }
  // sprinkle: six to nine small marks anywhere, any angle
  const sprinkles = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < sprinkles; i++) {
    place(() => ({ x: rng() * size, y: rng() * size, size: size * (0.045 + rng() * 0.045),
      rotation: (rng() - 0.5) * 1.2, alpha: 0.55 + rng() * 0.25 }));
  }
  return placed;
}

export function paintBrandCamo(ctx: MaterialCanvasContext, size: number, scheme: string, rng: () => number) {
  if (!isBrand(scheme)) return;
  for (const stamp of layoutBrandCamo(size, scheme, rng)) paintWrappedBrandMark(ctx, scheme, size, stamp);
}
