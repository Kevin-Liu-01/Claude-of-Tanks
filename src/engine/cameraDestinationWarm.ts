/**
 * cameraDestinationWarm.ts — a camera about to be thrown somewhere it has not drawn (a Watch hop between tanks, a
 * spectate handover, the killcam's look at the killer) warms that place on the way (2026-10-24, perf-245).
 *
 * Item 245 (the mode-sheen lane): a camera thrown into unseen terrain held presentation up to 7.4 s, the GPU making
 * what that view draws for the first time — the far side's shadow casters, a staged opponent's materials, the sun's
 * light passes — and it was gone on the second visit. The covered deployment warm now draws the whole map once
 * (offscreenWarm.ts / deploymentWarm.ts uncull, the MSAA-matched target); this covers what remains for a live jump:
 *
 *  - the terrain stream picks its exact LOD jobs around the destination while the hop runs (terrain.ts
 *    setStreamFocus), so the ground under the arriving camera is refined, not its coarse far level;
 *  - the destination's view is drawn offscreen, one small batch of the objects its frustum holds per frame, so its
 *    uploads, first binds and any pipeline the deployment missed (a wreck, debris, a tank streamed since) land spread
 *    over the hop's frames rather than in its last.
 *
 * Callers announce a destination with `prepare` the moment a hop or cut is decided; `update` runs once a battle frame,
 * before the scene renders. A newer `prepare` replaces a pending one. Nothing persists past the pending work: the
 * terrain focus is released when the batches are drawn and the hop's time has passed.
 */
import { Frustum, Matrix4, PerspectiveCamera, type Camera, type Object3D, type Scene, type Vector3, type WebGLRenderer } from 'three';
import { createOffscreenSceneWarmer, renderBatchAlone, type OffscreenSceneWarmer } from './offscreenWarm.ts';

/** How the destination is warmed (receipt: cameraDestinationWarm.selftest.mjs). */
export const CAMERA_DESTINATION_WARM = Object.freeze({
  /** Objects drawn per frame: a small private raster, so a frame of the hop stays near its budget. */
  batchObjects: 24,
  /** At most this many of the destination's objects are drawn (the nearest first): ~25 frames of a hop. */
  maxObjects: 600,
  /** The private raster's share of the drawing buffer. */
  scale: 0.125,
  /** The terrain stays focused on the destination this long past the hop's own time. */
  focusTailS: 2,
  /** A destination this close to the camera is already in view: nothing to warm. */
  minHopM: 60,
});

interface WarmRenderable extends Object3D {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
}

export interface CameraDestinationWarmDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  /** The live camera: its lens and layers are the destination view's. */
  camera: PerspectiveCamera;
  /** The live scene target's MSAA sample count (post.msaaSamples). */
  samples?: () => number;
  /** Aim the terrain's LOD stream at a point, or release it (world.setTerrainStreamFocus). */
  setTerrainStreamFocus?: (position: Vector3 | null) => void;
  now?: () => number;
  /** Test seam: the offscreen warmer (defaults to a scene warmer on the destination camera). */
  createWarmer?: (camera: Camera) => Pick<OffscreenSceneWarmer, 'dispose'> & (() => void);
}

export interface CameraDestinationWarmer {
  /** A hop or cut toward `position`, looking at `lookAt`, arrives in about `durationS` seconds. */
  prepare(position: Vector3, lookAt: Vector3, durationS: number): void;
  /** One frame's share: one batch drawn, the terrain focus released once due. */
  update(): void;
  /** Drop pending work and the terrain focus (a battle's end, a world swap). */
  cancel(): void;
  readonly pendingBatches: number;
  dispose(): void;
}

function isRenderable(object: Object3D): object is WarmRenderable {
  const candidate = object as WarmRenderable;
  return !!(candidate.isMesh || candidate.isLine || candidate.isPoints || candidate.isSprite);
}

export function createCameraDestinationWarmer(deps: CameraDestinationWarmDeps): CameraDestinationWarmer {
  const { renderer, scene, camera } = deps;
  const now = deps.now ?? (() => performance.now());
  const destination = new PerspectiveCamera();
  const frustum = new Frustum();
  const projection = new Matrix4();
  const warmer = deps.createWarmer
    ? deps.createWarmer(destination)
    : createOffscreenSceneWarmer(renderer, scene, destination, CAMERA_DESTINATION_WARM.scale, { samples: deps.samples ?? null });
  const candidates: Array<{ object: Object3D; d2: number }> = [];
  let batches: Object3D[][] = [];
  let batchIndex = 0;
  let focusUntil = -Infinity;
  let focused = false;

  const releaseFocus = (): void => {
    if (!focused) return;
    focused = false;
    deps.setTerrainStreamFocus?.(null);
  };

  return {
    prepare(position, lookAt, durationS) {
      if (position.distanceTo(camera.position) < CAMERA_DESTINATION_WARM.minHopM) return;
      destination.fov = camera.fov;
      destination.aspect = camera.aspect;
      destination.near = camera.near;
      destination.far = camera.far;
      destination.layers.mask = camera.layers.mask;
      destination.position.copy(position);
      destination.lookAt(lookAt);
      destination.updateProjectionMatrix();
      destination.updateMatrixWorld(true);
      projection.multiplyMatrices(destination.projectionMatrix, destination.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      // the destination's view: every visible renderable its frustum holds (or that draws whatever any frustum holds),
      // nearest first, bounded
      candidates.length = 0;
      scene.traverseVisible((object) => {
        if (!isRenderable(object) || !object.layers.test(destination.layers)) return;
        if (object.frustumCulled && !frustum.intersectsObject(object as Parameters<Frustum['intersectsObject']>[0])) return;
        const e = object.matrixWorld.elements;
        const dx = e[12] - position.x, dy = e[13] - position.y, dz = e[14] - position.z;
        candidates.push({ object, d2: dx * dx + dy * dy + dz * dz });
      });
      candidates.sort((a, b) => a.d2 - b.d2);
      const chosen = candidates.slice(0, CAMERA_DESTINATION_WARM.maxObjects);
      batches = [];
      for (let i = 0; i < chosen.length; i += CAMERA_DESTINATION_WARM.batchObjects) {
        batches.push(chosen.slice(i, i + CAMERA_DESTINATION_WARM.batchObjects).map((c) => c.object));
      }
      candidates.length = 0;
      batchIndex = 0;
      focusUntil = now() + (Math.max(0, durationS) + CAMERA_DESTINATION_WARM.focusTailS) * 1000;
      focused = true;
      deps.setTerrainStreamFocus?.(position);
    },
    update() {
      if (batchIndex < batches.length) {
        const batch = batches[batchIndex++]!;
        // an object removed since the destination was chosen (a wreck cleared, a hidden opponent) is not drawn
        const live = batch.filter((object) => object.parent !== null);
        if (live.length) {
          try { renderBatchAlone(scene, destination, live, warmer); } catch { /* its first live frame draws it, as before */ }
        }
        if (batchIndex >= batches.length) batches = [];
      }
      if (focused && batchIndex >= batches.length && now() >= focusUntil) releaseFocus();
    },
    cancel() {
      batches = [];
      batchIndex = 0;
      releaseFocus();
    },
    get pendingBatches() { return Math.max(0, batches.length - batchIndex); },
    dispose() {
      batches = [];
      releaseFocus();
      warmer.dispose();
    },
  };
}
