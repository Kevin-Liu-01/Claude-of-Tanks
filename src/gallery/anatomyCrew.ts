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
  // Fully reclined with the thighs raised and the knees past a right angle: feet on pedals close under the knees.
  driver: { trunk: -1.0, hip: 2.05, knee: 2.25, shoulder: 1.3, elbow: 0.25, neck: -0.6 },
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
  /** Lower-body points (of 6) inside the hull shell. */
  insideShell: number;
  /** Head slide along the station (frame z, metres) the fit needed; 0 keeps the head on the combat head anchor. */
  slideM: number;
}

function crewBasePose(station: CrewStation, floorY: number): keyof typeof BASE_POSES {
  const role = station.role;
  if (role === 'driver' || role === 'radio') return station.frame === 'hull' ? 'driver' : 'commander';
  if (role === 'gunner') return 'gunner';
  if (role === 'commander') return 'commander';
  // A loader stands where the station leaves standing height under the head, else sits.
  return station.head[1] - floorY >= HEAD_ABOVE_HIP + SEGMENT.hipHeight * 0.86 ? 'loaderStanding' : 'loaderSeated';
}

/** Station-frame points of the lower body (knees, ankles, toes) for a pose whose head centre is at `head`. */
function lowerBodyPoints(head: readonly number[], joints: Joints): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (const side of [-1, 1]) {
    const x = head[0] + side * SEGMENT.hipHalfWidth * 1.75;
    for (const joint of [joints.knee, joints.ankle, joints.toe]) {
      points.push([x, head[1] + joint[0] - joints.head[0], head[2] + joint[1] - joints.head[1]]);
    }
  }
  return points;
}

/** A frame-local point inside the vehicle's exact hull shell (supplied by the scene from the collision cells). */
type InsideShell = (point: readonly [number, number, number]) => boolean;

/** Head slides along the station (frame z) tried when no tuck keeps the legs inside the shell, nearest first. */
function stationSlides(station: CrewStation): number[] {
  const margin = SEGMENT.headRadius;
  const back = Math.min(0, station.volume.min[2] + margin - station.head[2]);
  const front = Math.max(0, station.volume.max[2] - margin - station.head[2]);
  const slides = [0];
  for (let step = 0.05; step <= Math.max(-back, front) + 1e-9; step += 0.05) {
    if (-step >= back) slides.push(-step);
    if (step <= front) slides.push(step);
  }
  return slides;
}

/**
 * Pick the least tucked pose (tuck blend 0…1) whose lowest point clears the floor by 2 cm and whose knees, ankles and
 * toes stay inside the hull shell, with the head on the station's head anchor. Where no tuck does, the head may slide
 * along the station (inside the combat station box, nearest slide first): a reclined driver whose head shape sits
 * mid-station otherwise pushes the legs through the glacis. Failing that, the first pose with both knees and ankles
 * inside (a toe may touch a sloped plate), else the pose with the most lower-body points inside.
 */
function fitCrewPose(station: CrewStation, floorY: number, inside?: InsideShell): CrewFit {
  const base = crewBasePose(station, floorY);
  const evaluate = (tuck: number, slide: number) => {
    const pose = lerpPose(BASE_POSES[base], TUCKED[base], tuck);
    const joints = poseJoints(pose);
    const head = [station.head[0], station.head[1], station.head[2] + slide];
    const clearance = head[1] + lowestBelowHead(joints) - floorY;
    const flags = inside ? lowerBodyPoints(head, joints).map((point) => inside(point)) : [true, true, true, true, true, true];
    // Per side: knee, ankle, toe. The knees and ankles carry the silhouette; a toe may touch a sloped plate.
    const contained = flags.filter(Boolean).length;
    const legs = flags.filter((flag, index) => flag && index % 3 !== 2).length;
    return { tuck, slide, pose, clearance, contained, legs };
  };
  type Step = ReturnType<typeof evaluate>;
  const clear = (step: Step) => step.clearance >= 0.02;
  const evaluated: Step[] = [];
  const search = (accept: (step: Step) => boolean): Step | undefined => {
    for (let index = 0; index <= 40; index += 1) {
      const step = evaluate(index / 40, 0);
      evaluated.push(step);
      if (clear(step) && accept(step)) return step;
    }
    if (!inside) return undefined;
    for (const slide of stationSlides(station).slice(1)) {
      for (let index = 0; index <= 40; index += 2) {
        const step = evaluate(index / 40, slide);
        evaluated.push(step);
        if (clear(step) && accept(step)) return step;
      }
    }
    return undefined;
  };
  const pick = search((step) => step.contained === 6)
    || evaluated.find((step) => clear(step) && step.legs === 4)
    || evaluated.filter(clear).sort((a, b) => b.contained - a.contained || Math.abs(a.slide) - Math.abs(b.slide) || a.tuck - b.tuck)[0]
    || evaluated[40];
  return { pose: pick.pose, base, tuck: pick.tuck, slideM: pick.slide, floorClearanceM: pick.clearance, insideShell: pick.contained };
}

type Tone = 'clay' | 'joint' | 'band';

function capsuleBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const delta = b.clone().sub(a);
  const length = Math.max(1e-4, delta.length());
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 3, 10);
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
export function buildCrewModel(station: CrewStation, floorY: number, inside?: InsideShell): CrewModel {
  const fit = fitCrewPose(station, floorY, inside);
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
  // Neck and head with a CVC helmet and the role band.
  pieces.clay.push(capsuleBetween(p(joints.shoulder), p(joints.neckTop), 0.05));
  const head = p(joints.head);
  const headPitch = trunk + fit.pose.neck;
  pieces.clay.push(ellipsoid(head, [S.headRadius * 0.86, S.headRadius, S.headRadius * 0.96], headPitch));
  const helmet = new THREE.SphereGeometry(S.headRadius * 1.18, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.56);
  helmet.scale(1, 0.94, 1.06);
  helmet.rotateX(headPitch);
  helmet.translate(head.x, head.y + S.headRadius * 0.12 * Math.cos(headPitch), head.z - S.headRadius * 0.12 * Math.sin(headPitch));
  pieces.clay.push(helmet);
  const band = new THREE.TorusGeometry(S.headRadius * 1.17, 0.012, 4, 22);
  band.rotateX(Math.PI / 2 + headPitch);
  band.translate(head.x, head.y + S.headRadius * 0.22 * Math.cos(headPitch), head.z - S.headRadius * 0.22 * Math.sin(headPitch));
  pieces.band.push(band);
  // Limbs are clay capsules whose round ends meet at the joints: one continuous figure, no graphite ball joints (the Gallery
  // follow-up of 2026-10-21: the jointed balls and ear cups read as a toy mannequin).
  for (const side of [-1, 1]) {
    // Arms: upper arm, forearm, hand.
    const shoulder = p(joints.shoulder, side * S.shoulderHalfWidth);
    const elbow = p(joints.elbow, side * S.shoulderHalfWidth * 1.02);
    const wrist = p(joints.wrist, side * S.shoulderHalfWidth * 0.86);
    const tip = p(joints.fingertip, side * S.shoulderHalfWidth * 0.84);
    pieces.clay.push(capsuleBetween(shoulder, elbow, 0.047));
    pieces.clay.push(capsuleBetween(elbow, wrist, 0.039));
    pieces.clay.push(capsuleBetween(wrist, tip, 0.034));
    // Legs: thigh, shin, boot.
    const hip = p(joints.hip, side * S.hipHalfWidth * 1.7);
    const knee = p(joints.knee, side * S.hipHalfWidth * 1.75);
    const ankle = p(joints.ankle, side * S.hipHalfWidth * 1.75);
    pieces.clay.push(capsuleBetween(hip, knee, 0.07));
    pieces.clay.push(capsuleBetween(knee, ankle, 0.052));
    const boot = new THREE.BoxGeometry(0.1, 0.085, S.foot);
    boot.translate(ankle.x, ankle.y - S.ankle + 0.0425 - 0.02, ankle.z + S.foot * 0.3);
    pieces.joint.push(boot);
  }
  // A graphite seat pan and backrest under every seated figure (a standing loader has none), following the trunk.
  if (fit.base !== 'loaderStanding') {
    const pan = new THREE.BoxGeometry(0.4, 0.05, 0.38);
    pan.translate(0, -0.13, 0.06);
    pieces.joint.push(pan);
    const back = new THREE.BoxGeometry(0.4, 0.46, 0.05);
    back.rotateX(trunk);
    const along = 0.25, behind = 0.15;
    back.translate(0, Math.cos(trunk) * along + Math.sin(trunk) * behind, Math.sin(trunk) * along - Math.cos(trunk) * behind);
    pieces.joint.push(back);
  }
  // Role-tinted clay (the role colour lifted toward the crew paper tone), graphite joints, full-strength role band.
  const role = CREW_ROLE_COLORS[station.role as CrewRole];
  const clay = '#' + new THREE.Color(role).lerp(new THREE.Color(SYSTEM_COLORS.crew), 0.3).getHexString();
  const colors: Record<Tone, string> = { clay, joint: '#3a434e', band: role };
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
  figure.position.set(station.head[0] - head.x, station.head[1] - head.y, station.head[2] + fit.slideM - head.z);
  group.add(figure);
  group.userData.anatomy = {
    kind: 'crew', crew: station.crew, role: station.role, index: station.index, frame: station.frame,
    head: [...station.head], pose: fit.base, tuck: Number(fit.tuck.toFixed(3)),
    floorClearanceM: Number(fit.floorClearanceM.toFixed(3)), insideShell: fit.insideShell, slideM: fit.slideM,
    statureM: MANNEQUIN_STATURE_M,
  };
  return { group, materials, geometries, triangles, fit };
}

/** Standing stature implied by the segment table (the receipt pins it to P50). */
export function mannequinStandingHeight(): number {
  return SEGMENT.hipHeight + HEAD_ABOVE_HIP + SEGMENT.headRadius;
}
