//! The ground a match deforms — `src/sim/terrainDeformation.ts`, bit for bit.
//!
//! A per-match overlay of stamps added to the terrain the simulation drives on: craters (a bowl and a thrown rim,
//! ragged by a seed), rubble heaps (a crown over a collapsed structure's footprint and a cosine skirt) and graded
//! courses (a piecewise-linear profile along an axis). Stamps are bucketed on a 16 m grid; the contact lattice's vertex
//! offsets are cached until the overlay can read differently. Every arithmetic path keeps the TypeScript's operation
//! order and its transcendentals go through [`crate::jsmath`] (the TypeScript's `detMath`), so the golden vectors
//! (`tests/golden/deformation.json`, generated from the TypeScript) compare to the bit.

use crate::jsmath;

const BUCKET_M: f64 = 16.0;
const WORLD_HALF_M: f64 = 512.0;
/// Buckets along each side of the 1,024 m map.
pub const BUCKETS: usize = 64;
/// At most this many stamps touch one bucket.
pub const STAMPS_PER_BUCKET: usize = 8;
const MAX_DEPTH_M: f64 = 2.5;
const MAX_RAISE_M: f64 = 3.0;
const MAX_COURSE_M: f64 = 6.0;
const LATTICE_STEP: f64 = 128.0 / 96.0;
const LATTICE_CELLS: usize = 768;
const LATTICE_VERTICES: usize = LATTICE_CELLS + 1;
const LATTICE_CACHE_SLOTS: usize = 8192;
const CRATER_REACH: f64 = 2.0;
const CRATER_FADE_START: f64 = 1.6;
const RIM_INNER: f64 = 0.3;
const RIM_OUTER: f64 = 0.55;
const RIM_BREAK: f64 = 0.45;
const RUBBLE_PLATEAU: f64 = 0.7;
const RUBBLE_SKIRT_MIN_M: f64 = 3.0;
const RUBBLE_SKIRT_PER_HEIGHT: f64 = 2.2;
const CROWN_DROP: f64 = 0.42;
const CROWN_LEAN: f64 = 0.55;
const CROWN_WAVE_M: f64 = 4.5;
/// How long a heap takes to rise (s).
pub const RUBBLE_GROW_S: f64 = 2.0;

/// One stamp (the TypeScript's `TerrainStamp` with its precomputed fields).
#[derive(Clone, Debug)]
#[allow(missing_docs)] // (the fields are the TypeScript's, named alike)
pub enum Stamp {
    /// A crater's bowl and ragged rim.
    Crater { x: f64, z: f64, radius_m: f64, depth_m: f64, rim_m: f64, p1: f64, p2: f64, p3: f64 },
    /// A rubble heap: footprint, yaw's cos and sin, height, skirt, rise clock and crown.
    Rubble { cx: f64, cz: f64, hw: f64, hd: f64, c: f64, s: f64, height_m: f64, falloff_m: f64, t0: f64, grow_s: f64, crown: [f64; 9] },
    /// A graded earthwork: axis cos and sin, band half width, skirt and its (u, h) knots.
    Course { cx: f64, cz: f64, c: f64, s: f64, hw: f64, skirt_m: f64, profile: Vec<f64> },
}

/// `bucketIndex`: the 16 m bucket of a coordinate, clamped to the map; NaN stays NaN (the TypeScript's index is then no
/// bucket at all).
fn bucket_index(value: f64) -> f64 {
    let index = ((value + WORLD_HALF_M) / BUCKET_M).floor();
    if index < 0.0 {
        0.0
    } else if index >= BUCKETS as f64 {
        (BUCKETS - 1) as f64
    } else {
        index
    }
}

/// The bucket of (x, z), or None where the TypeScript's typed-array read is `undefined` (a NaN coordinate).
fn bucket_of(x: f64, z: f64) -> Option<usize> {
    let (bx, bz) = (bucket_index(x), bucket_index(z));
    if bx.is_nan() || bz.is_nan() {
        None
    } else {
        Some(bz as usize * BUCKETS + bx as usize)
    }
}

/// `rubbleGrowth`: the share of its height a heap stands `elapsed_s` after it began to rise.
pub fn rubble_growth(elapsed_s: f64, grow_s: f64) -> f64 {
    if !(elapsed_s < grow_s) {
        return 1.0;
    }
    if !(elapsed_s > 0.0) {
        return 0.0;
    }
    let u = elapsed_s / grow_s;
    u * u * (3.0 - 2.0 * u)
}

/// `rubbleFalloffM`: the ground a heap reaches past its footprint.
pub fn rubble_falloff_m(hw: f64, hd: f64, height_m: f64) -> f64 {
    0.3 * jsmath::min(hw, hd) + jsmath::max(RUBBLE_SKIRT_MIN_M, RUBBLE_SKIRT_PER_HEIGHT * jsmath::max(0.0, height_m))
}

/// `phases`: a crater seed's three wobble phases.
pub fn phases(seed: u32) -> [f64; 3] {
    let turn = |v: u32| ((v & 0xff) as f64 / 256.0) * jsmath::PI * 2.0;
    [turn(seed), turn(seed >> 8), turn(seed >> 16)]
}

/// `heapCrown`: a heap's lean, swell phases and wave numbers from its footprint.
pub fn heap_crown(cx: f64, cz: f64, hw: f64, hd: f64) -> [f64; 9] {
    let a = jsmath::to_int32(jsmath::round(cx * 100.0)) ^ 0x5bd1e995u32 as i32;
    let b = jsmath::to_int32(jsmath::round(cz * 100.0)) ^ 0x27d4eb2fu32 as i32;
    let mut h = jsmath::imul(a, 0x9e3779b1u32 as i32) ^ jsmath::imul(b, 0x85ebca77u32 as i32);
    h ^= ((h as u32) >> 15) as i32;
    h = jsmath::imul(h, 0x2c1b3c6d);
    h ^= ((h as u32) >> 12) as i32;
    h = jsmath::imul(h, 0x297a2d39);
    h ^= ((h as u32) >> 15) as i32;
    let turn = |shift: u32| ((((h as u32) >> shift) & 0xff) as f64 / 256.0) * jsmath::PI * 2.0;
    let lean = turn(0);
    let mut out = [0.0; 9];
    out[0] = jsmath::cos(lean);
    out[1] = jsmath::sin(lean);
    out[2] = turn(8);
    out[3] = turn(16);
    out[4] = turn(24);
    let ea = jsmath::max(1e-3, hd * RUBBLE_PLATEAU);
    let eb = jsmath::max(1e-3, hw * RUBBLE_PLATEAU);
    out[5] = (jsmath::PI * 2.0 * ea) / jsmath::max(CROWN_WAVE_M, (2.0 * ea) / 1.5);
    out[6] = (jsmath::PI * 2.0 * eb) / jsmath::max(CROWN_WAVE_M, (2.0 * eb) / 1.5);
    out[7] = out[5] / 1.3;
    out[8] = out[6] / 1.3;
    out
}

/// `craterProfile`: a crater's height at distance `r` from its centre, at `angle`.
#[allow(clippy::too_many_arguments)]
fn crater_profile(radius_m: f64, depth_m: f64, rim_m: f64, p1: f64, p2: f64, p3: f64, r: f64, angle: f64) -> f64 {
    let wobble = 1.0 + 0.08 * (0.5 * jsmath::sin(3.0 * angle + p1) + 0.3 * jsmath::sin(5.0 * angle + p2) + 0.2 * jsmath::sin(7.0 * angle + p3));
    let radius = radius_m * wobble;
    if !(radius > 0.0) || r >= radius * CRATER_REACH {
        return 0.0;
    }
    let q = r / radius;
    let bowl = if q < 1.0 { -depth_m * (1.0 - q * q) * (1.0 - q * q) } else { 0.0 };
    let ring = (q - 1.0) / (if q < 1.0 { RIM_INNER } else { RIM_OUTER });
    let broken = 1.0 + RIM_BREAK * (0.5 * jsmath::sin(2.0 * angle + p2) + 0.3 * jsmath::sin(4.0 * angle + p3) + 0.2 * jsmath::sin(6.0 * angle + p1));
    let mut rim = rim_m * broken * jsmath::exp(-ring * ring);
    if q > CRATER_FADE_START {
        let t = (CRATER_REACH - q) / (CRATER_REACH - CRATER_FADE_START);
        rim *= t * t * (3.0 - 2.0 * t);
    }
    bowl + rim
}

/// `courseProfile`: a course's height at (x, z).
fn course_profile(cx: f64, cz: f64, c: f64, s: f64, hw: f64, skirt_m: f64, profile: &[f64], x: f64, z: f64) -> f64 {
    let (dx, dz) = (x - cx, z - cz);
    let u = dx * s + dz * c;
    let v = (dx * c - dz * s).abs();
    let past = v - hw;
    if past >= skirt_m {
        return 0.0;
    }
    if profile.len() < 2 {
        return 0.0;
    }
    let last = profile.len() - 2;
    if u <= profile[0] || u >= profile[last] {
        return 0.0;
    }
    let mut k = 0;
    while k + 2 < last && profile[k + 2] <= u {
        k += 2;
    }
    let (u0, u1) = (profile[k], profile[k + 2]);
    let h = profile[k + 1] + (profile[k + 3] - profile[k + 1]) * (if u1 > u0 { (u - u0) / (u1 - u0) } else { 0.0 });
    if past > 0.0 { h * 0.5 * (1.0 + jsmath::cos(jsmath::PI * past / skirt_m)) } else { h }
}

/// `heapHeight`: the heap at (x, z) — its crown at the nearest plateau point, the cosine skirt past the plateau's edge.
#[allow(clippy::too_many_arguments)]
fn heap_height(cx: f64, cz: f64, hw: f64, hd: f64, c: f64, s: f64, height: f64, falloff: f64, crown: &[f64; 9], x: f64, z: f64) -> f64 {
    let (dx, dz) = (x - cx, z - cz);
    let along_at = dx * s + dz * c;
    let across_at = dx * c - dz * s;
    let ea = hd * RUBBLE_PLATEAU;
    let eb = hw * RUBBLE_PLATEAU;
    let along = along_at.abs() - ea;
    let across = across_at.abs() - eb;
    let ox = if across > 0.0 { across } else { 0.0 };
    let oz = if along > 0.0 { along } else { 0.0 };
    let outside = (ox * ox + oz * oz).sqrt();
    if outside >= falloff {
        return 0.0;
    }
    let a = if ea > 1e-3 { jsmath::max(-1.0, jsmath::min(1.0, along_at / ea)) } else { 0.0 };
    let b = if eb > 1e-3 { jsmath::max(-1.0, jsmath::min(1.0, across_at / eb)) } else { 0.0 };
    let lean = (crown[0] * b + crown[1] * a) * core::f64::consts::FRAC_1_SQRT_2;
    let swell = 0.6 * jsmath::sin(crown[5] * a + crown[2]) * jsmath::sin(crown[6] * b + crown[3]) + 0.4 * jsmath::sin(crown[7] * a - crown[8] * b + crown[4]);
    let g = CROWN_LEAN * lean + (1.0 - CROWN_LEAN) * swell;
    let top = height * (1.0 - CROWN_DROP * 0.5 * (1.0 - g));
    if outside > 0.0 { top * 0.5 * (1.0 + jsmath::cos(jsmath::PI * outside / falloff)) } else { top }
}

/// `Object.is` on two numbers.
fn same_value(a: f64, b: f64) -> bool {
    (a.is_nan() && b.is_nan()) || a.to_bits() == b.to_bits()
}

/// A match's overlay (`createTerrainDeformation`).
pub struct TerrainDeformation {
    stamps: Vec<Stamp>,
    counts: Vec<u8>,
    slots: Vec<i32>,
    revision: u32,
    max_raise: f64,
    course_raise: f64,
    now: f64,
    rising: Vec<usize>,
    timed_heaps: u32,
    lattice_keys: Vec<i32>,
    lattice_epochs: Vec<u32>,
    lattice_values: Vec<f64>,
    lattice_epoch: u32,
}

impl Default for TerrainDeformation {
    fn default() -> Self {
        Self::new()
    }
}

impl TerrainDeformation {
    /// An empty overlay.
    pub fn new() -> TerrainDeformation {
        TerrainDeformation {
            stamps: Vec::new(),
            counts: vec![0; BUCKETS * BUCKETS],
            slots: vec![0; BUCKETS * BUCKETS * STAMPS_PER_BUCKET],
            revision: 0,
            max_raise: 0.0,
            course_raise: 0.0,
            now: f64::NAN,
            rising: Vec::new(),
            timed_heaps: 0,
            lattice_keys: vec![-1; LATTICE_CACHE_SLOTS],
            lattice_epochs: vec![0; LATTICE_CACHE_SLOTS],
            lattice_values: vec![0.0; LATTICE_CACHE_SLOTS],
            lattice_epoch: 1,
        }
    }

    /// Grows by one with every stamp and reset.
    pub fn revision(&self) -> u32 {
        self.revision
    }

    /// The stamps in the order they were added.
    pub fn stamps(&self) -> &[Stamp] {
        &self.stamps
    }

    /// The highest the overlay can raise the ground.
    pub fn max_raise_m(&self) -> f64 {
        self.max_raise + self.course_raise
    }

    fn invalidate_lattice(&mut self) {
        self.lattice_epoch += 1;
        if self.lattice_epoch > 0xfffffff0 {
            self.lattice_epoch = 1;
            self.lattice_keys.fill(-1);
        }
    }

    fn growth_of(&self, stamp: &Stamp) -> f64 {
        match stamp {
            Stamp::Rubble { t0, grow_s, .. } if t0.is_finite() && self.now.is_finite() => rubble_growth(self.now - t0, *grow_s),
            _ => 1.0,
        }
    }

    /// The buckets a box covers, in the TypeScript's order (none when a bound is NaN).
    fn bucket_range(x0: f64, z0: f64, x1: f64, z1: f64) -> Option<(usize, usize, usize, usize)> {
        let (bx0, bz0, bx1, bz1) = (bucket_index(x0), bucket_index(z0), bucket_index(x1), bucket_index(z1));
        if bx0.is_nan() || bz0.is_nan() || bx1.is_nan() || bz1.is_nan() || bx0 > bx1 || bz0 > bz1 {
            return None;
        }
        Some((bx0 as usize, bz0 as usize, bx1 as usize, bz1 as usize))
    }

    fn admit(&mut self, stamp: Stamp, x0: f64, z0: f64, x1: f64, z1: f64, force: bool) -> bool {
        let range = Self::bucket_range(x0, z0, x1, z1);
        if !force {
            if let Some((bx0, bz0, bx1, bz1)) = range {
                for bz in bz0..=bz1 {
                    for bx in bx0..=bx1 {
                        if self.counts[bz * BUCKETS + bx] as usize >= STAMPS_PER_BUCKET {
                            return false;
                        }
                    }
                }
            }
        }
        let index = self.stamps.len() as i32;
        self.stamps.push(stamp);
        if let Some((bx0, bz0, bx1, bz1)) = range {
            for bz in bz0..=bz1 {
                for bx in bx0..=bx1 {
                    let bucket = bz * BUCKETS + bx;
                    let count = self.counts[bucket] as usize;
                    if count < STAMPS_PER_BUCKET {
                        self.slots[bucket * STAMPS_PER_BUCKET + count] = index;
                        self.counts[bucket] += 1;
                    }
                }
            }
        }
        self.revision += 1;
        self.invalidate_lattice();
        true
    }

    /// `near`: whether any stamp touches the bucket of (x, z).
    pub fn near(&self, x: f64, z: f64) -> bool {
        bucket_of(x, z).is_some_and(|bucket| self.counts[bucket] > 0)
    }

    /// `offsetAt`: the stamps' sum at (x, z), clamped.
    pub fn offset_at(&self, x: f64, z: f64) -> f64 {
        let Some(bucket) = bucket_of(x, z) else { return 0.0 };
        let count = self.counts[bucket] as usize;
        if count == 0 {
            return 0.0;
        }
        let mut sum = 0.0;
        let mut course = 0.0;
        for k in 0..count {
            let stamp = &self.stamps[self.slots[bucket * STAMPS_PER_BUCKET + k] as usize];
            match stamp {
                Stamp::Crater { x: sx, z: sz, radius_m, depth_m, rim_m, p1, p2, p3 } => {
                    let (dx, dz) = (x - sx, z - sz);
                    let r = (dx * dx + dz * dz).sqrt();
                    if r < radius_m * CRATER_REACH * 1.1 {
                        sum += crater_profile(*radius_m, *depth_m, *rim_m, *p1, *p2, *p3, r, jsmath::atan2(dz, dx));
                    }
                }
                Stamp::Course { cx, cz, c, s, hw, skirt_m, profile } => {
                    course += course_profile(*cx, *cz, *c, *s, *hw, *skirt_m, profile, x, z);
                }
                Stamp::Rubble { cx, cz, hw, hd, c, s, height_m, falloff_m, crown, .. } => {
                    sum += self.growth_of(stamp) * heap_height(*cx, *cz, *hw, *hd, *c, *s, *height_m, *falloff_m, crown, x, z);
                }
            }
        }
        let battle = if sum < -MAX_DEPTH_M { -MAX_DEPTH_M } else if sum > MAX_RAISE_M { MAX_RAISE_M } else { sum };
        if course == 0.0 {
            battle
        } else {
            battle + (if course < -MAX_COURSE_M { -MAX_COURSE_M } else if course > MAX_COURSE_M { MAX_COURSE_M } else { course })
        }
    }

    /// `latticeOffset`: a contact-lattice vertex's offset, cached until the overlay can read differently.
    fn lattice_offset(&mut self, ix: f64, iz: f64) -> f64 {
        let key = iz * LATTICE_VERTICES as f64 + ix;
        let x = -WORLD_HALF_M + ix * LATTICE_STEP;
        let z = -WORLD_HALF_M + iz * LATTICE_STEP;
        if !(key >= 0.0 && key < (LATTICE_VERTICES * LATTICE_VERTICES) as f64) {
            return self.offset_at(x, z);
        }
        let key = key as i32;
        let slot = (key as usize) & (LATTICE_CACHE_SLOTS - 1);
        if self.lattice_keys[slot] == key && self.lattice_epochs[slot] == self.lattice_epoch {
            return self.lattice_values[slot];
        }
        let value = self.offset_at(x, z);
        self.lattice_keys[slot] = key;
        self.lattice_epochs[slot] = self.lattice_epoch;
        self.lattice_values[slot] = value;
        value
    }

    /// `contactOffsetAt`: the overlay on the contact lattice's triangle under (x, z); `flipped` takes the a–d split.
    pub fn contact_offset_at(&mut self, x: f64, z: f64, flipped: bool) -> f64 {
        // (a NaN coordinate is no bucket: its count is not 0, and the arithmetic below carries the NaN)
        if let Some(bucket) = bucket_of(x, z) {
            if self.counts[bucket] == 0 {
                return 0.0;
            }
        }
        let gx = jsmath::max(0.0, jsmath::min(LATTICE_CELLS as f64 - 1e-6, (x + WORLD_HALF_M) / LATTICE_STEP));
        let gz = jsmath::max(0.0, jsmath::min(LATTICE_CELLS as f64 - 1e-6, (z + WORLD_HALF_M) / LATTICE_STEP));
        let (ix, iz) = (gx.floor(), gz.floor());
        let (u, v) = (gx - ix, gz - iz);
        let b = self.lattice_offset(ix + 1.0, iz);
        let c = self.lattice_offset(ix, iz + 1.0);
        if flipped {
            let a = self.lattice_offset(ix, iz);
            let d = self.lattice_offset(ix + 1.0, iz + 1.0);
            return if u >= v { a + (b - a) * u + (d - b) * v } else { a + (c - a) * v + (d - c) * u };
        }
        if u + v <= 1.0 {
            let a = self.lattice_offset(ix, iz);
            return a + (b - a) * u + (c - a) * v;
        }
        let d = self.lattice_offset(ix + 1.0, iz + 1.0);
        d + (c - d) * (1.0 - u) + (b - d) * (1.0 - v)
    }

    /// `addCrater`: false when its buckets are full.
    pub fn add_crater(&mut self, x: f64, z: f64, radius_m: f64, depth_m: f64, rim_m: f64, seed: u32) -> bool {
        if !(radius_m > 0.0) {
            return false;
        }
        let [p1, p2, p3] = phases(seed);
        let reach = radius_m * CRATER_REACH * 1.1;
        let stamp = Stamp::Crater { x, z, radius_m, depth_m, rim_m, p1, p2, p3 };
        let admitted = self.admit(stamp, x - reach, z - reach, x + reach, z + reach, false);
        if admitted {
            self.max_raise = jsmath::min(MAX_RAISE_M, self.max_raise + rim_m * (1.0 + RIM_BREAK));
        }
        admitted
    }

    /// `addRubble`: `t0` None is the TypeScript's `undefined` (the clock's now, or risen at once without a clock).
    #[allow(clippy::too_many_arguments)]
    pub fn add_rubble(&mut self, cx: f64, cz: f64, hw: f64, hd: f64, yaw: f64, height_m: f64, t0: Option<f64>) {
        let height = jsmath::max(0.0, height_m);
        let falloff = rubble_falloff_m(hw, hd, height);
        let start = match t0 {
            Some(t) => t,
            None if self.now.is_finite() => self.now,
            None => f64::NEG_INFINITY,
        };
        let (c, s) = (jsmath::cos(yaw), jsmath::sin(yaw));
        let stamp = Stamp::Rubble { cx, cz, hw, hd, c, s, height_m: height, falloff_m: falloff, t0: start, grow_s: RUBBLE_GROW_S, crown: heap_crown(cx, cz, hw, hd) };
        if start.is_finite() && self.growth_of(&stamp) < 1.0 {
            self.rising.push(self.stamps.len());
        }
        if start.is_finite() {
            self.timed_heaps += 1;
        }
        let ex = s.abs() * hd + c.abs() * hw + falloff;
        let ez = c.abs() * hd + s.abs() * hw + falloff;
        self.admit(stamp, cx - ex, cz - ez, cx + ex, cz + ez, true);
        self.max_raise = jsmath::min(MAX_RAISE_M, self.max_raise + height);
    }

    /// `addCourse`: a graded earthwork, risen at once (`profile`: its (u, h) knots).
    #[allow(clippy::too_many_arguments)]
    pub fn add_course(&mut self, cx: f64, cz: f64, c: f64, s: f64, hw: f64, skirt_m: f64, profile: Vec<f64>) {
        let first = profile.first().copied().unwrap_or(0.0);
        let last = if profile.len() >= 2 { profile[profile.len() - 2] } else { 0.0 };
        let half = jsmath::max(first.abs(), last.abs());
        let across = hw + skirt_m;
        let ex = s.abs() * half + c.abs() * across;
        let ez = c.abs() * half + s.abs() * across;
        let mut top: f64 = 0.0;
        let mut k = 1;
        while k < profile.len() {
            top = jsmath::max(top, profile[k]);
            k += 2;
        }
        self.admit(Stamp::Course { cx, cz, c, s, hw, skirt_m, profile }, cx - ex, cz - ez, cx + ex, cz + ez, true);
        self.course_raise = jsmath::min(MAX_COURSE_M, self.course_raise + top);
    }

    /// `reset`: every stamp gone.
    pub fn reset(&mut self) {
        self.stamps.clear();
        self.counts.fill(0);
        self.revision += 1;
        self.max_raise = 0.0;
        self.course_raise = 0.0;
        self.rising.clear();
        self.timed_heaps = 0;
        self.invalidate_lattice();
    }

    /// `setTime`: the overlay's clock (s).
    pub fn set_time(&mut self, time_s: f64) {
        if self.timed_heaps > 0 && !same_value(time_s, self.now) {
            self.invalidate_lattice();
        }
        self.now = time_s;
        if self.rising.is_empty() {
            return;
        }
        let rising = core::mem::take(&mut self.rising);
        self.rising = rising.into_iter().filter(|&i| self.growth_of(&self.stamps[i]) < 1.0).collect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_overlay_reads_zero_everywhere() {
        let mut overlay = TerrainDeformation::new();
        assert_eq!(overlay.offset_at(10.0, -20.0), 0.0);
        assert_eq!(overlay.contact_offset_at(10.0, -20.0, false), 0.0);
        assert!(!overlay.near(0.0, 0.0));
    }

    #[test]
    fn a_crater_digs_its_centre_and_fills_its_buckets() {
        let mut overlay = TerrainDeformation::new();
        assert!(overlay.add_crater(0.5, 0.5, 2.0, 0.6, 0.2, 7));
        assert!(overlay.offset_at(0.5, 0.5) < 0.0);
        for seed in 0..7 {
            assert!(overlay.add_crater(0.5, 0.5, 2.0, 0.6, 0.2, seed));
        }
        assert!(!overlay.add_crater(0.5, 0.5, 2.0, 0.6, 0.2, 99), "the ninth crater in a bucket is refused");
        assert_eq!(overlay.offset_at(0.5, 0.5), -MAX_DEPTH_M, "the pit stops at the clamp");
    }

    #[test]
    fn a_heap_rises_with_the_clock() {
        let mut overlay = TerrainDeformation::new();
        overlay.set_time(10.0);
        overlay.add_rubble(40.0, 40.0, 6.0, 8.0, 0.3, 1.5, None);
        assert_eq!(overlay.offset_at(40.0, 40.0), 0.0, "a heap begins flat");
        overlay.set_time(11.0);
        let half = overlay.offset_at(40.0, 40.0);
        overlay.set_time(13.0);
        assert!(half > 0.0 && overlay.offset_at(40.0, 40.0) > half);
    }
}
