// Original positive-X folded hood from scalar planes and independent sections.
// Source Object_3 is reference-only: no imported vertices, indices or textures.
import * as THREE from 'three';
import { beamBetween } from './measuredPrimitives.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Point = readonly [number, number];
type Plane = readonly [number, number, number, number];
type Height = readonly [number, number, number];
type Cell = { polygon: Point[]; height: Height };
type Vertex = readonly [number, number, number];
const evaluate = (f: Height, p: Point): number => f[0] * p[0] + f[1] * p[1] + f[2];
const height = (p: Plane): Height => [-p[0] / p[1], -p[2] / p[1], p[3] / p[1]];
const core: Height = height([.300270390902384, .782057104295942, .546099238204537, 2.569902208731066]);
const capZ = (x: number): number => 2.5088 - .5338 * x;
function area(p: readonly Point[]): number {
  return p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0) / 2;
}
function clip(polygon: readonly Point[], f: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], fa = f(a), fb = f(b);
    if (fa <= 1e-10) out.push(a);
    if (fa * fb < 0) { const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out.length >= 3 && Math.abs(area(out)) > 1e-11 ? out : [];
}
function intersect(a: readonly Point[], b: readonly Point[]): Point[] {
  let out = [...a];
  for (let i = 0; i < b.length && out.length; i++) {
    const p = b[i], q = b[(i + 1) % b.length];
    out = clip(out, v => (q[1] - p[1]) * (v[0] - p[0]) - (q[0] - p[0]) * (v[1] - p[1]));
  }
  return out;
}
function combine(a: readonly Cell[], b: readonly Cell[], minimum: boolean): Cell[] {
  const out: Cell[] = [], sign = minimum ? 1 : -1;
  for (const x of a) for (const y of b) {
    const p = intersect(x.polygon, y.polygon); if (!p.length) continue;
    const f = (v: Point): number => sign * (evaluate(x.height, v) - evaluate(y.height, v));
    if (p.every(v => Math.abs(f(v)) < 1e-10)) { out.push({ polygon: p, height: x.height }); continue; }
    const left = clip(p, f), right = clip(p, v => -f(v));
    if (left.length) out.push({ polygon: left, height: x.height });
    if (right.length) out.push({ polygon: right, height: y.height });
  }
  return out;
}
const TOP: readonly Plane[] = [
  [-.250761647405283, .836196735575117, -.487743391143443, .370418772688754],
  [-.212083937621649, .857086678848654, -.469492096145484, .472476167891756],
  [-.009579554317781, .876475782278913, -.481350636457085, .599076193810148],
  [-.083236708369152, .878805570171815, -.469864257222083, .586665766791541],
];
const BOTTOM: readonly Plane[] = [
  [.249680118392179, -.837282232720155, .486434272282308, -.374048637639537],
  [.216597523981110, -.855152996096432, .470955269502899, -.461038424636321],
  [.009785332643380, -.875369977064594, .483354580529647, -.590437704445861],
  [.080840032872114, -.877888907408378, .471991478031712, -.579610037942878],
];
function field(planes: readonly Plane[]): Cell[] {
  const polygon: Point[] = [[.5132, 1.64], [.92, 1.64], [.92, 2.24], [.5132, 2.24]];
  const leaves = planes.map(p => [{ polygon, height: height(p) }]);
  return combine(combine(leaves[0], leaves[1], false), combine(leaves[2], leaves[3], true), false);
}
function geometry(triangles: readonly number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  const uv: number[] = []; for (let i = 0; i < triangles.length; i += 3) uv.push(triangles[i], triangles[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function prism(vertices: number[], top: readonly Vertex[], bottom: readonly Vertex[]): void {
  const tri = (a: Vertex, b: Vertex, c: Vertex): void => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (ab.cross(ac).lengthSq() > 1e-20) vertices.push(...a, ...b, ...c);
  };
  for (let i = 1; i + 1 < top.length; i++) { tri(top[0], top[i + 1], top[i]); tri(bottom[0], bottom[i], bottom[i + 1]); }
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length; tri(top[i], top[j], bottom[j]); tri(top[i], bottom[j], bottom[i]);
  }
}
function canopy(): THREE.BufferGeometry {
  const vertices: number[] = [];
  for (const a of field(TOP)) for (const b of field(BOTTOM)) {
    let p = intersect(a.polygon, b.polygon);
    p = clip(p, v => v[1] - capZ(v[0]));
    // A 3 mm concealed root continuation into the measured permanent cheek.
    p = clip(p, v => evaluate(core, v) - evaluate(a.height, v) - .003);
    // Actual canted inner wall of the outboard return, not a rectangular crop.
    p = clip(p, v => v[0] - (.760986894004 - .015634246864 * evaluate(a.height, v) + .080757984217 * v[1]) / .996611116891);
    if (p.length) prism(vertices, p.map(v => [v[0], evaluate(a.height, v), v[1]]), p.map(v => [v[0], evaluate(b.height, v), v[1]]));
  }
  return geometry(vertices);
}
function add(P: TankBuilderPort, name: string, g: THREE.BufferGeometry): void {
  g.userData.challenger1SourceHood = name;
  g.translate(-D.turretPivot[0], -D.turretPivot[1], -D.turretPivot[2]);
  P.addEquipment('turretDetail', g);
}
function canopyEnd(): THREE.BufferGeometry {
  const rows = [1.650, 1.80, 1.92, 2.04, 2.18, 2.213];
  return sectionSolid(rows.map((z): SolidSection => {
    const floor = Math.max(evaluate(core, [.5149, z]) - .003, evaluate(height(BOTTOM[2]), [.5149, z]));
    const top = 1.93426;
    return { z, ring: [[.513145, Math.min(floor, top - .001)], [.516730, Math.min(floor, top - .001)], [.516730, top], [.513145, top]] };
  }));
}
function outerReturn(): THREE.BufferGeometry {
  // Independently sampled scalar stations, not source mesh vertices/topology.
  // The rounded return is a thin closed skin; its interior remains open.
  const xs = [.919, .970, 1.075, 1.185, 1.278, 1.338], ys = [1.558, 1.735, 1.909];
  const zs = [[2.09932234, 2.08658242, 2.03133799, 1.97344500, 1.92423422, 1.89248534],
    [2.07619158, 2.05759120, 2.00727873, 1.95136310, 1.91120928, 1.89159899],
    [2.02833292, 2.01651412, 1.95703857, 1.89287440, 1.84071054, 1.79905293]];
  const vertices: number[] = [];
  for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
    const face: Vertex[] = [[xs[i], ys[j], zs[j][i]], [xs[i], ys[j + 1], zs[j + 1][i]],
      [xs[i + 1], ys[j + 1], zs[j + 1][i + 1]], [xs[i + 1], ys[j], zs[j][i + 1]]];
    prism(vertices, face, face.map(v => [v[0], v[1], v[2] - .0032]));
  }
  return geometry(vertices);
}
function caps(P: TankBuilderPort): void {
  // The source upper edging is rounded/chamfered stock, not a broad lid.
  add(P, 'diagonal-cap', beamBetween([.537, 1.906, 2.220], [1.328, 1.906, 1.794], .0145, 8));
  add(P, 'inboard-cap', beamBetween([.52480, 1.94233, 1.652], [.52480, 1.94233, 2.183], .01255, 8));
  add(P, 'cap-elbow', beamBetween([.52480, 1.94233, 2.180], [.541, 1.907, 2.218], .01255, 8));
  // Actual receiving rail envelope overlaps the pre-existing smaller beam.
  add(P, 'lower-rail', beamBetween([.936, 1.5569, 2.090], [1.330, 1.5569, 1.8845], .0128, 8));
  add(P, 'inner-return-seat', beamBetween([.9228, 1.558, 2.09], [.911, 1.897, 2.038], .0100, 8));
  add(P, 'outboard-return-seat', beamBetween([1.330, 1.557, 1.8845], [1.334, 1.906, 1.794], .0100, 8));
}
export function addChallenger1SourceHood(P: TankBuilderPort): void {
  add(P, 'canopy', canopy()); add(P, 'inboard-end', canopyEnd());
  add(P, 'outer-return', outerReturn()); caps(P);
}
