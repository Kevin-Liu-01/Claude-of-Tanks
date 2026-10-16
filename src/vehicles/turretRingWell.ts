/**
 * turretRingWell.ts — the ring area a destroyed tank's turret leaves on its hull (tank-opt RING stream, 2026-10-16; the
 * owner, 2026-10-15: "give tanks proper turret ring areas because when the turret blows off we should see that").
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-helper:turret-ring-well.
 *
 * Every procedural hull is closed under its turret (the tank-opt audit: 198 of 216 turreted tanks a flat deck, none an
 * opening). Rather than cut every intact hull, a wreck cuts its own at the kill:
 *
 *  - The ring as built (`measureTurretRing`): the rig_turret seat, the deck the race lies on (the deck round its rim),
 *    the race's reach (inside the turret base, from the anatomy's turret-ring radius) and how far the deck falls away
 *    under its rim, in the rig_hull frame. tools/gen-combat-anatomy.mjs records it in every turreted tank's calibration
 *    receipt (`turretRing`), where the anatomy's turretRing volume centres on it too (combatAnatomy.ts alignTurretRing);
 *    a visual whose receipt is missing or stale measures its own build once (the same function).
 *  - The ring's prism: one polygon round the race's rim (HIGH 64 sides, LOW 48; `turretRingSides`), from under the
 *    deck's plates to the turret's band. A live wreck (battle, killcam, Studio, gallery) swaps every hull mesh crossing
 *    it for a copy without it at the kill (`cutTurretRingMeshes`, as the gun's bend swaps its meshes), and back at the
 *    rematch, so an intact tank holds nothing of it (its geometry fingerprint, sealed and watertight ledgers stay
 *    byte-identical). Inside the prism nothing of the hull is left to stand over the ring: no deck (doubled or not),
 *    no collar, no fitting under the turret, no deck triangle tilted across it by a dent. The cut's new corners on the
 *    polygon are the hull's own vertices, so the burn hook's vertex dents (materials.ts CRUMPLE_NORMAL_GLSL) bend the
 *    deck there exactly as they bend the plate's rim on the same polygon.
 *  - One plate on rig_hull fills the polygon (made at the kill, removed at the rematch): the hull-side bearing race on
 *    its rim — the machined face, the bolt flange — and inside the race the well faked by tracing the view ray against
 *    a virtual cylinder: the race's lip, the traverse gear's teeth, soot-black walls down to the hull floor, the
 *    slip-ring stub and, on autoloader tanks, the carousel's cassettes; the sun reaches the well only through the
 *    opening and the sky only as much as the opening shows. Round its rim a band closes the cut faces the polygon left
 *    in the hull, bearing by bearing (down past the deck where it falls away under the race; up to the deck where it
 *    stands over the race's plane). The plate takes the hull's dents on the CPU (the field at its vertices, ramped with
 *    the burn clock as the shader ramps the hull's: `ramp`), one draw per wreck, one program for the fleet.
 *  - A static map hulk (world/wrecks.ts): the bake cuts the same prism out of every hull part (exactly: what lies outside
 *    it is kept, clipped, never dropped whole) and merges the well as real geometry with the same band
 *    (`buildTurretRingWellGeometry`) into its one baked mesh: no extra draws.
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
/** The race's top stands this far over the deck it measured (m). */
export const TURRET_RING_LIFT_M = 0.004;
/** The race's machined face (m), inside the bolt flange. */
const RACE_FACE_M = 0.022;
/** The race's inner lip and the traverse gear's band under it (m below the deck). */
const LIP_M = 0.055;
const GEAR_M = 0.07;
const GEAR_TEETH = 96;
/** A surface rising this far over the deck round most of the ring (a dish's rim, a pocket's walls) is a wall the race
 *  keeps inside; anything lower (a collar, a doubled plate, a step under part of it) the cut takes (m). */
const WALL_RISE_M = 0.12;
/** The slip-ring stub at the well's axis: radius and height (m). */
const STUB_R_M = 0.09;
const STUB_H_M = 0.16;
/** A live cut reaches this far under the race (m): past the deck's plates, so no deck face under the ring is left for
 *  a dent to tilt up through the plate (the plate covers what lies deeper). */
const LIVE_CUT_DEPTH_M = 0.2;
/** Every cut reaches this far over the race (m): the turret's band (nothing of the hull's stands higher under it). */
const CUT_RISE_M = 0.35;
/** The band reaches this far past the deck it closes under the race (m). */
const BAND_PAD_M = 0.01;
/** A hulk's band reaches further under the deck: its cut faces are the crumpled hull's, and the deck's cut edge bows
 *  between its corners where the race's edge runs straight (m). */
const HULK_BAND_PAD_M = 0.03;
/** And this far over a cut face it closes over the race (m). */
const BAND_TOP_M = 0.002;
/** The burn hook's dent ramp (materials.ts CRUMPLE_NORMAL_GLSL: smoothstep( 0.0, 0.35, uBurnT )). */
const DENT_RAMP_S = 0.35;

/** The polygon the plate's rim and the hull's cut share: corner k at bearing 2πk/sides (x = sin, z = cos). */
export function turretRingSides(high: boolean): number { return high ? 64 : 48; }

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
  /** The race's plane: the deck round its rim. */
  deckY: number;
  /** The opening (the race's inner edge) and the race's outer edge (m). */
  openR: number;
  rimR: number;
  /** How far the deck falls away under the race's rim where no cut face says (m). */
  skirt: number;
  /** The well's depth from the deck to the hull floor (m). */
  depth: number;
  /** The well's wall under the race's lip (m): the gear's band, or narrower where the hull's skin is (a ledge). */
  wellR: number;
  /** The nearest the hull's skin comes to the ring's axis under the lip as posed (m; Infinity: not within a crumple's
   *  reach of the well's wall). */
  skinR: number;
  carousel: TurretRingCarousel | null;
  /** Where it came from: the calibration receipt, or this build measured at the kill. */
  source: 'receipt' | 'measured';
}

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;
const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

type NumericArray = Float32Array | Float64Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint8ClampedArray
  | Uint16Array | Uint32Array;

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
  const identity = isIdentity(toHull);
  for (let k = 0; k + 2 < count; k += 3) {
    const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
    _ta.fromBufferAttribute(position, i0);
    _tb.fromBufferAttribute(position, i1);
    _tc.fromBufferAttribute(position, i2);
    if (!identity) { _ta.applyMatrix4(toHull); _tb.applyMatrix4(toHull); _tc.applyMatrix4(toHull); }
    visit(_ta.x, _ta.y, _ta.z, _tb.x, _tb.y, _tb.z, _tc.x, _tc.y, _tc.z, flip, twoSided);
  }
}

function isIdentity(matrix: THREE.Matrix4): boolean {
  const e = matrix.elements;
  return e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && !e[1] && !e[2] && !e[3] && !e[4] && !e[6] && !e[7]
    && !e[8] && !e[9] && !e[11] && !e[12] && !e[13] && !e[14];
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
  options: { exterior?: boolean } = {},
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
  const hullTriangles: number[] | null = options.exterior ? [] : null;
  visitMeshes(hullRig, hullInverse, turretRig, (mesh, toHull) => visitTriangles(mesh, toHull,
    (ax, ay, az, bx, by, bz, qx, qy, qz, flip, twoSided) => {
      hullTriangles?.push(ax, ay, az, bx, by, bz, qx, qy, qz);
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
  // the floor within it); a wall's edge on each of 48 bearings, the race inside it on all but 30 % of them (the cut and
  // the band take a pocket's corners)
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
  // and inside the deck's outline: on every bearing the deck runs on past the rim (a race over the hull's edge would cut
  // its side, where no band could close it); the deck's edge is where its top falls away from the race's level
  const dropY = level - 0.15;
  const below = (x: number, z: number): boolean => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    return i < 0 || j < 0 || i >= n || j >= n || !(top[j * n + i] > dropY);
  };
  let edgeR = Infinity;
  for (let b = 0; b < 48; b++) {
    const a = ((b + 0.5) / 48) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    for (let r = 0.5 * rimR; r <= rimR + 0.06; r += cell * 0.5) {
      if (below(seat.x + sx * r, seat.z + sz * r) && below(seat.x + sx * (r + cell), seat.z + sz * (r + cell))) {
        edgeR = Math.min(edgeR, r);
        break;
      }
    }
  }
  if (edgeR - 0.03 < rimR) rimR = Math.max(0.5 * rimR, edgeR - 0.03);
  // its plane: the deck round its rim (the median over the race's own annulus short of a wall's height), so the race
  // lies flush with the deck it was let into; the hull's cut takes whatever stands over it inside the rim (a collar, a
  // raised disc, a doubled plate) and the band closes the deck round the rim where it stands higher or falls lower.
  // The skirt is how far the deck falls away just outside the rim (its 10th percentile): the band's fallback depth
  const annulus = heightsWithin(rimR - raceWidth(rimR) - 0.01, rimR).filter((y) => y <= wallY);
  const deckY = annulus.length >= 8 ? percentile(annulus, 0.5) : deck0;
  const outside = heightsWithin(rimR, rimR + 0.06);
  const rimBand = outside.length >= 8 ? outside : heightsWithin(0.85 * rimR, rimR);
  const low = rimBand.length ? percentile(rimBand, 0.1) : deckY;
  const skirt = clamp(deckY - low + 0.006, 0.006, 0.25);
  // the well's floor: a floor plate's height over the highest of the hull's undersides under the opening, so a hulk's
  // well stays inside its hull wherever a glacis or a sponson runs in under the ring
  // (without the exterior pass, over the highest of them: a live wreck's well is the plate's trace; with it, from the
  // deepest belly, the pass keeping the well off the rest of the hull's skin)
  const bellies = heightsWithin(0, rimR - raceWidth(rimR), under);
  let floorY = bellies.length >= 8 ? Math.min(deckY - 0.3, percentile(bellies, hullTriangles ? 0.05 : 0.98) + 0.1) : deckY - 0.9;
  // (the anatomy generator, a hulk's bake) over the hull's skin: whatever of the hull the eye reaches from outside under
  // the race's lip, inside the well's wall, the floor stands over it — a sponson, a lower side, a track, a glacis
  // running in under a wide ring — so a hulk's well takes none of it
  let skin: { wellR: number; skinR: number } | null = null;
  if (hullTriangles) {
    const points = exteriorSkin(hullTriangles, seat.x, seat.z, deckY, rimR, floorY, CRUMPLE_REACH_M);
    const clear = wellClearOfSkin(points, deckY, rimR, floorY);
    floorY = clear.floorY;
    let skinR = Infinity;
    // (the skin under the floor stays there: a hulk's hull dents push sideways, never up through its belly)
    for (const point of points) if (point.y >= floorY && point.r < skinR) skinR = point.r;
    skin = { wellR: clear.wellR, skinR };
  }
  return {
    seat: [round4(seat.x), round4(seat.y), round4(seat.z)],
    deckY: round4(deckY),
    rimR: round4(rimR),
    skirt: round4(skirt),
    footR: round4(Number.isFinite(footR) ? footR : rimR + 0.02),
    floorY: round4(floorY),
    ...(skin ? { wellR: round4(skin.wellR), ...(Number.isFinite(skin.skinR) ? { skinR: round4(skin.skinR) } : {}) } : {}),
  };
}

/** The floor's lowest reach under the deck: the race's lip and a hand's breadth of wall (m). */
const WELL_MIN_DEPTH_M = LIP_M + 0.04;
/** The exterior pass's views (unit directions the eye looks along: 8 bearings × level, down 35° and up 35°, straight
 *  down and up) and its pixel (m). */
const EXTERIOR_VIEWS: readonly (readonly [number, number, number])[] = (() => {
  const views: [number, number, number][] = [[0, -1, 0], [0, 1, 0]];
  for (let b = 0; b < 8; b++) {
    const a = (b / 8) * Math.PI * 2 + Math.PI / 8;
    for (const e of [0, -0.61, 0.61]) views.push([-Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]);
  }
  return views;
})();
const EXTERIOR_PIXEL_M = 0.04;
/** How far round the well's wall the hull's skin must stay (m). */
const EXTERIOR_MARGIN_M = 0.02;
/** The farthest a hulk's crumple moves the hull's skin (m; wreckCrumple's hull dents reach 0.3 m): a hull whose skin stands
 *  further than this from the well's wall as posed needs no look at it bent. */
const CRUMPLE_REACH_M = 0.32;

/**
 * The hull's skin under the ring: an orthographic depth pass from every EXTERIOR_VIEWS direction over the box round the
 * ring under its lip (`triangles`: the hull's, rig_hull frame; the race's disc over the ring closes it from above, since
 * what the eye reaches only through it the well replaces). Every pixel's nearest hull face inside the well's reach is a
 * point of the hull's outside there: per point its distance from the axis and its height.
 */
function exteriorSkin(triangles: readonly number[], cx: number, cz: number, deckY: number, rimR: number,
  floorY: number, margin = EXTERIOR_MARGIN_M): { r: number; y: number }[] {
  const lip = deckY - LIP_M;
  const reach = Math.max(0.5 * rimR, rimR - raceWidth(rimR)) - 0.018 + margin;
  const lo = floorY - 0.05;
  const count = triangles.length / 9;
  const disc: number[] = [];
  for (let k = 0; k < 32; k++) {
    const a0 = (k / 32) * Math.PI * 2, a1 = ((k + 1) / 32) * Math.PI * 2;
    disc.push(cx, deckY + TURRET_RING_LIFT_M, cz, cx + Math.sin(a0) * rimR, deckY + TURRET_RING_LIFT_M, cz + Math.cos(a0) * rimR,
      cx + Math.sin(a1) * rimR, deckY + TURRET_RING_LIFT_M, cz + Math.cos(a1) * rimR);
  }
  const total = count + disc.length / 9;
  const all = new Float32Array(total * 9);
  for (let i = 0; i < triangles.length; i++) all[i] = triangles[i];
  all.set(disc, triangles.length);
  const corners: number[][] = [];
  for (const x of [cx - reach, cx + reach]) for (const y of [lo, lip]) for (const z of [cz - reach, cz + reach]) corners.push([x, y, z]);
  const skin: { r: number; y: number }[] = [];
  let depth = new Float32Array(0), owner = new Int32Array(0);
  for (const [dx, dy, dz] of EXTERIOR_VIEWS) {
    // the view's basis: u across (d × a, a the world's up, or its +z for a vertical view), v up the screen, d into it
    const vertical = Math.abs(dy) > 0.9;
    const ay = vertical ? 0 : 1, az = vertical ? 1 : 0;
    let ux = dy * az - dz * ay, uy = -dx * az, uz = dx * ay;
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = uy * dz - uz * dy, vy = uz * dx - ux * dz, vz = ux * dy - uy * dx;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y, z] of corners) {
      const u = x * ux + y * uy + z * uz, v = x * vx + y * vy + z * vz;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const inv = 1 / EXTERIOR_PIXEL_M;
    const nu = Math.max(1, Math.ceil((u1 - u0) * inv)), nv = Math.max(1, Math.ceil((v1 - v0) * inv));
    if (depth.length < nu * nv) { depth = new Float32Array(nu * nv); owner = new Int32Array(nu * nv); }
    depth.fill(Infinity, 0, nu * nv);
    owner.fill(-1, 0, nu * nv);
    for (let t = 0; t < total; t++) {
      const o = t * 9;
      const ax0 = all[o], ay0 = all[o + 1], az0 = all[o + 2], bx = all[o + 3], by = all[o + 4], bz = all[o + 5];
      const qx = all[o + 6], qy = all[o + 7], qz = all[o + 8];
      const pu0 = (ax0 * ux + ay0 * uy + az0 * uz - u0) * inv, pu1 = (bx * ux + by * uy + bz * uz - u0) * inv;
      const pu2 = (qx * ux + qy * uy + qz * uz - u0) * inv;
      const i0 = Math.max(0, Math.floor(Math.min(pu0, pu1, pu2))), i1 = Math.min(nu - 1, Math.floor(Math.max(pu0, pu1, pu2)));
      if (i0 > i1) continue;
      const pv0 = (ax0 * vx + ay0 * vy + az0 * vz - v0) * inv, pv1 = (bx * vx + by * vy + bz * vz - v0) * inv;
      const pv2 = (qx * vx + qy * vy + qz * vz - v0) * inv;
      const j0 = Math.max(0, Math.floor(Math.min(pv0, pv1, pv2))), j1 = Math.min(nv - 1, Math.floor(Math.max(pv0, pv1, pv2)));
      if (j0 > j1) continue;
      const area = (pu1 - pu0) * (pv2 - pv0) - (pu2 - pu0) * (pv1 - pv0);
      if (Math.abs(area) < 1e-12) continue;
      const ia = 1 / area;
      const pd0 = ax0 * dx + ay0 * dy + az0 * dz, pd1 = bx * dx + by * dy + bz * dz, pd2 = qx * dx + qy * dy + qz * dz;
      // the barycentric weights are affine in the pixel: step them along the row
      const w0u = -(pv2 - pv1) * ia, w1u = -(pv0 - pv2) * ia;
      for (let j = j0; j <= j1; j++) {
        const sv = j + 0.5, su = i0 + 0.5;
        let w0 = ((pu1 - su) * (pv2 - sv) - (pu2 - su) * (pv1 - sv)) * ia;
        let w1 = ((pu2 - su) * (pv0 - sv) - (pu0 - su) * (pv2 - sv)) * ia;
        let p = j * nu + i0;
        for (let i = i0; i <= i1; i++, p++, w0 += w0u, w1 += w1u) {
          if (w0 < -1e-6 || w1 < -1e-6 || w0 + w1 > 1 + 1e-6) continue;
          const d = w0 * pd0 + w1 * pd1 + (1 - w0 - w1) * pd2;
          if (d < depth[p]) { depth[p] = d; owner[p] = t; }
        }
      }
    }
    for (let p = 0; p < nu * nv; p++) {
      if (owner[p] < 0 || owner[p] >= count) continue;
      const u = u0 + ((p % nu) + 0.5) * EXTERIOR_PIXEL_M, v = v0 + (Math.floor(p / nu) + 0.5) * EXTERIOR_PIXEL_M, d = depth[p];
      const x = u * ux + v * vx + d * dx, y = u * uy + v * vy + d * dy, z = u * uz + v * vz + d * dz;
      const r = Math.hypot(x - cx, z - cz);
      if (r < reach && y >= lo && y <= lip) {
        skin.push({ r, y });
        exteriorReport?.(x, y, z, owner[p]);
      }
    }
  }
  return skin;
}

/** The well under the lip clear of the hull's skin: its wall's radius (the gear's band, or narrower: a ledge under the
 *  lip, the ring's seat over a narrower hull) and its floor, the deepest pair that leaves every skin point outside the
 *  wall or under the floor. */
function wellClearOfSkin(skin: readonly { r: number; y: number }[], deckY: number, rimR: number,
  floorY: number): { wellR: number; floorY: number } {
  const openR = Math.max(0.5 * rimR, rimR - raceWidth(rimR));
  const gearR = openR - 0.018;
  const shallowest = deckY - WELL_MIN_DEPTH_M;
  const floorFor = (wellR: number): number => {
    let floor = floorY;
    for (const point of skin) if (point.r < wellR + EXTERIOR_MARGIN_M) floor = Math.max(floor, point.y + 0.03);
    return Math.min(floor, shallowest);
  };
  // the widest wall that keeps the well half its depth (or 0.6 m), else the deepest one
  const want = Math.min(0.6, 0.5 * (deckY - floorY));
  let best = { wellR: gearR, floorY: floorFor(gearR) };
  for (let wellR = gearR; wellR >= 0.55 * openR; wellR -= 0.02) {
    const floor = floorFor(wellR);
    if (deckY - floor >= want) return { wellR, floorY: floor };
    if (floor < best.floorY - 1e-6) best = { wellR, floorY: floor };
  }
  return best;
}

/** Tools: hear every point of the hull's skin the exterior pass finds inside the well's reach (hull frame) and its face. */
let exteriorReport: ((x: number, y: number, z: number, face: number) => void) | null = null;
export function setTurretRingExteriorReport(report: typeof exteriorReport): void { exteriorReport = report; }

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
  const depth = clamp(receipt.deckY - floorY, WELL_MIN_DEPTH_M, 1.3);
  const gearR = openR - 0.018;
  const receiptWell = receipt.wellR, receiptSkin = receipt.skinR;
  const wellR = typeof receiptWell === 'number' && Number.isFinite(receiptWell) ? clamp(receiptWell, 0.5 * openR, gearR) : gearR;
  const skinR = typeof receiptSkin === 'number' && Number.isFinite(receiptSkin) ? receiptSkin : Infinity;
  let carousel: TurretRingCarousel | null = null;
  for (const entry of armor?.modules || []) {
    const count = entry.visualForm ? CAROUSEL_CELLS[entry.visualForm] : undefined;
    if (!count || entry.turretLocal || depth < 0.3) continue;
    const span = Math.min(entry.max[0] - entry.min[0], entry.max[2] - entry.min[2]);
    const rOut = clamp(0.5 * span, 0.3, wellR - 0.05);
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
    cx: receipt.seat[0], cz: receipt.seat[2], deckY: receipt.deckY, openR, rimR, skirt: receipt.skirt, depth, wellR, skinR,
    carousel, source,
  };
}

// ------------------------------------------------------------------------------------------------- the ring's prism

/** The prism the hull gives way inside: the polygon round the race's rim (corner k at bearing 2πk/sides, x = sin,
 *  z = cos, on radius `r`), from `yLo` to `yHi`, in the hull frame. */
export interface TurretRingCut {
  cx: number;
  cz: number;
  r: number;
  sides: number;
  yLo: number;
  yHi: number;
  /** The race's top (hull y). */
  top: number;
}

/** A live wreck's cut: from under the deck's plates (the plate covers what lies deeper) to the turret's band. */
export function turretRingCut(seat: TurretRingSeat, sides: number): TurretRingCut {
  const floorY = seat.deckY - seat.depth;
  return {
    cx: seat.cx, cz: seat.cz, r: seat.rimR, sides,
    yLo: Math.max(floorY - 0.02, seat.deckY - LIVE_CUT_DEPTH_M),
    yHi: seat.deckY + CUT_RISE_M,
    top: seat.deckY + TURRET_RING_LIFT_M,
  };
}

/** A plane (a, b, c, d): a point's signed distance a·x + b·y + c·z − d, > 0 on its outside. */
type RingPlane = Float64Array;

function ringPlane(a: number, b: number, c: number, d: number): RingPlane { return Float64Array.of(a, b, c, d); }

/** The prism's planes: its sides (side k between corners k and k + 1, outward), then its floor and its top. */
interface RingPrism {
  readonly cut: TurretRingCut;
  readonly sides: readonly RingPlane[];
  readonly caps: readonly RingPlane[];
  /** Side k's tangent (k → k + 1) and half its length: whether a point on side k lies between its corners. */
  readonly halfEdge: number;
}

function ringPrism(cut: TurretRingCut): RingPrism {
  const sides: RingPlane[] = [];
  const apothem = cut.r * Math.cos(Math.PI / cut.sides);
  for (let k = 0; k < cut.sides; k++) {
    const a = ((k + 0.5) / cut.sides) * Math.PI * 2, nx = Math.sin(a), nz = Math.cos(a);
    sides.push(ringPlane(nx, 0, nz, apothem + cut.cx * nx + cut.cz * nz));
  }
  return {
    cut, sides, caps: [ringPlane(0, -1, 0, -cut.yLo), ringPlane(0, 1, 0, cut.yHi)],
    halfEdge: cut.r * Math.sin(Math.PI / cut.sides),
  };
}

/** A clip polygon: per corner its hull-frame point and its weights on the source triangle's three corners. */
const POLY_STRIDE = 6;

const planeDistance = (plane: RingPlane, poly: ArrayLike<number>, i: number): number =>
  plane[0] * poly[i] + plane[1] * poly[i + 1] + plane[2] * poly[i + 2] - plane[3];

/** The part of a convex polygon on one side of a plane (`keepOutside`: its outside); `onCut` hears each corner the
 *  plane makes. */
function clipPolygon(poly: number[], plane: RingPlane, keepOutside: boolean,
  onCut: ((x: number, y: number, z: number) => void) | null = null): number[] {
  const out: number[] = [];
  const n = poly.length / POLY_STRIDE;
  for (let i = 0; i < n; i++) {
    const u = i * POLY_STRIDE, v = ((i + 1) % n) * POLY_STRIDE;
    const du = planeDistance(plane, poly, u), dv = planeDistance(plane, poly, v);
    const fu = keepOutside ? du : -du, fv = keepOutside ? dv : -dv;
    if (fu >= 0) for (let c = 0; c < POLY_STRIDE; c++) out.push(poly[u + c]);
    if ((fu >= 0) !== (fv >= 0)) {
      const t = fu / (fu - fv);
      const at = out.length;
      for (let c = 0; c < POLY_STRIDE; c++) out.push(poly[u + c] + (poly[v + c] - poly[u + c]) * t);
      if (onCut) onCut(out[at], out[at + 1], out[at + 2]);
    }
  }
  return out.length >= 3 * POLY_STRIDE ? out : [];
}

/** Whether every corner of a polygon lies on the plane's outside (or, `outside` false, its inside). */
function wholly(plane: RingPlane, poly: ArrayLike<number>, outside: boolean): boolean {
  for (let i = 0; i < poly.length; i += POLY_STRIDE) {
    const d = planeDistance(plane, poly, i);
    if (outside ? d < 0 : d > 0) return false;
  }
  return true;
}

/**
 * A live cut also refines the hull's long faces near the ring. A dent (planDents: up to 0.28 m along a unit direction)
 * moves each corner of a face by the field at that corner, and the face between them follows straight: a long face that
 * meets the rim at one corner and runs on past it, or runs just past the rim without meeting it, pivots on its near
 * corner when a dent moves its far one, and its middle swings in over the race. So inside a zone round the rim (out past
 * the farthest a dent moves a corner, LIVE_ZONE_M) a long face is split into wedges on the lines through the polygon's
 * corners (its sectors), and each wedge on its own side of a band polygon close round the rim (LIVE_BAND_M) and of the
 * prism: every piece near the race then lies within one sector, its corners moved by the field at their own points, and
 * the field moves a corner at most 0.72 of its distance from the rim (|f'| ≤ 4 · 0.28 / 0.6 · 0.385 for the deepest,
 * tightest dent), so no piece folds back over it. A short face follows the field closely enough as it is.
 */
const LIVE_ZONE_M = 0.36;
const LIVE_BAND_M = 0.08;
/** A face whose every edge is shorter than this is short (m). */
const REFINE_EDGE_M = 0.09;
/** Nor is a face refined that lies wholly this far under the race's top (m): a dent lifts it with the plate over it. */
const REFINE_UNDER_M = 0.05;

/** A cutter: the prism, and (a live cut's) its refinement: the zone's polygon, the band's and the sectors' lines. */
interface RingCutter {
  readonly prism: RingPrism;
  readonly zone: RingPrism | null;
  readonly band: RingPrism | null;
  readonly sectors: readonly RingPlane[];
}

function ringCutter(cut: TurretRingCut, refine: boolean): RingCutter {
  const sectors: RingPlane[] = [];
  if (refine) {
    // the full lines through opposite corners (the polygon has an even number of sides)
    for (let k = 0; k < cut.sides / 2; k++) {
      const a = (k / cut.sides) * Math.PI * 2, tx = Math.cos(a), tz = -Math.sin(a);
      sectors.push(ringPlane(tx, 0, tz, cut.cx * tx + cut.cz * tz));
    }
  }
  return {
    prism: ringPrism(cut),
    zone: refine ? ringPrism({ ...cut, r: cut.r + LIVE_ZONE_M }) : null,
    band: refine ? ringPrism({ ...cut, r: cut.r + LIVE_BAND_M }) : null,
    sectors,
  };
}

function longFace(t: ArrayLike<number>): boolean {
  const e = REFINE_EDGE_M * REFINE_EDGE_M;
  const d2 = (i: number, j: number): number => (t[i] - t[j]) ** 2 + (t[i + 1] - t[j + 1]) ** 2 + (t[i + 2] - t[j + 2]) ** 2;
  return d2(0, 3) > e || d2(3, 6) > e || d2(6, 0) > e;
}

/** The polygon side a piece within one sector faces (its centroid's bearing). */
function sectorOf(cut: TurretRingCut, poly: ArrayLike<number>): number {
  let x = 0, z = 0;
  const n = poly.length / POLY_STRIDE;
  for (let i = 0; i < poly.length; i += POLY_STRIDE) { x += poly[i]; z += poly[i + 2]; }
  let a = Math.atan2(x / n - cut.cx, z / n - cut.cz);
  if (a < 0) a += Math.PI * 2;
  return Math.min(cut.sides - 1, Math.floor((a / (Math.PI * 2)) * cut.sides));
}

/**
 * Split one triangle (hull-frame corners `t`, 9 numbers) at the cutter. Returns false when it lies clear (keep it as it
 * is). Otherwise its pieces go to `emit` (disjoint, covering exactly the triangle less the prism): clipped against the
 * caps (what lies under the floor or over the top is kept as it is); a long face in the zone split on the zone's polygon
 * (what lies past it kept whole), its sectors, and per wedge its side of the band and of the prism; any other face across
 * the prism clipped against each side in turn. What lies inside the prism is gone; `onRim(k, y)` hears every point side
 * k leaves on that side of the polygon (the cut faces' reach on bearing k).
 */
function splitAtRing(cutter: RingCutter, t: ArrayLike<number>, emit: (poly: number[]) => void,
  onRim: ((k: number, y: number) => void) | null): boolean {
  const { prism } = cutter;
  const { cut } = prism;
  const outer = cutter.zone ?? prism;
  const reach = outer.cut.r;
  const minY = Math.min(t[1], t[4], t[7]), maxY = Math.max(t[1], t[4], t[7]);
  if (maxY < cut.yLo || minY > cut.yHi) return false;
  const minX = Math.min(t[0], t[3], t[6]), maxX = Math.max(t[0], t[3], t[6]);
  const minZ = Math.min(t[2], t[5], t[8]), maxZ = Math.max(t[2], t[5], t[8]);
  if (maxX < cut.cx - reach || minX > cut.cx + reach || maxZ < cut.cz - reach || minZ > cut.cz + reach) return false;
  const triangle = [t[0], t[1], t[2], 1, 0, 0, t[3], t[4], t[5], 0, 1, 0, t[6], t[7], t[8], 0, 0, 1];
  if (outer.sides.some((side) => wholly(side, triangle, true))) return false;
  const across = !prism.sides.some((side) => wholly(side, triangle, true));
  const refine = !!cutter.zone && longFace(t) && maxY > cut.top - REFINE_UNDER_M;
  if (!across && !refine) return false;
  // the pieces wait for the verdict: a triangle that nothing split is kept as it is
  const pieces: number[][] = [];
  let split = false;
  const keep = (poly: number[]): void => { if (poly.length) pieces.push(poly); };
  const sideCut = (k: number) => (onRim ? (x: number, y: number, z: number): void => {
    // on side k's segment between its corners (a point beyond them is a seam between outside pieces, not a cut face)
    const a = ((k + 0.5) / cut.sides) * Math.PI * 2;
    const u = ((x - cut.cx) * Math.cos(a) - (z - cut.cz) * Math.sin(a)) / prism.halfEdge;
    if (Math.abs(u) <= 1.02) onRim(k, y);
  } : null);
  // the caps
  let rest = triangle;
  for (const cap of prism.caps) {
    if (wholly(cap, rest, false)) continue;
    keep(clipPolygon(rest, cap, true));
    rest = clipPolygon(rest, cap, false);
    split = true;
    if (!rest.length) break;
  }
  if (rest.length && refine && cutter.zone && cutter.band) {
    // past the zone's polygon: kept whole
    for (const side of cutter.zone.sides) {
      if (wholly(side, rest, false)) continue;
      keep(clipPolygon(rest, side, true));
      rest = clipPolygon(rest, side, false);
      split = true;
      if (!rest.length) break;
    }
    // inside it: the wedges (both sides of each line through two opposite corners)
    let wedges = rest.length ? [rest] : [];
    for (const line of cutter.sectors) {
      const next: number[][] = [];
      for (const poly of wedges) {
        if (wholly(line, poly, true) || wholly(line, poly, false)) { next.push(poly); continue; }
        const a = clipPolygon(poly, line, true), b = clipPolygon(poly, line, false);
        if (a.length) next.push(a);
        if (b.length) next.push(b);
        split = true;
      }
      wedges = next;
    }
    // per wedge, its side of the band (both kept) and of the prism (its inside gone)
    for (const wedge of wedges) {
      const k = sectorOf(cut, wedge);
      const bandSide = cutter.band.sides[k], rimSide = prism.sides[k];
      if (wholly(bandSide, wedge, true)) { keep(wedge); continue; }
      let inner = wedge;
      if (!wholly(bandSide, wedge, false)) {
        keep(clipPolygon(wedge, bandSide, true));
        inner = clipPolygon(wedge, bandSide, false);
        split = true;
      }
      if (!inner.length) continue;
      if (wholly(rimSide, inner, true)) { keep(inner); continue; }
      split = true;
      keep(clipPolygon(inner, rimSide, true, sideCut(k)));
    }
    rest = [];
  }
  // a face across the prism: its outside pieces are kept, its inside is gone
  if (rest.length && !prism.sides.some((side) => wholly(side, rest, true))) {
    split = true;
    for (let k = 0; k < cut.sides; k++) {
      const side = prism.sides[k];
      if (wholly(side, rest, false)) continue;
      keep(clipPolygon(rest, side, true, sideCut(k)));
      rest = clipPolygon(rest, side, false);
      if (!rest.length) break;
    }
    rest = [];
  }
  if (!split) return false;
  if (rest.length) keep(rest);
  for (const poly of pieces) emit(poly);
  return true;
}

/** Per side of the polygon, the highest point the hull's cut faces reach on it, then (from `sides` on) the lowest
 *  (±∞: no cut face there). */
export function emptyTurretRingRim(sides: number): Float64Array {
  const rim = new Float64Array(2 * sides);
  rim.fill(-Infinity, 0, sides);
  rim.fill(Infinity, sides);
  return rim;
}
function noteRim(rim: Float64Array, sides: number, k: number, y: number): void {
  if (y > rim[k]) rim[k] = y;
  if (y < rim[sides + k]) rim[sides + k] = y;
}

const _hullCorner = new THREE.Vector3();
function readCorner(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, toHull: THREE.Matrix4 | null,
  out: Float64Array, at: number): void {
  _hullCorner.fromBufferAttribute(position, i);
  if (toHull) _hullCorner.applyMatrix4(toHull);
  out[at] = _hullCorner.x; out[at + 1] = _hullCorner.y; out[at + 2] = _hullCorner.z;
}
function readTriangle(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i0: number, i1: number,
  i2: number, toHull: THREE.Matrix4 | null, out: Float64Array): void {
  readCorner(position, i0, toHull, out, 0);
  readCorner(position, i1, toHull, out, 3);
  readCorner(position, i2, toHull, out, 6);
}

/** Whether a hull-frame box reaches the prism (grown by `margin` round its polygon). */
function boxReaches(box: THREE.Box3, cut: TurretRingCut, margin = 0): boolean {
  const r = cut.r + margin;
  return !(box.max.y < cut.yLo || box.min.y > cut.yHi || box.max.x < cut.cx - r || box.min.x > cut.cx + r
    || box.max.z < cut.cz - r || box.min.z > cut.cz + r);
}

/**
 * A live mesh's geometry without the prism (`toHull`: its positions to the hull frame; null, the hull frame itself):
 * indexed, every attribute and group of the source kept (a clipped corner interpolates them on its source triangle;
 * its normal renormalized), the source's bounds kept (a subset of them). Null when nothing of it reaches the prism.
 * `rim` takes the cut faces' reach per side.
 */
export function cutGeometryAtTurretRing(
  geometry: THREE.BufferGeometry,
  cut: TurretRingCut,
  toHull: THREE.Matrix4 | null,
  rim: Float64Array | null = null,
  refine = true,
): THREE.BufferGeometry | null {
  const position = geometry.getAttribute('position');
  if (!position || Object.keys(geometry.morphAttributes).length) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!.clone();
  if (toHull) box.applyMatrix4(toHull);
  if (!boxReaches(box, cut, refine ? LIVE_ZONE_M : 0)) return null;
  const cutter = ringCutter(cut, refine);
  const index = geometry.index;
  const total = index ? index.count : position.count;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: total, materialIndex: undefined }];
  const base = position.count;
  const indices: number[] = [];
  const outGroups: { start: number; count: number; materialIndex?: number }[] = [];
  // the clipped corners: their source triangle's three vertices and weights
  const blends: number[] = [];
  const tri = new Float64Array(9);
  let touched = false;
  let id0 = 0, id1 = 0, id2 = 0;
  const corner = (poly: number[], c: number): number => {
    const o = c * POLY_STRIDE, w0 = poly[o + 3], w1 = poly[o + 4], w2 = poly[o + 5];
    if (w0 > 1 - 1e-9) return id0;
    if (w1 > 1 - 1e-9) return id1;
    if (w2 > 1 - 1e-9) return id2;
    blends.push(id0, id1, id2, w0, w1, w2);
    return base + blends.length / 6 - 1;
  };
  const piece = (poly: number[]): void => {
    const n = poly.length / POLY_STRIDE;
    const first = corner(poly, 0);
    let previous = corner(poly, 1);
    for (let c = 2; c < n; c++) {
      const next = corner(poly, c);
      indices.push(first, previous, next);
      previous = next;
    }
  };
  const onRim = rim ? (k: number, y: number): void => noteRim(rim, cut.sides, k, y) : null;
  for (const group of groups) {
    const start = indices.length;
    const end = Math.min(total, group.start + group.count);
    for (let k = group.start; k + 2 < end; k += 3) {
      const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
      readTriangle(position, i0, i1, i2, toHull, tri);
      id0 = i0; id1 = i1; id2 = i2;
      if (!splitAtRing(cutter, tri, piece, onRim)) { indices.push(i0, i1, i2); continue; }
      touched = true;
    }
    outGroups.push({ start, count: indices.length - start, materialIndex: group.materialIndex });
  }
  if (!touched) return null;
  const extra = blends.length / 6;
  const result = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const source = geometry.getAttribute(name);
    const size = source.itemSize;
    // the raw words (a normalized attribute's too: its clipped corners blend them and round to the type's integers)
    const interleaved = (source as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
      ? source as THREE.InterleavedBufferAttribute : null;
    const words = interleaved ? interleaved.data.array : (source as THREE.BufferAttribute).array;
    const stride = interleaved ? interleaved.data.stride : size, offset = interleaved ? interleaved.offset : 0;
    const Words = words.constructor as new (length: number) => NumericArray;
    const array = new Words((base + extra) * size);
    if (!interleaved && words.length >= base * size) array.set(words.subarray(0, base * size));
    else for (let i = 0; i < base; i++) for (let c = 0; c < size; c++) array[i * size + c] = words[i * stride + offset + c];
    const integer = !(array instanceof Float32Array || array instanceof Float64Array);
    for (let e = 0; e < extra; e++) {
      const b = e * 6, o = (base + e) * size;
      for (let c = 0; c < size; c++) {
        const value = blends[b + 3] * words[blends[b] * stride + offset + c]
          + blends[b + 4] * words[blends[b + 1] * stride + offset + c]
          + blends[b + 5] * words[blends[b + 2] * stride + offset + c];
        array[o + c] = integer ? Math.round(value) : value;
      }
      if ((name === 'normal' || name === 'tangent') && !integer && size >= 3) {
        const l = Math.hypot(array[o], array[o + 1], array[o + 2]) || 1;
        array[o] /= l; array[o + 1] /= l; array[o + 2] /= l;
      }
    }
    result.setAttribute(name, new THREE.BufferAttribute(array, size, source.normalized));
  }
  result.setIndex(base + extra > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  if (geometry.groups.length) for (const group of outGroups) result.addGroup(group.start, group.count, group.materialIndex);
  result.boundingBox = geometry.boundingBox!.clone();
  if (geometry.boundingSphere) result.boundingSphere = geometry.boundingSphere.clone();
  else result.computeBoundingSphere();
  result.name = geometry.name;
  result.userData = { ...geometry.userData, turretRingCut: true };
  return result;
}

/** A mesh the ring's cut may take: a drawn, non-instanced hull mesh (not the turret's, not a shadow proxy's, not the
 *  ring's own). */
function cuttableMesh(object: THREE.Object3D): object is THREE.Mesh {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.BatchedMesh).isBatchedMesh
    || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const data = mesh.userData;
  if (data.turretRingPlate || data.turretRingWell || data.authoredShadowProxy || !mesh.geometry?.getAttribute('position')) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => !!material && material.colorWrite !== false);
}

/** Every mesh the cut may take on the hull side of `root` (under it, not under rig_turret or rig_gun), hidden ones and
 *  every LOD level included (a level may show later in the wreck's life). */
function hullSideMeshes(root: THREE.Object3D, visit: (mesh: THREE.Mesh) => void): void {
  const stack: THREE.Object3D[] = [root];
  while (stack.length) {
    const object = stack.pop()!;
    if (object !== root && (object.name === 'rig_turret' || object.name === 'rig_gun')) continue;
    if (cuttableMesh(object)) visit(object);
    for (let i = object.children.length - 1; i >= 0; i--) stack.push(object.children[i]);
  }
}

/** A live wreck's cut: the meshes it swapped (mesh, the geometry it held, its cut copy) and the cut faces' reach. */
interface TurretRingHullCut {
  swaps: [THREE.Mesh, THREE.BufferGeometry, TurretRingCutEntry][];
  rim: Float64Array;
}
interface TurretRingCutEntry { geometry: THREE.BufferGeometry; rim: Float64Array; refs: number }

/** Cut copies by source geometry (two wrecks of one tank share the battle geometry, and so its cut). */
const RING_CUTS = new WeakMap<THREE.BufferGeometry, Map<string, TurretRingCutEntry>>();

function cutEntryKey(geometry: THREE.BufferGeometry, cut: TurretRingCut, toHull: THREE.Matrix4): string {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  return [cut.cx, cut.cz, cut.r, cut.sides, cut.yLo, cut.yHi, cut.top, ...toHull.elements].map((v) => v.toFixed(5)).join(',')
    + `|${position.version ?? 0}|${normal?.version ?? 0}`;
}

/** Swap every hull mesh crossing the prism for its cut copy (the kill). */
function cutTurretRingMeshes(root: THREE.Object3D, hull: THREE.Object3D, cut: TurretRingCut): TurretRingHullCut {
  root.updateMatrixWorld(true);
  const hullInverse = hull.matrixWorld.clone().invert();
  const result: TurretRingHullCut = { swaps: [], rim: emptyTurretRingRim(cut.sides) };
  hullSideMeshes(root, (mesh) => {
    const geometry = mesh.geometry;
    const toHull = new THREE.Matrix4().multiplyMatrices(hullInverse, mesh.matrixWorld);
    const key = cutEntryKey(geometry, cut, toHull);
    let byKey = RING_CUTS.get(geometry);
    let entry = byKey?.get(key);
    if (!entry) {
      const rim = emptyTurretRingRim(cut.sides);
      const cutGeometry = cutGeometryAtTurretRing(geometry, cut, isIdentity(toHull) ? null : toHull, rim);
      if (!cutGeometry) return;
      entry = { geometry: cutGeometry, rim, refs: 0 };
      if (!byKey) RING_CUTS.set(geometry, byKey = new Map());
      byKey.set(key, entry);
    }
    entry.refs++;
    for (let k = 0; k < cut.sides; k++) {
      if (entry.rim[k] > result.rim[k]) result.rim[k] = entry.rim[k];
      if (entry.rim[cut.sides + k] < result.rim[cut.sides + k]) result.rim[cut.sides + k] = entry.rim[cut.sides + k];
    }
    result.swaps.push([mesh, geometry, entry]);
    mesh.geometry = entry.geometry;
  });
  return result;
}

/** The rematch: every cut mesh back on the geometry it held (unless something else has swapped it since). */
function restoreTurretRingMeshes(hullCut: TurretRingHullCut): void {
  for (const [mesh, original, entry] of hullCut.swaps) {
    if (mesh.geometry === entry.geometry) mesh.geometry = original;
    if (--entry.refs > 0) continue;
    entry.geometry.dispose();
    const byKey = RING_CUTS.get(original);
    if (!byKey) continue;
    for (const [key, value] of byKey) if (value === entry) byKey.delete(key);
    if (!byKey.size) RING_CUTS.delete(original);
  }
  hullCut.swaps.length = 0;
}

/** Per polygon corner, the band's reach under and over the race's top (ring frame: y = 0 on the race): the whole of the
 *  cut faces on the corner's two sides (`rim`: emptyTurretRingRim's highest, then lowest, per side), so wherever the
 *  polygon cut the hull — the deck falling away under the race, standing over it, a wall the rim crossed — the band
 *  closes it; on a side with no cut face, the seat's measured skirt. */
function rimBand(seat: TurretRingSeat, sides: number, rim: ArrayLike<number> | null, pad = BAND_PAD_M):
  { lo: Float64Array; hi: Float64Array } {
  const raceTop = seat.deckY + TURRET_RING_LIFT_M;
  const lo = new Float64Array(sides), hi = new Float64Array(sides);
  for (let k = 0; k < sides; k++) {
    const before = (k + sides - 1) % sides;
    const top = rim ? Math.max(rim[before], rim[k]) : -Infinity;
    const bottom = rim && rim.length >= 2 * sides ? Math.min(rim[sides + before], rim[sides + k]) : top;
    const reach = Number.isFinite(top) ? top - raceTop : -seat.skirt - TURRET_RING_LIFT_M;
    const under = Number.isFinite(bottom) ? Math.min(bottom - raceTop, reach) : reach;
    lo[k] = Math.min(0, under) - pad;
    hi[k] = reach > 0 ? reach + BAND_TOP_M : 0;
  }
  return { lo, hi };
}

// ---------------------------------------------------------------------------------------------------- live plate

/** The plate's vertex layout (geometry.userData.turretRingLayout): where its rim's columns start. */
interface TurretRingPlateLayout {
  sides: number;
  /** The race's rim ring, then the band's outer face (rows: low, race, high) and inner face (rows: race, high). */
  rim: number;
  outer: [number, number, number];
  inner: [number, number];
}

/**
 * The plate in the ring's frame (origin on the ring's axis at the race's top): the opening and the race as rings out to
 * the rim on the shared polygon (`sides`), and round the rim the band from the cut faces' reach (`rim`, per side, hull
 * y; null: the seat's skirt everywhere). Attributes: position, normal, cotRingUv (the undented ring-plane point the
 * well's trace starts from), cotRingA (opening radius, well depth, rim radius, part: 0 the race and opening, 1 the
 * band's outer face, 2 its inner face), cotRingB (carousel cells, inner and outer radius, height).
 */
export function buildTurretRingPlateGeometry(seat: TurretRingSeat, sides: number,
  rim: ArrayLike<number> | null = null): THREE.BufferGeometry {
  const radii = [0.5 * seat.openR, seat.openR, seat.rimR];
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  const { lo, hi } = rimBand(seat, sides, rim);
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, part: number): number => {
    position.push(x, y, z); normal.push(nx, ny, nz); uv.push(x, z, part);
    return position.length / 3 - 1;
  };
  const row = (r: number, y: (k: number) => number, nx: number, nz: number, ny: number, part: number): number => {
    const first = position.length / 3;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      vertex(sx * r, y(k), sz * r, sx * nx, ny, sz * nz, part);
    }
    return first;
  };
  // a strip between two rows: `upper` over `lower`, its faces outward (+1) or inward (−1)
  const strip = (upper: number, lower: number, facing: 1 | -1): void => {
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      if (facing > 0) index.push(upper + k, lower + k, lower + k1, upper + k, lower + k1, upper + k1);
      else index.push(upper + k, lower + k1, lower + k, upper + k, upper + k1, lower + k1);
    }
  };
  const centre = vertex(0, 0, 0, 0, 1, 0, 0);
  const rings = radii.map((r) => row(r, () => 0, 0, 0, 1, 0));
  // the disc: counter-clockwise seen from above (+y) faces up
  for (let k = 0; k < sides; k++) index.push(centre, rings[0] + k, rings[0] + ((k + 1) % sides));
  for (let r = 1; r < rings.length; r++) {
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      index.push(rings[r - 1] + k, rings[r] + k, rings[r] + k1, rings[r - 1] + k, rings[r] + k1, rings[r - 1] + k1);
    }
  }
  // the band (its own vertices: its own normals): the outer face from under the deck to over a cut face, the inner one
  // from the race up (under the race it lies under the race's top)
  const outerLo = row(seat.rimR, (k) => lo[k], 1, 1, 0, 1);
  const outerMid = row(seat.rimR, () => 0, 1, 1, 0, 1);
  const outerHi = row(seat.rimR, (k) => hi[k], 1, 1, 0, 1);
  strip(outerMid, outerLo, 1);
  strip(outerHi, outerMid, 1);
  const innerMid = row(seat.rimR, () => 0, -1, -1, 0, 2);
  const innerHi = row(seat.rimR, (k) => hi[k], -1, -1, 0, 2);
  strip(innerHi, innerMid, -1);
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
  const layout: TurretRingPlateLayout = { sides, rim: rings[rings.length - 1], outer: [outerLo, outerMid, outerHi],
    inner: [innerMid, innerHi] };
  geometry.userData.turretRingLayout = layout;
  geometry.userData.provenance = { ...FIRST_PARTY_VEHICLE_AUTHORSHIP, assetId: TURRET_RING_WELL_ASSET_ID };
  return geometry;
}

/** A dent field (materials.ts makeBurnUniforms uCrHull / uCrHullDir, the hull frame): centre and R², inward direction
 *  and depth. */
export interface TurretRingDents { readonly centres: readonly THREE.Vector4[]; readonly dirs: readonly THREE.Vector4[] }

/** The dent field at a hull-frame point, at full depth ((1 − r²/R²)² · depth along each dent, the burn hook's law). */
function dentAt(dents: TurretRingDents, x: number, y: number, z: number, out: Float64Array): void {
  out[0] = out[1] = out[2] = 0;
  for (let k = 0; k < dents.centres.length; k++) {
    const c = dents.centres[k], d = dents.dirs[k];
    if (!d || !(c.w > 0)) continue;
    const ex = x - c.x, ey = y - c.y, ez = z - c.z;
    const r2 = ex * ex + ey * ey + ez * ez;
    if (r2 >= c.w) continue;
    const q = 1 - r2 / c.w, s = q * q * d.w;
    out[0] += d.x * s; out[1] += d.y * s; out[2] += d.z * s;
  }
}

/**
 * The plate's displacement under the hull's dents at full depth (per vertex, 3 numbers; null without dents). `origin`
 * is the plate's origin in the hull frame. Every vertex takes the field at its own point, as the burn hook bends the
 * hull's vertices — the cut's corners on the polygon among them — and the rim's columns rise by the most the field
 * bows over a side between two of them (and its low row sinks by the most it bows under), so the hull's cut faces at a
 * side's middle never reach past the band's straight edge.
 */
export function turretRingPlateDents(geometry: THREE.BufferGeometry, origin: THREE.Vector3,
  dents: TurretRingDents | null): Float32Array | null {
  if (!dents || !dents.centres.some((c) => c.w > 0)) return null;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const layout = geometry.userData.turretRingLayout as TurretRingPlateLayout | undefined;
  const offsets = new Float32Array(position.count * 3);
  const f = new Float64Array(3);
  for (let i = 0; i < position.count; i++) {
    dentAt(dents, position.getX(i) + origin.x, position.getY(i) + origin.y, position.getZ(i) + origin.z, f);
    offsets[i * 3] = f[0]; offsets[i * 3 + 1] = f[1]; offsets[i * 3 + 2] = f[2];
  }
  if (!layout) return offsets;
  const { sides } = layout;
  const rise = new Float64Array(sides), sink = new Float64Array(sides);
  const columns = [layout.rim, ...layout.outer, ...layout.inner];
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    for (const start of columns) {
      const a = start + k, b = start + k1;
      for (const t of [0.25, 0.5, 0.75]) {
        dentAt(dents,
          origin.x + position.getX(a) + (position.getX(b) - position.getX(a)) * t,
          origin.y + position.getY(a) + (position.getY(b) - position.getY(a)) * t,
          origin.z + position.getZ(a) + (position.getZ(b) - position.getZ(a)) * t, f);
        const bow = f[1] - (offsets[a * 3 + 1] + (offsets[b * 3 + 1] - offsets[a * 3 + 1]) * t);
        if (bow > rise[k]) rise[k] = bow;
        if (-bow > sink[k]) sink[k] = -bow;
      }
    }
  }
  for (let k = 0; k < sides; k++) {
    const up = Math.max(rise[k], rise[(k + sides - 1) % sides]), down = Math.max(sink[k], sink[(k + sides - 1) % sides]);
    for (const start of [layout.rim, layout.outer[1], layout.outer[2], layout.inner[0], layout.inner[1]]) offsets[(start + k) * 3 + 1] += up;
    offsets[(layout.outer[0] + k) * 3 + 1] -= down;
  }
  return offsets;
}

/** The burn hook's dent share at a wreck age (its smoothstep over the blast's first 0.35 s; disarmed: none). */
export function turretRingDentShare(ageS: number): number {
  if (!(ageS >= 0)) return 0;
  const t = Math.min(1, ageS / DENT_RAMP_S);
  return t * t * (3 - 2 * t);
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
  if ( vCotRingA.w > 1.5 ) {
    // the band's inner face: the deck's cut edge over the race, scorched steel
    base = vec3( 0.096, 0.086, 0.074 );
    cotRingRough = 0.6; cotRingMetal = 0.3;
  } else if ( vCotRingA.w > 0.5 ) {
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

/** The ring material's program key: every wreck's material compiles to the fleet's one program. */
const TURRET_RING_PROGRAM_KEY = 'turret-ring-well-v2';

/**
 * A wreck's ring material, on the engine context's cascade registration (a stub's or a tool's takes the hooks
 * directly). Its own per visual — the vehicle's ground reference is set per draw (setVehicleGroundFromRoot), and three
 * uploads a material's uniforms only when the material changes between draws, so two wrecks drawn back to back on one
 * material would share the first one's ground — while every one of them compiles to the fleet's one program (the covered
 * wreck warm compiles it: createTurretRingPresentation.stageWarm). `releaseTurretRingWellMaterial` frees it.
 */
export function createTurretRingWellMaterial(engineCtx: RingEngineContext | null | undefined): THREE.MeshStandardMaterial {
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
  material.customProgramCacheKey = () => TURRET_RING_PROGRAM_KEY;
  return material;
}

export function releaseTurretRingWellMaterial(material: THREE.Material, engineCtx: RingEngineContext | null | undefined): void {
  engineCtx?.releaseShadowMaterial?.(material);
  material.dispose();
}

/** The plate mesh: seated on the ring (hull frame), the vehicle's ground reference and its top coplanar layer per draw. */
function turretRingPlateMesh(
  seat: TurretRingSeat,
  material: THREE.MeshStandardMaterial,
  root: THREE.Object3D,
  sides: number,
  rim: ArrayLike<number> | null,
): THREE.Mesh {
  const geometry = buildTurretRingPlateGeometry(seat, sides, rim);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = TURRET_RING_PLATE_NAME;
  mesh.position.set(seat.cx, seat.deckY + TURRET_RING_LIFT_M, seat.cz);
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
  /** HIGH geometry: the polygon's 64 sides (LOW 48). */
  high: boolean;
  /** A rendered visual cuts its hull and draws a plate; a geometry-only one (a hulk's bake) keeps only the seat. */
  rendered: boolean;
  /** The hull's planned dents at the kill (planLiveCrumple), or null. */
  dents: () => TurretRingDents | null;
}

interface TurretRingPresentation {
  /** The ring as built (hull frame); measured once, while the turret is seated. Null on a turretless hull. */
  seat(): TurretRingSeat | null;
  /** The kill: the hull cut inside the ring and the plate on it (rendered visuals), after the wreck sweep captured the
   *  live materials and planned the dents. */
  show(): void;
  /** The burn clock (the wreck's age, s): the plate takes the dents' share the burn hook gives the hull. */
  ramp(ageS: number): void;
  /** The rematch: the plate leaves (its geometry freed) and the hull's meshes go back on the geometry they held. */
  hide(): void;
  /** The covered wreck warm: a plate on the hull while its program compiles; the restore takes it off again. */
  stageWarm(): () => void;
  /** The visual's end: hide, and free the ring material. */
  dispose(): void;
}

/** The ring of one visual (tankFactoryCore.ts: setDestroyed shows it, the wreck's clock ramps it, resetDestroyed hides
 *  it, dispose frees it). */
export function createTurretRingPresentation(options: TurretRingPresentationOptions): TurretRingPresentation {
  const { specId, root, hull, turret, armor, engineCtx, rendered } = options;
  const sides = turretRingSides(options.high);
  let cached: TurretRingSeat | null | undefined;
  let plate: THREE.Mesh | null = null;
  let hullCut: TurretRingHullCut | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  // the plate's dents: its rest positions and full-depth offsets, and the share last written
  let rest: Float32Array | null = null;
  let offsets: Float32Array | null = null;
  let share = 0;
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
    const measured = measureTurretRing(hull, turret, turretRingRadius(armor), { exterior: !rendered });
    cached = measured ? turretRingSeatFrom(measured, armor, hullFloorY, 'measured') : null;
    return cached;
  }

  function ringMaterial(): THREE.MeshStandardMaterial {
    return material ??= createTurretRingWellMaterial(engineCtx);
  }

  function attach(seat: TurretRingSeat, rim: ArrayLike<number> | null): THREE.Mesh {
    const mesh = turretRingPlateMesh(seat, ringMaterial(), root, sides, rim);
    hull.add(mesh);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function detach(mesh: THREE.Mesh | null): void {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }

  function writeShare(next: number): void {
    if (!plate || !rest || !offsets || next === share) return;
    share = next;
    const position = plate.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    for (let i = 0; i < array.length; i++) array[i] = rest[i] + offsets[i] * next;
    position.needsUpdate = true;
  }

  function hide(): void {
    detach(plate);
    plate = null;
    rest = offsets = null;
    share = 0;
    if (hullCut) restoreTurretRingMeshes(hullCut);
    hullCut = null;
  }

  return {
    seat: resolve,
    show() {
      const seat = resolve();
      if (!rendered || !seat || plate) return;
      hullCut = cutTurretRingMeshes(root, hull, turretRingCut(seat, sides));
      plate = attach(seat, hullCut.rim);
      const position = plate.geometry.getAttribute('position') as THREE.BufferAttribute;
      offsets = turretRingPlateDents(plate.geometry, plate.position, options.dents());
      rest = offsets ? (position.array as Float32Array).slice() : null;
      share = 0;
      if (offsets) {
        // the bounds hold every share of the dents
        let reach = 0;
        for (let i = 0; i < offsets.length; i += 3) reach = Math.max(reach, Math.hypot(offsets[i], offsets[i + 1], offsets[i + 2]));
        plate.geometry.boundingSphere!.radius += reach;
        plate.geometry.boundingBox!.expandByScalar(reach);
      }
    },
    ramp(ageS: number) {
      if (plate && offsets) writeShare(turretRingDentShare(ageS));
    },
    hide,
    stageWarm() {
      const seat = resolve();
      if (!rendered || !seat || plate) return () => {};
      const warm = attach(seat, null);
      return () => detach(warm);
    },
    dispose() {
      hide();
      if (material) releaseTurretRingWellMaterial(material, engineCtx);
      material = null;
    },
  };
}

// ---------------------------------------------------------------------------------------------------- static hulks

/** The well's wall under the lip (the seat's: the gear's band, a little inside the race's lip, or a ledge's width
 *  narrower). */
function wellWallRadius(seat: TurretRingSeat): number { return Math.min(seat.openR - 0.018, seat.wellR ?? Infinity); }

/** A hulk's ring: its seat and its two cuts. */
export interface TurretRingHulk {
  seat: TurretRingSeat;
  sides: number;
  /** Above the race's lip on the rim's polygon (its cut faces the band closes; the bake cuts it on the bent hull), then
   *  under it on the polygon of the well's wall down to the floor (the wall closes those; cut as the hull is posed). */
  cuts: [TurretRingCut, TurretRingCut];
}

/**
 * A cook-off hulk's ring (world/wrecks.ts), over its hull-side parts as the bake holds them: posed and crumpled, in the
 * bake's frame (`toHull` takes them to the hull frame; `fill`, a generated interior fill, is never the hull's skin). The
 * well under the race's lip keeps clear of the hull's skin as it is bent (exteriorSkin over those parts: a sponson, a
 * lower side, a track, a glacis running in under a wide ring): narrower than the gear's band where it must (a ledge
 * under the lip), its floor over what is left.
 */
export function planTurretRingHulk(seat: TurretRingSeat,
  parts: Iterable<{ geometry: THREE.BufferGeometry; toHull: THREE.Matrix4 | null; fill: boolean }>,
  sides = turretRingSides(false)): TurretRingHulk {
  const floor0 = seat.deckY - seat.depth;
  let clear = { wellR: Math.min(seat.wellR ?? Infinity, seat.openR - 0.018), floorY: floor0 };
  if (!(seat.skinR - clear.wellR >= CRUMPLE_REACH_M)) {
    // the hull's skin within a crumple's reach of the well as posed: the well keeps clear of it as it is bent
    const triangles: number[] = [];
    const tri = new Float64Array(9);
    const seated = seat.deckY - seat.depth;
    for (const { geometry, toHull, fill } of parts) {
      const position = geometry.getAttribute('position');
      if (fill || !position) continue;
      const index = geometry.index, count = index ? index.count : position.count;
      for (let k = 0; k + 2 < count; k += 3) {
        readTriangle(position, index ? index.getX(k) : k, index ? index.getX(k + 1) : k + 1, index ? index.getX(k + 2) : k + 2,
          toHull, tri);
        for (let i = 0; i < 9; i++) triangles.push(tri[i]);
      }
    }
    clear = wellClearOfSkin(exteriorSkin(triangles, seat.cx, seat.cz, seat.deckY, seat.rimR, seated), seat.deckY, seat.rimR,
      seated);
  }
  const lip = seat.deckY - LIP_M;
  const top = seat.deckY + TURRET_RING_LIFT_M;
  const wellSeat: TurretRingSeat = { ...seat, depth: seat.deckY - clear.floorY, wellR: clear.wellR };
  if (wellSeat.carousel) {
    // the carousel stands inside the wall, or not at all in a pan too shallow for it
    const rOut = Math.min(wellSeat.carousel.rOut, clear.wellR - 0.05);
    wellSeat.carousel = wellSeat.depth >= 0.3 && rOut > wellSeat.carousel.rIn + 0.08
      ? { ...wellSeat.carousel, rOut, h: Math.min(wellSeat.carousel.h, 0.42 * wellSeat.depth) } : null;
  }
  return {
    seat: wellSeat,
    sides,
    cuts: [
      { cx: seat.cx, cz: seat.cz, r: seat.rimR, sides, yLo: lip, yHi: seat.deckY + CUT_RISE_M, top },
      { cx: seat.cx, cz: seat.cz, r: clear.wellR, sides, yLo: clear.floorY - 0.02, yHi: lip, top },
    ],
  };
}

/** One quad (or, with `d` null, one triangle), wound to face `n` (the bake's material is one-sided). */
function pushQuad(out: number[], normals: number[], a: number[], b: number[], c: number[], d: number[] | null,
  n: number[]): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const facing = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
  const tris = facing >= 0 ? (d ? [a, b, c, a, c, d] : [a, b, c]) : (d ? [a, c, b, a, d, c] : [a, c, b]);
  for (const p of tris) { out.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]); }
}

/**
 * The well as real geometry for a hulk's bake (hull frame, non-indexed position and normal), on the polygons its cuts
 * share: the race's top, the band closing the hull's cut faces round the rim (`rim`: their reach per side, hull y, from
 * cutTurretRingAperture; null, the seat's skirt), the race's lip, the step in to the traverse gear's band, the wall down
 * to the floor, the floor, the slip-ring stub and the carousel's cassettes (a hulk's one vertex-coloured mesh carries the
 * char, not the teeth).
 */
export function buildTurretRingWellGeometry(seat: TurretRingSeat, rim: ArrayLike<number> | null,
  sides = turretRingSides(false)): THREE.BufferGeometry {
  const out: number[] = [], normals: number[] = [];
  const { lo, hi } = rimBand(seat, sides, rim, HULK_BAND_PAD_M);
  const top = seat.deckY + TURRET_RING_LIFT_M;
  const lip = seat.deckY - LIP_M, floor = seat.deckY - seat.depth;
  const gearR = wellWallRadius(seat);
  const at = (r: number, a: number, y: number): number[] => [seat.cx + Math.sin(a) * r, y, seat.cz + Math.cos(a) * r];
  const inward = (a: number): number[] => [-Math.sin(a), 0, -Math.cos(a)];
  const outward = (a: number): number[] => [Math.sin(a), 0, Math.cos(a)];
  const up = [0, 1, 0];
  for (let s = 0; s < sides; s++) {
    const s1 = (s + 1) % sides;
    const a0 = (s / sides) * Math.PI * 2, a1 = ((s + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
    // the race's top; the band's outer face from under the deck to over a cut face, its inner face from the race up
    pushQuad(out, normals, at(seat.openR, a0, top), at(seat.rimR, a0, top), at(seat.rimR, a1, top), at(seat.openR, a1, top), up);
    pushQuad(out, normals, at(seat.rimR, a0, top + hi[s]), at(seat.rimR, a1, top + hi[s1]), at(seat.rimR, a1, top + lo[s1]),
      at(seat.rimR, a0, top + lo[s]), outward(am));
    if (hi[s] > 0 || hi[s1] > 0) {
      pushQuad(out, normals, at(seat.rimR, a0, top + hi[s]), at(seat.rimR, a1, top + hi[s1]), at(seat.rimR, a1, top),
        at(seat.rimR, a0, top), inward(am));
    }
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
      at(STUB_R_M, a0, floor), outward(am));
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

/**
 * A hulk part without the ring's prisms (planTurretRingHulk's cuts, in turn; `toHull` takes its positions to the hull
 * frame): a triangle clear of one is copied as it is; one across it keeps exactly its pieces outside (clipped against the
 * caps and each side in turn, never dropped whole: a part's face outside the prism stays where it was); what lies inside
 * is gone; `rim` takes the first cut's faces' reach per side. Returns the same geometry when nothing touches them, else a
 * new non-indexed one with position and normal (the bake keeps no other attribute).
 */
export function cutTurretRingAperture(
  geometry: THREE.BufferGeometry,
  cuts: readonly TurretRingCut[],
  toHull: THREE.Matrix4 | null = null,
  rim: Float64Array | null = null,
): THREE.BufferGeometry {
  let result = geometry;
  cuts.forEach((cut, k) => { result = cutAperture(result, cut, toHull, k === 0 ? rim : null); });
  return result;
}

function cutAperture(
  geometry: THREE.BufferGeometry,
  cut: TurretRingCut,
  toHull: THREE.Matrix4 | null,
  rim: Float64Array | null,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position) return geometry;
  const cutter = ringCutter(cut, false);
  const onRim = rim ? (k: number, y: number): void => noteRim(rim, cut.sides, k, y) : null;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const kept: number[] = [], keptNormal: number[] = [];
  const tri = new Float64Array(9);
  const source = new Float64Array(18); // the triangle's own positions and normals, corner by corner
  let touched = false;
  const emitCorner = (w0: number, w1: number, w2: number, exact: boolean): void => {
    for (let c = 0; c < 3; c++) kept.push(w0 * source[c] + w1 * source[6 + c] + w2 * source[12 + c]);
    const nx = w0 * source[3] + w1 * source[9] + w2 * source[15];
    const ny = w0 * source[4] + w1 * source[10] + w2 * source[16];
    const nz = w0 * source[5] + w1 * source[11] + w2 * source[17];
    const l = exact ? 1 : Math.hypot(nx, ny, nz) || 1;
    keptNormal.push(nx / l, ny / l, nz / l);
  };
  const piece = (poly: number[]): void => {
    const n = poly.length / POLY_STRIDE;
    const at = (c: number): void => {
      const o = c * POLY_STRIDE;
      const w0 = poly[o + 3], w1 = poly[o + 4], w2 = poly[o + 5];
      emitCorner(w0, w1, w2, w0 > 1 - 1e-9 || w1 > 1 - 1e-9 || w2 > 1 - 1e-9);
    };
    for (let c = 1; c + 1 < n; c++) { at(0); at(c); at(c + 1); }
  };
  const read = (c: number, i: number): void => {
    source[c * 6] = position.getX(i); source[c * 6 + 1] = position.getY(i); source[c * 6 + 2] = position.getZ(i);
    source[c * 6 + 3] = normal ? normal.getX(i) : 0;
    source[c * 6 + 4] = normal ? normal.getY(i) : 1;
    source[c * 6 + 5] = normal ? normal.getZ(i) : 0;
  };
  for (let k = 0; k + 2 < count; k += 3) {
    const i0 = index ? index.getX(k) : k, i1 = index ? index.getX(k + 1) : k + 1, i2 = index ? index.getX(k + 2) : k + 2;
    read(0, i0); read(1, i1); read(2, i2);
    readTriangle(position, i0, i1, i2, toHull, tri);
    if (splitAtRing(cutter, tri, piece, onRim)) { touched = true; continue; }
    emitCorner(1, 0, 0, true); emitCorner(0, 1, 0, true); emitCorner(0, 0, 1, true);
  }
  if (!touched) return geometry;
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(keptNormal, 3));
  result.userData = { ...geometry.userData };
  return result;
}
