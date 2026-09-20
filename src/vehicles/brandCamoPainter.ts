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

/** Complete official mark, uniformly scaled; no reconstruction or substituted glyph. */
export function paintBrandMark(ctx: MaterialCanvasContext, brand: Brand, x: number, y: number, size: number) {
  const path = paths[brand] ??= new Path2D(pathData[brand]);
  const width = brand === 'openai' ? 267.198 : brand === 'xai' ? 1227 : 28;
  ctx.save();
  ctx.translate(x, y);
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

/** Four large, readable marks per tile; no new textures, meshes or asynchronous decoding. */
export function paintBrandCamo(ctx: MaterialCanvasContext, size: number, scheme: string, rng: () => number) {
  if (scheme !== 'openai' && scheme !== 'xai' && scheme !== 'gemini') return;
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 2; column++) {
      const x = (column * .5 + .25 + (rng() - .5) * .04) * size;
      const y = (row * .5 + .25 + (rng() - .5) * .04) * size;
      paintBrandMark(ctx, scheme, x, y, size * .31);
    }
  }
}
