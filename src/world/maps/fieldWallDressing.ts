// src/world/maps/fieldWallDressing.ts — how the field walls meet the ground and the weather (the scenery lane, gauntlet
// wave 20: "shape, construction type and how things meet the ground, not more texture").
//
//   - buildSnowLoad: the snow a winter lays along a wall's top, a soft cushion over the top stones that bridges their
//     gaps and drapes a little over both faces (the snow-cap shader whitens it: its faces look up);
//   - buildWallFootStones: the stones that settled at a dry-stone wall's foot, half sunk in the ground on both faces;
//   - buildWallDrift: the drift a winter wind banks against a wall's windward face, rising from its toe to the face;
//   - buildMudApron: the mud a rain washes off an adobe wall into a skirt round its foot, with the spalled lumps on it.
//
// World-free builders on a height field. Each draws its own stream, named by its place, never the props stream. Every
// geometry carries position, normal and uv only (the props buckets merge them with the kit's own parts).
import * as THREE from 'three';
import { FIELD_STONE_FACE_V } from '../fieldStoneSurface.ts';

export interface DressingGround { getHeightAt(x: number, z: number): number }

/** The winter maps' wind, toward which the snow lenses trail (maps/mapKits.ts WINTER_WIND_YAW): downwind (cos, -sin). */
export const SNOW_WIND_YAW = -0.6;

export function dressingRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** A seed named by a place (centimetre grid), so a run's dressing is its own whatever was built before it. */
export function placeSeed(x: number, z: number, salt: number): number {
  return (Math.round(x * 100) * 73856093) ^ (Math.round(z * 100) * 19349663) ^ salt;
}

/** A smooth one-dimensional wobble in [-1, 1]: three incommensurate sines with seeded phases. */
function wobble(r: () => number): (t: number) => number {
  const p = [r() * 6.3, r() * 6.3, r() * 6.3];
  return (t) => (Math.sin(t * 1.7 + p[0]) * 0.5 + Math.sin(t * 3.9 + p[1]) * 0.3 + Math.sin(t * 8.3 + p[2]) * 0.2);
}

/** A grid surface (rows x cols vertices, row-major) to an indexed geometry with soft normals and the given uv. */
function gridGeometry(positions: number[], uvs: number[], rows: number, cols: number, flip = false): THREE.BufferGeometry {
  const index: number[] = [];
  for (let i = 0; i + 1 < rows; i++) {
    for (let k = 0; k + 1 < cols; k++) {
      const a = i * cols + k, b = a + 1, c = a + cols, d = c + 1;
      if (flip) index.push(a, b, c, b, d, c); else index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Non-indexed copies merged into one geometry with position, normal and uv only. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  const flat = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.attributes.normal) g.computeVertexNormals();
    count += g.attributes.position.count;
    return g;
  });
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let at = 0;
  for (const g of flat) {
    position.set(g.attributes.position.array as Float32Array, at * 3);
    normal.set(g.attributes.normal.array as Float32Array, at * 3);
    uv.set(g.attributes.uv.array as Float32Array, at * 2);
    at += g.attributes.position.count;
  }
  for (const g of new Set([...parts, ...flat])) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// ------------------------------------------------------------------------------------------------ the snow load

export interface SnowLoadOptions {
  /** The geometry repeats along z (a wall module): both ends meet the next one's cushion at one height. */
  seamless?: boolean;
  /** Bin length along z (m). */
  bin?: number;
  /** The print density (uv a metre) the cushion maps at. */
  uvPerM?: number;
}

/**
 * The snow lying along the top of a wall-like geometry that runs along z (x across, y up): a cushion five points
 * across, 5-10 cm deep over the highest stones under it, its crest following them but bridging their gaps, its lips
 * draped a few centimetres over both faces; closed at both ends. The faces look up, so the props' winter snow cap
 * paints it white.
 */
export function buildSnowLoad(g: THREE.BufferGeometry, seed: number, opts: SnowLoadOptions = {}): THREE.BufferGeometry {
  const bin = opts.bin ?? 0.2, uvPerM = opts.uvPerM ?? 1.2;
  const p = g.attributes.position;
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const n = Math.max(2, Math.round((z1 - z0) / bin));
  const top = new Float32Array(n + 1).fill(-Infinity);
  for (let i = 0; i < p.count; i++) {
    const k = Math.round((p.getZ(i) - z0) / (z1 - z0) * n);
    if (p.getY(i) > top[k]) top[k] = p.getY(i);
  }
  for (let k = 0; k <= n; k++) if (!Number.isFinite(top[k])) top[k] = k ? top[k - 1] : 0;
  // the top stones' extent across, per bin (the vertices within 7 cm of that bin's top)
  const xlo = new Float32Array(n + 1).fill(Infinity), xhi = new Float32Array(n + 1).fill(-Infinity);
  for (let i = 0; i < p.count; i++) {
    const k = Math.round((p.getZ(i) - z0) / (z1 - z0) * n);
    if (p.getY(i) < top[k] - 0.07) continue;
    if (p.getX(i) < xlo[k]) xlo[k] = p.getX(i);
    if (p.getX(i) > xhi[k]) xhi[k] = p.getX(i);
  }
  // the snow bridges the gaps: a running max over a stone's length, then a running mean
  const crest = new Float32Array(n + 1), lo = new Float32Array(n + 1), hi = new Float32Array(n + 1);
  const reachBins = Math.max(1, Math.round(0.2 / bin));
  for (let k = 0; k <= n; k++) {
    let m = -Infinity, a = Infinity, b = -Infinity;
    for (let j = Math.max(0, k - reachBins); j <= Math.min(n, k + reachBins); j++) {
      m = Math.max(m, top[j]);
      if (Number.isFinite(xlo[j])) { a = Math.min(a, xlo[j]); b = Math.max(b, xhi[j]); }
    }
    crest[k] = m; lo[k] = Number.isFinite(a) ? a : -0.2; hi[k] = Number.isFinite(b) ? b : 0.2;
  }
  // (wave 34, "uniform frosting": the crest is smoothed over a stone's length only, so the load mounds over each top
  // stone and dips between them; its outline is smoothed more)
  const smooth = (src: Float32Array, reach: number) => Float32Array.from(src, (_, k) => {
    let s = 0, w = 0;
    for (let j = Math.max(0, k - reach); j <= Math.min(n, k + reach); j++) { const q = reach + 1 - Math.abs(j - k); s += src[j] * q; w += q; }
    return s / w;
  });
  const cs = smooth(crest, 1), ls = smooth(lo, 2), hs = smooth(hi, 2);
  if (opts.seamless) {
    // a repeating module: both ends at the mean of its two ends (the next module's cushion meets it there)
    const ends = (cs[0] + cs[n]) / 2, lend = (ls[0] + ls[n]) / 2, hend = (hs[0] + hs[n]) / 2;
    const reach = Math.min(n / 2, Math.round(0.4 / bin));
    for (let k = 0; k <= reach; k++) {
      const t = 1 - k / reach;
      cs[k] += (ends - cs[k]) * t; cs[n - k] += (ends - cs[n - k]) * t;
      ls[k] += (lend - ls[k]) * t; ls[n - k] += (lend - ls[n - k]) * t;
      hs[k] += (hend - hs[k]) * t; hs[n - k] += (hend - hs[n - k]) * t;
    }
  }
  const r = dressingRng(seed), depth = wobble(r), lip = wobble(r), lip2 = wobble(r);
  const ph = [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3];
  // (five points across, a row every 20 cm along: about 130 triangles a module; wave 34 counted the triangles)
  const ACROSS = [0, 0.14, 0.5, 0.86, 1];
  const RISE = [-0.03, 0.7, 1, 0.7, -0.03];
  const endTaper = Math.max(1, Math.round(0.14 / bin)); // the cushion thins out over its last 14 cm at either end
  const positions: number[] = [], uvs: number[] = [];
  for (let k = 0; k <= n; k++) {
    const z = z0 + (z1 - z0) * (k / n);
    const zz = opts.seamless ? (k / n) * Math.PI * 2 : z;
    // the depth (wave 34: "uniform frosting"): 3-20 cm in lumps a stone or two long, thin where the wind scoured it,
    // periodic along a repeating module so its ends agree
    const full = Math.max(0.03, opts.seamless
      ? 0.115 + 0.04 * Math.sin(2 * zz + ph[0]) + 0.028 * Math.sin(5 * zz + ph[1]) + 0.016 * Math.sin(9 * zz + ph[2])
      : 0.115 + 0.045 * depth(z * 2.1) + 0.02 * depth(z * 5.3 + 1.7));
    const end = Math.min(1, Math.min(k, n - k) / endTaper);
    // (a module's ends keep most of the load, so a run's snow line does not dip at every joint; a lone top thins out)
    const t = full * ((opts.seamless ? 0.65 : 0.25) + (opts.seamless ? 0.35 : 0.75) * end * end * (3 - 2 * end));
    // the lips: each its own overhang along the wall, a cornice here, a thin edge there, drooping where it overhangs
    const wave = (a: number, b: number) => (opts.seamless ? Math.sin(3 * zz + ph[a]) * 0.6 + Math.sin(7 * zz + ph[b]) * 0.4 : (a === 3 ? lip : lip2)(z * 1.3));
    const ohA = (0.03 + 0.022 * wave(3, 4)) * (0.4 + 0.6 * end), ohB = (0.03 - 0.022 * wave(4, 3)) * (0.4 + 0.6 * end);
    for (let j = 0; j < ACROSS.length; j++) {
      const x = ls[k] - ohA + (hs[k] - ls[k] + ohA + ohB) * ACROSS[j];
      const droop = j === 0 ? ohA * 0.7 : j === ACROSS.length - 1 ? ohB * 0.7 : 0;
      const y = cs[k] + (RISE[j] < 0 ? RISE[j] - 0.01 - droop : RISE[j] * t);
      positions.push(x, y, z);
      // (u along the wall, v across it inside the field print's face band: the load is the stone's under the snow cap)
      uvs.push(z * uvPerM, (FIELD_STONE_FACE_V[0] + FIELD_STONE_FACE_V[1]) / 2 + x * uvPerM);
    }
  }
  const cushion = gridGeometry(positions, uvs, n + 1, ACROSS.length);
  // snow is snow down to its lips: the normals lean up (the snow cap whitens by the normal, and a lip lit like a top
  // reads as the soft edge of the load, not as a stone fascia)
  const nrm = cushion.attributes.normal;
  for (let i = 0; i < nrm.count; i++) {
    const x = nrm.getX(i), y = nrm.getY(i) + 1.1, z = nrm.getZ(i), l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(i, x / l, y / l, z / l);
  }
  return mergeParts([cushion]);
}

// ------------------------------------------------------------------------------------------------ the foot stones

/**
 * A fieldstone: a box with its corners knocked well back (each corner in by up to `knock` of its half extents), its
 * bottom left out, a print window of its own at `uvPerM`.
 */
function fieldStone(w: number, h: number, d: number, r: () => number, knock: number, uvPerM: number, vAt?: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const corners = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.sign(p.getX(i))},${Math.sign(p.getY(i))},${Math.sign(p.getZ(i))}`;
    let c = corners.get(key);
    if (!c) corners.set(key, c = [1 - r() * knock, 1 - r() * knock * (p.getY(i) > 0 ? 1.4 : 0.6), 1 - r() * knock]);
    p.setXYZ(i, p.getX(i) * c[0], p.getY(i) * c[1], p.getZ(i) * c[2]);
  }
  // (a print window of its own inside the field print's face band (wave 34: the print's hearting band is the core's);
  // `vAt` pins its v instead, for a print with a band of its own such as the mud's plain render)
  const du = r() * 8, place = r();
  const extent = Math.max(h, d) * uvPerM, room = FIELD_STONE_FACE_V[1] - FIELD_STONE_FACE_V[0];
  const v0 = vAt ?? FIELD_STONE_FACE_V[0] + place * Math.max(0, room - extent) + Math.min(extent, room) / 2;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [a, b] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, du + a * uvPerM, v0 + b * uvPerM);
  }
  // keep +x, -x, +y, +z, -z (the bottom lies in the ground)
  const index = g.index!.array, kept: number[] = [];
  for (const group of g.groups) {
    if (group.materialIndex === 3) continue;
    for (let i = group.start; i < group.start + group.count; i++) kept.push(index[i]);
  }
  g.setIndex(kept);
  g.clearGroups();
  g.computeVertexNormals();
  return g;
}

/**
 * The stones at a dry-stone wall's foot along the segment a-b: the odd stone settled out of the wall or set there when
 * it was built, every half metre or so on either face, a hand to a forearm long, lying flat, sunk a third to a half of
 * its height in the ground, a little off the face (`half` is the wall's half width at its foot).
 */
export function buildWallFootStones(
  ground: DressingGround, ax: number, az: number, bx: number, bz: number, half: number, seed: number,
  opts: { uvPerM?: number; mobile?: boolean } = {},
): THREE.BufferGeometry | null {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.3) return null;
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = tz, nz = -tx;
  const r = dressingRng(seed), uvPerM = opts.uvPerM ?? 1.2;
  const parts: THREE.BufferGeometry[] = [];
  const step = opts.mobile ? 0.95 : 0.5;
  for (let s = 0.1 + r() * step; s < len - 0.05; s += step * (0.6 + r() * 0.8)) {
    const side = r() < 0.5 ? -1 : 1;
    const size = 0.1 + r() * 0.17;
    const w = size * (1.2 + r() * 0.7), h = size * (0.5 + r() * 0.3), d = size * (0.8 + r() * 0.3);
    const off = half + d * 0.35 + r() * 0.22;
    const x = ax + tx * s + nx * side * off, z = az + tz * s + nz * side * off;
    const stone = fieldStone(w, h, d, r, 0.3, uvPerM);
    stone.rotateZ((r() - 0.5) * 0.25); stone.rotateX((r() - 0.5) * 0.2);
    stone.rotateY(Math.atan2(tx, tz) + Math.PI / 2 + (r() - 0.5) * 0.9);
    const y = ground.getHeightAt(x, z) + h * (0.5 - 0.33 - r() * 0.17);
    parts.push(stone.translate(x, y, z));
  }
  return parts.length ? mergeParts(parts) : null;
}

// ------------------------------------------------------------------------------------------------ the tumbled end

/**
 * Where a field wall ends (wave 34: "nothing bedded — no tumbled ends"): the stones its head lost, tumbled out past
 * the end and along both feet — a spill a metre or so out, thickest at the head, every stone lying flat or canted and
 * half sunk; on a mud wall the fallen lumps of its pier (`mudV`: the mud print's plain band). (x, z) is the head's foot,
 * (ox, oz) the run's direction out of the wall there.
 */
export function buildWallTumble(
  ground: DressingGround, x: number, z: number, ox: number, oz: number, half: number, seed: number,
  opts: { uvPerM?: number; mobile?: boolean; mudV?: number } = {},
): THREE.BufferGeometry | null {
  const r = dressingRng(seed), uvPerM = opts.uvPerM ?? 1.2;
  const parts: THREE.BufferGeometry[] = [];
  const count = (opts.mobile ? 4 : 9) + Math.floor(r() * 4);
  for (let k = 0; k < count; k++) {
    // out past the end, the nearer the more of them; some along either foot
    const out = -0.2 + Math.pow(r(), 1.6) * 1.4, across = (r() - 0.5) * 2 * (half + 0.25 + out * 0.4);
    const px = x + ox * out - oz * across, pz = z + oz * out + ox * across;
    const size = (opts.mudV != null ? 0.07 : 0.1) + r() * (opts.mudV != null ? 0.14 : 0.2) * (1 - Math.min(0.6, Math.max(0, out) * 0.4));
    const stone = fieldStone(size * (1.2 + r() * 0.7), size * (0.45 + r() * 0.3), size * (0.8 + r() * 0.3), r, 0.32, uvPerM, opts.mudV);
    stone.rotateZ((r() - 0.5) * 0.7); stone.rotateX((r() - 0.5) * 0.5); stone.rotateY(r() * Math.PI);
    parts.push(stone.translate(px, ground.getHeightAt(px, pz) + size * (0.05 + r() * 0.12), pz));
  }
  return parts.length ? mergeParts(parts) : null;
}

// ------------------------------------------------------------------------------------------------ the drifts

/**
 * A drift a winter wind banks against one face of a wall along a-b (`side` +1 or -1 of the run's left normal, `half`
 * the wall's half width), `lee` or windward (wave 34: "nothing bedded — no lee drifts"; "a flat white drift sheet with
 * a hard, straight edge"). The lee drift is the big one — the wind drops its snow in the wall's shelter — 40-70 cm on
 * the face falling away over two and a half to four metres; the windward one a small ramp, 15-30 cm over a metre. Both
 * are scaled by how square the wind meets the wall (`across`, 0 along it, 1 square), lumpy along the wall, their toes
 * scalloped (never a straight edge) and sunk a centimetre, their ends tapering out a little past the run's. A row
 * every half metre, seven points out for the lee (five windward), from a line just inside the face.
 */
export function buildWallDrift(
  ground: DressingGround, ax: number, az: number, bx: number, bz: number, half: number, side: 1 | -1, seed: number,
  opts: { uvPerM?: number; mobile?: boolean; lee?: boolean; across?: number; plainV?: readonly [number, number]; scale?: number } = {},
): THREE.BufferGeometry | null {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.5) return null;
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = tz * side, nz = -tx * side;
  const r = dressingRng(seed), uvPerM = opts.uvPerM ?? 0.3, lee = opts.lee ?? false, size = opts.scale ?? 1;
  const square = Math.max(0, Math.min(1, opts.across ?? 1));
  const rise = wobble(r), reachW = wobble(r), scallop = wobble(r);
  const ext = lee ? 0.9 : 0.5, step = opts.mobile ? 0.9 : 0.5;
  const along = Math.max(2, Math.ceil((len + 2 * ext) / step));
  const OUT = lee ? [0, 0.05, 0.15, 0.3, 0.5, 0.74, 1] : [0, 0.1, 0.35, 0.7, 1];
  const h0 = (lee ? 0.55 * (0.45 + 0.55 * square) : 0.22 * (0.55 + 0.45 * square)) * size;
  const reach0 = (lee ? 3.1 * (0.5 + 0.5 * square) : 0.85) * Math.sqrt(size);
  const positions: number[] = [], uvs: number[] = [];
  for (let i = 0; i <= along; i++) {
    const s = -ext + (len + 2 * ext) * (i / along);
    // the ends taper: full depth from 0.6 m inside each end, nothing `ext` past it
    const taper = Math.min(1, Math.max(0, (s + ext) / (ext + 0.6)), Math.max(0, (len + ext - s) / (ext + 0.6)));
    const height = h0 * (1 + 0.28 * rise(s * 0.9)) * taper * taper * (3 - 2 * taper);
    // the toe: a long swing and a scallop a metre or so long, so the edge wanders
    const reach = reach0 * (1 + 0.22 * reachW(s * 0.45) + 0.12 * scallop(s * 2.1)) * (0.55 + 0.45 * taper) + height * 0.5;
    for (const o of OUT) {
      const d = half - 0.06 + reach * o;
      const x = ax + tx * s + nx * d, z = az + tz * s + nz * d;
      // a drift's profile: steepest near the face, a long tail to its toe (the toe sunk a centimetre)
      const y = ground.getHeightAt(x, z) + height * Math.pow(1 - o, lee ? 1.35 : 1.7) - 0.012 * o;
      positions.push(x, y, z);
      // (on a print with a plain band — the sand ramps on the mud print's — v runs across that band, face to toe)
      uvs.push(opts.plainV ? s * uvPerM : x * uvPerM, opts.plainV ? opts.plainV[0] + (opts.plainV[1] - opts.plainV[0]) * o : z * uvPerM);
    }
  }
  return mergeParts([gridGeometry(positions, uvs, along + 1, OUT.length, side < 0)]);
}

// ------------------------------------------------------------------------------------------------ the mud apron

/**
 * The mud a rain washed off an adobe wall along a-b: a skirt on each face from just inside the foot out 0.35-0.75 m,
 * 8-20 cm deep at the face, lumpy, its toe sunk; and the spalled lumps lying on it and round it.
 */
export function buildMudApron(
  ground: DressingGround, ax: number, az: number, bx: number, bz: number, half: number, seed: number,
  opts: { uvPerM?: number; mobile?: boolean; plainV?: readonly [number, number] } = {},
): THREE.BufferGeometry | null {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.4) return null;
  const tx = (bx - ax) / len, tz = (bz - az) / len;
  const r = dressingRng(seed), uvPerM = opts.uvPerM ?? 0.7;
  const parts: THREE.BufferGeometry[] = [];
  const step = opts.mobile ? 0.6 : 0.3, ext = 0.15;
  const along = Math.max(2, Math.ceil((len + 2 * ext) / step));
  const OUT = [0, 0.12, 0.35, 0.65, 1];
  for (const side of [1, -1] as const) {
    const nx = tz * side, nz = -tx * side;
    const rise = wobble(r), reachW = wobble(r);
    const positions: number[] = [], uvs: number[] = [];
    for (let i = 0; i <= along; i++) {
      const s = -ext + (len + 2 * ext) * (i / along);
      const taper = Math.min(1, Math.max(0.35, (s + ext) / 0.6), Math.max(0.35, (len + ext - s) / 0.6));
      const height = (0.13 + 0.06 * rise(s * 1.7)) * taper;
      const reach = 0.5 + 0.2 * reachW(s * 1.1);
      for (const o of OUT) {
        const d = half - 0.05 + reach * o;
        const x = ax + tx * s + nx * d, z = az + tz * s + nz * d;
        const y = ground.getHeightAt(x, z) + height * Math.pow(1 - o, 1.35) - 0.015 * o;
        positions.push(x, y, z);
        // (on a print with a plain band, the apron's v runs across that band from the face to the toe)
        uvs.push(s * uvPerM, opts.plainV ? opts.plainV[0] + (opts.plainV[1] - opts.plainV[0]) * o : d * uvPerM * side);
      }
    }
    parts.push(gridGeometry(positions, uvs, along + 1, OUT.length, side < 0));
  }
  // the spalled lumps: a few each metre, on the apron and just past its toe
  const lumps = Math.round(len * (opts.mobile ? 1.2 : 2.6));
  for (let k = 0; k < lumps; k++) {
    const s = r() * len, side = r() < 0.5 ? -1 : 1, off = half + 0.1 + r() * 0.75;
    const x = ax + tx * s + tz * side * off, z = az + tz * s - tx * side * off;
    const size = 0.06 + r() * r() * 0.2;
    const lump = fieldStone(size * (1.1 + r() * 0.6), size * (0.45 + r() * 0.3), size, r, 0.35, uvPerM,
      opts.plainV ? (opts.plainV[0] + opts.plainV[1]) / 2 : undefined);
    lump.rotateY(r() * Math.PI); lump.rotateX((r() - 0.5) * 0.4); lump.rotateZ((r() - 0.5) * 0.4);
    parts.push(lump.translate(x, ground.getHeightAt(x, z) + size * 0.12, z));
  }
  return mergeParts(parts);
}

// ------------------------------------------------------------------------------------------------ the run's owner

export interface WallDressingOptions {
  ground: DressingGround;
  /** A snow map: the drift against the windward face, the snow load on the heads. */
  snow: boolean;
  /** An arid map whose mud walls are its earth: the wind's sand banked against them (wave 34: "no sand ramps"). */
  sand?: boolean;
  mobile: boolean;
  /** The mud walls' bucket ('fieldMud' on their own print, else 'plaster') and that print's density and plain band. */
  adobeBucket: string;
  mudUv: number;
  plainV?: readonly [number, number];
}

export interface WallDressing {
  readonly snow: boolean;
  readonly adobeBucket: string;
  readonly mudUv: number;
  /** The snow drifts the islands banked so far (the props owner draws them as one mesh of their own on the plaster). */
  readonly drifts: THREE.BufferGeometry[];
  /** The foot of one built island a-b of a run, for the wall's bucket; on a snow map its drift joins `drifts`. Streams
   * named by the island's place. */
  island(adobe: boolean, ax: number, az: number, bx: number, bz: number, half: number): { wall: THREE.BufferGeometry[] };
  /** A run head with the winter's load on its top (one geometry; the head is consumed). */
  loadHead(head: THREE.BufferGeometry, seed: number): THREE.BufferGeometry;
  /** The tumbled stones (or a mud wall's fallen lumps) at a run's end (x, z), (ox, oz) out of the wall; null if none. */
  tumble(adobe: boolean, x: number, z: number, ox: number, oz: number, half: number): THREE.BufferGeometry | null;
  /**
   * A piece of the field walls' bucket (a head, a breach stub, a tumbled block): props' jitterUV and its four draws on
   * the props stream, its v window placed inside the field print's face band (wave 34: the hearting band is the core's).
   */
  stoneUv<T extends THREE.BufferGeometry>(g: T, rng: () => number): T;
}

/** jitterUV's draws (offset u, offset v, scale u, scale v), the v window fitted inside the field print's face band. */
export function jitterFieldStoneUV<T extends THREE.BufferGeometry>(g: T, rng: () => number): T {
  const uv = g.attributes.uv;
  if (!uv) return g;
  const offsetU = rng() * 7.31, offsetV = rng() * 5.17, scaleU = 0.86 + rng() * 0.3;
  rng(); // (jitterUV's v scale: the window keeps the piece's own density)
  let v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < uv.count; i++) { const v = uv.getY(i); if (v < v0) v0 = v; if (v > v1) v1 = v; }
  const room = FIELD_STONE_FACE_V[1] - FIELD_STONE_FACE_V[0], extent = Math.max(1e-6, v1 - v0);
  const squash = Math.min(1, room / extent);
  const start = FIELD_STONE_FACE_V[0] + (offsetV / 5.17) * Math.max(0, room - extent * squash);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scaleU + offsetU, start + (uv.getY(i) - v0) * squash);
  return g;
}

/** The owner the props wall runs call (props.ts addWallRun): one name in the run's scope. */
export function createWallDressing(o: WallDressingOptions): WallDressing {
  const drifts: THREE.BufferGeometry[] = [];
  return {
    snow: o.snow, adobeBucket: o.adobeBucket, mudUv: o.mudUv, drifts,
    island(adobe, ax, az, bx, bz, half) {
      const out = { wall: [] as THREE.BufferGeometry[] };
      if (adobe) {
        const apron = buildMudApron(o.ground, ax, az, bx, bz, half, placeSeed(ax, az, 0xad0a),
          { mobile: o.mobile, uvPerM: o.mudUv, plainV: o.plainV });
        if (apron) out.wall.push(apron);
        if (o.sand && o.plainV) {
          // the sand ramps: the wind's sand banked a third of the way up the wall in its lee, a low ramp on the
          // windward face (the snow drifts' law at sand's angle of repose, on the mud print's plain band)
          const len = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / len, tz = (bz - az) / len;
          const dx = Math.cos(SNOW_WIND_YAW), dz = -Math.sin(SNOW_WIND_YAW);
          const cross = dx * tz - dz * tx, side = cross > 0 ? -1 : 1, across = Math.abs(cross);
          for (const lee of [false, true]) {
            const ramp = buildWallDrift(o.ground, ax, az, bx, bz, half + 0.03, (lee ? -side : side) as 1 | -1,
              placeSeed(ax, az, lee ? 0x5a1d : 0x5a1e), { mobile: o.mobile, across, lee, plainV: o.plainV, uvPerM: o.mudUv, scale: lee ? 0.6 : 0.9 });
            if (ramp) out.wall.push(ramp);
          }
        }
        return out;
      }
      const foot = buildWallFootStones(o.ground, ax, az, bx, bz, half + 0.05, placeSeed(ax, az, 0xf007), { mobile: o.mobile });
      if (foot) out.wall.push(foot);
      if (o.snow) {
        // windward: the face whose outward normal meets the wind (downwind is (cos, -sin) of the wind's yaw); the lee
        // drift on the other face, the big one (wave 34)
        const len = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / len, tz = (bz - az) / len;
        const dx = Math.cos(SNOW_WIND_YAW), dz = -Math.sin(SNOW_WIND_YAW);
        const cross = dx * tz - dz * tx, side = cross > 0 ? -1 : 1, across = Math.abs(cross);
        const windward = buildWallDrift(o.ground, ax, az, bx, bz, half + 0.04, side, placeSeed(ax, az, 0xd71f),
          { mobile: o.mobile, across });
        if (windward) drifts.push(windward);
        const lee = buildWallDrift(o.ground, ax, az, bx, bz, half + 0.04, side > 0 ? -1 : 1, placeSeed(ax, az, 0x1ee5),
          { mobile: o.mobile, across, lee: true });
        if (lee) drifts.push(lee);
      }
      return out;
    },
    loadHead(head, seed) {
      const snow = buildSnowLoad(head, seed ^ 0x5a0c, { bin: 0.08 });
      const loaded = mergeParts([head, snow]);
      return loaded;
    },
    stoneUv: jitterFieldStoneUV,
    tumble(adobe, x, z, ox, oz, half) {
      return buildWallTumble(o.ground, x, z, ox, oz, half, placeSeed(x, z, adobe ? 0x7a3b : 0x7b1e),
        adobe ? { mobile: o.mobile, uvPerM: o.mudUv, mudV: o.plainV ? (o.plainV[0] + o.plainV[1]) / 2 : undefined } : { mobile: o.mobile });
    },
  };
}
