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

    /// Supply corner (ix, iz)'s height (stored as Float32, as the TypeScript stores it).
    #[inline]
    pub fn set_vertex(&mut self, ix: usize, iz: usize, height: f64) {
        let i = iz * N + ix;
        self.heights[i] = height as f32;
        self.ready[i >> 3] |= 1 << (i & 7);
    }

    /// Whether corner (ix, iz) is known.
    #[inline]
    pub fn vertex_ready(&self, ix: usize, iz: usize) -> bool {
        let i = iz * N + ix;
        self.ready[i >> 3] & (1 << (i & 7)) != 0
    }

    /// Decide fold cell (ix, iz)'s split from its centre's height (Float32-rounded, as `Math.fround` rounds it).
    pub fn set_flip_from_centre(&mut self, ix: usize, iz: usize, centre: f64) {
        let (a, b, c, d) = self.corners(ix, iz);
        let flipped = cell_flipped(a, b, c, d, centre as f32 as f64);
        self.flips[iz * CELLS + ix] = if flipped { 2 } else { 1 };
    }

    /// Set fold cell (ix, iz)'s split directly (from a fixture that recorded it).
    #[inline]
    pub fn set_flip(&mut self, ix: usize, iz: usize, flipped: bool) {
        self.flips[iz * CELLS + ix] = if flipped { 2 } else { 1 };
    }

    /// Raw access for a host that fills the lattice in place (the WebAssembly bindings).
    pub fn raw_parts(&mut self) -> (&mut [f32], &mut [u8], &mut [u8]) {
        self.last = None;
        (&mut self.heights, &mut self.ready, &mut self.flips)
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
                lattice.set_vertex(ix, iz, 2.5);
            }
        }
        assert_eq!(lattice.sample(1.0, 1.0), Sample::Height(2.5));
        assert_eq!(lattice.sample(600.0, 0.0), Sample::OffSquare);
        assert_eq!(lattice.sample(f64::NAN, 0.0), Sample::Height(0.0));
    }
}
