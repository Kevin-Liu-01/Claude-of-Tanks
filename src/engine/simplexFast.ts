// Drop-in replacement for three/examples/jsm/math/SimplexNoise.js with
// BIT-IDENTICAL output (same Gustavson algorithm, same permutation-table
// construction from the injected rng, same floating-point operation order)
// but ~2-4x faster on the V8 boot path:
//  - permutation + gradient tables in typed arrays (no PACKED_ELEMENTS loads)
//  - perm%12 / perm%32 precomputed once (kills 3-5 integer modulos per call)
//  - gradient dot products inlined on a flat Float64Array (no method call,
//    no nested-array load per corner)
//  - skew constants hoisted to module scope (no Math.sqrt per call)
// Gradient components are exact small integers (-1/0/1) and the corner sums
// are accumulated in the exact same order as the original, so every result
// is the same IEEE-754 double the three.js class returns.

export interface SimplexRandomSource {
  random(): number;
}

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

const GRAD3 = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const GRAD4 = new Float64Array([
  0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
  0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
  -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
  -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
  -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0,
]);

// 4D simplex traversal table, flattened (64 rows x 4)
const SIMPLEX = new Uint8Array([
  0, 1, 2, 3, 0, 1, 3, 2, 0, 0, 0, 0, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0,
  0, 2, 1, 3, 0, 0, 0, 0, 0, 3, 1, 2, 0, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 2, 0, 3, 0, 0, 0, 0, 1, 3, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 0, 1, 2, 3, 1, 0,
  1, 0, 2, 3, 1, 0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 1, 0, 0, 0, 0, 2, 1, 3, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  2, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 1, 2, 3, 0, 2, 1, 0, 0, 0, 0, 3, 1, 2, 0,
  2, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 2, 0, 0, 0, 0, 3, 2, 0, 1, 3, 2, 1, 0,
]);

export class SimplexNoise {

  private readonly _perm: Int32Array;
  private readonly _pm12: Int32Array;
  private readonly _pm32: Int32Array;

  constructor(r: SimplexRandomSource = Math) {
    // identical rng consumption to the three.js class: 256 draws
    const p = new Int32Array(256);
    for (let i = 0; i < 256; i++) p[i] = Math.floor(r.random() * 256);
    const perm = new Int32Array(512);
    const permMod12 = new Int32Array(512);
    const permMod32 = new Int32Array(512);
    for (let i = 0; i < 512; i++) {
      const v = p[i & 255];
      perm[i] = v;
      permMod12[i] = v % 12;
      permMod32[i] = v % 32;
    }
    this._perm = perm;
    this._pm12 = permMod12;
    this._pm32 = permMod32;
  }

  noise(xin: number, yin: number): number {
    const perm = this._perm;
    const pm12 = this._pm12;
    let n0, n1, n2;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = pm12[ii + perm[jj]] * 3;
    const gi1 = pm12[ii + i1 + perm[jj + j1]] * 3;
    const gi2 = pm12[ii + 1 + perm[jj + 1]] * 3;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2);
    }
    return 70.0 * (n0 + n1 + n2);
  }

  noise3d(xin: number, yin: number, zin: number): number {
    const perm = this._perm;
    const pm12 = this._pm12;
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = pm12[ii + perm[jj + perm[kk]]] * 3;
    const gi1 = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
    const gi2 = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
    const gi3 = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0 + GRAD3[gi0 + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1 + GRAD3[gi1 + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2 + GRAD3[gi2 + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0;
    else {
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi3] * x3 + GRAD3[gi3 + 1] * y3 + GRAD3[gi3 + 2] * z3);
    }
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  noise4d(x: number, y: number, z: number, w: number): number {
    const perm = this._perm;
    const pm32 = this._pm32;
    let n0, n1, n2, n3, n4;
    const s = (x + y + z + w) * F4;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const l = Math.floor(w + s);
    const t = (i + j + k + l) * G4;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const W0 = l - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    const w0 = w - W0;
    const c = ((x0 > y0) ? 32 : 0) + ((x0 > z0) ? 16 : 0) + ((y0 > z0) ? 8 : 0)
      + ((x0 > w0) ? 4 : 0) + ((y0 > w0) ? 2 : 0) + ((z0 > w0) ? 1 : 0);
    const c4 = c * 4;
    const sc0 = SIMPLEX[c4];
    const sc1 = SIMPLEX[c4 + 1];
    const sc2 = SIMPLEX[c4 + 2];
    const sc3 = SIMPLEX[c4 + 3];
    const i1 = sc0 >= 3 ? 1 : 0;
    const j1 = sc1 >= 3 ? 1 : 0;
    const k1 = sc2 >= 3 ? 1 : 0;
    const l1 = sc3 >= 3 ? 1 : 0;
    const i2 = sc0 >= 2 ? 1 : 0;
    const j2 = sc1 >= 2 ? 1 : 0;
    const k2 = sc2 >= 2 ? 1 : 0;
    const l2 = sc3 >= 2 ? 1 : 0;
    const i3 = sc0 >= 1 ? 1 : 0;
    const j3 = sc1 >= 1 ? 1 : 0;
    const k3 = sc2 >= 1 ? 1 : 0;
    const l3 = sc3 >= 1 ? 1 : 0;
    const x1 = x0 - i1 + G4;
    const y1 = y0 - j1 + G4;
    const z1 = z0 - k1 + G4;
    const w1 = w0 - l1 + G4;
    const x2 = x0 - i2 + 2.0 * G4;
    const y2 = y0 - j2 + 2.0 * G4;
    const z2 = z0 - k2 + 2.0 * G4;
    const w2 = w0 - l2 + 2.0 * G4;
    const x3 = x0 - i3 + 3.0 * G4;
    const y3 = y0 - j3 + 3.0 * G4;
    const z3 = z0 - k3 + 3.0 * G4;
    const w3 = w0 - l3 + 3.0 * G4;
    const x4 = x0 - 1.0 + 4.0 * G4;
    const y4 = y0 - 1.0 + 4.0 * G4;
    const z4 = z0 - 1.0 + 4.0 * G4;
    const w4 = w0 - 1.0 + 4.0 * G4;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const ll = l & 255;
    const gi0 = pm32[ii + perm[jj + perm[kk + perm[ll]]]] * 4;
    const gi1 = pm32[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] * 4;
    const gi2 = pm32[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] * 4;
    const gi3 = pm32[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] * 4;
    const gi4 = pm32[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] * 4;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD4[gi0] * x0 + GRAD4[gi0 + 1] * y0 + GRAD4[gi0 + 2] * z0 + GRAD4[gi0 + 3] * w0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD4[gi1] * x1 + GRAD4[gi1 + 1] * y1 + GRAD4[gi1 + 2] * z1 + GRAD4[gi1 + 3] * w1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD4[gi2] * x2 + GRAD4[gi2 + 1] * y2 + GRAD4[gi2 + 2] * z2 + GRAD4[gi2 + 3] * w2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if (t3 < 0) n3 = 0.0;
    else {
      t3 *= t3;
      n3 = t3 * t3 * (GRAD4[gi3] * x3 + GRAD4[gi3 + 1] * y3 + GRAD4[gi3 + 2] * z3 + GRAD4[gi3 + 3] * w3);
    }
    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if (t4 < 0) n4 = 0.0;
    else {
      t4 *= t4;
      n4 = t4 * t4 * (GRAD4[gi4] * x4 + GRAD4[gi4 + 1] * y4 + GRAD4[gi4 + 2] * z4 + GRAD4[gi4 + 3] * w4);
    }
    return 27.0 * (n0 + n1 + n2 + n3 + n4);
  }

}
