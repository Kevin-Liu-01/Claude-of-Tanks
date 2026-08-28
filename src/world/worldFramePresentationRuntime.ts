import { Vector3, type Object3D, type PerspectiveCamera } from 'three';

interface WorldFrameEntity {
  state?: object;
  spec?: { dims?: { heightM?: number } };
  visual?: { root?: Object3D & { visible: boolean } };
}

interface WorldFrameRig {
  mode: string;
  aimDist: number;
  externalActive: boolean;
}

interface WorldFrameTarget {
  setSniperFade(active: number, immediate: boolean, fov: number, aimDistance: number): void;
  update(
    dtSeconds: number,
    cameraPosition: Vector3,
    cameraForward: Vector3,
    occlusionFocus: Vector3 | null,
  ): void;
}

export interface WorldFramePresentationRuntimeOptions {
  camera: PerspectiveCamera;
  rig: WorldFrameRig;
  getWorld(): WorldFrameTarget | null;
  isWorldDormant(): boolean;
  getCameraFocus(): WorldFrameEntity | null;
}

export interface WorldFramePresentationRuntime {
  update(dtSeconds: number, inBattle: boolean, killcamActive: boolean): void;
}

/**
 * Own scoped foliage suppression and chase-camera occlusion focus.
 * Scratch direction/focus vectors are retained and no work runs for a dormant
 * Garage world.
 */
export function createWorldFramePresentationRuntime({
  camera,
  rig,
  getWorld,
  isWorldDormant,
  getCameraFocus,
}: WorldFramePresentationRuntimeOptions): WorldFramePresentationRuntime {
  const forward = new Vector3();
  const occlusionFocus = new Vector3();

  return {
    update(dtSeconds, inBattle, killcamActive): void {
      const world = getWorld();
      if (!world || isWorldDormant()) return;

      world.setSniperFade(
        rig.mode === 'SNIPER' ? 1 : 0,
        false,
        camera.fov,
        rig.aimDist,
      );
      camera.getWorldDirection(forward);

      let focus: Vector3 | null = null;
      const entity = getCameraFocus();
      const root = entity?.visual?.root;
      if (inBattle && !killcamActive && rig.mode === 'ARCADE' &&
          !rig.externalActive && entity?.state && root?.visible) {
        root.getWorldPosition(occlusionFocus);
        occlusionFocus.y += (entity.spec?.dims?.heightM ?? 0) * 0.75;
        focus = occlusionFocus;
      }
      world.update(dtSeconds, camera.position, forward, focus);
    },
  };
}
