// Original closed rolled fender returns from Object_66 scalar face planes.
// The two source sides are differently folded; no source vertex/index arrays.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Point = readonly [number, number];
type Plane = readonly [number, number, number, number];
type Height = readonly [number, number, number];
type Cell = { polygon: Point[]; height: Height };
const value = (p: Height, v: Point): number => p[0] * v[0] + p[1] * v[1] + p[2];
const height = (p: Plane): Height => [-p[0] / p[1], -p[2] / p[1], p[3] / p[1]];

function area(p: readonly Point[]): number {
  return p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - a[1] * b[0]; }, 0) / 2;
}
function clip(polygon: readonly Point[], f: (p: Point) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], fa = f(a), fb = f(b);
    if (fa <= 1e-10) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out.length >= 3 && Math.abs(area(out)) > 1e-11 ? out : [];
}
function intersection(a: readonly Point[], b: readonly Point[]): Point[] {
  let p = [...a];
  for (let i = 0; i < b.length && p.length; i++) {
    const u = b[i], v = b[(i + 1) % b.length];
    p = clip(p, q => (v[1] - u[1]) * (q[0] - u[0]) - (v[0] - u[0]) * (q[1] - u[1]));
  }
  return p;
}
function combine(a: readonly Cell[], b: readonly Cell[], minimum: boolean): Cell[] {
  const result: Cell[] = [], sign = minimum ? 1 : -1;
  for (const x of a) for (const y of b) {
    const p = intersection(x.polygon, y.polygon); if (!p.length) continue;
    const f = (v: Point) => sign * (value(x.height, v) - value(y.height, v));
    if (p.every(v => Math.abs(f(v)) < 1e-10)) { result.push({ polygon: p, height: x.height }); continue; }
    const px = clip(p, f), py = clip(p, v => -f(v));
    if (px.length) result.push({ polygon: px, height: x.height });
    if (py.length) result.push({ polygon: py, height: y.height });
  }
  return result;
}
function envelope(planes: readonly Plane[], domain: Point[], minimum: boolean): Cell[] {
  return planes.map(p => [{ polygon: domain, height: height(p) }]).reduce((a, b) => combine(a, b, minimum));
}

const RIGHT_TOP: readonly Plane[] = [
  [-.013492909202, .655777117521, -.754833964218, 3.163101311235],
  [.014535741034, .723522929749, -.690147290337, 3.054953712393],
  [.014214026376, .879157411470, -.476319438309, 2.535518198853],
  [.000055995029, .858861200603, -.512208390173, 2.607145112423],
  [.000050404068, .982279158440, -.187423724097, 1.767294330043],
  [0, 1, 0, 1.25398],
];
const LEFT_TOP: readonly Plane[] = [
  [-.000056090011, .590158931042, -.807287082125, 3.261408259955],
  [-.083403536274, .309761792742, -.947149133925, 3.532989759214],
  [-.000060427375, .852484659039, -.522752238113, 2.631650548932],
  [-.000051681674, .981977269540, -.188999046124, 1.771418569256],
  [0, 1, 0, 1.25398],
];
const RIGHT_BOTTOM: readonly Plane[] = [
  [-.023186847266, -.735526916691, .677098607986, -3.003187391322],
  [-.051839474622, -.654712632746, .754098161643, -3.207564992428],
  [-.051879356571, -.879630330134, .472820277346, -2.547309052177],
  [-.041580181589, -.864850462656, .500304672917, -2.603644138431],
  [-.041491157045, -.982705548947, .180466861100, -1.772087508486],
  [-.046394181282, -.985355430210, .164080029558, -1.733081253161],
  [-.025582084174, -.848295583000, -.528904680290, .910859443322],
  [-.024445037959, -.831881900396, -.554414054577, 1.013553532126],
];
const LEFT_BOTTOM: readonly Plane[] = [
  [.114515723013, -.586018128952, .802165133699, -3.334122360028],
  [.034025329735, -.304279212157, .951975019623, -3.433581116404],
  [.036000058965, -.853598287632, .519686404580, -2.644174093402],
  [.041490268331, -.862144279917, .504961184884, -2.614721258521],
  [.041414708566, -.982424287400, .182009179553, -1.776217167713],
  [.046265759829, -.985057916592, .165892677438, -1.737931826778],
  [-.010129153160, -.889802005144, -.456234360715, .667822504291],
  [-.012019091694, -.875689340773, -.482725304797, .771131718482],
];

function closedStock(upper: readonly Cell[], lower: readonly Cell[]): THREE.BufferGeometry {
  const vertices: number[] = [];
  const triangle = (a: readonly number[], b: readonly number[], c: readonly number[]): void => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    if (ab.cross(ac).lengthSq() > 1e-20) vertices.push(...a, ...b, ...c);
  };
  for (const a of upper) for (const b of lower) {
    const polygon = clip(intersection(a.polygon, b.polygon), p => value(b.height, p) - value(a.height, p));
    if (!polygon.length) continue;
    const top = polygon.map(p => [p[0], value(a.height, p), p[1]]);
    const bottom = polygon.map(p => [p[0], value(b.height, p), p[1]]);
    for (let i = 1; i + 1 < polygon.length; i++) {
      triangle(top[0], top[i + 1], top[i]); triangle(bottom[0], bottom[i], bottom[i + 1]);
    }
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      triangle(top[i], top[j], bottom[j]); triangle(top[i], bottom[j], bottom[i]);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(vertices.flatMap((_, i) => i % 3 === 0 ? [vertices[i], vertices[i + 2]] : []), 2));
  g.computeVertexNormals(); g.userData.amx30AftReturn = true; return g;
}

export function addAmx30XAftReturn(P: TankBuilderPort, side: -1 | 1): void {
  const right = side > 0, a = right ? .923169851303 : -1.55230, b = right ? 1.54845 : -.926611900330;
  const domain: Point[] = [[a, -3.40], [b, -3.40], [b, -2.849], [a, -2.849]];
  const p = right ? RIGHT_BOTTOM : LEFT_BOTTOM;
  const aft = envelope(p.slice(0, 2), domain, false), middle = envelope(p.slice(2, 4), domain, !right);
  const fore = envelope(p.slice(4, 6), domain, true), end = envelope(p.slice(6, 8), domain, right);
  const underside = combine(combine(combine(aft, middle, true), fore, true), end, false);
  // The right mid-return has a shallow convex diagonal fold, unlike its
  // concave terminal pair. Preserve that real crossfall at the inner edge.
  const crown = right ? combine(combine(envelope(RIGHT_TOP.slice(0, 2), domain, true),
    envelope(RIGHT_TOP.slice(2, 4), domain, false), true), envelope(RIGHT_TOP.slice(4), domain, true), true)
    : envelope(LEFT_TOP, domain, true);
  P.addMudguard('amx30-x-aft-return', 'hull', closedStock(crown, underside));
}
