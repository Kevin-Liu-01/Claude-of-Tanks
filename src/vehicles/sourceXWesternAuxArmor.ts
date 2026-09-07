// Native first-party surface recipes, not source mesh data. Keep these scalar
// faces aligned with the named independent profile constructors below.
import type { ArmorPlate } from '../sim/armor.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { c1Point } from './profiles/challenger1XSuppliedFrame.ts';

type Point = [number, number, number];
type Face = Point[];
type Side = -1 | 1;
type Sink = (name: string, face: Face, group: string, owner?: 'hull' | 'turret') => void;

function subtract(a: Point, b: Point): Point { return a.map((v, i) => v - b[i]) as Point; }
function cross(a: Point, b: Point): Point {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Point, b: Point): number { return a.reduce((n, v, i) => n + v * b[i], 0); }
function sideName(side: Side): string { return side < 0 ? 'L' : 'R'; }
function sideFace(x: number, low: number, high: number, rear: number, front: number): Face {
  const points: Face = [[x, low, rear], [x, low, front], [x, high, front], [x, high, rear]];
  return x > 0 ? points.reverse() : points;
}
function normal(face: Face): Point { return cross(subtract(face[1], face[0]), subtract(face[2], face[0])); }
function faceArea(face: Face): number {
  let area = 0;
  for (let i = 1; i < face.length - 1; i++) area += Math.hypot(...cross(subtract(face[i], face[0]), subtract(face[i + 1], face[0]))) / 2;
  return area;
}

function roundedSide(center: Point, size: Point, side: Side): Face[] {
  // factoryGeometry.box(): the >=60mm stock uses the first-party rounded-box
  // primitive. Its real edge facets, not the sharp bounding rectangle, own
  // hits. Reconstruct its scalar grid; no runtime geometry import/allocation.
  const radius = Math.min(.024, Math.min(...size) * .24), result: Face[] = [];
  const planes = [[2, 1, 0, -1, -1, 1], [2, 1, 0, 1, -1, -1],
    [0, 2, 1, 1, 1, 1], [0, 2, 1, 1, -1, -1], [0, 1, 2, 1, -1, 1], [0, 1, 2, -1, -1, -1]];
  for (const [u, v, w, ud, vd, wd] of planes) {
    const point = (i: number, j: number): Point => {
      const p: Point = [0, 0, 0];
      const grid = [-.5, -1 / 6, 1 / 6, .5];
      p[u] = grid[i] * ud;
      p[v] = grid[j] * vd; p[w] = wd / 2;
      const n = p.map(value => value - Math.sign(value) / 6) as Point, length = Math.hypot(...n);
      return p.map((value, axis) => center[axis] + (size[axis] / 2 - radius) * Math.sign(value) + n[axis] / length * radius) as Point;
    };
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      // Rotated order preserves BoxGeometry's b-to-d tessellation diagonal.
      const face = [point(i, j + 1), point(i + 1, j + 1), point(i + 1, j), point(i, j)];
      if (normal(face)[0] * side > 1e-10) result.push(face);
    }
  }
  return result;
}

/** Split a planar face along a projected YZ half-plane, without offsetting an
 * edge. This removes only portions hidden behind actual outer armor stock. */
function clip(face: Face, a: Point, b: Point, keepInside: boolean): Face {
  const distance = (p: Point) => (b[1] - a[1]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[1] - a[1]);
  const output: Face = [];
  for (let i = 0; i < face.length; i++) {
    const p = face[i], q = face[(i + 1) % face.length];
    const dp = distance(p), dq = distance(q), ip = keepInside ? dp >= 0 : dp <= 0;
    const iq = keepInside ? dq >= 0 : dq <= 0;
    if (ip) output.push(p);
    if (ip !== iq) output.push(p.map((v, axis) => v + (q[axis] - v) * dp / (dp - dq)) as Point);
  }
  return output.filter((p, i) => Math.hypot(...subtract(p, output[(i + 1) % output.length])) > 1e-10);
}
function expose(inner: Face[], cover: Face): Face[] {
  let area = 0;
  for (let i = 0; i < cover.length; i++) {
    const a = cover[i], b = cover[(i + 1) % cover.length];
    area += a[1] * b[2] - b[1] * a[2];
  }
  const contour = area < 0 ? [...cover].reverse() : cover;
  const result: Face[] = [];
  for (const face of inner) {
    let remaining = face;
    for (let i = 0; i < contour.length && remaining.length >= 3; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length];
      const outside = clip(remaining, a, b, false);
      if (outside.length >= 3 && faceArea(outside) > 1e-10) result.push(outside);
      remaining = clip(remaining, a, b, true);
    }
  }
  return result;
}

function leopardSkirts(add: Sink): void {
  // leopardA6X.ts thinSkirtRows()/skirts(): six separate thin leaves and four
  // forward heavy panels, including the real tapered final return.
  for (const side of [-1, 1] as const) {
    const suffix = sideName(side);
    for (let i = 0; i < 6; i++) {
      const z = 1.124 - i * .874, y = i === 5 ? 1.18644 : 1.092395;
      const h = i === 5 ? .2226 : .41069;
      add(`skirt_rear_${suffix}`, sideFace(side * 1.7409, y - h / 2, y + h / 2, z - .411375, z + .411375), `thin-${side}-${i}`);
    }
    for (const [index, [a, b]] of [[1.558595, 2.168485], [2.169565, 2.779455], [2.780485, 3.390375]].entries()) {
      add(`skirt_heavy_${suffix}`, sideFace(side * 1.884565, .88171, 1.32576, a, b), `heavy-${side}-${index}`);
    }
    const face: Face = [[side * 1.884565, .87971, 3.394485], [side * 1.785, 1.002, 3.711525],
      [side * 1.785, 1.27, 3.711525], [side * 1.884565, 1.32414, 3.394485]];
    if (normal(face)[0] * side < 0) face.reverse();
    add(`skirt_heavy_${suffix}`, face, `heavy-${side}-tip`);
  }
}

function strvSkirts(add: Sink): void {
  // strv122XSuppliedHull.ts skirt(): preserve all physical inter-panel gaps.
  const rows = [[-3.50, -3.05, 1], [-3.035, -2.62, .9], [-2.605, -1.87, .75],
    [-1.855, -1.115, .75], [-1.10, -.36, .75], [-.345, .395, .75], [.41, 1.15, .75],
    [1.165, 1.80, .75], [1.815, 2.47, .75], [2.485, 3.12, .78]];
  for (const side of [-1, 1] as const) {
    const face: Face = [[side * 1.887, .85, 3.08], [side * 1.857, 1.02, 3.46],
      [side * 1.86, 1.47, 3.46], [side * 1.89, 1.30, 3.08]];
    if (normal(face)[0] * side < 0) face.reverse();
    rows.forEach(([a, b, low], i) => {
      const surfaces = roundedSide([side * 1.848, (low + 1.295) / 2, (a + b) / 2], [.061, 1.295 - low, b - a], side);
      for (const surface of expose(surfaces, face)) add(`skirt_${i < 7 ? 'rear' : 'heavy'}_${sideName(side)}`, surface, `skirt-${side}-${i}`);
    });
    add(`skirt_heavy_${sideName(side)}`, face, `skirt-${side}-tip`);
  }
}

function strvCheeks(add: Sink): void {
  // Exact first-party foreCheek() station rules. Preserve the central throat
  // and lower sloped surfaces; no rectangular cover bridges their real air.
  const rows = [[.78, 1.505, 1.692, 2.416], [1.13, 1.525, 1.672, 2.380],
    [1.48, 1.193, 1.672, 2.341], [1.80, .831, 1.676, 2.307], [2.048, .441, 1.868, 2.021]];
  for (const side of [-1, 1] as const) {
    const rings = rows.map(([z, x, bottom, roof]) => {
      const edge = Math.min(roof - .036, 3.919 - .680 * x - .747 * z);
      const roofX = Math.max(.237, Math.min(x - .047, (3.919 - .747 * z - roof) / .680));
      const ring: Face = [[.228, bottom, z], [x - .047, bottom + .055, z],
        [x, edge - .039, z], [x - .017, edge, z], [roofX, roof, z], [.228, roof, z]];
      const transformed = ring.map(([px, y, pz]) => [side * px, y - 1.705, pz + .12] as Point);
      return side < 0 ? transformed.reverse() : transformed;
    });
    for (let row = 0; row < rings.length - 1; row++) for (let edge = 0; edge < 6; edge++) {
      const next = (edge + 1) % 6;
      const face = [rings[row][edge], rings[row][next], rings[row + 1][next], rings[row + 1][edge]];
      if (Math.abs(face[0][0]) === .228 && Math.abs(face[1][0]) === .228) continue; // inward throat wall
      const upper = normal(face)[1] >= 0 ? 'upper' : 'lower';
      add(`turret_chevron_${sideName(side)}_${upper}_${row === 0 ? 2 : 1}`, face, `cheek-${side}`, 'turret');
    }
    add(`turret_chevron_${sideName(side)}_upper_1`, rings.at(-1)!, `cheek-${side}`, 'turret');
  }
}

function arieteSkirts(add: Sink): void {
  // arieteXSuppliedHull.ts: preserve exposed inner sheets through the actual
  // gaps of the outer course, without charging the old family twice in depth.
  const thin = [[-2.61582, -1.697339], [-1.687246, -.776335], [-.770447, .141305],
    [.148875, 1.059786], [1.06315, 1.974061], [1.98079, 2.89086]];
  const heavy = [[-.074858, .394], [.416, .874], [.896, 1.338],
    [1.361, 1.813], [1.836, 2.289], [2.314, 2.770582]];
  const contour = [[1.792, .532416], [1.805, .545033], [1.805, 1.211184], [1.66117, 1.333143]];
  for (const side of [-1, 1] as const) {
    const name = `skirt_${sideName(side)}`, x = side < 0 ? -1.529119 : 1.5299605;
    let inner = thin.map(([a, b]) => sideFace(x, .622414, 1.041282, a, b));
    inner.push(sideFace(side < 0 ? -1.529299 : 1.52972, .867174, 1.076608, -3.1642175, -2.6158205));
    heavy.forEach(([a, b], index) => {
      inner = expose(inner, sideFace(side * 1.805, .532416, 1.333143, a, b));
      for (let edge = 0; edge < contour.length - 1; edge++) {
        const [x0, y0] = contour[edge], [x1, y1] = contour[edge + 1];
        const face: Face = [[side * x0, y0, a], [side * x1, y1, a], [side * x1, y1, b], [side * x0, y0, b]];
        if (normal(face)[0] * side < 0) face.reverse();
        add(name, face, `heavy-${side}-${index}`);
      }
    });
    for (const caseFace of roundedSide([side * 1.654, 1.186043, -.23004], [.300, .2942, .30532], side)) {
      inner = expose(inner, caseFace);
      add(name, caseFace, `rear-case-${side}`);
    }
    inner.forEach(face => add(name, face, `thin-${side}`));
  }
}

function challengerSkirts(add: Sink): void {
  // challenger1XSuppliedHull.ts installedSkirt()/sideApplique(), in its fixed
  // authoring ruler. Recessed panel fields and their raised rims remain distinct.
  const low = (z: number) => 21.377953 + (z - 58.503937) * (41.220470 - 21.377953) / (95.590553 - 58.503937);
  const rows = [[-173.346451, 45.118111, 49.685040], [-121.653542, 21.338583, 49.685040],
    [37.992126, 21.338583, 49.685040], [58.503937, 21.377953, 49.685040],
    [83.267715, low(83.267715), 49.685040], [95.629921, 41.220470, 48.188976]];
  const panels = [[-107.992126, -73.385826, 76.181099, 24.173227, 58.582676],
    ...[[-73.346458, -57.125984], [-56.811024, -40.551182], [-40.275589, -24.055119],
      [-23.622047, -7.362205], [-7.125984, 9.133859], [9.606299, 25.866142],
      [26.141731, 42.401573]].map(([a, b]) => [a, b, 77.086617, 24.724409, 59.094486])];
  for (const side of [-1, 1] as const) {
    const convert = (face: Face): Face => face.map(([x, y, z]) => c1Point(x, y, z));
    const name = `skirt_${sideName(side)}`;
    let inner: Face[] = rows.slice(0, -1).map(([z, lo, hi], i) => {
      const [nz, nlo, nhi] = rows[i + 1];
      const face: Face = [[side * 70, lo, z], [side * 70, nlo, nz], [side * 70, nhi, nz], [side * 70, hi, z]];
      if (normal(face)[0] * side < 0) face.reverse();
      return face;
    });
    panels.forEach(([a, b, outer, bottom, top], index) => {
      const cover = sideFace(side * outer, bottom, top, a, b);
      inner = expose(inner, cover);
      const group = `applique-${side}-${index}`;
      add(name, convert(sideFace(side * (outer - .43307), bottom + 1.29922, top - 1.29922, a + 2.48, b - 2.48)), group);
      for (const [lo, hi, rear, front] of [[bottom, bottom + 1.29922, a, b], [top - 1.29922, top, a, b],
        [bottom + 1.29922, top - 1.29922, a, a + 2.48], [bottom + 1.29922, top - 1.29922, b - 2.48, b]]) {
        add(name, convert(sideFace(side * outer, lo, hi, rear, front)), group);
      }
    });
    const tip = [[42.677166, 23.464567], [62.755905, 23.464567], [95.433067, 41.181103]];
    for (let i = 0; i < tip.length - 1; i++) {
      const [z, lo] = tip[i], [nz, nlo] = tip[i + 1];
      const face: Face = [[side * 73.700790, lo, z], [side * 73.700790, nlo, nz],
        [side * 73.700790, 49.685040, nz], [side * 73.700790, 49.685040, z]];
      if (normal(face)[0] * side < 0) face.reverse();
      inner = expose(inner, face);
      add(name, convert(face), `applique-${side}-tip`);
    }
    inner.forEach(face => add(name, convert(face), `thin-${side}`));
  }
}

function appendSurface(template: ArmorPlate, face: Face, group: string, target: ArmorPlate[]): void {
  if (face.length < 3 || faceArea(face) < 1e-10) return;
  const n = normal(face), length = Math.hypot(...n);
  const warped = face.some(p => Math.abs(dot(n, subtract(p, face[0]))) > length * 1e-8);
  if (warped && face.length === 4) {
    appendSurface(template, face.slice(0, 3), group, target);
    appendSurface(template, [face[0], face[2], face[3]], group, target);
  } else target.push({ ...template, verts: face, convexPolygon: true, surfaceGroup: group });
}

export function applySourceXWesternAuxArmor(spec: FleetTankSpec, id: string): void {
  if (!['leo2a6_x', 'strv122_x', 'ariete_c1_x', 'challenger1_x'].includes(id)) return;
  const templates = new Map([...spec.armor.hullPlates, ...spec.armor.turretPlates]
    .filter(p => p.kind === 'spaced' && !p.gunFollow).map(p => [p.name, p]));
  spec.armor.hullPlates = spec.armor.hullPlates.filter(p => !templates.has(p.name));
  spec.armor.turretPlates = spec.armor.turretPlates.filter(p => !templates.has(p.name));
  const add: Sink = (name, face, group, owner = 'hull') => {
    const template = templates.get(name);
    if (!template) throw new Error(`${id}: missing inherited auxiliary balance ${name}`);
    appendSurface(template, face, `${id}:${group}`, owner === 'hull' ? spec.armor.hullPlates : spec.armor.turretPlates);
  };
  if (id === 'leo2a6_x') leopardSkirts(add); // actual main cells already own both structural cheeks
  else if (id === 'strv122_x') { strvSkirts(add); strvCheeks(add); }
  else if (id === 'ariete_c1_x') arieteSkirts(add);
  else challengerSkirts(add);
}
