// Garage workshop crew (the owner, 2026-10-09: "human workers working with each other on tanks"). Procedural
// mechanics in national work dress, posed at work in pairs and groups around the shared service bays.
//
// One figure is a small articulated body (pelvis and chest, neck and head, two-bone arms and legs, gloves, boots,
// headgear) solved from grip and ankle targets with two-bone IK, so every hand closes on its tool or load and every
// foot stands on the floor, a deck or a step. Proportions follow standard anthropometric fractions of stature
// (hip 0.53 H, shoulder 0.818 H, chin 0.87 H, upper arm 0.186 H, forearm 0.146 H). The parts merge into one
// vertex-coloured geometry per figure, drawn by one material that shares the Garage's seeded vertex-colour program,
// so a crew adds no shader compile and merges into its bay owner's display batch.
//
// Imported only by garageDressing.ts: the figures demand-load with the dressing and never reach boot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = readonly [number, number, number];

type CrewHeadgear = 'patrol-cap' | 'shlemofon' | 'watch-cap' | 'welding-hood' | 'ear-defenders' | 'bare';

interface CrewDress {
  /** Coverall body colour (sRGB hex). */
  readonly coverall: number;
  /** Belt, collar, cuffs, pockets and knee patches. */
  readonly trim: number;
  readonly skin: number;
  readonly hair: number;
  readonly boots: number;
  /** Work gloves, or null for bare hands. */
  readonly gloves: number | null;
  readonly headgear: CrewHeadgear;
  readonly headColor: number;
  /** Sleeves rolled to mid-forearm (bare forearms) instead of buttoned at the wrist. */
  readonly sleevesRolled?: boolean;
  /** Body build: scales torso width and limb girth (1 = average; 0.94 lean to 1.08 heavy). */
  readonly build?: number;
}

interface CrewPose {
  /** Hip-joint centre in the figure frame (feet stand on y = 0, the figure faces +Z). */
  readonly pelvis: V3;
  /** Pelvis yaw (about +Y), forward pitch and roll, in radians. */
  readonly hips?: V3;
  /** Waist bend on top of the hips: forward bend, twist, side bend (rad). */
  readonly spine?: V3;
  /** Head pitch (down is positive) and yaw (left is positive), relative to the chest. */
  readonly head?: readonly [number, number];
  /** Palm-centre grip points; null or omitted lets the arm hang. */
  readonly leftHand?: V3 | null;
  readonly rightHand?: V3 | null;
  /** Elbow pole hints (points the elbow bends toward). */
  readonly leftElbow?: V3;
  readonly rightElbow?: V3;
  /** Ankle points. */
  readonly leftFoot: V3;
  readonly rightFoot: V3;
  /** Knee pole hints. */
  readonly leftKnee?: V3;
  readonly rightKnee?: V3;
  /** Foot headings about +Y relative to the figure, and toe-down pitch (kneeling, tiptoe). */
  readonly leftFootYaw?: number;
  readonly rightFootYaw?: number;
  readonly leftFootPitch?: number;
  readonly rightFootPitch?: number;
  /** Standing height in metres (default 1.76). */
  readonly height?: number;
}

/** Joint positions a crew receipt can check (figure frame, metres). */
interface CrewSkeleton {
  readonly hips: V3;
  readonly leftShoulder: V3;
  readonly rightShoulder: V3;
  readonly leftElbow: V3;
  readonly rightElbow: V3;
  readonly leftWrist: V3;
  readonly rightWrist: V3;
  readonly leftKnee: V3;
  readonly rightKnee: V3;
  readonly leftAnkle: V3;
  readonly rightAnkle: V3;
  readonly headCenter: V3;
  /** Distance from each grip target to the solved palm (0 when the hand reaches its tool). */
  readonly leftGripErrorM: number;
  readonly rightGripErrorM: number;
  /** Lowest boot-sole point: 0 when standing on the floor. */
  readonly soleY: number;
}

interface CrewFigureBuild {
  readonly geometry: THREE.BufferGeometry;
  readonly skeleton: CrewSkeleton;
  readonly triangles: number;
}

// --- anthropometric frame (H = 1.76 m) --------------------------------------
const STATURE_M = 1.76;
const HIP_HALF_WIDTH = 0.088;
const THIGH_M = 0.432;
const SHIN_M = 0.428;
const UPPER_ARM_M = 0.322;
const FOREARM_M = 0.257;
const WAIST_PIVOT_Y = 0.13;
const SHOULDER_Y = 0.50;
const SHOULDER_HALF_WIDTH = 0.178;
const NECK_BASE_Y = 0.535;
const PALM_FROM_WRIST_M = 0.075;
/** The boot sole sits this far below the ankle joint: a standing ankle target is (x, 0.075 H/1.76, z). */
export const CREW_SOLE_BELOW_ANKLE_M = 0.075;
/** Hip-joint height of a relaxed standing figure of default stature (knees just off lock). */
export const CREW_STANDING_HIP_M = 0.915;

// Torso cross-sections: [y above the hip joints, half width, half depth, forward offset].
// The pelvis loft rises inside the chest above the waist pivot, so a forward bend never opens the back.
const PELVIS_RINGS: readonly (readonly [number, number, number, number])[] = [
  [-0.115, 0.135, 0.098, 0.0],
  [-0.03, 0.172, 0.114, 0.0],
  [0.06, 0.168, 0.112, 0.004],
  [WAIST_PIVOT_Y + 0.012, 0.158, 0.108, 0.006],
  [WAIST_PIVOT_Y + 0.08, 0.148, 0.1, 0.0],
];
const CHEST_RINGS: readonly (readonly [number, number, number, number])[] = [
  [WAIST_PIVOT_Y - 0.012, 0.158, 0.108, 0.006],
  [0.24, 0.17, 0.12, 0.014],
  [0.36, 0.188, 0.13, 0.02],
  [0.455, 0.192, 0.12, 0.008],
  [0.51, 0.15, 0.094, -0.004],
  [0.548, 0.07, 0.062, 0.0],
];

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _color = new THREE.Color();

function vec(v: V3): THREE.Vector3 { return new THREE.Vector3(v[0], v[1], v[2]); }
function tuple(v: THREE.Vector3): V3 { return [round3(v.x), round3(v.y), round3(v.z)]; }
function round3(x: number): number { return Math.round(x * 1000) / 1000; }

/** Paint a part geometry one colour, drop its UVs and bake its transform, ready to merge. */
function finish(geometry: THREE.BufferGeometry, color: number, matrix: THREE.Matrix4): THREE.BufferGeometry {
  geometry.deleteAttribute('uv');
  geometry.applyMatrix4(matrix);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  _color.setHex(color);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (!geometry.index) {
    const index = new Array<number>(count);
    for (let i = 0; i < count; i++) index[i] = i;
    geometry.setIndex(index);
  }
  return geometry;
}

/** A tapered limb from `a` (radius r0) to `b` (radius r1), open-ended (joints are capped by balls). */
function limb(parts: THREE.BufferGeometry[], a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number,
  color: number, radial = 8): void {
  const length = a.distanceTo(b);
  if (length < 1e-4) return;
  const geometry = new THREE.CylinderGeometry(r1, r0, length, radial, 1, true);
  _a.subVectors(b, a).normalize();
  _q.setFromUnitVectors(_up, _a);
  _b.addVectors(a, b).multiplyScalar(0.5);
  _m.compose(_b, _q, _s.set(1, 1, 1));
  parts.push(finish(geometry, color, _m));
}

function ball(parts: THREE.BufferGeometry[], center: THREE.Vector3, radius: number, color: number,
  scale: V3 = [1, 1, 1], rotation: THREE.Quaternion | null = null, segments: readonly [number, number] = [8, 6]): void {
  const geometry = new THREE.SphereGeometry(radius, segments[0], segments[1]);
  _m.compose(center, rotation || _q2.identity(), _s.set(scale[0], scale[1], scale[2]));
  parts.push(finish(geometry, color, _m));
}

function block(parts: THREE.BufferGeometry[], center: THREE.Vector3, size: V3, rotation: THREE.Quaternion,
  color: number): void {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  _m.compose(center, rotation, _s.set(1, 1, 1));
  parts.push(finish(geometry, color, _m));
}

/** A closed loft through elliptical rings ([y, halfWidth, halfDepth, zOffset]) in a local frame. */
function loft(parts: THREE.BufferGeometry[], rings: readonly (readonly [number, number, number, number])[],
  frame: THREE.Matrix4, color: number, radial = 10, capBottom = true, capTop = true): void {
  const positions: number[] = [];
  const index: number[] = [];
  for (const [y, hw, hd, zo] of rings) {
    for (let j = 0; j < radial; j++) {
      const t = (j / radial) * Math.PI * 2;
      positions.push(Math.sin(t) * hw, y, Math.cos(t) * hd + zo);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial;
      const c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
      index.push(a, c, b, b, c, d);
    }
  }
  const capCenter = (ringIndex: number, flip: boolean): void => {
    const [y, , , zo] = rings[ringIndex];
    const centre = positions.length / 3;
    positions.push(0, y, zo);
    for (let j = 0; j < radial; j++) {
      const a = ringIndex * radial + j, b = ringIndex * radial + (j + 1) % radial;
      if (flip) index.push(centre, a, b); else index.push(centre, b, a);
    }
  };
  if (capBottom) capCenter(0, true);
  if (capTop) capCenter(rings.length - 1, false);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  parts.push(finish(geometry, color, frame));
}

/** Two-bone IK: the middle joint for a root-to-end chain bending toward `pole`. */
function solveTwoBone(root: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number,
  pole: THREE.Vector3): { mid: THREE.Vector3; end: THREE.Vector3 } {
  const toTarget = new THREE.Vector3().subVectors(target, root);
  const reach = upper + lower;
  const distance = THREE.MathUtils.clamp(toTarget.length(), Math.abs(upper - lower) + 1e-3, reach - 1e-4);
  const dir = toTarget.lengthSq() > 1e-10 ? toTarget.normalize() : new THREE.Vector3(0, -1, 0);
  const cosA = THREE.MathUtils.clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const bend = new THREE.Vector3().subVectors(pole, root);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bend.normalize();
  const mid = root.clone().addScaledVector(dir, upper * cosA).addScaledVector(bend, upper * sinA);
  const end = root.clone().addScaledVector(dir, distance);
  return { mid, end };
}

/**
 * Build one posed crew figure in its own frame (feet on y = 0, facing +Z).
 * The grip and ankle targets are honoured exactly while they stay inside the limb's reach; the skeleton reports
 * the residual so a receipt can prove hands meet their tools and soles meet their floor.
 */
export function buildCrewFigure(dress: CrewDress, pose: CrewPose): CrewFigureBuild {
  const scale = (pose.height ?? STATURE_M) / STATURE_M;
  const parts: THREE.BufferGeometry[] = [];
  const pelvis = vec(pose.pelvis);
  const [hipYaw, hipPitch, hipRoll] = pose.hips ?? [0, 0, 0];
  const [bend, twist, side] = pose.spine ?? [0, 0, 0];
  const hipQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(hipPitch, hipYaw, hipRoll, 'YXZ'));
  const spineQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(bend, twist, side, 'YXZ'));
  const chestQ = hipQ.clone().multiply(spineQ);
  const build = dress.build ?? 1;
  const girth = 0.5 + build * 0.5;
  const sc = new THREE.Vector3(scale, scale, scale);
  const torsoScale = new THREE.Vector3(scale * build, scale, scale * (0.5 + build * 0.5));
  const hipFrame = new THREE.Matrix4().compose(pelvis, hipQ, sc);
  const hipLoftFrame = new THREE.Matrix4().compose(pelvis, hipQ, torsoScale);
  const waist = pelvis.clone().add(new THREE.Vector3(0, WAIST_PIVOT_Y * scale, 0).applyQuaternion(hipQ));
  const chestFrame = new THREE.Matrix4().compose(waist, chestQ, sc)
    .multiply(new THREE.Matrix4().makeTranslation(0, -WAIST_PIVOT_Y, 0));
  const chestLoftFrame = new THREE.Matrix4().compose(waist, chestQ, torsoScale)
    .multiply(new THREE.Matrix4().makeTranslation(0, -WAIST_PIVOT_Y, 0));
  const inChest = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(chestFrame);
  const inHips = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(hipFrame);

  // torso: pelvis loft (hips frame) and chest loft (bent at the waist), belt band over the seam
  loft(parts, PELVIS_RINGS, hipLoftFrame, dress.coverall, 10, true, false);
  loft(parts, CHEST_RINGS, chestLoftFrame, dress.coverall, 10, false, true);
  const beltQ = hipQ.clone();
  const belt = new THREE.CylinderGeometry(1, 1, 0.05, 12, 1, true);
  _m.compose(inHips(0, WAIST_PIVOT_Y, 0.006), beltQ, _s.set(0.166 * scale * build, scale, 0.116 * scale * girth));
  parts.push(finish(belt, dress.trim, _m));
  // chest pocket flaps, the zip placket and a turned collar give the coverall its readable front
  for (const x of [-0.088, 0.088]) {
    block(parts, inChest(x, 0.405, 0.148), [0.08 * scale, 0.026 * scale, 0.012 * scale], chestQ, dress.trim);
  }
  block(parts, inChest(0, 0.3, 0.14), [0.022 * scale, 0.36 * scale, 0.01 * scale], chestQ, dress.trim);
  const collar = new THREE.CylinderGeometry(0.075, 0.09, 0.04, 10, 1, true);
  _m.compose(inChest(0, 0.53, 0.0), chestQ, _s.set(scale, scale, scale * 0.85));
  parts.push(finish(collar, dress.trim, _m));
  // a tool pouch on the right hip
  block(parts, inHips(-0.168, 0.04, 0.035), [0.045 * scale, 0.1 * scale, 0.09 * scale], hipQ, dress.trim);

  // neck and head
  const neckBase = inChest(0, NECK_BASE_Y, 0.0);
  const [headPitch, headYaw] = pose.head ?? [0, 0];
  const headQ = chestQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(headPitch, headYaw, 0, 'YXZ')));
  const neckTop = neckBase.clone().add(new THREE.Vector3(0, 0.075 * scale, 0.01 * scale).applyQuaternion(headQ));
  limb(parts, neckBase, neckTop, 0.05 * scale, 0.047 * scale, dress.skin, 7);
  const headCenter = neckTop.clone().add(new THREE.Vector3(0, 0.095 * scale, 0.012 * scale).applyQuaternion(headQ));
  const inHead = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(x * scale, y * scale, z * scale).applyQuaternion(headQ).add(headCenter);
  ball(parts, headCenter, 0.098 * scale, dress.skin, [0.84, 1.06, 0.98], headQ, [9, 7]);
  // jaw, nose and ears keep the head from reading as a ball
  ball(parts, inHead(0, -0.05, 0.03), 0.054 * scale, dress.skin, [1.0, 0.78, 1.0], headQ, [8, 5]);
  block(parts, inHead(0, -0.012, 0.094), [0.022 * scale, 0.04 * scale, 0.026 * scale], headQ, dress.skin);
  for (const x of [-0.083, 0.083]) ball(parts, inHead(x, 0, -0.005), 0.024 * scale, dress.skin, [0.5, 1, 0.8], headQ, [6, 4]);
  // the brow shadow over the eyes and the eyebrows above it
  block(parts, inHead(0, 0.004, 0.086), [0.112 * scale, 0.016 * scale, 0.014 * scale], headQ, shade(dress.skin, 0.74));
  for (const x of [-0.032, 0.032]) {
    block(parts, inHead(x, 0.03, 0.09), [0.042 * scale, 0.009 * scale, 0.012 * scale], headQ, dress.hair);
  }
  headgear(parts, dress, inHead, headQ, scale);

  // legs (two-bone IK from the hip joints to the ankles; knees bend forward by default)
  const ankles = { left: vec(pose.leftFoot), right: vec(pose.rightFoot) };
  const legs: Record<'left' | 'right', { knee: THREE.Vector3; ankle: THREE.Vector3 }> = {
    left: { knee: new THREE.Vector3(), ankle: new THREE.Vector3() },
    right: { knee: new THREE.Vector3(), ankle: new THREE.Vector3() },
  };
  let soleY = Infinity;
  for (const sideName of ['left', 'right'] as const) {
    const sign = sideName === 'left' ? 1 : -1;
    const hip = inHips(sign * HIP_HALF_WIDTH, 0, 0);
    const kneeHint = sideName === 'left' ? pose.leftKnee : pose.rightKnee;
    const pole = kneeHint ? vec(kneeHint) : hip.clone().add(new THREE.Vector3(0, -0.2, 0.6).applyQuaternion(hipQ));
    const { mid: knee, end: ankle } = solveTwoBone(hip, ankles[sideName], THIGH_M * scale, SHIN_M * scale, pole);
    legs[sideName] = { knee, ankle };
    limb(parts, hip, knee, 0.088 * scale * girth, 0.066 * scale * girth, dress.coverall, 8);
    ball(parts, knee, 0.064 * scale, dress.coverall, [1, 1, 1], null, [7, 4]);
    // knee patch on the coverall front
    const kneeQ = new THREE.Quaternion().setFromUnitVectors(_up, _c.subVectors(knee, hip).normalize());
    limb(parts, knee, ankle, 0.063 * scale, 0.056 * scale, dress.coverall, 8);
    const hem = ankle.clone().add(new THREE.Vector3(0, 0.06 * scale, 0));
    ball(parts, hem, 0.06 * scale, dress.coverall, [1, 0.55, 1], null, [7, 3]);
    const patch = knee.clone().addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(hipQ), 0.045 * scale);
    block(parts, patch, [0.085 * scale, 0.09 * scale, 0.014 * scale], kneeQ, dress.trim);
    // boot: heel under the ankle, toe forward along the foot heading, pitched for kneeling or tiptoe
    const footYaw = (sideName === 'left' ? pose.leftFootYaw : pose.rightFootYaw) ?? (sign * 0.12);
    const footPitch = (sideName === 'left' ? pose.leftFootPitch : pose.rightFootPitch) ?? 0;
    const footQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(footPitch, hipYaw + footYaw, 0, 'YXZ'));
    const bootCenter = ankle.clone().add(new THREE.Vector3(0, -0.012 * scale, 0.05 * scale).applyQuaternion(footQ));
    block(parts, bootCenter, [0.1 * scale, 0.125 * scale, 0.22 * scale], footQ, dress.boots);
    const sole = ankle.clone().add(new THREE.Vector3(0, -0.064 * scale, 0.058 * scale).applyQuaternion(footQ));
    block(parts, sole, [0.11 * scale, 0.022 * scale, 0.27 * scale], footQ, 0x111111);
    const toe = ankle.clone().add(new THREE.Vector3(0, -0.04 * scale, 0.16 * scale).applyQuaternion(footQ));
    ball(parts, toe, 0.05 * scale, dress.boots, [1, 0.62, 1.05], footQ, [7, 4]);
    for (const corner of [[-0.055, -0.077], [0.055, -0.077], [-0.055, 0.193], [0.055, 0.193]] as const) {
      const p = ankle.clone().add(new THREE.Vector3(corner[0] * scale, -0.075 * scale, corner[1] * scale).applyQuaternion(footQ));
      soleY = Math.min(soleY, p.y);
    }
  }

  // arms (two-bone IK from the shoulders to the wrists; a free arm hangs at the side)
  const arms: Record<'left' | 'right', { elbow: THREE.Vector3; wrist: THREE.Vector3; error: number }> = {
    left: { elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), error: 0 },
    right: { elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), error: 0 },
  };
  for (const sideName of ['left', 'right'] as const) {
    const sign = sideName === 'left' ? 1 : -1;
    const shoulder = inChest(sign * SHOULDER_HALF_WIDTH, SHOULDER_Y, -0.005);
    const grip = sideName === 'left' ? pose.leftHand : pose.rightHand;
    const elbowHint = sideName === 'left' ? pose.leftElbow : pose.rightElbow;
    let wristTarget: THREE.Vector3;
    let palm: THREE.Vector3 | null = null;
    if (grip) {
      palm = vec(grip);
      const approach = new THREE.Vector3().subVectors(palm, shoulder).normalize();
      wristTarget = palm.clone().addScaledVector(approach, -PALM_FROM_WRIST_M * scale);
    } else {
      wristTarget = inChest(sign * 0.215, SHOULDER_Y - 0.53, 0.03);
    }
    const pole = elbowHint ? vec(elbowHint) : inChest(sign * 0.45, SHOULDER_Y - 0.3, -0.35);
    const { mid: elbow, end: wrist } = solveTwoBone(shoulder, wristTarget, UPPER_ARM_M * scale, FOREARM_M * scale, pole);
    ball(parts, shoulder, 0.064 * scale * girth, dress.coverall, [1, 1, 1], chestQ, [7, 5]);
    limb(parts, shoulder, elbow, 0.062 * scale * girth, 0.052 * scale * girth, dress.coverall, 8);
    ball(parts, elbow, 0.052 * scale * girth, dress.coverall, [1, 1, 1], null, [6, 4]);
    if (dress.sleevesRolled) {
      // the sleeve rolled to mid-forearm: a thick cuff of rolled cloth, bare forearm to the wrist
      const roll = elbow.clone().lerp(wrist, 0.42);
      limb(parts, elbow, roll, 0.05 * scale * girth, 0.047 * scale * girth, dress.coverall, 8);
      limb(parts, roll.clone().lerp(elbow, 0.18), roll, 0.056 * scale * girth, 0.056 * scale * girth, dress.trim, 8);
      limb(parts, roll, wrist, 0.04 * scale * girth, 0.034 * scale * girth, dress.skin, 7);
    } else {
      limb(parts, elbow, wrist, 0.05 * scale * girth, 0.042 * scale * girth, dress.coverall, 8);
    }
    // cuff and hand: the hand continues the forearm toward the grip point
    const forearmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();
    const handDir = palm ? new THREE.Vector3().subVectors(palm, wrist).normalize() : forearmDir.clone();
    if (handDir.lengthSq() < 1e-8) handDir.copy(forearmDir);
    if (!dress.sleevesRolled) {
      const cuff = wrist.clone().addScaledVector(forearmDir, -0.025 * scale);
      limb(parts, cuff.clone().addScaledVector(forearmDir, -0.03 * scale), cuff, 0.047 * scale, 0.047 * scale, dress.trim, 8);
    }
    const handQ = new THREE.Quaternion().setFromUnitVectors(_up, handDir);
    const handCenter = wrist.clone().addScaledVector(handDir, 0.06 * scale);
    const handColor = dress.gloves ?? dress.skin;
    ball(parts, handCenter, 0.05 * scale, handColor, [0.95, 1.25, 0.62], handQ, [7, 5]);
    const thumb = handCenter.clone().addScaledVector(new THREE.Vector3(sign * 0.03, 0, 0.02).applyQuaternion(handQ), scale);
    ball(parts, thumb, 0.02 * scale, handColor, [1, 1.7, 1], handQ, [5, 4]);
    const solvedPalm = wrist.clone().addScaledVector(handDir, PALM_FROM_WRIST_M * scale);
    arms[sideName] = { elbow, wrist, error: palm ? solvedPalm.distanceTo(palm) : 0 };
  }

  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('crew figure parts failed to merge');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const triangles = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  return {
    geometry,
    triangles,
    skeleton: {
      hips: tuple(pelvis),
      leftShoulder: tuple(inChest(SHOULDER_HALF_WIDTH, SHOULDER_Y, -0.005)),
      rightShoulder: tuple(inChest(-SHOULDER_HALF_WIDTH, SHOULDER_Y, -0.005)),
      leftElbow: tuple(arms.left.elbow),
      rightElbow: tuple(arms.right.elbow),
      leftWrist: tuple(arms.left.wrist),
      rightWrist: tuple(arms.right.wrist),
      leftKnee: tuple(legs.left.knee),
      rightKnee: tuple(legs.right.knee),
      leftAnkle: tuple(legs.left.ankle),
      rightAnkle: tuple(legs.right.ankle),
      headCenter: tuple(headCenter),
      leftGripErrorM: round3(arms.left.error),
      rightGripErrorM: round3(arms.right.error),
      soleY: round3(soleY),
    },
  };
}

function headgear(parts: THREE.BufferGeometry[], dress: CrewDress,
  inHead: (x: number, y: number, z: number) => THREE.Vector3, headQ: THREE.Quaternion, scale: number): void {
  const hair = (): void => {
    ball(parts, inHead(0, 0.036, -0.026), 0.1 * scale, dress.hair, [0.87, 0.8, 0.93], headQ, [9, 6]);
  };
  switch (dress.headgear) {
    case 'patrol-cap': {
      // a flat-topped field cap with a short brim (the US patrol cap, the Bundeswehr Feldmütze)
      hair();
      const crown = new THREE.CylinderGeometry(0.094, 0.1, 0.075, 10);
      _m.compose(inHead(0, 0.072, -0.004), headQ, _s.set(scale * 0.9, scale, scale));
      parts.push(finish(crown, dress.headColor, _m));
      const tilt = headQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, 0)));
      block(parts, inHead(0, 0.04, 0.105), [0.15 * scale, 0.012 * scale, 0.07 * scale], tilt, dress.headColor);
      break;
    }
    case 'shlemofon': {
      // the padded tank-crew helmet: a dome with three padded ridges and ear cups
      ball(parts, inHead(0, 0.025, -0.006), 0.108 * scale, dress.headColor, [0.9, 0.86, 1.0], headQ, [10, 7]);
      for (const x of [-0.045, 0, 0.045]) {
        ball(parts, inHead(x, 0.088, -0.01), 0.024 * scale, dress.headColor, [1, 0.8, 4.2], headQ, [6, 4]);
      }
      for (const x of [-0.088, 0.088]) {
        ball(parts, inHead(x, -0.012, -0.004), 0.038 * scale, dress.headColor, [0.55, 1.15, 1.0], headQ, [7, 5]);
      }
      break;
    }
    case 'watch-cap': {
      ball(parts, inHead(0, 0.035, -0.008), 0.104 * scale, dress.headColor, [0.88, 0.8, 0.98], headQ, [9, 6]);
      const cuff = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10, 1, true);
      _m.compose(inHead(0, 0.012, -0.006), headQ, _s.set(scale * 0.89, scale, scale * 0.99));
      parts.push(finish(cuff, dress.headColor, _m));
      break;
    }
    case 'welding-hood': {
      // the lowered welding helmet: a dark shell over the face with its headband and filter window
      hair();
      const down = headQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0)));
      block(parts, inHead(0, -0.005, 0.115), [0.2 * scale, 0.25 * scale, 0.05 * scale], down, dress.headColor);
      block(parts, inHead(0, 0.0, 0.142), [0.1 * scale, 0.045 * scale, 0.012 * scale], down, 0x1a2a20);
      for (const x of [-0.095, 0.095]) {
        block(parts, inHead(x, 0.0, 0.07), [0.03 * scale, 0.2 * scale, 0.11 * scale], down, dress.headColor);
      }
      const band = new THREE.TorusGeometry(0.1, 0.012, 4, 14);
      _m.compose(inHead(0, 0.04, 0), headQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))),
        _s.set(scale * 0.88, scale, scale));
      parts.push(finish(band, 0x1c1d1e, _m));
      break;
    }
    case 'ear-defenders': {
      hair();
      for (const x of [-0.098, 0.098]) {
        const cup = new THREE.CylinderGeometry(0.042, 0.042, 0.04, 10);
        _m.compose(inHead(x, -0.002, -0.004), headQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2))),
          _s.set(scale, scale, scale));
        parts.push(finish(cup, dress.headColor, _m));
      }
      const band = new THREE.TorusGeometry(0.103, 0.011, 4, 12, Math.PI);
      _m.compose(inHead(0, 0.0, -0.004), headQ, _s.set(scale, scale * 1.08, scale));
      parts.push(finish(band, 0x232425, _m));
      break;
    }
    case 'bare':
    default:
      hair();
  }
}

// --- national work dress ------------------------------------------------------
// Low-albedo coverall colours keep the hero tank the brightest read in the frame; skin tones vary across a crew.
const SKIN = Object.freeze([0xc79a7c, 0xa8775a, 0x8a5a3e, 0xd8ad8d, 0x6e4430] as const);
const HAIR = Object.freeze([0x2a2018, 0x17130f, 0x3d2c1e, 0x52463a] as const);

type CrewNation = 'ru' | 'us' | 'de' | 'kr';

/** A national mechanic's work dress; `variant` cycles skin, hair and headgear so a crew never reads as clones. */
function shade(hex: number, factor: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((hex & 255) * factor));
  return (r << 16) | (g << 8) | b;
}

export function crewDress(nation: CrewNation, variant: number, headgear?: CrewHeadgear): CrewDress {
  const skin = SKIN[Math.abs(variant) % SKIN.length];
  const hairColor = HAIR[Math.abs(variant * 3 + 1) % HAIR.length];
  const sleevesRolled = headgear !== 'welding-hood' && Math.abs(variant) % 3 === 1;
  const build = 0.95 + (Math.abs(variant * 7) % 5) * 0.03;
  return { ...crewDressBase(nation, variant, skin, hairColor, headgear), sleevesRolled, build };
}

function crewDressBase(nation: CrewNation, variant: number, skin: number, hairColor: number,
  headgear?: CrewHeadgear): CrewDress {
  switch (nation) {
    case 'ru':
      // Russian Army mechanics: dark olive work suits; tank crews in the padded shlemofon
      return {
        coverall: variant % 2 ? 0x3e4433 : 0x353b30, trim: shade(variant % 2 ? 0x3e4433 : 0x353b30, 0.8), skin, hair: hairColor,
        boots: 0x1b1714, gloves: variant % 3 === 0 ? 0x2b2a26 : 0x4a4436,
        headgear: headgear ?? (variant % 2 ? 'shlemofon' : 'watch-cap'), headColor: variant % 2 ? 0x2a2620 : 0x2f3329,
      };
    case 'us':
      // US Army motor-pool mechanics: coyote-brown coveralls, patrol caps
      return {
        coverall: variant % 2 ? 0x6b5c45 : 0x5f523e, trim: shade(variant % 2 ? 0x6b5c45 : 0x5f523e, 0.8), skin, hair: hairColor,
        boots: 0x5a4632, gloves: variant % 3 === 0 ? 0x2a2826 : 0x7a6a50,
        headgear: headgear ?? 'patrol-cap', headColor: 0x5d5543,
      };
    case 'de':
      // Bundeswehr workshop: olive coveralls, field caps
      return {
        coverall: variant % 2 ? 0x4b4f3c : 0x444837, trim: shade(variant % 2 ? 0x4b4f3c : 0x444837, 0.8), skin, hair: hairColor,
        boots: 0x1c1a17, gloves: 0x2d2c28,
        headgear: headgear ?? (variant % 2 ? 'patrol-cap' : 'bare'), headColor: 0x41453a,
      };
    case 'kr':
    default:
      // ROK Army maintainers: olive-drab coveralls, patrol caps
      return {
        coverall: variant % 2 ? 0x474d3a : 0x3f4535, trim: shade(variant % 2 ? 0x474d3a : 0x3f4535, 0.8), skin, hair: hairColor,
        boots: 0x1d1a16, gloves: variant % 3 === 0 ? 0x2b2a27 : 0x5d5848,
        headgear: headgear ?? 'patrol-cap', headColor: 0x3b4134,
      };
  }
}

// --- crews at work ------------------------------------------------------------
// A crew member stands in a scene frame: the exhibit's own floor frame (origin under the exhibit root on the floor,
// +X its right, +Z its bow), so a scene follows its bay owner through every destination placement.

interface CrewMember {
  readonly role: string;
  readonly dress: CrewDress;
  readonly pose: CrewPose;
  /** Figure root (between the feet, on its standing surface) in the scene frame. */
  readonly at: V3;
  /** Figure heading about +Y (0 faces the scene's +Z). */
  readonly yaw: number;
}

type CrewToolKind = 'torch' | 'extinguisher' | 'pendant' | 'sledgehammer' | 'pry-bar' | 'torque-wrench'
  | 'clipboard' | 'flashlight' | 'cassette' | 'crate';

/** A hand tool in a member's figure frame (points: the grips first, then the working end). */
interface CrewTool {
  readonly kind: CrewToolKind;
  readonly member: number;
  readonly points: readonly V3[];
  /** A scene-frame anchor (the pendant cable's hoist block). */
  readonly anchor?: V3;
}

/** A support a crew member stands on (scene frame): a rolling work stand with its deck at `deckY`. */
interface CrewProp {
  readonly kind: 'work-stand';
  readonly at: V3;
  readonly yaw: number;
  readonly deckY: number;
}

/** Where a scene's floor frame sits in its bay's authored space (before the bay owner's own transform). */
interface CrewSceneFrame {
  /**
   * 'workshop': the shared workshop root's authored space; 'leopard-bay': the Leopard mobility bay's own frame;
   * 'verdant-interior': Verdant's half-turned interior (its mezzanine), shown only in Verdant.
   */
  readonly parent: 'workshop' | 'leopard-bay' | 'verdant-interior';
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface CrewScene {
  readonly id: string;
  readonly task: string;
  readonly frame: CrewSceneFrame;
  readonly props?: readonly CrewProp[];
  /** Kept on the mobile tier (the halved crew keeps one essential scene per bay story). */
  readonly essential: boolean;
  readonly members: readonly CrewMember[];
  readonly tools: readonly CrewTool[];
}

/** Map a member's figure-frame point into the scene frame. */
export function crewPointInScene(member: Pick<CrewMember, 'at' | 'yaw'>, point: V3): THREE.Vector3 {
  const c = Math.cos(member.yaw), s = Math.sin(member.yaw);
  return new THREE.Vector3(
    member.at[0] + point[0] * c + point[2] * s,
    member.at[1] + point[1],
    member.at[2] - point[0] * s + point[2] * c,
  );
}

interface CrewSceneBuild {
  readonly geometry: THREE.BufferGeometry;
  readonly skeletons: readonly CrewSkeleton[];
  readonly triangles: number;
}

/** Every member of a scene, posed and merged into one vertex-coloured geometry in the scene frame. */
export function buildCrewSceneGeometry(scene: CrewScene): CrewSceneBuild {
  const geometries: THREE.BufferGeometry[] = [];
  const skeletons: CrewSkeleton[] = [];
  let triangles = 0;
  const matrix = new THREE.Matrix4();
  for (const member of scene.members) {
    const build = buildCrewFigure(member.dress, member.pose);
    matrix.compose(vec(member.at), new THREE.Quaternion().setFromAxisAngle(_up, member.yaw), _s.set(1, 1, 1));
    build.geometry.applyMatrix4(matrix);
    geometries.push(build.geometry);
    skeletons.push(build.skeleton);
    triangles += build.triangles;
  }
  const geometry = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!geometry) throw new Error(`crew scene ${scene.id} failed to merge`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, skeletons, triangles };
}

const D = (n: 'ru' | 'us' | 'de' | 'kr', v: number, h?: CrewHeadgear): CrewDress => crewDress(n, v, h);
const scene = (definition: CrewScene): CrewScene => Object.freeze(definition);
const A = CREW_SOLE_BELOW_ANKLE_M;
const HIP = CREW_STANDING_HIP_M;

/**
 * The five service-bay crews, each in its exhibit's floor frame (see garageDressing.ts for the frames):
 * Burlak gantry (hoist operator, turret fitter, a road-wheel pair), Abrams welding (welder, fire-watch spotter,
 * a mechanic on the creeper under the bow), Leopard mobility teardown (a road-wheel pair, a mechanic under the
 * lifted hull), T-90M component rebuild (Relikt fitters and an inspector), K2 rollover teardown (belly inspection
 * with a lamp, track work with a sledge).
 */
export const GARAGE_CREW_SCENES: Readonly<Record<'burlak' | 'abrams' | 'leopard' | 't90m' | 'k2' | 'mezzanine', CrewScene>> = Object.freeze({
  burlak: scene({
    id: 'burlak', task: 'turret lift under the gantry, road wheels off the dolly', essential: true,
    frame: { parent: 'workshop', x: 17.8, z: -15.5, yaw: -0.55 },
    props: [{ kind: 'work-stand', at: [2.85, 0, -0.45], yaw: 0, deckY: 1.2 }],
    members: [
      { role: 'hoist-operator', dress: D('ru', 1), at: [-2.85, 0, -1.35], yaw: Math.PI / 2,
        pose: { pelvis: [0, HIP, 0], spine: [-0.06, 0.12, 0], head: [-0.42, 0.25],
          leftHand: [0.06, 1.2, 0.3], rightHand: [-0.05, 1.24, 0.31],
          leftFoot: [0.13, A, 0.06], rightFoot: [-0.12, A, -0.07] } },
      { role: 'turret-fitter', dress: D('ru', 2), at: [2.58, 1.2, -0.45], yaw: -Math.PI / 2,
        pose: { pelvis: [0, HIP - 0.04, 0], spine: [0.38, 0, 0], head: [0.1, 0],
          leftHand: [-0.21, 1.05, 0.5], rightHand: [0.19, 1.03, 0.52],
          leftFoot: [0.14, A, 0.08], rightFoot: [-0.14, A, -0.05] } },
      { role: 'road-wheel-carrier', dress: D('ru', 3), at: [-3.6, 0, 4.25], yaw: 0,
        pose: { pelvis: [0, 0.86, -0.04], spine: [0.26, 0, 0], head: [0.3, 0],
          leftHand: [0.17, 0.82, 0.34], rightHand: [-0.17, 0.82, 0.34],
          leftFoot: [0.16, A, 0.06], rightFoot: [-0.16, A, -0.08] } },
      { role: 'road-wheel-carrier', dress: D('ru', 4), at: [-3.6, 0, 5.65], yaw: Math.PI,
        pose: { pelvis: [0, 0.86, -0.04], spine: [0.26, 0, 0], head: [0.2, 0.2],
          leftHand: [0.17, 0.82, 0.34], rightHand: [-0.17, 0.82, 0.34],
          leftFoot: [0.15, A, 0.08], rightFoot: [-0.17, A, -0.06] } },
    ],
    tools: [
      { kind: 'pendant', member: 0, points: [[0, 1.22, 0.33]], anchor: [0, 3.72, 0.4] },
      { kind: 'pry-bar', member: 1, points: [[-0.21, 1.05, 0.5], [0.19, 1.03, 0.52], [-0.08, 1.12, 1.05]] },
    ],
  }),
  abrams: scene({
    id: 'abrams', task: 'welding a skirt hanger with a fire watch, a mechanic under the bow', essential: true,
    frame: { parent: 'workshop', x: 16.9, z: 17.7, yaw: -2.03 },
    members: [
      { role: 'welder', dress: D('us', 1, 'welding-hood'), at: [-2.62, 0, 3.0], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.49, -0.04], spine: [0.36, 0, 0], head: [0.3, 0],
          leftFoot: [0.1, 0.22, -0.4], leftFootPitch: 1.3, leftKnee: [0.1, -0.2, 0.6],
          rightFoot: [-0.15, A, 0.36], rightKnee: [-0.15, 0.9, 0.9],
          rightHand: [-0.05, 0.56, 0.5], leftHand: [0.2, 0.62, 0.52] } },
      { role: 'fire-watch', dress: D('us', 2), at: [-3.55, 0, 2.05], yaw: Math.PI / 2 - 0.55,
        pose: { pelvis: [0, HIP, 0], spine: [0.06, 0.1, 0], head: [0.28, 0.15],
          rightHand: [-0.21, 0.77, 0.08], leftHand: [0.12, 0.98, 0.36],
          leftFoot: [0.13, A, 0.06], rightFoot: [-0.12, A, -0.05] } },
      { role: 'creeper-mechanic', dress: D('us', 3, 'bare'), at: [0.55, 0.115, 3.55], yaw: 0,
        pose: { pelvis: [0, 0.11, 0], hips: [0, -Math.PI / 2, 0], head: [-0.12, 0],
          leftHand: [0.2, 0.36, -0.42], rightHand: [-0.18, 0.37, -0.4],
          leftElbow: [0.6, 0.0, -0.1], rightElbow: [-0.6, 0.0, -0.1],
          leftFoot: [0.16, A - 0.08, -1.05], rightFoot: [-0.18, A - 0.08, -0.92],
          leftKnee: [0.2, 1.0, -0.6], rightKnee: [-0.2, 1.0, -0.5],
          leftFootPitch: -0.25, rightFootPitch: -0.2 } },
    ],
    tools: [
      { kind: 'torch', member: 0, points: [[-0.05, 0.56, 0.5], [0.0, 0.55, 0.74]] },
      { kind: 'extinguisher', member: 1, points: [[-0.21, 0.77, 0.08], [0.12, 0.98, 0.36]] },
      { kind: 'flashlight', member: 2, points: [[0.2, 0.36, -0.42], [0.22, 0.42, -0.6]] },
    ],
  }),
  leopard: scene({
    id: 'leopard', task: 'road wheels off the lifted hull to the rack', essential: false,
    frame: { parent: 'leopard-bay', x: 0, z: 0, yaw: 0 },
    members: [
      { role: 'road-wheel-carrier', dress: D('de', 1), at: [-1.05, 0, 5.05], yaw: -Math.PI / 2,
        pose: { pelvis: [0, 0.86, -0.04], spine: [0.26, 0, 0], head: [0.3, 0],
          leftHand: [0.17, 0.82, 0.34], rightHand: [-0.17, 0.82, 0.34],
          leftFoot: [0.16, A, 0.06], rightFoot: [-0.16, A, -0.08] } },
      { role: 'road-wheel-carrier', dress: D('de', 2), at: [-2.45, 0, 5.05], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.86, -0.04], spine: [0.26, 0, 0], head: [0.2, 0.2],
          leftHand: [0.17, 0.82, 0.34], rightHand: [-0.17, 0.82, 0.34],
          leftFoot: [0.15, A, 0.08], rightFoot: [-0.17, A, -0.06] } },
      { role: 'suspension-mechanic', dress: D('de', 3), at: [-2.55, 0, -0.6], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.49, -0.02], spine: [0.15, 0, 0], head: [-0.35, 0],
          leftFoot: [0.1, 0.22, -0.4], leftFootPitch: 1.3, leftKnee: [0.1, -0.2, 0.6],
          rightFoot: [-0.15, A, 0.36], rightKnee: [-0.15, 0.9, 0.9],
          rightHand: [-0.06, 1.0, 0.58], leftHand: [0.16, 0.95, 0.55] } },
    ],
    tools: [
      { kind: 'torque-wrench', member: 2, points: [[-0.06, 1.0, 0.58], [0.16, 0.95, 0.55], [0.05, 1.02, 0.95]] },
    ],
  }),
  t90m: scene({
    id: 't90m', task: 'Relikt cassettes onto the turret, an inspector at the gun', essential: false,
    frame: { parent: 'workshop', x: -6.6, z: 20.5, yaw: 2.4 },
    members: [
      { role: 'cassette-carrier', dress: D('ru', 5, 'watch-cap'), at: [2.3, 0, -1.85], yaw: -2.2,
        pose: { pelvis: [0, HIP - 0.02, 0], spine: [0.1, 0, 0], head: [0.25, 0],
          leftHand: [0.17, 1.02, 0.3], rightHand: [-0.17, 1.02, 0.3],
          leftFoot: [0.13, A, 0.12], rightFoot: [-0.12, A, -0.12] } },
      { role: 'cassette-fitter', dress: D('ru', 6), at: [-2.35, 0, 0.9], yaw: Math.PI / 2,
        pose: { pelvis: [0, HIP, 0], spine: [0.12, 0, 0], head: [0.1, 0],
          leftHand: [0.16, 1.62, 0.55], rightHand: [-0.18, 1.6, 0.55],
          leftFoot: [0.13, A, 0.1], rightFoot: [-0.12, A, -0.04] } },
      { role: 'inspector', dress: D('ru', 7, 'shlemofon'), at: [1.85, 0, 3.6], yaw: -2.45,
        pose: { pelvis: [0, HIP, 0], spine: [0.08, 0, 0], head: [0.42, 0.1],
          leftHand: [0.06, 1.12, 0.3], rightHand: [-0.06, 1.15, 0.33],
          leftFoot: [0.12, A, 0.0], rightFoot: [-0.12, A, 0.03] } },
    ],
    tools: [
      { kind: 'cassette', member: 0, points: [[0.17, 1.02, 0.3], [-0.17, 1.02, 0.3]] },
      { kind: 'cassette', member: 1, points: [[0.16, 1.62, 0.55], [-0.18, 1.6, 0.55]] },
      { kind: 'clipboard', member: 2, points: [[0.06, 1.12, 0.3], [-0.06, 1.15, 0.33]] },
    ],
  }),
  k2: scene({
    id: 'k2', task: 'belly inspection on the rolled hull, track pins with a sledge', essential: false,
    frame: { parent: 'workshop', x: -16.25, z: -16.85, yaw: 0.35 },
    members: [
      { role: 'belly-inspector', dress: D('kr', 1), at: [2.75, 0, 0.5], yaw: -Math.PI / 2,
        pose: { pelvis: [0, HIP - 0.03, 0], spine: [-0.1, 0, 0], head: [-0.3, 0],
          rightHand: [-0.12, 1.45, 0.42], leftHand: [0.2, 1.3, 0.5],
          leftFoot: [0.13, A, 0.08], rightFoot: [-0.12, A, -0.08] } },
      { role: 'track-striker', dress: D('kr', 2, 'ear-defenders'), at: [-4.55, 0, 1.6], yaw: -Math.PI / 2,
        pose: { pelvis: [0, 0.86, 0], hips: [0.25, 0, 0], spine: [0.08, 0.45, -0.12], head: [0.55, -0.3],
          rightHand: [-0.32, 1.62, -0.12], leftHand: [-0.22, 1.42, -0.02],
          leftFoot: [0.2, A, 0.2], rightFoot: [-0.18, A, -0.15] } },
    ],
    tools: [
      { kind: 'flashlight', member: 0, points: [[-0.12, 1.45, 0.42], [-0.1, 1.62, 0.62]] },
      { kind: 'sledgehammer', member: 1, points: [[-0.32, 1.62, -0.12], [-0.22, 1.42, -0.02], [-0.45, 1.95, -0.45]] },
    ],
  }),
  // Verdant's mezzanine and its inspection overhang (interior frame: deck tops 4.52 and 4.46 m), seen above the hero
  // from the opening camera: a shift lead on the overhang rail watching the welding below, two hands carrying a parts
  // crate along the walkway.
  mezzanine: scene({
    id: 'mezzanine', task: 'a parts crate along the mezzanine, a lead watching the bays from the overhang rail', essential: false,
    frame: { parent: 'verdant-interior', x: 0, z: 0, yaw: 0 },
    members: [
      { role: 'overhang-lead', dress: D('ru', 8, 'patrol-cap'), at: [10.25, 4.46, 13.08], yaw: Math.PI,
        pose: { pelvis: [0, HIP - 0.03, 0.02], spine: [0.4, 0.08, 0], head: [0.5, 0.15],
          leftHand: [0.24, 1.03, 0.5], rightHand: [-0.24, 1.03, 0.52],
          leftFoot: [0.13, A, -0.06], rightFoot: [-0.13, A, -0.1] } },
      { role: 'crate-carrier', dress: D('ru', 9), at: [14.75, 4.52, 18.2], yaw: -Math.PI / 2,
        pose: { pelvis: [0, 0.88, -0.03], spine: [0.22, 0, 0], head: [0.2, 0],
          leftHand: [0.18, 0.85, 0.42], rightHand: [-0.18, 0.85, 0.42],
          leftFoot: [0.15, A, 0.06], rightFoot: [-0.15, A, -0.06] } },
      { role: 'crate-carrier', dress: D('ru', 10), at: [13.25, 4.52, 18.2], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.88, -0.03], spine: [0.22, 0, 0], head: [0.25, 0.1],
          leftHand: [0.18, 0.85, 0.42], rightHand: [-0.18, 0.85, 0.42],
          leftFoot: [0.14, A, 0.07], rightFoot: [-0.16, A, -0.05] } },
    ],
    tools: [
      { kind: 'crate', member: 2, points: [[0.18, 0.85, 0.42], [-0.18, 0.85, 0.42], [0, 0.85, 1.08]] },
    ],
  }),
});

interface CrewToolMaterials {
  readonly steelDark: THREE.Material;
  readonly steelMid: THREE.Material;
  readonly brass: THREE.Material;
  readonly rubber: THREE.Material;
  readonly timber: THREE.Material;
  readonly extRed: THREE.Material;
  readonly safety: THREE.Material;
  readonly lamp: THREE.Material;
  readonly cassette: THREE.Material;
}

function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, radial = 8): THREE.Mesh {
  const length = Math.max(1e-3, a.distanceTo(b));
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radial), material);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, _a.subVectors(b, a).normalize());
  return mesh;
}

function boxAt(center: THREE.Vector3, size: V3, quaternion: THREE.Quaternion, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.copy(center);
  mesh.quaternion.copy(quaternion);
  return mesh;
}

/** The hand tools of a scene as plain meshes in the scene frame, drawn with the workshop's shared materials. */
export function buildCrewTools(scene: CrewScene, materials: CrewToolMaterials): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const tool of scene.tools) {
    const member = scene.members[tool.member];
    const p = tool.points.map((point) => crewPointInScene(member, point));
    const dir = (from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 => new THREE.Vector3().subVectors(to, from).normalize();
    switch (tool.kind) {
      case 'torch': {
        const d = dir(p[0], p[1]);
        meshes.push(rod(p[0].clone().addScaledVector(d, -0.08), p[0].clone().addScaledVector(d, 0.06), 0.019, materials.steelDark));
        meshes.push(rod(p[0].clone().addScaledVector(d, 0.06), p[1].clone().addScaledVector(d, -0.035), 0.011, materials.steelMid));
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.017, 0.05, 8), materials.brass);
        nozzle.position.copy(p[1]).addScaledVector(d, -0.02);
        nozzle.quaternion.setFromUnitVectors(_up, d);
        meshes.push(nozzle);
        break;
      }
      case 'extinguisher': {
        const top = p[0].clone().add(new THREE.Vector3(0, -0.06, 0));
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12), materials.extRed);
        body.position.copy(top).add(new THREE.Vector3(0, -0.25, 0));
        meshes.push(body);
        meshes.push(rod(top.clone().add(new THREE.Vector3(0, -0.05, 0)), top.clone().add(new THREE.Vector3(0, 0.035, 0)), 0.03, materials.steelDark));
        meshes.push(rod(top, p[1], 0.012, materials.rubber, 6));
        const d = dir(top, p[1]);
        meshes.push(rod(p[1], p[1].clone().addScaledVector(d, 0.12), 0.02, materials.rubber));
        break;
      }
      case 'pendant': {
        const anchor = tool.anchor ? vec(tool.anchor) : p[0].clone().add(new THREE.Vector3(0, 2, 0));
        const q = new THREE.Quaternion().setFromUnitVectors(_up, dir(p[0], anchor));
        meshes.push(boxAt(p[0], [0.075, 0.2, 0.065], q, materials.safety));
        meshes.push(rod(p[0].clone().addScaledVector(dir(p[0], anchor), 0.1), anchor, 0.008, materials.rubber, 5));
        break;
      }
      case 'sledgehammer': {
        const d = dir(p[0], p[2]);
        meshes.push(rod(p[0].clone().addScaledVector(d, -0.07), p[2], 0.017, materials.timber));
        const side = new THREE.Vector3().crossVectors(d, _up);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        const head = new THREE.Quaternion().setFromUnitVectors(_up, side.normalize());
        meshes.push(boxAt(p[2], [0.09, 0.22, 0.09], head, materials.steelDark));
        break;
      }
      case 'pry-bar':
      case 'torque-wrench': {
        const d = dir(p[0], p[2]);
        const start = p[0].clone().addScaledVector(d, -0.12);
        meshes.push(rod(start, p[2], tool.kind === 'pry-bar' ? 0.014 : 0.016, tool.kind === 'pry-bar' ? materials.steelMid : materials.steelDark));
        const q = new THREE.Quaternion().setFromUnitVectors(_up, d);
        meshes.push(boxAt(p[2], tool.kind === 'pry-bar' ? [0.03, 0.09, 0.02] : [0.06, 0.07, 0.05], q,
          tool.kind === 'pry-bar' ? materials.steelMid : materials.steelDark));
        break;
      }
      case 'clipboard': {
        const centre = p[0].clone().add(new THREE.Vector3(0, 0.04, 0));
        const toward = dir(p[0], p[1]);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, Math.atan2(toward.x, toward.z) * 0 + member.yaw, 0, 'YXZ'));
        meshes.push(boxAt(centre, [0.23, 0.31, 0.012], q, materials.timber));
        break;
      }
      case 'flashlight': {
        const d = dir(p[0], p[1]);
        meshes.push(rod(p[0].clone().addScaledVector(d, -0.05), p[0].clone().addScaledVector(d, 0.14), 0.021, materials.steelDark));
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10), materials.lamp);
        lens.position.copy(p[0]).addScaledVector(d, 0.15);
        lens.quaternion.setFromUnitVectors(_up, d);
        meshes.push(lens);
        break;
      }
      case 'crate': {
        const grips = p[0].clone().add(p[1]).multiplyScalar(0.5);
        const along = new THREE.Vector3().subVectors(p[2], grips);
        const length = Math.max(0.3, along.length() - 0.02);
        const centre = grips.clone().add(p[2]).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.02, 0));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), along.setY(0).normalize());
        meshes.push(boxAt(centre, [length, 0.4, Math.max(0.3, p[0].distanceTo(p[1]) - 0.04)], q, materials.timber));
        break;
      }
      case 'cassette': {
        const centre = p[0].clone().add(p[1]).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.02, 0));
        const across = dir(p[1], p[0]);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(across.x, 0, across.z).normalize());
        meshes.push(boxAt(centre, [Math.max(0.26, p[0].distanceTo(p[1]) - 0.06), 0.3, 0.42], q, materials.cassette));
        break;
      }
    }
  }
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.crewTool = true;
  }
  return meshes;
}
