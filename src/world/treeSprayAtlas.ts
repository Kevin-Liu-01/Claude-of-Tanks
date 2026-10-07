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
  | 'spruce' | 'fir' | 'pine' | 'cedar' | 'cypress' | 'mangrove'
  // trees round 2 (2026-10-03): the regional forms (treeBiomes.ts)
  | 'beech' | 'chestnut' | 'holmOak' | 'olive' | 'canaryPine' | 'aleppoPine' | 'larch' | 'broom'
  // the Arizona uplands (Copper Mesa)
  | 'juniper' | 'pinyon'
  // trees round 5 (2026-10-05, the map-revival lanes): the longleaf pine and its grass-stage seedlings, the cedar of
  // Lebanon, the Aso caldera's sugi and Japanese red pine
  | 'longleafPine' | 'longleafSeedling' | 'lebanonCedar' | 'sugi' | 'redPine'
  // trees round 5: the ruderal buddleia of waste ground, slag and rail sidings (a shrub form)
  | 'buddleia'
  // the winter kinds (a map's `vegetation.bare`): the oak's and the poplar's bare twigs, the buddleia's winter canes
  | 'oak-bare' | 'poplar-bare' | 'buddleia-bare'
  // the Streuobst meadow orchard's fruit trees (one form: apple, pear and plum sprays on its tiles)
  | 'apple'
  // the trees lane (2026-10-07): the bocage banks' crest shrubs — gorse (north Finistère), blackthorn (Hesse)
  | 'gorse' | 'blackthorn';
export const SPRAY_KINDS: readonly SprayKind[] = Object.freeze(['oak', 'poplar', 'willow', 'acacia', 'eucalyptus',
  'birch', 'aspen', 'birch-bare', 'spruce', 'fir', 'pine', 'cedar', 'cypress', 'mangrove',
  'beech', 'chestnut', 'holmOak', 'olive', 'canaryPine', 'aleppoPine', 'larch', 'broom', 'juniper', 'pinyon',
  'longleafPine', 'longleafSeedling', 'lebanonCedar', 'sugi', 'redPine', 'buddleia', 'oak-bare', 'poplar-bare', 'buddleia-bare', 'apple',
  'gorse', 'blackthorn']);
/** Tiles per side of every spray atlas. */
export const SPRAY_ATLAS_TILES = 2;
// the winter kinds' opaque shares (measured as the table's)
const OAK_BARE_COVERAGE = 0.122;
const POPLAR_BARE_COVERAGE = 0.118;
const BUDDLEIA_BARE_COVERAGE = 0.084;
// the orchard atlas' opaque share (measured as the table's)
const APPLE_COVERAGE = 0.222;
/**
 * Trees round 2 (2026-10-03): each atlas's opaque share, the mean alpha over its painted 512 px atlas
 * (treeCrownShading.selftest.mjs paints them again and holds the table to it). The crown shadow hull's porosity reads
 * it (treeGrowth.ts emitCrownShadowHull): a spray card stops this share of the sun that meets it.
 */
export const SPRAY_ATLAS_COVERAGE: Readonly<Record<SprayKind, number>> = Object.freeze({
  oak: 0.279, poplar: 0.255, willow: 0.163, acacia: 0.175, eucalyptus: 0.193, birch: 0.235, aspen: 0.256,
  'birch-bare': 0.15, spruce: 0.241, fir: 0.287, pine: 0.092, cedar: 0.186, cypress: 0.292, mangrove: 0.241,
  beech: 0.292, chestnut: 0.337, holmOak: 0.198, olive: 0.188, canaryPine: 0.098, aleppoPine: 0.071, larch: 0.154,
  broom: 0.125, juniper: 0.256, pinyon: 0.074,
  longleafPine: 0.169, longleafSeedling: 0.216, lebanonCedar: 0.21, sugi: 0.187, redPine: 0.099, buddleia: 0.133,
  'oak-bare': OAK_BARE_COVERAGE, 'poplar-bare': POPLAR_BARE_COVERAGE, 'buddleia-bare': BUDDLEIA_BARE_COVERAGE,
  apple: APPLE_COVERAGE,
  gorse: 0.214, blackthorn: 0.164,
});

/**
 * Trees round 4 (the gauntlet's wave 68): a broadleaf tile's leaves at this share of the recipe's length and spacing,
 * on this many more twigs, the back layer this light and the midrib this light against the blade.
 */
const SPRAY_LEAF_LAW = Object.freeze({ leafScale: 0.82, spacingScale: 0.72, extraTwigs: 5, backLayer: 0.72, vein: 0.8, stemFrom: 0.25, wood: 1 });
/** The pinnate sprays (the acacia's leaflets) as they were: round 4's parasol is tuned on them. */
const SPRAY_LEAF_LAW_PINNATE = Object.freeze({ leafScale: 1, spacingScale: 1, extraTwigs: 0, backLayer: 0.6, vein: 0.62, stemFrom: 0.25, wood: 1 });
/**
 * Trees round 5 (2026-10-05, the gauntlet's wave 98 on the near field bush: "flat, opaque, hard-edged lobed leaf cards
 * two to four times life size with no twigs", "single leaf clumps on hairline stalks that read as floating lollipops"):
 * a shrub's spray tile (makeSprayAtlas' `shrub` atlas). A field bush's cards run 1-2.4 m (its sprays at a shrub's
 * length times the bush's 1.8-3.7 scale), so a crown tile's leaves painted 10-20 cm there; the shrub's are under half
 * the size, twice as close, on seven more twigs — a hazel's or a hawthorn's 4-7 cm — clothing the stem from its seat
 * (no bare stalk), and the stem and twigs are wood, half again as thick, lighter than the leaves.
 */
const SHRUB_LEAF_LAW = Object.freeze({ leafScale: 0.48, spacingScale: 0.34, extraTwigs: 7, backLayer: 0.7, vein: 0.85, stemFrom: 0.05, wood: 1.5 });
const SHRUB_LEAF_LAW_PINNATE = Object.freeze({ leafScale: 0.6, spacingScale: 0.6, extraTwigs: 4, backLayer: 0.6, vein: 0.62, stemFrom: 0.05, wood: 1.5 });
/**
 * Trees round 5: the tile a shrub atlas paints its stool's stems on (the last tile; makeSprayAtlas' `shrub`): its
 * sprays take the others (vegetation.ts buildGrownShrub).
 */
export const SHRUB_STEM_TILE = SPRAY_ATLAS_TILES * SPRAY_ATLAS_TILES - 1;

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
  // the tidal mangrove's thick, glossy, dark elliptic leaves (the Mangrove map's willow form)
  mangrove: { hue: 0.235, sat: 0.40, light: 0.17 },
  // trees round 2: the beech's fresh glossy green, the chestnut's deep green, the holm oak's dark leathery green, the
  // olive's silver grey-green, the Canary pine's yellow-green needles, the Aleppo pine's pale ones, the larch's soft
  // light green
  beech: { hue: 0.235, sat: 0.42, light: 0.225 },
  chestnut: { hue: 0.225, sat: 0.40, light: 0.20 },
  holmOak: { hue: 0.25, sat: 0.26, light: 0.145 },
  olive: { hue: 0.20, sat: 0.13, light: 0.30 },
  canaryPine: { hue: 0.245, sat: 0.36, light: 0.19 },
  aleppoPine: { hue: 0.255, sat: 0.28, light: 0.21 },
  larch: { hue: 0.255, sat: 0.40, light: 0.25 },
  // the broom's green-grey switches
  broom: { hue: 0.22, sat: 0.16, light: 0.26 },
  // the juniper's grey, faintly blue scale leaves; the pinyon's dark grey-green needles
  juniper: { hue: 0.36, sat: 0.16, light: 0.2 },
  pinyon: { hue: 0.29, sat: 0.24, light: 0.16 },
  // trees round 5: the longleaf's bright, glossy, yellow-green needles (its seedlings' the same), the cedar of Lebanon's
  // dark blue-green, sugi's deep green awl needles, the Japanese red pine's slender bright needles
  longleafPine: { hue: 0.265, sat: 0.42, light: 0.2 },
  longleafSeedling: { hue: 0.265, sat: 0.4, light: 0.21 },
  // the buddleia's grey-green, felted leaves
  buddleia: { hue: 0.25, sat: 0.2, light: 0.21 },
  // the winter kinds: the oak's grey-brown twigs, the poplar's olive-brown shoots, the buddleia's dry rust-brown
  // panicles on pale canes
  'oak-bare': { hue: 0.075, sat: 0.1, light: 0.2 },
  'poplar-bare': { hue: 0.1, sat: 0.14, light: 0.24 },
  'buddleia-bare': { hue: 0.065, sat: 0.45, light: 0.17 },
  // the orchard's mid green, a little grey with the leaves' down
  apple: { hue: 0.225, sat: 0.34, light: 0.21 },
  // the trees lane (2026-10-07): gorse's dark spiny green (its yellow flowers painted over it), blackthorn's small dark
  // leaves on black twigs
  gorse: { hue: 0.27, sat: 0.34, light: 0.18 },
  blackthorn: { hue: 0.265, sat: 0.3, light: 0.16 },
  lebanonCedar: { hue: 0.39, sat: 0.2, light: 0.15 },
  sugi: { hue: 0.33, sat: 0.32, light: 0.15 },
  redPine: { hue: 0.26, sat: 0.38, light: 0.19 },
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
function paintSprayBody(ctx: CanvasRenderingContext2D, twigs: Pt[][], width: number, base: LeafColor, strength = 1, stemFrom = 0.3,
  cap: CanvasLineCap = 'round', reach = 1): void {
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  for (const [w, a] of [[1.0, 0.30], [0.72, 0.45], [0.45, 0.6]] as const) {
    ctx.strokeStyle = css(base.hue + 0.015, base.sat * 0.85, base.light * 0.42, a * strength);
    twigs.forEach((tw, index) => {
      // the stem's lower part is bare (the leaves begin a third of the way up); a side twig carries leaves from its base
      const from = index === 0 ? Math.max(1, Math.round(stemFrom * (tw.length - 1))) : 1;
      // trees round 2: a needled twig's body stops short of its tip (the needles make the tip's fringe)
      const to = Math.max(from + 1, Math.round((tw.length - 1) * reach) + 1);
      if (from >= tw.length) return;
      ctx.lineWidth = width * w;
      ctx.beginPath();
      ctx.moveTo(tw[from - 1].x, tw[from - 1].y);
      for (let i = from; i < Math.min(tw.length, to); i++) ctx.lineTo(tw[i].x, tw[i].y);
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
      if (rng() > Math.min(0.95, snow)) continue;
      const at = pointAt(tw, (k + 0.5) / n);
      const r = reach * (0.45 + rng() * 0.5) * (0.6 + 0.4 * snow);
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

type LeafShape = 'lobed' | 'deltoid' | 'lance' | 'falcate' | 'oval' | 'round' | 'pinnate' | 'serrate';

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
    case 'serrate': {
      // trees round 2: a chestnut's long blade with a toothed margin (a tooth every ninth of its length a side)
      const teeth = 9;
      ctx.moveTo(0, 0);
      for (const side of [-1, 1]) {
        const pts: Array<[number, number]> = [];
        for (let k = 0; k <= teeth; k++) {
          const t = k / teeth;
          const env = Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)) ** 0.8 * wid;
          pts.push([len * t, side * env * (k % 2 === 0 ? 1.06 : 0.9)]);
        }
        if (side === -1) for (const [x, y] of pts) ctx.lineTo(x, y);
        else for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1]);
      }
      ctx.lineTo(0, 0);
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

// Trees round 2 (2026-10-03): the tiles are leaf CLUSTERS now — the crowns' cards are 0.55–1.1 m and turn to face the
// camera (vegetation.ts COT_LEAF_BILLBOARD), so a tile carries more, smaller leaves on more twigs (an oak's at about
// 8 cm on its 0.75 m card, where the round-1 tile's 15 % of a 1.6 m card painted 24 cm leaves that read as painted
// plates at 30 m), its body fills the cluster, and its leaves light by where they sit in it (paintBroadleafTile).
const BROADLEAF_RECIPES: Readonly<Record<string, BroadleafRecipe>> = Object.freeze({
  oak: { shape: 'lobed', leafLen: 0.105, leafAspect: 0.38, petiole: 0.08, spacing: 0.036, leafAngle: 0.85, twigs: [5, 7], twigLen: [0.24, 0.38], twigAngle: 0.75, hang: 0, droop: 0.15, stemWidth: 3.0 },
  poplar: { shape: 'deltoid', leafLen: 0.085, leafAspect: 0.48, petiole: 0.5, spacing: 0.034, leafAngle: 0.95, twigs: [4, 6], twigLen: [0.22, 0.34], twigAngle: 0.55, hang: 0, droop: 0.35, stemWidth: 2.4 },
  willow: { shape: 'lance', leafLen: 0.125, leafAspect: 0.12, petiole: 0.04, spacing: 0.02, leafAngle: 0.45, twigs: [5, 7], twigLen: [0.45, 0.68], twigAngle: 0.28, hang: 1, droop: 0.4, stemWidth: 1.8 },
  acacia: { shape: 'pinnate', leafLen: 0.13, leafAspect: 0.15, petiole: 0.10, spacing: 0.044, leafAngle: 0.9, twigs: [5, 7], twigLen: [0.24, 0.38], twigAngle: 0.95, hang: 0, droop: 0.05, stemWidth: 2.2 },
  eucalyptus: { shape: 'falcate', leafLen: 0.15, leafAspect: 0.17, petiole: 0.10, spacing: 0.044, leafAngle: 0.55, twigs: [4, 6], twigLen: [0.30, 0.46], twigAngle: 0.45, hang: 0.7, droop: 0.7, stemWidth: 2.0 },
  birch: { shape: 'oval', leafLen: 0.078, leafAspect: 0.46, petiole: 0.3, spacing: 0.032, leafAngle: 0.95, twigs: [5, 7], twigLen: [0.30, 0.50], twigAngle: 0.55, hang: 0.85, droop: 0.4, stemWidth: 1.5 },
  // the trees lane (2026-10-07): the blackthorn of the hedged banks — small elliptic leaves crowded on many short, stiff,
  // spurred twigs
  blackthorn: { shape: 'oval', leafLen: 0.052, leafAspect: 0.42, petiole: 0.12, spacing: 0.022, leafAngle: 0.8, twigs: [7, 9], twigLen: [0.18, 0.3], twigAngle: 0.95, hang: 0, droop: 0.12, stemWidth: 2.2 },
  aspen: { shape: 'round', leafLen: 0.074, leafAspect: 0.5, petiole: 0.42, spacing: 0.034, leafAngle: 0.95, twigs: [4, 6], twigLen: [0.22, 0.36], twigAngle: 0.6, hang: 0, droop: 0.45, stemWidth: 1.9 },
  mangrove: { shape: 'oval', leafLen: 0.10, leafAspect: 0.40, petiole: 0.10, spacing: 0.038, leafAngle: 0.8, twigs: [4, 6], twigLen: [0.24, 0.36], twigAngle: 0.6, hang: 0, droop: 0.22, stemWidth: 2.6 },
  // trees round 2: the beech's level two-ranked sprays of wavy ovals, the chestnut's long serrated blades, the holm
  // oak's small crowded ovals, the olive's narrow willowy leaves in opposite pairs
  beech: { shape: 'oval', leafLen: 0.088, leafAspect: 0.5, petiole: 0.1, spacing: 0.032, leafAngle: 1.15, twigs: [5, 7], twigLen: [0.24, 0.38], twigAngle: 0.9, hang: 0, droop: 0.1, stemWidth: 2.2 },
  chestnut: { shape: 'serrate', leafLen: 0.15, leafAspect: 0.22, petiole: 0.06, spacing: 0.04, leafAngle: 0.8, twigs: [4, 6], twigLen: [0.26, 0.40], twigAngle: 0.7, hang: 0, droop: 0.25, stemWidth: 2.8 },
  holmOak: { shape: 'oval', leafLen: 0.068, leafAspect: 0.46, petiole: 0.08, spacing: 0.024, leafAngle: 0.85, twigs: [6, 8], twigLen: [0.22, 0.34], twigAngle: 0.7, hang: 0, droop: 0.12, stemWidth: 2.4 },
  olive: { shape: 'lance', leafLen: 0.085, leafAspect: 0.17, petiole: 0.04, spacing: 0.02, leafAngle: 0.55, twigs: [6, 8], twigLen: [0.24, 0.38], twigAngle: 0.65, hang: 0.2, droop: 0.3, stemWidth: 1.8 },
});

/**
 * Trees round 5: a spray's twigs, not an even herringbone (with a shrub's small leaves the near bush's cards read as fern
 * fronds; a crown's minified into one giant leaf): each at its own place up the stem, on either side as it falls, at
 * its own angle and length (from `floor` of the recipe's shortest), a third of them forking once.
 */
function shrubTwigs(stem: Pt[], twigs: Pt[][], S: number, rng: Rng, recipe: BroadleafRecipe, n: number, floor: number): void {
  for (let k = 0; k < n; k++) {
    const t = 0.1 + rng() * 0.82;
    const at = pointAt(stem, t);
    const side = rng() < 0.5 ? -1 : 1;
    const len = S * (recipe.twigLen[0] * floor + rng() * (recipe.twigLen[1] - recipe.twigLen[0] * floor)) * (1.2 - t * 0.6);
    const angle = at.a + side * recipe.twigAngle * (0.55 + rng() * 0.8);
    const bend = side * (recipe.hang > 0.5 ? -0.5 : 0.4) * rng() + (rng() - 0.5) * 0.5;
    const tw = twigPoints(at.p, angle, len, bend, 7);
    twigs.push(tw);
    if (rng() < 0.35) {
      const f = pointAt(tw, 0.35 + rng() * 0.3);
      twigs.push(twigPoints(f.p, f.a - side * (0.5 + rng() * 0.4), len * (0.35 + rng() * 0.25), (rng() - 0.5) * 0.4, 5));
    }
  }
}

/** One broadleaf spray tile: a stem, side twigs, a back layer and a front layer of leaves. */
function paintBroadleafTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, kind: SprayKind, recipe: BroadleafRecipe,
  shrub = false): Pt[][] {
  const base = LEAF_COLOR[kind];
  // trees round 5: a shrub's twigs are grey-brown wood, lighter than its leaves, so they read between them
  const stemColor = shrub ? css(0.07, 0.16, 0.15) : css(0.075, 0.20, 0.10);
  // the stem rises from the bottom centre (the card's seat) toward the top; a hanging spray arcs over and down
  const p0 = { x: S * 0.5, y: S * 0.95 };
  const stemLen = S * (recipe.hang > 0.5 ? 0.78 : 0.80);
  const lean = (rng() - 0.5) * 0.35;
  const stem = twigPoints(p0, -Math.PI / 2 + lean, stemLen, (rng() - 0.5) * 0.5, 10);
  const twigs: Pt[][] = [stem];
  // (the acacia's pinnate leaflets keep round 4's parasol tuning: the law is the blade-leaved sprays')
  const law = recipe.shape === 'pinnate' ? (shrub ? SHRUB_LEAF_LAW_PINNATE : SPRAY_LEAF_LAW_PINNATE) : shrub ? SHRUB_LEAF_LAW : SPRAY_LEAF_LAW;
  const nTw = recipe.twigs[0] + ((rng() * (recipe.twigs[1] - recipe.twigs[0] + 1)) | 0) + law.extraTwigs;
  // trees round 5 (the gauntlet's wave 98: the treeline's "leaf silhouettes are individually legible at that range [40-60
  // m], meaning the leaves are many times life size"): a crown's blade-leaved spray is not the even herringbone either —
  // a stem with its side twigs paired off evenly up it minified into one giant pinnate leaf on its stalk (a card at 50 m
  // is ~14 px); its twigs fall as a shrub's do (two more of them, at their full lengths) and its outline is a ragged
  // clump. The acacia's pinnate leaflets keep round 4's parasol tuning.
  const irregular = shrub || recipe.shape !== 'pinnate';
  if (irregular) shrubTwigs(stem, twigs, S, rng, recipe, nTw, shrub ? 0.8 : 1);
  else for (let k = 0; k < nTw; k++) {
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
  // trees round 4 (the gauntlet's wave 68 on the near bush: "each cluster card's alpha outline is one giant oak-leaf
  // silhouette with dark vein and edge lines", "flat painted cutouts with heavy black vein outlines"): the cluster is an
  // irregular spray of small leaves — smaller, closer leaves on three more twigs (SPRAY_LEAF_LAW) and no solid body under
  // them, whose band along every twig had outlined the tile as one leaf. Round 2's acacia body (below) adds no alpha.
  const leafLen = S * recipe.leafLen * law.leafScale;
  const leafW = leafLen * recipe.leafAspect;
  const pinnate = recipe.shape === 'pinnate';
  // two layers: the back leaves (darker, the shaded interior of the spray) then the twigs, then the front leaves
  for (let layer = 0; layer < 2; layer++) {
    if (layer === 1) {
      for (let i = twigs.length - 1; i >= 0; i--) {
        taperStroke(ctx, twigs[i], (i === 0 ? recipe.stemWidth : recipe.stemWidth * 0.55) * law.wood * S / 256, 0.7 * S / 256, stemColor);
      }
    }
    for (let ti = 0; ti < twigs.length; ti++) {
      const tw = twigs[ti];
      let twLen = 0;
      for (let i = 1; i < tw.length; i++) twLen += Math.hypot(tw[i].x - tw[i - 1].x, tw[i].y - tw[i - 1].y);
      const n = Math.max(2, Math.round(twLen / (S * recipe.spacing * law.spacingScale)));
      for (let k = 0; k <= n; k++) {
        // trees round 5: a shrub's leaves fall a little off the even step, now and then on the same side twice, and a
        // few are missing — no herringbone (shrubTwigs)
        const jt = irregular ? (rng() - 0.5) * 0.8 / n : 0, flip = irregular && rng() < 0.3 ? -1 : 1;
        if (irregular && k < n && rng() < (shrub ? 0.12 : 0.06)) continue;
        const t = Math.min(1, Math.max(0, (ti === 0 ? law.stemFrom + (1 - law.stemFrom) * (k / n) : 0.12 + 0.88 * (k / n)) + jt));
        const at = pointAt(tw, t);
        const side = (k % 2 === 0 ? -1 : 1) * (layer === 0 ? -1 : 1) * flip;
        const terminal = k === n;
        const size = (0.75 + rng() * 0.45) * (terminal ? 1.1 : 1) * (layer === 0 ? 0.92 : 1) * (0.85 + 0.25 * t);
        const L = leafLen * size, W = leafW * size;
        const angle = terminal ? at.a + (rng() - 0.5) * 0.3 : at.a + side * (recipe.leafAngle + (rng() - 0.5) * 0.35);
        // leaves turn toward gravity a little (canvas +y): blend the angle toward PI/2 by the droop
        const g = recipe.droop * (layer === 0 ? 0.6 : 1);
        const ax = Math.cos(angle) * (1 - g * 0.5), ay = Math.sin(angle) * (1 - g * 0.5) + g * 0.5;
        const a = Math.atan2(ay, ax);
        // value: lighter toward the spray tip (young leaves, the sun side); the back layer in shade. Trees round 2: and
        // by where the leaf sits in the cluster — the rim of the tile's leaf mass in the light, its heart in shade
        const rim = Math.min(1, Math.hypot(at.p.x - S * 0.5, (at.p.y - S * 0.52) * 0.9) / (S * 0.42));
        const sun = (0.80 + 0.32 * t + (rng() - 0.5) * 0.36) * (0.82 + 0.3 * rim);
        const deep = rng() < 0.14 ? 0.6 : 1;
        const light = base.light * sun * deep * (layer === 0 ? law.backLayer : 1);
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
          ctx.strokeStyle = css(hue + 0.01, sat * 0.8, light * law.vein);
          ctx.lineWidth = Math.max(0.4, S / 800);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.92, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  if (pinnate) {
    const composite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-atop';
    paintSprayBody(ctx, twigs, leafLen * 1.7, base, 0.9, 0.42);
    ctx.globalCompositeOperation = composite;
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
    // trees round 2: the young growth a quieter lift (the round-1 1.45 painted light blocks on every tip)
    const light = base.light * (tip ? 1.22 : 0.68 + rng() * 0.5) * (0.85 + 0.3 * t);
    ctx.strokeStyle = css(base.hue + (tip ? -0.04 : (rng() - 0.5) * 0.03), base.sat * (tip ? 1.15 : 1), light);
    ctx.lineWidth = Math.max(0.6, S / 256 * (flat ? 1.5 : 1.25));
    ctx.beginPath();
    ctx.moveTo(at.p.x, at.p.y);
    ctx.lineTo(at.p.x + Math.cos(a) * nl, at.p.y + Math.sin(a) * nl);
    ctx.stroke();
  }
}

/** A pine needle as the tile draws it: its seat, its end, the bend's control point, its side of the shoot, its tone. */
interface Needle {
  x: number; y: number; ex: number; ey: number; cx: number; cy: number;
  near: boolean; light: number; hue: number;
}

function paintConiferTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, kind: SprayKind): Pt[][] {
  const base = LEAF_COLOR[kind];
  const wood = css(0.06, 0.25, 0.09);
  const p0 = { x: S * 0.5, y: S * 0.95 };
  if (kind === 'pine' || kind === 'canaryPine' || kind === 'aleppoPine' || kind === 'pinyon') {
    // Trees round 2 (2026-10-03): a pine shoot is a brush, not a star. The needle fascicles stand all along each shoot's
    // last half, every one pointing forward and out from it (the tip's more forward), so a tile reads as the fox-tail
    // tufts a pine crown is made of; round 1's tuft radiating from one point read as a palm frond or a maple leaf at
    // the chase camera (the lab's Caldera pairs). The Canary pine's needles long and hanging, the Aleppo pine's fine
    // and sparse. The tile's alpha is the needles' alone (the shaded
    // heart darkens them, never fills between them): wave 26 read the Caldera pines' alpha-tested tiles, whose hearts
    // filled each brush's core into one opaque rounded mass, as "flat broadleaf leaf-card clusters".
    const canary = kind === 'canaryPine', aleppo = kind === 'aleppoPine', pinyon = kind === 'pinyon';
    // trees round 4 (2026-10-04, the gauntlet's wave 39 and the lab's mid-range portraits): a tile of one to three long
    // brushes minified into one leaf-shaped blade on a stalk — a pine read as a broadleaf from 15 m out. The Canary
    // pine keeps one long drooping fox-tail (its crown's own cone carries the read); the Scots and Aleppo pines and the
    // pinyon paint a branchlet's end instead: a main shoot and four or five short side shoots, each clothed in a small
    // brush of its own, gaps between them, so a card minifies into a lumpy clump of tufts, never one outline.
    const needleL = canary ? 0.28 : aleppo ? 0.115 : pinyon ? 0.075 : 0.12;
    const droopN = canary ? 0.45 : aleppo ? 0.12 : pinyon ? 0.02 : 0.08;
    /** Needles per tile-length of brushed shoot, and the share of each shoot (from its tip) the brush clothes. */
    const density = canary ? 830 : aleppo ? 400 : pinyon ? 820 : 470, reach = canary ? 0.5 : 0.48;
    const mainLen = canary ? 0.7 : 0.78;
    const main = twigPoints(p0, -Math.PI / 2 + (rng() - 0.5) * 0.25, S * mainLen, (rng() - 0.5) * 0.35, 8);
    const shoots: Pt[][] = [main];
    const sideCount = canary ? 0 : aleppo ? 4 : 5;
    for (let k = 0; k < sideCount; k++) {
      const t = 0.2 + (k + rng() * 0.6) / sideCount * 0.62, side = k % 2 === 0 ? -1 : 1;
      const at = pointAt(main, t);
      shoots.push(twigPoints(at.p, at.a + side * (0.55 + rng() * 0.35), S * (0.2 + rng() * 0.1) * (1.15 - t * 0.6),
        side * (0.1 + rng() * 0.2), 5));
    }
    // the fascicles stand round each shoot in three dimensions, each at an azimuth about it and a splay out of it,
    // drawn as the tile sees it — the needles turned toward or away from the viewer foreshortened into the brush's
    // dense core, the ones in the tile's plane its fringe — the far side's first (darker, in the brush's shade), then
    // the wood, then the near side's
    const needleW = Math.max(0.7, S / 256 * (aleppo ? 1.0 : 1.2));
    const splay = canary ? 1.6 : pinyon ? 1.15 : 1.3;
    const needles: Needle[] = [];
    for (let si = 0; si < shoots.length; si++) {
      const shoot = shoots[si];
      const seat0 = 1 - (si === 0 && !canary ? reach * 0.75 : reach);
      let len = 0;
      for (let i = 1; i < shoot.length; i++) len += Math.hypot(shoot[i].x - shoot[i - 1].x, shoot[i].y - shoot[i - 1].y);
      const n = Math.max(12, Math.round(density * len * (1 - seat0) / S));
      for (let k = 0; k < n; k++) {
        // a seat on the brushed part (crowded toward the tip), an azimuth round the shoot, a splay forward of it
        const t = seat0 + Math.sqrt(rng()) * (1 - seat0);
        const at = pointAt(shoot, t);
        const phi = rng() * Math.PI * 2, alpha = (0.22 + rng() * splay) * (1 - 0.3 * (t - seat0) / (1 - seat0));
        const sx = Math.cos(at.a), sy = Math.sin(at.a), px = -sy, py = sx;
        const along = Math.cos(alpha), across = Math.sin(alpha) * Math.cos(phi);
        const nl = S * needleL * (0.75 + rng() * 0.45) * (0.8 + 0.2 * (1 - t));
        const dx = sx * along + px * across, dy = sy * along + py * across;
        // the long needles hang (a Canary pine's tassel); a foreshortened one hangs as far as its own length shows
        const show = Math.hypot(along, across), hang = nl * droopN * (0.4 + 0.6 * show);
        const ex = at.p.x + dx * nl, ey = at.p.y + dy * nl + hang;
        // the light: the near side and the upward needles lighter, the far side in the brush's own shade
        const near = Math.sin(phi) >= 0;
        const light = base.light * (0.7 + rng() * 0.45) * (near ? 1.06 : 0.74) * (1 - 0.12 * dy) * (si === 0 ? 1.04 : 0.96);
        needles.push({ x: at.p.x, y: at.p.y, ex, ey, cx: at.p.x + dx * nl * 0.5, cy: at.p.y + dy * nl * 0.5 + hang * 0.3,
          near, light, hue: base.hue + (rng() - 0.5) * 0.03 });
      }
    }
    const strokeNeedle = (q: Needle): void => {
      ctx.strokeStyle = css(q.hue, base.sat, q.light);
      ctx.lineWidth = needleW;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.quadraticCurveTo(q.cx, q.cy, q.ex, q.ey);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    for (const q of needles) if (!q.near) strokeNeedle(q);
    for (const shoot of shoots) taperStroke(ctx, shoot, S * 0.014, S * 0.008, wood);
    ctx.lineCap = 'round';
    for (const q of needles) if (q.near) strokeNeedle(q);
    // each brush's shaded heart: a soft dark band along the needled half of its shoot, laid over the needles already
    // painted (source-atop: it darkens them and adds no alpha between them)
    const composite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-atop';
    for (const shoot of shoots) {
      for (let k = 0; k < 4; k++) {
        const at = pointAt(shoot, 1 - reach * 0.9 + k * reach * 0.26), r = S * needleL * 0.72;
        const gr = ctx.createRadialGradient(at.p.x, at.p.y, 0, at.p.x, at.p.y, r);
        gr.addColorStop(0, css(base.hue + 0.01, base.sat * 0.85, base.light * 0.5, 0.7));
        gr.addColorStop(1, css(base.hue + 0.01, base.sat * 0.85, base.light * 0.5, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(at.p.x, at.p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = composite;
    return shoots;
  }
  if (kind === 'juniper') {
    // a juniper's spray: a few forking twigs of scale-leaf cords, open between them (the shrubby upland juniper, not the
    // cypress' dense column); no shaded body under them
    const frond = (p: Pt, a: number, len: number, depth: number): void => {
      const pts = twigPoints(p, a, len, (rng() - 0.5) * 0.4, 4);
      const light = base.light * (0.7 + 0.14 * depth + rng() * 0.3);
      taperStroke(ctx, pts, S * 0.032 * (depth + 1) / 3, S * 0.02, css(base.hue + (rng() - 0.5) * 0.04, base.sat, light));
      if (depth <= 0) return;
      const forks = 4 + ((rng() * 2) | 0);
      for (let k = 0; k < forks; k++) {
        const at = pointAt(pts, 0.25 + (k / forks) * 0.7);
        frond(at.p, at.a + (k % 2 ? 0.7 : -0.7) + (rng() - 0.5) * 0.45, len * 0.6, depth - 1);
      }
    };
    const spine = twigPoints(p0, -Math.PI / 2, S * 0.6, 0, 6);
    taperStroke(ctx, spine, S * 0.012, S * 0.006, wood);
    frond(p0, -Math.PI / 2 + (rng() - 0.5) * 0.25, S * 0.6, 3);
    return [spine];
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
  // spruce / fir / cedar / larch: a main twig with side twigs, needled (the larch's side shoots hang, rosetted)
  const stem = twigPoints(p0, -Math.PI / 2 + (rng() - 0.5) * 0.25, S * 0.80, (rng() - 0.5) * 0.35, 10);
  const twigs: Pt[][] = [stem];
  const larch = kind === 'larch';
  // trees round 3 (2026-10-03, the gauntlet's wave 31 on the Fulda spruce: sprays "read as broadleaf"): eleven side twigs
  // under a full-strength shaded body filled the spruce's and the fir's tiles into one solid serrated leaf under the
  // alpha test; eight side twigs, and the body laid over the needles (below), keep the herringbone open
  const needled = kind === 'spruce' || kind === 'fir';
  const sides = kind === 'cedar' ? 9 : larch ? 7 : needled ? 8 : 11;
  for (let k = 0; k < sides; k++) {
    const t = 0.12 + (k + rng() * 0.5) / sides * 0.78;
    const at = pointAt(stem, t);
    const side = k % 2 === 0 ? -1 : 1;
    const len = S * (kind === 'fir' ? 0.31 : 0.28) * (1.15 - t * 0.6) * (0.85 + rng() * 0.3);
    twigs.push(twigPoints(at.p, at.a + side * (kind === 'fir' ? 1.0 : larch ? 1.2 : 0.85), len, side * (larch ? -0.9 : 0.15), 5));
  }
  if (!needled) paintSprayBody(ctx, twigs, S * (kind === 'cedar' ? 0.085 : larch ? 0.075 : 0.095), base, larch ? 0.8 : 1.0, 0.3, 'butt', 0.8);
  for (const tw of twigs) taperStroke(ctx, tw, S * 0.010, S * 0.005, wood);
  if (kind === 'cedar' || larch) {
    // rosettes: little starbursts of short needles on spurs along the twigs
    for (const tw of twigs) {
      const n = (larch ? 10 : 8) + ((rng() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const at = pointAt(tw, (k + 0.5) / n);
        const rays = (larch ? 14 : 15) + ((rng() * 7) | 0), rr = S * (larch ? 0.038 + rng() * 0.02 : 0.038 + rng() * 0.022);
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
    paintNeedleTwig(ctx, S, rng, twigs[i], base, flat ? 0.06 : 0.056, flat ? 5.4 : 7.0, flat ? 1.2 : 1.35, flat, i === 0 ? 0.12 : 0.16);
  }
  // the shaded body along the twigs, over the needles already painted (source-atop: it darkens them, adds no alpha)
  const composite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  paintSprayBody(ctx, twigs, S * 0.095, base, 1.0, 0.3, 'butt', 0.8);
  if (kind === 'spruce') {
    // trees round 5 (the gauntlet's wave 98: Frontier's spruce "a smooth, uniform green cone", its foliage "flat,
    // undifferentiated"): the season's shoots at every twig's end, a lighter, yellower green over the needles already
    // painted, so each tier's fringe lights against its dark heart
    for (const tw of twigs) {
      const at = pointAt(tw, 0.9), r = S * 0.06;
      const gr = ctx.createRadialGradient(at.p.x, at.p.y, 0, at.p.x, at.p.y, r);
      gr.addColorStop(0, css(base.hue - 0.025, base.sat * 1.2, base.light * 1.9, 0.6));
      gr.addColorStop(1, css(base.hue - 0.025, base.sat * 1.2, base.light * 1.9, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(at.p.x, at.p.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = composite;
  if (flat) {
    // the fir's silver undersides show as pale lines along the twigs
    ctx.globalAlpha = 0.18;
    for (const tw of twigs) taperStroke(ctx, tw, S * 0.004, S * 0.003, css(0.42, 0.12, 0.45));
    ctx.globalAlpha = 1;
  }
  return twigs;
}

/**
 * Trees round 2: a broom's switches (retama, codeso) — a sheaf of long thin green-grey rods fanning up from the seat,
 * nearly leafless, a few tiny leaves on the younger ones and a scatter of pale flowers near their tips.
 */
function paintBroomTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR.broom;
  const p0 = { x: S * 0.5, y: S * 0.95 };
  const rods: Pt[][] = [];
  // trees round 4 (2026-10-04, the gauntlet's wave 50 on Redrock: the broom read as "agave-like clumps"): a retama's
  // switches are slender and flexible — they rise from the stool, arch outward and hang at their tips, a fountain,
  // where round 2's straight rods fanned from one point into a spiky rosette
  const n = 34 + ((rng() * 10) | 0);
  for (let k = 0; k < n; k++) {
    const lean = (rng() - 0.5) * 1.5, a = -Math.PI / 2 + lean;
    const len = S * (0.5 + rng() * 0.38);
    const start = { x: p0.x + (rng() - 0.5) * S * 0.06, y: p0.y - rng() * S * 0.08 };
    // the arch: away from upright, the further the more the switch leans (and a little either way for the upright ones)
    const arch = (lean >= 0 ? 1 : -1) * (0.7 + rng() * 0.9) * (0.35 + Math.abs(lean)) + (rng() - 0.5) * 0.3;
    rods.push(twigPoints(start, a, len, arch, 10));
  }
  // the sheaf's soft shaded heart, then the rods back to front, lighter toward their tips
  paintSprayBody(ctx, rods.slice(0, 10), S * 0.028, base, 0.35, 0.15);
  for (const rod of rods) {
    const light = base.light * (0.75 + rng() * 0.5);
    taperStroke(ctx, rod, S * 0.009, S * 0.0035, css(base.hue + (rng() - 0.5) * 0.03, base.sat * (0.8 + rng() * 0.4), light));
    for (let t = 0.45; t < 0.95; t += 0.09 + rng() * 0.08) {
      if (rng() < 0.55) continue;
      const at = pointAt(rod, t), side = rng() < 0.5 ? -1 : 1;
      ctx.fillStyle = css(base.hue + 0.02, base.sat * 1.2, light * 1.1);
      ctx.save(); ctx.translate(at.p.x, at.p.y); ctx.rotate(at.a + side * 0.6);
      leafPath(ctx, 'lance', S * 0.03, S * 0.006, rng); ctx.fill(); ctx.restore();
    }
    if (rng() < 0.18) {
      const tip = pointAt(rod, 0.7 + rng() * 0.25);
      ctx.fillStyle = css(0.95, 0.18, 0.78, 0.85);
      ctx.beginPath(); ctx.arc(tip.p.x, tip.p.y, S * (0.006 + rng() * 0.005), 0, Math.PI * 2); ctx.fill();
    }
  }
  return rods;
}

/**
 * The trees lane (2026-10-07, the bocage banks' crests: Saltmere's north Finistère): gorse — a dense mound of short, stiff
 * green shoots from the base, the spines in tufts along them, the yellow pea-flowers clustered on their outer halves
 * (a crest shrub in flower, not the broom's arching switches).
 */
function paintGorseTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR.gorse;
  const p0 = { x: S * 0.5, y: S * 0.96 };
  const shoots: Pt[][] = [];
  const n = 26 + ((rng() * 8) | 0);
  for (let k = 0; k < n; k++) {
    const lean = (rng() - 0.5) * 1.9, a = -Math.PI / 2 + lean;
    const len = S * (0.32 + rng() * 0.36);
    const start = { x: p0.x + (rng() - 0.5) * S * 0.22, y: p0.y - rng() * S * 0.1 };
    shoots.push(twigPoints(start, a, len, (rng() - 0.5) * 0.5, 8));
  }
  // the mound's dark heart, then the shoots with their spine tufts, then the flowers
  paintSprayBody(ctx, shoots.slice(0, 12), S * 0.05, base, 0.4, 0.18);
  ctx.lineCap = 'round';
  for (const shoot of shoots) {
    const light = base.light * (0.8 + rng() * 0.45);
    taperStroke(ctx, shoot, S * 0.008, S * 0.004, css(base.hue + (rng() - 0.5) * 0.03, base.sat, light));
    for (let t = 0.12; t < 0.98; t += 0.05 + rng() * 0.04) {
      const at = pointAt(shoot, t);
      const tuft = 3 + ((rng() * 3) | 0);
      for (let q = 0; q < tuft; q++) {
        const angle = at.a + (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.9);
        const spine = S * (0.018 + rng() * 0.016);
        ctx.strokeStyle = css(base.hue + 0.01, base.sat * (0.9 + rng() * 0.3), light * (0.9 + rng() * 0.4));
        ctx.lineWidth = Math.max(1, S * 0.0035);
        ctx.beginPath();
        ctx.moveTo(at.p.x, at.p.y);
        ctx.lineTo(at.p.x + Math.cos(angle) * spine, at.p.y + Math.sin(angle) * spine);
        ctx.stroke();
      }
    }
    if (rng() < 0.7) {
      const flowers = 3 + ((rng() * 5) | 0);
      for (let q = 0; q < flowers; q++) {
        const at = pointAt(shoot, 0.5 + rng() * 0.48);
        ctx.fillStyle = css(0.13 + rng() * 0.02, 0.85, 0.5 + rng() * 0.1);
        ctx.beginPath();
        ctx.ellipse(at.p.x + (rng() - 0.5) * S * 0.02, at.p.y + (rng() - 0.5) * S * 0.02, S * (0.008 + rng() * 0.005),
          S * (0.006 + rng() * 0.004), rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return shoots;
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

// ------------------------------------------------------------------------------------------------ trees round 5
// The map-revival lanes' species (2026-10-05): their own painters, beside the earlier ones.

/** A pine needle as a brush tile draws it: its seat, its end, the bend's control point, its side of the shoot, its tone. */
interface BrushNeedle {
  x: number; y: number; ex: number; ey: number; cx: number; cy: number;
  near: boolean; light: number; hue: number;
}

/**
 * A pine shoot as a brush — the needle fascicles round each shoot's last part, every one pointing forward and out from
 * it, drawn as the tile sees them (the far side's in the brush's shade first, then the wood, then the near side's), the
 * brush's heart darkened over them (source-atop: no alpha between the needles). The longleaf's one great fox-tail of the
 * longest needles of any pine, drooping over, and a short side shoot's smaller one; the Japanese red pine's branchlet end
 * of slender needles on a main shoot and four side shoots, gaps between their brushes.
 */
function paintBrushTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, kind: SprayKind): Pt[][] {
  const base = LEAF_COLOR[kind];
  const wood = css(0.06, 0.25, 0.09);
  const p0 = { x: S * 0.5, y: S * 0.95 };
  const longleaf = kind === 'longleafPine';
  const needleL = longleaf ? 0.34 : 0.15, droopN = longleaf ? 0.5 : 0.12;
  const density = longleaf ? 980 : 480, reach = longleaf ? 0.6 : 0.48, mainLen = longleaf ? 0.56 : 0.78;
  const sideCount = longleaf ? 1 : 4, splay = longleaf ? 1.75 : 1.3;
  const main = twigPoints(p0, -Math.PI / 2 + (rng() - 0.5) * 0.25, S * mainLen, (rng() - 0.5) * 0.35, 8);
  const shoots: Pt[][] = [main];
  for (let k = 0; k < sideCount; k++) {
    const t = 0.2 + (k + rng() * 0.6) / sideCount * 0.62, side = k % 2 === 0 ? -1 : 1;
    const at = pointAt(main, t);
    shoots.push(twigPoints(at.p, at.a + side * (0.55 + rng() * 0.35), S * (0.2 + rng() * 0.1) * (1.15 - t * 0.6),
      side * (0.1 + rng() * 0.2), 5));
  }
  const needleW = Math.max(0.7, S / 256 * 1.2);
  const needles: BrushNeedle[] = [];
  for (let si = 0; si < shoots.length; si++) {
    const shoot = shoots[si];
    const seat0 = 1 - (si === 0 && !longleaf ? reach * 0.75 : reach);
    let len = 0;
    for (let i = 1; i < shoot.length; i++) len += Math.hypot(shoot[i].x - shoot[i - 1].x, shoot[i].y - shoot[i - 1].y);
    const n = Math.max(12, Math.round(density * len * (1 - seat0) / S));
    for (let k = 0; k < n; k++) {
      const t = seat0 + Math.sqrt(rng()) * (1 - seat0);
      const at = pointAt(shoot, t);
      const phi = rng() * Math.PI * 2, alpha = (0.22 + rng() * splay) * (1 - 0.3 * (t - seat0) / (1 - seat0));
      const sx = Math.cos(at.a), sy = Math.sin(at.a), px = -sy, py = sx;
      const along = Math.cos(alpha), across = Math.sin(alpha) * Math.cos(phi);
      const nl = S * needleL * (0.75 + rng() * 0.45) * (0.8 + 0.2 * (1 - t));
      const dx = sx * along + px * across, dy = sy * along + py * across;
      const show = Math.hypot(along, across), hang = nl * droopN * (0.4 + 0.6 * show);
      const ex = at.p.x + dx * nl, ey = at.p.y + dy * nl + hang;
      const near = Math.sin(phi) >= 0;
      const light = base.light * (0.7 + rng() * 0.45) * (near ? 1.06 : 0.74) * (1 - 0.12 * dy) * (si === 0 ? 1.04 : 0.96);
      needles.push({ x: at.p.x, y: at.p.y, ex, ey, cx: at.p.x + dx * nl * 0.5, cy: at.p.y + dy * nl * 0.5 + hang * 0.3,
        near, light, hue: base.hue + (rng() - 0.5) * 0.03 });
    }
  }
  const strokeNeedle = (q: BrushNeedle): void => {
    ctx.strokeStyle = css(q.hue, base.sat, q.light);
    ctx.lineWidth = needleW;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.quadraticCurveTo(q.cx, q.cy, q.ex, q.ey);
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  for (const q of needles) if (!q.near) strokeNeedle(q);
  for (const shoot of shoots) taperStroke(ctx, shoot, S * 0.014, S * 0.008, wood);
  ctx.lineCap = 'round';
  for (const q of needles) if (q.near) strokeNeedle(q);
  const composite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  for (const shoot of shoots) {
    for (let k = 0; k < 4; k++) {
      const at = pointAt(shoot, 1 - reach * 0.9 + k * reach * 0.26), r = S * needleL * 0.72;
      const gr = ctx.createRadialGradient(at.p.x, at.p.y, 0, at.p.x, at.p.y, r);
      gr.addColorStop(0, css(base.hue + 0.01, base.sat * 0.85, base.light * 0.5, 0.7));
      gr.addColorStop(1, css(base.hue + 0.01, base.sat * 0.85, base.light * 0.5, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(at.p.x, at.p.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = composite;
  return shoots;
}

/**
 * A sugi spray: a drooping rope of a shoot forking into side ropes and theirs again, every one clothed in short awl
 * needles curving forward round it (a dense, spiky cord, never a flat frond), its heart shaded over them.
 */
function paintSugiTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR.sugi;
  const wood = css(0.06, 0.25, 0.09);
  const p0 = { x: S * 0.5, y: S * 0.95 };
  const ropes: Pt[][] = [];
  const rope = (p: Pt, a: number, len: number, depth: number): void => {
    const pts = twigPoints(p, a, len, (a > -Math.PI / 2 ? 1 : -1) * (0.18 + rng() * 0.22), 6);
    ropes.push(pts);
    if (depth <= 0) return;
    const forks = 3 + ((rng() * 2) | 0);
    for (let k = 0; k < forks; k++) {
      const at = pointAt(pts, 0.22 + (k / forks) * 0.62 + rng() * 0.06);
      rope(at.p, at.a + (k % 2 ? 0.62 : -0.62) + (rng() - 0.5) * 0.3, len * (0.48 + rng() * 0.12), depth - 1);
    }
  };
  rope(p0, -Math.PI / 2 + (rng() - 0.5) * 0.3, S * 0.74, 2);
  for (const r of ropes) taperStroke(ctx, r, S * 0.009, S * 0.005, wood);
  for (let i = ropes.length - 1; i >= 0; i--) paintNeedleTwig(ctx, S, rng, ropes[i], base, 0.032, 9.5, 0.75, false, 0.1);
  const composite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  paintSprayBody(ctx, ropes.slice(0, 4), S * 0.07, base, 0.9, 0.3, 'butt', 0.8);
  ctx.globalCompositeOperation = composite;
  return ropes;
}

/**
 * The cedar of Lebanon's plate: the cedar's spray — a main twig and ten side twigs under a shaded body — crowded with
 * rosettes, little starbursts of short needles on spurs along every twig.
 */
function paintCedarPlateTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR.lebanonCedar;
  const wood = css(0.06, 0.25, 0.09);
  const p0 = { x: S * 0.5, y: S * 0.95 };
  const stem = twigPoints(p0, -Math.PI / 2 + (rng() - 0.5) * 0.25, S * 0.80, (rng() - 0.5) * 0.35, 10);
  const twigs: Pt[][] = [stem];
  const sides = 10;
  for (let k = 0; k < sides; k++) {
    const t = 0.12 + (k + rng() * 0.5) / sides * 0.78;
    const at = pointAt(stem, t);
    const side = k % 2 === 0 ? -1 : 1;
    twigs.push(twigPoints(at.p, at.a + side * 0.85, S * 0.28 * (1.15 - t * 0.6) * (0.85 + rng() * 0.3), side * 0.15, 5));
  }
  paintSprayBody(ctx, twigs, S * 0.085, base, 1.0, 0.3, 'butt', 0.8);
  for (const tw of twigs) taperStroke(ctx, tw, S * 0.010, S * 0.005, wood);
  for (const tw of twigs) {
    const n = 11 + ((rng() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const at = pointAt(tw, (k + 0.5) / n);
      const rays = 15 + ((rng() * 7) | 0), rr = S * (0.038 + rng() * 0.022);
      ctx.strokeStyle = css(base.hue + (rng() - 0.5) * 0.04, base.sat, base.light * (0.75 + rng() * 0.5));
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

/**
 * A longleaf seedling in its grass stage (Longleaf Crossing's cutover): a dense fountain of long needles from one seat at
 * the ground, the heart's standing steep and the rim's arching out and over toward their tips, glossy and bright on the
 * near side, in their own shade at the heart. The alpha is the needles' alone.
 */
function paintGrassStageTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR.longleafSeedling;
  const p0 = { x: S * 0.5, y: S * 0.96 };
  const n = 150 + ((rng() * 30) | 0);
  const needles: Array<{ pts: Pt[]; near: boolean; light: number; hue: number }> = [];
  for (let k = 0; k < n; k++) {
    // a lean off upright across the fan; the longer and the further over a needle leans, the more it arches
    const lean = (rng() - 0.5) * 2.3;
    const len = S * (0.42 + rng() * 0.46);
    const start = { x: p0.x + (rng() - 0.5) * S * 0.07, y: p0.y - rng() * S * 0.05 };
    const arch = (lean >= 0 ? 1 : -1) * (0.5 + Math.abs(lean) * 0.9) * (0.6 + rng() * 0.6) * (len / (S * 0.7));
    const near = rng() < 0.55;
    const light = base.light * (0.62 + rng() * 0.5) * (near ? 1.08 : 0.72) * (1 - 0.18 * (1 - Math.abs(lean) / 1.2));
    needles.push({ pts: twigPoints(start, -Math.PI / 2 + lean, len, arch, 8), near, light, hue: base.hue + (rng() - 0.5) * 0.035 });
  }
  const width = Math.max(0.7, S / 256 * 1.15);
  const stroke = (q: (typeof needles)[number]): void => {
    ctx.strokeStyle = css(q.hue, base.sat, q.light);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(q.pts[0].x, q.pts[0].y);
    for (let i = 1; i < q.pts.length; i++) ctx.lineTo(q.pts[i].x, q.pts[i].y);
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const q of needles) if (!q.near) stroke(q);
  for (const q of needles) if (q.near) stroke(q);
  const composite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  const gr = ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, S * 0.42);
  gr.addColorStop(0, css(base.hue + 0.01, base.sat * 0.8, base.light * 0.42, 0.75));
  gr.addColorStop(1, css(base.hue + 0.01, base.sat * 0.8, base.light * 0.42, 0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p0.x, p0.y, S * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = composite;
  return needles.slice(0, 12).map((q) => q.pts);
}

/** The round-5 species' painters by kind. */
/**
 * Trees round 5 (the cities lane's Ironworks, the Saar works): a buddleia's shoot — an arching cane from the seat, its
 * long narrow felted leaves in opposite pairs, grey-green over and paler under, a few side shoots, and at the cane's tip
 * (and at some side shoots') a long nodding panicle of small purple-violet florets, the lower ones open and paler, the
 * tip in bud. The alpha is the leaves', the canes' and the florets'.
 */
function paintBuddleiaTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR.buddleia;
  const lean = (rng() < 0.5 ? -1 : 1) * (0.2 + rng() * 0.2);
  const cane = twigPoints({ x: S * (0.5 - lean * 0.45), y: S * 0.96 }, -Math.PI / 2 + lean, S * 0.7, lean * 1.5, 10);
  const shoots: Pt[][] = [cane];
  const sides = 2 + ((rng() * 3) | 0);
  for (let k = 0; k < sides; k++) {
    const at = pointAt(cane, 0.3 + (k + rng() * 0.6) / sides * 0.5), side = k % 2 === 0 ? -1 : 1;
    shoots.push(twigPoints(at.p, at.a + side * (0.5 + rng() * 0.3), S * (0.2 + rng() * 0.12), -side * 0.5, 6));
  }
  for (const sh of shoots) taperStroke(ctx, sh, sh === cane ? S * 0.012 : S * 0.007, S * 0.004, css(0.09, 0.18, 0.16));
  // the leaves: opposite pairs along each shoot, long lances drooping off it, the pair's undersides paler
  for (const sh of shoots) {
    const pairs = sh === cane ? 8 + ((rng() * 3) | 0) : 3 + ((rng() * 2) | 0);
    for (let k = 0; k < pairs; k++) {
      const t = 0.12 + (k / pairs) * 0.72 + rng() * 0.04, at = pointAt(sh, t);
      for (const side of [-1, 1]) {
        const L = S * (0.14 + rng() * 0.07) * (1.05 - t * 0.4), W = L * 0.21;
        const angle = at.a + side * (0.85 + rng() * 0.35) + 0.25;
        const under = rng() < 0.35;
        ctx.save();
        ctx.translate(at.p.x, at.p.y);
        ctx.rotate(angle);
        ctx.fillStyle = css(base.hue + (rng() - 0.5) * 0.02, base.sat * (under ? 0.6 : 1), base.light * (under ? 1.45 : 0.85 + rng() * 0.3));
        leafPath(ctx, 'lance', L, W, rng);
        ctx.fill();
        ctx.strokeStyle = css(base.hue, base.sat * 0.6, base.light * (under ? 1.6 : 1.25), 0.6);
        ctx.lineWidth = Math.max(0.5, S / 700);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke();
        ctx.restore();
      }
    }
  }
  // the panicles: the cane's and some side shoots', nodding with their shoots
  for (let i = 0; i < shoots.length; i++) {
    if (i > 0 && rng() > 0.45) continue;
    const sh = shoots[i], tip = pointAt(sh, 0.98), len = S * (i === 0 ? 0.3 + rng() * 0.1 : 0.17 + rng() * 0.07);
    const axis = twigPoints(tip.p, tip.a + (tip.a > -Math.PI / 2 ? 0.25 : -0.25), len, (tip.a > -Math.PI / 2 ? 0.6 : -0.6), 8);
    const florets = Math.round(len / S * 620);
    for (let k = 0; k < florets; k++) {
      const t = Math.pow(rng(), 0.7), at = pointAt(axis, t), girth = len * 0.19 * (1 - t * 0.8) + S * 0.005;
      const off = (rng() - 0.5) * 2 * girth, nx = -Math.sin(at.a), ny = Math.cos(at.a);
      const open = t < 0.75 && rng() < 0.7;
      ctx.fillStyle = css(0.76 + (rng() - 0.5) * 0.04, 0.5 + rng() * 0.15, (open ? 0.32 : 0.2) * (0.85 + rng() * 0.3));
      ctx.beginPath();
      ctx.arc(at.p.x + nx * off, at.p.y + ny * off, S * (open ? 0.009 + rng() * 0.004 : 0.006), 0, Math.PI * 2);
      ctx.fill();
      if (open && rng() < 0.4) {
        ctx.fillStyle = css(0.12, 0.7, 0.45);
        ctx.beginPath(); ctx.arc(at.p.x + nx * off, at.p.y + ny * off, S * 0.0025, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  return shoots;
}

// ------------------------------------------------------------------------------------------------ the bare flag
// Trees lane (2026-10-05, the cities lane's Ironworks in March 1945): a map's `vegetation.bare` stands its deciduous
// broadleaves leafless. Their sprays paint winter twigs in each species' own habit (the birch keeps its fine lattice,
// paintBareTile); a shrub's its winter canes.

/** A winter twig habit: the main twigs from the seat, their forks, their kinks and their buds. */
interface BareHabit {
  /** main twigs from the seat, and their fan either side of upright (rad) */
  readonly stems: number;
  readonly spread: number;
  /** a main twig's length and base width (shares of the tile) */
  readonly length: number;
  readonly width: number;
  /** fork depth, a fork's angle off its parent's line (rad) and its jitter, a fork's length over its parent's */
  readonly depth: number;
  readonly forkAngle: number;
  readonly forkJitter: number;
  readonly lenDecay: number;
  /** forks per twig: the least and the random extra */
  readonly forks: readonly [number, number];
  /** how far each fork's heading is drawn back toward upright (0 none, 1 straight up): the twigs climb toward the light */
  readonly rise: number;
  /** the turn either side of its line a twig takes at each node, alternating (rad): the oak's zigzag */
  readonly kink: number;
  /** the terminal bud's size (a share of the tile) and how many cluster at a tip */
  readonly bud: number;
  readonly budCluster: number;
  /** the haze of sub-pixel twigs (discs of it) a minified card keeps */
  readonly gauze: number;
}
const BARE_HABITS: Readonly<Record<'oak-bare' | 'poplar-bare', BareHabit>> = Object.freeze({
  // the oak: stout twigs crooked at every node, spreading forks at wide angles, short internodes, small clustered buds
  'oak-bare': Object.freeze({ stems: 2, spread: 0.55, length: 0.4, width: 0.019, depth: 3, forkAngle: 0.85, forkJitter: 0.3,
    lenDecay: 0.58, forks: [2, 1] as const, rise: 0.3, kink: 0.32, bud: 0.0055, budCluster: 3, gauze: 12 }),
  // the poplar: straight, stout shoots climbing at narrow angles, a long pointed bud at each tip
  'poplar-bare': Object.freeze({ stems: 3, spread: 0.32, length: 0.48, width: 0.015, depth: 4, forkAngle: 0.36, forkJitter: 0.18,
    lenDecay: 0.62, forks: [1, 2] as const, rise: 0.4, kink: 0.06, bud: 0.008, budCluster: 1, gauze: 8 }),
});

/** A twig along `line` (canvas radians; -PI/2 = up) from p0, turning either side of the line at each node by up to `kink`. */
function kinkedTwig(p0: Pt, line: number, length: number, kink: number, steps: number, rng: Rng): Pt[] {
  const pts: Pt[] = [p0];
  let x = p0.x, y = p0.y, side = rng() < 0.5 ? -1 : 1;
  const step = length / steps;
  for (let i = 0; i < steps; i++) {
    const a = line + side * kink * (0.4 + 0.6 * rng());
    side = -side;
    x += Math.cos(a) * step; y += Math.sin(a) * step;
    pts.push({ x, y });
  }
  return pts;
}

/** The oak's or the poplar's winter twigs on one tile (the habit's), the haze a minified card keeps behind them. */
function paintBareHabitTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, kind: 'oak-bare' | 'poplar-bare'): Pt[][] {
  const base = LEAF_COLOR[kind], habit = BARE_HABITS[kind];
  const tips: Pt[][] = [];
  for (let k = 0; k < habit.gauze; k++) {
    const x = S * (0.28 + rng() * 0.44), y = S * (0.22 + rng() * 0.5), r = S * (0.08 + rng() * 0.12);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, css(base.hue, base.sat, base.light * 0.9, 0.3));
    gr.addColorStop(1, css(base.hue, base.sat, base.light * 0.9, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const UP = -Math.PI / 2;
  const twig = (p: Pt, line: number, len: number, w: number, depth: number): void => {
    const steps = Math.max(3, Math.round(len / (S * 0.045)));
    const pts = kinkedTwig(p, line, len, habit.kink, steps, rng);
    taperStroke(ctx, pts, w, w * 0.62, css(base.hue + (rng() - 0.5) * 0.02, base.sat, base.light * (0.75 + rng() * 0.45)));
    if (depth <= 0 || len < S * 0.035) {
      tips.push(pts);
      // the buds: a small cluster at the oak's tip, one long pointed bud at the poplar's
      const end = pts[pts.length - 1];
      for (let b = 0; b < habit.budCluster; b++) {
        const ba = line + (habit.budCluster > 1 ? (b - (habit.budCluster - 1) / 2) * 0.7 + (rng() - 0.5) * 0.3 : 0);
        ctx.save();
        ctx.translate(end.x, end.y);
        ctx.rotate(ba);
        ctx.fillStyle = css(base.hue + 0.01, base.sat * 1.4, base.light * 0.7);
        ctx.beginPath();
        ctx.ellipse(S * habit.bud * 0.6, 0, S * habit.bud * (habit.budCluster > 1 ? 0.8 : 1.3), S * habit.bud * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    const forks = habit.forks[0] + ((rng() * (habit.forks[1] + 1)) | 0);
    for (let k = 0; k < forks; k++) {
      const at = pointAt(pts, 0.3 + rng() * 0.65), side = k % 2 === 0 ? -1 : 1;
      let heading = line + side * (habit.forkAngle + (rng() - 0.5) * 2 * habit.forkJitter);
      heading += (UP - heading) * habit.rise;
      twig(at.p, heading, len * (habit.lenDecay + (rng() - 0.5) * 0.16), w * 0.66, depth - 1);
    }
    // the leader carries on past its forks
    if (rng() < 0.6) twig(pts[pts.length - 1], line + (UP - line) * habit.rise * 0.5, len * habit.lenDecay * 0.8, w * 0.7, depth - 1);
  };
  for (let k = 0; k < habit.stems; k++) {
    const off = habit.stems > 1 ? k / (habit.stems - 1) * 2 - 1 : 0;
    twig({ x: S * (0.5 + off * 0.03), y: S * 0.96 }, UP + off * habit.spread + (rng() - 0.5) * 0.16,
      S * (habit.length + rng() * 0.08), S * habit.width, habit.depth);
  }
  return tips;
}

/**
 * The buddleia in winter: two arching canes from the seat, pale and peeling, bare but for a few shrivelled leaves near
 * their tips, each cane and some side shoots ending in last summer's panicle, dry, rust-brown and nodding, its
 * capsules open.
 */
function paintBuddleiaWinterTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const base = LEAF_COLOR['buddleia-bare'];
  const shoots: Pt[][] = [], tipsOf: Array<{ sh: Pt[]; main: boolean }> = [];
  for (let c = 0; c < 2; c++) {
    const lean = (c === 0 ? -1 : 1) * (0.12 + rng() * 0.18);
    const cane = twigPoints({ x: S * (0.5 + lean * 0.2), y: S * 0.96 }, -Math.PI / 2 + lean, S * (0.52 + rng() * 0.1), lean * 1.4, 10);
    shoots.push(cane); tipsOf.push({ sh: cane, main: true });
    const sides = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < sides; k++) {
      const at = pointAt(cane, 0.32 + (k + rng() * 0.6) / sides * 0.5), side = k % 2 === 0 ? -1 : 1;
      const sh = twigPoints(at.p, at.a + side * (0.45 + rng() * 0.3), S * (0.18 + rng() * 0.12), -side * 0.5, 6);
      shoots.push(sh); tipsOf.push({ sh, main: false });
    }
  }
  for (const sh of shoots) taperStroke(ctx, sh, sh.length > 8 ? S * 0.016 : S * 0.009, S * 0.005, css(0.085, 0.12, 0.26));
  // a few shrivelled leaves hang on near the shoots' tips, curled and grey-brown
  for (const sh of shoots) {
    const n = (rng() * 3) | 0;
    for (let k = 0; k < n; k++) {
      const at = pointAt(sh, 0.7 + rng() * 0.25), side = rng() < 0.5 ? -1 : 1, L = S * (0.06 + rng() * 0.05);
      ctx.save();
      ctx.translate(at.p.x, at.p.y);
      ctx.rotate(at.a + side * (1.1 + rng() * 0.5) + 0.5);
      ctx.fillStyle = css(0.08, 0.18, 0.17 * (0.8 + rng() * 0.4));
      leafPath(ctx, 'lance', L, L * 0.18, rng);
      ctx.fill();
      ctx.restore();
    }
  }
  // last summer's panicles: dry, rust-brown, nodding with their shoots, the capsules open
  for (const { sh, main } of tipsOf) {
    if (!main && rng() > 0.55) continue;
    const tip = pointAt(sh, 0.98), len = S * (main ? 0.3 + rng() * 0.1 : 0.16 + rng() * 0.07);
    const nod = tip.a > -Math.PI / 2 ? 1 : -1;
    const axis = twigPoints(tip.p, tip.a + nod * 0.3, len, nod * 0.7, 8);
    taperStroke(ctx, axis, S * 0.006, S * 0.003, css(base.hue, base.sat * 0.6, base.light * 0.8));
    const capsules = Math.round(len / S * 900);
    for (let k = 0; k < capsules; k++) {
      const t = Math.pow(rng(), 0.75), at = pointAt(axis, t), girth = len * 0.2 * (1 - t * 0.75) + S * 0.005;
      const off = (rng() - 0.5) * 2 * girth, nx = -Math.sin(at.a), ny = Math.cos(at.a);
      ctx.fillStyle = css(base.hue + (rng() - 0.5) * 0.03, base.sat * (0.8 + rng() * 0.4), base.light * (0.65 + rng() * 0.6));
      ctx.beginPath();
      ctx.arc(at.p.x + nx * off, at.p.y + ny * off, S * (0.006 + rng() * 0.004), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return shoots;
}

const BARE_PAINTERS: Readonly<Partial<Record<SprayKind, (ctx: CanvasRenderingContext2D, S: number, rng: Rng) => Pt[][]>>> = Object.freeze({
  'oak-bare': (ctx, S, rng) => paintBareHabitTile(ctx, S, rng, 'oak-bare'),
  'poplar-bare': (ctx, S, rng) => paintBareHabitTile(ctx, S, rng, 'poplar-bare'),
  'buddleia-bare': paintBuddleiaWinterTile,
});

/**
 * Trees lane (2026-10-05, the farmland lane's Streuobst for Frontier Basin): the meadow orchard's fruit trees on one
 * atlas, a species a tile — the apple's ovate, downy leaves on tiles 0 and 1, the pear's rounder, glossier ones on
 * tile 2, the plum's narrower, darker ones on tile 3 — each with its high-summer fruit hanging from its twigs: small
 * apples green-yellow with a red cheek, pears yellow-green and pear-shaped, plums dark blue-purple under their bloom.
 * The form's variants take their own species' tiles (treeGrowth.ts `variantTiles`).
 */
const ORCHARD_RECIPES: Readonly<Record<'apple' | 'pear' | 'plum', BroadleafRecipe>> = Object.freeze({
  apple: { shape: 'oval', leafLen: 0.08, leafAspect: 0.52, petiole: 0.22, spacing: 0.032, leafAngle: 0.9, twigs: [5, 7], twigLen: [0.22, 0.36], twigAngle: 0.8, hang: 0, droop: 0.3, stemWidth: 2.4 },
  pear: { shape: 'oval', leafLen: 0.074, leafAspect: 0.6, petiole: 0.4, spacing: 0.034, leafAngle: 0.95, twigs: [4, 6], twigLen: [0.22, 0.34], twigAngle: 0.65, hang: 0, droop: 0.25, stemWidth: 2.4 },
  plum: { shape: 'oval', leafLen: 0.07, leafAspect: 0.42, petiole: 0.12, spacing: 0.03, leafAngle: 0.85, twigs: [5, 7], twigLen: [0.2, 0.32], twigAngle: 0.85, hang: 0, droop: 0.3, stemWidth: 2.0 },
});
const ORCHARD_TILE_SPECIES = Object.freeze(['apple', 'apple', 'pear', 'plum'] as const);

/** One fruit hanging from (x, y) on its stalk: an apple, a pear or a plum, lit from above. */
function paintFruit(ctx: CanvasRenderingContext2D, S: number, rng: Rng, x: number, y: number, kind: 'apple' | 'pear' | 'plum'): void {
  const stalk = S * (kind === 'plum' ? 0.012 : 0.02) * (0.8 + rng() * 0.4), sway = (rng() - 0.5) * 0.6;
  const cx = x + Math.sin(sway) * stalk, cy = y + Math.cos(sway) * stalk;
  ctx.strokeStyle = css(0.08, 0.3, 0.12);
  ctx.lineWidth = Math.max(0.6, S * 0.004);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
  const r = S * (kind === 'apple' ? 0.03 : kind === 'pear' ? 0.025 : 0.019) * (0.85 + rng() * 0.3);
  const fy = cy + r * (kind === 'pear' ? 1.4 : 0.9);
  const gr = ctx.createRadialGradient(cx - r * 0.35, fy - r * 0.45, r * 0.1, cx, fy, r * 1.25);
  if (kind === 'apple') {
    gr.addColorStop(0, css(0.17, 0.55, 0.42));
    gr.addColorStop(0.6, css(0.16, 0.55, 0.3));
    gr.addColorStop(1, css(0.13, 0.5, 0.16));
  } else if (kind === 'pear') {
    gr.addColorStop(0, css(0.17, 0.55, 0.45));
    gr.addColorStop(0.6, css(0.16, 0.5, 0.32));
    gr.addColorStop(1, css(0.12, 0.45, 0.18));
  } else {
    gr.addColorStop(0, css(0.68, 0.2, 0.34));
    gr.addColorStop(0.5, css(0.73, 0.42, 0.17));
    gr.addColorStop(1, css(0.76, 0.45, 0.08));
  }
  ctx.fillStyle = gr;
  ctx.beginPath();
  if (kind === 'pear') {
    // the pear's neck narrowing to its stalk over its round foot
    ctx.ellipse(cx, fy, r, r * 1.05, 0, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.55, fy - r * 0.6);
    ctx.ellipse(cx, fy - r * 1.05, r * 0.58, r * 0.7, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(cx, fy, r * (kind === 'plum' ? 0.86 : 1.04), r, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  if (kind === 'apple') {
    // the apple's red cheek, the side the sun ripens, over half the fruit or more
    const side = rng() < 0.5 ? -1 : 1, blush = 0.6 + rng() * 0.4;
    const cheek = ctx.createRadialGradient(cx + side * r * 0.4, fy - r * 0.2, r * 0.1, cx + side * r * 0.3, fy, r * 1.1);
    cheek.addColorStop(0, css(0.0, 0.62, 0.24, blush));
    cheek.addColorStop(0.7, css(0.01, 0.6, 0.2, blush * 0.8));
    cheek.addColorStop(1, css(0.02, 0.55, 0.18, 0));
    ctx.fillStyle = cheek;
    ctx.beginPath();
    ctx.ellipse(cx, fy, r * 1.04, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A Streuobst spray tile: the tile's species' leaves (ORCHARD_TILE_SPECIES), then its fruit off the twigs. */
function paintOrchardTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng, tile = 0): Pt[][] {
  const kind = ORCHARD_TILE_SPECIES[tile % ORCHARD_TILE_SPECIES.length];
  const twigs = paintBroadleafTile(ctx, S, rng, 'apple', ORCHARD_RECIPES[kind]);
  // three to five fruits, singly or in pairs, hanging from the side twigs' outer halves
  const fruits = 3 + ((rng() * 3) | 0);
  for (let k = 0; k < fruits && twigs.length > 1; k++) {
    const tw = twigs[1 + ((rng() * (twigs.length - 1)) | 0)], at = pointAt(tw, 0.5 + rng() * 0.45);
    paintFruit(ctx, S, rng, at.p.x, at.p.y, kind);
    if (rng() < 0.35) paintFruit(ctx, S, rng, at.p.x + S * 0.012, at.p.y + S * 0.004, kind);
  }
  return twigs;
}

const ROUND5_PAINTERS: Readonly<Partial<Record<SprayKind, (ctx: CanvasRenderingContext2D, S: number, rng: Rng, tile?: number) => Pt[][]>>> = Object.freeze({
  gorse: paintGorseTile,
  apple: paintOrchardTile,
  buddleia: paintBuddleiaTile,
  longleafPine: (ctx, S, rng) => paintBrushTile(ctx, S, rng, 'longleafPine'),
  redPine: (ctx, S, rng) => paintBrushTile(ctx, S, rng, 'redPine'),
  sugi: paintSugiTile,
  lebanonCedar: paintCedarPlateTile,
  longleafSeedling: paintGrassStageTile,
});

/**
 * Trees round 5 (2026-10-05, the gauntlet's wave 98: the near bush "a cluster of flat, stemless leaf cards with no
 * visible branch structure connecting them to the ground ... floating leaf confetti"): a shrub atlas's stem tile — a
 * stool's two or three stems from the root plate (the tile's bottom centre, the card's seat on the ground) leaning
 * apart, each forking once or twice in its upper half and shedding thinner twigs toward the top, where the clump's
 * sprays clothe it. Grey-brown bark drawn round: its shade side, its body and a lit stripe toward the sun's side, with
 * the bark's darker rings and lighter flecks along it. No leaves: the card turns about its stem to face the viewer
 * (vegetation.ts COT_LEAF_BILLBOARD), so it reads as the stems from every side.
 */
function paintShrubStemTile(ctx: CanvasRenderingContext2D, S: number, rng: Rng): Pt[][] {
  const bark = { hue: 0.072, sat: 0.15, light: 0.11 };
  const strokes: Array<{ pts: Pt[]; w0: number; w1: number }> = [];
  const n = 2 + ((rng() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const off = i - (n - 1) / 2;
    const x0 = S * (0.5 + off * 0.045 + (rng() - 0.5) * 0.02);
    const lean = off * 0.17 + (rng() - 0.5) * 0.12;
    const stem = twigPoints({ x: x0, y: S * 1.0 }, -Math.PI / 2 + lean, S * (0.62 + rng() * 0.22), (rng() - 0.5) * 0.35, 10);
    strokes.push({ pts: stem, w0: S * (0.048 + rng() * 0.012), w1: S * 0.014 });
    const forks = 1 + ((rng() * 2) | 0);
    for (let f = 0; f < forks; f++) {
      const at = pointAt(stem, 0.45 + rng() * 0.35);
      const side = (f % 2 === 0 ? 1 : -1) * (off >= 0 ? 1 : -1);
      const fork = twigPoints(at.p, at.a + side * (0.32 + rng() * 0.3), S * (0.17 + rng() * 0.17), -side * 0.25, 7);
      strokes.push({ pts: fork, w0: S * 0.021, w1: S * 0.007 });
      for (let k = 0; k < 2; k++) {
        const tw = pointAt(fork, 0.4 + k * 0.3);
        strokes.push({ pts: twigPoints(tw.p, tw.a + (k % 2 ? 1 : -1) * (0.4 + rng() * 0.4), S * (0.06 + rng() * 0.07), 0.2, 5),
          w0: S * 0.009, w1: S * 0.004 });
      }
    }
    for (let k = 0; k < 3; k++) {
      const tw = pointAt(stem, 0.72 + k * 0.1);
      strokes.push({ pts: twigPoints(tw.p, tw.a + (k % 2 ? 1 : -1) * (0.3 + rng() * 0.5), S * (0.05 + rng() * 0.07), 0.1, 5),
        w0: S * 0.009, w1: S * 0.004 });
    }
  }
  // the shade side, the body, then the lit stripe (offset toward the canvas' left, the sun's side of every card)
  for (const st of strokes) taperStroke(ctx, st.pts, st.w0, st.w1, css(bark.hue, bark.sat * 1.1, bark.light * 0.5));
  for (const st of strokes) taperStroke(ctx, st.pts, st.w0 * 0.74, st.w1 * 0.74, css(bark.hue, bark.sat, bark.light));
  for (const st of strokes) {
    const lit = st.pts.map((p, i) => {
      const w = st.w0 + (st.w1 - st.w0) * (i / (st.pts.length - 1));
      return { x: p.x - w * 0.2, y: p.y };
    });
    taperStroke(ctx, lit, st.w0 * 0.26, st.w1 * 0.26, css(bark.hue + 0.01, bark.sat * 0.7, bark.light * 1.75));
  }
  // the bark: a darker ring or a lighter fleck every stem width or so along the thick stems
  for (const st of strokes) {
    if (st.w0 < S * 0.02) continue;
    let len = 0;
    for (let i = 1; i < st.pts.length; i++) len += Math.hypot(st.pts[i].x - st.pts[i - 1].x, st.pts[i].y - st.pts[i - 1].y);
    const marks = Math.round(len / (st.w0 * 1.1));
    for (let k = 0; k < marks; k++) {
      const t = (k + rng()) / marks, at = pointAt(st.pts, t), w = (st.w0 + (st.w1 - st.w0) * t) * 0.74;
      const dark = rng() < 0.6;
      ctx.save();
      ctx.translate(at.p.x, at.p.y);
      ctx.rotate(at.a);
      ctx.fillStyle = dark ? css(bark.hue, bark.sat, bark.light * 0.6, 0.8) : css(bark.hue + 0.02, bark.sat * 0.5, bark.light * 1.6, 0.7);
      ctx.beginPath();
      ctx.ellipse(0, (rng() - 0.5) * w * 0.4, w * (dark ? 0.12 : 0.08), w * (dark ? 0.42 : 0.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  return strokes.map((st) => st.pts);
}

/**
 * Paint one species atlas: four tiles (2 × 2) of `size` / 2 px each, straight alpha, toned by the map palette's
 * texTone. Returns the ImageData-backed texture (sRGB, anisotropy 8, mipmapped). Trees round 5: a `shrub` atlas paints
 * the shrub's leaf law on a broadleaf kind's tiles (SHRUB_LEAF_LAW) and its stems on the last (SHRUB_STEM_TILE).
 */
export function makeSprayAtlas(kind: SprayKind, rng: Rng, size: number, tone: ToneFunction | null = null, snow = 0,
  shrub = false): THREE.Texture {
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
    const twigs = shrub && ty * T + tx === SHRUB_STEM_TILE ? paintShrubStemTile(ctx, S, rng)
      : kind === 'birch-bare' ? paintBareTile(ctx, S, rng) : kind === 'broom' ? paintBroomTile(ctx, S, rng)
      : BARE_PAINTERS[kind] ? BARE_PAINTERS[kind](ctx, S, rng)
      : ROUND5_PAINTERS[kind] ? ROUND5_PAINTERS[kind](ctx, S, rng, ty * T + tx)
      : BROADLEAF_RECIPES[kind] ? paintBroadleafTile(ctx, S, rng, kind, BROADLEAF_RECIPES[kind], shrub)
        : paintConiferTile(ctx, S, rng, kind);
    // a winter palette's snow load rides the twigs of the top tile row — the snow-laden sprays the sky-facing seats
    // take (vegetation.ts buildGrownTree); the bottom row stays bare (its own stream: the leaf painting never moves)
    if (snow > 0.05 && ty === 0) paintSpraySnow(ctx, twigs, S * (kind === 'birch-bare' || BARE_PAINTERS[kind] ? 0.035 : 0.07), snow, snowRng);
    ctx.restore();
  }
  const image = ctx.getImageData(0, 0, s, s);
  finishSprayTiles(image.data, s, S, T);
  applyTone(image.data, tone);
  const texture = new THREE.Texture(image as unknown as HTMLImageElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.name = `${shrub ? 'shrubAtlas' : 'sprayAtlas'}:${kind}`;
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
    padSprayTile(d, s, S, tx, ty, fr, fg, fb);
  }
}

/** Trees round 4: the alpha a texel needs to pass the foliage's alpha test (0.38), on the 0–255 scale. */
const SPRAY_ALPHA_CUT = 97;

/**
 * Trees round 4 (the gauntlet's wave 68: "visible alpha fringing", "heavy black vein outlines"): the colour under the
 * alpha test. A texel the test discards still feeds the filter and the mips with its colour, and the painters leave the
 * dark anti-aliased rims of their strokes there — a dark fringe round every leaf once filtered. Each texel under the cut
 * takes the colour of its nearest leaf texel (a breadth-first dilation four texels deep, its own alpha kept), and the
 * rest the tile's mean, as the flood already gave the clear ones.
 */
function padSprayTile(d: Uint8ClampedArray, s: number, S: number, tx: number, ty: number, fr: number, fg: number, fb: number): void {
  const at = (x: number, y: number): number => ((ty * S + y) * s + tx * S + x) * 4;
  const depth = new Int8Array(S * S).fill(-1);
  let frontier: number[] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[at(x, y) + 3] >= SPRAY_ALPHA_CUT) { depth[y * S + x] = 0; frontier.push(y * S + x); }
  for (let step = 1; step <= 4 && frontier.length; step++) {
    const next: number[] = [];
    for (const k of frontier) {
      const x = k % S, y = (k / S) | 0, src = at(x, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S || depth[ny * S + nx] !== -1) continue;
        const dst = at(nx, ny);
        d[dst] = d[src]; d[dst + 1] = d[src + 1]; d[dst + 2] = d[src + 2];
        depth[ny * S + nx] = step;
        next.push(ny * S + nx);
      }
    }
    frontier = next;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (depth[y * S + x] !== -1) continue;
    const i = at(x, y);
    d[i] = fr; d[i + 1] = fg; d[i + 2] = fb;
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
