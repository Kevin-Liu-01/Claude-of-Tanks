// Convex cells orient their faces away from an interior point: the vertex mean, never the midpoint of their bounding
// box (which can lie outside a thin wedge or a slanted slice).
import type { AnatomyCalibrationCell } from './combatAnatomyCalibrationRegistry.ts';

export function calibrationOrientationPoint(source: AnatomyCalibrationCell): number[] {
  const interiorPoint = source.interiorPoint;
  const mean = [0, 1, 2].map(axis => source.vertices.reduce(
    (sum, vertex) => sum + vertex[axis], 0,
  ) / source.vertices.length);
  if (interiorPoint === undefined) {
    if (source.sourceStock !== undefined) throw new Error('Independent collision stock is missing its interior point');
    // 243 (owner: "regenerate all hitboxes ... make them work"): the generated shell slices kept the bounds midpoint,
    // and where a slanted slice does not contain it a face pointed inward: its half-plane cut up to 0.78 m out of the
    // slice traceTank tests (24 vehicles, 36 faces; mbt70, m1a2_abrams, challenger1_mk3, strv103a, challenger3 ...).
    return mean;
  }
  if (interiorPoint.length !== 3 || mean.some((value, axis) => (
    !Number.isFinite(value) || !Number.isFinite(interiorPoint[axis])
    || Math.abs(value - interiorPoint[axis]) > 1e-9
  ))) throw new Error('Independent collision stock requires its finite vertex-mean interior point');
  return mean;
}

interface StockFace {
  readonly indices: readonly number[];
  readonly normal: readonly number[];
  readonly constant: number;
}

interface StockCell {
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly vertices: readonly (readonly number[])[];
  readonly faces: readonly StockFace[];
}

/** A covering cell must contain the original face vertices, hence overlap
 * their owner's bounds. Compute this necessary condition once per stock,
 * retaining the same tolerance as the exact point test below. */
export function stockCollisionCoverCandidates<T extends StockCell>(
  cell: T, cells: readonly T[],
): T[] {
  const tolerance = 1e-9;
  return cells.filter(other => other !== cell
    && other.min[0] <= cell.max[0] + tolerance && other.max[0] >= cell.min[0] - tolerance
    && other.min[1] <= cell.max[1] + tolerance && other.max[1] >= cell.min[1] - tolerance
    && other.min[2] <= cell.max[2] + tolerance && other.max[2] >= cell.min[2] - tolerance);
}

function containsStockPoint(cell: StockCell, point: readonly number[]): boolean {
  const tolerance = 1e-9;
  if (point.some((value, axis) => value < cell.min[axis] - tolerance
    || value > cell.max[axis] + tolerance)) return false;
  return cell.faces.every(face => face.normal.reduce(
    (distance, value, axis) => distance + value * point[axis], face.constant,
  ) <= tolerance);
}

/** Hide only fully covered faces. A shared Z coordinate is not evidence that
 * separate left/right cheek fronts are internal. Partial cover stays visible. */
export function stockCollisionFaceCovered(
  cell: StockCell, face: StockFace, cells: readonly StockCell[],
): boolean {
  const outside = face.indices.map(index => cell.vertices[index].map(
    (value, axis) => value + face.normal[axis] * 1e-6,
  ));
  return cells.some(other => other !== cell
    && face.indices.every(index => containsStockPoint(other, cell.vertices[index]))
    && outside.every(point => containsStockPoint(other, point)));
}
