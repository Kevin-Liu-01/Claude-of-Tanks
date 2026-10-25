//! The static uniform-grid broad phase — the port of `createObstacleGrid` in
//! `src/world/collision.ts` (its dense cell table). Records are their plan
//! boxes; a query returns record indices in the TypeScript's own visitation
//! order (z-major cells, each cell's records in insertion order, each record
//! once), so the narrow phase behind it sees the same records in the same order.

use std::collections::HashMap;

/// A record's plan box: `min[0]`, `min[2]`, `max[0]`, `max[2]`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PlanBox {
    /// `min[0]`.
    pub min_x: f64,
    /// `min[2]`.
    pub min_z: f64,
    /// `max[0]`.
    pub max_x: f64,
    /// `max[2]`.
    pub max_z: f64,
}

/// `DENSE_GRID_MAX_CELLS`: the widest cell table laid out densely.
pub const DENSE_GRID_MAX_CELLS: i64 = 1 << 18;

/// The grid over a fixed record list (already deduplicated, in first-seen order: `indexedRecords`).
pub struct ObstacleGrid {
    boxes: Vec<PlanBox>,
    inv: f64,
    visited: Vec<u32>,
    stamp: u32,
    cell_x0: i64,
    cell_z0: i64,
    cell_x1: i64,
    cell_z1: i64,
    cols: i64,
    cell_start: Vec<u32>,
    cell_slots: Vec<u32>,
}

impl ObstacleGrid {
    /// Build the grid (`createObstacleGrid(records, cellSize)`). Panics on a range too wide for the dense table,
    /// which the TypeScript answers from a hash map instead (no battlefield comes near it).
    pub fn new(boxes: Vec<PlanBox>, cell_size: f64) -> ObstacleGrid {
        let inv = 1.0 / cell_size;
        // insertion-ordered cells, as the TypeScript Map holds them
        let mut cells: HashMap<(i64, i64), Vec<u32>> = HashMap::new();
        for (i, r) in boxes.iter().enumerate() {
            let x0 = (r.min_x * inv).floor() as i64;
            let x1 = (r.max_x * inv).floor() as i64;
            let z0 = (r.min_z * inv).floor() as i64;
            let z1 = (r.max_z * inv).floor() as i64;
            for z in z0..=z1 {
                for x in x0..=x1 {
                    cells.entry((x, z)).or_default().push(i as u32);
                }
            }
        }
        let (mut cell_x0, mut cell_z0, mut cell_x1, mut cell_z1) = (i64::MAX, i64::MAX, i64::MIN, i64::MIN);
        for &(x, z) in cells.keys() {
            cell_x0 = cell_x0.min(x);
            cell_x1 = cell_x1.max(x);
            cell_z0 = cell_z0.min(z);
            cell_z1 = cell_z1.max(z);
        }
        let (cols, rows) = if cells.is_empty() { (0, 0) } else { (cell_x1 - cell_x0 + 1, cell_z1 - cell_z0 + 1) };
        assert!(cols * rows <= DENSE_GRID_MAX_CELLS, "obstacle grid wider than the dense table");
        let mut cell_start = vec![0u32; (cols * rows + 1) as usize];
        let mut total = 0u32;
        for z in 0..rows {
            for x in 0..cols {
                cell_start[(z * cols + x) as usize] = total;
                total += cells.get(&(x + cell_x0, z + cell_z0)).map_or(0, |a| a.len() as u32);
            }
        }
        cell_start[(cols * rows) as usize] = total;
        let mut cell_slots = Vec::with_capacity(total as usize);
        for z in 0..rows {
            for x in 0..cols {
                if let Some(a) = cells.get(&(x + cell_x0, z + cell_z0)) {
                    cell_slots.extend_from_slice(a);
                }
            }
        }
        let n = boxes.len();
        ObstacleGrid { boxes, inv, visited: vec![0; n], stamp: 0, cell_x0, cell_z0, cell_x1, cell_z1, cols, cell_start, cell_slots }
    }

    /// The records whose boxes meet [min, max] in plan, appended to `out` (cleared first) in visitation order.
    pub fn query(&mut self, min_x: f64, min_z: f64, max_x: f64, max_z: f64, out: &mut Vec<u32>) {
        out.clear();
        self.stamp += 1;
        if self.stamp >= 0x7fff_ffff {
            self.stamp = 1;
            self.visited.fill(0);
        }
        if self.cols == 0 {
            return;
        }
        let x0 = (min_x * self.inv).floor();
        let x1 = (max_x * self.inv).floor();
        let z0 = (min_z * self.inv).floor();
        let z1 = (max_z * self.inv).floor();
        // the clip in doubles first (a NaN or infinite box clips the way the TypeScript's Math.max/min would)
        let qx0 = crate::jsmath::max(x0, self.cell_x0 as f64);
        let qx1 = crate::jsmath::min(x1, self.cell_x1 as f64);
        let qz0 = crate::jsmath::max(z0, self.cell_z0 as f64);
        let qz1 = crate::jsmath::min(z1, self.cell_z1 as f64);
        if !(qx0 <= qx1 && qz0 <= qz1) {
            return;
        }
        let (qx0, qx1, qz0, qz1) = (qx0 as i64, qx1 as i64, qz0 as i64, qz1 as i64);
        for z in qz0..=qz1 {
            let row = (z - self.cell_z0) * self.cols - self.cell_x0;
            for x in qx0..=qx1 {
                let cell = (row + x) as usize;
                let (start, end) = (self.cell_start[cell] as usize, self.cell_start[cell + 1] as usize);
                for &index in &self.cell_slots[start..end] {
                    let slot = &mut self.visited[index as usize];
                    if *slot == self.stamp {
                        continue;
                    }
                    *slot = self.stamp;
                    let r = &self.boxes[index as usize];
                    if r.max_x < min_x || r.min_x > max_x || r.max_z < min_z || r.min_z > max_z {
                        continue;
                    }
                    out.push(index);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(min_x: f64, min_z: f64, max_x: f64, max_z: f64) -> PlanBox {
        PlanBox { min_x, min_z, max_x, max_z }
    }

    #[test]
    fn visits_cells_z_major_and_each_record_once() {
        let mut grid = ObstacleGrid::new(vec![b(30.0, 0.0, 31.0, 1.0), b(0.0, 0.0, 50.0, 1.0), b(1.0, 30.0, 2.0, 31.0)], 24.0);
        let mut out = Vec::new();
        grid.query(-1.0, -1.0, 60.0, 60.0, &mut out);
        // cell (0,0) holds record 1; cell (1,0) holds 0 then 1 (1 already seen); cell (0,1) holds 2
        assert_eq!(out, vec![1, 0, 2]);
        grid.query(29.0, -1.0, 29.5, 2.0, &mut out);
        assert_eq!(out, vec![1]);
    }
}
