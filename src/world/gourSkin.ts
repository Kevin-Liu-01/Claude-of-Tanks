// src/world/gourSkin.ts — a mesa outlier's wall in relief: the caprock's blocks, the marl slope's beds and rills, the
// fallen blocks on its talus (the map-revival lane, 2026-10-07, Sirocco Wadi round 1; gauntlet wave 235 on the PR head:
// "soft, low, banded mesas", "a stretched, vertically streaked texture on the steep slope").
//
// The Dahar's gour, the outliers standing off the escarpment of southern Tunisia, are capped by a hard bed of dolomite
// and limestone: a pale cliff a few metres to a dozen high at the cap's edge, split by vertical joints into blocks that
// stand proud or have fallen, a dark notch under it where the soft rock beneath has weathered back. Below the caprock the
// marls and sandstones fall in a steep slope, banded red, ochre, green-grey and the white of gypsum, cut by rills, down
// to the talus of fallen caprock blocks on the sand. The terrain draws the shape (terrain.ts mesas capCliff: the cliff
// over the slope); this skin draws the rock: rows of the wall read on stations along its outline (traced on the
// heightfield's mesa weight, so any outline serves), pushed off the terrain by the blocks and the rills, tucked into the
// talus at the foot; the fallen blocks decor on the talus. The terrain stays the battlefield's rock. Welded
// vertex-coloured geometry in the scenery rock family (castleRock.ts finishSkin's attribute set), drawn with the
// formations. Deterministic: only the stream it is handed and the shared noise.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { finishSkin, hsl, SkinMesh, type CastleGround, type V3 } from './castleRock.ts';

type Rng = () => number;

/** A mesa outlier (the map's mesa noise) to skin: the box its outline is traced in. */
export interface GourSkinSpec {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** The mesa weight's level the outline is traced at (default 0.5: about the middle of the wall and its talus). */
  level?: number;
  /** sRGB HSL tones: the caprock (default a pale buff dolomite) and the slope's beds, top to bottom, repeating. */
  capTone?: readonly [number, number, number];
  beds?: ReadonlyArray<readonly [number, number, number]>;
  name?: string;
}

/** The ground a gour is traced on: its heights and its mesa weight (terrain.ts _mesaW). */
export interface GourGround extends CastleGround {
  _mesaW?: ((x: number, z: number) => number) | null;
}

interface GourSkinOptions {
  mobile?: boolean;
}

/** The Dahar's slope beds, top to bottom: green-grey marl, gypsum, red marl, ochre sandstone, cream marl, red marl. */
const DAHAR_BEDS: ReadonlyArray<readonly [number, number, number]> = [
  [0.16, 0.10, 0.54], [0.11, 0.10, 0.76], [0.035, 0.36, 0.44], [0.088, 0.44, 0.54], [0.105, 0.24, 0.66], [0.03, 0.34, 0.40],
];
/** Keep off the square's rim ring (its own rock weight) and the outland. */
const EDGE_M = 446;

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Marching squares on a weight field at a level: the outline's chains (each a polyline of [x, z]), open or closed. */
export function traceOutline(weight: (x: number, z: number) => number, spec: GourSkinSpec, cellM: number): Array<Array<[number, number]>> {
  const level = spec.level ?? 0.5;
  const nx = Math.max(2, Math.ceil((spec.x1 - spec.x0) / cellM)), nz = Math.max(2, Math.ceil((spec.z1 - spec.z0) / cellM));
  const g = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = spec.x0 + i * cellM, z = spec.z0 + j * cellM;
    g[j * (nx + 1) + i] = Math.max(Math.abs(x), Math.abs(z)) > EDGE_M ? 0 : weight(x, z);
  }
  const W = nx + 1;
  const edgePoint = (id: number): [number, number] => {
    const e = id % 2, c = (id - e) / 2, i = c % W, j = (c - i) / W;
    if (e === 0) { const a = g[j * W + i], b = g[j * W + i + 1], t = (level - a) / (b - a); return [spec.x0 + (i + t) * cellM, spec.z0 + j * cellM]; }
    const a = g[j * W + i], b = g[(j + 1) * W + i], t = (level - a) / (b - a); return [spec.x0 + i * cellM, spec.z0 + (j + t) * cellM];
  };
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const v0 = g[j * W + i] >= level, v1 = g[j * W + i + 1] >= level, v2 = g[(j + 1) * W + i + 1] >= level, v3 = g[(j + 1) * W + i] >= level;
    const B = (j * W + i) * 2, R = (j * W + i + 1) * 2 + 1, T = ((j + 1) * W + i) * 2, L = (j * W + i) * 2 + 1;
    const cross: number[] = [];
    if (v0 !== v1) cross.push(B);
    if (v1 !== v2) cross.push(R);
    if (v2 !== v3) cross.push(T);
    if (v3 !== v0) cross.push(L);
    if (cross.length === 2) link(cross[0], cross[1]);
    else if (cross.length === 4) { link(B, R); link(T, L); }
  }
  const seen = new Set<number>(), chains: Array<Array<[number, number]>> = [];
  // open chains first (from an end), then the closed loops
  const starts = [...adj.keys()].sort((a, b) => (adj.get(a)!.length - adj.get(b)!.length) || a - b);
  for (const start of starts) {
    if (seen.has(start)) continue;
    const ids = [start];
    seen.add(start);
    let cur = start, prev = -1;
    for (;;) {
      const next = adj.get(cur)!.find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      ids.push(next); seen.add(next); prev = cur; cur = next;
    }
    const closed = ids.length > 2 && adj.get(cur)!.includes(start);
    const pts = ids.map(edgePoint);
    if (closed) pts.push(pts[0]);
    chains.push(pts);
  }
  return chains;
}

/** Resample a polyline every `step` metres (its last stretch shared out). */
function resample(pts: Array<[number, number]>, step: number): Array<[number, number]> {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const n = Math.max(2, Math.round(len / step)), d = len / n, out: Array<[number, number]> = [pts[0]];
  let seg = 1, segStart = 0, segLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  for (let k = 1; k <= n; k++) {
    const target = k * d;
    while (seg < pts.length - 1 && segStart + segLen < target) {
      segStart += segLen; seg++;
      segLen = Math.hypot(pts[seg][0] - pts[seg - 1][0], pts[seg][1] - pts[seg - 1][1]);
    }
    const t = Math.max(0, Math.min(1, (target - segStart) / Math.max(1e-6, segLen)));
    out.push([pts[seg - 1][0] + (pts[seg][0] - pts[seg - 1][0]) * t, pts[seg - 1][1] + (pts[seg][1] - pts[seg - 1][1]) * t]);
  }
  return out;
}

/** One station's wall: its point on the outline, the outward direction, and along it the brow, the cliff's foot (the
 * caprock's base), the slope's foot and the talus's toe (metres from the point). */
interface Station {
  x: number;
  z: number;
  nx: number;
  nz: number;
  brow: number;
  browY: number;
  capBase: number;
  capBaseY: number;
  foot: number;
  footY: number;
  toe: number;
  u: number;
}

/** Build the outlier's wall skin and its talus blocks. */
export function buildGourSkin(spec: GourSkinSpec, ground: GourGround, noise: SimplexNoise, rng: Rng,
  { mobile = false }: GourSkinOptions = {}): {
    geometry: THREE.BufferGeometry | null; triangles: number; stations: number; blocks: number; rubble: number;
    /** the outline's traced length (m) and the caprock's mean thickness over the skinned stations (m) */
    outlineM: number; capM: number;
    /** the wall's rows above the two tucked into the talus: how many, and how many stand inside the rock */
    clearance: { rows: number; inside: number };
  } {
  const empty = { geometry: null, triangles: 0, stations: 0, blocks: 0, rubble: 0, outlineM: 0, capM: 0, clearance: { rows: 0, inside: 0 } };
  const weight = ground._mesaW;
  if (!weight) return empty;
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  // the wall read on both the exact ground and the metre grid the terrain mesh is drawn from, the higher of the two
  const rockAt = ground.getHeightAtFast
    ? (x: number, z: number) => Math.max(ground.getHeightAt(x, z), ground.getHeightAtFast!(x, z)) : (x: number, z: number) => ground.getHeightAt(x, z);
  const step = mobile ? 3.2 : 1.6, rows = mobile ? 9 : 16;
  const capTone = spec.capTone ?? [0.1, 0.16, 0.66];
  const beds = spec.beds?.length ? spec.beds : DAHAR_BEDS;
  const mesh = new SkinMesh();
  const salt = rng() * 100;
  const clearance = { rows: 0, inside: 0 };
  let stationsTotal = 0, blocks = 0, rubble = 0, outlineM = 0, capSum = 0;
  // the beds: thicknesses in metres, a slight dip across the outlier (the same beds on every face)
  const bedM = beds.map(() => 1.2 + rng() * 2.8);
  const bedSum = bedM.reduce((a, b) => a + b, 0);
  const dip = [(rng() - 0.5) * 0.02, (rng() - 0.5) * 0.02], bedPhase = rng() * bedSum;
  const bedAt = (x: number, y: number, z: number): number => {
    let v = ((y + x * dip[0] + z * dip[1] + bedPhase + noise.noise(x * 0.02 + salt, z * 0.02) * 0.6) % bedSum + bedSum) % bedSum;
    for (let b = 0; b < bedM.length; b++) { if (v < bedM[b]) return b; v -= bedM[b]; }
    return bedM.length - 1;
  };
  const chains = traceOutline(weight, spec, mobile ? 4 : 2);
  for (const chain of chains) {
    let len = 0;
    for (let i = 1; i < chain.length; i++) len += Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]);
    if (len < 40) continue;
    outlineM += len;
    const closed = chain[0][0] === chain[chain.length - 1][0] && chain[0][1] === chain[chain.length - 1][1];
    const pts = resample(chain, step);
    const n = pts.length;
    // ---- per station: the outward direction (down the weight), the brow, the caprock's base, the slope's foot, the toe
    const st: Array<Station | null> = [];
    for (let k = 0; k < n; k++) {
      const a = pts[closed ? (k - 1 + n - 1) % (n - 1) : Math.max(0, k - 1)], b = pts[closed ? (k + 1) % (n - 1) : Math.min(n - 1, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let nx = tz, nz = -tx;
      const [px, pz] = pts[k];
      if (weight(px + nx * 3, pz + nz * 3) > weight(px - nx * 3, pz - nz * 3)) { nx = -nx; nz = -nz; }
      const at = (r: number) => groundAt(px + nx * r, pz + nz * r);
      // from inside the cap outward: the brow where the cap's level breaks into the cliff; the cliff's foot where the fall
      // eases onto the slope; the slope's foot where it eases onto the talus; the toe where the talus meets the sand
      let brow = NaN, browY = 0, capBase = NaN, capBaseY = 0, foot = NaN, footY = 0, toe = NaN;
      for (let r = -40; r < 45; r += 0.5) {
        const y0 = at(r), y1 = at(r + 0.5), drop = y0 - y1;
        if (Number.isNaN(brow)) { if (drop > 0.55) { brow = r; browY = y0; } }
        else if (Number.isNaN(capBase)) { if (drop < 0.5) { capBase = r; capBaseY = y0; } }
        else if (Number.isNaN(foot)) { if (drop < 0.14) { foot = r; footY = y0; } }
        else if (drop < 0.03) { toe = r; break; }
      }
      if (Number.isFinite(foot) && browY - footY > 5 && browY - capBaseY > 1.5) {
        st.push({ x: px, z: pz, nx, nz, brow, browY, capBase, capBaseY, foot, footY, toe: Number.isFinite(toe) ? toe : foot + 12, u: k / Math.max(1, n - 1) });
      } else st.push(null);
    }
    // ---- the joints in the caprock (3 to 8 m apart) and the rills down the slope (6 to 14 m), by their own positions
    const runM = len;
    const joints: Array<{ at: number; width: number; depth: number }> = [];
    // (a joint's crack at least a station and a third across, so every joint meets a station)
    for (let s = rng() * 4; s < runM; s += 3 + rng() * 5) joints.push({ at: s / runM, width: Math.max(step * 1.3, 0.6 + rng() * 0.8) / runM, depth: 0.4 + rng() * 0.8 });
    const blockOf = (u: number): number => { let b = 0; while (b + 1 < joints.length && joints[b + 1].at <= u) b++; return b; };
    const blockSet = joints.map(() => ({ proud: 0.25 + rng() * 0.75, light: (rng() - 0.5) * 0.12, lean: (rng() - 0.5) * 0.4, fallen: rng() < 0.12 }));
    const rills: Array<{ at: number; width: number; depth: number; reach: number }> = [];
    for (let s = rng() * 8; s < runM; s += 6 + rng() * 8) rills.push({ at: s / runM, width: (1.0 + rng() * 2.2) / runM, depth: 0.5 + rng() * 1.2, reach: 0.5 + rng() * 0.5 });
    const wrapD = (u: number, at: number) => closed ? Math.abs(((u - at + 1.5) % 1) - 0.5) : Math.abs(u - at);

    /** The wall's distance along a station's ray at height y: its outermost rise through y, searched in from the toe. */
    const wallAt = (s: Station, y: number): number => {
      let prev = s.foot + 3;
      for (let r = s.foot + 3; r >= s.brow - 1; r -= 0.25) {
        const g = rockAt(s.x + s.nx * r, s.z + s.nz * r);
        if (g >= y) {
          const g0 = rockAt(s.x + s.nx * prev, s.z + s.nz * prev);
          return r + (prev - r) * Math.max(0, Math.min(1, (g - y) / Math.max(1e-6, g - g0)));
        }
        prev = r;
      }
      return s.brow;
    };

    // ---- the skin: rows from under the talus to the brow; the caprock's rows a block face, the slope's banded and rilled
    const grid: number[][] = [];
    for (let k = 0; k < n; k++) {
      const s = st[k];
      if (!s) { grid.push([]); continue; }
      stationsTotal++;
      capSum += s.browY - s.capBaseY;
      const yLow = s.footY - 0.5, yTop = s.browY - 0.15, ySplit = s.capBaseY;
      const block = blockSet[blockOf(s.u)] ?? { proud: 0.4, light: 0, lean: 0, fallen: false };
      const col: number[] = [];
      for (let i = 0; i < rows; i++) {
        // the rows share the caprock a third of them, the slope the rest
        const capRows = Math.max(3, Math.round(rows * 0.34));
        const y = i < rows - capRows
          ? yLow + (ySplit - yLow) * (i / (rows - capRows))
          : ySplit + (yTop - ySplit) * ((i - (rows - capRows)) / (capRows - 1));
        const inCap = y >= ySplit - 0.05;
        const t = (y - yLow) / Math.max(1, yTop - yLow);
        const rw = wallAt(s, y);
        let p: number;
        let l: number, h: number, sa: number;
        if (inCap) {
          // the caprock: the block's face proud of the cliff, leaning a little, the joints' cracks between blocks; a
          // fallen block leaves a fresh, paler scar set back into the cliff
          let crack = 0;
          for (const j of joints) { const d = wrapD(s.u, j.at) / j.width; if (d < 1) crack = Math.max(crack, j.depth * (1 - d)); }
          const tc = (y - ySplit) / Math.max(0.5, yTop - ySplit);
          p = (block.fallen ? 0.18 : block.proud) + block.lean * (tc - 0.5) - crack;
          // the cornice: the top course a hand proud; the base course tucked toward the notch
          p += 0.25 * smooth(0.8, 1, tc) - 0.2 * (1 - smooth(0, 0.25, tc));
          p = Math.max(0.18, p);
          const mott = noise.noise3d(s.x * 0.31 + salt, y * 0.31, s.z * 0.31);
          h = capTone[0] + 0.006 * mott; sa = capTone[1] * (1 + 0.15 * mott);
          l = capTone[2] * (1 + block.light + 0.05 * mott) * (1 - 0.35 * Math.min(1, crack / 0.6));
          // weathering: grey streaks down the face from the cap's edge (lichen and dust, not a desert varnish), sparse
          const streak = smooth(0.62, 0.86, noise.noise(s.u * runM * 0.37 + salt, 4.4) * 0.5 + 0.5) * smooth(0.1, 0.9, tc);
          l *= 1 - 0.16 * streak; sa *= 1 - 0.4 * streak;
          if (block.fallen) { l *= 1.08; sa *= 1.1; }
        } else {
          // the slope: the notch under the caprock, the rills, the beds' bands; tucked into the talus at the foot
          let cut = 0, inRill = 0;
          for (const r of rills) {
            const d = wrapD(s.u, r.at) / r.width;
            const ts = t / Math.max(0.05, (ySplit - yLow) / Math.max(1, yTop - yLow));
            if (d < 1 && ts > 1 - r.reach) {
              const v = r.depth * (1 - d * d) * smooth(1 - r.reach, 1 - r.reach + 0.2, ts);
              if (v > cut) { cut = v; inRill = 1 - d; }
            }
          }
          const below = (ySplit - y) / Math.max(1, ySplit - yLow);
          const notch = 1 - smooth(0, 0.12, below);
          p = 0.3 + 0.35 * (noise.noise(s.u * runM * 0.11 + salt, y * 0.15) * 0.5 + 0.5) - cut - 0.25 * notch;
          p = Math.max(0.16, p) * (0.35 + 0.65 * smooth(0, 0.14, t));
          p = Math.max(0.14, p);
          const bed = beds[bedAt(s.x, y, s.z)];
          const mott = noise.noise3d(s.x * 0.23 + salt, y * 0.23, s.z * 0.23);
          h = bed[0] + 0.006 * mott; sa = bed[1] * (1 + 0.1 * mott); l = bed[2] * (1 + 0.06 * mott);
          // the notch's shade, the rills' shade, the sand washed down over the foot
          l *= 1 - 0.3 * notch - 0.18 * inRill;
          const dust = 1 - smooth(0, 0.22, t);
          h += (0.09 - h) * dust * 0.7; sa += (0.45 - sa) * dust * 0.6; l += (0.56 - l) * dust * 0.6;
        }
        let r = rw + p;
        // (the talus and the sand sheet's folds are not monotonic along a ray: a row that lands under a fold steps out
        // along it until it clears the ground, and failing that rides up onto it)
        let yy = y;
        if (!inCap) {
          for (let extra = 0; extra < 2.5 && y < rockAt(s.x + s.nx * r, s.z + s.nz * r) + 0.1; extra += 0.25) r += 0.25;
          yy = Math.max(y, rockAt(s.x + s.nx * r, s.z + s.nz * r) + 0.1);
        }
        const pt: V3 = [s.x + s.nx * r, yy, s.z + s.nz * r];
        if (i >= 2) { clearance.rows++; if (pt[1] < rockAt(pt[0], pt[2]) - 0.15) clearance.inside++; }
        col.push(mesh.vert(pt, hsl(h, sa, l), groundAt(pt[0], pt[2])));
      }
      grid.push(col);
    }
    for (let k = 0; k + 1 < n; k++) {
      const a = grid[k], b = grid[k + 1];
      if (!a.length || !b.length) continue;
      const sk = st[k]!, out: V3 = [sk.nx, 0, sk.nz];
      for (let i = 0; i + 1 < rows; i++) {
        mesh.tri(a[i], b[i], b[i + 1], out);
        mesh.tri(a[i], b[i + 1], a[i + 1], out);
      }
    }
    blocks += joints.length;

    // ---- the fallen caprock on the talus: blocks thickest under the cliff, most of them small, the larger far out
    const count = Math.round(runM / (mobile ? 14 : 5));
    for (let q = 0; q < count; q++) {
      const s = st[Math.floor(rng() * n)];
      if (!s) continue;
      const v = rng();
      const r = s.foot + 0.8 + (s.toe - s.foot + 6) * v * v;
      const cx = s.x + s.nx * r + (rng() - 0.5) * step, cz = s.z + s.nz * r + (rng() - 0.5) * step;
      const size = 0.35 + 2.1 * Math.pow(rng(), 2.4);
      const gy = groundAt(cx, cz);
      const sx = size * (0.8 + rng() * 0.6), sy = size * (0.45 + rng() * 0.4), sz = size * (0.8 + rng() * 0.6);
      const yaw = rng() * Math.PI * 2, cy = Math.cos(yaw), syw = Math.sin(yaw);
      const corner = (ix: number, iy: number, iz: number): V3 => {
        const lx = ix * sx * (0.75 + rng() * 0.5) * 0.5, ly = iy * sy * 0.5, lz = iz * sz * (0.75 + rng() * 0.5) * 0.5;
        return [cx + lx * cy - lz * syw, gy + sy * 0.25 + ly, cz + lx * syw + lz * cy];
      };
      const cr = hsl(capTone[0] + (rng() - 0.5) * 0.012, capTone[1] * 0.9, capTone[2] * (0.82 + rng() * 0.2));
      const vs = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)]
        .map((pp) => mesh.vert(pp, cr, gy));
      const faces: Array<[number[], V3]> = [[[4, 5, 6, 7], [0, 1, 0]], [[0, 1, 5, 4], [0, 0, -1]], [[1, 2, 6, 5], [1, 0, 0]], [[2, 3, 7, 6], [0, 0, 1]], [[3, 0, 4, 7], [-1, 0, 0]]];
      for (const [f, o] of faces) mesh.poly(f.map((i) => vs[i]), [o[0] * cy - o[2] * syw, o[1], o[0] * syw + o[2] * cy]);
      rubble++;
    }
  }
  if (!mesh.idx.length) return { ...empty, outlineM, clearance };
  return { geometry: finishSkin(mesh, 46), triangles: mesh.idx.length / 3, stations: stationsTotal, blocks, rubble, outlineM,
    capM: stationsTotal ? capSum / stationsTotal : 0, clearance };
}
