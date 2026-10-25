//! The support solve's sampling — `src/sim/movement.ts` (sampleOuterTrackLines, sampleTrackWrapEnds, sampleSupportFan
//! and the samplers they read: reachableTrackGroundAt, reachableGroundAt, the wall rules and the sheer-face scan), bit
//! for bit.
//!
//! A hull's frame (its root, attitude, contact geometry and the reach and track-line contexts the TypeScript's
//! beginReachableGround and beginReachableTrackGround set) goes in; the aggregates and station arrays the attitude fit
//! reads come out. `support` is the field's contact sampler (the tops over the deformed contact surface), `terrain`
//! the deformed contact surface alone.

use crate::jsmath;

const HULL_STEP_UP_M: f64 = 0.55;
const CLIFF_GRADE: f64 = 1.28;
const WALL_REACH_STEPS: usize = 4;
const WALL_GRADIENT_PROBE_M: f64 = 0.25;
const WALL_GRADE_FULL: f64 = 1.5 * CLIFF_GRADE;
const WALL_FOOT_RUNS: usize = 2;
const FACE_CLIMB_MAX_M: f64 = 1.0;
const FACE_SCAN_STEPS: usize = 3;
const RIDE_DROOP_M: f64 = 0.18;
const TOUCH_REACH_M: f64 = RIDE_DROOP_M + 0.17;
/// The per-line sample cap.
pub const SUPPORT_MAX_N: usize = 24;
const FIT_BODY_MAX: usize = 28;
/// The fit arrays' length.
pub const FIT_MAX: usize = 2 * SUPPORT_MAX_N + FIT_BODY_MAX;
/// The bed stations' cap.
pub const BED_MAX: usize = 4 * SUPPORT_MAX_N + 8;
/// The inner samples' cap.
pub const INNER_MAX: usize = 8 * SUPPORT_MAX_N;
/// The fan: (fraction of the half width, height over the track bottom).
const SUPPORT_FAN: [(f64, f64); 4] = [(0.80, 0.0), (0.63, 0.0), (0.32, 0.34), (0.00, 0.34)];

/// A hull's sampling frame (resetSupportSamples' fields and the two reach contexts).
#[derive(Clone, Copy, Debug, Default)]
#[allow(missing_docs)] // (the TypeScript's names)
pub struct SamplingFrame {
    pub world_x: f64,
    pub world_z: f64,
    pub cos_yaw: f64,
    pub sin_yaw: f64,
    pub cos_neg_pitch: f64,
    pub sin_neg_pitch: f64,
    pub cos_roll: f64,
    pub sin_roll: f64,
    pub sin_pitch: f64,
    pub cos_pitch: f64,
    pub fit_sin_pitch: f64,
    pub fit_cos_pitch: f64,
    pub fit_sin_roll: f64,
    pub fit_cos_roll: f64,
    pub half_length: f64,
    pub center_z: f64,
    pub step: f64,
    pub line_count: usize,
    pub z_half: f64,
    /// The belly pan's height (contact.panYM − 0.015), when the contact publishes one.
    pub pan_y: Option<f64>,
    /// The track ends' wrap (dzM, frontM, rearM), when the contact publishes it.
    pub end_rise: Option<(f64, f64, f64)>,
    pub gear_bottom_y: f64,
    pub half_width: f64,
    pub rigid_gear: bool,
    /// beginReachableGround: the reference height and the root.
    pub ref_y: f64,
    pub root_x: f64,
    pub root_z: f64,
    /// beginReachableTrackGround: the track line's height at the root, its rise per metre, sin(roll), forward.
    pub line_y: f64,
    pub rise_per_m: f64,
    pub track_sin_roll: f64,
    pub forward_x: f64,
    pub forward_z: f64,
}

/// What the sampling accumulates (resetSupportSamples' starting values, then the samples').
#[derive(Clone, Debug)]
#[allow(missing_docs)] // (the TypeScript's names)
pub struct SamplingOut {
    pub sum_height_z: f64,
    pub sum_zz: f64,
    pub sum_left: f64,
    pub sum_right: f64,
    pub side_count: f64,
    pub outer_max: f64,
    pub outer_x: f64,
    pub outer_z: f64,
    pub settle_deficit_sum: f64,
    pub deficit_count: f64,
    pub deepest_z: f64,
    pub settle_outer_max: f64,
    pub front_max: f64,
    pub front_z: f64,
    pub rear_max: f64,
    pub rear_z: f64,
    pub fan_max: f64,
    pub belly_max: f64,
    pub fit_count: usize,
    pub bed_count: usize,
    pub wrap_max: f64,
    pub fan_touch_left_x: f64,
    pub fan_touch_right_x: f64,
    pub inner_count: usize,
    pub belly_touch_min_x: f64,
    pub belly_touch_max_x: f64,
    pub bottom_lift: f64,
    pub fit_z: [f64; FIT_MAX],
    pub fit_x: [f64; FIT_MAX],
    pub fit_h: [f64; FIT_MAX],
    pub fit_d: [f64; FIT_MAX],
    pub bed_x: [f64; BED_MAX],
    pub bed_z: [f64; BED_MAX],
    pub bed_d: [f64; BED_MAX],
    pub inner_x: [f64; INNER_MAX],
    pub inner_z: [f64; INNER_MAX],
    pub inner_h: [f64; INNER_MAX],
}

impl Default for SamplingOut {
    fn default() -> Self {
        SamplingOut {
            sum_height_z: 0.0, sum_zz: 0.0, sum_left: 0.0, sum_right: 0.0, side_count: 0.0, outer_max: f64::NEG_INFINITY,
            outer_x: 0.0, outer_z: 0.0, settle_deficit_sum: 0.0, deficit_count: 0.0, deepest_z: 0.0,
            settle_outer_max: f64::NEG_INFINITY, front_max: f64::NEG_INFINITY, front_z: 0.0, rear_max: f64::NEG_INFINITY,
            rear_z: 0.0, fan_max: f64::NEG_INFINITY, belly_max: f64::NEG_INFINITY, fit_count: 0, bed_count: 0,
            wrap_max: f64::NEG_INFINITY, fan_touch_left_x: f64::INFINITY, fan_touch_right_x: f64::INFINITY, inner_count: 0,
            belly_touch_min_x: f64::INFINITY, belly_touch_max_x: f64::NEG_INFINITY, bottom_lift: 0.0,
            fit_z: [0.0; FIT_MAX], fit_x: [0.0; FIT_MAX], fit_h: [0.0; FIT_MAX], fit_d: [0.0; FIT_MAX],
            bed_x: [0.0; BED_MAX], bed_z: [0.0; BED_MAX], bed_d: [0.0; BED_MAX],
            inner_x: [0.0; INNER_MAX], inner_z: [0.0; INNER_MAX], inner_h: [0.0; INNER_MAX],
        }
    }
}

impl SamplingOut {
    fn reset(&mut self, frame: &SamplingFrame) {
        self.sum_height_z = 0.0;
        self.sum_zz = 0.0;
        self.sum_left = 0.0;
        self.sum_right = 0.0;
        self.side_count = 0.0;
        self.outer_max = f64::NEG_INFINITY;
        self.outer_x = 0.0;
        self.outer_z = 0.0;
        self.settle_deficit_sum = 0.0;
        self.deficit_count = 0.0;
        self.deepest_z = 0.0;
        self.settle_outer_max = f64::NEG_INFINITY;
        self.front_max = f64::NEG_INFINITY;
        self.front_z = frame.half_length;
        self.rear_max = f64::NEG_INFINITY;
        self.rear_z = -frame.half_length;
        self.fan_max = f64::NEG_INFINITY;
        self.belly_max = f64::NEG_INFINITY;
        self.fit_count = 0;
        self.bed_count = 0;
        self.wrap_max = f64::NEG_INFINITY;
        self.fan_touch_left_x = f64::INFINITY;
        self.fan_touch_right_x = f64::INFINITY;
        self.inner_count = 0;
        self.belly_touch_min_x = f64::INFINITY;
        self.belly_touch_max_x = f64::NEG_INFINITY;
        self.bottom_lift = 0.0;
    }

    fn record_bed(&mut self, x: f64, z: f64, deficit: f64) {
        if self.bed_count >= BED_MAX {
            return;
        }
        self.bed_x[self.bed_count] = x;
        self.bed_z[self.bed_count] = z;
        self.bed_d[self.bed_count] = deficit;
        self.bed_count += 1;
    }
}

/// The wall's central grade (wallShareAt's _wallGradX / _wallGradZ / _wallGrade).
#[derive(Default)]
struct WallGrad {
    x: f64,
    z: f64,
    grade: f64,
}

/// The two samplers and the reach context.
struct Reach<'a, S, T> {
    support: &'a mut S,
    terrain: &'a mut T,
    frame: &'a SamplingFrame,
    wall: WallGrad,
}

impl<S: FnMut(f64, f64) -> f64, T: FnMut(f64, f64) -> f64> Reach<'_, S, T> {
    fn reachable(&self, h: f64, r: f64) -> bool {
        h <= self.frame.ref_y + HULL_STEP_UP_M + r * CLIFF_GRADE
    }

    /// `wallShareAt` over the terrain.
    fn wall_share_at(&mut self, x: f64, z: f64, h: f64) -> f64 {
        let forward_x = ((self.terrain)(x + WALL_GRADIENT_PROBE_M, z) - h) / WALL_GRADIENT_PROBE_M;
        let forward_z = ((self.terrain)(x, z + WALL_GRADIENT_PROBE_M) - h) / WALL_GRADIENT_PROBE_M;
        let forward = (forward_x * forward_x + forward_z * forward_z).sqrt();
        if !(forward > CLIFF_GRADE) {
            return 0.0;
        }
        self.wall.x = 0.5 * (forward_x + (h - (self.terrain)(x - WALL_GRADIENT_PROBE_M, z)) / WALL_GRADIENT_PROBE_M);
        self.wall.z = 0.5 * (forward_z + (h - (self.terrain)(x, z - WALL_GRADIENT_PROBE_M)) / WALL_GRADIENT_PROBE_M);
        self.wall.grade = (self.wall.x * self.wall.x + self.wall.z * self.wall.z).sqrt();
        let grade = jsmath::min(forward, self.wall.grade);
        if !(grade > CLIFF_GRADE) {
            return 0.0;
        }
        let t = jsmath::min(1.0, (grade - CLIFF_GRADE) / (WALL_GRADE_FULL - CLIFF_GRADE));
        t * t * (3.0 - 2.0 * t)
    }

    /// `wallFootAt` over the terrain.
    fn wall_foot_at(&mut self, x: f64, z: f64, h: f64) -> f64 {
        let (mut px, mut pz, mut ph, mut foot, mut share) = (x, z, h, h, 1.0);
        for index in 0..WALL_FOOT_RUNS {
            let over = ph - (self.frame.ref_y + HULL_STEP_UP_M);
            if !(over > 0.0) || !(share > 0.0) || !(self.wall.grade > 1e-6) {
                break;
            }
            let run = share * over / jsmath::max(self.wall.grade, CLIFF_GRADE);
            px -= (self.wall.x / self.wall.grade) * run;
            pz -= (self.wall.z / self.wall.grade) * run;
            ph = (self.terrain)(px, pz);
            if ph < foot {
                foot = ph;
            }
            if index + 1 < WALL_FOOT_RUNS {
                share = self.wall_share_at(px, pz, ph);
            }
        }
        foot
    }

    /// `reachableGroundAt` (the field's sampler and the terrain are distinct functions on the kernel).
    fn ground_at(&mut self, x: f64, z: f64) -> f64 {
        let support = (self.support)(x, z);
        if !(support > self.frame.ref_y + HULL_STEP_UP_M) {
            return support;
        }
        let mut h = (self.terrain)(x, z);
        if support > h + 1e-4 {
            return support;
        }
        let (root_x, root_z) = (self.frame.root_x, self.frame.root_z);
        let dx = x - root_x;
        let dz = z - root_z;
        let r = (dx * dx + dz * dz).sqrt();
        let (mut px, mut pz) = (x, z);
        if !self.reachable(h, r) {
            let (mut lo, mut hi) = (0.0, 1.0);
            h = jsmath::min((self.terrain)(root_x, root_z), self.frame.ref_y + HULL_STEP_UP_M);
            for _ in 0..WALL_REACH_STEPS {
                let mid = 0.5 * (lo + hi);
                let hm = (self.terrain)(root_x + dx * mid, root_z + dz * mid);
                if self.reachable(hm, r * mid) {
                    lo = mid;
                    h = hm;
                } else {
                    hi = mid;
                }
            }
            if !(h > self.frame.ref_y + HULL_STEP_UP_M) {
                return h;
            }
            px = root_x + dx * lo;
            pz = root_z + dz * lo;
        }
        let share = self.wall_share_at(px, pz, h);
        if share > 0.0 { h + share * (self.wall_foot_at(px, pz, h) - h) } else { h }
    }

    /// `sheerFaceFoot` over the terrain, or NaN.
    fn sheer_face_foot(&mut self, x: f64, z: f64, h: f64) -> f64 {
        let dx = self.frame.root_x - x;
        let dz = self.frame.root_z - z;
        let r = (dx * dx + dz * dz).sqrt();
        if !(r > WALL_GRADIENT_PROBE_M) {
            return f64::NAN;
        }
        let step_x = dx / r * WALL_GRADIENT_PROBE_M;
        let step_z = dz / r * WALL_GRADIENT_PROBE_M;
        let mut previous = h;
        let mut index = 1;
        while index <= FACE_SCAN_STEPS && (index as f64) * WALL_GRADIENT_PROBE_M < r {
            let ground = (self.terrain)(x + step_x * index as f64, z + step_z * index as f64);
            if previous - ground > WALL_GRADE_FULL * WALL_GRADIENT_PROBE_M && h - ground > FACE_CLIMB_MAX_M {
                return ground;
            }
            previous = ground;
            index += 1;
        }
        f64::NAN
    }

    /// `reachableTrackGroundAt`.
    fn track_ground_at(&mut self, x: f64, z: f64) -> f64 {
        let ground = self.ground_at(x, z);
        let dx = x - self.frame.root_x;
        let dz = z - self.frame.root_z;
        let along = dx * self.frame.forward_x + dz * self.frame.forward_z;
        let across = dx * self.frame.forward_z - dz * self.frame.forward_x;
        let line = self.frame.line_y + along * self.frame.rise_per_m + across * self.frame.track_sin_roll;
        if !(ground - line > FACE_CLIMB_MAX_M) {
            return ground;
        }
        if ground > (self.terrain)(x, z) + 1e-4 {
            return ground;
        }
        let foot = self.sheer_face_foot(x, z, ground);
        if foot < ground { foot } else { ground }
    }
}

/// The world point of a hull-local (x, y, z) at the frame's attitude, read by the track sampler.
fn sample_at<S: FnMut(f64, f64) -> f64, T: FnMut(f64, f64) -> f64>(reach: &mut Reach<'_, S, T>, rolled_x: f64, pitched_z: f64) -> f64 {
    let f = reach.frame;
    let x = f.world_x + rolled_x * f.cos_yaw + pitched_z * f.sin_yaw;
    let z = f.world_z - rolled_x * f.sin_yaw + pitched_z * f.cos_yaw;
    reach.track_ground_at(x, z)
}

fn wrap_ends<S: FnMut(f64, f64) -> f64, T: FnMut(f64, f64) -> f64>(reach: &mut Reach<'_, S, T>, out: &mut SamplingOut, local_x: f64) {
    let f = *reach.frame;
    let Some((dz, front, rear)) = f.end_rise else { return };
    for end in 0..2 {
        let local_z = if end == 0 { f.center_z + f.half_length + dz } else { f.center_z - f.half_length - dz };
        let rise = if end == 0 { front } else { rear };
        let local_y = f.gear_bottom_y + rise;
        let rolled_x = local_x * f.cos_roll - local_y * f.sin_roll;
        let rolled_y = local_x * f.sin_roll + local_y * f.cos_roll;
        let pitched_z = rolled_y * f.sin_neg_pitch + local_z * f.cos_neg_pitch;
        let terrain_y = sample_at(reach, rolled_x, pitched_z);
        let deficit = terrain_y - ((local_x * f.sin_roll + local_y * f.cos_roll) * f.cos_pitch + local_z * f.sin_pitch);
        if deficit > out.outer_max {
            out.outer_max = deficit;
        }
        if deficit > out.wrap_max {
            out.wrap_max = deficit;
        }
    }
}

/// sampleOuterTrackLines then sampleSupportFan, into `out` (reset first).
pub fn sample_support<S: FnMut(f64, f64) -> f64, T: FnMut(f64, f64) -> f64>(frame: &SamplingFrame, support: &mut S, terrain: &mut T, out: &mut SamplingOut) {
    out.reset(frame);
    let mut reach = Reach { support, terrain, frame, wall: WallGrad::default() };
    let f = *frame;
    let gear = f.gear_bottom_y;
    // ---- the outer track lines
    let rendered_bottom_lift = gear * f.cos_roll * f.cos_pitch;
    let fitted_bottom_lift = gear * f.fit_cos_roll * f.fit_cos_pitch;
    out.bottom_lift = rendered_bottom_lift;
    for side in [-1.0, 1.0] {
        let local_x = side * f.half_width;
        let rolled_x = local_x * f.cos_roll - gear * f.sin_roll;
        let rolled_y = local_x * f.sin_roll + gear * f.cos_roll;
        for index in 0..f.line_count {
            let centered_z = -f.half_length + index as f64 * f.step;
            let local_z = f.center_z + centered_z;
            let pitched_z = rolled_y * f.sin_neg_pitch + local_z * f.cos_neg_pitch;
            let terrain_y = sample_at(&mut reach, rolled_x, pitched_z);
            out.sum_height_z += terrain_y * centered_z;
            out.sum_zz += centered_z * centered_z;
            if side < 0.0 {
                out.sum_left += terrain_y;
            } else {
                out.sum_right += terrain_y;
            }
            out.side_count += 1.0;
            let deficit = terrain_y - (local_x * f.sin_roll * f.cos_pitch + rendered_bottom_lift + local_z * f.sin_pitch);
            if deficit > out.outer_max {
                out.outer_max = deficit;
                out.outer_x = local_x;
                out.outer_z = local_z;
            }
            out.record_bed(local_x, local_z, deficit);
            let record = out.fit_count;
            out.fit_count += 1;
            out.fit_z[record] = centered_z;
            out.fit_x[record] = local_x;
            out.fit_h[record] = terrain_y;
            out.fit_d[record] = deficit;
            let fitted_deficit = terrain_y - (local_x * f.fit_sin_roll * f.fit_cos_pitch + fitted_bottom_lift + local_z * f.fit_sin_pitch);
            if fitted_deficit > out.settle_outer_max {
                out.settle_outer_max = fitted_deficit;
                out.deepest_z = centered_z;
            }
            if centered_z < -f.z_half && fitted_deficit > out.rear_max {
                out.rear_max = fitted_deficit;
                out.rear_z = centered_z;
            } else if centered_z > f.z_half && fitted_deficit > out.front_max {
                out.front_max = fitted_deficit;
                out.front_z = centered_z;
            }
            out.settle_deficit_sum += fitted_deficit;
            out.deficit_count += 1.0;
        }
        wrap_ends(&mut reach, out, local_x);
    }
    // ---- the support fan
    let stride = if f.rigid_gear { 1 } else { 2 };
    for (fraction, y_off) in SUPPORT_FAN {
        let sides: &[f64] = if fraction == 0.0 { &[-1.0] } else { &[-1.0, 1.0] };
        for &side in sides {
            let local_y = if y_off > 0.0 && f.pan_y.is_some() { f.pan_y.unwrap() } else { y_off + gear };
            let local_x = side * f.half_width * fraction;
            let rolled_x = local_x * f.cos_roll - local_y * f.sin_roll;
            let rolled_y = local_x * f.sin_roll + local_y * f.cos_roll;
            let rendered_lift = (local_x * f.sin_roll + local_y * f.cos_roll) * f.cos_pitch;
            let fitted_lift = (local_x * f.fit_sin_roll + local_y * f.fit_cos_roll) * f.fit_cos_pitch;
            let mut index = 0;
            while index < f.line_count {
                let local_z = f.center_z + if index + 2 == f.line_count { f.half_length } else { -f.half_length + index as f64 * f.step };
                let pitched_z = rolled_y * f.sin_neg_pitch + local_z * f.cos_neg_pitch;
                let terrain_y = sample_at(&mut reach, rolled_x, pitched_z);
                let deficit = terrain_y - (rendered_lift + local_z * f.sin_pitch);
                if out.inner_count < INNER_MAX {
                    out.inner_x[out.inner_count] = local_x;
                    out.inner_z[out.inner_count] = local_z - f.center_z;
                    out.inner_h[out.inner_count] = terrain_y;
                    out.inner_count += 1;
                }
                if y_off == 0.0 {
                    if deficit > out.fan_max {
                        out.fan_max = deficit;
                    }
                    out.record_bed(local_x, local_z, deficit);
                    if deficit >= out.outer_max - TOUCH_REACH_M {
                        let reach_x = local_x.abs();
                        if side < 0.0 {
                            if reach_x < out.fan_touch_left_x {
                                out.fan_touch_left_x = reach_x;
                            }
                        } else if reach_x < out.fan_touch_right_x {
                            out.fan_touch_right_x = reach_x;
                        }
                    }
                    out.settle_deficit_sum += terrain_y - (fitted_lift + local_z * f.fit_sin_pitch);
                    out.deficit_count += 1.0;
                } else {
                    if deficit > out.belly_max {
                        out.belly_max = deficit;
                    }
                    if deficit + (local_y - gear) * f.cos_roll * f.cos_pitch >= out.outer_max - TOUCH_REACH_M {
                        if local_x < out.belly_touch_min_x {
                            out.belly_touch_min_x = local_x;
                        }
                        if local_x > out.belly_touch_max_x {
                            out.belly_touch_max_x = local_x;
                        }
                    }
                }
                index += stride;
            }
            if y_off == 0.0 {
                wrap_ends(&mut reach, out, local_x);
            }
        }
    }
}
