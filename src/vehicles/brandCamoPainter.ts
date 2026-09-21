import { GEMINI_BRAND_PATH, OPENAI_BRAND_PATH, X_BRAND_PATH } from './brandCamoMarks.ts';
import type { MaterialCanvasContext } from './materialPainter.ts';

type Brand = 'openai' | 'xai' | 'gemini';
const paths: Partial<Record<Brand, Path2D>> = {};
const pathData = { openai: OPENAI_BRAND_PATH, xai: X_BRAND_PATH, gemini: GEMINI_BRAND_PATH };

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

const isBrand = (scheme: string): scheme is Brand => scheme === 'openai' || scheme === 'xai' || scheme === 'gemini';

/** Complete official mark, uniformly scaled (optionally rotated and faded); no reconstruction or substituted glyph. */
export function paintBrandMark(
  ctx: MaterialCanvasContext, brand: Brand, x: number, y: number, size: number, rotation = 0, alpha = 1,
) {
  const path = paths[brand] ??= new Path2D(pathData[brand]);
  const width = brand === 'openai' ? 267.198 : brand === 'xai' ? 1227 : 28;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = ctx.globalAlpha * alpha;
  ctx.translate(x, y);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.scale(size / width, size / width);
  if (brand === 'openai') ctx.translate(-280.293, -359.448);
  else if (brand === 'xai') ctx.translate(-600, -613.5);
  else ctx.translate(-14, -14);
  if (brand === 'gemini') paintGeminiMark(ctx, path);
  else {
    ctx.fillStyle = brand === 'openai' ? '#000000' : '#ffffff';
    ctx.fill(path);
  }
  ctx.restore();
}

/** One mark wrapped across the tile seam: the copies at ±tile land wherever the mark's disc crosses an edge, so the
 * repeating texture never shows a cut mark or a bare seam. */
function paintWrappedBrandMark(
  ctx: MaterialCanvasContext, brand: Brand, tile: number, x: number, y: number, size: number, rotation: number, alpha: number,
) {
  const reach = size * 0.62;
  for (const dx of [-tile, 0, tile]) {
    for (const dy of [-tile, 0, tile]) {
      const cx = x + dx, cy = y + dy;
      if (cx + reach < 0 || cx - reach > tile || cy + reach < 0 || cy - reach > tile) continue;
      paintBrandMark(ctx, brand, cx, cy, size, rotation, alpha);
    }
  }
}

/**
 * Sporadic composition (owner 2026-09-21: "make the openai x and gemini camos more sporadic and random then
 * predictably placed. the claude and claude spark do a good job of feeling like a fun pattern instead of repeating
 * an svg predictably"): the same composition language as the Claude and Claude Spark schemes — one hero mark, four
 * mediums on a loosely jittered 2×2 with alternating weight, then a sprinkle of small marks at any angle — every
 * mark the complete official glyph, wrapped across the tile seam. No new textures, meshes or asynchronous decoding;
 * the stream is the pattern-keyed camo rng, so one seed lays out identically on every hull.
 */
export function paintBrandCamo(ctx: MaterialCanvasContext, size: number, scheme: string, rng: () => number) {
  if (!isBrand(scheme)) return;
  const stamp = (x: number, y: number, s: number, rotation: number, alpha: number): void =>
    paintWrappedBrandMark(ctx, scheme, size, x, y, s, rotation, alpha);
  // the hero mark anchors the tile
  stamp(size * (0.3 + rng() * 0.4), size * (0.3 + rng() * 0.4), size * (0.46 + rng() * 0.12), (rng() - 0.5) * 0.5, 1);
  // mediums: one per loose quadrant, wandering up to 30 % of a cell, alternating full and faded weight
  const cell = size / 2;
  for (let gy = 0; gy < 2; gy++) {
    for (let gx = 0; gx < 2; gx++) {
      const x = (gx + 0.5 + (rng() - 0.5) * 0.6) * cell;
      const y = (gy + 0.5 + (rng() - 0.5) * 0.6) * cell;
      stamp(x, y, cell * (0.40 + rng() * 0.14), (rng() - 0.5) * 0.6, (gx + gy) % 2 ? 0.66 : 0.92);
    }
  }
  // sprinkle: six to nine small marks anywhere, any angle
  const sprinkles = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < sprinkles; i++) {
    stamp(rng() * size, rng() * size, size * (0.045 + rng() * 0.045), (rng() - 0.5) * 1.2, 0.55 + rng() * 0.25);
  }
}
