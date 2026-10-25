//! Raw C-ABI WebAssembly bindings of cot-sim (no wasm-bindgen glue: only
//! numbers and linear-memory offsets cross the boundary). One instance holds
//! one world's state; JavaScript reads and writes its buffers through views
//! on `memory` at the offsets the `*_ptr` exports return.
//!
//! - `js_*`: the pinned ECMAScript math ([`cot_sim::jsmath`]), the same bits on
//!   every engine — the golden oracle installs them over `Math.*`.
//! - `lattice_*` / `contact_*`: the terrain contact surface ([`cot_sim::contact`]).
//! - `grid_*`: the obstacle grid ([`cot_sim::grid`]), by handle.
//! - `shells_step`: the shell step ([`cot_sim::ballistics::step_shell`]) over a packed batch.

use cot_sim::contact::{ContactLattice, Sample};
use cot_sim::grid::{ObstacleGrid, PlanBox};
use cot_sim::jsmath;
use cot_sim::math::Vec3;

macro_rules! unary {
    ($($name:ident => $f:path),* $(,)?) => {
        $(
            #[unsafe(no_mangle)]
            pub extern "C" fn $name(x: f64) -> f64 {
                $f(x)
            }
        )*
    };
}

unary! {
    js_sin => jsmath::sin, js_cos => jsmath::cos, js_tan => jsmath::tan, js_asin => jsmath::asin,
    js_acos => jsmath::acos, js_atan => jsmath::atan, js_exp => jsmath::exp, js_log => jsmath::log,
    js_cbrt => jsmath::cbrt,
}

#[unsafe(no_mangle)]
pub extern "C" fn js_atan2(y: f64, x: f64) -> f64 {
    jsmath::atan2(y, x)
}

#[unsafe(no_mangle)]
pub extern "C" fn js_pow(x: f64, y: f64) -> f64 {
    jsmath::pow(x, y)
}

struct State {
    lattice: ContactLattice,
    /// What the last `contact_sample` lacked: 0 answered, 1 off the square, 2 a corner, 3 a fold's split.
    status: u32,
    missing: (u32, u32),
    grids: Vec<(ObstacleGrid, Vec<u32>)>,
    scratch: Vec<u8>,
}

static mut STATE: Option<State> = None;

fn state() -> &'static mut State {
    // SAFETY: a WebAssembly instance runs on one thread and no export re-enters another while it holds this borrow.
    unsafe {
        (*core::ptr::addr_of_mut!(STATE)).get_or_insert_with(|| State {
            lattice: ContactLattice::new(),
            status: 0,
            missing: (0, 0),
            grids: Vec::new(),
            scratch: Vec::new(),
        })
    }
}

/// A scratch buffer of `bytes` bytes for the host to fill (valid until the next call).
#[unsafe(no_mangle)]
pub extern "C" fn scratch_ptr(bytes: usize) -> *mut u8 {
    let s = &mut state().scratch;
    if s.len() < bytes {
        s.resize(bytes, 0);
    }
    s.as_mut_ptr()
}

/// The lattice's Float32 corner heights (N × N, row-major in z).
#[unsafe(no_mangle)]
pub extern "C" fn lattice_heights_ptr() -> *mut f32 {
    state().lattice.raw_parts().0.as_mut_ptr()
}

/// The lattice's corner-known bits.
#[unsafe(no_mangle)]
pub extern "C" fn lattice_ready_ptr() -> *mut u8 {
    state().lattice.raw_parts().1.as_mut_ptr()
}

/// The lattice's per-cell split states (0 unknown, 1 b–c, 2 a–d).
#[unsafe(no_mangle)]
pub extern "C" fn lattice_flips_ptr() -> *mut u8 {
    state().lattice.raw_parts().2.as_mut_ptr()
}

/// The exact world coordinate of lattice vertex `i` (where the host evaluates its height function).
#[unsafe(no_mangle)]
pub extern "C" fn lattice_vertex_coordinate(i: u32) -> f64 {
    state().lattice.vertex_coordinate(i as usize)
}

/// Decide fold cell (ix, iz)'s split from the height function's value at its centre.
#[unsafe(no_mangle)]
pub extern "C" fn lattice_set_flip_from_centre(ix: u32, iz: u32, centre: f64) {
    state().lattice.set_flip_from_centre(ix as usize, iz as usize, centre);
}

/// The contact height at (x, z), or NaN with `contact_status` saying what is missing.
#[unsafe(no_mangle)]
pub extern "C" fn contact_sample(x: f64, z: f64) -> f64 {
    let s = state();
    match s.lattice.sample(x, z) {
        Sample::Height(h) => {
            s.status = 0;
            h
        }
        Sample::OffSquare => {
            s.status = 1;
            f64::NAN
        }
        Sample::MissingVertex(ix, iz) => {
            s.status = 2;
            s.missing = (ix as u32, iz as u32);
            f64::NAN
        }
        Sample::MissingFlip(ix, iz) => {
            s.status = 3;
            s.missing = (ix as u32, iz as u32);
            f64::NAN
        }
    }
}

/// Why the last `contact_sample` (or the batch's stop) returned NaN.
#[unsafe(no_mangle)]
pub extern "C" fn contact_status() -> u32 {
    state().status
}

/// The cell the last miss needs (x index).
#[unsafe(no_mangle)]
pub extern "C" fn contact_missing_ix() -> u32 {
    state().missing.0
}

/// The cell the last miss needs (z index).
#[unsafe(no_mangle)]
pub extern "C" fn contact_missing_iz() -> u32 {
    state().missing.1
}

/// Sample `n` points packed as x, z pairs at `points` into `out`, from `start`. An off-square point writes NaN and
/// goes on; a missing corner or split stops there and returns its index (the host supplies it and resumes). Returns
/// `n` when every point is answered.
#[unsafe(no_mangle)]
pub extern "C" fn contact_sample_batch(points: *const f64, n: usize, out: *mut f64, start: usize) -> usize {
    // SAFETY: the host passes buffers of 2n and n doubles inside this instance's memory.
    let (points, out) = unsafe { (core::slice::from_raw_parts(points, 2 * n), core::slice::from_raw_parts_mut(out, n)) };
    for i in start..n {
        let h = contact_sample(points[2 * i], points[2 * i + 1]);
        if h.is_nan() && state().status >= 2 {
            return i;
        }
        out[i] = h;
    }
    n
}

/// Build an obstacle grid over `n` plan boxes packed as minX, minZ, maxX, maxZ; returns its handle.
#[unsafe(no_mangle)]
pub extern "C" fn grid_new(boxes: *const f64, n: usize, cell_size: f64) -> u32 {
    // SAFETY: the host passes 4n doubles inside this instance's memory.
    let raw = unsafe { core::slice::from_raw_parts(boxes, 4 * n) };
    let boxes = raw.chunks_exact(4).map(|b| PlanBox { min_x: b[0], min_z: b[1], max_x: b[2], max_z: b[3] }).collect();
    let grids = &mut state().grids;
    grids.push((ObstacleGrid::new(boxes, cell_size), Vec::with_capacity(n)));
    (grids.len() - 1) as u32
}

/// Query grid `handle`; returns how many record indices it wrote at `grid_out_ptr(handle)`.
#[unsafe(no_mangle)]
pub extern "C" fn grid_query(handle: u32, min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> u32 {
    let (grid, out) = &mut state().grids[handle as usize];
    grid.query(min_x, min_z, max_x, max_z, out);
    out.len() as u32
}

/// Where grid `handle`'s last answer lies (stable: the buffer holds every record's index at most once).
#[unsafe(no_mangle)]
pub extern "C" fn grid_out_ptr(handle: u32) -> *const u32 {
    state().grids[handle as usize].1.as_ptr()
}

/// Run `n` queries packed as minX, minZ, maxX, maxZ against grid `handle`: each answer's count at `counts[i]` and the
/// indices concatenated at `indices` (room for `capacity`). Returns the total written, or u32::MAX when it would overflow.
#[unsafe(no_mangle)]
pub extern "C" fn grid_query_batch(handle: u32, boxes: *const f64, n: usize, counts: *mut u32, indices: *mut u32, capacity: usize) -> u32 {
    // SAFETY: the host passes 4n doubles, n counts and `capacity` indices inside this instance's memory.
    let (boxes, counts, indices) = unsafe {
        (core::slice::from_raw_parts(boxes, 4 * n), core::slice::from_raw_parts_mut(counts, n), core::slice::from_raw_parts_mut(indices, capacity))
    };
    let (grid, out) = &mut state().grids[handle as usize];
    let mut total = 0usize;
    for (i, b) in boxes.chunks_exact(4).enumerate() {
        grid.query(b[0], b[1], b[2], b[3], out);
        if total + out.len() > capacity {
            return u32::MAX;
        }
        indices[total..total + out.len()].copy_from_slice(out);
        total += out.len();
        counts[i] = out.len() as u32;
    }
    total as u32
}

/// Doubles per shell in `shells_step`'s batch: pos xyz, prevPos xyz, vel xyz, ageS, distM, gravityMps2, the resolved
/// lifetime (`spec.maxLifetimeS ?? SHELL_MAX_LIFETIME_S`), dead (0 / 1).
pub const SHELL_STRIDE: usize = 14;

/// `stepShell` over `n` packed shells, `steps` times (a dead shell keeps stepping, as the TypeScript would if called).
#[unsafe(no_mangle)]
pub extern "C" fn shells_step(shells: *mut f64, n: usize, dt: f64, steps: u32) {
    // SAFETY: the host passes n * SHELL_STRIDE doubles inside this instance's memory.
    let all = unsafe { core::slice::from_raw_parts_mut(shells, n * SHELL_STRIDE) };
    for s in all.chunks_exact_mut(SHELL_STRIDE) {
        let mut pos = Vec3::new(s[0], s[1], s[2]);
        let mut prev = Vec3::new(s[3], s[4], s[5]);
        let mut vel = Vec3::new(s[6], s[7], s[8]);
        let (mut age, mut dist, gravity, life) = (s[9], s[10], s[11], s[12]);
        let mut dead = s[13] != 0.0;
        let g = if gravity.is_finite() { gravity } else { 9.81 * cot_sim::ballistics::GRAVITY_SCALE };
        for _ in 0..steps {
            prev = pos;
            pos.add_scaled_vector(&vel, dt);
            pos.y -= 0.5 * g * dt * dt;
            dist += pos.distance_to(&prev);
            vel.y -= g * dt;
            age += dt;
            if age > life {
                dead = true;
            }
        }
        s[0] = pos.x;
        s[1] = pos.y;
        s[2] = pos.z;
        s[3] = prev.x;
        s[4] = prev.y;
        s[5] = prev.z;
        s[6] = vel.x;
        s[7] = vel.y;
        s[8] = vel.z;
        s[9] = age;
        s[10] = dist;
        s[13] = if dead { 1.0 } else { 0.0 };
    }
}
