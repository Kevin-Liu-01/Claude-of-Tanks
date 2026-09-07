// Original folded armor primitives from independently measured source planes.
// In particular, the narrow shoulder joints are recessed seams, not boxes.
import * as THREE from 'three';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Plane = readonly [number, number, number, number];
type Point = readonly [number, number, number];
const LEFT_FOLDS: readonly Plane[] = [
  [-.831883, .5549508, .0005161, -2.4075299520],
  [-.7871537, .6165084, .0175047, -2.4435669555],
];
const RIGHT_FOLDS: readonly Plane[] = [
  [.7460244, .6657037, .0169157, -2.4225144001],
  [.6750713, .7377452, -.0032826, -2.4781216474],
];
const LEFT_WALLS: readonly Plane[] = [
  [-.9997715, -.0181984, -.0112177, -1.6123368975],
  [-.9999861, -.0005901, -.0052392, -1.6385148170],
];
const RIGHT_WALLS: readonly Plane[] = [
  [.9998561, -.0016498, -.0168827, -1.5786186289],
  [.999866, -.0000963, -.0163723, -1.5809328730],
];
const LEFT_SEAM: Plane = [0, .9999859, -.0053124, -2.0413542250];
const LEFT_OUT: Plane = [.9519869, .3060878, -.0055964, .8114854264];
const LEFT_IN: Plane = [-.9519868, -.3060879, .0055906, -.7706610034];
const RIGHT_SEAM: Plane = [0, .9999798, -.0063609, -2.0232203922];
const RIGHT_OUT: Plane = [-.9418702, .3359521, -.0041015, .6435834817];
const BODY_LEFT: Plane = [.0015682, .9999846, -.0053189, -2.0628018097];
const BODY_RIGHT: Plane = [.0019072, .999978, -.0063569, -2.0636663431];

function yAt(p: Plane, x: number, z: number): number {
  return -(p[0] * x + p[2] * z + p[3]) / p[1];
}
function xAt(p: Plane, y: number, z: number): number {
  return -(p[1] * y + p[2] * z + p[3]) / p[0];
}
function intersection(a: Plane, b: Plane, z: number): SectionPoint {
  const ad = a[2] * z + a[3], bd = b[2] * z + b[3];
  const det = a[0] * b[1] - b[0] * a[1];
  return [(a[1] * bd - b[1] * ad) / det, (b[0] * ad - a[0] * bd) / det];
}
function foldedRoof(side: number, x: number, z: number): number {
  const ys = (side < 0 ? LEFT_FOLDS : RIGHT_FOLDS).map(p => yAt(p, x, z));
  return side < 0 ? Math.max(...ys) : Math.min(...ys);
}
function wallX(side: number, y: number, z: number): number {
  const xs = (side < 0 ? LEFT_WALLS : RIGHT_WALLS).map(p => xAt(p, y, z));
  return side < 0 ? Math.max(...xs) : Math.min(...xs);
}
function outerCrown(side: number, z: number): SectionPoint {
  let x = wallX(side, 1.9, z);
  for (let i = 0; i < 5; i++) x = wallX(side, foldedRoof(side, x, z), z);
  return [x, foldedRoof(side, x, z)];
}
function seamPeak(side: number, z: number): SectionPoint {
  const folds = side < 0 ? LEFT_FOLDS : RIGHT_FOLDS, seam = side < 0 ? LEFT_OUT : RIGHT_OUT;
  const candidates = folds.map(p => intersection(p, seam, z));
  return candidates.reduce((a, b) => Math.abs(a[1] - foldedRoof(side, a[0], z))
    < Math.abs(b[1] - foldedRoof(side, b[0], z)) ? a : b);
}
function shoulderTop(side: number, z: number, inner: SectionPoint): SectionPoint[] {
  const crown = outerCrown(side, z), peak = seamPeak(side, z);
  const folds = side < 0 ? LEFT_FOLDS : RIGHT_FOLDS;
  const crease = intersection(folds[0], folds[1], z)[0];
  const low = Math.min(crown[0], peak[0]) + .0001, high = Math.max(crown[0], peak[0]) - .0001;
  const x = Math.max(low, Math.min(high, crease));
  if (side < 0) return [crown, [x, foldedRoof(side, x, z)], peak,
    intersection(LEFT_OUT, LEFT_SEAM, z), intersection(LEFT_IN, LEFT_SEAM, z),
    intersection(LEFT_IN, BODY_LEFT, z), inner];
  const inside = 1.3767 - .0021 * (z + .395);
  return [crown, [x, foldedRoof(side, x, z)], peak,
    intersection(RIGHT_OUT, RIGHT_SEAM, z), [inside, yAt(RIGHT_SEAM, inside, z)],
    [inside, yAt(BODY_RIGHT, inside, z)], inner];
}
function subdivide(a: SectionPoint, b: SectionPoint, c: SectionPoint): SectionPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const start = i < 3 ? a : b, end = i < 3 ? b : c, t = i < 3 ? i / 3 : (i - 3) / 3;
    return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
  });
}
function wallKnee(side: number, z: number, floor: SectionPoint,
  crown: SectionPoint, amount: number): SectionPoint {
  const walls = side < 0 ? LEFT_WALLS : RIGHT_WALLS;
  const crease = intersection(walls[0], walls[1], z);
  const y = Math.max(floor[1] + .0001, Math.min(crown[1] - .0001, crease[1]));
  const t = (y - floor[1]) / (crown[1] - floor[1]);
  const oldX = floor[0] + (crown[0] - floor[0]) * t;
  return [oldX + (wallX(side, y, z) - oldX) * amount, y];
}

/** Only the aft armor section changes. Forward cheeks and the sight well
 * retain their authored vertices, including all existing air witnesses. */
export function leclercXRearShoulderRing(z: number, ring: readonly SectionPoint[]): SectionPoint[] {
  const amount = Math.max(0, Math.min(1, (z + 1.4905) / .1305, (-.2867 - z) / .1083));
  const right = subdivide(ring[2], ring[3], ring[4]);
  const left = subdivide(ring[11], ring[10], ring[9]);
  if (amount > 0) {
    for (const [side, points] of [[1, right], [-1, left]] as const) {
      const target = shoulderTop(side, z, points[6]);
      for (let i = 0; i < points.length; i++) points[i] = [
        points[i][0] + (target[i][0] - points[i][0]) * amount,
        points[i][1] + (target[i][1] - points[i][1]) * amount];
    }
  }
  const bottom = (side: number, p: SectionPoint): SectionPoint =>
    [p[0] + (wallX(side, p[1], z) - p[0]) * amount, p[1]];
  const lowL = bottom(-1, ring[0]), lowR = bottom(1, ring[1]);
  const kneeL = wallKnee(-1, z, lowL, left[0], amount);
  const kneeR = wallKnee(1, z, lowR, right[0], amount);
  return [lowL, lowR, kneeR, ...right,
    ...ring.slice(5, 9), ...left.reverse(), kneeL];
}

const TERRACE: readonly Plane[] = [
  [0, 1, 0, -2.2418835163],
  [.9530224, .3028959, .0015467, -1.9500958716],
  [.969119, .245899, .0184926, -1.8297906226],
  [.4885399, .840222, .2352781, -2.3413233496],
  [.5255963, .1530203, -.8368592, -2.2719708986],
];
const LOWER_BEVEL: Plane = [.7260471, .6876392, -.0028059, -2.4366142373];
const FLOOR = 2.0686557293;

function terraceRoof(x: number, z: number): number {
  return Math.min(2.2418835163, Math.max(yAt(LOWER_BEVEL, x, z),
    Math.min(...TERRACE.map(p => yAt(p, x, z)))));
}
function terraceCuts(z: number, left: number, right: number): number[] {
  const planes = [...TERRACE, LOWER_BEVEL], xs = [left, right];
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) {
    const det = planes[i][0] * planes[j][1] - planes[j][0] * planes[i][1];
    if (Math.abs(det) < 1e-8) continue;
    const x = intersection(planes[i], planes[j], z)[0];
    if (x > left && x < right) xs.push(x);
  }
  return xs;
}
function terraceSpan(back: number, front: number): THREE.BufferGeometry {
  // A concealed 1 mm lap positively joins the retained central cover.
  const left = 1.088, right = Math.min(1.3952676,
    xAt(TERRACE[4], FLOOR, (back + front) / 2));
  const cuts = [...terraceCuts(back, left, right), ...terraceCuts(front, left, right)]
    .sort((a, b) => b - a).filter((x, i, xs) => !i || xs[i - 1] - x > .00001);
  return sectionSolid([back, front].map(z => ({ z, ring: [[left, FLOOR], [right, FLOOR],
    ...cuts.map(x => [x, Math.max(FLOOR + .0002, terraceRoof(x, z))] as const)],
  })));
}

export function addLeclercXRearTerrace(P: TankBuilderPort, pivot: Point): void {
  // Retain the original central raised cover and its roof height. Only its
  // generic outboard wall is replaced by the measured narrow folded skin.
  const core = sectionSolid([[-1.6801, .846], [-1.64, 1.089], [-.36, 1.089]].map(([z, right]) => ({
    z, ring: [[-.2289, 2.045], [right, 2.045], [right, 2.24775], [-.2289, 2.24775]],
  })));
  P.add('turret', core.translate(-pivot[0], -pivot[1], -pivot[2]));
  for (let back = -1.64; back < -.3712; back += .025) {
    const front = Math.min(-.3712, back + .025);
    const g = terraceSpan(back, front);
    P.add('turret', g.translate(-pivot[0], -pivot[1], -pivot[2]));
  }
}
