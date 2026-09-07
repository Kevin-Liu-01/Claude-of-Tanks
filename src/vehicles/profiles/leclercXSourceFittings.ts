// Independently constructed folded guards and stepped rectangular antenna
// stocks. Dimensions and intersecting planes are scalar source measurements;
// no reference topology or source vertex contour is used by these primitives.
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Plane = readonly [y: number, z: number, d: number];
type Pair = readonly [number, number];
type Bounds = readonly [left: number, right: number, rear: number, front: number];
type Origin = readonly [number, number, number];
const BACK = 3.34098005295, FLOOR = .8672724962;
const TOP: Plane = [.9553865, .2953585, -2.1843498386];
const FACE: Plane = [-.1894168, .9818968, -3.2634320246];
const LIP_FACE: Plane = [-.1894245, .9818953, -3.2760209476];
const LIP_LOW: Plane = [-.9818966, -.1894178, 1.8125791857];
const LIP_TOP: Plane = [.9818966, .1894178, -1.8394601052];

function intersection(a: Plane, b: Plane): Pair {
  const det = a[0] * b[1] - b[0] * a[1];
  return [(a[1] * b[2] - b[1] * a[2]) / det,
    (b[0] * a[2] - a[0] * b[2]) / det];
}

function guard(left: number, right: number) {
  // The underside is a separate material island (Object9), but closes the
  // complete source body at FLOOR. It must not be mistaken for shell air.
  const roof = -(TOP[1] * BACK + TOP[2]) / TOP[0];
  const frontBottom = -(FACE[0] * FLOOR + FACE[2]) / FACE[1];
  const yz: Pair[] = [[FLOOR, BACK], [roof, BACK], intersection(TOP, LIP_TOP),
    intersection(LIP_TOP, LIP_FACE), intersection(LIP_FACE, LIP_LOW),
    intersection(LIP_LOW, FACE), [FLOOR, frontBottom]];
  const ring = yz.map(([y, z]) => [-z, y] as const);
  return sectionSolid([{ z: left, ring }, { z: right, ring }]).rotateY(Math.PI / 2);
}

export function addLeclercXFrontGuards(P: TankBuilderPort): void {
  // The two measured source spans are translated, not mirrored about X=0.
  for (const [side, left, right] of [[-1, -1.6509963, -.9320235], [1, .9502472, 1.66922]])
    P.addMudguard(`leclerc_x_bow_guard_${side}`, 'hullDetail', guard(left, right));
}

function rectangularStock(rows: readonly (readonly [y: number, bounds: Bounds])[]) {
  return sectionSolid(rows.map(([y, [left, right, rear, front]]) => ({ z: y,
    ring: [[left, -front], [right, -front], [right, -rear], [left, -rear]],
  }))).rotateX(-Math.PI / 2);
}

function broadStock(y: number): Bounds {
  // Four main planes of the source's wide, gently tapered rectangular neck.
  return [(-1.1946906445 + .0237783 * y) / .9997172,
    (-.9721121008 - .0407553 * y) / .9991692,
    (-1.0714578084 + .0330132 * y) / .9994549,
    (-.7782625365 - .0520949 * y) / .9986421];
}

function upperStock(y: number): Bounds {
  return [(-1.1332663079 + .0066317 * y) / .999978,
    (-1.0788119619 - .0063261 * y) / .99998,
    (-1.0079139874 + .0139156 * y) / .9999032,
    (-.8943948360 - .0130966 * y) / .9999142];
}

function antennaParts() {
  const base: (readonly [number, Bounds])[] = [
    [2.2042987, [-1.166983, -1.0444653, -1.0226536, -.877202]],
    [2.3006, [-1.16458, -1.05713, -1.01989, -.89225]],
    [2.320832, [-1.14409, -1.06746, -.9994, -.89979]],
  ];
  return [rectangularStock(base),
    rectangularStock([[2.320832, broadStock(2.320832)], [2.5443, broadStock(2.5443)]]),
    rectangularStock([[2.5443, broadStock(2.5443)], [2.5629001, upperStock(2.5629001)]]),
    rectangularStock([[2.5629001, upperStock(2.5629001)], [2.9084992, upperStock(2.9084992)]]),
    rectangularStock([2.9084992, 3.0665929317].map(y => [y,
      [-1.1098231, -1.101625, -.9631223, -.936733]] as const))];
}

export function addLeclercXAntennaStocks(P: TankBuilderPort, pivot: Origin): void {
  for (const shift of [0, 2.082124]) for (const part of antennaParts())
    P.addEquipment('turretDetail', part, shift - pivot[0], -pivot[1], -pivot[2]);
}
