import * as THREE from 'three';
import type { AerialView } from '../sim/aerialCombat.ts';

/** A gimballed orbit scope and a turn-limited FPV camera, using the ordinary aim ray. */
export function createAerialCamera(camera: THREE.PerspectiveCamera) {
  let owner: object | null = null, previousKind = '', yaw = 0, pitch = -.8, zoom = 1;
  const target = new THREE.Vector3();
  return {
    update(entity: { aerial?: AerialView; input?: { aimPoint?: THREE.Vector3 | null }; visual?: { root: THREE.Object3D } | null }, input: { mouseDX: number; mouseDY: number; wheel: number; cursorAim?: boolean; cursorX?: number; cursorY?: number }, dt: number): boolean {
      const view = entity.aerial;
      if (!view?.active) {
        if (previousKind) { camera.fov = 60; camera.updateProjectionMatrix(); previousKind = ''; owner = null; }
        return false;
      }
      if (owner !== entity || previousKind !== view.kind) {
        owner = entity; previousKind = view.kind; yaw = view.kind === 'gunship' ? Math.atan2(-view.x, -view.z) : view.yaw;
        pitch = view.kind === 'gunship' ? -1.05 : view.pitch; zoom = 1;
      }
      if (view.kind === 'drone' && view.launching) {
        camera.position.set(view.x - Math.sin(view.yaw) * 5, view.y + 2, view.z - Math.cos(view.yaw) * 5);
        target.set(view.x, view.y, view.z); camera.lookAt(target); return true;
      }
      const cursorDX = input.cursorAim ? (input.cursorX ?? 0) * dt * 350 : 0;
      const cursorDY = input.cursorAim ? -(input.cursorY ?? 0) * dt * 250 : 0;
      yaw -= (input.mouseDX + cursorDX) * .0022 / zoom;
      pitch = THREE.MathUtils.clamp(pitch - (input.mouseDY + cursorDY) * .0022 / zoom,
        view.kind === 'gunship' ? -1.53 : -1.35, view.kind === 'gunship' ? -.3 : 1.1);
      if (view.kind === 'gunship') zoom = THREE.MathUtils.clamp(zoom * Math.pow(1.2, -input.wheel), 1, 6);
      const fov = view.kind === 'gunship' ? 55 / zoom : 85;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.set(view.x, view.y + .2, view.z);
      target.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(1000).add(camera.position);
      camera.lookAt(target);
      if (entity.input?.aimPoint) entity.input.aimPoint.copy(target);
      return true;
    },
  };
}
