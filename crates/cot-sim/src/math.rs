//! `Vec3`: a double-precision vector whose operations mirror the three.js
//! `Vector3` methods the TypeScript simulation uses — including their
//! evaluation order and the `multiplyScalar(1 / s)` form of division — so the
//! ported arithmetic reproduces the TypeScript bits.

use crate::jsmath;

/// A 3-component `f64` vector (metres unless stated otherwise).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    /// x (right).
    pub x: f64,
    /// y (up).
    pub y: f64,
    /// z (forward for a tank at yaw 0).
    pub z: f64,
}

impl Vec3 {
    /// The zero vector.
    pub const ZERO: Vec3 = Vec3 { x: 0.0, y: 0.0, z: 0.0 };
    /// +Y.
    pub const UP: Vec3 = Vec3 { x: 0.0, y: 1.0, z: 0.0 };

    /// `new Vector3(x, y, z)`.
    #[inline]
    pub const fn new(x: f64, y: f64, z: f64) -> Vec3 {
        Vec3 { x, y, z }
    }

    /// `set(x, y, z)`.
    #[inline]
    pub fn set(&mut self, x: f64, y: f64, z: f64) -> &mut Vec3 {
        self.x = x;
        self.y = y;
        self.z = z;
        self
    }

    /// `copy(v)`.
    #[inline]
    pub fn copy_from(&mut self, v: &Vec3) -> &mut Vec3 {
        self.x = v.x;
        self.y = v.y;
        self.z = v.z;
        self
    }

    /// `add(v)`.
    #[inline]
    pub fn add(&mut self, v: &Vec3) -> &mut Vec3 {
        self.x += v.x;
        self.y += v.y;
        self.z += v.z;
        self
    }

    /// `sub(v)`.
    #[inline]
    pub fn sub(&mut self, v: &Vec3) -> &mut Vec3 {
        self.x -= v.x;
        self.y -= v.y;
        self.z -= v.z;
        self
    }

    /// `multiplyScalar(s)`.
    #[inline]
    pub fn multiply_scalar(&mut self, s: f64) -> &mut Vec3 {
        self.x *= s;
        self.y *= s;
        self.z *= s;
        self
    }

    /// `divideScalar(s)` — three.js multiplies by the reciprocal.
    #[inline]
    pub fn divide_scalar(&mut self, s: f64) -> &mut Vec3 {
        self.multiply_scalar(1.0 / s)
    }

    /// `addScaledVector(v, s)`.
    #[inline]
    pub fn add_scaled_vector(&mut self, v: &Vec3, s: f64) -> &mut Vec3 {
        self.x += v.x * s;
        self.y += v.y * s;
        self.z += v.z * s;
        self
    }

    /// `dot(v)`.
    #[inline]
    pub fn dot(&self, v: &Vec3) -> f64 {
        self.x * v.x + self.y * v.y + self.z * v.z
    }

    /// `lengthSq()`.
    #[inline]
    pub fn length_sq(&self) -> f64 {
        self.x * self.x + self.y * self.y + self.z * self.z
    }

    /// `length()`.
    #[inline]
    pub fn length(&self) -> f64 {
        jsmath::sqrt(self.x * self.x + self.y * self.y + self.z * self.z)
    }

    /// `normalize()` — `divideScalar(length() || 1)`.
    #[inline]
    pub fn normalize(&mut self) -> &mut Vec3 {
        let len = jsmath::or_zero(self.length());
        let len = if len == 0.0 { 1.0 } else { len };
        self.divide_scalar(len)
    }

    /// `crossVectors(a, b)`.
    #[inline]
    pub fn cross_vectors(&mut self, a: &Vec3, b: &Vec3) -> &mut Vec3 {
        let (ax, ay, az) = (a.x, a.y, a.z);
        let (bx, by, bz) = (b.x, b.y, b.z);
        self.x = ay * bz - az * by;
        self.y = az * bx - ax * bz;
        self.z = ax * by - ay * bx;
        self
    }

    /// `cross(v)` — `crossVectors(self, v)`.
    #[inline]
    pub fn cross(&mut self, v: &Vec3) -> &mut Vec3 {
        let a = *self;
        self.cross_vectors(&a, v)
    }

    /// `distanceToSquared(v)`.
    #[inline]
    pub fn distance_to_squared(&self, v: &Vec3) -> f64 {
        let dx = self.x - v.x;
        let dy = self.y - v.y;
        let dz = self.z - v.z;
        dx * dx + dy * dy + dz * dz
    }

    /// `distanceTo(v)`.
    #[inline]
    pub fn distance_to(&self, v: &Vec3) -> f64 {
        jsmath::sqrt(self.distance_to_squared(v))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_uses_the_reciprocal_like_three_js() {
        let mut v = Vec3::new(3.0, 0.0, 4.0);
        v.normalize();
        assert_eq!(v, Vec3::new(3.0 * (1.0 / 5.0), 0.0, 4.0 * (1.0 / 5.0)));
        let mut z = Vec3::ZERO;
        z.normalize();
        assert_eq!(z, Vec3::ZERO);
    }

    #[test]
    fn cross_matches_the_three_js_component_order() {
        let mut out = Vec3::ZERO;
        out.cross_vectors(&Vec3::new(1.0, 0.0, 0.0), &Vec3::new(0.0, 1.0, 0.0));
        assert_eq!(out, Vec3::new(0.0, 0.0, 1.0));
    }
}
