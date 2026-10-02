//! cot-world-kernel — a bit-exact Rust/WebAssembly port of `src/engine/simplexFast.ts` (the Gustavson simplex
//! noise of three.js's `SimplexNoise`, with the same permutation tables and the same floating-point operation
//! order), loaded by `src/wasm/worldKernel.ts` behind the `?wasm=world` opt-in.
//!
//! Why noise, and why it may run outside JavaScript: a battlefield build evaluates the exact height field a few
//! million times (terrain chunks, the fold grid, grass and props placement), and every sample spends about half of
//! its time in thirteen 2D noise calls. The heights are authoritative — collision, spotting and the multiplayer
//! host read them — so a faster path must return the identical IEEE-754 doubles, never an approximation. That
//! rules out the GPU (its float results differ by vendor) and admits deterministic CPU code: WebAssembly `f64`
//! arithmetic is IEEE-754 binary64 with round-to-nearest, no fused multiply-add and no extended precision, and
//! `f64.floor` is exact, so this port reproduces the JavaScript bits on every machine.
//!
//! Exactness rules this file keeps (the self-test in `src/engine/worldKernel.selftest.mjs` is the oracle):
//! - every expression keeps the TypeScript evaluation order (left to right, no reassociation, no FMA);
//! - `x & 255` on a double is ECMAScript `ToInt32` ([`to_int32`]), exact for every input including NaN, ±∞ and
//!   magnitudes beyond 2^31;
//! - table indices are masked to the table length; the loader binds only tables whose permutation entries lie in
//!   0..=255 (what `Math.floor(random() * 256)` produces), and for those the masks never change an index — they
//!   only let the compiler drop bounds checks.
//!
//! ABI (raw C ABI, no wasm-bindgen: no JavaScript object crosses the boundary): `cot_abi()`, `cot_tables()` (base
//! of the 3 × 512 `i32` tables: perm, perm % 12, perm % 32), `cot_noise2(x, y)`, `cot_noise3(x, y, z)`,
//! `cot_noise4(x, y, z, w)`. One instance holds one table, the loader creates one instance per `SimplexNoise`.

/// Bumped whenever an export or the table layout changes; the loader refuses any other value.
pub const ABI: u32 = 1;

const PERM: usize = 0;
const PM12: usize = 512;
const PM32: usize = 1024;
static mut TABLES: [i32; 1536] = [0; 1536];

// Gradient tables padded to a power of two so `(index & mask) * stride` stays in bounds without a check; the
// padding rows are never selected for a validated table (perm % 12 < 12, perm % 32 < 32).
const GRAD3: [f64; 48] = [
    1., 1., 0., -1., 1., 0., 1., -1., 0., -1., -1., 0., //
    1., 0., 1., -1., 0., 1., 1., 0., -1., -1., 0., -1., //
    0., 1., 1., 0., -1., 1., 0., 1., -1., 0., -1., -1., //
    0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., 0., //
];

const GRAD4: [f64; 128] = [
    0., 1., 1., 1., 0., 1., 1., -1., 0., 1., -1., 1., 0., 1., -1., -1., //
    0., -1., 1., 1., 0., -1., 1., -1., 0., -1., -1., 1., 0., -1., -1., -1., //
    1., 0., 1., 1., 1., 0., 1., -1., 1., 0., -1., 1., 1., 0., -1., -1., //
    -1., 0., 1., 1., -1., 0., 1., -1., -1., 0., -1., 1., -1., 0., -1., -1., //
    1., 1., 0., 1., 1., 1., 0., -1., 1., -1., 0., 1., 1., -1., 0., -1., //
    -1., 1., 0., 1., -1., 1., 0., -1., -1., -1., 0., 1., -1., -1., 0., -1., //
    1., 1., 1., 0., 1., 1., -1., 0., 1., -1., 1., 0., 1., -1., -1., 0., //
    -1., 1., 1., 0., -1., 1., -1., 0., -1., -1., 1., 0., -1., -1., -1., 0., //
];

// 4D simplex traversal table, flattened (64 rows × 4), identical to simplexFast.ts.
const SIMPLEX: [u8; 256] = [
    0, 1, 2, 3, 0, 1, 3, 2, 0, 0, 0, 0, 0, 2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, //
    0, 2, 1, 3, 0, 0, 0, 0, 0, 3, 1, 2, 0, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 0, //
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //
    1, 2, 0, 3, 0, 0, 0, 0, 1, 3, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 0, 1, 2, 3, 1, 0, //
    1, 0, 2, 3, 1, 0, 3, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 1, 0, 0, 0, 0, 2, 1, 3, 0, //
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //
    2, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 1, 2, 3, 0, 2, 1, 0, 0, 0, 0, 3, 1, 2, 0, //
    2, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 0, 2, 0, 0, 0, 0, 3, 2, 0, 1, 3, 2, 1, 0, //
];

// The skew constants exactly as simplexFast.ts computes them at module scope (`Math.sqrt` is correctly rounded,
// and Rust evaluates these `const` expressions in IEEE-754 binary64 like the JavaScript engine does).
const SQRT3: f64 = 1.7320508075688772; // Math.sqrt(3.0)
const SQRT5: f64 = 2.23606797749979; // Math.sqrt(5.0)
const F2: f64 = 0.5 * (SQRT3 - 1.0);
const G2: f64 = (3.0 - SQRT3) / 6.0;
const F3: f64 = 1.0 / 3.0;
const G3: f64 = 1.0 / 6.0;
const F4: f64 = (SQRT5 - 1.0) / 4.0;
const G4: f64 = (5.0 - SQRT5) / 20.0;

/// `Math.floor`: std's `f64::floor` lowers to the single `f64.floor` instruction on wasm32 (exact IEEE-754
/// roundTowardNegative, the sign of zero kept). The crate links std only for this; with no allocation, no formatting
/// and panic = "abort" nothing else of std reaches the binary, which still imports nothing.
#[inline(always)]
fn floor(x: f64) -> f64 {
    x.floor()
}

/// ECMAScript `ToInt32` for an integral double (a floor result), NaN or ±∞ — what `value & 255` applies.
#[inline(always)]
fn to_int32(v: f64) -> i32 {
    // Every real coordinate lands here: integral and inside the int32 range, where the cast is exact.
    if v > -2_147_483_649.0 && v < 2_147_483_648.0 {
        return v as i32;
    }
    to_int32_wide(v)
}

#[inline(never)]
#[cold]
fn to_int32_wide(v: f64) -> i32 {
    if !(v > f64::NEG_INFINITY && v < f64::INFINITY) {
        return 0; // NaN, +∞, −∞
    }
    if v > -9_223_372_036_854_775_808.0 && v < 9_223_372_036_854_775_808.0 {
        // integral and inside the int64 range: the cast is exact and the narrowing wraps modulo 2^32
        return (v as i64) as i32;
    }
    // |v| ≥ 2^63: v = mantissa × 2^shift with shift ≥ 11; the low 32 bits of that integer, then the sign.
    let bits = v.to_bits();
    let shift = ((bits >> 52) & 0x7ff) as u32 - 1075;
    if shift >= 32 {
        return 0;
    }
    let mantissa = (bits & 0x000f_ffff_ffff_ffff) | 0x0010_0000_0000_0000;
    let low = (mantissa << shift) as u32;
    (if v < 0.0 { 0u32.wrapping_sub(low) } else { low }) as i32
}

#[inline(always)]
fn perm(i: usize) -> usize {
    // SAFETY: single-threaded wasm instance; TABLES is only written through `cot_tables()` before any call.
    unsafe { (*core::ptr::addr_of!(TABLES))[PERM + (i & 511)] as usize }
}

#[inline(always)]
fn pm12(i: usize) -> usize {
    unsafe { ((*core::ptr::addr_of!(TABLES))[PM12 + (i & 511)] & 15) as usize }
}

#[inline(always)]
fn pm32(i: usize) -> usize {
    unsafe { ((*core::ptr::addr_of!(TABLES))[PM32 + (i & 511)] & 31) as usize }
}

/// The ABI version the loader checks before binding.
#[unsafe(no_mangle)]
pub extern "C" fn cot_abi() -> u32 {
    ABI
}

/// Base address of the instance's tables: perm[512], perm % 12 [512], perm % 32 [512] (`i32`).
#[unsafe(no_mangle)]
pub extern "C" fn cot_tables() -> *mut i32 {
    core::ptr::addr_of_mut!(TABLES) as *mut i32
}

/// `SimplexNoise.noise(xin, yin)`.
#[unsafe(no_mangle)]
pub extern "C" fn cot_noise2(xin: f64, yin: f64) -> f64 {
    let s = (xin + yin) * F2;
    let i = floor(xin + s);
    let j = floor(yin + s);
    let t = (i + j) * G2;
    let x_0 = i - t;
    let y_0 = j - t;
    let x0 = xin - x_0;
    let y0 = yin - y_0;
    let (i1, j1) = if x0 > y0 { (1usize, 0usize) } else { (0usize, 1usize) };
    let x1 = x0 - i1 as f64 + G2;
    let y1 = y0 - j1 as f64 + G2;
    let x2 = x0 - 1.0 + 2.0 * G2;
    let y2 = y0 - 1.0 + 2.0 * G2;
    let ii = (to_int32(i) & 255) as usize;
    let jj = (to_int32(j) & 255) as usize;
    let gi0 = pm12(ii + perm(jj)) * 3;
    let gi1 = pm12(ii + i1 + perm(jj + j1)) * 3;
    let gi2 = pm12(ii + 1 + perm(jj + 1)) * 3;
    let mut t0 = 0.5 - x0 * x0 - y0 * y0;
    let n0 = if t0 < 0.0 {
        0.0
    } else {
        t0 *= t0;
        t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0)
    };
    let mut t1 = 0.5 - x1 * x1 - y1 * y1;
    let n1 = if t1 < 0.0 {
        0.0
    } else {
        t1 *= t1;
        t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1)
    };
    let mut t2 = 0.5 - x2 * x2 - y2 * y2;
    let n2 = if t2 < 0.0 {
        0.0
    } else {
        t2 *= t2;
        t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2)
    };
    70.0 * (n0 + n1 + n2)
}

/// `SimplexNoise.noise3d(xin, yin, zin)`.
#[unsafe(no_mangle)]
pub extern "C" fn cot_noise3(xin: f64, yin: f64, zin: f64) -> f64 {
    let s = (xin + yin + zin) * F3;
    let i = floor(xin + s);
    let j = floor(yin + s);
    let k = floor(zin + s);
    let t = (i + j + k) * G3;
    let x_0 = i - t;
    let y_0 = j - t;
    let z_0 = k - t;
    let x0 = xin - x_0;
    let y0 = yin - y_0;
    let z0 = zin - z_0;
    let (i1, j1, k1, i2, j2, k2): (usize, usize, usize, usize, usize, usize);
    if x0 >= y0 {
        if y0 >= z0 {
            (i1, j1, k1, i2, j2, k2) = (1, 0, 0, 1, 1, 0);
        } else if x0 >= z0 {
            (i1, j1, k1, i2, j2, k2) = (1, 0, 0, 1, 0, 1);
        } else {
            (i1, j1, k1, i2, j2, k2) = (0, 0, 1, 1, 0, 1);
        }
    } else if y0 < z0 {
        (i1, j1, k1, i2, j2, k2) = (0, 0, 1, 0, 1, 1);
    } else if x0 < z0 {
        (i1, j1, k1, i2, j2, k2) = (0, 1, 0, 0, 1, 1);
    } else {
        (i1, j1, k1, i2, j2, k2) = (0, 1, 0, 1, 1, 0);
    }
    let x1 = x0 - i1 as f64 + G3;
    let y1 = y0 - j1 as f64 + G3;
    let z1 = z0 - k1 as f64 + G3;
    let x2 = x0 - i2 as f64 + 2.0 * G3;
    let y2 = y0 - j2 as f64 + 2.0 * G3;
    let z2 = z0 - k2 as f64 + 2.0 * G3;
    let x3 = x0 - 1.0 + 3.0 * G3;
    let y3 = y0 - 1.0 + 3.0 * G3;
    let z3 = z0 - 1.0 + 3.0 * G3;
    let ii = (to_int32(i) & 255) as usize;
    let jj = (to_int32(j) & 255) as usize;
    let kk = (to_int32(k) & 255) as usize;
    let gi0 = pm12(ii + perm(jj + perm(kk))) * 3;
    let gi1 = pm12(ii + i1 + perm(jj + j1 + perm(kk + k1))) * 3;
    let gi2 = pm12(ii + i2 + perm(jj + j2 + perm(kk + k2))) * 3;
    let gi3 = pm12(ii + 1 + perm(jj + 1 + perm(kk + 1))) * 3;
    let mut t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    let n0 = if t0 < 0.0 {
        0.0
    } else {
        t0 *= t0;
        t0 * t0 * (GRAD3[gi0] * x0 + GRAD3[gi0 + 1] * y0 + GRAD3[gi0 + 2] * z0)
    };
    let mut t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    let n1 = if t1 < 0.0 {
        0.0
    } else {
        t1 *= t1;
        t1 * t1 * (GRAD3[gi1] * x1 + GRAD3[gi1 + 1] * y1 + GRAD3[gi1 + 2] * z1)
    };
    let mut t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    let n2 = if t2 < 0.0 {
        0.0
    } else {
        t2 *= t2;
        t2 * t2 * (GRAD3[gi2] * x2 + GRAD3[gi2 + 1] * y2 + GRAD3[gi2 + 2] * z2)
    };
    let mut t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    let n3 = if t3 < 0.0 {
        0.0
    } else {
        t3 *= t3;
        t3 * t3 * (GRAD3[gi3] * x3 + GRAD3[gi3 + 1] * y3 + GRAD3[gi3 + 2] * z3)
    };
    32.0 * (n0 + n1 + n2 + n3)
}

#[inline(always)]
fn rank_weight(value: f64, other: f64, weight: usize) -> usize {
    if value > other { weight } else { 0 }
}

#[inline(always)]
fn simplex_offset(rank: u8, threshold: u8) -> usize {
    if rank >= threshold { 1 } else { 0 }
}

#[inline(always)]
fn contribution4d(x: f64, y: f64, z: f64, w: f64, gradient: usize) -> f64 {
    let mut attenuation = 0.6 - x * x - y * y - z * z - w * w;
    if attenuation < 0.0 {
        return 0.0;
    }
    attenuation *= attenuation;
    attenuation * attenuation
        * (GRAD4[gradient] * x + GRAD4[gradient + 1] * y + GRAD4[gradient + 2] * z + GRAD4[gradient + 3] * w)
}

/// `SimplexNoise.noise4d(x, y, z, w)`.
#[unsafe(no_mangle)]
pub extern "C" fn cot_noise4(x: f64, y: f64, z: f64, w: f64) -> f64 {
    let s = (x + y + z + w) * F4;
    let i = floor(x + s);
    let j = floor(y + s);
    let k = floor(z + s);
    let l = floor(w + s);
    let t = (i + j + k + l) * G4;
    let x_0 = i - t;
    let y_0 = j - t;
    let z_0 = k - t;
    let w_0 = l - t;
    let x0 = x - x_0;
    let y0 = y - y_0;
    let z0 = z - z_0;
    let w0 = w - w_0;
    let c = rank_weight(x0, y0, 32)
        + rank_weight(x0, z0, 16)
        + rank_weight(y0, z0, 8)
        + rank_weight(x0, w0, 4)
        + rank_weight(y0, w0, 2)
        + rank_weight(z0, w0, 1);
    let c4 = (c * 4) & 255;
    let (sc0, sc1, sc2, sc3) = (SIMPLEX[c4], SIMPLEX[c4 + 1], SIMPLEX[c4 + 2], SIMPLEX[c4 + 3]);
    let (i1, j1, k1, l1) = (
        simplex_offset(sc0, 3),
        simplex_offset(sc1, 3),
        simplex_offset(sc2, 3),
        simplex_offset(sc3, 3),
    );
    let (i2, j2, k2, l2) = (
        simplex_offset(sc0, 2),
        simplex_offset(sc1, 2),
        simplex_offset(sc2, 2),
        simplex_offset(sc3, 2),
    );
    let (i3, j3, k3, l3) = (
        simplex_offset(sc0, 1),
        simplex_offset(sc1, 1),
        simplex_offset(sc2, 1),
        simplex_offset(sc3, 1),
    );
    let x1 = x0 - i1 as f64 + G4;
    let y1 = y0 - j1 as f64 + G4;
    let z1 = z0 - k1 as f64 + G4;
    let w1 = w0 - l1 as f64 + G4;
    let x2 = x0 - i2 as f64 + 2.0 * G4;
    let y2 = y0 - j2 as f64 + 2.0 * G4;
    let z2 = z0 - k2 as f64 + 2.0 * G4;
    let w2 = w0 - l2 as f64 + 2.0 * G4;
    let x3 = x0 - i3 as f64 + 3.0 * G4;
    let y3 = y0 - j3 as f64 + 3.0 * G4;
    let z3 = z0 - k3 as f64 + 3.0 * G4;
    let w3 = w0 - l3 as f64 + 3.0 * G4;
    let x4 = x0 - 1.0 + 4.0 * G4;
    let y4 = y0 - 1.0 + 4.0 * G4;
    let z4 = z0 - 1.0 + 4.0 * G4;
    let w4 = w0 - 1.0 + 4.0 * G4;
    let ii = (to_int32(i) & 255) as usize;
    let jj = (to_int32(j) & 255) as usize;
    let kk = (to_int32(k) & 255) as usize;
    let ll = (to_int32(l) & 255) as usize;
    let gi0 = pm32(ii + perm(jj + perm(kk + perm(ll)))) * 4;
    let gi1 = pm32(ii + i1 + perm(jj + j1 + perm(kk + k1 + perm(ll + l1)))) * 4;
    let gi2 = pm32(ii + i2 + perm(jj + j2 + perm(kk + k2 + perm(ll + l2)))) * 4;
    let gi3 = pm32(ii + i3 + perm(jj + j3 + perm(kk + k3 + perm(ll + l3)))) * 4;
    let gi4 = pm32(ii + 1 + perm(jj + 1 + perm(kk + 1 + perm(ll + 1)))) * 4;
    let n0 = contribution4d(x0, y0, z0, w0, gi0);
    let n1 = contribution4d(x1, y1, z1, w1, gi1);
    let n2 = contribution4d(x2, y2, z2, w2, gi2);
    let n3 = contribution4d(x3, y3, z3, w3, gi3);
    let n4 = contribution4d(x4, y4, z4, w4, gi4);
    27.0 * (n0 + n1 + n2 + n3 + n4)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_int32_matches_ecmascript() {
        assert_eq!(to_int32(0.0), 0);
        assert_eq!(to_int32(-0.0), 0);
        assert_eq!(to_int32(-3.0), -3);
        assert_eq!(to_int32(2_147_483_648.0), i32::MIN);
        assert_eq!(to_int32(4_294_967_295.0), -1);
        assert_eq!(to_int32(4_294_967_296.0), 0);
        assert_eq!(to_int32(1e20), 1_661_992_960);
        assert_eq!(to_int32(-1e20), -1_661_992_960);
        assert_eq!(to_int32(9_223_372_036_854_775_808.0), 0);
        assert_eq!(to_int32(f64::NAN), 0);
        assert_eq!(to_int32(f64::INFINITY), 0);
        assert_eq!(to_int32(f64::NEG_INFINITY), 0);
    }

    #[test]
    fn skew_constants_are_the_javascript_doubles() {
        // Math.sqrt(3) and Math.sqrt(5) as V8 prints them (shortest round trip).
        assert_eq!(SQRT3, 3f64.sqrt());
        assert_eq!(SQRT5, 5f64.sqrt());
    }
}
