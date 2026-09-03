/**
 * Demand-loaded exact camouflage swatch renderer. This decorative canvas
 * work stays outside the garage-critical graph; garage.ts supplies an
 * immediate deterministic placeholder until this module is resident.
 */
import { resolveCamoVisual, CLAUDE_CODE_MARK, CLAUDE_SPARK_MARK }
  from '../vehicles/materials.ts';
import { paintCustomCamoStrokes } from '../vehicles/customCamoCanvas.ts';
import type { FleetTankSpec } from '../vehicles/specContracts.ts';

type SwatchRng = () => number;
type SwatchRgb = [number, number, number];
type CustomCamoStrokes = Parameters<typeof paintCustomCamoStrokes>[1];

interface CamoVisual {
  base: string;
  weather?: string;
  patches?: string[];
  scheme?: string;
  patternRepeat?: number;
  drawRepeatX?: number;
  drawRepeatY?: number;
  drawRotation?: number;
  drawMirror?: boolean;
  drawStrokes?: CustomCamoStrokes;
  bandAngle?: number;
  patchK?: number;
  rainK?: number;
}

// --- CAMO PICKER SECTION: swatch painter ------------------------------------
// Paints a 64px-class preview tile of the ACTUAL resolved pattern — palette
// and scheme come from materials.resolveCamoVisual, and each scheme branch
// mirrors the corresponding paintCamo language at tile scale.
function swRngFactory(a: number): SwatchRng {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const swHex = (h: string): SwatchRgb => {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const swRgb = (c: SwatchRgb, a = 1): string =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const swMix = (a: SwatchRgb, b: SwatchRgb, t: number): SwatchRgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function swBlob(
  c: CanvasRenderingContext2D,
  rng: SwatchRng,
  x: number,
  y: number,
  r: number,
): void {
  const n = 8;
  const px = [], py = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.62 + rng() * 0.6);
    px.push(x + Math.cos(a) * rr);
    py.push(y + Math.sin(a) * rr * 0.85);
  }
  c.beginPath();
  c.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    c.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
  }
  c.closePath();
}

function swPoly(
  c: CanvasRenderingContext2D,
  rng: SwatchRng,
  x: number,
  y: number,
  r: number,
  sides: number,
): void {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + rng() * 0.6;
    const rr = r * (0.55 + rng() * 0.55);
    const vx = x + Math.cos(a) * rr, vy = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(vx, vy); else c.lineTo(vx, vy);
  }
  c.closePath();
}


interface SwatchPaintContext {
  c: CanvasRenderingContext2D;
  rng: SwatchRng;
  vis: CamoVisual;
  base: SwatchRgb;
  patches: SwatchRgb[];
  W: number;
  H: number;
  S: number;
  scheme: string;
}

interface SwatchSchemeHandler {
  paint(context: SwatchPaintContext): void;
  requiresPatches: boolean;
}

function paintDrawnScheme(ctx: SwatchPaintContext): void {
  const { c, vis, base, patches, W, H } = ctx;
    const repeatX = Math.max(1, Math.min(8, vis.drawRepeatX || 1));
    const repeatY = Math.max(1, Math.min(8, vis.drawRepeatY || 1));
    const cellW = W / repeatX;
    const cellH = H / repeatY;
    const angle = (vis.drawRotation || 0) * Math.PI / 180;
    for (let gy = -1; gy <= repeatY; gy++) {
      for (let gx = -1; gx <= repeatX; gx++) {
        c.save();
        c.translate((gx + 0.5) * cellW, (gy + 0.5) * cellH);
        c.rotate(angle);
        if (vis.drawMirror && ((gx + gy) & 1)) c.scale(-1, 1);
        c.translate(-cellW / 2, -cellH / 2);
        paintCustomCamoStrokes(c, vis.drawStrokes || [], {
          width: cellW,
          height: cellH,
          colorA: swRgb(patches[0], 0.97),
          colorB: swRgb(patches[1] || patches[0], 0.97),
          eraseColor: swRgb(base),
        });
        c.restore();
      }
    }
}

function paintNatoScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    const black = patches[0], brown = patches[1] || patches[0];
    for (let i = 0; i < 6; i++) {
      const r = S * (i < 2 ? 0.085 : 0.04) * (0.8 + rng() * 0.5);
      swBlob(c, rng, rng() * W, rng() * H, r);
      c.fillStyle = swRgb(brown, 0.96);
      c.fill();
    }
    for (let i = 0; i < 5; i++) {
      const r = S * (i < 2 ? 0.06 : 0.032) * (0.8 + rng() * 0.5);
      swBlob(c, rng, rng() * W, rng() * H, r);
      c.fillStyle = swRgb(black, 0.94);
      c.fill();
    }
}

function paintDesertScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S } = ctx;
    const dark = patches[0], mid = patches[1] || patches[0];
    const pale = patches[2] || swMix(base, [255, 250, 235], 0.35);
    for (let i = 0; i < 3; i++) { // wind bands
      const y0 = rng() * H;
      c.strokeStyle = swRgb(swMix(rng() < 0.5 ? mid : pale, base, 0.45), 0.3);
      c.lineWidth = S * (0.05 + rng() * 0.05);
      c.beginPath();
      c.moveTo(-4, y0);
      c.quadraticCurveTo(W / 2, y0 + (rng() - 0.5) * H * 0.8, W + 4, y0 + (rng() - 0.5) * H);
      c.stroke();
    }
    for (let i = 0; i < 5; i++) {
      swPoly(c, rng, rng() * W, rng() * H, S * (0.05 + rng() * 0.05), 7);
      c.fillStyle = swRgb(i % 2 ? mid : dark, 0.92);
      c.fill();
    }
    for (let i = 0; i < 8; i++) {
      swPoly(c, rng, rng() * W, rng() * H, S * (0.012 + rng() * 0.02), 5);
      c.fillStyle = swRgb([dark, mid, pale][(rng() * 3) | 0], 0.85);
      c.fill();
    }
}

function paintWinterScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    const under: SwatchRgb = patches.length ? patches[0] : [70, 80, 55];
    for (let i = 0; i < 40; i++) { // brushed whitewash strokes
      const x0 = rng() * W, y0 = rng() * H, len = S * (0.05 + rng() * 0.1);
      const w2 = S * (0.01 + rng() * 0.02);
      c.strokeStyle = `rgba(242,245,239,${0.25 + rng() * 0.2})`;
      c.lineWidth = w2;
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + (rng() - 0.5) * w2 * 3, y0 + len * 0.5, x0 + (rng() - 0.5) * w2 * 4, y0 + len);
      c.stroke();
    }
    for (let i = 0; i < 8; i++) { // worn-through factory paint
      swBlob(c, rng, rng() * W, rng() * H, S * (0.012 + rng() * 0.025));
      c.fillStyle = swRgb(under, 0.3 + rng() * 0.35);
      c.fill();
    }
}

function paintDigitalFleckScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S, scheme } = ctx;
    if (scheme === 'digital') {
      const cell = 6; // coarse enough to read as digital at tile size
      const cols = [base, ...patches];
      for (let y = 0; y < H; y += cell) {
        for (let x = 0; x < W; x += cell) {
          if (rng() < 0.55) continue; // let base show through in runs
          c.fillStyle = swRgb(cols[(rng() * cols.length) | 0], 0.9);
          c.fillRect(x, y, cell * (1 + ((rng() * 2) | 0)), cell);
        }
      }
    } else {
      for (let i = 0; i < 130; i++) { // flecktarn dot field
        const col = patches[(rng() * patches.length) | 0];
        c.fillStyle = swRgb(col, 0.85);
        c.beginPath();
        c.arc(rng() * W, rng() * H, S * 0.004 * (0.8 + rng() * 1.6), 0, Math.PI * 2);
        c.fill();
      }
    }
}

function paintStripesScheme(ctx: SwatchPaintContext): void {
  const { c, rng, vis, base, patches, W, H, S } = ctx;
    // camo r8: bands, not blobs — the r5 painter rewrite made 'stripes'
    // broad sprayed BANDS and the old blob swatch stopped matching the hull.
    // vis.bandAngle (naval waves) pins the direction like the painter does.
    const ang = vis.bandAngle != null ? vis.bandAngle + 0.05 : 0.9 + rng() * 0.5;
    for (let i = 0; i < 6; i++) {
      const col = swMix(patches[i % patches.length], base, 0.1);
      const w2 = S * (0.035 + rng() * 0.03);
      const x0 = rng() * W, y0 = rng() * H, len = S * 0.5;
      c.strokeStyle = swRgb(col, 0.8);
      c.lineWidth = w2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * len / 2, y0 - Math.sin(ang) * len / 2);
      c.quadraticCurveTo(x0 + (rng() - 0.5) * w2 * 2, y0 + (rng() - 0.5) * w2 * 2,
        x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2);
      c.stroke();
    }
}

function paintAmbushScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S } = ctx;
    for (let i = 0; i < 6; i++) {
      const col = swMix(patches[i % patches.length], base, 0.1);
      swBlob(c, rng, rng() * W, rng() * H, S * (0.04 + rng() * 0.05));
      c.fillStyle = swRgb(col, 0.85);
      c.fill();
    }
    for (let i = 0; i < 90; i++) {
      c.fillStyle = swRgb([base, ...patches][(rng() * (patches.length + 1)) | 0], 0.9);
      c.beginPath();
      c.arc(rng() * W, rng() * H, 0.8 + rng() * 0.9, 0, Math.PI * 2);
      c.fill();
    }
}

function paintMerdcScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S } = ctx;
    // two dominant fields + sand/black accents (camo r8)
    const dom = patches[0], sand = patches[1] || base, black = patches[2] || [43, 43, 40];
    for (let i = 0; i < 4; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * (0.06 + rng() * 0.05));
      c.fillStyle = swRgb(dom, 0.95);
      c.fill();
    }
    for (let i = 0; i < 3; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * (0.02 + rng() * 0.02));
      c.fillStyle = swRgb(i < 2 ? sand : black, 0.92);
      c.fill();
    }
}

function paintBlotchScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    for (let i = 0; i < 9; i++) {
      const col = patches[i % patches.length];
      swBlob(c, rng, rng() * W, rng() * H, S * (0.03 + rng() * 0.045));
      c.fillStyle = swRgb(col, 0.9);
      c.fill();
    }
}

function paintBlocksScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    for (let i = 0; i < 8; i++) {
      const col = patches[(rng() * patches.length) | 0];
      const w2 = S * (0.04 + rng() * 0.07), h2 = S * (0.03 + rng() * 0.05);
      c.fillStyle = swRgb(col, 0.94);
      c.fillRect(rng() * W - w2 / 2, rng() * H - h2 / 2, w2, h2);
    }
}

function paintWashwornScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S } = ctx;
    const under: SwatchRgb = patches.length ? patches[0] : [70, 80, 55];
    for (let i = 0; i < 26; i++) { // opaque mop swathes
      swBlob(c, rng, rng() * W, rng() * H, S * (0.025 + rng() * 0.03));
      c.fillStyle = swRgb(swMix(base, [255, 255, 255], 0.06), 0.7);
      c.fill();
    }
    for (let i = 0; i < 7; i++) { // worn-through factory bands
      swBlob(c, rng, rng() * W, rng() * H, S * (0.018 + rng() * 0.022));
      c.fillStyle = swRgb(under, 0.55 + rng() * 0.25);
      c.fill();
    }
}

function paintCaunterScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    const ang = 0.7;
    for (let i = 0; i < 4; i++) {
      const col = patches[i % patches.length];
      const w2 = S * (0.03 + rng() * 0.025);
      const x0 = rng() * W, y0 = rng() * H;
      c.strokeStyle = swRgb(col, 0.94);
      c.lineWidth = w2;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * S * 0.3, y0 - Math.sin(ang) * S * 0.3);
      c.lineTo(x0 + Math.cos(ang) * S * 0.3, y0 + Math.sin(ang) * S * 0.3);
      c.stroke();
    }
}

function paintSplinterScheme(ctx: SwatchPaintContext): void {
  const { c, rng, vis, patches, W, H, S } = ctx;
    // camo r2: 'm90' rides this painter with rainK 0 (no Regenstreifen) and
    // larger wedges — mirror both knobs at tile scale.
    const pk = vis.patchK || 1;
    for (let i = 0; i < 6; i++) {
      const col = patches[i % patches.length];
      swPoly(c, rng, rng() * W, rng() * H, S * pk * (0.035 + rng() * 0.04), 5);
      c.fillStyle = swRgb(col, 0.95);
      c.fill();
    }
    if (vis.rainK !== 0) {
      c.strokeStyle = swRgb(swMix(patches[0], [40, 44, 38], 0.55), 0.7);
      c.lineWidth = 1;
      for (let i = 0; i < 26; i++) { // rain strokes
        const x0 = rng() * W, y0 = rng() * H, len = 4 + rng() * 6;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x0 + len * 0.45, y0 + len);
        c.stroke();
      }
    }
}

function paintDazzleScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    for (let i = 0; i < 7; i++) {
      const col = patches[i % patches.length];
      const ang = (i % 3 === 2 ? 1 : -1) * (0.6 + rng() * 0.3);
      const w2 = S * (0.025 + rng() * 0.03);
      const x0 = rng() * W, y0 = rng() * H;
      c.strokeStyle = swRgb(col, 0.96);
      c.lineWidth = w2;
      c.lineCap = 'butt';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * S * 0.35, y0 - Math.sin(ang) * S * 0.35);
      c.lineTo(x0 + Math.cos(ang) * S * 0.35, y0 + Math.sin(ang) * S * 0.35);
      c.stroke();
    }
}

function paintTigerstripeScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S } = ctx;
    // camo r2: jagged near-horizontal claw strokes — dark dominant, thin
    // pale interstripes (mirrors the tigerstripe painter at tile scale)
    const dark = patches[0];
    const pale = patches[1] || swMix(base, [214, 208, 168], 0.4);
    const drawStripe = (col: SwatchRgb, w2: number, alpha: number): void => {
      const x0 = rng() * W, y0 = rng() * H, len = S * (0.28 + rng() * 0.2);
      const ang = 0.12 + (rng() - 0.5) * 0.3;
      c.strokeStyle = swRgb(col, alpha);
      c.lineWidth = w2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0 - Math.cos(ang) * len / 2, y0 - Math.sin(ang) * len / 2);
      c.quadraticCurveTo(x0 + (rng() - 0.5) * 8, y0 + (rng() - 0.5) * 10,
        x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2);
      c.stroke();
    };
    for (let i = 0; i < 4; i++) drawStripe(pale, 1 + rng() * 1.4, 0.85);
    for (let i = 0; i < 6; i++) drawStripe(dark, 2.5 + rng() * 3, 0.94);
}

function paintChip6Scheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H, S } = ctx;
    // camo r2: choc-chip — wavy bands + pale cookies rimmed with black chips
    const bDark = patches[0], bPale = patches[1] || base;
    const cookie = patches[2] || swMix(base, [228, 232, 230], 0.55);
    const chip = patches[3] || [51, 52, 47];
    for (let i = 0; i < 3; i++) {
      const y0 = rng() * H;
      c.strokeStyle = swRgb(swMix(i % 2 ? bDark : bPale, base, 0.12), 0.85);
      c.lineWidth = S * (0.05 + rng() * 0.04);
      c.beginPath();
      c.moveTo(-4, y0);
      c.quadraticCurveTo(W / 2, y0 + (rng() - 0.5) * H * 0.9, W + 4, y0 + (rng() - 0.5) * H * 0.7);
      c.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = rng() * W, y = rng() * H, r = 3.4 + rng() * 2.6;
      swBlob(c, rng, x, y, r);
      c.fillStyle = swRgb(cookie, 0.94);
      c.fill();
      c.fillStyle = swRgb(chip, 0.92);
      const nk = 2 + ((rng() * 2) | 0);
      for (let j = 0; j < nk; j++) {
        const a2 = rng() * Math.PI * 2;
        c.beginPath();
        c.arc(x + Math.cos(a2) * r * 0.7, y + Math.sin(a2) * r * 0.55, 0.9 + rng() * 0.7, 0, Math.PI * 2);
        c.fill();
      }
    }
}

function paintBrushScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    // camo r2: DPM — directional brush strokes, green/brown then black on top
    const flow = 0.6 + rng() * 0.5;
    const strokeOne = (col: SwatchRgb, w2: number, alpha: number): void => {
      const x0 = rng() * W, y0 = rng() * H, len = S * (0.16 + rng() * 0.14);
      const a = flow + (rng() - 0.5) * 0.6 + (rng() < 0.18 ? Math.PI / 2 : 0);
      c.strokeStyle = swRgb(col, alpha);
      c.lineWidth = w2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 6,
        y0 + Math.sin(a) * len * 0.5 + (rng() - 0.5) * 6,
        x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      c.stroke();
    };
    const green = patches[0], brown = patches[1] || patches[0], black = patches[2] || null;
    for (let i = 0; i < 5; i++) strokeOne(green, 2.6 + rng() * 2.4, 0.92);
    for (let i = 0; i < 4; i++) strokeOne(brown, 2.4 + rng() * 2.2, 0.92);
    if (black) for (let i = 0; i < 3; i++) strokeOne(black, 1.4 + rng() * 1.4, 0.9);
}

function paintAmoebaScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    // camo r2: few LARGE rounded masses + sparse ochre accents
    const dark = patches[0], ochre = patches[1] || null;
    for (let i = 0; i < 3; i++) {
      const x = rng() * W, y = rng() * H, r = S * (0.055 + rng() * 0.035);
      swBlob(c, rng, x, y, r);
      c.fillStyle = swRgb(dark, 0.92);
      c.fill();
      swBlob(c, rng, x + (rng() - 0.5) * r * 1.6, y + (rng() - 0.5) * r * 1.2, r * 0.65);
      c.fill();
    }
    if (ochre) for (let i = 0; i < 2; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * (0.018 + rng() * 0.014));
      c.fillStyle = swRgb(ochre, 0.85);
      c.fill();
    }
}

function paintHexfieldScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H } = ctx;
    // camo r2: honeycomb cell field, ~55% filled from two tones
    const tones = [patches[0], patches[1] || patches[0]];
    const hexR = 4.6, cw = hexR * 1.5, rh = hexR * Math.sqrt(3);
    for (let gy = 0; gy < Math.ceil(H / rh) + 1; gy++) {
      for (let gx = 0; gx < Math.ceil(W / cw) + 1; gx++) {
        const v = rng();
        if (v < 0.45) continue;
        const x = gx * cw, y = gy * rh + (gx % 2 ? rh / 2 : 0);
        c.fillStyle = swRgb(v < 0.75 ? tones[0] : tones[1], 0.9);
        c.beginPath();
        for (let k2 = 0; k2 < 6; k2++) {
          const a2 = (k2 / 6) * Math.PI * 2;
          const px2 = x + Math.cos(a2) * hexR * 0.92, py2 = y + Math.sin(a2) * hexR * 0.8;
          if (k2 === 0) c.moveTo(px2, py2); else c.lineTo(px2, py2);
        }
        c.closePath();
        c.fill();
      }
    }
}

function paintClaudeScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    // claude camo r5: the creature IS the print — hero + satellite Claude
    // Code guys in terracotta/slate straight on ivory (fields gone, owner
    // ask; same card language as 'spark'). evenodd keeps the eyes open.
    const terra = patches[0], slate = patches[1] || patches[0];
    const guy = (x: number, y: number, s: number, ink: SwatchRgb, a: number): void => {
      c.save();
      c.translate(x, y);
      c.scale(s / 24, s / 24);
      c.translate(-12, -12.5);
      c.fillStyle = swRgb(ink, a);
      c.fill(new Path2D(CLAUDE_CODE_MARK), 'evenodd');
      c.restore();
    };
    guy(W * 0.30, H * 0.5, H * 1.05, terra, 0.95);
    guy(W * 0.68, H * 0.42, H * 0.6, slate, 0.9);
    guy(W * 0.88, H * 0.68, H * 0.42, terra, 0.8);
}

function paintSparkScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    // camo r4: the Claude spark from sprinkle to hero scale on warm ivory.
    const terra = patches[0], slate = patches[1] || patches[0];
    const spark = (x: number, y: number, s: number, ink: SwatchRgb, a: number): void => {
      c.save();
      c.translate(x, y);
      c.scale(s / 24, s / 24);
      c.translate(-12, -12);
      c.fillStyle = swRgb(ink, a);
      c.fill(new Path2D(CLAUDE_SPARK_MARK));
      c.restore();
    };
    spark(W * 0.28, H * 0.5, H * 1.05, terra, 0.95);
    spark(W * 0.66, H * 0.4, H * 0.55, slate, 0.9);
    spark(W * 0.88, H * 0.66, H * 0.4, terra, 0.8);
}

function paintDuckyScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    // camo r6 fun set: each card sells its motif with 1-3 signature marks.
    const gold = patches[0], ink = patches[1] || patches[0];
    const duck = (x: number, y: number, sc: number, a: number): void => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(gold, a);
      c.beginPath(); c.ellipse(0.02, 0.10, 0.46, 0.33, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(-0.30, -0.28, 0.22, 0.21, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-0.48, -0.36); c.lineTo(-0.68, -0.26);
      c.lineTo(-0.48, -0.18); c.closePath(); c.fill();
      c.fillStyle = swRgb(ink, a);
      c.beginPath(); c.arc(-0.34, -0.31, 0.05, 0, Math.PI * 2); c.fill();
      c.restore();
    };
    duck(W * 0.32, H * 0.52, H * 0.6, 0.95);
    duck(W * 0.74, H * 0.5, H * 0.32, 0.9);
}

function paintSuitsScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    const red = patches[0], blk = patches[1] || patches[0];
    const glyph = (
      d: string,
      x: number,
      y: number,
      sc: number,
      col: SwatchRgb,
    ): void => {
      c.save(); c.translate(x, y); c.scale(sc / 24, sc / 24); c.translate(-12, -12);
      c.fillStyle = swRgb(col, 0.94); c.fill(new Path2D(d)); c.restore();
    };
    const HEART = 'M12 21C4 13 2 9 2 6.5 2 3.5 4.2 2 6.5 2 8.6 2 10.8 3.2 12 5.6' +
      ' 13.2 3.2 15.4 2 17.5 2 19.8 2 22 3.5 22 6.5 22 9 20 13 12 21Z';
    const SPADE = 'M12 2C20 10 22 12.5 22 15 22 18 19.8 19.5 17.5 19.5 16 19.5 14.6' +
      ' 18.9 13.6 17.8L15.2 23H8.8L10.4 17.8C9.4 18.9 8 19.5 6.5 19.5 4.2 19.5 2 18' +
      ' 2 15 2 12.5 4 10 12 2Z';
    glyph(HEART, W * 0.3, H * 0.5, H * 0.85, red);
    glyph(SPADE, W * 0.68, H * 0.46, H * 0.55, blk);
    glyph(HEART, W * 0.88, H * 0.68, H * 0.35, red);
}

function paintFlamesScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    const fr = patches[0], fo = patches[1] || fr, fg = patches[2] || fo;
    const lick = (
      x: number,
      y: number,
      sc: number,
      col: SwatchRgb,
      a: number,
    ): void => {
      c.fillStyle = swRgb(col, a);
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(x + k * sc * 0.6, y - k * sc * 0.3, sc * (0.5 - k * 0.13), 0, Math.PI * 2);
        c.fill();
      }
    };
    lick(W * 0.16, H * 0.66, H * 0.52, fr, 0.95);
    lick(W * 0.2, H * 0.62, H * 0.36, fo, 0.95);
    lick(W * 0.24, H * 0.6, H * 0.22, fg, 0.95);
    lick(W * 0.62, H * 0.56, H * 0.34, fr, 0.9);
    lick(W * 0.65, H * 0.53, H * 0.2, fo, 0.9);
}

function paintLeopardprintScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    const amber = patches[0], blk = patches[1] || patches[0];
    for (let i = 0; i < 7; i++) {
      const x = rng() * W, y = rng() * H, r = S * 0.032 * (0.8 + rng() * 0.6);
      swBlob(c, rng, x, y, r * 0.75);
      c.fillStyle = swRgb(amber, 0.9); c.fill();
      c.strokeStyle = swRgb(blk, 0.92); c.lineWidth = r * 0.5;
      const n = 3 + ((rng() * 3) | 0), a0 = rng() * 7;
      for (let k = 0; k < n; k++) {
        c.beginPath();
        const a1 = a0 + (k / n) * Math.PI * 2;
        c.arc(x, y, r, a1, a1 + 0.6); c.stroke();
      }
    }
}

function paintBoltScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    const gold = patches[0], ink = patches[1] || patches[0];
    const zap = (
      x: number,
      y: number,
      sc: number,
      col: SwatchRgb,
      a: number,
    ): void => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(col, a);
      c.beginPath();
      c.moveTo(0.06, -0.5); c.lineTo(0.26, -0.5); c.lineTo(0.03, -0.09);
      c.lineTo(0.2, -0.09); c.lineTo(-0.14, 0.5); c.lineTo(-0.02, 0.05);
      c.lineTo(-0.2, 0.05); c.closePath(); c.fill(); c.restore();
    };
    zap(W * 0.32, H * 0.5, H * 0.85, gold, 0.95);
    zap(W * 0.66, H * 0.48, H * 0.5, ink, 0.9);
    zap(W * 0.86, H * 0.62, H * 0.32, gold, 0.85);
}

function paintStarsScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    const cream = patches[0], gold = patches[1] || patches[0];
    const star = (
      x: number,
      y: number,
      sc: number,
      col: SwatchRgb,
      a: number,
    ): void => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(col, a); c.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 0.21 : 0.5, aa = -Math.PI / 2 + (k * Math.PI) / 5;
        const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (k) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath(); c.fill(); c.restore();
    };
    star(W * 0.3, H * 0.5, H * 0.8, cream, 0.95);
    star(W * 0.68, H * 0.42, H * 0.45, gold, 0.9);
    star(W * 0.87, H * 0.68, H * 0.28, gold, 0.85);
}

function paintDaisyScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    const cream = patches[0], button = patches[1] || patches[0];
    const flower = (x: number, y: number, sc: number, a: number): void => {
      for (let k = 0; k < 6; k++) {
        const aa = (k * Math.PI) / 3 + 0.3;
        c.beginPath();
        c.ellipse(x + Math.cos(aa) * sc * 0.3, y + Math.sin(aa) * sc * 0.3,
          sc * 0.21, sc * 0.115, aa, 0, Math.PI * 2);
        c.fillStyle = swRgb(cream, a); c.fill();
      }
      c.beginPath(); c.arc(x, y, sc * 0.145, 0, Math.PI * 2);
      c.fillStyle = swRgb(button, a); c.fill();
    };
    flower(W * 0.3, H * 0.5, H * 0.75, 0.95);
    flower(W * 0.72, H * 0.5, H * 0.42, 0.9);
}

function paintCircuitScheme(ctx: SwatchPaintContext): void {
  const { c, rng, base, patches, W, H } = ctx;
    const pad = patches[0], trace = patches[1] || patches[0];
    const via = (x: number, y: number, r: number): void => {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = swRgb(pad, 0.92); c.fill();
    };
    c.strokeStyle = swRgb(trace, 0.85); c.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      let x = rng() * W, y = rng() * H;
      via(x, y, 2.6);
      c.beginPath(); c.moveTo(x, y);
      let dir = ((rng() * 4) | 0) * (Math.PI / 2);
      for (let k = 0; k < 2; k++) {
        const len = W * (0.1 + rng() * 0.15);
        x += Math.cos(dir) * len; y += Math.sin(dir) * len;
        c.lineTo(x, y);
        dir += (rng() < 0.5 ? 1 : -1) * (Math.PI / 4);
      }
      c.stroke(); via(x, y, 2.6);
    }
    c.fillStyle = swRgb(swMix(base, [0, 0, 0], 0.45), 0.95);
    c.fillRect(W * 0.62, H * 0.3, W * 0.14, H * 0.34);
}

function paintRacingScheme(ctx: SwatchPaintContext): void {
  const { c, base, patches, W, H } = ctx;
    const red = patches[0], blk = patches[1] || patches[0];
    c.save(); c.translate(W * 0.38, H * 0.5); c.rotate(-0.3);
    c.fillStyle = swRgb(red, 0.94); c.fillRect(-W * 0.07, -H * 2, W * 0.14, H * 4);
    c.fillRect(W * 0.1, -H * 2, W * 0.045, H * 4);
    c.fillStyle = swRgb(blk, 0.9); c.fillRect(-W * 0.11, -H * 2, W * 0.016, H * 4);
    c.restore();
    c.beginPath(); c.arc(W * 0.74, H * 0.48, H * 0.34, 0, Math.PI * 2);
    c.fillStyle = swRgb(swMix(base, [255, 255, 255], 0.55), 0.96); c.fill();
    c.lineWidth = H * 0.05; c.strokeStyle = swRgb(blk, 0.92); c.stroke();
    c.fillStyle = swRgb(blk, 0.94);
    c.font = `900 ${Math.round(H * 0.4)}px 'ABC Monument Grotesk', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('7', W * 0.74, H * 0.5);
}

function paintPaintballScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    for (let i = 0; i < 4; i++) {
      const col = patches[i % patches.length];
      const x = rng() * W, y = rng() * H, r = S * 0.045 * (0.7 + rng() * 0.6);
      swBlob(c, rng, x, y, r);
      c.fillStyle = swRgb(col, 0.92); c.fill();
      for (let k = 0; k < 5; k++) {
        const aa = rng() * Math.PI * 2, d = r * (1.2 + rng() * 1.4);
        c.beginPath();
        c.arc(x + Math.cos(aa) * d, y + Math.sin(aa) * d * 0.8,
          r * (0.08 + rng() * 0.12), 0, Math.PI * 2);
        c.fill();
      }
    }
}

function paintStarScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    // camo r7 loadout set: the circled invasion star on olive drab
    const white = patches[0];
    const star = (x: number, y: number, sc: number, a: number): void => {
      c.save(); c.translate(x, y); c.scale(sc, sc);
      c.fillStyle = swRgb(white, a); c.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? 0.21 : 0.5, aa = -Math.PI / 2 + (k * Math.PI) / 5;
        const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (k) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath(); c.fill(); c.restore();
    };
    star(W * 0.34, H * 0.5, H * 0.7, 0.95);
    c.strokeStyle = swRgb(white, 0.9); c.lineWidth = H * 0.045;
    c.beginPath(); c.arc(W * 0.34, H * 0.5, H * 0.46, 0.3, Math.PI * 2 - 0.2); c.stroke();
    star(W * 0.76, H * 0.5, H * 0.36, 0.9);
}

function paintIdbandScheme(ctx: SwatchPaintContext): void {
  const { c, patches, W, H } = ctx;
    // camo r7 loadout set: white recognition band + tactical number on 4BO
    const white = patches[0];
    c.fillStyle = swRgb(white, 0.9);
    c.fillRect(0, H * 0.34, W, H * 0.12);
    c.font = `900 ${Math.round(H * 0.5)}px 'ABC Monument Grotesk', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('312', W * 0.68, H * 0.66);
}

function paintBrushwashScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H } = ctx;
    // camo r8: streaky brushed whitewash with OD dragging through
    const od = patches[0];
    c.strokeStyle = swRgb(od, 0.4); c.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      c.lineWidth = 1 + rng() * 2.5;
      c.beginPath();
      const y = rng() * H, x = rng() * W;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 18, y + (rng() - 0.5) * 6, x + 30 + rng() * 24, y + (rng() - 0.5) * 8);
      c.stroke();
    }
}

function paintUsmcScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H } = ctx;
    const blk = patches[0], white = patches[2] || patches[0];
    c.strokeStyle = swRgb(blk, 0.92); c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.lineWidth = 5 + rng() * 4;
      c.beginPath();
      const y = rng() * H;
      c.moveTo(-4, y);
      c.quadraticCurveTo(W * 0.3, y + (rng() - 0.5) * 22, W * 0.6, y + (rng() - 0.5) * 14);
      c.quadraticCurveTo(W * 0.85, y + (rng() - 0.5) * 22, W + 4, y + (rng() - 0.5) * 12);
      c.stroke();
    }
    c.fillStyle = swRgb(white, 0.9);
    c.font = `900 ${Math.round(H * 0.5)}px 'ABC Monument Grotesk', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('34', W * 0.78, H * 0.5);
}

function paintErdlScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    const dk = patches[0], br = patches[1] || dk, bk = patches[2] || dk;
    for (let i = 0; i < 6; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * 0.035 * (0.7 + rng() * 0.7));
      c.fillStyle = swRgb(dk, 0.95); c.fill();
    }
    for (let i = 0; i < 4; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * 0.024 * (0.7 + rng() * 0.6));
      c.fillStyle = swRgb(br, 0.93); c.fill();
    }
    c.strokeStyle = swRgb(bk, 0.92); c.lineWidth = 1.6; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      const x = rng() * W, y = rng() * H;
      c.moveTo(x, y);
      c.quadraticCurveTo(x + (rng() - 0.5) * 16, y + (rng() - 0.5) * 16,
        x + (rng() - 0.5) * 26, y + (rng() - 0.5) * 26);
      c.stroke();
    }
}

function paintMudwashScheme(ctx: SwatchPaintContext): void {
  const { c, rng, patches, W, H, S } = ctx;
    const wet = patches[0], dry = patches[1] || wet, dark = patches[2] || wet;
    for (let i = 0; i < 2; i++) {
      swBlob(c, rng, rng() * W, rng() * H, S * 0.035);
      c.fillStyle = swRgb(dry, 0.85); c.fill();
      c.strokeStyle = swRgb(dark, 0.7); c.lineWidth = 1.4; c.stroke();
    }
    for (let i = 0; i < 60; i++) {
      c.beginPath();
      c.arc(rng() * W, rng() * H, 0.5 + rng() * 1.8, 0, Math.PI * 2);
      c.fillStyle = swRgb(rng() < 0.3 ? dark : wet, 0.5 + rng() * 0.3);
      c.fill();
    }
}

const SWATCH_SCHEME_HANDLERS: Readonly<Record<string, SwatchSchemeHandler>> = {
  "drawn": { paint: paintDrawnScheme, requiresPatches: true },
  "nato": { paint: paintNatoScheme, requiresPatches: true },
  "desert": { paint: paintDesertScheme, requiresPatches: true },
  "winter": { paint: paintWinterScheme, requiresPatches: false },
  "digital": { paint: paintDigitalFleckScheme, requiresPatches: true },
  "fleck": { paint: paintDigitalFleckScheme, requiresPatches: true },
  "stripes": { paint: paintStripesScheme, requiresPatches: true },
  "ambush": { paint: paintAmbushScheme, requiresPatches: true },
  "merdc": { paint: paintMerdcScheme, requiresPatches: true },
  "blotch": { paint: paintBlotchScheme, requiresPatches: true },
  "blocks": { paint: paintBlocksScheme, requiresPatches: true },
  "washworn": { paint: paintWashwornScheme, requiresPatches: false },
  "caunter": { paint: paintCaunterScheme, requiresPatches: true },
  "splinter": { paint: paintSplinterScheme, requiresPatches: true },
  "dazzle": { paint: paintDazzleScheme, requiresPatches: true },
  "tigerstripe": { paint: paintTigerstripeScheme, requiresPatches: true },
  "chip6": { paint: paintChip6Scheme, requiresPatches: true },
  "brush": { paint: paintBrushScheme, requiresPatches: true },
  "amoeba": { paint: paintAmoebaScheme, requiresPatches: true },
  "hexfield": { paint: paintHexfieldScheme, requiresPatches: true },
  "claude": { paint: paintClaudeScheme, requiresPatches: true },
  "spark": { paint: paintSparkScheme, requiresPatches: true },
  "ducky": { paint: paintDuckyScheme, requiresPatches: true },
  "suits": { paint: paintSuitsScheme, requiresPatches: true },
  "flames": { paint: paintFlamesScheme, requiresPatches: true },
  "leopardprint": { paint: paintLeopardprintScheme, requiresPatches: true },
  "bolt": { paint: paintBoltScheme, requiresPatches: true },
  "stars": { paint: paintStarsScheme, requiresPatches: true },
  "daisy": { paint: paintDaisyScheme, requiresPatches: true },
  "circuit": { paint: paintCircuitScheme, requiresPatches: true },
  "racing": { paint: paintRacingScheme, requiresPatches: true },
  "paintball": { paint: paintPaintballScheme, requiresPatches: true },
  "star": { paint: paintStarScheme, requiresPatches: true },
  "idband": { paint: paintIdbandScheme, requiresPatches: true },
  "brushwash": { paint: paintBrushwashScheme, requiresPatches: true },
  "usmc": { paint: paintUsmcScheme, requiresPatches: true },
  "erdl": { paint: paintErdlScheme, requiresPatches: true },
  "mudwash": { paint: paintMudwashScheme, requiresPatches: true },
};

function paintResolvedScheme(context: SwatchPaintContext): void {
  const handler = SWATCH_SCHEME_HANDLERS[context.scheme];
  if (!handler || (handler.requiresPatches && context.patches.length === 0)) return;
  handler.paint(context);
}

export function paintCamoSwatch(
  canvas: HTMLCanvasElement,
  spec: FleetTankSpec,
  pid: string,
): void {
  const W = 128, H = 44;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d')!;
  let seed = 11;
  for (const ch of `${spec.id}:${pid}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const rng = swRngFactory(seed);
  const vis: CamoVisual = resolveCamoVisual(spec, pid);
  const base = swHex(vis.base || '#5a6b46');
  const weather = swHex(vis.weather || vis.base || '#5a6b46');
  const patches = (vis.patches || []).map(swHex);
  // tile-scale reference dimension: 1.6x over the raw canvas width so the
  // pattern features render BOLDER than on-hull scale — at 62px display width
  // the true-scale features smeared into flat noise (r3 readability)
  const patternRepeat = Number(vis.patternRepeat);
  const repeatScale = Number.isFinite(patternRepeat)
    ? 1.28 - (patternRepeat / 100) * 0.72
    : 1;
  const S = W * 1.6 * repeatScale;
  c.fillStyle = swRgb(base);
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) { // weathered tonal drift
    const x = rng() * W, y = rng() * H, r = S * (0.06 + rng() * 0.12);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, swRgb(swMix(base, weather, 0.3 + rng() * 0.4), 0.5));
    g.addColorStop(1, swRgb(base, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const scheme = vis.scheme || 'solid';
  paintResolvedScheme({ c, rng, vis, base, patches, W, H, S, scheme });
  // faint top-light so the tile reads as painted steel, not a flat chip
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

// AUTO is a per-map policy, so its tile previews four real resolved pattern
// families as a clean seasonal contact sheet. The caption below already
// supplies the AUTO identity, so no badge obscures the paint.
export function paintAutoCamoSwatch(
  canvas: HTMLCanvasElement,
  spec: FleetTankSpec,
): void {
  const W = 128, H = 44;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#11171c';
  c.fillRect(0, 0, W, H);
  const patterns = ['summer', 'desert', 'winter', 'urbanblock'];
  const scratch = document.createElement('canvas');
  const cellW = W / 2;
  const cellH = H / 2;
  patterns.forEach((pattern, index) => {
    paintCamoSwatch(scratch, spec, pattern);
    const x = (index % 2) * cellW;
    const y = Math.floor(index / 2) * cellH;
    c.drawImage(scratch, 0, 0, W, H, x, y, cellW, cellH);
  });
  c.strokeStyle = 'rgba(235,243,250,.28)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(cellW, 0); c.lineTo(cellW, H); c.stroke();
  c.beginPath(); c.moveTo(0, cellH); c.lineTo(W, cellH); c.stroke();
  const shade = c.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,.07)');
  shade.addColorStop(0.55, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(3,6,8,.22)');
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);
}
// --- END CAMO PICKER SECTION (swatch painter) --------------------------------
