// Round 75 (2026-09-26): the painted corrugated-steel atlas of the props 'steel' bucket — shipping containers,
// tanks and drums. One generated 512 px atlas (albedo luminance, tangent normal, ORM) in four horizontal strips,
// each 6.1 m of sheet across the width (a twenty-foot container's side, 84 px/m) and 2.6 m of sheet up the strip:
//
//   strip 0  sideA   corrugation, corner posts, top/bottom rails, fork pockets, an ID stencil block, rust runs
//   strip 1  sideB   the same shell with a faded operator band and wordmark, patched panels, heavier rust
//   strip 2  plain   corrugation only, no rails — roofs, floors, tank shells, drums (tileable across, wraps in v)
//   strip 3  end     u 0–0.4 the double doors (gap, gaskets, bar shadows, ID and data plate); u 0.5–0.9 the blank end
//
// The atlas repeats in u only: a container side is exactly one atlas width, so a face's v stays inside its strip
// (mapBoxFaceUv). Vertex colours carry the livery; the albedo is a near-white luminance so the paint reads as the
// vertex colour, markings are dark stencils (a canvas alpha channel would be premultiplied on upload, so there is no
// light-on-dark mask: light liveries carry the black lettering), and the ORM's blue channel is a rust mask that the
// props weathering hook (props.ts, world-props-*-v7) mixes toward rust with its own break-up. Everything here is
// first-party generated; no image or model is loaded.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { normalTextureFromHeight, textureFromRgbaPixels, tileableTorusNoise } from './proceduralTexture.ts';

export const STEEL_ATLAS_SIZE = 512;
/** Metres of sheet one atlas width covers (a 20' container side) and one strip covers up (its height). */
export const STEEL_ATLAS_SPAN_M = 6.1;
export const STEEL_ATLAS_STRIP_M = 2.6;
export const STEEL_ATLAS_STRIP_COUNT = 4;
/** Rows kept clear at every strip edge so bilinear filtering never reads the neighbouring strip. */
const STRIP_GUARD_PX = 3;
const STRIP_PX = STEEL_ATLAS_SIZE / STEEL_ATLAS_STRIP_COUNT;
/** ISO container side corrugation: 209 mm pitch, trapezoidal, ~36 mm deep. */
const CORRUGATION_PITCH_M = 0.209;
/** Corner posts, rails and fork pockets in strip fractions (t runs 0 at the top rail to 1 at the bottom rail). */
const POST_U = 0.19 / STEEL_ATLAS_SPAN_M;
const TOP_RAIL_T = 0.07 / STEEL_ATLAS_STRIP_M;
const BOTTOM_RAIL_T = 1 - 0.17 / STEEL_ATLAS_STRIP_M;
const FORK_POCKETS_U: ReadonlyArray<readonly [number, number]> = [[0.255, 0.315], [0.685, 0.745]];
/** The door strip's regions along u: two leaves over 2.44 m, then the blank end. */
export const STEEL_DOOR_U: readonly [number, number] = [0, 2.44 / STEEL_ATLAS_SPAN_M];
export const STEEL_BLANK_END_U: readonly [number, number] = [0.5, 0.5 + 2.44 / STEEL_ATLAS_SPAN_M];

export type SteelStrip = 'sideA' | 'sideB' | 'plain' | 'end';
const STRIP_ORDER: readonly SteelStrip[] = ['sideA', 'sideB', 'plain', 'end'];

/** The v range of each strip (canvas textures flip: strip 0 is the top rows, v near 1). */
export const STEEL_STRIP_V: Readonly<Record<SteelStrip, readonly [number, number]>> = Object.freeze(
  Object.fromEntries(STRIP_ORDER.map((strip, k) => [strip, Object.freeze([
    1 - ((k + 1) * STRIP_PX - STRIP_GUARD_PX) / STEEL_ATLAS_SIZE,
    1 - (k * STRIP_PX + STRIP_GUARD_PX) / STEEL_ATLAS_SIZE,
  ] as const)])) as Record<SteelStrip, readonly [number, number]>,
);

export interface SteelAtlasTextures {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  surface: THREE.CanvasTexture;
}

interface SteelAtlasSlice {
  fine: true;
  stage: string;
}

// ---------------------------------------------------------------------------------------------- 5 x 7 stencil font

/** Column-major 5 x 7 glyphs (bit 0 the top row) for the stencilled codes and wordmarks. */
const FONT: Readonly<Record<string, readonly number[]>> = {
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e], '1': [0x00, 0x42, 0x7f, 0x40, 0x00], '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31], '4': [0x18, 0x14, 0x12, 0x7f, 0x10], '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30], '7': [0x01, 0x71, 0x09, 0x05, 0x03], '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e], A: [0x7e, 0x11, 0x11, 0x11, 0x7e], B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01], G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00], K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f], O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06], R: [0x7f, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01], U: [0x3f, 0x40, 0x40, 0x40, 0x3f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63], Z: [0x61, 0x51, 0x49, 0x45, 0x43], '-': [0x08, 0x08, 0x08, 0x08, 0x08],
};

/** Rasterise text into a mark layer (1 = ink) at an integer cell scale; spaces advance without ink. */
function stencil(
  mark: Float32Array, size: number, text: string, x0: number, y0: number, sx: number, sy: number,
): void {
  let x = x0;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let column = 0; column < 5; column++) {
        const bits = glyph[column];
        for (let row = 0; row < 7; row++) {
          if (!(bits >> row & 1)) continue;
          for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) {
            const px = x + column * sx + dx, py = y0 + row * sy + dy;
            if (px >= 0 && px < size && py >= 0 && py < size) mark[py * size + px] = 1;
          }
        }
      }
    }
    x += 6 * sx;
  }
}

function fillRect(layer: Float32Array, size: number, x0: number, y0: number, x1: number, y1: number, value: number): void {
  for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) layer[y * size + x] = value;
  }
}

// ---------------------------------------------------------------------------------------------- painter

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Trapezoidal corrugation height (0 trough, 1 crest) at a distance along the sheet. */
function corrugation(xm: number): number {
  const p = ((xm / CORRUGATION_PITCH_M) % 1 + 1) % 1;
  if (p < 0.34) return 1;
  if (p < 0.50) return 1 - (p - 0.34) / 0.16;
  if (p < 0.84) return 0;
  return (p - 0.84) / 0.16;
}

interface Texel {
  lum: number;
  rough: number;
  ao: number;
  rust: number;
  height: number;
}

/** The layers laid down before the per-texel pass: dark stencil ink and the faded operator band. */
function markLayers(size: number): { mark: Float32Array; band: Float32Array } {
  const mark = new Float32Array(size * size), band = new Float32Array(size * size);
  const px = (u: number) => Math.round(u * size);
  const row = (strip: number, t: number) => Math.round((strip + t) * STRIP_PX);
  // strip 0: the owner code and serial, the size/type code beneath (ISO 6346 layout, 7 px glyph rows = 0.18 m)
  stencil(mark, size, 'COTU 417208 3', px(0.66), row(0, 0.15), 1, 1);
  stencil(mark, size, '22G1', px(0.66), row(0, 0.26), 1, 1);
  stencil(mark, size, 'MAX GROSS 30480 KG', px(0.05), row(0, 0.80), 1, 1);
  // strip 1: a faded operator band across the middle with a bold wordmark and two chevrons
  fillRect(band, size, px(0.07), row(1, 0.33), px(0.93), row(1, 0.56), 1);
  stencil(mark, size, 'NORDLINE', px(0.34), row(1, 0.37), 3, 3);
  for (let y = row(1, 0.36); y < row(1, 0.53); y++) {
    const rise = (y - row(1, 0.36)) / (row(1, 0.53) - row(1, 0.36));
    const lean = Math.round((1 - Math.abs(rise * 2 - 1)) * 9);
    fillRect(mark, size, px(0.11) + lean, y, px(0.11) + lean + 6, y + 1, 1);
    fillRect(mark, size, px(0.155) + lean, y, px(0.155) + lean + 6, y + 1, 1);
  }
  stencil(mark, size, 'KTXU 903611 4', px(0.61), row(1, 0.12), 1, 1);
  // strip 3: the right door leaf carries the code again, the left leaf the CSC data plate
  stencil(mark, size, 'COTU 417208 3', px(0.215), row(3, 0.10), 1, 1);
  stencil(mark, size, '22G1', px(0.215), row(3, 0.21), 1, 1);
  fillRect(mark, size, px(0.055), row(3, 0.66), px(0.145), row(3, 0.78), 0.55);
  fillRect(mark, size, px(0.06), row(3, 0.675), px(0.14), row(3, 0.765), 0.25);
  stencil(mark, size, 'CSC', px(0.065), row(3, 0.685), 1, 1);
  return { mark, band };
}

/**
 * Paint one atlas texel. u runs across the atlas (0..1 = 6.1 m), t down the strip (0 at the top rail, 1 at the
 * bottom rail), strip is the row band. Noise is the world's simplex (tileable across for the plain strip).
 */
function paintTexel(noi: SimplexNoise, strip: number, u: number, t: number, out: Texel): void {
  const xm = u * STEEL_ATLAS_SPAN_M;
  const ym = (1 - t) * STEEL_ATLAS_STRIP_M;
  const plain = strip === 2;
  const end = strip === 3;
  // sheet: corrugation with a dent field, paint grain
  const dent = plain
    ? tileableTorusNoise(noi, u, t, 5, 2, 17 + strip)
    : noi.noise(xm * 1.7 + strip * 31, ym * 1.7 - 5);
  const grain = plain
    ? tileableTorusNoise(noi, u, t, 23, 9, 41 + strip)
    : noi.noise(xm * 9 + strip * 7, ym * 9 + 3);
  let cor = corrugation(xm + (plain ? 0 : strip * 0.05));
  let height = cor * 0.82 + 0.09 + dent * 0.08;
  let lum = 0.91 - (1 - cor) * 0.07 + grain * 0.025 + dent * 0.02;
  let rough = 0.50 + (1 - cor) * 0.10;
  let ao = 0.86 + cor * 0.14;
  let rust = 0;
  let framed = false; // corner posts and rails: flat, darker, their own roughness
  const frame = (l: number, r: number, a: number): void => {
    lum = l + grain * 0.02; rough = r; ao = a; height = 0.96 + dent * 0.03; cor = 1; framed = true;
  };
  if (!plain) {
    // the door strip: leaves at u 0-0.4, the blank end at 0.5-0.9, guard corrugation between
    const uu = end ? (u < STEEL_DOOR_U[1] ? u / STEEL_DOOR_U[1] : u >= STEEL_BLANK_END_U[0] && u < STEEL_BLANK_END_U[1]
      ? (u - STEEL_BLANK_END_U[0]) / (STEEL_BLANK_END_U[1] - STEEL_BLANK_END_U[0]) : -1) : u;
    const postU = end ? POST_U * STEEL_ATLAS_SPAN_M / 2.44 : POST_U;
    if (uu >= 0) {
      if (t < TOP_RAIL_T) frame(0.62, 0.60, 0.92);
      else if (t > BOTTOM_RAIL_T) {
        frame(0.54, 0.66, 0.84);
        if (!end && t > 0.945 && t < 0.985 && FORK_POCKETS_U.some(([a, b]) => u > a && u < b)) { lum = 0.16; ao = 0.45; height = 0.35; }
      } else if (uu < postU || uu > 1 - postU) frame(0.66, 0.58, 0.86);
      if (end && u < STEEL_DOOR_U[1] && !framed) {
        // two leaves: the centre gap, the gaskets, and the shadow of each locking bar (the bars are geometry)
        const leaf = u / STEEL_DOOR_U[1];
        if (Math.abs(leaf - 0.5) < 0.006) { lum = 0.22; height = 0.05; ao = 0.5; rough = 0.75; }
        else if (leaf < 0.012 || leaf > 0.988 || Math.abs(leaf - 0.5) < 0.02) { lum *= 0.72; height *= 0.7; ao *= 0.9; }
        for (const bar of [0.13, 0.35, 0.65, 0.87]) if (Math.abs(leaf - bar) < 0.03) { lum *= 0.86; ao *= 0.92; }
      }
    } else {
      // guard filler between the door strip's regions: plain corrugation
      lum = 0.9 - (1 - cor) * 0.06;
    }
    // base dirt: the lower half darkens toward the bottom rail, broken by a coarse field
    const dirt = smoothstep(0.5, 1.0, t) * (0.55 + 0.45 * (noi.noise(xm * 2.3 + 11, strip * 13) * 0.5 + 0.5)) * 0.32;
    lum *= 1 - dirt;
    rough += dirt * 0.28;
    // rust: runs from the top rail, a bloom along the bottom rail, the corner posts, sparse chips
    const weight = strip === 1 ? 1.25 : end ? 0.8 : 0.85;
    const runs = smoothstep(0.60, 0.92, noi.noise(xm * 9.5 + strip * 3, 0.4 + strip) * 0.5 + 0.5) * Math.exp(-t * 4.5);
    const bloom = smoothstep(0.78, 0.97, t) * smoothstep(0.35, 0.78, noi.noise(xm * 3.1 + 7, t * 6 + 11 + strip) * 0.5 + 0.5);
    const posts = (uu >= 0 && (uu < postU * 1.6 || uu > 1 - postU * 1.6)) ? smoothstep(0.45, 0.9, noi.noise(xm * 6, ym * 4 + 21) * 0.5 + 0.5) * 0.7 : 0;
    const chips = (noi.noise(xm * 40 + strip * 5, ym * 22 + 5) * 0.5 + 0.5) > 0.81 ? 0.9 : 0;
    rust = clamp((runs * 0.9 + bloom * 0.9 + posts + chips) * weight, 0, 1);
    if (strip === 1) {
      // patched panels: a few 1.1 m panels re-painted a shade off, the old paint chipped along the seams
      const panel = Math.floor(xm / 1.1);
      const patch = ((panel * 7919 + 13) % 17) / 17;
      if (patch < 0.32) lum *= 0.93; else if (patch > 0.8) lum *= 1.05;
      const seam = Math.abs((xm / 1.1 % 1 + 1) % 1 - 0.5);
      if (seam > 0.485) { lum *= 0.9; rust = Math.max(rust, 0.35); }
    }
  } else {
    // roofs, floors, tank shells: chips and blotches only (tileable) — the shader's base-dirt law does the rest
    const blotch = smoothstep(0.62, 0.9, tileableTorusNoise(noi, u, t, 3, 3, 71) * 0.5 + 0.5) * 0.6;
    const chips = (tileableTorusNoise(noi, u, t, 41, 23, 91) * 0.5 + 0.5) > 0.83 ? 0.9 : 0;
    rust = clamp(blotch + chips, 0, 1);
  }
  if (rust > 0) {
    height -= rust * 0.16;
    rough += rust * 0.34;
    lum *= 1 - rust * 0.2;
  }
  out.lum = clamp(lum, 0.08, 1);
  out.rough = clamp(rough, 0.3, 0.98);
  out.ao = clamp(ao, 0.35, 1);
  out.rust = rust;
  out.height = clamp(height, 0, 1);
}

/**
 * Paint the atlas sixteen rows per checkpoint (the props texture-row convention, propsTextureRows.selftest); the
 * three textures are published together at the end so a cancelled build owns no partial texture.
 */
export function* makeSteelAtlas(
  noi: SimplexNoise,
  anisotropy: number,
): Generator<SteelAtlasSlice, SteelAtlasTextures, void> {
  const s = STEEL_ATLAS_SIZE;
  const px = new Uint8ClampedArray(s * s * 4), orm = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const { mark, band } = markLayers(s);
  const texel: Texel = { lum: 0, rough: 0, ao: 0, rust: 0, height: 0 };
  for (let y = 0; y < s; y++) {
    const strip = Math.min(STEEL_ATLAS_STRIP_COUNT - 1, Math.floor(y / STRIP_PX));
    const t = (y - strip * STRIP_PX + 0.5) / STRIP_PX;
    for (let x = 0; x < s; x++) {
      const i = y * s + x, j = i * 4;
      paintTexel(noi, strip, (x + 0.5) / s, t, texel);
      let lum = texel.lum;
      if (band[i] > 0) lum = Math.min(1, lum * 1.12);
      if (mark[i] > 0) { lum *= 1 - 0.7 * mark[i]; texel.rough = Math.min(0.98, texel.rough + 0.12 * mark[i]); }
      const v = lum * 255;
      px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
      orm[j] = texel.ao * 255;
      orm[j + 1] = texel.rough * 255;
      orm[j + 2] = texel.rust * 255;
      orm[j + 3] = 255;
      hgt[i] = texel.height;
    }
    if ((y + 1) % 16 === 0) yield { fine: true, stage: `steel-rows-${y + 1}` };
  }
  // a web four pixels wide over a 36 mm rise: the Sobel sum of four samples reaches ~1 per pixel step, so 0.42
  // stands the crest flanks near 25° — readable as ribs, not the black-white stripes of an over-gained map
  return {
    albedo: textureFromRgbaPixels(px, s, { srgb: true, anisotropy }),
    normal: normalTextureFromHeight(hgt, s, 0.42, anisotropy),
    surface: textureFromRgbaPixels(orm, s, { anisotropy }),
  };
}

// ---------------------------------------------------------------------------------------------- UV mapping

/** BoxGeometry face order (each four vertices, uv (0,1) (1,1) (0,0) (1,0)). */
export const BOX_FACE = Object.freeze({ px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 });

/**
 * Map one face of a BoxGeometry into an atlas rectangle. The face's own u (its width, left to right seen from
 * outside) spans uRange and its v (bottom to top) spans vRange; with swap the face's v feeds the atlas u instead,
 * so a roof can run the ribs across its width.
 */
export function mapBoxFaceUv(
  geometry: THREE.BoxGeometry,
  face: number,
  uRange: readonly [number, number],
  vRange: readonly [number, number],
  swap = false,
): THREE.BoxGeometry {
  const uv = geometry.attributes.uv;
  for (let k = 0; k < 4; k++) {
    const i = face * 4 + k;
    const fu = uv.getX(i), fv = uv.getY(i);
    const a = swap ? fv : fu, b = swap ? fu : fv;
    uv.setXY(i, uRange[0] + a * (uRange[1] - uRange[0]), vRange[0] + b * (vRange[1] - vRange[0]));
  }
  geometry.userData.atlasUv = true;
  return geometry;
}

/**
 * A rectangle of the strip for a face that is a fraction of the strip's 6.1 m across; the face reads left to
 * right (its u) from an atlas position u0 in metres.
 */
export function stripSpanU(fromM: number, widthM: number): readonly [number, number] {
  return [fromM / STEEL_ATLAS_SPAN_M, (fromM + widthM) / STEEL_ATLAS_SPAN_M];
}

/**
 * Sheet UVs for a lathe / cylinder body (tanks, drums): u along the circumference in metres of sheet, v within the
 * plain strip along the length, so the ribs run around the shell. The geometry's uv must be the unit cylinder
 * parametrisation (u around, v along); widthM the circumference, lengthM the length.
 */
export function mapSheetUv(
  geometry: THREE.BufferGeometry,
  circumferenceM: number,
  lengthM: number,
  strip: SteelStrip = 'plain',
): THREE.BufferGeometry {
  const uv = geometry.attributes.uv;
  const [v0, v1] = STEEL_STRIP_V[strip];
  const spanV = Math.min(1, lengthM / STEEL_ATLAS_STRIP_M);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * circumferenceM / STEEL_ATLAS_SPAN_M, v0 + (v1 - v0) * (0.5 - spanV / 2 + uv.getY(i) * spanV));
  }
  geometry.userData.atlasUv = true;
  return geometry;
}
