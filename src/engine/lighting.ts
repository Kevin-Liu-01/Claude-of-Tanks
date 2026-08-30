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
  isContinuousShadowCascade,
  mergeRequiredShadowWork,
} from './shadowRefresh.ts';
import {
  shadowNormalBiasForTexel,
  snapShadowCoordinate,
} from './shadowStability.ts';

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

interface CsmShaderOwner {
  shaders?: Map<unknown, unknown>;
}

interface CsmRegisteredMaterial {
  onBeforeCompile?: MaterialCompileHook;
  defines?: Record<string, unknown>;
  needsUpdate: boolean;
}

type ExtendedCsm = CSM & {
  _initCascades(): void;
  _updateShadowBounds(): void;
};

const CASCADES = 4;
// Battlefield establishing shots read objects out to ~500 m; with the clearer
// exp2 fog (sky.ts) shadows must hold that far or buildings/trees float.
// PERF: shadow range and per-cascade map sizes now come from the graphics
// quality preset (src/engine/quality.ts — ultra [4096,4096,4096,2048], high
// [4096,2048,2048,1024]; medium/low trade range+resolution for fill rate,
// and PCF radii are penumbra-compensated per size — see applyShadowSizes).
// The farther cascades cover 100s of meters, where their smaller texels remain
// subpixel at gameplay scale. High now uses ~100 MB of shadow depth targets
// instead of ~160 MB, while keeping its hero cascade at 4096. The stock CSM
// update assumes every cascade has one uniform resolution; this module's stable
// update below snaps each projection to its ACTUAL map size instead.
// Moving near-field shadows must refresh on every presented frame. Capping
// them to 60 Hz made the player, nearby vehicles and contact shadows visibly
// step across surfaces on high-refresh displays — an artifact that reads like
// texture Z-fighting. Only the genuinely subpixel far pair are rate-capped and
// refresh together at 30 Hz. `update(true)` still forces every cascade for
// deterministic captures and map switches.
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

/** Prepare and apply every cascade for teleports, sun changes and captures. */
function updateStableCascades(csm: CSM): number {
  const changedMask = prepareStableCascades(csm);
  applyStableCascadePoses(csm, (2 ** csm.lights.length) - 1);
  return changedMask;
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
// r3 SHADOW DENSITY ("vehicles beyond ~100m cast no shadows — floating
// stickers"; measured: the shadow MAP is intact out to 700 m, but the ambient
// stack that has grown round-over-round to rescue hull flanks — hemi 0.51
// effective + anti-sun fill 0.66 + IBL floor 0.32 — fills sun-shadowed ground
// to ~29% of lit LINEAR, and ACES + the grade's high-luma taper compress that
// to a ~1.3:1 DISPLAY ratio: a 4 m tank shadow at 150-250 m is statistically
// invisible against terrain albedo mottle. Near-field shadows only read
// because GTAO (faded out past ~250 m) stacks on top — the exact "shadow dies
// at the distance tank gameplay lives at" tell.)
// Fix: a WoT-era shadow-density term, not a global key:fill rebalance (the
// fills exist to keep hull flanks/canopy interiors readable and must stay).
// Physically: an occluder that blocks the sun also blocks a chunk of sky +
// bounce, so inside a sun cast shadow the hemisphere/IBL/ambient irradiance
// is scaled by SHADOW_AMBIENT_DIM. Cast shadows keep hue (the cool split-tone
// still reads) but recover a ~2:1 display ratio at ANY camera distance —
// cascade resolution was never the limit. Implemented as a global
// ShaderChunk patch layered over the CSMShader chunks (see the block after
// the CSM constructor); materials.js's vehicle deep-shade luminance floor
// runs later in the chain and keeps hulls readable inside the denser shade.
// r4 LP2: 0.58 → 0.50 — the staged closeup/combat vehicle shadows still sat
// only ~1.6:1 against lit road after ACES (they read as road discoloration,
// not as THE TANK'S shadow); a denser ambient dim inside sun shadow restores
// the ~2.2:1 display step everywhere. Hull readability inside shade is held
// by materials.js's deep-shade luminance floor + the hemi bounce floor.
// r5 ("player-view shadow floor is near-black: tank shadow on the road drops
// to ~15% luminance with no cool sky fill; blue-sky daylight should fill
// shadows to ~35-45% with a cool tint"): the r4 0.50 scalar stacked with the
// grade's sub-pivot contrast + GTAO into a ~6.7:1 display step. The dim is
// now a TINTED vector (luminance ~0.70) whose blue channel keeps ~92% — a
// cast shadow under open sky is lit BY that sky, so it fills brighter AND
// cooler. Distance readability (the r3 "shadows die at range" fix this dim
// was born for) is preserved by the ~1.9:1 display step that remains plus
// the new distance-widened penumbra making edges read as shadow, not decal.
// (Measured after the first r5 pass: at [0.60,0.70,0.92] the road shadow
// still displayed at ~11% of lit — the display chain (ACES toe + sub-pivot
// grade contrast) was the real crusher, fixed by the grade's new low-end
// taper in post.ts. The dim itself now only needs to carry the COOL TINT and
// a gentle density step; the linear ratio lands ~26% and displays ~35%.)
const SHADOW_AMBIENT_DIM = [0.80, 0.88, 1.0];
// Indirect SPECULAR (env reflections) dims harder: a sky probe reflecting at
// full strength inside a cast shadow is the classic "wet plastic in shade"
// tell on ice/wet roads once materials gain speculars.
const SHADOW_AMBIENT_SPEC_DIM = 0.55;
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

function isDrawableImage(value: unknown): value is DrawableImage {
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
  const img: unknown = tex.image;
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
  let passing = 0;
  const d0 = level0.data;
  for (let i = 3; i < d0.length; i += 4) if (d0[i] >= cutByte) passing++;
  const targetCov = passing / (d0.length / 4);

  const chain = [level0];
  let prev = level0;
  let s = size;
  while (s > 1) {
    s >>= 1;
    const cur = new ImageData(s, s);
    const pd = prev.data;
    const cd = cur.data;
    const pw = s * 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i00 = ((y * 2) * pw + x * 2) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + pw * 4;
        const i11 = i01 + 4;
        const o = (y * s + x) * 4;
        for (let k = 0; k < 4; k++) {
          cd[o + k] = (pd[i00 + k] + pd[i10 + k] + pd[i01 + k] + pd[i11 + k] + 2) >> 2;
        }
      }
    }
    if (targetCov > 0 && s >= 2) {
      // Only correct levels whose pass-coverage actually drifted from level 0
      // (box-filtering pulls it toward all-pass or all-fail). Quantile-anchored
      // contrast: texels above the coverage quantile pass the cutoff, the rest
      // fall away — restores level-0 coverage while keeping internal
      // silhouette variation instead of an all-or-nothing rectangle.
      let pass = 0;
      for (let i = 3; i < cd.length; i += 4) if (cd[i] >= cutByte) pass++;
      const covNow = pass / (cd.length / 4);
      if (covNow < targetCov * 0.7 || covNow > targetCov * 1.3) {
        const alphas = [];
        for (let i = 3; i < cd.length; i += 4) alphas.push(cd[i]);
        alphas.sort((a, b) => b - a);
        const qi = Math.min(alphas.length - 1, Math.max(0, Math.round(targetCov * alphas.length) - 1));
        const q = Math.max(1, alphas[qi]);
        const boost = 3;
        for (let i = 3; i < cd.length; i += 4) {
          const v = cutByte + (cd[i] - q) * boost;
          cd[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
      }
    }
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
// 373 K vegetation caster tris plus the 150 K merged-facade props mesh, three
// at an average of three maps per 60 Hz frame (two near maps continuously,
// plus both far maps every other frame) = 2.10 M of the 7.34 M frame total.
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
// vertex wind sway and the bounded 30 Hz staleness of the far cohort).
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
let _cullTick = 0; // bumped once per lighting.update() — invalidates the frustum memo

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

/** onBeforeShadow half: compact the instance prefix to this cascade's frustum. */
function shadowCullBefore(object: THREE.Object3D, shadowCamera: THREE.Camera): void {
  // shadow-flicker bisect hook (probes): __SHADOW_DEBUG.noCull skips the
  // instance compaction entirely; harmless in production (never set).
  if (typeof window !== 'undefined' && window.__SHADOW_DEBUG && window.__SHADOW_DEBUG.noCull) return;
  if (!(object instanceof THREE.InstancedMesh) || object.count === 0) return;
  let rec = _cullState.get(object);
  if (rec === null) return; // permanently skipped
  if (rec === undefined) {
    if (geometryTris(object.geometry) * object.count < SHADOW_CULL_MIN_TRIS) {
      _cullState.set(object, null);
      return;
    }
    cullPending(object);
    return;
  }
  if (rec.pending) {
    // static only once the buffer sat untouched across 3 consecutive draws
    if (object.instanceMatrix.version !== rec.version || object.count !== rec.count) {
      rec.version = object.instanceMatrix.version;
      rec.count = object.count;
      rec.stable = 0;
      return;
    }
    if (++rec.stable < 3) return;
    rec = buildCullRec(object);
    if (!rec) return;
  }
  // foreign-write / live-count invalidation (owner rebuilt the instances)
  if (object.count !== rec.n) { cullPending(object); return; }
  for (let a = 0; a < rec.attrs.length; a++) {
    const e = rec.attrs[a];
    if (e.attr.version !== e.version) { cullPending(object); return; }
  }
  // one frustum build per cascade render (cascades draw their objects
  // back-to-back, so a single {camera, tick} memo covers the whole pass)
  // (shadow-flash forensics 2026-08-08: an earlier suspicion pinned driving
  // flicker on this compaction and inflated the cull box 20% — same-corridor
  // freezeMask/noCull A/Bs then showed the compaction contributes ZERO
  // measurable flicker (the flash was GTAO boil, see post.ts ao-boil r1/r2),
  // so the box is exact again. SHADOW_CULL_MARGIN already absorbs sway and
  // rate-capped far-cascade staleness.)
  if (_cullFrusCam !== shadowCamera || _cullFrusStamp !== _cullTick) {
    _cullProj.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    _cullFrustum.setFromProjectionMatrix(_cullProj);
    _cullFrusCam = shadowCamera;
    _cullFrusStamp = _cullTick;
  }
  const { centers, radii, attrs, n } = rec;
  let k = 0;
  for (let i = 0; i < n; i++) {
    _cullSphere.center.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]);
    _cullSphere.radius = radii[i];
    if (!_cullFrustum.intersectsSphere(_cullSphere)) continue;
    if (k !== i) {
      for (let a = 0; a < attrs.length; a++) {
        const e = attrs[a];
        const size = e.size;
        const arr = e.attr.array;
        const snap = e.snap;
        const so = i * size;
        const doff = k * size;
        for (let j = 0; j < size; j++) arr[doff + j] = snap[so + j];
      }
    }
    k++;
  }
  if (k === n) return; // nothing culled — buffers untouched, draw as-is
  object.count = k;
  rec.k = k;
  rec.compacted = true;
  if (k > 0) {
    for (let a = 0; a < attrs.length; a++) {
      const e = attrs[a];
      e.attr.addUpdateRange(0, k * e.size);
      e.attr.needsUpdate = true; // version++ — resync our expectation
      e.version = e.attr.version;
    }
  }
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

let shadowChunksPatched = false;
/**
 * Layer the shadow-density capture over the (CSM-installed) lighting chunks:
 *  - `lights_fragment_begin`: declare `cotSunVis`, record the CSM sun's
 *    shadow visibility (green channel: our sun colors never zero it), and
 *    resolve fade overlaps with the same weights as the direct-light blend;
 *  - `lights_fragment_end`: scale ambient/IBL irradiance (and env radiance)
 *    by SHADOW_AMBIENT_DIM inside the sun's cast shadow.
 * Guards compile away on non-CSM materials (no USE_CSM define). Throws on a
 * missed anchor so a three.js upgrade fails loudly, per the bloom/GTAO
 * precedent in post.ts.
 * @returns {void}
 */
function patchShadowAmbientChunks() {
  if (shadowChunksPatched) return;
  shadowChunksPatched = true;

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
  // a rate-capped refresh, while retaining a different orientation for each
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
 * @property {(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, yieldBeforeCascade?: ?Function) => Promise<number[]>} primeShadowMaps
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

  // --- r3 SHADOW DENSITY chunk patch (see SHADOW_AMBIENT_DIM above) --------
  // CSM's constructor just replaced ShaderChunk.lights_fragment_begin with
  // CSMShader's version; layer a capture of the sun's per-fragment shadow
  // visibility onto it, then scale the indirect terms in lights_fragment_end.
  // Applied ONCE per page load (guarded), before any lit material compiles.
  patchShadowAmbientChunks();
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
    csm.lights[i].color.setHex(SUN_COLOR);
    // Near maps stay on Three's continuous update path so moving contact
    // shadows cannot lag the visible tank. Only the far pair are driven
    // through the bounded needsUpdate scheduler below.
    if (!isContinuousShadowCascade(i, FAR_CASCADE_START)) {
      csm.lights[i].shadow.autoUpdate = false;
      csm.lights[i].shadow.needsUpdate = true; // first frame renders all
    }
  }
  // PERF: per-cascade map size (before the first render allocates the RTs)
  applyShadowSizes(preset.shadowMapSizes);
  let pendingShadowSizes: number[] | null = null;
  let pendingShadowMask = 0;
  let pendingShadowCursor = 0;
  // Live quality switching (settings UI → quality.setPresetName)
  onPresetChange((p) => {
    // Reallocating every cascade synchronously creates a 1000+ draw-call
    // recovery frame exactly while the GPU is already overloaded. Keep each
    // existing map alive, then replace/refresh one cascade per render frame.
    pendingShadowSizes = p.shadowMapSizes.slice();
    pendingShadowMask = (2 ** csm.lights.length) - 1;
    pendingShadowCursor = 0;
    csm.shadowMapSize = p.shadowMapSizes[0];
    if (csm.maxFar !== p.shadowMaxFar) {
      csm.maxFar = p.shadowMaxFar;
      csm.updateFrustums();
      applyShadowNormalBiases();
    }
  });
  const shadowScheduler = createShadowRefreshScheduler(csm.lights.length, {
    nearCount: Math.min(FAR_CASCADE_START, csm.lights.length),
  });
  const allCascadeMask = (2 ** csm.lights.length) - 1;
  const continuousCascadeMask = (2 ** Math.min(FAR_CASCADE_START, csm.lights.length)) - 1;
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
  // r4 LP2 (teleport robustness): any event that can move casters or the
  // cascade fit wholesale — map/sun switch, frustum change, __SHOTS restage —
  // forces FULL cascade redraws for the next 2 frames, so the rate cap
  // staleness optimization can never hold a teleported vehicle out of the
  // far maps for even one presented frame.
  let forceFrames = 0;
  // A covered battle-entry warm can render the exact current cascade maps in
  // separate offscreen frames. The following default-framebuffer render must
  // consume those maps once instead of immediately redrawing all four in one
  // task; normal live scheduling resumes on the next frame.
  let preservePrimedFrame = false;

  /** Mark every rate-capped cascade for re-render on the next frame. */
  function forceRateCappedCascades(): void {
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
      else forceRateCappedCascades();
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
      else forceRateCappedCascades();
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
      yieldBeforeCascade: ((index: number) => void | Promise<void>) | null = null,
    ): Promise<number[]> {
      if (!renderer2?.shadowMap || !scene2 || !camera2) return [];
      const prior = csm.lights.map((light) => ({
        shadow: light.shadow,
        autoUpdate: light.shadow.autoUpdate,
        needsUpdate: light.shadow.needsUpdate,
      }));
      const timings: number[] = [];
      let complete = false;
      try {
        scene2.updateMatrixWorld(true);
        camera2.updateMatrixWorld(true);
        for (const light of csm.lights) {
          light.shadow.autoUpdate = false;
          light.shadow.needsUpdate = false;
        }
        for (let index = 0; index < csm.lights.length; index++) {
          const light = csm.lights[index];
          if (yieldBeforeCascade) await yieldBeforeCascade(index);
          const startedAt = performance.now();
          light.shadow.needsUpdate = true;
          renderer2.shadowMap.render([light], scene2, camera2);
          light.shadow.needsUpdate = false;
          timings.push(Math.round(performance.now() - startedAt));
        }
        complete = true;
      } finally {
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
    update(force = false, dt = 1 / 60): void {
      lastFitChangedMask = 0;
      if (staticPresentationDormant && !force && !pendingShadowMask) {
        applyStaticPresentationDormancy();
        return;
      }
      // Keep both matrices and depth maps bit-for-bit aligned with the
      // covered warm pose for the first full post frame. A forced capture or
      // pending quality resize invalidates the receipt and takes precedence.
      if (preservePrimedFrame && !force && !pendingShadowMask) {
        preservePrimedFrame = false;
        lastScheduledMask = 0;
        for (const light of csm.lights) {
          light.shadow.autoUpdate = false;
          light.shadow.needsUpdate = false;
        }
        applyFarCascadeDormancy();
        return;
      }
      preservePrimedFrame = false;
      let transitionCascade = -1;
      if (pendingShadowMask) {
        for (let offset = 0; offset < csm.lights.length; offset++) {
          const i = (pendingShadowCursor + offset) % csm.lights.length;
          if (!(pendingShadowMask & (1 << i))) continue;
          transitionCascade = i;
          pendingShadowMask &= ~(1 << i);
          pendingShadowCursor = (i + 1) % csm.lights.length;
          applyShadowSize(i,
            pendingShadowSizes![Math.min(i, pendingShadowSizes!.length - 1)]);
          if (!pendingShadowMask) pendingShadowSizes = null;
          break;
        }
      }
      lastFitChangedMask = prepareStableCascades(csm);
      _cullTick++; // cascades refit — the per-cascade frustum memo is stale
      shFrame++;
      const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
      lastScheduledMask = 0;
      if (force || forceFrames > 0) {
        if (forceFrames > 0) forceFrames--;
        lastScheduledMask = shadowScheduler.forceMask();
        applyStableCascadePoses(csm, allCascadeMask);
        for (let i = 0; i < csm.lights.length; i++) {
          csm.lights[i].shadow.needsUpdate = true;
        }
        if (force) forceFrames = Math.max(forceFrames, 1); // settle 1 extra frame
      } else if (typeof window !== 'undefined' && window.__SHADOW_DEBUG && window.__SHADOW_DEBUG.forceAll) {
        // bisect hook: every cascade re-renders every frame (no rate cap)
        lastScheduledMask = shadowScheduler.forceMask();
        applyStableCascadePoses(csm, allCascadeMask);
        for (let i = 0; i < csm.lights.length; i++) csm.lights[i].shadow.needsUpdate = true;
      } else if (typeof window !== 'undefined' && window.__SHADOW_DEBUG && window.__SHADOW_DEBUG.freezeMask !== undefined) {
        // bisect hook: masked cascades stop re-rendering entirely (matrix
        // freezes with content — consistent stale shadows); unmasked near
        // cascades render every frame, unmasked far ones every frame too so
        // robin staleness never confounds the freeze comparison.
        const mask = window.__SHADOW_DEBUG.freezeMask | 0;
        applyStableCascadePoses(csm, allCascadeMask & ~mask);
        for (let i = 0; i < csm.lights.length; i++) {
          const sh = csm.lights[i].shadow;
          if (mask & (1 << i)) { sh.autoUpdate = false; sh.needsUpdate = false; } else {
            sh.autoUpdate = i < FAR_CASCADE_START;
            sh.needsUpdate = true;
            lastScheduledMask |= 1 << i;
          }
        }
      } else {
        // Near cascades remain continuous at the display cadence; rate-capping
        // them made dynamic contact shadows step at 60 Hz on 120/144 Hz
        // displays. The scheduler still amortizes the far pair, whose texels
        // are subpixel at gameplay distance, but refreshes both maps from one
        // camera/tree-LOD timestamp because CSM fade blends them together.
        for (let i = 0; i < csm.lights.length; i++) {
          const continuous = isContinuousShadowCascade(i, FAR_CASCADE_START);
          csm.lights[i].shadow.autoUpdate = continuous;
          if (!continuous) csm.lights[i].shadow.needsUpdate = false;
        }
        lastScheduledMask = shadowScheduler.step(step);
        if (transitionCascade >= 0) {
          lastScheduledMask = mergeRequiredShadowWork(
            lastScheduledMask, transitionCascade, csm.lights.length, 1);
        }
        // A rate-capped far map must keep its projection and depth texture as
        // one atomic pair. Prepare every snapped fit above, but apply a far fit
        // only on its cohort's scheduled render frame. Adjacent far maps move
        // together because the fade overlap samples both in one color frame;
        // mixing timestamps there was the forest-wide light/shadow flash.
        // Near fits still follow every presented frame. Cohorting preserves
        // the old average far-map work (two maps at 30 Hz each).
        applyStableCascadePoses(csm, continuousCascadeMask | lastScheduledMask);
        for (let i = 0; i < csm.lights.length; i++) {
          if (lastScheduledMask & (1 << i)) csm.lights[i].shadow.needsUpdate = true;
        }
      }
      applyFarCascadeDormancy();
    },

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
      applyShadowNormalBiases();
    },

    updateFrustums(): void {
      csm.updateFrustums();
      applyShadowNormalBiases();
      forceRateCappedCascades(); // cascade boxes jumped — stale maps would smear
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
      opts: { sunIntensity?: number; sunColorHex?: number; hemiIntensity?: number } = {},
    ): void {
      csm.lightDirection.copy(dir).negate().normalize();
      const intensity = opts.sunIntensity ?? SUN_INTENSITY;
      const colorHex = opts.sunColorHex ?? SUN_COLOR;
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
      updateStableCascades(csm);
      forceRateCappedCascades(); // sun moved — every cascade must re-render
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
