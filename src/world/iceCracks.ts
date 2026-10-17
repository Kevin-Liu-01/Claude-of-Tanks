// src/world/iceCracks.ts — the ice atlas's pressure cracks (terrain.ts makeIceLayer), the looks lane's own file
// (extract-then-own, 2026-10-15).
//
// 226 (the reeds pair's critics: "flat bright crack decals"): the three dominant seams were one stroke each, the same
// bright refrozen core at the same width end to end, so at the 75 m macro re-projection they read as white lines ruled
// across every sheet. Each seam is now one of three kinds, drawn segment by segment so it tapers from its middle to
// hair at its ends and its tone wanders along it:
//   - a refrozen pressure seam: the bright core over a dark stress shadow (the old look, narrower and broken in places);
//   - an open crack: a dark core with a faint pale rim, water-dark ice showing through;
//   - a hairline: a faint pale line, half the width.
// A handful of short hairline crazes sit beside the seams. The atlas is still sampled at 5 m and 75 m, so the count stays
// small (three seams, at most one short fork each, four crazes): many strokes became a uniformly scratched print.

type Css = (h: number, s: number, l: number) => string;
type Wrap = (ctx: CanvasRenderingContext2D, s: number, fn: () => void) => void;

type Kind = 'refrozen' | 'open' | 'hair';

/** The atlas's cracks on `ctx` (an `s`-texel tile, `unit` texels a 256-tile texel), from the layer's own `rng`. */
export function drawIceCracks(
  ctx: CanvasRenderingContext2D, s: number, unit: number, rng: () => number, drawWrapped: Wrap, _css: Css,
): void {
  ctx.lineCap = 'round';
  const kinds: Kind[] = ['refrozen', 'open', 'hair'];
  // (one seam of each kind, in an order of the layer's own; all choices before any wrapped drawing)
  for (let k = kinds.length - 1; k > 0; k--) { const j = (rng() * (k + 1)) | 0; [kinds[k], kinds[j]] = [kinds[j], kinds[k]]; }
  const stroke = (pts: number[][], from: number, to: number, width: number, style: string, alpha: number): void => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pts[from][0], pts[from][1]);
    for (let q = from + 1; q <= to; q++) ctx.lineTo(pts[q][0], pts[q][1]);
    ctx.stroke();
  };
  function crack(x: number, y: number, a: number, segs: number, w: number, kind: Kind, fork: boolean): void {
    const pts: number[][] = [[x, y]];
    const tone: number[] = [];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 0.65;
      const step = (22 + rng() * 14) * unit;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push([x, y]);
      tone.push(rng());
    }
    // a refrozen seam breaks in one place: one segment left as hair
    const gap = kind === 'refrozen' && segs > 3 ? 1 + ((rng() * (segs - 2)) | 0) : -1;
    drawWrapped(ctx, s, () => {
      for (let q = 0; q < segs; q++) {
        // tapered from the middle to its ends, its tone wandering segment to segment
        const mid = 1 - Math.abs((q + 0.5) / segs - 0.5) * 1.3, t = tone[q];
        const width = w * Math.max(0.3, mid) * (kind === 'hair' || q === gap ? 0.45 : 1);
        if (kind === 'open') {
          stroke(pts, q, q + 1, width + 1.4 * unit, _css(0.56, 0.06, 0.62), 0.22 + t * 0.12);
          stroke(pts, q, q + 1, width * 0.8, _css(0.57, 0.12, 0.16 + t * 0.08), 0.55 + t * 0.2);
        } else if (kind === 'hair' || q === gap) {
          stroke(pts, q, q + 1, width, _css(0.575, 0.04, 0.78 + t * 0.08), 0.32 + t * 0.2);
        } else {
          stroke(pts, q, q + 1, width + 1.8 * unit, _css(0.58, 0.10, 0.36), 0.26 + t * 0.08);
          stroke(pts, q, q + 1, width, _css(0.575, 0.05, 0.86 + t * 0.06), 0.72 + t * 0.18);
        }
      }
      ctx.globalAlpha = 1;
    });
    if (fork && segs > 3 && rng() < 0.35) {
      const heading = Math.atan2(pts[2][1] - pts[1][1], pts[2][0] - pts[1][0]);
      crack(pts[2][0], pts[2][1], heading + (rng() < 0.5 ? 0.8 : -0.8), 2, w * 0.45, kind === 'open' ? 'hair' : kind, false);
    }
  }
  for (let k = 0; k < 3; k++) {
    crack(((k + 0.2 + rng() * 0.5) / 3) * s, rng() * s,
      k * 2.1 + rng() * 0.6, 6, (2.6 + rng() * 0.8) * unit, kinds[k], true);
  }
  // the crazes: short hairlines in the clear ice
  for (let k = 0; k < 4; k++) {
    crack(rng() * s, rng() * s, rng() * Math.PI * 2, 2, (0.9 + rng() * 0.5) * unit, 'hair', false);
  }
  ctx.globalAlpha = 1;
}
