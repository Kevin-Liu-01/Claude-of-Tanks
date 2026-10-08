import { BufferAttribute, type BufferGeometry } from 'three';
import type { CanyonGround } from './horizonRedrock.ts';
import { continuedGroundSampler } from './horizonSurface.ts';

const DIVISIONS = 8;
const REACH = 16;
type Attributes = Record<string, BufferAttribute>;

/** Moisture and indirect lighting must cross the same join as geometry. */
export function continueHorizonFold(geometry: BufferGeometry, foldAt: (x: number, z: number) => number): void {
  const positions = geometry.getAttribute('position'), folds = new Int8Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const t = Math.max(0, Math.min(1, (Math.max(Math.abs(x), Math.abs(z)) - 512) / 80));
    const weight = 1 - t * t * (3 - 2 * t);
    if (weight > 0) folds[i] = Math.round(foldAt(x, z) * weight * 127);
  }
  geometry.setAttribute('fold', new BufferAttribute(folds, 1, true));
}

function detailWeight(x: number, z: number): number {
  const t = Math.max(0, Math.min(1, (Math.max(Math.abs(x), Math.abs(z)) - 514) / (REACH - 2)));
  return 1 - t * t * (3 - 2 * t);
}

/** Resolve the narrow ground join at the playable mesh's sampling scale.
 * A seated vertex is insufficient: a ten-metre chord can bridge a one-metre
 * dip between vertices and expose a raised lip. Keep the outer ring intact;
 * fade only this sub-cell correction over sixteen metres, in the same draw.
 * Shared subdivision vertices keep neighboring quads watertight. */
export function refineHorizonGroundSeam(geometry: BufferGeometry, columns: number, ground: CanyonGround): void {
  const attributes = geometry.attributes as Attributes, position = attributes.position;
  const stride = columns + 1, rows = position.count / stride;
  const arrays = Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, Array.from(attribute.array)]));
  const indices: number[] = [], vertices = new Map<string, number>();
  // (the time-to-battle lane, 2026-10-08) the continued ground with its residuals kept by point (horizonSurface.ts)
  const sample = continuedGroundSampler(ground);
  const groundHeights = new Float64Array(position.count);
  const sampled = new Uint8Array(position.count);
  function groundAtVertex(index: number): number {
    if (!sampled[index]) {
      groundHeights[index] = sample(position.getX(index), position.getZ(index));
      sampled[index] = 1;
    }
    return groundHeights[index];
  }
  function vertex(row: number, column: number, u: number, w: number): number {
    const key = `${row + w}:${(column + u) % columns}`;
    const existing = vertices.get(key);
    if (existing !== undefined) return existing;
    const a = row * stride + column, corners = [a, a + 1, a + stride, a + stride + 1];
    const weights = u + w <= 1 ? [1 - u - w, u, w, 0] : [0, 1 - w, 1 - u, u + w - 1];
    const blend = (data: ArrayLike<number>, size: number, axis: number): number =>
      weights.reduce((sum, weight, k) => sum + data[corners[k] * size + axis] * weight, 0);
    const x = blend(position.array, 3, 0), z = blend(position.array, 3, 2);
    const weight = row === 0 && w === 0 ? 0 : detailWeight(x, z);
    // (the time-to-battle lane, 2026-10-08) a vertex the correction does not reach (weight 0: a third of them) keeps its
    // blends exactly — a blend sums from +0, so it is never -0, and `blend + finite * 0` is the blend itself — so its
    // ground samples (five, each up to three height evaluations) are not taken
    let y = blend(position.array, 3, 1);
    if (weight !== 0) {
      const base = weights.reduce((sum, value, k) => sum + groundAtVertex(corners[k]) * value, 0);
      y += (sample(x, z) - base) * weight;
    }
    const id = arrays.position.length / 3;
    for (const [name, attribute] of Object.entries(attributes)) {
      if (name === 'position') { arrays[name].push(x, y, z); continue; }
      if (name === 'normal') {
        let nx = blend(attribute.array, 3, 0), ny = blend(attribute.array, 3, 1), nz = blend(attribute.array, 3, 2);
        if (weight !== 0) {
          const e = 128 / 96;
          const gx = sample(x - e, z) - sample(x + e, z), gy = 2 * e;
          const gz = sample(x, z - e) - sample(x, z + e);
          const length = Math.hypot(gx, gy, gz);
          nx = nx * (1 - weight) + gx / length * weight;
          ny = ny * (1 - weight) + gy / length * weight;
          nz = nz * (1 - weight) + gz / length * weight;
        }
        const inverse = 1 / Math.hypot(nx, ny, nz);
        arrays[name].push(nx * inverse, ny * inverse, nz * inverse);
      } else for (let axis = 0; axis < attribute.itemSize; axis++) arrays[name].push(blend(attribute.array, attribute.itemSize, axis));
    }
    vertices.set(key, id);
    return id;
  }
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns; column++) {
    const a = row * stride + column, corners = [a, a + 1, a + stride, a + stride + 1];
    const edgeOut = Math.min(...corners.slice(row === 0 ? 2 : 0).map(i =>
      Math.max(Math.abs(position.getX(i)), Math.abs(position.getZ(i))) - 512));
    if (edgeOut >= REACH) {
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
      continue;
    }
    const radial = row === 0 ? 1 : 2;
    for (let j = 0; j < radial; j++) for (let i = 0; i < DIVISIONS; i++) {
      const v00 = vertex(row, column, i / DIVISIONS, j / radial);
      const v01 = vertex(row, column, (i + 1) / DIVISIONS, j / radial);
      const v10 = vertex(row, column, i / DIVISIONS, (j + 1) / radial);
      const v11 = vertex(row, column, (i + 1) / DIVISIONS, (j + 1) / radial);
      indices.push(v00, v10, v01, v01, v10, v11);
    }
  }
  for (const [name, attribute] of Object.entries(attributes)) {
    const Constructor = attribute.array.constructor as new (values: number[]) => typeof attribute.array;
    geometry.setAttribute(name, new BufferAttribute(new Constructor(arrays[name]), attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
}
