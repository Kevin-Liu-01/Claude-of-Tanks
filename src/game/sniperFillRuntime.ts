import * as THREE from 'three';
import { registerGroundKeyLight, unregisterGroundKeyLight } from '../engine/groundKeyLights.ts';

interface SniperFillRig {
  mode: string;
  aimDist: number;
}

export interface SniperFillRuntime {
  readonly light: THREE.PointLight;
  update(): void;
  dispose(): void;
}

/**
 * Own the range-limited camera fill used when a scoped gun faces nearby cover.
 *
 * The runtime mutates one retained light. It allocates nothing in `update`,
 * casts no shadow, and contributes no light outside a close scoped aim.
 */
export function createSniperFillRuntime(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  rig: SniperFillRig,
): SniperFillRuntime {
  const light = new THREE.PointLight(0xfff0dc, 0, 18, 2);
  light.castShadow = false;
  scene.add(light);
  // (2026-10-14, contact r2) the Studio's cinematic FX borrow this light for a flare or a fire: the near hulls shadow it on
  // the ground (groundKeyLights.ts)
  registerGroundKeyLight(light);

  return {
    light,
    update() {
      if (rig.mode === 'SNIPER' && camera.userData.scoped) {
        const near = THREE.MathUtils.clamp((20 - rig.aimDist) / 16, 0, 1);
        light.intensity = 40 * near * near;
        if (light.intensity > 0.01) light.position.copy(camera.position);
        return;
      }
      light.intensity = 0;
    },
    dispose() {
      unregisterGroundKeyLight(light);
      scene.remove(light);
      light.dispose();
    },
  };
}
