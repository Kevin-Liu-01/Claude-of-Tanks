/**
 * turretRingWell.ts — the ring area a destroyed tank's turret leaves on its hull (tank-opt RING stream, 2026-10-16; the
 * owner, 2026-10-15: "give tanks proper turret ring areas because when the turret blows off we should see that").
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-helper:turret-ring-well.
 *
 * Every procedural hull is closed under its turret (the tank-opt audit: 198 of 216 turreted tanks a flat deck, none an
 * opening). Rather than cut every hull, a wreck draws its ring on demand:
 *
 *  - The ring as built (`measureTurretRing`): the rig_turret seat, the deck top under it, the hull-side race's reach
 *    (inside the turret base, from the anatomy's turret-ring radius) and how far the deck falls away under the race's
 *    rim, in the rig_hull frame. tools/gen-combat-anatomy.mjs records it in every turreted tank's calibration receipt
 *    (`turretRing`), where the anatomy's turretRing volume centres on it too (combatAnatomy.ts alignTurretRing); a
 *    visual whose receipt is missing or stale measures its own build once (the same function).
 *  - A live wreck (battle, killcam, Studio, gallery): one flat plate seated on the deck, made at the kill
 *    (`createTurretRingPresentation().show`, from setDestroyed) and removed again at resetDestroyed, so an intact tank
 *    holds no extra mesh at all (its geometry fingerprint, sealed and watertight ledgers stay byte-identical). The plate
 *    draws the hull-side bearing race on its rim — the machined face, the bolt flange, a short skirt down to the deck —
 *    and inside the race fakes the well by tracing the view ray against a virtual cylinder: the race's lip, the traverse
 *    gear's teeth, soot-black walls down to the hull floor, the slip-ring stub and, on autoloader tanks, the carousel's
 *    cassettes; the sun reaches the well only through the opening and the sky only as much as the opening shows. One
 *    material for the whole fleet (per engine context: its cascade registration), one draw per wreck. The plate rides
 *    the hull's planned dents (CPU, once) and takes the vehicle's top coplanar depth layer, so a doubled deck plate under
 *    it (the T-72B3 builder's roof sheet, Type 10's slab, AMX-30's overlapping segments) can neither fight it nor draw
 *    over it.
 *  - A static map hulk (world/wrecks.ts): the bake cuts the deck inside the ring (`cutTurretRingAperture`) and merges
 *    the well as real geometry (`buildTurretRingWellGeometry`) into its one baked mesh: no extra draws.
 */
import * as THREE from 'three';
import { FIRST_PARTY_VEHICLE_AUTHORSHIP } from '../authorship.ts';
import {
  combatAnatomyCalibration, type AnatomyTurretRingReceipt,
} from './combatAnatomyCalibrationRegistry.ts';
import {
  resetVehicleGround, setVehicleGroundFromRoot, supportsShadowHook, vehicleAmbientFloorHook,
} from './materials.ts';

const TURRET_RING_WELL_ASSET_ID = 'urn:claude-of-tanks:vehicle-helper:turret-ring-well';
/** The plate's object name (the census and the bake find it by it). */
export const TURRET_RING_PLATE_NAME = 'turretRingPlate';
/** The plate sits this far over the deck top it measured (m): never the deck's own depth. */
export const TURRET_RING_LIFT_M = 0.004;
/** The race's machined face (m), inside the bolt flange. */
const RACE_FACE_M = 0.022;
/** The race's inner lip and the traverse gear's band under it (m below the deck). */
const LIP_M = 0.055;
const GEAR_M = 0.07;
const GEAR_TEETH = 96;
/** A surface rising this far over the deck round most of the ring (a dish's rim, a pocket's walls) is a wall the race
 *  keeps inside; anything lower (a collar, a doubled plate, a step under part of it) the race lies over (m). */
const WALL_RISE_M = 0.12;
/** The slip-ring stub at the well's axis: radius and height (m). */
const STUB_R_M = 0.09;
const STUB_H_M = 0.16;

/** The anatomy's carousel forms (combatAnatomy.ts visualForm) and their cassette counts. */
const CAROUSEL_CELLS: Readonly<Record<string, number>> = Object.freeze({
  azCarousel: 22,             // T-72, T-90, ZTZ: the AZ's 22 cassettes
  mzBasket: 28,               // T-64, T-80: the MZ's 28 cells
  unmannedTurretCarousel: 32, // T-14: the isolated carousel
});

/** The anatomy fields the ring reads (combatAnatomy.ts ModuleVolume, structurally). */
interface TurretRingModule {
  readonly module: string;
  readonly visualForm?: string;
  readonly turretLocal?: boolean;
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly shapes?: readonly { readonly radii?: readonly number[] }[];
}
interface TurretRingArmor {
  readonly turretless?: boolean;
  readonly modules?: readonly TurretRingModule[];
}

/** The well's carousel in the ring frame (m): cassette count, inner and outer radii, height over the floor. */
interface TurretRingCarousel { count: number; rIn: number; rOut: number; h: number }

/** The ring a wreck draws, in the rig_hull frame. */
export interface TurretRingSeat {
  /** The ring's axis (the built turret seat). */
  cx: number;
  cz: number;
  /** The race's plane: the deck top under the ring. */
  deckY: number;
  /** The opening (the race's inner edge) and the race's outer edge (m). */
  openR: number;
  rimR: number;
  /** How far the race's outer face reaches down to the deck under its rim (m). */
  skirt: number;
  /** The well's depth from the deck to the hull floor (m). */
  depth: number;
  carousel: TurretRingCarousel | null;
  /** Where it came from: the calibration receipt, or this build measured at the kill. */
  source: 'receipt' | 'measured';
}

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;
const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

/** The race's width (bolt flange and machined face), from its outer radius. */
function raceWidth(rimR: number): number { return clamp(0.075 * rimR, 0.05, 0.085); }

/** The anatomy's turret-ring radius (m): its fitted cylinders' lateral radius, else its box's half-width. */
export function turretRingRadius(armor: TurretRingArmor | null | undefined): number {
  const ring = armor?.modules?.find((entry) => entry.module === 'turretRing');
  if (!ring) return 0.85;
  let r = 0;
  for (const shape of ring.shapes || []) if (shape.radii && shape.radii[0] > r) r = shape.radii[0];
  if (!(r > 0.2)) r = 0.47 * (ring.max[0] - ring.min[0]);
  return clamp(Number.isFinite(r) ? r : 0.85, 0.45, 1.35);
}

// ---------------------------------------------------------------------------------------------------- the measure
// (CPU, once: the anatomy generator per turreted tank, or a live visual whose receipt is missing or stale)

type MeshVisitor = (mesh: THREE.Mesh, toHull: THREE.Matrix4) => void;

/** True when this mesh draws an opaque surface the ring can sit on or the turret stands on. */
function measurableMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.BatchedMesh).isBatchedMesh) return false;
  const data = mesh.userData;
  if (data.interiorFill || data.authoredShadowProxy || data.vehicleMarking || data.turretRingPlate) return false;
  if (!mesh.geometry?.getAttribute('position')) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => !!material && material.visible !== false && material.colorWrite !== false
    && !(material.transparent && (material.opacity ?? 1) < 0.98) && !(material.alphaTest > 0));
}

/** Every measurable mesh under `owner` (its first LOD level only, nothing hidden, not under `skip`), with its matrix to
 *  the hull frame. */
function visitMeshes(owner: THREE.Object3D, hullInverse: THREE.Matrix4, skip: THREE.Object3D | null, visit: MeshVisitor): void {
  const toHull = new THREE.Matrix4();
  const stack: THREE.Object3D[] = [owner];
  while (stack.length) {
    const object = stack.pop()!;
    if (object === skip || object.visible === false) continue;
    if (measurableMesh(object)) visit(object, toHull.multiplyMatrices(hullInverse, object.matrixWorld));
    const lod = object as THREE.LOD;
    if (lod.isLOD && lod.levels?.length) { stack.push(lod.levels[0].object); continue; }
    for (let i = object.children.length - 1; i >= 0; i--) stack.push(object.children[i]);
  }
}

type TriangleVisitor = (ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, flip: boolean, twoSided: boolean) => void;

const _ta = new THREE.Vector3(), _tb = new THREE.Vector3(), _tc = new THREE.Vector3();
function visitTriangles(mesh: THREE.Mesh, toHull: THREE.Matrix4, visit: TriangleVisitor): void {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const count = index ? index.count : position.count;
  const flip = toHull.determinant() < 0;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const twoSided = material?.side === THREE.DoubleSide;
  const e = toHull.elements;
  const identity = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && !e[1] && !e[2] && !e[4] && !e[6] && !e[8]
    && !e[9] && !e[12] && !e[13] && !e[14];
  for (let k = 0; k + 2 < count; k += 3) {
    const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
    _ta.fromBufferAttribute(position, i0);
    _tb.fromBufferAttribute(position, i1);
    _tc.fromBufferAttribute(position, i2);
    if (!identity) { _ta.applyMatrix4(toHull); _tb.applyMatrix4(toHull); _tc.applyMatrix4(toHull); }
    visit(_ta.x, _ta.y, _ta.z, _tb.x, _tb.y, _tb.z, _tc.x, _tc.y, _tc.z, flip, twoSided);
  }
}

const percentile = (values: number[], q: number): number => {
  if (!values.length) return NaN;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(q * (values.length - 1) + 0.5)))];
};

/**
 * The turret ring as built, in the rig_hull frame (the receipt the anatomy generator records, and a live visual's
 * fallback). `ringR` is the anatomy's turret-ring radius (turretRingRadius). Null when the hull shows no deck under the
 * seat.
 */
export function measureTurretRing(
  hullRig: THREE.Object3D,
  turretRig: THREE.Object3D,
  ringR: number,
): AnatomyTurretRingReceipt | null {
  hullRig.updateWorldMatrix(true, true);
  turretRig.updateWorldMatrix(true, true);
  const hullInverse = hullRig.matrixWorld.clone().invert();
  const seat = new THREE.Vector3().setFromMatrixPosition(turretRig.matrixWorld).applyMatrix4(hullInverse);
  const R = clamp(ringR, 0.3, 1.5);
  // the deck's top surface on a 2.5 cm grid round the seat (the highest up-facing opaque hull face per cell) and the
  // hull's underside (the lowest down-facing one: the belly, or a glacis running in under the ring)
  const cell = 0.025;
  const half = Math.max(0.7, R * 1.25);
  const n = Math.ceil((2 * half) / cell);
  const x0 = seat.x - half, z0 = seat.z - half;
  const top = new Float32Array(n * n).fill(-Infinity);
  const under = new Float32Array(n * n).fill(Infinity);
  const yLo = seat.y - 0.9, yHi = seat.y + 0.4, yBelly = seat.y - 1.8;
  visitMeshes(hullRig, hullInverse, turretRig, (mesh, toHull) => visitTriangles(mesh, toHull,
    (ax, ay, az, bx, by, bz, qx, qy, qz, flip, twoSided) => {
      const minX = Math.min(ax, bx, qx), maxX = Math.max(ax, bx, qx);
      const minZ = Math.min(az, bz, qz), maxZ = Math.max(az, bz, qz);
      if (maxX < x0 || minX > x0 + 2 * half || maxZ < z0 || minZ > z0 + 2 * half) return;
      if (Math.max(ay, by, qy) < yBelly || Math.min(ay, by, qy) > yHi) return;
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = qx - ax, e2y = qy - ay, e2z = qz - az;
      const nx = e1y * e2z - e1z * e2y, nz = e1x * e2y - e1y * e2x;
      let ny = e1z * e2x - e1x * e2z;
      const length = Math.hypot(nx, ny, nz);
      if (!(length > 1e-12)) return;
      if (flip) ny = -ny;
      // faces the sky (a surface the race can sit on, a steep wall's face included) or the ground (the hull's underside)
      const up = (twoSided ? Math.abs(ny) : ny) >= 0.02 * length;
      const down = (twoSided ? Math.abs(ny) : -ny) >= 0.2 * length;
      if (!up && !down) return;
      const d = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
      if (Math.abs(d) < 1e-14) return;
      const i0 = Math.max(0, Math.floor((minX - x0) / cell)), i1 = Math.min(n - 1, Math.floor((maxX - x0) / cell));
      const j0 = Math.max(0, Math.floor((minZ - z0) / cell)), j1 = Math.min(n - 1, Math.floor((maxZ - z0) / cell));
      for (let j = j0; j <= j1; j++) {
        const z = z0 + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * cell;
          const w0 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / d;
          if (w0 < -1e-7) continue;
          const w1 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / d;
          if (w1 < -1e-7 || w0 + w1 > 1 + 1e-7) continue;
          const y = w0 * ay + w1 * by + (1 - w0 - w1) * qy;
          const k = j * n + i;
          if (up && y >= yLo && y <= yHi && y > top[k]) top[k] = y;
          if (down && y >= yBelly && y < under[k]) under[k] = y;
        }
      }
    }));
  const heightsWithin = (r0: number, r1: number, field = top): number[] => {
    const out: number[] = [];
    for (let j = 0; j < n; j++) {
      const dz = z0 + (j + 0.5) * cell - seat.z;
      for (let i = 0; i < n; i++) {
        const dx = x0 + (i + 0.5) * cell - seat.x;
        const r = Math.hypot(dx, dz);
        const y = field[j * n + i];
        if (r >= r0 && r <= r1 && Number.isFinite(y)) out.push(y);
      }
    }
    return out;
  };
  const inner = heightsWithin(0, 0.8 * R);
  if (inner.length < 8) return null;
  const deck0 = percentile(inner, 0.5);
  // the turret base over the deck: per bearing (48 round the seat) the reach of the turret's geometry (rig_gun excluded)
  // in the band from just under the deck to 0.3 m over it, its triangles clipped to the band; the base's inscribed
  // reach is the 10th percentile of the bearings (a shell over a narrow neck counts: it covers what lies under it)
  const gun = turretRig.getObjectByName('rig_gun') ?? null;
  const bandLo = deck0 - 0.03, bandHi = deck0 + 0.3;
  const reach = new Float64Array(48);
  const note = (x: number, z: number): void => {
    const dx = x - seat.x, dz = z - seat.z;
    const r = Math.hypot(dx, dz);
    if (r < 0.05) return;
    const bin = Math.min(47, Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * 48));
    if (r > reach[bin]) reach[bin] = r;
  };
  const clipY = (poly: number[][], y: number, keepAbove: boolean): number[][] => {
    const res: number[][] = [];
    for (let k = 0; k < poly.length; k++) {
      const u = poly[k], v = poly[(k + 1) % poly.length];
      const fu = keepAbove ? u[1] - y : y - u[1], fv = keepAbove ? v[1] - y : y - v[1];
      if (fu >= 0) res.push(u);
      if ((fu >= 0) !== (fv >= 0)) {
        const t = fu / (fu - fv);
        res.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t]);
      }
    }
    return res;
  };
  visitMeshes(turretRig, hullInverse, gun, (mesh, toHull) => visitTriangles(mesh, toHull,
    (ax, ay, az, bx, by, bz, qx, qy, qz) => {
      if (Math.min(ay, by, qy) > bandHi || Math.max(ay, by, qy) < bandLo) return;
      const poly = clipY(clipY([[ax, ay, az], [bx, by, bz], [qx, qy, qz]], bandLo, true), bandHi, false);
      for (let k = 0; k < poly.length; k++) {
        const u = poly[k], v = poly[(k + 1) % poly.length];
        // the edge's middle too: a wide face's chord can pass well inside its two ends' bearings
        const steps = Math.max(1, Math.min(24, Math.ceil(Math.hypot(v[0] - u[0], v[2] - u[2]) / 0.08)));
        for (let s = 0; s < steps; s++) note(u[0] + (v[0] - u[0]) * (s / steps), u[2] + (v[2] - u[2]) * (s / steps));
      }
    }));
  const filled: number[] = [];
  for (const r of reach) if (r > 0) filled.push(r);
  const footR = filled.length >= 36 ? percentile(filled, 0.1) : Infinity;
  // the race: the anatomy's ring and its flange, inside the turret base (the plate never shows round a seated turret)
  // and inside a wall rising round most of it (the rim of a dish or a pocket the turret sits down in: the race lies on
  // the floor within it); a wall's edge on each of 48 bearings, the race inside it on all but 30 % of them
  const w = raceWidth(R + 0.07);
  let rimR = R + w;
  if (Number.isFinite(footR)) rimR = Math.min(rimR, footR - 0.02);
  rimR = Math.max(0.15, rimR);
  const inside = heightsWithin(0, 0.7 * rimR);
  const level = inside.length ? percentile(inside, 0.9) : deck0;
  const wallY = level + WALL_RISE_M;
  const above = (x: number, z: number): boolean => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    return i >= 0 && j >= 0 && i < n && j < n && top[j * n + i] > wallY;
  };
  const walls: number[] = [];
  for (let b = 0; b < 48; b++) {
    const a = ((b + 0.5) / 48) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    let edge = rimR;
    for (let r = 0.25 * rimR; r <= rimR; r += cell * 0.5) {
      // two samples in a row over the wall's height: a wall, not one cell's stray face
      if (above(seat.x + sx * r, seat.z + sz * r) && above(seat.x + sx * (r + cell), seat.z + sz * (r + cell))) { edge = r; break; }
    }
    walls.push(edge);
  }
  const wallR = percentile(walls, 0.3);
  if (wallR < rimR) rimR = Math.max(0.15, wallR - 0.005);
  // its plane: over the deck top across the race's disc (its 75th percentile: a fitting or a glacis running in under part
  // of the turret does not lift it) and over the race's own annulus (its 95th percentile short of a wall's height: a
  // collar, a step, a doubled or coplanar deck plate under the race lifts it, so none of them stands over the plate; the
  // skirt closes the gap under the rim); the skirt reaches the deck just outside the rim (its 10th percentile)
  const disc = heightsWithin(0, rimR);
  const discTop = disc.length ? percentile(disc, 0.75) : deck0;
  const annulus = heightsWithin(rimR - raceWidth(rimR) - 0.01, rimR).filter((y) => y <= Math.max(discTop, wallY));
  const deckY = Math.max(discTop, annulus.length ? percentile(annulus, 0.95) : -Infinity);
  const outside = heightsWithin(rimR, rimR + 0.06);
  const rimBand = outside.length >= 8 ? outside : heightsWithin(0.85 * rimR, rimR);
  const low = rimBand.length ? percentile(rimBand, 0.1) : deckY;
  const skirt = clamp(deckY - low + 0.006, 0.006, 0.25);
  // the well's floor: a floor plate's height over the highest of the hull's undersides under the opening, so a hulk's
  // well stays inside its hull wherever a glacis or a sponson runs in under the ring
  const bellies = heightsWithin(0, rimR - raceWidth(rimR), under);
  const floorY = bellies.length >= 8 ? Math.min(deckY - 0.3, percentile(bellies, 0.98) + 0.1) : deckY - 0.9;
  return {
    seat: [round4(seat.x), round4(seat.y), round4(seat.z)],
    deckY: round4(deckY),
    rimR: round4(rimR),
    skirt: round4(skirt),
    footR: round4(Number.isFinite(footR) ? footR : rimR + 0.02),
    floorY: round4(floorY),
  };
}

/** The ring a wreck draws from its receipt (or its own measure) and the anatomy: the well's floor (the receipt's; a
 *  receipt without one, the calibrated hull's belly plus its floor plate) and the autoloader's carousel. */
export function turretRingSeatFrom(
  receipt: AnatomyTurretRingReceipt,
  armor: TurretRingArmor | null | undefined,
  hullFloorY: number | null,
  source: TurretRingSeat['source'],
): TurretRingSeat {
  const rimR = receipt.rimR;
  const openR = Math.max(0.5 * rimR, rimR - raceWidth(rimR));
  const receiptFloor = receipt.floorY;
  const floorY = typeof receiptFloor === 'number' && Number.isFinite(receiptFloor) ? receiptFloor
    : hullFloorY !== null && Number.isFinite(hullFloorY) ? hullFloorY + 0.12 : receipt.deckY - 0.9;
  const depth = clamp(receipt.deckY - floorY, 0.3, 1.3);
  let carousel: TurretRingCarousel | null = null;
  for (const entry of armor?.modules || []) {
    const count = entry.visualForm ? CAROUSEL_CELLS[entry.visualForm] : undefined;
    if (!count || entry.turretLocal) continue;
    const span = Math.min(entry.max[0] - entry.min[0], entry.max[2] - entry.min[2]);
    const rOut = clamp(0.5 * span, 0.3, openR - 0.05);
    const top = entry.max[1];
    carousel = {
      count,
      rOut,
      rIn: Math.max(0.14, rOut - 0.36),
      h: clamp(Number.isFinite(top) ? top - (receipt.deckY - depth) : 0.3, 0.12, 0.42 * depth),
    };
    break;
  }
  return {
    cx: receipt.seat[0], cz: receipt.seat[2], deckY: receipt.deckY, openR, rimR, skirt: receipt.skirt, depth,
    carousel, source,
  };
}

// ---------------------------------------------------------------------------------------------------- live plate

const _corner = new THREE.Vector3();

/**
 * The plate in the ring's frame (origin on the ring's axis at the race's top): the race's disc as concentric rings out
 * to the rim (so a dent can bend it), its skirt down to the deck. Attributes: position, normal, cotRingUv (the undented
 * ring-plane point the well's trace starts from), cotRingA (opening radius, well depth, rim radius, part: 0 disc,
 * 1 skirt), cotRingB (carousel cells, inner and outer radius, height).
 */
export function buildTurretRingPlateGeometry(seat: TurretRingSeat, high: boolean): THREE.BufferGeometry {
  const segments = high ? 48 : 24;
  const radii = [0, 0.33 * seat.openR, 0.66 * seat.openR, seat.openR, seat.openR + RACE_FACE_M, seat.rimR];
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  const skirtDown = seat.skirt + TURRET_RING_LIFT_M;
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, part: number): number => {
    position.push(x, y, z); normal.push(nx, ny, nz); uv.push(x, z, part);
    return position.length / 3 - 1;
  };
  const centre = vertex(0, 0, 0, 0, 1, 0, 0);
  let previous: number[] = [];
  for (let ring = 1; ring < radii.length; ring++) {
    const current: number[] = [];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      current.push(vertex(Math.sin(a) * radii[ring], 0, Math.cos(a) * radii[ring], 0, 1, 0, 0));
    }
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      // counter-clockwise seen from above (+y): the disc faces up
      if (ring === 1) index.push(centre, current[s], current[s1]);
      else index.push(previous[s], current[s], current[s1], previous[s], current[s1], previous[s1]);
    }
    previous = current;
  }
  // the race's outer face, down to the deck under the rim (its own vertices: an outward normal)
  const upper: number[] = [], lower: number[] = [];
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    upper.push(vertex(sx * seat.rimR, 0, sz * seat.rimR, sx, 0, sz, 1));
    lower.push(vertex(sx * seat.rimR, -skirtDown, sz * seat.rimR, sx, 0, sz, 1));
  }
  for (let s = 0; s < segments; s++) {
    const s1 = (s + 1) % segments;
    index.push(upper[s], lower[s], lower[s1], upper[s], lower[s1], upper[s1]);
  }
  const vertices = position.length / 3;
  const ringA = new Float32Array(vertices * 4), ringB = new Float32Array(vertices * 4), ringUv = new Float32Array(vertices * 2);
  const car = seat.carousel;
  for (let i = 0; i < vertices; i++) {
    ringUv[i * 2] = uv[i * 3];
    ringUv[i * 2 + 1] = uv[i * 3 + 1];
    ringA.set([seat.openR, seat.depth, seat.rimR, uv[i * 3 + 2]], i * 4);
    ringB.set(car ? [car.count, car.rIn, car.rOut, car.h] : [0, 0, 0, 0], i * 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('cotRingUv', new THREE.BufferAttribute(ringUv, 2));
  geometry.setAttribute('cotRingA', new THREE.BufferAttribute(ringA, 4));
  geometry.setAttribute('cotRingB', new THREE.BufferAttribute(ringB, 4));
  geometry.setIndex(index);
  geometry.userData.provenance = { ...FIRST_PARTY_VEHICLE_AUTHORSHIP, assetId: TURRET_RING_WELL_ASSET_ID };
  return geometry;
}

/** A dent field (materials.ts makeBurnUniforms uCrHull / uCrHullDir, the hull frame): centre and R², inward direction
 *  and depth. */
interface TurretRingDents { readonly centres: readonly THREE.Vector4[]; readonly dirs: readonly THREE.Vector4[] }

/** Bend the plate with the hull's dents at full depth ((1 − r²/R²)² · depth along each dent, as the burn hook's vertex
 *  stage bends the deck under it). `origin` is the plate's origin in the hull frame. */
export function dentTurretRingPlate(geometry: THREE.BufferGeometry, origin: THREE.Vector3, dents: TurretRingDents): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  let moved = false;
  for (let i = 0; i < position.count; i++) {
    _corner.fromBufferAttribute(position, i).add(origin);
    let dx = 0, dy = 0, dz = 0;
    for (let k = 0; k < dents.centres.length; k++) {
      const c = dents.centres[k], d = dents.dirs[k];
      if (!(c.w > 0)) continue;
      const ex = _corner.x - c.x, ey = _corner.y - c.y, ez = _corner.z - c.z;
      const r2 = ex * ex + ey * ey + ez * ez;
      if (r2 >= c.w) continue;
      const q = 1 - r2 / c.w;
      dx += d.x * q * q * d.w; dy += d.y * q * q * d.w; dz += d.z * q * q * d.w;
    }
    if (dx || dy || dz) { position.setXYZ(i, position.getX(i) + dx, position.getY(i) + dy, position.getZ(i) + dz); moved = true; }
  }
  if (moved) position.needsUpdate = true;
}

/**
 * The well's look on the plate (MeshStandardMaterial chunks; the vehicle's ambient-floor hook runs first). After
 * color_fragment: the race on the rim, or inside the opening the view ray (camera to fragment, in the ring's frame)
 * against the virtual well — wall |q + t·v| = R, the floor, the carousel's top and the stub's — with the hit's albedo,
 * normal, roughness, its share of the sun (the sun ray from the hit leaves through the opening) and of the sky (the
 * opening's view factor). The normal replaces the plate's after normal_fragment_maps; the light shares scale the
 * received light after every lift (before aomap_fragment, as the gear cavities do).
 */
const TURRET_RING_WELL_VERTEX_PARS = /* glsl */`
attribute vec2 cotRingUv;
attribute vec4 cotRingA;
attribute vec4 cotRingB;
varying vec2 vCotRingUv;
varying vec4 vCotRingA;
varying vec4 vCotRingB;
varying vec3 vCotRingX;
varying vec3 vCotRingY;
varying vec3 vCotRingZ;
`;
const TURRET_RING_WELL_VERTEX = /* glsl */`
vCotRingUv = cotRingUv;
vCotRingA = cotRingA;
vCotRingB = cotRingB;
vCotRingX = normalize( ( modelViewMatrix * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz );
vCotRingY = normalize( ( modelViewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
vCotRingZ = normalize( ( modelViewMatrix * vec4( 0.0, 0.0, 1.0, 0.0 ) ).xyz );
`;
const TURRET_RING_WELL_FRAGMENT_PARS = /* glsl */`
varying vec2 vCotRingUv;
varying vec4 vCotRingA;
varying vec4 vCotRingB;
varying vec3 vCotRingX;
varying vec3 vCotRingY;
varying vec3 vCotRingZ;
float cotRingHash( float n ) { return fract( sin( n * 12.9898 ) * 43758.5453 ); }
float cotRingNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = cotRingHash( i.x + i.y * 57.0 ), b = cotRingHash( i.x + 1.0 + i.y * 57.0 );
  float c = cotRingHash( i.x + ( i.y + 1.0 ) * 57.0 ), d = cotRingHash( i.x + 1.0 + ( i.y + 1.0 ) * 57.0 );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`;
const TURRET_RING_WELL_FRAGMENT = /* glsl */`
float cotRingSun = 1.0;
float cotRingSky = 1.0;
float cotRingRough = 0.82;
float cotRingMetal = 0.1;
bool cotRingInWell = false;
vec3 cotRingN = vec3( 0.0, 1.0, 0.0 );
{
  float R = vCotRingA.x, depth = vCotRingA.y, rimR = vCotRingA.z;
  vec2 q = vCotRingUv;
  float rr = length( q );
  float ang = atan( q.x, q.y );
  vec3 base;
  if ( vCotRingA.w > 0.5 ) {
    // the race's outer face, oxide and soot
    base = vec3( 0.074, 0.060, 0.047 );
  } else if ( rr > R ) {
    // the race: its machined face (scorched steel), then the bolt flange with a bolt head every 7.5 degrees
    float band = rr - R;
    if ( band < ${RACE_FACE_M.toFixed(3)} ) {
      base = vec3( 0.150, 0.142, 0.130 );
      cotRingRough = 0.42; cotRingMetal = 0.55;
    } else {
      base = vec3( 0.088, 0.071, 0.054 );
      float bolt = abs( fract( ang / 6.2831853 * 48.0 ) - 0.5 );
      float mid = 0.5 * ( ${RACE_FACE_M.toFixed(3)} + ( rimR - R ) );
      if ( bolt < 0.16 && abs( band - mid ) < 0.011 ) { base = vec3( 0.125, 0.112, 0.098 ); cotRingRough = 0.55; cotRingMetal = 0.4; }
    }
  } else {
    cotRingInWell = true;
    vec3 V = normalize( -vViewPosition );
    vec3 v = vec3( dot( V, vCotRingX ), dot( V, vCotRingY ), dot( V, vCotRingZ ) );
    vec2 v2 = v.xz;
    float a = dot( v2, v2 ), b = dot( q, v2 ), c = dot( q, q ) - R * R;
    float tWall = a > 1e-8 ? ( -b + sqrt( max( b * b - a * c, 0.0 ) ) ) / a : 1e9;
    float down = max( -v.y, 1e-4 );
    float tFloor = depth / down;
    float t = min( tWall, tFloor );
    int kind = tFloor <= tWall ? 1 : 0;   // 0 wall, 1 floor, 2 carousel top, 3 stub top
    float carH = vCotRingB.w;
    if ( carH > 0.0 ) {
      float tCar = ( depth - carH ) / down;
      vec2 hc = q + v2 * tCar;
      float rc = length( hc );
      if ( tCar < t && rc > vCotRingB.y && rc < vCotRingB.z ) { t = tCar; kind = 2; }
    }
    {
      float tStub = ( depth - ${STUB_H_M.toFixed(2)} ) / down;
      if ( tStub < t && length( q + v2 * tStub ) < ${STUB_R_M.toFixed(2)} ) { t = tStub; kind = 3; }
    }
    vec3 H = vec3( q.x, 0.0, q.y ) + v * t;
    float dep = max( -H.y, 0.0 );
    float hr = length( H.xz );
    float hAng = atan( H.x, H.z );
    if ( kind == 0 ) {
      cotRingN = vec3( -H.x, 0.0, -H.z ) / max( hr, 1e-4 );
      if ( dep < ${LIP_M.toFixed(3)} ) { base = vec3( 0.135, 0.128, 0.118 ); cotRingRough = 0.45; cotRingMetal = 0.5; }
      else if ( dep < ${(LIP_M + GEAR_M).toFixed(3)} ) {
        // the traverse gear's teeth: lit tips, dark roots
        float tooth = fract( hAng / 6.2831853 * ${GEAR_TEETH.toFixed(1)} );
        base = tooth < 0.5 ? vec3( 0.11, 0.105, 0.095 ) : vec3( 0.03, 0.028, 0.026 );
        cotRingRough = 0.5; cotRingMetal = 0.45;
      } else {
        // soot-black wall, a little blacker down the well
        base = mix( vec3( 0.034, 0.031, 0.028 ), vec3( 0.018, 0.016, 0.015 ), smoothstep( 0.1, 0.9, dep ) );
      }
    } else if ( kind == 2 ) {
      // the carousel: its cassettes round the ring (projectile inboard, charge outboard), some cooked off
      float cells = vCotRingB.x;
      float cellF = hAng / 6.2831853 * cells;
      float inCell = fract( cellF );
      float cooked = step( 0.68, cotRingHash( floor( cellF ) + 7.0 ) );
      float mid = mix( vCotRingB.y, vCotRingB.z, 0.45 );
      base = hr < mid ? vec3( 0.094, 0.088, 0.072 ) : vec3( 0.084, 0.068, 0.042 );
      base *= mix( 1.0, 0.42, cooked );
      if ( inCell < 0.06 || inCell > 0.94 ) base = vec3( 0.016 );
    } else if ( kind == 3 ) {
      base = vec3( 0.07, 0.068, 0.064 ); cotRingRough = 0.6; cotRingMetal = 0.35;
    } else {
      // the floor: soot, ash drifted in soft patches
      float ash = cotRingNoise( H.xz * 7.0 ) * 0.65 + cotRingNoise( H.xz * 19.0 + 3.1 ) * 0.35;
      base = mix( vec3( 0.03, 0.028, 0.025 ), vec3( 0.07, 0.067, 0.062 ), smoothstep( 0.55, 0.85, ash ) );
    }
    // the sun reaches the hit only through the opening; the sky as much as the opening shows it
    #if NUM_DIR_LIGHTS > 0
      vec3 Ld = directionalLights[ 0 ].direction;
      vec3 L = vec3( dot( Ld, vCotRingX ), dot( Ld, vCotRingY ), dot( Ld, vCotRingZ ) );
      if ( L.y > 0.02 ) {
        vec2 exitXZ = H.xz + L.xz * ( dep / L.y );
        cotRingSun = 1.0 - smoothstep( R - 0.03, R + 0.01, length( exitXZ ) );
      } else cotRingSun = 0.0;
    #endif
    float view = kind == 0 ? 0.5 * ( 1.0 - dep / sqrt( dep * dep + 4.0 * R * R ) ) : R * R / ( R * R + dep * dep );
    cotRingSky = mix( 0.05, 1.0, clamp( view * 1.15, 0.0, 1.0 ) );
    cotRingRough = kind == 0 && dep >= ${(LIP_M + GEAR_M).toFixed(3)} ? 0.92 : cotRingRough;
    if ( kind == 1 ) cotRingRough = 0.95;
  }
  diffuseColor.rgb = base;
}
`;
const TURRET_RING_WELL_NORMAL = /* glsl */`
if ( cotRingInWell ) normal = normalize( vCotRingX * cotRingN.x + vCotRingY * cotRingN.y + vCotRingZ * cotRingN.z );
`;
const TURRET_RING_WELL_LIGHT = /* glsl */`
reflectedLight.directDiffuse *= cotRingSun;
reflectedLight.directSpecular *= cotRingSun;
reflectedLight.indirectDiffuse *= cotRingSky;
reflectedLight.indirectSpecular *= cotRingSky;
`;

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** Splice the well into a MeshStandardMaterial program (after the vehicle's own hooks). */
function turretRingWellShaderHook(shader: MaterialShader): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${TURRET_RING_WELL_VERTEX_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${TURRET_RING_WELL_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${TURRET_RING_WELL_FRAGMENT_PARS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>\n${TURRET_RING_WELL_FRAGMENT}`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cotRingRough;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = cotRingMetal;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TURRET_RING_WELL_NORMAL}`)
    .replace('#include <aomap_fragment>', `${TURRET_RING_WELL_LIGHT}\n#include <aomap_fragment>`);
}

interface RingEngineContext {
  setupShadowMaterial?: <T extends THREE.Material>(material: T, extraHook?: typeof vehicleAmbientFloorHook) => T;
  releaseShadowMaterial?: (material: THREE.Material) => boolean;
}

const RING_MATERIALS = new WeakMap<object, THREE.MeshStandardMaterial>();
const NO_ENGINE: object = Object.freeze({});

/** The fleet's one ring material for an engine context (its cascade registration; a stub's or a tool's takes the
 *  hooks directly). Compiled once (the covered wreck warm stages a plate: createTurretRingPresentation.stageWarm). */
export function turretRingWellMaterial(engineCtx: RingEngineContext | null | undefined): THREE.MeshStandardMaterial {
  const key = engineCtx ?? NO_ENGINE;
  const cached = RING_MATERIALS.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.1 });
  material.name = 'TurretRingWell';
  material.userData.vehicleMaterialRole = 'turretRingWell';
  material.userData.provenance = { ...FIRST_PARTY_VEHICLE_AUTHORSHIP, assetId: TURRET_RING_WELL_ASSET_ID };
  const hook = (shader: MaterialShader): void => {
    vehicleAmbientFloorHook(shader);
    turretRingWellShaderHook(shader);
  };
  if (engineCtx && supportsShadowHook(engineCtx) && engineCtx.setupShadowMaterial) {
    engineCtx.setupShadowMaterial(material, hook);
  } else material.onBeforeCompile = hook;
  material.customProgramCacheKey = () => 'turret-ring-well-v1';
  RING_MATERIALS.set(key, material);
  return material;
}

/** The plate mesh: seated on the ring (hull frame), the vehicle's ground reference and its top coplanar layer per draw. */
function turretRingPlateMesh(
  seat: TurretRingSeat,
  material: THREE.MeshStandardMaterial,
  root: THREE.Object3D,
  high: boolean,
  dents: TurretRingDents | null,
): THREE.Mesh {
  const geometry = buildTurretRingPlateGeometry(seat, high);
  const origin = new THREE.Vector3(seat.cx, seat.deckY + TURRET_RING_LIFT_M, seat.cz);
  if (dents) dentTurretRingPlate(geometry, origin, dents);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = TURRET_RING_PLATE_NAME;
  mesh.position.copy(origin);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.turretRingPlate = true;
  mesh.userData.turretRingSeat = seat;
  mesh.userData.provenance = { ...FIRST_PARTY_VEHICLE_AUTHORSHIP, assetId: TURRET_RING_WELL_ASSET_ID };
  mesh.onBeforeRender = function turretRingPlateBefore(_renderer, _scene, _camera, _geometry, drawn) {
    setVehicleGroundFromRoot(root);
    if (drawn !== material) return;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = -((Number(root.userData.coplanarDepthLayerCount) || 0) + 1);
  };
  mesh.onAfterRender = function turretRingPlateAfter() { resetVehicleGround(); };
  return mesh;
}

interface TurretRingPresentationOptions {
  specId: string;
  root: THREE.Object3D;
  hull: THREE.Object3D;
  turret: THREE.Object3D;
  armor: TurretRingArmor;
  engineCtx: RingEngineContext | null | undefined;
  /** HIGH geometry: the plate's finer rings. */
  high: boolean;
  /** A rendered visual draws a plate; a geometry-only one (a hulk's bake) keeps only the seat. */
  rendered: boolean;
  /** The hull's planned dents at the kill (planLiveCrumple), or null. */
  dents: () => TurretRingDents | null;
}

interface TurretRingPresentation {
  /** The ring as built (hull frame); measured once, while the turret is seated. Null on a turretless hull. */
  seat(): TurretRingSeat | null;
  /** The kill: the plate on the hull (rendered visuals), after the wreck sweep captured the live materials. */
  show(): void;
  /** The rematch and dispose: the plate leaves and its geometry is freed; the intact tank holds nothing of it. */
  hide(): void;
  /** The covered wreck warm: a plate on the hull while its programs compile; the restore takes it off again. */
  stageWarm(): () => void;
}

/** The ring of one visual (tankFactoryCore.ts: setDestroyed shows it, resetDestroyed and dispose hide it). */
export function createTurretRingPresentation(options: TurretRingPresentationOptions): TurretRingPresentation {
  const { specId, root, hull, turret, armor, engineCtx, high, rendered } = options;
  let cached: TurretRingSeat | null | undefined;
  let plate: THREE.Mesh | null = null;
  const hullLocal = new THREE.Matrix4();
  const seatScratch = new THREE.Vector3();

  function hasTurret(): boolean {
    if (armor?.turretless) return false;
    let found = false;
    turret.traverse((object) => { if (!found && (object as THREE.Mesh).isMesh) found = true; });
    return found;
  }

  function resolve(): TurretRingSeat | null {
    if (cached !== undefined) return cached;
    if (!hasTurret()) { cached = null; return null; }
    const calibration = combatAnatomyCalibration(specId);
    const hullFloorY = calibration?.hull?.min?.[1] ?? null;
    // the live seat in the hull frame (the turret group and the hull group are siblings under the root)
    hullLocal.compose(hull.position, hull.quaternion, hull.scale).invert();
    seatScratch.copy(turret.position).applyMatrix4(hullLocal);
    const receipt = calibration?.turretRing;
    if (receipt && Math.abs(receipt.seat[0] - seatScratch.x) < 0.03 && Math.abs(receipt.seat[1] - seatScratch.y) < 0.03
        && Math.abs(receipt.seat[2] - seatScratch.z) < 0.03) {
      cached = turretRingSeatFrom(receipt, armor, hullFloorY, 'receipt');
      return cached;
    }
    // no receipt (a tool's build, a tank the anatomy update has not reached) or a stale one: this build, once
    root.updateMatrixWorld(true);
    const measured = measureTurretRing(hull, turret, turretRingRadius(armor));
    cached = measured ? turretRingSeatFrom(measured, armor, hullFloorY, 'measured') : null;
    return cached;
  }

  function attach(): THREE.Mesh | null {
    const seat = resolve();
    if (!seat) return null;
    const mesh = turretRingPlateMesh(seat, turretRingWellMaterial(engineCtx), root, high, options.dents());
    hull.add(mesh);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function detach(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }

  return {
    seat: resolve,
    show() {
      if (!rendered) { resolve(); return; }
      if (plate) return;
      plate = attach();
    },
    hide() {
      detach(plate);
      plate = null;
    },
    stageWarm() {
      if (!rendered || plate) return () => {};
      const warm = attach();
      return () => detach(warm);
    },
  };
}

// ---------------------------------------------------------------------------------------------------- static hulks

/** One quad (or, with `d` null, one triangle), wound to face `n` (the bake's material is one-sided). */
function pushQuad(out: number[], normals: number[], a: number[], b: number[], c: number[], d: number[] | null,
  n: number[]): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const facing = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const tris = facing >= 0 ? (d ? [a, b, c, a, c, d] : [a, b, c]) : (d ? [a, c, b, a, d, c] : [a, c, b]);
  for (const p of tris) { out.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]); }
}

/**
 * The well as real geometry for a hulk's bake (hull frame, non-indexed position and normal): the race's top and outer
 * face, its lip, the step in to the traverse gear's band, the wall down to the floor, the floor, the slip-ring stub and
 * the carousel's cassettes (a hulk's one vertex-coloured mesh carries the char, not the teeth). HIGH 48 segments.
 */
export function buildTurretRingWellGeometry(seat: TurretRingSeat, high = false): THREE.BufferGeometry {
  const segments = high ? 48 : 32;
  const out: number[] = [], normals: number[] = [];
  const top = seat.deckY + TURRET_RING_LIFT_M;
  const lip = seat.deckY - LIP_M, floor = seat.deckY - seat.depth;
  const gearR = seat.openR - 0.018;
  const at = (r: number, a: number, y: number): number[] => [seat.cx + Math.sin(a) * r, y, seat.cz + Math.cos(a) * r];
  const inward = (a: number): number[] => [-Math.sin(a), 0, -Math.cos(a)];
  const up = [0, 1, 0];
  for (let s = 0; s < segments; s++) {
    const a0 = (s / segments) * Math.PI * 2, a1 = ((s + 1) / segments) * Math.PI * 2, am = (a0 + a1) / 2;
    // the race's top and its outer face to the deck
    pushQuad(out, normals, at(seat.openR, a0, top), at(seat.rimR, a0, top), at(seat.rimR, a1, top), at(seat.openR, a1, top), up);
    pushQuad(out, normals, at(seat.rimR, a0, top), at(seat.rimR, a1, top), at(seat.rimR, a1, seat.deckY - seat.skirt),
      at(seat.rimR, a0, seat.deckY - seat.skirt), [Math.sin(am), 0, Math.cos(am)]);
    // the lip, the step in to the gear's band, the wall below it, the floor
    pushQuad(out, normals, at(seat.openR, a0, top), at(seat.openR, a1, top), at(seat.openR, a1, lip), at(seat.openR, a0, lip), inward(am));
    pushQuad(out, normals, at(gearR, a0, lip), at(seat.openR, a0, lip), at(seat.openR, a1, lip), at(gearR, a1, lip), up);
    pushQuad(out, normals, at(gearR, a0, lip), at(gearR, a1, lip), at(gearR, a1, floor), at(gearR, a0, floor), inward(am));
    pushQuad(out, normals, [seat.cx, floor, seat.cz], at(gearR, a0, floor), at(gearR, a1, floor), null, up);
  }
  // the slip-ring stub (six sides and its top)
  for (let s = 0; s < 6; s++) {
    const a0 = (s / 6) * Math.PI * 2, a1 = ((s + 1) / 6) * Math.PI * 2, am = (a0 + a1) / 2;
    pushQuad(out, normals, at(STUB_R_M, a0, floor + STUB_H_M), at(STUB_R_M, a1, floor + STUB_H_M), at(STUB_R_M, a1, floor),
      at(STUB_R_M, a0, floor), [Math.sin(am), 0, Math.cos(am)]);
    pushQuad(out, normals, [seat.cx, floor + STUB_H_M, seat.cz], at(STUB_R_M, a0, floor + STUB_H_M),
      at(STUB_R_M, a1, floor + STUB_H_M), null, up);
  }
  // the carousel: its cassettes standing on the floor (top, inner face, the two sides; the outer face meets the wall)
  const car = seat.carousel;
  if (car) {
    const gap = 0.12 / car.count;
    const yT = floor + car.h;
    for (let k = 0; k < car.count; k++) {
      const a0 = (k / car.count) * Math.PI * 2 + gap, a1 = ((k + 1) / car.count) * Math.PI * 2 - gap, am = (a0 + a1) / 2;
      pushQuad(out, normals, at(car.rIn, a0, yT), at(car.rOut, a0, yT), at(car.rOut, a1, yT), at(car.rIn, a1, yT), [0, 1, 0]);
      pushQuad(out, normals, at(car.rIn, a0, yT), at(car.rIn, a1, yT), at(car.rIn, a1, floor), at(car.rIn, a0, floor), inward(am));
      for (const [a, s] of [[a0, -1], [a1, 1]] as const) {
        pushQuad(out, normals, at(car.rIn, a, yT), at(car.rOut, a, yT), at(car.rOut, a, floor), at(car.rIn, a, floor),
          [Math.cos(a) * s, 0, -Math.sin(a) * s]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.userData.provenance = { ...FIRST_PARTY_VEHICLE_AUTHORSHIP, assetId: TURRET_RING_WELL_ASSET_ID };
  return geometry;
}

/** The deck cut a hulk's well takes: the opening's prism (a 16-gon round the opening, the race's top covering its
 *  corners' 2 % of its radius) from just under the floor to just over the deck, in the hull frame. */
export interface TurretRingCut {
  cx: number;
  cz: number;
  r: number;
  yLo: number;
  yHi: number;
  /** A crossing triangle wholly under the race (inside this radius) or wholly under the deck (below this height) is
   *  dropped whole: the race's top, its skirt, the well's wall and the deck beyond it hide what it leaves. */
  coverR: number;
  coverY: number;
}
export function turretRingCut(seat: TurretRingSeat): TurretRingCut {
  return {
    cx: seat.cx, cz: seat.cz, r: seat.openR, yLo: seat.deckY - seat.depth - 0.02, yHi: seat.deckY + 0.03,
    coverR: seat.rimR - 0.004, coverY: seat.deckY - 0.02,
  };
}

const CUT_SIDES = 16;

/**
 * Remove a geometry's parts inside the ring's prism (`toHull` takes its positions to the hull frame): a triangle clear of
 * it is copied as it is, one inside it is dropped, one across it keeps its outside pieces (clipped against each side
 * and the two caps in turn) — or, when nothing of it can show (wholly under the race or under the deck: the hull's inside,
 * behind the well's wall; or `coarse`, the generated interior fills' voxel blocks), is dropped whole. Returns the same
 * geometry when nothing touches the prism, else a new non-indexed one with position and normal (the bake keeps no other
 * attribute).
 */
export function cutTurretRingAperture(
  geometry: THREE.BufferGeometry,
  cut: TurretRingCut,
  toHull: THREE.Matrix4 | null = null,
  coarse = false,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position) return geometry;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  // the 48-gon's sides stand at the opening's radius: it circumscribes the opening (the race's top covers the corners)
  const planes: number[][] = [];
  for (let k = 0; k < CUT_SIDES; k++) {
    const a = ((k + 0.5) / CUT_SIDES) * Math.PI * 2;
    planes.push([Math.sin(a), 0, Math.cos(a), cut.r]);
  }
  // the caps: outside means y below yLo or above yHi
  planes.push([0, -1, 0, -cut.yLo], [0, 1, 0, cut.yHi]);
  const reach = cut.r / Math.cos(Math.PI / CUT_SIDES);
  const p = new THREE.Vector3();
  const corner = (i: number): number[] => {
    p.fromBufferAttribute(position, i);
    if (toHull) p.applyMatrix4(toHull);
    const nx = normal ? normal.getX(i) : 0, ny = normal ? normal.getY(i) : 1, nz = normal ? normal.getZ(i) : 0;
    return [p.x, p.y, p.z, nx, ny, nz, position.getX(i), position.getY(i), position.getZ(i)];
  };
  // signed distance outside a plane (> 0 outside), in the hull frame
  const outside = (v: number[], pl: number[]): number => pl[1] === 0
    ? (v[0] - cut.cx) * pl[0] + (v[2] - cut.cz) * pl[2] - pl[3]
    : v[1] * pl[1] - pl[3];
  const lerp = (u: number[], w: number[], t: number): number[] => u.map((value, k) => value + (w[k] - value) * t);
  const clip = (poly: number[][], pl: number[], keepOutside: boolean): number[][] => {
    const res: number[][] = [];
    for (let k = 0; k < poly.length; k++) {
      const u = poly[k], w = poly[(k + 1) % poly.length];
      const fu = keepOutside ? outside(u, pl) : -outside(u, pl), fw = keepOutside ? outside(w, pl) : -outside(w, pl);
      if (fu >= 0) res.push(u);
      if ((fu >= 0) !== (fw >= 0)) res.push(lerp(u, w, fu / (fu - fw)));
    }
    return res;
  };
  const kept: number[] = [], keptNormal: number[] = [];
  let touched = false;
  // a corner as it was (`exact`: its own normal's bits), or a clipped one (its interpolated normal renormalized)
  const emit = (v: number[], exact = false): void => {
    kept.push(v[6], v[7], v[8]);
    const l = exact ? 1 : Math.hypot(v[3], v[4], v[5]) || 1;
    keptNormal.push(v[3] / l, v[4] / l, v[5] / l);
  };
  // geometry-frame positions of the clipped corners: carried as attributes 6..8, interpolated like the rest
  for (let k = 0; k + 2 < count; k += 3) {
    const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
    const tri = [corner(i0), corner(i1), corner(i2)];
    const minY = Math.min(tri[0][1], tri[1][1], tri[2][1]), maxY = Math.max(tri[0][1], tri[1][1], tri[2][1]);
    const minX = Math.min(tri[0][0], tri[1][0], tri[2][0]), maxX = Math.max(tri[0][0], tri[1][0], tri[2][0]);
    const minZ = Math.min(tri[0][2], tri[1][2], tri[2][2]), maxZ = Math.max(tri[0][2], tri[1][2], tri[2][2]);
    if (maxY < cut.yLo || minY > cut.yHi || maxX < cut.cx - reach || minX > cut.cx + reach
        || maxZ < cut.cz - reach || minZ > cut.cz + reach) {
      for (const v of tri) emit(v, true);
      continue;
    }
    // wholly outside one side or cap: as it is
    if (planes.some((pl) => tri.every((v) => outside(v, pl) >= 0))) {
      for (const v of tri) emit(v, true);
      continue;
    }
    touched = true;
    if (coarse || maxY < cut.coverY
        || tri.every((v) => Math.hypot(v[0] - cut.cx, v[2] - cut.cz) <= cut.coverR)) continue;
    // the outside pieces: (tri ∩ inside the planes before k ∩ outside plane k), plane by plane; the rest is inside
    let rest = tri;
    for (const pl of planes) {
      const piece = clip(rest, pl, true);
      for (let k = 1; k + 1 < piece.length; k++) { emit(piece[0]); emit(piece[k]); emit(piece[k + 1]); }
      rest = clip(rest, pl, false);
      if (rest.length < 3) break;
    }
  }
  if (!touched) return geometry;
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(keptNormal, 3));
  result.userData = { ...geometry.userData };
  return result;
}
