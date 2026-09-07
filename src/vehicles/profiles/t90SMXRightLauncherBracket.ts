// Independent folded SM right launcher carrier. Only measured scalar planes
// and component spans are retained; source island 9018 is never runtime data.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number];
type Plane = readonly [nx: number, ny: number, nz: number, d: number];
const depth = (p: Plane, x: number, y: number): number => (p[3] - p[0] * x - p[1] * y) / p[2];

function clip(poly: readonly Point[], test: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = test(a), db = test(b);
    if (da <= 1e-10) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function closedCell(P: TankBuilderPort, contour: readonly Point[], front: (x: number, y: number) => number,
  back: (x: number, y: number) => number, top = false): void {
  const points: number[] = [];
  const point = (i: number, face: (x: number, y: number) => number) => {
    const [x, y] = contour[i], z = face(x, y); return top ? [x, z, -y] : [x, y, z];
  };
  const triangle = (a: number[], b: number[], c: number[]) => points.push(...a, ...b, ...c);
  const caps = THREE.ShapeUtils.triangulateShape(contour.map(([x, y]) => new THREE.Vector2(x, y)), []);
  for (const [a, b, c] of caps) {
    triangle(point(a, front), point(b, front), point(c, front));
    triangle(point(c, back), point(b, back), point(a, back));
  }
  for (let a = 0; a < contour.length; a++) {
    const b = (a + 1) % contour.length;
    triangle(point(a, front), point(a, back), point(b, back));
    triangle(point(a, front), point(b, back), point(b, front));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const uv: number[] = [];
  for (let i = 0; i < points.length; i += 3) uv.push(points[i], points[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  P.addEquipment('turretDetail', geometry, -.008, -1.532, -.359);
}

function panel(P: TankBuilderPort, x0: number, x1: number, low: (x: number) => number,
  high: (x: number) => number, faces: readonly Plane[], backs: readonly Plane[], outward = false): void {
  const boundary: Point[] = [[x0, low(x0)], [x1, low(x1)], [x1, high(x1)], [x0, high(x0)]];
  // Intersections of independently measured cast-face planes form the crease;
  // no sampled mesh contours are copied. Cells remain closed on every side.
  for (const face of faces) for (const rear of backs) {
    let cell = boundary;
    for (const other of faces) if (other !== face) cell = clip(cell, ([x, y]) =>
      (depth(face, x, y) - depth(other, x, y)) * (outward ? -1 : 1));
    for (const other of backs) if (other !== rear) cell = clip(cell, ([x, y]) =>
      depth(other, x, y) - depth(rear, x, y));
    cell = clip(cell, ([x, y]) => depth(rear, x, y) - depth(face, x, y));
    if (cell.length >= 3) closedCell(P, cell, (x, y) => depth(face, x, y), (x, y) => depth(rear, x, y));
  }
}

function stockWalls(P: TankBuilderPort): void {
  panel(P, 1.05566, 1.18296, x => 2.16567 + (x - 1.05566) * .035,
    () => 2.225985,
    [[.373737651, .281486001, .883790586, .707192087], [.388041658, .305828207, .869420945, .782489895]],
    [[.392200186, .265466402, .880742076, .682376745],
      [.707469631, .384664291, -.592891309, 1.933010035]]);
  panel(P, 1.05566, 1.177086, () => 2.225985, () => 2.260876,
    [[.378386254, .231728596, .896172807, .595255629]],
    [[.392456431, .267339454, .880061115, .687126612],
      [.707469631, .384664291, -.592891309, 1.933010035]]);
  const low = () => 2.07894, high = (x: number) => 2.17415 + (x - 1.095806) * .0222;
  const rear: Plane = [.285981485, .320878607, .902912792, .777976721];
  // Actual short back-return closes the middle wall into the lower shelf.
  // The proud stock seats start higher; lowering them would fill source air.
  panel(P, 1.099723, 1.408195, () => 2.065983, () => 2.081435,
    [[.280143451, .343728056, .896309472, .831300609]],
    [[.283241707, .331075197, .900090745, .796658518]]);
  panel(P, 1.095806, 1.210, low, high,
    [[.214309059, .331271944, .918874597, .745697681], [.205278190, .320104450, .924875130, .710154535]], [rear]);
  panel(P, 1.210, 1.314, low, high,
    [[.285544702, .332258969, .898926137, .838801456], [.284635494, .331181605, .899611794, .835184676]], [rear]);
  panel(P, 1.314, 1.41015, low, high,
    [[.431520712, .325624974, .841283693, 1.032259249], [.440984297, .347707314, .827425207, 1.096805172]],
    [[.287152944, .348792265, .892125071, .842333172]]);
  const floor = (x: number) => 1.985484 + (x - 1.131060) * .0263;
  // The leading inboard corner is clipped, not a rectangular forward spike.
  panel(P, 1.119308, 1.131060, x => 1.985484 + (1.131060 - x) * .5623, () => 2.07520,
    [[.256768250, .458946444, .850551719, 1.115040278]],
    [[.257238119, .458258491, .850780645, 1.078686905]]);
  panel(P, 1.131060, 1.292, floor, () => 2.07520,
    [[.247133864, .471397956, .846586570, 1.129269262], [.256768250, .458946444, .850551719, 1.115040278]],
    [[.257238119, .458258491, .850780645, 1.078686905]], true);
  panel(P, 1.292, 1.403298, floor, () => 2.075454,
    [[.377364339, .441587741, .814000260, 1.241276245], [.393471443, .467396716, .791656828, 1.319936510]],
    [[.260091077, .475651219, .840302653, 1.119686877]], true);
}

function foldedShelves(P: TankBuilderPort): void {
  // The upper shelf carries the single raised station into the broad middle
  // bank. Its source rake and thin underside leave the front inter-row air.
  const top = (x: number, v: number) => (2.130803131 + .046320825 * x - .062879267 * v) / .996945625;
  const upperOutline: Point[] = [[1.0625, .39047], [1.403298, .39047], [1.403298, .340], [1.090909, .243650], [1.0625, .340]];
  closedCell(P, upperOutline.reverse(),
    top, (x, v) => top(x, v) - .0094, true);
  // Near-level lower shelf ties the two low stock stations into the middle
  // casting without extending to the launcher mouths or spanning their bores.
  const lower = (x: number, v: number) => (2.073957276 + .000366883 * x + .003897904 * v) / .999992336;
  const lowerOutline: Point[] = [[1.099723, .219], [1.396443, .3089], [1.396443, .246], [1.119308, .146559]];
  closedCell(P, lowerOutline.reverse(),
    lower, (x, v) => lower(x, v) - .0093, true);
}

export function addT90SMRightLauncherBracket(P: TankBuilderPort): void {
  stockWalls(P);
  foldedShelves(P);
}
