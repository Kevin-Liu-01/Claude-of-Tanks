// Source-specific port platform and recessed casing, authored as independent
// closed lofts from measured plane equations and assembly dimensions.
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Plane = readonly [number, number, number, number];
const LOW = 2.0037911, FLOOR = 2.0741854, LIP = 2.1754804, CROWN = 2.213315;

function planeY(plane: Plane, x: number, z: number): number {
  return -(plane[0] * x + plane[2] * z + plane[3]) / plane[1];
}

function through(nx: number, ny: number, nz: number, x: number, y: number, z: number): Plane {
  return [nx, ny, nz, -nx * x - ny * y - nz * z];
}

function add(P: TankBuilderPort, pivot: Point, bucket: string, geometry: ReturnType<typeof sectionSolid>): void {
  P.add(bucket, geometry.translate(-pivot[0], -pivot[1], -pivot[2]));
}

function block(left: number, right: number, back: number, front: number,
  bottom: (x: number, z: number) => number, top: (x: number, z: number) => number) {
  return sectionSolid([back, front].map(z => ({ z, ring: [[left, bottom(left, z)],
    [right, bottom(right, z)], [right, top(right, z)], [left, top(left, z)]],
  })));
}

function platform(P: TankBuilderPort, pivot: Point): void {
  const rearRoof: Plane = [.0027883, .9999822, -.0052701, -2.3614428622];
  const top = (x: number, z: number) => planeY(rearRoof, x, z);
  add(P, pivot, 'turret', block(-1.0710298, -.2313, -1.7502716, -.3680395, () => 2.02, top));
  const crown: Plane = [.0037537, -.999993, 0, 2.3675262255];
  const face: Plane = [.0075185, -.6960014, -.718001, 1.5389027442];
  const rows = [-.3680395, -.1590037, .0447233];
  add(P, pivot, 'turret', sectionSolid(rows.map(z => {
    const t = Math.max(0, (z + .1590037) / .203727);
    const left = -1.0710298 + .0063344 * t, right = -.6933072 + .0015093 * t;
    const upper = (x: number) => Math.min(planeY(crown, x, z), planeY(face, x, z));
    return { z, ring: [[left, 2.02], [right, 2.02], [right, upper(right)], [left, upper(left)]] };
  })));
}

function bevel(P: TankBuilderPort, pivot: Point): void {
  const rear: Plane = [.3770486, -.9261773, .0054782, 2.5055373758];
  const outer: Plane = [.4552556, -.8903342, -.0068799, 2.4961531449];
  const inner: Plane = [.4882148, -.8726761, .0090913, 2.5071153812];
  const rows = [[-1.7502, -1.07116], [-1.65, -1.20674], [-1.5667, -1.31944],
    [-1.5, -1.37045], [-1.3515, -1.36131], [-1.1, -1.31852],
    [-.9787, -1.31727], [-.6, -1.30741], [-.3681, -1.30133]];
  const roof = (x: number, z: number) => z < -.9787 ? planeY(rear, x, z)
    : Math.max(planeY(outer, x, z), planeY(inner, x, z));
  add(P, pivot, 'turret', sectionSolid(rows.map(([z, left]) => {
    const right = -1.0710298, xs = [left, (left + right) / 2, right];
    return { z, ring: [[left, 2.02], [right, 2.02],
      ...[...xs].reverse().map(x => [x, roof(x, z)] as const)] };
  })));
}

function attachedCovers(P: TankBuilderPort, pivot: Point): void {
  const face: Plane = [-.0075189, .6960009, .7180016, -1.5471873680];
  // Separate approximately 8.3 mm normal-thickness skin over the steep
  // forward ledge; the plate is not another tall rectangular roof block.
  const top = (x: number, z: number) => planeY(face, x, z);
  add(P, pivot, 'turretDetail', block(-1.04313, -.71124, -.1520, .04936,
    (x, z) => top(x, z) - .013, top));
  // Object25/29 jointly close this tall clipped case beside the rear rack.
  const roof: Plane = [0, .4373188, .8993065, .3033708480];
  add(P, pivot, 'turretDetail', sectionSolid([-1.5791761, -1.4198129, -1.3369637].map(z => {
    const high = Math.min(2.2260103, planeY(roof, 0, z));
    const leftTop = (-1.5214254202 + .0088654 * high) / .9999607;
    return { z, ring: [[-1.5055575, 1.7965186], [-1.2000661, 1.7965186],
      [-1.2000661, high], [leftTop, high]] };
  })));
}

const CHAMFERS = [
  [-.3910303, -.9203778, -.0000003, 1.6441435989],
  through(-.3687882, -.929476, .0083466, -1, 2.1965083, .1),
  through(-.3756579, -.926271, .030053, -1, 2.2106648, .2),
  through(-.3787564, -.9254904, .0033401, -1, 2.2034427, .3),
  through(-.367978, -.9295718, .0220994, -1, 2.2090183, .5),
  through(-.1911156, -.96521, .1784502, -1, 2.2116717, .6),
] as const;

function chamfer(z: number): Plane {
  if (z < -.138) return CHAMFERS[0];
  if (z < .141) return CHAMFERS[1];
  if (z < .2144159) return CHAMFERS[2];
  if (z < .424431) return CHAMFERS[3];
  if (z < .573) return CHAMFERS[4];
  return CHAMFERS[5];
}

function outerLeft(z: number): number {
  if (z < -.166) return -1.1456072;
  if (z < .6333178) return -1.171 + .014 * z;
  return -1.1610206 + (z - .6333178) * .39;
}

function innerRight(z: number): number { return (-.3168559405 + .0038352 * z) / .9999926; }
function outerRight(z: number): number { return (-.2751509164 + .0038352 * z) / .9999926; }

function leftWall(P: TankBuilderPort, pivot: Point, back: number, front: number): void {
  // Original ruled wall: its inner vertical face terminates at LIP, then
  // the measured canted top rises toward the horizontal outer crown.
  const p = chamfer((back + front) / 2);
  add(P, pivot, 'turretDetail', sectionSolid([back, front].map(z => {
    const inner = -(p[1] * LIP + p[2] * z + p[3]) / p[0];
    const crest = -(p[1] * CROWN + p[2] * z + p[3]) / p[0];
    const outer = Math.min(outerLeft(z), crest - .002);
    return { z, ring: [[outer, LOW], [inner, LOW], [inner, LIP], [crest, CROWN], [outer, CROWN]] };
  })));
}

function rightWall(P: TankBuilderPort, pivot: Point): void {
  const p: Plane = [-.9374786, .3480243, .0035955, -1.0541678726];
  add(P, pivot, 'turretDetail', sectionSolid([-.3820141, .9785733].map(z => {
    const inner = innerRight(z), outer = outerRight(z);
    const crest = -(p[1] * CROWN + p[2] * z + p[3]) / p[0];
    return { z, ring: [[inner, LOW], [outer, LOW], [outer, CROWN],
      [crest, CROWN], [inner, planeY(p, inner, z)]] };
  })));
}

function outerFold(P: TankBuilderPort, pivot: Point): void {
  // The low outboard lip is distinct from the taller well rim. The thin
  // cap bridges to that rim, retaining clearance beneath the exposed lip.
  const rear: Plane = [-.9996966, .0241883, -.0046446, -1.2487777084];
  const front = through(-.9440407, .0021408, .3298221, -1.1345711, 2.196, .8);
  const upper: Plane = [-.0029603, -.9999954, .0006805, 2.1937212549];
  for (const [back, end, wall] of [[-.3662864, .6160223, rear], [.6160223, 1.0095575, front]] as const) {
    const sections = [back, end].map(z => {
      const roof = planeY(upper, -1.15, z);
      const outer = -(wall[1] * roof + wall[2] * z + wall[3]) / wall[0];
      const lowX = -(wall[1] * LOW + wall[2] * z + wall[3]) / wall[0];
      const inner = outerLeft(z) + .004;
      return { z, ring: [[lowX, LOW], [lowX + .003, LOW], [outer + .003, roof - .008],
        [inner, roof - .008], [inner, roof], [outer, roof]] as const };
    });
    add(P, pivot, 'turretDetail', sectionSolid(sections));
  }
}

function wellEnds(P: TankBuilderPort, pivot: Point): void {
  add(P, pivot, 'turretDetail', block(-1.1456072, -.27625, -.3820141, -.3118059,
    () => LOW, () => CROWN));
  add(P, pivot, 'turretDetail', block(-1.005, -.3167, -.3118059, -.2818,
    () => LOW, (_x, z) => CROWN - (z + .3118059) * (CROWN - LIP) / .0300059));
  const p: Plane = [-.0003473, -.9634062, .2680454, 1.9216483047];
  add(P, pivot, 'turretDetail', block(-.83567, -.314, .649, .7855722,
    () => LOW, (x, z) => Math.min(CROWN, planeY(p, x, z))));
  add(P, pivot, 'turretDetail', sectionSolid([.7855722, .9785733, 1.018326].map(z => {
    const left = outerLeft(z), right = outerRight(z);
    const top = z <= .9785733 ? CROWN : 2.17099;
    return { z, ring: [[left, LOW], [right, LOW], [right, top], [left, top]] };
  })));
}

function wellFloor(P: TankBuilderPort, pivot: Point): void {
  add(P, pivot, 'turretDetail', sectionSolid([-.3820141, -.166, .6333178, .9785733].map(z => {
    const left = outerLeft(z), right = outerRight(z);
    return { z, ring: [[left, LOW], [right, LOW], [right, FLOOR], [left, FLOOR]] };
  })));
  const crown: Plane = [.0036394, .999945, .0098409, -2.2052025588];
  const top = (x: number, z: number) => planeY(crown, x, z);
  // Source's rear service block is distinct from the taller adjacent ledge.
  // The supplied left wall stops about half a millimetre short of the
  // neighboring platform. A concealed 1.45 mm extension closes that source
  // assembly gap while keeping the exterior roof and all main faces fixed.
  add(P, pivot, 'turretDetail', block(-.6941, -.31815, -.24004, .01389,
    (x, z) => top(x, z) - .05276, top));
}

export function addLeclercXPortRoof(P: TankBuilderPort, pivot: Point): void {
  platform(P, pivot); bevel(P, pivot); attachedCovers(P, pivot); wellFloor(P, pivot);
  for (const [a, b] of [[-.3820141, -.138], [-.138, .141], [.141, .2144159],
    [.2144159, .424431], [.424431, .573], [.573, .7855722]]) leftWall(P, pivot, a, b);
  rightWall(P, pivot); outerFold(P, pivot); wellEnds(P, pivot);
}

/** Only the concealed original roof below the real well is relieved. */
export function leclercXWellRoofPoints(z: number, left: number, right: number, port: number, starboard: number) {
  const roof = (x: number) => port + (starboard - port) * (x - left) / (right - left);
  const inside = z >= -.2866 && z <= .6491;
  const xs = inside ? [-.298, -.300, -1.010, -1.012]
    : [.8, .6, .4, .2].map(t => left + (right - left) * t);
  return xs.map((x, i) => [x, inside && (i === 1 || i === 2) ? Math.min(roof(x), FLOOR - .001) : roof(x)] as const);
}
