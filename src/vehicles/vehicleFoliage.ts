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
import * as THREE from 'three';
import { makeSprayAtlas, SPRAY_ATLAS_TILES, type SprayKind } from '../world/treeSprayAtlas.ts';

export type VehicleFoliageKind = SprayKind | 'garnish-woodland' | 'garnish-arid';

/** Tiles per side of every vehicle foliage atlas (the trees' layout). */
export const FOLIAGE_ATLAS_TILES = SPRAY_ATLAS_TILES;
/** The alpha cut of every vehicle foliage card (the grown trees' near cards use 0.38). */
export const FOLIAGE_ALPHA_TEST = 0.4;

const ATLAS_SIZE = 256;
const atlasCache = new Map<VehicleFoliageKind, THREE.Texture | null>();

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

/**
 * The shared atlas for one foliage kind: the trees lane's species spray atlas, or the painted multispectral garnish.
 * Null without a DOM (node receipts, the Garage workshop worker): the card geometry is identical either way.
 */
export function vehicleFoliageAtlas(kind: VehicleFoliageKind): THREE.Texture | null {
  if (atlasCache.has(kind)) return atlasCache.get(kind)!;
  let texture: THREE.Texture | null = null;
  if (typeof document !== 'undefined') {
    try {
      texture = kind === 'garnish-woodland' || kind === 'garnish-arid'
        ? makeGarnishAtlas(kind)
        : makeSprayAtlas(kind, seeded(kindSeed(kind)), ATLAS_SIZE, null, 0);
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
}

/**
 * Accumulates bent three-row spray cards (four triangles each) into one draw. Positions, volume normals, atlas UVs
 * (stem at v = 0 like the trees' cards) and per-card tint.
 */
export class FoliageCardBuffer {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];

  get cardCount(): number { return this.positions.length / 36; }

  push(card: FoliageCard): void {
    const axis = norm(card.axis);
    const right = norm(cross(axis, card.face));
    const faceOut = (() => {
      const f = norm(cross(right, axis));
      return f[0] * card.out[0] + f[1] * card.out[1] + f[2] * card.out[2] < 0 ? [-f[0], -f[1], -f[2]] as const : f;
    })();
    const n = norm([faceOut[0] * 0.45 + card.out[0] * 0.45, faceOut[1] * 0.45 + card.out[1] * 0.45 + 0.25,
      faceOut[2] * 0.45 + card.out[2] * 0.45]);
    const tiles = FOLIAGE_ATLAS_TILES;
    const tx = card.tile % tiles, ty = Math.floor(card.tile / tiles) % tiles;
    const u0 = tx / tiles, v0 = 1 - (ty + 1) / tiles, du = 1 / tiles, dv = 1 / tiles;
    const rows: Array<[[number, number, number], [number, number, number]]> = [];
    for (let r = 0; r < 3; r++) {
      const t = r / 2;
      const along = -0.05 * card.length + t * card.length;
      const sag = card.bend * card.length * t * t;
      const half = card.width * 0.5 * (r === 0 ? 0.55 : r === 1 ? 1 : 0.88);
      const cx = card.stem[0] + axis[0] * along, cy = card.stem[1] + axis[1] * along - sag, cz = card.stem[2] + axis[2] * along;
      rows.push([[cx - right[0] * half, cy - right[1] * half, cz - right[2] * half],
        [cx + right[0] * half, cy + right[1] * half, cz + right[2] * half]]);
    }
    const vert = (p: readonly number[], u: number, v: number): void => {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(u0 + u * du, v0 + v * dv);
      this.colors.push(card.tint[0], card.tint[1], card.tint[2]);
    };
    for (let r = 0; r < 2; r++) {
      const a = rows[r], b = rows[r + 1];
      const va = r / 2, vb = (r + 1) / 2;
      vert(a[0], 0, va); vert(a[1], 1, va); vert(b[1], 1, vb);
      vert(a[0], 0, va); vert(b[1], 1, vb); vert(b[0], 0, vb);
    }
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
