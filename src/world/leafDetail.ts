// src/world/leafDetail.ts — Round 77b (2026-09-26, the second vegetation pass): the leaf-scale crown detail.
//
// The near cards carry the round-8 leaf atlases (hash-pinned by broadleafBranchlets.selftest; never altered here) and,
// since round 77, per-vertex sphere normals: a crown shades as a lit volume, but every card is still lit FLAT across
// its own face, so at 5–15 m the sun never catches a leaf. This module generates, once per world and per foliage
// class, a small tiling detail tile the near material applies OVER the card with the card's own UVs: a tangent-space
// normal of overlapping leaf clusters (the lit side of a crown breaks into leaf-scale highlights and shade) and a
// mean-neutral alpha-break mask (the card's antialiased edge texels are eaten in leaf-cluster-sized bites, so the
// silhouette breaks into clusters instead of a card outline; at the far mips the mask averages to ×1 and the
// distance coverage the mip guard protects is untouched).
//
// Pure CPU (a height field of stamped leaf shapes, wrapped for tiling, a Sobel normal): no canvas, so the receipts
// build it byte-exactly in Node; deterministic from the class salt and the world seed; a DataTexture per class
// (256 × 256 RGBA, RG = normal xy, B = normal z, A = the break mask), RepeatWrapping, repeated LEAF_DETAIL_REPEAT
// times across a card. Desktop tiers only (vegetation.ts leaves the mobile material without a normal map).
import * as THREE from 'three';
import { TREE_ARCHETYPES, type TreeSpecies } from './treeSpecies.ts';

export type LeafDetailClass = 'broadleaf' | 'conifer' | 'autumn' | 'palm';
export type LeafDetailFamily = 'conifer' | 'broadleaf' | 'palm' | 'birch';
type ToneFunction = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];
/** The slice of a species palette the class resolution reads. */
export interface LeafDetailPalette { texTone?: ToneFunction | null }

export const LEAF_DETAIL_CLASSES: readonly LeafDetailClass[] = Object.freeze(['broadleaf', 'conifer', 'autumn', 'palm']);
/** The tile's edge in texels. */
export const LEAF_DETAIL_SIZE = 256;
/** Tiles across a card: a 1.1–2.4 m card carries 0.37–0.8 m tiles, leaves of 5–12 cm. */
export const LEAF_DETAIL_REPEAT = 3;
/** The material's normalScale for the detail normal. */
export const LEAF_DETAIL_NORMAL_SCALE = 0.75;
/**
 * The near material's use of the mask (vegetation.ts foliageWindHook): alpha × (floor + span × mask) and
 * albedo × (aoFloor + aoSpan × mask). Both are neutral at a mask of 0.5, so the far mips (where the mask averages
 * toward its mean) keep the coverage and the tone the pre-round cards had; near, the gaps between leaves are cut
 * and shaded and the leaves solidified.
 */
export const LEAF_DETAIL_LAW = Object.freeze({ alphaFloor: 0.72, alphaSpan: 0.56, aoFloor: 0.90, aoSpan: 0.20 });

const CLASS_SALT: Readonly<Record<LeafDetailClass, number>> = Object.freeze({
  broadleaf: 0x1ea1, conifer: 0x2ee2, autumn: 0x3a03, palm: 0x4a14,
});

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * The detail class of a species: its family, and for the leafy families the map palette's tone — an autumn (or
 * dusty) palette turns the reference green toward yellow and orange, and those crowns take the sparser, smaller
 * autumn leaves. Resolved from the palette itself, never from a map id.
 */
export function resolveLeafDetailClass(family: LeafDetailFamily, tone: ToneFunction | null | undefined): LeafDetailClass {
  if (family === 'conifer') return 'conifer';
  if (family === 'palm') return 'palm';
  if (tone) {
    const hue = tone(0.22, 0.30, 0.30)[0];
    if (Number.isFinite(hue) && hue < 0.18) return 'autumn';
  }
  return 'broadleaf';
}

/** Stamp one leaf onto the wrapped height field: an ellipse (a along its axis, b across) with a dome profile and a midrib. */
function stampLeaf(
  field: Float32Array, size: number,
  cx: number, cy: number, a: number, b: number, angle: number, height: number, ridge: number,
): void {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const reach = Math.ceil(Math.max(a, b)) + 1;
  const x0 = Math.floor(cx - reach), x1 = Math.ceil(cx + reach);
  const y0 = Math.floor(cy - reach), y1 = Math.ceil(cy + reach);
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const row = ((y % size) + size) % size;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      const r2 = (u / a) * (u / a) + (v / b) * (v / b);
      if (r2 >= 1) continue;
      const dome = Math.pow(1 - r2, 0.6);
      const rib = ridge > 0 ? Math.max(0, 1 - Math.abs(v) / (b * 0.16)) * ridge : 0;
      const h = height * (dome + rib);
      const index = row * size + (((x % size) + size) % size);
      if (h > field[index]) field[index] = h;
    }
  }
}

function paintHeightField(cls: LeafDetailClass, rng: () => number): Float32Array {
  const s = LEAF_DETAIL_SIZE, field = new Float32Array(s * s);
  if (cls === 'broadleaf' || cls === 'autumn') {
    // round-to-oval leaves at every angle; autumn stands sparser and smaller, so more of the card breaks open
    const count = cls === 'autumn' ? 70 : 110, aMin = cls === 'autumn' ? 11 : 15, aSpan = cls === 'autumn' ? 8 : 9;
    for (let leaf = 0; leaf < count; leaf++) {
      const a = aMin + rng() * aSpan, b = a * (0.50 + rng() * 0.22);
      stampLeaf(field, s, rng() * s, rng() * s, a, b, rng() * Math.PI, 0.62 + rng() * 0.38, 0.12);
    }
  } else if (cls === 'conifer') {
    // needle bundles: nine to fourteen thin needles fanning from a node, dense enough that the sprays overlap
    for (let bundle = 0; bundle < 84; bundle++) {
      const ox = rng() * s, oy = rng() * s, base = rng() * Math.PI * 2;
      const needles = 9 + (rng() * 6 | 0);
      for (let n = 0; n < needles; n++) {
        const angle = base + (rng() - 0.5) * 1.1, a = 11 + rng() * 6, b = 1.3 + rng() * 0.5;
        stampLeaf(field, s, ox + Math.cos(angle) * a * 0.9, oy + Math.sin(angle) * a * 0.9, a, b, angle, 0.55 + rng() * 0.45, 0);
      }
    }
  } else {
    // palm leaflets: long ridged strokes off a rib, alternating sides
    for (let leaflet = 0; leaflet < 40; leaflet++) {
      const side = leaflet % 2 ? 1 : -1;
      const angle = Math.PI / 2 + side * (0.45 + rng() * 0.30);
      const a = 34 + rng() * 22, b = 3 + rng() * 2;
      stampLeaf(field, s, rng() * s, rng() * s, a, b, angle, 0.7 + rng() * 0.3, 0.35);
    }
  }
  return field;
}

/** The mask's mean over the tile — the law is neutral only when it is one half. */
export const LEAF_DETAIL_MASK_MEAN = 0.5;

/**
 * The break mask from the height field: a smoothstep over the leaf bodies, then offset (and clamped) so its mean
 * over the tile is exactly LEAF_DETAIL_MASK_MEAN — a sparse needle tile takes a floor in its gaps and a dense
 * broadleaf tile a ceiling on its bodies, and both leave the far mips' coverage and tone where the pre-round cards
 * had them. A short bisection on the offset (the clamped mean is monotonic in it).
 */
function maskField(field: Float32Array): Float32Array {
  const raw = new Float32Array(field.length);
  for (let i = 0; i < field.length; i++) {
    const t = Math.min(1, Math.max(0, (field[i] - 0.03) / 0.15));
    raw[i] = t * t * (3 - 2 * t);
  }
  const meanAt = (offset: number): number => {
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum += Math.min(1, Math.max(0, raw[i] + offset));
    return sum / raw.length;
  };
  let lo = -1, hi = 1;
  for (let step = 0; step < 40; step++) {
    const mid = (lo + hi) / 2;
    if (meanAt(mid) < LEAF_DETAIL_MASK_MEAN) lo = mid; else hi = mid;
  }
  const offset = (lo + hi) / 2;
  const mask = new Float32Array(field.length);
  for (let i = 0; i < field.length; i++) mask[i] = Math.min(1, Math.max(0, raw[i] + offset));
  return mask;
}

/**
 * Build the detail tile of one class: RG = tangent-space normal xy, B = z (0..1 encoded), A = the break mask
 * (0 in the gaps between leaves, up to 1 on their bodies, a mean of one half). Deterministic from the seed.
 */
export function makeLeafDetailPixels(cls: LeafDetailClass, seed: number): Uint8Array {
  const s = LEAF_DETAIL_SIZE;
  const rng = mulberry32((seed ^ CLASS_SALT[cls]) >>> 0);
  const field = paintHeightField(cls, rng);
  const mask = maskField(field);
  // the thin needles and leaflets keep a gentler relief: their edges are most of their area, and a steep edge normal
  // on a 5 cm feature is speckle, not shading
  const strength = cls === 'conifer' ? 1.3 : cls === 'palm' ? 1.4 : 2.1;
  const H = (x: number, y: number): number => field[(((y % s) + s) % s) * s + (((x % s) + s) % s)];
  const pixels = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    // rows follow v (DataTexture, flipY off): +y is +v, so the gradient's sign is the standard one
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    const i = (y * s + x) * 4;
    pixels[i] = Math.round(nx * 127.5 + 127.5);
    pixels[i + 1] = Math.round(ny * 127.5 + 127.5);
    pixels[i + 2] = Math.round(nz * 127.5 + 127.5);
    pixels[i + 3] = Math.round(mask[y * s + x] * 255);
  }
  return pixels;
}

export function makeLeafDetailTexture(cls: LeafDetailClass, seed: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(makeLeafDetailPixels(cls, seed), LEAF_DETAIL_SIZE, LEAF_DETAIL_SIZE,
    THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.NoColorSpace; // linear data, never decoded
  texture.repeat.set(LEAF_DETAIL_REPEAT, LEAF_DETAIL_REPEAT);
  texture.name = `leafDetail:${cls}`;
  texture.needsUpdate = true;
  return texture;
}

/** A species' class: its archetype family and the map palette's tone (an unknown species reads as broadleaf). */
export function leafDetailClassOfSpecies(species: string, palette: LeafDetailPalette | null | undefined): LeafDetailClass {
  const archetype = Object.prototype.hasOwnProperty.call(TREE_ARCHETYPES, species)
    ? TREE_ARCHETYPES[species as TreeSpecies] : null;
  return resolveLeafDetailClass(archetype?.family ?? 'broadleaf', palette?.texTone ?? null);
}

export interface LeafDetailLibrary {
  /** The class of a species from its archetype family and the map palette's tone. */
  classOf(species: string, palette: LeafDetailPalette | null | undefined): LeafDetailClass;
  /** The class's tile, built on first use; null when the library is disabled (the mobile tier). */
  texture(cls: LeafDetailClass): THREE.DataTexture | null;
  /** Every tile built so far, for the world's retained-resource registration (a live array). */
  readonly textures: THREE.DataTexture[];
  readonly enabled: boolean;
}

/** One library per world: tiles are built lazily per class, so a map pays only for the classes its species use. */
export function createLeafDetailLibrary(seed: number, enabled: boolean): LeafDetailLibrary {
  const built = new Map<LeafDetailClass, THREE.DataTexture>();
  const textures: THREE.DataTexture[] = [];
  return {
    enabled,
    textures,
    classOf: leafDetailClassOfSpecies,
    texture(cls) {
      if (!enabled) return null;
      let texture = built.get(cls);
      if (!texture) { texture = makeLeafDetailTexture(cls, seed); built.set(cls, texture); textures.push(texture); }
      return texture;
    },
  };
}
