import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

/**
 * Layer reserved for geometry that contributes only to native shadow maps.
 *
 * Three does not expose a `shadowOnly` render flag. A colorWrite-disabled
 * material still traverses and submits geometry during the forward scene
 * pass, so authored proxy hulls used to consume draw calls and vertex work
 * even though they could not change a color or depth pixel. Shadow cameras
 * opt into this layer; presentation cameras deliberately do not.
 */
export const SHADOW_ONLY_LAYER = 29;

export function markShadowOnly<T extends Object3D>(object: T): T {
  object.layers.set(SHADOW_ONLY_LAYER);
  object.userData.shadowOnly = true;
  return object;
}

type ShadowMapRouter = WebGLRenderer['shadowMap'] & {
  render: (lights: Object3D[], scene: Scene, camera: Camera) => void;
  __cotShadowOnlyRouted?: boolean;
};

/**
 * Three filters shadow casters against the presentation camera's layers, not
 * the light's internal shadow camera. Temporarily expose the proxy layer only
 * while WebGLShadowMap traverses; restore the exact mask before the forward
 * renderer sees the scene.
 */
export function routeShadowOnlyLayer(renderer: WebGLRenderer): void {
  const shadowMap = renderer.shadowMap as ShadowMapRouter;
  if (shadowMap.__cotShadowOnlyRouted) return;
  const render = shadowMap.render.bind(shadowMap);
  shadowMap.render = (lights: Object3D[], scene: Scene, camera: Camera): void => {
    const mask = camera.layers.mask;
    camera.layers.enable(SHADOW_ONLY_LAYER);
    try {
      render(lights, scene, camera);
    } finally {
      camera.layers.mask = mask;
    }
  };
  shadowMap.__cotShadowOnlyRouted = true;
}
