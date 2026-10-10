/**
 * lighting.ts — sun (cascaded shadow maps) + hemisphere bounce light.
 *
 * Implements docs/history/research/graphics-aaa.md §2–§3 and ARCHITECTURE.md §3.1.2.
 * The CSM module owns the sun DirectionalLights — nothing else in the game may
 * add a second directional sun. CSM is constructed synchronously inside
 * `createLighting` (never deferred) so it patches the lighting shader chunks
 * before any lit material compiles.
 */
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { CSMFrustum } from 'three/examples/jsm/csm/CSMFrustum.js';
import { getDeviceTier, getPreset, onPresetChange } from './quality.ts';
import {
  canDormantShadowCascades,
  createShadowRefreshScheduler,
  resolveShadowPrimeCount,
} from './shadowRefresh.ts';
import { debugModeRequested } from '../dev/debugIntent.ts';
import {
  SHADOW_OPACITY,
  SHADOW_RECEIVER_ONLY_BIAS_M,
  shadowDepthBiasForTexel,
  shadowNormalBiasForTexel,
  snapShadowCoordinate,
} from './shadowStability.ts';
import { createShadowFitCache } from './shadowFitCache.ts';
import { registerShadowCascadeCamera, setShadowCascadeCache, setShadowCascadePolicy } from './renderLayers.ts';
import type { ShadowStaticCache } from './shadowStaticCache.ts';
import { csmSampledFromM, evaluateShadowCasterProfiles, type ShadowCascadeSample } from './shadowCasterProfiles.ts';
import {
  cascadeRangesFromBreaks, createNearVehicleShadowPolicy, type CascadeRange, type NearVehicleShadowPolicy,
} from './nearVehicleShadowDetail.ts';
import { primeShadowCascades, type ShadowPrimeOptions } from './shadowPrime.ts';
import {
  GROUND_BOUNCE_GLSL_PARS, GROUND_BOUNCE_GLSL_TERM, WALL_SKY_LIFT_LEGACY, applyGroundBounceRig, attachGroundBounceUniforms,
  createGroundBounceUniforms, terrainWallSkyLift,
} from './groundBounce.ts';
import { currentPostLightFxQuery, resolvePostLightFx } from './postLightFxPolicy.ts';
import {
  CLOUD_SHADE_PARS_GLSL, CLOUD_SHADE_SAMPLER_BUDGET, attachCloudShadeUniforms, createCloudShadeUniforms, physicalParsWithoutDfgLut,
  programTextureUnits,
} from './cloudShadeMap.ts';
import type { PublishedLightRig } from './contactShadows.ts';
import { authoredSunOf, lightTune, resolveLightModel, type LightModel, type LightModelPreset } from './lightModelCore.ts';
import type { AtmosphereParams } from './atmosphere.ts';
import { bindMaterialEnvIntensity } from './materialEnvIntensity.ts';

/** What sky.ts publishes on scene.userData.atmosphere that the grounded light model reads (sky.ts AtmospherePublishedState). */
interface AtmosphereLightInputs {
  active?: boolean;
  skyView?: THREE.Texture | null;
  params?: AtmosphereParams | null;
  irradianceRaw?: THREE.Color | null;
}

/** setSun's preset: the sky preset fields the rig reads (a map's sky block, the Garage trim, a weather preset). */
type SunPreset = LightModelPreset & { sunIntensity?: number; sunColorHex?: number; hemiIntensity?: number; fillIntensity?: number };

interface ShadowDebugOptions {
  noCull?: boolean;
  forceAll?: boolean;
  freezeMask?: number;
  /** Round 28: keep every hull on its convex proxies (A/B probes for the near-hull detail casters). */
  noVehicleDetail?: boolean;
  /** 2026-10-02: render every caster into every cascade every frame (the static-caster cache off; A/B probes). */
  noStaticCache?: boolean;
  /** 2026-10-04: every cascade on the old single depth bias, 0.40 m along the sun ray (A/B probes for the per-cascade
   *  bias); read where the biases are applied, so a probe sets it and calls updateFrustums(). */
  legacyBias?: boolean;
}

declare global {
  interface Window {
    __SHADOW_DEBUG?: ShadowDebugOptions;
  }
}

type MaterialCompileHook = THREE.Material['onBeforeCompile'];

type CsmShaderOwner = Pick<CSM, 'shaders'>;

type CsmRegisteredMaterial = Pick<THREE.Material, 'defines' | 'needsUpdate'> & {
  onBeforeCompile?: MaterialCompileHook;
};

type ExtendedCsm = CSM & {
  _initCascades(): void;
  _updateShadowBounds(): void;
};

const CASCADES = 4;
// Battlefield establishing shots read objects out to ~500 m; with the clearer
// exp2 fog (sky.ts) shadows must hold that far or buildings/trees float.
// Shadow range and per-cascade map sizes come from the graphics preset. Every
// desktop preset shares the same stable 2048/1024 layout and 520 m range, and
// the projection below snaps each cascade to its actual texel grid. All active
// cascades refresh from the same presented-frame timestamp; mixing full-rate
// near maps with 20 Hz far maps made tree/building shadows step and flash in
// cascade fades. `update(true)` still forces transition settling explicitly.
const FAR_CASCADE_START = 2;
const _stableCameraToLight = new THREE.Matrix4();
const _stableLightOrientation = new THREE.Matrix4();
const _stableLightOrientationInverse = new THREE.Matrix4();
const _stableLightFrustum = new CSMFrustum({ webGL: true });
const _stableBounds = new THREE.Box3();
const _stableCenter = new THREE.Vector3();
const _stableOrigin = new THREE.Vector3();
const _stableUp = new THREE.Vector3(0, 1, 0);
const _stableDesiredCenters: THREE.Vector3[] = [];

/**
 * Allocation-free CSM refit with per-cascade texel snapping.
 * Three's stock CSM.update() divides every cascade extent by the single
 * csm.shadowMapSize value. Our quality ladder deliberately mixes 4096/2048
 * (down to 1024/512 on mobile), so the stock path moves the far projection
 * in half-texel increments and makes its shadows shimmer as the camera moves.
 * @returns {number} bit mask of cascades whose desired snapped pose changed
 */
function prepareStableCascades(csm: CSM): number {
  const camera = csm.camera;
  _stableLightOrientation.lookAt(_stableOrigin, csm.lightDirection, _stableUp);
  _stableLightOrientationInverse.copy(_stableLightOrientation).invert();
  _stableCameraToLight.multiplyMatrices(_stableLightOrientationInverse, camera.matrixWorld);

  let changedMask = 0;
  for (let i = 0; i < csm.frustums.length; i++) {
    const light = csm.lights[i];
    const shadow = light.shadow;
    const shadowCam = shadow.camera;
    const texelWidth = (shadowCam.right - shadowCam.left) / Math.max(1, shadow.mapSize.x);
    const texelHeight = (shadowCam.top - shadowCam.bottom) / Math.max(1, shadow.mapSize.y);
    csm.frustums[i].toSpace(_stableCameraToLight, _stableLightFrustum);

    _stableBounds.makeEmpty();
    for (let j = 0; j < 4; j++) {
      _stableBounds.expandByPoint(_stableLightFrustum.vertices.near[j]);
      _stableBounds.expandByPoint(_stableLightFrustum.vertices.far[j]);
    }

    _stableBounds.getCenter(_stableCenter);
    _stableCenter.z = _stableBounds.max.z + csm.lightMargin;
    _stableCenter.x = snapShadowCoordinate(_stableCenter.x, texelWidth);
    _stableCenter.y = snapShadowCoordinate(_stableCenter.y, texelHeight);
    _stableCenter.applyMatrix4(_stableLightOrientation);

    let desired = _stableDesiredCenters[i];
    if (!desired) {
      desired = new THREE.Vector3();
      _stableDesiredCenters[i] = desired;
    }
    desired.copy(_stableCenter);
    if (light.position.distanceToSquared(desired) > 1e-12) {
      changedMask |= 1 << i;
    }
  }
  return changedMask;
}

/** Apply prepared light poses only to cascades whose depth map renders now. */
function applyStableCascadePoses(csm: CSM, mask: number): void {
  for (let i = 0; i < csm.lights.length; i++) {
    if (!(mask & (1 << i))) continue;
    const desired = _stableDesiredCenters[i];
    if (!desired) continue;
    const light = csm.lights[i];
    light.position.copy(desired);
    light.target.position.copy(desired).add(csm.lightDirection);
  }
}

// The old single depth bias, normalised over the CSM lights' depth range (three's CSM keeps lightNear 1 and lightFar
// 2000, so it came to 0.40 m along the sun ray on every cascade). The constructor still takes it; each cascade then
// gets its own (applyShadowNormalBias, shadowStability.ts shadowDepthBiasForTexel), and __SHADOW_DEBUG.legacyBias
// restores this one for A/B probes.
const SHADOW_BIAS = -0.0002;
// The receiver-only materials' share of their own shadow terms (RECEIVER_ONLY_SHADOW_NOTE): 1, the 2 cm bias and no
// normal offset; 0 under __SHADOW_DEBUG.legacyBias, the cascade's terms as every material had them.
const receiverOnlyShadowUniform = { value: 1 };
// r4 penumbra: r185's PCF getShadow() is a 5-tap Vogel disk rotated per-pixel
// by interleaved gradient noise, and its disk radius comes straight from
// `shadow.radius` (in shadow-map texels). The default 1.0 produced razor-hard
// edges at every distance ("single untuned shadow map" read). Radii widen per
// cascade — a cheap PCSS-style distance-widening approximation.
// r5: [2.2, 3.0, 3.6, 4.2] → [1.3, 1.7, 2.1, 2.5] — pole/tree shadows read as
// "extremely wide, over-blurred dark stripes" and the tank shadow had no
// crisp contact core. Penumbra width must track occluder thickness, not
// drown it: near-cascade contact shadows now stay tight under the hull, and
// the far cascades (bumped to 4096 in quality.ts so their texels shrank 2x)
// keep a modest distance softening instead of a smear.
// r6: [1.3, 1.7, 2.1, 2.5] → [1.5, 2.2, 3.0, 3.8] — the r5 values swung too
// tight: fence/pole shadows read "uniformly hard at every distance, no
// penumbra widening". Cascade 0 keeps a near-crisp contact core (1.5 texels
// on a 4096 map is ~2 cm of penumbra); the widening now roughly DOUBLES per
// cascade band, the PCSS-style distance ramp, and cascades 1-2 run at 4096
// (quality.ts) so even 3.0 texels stays a soft edge, not a smear.
// r5 (critique: "the player tank's cast shadow edge shows stair-step
// shadow-map aliasing at standard chase distance"): cascade 0/1 radii
// 1.5/2.2 → 2.1/2.7 — the 5-tap Vogel disk at 1.5 texels leaves visible
// per-texel steps on a 4096 map at chase range; ~2.1 texels is the smallest
// radius whose rotated taps fully bridge a texel edge (soft, not smeared —
// the r5 "over-blurred stripes" failure started at ~3+ texels near).
// r6 ("shadow edges uniformly hard at every distance — fence/pole shadows
// show no penumbra widening" + "blotchy amorphous canopy-shadow masses"):
// cascades 0/1 widen (2.1/2.7 → 2.4/3.1) so the near-to-mid penumbra step is
// actually visible on fence/pole shadows, while cascade 2 TIGHTENS (3.2 →
// 2.9) so mid-range canopy shadow masses keep structured, readable edges
// instead of smearing amorphous. Physical penumbra still widens per cascade
// (cascade texel size roughly doubles each band), so the PCSS-style distance
// ordering is preserved.
// r2 ("shadow softness is inconsistent within a single frame: poles/fences
// crisp while adjacent tree canopies smear into amorphous soft blobs"):
// cascade texel size roughly doubles per band, so the PHYSICAL penumbra
// already widens with distance (the PCSS-style cue) even at a near-constant
// texel radius. The old ladder [2.4, 3.1, 2.9, 3.4] additionally widened the
// FILTER by up to 40% band-to-band — same-distance casters straddling a
// cascade seam got visibly different softness, and mid-range canopy masses
// (cascade 1-2) blurred far past the pole shadows beside them. Near-flat
// texel radii keep one coherent softness law: penumbra grows with distance
// only through texel size, not through per-band filter jumps.
// r4 LP2 ("hero tanks cast no ground shadow in staged shots"): root-caused
// with cascade-isolation + hoist probes — the vehicle shadow IS rendered and
// correctly placed, but at the staged low-elevation sun-side cameras its
// contact region is self-occluded and the visible run reads as a soft
// detached band the eye files under "fence shadow". Two owned levers make it
// read as THE TANK'S shadow: cascade 0 tightens 2.2 → 1.6 texels (a crisp
// contact core at closeup range — 1.6 texels on the 4096/75 m cascade-0 box
// is ~3 cm of penumbra, still above the r5 stair-step floor of ~1.4 at this
// box size) and SHADOW_AMBIENT_DIM deepens below so the shadow body holds a
// clear step against lit road after ACES. Cascade 1 follows (2.6 → 2.3) to
// keep the softness ladder monotonic without a band-to-band jump.
const SHADOW_RADII = [1.6, 2.3, 2.6, 2.8];
// Sun occlusion also removes part of the open-sky and bounce contribution.
// Keep that older cool shadow response: it grounds tanks, trees and buildings
// at gameplay distance without lowering the scene's ambient light globally.
const SHADOW_AMBIENT_DIM = [0.80, 0.88, 1.0];
// 2026-10-03 (the skies-and-atmosphere lane; the gauntlet's wave 0: grass in a tank's shadow rendered indigo): that
// cool dim is the legacy rig's. The grounded rig's shade is lit by the sky light itself (its IBL, groundBounce.ts
// uCotSkyChroma), so it dims neutrally at the same luminance — painting the sky's blue in a second time turned the
// shade under a hull indigo on straw and teal on grass. The dim rides a shared uniform (uCotShadowDim, applyGroundBounce).
const SHADOW_AMBIENT_DIM_LUMA = 0.2126 * SHADOW_AMBIENT_DIM[0] + 0.7152 * SHADOW_AMBIENT_DIM[1] + 0.0722 * SHADOW_AMBIENT_DIM[2];
const SHADOW_AMBIENT_SPEC_DIM = 0.55;
// 2026-10-03 (the shade-fill lane; the gauntlet's waves 34 and 36: a shaded village wall and a granite tor's shaded sides
// near black): the dims above apply where the cascades shade a face turned toward the sun — the occluder hides that
// face's sun-side sky, the circumsolar light — never to a face turned from the sun, which stands in its own shade: no
// occluder hides any of its sky, and its environment light (taken with its own normal) already leaves out the sun's
// side. 1 = the grounded rig keeps the dims to sun-facing faces (groundBounce.ts uCotShadowFacing); the legacy rig 0.
const SHADOW_DIM_FACING = 1;
// 2026-10-04 (the skies lane; the gauntlet's wave 82 on Titan Gorge: "crisp, hard-edged shadows" under a closed deck):
// the dims above stand for the circumsolar sky an occluder hides. A closed deck's light comes from every direction alike,
// so a cascade's shadow under it hides no more than the occluder's own small solid angle: the dims fade with the
// overcast, this share of it (1: none left at a closed deck; the legacy rig keeps them whole). With the deck's beam cut
// (lightModel.ts OVERCAST_DIRECT_CUT) a closed deck's cast shadow is the few per cent of light the sun still sends.
const SHADOW_DIM_OVERCAST = 1;
// r8 stable PCF: the old pseudo-PCSS multiplier expanded a five-tap kernel
// as far as 14 texels. Five samples cannot cover that disk, so wide shadows
// resolved as a visible hatch/cross pattern and crawled because its rotation
// was keyed to screen pixels. Keep the physically widening CSM cascade radii
// themselves, use one deterministic Vogel orientation per cascade (patched
// below), and guarantee a small antialiasing footprint even on 1024/512
// mobile maps.
// This removes three blocker probes and their divergent radius too: cleaner
// edges for fewer texture reads on every device tier.
const MIN_FILTER_RADIUS_TEXELS = 1.25;
// The radii above are tuned in TEXELS of these reference map sizes (ultra's
// ladder). When a quality preset allocates a smaller map for a cascade, the
// texel is proportionally larger — an uncompensated radius would widen the
// physical penumbra right back into the r5 "over-blurred dark stripes"
// failure. Scale each cascade's radius by (size / reference) so the PHYSICAL
// penumbra width is identical on every preset; only texture resolution drops.
// (At ultra, size == reference on every cascade — the compensation is a no-op
// and the screenshot-contract dpr-1 captures are bit-identical.)
const SHADOW_RADII_REF_SIZES = [4096, 4096, 4096, 2048];
// Key-to-fill ratio is THE readability lever: the warm sun must dominate the
// cool sky ambient ~7-8:1 so cast shadows and form shading actually register
// after ACES. Pixel-measured on the battlefield shot: at 3.2/0.26/0.45 the
// lit:shadow luma ratio on open grass was only ~1.3:1 (shadows read as faint
// smudges); at 4.2/0.14/0.22 it lands ~2.3:1 — the WoT footage ballpark.
// Ambient fill lives in hemi (below) + sky.ts ENV_INTENSITY.
const SUN_INTENSITY = 4.5;
const SUN_COLOR = 0xfff1dc; // warm noon-afternoon key
const HEMI_SKY_COLOR = 0xaac8f5; // cool sky fill against the warm key
const HEMI_GROUND_COLOR = 0x94815f; // r5: +6% ground-bounce (foliage shadow floor)
// r3 rebalance: fill shifted FROM the omnidirectional IBL (sky.ts
// ENV_INTENSITY 0.28 → 0.20 — omni fill is what flattened building/hull form
// at midrange) TO the hemisphere (0.20 → 0.32), whose sky-above/ground-below
// split keeps form shading directional: shadowed faces go cooler AND darker
// instead of just dimmer. Sun 4.2 → 4.5 keeps the key:fill ratio ~3:1+ and
// lifts the amorphous near-black canopy-shadow masses out of the crushed
// range (they read as artifacts, not shade, at hemi 0.2).
// r6: 0.32 → 0.36 — with the punchier grade S-curve (post.ts GRADE_CONTRAST
// 1.34) canopy-shadow interiors were crushing to structureless near-black
// masses ("blotchy dark patch" read); a small hemisphere lift keeps color and
// grass detail alive inside shade while the key:fill ratio stays ~2:1 on
// open ground after ACES.
const HEMI_INTENSITY = 0.36;
// r7 ("player tank is a near-black green silhouette — vehicle materials
// clearly receive no hemisphere/IBL contribution"): pixel-measured on the
// frozen player_view frame, the shadowed hull flank sat at 0.09 display luma
// vs 0.21 lit grass — hemisphere fill was too weak for any object inside a
// cast shadow to keep its albedo readable. ADDITIVE bounce floor rather than
// a multiplier: map presets override hemiIntensity (verdant 0.32, winter
// 0.92), and a multiplier would blow out the already ambient-dominated
// overcast maps while barely moving the sunny ones. +0.12 models the
// sky<->ground multiple-bounce term the single hemisphere layer misses;
// sunny maps gain ~35% ambient (shadow interiors + hull flanks lift out of
// black), winter gains only ~13%.
// r5 ("foliage on the left third crushes to near-black — no ambient floor in
// tree shadow cores"): +0.12 → +0.15, paired with a slightly lighter ground
// pole below — the canopy-shadow interiors need ~15% more bounce to keep
// leaf-color legible without lifting open-ground shadow contrast (the sun:
// fill ratio on open grass moves <4%).
const HEMI_BOUNCE_FLOOR = 0.15;
// lighting_post r7 ("battlefield_desert: the entire valley floor is a milky
// overexposed cream wash — dune and mesa form shadows are nearly absent"):
// the FLAT +0.15 floor nearly doubled desert's art-directed hemi (preset
// 0.20 → effective 0.35) — on 0.85-0.9-albedo sand that ambient share is the
// single biggest form-shading killer. The floor now SCALES with the preset's
// own hemi: maps that asked for a high key:fill ratio (desert 0.20/0.36 →
// ×0.56 → +0.084) keep it, while verdant (0.32 → ×0.89) moves <5% and the
// ambient-dominated overcast maps (winter 0.92 → clamped ×1.0) are
// untouched. The floor's r7 purpose (hull flanks inside cast shadow never
// silhouette) survives — desert hulls sit on bright bounce-lit sand.
function hemiFloorFor(presetHemi: number): number {
  const k = Math.min(1, Math.max(0.5, presetHemi / HEMI_INTENSITY));
  return HEMI_BOUNCE_FLOOR * k;
}
// Backlit-rescue fill: a shadowless DirectionalLight from the anti-sun azimuth
// at ~30° elevation. Sun-shadowed VERTICAL faces (tree canopies, barn walls,
// hay bales seen against the light) currently drop to hemi+IBL only (~5% of
// sky luminance) and render as pure black cutouts in sniper view. A counter
// fill mostly hits exactly those anti-sun-facing surfaces (dot ≈ 0 for
// ground/up-facing geometry), so ground-shadow contrast — the 2.3:1 luma
// ratio tuned above — is preserved while backlit silhouettes lift to ~15-20%.
// CSM-safe: three's CSMShader lights all directionals beyond
// NUM_DIR_LIGHT_SHADOWS through a dedicated non-shadow loop.
const FILL_COLOR = 0xbdd2f2; // same cool-sky family as the hemi
// r3: 1.0 → 0.55. At 1.0 the anti-sun fill lit shadowed building walls and
// hull sides to ~25% of key — the "shadowed faces nearly the same luminance
// as sunlit faces" flatness the critic flagged. 0.55 (with hemi raised to
// 0.32) still lifts backlit canopies/walls out of black but restores a clear
// lit-vs-shaded form step at midrange.
// r6: 0.55 → 0.65 — the closeup orbit cameras sit on the anti-sun side; with
// the deeper grade the shadowed hull flank dropped near-black. 0.65 keeps a
// clear lit-vs-shaded step (r3's flatness came at 1.0) while armor detail on
// the shade side stays readable.
// r7: 0.65 → 0.80 — the player_view hull flank (a vertical anti-sun face
// inside a canopy shadow) measured 0.09 display luma: still a silhouette.
// The fill mostly hits exactly those faces (cos-weighted against verticals),
// so this is the cheapest targeted lift for vehicle readability; ground
// shadow contrast moves <6% (sin 17 deg incidence).
// r5 ("battlefield_urban: building walls facing opposite directions have
// near-identical luminance — no readable sun direction"): 0.80 → 0.66. The
// r7 bump to 0.80 rescued the hull flank, but on architecture it erased the
// lit-vs-shaded wall step that sells the sun at establishing distance. The
// hemisphere bounce floor rose 0.12 → 0.15 in the same pass, so vehicle
// flanks keep their floor while anti-sun facades drop a readable ~20%.
const FILL_INTENSITY = 0.66;
// Low elevation (~17°): vertical anti-sun faces catch ~cos(17°) ≈ 0.96 of the
// fill while up-facing ground only gets sin(17°) ≈ 0.29 — backlit walls and
// canopies lift out of black without flattening ground-shadow contrast.
const FILL_ELEV_Y = 70;
const FILL_HORIZ_M = 230;
/** The legacy environment's share of shadowless sun the PMREM folds from the dome's disc (round 65; contactShadows.ts). */
const LEGACY_ENV_DISC_FILL = 0.5;

type DrawableImage = CanvasImageSource & { width: number; height: number };

function isDrawableImage(value: object | null | undefined): value is DrawableImage {
  if (!value || typeof value !== 'object' ||
      !('width' in value) || typeof value.width !== 'number' ||
      !('height' in value) || typeof value.height !== 'number') return false;
  return (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) ||
    (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) ||
    (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) ||
    (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) ||
    (typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement) ||
    (typeof SVGImageElement !== 'undefined' && value instanceof SVGImageElement) ||
    (typeof VideoFrame !== 'undefined' && value instanceof VideoFrame);
}

function alphaCoverage(data: Uint8ClampedArray, cutoff: number): number {
  let passing = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] >= cutoff) passing++;
  }
  return passing / (data.length / 4);
}

function downsampleCoverageMip(previous: ImageData, size: number): ImageData {
  const current = new ImageData(size, size);
  const source = previous.data;
  const target = current.data;
  const sourceWidth = size * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const topLeft = ((y * 2) * sourceWidth + x * 2) * 4;
      const topRight = topLeft + 4;
      const bottomLeft = topLeft + sourceWidth * 4;
      const bottomRight = bottomLeft + 4;
      const output = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        target[output + channel] = (source[topLeft + channel] + source[topRight + channel] +
          source[bottomLeft + channel] + source[bottomRight + channel] + 2) >> 2;
      }
    }
  }
  return current;
}

function correctMipCoverage(
  image: ImageData,
  targetCoverage: number,
  cutoff: number,
): void {
  if (targetCoverage <= 0 || image.width < 2) return;
  const data = image.data;
  const currentCoverage = alphaCoverage(data, cutoff);
  if (currentCoverage >= targetCoverage * 0.7 && currentCoverage <= targetCoverage * 1.3) return;
  const alphas: number[] = [];
  for (let index = 3; index < data.length; index += 4) alphas.push(data[index]);
  alphas.sort((a, b) => b - a);
  const quantileIndex = Math.min(
    alphas.length - 1,
    Math.max(0, Math.round(targetCoverage * alphas.length) - 1),
  );
  const quantile = Math.max(1, alphas[quantileIndex]);
  for (let index = 3; index < data.length; index += 4) {
    const alpha = cutoff + (data[index] - quantile) * 3;
    data[index] = Math.max(0, Math.min(255, alpha));
  }
}

/**
 * Build a coverage-preserving mip chain for an alpha-tested foliage texture.
 *
 * Default GPU box-filtered mips flatten a cutout card's alpha toward its mean:
 * past a few levels the whole quad's alpha sits on one side of `alphaTest`, so
 * distant grass/leaf cards pop into SOLID RECTANGLES of the flood color (the
 * sniper-view "boxes around every grass billboard" shipping blocker) or vanish
 * entirely. Classic fix (NVIDIA alpha-mipmap technique): per level, remap
 * alpha so the fraction of texels passing the cutoff matches level 0's
 * coverage, keeping the blade/leaf silhouette readable at every distance.
 *
 * @param {THREE.Texture} tex - CanvasTexture with an alpha cutout (square, POT)
 * @param {number} cutoff - the material's alphaTest reference (0..1)
 * @returns {void}
 */
function buildCoverageMipmaps(tex: THREE.Texture, cutoff: number): void {
  const img = tex.image as object | null | undefined;
  if (!isDrawableImage(img)) return;
  if (!img || !img.width || (tex.mipmaps && tex.mipmaps.length > 0)) return;
  const size = img.width;
  if (size !== img.height || (size & (size - 1)) !== 0) return; // square POT only

  const cnv = document.createElement('canvas');
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);
  const level0 = ctx.getImageData(0, 0, size, size);

  const cutByte = Math.round(cutoff * 255);
  const d0 = level0.data;
  const targetCov = alphaCoverage(d0, cutByte);

  const chain = [level0];
  let prev = level0;
  let s = size;
  while (s > 1) {
    s >>= 1;
    const cur = downsampleCoverageMip(prev, s);
    correctMipCoverage(cur, targetCov, cutByte);
    chain.push(cur);
    prev = cur;
  }

  tex.mipmaps = chain;
  tex.generateMipmaps = false;
  tex.anisotropy = Math.max(tex.anisotropy, 8); // sharpen grazing-angle minification
  tex.needsUpdate = true;
}

// 2026-10-02 (the frame-budget lane): the r8 cascade caster proxies live in shadowCasterProxies.ts, imported when the
// first lighting rig is created, outside the boot entry. Until the module has arrived heavy owners cast every instance
// into every cascade — the same maps (a proxy only drops the instances outside its cascade's frustum).
type CasterProxyModule = typeof import('./shadowCasterProxies.ts');
let casterProxies: CasterProxyModule | null = null;
let casterProxiesLoad: Promise<CasterProxyModule | null> | null = null;
function loadCasterProxies(lights: readonly THREE.DirectionalLight[]): void {
  casterProxiesLoad ??= import('./shadowCasterProxies.ts').then((module) => module, () => null);
  void casterProxiesLoad.then((module) => {
    if (!module) return;
    module.registerCasterCascades(lights); // before the first owner meets a hook: an unregistered cascade builds none
    casterProxies = module;
  });
}
/** map.ts freezes the battle world's root after its build: the static shadow layer (shadowStaticCache.ts). */
const isFrozenWorldRoot = (object: THREE.Object3D): boolean => object.userData.matrixTraversalFrozen === true;

// --- r6 SHADOW-CASTER RESCUE (critical: "shadow draw distance ~120m — every
// mid-distance building, silo, hay bale, fence and tree sits on uniformly lit
// ground; a telephone pole 15m away casts nothing") -----------------------
// Root-caused live (tools/tmp-lp6-shadowdiag*.mjs): the casters and receivers
// are all correctly flagged — the failure is that EVERY shadow-map draw that
// goes through WebGLShadowMap's shared MeshDepthMaterial with the default
// BasicDepthPacking renders nothing on this stack (ANGLE Metal + three r185
// native depth-texture shadow maps). Controlled A/B on the live scene:
//   - plain Mesh box, castShadow=true            -> casts NOTHING
//   - same box, customDepthMaterial Basic packing -> casts NOTHING
//   - same box, customDepthMaterial RGBA packing  -> casts correctly
//   - InstancedMesh box (separate program variant)-> casts correctly
// (vegetation leaf cards always cast — their custom depth materials use
// RGBADepthPacking — which is why trees were the ONLY thing shadowing and the
// image read as a ~120 m "shadow horizon" of canopy blobs on grass.)
// The shadow compare samples the map's native DEPTH attachment, so the color
// packing is functionally irrelevant — flipping the depth materials onto the
// proven-good RGBADepthPacking program reroutes every caster (buildings,
// poles, fences, hay bales, vehicle shadow proxies) onto a working pipeline.
// onBeforeShadow runs for every object right before its shadow-pass draw and
// receives the SELECTED depth material (shared singleton, variant clone, or
// custom), so the flip covers all three paths and is a one-time recompile per
// depth-material variant.
function patchShadowDepthPacking(): void {
  const hook: THREE.Mesh['onBeforeShadow'] = function (
    _renderer,
    object,
    _camera,
    shadowCamera,
    _geometry,
    depthMaterial,
  ) {
    if (depthMaterial instanceof THREE.MeshDepthMaterial &&
        depthMaterial.depthPacking !== THREE.RGBADepthPacking) {
      depthMaterial.depthPacking = THREE.RGBADepthPacking;
      depthMaterial.needsUpdate = true;
    }
    // r8 cascade caster proxies (shadowCasterProxies.ts)
    casterProxies?.casterProxyBeforeShadow(object, shadowCamera);
  };
  const afterHook: THREE.Mesh['onAfterShadow'] = function (_renderer, object) {
    casterProxies?.casterProxyAfterShadow(object);
  };
  THREE.Mesh.prototype.onBeforeShadow = hook;
  THREE.SkinnedMesh.prototype.onBeforeShadow = hook;
  THREE.Mesh.prototype.onAfterShadow = afterHook;
  THREE.SkinnedMesh.prototype.onAfterShadow = afterHook;
}

/** 2026-10-03 (cloudShadeMap.ts): a sun cascade's light × the clouds' share, before its shadow. */
const COT_CLOUD_SUN_GLSL = `#if defined( COT_CLOUD_SHADE ) && defined( USE_SHADOWMAP )
					directLight.color *= vCotCloudSun;
#endif`;

let stableShadowSamplingPatched = false;
/** Keep the PCF kernel orientation stable in shadow space during camera motion. */
function patchStableShadowSampling() {
  if (stableShadowSamplingPatched) return;
  stableShadowSamplingPatched = true;

  const declAnchor = 'IncidentLight directLight;';
  const fadeAnchor =
    'directLight.color = mix( prevColor, directLight.color, shouldFadeLastCascade ? ratio : 1.0 );';
  const fadeBlendAnchor =
    'float blendRatio = shouldBlend ? ratio : 1.0;';
  const fadeEndAnchor =
    '\t\t#pragma unroll_loop_end\n\t#elif defined (USE_SHADOWMAP)';
  const noFadeAnchor =
    'if(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y) directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';

  let frag = THREE.ShaderChunk.lights_fragment_begin;
  if (!frag.includes(declAnchor) || !frag.includes(fadeAnchor) ||
      !frag.includes(fadeBlendAnchor) || !frag.includes(fadeEndAnchor) ||
      !frag.includes(noFadeAnchor)) {
    throw new Error('lighting.ts: shadow-density anchors not found in lights_fragment_begin');
  }
  frag = frag.replace(declAnchor, `${declAnchor}
#define COT_SUN_VIS_CAPTURED 1
float cotSunVis = 1.0;
float cotCascadeVis = 1.0;
vec3 cotPrev;`);
  frag = frag.replace(fadeAnchor, `${fadeAnchor}
					cotCascadeVis = directLight.color.g / max( prevColor.g, 1e-4 );`);
  // 2026-10-03 (cloudShadeMap.ts): the clouds' share of the sun, per vertex, on each sun cascade's light before its shadow
  // (the ratio above stays the cascade's own visibility; lights_fragment_end folds the cloud into cotSunVis)
  const fadePrevAnchor = 'vec3 prevColor = directLight.color;';
  if (frag.split(fadePrevAnchor).length !== 2) throw new Error('lighting.ts: cloud-shade anchor not found in lights_fragment_begin');
  frag = frag.replace(fadePrevAnchor, `${COT_CLOUD_SUN_GLSL}
					${fadePrevAnchor}`);
  frag = frag.replace(fadeBlendAnchor, `${fadeBlendAnchor}
					cotSunVis = mix( cotSunVis, cotCascadeVis, blendRatio );`);
  frag = frag.replace(noFadeAnchor, `${COT_CLOUD_SUN_GLSL}
				cotPrev = directLight.color;
				${noFadeAnchor}
				cotSunVis = min( cotSunVis, directLight.color.g / max( cotPrev.g, 1e-4 ) );`);
  // 2026-10-04 (visual/shadow-bias): the receiver-only branch — see RECEIVER_ONLY_SHADOW_NOTE below
  const receiverLightAnchor = 'directionalLightShadow = directionalLightShadows[ i ];';
  const receiverLightParts = frag.split(receiverLightAnchor);
  if (receiverLightParts.length !== 4) throw new Error('lighting.ts: receiver-only anchors not found in lights_fragment_begin');
  frag = receiverLightParts.join(`${receiverLightAnchor}
				#if defined( COT_SHADOW_RECEIVER_ONLY ) && defined( USE_SHADOWMAP )
				directionalLightShadow.shadowBias = mix( directionalLightShadow.shadowBias, COT_RECEIVER_SHADOW_BIAS, uCotReceiverOnly );
				#endif`);
  THREE.ShaderChunk.lights_fragment_begin = frag;

  const endHead = '#if defined( RE_IndirectDiffuse )';
  const end = THREE.ShaderChunk.lights_fragment_end;
  if (!end.includes(endHead)) {
    throw new Error('lighting.ts: shadow-density anchor not found in lights_fragment_end');
  }
  THREE.ShaderChunk.lights_fragment_end = end.replace(endHead, `#if defined( USE_CSM ) && defined( CSM_CASCADES )

	#if defined( COT_CLOUD_SHADE ) && defined( USE_SHADOWMAP )
	cotSunVis *= vCotCloudSun;
	#endif
	// 2026-10-03 (the shade-fill lane; groundBounce.ts uCotShadowFacing): the dim keeps to the faces turned toward the sun
	// (the occluder hides their circumsolar sky); a solid face turned from the sun keeps its whole sky. The grass and leaf
	// cards (alpha to coverage, no OPAQUE) keep the dim: inside a crown or a sward the cards hide each other's sky
	float cotAmbVis = cotSunVis;
	#ifdef OPAQUE
	if ( uCotShadowFacing > 0.0 ) {
		vec3 cotNf = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
		cotAmbVis = 1.0 - ( 1.0 - cotSunVis ) * mix( 1.0, smoothstep( -0.05, 0.25, dot( cotNf, uCotBounceSun ) ), uCotShadowFacing );
	}
	// 2026-10-04 (groundBounce.ts uCotShadowDepth): under a closed deck a solid occluder hides no circumsolar sky (the
	// cards keep the dim under any sky: inside a crown or a sward they hide each other's)
	cotAmbVis = 1.0 - ( 1.0 - cotAmbVis ) * uCotShadowDepth;
	#endif
	vec3 cotAmbDim = mix( uCotShadowDim, vec3( 1.0 ), cotAmbVis );

	#if defined( RE_IndirectDiffuse )

		irradiance *= cotAmbDim;
		iblIrradiance *= cotAmbDim;
${GROUND_BOUNCE_GLSL_TERM}
	#endif

	#if defined( RE_IndirectSpecular )

		radiance *= mix( ${SHADOW_AMBIENT_SPEC_DIM.toFixed(3)}, 1.0, cotAmbVis );

	#endif

#endif

${endHead}`);

  // Give each cascade one deterministic five-tap Vogel orientation. The old
  // screen-space seed crawled with the camera; the later shadow-texel seed
  // still changed phase whenever a snapped cascade recentered because the
  // same world point moved to a different local atlas texel. A rotation based
  // only on the cascade's fixed radius cannot change during camera motion or
  // a coherent refresh, while retaining a different orientation for each
  // cascade and the same five-sample cost.
  const penAnchor =
    'float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;';
  const sm = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (!sm.includes(penAnchor)) {
    throw new Error('lighting.ts: penumbra anchor not found in shadowmap_pars_fragment');
  }
  THREE.ShaderChunk.shadowmap_pars_fragment = sm.replace(penAnchor,
    'float phi = fract( shadowRadius * 0.754877666 ) * PI2;');

  // Round 69 (2026-09-24): the ground-bounce uniforms every CSM material carries (groundBounce.ts; the values are
  // attached in setupShadowMaterial), declared once at fragment scope for the term above.
  THREE.ShaderChunk.lights_pars_begin = `#if defined( USE_CSM ) && defined( CSM_CASCADES )
${GROUND_BOUNCE_GLSL_PARS}
#endif
#if defined( COT_CLOUD_SHADE ) && defined( USE_SHADOWMAP )
varying float vCotCloudSun;
#endif
${THREE.ShaderChunk.lights_pars_begin}`;

  // 2026-10-03 (cloudShadeMap.ts): the clouds' share of the sun, fetched per vertex from the one undithered shade map
  // (a cloud shadow is tens to hundreds of metres across; the map's texel 23 m) and carried to the fragment
  THREE.ShaderChunk.shadowmap_pars_vertex = `${THREE.ShaderChunk.shadowmap_pars_vertex}
#if defined( COT_CLOUD_SHADE ) && defined( USE_SHADOWMAP )
${CLOUD_SHADE_PARS_GLSL}
varying float vCotCloudSun;
#endif`;
  THREE.ShaderChunk.shadowmap_vertex = `${THREE.ShaderChunk.shadowmap_vertex}
#if defined( COT_CLOUD_SHADE ) && defined( USE_SHADOWMAP )
	vCotCloudSun = cotCloudSun( worldPosition.xyz );
#endif`;

  // RECEIVER_ONLY_SHADOW_NOTE — 2026-10-04 (the scenery lane, visual/shadow-bias). A material whose meshes never cast
  // (the terrain, and the horizon ring that draws its ground faces with the terrain's material) is never in a depth
  // map, so it cannot shadow itself. It needs neither the cascade's acne depth bias nor the receiver normal offset,
  // and those two together held every ground shadow 0.40 x cos(e) + 0.045 / tan(e) away from its caster: 39 cm under
  // a 35-degree sun, a lit seam round every rock, track and wall, and no shadow under a pebble. Under
  // COT_SHADOW_RECEIVER_ONLY (setupShadowMaterial: material.userData.cotShadowReceiverOnly) the shadow lookup takes
  // the define's own 2 cm bias and no offset; the shared uniform (one value, a name per stage) set to 0 restores the
  // cascade's terms (__SHADOW_DEBUG.legacyBias). The lines go in after the chunks' own: cloudShadeMap's receipt pins
  // shadowmap_vertex's normal-bias line.
  THREE.ShaderChunk.shadowmap_pars_vertex = `${THREE.ShaderChunk.shadowmap_pars_vertex}
#if defined( COT_SHADOW_RECEIVER_ONLY ) && defined( USE_SHADOWMAP )
uniform float uCotReceiverOnlyV;
#endif`;
  THREE.ShaderChunk.shadowmap_pars_fragment = `${THREE.ShaderChunk.shadowmap_pars_fragment}
#if defined( COT_SHADOW_RECEIVER_ONLY ) && defined( USE_SHADOWMAP )
uniform float uCotReceiverOnly;
#endif`;
  const receiverVertexAnchor = '\tvec4 shadowWorldPosition;\n';
  if (THREE.ShaderChunk.shadowmap_vertex.split(receiverVertexAnchor).length !== 2) {
    throw new Error('lighting.ts: receiver-only anchor not found in shadowmap_vertex');
  }
  THREE.ShaderChunk.shadowmap_vertex = THREE.ShaderChunk.shadowmap_vertex.replace(receiverVertexAnchor, `${receiverVertexAnchor}\t#if defined( COT_SHADOW_RECEIVER_ONLY ) && defined( USE_SHADOWMAP )
	shadowWorldNormal *= 1.0 - uCotReceiverOnlyV;
	#endif
`);

  // Round 69: an opaque lit pixel writes 2 + its sun visibility (cotSunVis, captured above) into the scene
  // target's alpha — the canvas is opaque (renderer.ts, alpha false) and opaque draws blend nothing, so the
  // channel is free — and the post aerial pass decodes it to blend the screen-space contact shadows into the
  // shadow term (contactShadows.ts) before restoring an alpha of one. OPAQUE is Three's own define for
  // non-transparent, normally blended, non-alpha-to-coverage materials, so the grass and leaf cards (whose alpha
  // is their coverage), glass and water keep their real alpha, below 1.5 — and the march treats every such pixel
  // as neither a contact receiver nor an occluder: the blades never cast in the cascades either.
  const opaqueAnchor = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
  const opaque = THREE.ShaderChunk.opaque_fragment;
  if (!opaque.includes(opaqueAnchor)) {
    throw new Error('lighting.ts: alpha anchor not found in opaque_fragment');
  }
  THREE.ShaderChunk.opaque_fragment = opaque.replace(opaqueAnchor, `${opaqueAnchor}
#if defined( COT_SUN_VIS_CAPTURED ) && defined( OPAQUE ) && defined( USE_CSM )
gl_FragColor.a = 2.0 + cotSunVis;
#endif`);
}

/**
 * @typedef {object} Lighting
 * @property {CSM} csm - four quality-scaled cascaded shadow maps
 * @property {(mat: THREE.Material, extraHook?: ?Function) => THREE.Material} setupShadowMaterial
 * @property {(mat: ?THREE.Material) => boolean} releaseShadowMaterial
 * @property {(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, options?: object) => Promise<number[]>} primeShadowMaps
 * @property {() => void} update - per-frame `csm.update()`; call AFTER the camera is final
 * @property {() => void} updateFrustums - call on resize / camera fov or aspect change
 * @property {(i: number) => void} setSunIntensity
 * @property {THREE.HemisphereLight} hemi
 */

/**
 * Remove one dead material from Three's long-lived CSM shader registry.
 * CSM only clears this Map when the complete lighting rig is disposed, while
 * battles, showroom tanks, and cached worlds have shorter lifetimes.
 *
 * @param {{shaders?: Map}|null} csm
 * @param {THREE.Material|null} material
 * @returns {boolean} whether a live registration was removed
 */
export function releaseCsmShaderMaterial(
  csm: CsmShaderOwner | null | undefined,
  material: CsmRegisteredMaterial | null | undefined,
): boolean {
  if (!csm?.shaders || !material || typeof material !== 'object') return false;
  if (!csm.shaders.has(material)) return false;
  csm.shaders.delete(material);
  delete material.onBeforeCompile;
  if (material.defines) {
    delete material.defines.USE_CSM;
    delete material.defines.CSM_CASCADES;
    delete material.defines.CSM_FADE;
    delete material.defines.COT_CLOUD_SHADE; // 2026-10-03: the cloud shade rides on the CSM registration (cloudShadeMap.ts)
  }
  material.needsUpdate = true;
  return true;
}

/**
 * Build the full light rig: CSM sun cascades + hemisphere sky/ground bounce.
 * (IBL ambient comes from sky.ts's PMREM environment bake — third layer.)
 *
 * Must be called before any lit material is compiled: CSM globally patches
 * `ShaderChunk.lights_fragment_begin/lights_pars_begin` at construction and
 * program cache keys must stay stable.
 *
 * @param {THREE.Scene} scene - CSM parents its DirectionalLights here
 * @param {THREE.PerspectiveCamera} camera - the gameplay camera (cascade fitting)
 * @param {THREE.Vector3} sunDir - unit vector FROM the origin TOWARD the sun
 * @returns {Lighting}
 */
/** Near-hull detail casters need a desktop tier and a 2K+ near cascade to be worth their draws. */
function nearVehicleDetailAllowedFor(preset: { readonly shadowMapSizes: readonly number[] }): boolean {
  return getDeviceTier() !== 'mobile' && preset.shadowMapSizes[0] >= 2048;
}

/**
 * A receiver-only material's promise, kept where it could break: a mesh that draws it and casts would shadow itself
 * with a 2 cm bias (acne). Its first draw turns the casting off; a dev or QA build (Vite's dev server, or ?debug on a
 * production URL) says so once, naming the mesh, so a terrain-material mesh meant to cast is found rather than hidden.
 * The public build stays quiet; shadowReceiverOnly.selftest proves no shipped mesh reaches it (RECEIVER_ONLY_SHADOW_NOTE).
 */
const guardedReceiverOnlyMaterials = new WeakSet<THREE.Material>();
function receiverOnlyGuardSpeaks(): boolean {
  return import.meta.env?.DEV === true || debugModeRequested();
}
function guardReceiverOnlyMaterial(material: THREE.Material): void {
  if (guardedReceiverOnlyMaterials.has(material)) return;
  guardedReceiverOnlyMaterials.add(material);
  const previous = material.onBeforeRender;
  material.onBeforeRender = function (renderer, scene, camera, geometry, object, group) {
    if (object.castShadow) {
      object.castShadow = false;
      if (receiverOnlyGuardSpeaks()) {
        console.warn(`lighting.ts: ${object.name || object.type} draws a receiver-only shadow material and cast shadows; `
          + 'its casting is turned off (the material carries no acne bias)');
      }
    }
    previous.call(this, renderer, scene, camera, geometry, object, group);
  };
}

export function createLighting(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sunDir: THREE.Vector3,
) {
  const preset = getPreset();
  // Phones use three stable splits over their shorter 260-340 m shadow
  // range. Desktop keeps four out to 700 m. The single mobile far split is
  // refreshed every other frame, matching the existing cadence of each far
  // desktop split while removing one full CSM sampler and allocation.
  const mobileTier = getDeviceTier() === 'mobile';
  const cascadeCount = mobileTier ? 3 : CASCADES;
  const csm = new CSM({
    camera,
    parent: scene,
    cascades: cascadeCount,
    maxFar: preset.shadowMaxFar,
    mode: 'practical',
    shadowMapSize: preset.shadowMapSizes[0],
    shadowBias: SHADOW_BIAS,
    lightDirection: sunDir.clone().negate().normalize(), // CSM wants FROM-sun direction
    lightIntensity: SUN_INTENSITY,
  }) as ExtendedCsm;
  csm.fade = true;
  csm.updateFrustums(); // required after changing fade
  loadCasterProxies(csm.lights);
  for (let i = 0; i < csm.lights.length; i++) registerShadowCascadeCamera(csm.lights[i].shadow.camera, i);
  // Round 28 (2026-09-20, owner: "shadows look weird on tanks"): the nearest hulls cast their real armour
  // into the cascade that covers them instead of their convex proxies (nearVehicleShadowDetail.ts). Desktop
  // tiers only — the phone presets keep the nine-draw proxy budget — and off under __SHADOW_DEBUG.noVehicleDetail.
  let nearVehicleDetailAllowed = nearVehicleDetailAllowedFor(preset);
  const cascadeRangeScratch: CascadeRange[] = [];
  const nearVehiclePolicy: NearVehicleShadowPolicy = createNearVehicleShadowPolicy({
    camera, scene,
    cascadeRanges: () => {
      const far = Math.min(camera.far, csm.maxFar);
      const ranges = cascadeRangesFromBreaks(csm.breaks, camera.near, far);
      cascadeRangeScratch.length = 0;
      for (const r of ranges) cascadeRangeScratch.push(r);
      return cascadeRangeScratch;
    },
    enabled: () => nearVehicleDetailAllowed && !(typeof window !== 'undefined' && window.__SHADOW_DEBUG?.noVehicleDetail),
  });
  setShadowCascadePolicy(nearVehiclePolicy);
  // 2026-10-03: the same near hulls carry the ground's occlusion in the aerial pass (vehicleGroundOcclusion.ts); the
  // selection array is updated in place each frame
  scene.userData.nearVehicles = nearVehiclePolicy.selected;
  // 2026-10-02 (the frame-budget lane, P20): each desktop cascade keeps its static casters' depth and redraws only the
  // dynamic ones while its snapped pose and the static content hold (shadowStaticCache.ts). The module loads with the
  // first battle world (a frozen world root in the scene), outside the boot graph; until it arrives, and if it never
  // does, every cascade renders the ordinary way. Phones keep the plain render: the copies would cost them memory.
  let staticShadowCache: ShadowStaticCache | null = null;
  let staticShadowCacheRequested = mobileTier;
  const requestStaticShadowCache = (): void => {
    staticShadowCacheRequested = true;
    import('./shadowStaticCache.ts').then((module) => {
      staticShadowCache = module.createShadowStaticCache();
      setShadowCascadeCache(staticShadowCache);
    }, () => { /* the ordinary render for the session */ });
  };
  const shadowFitCache = createShadowFitCache();
  const fitLightDirection = [0, 0, 0];
  /** Per-cascade shadow box size held across small fov lerps (see updateFov). */
  const heldCascadeBoxSizes: number[] = [];

  const prepareCurrentCascadeFits = (force = false): number => {
    csm.lightDirection.toArray(fitLightDirection);
    const fitChanged = shadowFitCache.changed({
      cameraWorld: camera.matrixWorld.elements,
      projection: camera.projectionMatrix.elements,
      lightDirection: fitLightDirection,
    }, force);
    if (!fitChanged) return 0;
    return prepareStableCascades(csm);
  };

  // Stabilize the PCF sampling phase and keep the neutral CSM fade capture.
  // CSM's constructor just replaced ShaderChunk.lights_fragment_begin with
  // CSMShader's version; layer a capture of the sun's per-fragment shadow
  // visibility onto it, then scale the indirect terms in lights_fragment_end.
  // Applied ONCE per page load (guarded), before any lit material compiles.
  patchStableShadowSampling();
  // r6: reroute all shadow-map depth draws onto the working RGBA-packing
  // program (see patchShadowDepthPacking above) — restores building/prop/
  // vehicle cast shadows that the broken Basic-packing path was dropping.
  patchShadowDepthPacking();

  /**
   * Keep receiver separation proportional to each physical shadow texel: the normal offset, and the depth bias the
   * cascade's PCF reach needs on a caster face 70 degrees from the sun (2026-10-04; shadowStability.ts
   * shadowDepthBiasForTexel), written in the light's normalised depth. Called after the filter radius is set.
   */
  function applyShadowNormalBias(i: number): void {
    const shadow = csm.lights[i].shadow;
    const span = shadow.camera.right - shadow.camera.left;
    const worldUnitsPerTexel = span / Math.max(1, shadow.mapSize.x);
    shadow.normalBias = shadowNormalBiasForTexel(worldUnitsPerTexel);
    const legacy = typeof window !== 'undefined' && !!window.__SHADOW_DEBUG?.legacyBias;
    const depthRange = Math.max(1e-3, shadow.camera.far - shadow.camera.near);
    // (never more than the old normalised bias: a cascade at the 0.40 m ceiling keeps it exactly)
    shadow.bias = legacy ? SHADOW_BIAS
      : Math.max(SHADOW_BIAS, -shadowDepthBiasForTexel(worldUnitsPerTexel, shadow.radius, shadow.normalBias) / depthRange);
    receiverOnlyShadowUniform.value = legacy ? 0 : 1;
  }

  function applyShadowNormalBiases(): void {
    for (let i = 0; i < csm.lights.length; i++) applyShadowNormalBias(i);
  }

  /** Resize one cascade, retaining every other live map until its own turn. */
  function applyShadowSize(i: number, size: number): void {
    const shadow = csm.lights[i].shadow;
    // physical-penumbra-preserving PCF radius (see SHADOW_RADII_REF_SIZES)
    const ref = SHADOW_RADII_REF_SIZES[Math.min(i, SHADOW_RADII_REF_SIZES.length - 1)];
    shadow.radius = Math.max(
      MIN_FILTER_RADIUS_TEXELS,
      SHADOW_RADII[Math.min(i, SHADOW_RADII.length - 1)] * (size / ref),
    );
    if (shadow.mapSize.x !== size) {
      shadow.mapSize.set(size, size);
      shadowFitCache.invalidate();
      if (shadow.map) {
        shadow.map.dispose();
        shadow.map = null;
      }
    }
    applyShadowNormalBias(i);
    shadow.needsUpdate = true;
  }

  /** Apply all sizes before first render; live switches use the queue below. */
  function applyShadowSizes(sizes: readonly number[]): void {
    for (let i = 0; i < csm.lights.length; i++) {
      applyShadowSize(i, sizes[Math.min(i, sizes.length - 1)]);
    }
    // Retain the public CSM setting for diagnostics/compatibility. Projection
    // snapping is owned by updateStableCascades and uses each shadow.mapSize.
    csm.shadowMapSize = sizes[0];
  }

  for (let i = 0; i < csm.lights.length; i++) {
    csm.lights[i].shadow.radius = SHADOW_RADII[Math.min(i, SHADOW_RADII.length - 1)];
    csm.lights[i].shadow.intensity = SHADOW_OPACITY;
    csm.lights[i].color.setHex(SUN_COLOR);
    // Every cascade is driven explicitly by the coherent scheduler. This keeps
    // telemetry exact while guaranteeing that the near pair remains current on
    // frames which refresh the complete cascade set.
    csm.lights[i].shadow.autoUpdate = false;
    csm.lights[i].shadow.needsUpdate = true; // first frame renders all
  }
  // PERF: per-cascade map size (before the first render allocates the RTs)
  applyShadowSizes(preset.shadowMapSizes);
  let pendingShadowSizes: number[] | null = null;
  let pendingShadowMask = 0;
  let pendingShadowCursor = 0;
  // Live quality switching (settings UI → quality.setPresetName)
  onPresetChange((p) => {
    nearVehicleDetailAllowed = nearVehicleDetailAllowedFor(p);
    lightFx.flags = resolvePostLightFx(p, getDeviceTier(), currentPostLightFxQuery());
    applyGroundBounce();
    // Desktop presets deliberately share one shadow layout, so ordinary
    // quality switching does not disturb live depth maps. Mobile layout
    // changes remain incremental to avoid a one-frame allocation spike.
    pendingShadowSizes = p.shadowMapSizes.slice();
    pendingShadowMask = 0;
    for (let index = 0; index < csm.lights.length; index++) {
      const requested = p.shadowMapSizes[Math.min(index, p.shadowMapSizes.length - 1)];
      if (csm.lights[index].shadow.mapSize.x !== requested) {
        pendingShadowMask |= 1 << index;
      }
    }
    if (!pendingShadowMask) pendingShadowSizes = null;
    pendingShadowCursor = 0;
    csm.shadowMapSize = p.shadowMapSizes[0];
    if (csm.maxFar !== p.shadowMaxFar) {
      csm.maxFar = p.shadowMaxFar;
      csm.updateFrustums();
      shadowFitCache.invalidate();
      applyShadowNormalBiases();
    }
    // A new projection cannot sample the previous static Garage depth maps.
    // Wake the cache even when this choice keeps identical map dimensions.
    staticPresentationDormant = false;
    preservePrimedFrame = false;
    forceAllCascades();
  });
  const shadowScheduler = createShadowRefreshScheduler(csm.lights.length);
  const allCascadeMask = (2 ** csm.lights.length) - 1;
  const continuousCascadeMask = (2 ** Math.min(FAR_CASCADE_START, csm.lights.length)) - 1;
  const farCascadeMask = allCascadeMask & ~continuousCascadeMask;
  let shFrame = 0;
  let lastScheduledMask = 0;
  let lastFitChangedMask = 0;
  // The enclosed garage never exposes the 100-700 m cascade bands. Their
  // redraws can sleep there, but every CSM sampler still participates in the
  // compiled PCF shader. Therefore cold boot must render each native depth map
  // once before dormancy; otherwise strict WebGL2 drivers bind a color
  // fallback to sampler2DShadow and reject every affected scene draw.
  let farCascadeDormant = false;
  // A settled enclosed presentation can reuse its completed shadow maps
  // byte-for-byte. This is stronger than far-cascade dormancy: no caster,
  // camera, or light moved, so even the near pair would only redraw the same
  // depth image. Visible motion or a scene mutation releases the latch and
  // forces every cascade before the next color frame.
  let staticPresentationDormant = false;
  // Any event that can move casters or the cascade fit wholesale — map/sun
  // switch, frustum change, __SHOTS restage — forces two complete redraws so
  // the first stable frame cannot reuse a pre-transition map.
  let forceFrames = 0;
  // A covered battle-entry warm can render the exact current cascade maps in
  // separate offscreen frames. The following default-framebuffer render must
  // consume those maps once instead of immediately redrawing all four in one
  // task; normal live scheduling resumes on the next frame.
  let preservePrimedFrame = false;

  /** Mark every cascade for complete redraw on the next two frames. */
  function forceAllCascades(): void {
    forceFrames = 2;
    staticShadowCache?.invalidate('force');
    shadowScheduler.reset();
    for (let i = FAR_CASCADE_START; i < csm.lights.length; i++) {
      csm.lights[i].shadow.needsUpdate = true;
    }
  }

  function applyFarCascadeDormancy(): void {
    if (!farCascadeDormant) return;
    // Fail open for rendering: `lighting.update(true)` at boot leaves all
    // cascades scheduled, the first post render creates valid DepthTextures,
    // and the following frame begins steady-state garage dormancy. This keeps
    // the repeated far-cascade saving without an invalid first frame.
    if (!canDormantShadowCascades(csm.lights, FAR_CASCADE_START)) return;
    for (let i = FAR_CASCADE_START; i < csm.lights.length; i++) {
      csm.lights[i].shadow.autoUpdate = false;
      csm.lights[i].shadow.needsUpdate = false;
      lastScheduledMask &= ~(1 << i);
    }
  }

  function applyStaticPresentationDormancy(): void {
    if (!staticPresentationDormant) return;
    lastScheduledMask = 0;
    for (const light of csm.lights) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
  }

  const hemi = new THREE.HemisphereLight(
    HEMI_SKY_COLOR, HEMI_GROUND_COLOR, HEMI_INTENSITY + hemiFloorFor(HEMI_INTENSITY));
  scene.add(hemi);
  // Round 69 (2026-09-24): ground bounce (groundBounce.ts) — the shared uniforms every CSM material compiles
  // against, refreshed from the rig below whenever the sun or the preset changes — and the rig the post chain
  // reads for its contact shadows (contactShadows.ts): sun, hemisphere poles and the anti-sun fill.
  const groundBounceUniforms = createGroundBounceUniforms();
  // 2026-10-03 (cloudShadeMap.ts): the cloud shade map's uniforms every CSM material shares (the volumetric layer writes
  // them when it refreshes the map, scene.userData.cloudShadeUniforms); phones take no define (no volumetric layer)
  const cloudShadeOn = !mobileTier;
  const cloudShadeUniforms = createCloudShadeUniforms();
  scene.userData.cloudShadeUniforms = cloudShadeUniforms;
  const lightFx = { flags: resolvePostLightFx(preset, getDeviceTier(), currentPostLightFxQuery()) };
  const lightRig: PublishedLightRig = {
    sunIntensity: SUN_INTENSITY, sunColor: new THREE.Color(SUN_COLOR),
    hemiIntensity: hemi.intensity, hemiSky: hemi.color, hemiGround: hemi.groundColor,
    fillIntensity: FILL_INTENSITY, fillColor: new THREE.Color(FILL_COLOR), fillDir: new THREE.Vector3(0, 1, 0),
    envDiffuseGain: 1, envDiscFill: LEGACY_ENV_DISC_FILL,
  };
  scene.userData.lightRig = lightRig;
  const sunDirWorld = new THREE.Vector3();
  // 2026-10-01: the grounded model's ground (its albedo) and the ground pole the sky light already gives a face
  // turned down (the environment's shaded ground + the deck's reflection), so the bounce adds only the sunlit excess
  let rigModel: LightModel | null = null;
  const groundTone = new THREE.Color();
  const groundPole = new THREE.Color();
  function applyGroundBounce(): void {
    sunDirWorld.copy(csm.lightDirection).negate().normalize();
    const model = rigModel?.mode === 'physical' ? rigModel : null;
    if (model) {
      groundTone.setRGB(model.groundAlbedo[0], model.groundAlbedo[1], model.groundAlbedo[2]);
      const iblDown = Math.PI * model.envIntensity * model.envDiffuseGain;
      groundPole.setRGB(
        model.groundRadiance[0] * iblDown + model.hemiGround[0] * model.hemiIntensity,
        model.groundRadiance[1] * iblDown + model.hemiGround[1] * model.hemiIntensity,
        model.groundRadiance[2] * iblDown + model.hemiGround[2] * model.hemiIntensity,
      );
      groundBounceUniforms.uCotSkyDiffuse.value = model.envDiffuseGain;
      groundBounceUniforms.uCotSkyChroma.value = model.envDiffuseChroma;
      groundBounceUniforms.uCotShadowDim.value.setScalar(SHADOW_AMBIENT_DIM_LUMA);
      // (2026-10-04, the light under a closed deck: the dims fade with the overcast — groundBounce.ts uCotShadowDepth)
      // (2026-10-05: by the deck's closure — in a broken deck's gaps the circumsolar sky is out, and its cells' shade comes
      // through the cloud shade map like a cumulus's)
      groundBounceUniforms.uCotShadowDepth.value = 1 - Math.min(1, Math.max(0, model.overcast * model.deckClosure)) * lightTune('SHADOW_DIM_OVERCAST', SHADOW_DIM_OVERCAST);
      groundBounceUniforms.uCotShadowFacing.value = lightTune('SHADOW_DIM_FACING', SHADOW_DIM_FACING);
      // (2026-10-04: the environment lights a steep face's open sky here: no wall sky lift — groundBounce.ts)
      terrainWallSkyLift.value = lightTune('WALL_SKY_LIFT_GROUNDED', 0);
    } else {
      groundBounceUniforms.uCotSkyDiffuse.value = 1;
      groundBounceUniforms.uCotSkyChroma.value = 1;
      groundBounceUniforms.uCotShadowDim.value.fromArray(SHADOW_AMBIENT_DIM);
      groundBounceUniforms.uCotShadowDepth.value = 1;
      groundBounceUniforms.uCotShadowFacing.value = 0;
      terrainWallSkyLift.value = WALL_SKY_LIFT_LEGACY;
    }
    applyGroundBounceRig(groundBounceUniforms, {
      enabled: lightFx.flags.groundBounce, sunDir: sunDirWorld, sunColor: lightRig.sunColor,
      sunIntensity: lightRig.sunIntensity, groundTone: model ? groundTone : hemi.groundColor,
      hemiGround: model ? groundPole : hemi.groundColor, hemiIntensity: model ? 1 : hemi.intensity,
      ...(model ? { gain: 1 } : {}),
    });
  }
  // Round 65 (2026-09-24): the hemisphere light's sky colour follows the rendered sky. sky.ts publishes the
  // cosine-weighted irradiance of its physically based dome (scene.userData.skyIrradiance, the sky-view LUT's
  // integral); its hue becomes the hemisphere's sky pole at the constant's own luminance, so the authored
  // hemiIntensity and every key:fill ratio above stay exactly as tuned while shaded ground takes the colour
  // of the sky it sits under (the round-42 wall term already reads the fog colour). Without a published
  // irradiance (the mobile tier's Preetham dome) the engine constant stays.
  const hemiSkyConstant = new THREE.Color(HEMI_SKY_COLOR);
  const hemiSkyLuminance = 0.2126 * hemiSkyConstant.r + 0.7152 * hemiSkyConstant.g + 0.0722 * hemiSkyConstant.b;
  function applyHemisphereSkyHue(): void {
    const irradiance = scene.userData.skyIrradiance as THREE.Color | undefined;
    const lum = irradiance ? 0.2126 * irradiance.r + 0.7152 * irradiance.g + 0.0722 * irradiance.b : 0;
    if (!irradiance || !Number.isFinite(lum) || lum <= 1e-6) {
      hemi.color.copy(hemiSkyConstant);
      return;
    }
    hemi.color.copy(irradiance).multiplyScalar(hemiSkyLuminance / lum);
  }

  // Anti-sun sky fill (see FILL_* above): castShadow stays false — it must
  // sort AFTER the CSM cascade lights so the CSM shader treats it as a plain
  // directional light.
  const fill = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY);
  fill.castShadow = false;
  {
    const fx = -sunDir.x;
    const fz = -sunDir.z;
    const fl = Math.hypot(fx, fz) || 1;
    fill.position.set((fx / fl) * FILL_HORIZ_M, FILL_ELEV_Y, (fz / fl) * FILL_HORIZ_M);
  }
  fill.target.position.set(0, 0, 0);
  scene.add(fill);
  scene.add(fill.target);
  // 2026-10-01 (the grounded light model, lightModel.ts): wherever the physically based sky runs — sky.ts built its
  // sky-view LUT before this rig exists (desktop) — the sky's own light, the deck and the ground replace the
  // anti-sun rescue fill, a second unshadowed sun on every backlit face: setSun drives its intensity to zero. The
  // light itself stays in the scene so every lit program keeps one light signature whichever rig a preset resolves
  // to (a zero-intensity directional costs a few ALU per fragment; a signature change recompiles every program).
  const physicalRig = !!(scene.userData.atmosphere as AtmosphereLightInputs | undefined)?.skyView;
  lightRig.fillDir.copy(fill.position).normalize();
  applyGroundBounce();

  function setAllCascadeUpdates(needsUpdate: boolean): void {
    for (const light of csm.lights) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = needsUpdate;
    }
  }

  function consumeDormantOrPrimedFrame(force: boolean): boolean {
    if (staticPresentationDormant && !force && !pendingShadowMask) {
      applyStaticPresentationDormancy();
      return true;
    }
    if (!preservePrimedFrame || force || pendingShadowMask) return false;
    preservePrimedFrame = false;
    lastScheduledMask = 0;
    setAllCascadeUpdates(false);
    applyFarCascadeDormancy();
    return true;
  }

  function consumePendingShadowResize(): number {
    if (!pendingShadowMask || !pendingShadowSizes) return -1;
    for (let offset = 0; offset < csm.lights.length; offset++) {
      const index = (pendingShadowCursor + offset) % csm.lights.length;
      if (!(pendingShadowMask & (1 << index))) continue;
      pendingShadowMask &= ~(1 << index);
      pendingShadowCursor = (index + 1) % csm.lights.length;
      applyShadowSize(index, pendingShadowSizes[Math.min(index, pendingShadowSizes.length - 1)]);
      if (!pendingShadowMask) pendingShadowSizes = null;
      return index;
    }
    return -1;
  }

  function scheduleEveryCascade(): void {
    lastScheduledMask = shadowScheduler.forceMask();
    applyStableCascadePoses(csm, allCascadeMask);
    setAllCascadeUpdates(true);
  }

  function scheduleFrozenCascades(mask: number): void {
    applyStableCascadePoses(csm, allCascadeMask & ~mask);
    for (let index = 0; index < csm.lights.length; index++) {
      const shadow = csm.lights[index].shadow;
      shadow.autoUpdate = false;
      shadow.needsUpdate = !(mask & (1 << index));
      if (shadow.needsUpdate) lastScheduledMask |= 1 << index;
    }
  }

  function scheduleSteadyCascades(step: number, transitionCascade: number): void {
    setAllCascadeUpdates(false);
    lastScheduledMask = shadowScheduler.step(step);
    if (farCascadeDormant && (lastScheduledMask & ~continuousCascadeMask)) {
      lastScheduledMask = continuousCascadeMask;
    }
    if (transitionCascade >= 0) {
      lastScheduledMask = transitionCascade < FAR_CASCADE_START
        ? continuousCascadeMask
        : farCascadeMask;
    }
    applyStableCascadePoses(csm, lastScheduledMask);
    for (let index = 0; index < csm.lights.length; index++) {
      if (lastScheduledMask & (1 << index)) csm.lights[index].shadow.needsUpdate = true;
    }
  }

  function scheduleCascadeFrame(force: boolean, step: number, transitionCascade: number): void {
    lastScheduledMask = 0;
    if (force || forceFrames > 0) {
      if (forceFrames > 0) forceFrames--;
      scheduleEveryCascade();
      if (force) forceFrames = Math.max(forceFrames, 1);
      return;
    }
    const debug = typeof window !== 'undefined' ? window.__SHADOW_DEBUG : null;
    if (debug?.forceAll) {
      scheduleEveryCascade();
      return;
    }
    if (debug?.freezeMask !== undefined) {
      scheduleFrozenCascades(debug.freezeMask | 0);
      return;
    }
    scheduleSteadyCascades(step, transitionCascade);
  }

  function updateLighting(force = false, dt = 1 / 60): void {
    lastFitChangedMask = 0;
    if (consumeDormantOrPrimedFrame(force)) { staticShadowCache?.disarm(); return; }
    preservePrimedFrame = false;
    const transitionCascade = consumePendingShadowResize();
    lastFitChangedMask = prepareCurrentCascadeFits(force);
    shFrame++;
    const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
    const forcedFrame = force || forceFrames > 0;
    scheduleCascadeFrame(force, step, transitionCascade);
    applyFarCascadeDormancy();
    casterProxies?.updateCasterProxies(csm.lights, scene, false);
    nearVehiclePolicy.update();
    evaluateCasterProfiles(false);
    if (!staticShadowCacheRequested && scene.children.some(isFrozenWorldRoot)) requestStaticShadowCache();
    // last: the static content the cascades' copies are checked against includes this frame's caster masks
    staticShadowCache?.beginFrame({ scene, lights: csm.lights, forced: forcedFrame || transitionCascade >= 0,
      enabled: !(typeof window !== 'undefined' && window.__SHADOW_DEBUG?.noStaticCache) });
  }

  /**
   * 2026-10-01: resolve and apply the light (lightModel.ts) for a sky preset — the grounded model on the physically
   * based sky, the authored rig on the Preetham tier and inside the Garage. The Garage is the phase that asked for
   * far-cascade dormancy (an enclosed presentation: setFarCascadeDormant): the sky does not light a sealed bay, so it
   * keeps the rig its showroom lights were tuned with, under the legacy rig's exposure. The model owns
   * scene.environmentIntensity from here (sky.ts sets the same value when it installs an environment).
   */
  let lastSunPreset: SunPreset | null = null;
  function applyRig(opts: SunPreset): void {
    const atmo = scene.userData.atmosphere as AtmosphereLightInputs | undefined;
    const irr = atmo?.irradianceRaw;
    const physical = physicalRig && !farCascadeDormant && !!atmo?.active && !!atmo.params && !!irr;
    const authoredSun = authoredSunOf(opts);
    // (2026-10-05: a deck with gaps casts its cells through the cloud shade map wherever the volumetric layer draws)
    const model = resolveLightModel(opts, physical ? atmo!.params! : null,
      physical ? { irradianceRaw: [irr!.r, irr!.g, irr!.b] } : null, authoredSun, cloudShadeOn && !!scene.userData.volumetricClouds);
    rigModel = model;
    scene.userData.lightModel = model;
    scene.userData.lightEnclosed = farCascadeDormant;
    scene.environmentIntensity = model.envIntensity;
    const intensity = model.mode === 'physical' ? model.sunIntensity : (opts.sunIntensity ?? SUN_INTENSITY);
    const colorHex = opts.sunColorHex ?? SUN_COLOR;
    fill.intensity = model.mode === 'physical' ? 0 : (opts.fillIntensity ?? FILL_INTENSITY);
    csm.lightIntensity = intensity;
    for (let k = 0; k < csm.lights.length; k++) {
      csm.lights[k].intensity = intensity;
      if (model.mode === 'physical') csm.lights[k].color.setRGB(model.sunColor[0], model.sunColor[1], model.sunColor[2]);
      else csm.lights[k].color.setHex(colorHex);
    }
    if (model.mode === 'physical') {
      // the deck's glow from above and its reflection off the ground from below (0 under an open sky)
      hemi.intensity = model.hemiIntensity;
      hemi.color.setRGB(model.hemiSky[0], model.hemiSky[1], model.hemiSky[2]);
      hemi.groundColor.setRGB(model.hemiGround[0], model.hemiGround[1], model.hemiGround[2]);
    } else {
      const presetHemi = opts.hemiIntensity ?? HEMI_INTENSITY;
      hemi.intensity = presetHemi + hemiFloorFor(presetHemi);
      hemi.groundColor.setHex(HEMI_GROUND_COLOR);
      applyHemisphereSkyHue();
    }
    const sun = csm.lightDirection;
    const fx = sun.x, fz = sun.z; // csm.lightDirection points FROM the sun: its xz is the anti-sun azimuth
    const fl = Math.hypot(fx, fz) || 1;
    fill.position.set((fx / fl) * FILL_HORIZ_M, FILL_ELEV_Y, (fz / fl) * FILL_HORIZ_M);
    lightRig.envDiffuseGain = model.mode === 'physical' ? model.envDiffuseGain : 1;
    lightRig.envDiscFill = model.mode === 'physical' ? 0 : LEGACY_ENV_DISC_FILL;
    // round 69: the published rig and the ground bounce follow the preset
    lightRig.sunIntensity = intensity;
    lightRig.sunColor.setHex(colorHex);
    if (model.mode === 'physical') lightRig.sunColor.setRGB(model.sunColor[0], model.sunColor[1], model.sunColor[2]);
    lightRig.hemiIntensity = hemi.intensity;
    lightRig.fillIntensity = fill.intensity;
    lightRig.fillDir.copy(fill.position).normalize();
    applyGroundBounce();
    shadowFitCache.invalidate();
  }

  // Round 79 (2026-09-28, the performance lane): the caster profiles (renderLayers.setShadowCasterProfile) are
  // evaluated against this frame's cascades — the frusta of the cascades that render, each map's texel size and the
  // view depth its map is sampled from under three's CSM fade — and the sun's elevation (engine/shadowCasterProfiles.ts).
  // Desktop tiers only: the phones keep their three cascades exactly as they draw today.
  const profileCascades: ShadowCascadeSample[] = [];
  function evaluateCasterProfiles(all: boolean): void {
    if (mobileTier) return;
    const far = Math.min(camera.far, csm.maxFar);
    const lights = csm.lights;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const shadow = light.shadow;
      const shadowCam = shadow.camera;
      let sample = profileCascades[i];
      if (!sample) { sample = { scheduled: false, frustum: null, texelM: 0, sampledFromM: 0 }; profileCascades[i] = sample; }
      sample.scheduled = all || shadow.needsUpdate;
      if (sample.scheduled) {
        light.updateMatrixWorld();
        light.target.updateMatrixWorld();
        shadow.updateMatrices(light);
        sample.frustum = shadow.getFrustum();
      } else sample.frustum = null;
      sample.texelM = (shadowCam.right - shadowCam.left) / Math.max(1, shadow.mapSize.x);
      sample.sampledFromM = csmSampledFromM(i === 0 ? 0 : csm.breaks[i - 1], camera.near, far, csm.fade);
    }
    profileCascades.length = lights.length;
    // csm.lightDirection points FROM the sun: its -y is the sine of the sun's elevation
    const sunElevationRad = Math.asin(Math.max(-1, Math.min(1, -csm.lightDirection.y)));
    evaluateShadowCasterProfiles({ cascades: profileCascades, sunElevationRad });
  }

  return {
    csm,

    // Allocation-free read used by the deterministic performance probe to
    // correlate a completed frame's renderer counters with its cascade work.
    // Keep the richer getShadowTelemetry() path at HUD cadence only.
    get scheduledMask() { return lastScheduledMask; },

    /** A restored renderer has no depth contents, even when the CPU target
     * objects survived. Cold targets must fail every dormancy/partial-prime
     * readiness check until the complete cascade set has rendered again. */
    invalidateShadowMaps(): void {
      staticPresentationDormant = false;
      preservePrimedFrame = false;
      staticShadowCache?.dispose();
      for (const light of csm.lights) {
        light.shadow.dispose();
        light.shadow.map = null;
        light.shadow.mapPass = null;
      }
      shadowFitCache.invalidate();
      forceAllCascades();
      setAllCascadeUpdates(true);
      lastScheduledMask = allCascadeMask;
    },

    /**
     * Suspend only the long-range shadow-map renders while an enclosed scene
     * is visible. Re-enabling schedules every far cascade behind the caller's
     * covered transition; map resolution and rendered battle quality remain
     * exactly the active graphics preset.
     */
    setFarCascadeDormant(on: boolean): void {
      const next = !!on;
      if (farCascadeDormant === next) return;
      farCascadeDormant = next;
      // 2026-10-01: an enclosed presentation keeps the authored rig; leaving it restores the grounded model
      if (lastSunPreset) applyRig(lastSunPreset);
      if (next) applyFarCascadeDormancy();
      else forceAllCascades();
    },

    /**
     * Freeze every shadow submission while a visible presentation is proven
     * static. Existing depth maps remain bound, so the color result is exact;
     * releasing the latch forces a complete refresh before motion resumes.
     */
    setStaticPresentationDormant(on: boolean): void {
      const next = !!on;
      if (staticPresentationDormant === next) {
        if (next) applyStaticPresentationDormancy();
        return;
      }
      staticPresentationDormant = next;
      if (next) applyStaticPresentationDormancy();
      else forceAllCascades();
    },

    /**
     * Render the exact current CSM maps one cascade per browser frame. Cold
     * WebGL sessions otherwise allocate every native depth target and link
     * every caster program inside the first full scene render. The maps are
     * identical; only their covered submission schedule changes.
     */
    async primeShadowMaps(
      renderer2: THREE.WebGLRenderer,
      scene2: THREE.Scene,
      camera2: THREE.Camera,
      {
        yieldBeforeCascade = null,
        cascadeLimit = csm.lights.length,
        signal,
        isCurrent,
        casterWarmup,
      }: ShadowPrimeOptions = {},
    ): Promise<number[]> {
      signal?.throwIfAborted();
      if (!renderer2?.shadowMap || !scene2 || !camera2) return [];
      // Partial priming is safe only after every omitted native depth target
      // exists and the far bands are explicitly dormant. Otherwise fail open
      // to a complete pass so sampler2DShadow bindings stay valid.
      const primeCount = resolveShadowPrimeCount(
        csm.lights,
        cascadeLimit,
        farCascadeDormant,
      );
      // A failed new transaction cannot reuse an earlier priming receipt.
      preservePrimedFrame = false;
      const info = renderer2.info;
      const shadowMap = renderer2.shadowMap;
      const gl = renderer2.getContext();
      casterProxies?.updateCasterProxies(csm.lights, scene2, true); // the primed maps must see the same caster sets
      evaluateCasterProfiles(true);
      const timings = await primeShadowCascades({
        renderer: renderer2, scene: scene2, camera: camera2,
        lights: csm.lights, count: primeCount, yieldBeforeCascade, signal, isCurrent, casterWarmup,
      });
      signal?.throwIfAborted();
      // Revalidate the await handoff even for Garage callers without a lease.
      if (renderer2.info !== info || renderer2.shadowMap !== shadowMap || gl.isContextLost()) {
        throw new Error('shadow_prime_context_changed');
      }
      if (isCurrent?.() === false) throw new Error('shadow_prime_stale');
      preservePrimedFrame = true;
      forceFrames = 0;
      shadowScheduler.reset();
      lastScheduledMask = 0;
      return timings;
    },

    /**
     * Reuse freshly rendered cascade maps for exactly one normal frame. The
     * caller must have rendered every cascade from the same camera/scene pose
     * while its transition remained opaque.
     */
    preservePrimedCascadesForNextFrame(): void {
      preservePrimedFrame = true;
      forceFrames = 0;
      shadowScheduler.reset();
      lastScheduledMask = 0;
      for (const light of csm.lights) {
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = false;
      }
    },

    /**
     * Register a material for cascaded shadows, then (optionally) chain a
     * custom `onBeforeCompile` shader-injection hook AFTER the CSM hook —
     * the required wrap pattern from graphics-aaa.md §3, since
     * `csm.setupMaterial` assigns `material.onBeforeCompile` itself.
     *
     * @param {THREE.Material} mat - any lit material (MeshStandardMaterial etc.)
     * @param {?((shader: object, renderer: THREE.WebGLRenderer) => void)} [extraHook=null]
     *   custom shader patch (terrain splat, grass wind, …), run after CSM's hook
     * @returns {THREE.Material} the same material, for chaining
     */
    setupShadowMaterial<T extends THREE.Material>(
      mat: T,
      extraHook: MaterialCompileHook | null = null,
    ): T {
      csm.setupMaterial(mat);
      // 2026-10-03 (cloudShadeMap.ts): the clouds' shadows on the sun term — every desktop CSM material built on three's
      // own shaders unless it opts out (material.userData.cotCloudShade = false: it writes vCotCloudSun itself) or its
      // program has no sampler to spare; a ShaderMaterial opts in with true (its chunks must carry the varying both ways)
      const optIn = mat.userData.cotCloudShade as boolean | undefined;
      const cloudShade = cloudShadeOn && (optIn === true || (optIn !== false && !(mat as unknown as { isShaderMaterial?: boolean }).isShaderMaterial));
      if (cloudShade) (mat.defines ??= {}).COT_CLOUD_SHADE = '';
      const receiverOnly = mat.userData.cotShadowReceiverOnly === true; // (RECEIVER_ONLY_SHADOW_NOTE, below)
      {
        // Round 69: the ground-bounce uniforms ride on every CSM registration (groundBounce.ts).
        const csmHook = mat.onBeforeCompile;
        mat.onBeforeCompile = (shader, rdr) => {
          csmHook(shader, rdr);
          attachGroundBounceUniforms(shader, groundBounceUniforms);
          if (extraHook) extraHook(shader, rdr);
          // 2026-10-08 (the world-ibl lane, with the fleet lane): the material's own envMapIntensity, which three
          // overwrites with the scene's on every draw, back on its share of the sky light (materialEnvIntensity.ts)
          bindMaterialEnvIntensity(shader, mat);
          if (receiverOnly) {
            shader.uniforms.uCotReceiverOnly = receiverOnlyShadowUniform;
            shader.uniforms.uCotReceiverOnlyV = receiverOnlyShadowUniform;
          }
          if (cloudShade) {
            attachCloudShadeUniforms(shader, cloudShadeUniforms);
            // three numbers a program's units over both stages and warns past sixteen on every bind (cloudShadeMap.ts
            // programTextureUnits; 2026-10-05: the DFG LUT counted — the terrain sat at seventeen): a program over the
            // budget first trades three's DFG LUT for the analytic fit (one unit back), and keeps no cloud shade only
            // when that is not enough
            let units = programTextureUnits(shader, mat, cascadeCount, !!scene.environment, true);
            if (units.total > CLOUD_SHADE_SAMPLER_BUDGET && units.dfg) {
              const pars = physicalParsWithoutDfgLut(THREE.ShaderChunk.lights_physical_pars_fragment);
              if (pars) {
                shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', pars);
                units = programTextureUnits(shader, mat, cascadeCount, !!scene.environment, true);
              }
            }
            if (units.total > CLOUD_SHADE_SAMPLER_BUDGET || units.fragment > CLOUD_SHADE_SAMPLER_BUDGET) {
              shader.vertexShader = `#undef COT_CLOUD_SHADE\n${shader.vertexShader}`;
              shader.fragmentShader = `#undef COT_CLOUD_SHADE\n${shader.fragmentShader}`;
            }
          }
        };
      }
      // 2026-10-04 (visual/shadow-bias, RECEIVER_ONLY_SHADOW_NOTE): a material whose meshes never cast opts out of the
      // casters' acne terms — the 2 cm bias in the light's normalised depth, no normal offset — and is held to that
      // promise at draw time (guardReceiverOnlyMaterial)
      if (receiverOnly) {
        const camera = csm.lights[0].shadow.camera;
        const defines = (mat.defines ??= {});
        defines.COT_SHADOW_RECEIVER_ONLY = '';
        defines.COT_RECEIVER_SHADOW_BIAS = (-SHADOW_RECEIVER_ONLY_BIAS_M / Math.max(1e-3, camera.far - camera.near)).toExponential(6);
        guardReceiverOnlyMaterial(mat);
      }
      // Alpha-tested foliage: replace the GPU-averaged mip chain with a
      // coverage-preserving one so distant cards keep their cutout silhouette
      // instead of resolving to solid alpha-flood rectangles (see
      // buildCoverageMipmaps). Idempotent — skips textures already fixed.
      const surface = mat as T & { alphaTest?: number; map?: THREE.Texture | null };
      if ((surface.alphaTest ?? 0) > 0 && surface.map?.image) {
        buildCoverageMipmaps(surface.map, surface.alphaTest ?? 0);
      }
      return mat;
    },

    releaseShadowMaterial(material: THREE.Material | null | undefined): boolean {
      return releaseCsmShaderMaterial(csm, material);
    },

    /**
     * Per-frame cascade refit. Call after the camera's world matrix is final
     * for the frame (ARCHITECTURE.md §4 step 9) and before `post.render`.
     * @param {boolean} [force=false] - re-render ALL cascades this frame
     *   (deterministic screenshot captures).
     * @param {number} [dt=1/60] render delta used by the refresh-rate caps.
     * @returns {void}
     */
    update: updateLighting,

    /**
     * Recompute cascade splits. Call whenever `camera.fov`, `camera.aspect`
     * or `camera.far` changes (window resize, sniper zoom FOV change).
     * @returns {void}
     */
    /**
     * FEEL r12 (desktop look-lag): fov-only refresh. The camera rig lerps
     * fov CONTINUOUSLY during scope zoom / aim transitions / the per-shot
     * recoil kick, and the old path ran the FULL updateFrustums every such
     * frame — whose _updateUniforms sweeps EVERY CSM-registered material
     * (hundreds; profiled at ~1 ms/frame, the "swinging the gun is laggy"
     * report). Cascade split BREAKS depend only on near/far/lambda — fov
     * changes only the frustum slice geometry and shadow bounds, so refresh
     * exactly those. Full updateFrustums stays for resize/near/far changes.
     */
    updateFov(): void {
      csm._initCascades();
      csm._updateShadowBounds();
      // Shadow-stability 2026-09-13 (owner: "tree shadows flash when the camera
      // moves and stuff"): every fov lerp — the per-shot recoil kick, aim and
      // scope transitions — re-sized all four cascade boxes, which re-gridded
      // every shadow map to a new texel size and shimmered every shadow edge
      // for the whole lerp. The box size now holds its last value until the
      // fov moves it by more than 8 % (a real zoom), and a real change forces
      // a complete cascade refresh so no stale map smears.
      let regridded = false;
      for (let i = 0; i < csm.lights.length; i++) {
        const shadowCam = csm.lights[i].shadow.camera;
        const size = shadowCam.right - shadowCam.left;
        const held = heldCascadeBoxSizes[i];
        if (held > 0 && Math.abs(size - held) / held < 0.08) {
          shadowCam.left = -held / 2; shadowCam.right = held / 2;
          shadowCam.top = held / 2; shadowCam.bottom = -held / 2;
          shadowCam.updateProjectionMatrix();
        } else {
          heldCascadeBoxSizes[i] = size;
          regridded = true;
        }
      }
      shadowFitCache.invalidate();
      applyShadowNormalBiases();
      if (regridded) forceAllCascades();
    },

    updateFrustums(): void {
      csm.updateFrustums();
      for (let i = 0; i < csm.lights.length; i++) {
        const shadowCam = csm.lights[i].shadow.camera;
        heldCascadeBoxSizes[i] = shadowCam.right - shadowCam.left;
      }
      shadowFitCache.invalidate();
      applyShadowNormalBiases();
      forceAllCascades(); // cascade boxes jumped — stale maps would smear
    },

    /**
     * Set the sun's intensity across all cascade lights (e.g. ~1.5 for a low
     * sun preset, 3 for high noon).
     * @param {number} i - DirectionalLight intensity, physically-based scale
     * @returns {void}
     */
    setSunIntensity(i: number): void {
      csm.lightIntensity = i;
      for (let k = 0; k < csm.lights.length; k++) csm.lights[k].intensity = i;
    },

    /**
     * Re-target the light rig to a map's sky preset (map switch): sun
     * direction (CSM cascades follow on the next update()), sun color +
     * intensity, hemisphere fill, and the anti-sun rescue fill position.
     * @param {THREE.Vector3} dir unit vector FROM origin TOWARD the sun
     * @param {{sunIntensity?:number, sunColorHex?:number, hemiIntensity?:number}} [opts]
     * @returns {void}
     */
    setSun(dir: THREE.Vector3, opts: SunPreset = {}): void {
      csm.lightDirection.copy(dir).negate().normalize();
      lastSunPreset = opts;
      applyRig(opts);
      shadowFitCache.invalidate();
      prepareCurrentCascadeFits(true);
      applyStableCascadePoses(csm, allCascadeMask);
      forceAllCascades(); // sun moved — every cascade must re-render
    },

    /** Round 69: the light effects this rig resolved (groundBounce is the one it owns). */
    get lightFx() { return lightFx.flags; },

    /** Read-only diagnostics; sampled at 4 Hz by the opt-in telemetry HUD. */
    /** Round 28: the hulls casting real armour this frame (probes). */
    get nearVehicleDetail() { return nearVehiclePolicy.selected.map((e) => ({ id: String(e.root.name), depth: +e.depth.toFixed(1), cascadeMask: e.cascadeMask })); },
    getShadowTelemetry() {
      return {
        maxFar: csm.maxFar,
        // Retained for telemetry schema compatibility. The fixed 60 Hz work
        // cadence is refresh-rate invariant and no longer governor-controlled.
        throttle: 0,
        frame: shFrame,
        forceFrames,
        scheduledMask: lastScheduledMask,
        fitChangedMask: lastFitChangedMask,
        farCascadeDormancyRequested: farCascadeDormant,
        staticPresentationDormant,
        farCascadeDepthReady: canDormantShadowCascades(csm.lights, FAR_CASCADE_START),
        staticCache: staticShadowCache?.telemetry() ?? null,
        cascades: csm.lights.map((light) => {
          const shadow = light.shadow;
          return {
            size: shadow.mapSize.x,
            allocated: !!shadow.map,
            allocatedSize: shadow.map?.width || 0,
            worldUnitsPerTexel: Number((
              (shadow.camera.right - shadow.camera.left) / Math.max(1, shadow.mapSize.x)
            ).toFixed(6)),
            position: light.position.toArray().map((value) => Number(value.toFixed(4))),
            radius: shadow.radius,
            intensity: shadow.intensity,
            normalBias: shadow.normalBias,
            bias: shadow.bias,
            // the depth bias in world metres along the sun ray
            depthBiasM: Number((-shadow.bias * (shadow.camera.far - shadow.camera.near)).toFixed(4)),
            autoUpdate: shadow.autoUpdate,
            needsUpdate: shadow.needsUpdate,
          };
        }),
      };
    },

    hemi,
  };
}
