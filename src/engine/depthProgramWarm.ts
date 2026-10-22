/**
 * depthProgramWarm.ts — the rare warm's depth-program pass (the far cascade's casters, one cohort a step), demand-loaded
 * with the combat warm runtime (it moved out of engine/deploymentShadowWarm.ts, which the game entry carries, 2026-10-19).
 *
 * Every render uses the production scene, lights, casters and cascade maps. (2026-10-19, black-screen-228 RC3) The rare
 * warm runs between a revealed battle's frames, so each cohort is one synchronous transaction: the far cascade's 520 m
 * box, the frozen sibling cascades and the hidden roots last one warm render, every live frame between the steps samples
 * the production cascades, and the far map is redrawn at its own pose (a rate-capped cascade's projection stays paired
 * with the depth map rendered from it). The warm's last word is a fresh live map for every cascade.
 */
import type { DirectionalLight, Object3D, OrthographicCamera, Scene } from 'three';

export interface DepthProgramWarmOptions {
  /** The cascades (lighting.csm.lights): the last one is the far cascade the warm renders through. */
  lights: readonly DirectionalLight[];
  scene: Scene;
  warmRender(): unknown;
  worldGroup: Object3D | null;
}

function holdsLight(root: Object3D): boolean {
  let found = false;
  root.traverse((object) => { if ((object as Object3D & { isLight?: boolean }).isLight) found = true; });
  return found;
}

/** The scene's visible content roots: no light, no root holding one, no camera. */
function contentRoots(scene: Scene): Object3D[] {
  return scene.children.filter((candidate) => candidate.visible !== false
    && !(candidate as Object3D & { isCamera?: boolean }).isCamera && !holdsLight(candidate));
}

export function* warmDepthProgramSteps({ lights, scene, warmRender, worldGroup }: DepthProgramWarmOptions): Generator<void, void, void> {
  const light = lights[lights.length - 1];
  if (!light?.shadow) return;
  const shadowCamera = light.shadow.camera as OrthographicCamera;
  const roots = contentRoots(scene);
  const renderRoot = (root: Object3D, visibleChildren: Set<Object3D> | null = null): void => {
    const { left, right, top, bottom, near, far } = shadowCamera;
    const autoUpdate = light.shadow.autoUpdate;
    const siblings = lights.filter((sibling) => sibling !== light && sibling.shadow)
      .map((sibling) => [sibling.shadow, sibling.shadow.autoUpdate, sibling.shadow.needsUpdate] as const);
    const hidden: Object3D[] = [];
    try {
      for (const [shadow] of siblings) shadow.autoUpdate = shadow.needsUpdate = false;
      shadowCamera.left = shadowCamera.bottom = -520;
      shadowCamera.right = shadowCamera.top = 520;
      shadowCamera.near = 0.5;
      shadowCamera.far = 1_600;
      shadowCamera.updateProjectionMatrix();
      light.shadow.autoUpdate = false;
      for (const candidate of roots) {
        if (candidate !== root && candidate.visible) { candidate.visible = false; hidden.push(candidate); }
      }
      if (visibleChildren) {
        for (const child of root.children) {
          if (!visibleChildren.has(child) && child.visible) { child.visible = false; hidden.push(child); }
        }
      }
      light.shadow.needsUpdate = true;
      warmRender();
    } catch {
      // The following live shadow render remains the compatibility fallback.
    } finally {
      for (const object of hidden) object.visible = true;
      Object.assign(shadowCamera, { left, right, top, bottom, near, far });
      shadowCamera.updateProjectionMatrix();
      light.shadow.autoUpdate = autoUpdate;
      light.shadow.needsUpdate = true;
      for (const [shadow, siblingAutoUpdate, needsUpdate] of siblings) {
        shadow.autoUpdate = siblingAutoUpdate;
        shadow.needsUpdate = needsUpdate;
      }
    }
  };

  try {
    for (const root of roots) {
      if (root === worldGroup && root.children.length > 1) {
        const visible = root.children.filter((child) => child.visible !== false);
        const cohortSize = Math.max(1, Math.ceil(visible.length / 4));
        for (let index = 0; index < visible.length; index += cohortSize) {
          renderRoot(root, new Set(visible.slice(index, index + cohortSize)));
          yield;
        }
      } else {
        renderRoot(root);
        yield;
      }
    }
  } finally {
    for (const each of lights) if (each.shadow) each.shadow.needsUpdate = true;
  }
}
