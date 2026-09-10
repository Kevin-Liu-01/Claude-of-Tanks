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

/** Construction only. Keep winding, row and buffer budgets.
 * The buried first row stays exact; every other row keeps the canyon mouths
 * open. Lowering only a skyline row would leave another mountain in the way. */
export function shapeRedrockOutland(ring: CanyonRing, ground?: CanyonGround): void {
  const columns = ring.heights.length / ring.rows.length;
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
