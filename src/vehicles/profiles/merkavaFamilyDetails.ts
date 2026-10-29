// Merkava family detail parts (release 262, the owner 2026-10-27: "these look bad and need much more detail and geometry
// and need to match the geometry of these" — the supplied Mk 1B, 2B, 2D, 3C, 3D and 4B source models). Every detail the
// sources carry (hatches, the add-on turret packages, the skirt panels and sponson boxes, stowage, lights, smoke
// launchers, sights) is drawn as a first-party primitive at its measured centre, size and attitude
// (merkavaFamilySource.ts): a rounded box, a cylinder for the round hatches, a tube along its own axis for each smoke
// discharger (the clusters' tubes and housings measured one by one), a plate cut to its measured outline (the side
// skirts' panels with their wavy lower edges), or a twin headlamp across its group's measured box. Add-on turret armour is the spec's
// removable package (destructibleCluster), its side by the part's x.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { tankSeedId } from '../tankIdAliases.ts';
import type { SourcePart } from './merkavaFamilySource.ts';
import { loftMeasuredSolid, type ShellSolid } from './merkavaFamilyTurret.ts';
import { revolveZ } from './merkavaFamilyGun.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Detail roles as the source fit names them (merkavaFamilySource.ts SourcePart role). */
const ROLE = Object.freeze({ hatch: 1, hullArmor: 2, turretArmor: 3, stowage: 4, lantern: 5, smoke: 6, optic: 7 });

const q = new THREE.Quaternion(), e = new THREE.Euler();
/** A loft's canonical frame (sections u, v along w) into the part's own frame, by its long axis; each a rotation. */
const LOFT_BASES = [
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)),
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
  new THREE.Matrix4(),
];

/** A loft part's solid in its own frame: its back and front end sections joined along its long axis. */
function loftGeometry(p: SourcePart): THREE.BufferGeometry {
  const ax = p[13]!, t0 = p[14]!, t1 = p[15]!;
  const ring = (at: number): SectionPoint[] => Array.from({ length: 6 }, (_, k): SectionPoint => [p[at + k * 2]!, p[at + k * 2 + 1]!]);
  return sectionSolid([{ z: t0, ring: ring(16) }, { z: t1, ring: ring(28) }], { sideQuadDiagonal: 'convex' })
    .applyMatrix4(LOFT_BASES[ax]!);
}

/** A plate part's solid in its own frame: its measured outline extruded between its two faces along its axis. */
function plateGeometry(p: SourcePart): THREE.BufferGeometry {
  const ax = p[13]!, t0 = p[14]!, t1 = p[15]!;
  const ring = Array.from({ length: (p.length - 16) / 2 }, (_, k): SectionPoint => [p[16 + k * 2]!, p[17 + k * 2]!]);
  return sectionSolid([{ z: t0, ring }, { z: t1, ring }]).applyMatrix4(LOFT_BASES[ax]!);
}

/** A discharger tube open at its mouth, in its own frame along +Z: the wall, a rim round the bore, the bore's floor set
 *  back (the sources' open mouths, not a capped stub), the closed breech. */
function openTubeGeometry(r: number, len: number, seg: number): THREE.BufferGeometry {
  const bore = r * 0.78, depth = Math.min(0.06, len * 0.5), front = len / 2;
  const wall = new THREE.CylinderGeometry(r, r, len, seg, 1, true).rotateX(Math.PI / 2);
  const inner = new THREE.CylinderGeometry(bore, bore, depth, seg, 1, true).rotateX(Math.PI / 2).translate(0, 0, front - depth / 2);
  // the bore's wall faces inward
  const index = inner.getIndex()!, normal = inner.getAttribute('normal');
  for (let i = 0; i < index.count; i += 3) { const a = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, a); }
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  const rim = new THREE.RingGeometry(bore, r, seg).translate(0, 0, front);
  const floor = new THREE.CircleGeometry(bore, seg).translate(0, 0, front - depth);
  const breech = new THREE.CircleGeometry(r, seg).rotateY(Math.PI).translate(0, 0, -front);
  return KIT.mergeAll([wall, inner, rim, floor, breech]);
}

/** A rolled tarp about its axis (0 x, 1 y, 2 z) across its measured box: the roll, and at each end its coil's layers
 *  as steps standing proud of one another. */
function rollGeometry(axis: number, sx: number, sy: number, sz: number, seg: number): THREE.BufferGeometry {
  const len = [sx, sy, sz][axis]!, r = ([sx, sy, sz].filter((_, k) => k !== axis).reduce((a, b) => a + b, 0)) / 4, h = len / 2 - 0.02, d = 0.01;
  const g = revolveZ([[-h - 2 * d, 0], [-h - 2 * d, r * 0.36], [-h - d, r * 0.36], [-h - d, r * 0.7], [-h, r * 0.7], [-h, r],
    [h, r], [h, r * 0.7], [h + d, r * 0.7], [h + d, r * 0.36], [h + 2 * d, r * 0.36], [h + 2 * d, 0]], seg);
  return axis === 0 ? g.rotateY(Math.PI / 2) : axis === 1 ? g.rotateX(-Math.PI / 2) : g;
}

/** The part's geometry in its own frame (centred, axis-aligned), oriented and placed in the owner's frame. */
function partGeometry(p: SourcePart, offset: readonly [number, number, number], seg: number): THREE.BufferGeometry {
  const [kind, , cx, cy, cz, sx, sy, sz, qx, qy, qz, qw] = p as readonly number[] as [number, number, number, number,
    number, number, number, number, number, number, number, number];
  let g: THREE.BufferGeometry;
  if (kind === 1) g = KIT.cylY(Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, seg);
  else if (kind === 3) g = markSmokeTube(openTubeGeometry(Math.max(sx, sy) / 2, sz, seg));
  else if (kind === 4) {
    try { g = loftGeometry(p); } catch { g = KIT.box(sx, sy, sz); }
  } else if (kind === 5) {
    try { g = plateGeometry(p); } catch { g = KIT.box(sx, sy, sz); }
  } else if (kind === 7) g = rollGeometry(p[13]!, sx, sy, sz, seg);
  else g = KIT.box(sx, sy, sz);
  q.set(qx, qy, qz, qw).normalize();
  e.setFromQuaternion(q);
  return KIT.xform(g, cx - offset[0], cy - offset[1], cz - offset[2], e.x, e.y, e.z);
}

/** Lens and tube faces need their own geometry: the part's front (+Z) face in the owner's frame. */
function frontFace(p: SourcePart, offset: readonly [number, number, number], inset: number,
  build: (w: number, h: number) => THREE.BufferGeometry): THREE.BufferGeometry {
  const [, , cx, cy, cz, sx, sy, sz, qx, qy, qz, qw] = p as readonly number[] as [number, number, number, number, number,
    number, number, number, number, number, number, number];
  const g = KIT.xform(build(sx, sy), 0, 0, sz / 2 + inset);
  q.set(qx, qy, qz, qw).normalize();
  e.setFromQuaternion(q);
  return KIT.xform(g, cx - offset[0], cy - offset[1], cz - offset[2], e.x, e.y, e.z);
}

/** An add-on turret armour module as measured: its side's package, the axis its solids were cut along (0: x, fitted in
 *  the frame (-z, y, x), a quarter turn about y from the hull's; 2: z) and its solids. */
export interface TurretModule {
  readonly side: 'R' | 'L';
  readonly axis: 0 | 2;
  readonly solids: readonly ShellSolid[];
  /** Where the module was fitted as plane-bounded runs (each face one flat plate): those, in place of its solids. */
  readonly runs?: readonly ModuleRun[] | undefined;
  /** Where it was fitted as its faces' own plates (platefit.py): those, in place of its solids and runs. */
  readonly plates?: readonly ModulePlate[] | undefined;
}

/** One face of a module as a plate: its plane's origin and frame (u, v and the outward normal, as a quaternion), its
 *  outline and holes in that plane, and the depth it runs inward. */
export interface ModulePlate {
  readonly o: readonly [number, number, number];
  readonly q: readonly [number, number, number, number];
  readonly depth: number;
  readonly outer: readonly SectionPoint[];
  readonly holes: readonly (readonly SectionPoint[])[];
}

/** One run of a module: its solids cut along its own local z, and the quaternion turning that frame into the hull's. */
export interface ModuleRun {
  readonly q: readonly [x: number, y: number, z: number, w: number];
  readonly solids: readonly ShellSolid[];
}

/** Measured solids in their owner's frame (offset subtracted): cut along z, or along x (fitted in the frame (-z, y, x),
 *  a quarter turn about y back). */
function solidsGeometry(solids: readonly ShellSolid[], axis: 0 | 2, offset: readonly [number, number, number]): THREE.BufferGeometry[] {
  return solids.flatMap((solid) => {
    const g = loftMeasuredSolid(solid.z.map((z, s) => ({ z, ring: solid.rings[s]! })));
    if (!g) return [];
    if (axis === 0) g.rotateY(Math.PI / 2);
    return [g.translate(-offset[0], -offset[1], -offset[2])];
  });
}

const runQ = new THREE.Quaternion(), runP = new THREE.Vector3();
/** The plate's foremost point in the hull frame (its outline's corners on its face). */
export function modulePlateFront(plate: ModulePlate): number {
  runQ.set(plate.q[0], plate.q[1], plate.q[2], plate.q[3]).normalize();
  let front = -Infinity;
  for (const [u, v] of plate.outer) front = Math.max(front, runP.set(u, v, 0).applyQuaternion(runQ).z + plate.o[2]);
  return front;
}

/** The run's foremost point in the hull frame (its corners turned by its frame). */
export function moduleRunFront(run: ModuleRun): number {
  runQ.set(run.q[0], run.q[1], run.q[2], run.q[3]).normalize();
  let front = -Infinity;
  for (const solid of run.solids) {
    solid.z.forEach((z, s) => { for (const [x, y] of solid.rings[s]!) front = Math.max(front, runP.set(x, y, z).applyQuaternion(runQ).z); });
  }
  return front;
}
/** A plate in the turret frame: its outline (less its holes) extruded inward from its face. */
function facePlateGeometry(plate: ModulePlate, pivot: readonly [number, number, number]): THREE.BufferGeometry | null {
  if (plate.outer.length < 3) return null;
  const shape = new THREE.Shape(plate.outer.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const hole of plate.holes) if (hole.length >= 3) shape.holes.push(new THREE.Path(hole.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: plate.depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -plate.depth);
  runQ.set(plate.q[0], plate.q[1], plate.q[2], plate.q[3]).normalize();
  return g.applyQuaternion(runQ).translate(plate.o[0] - pivot[0], plate.o[1] - pivot[1], plate.o[2] - pivot[2]);
}

/** A module's solids in the turret frame: its plates, else its runs each turned from its own frame, else its solids. */
function moduleGeometry(m: TurretModule, pivot: readonly [number, number, number]): THREE.BufferGeometry[] {
  if (m.plates) return m.plates.flatMap((plate) => { const g = facePlateGeometry(plate, pivot); return g ? [g] : []; });
  if (!m.runs) return solidsGeometry(m.solids, m.axis, pivot);
  return m.runs.flatMap((run) => {
    runQ.set(run.q[0], run.q[1], run.q[2], run.q[3]).normalize();
    return run.solids.flatMap((solid) => {
      const g = loftMeasuredSolid(solid.z.map((z, s) => ({ z, ring: solid.rings[s]! })));
      return g ? [g.applyQuaternion(runQ).translate(-pivot[0], -pivot[1], -pivot[2])] : [];
    });
  });
}

/** A large source piece fitted as measured solids (bigpieces.py): its owner, its detail role, whether it stood in for a
 *  loft (the pale kit's bags and rolls), the axis its solids were cut along and the solids. */
export interface SolidPart {
  readonly owner: 0 | 1;
  readonly role: number;
  readonly loft: boolean;
  readonly axis: 0 | 2;
  readonly solids: readonly ShellSolid[];
}

/** The bustle basket as measured (basketfit.py, hull frame): bars (two ends and a radius) along the rails, posts and
 *  frames' tubes, and the box-like pieces (the floor, mesh panels, strips, posts, cans: centre, size, quaternion). */
export interface MerkavaBasket {
  readonly bars: readonly (readonly number[])[];
  readonly boxes: readonly (readonly number[])[];
}

const UP = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
/** Draws the measured basket in the turret frame: each bar a six-sided member between its ends, each box-like piece its
 *  oriented box. The sources hang no ball-and-chain curtain under it. */
export function buildMerkavaBasket(P: TankBuilderPort, basket: MerkavaBasket, pivot: readonly [number, number]): void {
  const [py, pz] = pivot;
  for (const [x0, y0, z0, x1, y1, z1, r] of basket.bars as readonly (readonly [number, number, number, number, number, number, number])[]) {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    if (len < 0.005) continue;
    q.setFromUnitVectors(UP, dir.set((x1 - x0) / len, (y1 - y0) / len, (z1 - z0) / len));
    e.setFromQuaternion(q);
    P.add('turretOpenLattice', KIT.cylY(r, r, len, 6), (x0 + x1) / 2, (y0 + y1) / 2 - py, (z0 + z1) / 2 - pz, e.x, e.y, e.z);
  }
  for (const [cx, cy, cz, sx, sy, sz, qx, qy, qz, qw] of basket.boxes as readonly (readonly [number, number, number, number,
    number, number, number, number, number, number])[]) {
    q.set(qx, qy, qz, qw).normalize();
    e.setFromQuaternion(q);
    P.add('turretPaintedDetail', KIT.box(sx, sy, sz), cx, cy - py, cz - pz, e.x, e.y, e.z);
  }
}

/** A bustle tarp as measured (tarpfit.py, hull frame): its plan grid (the first cell's centre, the cell size, columns and
 *  rows) and each cell's cloth top and hem, NaN where the cloth leaves the cell open. */
export interface MerkavaTarp {
  readonly x0: number;
  readonly z0: number;
  readonly cell: number;
  readonly nx: number;
  readonly nz: number;
  readonly top: Float32Array;
  readonly hem: Float32Array;
}

/** Draws a tarp in the turret frame as one draped canvas solid: its top through the cells' measured tops (a quad where
 *  four neighbouring cells are covered), its skirt walls from the top's edge down to the hem, its underside under them;
 *  vertex normals shared, so the cloth reads soft. */
export function buildMerkavaTarp(P: TankBuilderPort, tarp: MerkavaTarp, pivot: readonly [number, number]): void {
  const [py, pz] = pivot, { x0, z0, cell, nx, nz, top, hem } = tarp;
  const positions: number[] = [], index: number[] = [];
  const vt = new Int32Array(nx * nz).fill(-1), vb = new Int32Array(nx * nz).fill(-1);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!Number.isFinite(top[k]!)) continue;
      vt[k] = positions.length / 3; positions.push(x0 + i * cell, top[k]! - py, z0 + j * cell - pz);
      vb[k] = positions.length / 3; positions.push(x0 + i * cell, hem[k]! - py, z0 + j * cell - pz);
    }
  }
  // each top triangle's edges: an edge only one triangle uses is the cloth's rim (kept with its winding)
  const rim = new Map<number, [number, number] | null>();
  const edge = (a: number, b: number): void => {
    const key = a < b ? a * nx * nz + b : b * nx * nz + a;
    rim.set(key, rim.has(key) ? null : [a, b]);
  };
  for (let j = 0; j + 1 < nz; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
      if (vt[a]! < 0 || vt[b]! < 0 || vt[c]! < 0 || vt[d]! < 0) continue;
      index.push(vt[a]!, vt[d]!, vt[c]!, vt[a]!, vt[c]!, vt[b]!);
      index.push(vb[a]!, vb[c]!, vb[d]!, vb[a]!, vb[b]!, vb[c]!);
      edge(a, d); edge(d, c); edge(c, a); edge(a, c); edge(c, b); edge(b, a);
    }
  }
  for (const e of rim.values()) {
    if (!e) continue;
    const [u, v] = e;
    index.push(vt[v]!, vt[u]!, vb[u]!, vt[v]!, vb[u]!, vb[v]!);
  }
  if (!index.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // the cloth's texture from above, its skirts' running down
  g.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((v, i) => (i % 3 === 0 ? [v] : i % 3 === 2 ? [v - positions[i - 1]!] : [])), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  P.add('turretCanvasPale', g);
}

/** The hull armour's bolt heads as measured (studfit.py: x, y, z and size, hull frame): a small cube each on its panel's
 *  armour owner, the skirt panels' track guards outboard of the track lane (they leave with their panel), else the hull's
 *  appliqué. Drawn at HIGH only (some 350-1,100 a mark). */
export function buildMerkavaStuds(P: TankBuilderPort, studs: readonly (readonly number[])[]): void {
  if (!P.q) return;
  for (const [x, y, z, size] of studs as readonly (readonly [number, number, number, number])[]) {
    P.addExternalArmor(Math.abs(x) > 1.70 ? (x > 0 ? 'hullTrackGuardL' : 'hullTrackGuardR') : 'hull', KIT.box(size, size, size), x, y, z);
  }
}

/** Draws a mark's measured details: hull parts in the hull frame, turret parts in the turret frame (pivot subtracted),
 *  and the turret armour modules' solids in their side's removable package. */
export function buildMerkavaSourceDetails(P: TankBuilderPort, parts: readonly SourcePart[], pivot: readonly [number, number, number],
  modules: readonly TurretModule[], solidParts: readonly SolidPart[]): void {
  const seg = P.q ? 20 : 12, none: readonly [number, number, number] = [0, 0, 0];
  const turretArmor: Record<'R' | 'L', SourcePart[]> = { R: [], L: [] };
  for (const p of parts) {
    const owner = p[1]!, cx = p[2]!, sx = p[5]!, sy = p[6]!, sz = p[7]!, role = p[12]!;
    const onTurret = owner === 1, off = onTurret ? pivot : none;
    switch (role) {
      case ROLE.hatch:
        P.add(onTurret ? 'turretHatch' : 'hullHatch', partGeometry(p, off, seg));
        break;
      case ROLE.hullArmor: {
        // skirt panels outboard of the track lane ride the track-guard buckets; sponson boxes and plates are appliqué
        const skirt = Math.abs(cx) > 1.70 && sy > 0.30 && sz > 0.30 && sx < 0.30;
        P.addExternalArmor(skirt ? (cx > 0 ? 'hullTrackGuardL' : 'hullTrackGuardR') : 'hull', partGeometry(p, none, seg));
        break;
      }
      case ROLE.turretArmor:
        if (onTurret) turretArmor[cx > 0 ? 'R' : 'L'].push(p);
        else P.addExternalArmor('hull', partGeometry(p, none, seg));
        break;
      case ROLE.lantern:
        if (p[0] === 6) {
          // a twin headlamp: the square housing across its measured box, a rim round each of its two lenses forward
          const h = Math.min(sy, sx / 2), cy = p[3]!, cz = p[4]!, front = cz + sz / 2;
          P.add('hullDetail', KIT.box(sx, sy, sz), cx, cy, cz);
          for (const side of [-1, 1]) {
            P.add('hullDetail', KIT.cylZ(h * 0.44, 0.024, seg), cx + side * sx / 4, cy, front + 0.008);
            P.addEquipment('hullGlass', markVehicleNightLens(KIT.xform(KIT.cylZ(h * 0.36, 0.012, seg), cx + side * sx / 4, cy, front + 0.018),
              'headlight'));
          }
          break;
        }
        // the lamp's pieces (housing, guard, lens); the lens on each forward-facing, unrotated piece with a face to carry it
        P.add(onTurret ? 'turretDetail' : 'hullDetail', partGeometry(p, off, seg));
        if (Math.abs(p[11]!) > 0.999 && sx * sy >= 0.004 && (onTurret || p[4]! > 0)) {
          P.addEquipment(onTurret ? 'turretGlass' : 'hullGlass', markVehicleNightLens(
            frontFace(p, off, 0.004, (w, h) => KIT.box(Math.max(0.04, w * 0.7), Math.max(0.03, h * 0.6), 0.008)), 'headlight'));
        }
        break;
      case ROLE.smoke:
        // a discharger tube as measured (its muzzle marked for the launch effect) with its dark bore, or the housing
        // round a cluster of them
        P.add('turretDetail', partGeometry(p, off, seg));
        if (p[0] === 3) {
          // the bore's floor in shadow, set back inside the open mouth
          const depth = Math.min(0.06, p[7]! * 0.5);
          P.add('turretDark', frontFace(p, off, 0.001 - depth, (w, h) => KIT.cylZ(Math.max(w, h) * 0.37, 0.002, 12)));
        }
        break;
      case ROLE.optic:
        P.add(onTurret ? 'turretDetail' : 'hullDetail', partGeometry(p, off, seg));
        P.add(onTurret ? 'turretGlass' : 'hullGlass',
          frontFace(p, off, 0.003, (w, h) => KIT.box(Math.max(0.03, w * 0.7), Math.max(0.02, h * 0.35), 0.008)));
        break;
      case ROLE.stowage:
        // the Merkava's pale kit (FSP-06): the large irregular pieces (bags, tarps, rolls: lofts) in pale canvas, the
        // boxes and cans in fitting paint
        P.add(p[0] === 4 || p[0] === 7 ? (onTurret ? 'turretCanvasPale' : 'hullCanvasPale') : (onTurret ? 'turretPaintedDetail' : 'hullPaintedDetail'),
          partGeometry(p, off, seg));
        break;
      default:
        if (sx * sy * sz > 1e-6) P.add(onTurret ? 'turretPaintedDetail' : 'hullPaintedDetail', partGeometry(p, off, seg));
    }
  }
  // the large pieces as measured solids, in their roles' buckets
  const turretSolids: Record<'R' | 'L', THREE.BufferGeometry[]> = { R: [], L: [] };
  for (const part of solidParts) {
    const onTurret = part.owner === 1, off = onTurret ? pivot : none;
    const geos = solidsGeometry(part.solids, part.axis, off);
    for (const g of geos) {
      g.computeBoundingBox();
      const b = g.boundingBox!, cx = (b.min.x + b.max.x) / 2, sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
      switch (part.role) {
        case ROLE.hatch: P.add(onTurret ? 'turretHatch' : 'hullHatch', g); break;
        case ROLE.hullArmor: {
          const skirt = Math.abs(cx) > 1.70 && sy > 0.30 && sz > 0.30 && sx < 0.30;
          P.addExternalArmor(skirt ? (cx > 0 ? 'hullTrackGuardL' : 'hullTrackGuardR') : 'hull', g);
          break;
        }
        case ROLE.turretArmor:
          if (onTurret) turretSolids[cx > 0 ? 'R' : 'L'].push(g);
          else P.addExternalArmor('hull', g);
          break;
        case ROLE.stowage:
          P.add(part.loft ? (onTurret ? 'turretCanvasPale' : 'hullCanvasPale') : (onTurret ? 'turretPaintedDetail' : 'hullPaintedDetail'), g);
          break;
        case ROLE.lantern: case ROLE.optic: P.add(onTurret ? 'turretDetail' : 'hullDetail', g); break;
        default: P.add(onTurret ? 'turretPaintedDetail' : 'hullPaintedDetail', g);
      }
    }
  }
  // the add-on turret armour: the spec's two removable packages (schema-1 names, tankIdAliases.ts; `_R` on +X)
  for (const side of ['R', 'L'] as const) {
    const mods = modules.filter((m) => m.side === side);
    if (!turretArmor[side].length && !mods.length && !turretSolids[side].length) continue;
    const sector = `merkava_${tankSeedId(P.spec.id)}_turret_era_${side}`;
    P.destructibleCluster(sector, () => {
      for (const p of turretArmor[side]) P.addExternalArmor('turret', partGeometry(p, pivot, seg));
      for (const m of mods) for (const g of moduleGeometry(m, pivot)) P.addExternalArmor('turret', g);
      for (const g of turretSolids[side]) P.addExternalArmor('turret', g);
    });
  }
}
