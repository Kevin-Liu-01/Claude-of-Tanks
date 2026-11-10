//! The load-bearing terrain surface the hulls drive on — the port of
//! `src/world/terrainContactSurface.ts` (`createTerrainContactSampler`).
//!
//! The surface is the rendered near terrain: a 1024 m square of 768 × 768
//! cells whose corners are Float32 heights, each cell split along its b–c
//! diagonal unless it is a steep convex fold whose centre lies nearer the a–d
//! one (`terrainCellFlipped`). The TypeScript fills its corners lazily from
//! the map's height function; here the caller supplies them ([`ContactLattice::set_vertex`],
//! [`ContactLattice::set_flip`]) — eagerly from a fixture, or on demand when
//! [`ContactLattice::sample`] reports the cell it is missing.
//!
//! Every corner and every fold's split is written once (2026-11-02 audit S2): the answers and the last-cell cache rely
//! on a known corner and a decided split never changing, so the lattice refuses a write that would change one
//! ([`LatticeRefusal`]) instead of trusting its host to never make it.

/// The square's side, metres (`SIZE`).
pub const SIZE: f64 = 1024.0;
const HALF: f64 = SIZE / 2.0;
const CHUNK: f64 = 128.0;
const SEGMENTS: usize = 96;
/// Cells along one side (`CELLS`).
pub const CELLS: usize = 1024 / 128 * SEGMENTS;
/// Vertices along one side (`N`).
pub const N: usize = CELLS + 1;
const STEP: f64 = CHUNK / SEGMENTS as f64;

/// `TERRAIN_FLIP_STEEP_M`.
pub const FLIP_STEEP_M: f64 = 0.75;
/// `TERRAIN_FLIP_FOLD_M`.
pub const FLIP_FOLD_M: f64 = 1.0;
/// `TERRAIN_FLIP_PREFER_M`.
pub const FLIP_PREFER_M: f64 = 0.1;

/// `terrainCellFoldCandidate`: a steep convex fold, the only cells whose split the centre decides.
#[inline]
pub fn fold_candidate(a: f64, b: f64, c: f64, d: f64) -> bool {
    a + d - b - c > FLIP_FOLD_M
        && jsmath_max4((b - a).abs(), (c - a).abs(), (d - b).abs(), (d - c).abs()) > FLIP_STEEP_M
}

#[inline]
fn jsmath_max4(a: f64, b: f64, c: f64, d: f64) -> f64 {
    crate::jsmath::max(crate::jsmath::max(crate::jsmath::max(a, b), c), d)
}

/// `terrainCellFlipped`: a fold whose Float32 centre lies nearer the a–d midpoint by the preference.
#[inline]
pub fn cell_flipped(a: f64, b: f64, c: f64, d: f64, centre: f64) -> bool {
    fold_candidate(a, b, c, d) && (centre - (a + d) * 0.5).abs() + FLIP_PREFER_M < (centre - (b + c) * 0.5).abs()
}

/// `terrainCellHeight`: a cell's height at (u, v) on the split the rule picks.
#[inline]
pub fn cell_height(a: f64, b: f64, c: f64, d: f64, u: f64, v: f64, flipped: bool) -> f64 {
    if !flipped {
        return if u + v <= 1.0 { a + (b - a) * u + (c - a) * v } else { d + (c - d) * (1.0 - u) + (b - d) * (1.0 - v) };
    }
    if u >= v { a + (b - a) * u + (d - b) * v } else { a + (c - a) * v + (d - c) * u }
}

/// What [`ContactLattice::sample`] needs before it can answer.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Sample {
    /// The height.
    Height(f64),
    /// The point lies off the square: the TypeScript answers from the analytic height function.
    OffSquare,
    /// The cell (ix, iz) has a corner not yet supplied.
    MissingVertex(usize, usize),
    /// The cell (ix, iz) is a fold candidate whose split is not yet decided (its centre height is needed).
    MissingFlip(usize, usize),
}

/// Why the lattice refused a write: it would change what an answer already read, or it lacks what the write needs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LatticeRefusal {
    /// The corner or cell lies off the lattice.
    OutOfRange,
    /// The corner is known at another height, or the split is decided the other way.
    Conflict,
    /// A fold's split is decided from its four corners, and one is not yet known.
    CornersMissing,
}

/// The lattice: Float32 corner heights, which corners are known, and each fold cell's split.
pub struct ContactLattice {
    heights: Vec<f32>,
    ready: Vec<u8>,
    /// Per cell: 0 unknown, 1 b–c split, 2 a–d split. Only fold candidates are ever asked.
    flips: Vec<u8>,
    coordinates: [f32; N],
    exact: [f64; N],
    last: Option<(usize, usize, f64, f64, f64, f64, bool)>,
}

impl Default for ContactLattice {
    fn default() -> Self {
        Self::new()
    }
}

impl ContactLattice {
    /// An empty lattice (no corner known).
    pub fn new() -> Self {
        let mut exact = [0.0; N];
        let mut coordinates = [0.0f32; N];
        for i in 0..N {
            // buildChunkGeometrySteps' operation order at chunk boundaries
            let chunk = core::cmp::min(i / SEGMENTS, (SIZE / CHUNK) as usize - 1);
            exact[i] = -HALF + chunk as f64 * CHUNK + (i - chunk * SEGMENTS) as f64 * STEP;
            coordinates[i] = exact[i] as f32;
        }
        ContactLattice { heights: vec![0.0; N * N], ready: vec![0; (N * N).div_ceil(8)], flips: vec![0; CELLS * CELLS], coordinates, exact, last: None }
    }

    /// The exact world coordinate of vertex `i` along either axis (where the TypeScript evaluates the height function).
    #[inline]
    pub fn vertex_coordinate(&self, i: usize) -> f64 {
        self.exact[i]
    }

    /// The point a fold cell's split is decided on: its corner coordinate plus half a step, both axes.
    #[inline]
    pub fn cell_centre(&self, ix: usize, iz: usize) -> (f64, f64) {
        (self.exact[ix] + STEP * 0.5, self.exact[iz] + STEP * 0.5)
    }

    /// Supply corner (ix, iz)'s height (stored as Float32, as the TypeScript stores it). Write-once: the same Float32
    /// again is no change, another one is refused.
    #[inline]
    pub fn set_vertex(&mut self, ix: usize, iz: usize, height: f64) -> Result<(), LatticeRefusal> {
        if ix >= N || iz >= N {
            return Err(LatticeRefusal::OutOfRange);
        }
        let i = iz * N + ix;
        let value = height as f32;
        if self.vertex_ready(ix, iz) {
            return if self.heights[i].to_bits() == value.to_bits() { Ok(()) } else { Err(LatticeRefusal::Conflict) };
        }
        self.heights[i] = value;
        self.ready[i >> 3] |= 1 << (i & 7);
        Ok(())
    }

    /// Corner (ix, iz)'s Float32 height (0 while unknown).
    #[inline]
    pub fn vertex_height(&self, ix: usize, iz: usize) -> f32 {
        self.heights[iz * N + ix]
    }

    /// Whether corner (ix, iz) is known.
    #[inline]
    pub fn vertex_ready(&self, ix: usize, iz: usize) -> bool {
        let i = iz * N + ix;
        self.ready[i >> 3] & (1 << (i & 7)) != 0
    }

    /// Decide fold cell (ix, iz)'s split from its centre's height (Float32-rounded, as `Math.fround` rounds it), once
    /// its four corners are known (the split is theirs to decide). Write-once, as [`ContactLattice::set_flip`].
    pub fn set_flip_from_centre(&mut self, ix: usize, iz: usize, centre: f64) -> Result<(), LatticeRefusal> {
        if ix >= CELLS || iz >= CELLS {
            return Err(LatticeRefusal::OutOfRange);
        }
        if [(ix, iz), (ix + 1, iz), (ix, iz + 1), (ix + 1, iz + 1)].iter().any(|&(vx, vz)| !self.vertex_ready(vx, vz)) {
            return Err(LatticeRefusal::CornersMissing);
        }
        let (a, b, c, d) = self.corners(ix, iz);
        self.set_flip(ix, iz, cell_flipped(a, b, c, d, centre as f32 as f64))
    }

    /// Set fold cell (ix, iz)'s split directly (from a fixture that recorded it). Write-once: the same split again is no
    /// change, the other one is refused.
    #[inline]
    pub fn set_flip(&mut self, ix: usize, iz: usize, flipped: bool) -> Result<(), LatticeRefusal> {
        if ix >= CELLS || iz >= CELLS {
            return Err(LatticeRefusal::OutOfRange);
        }
        let state = if flipped { 2 } else { 1 };
        match self.flips[iz * CELLS + ix] {
            0 => {
                self.flips[iz * CELLS + ix] = state;
                Ok(())
            }
            known if known == state => Ok(()),
            _ => Err(LatticeRefusal::Conflict),
        }
    }

    #[inline]
    fn corners(&self, ix: usize, iz: usize) -> (f64, f64, f64, f64) {
        let h = |x: usize, z: usize| self.heights[z * N + x] as f64;
        (h(ix, iz), h(ix + 1, iz), h(ix, iz + 1), h(ix + 1, iz + 1))
    }

    #[inline]
    fn cell(&self, value: f64) -> usize {
        let raw = ((value + HALF) / STEP).floor();
        let mut i = crate::jsmath::max(0.0, crate::jsmath::min((CELLS - 1) as f64, raw)) as usize;
        // Float32 X/Z can round the nominal cell boundary in either direction.
        if i > 0 && value < self.coordinates[i] as f64 {
            i -= 1;
        } else if i < CELLS - 1 && value > self.coordinates[i + 1] as f64 {
            i += 1;
        }
        i
    }

    /// `cellFlippedAt`: whether the cell under (x, z) takes the a–d split (false off the square and for non-finite
    /// input); `Err` names what is missing to decide it.
    pub fn cell_flipped_at(&self, x: f64, z: f64) -> Result<bool, Sample> {
        if !x.is_finite() || !z.is_finite() || x < -HALF || x > HALF || z < -HALF || z > HALF {
            return Ok(false);
        }
        let (ix, iz) = (self.cell(x), self.cell(z));
        for (vx, vz) in [(ix, iz), (ix + 1, iz), (ix, iz + 1), (ix + 1, iz + 1)] {
            if !self.vertex_ready(vx, vz) {
                return Err(Sample::MissingVertex(ix, iz));
            }
        }
        let (a, b, c, d) = self.corners(ix, iz);
        if !fold_candidate(a, b, c, d) {
            return Ok(false);
        }
        match self.flips[iz * CELLS + ix] {
            0 => Err(Sample::MissingFlip(ix, iz)),
            state => Ok(state == 2),
        }
    }

    /// The height at (x, z), or what is missing to compute it. Mirrors the TypeScript `sample`, last-cell cache included
    /// (the cache never changes an answer: a known corner and a decided split never change).
    pub fn sample(&mut self, x: f64, z: f64) -> Sample {
        if !x.is_finite() || !z.is_finite() {
            return Sample::Height(0.0);
        }
        if x < -HALF || x > HALF || z < -HALF || z > HALF {
            return Sample::OffSquare;
        }
        let ix = self.cell(x);
        let iz = self.cell(z);
        let cx0 = self.coordinates[ix] as f64;
        let cz0 = self.coordinates[iz] as f64;
        let u = (x - cx0) / (self.coordinates[ix + 1] as f64 - cx0);
        let v = (z - cz0) / (self.coordinates[iz + 1] as f64 - cz0);
        let (a, b, c, d, flipped) = match self.last {
            Some((lx, lz, a, b, c, d, f)) if lx == ix && lz == iz => (a, b, c, d, f),
            _ => {
                for (vx, vz) in [(ix, iz), (ix + 1, iz), (ix, iz + 1), (ix + 1, iz + 1)] {
                    if !self.vertex_ready(vx, vz) {
                        return Sample::MissingVertex(ix, iz);
                    }
                }
                let (a, b, c, d) = self.corners(ix, iz);
                let flipped = if fold_candidate(a, b, c, d) {
                    match self.flips[iz * CELLS + ix] {
                        0 => return Sample::MissingFlip(ix, iz),
                        state => state == 2,
                    }
                } else {
                    false
                };
                self.last = Some((ix, iz, a, b, c, d, flipped));
                (a, b, c, d, flipped)
            }
        };
        Sample::Height(cell_height(a, b, c, d, u, v, flipped))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coordinates_follow_the_chunk_layout() {
        let lattice = ContactLattice::new();
        assert_eq!(lattice.vertex_coordinate(0), -512.0);
        assert_eq!(lattice.vertex_coordinate(96), -384.0);
        assert_eq!(lattice.vertex_coordinate(N - 1), 512.0);
    }

    #[test]
    fn a_flat_lattice_answers_its_height_and_reports_gaps() {
        let mut lattice = ContactLattice::new();
        assert!(matches!(lattice.sample(1.0, 1.0), Sample::MissingVertex(_, _)));
        for iz in 0..N {
            for ix in 0..N {
                lattice.set_vertex(ix, iz, 2.5).unwrap();
            }
        }
        assert_eq!(lattice.sample(1.0, 1.0), Sample::Height(2.5));
        assert_eq!(lattice.sample(600.0, 0.0), Sample::OffSquare);
        assert_eq!(lattice.sample(f64::NAN, 0.0), Sample::Height(0.0));
    }

    /// 2026-11-02 audit S2: a corner and a split are written once; the answers (and the last-cell cache) keep them.
    #[test]
    fn corners_and_splits_are_written_once() {
        let mut lattice = ContactLattice::new();
        // a steep convex fold: a + d - b - c = 3 > 1, the steepest edge 2 > 0.75
        let (ix, iz) = (400, 400);
        assert_eq!(lattice.set_flip_from_centre(ix, iz, 1.0), Err(LatticeRefusal::CornersMissing), "a split waits for its corners");
        for (vx, vz, h) in [(ix, iz, 0.0), (ix + 1, iz, -1.0), (ix, iz + 1, -1.0), (ix + 1, iz + 1, 1.0)] {
            lattice.set_vertex(vx, vz, h).unwrap();
        }
        let (x, z) = (lattice.vertex_coordinate(ix) + 0.3, lattice.vertex_coordinate(iz) + 0.2);
        assert_eq!(lattice.sample(x, z), Sample::MissingFlip(400, 400), "a fold asks for its split");
        // the centre nearer the a–d midpoint (0.5) than the b–c one (-1) by more than the preference
        lattice.set_flip_from_centre(ix, iz, 0.5).unwrap();
        let Sample::Height(before) = lattice.sample(x, z) else { panic!("the cell is answered") };
        assert_eq!(lattice.cell_flipped_at(x, z), Ok(true));
        assert_eq!(lattice.set_vertex(ix + 1, iz + 1, 1.0), Ok(()), "the same corner again is no change");
        assert_eq!(lattice.set_vertex(ix + 1, iz + 1, 1.0 + 1e-9), Ok(()), "nor one that rounds to the same Float32");
        assert_eq!(lattice.set_vertex(ix + 1, iz + 1, 4.0), Err(LatticeRefusal::Conflict), "a known corner never moves");
        assert_eq!(lattice.set_flip(ix, iz, true), Ok(()));
        assert_eq!(lattice.set_flip(ix, iz, false), Err(LatticeRefusal::Conflict), "a decided split never turns");
        assert_eq!(lattice.set_flip_from_centre(ix, iz, -1.0), Err(LatticeRefusal::Conflict));
        assert_eq!(lattice.sample(x, z), Sample::Height(before), "the answer stands");
        assert_eq!(lattice.cell_flipped_at(x, z), Ok(true));
        assert_eq!(lattice.set_vertex(N, 0, 1.0), Err(LatticeRefusal::OutOfRange));
        assert_eq!(lattice.set_flip(CELLS, 0, true), Err(LatticeRefusal::OutOfRange));
    }
}
