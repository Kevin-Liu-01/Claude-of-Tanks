import * as THREE from 'three';
import { texSize } from '../engine/quality.ts';

export type HorizonDetailKind = 'woodland' | 'conifer' | 'scrub' | 'rock' | 'snow' | 'mesa';
export const HORIZON_DETAIL_ATLAS_VARIANTS = 4;

type Random = () => number;
type Context = CanvasRenderingContext2D;
const WIDTH = 384;
const BAND_HEIGHT = 64;
const GUTTER = 4;
const ROOT = BAND_HEIGHT - GUTTER;
const gray = (value: number): string => `rgb(${value},${value},${value})`;

function randomFrom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function ellipse(ctx: Context, x: number, y: number, rx: number, ry: number): void {
  ctx.moveTo(x + rx, y);
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

// Each crown/rock is painted with its own RNG, including the copies crossing
// the repeat seam. All forms join the buried root; there are no floating cards.
function paintWoodland(ctx: Context, rng: Random, x: number, width: number,
  height: number, scrub: boolean): void {
  if (!scrub) {
    paintWoodlandTree(ctx, rng, x, width, height);
    return;
  }
  const top = ROOT - height;
  const crownY = top + height * 0.33;
  ctx.beginPath();
  ctx.moveTo(x - width * 0.30, ROOT);
  ctx.lineTo(x - width * 0.36, crownY + height * 0.20);
  ctx.lineTo(x + width * 0.36, crownY + height * 0.20);
  ctx.lineTo(x + width * 0.30, ROOT);
  ctx.closePath();
  ellipse(ctx, x, crownY + height * 0.20, width * 0.43, height * 0.37);
  // Overlapping branch crowns vary in both size and height. Small branch
  // shoulders break the dome without turning it into a row of circles.
  const lobes = scrub ? 5 : 8;
  for (let i = 0; i < lobes; i++) {
    const a = Math.PI + (i / (lobes - 1)) * Math.PI;
    const rx = width * (0.15 + rng() * 0.11);
    const ry = height * (0.14 + rng() * 0.08);
    ellipse(ctx, x + Math.cos(a) * width * (0.25 + rng() * 0.08),
      crownY + Math.sin(a) * height * (0.08 + rng() * 0.08), rx, ry);
  }
  const shade = ctx.createLinearGradient(x - width / 2, top, x + width / 2, ROOT);
  shade.addColorStop(0, gray(scrub ? 234 : 238));
  shade.addColorStop(0.45, gray(218));
  shade.addColorStop(1, gray(195));
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Stand-scale leaf/branch masses, not a white-noise speckle layer.
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = gray(201 + Math.round(rng() * 32));
    ctx.beginPath();
    ellipse(ctx, x + (rng() - 0.5) * width, top + rng() * height,
      width * (0.06 + rng() * 0.12), height * (0.035 + rng() * 0.05));
    ctx.fill();
  }
  ctx.restore();
}

function paintWoodlandBranches(ctx: Context, x: number, width: number,
  height: number, lean: number): void {
  const forkY = ROOT - height * 0.38;
  const halfTrunk = Math.max(1.35, width * 0.045);
  ctx.beginPath();
  ctx.moveTo(x - halfTrunk * 1.15, ROOT);
  ctx.lineTo(x + lean * 0.4 - halfTrunk, forkY);
  ctx.lineTo(x + lean * 0.4 + halfTrunk, forkY);
  ctx.lineTo(x + halfTrunk * 1.15, ROOT);
  ctx.closePath();
  ctx.fillStyle = gray(202);
  ctx.fill();
  // Broad enough to remain four-neighbour connected after the constrained
  // atlas downsample, but separate from the crown's much wider silhouette.
  ctx.lineWidth = halfTrunk * 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = gray(208);
  for (const side of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + lean * 0.4, forkY + 1);
    ctx.quadraticCurveTo(x + lean * 0.7 + side * width * 0.08, forkY - height * 0.10,
      x + lean + side * width * 0.27, ROOT - height * (side === 0 ? 0.71 : 0.61));
    ctx.stroke();
  }
}

function paintWoodlandTree(ctx: Context, rng: Random, x: number, width: number,
  height: number): void {
  const top = ROOT - height;
  const lean = (rng() - 0.5) * width * 0.32;
  const crownX = x + lean;
  const crownY = top + height * (0.32 + rng() * 0.08);
  const broad = 0.32 + rng() * 0.12;
  const understory = rng() < 0.30;
  paintWoodlandBranches(ctx, x, width, height, lean);
  ctx.beginPath();
  ellipse(ctx, crownX, crownY, width * broad, height * 0.28);
  // The same seven branch masses now mix a deeper interlocking canopy with
  // occasional low attached growth. Do not add a separate shrub draw/form.
  for (let i = 0; i < 7; i++) {
    if (understory && i >= 5) {
      ellipse(ctx, x + lean * 0.2 + (i - 5.5) * width * 0.10,
        ROOT - 9 - rng() * 3, width * (0.16 + rng() * 0.05), 5.5);
    } else {
      const angle = Math.PI + i / 6 * Math.PI * 1.35;
      ellipse(ctx, crownX + Math.cos(angle) * width * (0.22 + rng() * 0.10),
        crownY + Math.sin(angle) * height * (0.12 + rng() * 0.04),
        width * (0.16 + rng() * 0.08), height * (0.14 + rng() * 0.07));
    }
  }
  const shade = ctx.createLinearGradient(crownX - width / 2, top, crownX + width / 2, crownY + height * 0.32);
  shade.addColorStop(0, gray(239));
  shade.addColorStop(0.48, gray(224));
  shade.addColorStop(1, gray(201));
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Leaf masses follow diagonal branch shoulders, not bright circular
  // polka dots spread down a filled rock-like trunk apron.
  for (let i = 0; i < 8; i++) {
    const px = crownX + (rng() - 0.5) * width * 0.76;
    const py = top + height * (0.13 + rng() * 0.53);
    ctx.beginPath();
    ctx.moveTo(px - width * 0.15, py + height * 0.035);
    ctx.quadraticCurveTo(px - width * 0.04, py - height * 0.05,
      px + width * 0.17, py - height * 0.015);
    ctx.strokeStyle = gray(210 + Math.round(rng() * 24));
    ctx.lineWidth = 1.1 + rng() * 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

function paintConifer(ctx: Context, rng: Random, x: number, width: number,
  height: number): void {
  const top = ROOT - height;
  const lean = (rng() - 0.5) * width * 0.16;
  const tiers = 5 + Math.floor(rng() * 3);
  const shoulders = Array.from({ length: tiers }, (_, i) => ({
    y: top + height * (0.16 + i / tiers * 0.69),
    left: width * (0.13 + i / tiers * 0.40) * (0.80 + rng() * 0.25),
    right: width * (0.13 + i / tiers * 0.40) * (0.80 + rng() * 0.25),
    droop: height * (0.05 + rng() * 0.025),
  }));
  ctx.beginPath();
  ctx.moveTo(x + lean - 1.2, top + 2);
  ctx.quadraticCurveTo(x + lean, top - 0.5, x + lean + 1.2, top + 2);
  for (const b of shoulders) {
    ctx.lineTo(x + b.right * 0.51, b.y);
    ctx.quadraticCurveTo(x + b.right * 0.82, b.y + b.droop * 0.48,
      x + b.right, b.y + b.droop);
    ctx.lineTo(x + b.right * 0.46, b.y + b.droop * 1.1);
  }
  ctx.lineTo(x + width * 0.28, ROOT);
  ctx.lineTo(x - width * 0.28, ROOT);
  for (let i = shoulders.length - 1; i >= 0; i--) {
    const b = shoulders[i];
    ctx.lineTo(x - b.left * 0.48, b.y + b.droop * 1.1);
    ctx.lineTo(x - b.left, b.y + b.droop);
    ctx.quadraticCurveTo(x - b.left * 0.78, b.y + b.droop * 0.42,
      x - b.left * 0.50, b.y);
  }
  ctx.closePath();
  const shade = ctx.createLinearGradient(x - width * 0.40, top, x + width * 0.48, ROOT);
  shade.addColorStop(0, gray(236));
  shade.addColorStop(0.5, gray(216));
  shade.addColorStop(1, gray(194));
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (const b of shoulders) {
    ctx.beginPath();
    ctx.moveTo(x - b.left, b.y + b.droop);
    ctx.quadraticCurveTo(x - width * 0.05, b.y + b.droop * 0.4,
      x + b.right, b.y + b.droop);
    ctx.strokeStyle = gray(188 + Math.round(rng() * 25));
    ctx.lineWidth = 1.1 + rng() * 0.7;
    ctx.stroke();
  }
  ctx.restore();
}

function paintRock(ctx: Context, rng: Random, x: number, width: number,
  height: number, kind: 'rock' | 'mesa' | 'snow'): void {
  const top = ROOT - height;
  const left = x - width * 0.5;
  const right = x + width * 0.5;
  const isSnow = kind === 'snow';
  ctx.beginPath();
  ctx.moveTo(left, ROOT);
  if (isSnow) {
    // A windward rise, broad rounded cornice and downwind shoulder. The
    // contrasting break below is still attached to this same snow shelf.
    ctx.bezierCurveTo(left + width * 0.04, top + height * 0.45,
      x - width * 0.25, top + height * 0.03, x + width * 0.04, top + 1);
    ctx.bezierCurveTo(x + width * 0.28, top - 1,
      right - width * 0.04, top + height * 0.20, right, ROOT);
  } else if (kind === 'mesa') {
    ctx.lineTo(left + width * 0.12, top + height * 0.40);
    ctx.lineTo(left + width * 0.26, top + height * 0.06);
    ctx.lineTo(x - width * 0.13, top + rng() * height * 0.08);
    ctx.lineTo(x + width * 0.14, top + height * 0.05);
    ctx.lineTo(right - width * 0.15, top + height * 0.11);
    ctx.lineTo(right - width * 0.05, top + height * 0.55);
    ctx.lineTo(right, ROOT);
  } else {
    // Interlocking tilted rock shoulders, not sedimentary flat-topped mesas.
    ctx.lineTo(left + width * 0.08, top + height * 0.66);
    ctx.lineTo(left + width * 0.18, top + height * 0.44);
    ctx.lineTo(left + width * 0.32, top + height * 0.49);
    ctx.lineTo(left + width * 0.40, top + height * 0.15);
    ctx.lineTo(x + width * 0.05, top + rng() * height * 0.09);
    ctx.lineTo(x + width * 0.13, top + height * 0.30);
    ctx.lineTo(right - width * 0.22, top + height * 0.23);
    ctx.lineTo(right - width * 0.05, top + height * 0.68);
    ctx.lineTo(right, ROOT);
  }
  ctx.closePath();
  const shade = ctx.createLinearGradient(left, top, right, ROOT);
  shade.addColorStop(0, gray(isSnow ? 246 : 238));
  shade.addColorStop(0.46, gray(isSnow ? 234 : 221));
  shade.addColorStop(1, gray(isSnow ? 218 : 197));
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (isSnow) {
    ctx.beginPath();
    ctx.moveTo(left, ROOT);
    ctx.lineTo(x - width * 0.23, top + height * 0.60);
    ctx.lineTo(x - width * 0.08, top + height * 0.48);
    ctx.lineTo(x + width * 0.11, top + height * 0.76);
    ctx.lineTo(right, ROOT);
    ctx.closePath();
    ctx.fillStyle = gray(184 + Math.round(rng() * 24));
    ctx.fill();
  }
  // Local oblique fractures/strata stop within the individual block: no
  // full-width horizontal contour stripe or full-height vertical fiber.
  const lines = isSnow || kind === 'rock' ? 3 : 5;
  for (let i = 0; i < lines; i++) {
    const y = top + height * (0.19 + i * 0.14);
    const start = left + rng() * width * 0.25;
    ctx.beginPath();
    ctx.moveTo(start, y);
    if (kind === 'rock') {
      ctx.lineTo(start + width * 0.16, y + height * 0.22);
      ctx.lineTo(start + width * 0.09, y + height * 0.34);
      ctx.lineTo(start + width * 0.28, y + height * 0.66);
    } else {
      ctx.quadraticCurveTo(x, y + height * (rng() - 0.5) * 0.14,
        right - rng() * width * 0.18, y + height * 0.035);
    }
    ctx.strokeStyle = gray(isSnow ? 215 + Math.round(rng() * 17) : 188 + Math.round(rng() * 29));
    ctx.lineWidth = isSnow ? 0.8 : 1.0 + rng() * 0.8;
    ctx.stroke();
  }
  if (!isSnow) {
    ctx.beginPath();
    ctx.moveTo(x + width * 0.10, top + height * 0.15);
    ctx.lineTo(x - width * 0.03, top + height * 0.51);
    ctx.lineTo(x + width * 0.14, top + height * 0.83);
    ctx.strokeStyle = gray(184);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

interface StandLayout {
  count: number;
  widthMin: number;
  widthRange: number;
  heightMin: number;
  heightRange: number;
  rootTone: number;
}

const STANDS: Readonly<Record<HorizonDetailKind, StandLayout>> = {
  woodland: { count: 23, widthMin: 17, widthRange: 18, heightMin: 20, heightRange: 30, rootTone: 197 },
  conifer: { count: 30, widthMin: 17, widthRange: 18, heightMin: 20, heightRange: 30, rootTone: 197 },
  scrub: { count: 24, widthMin: 17, widthRange: 18, heightMin: 14, heightRange: 16, rootTone: 197 },
  rock: { count: 14, widthMin: 30, widthRange: 36, heightMin: 20, heightRange: 30, rootTone: 201 },
  snow: { count: 14, widthMin: 30, widthRange: 36, heightMin: 18, heightRange: 26, rootTone: 220 },
  mesa: { count: 14, widthMin: 30, widthRange: 36, heightMin: 20, heightRange: 30, rootTone: 201 },
};

function paintForm(ctx: Context, kind: HorizonDetailKind, seed: number,
  x: number, width: number, height: number): void {
  const rng = randomFrom(seed);
  if (kind === 'conifer') paintConifer(ctx, rng, x, width, height);
  else if (kind === 'woodland' || kind === 'scrub') paintWoodland(ctx, rng, x, width, height, kind === 'scrub');
  else paintRock(ctx, rng, x, width, height, kind);
}

function paintWrappedForm(ctx: Context, kind: HorizonDetailKind, seed: number,
  x: number, width: number, height: number): void {
  for (const shift of [-WIDTH, 0, WIDTH]) {
    const center = x + shift;
    if (center + width < 0 || center - width > WIDTH) continue;
    paintForm(ctx, kind, seed, center, width, height);
  }
}

function paintBand(ctx: Context, kind: HorizonDetailKind, seed: number): void {
  const rng = randomFrom(seed);
  const layout = STANDS[kind];
  // A short submerged apron connects all detail to the host terrain. The
  // height variation comes from irregular groups, not a sinusoidal roofline.
  ctx.fillStyle = gray(layout.rootTone);
  ctx.fillRect(0, ROOT - 4, WIDTH, 4);
  for (let i = 0; i < layout.count; i++) {
    const x = (i + rng() * 0.82) / layout.count * WIDTH
      + (kind === 'woodland' ? Math.sin(i * 1.73 + seed * 0.0001) * 7 : 0);
    const width = layout.widthMin + rng() * layout.widthRange;
    const height = layout.heightMin + rng() * layout.heightRange;
    const shapeSeed = (rng() * 0xFFFFFFFF) >>> 0;
    paintWrappedForm(ctx, kind, shapeSeed, x, width, height);
  }
}

/** Construction-only, caller-owned atlas. Neutral sRGB pigment is decoded by
 * Three.js and multiplied by the map's vertex tint. Band0 occupies v=0..¼;
 * a secondary family occupies bands2/3 without another material or texture. */
export function createHorizonDetailAtlas(kind: HorizonDetailKind, seed: number,
  secondaryKind?: HorizonDetailKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = texSize(WIDTH);
  canvas.height = texSize(BAND_HEIGHT * HORIZON_DETAIL_ATLAS_VARIANTS);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Horizon detail atlas requires Canvas2D');
  ctx.scale(canvas.width / WIDTH, canvas.height / (BAND_HEIGHT * HORIZON_DETAIL_ATLAS_VARIANTS));
  for (let variant = 0; variant < HORIZON_DETAIL_ATLAS_VARIANTS; variant++) {
    ctx.save();
    ctx.translate(0, (HORIZON_DETAIL_ATLAS_VARIANTS - variant - 1) * BAND_HEIGHT);
    ctx.beginPath();
    ctx.rect(0, GUTTER, WIDTH, BAND_HEIGHT - GUTTER * 2);
    ctx.clip();
    paintBand(ctx, secondaryKind && variant >= 2 ? secondaryKind : kind,
      (seed ^ Math.imul(variant + 1, 0x9E3779B1)) >>> 0);
    ctx.restore();
  }
  ctx.resetTransform();
  const raster = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < raster.data.length; i += 4) {
    // Canvas2D premultiplication discards RGB at alpha0. A tiny sub-cutoff
    // alpha floor preserves the neutral flood through the actual canvas
    // upload/mips while remaining invisible to the material's .38 alpha test.
    if (raster.data[i + 3] < 40) {
      raster.data[i] = raster.data[i + 1] = raster.data[i + 2] = 220;
      raster.data[i + 3] = 8;
    }
  }
  // Identical endpoint samples preserve the silhouette and pigment seam after
  // wrapping/minification. Interior shapes already wrap with identical seeds.
  for (let y = 0; y < canvas.height; y++) {
    const start = y * canvas.width * 4;
    raster.data.set(raster.data.subarray(start, start + 4), start + (canvas.width - 1) * 4);
  }
  ctx.putImageData(raster, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `horizon-detail:${kind}${secondaryKind ? `+${secondaryKind}` : ''}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 2;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
