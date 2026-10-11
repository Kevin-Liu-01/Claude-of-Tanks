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

import type { GarageVariant } from './garageVariants.ts';
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
  /** What the face carries besides its features: safety glasses, a moustache or a short beard. */
  readonly face?: 'plain' | 'glasses' | 'moustache' | 'beard';
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
  /** Hand shape: a fist round a handle, an open carry under a load, a flat palm on a surface or a relaxed hand.
   * Default: a fist when the hand has a grip point, relaxed when it hangs. */
  readonly leftGrip?: CrewHandShape;
  readonly rightGrip?: CrewHandShape;
  /** The direction each palm faces (toward the object it holds), figure frame. */
  readonly leftPalm?: V3;
  readonly rightPalm?: V3;
}

type CrewHandShape = 'fist' | 'carry' | 'flat' | 'relaxed';

// Finger curl (proximal, distal joint, radians) per hand shape.
const HAND_CURL: Readonly<Record<CrewHandShape, readonly [number, number]>> = Object.freeze({
  fist: [1.22, 1.32],
  carry: [0.42, 0.55],
  flat: [0.08, 0.1],
  relaxed: [0.5, 0.62],
});

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

const _hz = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _hm = new THREE.Matrix4();
const _hq = new THREE.Quaternion();

/** A box segment from `start` along `dir` (unit) for `length`, its width along `across`. */
function segment(parts: THREE.BufferGeometry[], start: THREE.Vector3, dir: THREE.Vector3, across: THREE.Vector3,
  length: number, width: number, depth: number, color: number): THREE.Vector3 {
  _hz.crossVectors(across, dir).normalize();
  _hm.makeBasis(across, dir, _hz);
  _hq.setFromRotationMatrix(_hm);
  const centre = start.clone().addScaledVector(dir, length / 2);
  block(parts, centre, [width, length, depth], _hq, color);
  return start.clone().addScaledVector(dir, length);
}

/**
 * A gloved or bare hand: palm, four two-joint fingers and a thumb, curled by shape round the palm normal `n`
 * (which points from the palm to the object held). `sign` is +1 for the left hand, -1 for the right.
 */
function buildHand(parts: THREE.BufferGeometry[], wrist: THREE.Vector3, handDir: THREE.Vector3, n: THREE.Vector3,
  sign: number, shape: CrewHandShape, color: number, scale: number): void {
  // palm basis: Y along the hand, Z out of the palm, X = Y x Z; the thumb sits at -sign * X
  const y = handDir.clone().normalize();
  const z = n.clone().addScaledVector(y, -n.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const thumbDir = x.clone().multiplyScalar(-sign);
  _hm.makeBasis(x, y, z);
  _hq.setFromRotationMatrix(_hm);
  // Hands read at workshop range (2026-10-10, wave 357: "mitten hands that vanish into the tools"): a working hand
  // drawn 12 % large in a contrasting glove, its fingers parted so each knuckle row breaks the silhouette.
  scale *= 1.12;
  const palmCentre = wrist.clone().addScaledVector(y, 0.04 * scale);
  block(parts, palmCentre, [0.08 * scale, 0.082 * scale, 0.03 * scale], _hq.clone(), color);
  const [curl1, curl2] = HAND_CURL[shape];
  const lengths = [[0.044, 0.034], [0.047, 0.036], [0.043, 0.033], [0.036, 0.028]] as const;
  for (let finger = 0; finger < 4; finger++) {
    const base = palmCentre.clone().addScaledVector(y, 0.041 * scale)
      .addScaledVector(thumbDir, (1.5 - finger) * 0.0235 * scale);
    _hd.copy(y).multiplyScalar(Math.cos(curl1)).addScaledVector(z, Math.sin(curl1)).normalize();
    const knuckle = segment(parts, base, _hd.clone(), x, lengths[finger][0] * scale, 0.0165 * scale, 0.019 * scale, color);
    _hd.copy(y).multiplyScalar(Math.cos(curl1 + curl2)).addScaledVector(z, Math.sin(curl1 + curl2)).normalize();
    segment(parts, knuckle, _hd.clone(), x, lengths[finger][1] * scale, 0.0148 * scale, 0.017 * scale, color);
  }
  // the thumb: out from the heel of the palm toward the index finger, wrapping over a fist
  const thumbBase = palmCentre.clone().addScaledVector(thumbDir, 0.036 * scale).addScaledVector(y, -0.018 * scale);
  const wrap = shape === 'fist' ? 0.85 : shape === 'carry' ? 0.45 : 0.2;
  _hd.copy(y).multiplyScalar(0.75).addScaledVector(thumbDir, 0.55).addScaledVector(z, wrap * 0.6).normalize();
  const thumbKnuckle = segment(parts, thumbBase, _hd.clone(), z, 0.038 * scale, 0.02 * scale, 0.02 * scale, color);
  _hd.copy(y).multiplyScalar(0.6).addScaledVector(thumbDir, 0.1 - wrap * 0.5).addScaledVector(z, wrap).normalize();
  segment(parts, thumbKnuckle, _hd.clone(), z, 0.03 * scale, 0.018 * scale, 0.018 * scale, color);
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
  // nobody stands symmetric: a little weight on one hip and a tilt of the head, seeded by the pose itself
  const lean = Math.sin((pose.pelvis[0] * 13.1 + pose.leftFoot[2] * 7.3 + pose.rightFoot[0] * 5.7) * 9.17) * 0.05;
  const [hipYaw, hipPitch, hipRoll] = pose.hips ?? [0, 0, lean];
  // weight on one leg: the hips drop to the free side and the shoulders answer the other way (contrapposto), unless
  // the pose authors its own side bend
  const [bend, twist, authoredSide] = pose.spine ?? [0, 0, 0];
  const side = authoredSide !== 0 ? authoredSide : -hipRoll * 1.4;
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
  for (const x of [-0.088, 0.088]) {
    block(parts, inChest(x, 0.445, 0.146), [0.086 * scale, 0.022 * scale, 0.008 * scale], chestQ, shade(dress.coverall, 1.45));
  }
  const collar = new THREE.CylinderGeometry(0.075, 0.09, 0.04, 10, 1, true);
  _m.compose(inChest(0, 0.53, 0.0), chestQ, _s.set(scale, scale, scale * 0.85));
  parts.push(finish(collar, dress.trim, _m));
  // a tool pouch on the right hip
  block(parts, inHips(-0.168, 0.04, 0.035), [0.045 * scale, 0.1 * scale, 0.09 * scale], hipQ, dress.trim);

  // neck and head
  const neckBase = inChest(0, NECK_BASE_Y, 0.0);
  const [headPitch, headYaw] = pose.head ?? [0, 0];
  const headQ = chestQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(headPitch, headYaw, -lean * 1.6, 'YXZ')));
  const neckTop = neckBase.clone().add(new THREE.Vector3(0, 0.075 * scale, 0.01 * scale).applyQuaternion(headQ));
  limb(parts, neckBase, neckTop, 0.05 * scale, 0.047 * scale, dress.skin, 7);
  const headCenter = neckTop.clone().add(new THREE.Vector3(0, 0.095 * scale, 0.012 * scale).applyQuaternion(headQ));
  const inHead = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(x * scale, y * scale, z * scale).applyQuaternion(headQ).add(headCenter);
  ball(parts, headCenter, 0.098 * scale, dress.skin, [0.84, 1.06, 0.98], headQ, [9, 7]);
  // jaw, nose and ears keep the head from reading as a ball
  ball(parts, inHead(0, -0.05, 0.03), 0.054 * scale, dress.skin, [1.0, 0.78, 1.0], headQ, [8, 5]);
  for (const x of [-0.083, 0.083]) ball(parts, inHead(x, 0, -0.005), 0.024 * scale, dress.skin, [0.5, 1, 0.8], headQ, [5, 3]);
  // A face that reads at workshop range: a brow ridge, dark eye sockets under it, eyebrows, a nose wedge with its tip,
  // and a mouth line over the chin.
  block(parts, inHead(0, 0.014, 0.09), [0.108 * scale, 0.016 * scale, 0.018 * scale], headQ, dress.skin);
  for (const x of [-0.031, 0.031]) {
    block(parts, inHead(x, -0.006, 0.088), [0.032 * scale, 0.014 * scale, 0.012 * scale], headQ, shade(dress.skin, 0.4));
    block(parts, inHead(x, 0.026, 0.096), [0.038 * scale, 0.009 * scale, 0.01 * scale], headQ, dress.hair);
  }
  const noseQ = headQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.28, 0, 0)));
  block(parts, inHead(0, -0.022, 0.097), [0.02 * scale, 0.042 * scale, 0.026 * scale], noseQ, dress.skin);
  ball(parts, inHead(0, -0.042, 0.106), 0.012 * scale, shade(dress.skin, 0.92), [1.25, 0.8, 1], headQ, [6, 4]);
  block(parts, inHead(0, -0.062, 0.091), [0.034 * scale, 0.006 * scale, 0.008 * scale], headQ, shade(dress.skin, 0.5));
  // cheekbones catch the light under the eyes; glasses, a moustache or a short beard tell the crew apart
  for (const x of [-0.05, 0.05]) {
    ball(parts, inHead(x, -0.024, 0.07), 0.026 * scale, shade(dress.skin, 1.06), [1.1, 0.8, 0.7], headQ, [5, 3]);
  }
  switch (dress.face) {
    case 'glasses':
      block(parts, inHead(0, -0.004, 0.104), [0.112 * scale, 0.026 * scale, 0.008 * scale], headQ, 0x1f2224);
      for (const x of [-0.06, 0.06]) block(parts, inHead(x, 0.0, 0.05), [0.006 * scale, 0.008 * scale, 0.1 * scale], headQ, 0x1f2224);
      break;
    case 'moustache':
      block(parts, inHead(0, -0.052, 0.1), [0.046 * scale, 0.014 * scale, 0.014 * scale], headQ, dress.hair);
      break;
    case 'beard':
      ball(parts, inHead(0, -0.068, 0.048), 0.06 * scale, dress.hair, [1.0, 0.62, 0.92], headQ, [7, 4]);
      block(parts, inHead(0, -0.052, 0.1), [0.044 * scale, 0.012 * scale, 0.012 * scale], headQ, dress.hair);
      break;
    default:
      break;
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
    ball(parts, knee, 0.064 * scale, dress.coverall, [1, 1, 1], null, [6, 3]);
    // knee patch on the coverall front
    const kneeQ = new THREE.Quaternion().setFromUnitVectors(_up, _c.subVectors(knee, hip).normalize());
    limb(parts, knee, ankle, 0.063 * scale, 0.056 * scale, dress.coverall, 8);
    const hem = ankle.clone().add(new THREE.Vector3(0, 0.06 * scale, 0));
    ball(parts, hem, 0.06 * scale, dress.coverall, [1, 0.55, 1], null, [6, 3]);
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
    ball(parts, toe, 0.05 * scale, dress.boots, [1, 0.62, 1.05], footQ, [6, 3]);
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
  const chestRight = new THREE.Vector3(1, 0, 0).applyQuaternion(chestQ);
  for (const sideName of ['left', 'right'] as const) {
    const sign = sideName === 'left' ? 1 : -1;
    const grip = sideName === 'left' ? pose.leftHand : pose.rightHand;
    const otherGrip = sideName === 'left' ? pose.rightHand : pose.leftHand;
    // the shoulder girdle follows a long reach: up to 4 cm toward the grip (a shrug overhead, protraction forward)
    const shoulder = inChest(sign * SHOULDER_HALF_WIDTH, SHOULDER_Y, -0.005);
    if (grip) {
      const reach = new THREE.Vector3(grip[0], grip[1], grip[2]).sub(shoulder);
      const extend = THREE.MathUtils.clamp((reach.length() - 0.34 * scale) / (0.28 * scale), 0, 1);
      shoulder.addScaledVector(reach.normalize(), 0.04 * scale * extend);
    }
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
    ball(parts, shoulder, 0.064 * scale * girth, dress.coverall, [1, 1, 1], chestQ, [6, 4]);
    limb(parts, shoulder, elbow, 0.062 * scale * girth, 0.052 * scale * girth, dress.coverall, 8);
    // the sleeve fills over the biceps and the forearm swells below the elbow: arms, not tubes
    const upperDir = new THREE.Vector3().subVectors(elbow, shoulder).normalize();
    const armQ = new THREE.Quaternion().setFromUnitVectors(_up, upperDir);
    ball(parts, shoulder.clone().lerp(elbow, 0.42), 0.06 * scale * girth, dress.coverall, [1, 1.9, 0.95], armQ, [6, 4]);
    ball(parts, elbow, 0.052 * scale * girth, dress.coverall, [1, 1, 1], null, [5, 3]);
    if (dress.sleevesRolled) {
      // the sleeve rolled to mid-forearm: a thick cuff of rolled cloth, bare forearm to the wrist
      const roll = elbow.clone().lerp(wrist, 0.42);
      limb(parts, elbow, roll, 0.05 * scale * girth, 0.047 * scale * girth, dress.coverall, 8);
      limb(parts, roll.clone().lerp(elbow, 0.18), roll, 0.056 * scale * girth, 0.056 * scale * girth, dress.trim, 8);
      limb(parts, roll, wrist, 0.04 * scale * girth, 0.034 * scale * girth, dress.skin, 7);
    } else {
      limb(parts, elbow, wrist, 0.05 * scale * girth, 0.042 * scale * girth, dress.coverall, 8);
    }
    {
      const foreDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();
      const foreQ = new THREE.Quaternion().setFromUnitVectors(_up, foreDir);
      ball(parts, elbow.clone().lerp(wrist, 0.3), 0.05 * scale * girth, dress.sleevesRolled ? dress.skin : dress.coverall,
        [1.05, 1.8, 0.92], foreQ, [6, 4]);
    }
    // cuff and hand: the hand continues the forearm toward the grip point
    const forearmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();
    const handDir = palm ? new THREE.Vector3().subVectors(palm, wrist).normalize() : forearmDir.clone();
    if (handDir.lengthSq() < 1e-8) handDir.copy(forearmDir);
    if (!dress.sleevesRolled) {
      const cuff = wrist.clone().addScaledVector(forearmDir, -0.025 * scale);
      limb(parts, cuff.clone().addScaledVector(forearmDir, -0.03 * scale), cuff, 0.047 * scale, 0.047 * scale, dress.trim, 8);
    }
    const handColor = dress.gloves ?? dress.skin;
    // the palm faces what it holds: an authored direction, the other hand on a shared load, otherwise inward
    const palmHint = sideName === 'left' ? pose.leftPalm : pose.rightPalm;
    let palmNormal: THREE.Vector3;
    if (palmHint) palmNormal = vec(palmHint).normalize();
    else if (grip && otherGrip && Math.hypot(grip[0] - otherGrip[0], grip[1] - otherGrip[1], grip[2] - otherGrip[2]) < 0.7) {
      palmNormal = vec(otherGrip).sub(vec(grip)).normalize();
    } else {
      palmNormal = chestRight.clone().multiplyScalar(-sign);
      if (grip) palmNormal.add(new THREE.Vector3(0, -0.4, 0)).normalize();
    }
    if (Math.abs(palmNormal.dot(handDir)) > 0.97) palmNormal = chestRight.clone().multiplyScalar(-sign);
    const shape = (sideName === 'left' ? pose.leftGrip : pose.rightGrip) ?? (grip ? 'fist' : 'relaxed');
    buildHand(parts, wrist, handDir, palmNormal, sign, shape, handColor, scale);
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
      ball(parts, inHead(0, 0.025, -0.006), 0.108 * scale, dress.headColor, [0.9, 0.86, 1.0], headQ, [9, 6]);
      for (const x of [-0.045, 0, 0.045]) {
        ball(parts, inHead(x, 0.088, -0.01), 0.024 * scale, dress.headColor, [1, 0.8, 4.2], headQ, [5, 3]);
      }
      for (const x of [-0.088, 0.088]) {
        ball(parts, inHead(x, -0.012, -0.004), 0.038 * scale, dress.headColor, [0.55, 1.15, 1.0], headQ, [6, 4]);
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

// Work gloves that read against olive cloth and dark steel: tan and brown leather, grey knit with dipped palms,
// yellow rigger gloves, and a black nitrile pair now and then; welders wear brown leather gauntlets.
const GLOVES = Object.freeze([0xb38a5c, 0x9d998d, 0xb89746, 0x8d6b47, 0xa9a59a, 0x3a3836] as const);

export function crewDress(nation: CrewNation, variant: number, headgear?: CrewHeadgear): CrewDress {
  const skin = SKIN[Math.abs(variant) % SKIN.length];
  const hairColor = HAIR[Math.abs(variant * 3 + 1) % HAIR.length];
  const sleevesRolled = headgear !== 'welding-hood' && Math.abs(variant) % 3 === 1;
  const build = 0.95 + (Math.abs(variant * 7) % 5) * 0.03;
  const gloves = headgear === 'welding-hood' ? 0x6e4f32 : GLOVES[Math.abs(variant * 5 + 2) % GLOVES.length];
  const faceIndex = Math.abs(variant * 3 + (nation === 'ru' ? 1 : nation === 'us' ? 2 : nation === 'de' ? 3 : 4)) % 6;
  const face = headgear === 'welding-hood' ? 'plain' as const
    : (['plain', 'glasses', 'moustache', 'plain', 'beard', 'glasses'] as const)[faceIndex];
  return { ...crewDressBase(nation, variant, skin, hairColor, headgear), sleevesRolled, build, gloves, face };
}

function crewDressBase(nation: CrewNation, variant: number, skin: number, hairColor: number,
  headgear?: CrewHeadgear): CrewDress {
  switch (nation) {
    case 'ru':
      // Russian Army mechanics: dark olive work suits; tank crews in the padded shlemofon
      return {
        coverall: variant % 2 ? 0x4a513d : 0x414839, trim: shade(variant % 2 ? 0x4a513d : 0x414839, 0.8), skin, hair: hairColor,
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
        coverall: variant % 2 ? 0x565b45 : 0x4e533f, trim: shade(variant % 2 ? 0x565b45 : 0x4e533f, 0.8), skin, hair: hairColor,
        boots: 0x1c1a17, gloves: 0x2d2c28,
        headgear: headgear ?? (variant % 2 ? 'patrol-cap' : 'bare'), headColor: 0x41453a,
      };
    case 'kr':
    default:
      // ROK Army maintainers: olive-drab coveralls, patrol caps
      return {
        coverall: variant % 2 ? 0x535a43 : 0x4a503d, trim: shade(variant % 2 ? 0x535a43 : 0x4a503d, 0.8), skin, hair: hairColor,
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
  | 'clipboard' | 'flashlight' | 'cassette' | 'crate' | 'breaker-bar' | 'impact-wrench' | 'punch' | 'hammer'
  | 'track-section';

/** A hand tool in a member's figure frame (points: the grips first, then the working end). */
interface CrewTool {
  readonly kind: CrewToolKind;
  readonly member: number;
  readonly points: readonly V3[];
  /** A scene-frame anchor (the pendant cable's hoist block). */
  readonly anchor?: V3;
}

/**
 * A scene prop (scene frame): a rolling work stand a member stands on (deck at `deckY`), or a welding curtain that
 * screens hot work from the rest of the bay.
 */
interface CrewProp {
  readonly kind: 'work-stand' | 'weld-curtain' | 'power-pack';
  readonly at: V3;
  readonly yaw: number;
  readonly deckY: number;
}

/** A road wheel the crew is moving (scene frame): its centre and axle, built from the exhibit's own wheel. */
interface CrewWheel {
  readonly at: V3;
  readonly axle: V3;
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
  readonly wheels?: readonly CrewWheel[];
  /** Hot work in this scene: the torch tip (scene frame), where the weld glow, its light and the cable meet. */
  readonly weldTip?: V3;
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
  /** Per vertex: what the colour dresses (0 skin, boots, gloves and kit; 1 coverall; 2 trim; 3 pocket flap; 4 headgear). */
  readonly roles: Uint8Array;
  /** Per vertex: the member it belongs to. */
  readonly memberOf: Uint8Array;
}

/** Every member of a scene, posed and merged into one vertex-coloured geometry in the scene frame. */
export function buildCrewSceneGeometry(scene: CrewScene): CrewSceneBuild {
  const geometries: THREE.BufferGeometry[] = [];
  const skeletons: CrewSkeleton[] = [];
  let triangles = 0;
  const matrix = new THREE.Matrix4();
  const roleParts: Uint8Array[] = [];
  const memberParts: Uint8Array[] = [];
  const probe = new THREE.Color();
  scene.members.forEach((member, memberIndex) => {
    const build = buildCrewFigure(member.dress, member.pose);
    matrix.compose(vec(member.at), new THREE.Quaternion().setFromAxisAngle(_up, member.yaw), _s.set(1, 1, 1));
    build.geometry.applyMatrix4(matrix);
    // tag each vertex with the dress colour it carries, so a Garage can repaint the crew's cloth without a rebuild
    const dressColours: Array<[number, number]> = [
      [1, member.dress.coverall], [2, member.dress.trim], [3, shade(member.dress.coverall, 1.45)], [4, member.dress.headColor],
    ];
    const keys = dressColours.map(([role, hex]) => { probe.setHex(hex); return [role, probe.r, probe.g, probe.b] as const; });
    const colours = build.geometry.getAttribute('color');
    const roles = new Uint8Array(colours.count);
    for (let v = 0; v < colours.count; v++) {
      const r = colours.getX(v), g = colours.getY(v), b = colours.getZ(v);
      for (const [role, kr, kg, kb] of keys) {
        if (Math.abs(r - kr) < 1e-4 && Math.abs(g - kg) < 1e-4 && Math.abs(b - kb) < 1e-4) { roles[v] = role; break; }
      }
    }
    roleParts.push(roles);
    memberParts.push(new Uint8Array(colours.count).fill(memberIndex));
    geometries.push(build.geometry);
    skeletons.push(build.skeleton);
    triangles += build.triangles;
  });
  const geometry = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!geometry) throw new Error(`crew scene ${scene.id} failed to merge`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const vertexCount = geometry.getAttribute('position').count;
  const roles = new Uint8Array(vertexCount);
  const memberOf = new Uint8Array(vertexCount);
  let offset = 0;
  roleParts.forEach((part, index) => { roles.set(part, offset); memberOf.set(memberParts[index], offset); offset += part.length; });
  return { geometry, skeletons, triangles, roles, memberOf };
}

/**
 * Each Garage dresses its crews for its region (2026-10-10, the coordinator: "its own crew dress"): the coverall colours
 * the members cycle through and their headgear colour. Verdant keeps the national work dress authored per member.
 */
export const CREW_REGION_DRESS: Readonly<Record<GarageVariant['architecture'], { readonly coverall: readonly number[];
  readonly head: number } | null>> = Object.freeze({
  field_shed: null,
  shade_depot: { coverall: [0x9a8360, 0x8c7554, 0xa08a66], head: 0x8a7a5a }, // desert tan, sun caps
  repair_bunker: { coverall: [0xb4b8b3, 0xa5aaa5, 0x8f9590], head: 0x3b3631 }, // winter smocks, fur hats
  brick_arsenal: { coverall: [0x2f3a4c, 0x37424f, 0x2a3442], head: 0x262d38 }, // navy arsenal overalls
  naval_drydock: { coverall: [0xb0632a, 0xa35a26, 0x965226], head: 0xd6d6ce }, // dock orange, white hard hats
  rail_roundhouse: { coverall: [0x34506e, 0x3d5875, 0x2f4864], head: 0x343434 }, // railway blue
  rain_canopy: { coverall: [0x3c4a35, 0x45523b, 0x36432f], head: 0x2c3729 }, // rain ponchos
  rock_cavern: { coverall: [0x8e3328, 0x9a5a22, 0x7d2e26], head: 0xd5d0c6 }, // alpine shells, helmets
  recovery_yard: { coverall: [0x8a7b5a, 0x7d6e50, 0x948463], head: 0x6c6046 }, // khaki recovery crews
  factory_line: { coverall: [0x4a4d50, 0x55585b, 0x404346], head: 0xc49c34 }, // mill greys, yellow hard hats
});

/**
 * Repaint a built crew's cloth for a region (or restore its authored dress when `region` is null): `base` is the
 * colour array as built, `out` the live colour array. Skin, boots, gloves and kit keep their colours.
 */
export function paintCrewRegion(base: Float32Array, roles: Uint8Array, memberOf: Uint8Array,
  region: { readonly coverall: readonly number[]; readonly head: number } | null, out: Float32Array): void {
  if (!region) { out.set(base); return; }
  const cloth = region.coverall.map((hex) => new THREE.Color().setHex(hex));
  const head = new THREE.Color().setHex(region.head);
  for (let v = 0; v < roles.length; v++) {
    const role = roles[v];
    const at = v * 3;
    if (role === 0) { out[at] = base[at]; out[at + 1] = base[at + 1]; out[at + 2] = base[at + 2]; continue; }
    const c = role === 4 ? head : cloth[memberOf[v] % cloth.length];
    const k = role === 2 ? 0.8 : role === 3 ? 1.45 : 1;
    out[at] = Math.min(1, c.r * k); out[at + 1] = Math.min(1, c.g * k); out[at + 2] = Math.min(1, c.b * k);
  }
}

const D = (n: 'ru' | 'us' | 'de' | 'kr', v: number, h?: CrewHeadgear): CrewDress => crewDress(n, v, h);
const scene = (definition: CrewScene): CrewScene => Object.freeze(definition);
const A = CREW_SOLE_BELOW_ANKLE_M;
const HIP = CREW_STANDING_HIP_M;

/**
 * One of a pair carrying a road wheel upright between them (2026-10-10, wave 357: a wheel carried flat read as "a
 * hollow hoop", "a grey tub", "a giant hockey puck"). The pair stand 1.36 m apart facing each other; each hooks both
 * gloved hands over the tyre's shoulders on his side, a little below the axle, so the wheel's face, disc and hub show
 * side-on. Knees give and the back stays straight under the weight; `stagger` sets which foot leads.
 */
export const WHEEL_CARRY = Object.freeze({ separationM: 1.36, gripReachM: 0.335, gripHeightM: 0.74, gripHalfSpanM: 0.118 });
function wheelCarrierPose(stagger: 1 | -1): CrewPose {
  const { gripReachM: reach, gripHeightM: y, gripHalfSpanM: span } = WHEEL_CARRY;
  return {
    pelvis: [0, 0.79, -0.06], spine: [0.17, 0.04 * stagger, 0], head: [0.2, 0.04 * stagger],
    leftHand: [span, y, reach], rightHand: [-span, y, reach], leftGrip: 'carry', rightGrip: 'carry',
    leftPalm: [-0.75, 0.3, 0.6], rightPalm: [0.75, 0.3, 0.6],
    leftFoot: stagger > 0 ? [0.13, A, 0.06] : [0.12, A, -0.14],
    rightFoot: stagger > 0 ? [-0.13, A, -0.15] : [-0.13, A, 0.07],
    // knees track forward over the toes, not out: a lift, not a squat
    leftKnee: [0.1, 0.45, 0.9], rightKnee: [-0.1, 0.45, 0.9],
  };
}


/**
 * The five service-bay crews, each in its exhibit's floor frame (see garageDressing.ts for the frames):
 * Burlak gantry (hoist operator, turret fitter, a road-wheel pair), Abrams welding (welder, fire-watch spotter,
 * a mechanic on the creeper under the bow), Leopard mobility teardown (a road-wheel pair, a mechanic under the
 * lifted hull), T-90M component rebuild (Relikt fitters and an inspector), K2 rollover teardown (belly inspection
 * with a lamp, track work with a sledge).
 */
export const GARAGE_CREW_SCENES: Readonly<Record<'burlak' | 'abrams' | 'leopard' | 't90m' | 'k2' | 'mezzanine' | 'yard', CrewScene>> = Object.freeze({
  // the T-90A on jack stands, its turret on the gantry hook: the hoist operator watches the lift with the pendant, a
  // fitter on a rolling stand guides the turret ring, two men carry a road wheel flat between them to the dolly
  burlak: scene({
    id: 'burlak', task: 'turret lift under the gantry, road wheels off the dolly', essential: true,
    frame: { parent: 'workshop', x: 17.8, z: -15.5, yaw: -0.55 },
    props: [{ kind: 'work-stand', at: [2.85, 0, -0.45], yaw: 0, deckY: 1.2 }],
    members: [
      { role: 'hoist-operator', dress: D('ru', 1), at: [-2.85, 0, -1.35], yaw: Math.PI / 2,
        pose: { pelvis: [0, HIP, 0.01], spine: [-0.08, 0.14, 0.02], head: [-0.46, 0.22],
          leftHand: [0.04, 1.2, 0.31], rightHand: [-0.05, 1.27, 0.3], leftPalm: [-1, 0, 0.3], rightPalm: [1, 0, 0.3],
          leftFoot: [0.13, A, 0.06], rightFoot: [-0.12, A, -0.09], rightFootYaw: -0.3 } },
      { role: 'turret-fitter', dress: D('ru', 2), at: [2.58, 1.2, -0.45], yaw: -Math.PI / 2,
        pose: { pelvis: [0, HIP - 0.06, -0.02], spine: [0.42, -0.1, 0.04], head: [0.18, -0.1],
          leftHand: [-0.21, 1.05, 0.5], rightHand: [0.19, 1.03, 0.52],
          leftFoot: [0.15, A, 0.1], rightFoot: [-0.14, A, -0.12] } },
      { role: 'road-wheel-carrier', dress: D('ru', 3), at: [-3.6, 0, 4.1], yaw: 0, pose: wheelCarrierPose(1) },
      { role: 'road-wheel-carrier', dress: D('ru', 4), at: [-3.6, 0, 5.46], yaw: Math.PI, pose: wheelCarrierPose(-1) },
    ],
    tools: [
      { kind: 'pendant', member: 0, points: [[0, 1.235, 0.305]], anchor: [0, 3.72, 0.4] },
      { kind: 'pry-bar', member: 1, points: [[-0.21, 1.05, 0.5], [0.19, 1.03, 0.52], [-0.08, 1.12, 1.05]] },
    ],
  }),
  // the Abrams by the FLAMMABLE canisters (the owner's placement) gets cold work only: a track tensioner on the front
  // idler adjuster, a road-wheel change at the stripped right side, a man rolling the next wheel in, a mechanic on the
  // creeper under the bow
  abrams: scene({
    id: 'abrams', task: 'track tensioning and a road-wheel change, a mechanic under the bow', essential: true,
    frame: { parent: 'workshop', x: 16.9, z: 17.7, yaw: -2.03 },
    wheels: [{ at: [-0.45, 0.31, 4.35], axle: [0, 0, 1] }],
    members: [
      { role: 'track-tensioner', dress: D('us', 1), at: [-2.45, 0, 2.95], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.84, -0.06], spine: [0.34, 0.06, 0], head: [0.32, 0.04],
          leftHand: [0.02, 0.98, 0.34], rightHand: [-0.06, 1.05, 0.27],
          leftFoot: [0.16, A, 0.14], rightFoot: [-0.16, A + 0.048, -0.26], rightFootPitch: 0.25 } },
      { role: 'wheel-changer', dress: D('us', 2), at: [-2.48, 0, 0.55], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.49, -0.04], spine: [0.3, 0.05, 0], head: [0.28, 0],
          leftFoot: [0.1, 0.22, -0.4], leftFootPitch: 1.3, leftKnee: [0.1, -0.2, 0.6],
          rightFoot: [-0.15, A, 0.36], rightKnee: [-0.15, 0.9, 0.9],
          rightHand: [-0.04, 0.43, 0.42], leftHand: [0.09, 0.5, 0.5], leftGrip: 'flat', leftPalm: [0, -1, 0] } },
      { role: 'wheel-roller', dress: D('us', 4), at: [0.0, 0, 4.35], yaw: -Math.PI / 2,
        pose: { pelvis: [0, 0.74, -0.14], spine: [0.7, 0.04, 0], head: [-0.1, 0],
          leftHand: [0.1, 0.58, 0.36], rightHand: [-0.1, 0.58, 0.36], leftGrip: 'flat', rightGrip: 'flat',
          leftPalm: [0, -0.95, 0.32], rightPalm: [0, -0.95, 0.32],
          leftFoot: [0.14, A, 0.1], rightFoot: [-0.14, A + 0.066, -0.42], rightFootPitch: 0.35 } },
      { role: 'creeper-mechanic', dress: D('us', 3, 'bare'), at: [0.55, 0.115, 3.55], yaw: 0,
        pose: { pelvis: [0, 0.11, 0], hips: [0, -Math.PI / 2, 0], head: [-0.12, 0],
          leftHand: [0.2, 0.36, -0.42], rightHand: [-0.18, 0.37, -0.4],
          leftElbow: [0.6, 0.0, -0.1], rightElbow: [-0.6, 0.0, -0.1],
          leftFoot: [0.16, A - 0.08, -1.05], rightFoot: [-0.18, A - 0.08, -0.92],
          leftKnee: [0.2, 1.0, -0.6], rightKnee: [-0.2, 1.0, -0.5],
          leftFootPitch: -0.25, rightFootPitch: -0.2 } },
    ],
    tools: [
      { kind: 'breaker-bar', member: 0, points: [[0.02, 0.98, 0.34], [-0.06, 1.05, 0.27], [0.05, 0.56, 0.7]] },
      { kind: 'impact-wrench', member: 1, points: [[-0.04, 0.43, 0.42], [0.09, 0.5, 0.5], [0.03, 0.42, 0.68]] },
      { kind: 'flashlight', member: 3, points: [[0.2, 0.36, -0.42], [0.22, 0.42, -0.6]] },
    ],
  }),
  // the Leopard on its lift: two men carry a road wheel flat to the rack, a mechanic with a torque wrench works the
  // road-arm bolts under the hull
  leopard: scene({
    id: 'leopard', task: 'road wheels off the lifted hull to the rack', essential: false,
    frame: { parent: 'leopard-bay', x: 0, z: 0, yaw: 0 },
    members: [
      { role: 'road-wheel-carrier', dress: D('de', 1), at: [-0.9, 0, 5.05], yaw: -Math.PI / 2, pose: wheelCarrierPose(1) },
      { role: 'road-wheel-carrier', dress: D('de', 2), at: [-2.26, 0, 5.05], yaw: Math.PI / 2, pose: wheelCarrierPose(-1) },
      { role: 'suspension-mechanic', dress: D('de', 3), at: [-2.55, 0, -0.6], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.49, -0.02], spine: [0.12, 0.06, 0], head: [-0.38, 0.05],
          leftFoot: [0.1, 0.22, -0.4], leftFootPitch: 1.3, leftKnee: [0.1, -0.2, 0.6],
          rightFoot: [-0.15, A, 0.36], rightKnee: [-0.15, 0.9, 0.9],
          rightHand: [-0.06, 1.0, 0.58], leftHand: [0.16, 0.95, 0.55] } },
    ],
    tools: [
      { kind: 'torque-wrench', member: 2, points: [[-0.06, 1.0, 0.58], [0.16, 0.95, 0.55], [0.05, 1.02, 0.95]] },
    ],
  }),
  // the T-90M turret on its cradle: a carrier brings a Relikt cassette, one fitter lifts one onto the roof, another
  // presses one onto the left cheek
  t90m: scene({
    id: 't90m', task: 'Relikt cassettes onto the turret roof and cheek', essential: false,
    frame: { parent: 'workshop', x: -6.6, z: 20.5, yaw: 2.4 },
    members: [
      { role: 'cassette-carrier', dress: D('ru', 5, 'watch-cap'), at: [2.3, 0, -1.85], yaw: -2.2,
        pose: { pelvis: [0, HIP - 0.06, -0.02], spine: [-0.1, 0.03, 0], head: [0.3, 0],
          leftHand: [0.16, 0.98, 0.25], rightHand: [-0.16, 0.98, 0.25], leftGrip: 'carry', rightGrip: 'carry',
          leftPalm: [0, 1, 0], rightPalm: [0, 1, 0],
          leftFoot: [0.13, A, 0.14], rightFoot: [-0.12, A, -0.14] } },
      { role: 'cassette-fitter', dress: D('ru', 6), at: [-2.35, 0, 0.9], yaw: Math.PI / 2,
        pose: { pelvis: [0, HIP, 0], spine: [0.08, 0.05, 0], head: [-0.15, 0],
          leftHand: [0.16, 1.5, 0.52], rightHand: [-0.18, 1.48, 0.52], leftGrip: 'carry', rightGrip: 'carry',
          leftPalm: [0, 1, 0.2], rightPalm: [0, 1, 0.2],
          leftFoot: [0.13, A, 0.12], rightFoot: [-0.12, A, -0.08] } },
      { role: 'cheek-fitter', dress: D('ru', 7, 'shlemofon'), at: [2.39, 0, -0.4], yaw: -1.406,
        pose: { pelvis: [0, HIP - 0.02, 0], spine: [0.14, -0.06, 0], head: [0.12, 0.05],
          leftHand: [0.17, 1.22, 0.5], rightHand: [-0.17, 1.24, 0.5], leftGrip: 'flat', rightGrip: 'flat',
          leftPalm: [0, 0, 1], rightPalm: [0, 0, 1],
          leftFoot: [0.13, A, 0.08], rightFoot: [-0.13, A, -0.1] } },
    ],
    tools: [
      { kind: 'cassette', member: 0, points: [[0.16, 0.98, 0.25], [-0.16, 0.98, 0.25], [0, 1.14, 0.27]] },
      { kind: 'cassette', member: 1, points: [[0.16, 1.5, 0.52], [-0.18, 1.48, 0.52], [-0.01, 1.66, 0.56]] },
      { kind: 'cassette', member: 2, points: [[0.17, 1.22, 0.5], [-0.17, 1.24, 0.5], [0, 1.23, 0.72]] },
    ],
  }),
  // the K2 rolled in its rotisserie for belly access: a welder on a stand works a belly plate behind a welding curtain
  // with a fire watch below, and a track man drifts pins out of the shoes on the pallet
  k2: scene({
    id: 'k2', task: 'belly plate welding on the rolled hull with a fire watch, track pins on the shoe pallet', essential: false,
    frame: { parent: 'workshop', x: -16.25, z: -16.85, yaw: 0.35 },
    props: [
      { kind: 'work-stand', at: [0.62, 0, 0.25], yaw: 0, deckY: 0.9 },
      { kind: 'weld-curtain', at: [0.95, 0, -1.2], yaw: 0, deckY: 0 },
    ],
    weldTip: [-0.22, 2.18, 0.25],
    members: [
      { role: 'welder', dress: D('kr', 1, 'welding-hood'), at: [0.55, 0.9, 0.25], yaw: -Math.PI / 2,
        pose: { pelvis: [0, HIP - 0.05, -0.03], spine: [0.24, 0.04, 0], head: [0.1, 0],
          rightHand: [-0.03, 1.18, 0.5], leftHand: [0.1, 1.24, 0.6],
          leftFoot: [0.13, A, 0.08], rightFoot: [-0.13, A, -0.14] } },
      { role: 'fire-watch', dress: D('kr', 3), at: [1.95, 0, 1.3], yaw: -2.19,
        pose: { pelvis: [0, HIP, 0], spine: [0.04, 0.08, 0], head: [-0.2, 0.1],
          rightHand: [-0.21, 0.77, 0.08], leftHand: [0.12, 0.98, 0.36],
          leftFoot: [0.13, A, 0.06], rightFoot: [-0.12, A, -0.05] } },
      { role: 'track-pin-man', dress: D('kr', 2, 'ear-defenders'), at: [-5.0, 0, 1.5], yaw: -Math.PI / 2,
        pose: { pelvis: [0, 0.49, -0.06], spine: [0.46, 0.08, 0], head: [0.48, 0],
          leftFoot: [0.1, 0.22, -0.4], leftFootPitch: 1.3, leftKnee: [0.1, -0.2, 0.6],
          rightFoot: [-0.15, A, 0.36], rightKnee: [-0.15, 0.9, 0.9],
          leftHand: [-0.02, 0.47, 0.5], rightHand: [-0.17, 0.66, 0.36] } },
    ],
    tools: [
      { kind: 'torch', member: 0, points: [[-0.03, 1.18, 0.5], [0, 1.28, 0.77]] },
      { kind: 'extinguisher', member: 1, points: [[-0.21, 0.77, 0.08], [0.12, 0.98, 0.36]] },
      { kind: 'punch', member: 2, points: [[-0.02, 0.47, 0.5], [-0.04, 0.3, 0.53]] },
      { kind: 'hammer', member: 2, points: [[-0.17, 0.66, 0.36], [-0.03, 0.6, 0.5]] },
    ],
  }),
  // Verdant's mezzanine and its inspection overhang (interior frame: deck tops 4.52 and 4.46 m), seen above the hero
  // from the opening camera: a shift lead on the overhang rail watching the bays below, two hands carrying a parts
  // crate along the walkway.
  mezzanine: scene({
    id: 'mezzanine', task: 'a parts crate along the mezzanine, a lead watching the bays from the overhang rail', essential: false,
    frame: { parent: 'verdant-interior', x: 0, z: 0, yaw: 0 },
    members: [
      { role: 'overhang-lead', dress: D('ru', 8, 'patrol-cap'), at: [10.25, 4.46, 13.08], yaw: Math.PI,
        pose: { pelvis: [0, HIP - 0.03, 0.02], spine: [0.4, 0.08, 0], head: [0.5, 0.15],
          leftHand: [0.24, 1.03, 0.5], rightHand: [-0.24, 1.03, 0.52], leftPalm: [0, -1, 0], rightPalm: [0, -1, 0],
          leftFoot: [0.13, A, -0.06], rightFoot: [-0.13, A, -0.1] } },
      { role: 'crate-carrier', dress: D('ru', 9), at: [14.75, 4.52, 18.2], yaw: -Math.PI / 2,
        pose: { pelvis: [0, 0.86, -0.04], spine: [0.18, 0.04, 0], head: [0.15, 0],
          leftHand: [0.18, 0.8, 0.4], rightHand: [-0.18, 0.8, 0.4], leftGrip: 'carry', rightGrip: 'carry',
          leftPalm: [0, 1, 0], rightPalm: [0, 1, 0],
          leftFoot: [0.15, A, 0.06], rightFoot: [-0.15, A, -0.1] } },
      { role: 'crate-carrier', dress: D('ru', 10), at: [13.25, 4.52, 18.2], yaw: Math.PI / 2,
        pose: { pelvis: [0, 0.86, -0.04], spine: [0.2, -0.04, 0], head: [0.2, 0.1],
          leftHand: [0.18, 0.8, 0.4], rightHand: [-0.18, 0.8, 0.4], leftGrip: 'carry', rightGrip: 'carry',
          leftPalm: [0, 1, 0], rightPalm: [0, 1, 0],
          leftFoot: [0.14, A, 0.07], rightFoot: [-0.16, A, -0.08] } },
    ],
    tools: [
      { kind: 'crate', member: 2, points: [[0.18, 0.8, 0.4], [-0.18, 0.8, 0.4], [0, 0.8, 1.08]] },
    ],
  }),
  // The free floor either side of the hero in the opening frame (wave 338: "behind the menus the hall is empty"): two
  // men carry a section of track toward the Abrams, and a pulled power pack stands on its stand with a mechanic at the
  // fuel pump and another checking the cooling pack. Shared by all ten Garages (their hardstand outdoors).
  yard: scene({
    id: 'yard', task: 'a track section carried across the floor, a pulled power pack on its stand', essential: false,
    frame: { parent: 'workshop', x: 0, z: 0, yaw: 0 },
    props: [{ kind: 'power-pack', at: [3.4, 0, -11.4], yaw: 0.55, deckY: 0 }],
    members: [
      // side by side across the opening camera's line of sight, so the menu frame shows two men and the track between
      // them (2026-10-10, wave 357: in line with the camera they read as one idle sentry)
      { role: 'track-carrier', dress: D('ru', 11), at: [-10.08, 0, 0.52], yaw: -0.363,
        pose: { pelvis: [0, 0.83, -0.05], spine: [0.15, 0.05, 0], head: [-0.04, 0.05],
          leftHand: [0.24, 0.7, 0.22], rightHand: [-0.24, 0.7, 0.22], leftGrip: 'fist', rightGrip: 'fist',
          leftPalm: [-1, 0, 0], rightPalm: [1, 0, 0],
          leftFoot: [0.17, A, 0.06], rightFoot: [-0.17, A, -0.14] } },
      { role: 'track-carrier', dress: D('ru', 12), at: [-10.62, 0, 1.93], yaw: -0.363 + Math.PI,
        pose: { pelvis: [0, 0.82, -0.06], spine: [0.17, -0.04, 0], head: [-0.02, -0.07],
          leftHand: [0.24, 0.7, 0.22], rightHand: [-0.24, 0.7, 0.22], leftGrip: 'fist', rightGrip: 'fist',
          leftPalm: [-1, 0, 0], rightPalm: [1, 0, 0],
          leftFoot: [0.16, A, 0.1], rightFoot: [-0.17, A, -0.1] } },
      { role: 'power-pack-mechanic', dress: D('us', 5), at: [2.25, 0, -10.75], yaw: 0.55 + Math.PI / 2,
        pose: { pelvis: [0, HIP - 0.06, -0.02], spine: [0.36, 0.06, 0], head: [0.25, 0],
          leftHand: [0.12, 1.02, 0.48], rightHand: [-0.1, 1.08, 0.5], leftGrip: 'flat', leftPalm: [0, -1, 0.2],
          leftFoot: [0.14, A, 0.08], rightFoot: [-0.13, A, -0.14] } },
      { role: 'cooling-pack-inspector', dress: D('kr', 6), at: [4.95, 0, -12.15], yaw: 0.55 - Math.PI / 2,
        pose: { pelvis: [0, HIP, 0], spine: [0.1, -0.08, 0], head: [0.32, -0.1],
          leftHand: [0.06, 1.12, 0.3], rightHand: [-0.12, 1.2, 0.42], leftGrip: 'carry', leftPalm: [0, 1, 0],
          leftFoot: [0.12, A, 0.02], rightFoot: [-0.12, A, 0.0] } },
    ],
    tools: [
      { kind: 'track-section', member: 0, points: [[0.24, 0.7, 0.22], [-0.24, 0.7, 0.22]] },
      { kind: 'torque-wrench', member: 2, points: [[-0.1, 1.08, 0.5], [0.12, 1.02, 0.48], [-0.02, 1.0, 0.82]] },
      { kind: 'flashlight', member: 3, points: [[-0.12, 1.2, 0.42], [-0.08, 1.28, 0.62]] },
      { kind: 'clipboard', member: 3, points: [[0.06, 1.12, 0.3], [0.0, 1.14, 0.32]] },
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
      case 'breaker-bar': {
        const d = dir(p[0], p[2]);
        meshes.push(rod(p[1].clone().addScaledVector(d, -0.1), p[2], 0.015, materials.steelMid));
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.07, 10), materials.steelDark);
        socket.position.copy(p[2]);
        socket.quaternion.setFromUnitVectors(_up, d);
        meshes.push(socket);
        break;
      }
      case 'impact-wrench': {
        // pistol-grip air impact wrench: grip in the right hand, body forward to the socket on the hub nut, air hose
        const d = dir(p[0], p[2]);
        const bodyStart = p[0].clone().add(new THREE.Vector3(0, 0.06, 0));
        meshes.push(rod(bodyStart, p[2].clone().addScaledVector(d, -0.04), 0.038, materials.steelDark, 10));
        meshes.push(rod(p[0].clone().add(new THREE.Vector3(0, -0.05, 0)), bodyStart, 0.022, materials.rubber, 8));
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 8), materials.steelMid);
        socket.position.copy(p[2]);
        socket.quaternion.setFromUnitVectors(_up, d);
        meshes.push(socket);
        const hoseEnd = p[0].clone(); hoseEnd.y = 0.02; hoseEnd.addScaledVector(d, -0.45);
        meshes.push(rod(p[0].clone().add(new THREE.Vector3(0, -0.06, 0)), hoseEnd, 0.01, materials.rubber, 6));
        break;
      }
      case 'punch': {
        meshes.push(rod(p[0].clone().addScaledVector(dir(p[1], p[0]), 0.05), p[1], 0.009, materials.steelMid, 6));
        break;
      }
      case 'hammer': {
        const d = dir(p[0], p[1]);
        meshes.push(rod(p[0].clone().addScaledVector(d, -0.06), p[1], 0.013, materials.timber, 6));
        const side = new THREE.Vector3().crossVectors(d, _up);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        const head = new THREE.Quaternion().setFromUnitVectors(_up, side.normalize());
        meshes.push(boxAt(p[1], [0.045, 0.12, 0.045], head, materials.steelDark));
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
        // the crate rests on the carriers' upturned palms
        const grips = p[0].clone().add(p[1]).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.2, 0));
        const along = new THREE.Vector3().subVectors(p[2], grips);
        const length = Math.max(0.3, along.length() - 0.02);
        const centre = grips.clone().add(p[2].clone().add(new THREE.Vector3(0, 0.2, 0))).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), along.setY(0).normalize());
        meshes.push(boxAt(centre, [length, 0.4, Math.max(0.3, p[0].distanceTo(p[1]) - 0.04)], q, materials.timber));
        break;
      }
      case 'track-section': {
        // links between this carrier's hands and his partner's (the next member), each a shoe with its guide horn
        const partner = scene.members[tool.member + 1];
        const a = p[0].clone().add(p[1]).multiplyScalar(0.5);
        const b = crewPointInScene(partner, [0, tool.points[0][1], tool.points[0][2]]);
        const along = new THREE.Vector3().subVectors(b, a);
        const length = along.length();
        along.normalize();
        const count = Math.max(3, Math.round(length / 0.152));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
        for (let link = 0; link < count; link++) {
          const centre = a.clone().addScaledVector(along, (link + 0.5) * (length / count)).add(new THREE.Vector3(0, -0.02, 0));
          meshes.push(boxAt(centre, [0.56, 0.05, 0.13], q, materials.steelDark));
          meshes.push(boxAt(centre.clone().add(new THREE.Vector3(0, 0.05, 0)), [0.05, 0.06, 0.08], q, materials.steelMid));
        }
        break;
      }
      case 'cassette': {
        const centre = p[2] ? p[2].clone() : p[0].clone().add(p[1]).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.02, 0));
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
