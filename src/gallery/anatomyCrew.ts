// Gallery anatomy crew: one articulated P50 mannequin (1.75 m) per combat crew station.
//
// The figure is never scaled to its station. Its head centre is pinned to the head of the station's combat body
// shapes (anatomyData.crewStations), the pose comes from the role, and the only fitting the pose does is to tuck
// (recline the trunk, flex hips and knees) until the boots clear the exact hull-shell floor. A station that still
// cannot hold a seated person shows as one: the figure is not shrunk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CrewStation } from './anatomyData.ts';
import { CREW_ROLE_COLORS, SYSTEM_COLORS, type CrewRole } from './anatomyPalette.ts';
import { techMaterial, type TechMaterial } from './anatomyMaterials.ts';

/** P50 stature and the segment lengths it implies (anthropometric fractions of stature). */
export const MANNEQUIN_STATURE_M = 1.75;
const H = MANNEQUIN_STATURE_M;
const SEGMENT = Object.freeze({
  hipHeight: 0.532 * H, // standing hip-joint height (0.93 m)
  hipHalfWidth: 0.052 * H,
  spine: 0.296 * H, // hip joint to shoulder line
  shoulderHalfWidth: 0.114 * H,
  neck: 0.05 * H,
  headRadius: 0.061 * H,
  upperArm: 0.172 * H,
  forearm: 0.157 * H,
  hand: 0.1 * H,
  thigh: 0.251 * H,
  shin: 0.246 * H,
  ankle: 0.037 * H,
  foot: 0.152 * H,
});
/** Head centre above the hip joint when standing straight. */
const HEAD_ABOVE_HIP = SEGMENT.spine + SEGMENT.neck + SEGMENT.headRadius;

interface CrewPose {
  /** Trunk pitch about the hips (radians): + leans forward, − reclines. */
  trunk: number;
  /** Thigh angle from straight down, forward (radians): π/2 is a horizontal thigh. */
  hip: number;
  /** Knee flexion (radians): 0 straight, π/2 a right angle. */
  knee: number;
  /** Upper-arm angle from straight down, forward, in the station frame (not the trunk's): hands stay on the controls. */
  shoulder: number;
  /** Elbow flexion. */
  elbow: number;
  /** Head pitch relative to the trunk (+ looks down). */
  neck: number;
}

const BASE_POSES: Readonly<Record<'driver' | 'gunner' | 'commander' | 'loaderSeated' | 'loaderStanding', CrewPose>> = Object.freeze({
  driver: { trunk: -0.42, hip: 1.45, knee: 1.05, shoulder: 1.1, elbow: 0.4, neck: -0.25 },
  gunner: { trunk: 0.22, hip: 1.52, knee: 1.5, shoulder: 0.72, elbow: 0.86, neck: 0.18 },
  commander: { trunk: 0.04, hip: 1.5, knee: 1.45, shoulder: 0.34, elbow: 1.15, neck: 0 },
  loaderSeated: { trunk: 0.12, hip: 1.45, knee: 1.5, shoulder: 0.5, elbow: 1.0, neck: 0.1 },
  loaderStanding: { trunk: 0.14, hip: 0.22, knee: 0.3, shoulder: 0.55, elbow: 1.05, neck: 0.12 },
});

/** The most tucked pose the solver may reach for each base pose. */
const TUCKED: Readonly<Record<keyof typeof BASE_POSES, CrewPose>> = Object.freeze({
  driver: { trunk: -1.08, hip: 1.62, knee: 1.55, shoulder: 1.25, elbow: 0.3, neck: -0.65 },
  gunner: { trunk: -0.2, hip: 1.95, knee: 2.3, shoulder: 0.8, elbow: 0.8, neck: 0.35 },
  commander: { trunk: -0.3, hip: 1.95, knee: 2.3, shoulder: 0.45, elbow: 1.1, neck: 0.25 },
  loaderSeated: { trunk: -0.3, hip: 1.95, knee: 2.3, shoulder: 0.55, elbow: 1.0, neck: 0.25 },
  loaderStanding: { trunk: 0.3, hip: 1.2, knee: 2.0, shoulder: 0.6, elbow: 1.05, neck: 0.2 },
});

function lerpPose(a: CrewPose, b: CrewPose, t: number): CrewPose {
  const mix = (key: keyof CrewPose) => a[key] + (b[key] - a[key]) * t;
  return { trunk: mix('trunk'), hip: mix('hip'), knee: mix('knee'), shoulder: mix('shoulder'), elbow: mix('elbow'), neck: mix('neck') };
}

/** Sagittal-plane unit vector at angle `a` from straight down, rotating forward (+z). */
const down = (a: number): [number, number] => [-Math.cos(a), Math.sin(a)]; // [y, z]
/** Sagittal-plane unit vector at angle `a` from straight up, rotating forward (+z). */
const up = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];

interface Joints {
  hip: [number, number]; // pelvis origin (y, z)
  shoulder: [number, number];
  neckTop: [number, number];
  head: [number, number];
  knee: [number, number];
  ankle: [number, number];
  toe: [number, number];
  elbow: [number, number];
  wrist: [number, number];
  fingertip: [number, number];
}

/** Joint positions in the sagittal plane, pelvis at the origin, facing +z. */
function poseJoints(pose: CrewPose): Joints {
  const add = (a: [number, number], b: [number, number], s: number): [number, number] => [a[0] + b[0] * s, a[1] + b[1] * s];
  const hip: [number, number] = [0, 0];
  const spine = up(pose.trunk);
  const shoulder = add(hip, spine, SEGMENT.spine);
  const neckDir = up(pose.trunk + pose.neck);
  const neckTop = add(shoulder, neckDir, SEGMENT.neck);
  const head = add(neckTop, neckDir, SEGMENT.headRadius);
  const knee = add(hip, down(pose.hip), SEGMENT.thigh);
  const ankle = add(knee, down(pose.hip - pose.knee), SEGMENT.shin);
  const toe = add(ankle, [0, 1], SEGMENT.foot * 0.78);
  const elbow = add(shoulder, down(pose.shoulder), SEGMENT.upperArm);
  const wrist = add(elbow, down(pose.shoulder + pose.elbow), SEGMENT.forearm);
  const fingertip = add(wrist, down(pose.shoulder + pose.elbow), SEGMENT.hand);
  return { hip, shoulder, neckTop, head, knee, ankle, toe, elbow, wrist, fingertip };
}

/** Lowest point of the posed body, relative to the head centre. */
function lowestBelowHead(joints: Joints): number {
  const boot = Math.min(joints.ankle[0] - SEGMENT.ankle - 0.02, joints.toe[0] - 0.03);
  const seat = joints.hip[0] - 0.09;
  return Math.min(boot, seat, joints.knee[0] - 0.06) - joints.head[0];
}

interface CrewFit {
  pose: CrewPose;
  base: keyof typeof BASE_POSES;
  tuck: number;
  /** Clearance of the lowest body point above the hull-shell floor (negative: the station is too low for a person). */
  floorClearanceM: number;
}

function crewBasePose(station: CrewStation, floorY: number): keyof typeof BASE_POSES {
  const role = station.role;
  if (role === 'driver' || role === 'radio') return station.frame === 'hull' ? 'driver' : 'commander';
  if (role === 'gunner') return 'gunner';
  if (role === 'commander') return 'commander';
  // A loader stands where the station leaves standing height under the head, else sits.
  return station.head[1] - floorY >= HEAD_ABOVE_HIP + SEGMENT.hipHeight * 0.86 ? 'loaderStanding' : 'loaderSeated';
}

/** Pick the least tucked pose whose lowest point clears the floor by 2 cm (bisection over the tuck blend). */
function fitCrewPose(station: CrewStation, floorY: number): CrewFit {
  const base = crewBasePose(station, floorY);
  const clearance = (tuck: number) => {
    const pose = lerpPose(BASE_POSES[base], TUCKED[base], tuck);
    return station.head[1] + lowestBelowHead(poseJoints(pose)) - floorY;
  };
  let tuck = 0;
  if (clearance(0) < 0.02) {
    if (clearance(1) < 0.02) tuck = 1;
    else {
      let lo = 0, hi = 1;
      for (let step = 0; step < 24; step += 1) {
        const mid = (lo + hi) / 2;
        if (clearance(mid) >= 0.02) hi = mid; else lo = mid;
      }
      tuck = hi;
    }
  }
  return { pose: lerpPose(BASE_POSES[base], TUCKED[base], tuck), base, tuck, floorClearanceM: clearance(tuck) };
}

type Tone = 'clay' | 'joint' | 'band';

function capsuleBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const delta = b.clone().sub(a);
  const length = Math.max(1e-4, delta.length());
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 2, 8);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
}

function ellipsoid(center: THREE.Vector3, radii: [number, number, number], pitch = 0, detail: 'body' | 'joint' = 'body'): THREE.BufferGeometry {
  const geometry = detail === 'body' ? new THREE.SphereGeometry(1, 12, 9) : new THREE.SphereGeometry(1, 8, 6);
  geometry.scale(radii[0], radii[1], radii[2]);
  geometry.rotateX(pitch);
  geometry.translate(center.x, center.y, center.z);
  return geometry;
}

interface CrewModel {
  group: THREE.Group;
  materials: TechMaterial[];
  geometries: THREE.BufferGeometry[];
  triangles: number;
  fit: CrewFit;
}

/**
 * One crew mannequin, positioned in its station's frame: the head centre sits exactly on `station.head`.
 * `userData.anatomy` records the combat identity and the measured floor clearance.
 */
export function buildCrewModel(station: CrewStation, floorY: number): CrewModel {
  const fit = fitCrewPose(station, floorY);
  const joints = poseJoints(fit.pose);
  // Sagittal (y, z) → local 3D, pelvis at origin; x is lateral.
  const p = (point: [number, number], x = 0) => new THREE.Vector3(x, point[0], point[1]);
  const pieces: Record<Tone, THREE.BufferGeometry[]> = { clay: [], joint: [], band: [] };
  const S = SEGMENT;
  const trunk = fit.pose.trunk;
  const spineDir = new THREE.Vector3(0, Math.cos(trunk), Math.sin(trunk));
  const at = (t: number) => new THREE.Vector3(0, 0, 0).addScaledVector(spineDir, t);
  // Pelvis, abdomen and chest as overlapping clay ellipsoids along the spine (one continuous torso silhouette).
  pieces.clay.push(ellipsoid(at(0.03), [0.165, 0.11, 0.115], trunk));
  pieces.clay.push(ellipsoid(at(S.spine * 0.3), [0.145, 0.16, 0.105], trunk));
  pieces.clay.push(ellipsoid(at(S.spine * 0.64), [0.19, 0.2, 0.12], trunk));
  // Neck and head with a CVC helmet, ear cups and the role band.
  pieces.clay.push(capsuleBetween(p(joints.shoulder), p(joints.neckTop), 0.05));
  const head = p(joints.head);
  const headPitch = trunk + fit.pose.neck;
  pieces.clay.push(ellipsoid(head, [S.headRadius * 0.86, S.headRadius, S.headRadius * 0.96], headPitch));
  const helmet = new THREE.SphereGeometry(S.headRadius * 1.18, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.56);
  helmet.scale(1, 0.94, 1.06);
  helmet.rotateX(headPitch);
  helmet.translate(head.x, head.y + S.headRadius * 0.12 * Math.cos(headPitch), head.z - S.headRadius * 0.12 * Math.sin(headPitch));
  pieces.clay.push(helmet);
  for (const side of [-1, 1]) {
    const cup = new THREE.CylinderGeometry(0.042, 0.042, 0.035, 10);
    cup.rotateZ(Math.PI / 2);
    cup.translate(head.x + side * S.headRadius * 1.02, head.y, head.z);
    pieces.joint.push(cup);
  }
  const band = new THREE.TorusGeometry(S.headRadius * 1.17, 0.012, 4, 22);
  band.rotateX(Math.PI / 2 + headPitch);
  band.translate(head.x, head.y + S.headRadius * 0.22 * Math.cos(headPitch), head.z - S.headRadius * 0.22 * Math.sin(headPitch));
  pieces.band.push(band);
  for (const side of [-1, 1]) {
    // Arms: shoulder, upper arm, elbow, forearm, hand.
    const shoulder = p(joints.shoulder, side * S.shoulderHalfWidth);
    const elbow = p(joints.elbow, side * S.shoulderHalfWidth * 1.02);
    const wrist = p(joints.wrist, side * S.shoulderHalfWidth * 0.86);
    const tip = p(joints.fingertip, side * S.shoulderHalfWidth * 0.84);
    pieces.clay.push(capsuleBetween(shoulder, elbow, 0.047));
    pieces.clay.push(capsuleBetween(elbow, wrist, 0.039));
    pieces.clay.push(capsuleBetween(wrist, tip, 0.034));
    pieces.joint.push(ellipsoid(shoulder, [0.058, 0.058, 0.058], 0, 'joint'), ellipsoid(elbow, [0.046, 0.046, 0.046], 0, 'joint'));
    // Legs: hip, thigh, knee, shin, boot.
    const hip = p(joints.hip, side * S.hipHalfWidth * 1.7);
    const knee = p(joints.knee, side * S.hipHalfWidth * 1.75);
    const ankle = p(joints.ankle, side * S.hipHalfWidth * 1.75);
    pieces.clay.push(capsuleBetween(hip, knee, 0.07));
    pieces.clay.push(capsuleBetween(knee, ankle, 0.052));
    pieces.joint.push(ellipsoid(knee, [0.058, 0.058, 0.058], 0, 'joint'), ellipsoid(hip, [0.066, 0.066, 0.066], 0, 'joint'));
    const boot = new THREE.BoxGeometry(0.1, 0.085, S.foot);
    boot.translate(ankle.x, ankle.y - S.ankle + 0.0425 - 0.02, ankle.z + S.foot * 0.3);
    pieces.joint.push(boot);
  }
  const colors: Record<Tone, string> = { clay: SYSTEM_COLORS.crew, joint: '#3a434e', band: CREW_ROLE_COLORS[station.role as CrewRole] };
  const group = new THREE.Group();
  group.name = `anatomy_crew_${station.crew}_${station.index}`;
  const figure = new THREE.Group();
  figure.name = 'anatomy_crew_figure';
  const materials: TechMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  let triangles = 0;
  for (const tone of ['clay', 'joint', 'band'] as const) {
    const list = pieces[tone].map((geometry) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (flat !== geometry) geometry.dispose();
      for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
      return flat;
    });
    const merged = mergeGeometries(list, false);
    list.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    const material = techMaterial({ color: colors[tone] });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `${group.name}_${tone}`;
    figure.add(mesh);
    materials.push(material);
    geometries.push(merged);
    triangles += merged.getAttribute('position').count / 3;
  }
  // Pin the head centre on the station's combat head anchor; the marker lets a receipt measure the pin.
  const headMarker = new THREE.Object3D();
  headMarker.name = 'anatomy_crew_head';
  headMarker.position.copy(head);
  figure.add(headMarker);
  figure.position.set(station.head[0] - head.x, station.head[1] - head.y, station.head[2] - head.z);
  group.add(figure);
  group.userData.anatomy = {
    kind: 'crew', crew: station.crew, role: station.role, index: station.index, frame: station.frame,
    head: [...station.head], pose: fit.base, tuck: Number(fit.tuck.toFixed(3)),
    floorClearanceM: Number(fit.floorClearanceM.toFixed(3)), statureM: MANNEQUIN_STATURE_M,
  };
  return { group, materials, geometries, triangles, fit };
}

/** Standing stature implied by the segment table (the receipt pins it to P50). */
export function mannequinStandingHeight(): number {
  return SEGMENT.hipHeight + HEAD_ABOVE_HIP + SEGMENT.headRadius;
}
