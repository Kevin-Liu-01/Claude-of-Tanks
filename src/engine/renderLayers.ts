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

interface RoutedShadowMap {
  renderer: WebGLRenderer;
  render: ShadowMapRouter['render'];
}

interface ShadowWarmScope {
  renderer: WebGLRenderer;
  shadowMap: ShadowMapRouter;
  casterMask: number;
}

const routedShadowMaps = new WeakMap<ShadowMapRouter, RoutedShadowMap>();
const shadowWarmScopes = new WeakMap<Camera, ShadowWarmScope>();

/**
 * Suppress forward submissions for one synchronous, explicitly owned warm
 * render. Keep the presentation mask through light/LOD collection; the router
 * mutes it only after native shadow traversal. Unknown/replaced routers retain
 * the ordinary render path. Neither camera hooks nor renderer methods change.
 */
export function renderShadowOnlyWarm(
  renderer: WebGLRenderer, camera: Camera, render: () => void,
): void {
  const mask = camera.layers.mask;
  const previous = shadowWarmScopes.get(camera);
  const shadowMap = renderer.shadowMap as ShadowMapRouter;
  const route = routedShadowMaps.get(shadowMap);
  const casterMask = previous?.casterMask ?? mask;
  if (route?.renderer === renderer && route.render === shadowMap.render) {
    shadowWarmScopes.set(camera, { renderer, shadowMap, casterMask });
  } else {
    // A nested fallback cannot borrow its caller's suppression ownership.
    shadowWarmScopes.delete(camera);
  }
  camera.layers.mask = casterMask;
  try {
    render();
  } finally {
    camera.layers.mask = mask;
    if (previous) shadowWarmScopes.set(camera, previous);
    else shadowWarmScopes.delete(camera);
  }
}

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
  const routed = (lights: Object3D[], scene: Scene, camera: Camera): void => {
    const mask = camera.layers.mask;
    const scope = shadowWarmScopes.get(camera);
    let completed = false;
    camera.layers.enable(SHADOW_ONLY_LAYER);
    try {
      render(lights, scene, camera);
      completed = true;
    } finally {
      const ownsScope = completed && scope && shadowWarmScopes.get(camera) === scope
        && scope.renderer === renderer && scope.shadowMap === shadowMap
        && renderer.shadowMap === shadowMap && shadowMap.render === routed;
      camera.layers.mask = ownsScope ? 0 : mask;
    }
  };
  shadowMap.render = routed;
  routedShadowMaps.set(shadowMap, { renderer, render: routed });
  shadowMap.__cotShadowOnlyRouted = true;
}
