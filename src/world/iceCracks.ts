// src/world/iceCracks.ts — the ice atlas's pressure cracks (terrain.ts makeIceLayer), the looks lane's own file
// (extract-then-own, 2026-10-15: the 226 reeds pair's critics asked for varied cracks in place of the flat bright veins;
// this first cut is the old painter moved byte for byte).

type Css = (h: number, s: number, l: number) => string;
type Wrap = (ctx: CanvasRenderingContext2D, s: number, fn: () => void) => void;

/** The atlas's cracks on `ctx` (an `s`-texel tile, `unit` texels a 256-tile texel), from the layer's own `rng`. */
export function drawIceCracks(
  ctx: CanvasRenderingContext2D, s: number, unit: number, rng: () => number, drawWrapped: Wrap, _css: Css,
): void {
  // Three dominant stress seams, each with at most one short secondary fork.
  // This same atlas is sampled at 5 m and 75 m: many recursively branching
  // strokes became a uniformly scratched print at both scales.
  ctx.lineCap = 'round';
  function crack(x: number, y: number, a: number, segs: number, w: number): void {
    const ptsX = [x], ptsY = [y];
    for (let q = 0; q < segs; q++) {
      a += (rng() - 0.5) * 0.65;
      const step = (22 + rng() * 14) * unit;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      ptsX.push(x); ptsY.push(y);
    }
    drawWrapped(ctx, s, () => {
      // dark stress shadow under a BRIGHT refrozen core: from distance real
      // pressure cracks read as white veins across darker ice (the old dark-
      // core version read as mud cracks). Both desaturated (r5).
      ctx.strokeStyle = _css(0.58, 0.10, 0.36);
      ctx.lineWidth = w + 1.8 * unit;
      ctx.globalAlpha = 0.30;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.strokeStyle = _css(0.575, 0.05, 0.90);
      ctx.lineWidth = w;
      ctx.globalAlpha = 0.86;
      ctx.beginPath();
      ctx.moveTo(ptsX[0], ptsY[0]);
      for (let q = 1; q < ptsX.length; q++) ctx.lineTo(ptsX[q], ptsY[q]);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (segs > 3 && rng() < 0.35) {
      const heading = Math.atan2(ptsY[2] - ptsY[1], ptsX[2] - ptsX[1]);
      crack(ptsX[2], ptsY[2], heading + (rng() < 0.5 ? 0.8 : -0.8), 2, w * 0.45);
    }
  }
  for (let k = 0; k < 3; k++) {
    crack(((k + 0.2 + rng() * 0.5) / 3) * s, rng() * s,
      k * 2.1 + rng() * 0.6, 6, (2.6 + rng() * 0.8) * unit);
  }
  ctx.globalAlpha = 1;
}
