// src/ui/garageOrbitClearance.ts — the Garage camera's clearance through its whole orbit (garage-env-276).
//
// The showroom camera (engine/cameraRig.ts, GARAGE CAMERA) orbits the hero freely in yaw, between its pitch clamps, at
// its fitted distance. A pack's scenery must never hold the camera inside it or stand between it and the hero: the
// opening view's check alone let a drum fill Steinburg's rear view and a beam cross half of Sirocco's (both arms of the
// garage-env-276 baseline). The band is sampled every 15 degrees of yaw at its pitches and distances; a part whose box
// comes within the camera's margin of a sample, or crosses the sample's sightline to the hero's look point, is a finding.
import * as THREE from 'three';
import { GARAGE_PRESENTATION_POSE } from '../game/garagePresentationPose.ts';

/**
 * The orbit the camera takes round the hero (metres from the look point, pitch in radians). PROVISIONAL, from the rig's
 * constants and the canonical pose (SHOW_PITCH_MIN/MAX 5/35 degrees; the canonical camera stands 11.2 m from the look
 * point): the distances become the browser recording's (the fitted distance over the fleet's shortest and longest hulls)
 * once it is taken.
 */
export const GARAGE_ORBIT_BAND = Object.freeze({
  distancesM: Object.freeze([9.5, Math.hypot(...GARAGE_PRESENTATION_POSE.cameraOffsetM.map((v, i) => (i === 1 ? v - GARAGE_PRESENTATION_POSE.cameraLookHeightM : v))), 13.5]),
  pitchesRad: Object.freeze([5, GARAGE_PRESENTATION_POSE.cameraPitchRad * 180 / Math.PI, 35].map((deg) => deg * Math.PI / 180)),
  yawStepRad: Math.PI / 12,
  /** How close a part may stand to the camera (the near plane, the lens and a body's breadth). */
  marginM: 1.2,
});

export interface GarageScenePart {
  readonly label: string;
  readonly box: THREE.Box3;
  /** Its triangles (the box only nominates: a ring, a canopy or a wall run boxes far more than it draws). */
  readonly geometry?: THREE.BufferGeometry;
  /** Where its geometry stands (an instance's world matrix); absent, the geometry is in place. */
  readonly matrix?: THREE.Matrix4;
}

export interface GarageOrbitSample {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly distanceM: number;
  readonly camera: THREE.Vector3;
}

/** The orbit's camera positions round the look point (the canonical camera's own azimuth first). */
export function garageOrbitSamples(band = GARAGE_ORBIT_BAND): GarageOrbitSample[] {
  const samples: GarageOrbitSample[] = [];
  const look = GARAGE_PRESENTATION_POSE.cameraLookHeightM;
  const start = Math.atan2(GARAGE_PRESENTATION_POSE.cameraOffsetM[0], GARAGE_PRESENTATION_POSE.cameraOffsetM[2]);
  for (let yaw = 0; yaw < Math.PI * 2 - 1e-6; yaw += band.yawStepRad) {
    for (const pitch of band.pitchesRad) {
      for (const distance of band.distancesM) {
        const a = start + yaw, h = distance * Math.cos(pitch);
        samples.push({
          yawDeg: Math.round(yaw * 180 / Math.PI), pitchDeg: Math.round(pitch * 180 / Math.PI), distanceM: Number(distance.toFixed(1)),
          camera: new THREE.Vector3(Math.sin(a) * h, look + distance * Math.sin(pitch), Math.cos(a) * h),
        });
      }
    }
  }
  return samples;
}

/** The parts that hold the camera or block its view of the hero, by part, with the first orbit sample that meets each. */
export function auditGarageOrbitClearance(
  parts: readonly GarageScenePart[],
  samples: readonly GarageOrbitSample[] = garageOrbitSamples(),
  marginM = GARAGE_ORBIT_BAND.marginM,
): string[] {
  const findings: string[] = [];
  const target = new THREE.Vector3(0, GARAGE_PRESENTATION_POSE.cameraLookHeightM, 0);
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  for (const part of parts) {
    let triangles: THREE.Triangle[] | null = null;
    const exact = () => (triangles ??= trianglesOf(part));
    for (const sample of samples) {
      const where = `yaw ${sample.yawDeg} pitch ${sample.pitchDeg} at ${sample.distanceM} m`;
      if (part.box.distanceToPoint(sample.camera) < marginM) {
        const near = nearest(exact(), sample.camera);
        if (near.distance < marginM) {
          const p = near.point;
          findings.push(`${part.label} holds the camera (${where}; its surface at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}))`);
          break;
        }
      }
      ray.origin.copy(sample.camera);
      ray.direction.subVectors(target, sample.camera).normalize();
      const reach = sample.camera.distanceTo(target) - 0.5;
      if (ray.intersectBox(part.box, hit) && hit.distanceTo(sample.camera) < reach && firstHit(exact(), ray) < reach) {
        findings.push(`${part.label} blocks the hero (${where})`); break;
      }
    }
  }
  return findings;
}

/** A part's triangles in place (or its box's twelve, for a part given by its box alone). */
function trianglesOf(part: GarageScenePart): THREE.Triangle[] {
  const geometry = part.geometry;
  if (!geometry) {
    const b = part.box, c = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z));
    const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
    return faces.flatMap(([a, b2, c2, d]) => [new THREE.Triangle(c[a], c[b2], c[c2]), new THREE.Triangle(c[a], c[c2], c[d])]);
  }
  const position = geometry.getAttribute('position'), index = geometry.index;
  const count = index ? index.count : position.count, out: THREE.Triangle[] = [];
  const vertex = (k: number) => {
    const v = new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(k) : k);
    return part.matrix ? v.applyMatrix4(part.matrix) : v;
  };
  for (let k = 0; k + 2 < count; k += 3) out.push(new THREE.Triangle(vertex(k), vertex(k + 1), vertex(k + 2)));
  return out;
}

const _closest = new THREE.Vector3();
function nearest(triangles: readonly THREE.Triangle[], point: THREE.Vector3): { distance: number; point: THREE.Vector3 } {
  let distance = Infinity;
  const best = new THREE.Vector3();
  for (const triangle of triangles) {
    const d = triangle.closestPointToPoint(point, _closest).distanceTo(point);
    if (d < distance) { distance = d; best.copy(_closest); }
  }
  return { distance, point: best };
}

const _hit = new THREE.Vector3();
function firstHit(triangles: readonly THREE.Triangle[], ray: THREE.Ray): number {
  let best = Infinity;
  for (const t of triangles) if (ray.intersectTriangle(t.a, t.b, t.c, false, _hit)) best = Math.min(best, _hit.distanceTo(ray.origin));
  return best;
}

/**
 * Whether a piece moved by the orbit rule stands on level ground: the ground under the middle of its footprint (its
 * centre and four points at 30 % of its extent each way) varies by less than 0.3 m (the kit's own level-ground
 * standard, garageHorizonLandmarks.selftest.mjs).
 */
export function garageStandsLevel(box: THREE.Box3, groundAtWorld: (x: number, z: number) => number): boolean {
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const hx = (box.max.x - box.min.x) * 0.3, hz = (box.max.z - box.min.z) * 0.3;
  let lo = Infinity, hi = -Infinity;
  for (const [dx, dz] of [[0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    const h = groundAtWorld(cx + dx, cz + dz); lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo < 0.3;
}

/**
 * The places the orbit rule tries for a piece standing at (x, z) about the hero, nearest first: straight out from the hero
 * in half-metre steps and, at each of those reaches, turned up to 30 degrees either way round the hero; each as its move
 * (dx, dz) and how far that is.
 */
export function garageOrbitRelocations(x: number, z: number, reachM = 10, stepM = 0.5): Array<{ dx: number; dz: number; movedM: number }> {
  const r = Math.hypot(x, z) || 1, a0 = Math.atan2(z, x), out: Array<{ dx: number; dz: number; movedM: number }> = [];
  for (let step = stepM; step <= reachM + 1e-9; step += stepM) {
    for (const deg of [0, -10, 10, -20, 20, -30, 30]) {
      const a = a0 + deg * Math.PI / 180, nx = Math.cos(a) * (r + step), nz = Math.sin(a) * (r + step);
      out.push({ dx: nx - x, dz: nz - z, movedM: Math.hypot(nx - x, nz - z) });
    }
  }
  return out.sort((p, q) => p.movedM - q.movedM);
}

/**
 * A part as the showroom camera's spring arm sees it: its bounds in its own frame, and where that frame stands (a
 * rotation, translation and scale; absent, the box stands axis-aligned where it is). An angled building, a diagonal
 * rail or a tilted rock keeps a box its own size, where an axis-aligned one swells into the empty space beside it.
 */
export interface GarageCameraObstacle {
  readonly box: THREE.Box3;
  readonly matrix?: THREE.Matrix4;
}

const _yawLocal = new THREE.Box3();
/**
 * A merged part's obstacle: its vertices boxed at the yaw (in 5-degree steps) that boxes them tightest. Most of the
 * Garage's parts stand square to a yard, a street or the hero; a regional building set at an angle boxes square to itself.
 */
export function garageObstacleOfGeometry(geometry: THREE.BufferGeometry): GarageCameraObstacle | null {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || bounds.isEmpty()) return null;
  const position = geometry.getAttribute('position');
  if (!position || Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) < 3) return { box: bounds.clone() };
  let bestYaw = 0, bestArea = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
  for (let deg = 5; deg < 90; deg += 5) {
    const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i), z = position.getZ(i), u = x * c - z * sn, v = x * sn + z * c;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < bestArea * 0.98) { bestArea = area; bestYaw = a; }
  }
  if (bestYaw === 0) return { box: bounds.clone() };
  const c = Math.cos(bestYaw), sn = Math.sin(bestYaw);
  _yawLocal.makeEmpty();
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i), z = position.getZ(i);
    _yawLocal.expandByPoint(p.set(x * c - z * sn, position.getY(i), x * sn + z * c));
  }
  return { box: _yawLocal.clone(), matrix: new THREE.Matrix4().makeRotationY(bestYaw) };
}

/** An obstacle's world-frame bounds (the kit's reach and standing filters). */
export function garageObstacleBounds(obstacle: GarageCameraObstacle, target = new THREE.Box3()): THREE.Box3 {
  target.copy(obstacle.box);
  return obstacle.matrix ? target.applyMatrix4(obstacle.matrix) : target;
}

interface OrientedObstacle {
  readonly center: THREE.Vector3;
  readonly half: THREE.Vector3;
  /** world to the box's own axes */
  readonly inverse: THREE.Quaternion;
}

function orient(obstacle: GarageCameraObstacle): OrientedObstacle {
  const center = obstacle.box.getCenter(new THREE.Vector3()), half = obstacle.box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  if (!obstacle.matrix) return { center, half, inverse: new THREE.Quaternion() };
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  obstacle.matrix.decompose(position, rotation, scale);
  half.multiply(scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)));
  return { center: center.applyMatrix4(obstacle.matrix), half, inverse: rotation.invert() };
}

/** The showroom camera's spring-arm query (engine/cameraRig.ts ShowroomOrbitDeps.clearance), and its receipts' test. */
export interface GarageCameraClearance {
  (look: THREE.Vector3, eye: THREE.Vector3, marginM?: number): number;
  /** The first part whose box (grown by `marginM`) holds the point, or -1. */
  holding(point: THREE.Vector3, marginM?: number): number;
}

/**
 * The spring arm's query against these parts: the share (0..1) of the segment from `look` to `eye` before it comes
 * within `marginM` of a part (the orbit's margin unless the rig asks for its contact distance), all in the parts' frame.
 * A part whose grown box holds the look point is no obstacle (the hero's own plinth and pad).
 */
export function garageCameraClearance(parts: readonly GarageCameraObstacle[], defaultMarginM: number = GARAGE_ORBIT_BAND.marginM): GarageCameraClearance {
  const oriented = parts.map(orient);
  const box = new THREE.Box3(), ray = new THREE.Ray(), hit = new THREE.Vector3(), local = new THREE.Vector3();
  const grown = (index: number, marginM: number): THREE.Box3 => {
    const { half } = oriented[index];
    box.min.set(-half.x - marginM, -half.y - marginM, -half.z - marginM);
    box.max.set(half.x + marginM, half.y + marginM, half.z + marginM);
    return box;
  };
  const toLocal = (index: number, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 =>
    out.subVectors(point, oriented[index].center).applyQuaternion(oriented[index].inverse);
  const holding = (point: THREE.Vector3, marginM = 0): number => {
    for (let index = 0; index < oriented.length; index += 1) if (grown(index, marginM).containsPoint(toLocal(index, point, local))) return index;
    return -1;
  };
  const query = (look: THREE.Vector3, eye: THREE.Vector3, marginM = defaultMarginM): number => {
    const length = look.distanceTo(eye);
    if (length < 1e-6 || oriented.length === 0) return 1;
    let first = length;
    for (let index = 0; index < oriented.length; index += 1) {
      const { half, center } = oriented[index];
      // a cheap reject: the segment never comes within the box's grown radius
      const reach = Math.hypot(half.x, half.y, half.z) + marginM;
      if (center.distanceTo(look) > length + reach) continue;
      const bounds = grown(index, marginM);
      toLocal(index, look, ray.origin);
      if (bounds.containsPoint(ray.origin)) continue;
      ray.direction.subVectors(eye, look).multiplyScalar(1 / length).applyQuaternion(oriented[index].inverse);
      if (ray.intersectBox(bounds, hit)) first = Math.min(first, hit.distanceTo(ray.origin));
    }
    return first / length;
  };
  return Object.assign(query, { holding });
}
