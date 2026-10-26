//! Raw C-ABI WebAssembly bindings of cot-sim (no wasm-bindgen glue: only
//! numbers and linear-memory offsets cross the boundary). One instance holds
//! one world's state; JavaScript reads and writes its buffers through views
//! on `memory` at the offsets the `*_ptr` exports return.
//!
//! - `js_*`: the pinned ECMAScript math ([`cot_sim::jsmath`]), the same bits on
//!   every engine — the golden oracle installs them over `Math.*`.
//! - `lattice_*` / `contact_*`: the terrain contact surface ([`cot_sim::contact`]): heights and fold splits.
//! - `grid_*`: the obstacle grid ([`cot_sim::grid`]), by handle.
//! - `shells_step`: the shell step ([`cot_sim::ballistics::step_shell`]) over a packed batch.
//! - `overlay_*`: the match's deformed ground ([`cot_sim::deformation`]), mirrored from the TypeScript's overlay.
//! - `records_*` / `support_*`: the obstacle records and a hull's structure support ([`cot_sim::structure_support`]):
//!   one call answers a support sample — the contact surface, the overlay on it and the tops over it.
//!
//! The module imports one function, `env.terrain_height(x, z)`: the map's height function, which fills the contact
//! lattice's vertices and decides its fold splits the first time each is needed.

use cot_sim::clearance;
use cot_sim::contact::{ContactLattice, Sample};
use cot_sim::deformation::TerrainDeformation;
use cot_sim::grid::{ObstacleGrid, PlanBox};
use cot_sim::jsmath;
use cot_sim::math::Vec3;
use cot_sim::records::{HullFootprint, Part, PartKind, Record, Shape};
use cot_sim::structure_support::SupportField;
use cot_sim::support_sampling::{sample_support, SamplingFrame, SamplingOut, BED_MAX, FIT_MAX, INNER_MAX};

#[link(wasm_import_module = "env")]
unsafe extern "C" {
    /// The map's height function (the host's `heightField.getHeightAt`).
    fn terrain_height(x: f64, z: f64) -> f64;
}

fn height(x: f64, z: f64) -> f64 {
    // SAFETY: the host supplies a pure function of two doubles.
    unsafe { terrain_height(x, z) }
}

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
    js_cbrt => jsmath::cbrt, js_tanh => jsmath::tanh, js_cosh => jsmath::cosh, js_expm1 => jsmath::expm1,
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
    overlay: TerrainDeformation,
    records: Vec<Record>,
    /// Per record: bit 0 crushed, bit 1 dead (the host writes a hull's candidates' before `support_begin`).
    record_flags: Vec<u8>,
    /// Per record: a bridge deck (the bots' clearance scans pass over it).
    bridges: Vec<bool>,
    /// The clearance walk's candidates (`clearance_begin`), its position in them and the last lane's entry.
    clearance_candidates: Vec<u32>,
    clearance_cursor: usize,
    clearance_entry: f64,
    support_grid: Option<usize>,
    support: SupportField,
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
            overlay: TerrainDeformation::new(),
            records: Vec::new(),
            record_flags: Vec::new(),
            bridges: Vec::new(),
            clearance_candidates: Vec::new(),
            clearance_cursor: 0,
            clearance_entry: 0.0,
            support_grid: None,
            support: SupportField::new(),
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

/// `cellFlippedAt` at (x, z): 1 for the a–d split, 0 for b–c (and off the square), or 2 / 3 when a corner / the split
/// is missing (`contact_missing_*` name the cell; the host supplies it and asks again).
#[unsafe(no_mangle)]
pub extern "C" fn contact_cell_flipped(x: f64, z: f64) -> u32 {
    let s = state();
    match s.lattice.cell_flipped_at(x, z) {
        Ok(flipped) => flipped as u32,
        Err(Sample::MissingVertex(ix, iz)) => {
            s.missing = (ix as u32, iz as u32);
            2
        }
        Err(Sample::MissingFlip(ix, iz)) => {
            s.missing = (ix as u32, iz as u32);
            3
        }
        Err(_) => 0,
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

// ------------------------------------------------------------ filled contact ----

/// Supply what the lattice reported missing from the map's height function.
fn supply(lattice: &mut ContactLattice, missing: Sample) {
    match missing {
        Sample::MissingVertex(ix, iz) => {
            for (vx, vz) in [(ix, iz), (ix + 1, iz), (ix, iz + 1), (ix + 1, iz + 1)] {
                if !lattice.vertex_ready(vx, vz) {
                    let h = height(lattice.vertex_coordinate(vx), lattice.vertex_coordinate(vz));
                    lattice.set_vertex(vx, vz, h);
                }
            }
        }
        Sample::MissingFlip(ix, iz) => {
            let (cx, cz) = lattice.cell_centre(ix, iz);
            lattice.set_flip_from_centre(ix, iz, height(cx, cz));
        }
        _ => {}
    }
}

/// The contact surface at (x, z), its lattice filled as needed (the TypeScript sampler's answer, off the square the
/// height function's).
fn contact_filled(lattice: &mut ContactLattice, x: f64, z: f64) -> f64 {
    loop {
        match lattice.sample(x, z) {
            Sample::Height(h) => return h,
            Sample::OffSquare => return height(x, z),
            missing => supply(lattice, missing),
        }
    }
}

/// `cellFlippedAt`, the lattice filled as needed.
fn flipped_filled(lattice: &mut ContactLattice, x: f64, z: f64) -> bool {
    loop {
        match lattice.cell_flipped_at(x, z) {
            Ok(flipped) => return flipped,
            Err(missing) => supply(lattice, missing),
        }
    }
}

/// The contact height at (x, z), the lattice filled from `env.terrain_height` as needed.
#[unsafe(no_mangle)]
pub extern "C" fn contact_height(x: f64, z: f64) -> f64 {
    contact_filled(&mut state().lattice, x, z)
}

/// `cellFlippedAt` at (x, z): 1 for the a–d split, the lattice filled as needed.
#[unsafe(no_mangle)]
pub extern "C" fn contact_flipped(x: f64, z: f64) -> u32 {
    flipped_filled(&mut state().lattice, x, z) as u32
}

/// The deformed contact surface (createDeformedHeightField's getContactHeightAt over the kernel's surface): the contact
/// height plus the overlay on its triangle, the a–d split where the overlay is near and the base cell takes it.
fn deformed_contact(s: &mut State, x: f64, z: f64) -> f64 {
    let base = contact_filled(&mut s.lattice, x, z);
    let flipped = s.overlay.near(x, z) && flipped_filled(&mut s.lattice, x, z);
    base + s.overlay.contact_offset_at(x, z, flipped)
}

// ------------------------------------------------------------------ overlay ----

/// `addCrater`: 1 admitted, 0 refused (its buckets are full).
#[unsafe(no_mangle)]
pub extern "C" fn overlay_add_crater(x: f64, z: f64, radius_m: f64, depth_m: f64, rim_m: f64, seed: u32) -> u32 {
    state().overlay.add_crater(x, z, radius_m, depth_m, rim_m, seed) as u32
}

/// `addRubble`; `has_t0` 0 is the TypeScript's `undefined` start.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn overlay_add_rubble(cx: f64, cz: f64, hw: f64, hd: f64, yaw: f64, height_m: f64, t0: f64, has_t0: u32) {
    state().overlay.add_rubble(cx, cz, hw, hd, yaw, height_m, if has_t0 != 0 { Some(t0) } else { None });
}

/// `addCourse`: its (u, h) knots are `n` doubles at `profile`.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn overlay_add_course(cx: f64, cz: f64, c: f64, s: f64, hw: f64, skirt_m: f64, profile: *const f64, n: usize) {
    // SAFETY: the host passes n doubles inside this instance's memory.
    let knots = unsafe { core::slice::from_raw_parts(profile, n) }.to_vec();
    state().overlay.add_course(cx, cz, c, s, hw, skirt_m, knots);
}

/// `reset`.
#[unsafe(no_mangle)]
pub extern "C" fn overlay_reset() {
    state().overlay.reset();
}

/// `setTime`.
#[unsafe(no_mangle)]
pub extern "C" fn overlay_set_time(time_s: f64) {
    state().overlay.set_time(time_s);
}

/// The overlay's revision (a mirror check: it moves with the TypeScript's).
#[unsafe(no_mangle)]
pub extern "C" fn overlay_revision() -> u32 {
    state().overlay.revision()
}

// ------------------------------------------------------- records and support ----

/// Read one part at `*i` of the flat encoding (kind 0 null, 1 box, 2 circle, 3 convex; then has-extent, y0, y1).
fn read_part(v: &[f64], i: &mut usize) -> Option<Part> {
    let mut next = || {
        let x = v[*i];
        *i += 1;
        x
    };
    let kind = next() as u32;
    let has_y = next() != 0.0;
    let (y0, y1) = (next(), next());
    let y = if has_y { Some((y0, y1)) } else { None };
    let kind = match kind {
        0 => return None,
        1 => {
            let (cx, cz, hw, hl, yaw) = (next(), next(), next(), next(), next());
            return Some(Part::obb(cx, cz, hw, hl, yaw, y));
        }
        2 => PartKind::Circle { cx: next(), cz: next(), r: next() },
        _ => {
            let n = next() as usize;
            let points = (0..n).map(|_| next()).collect();
            let m = next() as usize;
            let tp = if m > 0 { Some((0..m).map(|_| next()).collect()) } else { None };
            PartKind::Convex { points, tp }
        }
    };
    Some(Part { kind, y })
}

/// Load the obstacle records, in the order the grid `grid` was built over: per record min xyz, max xyz, flags (1
/// crushable, 2 a wreck, 4 a bridge deck), shape (0 none, 1 one part, 2 a compound and its part count), then its parts. Returns the count.
#[unsafe(no_mangle)]
pub extern "C" fn records_load(data: *const f64, len: usize, grid: u32) -> u32 {
    // SAFETY: the host passes len doubles inside this instance's memory.
    let v = unsafe { core::slice::from_raw_parts(data, len) };
    let mut records = Vec::new();
    let mut bridges = Vec::new();
    let mut i = 0;
    while i < v.len() {
        let min = [v[i], v[i + 1], v[i + 2]];
        let max = [v[i + 3], v[i + 4], v[i + 5]];
        let flags = v[i + 6] as u32;
        let tag = v[i + 7] as u32;
        i += 8;
        let shape = match tag {
            0 => Shape::None,
            1 => Shape::Simple(read_part(v, &mut i).expect("a simple shape is a part")),
            _ => {
                let n = v[i] as usize;
                i += 1;
                Shape::Compound((0..n).map(|_| read_part(v, &mut i)).collect())
            }
        };
        records.push(Record::new(min, max, shape, flags & 1 != 0, flags & 2 != 0));
        bridges.push(flags & 4 != 0);
    }
    let s = state();
    s.record_flags = vec![0; records.len()];
    s.bridges = bridges;
    s.records = records;
    s.support_grid = Some(grid as usize);
    s.records.len() as u32
}

/// The records' flags (bit 0 crushed, bit 1 dead), one byte each.
#[unsafe(no_mangle)]
pub extern "C" fn record_flags_ptr() -> *mut u8 {
    state().record_flags.as_mut_ptr()
}

/// `beginHull`'s query: the candidates about (x, z); returns their count (their indices at `support_candidates_ptr`).
#[unsafe(no_mangle)]
pub extern "C" fn support_query(x: f64, z: f64) -> u32 {
    let s = state();
    let grid = &mut s.grids[s.support_grid.expect("records_load first")].0;
    s.support.query(grid, x, z) as u32
}

/// The candidates of the last `support_query`.
#[unsafe(no_mangle)]
pub extern "C" fn support_candidates_ptr() -> *const u32 {
    state().support.candidates().as_ptr()
}

/// `beginHull` over the queried candidates, their flags read from `record_flags` (`posed` 0: no pose).
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn support_begin(
    x: f64, z: f64, belly_y: f64, posed: u32, center_x: f64, center_z: f64, forward_x: f64, forward_z: f64, right_x: f64,
    right_z: f64, half_length: f64, half_width: f64, center_rise: f64, rise_along: f64, rise_across: f64, front_lift: f64,
    rear_lift: f64,
) {
    let s = state();
    for &c in s.support.candidates() {
        let flags = s.record_flags[c as usize];
        let record = &mut s.records[c as usize];
        record.crushed = flags & 1 != 0;
        record.dead = flags & 2 != 0;
    }
    let pose = HullFootprint { center_x, center_z, forward_x, forward_z, right_x, right_z, half_length, half_width, center_rise, rise_along, rise_across, front_lift, rear_lift };
    s.support.begin_queried(&s.records, x, z, belly_y, if posed != 0 { Some(&pose) } else { None });
}

/// The support at (x, z): the tops over the deformed contact surface (the field's getContactHeightAt).
#[unsafe(no_mangle)]
pub extern "C" fn support_contact(x: f64, z: f64) -> f64 {
    let s = state();
    let ground = deformed_contact(s, x, z);
    s.support.sample(&s.records, x, z, ground)
}

/// The deformed contact surface alone (the field's getTerrainContactHeightAt).
#[unsafe(no_mangle)]
pub extern "C" fn terrain_contact(x: f64, z: f64) -> f64 {
    deformed_contact(state(), x, z)
}

/// The tops over a ground the host computed (the field's getHeightAt and getHeightAtFast).
#[unsafe(no_mangle)]
pub extern "C" fn support_top(x: f64, z: f64, ground: f64) -> f64 {
    let s = state();
    s.support.sample(&s.records, x, z, ground)
}

/// Reads so far a primitive's top answered over the ground.
#[unsafe(no_mangle)]
pub extern "C" fn support_record_reads() -> u32 {
    state().support.record_reads
}

/// Whether the current hull stands on a roof's deck.
#[unsafe(no_mangle)]
pub extern "C" fn support_standing() -> u32 {
    state().support.standing_deck() as u32
}

// ------------------------------------------------------- the bots' clearance scans ----

/// What a clearance scan passes over: bit 0 a crushable, bit 1 a bridge deck (collision.ts CLEARANCE_SKIP_*).
fn clearance_skips(records: &[Record], bridges: &[bool], index: usize, skip: u32) -> bool {
    (skip & 1 != 0 && records[index].crushable) || (skip & 2 != 0 && bridges[index])
}

/// Begin a clearance walk over the support grid's records in the box [min_x, max_x] × [min_z, max_z], in the grid's
/// order; returns their count. One walk at a time: the next `clearance_begin` starts over.
#[unsafe(no_mangle)]
pub extern "C" fn clearance_begin(min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> u32 {
    let State { grids, clearance_candidates, clearance_cursor, support_grid, .. } = state();
    let (grid, out) = &mut grids[support_grid.expect("records_load first")];
    grid.query(min_x, min_z, max_x, max_z, out);
    clearance_candidates.clear();
    clearance_candidates.extend_from_slice(out);
    *clearance_cursor = 0;
    clearance_candidates.len() as u32
}

/// The walk's next record that `skip` keeps and whose clearance (the footprint grown by `margin`, clearance.rs
/// contains_point) holds (x, z), or -1 at the walk's end. Crushed and dead records are kept: their state is the host's,
/// and the host's loop stops where it always did.
#[unsafe(no_mangle)]
pub extern "C" fn clearance_point_next(x: f64, z: f64, margin: f64, skip: u32) -> i32 {
    let State { records, bridges, clearance_candidates, clearance_cursor, .. } = state();
    while let Some(&index) = clearance_candidates.get(*clearance_cursor) {
        *clearance_cursor += 1;
        let i = index as usize;
        if !clearance_skips(records, bridges, i, skip) && clearance::contains_point(&records[i], x, z, margin) {
            return index as i32;
        }
    }
    -1
}

/// The walk's next record that `skip` keeps and that the lane from (sx, sz) along (dx, dz) enters within `reach`
/// (clearance.rs ray_entry, the footprint grown by `margin`), or -1 at the walk's end; its entry at `clearance_entry`.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn clearance_lane_next(sx: f64, sz: f64, dx: f64, dz: f64, reach: f64, margin: f64, skip: u32) -> i32 {
    let State { records, bridges, clearance_candidates, clearance_cursor, clearance_entry, .. } = state();
    while let Some(&index) = clearance_candidates.get(*clearance_cursor) {
        *clearance_cursor += 1;
        let i = index as usize;
        if clearance_skips(records, bridges, i, skip) {
            continue;
        }
        if let Some(entry) = clearance::ray_entry(&records[i], sx, sz, dx, dz, reach, margin) {
            *clearance_entry = entry;
            return index as i32;
        }
    }
    -1
}

/// The entry of the record `clearance_lane_next` returned last.
#[unsafe(no_mangle)]
pub extern "C" fn clearance_entry() -> f64 {
    state().clearance_entry
}

// ------------------------------------------------------------- the support fan ----

/// The doubles of a sampling frame (`support_sample_hull`'s input, in SamplingFrame's order with its options flagged).
const FRAME_LEN: usize = 36;
/// The output's scalars, then the fit, bed and inner arrays at their caps.
const OUT_SCALARS: usize = 27;
const OUT_LEN: usize = OUT_SCALARS + 4 * FIT_MAX + 3 * BED_MAX + 3 * INNER_MAX;

struct Sampling {
    input: Vec<f64>,
    out: SamplingOut,
    output: Vec<f64>,
}

// (apart from STATE: the samplers borrow the world while the frame and its output are read and written)
static mut SAMPLING: Option<Sampling> = None;

fn sampling() -> &'static mut Sampling {
    // SAFETY: one thread; no export re-enters while this borrow is live, and the samplers touch STATE alone.
    unsafe { (*core::ptr::addr_of_mut!(SAMPLING)).get_or_insert_with(|| Sampling { input: vec![0.0; FRAME_LEN], out: SamplingOut::default(), output: vec![0.0; OUT_LEN] }) }
}

/// Where the host writes a hull's sampling frame.
#[unsafe(no_mangle)]
pub extern "C" fn sampling_frame_ptr() -> *mut f64 {
    sampling().input.as_mut_ptr()
}

/// Where `support_sample_hull` leaves its aggregates and arrays.
#[unsafe(no_mangle)]
pub extern "C" fn sampling_out_ptr() -> *const f64 {
    sampling().output.as_ptr()
}

/// sampleOuterTrackLines and sampleSupportFan for the hull framed at `sampling_frame_ptr`, every sample read on the
/// world's own support and terrain samplers (reachableTrackGroundAt's wall rules included).
#[unsafe(no_mangle)]
pub extern "C" fn support_sample_hull() {
    let sm = sampling();
    let v = &sm.input;
    let frame = SamplingFrame {
        world_x: v[0], world_z: v[1], cos_yaw: v[2], sin_yaw: v[3], cos_neg_pitch: v[4], sin_neg_pitch: v[5], cos_roll: v[6],
        sin_roll: v[7], sin_pitch: v[8], cos_pitch: v[9], fit_sin_pitch: v[10], fit_cos_pitch: v[11], fit_sin_roll: v[12],
        fit_cos_roll: v[13], half_length: v[14], center_z: v[15], step: v[16], line_count: v[17] as usize, z_half: v[18],
        pan_y: if v[20] != 0.0 { Some(v[19]) } else { None },
        end_rise: if v[24] != 0.0 { Some((v[21], v[22], v[23])) } else { None },
        gear_bottom_y: v[25], half_width: v[26], rigid_gear: v[27] != 0.0, ref_y: v[28], root_x: v[29], root_z: v[30],
        line_y: v[31], rise_per_m: v[32], track_sin_roll: v[33], forward_x: v[34], forward_z: v[35],
    };
    let mut support = |x: f64, z: f64| {
        let s = state();
        let ground = deformed_contact(s, x, z);
        s.support.sample(&s.records, x, z, ground)
    };
    let mut terrain = |x: f64, z: f64| deformed_contact(state(), x, z);
    sample_support(&frame, &mut support, &mut terrain, &mut sm.out);
    let o = &sm.out;
    let scalars = [
        o.sum_height_z, o.sum_zz, o.sum_left, o.sum_right, o.side_count, o.outer_max, o.outer_x, o.outer_z,
        o.settle_deficit_sum, o.deficit_count, o.deepest_z, o.settle_outer_max, o.front_max, o.front_z, o.rear_max, o.rear_z,
        o.fan_max, o.belly_max, o.fit_count as f64, o.bed_count as f64, o.wrap_max, o.fan_touch_left_x, o.fan_touch_right_x,
        o.inner_count as f64, o.belly_touch_min_x, o.belly_touch_max_x, o.bottom_lift,
    ];
    let w = &mut sm.output;
    w[..OUT_SCALARS].copy_from_slice(&scalars);
    let mut at = OUT_SCALARS;
    for (array, used) in [(&o.fit_z[..], o.fit_count), (&o.fit_x[..], o.fit_count), (&o.fit_h[..], o.fit_count), (&o.fit_d[..], o.fit_count)] {
        w[at..at + used].copy_from_slice(&array[..used]);
        at += FIT_MAX;
    }
    for (array, used) in [(&o.bed_x[..], o.bed_count), (&o.bed_z[..], o.bed_count), (&o.bed_d[..], o.bed_count)] {
        w[at..at + used].copy_from_slice(&array[..used]);
        at += BED_MAX;
    }
    for (array, used) in [(&o.inner_x[..], o.inner_count), (&o.inner_z[..], o.inner_count), (&o.inner_h[..], o.inner_count)] {
        w[at..at + used].copy_from_slice(&array[..used]);
        at += INNER_MAX;
    }
}
