// Source118 sparse turned-stock / four-lightening-opening construction.
// Local +X is outboard. Engagement teeth are deliberately NOT authored here:
// the native pitch/crown/phase remains a separate mechanical approximation.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { turnedGearStock, gearFastener } from '../runningGearPrimitives.ts';

type Point = [number, number];
type Space = [number, number, number];
type Cone = { innerR: number; innerX: number; outerR: number; outerX: number };
const TAU = Math.PI * 2;
const FACETS = 32;
const PHASE = 8.30 * Math.PI / 180;
const AXIAL_DATUM = 1.4254775;
const FRONT: Cone = { innerR: .180275, innerX: 1.498920, outerR: .2389825, outerX: 1.706690 };
const BACK: Cone = { innerR: .18225, innerX: 1.422310, outerR: .2535595, outerX: 1.688530 };

function polygon(radius: number, count = FACETS, phase = PHASE): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + i * TAU / count;
    return [radius * Math.cos(a), radius * Math.sin(a)];
  });
}

/** Four broad oblique windows are wrapped into the cone, not four flat oval
 * decals. Sparse source fits: axial semi-span 62.56/63.40 mm, tangential
 * semi-span 90.0/98.2 mm; a small second harmonic describes the flare. */
function opening(index: number, back: boolean, segments = 16): Space[] {
  const base = (64.51 + index * 90) * Math.PI / 180;
  return Array.from({ length: segments }, (_, k) => {
    const phase = k * TAU / segments;
    const x = (back ? 1.59418 : 1.595604) + (back ? .063376 : .062482) * Math.cos(phase)
      + .00115 * Math.sin(phase) + .00008 * Math.cos(2 * phase)
      + (back ? .000024 : .000228) * Math.cos(3 * phase);
    const tangent = (back ? .098192 : .090080) * Math.sin(phase)
      + (back ? .001928 : .002107) * Math.sin(2 * phase);
    const r = (back ? .228441 : .206797) + (back ? .018325 : .017621) * Math.cos(phase)
      + .000242 * Math.sin(phase) + .000756 * Math.cos(2 * phase)
      + (back ? .000064 : .000143) * Math.cos(3 * phase);
    const angle = base + Math.asin(tangent / r);
    return [x, r * Math.cos(angle), r * Math.sin(angle)];
  });
}

// Primitive coordinates below use the source's radial convention, then this
// one conversion flips radial Z and triangle winding into native +Z forward.
function triangle(out: number[], a: Space, b: Space, c: Space): void {
  const u = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const v = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  if (u.cross(v).lengthSq() < 1e-20) return;
  for (const p of [a, c, b]) out.push(p[0] - AXIAL_DATUM, p[1], -p[2]);
}

function cross2(a: Space, b: Space, c: Space): number {
  return (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
}

function oppositeAngle(a: Space, b: Space, at: Space): number {
  const ax = a[1] - at[1], ay = a[2] - at[2], bx = b[1] - at[1], by = b[2] - at[2];
  return Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by);
}

type Edge = { face: number; a: number; b: number; c: number };
function flipEdge(points: Space[], faces: number[][], one: Edge, two: Edge): boolean {
  const { a, b, c } = one, d = two.c;
  if (cross2(points[c], points[d], points[a]) * cross2(points[c], points[d], points[b]) >= -1e-15) return false;
  if (oppositeAngle(points[a], points[b], points[c]) + oppositeAngle(points[a], points[b], points[d]) <= Math.PI + 1e-9) return false;
  const pair = [[c, d, b], [d, c, a]];
  for (const face of pair) if (cross2(points[face[0]], points[face[1]], points[face[2]]) < 0) face.reverse();
  faces[one.face] = pair[0]; faces[two.face] = pair[1];
  return true;
}

function balancePass(points: Space[], faces: number[][]): boolean {
  const edges = new Map<string, Edge>();
  for (let f = 0; f < faces.length; f++) for (let k = 0; k < 3; k++) {
    const a = faces[f][k], b = faces[f][(k + 1) % 3], c = faces[f][(k + 2) % 3];
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`, other = edges.get(key);
    const current = { face: f, a, b, c };
    if (!other) edges.set(key, current);
    else if (flipEdge(points, faces, current, other)) return true;
  }
  return false;
}

/** Re-triangulate authored boundaries with a local Delaunay criterion. This
 * avoids earcut's long diagonal fans across the flared opening lips. No
 * source connectivity is read or retained. Boundary edges never move. */
function balancedTriangles(points: Space[], initial: number[][]): number[][] {
  const faces = initial.map(f => [...f]);
  for (let pass = 0; pass < 512; pass++) {
    if (!balancePass(points, faces)) break;
  }
  return faces;
}

function coneSurface(out: number[], cone: Cone, back: boolean, holes: Space[][], innerFacets = FACETS): void {
  const outer = polygon(cone.outerR), inner = polygon(cone.innerR, innerFacets);
  const all: Space[] = [...outer.map<Space>(p => [cone.outerX, ...p]),
    ...inner.map<Space>(p => [cone.innerX, ...p]), ...holes.flat()];
  const triangles = balancedTriangles(all, THREE.ShapeUtils.triangulateShape(outer.map(p => new THREE.Vector2(...p)),
    [inner.map(p => new THREE.Vector2(...p)), ...holes.map(loop => loop.map(p => new THREE.Vector2(p[1], p[2])))]));
  for (const [a, b, c] of triangles) {
    if (back) triangle(out, all[c], all[b], all[a]);
    else triangle(out, all[a], all[b], all[c]);
  }
}

function joinLoops(out: number[], a: Space[], b: Space[], hole = false): void {
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    if (hole) {
      triangle(out, a[i], a[j], b[j]); triangle(out, a[i], b[j], b[i]);
    } else {
      triangle(out, a[i], b[i], b[j]); triangle(out, a[i], b[j], a[j]);
    }
  }
}

function geometry(positions: number[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i + 1], positions[i + 2]);
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  result.computeVertexNormals();
  return result;
}

function dishedWeb(high = true): THREE.BufferGeometry {
  const innerFacets = high ? FACETS : 20, lipSegments = high ? 16 : 10;
  const out: number[] = [], front = Array.from({ length: 4 }, (_, i) => opening(i, false, lipSegments));
  const back = Array.from({ length: 4 }, (_, i) => opening(i, true, lipSegments));
  coneSurface(out, FRONT, false, front, innerFacets); coneSurface(out, BACK, true, back, innerFacets);
  for (let k = 0; k < 4; k++) joinLoops(out, front[k], back[k], true);
  for (const outer of [false, true]) {
    const facets = outer ? FACETS : innerFacets;
    const f = polygon(outer ? FRONT.outerR : FRONT.innerR, facets).map<Space>(p => [outer ? FRONT.outerX : FRONT.innerX, ...p]);
    const b = polygon(outer ? BACK.outerR : BACK.innerR, facets).map<Space>(p => [outer ? BACK.outerX : BACK.innerX, ...p]);
    joinLoops(out, f, b, !outer);
  }
  return geometry(out);
}

/** Eleven broad source carrier scallops, independent of the retained native
 * engagement-tooth count. The scalloped stock must not become a solid disc. */
function carrierContour(inner: boolean, high = true): Point[] {
  const detailed: Point[] = inner
    ? [[0, .2540], [2.816, .25915], [6.55, .28068], [11.44, .29466], [180 / 11, .29913]]
    : [[0, .31688], [2.33, .3212], [4.49, .33266], [8.26, .33967], [10.526, .35693], [10.986, .37919]];
  const motif = high ? detailed : [detailed[0], detailed.at(-1)!];
  const result: Point[] = [];
  for (let k = 0; k < 11; k++) {
    const half = motif.slice(1).reverse().map<Point>(([a, r]) => [-a, r]);
    for (const [offset, radius] of [...half, ...motif]) {
      if (inner && offset === -180 / 11) continue;
      const a = (15.54 + k * 360 / 11 + offset) * Math.PI / 180;
      result.push([radius * Math.cos(a), radius * Math.sin(a)]);
    }
  }
  return result;
}

function flatRing(outer: Point[], inner: Point[], lowX: number, highX: number): THREE.BufferGeometry {
  const out: number[] = [], points = [...outer, ...inner];
  const faces = THREE.ShapeUtils.triangulateShape(outer.map(p => new THREE.Vector2(...p)),
    [inner.map(p => new THREE.Vector2(...p))]);
  for (const [a, b, c] of faces) {
    triangle(out, [highX, ...points[a]], [highX, ...points[b]], [highX, ...points[c]]);
    triangle(out, [lowX, ...points[c]], [lowX, ...points[b]], [lowX, ...points[a]]);
  }
  joinLoops(out, outer.map(p => [highX, ...p]), outer.map(p => [lowX, ...p]));
  joinLoops(out, inner.map(p => [highX, ...p]), inner.map(p => [lowX, ...p]), true);
  return geometry(out);
}

function turned(profile: Point[], segments = 32, legacy = false): THREE.BufferGeometry {
  if(!legacy)return turnedGearStock(profile.map(([r,x])=>[r,x-AXIAL_DATUM] as const),segments);
  return new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x - AXIAL_DATUM)), segments)
    .rotateZ(-Math.PI / 2);
}

function hubCap(high:boolean,legacy:boolean): THREE.BufferGeometry {
  // The source cover has a7.14mm upper chamfer and a39.25mm lower wall,
  // not one uniform bevel from a circular rear face. Repeated front corners
  // converge the upper chamfer into four rounded-cross recesses.
  const front = capRing(1.53641, true), middle = capRing(1.52927, false), back = capRing(1.49002, false);
  for (const p of back) {
    const r = Math.hypot(p[1], p[2]);
    if (r < .08) { p[1] *= (r + .00640) / r; p[2] *= (r + .00640) / r; }
  }
  const out: number[] = [];
  joinLoops(out, front, middle); joinLoops(out, middle, back);
  const ring = front.map(p => new THREE.Vector2(p[1], p[2]));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(ring, [])) {
    triangle(out, front[a], front[b], front[c]);
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(back.map(p => new THREE.Vector2(p[1], p[2])), [])) {
    triangle(out, back[c], back[b], back[a]);
  }
  return KIT.mergeAll([geometry(out), turned([[0, 1.48235], [.09182, 1.48235],
    [.09182, 1.49002], [0, 1.49002], [0, 1.48235]],legacy?32:high?16:8,legacy)]);
}

/** Exact union of the two original adjacent carrier rings. Their covered
 * meeting faces and duplicated outer wall are replaced by the real exposed
 * inner shelf, not removed from an otherwise open assembly. Both source
 * eleven-fold outlines and all exterior axial planes stay unchanged. */
function steppedCarrier(outer:Point[],inner:Point[],high:boolean):THREE.BufferGeometry {
  const backX=1.68838,stepX=1.70669,frontX=1.73857,backInner=polygon(.2390,high?24:20),out:number[]=[];
  const cap=(a:Point[],b:Point[],x:number,reverse:boolean):void=>{
    const points=[...a,...b],faces=THREE.ShapeUtils.triangulateShape(a.map(p=>new THREE.Vector2(...p)),
      [b.map(p=>new THREE.Vector2(...p))]);
    for(const face of faces){const order=reverse?[...face].reverse():face;
      triangle(out,[x,...points[order[0]]],[x,...points[order[1]]],[x,...points[order[2]]]);}
  };
  cap(outer,backInner,backX,true);cap(outer,inner,frontX,false);cap(inner,backInner,stepX,false);
  joinLoops(out,outer.map(p=>[frontX,...p]),outer.map(p=>[backX,...p]));
  joinLoops(out,inner.map(p=>[frontX,...p]),inner.map(p=>[stepX,...p]),true);
  joinLoops(out,backInner.map(p=>[stepX,...p]),backInner.map(p=>[backX,...p]),true);
  return geometry(out);
}

function capRing(x: number, front: boolean): Space[] {
  const motif: Point[] = front
    ? [[-15, .09182], [0, .09182], [15, .09182], [26.2, .05465], [26.2, .05465],
      [45, .05532], [63.5, .05465], [63.5, .05465]]
    : [[-15, .09182], [0, .09182], [15, .09182], [22.96, .06219], [30, .06296],
      [45, .06294], [60, .0630], [67.5, .06219]];
  const result: Space[] = [];
  for (let k = 0; k < 4; k++) for (const [angle, radius] of motif) {
    const a = (k * 90 - .5 + angle) * Math.PI / 180;
    result.push([x, radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return result;
}

/** LOW preserves the original complete exposed triangular head. Only the
 * concealed rear becomes a tapered shank: its tip laps 1.83 mm into the
 * unchanged mounting plate. Four closed faces replace eight prism faces. */
export function abramsDriveFastener(high:boolean):THREE.BufferGeometry {
  if(high)return gearFastener(.0245,.02101,true);
  const front=.02101/2,r=.0245,vertices=[
    [front,0,r],[front,Math.sin(Math.PI*2/3)*r,-r/2],
    [front,-Math.sin(Math.PI*2/3)*r,-r/2],[-front,0,0],
  ];
  const positions:number[]=[],uv:number[]=[];
  for(const face of [[0,2,1],[0,1,3],[1,2,3],[2,0,3]])for(const i of face){
    const p=vertices[i];positions.push(...p);uv.push(p[1],p[2]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

export function buildAbramsSourceXDriveGeometry(high: boolean,legacy=false): { body: THREE.BufferGeometry; dark: THREE.BufferGeometry } {
  const outer = carrierContour(false, high || legacy), body: THREE.BufferGeometry[] = [dishedWeb(high || legacy)];
  if(legacy)body.push(flatRing(outer, polygon(.2390), 1.68838, 1.70669),
    flatRing(outer, carrierContour(true), 1.70669, 1.73857));
  else body.push(steppedCarrier(outer,carrierContour(true,high),high));
  body.push(flatRing(outer, polygon(.2282, high || legacy ? 16 : 6, PHASE), 1.10656, 1.15603));
  // The source's inner cone is a single skin. A concealed 2 mm radial
  // return closes that skin without mirroring the much deeper outer dish.
  body.push(turned([[.18225, 1.42231], [.26262, 1.15585], [.26462, 1.15585],
    [.18425, 1.42231], [.18225, 1.42231]],legacy?32:high?16:6,legacy));
  // Central mounting plate stays behind the four lightening windows.
  body.push(turned([[0, 1.48211], [.10155, 1.48211], [.1127, 1.49692], [.180275, 1.49692],
    [.180275, 1.49892], [.1127, 1.49892], [.10155, 1.48411], [0, 1.48411], [0, 1.48211]],legacy?32:high?12:8,legacy));
  const dark: THREE.BufferGeometry[] = [hubCap(high,legacy)];
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8;
    dark.push(KIT.xform(legacy?KIT.cylX(.0245, .02101, 6):abramsDriveFastener(high), 1.507595 - AXIAL_DATUM,
      .1467 * Math.cos(a), -.1467 * Math.sin(a)));
  }
  return { body: KIT.mergeAll(body), dark: KIT.mergeAll(dark) };
}

