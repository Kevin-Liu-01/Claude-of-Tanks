//! ECMAScript-compatible numerics.
//!
//! The TypeScript simulation computes in IEEE-754 doubles with the semantics
//! of `Math.*`. This module reproduces the parts the port needs so a shell,
//! a hit or a route comes out identical on the native server and in the
//! browser bundle, and identical to the TypeScript receipts that validated
//! the game. Transcendentals come from the pure-Rust `libm` crate (fdlibm
//! lineage, the same family V8 ports in `src/base/ieee754.cc`); `std`'s
//! `f64::sin` and friends call whichever libm the target links and are
//! therefore banned inside this crate.

/// `Math.max(a, b)`: NaN propagates and `+0` beats `-0`.
#[inline]
pub fn max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        // Only +0/-0 compare equal while differing; prefer +0 like the spec.
        return if a.is_sign_negative() { b } else { a };
    }
    if a > b { a } else { b }
}

/// `Math.min(a, b)`: NaN propagates and `-0` beats `+0`.
#[inline]
pub fn min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    if a == b {
        return if a.is_sign_negative() { a } else { b };
    }
    if a < b { a } else { b }
}

/// `x || 0` for a numeric `x`: `0`, `-0` and `NaN` become `+0`.
#[inline]
pub fn or_zero(x: f64) -> f64 {
    if x == 0.0 || x.is_nan() { 0.0 } else { x }
}

/// `ToInt32` (ECMA-262 §7.1.6): the conversion `n | 0` performs.
pub fn to_int32(n: f64) -> i32 {
    if !n.is_finite() {
        return 0;
    }
    let t = n.trunc();
    let m = t.rem_euclid(4_294_967_296.0);
    (m as u32) as i32
}

/// `Math.round(x)`: the nearest integer, a tie toward +∞; `-0` from `[-0.5, -0]`, and NaN and the infinities as they are.
pub fn round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    if x > 0.0 && x < 0.5 {
        return 0.0;
    }
    if x < 0.0 && x >= -0.5 {
        return -0.0;
    }
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// `Math.imul(a, b)`: 32-bit wrapping multiply.
#[inline]
pub fn imul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// `Math.hypot(...values)` as V8 evaluates it (`MathHypot` in `math.tq`):
/// an infinite argument wins over a NaN, otherwise scale by the largest
/// magnitude, Kahan-sum the squared ratios, then `sqrt(sum) * max`. This is not
/// the fdlibm `hypot`, and the two differ in the last bit often enough to matter.
pub fn hypot(values: &[f64]) -> f64 {
    let mut max = 0.0;
    let mut one_is_nan = false;
    for &v in values {
        if v.is_nan() {
            one_is_nan = true;
        } else if v.abs() > max {
            max = v.abs();
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if one_is_nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for &v in values {
        let n = v.abs() / max;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sqrt(sum) * max
}

/// `Math.hypot(a, b)`.
#[inline]
pub fn hypot2(a: f64, b: f64) -> f64 {
    hypot(&[a, b])
}

/// `Math.hypot(a, b, c)`.
#[inline]
pub fn hypot3(a: f64, b: f64, c: f64) -> f64 {
    hypot(&[a, b, c])
}

/// `Math.sqrt`: correctly rounded on every IEEE target, so `std` is exact here.
#[inline]
pub fn sqrt(x: f64) -> f64 {
    x.sqrt()
}

/// `Math.abs`.
#[inline]
pub fn abs(x: f64) -> f64 {
    x.abs()
}

/// `Math.sin`.
#[inline]
pub fn sin(x: f64) -> f64 {
    libm::sin(x)
}

/// `Math.cos`.
#[inline]
pub fn cos(x: f64) -> f64 {
    libm::cos(x)
}

/// `Math.tan`.
#[inline]
pub fn tan(x: f64) -> f64 {
    libm::tan(x)
}

/// `Math.asin`.
#[inline]
pub fn asin(x: f64) -> f64 {
    libm::asin(x)
}

/// `Math.acos`.
#[inline]
pub fn acos(x: f64) -> f64 {
    libm::acos(x)
}

/// `Math.atan`.
#[inline]
pub fn atan(x: f64) -> f64 {
    libm::atan(x)
}

/// `Math.atan2`.
#[inline]
pub fn atan2(y: f64, x: f64) -> f64 {
    libm::atan2(y, x)
}

/// `Math.log` (natural logarithm).
#[inline]
pub fn log(x: f64) -> f64 {
    libm::log(x)
}

/// `Math.exp`.
#[inline]
pub fn exp(x: f64) -> f64 {
    libm::exp(x)
}

/// `Math.pow`: fdlibm's `e_pow.c` under ECMAScript's special cases (Number::exponentiate), where they depart from C:
/// a NaN exponent gives NaN even on base 1, and base ±1 with an infinite exponent gives NaN.
#[inline]
pub fn pow(x: f64, y: f64) -> f64 {
    if y.is_nan() || ((x == 1.0 || x == -1.0) && y.is_infinite()) {
        return f64::NAN;
    }
    libm::pow(x, y)
}

/// `Math.cbrt`: FreeBSD's `s_cbrt.c` (Bruce D. Evans, error < 0.667 ulp). The libm crate's cbrt is CORE-MATH's,
/// built on fused multiply-adds, which JavaScript cannot reproduce; this is the one the TypeScript port
/// (`src/sim/detMath.ts`) carries line for line, so both sides give the same bits.
pub fn cbrt(x: f64) -> f64 {
    const B1: u32 = 715_094_163; // (1023 - 1023/3 - 0.03306235651) * 2^20
    const B2: u32 = 696_219_795; // (1023 - 1023/3 - 54/3 - 0.03306235651) * 2^20
    const P0: f64 = 1.87595182427177009643;
    const P1: f64 = -1.88497979543377169875;
    const P2: f64 = 1.621429720105354466140;
    const P3: f64 = -0.758397934778766047437;
    const P4: f64 = 0.145996192886612446982;
    let bits = x.to_bits();
    let mut hx = (bits >> 32) as u32;
    let low = bits as u32;
    let sign = hx & 0x8000_0000;
    hx ^= sign;
    if hx >= 0x7ff0_0000 {
        return x + x;
    }
    let mut t = if hx < 0x0010_0000 {
        if (hx | low) == 0 {
            return x;
        }
        let t = f64::from_bits(0x4350_0000u64 << 32) * x;
        let high = (t.to_bits() >> 32) as u32;
        f64::from_bits(((sign | ((high & 0x7fff_ffff) / 3 + B2)) as u64) << 32)
    } else {
        f64::from_bits(((sign | (hx / 3 + B1)) as u64) << 32)
    };
    let r = (t * t) * (t / x);
    t *= (P0 + r * (P1 + r * P2)) + ((r * r) * r) * (P3 + r * P4);
    t = f64::from_bits((t.to_bits().wrapping_add(0x8000_0000)) & 0xffff_ffff_c000_0000);
    let s = t * t;
    let r = x / s;
    let w = t + t;
    let r = (r - t) / (w + r);
    t + t * r
}

/// `Math.tanh`.
#[inline]
pub fn tanh(x: f64) -> f64 {
    libm::tanh(x)
}

/// `Math.cosh`.
#[inline]
pub fn cosh(x: f64) -> f64 {
    libm::cosh(x)
}

/// `Math.expm1`.
#[inline]
pub fn expm1(x: f64) -> f64 {
    libm::expm1(x)
}

/// `Math.PI`.
pub const PI: f64 = core::f64::consts::PI;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_int32_wraps_like_ecmascript() {
        assert_eq!(to_int32(0.0), 0);
        assert_eq!(to_int32(-1.0), -1);
        assert_eq!(to_int32(4_294_967_296.0), 0);
        assert_eq!(to_int32(4_294_967_295.0), -1);
        assert_eq!(to_int32(2_147_483_648.0), i32::MIN);
        assert_eq!(to_int32(1e20), 1_661_992_960);
        assert_eq!(to_int32(f64::NAN), 0);
        assert_eq!(to_int32(f64::INFINITY), 0);
        assert_eq!(to_int32(-7.9), -7);
    }

    #[test]
    fn max_min_follow_the_spec_for_zeros_and_nan() {
        assert!(max(1.0, f64::NAN).is_nan());
        assert!(min(f64::NAN, 1.0).is_nan());
        assert!(max(-0.0, 0.0).is_sign_positive());
        assert!(max(0.0, -0.0).is_sign_positive());
        assert!(min(-0.0, 0.0).is_sign_negative());
        assert_eq!(max(0.0, -1.0), 0.0);
        assert_eq!(or_zero(-0.0).to_bits(), 0.0f64.to_bits());
        assert_eq!(or_zero(f64::NAN), 0.0);
        assert_eq!(or_zero(3.5), 3.5);
    }

    #[test]
    fn hypot_matches_the_v8_formula_on_simple_inputs() {
        assert_eq!(hypot2(3.0, 4.0), 5.0);
        assert_eq!(hypot2(0.0, 0.0), 0.0);
        assert_eq!(hypot2(-3.0, 0.0), 3.0);
        assert!(hypot2(f64::NAN, 1.0).is_nan());
        assert_eq!(hypot2(f64::INFINITY, f64::NAN), f64::INFINITY);
    }
}
