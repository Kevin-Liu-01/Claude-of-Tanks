// src/engine/shadowCasterProfiles.ts — round 79 (2026-09-28, the performance lane): the per-frame evaluation of the
// shadow caster PROFILES registered on the router (renderLayers.ts `setShadowCasterProfile`). Three rasterises every
// caster into every cascade whose light-space box its bounding sphere touches, and a merged bucket or an instanced
// kind spread over the map touches all of them whatever the box actually holds; a caster a metre tall casts a
// shadow the far map's texels cannot resolve; the near tree tier stands within a few hundred metres of the camera
// and its shadows cannot reach a cascade whose sampled range starts beyond them. Three laws, evaluated once per
// frame against the live cascades (their scheduled frusta, texel size and sampled range) and written back as each
// caster's dynamic mask; the router hides the caster around the passes the mask excludes. Every law is
// conservative: a caster is hidden only where it cannot change a sampled texel.
//
// 1. CONTENT: a caster whose registered world spheres (a bucket's piece cells, an InstancedMesh's instances) all
//    miss a cascade's frustum is hidden there. The instance spheres are derived from the instance matrices and
//    refreshed when they change (destructibles break by zero-scaling a slot; the pole LOD repacks its instances).
// 2. FOOTPRINT: a caster whose ground shadow (height / tan(sun elevation)) spans fewer than SHADOW_FOOTPRINT_MIN_TEXELS
//    of a cascade's map is hidden there — the PCF kernel is wider than that, so the texels it could darken read as
//    noise. A low sun lengthens every shadow and lifts the rule by itself.
// 3. REACH: a near-tier caster (its owner reports the farthest planar camera distance its pieces stand at this frame)
//    is hidden from a cascade whose sampled range starts beyond that distance plus its shadow footprint and a margin.
//    Three's CSM with `fade` samples a cascade from its break start x less the fade half-margin 0.125·x² (CSMShader:
//    margin = 0.25·closestEdge², csmx = x − margin / 2; linearDepth = viewZ / (shadowFar − cameraNear)).
import { Frustum, Matrix4, Sphere, Vector3, type InstancedMesh, type Object3D } from 'three';
import {
  forEachShadowCasterProfile, setShadowCasterDynamicMask, shadowCasterDynamicMaskOf, SHADOW_CASTER_ALL_CASCADES,
  type ShadowCasterProfile,
} from './renderLayers.ts';
import { csmFadeMargin } from './shadowCascadeLayout.ts';

/** A ground shadow shorter than this many texels of a cascade's map cannot survive its PCF kernel. */
export const SHADOW_FOOTPRINT_MIN_TEXELS = 2;
/** Reach margin, metres: a crown's own spread past its trunk and one cascade-fit step. */
export const SHADOW_REACH_MARGIN_M = 8;
/** Under this sun elevation (~2°) shadows run to the horizon: the footprint and reach laws never hide anything. */
export const SHADOW_LAW_MIN_SUN_ELEVATION_RAD = 0.035;

export interface ShadowCascadeSample {
  /** The cascade renders this frame; otherwise its mask bit keeps last frame's value (the map is not redrawn). */
  scheduled: boolean;
  /** The cascade's shadow frustum (null when not scheduled or unknown: the content law is skipped). */
  frustum: Frustum | null;
  /** Light-space texel size, metres (0 or less: the footprint law is skipped). */
  texelM: number;
  /** The view depth from which this cascade's map is sampled, metres. */
  sampledFromM: number;
}

interface ShadowCasterEvaluation {
  readonly cascades: readonly ShadowCascadeSample[];
  /** The sun's elevation above the horizon, radians. */
  readonly sunElevationRad: number;
}

/**
 * The view depth from which three's CSM samples cascade i whose break starts at fraction `breakStart` of
 * (far − near): with `fade` the fragment test is `linearDepth >= x − margin(x) / 2` — three's margin 0.25·x², widened
 * near the camera by the lane's law (2026-10-09, overhaul r2: shadowCascadeLayout.ts csmFadeMargin, patched into the CSM
 * chunk by lighting.ts) — without it `linearDepth >= x`.
 */
export function csmSampledFromM(breakStart: number, near: number, far: number, fade: boolean, fadeK = 0): number {
  const x = Math.max(0, breakStart);
  return (fade ? x - csmFadeMargin(x, fadeK) / 2 : x) * Math.max(0, far - near);
}

/** The ground shadow length of a caster `heightM` tall under a sun at `sunElevationRad` (Infinity under the law's floor). */
export function shadowFootprintM(heightM: number, sunElevationRad: number): number {
  if (!(heightM > 0)) return 0;
  if (!(sunElevationRad >= SHADOW_LAW_MIN_SUN_ELEVATION_RAD)) return Infinity;
  return heightM / Math.tan(sunElevationRad);
}

interface InstanceSpheres { version: number; count: number; spheres: Float32Array; }
const instanceSpheres = new WeakMap<Object3D, InstanceSpheres>();
const _sphere = new Sphere();
const _matrix = new Matrix4();
const _centre = new Vector3();

/** World spheres of an InstancedMesh's instances, rebuilt when its matrices or count changed; null without a geometry sphere. */
export function instanceShadowSpheres(mesh: InstancedMesh): { spheres: Float32Array; count: number } | null {
  const geometry = mesh.geometry;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere;
  if (!bounds) return null;
  const count = Math.max(0, Math.min(mesh.count, mesh.instanceMatrix.count));
  let record = instanceSpheres.get(mesh);
  if (!record || record.spheres.length < count * 4) {
    record = { version: -1, count: -1, spheres: new Float32Array(Math.max(count, mesh.instanceMatrix.count) * 4) };
    instanceSpheres.set(mesh, record);
  }
  if (record.version !== mesh.instanceMatrix.version || record.count !== count) {
    const matrices = mesh.instanceMatrix.array;
    const out = record.spheres;
    for (let i = 0; i < count; i++) {
      _matrix.fromArray(matrices, i * 16).premultiply(mesh.matrixWorld);
      _centre.copy(bounds.center).applyMatrix4(_matrix);
      out[i * 4] = _centre.x;
      out[i * 4 + 1] = _centre.y;
      out[i * 4 + 2] = _centre.z;
      out[i * 4 + 3] = bounds.radius * _matrix.getMaxScaleOnAxis();
    }
    record.version = mesh.instanceMatrix.version;
    record.count = count;
  }
  return { spheres: record.spheres, count };
}

function anySphereInFrustum(frustum: Frustum, spheres: Float32Array, count: number): boolean {
  for (let i = 0; i < count; i++) {
    _sphere.center.set(spheres[i * 4], spheres[i * 4 + 1], spheres[i * 4 + 2]);
    _sphere.radius = spheres[i * 4 + 3];
    if (frustum.intersectsSphere(_sphere)) return true;
  }
  return false;
}

/** The cascade index bits a caster with `profile` draws into under `evaluation`, starting from `previous` (unscheduled cascades keep their bit). */
export function evaluateShadowCasterMask(
  object: Object3D, profile: ShadowCasterProfile, evaluation: ShadowCasterEvaluation, previous: number,
): number {
  const cascades = evaluation.cascades;
  const footprint = shadowFootprintM(profile.heightM ?? 0, evaluation.sunElevationRad);
  let mask = previous;
  let content: { spheres: Float32Array; count: number } | null | undefined;
  for (let i = 0; i < cascades.length && i < 30; i++) {
    const cascade = cascades[i];
    if (!cascade.scheduled) continue;
    const bit = 1 << i;
    let shown = true;
    if (footprint > 0 && cascade.texelM > 0 && footprint < SHADOW_FOOTPRINT_MIN_TEXELS * cascade.texelM) shown = false;
    if (shown && profile.reachM !== undefined && footprint > 0
      && profile.reachM + SHADOW_REACH_MARGIN_M + footprint < cascade.sampledFromM) shown = false;
    if (shown && cascade.frustum) {
      if (content === undefined) {
        content = profile.instanced && (object as InstancedMesh).isInstancedMesh
          ? instanceShadowSpheres(object as InstancedMesh)
          : profile.spheres ? { spheres: profile.spheres, count: profile.spheres.length >> 2 } : null;
      }
      if (content && !anySphereInFrustum(cascade.frustum, content.spheres, content.count)) shown = false;
    }
    mask = shown ? mask | bit : mask & ~bit;
  }
  return mask;
}

/** Evaluate every registered profile for this frame; returns the number of casters evaluated. */
export function evaluateShadowCasterProfiles(evaluation: ShadowCasterEvaluation): number {
  let evaluated = 0;
  forEachShadowCasterProfile((object, profile) => {
    evaluated++;
    const previous = shadowCasterDynamicMaskOf(object) ?? SHADOW_CASTER_ALL_CASCADES;
    const mask = evaluateShadowCasterMask(object, profile, evaluation, previous);
    if (mask !== previous || shadowCasterDynamicMaskOf(object) === null) setShadowCasterDynamicMask(object, mask);
  });
  return evaluated;
}
