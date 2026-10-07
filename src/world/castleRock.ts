// src/world/castleRock.ts — a tuff castle rock over a map's knoll (the map-revival lane, 2026-10-07, Chimney Valley
// round 3; gauntlet wave 206: "smooth, symmetrical truncated cones" with "a regular sawtooth crown", "flat pure-black
// planes with zero interior depth", "an obviously flat dot-grid decal").
//
// Uçhisar's and Ortahisar's castles are tuff pinnacles the weather left standing and the villagers hollowed into rooms:
// an irregular mass of lobes and buttresses parted by clefts, its faces fluted by the rain and honeycombed where the
// soft beds weathered out in pockets, a few harder beds standing a hand proud, a broken crown with stumps of the cap
// rock, and everywhere the rooms: doors and windows cut back into the rock with square jambs and a sill, a room behind
// each, the bigger ones open where their front fell away; high up the dovecotes, rows of small pigeon holes inside a
// whitewashed band with a red-ochre trim; and where a road met the rock a passage cut through its foot.
//
// The knoll stays the battlefield's rock: the hulls and shells meet the terrain. This is its skin: rings of the knoll's
// own contours, read on rays from its summit, pushed out from the wall by a field of lobes, clefts, flutes and beds,
// hugging the terrain where a hull can reach (so a hull touching the rock touches what it sees) and tucked under the
// ground at its foot; a crown sheet over the cap; pinnacles over the brow. The openings are cut in the skin's cells:
// the cell's face round a hole, the hole's jambs back into the rock, then a room (its sides, floor and back wall a
// dark warm grey, never black) inside the push, which is always deeper than the room. Welded vertex-coloured geometry
// in the scenery rock family (sceneryRocks.ts finish's attribute set: the props rock material's triplanar stone, its
// grime and the map's dust), drawn with the formations. Deterministic: only the stream it is handed and the shared
// noise; no wall clock, no Math.random. Renderer-free apart from three's geometry types.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';

type Rng = () => number;

export interface CastleGround {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
}

/** One castle rock: the knoll it skins and what is cut into it. */
export interface CastleRockSpec {
  x: number;
  z: number;
  /** The knoll's radii (the rays search 1.5 x the larger). */
  rx: number;
  rz: number;
  /** Passages cut through the foot: their mouths' bearings (radians from +x toward +z). */
  gates?: readonly number[];
  /** Pinnacles over the crown (default 2). */
  towers?: number;
  /** How many rooms, as a share of the default (1). */
  rooms?: number;
  /** sRGB HSL base tone of the tuff. */
  tone?: readonly [number, number, number];
}

/** A standing mass a hull and a shell meet (a gate's buttress, proud of the knoll's wall). */
interface CastleMass {
  points: number[];
  y0: number;
  y1: number;
}

export interface CastleRockBuild {
  geometry: THREE.BufferGeometry | null;
  masses: CastleMass[];
  triangles: number;
  /** Doors, windows, rooms and pigeon holes cut. */
  openings: number;
  /** Every room cut (not the pigeon holes): its kind, its hole's width and height and its depth behind the face (m). */
  rooms: Array<{ kind: 'door' | 'window' | 'room' | 'gate'; w: number; h: number; depth: number }>;
}

interface CastleBuildOptions {
  mobile?: boolean;
}

const STEP = 0.5;          // the ray profiles' step (m)
const MIN_GRADE = 0.9;     // the steepest ground a hull climbs (rise over run)
const RIM_GRADE = 1.0;     // the cap ends where the ground first falls steeper than this
const PUSH_BASE = 1.7;     // the skin's least stand-off over the upper wall (m): every room fits inside it
const ROOM_CLEAR = 0.18;   // a room's back wall keeps this clear of the terrain behind it

/** The interior's tones (linear): a cut room in shade, dark warm grey with the dust of its floor. */
const ROOM_BACK: readonly [number, number, number] = [0.032, 0.027, 0.023];
const ROOM_SIDE: readonly [number, number, number] = [0.05, 0.042, 0.035];
const ROOM_FLOOR: readonly [number, number, number] = [0.085, 0.071, 0.056];
const LIME: readonly [number, number, number] = [0.74, 0.72, 0.66];
const OCHRE: readonly [number, number, number] = [0.36, 0.12, 0.06];

const _c = new THREE.Color();
export function hsl(h: number, s: number, l: number): [number, number, number] {
  _c.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace);
  return [_c.r, _c.g, _c.b];
}
function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smooth(a: number, b: number, x: number): number { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dt = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The tuff's beds as the map's chimneys and castles share them: bands a metre or two thick by the world height (so a
 * bed runs on from rock to rock across the valley), cream, rose and grey-white, wavering a little along the run.
 * Returns [rose, white] weights in [0, 1].
 */
export function tuffBands(x: number, y: number, z: number, noise: SimplexNoise): [number, number] {
  const wob = noise.noise(x * 0.013 + 3.7, z * 0.013 - 1.9) * 0.9 + noise.noise(x * 0.061, z * 0.061 + 5.3) * 0.25;
  const yy = y + wob;
  const band = Math.sin(yy * 1.85 + 0.6) + 0.55 * Math.sin(yy * 0.69 + 2.1) + 0.3 * Math.sin(yy * 4.1 + 1.3);
  return [smooth(0.55, 1.35, band), smooth(0.65, 1.4, -band)];
}

/** An indexed mesh under construction: welded positions, per-vertex colour and ground, triangles. */
export class SkinMesh {
  pos: number[] = [];
  col: number[] = [];
  gr: number[] = [];
  idx: number[] = [];
  vert(p: V3, c: readonly [number, number, number], ground: number): number {
    this.pos.push(p[0], p[1], p[2]);
    this.col.push(c[0], c[1], c[2]);
    this.gr.push(ground);
    return this.pos.length / 3 - 1;
  }
  at(v: number): V3 { return [this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]]; }
  /** A triangle, wound so its normal faces `out` (a reference direction). */
  tri(a: number, b: number, c: number, out: V3): void {
    const n = crs(sub(this.at(b), this.at(a)), sub(this.at(c), this.at(a)));
    if (dt(n, out) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  /** A convex polygon fan, wound to face `out`. */
  poly(vs: readonly number[], out: V3): void { for (let i = 1; i + 1 < vs.length; i++) this.tri(vs[0], vs[i], vs[i + 1], out); }
}

/**
 * Non-indexed output with crease-aware normals: a corner's normal averages the faces round its welded vertex within
 * the crease angle (the skin's lobes and flutes smooth, a jamb against the face round it crisp). The attribute set of
 * the scenery rock family: position, normal, colour, aRockGround and a world-planar uv.
 */
export function finishSkin(mesh: SkinMesh, creaseDeg: number): THREE.BufferGeometry {
  const p = mesh.pos, idx = mesh.idx, vertexCount = p.length / 3, faceCount = idx.length / 3;
  const cosC = Math.cos(THREE.MathUtils.degToRad(creaseDeg));
  const fn = new Float32Array(faceCount * 3), area = new Float32Array(faceCount);
  const degree = new Int32Array(vertexCount + 1);
  for (let f = 0; f < faceCount; f++) {
    const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1e-9;
    fn[f * 3] = nx / len; fn[f * 3 + 1] = ny / len; fn[f * 3 + 2] = nz / len; area[f] = len;
    degree[a + 1]++; degree[b + 1]++; degree[c + 1]++;
  }
  for (let v = 0; v < vertexCount; v++) degree[v + 1] += degree[v];
  const fill = degree.slice(0, vertexCount);
  const faces = new Int32Array(faceCount * 3);
  for (let f = 0; f < faceCount; f++) for (let k = 0; k < 3; k++) { const v = idx[f * 3 + k]; faces[fill[v]++] = f; }
  const corners = faceCount * 3;
  const pos = new Float32Array(corners * 3), nor = new Float32Array(corners * 3), col = new Float32Array(corners * 3);
  const gr = new Float32Array(corners), uvs = new Float32Array(corners * 2);
  let out = 0;
  for (let f = 0; f < faceCount; f++) {
    const fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      let sx = 0, sy = 0, sz = 0;
      for (let i = degree[v]; i < degree[v + 1]; i++) {
        const o = faces[i];
        const gx = fn[o * 3], gy = fn[o * 3 + 1], gz = fn[o * 3 + 2];
        if (gx * fx + gy * fy + gz * fz < cosC) continue;
        const w = Math.min(area[o], 4);
        sx += gx * w; sy += gy * w; sz += gz * w;
      }
      const nl = Math.hypot(sx, sy, sz);
      pos[out * 3] = p[v * 3]; pos[out * 3 + 1] = p[v * 3 + 1]; pos[out * 3 + 2] = p[v * 3 + 2];
      if (nl > 1e-9) { nor[out * 3] = sx / nl; nor[out * 3 + 1] = sy / nl; nor[out * 3 + 2] = sz / nl; } else { nor[out * 3] = fx; nor[out * 3 + 1] = fy; nor[out * 3 + 2] = fz; }
      col[out * 3] = mesh.col[v * 3]; col[out * 3 + 1] = mesh.col[v * 3 + 1]; col[out * 3 + 2] = mesh.col[v * 3 + 2];
      gr[out] = mesh.gr[v];
      uvs[out * 2] = p[v * 3] * 0.37 + p[v * 3 + 1] * 0.21; uvs[out * 2 + 1] = p[v * 3 + 2] * 0.37 - p[v * 3 + 1] * 0.17;
      out++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRockGround', new THREE.BufferAttribute(gr, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** A hole's outline in a block's local metres (u along the face, v up from the block's foot), counter-clockwise. */
function holeOutline(cx: number, v0: number, w: number, h: number, arch: boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [[cx - w / 2, v0], [cx + w / 2, v0]];
  if (arch) {
    const r = w / 2, spring = v0 + Math.max(0.2, h - r);
    out.push([cx + w / 2, spring]);
    for (let k = 1; k < 6; k++) { const a = (k / 6) * Math.PI; out.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]); }
    out.push([cx - w / 2, spring]);
  } else {
    out.push([cx + w / 2, v0 + h], [cx - w / 2, v0 + h]);
  }
  return out;
}

/**
 * Build a castle rock's skin over the knoll at (x, z). `ground` is the battlefield's height field (the knoll included);
 * `noise` the shared field; `rng` the castle's own stream.
 */
export function buildCastleRock(spec: CastleRockSpec, ground: CastleGround, noise: SimplexNoise, rng: Rng,
  { mobile = false }: CastleBuildOptions = {}): CastleRockBuild {
  const groundAt = ground.getHeightAtFast ? (x: number, z: number) => ground.getHeightAtFast!(x, z) : (x: number, z: number) => ground.getHeightAt(x, z);
  // (a room's fit reads both the exact ground and the baked metre grid the terrain's mesh is drawn from: on a wall the
  // grid's bilinear facets stand up to a metre off the exact surface, and the room must clear whichever stands out)
  const solidAt = (x: number, z: number) => Math.max(ground.getHeightAt(x, z), groundAt(x, z));
  const reach = Math.max(spec.rx, spec.rz) * 1.5;
  const rays = mobile ? 72 : 132;
  const rings = mobile ? 11 : 19;
  const steps = Math.ceil(reach / STEP), stride = steps + 1;
  const H = new Float32Array(rays * stride);
  for (let j = 0; j < rays; j++) {
    const a = (j / rays) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k <= steps; k++) H[j * stride + k] = groundAt(spec.x + c * k * STEP, spec.z + s * k * STEP);
  }
  // per ray: the crest, the rim (the cap's edge: the first fall steeper than RIM_GRADE out from the crest), the climb
  // (the highest ground a hull reaches from outside: the outermost point steeper than MIN_GRADE)
  const peak = new Int32Array(rays), rimY = new Float32Array(rays), climbY = new Float32Array(rays);
  let top = -Infinity, summitX = spec.x, summitZ = spec.z, base = Infinity;
  for (let j = 0; j < rays; j++) {
    const row = j * stride;
    let best = 0;
    for (let k = 1; k <= steps * 0.45; k++) if (H[row + k] > H[row + best]) best = k;
    peak[j] = best;
    if (H[row + best] > top) {
      top = H[row + best];
      const a = (j / rays) * Math.PI * 2;
      summitX = spec.x + Math.cos(a) * best * STEP; summitZ = spec.z + Math.sin(a) * best * STEP;
    }
    base = Math.min(base, H[row + steps]);
    rimY[j] = NaN;
    for (let k = best + 1; k < steps; k++) {
      if ((H[row + k - 1] - H[row + k + 1]) / (2 * STEP) > RIM_GRADE) { rimY[j] = H[row + k - 1]; break; }
    }
    climbY[j] = NaN;
    for (let k = steps - 1; k > best; k--) {
      if ((H[row + k - 1] - H[row + k + 1]) / (2 * STEP) > MIN_GRADE) { climbY[j] = H[row + k]; break; }
    }
  }
  const okRays = [...rimY].filter(Number.isFinite).length;
  if (okRays < rays * 0.6 || !(top - base > 6)) return { geometry: null, masses: [], triangles: 0, openings: 0, rooms: [] };
  // fill a ray with no wall (a saddle, a fan) from its neighbours, then smooth both lines round the rock: the skin's
  // foot and brow run on as lines, not as each ray's own step
  const fillRound = (v: Float32Array, fallback: number) => {
    const known = Float32Array.from(v);
    for (let j = 0; j < rays; j++) {
      if (Number.isFinite(known[j])) continue;
      let a = 1, b = 1;
      while (a < rays && !Number.isFinite(known[(j - a + rays) % rays])) a++;
      while (b < rays && !Number.isFinite(known[(j + b) % rays])) b++;
      const va = known[(j - a + rays) % rays], vb = known[(j + b) % rays];
      v[j] = Number.isFinite(va) && Number.isFinite(vb) ? (va * b + vb * a) / (a + b) : fallback;
    }
    const sm = new Float32Array(rays);
    for (let j = 0; j < rays; j++) { let s = 0; for (let d = -3; d <= 3; d++) s += v[(j + d + rays) % rays]; sm[j] = s / 7; }
    v.set(sm);
  };
  fillRound(rimY, top - 1);
  fillRound(climbY, base + (top - base) * 0.25);
  /** The first radius on ray j, out from its crest, where the ground falls below y (NaN: none in reach). */
  const edge = (j: number, y: number): number => {
    const row = j * stride;
    let k = peak[j];
    if (H[row + k] < y) return NaN;
    for (k++; k <= steps; k++) {
      if (H[row + k] < y) {
        const h0 = H[row + k - 1], h1 = H[row + k];
        return (k - 1 + (h0 - y) / Math.max(1e-6, h0 - h1)) * STEP;
      }
    }
    return NaN;
  };
  const rayAngle = (j: number) => (j / rays) * Math.PI * 2;
  const rRefSum = (() => { let s = 0, n = 0; for (let j = 0; j < rays; j += 4) { const r = edge(j, (climbY[j] + rimY[j]) / 2); if (Number.isFinite(r)) { s += r; n++; } } return n ? s / n : Math.max(spec.rx, spec.rz) * 0.7; })();
  const rRef = Math.max(6, rRefSum);
  const wallH = top - base;

  // ---- the push field: lobes and buttresses, clefts, the rain's flutes, the hard beds
  const salt = rng() * 100;
  const fissures: Array<{ a: number; w: number; wander: number; depth: number }> = [];
  const fissureCount = 3 + Math.floor(rng() * 3);
  for (let f = 0; f < fissureCount; f++) fissures.push({ a: rng() * Math.PI * 2, w: 0.9 + rng() * 1.3, wander: (rng() - 0.5) * 2.4, depth: 0.7 + rng() * 0.3 });
  const beds: Array<{ y: number; t: number; proud: number }> = [];
  for (let k = 0, y = base + wallH * (0.3 + rng() * 0.08); k < 5 && y < top - 2; k++) {
    const t = 0.7 + rng() * 0.9;
    if (rng() < 0.7) beds.push({ y, t, proud: 0.18 + rng() * 0.26 });
    y += t + 2.2 + rng() * 3.4;
  }
  const lambda = 3.4 + rng() * 1.4;
  const gates = (spec.gates ?? []).map((g) => ((g % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
  const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
  /** The gate's buttress at a bearing and height: 0 off it, 1 at its heart. */
  const gateBump = (a: number, y: number, j: number): number => {
    let best = 0;
    for (const g of gates) {
      const across = angDiff(a, g) * rRef;
      const w = 1 - smooth(4.2, 8.5, across);
      if (w <= 0) continue;
      const up = 1 - smooth(climbY[j] + 6.5, climbY[j] + 11, y);
      best = Math.max(best, w * up);
    }
    return best;
  };
  const runnel = (a: number, y: number): number => {
    const arc = a * rRef;
    const phase = arc / lambda + noise.noise(Math.cos(a) * 1.7 + salt, y * 0.035) * 1.1 + noise.noise(Math.cos(a) * 4.1 - salt, Math.sin(a) * 4.1 + y * 0.02) * 0.35;
    return Math.pow(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), 5);
  };
  const lobe = (a: number, y: number): number => {
    const n = noise.noise(Math.cos(a) * 1.25 + salt, Math.sin(a) * 1.25 + y * 0.022) * 0.7
      + noise.noise(Math.cos(a) * 2.9 - salt, Math.sin(a) * 2.9 - y * 0.05) * 0.3;
    return smooth(-0.35, 0.75, n);
  };
  const fissureAt = (a: number, y: number): number => {
    let best = 0;
    for (const f of fissures) {
      const fa = f.a + (f.wander * (y - base) / Math.max(4, wallH)) / rRef;
      const across = angDiff(a, fa) * rRef;
      best = Math.max(best, f.depth * (1 - smooth(f.w * 0.35, f.w, across)));
    }
    return best;
  };
  const bedAt = (y: number): number => {
    let s = 0;
    for (const b of beds) s += b.proud * smooth(b.y - 0.15, b.y + 0.12, y) * (1 - smooth(b.y + b.t - 0.12, b.y + b.t + 0.15, y));
    return s;
  };
  /** The skin's stand-off from the wall (m) at ray j, height y; and its parts for the colour. */
  const pushAt = (j: number, y: number): { p: number; cleft: number; flute: number; gate: number } => {
    const a = rayAngle(j);
    const hug = smooth(climbY[j] + 0.4, climbY[j] + 3.2, y);
    const gate = gateBump(a, y, j);
    let p = PUSH_BASE + 1.9 * lobe(a, y);
    const cleft = fissureAt(a, y);
    p -= cleft * (p - 0.12);
    const flute = runnel(a, y) * (0.45 + 0.55 * (1 - smooth(base, top, y)));
    p -= 0.34 * flute;
    p += bedAt(y);
    p = Math.max(0.12, p);
    p = Math.max(p * hug, gate * 5.0);
    return { p, cleft, flute, gate };
  };

  // ---- the rings
  const tuff = spec.tone ?? [0.088, 0.2, 0.74];
  const colourAt = (pt: V3, n: V3, push: number, cleft: number, flute: number, yFoot: number): [number, number, number] => {
    const [rose, white] = tuffBands(pt[0], pt[1], pt[2], noise);
    const mott = noise.noise3d(pt[0] * 0.21 + salt, pt[1] * 0.21, pt[2] * 0.21 - salt);
    let h = tuff[0] - 0.025 * rose, s = tuff[1] + 0.06 * rose - 0.06 * white, l = tuff[2] * (1 + 0.06 * white - 0.045 * rose);
    l *= 0.93 + 0.07 * mott;
    // the weather's occlusion: a cleft, a flute's groove, a recess darker than the face round it
    l *= 1 - 0.2 * cleft - 0.08 * flute - 0.12 * (1 - smooth(0.2, 1.2, push));
    // the crown and the brows paler, the underside of a bed and the foot's dust a shade warmer and darker
    l *= 1 + 0.06 * Math.max(0, n[1]);
    l *= 0.9 + 0.1 * smooth(yFoot, yFoot + 3, pt[1]);
    return hsl(h, s, l);
  };
  const mesh = new SkinMesh();
  const grid = new Int32Array(rays * rings);
  const gridP: V3[] = new Array(rays * rings);
  const gridPush = new Float32Array(rays * rings);
  // the brow: the mass stands on up to four metres over the knoll's cap in broad stretches and breaks off in others, so
  // no stretch of the skyline runs level (wave 206: "a regular sawtooth crown"; the skin's own brow, not the cap's)
  const browSalt = rng() * 40;
  const brow = new Float32Array(rays);
  for (let j = 0; j < rays; j++) {
    const a = rayAngle(j);
    const n1 = noise.noise(Math.cos(a) * 1.55 + browSalt, Math.sin(a) * 1.55 - browSalt);
    const n2 = noise.noise(Math.cos(a) * 4.2 - browSalt, Math.sin(a) * 4.2 + browSalt * 0.5);
    brow[j] = 4.2 * smooth(-0.15, 0.85, n1) + 0.9 * n2;
  }
  const ringY = (j: number, i: number): number => {
    const y0 = climbY[j] + 0.5, y1 = rimY[j] - 0.15 + Math.max(0, brow[j]);
    const span = Math.max(3, y1 - y0);
    return y0 + span * (i / (rings - 1));
  };
  for (let j = 0; j < rays; j++) {
    const a = rayAngle(j), c = Math.cos(a), s = Math.sin(a);
    let lastR = NaN;
    for (let i = 0; i < rings; i++) {
      let y = ringY(j, i);
      let rt = edge(j, y);
      // over the cap the brow stands on as a parapet of rock, thinning a little as it rises
      if (!Number.isFinite(rt)) rt = Number.isFinite(lastR) ? lastR - 0.12 * Math.max(0, y - rimY[j]) : rRef;
      else lastR = rt;
      const { p, cleft, flute, gate } = pushAt(j, y);
      let r = rt + p;
      if (i === 0) {
        // the foot: tucked under the ground where it stands (out on the talus under a gate's buttress)
        r = rt + Math.max(p, 0) - (gate > 0 ? 0 : 0.35);
        y = groundAt(spec.x + c * r, spec.z + s * r) - 0.4;
      }
      const pt: V3 = [spec.x + c * r, y, spec.z + s * r];
      gridP[j * rings + i] = pt;
      gridPush[j * rings + i] = i === 0 ? 0 : p;
      const col = colourAt(pt, [c, 0.15, s], i === 0 ? 0.3 : p, cleft, flute, climbY[j]);
      grid[j * rings + i] = mesh.vert(pt, col, groundAt(pt[0], pt[2]));
    }
  }
  const G = (j: number, i: number) => grid[((j % rays) + rays) % rays * rings + i];
  const GP = (j: number, i: number) => gridP[((j % rays) + rays) % rays * rings + i];
  const GPush = (j: number, i: number) => gridPush[((j % rays) + rays) % rays * rings + i];
  const outward = (j: number): V3 => { const a = rayAngle(j + 0.5); return [Math.cos(a), 0.05, Math.sin(a)]; };

  // ---- the plan of the cells: rooms, dovecotes, the gate mouth, the honeycomb; the rest plain
  // a cell (j, i) spans rays j..j+1 and rings i..i+1; a block is cols x rows cells
  const used = new Uint8Array(rays * rings);
  const isFree = (j0: number, i0: number, cols: number, rows: number): boolean => {
    if (i0 < 1 || i0 + rows > rings - 1) return false;
    for (let dj = -1; dj <= cols; dj++) for (let di = 0; di < rows; di++) if (used[(((j0 + dj) % rays) + rays) % rays * rings + i0 + di]) return false;
    return true;
  };
  const take = (j0: number, i0: number, cols: number, rows: number) => {
    for (let dj = 0; dj < cols; dj++) for (let di = 0; di < rows; di++) used[(((j0 + dj) % rays) + rays) % rays * rings + i0 + di] = 1;
  };
  /** The least push over a block's corners (its room's depth budget). */
  const blockPush = (j0: number, i0: number, cols: number, rows: number): number => {
    let m = Infinity;
    for (let dj = 0; dj <= cols; dj++) for (let di = 0; di <= rows; di++) m = Math.min(m, GPush(j0 + dj, i0 + di));
    return m;
  };
  type Block = { j0: number; i0: number; cols: number; rows: number; kind: 'door' | 'window' | 'room' | 'gate' | 'dove' };
  const blocks: Block[] = [];
  // the gate mouths first: a 4-wide, 4-high block on the bearing, from the second ring up
  for (const g of gates) {
    const jc = Math.round((g / (Math.PI * 2)) * rays);
    const cols = Math.max(3, Math.round(5.6 / ((Math.PI * 2 * rRef) / rays)));
    const j0 = jc - Math.floor(cols / 2);
    let rows = 1, hgt = 0;
    while (rows < rings - 3 && hgt < 5.4) { hgt = ringY(j0, 1 + rows) - ringY(j0, 1); rows++; }
    if (isFree(j0, 1, cols, rows)) { take(j0, 1, cols, rows); blocks.push({ j0, i0: 1, cols, rows, kind: 'gate' }); }
  }
  const cellW = (Math.PI * 2 * rRef) / rays;
  const cellH = (j: number) => ringY(j, 2) - ringY(j, 1);
  const roomsK = spec.rooms ?? 1;
  // the tiers: doors on the first rings above the reach of a hull, then windows and rooms, the dovecotes high
  const doorCols = Math.max(1, Math.round(1.9 / cellW)), doorRows = Math.max(2, Math.round(2.6 / Math.max(0.6, cellH(0))));
  const tierRows: number[] = [];
  for (let i = 3; i < rings - 3; i += Math.max(2, Math.round(3.2 / Math.max(0.6, cellH(0))))) tierRows.push(i);
  let openings = 0;
  const rooms: CastleRockBuild['rooms'] = [];
  // the rooms crowd the lived-in faces (two or three of them round the rock) and thin out between
  const clusterSalt = rng() * 50;
  const lived = (j: number): number => {
    const a = rayAngle(j);
    return smooth(-0.25, 0.55, noise.noise(Math.cos(a) * 1.35 + clusterSalt, Math.sin(a) * 1.35 - clusterSalt));
  };
  for (const [t, i0] of tierRows.entries()) {
    const door = t === 0;
    const cols = door ? doorCols : Math.max(1, Math.round(1.1 / cellW));
    const rows = door ? doorRows : Math.max(1, Math.round(1.25 / Math.max(0.6, cellH(0))));
    const want = Math.round((rays / (cols + 2)) * (door ? 0.3 : 0.3) * roomsK);
    let placed = 0;
    for (let attempt = 0; attempt < want * 6 && placed < want; attempt++) {
      const j0 = Math.floor(rng() * rays);
      const big = !door && rng() < 0.12;
      const c2 = big ? cols + 2 : cols, r2 = big ? rows + 1 : rows;
      if (rng() > 0.2 + 0.8 * lived(j0)) continue;
      if (!isFree(j0, i0, c2, r2)) continue;
      if (blockPush(j0, i0, c2, r2) < 1.0 + ROOM_CLEAR) continue;
      take(j0, i0, c2, r2);
      blocks.push({ j0, i0, cols: c2, rows: r2, kind: door ? 'door' : big ? 'room' : 'window' });
      placed++;
    }
  }
  // the dovecotes: a whitewashed band of pigeon holes over three to five cells, high on the rock
  const doves = mobile ? 1 : 2 + Math.floor(rng() * 2);
  for (let d = 0, attempt = 0; d < doves && attempt < 40; attempt++) {
    const i0 = Math.round((rings - 1) * (0.62 + rng() * 0.2));
    const j0 = Math.floor(rng() * rays), cols = 3 + Math.floor(rng() * 3);
    if (!isFree(j0, i0, cols, 1) || blockPush(j0, i0, cols, 1) < 0.5) continue;
    take(j0, i0, cols, 1);
    blocks.push({ j0, i0, cols, rows: 1, kind: 'dove' });
    d++;
  }

  // ---- emit the plain cells and the honeycomb
  const cellNormal = (j: number, i: number): V3 => nrm(crs(sub(GP(j, i + 1), GP(j, i)), sub(GP(j + 1, i), GP(j, i))));
  for (let j = 0; j < rays; j++) {
    for (let i = 0; i < rings - 1; i++) {
      if (used[j * rings + i]) continue;
      const bl = G(j, i), br = G(j + 1, i), tr = G(j + 1, i + 1), tl = G(j, i + 1);
      const out = outward(j);
      // a pocket the weather hollowed: the cell's middle sunk toward the rock, darker (upper wall, where it stands off)
      const pocketChance = mobile ? 0 : 0.07 * smooth(0.18, 0.55, i / (rings - 1));
      const room = Math.min(GPush(j, i), GPush(j + 1, i), GPush(j, i + 1), GPush(j + 1, i + 1));
      if (i > 0 && room > 0.55 && rng() < pocketChance) {
        const n = cellNormal(j, i);
        const ctr = scl(add(add(GP(j, i), GP(j + 1, i)), add(GP(j, i + 1), GP(j + 1, i + 1))), 0.25);
        const depth = Math.min(room - 0.2, 0.16 + rng() * 0.18);
        const cp = sub(ctr, scl(n, depth));
        const base4 = [bl, br, tr, tl].map((v) => mesh.col.slice(v * 3, v * 3 + 3));
        const cc: [number, number, number] = [0, 1, 2].map((k) => (base4[0][k] + base4[1][k] + base4[2][k] + base4[3][k]) * 0.25 * 0.62) as [number, number, number];
        const cv = mesh.vert(cp, cc, groundAt(cp[0], cp[2]));
        mesh.tri(bl, tl, cv, out); mesh.tri(tl, tr, cv, out); mesh.tri(tr, br, cv, out); mesh.tri(br, bl, cv, out);
        continue;
      }
      mesh.tri(bl, tl, tr, out);
      mesh.tri(bl, tr, br, out);
    }
  }

  // ---- the blocks: each a face round its hole(s), the hole's jambs, the room behind
  /** A block's local frame: corner grid points; (u, v) metres -> world on the skin by bilinear cells. */
  const emitBlock = (b: Block) => {
    const { j0, i0, cols, rows } = b;
    // the block's own metres: u along its foot ring, v up its first ray
    const uAt: number[] = [0];
    for (let dj = 1; dj <= cols; dj++) { const p0 = GP(j0 + dj - 1, i0), p1 = GP(j0 + dj, i0); uAt.push(uAt[dj - 1] + Math.hypot(p1[0] - p0[0], p1[2] - p0[2])); }
    const vAt: number[] = [0];
    for (let di = 1; di <= rows; di++) vAt.push(vAt[di - 1] + (GP(j0, i0 + di)[1] - GP(j0, i0 + di - 1)[1]));
    const W = uAt[cols], Hh = vAt[rows];
    const surf = (u: number, v: number): V3 => {
      let dj = 0; while (dj < cols - 1 && u > uAt[dj + 1]) dj++;
      let di = 0; while (di < rows - 1 && v > vAt[di + 1]) di++;
      const fu = clamp((u - uAt[dj]) / Math.max(1e-6, uAt[dj + 1] - uAt[dj]), 0, 1);
      const fv = clamp((v - vAt[di]) / Math.max(1e-6, vAt[di + 1] - vAt[di]), 0, 1);
      const a = GP(j0 + dj, i0 + di), bb = GP(j0 + dj + 1, i0 + di), c = GP(j0 + dj + 1, i0 + di + 1), d = GP(j0 + dj, i0 + di + 1);
      return lerp3(lerp3(a, bb, fu), lerp3(d, c, fu), fv);
    };
    const colAt = (u: number, v: number): [number, number, number] => {
      let dj = 0; while (dj < cols - 1 && u > uAt[dj + 1]) dj++;
      let di = 0; while (di < rows - 1 && v > vAt[di + 1]) di++;
      const fu = clamp((u - uAt[dj]) / Math.max(1e-6, uAt[dj + 1] - uAt[dj]), 0, 1);
      const fv = clamp((v - vAt[di]) / Math.max(1e-6, vAt[di + 1] - vAt[di]), 0, 1);
      const cs = [G(j0 + dj, i0 + di), G(j0 + dj + 1, i0 + di), G(j0 + dj + 1, i0 + di + 1), G(j0 + dj, i0 + di + 1)].map((v2) => mesh.col.slice(v2 * 3, v2 * 3 + 3));
      return [0, 1, 2].map((k) => (cs[0][k] * (1 - fu) + cs[1][k] * fu) * (1 - fv) + (cs[3][k] * (1 - fu) + cs[2][k] * fu) * fv) as [number, number, number];
    };
    const n = nrm(crs(sub(GP(j0, i0 + rows), GP(j0, i0)), sub(GP(j0 + cols, i0), GP(j0, i0))));
    const depthBudget = blockPush(j0, i0, cols, rows) - ROOM_CLEAR;
    // the block's boundary loop, counter-clockwise in its own (u, v) (along the foot ring, up the far ray, back along
    // the top ring, down the near ray), as grid vertices with their local (u, v)
    const loop: Array<{ v: number; u: number; w: number }> = [];
    for (let dj = 0; dj < cols; dj++) loop.push({ v: G(j0 + dj, i0), u: uAt[dj], w: 0 });
    for (let di = 0; di < rows; di++) loop.push({ v: G(j0 + cols, i0 + di), u: W, w: vAt[di] });
    for (let dj = cols; dj > 0; dj--) loop.push({ v: G(j0 + dj, i0 + rows), u: uAt[dj], w: Hh });
    for (let di = rows; di > 0; di--) loop.push({ v: G(j0, i0 + di), u: 0, w: vAt[di] });
    const out = n;
    /** Fill the face between the block's loop and one hole (zipper by the angle about the hole's centre). */
    const faceRound = (hole: Array<[number, number]>, hv: number[], cu: number, cv: number) => {
      const ang = (u: number, v: number) => Math.atan2(v - cv, u - cu);
      const A = loop.map((p) => ({ v: p.v, a: ang(p.u, p.w) })), B = hole.map(([u, v], k) => ({ v: hv[k], a: ang(u, v) }));
      const order = (L: typeof A) => { let s = 0; for (let k = 1; k < L.length; k++) if (L[k].a < L[s].a) s = k; return [...L.slice(s), ...L.slice(0, s)]; };
      const oa = order(A), ob = order(B);
      const unwrap = (L: typeof A) => { const r = L.map((p) => p.a); for (let k = 1; k < r.length; k++) while (r[k] < r[k - 1]) r[k] += Math.PI * 2; return r; };
      const aa = unwrap(oa), ab = unwrap(ob);
      let ia = 0, ib = 0;
      const na = oa.length, nb = ob.length;
      while (ia < na || ib < nb) {
        const nextA = ia < na ? aa[(ia + 1) % na] + (ia + 1 >= na ? Math.PI * 2 : 0) : Infinity;
        const nextB = ib < nb ? ab[(ib + 1) % nb] + (ib + 1 >= nb ? Math.PI * 2 : 0) : Infinity;
        const curA = oa[ia % na].v, curB = ob[ib % nb].v;
        if (nextA <= nextB && ia < na) { mesh.tri(curA, oa[(ia + 1) % na].v, curB, out); ia++; }
        else { mesh.tri(curA, ob[(ib + 1) % nb].v, curB, out); ib++; }
      }
    };
    /** Cut one hole: jambs back `jamb` in the face's tone, then the room to `depth` (its floor `floor` lighter). */
    /** How deep a room may run behind its hole before it meets the knoll (its back wall ROOM_CLEAR short of it). */
    const roomFit = (hole: Array<[number, number]>, want: number): number => {
      let cu = 0, cv = 0; for (const [u, v] of hole) { cu += u; cv += v; } cu /= hole.length; cv /= hole.length;
      const pts = [...hole.map(([u, v]) => surf(u, v)), surf(cu, cv)];
      for (let k = 0; k < hole.length; k++) {
        const [u0, v0] = hole[k], [u1, v1] = hole[(k + 1) % hole.length];
        pts.push(surf((u0 + u1) / 2, (v0 + v1) / 2));
      }
      for (let d = 0.15; d <= want + ROOM_CLEAR + 1e-6; d += 0.15) {
        for (const p of pts) { const q = sub(p, scl(n, d)); if (solidAt(q[0], q[2]) > q[1] - 0.04) return Math.max(0, d - 0.15 - ROOM_CLEAR); }
      }
      return want;
    };
    /** The block as plain rock (a room that would not fit). */
    const plainBlock = () => {
      for (let dj = 0; dj < cols; dj++) for (let di = 0; di < rows; di++) {
        const j = j0 + dj, i = i0 + di;
        mesh.tri(G(j, i), G(j, i + 1), G(j + 1, i + 1), outward(j));
        mesh.tri(G(j, i), G(j + 1, i + 1), G(j + 1, i), outward(j));
      }
    };
    const cutHole = (hole: Array<[number, number]>, depth: number, jamb: number, tone: [number, number, number] | null) => {
      const hv = hole.map(([u, v]) => { const p = surf(u, v); return mesh.vert(p, tone ?? colAt(u, v), groundAt(p[0], p[2])); });
      let cu = 0, cv = 0; for (const [u, v] of hole) { cu += u; cv += v; } cu /= hole.length; cv /= hole.length;
      // the jamb ring, then the room: each side its own flat tone (the floor's dust paler), the back wall darkest
      const P = hv.map((v) => mesh.at(v));
      const J = P.map((p) => sub(p, scl(n, jamb)));
      const jv = J.map((p, k) => mesh.vert(p, scl(mesh.col.slice(hv[k] * 3, hv[k] * 3 + 3) as unknown as V3, 0.72) as [number, number, number], groundAt(p[0], p[2])));
      const B = P.map((p) => sub(p, scl(n, depth)));
      const centre = sub(surf(cu, cv), scl(n, depth * 0.5));
      for (let k = 0; k < hole.length; k++) {
        const k1 = (k + 1) % hole.length;
        // the jamb faces the hole's axis
        const inward = sub(centre, scl(add(P[k], P[k1]), 0.5));
        mesh.tri(hv[k], hv[k1], jv[k1], inward); mesh.tri(hv[k], jv[k1], jv[k], inward);
        const floor = Math.abs(hole[k1][1] - hole[k][1]) < 1e-3 && hole[k][1] < cv;
        const tone = (floor ? ROOM_FLOOR : ROOM_SIDE).slice() as [number, number, number];
        const q = [J[k], J[k1], B[k1], B[k]].map((p) => mesh.vert(p, tone, groundAt(p[0], p[2])));
        mesh.tri(q[0], q[1], q[2], inward); mesh.tri(q[0], q[2], q[3], inward);
      }
      const bv = B.map((p) => mesh.vert(p, ROOM_BACK.slice() as [number, number, number], groundAt(p[0], p[2])));
      mesh.poly(bv, n);
      faceRound(hole, hv, cu, cv);
      openings++;
    };
    if (b.kind === 'dove' && roomFit([[0.1, 0.1], [W - 0.1, 0.1], [W - 0.1, Hh - 0.1], [0.1, Hh - 0.1]], 0.3) < 0.3) { plainBlock(); return; }
    if (b.kind === 'dove') {
      // the whitewashed band: the block's face a lime panel (its own vertices, so the white stops at its edge), rows of
      // pigeon holes 0.2 m deep, a red-ochre zigzag along its foot
      const colsH = Math.max(3, Math.floor(W / 0.42)), rowsH = Math.max(2, Math.min(3, Math.floor(Hh / 0.42)));
      const hw = 0.15, hh = 0.21, gapU = W / colsH, gapV = Hh / (rowsH + 0.4);
      // the panel: a grid of quads over the band, skipping the holes (each a recess)
      const us: number[] = [0], vs: number[] = [0];
      for (let c = 0; c < colsH; c++) { const cx = gapU * (c + 0.5); us.push(cx - hw / 2, cx + hw / 2); }
      us.push(W);
      for (let r = 0; r < rowsH; r++) { const cy = gapV * (r + 0.7); vs.push(cy - hh / 2, cy + hh / 2); }
      vs.push(Hh);
      const lime = (u: number, v: number): [number, number, number] => { const c = colAt(u, v); return [0, 1, 2].map((k) => LIME[k] * 0.82 + c[k] * 0.18) as [number, number, number]; };
      // (the panel's rim lies on the block's edges: its quads meet the cells round it there)
      const pv: number[][] = us.map((u) => vs.map((v) => { const p = surf(u, v); return mesh.vert(p, lime(u, v), groundAt(p[0], p[2])); }));
      for (let a = 0; a < us.length - 1; a++) for (let bIdx = 0; bIdx < vs.length - 1; bIdx++) {
        const isHole = a % 2 === 1 && bIdx % 2 === 1;
        const q = [pv[a][bIdx], pv[a + 1][bIdx], pv[a + 1][bIdx + 1], pv[a][bIdx + 1]];
        if (!isHole) { mesh.tri(q[0], q[3], q[2], out); mesh.tri(q[0], q[2], q[1], out); continue; }
        // a pigeon hole: four sides back 0.2 m into the rock and its dark end
        const P = q.map((v) => mesh.at(v));
        const back = P.map((p) => mesh.vert(sub(p, scl(n, 0.22)), ROOM_BACK.slice() as [number, number, number], groundAt(p[0], p[2])));
        const ctr = sub(scl(add(add(P[0], P[1]), add(P[2], P[3])), 0.25), scl(n, 0.11));
        for (let k = 0; k < 4; k++) {
          const k1 = (k + 1) % 4;
          const side = sub(ctr, scl(add(P[k], P[k1]), 0.5));
          const sv0 = mesh.vert(P[k], ROOM_SIDE.slice() as [number, number, number], groundAt(P[k][0], P[k][2]));
          const sv1 = mesh.vert(P[k1], ROOM_SIDE.slice() as [number, number, number], groundAt(P[k1][0], P[k1][2]));
          mesh.tri(sv0, sv1, back[k1], side); mesh.tri(sv0, back[k1], back[k], side);
        }
        mesh.poly(back, n);
        openings++;
      }
      // the red-ochre zigzag under the band, a hair proud of the face below it
      const teeth = Math.max(4, Math.floor(W / 0.32));
      for (let k = 0; k < teeth; k++) {
        const u0 = (k / teeth) * W, u1 = ((k + 1) / teeth) * W, um = (u0 + u1) / 2;
        const a = add(surf(u0, 0), scl(n, 0.03)), c = add(surf(u1, 0), scl(n, 0.03));
        const m = add(sub(surf(um, 0), [0, 0.17, 0]), scl(n, 0.03));
        const va = mesh.vert(a, OCHRE.slice() as [number, number, number], groundAt(a[0], a[2]));
        const vc = mesh.vert(c, OCHRE.slice() as [number, number, number], groundAt(c[0], c[2]));
        const vm = mesh.vert(m, OCHRE.slice() as [number, number, number], groundAt(m[0], m[2]));
        mesh.tri(va, vc, vm, out);
      }
      return;
    }
    // every hole drawn from the stream first, then fitted: a room that would meet the knoll within a metre (a passage
    // within 2.2 m) is not cut, and its block stays plain rock
    let kind: 'gate' | 'door' | 'room' | 'window', hole: Array<[number, number]>, want: number, least: number, jamb: number, w: number, h: number;
    if (b.kind === 'gate') {
      kind = 'gate'; w = Math.min(W - 1.0, 4.6); h = Math.min(Hh - 0.6, 5.0);
      hole = holeOutline(W / 2, 0.05, w, h, true); want = Math.max(2.8, depthBudget); least = 2.2; jamb = 0.55;
    } else if (b.kind === 'door') {
      kind = 'door'; w = Math.min(W - 0.5, 1.15 + rng() * 0.35); h = Math.min(Hh - 0.35, 2.0 + rng() * 0.35);
      hole = holeOutline(W / 2 + (rng() - 0.5) * Math.max(0, W - w - 0.6), 0.12, w, h, rng() < 0.6); want = 1.6; least = 1.0; jamb = 0.32;
    } else if (b.kind === 'room') {
      // a room whose front fell: wide, its sill low, the room behind it open to the light
      kind = 'room'; w = Math.min(W - 0.4, 2.4 + rng() * 1.2); h = Math.min(Hh - 0.35, 1.9 + rng() * 0.6);
      hole = holeOutline(W / 2, 0.15, w, h, false); want = 2.4; least = 1.0; jamb = 0.25;
    } else {
      kind = 'window'; w = Math.min(W - 0.4, 0.55 + rng() * 0.35); h = Math.min(Hh - 0.3, 0.7 + rng() * 0.4);
      hole = holeOutline(W / 2, (Hh - h) * (0.3 + rng() * 0.4), w, h, rng() < 0.35); want = 1.6; least = 1.0; jamb = 0.26;
    }
    const depth = roomFit(hole, want);
    if (depth < least) { plainBlock(); return; }
    cutHole(hole, depth, Math.min(jamb, depth * 0.4), null);
    rooms.push({ kind, w, h, depth });
  };
  for (const b of blocks) emitBlock(b);

  // ---- the crown: the shoulder over the brow, then a sheet over the cap, a little proud and swelling
  const crownRings = mobile ? 3 : 5;
  const spokes = rays;
  const topI = rings - 1;
  const shoulder: number[] = [];
  for (let j = 0; j < rays; j++) {
    const a = rayAngle(j), c = Math.cos(a), s = Math.sin(a);
    const pTop = GP(j, topI);
    const rTop = Math.hypot(pTop[0] - spec.x, pTop[2] - spec.z);
    const r = Math.max(1, rTop - 1.1 - 0.5 * lobe(a, pTop[1] + 3));
    const x = spec.x + c * r, z = spec.z + s * r;
    const y = Math.max(pTop[1] + 0.6, groundAt(x, z) + 0.45);
    const pt: V3 = [x, y, z];
    shoulder.push(mesh.vert(pt, colourAt(pt, [0, 1, 0], 1.2, 0, 0, climbY[j]), groundAt(x, z)));
  }
  for (let j = 0; j < rays; j++) mesh.tri(G(j, topI), shoulder[j], shoulder[(j + 1) % rays], outward(j)), mesh.tri(G(j, topI), shoulder[(j + 1) % rays], G(j + 1, topI), outward(j));
  let prev = shoulder;
  for (let k = 1; k <= crownRings; k++) {
    const f = 1 - k / (crownRings + 1);
    const ring: number[] = [];
    for (let j = 0; j < spokes; j++) {
      const sp = mesh.at(shoulder[j]);
      const x = summitX + (sp[0] - summitX) * f, z = summitZ + (sp[2] - summitZ) * f;
      const swell = (noise.noise(x * 0.09 + salt, z * 0.09 - 2.9) * 0.5 + 0.5) * 0.9 * (1 - f * f);
      const pt: V3 = [x, groundAt(x, z) + 0.4 + swell, z];
      ring.push(mesh.vert(pt, colourAt(pt, [0, 1, 0], 1.2, 0, 0, top - 2), groundAt(x, z)));
    }
    for (let j = 0; j < spokes; j++) { const j1 = (j + 1) % spokes; mesh.tri(prev[j], ring[j], ring[j1], [0, 1, 0]); mesh.tri(prev[j], ring[j1], prev[j1], [0, 1, 0]); }
    prev = ring;
  }
  const apexP: V3 = [summitX, groundAt(summitX, summitZ) + 0.9, summitZ];
  const apex = mesh.vert(apexP, colourAt(apexP, [0, 1, 0], 1.2, 0, 0, top - 2), groundAt(summitX, summitZ));
  for (let j = 0; j < spokes; j++) mesh.tri(prev[j], apex, prev[(j + 1) % spokes], [0, 1, 0]);

  // ---- the pinnacles: columns of the mass rising out of the brow, stumps the weather has not yet brought down, each
  // its own girth and height (the tallest first), fluted, its top rounded and broken
  const towers = spec.towers ?? 2;
  const towerAngles: number[] = [];
  for (let t = 0; t < towers; t++) {
    let j = Math.floor(rng() * rays);
    // (the columns stand apart round the brow)
    for (let k = 0; k < 8 && towerAngles.some((a) => angDiff(a, rayAngle(j)) < 0.9); k++) j = Math.floor(rng() * rays);
    const a = rayAngle(j);
    towerAngles.push(a);
    const pTop = GP(j, topI);
    const rTop = Math.hypot(pTop[0] - spec.x, pTop[2] - spec.z);
    const R = Math.min(rRef * 0.42, [7.2, 5.0, 3.6][Math.min(2, t)] * (0.85 + rng() * 0.3) * (rRef / 22));
    const rr = Math.max(R * 0.5, rTop - R * 0.4);
    const cx = spec.x + Math.cos(a) * rr, cz = spec.z + Math.sin(a) * rr;
    const footY = pTop[1] - 6 - rng() * 3;
    const tall = [12, 7.5, 5][Math.min(2, t)] * (0.8 + rng() * 0.45) * (rRef / 22) + (pTop[1] - footY);
    const sides = mobile ? 14 : 28, trings = mobile ? 6 : 10;
    const tSalt = rng() * 50, lobes = 3 + Math.floor(rng() * 4);
    const PROF = [1.08, 1.02, 0.99, 0.96, 0.93, 0.89, 0.83, 0.74, 0.6, 0.38];
    const tv: number[][] = [];
    for (let k = 0; k < trings; k++) {
      const u = k / (trings - 1), y = footY + u * tall;
      const row: number[] = [];
      const pf = PROF[Math.round(u * (PROF.length - 1))];
      for (let q = 0; q < sides; q++) {
        const aa = (q / sides) * Math.PI * 2;
        const lobeT = 0.5 + 0.5 * Math.cos(aa * lobes + tSalt + noise.noise(u * 1.6 + tSalt, tSalt) * 1.4);
        const fl = Math.pow(0.5 + 0.5 * Math.cos(aa * (9 + lobes) + noise.noise(u * 3 + tSalt, 7.1) * 2.2), 5);
        const wob = 1 + noise.noise3d(Math.cos(aa) * 1.3 + tSalt, u * 2.5, Math.sin(aa) * 1.3) * 0.14;
        const r0 = R * pf * wob * (0.86 + 0.14 * lobeT) * (1 - 0.07 * fl);
        const pt: V3 = [cx + Math.cos(aa) * r0, y, cz + Math.sin(aa) * r0];
        row.push(mesh.vert(pt, colourAt(pt, [Math.cos(aa), 0.2, Math.sin(aa)], 1.2, 0, fl, footY), groundAt(pt[0], pt[2])));
      }
      tv.push(row);
    }
    for (let k = 0; k + 1 < trings; k++) for (let q = 0; q < sides; q++) {
      const q1 = (q + 1) % sides, aa = ((q + 0.5) / sides) * Math.PI * 2, o: V3 = [Math.cos(aa), 0, Math.sin(aa)];
      mesh.tri(tv[k][q], tv[k + 1][q], tv[k + 1][q1], o); mesh.tri(tv[k][q], tv[k + 1][q1], tv[k][q1], o);
    }
    const tipP: V3 = [cx + (rng() - 0.5) * R * 0.4, footY + tall + R * 0.3, cz + (rng() - 0.5) * R * 0.4];
    const tip = mesh.vert(tipP, colourAt(tipP, [0, 1, 0], 1.2, 0, 0, footY), groundAt(cx, cz));
    for (let q = 0; q < sides; q++) mesh.tri(tv[trings - 1][q], tip, tv[trings - 1][(q + 1) % sides], [0, 1, 0]);
  }

  // ---- a gate's buttress is a mass the hulls and shells meet (it stands proud of the knoll's wall near the ground)
  const masses: CastleMass[] = [];
  for (const g of gates) {
    const jc = Math.round((g / (Math.PI * 2)) * rays);
    const pts: Array<[number, number]> = [];
    let y1 = -Infinity;
    for (let dj = -6; dj <= 6; dj++) for (let i = 0; i < Math.min(rings, 6); i++) {
      const p = GP(jc + dj, i);
      if (GPush(jc + dj, i) < 0.8) continue;
      pts.push([p[0], p[2]]);
      y1 = Math.max(y1, p[1]);
    }
    if (pts.length >= 3) masses.push({ points: hull2(pts), y0: base - 0.5, y1 });
  }

  const geometry = finishSkin(mesh, 38);
  return { geometry, masses, triangles: mesh.idx.length / 3, openings, rooms };
}

/** XZ convex hull (monotone chain), counter-clockwise, as [x, z, ...]. */
function hull2(points: Array<[number, number]>): number[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts.flat();
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return [...lower, ...upper].flat();
}
