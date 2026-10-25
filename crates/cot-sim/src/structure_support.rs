//! Structure support — `src/sim/structureSupport.ts`, bit for bit: every support sample also sees the tops of the
//! collision primitives under it, so a hull stands on a roof, a stone or a deck exactly as on terrain.
//!
//! [`SupportField::begin_hull`] gathers the hull's candidates (the obstacle grid, 6 m about it), its belly line, the
//! roof's deck it stands on and, with a pose, its underside over each candidate and its track plane;
//! [`SupportField::top_at`] is `structureTopAt` over them with the ground as its floor.

use crate::grid::ObstacleGrid;
use crate::jsmath;
use crate::records::{HullFootprint, Part, PartKind, Record, Shape, HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M};

/// A hull stands on a part whose top is at most this far over its belly line.
pub const SUPPORT_STEP_UP_M: f64 = HULL_STEP_UP_M;
/// Parts lower than this are driven over by the ride spring.
pub const SUPPORT_MIN_HEIGHT_M: f64 = HULL_STANDABLE_HEIGHT_M;
const SUPPORT_QUERY_MARGIN_M: f64 = 6.0;
/// terrainMobility.ts CLIFF_GRADE.
pub const CLIFF_GRADE: f64 = 1.28;

/// The hull's track plane for the drawn-top rule.
#[derive(Clone, Copy, Debug, Default)]
struct SupportPlane {
    y: f64,
    cx: f64,
    cz: f64,
    slope_x: f64,
    slope_z: f64,
}

/// One hull's support over the world's records (`createStructureSupportField`'s state).
#[derive(Default)]
pub struct SupportField {
    candidates: Vec<u32>,
    belly: f64,
    floors: Vec<f64>,
    posed: bool,
    stand_x: f64,
    stand_z: f64,
    /// Per candidate: the deck part the hull stands on (its index in the compound), and that deck's top.
    stand_parts: Vec<Option<usize>>,
    stand_tops: Vec<f64>,
    standing: bool,
    plane: SupportPlane,
    /// Reads a primitive's top answered over the ground.
    pub record_reads: u32,
}

/// tan(π/3) through the pinned math (structureSupport.ts POSED_RISE_MAX).
fn posed_rise_max() -> f64 {
    jsmath::tan(jsmath::PI / 3.0)
}

fn part_ref<'a>(record: &'a Record, shape_part: Option<usize>) -> Option<&'a Part> {
    match (&record.shape, shape_part) {
        (Shape::Compound(_), Some(index)) => record.part(index),
        (Shape::Simple(part), None) => Some(part),
        _ => None,
    }
}

impl SupportField {
    /// An empty field.
    pub fn new() -> SupportField {
        SupportField::default()
    }

    /// Candidates gathered for the current hull.
    pub fn candidate_count(&self) -> usize {
        self.candidates.len()
    }

    /// Whether the current hull's root stands on a roof's deck.
    pub fn standing_deck(&self) -> bool {
        self.standing
    }

    /// `beginHull`: select the hull about to be stepped (its candidates from the world's obstacle grid).
    pub fn begin_hull(&mut self, records: &[Record], grid: &mut ObstacleGrid, x: f64, z: f64, belly_y: f64, pose: Option<&HullFootprint>) {
        self.query(grid, x, z);
        self.begin_queried(records, x, z, belly_y, pose);
    }

    /// `beginHull`'s first half: the candidates about (x, z) from the obstacle grid (a host syncs their flags next).
    pub fn query(&mut self, grid: &mut ObstacleGrid, x: f64, z: f64) -> usize {
        let mut candidates = core::mem::take(&mut self.candidates);
        grid.query(x - SUPPORT_QUERY_MARGIN_M, z - SUPPORT_QUERY_MARGIN_M, x + SUPPORT_QUERY_MARGIN_M, z + SUPPORT_QUERY_MARGIN_M, &mut candidates);
        self.candidates = candidates;
        self.candidates.len()
    }

    /// `beginHull`'s second half, over the candidates [`SupportField::query`] gathered.
    pub fn begin_queried(&mut self, records: &[Record], x: f64, z: f64, belly_y: f64, pose: Option<&HullFootprint>) {
        self.begin_candidates(records, x, z, belly_y, pose);
    }

    /// `beginHull` with the candidates given (record indices in the grid's order).
    pub fn begin_hull_with(&mut self, records: &[Record], candidates: &[u32], x: f64, z: f64, belly_y: f64, pose: Option<&HullFootprint>) {
        self.candidates.clear();
        self.candidates.extend_from_slice(candidates);
        self.begin_candidates(records, x, z, belly_y, pose);
    }

    fn begin_candidates(&mut self, records: &[Record], x: f64, z: f64, belly_y: f64, pose: Option<&HullFootprint>) {
        self.belly = belly_y;
        let count = self.candidates.len();
        let rise_max = posed_rise_max();
        self.posed = pose.is_some_and(|p| p.rise_along.abs() <= rise_max && p.rise_across.abs() <= rise_max);
        self.standing = false;
        self.stand_x = x;
        self.stand_z = z;
        self.stand_tops.resize(count, 0.0);
        self.stand_parts.clear();
        self.stand_parts.resize(count, None);
        let (mut best, mut best_record, mut best_part) = (f64::NEG_INFINITY, usize::MAX, None);
        for i in 0..count {
            let record = &records[self.candidates[i] as usize];
            let Shape::Compound(parts) = &record.shape else { continue };
            if record.crushed || record.dead || record.crushable {
                continue;
            }
            if x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2] {
                continue;
            }
            for (index, part) in parts.iter().enumerate() {
                let Some(part) = part else { continue };
                if part.y.is_some_and(|(y0, y1)| y1 <= best || y0 > belly_y + SUPPORT_STEP_UP_M) {
                    continue;
                }
                if !part.has_drawn_top() && record.band_roof_top_at(part, x, z) > f64::NEG_INFINITY {
                    continue;
                }
                let top = record.part_top_at(Some(part), x, z);
                if top <= best || top > belly_y + SUPPORT_STEP_UP_M || !record.point_inside(Some(part), x, z) {
                    continue;
                }
                best = top;
                best_record = i;
                best_part = Some(index);
            }
        }
        if let Some(index) = best_part {
            let record = &records[self.candidates[best_record] as usize];
            if record.part_is_deck(record.part(index).expect("the best part")) {
                self.stand_parts[best_record] = Some(index);
                self.stand_tops[best_record] = best;
                self.standing = true;
            }
        }
        let Some(pose) = pose.filter(|_| self.posed) else { return };
        self.plane = SupportPlane {
            y: belly_y + pose.center_rise,
            cx: pose.center_x,
            cz: pose.center_z,
            slope_x: pose.rise_along * pose.forward_x + pose.rise_across * pose.right_x,
            slope_z: pose.rise_along * pose.forward_z + pose.rise_across * pose.right_z,
        };
        self.floors.resize(count, 0.0);
        for i in 0..count {
            self.floors[i] = records[self.candidates[i] as usize].hull_underside_over(pose, belly_y);
        }
    }

    /// The support at (x, z) over `ground` (the field's sample: the ground, or the highest standable top over it).
    pub fn sample(&mut self, records: &[Record], x: f64, z: f64, ground: f64) -> f64 {
        if self.candidates.is_empty() {
            return ground;
        }
        let top = self.top_at(records, x, z, ground);
        if top > ground + 0.02 {
            self.record_reads += 1;
        }
        top
    }

    /// `structureTopAt` over the current hull's candidates, `floor` the ground.
    pub fn top_at(&self, records: &[Record], x: f64, z: f64, floor: f64) -> f64 {
        let mut best = floor;
        let plane = if self.posed { Some(self.plane) } else { None };
        let plane_ceiling = plane.map_or(f64::NAN, |p| p.y + p.slope_x * (x - p.cx) + p.slope_z * (z - p.cz) + SUPPORT_STEP_UP_M);
        for (i, &candidate) in self.candidates.iter().enumerate() {
            let record = &records[candidate as usize];
            if x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2] {
                continue;
            }
            if record.crushed || record.dead || record.crushable {
                continue;
            }
            if record.max[1] - record.min[1] < SUPPORT_MIN_HEIGHT_M && !record.has_drawn_top() {
                continue;
            }
            let ceiling = (if self.posed { self.floors[i] } else { self.belly }) + SUPPORT_STEP_UP_M;
            match &record.shape {
                Shape::Compound(parts) => {
                    let standing = if self.standing { self.stand_parts[i] } else { None };
                    for (index, part) in parts.iter().enumerate() {
                        let Some(part) = part else { continue };
                        let mut top = record.part_top_at(Some(part), x, z);
                        if top <= best {
                            continue;
                        }
                        if !part.has_drawn_top() {
                            let roof = record.band_roof_top_at(part, x, z);
                            if roof > f64::NEG_INFINITY && roof < top {
                                top = roof;
                                if top <= best {
                                    continue;
                                }
                            }
                        }
                        if top > ceiling && !(part.has_drawn_top() && plane.is_some() && record.part_climb_at(Some(part), x, z) < plane_ceiling) {
                            // (only the record whose deck the hull stands on reads its roof as terrain)
                            let Some(standing_index) = standing else { continue };
                            let own = standing_index == index;
                            if !own {
                                let deck_within = record.part_is_deck(part)
                                    && top <= record.part_top_at(record.part(standing_index), x, z) + SUPPORT_STEP_UP_M;
                                if !deck_within {
                                    continue;
                                }
                            }
                            let reach = self.stand_tops[i] + SUPPORT_STEP_UP_M + CLIFF_GRADE * jsmath::hypot2(x - self.stand_x, z - self.stand_z);
                            if top > reach {
                                if !own {
                                    continue;
                                }
                                top = reach;
                            }
                            if top <= best {
                                continue;
                            }
                        }
                        if record.point_inside(Some(part), x, z) {
                            best = top;
                        }
                    }
                }
                shape => {
                    let simple = match shape {
                        Shape::Simple(part) => Some(part),
                        _ => None,
                    };
                    let drawn = simple.is_some_and(|p| matches!(p.kind, PartKind::Convex { .. }) && p.has_drawn_top());
                    let top = if drawn { record.part_top_at(simple, x, z) } else { record.max[1] };
                    if top <= best {
                        continue;
                    }
                    if top > ceiling && !(drawn && plane.is_some() && record.part_climb_at(simple, x, z) < plane_ceiling) {
                        continue;
                    }
                    if record.point_inside(simple, x, z) {
                        best = top;
                    }
                }
            }
        }
        best
    }

    /// The deck part (and the record) the hull stands on, for tests.
    pub fn standing_part(&self) -> Option<(u32, usize)> {
        self.stand_parts.iter().enumerate().find_map(|(i, p)| p.map(|index| (self.candidates[i], index)))
    }

    /// The candidates (record indices) for tests.
    pub fn candidates(&self) -> &[u32] {
        &self.candidates
    }

    #[doc(hidden)]
    pub fn part_ref<'a>(&self, records: &'a [Record], record: u32, part: Option<usize>) -> Option<&'a Part> {
        part_ref(&records[record as usize], part)
    }
}
