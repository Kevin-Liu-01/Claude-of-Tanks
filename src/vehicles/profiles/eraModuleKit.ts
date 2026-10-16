// Release 227 (owner 2026-10-16: "for our turret upghrades, it should be a brand new era packages for both though, donnt
// make it just copy the t90ms. innovate for the hetman 2 and zubr 2 and also the zubr"): the shared construction kit of
// the national frontal ERA packages (ukraineFrontEra.ts, polandFrontEra.ts). It owns no vehicle layout: it seats
// lofted modules on permanent stock, binds them to the existing gameplay ERA sectors with authored hit faces, lays
// their permanent carriers, lamps and hardware, and guards every new part against the working envelopes of the gun,
// the driver's vision, the turret ring, the smoke bank, the gunner's sight and the mantlet (frontEnvelope).
//
// Frames: owner-local metres; a turret part is in the turret frame (origin on the ring centre, +Z forward, +Y up,
// +X the vehicle's LEFT), a hull part in the hull frame. Cost rule (fleet-style-performance-priority.md): modules are
// lofts of a few stations (about 20-60 triangles), never KIT.box at .06 m or more in every dimension (a rounded box,
// about 108 triangles); hardware is drawn on the near tier only.
import * as THREE from 'three';
import {markEraHitFaces, markEraFurniture} from './eraHitFaces.ts';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';
import {markVehicleNightLens, type VehicleLampKind} from '../vehicleNightLighting.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export type V3 = readonly [number, number, number];
export type Owner = 'hull' | 'turret';
const v = (p: V3): THREE.Vector3 => new THREE.Vector3(...p);

// ---------------------------------------------------------------------------------------------------------------------
// Seating (moved unchanged from polandDonorTurretKit.ts)

/** Raycast seats on permanent stock only: the donor casting plus the kit's own welded housings, never removable ERA,
 * stowage boxes or other fittings. */
export class Stock {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
  private readonly ray = new THREE.Raycaster();
  private readonly id: string;
  constructor(id: string, geometries: readonly THREE.BufferGeometry[] = []) {
    this.id = id;
    for (const g of geometries) this.add(g);
  }
  add(g: THREE.BufferGeometry): THREE.BufferGeometry {
    const mesh = new THREE.Mesh(g, this.material); mesh.updateMatrixWorld(true); this.meshes.push(mesh); return g;
  }
  /** The highest permanent surface under a plan point. */
  top(x: number, z: number): number {
    this.ray.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit) throw new Error(`${this.id}: no permanent turret seat at ${x.toFixed(3)},${z.toFixed(3)}`);
    return hit.point.y;
  }
  /** The first permanent surface along a ray, its normal turned back towards the ray's origin. */
  face(origin: V3, direction: V3): {point: THREE.Vector3; normal: THREE.Vector3} {
    const dir = new THREE.Vector3(...direction).normalize();
    this.ray.set(new THREE.Vector3(...origin), dir);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit?.face) throw new Error(`${this.id}: no permanent turret face from ${origin.map(v => v.toFixed(3))}`);
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return {point: hit.point.clone(), normal};
  }
  /** The first permanent surface along a ray, or null. */
  tryFace(origin: V3, direction: V3): {point: THREE.Vector3; normal: THREE.Vector3} | null {
    try { return this.face(origin, direction); } catch { return null; }
  }
  dispose(): void { this.material.dispose(); }
}

/** Permanent stock of an owner (its structural bucket and its external-armour bucket, never ERA). */
export function permanentStock(P: TankBuilderPort, owner: Owner, extra: readonly string[] = []): Stock {
  const parts: THREE.BufferGeometry[] = [];
  P.forEachBucketPart([owner, `${owner}ExternalArmor`, ...extra], g => {
    if (!Object.hasOwn(g.userData, 'eraHitFaceVertexStarts')) parts.push(g);
  });
  return new Stock(P.spec.id, parts);
}

/** Closed loft through rings of 3D points (equal counts), every face wound outwards (convex rings only). */
export function loft(rings: readonly (readonly V3[])[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const centroid = (points: readonly V3[]) => points.reduce((c, p) => c.add(v(p)), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, inside: THREE.Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a)), out = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(inside);
    if (n.dot(out) < 0) positions.push(...a.toArray(), ...c.toArray(), ...b.toArray());
    else positions.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  };
  const n = rings[0].length;
  for (let s = 0; s < rings.length - 1; s++) {
    const inside = centroid([...rings[s], ...rings[s + 1]]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = v(rings[s][i]), b = v(rings[s][j]), c = v(rings[s + 1][j]), d = v(rings[s + 1][i]);
      push(a, b, c, inside); push(a, c, d, inside);
    }
  }
  for (const [s, t] of [[0, 1], [rings.length - 1, rings.length - 2]] as const) {
    const c = centroid(rings[s]), inside = centroid([...rings[s], ...rings[t]]);
    for (let i = 0; i < n; i++) push(c, v(rings[s][i]), v(rings[s][(i + 1) % n]), inside);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A point moved `inset` metres along the ray that found it: a back face sunk into the stock it was seated on. */
export function shellBack(stock: Stock, origin: V3, direction: V3, inset = .004): THREE.Vector3 {
  const d = v(direction).normalize();
  return stock.face(origin, direction).point.addScaledVector(d, inset);
}

/** Four seat points of a flat module found by parallel rays: throws on a miss or when they spread more than 6 mm out of
 * one plane (the module would rock or float). Returns the seat points and the plane's normal (towards the rays' origin). */
export function seatQuad(stock: Stock, origins: readonly V3[], direction: V3, name: string): {points: THREE.Vector3[]; normal: THREE.Vector3} {
  const points = origins.map(o => {
    const hit = stock.tryFace(o, direction);
    if (!hit) throw new Error(`${name}: seat ray from ${o.map(n => n.toFixed(3))} found no permanent stock`);
    return hit.point;
  });
  const [a, b, c, d] = points;
  const normal = c.clone().sub(a).cross(d.clone().sub(b)).normalize();
  if (normal.dot(v(direction)) > 0) normal.negate();
  const centre = points.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(.25);
  const spread = Math.max(...points.map(p => Math.abs(p.clone().sub(centre).dot(normal))));
  if (spread > .006) throw new Error(`${name}: seat points spread ${(spread * 1000).toFixed(1)} mm out of plane`);
  return {points, normal};
}

// ---------------------------------------------------------------------------------------------------------------------
// Lofted solids

/** One station of a section loft: a 2-D ring (counter-clockwise viewed along the loft) laid in a local frame whose
 * u axis is `out` and v axis is `up`, at origin `o`. */
export interface LoftStation { o: V3; out: V3; up: V3; ring: readonly SectionPoint[] }

/** A closed solid through section stations placed anywhere in 3-D (concave rings allowed: winding follows the rings,
 * not a centroid, so grooves and stepped lips face the right way). Built on sectionSolid's triangulated caps. */
export function sectionLoft(stations: readonly LoftStation[]): THREE.BufferGeometry {
  if (stations.length < 2) throw new Error('sectionLoft needs two stations');
  // every ring in the same order, counter-clockwise (sectionSolid's contract); the volume test below fixes handedness
  const flip = ringArea(stations[0].ring) < 0;
  const g = sectionSolid(stations.map((s, i) => ({z: i, ring: flip ? [...s.ring].reverse() : s.ring})), {preserveCapBoundary: true});
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const s = stations[Math.round(p.getZ(i))], a = p.getX(i), b = p.getY(i);
    p.setXYZ(i, s.o[0] + a * s.out[0] + b * s.up[0], s.o[1] + a * s.out[1] + b * s.up[1], s.o[2] + a * s.out[2] + b * s.up[2]);
  }
  // Orientation: the mapped frames may be left-handed relative to the station order; keep every face outward.
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    volume += a.dot(b.clone().cross(c));
  }
  if (volume < 0) for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z);
  }
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/** A transverse solid in the (z, y) plane between x stations: each station gives its own (z, y) ring (same count). */
export function crosswiseSolid(stations: readonly {x: number; ring: readonly (readonly [z: number, y: number])[]}[]): THREE.BufferGeometry {
  // local u = -z, v = y, along = +X (sectionLoft orders and orients the rings)
  return sectionLoft(stations.map(s => ({o: [s.x, 0, 0], out: [0, 0, -1], up: [0, 1, 0],
    ring: s.ring.map(([z, y]) => [-z, y] as const)})));
}

/** Signed area of a 2-D ring (positive: counter-clockwise). */
export function ringArea(ring: readonly SectionPoint[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
/** The ring counter-clockwise. */
export function ccw(ring: readonly SectionPoint[]): SectionPoint[] { return ringArea(ring) < 0 ? [...ring].reverse() : [...ring]; }

// ---------------------------------------------------------------------------------------------------------------------
// ERA modules

export type EraLayers = 'single' | {doublet: {groove: number; depth: number; at: number}} | {stack: {seam: number; inset: number; chamfer: number}};

/** One removable ERA module bound to an existing gameplay sector: its geometry's authored hit faces face `outward`
 * (cosine above minDot), its hardware (lugs, bolts, hooks) is furniture that leaves with it and is drawn only on the
 * near tier. */
export function eraModule(P: TankBuilderPort, o: {owner: Owner; sector: string; geometry: THREE.BufferGeometry;
  outward: V3; minDot?: number; hardware?: readonly THREE.BufferGeometry[]; name?: string;
  guard?: (name: string, g: THREE.BufferGeometry) => void}): void {
  const name = o.name ?? o.sector;
  o.guard?.(name, o.geometry);
  markEraHitFaces(o.geometry, o.outward, o.minDot ?? .5);
  tagFrontPart(o.geometry, name, o.owner);
  o.geometry.userData.frontEraModule = name;
  o.geometry.userData.frontEraSector = o.sector;
  P.destructibleCluster(o.sector, () => {
    P.addExternalArmor(o.owner, o.geometry);
    if (P.q) for (const h of o.hardware ?? []) {
      o.guard?.(`${name} hardware`, h); tagFrontPart(h, `${name} hardware`, o.owner); h.userData.frontEraSector = o.sector;
      P.addExternalArmor(o.owner, markEraFurniture(h));
    }
  });
}

/** The sector of a module by its centre's side (x < 0 is the vehicle's right: *_L is x < 0 in this fleet). */
export function sectorOf(base: 'glacis_era' | 'skirt_era' | 'turret_era', x: number): string {
  return `${base}_${x < 0 ? 'L' : 'R'}`;
}

/** A small rectangular block (hardware: lugs, bolt heads, hook strips) as a 12-triangle box placed in a frame. */
export function hardwareBlock(at: V3, size: V3, axes?: {x: V3; y: V3}): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...size);
  if (axes) {
    const x = v(axes.x).normalize(), y = v(axes.y).normalize(), z = x.clone().cross(y).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z));
  }
  return g.translate(...at);
}

/** Pure, Node-testable fitted brick bond: rows of [start, end] pieces filling `length`, about `pitch` long each (gap
 * included; the pitch is fitted so a row of whole pieces fills the length exactly); every odd row is offset by
 * `stagger` of a step, its end pieces cut there; pieces shorter than `minPiece` are dropped (never a sliver tile). */
export function mosaicLayout(length: number, pitch: number, rows: number, stagger: number, minPiece: number, gap = .015):
  {row: number; start: number; end: number}[] {
  const n = Math.max(1, Math.round((length + gap) / pitch)), piece = (length - (n - 1) * gap) / n, step = piece + gap;
  const out: {row: number; start: number; end: number}[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? stagger * step : 0;
    for (let s = -offset; s < length - 1e-9; s += step) {
      const a = Math.max(0, s), b = Math.min(length, s + piece);
      if (b - a >= minPiece - 1e-9) out.push({row: r, start: a, end: b});
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Permanent frames and lamps

/** Four permanent bars round a rectangle laid on a plane (corner, u edge, v edge; bars w wide, h proud along n). */
export function frameRails(P: TankBuilderPort, owner: Owner, rect: {o: V3; u: V3; v: V3; n: V3}, w: number, h: number,
  bucket = `${owner}Detail`, guard?: (name: string, g: THREE.BufferGeometry) => void): void {
  const o = v(rect.o), u = v(rect.u), vv = v(rect.v), n = v(rect.n).normalize();
  const lu = u.length(), lv = vv.length(), ux = u.clone().normalize(), vx = vv.clone().normalize();
  const bar = (start: THREE.Vector3, along: THREE.Vector3, len: number, across: THREE.Vector3) => {
    const c = start.clone().addScaledVector(along, len / 2).addScaledVector(n, h / 2 - .004);
    const g = new THREE.BoxGeometry(len, h, w).applyMatrix4(new THREE.Matrix4().makeBasis(along, n, along.clone().cross(n)));
    void across;
    g.translate(c.x, c.y, c.z);
    guard?.('frame rail', g);
    P.addEquipment(bucket, g);
  };
  bar(o.clone().addScaledVector(vx, w / 2), ux, lu, vx);
  bar(o.clone().addScaledVector(vx, lv - w / 2), ux, lu, vx);
  bar(o.clone().addScaledVector(ux, w / 2).addScaledVector(vx, w), vx, lv - 2 * w, ux);
  bar(o.clone().addScaledVector(ux, lu - w / 2).addScaledVector(vx, w), vx, lv - 2 * w, ux);
}

/** A lens marked as a night emitter BEFORE its pose: its +Z aperture (or +Y with apertureAxis 'y') is the lit face. */
export function nightLens(g: THREE.BufferGeometry, kind: VehicleLampKind, tint?: 'red' | 'warm'): THREE.BufferGeometry {
  g.userData.frontEraLamp = kind;
  return markVehicleNightLens(g, kind, tint ? {tint} : {});
}

/** A placed part: rotate a +Z-facing primitive so its +Z points along `facing` (yaw/pitch only, up kept), then move. */
export function facePart(g: THREE.BufferGeometry, at: V3, facing: V3): THREE.BufferGeometry {
  const f = v(facing).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), f);
  return g.applyQuaternion(q).translate(...at);
}

// ---------------------------------------------------------------------------------------------------------------------
// Working envelopes (frontEnvelope) and the build-time guards

interface FrontEnvelope {
  /** Hull frame: the turret ring centre, and the barrel underside at full depression by plan radius from it. */
  ring: V3;
  gunUnderside(r: number): number;
  /** Hull frame: the driver's periscope window's top edge (z, y), the 9-degree-down sight plane over |x| < .55. */
  driver: readonly [z: number, y: number];
  /** Turret frame: the highest hull stock above the ring seat by plan radius about the ring, over every yaw, as
   * piecewise-linear knots [r, height] (measured on the gatefix2 builds, 2 degree yaw steps; tools probe-ring). */
  hullTops: readonly (readonly [number, number])[];
}
const SMOKE_TUBES: readonly V3[] = [[1.16, 2.163, .085], [1.37, 2.129, .145], [1.58, 2.067, .199],
  [1.35, 1.994, .242], [1.56, 1.932, .296], [1.56, 1.82, .36]];
/** The T-72B3M (2016) donor's six smoke tubes in its turret frame (t72b3mX.ts smoke, less its turret pivot). */
const B3M_PIVOT: V3 = [.0000072471277, 1.52948397398, .1143146502203];
const SMOKE_LOCAL = SMOKE_TUBES.map(([x, y, z]) => new THREE.Vector3(x - B3M_PIVOT[0], y - B3M_PIVOT[1], z - B3M_PIVOT[2]));
const SMOKE_AXIS = new THREE.Vector3(.31, .38, .872).normalize();
const ENVELOPES: Readonly<Record<string, FrontEnvelope>> = {
  // the rear deck's intake box rises to .094 from r 1.80 (its sloped front from r 1.62)
  t72b3m_hetman_ii: {ring: [0, 1.5295, .1143], gunUnderside: r => 1.833 - .1051 * r, driver: [2.07, 1.50],
    hullTops: [[1.17, .033], [1.27, .033], [1.28, .053], [1.62, .053], [1.81, .094], [2.42, .094], [2.47, .067], [2.52, .085], [2.70, .085]]},
  // the driver's hatch (.029) and its periscope block (.075 at r 1.63-1.73)
  t72b3_zubr: {ring: [0, 1.4602, .0656], gunUnderside: r => 1.761 - .1051 * r, driver: [1.80, 1.51],
    hullTops: [[1.22, .029], [1.62, .029], [1.63, .075], [1.73, .075], [1.74, .029], [1.83, .029], [1.84, .019], [2.70, .019]]},
  t72b3_zubr_ii: {ring: [0, 1.4602, .0656], gunUnderside: r => 1.761 - .1051 * r, driver: [1.80, 1.51],
    hullTops: [[1.22, .031], [1.62, .031], [1.63, .075], [1.73, .075], [1.74, .031], [1.83, .031], [1.84, .016], [2.02, .016],
      [2.03, .106], [2.70, .106]]},
};
export function frontEnvelope(id: string): FrontEnvelope {
  const e = ENVELOPES[id];
  if (!e) throw new Error(`${id}: no frontal envelope`);
  return e;
}

/** Names a new frontal-package part (the receipt frontEraPackages.selftest finds every new part by this tag). */
export function tagFrontPart<T extends THREE.BufferGeometry>(g: T, name: string, owner: Owner): T {
  g.userData.frontEraPart ??= name;
  g.userData.frontEraOwner ??= owner;
  return g;
}

/** The highest hull stock (turret frame) at a plan radius about the ring, or null inside or beyond the measured span. */
export function hullTopAt(e: FrontEnvelope, r: number): number | null {
  const k = e.hullTops;
  if (r < k[0][0] || r > k[k.length - 1][0]) return null;
  for (let i = 1; i < k.length; i++) if (r <= k[i][0]) {
    const [r0, h0] = k[i - 1], [r1, h1] = k[i];
    return r1 > r0 ? h0 + (h1 - h0) * (r - r0) / (r1 - r0) : Math.max(h0, h1);
  }
  return null;
}

function eachVertex(g: THREE.BufferGeometry, f: (p: THREE.Vector3) => void): void {
  const p = g.getAttribute('position'), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) f(q.fromBufferAttribute(p, i));
}

/** Hull-part guard: E1 (front-arc tops at least 3 cm under the depressed barrel; skirt parts may instead stand no higher
 * than `skirtTop`) and E2 (tops over |x| < .55 under the driver's 9-degree sight plane). Throws with the part name. */
export function assertHullPart(id: string, name: string, g: THREE.BufferGeometry, o: {skirtTop?: number} = {}): void {
  tagFrontPart(g, name, 'hull');
  const e = frontEnvelope(id), [rx, , rz] = e.ring, [dz, dy] = e.driver, tan9 = Math.tan(9 * Math.PI / 180);
  eachVertex(g, p => {
    if (p.z > rz) {
      const r = Math.hypot(p.x - rx, p.z - rz), limit = e.gunUnderside(r) - .03;
      if (o.skirtTop !== undefined) { if (p.y > o.skirtTop + 1e-4) throw new Error(`${id}: ${name} rises ${(p.y - o.skirtTop).toFixed(3)} above the existing skirt top`); }
      else if (p.y > limit) throw new Error(`${id}: ${name} stands ${(p.y - limit).toFixed(3)} m into the gun's 3 cm margin at r ${r.toFixed(2)}`);
    }
    if (Math.abs(p.x) < .55 && p.z > dz && p.y > dy - tan9 * (p.z - dz) + 1e-4)
      throw new Error(`${id}: ${name} blocks the driver's sight plane at z ${p.z.toFixed(3)} by ${(p.y - dy + tan9 * (p.z - dz)).toFixed(3)}`);
  });
}

/** Turret-part guard: E3 (no turret ERA or carrier inboard of |x| .39 in the mantlet's sweep box), E4 (bottoms at least
 * 2.5 cm over the hull stock at their plan radius), E5 (at least .10 from every smoke tube's line of fire) and E6 (under
 * the gunner's sight's lower ray over x .60-.97). Throws with the part name. */
export function assertTurretPart(id: string, name: string, g: THREE.BufferGeometry, o: {smoke?: number} = {}): void {
  tagFrontPart(g, name, 'turret');
  const e = frontEnvelope(id), smokeMin = o.smoke ?? .10;
  const d = new THREE.Vector3();
  eachVertex(g, p => {
    if (Math.abs(p.x) < .39 - 1e-4 && p.y > -.052 && p.y < .628 && p.z > .765 && p.z < 1.702)
      throw new Error(`${id}: ${name} enters the mantlet's sweep at x ${p.x.toFixed(3)}, y ${p.y.toFixed(3)}, z ${p.z.toFixed(3)}`);
    const r = Math.hypot(p.x, p.z), h = hullTopAt(e, r);
    if (h !== null && p.y < h + .025 - 1e-4)
      throw new Error(`${id}: ${name} drops to ${p.y.toFixed(3)} over hull stock ${h.toFixed(3)} at r ${r.toFixed(3)} (ring keep-out 2.5 cm; x ${p.x.toFixed(3)} z ${p.z.toFixed(3)})`);
    for (const s of SMOKE_LOCAL) {
      d.copy(p).sub(s); const t = Math.max(0, d.dot(SMOKE_AXIS));
      const dist = d.addScaledVector(SMOKE_AXIS, -t).length();
      if (dist < smokeMin) throw new Error(`${id}: ${name} is ${dist.toFixed(3)} from a smoke tube's line of fire`);
    }
    if (p.x > .60 && p.x < .97 && p.z > .15 && p.y > .80 - .176 * (p.z - .15) + 1e-4)
      throw new Error(`${id}: ${name} enters the gunner's sight's lower ray at z ${p.z.toFixed(3)}`);
  });
}

/** The smallest distance of a geometry's vertices from the six smoke lines of fire (turret frame). */
export function smokeClearance(g: THREE.BufferGeometry): number {
  let min = Infinity; const d = new THREE.Vector3();
  eachVertex(g, p => { for (const s of SMOKE_LOCAL) { d.copy(p).sub(s); const t = Math.max(0, d.dot(SMOKE_AXIS)); min = Math.min(min, d.addScaledVector(SMOKE_AXIS, -t).length()); } });
  return min;
}
