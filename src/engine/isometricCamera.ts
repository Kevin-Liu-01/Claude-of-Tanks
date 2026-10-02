import * as THREE from 'three';
import type { CameraEntity, CameraRigDeps } from './cameraRig.ts';

const FOV = 38;
// A shallower tactical angle shows farther across the field while keeping the hull centered.
const PITCH = Math.PI * 0.27;
const YAW = Math.PI / 4;

/** Stable tactical framing. Uses the existing perspective camera and world collision query. */
export function createIsometricCamera(camera: THREE.PerspectiveCamera, deps: CameraRigDeps) {
  const center = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let distance = 62;
  let pitch = PITCH;
  let zoom = 1;
  let initialized = false;
  let cursorX = 0;
  let cursorY = 0.35;

  function placeEye(atPitch: number): void {
    const horizontal = Math.cos(atPitch) * distance;
    eye.set(center.x - Math.sin(YAW) * horizontal,
      center.y + Math.sin(atPitch) * distance,
      center.z - Math.cos(YAW) * horizontal);
  }

  function obstructed(): boolean {
    direction.copy(eye).sub(center).normalize();
    const hit = deps.raycast(center, direction, distance);
    if (hit && hit.dist < distance - 0.5) return true;
    for (let i = 1; i <= 5; i++) {
      const k = i / 5;
      const x = center.x + (eye.x - center.x) * k;
      const z = center.z + (eye.z - center.z) * k;
      if (center.y + (eye.y - center.y) * k < deps.heightField.getHeightAt(x, z) + 1) return true;
    }
    return false;
  }

  return {
    reset(): void { initialized = false; },
    zoom(notches: number): void {
      zoom = THREE.MathUtils.clamp(zoom * Math.pow(0.88, notches), 0.65, 1.65);
    },
    solve(player: CameraEntity, dt: number, snap: boolean): void {
      // Follow the rendered hull (including multiplayer interpolation), not its rotating turret.
      if (player.visual) player.visual.root.getWorldPosition(center);
      else center.copy(player.state.pos);
      center.y += (player.spec?.dims?.heightM ?? 2.4) * 0.6;
      const aspect = Math.max(0.35, camera.aspect);
      const portraitScale = Math.max(1, Math.min(1.5, 1 / Math.sqrt(aspect)));
      const targetDistance = (62 + Math.min(Math.abs(player.state.speed ?? 0), 30) * 0.55) * zoom * portraitScale;
      const immediate = snap || !initialized;
      distance = immediate ? targetDistance : THREE.MathUtils.lerp(distance, targetDistance, 1 - Math.exp(-dt / 0.45));
      // Raise the viewing angle over walls/crests instead of pulling into the hull.
      let requiredPitch = PITCH;
      for (let i = 0; i < 5; i++) {
        placeEye(requiredPitch);
        if (!obstructed()) break;
        requiredPitch = Math.min(Math.PI * 0.48, requiredPitch + 0.14);
      }
      pitch = immediate || requiredPitch > pitch ? requiredPitch
        : THREE.MathUtils.lerp(pitch, requiredPitch, 1 - Math.exp(-dt / 0.6));
      placeEye(pitch);
      // Last resort for overhangs: stop before the obstruction along the sightline.
      direction.copy(eye).sub(center).normalize();
      const hit = deps.raycast(center, direction, distance);
      if (hit && hit.dist < distance) eye.copy(center).addScaledVector(direction, Math.max(1, hit.dist - 0.5));
      eye.y = Math.max(eye.y, deps.heightField.getHeightAt(eye.x, eye.z) + 1.5);
      camera.position.copy(eye);
      camera.up.set(0, 1, 0);
      camera.lookAt(center);
      camera.userData.scoped = false;
      camera.updateMatrixWorld(true);
      initialized = true;
    },
    aim(dx: number, dy: number, absolute: boolean, x = 0, y = 0): void {
      // consumeMouseDelta already negates X for world yaw. Undo it for screen motion.
      cursorX = THREE.MathUtils.clamp(absolute ? x : cursorX - dx * 0.003, -0.88, 0.88);
      cursorY = THREE.MathUtils.clamp(absolute ? y : cursorY - dy * 0.003, -0.75, 0.82);
    },
    aimAt(point: { x: number; y: number; z: number }): void {
      projected.set(point.x, point.y, point.z).project(camera);
      if (projected.z < 1) {
        cursorX = THREE.MathUtils.clamp(projected.x, -0.88, 0.88);
        cursorY = THREE.MathUtils.clamp(projected.y, -0.75, 0.82);
      }
    },
    resetAim(): void { cursorX = 0; cursorY = 0.35; },
    get cursorX() { return cursorX; },
    get cursorY() { return cursorY; },
    fov: FOV,
  };
}
