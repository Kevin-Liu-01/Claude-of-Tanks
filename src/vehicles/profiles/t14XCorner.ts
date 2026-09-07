// First-party closed armor junction built from independently measured plane
// normals and scalar ray witnesses, not source vertices or source topology.
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { sectionSolid } from './sectionSolid.ts';

type Point = readonly [number, number];
type Plane = readonly [number, number, number];
type Envelope = number | { kind: 'min' | 'max'; left: Envelope; right: Envelope };
type SurfaceCell = { ring: Point[]; plane: number };

function measuredPlane(x: number, y: number, z: number, nx: number, ny: number, nz: number): Plane {
  return [-nx / nz, -ny / nz, z + nx / nz * x + ny / nz * y];
}

const normalPlane = (nx: number, ny: number, nz: number, d: number): Plane => [-nx / nz, -ny / nz, d / nz];

// Object_11: outer cheek, two inboard bevels, near-vertical jamb, pocket
// backing/floor, underside of the lintel, and its exterior upper facet.
const PLANES: readonly Plane[] = [
  measuredPlane(1, 2.19, .791668, .46929, .69714, .54199),
  measuredPlane(1.12, 2.06, .749819, .93538, .34363, .08356),
  measuredPlane(1.12, 2.19, .474258, .79802, .54180, .26383),
  measuredPlane(1.13, 2.19, .404111, .99151, .12804, .02269),
  measuredPlane(1.15, 2.19, .266465, .51765, -.14894, .84253),
  measuredPlane(1.15, 2.06, .405187, .20908, .95008, .23158),
  measuredPlane(1.12, 2.29, .372320, .11148, -.96805, .22461),
  measuredPlane(1.12, 2.34, .335693, .67783, .42223, .60188),
  normalPlane(.911696521, .386487600, .139415884, 1.923884334),
  normalPlane(.666079182, 0, .745881039, .950300086),
  normalPlane(.607501851, -.309797007, .731414599, .228276591),
  normalPlane(-.486206580, .039392265, .872955561, -.400989960),
  normalPlane(-.693657562, .105197182, .712581742, -.553999050),
  normalPlane(.197613841277, .978454046743, .059803412513, 2.290997012678),
  normalPlane(.696601645486, .482808912872, .530699256791, 2.108137618956),
  normalPlane(.621615094899, .540566932031, .566905693911, 2.146295461830),
];

const at = (plane: Plane, point: Point) => plane[0] * point[0] + plane[1] * point[1] + plane[2];

const minimum = (...terms: Envelope[]): Envelope => terms.reduce((left, right) => ({ kind: 'min', left, right }));
const maximum = (...terms: Envelope[]): Envelope => terms.reduce((left, right) => ({ kind: 'max', left, right }));
const JAMB = minimum(0, maximum(minimum(1, 8), 2), 3);
const FLOOR = maximum(minimum(4, maximum(9, 10)), minimum(5, 13));
const POCKET = minimum(maximum(FLOOR, minimum(11, 12)), 14, 15);
const LINTEL = minimum(6, maximum(7, 15), 14);
const ENVELOPE = maximum(JAMB, POCKET, LINTEL);

export function sourceCornerZ(x: number, y: number): number {
  const p = PLANES.map(plane => at(plane, [x, y]));
  const jamb = Math.min(p[0], Math.max(Math.min(p[1], p[8]), p[2]), p[3]);
  const floor = Math.max(Math.min(p[4], Math.max(p[9], p[10])), Math.min(p[5], p[13]));
  const pocket = Math.min(Math.max(floor, Math.min(p[11], p[12])), p[14], p[15]);
  const lintel = Math.min(p[6], Math.max(p[7], p[15]), p[14]);
  return Math.max(jamb, pocket, lintel);
}

function cleanContour(points: Point[]): Point[] {
  const unique = points.filter((p, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    return Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 1e-6;
  });
  return unique.filter((b, i) => {
    const a = unique[(i + unique.length - 1) % unique.length], c = unique[(i + 1) % unique.length];
    return Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) > 1e-10;
  });
}

function clippedContour(points: readonly Point[], line: Plane, side: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = side * at(line, a), db = side * at(line, b);
    if (da >= 0) result.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return cleanContour(result);
}

function validContour(points: readonly Point[]): boolean {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return points.length >= 3 && area > 1e-8;
}

function chooseCells(left: number, right: SurfaceCell, kind: 'min' | 'max'): SurfaceCell[] {
  if (left === right.plane) return [right];
  const a = PLANES[left], b = PLANES[right.plane];
  const line: Plane = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const direction = kind === 'max' ? 1 : -1;
  return [
    { ring: clippedContour(right.ring, line, direction), plane: left },
    { ring: clippedContour(right.ring, line, -direction), plane: right.plane },
  ].filter(cell => validContour(cell.ring));
}

function envelopeCells(envelope: Envelope, ring: Point[]): SurfaceCell[] {
  if (typeof envelope === 'number') return [{ ring, plane: envelope }];
  return envelopeCells(envelope.left, ring).flatMap(left =>
    envelopeCells(envelope.right, left.ring).flatMap(right => chooseCells(left.plane, right, envelope.kind)));
}

function junctionCells(): SurfaceCell[] {
  const domains: Point[][] = [
    [[.99, 1.98], [1.18, 2.00169], [1.18, 2.56], [.99, 2.56]],
    [[1.18, 2.00169], [1.34, 2.01995], [1.34, 2.30], [1.18, 2.30]],
  ];
  // Clip only active envelope branches. Splitting at every pair of source
  // planes creates thousands of redundant internal cells without changing
  // any visible surface. This retains exact analytic junctions, not samples.
  return domains.flatMap(ring => envelopeCells(ENVELOPE, ring));
}

export function addT14CornerJunction(P: TankBuilderPort, side: number, ringY: number, ringZ: number): void {
  for (const cell of junctionCells()) {
    const ring = cell.ring.map(([x, y]): Point => [side * x, y]);
    if (side < 0) ring.reverse();
    const geometry = sectionSolid([{ z: side > 0 ? -.085 : -.21, ring }, { z: 1, ring }]);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) > 0) positions.setZ(i, at(PLANES[cell.plane], [Math.abs(positions.getX(i)), positions.getY(i)]));
    }
    geometry.translate(0, -ringY, -ringZ);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    P.add('turret', geometry);
  }
}
