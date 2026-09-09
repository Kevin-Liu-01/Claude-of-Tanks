// First-party source97 folded loader shields and source103 glazing. The
// construction uses measured planes, sparse fold stations and pane warping;
// no reference vertices, triangle connectivity or runtime source assets.
import * as THREE from 'three';
import { closedSectionLoft, type XY, type XYZ } from './abramsSourceXGeometry.ts';

interface ShieldStock { name: string; geometry: THREE.BufferGeometry; glass?: boolean }
interface ShieldFrame { origin: XYZ; u: XYZ; v: XYZ; n: XYZ }
type Surface = (u: number, v: number) => number;
const FORE: ShieldFrame = {
  origin: [.8, 2.82, .15],
  u: [.7292862406, .1223041576, -.6731888831],
  v: [-.3689028155, .8989212401, -.2363288320],
  n: [.5762397869, .4206926398, .7006892399],
};
const SIDE: ShieldFrame = {
  origin: [1, 2.82, -.2],
  u: [.3036192853, -.1189068503, -.9453446412],
  v: [-.3731501164, .8980864249, -.2328084278],
  n: [.8766837059, .4234405913, .2283062534],
};

function world(frame: ShieldFrame, p: XYZ): XYZ {
  return [0, 1, 2].map(i => frame.origin[i] + frame.u[i] * p[0]
    + frame.v[i] * p[1] + frame.n[i] * p[2]) as [number, number, number];
}

/** Independent closed two-surface sheet, including concave U outlines.
 * Normal-depth and folded-plane stock share the same closure vocabulary. */
function sheet(frame: ShieldFrame, outline: readonly XY[], back: Surface,
  front: Surface, fold = false): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) outline = [...outline].reverse();
  const rings = [back, front].map(f => outline.map(([u, v]) =>
    world(frame, fold ? [u, f(u, v), v] : [u, v, f(u, v)])));
  const triangles: XYZ[][] = [];
  const faces = THREE.ShapeUtils.triangulateShape(outline.map(p => new THREE.Vector2(...p)), []);
  for (const [a, b, c] of faces) {
    triangles.push([rings[0][c], rings[0][b], rings[0][a]], [rings[1][a], rings[1][b], rings[1][c]]);
  }
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    triangles.push([rings[0][i], rings[0][j], rings[1][j]], [rings[0][i], rings[1][j], rings[1][i]]);
  }
  let volume = 0;
  for (const [a, b, c] of triangles) volume += a[0] * (b[1] * c[2] - b[2] * c[1])
    + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (volume < 0) for (const t of triangles) [t[1], t[2]] = [t[2], t[1]];
  const positions = triangles.flat(2), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(triangles.flatMap(t => t.flatMap(p => [p[0], p[1]])), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function add(parts: ShieldStock[], name: string, geometry: THREE.BufferGeometry, glass = false): void {
  const fullName = `LoaderSourceShield${name}`;
  geometry.userData = { abramsLoaderStock: fullName };
  parts.push({ name: fullName, geometry, ...(glass ? { glass: true } : {}) });
}

function rectangle(a: number, b: number, lo: Surface, hi: Surface): XY[] {
  return [[a, lo(a, 0)], [b, lo(b, 0)], [b, hi(b, 0)], [a, hi(a, 0)]];
}

function uOutline(a: number, b: number, innerA: number, innerB: number,
  bottom: Surface, top: Surface, opening: Surface): XY[] {
  return [[a, bottom(a, 0)], [b, bottom(b, 0)], [b, top(b, 0)],
    [innerB, top(innerB, 0)], [innerB, opening(innerB, 0)],
    [innerA, opening(innerA, 0)], [innerA, top(innerA, 0)], [a, top(a, 0)]];
}

function panes(parts: ShieldStock[]): void {
  // Each real pane is ~48.42mm normal-thick. A shallow non-planar twist is
  // retained independently on both faces rather than flattening all four
  // corners onto one plane. The small taper of both end cuts is also real.
  const foreLo = (u: number) => -.09891 + .005826 * u;
  const foreHi = (u: number) => .12406 + .01835 * u;
  const foreUV = (u: number, v: number) => [(u + .10572) / .17985,
    (v - foreLo(u)) / (foreHi(u) - foreLo(u))];
  add(parts, 'ForePane103', sheet(FORE, rectangle(-.10572, .07413, foreLo, foreHi),
    (u, v) => { const [s, t] = foreUV(u, v); return -.03850 - .000018 * s - .000023 * t + .000125 * s * t; },
    (u, v) => { const [s, t] = foreUV(u, v); return .0099026 - .000071 * (1 - s) * (1 - t); }), true);
  const sideLo = (u: number) => -.111547 - .005976 * u;
  const sideHi = (u: number) => .111556 - .01855 * u;
  const sideUV = (u: number, v: number) => [(u + .086006) / .17990,
    (v - sideLo(u)) / (sideHi(u) - sideLo(u))];
  add(parts, 'SidePane103', sheet(SIDE, rectangle(-.086006, .093894, sideLo, sideHi),
    (u, v) => { const [s, t] = sideUV(u, v); return -.014523 - .000024 * t + .000095 * s - .000062 * s * t; },
    (u, v) => { const [s, t] = sideUV(u, v); return .033898 + .000093 * s * (1 - t); }), true);
}

function windowChannel(parts: ShieldStock[], name: string, frame: ShieldFrame,
  a: number, b: number, bottom: number, top: number, w0: number, w1: number): void {
  const slope = name === 'Fore' ? .0058 : -.006;
  const lo = (u: number) => bottom + slope * u, hi = (u: number) => top + slope * u;
  const innerLo = (u: number) => lo(u) + .006;
  // Source76/0 is a U channel, not a closed upper crossbar over the glass.
  // The source's separate crown clips remain outside this bounded helper.
  add(parts, `${name}Channel97`, sheet(frame,
    uOutline(a, b, a + .0058, b - .0058, lo, hi, innerLo), () => w0, () => w1));
  add(parts, `${name}RearLip97`, sheet(frame,
    uOutline(a, b, a + .019, b - .019, lo, hi, u => lo(u) + .021), () => w0, () => w0 + .011));
  add(parts, `${name}FrontLip97`, sheet(frame,
    uOutline(a, b, a + .0118, b - .0129, lo, u => hi(u) - .0145, u => lo(u) + .017),
    () => w1 - .0001, (u, v) => w1 + .0048 - .0015 * v - .002 * u));
}

function lowerFore(parts: ShieldStock[]): void {
  // Source62: canted U shield, short lower bend, tapered return and narrow
  // upturned receiving toe. Different fold planes remain distinct.
  const bottom = (u: number) => -.17804 - .0810 * u;
  const top = (u: number) => .12567 + .017 * u;
  add(parts, 'ForeUpright97', sheet(FORE,
    uOutline(-.167, .1045, -.1108, .08005, bottom, top, u => -.10389 + .0058 * u),
    (u, v) => -.03668 - .00368 * u - .00177 * v,
    (u, v) => -.025385 - .003236 * u - .000509 * v));
  add(parts, 'ForeFirstFold97', sheet(FORE,
    [[-.161, -.025], [.1024, -.0256], [.0954, -.063], [-.092, -.063]],
    (u, w) => (.120057 + .058877 * u - .656091 * w) / -.752382,
    (u, w) => (-.106949 - .06786 * u + .660209 * w) / .74801, true));
  // The concave left cut narrows into the source receiving tongue; it is
  // neither a full-width triangular brace nor a hidden bounding-box solid.
  const taper: XY[] = [[-.089, -.0625], [.095, -.0625], [.051, -.224],
    [-.007, -.224], [-.009, -.182], [-.014, -.146], [-.032, -.112], [-.078, -.065]];
  add(parts, 'ForeReturn97', sheet(FORE, taper,
    (u, w) => (.181082 + .090338 * u - .291248 * w) / -.952373,
    (u, w) => (-.169416 - .088608 * u + .291080 * w) / .952587, true));
  add(parts, 'ForeToe97', sheet(FORE,
    [[-.007, -.222], [.051, -.224], [.040, -.265], [.0284, -.3144], [.007, -.3093]],
    (u, w) => (.336728 + .108219 * u + .572805 * w) / -.812517,
    (u, w) => (.336728 + .108219 * u + .572805 * w) / -.812517 + .0115, true));
}

function lowerSide(parts: ShieldStock[]): void {
  const bottom = (u: number) => -.189 - .078 * u;
  const top = (u: number) => .11302 - .0183 * u;
  add(parts, 'SideUpright97', sheet(SIDE,
    uOutline(-.1193, .152, -.09176, .0991, bottom, top, u => -.1163 - .006 * u),
    (u, v) => -.012403 + .010264 * u - .001930 * v,
    (u, v) => -.001675 + .01042 * u - .001919 * v));
  add(parts, 'SideFirstFold97', sheet(SIDE,
    [[-.117, -.0025], [.149, -.0002], [.144, -.032], [-.11, -.0315]],
    (u, w) => (.090677 - .03012 * u - .877318 * w) / -.478963,
    (u, w) => (-.066867 + .037658 * u + .907572 * w) / .418204, true));
  const cut: XY[] = [[-.11, -.0315], [.144, -.033], [.134, -.079], [.107, -.079],
    [.056, -.0925], [.021, -.121], [.002, -.160], [.006, -.1904], [-.063, -.1916]];
  add(parts, 'SideReturn97', sheet(SIDE, cut,
    (u, w) => (.219967 - .084159 * u - .190232 * w) / -.978125,
    (u, w) => (-.207095 + .082480 * u + .192827 * w) / .977760, true));
  add(parts, 'SideToe97', sheet(SIDE,
    [[.006, -.1904], [-.063, -.1916], [-.0472, -.2461], [-.02975, -.29917], [.0113, -.2916]],
    (u, w) => w < -.246
      ? (.327176 - .104158 * u + .547164 * w) / -.830520
      : (.317045 - .161137 * u + .493673 * w) / -.854589,
    (u, w) => w < -.242
      ? (-.315422 + .104812 * u - .548388 * w) / .829629
      : (-.304162 + .165055 * u - .488671 * w) / .856713, true));
  // Source72's narrow outturned terminal edge is the actual receiving
  // surface at116/128 height; the broad toe plane alone stops short.
  add(parts, 'SideToeEdge97', sheet(SIDE,
    [[-.04715, -.24595], [-.05554, -.24832], [-.03706, -.30226], [-.02970, -.29910]],
    (u, w) => (.239971 - .551592 * u + .349094 * w) / -.757548,
    (u, w) => (-.321416 - .406071 * u - .614612 * w) / .676282, true));
}

function crownOutline(left: number, right: number, middle: number, slope: number): XY[] {
  const points: XY[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 6, u = right + .0085 * Math.cos(a);
    points.push([u, middle + slope * u + .0106 * Math.sin(a)]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI / 2 + i * Math.PI / 6, u = left + .0085 * Math.cos(a);
    points.push([u, middle + slope * u + .0106 * Math.sin(a)]);
  }
  return points;
}

function crowns(parts: ShieldStock[]): void {
  // Source97/481 and182 are separate narrow round-ended upper returns,
  // not tall generic top bars at the pane's world-Y bounding maximum.
  add(parts, 'ForeCrown481', sheet(FORE, crownOutline(-.1619, .0963, .13624, .01707),
    (u, v) => -.036748 - .003251 * u - .001170 * v,
    (u, v) => -.02615 - .003045 * u + .004258 * v));
  add(parts, 'SideCrown182', sheet(SIDE, crownOutline(-.1116, .1466, .12343, -.0186),
    (u, v) => -.012403 + .010264 * u - .001930 * v,
    (u, v) => -.001483 + .009478 * u - .004700 * v));
}

function crossBeam(parts: ShieldStock[], name: string, frame: ShieldFrame,
  a: number, b: number, slope: number, profile: readonly XY[]): void {
  const along = frame.u.map((n, i) => n + frame.v[i] * slope) as [number, number, number];
  const axes = { origin: frame.origin, u: frame.v, v: frame.n, n: along };
  add(parts, name, sheet(axes, profile, () => a, () => b));
}

function paneCaps(parts: ShieldStock[]): void {
  // The shallow97/8,18 and6,4 caps fold around the real pane crown. These
  // are additional physical depth layers, not a forward shift of481/182.
  crossBeam(parts, 'ForeRearCap8', FORE, -.1105, .0802, .0179, [
    [.1121, -.05295], [.1290, -.05295], [.1290, -.0436], [.1335, -.0354],
    [.1259, -.0354], [.1259, -.0485], [.1121, -.0485],
  ]);
  crossBeam(parts, 'ForeFrontCap18', FORE, -.1113, .0795, .01762, [
    [.1113, .0135], [.12896, .0135], [.12896, -.0190], [.1337, -.0258],
    [.1259, -.0258], [.1259, .0088], [.1113, .0088],
  ]);
  crossBeam(parts, 'SideRearCap6', SIDE, -.0919, .0989, -.0179, [
    [.0994, -.02894], [.11655, -.02894], [.11655, -.0195], [.1211, -.0113],
    [.1134, -.0113], [.1134, -.0244], [.0994, -.0244],
  ]);
  crossBeam(parts, 'SideFrontCap4', SIDE, -.0914, .0994, -.01798, [
    [.0990, .0375], [.11651, .0375], [.11651, .0052], [.1212, -.0018],
    [.1134, -.0018], [.1134, .0328], [.0990, .0328],
  ]);
}

function brace(parts: ShieldStock[], name: string, frame: ShieldFrame,
  stations: readonly (readonly [number, number, number, number, number])[]): void {
  // Source428/501 have open concealed undersides. Independently close the
  // narrow receiving stock with2mm under the measured lower profile; never
  // fill the surrounding loop/foot air with an enclosing box.
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i];
    const blend = (w: number, column: number) => a[column] + (b[column] - a[column]) * (w - a[0]) / (b[0] - a[0]);
    const outline: XY[] = [[a[1], a[0]], [a[2], a[0]], [b[2], b[0]], [b[1], b[0]]];
    add(parts, `${name}_${i}`, sheet(frame, outline,
      (_u, w) => blend(w, 4) - .002, (_u, w) => blend(w, 3), true));
  }
}

function receivers(parts: ShieldStock[]): void {
  brace(parts, 'ForeReceiver428', FORE, [
    [-.1305, .0151, .0342, -.2202, -.2208],
    [-.1602, .0211, .0312, -.2248, -.2253],
    [-.2230, .0176, .0366, -.2291, -.2490],
    [-.2419, .0263, .0363, -.2311, -.2320],
    [-.2539, .0233, .0421, -.2279, -.2300],
  ]);
  brace(parts, 'SideReceiver501', SIDE, [
    [-.1133, -.0742, -.0489, -.2394, -.2400],
    [-.1282, -.0650, -.0524, -.2374, -.2380],
    [-.1880, -.0517, -.0269, -.2274, -.2534],
    [-.2369, -.0320, -.0205, -.2201, -.2220],
    [-.2510, -.0315, -.0123, -.2160, -.2170],
  ]);
}

function foldedLinkLoft(sections: readonly { z: number; ring: readonly XY[] }[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const point = (s: number, i: number): XYZ => [...sections[s].ring[i], sections[s].z];
  const triangle = (a: XYZ, b: XYZ, c: XYZ) => positions.push(...a, ...b, ...c);
  const count = sections[0].ring.length;
  for (let s = 1; s < sections.length; s++) for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    triangle(point(s - 1, i), point(s - 1, j), point(s, j));
    triangle(point(s - 1, i), point(s, j), point(s, i));
  }
  for (const s of [0, sections.length - 1]) {
    const ring = sections[s].ring;
    const center: XYZ = [ring.reduce((v, p) => v + p[0], 0) / count,
      ring.reduce((v, p) => v + p[1], 0) / count, sections[s].z];
    for (let i = 0; i < count; i++) {
      const a = point(s, i), b = point(s, (i + 1) % count);
      if (s) triangle(center, a, b); else triangle(center, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function forkLink(parts: ShieldStock[], name: string, ys: readonly number[],
  profile: (y: number) => XY[]): void {
  const sections = ys.map(y => ({ z: y, ring: profile(y).map<XY>(([x, z]) => [x, -z]).reverse() }));
  // Interior cap fan preserves the real folded boundary's collinear tip
  // subdivisions without producing zero-area triangulator ears.
  const geometry = (name.includes('128') ? foldedLinkLoft(sections) : closedSectionLoft(sections)).rotateX(-Math.PI / 2)
    .rotateY(Math.atan2(.829, .559)).translate(.840, 2.69153, -.06037);
  add(parts, name, geometry);
}

function forkLinks(parts: ShieldStock[]): void {
  // Actual source97/116 and128 join the folded toes to the two source1040
  // ears. Source-only finite triangle/edge intersections authenticate both
  // links at each end (OrJ7sT);428/501 alone do not reach the fork.
  forkLink(parts, 'ForeForkLink116', [-.1755, -.166, -.145, -.120, -.100, -.0853], y => {
    const left = -.059729 + .3018 * y, right = -.081298 + .00847 * y;
    const seam = Math.max(left + .0003, -.086143 + .013793 * y);
    return [[left, -.080236 - .03522 * y], [seam, -.08025 - .03422 * y],
      [right, -.08407 - .03273 * y], [right, -.063743 - .03373 * y],
      [seam, -.068074 - .03610 * y], [left, -.067922 - .03614 * y]];
  });
  forkLink(parts, 'SideForkLink128', [-.167, -.160, -.145, -.120, -.100, -.0823], y => {
    const left = .081530 - .005237 * y;
    const right = Math.max(.041899 - .46386 * y, .052051 - .36590 * y);
    const back = (x: number) => Math.min(
      (.090691859 - .183752026 * x - .074475705 * y) / -.980147215,
      (.117657832 - .732585625 * x - .046870142 * y) / -.679059270);
    const front = (x: number) => Math.max(
      (-.078145482 + .181826855 * x + .075220628 * y) / .980449311,
      (-.019368694 - .429016915 * x + .059838770 * y) / .901312270);
    // The link is a shallow folded channel, not a rectangle across the
    // source's two diagonal faces. Near its narrowing tip, retain a0.1mm
    // subdivision inside the end instead of a coincident loft vertex.
    const backKnee = Math.min(right - .0001, .09057828 + .00781121 * y);
    const frontKnee = Math.min(right - .0001, .08801092 - .01561730 * y);
    return [[left, back(left)], [backKnee, back(backKnee)], [right, back(right)],
      [right, front(right)], [frontKnee, front(frontKnee)], [left, front(left)]];
  });
}

/** Canonical world geometry; caller attaches every part to the turret rig. */
export function sourceLoaderShields(): ShieldStock[] {
  const parts: ShieldStock[] = [];
  panes(parts);
  windowChannel(parts, 'Fore', FORE, -.1114, .0801, -.10385, .1260, -.05387, .0088);
  windowChannel(parts, 'Side', SIDE, -.0920, .0995, -.11635, .1140, -.02980, .0328);
  lowerFore(parts); lowerSide(parts); crowns(parts); paneCaps(parts); receivers(parts); forkLinks(parts);
  return parts;
}

