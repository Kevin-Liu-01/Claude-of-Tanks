// Rendered-build surface finish for merged vehicle buckets.
//
// Two seeded passes run on rendered builds only; receipt and geometry-only builds keep the authored lattice and
// the undithered tone, so their digests do not change.
//  - ditherPaintTone: a triangular (TPDF) dither of the baked dust/AO tone, under one 8-bit step, so the long
//    dust gradient on decks and side plates quantises without banding.
//  - relaxFlatFans: each vertex that sits inside a flat closed fan, or inside a straight level crease, moves up to
//    0.15 mm along the surface in a seeded direction. The surface is unchanged as a point set, outline vertices stay
//    put, and no vertex changes height.
import * as THREE from 'three';

const TONE_SEED = 0x51d92a77;
const FAN_SEED = 0xf61dd1c3;

const imul = Math.imul;
function mix32(h: number): number {
  h ^= h >>> 16; h = imul(h, 0x85ebca6b); h ^= h >>> 13; h = imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
/** Hash of a position on a 0.1 mm lattice, so coincident vertices always agree. */
function latticeHash(seed: number, x: number, y: number, z: number, salt: number): number {
  let h = mix32(seed ^ salt);
  h = mix32(h ^ (Math.round(x * 1e4) | 0));
  h = mix32(h ^ (Math.round(y * 1e4) | 0));
  return mix32(h ^ (Math.round(z * 1e4) | 0));
}
const unit = (h: number): number => h / 4294967296;

export function ditherPaintTone(geo: THREE.BufferGeometry): void {
  const col = geo.getAttribute('color'), pos = geo.getAttribute('position');
  if (!col) return;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (unit(latticeHash(TONE_SEED, x, y, z, 0x51)) + unit(latticeHash(TONE_SEED, x, y, z, 0xa7)) - 1) / 255;
    col.setXYZ(i, col.getX(i) * (1 + t), col.getY(i) * (1 + t), col.getZ(i) * (1 + t));
  }
  col.needsUpdate = true;
}

const PLANE_EPS = 1e-9, SLIDE_MAX_M = 1.5e-4;

/** Moves each vertex inside a flat closed fan, or inside a straight level crease, up to 0.15 mm along the surface. */
export function relaxFlatFans(geo: THREE.BufferGeometry, seed = FAN_SEED): void {
  const pos = geo.getAttribute('position'); const index = geo.index;
  const count = pos.count, nCorner = index ? index.count : count;
  // weld exact duplicates (sorted, no string keys)
  const X = new Float64Array(count), Y = new Float64Array(count), Z = new Float64Array(count);
  const flat = !(pos as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && pos.itemSize === 3 && !pos.normalized;
  const src = flat ? (pos.array as ArrayLike<number>) : null;
  for (let i = 0; i < count; i++) {
    if (src) { X[i] = src[i * 3]; Y[i] = src[i * 3 + 1]; Z[i] = src[i * 3 + 2]; }
    else { X[i] = pos.getX(i); Y[i] = pos.getY(i); Z[i] = pos.getZ(i); }
  }
  const idx = index ? index.array : null;
  // weld exact duplicates: open addressing on the float bit patterns (-0 folded into +0, so welding is float equality)
  const wid = new Int32Array(count); const wp = new Float64Array(count * 3); let W = 0;
  const f32 = new Float32Array(3), u32 = new Uint32Array(f32.buffer);
  let size = 1; while (size < count * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), key = new Uint32Array(count * 3);
  for (let i = 0; i < count; i++) {
    f32[0] = X[i] || 0; f32[1] = Y[i] || 0; f32[2] = Z[i] || 0;
    const a = u32[0], b = u32[1], c = u32[2];
    let h = mix32(a ^ mix32(b ^ mix32(c))) & (size - 1);
    for (;;) {
      const w = table[h];
      if (w < 0) {
        table[h] = W; key[W * 3] = a; key[W * 3 + 1] = b; key[W * 3 + 2] = c;
        wp[W * 3] = X[i]; wp[W * 3 + 1] = Y[i]; wp[W * 3 + 2] = Z[i]; wid[i] = W++; break;
      }
      if (key[w * 3] === a && key[w * 3 + 1] === b && key[w * 3 + 2] === c) { wid[i] = w; break; }
      h = (h + 1) & (size - 1);
    }
  }
  // non-degenerate triangles: welded corners, unit normal, twice the area
  const triMax = Math.floor(nCorner / 3);
  const tv = new Int32Array(triMax * 3), tn = new Float64Array(triMax * 3), ta = new Float64Array(triMax); let T = 0;
  for (let k = 0; k + 2 < nCorner; k += 3) {
    const a = wid[idx ? idx[k] : k], b = wid[idx ? idx[k + 1] : k + 1], c = wid[idx ? idx[k + 2] : k + 2];
    if (a === b || b === c || a === c) continue;
    const ux = wp[b * 3] - wp[a * 3], uy = wp[b * 3 + 1] - wp[a * 3 + 1], uz = wp[b * 3 + 2] - wp[a * 3 + 2];
    const vx = wp[c * 3] - wp[a * 3], vy = wp[c * 3 + 1] - wp[a * 3 + 1], vz = wp[c * 3 + 2] - wp[a * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz); if (len < 1e-14) continue;
    nx /= len; ny /= len; nz /= len;
    tv[T * 3] = a; tv[T * 3 + 1] = b; tv[T * 3 + 2] = c; tn[T * 3] = nx; tn[T * 3 + 1] = ny; tn[T * 3 + 2] = nz; ta[T] = len; T++;
  }
  // fans as CSR lists, and a cheap count of distinct planes per vertex (capped at 3)
  const fanStart = new Int32Array(W + 1);
  for (let t = 0; t < T * 3; t++) fanStart[tv[t] + 1]++;
  for (let w = 0; w < W; w++) fanStart[w + 1] += fanStart[w];
  const fan = new Int32Array(T * 3), fill = fanStart.slice(0, W);
  const nA = new Float64Array(W * 3), nB = new Float64Array(W * 3), np = new Uint8Array(W);
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) {
      const w = tv[t * 3 + k]; fan[fill[w]++] = t;
      if (np[w] >= 3) continue;
      const o = w * 3, x = tn[t * 3], y = tn[t * 3 + 1], z = tn[t * 3 + 2];
      if (np[w] === 0) { nA[o] = x; nA[o + 1] = y; nA[o + 2] = z; np[w] = 1; continue; }
      if (1 - (nA[o] * x + nA[o + 1] * y + nA[o + 2] * z) < PLANE_EPS) continue;
      if (np[w] === 1) { nB[o] = x; nB[o + 1] = y; nB[o + 2] = z; np[w] = 2; continue; }
      if (1 - (nB[o] * x + nB[o + 1] * y + nB[o + 2] * z) >= PLANE_EPS) np[w] = 3;
    }
  }
  const disp = new Float64Array(W * 3);
  let maxFan = 0; for (let w = 0; w < W; w++) maxFan = Math.max(maxFan, fanStart[w + 1] - fanStart[w]);
  const cap = 2 * maxFan + 2;
  const nb = new Int32Array(cap), nbUse = new Int32Array(cap), nbA = new Uint8Array(cap), nbB = new Uint8Array(cap);
  for (let w = 0; w < W; w++) {
    const f0 = fanStart[w], f1 = fanStart[w + 1];
    if (f1 - f0 < 3 || np[w] === 0 || np[w] === 3) continue;
    const o = w * 3;
    let tx = 0, ty = 0, tz = 0;
    if (np[w] === 2) {
      tx = nA[o + 1] * nB[o + 2] - nA[o + 2] * nB[o + 1]; ty = nA[o + 2] * nB[o] - nA[o] * nB[o + 2]; tz = nA[o] * nB[o + 1] - nA[o + 1] * nB[o];
      if (Math.abs(ty) > 1e-9 * Math.sqrt(tx * tx + ty * ty + tz * tz)) continue;  // level creases only
    }
    // neighbour edges: every one used exactly twice (closed fan); fan heights; which planes each neighbour touches
    let n = 0, minH = Infinity;
    for (let f = f0; f < f1; f++) {
      const t = fan[f], k = tv[t * 3] === w ? 0 : tv[t * 3 + 1] === w ? 1 : 2;
      const o1 = tv[t * 3 + (k + 1) % 3], o2 = tv[t * 3 + (k + 2) % 3];
      const ex = wp[o2 * 3] - wp[o1 * 3], ey = wp[o2 * 3 + 1] - wp[o1 * 3 + 1], ez = wp[o2 * 3 + 2] - wp[o1 * 3 + 2];
      const el = Math.sqrt(ex * ex + ey * ey + ez * ez); if (ta[t] / el < minH) minH = ta[t] / el;
      const inA = 1 - (nA[o] * tn[t * 3] + nA[o + 1] * tn[t * 3 + 1] + nA[o + 2] * tn[t * 3 + 2]) < PLANE_EPS;
      for (let e = 0; e < 2; e++) {
        const u = e ? o2 : o1;
        let m = 0; while (m < n && nb[m] !== u) m++;
        if (m === n) { nb[n] = u; nbUse[n] = 0; nbA[n] = 0; nbB[n] = 0; n++; }
        nbUse[m]++; if (inA) nbA[m] = 1; else nbB[m] = 1;
      }
    }
    let closed = true; for (let m = 0; m < n; m++) if (nbUse[m] !== 2) { closed = false; break; }
    if (!closed) continue;                                               // outline vertices stay put
    const amp = Math.min(SLIDE_MAX_M, 0.25 * minH); if (!(amp > 0)) continue;
    const h = latticeHash(seed, wp[o], wp[o + 1], wp[o + 2], 0x3c);
    let dx = 0, dz = 0;
    if (np[w] === 1) {
      if (Math.abs(nA[o + 1]) > 1 - 1e-12) { const th = unit(h) * 2 * Math.PI; dx = Math.cos(th); dz = Math.sin(th); }
      else { const l = Math.sqrt(nA[o + 2] * nA[o + 2] + nA[o] * nA[o]); if (l < 1e-9) continue; dx = -nA[o + 2] / l; dz = nA[o] / l; }
    } else {
      // one crease neighbour on each side along the crease
      let c0 = -1, c1 = -1, nc = 0;
      for (let m = 0; m < n; m++) if (nbA[m] && nbB[m]) { if (nc === 0) c0 = nb[m]; else c1 = nb[m]; nc++; }
      if (nc !== 2) continue;
      const s0 = (wp[c0 * 3] - wp[o]) * tx + (wp[c0 * 3 + 2] - wp[o + 2]) * tz;
      const s1 = (wp[c1 * 3] - wp[o]) * tx + (wp[c1 * 3 + 2] - wp[o + 2]) * tz;
      if (!(s0 * s1 < 0)) continue;
      const l = Math.sqrt(tx * tx + tz * tz); dx = tx / l; dz = tz / l;
    }
    const sgn = (h & 0x80000000) ? 1 : -1;
    disp[o] = sgn * amp * dx; disp[o + 2] = sgn * amp * dz;
  }
  for (let i = 0; i < count; i++) {
    const w = wid[i] * 3; if (disp[w] === 0 && disp[w + 2] === 0) continue;
    if (src) { (pos.array as Float32Array)[i * 3] = X[i] + disp[w]; (pos.array as Float32Array)[i * 3 + 2] = Z[i] + disp[w + 2]; }
    else { pos.setX(i, X[i] + disp[w]); pos.setZ(i, Z[i] + disp[w + 2]); }   // height untouched
  }
  pos.needsUpdate = true;
}
