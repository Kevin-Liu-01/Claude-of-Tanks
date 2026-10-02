// src/world/treeSprayAtlas.ts — the grown trees' foliage tiles (p2 trees lane, 2026-10-01).
//
// One atlas per species: 2 × 2 tiles, each a leafy twig painted the way that species carries its leaves — a woody
// stem rising from the tile's bottom centre (where the card is seated on its branch, treeGrowth.ts), side twigs, and
// the leaves themselves: an oak's lobed leaves, a poplar's deltoid ones on long stalks, a willow's narrow lances, a
// eucalyptus' grey sickles, an acacia's feathery pinnae, a birch's small serrated ovals, an aspen's round trembling
// discs; a spruce twig's bottle-brush of stiff needles, a fir's flat two-ranked comb, a pine's long needle bundles,
// a cedar's rosettes, a cypress' scale-leaf fronds; bare winter twigs. Leaves lit from above (the sunward half of
// each blade a touch lighter, the twig's inner leaves darker), a darker back layer under the front one for depth.
//
// Each tile keeps a transparent margin and an elliptical alpha falloff (deep mips fall below the alpha test instead
// of resolving the card as a rectangle) and floods its empty texels with its own mean leaf tone (mips never darken
// toward black). Straight alpha in an ImageData upload, sRGB, the same sampling policy as the round-8 atlases.
// Deterministic from the RNG; canvas painting only (the receipts run it on the native canvas).
import * as THREE from 'three';

type Rng = () => number;
type ToneFunction = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];

export type SprayKind = 'oak' | 'poplar' | 'willow' | 'acacia' | 'eucalyptus' | 'birch' | 'aspen' | 'birch-bare'
  | 'spruce' | 'fir' | 'pine' | 'cedar' | 'cypress';
export const SPRAY_KINDS: readonly SprayKind[] = Object.freeze(['oak', 'poplar', 'willow', 'acacia', 'eucalyptus',
  'birch', 'aspen', 'birch-bare', 'spruce', 'fir', 'pine', 'cedar', 'cypress']);
/** Tiles per side of every spray atlas. */
export const SPRAY_ATLAS_TILES = 2;

interface LeafColor { hue: number; sat: number; light: number }
/** The base leaf colour of each kind (linear HSL, the convention of the round-8 painters' css()). */
const LEAF_COLOR: Readonly<Record<SprayKind, LeafColor>> = Object.freeze({
  oak: { hue: 0.225, sat: 0.38, light: 0.215 },
  poplar: { hue: 0.215, sat: 0.38, light: 0.22 },
  willow: { hue: 0.205, sat: 0.30, light: 0.24 },
  acacia: { hue: 0.215, sat: 0.32, light: 0.17 },
  eucalyptus: { hue: 0.33, sat: 0.14, light: 0.24 },
  birch: { hue: 0.205, sat: 0.38, light: 0.24 },
  aspen: { hue: 0.19, sat: 0.36, light: 0.25 },
  'birch-bare': { hue: 0.06, sat: 0.08, light: 0.26 },
  spruce: { hue: 0.36, sat: 0.30, light: 0.145 },
  fir: { hue: 0.33, sat: 0.34, light: 0.14 },
  pine: { hue: 0.27, sat: 0.32, light: 0.17 },
  cedar: { hue: 0.37, sat: 0.22, light: 0.165 },
  cypress: { hue: 0.31, sat: 0.36, light: 0.145 },
});

const _cc = new THREE.Color();
function css(h: number, s: number, l: number, alpha = 1): string {
  _cc.setHSL(((h % 1) + 1) % 1, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)), THREE.LinearSRGBColorSpace);
  const style = _cc.getStyle(THREE.SRGBColorSpace);
  return alpha >= 1 ? style : style.replace('rgb(', 'rgba(').replace(')', `,${alpha.toFixed(3)})`);
}

const _toneCol = new THREE.Color();
const _toneHsl = { h: 0, s: 0, l: 0 };
function applyTone(px: Uint8ClampedArray, fn: ToneFunction | null): void {
  if (!fn) return;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    _toneCol.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    _toneCol.getHSL(_toneHsl);
    const [h, s, l] = fn(_toneHsl.h, _toneHsl.s, _toneHsl.l);
    _toneCol.setHSL(((h % 1) + 1) % 1, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)));
    px[i] = _toneCol.r * 255; px[i + 1] = _toneCol.g * 255; px[i + 2] = _toneCol.b * 255;
  }
}

interface Pt { x: number; y: number }

/** A tapered stroke along a polyline (the stem and twigs). */
function taperStroke(ctx: CanvasRenderingContext2D, pts: Pt[], w0: number, w1: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const t = (i - 0.5) / (pts.length - 1);
    ctx.lineWidth = Math.max(0.6, w0 + (w1 - w0) * t);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

/** A curved twig from p0 heading `angle` (canvas radians; -PI/2 = up) for `length`, bending by `bend` per unit. */
function twigPoints(p0: Pt, angle: number, length: number, bend: number, steps = 8): Pt[] {
  const pts: Pt[] = [p0];
  let a = angle, x = p0.x, y = p0.y;
  const step = length / steps;
  for (let i = 0; i < steps; i++) {
    a += bend / steps;
    x += Math.cos(a) * step; y += Math.sin(a) * step;
    pts.push({ x, y });
  }
  return pts;
}

function pointAt(pts: Pt[], t: number): { p: Pt; a: number } {
  const f = Math.max(0, Math.min(1, t)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
  const a = pts[i], b = pts[i + 1];
  return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, a: Math.atan2(b.y - a.y, b.x - a.x) };
}

/**
 * The spray's shaded body: a soft dark mass along its twigs, under the leaves or needles (three widening, fading
 * strokes) — the inside of a leafy spray is leaves in each other's shade, and the mass keeps a minified card's coverage
 * from thinning to a few needles at range.
 */
function paintSprayBody(ctx: CanvasRenderingContext2D, twigs: Pt[][], width: number, base: LeafColor, strength = 1, stemFrom = 0.3): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, a] of [[1.0, 0.30], [0.72, 0.45], [0.45, 0.6]] as const) {
    ctx.strokeStyle = css(base.hue + 0.015, base.sat * 0.85, base.light * 0.42, a * strength);
    twigs.forEach((tw, index) => {
      // the stem's lower part is bare (the leaves begin a third of the way up); a side twig carries leaves from its base
      const from = index === 0 ? Math.max(1, Math.round(stemFrom * (tw.length - 1))) : 1;
      if (from >= tw.length) return;
      ctx.lineWidth = width * w;
      ctx.beginPath();
      ctx.moveTo(tw[from - 1].x, tw[from - 1].y);
      for (let i = from; i < tw.length; i++) ctx.lineTo(tw[i].x, tw[i].y);
      ctx.stroke();
    });
  }
}

/** A winter palette's snow on a spray: soft white lumps riding the twigs (more, and fuller, with more snow). */
function paintSpraySnow(ctx: CanvasRenderingContext2D, twigs: Pt[][], reach: number, snow: number, rng: Rng): void {
  for (const tw of twigs) {
    let len = 0;
    for (let i = 1; i < tw.length; i++) len += Math.hypot(tw[i].x - tw[i - 1].x, tw[i].y - tw[i - 1].y);
    const n = Math.round(len / Math.max(2, reach * 0.55));
    for (let k = 0; k < n; k++) {
      if (rng() > snow * 0.85) continue;
      const at = pointAt(tw, (k + 0.5) / n);
      const r = reach * (0.35 + rng() * 0.45) * (0.6 + 0.4 * snow);
      const gr = ctx.createRadialGradient(at.p.x, at.p.y, 0, at.p.x, at.p.y, r);
      gr.addColorStop(0, css(0.58, 0.05, 0.86, 0.95));
      gr.addColorStop(0.65, css(0.58, 0.06, 0.78, 0.8));
      gr.addColorStop(1, css(0.58, 0.06, 0.7, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(at.p.x, at.p.y, r * 1.25, r * 0.8, at.a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

type LeafShape = 'lobed' | 'deltoid' | 'lance' | 'falcate' | 'oval' | 'round' | 'pinnate';

/** The leaf outline in a local frame: base at the origin, tip at (len, 0), half-width wid. */
function leafPath(ctx: CanvasRenderingContext2D, shape: LeafShape, len: number, wid: number, rng: Rng): void {
  ctx.beginPath();
  switch (shape) {
    case 'lobed': {
      // an oak leaf: a narrow base, three or four rounded lobes per side, a rounded tip
      const lobes = 3 + ((rng() * 2) | 0);
      ctx.moveTo(0, 0);
      for (let side = -1; side <= 1; side += 2) {
        const pts: Array<[number, number]> = [];
        for (let k = 0; k <= lobes; k++) {
          const t = 0.12 + (k / lobes) * 0.82;
          const env = Math.sin(Math.PI * Math.min(1, t * 1.05)) * wid;
          pts.push([len * t, side * env * (k % 2 === 0 ? 1 : 0.62)]);
        }
        if (side === -1) {
          for (const [x, y] of pts) ctx.lineTo(x, y);
          ctx.quadraticCurveTo(len * 1.02, 0, len * 0.96, wid * 0.08);
        } else {
          for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1]);
          ctx.lineTo(0, 0);
        }
      }
      break;
    }
    case 'deltoid': {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.18, -wid * 1.15, len * 0.45, -wid * 0.95);
      ctx.quadraticCurveTo(len * 0.8, -wid * 0.5, len, 0);
      ctx.quadraticCurveTo(len * 0.8, wid * 0.5, len * 0.45, wid * 0.95);
      ctx.quadraticCurveTo(len * 0.18, wid * 1.15, 0, 0);
      break;
    }
    case 'lance': {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.45, -wid * 1.1, len, 0);
      ctx.quadraticCurveTo(len * 0.45, wid * 1.1, 0, 0);
      break;
    }
    case 'falcate': {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.4, -wid * 1.4, len, wid * 0.6);
      ctx.quadraticCurveTo(len * 0.45, wid * 0.4, 0, 0);
      break;
    }
    case 'round': {
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(len * 0.1, -wid * 1.3, len * 1.05, -wid * 1.2, len, 0);
      ctx.bezierCurveTo(len * 1.05, wid * 1.2, len * 0.1, wid * 1.3, 0, 0);
      break;
    }
    case 'pinnate': {
      // a compound leaf drawn as its leaflet pairs (the caller strokes nothing)
      const pairs = 6 + ((rng() * 4) | 0);
      for (let k = 0; k < pairs; k++) {
        const t = 0.12 + (k / pairs) * 0.86;
        for (const side of [-1, 1]) {
          ctx.moveTo(len * t, 0);
          ctx.ellipse(len * t + wid * 0.25, side * wid * 0.55, wid * 0.48, wid * 0.22, side * 0.6, 0, Math.PI * 2);
        }
      }
      ctx.moveTo(len, 0);
      ctx.ellipse(len, 0, wid * 0.45, wid * 0.2, 0, 0, Math.PI * 2);
      break;
    }
    default: {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.35, -wid * 1.25, len, 0);
      ctx.quadraticCurveTo(len * 0.35, wid * 1.25, 0, 0);
    }
  }
  ctx.closePath();
}

interface BroadleafRecipe {
  shape: LeafShape;
  leafLen: number;      // fraction of the tile
  leafAspect: number;   // half-width / length
  petiole: number;      // fraction of the leaf length
  spacing: number;      // fraction of the tile between leaves along a twig
  leafAngle: number;    // radians from the twig
  twigs: readonly [number, number];
  twigLen: readonly [number, number];
  twigAngle: number;
  hang: number;         // 0 = sprays upward, 1 = the twig hangs (willow, birch)
  droop: number;        // leaves bend toward gravity
  stemWidth: number;
}

const BROADLEAF_RECIPES: Readonly<Record<string, BroadleafRecipe>> = Object.freeze({
  oak: { shape: 'lobed', leafLen: 0.15, leafAspect: 0.36, petiole: 0.08, spacing: 0.055, leafAngle: 0.85, twigs: [3, 5], twigLen: [0.26, 0.40], twigAngle: 0.75, hang: 0, droop: 0.15, stemWidth: 3.2 },
  poplar: { shape: 'deltoid', leafLen: 0.11, leafAspect: 0.48, petiole: 0.55, spacing: 0.05, leafAngle: 0.95, twigs: [3, 5], twigLen: [0.22, 0.34], twigAngle: 0.55, hang: 0, droop: 0.35, stemWidth: 2.6 },
  willow: { shape: 'lance', leafLen: 0.15, leafAspect: 0.11, petiole: 0.04, spacing: 0.024, leafAngle: 0.45, twigs: [4, 6], twigLen: [0.45, 0.68], twigAngle: 0.28, hang: 1, droop: 0.4, stemWidth: 1.8 },
  acacia: { shape: 'pinnate', leafLen: 0.16, leafAspect: 0.15, petiole: 0.10, spacing: 0.034, leafAngle: 0.9, twigs: [5, 7], twigLen: [0.24, 0.38], twigAngle: 0.95, hang: 0, droop: 0.05, stemWidth: 2.4 },
  eucalyptus: { shape: 'falcate', leafLen: 0.20, leafAspect: 0.16, petiole: 0.10, spacing: 0.06, leafAngle: 0.55, twigs: [2, 4], twigLen: [0.30, 0.48], twigAngle: 0.4, hang: 0.7, droop: 0.7, stemWidth: 2.2 },
  birch: { shape: 'oval', leafLen: 0.09, leafAspect: 0.44, petiole: 0.3, spacing: 0.042, leafAngle: 0.95, twigs: [4, 6], twigLen: [0.30, 0.50], twigAngle: 0.55, hang: 0.85, droop: 0.4, stemWidth: 1.6 },
  aspen: { shape: 'round', leafLen: 0.085, leafAspect: 0.5, petiole: 0.45, spacing: 0.045, leafAngle: 0.95, twigs: [3, 5], twigLen: [0.22, 0.36], twigAngle: 0.6, hang: 0, droop: 0.45, stemWidth: 2.0 },
});

/** One broadleaf spray tile: a stem, side twigs, a back layer and a front layer of leaves. */
function paintBroadleafTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, kind: SprayKind, recipe: BroadleafRecipe): Pt[][] {
  const base = LEAF_COLOR[kind];
  const stemColor = css(0.075, 0.20, 0.10);
  // the stem rises from the bottom centre (the card's seat) toward the top; a hanging spray arcs over and down
  const p0 = { x: S * 0.5, y: S * 0.95 };
  const stemLen = S * (recipe.hang > 0.5 ? 0.78 : 0.80);
  const lean = (rng() - 0.5) * 0.35;
  const stem = twigPoints(p0, -Math.PI / 2 + lean, stemLen, (rng() - 0.5) * 0.5, 10);
  const twigs: Pt[][] = [stem];
  const nTw = recipe.twigs[0] + ((rng() * (recipe.twigs[1] - recipe.twigs[0] + 1)) | 0);
  for (let k = 0; k < nTw; k++) {
    const t = 0.18 + (k + rng() * 0.6) / nTw * 0.7;
    const at = pointAt(stem, t);
    const side = k % 2 === 0 ? -1 : 1;
    const len = S * (recipe.twigLen[0] + rng() * (recipe.twigLen[1] - recipe.twigLen[0])) * (1.1 - t * 0.5);
    const angle = at.a + side * (recipe.twigAngle + (rng() - 0.5) * 0.3);
    // a hanging twig falls away from its parent (gravity is +y on the canvas, toward the seat end of the card —
    // the card's far end is the tile's top, so "down the card" is the stem's own direction)
    const bend = side * (recipe.hang > 0.5 ? -0.4 : 0.35) + (rng() - 0.5) * 0.3;
    twigs.push(twigPoints(at.p, angle, len, bend, 7));
  }
  const leafLen = S * recipe.leafLen;
  const leafW = leafLen * recipe.leafAspect;
  // the shaded body under the leaves (the pinnate and the lanceolate sprays stay airier)
  paintSprayBody(ctx, twigs, leafLen * 1.5, base, recipe.shape === 'pinnate' || recipe.shape === 'lance' ? 0.55 : 0.85);
  // two layers: the back leaves (darker, the shaded interior of the spray) then the twigs, then the front leaves
  for (let layer = 0; layer < 2; layer++) {
    if (layer === 1) {
      for (let i = twigs.length - 1; i >= 0; i--) taperStroke(ctx, twigs[i], i === 0 ? recipe.stemWidth * S / 256 : recipe.stemWidth * 0.55 * S / 256, 0.7 * S / 256, stemColor);
    }
    for (let ti = 0; ti < twigs.length; ti++) {
      const tw = twigs[ti];
      let twLen = 0;
      for (let i = 1; i < tw.length; i++) twLen += Math.hypot(tw[i].x - tw[i - 1].x, tw[i].y - tw[i - 1].y);
      const n = Math.max(2, Math.round(twLen / (S * recipe.spacing)));
      for (let k = 0; k <= n; k++) {
        const t = ti === 0 ? 0.25 + 0.75 * (k / n) : 0.12 + 0.88 * (k / n);
        const at = pointAt(tw, t);
        const side = (k % 2 === 0 ? -1 : 1) * (layer === 0 ? -1 : 1);
        const terminal = k === n;
        const size = (0.75 + rng() * 0.45) * (terminal ? 1.1 : 1) * (layer === 0 ? 0.92 : 1) * (0.85 + 0.25 * t);
        const L = leafLen * size, W = leafW * size;
        const angle = terminal ? at.a + (rng() - 0.5) * 0.3 : at.a + side * (recipe.leafAngle + (rng() - 0.5) * 0.35);
        // leaves turn toward gravity a little (canvas +y): blend the angle toward PI/2 by the droop
        const g = recipe.droop * (layer === 0 ? 0.6 : 1);
        const ax = Math.cos(angle) * (1 - g * 0.5), ay = Math.sin(angle) * (1 - g * 0.5) + g * 0.5;
        const a = Math.atan2(ay, ax);
        // value: lighter toward the spray tip (young leaves, the sun side); the back layer in shade
        const sun = 0.80 + 0.32 * t + (rng() - 0.5) * 0.36;
        const deep = rng() < 0.14 ? 0.6 : 1;
        const light = base.light * sun * deep * (layer === 0 ? 0.6 : 1);
        const hue = base.hue + (rng() - 0.5) * 0.035 + (t - 0.5) * 0.012;
        const sat = base.sat * (0.88 + rng() * 0.24);
        ctx.save();
        ctx.translate(at.p.x, at.p.y);
        ctx.rotate(a);
        // the petiole: the leaf is stalked away from its twig
        const pet = L * recipe.petiole;
        if (pet > 0.8) {
          ctx.strokeStyle = css(hue - 0.02, sat * 0.6, light * 0.75);
          ctx.lineWidth = Math.max(0.5, S / 512);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(pet, 0); ctx.stroke();
        }
        ctx.translate(pet, 0);
        ctx.fillStyle = css(hue, sat, light);
        leafPath(ctx, recipe.shape, L, W, rng);
        ctx.fill();
        if (recipe.shape !== 'pinnate' && L > S * 0.03) {
          // the sunward half of the blade a touch lighter, the midrib darker
          ctx.fillStyle = css(hue - 0.006, sat * 0.95, light * 1.18, 0.55);
          ctx.beginPath();
          ctx.moveTo(L * 0.05, 0);
          ctx.quadraticCurveTo(L * 0.4, -W * 0.95, L * 0.95, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = css(hue + 0.01, sat * 0.8, light * 0.62);
          ctx.lineWidth = Math.max(0.45, S / 700);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.92, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  return twigs;
}

/** Needles: short strokes from a twig, both sides (and forward for a bottle-brush). */
function paintNeedleTwig(
  ctx: CanvasRenderingContext2D, S: number, rng: Rng, twig: Pt[], base: LeafColor,
  needleLen: number, density: number, spread: number, flat: boolean, young: number,
): void {
  let len = 0;
  for (let i = 1; i < twig.length; i++) len += Math.hypot(twig[i].x - twig[i - 1].x, twig[i].y - twig[i - 1].y);
  const n = Math.max(4, Math.round(len * density / (S / 256)));
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const at = pointAt(twig, t);
    const side = k % 2 === 0 ? -1 : 1;
    const nl = S * needleLen * (0.75 + rng() * 0.5) * (0.7 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)));
    // flat (fir): two ranks at the side; brush (spruce): a spread round the axis, forward-swept
    const a = at.a + side * (flat ? 1.25 + (rng() - 0.5) * 0.3 : spread * (0.3 + rng() * 0.9)) - (flat ? 0 : side * 0.1);
    const tip = t > 1 - young;
    const light = base.light * (tip ? 1.45 : 0.75 + rng() * 0.45) * (0.85 + 0.3 * t);
    ctx.strokeStyle = css(base.hue + (tip ? -0.04 : (rng() - 0.5) * 0.03), base.sat * (tip ? 1.15 : 1), light);
    ctx.lineWidth = Math.max(0.6, S / 256 * (flat ? 1.5 : 1.25));
    ctx.beginPath();
    ctx.moveTo(at.p.x, at.p.y);
    ctx.lineTo(at.p.x + Math.cos(a) * nl, at.p.y + Math.sin(a) * nl);
    ctx.stroke();
  }
}

function paintConiferTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, kind: SprayKind): Pt[][] {
  const base = LEAF_COLOR[kind];
  const wood = css(0.06, 0.25, 0.09);
  const p0 = { x: S * 0.5, y: S * 0.95 };
  if (kind === 'pine') {
    // a short woody shoot ending in bundles of long needles fanned forward (and a second, older tuft below)
    const stem = twigPoints(p0, -Math.PI / 2 + (rng() - 0.5) * 0.3, S * 0.42, (rng() - 0.5) * 0.4, 6);
    taperStroke(ctx, stem, S * 0.016, S * 0.009, wood);
    const tufts = [{ t: 1, r: 1 }, { t: 0.55, r: 0.75 }, { t: 0.78, r: 0.7 }];
    // each tuft's dense heart: the needles crowd at the shoot's tip
    for (const tuft of tufts) {
      const at = pointAt(stem, tuft.t), r = S * 0.17 * tuft.r;
      const gr = ctx.createRadialGradient(at.p.x, at.p.y - r * 0.4, 0, at.p.x, at.p.y - r * 0.4, r);
      gr.addColorStop(0, css(base.hue + 0.01, base.sat * 0.85, base.light * 0.5, 0.75));
      gr.addColorStop(1, css(base.hue + 0.01, base.sat * 0.85, base.light * 0.5, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(at.p.x, at.p.y - r * 0.4, r, 0, Math.PI * 2); ctx.fill();
    }
    for (const tuft of tufts) {
      const at = pointAt(stem, tuft.t);
      const bundles = Math.round(34 * tuft.r);
      for (let k = 0; k < bundles; k++) {
        const a = at.a + (rng() - 0.5) * (tuft.t === 1 ? 2.6 : 3.2);
        const nl = S * (0.30 + rng() * 0.16) * tuft.r * (tuft.t === 1 ? 1 : 0.8);
        const light = base.light * (0.7 + rng() * 0.55) * (tuft.t === 1 ? 1.05 : 0.85);
        ctx.strokeStyle = css(base.hue + (rng() - 0.5) * 0.03, base.sat, light);
        ctx.lineWidth = Math.max(0.7, S / 256 * 1.3);
        for (let pair = 0; pair < 2; pair++) {
          const aa = a + (pair - 0.5) * 0.06;
          ctx.beginPath();
          ctx.moveTo(at.p.x, at.p.y);
          ctx.quadraticCurveTo(at.p.x + Math.cos(aa) * nl * 0.5, at.p.y + Math.sin(aa) * nl * 0.5 + nl * 0.06,
            at.p.x + Math.cos(aa) * nl, at.p.y + Math.sin(aa) * nl + nl * 0.12);
          ctx.stroke();
        }
      }
    }
    return [stem];
  }
  if (kind === 'cypress') {
    // scale-leaf fronds: a flattened spray that forks again and again, thick and dense
    const frond = (p: Pt, a: number, len: number, depth: number): void => {
      const pts = twigPoints(p, a, len, (rng() - 0.5) * 0.25, 4);
      const light = base.light * (0.72 + 0.12 * depth + rng() * 0.25);
      taperStroke(ctx, pts, S * 0.034 * (depth + 1) / 3, S * 0.022, css(base.hue + (rng() - 0.5) * 0.03, base.sat, light));
      if (depth <= 0) return;
      const forks = 4 + ((rng() * 2) | 0);
      for (let k = 0; k < forks; k++) {
        const at = pointAt(pts, 0.25 + (k / forks) * 0.7);
        frond(at.p, at.a + (k % 2 ? 0.7 : -0.7) + (rng() - 0.5) * 0.3, len * 0.55, depth - 1);
      }
    };
    const spine = twigPoints(p0, -Math.PI / 2, S * 0.6, 0, 6);
    paintSprayBody(ctx, [spine], S * 0.30, base, 0.75, 0.45);
    frond(p0, -Math.PI / 2 + (rng() - 0.5) * 0.2, S * 0.62, 3);
    return [spine];
  }
  // spruce / fir / cedar: a main twig with side twigs, needled
  const stem = twigPoints(p0, -Math.PI / 2 + (rng() - 0.5) * 0.25, S * 0.80, (rng() - 0.5) * 0.35, 10);
  const twigs: Pt[][] = [stem];
  const sides = kind === 'cedar' ? 7 : 8;
  for (let k = 0; k < sides; k++) {
    const t = 0.12 + (k + rng() * 0.5) / sides * 0.78;
    const at = pointAt(stem, t);
    const side = k % 2 === 0 ? -1 : 1;
    const len = S * (kind === 'fir' ? 0.30 : 0.26) * (1.15 - t * 0.6) * (0.85 + rng() * 0.3);
    twigs.push(twigPoints(at.p, at.a + side * (kind === 'fir' ? 1.0 : 0.85), len, side * 0.15, 5));
  }
  paintSprayBody(ctx, twigs, S * (kind === 'cedar' ? 0.075 : 0.085), base, 0.9);
  for (const tw of twigs) taperStroke(ctx, tw, S * 0.010, S * 0.005, wood);
  if (kind === 'cedar') {
    // rosettes: little starbursts of short needles on spurs along the twigs
    for (const tw of twigs) {
      const n = 8 + ((rng() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const at = pointAt(tw, (k + 0.5) / n);
        const rays = 15 + ((rng() * 7) | 0), rr = S * (0.038 + rng() * 0.022);
        const light = base.light * (0.75 + rng() * 0.5);
        ctx.strokeStyle = css(base.hue + (rng() - 0.5) * 0.04, base.sat, light);
        ctx.lineWidth = Math.max(0.6, S / 256 * 1.2);
        for (let r = 0; r < rays; r++) {
          const a = (r / rays) * Math.PI * 2 + rng() * 0.3;
          ctx.beginPath();
          ctx.moveTo(at.p.x, at.p.y);
          ctx.lineTo(at.p.x + Math.cos(a) * rr, at.p.y + Math.sin(a) * rr * 0.75);
          ctx.stroke();
        }
      }
    }
    return twigs;
  }
  const flat = kind === 'fir';
  for (let i = twigs.length - 1; i >= 0; i--) {
    paintNeedleTwig(ctx, S, rng, twigs[i], base, flat ? 0.058 : 0.052, flat ? 4.0 : 5.2, flat ? 1.2 : 1.35, flat, i === 0 ? 0.18 : 0.25);
  }
  if (flat) {
    // the fir's silver undersides show as pale lines along the twigs
    ctx.globalAlpha = 0.35;
    for (const tw of twigs) taperStroke(ctx, tw, S * 0.004, S * 0.003, css(0.42, 0.12, 0.45));
    ctx.globalAlpha = 1;
  }
  return twigs;
}

/** Bare winter twigs: a fine forked lattice (birch / aspen crowns without leaves). */
function paintBareTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR['birch-bare'];
  const limbs: Pt[][] = [];
  const branch = (p: Pt, a: number, len: number, w: number, depth: number): void => {
    const pts = twigPoints(p, a, len, (rng() - 0.5) * 0.4, 4);
    if (depth >= 4) limbs.push(pts);
    taperStroke(ctx, pts, w, w * 0.6, css(base.hue + rng() * 0.02, base.sat, base.light * (0.8 + rng() * 0.4)));
    if (depth <= 0 || len < S * 0.03) return;
    const forks = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < forks; k++) {
      const at = pointAt(pts, 0.35 + rng() * 0.6);
      branch(at.p, at.a + (rng() - 0.5) * 1.1, len * (0.5 + rng() * 0.2), w * 0.65, depth - 1);
    }
  };
  // the gauze: thousands of sub-pixel twigs read as a translucent purple-grey haze at range
  for (let k = 0; k < 14; k++) {
    const x = S * (0.3 + rng() * 0.4), y = S * (0.15 + rng() * 0.55), r = S * (0.08 + rng() * 0.12);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, css(base.hue, base.sat, base.light * 0.9, 0.30));
    gr.addColorStop(1, css(base.hue, base.sat, base.light * 0.9, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let k = 0; k < 3; k++) {
    branch({ x: S * (0.5 + (k - 1) * 0.04), y: S * 0.95 }, -Math.PI / 2 + (k - 1) * 0.38 + (rng() - 0.5) * 0.3, S * (0.42 + rng() * 0.1), S * 0.013, 5);
  }
  return limbs;
}

/**
 * Paint one species atlas: four tiles (2 × 2) of `size` / 2 px each, straight alpha, toned by the map palette's
 * texTone. Returns the ImageData-backed texture (sRGB, anisotropy 8, mipmapped).
 */
export function makeSprayAtlas(kind: SprayKind, rng: Rng, size: number, tone: ToneFunction | null = null, snow = 0): THREE.Texture {
  const s = Math.max(64, size | 0), T = SPRAY_ATLAS_TILES, S = Math.floor(s / T);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('world/treeSprayAtlas: Canvas2D context unavailable');
  ctx.clearRect(0, 0, s, s);
  let snowSeed = 0x5a0f ^ Math.round(snow * 1000);
  const snowRng: Rng = () => { snowSeed = (Math.imul(snowSeed ^ (snowSeed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0; return ((snowSeed ^ (snowSeed >>> 13)) >>> 0) / 4294967296; };
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx * S, ty * S, S, S);
    ctx.clip();
    ctx.translate(tx * S, ty * S);
    const twigs = kind === 'birch-bare' ? paintBareTile(ctx, S, rng)
      : BROADLEAF_RECIPES[kind] ? paintBroadleafTile(ctx, S, rng, kind, BROADLEAF_RECIPES[kind])
        : paintConiferTile(ctx, S, rng, kind);
    // a winter palette's snow load rides the twigs (its own stream: the leaf painting never moves)
    if (snow > 0.05) paintSpraySnow(ctx, twigs, S * (kind === 'birch-bare' ? 0.035 : 0.07), snow, snowRng);
    ctx.restore();
  }
  const image = ctx.getImageData(0, 0, s, s);
  finishSprayTiles(image.data, s, S, T);
  applyTone(image.data, tone);
  const texture = new THREE.Texture(image as unknown as HTMLImageElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.name = `sprayAtlas:${kind}`;
  return texture;
}

/**
 * Per tile: the elliptical edge falloff (alpha to zero toward the tile border, the stem seat at the bottom centre
 * kept) and the flood of empty texels with the tile's mean leaf tone.
 */
export function finishSprayTiles(d: Uint8ClampedArray, s: number, S: number, T: number): void {
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((ty * S + y) * s + tx * S + x) * 4;
      if (d[i + 3] > 160) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    const fr = n ? r / n : 60, fg = n ? g / n : 70, fb = n ? b / n : 40;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((ty * S + y) * s + tx * S + x) * 4;
      const ex = (x + 0.5) / S * 2 - 1, ey = (y + 0.5) / S * 2 - 1;
      // the ellipse is a little taller at the bottom (the seat) than at the top
      const e = Math.hypot(ex / 0.98, ey / (ey > 0 ? 1.04 : 0.98));
      const fall = Math.max(0, Math.min(1, (1.0 - e) / 0.16));
      d[i + 3] = Math.round(d[i + 3] * fall);
      if (d[i + 3] < 24) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; }
    }
  }
}

/**
 * p2 trees lane: the palm's frond for the legacy palm geometry's frond strips (one frond across the whole texture,
 * its rachis from the bottom centre — the strip's base — to the top): a pinnate frond, not the round-8 solid leaf
 * blade — a curved yellow-green rachis, sixty-odd narrow leaflets a side swept toward the tip in a shallow V, longest
 * a little below the middle, darker on the under layer, drying to straw at the tip, a few torn out. Straight alpha,
 * flooded with the frond's mean tone; deterministic from the RNG.
 */
export function makePalmFrondAtlas(rng: Rng, size: number, tone: ToneFunction | null = null): THREE.Texture {
  const s = Math.max(64, size | 0);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('world/treeSprayAtlas: Canvas2D context unavailable');
  ctx.clearRect(0, 0, s, s);
  const K = s / 256;
  const bend = (rng() - 0.5) * 0.10;
  const rachis = (t: number): Pt => ({ x: s * (0.5 + Math.sin(t * Math.PI * 0.9) * bend), y: s * (0.985 - 0.95 * t) });
  const pairs = 58;
  for (let layer = 0; layer < 2; layer++) {
    for (let k = 0; k < pairs; k++) {
      const t = 0.06 + (k / (pairs - 1)) * 0.92;
      const at = rachis(t), ahead = rachis(Math.min(1, t + 0.01));
      const dir = Math.atan2(ahead.y - at.y, ahead.x - at.x);
      const env = Math.sin(Math.PI * Math.min(1, t * 1.06)) ** 0.8;
      const dry = t > 0.82 ? (t - 0.82) / 0.18 : 0;
      for (const side of [-1, 1]) {
        if (rng() < 0.05 + dry * 0.25) continue; // torn or missing leaflets
        const len = s * (0.06 + 0.40 * env) * (0.85 + rng() * 0.3) * (layer === 0 ? 1.04 : 1);
        const sweep = 0.55 + rng() * 0.25 - t * 0.15;       // forward sweep from the rachis
        const a = dir + side * (Math.PI / 2 - sweep * 1.1);
        const droop = len * (0.10 + 0.12 * t);
        const w = Math.max(0.9, (2.6 - t * 1.2) * K * (layer === 0 ? 1.2 : 1));
        const light = layer === 0 ? 0.12 + rng() * 0.04 : 0.19 + t * 0.06 + rng() * 0.07 + dry * 0.10;
        const hue = 0.21 - dry * 0.10 + (rng() - 0.5) * 0.02;
        ctx.strokeStyle = css(hue, layer === 0 ? 0.30 : 0.34 - dry * 0.14, light);
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        const ex = at.x + Math.cos(a) * len, ey = at.y + Math.sin(a) * len + droop;
        ctx.beginPath();
        ctx.moveTo(at.x, at.y);
        ctx.quadraticCurveTo(at.x + Math.cos(a) * len * 0.55, at.y + Math.sin(a) * len * 0.55 - droop * 0.2, ex, ey);
        ctx.stroke();
      }
    }
  }
  const pts: Pt[] = [];
  for (let i = 0; i <= 16; i++) pts.push(rachis(i / 16));
  taperStroke(ctx, pts, 5.2 * K, 1.2 * K, css(0.13, 0.30, 0.26));
  const image = ctx.getImageData(0, 0, s, s);
  const d = image.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 160) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const fr = n ? r / n : 55, fg = n ? g / n : 76, fb = n ? b / n : 38;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 24) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; }
  applyTone(d, tone);
  const texture = new THREE.Texture(image as unknown as HTMLImageElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.name = 'sprayAtlas:palm';
  return texture;
}
