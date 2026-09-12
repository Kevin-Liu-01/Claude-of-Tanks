/** Redrock's canyon continues beyond the playable square on the existing ring.
 * Shared geological shape, not another mountain/noise profile or scene owner. */
import { sampleRedrockCanyon } from './redrockCanyon.ts';
import type { Color } from 'three';

interface CanyonRing {
  rows: readonly { skirt?: boolean }[];
  positions: Float32Array;
  heights: Float32Array;
  maxHeight: number;
}

export interface CanyonGround {
  getHeightAt(x: number, z: number): number;
}

interface SeamPoint { angle: number; x: number; z: number; height: number }

function seamPoint(angle: number, ground: CanyonGround): SeamPoint {
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const scale = 511.5 / Math.max(Math.abs(cosine), Math.abs(sine));
  const x = cosine * scale, z = sine * scale;
  return { angle, x, z, height: ground.getHeightAt(x, z) };
}

function seamChordError(a: SeamPoint, b: SeamPoint, ground: CanyonGround): number {
  let error = 0;
  for (let sample = 1; sample < 8; sample++) {
    const t = sample / 8, point = seamPoint(a.angle + (b.angle - a.angle) * t, ground);
    const dx = b.x - a.x, dz = b.z - a.z;
    const along = ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz);
    error = Math.max(error, Math.abs(point.height - (a.height + (b.height - a.height) * along)));
  }
  return error;
}

/** Reuse the same seam vertices at the conditioned road shoulder's bends.
 * Every angular station stays inside its original half-cell, preserving order
 * and the outer/buried rings. Three bounded construction passes add no mesh,
 * index, retained buffer, texture or per-frame work. */
function refineCanyonSeam(ring: CanyonRing, columns: number, ground: CanyonGround, pinSquareCorners = false): void {
  const step = Math.PI * 2 / columns;
  const points = Array.from({ length: columns }, (_, column) => seamPoint(column * step, ground));
  const corners = new Set<number>();
  if (pinSquareCorners) for (let corner = 0; corner < 4; corner++) {
    const angle = Math.PI / 4 + corner * Math.PI / 2;
    const column = Math.round(angle / step);
    points[column] = seamPoint(angle, ground);
    corners.add(column);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let column = 0; column < columns; column++) {
      if (corners.has(column)) continue;
      const previous = points[(column + columns - 1) % columns];
      const next = points[(column + 1) % columns];
      const a = column === 0 ? { ...previous, angle: previous.angle - Math.PI * 2 } : previous;
      const b = column === columns - 1 ? { ...next, angle: next.angle + Math.PI * 2 } : next;
      let selected = points[column];
      let best = Math.max(seamChordError(a, selected, ground), seamChordError(selected, b, ground));
      if (best <= 2) continue;
      for (let offset = -4; offset <= 4; offset++) {
        const candidate = seamPoint((column + offset * .1) * step, ground);
        const error = Math.max(seamChordError(a, candidate, ground), seamChordError(candidate, b, ground));
        if (error < best - .000001) { best = error; selected = candidate; }
      }
      points[column] = selected;
    }
  }
  for (let column = 0; column < columns; column++) {
    const index = columns + column, offset = index * 3, point = points[column];
    ring.positions[offset] = point.x; ring.positions[offset + 2] = point.z;
    // Seat the stored Float32 location, rather than its unrounded proposal.
    const height = ground.getHeightAt(ring.positions[offset], ring.positions[offset + 2]);
    ring.positions[offset + 1] = height; ring.heights[index] = height;
  }
}

/** Seat only the existing first positive row on the conditioned playable rim.
 * The buried closing anchor and every farther landform remain byte exact. */
export function seatHorizonTerrainSeam(ring: CanyonRing, ground: CanyonGround): void {
  // Four existing stations lie within .375 of a cell of the square corners.
  // Pin those stations so a long outside chord cannot bridge a corner ridge.
  refineCanyonSeam(ring, ring.heights.length / ring.rows.length, ground, true);
  ring.maxHeight = Math.max(1, ...ring.heights);
}

/** Construction only. Keep winding, row and buffer budgets.
 * The buried first row stays exact; every other row keeps the canyon mouths
 * open. Lowering only a skyline row would leave another mountain in the way. */
export function shapeRedrockOutland(ring: CanyonRing, ground?: CanyonGround): void {
  const columns = ring.heights.length / ring.rows.length;
  // The restored 1049e4e mesa rows start their first landform only ~70 m
  // outside the playable rim, so the four square corners must be seam
  // stations themselves; a chord across a corner otherwise climbs 3 m above
  // the conditioned ground before the next row is reached.
  if (ground) refineCanyonSeam(ring, columns, ground, true);
  ring.maxHeight = 1;
  for (let index = columns; index < ring.heights.length; index++) {
    const offset = index * 3;
    // Seat the existing first positive row half a metre inside the map edge.
    // Its old100m exterior setback left a trench behind high canyon walls.
    // No other XZ coordinate moves and the buried anchor still closes the rim.
    const seam = index < columns * 2;
    if (seam) {
      const scale = 511.5 / Math.max(Math.abs(ring.positions[offset]), Math.abs(ring.positions[offset + 2]));
      ring.positions[offset] *= scale;
      ring.positions[offset + 2] *= scale;
    }
    const x = ring.positions[offset], z = ring.positions[offset + 2];
    const height = seam && ground ? ground.getHeightAt(x, z) : sampleRedrockCanyon(x, z);
    ring.heights[index] = height;
    ring.positions[offset + 1] = height;
    ring.maxHeight = Math.max(ring.maxHeight, ring.heights[index]);
  }
}

/** Baked sunlit alluvium, before the existing directional shading and haze.
 * The generic mesa's dark base/forest mixture is appropriate for red cliffs,
 * not the low sandy continuation of Redrock's ochre playable floor. These are
 * linear working-space colors: the warm hue follows its grass/dirt palette,
 * while the lift represents sunlit ground in the existing unlit material.
 * Smooth height/slope limits keep elevated and steep rock on its old palette.
 * Mutates the caller's color only; no texture, shader, RNG or frame-loop work. */
export function tintRedrockOutlandFloor(color: Color, height: number, slope: number): void {
  if (height < 0) return; // Buried closing anchor is not exposed alluvium.
  const heightT = Math.max(0, Math.min(1, (height - 10) / 32));
  const slopeT = Math.max(0, Math.min(1, (slope - 0.12) / 0.48));
  const low = 1 - heightT * heightT * (3 - 2 * heightT);
  const gentle = 1 - slopeT * slopeT * (3 - 2 * slopeT);
  const weight = low * gentle;
  if (weight === 0) return;
  color.r += (0.74 - color.r) * weight;
  color.g += (0.38 - color.g) * weight;
  color.b += (0.14 - color.b) * weight;
}
