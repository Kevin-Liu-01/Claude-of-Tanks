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

/**
 * Round 79 (2026-09-28, the performance lane): caster PROFILES — what the router cannot see from a mesh and three
 * never asks: how tall its content is, where its pieces or instances stand, and for the near-tier casters how far
 * from the camera they reach. `engine/shadowCasterProfiles.ts` evaluates every profile once per frame against the
 * live cascades (their texel size, sampled range and frustum) and writes the answer here as a DYNAMIC mask; the
 * router hides a caster around a cascade's pass when its static mask (`setShadowCasterCascades`) or its dynamic mask
 * excludes it. A profile is retained by reference so its owner updates it in place (its reach every frame, its
 * spheres on a rebuild) without re-registering; everything is held weakly, like the masks.
 */
export interface ShadowCasterProfile {
  /** Content height, metres; 0 or absent never masks by shadow footprint. */
  heightM?: number;
  /** World-space content spheres, x y z r per sphere; absent: the object's own bounds decide, as three does. */
  spheres?: Float32Array | null;
  /** Derive the spheres from an InstancedMesh's instances (kept in step with its instance matrices). */
  instanced?: boolean;
  /** Near-tier content: the farthest planar camera distance its pieces stand at this frame, metres; absent: no reach rule. */
  reachM?: number;
}
/** Every cascade index bit (the dynamic mask of a caster that has not been evaluated yet). */
export const SHADOW_CASTER_ALL_CASCADES = 0x3fffffff;
const shadowCasterProfile = new WeakMap<Object3D, ShadowCasterProfile>();
const shadowCasterDynamicMask = new WeakMap<Object3D, number>();
const shadowCasterListed = new WeakSet<Object3D>();

function listShadowCaster(object: Object3D): void {
  if (shadowCasterListed.has(object)) return;
  shadowCasterListed.add(object);
  shadowCasterCascadeRefs.push(new WeakRef(object));
}

/** Drop a caster from the router's list once it carries neither a mask nor a profile. */
function unlistShadowCasterIfBare(object: Object3D): void {
  if (shadowCasterCascadeMask.has(object) || shadowCasterDynamicMask.has(object) || shadowCasterProfile.has(object)) return;
  shadowCasterListed.delete(object);
  shadowCasterCascadeRefs = shadowCasterCascadeRefs.filter((ref) => { const o = ref.deref(); return o !== undefined && o !== object; });
}

/** Register (or with `null` forget) a caster's profile; the object is retained by reference and read every frame. */
export function setShadowCasterProfile(object: Object3D, profile: ShadowCasterProfile | null): void {
  if (profile === null) {
    shadowCasterProfile.delete(object);
    shadowCasterDynamicMask.delete(object);
    unlistShadowCasterIfBare(object);
    return;
  }
  shadowCasterProfile.set(object, profile);
  listShadowCaster(object);
}

export function shadowCasterProfileOf(object: Object3D): ShadowCasterProfile | null {
  return shadowCasterProfile.get(object) ?? null;
}

/** Walk the registered profiles (dead references are pruned as met); the callback must not register or forget. */
export function forEachShadowCasterProfile(visit: (object: Object3D, profile: ShadowCasterProfile) => void): void {
  let write = 0;
  for (let i = 0; i < shadowCasterCascadeRefs.length; i++) {
    const ref = shadowCasterCascadeRefs[i];
    const object = ref.deref();
    if (object === undefined) continue;
    shadowCasterCascadeRefs[write++] = ref;
    const profile = shadowCasterProfile.get(object);
    if (profile !== undefined) visit(object, profile);
  }
  shadowCasterCascadeRefs.length = write;
}

/** The evaluator's answer for this frame: the cascade index bits the caster draws into (`null` clears it). */
export function setShadowCasterDynamicMask(object: Object3D, mask: number | null): void {
  if (mask === null) {
    shadowCasterDynamicMask.delete(object);
    unlistShadowCasterIfBare(object);
    return;
  }
  shadowCasterDynamicMask.set(object, mask);
  listShadowCaster(object);
}

export function shadowCasterDynamicMaskOf(object: Object3D): number | null {
  return shadowCasterDynamicMask.get(object) ?? null;
}

/**
 * A mask bit meaning "the LAST cascade only" — resolved against the light set at render time, so a world that
 * cannot know the tier's cascade count (three on the phones, four on the desktop) can still say "the far map":
 * the horizon ring's near forest stands 440 m and more from the battlefield, where only the far cascade reaches.
 */
export const SHADOW_CASTER_LAST_CASCADE = 1 << 30;

/** Register (or with `null` forget) the cascades `object` casts into, as a bit mask of cascade indices. */
export function setShadowCasterCascades(object: Object3D, mask: number | null): void {
  if (mask === null) {
    shadowCasterCascadeMask.delete(object);
    unlistShadowCasterIfBare(object);
    return;
  }
  shadowCasterCascadeMask.set(object, mask);
  listShadowCaster(object);
}

/** The registered cascade mask of a caster, or null when it casts into every cascade. */
export function shadowCasterCascadesOf(object: Object3D): number | null {
  return shadowCasterCascadeMask.get(object) ?? null;
}

/** The registered cascade index of a shadow camera (the argument three hands `onBeforeShadow`), or -1. */
export function shadowCascadeIndexOfCamera(shadowCamera: Camera): number {
  return cascadeIndexByShadowCamera.get(shadowCamera) ?? -1;
}

/**
 * Hide every masked caster that does not cast into `cascadeIndex` (of `cascadeCount`); dead references are pruned as
 * met. A caster is shown when its static mask (or the absence of one) AND its dynamic mask (or the absence of one)
 * both admit the cascade; a profile awaiting its first evaluation is left alone.
 */
function hideCastersOutsideCascade(cascadeIndex: number, cascadeCount: number): void {
  if (cascadeIndex < 0 || shadowCasterCascadeRefs.length === 0) return;
  const bit = (1 << cascadeIndex) | (cascadeIndex === cascadeCount - 1 ? SHADOW_CASTER_LAST_CASCADE : 0);
  let write = 0;
  for (let i = 0; i < shadowCasterCascadeRefs.length; i++) {
    const ref = shadowCasterCascadeRefs[i];
    const object = ref.deref();
    if (object === undefined) continue;
    shadowCasterCascadeRefs[write++] = ref;
    if (!object.visible) continue;
    const mask = shadowCasterCascadeMask.get(object);
    const dynamic = shadowCasterDynamicMask.get(object);
    if ((mask === undefined || (mask & bit) !== 0) && (dynamic === undefined || (dynamic & bit) !== 0)) continue;
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

/**
 * 2026-10-02 (the frame-budget lane): the static shadow-caster cache (engine/shadowStaticCache.ts) renders a cascade
 * as its cached static depth plus the dynamic casters drawn on top; `false` from it means "render this light the
 * ordinary way". It runs inside the per-light loop, after the policy's flips and the cascade masks, so both passes see
 * exactly the caster set the ordinary render would.
 */
interface ShadowCascadeCache {
  renderCascade(
    renderer: WebGLRenderer, render: (lights: Object3D[], scene: Scene, camera: Camera) => void, single: Object3D[],
    light: Object3D, cascadeIndex: number, scene: Scene, camera: Camera,
  ): boolean;
}
let shadowCascadeCache: ShadowCascadeCache | null = null;

export function setShadowCascadeCache(cache: ShadowCascadeCache | null): void {
  shadowCascadeCache = cache;
}

export function getShadowCascadePolicy(): ShadowCascadePolicy | null {
  return shadowCascadePolicy;
}

function renderShadowLights(
  renderer: WebGLRenderer, render: ShadowMapRouter['render'], lights: Object3D[], scene: Scene, camera: Camera,
): void {
  const policy = shadowCascadePolicy;
  const cache = shadowCascadeCache;
  if ((!policy && !cache && shadowCasterCascadeRefs.length === 0) || lights.length < 2) {
    render(lights, scene, camera);
    return;
  }
  const single: Object3D[] = [lights[0]];
  for (const light of lights) {
    const cascadeIndex = shadowCascadeIndexOf(light);
    single[0] = light;
    policy?.beforeLight(light, cascadeIndex);
    hideCastersOutsideCascade(cascadeIndex, lights.length);
    try {
      if (!cache?.renderCascade(renderer, render, single, light, cascadeIndex, scene, camera)) render(single, scene, camera);
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

const zeroCountRouted = new WeakSet<WebGLRenderer>();

/**
 * Round 78 (2026-09-26, the performance lane): an InstancedMesh whose count is zero when it reaches
 * `renderBufferDirect` costs three the whole program / uniform / binding-state setup before
 * `renderInstances` returns on `primcount === 0`. The r8 cascade caster proxies (lighting.ts) and every
 * proxied owner rely on count zero to sit out the cascades that are not theirs — hundreds of such setups a
 * frame on a forest map by the round-78 shadow census — so the router returns before the setup. Three would
 * have drawn nothing; the draw-call counter never counted these.
 */
export function routeZeroCountDraws(renderer: WebGLRenderer): void {
  if (zeroCountRouted.has(renderer) || typeof renderer.renderBufferDirect !== 'function') return;
  const direct = renderer.renderBufferDirect;
  const routed: WebGLRenderer['renderBufferDirect'] = function (this: WebGLRenderer, camera, scene, geometry, material, object, group) {
    const drawn = object as { isInstancedMesh?: boolean; count?: number; isBatchedMesh?: boolean; _multiDrawCount?: number };
    if (drawn.isInstancedMesh && drawn.count === 0) return;
    // Round 79: a BatchedMesh whose per-object culling (its onBeforeShadow / onBeforeRender, run before this call)
    // left nothing in its multi-draw list — three's renderMultiDraw returns on a zero draw count after the same
    // setup. The articulated proxy batch is one always-submitted object per hull (frustumCulled off, its entries
    // culled per cascade inside the hook), so every hull outside a cascade's box, and every near hull whose
    // proxies the detail policy hid, reached here with an empty list: 28 such submissions a frame at Monsoon
    // Ridge's centre-far pose, where the three separate proxies used to be culled before submission.
    if (drawn.isBatchedMesh && drawn._multiDrawCount === 0) return;
    return direct.call(this, camera, scene, geometry, material, object, group);
  };
  renderer.renderBufferDirect = routed;
  zeroCountRouted.add(renderer);
}

/**
 * Three filters shadow casters against the presentation camera's layers, not
 * the light's internal shadow camera. Temporarily expose the proxy layer only
 * while WebGLShadowMap traverses; restore the exact mask before the forward
 * renderer sees the scene.
 */
export function routeShadowOnlyLayer(renderer: WebGLRenderer): void {
  routeZeroCountDraws(renderer);
  const shadowMap = renderer.shadowMap as ShadowMapRouter;
  if (shadowMap.__cotShadowOnlyRouted) return;
  const render = shadowMap.render.bind(shadowMap);
  const routed = (lights: Object3D[], scene: Scene, camera: Camera): void => {
    const mask = camera.layers.mask;
    const scope = shadowWarmScopes.get(camera);
    let completed = false;
    camera.layers.enable(SHADOW_ONLY_LAYER);
    try {
      renderShadowLights(renderer, render, lights, scene, camera);
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
