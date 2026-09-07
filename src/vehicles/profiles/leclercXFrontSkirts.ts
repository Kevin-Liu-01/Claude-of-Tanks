// First-party closed folded panels from independent source planes. The
// source's full X extent belongs to a wedge, not a flat-bottomed box.
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const INNER = 1.6489669, OUTER = 1.8;
type Course = 0 | 1 | 2;

function crown(course: Course, x: number, z: number): number {
  if (course === 0 || course === 1 && z <= 2.1519151)
    return (1.8933474174 - .2884405 * x - .0152960 * z) / .9573756;
  if (course === 1) return Math.max(
    (2.1762882237 - .2848769 * x - .1574641 * z) / .9455423,
    (1.9773350731 - .1979219 * x - .1199676 * z) / .9728487);
  if (z < 3.221041) return Math.max(
    (2.0528522367 - .1836468 * x - .1614767 * z) / .9696387,
    (1.6454823372 + .0046061 * x - .1223872 * z) / .9924717);
  return Math.max(
    (1.7727332998 + .0045779 * x - .1642679 * z) / .9864051,
    (1.5829695150 + .0386588 * x - .1222973 * z) / .9917403);
}

function underside(course: Course, x: number, z: number): number {
  if (course === 0 || course === 1 && z <= 2.1447914)
    return (.8750352 * x - 1.1111632071) / .4840593;
  if (course === 1) return (.8750322 * x + .0022954 * z - 1.1160813461) / .4840593;
  return (.8750326 * x + .0024275 * z - 1.1164122622) / .4840578;
}

function panel(course: Course, back: number, front: number) {
  // Analytic subdivisions resolve moving transverse roof creases; these
  // are generated regular stations, not sampled reference mesh contours.
  const stations = Array.from({ length: 25 }, (_, i) => back + (front - back) * i / 24);
  if (course === 1) stations.push(2.1447914, 2.1519151);
  if (course === 2) stations.push(3.221041);
  stations.sort((a, b) => a - b);
  const xs = Array.from({ length: 9 }, (_, i) => INNER + (OUTER - INNER) * i / 8);
  return sectionSolid(stations.map(z => ({ z, ring: [
    ...xs.map(x => [x, underside(course, x, z)] as const),
    ...[...xs].reverse().map(x => [x, crown(course, x, z)] as const),
  ] })));
}

function frontToe() {
  // The two lower end faces meet along an oblique crease. Loft along X so
  // that crease is an actual edge, rather than interpolating over its air.
  const back = 3.303991, tip = 3.3410528;
  const lowerA = (x: number, z: number) => (.2231951 * x + .9669226 * z - 3.4774219100) / .1234689;
  const lowerB = (x: number, z: number) => (.0025862 * x + .9977933 * z - 3.2551161574) / .0663463;
  const upperA = (x: number, z: number) => (1.7727332998 + .0045779 * x - .1642679 * z) / .9864051;
  const upperB = (x: number, z: number) => (1.5829695150 + .0386588 * x - .1222973 * z) / .9917403;
  const crease = (a: (x: number, z: number) => number, b: (x: number, z: number) => number, x: number) => {
    const d = a(x, back) - b(x, back), slope = a(x, back + 1) - b(x, back + 1) - d;
    return Math.max(back + .00001, Math.min(tip - .00001, back - d / slope));
  };
  const sections = Array.from({ length: 9 }, (_, i) => {
    const x = INNER + (OUTER - INNER) * i / 8;
    const lowerZ = crease(lowerA, lowerB, x), upperZ = crease(upperA, upperB, x);
    return { z: x, ring: [
      [-back, underside(2, x, back)], [-back, crown(2, x, back)],
      [-upperZ, crown(2, x, upperZ)], [-tip, crown(2, x, tip)],
      [-lowerZ, Math.max(lowerA(x, lowerZ), lowerB(x, lowerZ))],
    ] as const };
  });
  return sectionSolid(sections).rotateY(Math.PI / 2);
}

function reflectOutward(geometry: ReturnType<typeof sectionSolid>): void {
  geometry.scale(-1, 1, 1);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let n = 0; n < p.count; n += 3) {
    const x = p.getX(n + 1), y = p.getY(n + 1), z = p.getZ(n + 1);
    const u = uv.getX(n + 1), v = uv.getY(n + 1);
    p.setXYZ(n + 1, p.getX(n + 2), p.getY(n + 2), p.getZ(n + 2));
    p.setXYZ(n + 2, x, y, z);
    uv.setXY(n + 1, uv.getX(n + 2), uv.getY(n + 2));
    uv.setXY(n + 2, u, v);
  }
  geometry.computeVertexNormals();
}

export function addLeclercXFrontSkirts(P: TankBuilderPort, side: number): void {
  const spans = [[1.245, 1.9130917], [1.960467, 2.4938338], [2.5386198, 3.303991]] as const;
  for (const [i, [back, front]] of spans.entries()) {
    const geometry = panel(i as Course, back, front);
    // Reflect only the transverse coordinate, then reverse triangle winding
    // so the paired source course still has outward one-sided surfaces.
    if (side < 0) reflectOutward(geometry);
    P.addExternalArmor('hull', geometry);
  }
  const toe = frontToe();
  if (side < 0) reflectOutward(toe);
  P.addExternalArmor('hull', toe);
}
