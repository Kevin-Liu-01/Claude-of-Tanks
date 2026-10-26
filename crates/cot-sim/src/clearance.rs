//! The bots' clearance queries — `collisionClearanceContainsPoint` and `rayCollisionClearanceEntry2` of
//! `src/world/collision.ts`, bit for bit.
//!
//! A record's footprint grown by a margin: each edge of a convex part moved out by it, a box's half extents and a
//! circle's radius grown by it, and every convex corner sharper than the miter limit capped by its bevel line the margin
//! out along its bisector (a sliver grows no needle). The point test skips a compound's raised decks; the ray reads
//! every part.

use crate::jsmath;
use crate::records::{Part, PartKind, Record, Shape};

const EPS: f64 = 1e-9;
/// collision.ts CLEARANCE_MITER_LIMIT.
const CLEARANCE_MITER_LIMIT: f64 = 2.0;
/// |n1 + n2| of two unit outward normals at a corner sharper than the limit.
const CLEARANCE_BEVEL_SUM: f64 = 2.0 / CLEARANCE_MITER_LIMIT;

/// `clearanceBevelAt`: the outward bisector of the convex corner at `index` (a point's x offset in `points`) when the
/// corner is sharper than the miter limit; None for a blunter corner or a corner on a zero-length edge.
fn clearance_bevel_at(points: &[f64], index: usize, winding: f64) -> Option<(f64, f64)> {
    let count = points.len();
    let (previous, next) = ((index + count - 2) % count, (index + 2) % count);
    let (vx, vz) = (points[index], points[index + 1]);
    let (ax, az) = (vx - points[previous], vz - points[previous + 1]);
    let (bx, bz) = (points[next] - vx, points[next + 1] - vz);
    let (la, lb) = (jsmath::hypot2(ax, az), jsmath::hypot2(bx, bz));
    if la < EPS || lb < EPS {
        return None;
    }
    let sx = winding * (az / la + bz / lb);
    let sz = -winding * (ax / la + bx / lb);
    let sum = jsmath::hypot2(sx, sz);
    if sum >= CLEARANCE_BEVEL_SUM {
        return None;
    }
    if sum > 1e-9 {
        return Some((sx / sum, sz / sum));
    }
    // a corner folded back on itself: out from the footprint's middle
    let (mut cx, mut cz) = (0.0, 0.0);
    let mut k = 0;
    while k < count {
        cx += points[k];
        cz += points[k + 1];
        k += 2;
    }
    cx = vx - cx * 2.0 / count as f64;
    cz = vz - cz * 2.0 / count as f64;
    let length = jsmath::hypot2(cx, cz);
    if length < EPS {
        return None;
    }
    Some((cx / length, cz / length))
}

/// `beyondClearanceBevel`: does (x, z) lie beyond the margin past one of the outline's bevelled corners?
fn beyond_clearance_bevel(points: &[f64], winding: f64, x: f64, z: f64, margin: f64) -> bool {
    let mut index = 0;
    while index < points.len() {
        if let Some((bx, bz)) = clearance_bevel_at(points, index, winding)
            && (x - points[index]) * bx + (z - points[index + 1]) * bz > margin
        {
            return true;
        }
        index += 2;
    }
    false
}

/// `simpleFootprintContainsPoint` with the bevels.
fn simple_contains(part: &Part, x: f64, z: f64, margin: f64) -> bool {
    match &part.kind {
        PartKind::Circle { cx, cz, r } => {
            let (dx, dz) = (x - cx, z - cz);
            let radius = r + margin;
            dx * dx + dz * dz <= radius * radius
        }
        PartKind::Obb { cx, cz, hw, hl, cos, sin, .. } => {
            let (dx, dz) = (x - cx, z - cz);
            let (forward_x, forward_z) = (*sin, *cos);
            let (right_x, right_z) = (forward_z, -forward_x);
            (dx * right_x + dz * right_z).abs() <= hw + margin && (dx * forward_x + dz * forward_z).abs() <= hl + margin
        }
        PartKind::Convex { points, .. } => {
            let winding = crate::records::convex_winding(points);
            let mut index = 0;
            while index < points.len() {
                let next = (index + 2) % points.len();
                let edge_x = points[next] - points[index];
                let edge_z = points[next + 1] - points[index + 1];
                let cross = winding * (edge_x * (z - points[index + 1]) - edge_z * (x - points[index]));
                if cross < -margin * jsmath::hypot2(edge_x, edge_z) {
                    return false;
                }
                index += 2;
            }
            !(margin > 0.0 && beyond_clearance_bevel(points, winding, x, z, margin))
        }
    }
}

/// `collisionClearanceContainsPoint`: does (x, z) lie within `margin` of the record's footprint (its raised decks
/// aside)?
pub fn contains_point(record: &Record, x: f64, z: f64, margin: f64) -> bool {
    match &record.shape {
        Shape::None => {
            x >= record.min[0] - margin && x <= record.max[0] + margin && z >= record.min[2] - margin && z <= record.max[2] + margin
        }
        Shape::Simple(part) => simple_contains(part, x, z, margin),
        Shape::Compound(parts) => parts.iter().flatten().any(|part| !record.part_is_deck(part) && simple_contains(part, x, z, margin)),
    }
}

fn ray_slab_near(origin: f64, direction: f64, min: f64, max: f64) -> f64 {
    if direction.abs() < EPS {
        return if origin >= min && origin <= max { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    jsmath::min((min - origin) / direction, (max - origin) / direction)
}

fn ray_slab_far(origin: f64, direction: f64, min: f64, max: f64) -> f64 {
    if direction.abs() < EPS {
        return if origin >= min && origin <= max { f64::INFINITY } else { f64::NEG_INFINITY };
    }
    jsmath::max((min - origin) / direction, (max - origin) / direction)
}

/// The run [entry, exit] of a ray through the slabs [min_x, max_x] × [min_z, max_z], as `rayObbEntry2` and the box
/// path of `rayFootprintEntry2` judge it.
#[allow(clippy::too_many_arguments)]
fn ray_slabs(ox: f64, oz: f64, dx: f64, dz: f64, min_x: f64, max_x: f64, min_z: f64, max_z: f64, max_distance: f64) -> Option<f64> {
    let entry = jsmath::max(jsmath::max(0.0, ray_slab_near(ox, dx, min_x, max_x)), ray_slab_near(oz, dz, min_z, max_z));
    let exit = jsmath::min(jsmath::min(max_distance, ray_slab_far(ox, dx, min_x, max_x)), ray_slab_far(oz, dz, min_z, max_z));
    if entry <= exit && exit >= 0.0 && entry < max_distance { Some(entry) } else { None }
}

/// `raySimpleFootprintEntry2` with the bevels.
fn ray_simple_entry(part: &Part, sx: f64, sz: f64, dx: f64, dz: f64, max_distance: f64, margin: f64) -> Option<f64> {
    match &part.kind {
        PartKind::Circle { cx, cz, r } => {
            let (ox, oz) = (sx - cx, sz - cz);
            let radius = r + margin;
            let along = -(ox * dx + oz * dz);
            let closest_sq = ox * ox + oz * oz - along * along;
            let radius_sq = radius * radius;
            if closest_sq > radius_sq {
                return None;
            }
            let half_chord = jsmath::max(0.0, radius_sq - closest_sq).sqrt();
            let entry = jsmath::max(0.0, along - half_chord);
            let exit = along + half_chord;
            if exit >= 0.0 && entry < max_distance { Some(entry) } else { None }
        }
        PartKind::Obb { cx, cz, hw, hl, cos, sin, .. } => {
            let (forward_x, forward_z) = (*sin, *cos);
            let (right_x, right_z) = (forward_z, -forward_x);
            let (ox, oz) = (sx - cx, sz - cz);
            let local_x = ox * right_x + oz * right_z;
            let local_z = ox * forward_x + oz * forward_z;
            let local_dx = dx * right_x + dz * right_z;
            let local_dz = dx * forward_x + dz * forward_z;
            ray_slabs(local_x, local_z, local_dx, local_dz, -hw - margin, hw + margin, -hl - margin, hl + margin, max_distance)
        }
        PartKind::Convex { points, .. } => {
            let winding = crate::records::convex_winding(points);
            let (mut entry, mut exit) = (0.0, max_distance);
            let mut index = 0;
            while index < points.len() {
                let next = (index + 2) % points.len();
                let edge_x = points[next] - points[index];
                let edge_z = points[next + 1] - points[index + 1];
                let offset = winding * (edge_x * (sz - points[index + 1]) - edge_z * (sx - points[index])) + margin * jsmath::hypot2(edge_x, edge_z);
                let velocity = winding * (edge_x * dz - edge_z * dx);
                index += 2;
                if velocity.abs() < EPS {
                    if offset < 0.0 {
                        return None;
                    }
                    continue;
                }
                let crossing = -offset / velocity;
                if velocity > 0.0 {
                    entry = jsmath::max(entry, crossing);
                } else {
                    exit = jsmath::min(exit, crossing);
                }
                if entry > exit {
                    return None;
                }
            }
            // each sharp corner's bevel line bounds the run too, read only for a ray the offset edges already let in
            if margin > 0.0 {
                let mut index = 0;
                while index < points.len() {
                    let corner = index;
                    index += 2;
                    let Some((bx, bz)) = clearance_bevel_at(points, corner, winding) else { continue };
                    let room = margin - ((sx - points[corner]) * bx + (sz - points[corner + 1]) * bz);
                    let velocity = dx * bx + dz * bz;
                    if velocity.abs() < EPS {
                        if room < 0.0 {
                            return None;
                        }
                        continue;
                    }
                    if velocity > 0.0 {
                        exit = jsmath::min(exit, room / velocity);
                    } else {
                        entry = jsmath::max(entry, room / velocity);
                    }
                    if entry > exit {
                        return None;
                    }
                }
            }
            if exit >= 0.0 && entry < max_distance { Some(jsmath::max(0.0, entry)) } else { None }
        }
    }
}

/// `rayCollisionClearanceEntry2`: where the 2D ray from (sx, sz) along (dx, dz) (normalised here) first enters the
/// record's footprint grown by `margin`, within `max_distance`; None when it does not.
pub fn ray_entry(record: &Record, sx: f64, sz: f64, dx: f64, dz: f64, max_distance: f64, margin: f64) -> Option<f64> {
    let length = jsmath::hypot2(dx, dz);
    if length < EPS || max_distance <= 0.0 {
        return None;
    }
    let (dx, dz) = (dx / length, dz / length);
    match &record.shape {
        Shape::None => ray_slabs(
            sx, sz, dx, dz, record.min[0] - margin, record.max[0] + margin, record.min[2] - margin, record.max[2] + margin, max_distance,
        ),
        Shape::Simple(part) => ray_simple_entry(part, sx, sz, dx, dz, max_distance, margin),
        Shape::Compound(parts) => {
            let mut best: Option<f64> = None;
            for part in parts.iter().flatten() {
                if let Some(entry) = ray_simple_entry(part, sx, sz, dx, dz, max_distance, margin)
                    && best.is_none_or(|b| entry < b)
                {
                    best = Some(entry);
                }
            }
            best
        }
    }
}
