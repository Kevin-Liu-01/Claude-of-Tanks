/**
 * lighting.ts — sun (cascaded shadow maps) + hemisphere bounce light.
 *
 * Implements docs/research/graphics-aaa.md §2–§3 and ARCHITECTURE.md §3.1.2.
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
import {
  SHADOW_OPACITY,
  shadowNormalBiasForTexel,
  snapShadowCoordinate,
} from './shadowStability.ts';
import { createShadowFitCache } from './shadowFitCache.ts';

interface ShadowDebugOptions {
  noCull?: boolean;
  forceAll?: boolean;
  freezeMask?: number;
}

declare global {
  interface Window {
    __SHADOW_DEBUG?: ShadowDebugOptions;
  }
}

type NumericAttributeArray = THREE.InstancedBufferAttribute['array'];
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
// Reserved only during covered shadow priming. Presentation objects use layer
// 0, shadow-only proxies use 29, and late FX may use 30.
const SHADOW_PRIME_LAYER = 31;
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

const SHADOW_BIAS = -0.0002;
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
// Neutral values retain the CSM fade-visibility instrumentation used by the
// shader compatibility checks without applying the old custom ambient crush.
// Shadowed road/foliage pixels now keep Three's standard hemisphere and IBL
// contribution instead of collapsing into near-black patches.
const SHADOW_AMBIENT_DIM = [1.0, 1.0, 1.0];
const SHADOW_AMBIENT_SPEC_DIM = 1.0;
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

// --- r7 CASCADE SHADOW INSTANCE CULLING (perf: the frozen 7.0M triangle gate
// breach; the "cascade shadow-proxy LOD" cut the r6 handoff named as the real
// path back toward the 6.0M ratchet) ---------------------------------------
// MEASURED (tools/tmp-pb-r7-diag2.mjs on 66722fb, pinned cert roster, verdant):
// every shadow-casting InstancedMesh renders its FULL instance set into EVERY
// cascade — the vegetation casters are built frustumCulled=false with
// map-spanning instance sets, so even the ~25 m cascade-0 box rasterizes all
// 373 K vegetation caster tris plus the 150 K merged-facade props mesh. The
// coherent scheduler now refreshes all four modest maps together, making
// per-instance culling essential to keep that stable pass bounded.
// Mesh-level frustum culling can never help
// (a map-spanning merged bounding sphere intersects every cascade box); the
// correct cut is per-INSTANCE cascade culling:
//  - onBeforeShadow: test each instance's world bounding sphere against the
//    CURRENT shadow camera's frustum (built from the same matrices
//    WebGLShadowMap uses for whole-mesh culling) and compact the survivors to
//    the buffer PREFIX; the draw then runs with count=K. ALL per-instance
//    attributes (instanceMatrix, instanceColor, geometry-level instanced
//    attrs like the canopy fade) are compacted TOGETHER so slot i of the
//    depth draw stays coherent across attributes.
//  - onAfterShadow: restore the exact snapshot bytes + the full count, so the
//    main pass and any game-code reader always see the owner's data — outside
//    the shadow draw the buffers are bit-identical to owner state, and order
//    is never changed.
// Zero visual change BY CONSTRUCTION: an instance whose bounding sphere
// misses a cascade's frustum was rasterized fully off that cascade's map and
// contributed nothing; the test is conservative (per-instance sphere from the
// geometry bounding sphere x instance scale + SHADOW_CULL_MARGIN covering
// vertex wind sway and normal cascade-fit movement).
// Static-ness is DETECTED, not assumed: a mesh qualifies only after its
// instanceMatrix version sat unchanged across 3 consecutive shadow draws, and
// any foreign write (vegetation chunk rebuild, map switch, live count change)
// or a shared-geometry claim invalidates the snapshot and re-arms the gate —
// per-frame-rewritten fx pools never qualify. Buffer traffic is prefix-only
// via addUpdateRange (worst case ~0.5 MB/frame of bufferSubData, vs the 4096²
// shadow map's 64 MB/frame of raster writes this deletes). Allocation-free
// after snapshot build (module-scope scratch only) per the hot-loop rule.
const SHADOW_CULL_MIN_TRIS = 24000; // instances*trisPerInstance below this: not worth the hook
const SHADOW_CULL_MARGIN = 4.0; // meters: wind sway + far-cascade rr staleness
interface PendingCullRecord {
  pending: true;
  version: number;
  stable: number;
  count: number;
}

interface CullAttributeRecord {
  attr: THREE.InstancedBufferAttribute;
  size: number;
  snap: NumericAttributeArray;
  version: number;
}

interface ActiveCullRecord {
  pending: false;
  n: number;
  attrs: CullAttributeRecord[];
  centers: Float32Array;
  radii: Float32Array;
  k: number;
  compacted: boolean;
}

type CullRecord = PendingCullRecord | ActiveCullRecord;

const _cullState = new WeakMap<THREE.InstancedMesh, CullRecord | null>();
const _geomClaims = new WeakMap<THREE.BufferGeometry, THREE.InstancedMesh>();
const _cullFrustum = new THREE.Frustum();
const _cullProj = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere();
const _cullVec = new THREE.Vector3();
const _cullMat = new THREE.Matrix4();
let _cullFrusCam: THREE.Camera | null = null;
let _cullFrusStamp = -1;
let _cullTick = 0; // bumped only when a cascade light-camera fit changes

function geometryTris(geo: THREE.BufferGeometry): number {
  const idx = geo.index;
  const pos = geo.attributes && geo.attributes.position;
  return (((idx ? idx.count : (pos ? pos.count : 0)) / 3) | 0);
}

/** Fresh stability-gate record (also used to invalidate after foreign writes). */
function cullPending(mesh: THREE.InstancedMesh): PendingCullRecord {
  const rec: PendingCullRecord = {
    pending: true,
    version: mesh.instanceMatrix.version,
    stable: 0,
    count: mesh.count,
  };
  _cullState.set(mesh, rec);
  return rec;
}

/** Snapshot a stability-proven static instanced caster for per-cascade culling. */
function buildCullRec(mesh: THREE.InstancedMesh): ActiveCullRecord | null {
  const geo = mesh.geometry;
  const claimed = _geomClaims.get(geo);
  if (claimed && claimed !== mesh) {
    // two meshes share one geometry's instanced attrs — compacting for one
    // would corrupt the other's draw; permanently skip both.
    _cullState.set(mesh, null);
    _cullState.set(claimed, null);
    return null;
  }
  _geomClaims.set(geo, mesh);
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = geo.boundingSphere;
  if (!bs || !isFinite(bs.radius) || bs.radius <= 0) { _cullState.set(mesh, null); return null; }
  const n = mesh.count;
  // every attribute indexed per instance in the depth draw
  const attributeInputs: Array<{ attr: THREE.InstancedBufferAttribute; size: number }> = [
    { attr: mesh.instanceMatrix, size: 16 },
  ];
  if (mesh.instanceColor) {
    attributeInputs.push({ attr: mesh.instanceColor, size: mesh.instanceColor.itemSize });
  }
  const ga = geo.attributes;
  for (const key of Object.keys(ga)) {
    const a = ga[key];
    if (a instanceof THREE.InstancedBufferAttribute) {
      attributeInputs.push({ attr: a, size: a.itemSize });
    }
  }
  const attrs: CullAttributeRecord[] = [];
  for (const entry of attributeInputs) {
    if (!entry.attr.array || entry.attr.array.length < n * entry.size) {
      _cullState.set(mesh, null);
      return null;
    }
    attrs.push({
      attr: entry.attr,
      size: entry.size,
      snap: entry.attr.array.slice(0, n * entry.size) as NumericAttributeArray,
      version: entry.attr.version,
    });
  }
  // per-instance world bounding spheres (static — guaranteed by the gate)
  const centers = new Float32Array(n * 3);
  const radii = new Float32Array(n);
  const snapMat = attrs[0].snap;
  for (let i = 0; i < n; i++) {
    _cullMat.fromArray(snapMat, i * 16).premultiply(mesh.matrixWorld);
    _cullVec.copy(bs.center).applyMatrix4(_cullMat);
    centers[i * 3] = _cullVec.x;
    centers[i * 3 + 1] = _cullVec.y;
    centers[i * 3 + 2] = _cullVec.z;
    radii[i] = bs.radius * _cullMat.getMaxScaleOnAxis() + SHADOW_CULL_MARGIN;
  }
  const rec: ActiveCullRecord = {
    pending: false,
    n,
    attrs,
    centers,
    radii,
    k: 0,
    compacted: false,
  };
  _cullState.set(mesh, rec);
  return rec;
}

function shadowCullDebugDisabled(): boolean {
  return typeof window !== 'undefined' && !!window.__SHADOW_DEBUG?.noCull;
}

function advancePendingCull(
  mesh: THREE.InstancedMesh,
  record: PendingCullRecord,
): ActiveCullRecord | null {
  if (mesh.instanceMatrix.version !== record.version || mesh.count !== record.count) {
    record.version = mesh.instanceMatrix.version;
    record.count = mesh.count;
    record.stable = 0;
    return null;
  }
  record.stable++;
  return record.stable >= 3 ? buildCullRec(mesh) : null;
}

function activeCullWasInvalidated(mesh: THREE.InstancedMesh, record: ActiveCullRecord): boolean {
  if (mesh.count !== record.n) return true;
  for (const entry of record.attrs) {
    if (entry.attr.version !== entry.version) return true;
  }
  return false;
}

function resolveActiveCull(mesh: THREE.InstancedMesh): ActiveCullRecord | null {
  const record = _cullState.get(mesh);
  if (record === null) return null;
  if (record === undefined) {
    if (geometryTris(mesh.geometry) * mesh.count < SHADOW_CULL_MIN_TRIS) {
      _cullState.set(mesh, null);
    } else {
      cullPending(mesh);
    }
    return null;
  }
  if (record.pending) return advancePendingCull(mesh, record);
  if (!activeCullWasInvalidated(mesh, record)) return record;
  cullPending(mesh);
  return null;
}

function prepareCullFrustum(shadowCamera: THREE.Camera): void {
  if (_cullFrusCam === shadowCamera && _cullFrusStamp === _cullTick) return;
  _cullProj.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
  _cullFrustum.setFromProjectionMatrix(_cullProj);
  _cullFrusCam = shadowCamera;
  _cullFrusStamp = _cullTick;
}

function copyCullInstance(record: ActiveCullRecord, sourceIndex: number, targetIndex: number): void {
  for (const entry of record.attrs) {
    const sourceOffset = sourceIndex * entry.size;
    const targetOffset = targetIndex * entry.size;
    for (let component = 0; component < entry.size; component++) {
      entry.attr.array[targetOffset + component] = entry.snap[sourceOffset + component];
    }
  }
}

function compactCullRecord(record: ActiveCullRecord): number {
  let visibleCount = 0;
  for (let index = 0; index < record.n; index++) {
    _cullSphere.center.set(
      record.centers[index * 3],
      record.centers[index * 3 + 1],
      record.centers[index * 3 + 2],
    );
    _cullSphere.radius = record.radii[index];
    if (!_cullFrustum.intersectsSphere(_cullSphere)) continue;
    if (visibleCount !== index) copyCullInstance(record, index, visibleCount);
    visibleCount++;
  }
  return visibleCount;
}

function markCompactedAttributes(record: ActiveCullRecord, visibleCount: number): void {
  if (visibleCount <= 0) return;
  for (const entry of record.attrs) {
    entry.attr.addUpdateRange(0, visibleCount * entry.size);
    entry.attr.needsUpdate = true;
    entry.version = entry.attr.version;
  }
}

/** onBeforeShadow half: compact the instance prefix to this cascade's frustum. */
function shadowCullBefore(object: THREE.Object3D, shadowCamera: THREE.Camera): void {
  // shadow-flicker bisect hook (probes): __SHADOW_DEBUG.noCull skips the
  // instance compaction entirely; harmless in production (never set).
  if (shadowCullDebugDisabled()) return;
  if (!(object instanceof THREE.InstancedMesh) || object.count === 0) return;
  const rec = resolveActiveCull(object);
  if (!rec) return;
  // one frustum build per cascade render (cascades draw their objects
  // back-to-back, so a single {camera, tick} memo covers the whole pass)
  // (shadow-flash forensics 2026-08-08: an earlier suspicion pinned driving
  // flicker on this compaction and inflated the cull box 20% — same-corridor
  // freezeMask/noCull A/Bs then showed the compaction contributes ZERO
  // measurable flicker (the flash was GTAO boil, see post.ts ao-boil r1/r2),
  // so the box is exact again. SHADOW_CULL_MARGIN already absorbs sway and
  // the complete active shadow fit.)
  prepareCullFrustum(shadowCamera);
  const visibleCount = compactCullRecord(rec);
  if (visibleCount === rec.n) return; // nothing culled — buffers untouched, draw as-is
  object.count = visibleCount;
  rec.k = visibleCount;
  rec.compacted = true;
  markCompactedAttributes(rec, visibleCount);
}

/** onAfterShadow half: restore owner bytes + full count before anyone reads. */
function shadowCullAfter(object: THREE.Object3D): void {
  if (!(object instanceof THREE.InstancedMesh)) return;
  const rec = _cullState.get(object);
  if (!rec || rec.pending || !rec.compacted) return;
  rec.compacted = false;
  object.count = rec.n;
  const k = rec.k;
  rec.k = 0;
  if (k === 0) return; // count=0 draw wrote nothing — buffers still pristine
  for (let a = 0; a < rec.attrs.length; a++) {
    const e = rec.attrs[a];
    e.attr.array.set(e.snap); // memcpy restore; only the dirty prefix uploads
    e.attr.addUpdateRange(0, k * e.size);
    e.attr.needsUpdate = true;
    e.version = e.attr.version;
  }
}

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
    // r7 cascade shadow instance culling (see the _cullState block above)
    shadowCullBefore(object, shadowCamera);
  };
  const afterHook: THREE.Mesh['onAfterShadow'] = function (_renderer, object) {
    shadowCullAfter(object);
  };
  THREE.Mesh.prototype.onBeforeShadow = hook;
  THREE.SkinnedMesh.prototype.onBeforeShadow = hook;
  THREE.Mesh.prototype.onAfterShadow = afterHook;
  THREE.SkinnedMesh.prototype.onAfterShadow = afterHook;
}

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
float cotSunVis = 1.0;
float cotCascadeVis = 1.0;
vec3 cotPrev;`);
  frag = frag.replace(fadeAnchor, `${fadeAnchor}
					cotCascadeVis = directLight.color.g / max( prevColor.g, 1e-4 );`);
  frag = frag.replace(fadeBlendAnchor, `${fadeBlendAnchor}
					cotSunVis = mix( cotSunVis, cotCascadeVis, blendRatio );`);
  frag = frag.replace(noFadeAnchor, `cotPrev = directLight.color;
				${noFadeAnchor}
				cotSunVis = min( cotSunVis, directLight.color.g / max( cotPrev.g, 1e-4 ) );`);
  THREE.ShaderChunk.lights_fragment_begin = frag;

  const endHead = '#if defined( RE_IndirectDiffuse )';
  const end = THREE.ShaderChunk.lights_fragment_end;
  if (!end.includes(endHead)) {
    throw new Error('lighting.ts: shadow-density anchor not found in lights_fragment_end');
  }
  const dimVec = `vec3( ${SHADOW_AMBIENT_DIM.map((v) => v.toFixed(3)).join(', ')} )`;
  THREE.ShaderChunk.lights_fragment_end = end.replace(endHead, `#if defined( USE_CSM ) && defined( CSM_CASCADES )

	vec3 cotAmbDim = mix( ${dimVec}, vec3( 1.0 ), cotSunVis );

	#if defined( RE_IndirectDiffuse )

		irradiance *= cotAmbDim;
		iblIrradiance *= cotAmbDim;

	#endif

	#if defined( RE_IndirectSpecular )

		radiance *= mix( ${SHADOW_AMBIENT_SPEC_DIM.toFixed(3)}, 1.0, cotSunVis );

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
  const shadowFitCache = createShadowFitCache();
  const fitLightDirection = [0, 0, 0];

  const prepareCurrentCascadeFits = (force = false): number => {
    csm.lightDirection.toArray(fitLightDirection);
    const fitChanged = shadowFitCache.changed({
      cameraWorld: camera.matrixWorld.elements,
      projection: camera.projectionMatrix.elements,
      lightDirection: fitLightDirection,
    }, force);
    if (!fitChanged) return 0;
    _cullTick++; // a new light-camera fit invalidates the culling frustum memo
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

  /** Keep receiver separation proportional to each physical shadow texel. */
  function applyShadowNormalBias(i: number): void {
    const shadow = csm.lights[i].shadow;
    const span = shadow.camera.right - shadow.camera.left;
    const worldUnitsPerTexel = span / Math.max(1, shadow.mapSize.x);
    shadow.normalBias = shadowNormalBiasForTexel(worldUnitsPerTexel);
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
    if (consumeDormantOrPrimedFrame(force)) return;
    preservePrimedFrame = false;
    const transitionCascade = consumePendingShadowResize();
    lastFitChangedMask = prepareCurrentCascadeFits(force);
    shFrame++;
    const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
    scheduleCascadeFrame(force, step, transitionCascade);
    applyFarCascadeDormancy();
  }

  return {
    csm,

    // Allocation-free read used by the deterministic performance probe to
    // correlate a completed frame's renderer counters with its cascade work.
    // Keep the richer getShadowTelemetry() path at HUD cadence only.
    get scheduledMask() { return lastScheduledMask; },

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
      }: {
        yieldBeforeCascade?: ((index: number) => void | Promise<void>) | null;
        cascadeLimit?: number;
      } = {},
    ): Promise<number[]> {
      if (!renderer2?.shadowMap || !scene2 || !camera2) return [];
      // Partial priming is safe only after every omitted native depth target
      // exists and the far bands are explicitly dormant. Otherwise fail open
      // to a complete pass so sampler2DShadow bindings stay valid.
      const primeCount = resolveShadowPrimeCount(
        csm.lights,
        cascadeLimit,
        farCascadeDormant,
      );
      const prior = csm.lights.map((light) => ({
        shadow: light.shadow,
        autoUpdate: light.shadow.autoUpdate,
        needsUpdate: light.shadow.needsUpdate,
        layerMask: light.layers.mask,
      }));
      const shadowMap = renderer2.shadowMap;
      const renderShadowMaps = shadowMap.render.bind(shadowMap);
      const cameraLayerMask = camera2.layers.mask;
      const priorTarget = renderer2.getRenderTarget();
      const priorFace = renderer2.getActiveCubeFace?.() ?? 0;
      const priorMip = renderer2.getActiveMipmapLevel?.() ?? 0;
      const warmTarget = new THREE.WebGLRenderTarget(8, 8, {
        depthBuffer: false,
        stencilBuffer: false,
      });
      const timings: number[] = [];
      let complete = false;
      try {
        scene2.updateMatrixWorld(true);
        camera2.updateMatrixWorld(true);
        for (const light of csm.lights) {
          light.shadow.autoUpdate = false;
          light.shadow.needsUpdate = false;
        }
        for (let index = 0; index < primeCount; index++) {
          const light = csm.lights[index];
          if (yieldBeforeCascade) await yieldBeforeCascade(index);
          const startedAt = performance.now();
          camera2.layers.set(SHADOW_PRIME_LAYER);
          light.layers.enable(SHADOW_PRIME_LAYER);
          // WebGLShadowMap.render is an internal renderer phase and cannot be
          // invoked after an async yield: Three clears its current render
          // state at the end of every normal frame. Route one selected cascade
          // through WebGLRenderer.render instead. The reserved camera layer
          // keeps the color pass empty, while the wrapper restores production
          // layers for the shadow traversal so all real casters participate.
          shadowMap.render = (_lights, activeScene, activeCamera) => {
            const primeMask = activeCamera.layers.mask;
            activeCamera.layers.mask = cameraLayerMask;
            try {
              renderShadowMaps([light], activeScene, activeCamera);
            } finally {
              activeCamera.layers.mask = primeMask;
            }
          };
          renderer2.setRenderTarget(warmTarget);
          light.shadow.needsUpdate = true;
          renderer2.render(scene2, camera2);
          light.shadow.needsUpdate = false;
          renderer2.setRenderTarget(priorTarget, priorFace, priorMip);
          shadowMap.render = renderShadowMaps;
          camera2.layers.mask = cameraLayerMask;
          light.layers.mask = prior[index]!.layerMask;
          timings.push(Math.round(performance.now() - startedAt));
        }
        complete = true;
      } finally {
        renderer2.setRenderTarget(priorTarget, priorFace, priorMip);
        shadowMap.render = renderShadowMaps;
        camera2.layers.mask = cameraLayerMask;
        for (let index = 0; index < csm.lights.length; index++) {
          csm.lights[index]!.layers.mask = prior[index]!.layerMask;
        }
        warmTarget.dispose();
        if (complete) {
          preservePrimedFrame = true;
          forceFrames = 0;
          shadowScheduler.reset();
          lastScheduledMask = 0;
          for (const light of csm.lights) {
            light.shadow.autoUpdate = false;
            light.shadow.needsUpdate = false;
          }
        } else {
          for (const state of prior) {
            state.shadow.autoUpdate = state.autoUpdate;
            state.shadow.needsUpdate = state.needsUpdate;
          }
        }
      }
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
      if (extraHook) {
        const csmHook = mat.onBeforeCompile;
        mat.onBeforeCompile = (shader, rdr) => {
          csmHook(shader, rdr);
          extraHook(shader, rdr);
        };
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
      shadowFitCache.invalidate();
      applyShadowNormalBiases();
    },

    updateFrustums(): void {
      csm.updateFrustums();
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
    setSun(
      dir: THREE.Vector3,
      opts: { sunIntensity?: number; sunColorHex?: number; hemiIntensity?: number; fillIntensity?: number } = {},
    ): void {
      csm.lightDirection.copy(dir).negate().normalize();
      const intensity = opts.sunIntensity ?? SUN_INTENSITY;
      const colorHex = opts.sunColorHex ?? SUN_COLOR;
      fill.intensity = opts.fillIntensity ?? FILL_INTENSITY;
      csm.lightIntensity = intensity;
      for (let k = 0; k < csm.lights.length; k++) {
        csm.lights[k].intensity = intensity;
        csm.lights[k].color.setHex(colorHex);
      }
      {
        const presetHemi = opts.hemiIntensity ?? HEMI_INTENSITY;
        hemi.intensity = presetHemi + hemiFloorFor(presetHemi);
      }
      const fx = -dir.x, fz = -dir.z;
      const fl = Math.hypot(fx, fz) || 1;
      fill.position.set((fx / fl) * FILL_HORIZ_M, FILL_ELEV_Y, (fz / fl) * FILL_HORIZ_M);
      shadowFitCache.invalidate();
      prepareCurrentCascadeFits(true);
      applyStableCascadePoses(csm, allCascadeMask);
      forceAllCascades(); // sun moved — every cascade must re-render
    },

    /** Read-only diagnostics; sampled at 4 Hz by the opt-in telemetry HUD. */
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
            autoUpdate: shadow.autoUpdate,
            needsUpdate: shadow.needsUpdate,
          };
        }),
      };
    },

    hemi,
  };
}
