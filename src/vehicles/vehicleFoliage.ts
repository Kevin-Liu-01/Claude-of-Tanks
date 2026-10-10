// src/vehicles/vehicleFoliage.ts — leaves on vehicles: cut branches tucked into a camouflage net, a ghillie's leafy
// garnish, a multispectral net's cut flaps (tank-accessories lane, 2026-10-05).
//
// The owner judged the vehicles' old leaves (eight-vertex slabs in two flat colours) against the trees lane's rebuilt
// trees ("just like how you really outdid yourself on improving trees"). Vehicle foliage now shares that lane's work
// instead of a parallel system: the species spray atlases of src/world/treeSprayAtlas.ts (a leafy twig per tile, stem
// at the tile's bottom centre, elliptical alpha falloff, mean-tone flood) on bent spray cards seated stem-first on
// their carrier, lit as a volume (a blend of the card's face, the carrier's outward normal and the sky). The
// multispectral nets (ULCANS, Nakidka) are not leaves: their garnish is a laser-cut fabric whose flaps this module
// paints in the same 2 x 2 tile layout. Textures are module-cached and shared (never disposed with a visual);
// materials stay per visual (the burn hook owns them).
//
// Round 3 (2026-10-07, ta3 foliage helper; the critics read the round-2 sprays as "flat, blurry leaf-spray cards whose
// straight card edges are visible ... no stems or depth"): the atlases are painted at 512 px (256 px a tile, the trees'
// own size: the painted twigs and stems resolve at a close-up), they carry their own coverage-preserving mip chain
// (lighting.ts builds that chain only for canvas images, so an ImageData atlas fell back to box-filtered mips that thin
// a card out with range), and a card may fold along its stem (FoliageCard.fold): the spray's two halves leave the
// stem's plane in a shallow V, so it has depth and never shows one straight edge.
import * as THREE from 'three';
import { makeSprayAtlas, SPRAY_ATLAS_TILES, type SprayKind } from '../world/treeSprayAtlas.ts';

export type VehicleFoliageKind = SprayKind | 'garnish-woodland' | 'garnish-arid';

/** Tiles per side of every vehicle foliage atlas (the trees' layout). */
export const FOLIAGE_ATLAS_TILES = SPRAY_ATLAS_TILES;
/** The alpha cut of every vehicle foliage card (the grown trees' near cards use 0.38). */
export const FOLIAGE_ALPHA_TEST = 0.4;

const ATLAS_SIZE = 512;
const atlasCache = new Map<VehicleFoliageKind, THREE.Texture | null>();

type MipImage = { data: Uint8ClampedArray; width: number; height: number };
const mipImage = (size: number): MipImage => (typeof ImageData === 'function'
  ? new ImageData(size, size) as MipImage
  : { data: new Uint8ClampedArray(size * size * 4), width: size, height: size });

/**
 * The coverage-preserving mip chain of an ImageData atlas (lighting.ts buildCoverageMipmaps' rule, run on the straight
 * alpha directly: a canvas round trip would premultiply away the flood tone of the transparent texels). Each level is
 * a 2 x 2 box of the one above, then its alpha is remapped so the share of texels passing the cut matches level 0 —
 * a distant card keeps its leafy silhouette instead of thinning below the cut or resolving as a flood rectangle.
 */
function coverageMipChain(level0: MipImage, cutoff: number): MipImage[] {
  const cut = Math.round(cutoff * 255);
  const coverage = (d: Uint8ClampedArray): number => {
    let pass = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] >= cut) pass++;
    return pass / (d.length / 4);
  };
  const target = coverage(level0.data);
  const chain: MipImage[] = [level0];
  let prev = level0;
  for (let size = level0.width >> 1; size >= 1; size >>= 1) {
    const next = mipImage(size);
    const src = prev.data, dst = next.data, sw = size * 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const tl = ((y * 2) * sw + x * 2) * 4, bl = tl + sw * 4, o = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) dst[o + c] = (src[tl + c] + src[tl + 4 + c] + src[bl + c] + src[bl + 4 + c] + 2) >> 2;
    }
    const now = coverage(dst);
    if (target > 0 && size >= 2 && (now < target * 0.7 || now > target * 1.3)) {
      const alphas: number[] = [];
      for (let i = 3; i < dst.length; i += 4) alphas.push(dst[i]);
      alphas.sort((a, b) => b - a);
      const quantile = Math.max(1, alphas[Math.min(alphas.length - 1, Math.max(0, Math.round(target * alphas.length) - 1))]);
      for (let i = 3; i < dst.length; i += 4) dst[i] = Math.max(0, Math.min(255, cut + (dst[i] - quantile) * 3));
    }
    chain.push(next);
    prev = next;
  }
  return chain;
}

/** Give an ImageData-backed atlas its coverage-preserving mips (idempotent; lighting.ts then leaves it alone). */
function attachCoverageMips(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as MipImage | null;
  if (!image?.data || !image.width || image.width !== image.height || (image.width & (image.width - 1)) !== 0) return texture;
  if (texture.mipmaps && texture.mipmaps.length > 0) return texture;
  texture.mipmaps = coverageMipChain(image, FOLIAGE_ALPHA_TEST) as unknown as typeof texture.mipmaps;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function kindSeed(kind: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < kind.length; i++) { h ^= kind.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint the multispectral garnish: jagged cut flaps over a knotted carrier in 2 x 2 tiles, straight alpha. */
function makeGarnishAtlas(kind: 'garnish-woodland' | 'garnish-arid'): THREE.Texture {
  const size = ATLAS_SIZE, T = FOLIAGE_ATLAS_TILES, S = size / T;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('vehicleFoliage: Canvas2D unavailable');
  ctx.clearRect(0, 0, size, size);
  const rng = seeded(kind === 'garnish-woodland' ? 0x5eed11 : 0x5eed33);
  const palette = kind === 'garnish-woodland'
    ? ['#3d4a2c', '#54583a', '#4a3d2b', '#2f3a26', '#636848']
    : ['#8a7a56', '#9c8a62', '#7a6c4c', '#a89670', '#6c6046'];
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
    ctx.save();
    ctx.beginPath(); ctx.rect(tx * S, ty * S, S, S); ctx.clip();
    ctx.translate(tx * S, ty * S);
    // the carrier: a sparse knotted web behind the flaps, stem seat at the bottom centre
    ctx.strokeStyle = 'rgba(40,44,32,0.85)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(S * 0.5, S * 0.98);
      ctx.lineTo(S * (0.15 + rng() * 0.7), S * (0.1 + rng() * 0.5));
      ctx.stroke();
    }
    // cut flaps: irregular five- to seven-sided leaves, a darker cut edge, oriented outward from the seat
    for (let f = 0; f < 26; f++) {
      const cx = S * (0.18 + rng() * 0.64), cy = S * (0.12 + rng() * 0.7);
      const r = S * (0.07 + rng() * 0.08);
      const sides = 5 + ((rng() * 3) | 0);
      const rot = rng() * Math.PI * 2;
      ctx.fillStyle = palette[(rng() * palette.length) | 0];
      ctx.strokeStyle = 'rgba(20,22,16,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const rr = r * (0.55 + rng() * 0.6) * (i % 2 ? 0.72 : 1);
        const px = cx + Math.cos(a) * rr * 1.25, py = cy + Math.sin(a) * rr * 0.8;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  const image = ctx.getImageData(0, 0, size, size);
  // elliptical falloff per tile so deep mips fall below the cut instead of resolving the card as a rectangle;
  // empty texels take the tile's mean tone (the spray atlases' flood rule)
  const d = image.data;
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((ty * S + y) * size + tx * S + x) * 4;
      if (d[i + 3] > 160) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    const fr = n ? r / n : 70, fg = n ? g / n : 72, fb = n ? b / n : 50;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((ty * S + y) * size + tx * S + x) * 4;
      const ex = (x + 0.5) / S * 2 - 1, ey = (y + 0.5) / S * 2 - 1;
      const fall = Math.max(0, Math.min(1, (1 - Math.hypot(ex, ey * 0.98)) / 0.16));
      d[i + 3] = Math.round(d[i + 3] * fall);
      if (d[i + 3] < 24) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; }
    }
  }
  const texture = new THREE.Texture(image as unknown as HTMLImageElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.name = `vehicleFoliage:${kind}`;
  return texture;
}

// ---------------------------------------------------------------------------------------------------------------
// Ghillie garnish atlas (round 5, 2026-10-08; wave 253 on the Leopard 2A4's suit: "the bushy leaf bundles ... are
// near-identical clones at regular spacing", "round leaf blotches stuck on like decals"; the coordinator: "burlap
// garnish strips tied in irregular clusters, not decals or cloned bundles"). A crew garnishes its net with cut cloth
// and burlap strips knotted in and with boughs cut on the spot. One atlas carries both, so the garnish stays one draw:
// the top row is the species' first two spray tiles (the trees lane's atlas), the bottom row two bunches of cut burlap
// strips fanning out of a knot at the tile's foot, painted in a light neutral hessian that each card's tint colours for
// its theatre (woodland greens and browns, desert sand, snow white).
// ---------------------------------------------------------------------------------------------------------------

/** The atlas tiles of a ghillie garnish atlas: the species' boughs, and the strip bunches. */
export const GARNISH_BOUGH_TILES = [0, 1] as const;
export const GARNISH_STRIP_TILES = [2, 3] as const;
/** The strip tiles' painted hessian, sRGB: a card's tint is the linear colour it should show over this one's. */
export const GARNISH_STRIP_BASE_SRGB: readonly [number, number, number] = [200, 189, 160];

const garnishAtlasCache = new Map<SprayKind, THREE.Texture | null>();

/** Paint one tile of knotted burlap strips (stem seat at the tile's bottom centre, tips toward the top). */
function paintStripTile(ctx: CanvasRenderingContext2D, S: number, rng: () => number): void {
  const [br, bg, bb] = GARNISH_STRIP_BASE_SRGB;
  const knotX = S * (0.46 + rng() * 0.08), knotY = S * 0.965;
  const count = 7 + Math.floor(rng() * 5);
  const strips: Array<() => void> = [];
  for (let k = 0; k < count; k++) {
    const share = k / (count - 1) - 0.5;
    const ang = -Math.PI / 2 + share * (1.0 + rng() * 0.5) + (rng() - 0.5) * 0.3;
    const len = S * (0.45 + rng() * 0.48), wid = S * (0.035 + rng() * 0.06);
    const bend = (rng() - 0.5) * len * 0.6, twist = rng() * Math.PI, twists = 0.4 + rng() * 1.4;
    const value = 0.74 + rng() * 0.34, warm = (rng() - 0.5) * 0.14;
    const fray = rng();
    const jag: number[] = [];
    for (let t = 0; t <= 16; t++) jag.push(0.8 + rng() * 0.4);
    strips.push(() => {
      const cx = Math.cos(ang), cy = Math.sin(ang), nx = -cy, ny = cx;
      const steps = 16, pts: Array<[number, number, number]> = [];
      for (let t = 0; t <= steps; t++) {
        const u = t / steps, tw = Math.abs(Math.cos(twist + u * twists * Math.PI));
        const w = wid * (0.45 + 0.55 * Math.min(1, u * 3)) * (0.35 + 0.65 * tw) * jag[t];
        // a strip hangs: it bends one way and sags back toward the vertical near its end
        const off = bend * Math.sin(u * Math.PI * 0.8);
        pts.push([knotX + cx * u * len + nx * off, knotY + cy * u * len + ny * off, w / 2]);
      }
      const edge = (t: number, sgn: number): [number, number] => {
        const [x, y, hw] = pts[t], a = pts[Math.max(0, t - 1)], b = pts[Math.min(steps, t + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        return [x - (dy / l) * hw * sgn, y + (dx / l) * hw * sgn];
      };
      const tone = [br * value * (1 + warm), bg * value, bb * value * (1 - warm)].map((c) => Math.min(255, c | 0));
      ctx.beginPath();
      for (let t = 0; t <= steps; t++) { const [x, y] = edge(t, 1); if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      // the cut end: frayed into a few short tails, or cut on the bias
      const [ex, ey, ew] = pts[steps];
      const tails = fray < 0.6 ? 3 + Math.floor(rng() * 3) : 1;
      for (let q = 0; q < tails; q++) {
        const o = tails > 1 ? (q / (tails - 1) - 0.5) * ew * 1.8 : 0;
        ctx.lineTo(ex + nx * o + cx * wid * (0.25 + rng() * 0.9), ey + ny * o + cy * wid * (0.25 + rng() * 0.9));
        ctx.lineTo(ex + nx * (o - ew * 0.3), ey + ny * (o - ew * 0.3));
      }
      for (let t = steps; t >= 0; t--) { const [x, y] = edge(t, -1); ctx.lineTo(x, y); }
      ctx.closePath();
      // shaded toward the knot where the bunch gathers, lighter toward the free end
      const grad = ctx.createLinearGradient(knotX, knotY, ex, ey);
      grad.addColorStop(0, `rgb(${(tone[0] * 0.62) | 0},${(tone[1] * 0.6) | 0},${(tone[2] * 0.56) | 0})`);
      grad.addColorStop(0.35, `rgb(${tone[0]},${tone[1]},${tone[2]})`);
      grad.addColorStop(1, `rgb(${Math.min(255, tone[0] * 1.08) | 0},${Math.min(255, tone[1] * 1.08) | 0},${Math.min(255, tone[2] * 1.06) | 0})`);
      ctx.fillStyle = grad;
      ctx.fill();
      // hessian fibre: a speckle of darker and lighter flecks inside the strip
      ctx.save();
      ctx.clip();
      for (let f = 0; f < 70; f++) {
        const u = rng(), [x, y, hw] = pts[Math.min(steps, Math.floor(u * steps))];
        const o = (rng() - 0.5) * 2 * hw;
        const dark = rng() < 0.6;
        ctx.fillStyle = dark ? `rgba(${(tone[0] * 0.55) | 0},${(tone[1] * 0.52) | 0},${(tone[2] * 0.48) | 0},0.35)`
          : `rgba(${Math.min(255, tone[0] * 1.2) | 0},${Math.min(255, tone[1] * 1.2) | 0},${Math.min(255, tone[2] * 1.15) | 0},0.3)`;
        ctx.fillRect(x + nx * o, y + ny * o, 1 + rng() * 2.2, 1 + rng() * 1.2);
      }
      ctx.restore();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(${(tone[0] * 0.48) | 0},${(tone[1] * 0.46) | 0},${(tone[2] * 0.42) | 0},0.5)`;
      ctx.stroke();
    });
  }
  // the far strips first: the bunch overlaps toward the viewer's side
  for (const draw of strips) draw();
  // loose jute fibres frayed out of the bunch
  ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI / 2 + (rng() - 0.5) * 1.6, len = S * (0.3 + rng() * 0.4);
    ctx.strokeStyle = `rgba(${(br * 0.82) | 0},${(bg * 0.8) | 0},${(bb * 0.74) | 0},0.85)`;
    ctx.lineWidth = 1.4 + rng() * 1.2;
    ctx.beginPath(); ctx.moveTo(knotX, knotY);
    ctx.quadraticCurveTo(knotX + Math.cos(ang) * len * 0.5 + (rng() - 0.5) * 18, knotY + Math.sin(ang) * len * 0.5,
      knotX + Math.cos(ang) * len, knotY + Math.sin(ang) * len);
    ctx.stroke();
  }
  // the knot
  ctx.fillStyle = `rgb(${(br * 0.55) | 0},${(bg * 0.52) | 0},${(bb * 0.46) | 0})`;
  ctx.beginPath(); ctx.ellipse(knotX, knotY - S * 0.012, S * 0.04, S * 0.026, 0, 0, Math.PI * 2); ctx.fill();
}

/** The elliptical falloff and mean-tone flood of the given tiles (makeGarnishAtlas's rule): mips stay leafy, not boxed. */
function finishGarnishTiles(d: Uint8ClampedArray, size: number, S: number, tiles: readonly number[]): void {
  const T = FOLIAGE_ATLAS_TILES;
  for (const tile of tiles) {
    const tx = tile % T, ty = Math.floor(tile / T);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((ty * S + y) * size + tx * S + x) * 4;
      if (d[i + 3] > 160) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    const fr = n ? r / n : 150, fg = n ? g / n : 140, fb = n ? b / n : 118;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = ((ty * S + y) * size + tx * S + x) * 4;
      const ex = (x + 0.5) / S * 2 - 1, ey = (y + 0.5) / S * 2 - 1;
      const fall = Math.max(0, Math.min(1, (1 - Math.hypot(ex, ey * 0.98)) / 0.16));
      // the stem seat at the tile's foot keeps its knot (a strip bunch hangs from it)
      const foot = y > S * 0.9 && Math.abs(ex) < 0.12 ? 1 : fall;
      d[i + 3] = Math.round(d[i + 3] * foot);
      if (d[i + 3] < 24) { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; }
    }
  }
}

/**
 * The ghillie garnish atlas of a species: its boughs in tiles GARNISH_BOUGH_TILES, burlap strip bunches in
 * GARNISH_STRIP_TILES, with coverage-preserving mips. Cached per species; null without a DOM (the geometry is the same).
 */
export function ghillieGarnishAtlas(species: SprayKind): THREE.Texture | null {
  if (garnishAtlasCache.has(species)) return garnishAtlasCache.get(species)!;
  let texture: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    try {
      const sprays = makeSprayAtlas(species, seeded(kindSeed(species)), ATLAS_SIZE, null, 0);
      const source = sprays.image as unknown as MipImage;
      const size = ATLAS_SIZE, T = FOLIAGE_ATLAS_TILES, S = size / T;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !source?.data || source.width !== size) throw new Error('vehicleFoliage: Canvas2D unavailable');
      ctx.clearRect(0, 0, size, size);
      const rng = seeded(kindSeed(`ghillie-strips:${species}`));
      for (const tile of GARNISH_STRIP_TILES) {
        const tx = tile % T, ty = Math.floor(tile / T);
        ctx.save();
        ctx.beginPath(); ctx.rect(tx * S, ty * S, S, S); ctx.clip();
        ctx.translate(tx * S, ty * S);
        paintStripTile(ctx as CanvasRenderingContext2D, S, rng);
        ctx.restore();
      }
      // the spray tiles keep their straight-alpha bytes (a canvas round trip would premultiply their flood away); the
      // strip tiles come from the canvas
      const image = ctx.getImageData(0, 0, size, size);
      const out = image.data, src = source.data;
      for (const tile of GARNISH_BOUGH_TILES) {
        const tx = tile % T, ty = Math.floor(tile / T);
        for (let y = 0; y < S; y++) {
          const at = ((ty * S + y) * size + tx * S) * 4;
          out.set(src.subarray(at, at + S * 4), at);
        }
      }
      finishGarnishTiles(out, size, S, GARNISH_STRIP_TILES);
      texture = new THREE.Texture(image as unknown as HTMLImageElement);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      texture.name = `vehicleFoliage:ghillie-garnish:${species}`;
      attachCoverageMips(texture);
      sprays.dispose();
    } catch {
      texture = null;
    }
  }
  if (typeof document !== 'undefined') garnishAtlasCache.set(species, texture);
  return texture;
}

/**
 * The shared atlas for one foliage kind: the trees lane's species spray atlas, or the painted multispectral garnish.
 * Null without a DOM (node receipts, the Garage workshop worker): the card geometry is identical either way.
 */
export function vehicleFoliageAtlas(kind: VehicleFoliageKind): THREE.Texture | null {
  if (atlasCache.has(kind)) return atlasCache.get(kind)!;
  let texture: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    try {
      texture = attachCoverageMips(kind === 'garnish-woodland' || kind === 'garnish-arid'
        ? makeGarnishAtlas(kind)
        : makeSprayAtlas(kind, seeded(kindSeed(kind)), ATLAS_SIZE, null, 0));
    } catch {
      texture = null;
    }
  }
  atlasCache.set(kind, texture);
  return texture;
}

type V3 = readonly [number, number, number];
const norm = (v: V3): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V3, b: V3): [number, number, number] =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

type P3 = [number, number, number];

/** A card's three rows (left edge, spine, right edge) as push() builds them, with its frame. */
function cardRows(card: FoliageCard): { rows: Array<[P3, P3, P3]>; faceOut: V3; right: V3 } {
  const axis = norm(card.axis);
  const right = norm(cross(axis, card.face));
  const f = norm(cross(right, axis));
  const faceOut: V3 = f[0] * card.out[0] + f[1] * card.out[1] + f[2] * card.out[2] < 0 ? [-f[0], -f[1], -f[2]] : f;
  const fold = card.fold ?? 0;
  const cf = Math.cos(fold), sf = Math.sin(fold);
  const rows: Array<[P3, P3, P3]> = [];
  for (let r = 0; r < 3; r++) {
    const t = r / 2;
    const along = -0.05 * card.length + t * card.length;
    const sag = card.bend * card.length * t * t;
    const half = card.width * 0.5 * (r === 0 ? 0.55 : r === 1 ? 1 : 0.88);
    const cx = card.stem[0] + axis[0] * along, cy = card.stem[1] + axis[1] * along - sag, cz = card.stem[2] + axis[2] * along;
    const h = half * cf, lift = half * sf;
    rows.push([
      [cx - right[0] * h + faceOut[0] * lift, cy - right[1] * h + faceOut[1] * lift, cz - right[2] * h + faceOut[2] * lift],
      [cx, cy, cz],
      [cx + right[0] * h + faceOut[0] * lift, cy + right[1] * h + faceOut[1] * lift, cz + right[2] * h + faceOut[2] * lift],
    ]);
  }
  return { rows, faceOut, right };
}

/** Every vertex a card would add (its reach): placement checks it against widths, openings and sweeps before pushing. */
export function foliageCardPoints(card: FoliageCard): P3[] {
  return cardRows(card).rows.flat();
}

export interface FoliageCard {
  /** The stem seat (where the twig enters the net). */
  stem: V3;
  /** Unit direction the spray reaches from its stem. */
  axis: V3;
  /** The card's face normal (orthogonal-ish to the axis). */
  face: V3;
  /** The carrier's outward normal at the seat (lights the card as part of the mass). */
  out: V3;
  length: number;
  width: number;
  /** Atlas tile index 0..3. */
  tile: number;
  /** Gravity droop of the tip as a share of the length. */
  bend: number;
  tint: V3;
  /**
   * Spine fold in radians (round 3): each half of the card leaves the stem's plane by this angle, toward the card's
   * outer face for a positive fold (a twig's leaves held in a shallow V) or behind it for a negative one (a spray
   * pressed against a drape). 0 or absent: the flat four-triangle card (the coarse level).
   */
  fold?: number;
}

/**
 * Accumulates bent three-row spray cards into one draw: four triangles a flat card, eight a folded one (its stem the
 * spine). Positions, volume normals, atlas UVs (stem at v = 0 like the trees' cards) and per-card tint.
 */
export class FoliageCardBuffer {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];

  private cards = 0;
  get cardCount(): number { return this.cards; }

  push(card: FoliageCard): void {
    const { rows, faceOut, right } = cardRows(card);
    // the volume normal: the card's face, the carrier's outward normal and the sky (the spray lit as part of a mass)
    const volume = (f: V3): [number, number, number] => norm([f[0] * 0.45 + card.out[0] * 0.45,
      f[1] * 0.45 + card.out[1] * 0.45 + 0.25, f[2] * 0.45 + card.out[2] * 0.45]);
    const n = volume(faceOut);
    const fold = card.fold ?? 0;
    const cf = Math.cos(fold), sf = Math.sin(fold);
    // a folded card's halves face out of the V: the left half's normal leans toward +right, the right half's toward -right
    const nL = fold ? volume([faceOut[0] * cf + right[0] * sf, faceOut[1] * cf + right[1] * sf, faceOut[2] * cf + right[2] * sf]) : n;
    const nR = fold ? volume([faceOut[0] * cf - right[0] * sf, faceOut[1] * cf - right[1] * sf, faceOut[2] * cf - right[2] * sf]) : n;
    const tiles = FOLIAGE_ATLAS_TILES;
    const tx = card.tile % tiles, ty = Math.floor(card.tile / tiles) % tiles;
    const u0 = tx / tiles, v0 = 1 - (ty + 1) / tiles, du = 1 / tiles, dv = 1 / tiles;
    const vert = (p: readonly number[], nn: V3, u: number, v: number): void => {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nn[0], nn[1], nn[2]);
      this.uvs.push(u0 + u * du, v0 + v * dv);
      this.colors.push(card.tint[0], card.tint[1], card.tint[2]);
    };
    for (let r = 0; r < 2; r++) {
      const a = rows[r], b = rows[r + 1];
      const va = r / 2, vb = (r + 1) / 2;
      if (!fold) {
        vert(a[0], n, 0, va); vert(a[2], n, 1, va); vert(b[2], n, 1, vb);
        vert(a[0], n, 0, va); vert(b[2], n, 1, vb); vert(b[0], n, 0, vb);
        continue;
      }
      // the left half (u 0..0.5) then the right half (u 0.5..1), each wound like the flat card (front face = faceOut)
      vert(a[0], nL, 0, va); vert(a[1], n, 0.5, va); vert(b[1], n, 0.5, vb);
      vert(a[0], nL, 0, va); vert(b[1], n, 0.5, vb); vert(b[0], nL, 0, vb);
      vert(a[1], n, 0.5, va); vert(a[2], nR, 1, va); vert(b[2], nR, 1, vb);
      vert(a[1], n, 0.5, va); vert(b[2], nR, 1, vb); vert(b[1], n, 0.5, vb);
    }
    this.cards++;
  }

  toGeometry(): THREE.BufferGeometry | null {
    if (!this.positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    return geometry;
  }
}

/** Configure a per-visual foliage material clone (map, cut, both faces, tint-driven colour) before registration. */
export function configureFoliageMaterial(material: THREE.MeshStandardMaterial, atlas: THREE.Texture | null): void {
  material.color.setHex(0xffffff);
  material.map = atlas;
  material.alphaTest = atlas ? FOLIAGE_ALPHA_TEST : 0;
  material.side = THREE.DoubleSide;
  material.vertexColors = true;
  material.roughness = 0.9;
  material.metalness = 0;
  material.envMapIntensity = 0.1;
  material.transparent = false;
}
