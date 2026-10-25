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

/// `Math.imul(a, b)`: 32-bit wrapping multiply.
#[inline]
pub fn imul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// `Math.hypot(a, b)` as V8 evaluates it: scale by the largest magnitude,
/// Kahan-sum the squared ratios, then `sqrt(sum) * max`. This is not the
/// fdlibm `hypot`, and the two differ in the last bit often enough to matter.
pub fn hypot2(a: f64, b: f64) -> f64 {
    let a = a.abs();
    let b = b.abs();
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let m = if a > b { a } else { b };
    if m == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for n in [a, b] {
        let n = n / m;
        let summand = n * n - compensation;
        let preliminary = sum + summand;
        compensation = (preliminary - sum) - summand;
        sum = preliminary;
    }
    sqrt(sum) * m
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

/// `Math.pow`.
#[inline]
pub fn pow(x: f64, y: f64) -> f64 {
    libm::pow(x, y)
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
