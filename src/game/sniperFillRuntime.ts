import * as THREE from 'three';

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
      scene.remove(light);
      light.dispose();
    },
  };
}
