// Fleet camouflage painter v2 (fleet lane, 2026-10-08; wave 268's two blind critics on every tank: "small evenly sized
// round blobs", "soft feathered edges", "single scale", "printed cloth, not paint"; real three-tone schemes are "large
// irregular hard-edged patches" and digital schemes "crisp multi-scale rectangular pixel clusters").
//
// The thresholded value noise behind the field schemes is smooth, so every contour it gives is a rounded blob of one
// size. These fields are built from periodic, domain-warped Voronoi partitions instead:
//  - a macro partition of the tile (painter v3: the wide four-metre tile, cells of about 0.8 m) splits the ground into
//    the base and the second main tone; neighbouring cells of one tone merge into large irregular polygons with
//    straight-edged facets;
//  - a finer partition lays the dark tone as bands and patches that bridge the boundaries between the two main tones
//    (the way a three-colour scheme's black sits across its green and brown), with a few loose patches inside;
//  - the finest partition cuts the fourth tone of a four-colour palette: the darkest inside the dark areas when the
//    palette's extra tone is a dark one, small light islands inside the main ground when it is a light one;
//  - a shared low-frequency warp bends every edge and a small high-frequency one breaks it, so the facets read as
//    sprayed masking rather than geometry.
// Each tone class is a continuous signed field (distance to the nearest cell of the other class minus distance to the
// nearest cell of this class), so the tile is drawn at its own resolution with one anti-aliased texel at every edge.
// Everything is hashed from the seed: no RNG stream is consumed, so other painters' draws never move.
// Cost (painter v3, 2026-10-08): the warp lattices are tabled, each partition is laid out on a wrapped border so a
// sample reads a 3 x 3 block of points with no wrapping arithmetic, and distances compare squared (the v2 fields took
// 0.1-0.2 s per tile under load; these take 5-10 ms at the 128-sample raster).

export interface PatchFieldSet {
  /** > 0 where the second main tone lies, < 0 on the base. */
  readonly main: Float32Array;
  /** > 0 inside the dark tone. */
  readonly dark: Float32Array;
  /** > 0 on the finest cells chosen for the fourth tone. */
  readonly fourth: Float32Array;
}

interface PatchFieldOptions {
  /** Raster size (texels across the periodic tile). */
  readonly n: number;
  readonly seed: number;
  /** Macro cells across the tile (the main patches' scale). */
  readonly macroCells: number;
  /** Share of the main ground in the second main tone. */
  readonly secondShare?: number;
  /** Share of the fine cells lying across a main boundary that take the dark tone. */
  readonly darkOnEdge?: number;
  /** Share of the fine cells away from any boundary that take the dark tone. */
  readonly darkLoose?: number;
  /** Share of the finest cells that take the fourth tone. */
  readonly fourthShare?: number;
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const smooth = (v: number): number => v * v * (3 - 2 * v);
const wrapIndex = (i: number, n: number): number => ((i % n) + n) % n;

/** Periodic value noise on a hashed lattice of `size` cells across the tile: the lattice values are tabled once, so a
 * sample is four loads and a smoothstep blend. */
function lattice(seed: number, size: number): (u: number, v: number) => number {
  const table = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) table[j * size + i] = hash(i, j, seed);
  return (u, v) => {
    const x = (u - Math.floor(u)) * size, y = (v - Math.floor(v)) * size;
    const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
    const x1 = ix + 1 === size ? 0 : ix + 1, r0 = iy * size, r1 = (iy + 1 === size ? 0 : iy + 1) * size;
    const a = table[r0 + ix] + (table[r0 + x1] - table[r0 + ix]) * tx;
    const b = table[r1 + ix] + (table[r1 + x1] - table[r1 + ix]) * tx;
    return a + (b - a) * ty;
  };
}

interface Partition {
  /** Cells across the tile along u and along v (cells are wider than tall when cu < cv). */
  readonly cu: number;
  readonly cv: number;
  /** Cell seed points in CELL units (cell (i, j) at [2 * (j * cu + i)], its point inside [i, i + 1) x [j, j + 1)). */
  readonly points: Float32Array;
  /** Two-class membership per cell. */
  readonly classOf: Uint8Array;
}

function points(cu: number, cv: number, seed: number, jitter = .86): Float32Array {
  const out = new Float32Array(cu * cv * 2);
  for (let j = 0; j < cv; j++) for (let i = 0; i < cu; i++) {
    const at = 2 * (j * cu + i);
    out[at] = i + .5 + (hash(i, j, seed) - .5) * jitter;
    out[at + 1] = j + .5 + (hash(i, j, seed ^ 0x9e3779b9) - .5) * jitter;
  }
  return out;
}

/** Exactly round(share * count) members, chosen by hash rank (every seed keeps its coverage). */
function chooseShare(count: number, share: number, seed: number, eligible?: (c: number) => boolean): Uint8Array {
  const out = new Uint8Array(count);
  const pool = Array.from({ length: count }, (_, c) => c).filter((c) => !eligible || eligible(c));
  pool.sort((a, b) => hash(a, 17, seed) - hash(b, 17, seed));
  const take = Math.round(share * pool.length);
  for (let k = 0; k < take; k++) out[pool[k]] = 1;
  return out;
}

/** Search reach in cells: the 3 x 3 block round a sample's cell. A boundary sample has both classes in reach, so the
 * sign and the anti-aliased edge are exact; deep inside one class the other class's distance caps at FIELD_CAP. */
const REACH = 1;
const FIELD_CAP = 1.6;

/** A partition laid out for sampling: its points and classes on a border of REACH wrapped cells round the tile, so a
 * sample reads its 5 x 5 block as five runs of five with no wrapping. */
interface Sampler {
  readonly cu: number;
  readonly cv: number;
  readonly stride: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly cls: Uint8Array;
}

function sampler(p: Partition): Sampler {
  const { cu, cv } = p, stride = cu + 2 * REACH, rows = cv + 2 * REACH;
  const x = new Float32Array(stride * rows), y = new Float32Array(stride * rows), cls = new Uint8Array(stride * rows);
  for (let j = -REACH; j < cv + REACH; j++) for (let i = -REACH; i < cu + REACH; i++) {
    const wi = ((i % cu) + cu) % cu, wj = ((j % cv) + cv) % cv, c = wj * cu + wi, k = (j + REACH) * stride + i + REACH;
    x[k] = p.points[2 * c] + (i - wi); y[k] = p.points[2 * c + 1] + (j - wj); cls[k] = p.classOf[c];
  }
  return { cu, cv, stride, x, y, cls };
}

/** Signed class field at (u, v) in [0, 1): distance to the nearest class-0 cell minus distance to the nearest class-1
 * cell (> 0 in class 1), periodic, measured in the anisotropic cell metric (one cell is one unit both ways), with
 * distances beyond the 3 x 3 search capped so the field stays finite. */
function classField(p: Sampler, u: number, v: number): number {
  const fu = u * p.cu, fv = v * p.cv, ci = Math.floor(fu), cj = Math.floor(fv), { stride, x, y, cls } = p;
  let d0 = FIELD_CAP * FIELD_CAP, d1 = d0;
  for (let row = cj * stride + ci, end = row + (2 * REACH + 1) * stride; row < end; row += stride) {
    for (let k = row; k < row + 2 * REACH + 1; k++) {
      const px = x[k] - fu, py = y[k] - fv, d = px * px + py * py;
      if (cls[k]) { if (d < d1) d1 = d; } else if (d < d0) d0 = d;
    }
  }
  return Math.sqrt(d0) - Math.sqrt(d1);
}

/** The tone fields of one tile. */
export function patchFields(o: PatchFieldOptions): PatchFieldSet {
  const n = o.n, seed = o.seed | 0;
  // cells half again as wide as tall: patches run along the plate (along the hull on its sides), as sprayed schemes do
  const mu = Math.max(2, Math.round(o.macroCells)), mv = Math.max(3, Math.round(o.macroCells * 1.5));
  const fu = Math.max(3, Math.round(mu * 1.9)), fv = Math.max(4, Math.round(mv * 1.9));
  const su = Math.max(4, Math.round(mu * 3.4)), sv = Math.max(5, Math.round(mv * 3.4));
  // warps, in tile units: a gentle bend (a sixth of a macro cell, so facets stay straight-edged) and a sharper mid-scale
  // break that turns facet edges into notches and fingers; the lattices scale with the macro cells, so a wider tile
  // (more cells) keeps the same bend and break per patch
  const bendA = .17 / mu, breakA = .085 / mu;
  const bendN = Math.max(3, Math.round(mu * .75)), breakU = Math.max(13, Math.round(mu * 3.25)), breakV = Math.max(17, Math.round(mu * 4.25));
  const bendX = lattice(seed ^ 0x7f4a7c15, bendN), bendY = lattice(seed ^ 0x94d049bb, bendN);
  const breakX = lattice(seed ^ 0x3c6ef372, breakU), breakY = lattice(seed ^ 0xa54ff53a, breakV);
  let wu = 0, wv = 0;
  const warp = (u: number, v: number): void => {
    const a = u + (bendX(u, v) - .5) * 2 * bendA + (breakX(u, v) - .5) * 2 * breakA;
    const b = v + (bendY(u, v) - .5) * 2 * bendA + (breakY(u, v) - .5) * 2 * breakA;
    wu = a - Math.floor(a); wv = b - Math.floor(b);
  };
  // main classes: exactly `secondShare` of the macro cells take the second main tone (neighbours merge into regions)
  const macro = sampler({ cu: mu, cv: mv, points: points(mu, mv, seed ^ 0x51ed270b),
    classOf: chooseShare(mu * mv, o.secondShare ?? .42, seed ^ 0x1b873593) });
  // dark classes on the fine partition: of the fine cells whose seed lies across a main boundary (the macro field within
  // about a fine cell), `darkOnEdge` turn dark; of the rest, `darkLoose`
  const finePoints = points(fu, fv, seed ^ 0x2545f491);
  const nearEdge = new Uint8Array(fu * fv);
  for (let j = 0; j < fv; j++) for (let i = 0; i < fu; i++) {
    const c = j * fu + i;
    warp(finePoints[2 * c] / fu, finePoints[2 * c + 1] / fv);
    nearEdge[c] = Math.abs(classField(macro, wu, wv)) < .5 * mu / fu ? 1 : 0;
  }
  const onEdge = chooseShare(fu * fv, o.darkOnEdge ?? .55, seed ^ 0x0bad5eed, (c) => nearEdge[c] === 1);
  const loose = chooseShare(fu * fv, o.darkLoose ?? .06, seed ^ 0x5eed0bad, (c) => nearEdge[c] === 0);
  const fineClass = new Uint8Array(fu * fv);
  for (let c = 0; c < fineClass.length; c++) fineClass[c] = onEdge[c] | loose[c];
  const fine = sampler({ cu: fu, cv: fv, points: finePoints, classOf: fineClass });
  const finest = sampler({ cu: su, cv: sv, points: points(su, sv, seed ^ 0x68e31da4),
    classOf: chooseShare(su * sv, o.fourthShare ?? .3, seed ^ 0x61c88647) });
  // islands: a few finest cells flip the main tone (small patches of each main tone inside the other: a second scale)
  const islands = sampler({ cu: su, cv: sv, points: points(su, sv, seed ^ 0x7a2c9e31),
    classOf: chooseShare(su * sv, .07, seed ^ 0x33c4a5e7) });
  const main = new Float32Array(n * n), dark = new Float32Array(n * n), fourth = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    warp((x + .5) / n, (y + .5) / n);
    const at = y * n + x;
    // fields in tile units (anisotropic cell distances back to the macro cell's scale), so edges anti-alias evenly
    let m = classField(macro, wu, wv) / mu;
    const island = classField(islands, wu, wv) / su;
    if (island > 0) m = -Math.sign(m || 1) * Math.min(Math.abs(m), island);
    main[at] = m;
    dark[at] = classField(fine, wu, wv) / fu;
    fourth[at] = classField(finest, wu, wv) / su;
  }
  return { main, dark, fourth };
}

/** How a palette's tones play the four roles: indices into the palette. The base is the scheme's ground (index 0); of
 * the rest, the lightest is the second main tone and the darkest the dark tone; a fourth tone darker than the base goes
 * inside the dark areas, one lighter than the base makes small islands in the main ground. */
export interface PatchRoles {
  readonly base: number;
  readonly second: number;
  readonly dark: number;
  /** The fourth tone's index, or -1. */
  readonly fourth: number;
  /** Whether the fourth tone sits inside the dark areas (else it is a light island in the main ground). */
  readonly fourthDeep: boolean;
}

const luma = (c: readonly number[]): number => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];

export function patchRoles(palette: readonly (readonly number[])[]): PatchRoles {
  if (palette.length < 3) return { base: 0, second: Math.min(1, palette.length - 1), dark: -1, fourth: -1, fourthDeep: false };
  const others = palette.map((c, i) => ({ i, l: luma(c) })).slice(1).sort((a, b) => a.l - b.l);
  if (others.length === 2) return { base: 0, second: others[1].i, dark: others[0].i, fourth: -1, fourthDeep: false };
  const middle = others[1], baseL = luma(palette[0]);
  const deep = middle.l < baseL;
  return deep
    ? { base: 0, second: others[others.length - 1].i, dark: middle.i, fourth: others[0].i, fourthDeep: true }
    : { base: 0, second: others[others.length - 1].i, dark: others[0].i, fourth: middle.i, fourthDeep: false };
}

/** The palette index at field values. */
export function composeTone(main: number, dark: number, fourth: number, roles: PatchRoles): number {
  if (roles.dark >= 0 && dark > 0) return roles.fourth >= 0 && roles.fourthDeep && fourth > 0 ? roles.fourth : roles.dark;
  if (roles.fourth >= 0 && !roles.fourthDeep && fourth > 0) return roles.fourth;
  return main > 0 ? roles.second : roles.base;
}

/**
 * Pixel art from the fields (digital schemes): the fields sampled at each pixel cell give a palette index per cell,
 * then the boundaries break into steps: a boundary pixel takes a neighbouring tone with a hashed share, in two passes at
 * two-pixel and one-pixel blocks, so every edge carries teeth, notches and stray clusters a pixel or two deep
 * (multi-scale clusters), never a smooth contour drawn in one-pixel stairs.
 */
export function patchPixelTones(fields: PatchFieldSet, n: number, roles: PatchRoles, seed: number): Uint8Array {
  const tone = new Uint8Array(n * n);
  for (let at = 0; at < n * n; at++) tone[at] = composeTone(fields.main[at], fields.dark[at], fields.fourth[at], roles);
  for (const block of [2, 1]) {
    const source = tone.slice();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const at = y * n + x, bx = Math.floor(x / block), by = Math.floor(y / block);
      if (hash(bx, by, seed ^ (block === 1 ? 0x5bd1e995 : 0x1b56c4e9)) > (block === 1 ? .22 : .30)) continue;
      const dir = Math.floor(hash(bx, by, seed ^ 0x27d4eb2f) * 4);
      const nx = wrapIndex(x + [1, -1, 0, 0][dir] * block, n), ny = wrapIndex(y + [0, 0, 1, -1][dir] * block, n);
      const other = source[ny * n + nx];
      if (other !== source[at]) tone[at] = other;
    }
  }
  return tone;
}
