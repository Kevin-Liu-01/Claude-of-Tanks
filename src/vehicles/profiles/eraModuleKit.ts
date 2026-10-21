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
type Owner = 'hull' | 'turret';
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
  /** The vehicle the stock belongs to (for messages). */
  get name(): string { return this.id; }
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

/** Round 7 (2026-10-18; the critic's UAPL-R5C-7: permanent plates seated at a few heights sank 9-23 mm into the cast
 * front's curve between them): the heights (or any 1-D stations) at which a seated back's offset u is sampled. Starting
 * from `seed`, the midpoint of two neighbours is added wherever u there leaves their chord by more than `tol` (up to
 * `passes` times, never closer than 2 x `minStep`), so a straight back between two samples stays within `tol` of its seat
 * (bar a bulge narrower than the spacing). */
export function refineHeights(u: (y: number) => number, seed: readonly number[], tol: number, passes = 5, minStep = .004): number[] {
  const cache = new Map<number, number>();
  const at = (y: number): number => { let r = cache.get(y); if (r === undefined) cache.set(y, r = u(y)); return r; };
  let ys = [...seed].sort((a, b) => a - b);
  for (let pass = 0; pass < passes; pass++) {
    const next = [ys[0]];
    let added = false;
    for (let i = 0; i < ys.length - 1; i++) {
      const a = ys[i], b = ys[i + 1], m = (a + b) / 2;
      if (b - a > 2 * minStep && Math.abs(at(m) - (at(a) + at(b)) / 2) > tol) { next.push(m); added = true; }
      next.push(b);
    }
    ys = next;
    if (!added) break;
  }
  return ys;
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
function ringArea(ring: readonly SectionPoint[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
// ---------------------------------------------------------------------------------------------------------------------
// ERA modules

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
  // the authored outward axis (the receipt finds the module's seat faces against it)
  o.geometry.userData.frontEraOutward = v(o.outward).normalize().toArray();
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

/** A lens marked as a night emitter BEFORE its pose: its +Z aperture (or +Y with apertureAxis 'y') is the lit face. */
export function nightLens(g: THREE.BufferGeometry, kind: VehicleLampKind, tint?: 'red' | 'warm' | 'cool'): THREE.BufferGeometry {
  g.userData.frontEraLamp = kind;
  return markVehicleNightLens(g, kind, tint ? {tint} : {});
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
/** The donor's six smoke launch lines in its turret frame: the authoritative launch sockets the sim fires from
 * (auxiliaryInventory.generated.ts, identical on the three national T-72B3M turrets; frontEraPackages.selftest pins them
 * to the inventory). Round 4 (the critic's D6): E5 was measured on one axis averaged over the drawn tubes, up to 29.9
 * degrees off the fanned launch lines. */
export const SMOKE_RAYS: readonly {o: THREE.Vector3; d: THREE.Vector3}[] = ([
  [[1.1938, .6749, .0657], [-.0806, .3798, .9215]], [[1.4038, .6409, .1257], [.2828, .3798, .8808]],
  [[1.6138, .5789, .1797], [.729, .3798, .5695]], [[1.3838, .5059, .2227], [.1031, .3798, .9193]],
  [[1.5938, .4439, .2767], [.602, .3798, .7024]], [[1.5938, .3319, .3407], [.4513, .3798, .8075]],
] as const).map(([o, d]) => ({o: new THREE.Vector3(...o), d: new THREE.Vector3(...d).normalize()}));
/** How far along a launch line E5 holds: 1.6 m (the field suit's smoke reach), or less where existing stock already
 * stands in the line (the Zubr II's left cabinet's front-top corner meets its third line at .338 m, as on integ/227:
 * frontEraPackages.selftest measures each free length on the build). */
export const SMOKE_REACH = 1.6;
export const SMOKE_FREE: Readonly<Record<string, readonly number[]>> = {
  t72b3m_hetman_ii: [SMOKE_REACH, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH],
  t72b3_zubr: [SMOKE_REACH, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH],
  t72b3_zubr_ii: [SMOKE_REACH, SMOKE_REACH, .338, SMOKE_REACH, SMOKE_REACH, SMOKE_REACH],
};
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

/** E7 (release 230, UA/PL round 11: one source for the build guard and frontEraPackages.selftest): the hatch opening
 * zones, each [x, z, r, plane]: a plan centre, a radius (the lid's plus 30 cm) and the plane nothing new may rise above
 * within r + .01. The hull zone (the driver's hatch) in each hull's own frame; the turret zones (the commander's cupola,
 * the loader's hatch) in the T-72B3M (2016) donor turret's frame, shared by the three. */
export type HatchZone = readonly [x: number, z: number, r: number, plane: number];
const DONOR_TURRET_HATCHES: readonly HatchZone[] = [[-.627, -.359, .74, .79], [.528, -.527, .63, .70]];
export const HATCH_ZONES: Readonly<Record<string, {hull: readonly HatchZone[]; turret: readonly HatchZone[]}>> = {
  t72b3m_hetman_ii: {hull: [[-.079, 1.72, .674, 1.54]], turret: DONOR_TURRET_HATCHES},
  t72b3_zubr: {hull: [[0, 1.59, .59, 1.46]], turret: DONOR_TURRET_HATCHES},
  t72b3_zubr_ii: {hull: [[0, 1.59, .59, 1.46]], turret: DONOR_TURRET_HATCHES},
};
/** E8 (round 11): the highest a Polish turret ERA module may stand (turret frame), at least .20 m under the lowest point
 * its WKM-B station sweeps (frontEraPackages.selftest re-derives it from the built sweep and asserts the cap is no
 * higher). Hetman II's 30 mm station clears its roof by nationalRoof.selftest's 8 mm instead. */
export const ROOF_ERA_CAP: Readonly<Record<string, number>> = {t72b3_zubr: .809, t72b3_zubr_ii: .844};

/** Round 11: a roof part's guard: E7 (nothing above a hatch zone's plane within its radius + .01), E8 (the Polish roof
 * cap), then the turret part's guards E3-E6. Throws with the part name. */
export function assertRoofPart(id: string, name: string, g: THREE.BufferGeometry): void {
  const zones = HATCH_ZONES[id]?.turret ?? [], cap = ROOF_ERA_CAP[id];
  eachVertex(g, p => {
    for (const [hx, hz, r, plane] of zones) if (Math.hypot(p.x - hx, p.z - hz) < r + .01 && p.y > plane - .01 + 1e-6)
      throw new Error(`${id}: ${name} stands ${(p.y - plane + .01).toFixed(4)} m into the hatch opening at (${hx}, ${hz}) (E7)`);
    if (cap !== undefined && p.y > cap + 1e-6) throw new Error(`${id}: ${name} rises to ${p.y.toFixed(4)}, over the roof cap ${cap} (E8)`);
  });
  assertTurretPart(id, name, g);
}

/** A roof tile's seat (round 11, generalised from polishRoofGrid): a plan rectangle of sides sx (along `dir`, a plan unit
 * vector) and sz (along `dir` turned 90 degrees towards +z), centred at (x, z), met by four Stock.top rays at its
 * corners; the plane through them (its normal from the diagonals, turned up), their centre, the lowest corner's offset
 * along the normal from the centre (a tile laid `low - .004` deep has its lowest corner 4 mm into the stock), and the
 * tile's axes in that plane (`along`, and `fwd` towards its front edge). */
export interface TileSeat { corners: THREE.Vector3[]; n: THREE.Vector3; centre: THREE.Vector3; low: number; along: THREE.Vector3;
  fwd: THREE.Vector3; sx: number; sz: number;
  /** Round 11: where the tile's flat bottom goes (its offset along n from the centre) so the curved seat under it (sampled
   * 7 x 7, its corners included) is met within frontEraPackages.selftest's seat contract (at most 6 mm off, 7 mm in): its
   * whole bottom 1 mm in where the seat bows 4.5 mm or less under the plane, else 5.5 mm in at the seat's highest point (a
   * seat bowing over 11.5 mm is refused); and the seat's lowest
   * point (a tile's face stands its height over it, so the curved seat never lifts its top). */
  bottom: number; seatLow: number }
export function seatOrientedTile(stock: Stock, x: number, z: number, dir: readonly [number, number], sx: number, sz: number): TileSeat {
  const l = Math.hypot(dir[0], dir[1]), d = [dir[0] / l, dir[1] / l], q = d[0] >= 0 ? [-d[1], d[0]] : [d[1], -d[0]];
  // (the across axis is the one with +z: a tile's front edge faces the vehicle's front)
  const p = q[1] >= 0 ? q : [-q[0], -q[1]];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const cx = x + a * d[0] * sx / 2 + b * p[0] * sz / 2, cz = z + a * d[1] * sx / 2 + b * p[1] * sz / 2;
    return new THREE.Vector3(cx, stock.top(cx, cz), cz);
  });
  const n = corners[2].clone().sub(corners[0]).cross(corners[3].clone().sub(corners[1])).normalize();
  if (n.y < 0) n.negate();
  const centre = corners.reduce((c, v) => c.add(v), new THREE.Vector3()).multiplyScalar(.25);
  const low = Math.min(...corners.map(v => v.clone().sub(centre).dot(n)));
  const along = new THREE.Vector3(d[0], 0, d[1]).addScaledVector(n, -(d[0] * n.x + d[1] * n.z)).normalize();
  const fwd = along.clone().cross(n).normalize();
  if (fwd.x * p[0] + fwd.z * p[1] < 0) fwd.negate();
  let lo = Infinity, hi = -Infinity;
  const grid = [-.5, -1 / 3, -1 / 6, 0, 1 / 6, 1 / 3, .5];
  for (const a of grid) for (const b of grid) {
    const cx = x + a * d[0] * sx + b * p[0] * sz, cz = z + a * d[1] * sx + b * p[1] * sz;
    const h = new THREE.Vector3(cx, stock.top(cx, cz), cz).sub(centre).dot(n);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  if (hi - lo > .0115) throw new Error(`${stock.name}: a tile at ${x.toFixed(3)}, ${z.toFixed(3)} spans a seat bowing ${(1000 * (hi - lo)).toFixed(1)} mm (11.5 mm)`);
  const bottom = hi - lo <= .0045 ? lo - .001 : hi - .0055;
  return {corners, n, centre, low, along, fwd, sx, sz, bottom, seatLow: lo};
}
/** seatOrientedTile for a plan rectangle [x0, x1, z0, z1] (|x|, mirrored by side), its sides along x and z. */
export function seatPlanTile(stock: Stock, side: number, rect: readonly [number, number, number, number]): TileSeat {
  const [X0, X1, z0, z1] = rect;
  return seatOrientedTile(stock, side * (X0 + X1) / 2, (z0 + z1) / 2, [1, 0], X1 - X0, z1 - z0);
}

/** Whether a plan rectangle [x0, x1, z0, z1] (signed x) keeps `margin` from every box (plan: min/max x and z). */
export function clearOf(rect: readonly [number, number, number, number], boxes: readonly THREE.Box3[], margin = .008): boolean {
  const [x0, x1, z0, z1] = rect;
  return boxes.every(b => b.min.x > Math.max(x0, x1) + margin || b.max.x < Math.min(x0, x1) - margin
    || b.min.z > z1 + margin || b.max.z < z0 - margin);
}

/** Round 11: a side-band (hull) part's guard: E1 (assertHullPart) and its keep-outs, boxes it keeps `margin` from in
 * 3-D (the cage's foot pads and rods, the camouflage carrier's brackets, the skirt joints' lap caps). */
export function assertBandPart(id: string, name: string, g: THREE.BufferGeometry, keepOuts: readonly THREE.Box3[], margin = .008): void {
  assertHullPart(id, name, g);
  g.computeBoundingBox();
  const b = g.boundingBox!.clone().expandByScalar(margin);
  for (const k of keepOuts) if (b.intersectsBox(k))
    throw new Error(`${id}: ${name} comes within ${margin} m of a keep-out at ${k.min.toArray().map(v => v.toFixed(3))}..${k.max.toArray().map(v => v.toFixed(3))}`);
}

/** Names a new frontal-package part (the receipt frontEraPackages.selftest finds every new part by this tag). */
export function tagFrontPart<T extends THREE.BufferGeometry>(g: T, name: string, owner: Owner): T {
  g.userData.frontEraPart ??= name;
  g.userData.frontEraOwner ??= owner;
  return g;
}

/** The highest hull stock (turret frame) at a plan radius about the ring, or null inside or beyond the measured span. */
function hullTopAt(e: FrontEnvelope, r: number): number | null {
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
 * 2.5 cm over the hull stock at their plan radius), E5 (at least .10 from every smoke launch line over its free length,
 * SMOKE_FREE) and E6 (under
 * the gunner's sight's lower ray over x .60-.97). Throws with the part name. */
export function assertTurretPart(id: string, name: string, g: THREE.BufferGeometry, o: {smoke?: number} = {}): void {
  tagFrontPart(g, name, 'turret');
  const e = frontEnvelope(id), smokeMin = o.smoke ?? .10, free = SMOKE_FREE[id];
  const d = new THREE.Vector3();
  eachVertex(g, p => {
    if (Math.abs(p.x) < .39 - 1e-4 && p.y > -.052 && p.y < .628 && p.z > .765 && p.z < 1.702)
      throw new Error(`${id}: ${name} enters the mantlet's sweep at x ${p.x.toFixed(3)}, y ${p.y.toFixed(3)}, z ${p.z.toFixed(3)}`);
    const r = Math.hypot(p.x, p.z), h = hullTopAt(e, r);
    if (h !== null && p.y < h + .025 - 1e-4)
      throw new Error(`${id}: ${name} drops to ${p.y.toFixed(3)} over hull stock ${h.toFixed(3)} at r ${r.toFixed(3)} (ring keep-out 2.5 cm; x ${p.x.toFixed(3)} z ${p.z.toFixed(3)})`);
    SMOKE_RAYS.forEach((r, k) => {
      // (past its free length the line has met existing stock)
      d.copy(p).sub(r.o); const t = d.dot(r.d);
      if (t > free[k]) return;
      const dist = d.addScaledVector(r.d, -Math.max(0, t)).length();
      if (dist < smokeMin) throw new Error(`${id}: ${name} is ${dist.toFixed(3)} from smoke launch line ${k}`);
    });
    if (p.x > .60 && p.x < .97 && p.z > .15 && p.y > .80 - .176 * (p.z - .15) + 1e-4)
      throw new Error(`${id}: ${name} enters the gunner's sight's lower ray at z ${p.z.toFixed(3)}`);
  });
}
