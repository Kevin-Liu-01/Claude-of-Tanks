//! Collision records as the support solve reads them — `src/world/collision.ts`, bit for bit.
//!
//! A record is an AABB, an optional shape (one simple part or a compound of them) and the flags the support reads. A
//! part is a yawed box, a circle or a convex outline, with an optional vertical extent [y0, y1] and, for a convex
//! part, an optional drawn top (`tp`: the planes of a stone's surface or a roof's deck). The functions mirror the
//! TypeScript's: footprint containment, a part's top and climb surface, whether a part is a raised deck, a building's
//! roofs over its ground-contact band, and a hull's underside over a record.

use crate::jsmath;

/// The step a hull's tracks take up any face (collision.ts HULL_STEP_UP_M).
pub const HULL_STEP_UP_M: f64 = 0.55;
/// Parts lower than this are driven over, not stood on (HULL_STANDABLE_HEIGHT_M).
pub const HULL_STANDABLE_HEIGHT_M: f64 = 0.9;
const HULL_CLIMB_M: f64 = 0.9;
const HULL_CLIMB_GRADE: f64 = 1.0;
const CLIMB_ALLOWANCE_M: f64 = HULL_CLIMB_M - 0.55;
const DECK_RAISED_M: f64 = 0.5;

/// One simple part.
#[derive(Clone, Debug)]
pub struct Part {
    /// Its plan shape.
    pub kind: PartKind,
    /// Its vertical extent [y0, y1] when it carries one.
    pub y: Option<(f64, f64)>,
}

/// A part's plan shape.
#[derive(Clone, Debug)]
#[allow(missing_docs)] // (the fields are the TypeScript's, named alike)
pub enum PartKind {
    /// A box yawed like a hull: forward (sin yaw, cos yaw) by `hl`, right (cos yaw, −sin yaw) by `hw`.
    Obb { cx: f64, cz: f64, hw: f64, hl: f64, yaw: f64 },
    /// A circle.
    Circle { cx: f64, cz: f64, r: f64 },
    /// A convex outline (x, z pairs) and its drawn top's planes (`[ox, oz, a0, b0, c0, …]`).
    Convex { points: Vec<f64>, tp: Option<Vec<f64>> },
}

/// A record's shape.
#[derive(Clone, Debug)]
pub enum Shape {
    /// The AABB alone.
    None,
    /// One part.
    Simple(Part),
    /// Parts tested one by one (a null part is skipped).
    Compound(Vec<Option<Part>>),
}

/// One collision record.
#[derive(Clone, Debug)]
pub struct Record {
    /// AABB minimum (x, y, z).
    pub min: [f64; 3],
    /// AABB maximum (x, y, z).
    pub max: [f64; 3],
    /// Its shape.
    pub shape: Shape,
    /// Crushable cover (crushed, never stood on).
    pub crushable: bool,
    /// A tank or tram wreck (its drawn tops are steel, never a deck).
    pub wreck: bool,
    /// Crushed or destroyed this match (the support skips it).
    pub crushed: bool,
    /// Dead this match.
    pub dead: bool,
    /// The compound's parts that are roofs over part of its ground-contact band (bandRoofsOf), computed once.
    band_roofs: Option<Vec<usize>>,
}

impl Part {
    fn y1_or(&self, record_max_y: f64) -> f64 {
        self.y.map_or(record_max_y, |(_, y1)| y1)
    }

    fn tp(&self) -> Option<&[f64]> {
        match &self.kind {
            PartKind::Convex { tp: Some(tp), .. } => Some(tp),
            _ => None,
        }
    }

    /// A convex part with a drawn top.
    pub fn has_drawn_top(&self) -> bool {
        self.tp().is_some()
    }
}

impl Record {
    /// A record, its band roofs worked out.
    pub fn new(min: [f64; 3], max: [f64; 3], shape: Shape, crushable: bool, wreck: bool) -> Record {
        let mut record = Record { min, max, shape, crushable, wreck, crushed: false, dead: false, band_roofs: None };
        record.band_roofs = record.compute_band_roofs();
        record
    }

    /// The part `index` of a compound (None for a null part or a simple shape).
    pub fn part(&self, index: usize) -> Option<&Part> {
        match &self.shape {
            Shape::Compound(parts) => parts.get(index).and_then(Option::as_ref),
            _ => None,
        }
    }

    /// `collisionRecordHasDrawnTop`.
    pub fn has_drawn_top(&self) -> bool {
        match &self.shape {
            Shape::None => false,
            Shape::Simple(part) => matches!(part.kind, PartKind::Convex { .. }) && part.has_drawn_top(),
            Shape::Compound(parts) => parts.iter().flatten().any(|part| part.has_drawn_top()),
        }
    }

    /// `collisionPartIsDeck`: a drawn top standing clear of the record's foot, on a building.
    pub fn part_is_deck(&self, part: &Part) -> bool {
        part.has_drawn_top() && !self.crushable && part.y.is_some_and(|(y0, _)| y0 > self.min[1] + DECK_RAISED_M) && !self.wreck
    }

    fn compute_band_roofs(&self) -> Option<Vec<usize>> {
        let Shape::Compound(parts) = &self.shape else { return None };
        if self.crushable {
            return None;
        }
        let mut lowest_band = f64::INFINITY;
        for part in parts.iter().flatten() {
            if self.part_is_deck(part) || part.has_drawn_top() {
                continue;
            }
            lowest_band = jsmath::min(lowest_band, part.y1_or(self.max[1]));
        }
        let mut roofs: Option<Vec<usize>> = None;
        for (index, part) in parts.iter().enumerate() {
            if let Some(part) = part {
                if self.part_is_deck(part) && part.y.map_or(f64::NEG_INFINITY, |(_, y1)| y1) > lowest_band {
                    roofs.get_or_insert_with(Vec::new).push(index);
                }
            }
        }
        roofs
    }

    /// Whether the record has a roof over part of its ground-contact band.
    pub fn has_band_roofs(&self) -> bool {
        self.band_roofs.is_some()
    }

    /// `pointInsideCollisionRecord`: is (x, z) inside `part`'s footprint (None: the record's AABB)?
    pub fn point_inside(&self, part: Option<&Part>, x: f64, z: f64) -> bool {
        let Some(part) = part else {
            return x >= self.min[0] && x <= self.max[0] && z >= self.min[2] && z <= self.max[2];
        };
        match &part.kind {
            PartKind::Circle { cx, cz, r } => {
                let (dx, dz) = (x - cx, z - cz);
                dx * dx + dz * dz <= r * r
            }
            PartKind::Obb { cx, cz, hw, hl, yaw } => {
                let (dx, dz) = (x - cx, z - cz);
                let (c, s) = (jsmath::cos(*yaw), jsmath::sin(*yaw));
                let along = dx * s + dz * c;
                let across = dx * c - dz * s;
                along.abs() <= *hl && across.abs() <= *hw
            }
            PartKind::Convex { points, .. } => {
                if points.len() < 6 {
                    return false;
                }
                let mut sign = 0;
                let mut i = 0;
                while i < points.len() {
                    let next = (i + 2) % points.len();
                    let ex = points[next] - points[i];
                    let ez = points[next + 1] - points[i + 1];
                    let cross = ex * (z - points[i + 1]) - ez * (x - points[i]);
                    i += 2;
                    if cross.abs() < 1e-9 {
                        continue;
                    }
                    let side = if cross > 0.0 { 1 } else { -1 };
                    if sign == 0 {
                        sign = side;
                    } else if side != sign {
                        return false;
                    }
                }
                true
            }
        }
    }

    /// `collisionPartTopAt`: the part's drawn top at (x, z), else its flat top (`part` None: the record's).
    pub fn part_top_at(&self, part: Option<&Part>, x: f64, z: f64) -> f64 {
        let y1 = part.map_or(self.max[1], |p| p.y1_or(self.max[1]));
        let Some(tp) = part.and_then(Part::tp) else { return y1 };
        let (dx, dz) = (x - tp[0], z - tp[1]);
        let mut top = y1;
        let mut i = 2;
        while i + 2 < tp.len() {
            let y = tp[i] * dx + tp[i + 1] * dz + tp[i + 2];
            if y < top {
                top = y;
            }
            i += 3;
        }
        top
    }

    /// `collisionPartClimbAt`: the drawn top's climb surface at (x, z).
    pub fn part_climb_at(&self, part: Option<&Part>, x: f64, z: f64) -> f64 {
        let y1 = part.map_or(self.max[1], |p| p.y1_or(self.max[1]));
        let Some(tp) = part.and_then(Part::tp) else { return y1 };
        let (dx, dz) = (x - tp[0], z - tp[1]);
        let mut climb = y1 - CLIMB_ALLOWANCE_M;
        let mut i = 2;
        while i + 2 < tp.len() {
            let (a, b) = (tp[i], tp[i + 1]);
            let y = a * dx + b * dz + tp[i + 2] - (if a * a + b * b <= HULL_CLIMB_GRADE * HULL_CLIMB_GRADE { CLIMB_ALLOWANCE_M } else { 0.0 });
            if y < climb {
                climb = y;
            }
            i += 3;
        }
        climb
    }

    /// `bandRoofTopAt`: the building's roof over (x, z) above `part`'s band top, or −∞.
    pub fn band_roof_top_at(&self, part: &Part, x: f64, z: f64) -> f64 {
        let Some(roofs) = &self.band_roofs else { return f64::NEG_INFINITY };
        let band_top = part.y1_or(self.max[1]);
        let mut best = f64::NEG_INFINITY;
        for &index in roofs {
            let roof = self.part(index).expect("a band roof is a part");
            if !(roof.y.map_or(f64::NEG_INFINITY, |(_, y1)| y1) > band_top) || !self.point_inside(Some(roof), x, z) {
                continue;
            }
            let top = self.part_top_at(Some(roof), x, z);
            if top > best {
                best = top;
            }
        }
        best
    }

    /// `footprintHolds` (margin 0): any part's footprint holds (x, z); a shapeless record's AABB was tested by the caller.
    fn footprint_holds(&self, x: f64, z: f64) -> bool {
        match &self.shape {
            Shape::None => true,
            Shape::Simple(part) => simple_footprint_contains(part, x, z),
            Shape::Compound(parts) => parts.iter().flatten().any(|part| simple_footprint_contains(part, x, z)),
        }
    }

    /// `hullUndersideOver`: how low the hull's underside lies over this record (its track rows, else its end rows less
    /// their lift past the step), or `root_y` when no sample of the 5 × 3 grid is over it.
    pub fn hull_underside_over(&self, foot: &HullFootprint, root_y: f64) -> f64 {
        let reach_x = foot.forward_x.abs() * foot.half_length + foot.right_x.abs() * foot.half_width;
        let reach_z = foot.forward_z.abs() * foot.half_length + foot.right_z.abs() * foot.half_width;
        if foot.center_x + reach_x < self.min[0] || foot.center_x - reach_x > self.max[0] || foot.center_z + reach_z < self.min[2] || foot.center_z - reach_z > self.max[2] {
            return root_y;
        }
        let center_y = root_y + foot.center_rise;
        let (mut tracks, mut ends) = (f64::INFINITY, f64::INFINITY);
        for i in 0..5 {
            let along = (i as f64 * 0.5 - 1.0) * foot.half_length;
            let end = i == 0 || i == 4;
            let lift = if i == 4 { foot.front_lift - HULL_STEP_UP_M } else if i == 0 { foot.rear_lift - HULL_STEP_UP_M } else { 0.0 };
            for j in 0..3 {
                let across = (j as f64 - 1.0) * foot.half_width;
                let x = foot.center_x + foot.forward_x * along + foot.right_x * across;
                let z = foot.center_z + foot.forward_z * along + foot.right_z * across;
                if x < self.min[0] || x > self.max[0] || z < self.min[2] || z > self.max[2] {
                    continue;
                }
                if !self.footprint_holds(x, z) {
                    continue;
                }
                let plane = center_y + along * foot.rise_along + across * foot.rise_across;
                if end {
                    if plane + lift < ends {
                        ends = plane + lift;
                    }
                } else if plane < tracks {
                    tracks = plane;
                }
            }
        }
        if tracks < f64::INFINITY { tracks } else if ends < f64::INFINITY { ends } else { root_y }
    }
}

/// `convexWinding`: the outline's turn (+1 or −1).
fn convex_winding(points: &[f64]) -> f64 {
    let mut area2 = 0.0;
    let mut index = 0;
    while index < points.len() {
        let next = if index + 2 < points.len() { index + 2 } else { 0 };
        area2 += points[index] * points[next + 1] - points[next] * points[index + 1];
        index += 2;
    }
    if area2 < 0.0 { -1.0 } else { 1.0 }
}

/// `simpleFootprintContainsPoint` with no margin and no bevel.
fn simple_footprint_contains(part: &Part, x: f64, z: f64) -> bool {
    match &part.kind {
        PartKind::Circle { cx, cz, r } => {
            let (dx, dz) = (x - cx, z - cz);
            let radius = r + 0.0;
            dx * dx + dz * dz <= radius * radius
        }
        PartKind::Obb { cx, cz, hw, hl, yaw } => {
            let (dx, dz) = (x - cx, z - cz);
            let (forward_x, forward_z) = (jsmath::sin(*yaw), jsmath::cos(*yaw));
            let (right_x, right_z) = (forward_z, -forward_x);
            (dx * right_x + dz * right_z).abs() <= hw + 0.0 && (dx * forward_x + dz * forward_z).abs() <= hl + 0.0
        }
        PartKind::Convex { points, .. } => {
            let winding = convex_winding(points);
            let mut index = 0;
            while index < points.len() {
                let next = (index + 2) % points.len();
                let edge_x = points[next] - points[index];
                let edge_z = points[next + 1] - points[index + 1];
                let cross = winding * (edge_x * (z - points[index + 1]) - edge_z * (x - points[index]));
                if cross < -0.0 * jsmath::hypot2(edge_x, edge_z) {
                    return false;
                }
                index += 2;
            }
            true
        }
    }
}

/// A hull's footprint at its attitude (collision.ts HullFootprint, as hullFootprint fills it).
#[derive(Clone, Copy, Debug, Default)]
pub struct HullFootprint {
    /// World centre of the projected rect.
    pub center_x: f64,
    /// World centre of the projected rect.
    pub center_z: f64,
    /// Forward (sin yaw, cos yaw).
    pub forward_x: f64,
    /// Forward (sin yaw, cos yaw).
    pub forward_z: f64,
    /// Right (cos yaw, −sin yaw).
    pub right_x: f64,
    /// Right (cos yaw, −sin yaw).
    pub right_z: f64,
    /// The rect's foreshortened half length.
    pub half_length: f64,
    /// The rect's foreshortened half width.
    pub half_width: f64,
    /// The underside's rise at the rect's centre over the root.
    pub center_rise: f64,
    /// Rise per metre along.
    pub rise_along: f64,
    /// Rise per metre across.
    pub rise_across: f64,
    /// The nose plates' lift.
    pub front_lift: f64,
    /// The tail plates' lift.
    pub rear_lift: f64,
}
