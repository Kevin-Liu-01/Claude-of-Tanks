/**
 * post.ts — the full post-processing chain.
 *
 * Chain (extends ARCHITECTURE.md §3.1.4 / graphics-aaa.md §4 with a grade):
 *   SceneAAPass (MSAA render + resolve) → AerialPass (+ specular-AA firefly
 *   clamp) → GTAOPass → LateFxPass (copied depth) → UnrealBloomPass →
 *   OutputGradePass (ACES + sRGB + grade) → SMAAPass → FSR1
 *   (EASU + RCAS)
 *
 * The scene renders into a quality-aware multisampled HalfFloat HDR target
 * with a DepthTexture, then resolves once into the composer's single-sampled
 * ping-pong buffers. This preserves real geometry/foliage edge coverage while
 * avoiding MSAA on every fullscreen post pass. OutputGradePass applies the
 * renderer's exact tone mapping + output transfer and the display-space grade
 * in one draw; scope neighbor samples run through that same output transform.
 * SMAA and reconstruction still run last on the values the eye sees, so the
 * grade cannot sharpen stair steps back into an already-antialiased frame.
 * Bloom thresholds against the linear HDR buffer — sun, muzzle flash and fire
 * exceed 1.0 and bloom naturally.
 *
 * aa-r1 (owner: "glass and other vegetation is still anti aliasing a lot"):
 * SMAA is an edge-PATTERN filter — it reconstructs geometric silhouettes but
 * deliberately ignores isolated pixels, so the two loudest motion offenders
 * passed straight through it: (a) alpha-tested foliage resolves to 1px leaf/
 * blade dust that reshuffles every frame, (b) sub-pixel bright details (window
 * frames, roof-tile specular rims, far telegraph poles, glass glints) pop in
 * and out per frame. Two new stages target exactly those:
 *   - a pre-bloom FIREFLY clamp in the aerial pass (see FIREFLY_* consts):
 *     isolated HDR speculars are capped against their neighborhood so glints
 *     stop strobing and stop pulsing bloom;
 *   - a final FSR1 EASU + RCAS pass AFTER SMAA: edge-adaptive spatial
 *     reconstruction replaces bilinear enlargement, then contrast-adaptive
 *     sharpening restores fine vehicle/terrain detail without sharpening
 *     flat sky/fog. It lands at native canvas resolution; HUD/DOM never
 *     passes through the composer, so UI text keeps full sharpness.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import {
  TEMPORAL_AO_BRIGHT_RETENTION_SLACK,
  TEMPORAL_AO_CURRENT_WEIGHT,
  TEMPORAL_AO_DEPTH_REJECT_FOOTPRINT_SCALE,
  TEMPORAL_AO_DEPTH_REJECT_MIN,
  TEMPORAL_AO_DARK_RELEASE_SLACK,
  resolveTemporalAoCurrentWeight,
} from './temporalAoPolicy.ts';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import {
  canRecoverAutoTier,
  getPreset,
  onPresetChange,
  reportSustainedOverload,
  reportSustainedRecovery,
  type QualityPreset,
} from './quality.ts';
import {
  baseDynamicScale,
  dynamicScaleFloor,
  internalPixelRatio,
  reconstructionMode,
  reconstructionSharpness,
  type ReconstructionMode,
} from './renderScalePolicy.ts';
import {
  AdaptiveQualityPolicy,
  type AdaptiveQualityAction,
} from './adaptiveQualityPolicy.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

interface ReconstructionTelemetry {
  mode: ReconstructionMode;
  input: [number, number];
  output: [number, number];
  inputScale: number;
  sharpness: number;
}

interface LateFxSoftState {
  uSceneDepth: THREE.IUniform<THREE.DepthTexture | null>;
  uSoftViewport: THREE.IUniform<THREE.Vector2>;
  uCameraNear: THREE.IUniform<number>;
  uCameraFar: THREE.IUniform<number>;
  isActive(): boolean;
}

export interface LateFxSoftStateInput {
  uSceneDepth?: THREE.IUniform<THREE.DepthTexture | null>;
  uSoftViewport?: THREE.IUniform<THREE.Vector2>;
  uCameraNear?: THREE.IUniform<number>;
  uCameraFar?: THREE.IUniform<number>;
  isActive?: () => boolean;
}

interface ExtendedGtaoPass extends GTAOPass {
  _renderPass(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null,
    clearColor?: THREE.ColorRepresentation,
    clearAlpha?: number,
  ): void;
}

interface ExtendedSmaaPass extends SMAAPass {
  _materialEdges?: THREE.ShaderMaterial;
  _materialWeights?: THREE.ShaderMaterial;
}

interface OutputGradePass extends OutputPass {
  isOutputGradePass: boolean;
}

export interface PostWarmTiming {
  label: string;
  ms: number;
}

export interface PostRuntime {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  gtao: GTAOPass;
  upscaler: FsrUpscalePass;
  sceneAA: SceneAAPass;
  lateFx: LateFxPass;
  aerial: ShaderPass;
  readonly msaaSamples: number;
  readonly dynScale: number;
  readonly perfTrim: number;
  warmFirstFrame(yieldBeforePass?: ((label: string) => Promise<void>) | null): Promise<PostWarmTiming[]>;
  render(dt: number): void;
  setSize(width: number, height: number): void;
  prepareSoftParticles(): void;
  attachLateFxState(state: LateFxSoftStateInput | null | undefined): void;
  pinDynScale(value: number | null): void;
  setQuality(level: 'high' | 'low'): void;
  resetPerfTrims(): void;
  setAdaptiveSuspended(suspended: boolean): void;
  resetAdaptiveResolution(): void;
  forcePerfTrim(level: number): void;
}

declare global {
  interface Window {
    __AO_EMA_OFF?: boolean;
  }
}

function asLateFxSoftState(
  candidate: LateFxSoftStateInput | null | undefined,
): LateFxSoftState | null {
  return candidate?.uSceneDepth
    && candidate.uSoftViewport
    && candidate.uCameraNear
    && candidate.uCameraFar
    && typeof candidate.isActive === 'function'
    ? candidate as LateFxSoftState
    : null;
}

// r5 bloom retune ("muzzle flash is three enormous structureless gaussian
// bloom blobs"): strength 0.34 → 0.20 and radius 0.4 → 0.28 so bloom is a
// tight halo around genuinely hot pixels instead of a wide gaussian smear
// that erases the flash's internal core/spike structure.
// r3 ("emissive events barely bloom: the fireball leaves almost no halo and
// the flash core is a pea-sized orb"): 0.20/0.28 starved true emissives.
// Strength 0.20 → 0.30 and radius 0.28 → 0.34 restore a readable hot-source
// halo; the r5 "structureless gaussian blobs" failure cannot return because
// (a) the high-pass input stays clamped (BLOOM_INPUT_CLAMP) so halo energy is
// bounded, and (b) the 1.78 threshold still fences everything but genuinely
// hot cores — the halo hugs the fire instead of swallowing the frame.
const BLOOM_STRENGTH = 0.30;
const BLOOM_RADIUS = 0.34;
// With the rebalanced ambient (sky.ts ENV_INTENSITY 0.45, hemi 0.26) diffuse
// surfaces top out well under 1.0 in the linear HDR buffer, so the threshold
// keeps bloom off walls/terrain AND off the near-sun horizon band, while the
// sun disc, muzzle flash core, tracers and fire glow naturally. r4: 1.35 →
// 1.42 — sun-glint metal speculars (gun tube top edge) were crossing the old
// threshold and blooming into an aliased hot halo; true emissives all sit
// >= 1.6 and still bloom. r5: 1.42 → 1.55 — the additive flash sprite stack
// crossed 1.42 across its whole footprint, so the ENTIRE flash bloomed into
// one blob; at 1.55 only the white-hot core and spike tips bloom and the
// orange combustion body keeps its baked structure.
// r9 ("large desert sand areas blow out to textureless near-white / urban
// sidewalks read emissive"): sunlit high-albedo DIFFUSE surfaces (sand ~0.9
// albedo under the 4.9 desert sun) reach ~1.5 linear and were crossing 1.55
// at grazing-boost pixels — albedo alone must NEVER bloom. 1.78 fences all
// diffuse response (theoretical max ~1.6) while true emissives — flash core,
// tracers, fire (2.5-4.5 after the pre-tonemap shoulder below) — still bloom.
const BLOOM_THRESHOLD = 1.78;
// The fx fireball reaches 5-20 in the HDR buffer; unclamped, UnrealBloom
// smears it into a full-frame white-out. Clamping the high-pass input keeps
// hot sources glowing (flash spikes, tracers, fire) without flooding.
// r3: 2.0 → 2.6 — with the deeper emissive shoulder the fire core's HDR
// headroom (up to ~5.15) must reach the bloom pass or the halo cannot scale
// with core heat; still far below the 5-20 raw stack values that flooded.
const BLOOM_INPUT_CLAMP = 2.6;
const HIGH_PASS_ANCHOR = 'gl_FragColor = mix( outputColor, texel, alpha );';
// AO radius must be vehicle-scale (~1 m) to ground hulls/building bases;
// 0.3 m read as nothing at gameplay camera distances. r3: radius 1.0 → 1.3,
// scale 1.3 → 1.7, thickness 1.2 → 1.6 — the critic read the shots as having
// "no ambient occlusion anywhere"; contact darkening under hulls, building
// bases and canopies has to survive ACES + fog to register at 1080p.
// r4: radius 1.3 → 1.6, scale 1.7 → 2.2, thickness 1.6 → 1.8 — props (poles,
// hay bales, building bases) still met the terrain with no visible contact
// darkening at 1080p establishing distance; this pushes grounding into the
// clearly-readable range while the Poisson denoise keeps gradients smooth.
// r5: scale 2.2 → 2.6 — houses/fences in the establishing shot still met the
// terrain with no visible contact core ("float slightly"); with the r5 fog
// cut the AO no longer has to fight a milky wash, so the deeper multiply
// reads as grounding instead of dirt.
// r6: radius 1.6 → 1.9, thickness 1.8 → 2.0 — "buildings, telegraph poles,
// and hay bales meet the terrain with no contact darkening"; the wider
// gather brings prop-base grounding into the clearly-visible range at
// establishing distance while the 260-420 m view fade still fences the
// horizon ring from AO slashes.
// r7: radius 1.9 → 2.3, scale 2.8 → 3.3 — the frozen combat_firing crop
// still showed the Abrams hull meeting bright grass with no readable contact
// core ("floats above the grass"); with the r7 exposure/ambient lift the AO
// multiply needs more depth to survive the brighter field. The 260-420 m
// view fade below still fences the far field, so the deeper term stays a
// contact cue, not a dirt wash.
// r5: scale 3.3 → 3.0 + a NEW mid-distance ease (45% AO give-back over
// 110-250 m, injected below with the view fade) — the half-res 16-tap gather
// is undersampled at mid-range (AO radius ~3 px in the AO buffer), so real
// rolling-turf concavities resolved as high-variance dot ROWS instead of
// smooth shading; blatant on snow ("ordered dot-grid halftone" critical).
// Near-field contact grounding (hulls, walls, props < 110 m) is untouched,
// and deep corners keep ~55% depth through the mid band.
// r2: scale 3.0 → 3.3 — the surviving CONTACT term (post kill-band) must
// read as clear grounding under hulls/walls/trunks at 1080p; the shallow
// dapple that motivated the 3.3 → 3.0 pullback is now removed by the kill
// band + distance ladder below, not by weakening every corner.
// ao-boil r1 (owner: "when i drive by stuff, the shadows under stuff like
// trees flash a lot repeatedly, only while moving"): bisected via cascade
// freezeMask + trim A/B on a verdant corridor — the flashing dark blobs are
// NOT shadow maps (freezing every cascade changed nothing) but GTAO boil:
// alpha-tested leaf/blade cutouts live in the shared scene depth, and at
// aoScale<1 their subpixel holes re-alias every frame in motion, churning
// the occluder field. thickness 2.0 turned every thin leaf card into a
// 2-metre-deep occluder, amplifying both the depth and the variance of
// under-canopy AO (cell-level dark flips: AO on 3.3%/frame vs AO off 0.7%).
// Halve the thickness heuristic — walls/hulls/trunks are real volumes and
// keep their grounding; only the phantom depth of foliage cards thins out.
const GTAO_PARAMS = { radius: 2.3, distanceExponent: 2, thickness: 1.0, scale: 3.3, samples: 16 };
// ao-boil r1: denoiser retuned for temporal stability on foliage. depthPhi
// 2 → 6 (weight = 1 - depthDiff/phi, so a LOW phi refuses to smooth across
// depth edges — and leaf speckle is nothing but depth edges: the denoiser
// was preserving the boil as "detail"); radius 8 → 10 and rings 2 → 3
// spread each pixel's estimate over more of the half-res AO buffer, cutting
// frame-to-frame variance of blob shapes.
const GTAO_PD_PARAMS = { lumaPhi: 10, depthPhi: 6, normalPhi: 3, radius: 10, rings: 3, samples: 16 };
const GTAO_BLEND_INTENSITY = 1.0;

// Depth-driven aerial perspective (r3: "distant hills correctly shift
// grey-blue but distant grass/trees at the same depth keep full saturation").
// Per-material `fog` flags and vertex-color choices made distance response
// incoherent across terrain/foliage/props; this pass applies ONE curve to
// every pixel from the scene depth buffer, in linear HDR space before bloom:
// progressive desaturation + a cool blue-grey shift with distance. The sky
// (depth == 1.0, incl. the depthWrite:false cloud shells) is excluded — the
// dome already carries its own atmosphere.
// r4: density 0.0011 → 0.0016, desat 0.5 → 0.65, deeper cool shift.
// r5 REWORK ("aerial perspective is a neutral gray value-ramp that fully
// desaturates the scene by ~400m — not physically plausible"): the r4 curves
// overshot and monochromed everything past the village. Physically, in-scatter
// at these distances is mostly ADDED skylight, not removed chroma, and it is
// DIRECTIONAL — warm toward the sun azimuth, cool blue away from it. So:
//  - density 0.0016 → 0.0009 and desat 0.65 → 0.42: saturation now survives
//    to ~800 m (WoT summer-map behavior) — ~11% desat @400m, ~28% @800m.
//  - the scatter-in target is no longer the flat fog color: it is tinted
//    per-pixel by the view ray's angle to the sun (see uHazeWarm/uHazeCool),
//    so the far field grades warm→cool across the frame instead of reading
//    as one gray fog card.
// r6 ("aerial perspective is weak: distant treelines and hills retain
// near-full green saturation"): r5's pullback overshot the other way — at
// 0.0009/0.42 a 500 m treeline lost only ~8% saturation, visually nothing.
// Splitting the difference between r4 (monochrome by 400 m) and r5 (no
// atmosphere at all): 500 m treelines now shift clearly toward the sky tint
// (~18% desat + ~15% scatter-in) while 200 m foliage keeps full color.
// r6 AGAIN ("aerial perspective is weak: distant treelines and hills retain
// near-full green saturation; horizon haze abruptly desaturates the junction
// instead of graduating with distance"): 0.00125 → 0.00145 and desat 0.55 →
// 0.62. Measured on the curve: a 500 m treeline now loses ~25% saturation
// (was ~15%) and picks up ~19% sky-tinted scatter-in (was ~12%) — clearly
// atmospheric, while 200 m foliage stays under 6% shift (no monochrome-by-
// 400m regression: full desat now lands at 1.3 km+, not 400 m).
const AERIAL_DENSITY = 0.00145; // 1/m; f = 1-exp(-(d*k)^2)
const AERIAL_DESAT = 0.62; // max saturation loss at full distance
const AERIAL_COOL = [0.90, 0.97, 1.08]; // cool shift multiplier at full distance
// Scatter-in term (r4), retuned r5: 0.0009 → 0.00058 — at 0.0009 the horizon
// mountain ring (r 760-1220 m) was 50-80% swallowed by a single neutral haze
// color: "flat, untextured, uniform light-gray silhouettes". At 0.00058 the
// ridges keep their baked slope shading and silhouette (~19% haze @800m,
// ~38% @1.2km, ~74% @2km) and inherit a BLUE atmospheric cast from the
// directional tint below instead of flat gray.
// r6: 0.00058 → 0.00078 — with the r5 rate the 500-900 m band kept full
// saturation ("weak aerial perspective"); at 0.00078 the scatter-in reads
// ~14% @500 m, ~33% @900 m, ~55% @1.3 km, and the directional warm/cool tint
// keeps the far field atmospheric instead of gray.
// r6: 0.00078 → 0.00092 (see AERIAL_DENSITY note — same critique round).
const AERIAL_HAZE_DENSITY = 0.00092; // 1/m, slower second curve for scatter-in
// Directional in-scatter tints, applied to the live fog color (which is
// sampled from the sky dome): pixels whose view ray points near the sun
// azimuth scatter WARM, rays away from the sun scatter COOL BLUE — the
// standard single-scattering approximation WoT-era engines use for their
// horizon ramps. Exponents/gains tuned so the warm lobe spans ~60 degrees.
const AERIAL_WARM_TINT = [1.16, 1.035, 0.86];
const AERIAL_COOL_TINT = [0.86, 0.95, 1.13];
const AERIAL_SUN_POW = 5.0; // width of the warm forward-scatter lobe
// r8 highlight rolloff ("horizon haze blows out to clipped pure white — the
// left half of battlefield_desert loses all sand/mesa contrast into white"):
// the scatter-in TARGET is the fog color x the warm tint, and on bright-sky
// maps that product sat near diffuse white in linear space, so every distant
// pixel converged on white. Cap the scatter-in targets' linear luminance at
// haze-albedo level (~0.50 → ~210/255 display after ACES + grade): distance
// still pulls the far field into atmosphere, but the atmosphere itself can
// never reach the clipped-white band, so mesa/ridge/sand contrast survives.
// r5 ("battlefield_urban: featureless bleached-white zone occupying ~25% of
// frame height"): 0.50 still landed the far-field convergence color at ~215
// display once the haze band + fog + scatter stacked. 0.44 puts the wash at
// ~200-205 with its hue clearly legible — atmosphere, not blowout. Paired
// with sky.ts HAZE_MAX_LUM 0.56 -> 0.50 and HORIZON_LUM_CAP 0.55 -> 0.48 so
// all three haze sources agree on the same sub-white ceiling.
// r3 ("mesa backdrop ~90% swallowed by a pink haze band"): 0.44 → 0.41,
// paired with sky.ts HORIZON_LUM_CAP 0.48 → 0.45 — the scatter-in target
// drops another step below white so far mesas/ridges keep silhouette value
// against the band instead of dissolving into it.
// lighting_post r6 (minor: "the horizon band left of center blows to
// near-white" on player_view): 0.41 -> 0.385 — one more step below white so
// the brightest scatter-in convergence stays clearly a color, not a blowout.
const AERIAL_HAZE_LUM_CAP = 0.385;
// r9 SNIPER DE-HAZE: main.ts already scales the FogExp2 density down at high
// zoom (fov < 15), but the aerial pass kept FULL density, so the x8 sight
// picture stayed a desaturated teal wash — a 450 m hillside at x8 subtends
// the screen like a 60 m object and must read correspondingly clear (WoT
// zoom behavior). Both aerial curves now follow the same FOV ramp the fog
// uses; arcade/establishing cameras (fov >= 15) are untouched.
const AERIAL_ZOOM_FOV = 15; // deg — below this the aerial curves scale down
const AERIAL_ZOOM_FLOOR = 0.26; // density multiplier floor at max zoom
// r5 SNIPER FAR-FIELD DETAIL ("x8 magnifies the horizon ring into a flat
// untextured smooth green wall filling ~60% of the frame"): backdrop meshes
// (horizon ring, far hills) carry only low-frequency bakes — at x8 their
// texel footprint is tens of screen pixels and the wall reads as smooth
// vinyl. When the FOV drops toward scope range, the aerial pass now overlays
// a WORLD-SPACE two-octave value noise (reconstructed from scene depth + the
// per-pixel view ray) onto far pixels: a luminance-only modulation, so the
// backdrop's hue/art direction is untouched but the surface reads as forest/
// meadow texture at any magnification. World-anchored => no screen-door
// shimmer while panning, deterministic for captures. Zero effect in arcade
// cameras (fov >= AERIAL_DETAIL_FOV) and on near geometry (< 220 m).
const AERIAL_DETAIL_FOV = 20; // deg — detail fades in below this FOV
// r5 ("sniper x8: midfield grass is a flat yellow-green wash with no detail
// texture; horizon rock band a formless gray gradient smear; far-tree
// impostors magnify into flat teal leaf-blob wallpaper"): the overlay now
// starts at 90 m (the x8 sight picture's whole midfield), gains a 4th
// scope-only 0.55 m octave (reads as grass/leaf grain under magnification),
// and gets a green-keyed CHROMA octave that swings far grass/canopy between
// olive and warm brown — hue variation, not just a luminance screen.
const AERIAL_DETAIL_NEAR = 90; // m — never touches gameplay-range geometry
const AERIAL_DETAIL_FAR = 320; // m — full strength by here
// r3 ("mid hill shows blue mottled smearing" at x8): amp 0.30 → 0.26 and the
// octave scales tightened below (23/6.1/1.9 m → 15/4.6/1.6 m) — the old
// largest octave modulated ~23 m patches, which at x8 subtend a third of the
// frame and read as blotch, not canopy texture; finer octaves read as forest
// grain at scope magnification.
// r5: 0.26 → 0.34 — at 0.26 the overlay measurably existed but visually
// vanished under the haze; x8 needs the full grain to read as surface.
const AERIAL_DETAIL_AMP = 0.34; // peak luminance modulation (+/-17%)
// r5 ARCADE FAR-FIELD SHARE ("winter alpine ring faces are untextured flat
// matte facets at 1:1"): the establishing cameras (fov 45) had uDetailW = 0,
// so the horizon ring rendered as bare gradients in every wide shot. Far
// pixels now always carry a fraction of the detail overlay — fading in from
// 430 m (past all gameplay-range geometry) so only backdrop surfaces (ring
// walls, far forest combs) get re-textured; the finest octave stays gated to
// scope FOVs (subpixel at establishing distance = shimmer while panning).
const AERIAL_DETAIL_ARCADE = 0.55; // arcade-share of AERIAL_DETAIL_AMP
const AERIAL_DETAIL_ARCADE_NEAR = 430; // m
const AERIAL_DETAIL_ARCADE_FAR = 950; // m
// r5 CLOUD-SHADOW MODULATION ("no large-scale light modulation: terrain
// luminance is uniform across the entire 1.5 km battlefield — no cloud
// shadows, no fog patchiness"): a world-anchored two-octave value noise,
// thresholded into 2-3 soft ~150-400 m patches per km, multiplies the scene
// color for every ground pixel (sky excluded via the depth gate). Applied in
// the aerial pass where the per-pixel WORLD position is already
// reconstructed, so the patches are anchored to the terrain (no screen-space
// swim) and deterministic for captures. Amplitude ships per map via
// scene.userData.cloudShadeAmp (sky.ts: fair-weather 0.22, overcast 0.10 —
// a diffuse-lit deck cannot cast crisp cloud shadows, but soft fog
// patchiness still breaks the wash).
const CLOUD_SHADE_DEFAULT = 0.22;
// r5 HEIGHT-AWARE HAZE ("a diagonal fog-gradient band cutting across the
// winter massif reads as a shader artifact — replace with height-based fog
// so the band follows altitude"): in-scatter accumulates along the path
// through LOW-ALTITUDE air, so pixels high above the battlefield datum must
// haze less than same-distance pixels at ground level. The scatter-in term
// decays with the pixel's world height above (camera + offset); extinction
// keeps a partial share. Mountain walls now grade bottom-up (dense haze at
// their skirts, clearer crags) instead of wearing a screen-diagonal band.
const AERIAL_HEIGHT_REF = 30; // m above camera where the falloff starts
const AERIAL_HEIGHT_SCALE = 150; // e-fold height of the scatter falloff (m)
const AERIAL_HEIGHT_SCATTER_K = 0.75; // share of scatter-in that obeys altitude
const AERIAL_HEIGHT_EXT_K = 0.35; // share of extinction that obeys altitude
// r4 LP2 FAR-FIELD HUE CLAMP ("sniper_view top half: horizon forest renders
// as solid two-tone teal blobs under a saturated jade-green fog — sampled RGB
// [55,90,73] G-dominant where atmospheric haze must be blue-grey, B>=G").
// The x8 scope magnifies the 700-1300 m horizon impostors whose TEAL albedo
// dominates the frame because the r9 sniper de-haze scales the aerial curves
// down 0.26x at high zoom — hue correction must NOT scale away with density.
// Physically, green light is scattered OUT of a 600 m+ path faster than blue
// (real distant forest always reads blue-grey); enforce it explicitly: pixels
// beyond HUE_CLAMP_NEAR whose green channel dominates are pulled toward a
// same-luma blue-grey, full strength by HUE_CLAMP_FAR. Independent of the
// fog/scatter amount, so it holds at any zoom; near/mid foliage (< 500 m,
// gameplay range) is untouched and keeps its art-directed green.
// Tuned on shots/sniper_view.png: the first impostor comb row sits at ~470 m,
// so the ramp must be fully in by then, and the dominance key is G-vs-B
// directly (the B>=G atmospheric criterion) — teal (g>b>r) pixels only
// scored ~0.35 under a g-vs-max(r,b) key and kept their jade cast.
// lighting_post r7 (CRITICAL: "horizon forest impostors render as flat teal
// vertical smears — fully desaturated versus sunlit midground trees at
// similar view depth"): the 0.88 pull at 760 m was THIS clamp — it converted
// the whole 470-1300 m forest band to the blue-grey pole, killing every trace
// of canopy green ("dead teal curtain"). The impostors are now relit to
// sun-matched albedo at the source (maps/horizon.js, r7 handoff), so the
// clamp returns to being ATMOSPHERE, not paint: a moderate pull that starts
// past the first comb row and never exceeds ~45% — distant forest shifts
// toward blue-grey with range, but stays recognizably lit green canopy.
const AERIAL_HUE_CLAMP_NEAR = 560; // m — clamp fades in from here
const AERIAL_HUE_CLAMP_FAR = 1150; // m — full strength beyond
const AERIAL_HUE_CLAMP_MAX = 0.45; // max pull toward blue-grey
const AERIAL_HUE_GREY = [0.92, 0.99, 1.12]; // blue-grey pole (per-channel luma scale)
// r9 PRE-TONEMAP EMISSIVE SHOULDER ("fireball core is fully clipped: flat
// blown white-yellow disc — the tonemapper has no highlight shoulder on
// emissives"): the additive fire/flash sprite stacks reach 5-20 in linear
// HDR, and ACES maps EVERYTHING >= 5 to >= 0.93 display — a featureless
// white disc with a hard saturation band where the stack count steps. A
// rational luminance rolloff above EM_SHOULDER_START (hue-preserving —
// channels scale together, so the fire keeps its orange chroma instead of
// ACES' per-channel bleach-to-white) re-spreads the 2-20 range across
// 1.55-4.4, restoring interior gradient before ACES ever sees it. The sky
// dome self-caps at ~1.45 (sky.ts SKY_KNEE) and diffuse surfaces top out
// ~1.6, so the start only catches true emissives; asymptote 4.55 still
// tonemaps to ~0.92 so hot cores stay hot, and still crosses the 1.78 bloom
// threshold so fire/flash keep their halo.
const EM_SHOULDER_START = 1.55;
// r3: 3.0 → 3.6 (asymptote 5.15) — fire cores keep more HDR separation above
// the bloom threshold so the halo brightness tracks the core instead of every
// hot pixel compressing into the same 3.1-3.8 band. ACES(5.15 x 1.16) ~ 0.95
// display: still no clipped-white plateau.
const EM_SHOULDER_RANGE = 3.6; // asymptote = START + RANGE
// aa-r1 SPECULAR-AA FIREFLY CLAMP (owner: "glass ... still anti aliasing a
// lot"): sub-pixel smooth-surface speculars — window-pane env glints
// (props.ts glass: roughness 0.18 / envMapIntensity 1.5 on panes a few px
// tall), glazed roof-tile rims, gun-tube top edges, far pole tips — rasterize
// as ISOLATED 1px HDR spikes that pop in/out with every sub-pixel camera
// step. MSAA-2 averages but cannot stabilize them, SMAA ignores lone pixels
// by design, and any spike crossing BLOOM_THRESHOLD (1.78) additionally
// strobes a bloom halo. The standard temporal-AA-free answer is a
// neighborhood luminance clamp in linear HDR BEFORE bloom: pixels brighter
// than FIREFLY_MIN whose luma exceeds max(4 diagonal neighbors) x TOL + PAD
// are scaled down (hue kept) to that ceiling. Structured emissives are
// untouched by construction — fire cores, muzzle-flash bodies, tracer LINES
// and the sun disc all keep at least one hot diagonal neighbor (the sky is
// excluded by the existing depth gate anyway), so only true one-pixel
// sparkle is tamed. Runs inside the aerial pass: the neighborhood taps are
// gated behind the luma test, so ordinary pixels pay one compare.
// FIREFLY_MIN sits ABOVE the diffuse band (sunlit sand/snow reach ~1.5-1.6
// linear, per the bloom-threshold r9 note) and just below BLOOM_THRESHOLD
// (1.78): only pixels that could strobe a bloom halo pay the neighborhood
// taps, so ordinary bright fields never take the 4-tap path (measured: the
// 1.10 draft floor pulled whole sunlit meadows into the taps for ~0.45 ms;
// at 1.70 the clamp costs ~0.1 ms and sub-bloom sparkle is owned by the
// display-space dust filter below instead).
const FIREFLY_MIN = 1.70; // linear luma floor — below this, never touched
const FIREFLY_TOL = 1.30; // allowed ratio over the brightest diagonal
const FIREFLY_PAD = 0.06; // absolute headroom so dim neighborhoods don't crush

// Native-output spatial reconstruction, using FSR 1 EASU + RCAS where the
// surviving source density justifies it and hardware-linear sampling at the
// most constrained mobile floor.
// This replaces the old sequence of browser bilinear enlargement followed by
// a 9-13 tap sub-pixel blur. EASU reconstructs the governor's reduced frame
// along local edge direction; RCAS restores contrast without sharpening flat
// sky/fog or adding halos. At native resolution EASU is skipped and RCAS is a
// five-tap final pass. The DOM HUD remains outside this chain at native res.
//
// MIT License
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: the above
// copyright notice and this permission notice shall be included in all copies
// or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
// WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
// TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
// CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
const FSR_EASU_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uInputSize;
  uniform vec2 uOutputSize;
  varying vec2 vUv;

  void fsrCon( out vec4 c0, out vec4 c1, out vec4 c2, out vec4 c3 ) {
    c0 = vec4( uInputSize / uOutputSize,
      0.5 * uInputSize / uOutputSize - 0.5 );
    c1 = vec4( 1.0, 1.0, 1.0, -1.0 ) / uInputSize.xyxy;
    c2 = vec4( -1.0, 2.0, 1.0, 2.0 ) / uInputSize.xyxy;
    c3 = vec4( 0.0, 4.0, 0.0, 0.0 ) / uInputSize.xyxy;
  }
  void fsrTap( inout vec3 color, inout float weight, vec2 offset,
    vec2 dir, vec2 len, float lob, float clp, vec3 sampleColor ) {
    vec2 v = vec2( dot( offset, dir ), dot( offset, vec2( -dir.y, dir.x ) ) ) * len;
    float d2 = min( dot( v, v ), clp );
    float wb = 0.4 * d2 - 1.0;
    float wa = lob * d2 - 1.0;
    wb *= wb; wa *= wa;
    wb = 1.5625 * wb - 0.5625;
    float w = wb * wa;
    color += sampleColor * w;
    weight += w;
  }
  void fsrSet( inout vec2 dir, inout float len, float w,
    float la, float lb, float lc, float ld, float le ) {
    float lenX = max( abs( ld - lc ), abs( lc - lb ) );
    float dirX = ld - lb;
    dir.x += dirX * w;
    lenX = clamp( abs( dirX ) / ( lenX + 1e-5 ), 0.0, 1.0 );
    len += lenX * lenX * w;
    float lenY = max( abs( le - lc ), abs( lc - la ) );
    float dirY = le - la;
    dir.y += dirY * w;
    lenY = clamp( abs( dirY ) / ( lenY + 1e-5 ), 0.0, 1.0 );
    len += lenY * lenY * w;
  }
  float fsrLuma( vec3 c ) { return c.g + 0.5 * ( c.r + c.b ); }
  vec3 fsrEasu( vec2 ip, vec4 c0, vec4 c1, vec4 c2, vec4 c3 ) {
    vec2 pp = ip * c0.xy + c0.zw;
    vec2 fp = floor( pp );
    pp -= fp;
    vec2 p0 = fp * c1.xy + c1.zw;
    vec2 p1 = p0 + c2.xy;
    vec2 p2 = p0 + c2.zw;
    vec2 p3 = p0 + c3.xy;
    vec4 off = vec4( -0.5, 0.5, -0.5, 0.5 ) * c1.xxyy;
    vec3 b = texture2D( tDiffuse, p0 + off.xw ).rgb;
    vec3 c = texture2D( tDiffuse, p0 + off.yw ).rgb;
    vec3 i = texture2D( tDiffuse, p1 + off.xw ).rgb;
    vec3 j = texture2D( tDiffuse, p1 + off.yw ).rgb;
    vec3 f = texture2D( tDiffuse, p1 + off.yz ).rgb;
    vec3 e = texture2D( tDiffuse, p1 + off.xz ).rgb;
    vec3 k = texture2D( tDiffuse, p2 + off.xw ).rgb;
    vec3 l = texture2D( tDiffuse, p2 + off.yw ).rgb;
    vec3 h = texture2D( tDiffuse, p2 + off.yz ).rgb;
    vec3 g = texture2D( tDiffuse, p2 + off.xz ).rgb;
    vec3 o = texture2D( tDiffuse, p3 + off.yz ).rgb;
    vec3 n = texture2D( tDiffuse, p3 + off.xz ).rgb;
    float bl=fsrLuma(b), cl=fsrLuma(c), il=fsrLuma(i), jl=fsrLuma(j);
    float fl=fsrLuma(f), el=fsrLuma(e), kl=fsrLuma(k), ll=fsrLuma(l);
    float hl=fsrLuma(h), gl=fsrLuma(g), ol=fsrLuma(o), nl=fsrLuma(n);
    vec2 dir = vec2( 0.0 ); float len = 0.0;
    fsrSet( dir, len, (1.0-pp.x)*(1.0-pp.y), bl, el, fl, gl, jl );
    fsrSet( dir, len, pp.x*(1.0-pp.y), cl, fl, gl, hl, kl );
    fsrSet( dir, len, (1.0-pp.x)*pp.y, fl, il, jl, kl, nl );
    fsrSet( dir, len, pp.x*pp.y, gl, jl, kl, ll, ol );
    float dirR = dot( dir, dir );
    bool zeroDir = dirR < 1.0 / 32768.0;
    dir = zeroDir ? vec2( 1.0, 0.0 ) : dir * inversesqrt( dirR );
    len = 0.25 * len * len;
    float stretch = 1.0 / max( abs( dir.x ), abs( dir.y ) );
    vec2 len2 = vec2( 1.0 + (stretch-1.0)*len, 1.0 - 0.5*len );
    float lob = 0.5 - 0.29 * len;
    float clp = 1.0 / lob;
    vec3 color = vec3( 0.0 ); float weight = 0.0;
    fsrTap(color,weight,vec2( 0,-1)-pp,dir,len2,lob,clp,b);
    fsrTap(color,weight,vec2( 1,-1)-pp,dir,len2,lob,clp,c);
    fsrTap(color,weight,vec2(-1, 1)-pp,dir,len2,lob,clp,i);
    fsrTap(color,weight,vec2( 0, 1)-pp,dir,len2,lob,clp,j);
    fsrTap(color,weight,vec2( 0, 0)-pp,dir,len2,lob,clp,f);
    fsrTap(color,weight,vec2(-1, 0)-pp,dir,len2,lob,clp,e);
    fsrTap(color,weight,vec2( 1, 1)-pp,dir,len2,lob,clp,k);
    fsrTap(color,weight,vec2( 2, 1)-pp,dir,len2,lob,clp,l);
    fsrTap(color,weight,vec2( 2, 0)-pp,dir,len2,lob,clp,h);
    fsrTap(color,weight,vec2( 1, 0)-pp,dir,len2,lob,clp,g);
    fsrTap(color,weight,vec2( 1, 2)-pp,dir,len2,lob,clp,o);
    fsrTap(color,weight,vec2( 0, 2)-pp,dir,len2,lob,clp,n);
    vec3 min4 = min( min( f, g ), min( j, k ) );
    vec3 max4 = max( max( f, g ), max( j, k ) );
    return clamp( color / max( weight, 1e-5 ), min4, max4 );
  }
  void main() {
    vec4 c0, c1, c2, c3; fsrCon( c0, c1, c2, c3 );
    vec2 ip = gl_FragCoord.xy - vec2( 0.5 );
    gl_FragColor = vec4( fsrEasu( ip, c0, c1, c2, c3 ), 1.0 );
  }`;

const FSR_RCAS_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uTexelDelta;
  uniform float uSharpness;
  varying vec2 vUv;
  const vec3 lumCoef = vec3( 0.2126, 0.7152, 0.0722 );
  void main() {
    vec3 c = texture2D( tDiffuse, vUv ).rgb;
    vec3 n = texture2D( tDiffuse, vUv + vec2(0.0,-1.0)*uTexelDelta ).rgb;
    vec3 w = texture2D( tDiffuse, vUv + vec2(-1.0,0.0)*uTexelDelta ).rgb;
    vec3 e = texture2D( tDiffuse, vUv + vec2(1.0,0.0)*uTexelDelta ).rgb;
    vec3 s = texture2D( tDiffuse, vUv + vec2(0.0,1.0)*uTexelDelta ).rgb;
    vec3 minRgb = min( min( min( n, w ), min( e, s ) ), c );
    vec3 maxRgb = max( max( max( n, w ), max( e, s ) ), c );
    vec3 amp = clamp( min( minRgb, 2.0-maxRgb ) / ( maxRgb+1e-4 ), 0.0, 1.0 );
    amp = inversesqrt( amp + 1e-4 );
    float weight = -0.2 / max( dot( amp, lumCoef ), 1e-4 );
    float centerL = dot( c, lumCoef );
    float crossL = dot( n+w+e+s, lumCoef );
    float sharpL = clamp( (crossL*weight+centerL) / (4.0*weight+1.0), 0.0, 1.0 );
    vec3 sharpColor = c - vec3(centerL) + vec3(sharpL);
    gl_FragColor = vec4( mix( c, sharpColor, uSharpness ), 1.0 );
  }`;

// RCAS is useful for modest reconstruction (for example 1.5 -> 2), but at a
// phone's 1.25 -> 3 ratio it can only amplify undersampled terrain/foliage
// into the reported grainy blocks. Moderate enlargement keeps EASU without
// RCAS. Severe reduction uses the GPU's single-sample linear reconstruction:
// that is intentionally softer, but avoids both 12-tap native EASU cost and
// invented high-frequency speckle. Only modes with RCAS allocate the full-
// native intermediate.
class FsrUpscalePass extends Pass {
  readonly outputSize: THREE.Vector2;
  readonly inputSize: THREE.Vector2;
  mode: ReconstructionMode;
  inputScale: number;
  readonly intermediate: THREE.WebGLRenderTarget;
  readonly easuMaterial: THREE.ShaderMaterial;
  readonly rcasMaterial: THREE.ShaderMaterial;
  readonly copyMaterial: THREE.ShaderMaterial;
  readonly quad: FullScreenQuad;

  constructor() {
    super();
    this.needsSwap = false;
    this.outputSize = new THREE.Vector2(1, 1);
    this.inputSize = new THREE.Vector2(1, 1);
    this.mode = 'native-rcas';
    this.inputScale = 1;
    this.intermediate = new THREE.WebGLRenderTarget(1, 1, {
      // EASU runs after output conversion/grade/SMAA, so the input is display-space
      // 0..1. RGBA8 halves native-resolution bandwidth/memory vs half-float
      // with no HDR information left to preserve.
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.intermediate.texture.name = 'FSR1.EASU';
    this.easuMaterial = new THREE.ShaderMaterial({
      name: 'FSR1.EASU', vertexShader: CopyShader.vertexShader,
      fragmentShader: FSR_EASU_FRAG,
      uniforms: { tDiffuse: { value: null }, uInputSize: { value: new THREE.Vector2(1, 1) },
        uOutputSize: { value: this.outputSize } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    this.rcasMaterial = new THREE.ShaderMaterial({
      name: 'FSR1.RCAS', vertexShader: CopyShader.vertexShader,
      fragmentShader: FSR_RCAS_FRAG,
      uniforms: { tDiffuse: { value: null }, uTexelDelta: { value: new THREE.Vector2(1, 1) },
        uSharpness: { value: 0.12 } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'NativeOutput.Linear',
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.easuMaterial);
  }
  setOutputSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    if (this.outputSize.x === w && this.outputSize.y === h) return;
    this.outputSize.set(w, h);
  }

  private setFinalTarget(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
  ): void {
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) {
      renderer.clear(
        renderer.autoClearColor,
        renderer.autoClearDepth,
        renderer.autoClearStencil,
      );
    }
  }

  private renderLinear(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    source: THREE.Texture,
  ): void {
    this.copyMaterial.uniforms.tDiffuse.value = source;
    this.quad.material = this.copyMaterial;
    this.setFinalTarget(renderer, writeBuffer);
    this.quad.render(renderer);
  }

  private renderEasu(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    source: THREE.Texture,
    inputWidth: number,
    inputHeight: number,
    applyRcas: boolean,
  ): void {
    this.easuMaterial.uniforms.tDiffuse.value = source;
    this.easuMaterial.uniforms.uInputSize.value.set(inputWidth, inputHeight);
    this.quad.material = this.easuMaterial;
    if (applyRcas) {
      if (this.intermediate.width !== this.outputSize.x
        || this.intermediate.height !== this.outputSize.y) {
        this.intermediate.setSize(this.outputSize.x, this.outputSize.y);
      }
      renderer.setRenderTarget(this.intermediate);
    } else {
      this.setFinalTarget(renderer, writeBuffer);
    }
    this.quad.render(renderer);
  }

  private renderRcas(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    source: THREE.Texture,
    sourceWidth: number,
    sourceHeight: number,
    inputScale: number,
  ): void {
    this.rcasMaterial.uniforms.tDiffuse.value = source;
    this.rcasMaterial.uniforms.uTexelDelta.value.set(
      1 / sourceWidth,
      1 / sourceHeight,
    );
    this.rcasMaterial.uniforms.uSharpness.value = reconstructionSharpness(inputScale);
    this.quad.material = this.rcasMaterial;
    this.setFinalTarget(renderer, writeBuffer);
    this.quad.render(renderer);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const inW = readBuffer.width, inH = readBuffer.height;
    const outW = this.outputSize.x, outH = this.outputSize.y;
    const upscale = inW !== outW || inH !== outH;
    const inputScale = upscale ? Math.min(inW / outW, inH / outH) : 1;
    const mode = reconstructionMode(inputScale);
    const applyRcas = mode.includes('rcas');
    this.inputSize.set(inW, inH);
    this.inputScale = inputScale;
    this.mode = mode;
    let source = readBuffer.texture;
    let sourceW = inW, sourceH = inH;
    if (mode === 'linear') {
      this.renderLinear(renderer, writeBuffer, source);
      return;
    }
    if (upscale) {
      this.renderEasu(renderer, writeBuffer, source, inW, inH, applyRcas);
      if (!applyRcas) return;
      source = this.intermediate.texture;
      sourceW = outW; sourceH = outH;
    }
    // Match contrast recovery to the enlargement. High's normal 1.5→2 path
    // stays at the proven 0.28. Lower-density modes skip RCAS above, so this
    // cap cannot manufacture detail from severely undersampled foliage.
    this.renderRcas(renderer, writeBuffer, source, sourceW, sourceH, inputScale);
  }
  telemetry(): ReconstructionTelemetry {
    return {
      mode: this.mode,
      input: [this.inputSize.x, this.inputSize.y],
      output: [this.outputSize.x, this.outputSize.y],
      inputScale: +this.inputScale.toFixed(3),
      sharpness: this.mode.includes('rcas')
        ? +this.rcasMaterial.uniforms.uSharpness.value.toFixed(3) : 0,
    };
  }
  dispose(): void {
    this.intermediate.dispose();
    this.easuMaterial.dispose();
    this.rcasMaterial.dispose();
    this.copyMaterial.dispose();
    this.quad.dispose();
  }
}

const AerialShader = {
  name: 'AerialPerspectiveShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uNear: { value: 0.1 },
    uFar: { value: 4000 },
    uDensity: { value: AERIAL_DENSITY },
    uDesat: { value: AERIAL_DESAT },
    uCool: { value: new THREE.Vector3(...AERIAL_COOL) },
    uHazeDensity: { value: AERIAL_HAZE_DENSITY },
    // lighting_post r6 ("sniper horizon forest band renders near-black-teal
    // ... apply distance fog to the horizon-ring impostors so they inherit
    // aerial perspective at zoom"): the r9 sniper de-haze scales
    // uHazeDensity down to keep the 100-450 m sight picture magnified-clear,
    // but it also stripped the 500 m+ impostor band of ALL its scatter-in —
    // at x8 the backdrop rendered raw dark-teal albedo, the "different
    // renderer" read. uHazeFull carries the UNSCALED per-frame density; far
    // pixels take max(zoomed, 0.62 x full) fading in over 430-780 m, so the
    // backdrop keeps its atmospheric lift at any zoom. In arcade the zoomed
    // density equals the full density and the max() is a no-op — every
    // establishing shot is bit-identical.
    uHazeFull: { value: AERIAL_HAZE_DENSITY },
    // Directional scatter-in targets, re-synced per frame from scene.fog
    // (sky-sampled) x the warm/cool tints above.
    uHazeWarm: { value: new THREE.Color(0.62, 0.64, 0.62) },
    uHazeCool: { value: new THREE.Color(0.47, 0.59, 0.81) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, // world, toward the sun
    // camera world basis + frustum half-tangents for per-pixel view rays
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uTan: { value: new THREE.Vector2(1, 1) },
    uCamPos: { value: new THREE.Vector3() },
    uDetailW: { value: 0 }, // sniper far-field detail weight (0 in arcade)
    uCloudShade: { value: CLOUD_SHADE_DEFAULT }, // per-map cloud-shadow depth
    // aa-r1: composer-buffer texel size for the firefly clamp's diagonal
    // taps (kept in sync by applySize); uFirefly gates the whole block so
    // the perf probe can measure paired on/off medians on one build.
    uInvSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uFirefly: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uNear;
    uniform float uFar;
    uniform float uDensity;
    uniform float uDesat;
    uniform vec3 uCool;
    uniform float uHazeDensity;
    uniform float uHazeFull;
    uniform vec3 uHazeWarm;
    uniform vec3 uHazeCool;
    uniform vec3 uSunDir;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;
    uniform vec3 uCamFwd;
    uniform vec2 uTan;
    uniform vec3 uCamPos;
    uniform float uDetailW;
    uniform float uCloudShade;
    uniform vec2 uInvSize;
    uniform float uFirefly;
    varying vec2 vUv;
    // 2D value noise on a hashed integer lattice — smooth (quintic fade),
    // tileless, cheap enough for a fullscreen pass that only pays it while
    // scoped (uDetailW gates the whole block).
    float vhash( vec2 p ) {
      return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
    }
    float vnoise( vec2 p ) {
      vec2 i = floor( p );
      vec2 f = fract( p );
      vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
      return mix( mix( vhash( i ), vhash( i + vec2( 1.0, 0.0 ) ), u.x ),
                  mix( vhash( i + vec2( 0.0, 1.0 ) ), vhash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
    }
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      float depth = texture2D( tDepth, vUv ).x;
      if ( depth < 0.9999999 ) { // sky/cloud dome writes no depth — skip it
        // aa-r1 firefly clamp (see FIREFLY_* const block): cap isolated HDR
        // glints against the brightest diagonal neighbor BEFORE any aerial
        // work so the haze/bloom stages downstream see a stable frame. Sky
        // pixels (sun disc) never reach here — the depth gate excludes them.
        if ( uFirefly > 0.5 ) {
          float ffL = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          if ( ffL > ${FIREFLY_MIN.toFixed(3)} ) {
            vec3 ffW = vec3( 0.2126, 0.7152, 0.0722 );
            float nb = dot( texture2D( tDiffuse, vUv + uInvSize ).rgb, ffW );
            nb = max( nb, dot( texture2D( tDiffuse, vUv - uInvSize ).rgb, ffW ) );
            nb = max( nb, dot( texture2D( tDiffuse, vUv + vec2( uInvSize.x, -uInvSize.y ) ).rgb, ffW ) );
            nb = max( nb, dot( texture2D( tDiffuse, vUv + vec2( -uInvSize.x, uInvSize.y ) ).rgb, ffW ) );
            float ffCap = nb * ${FIREFLY_TOL.toFixed(3)} + ${FIREFLY_PAD.toFixed(3)};
            if ( ffL > ffCap ) texel.rgb *= ffCap / ffL;
          }
        }
        float viewZ = ( uNear * uFar ) / ( ( uFar - uNear ) * depth - uFar );
        // world-space view ray for this pixel (directional scatter tint)
        vec3 ray = normalize( uCamFwd
          + uCamRight * ( vUv.x * 2.0 - 1.0 ) * uTan.x
          + uCamUp * ( vUv.y * 2.0 - 1.0 ) * uTan.y );
        float sunAmt = pow( max( dot( ray, uSunDir ), 0.0 ), ${AERIAL_SUN_POW.toFixed(1)} );
        vec3 hazeCol = mix( uHazeCool, uHazeWarm, sunAmt );
        float rayT = -viewZ / max( dot( ray, uCamFwd ), 0.05 );
        // height-aware atmosphere (see AERIAL_HEIGHT_* const block): pixels
        // high above the battlefield datum sit in thinner air — scatter-in
        // (and a share of extinction) decays with altitude so mountain walls
        // haze bottom-up instead of wearing a screen-diagonal gradient band.
        float wy = uCamPos.y + ray.y * rayT;
        float hAtt = exp( -max( wy - uCamPos.y - ${AERIAL_HEIGHT_REF.toFixed(1)}, 0.0 )
          / ${AERIAL_HEIGHT_SCALE.toFixed(1)} );
        float x = -viewZ * uDensity;
        float f = 1.0 - exp( -x * x );
        f *= mix( 1.0, hAtt, ${AERIAL_HEIGHT_EXT_K.toFixed(2)} );
        float lum = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        vec3 hazy = mix( texel.rgb, vec3( lum ), uDesat ) * uCool;
        texel.rgb = mix( texel.rgb, hazy, f );
        // scattering-in: distance pulls everything toward the sun-directional
        // sky haze — warm near the sun azimuth, cool blue away from it.
        // r2 BLACK-POINT GUARD ("combat frame drowned in a warm low-contrast
        // veil ... lifted blacks"): scatter-in is additive skylight and used
        // to lift even the deepest shadow cores, so no pixel in a hazy frame
        // could reach display black. Pixels below ~0.05 linear luminance now
        // keep 75% of their darkness (they still shift hue with distance via
        // the extinction term above) — the frame keeps a true black anchor.
        // r6 midfield de-milk ("player_view midfield sits under a milky haze
        // veil ... fog starts too close and too bright for a clear noon
        // sky"): scatter-in now starts ~85 m out — the 150-350 m aim band
        // keeps its contrast while the far field still converges on the same
        // atmosphere (a ~28% cut at village range, <10% at 900 m).
        // Extinction/desat above still start at the camera, so depth cueing
        // stays continuous.
        float hzD = max( -viewZ - 85.0, 0.0 );
        // r6 sniper far-band give-back (see the uHazeFull uniform note).
        // lighting_post r7: 0.62 -> 0.50 — with the impostor band relit to
        // sun-matched albedo (horizon.js handoff) the full-density give-back
        // re-veiled it toward the cool haze pole at zoom; half density keeps
        // the backdrop atmospheric without re-tealing the canopy.
        float dHaze = max( uHazeDensity,
          uHazeFull * 0.50 * smoothstep( 430.0, 780.0, rayT ) );
        float x2 = hzD * dHaze;
        float f2 = 1.0 - exp( -x2 * x2 );
        f2 *= 0.25 + 0.75 * smoothstep( 0.0, 0.05, lum );
        f2 *= mix( 1.0, hAtt, ${AERIAL_HEIGHT_SCATTER_K.toFixed(2)} );
        texel.rgb = mix( texel.rgb, hazeCol, f2 );
        // large-scale cloud shadows / light patchiness (see CLOUD_SHADE
        // const block): world-anchored soft patches multiply the ground —
        // the sun visibility modulation establishing shots were missing.
        if ( uCloudShade > 0.003 ) {
          vec2 cp = ( uCamPos + ray * rayT ).xz;
          float cn = vnoise( cp * ( 1.0 / 340.0 ) ) * 0.62
                   + vnoise( cp * ( 1.0 / 131.0 ) + vec2( 4.7, 8.1 ) ) * 0.38;
          texel.rgb *= 1.0 - uCloudShade * smoothstep( 0.52, 0.80, cn );
        }
        // far-field hue clamp (see AERIAL_HUE_CLAMP_* const block): distant
        // green-dominant pixels are forced toward same-luma blue-grey so the
        // horizon band can never read jade-green — zoom-independent, unlike
        // the density curves above.
        float hueW = ${AERIAL_HUE_CLAMP_MAX.toFixed(3)}
          * smoothstep( ${AERIAL_HUE_CLAMP_NEAR.toFixed(1)}, ${AERIAL_HUE_CLAMP_FAR.toFixed(1)}, rayT );
        if ( hueW > 0.002 ) {
          float gDom = smoothstep( 0.0, 0.032, texel.g - texel.b );
          float hl = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
          vec3 grey = hl * vec3( ${AERIAL_HUE_GREY[0].toFixed(3)}, ${AERIAL_HUE_GREY[1].toFixed(3)}, ${AERIAL_HUE_GREY[2].toFixed(3)} );
          texel.rgb = mix( texel.rgb, grey, hueW * gDom );
        }
        // far-field detail (see AERIAL_DETAIL_* const block): world-anchored
        // value noise re-textures backdrop surfaces the x8 scope magnifies
        // past their bake frequency — and, at a reduced share, the horizon
        // ring / far forest in ARCADE establishing shots (bare-gradient fix).
        {
          float dwS = uDetailW * smoothstep( ${AERIAL_DETAIL_NEAR.toFixed(1)}, ${AERIAL_DETAIL_FAR.toFixed(1)}, rayT );
          float dw = max( dwS, ${AERIAL_DETAIL_ARCADE.toFixed(2)}
            * smoothstep( ${AERIAL_DETAIL_ARCADE_NEAR.toFixed(1)}, ${AERIAL_DETAIL_ARCADE_FAR.toFixed(1)}, rayT ) );
          if ( dw > 0.003 ) {
            vec3 wp = uCamPos + ray * rayT;
            // slope-aware planar coords: xz carries flat ground, the y term
            // keeps texture alive on the near-vertical horizon-ring faces
            vec2 dp = wp.xz + vec2( wp.y * 0.85, wp.y * 0.37 );
            float dnM = vnoise( dp * ( 1.0 / 15.0 ) );
            float dn = dnM * 0.42
                     + vnoise( dp * ( 1.0 / 4.6 ) + vec2( 7.3, 2.9 ) ) * 0.28
                     + vnoise( dp * ( 1.0 / 1.6 ) + vec2( 3.1, 9.7 ) ) * 0.17
                     // finest octave is SCOPE-ONLY (subpixel grain shimmers
                     // in arcade pans; under x8 it reads as grass/leaf grain)
                     + ( vnoise( dp * ( 1.0 / 0.55 ) + vec2( 9.4, 4.2 ) ) - 0.5 ) * 0.13 * ( dwS / max( dw, 1e-3 ) )
                     + 0.065;
            texel.rgb *= 1.0 + ( dn - 0.5 ) * ${AERIAL_DETAIL_AMP.toFixed(3)} * dw;
            // green-keyed chroma octave: swings far grass/canopy between
            // olive and warm dry-brown at ~15 m patch scale, so magnified
            // fields read as real mixed meadow instead of one flat hue.
            float gVar = smoothstep( 0.0, 0.06, texel.g - texel.b ) * dw;
            texel.rgb *= mix( vec3( 1.0 ), vec3( 1.075, 0.995, 0.86 ), ( dnM - 0.5 ) * 1.7 * gVar );
          }
        }
      }
      // pre-tonemap emissive shoulder (see EM_SHOULDER_* const block): hue-
      // preserving rational rolloff on very hot pixels (additive fire/flash
      // stacks) so ACES receives a gradient instead of a 5-20 clipped plateau.
      // Applied to every pixel: sky self-caps below the start, diffuse cannot
      // reach it, so only true emissives are touched.
      float emL = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      if ( emL > ${EM_SHOULDER_START.toFixed(3)} ) {
        float emOver = emL - ${EM_SHOULDER_START.toFixed(3)};
        float emTarget = ${EM_SHOULDER_START.toFixed(3)}
          + emOver / ( 1.0 + emOver / ${EM_SHOULDER_RANGE.toFixed(3)} );
        texel.rgb *= emTarget / emL;
      }
      gl_FragColor = texel;
    }`,
};

// Final grade (applied after output conversion, i.e. in display sRGB space):
// S-curve contrast, saturation, subtle corner vignette, a real black anchor
// and ONE fixed warm white balance — the same grade for every camera, so the
// battlefield establishing shot and the combat closeup read as one game
// (r3: "battlefield is cool and washed out while combat_firing is warm and
// punchy — looks like two different games"). r3 tuning: vignette 0.32 → 0.17
// (the old strength stacked with canopy shadows into unmotivated black corner
// masses), saturation 1.15 → 1.08 (distance desat now comes from the aerial
// pass; global oversaturation was amplifying the foliage albedo clash),
// black anchor 0.01 → 0.006.
// r4 grade identity pass ("neutral washed tonemapping, no grade identity"):
// contrast 1.12 → 1.18 for a punchier midtone S-curve, black anchor 0.006 →
// 0.010 so shadow cores actually reach display black, vignette 0.17 → 0.23,
// and a NEW luminance-keyed split-tone — highlights pulled warm (sun family),
// shadows pulled cool blue-grey — the classic AAA warm/cool grade axis. The
// old fixed warm balance is softened (1.04 → 1.02 red) so shadows are allowed
// to actually go cool instead of being re-warmed globally.
// r5 ("grade is low-contrast with slightly lifted blacks; palette split
// between olive terrain and cyan sky"): contrast 1.18 → 1.26 (~10% more
// midtone S-curve), black anchor 0.010 → 0.016 (pull blacks down ~5% so
// shadow cores reach true display black), and a NEW green-warming term (see
// uGreenWarm below) that shifts green-dominant terrain/foliage pixels toward
// warm summer green, unifying them with the warm-key sky like WoT.
// r6 ("tonemapping/color grading is neutral and flat: midtones washed, blacks
// lifted, no filmic contrast or grade identity"): contrast 1.26 → 1.34,
// black anchor 0.016 → 0.021 (shadow cores hit true display black),
// saturation 1.08 → 1.10, vignette 0.23 → 0.27, and both split-tone poles
// pushed ~40% further apart so the warm-highlight/cool-shadow axis is an
// unmistakable grade identity rather than a subliminal one. A soft highlight
// shoulder (GRADE_KNEE*) rolls speculars/sky whites off instead of clipping
// — the barrel-top hot edge and the horizon band stop slamming to 1.0.
// r7 PIVOT FIX ("midtone contrast is low, highlights and midtones compress
// into the same band; foreground reads underexposed"): the contrast op was a
// linear expansion around DISPLAY 0.5 — but pixel-measuring the frozen shots
// put the entire lit playfield at 0.20-0.30 display luma, i.e. the whole
// scene sat BELOW the pivot, so "more contrast" only dragged every midtone
// darker (lit grass 0.21, hull flank 0.09) while the hazy hills/sky (0.45+)
// stretched brighter — the exact "dark flat foreground under a bright far
// field" split the critic flagged. The pivot now sits at 0.33, inside the
// scene's actual midtone band: contrast separates lit-vs-shadow around the
// playfield instead of crushing all of it, and the light-rig lift
// (lighting.ts hemi bounce floor + renderer exposure 1.08 → 1.16) moves the
// lit field up toward the WoT ~0.35 reference. Black anchor eases 0.021 →
// 0.012 (the anchor no longer needs to fake density the pivot now provides).
// Greens: measured lit grass rgb was (0.25,0.21,0.04) — blue channel ~zero,
// the "lime-yellow drift" — because GREEN_WARM 0.90-blue x high-tint
// 0.925-blue x balance 0.975-blue compounded to a 0.81 blue kill on every
// green-dominant highlight. GREEN_WARM softened to a hue nudge, a dedicated
// ~9% green desaturation term (uGreenDesat) pulls foliage chroma back to the
// WoT olive band, and global saturation eases 1.10 → 1.06.
// r6 grade-identity push ("tonemapping/color grading is neutral and flat —
// AAA tank games ship a strong LUT: warm highlights, cooled shadows, punchy
// contrast, subtle vignette"): contrast 1.30 → 1.36 around the same measured
// 0.33 pivot, saturation 1.06 → 1.09, vignette 0.24 → 0.26, and the split-
// tone poles pushed ~20% further apart (below). Paired with renderer.ts
// exposure 1.16 → 1.20 so the midtone band holds its WoT-reference level
// while lit-vs-shadow separation deepens (contrast alone would drag the
// sub-pivot playfield darker — the r7 failure mode).
// r5 ("verdant gameplay cameras are oversaturated acid green-yellow — neon
// mobile-game; real WoT ground is desaturated multi-hue"): global saturation
// 1.09 → 1.045 (~-4% overall, and the aerial chroma octave now supplies hue
// VARIETY so the field no longer needs raw chroma to read alive), green
// chroma pull 0.12 → 0.19, and the green-warm hue nudge halved (below) so
// the blue channel of grass stops being driven to ~0 (the lime-acid tell).
const GRADE_CONTRAST = 1.36;
const GRADE_PIVOT = 0.33;
const GRADE_SATURATION = 1.045;
// r4 LP2 ("vignette stacks to a ~30-35% corner luminance falloff on bright
// daylight wides — sky corners [121,155,164] vs [187,217,219] center; reads
// as a filter, not photography"): 0.26 → 0.21, and the shader now keys the
// vignette to the PIXEL's own luma — bright sky/haze corners keep >=60% of
// their level (a sunny establishing shot must not wear a dusk filter) while
// midtone/dark corners keep the full grade weight for combat framing.
// terrain_environment r4: -> 0.14 — the corner darkening on establishing
// shots read as an Instagram filter, not lens shading (critique, minor)
const GRADE_VIGNETTE = 0.14;
const GRADE_VIGNETTE_BRIGHT_KEEP = 0.62; // fraction of vignette removed on bright pixels
// r2: 0.012 → 0.015 — paired with the aerial black-point guard so combat
// frames under smoke/haze keep a true display-black anchor (the r2 critique's
// "lifted blacks" veil read).
// lighting_post r7 ("lifted black floor across the wide shots: no pixel
// reaches a true dark, shadow interiors are milky"): 0.015 → 0.022 — canopy
// shadow cores and building interiors now anchor at ~5% display luma. The
// grade's low-end contrast taper (smoothstep 0.045-0.30 below) still holds
// the 0.08-0.25 shadow BODY band, so only the deepest cores take the toe.
const GRADE_BLACK_LIFT = 0.022;
// r3 ("desert is exposure-blown: sand midtones near RGB 245, dune relief
// unreadable"): knee 0.86 → 0.82 — the rational shoulder starts a step lower
// so the sand/snow top-end re-spreads into readable texture; paired with the
// earlier high-luma contrast taper below (0.60 → 0.52) and the per-map
// uExposure trim (sky preset `postExposure`, e.g. desert 0.88).
// r4 LP2 ("tank_closeup_modern: near-sepia warm cast floods the road and a
// pale blown sky band upper-left"): 0.82 → 0.80 — the shoulder starts a step
// lower so cream road/field highlights re-spread instead of pooling in the
// warm split-tone band.
const GRADE_KNEE = 0.80; // display-space luma where the highlight shoulder starts
// (r9: the linear GRADE_KNEE_SLOPE 0.55 knee was replaced by a rational
// shoulder in the shader — see the "soft highlight shoulder" note there.)
// Warm afternoon balance, matching the sun key instead of fighting it.
const GRADE_BALANCE = [1.02, 1.0, 0.975];
// Applied only to green-dominant pixels (terrain/foliage): warms hue toward
// yellow-green without touching sky, tank camo browns, or skin-tone-ish dirt.
const GRADE_GREEN_WARM = [1.016, 1.0, 0.982]; // r5: halved — see saturation note
// r2: 0.09 → 0.12 — "grass is a flat saturated lime-green albedo ... WoT
// grass is desaturated olive"; the extra chroma pull moves the whole green
// band toward the olive reference (terrain.js albedo desat carries the rest).
const GRADE_GREEN_DESAT = 0.19; // chroma pull-back on green-dominant pixels (r5: 0.12 → 0.19, olive band)
// Split-tone poles (multiplied in by shadow/highlight membership).
// r4 LP2: highlight pole eased ~25% ([1.074,1.010,0.930] → [1.056,1.008,0.947])
// — at full strength the warm pole compounded with the sun key into the
// closeup "near-sepia wash" over roads/fields; the warm/cool grade axis stays
// clearly legible (shadow pole untouched) without flooding bright neutrals.
const GRADE_SHADOW_TINT = [0.936, 0.986, 1.084]; // cool blue-grey shadows
const GRADE_HIGH_TINT = [1.056, 1.008, 0.947]; // warm sun-kissed highlights

// SNIPER SCOPE TREATMENT (r8 — "sniper view has no scope treatment at all: no
// vignette, no edge blur, it is the raw frame with HUD lines"). Applied in
// THIS pass (last in the chain) and gated per frame on the rig's live
// `camera.userData.scoped` flag — the same flag the harness's snapSniper()
// sets — so the treatment can never miss the capture path again:
//  - a circular sight-picture vignette (aspect-corrected, so it reads as a
//    scope tube, not a screen-corner gradient),
//  - a mild radial blur past ~80% of the picture radius (optics falloff).
// r4 (controls_gunnery): WoT's sniper vignette is near-invisible and its edge
// blur barely perceptible — the r3 treatment (start 0.66/0.80, step 0.011)
// smeared the outer ~25% of the frame into tilt-shift mush and swallowed a
// burning wreck on the frame edge. Blur now only touches the outer ~10% of
// the sight picture at half the radius, and the tube vignette starts past
// the mid-field so situational awareness while scoped matches WoT.
// hud_ui r6 (MAJOR): the r5 opaque scope-shadow circle blacked out ~40-45%
// of the 1920x1080 frame — PC WoT sniper mode is FULL-SCREEN with only a
// subtle corner vignette (the hard tube mask is budget-WT scope-shadow
// grammar, and it left the team panels/minimap floating in a void). The
// black cut is gone: the treatment is now a gentle inner falloff plus a
// ~13% CORNER-ONLY darkening (scopeR ~2.0 at the frame corners), with the
// radial optics blur pushed out so it only kisses the frame edges.
// gameplay_feel r5 (round critique MAJOR: "no visible scope-shadow vignette
// at any zoom — the scope reads as raw FOV zoom"; movement-physics.md §9.2
// requires a "full-screen black vignette ring"): the 0.10/0.13 shade was
// invisible at 1080p in daylight. The ring now reads: sight picture clear to
// ~r 0.62, top/bottom frame edges ×0.77, left/right edges ×0.41, extreme
// corners ×0.27 — a daylight-readable circular scope shadow, still a soft
// roll (no hard tube mask, the hud_ui r6 no-go), HUD/panels unaffected
// (they composite above the post chain).
// lighting_post r6 (critical: "sniper_view exposure/grading collapse — at x8
// the whole frame drops ~2 stops into an olive-green murk ... the scope view
// looks like a different, broken renderer"): pixel-measured on the frozen
// capture, the r5 ring shaded the lower midfield ×0.87 and the upper horizon
// band ×0.55 — stacked onto the zoom de-haze (see AERIAL_ZOOM_* below) the
// sight picture read two stops under the arcade frame of the same scene.
// lighting_post r7 (CRITICAL: "top ~40% of frame is under a heavy dark veil —
// scope vignette overreach darkening the whole scoreboard band and horizon,
// not just corners"): the two-term stack (inner falloff from scopeR 0.72 +
// corner shade from 1.25) still hit the TOP-CENTER of a 16:9 frame at ~11%
// (scopeR = 1.0 there) and the top corners at ~45%, and it compounded with
// the scoped highlight pull below into the "murky veil" read. Rebuilt as ONE
// strictly corner-weighted radial term in CORNER-NORMALIZED radius (1.0 = the
// exact frame corner at any aspect): zero effect inside 0.60 of the corner
// radius (top-center sits at 0.49 — untouched), reaching SCOPE_VIGNETTE_MAX
// only at the extreme corners. WoT's sniper shade is corner-only; the sight
// picture, scoreboard band and horizon keep full scene exposure.
const SCOPE_VIGNETTE_INNER = 0.60; // corner-normalized radius where shade begins
const SCOPE_VIGNETTE_MAX = 0.20; // ×0.80 at the extreme frame corners only
// hud_ui r4: blur only kisses the outer ~20% of screen radius at ~40% strength
// (the old 1.02 start put the outer thirds of a 16:9 frame at FULL blur —
// "left and right thirds dissolve into watercolor streaks" at x8)
const SCOPE_BLUR_START = 1.42;
const SCOPE_BLUR_RAMP = 0.5; // blur reaches full strength at START+RAMP
const SCOPE_BLUR_STEP = 0.0028; // UV step of the 4-tap radial blur at full blur

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: GRADE_CONTRAST },
    uSaturation: { value: GRADE_SATURATION },
    uVignette: { value: GRADE_VIGNETTE },
    uBlack: { value: GRADE_BLACK_LIFT },
    uBalance: { value: new THREE.Vector3(...GRADE_BALANCE) },
    uShadowTint: { value: new THREE.Vector3(...GRADE_SHADOW_TINT) },
    uHighTint: { value: new THREE.Vector3(...GRADE_HIGH_TINT) },
    uGreenWarm: { value: new THREE.Vector3(...GRADE_GREEN_WARM) },
    // r3 per-map display exposure trim: driven per frame from
    // scene.userData.postExposure (written by sky.ts applyPreset from the
    // map preset's `postExposure`, default 1.0). Multiplies BEFORE the
    // grade's contrast/knee so a -0.2 EV desert trim re-seats sand midtones
    // into the readable band instead of just dimming the final image.
    uExposure: { value: 1 },
    uScope: { value: 0 }, // 0 = arcade, 1 = sniper (eased by render())
    // r4: zoom-scaled center unsharp while scoped — the x8 picture magnifies
    // terrain/horizon texels far past their mip frequency and the far field
    // reads as watercolor smear; a mild radius-1 unsharp restores edge
    // definition. 0 at x2 and in arcade; driven from camera.fov in render().
    uSharp: { value: 0 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uBlack;
    uniform vec3 uBalance;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform vec3 uGreenWarm;
    uniform float uExposure;
    uniform float uScope;
    uniform float uSharp;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      // sniper scope: radial optics blur on the outer ~10% of the sight-
      // picture radius (aspect-corrected circle) — sampled BEFORE the grade
      // so the blurred edge goes through the exact same color pipeline
      float scopeR = 0.0;
      if ( uScope > 0.001 ) {
        vec2 sq = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
        scopeR = length( sq ) * 2.0;
        float blurW = uScope * smoothstep( ${SCOPE_BLUR_START.toFixed(3)}, ${(SCOPE_BLUR_START + SCOPE_BLUR_RAMP).toFixed(3)}, scopeR );
        if ( blurW > 0.001 ) {
          vec2 st = ( sq / max( scopeR, 1e-4 ) ) / vec2( uAspect, 1.0 )
            * ${SCOPE_BLUR_STEP.toFixed(4)} * blurW;
          vec4 acc = texel;
          acc += texture2D( tDiffuse, vUv - st * 1.5 );
          acc += texture2D( tDiffuse, vUv - st * 0.75 );
          acc += texture2D( tDiffuse, vUv + st * 0.75 );
          acc += texture2D( tDiffuse, vUv + st * 1.5 );
          texel = acc * 0.2;
        }
        // high-zoom center unsharp (r4): counteracts the mip-frequency
        // watercolor smear on the magnified far field; skips the blur ring.
        // aa-r1: the sharpen DELTA is now soft-limited to ±0.085 display
        // units. The x8 sight picture magnifies minified foliage into a
        // churning 1px leaf checkerboard; an UNBOUNDED unsharp re-amplified
        // exactly that churn (the motion-burst crops showed near-full-
        // contrast seethe across every scoped crown). Real structural edges
        // sharpen on deltas well under the cap, so the tack-sharp x8 read is
        // kept while single-pixel flicker stops being multiplied.
        float sharpW = uSharp * ( 1.0 - smoothstep( ${(SCOPE_BLUR_START - 0.08).toFixed(3)}, ${SCOPE_BLUR_START.toFixed(3)}, scopeR ) );
        if ( sharpW > 0.001 ) {
          vec2 px = vec2( 0.0009 / uAspect, 0.0009 ); // ~1 px at 1080p (r5: tighter kernel = crisper x8)
          vec3 nb = texture2D( tDiffuse, vUv + vec2( px.x, 0.0 ) ).rgb
                  + texture2D( tDiffuse, vUv - vec2( px.x, 0.0 ) ).rgb
                  + texture2D( tDiffuse, vUv + vec2( 0.0, px.y ) ).rgb
                  + texture2D( tDiffuse, vUv - vec2( 0.0, px.y ) ).rgb;
          vec3 shD = clamp( ( texel.rgb - nb * 0.25 ) * sharpW, vec3( -0.085 ), vec3( 0.085 ) );
          texel.rgb = max( texel.rgb + shD, 0.0 );
        }
      }
      vec3 col = texel.rgb;
      // per-map display exposure trim (sky preset postExposure, default 1.0)
      col *= uExposure;
      // gameplay_feel r6 (round critique MINOR): sun-facing scoped washout —
      // while scoped, pull the BRIGHT end (luma-keyed: shadow/midtone level
      // untouched) so bright ground + haze + bloom can no longer stack the
      // upper half of the sight picture into unreadable near-white milk.
      // Pairs with the scoped bloom/aerial trims in render().
      // lighting_post r7: 0.30 over 0.34-0.95 was a second whole-frame veil —
      // it dragged every ordinary 0.4-0.6 luma pixel (horizon band, scree,
      // sky) 8-14% darker and stacked with the old vignette into the "top
      // 40% under a murky veil" critical. Only true near-milk is pulled now.
      if ( uScope > 0.001 ) {
        float scLum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        col *= 1.0 - 0.14 * uScope * smoothstep( 0.62, 0.97, scLum );
      }
      // fixed warm white balance — identical for every camera/shot
      col = clamp( col * uBalance, 0.0, 1.0 );
      // warm the terrain/foliage greens only (green-dominant pixels): unifies
      // the olive ground plane with the warm sun key, WoT summer-map style;
      // then pull their chroma back ~9% so foliage sits in the olive band
      // instead of drifting lime-yellow (r7 — measured blue channel ~0.04)
      float greenDom = smoothstep( 0.0, 0.14, col.g - max( col.r, col.b ) );
      col *= mix( vec3( 1.0 ), uGreenWarm, greenDom );
      float gLuma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( col, vec3( gLuma ), ${GRADE_GREEN_DESAT.toFixed(3)} * greenDom );
      // r2 FOLIAGE HIGHLIGHT SHOULDER ("bushes blow out to near-white lime
      // with no rolloff"): sunlit high-chroma greens were riding the ACES
      // per-channel top end into a clipped lime — real vegetation highlights
      // desaturate toward pale warm green and roll off, they never peg the
      // green channel. Above ~0.58 display luma, green-dominant pixels lose
      // chroma progressively (up to 35%) and ease down ~12% in level, so
      // canopy/bush hot spots keep leaf texture instead of clipping.
      // r4 LP2: 0.35/0.12 → 0.46/0.15 — sniper-view right-side foreground
      // foliage still clipped to flat lime; hot green leaves now roll off
      // harder toward pale warm green (real canopy highlight behavior).
      float gHot = greenDom * smoothstep( 0.58, 0.90, gLuma );
      col = mix( col, vec3( gLuma ), 0.46 * gHot );
      col *= 1.0 - 0.15 * gHot;
      // black anchor + linear contrast around the scene's measured midtone
      // band (uPivot ~0.33, NOT display 0.5 — see the r7 note above).
      // r6 HIGH-LUMA TAPER: the above-pivot expansion is what shoved snow
      // fields, desert sand and the horizon haze band toward clipped white
      // when contrast rose to 1.36 (a 0.80-luma snow pixel stretched to
      // 0.97). The contrast gain now eases back to 1.0 across 0.60-0.95
      // luma, so the S-curve buys its lit-vs-shadow punch in the playfield
      // band while brights keep their measured level and texture.
      col = max( col - vec3( uBlack ), vec3( 0.0 ) );
      float cLuma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      float cGain = uContrast - ( uContrast - 1.0 ) * smoothstep( 0.52, 0.90, cLuma );
      // r5 LOW-END TAPER ("player-view shadow floor is near-black — blue-sky
      // daylight should fill shadows to ~35-45%"): the sub-pivot expansion
      // was dragging the whole 0.08-0.25 SHADOW-BODY band toward black on
      // top of the ACES toe (measured: a 20% linear road shadow displayed at
      // 11%). Ease the contrast gain out below ~0.30 luma so shadow bodies
      // keep their fill while crevice/AO cores (< ~0.05) still reach the
      // black anchor and the midtone S-curve identity is untouched.
      cGain = mix( 1.0, cGain, smoothstep( 0.045, 0.30, cLuma ) );
      col = clamp( mix( vec3( ${GRADE_PIVOT.toFixed(3)} ), col, cGain ), 0.0, 1.0 );
      // split-tone: cool shadows / warm highlights, keyed on luminance.
      // lighting_post r7 ("combat_firing white balance is split within the
      // frame: dirt road stays cool blue-gray while adjacent grass carries
      // the warm golden grade"): the 0.12-0.72 band held a 0.35-0.45-luma
      // road at ~50% shadow-tint membership while brighter grass beside it
      // rode the warm pole — two white balances in one frame. Band tightened
      // to 0.10-0.55: midtone ground now shares the warm side with its
      // surroundings; true shadows (<0.15) keep the full cool pole.
      float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 split = mix( uShadowTint, uHighTint, smoothstep( 0.10, 0.55, luma ) );
      col = clamp( col * split, 0.0, 1.0 );
      // soft highlight shoulder: roll near-white values off instead of
      // clipping (metal speculars, horizon band) — filmic top-end.
      // r9: the old LINEAR knee (slope 0.55) mapped the whole 0.86-1.0 input
      // band into 0.86-0.94 at constant slope — desert sand and urban
      // sidewalk fields all collapsed into one flat "textureless near-white"
      // band. Rational shoulder instead: smooth derivative at the knee,
      // asymptote 1.0, monotone spread — top-end texture stays ordered and
      // visible instead of quantizing into a plateau.
      vec3 over = max( col - vec3( ${GRADE_KNEE.toFixed(3)} ), vec3( 0.0 ) );
      col = min( col, vec3( ${GRADE_KNEE.toFixed(3)} ) )
        + over / ( 1.0 + over / ${(1 - GRADE_KNEE).toFixed(3)} );
      // saturation
      luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = clamp( mix( vec3( luma ), col, uSaturation ), 0.0, 1.0 );
      // vignette (radial, corners only) — luma-adaptive: bright sky/haze
      // corners keep most of their level so sunny establishing shots read
      // as photography, not a dusk filter (see GRADE_VIGNETTE note)
      vec2 q = vUv - 0.5;
      float vigL = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      float vig = uVignette * ( 1.0 - ${GRADE_VIGNETTE_BRIGHT_KEEP.toFixed(3)}
        * smoothstep( 0.45, 0.75, vigL ) );
      col *= 1.0 - vig * smoothstep( 0.34, 1.15, dot( q, q ) * 2.0 ); // terrain_environment r4: wider falloff
      // sniper optics (lighting_post r7): corner-only shade in corner-
      // normalized radius — zero inside 0.60 of the corner distance, max 20%
      // at the extreme corners. Never touches the top/bottom frame centers
      // (the r7 "dark veil over the whole scoreboard band" fix). No opaque
      // scope-tube cut (WoT sniper never masks the frame).
      if ( uScope > 0.001 ) {
        float cornerR = scopeR / length( vec2( uAspect, 1.0 ) );
        col *= 1.0 - uScope * ${SCOPE_VIGNETTE_MAX.toFixed(3)}
          * smoothstep( ${SCOPE_VIGNETTE_INNER.toFixed(3)}, 1.0, cornerR );
      }
      // lighting_post r7 ("deep-blue-to-haze sky transition shows visible
      // gradient banding" on desert): the grade's contrast/knee re-spreads
      // the 8-bit-bound sky ramp and re-quantizes it. A ±0.7 LSB interleaved-
      // gradient-noise dither at the very end of the display chain breaks
      // every low-frequency ramp (sky dome, haze band, vignette falloff)
      // below the visibility threshold — IGN has a far better spectrum for
      // this than white noise, and 1080p captures stay deterministic.
      float ign = fract( 52.9829189 * fract(
        dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
      col += ( ign - 0.5 ) * ( 1.4 / 255.0 );
      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), texel.a );
    }`,
};

// OutputPass and the display grade used to be two consecutive native-size
// fullscreen draws. Fuse them without changing color math: OutputPass still
// owns the renderer-driven tone-mapping/output-space defines and exposure,
// while every GradeShader source sample is converted to display space before
// the grade touches it. The latter matters for scope blur/unsharp taps — only
// transforming the center texel would make scoped frames differ from the old
// two-pass result.
function createOutputGradePass(): OutputGradePass {
  const sampleAnchor = 'texture2D( tDiffuse,';
  let fragmentShader = GradeShader.fragmentShader.split(sampleAnchor).join('sampleDisplay(');
  const parsAnchor = 'uniform sampler2D tDiffuse;';
  const outputPars = /* glsl */ `precision highp float;
    uniform sampler2D tDiffuse;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>

    vec4 sampleDisplay( vec2 sampleUv ) {
      vec4 outputColor = texture2D( tDiffuse, sampleUv );
      #ifdef LINEAR_TONE_MAPPING
        outputColor.rgb = LinearToneMapping( outputColor.rgb );
      #elif defined( REINHARD_TONE_MAPPING )
        outputColor.rgb = ReinhardToneMapping( outputColor.rgb );
      #elif defined( CINEON_TONE_MAPPING )
        outputColor.rgb = CineonToneMapping( outputColor.rgb );
      #elif defined( ACES_FILMIC_TONE_MAPPING )
        outputColor.rgb = ACESFilmicToneMapping( outputColor.rgb );
      #elif defined( AGX_TONE_MAPPING )
        outputColor.rgb = AgXToneMapping( outputColor.rgb );
      #elif defined( NEUTRAL_TONE_MAPPING )
        outputColor.rgb = NeutralToneMapping( outputColor.rgb );
      #elif defined( CUSTOM_TONE_MAPPING )
        outputColor.rgb = CustomToneMapping( outputColor.rgb );
      #endif
      #ifdef SRGB_TRANSFER
        outputColor = sRGBTransferOETF( outputColor );
      #endif
      return outputColor;
    }`;
  const patched = fragmentShader.replace(parsAnchor, outputPars);
  if (patched === fragmentShader || !patched.includes('sampleDisplay( vUv )')) {
    throw new Error('post.ts: output-grade shader anchors not found');
  }
  fragmentShader = patched;

  const pass = new OutputPass() as OutputGradePass;
  Object.assign(pass.uniforms, THREE.UniformsUtils.clone(GradeShader.uniforms));
  pass.material.name = 'OutputGradePass';
  pass.material.uniforms = pass.uniforms;
  pass.material.fragmentShader = fragmentShader;
  pass.material.needsUpdate = true;
  pass.isOutputGradePass = true;
  return pass;
}

/** Scale a linear color down so its Rec709 luminance is <= maxLum (hue kept).
 * @param {THREE.Color} c @param {number} maxLum @returns {void} */
function capLuminance(c: THREE.Color, maxLum: number): void {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum > maxLum) c.multiplyScalar(maxLum / lum);
}

function requireDepthTexture(
  target: THREE.WebGLRenderTarget,
  owner: string,
): THREE.DepthTexture {
  const texture = target.depthTexture;
  if (!texture) throw new Error(`post.ts: ${owner} requires an attached depth texture`);
  return texture;
}

/**
 * Render the world into a dedicated multisampled HDR target, resolve it, then
 * copy the resolved color into the composer's current read buffer. Keeping the
 * composer buffers single-sampled is important: otherwise every aerial/AO/
 * bloom/grade/SMAA fullscreen draw would pay MSAA bandwidth for no visual gain.
 */
class SceneAAPass extends RenderPass {
  readonly sceneTarget: THREE.WebGLRenderTarget;
  readonly copyMaterial: THREE.ShaderMaterial;
  readonly copyQuad: FullScreenQuad;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    target: THREE.WebGLRenderTarget,
  ) {
    super(scene, camera);
    this.sceneTarget = target;
    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'SceneAAPass.Copy',
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.copyMaterial.uniforms.tDiffuse.value = target.texture;
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
  }

  setSize(width: number, height: number): void {
    this.sceneTarget.setSize(width, height);
  }

  setSamples(samples: number): void {
    if (this.sceneTarget.samples === samples) return;
    this.sceneTarget.samples = samples;
    // Sample count is part of the framebuffer allocation. Dispose only the
    // GPU objects; Three recreates them lazily with the same target/textures.
    this.sceneTarget.dispose();
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const oldAutoClear = renderer.autoClear;
    const oldLayerMask = this.camera.layers.mask;
    renderer.autoClear = false;
    try {
      // Layer 30 is transparent combat media and must wait until the opaque
      // scene depth is resolved. It is deliberately absent from this pass.
      this.camera.layers.disable(LATE_FX_LAYER);
      renderer.setRenderTarget(this.sceneTarget);
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      renderer.render(this.scene, this.camera);

      // One cheap full-screen draw hands the resolved scene to the composer's
      // single-sampled ping-pong chain.
      this.copyMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      this.copyQuad.render(renderer);
    } finally {
      this.camera.layers.mask = oldLayerMask;
      renderer.autoClear = oldAutoClear;
    }
  }
}

/**
 * Composite transparent combat media after distance haze and GTAO. Puffs
 * already fog themselves at their own camera-space depth; running them before
 * the depth-driven post passes made the mountain/terrain depth behind a puff
 * haze the puff a second time, visually stamping the ridge across a foreground
 * smoke column. This pass avoids that category error and gives the shaders a
 * resolved scene-depth source for soft intersections.
 */
class LateFxPass extends Pass {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sceneTarget: THREE.WebGLRenderTarget;
  readonly target: THREE.WebGLRenderTarget;
  readonly sceneDepth: THREE.DepthTexture;
  readonly targetDepth: THREE.DepthTexture;
  softState: LateFxSoftState | null;
  softDepthCopies: number;
  prepared: boolean;
  readonly copyMaterial: THREE.ShaderMaterial;
  readonly copyQuad: FullScreenQuad;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    sceneTarget: THREE.WebGLRenderTarget,
    target: THREE.WebGLRenderTarget,
    softState: LateFxSoftState | null,
  ) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.sceneTarget = sceneTarget;
    this.target = target;
    this.sceneDepth = requireDepthTexture(sceneTarget, 'LateFxPass scene target');
    this.targetDepth = requireDepthTexture(target, 'LateFxPass composite target');
    this.softState = softState;
    this.needsSwap = false;
    this.softDepthCopies = 0;
    this.prepared = false;
    this.copyMaterial = new THREE.ShaderMaterial({
      name: 'LateFxPass.Copy',
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
  }
  /**
   * Bind the demand-loaded combat FX state after the post stack already
   * exists. Garage boot deliberately constructs this pass before importing
   * effects.ts, so constructor-time scene discovery alone cannot be the
   * ownership seam.
   */
  setSoftState(softState: LateFxSoftState | null): void {
    if (this.softState === softState) return;
    this.softState = softState || null;
    this.prepared = false;
    if (this.softState) {
      this.softState.uSoftViewport.value.set(this.target.width, this.target.height);
      this.softState.uCameraNear.value = this.camera.near;
      this.softState.uCameraFar.value = this.camera.far;
    }
  }
  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    if (this.softState) this.softState.uSoftViewport.value.set(width, height);
    this.prepared = false;
  }
  prepare(renderer: THREE.WebGLRenderer): void {
    if (this.prepared) return;
    renderer.initRenderTarget(this.sceneTarget);
    renderer.initRenderTarget(this.target);
    if (this.softState) {
      this.softState.uSceneDepth.value = this.sceneDepth;
      this.softState.uSoftViewport.value.set(this.target.width, this.target.height);
      this.softState.uCameraNear.value = this.camera.near;
      this.softState.uCameraFar.value = this.camera.far;
    }
    this.prepared = true;
  }
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const softState = this.softState;
    if (!softState || !softState.isActive()) {
      this.needsSwap = false;
      return;
    }
    this.needsSwap = true;
    this.prepare(renderer);
    const oldAutoClear = renderer.autoClear;
    const oldLayerMask = this.camera.layers.mask;
    renderer.autoClear = false;
    try {
      // Copy the already-hazed/AO-grounded opaque world, then attach a copy of
      // its resolved depth. The shader samples sceneTarget.depthTexture while
      // hardware depth testing uses target.depthTexture: source and attached
      // destination are distinct, so there is no framebuffer feedback loop.
      renderer.setRenderTarget(this.target);
      renderer.clear(true, true, true);
      this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
      this.copyQuad.render(renderer);
      renderer.copyTextureToTexture(this.sceneDepth, this.targetDepth);
      this.softDepthCopies++;
      softState.uSceneDepth.value = this.sceneDepth;
      softState.uCameraNear.value = this.camera.near;
      softState.uCameraFar.value = this.camera.far;

      const oldBackground = this.scene.background;
      this.scene.background = null;
      try {
        this.camera.layers.set(LATE_FX_LAYER);
        renderer.setRenderTarget(this.target);
        renderer.render(this.scene, this.camera);
      } finally {
        this.scene.background = oldBackground;
      }

      this.copyMaterial.uniforms.tDiffuse.value = this.target.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.copyQuad.render(renderer);
    } finally {
      this.camera.layers.mask = oldLayerMask;
      renderer.autoClear = oldAutoClear;
    }
  }
}

/**
 * Build the EffectComposer chain with a scene-only multisampled HDR target and
 * single-sampled HDR post buffers.
 *
 * @param {THREE.WebGLRenderer} renderer - from createRenderer
 * @param {THREE.Scene} scene - the game scene
 * @param {THREE.PerspectiveCamera} camera - the gameplay camera
 * @returns {Post}
 */
export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): PostRuntime {
  // Quality preset (src/engine/quality.ts): caps the composer's internal
  // pixel ratio (render scale — the final pass upscales to the native canvas)
  // and scales the AO/bloom buffers. At devicePixelRatio 1 the renderer ratio
  // is 1.0 (below every cap) and aoScale is 1 on the auto tier, so nothing
  // changes vs. the original chain; on retina (dpr >= 2) the 'high' tier is
  // what keeps the >=60 median / >=45 p5 fps budget (see quality.ts header).
  let preset = getPreset();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const maxSamples = renderer.capabilities.maxSamples || 0;
  const samplesForPreset = (p: QualityPreset): number => maxSamples >= 2
    ? Math.min(Math.max(0, p.msaaSamples || 0), maxSamples)
    : 0;
  let msaaSamples = samplesForPreset(preset);

  // Composer ping-pong buffers never need depth or MSAA: the world is rendered
  // and resolved by SceneAAPass before any fullscreen processing begins.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  const sceneDepth = new THREE.DepthTexture(size.x, size.y);
  const sceneTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture: sceneDepth,
    stencilBuffer: false,
    samples: msaaSamples,
  });
  sceneTarget.texture.name = 'SceneAAPass.color';
  sceneDepth.name = 'SceneAAPass.depth';
  // Single-sample composite used only while transparent combat FX is alive.
  // It receives the resolved world color and a depth copy; late cards render
  // into it with normal hardware depth testing while sampling the SOURCE
  // scene depth for their soft contact fade.
  const lateDepth = new THREE.DepthTexture(size.x, size.y);
  const lateTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture: lateDepth,
    stencilBuffer: false,
  });
  lateTarget.texture.name = 'SceneAAPass.lateColor';
  lateDepth.name = 'SceneAAPass.lateDepth';
  const composer = new EffectComposer(renderer, target);
  const softState = asLateFxSoftState(
    scene.getObjectByName('fx')?.userData?.softParticles,
  );
  const sceneAA = new SceneAAPass(scene, camera, sceneTarget);
  const lateFx = new LateFxPass(scene, camera, sceneTarget, lateTarget, softState);
  const publishAAState = (): void => {
    renderer.domElement.dataset.sceneMsaaSamples = String(msaaSamples);
    renderer.domElement.dataset.postAa = 'smaa-high+fsr1';
  };
  publishAAState();
  composer.addPass(sceneAA); // 1. multisampled scene + single resolve/copy

  // 2. depth-driven aerial perspective — one distance curve for every
  // material (see AerialShader above). Runs in linear HDR space, pre-bloom.
  // The sampled depth belongs to SceneAAPass' independent target, so neither
  // composer ping-pong buffer can form a framebuffer feedback loop.
  const aerial = new ShaderPass(AerialShader);
  aerial.uniforms.tDepth.value = sceneDepth;
  composer.addPass(aerial);

  const gtao = new GTAOPass(scene, camera, size.x, size.y) as ExtendedGtaoPass; // 3. AO multiply
  gtao.output = GTAOPass.OUTPUT.Default;
  // PERF (draw-call/triangle budget): feed GTAO the scene depth the RenderPass
  // already rasterized (renderTarget2's private DepthTexture) instead of
  // letting the pass re-render the ENTIRE scene into its own G-buffer.
  // Measured in battle at 1080p: the override prepass cost ~310 draw calls
  // and ~2.6 M triangles per frame — and, worse, its internal
  // `renderer.render(scene)` re-ran the two per-frame CSM cascade updates
  // (another ~250 calls / 2.4 M tris of pure duplicate shadow work). With an
  // external depth buffer GTAOPass sets `_renderGBuffer = false` and skips
  // all of it: battle max fell 944 → ~520 calls, 8.0 M → 4.6 M tris.
  // NORMAL_VECTOR_TYPE becomes 0: view normals are reconstructed from depth
  // neighbors in the AO shader (best-pair reconstruction). At our AO scale
  // (radius 1.6 m, contact-grounding duty) the reconstruction is visually
  // equivalent — verified frame-diffed on battlefield/player/sniper/closeup
  // shots. Bonus: alpha-tested foliage now contributes real cutout depth
  // (the old override prepass ignored alphaTest, which is why aoExclude
  // existed), so canopies get proper grounding instead of being AO-invisible.
  // The scene depth is complete and resolved before this pass runs.
  gtao.setGBuffer(sceneDepth);
  // Temporal reprojection below turns half-resolution AO into a converged
  // signal across frames. High/Medium therefore need eight fresh taps, not
  // sixteen nearly redundant taps every 8.33 ms; Ultra keeps the full 16-tap
  // inspection profile. This makes contact grounding cheap enough to remain
  // enabled on more 120 Hz frames instead of the governor dropping it whole.
  const applyAoSampling = (p: QualityPreset): void => {
    const samples = p.aoScale >= 0.99 ? 16 : 8;
    gtao.updateGtaoMaterial({ ...GTAO_PARAMS, samples });
    gtao.updatePdMaterial({ ...GTAO_PD_PARAMS, samples });
    renderer.domElement.dataset.aoSamples = String(samples);
  };
  applyAoSampling(preset);
  gtao.blendIntensity = GTAO_BLEND_INTENSITY;
  // View-distance AO fade. AO is a CONTACT cue: at establishing-shot ranges a
  // 1.6 m occlusion radius is subpixel, and on the horizon mountain ring
  // (rows at r 470-1290 m, world/maps/horizon.js) grazing-angle slopes turned
  // the AO term into dark vertical slashes down every ridge face — the same
  // artifact class the old prepass dodged by hiding `aoExclude` objects. A
  // world-space clip box can't fence a circular backdrop ring from a square
  // playfield (ring rows cut inside the box corners), so fade in VIEW distance
  // instead: full AO to 260 m, gone by 420 m, comfortably past every gameplay
  // camera (sniper zoom included — the aerial haze owns the far field there).
  {
    // r8: fade band 260-420 → 300-460. The urban establishing shot framed
    // whole rowhouse blocks in the 260-420 m band with their wall/ground
    // junction AO already faded out — facades floated on the grass. The
    // horizon-ring fence still holds: the nearest ridge faces any harness
    // camera sees are 500 m+ away (the sub-460 m ring arc is always behind
    // the establishing cameras).
    // r8 AO NOISE FLOOR: shallow open-terrain occlusion (rolling turf
    // concavities at ao 0.8-0.95) survived the pow(ao, 3.3) deepening as
    // soft dark dapple with no visible caster on open grass. Kill only the
    // SHALLOW tail — occlusion under 3% vanishes, 20%+ (real contact
    // corners) passes through untouched — so hull/building grounding keeps
    // its full depth while open fields come out clean.
    // r5 ("battlefield_winter: entire snowfield carpeted in an ordered dot-grid
    // halftone"): BISECTED to this pass — the half-res GTAO's shallow
    // rolling-turf occlusion (5-15%) survived the 0.03-0.20 floor, and after
    // the pow(ao, 3.3) deepening + bilinear upsample it printed as ordered
    // blue dot ROWS on any bright albedo (blatant on snow, hidden on dark
    // grass). Raise the kill band to 0.09-0.28: open-field micro-dapple
    // vanishes on every map while genuine contact corners (>30% occlusion —
    // hulls, building bases, prop feet) keep their full grounding depth.
    // r2 ("no ambient occlusion anywhere: building wall-to-ground junctions
    // show zero contact darkening, fence posts and mid-distance trees look
    // pasted onto the grass"): the r5 hard fade (35-90 in this metric,
    // ~130-330 m real) erased EVERY contact cue at establishing distance —
    // the whole village sat outside it. The open-field patchwork the fade
    // was killing is SHALLOW occlusion (5-15%), which the 0.14-0.40 kill
    // band below already removes; deep contact corners are what remain, and
    // those are exactly what must survive to mid-range. New ladder: full AO
    // to 25 metric (~90 m), a 35% give-back through 60 (undersampled band),
    // then gone by 170 metric (~550+ m — the aerial haze owns the far field).
    // Verified A/B on winter/desert establishing shots: no dot-grid return.
    const AO_FADE = 'ao = 1.0 - ( 1.0 - ao ) * smoothstep( 0.14, 0.40, 1.0 - ao );'
      + '\n\t\t\tao = mix( ao, 1., 0.35 * smoothstep( 25., 60., length( viewPos ) ) );'
      // terrain_environment r5: length(viewPos) here reads ~3-4x smaller than
      // true camera distance (see handoff doc).
      + '\n\t\t\tao = mix( ao, 1., smoothstep( 60., 170., length( viewPos ) ) );';
    const AO_ANCHOR = 'ao = pow(ao, scale);';
    const src = gtao.gtaoMaterial.fragmentShader;
    const patched = src.replace(AO_ANCHOR, `${AO_FADE}\n\t\t\t${AO_ANCHOR}`);
    if (patched === src) {
      throw new Error('post.ts: GTAO distance-fade anchor not found in GTAOShader');
    }
    gtao.gtaoMaterial.fragmentShader = patched;
    gtao.gtaoMaterial.needsUpdate = true;
  }
  // Quality: run the whole GTAO stack (scene depth/normal prepass, 16-tap AO,
  // Poisson denoise) at `aoScale` x composer resolution. Its internal targets
  // are LinearFilter, so the final multiply-blend bilinearly upsamples the AO
  // buffer — the standard half-res-AO scheme. aoScale 1 (ultra) is unchanged
  // full-res; aoScale 0 disables the pass entirely.
  //
  // ao-boil r2/r3: TEMPORAL ACCUMULATION on the denoised AO buffer. The r1
  // param retune (thickness 1.0 + wider Poisson denoise) halved the motion
  // boil, but half-res cutout re-aliasing still churns under-canopy AO
  // frame to frame — a spatial denoiser cannot fix temporal variance.
  //
  // r3 (owner: "the ambient occlusion is still there"): the r2 history was
  // SCREEN-ALIGNED, so while driving every history texel compared against a
  // DIFFERENT world point (~10-20 px/frame of slide) — the blend both
  // smeared and failed to settle the boil. This is the exact problem
  // three's WebGPU GTAONode solves with temporalFiltering+TRAA and the GTAO
  // paper solves with temporal reprojection, so do the same here in WebGL:
  //  - REPROJECT: reconstruct each AO texel's world point from the CURRENT
  //    scene depth + inverse view-projection, project it through LAST
  //    frame's view-projection, and sample the history there. The boil
  //    sources (trees/terrain/props) are world-static, so camera-only
  //    reprojection is exact for them — no motion vectors needed.
  //  - REJECT: store current device depth in the otherwise-unused history
  //    alpha channel. A reprojected sample is accepted only when that stored
  //    depth matches the depth predicted by the current world point. This is
  //    the missing disocclusion test around overlapping trunks, leaves,
  //    buildings and vehicles; it costs no extra render target or texture.
  //  - RECTIFY: clamp the reprojected history to the min/max of the current
  //    frame's 5-tap AO neighborhood (standard TAA neighborhood clamping),
  //    then cap brighter history close to the live sample. The neighborhood
  //    alone can contain both sides of a high-contrast contact edge and admit
  //    an almost-white history sample over newly dark AO.
  //  - ACCUMULATE: k=0.15 toward the current frame (~85% history). Isolated
  //    identical matrices retain that weight: switching the first repeated
  //    frame to k=1 made 60 Hz camera motion on 120 Hz output alternate between
  //    retained history and current AO. Four consecutive identical matrices
  //    retire history so a genuinely stopped view becomes byte-stable.
  //  - RELEASE: history may suppress a one-frame dark occlusion spike, but it
  //    may never keep a newly exposed surface darker than the current AO.
  //    Bright history is bounded as well, so foliage/card edges settle without
  //    flashing pale on motion frames. Stale dark contact patches still clear
  //    in one frame rather than trailing the camera through overlapping tree
  //    and structure silhouettes.
  // Off-screen reprojections and the first frame after a >250 ms gap (map
  // switch, AO re-enable, resize) take the current frame verbatim.
  // Integration: GTAOPass.OUTPUT.Off runs G-buffer + AO + denoise and skips
  // composition, so the wrapper below lets the stock pass do all the work,
  // reprojects pdRenderTarget into a ping-pong history, then reproduces the
  // two-step Default composition (copy + multiply-blend) fed by the history.
  {
    if (GTAOPass.OUTPUT.Off !== -1 || GTAOPass.OUTPUT.Default !== 0) {
      throw new Error('post.ts: GTAOPass.OUTPUT enum changed — re-verify the ao-boil r3 render wrapper');
    }
    const emaMat = new THREE.ShaderMaterial({
      uniforms: {
        tNow: { value: null },
        tPrev: { value: null },
        tDepth: { value: sceneDepth },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
        uSeed: { value: 1 },
        uBlendK: { value: TEMPORAL_AO_CURRENT_WEIGHT },
      },
      vertexShader: 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tNow, tPrev, tDepth;
        uniform mat4 uInvViewProj, uPrevViewProj;
        uniform vec2 uTexel;
        uniform float uSeed, uBlendK;
        varying vec2 vUv;
        void main() {
          vec4 now = texture2D(tNow, vUv);
          float depth = texture2D(tDepth, vUv).x;
          // world position of this texel, reprojected into last frame
          vec4 world = uInvViewProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          world /= world.w;
          vec4 pc = uPrevViewProj * world;
          vec2 prevUv = (pc.xy / pc.w) * 0.5 + 0.5;
          bool off = depth >= 1.0 || pc.w <= 0.0 ||
            any(lessThan(prevUv, vec2(0.0))) || any(greaterThan(prevUv, vec2(1.0)));
          // TAA neighborhood rectification (5-tap cross of the CURRENT AO)
          vec3 n1 = texture2D(tNow, vUv + vec2(uTexel.x, 0.0)).rgb;
          vec3 n2 = texture2D(tNow, vUv - vec2(uTexel.x, 0.0)).rgb;
          vec3 n3 = texture2D(tNow, vUv + vec2(0.0, uTexel.y)).rgb;
          vec3 n4 = texture2D(tNow, vUv - vec2(0.0, uTexel.y)).rgb;
          vec3 mn = min(now.rgb, min(min(n1, n2), min(n3, n4)));
          vec3 mx = max(now.rgb, max(max(n1, n2), max(n3, n4)));
          vec4 historySample = texture2D(tPrev, prevUv);
          float expectedPrevDepth = (pc.z / pc.w) * 0.5 + 0.5;
          float depthFootprint = abs(dFdx(expectedPrevDepth)) + abs(dFdy(expectedPrevDepth));
          float depthTolerance = max(
            ${TEMPORAL_AO_DEPTH_REJECT_MIN.toFixed(6)},
            depthFootprint * ${TEMPORAL_AO_DEPTH_REJECT_FOOTPRINT_SCALE.toFixed(1)}
          );
          bool depthMismatch = abs(historySample.a - expectedPrevDepth) > depthTolerance;
          vec3 hist = clamp(historySample.rgb, mn, mx);
          // Responsive AO resolve: retain only a narrow band of bright history
          // while releasing stale darkness immediately on disocclusion.
          hist = clamp(
            hist,
            now.rgb - vec3(${TEMPORAL_AO_DARK_RELEASE_SLACK.toFixed(3)}),
            now.rgb + vec3(${TEMPORAL_AO_BRIGHT_RETENTION_SLACK.toFixed(3)})
          );
          float k = (off || depthMismatch || uSeed > 0.5) ? 1.0 : uBlendK;
          // Preserve current device depth beside AO so the next frame can
          // reject history from a different surface without another target.
          gl_FragColor = vec4(mix(hist, now.rgb, k), depth);
        }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    let emaPrev = gtao.pdRenderTarget.clone();
    let emaCur = gtao.pdRenderTarget.clone();
    let emaLastMs = -1e9; // >250 ms without an AO render → history is stale
    const prevViewProj = emaMat.uniforms.uPrevViewProj.value;
    const currentViewProj = new THREE.Matrix4();
    let stableCameraFrames = 0;
    const origSetSize = gtao.setSize.bind(gtao);
    const syncEmaSize = () => {
      emaPrev.setSize(gtao.pdRenderTarget.width, gtao.pdRenderTarget.height);
      emaCur.setSize(gtao.pdRenderTarget.width, gtao.pdRenderTarget.height);
      emaMat.uniforms.uTexel.value.set(
        1 / gtao.pdRenderTarget.width, 1 / gtao.pdRenderTarget.height);
      emaLastMs = -1e9; // reseed — old history is the wrong resolution
    };
    gtao.setSize = (w, h) => {
      const s = preset.aoScale || 1;
      origSetSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
      syncEmaSize();
    };
    syncEmaSize();
    gtao.render = function (renderer2, writeBuffer, readBuffer, deltaTime, maskActive) {
      if (this.output !== GTAOPass.OUTPUT.Default ||
          (typeof window !== 'undefined' && window.__AO_EMA_OFF)) { // bisect hook
        return GTAOPass.prototype.render.call(this, renderer2, writeBuffer, readBuffer, deltaTime, maskActive);
      }
      this.output = GTAOPass.OUTPUT.Off; // AO + denoise only, no composition
      try {
        GTAOPass.prototype.render.call(this, renderer2, writeBuffer, readBuffer, deltaTime, maskActive);
      } finally {
        this.output = GTAOPass.OUTPUT.Default;
      }
      const cam = this.camera;
      emaMat.uniforms.uInvViewProj.value
        .multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
      const now = performance.now();
      const seed = now - emaLastMs > 250;
      currentViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      if (seed) {
        prevViewProj.copy(currentViewProj);
        stableCameraFrames = 0;
      } else {
        let maxMatrixDelta = 0;
        for (let index = 0; index < 16; index++) {
          maxMatrixDelta = Math.max(
            maxMatrixDelta,
            Math.abs(currentViewProj.elements[index] - prevViewProj.elements[index]),
          );
        }
        stableCameraFrames = maxMatrixDelta <= 1e-9 ? stableCameraFrames + 1 : 0;
      }
      emaLastMs = now;
      emaMat.uniforms.tNow.value = this.pdRenderTarget.texture;
      emaMat.uniforms.tPrev.value = emaPrev.texture;
      emaMat.uniforms.uSeed.value = seed ? 1 : 0;
      emaMat.uniforms.uBlendK.value = resolveTemporalAoCurrentWeight(stableCameraFrames);
      this._renderPass(renderer2, emaMat, emaCur, 0xffffff, 1.0);
      // this frame's view-projection becomes next frame's reprojection source
      prevViewProj.copy(currentViewProj);
      // Default composition, verbatim from GTAOPass.prototype.render (r185)
      // with the blend input rerouted to the reprojected history.
      this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
      this.copyMaterial.blending = THREE.NoBlending;
      this._renderPass(renderer2, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
      this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
      this.blendMaterial.uniforms.tDiffuse.value = emaCur.texture;
      this._renderPass(renderer2, this.blendMaterial, this.renderToScreen ? null : writeBuffer);
      const t = emaPrev; emaPrev = emaCur; emaCur = t;
    };
    gtao.enabled = preset.aoScale > 0;
  }
  // NOTE: the old `userData.aoExclude` hide/restore wrapper is gone — it only
  // mattered for the override-material G-buffer prepass (which ignored
  // alphaTest). With the external scene depth there is no prepass to exclude
  // objects from, and the per-frame full-scene traverse it cost is reclaimed.
  // The aoExclude flags in world modules stay as inert metadata. Distant
  // backdrop AO (the reason horizon-ring was excluded) is fenced by the scene
  // clip box below instead.
  composer.addPass(gtao);
  // Transparent combat media must follow every opaque-depth-driven pass.
  // Otherwise aerial/GTAO use the mountain or hull BEHIND smoke and stamp
  // that background depth across the foreground card (the reported glitch).
  composer.addPass(lateFx);

  const bloom = new UnrealBloomPass(size.clone(), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  {
    // Clamp the bloom extraction (see BLOOM_INPUT_CLAMP above).
    const hp = bloom.materialHighPassFilter;
    const patched = hp.fragmentShader.replace(
      HIGH_PASS_ANCHOR,
      `gl_FragColor = mix( outputColor, vec4( min( texel.rgb, vec3( ${BLOOM_INPUT_CLAMP.toFixed(2)} ) ), texel.a ), alpha );`,
    );
    if (patched === hp.fragmentShader) {
      throw new Error('post.ts: bloom high-pass clamp anchor not found in LuminosityHighPassShader');
    }
    hp.fragmentShader = patched;
    hp.needsUpdate = true;
  }
  // Quality: scale the bloom chain input (its mip pyramid is already built
  // from input/2, so bloomScale 0.5 = quarter-res blurs; the additive
  // composite into the frame stays at composer resolution either way).
  {
    const origSetSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => {
      const s = preset.bloomScale || 1;
      origSetSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    };
  }
  composer.addPass(bloom); // 3. HDR bloom — muzzle flash / fire pop here

  // SMAA runs after BOTH the output transform and display grade. Anti-aliasing computed on
  // linear HDR values is defeated by the tone map: a 6.0-vs-0.4 edge blended
  // 50/50 in linear space still tone-maps to ~white against mid-grey, so hot
  // speculars (gun tube top edge vs sky) kept a jagged 1px stair. SMAA's edge
  // detection and blend now run in display sRGB space — the space the eye
  // sees — which is also where the algorithm was designed to operate.
  // PERF (120 Hz): tone mapping/output transfer and grading are adjacent
  // native-size passes with no consumer between them. The fused pass preserves
  // OutputPass' renderer-driven defines and exact display-space grade math,
  // while removing one full-frame read/write from every battle frame.
  const grade = createOutputGradePass();
  composer.addPass(grade); // 4. ACES + sRGB + display grade/scope treatment
  const smaa = new SMAAPass() as ExtendedSmaaPass;
  // Three's stock pass uses its medium preset (0.10 edge threshold / 8 search
  // steps). The HUD-scale gun tubes, wires, fences and vehicle silhouettes
  // routinely land below that threshold after tone mapping. High-preset SMAA
  // catches those fine edges and follows longer diagonals without the memory
  // and fill-rate cost of full-scene MSAA/supersampling.
  if (smaa._materialEdges && smaa._materialEdges.defines) {
    smaa._materialEdges.defines.SMAA_THRESHOLD = '0.055';
  }
  if (smaa._materialWeights && smaa._materialWeights.defines) {
    smaa._materialWeights.defines.SMAA_MAX_SEARCH_STEPS = '16';
  }
  composer.addPass(smaa); // 5. edge-pattern AA (geometric silhouettes)

  // 6. Native-output spatial reconstruction. SMAA first resolves the geometric
  // pattern at internal resolution. The reconstruction ladder then chooses
  // EASU + RCAS for modest enlargement, EASU alone for mobile's normal path,
  // or inexpensive linear sampling at the emergency floor. In every case the
  // final pass owns the exact display backing store; the browser never has to
  // stretch a smaller canvas a second time.
  const upscaler = new FsrUpscalePass();
  composer.addPass(upscaler);

  // --- Quality-aware sizing --------------------------------------------------
  // The composer's pixel ratio is the renderer's, CAPPED by the preset
  // (render scale). Every buffer in the chain — scene HDR target, its private
  // DepthTexture, GTAO (further scaled above), bloom, SMAA — follows through
  // EffectComposer.setSize; the final renderToScreen pass reconstructs with
  // FSR1 at the native-resolution canvas, so the DOM/canvas HUD keeps full
  // sharpness and only the 3D frame pays the reduced raster cost.
  let cssW = 0;
  let cssH = 0;
  const _nativeSize = new THREE.Vector2();
  // --- Dynamic resolution governor (performance_budget r5, REBUILT
  // engine-aa r1) ------------------------------------------------------------
  // PERFORMANCE.md adaptive-quality contract: the preset ladder is static, so
  // hardware weaker than the reference machine rides p5 dips with no
  // recovery. Standard AAA answer: scale the internal render resolution to
  // hold frame time. The governor tracks a ~1 s EMA of the render delta and
  // steps `dynScale` (multiplied into the composer pixel ratio below) between
  // 1.0 and DYN_MIN while the frame budget is blown, stepping back up once
  // there is clear headroom.
  //
  // engine-aa r1 ROOT CAUSE (owner: "the ui in garage and in battle is still
  // this weird pixelly thing"): the r5 governor compared the EMA of the rAF
  // DELTA against two ABSOLUTE thresholds — down past 18.5 ms, up below
  // 13.5 ms. Under vsync the up threshold is UNREACHABLE on a 60 Hz display:
  // rAF deltas are quantized to >= 16.7 ms no matter how much GPU headroom
  // exists, so the "hysteresis dead band" was a ONE-WAY RATCHET. Any ~3 s of
  // sustained load (boot shader compiles outliving the warmup, an agent
  // build, a background app) stepped the scale down, and nothing could ever
  // step it back up. Reproduced with tools/tmp-engine-aa-probe.mjs (dpr 2,
  // vsync-locked): a 12 s load spike drove dynScale to the 0.67 floor —
  // composer at ~1.0x CSS on a dpr-2 display, i.e. HALF the physical pixels
  // per axis, double-upscaled — and 30+ s of idle at EMA 16.7 ms never
  // recovered one step. That floor state is exactly the soft/chunky garage
  // and battle in the owner's screen recording (DOM HUD crisp, 3D mush).
  // The rebuild keeps the stepped/rate-limited/retina-fenced shape and fixes
  // the decision logic:
  //  - BUDGET-RELATIVE thresholds: the frame budget is the best stable
  //    display cadence observed this session, never faster than 8.5 ms and
  //    capped at 34 ms. A 60 Hz panel therefore targets 16.7 ms while a
  //    120 Hz panel targets 8.5 ms. Keeping the best cadence prevents a live
  //    battle slowdown from redefining 12-30 fps as the new healthy target.
  //  - MISS-RATIO evidence: a step needs the EMA level AND the share of
  //    frames blowing budget x 1.35 to agree (down needs > 15% missed, up
  //    needs < 4%), so scheduler jitter alone cannot thrash the scale.
  //  - QUALITY-AWARE FLOOR: default High keeps >= 90% of its preset
  //    resolution per axis (effective ratio 1.35 on the 1.5 cap); explicit
  //    Ultra may fall only to the complete High ceiling. Mobile presets retain
  //    lower explicit floors because avoiding a tab OOM is the harder limit.
  //  - ANTI-FLAP BACKOFF instead of a dead band: an up-step punished by a
  //    down-step within 8 s doubles the wait before the next up try
  //    (1.5 → 3 → 6 → 12 → 20 s cap; a flap-free minute resets it). Recovery
  //    from a genuine load drop stays 1 step per 1.5 s — floor to 1.0 in
  //    ~4.5 s.
  //  - hidden-document frames never govern: main.ts's rAF-starvation
  //    fallback ticks at ~10 Hz by design — that cadence says nothing about
  //    GPU cost and used to read as a permanent budget blowout.
  //  - DPR-1 FENCE: native-density desktop output never falls below 1.0. AO
  //    relief and the preset tier handle pressure there; a supposedly adaptive
  //    system must not trade the whole picture for sub-native blur.
  //  - STEPPED + RATE-LIMITED, not a per-frame lerp: every ratio change
  //    reallocates the whole composer chain (scene HDR target, GTAO, bloom,
  //    SMAA); steps of ~0.09 at most once per 1.5 s.
  //  - HUD/DOM stays native-crisp: only the composer's internal buffers
  //    scale; the final pass upscales (linear-filtered buffers) to the
  //    untouched canvas.
  // Telemetry: dataset.dynScale / dataset.dynBudgetMs / dataset.frameEmaMs
  // on the canvas (1 Hz), plus the read-only post.dynScale getter below —
  // reachable for probes via window.__DEBUG.post.dynScale. Nothing about the
  // scale is persisted: every boot re-earns resolution from the preset base.
  // Weak devices used to endure ~20 s before the full relief ladder engaged:
  // 6 s warmup + three 2.5 s resolution decisions + two trim strikes. Shader
  // compilation is now front-loaded behind the loading screen, so live
  // evidence can safely begin sooner. Recovery remains backoff-protected.
  const DYN_INTERVAL_S = 1.5;
  const DYN_WARMUP_S = 3; // ignore boot/shader-compile turbulence
  const DYN_TARGET_MS = 8.5; // 120 fps budget (+~2% vsync slack)
  const DYN_BUDGET_MAX_MS = 34; // starved cadences never fake a lax budget
  const DYN_MISS_AT = 1.12; // a frame > budget x this counts as missed
  const DYN_MIN_WINDOW_FRAMES = 30; // no decision on a thin evidence window
  // High starts at its complete 1.5x configured ratio. Lower/mobile presets
  // can still declare an adaptive base; the pure policy keeps this math shared
  // with its Node regression test.
  const qualityPolicy = new AdaptiveQualityPolicy(
    baseDynamicScale(renderer.getPixelRatio(), preset),
  );
  let dynEma = 0; // ms (r5 kept seconds; ms reads directly against budgets)
  let dynClock = 0;
  let telemetryClock = 0;
  // cadence ring: ~3 s of frame deltas; p10 estimates the true vsync period
  // robustly (min alone anchors on double-fire jitter outliers).
  const dynRing = new Float32Array(180);
  const dynRingScratch = new Float32Array(180);
  let dynRingN = 0;
  let dynRingI = 0;
  let dynWinFrames = 0; // evidence window since the last decision
  let dynWinMisses = 0;
  let dynBudgetMs = DYN_TARGET_MS;
  let dynBestCadenceMs = DYN_BUDGET_MAX_MS;
  let dynLastDecision = 0;
  let dynPin: number | null = null; // QA capture pin (see pinDynScale below); null = live
  // Battlefield/roster construction intentionally monopolizes frames behind
  // an opaque loading screen. Those deltas are not playable GPU performance
  // and must never demote the quality used after the reveal.
  let adaptiveSuspended = false;
  // perf-governor r1 (R3F PerformanceMonitor pattern, mapped onto this
  // engine): between "resolution at the floor" and "drop the whole preset
  // tier" there is now a SESSION TRIM LADDER driven purely by measured frame
  // times — relief the moment a device actually struggles, restored the
  // moment it recovers, never persisted:
  //   trim 1  GTAO off (the most expensive single pass)
  // Shadow cadence is deliberately NOT a relief lever: half/third-rate near
  // maps present as 20-40 Hz lighting flashes inside an otherwise smooth
  // frame stream. If resolution + AO relief is insufficient, the existing
  // adaptive tier step is both steadier and more honest.
  // Down-steps need TRIM_STRIKES consecutive overloaded windows (~3 s) so a
  // killcam beat can't trim; up-steps need clean windows and back off
  // exponentially when they flap (the R3F `flipflops` guard).
  const trimMax = () => (preset.aoScale > 0 ? 1 : 0);
  // perf-governor r2 (owner: "adjust based on framerate — if declining, kick
  // in"): the absolute budget + spike-miss gates are blind to two real cases:
  //   - a UNIFORM slowdown parked just under the miss threshold (a stable
  //     45-52 fps on a 60 Hz screen has ema>budget but ZERO misses),
  //   - a high-refresh display sagging (120 -> 70 fps never crosses the
  //     16.9 ms budget at all).
  // The governor now EARNS an fps baseline during clean windows (rises
  // quickly, sags reluctantly) and treats a window that loses >=20% of it —
  // while below the smooth-enough ceiling — as overloaded, walking the same
  // relief ladder. After it fires, the baseline decays toward reality so an
  // exhausted ladder doesn't re-fire every window forever.
  // trim releases tolerate a dirtier window than resolution up-steps (0.04):
  // background-app spikes on a healthy device otherwise freeze recovery at a
  // trimmed rung forever — the trims are coarse levers, and a flapped
  // release is caught by the exponential backoff anyway.
  let quality: 'high' | 'low' = 'high'; // mirrors setQuality — AO recomputes from one place
  function applyAoEnabled(): void {
    gtao.enabled = quality !== 'low'
      && preset.aoScale > 0
      && qualityPolicy.performanceTrim < 1;
  }
  function setPerfTrim(next: number): void {
    if (!qualityPolicy.forceTrim(next, trimMax())) return;
    applyAoEnabled();
    renderer.domElement.dataset.perfTrim = String(qualityPolicy.performanceTrim);
  }
  function applySize(w: number, h: number): void {
    cssW = w;
    cssH = h;
    const renderScale = internalPixelRatio(
      renderer.getPixelRatio(),
      preset,
      qualityPolicy.dynamicScale,
    );
    composer.setPixelRatio(renderScale);
    composer.setSize(w, h);
    renderer.domElement.dataset.renderScale = renderScale.toFixed(3);
    renderer.domElement.dataset.dynScale = qualityPolicy.dynamicScale.toFixed(3);
    // Keep the screen-space helpers in step with both internal/native sizes.
    // The firefly clamp taps the COMPOSER buffer (the aerial pass' own input);
    // FSR is the to-screen pass — the governor may shrink the chain, while
    // reconstruction always lands on exact native canvas pixels.
    aerial.uniforms.uInvSize.value.set(
      1 / Math.max(1, Math.round(w * renderScale)),
      1 / Math.max(1, Math.round(h * renderScale)));
    const native = renderer.getDrawingBufferSize(_nativeSize);
    upscaler.setOutputSize(native.x, native.y);
  }
  function applyAdaptiveQualityAction(action: AdaptiveQualityAction): void {
    if (action === 'trim-down' || action === 'trim-up') {
      renderer.domElement.dataset.perfTrim = String(qualityPolicy.performanceTrim);
      applyAoEnabled();
      return;
    }
    if (action === 'tier-down') {
      reportSustainedOverload();
      return;
    }
    if (action === 'tier-up') {
      reportSustainedRecovery();
      return;
    }
    if (action !== 'resolution-down' && action !== 'resolution-up') return;
    dynEma = dynBudgetMs;
    if (cssW > 0 && cssH > 0) applySize(cssW, cssH);
  }

  /** Collect one frame of evidence and ask the pure policy for a bounded step. */
  function dynGovern(dt: number): void {
    if (adaptiveSuspended) return;
    if (!(dt > 0) || dt > 0.25) return; // hitches/tab-switch: not a trend
    // rAF-starvation fallback frames (main.ts ticks hidden documents at
    // ~10 Hz) carry loop cadence, not GPU cost — they must never govern.
    if (document.hidden) return;
    dynClock += dt;
    if (dynClock < DYN_WARMUP_S) return; // boot turbulence: no accounting
    const ms = dt * 1000;
    dynEma = dynEma === 0 ? ms : dynEma + (ms - dynEma) * 0.06;
    dynRing[dynRingI] = ms;
    dynRingI = (dynRingI + 1) % dynRing.length;
    if (dynRingN < dynRing.length) dynRingN++;
    dynWinFrames++;
    if (ms > dynBudgetMs * DYN_MISS_AT) dynWinMisses++;
    if (dynClock - telemetryClock >= 1) {
      telemetryClock = dynClock;
      // Read-only QA telemetry on the renderer canvas; one DOM write per
      // second is negligible and lets browser checks verify the frame budget
      // and the live governor state without injecting scripts into the
      // game's execution realm.
      renderer.domElement.dataset.frameEmaMs = dynEma.toFixed(2);
      renderer.domElement.dataset.dynScale = qualityPolicy.dynamicScale.toFixed(3);
      renderer.domElement.dataset.dynBudgetMs = dynBudgetMs.toFixed(2);
    }
    if (dynPin !== null) return; // QA pin owns the scale; telemetry stays live
    // Resolution only moves inside a preset's readability fence. DPR-1
    // desktop output stays native; Retina High bottoms at 1.35 instead of the
    // old 1.125 watercolor path; constrained mobile tiers retain lower floors.
    if (dynClock - dynLastDecision < DYN_INTERVAL_S) return;
    if (dynWinFrames < DYN_MIN_WINDOW_FRAMES) return; // thin window: wait
    // Decision point (every >= 1.5 s of visible frames).
    // Display cadence estimate: p10 of the recent deltas is the shortest
    // period vsync consistently delivers. Retain the BEST stable cadence
    // observed since boot; otherwise a workload regression slowly raises its
    // own budget and the governor stops helping precisely when it is needed.
    dynRingScratch.set(dynRing.subarray(0, dynRingN));
    const sorted = dynRingScratch.subarray(0, dynRingN).sort();
    const p10 = sorted[Math.floor(dynRingN * 0.10)];
    dynBestCadenceMs = Math.min(dynBestCadenceMs, p10);
    dynBudgetMs = Math.min(DYN_BUDGET_MAX_MS,
      Math.max(DYN_TARGET_MS, dynBestCadenceMs));
    const missRatio = dynWinMisses / dynWinFrames;
    // perf-governor r2: achieved fps this window (counted frames over counted
    // time — >250 ms hitch frames are excluded from both, so a uniform
    // slowdown reads true).
    const windowFps = dynWinFrames / Math.max(0.001, dynClock - dynLastDecision);
    dynWinFrames = 0;
    dynWinMisses = 0;
    dynLastDecision = dynClock;
    const action = qualityPolicy.evaluate({
      clockSeconds: dynClock,
      frameEmaMs: dynEma,
      frameBudgetMs: dynBudgetMs,
      missedFrameRatio: missRatio,
      achievedFps: windowFps,
      dynamicScaleFloor: dynamicScaleFloor(renderer.getPixelRatio(), preset),
      maximumTrim: trimMax(),
      mayRaiseTier: canRecoverAutoTier(),
    });
    renderer.domElement.dataset.fps = windowFps.toFixed(1);
    renderer.domElement.dataset.fpsBaseline = qualityPolicy.learnedBaselineFps.toFixed(1);
    applyAdaptiveQualityAction(action);
  }
  {
    const css = renderer.getSize(new THREE.Vector2());
    applySize(css.x, css.y);
  }
  function resetGovernorState() {
    dynPin = null;
    qualityPolicy.reset(baseDynamicScale(renderer.getPixelRatio(), preset), dynClock);
    dynEma = 0;
    dynRingN = 0;
    dynRingI = 0;
    dynWinFrames = 0;
    dynWinMisses = 0;
    dynBudgetMs = DYN_TARGET_MS;
    dynBestCadenceMs = DYN_BUDGET_MAX_MS;
    dynLastDecision = dynClock;
    renderer.domElement.dataset.perfTrim = '0';
    applyAoEnabled();
    if (cssW > 0 && cssH > 0) applySize(cssW, cssH);
  }

  function updateAerialZoom(): void {
    aerial.uniforms.uNear.value = camera.near;
    aerial.uniforms.uFar.value = camera.far;
    const fovScale = camera.fov < AERIAL_ZOOM_FOV
      ? Math.max(AERIAL_ZOOM_FLOOR, Math.pow(camera.fov / AERIAL_ZOOM_FOV, 1.5))
      : 1;
    aerial.uniforms.uDensity.value = AERIAL_DENSITY * fovScale;
    aerial.uniforms.uHazeDensity.value = AERIAL_HAZE_DENSITY * fovScale;
    aerial.uniforms.uDetailW.value = THREE.MathUtils.clamp(
      (AERIAL_DETAIL_FOV - camera.fov) / (AERIAL_DETAIL_FOV - 8),
      0,
      1,
    );
  }

  function updateScopeGrade(): void {
    const target = camera.userData.scoped ? 1 : 0;
    const current = grade.uniforms.uScope.value;
    grade.uniforms.uScope.value = Math.abs(target - current) < 0.01
      ? target
      : current + (target - current) * 0.45;
    grade.uniforms.uAspect.value = camera.aspect || (16 / 9);
    grade.uniforms.uSharp.value = grade.uniforms.uScope.value
      * 0.95
      * Math.min(1, Math.max(0, (16 - camera.fov) / 10));
    const scopeWeight = grade.uniforms.uScope.value;
    bloom.strength = BLOOM_STRENGTH * (1 - 0.5 * scopeWeight);
    aerial.uniforms.uDensity.value *= 1 - 0.22 * scopeWeight;
    aerial.uniforms.uHazeDensity.value *= 1 - 0.30 * scopeWeight;
  }

  function updateAerialFogColors(): void {
    if (!scene.fog) return;
    const fogColor = scene.fog.color;
    aerial.uniforms.uHazeWarm.value.setRGB(
      fogColor.r * AERIAL_WARM_TINT[0],
      fogColor.g * AERIAL_WARM_TINT[1],
      fogColor.b * AERIAL_WARM_TINT[2],
    );
    aerial.uniforms.uHazeCool.value.setRGB(
      fogColor.r * AERIAL_COOL_TINT[0],
      fogColor.g * AERIAL_COOL_TINT[1],
      fogColor.b * AERIAL_COOL_TINT[2],
    );
    capLuminance(aerial.uniforms.uHazeWarm.value, AERIAL_HAZE_LUM_CAP);
    capLuminance(aerial.uniforms.uHazeCool.value, AERIAL_HAZE_LUM_CAP);
  }

  function updateAerialCameraBasis(): void {
    const elements = camera.matrixWorld.elements;
    aerial.uniforms.uCamRight.value.set(elements[0], elements[1], elements[2]);
    aerial.uniforms.uCamUp.value.set(elements[4], elements[5], elements[6]);
    aerial.uniforms.uCamFwd.value.set(-elements[8], -elements[9], -elements[10]);
    aerial.uniforms.uCamPos.value.set(elements[12], elements[13], elements[14]);
    const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    aerial.uniforms.uTan.value.set(halfFovTangent * camera.aspect, halfFovTangent);
    const sunDirection = scene.userData.sunDirWorld;
    if (sunDirection) aerial.uniforms.uSunDir.value.copy(sunDirection).normalize();
  }

  /** Complete allocation-free post transaction for one rendered frame. */
  function renderFrame(dt: number): void {
    // A governor resize must land before any pass reads resolution uniforms.
    dynGovern(dt);
    updateAerialZoom();
    grade.uniforms.uExposure.value = scene.userData.postExposure || 1;
    aerial.uniforms.uCloudShade.value = scene.userData.cloudShadeAmp ?? CLOUD_SHADE_DEFAULT;
    updateScopeGrade();
    updateAerialFogColors();
    updateAerialCameraBasis();
    composer.render(dt);
  }

  // Live preset switching (settings UI writes quality.setPresetName): retarget
  // every buffer without rebuilding the chain.
  onPresetChange((p) => {
    preset = p;
    applyAoSampling(preset);
    msaaSamples = samplesForPreset(preset);
    sceneAA.setSamples(msaaSamples);
    publishAAState();
    // perf-governor r1: a preset switch is a new baseline — release every
    // session trim (the new tier's own levers take over) and recompute AO.
    resetGovernorState();
  });

  return {
    composer,

    /**
     * Compile and allocate the active post chain one pass per browser frame.
     * A first EffectComposer.render() links every fullscreen program in one
     * JavaScript task, which can freeze a cold ANGLE session for hundreds of
     * milliseconds even though the boot veil is visible. Running the same
     * passes individually preserves every shader and render target while
     * giving the browser a paint opportunity between independent programs.
     * The following normal render produces the exact complete frame.
     */
    async warmFirstFrame(yieldBeforePass = null) {
      const passes = composer.passes;
      const enabled = passes.map((pass) => pass.enabled);
      const renderToScreen = composer.renderToScreen;
      const timings = [];
      try {
        composer.renderToScreen = false;
        for (const pass of passes) pass.enabled = false;
        for (let index = 0; index < passes.length; index++) {
          if (!enabled[index]) continue;
          const pass = passes[index];
          if (yieldBeforePass) {
            const label = pass.constructor?.name || `post-pass-${index + 1}`;
            await yieldBeforePass(label);
          }
          const startedAt = performance.now();
          pass.enabled = true;
          composer.render(1 / 60);
          pass.enabled = false;
          timings.push({
            label: pass.constructor?.name || `post-pass-${index + 1}`,
            ms: Math.round(performance.now() - startedAt),
          });
        }
      } finally {
        composer.renderToScreen = renderToScreen;
        for (let index = 0; index < passes.length; index++) {
          passes[index].enabled = enabled[index];
        }
      }
      return timings;
    },

    /**
     * Render the frame through the full chain. Never call `renderer.render`
     * alongside this — the composer is the single render entry point
     * (ARCHITECTURE.md §4 step 10).
     * @param {number} dt - render delta time in seconds (forwarded to passes)
     * @returns {void}
     */
    render: renderFrame,

    /**
     * Resize the whole chain. Pass CSS-pixel dimensions; the composer applies
     * its pixel ratio internally and every pass (GTAO, bloom, SMAA) is resized
     * through `EffectComposer.setSize`. The renderer itself is resized by
     * `renderer.ts/onResize` — call that first.
     * @param {number} w - width in CSS pixels
     * @param {number} h - height in CSS pixels
     * @returns {void}
     */
    setSize(w, h) {
      applySize(w, h);
    },

    /** Allocate the late-FX color/depth targets behind a loading screen. */
    prepareSoftParticles() {
      lateFx.prepare(renderer);
    },

    /**
     * Register the battle-only effects graph after its lazy chunk is created.
     * This is explicit instead of a per-frame scene traversal, preserving the
     * garage boot win and the render loop's allocation/work budget.
     */
    attachLateFxState(softState: LateFxSoftStateInput | null | undefined): void {
      lateFx.setSoftState(asLateFxSoftState(softState));
    },

    bloom,
    gtao,
    // Probe/measurement hooks for paired quality and depth-composite runs.
    upscaler,
    sceneAA,
    lateFx,
    aerial,

    /** Scene-only hardware AA. Display-space SMAA + FSR1 follow it. */
    get msaaSamples() { return msaaSamples; },

    /** Live dynamic-resolution scale (1 = full preset resolution). Probe/
     * settings-UI observability for the governor above; read-only. */
    get dynScale() { return qualityPolicy.dynamicScale; },

    /**
     * QA hook (engine-aa r1): pin the governor at a fixed scale so dpr-2
     * captures are deterministic on hosts whose sibling workloads keep the
     * GPU loaded (tools/tmp-engine-aa-probe.mjs --pin-captures). Gameplay
     * never calls this; the settings UI has no path to it.
     * @param {number|null} v - clamped to [DYN_MIN, 1]; null releases the
     *   pin back to the live governor (which re-earns from the pinned value)
     * @returns {void}
     */
    pinDynScale(v) {
      dynPin = v == null ? null : Math.min(1,
        Math.max(dynamicScaleFloor(renderer.getPixelRatio(), preset), v));
      if (dynPin !== null && qualityPolicy.setDynamicScale(dynPin)) {
        if (cssW > 0 && cssH > 0) applySize(cssW, cssH);
      }
    },

    /**
     * Quality toggle. GTAO is the most expensive pass (~2–3 ms @1080p) and is
     * the first thing dropped on weak hardware; the rest of the chain stays.
     * @param {'high'|'low'} level
     * @returns {void}
     */
    setQuality(level) {
      quality = level;
      applyAoEnabled();
    },

    /** perf-governor r1: current session trim rung (0 = untrimmed). */
    get perfTrim() { return qualityPolicy.performanceTrim; },

    /** perf-governor r1: capture/shot contexts must render untrimmed. */
    resetPerfTrims() {
      qualityPolicy.resetTrims();
      renderer.domElement.dataset.perfTrim = '0';
      applyAoEnabled();
    },

    /**
     * Opaque loading work is deliberately bursty and does not represent the
     * playable scene's steady workload. Pause all governor accounting while
     * it runs, then earn a fresh baseline from visible gameplay on resume.
     * @param {boolean} suspended
     * @returns {void}
     */
    setAdaptiveSuspended(suspended) {
      const next = !!suspended;
      if (next === adaptiveSuspended) return;
      adaptiveSuspended = next;
      renderer.domElement.dataset.adaptiveSuspended = String(next);
      resetGovernorState();
    },

    /** New scene workload = fresh crisp baseline; no low-resolution state may
     * leak from a battle into the garage (or vice versa). */
    resetAdaptiveResolution() {
      resetGovernorState();
    },

    /** QA hook (probes): force a trim rung, bypassing the strike windows. */
    forcePerfTrim(level) { setPerfTrim(level); },
  };
}
