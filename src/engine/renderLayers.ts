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
 * Round 28 (2026-09-20, owner: "shadows look weird on tanks"): a per-cascade
 * caster policy. Three renders every shadow-casting light in one
 * `shadowMap.render(lights, …)` call, so nothing could change which objects
 * cast between one cascade and the next. When a policy is installed the router
 * renders the lights one at a time and lets the policy flip caster flags around
 * each cascade (near hulls cast their real armour into the cascade that covers
 * them, the convex proxies everywhere else). Without a policy — and for a
 * single light, which is what the deployment shadow warm renders — the call
 * stays exactly the one three makes. Round 78: the per-cascade caster masks (`setShadowCasterCascades`) split the
 * lights the same way, with or without a policy.
 */
export interface ShadowCascadePolicy {
  beforeLight(light: Object3D, cascadeIndex: number): void;
  afterLight(light: Object3D, cascadeIndex: number): void;
}

const cascadeIndexByShadowCamera = new WeakMap<Camera, number>();
let shadowCascadePolicy: ShadowCascadePolicy | null = null;

/**
 * Round 78 (2026-09-26, the performance lane): casters that render into a SUBSET of the cascades. Three draws every
 * caster into every cascade's map; a caster sized to one cascade (the cloud layer's shadow gobos: one plane per
 * cascade, so four planes cost sixteen draws — each plane rasterised into every map) or one whose shadow cannot
 * read past the near cascades registers a bit mask of cascade indices here and the router hides it around every
 * other cascade's pass. Held weakly: a discarded world's owners fall out of the list as they are met. The list is
 * rebuilt on registration only, so the per-frame walk allocates nothing.
 */
const shadowCasterCascadeMask = new WeakMap<Object3D, number>();
let shadowCasterCascadeRefs: WeakRef<Object3D>[] = [];
const hiddenForCascade: Object3D[] = [];

/** Register (or with `null` forget) the cascades `object` casts into, as a bit mask of cascade indices. */
export function setShadowCasterCascades(object: Object3D, mask: number | null): void {
  if (mask === null) {
    shadowCasterCascadeMask.delete(object);
    shadowCasterCascadeRefs = shadowCasterCascadeRefs.filter((ref) => { const o = ref.deref(); return o !== undefined && o !== object; });
    return;
  }
  if (!shadowCasterCascadeMask.has(object)) shadowCasterCascadeRefs.push(new WeakRef(object));
  shadowCasterCascadeMask.set(object, mask);
}

/** The registered cascade mask of a caster, or null when it casts into every cascade. */
export function shadowCasterCascadesOf(object: Object3D): number | null {
  return shadowCasterCascadeMask.get(object) ?? null;
}

/** The registered cascade index of a shadow camera (the argument three hands `onBeforeShadow`), or -1. */
export function shadowCascadeIndexOfCamera(shadowCamera: Camera): number {
  return cascadeIndexByShadowCamera.get(shadowCamera) ?? -1;
}

/** Hide every masked caster that does not cast into `cascadeIndex`; dead references are pruned as met. */
function hideCastersOutsideCascade(cascadeIndex: number): void {
  if (cascadeIndex < 0 || shadowCasterCascadeRefs.length === 0) return;
  const bit = 1 << cascadeIndex;
  let write = 0;
  for (let i = 0; i < shadowCasterCascadeRefs.length; i++) {
    const ref = shadowCasterCascadeRefs[i];
    const object = ref.deref();
    if (object === undefined) continue;
    shadowCasterCascadeRefs[write++] = ref;
    const mask = shadowCasterCascadeMask.get(object);
    if (mask === undefined || (mask & bit) !== 0 || !object.visible) continue;
    object.visible = false;
    hiddenForCascade.push(object);
  }
  shadowCasterCascadeRefs.length = write;
}

function restoreHiddenCasters(): void {
  for (let i = hiddenForCascade.length - 1; i >= 0; i--) hiddenForCascade[i].visible = true;
  hiddenForCascade.length = 0;
}

/** Tell the router which cascade a light's shadow camera renders (lighting.ts registers the CSM lights). */
export function registerShadowCascadeCamera(shadowCamera: Camera, cascadeIndex: number): void {
  cascadeIndexByShadowCamera.set(shadowCamera, cascadeIndex);
}

/** The registered cascade index of a shadow-casting light, or -1 for an unregistered light. */
export function shadowCascadeIndexOf(light: Object3D): number {
  const shadowCamera = (light as { shadow?: { camera?: Camera } }).shadow?.camera;
  return shadowCamera ? cascadeIndexByShadowCamera.get(shadowCamera) ?? -1 : -1;
}

export function setShadowCascadePolicy(policy: ShadowCascadePolicy | null): void {
  shadowCascadePolicy = policy;
}

export function getShadowCascadePolicy(): ShadowCascadePolicy | null {
  return shadowCascadePolicy;
}

function renderShadowLights(
  render: ShadowMapRouter['render'], lights: Object3D[], scene: Scene, camera: Camera,
): void {
  const policy = shadowCascadePolicy;
  if ((!policy && shadowCasterCascadeRefs.length === 0) || lights.length < 2) {
    render(lights, scene, camera);
    return;
  }
  const single: Object3D[] = [lights[0]];
  for (const light of lights) {
    const cascadeIndex = shadowCascadeIndexOf(light);
    single[0] = light;
    policy?.beforeLight(light, cascadeIndex);
    hideCastersOutsideCascade(cascadeIndex);
    try {
      render(single, scene, camera);
    } finally {
      restoreHiddenCasters();
      policy?.afterLight(light, cascadeIndex);
    }
  }
}

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
      renderShadowLights(render, lights, scene, camera);
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
