//! Shell flight, penetration falloff, gun lay and dispersion — the port of
//! `src/sim/ballistics.ts` (docs/ARCHITECTURE.md §3.5.1). Every formula keeps
//! the TypeScript evaluation order; `tests/golden.rs` holds it to the bits.

use crate::jsmath;
use crate::math::Vec3;
use crate::rng::Rng;

/// Physical gravity scale for unguided direct-fire shells.
pub const GRAVITY_SCALE: f64 = 1.0;

/// Shells despawn after this many seconds of flight (shells doc §2).
pub const SHELL_MAX_LIFETIME_S: f64 = 6.0;

/// Effective gravity applied to shells, m/s².
const G_SHELL: f64 = 9.81 * GRAVITY_SCALE;

/// Default cursor-guidance authority for ATGMs (radians per second).
pub const GUIDED_MISSILE_TURN_RATE_RAD_S: f64 = 2.4;

/// The ballistic part of a shell specification (`BallisticShellSpec`).
///
/// Optional TypeScript fields are `Option`s; a field the TypeScript code
/// guards with `typeof x === 'number' && Number.isFinite(x)` is read through
/// [`finite`].
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ShellSpec {
    /// Muzzle velocity, m/s.
    pub velocity_mps: f64,
    /// Cursor-guided missile: flies the sight line, no gravity.
    pub guided: bool,
    /// Optional custom gravity scale (artillery ammunition).
    pub gravity_scale: Option<f64>,
    /// Optional guidance authority override, rad/s.
    pub guidance_turn_rate_rad_s: Option<f64>,
    /// Penetration at 100 m, mm RHAe.
    pub pen100_mm: f64,
    /// Penetration at 1000 m, mm RHAe.
    pub pen1000_mm: f64,
    /// Optional far anchor at 2000 m, mm RHAe.
    pub pen2000_mm: Option<f64>,
}

/// `typeof x === 'number' && Number.isFinite(x)` on an optional field.
#[inline]
fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|v| v.is_finite())
}

/// A live shell (docs/ARCHITECTURE.md §2.5). Presentation-only fields of the
/// TypeScript entity (`rocket`) stay with the renderer.
#[derive(Clone, Debug, PartialEq)]
pub struct Shell {
    /// Unique numeric shell id.
    pub id: u64,
    /// Entity id of the firing tank.
    pub shooter_id: String,
    /// Whether the shooter is the local player.
    pub is_player: bool,
    /// The shell's specification.
    pub spec: ShellSpec,
    /// World position at the end of the last step.
    pub pos: Vec3,
    /// World position at the start of the last step (sweep segment origin).
    pub prev_pos: Vec3,
    /// Velocity, m/s.
    pub vel: Vec3,
    /// Flight time, s.
    pub age_s: f64,
    /// Arc length flown, m (penetration falloff).
    pub dist_m: f64,
    /// Set once the shell is spent.
    pub dead: bool,
    /// Whether the penetration roll has been made.
    pub pen_roll_done: bool,
    /// Penetration left after the roll, mm.
    pub remaining_pen_mm: f64,
    /// Damage roll.
    pub dmg_roll: f64,
    /// Ricochet count.
    pub bounces: u32,
    /// Whether the shell carried through a module.
    pub carried_through: bool,
    /// The gravity this shell flies under, m/s².
    pub gravity_mps2: f64,
}

/// Effective shell gravity: guided missiles fly the sight line, other specs
/// may scale gravity (`shellGravityMps2`).
pub fn shell_gravity_mps2(spec: Option<&ShellSpec>) -> f64 {
    if spec.is_some_and(|s| s.guided) {
        return 0.0;
    }
    let scale = match spec.and_then(|s| finite(s.gravity_scale)) {
        Some(scale) => jsmath::max(0.0, scale),
        None => GRAVITY_SCALE,
    };
    9.81 * scale
}

/// The explicit physical gun lay that intersects `aim_point`
/// (`solveBallisticGunLay`). AI-only: firing paths launch along the bore.
///
/// Returns `false` when no direction could be resolved; `out` then holds
/// whatever it held before.
pub fn solve_ballistic_gun_lay(
    out: &mut Vec3,
    muzzle_pos: &Vec3,
    aim_point: Option<&Vec3>,
    spec: Option<&ShellSpec>,
) -> bool {
    let Some(aim_point) = aim_point else {
        return false;
    };
    out.copy_from(aim_point).sub(muzzle_pos);
    if out.length_sq() <= 1e-9 {
        return false;
    }
    out.normalize();

    let gravity = shell_gravity_mps2(spec);
    let velocity = jsmath::or_zero(spec.map_or(0.0, |s| s.velocity_mps));
    if !(gravity > 0.0) || !(velocity > 0.0) {
        return true;
    }

    let dx = aim_point.x - muzzle_pos.x;
    let dy = aim_point.y - muzzle_pos.y;
    let dz = aim_point.z - muzzle_pos.z;
    let horizontal = jsmath::hypot2(dx, dz);
    if horizontal <= 1e-6 {
        return true;
    }

    let v2 = velocity * velocity;
    let discriminant = v2 * v2 - gravity * (gravity * horizontal * horizontal + 2.0 * dy * v2);
    if discriminant < 0.0 {
        return true; // unreachable: retain the direct fallback
    }

    // Rationalized low-angle root avoids catastrophic cancellation for modern
    // high-velocity rounds whose correction is only a few hundredths of a deg.
    let tan_theta = (gravity * horizontal * horizontal + 2.0 * dy * v2)
        / (horizontal * (v2 + jsmath::sqrt(discriminant)));
    let cos_theta = 1.0 / jsmath::sqrt(1.0 + tan_theta * tan_theta);
    let sin_theta = tan_theta * cos_theta;
    out.set(dx / horizontal * cos_theta, sin_theta, dz / horizontal * cos_theta);
    true
}

/// Create a live shell (`createShell`).
pub fn create_shell(
    spec: ShellSpec,
    shooter_id: &str,
    is_player: bool,
    muzzle_pos: &Vec3,
    dir: &Vec3,
    id: u64,
) -> Shell {
    let mut vel = *dir;
    vel.multiply_scalar(spec.velocity_mps);
    let gravity_mps2 = shell_gravity_mps2(Some(&spec));
    Shell {
        id,
        shooter_id: shooter_id.to_owned(),
        is_player,
        spec,
        pos: *muzzle_pos,
        prev_pos: *muzzle_pos,
        vel,
        age_s: 0.0,
        dist_m: 0.0,
        dead: false,
        pen_roll_done: false,
        remaining_pen_mm: 0.0,
        dmg_roll: 0.0,
        bounces: 0,
        carried_through: false,
        gravity_mps2,
    }
}

/// Integrate one shell step under its declared gravity, no drag
/// (`stepShell`). Stores `prev_pos` for the caller's sweep and marks the
/// shell dead past [`SHELL_MAX_LIFETIME_S`].
pub fn step_shell(shell: &mut Shell, dt: f64) {
    shell.prev_pos = shell.pos;
    let gravity = if shell.gravity_mps2.is_finite() { shell.gravity_mps2 } else { G_SHELL };
    let vel = shell.vel;
    shell.pos.add_scaled_vector(&vel, dt);
    shell.pos.y -= 0.5 * gravity * dt * dt;
    shell.dist_m += shell.pos.distance_to(&shell.prev_pos); // true arc length for pen falloff
    shell.vel.y -= gravity * dt;
    shell.age_s += dt;
    if shell.age_s > SHELL_MAX_LIFETIME_S {
        shell.dead = true;
    }
}

/// Steer a guided missile toward `aim_point` at its authored speed with a
/// bounded turn (`guideShellToward`). Returns whether a velocity was applied.
pub fn guide_shell_toward(shell: &mut Shell, aim_point: Option<&Vec3>, dt: f64) -> bool {
    if !shell.spec.guided {
        return false;
    }
    let Some(aim_point) = aim_point else {
        return false;
    };
    if !(dt > 0.0) {
        return false;
    }
    let speed = shell.vel.length();
    if !(speed > 1e-6) {
        return false;
    }
    let mut desired = Vec3::ZERO;
    desired.copy_from(aim_point).sub(&shell.pos);
    if desired.length_sq() <= 1e-8 {
        return false;
    }
    desired.normalize();
    let mut current = Vec3::ZERO;
    current.copy_from(&shell.vel).multiply_scalar(1.0 / speed);
    let dot = jsmath::max(-1.0, jsmath::min(1.0, current.dot(&desired)));
    let angle = jsmath::acos(dot);
    if angle <= 1e-7 {
        return true;
    }
    let rate = match finite(shell.spec.guidance_turn_rate_rad_s) {
        Some(rate) => jsmath::max(0.0, rate),
        None => GUIDED_MISSILE_TURN_RATE_RAD_S,
    };
    let turn = jsmath::min(angle, rate * dt);
    if !(turn > 0.0) {
        return false;
    }
    let mut perp = Vec3::ZERO;
    perp.copy_from(&desired).add_scaled_vector(&current, -dot);
    if perp.length_sq() <= 1e-10 {
        let flat = jsmath::abs(current.y) < 0.9;
        perp.set(if flat { 0.0 } else { 1.0 }, if flat { 1.0 } else { 0.0 }, 0.0)
            .cross(&current);
    }
    perp.normalize();
    current.multiply_scalar(jsmath::cos(turn)).add_scaled_vector(&perp, jsmath::sin(turn));
    shell.vel.copy_from(&current).multiply_scalar(speed);
    true
}

/// Penetration at a flight distance (`penAtDistanceMm`): linear 100 m → 1000 m,
/// a second segment to an optional 2000 m anchor, clamped outside.
pub fn pen_at_distance_mm(spec: &ShellSpec, dist_m: f64) -> f64 {
    let pen2000 = jsmath::or_zero(spec.pen2000_mm.unwrap_or(0.0));
    if dist_m > 1000.0 && pen2000 > 0.0 {
        let f2 = jsmath::min(1.0, (dist_m - 1000.0) / 1000.0);
        return spec.pen1000_mm + (pen2000 - spec.pen1000_mm) * f2;
    }
    let f = jsmath::min(1.0, jsmath::max(0.0, (dist_m - 100.0) / 900.0));
    spec.pen100_mm + (spec.pen1000_mm - spec.pen100_mm) * f
}

/// Barrel elevation above the line to a target at `dist_m` on flat ground for
/// muzzle velocity `velocity_mps` (`aimElevationRad`): `0.5·asin(g·d/v²)`,
/// clamped to the max-range solution.
pub fn aim_elevation_rad(dist_m: f64, velocity_mps: f64) -> f64 {
    let s = jsmath::min(1.0, jsmath::max(-1.0, (G_SHELL * dist_m) / (velocity_mps * velocity_mps)));
    0.5 * jsmath::asin(s)
}

/// Perturb a unit fire direction by gun dispersion (`applyDispersion`):
/// a Box-Muller pair in units of σ, re-placed uniformly inside the 2σ reticle
/// circle when it lands outside (the post-8.6 rule), then applied as two
/// angular offsets. Callers pass `sigma_rad = r(100 m) / 200`.
pub fn apply_dispersion<R: Rng + ?Sized>(dir: &mut Vec3, sigma_rad: f64, rng: &mut R) {
    if !(sigma_rad > 0.0) {
        return;
    }
    let mut x;
    let mut y;
    {
        let u1 = jsmath::max(rng.next_f64(), 1e-12);
        let u2 = rng.next_f64();
        let r = jsmath::sqrt(-2.0 * jsmath::log(u1));
        x = r * jsmath::cos(2.0 * jsmath::PI * u2);
        y = r * jsmath::sin(2.0 * jsmath::PI * u2);
        if x * x + y * y > 4.0 {
            let rr = 2.0 * jsmath::sqrt(rng.next_f64());
            let th = 2.0 * jsmath::PI * rng.next_f64();
            x = rr * jsmath::cos(th);
            y = rr * jsmath::sin(th);
        }
    }

    let mut basis_ref = Vec3::new(0.0, 1.0, 0.0);
    if jsmath::abs(dir.y) > 0.99 {
        basis_ref.set(1.0, 0.0, 0.0);
    }
    let mut right = Vec3::ZERO;
    right.cross_vectors(dir, &basis_ref).normalize();
    let mut up = Vec3::ZERO;
    up.cross_vectors(&right, dir).normalize();
    dir.add_scaled_vector(&right, jsmath::tan(x * sigma_rad))
        .add_scaled_vector(&up, jsmath::tan(y * sigma_rad))
        .normalize();
}
