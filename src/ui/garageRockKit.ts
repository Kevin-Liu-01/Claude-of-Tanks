// src/ui/garageRockKit.ts — sculpted rock for the Garage scene packs (the garage redesign, round 7, 2026-10-14; props
// census #20, garage:rock_cavern grade 0: "a sculpted irregular rock face (displaced, faceted mesh with strata and snow
// ledges) round a shotcrete-lined tunnel mouth ... receding into real depth ... no painted black wall").
//
// One builder: a cliff face in a cluster's frame (lateral u, longitudinal w toward the yard, y up), built stratum by
// stratum. Each stratum is a band of facets that leans a little forward up its height and steps back at its top, so the
// face carries upward ledges where snow lies; the whole face batters back with height, its ends curve back into the
// hill, and a top slopes back from the crest. An opening (a horseshoe: walls to `spring`, a semicircle over them) is cut
// through it, and a lined tunnel runs back from the opening. Flat-shaded, vertex-coloured, world space: it joins the
// pack's baked bucket (no draw of its own).
import * as THREE from 'three';

export interface RockFrame {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** Ground height under a point of the face (u, w in the frame). */
  readonly groundAt: (u: number, w: number) => number;
}

export interface RockFaceOptions {
  readonly width: number;
  readonly height: number;
  /** How far the top slopes back and the ends curve back. */
  readonly depth: number;
  readonly seed: number;
  /** Stratum tones (sRGB), one per band in turn. */
  readonly strata: readonly number[];
  readonly snow: number;
  /** Metres between the face's columns (default 0.8; a wide face takes coarser columns to hold its triangle budget). */
  readonly cell?: number;
  /** The tunnel's opening and its lining, if any. */
  readonly opening?: Readonly<{ u: number; half: number; spring: number; length: number; lining: number }>;
  /**
   * The cut the portal's headwall is cast into: within `half` of the opening and up to `top` the face stands plumb at `w`
   * (just behind the headwall), blending back into the rock's own form over 3 m to either side and above.
   */
  readonly cut?: Readonly<{ half: number; w: number; top: number }>;
}

interface Soup {
  readonly positions: number[];
  normals: number[];
  readonly colors: number[];
}

const linear = (hex: number): THREE.Color => new THREE.Color(hex);

function triangle(soup: Soup, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color,
  colorB: THREE.Color = color, colorC: THREE.Color = color): void {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) return;
  n.normalize();
  const colors = [color, colorB, colorC];
  [a, b, c].forEach((p, i) => {
    soup.positions.push(p.x, p.y, p.z);
    soup.normals.push(n.x, n.y, n.z);
    soup.colors.push(colors[i].r, colors[i].g, colors[i].b);
  });
}

/** Build a cliff face (and its tunnel) as one world-space, flat-shaded, vertex-coloured geometry. */
/**
 * Smooth shading over a triangle soup (v3 stills, 2026-10-14: per-facet normals lit the rock as "a patchwork of flat
 * squares"): every vertex takes the average of the face normals meeting at its position within 60 degrees of its own,
 * so the faces read as one surface and real creases (the face's edge, the tunnel lining) stay sharp.
 */
function smoothNormals(soup: Soup): void {
  const key = (i: number): string => `${Math.round(soup.positions[i] * 50)},${Math.round(soup.positions[i + 1] * 50)},${Math.round(soup.positions[i + 2] * 50)}`;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < soup.positions.length; i += 3) {
    const k = key(i);
    let list = groups.get(k);
    if (!list) { list = []; groups.set(k, list); }
    list.push(i);
  }
  const out = soup.normals.slice();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const i of list) {
      let x = 0, y = 0, z = 0;
      for (const j of list) {
        const dot = soup.normals[i] * soup.normals[j] + soup.normals[i + 1] * soup.normals[j + 1] + soup.normals[i + 2] * soup.normals[j + 2];
        if (dot < 0.5) continue;
        x += soup.normals[j]; y += soup.normals[j + 1]; z += soup.normals[j + 2];
      }
      const l = Math.hypot(x, y, z) || 1;
      out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
    }
  }
  soup.normals = out;
}

/** The session's built faces (garage r9: Glacier's cliff built once a session, then handed out as copies). */
const faceCache = new Map<string, THREE.BufferGeometry>();

/**
 * A granite cliff face (and its tunnel) as one world-space, vertex-coloured, indexed geometry (garage r9, Glacier: "the
 * rock retopologised to 15k tris or less: granite with vertical joint sets and horizontal benches ... snow only on
 * low-angle facets, water stains under the ledges, no horizontal smear"; its build 282 ms -> under the pack's budget).
 *
 * One grid over the face, columns along it and rows up it to the crest: the plan swings in buttresses and gullies; the
 * vertical joint sets (2.5-6 m apart, some closing in each tier) cut the face into blocks, each block a stack of planar
 * facets that lean and turn their own way, its sheeting joints stepping it back onto snow ledges (or now and then out
 * over a dark wet overhang) every 2.6-5.2 m up; the joints are crevices the two blocks share, each block tops out at its
 * own height; two benches dip across the face where it lies back and the snow collects; the face batters back with
 * height and its ends curl into the hill. Snow lies on the facets that face up (from the grid's own
 * normals), broken by noise; water stains streak down from the benches; the joints read dark. The crest slopes back under
 * snow, the ends close into the hill, and a horseshoe tunnel lining runs back from the opening. Built once a session per
 * face and handed out as copies.
 */
export function buildRockFace(frame: RockFrame, options: RockFaceOptions): THREE.BufferGeometry {
  const key = JSON.stringify([frame.x, frame.z, frame.yaw, options, ...Array.from({ length: 9 }, (_, i) => frame.groundAt(-options.width / 2 + (i / 8) * options.width, 0))]);
  const cached = faceCache.get(key);
  if (cached) return cached.clone();
  const geometry = buildGraniteFace(frame, options);
  faceCache.set(key, geometry);
  return geometry.clone();
}

function buildGraniteFace(frame: RockFrame, options: RockFaceOptions): THREE.BufferGeometry {
  const { width, height, depth, seed, opening } = options;
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  let state = seed >>> 0;
  const lattice = Float32Array.from({ length: 64 * 64 }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => lattice[(((cy % 64) + 64) % 64) * 64 + (((cx % 64) + 64) % 64)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const fbm = (x: number, y: number): number => noise(x, y) * 0.62 + noise(x * 2.3 + 17, y * 2.3 + 5) * 0.38;
  const hash = (a: number, b: number): number => {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ seed;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 12;
    return ((h >>> 0) % 10000) / 10000;
  };
  const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const half = width / 2;
  const cell = options.cell ?? 0.8;
  const columns = Math.max(8, Math.round(width / Math.max(0.7, cell * 0.72)));
  const rowsN = Math.max(8, Math.round(height / 0.82));
  const crest = (u: number): number => height * (0.8 + 0.2 * fbm(u * 0.09 + 3, 1.7)) * (1 - 0.35 * Math.pow(Math.abs(u) / half, 3));
  // the vertical joints: boundaries 2.5-6 m apart (a fixed set across the face)
  const joints: number[] = [];
  for (let u = -half - 3, k = 0; u < half + 6; k += 1) { joints.push(u); u += 2.5 + 3.5 * hash(k, 41); }
  const blockAt = (u: number): number => {
    let lo = 0, hi = joints.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (joints[mid] <= u) lo = mid; else hi = mid; }
    return lo;
  };
  const plan = (u: number): number => (1 - Math.abs(noise(u * 0.085 + 5.3, 2.1) * 2 - 1)) * 2.4 - 1.2 + (fbm(u * 0.21 + 1.3, 7.7) - 0.5) * 1.2;
  const benchLine = (u: number, at: number, seedU: number): number => at + 0.12 * u + (fbm(u * 0.05 + seedU, 3.3) - 0.5) * 3.0;
  const bench = (u: number, y: number, at: number, back: number, seedU: number): number => {
    const reach = back * smooth((fbm(u * 0.06 + seedU * 2, 9.1) - 0.3) * 3);
    return -reach * smooth((y - benchLine(u, at, seedU)) / 1.6);
  };
  const cutShare = (u: number): number => (options.cut && opening ? 1 - smooth((Math.abs(u - opening.u) - options.cut.half) / 3) : 0);
  // each joint-bounded block is a set of planar facets, one per sheet: the sheeting joints step the block back (a snow
  // ledge) or, now and then, out (an overhang) every 2.6-5.2 m up, and every facet leans and turns a little its own way,
  // so the face reads as squared granite blocks and not as a fluted curtain (garage r9 g1 r2: the round-1 face's
  // rounded V-notched columns read "organ pipes" behind the hero)
  const sheetH = (k: number): number => 2.6 + 2.6 * hash(k, 9);
  const sheetOff = (k: number): number => hash(k, 7) * 3;
  const sheetOf = (k: number, y: number): number => Math.max(0, Math.floor((y + sheetOff(k)) / sheetH(k)));
  const stepOf = (k: number, s: number): number => (hash(k * 13 + s, 27) < 0.16 ? -0.35 : 0.3 + 0.55 * hash(k * 13 + s, 29));
  const sheetBase = (k: number, s: number): number => { let w = 0; for (let i = 0; i < s; i += 1) w -= stepOf(k, i); return w; };
  // not every vertical joint runs the full height: in each 5-7 m tier some joints close, and the block to their right
  // carries on its left neighbour's facets there (one wider block), so the joints step and stop as real ones do
  const jointOpen = (joint: number, y: number): boolean => {
    const tier = Math.floor((y + hash(joint, 63) * 4) / (5 + 2 * hash(joint, 65)));
    return hash(joint * 19 + tier, 61) > 0.38;
  };
  const owner = (k: number, y: number): number => { let q = k; while (q > 0 && !jointOpen(q, y)) q -= 1; return q; };
  const facet = (k0: number, u: number, y: number): number => {
    const k = owner(k0, y);
    const s = sheetOf(k, y);
    const uc = (joints[k] + joints[k + 1]) / 2, ys = s * sheetH(k) - sheetOff(k);
    const tiltU = (hash(k * 7 + s, 21) - 0.5) * 0.5, tiltY = -0.04 - 0.16 * hash(k * 5 + s, 23);
    return (hash(k, 3) - 0.5) * 1.3 + (hash(k * 31 + s, 5) - 0.5) * 0.45 + sheetBase(k, s) * 0.8 + tiltU * (u - uc) + tiltY * (y - ys);
  };
  const crevice = (k: number): number => 0.3 + 0.35 * hash(k, 11);
  const rockAt = (u: number, y: number, w: number): number => {
    const curl = -depth * 0.45 * Math.pow(Math.abs(u) / half, 3) * (0.8 + 0.4 * fbm(y * 0.2, 4.1));
    const rock = curl - 0.07 * y + plan(u) * 0.6 + bench(u, y, height * 0.34, 2.0, 1.7) + bench(u, y, height * 0.68, 1.5, 6.1)
      + w + (fbm(u * 0.5 + 11, y * 0.5) - 0.5) * 0.08;
    const share = cutShare(u) * (options.cut ? 1 - smooth((y - options.cut.top) / 3) : 0);
    return share > 0 ? rock + (options.cut!.w - rock) * share : rock;
  };
  /** The set-back of a block's column: its facet, or at a joint the deeper of the two blocks' facets less the crevice. */
  const setBackIn = (k: number, u: number, y: number, edge: number): number => {
    if (edge === 0) return rockAt(u, y, facet(k, u, y));
    const other = edge < 0 ? k - 1 : k + 1;
    const joint = edge < 0 ? k : k + 1;
    const ok = other >= 0 && other < joints.length - 1;
    if (ok && !jointOpen(joint, y)) return rockAt(u, y, facet(k, u, y));
    return rockAt(u, y, Math.min(facet(k, u, y), ok ? facet(other, u, y) : facet(k, u, y)) - crevice(joint));
  };
  const setBack = (u: number, y: number): number => rockAt(u, y, facet(blockAt(u), u, y));
  const inOpening = (u: number, y: number, margin = 0): boolean => {
    if (!opening) return false;
    const du = Math.abs(u - opening.u);
    if (y < opening.spring) return du < opening.half + margin;
    return Math.hypot(du, y - opening.spring) < opening.half + margin;
  };
  // the columns, block by block: each joint-bounded block its own patch (its columns shared inside it, duplicated at
  // the joints, where both twins sit at the shared crevice), so the joints read as creases between planar blocks
  const cellU = width / columns;
  const usList: number[] = [], blockList: number[] = [];
  for (let k = 0; k < joints.length - 1; k += 1) {
    const u0 = Math.max(-half, joints[k]), u1 = Math.min(half, joints[k + 1]);
    if (u1 - u0 < 1e-3) continue;
    const n = Math.max(1, Math.ceil((u1 - u0) / cellU));
    for (let i = 0; i <= n; i += 1) { usList.push(u0 + ((u1 - u0) * i) / n); blockList.push(k); }
  }
  const cols = usList.length, rows = rowsN + 1;
  const columnsN = cols - 1;
  const us = Float32Array.from(usList), colBlock = Int32Array.from(blockList);
  const ground = Float32Array.from(us, (u) => frame.groundAt(u, 0));
  const pos = new Float32Array(cols * rows * 3);
  const local = new Float32Array(cols * rows); // height over the ground
  // each block tops out at its own height (a stepped crest, not one smooth roll); a joint's twin columns take the lower
  // of their two blocks' crests, so the skyline notches at every joint and the twins stay one seam
  const blockCrest = (k: number, u: number): number => crest(u) + (hash(k, 51) - 0.5) * 2.4;
  const edgeOf = new Int8Array(cols);
  for (let k = 0; k < cols; k += 1) {
    if (k === 0 || colBlock[k - 1] !== colBlock[k]) edgeOf[k] = -1;
    else if (k === columnsN || colBlock[k + 1] !== colBlock[k]) edgeOf[k] = 1;
  }
  const colTop = Float32Array.from(us, (u, k) => {
    const block = colBlock[k], edge = edgeOf[k];
    if (edge === 0) return blockCrest(block, u);
    const other = block + edge;
    return Math.min(blockCrest(block, u), other >= 0 && other < joints.length - 1 ? blockCrest(other, u) : blockCrest(block, u)) - 0.5;
  });
  for (let k = 0; k < cols; k += 1) {
    const top = colTop[k] + 0.6;
    for (let j = 0; j < rows; j += 1) {
      const y = -0.6 + (j / rowsN) * top;
      const w = setBackIn(colBlock[k], us[k], y, edgeOf[k]);
      const o = (j * cols + k);
      local[o] = y;
      pos[o * 3] = frame.x + cos * us[k] + sin * w;
      pos[o * 3 + 1] = ground[k] + y;
      pos[o * 3 + 2] = frame.z - sin * us[k] + cos * w;
    }
  }
  // the grid's normals (central differences inside each block, one-sided at its joints), turned toward the yard
  const nrm = new Float32Array(cols * rows * 3);
  const yard = new THREE.Vector3(sin, 0, cos); // the frame's +w
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const P = (k: number, j: number, out: THREE.Vector3): THREE.Vector3 => out.fromArray(pos, (Math.min(rowsN, Math.max(0, j)) * cols + Math.min(columnsN, Math.max(0, k))) * 3);
  const t0 = new THREE.Vector3(), t1 = new THREE.Vector3();
  for (let j = 0; j < rows; j += 1) {
    for (let k = 0; k < cols; k += 1) {
      // inside a block the facet's own normal (its edge columns, down in the crevice, left out); an edge column takes
      // the crevice wall's
      const same = (q: number): boolean => q >= 0 && q <= columnsN && colBlock[q] === colBlock[k];
      let kl = same(k - 1) && (edgeOf[k] !== 0 || edgeOf[k - 1] === 0) ? k - 1 : k;
      let kr = same(k + 1) && (edgeOf[k] !== 0 || edgeOf[k + 1] === 0) ? k + 1 : k;
      if (kl === kr) { kl = same(k - 1) ? k - 1 : k; kr = same(k + 1) ? k + 1 : k; }
      if (edgeOf[k] === -1) kl = k; else if (edgeOf[k] === 1) kr = k;
      a.copy(P(kr, j, t0)).sub(P(kl, j, t1));
      b.copy(P(k, j + 1, t0)).sub(P(k, j - 1, t1));
      n.crossVectors(a, b);
      if (n.lengthSq() < 1e-12) n.copy(yard); else n.normalize();
      if (n.dot(yard) < 0) n.negate();
      nrm.set([n.x, n.y, n.z], (j * cols + k) * 3);
    }
  }
  // colour: granite grey by block, speckled; joints dark; water stains under the benches; snow on what faces up
  const granite = [linear(0x6f6d68), linear(0x7a7772), linear(0x64625e), linear(0x75736d)];
  const snow = linear(options.snow), snowShade = linear(0xc4cfd8), stainTone = linear(0x3e3d3a);
  const col = new Float32Array(cols * rows * 3);
  const c = new THREE.Color();
  for (let j = 0; j < rows; j += 1) {
    for (let k = 0; k < cols; k += 1) {
      const o = j * cols + k, u = us[k], y = local[o];
      const block = owner(colBlock[k], y), sheet = sheetOf(block, y);
      const joint = edgeOf[k] < 0 ? colBlock[k] : colBlock[k] + 1;
      const inCrevice = edgeOf[k] !== 0 && (joint <= 0 || joint >= joints.length - 1 || jointOpen(joint, y));
      // tone by block and by sheet (each facet its own weathering), speckled; the crevices dark; the foot dirtier
      c.copy(granite[block % 4]).multiplyScalar(0.8 + 0.16 * hash(block, 13) + 0.12 * hash(block * 17 + sheet, 31) + 0.12 * fbm(u * 0.9 + 9, y * 0.9));
      if (inCrevice) c.multiplyScalar(0.62);
      if (y < 1.2) c.multiplyScalar(0.78 + y / 6);
      // water stains: dark streaks hanging below the benches, on some columns
      for (const [at, seedU] of [[height * 0.34, 1.7], [height * 0.68, 6.1]] as const) {
        const below = benchLine(u, at, seedU) - y;
        if (below > 0 && below < 5) c.lerp(stainTone, smooth((fbm(u * 1.3 + seedU, 0.5) - 0.55) * 4) * (1 - below / 5) * 0.55);
      }
      // under an overhang the rock is wet and dark; on a ledge (a step back just above) the snow lies
      const above = j < rowsN ? local[o + cols] : y;
      const stepUp = j < rowsN && !inCrevice && sheetOf(block, above) > sheet ? stepOf(block, sheet) : 0;
      const below = j > 0 ? local[o - cols] : y;
      const stepBelow = j > 0 && !inCrevice && sheetOf(block, below) < sheet ? stepOf(block, sheetOf(block, below)) : 0;
      if (stepUp < 0) c.multiplyScalar(0.7);
      const ny = nrm[o * 3 + 1];
      const lying = smooth((ny - 0.42) / 0.22) * smooth((fbm(u * 0.21 + 4, y * 0.3) - 0.25) * 2.4) + (y > colTop[k] - 0.2 ? 0.6 : 0)
        + (stepUp > 0.38 || stepBelow > 0.38 ? (stepUp > 0.38 ? 1 : 0.6) * smooth((fbm(u * 0.55 + sheet * 3.1, y * 0.2 + 2) - 0.36) * 4) : 0);
      if (lying > 0) c.lerp(snowShade.clone().lerp(snow, 0.6 + 0.4 * fbm(u * 0.7, y * 0.7)), Math.min(1, lying));
      col.set([c.r, c.g, c.b], o * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rowsN; j += 1) {
    for (let k = 0; k < columnsN; k += 1) {
      if (colBlock[k] !== colBlock[k + 1]) continue; // the joint: two blocks meet, no face between their twin columns
      const mu = (us[k] + us[k + 1]) / 2, my = (local[j * cols + k] + local[(j + 1) * cols + k + 1]) / 2;
      if (inOpening(mu, my, -0.15)) continue;
      const i0 = j * cols + k, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
      // seen from the yard: +u then +y is counter-clockwise
      index.push(i0, i1, i3, i0, i3, i2);
    }
  }
  const positions = Array.from(pos), normals = Array.from(nrm), colors = Array.from(col);
  const vertex = (v: THREE.Vector3, normal: THREE.Vector3, tone: THREE.Color): number => {
    positions.push(v.x, v.y, v.z); normals.push(normal.x, normal.y, normal.z); colors.push(tone.r, tone.g, tone.b);
    return positions.length / 3 - 1;
  };
  const world = (u: number, y: number, w: number): THREE.Vector3 => new THREE.Vector3(frame.x + cos * u + sin * w, y, frame.z - sin * u + cos * w);
  // the crest slopes up and back into the hill under snow
  const up = new THREE.Vector3(0, 1, 0);
  const crestRow: number[] = [], backRow: number[] = [];
  for (let k = 0; k < cols; k += 1) {
    const top = P(k, rowsN, t0);
    crestRow.push(vertex(top, up, snow));
    backRow.push(vertex(world(us[k] * 0.96, top.y + depth * 0.45, -depth), up, snowShade));
  }
  for (let k = 0; k < columnsN; k += 1) {
    if (colBlock[k] === colBlock[k + 1]) index.push(crestRow[k], crestRow[k + 1], backRow[k + 1], crestRow[k], backRow[k + 1], backRow[k]);
  }
  // the two ends close back into the hill
  for (const [k, sign] of [[0, -1], [columnsN, 1]] as const) {
    const side = new THREE.Vector3(cos * sign, 0, -sin * sign);
    let prevFront = -1, prevBack = -1;
    for (let j = 0; j < rows; j += 1) {
      const front = P(k, j, t0).clone();
      const tone = new THREE.Color().fromArray(col, (j * cols + k) * 3).multiplyScalar(0.8);
      const f = vertex(front, side, tone), bk = vertex(world(us[k] * 0.98, front.y, -depth), side, tone);
      if (j > 0) {
        if (sign < 0) index.push(prevFront, f, bk, prevFront, bk, prevBack);
        else index.push(prevFront, prevBack, bk, prevFront, bk, f);
      }
      prevFront = f; prevBack = bk;
    }
  }
  // the tunnel: a horseshoe lining from the mouth back `length` metres, seen from inside, falling dark down the bore
  if (opening) {
    const lining = linear(opening.lining);
    const profile: Array<[number, number]> = [[-opening.half, 0], [-opening.half, opening.spring]];
    for (let i = 1; i < 12; i += 1) {
      const angle = Math.PI - (i / 12) * Math.PI;
      profile.push([Math.cos(angle) * opening.half, opening.spring + Math.sin(angle) * opening.half]);
    }
    profile.push([opening.half, opening.spring], [opening.half, 0]);
    const groundMouth = frame.groundAt(opening.u, 0);
    const mouthW = setBack(opening.u, opening.spring) + 0.4;
    const rings = 6;
    const ringIndex: number[][] = [];
    for (let ring = 0; ring <= rings; ring += 1) {
      const w = mouthW - (ring / rings) * opening.length;
      const tone = lining.clone().multiplyScalar(Math.exp(-ring * 0.62));
      ringIndex.push(profile.map(([pu, py]) => {
        const inward = new THREE.Vector3(-Math.sign(pu) * (py < opening.spring ? 1 : Math.abs(pu) / opening.half), py < opening.spring ? 0 : -(py - opening.spring) / opening.half, 0);
        const worldNormal = new THREE.Vector3(cos * inward.x, inward.y, -sin * inward.x).normalize();
        return vertex(world(opening.u + pu, groundMouth + py, w), worldNormal, tone);
      }));
    }
    for (let ring = 0; ring < rings; ring += 1) {
      for (let i = 0; i < profile.length - 1; i += 1) {
        const a0 = ringIndex[ring][i], b0 = ringIndex[ring][i + 1], c0 = ringIndex[ring + 1][i + 1], d0 = ringIndex[ring + 1][i];
        index.push(a0, c0, b0, a0, d0, c0);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface MoundOptions {
  readonly width: number;
  readonly length: number;
  /** Crown height above the frame's ground at the front. */
  readonly height: number;
  readonly seed: number;
  readonly snow: number;
  readonly earth: number;
  /** Metres of the cover's front edge (its eaves over the facade) left as exposed earth and turf, wind-scoured. */
  readonly frontEarth?: number;
}

/**
 * An earth cover over a buried structure (Frosthollow's repair bunker): a barrel-shaped mound from w = 0 (its front,
 * where the structure's facade stands) back `length` metres, its crown `height` up, its flanks and back end rounding
 * down into the ground, lumpy, under snow that leaves the earth showing where the slope is steep. Seen from outside.
 */
export function buildEarthMound(frame: RockFrame, options: MoundOptions): THREE.BufferGeometry {
  const soup: Soup = { positions: [], normals: [], colors: [] };
  const { width, length, height, seed } = options;
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  const half = width / 2;
  let state = seed >>> 0;
  const lattice = Float32Array.from({ length: 32 * 32 }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => lattice[(((cy % 32) + 32) % 32) * 32 + (((cx % 32) + 32) % 32)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const front = frame.groundAt(0, 0);
  const point = (u: number, w: number): THREE.Vector3 => {
    const across = Math.min(1, Math.abs(u) / half);
    const along = Math.min(1, Math.max(0, -w / length));
    const crown = height * Math.pow(Math.max(0, 1 - across * across), 0.55) * Math.pow(Math.max(0, 1 - Math.pow(along, 3)), 0.6);
    const lump = (noise(u * 0.35 + 3, w * 0.35 + 7) - 0.5) * 0.7 * (1 - across * 0.5);
    const ground = frame.groundAt(u, w);
    const y = Math.max(ground - 0.3, front + crown + lump * (crown > 0.3 ? 1 : 0) - 0.2);
    return new THREE.Vector3(frame.x + cos * u + sin * w, y, frame.z - sin * u + cos * w);
  };
  const snow = new THREE.Color(options.snow), earth = new THREE.Color(options.earth), shade = new THREE.Color(0xc4cfd6);
  const cols = 20, rows = 14;
  const n = new THREE.Vector3();
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const u0 = -half - 0.6 + ((width + 1.2) * i) / cols, u1 = -half - 0.6 + ((width + 1.2) * (i + 1)) / cols;
      const w0 = -((length + 0.8) * j) / rows, w1 = -((length + 0.8) * (j + 1)) / rows;
      // (b - a) runs +u, (c - a) runs +u and back (-w): u x (u - w) points up, so a, b, c faces the sky
      const a = point(u0, w0), b = point(u1, w0), c = point(u1, w1), d = point(u0, w1);
      n.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      const steep = 1 - Math.abs(n.y);
      const scoured = (options.frontEarth ?? 0) > 0
        && (j * (length + 0.8)) / rows < (options.frontEarth ?? 0) * (0.7 + noise(i * 0.9 + 5, 3.1) * 0.6);
      const tone = scoured ? earth.clone().lerp(new THREE.Color(0x4a5236), 0.35 + noise(i * 1.3, j * 1.3) * 0.3)
        : steep > 0.55 + noise(i * 0.7, j * 0.7) * 0.2 ? earth.clone().lerp(snow, 0.25) : snow.clone().lerp(shade, steep * 0.6);
      triangle(soup, a, b, c, tone);
      triangle(soup, a, c, d, tone);
    }
  }
  smoothNormals(soup);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface TalusOptions {
  /** The apron's run along the face (u from, to). */
  readonly from: number;
  readonly to: number;
  /** How far it runs out from the face toward the yard, and its height against the face. */
  readonly reach: number;
  readonly height: number;
  readonly seed: number;
  readonly snow: number;
  readonly rock: number;
  /** Stretches of the face left clear (a portal's headwall), u from, to. */
  readonly gaps?: ReadonlyArray<readonly [number, number]>;
  /** Boulders half buried in the apron. */
  readonly boulders?: number;
}

/**
 * The scree at a cliff's foot under snow (Glacier, the re-judge 2026-10-15: "a freestanding hemisphere on flat snow with a
 * hard ground line ... the 'talus' at its foot is a row of grey cuboids"): an apron that starts inside the face, stands
 * `height` against it and falls away to the ground `reach` metres out, lumpy, thinning to nothing at its ends and at the
 * gaps, the scree showing through the snow where it is steep, with flat-faced boulders half buried in it. World space,
 * vertex-coloured, for the pack's baked bucket.
 */
export function buildTalusApron(frame: RockFrame, options: TalusOptions): THREE.BufferGeometry {
  const apron: Soup = { positions: [], normals: [], colors: [] };
  const stones: Soup = { positions: [], normals: [], colors: [] };
  const { from, to, reach, height, seed } = options;
  const gaps = options.gaps ?? [];
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  const world = (u: number, y: number, w: number): THREE.Vector3 => new THREE.Vector3(frame.x + cos * u + sin * w, y, frame.z - sin * u + cos * w);
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lattice = Float32Array.from({ length: 32 * 32 }, rand);
  const noise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => lattice[(((cy % 32) + 32) % 32) * 32 + (((cx % 32) + 32) % 32)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  const back = -2.5;
  const taper = (u: number): number => {
    let t = smooth((u - from) / 8) * smooth((to - u) / 8);
    for (const [g0, g1] of gaps) t *= u < g0 ? smooth((g0 - u) / 2.5) : u > g1 ? smooth((u - g1) / 2.5) : 0;
    return t;
  };
  const surface = (u: number, w: number): number => {
    const t = Math.min(1, Math.max(0, (w - back) / (reach - back)));
    const fall = Math.pow(1 - t, 1.7);
    const crown = height * (0.55 + 0.6 * noise(u * 0.1 + 3, 1.3)) * taper(u);
    const lump = (noise(u * 0.45 + 7, w * 0.45 + 2) - 0.5) * 0.6 * crown / Math.max(0.01, height);
    return frame.groundAt(u, w) - 0.2 + (crown + lump) * fall;
  };
  const snow = new THREE.Color(options.snow), rock = new THREE.Color(options.rock), shade = new THREE.Color(0xc4cfd6);
  const cols = Math.ceil(to - from), rows = 8;
  const point = (i: number, j: number): THREE.Vector3 => {
    const u = from + ((to - from) * i) / cols, w = back + ((reach - back) * j) / rows;
    return world(u, surface(u, w), w);
  };
  const n = new THREE.Vector3();
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      // a runs +u to b, d runs +w (toward the yard) from a: (b - a) x (d - a) = u x w points down, so a, d, c faces up
      const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
      n.subVectors(d, a).cross(new THREE.Vector3().subVectors(b, a)).normalize();
      const steep = 1 - Math.abs(n.y);
      const scree = steep > 0.3 + noise(i * 0.6, j * 0.9) * 0.25;
      const tone = scree ? rock.clone().lerp(snow, 0.3) : snow.clone().lerp(shade, Math.min(1, steep * 1.4));
      triangle(apron, a, d, c, tone);
      triangle(apron, a, c, b, tone);
    }
  }
  smoothNormals(apron);
  // the boulders: jittered icosahedra, flat-faced, a snow cap on their upward faces
  const ico = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  for (let k = 0; k < (options.boulders ?? 0); k += 1) {
    const u = from + 2 + rand() * (to - from - 4), w = -0.6 + rand() * reach * 0.6;
    if (taper(u) < 0.4) continue;
    const size = 0.35 + rand() * 0.65, squash = 0.6 + rand() * 0.3, turn = rand() * Math.PI * 2;
    const y = surface(u, w) - size * squash * 0.35;
    const jitter = new Map<string, number>();
    const corner = (index: number): THREE.Vector3 => {
      const px = ico.getX(index), py = ico.getY(index), pz = ico.getZ(index);
      const key = `${px.toFixed(3)},${py.toFixed(3)},${pz.toFixed(3)}`;
      let scale = jitter.get(key);
      if (scale === undefined) { scale = 0.72 + rand() * 0.5; jitter.set(key, scale); }
      const lx = px * size * scale, ly = py * size * scale * squash, lz = pz * size * scale;
      const ru = lx * Math.cos(turn) - lz * Math.sin(turn), rw = lx * Math.sin(turn) + lz * Math.cos(turn);
      return world(u + ru, y + ly, w + rw);
    };
    const stoneTone = rock.clone().multiplyScalar(0.85 + rand() * 0.3);
    for (let f = 0; f < ico.count; f += 3) {
      const a = corner(f), b = corner(f + 1), c = corner(f + 2);
      n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      triangle(stones, a, b, c, n.y > 0.72 ? snow.clone().lerp(shade, 0.25) : stoneTone);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...apron.positions, ...stones.positions], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([...apron.normals, ...stones.normals], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([...apron.colors, ...stones.colors], 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Monsoon's wet-tropics planting (the re-judge, 2026-10-15: "no jungle belt, tall grass, banana or bamboo ... a temperate
 * park"): banana plants (a pseudostem and seven paddle leaves rising and arching over) and bamboo clumps (culms leaning
 * out, drooping fronds at their heads), each a world-space point with its kind and size. Leaves are two-sided.
 * Vertex-coloured, for the pack's baked bucket.
 */
export function buildTropicalPlants(
  plants: ReadonlyArray<{ readonly x: number; readonly z: number; readonly y: number; readonly kind: 'banana' | 'bamboo'; readonly size: number }>,
  seed: number,
): THREE.BufferGeometry {
  const soup: Soup = { positions: [], normals: [], colors: [] };
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const twoSided = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color): void => {
    triangle(soup, a, b, c, ca, cb, cc);
    triangle(soup, a, c, b, ca, cc, cb);
  };
  const prism = (base: THREE.Vector3, top: THREE.Vector3, r0: number, r1: number, color: THREE.Color, sides = 6): void => {
    for (let k = 0; k < sides; k += 1) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      const p = (c: THREE.Vector3, r: number, a: number): THREE.Vector3 => new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      triangle(soup, p(base, r0, a0), p(top, r1, a1), p(base, r0, a1), color);
      triangle(soup, p(base, r0, a0), p(top, r1, a0), p(top, r1, a1), color);
    }
  };
  const leafGreen = new THREE.Color(0x3b6a2a), leafDeep = new THREE.Color(0x284d1f), rib = new THREE.Color(0x8a9a4a);
  const stemTone = new THREE.Color(0x5d6b34), culmTone = new THREE.Color(0x8a8f45), culmOld = new THREE.Color(0x6f6a3a);
  for (const plant of plants) {
    const { x, z, y, size } = plant;
    if (plant.kind === 'banana') {
      const h = 2.4 * size;
      const top = new THREE.Vector3(x, y + h, z);
      prism(new THREE.Vector3(x, y - 0.1, z), top, 0.2 * size, 0.13 * size, stemTone);
      for (let k = 0; k < 7; k += 1) {
        const heading = (k / 7) * Math.PI * 2 + rand() * 0.5, L = (2.0 + rand() * 0.8) * size, W = 0.55 * size;
        const dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading)), side = new THREE.Vector3(-dir.z, 0, dir.x);
        const rise = 0.9 + rand() * 0.5, droop = 1.3 + rand() * 0.6;
        const mid = (t: number): THREE.Vector3 => top.clone().addScaledVector(dir, L * t).add(new THREE.Vector3(0, (rise * t - droop * t * t) * size, 0));
        const tone = leafGreen.clone().lerp(leafDeep, rand() * 0.6);
        const segments = 4;
        for (let s = 0; s < segments; s += 1) {
          const t0 = s / segments, t1 = (s + 1) / segments;
          const w0 = W * Math.sin(Math.PI * Math.min(0.97, t0 * 0.9 + 0.08)), w1 = W * Math.sin(Math.PI * Math.min(0.97, t1 * 0.9 + 0.08));
          const m0 = mid(t0), m1 = mid(t1);
          const l0 = m0.clone().addScaledVector(side, w0), r0 = m0.clone().addScaledVector(side, -w0);
          const l1 = m1.clone().addScaledVector(side, w1), r1 = m1.clone().addScaledVector(side, -w1);
          twoSided(m0, l0, l1, rib, tone, tone);
          twoSided(m0, l1, m1, rib, tone, rib);
          twoSided(m0, m1, r1, rib, rib, tone);
          twoSided(m0, r1, r0, rib, tone, tone);
        }
      }
    } else {
      const culms = 9 + Math.floor(rand() * 4);
      for (let k = 0; k < culms; k += 1) {
        const heading = rand() * Math.PI * 2, lean = 0.06 + rand() * 0.16, h = (5.5 + rand() * 2.5) * size;
        const off = new THREE.Vector3(Math.cos(heading) * 0.5 * rand(), 0, Math.sin(heading) * 0.5 * rand());
        const base = new THREE.Vector3(x + off.x, y - 0.1, z + off.z);
        const top = base.clone().add(new THREE.Vector3(Math.cos(heading) * h * lean, h, Math.sin(heading) * h * lean));
        prism(base, top, 0.055 * size, 0.035 * size, k % 3 ? culmTone : culmOld, 5);
        for (let f = 0; f < 3; f += 1) {
          const at = base.clone().lerp(top, 0.7 + f * 0.12), fh = heading + (f - 1) * 0.9 + rand() * 0.4;
          const dir = new THREE.Vector3(Math.cos(fh), 0, Math.sin(fh)), side = new THREE.Vector3(-dir.z, 0, dir.x);
          const tip = at.clone().addScaledVector(dir, 1.5 * size).add(new THREE.Vector3(0, -0.7 * size, 0));
          const midP = at.clone().addScaledVector(dir, 0.8 * size).add(new THREE.Vector3(0, -0.05 * size, 0));
          const tone = leafGreen.clone().lerp(leafDeep, 0.3 + rand() * 0.5);
          const w = 0.32 * size;
          twoSided(at, midP.clone().addScaledVector(side, w), midP.clone().addScaledVector(side, -w), tone, tone, tone);
          twoSided(midP.clone().addScaledVector(side, w), tip, midP.clone().addScaledVector(side, -w), tone, leafDeep, tone);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Conifers under snow (Frosthollow, the re-judge 2026-10-15: the bunker's snow mound was "white on a near-white sky ...
 * a darker treeline or rock band behind it", "conifers with snow load in the hero background"): each tree a trunk and
 * three stacked eight-sided cones, dark spruce green with snow lying on the upper faces of each tier. Points are
 * (u, w, height) in the frame. World space, vertex-coloured, for the pack's baked bucket.
 */
export function buildConifers(frame: RockFrame, trees: ReadonlyArray<readonly [number, number, number, number?]>, seed: number): THREE.BufferGeometry {
  // garage r9 (Frosthollow: "the rows of identical blue-grey cones"): each spruce is its own: five ragged tiers whose skirts
  // droop at the branch tips and wander in reach, slender (a quarter of its height across), its crown leaning a little
  // with the wind, dark needles with snow lying in patches on the tiers' upper sides (more of it high up), flat-shaded so
  // the branch tiers read; a tree flagged 1 is a winter birch at a stand's edge: a white trunk and a bare grey crown
  const soup: Soup = { positions: [], normals: [], colors: [] };
  const cos = Math.cos(frame.yaw), sin = Math.sin(frame.yaw);
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const needleTones = [new THREE.Color(0x1b2a20), new THREE.Color(0x22322a), new THREE.Color(0x2a3a2f), new THREE.Color(0x1f2d25)];
  const bark = new THREE.Color(0x3a2c22), snow = new THREE.Color(0xe6ecf0), snowShade = new THREE.Color(0xbac7d0);
  const birchBark = new THREE.Color(0xd9d6cc), birchMark = new THREE.Color(0x3a3634), twigs = new THREE.Color(0x5e5552);
  const sides = 7;
  for (const [u, w, height, kind] of trees) {
    const x = frame.x + cos * u + sin * w, z = frame.z - sin * u + cos * w, ground = frame.groundAt(u, w) - 0.3;
    const turn = rand() * Math.PI * 2;
    const leanX = (rand() - 0.5) * 0.06 * height, leanZ = (rand() - 0.5) * 0.06 * height;
    const at = (y: number, r: number, k: number, droop = 0): THREE.Vector3 => {
      const a = turn + (k / sides) * Math.PI * 2;
      const t = (y - ground) / height;
      return new THREE.Vector3(x + Math.cos(a) * r + leanX * t, y - droop, z + Math.sin(a) * r + leanZ * t);
    };
    if (kind === 1) {
      // the birch: a white trunk with its dark marks, and a bare crown of twigs (crossed thin cards)
      for (let k = 0; k < sides; k += 2) {
        const a0 = at(ground, 0.16, k), a1 = at(ground, 0.16, k + 2), b0 = at(ground + height * 0.75, 0.06, k), b1 = at(ground + height * 0.75, 0.06, k + 2);
        triangle(soup, a0, b1, a1, birchBark, birchMark, birchBark); triangle(soup, a0, b0, b1, birchBark, birchBark, birchMark);
      }
      for (let c = 0; c < 3; c += 1) {
        const a = turn + (c / 3) * Math.PI, r = height * 0.22;
        const p0 = new THREE.Vector3(x - Math.cos(a) * r + leanX * 0.5, ground + height * 0.45, z - Math.sin(a) * r + leanZ * 0.5);
        const p1 = new THREE.Vector3(x + Math.cos(a) * r + leanX * 0.5, ground + height * 0.45, z + Math.sin(a) * r + leanZ * 0.5);
        const p2 = new THREE.Vector3(x + leanX, ground + height * 1.02, z + leanZ);
        triangle(soup, p0, p1, p2, twigs); triangle(soup, p0, p2, p1, twigs);
      }
      continue;
    }
    const tone = needleTones[Math.floor(rand() * needleTones.length)];
    // the trunk below the lowest tier
    for (let k = 0; k < sides; k += 2) {
      const a0 = at(ground, 0.2, k), a1 = at(ground, 0.2, k + 2), b0 = at(ground + height * 0.16, 0.14, k), b1 = at(ground + height * 0.16, 0.14, k + 2);
      triangle(soup, a0, b1, a1, bark); triangle(soup, a0, b0, b1, bark);
    }
    const tiers = 5;
    for (let tier = 0; tier < tiers; tier += 1) {
      const t0 = 0.12 + (tier / tiers) * 0.8, t1 = Math.min(1, t0 + 0.3);
      const y0 = ground + height * t0, y1 = ground + height * t1;
      const reach = height * 0.25 * (1 - t0 * 0.88);
      const tip = new THREE.Vector3(x + leanX * t1, y1, z + leanZ * t1);
      const skirt = Array.from({ length: sides + 1 }, (_, k) => {
        const kk = k % sides;
        const r = reach * (0.72 + 0.5 * rand());
        return at(y0, kk === 0 && k === sides ? r : r, kk, (kk % 2) * height * 0.03 + rand() * height * 0.015);
      });
      skirt[sides] = skirt[0];
      for (let k = 0; k < sides; k += 1) {
        const a = skirt[k], b = skirt[k + 1];
        const lying = rand() < 0.25 + tier * 0.12;
        const cap = lying ? (rand() < 0.6 ? snow : snowShade) : tone;
        const mid = a.clone().lerp(tip, 0.45), midB = b.clone().lerp(tip, 0.45);
        triangle(soup, a, b, midB, tone); triangle(soup, a, midB, mid, tone);
        triangle(soup, mid, midB, tip, cap);
        triangle(soup, a, new THREE.Vector3(x + leanX * t0, y0 + height * 0.04, z + leanZ * t0), b, needleTones[0]); // the tier's underside
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(soup.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
