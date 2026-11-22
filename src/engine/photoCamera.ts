// The battle's photo camera (photo-mode-271): a free orbit for framing a still while a solo battle stands frozen.
// Copyright © 2026 Kevin B. Liu.
// It orbits a pivot that starts where the chase camera was looking, pans and dollies, rolls and changes lens, and keeps
// out of the ground and within a radius of the subject (the player's tank). It is the battle's half of the one photo
// mode (src/ui/photoMode.ts): `hold`, `aim` and `reset` are the same contract the Garage's showroom orbit serves, so
// the shared framings drive either camera. Pure three.js maths with no DOM: Node runs it (photoCamera.selftest.mjs).
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';

/** The subject the camera stays near: the centre (m) and radius (m) of a sphere holding it whole (the hull and the
 *  gun's muzzle), and its heading (rad, forward is local +Z). */
export interface PhotoSubject {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly radiusM: number;
  /** The points a framing keeps in frame (world m: the hull box's corners, the muzzle); without them, the sphere. */
  readonly points?: readonly { readonly x: number; readonly y: number; readonly z: number }[];
}

interface PhotoCameraOptions {
  readonly camera: PerspectiveCamera;
  /** The ground's height at (x, z) in metres; a non-finite answer is no ground (off the map). */
  groundAt(x: number, z: number): number;
  /** How far the camera may stray from the subject (m). */
  readonly radiusM?: number;
  /** The view's height in CSS pixels (a pan moves the pivot by what a pixel covers there). */
  viewHeightPx?(): number;
  /** The reader asked for reduced motion: a framing, a lens or a roll lands at once instead of easing in. */
  reduceMotion?(): boolean;
}

/** Focal lengths offered (mm, full-frame: the vertical field of view is 2·atan(12 / f)). */
export const PHOTO_LENSES_MM: readonly number[] = Object.freeze([18, 24, 35, 50, 85]);
/** The lens photo mode opens on: a normal view, neither the chase's wide angle nor a sight's long one. */
export const PHOTO_OPEN_LENS_MM = 35;
/** The roll steps offered (degrees; positive rolls the camera clockwise, so the horizon climbs to the frame's right). */
export const PHOTO_TILTS_DEG: readonly number[] = Object.freeze([-12, -6, 0, 6, 12]);
/** The camera keeps this far within the subject's radius (m) and this high over the ground (m). */
export const PHOTO_RADIUS_M = 45;
export const PHOTO_GROUND_CLEARANCE_M = 0.5;
const DIST_MIN_M = 2;
const PITCH_MIN = -0.3;
const PITCH_MAX = 1.45;
const ROLL_MAX = 30 * (Math.PI / 180);
/** The damping rate (1/s) of every eased value: settles in about a quarter second, frame-rate independent. */
const EASE_RATE = 14;
/** A framing holds the subject's sphere this much inside the frame's nearer edges. */
const FIT_MARGIN = 1.1;

export const lensFovDeg = (mm: number): number => 2 * Math.atan(12 / mm) * (180 / Math.PI);

export interface PhotoCamera {
  readonly active: boolean;
  /** Take the camera over from where it stands, about `subject`. */
  open(subject: PhotoSubject): void;
  /** Hand the camera back with the field of view it had. */
  close(): void;
  /** Steer this frame's camera (eased); returns false while closed. */
  update(dtSeconds: number): boolean;
  /** The shared framing contract (src/ui/photoMode.ts PhotoView). */
  hold(on: boolean): void;
  aim(yawRad: number, pitchRad: number, zoomTo?: number): void;
  reset(): boolean;
  orbit(dxPx: number, dyPx: number): void;
  pan(dxPx: number, dyPx: number): void;
  dolly(notches: number): void;
  pinch(scale: number): void;
  roll(deltaRad: number): void;
  setRollDeg(deg: number): void;
  rollDeg(): number;
  setLens(mm: number): void;
  /** The interface covers this much of the view's bottom (CSS px): a framing fits the subject in the view above it, and
   *  the lens shifts so the subject centres there. 0 frames the whole view (a still, which carries no interface). */
  inset(bottomPx: number): void;
  /** The chosen focal length (mm), or null while the field of view is the live camera's. */
  lensMm(): number | null;
  /** The solved camera state, for receipts. */
  debugState(): { pivot: Vector3; position: Vector3; dist: number; yaw: number; pitch: number; roll: number; fov: number };
}

export function createPhotoCamera({ camera, groundAt, radiusM = PHOTO_RADIUS_M, viewHeightPx = () => 800, reduceMotion }: PhotoCameraOptions): PhotoCamera {
  const anchor = new Vector3();
  let anchorYaw = 0;
  let subjectR = 4;
  let subjectPoints: PhotoSubject['points'] = undefined;
  const fitF = new Vector3();
  const fitR = new Vector3();
  const fitU = new Vector3();
  const fitRel = new Vector3();
  const WORLD_UP = new Vector3(0, 1, 0);
  let insetPx = 0;
  /** The framing chosen (aim), kept while the camera holds it: a lens, an inset or an aspect change refits it. */
  let framing: { yaw: number; pitch: number; zoom: number; aspect: number } | null = null;
  const pivot = new Vector3();
  const tPivot = new Vector3();
  let yaw = 0, tYaw = 0;
  let pitch = 0, tPitch = 0;
  let dist = 10, tDist = 10;
  let roll = 0, tRoll = 0;
  let fov = 60, tFov = 60;
  let savedFov = 60;
  let lens: number | null = null;
  let active = false;
  const position = new Vector3();
  const scratch = new Vector3();
  const right = new Vector3();
  const up = new Vector3();

  const ground = (x: number, z: number): number => {
    const h = groundAt(x, z);
    return Number.isFinite(h) ? h : -Infinity;
  };

  /** Keep a point within `limit` of the anchor across the ground plane, and over the ground. */
  const clampPoint = (point: Vector3, limit: number, clearance: number): void => {
    const dx = point.x - anchor.x, dz = point.z - anchor.z;
    const flat = Math.hypot(dx, dz);
    if (flat > limit) { point.x = anchor.x + (dx / flat) * limit; point.z = anchor.z + (dz / flat) * limit; }
    point.y = MathUtils.clamp(point.y, ground(point.x, point.z) + clearance, anchor.y + limit);
  };

  /** The camera's place for a pivot and its spherical offset (yaw from the pivot toward the camera; forward +Z). */
  const place = (out: Vector3, at: Vector3, yawRad: number, pitchRad: number, distM: number): Vector3 => {
    const flat = Math.cos(pitchRad) * distM;
    return out.set(at.x + Math.sin(yawRad) * flat, at.y + Math.sin(pitchRad) * distM, at.z + Math.cos(yawRad) * flat);
  };

  const wrapNear = (value: number, near: number): number => near + Math.atan2(Math.sin(value - near), Math.cos(value - near));

  /** The distance that holds the subject inside the view above the inset on the chosen lens, seen from the framing's
   *  yaw and pitch (world): its points where it has them, else its sphere. */
  const fitDist = (yawRad: number, pitchRad: number): number => {
    const tanV = Math.tan((tFov * Math.PI) / 360);
    const free = MathUtils.clamp(1 - insetPx / Math.max(1, viewHeightPx()), 0.2, 1);
    const tanVf = tanV * free, tanH = tanV * camera.aspect;
    if (!subjectPoints?.length) return (subjectR / Math.sin(Math.min(Math.atan(tanVf), Math.atan(tanH)))) * FIT_MARGIN;
    // the framing's lens axes: forward from the camera to the pivot, the screen's right and up
    fitF.set(-Math.sin(yawRad) * Math.cos(pitchRad), -Math.sin(pitchRad), -Math.cos(yawRad) * Math.cos(pitchRad));
    fitR.crossVectors(fitF, WORLD_UP).normalize();
    fitU.crossVectors(fitR, fitF);
    // each point stays inside the frame's edges at its own depth: d >= |offset| * margin / tan(half-angle) - depth
    // the tilt turns the frame about its axis (solve's rotateZ(-roll)), so a point's place is taken on the turned axes
    const cosR = Math.cos(tRoll), sinR = Math.sin(tRoll);
    let dist = DIST_MIN_M;
    for (const point of subjectPoints) {
      fitRel.set(point.x - tPivot.x, point.y - tPivot.y, point.z - tPivot.z);
      const depth = fitRel.dot(fitF);
      const across = fitRel.dot(fitR), upward = fitRel.dot(fitU);
      dist = Math.max(dist, (Math.abs(cosR * across - sinR * upward) * FIT_MARGIN) / tanH - depth,
        (Math.abs(sinR * across + cosR * upward) * FIT_MARGIN) / tanVf - depth);
    }
    return dist;
  };

  /** The lens shift that centres the frame's middle in the view above the inset (none for a still). */
  const applyView = (): void => {
    if (active && insetPx > 0) {
      const h = Math.max(1, viewHeightPx());
      const w = h * camera.aspect;
      camera.setViewOffset(w, h, 0, insetPx / 2, w, h);
    } else if (camera.view?.enabled) {
      camera.clearViewOffset();
    }
  };

  const solve = (): void => {
    place(position, pivot, yaw, pitch, dist);
    clampPoint(position, radiusM, PHOTO_GROUND_CLEARANCE_M);
    camera.position.copy(position);
    camera.up.set(0, 1, 0);
    // a camera pressed to the ground under a high pivot still looks at it (the floor raised the eye, not the target)
    camera.lookAt(pivot);
    camera.rotateZ(-roll);
    camera.fov = fov;
    applyView();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };

  const self: PhotoCamera = {
    get active() { return active; },

    open(subject) {
      anchor.set(subject.x, subject.y, subject.z);
      anchorYaw = subject.yaw;
      subjectR = Math.max(1, subject.radiusM);
      subjectPoints = subject.points;
      framing = null;
      savedFov = camera.fov;
      fov = tFov = camera.fov;
      lens = null;
      roll = tRoll = 0;
      // the pivot is the point on the camera's line of sight nearest the subject: the view opens exactly as it was
      camera.updateMatrixWorld(true);
      camera.getWorldDirection(scratch);
      const along = scratch.dot(position.copy(anchor).sub(camera.position));
      active = true;
      if (!(along > DIST_MIN_M + 1)) {
        // a sight's view (the camera at the gun) has no line to the subject: open on the hero framing
        pivot.copy(anchor);
        tPivot.copy(pivot);
        self.reset();
        yaw = tYaw; pitch = tPitch; dist = tDist;
        solve();
        return;
      }
      pivot.copy(camera.position).addScaledVector(scratch, along);
      clampPoint(pivot, radiusM, 0.3);
      tPivot.copy(pivot);
      position.copy(camera.position).sub(pivot);
      dist = tDist = MathUtils.clamp(position.length(), DIST_MIN_M, radiusM);
      yaw = tYaw = Math.atan2(position.x, position.z);
      pitch = tPitch = MathUtils.clamp(Math.asin(MathUtils.clamp(position.y / Math.max(1e-6, position.length()), -1, 1)), PITCH_MIN, PITCH_MAX);
      solve();
    },

    close() {
      if (!active) return;
      active = false;
      framing = null;
      camera.clearViewOffset();
      camera.up.set(0, 1, 0);
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
    },

    update(dtSeconds) {
      if (!active) return false;
      // a resize or a rotation refits the framing the camera holds
      if (framing && framing.aspect !== camera.aspect) self.aim(framing.yaw, framing.pitch, framing.zoom);
      const k = reduceMotion?.() ? 1 : 1 - Math.exp(-EASE_RATE * Math.max(0, Math.min(0.1, dtSeconds)));
      pivot.lerp(tPivot, k);
      yaw += (wrapNear(tYaw, yaw) - yaw) * k;
      pitch += (tPitch - pitch) * k;
      dist += (tDist - dist) * k;
      roll += (tRoll - roll) * k;
      fov += (tFov - fov) * k;
      if (Math.abs(tFov - fov) < 1e-3) fov = tFov;
      solve();
      return true;
    },

    // the battle stands still while photo mode shows: nothing springs back, so holding is the camera's nature
    hold() {},

    aim(yawRad, pitchRad, zoomTo = 1) {
      // the subject's sphere, whole and centred, on the lens and the view the screen has
      framing = { yaw: yawRad, pitch: pitchRad, zoom: zoomTo, aspect: camera.aspect };
      tPivot.copy(anchor);
      tYaw = wrapNear(anchorYaw + yawRad, yaw);
      tPitch = MathUtils.clamp(pitchRad, PITCH_MIN, PITCH_MAX);
      tDist = MathUtils.clamp(fitDist(tYaw, tPitch) / Math.max(0.2, zoomTo), DIST_MIN_M, radiusM);
    },

    reset() {
      // the hero framing: the bow three-quarters toward the viewer, a little above the deck
      self.aim(35 * (Math.PI / 180), 9 * (Math.PI / 180), 1);
      return true;
    },

    orbit(dxPx, dyPx) {
      framing = null;
      tYaw -= dxPx * 0.006;
      tPitch = MathUtils.clamp(tPitch + dyPx * 0.005, PITCH_MIN, PITCH_MAX);
    },

    pan(dxPx, dyPx) {
      // the screen's right and up at the pivot, a pixel worth what it covers at the pivot's distance
      framing = null;
      const metresPerPx = (2 * Math.tan((fov * Math.PI) / 360) * tDist) / Math.max(1, viewHeightPx());
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      tPivot.addScaledVector(right, -dxPx * metresPerPx).addScaledVector(up, dyPx * metresPerPx);
      clampPoint(tPivot, radiusM, 0.3);
    },

    dolly(notches) {
      framing = null;
      tDist = MathUtils.clamp(tDist * Math.pow(1.12, notches), DIST_MIN_M, radiusM);
    },

    pinch(scale) {
      if (!(scale > 0 && Number.isFinite(scale))) return;
      framing = null;
      tDist = MathUtils.clamp(tDist / scale, DIST_MIN_M, radiusM);
    },

    // a held framing refits to the tilt (a turned frame needs more room for a long hull)
    roll(deltaRad) {
      tRoll = MathUtils.clamp(tRoll + deltaRad, -ROLL_MAX, ROLL_MAX);
      if (framing) self.aim(framing.yaw, framing.pitch, framing.zoom);
    },

    setRollDeg(deg) {
      tRoll = MathUtils.clamp(deg * (Math.PI / 180), -ROLL_MAX, ROLL_MAX);
      if (framing) self.aim(framing.yaw, framing.pitch, framing.zoom);
    },

    rollDeg: () => tRoll * (180 / Math.PI),

    setLens(mm) {
      if (!(mm > 0)) return;
      lens = mm;
      tFov = lensFovDeg(mm);
      if (framing) self.aim(framing.yaw, framing.pitch, framing.zoom);
    },

    inset(bottomPx) {
      insetPx = Math.max(0, bottomPx);
      if (framing) self.aim(framing.yaw, framing.pitch, framing.zoom);
      // at once: a still is taken in this same task
      applyView();
      camera.updateProjectionMatrix();
    },

    lensMm: () => lens,

    debugState: () => ({ pivot: pivot.clone(), position: camera.position.clone(), dist, yaw, pitch, roll, fov }),
  };
  return self;
}
