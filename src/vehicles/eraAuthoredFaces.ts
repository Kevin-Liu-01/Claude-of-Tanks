import { BufferGeometry, Vector3 } from 'three';

/** Exact optional ERA faces, selected from this first-party part's own triangles.
 * Indices are draw-stream offsets, so normal geometry transforms preserve them.
 * An empty list denotes attached expendable furniture, not protective surface.
 * Unannotated legacy geometry retains the existing point-cloud fitting path.
 */
export function authoredEraSurfaces(part: BufferGeometry): number[][][] | null {
  const starts: readonly number[] | null | undefined = part.userData.eraHitFaceVertexStarts;
  if (starts == null) return null;
  if (!Array.isArray(starts)) throw new TypeError('ERA face starts must be an array');
  if (new Set(starts).size !== starts.length) throw new Error('Duplicate authored ERA face');
  if (!starts.length) return [];
  const positions = part.getAttribute('position');
  if (!positions || positions.itemSize !== 3) throw new Error('ERA faces require 3D positions');
  const count = part.index?.count ?? positions.count;
  const last = Math.min(count, part.drawRange.start + part.drawRange.count);
  return starts.map(start => {
    if (!Number.isInteger(start) || start % 3 !== 0 || start < part.drawRange.start
        || start < 0 || start + 3 > last) throw new Error('ERA face outside actual draw triangles');
    const points = [0, 1, 2].map(offset => {
      const index = part.index ? part.index.getX(start + offset) : start + offset;
      if (!Number.isInteger(index) || index < 0 || index >= positions.count) {
        throw new Error('ERA face references an absent vertex');
      }
      const point = new Vector3().fromBufferAttribute(positions, index);
      if (!point.toArray().every(Number.isFinite)) throw new Error('Nonfinite authored ERA vertex');
      return point;
    });
    const area = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    if (area.lengthSq() <= 1e-20) throw new Error('Degenerate authored ERA triangle');
    // The existing plate API accepts quads; a repeated final vertex retains
    // the exact triangle, winding and empty neighboring space without a fit.
    return [points[0].toArray(), points[1].toArray(), points[2].toArray(), points[2].toArray()];
  });
}
