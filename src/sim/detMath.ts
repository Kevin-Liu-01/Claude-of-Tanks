/**
 * Deterministic math for the authoritative simulation: the same bits on every JavaScript engine, every OS and the Rust
 * port (crates/cot-sim jsmath). Coordinator ruling 2026-10-25 (workstream #3 of the lockdown programme): an engine's
 * own Math.* is not one function — Node on arm64 runs V8's fdlibm fused by clang's FMA contraction, Chromium another
 * build of it, Safari the system libm, Firefox its own hypot, and every V8 takes pow from the platform libc
 * (tools/jsmath-conformance.mjs) — so a match re-simulated on another engine drifted in the last bit and then diverged.
 * Every function below is a line-by-line port of the FreeBSD msun source the Rust port computes with (the libm crate
 * 0.2.16; cbrt is FreeBSD's s_cbrt.c, which both sides use instead of the crate's FMA-based CORE-MATH cbrt), in the
 * same operation order: IEEE-754 +, -, * and / are correctly rounded and never fused in JavaScript, so the results are
 * bit-identical everywhere. hypot is V8's MathHypot (math.tq), the formula the game has always used in Chromium.
 *
 * The authoritative modules call these instead of the native transcendentals (tools/det-math-lint.mjs holds them to
 * it); rendering, effects, audio and UI keep Math.*. Math.sqrt, abs, floor, ceil, round, min, max, sign, trunc and
 * fround are exact on every engine and stay native.
 */

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
F64[0] = 1;
if (U32[1] !== 0x3ff00000) throw new Error('detMath: expected a little-endian host');

function highWord(x: number): number { F64[0] = x; return U32[1]; }
function lowWord(x: number): number { F64[0] = x; return U32[0]; }
function fromWords(hi: number, lo: number): number { U32[1] = hi; U32[0] = lo; return F64[0]; }
function withLowWord(x: number, lo: number): number { F64[0] = x; U32[0] = lo; return F64[0]; }
function withHighWord(x: number, hi: number): number { F64[0] = x; U32[1] = hi; return F64[0]; }

// libm generic::scalbn for f64 (EXP_MAX 1023, EXP_MIN -1022, 53 significant bits)
const TWO_1023 = fromWords(0x7fe00000, 0);
const TWO_M969 = fromWords((1023 - 969) << 20, 0);
function scalbn(x: number, n: number): number {
  if (n > 1023) {
    x *= TWO_1023; n -= 1023;
    if (n > 1023) { x *= TWO_1023; n -= 1023; if (n > 1023) n = 1023; }
  } else if (n < -1022) {
    x *= TWO_M969; n += 969;
    if (n < -1022) { x *= TWO_M969; n += 969; if (n < -1022) n = -1022; }
  }
  return x * fromWords((1023 + n) << 20, 0);
}

// ---------------------------------------------------------------- kernels (k_sin.c, k_cos.c, k_tan.c)
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function kSin(x: number, y: number, iy: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const w1 = 1.0 - hz;
  return w1 + (((1.0 - w1) - hz) + (z * r - x * y));
}

const T = [
  3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
  8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
  2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05,
];
const PIO4 = 7.85398163397448278999e-01, PIO4_LO = 3.06161699786838301793e-17;
function kTan(x: number, y: number, odd: number): number {
  const hx = highWord(x);
  const big = (hx & 0x7fffffff) >= 0x3fe59428;
  if (big) {
    if (hx >>> 31 !== 0) { x = -x; y = -y; }
    x = (PIO4 - x) + (PIO4_LO - y);
    y = 0.0;
  }
  const z = x * x;
  const w = z * z;
  let r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  const v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
  const s = z * x;
  r = y + z * (s * (r + v) + y) + s * T[0];
  const w1 = x + r;
  if (big) {
    const s1 = 1.0 - 2.0 * odd;
    const v1 = s1 - 2.0 * (x + (r - w1 * w1 / (w1 + s1)));
    return hx >>> 31 !== 0 ? -v1 : v1;
  }
  if (odd === 0) return w1;
  const w0 = withLowWord(w1, 0);
  const v1 = r - (w0 - x);
  const a = -1.0 / w1;
  const a0 = withLowWord(a, 0);
  return a0 + a * (1.0 + a0 * w0 + a0 * v1);
}

// ---------------------------------------------------------------- argument reduction (e_rem_pio2.c, k_rem_pio2.c)
const EPS = 2.2204460492503131e-16, TO_INT = 1.5 / EPS;
const INV_PIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
// rem_pio2 answers through these (n, y0, y1): no allocation per call
let remN = 0, remY0 = 0, remY1 = 0;

function remMedium(x: number, ix: number): void {
  const fN = (x * INV_PIO2 + TO_INT) - TO_INT;
  const n = fN | 0;
  let r = x - fN * PIO2_1;
  let w = fN * PIO2_1T;
  let y0 = r - w;
  const ex = ix >>> 20;
  if (ex - ((highWord(y0) >>> 20) & 0x7ff) > 16) {
    let t = r;
    w = fN * PIO2_2;
    r = t - w;
    w = fN * PIO2_2T - ((t - r) - w);
    y0 = r - w;
    if (ex - ((highWord(y0) >>> 20) & 0x7ff) > 49) {
      t = r;
      w = fN * PIO2_3;
      r = t - w;
      w = fN * PIO2_3T - ((t - r) - w);
      y0 = r - w;
    }
  }
  remN = n; remY0 = y0; remY1 = (r - y0) - w;
}

function remFixed(x: number, sign: number, k: number): void {
  if (sign === 0) {
    const z = x - k * PIO2_1;
    const y0 = z - k * PIO2_1T;
    remN = k; remY0 = y0; remY1 = (z - y0) - k * PIO2_1T;
  } else {
    const z = x + k * PIO2_1;
    const y0 = z + k * PIO2_1T;
    remN = -k; remY0 = y0; remY1 = (z - y0) + k * PIO2_1T;
  }
}

const X1P24 = fromWords(0x41700000, 0), X1P_24 = fromWords(0x3e700000, 0);
const IPIO2 = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163,
  0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129,
  0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C,
  0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
  0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292,
  0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3,
  0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
  0x73A8C9, 0x60E27B, 0xC08C6B,
];
const PIO2_TABLE = [
  1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
  1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51,
];

/** k_rem_pio2 at prec 1 (two-word result) for |x| >= 2^20 * pi/2: never on a battlefield, ported for completeness. */
function remPio2Large(x: readonly number[], y: number[], e0: number): number {
  const jk = 4, jp = jk, nx = x.length, jx = nx - 1;
  const f = new Array<number>(20).fill(0), fq = new Array<number>(20).fill(0), q = new Array<number>(20).fill(0);
  const iq = new Array<number>(20).fill(0);
  let jv = ((e0 - 3) / 24) | 0;
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  let j = jv - jx;
  const m = jx + jk;
  for (let i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : IPIO2[j];
  for (let i = 0; i <= jk; i++) {
    let fw = 0;
    for (let jj = 0; jj <= jx; jj++) fw += x[jj] * f[jx + i - jj];
    q[i] = fw;
  }
  let jz = jk, z = 0, n = 0, ih = 0;
  for (;;) {
    let i = 0;
    z = q[jz];
    for (let jj = jz; jj >= 1; jj--) {
      const fw = (X1P_24 * z) | 0;
      iq[i] = (z - X1P24 * fw) | 0;
      z = q[jj - 1] + fw;
      i++;
    }
    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    n = z | 0;
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = iq[jz - 1] >> (24 - q0);
      n += i;
      iq[jz - 1] -= i << (24 - q0);
      ih = iq[jz - 1] >> (23 - q0);
    } else if (q0 === 0) {
      ih = iq[jz - 1] >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }
    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (let k = 0; k < jz; k++) {
        const v = iq[k];
        if (carry === 0) {
          if (v !== 0) { carry = 1; iq[k] = 0x1000000 - v; }
        } else iq[k] = 0xffffff - v;
      }
      if (q0 === 1) iq[jz - 1] &= 0x7fffff;
      else if (q0 === 2) iq[jz - 1] &= 0x3fffff;
      if (ih === 2) {
        z = 1.0 - z;
        if (carry !== 0) z -= scalbn(1.0, q0);
      }
    }
    if (z === 0) {
      let jj = 0;
      for (let k = jz - 1; k >= jk; k--) jj |= iq[k];
      if (jj === 0) {
        let k = 1;
        while (iq[jk - k] === 0) k++;
        for (let ii = jz + 1; ii <= jz + k; ii++) {
          f[jx + ii] = IPIO2[jv + ii];
          let fw = 0;
          for (let jjj = 0; jjj <= jx; jjj++) fw += x[jjj] * f[jx + ii - jjj];
          q[ii] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  if (z === 0) {
    jz -= 1; q0 -= 24;
    while (iq[jz] === 0) { jz -= 1; q0 -= 24; }
  } else {
    z = scalbn(z, -q0);
    if (z >= X1P24) {
      const fw = (X1P_24 * z) | 0;
      iq[jz] = (z - X1P24 * fw) | 0;
      jz += 1; q0 += 24;
      iq[jz] = fw;
    } else iq[jz] = z | 0;
  }
  let fw = scalbn(1.0, q0);
  for (let i = jz; i >= 0; i--) { q[i] = fw * iq[i]; fw *= X1P_24; }
  for (let i = jz; i >= 0; i--) {
    let s = 0;
    for (let k = 0; k <= jp && k <= jz - i; k++) s += PIO2_TABLE[k] * q[i + k];
    fq[jz - i] = s;
  }
  let s = 0;
  for (let i = jz; i >= 0; i--) s += fq[i];
  y[0] = ih === 0 ? s : -s;
  s = fq[0] - s;
  for (let i = 1; i <= jz; i++) s += fq[i];
  y[1] = ih === 0 ? s : -s;
  return n & 7;
}

// The dispatch below compares |x| with doubles, never its high word: every msun threshold is a high word whose low word
// is zero, so `ix < T` is exactly `|x| < fromWords(T, 0)` and `ix <= T` is `|x| < fromWords(T + 1, 0)`. The words are
// read only on the medium and huge reductions.
const below = (hi: number): number => fromWords(hi, 0);
const PIO4_UP = below(0x3fe921fc), SIN_TINY = below(0x3e500000), COS_TINY = below(0x3e46a09e), TAN_TINY = below(0x3e400000);
const R1_UP = below(0x400f6a7b), R1A_UP = below(0x4002d97d), R2_UP = below(0x401c463c), R2A_UP = below(0x4015fdbd);
const MEDIUM_UP = below(0x413921fb);
// high words whose cancellation sends the fixed paths to the medium reduction
const C1_LO = below(0x3ff921fb), C1_HI = below(0x3ff921fc), C2_LO = below(0x400921fb), C2_HI = below(0x400921fc);
const C3_LO = below(0x4012d97c), C3_HI = below(0x4012d97d), C4_LO = below(0x401921fb), C4_HI = below(0x401921fc);

/** e_rem_pio2 for finite |x| > pi/4 (ax = |x|): n in remN, the reduced pair in remY0 / remY1. */
function remPio2(x: number, ax: number): void {
  const sign = x < 0 ? 1 : 0;
  if (ax < R1_UP) {
    if ((ax >= C1_LO && ax < C1_HI) || (ax >= C2_LO && ax < C2_HI)) { remMedium(x, highWord(x) & 0x7fffffff); return; }
    remFixed(x, sign, ax < R1A_UP ? 1 : 2); return;
  }
  if (ax < R2_UP) {
    if (ax < R2A_UP) {
      if (ax >= C3_LO && ax < C3_HI) { remMedium(x, highWord(x) & 0x7fffffff); return; }
      remFixed(x, sign, 3); return;
    }
    if (ax >= C4_LO && ax < C4_HI) { remMedium(x, highWord(x) & 0x7fffffff); return; }
    remFixed(x, sign, 4); return;
  }
  const ix = highWord(x) & 0x7fffffff;
  if (ax < MEDIUM_UP) { remMedium(x, ix); return; }
  let z = fromWords((ix & 0x000fffff) | ((0x3ff + 23) << 20), lowWord(x));
  const tx = [0, 0, 0];
  for (let i = 0; i < 2; i++) { tx[i] = z | 0; z = (z - tx[i]) * X1P24; }
  tx[2] = z;
  let i = 2;
  while (i !== 0 && tx[i] === 0) i--;
  const ty = [0, 0];
  const n = remPio2Large(tx.slice(0, i + 1), ty, (ix >>> 20) - (0x3ff + 23));
  if (sign !== 0) { remN = -n; remY0 = -ty[0]; remY1 = -ty[1]; } else { remN = n; remY0 = ty[0]; remY1 = ty[1]; }
}

// ---------------------------------------------------------------- sin, cos, tan
/** The fixed reductions' multiple of pi/2 for pi/4 < |x| < 9pi/4 outside the cancellation words, or 0 (anything else). */
function fixedQuadrant(ax: number): number {
  if (ax < R1_UP) {
    if ((ax >= C1_LO && ax < C1_HI) || (ax >= C2_LO && ax < C2_HI)) return 0;
    return ax < R1A_UP ? 1 : 2;
  }
  if (ax < R2_UP) {
    if (ax < R2A_UP) return ax >= C3_LO && ax < C3_HI ? 0 : 3;
    return ax >= C4_LO && ax < C4_HI ? 0 : 4;
  }
  return 0;
}

export function sin(x: number): number {
  const ax = Math.abs(x);
  if (ax < PIO4_UP) {
    if (ax < SIN_TINY) return x;
    return kSin(x, 0.0, 0);
  }
  if (!(ax < Infinity)) return x - x;
  const k = fixedQuadrant(ax);
  if (k !== 0) {
    // remFixed, inline: the reduced pair stays in locals on the common path
    let y0: number, y1: number, n: number;
    if (x > 0) { const z = x - k * PIO2_1; y0 = z - k * PIO2_1T; y1 = (z - y0) - k * PIO2_1T; n = k; }
    else { const z = x + k * PIO2_1; y0 = z + k * PIO2_1T; y1 = (z - y0) + k * PIO2_1T; n = -k; }
    switch (n & 3) {
      case 0: return kSin(y0, y1, 1);
      case 1: return kCos(y0, y1);
      case 2: return -kSin(y0, y1, 1);
      default: return -kCos(y0, y1);
    }
  }
  remPio2(x, ax);
  switch (remN & 3) {
    case 0: return kSin(remY0, remY1, 1);
    case 1: return kCos(remY0, remY1);
    case 2: return -kSin(remY0, remY1, 1);
    default: return -kCos(remY0, remY1);
  }
}

export function cos(x: number): number {
  const ax = Math.abs(x);
  if (ax < PIO4_UP) {
    if (ax < COS_TINY) return 1.0;
    return kCos(x, 0.0);
  }
  if (!(ax < Infinity)) return x - x;
  const k = fixedQuadrant(ax);
  if (k !== 0) {
    let y0: number, y1: number, n: number;
    if (x > 0) { const z = x - k * PIO2_1; y0 = z - k * PIO2_1T; y1 = (z - y0) - k * PIO2_1T; n = k; }
    else { const z = x + k * PIO2_1; y0 = z + k * PIO2_1T; y1 = (z - y0) + k * PIO2_1T; n = -k; }
    switch (n & 3) {
      case 0: return kCos(y0, y1);
      case 1: return -kSin(y0, y1, 1);
      case 2: return -kCos(y0, y1);
      default: return kSin(y0, y1, 1);
    }
  }
  remPio2(x, ax);
  switch (remN & 3) {
    case 0: return kCos(remY0, remY1);
    case 1: return -kSin(remY0, remY1, 1);
    case 2: return -kCos(remY0, remY1);
    default: return kSin(remY0, remY1, 1);
  }
}

export function tan(x: number): number {
  const ax = Math.abs(x);
  if (ax < PIO4_UP) {
    if (ax < TAN_TINY) return x;
    return kTan(x, 0.0, 0);
  }
  if (!(ax < Infinity)) return x - x;
  remPio2(x, ax);
  return kTan(remY0, remY1, remN & 1);
}

// ---------------------------------------------------------------- asin, acos (e_asin.c, e_acos.c)
const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17;
const PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01, PS2 = 2.01212532134862925881e-01;
const PS3 = -4.00555345006794114027e-02, PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05;
const QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00;
const QS3 = -6.88283971605453293030e-01, QS4 = 7.70381505559019352791e-02;
function asinR(z: number): number {
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  return p / q;
}
const X1P_120 = fromWords(0x38700000, 0);

export function asin(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | lowWord(x)) === 0) return x * PIO2_HI + X1P_120;
    return 0.0 / (x - x);
  }
  if (ix < 0x3fe00000) {
    if (ix >= 0x00100000 && ix < 0x3e500000) return x;
    return x + x * asinR(x * x);
  }
  const z = (1.0 - Math.abs(x)) * 0.5;
  const s = Math.sqrt(z);
  const r = asinR(z);
  if (ix >= 0x3fef3333) {
    x = PIO2_HI - (2 * (s + s * r) - PIO2_LO);
  } else {
    const f = withLowWord(s, 0);
    const c = (z - f * f) / (s + f);
    x = 0.5 * PIO2_HI - (2.0 * s * r - (PIO2_LO - 2.0 * c) - (0.5 * PIO2_HI - 2.0 * f));
  }
  return hx >>> 31 !== 0 ? -x : x;
}

export function acos(x: number): number {
  const hx = highWord(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | lowWord(x)) === 0) {
      if (hx >>> 31 !== 0) return 2 * PIO2_HI + X1P_120;
      return 0;
    }
    return 0 / (x - x);
  }
  if (ix < 0x3fe00000) {
    if (ix <= 0x3c600000) return PIO2_HI + X1P_120;
    return PIO2_HI - (x - (PIO2_LO - x * asinR(x * x)));
  }
  if (hx >>> 31 !== 0) {
    const z = (1.0 + x) * 0.5;
    const s = Math.sqrt(z);
    const w = asinR(z) * s - PIO2_LO;
    return 2 * (PIO2_HI - (s + w));
  }
  const z = (1.0 - x) * 0.5;
  const s = Math.sqrt(z);
  const df = withLowWord(s, 0);
  const c = (z - df * df) / (s + df);
  const w = asinR(z) * s + c;
  return 2 * (df + w);
}

// ---------------------------------------------------------------- atan, atan2 (s_atan.c, e_atan2.c)
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02,
];
const X1P_120F = fromWords(0x00000000, 0x03800000);

const ATAN_HUGE = below(0x44100000), ATAN_SMALL = below(0x3fdc0000), ATAN_TINY = below(0x3e400000);
const ATAN_B1 = below(0x3ff30000), ATAN_B0 = below(0x3fe60000), ATAN_B2 = below(0x40038000);
export function atan(x: number): number {
  const sign = x < 0;
  let ax = Math.abs(x);
  if (!(ax < ATAN_HUGE)) {
    if (x !== x) return x;
    const z = ATANHI[3] + X1P_120F;
    return sign ? -z : z;
  }
  let id: number;
  if (ax < ATAN_SMALL) {
    if (ax < ATAN_TINY) return x;
    id = -1;
    ax = x;
  } else if (ax < ATAN_B1) {
    if (ax < ATAN_B0) { ax = (2 * ax - 1) / (2 + ax); id = 0; } else { ax = (ax - 1) / (ax + 1); id = 1; }
  } else if (ax < ATAN_B2) { ax = (ax - 1.5) / (1 + 1.5 * ax); id = 2; } else { ax = -1 / ax; id = 3; }
  const z = ax * ax;
  const w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return ax - ax * (s1 + s2);
  const r = ATANHI[id] - (ax * (s1 + s2) - ATANLO[id] - ax);
  return sign ? -r : r;
}

const PI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16;
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return x + y;
  F64[0] = x;
  let ix = U32[1];
  const lx = U32[0];
  F64[0] = y;
  let iy = U32[1];
  const ly = U32[0];
  if ((((ix - 0x3ff00000) >>> 0) | lx) === 0) return atan(y);
  const m = ((iy >>> 31) & 1) | ((ix >>> 30) & 2);
  ix &= 0x7fffffff;
  iy &= 0x7fffffff;
  if ((iy | ly) === 0) {
    if (m === 0 || m === 1) return y;
    return m === 2 ? PI : -PI;
  }
  if ((ix | lx) === 0) return m & 1 ? -PI / 2 : PI / 2;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      if (m === 0) return PI / 4;
      if (m === 1) return -PI / 4;
      return m === 2 ? 3 * PI / 4 : -3 * PI / 4;
    }
    if (m === 0) return 0.0;
    if (m === 1) return -0.0;
    return m === 2 ? PI : -PI;
  }
  if (((ix + (64 << 20)) >>> 0) < iy || iy === 0x7ff00000) return m & 1 ? -PI / 2 : PI / 2;
  const z = (m & 2) !== 0 && ((iy + (64 << 20)) >>> 0) < ix ? 0.0 : atan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return PI - (z - PI_LO);
    default: return (z - PI_LO) - PI;
  }
}

// ---------------------------------------------------------------- exp, log (e_exp.c, e_log.c)
const LN2HI = 6.93147180369123816490e-01, LN2LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;

export function exp(x: number): number {
  let hx = highWord(x);
  const sign = hx >>> 31;
  hx &= 0x7fffffff;
  if (hx >= 0x4086232b) {
    if (x !== x) return x;
    if (x > 709.782712893383973096) return x * TWO_1023;
    if (x < -708.39641853226410622 && x < -745.13321910194110842) return 0;
  }
  let hi: number, lo: number, k: number;
  if (hx > 0x3fd62e42) {
    if (hx >= 0x3ff0a2b2) k = (INVLN2 * x + (sign === 0 ? 0.5 : -0.5)) | 0;
    else k = 1 - sign - sign;
    hi = x - k * LN2HI;
    lo = k * LN2LO;
    x = hi - lo;
  } else if (hx > 0x3e300000) {
    k = 0; hi = x; lo = 0;
  } else {
    return 1 + x;
  }
  const xx = x * x;
  const c = x - xx * (P1 + xx * (P2 + xx * (P3 + xx * (P4 + xx * P5))));
  const y = 1 + (x * c / (2 - c) - lo + hi);
  return k === 0 ? y : scalbn(y, k);
}

const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01;
const LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01;
const LG7 = 1.479819860511658591e-01;
const X1P54 = fromWords(0x43500000, 0);

export function log(x: number): number {
  let hx = highWord(x);
  let k = 0;
  if (hx < 0x00100000 || hx >>> 31 !== 0) {
    if (((hx << 1) | lowWord(x)) === 0) return -1 / (x * x);
    if (hx >>> 31 !== 0) return (x - x) / 0.0;
    k -= 54;
    x *= X1P54;
    hx = highWord(x);
  } else if (hx >= 0x7ff00000) {
    return x;
  } else if (hx === 0x3ff00000 && lowWord(x) === 0) {
    return 0;
  }
  hx = (hx + (0x3ff00000 - 0x3fe6a09e)) >>> 0;
  k += (hx >>> 20) - 0x3ff;
  hx = (hx & 0x000fffff) + 0x3fe6a09e;
  x = withHighWord(x, hx);
  const f = x - 1.0;
  const hfsq = 0.5 * f * f;
  const s = f / (2.0 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const r = t2 + t1;
  const dk = k;
  return s * (hfsq + r) + dk * LN2LO - hfsq + f + dk * LN2HI;
}

// ---------------------------------------------------------------- pow (e_pow.c)
const BP = [1.0, 1.5], DP_H = [0.0, 5.84962487220764160156e-01], DP_L = [0.0, 1.35003920212974897128e-08];
const TWO53 = 9007199254740992.0, HUGE = 1.0e300, TINY = 1.0e-300;
const L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01;
const L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01;
const LG2_ = 6.93147180559945286227e-01, LG2_H = 6.93147182464599609375e-01, LG2_L = -1.90465429995776804525e-09;
const OVT = 8.0085662595372944372e-017;
const CP = 9.61796693925975554329e-01, CP_H = 9.61796700954437255859e-01, CP_L = -7.02846165095275826516e-09;
const IVLN2 = 1.44269504088896338700e+00, IVLN2_H = 1.44269502162933349609e+00, IVLN2_L = 1.92596299112661746887e-08;

export function pow(x: number, y: number): number {
  // ECMAScript (Number::exponentiate), where it departs from C's pow: a NaN exponent gives NaN even on base 1, and
  // base ±1 with an infinite exponent gives NaN
  if (y !== y) return NaN;
  if ((x === 1 || x === -1) && (y === Infinity || y === -Infinity)) return NaN;
  let t1: number, t2: number;
  const hx = highWord(x) | 0, lx = lowWord(x);
  const hy = highWord(y) | 0, ly = lowWord(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return 1.0;
  if (hx === 0x3ff00000 && lx === 0) return 1.0;
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return x + y;
  let yisint = 0, k: number, j: number;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        j = (ly >>> (52 - k)) | 0;
        if ((j << (52 - k)) === (ly | 0)) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        j = iy >> (20 - k);
        if ((j << (20 - k)) === iy) yisint = 2 - (j & 1);
      }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if (((ix - 0x3ff00000) | lx) === 0) return 1.0;
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0.0;
      return hy >= 0 ? 0.0 : -y;
    }
    if (iy === 0x3ff00000) return hy >= 0 ? x : 1.0 / x;
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x);
  }
  let ax = Math.abs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {
    let z = ax;
    if (hy < 0) z = 1.0 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = (z - z) / (z - z);
      else if (yisint === 1) z = -z;
    }
    return z;
  }
  let s = 1.0;
  if (hx < 0) {
    if (yisint === 0) return (x - x) / (x - x);
    if (yisint === 1) s = -1.0;
  }
  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? HUGE * HUGE : TINY * TINY;
      if (ix >= 0x3ff00000) return hy > 0 ? HUGE * HUGE : TINY * TINY;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * HUGE * HUGE : s * TINY * TINY;
    if (ix > 0x3ff00000) return hy > 0 ? s * HUGE * HUGE : s * TINY * TINY;
    const t = ax - 1.0;
    const w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    const u = IVLN2_H * t;
    const v = t * IVLN2_L - w * IVLN2;
    t1 = withLowWord(u + v, 0);
    t2 = v - (t1 - u);
  } else {
    let n = 0;
    if (ix < 0x00100000) {
      ax *= TWO53;
      n -= 53;
      ix = highWord(ax) | 0;
    }
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    let kk: number;
    if (j <= 0x3988e) kk = 0;
    else if (j < 0xbb67a) kk = 1;
    else { kk = 0; n += 1; ix -= 0x00100000; }
    ax = withHighWord(ax, ix);
    const u = ax - BP[kk];
    const v = 1.0 / (ax + BP[kk]);
    const ss = u * v;
    const sH = withLowWord(ss, 0);
    let tH = fromWords((((ix >>> 1) | 0x20000000) + 0x00080000 + (kk << 18)) >>> 0, 0);
    let tL = ax - (tH - BP[kk]);
    const sL = v * ((u - sH * tH) - sH * tL);
    let s2 = ss * ss;
    let r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += sL * (sH + ss);
    s2 = sH * sH;
    tH = withLowWord(3.0 + s2 + r, 0);
    tL = r - ((tH - 3.0) - s2);
    const u2 = sH * tH;
    const v2 = sL * tH + tL * ss;
    const pH = withLowWord(u2 + v2, 0);
    const pL = v2 - (pH - u2);
    const zH = CP_H * pH;
    const zL = CP_L * pH + pL * CP + DP_L[kk];
    const t = n;
    t1 = withLowWord(((zH + zL) + DP_H[kk]) + t, 0);
    t2 = zL - (((t1 - t) - DP_H[kk]) - zH);
  }
  const y1 = withLowWord(y, 0);
  const pL = (y - y1) * t1 + y * t2;
  let pH = y1 * t1;
  let z = pL + pH;
  j = highWord(z) | 0;
  let i = lowWord(z) | 0;
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * HUGE * HUGE;
    if (pL + OVT > z - pH) return s * HUGE * HUGE;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if ((((j >>> 0) - 0xc090cc00) | (i >>> 0)) !== 0) return s * TINY * TINY;
    if (pL <= z - pH) return s * TINY * TINY;
  }
  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  let n = 0;
  if (i > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = fromWords((n & ~(0x000fffff >> k)) >>> 0, 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    pH -= t;
  }
  const t = withLowWord(pL + pH, 0);
  const u = t * LG2_H;
  const v = (pL - (t - pH)) * LG2_ + t * LG2_L;
  z = u + v;
  const w = v - (z - u);
  const tt = z * z;
  const t1b = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const r = (z * t1b) / (t1b - 2.0) - (w + z * w);
  z = 1.0 - (r - z);
  j = highWord(z) | 0;
  j += n << 20;
  if ((j >> 20) <= 0) z = scalbn(z, n);
  else z = withHighWord(z, j >>> 0);
  return s * z;
}

// ---------------------------------------------------------------- cbrt (FreeBSD s_cbrt.c, Bruce D. Evans)
const B1 = 715094163, B2 = 696219795;
const CP0 = 1.87595182427177009643, CP1 = -1.88497979543377169875, CP2 = 1.621429720105354466140;
const CP3 = -0.758397934778766047437, CP4 = 0.145996192886612446982;
const X1P54_HI = 0x43500000;

export function cbrt(x: number): number {
  let hx = highWord(x);
  const low = lowWord(x);
  const sign = hx & 0x80000000;
  hx = (hx ^ sign) >>> 0;
  if (hx >= 0x7ff00000) return x + x;
  let t: number;
  if (hx < 0x00100000) {
    if ((hx | low) === 0) return x;
    t = fromWords(X1P54_HI, 0) * x;
    const high = highWord(t);
    t = fromWords((sign | (Math.floor((high & 0x7fffffff) / 3) + B2)) >>> 0, 0);
  } else {
    t = fromWords((sign | (Math.floor(hx / 3) + B1)) >>> 0, 0);
  }
  let r = (t * t) * (t / x);
  t = t * ((CP0 + r * (CP1 + r * CP2)) + ((r * r) * r) * (CP3 + r * CP4));
  // round t away from zero to 23 bits: u.bits = (u.bits + 0x80000000) & 0xffffffffc0000000
  {
    const lo = lowWord(t);
    let hi = highWord(t);
    const sum = lo + 0x80000000;
    if (sum >= 0x100000000) hi = (hi + 1) >>> 0;
    t = fromWords(hi, (sum >>> 0) & 0xc0000000);
  }
  const s = t * t;
  r = x / s;
  const w = t + t;
  r = (r - t) / (w + r);
  return t + t * r;
}

// ---------------------------------------------------------------- expm1, tanh, cosh (s_expm1.c, s_tanh.c, e_cosh.c)
const O_THRESHOLD = 7.09782712893383973096e+02;
const Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03, Q3 = -7.93650757867487942473e-05;
const Q4 = 4.00821782732936239552e-06, Q5 = -2.01099218183624371326e-07;

export function expm1(x: number): number {
  const hxFull = highWord(x);
  const hx = hxFull & 0x7fffffff;
  const sign = hxFull >>> 31;
  let hi: number, lo: number, k: number, c: number;
  if (hx >= 0x4043687a) {
    if (x !== x) return x;
    if (sign !== 0) return -1.0;
    if (x > O_THRESHOLD) return x * TWO_1023;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (sign === 0) { hi = x - LN2HI; lo = LN2LO; k = 1; } else { hi = x + LN2HI; lo = -LN2LO; k = -1; }
    } else {
      k = (INVLN2 * x + (sign !== 0 ? -0.5 : 0.5)) | 0;
      const t = k;
      hi = x - t * LN2HI;
      lo = t * LN2LO;
    }
    x = hi - lo;
    c = (hi - x) - lo;
  } else if (hx < 0x3c900000) {
    return x;
  } else {
    c = 0.0; k = 0;
  }
  const hfx = 0.5 * x;
  const hxs = x * hfx;
  const r1 = 1.0 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  const t = 3.0 - r1 * hfx;
  let e = hxs * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs);
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return 1.0 + 2.0 * (x - e);
  }
  const twopk = fromWords(((0x3ff + k) << 20) >>> 0, 0);
  let y: number;
  if (k < 0 || k > 56) {
    y = x - e + 1.0;
    if (k === 1024) y = y * 2.0 * TWO_1023;
    else y = y * twopk;
    return y - 1.0;
  }
  const uf = fromWords(((0x3ff - k) << 20) >>> 0, 0);
  if (k < 20) y = (x - e + (1.0 - uf)) * twopk;
  else y = (x - (e + uf) + 1.0) * twopk;
  return y;
}

export function tanh(x: number): number {
  const hxFull = highWord(x);
  const sign = hxFull >>> 31 !== 0;
  x = withHighWord(x, hxFull & 0x7fffffff);
  const w = hxFull & 0x7fffffff;
  let t: number;
  if (w > 0x3fe193ea) {
    if (w > 0x40340000) t = 1.0 - 0.0 / x;
    else { t = expm1(2.0 * x); t = 1.0 - 2.0 / (t + 2.0); }
  } else if (w > 0x3fd058ae) {
    t = expm1(2.0 * x); t = t / (t + 2.0);
  } else if (w >= 0x00100000) {
    t = expm1(-2.0 * x); t = -t / (t + 2.0);
  } else {
    t = x;
  }
  return sign ? -t : t;
}

const K_LN2 = fromWords(0x40962066, 0x151add8b);
const EXPO2_SCALE = fromWords((0x3ff + (2043 >> 1)) << 20, 0);
export function cosh(x: number): number {
  x = withHighWord(x, highWord(x) & 0x7fffffff);
  const w = highWord(x);
  if (w < 0x3fe62e42) {
    if (w < 0x3ff00000 - (26 << 20)) return 1;
    const t = expm1(x);
    return 1 + t * t / (2 * (1 + t));
  }
  if (w < 0x40862e42) {
    const t = exp(x);
    return 0.5 * (t + 1 / t);
  }
  return exp(x - K_LN2) * EXPO2_SCALE * EXPO2_SCALE;
}

// ---------------------------------------------------------------- hypot (V8 MathHypot, math.tq)
/** Math.hypot as V8 evaluates it, for two to four numbers: an infinite argument beats a NaN; the squares of the
 * ratios to the largest are Kahan-summed. */
export function hypot(a: number, b: number, c?: number, d?: number): number {
  const count = d !== undefined ? 4 : c !== undefined ? 3 : 2;
  const v0 = Math.abs(a), v1 = Math.abs(b), v2 = count > 2 ? Math.abs(c as number) : 0, v3 = count > 3 ? Math.abs(d as number) : 0;
  let max = 0, nan = false;
  if (v0 !== v0) nan = true; else if (v0 > max) max = v0;
  if (v1 !== v1) nan = true; else if (v1 > max) max = v1;
  if (count > 2) { if (v2 !== v2) nan = true; else if (v2 > max) max = v2; }
  if (count > 3) { if (v3 !== v3) nan = true; else if (v3 > max) max = v3; }
  if (max === Infinity) return Infinity;
  if (nan) return NaN;
  if (max === 0) return 0;
  let sum = 0, compensation = 0;
  let n = v0 / max, summand = n * n - compensation, preliminary = sum + summand;
  compensation = (preliminary - sum) - summand; sum = preliminary;
  n = v1 / max; summand = n * n - compensation; preliminary = sum + summand;
  compensation = (preliminary - sum) - summand; sum = preliminary;
  if (count > 2) {
    n = v2 / max; summand = n * n - compensation; preliminary = sum + summand;
    compensation = (preliminary - sum) - summand; sum = preliminary;
  }
  if (count > 3) {
    n = v3 / max; summand = n * n - compensation; preliminary = sum + summand;
    compensation = (preliminary - sum) - summand; sum = preliminary;
  }
  return Math.sqrt(sum) * max;
}
