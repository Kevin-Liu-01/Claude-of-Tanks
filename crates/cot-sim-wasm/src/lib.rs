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
//!
//! The calls that only make sense in an order carry their protocol here, checked per call (2026-11-02 audit S2): a
//! write-once lattice, a clearance walk named by the id its begin returned, the hull support's query → flags → begin →
//! samples, and grid handles this instance made. A call out of order or with a stale name is refused with a code (the
//! `REFUSED_*` constants; [`protocol_refusal`] names the last), never answered from a half-made state, and the host
//! (src/world/wasmWorldKernels.ts) asserts on it.

use cot_sim::clearance;
use cot_sim::contact::{ContactLattice, LatticeRefusal, Sample};
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

/// No refusal: the call was taken.
pub const ACCEPTED: u32 = 0;
/// The obstacle records are not loaded (`records_load` first).
pub const REFUSED_NOT_LOADED: u32 = 1;
/// Out of its protocol's order: a hull begun with no query since the last begin, a hull's sample between its query and
/// its begin.
pub const REFUSED_OUT_OF_ORDER: u32 = 2;
/// The call names another hull than the one queried.
pub const REFUSED_MISMATCH: u32 = 3;
/// A lattice corner or split written again with another value (each is written once).
pub const REFUSED_CONFLICT: u32 = 4;
/// An index off the lattice, or a buffer of the wrong length.
pub const REFUSED_OUT_OF_RANGE: u32 = 5;
/// A grid handle this instance never made, or freed.
pub const REFUSED_BAD_HANDLE: u32 = 6;
/// The grid carries the loaded records (the hulls' support and the clearance walks read it).
pub const REFUSED_IN_USE: u32 = 7;
/// A fold's split decided before its four corners are known.
pub const REFUSED_CORNERS_MISSING: u32 = 8;
/// A clearance walk superseded by a later `clearance_begin`.
pub const REFUSED_STALE_WALK: u32 = 9;
/// What a call that answers a count returns when it is refused.
pub const REFUSED_COUNT: u32 = u32::MAX;
/// What a clearance walk's next returns when its walk was superseded (−1 is the walk's end).
pub const WALK_STALE: i32 = -2;

fn lattice_refusal(refusal: LatticeRefusal) -> u32 {
    match refusal {
        LatticeRefusal::OutOfRange => REFUSED_OUT_OF_RANGE,
        LatticeRefusal::Conflict => REFUSED_CONFLICT,
        LatticeRefusal::CornersMissing => REFUSED_CORNERS_MISSING,
    }
}

/// What the last `contact_sample` or `contact_cell_flipped` lacked (`contact_status`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
enum ContactStatus {
    Answered = 0,
    OffSquare = 1,
    /// A corner of the cell `contact_missing_*` name.
    MissingVertex = 2,
    /// The split of the fold cell `contact_missing_*` name.
    MissingFlip = 3,
}

/// The bots' clearance walk: the candidates `clearance_begin` gathered, the position in them, the last lane's entry and
/// the walk's id (one walk at a time; a later begin supersedes it, and the superseded walk's calls are refused).
struct ClearanceWalk {
    id: u32,
    candidates: Vec<u32>,
    cursor: usize,
    entry: f64,
}

/// Where a hull's support stands in its protocol: `support_query` gathers the candidates, the host writes their flags,
/// `support_begin` begins the hull over them, and the samples read it.
#[derive(Clone, Copy, Debug, PartialEq)]
enum SupportPhase {
    /// No records: `records_load` first.
    Unloaded,
    /// Records loaded and no hull queried since: the samples read no candidates (the TypeScript field before `beginHull`).
    Loaded,
    /// `support_query` gathered the candidates about (x, z) (their bits): the flags, then `support_begin`.
    Queried { x: u64, z: u64 },
    /// `support_begin` ran over the queried candidates: the samples read this hull.
    Begun,
}

struct State {
    lattice: ContactLattice,
    status: ContactStatus,
    missing: (u32, u32),
    /// By handle; a freed grid's slot is empty and its handle never made again.
    grids: Vec<Option<(ObstacleGrid, Vec<u32>)>>,
    scratch: Vec<u8>,
    overlay: TerrainDeformation,
    records: Vec<Record>,
    /// Per record: bit 0 crushed, bit 1 dead (the host writes a hull's candidates' between its query and its begin).
    record_flags: Vec<u8>,
    /// Per record: a bridge deck (the bots' clearance scans pass over it).
    bridges: Vec<bool>,
    walk: ClearanceWalk,
    support_grid: Option<usize>,
    support: SupportField,
    support_phase: SupportPhase,
    /// The last refusal's code (`protocol_refusal`).
    refusal: u32,
}

impl State {
    fn new() -> State {
        State {
            lattice: ContactLattice::new(),
            status: ContactStatus::Answered,
            missing: (0, 0),
            grids: Vec::new(),
            scratch: Vec::new(),
            overlay: TerrainDeformation::new(),
            records: Vec::new(),
            record_flags: Vec::new(),
            bridges: Vec::new(),
            walk: ClearanceWalk { id: 0, candidates: Vec::new(), cursor: 0, entry: f64::NAN },
            support_grid: None,
            support: SupportField::new(),
            support_phase: SupportPhase::Unloaded,
            refusal: ACCEPTED,
        }
    }

    /// Note a refusal and return its code.
    fn refuse(&mut self, code: u32) -> u32 {
        self.refusal = code;
        code
    }

    /// Note a refusal of a call that answers a count, and return [`REFUSED_COUNT`].
    fn refuse_count(&mut self, code: u32) -> u32 {
        self.refusal = code;
        REFUSED_COUNT
    }

    // ---- the contact lattice

    fn note_missing(&mut self, missing: Sample) {
        match missing {
            Sample::MissingVertex(ix, iz) => {
                self.status = ContactStatus::MissingVertex;
                self.missing = (ix as u32, iz as u32);
            }
            Sample::MissingFlip(ix, iz) => {
                self.status = ContactStatus::MissingFlip;
                self.missing = (ix as u32, iz as u32);
            }
            Sample::OffSquare => self.status = ContactStatus::OffSquare,
            Sample::Height(_) => self.status = ContactStatus::Answered,
        }
    }

    fn contact_sample(&mut self, x: f64, z: f64) -> f64 {
        let sample = self.lattice.sample(x, z);
        self.note_missing(sample);
        match sample {
            Sample::Height(h) => h,
            _ => f64::NAN,
        }
    }

    fn contact_cell_flipped(&mut self, x: f64, z: f64) -> u32 {
        match self.lattice.cell_flipped_at(x, z) {
            Ok(flipped) => {
                // (2026-11-02 audit S2) the status is this call's, as `contact_sample` leaves its own
                self.status = ContactStatus::Answered;
                flipped as u32
            }
            Err(missing) => {
                self.note_missing(missing);
                self.status as u32
            }
        }
    }

    fn lattice_set_vertex(&mut self, ix: u32, iz: u32, height: f64) -> u32 {
        match self.lattice.set_vertex(ix as usize, iz as usize, height) {
            Ok(()) => ACCEPTED,
            Err(refusal) => self.refuse(lattice_refusal(refusal)),
        }
    }

    /// Every corner at once (N × N Float32 heights, row-major in z); refused whole when one would change a known corner.
    fn lattice_fill(&mut self, heights: &[f32]) -> u32 {
        use cot_sim::contact::N;
        if heights.len() != N * N {
            return self.refuse(REFUSED_OUT_OF_RANGE);
        }
        for iz in 0..N {
            for ix in 0..N {
                let h = heights[iz * N + ix];
                if self.lattice.vertex_ready(ix, iz) && self.lattice.vertex_height(ix, iz).to_bits() != h.to_bits() {
                    return self.refuse(REFUSED_CONFLICT);
                }
            }
        }
        for iz in 0..N {
            for ix in 0..N {
                // (checked above: no corner it writes is known otherwise)
                let _ = self.lattice.set_vertex(ix, iz, heights[iz * N + ix] as f64);
            }
        }
        ACCEPTED
    }

    fn lattice_set_flip_from_centre(&mut self, ix: u32, iz: u32, centre: f64) -> u32 {
        match self.lattice.set_flip_from_centre(ix as usize, iz as usize, centre) {
            Ok(()) => ACCEPTED,
            Err(refusal) => self.refuse(lattice_refusal(refusal)),
        }
    }

    // ---- the obstacle grids

    fn grid(&mut self, handle: u32) -> Option<&mut (ObstacleGrid, Vec<u32>)> {
        self.grids.get_mut(handle as usize).and_then(Option::as_mut)
    }

    fn grid_new(&mut self, boxes: Vec<PlanBox>, cell_size: f64) -> u32 {
        let n = boxes.len();
        self.grids.push(Some((ObstacleGrid::new(boxes, cell_size), Vec::with_capacity(n))));
        (self.grids.len() - 1) as u32
    }

    fn grid_query(&mut self, handle: u32, min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> u32 {
        let Some((grid, out)) = self.grid(handle) else { return self.refuse_count(REFUSED_BAD_HANDLE) };
        grid.query(min_x, min_z, max_x, max_z, out);
        out.len() as u32
    }

    fn grid_free(&mut self, handle: u32) -> u32 {
        if self.grid(handle).is_none() {
            return self.refuse(REFUSED_BAD_HANDLE);
        }
        if self.support_grid == Some(handle as usize) {
            return self.refuse(REFUSED_IN_USE);
        }
        self.grids[handle as usize] = None;
        ACCEPTED
    }

    // ---- the records and a hull's support

    fn records_load(&mut self, records: Vec<Record>, bridges: Vec<bool>, grid: u32) -> u32 {
        if self.grid(grid).is_none() {
            return self.refuse_count(REFUSED_BAD_HANDLE);
        }
        self.record_flags = vec![0; records.len()];
        self.bridges = bridges;
        self.records = records;
        self.support_grid = Some(grid as usize);
        // a new table: no hull begun over it yet, and a walk over the last one is over
        self.support = SupportField::new();
        self.support_phase = SupportPhase::Loaded;
        self.close_walk();
        self.records.len() as u32
    }

    fn support_query(&mut self, x: f64, z: f64) -> u32 {
        let Some(at) = self.support_grid.filter(|_| self.support_phase != SupportPhase::Unloaded) else {
            return self.refuse_count(REFUSED_NOT_LOADED);
        };
        let Some((grid, _)) = self.grids[at].as_mut() else { return self.refuse_count(REFUSED_BAD_HANDLE) };
        let count = self.support.query(grid, x, z) as u32;
        self.support_phase = SupportPhase::Queried { x: x.to_bits(), z: z.to_bits() };
        count
    }

    fn support_begin(&mut self, x: f64, z: f64, belly_y: f64, pose: Option<&HullFootprint>) -> u32 {
        match self.support_phase {
            SupportPhase::Unloaded => return self.refuse(REFUSED_NOT_LOADED),
            SupportPhase::Loaded | SupportPhase::Begun => return self.refuse(REFUSED_OUT_OF_ORDER),
            SupportPhase::Queried { x: qx, z: qz } if qx != x.to_bits() || qz != z.to_bits() => return self.refuse(REFUSED_MISMATCH),
            SupportPhase::Queried { .. } => {}
        }
        for &c in self.support.candidates() {
            let flags = self.record_flags[c as usize];
            let record = &mut self.records[c as usize];
            record.crushed = flags & 1 != 0;
            record.dead = flags & 2 != 0;
        }
        self.support.begin_queried(&self.records, x, z, belly_y, pose);
        self.support_phase = SupportPhase::Begun;
        ACCEPTED
    }

    /// Whether a sample may read the hull: refused between a query and its begin, where the candidates are the next
    /// hull's and their tops not yet gathered.
    fn support_readable(&mut self) -> bool {
        if matches!(self.support_phase, SupportPhase::Queried { .. }) {
            self.refuse(REFUSED_OUT_OF_ORDER);
            return false;
        }
        true
    }

    fn support_contact(&mut self, x: f64, z: f64) -> f64 {
        if !self.support_readable() {
            return f64::NAN;
        }
        let ground = deformed_contact(self, x, z);
        self.support.sample(&self.records, x, z, ground)
    }

    fn support_top(&mut self, x: f64, z: f64, ground: f64) -> f64 {
        if !self.support_readable() {
            return f64::NAN;
        }
        self.support.sample(&self.records, x, z, ground)
    }

    fn support_standing(&mut self) -> u32 {
        if !self.support_readable() {
            return REFUSED_COUNT;
        }
        self.support.standing_deck() as u32
    }

    // ---- the bots' clearance walks

    /// End the walk: its id moves on, so a call that names it is refused.
    fn close_walk(&mut self) {
        self.walk.id = self.walk.id.wrapping_add(1).max(1);
        self.walk.candidates.clear();
        self.walk.cursor = 0;
        self.walk.entry = f64::NAN;
    }

    fn clearance_begin(&mut self, min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> u32 {
        let Some(at) = self.support_grid else {
            self.refuse(REFUSED_NOT_LOADED);
            return 0;
        };
        self.close_walk();
        let State { grids, walk, .. } = self;
        let Some((grid, out)) = grids[at].as_mut() else { return 0 };
        grid.query(min_x, min_z, max_x, max_z, out);
        walk.candidates.extend_from_slice(out);
        walk.id
    }

    /// Whether `walk` names the open walk (else the call is refused).
    fn walk_open(&mut self, walk: u32) -> bool {
        if walk != 0 && walk == self.walk.id {
            return true;
        }
        self.refuse(REFUSED_STALE_WALK);
        false
    }

    fn clearance_point_next(&mut self, walk: u32, x: f64, z: f64, margin: f64, skip: u32) -> i32 {
        if !self.walk_open(walk) {
            return WALK_STALE;
        }
        let State { records, bridges, walk, .. } = self;
        while let Some(&index) = walk.candidates.get(walk.cursor) {
            walk.cursor += 1;
            let i = index as usize;
            if !clearance_skips(records, bridges, i, skip) && clearance::contains_point(&records[i], x, z, margin) {
                return index as i32;
            }
        }
        -1
    }

    #[allow(clippy::too_many_arguments)]
    fn clearance_lane_next(&mut self, walk: u32, sx: f64, sz: f64, dx: f64, dz: f64, reach: f64, margin: f64, skip: u32) -> i32 {
        if !self.walk_open(walk) {
            return WALK_STALE;
        }
        let State { records, bridges, walk, .. } = self;
        while let Some(&index) = walk.candidates.get(walk.cursor) {
            walk.cursor += 1;
            let i = index as usize;
            if clearance_skips(records, bridges, i, skip) {
                continue;
            }
            if let Some(entry) = clearance::ray_entry(&records[i], sx, sz, dx, dz, reach, margin) {
                walk.entry = entry;
                return index as i32;
            }
        }
        -1
    }

    fn clearance_entry(&mut self, walk: u32) -> f64 {
        if !self.walk_open(walk) {
            return f64::NAN;
        }
        self.walk.entry
    }
}

static mut STATE: Option<State> = None;

fn state() -> &'static mut State {
    // SAFETY: a WebAssembly instance runs on one thread and no export re-enters another while it holds this borrow.
    unsafe { (*core::ptr::addr_of_mut!(STATE)).get_or_insert_with(State::new) }
}

/// The last refused call's code (`REFUSED_*`; 0 while none was refused).
#[unsafe(no_mangle)]
pub extern "C" fn protocol_refusal() -> u32 {
    state().refusal
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

/// Supply corner (ix, iz)'s height. Each corner is written once: the same Float32 again is taken, another refused
/// (`REFUSED_CONFLICT`), as an index off the lattice is (`REFUSED_OUT_OF_RANGE`).
#[unsafe(no_mangle)]
pub extern "C" fn lattice_set_vertex(ix: u32, iz: u32, height: f64) -> u32 {
    state().lattice_set_vertex(ix, iz, height)
}

/// Supply every corner from `n` Float32 heights at `heights` (N × N, row-major in z; a fixture's lattice): refused whole
/// when `n` is not N × N or a height would change a corner already known. (The lattice is no raw buffer the host writes:
/// a corner and a split are each written once, which the answers and the last-cell cache rely on.)
#[unsafe(no_mangle)]
pub extern "C" fn lattice_fill(heights: *const f32, n: usize) -> u32 {
    // SAFETY: the host passes n floats inside this instance's memory.
    let heights = unsafe { core::slice::from_raw_parts(heights, n) };
    state().lattice_fill(heights)
}

/// The exact world coordinate of lattice vertex `i` (where the host evaluates its height function).
#[unsafe(no_mangle)]
pub extern "C" fn lattice_vertex_coordinate(i: u32) -> f64 {
    state().lattice.vertex_coordinate(i as usize)
}

/// Decide fold cell (ix, iz)'s split from the height function's value at its centre, once its corners are known
/// (`REFUSED_CORNERS_MISSING` before); written once, as the corners are.
#[unsafe(no_mangle)]
pub extern "C" fn lattice_set_flip_from_centre(ix: u32, iz: u32, centre: f64) -> u32 {
    state().lattice_set_flip_from_centre(ix, iz, centre)
}

/// The contact height at (x, z), or NaN with `contact_status` saying what is missing.
#[unsafe(no_mangle)]
pub extern "C" fn contact_sample(x: f64, z: f64) -> f64 {
    state().contact_sample(x, z)
}

/// `cellFlippedAt` at (x, z): 1 for the a–d split, 0 for b–c (and off the square), or 2 / 3 when a corner / the split
/// is missing (`contact_missing_*` name the cell; the host supplies it and asks again). `contact_status` is this call's.
#[unsafe(no_mangle)]
pub extern "C" fn contact_cell_flipped(x: f64, z: f64) -> u32 {
    state().contact_cell_flipped(x, z)
}

/// What the last `contact_sample` or `contact_cell_flipped` (or the batch's stop) lacked: 0 answered, 1 off the
/// square, 2 a corner, 3 a fold's split.
#[unsafe(no_mangle)]
pub extern "C" fn contact_status() -> u32 {
    state().status as u32
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
        if h.is_nan() && matches!(state().status, ContactStatus::MissingVertex | ContactStatus::MissingFlip) {
            return i;
        }
        out[i] = h;
    }
    n
}

/// Build an obstacle grid over `n` plan boxes packed as minX, minZ, maxX, maxZ; returns its handle (this instance's
/// own: a handle names a grid of the instance that made it, until `grid_free`).
#[unsafe(no_mangle)]
pub extern "C" fn grid_new(boxes: *const f64, n: usize, cell_size: f64) -> u32 {
    // SAFETY: the host passes 4n doubles inside this instance's memory.
    let raw = unsafe { core::slice::from_raw_parts(boxes, 4 * n) };
    let boxes = raw.chunks_exact(4).map(|b| PlanBox { min_x: b[0], min_z: b[1], max_x: b[2], max_z: b[3] }).collect();
    state().grid_new(boxes, cell_size)
}

/// Query grid `handle`; returns how many record indices it wrote at `grid_out_ptr(handle)` (`REFUSED_COUNT` for a
/// handle this instance never made, or freed).
#[unsafe(no_mangle)]
pub extern "C" fn grid_query(handle: u32, min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> u32 {
    state().grid_query(handle, min_x, min_z, max_x, max_z)
}

/// Where grid `handle`'s last answer lies (stable: the buffer holds every record's index at most once); null for a
/// handle this instance never made, or freed.
#[unsafe(no_mangle)]
pub extern "C" fn grid_out_ptr(handle: u32) -> *const u32 {
    match state().grid(handle) {
        Some((_, out)) => out.as_ptr(),
        None => core::ptr::null(),
    }
}

/// Free grid `handle` (its handle is never made again); the grid the records were loaded over stays while they do
/// (`REFUSED_IN_USE`). A world's grids live as long as its instance: the hosts build theirs once, with the world.
#[unsafe(no_mangle)]
pub extern "C" fn grid_free(handle: u32) -> u32 {
    state().grid_free(handle)
}

/// Run `n` queries packed as minX, minZ, maxX, maxZ against grid `handle`: each answer's count at `counts[i]` and the
/// indices concatenated at `indices` (room for `capacity`). Returns the total written, or u32::MAX when it would overflow
/// (or the handle is not this instance's: `protocol_refusal` then says `REFUSED_BAD_HANDLE`).
#[unsafe(no_mangle)]
pub extern "C" fn grid_query_batch(handle: u32, boxes: *const f64, n: usize, counts: *mut u32, indices: *mut u32, capacity: usize) -> u32 {
    // SAFETY: the host passes 4n doubles, n counts and `capacity` indices inside this instance's memory.
    let (boxes, counts, indices) = unsafe {
        (core::slice::from_raw_parts(boxes, 4 * n), core::slice::from_raw_parts_mut(counts, n), core::slice::from_raw_parts_mut(indices, capacity))
    };
    let s = state();
    let Some((grid, out)) = s.grid(handle) else { return s.refuse_count(REFUSED_BAD_HANDLE) };
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
                    // (an unknown corner: the write is taken)
                    let _ = lattice.set_vertex(vx, vz, h);
                }
            }
        }
        Sample::MissingFlip(ix, iz) => {
            let (cx, cz) = lattice.cell_centre(ix, iz);
            // (a split asked for: its corners are known and it is undecided, so the write is taken)
            let _ = lattice.set_flip_from_centre(ix, iz, height(cx, cz));
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

/// `reset`: every stamp gone and the clock unset.
#[unsafe(no_mangle)]
pub extern "C" fn overlay_reset() {
    state().overlay.reset();
}

/// `setTime` (a time that is not finite unsets the clock).
#[unsafe(no_mangle)]
pub extern "C" fn overlay_set_time(time_s: f64) {
    state().overlay.set_time(time_s);
}

/// The overlay's revision (a mirror check: it moves with the TypeScript's).
#[unsafe(no_mangle)]
pub extern "C" fn overlay_revision() -> u32 {
    state().overlay.revision()
}

/// The overlay's clock (`clockS`): NaN while unset (a fresh or reset overlay), else the time `overlay_set_time` gave it.
#[unsafe(no_mangle)]
pub extern "C" fn overlay_time() -> f64 {
    state().overlay.time()
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
/// crushable, 2 a wreck, 4 a bridge deck), shape (0 none, 1 one part, 2 a compound and its part count), then its parts.
/// Returns the count (`REFUSED_COUNT` for a grid this instance never made, or freed). A load begins the support's and
/// the clearance walks' protocols over the new table: no hull begun, no walk open.
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
    state().records_load(records, bridges, grid)
}

/// The records' flags (bit 0 crushed, bit 1 dead), one byte each: the host writes a hull's candidates' between its
/// `support_query` and its `support_begin`.
#[unsafe(no_mangle)]
pub extern "C" fn record_flags_ptr() -> *mut u8 {
    state().record_flags.as_mut_ptr()
}

/// `beginHull`'s query: the candidates about (x, z); returns their count (their indices at `support_candidates_ptr`),
/// or `REFUSED_COUNT` before `records_load`. The hull's samples wait for its `support_begin`.
#[unsafe(no_mangle)]
pub extern "C" fn support_query(x: f64, z: f64) -> u32 {
    state().support_query(x, z)
}

/// The candidates of the last `support_query`.
#[unsafe(no_mangle)]
pub extern "C" fn support_candidates_ptr() -> *const u32 {
    state().support.candidates().as_ptr()
}

/// `beginHull` over the candidates the last `support_query` gathered at the same (x, z), their flags read from
/// `record_flags` (`posed` 0: no pose). Returns `ACCEPTED`, or the refusal: `REFUSED_NOT_LOADED`, `REFUSED_OUT_OF_ORDER`
/// (no query since the last begin), `REFUSED_MISMATCH` (queried at another point).
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn support_begin(
    x: f64, z: f64, belly_y: f64, posed: u32, center_x: f64, center_z: f64, forward_x: f64, forward_z: f64, right_x: f64,
    right_z: f64, half_length: f64, half_width: f64, center_rise: f64, rise_along: f64, rise_across: f64, front_lift: f64,
    rear_lift: f64,
) -> u32 {
    let pose = HullFootprint { center_x, center_z, forward_x, forward_z, right_x, right_z, half_length, half_width, center_rise, rise_along, rise_across, front_lift, rear_lift };
    state().support_begin(x, z, belly_y, if posed != 0 { Some(&pose) } else { None })
}

/// The support at (x, z): the tops over the deformed contact surface (the field's getContactHeightAt). NaN between a
/// query and its begin (the hull is not begun).
#[unsafe(no_mangle)]
pub extern "C" fn support_contact(x: f64, z: f64) -> f64 {
    state().support_contact(x, z)
}

/// The deformed contact surface alone (the field's getTerrainContactHeightAt).
#[unsafe(no_mangle)]
pub extern "C" fn terrain_contact(x: f64, z: f64) -> f64 {
    deformed_contact(state(), x, z)
}

/// The tops over a ground the host computed (the field's getHeightAt and getHeightAtFast); NaN between a query and its
/// begin.
#[unsafe(no_mangle)]
pub extern "C" fn support_top(x: f64, z: f64, ground: f64) -> f64 {
    state().support_top(x, z, ground)
}

/// Reads so far a primitive's top answered over the ground.
#[unsafe(no_mangle)]
pub extern "C" fn support_record_reads() -> u32 {
    state().support.record_reads
}

/// Whether the current hull stands on a roof's deck (`REFUSED_COUNT` between a query and its begin).
#[unsafe(no_mangle)]
pub extern "C" fn support_standing() -> u32 {
    state().support_standing()
}

// ------------------------------------------------------- the bots' clearance scans ----

/// What a clearance scan passes over: bit 0 a crushable, bit 1 a bridge deck (collision.ts CLEARANCE_SKIP_*).
fn clearance_skips(records: &[Record], bridges: &[bool], index: usize, skip: u32) -> bool {
    (skip & 1 != 0 && records[index].crushable) || (skip & 2 != 0 && bridges[index])
}

/// Begin a clearance walk over the support grid's records in the box [min_x, max_x] × [min_z, max_z], in the grid's
/// order; returns the walk's id (never 0), which its `clearance_*_next` and `clearance_entry` calls name, or 0 before
/// `records_load`. One walk at a time: a walk begun inside another (a nested scan) supersedes it, and the outer walk's
/// calls are refused (`WALK_STALE`) instead of reading the inner one's place.
#[unsafe(no_mangle)]
pub extern "C" fn clearance_begin(min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> u32 {
    state().clearance_begin(min_x, min_z, max_x, max_z)
}

/// Walk `walk`'s next record that `skip` keeps and whose clearance (the footprint grown by `margin`, clearance.rs
/// contains_point) holds (x, z), -1 at the walk's end, or `WALK_STALE`. Crushed and dead records are kept: their state is
/// the host's, and the host's loop stops where it always did.
#[unsafe(no_mangle)]
pub extern "C" fn clearance_point_next(walk: u32, x: f64, z: f64, margin: f64, skip: u32) -> i32 {
    state().clearance_point_next(walk, x, z, margin, skip)
}

/// Walk `walk`'s next record that `skip` keeps and that the lane from (sx, sz) along (dx, dz) enters within `reach`
/// (clearance.rs ray_entry, the footprint grown by `margin`), -1 at the walk's end, or `WALK_STALE`; its entry at
/// `clearance_entry`.
#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn clearance_lane_next(walk: u32, sx: f64, sz: f64, dx: f64, dz: f64, reach: f64, margin: f64, skip: u32) -> i32 {
    state().clearance_lane_next(walk, sx, sz, dx, dz, reach, margin, skip)
}

/// The entry of the record walk `walk`'s `clearance_lane_next` returned last (NaN for a superseded walk).
#[unsafe(no_mangle)]
pub extern "C" fn clearance_entry(walk: u32) -> f64 {
    state().clearance_entry(walk)
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
/// world's own support and terrain samplers (reachableTrackGroundAt's wall rules included). Returns `ACCEPTED`, or
/// `REFUSED_OUT_OF_ORDER` between a query and its begin (nothing sampled).
#[unsafe(no_mangle)]
pub extern "C" fn support_sample_hull() -> u32 {
    if !state().support_readable() {
        return REFUSED_OUT_OF_ORDER;
    }
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
    ACCEPTED
}

#[cfg(test)]
mod tests {
    //! The cross-call protocols (2026-11-02 audit S2), each on an instance's own state: a call out of order or naming a
    //! stale walk, hull or handle is refused with its code, and the state it would have read stays whole.
    use super::*;
    use cot_sim::records::Part;

    /// The map's height function a native test links in place of the host's import.
    #[unsafe(no_mangle)]
    extern "C" fn terrain_height(x: f64, z: f64) -> f64 {
        0.01 * x - 0.02 * z
    }

    /// Three boxes 2 m tall over a 24 m grid, their table loaded beside it (a fourth, crushable, at the origin).
    fn loaded() -> (State, u32) {
        let mut s = State::new();
        let boxes = [(10.0, 10.0), (14.0, 10.0), (40.0, 40.0), (0.0, 0.0)];
        let grid = s.grid_new(boxes.iter().map(|&(x, z)| PlanBox { min_x: x - 1.5, min_z: z - 1.5, max_x: x + 1.5, max_z: z + 1.5 }).collect(), 24.0);
        let records = boxes
            .iter()
            .enumerate()
            .map(|(i, &(x, z))| Record::new([x - 1.5, 0.0, z - 1.5], [x + 1.5, 2.0, z + 1.5], Shape::Simple(Part::obb(x, z, 1.5, 1.5, 0.0, None)), i == 3, false))
            .collect();
        assert_eq!(s.records_load(records, vec![false; 4], grid), 4);
        (s, grid)
    }

    #[test]
    fn the_contact_status_is_the_last_calls() {
        let mut s = State::new();
        assert!(s.contact_sample(1.0, 1.0).is_nan());
        assert_eq!(s.status, ContactStatus::MissingVertex);
        contact_filled(&mut s.lattice, 1.0, 1.0);
        assert!(s.contact_sample(1.0, 1.0).is_finite());
        assert_eq!(s.status, ContactStatus::Answered);
        // a split asked where a corner is missing: the status says so, not the last sample's answer
        assert_eq!(s.contact_cell_flipped(200.0, -150.0), ContactStatus::MissingVertex as u32);
        assert_eq!(s.status, ContactStatus::MissingVertex, "contact_status names this call's lack");
        assert_eq!(s.contact_cell_flipped(1.0, 1.0), 0);
        assert_eq!(s.status, ContactStatus::Answered);
        assert!(s.contact_sample(700.0, 0.0).is_nan());
        assert_eq!(s.status, ContactStatus::OffSquare);
    }

    #[test]
    fn the_lattice_is_written_once() {
        use cot_sim::contact::N;
        let mut s = State::new();
        let mut heights = vec![0.0f32; N * N];
        for (i, h) in heights.iter_mut().enumerate() {
            *h = (i % 97) as f32 * 0.125;
        }
        assert_eq!(s.lattice_set_flip_from_centre(5, 5, 1.0), REFUSED_CORNERS_MISSING, "a split waits for its corners");
        assert_eq!(s.lattice_fill(&heights[..10]), REFUSED_OUT_OF_RANGE, "a fill is the whole lattice");
        assert_eq!(s.lattice_fill(&heights), ACCEPTED);
        assert_eq!(s.lattice_fill(&heights), ACCEPTED, "the same heights again change nothing");
        let answer = s.contact_sample(3.3, -7.1);
        let mut other = heights.clone();
        other[N * 300 + 200] += 1.0;
        assert_eq!(s.lattice_fill(&other), REFUSED_CONFLICT, "a fill that would move a known corner is refused whole");
        assert_eq!(s.refusal, REFUSED_CONFLICT);
        assert_eq!(s.lattice_set_vertex(200, 300, 99.0), REFUSED_CONFLICT);
        assert_eq!(s.lattice_set_vertex(N as u32, 0, 1.0), REFUSED_OUT_OF_RANGE);
        assert_eq!(s.lattice.vertex_height(200, 300), heights[N * 300 + 200], "the corner stands");
        assert_eq!(s.contact_sample(3.3, -7.1).to_bits(), answer.to_bits(), "and the answers with it");
    }

    #[test]
    fn a_nested_clearance_walk_supersedes_the_outer_one() {
        let mut s = State::new();
        assert_eq!(s.clearance_begin(0.0, 0.0, 1.0, 1.0), 0, "no walk before records_load");
        assert_eq!(s.refusal, REFUSED_NOT_LOADED);
        assert_eq!(s.clearance_point_next(0, 0.0, 0.0, 1.0, 0), WALK_STALE);
        let (mut s, _) = loaded();
        let outer = s.clearance_begin(0.0, 0.0, 20.0, 20.0);
        assert_ne!(outer, 0);
        assert_eq!(s.clearance_lane_next(outer, 5.0, 10.0, 1.0, 0.0, 30.0, 0.5, 1), 0, "the lane meets the first box");
        let entry = s.clearance_entry(outer);
        assert!(entry > 0.0);
        // a point check inside the lane loop begins a walk of its own
        let inner = s.clearance_begin(39.0, 39.0, 41.0, 41.0);
        assert_ne!(inner, outer);
        assert_eq!(s.clearance_point_next(inner, 40.0, 40.0, 0.5, 0), 2);
        assert_eq!(s.clearance_lane_next(outer, 5.0, 10.0, 1.0, 0.0, 30.0, 0.5, 1), WALK_STALE, "the outer walk never reads the inner one's place");
        assert_eq!(s.refusal, REFUSED_STALE_WALK);
        assert!(s.clearance_entry(outer).is_nan());
        assert_eq!(s.clearance_point_next(inner, 40.0, 40.0, 0.5, 0), -1, "the inner walk runs to its end");
        // the outer walk begun again walks from the start, the crushable at the origin skipped as asked
        let again = s.clearance_begin(0.0, 0.0, 20.0, 20.0);
        assert_eq!(s.clearance_lane_next(again, 5.0, 10.0, 1.0, 0.0, 30.0, 0.5, 1), 0);
        assert_eq!(s.clearance_entry(again).to_bits(), entry.to_bits());
        assert_eq!(s.clearance_lane_next(again, 5.0, 10.0, 1.0, 0.0, 30.0, 0.5, 1), 1);
        assert_eq!(s.clearance_lane_next(again, 5.0, 10.0, 1.0, 0.0, 30.0, 0.5, 1), -1);
        // a new table ends the walk over the last one
        let grid = s.support_grid.unwrap() as u32;
        let walk = s.clearance_begin(0.0, 0.0, 20.0, 20.0);
        let records = s.records.clone();
        s.records_load(records, vec![false; 4], grid);
        assert_eq!(s.clearance_point_next(walk, 10.0, 10.0, 0.5, 0), WALK_STALE);
    }

    #[test]
    fn a_hull_is_queried_then_begun_then_sampled() {
        let mut s = State::new();
        assert_eq!(s.support_query(10.0, 10.0), REFUSED_COUNT, "no query before records_load (once a trap)");
        assert_eq!(s.refusal, REFUSED_NOT_LOADED);
        assert_eq!(s.support_begin(10.0, 10.0, 2.3, None), REFUSED_NOT_LOADED);
        let (mut s, _) = loaded();
        assert_eq!(s.support_top(10.0, 10.0, 0.5), 0.5, "no hull begun: the samples read no candidates");
        assert_eq!(s.support_begin(10.0, 10.0, 2.3, None), REFUSED_OUT_OF_ORDER, "a hull is queried before it begins");
        assert_eq!(s.support_query(10.0, 10.0), 2);
        assert!(s.support_top(10.0, 10.0, 0.5).is_nan(), "between its query and its begin a hull reads nothing");
        assert_eq!(s.support_standing(), REFUSED_COUNT);
        assert_eq!(s.refusal, REFUSED_OUT_OF_ORDER);
        assert_eq!(s.support_begin(10.5, 10.0, 2.3, None), REFUSED_MISMATCH, "the hull begun is the hull queried");
        assert_eq!(s.support_begin(10.0, 10.0, 2.3, None), ACCEPTED);
        assert_eq!(s.support_top(10.0, 10.0, 0.5), 2.0, "the box's top under the hull");
        assert_eq!(s.support_begin(10.0, 10.0, 2.3, None), REFUSED_OUT_OF_ORDER, "a second begin needs its own query");
        // the flags written between the query and the begin are the ones it reads
        assert_eq!(s.support_query(10.0, 10.0), 2);
        s.record_flags[0] = 1;
        assert_eq!(s.support_begin(10.0, 10.0, 2.3, None), ACCEPTED);
        assert_eq!(s.support_top(10.0, 10.0, 0.5), 0.5, "a crushed box carries nothing");
        assert_eq!(s.support_query(40.0, 40.0), 1);
        assert_eq!(s.support_begin(40.0, 40.0, 2.3, None), ACCEPTED);
        assert_eq!(s.support_top(40.0, 40.0, 0.5), 2.0);
        assert!(s.support_contact(40.0, 40.0).is_finite());
    }

    #[test]
    fn a_grid_handle_names_a_grid_of_this_instance() {
        let (mut s, support_grid) = loaded();
        let other = s.grid_new(vec![PlanBox { min_x: 0.0, min_z: 0.0, max_x: 1.0, max_z: 1.0 }], 24.0);
        assert_eq!(s.grid_query(other, -1.0, -1.0, 2.0, 2.0), 1);
        assert_eq!(s.grid_query(77, -1.0, -1.0, 2.0, 2.0), REFUSED_COUNT, "a handle never made (once a trap)");
        assert_eq!(s.refusal, REFUSED_BAD_HANDLE);
        assert_eq!(s.grid_free(support_grid), REFUSED_IN_USE, "the records' grid stays while they do");
        assert_eq!(s.grid_free(other), ACCEPTED);
        assert_eq!(s.grid_query(other, -1.0, -1.0, 2.0, 2.0), REFUSED_COUNT, "a freed grid answers nothing");
        assert_eq!(s.grid_free(other), REFUSED_BAD_HANDLE);
        let next = s.grid_new(vec![PlanBox { min_x: 0.0, min_z: 0.0, max_x: 1.0, max_z: 1.0 }], 24.0);
        assert_ne!(next, other, "a freed handle is never made again");
        assert_eq!(s.records_load(Vec::new(), Vec::new(), other), REFUSED_COUNT, "records over a freed grid are refused");
        assert_eq!(s.support_query(10.0, 10.0), 2, "and the loaded table stands");
    }
}
