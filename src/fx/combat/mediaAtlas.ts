/**
 * combat/mediaAtlas.ts — the combat media sprite sheets (combat-fx lane, 2026-10-05).
 *
 * The battle flipbooks (particles.ts) are alpha-only round blobs that shrink as they erode, so every puff drawn from
 * them reads as one fuzzy ball scaling up (the critics' "unmistakable sprite"). These sheets are built for lit,
 * deforming media instead:
 *  - each frame is a CLUSTER of overlapping lobes (metaball domes) with fbm cauliflower detail on their rims, so a
 *    puff owns a lobed silhouette, never a disc;
 *  - over the sixteen frames the lobes drift apart and grow, new rim detail rolls through (the noise domain advects)
 *    and the coverage threshold rises, so a puff billows open and tears apart as it ages;
 *  - RGB carries the dome NORMAL (x, y in the sprite plane) and a blurred THICKNESS, so the media shader lights each
 *    lobe from the scene's sun and sky and darkens thick cores (combat/mediaShader.ts).
 * 'billow' (combustion smoke, fireball bodies, propellant clouds) has round cauliflower lobes; 'wisp' (dust, soil,
 * powder, spray) has flatter, stretched, more torn lobes.
 *
 * Layout: MEDIA_TILES x MEDIA_TILES frames, frame f at column f % 4, row floor(f / 4), row 0 at the BOTTOM of the
 * texture (a DataTexture uploads its first data row at v = 0, flipY off), each tile's own +y up. Seeded and
 * deterministic; no DOM. The generator yields once per frame so a covered warm can pace it.
 */
import * as THREE from 'three';
import { mulberry32 } from '../particles.ts';

type Rng = () => number;
type MediaAtlasStyle = 'billow' | 'wisp';

const MEDIA_TILES = 4;
const MEDIA_TILE_PX = 128;
const MEDIA_FRAMES = MEDIA_TILES * MEDIA_TILES;

interface Lobe {
  x: number; y: number; r: number; w: number;
  /** outward drift per unit life */
  dx: number; dy: number;
  /** radius growth per unit life */
  g: number;
  /** horizontal / vertical radius stretch (wisp lobes are flatter) */
  sx: number; sy: number;
  /** churn: each lobe swells and slackens on its own phase while the cluster orbits slowly */
  phase: number; spin: number;
}

/** Tileable value-noise lattice (grid x grid, wraps at the unit square). */
function makeLattice(rng: Rng, grid: number): Float32Array {
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return g;
}

function sampleLattice(g: Float32Array, grid: number, x: number, y: number): number {
  const fx = (x - Math.floor(x)) * grid;
  const fy = (y - Math.floor(y)) * grid;
  const x0 = fx | 0, y0 = fy | 0;
  const x1 = x0 + 1 === grid ? 0 : x0 + 1, y1 = y0 + 1 === grid ? 0 : y0 + 1;
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = g[y0 * grid + x0], b = g[y0 * grid + x1];
  const c = g[y1 * grid + x0], d = g[y1 * grid + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function makeLobes(rng: Rng, style: MediaAtlasStyle): Lobe[] {
  const lobes: Lobe[] = [];
  const wisp = style === 'wisp';
  const count = wisp ? 11 : 17;
  // a dominant central mass, then a ring of satellite lobes that bulge out of it
  lobes.push({ x: 0, y: wisp ? -0.01 : -0.02, r: wisp ? 0.2 : 0.19, w: wisp ? 1.2 : 1.9, dx: 0, dy: wisp ? 0 : 0.02,
    g: 0.14, sx: wisp ? 1.45 : 1, sy: wisp ? 0.74 : 1, phase: rng(), spin: 0 });
  // an inner core that keeps the middle dense as the rim lobes drift out (no ring-shaped late frames)
  for (let i = 0; i < (wisp ? 2 : 3); i++) {
    const a = rng() * Math.PI * 2, d = rng() * 0.06;
    lobes.push({ x: Math.cos(a) * d * (wisp ? 1.5 : 1), y: Math.sin(a) * d * (wisp ? 0.6 : 1), r: (wisp ? 0.11 : 0.12) + rng() * 0.04,
      w: 0.9, dx: Math.cos(a) * 0.02, dy: Math.sin(a) * 0.02, g: 0.25, sx: wisp ? 1.4 : 1, sy: wisp ? 0.75 : 1,
      phase: rng(), spin: (rng() - 0.5) * 0.3 });
  }
  for (let i = 1; i < count; i++) {
    const a = (i / (count - 1)) * Math.PI * 2 + (rng() - 0.5) * 0.7; // the rim ring
    const d = (wisp ? 0.08 : 0.12) + rng() * (wisp ? 0.1 : 0.12);
    const x = Math.cos(a) * d * (wisp ? 1.55 : 1);
    const y = Math.sin(a) * d * (wisp ? 0.62 : 1) + (wisp ? 0 : 0.015);
    lobes.push({
      x, y,
      r: (wisp ? 0.085 : 0.075) + rng() * (wisp ? 0.05 : 0.07),
      w: 0.7 + rng() * 0.55,
      dx: Math.cos(a) * (0.04 + rng() * 0.05) * (wisp ? 1.5 : 1),
      dy: Math.sin(a) * (0.04 + rng() * 0.05) * (wisp ? 0.55 : 1) + (wisp ? 0 : 0.015),
      g: 0.1 + rng() * 0.2,
      sx: wisp ? 1.3 + rng() * 0.45 : 0.9 + rng() * 0.2,
      sy: wisp ? 0.66 + rng() * 0.2 : 0.9 + rng() * 0.2,
      phase: rng(), spin: (rng() - 0.5) * 0.5,
    });
  }
  // keep the grown cluster inside the tile (lobe reach at the end of life <= 0.44)
  for (const l of lobes) {
    const reach = Math.hypot(l.x + l.dx, l.y + l.dy) + l.r * (1 + l.g) * 1.2 * Math.max(l.sx, l.sy);
    if (reach > 0.44) {
      const k = 0.44 / reach;
      l.x *= k; l.y *= k; l.dx *= k; l.dy *= k; l.r *= k;
    }
  }
  return lobes;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Bake one atlas; yields once per frame. The returned texture is mipmapped, linear-filtered and clamped (each frame
 * has a transparent border, so neighbouring cells never bleed at the sampled mip levels the media sizes reach).
 * Cost: lobes splat only their own bounding boxes and the noise runs only inside the cluster (~40 ms per sheet).
 */
export function* bakeMediaAtlasSteps(style: MediaAtlasStyle, seed: number): Generator<void, THREE.DataTexture, void> {
  const rng = mulberry32((seed ^ (style === 'wisp' ? 0x7a11d5 : 0x3b1104)) | 0);
  const tile = MEDIA_TILE_PX;
  const size = MEDIA_TILES * tile;
  const data = new Uint8Array(size * size * 4);
  const lobes = makeLobes(rng, style);
  const n4 = makeLattice(rng, 4), n8 = makeLattice(rng, 8), n16 = makeLattice(rng, 16);
  const m8 = makeLattice(rng, 8), m16 = makeLattice(rng, 16);
  const wisp = style === 'wisp';
  const acc = new Float32Array(tile * tile);
  const dens = new Float32Array(tile * tile);
  const hgt = new Float32Array(tile * tile);
  const thick = new Float32Array(tile * tile);
  for (let frame = 0; frame < MEDIA_FRAMES; frame++) {
    const p = frame / (MEDIA_FRAMES - 1);
    const ox = (frame % MEDIA_TILES) * tile;
    const oy = Math.floor(frame / MEDIA_TILES) * tile;
    acc.fill(0);
    // metaball domes, each splatted over its own bounding box
    for (let li = 0; li < lobes.length; li++) {
      const l = lobes[li];
      const ang = l.spin * p * Math.PI;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const bx = l.x + l.dx * p, by = l.y + l.dy * p;
      const cx = bx * ca - by * sa, cy = bx * sa + by * ca;
      const r = l.r * (1 + l.g * p) * (1 + 0.16 * Math.sin((p * 0.85 + l.phase) * Math.PI * 2));
      const rx = r * l.sx, ry = r * l.sy;
      const x0 = Math.max(0, Math.floor((cx - rx + 0.5) * tile)), x1 = Math.min(tile - 1, Math.ceil((cx + rx + 0.5) * tile));
      const y0 = Math.max(0, Math.floor((cy - ry + 0.5) * tile)), y1 = Math.min(tile - 1, Math.ceil((cy + ry + 0.5) * tile));
      const irx = 1 / rx, iry = 1 / ry;
      for (let y = y0; y <= y1; y++) {
        const qy = ((y + 0.5) / tile - 0.5 - cy) * iry;
        const qy2 = qy * qy;
        if (qy2 >= 1) continue;
        const row = y * tile;
        for (let x = x0; x <= x1; x++) {
          const qx = ((x + 0.5) / tile - 0.5 - cx) * irx;
          const q = qx * qx + qy2;
          if (q < 1) { const k = 1 - q; acc[row + x] += l.w * k * k * k; }
        }
      }
    }
    // the rim detail rolls through the lobes: the noise domain rotates and advects with life
    const rot = p * 0.9, cr = Math.cos(rot), sr = Math.sin(rot);
    const adv = p * 0.35;
    const sxn = wisp ? 0.75 : 1, syn = wisp ? 1.6 : 1;
    for (let y = 0; y < tile; y++) {
      const v = (y + 0.5) / tile - 0.5;
      for (let x = 0; x < tile; x++) {
        const i = y * tile + x;
        const d = acc[i];
        if (d <= 0.004) { dens[i] = 0; hgt[i] = 0; thick[i] = 0; continue; }
        const u = (x + 0.5) / tile - 0.5;
        const base = 1 - Math.exp(-1.7 * d);
        const nu = (u * cr - v * sr) * sxn + 0.5 + adv;
        const nv = (u * sr + v * cr) * syn + 0.5 - adv * 0.6;
        const n1 = (sampleLattice(n4, 4, nu * 1.6, nv * 1.6) * 0.55 + sampleLattice(n8, 8, nu * 1.6, nv * 1.6) * 0.3
          + sampleLattice(n16, 16, nu * 1.6, nv * 1.6) * 0.15);
        const n2 = sampleLattice(m8, 8, nu * 3.1 + 1.7, nv * 3.1 + 4.1) * 0.6 + sampleLattice(m16, 16, nu * 3.1, nv * 3.1) * 0.4;
        // cauliflower rims: detail bites the edges much harder than the core
        const detail = (wisp ? 0.42 : 0.55) + (wisp ? 0.85 : 0.6) * n1 + 0.26 * (n2 - 0.5);
        dens[i] = base * detail;
        // the lit height keeps the domes and the broad rim bumps, not the fine octave (soft, not rocky)
        hgt[i] = base * (0.78 + 0.34 * n1);
        thick[i] = base;
      }
    }
    // coverage, normals and thickness; tile border kept transparent
    const lo = (wisp ? 0.08 : 0.1) + (wisp ? 0.3 : 0.24) * p;
    const hi = lo + (wisp ? 0.5 : 0.42) + 0.2 * p;
    const fade = 1 - (wisp ? 0.32 : 0.2) * p;
    // gradient (per tile unit) -> normal tilt: a lobe rim (~8 / unit) leans ~50 degrees
    const slope = wisp ? 0.1 : 0.16;
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        const i = y * tile + x;
        const o = ((oy + y) * size + ox + x) * 4;
        if (dens[i] <= 0) { data[o] = 128; data[o + 1] = 128; data[o + 2] = 0; data[o + 3] = 0; continue; }
        const xl = x > 0 ? i - 1 : i, xr = x < tile - 1 ? i + 1 : i;
        const yd = y > 0 ? i - tile : i, yu = y < tile - 1 ? i + tile : i;
        const gx = (hgt[xr] - hgt[xl]) * tile / (xr - xl === 2 ? 2 : 1);
        const gy = (hgt[yu] - hgt[yd]) * tile / ((yu - yd) === 2 * tile ? 2 : 1);
        let nx = -gx * slope, ny = -gy * slope;
        const nl = Math.sqrt(nx * nx + ny * ny + 1);
        nx /= nl; ny /= nl;
        const edge = Math.min(x, y, tile - 1 - x, tile - 1 - y);
        const border = smooth(0, 3, edge);
        const a = smooth(lo, hi, dens[i]) * fade * border;
        data[o] = Math.round((nx * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round(Math.min(1, thick[i] * 1.15) * 255);
        data[o + 3] = Math.round(a * 255);
      }
    }
    yield;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = `combat-media-${style}`;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The warp field: a small tileable two-channel value noise (two independent fields, two octaves each) that the media
 * shader samples at a drifting offset to push each puff's silhouette around as it ages.
 */
export function makeMediaNoiseTexture(seed: number): THREE.DataTexture {
  const rng = mulberry32((seed ^ 0x51a7e3) | 0);
  const n = 64;
  const a1 = makeLattice(rng, 4), a2 = makeLattice(rng, 8);
  const b1 = makeLattice(rng, 4), b2 = makeLattice(rng, 8);
  const s = (g: Float32Array, grid: number, u: number, v: number): number => sampleLattice(g, grid, u, v);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const o = (y * n + x) * 4;
      data[o] = Math.round((s(a1, 4, u, v) * 0.65 + s(a2, 8, u, v) * 0.35) * 255);
      data[o + 1] = Math.round((s(b1, 4, u, v) * 0.65 + s(b2, 8, u, v) * 0.35) * 255);
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = 'combat-media-warp';
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
