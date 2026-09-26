import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * sky.ts — procedural atmosphere: visible sky dome, PMREM environment bake
 * (the IBL ambient layer), and horizon-matched fog.
 *
 * Implements docs/research/graphics-aaa.md §2.3 and §5, ARCHITECTURE.md §3.1.3.
 * Sun is fixed for the map: elevation 35°, azimuth 140°.
 *
 * The fog color is SAMPLED from the actual sky shader (doc §5 option (a)):
 * the sky is rendered once to a 16×16 render target through a horizontal
 * camera facing away from the sun, and the middle row is averaged. Rendering
 * to an offscreen target skips tone mapping and output encoding, so the bytes
 * read back are linear-light values — exactly the space `scene.fog` wants.
 * This guarantees the terrain edge dissolves into the sky instead of banding
 * against it, for any sky parameter tweak, deterministically.
 */
import * as THREE from 'three';
import { createDeferredDeadline } from './deferredDeadline.ts';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged);
// read inside the bake functions (post-renderer), never at module eval.
import { getDeviceTier, texSize } from './quality.ts';
import { enforceEnvValidity } from './deviceDiag.ts';
import {
  ATMOSPHERE_SKY_GLSL,
  ATMO_GROUND_KM,
  ATMO_SUN_DISC_COS,
  AtmosphereLuts,
  atmosphereKey,
  atmosphereSupported,
  skyPresetToAtmosphere,
  type AtmosphereOverrides,
  type AtmosphereSummary,
} from './atmosphere.ts';
import { SkyEnvironmentCache } from './skyEnvironmentCache.ts';
import {
  bakeCirrusPixels,
  bakeCumulusPixels,
  type CumulusBakeConfig,
} from './skyCloudBake.ts';
import { deriveCloudLayerPreset, type CloudLayerPreset } from './cloudPresets.ts';
import type { CloudscapeConfig } from './cloudscapes.ts';
import { CLOUD_NOISE_KINDS, VolumetricCloudLayer, type CloudNoiseKind, type CloudNoiseUpload, type CloudShadowCascades } from './volumetricClouds.ts';
import { bakeCloudNoise } from './cloudNoise.ts';

type ColorTriple = readonly [number, number, number];
type VectorPair = readonly [number, number];

export interface SkyPreset {
  /** Dome radiance only; 1 preserves authored daylight. Applied under loading. */
  skyIntensity: number;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  fogDensity: number;
  fogTintHex: number;
  fogMix: number;
  envIntensity: number;
  cloudOpacity: number;
  cloudOpacity2: number;
  cloudTintHex: number;
  cloudAltM: number | null;
  cloudHazeK: number | null;
  cloudUvM: number | null;
  postExposure: number;
  cloudShadowAmp: number | null;
  /** Night sky amount 0..1, or null to derive it from skyIntensity (full at .08, none from .30). */
  nightSky: number | null;
  /** Galactic band strength multiplier (1 = the night preset's soft band). */
  galaxy: number;
  /** Nebula tint drawn along the band (null = none); a galaxy map paints its clouds with this. */
  nebulaHex: number | null;
  /** Diameter in degrees of the disc at the night key-light direction (the moon at 0.8; a planet at 3). */
  planetDeg: number;
  /** Tint of that disc. */
  planetHex: number;
  /**
   * Round 65 (2026-09-24): overrides on the physically based atmosphere the desktop tier derives from this
   * preset (atmosphere.ts `skyPresetToAtmosphere`); null = the calibrated mapping. Mars authors its thin CO2 sky.
   */
  atmosphere: AtmosphereOverrides | null;
  /**
   * Round 68 (2026-09-24): overrides on the volumetric cloud layer the desktop tier derives from this preset
   * (cloudPresets.ts `deriveCloudLayerPreset`); null = the derived layer. The decks' fields above stay the
   * authored source of every map's cloud identity.
   */
  cloudLayer: Partial<CloudLayerPreset> | null;
  /**
   * Round 71 (2026-09-25): the map's authored cloudscape (its config's `clouds` block, engine/cloudscapes.ts),
   * carried here by main.ts's authored-preset getter; null = the layer derived from the deck fields alone.
   */
  cloudscape: CloudscapeConfig | null;
}

interface CloudBakePixels {
  size: number;
  pixels: Uint8ClampedArray;
}

type CloudKind = 'cirrus' | 'cumulus';
type CloudWorkerResults = Partial<Record<CloudKind, CloudBakePixels>>;

interface CloudWorkerMessage extends CloudBakePixels {
  kind: CloudKind;
}

type CloudDeck = THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

interface SkyRig {
  sunDir: THREE.Vector3;
  horizonColor: THREE.Color;
  ensureCloudTextures(): void;
  ensureCloudTexturesChunked(tick?: () => Promise<void>): Promise<void>;
  bakeEnvironment(): void;
  applyFog(targetScene: THREE.Scene): void;
  applyPresentationPreset(
    preset: Partial<SkyPreset> | null | undefined,
    targetScene: THREE.Scene,
  ): void;
  applyPreset(preset: Partial<SkyPreset> | null | undefined, targetScene: THREE.Scene): void;
  /** Round 68: the CSM whose cascades carry the volumetric layer's cloud shadows (null when the layer is off). */
  attachShadowCascades(cascades: CloudShadowCascades): void;
  /** Round 68: the volumetric layer (probes), null on the mobile tier / `?clouds=off`. */
  readonly volumetricClouds: VolumetricCloudLayer | null;
}

function errorMessage(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

const SUN_ELEVATION_DEG = 32; // slightly lower sun → longer, more readable shadows
// 140° put the sun almost directly BEHIND the standard chase/establishing
// cameras (which look NE, azimuth ~25°): frontal key light is the flattest
// possible setup — no visible form shading and every cast shadow hides behind
// its caster ("village looks pasted on", critique r2). 115° = 90° off the
// battlefield camera axis: a true side key. Shaded faces turn toward the
// camera and building/tree/pole shadows rake laterally across the frame.
const SUN_AZIMUTH_DEG = 115;
const TURBIDITY = 4; // hazy but not white-out
const RAYLEIGH = 1.2;
const MIE_COEFFICIENT = 0.006; // visible sun disc + warm halo at the sun azimuth
const MIE_DIRECTIONAL_G = 0.82;
// The Sky shader emits radiance well above 1.0 across the whole dome at
// exposure 1.0 (the upstream demo runs exposure 0.5). Left unscaled it (a)
// clamps the horizon-fog readback to pure white and (b) makes UnrealBloom
// smear the entire sky. Scale the dome's output back into ACES-friendly range
// and compensate the environment bake with a higher ENV_INTENSITY.
const SKY_RADIANCE_SCALE = 0.38;
// Even after SKY_RADIANCE_SCALE the Mie halo around the sun spans hundreds of
// bloom-threshold-crossing pixels — UnrealBloom smears that huge area into a
// half-frame white-out whenever the camera faces the sun azimuth. Soft-knee
// compress the DOME's luminance: below SKY_KNEE untouched, above it an
// exponential shoulder asymptoting at SKY_KNEE + SKY_KNEE_RANGE = 1.6. The
// halo (lum ~2-6) lands ~1.2-1.35 → under the 1.35 bloom threshold, while the
// actual sun disc (lum >> 100) still reaches ~1.6 → blooms locally, reading
// as a compact bright disc + halo instead of a screen-edge blowout. Scene
// emissives (muzzle flash, tracers, fire) are untouched — Sky shader only.
// r8 ("horizon haze blows out to clipped white: milky white-out quarter around
// the sun azimuth, winter sky a flat white disc — haze + bloom stack with no
// rolloff"): knee 1.2 → 1.0 and range 0.5 → 0.45 put the dome's ASYMPTOTE at
// 1.45, safely under post.ts's 1.55 bloom threshold — atmospheric scattering
// can no longer feed the bloom pass at all (the "haze band + bloom" white-out
// mechanism). Falloff 0.125 → 0.06 compresses the wide Mie halo (lum 2-6)
// much harder — it lands at 1.03-1.12 instead of 1.25-1.35 — while the true
// sun disc (lum >> 100) still reaches ~1.44 and keeps reading as the hottest
// point in the sky.
const SKY_KNEE = 1.0;
const SKY_KNEE_RANGE = 0.45;
// r9 ("the sun quadrant of battlefield_urban is a huge structureless white
// wash"): falloff 0.06 compressed the entire Mie halo (lum 2-6) into a
// 1.03-1.12 sliver — mathematically un-clipped but visually ONE flat band.
// 0.11 re-spreads the halo across 1.04-1.19 so the wash carries a readable
// radial gradient again, while the asymptote (1.45) stays under the bloom
// threshold and the true sun disc still tops the range.
const SKY_KNEE_FALLOFF = 0.11; // 1/e width of the shoulder in luminance units
// Horizon haze treatment (r3 critique: "horizon band blows out to near pure
// white with no hue — reads as fog-card overexposure"). Inside the low-
// elevation band the dome's luminance is soft-compressed to sit ~10-15% below
// white after ACES, and a faint luminance-preserving pale-blue hue floor is
// mixed in so the haze reads as atmosphere, never as blown white. A tiny
// screen-space dither breaks up banding on these low-frequency ramps.
// r4: ceiling 0.80 → 0.72 and tint mix 0.30 → 0.45 — the band still read as a
// uniform near-white stripe that abruptly desaturated the sky-terrain
// junction; it now grades into a clearly blue-grey atmospheric wash, and the
// fog color (sampled from this same band) follows automatically so distance
// haze inherits the same hue instead of going white.
// r5: ceiling 0.72 → 0.64 and a clearly BLUE tint at mix 0.58 (was a barely
// blue 0.45) — the band still read as near-white neutral gray, and because
// the fog color is SAMPLED from this band, the whole far field inherited
// that gray ("flat fog-card mountains"). The horizon now sits a solid step
// below white with an unmistakable blue-atmosphere hue, and distance haze
// downstream (fog + aerial scatter-in) follows automatically.
// r6: the SINGLE fixed tint made the band a "uniform white band that abruptly
// desaturates the sky-terrain junction" — identical in every direction, so
// the sky read as a two-tone gradient and the BRIGHT anti-sun horizon looked
// like a second sun. The tint is now DIRECTIONAL: rays near the sun azimuth
// scatter warm (Mie forward lobe), rays away scatter cool blue, and the
// luminance ceiling itself dips ~10% on the anti-sun side — the standard
// single-scattering horizon treatment.
// r8: ceiling 0.64 → 0.56 and band top 0.18 → 0.24 — the near-horizon wash
// still sat at display ~228-238 (a "clipped white" read even though the
// values never hit 255); 0.56 lands it at ~215-220 with the directional hue
// clearly legible, and the taller band grades the milky region above the
// skyline instead of cutting off right at it. Fog + aerial scatter sample
// this same band, so the far-field wash follows automatically.
// r5 ("battlefield_urban: featureless bleached horizon band occupying ~25%
// of frame height"): 0.56 → 0.50 — the band still averaged ~230 display
// with 18% of texels over 235. 0.50 lands it ~205-215 with the directional
// warm/cool hue unmistakably legible. Paired with HORIZON_LUM_CAP 0.55 →
// 0.48 (fog + scatter-in + cloud haze pole inherit that sample) and post.ts
// AERIAL_HAZE_LUM_CAP 0.50 → 0.44.
const HAZE_MAX_LUM = 0.50; // linear pre-ACES luminance ceiling in the band
const HAZE_COMPRESS = 0.18; // slope retained above the ceiling
const HAZE_BAND_TOP = 0.24; // direction.y where the haze treatment fades out
const HAZE_TINT_COOL: ColorTriple = [0.74, 0.88, 1.13]; // blue hue floor away from the sun
// r6 ("no sun disc or scattering glow anywhere"): the warm lobe was a barely
// warm near-white — golden it up and widen it (pow 3.0 → 2.4) so the sunward
// frame edge carries an unmistakable low-sun scattering glow in every shot
// that looks within ~70 deg of the sun azimuth.
const HAZE_TINT_WARM: ColorTriple = [1.24, 1.02, 0.70]; // warm scatter toward the sun azimuth
// 2.4 washed a quarter of the sky milky on the bright maps; 2.9 keeps the
// golden glow readable ~50 deg around the sun azimuth without the white wash.
const HAZE_WARM_POW = 2.9; // azimuthal width of the warm lobe
const HAZE_TINT_MIX = 0.63;
// lighting_post r7 ("deep-blue-to-haze transition at top-left shows visible
// gradient banding" on desert): 0.004 → 0.008 — the steep clear-sky rayleigh
// ramp needs ~2 linear LSBs of decorrelation to stay under the banding
// threshold after the grade's contrast re-spread; pairs with the new
// display-space IGN dither at the end of post.ts's grade pass.
const SKY_DITHER = 0.008; // linear-space dither amplitude ~2 display LSB
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
const SKY_DOME_SCALE = 10000; // must stay inside camera.far
const ENV_SKY_SCALE = 50; // PMREMGenerator.fromScene far plane = 100
// IBL is fill, not key: at 1.1 it buried the sun's shadows in a flat milky
// wash, and even 0.45 diluted open-ground shadows to a ~1.3:1 luma ratio.
// r3: 0.28 → 0.20 — omnidirectional IBL fill is the flattest of the three
// ambient layers (it lights shadowed and lit faces identically), so the fill
// budget moved to the directional HemisphereLight (lighting.ts hemi 0.32),
// which keeps shadowed faces cooler AND darker. Total fill is unchanged-ish;
// form readability at midrange is not.
const ENV_INTENSITY = 0.2;
// r7 ("scene reads 100% diffuse — no sun glint on gun barrels, periscopes, or
// metal fittings anywhere; vehicle materials clearly receive no IBL"): 0.2
// was tuned purely as a DIFFUSE fill budget, but scene.environment is also
// the only source of specular ambient — at 0.2 the periscope glass
// (metalness 0.85 / roughness 0.12) and gunmetal fittings returned nothing
// readable. Floor the per-map preset at 0.32 (max, not add: winter already
// runs 0.52 for the ice sheet and must not climb). The extra omni fill is
// offset form-wise by the hemisphere bounce floor in lighting.ts carrying
// the directional share.
// r4 LP2 ("desert dunes show a measured 3% sun/lee difference — albedo-only
// terrain"): 0.32 → 0.26. On 0.85-0.9-albedo sand the floored omni IBL was
// the single largest slope-shading killer (it lights sun and lee faces
// identically); -19% omni fill lets the sun term register on dune lee faces
// on every bright map while vehicle speculars (which carry their own
// envMapIntensity 0.75 multiplier) stay clearly readable. The rest of the
// desert delta ships as a desert.js preset retune (handoff r4).
// lighting_post r7 ("desert valley floor is a milky overexposed cream wash
// — form shadows nearly absent"): 0.26 → 0.21. Desert's art direction asks
// for 0.16; the floor was still adding +62% omni fill on the one map whose
// form shading is carried entirely by dune slope response. The specular-
// ambient duty that motivated the floor moves to the per-material
// envMapIntensity raises on optics/gunmetal/track (materials.js, r7
// handoff), which read BETTER against a slightly darker diffuse env.
const ENV_INTENSITY_FLOOR = 0.21;
// Exponential fog replaces the old linear Fog(150, 1200) that whited out the
// midground by ~300 m. r3: density dropped 0.00088 → 0.00074 — the milky wash
// was flattening the battlefield shot; the distance cue is now shared with
// the depth-driven aerial-perspective pass in post.ts (uniform desaturation),
// so the fog itself can stay thinner and keep midground color alive.
const FOG_DENSITY = 0.00074;
// r5 ("neutral gray fog ramp monochromes everything past 400m — cut density
// roughly in half"): the engine now interprets a preset's fogDensity as the
// map's TOTAL atmosphere thickness and splits it between the material-level
// FogExp2 (this share) and post.ts's directional aerial scatter-in, which
// owns hue. Maps keep their relative art direction (winter stays the
// foggiest) while every map's ramp thins enough that saturation survives to
// ~800 m and horizon ridges keep silhouette detail.
const FOG_EXTINCTION_SHARE = 0.55;
// Aerial perspective: pull the sampled horizon color toward a desaturated
// blue so distance reads as cool atmosphere, never as white-out.
const FOG_BLUE_TINT_HEX = 0x7e97b8;
const FOG_BLUE_MIX = 0.55;
const HORIZON_RT_SIZE = 16;
const FALLBACK_HORIZON_HEX = 0xc4d3dd; // hand-tuned noon-hazy, doc §5 option (b)
// Procedural cloud system, rebuilt AGAIN for r4. The r3 implementation draped
// an equirect-baked cumulus texture over two inside-out sphere shells; the
// equirect u-axis pinches toward the zenith, so any cloud mass overhead
// smeared into a tall VERTICAL WHITE STREAK (the "stretched billboard
// artifact" in battlefield.png), and isolated mid-elevation blobs read as
// cotton-puff sprites. Replaced with the standard approach for fair-weather
// decks: two FLAT CLOUD PLANES (low cumulus + high wind-sheared cirrus) with
// world-XZ planar UVs — no polar pinching by construction, natural
// perspective foreshortening toward the horizon — sampling both-axes-tileable
// baked textures, dissolved into the horizon haze with a camera-relative
// distance fade + aerial-perspective tint (distant bases go haze-grey, never
// clip against the terrain silhouette). The cumulus bake keeps the r3 shading
// recipe: domain-warped FBM carved by a hard coverage threshold (crisp
// cauliflower edges), macro clustering, and a per-texel light march toward
// the sun (bright sun-facing rims, grey-blue shaded cores); the march
// direction is fixed in texture space and the SAMPLING is rotated per map so
// shading always agrees with the sun azimuth. NOTE: the Sky shader's own
// built-in cloud noise stays force-disabled in configureSkyUniforms.
const CLOUD_SEED = 777;
const CLOUD_TEX = 1024; // cumulus deck bake, tileable in BOTH axes
const CIRRUS_TEX = 512; // thin high-veil bake
// lighting_post r7 ("cloud cover in battlefield.png is a single cirrus patch
// in one corner leaving two-thirds of the dome an empty gradient"): 0.505 →
// 0.488 + clustering 0.15 → 0.17 below — carves ~30% more cumulus area into
// MORE SEPARATE masses, so every establishing camera sees 2-3 distinct
// clusters spread across the dome instead of one corner patch. The bloom
// white-out mechanism cannot return (deck luminance is knee-capped and the
// haze pole is luminance-capped).
const CLOUD_THR = 0.488;
// r7 cloud detail pass ("clouds are low-frequency painterly smears — no
// detail octaves, no sun-lit edge, obviously a single blurred canvas blit"):
// - CLOUD_EDGE is now the CUMULUS-CORE edge width; wisps/outliers (low macro
//   clustering) blend toward CLOUD_EDGE_WISP so edge sharpness VARIES between
//   crisp cauliflower cores and soft torn fringes instead of one global blur.
// - fbmD gained a 7th octave and a separate high-frequency alpha-detail
//   octave breaks the smooth interior gradients.
// - the light march got a deeper optical depth (K 0.46 → 0.62) + darker
//   shade pole, and thin sun-facing rims get an explicit silver-lining
//   boost, so masses read modeled instead of airbrushed.
// r6 (lighting_post, "clouds read as airbrushed lenticular smears; one mass
// stretches into a vertical white streak top-center"): the wisp edge at 0.11
// FBM units blurred most mass boundaries into soft gradient fringes, and the
// weak macro clustering left the whole deck as ONE connected branching mass
// (its along-view arm projects as the vertical streak). Wisp edge halved so
// fringes tear instead of airbrush, clustering +33% so the field breaks into
// separate masses with real blue gaps between them.
// r3 ("main cumulus has a hard-edged nose and directional smear banding"):
// core edge 0.022 → 0.030 and warp 0.075 → 0.09 — the r6 half-width left
// upwind mass boundaries as razor threshold contours; a slightly wider ramp
// under a stronger domain warp reads as turbulent water-vapor margin while
// the wisp/core split (r7) still varies edge character between masses.
const CLOUD_EDGE = 0.030; // clear→rim ramp width in FBM units (cumulus cores)
const CLOUD_EDGE_WISP = 0.055; // edge width for sparse wispy fringes
const CLOUD_CORE = 0.16; // rim→opaque-core ramp width in FBM units
// r4 LP2 ("top-center mass is a long diagonal airbrushed lenticular streak"):
// clustering 0.12 → 0.15 AND the macro field is now sampled ANISOTROPICALLY
// (2x frequency along the wind/march axis, see makeCloudTexture) so an
// along-wind arm breaks into separate cauliflower masses instead of one
// connected streak. Tileability holds — period 1/2 divides the unit tile.
const CLOUD_CLUSTER = 0.17; // macro-noise threshold modulation (cloud grouping)
const CLOUD_MACRO_ANISO = 2; // integer v-frequency multiplier of the macro field
const CLOUD_WARP = 0.09; // domain-warp strength (cauliflower edge crinkle)
const CLOUD_MARCH_STEPS = 12; // light-march samples toward the in-texture sun
const CLOUD_MARCH_STEP_PX = 3;
// r2 ("clouds receive no directional lighting — no lit/shadow side"): march
// depth 0.62 → 0.80 and a darker shade pole so the baked sun-side/belly split
// survives ACES + the haze mix at battle-camera distances; paired with the
// NEW deck-shader mass shading term (uShadeW) that darkens texels lying
// down-sun of denser cloud at ~150 m scale — a whole-mass lit/shadow axis,
// not just per-texel rim shading.
const CLOUD_SHADE_K = 0.80; // optical-depth scale: bright rims, dark cores
const CLOUD_LIT: ColorTriple = [1.0, 0.98, 0.94]; // warm-white sunlit faces
const CLOUD_SHADE: ColorTriple = [0.40, 0.48, 0.67]; // cool grey-blue shaded bellies
const CLOUD_SILVER = 0.38; // extra silver-lining gain on thin sun-facing rims
// r2 ("smeared 2D noise blobs ... visible directional streaking like a
// stretched low-res texture"): interior alpha detail 0.42 → 0.56 — the high-
// frequency octave has to survive the grazing-angle anisotropic minification
// that softens everything toward the horizon.
// r4 LP2 ("remaining wisps are soft gradient veils without modeled
// cauliflower structure at full-frame scale"): 0.56 → 0.68 — deeper interior
// alpha carving so mass interiors keep billow structure at establishing size.
const CLOUD_DETAIL_AMP = 0.68; // high-frequency alpha modulation inside masses
// Cloud decks are viewed at extreme grazing angles (the infinite-plane
// projection): with the default anisotropy of 1 the mip filter smears every
// horizonward cloud into a streak — the single biggest "blurred canvas blit"
// contributor. 8x anisotropic sampling keeps bank edges readable to ~5 deg.
const CLOUD_ANISOTROPY = 8;
// r5: per-cloud macro opacity variation — breaks the uniform cotton-blob read
// (each mass gets its own 0.74-1.0 alpha weight from the clustering noise).
const CLOUD_ALPHA_VAR = 0.26;
const CLOUD_ALT = 620; // classic 1049 cumulus deck altitude
const CIRRUS_ALT = 1350;
// r6 GEOMETRY REWORK ("sky is a flat two-tone gradient — clouds only exist in
// the top quarter of the frame, empty gradient from there to a uniform white
// horizon band"): the r5 FLAT 9000 m planes could physically never reach the
// horizon — at 620 m altitude the deck needs ~4.4 km of ground distance to sit
// at 8 degrees of elevation, past both the plane edge and camera.far, so every
// camera saw a naked gradient below ~15 degrees. Replaced with HORIZON-
// FLATTENED SKYDOME SHELLS (radius inside camera.far) whose fragment shader
// analytically intersects the view ray with an INFINITE virtual deck plane at
// uAlt: uv = (camXZ + dir.xz * (uAlt-camY)/dir.y) / scale. Mathematically an
// endless cloud deck — cumulus now grades in natural perspective from big
// masses overhead to fine haze-tinted banks AT the horizon, from every
// camera, with zero polar pinching (planar UVs by construction).
const CLOUD_DOME_RADIUS = 3400; // < camera.far 4000; > horizon ring 1290 (mountains occlude correctly)
const CIRRUS_DOME_RADIUS = 3600;
// r6: 4200 → 3200 — at 4200 m/repeat a single connected mass spanned several
// km of deck and projected as a frame-tall smear from the battle cameras;
// 3200 shrinks individual masses to WoT-scale cumulus and shows ~1.7x more
// distinct clouds per frame.
const CLOUD_UV_METERS = 3200; // meters per cumulus texture repeat
const CIRRUS_UV_METERS = 5600;
// Slant-distance haze rates (1/m): haze = 1-exp(-(t*k)^2) on the analytic
// slant range t to the virtual deck. Cumulus: ~4% hazed at 30 deg,
// ~16% at 15 deg, ~44% at 8 deg, ~77% at 5 deg — lower banks retain modeled
// bodies while their bases melt into the horizon
// atmosphere instead of clipping. Cirrus sits higher so its rate is slower.
const CLOUD_HAZE_K = 0.00023;
const CIRRUS_HAZE_K = 0.00010;
// direction.y band where deck alpha melts out at the horizon line itself.
// r5: [0.012, 0.055] → [0.007, 0.034] — the deck used to vanish ~3 deg above
// the skyline, leaving the bleached band with zero texture; hazed cloud
// bases now grade all the way into the horizon wash (they inherit the haze
// color, so no hard silhouettes against the terrain edge).
const CLOUD_Y_FADE: VectorPair = [0.007, 0.034];
const CLOUD_MAX_ALPHA = 0.94;
const CLOUD_BAKE_CONFIG: Readonly<CumulusBakeConfig> = Object.freeze({
  seed: CLOUD_SEED,
  warp: CLOUD_WARP,
  macroAniso: CLOUD_MACRO_ANISO,
  threshold: CLOUD_THR,
  cluster: CLOUD_CLUSTER,
  edge: CLOUD_EDGE,
  edgeWisp: CLOUD_EDGE_WISP,
  coreWidth: CLOUD_CORE,
  marchSteps: CLOUD_MARCH_STEPS,
  marchStepPx: CLOUD_MARCH_STEP_PX,
  shadeK: CLOUD_SHADE_K,
  lit: CLOUD_LIT,
  shade: CLOUD_SHADE,
  silver: CLOUD_SILVER,
  detailAmp: CLOUD_DETAIL_AMP,
  alphaVariation: CLOUD_ALPHA_VAR,
  maxAlpha: CLOUD_MAX_ALPHA,
});
// r2: 0.6 → 0.5 — the cirrus veil is the main "directional streaking"
// contributor in the establishing shots; thinner default keeps it a subtle
// high veil (map presets still override).
// r3: 0.5 → 0.42 — the sheared veil is the residual "directional smear
// banding" contributor on verdant; map presets still override.
const CLOUD_LAYER2_OPACITY = 0.42; // default for preset field cloudOpacity2 (cirrus)

// Per-map sky preset defaults — map configs (src/world/maps/*) override any
// subset via createSky(...).applyPreset(preset, scene).
const DEFAULT_PRESET: Readonly<SkyPreset> = Object.freeze({
  skyIntensity: 1,
  sunElevationDeg: SUN_ELEVATION_DEG,
  sunAzimuthDeg: SUN_AZIMUTH_DEG,
  turbidity: TURBIDITY,
  rayleigh: RAYLEIGH,
  mieCoefficient: MIE_COEFFICIENT,
  mieDirectionalG: MIE_DIRECTIONAL_G,
  fogDensity: FOG_DENSITY,
  fogTintHex: FOG_BLUE_TINT_HEX,
  fogMix: FOG_BLUE_MIX,
  envIntensity: ENV_INTENSITY,
  cloudOpacity: 1.0,
  cloudOpacity2: CLOUD_LAYER2_OPACITY,
  cloudTintHex: 0xffffff,
  // r3 overcast support ("winter sky is a completely featureless warm-grey
  // gradient" — winter ALREADY ran cloudOpacity 1.0, but its establishing
  // cameras only see the 2-12 deg elevation band, where a 620 m deck sits
  // 6-7 km of slant range out and the haze term erases all texture). Maps
  // can now pull the virtual deck DOWN (stratus altitude) and thin the
  // slant-haze so a broken low deck stays readable at grazing elevations:
  //   winter.js suggested values — cloudAltM: 340, cloudHazeK: 0.00015,
  //   cloudUvM: 2400 (smaller masses read as broken stratus).
  // null = AUTO: fair-weather maps keep the classic 620 m cumulus deck; presets that
  // read as OVERCAST (both decks near-opaque + turbid sky — winter is the
  // only current match) drop to a 340 m broken-stratus deck so grazing
  // establishing cameras see modeled cloud instead of a bare grey gradient.
  cloudAltM: null,
  cloudHazeK: null,
  cloudUvM: null,
  // r3 per-map display exposure trim, applied by post.ts's grade (uExposure):
  // 1.0 = neutral. Desert should ship ~0.88 (the "sand midtones at RGB 245"
  // blowout is an exposure problem the global grade must not pay for).
  postExposure: 1,
  // r5 cloud-shadow / light-patchiness depth, applied by post.ts's aerial
  // pass (uCloudShade): null = AUTO — fair-weather maps get 0.22 (soft
  // world-anchored cloud shadows breaking up the uniform field luminance),
  // OVERCAST presets (winter) drop to 0.10: a diffuse-lit deck casts no
  // crisp cloud shadows, but gentle fog patchiness still modulates the wash.
  cloudShadowAmp: null,
  // round 22 (2026-09-18): night sky knobs — the night preset's derived starfield, soft band and moon
  // by default; a map may force the night sky and ask for a galaxy (band, nebula, a planet disc).
  nightSky: null,
  galaxy: 1,
  nebulaHex: null,
  planetDeg: 0.8,
  planetHex: 0xedf2ff,
  atmosphere: null,
  cloudLayer: null,
  cloudscape: null,
});

/** Round 68: the complete default preset (the receipts merge a map's sky block over it as the rig does). */
export const DEFAULT_SKY_PRESET: Readonly<SkyPreset> = DEFAULT_PRESET;

/** How much of the night sky a dome intensity earns: full at the night preset's .08, none from .30 up. */
export function nightAmount(skyIntensity: number): number {
  return THREE.MathUtils.clamp((NIGHT_SKY_FULL_INTENSITY_TOP - skyIntensity) / (NIGHT_SKY_FULL_INTENSITY_TOP - NIGHT_SKY_FULL_INTENSITY), 0, 1);
}
/** Dome intensity at and below which the night sky is fully present. */
const NIGHT_SKY_FULL_INTENSITY = 0.08;
/** Dome intensity from which no night sky shows (daylight presets run 1.0). */
const NIGHT_SKY_FULL_INTENSITY_TOP = 0.30;
// Night sky (round 22, owner 2026-09-18 "skyboxes … should be so good"): the night preset used to dim the
// Preetham dome to .08 and leave it at that — a featureless dark gradient. The dome now carries a
// deterministic starfield (hash-seeded star cells on a lat-long grid: a few hundred bright stars over a
// dim carpet, warm and cool tints), a soft galactic band across a tilted great circle, and a moon disc at
// the night key-light direction (the atmosphere runtime aims the "sun" as moonlight) with a gibbous
// terminator, maria mottle and a compact glow. Everything is added AFTER the dome intensity multiply and
// fades into the horizon haze, so it never brightens the daylight dome (uNight is 0 there).
const NIGHT_SKY_GLSL = /* glsl */`
vec3 cotHash3( vec2 c ) {
	return fract( sin( vec3( dot( c, vec2( 127.1, 311.7 ) ), dot( c, vec2( 269.5, 183.3 ) ), dot( c, vec2( 419.2, 371.9 ) ) ) ) * 43758.5453 );
}
float cotValueNoise( vec3 p ) {
	vec3 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	float n = i.x + i.y * 57.0 + i.z * 113.0;
	float a = fract( sin( n ) * 43758.5453 ), b = fract( sin( n + 1.0 ) * 43758.5453 );
	float c = fract( sin( n + 57.0 ) * 43758.5453 ), d = fract( sin( n + 58.0 ) * 43758.5453 );
	float e = fract( sin( n + 113.0 ) * 43758.5453 ), g = fract( sin( n + 114.0 ) * 43758.5453 );
	float h = fract( sin( n + 170.0 ) * 43758.5453 ), k = fract( sin( n + 171.0 ) * 43758.5453 );
	return mix( mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ), mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ), f.z );
}
vec3 cotNightSky( vec3 dn, vec3 moonDir, float galaxy, vec3 nebula, float planetR, vec3 planetTint ) {
	float horizonFade = smoothstep( 0.012, 0.15, dn.y );
	// galactic band: a great circle tilted off the zenith, denser and faintly luminous along it; a galaxy
	// preset widens it and paints nebula clouds along it with three octaves of value noise
	vec3 bandN = normalize( vec3( 0.47, 0.88, -0.10 ) );
	float bandD = abs( dot( dn, bandN ) );
	float band = exp( -bandD * bandD * ( 34.0 / max( galaxy, 0.25 ) ) ) * galaxy;
	float nebulaW = 0.0;
	if ( dot( nebula, nebula ) > 0.0001 ) {
		float n1 = cotValueNoise( dn * 6.0 + 3.1 ), n2 = cotValueNoise( dn * 13.0 - 7.7 ), n3 = cotValueNoise( dn * 27.0 + 1.9 );
		float cloud = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
		nebulaW = exp( -bandD * bandD * 12.0 ) * smoothstep( 0.42, 0.78, cloud ) * galaxy;
	}
	// star cells on a lat-long grid (about 0.55 deg at the equator)
	vec2 sc = vec2( atan( dn.z, dn.x ), asin( clamp( dn.y, -1.0, 1.0 ) ) ) * 104.0;
	vec2 cell = floor( sc );
	vec2 f = sc - cell;
	vec3 stars = vec3( 0.0 );
	for ( int oy = -1; oy <= 1; oy++ ) {
		for ( int ox = -1; ox <= 1; ox++ ) {
			vec2 c = cell + vec2( float( ox ), float( oy ) );
			vec3 h = cotHash3( c );
			float presence = step( 1.0 - ( 0.11 + band * 0.42 ), h.z );
			vec2 offs = vec2( float( ox ), float( oy ) ) + h.xy - f;
			float mag = pow( fract( h.z * 7.31 ), 8.0 );
			float radius = 0.075 + mag * 0.11;
			float pointW = presence * exp( -dot( offs, offs ) / ( radius * radius ) );
			vec3 tint = mix( vec3( 0.78, 0.86, 1.00 ), vec3( 1.00, 0.90, 0.70 ), fract( h.x * 3.7 ) );
			stars += tint * pointW * ( 0.09 + mag * 1.45 );
		}
	}
	// moon (or a preset's planet): a disc at the night key-light direction, gibbous phase, maria mottle,
	// compact glow
	float md = dot( dn, moonDir );
	float moonR = max( planetR, 0.002 );
	float moonCos = cos( moonR );
	float disc = smoothstep( moonCos - 0.00010, moonCos + 0.00005, md );
	vec3 mx = normalize( cross( moonDir, vec3( 0.0, 1.0, 0.0 ) ) );
	vec3 my = cross( mx, moonDir );
	vec2 mo = vec2( dot( dn, mx ), dot( dn, my ) ) / moonR;
	float mz = sqrt( max( 0.0, 1.0 - dot( mo, mo ) ) );
	vec3 mn = vec3( mo, mz );
	vec3 phaseL = normalize( vec3( 0.55, 0.25, 0.80 ) );
	float lit = clamp( dot( mn, phaseL ), 0.0, 1.0 );
	float terminator = smoothstep( -0.06, 0.22, dot( mn, phaseL ) );
	float maria = 0.74 + 0.26 * cotHash3( floor( mo * 3.0 + 7.0 ) ).x;
	vec3 moonCol = planetTint * ( 0.10 + 1.30 * lit ) * maria * terminator;
	// the compact glow scales with the disc (a 3 deg planet keeps a ~4 deg halo, never a quarter-sky wash)
	float glowPow = max( 900.0 * 0.0070 / moonR, 160.0 );
	float glow = pow( max( md, 0.0 ), glowPow ) * 0.24 + pow( max( md, 0.0 ), 48.0 ) * 0.030;
	return ( stars * 0.90 + band * vec3( 0.16, 0.19, 0.28 ) * 0.18 + nebula * nebulaW * 0.55 ) * horizonFade
		+ moonCol * disc * 1.7 + planetTint * glow * horizonFade;
}`;

// Round 65 (2026-09-24): the physically based dome. On the desktop tier the visible sky is the Hillaire
// atmosphere of atmosphere.ts sampled from its sky-view LUT — the Preetham `Sky` above stays the mobile tier's
// dome and the probe the receipts pin — with the sun disc seen through the atmosphere's transmittance, the
// legacy knee (the disc exempt, so it still blooms into a compact disc + halo), the legacy compact sun glow, the
// dither and the round-22 night sky composited exactly as before: the night preset dims the atmosphere with
// skyIntensity (.08 — a moonlit sky, the moon being the key light) and the starfield, band and moon ride on top.
// Below the horizon the dome repeats its horizon (the ring occludes the rest), as the Preetham dome did.
// The disc's radiance follows the legacy dome's law, not a display choice: three's Preetham shader emits the disc at
// sunIntensity(elevation) × 19000 × Fex, sky.ts scales the dome by 0.04 × SKY_RADIANCE_SCALE, and the knee exempts the
// disc — so it stays at ~1e5 and PMREMGenerator integrates its 2.7e-4 sr into the environment's diffuse mip: a
// shadowless fill of ~0.5 irradiance units (× envIntensity, × the foliage materials' envMapIntensity 0.85) that every
// map's ground was tuned with (measured: a 40-radiance disc darkened Verdant's near field 37 %). The physically based
// dome keeps that energy exactly, with the atmosphere's transmittance toward the sun in place of Preetham's Fex; the
// visible disc is clipped by the emissive shoulder and blooms as before.
function legacySunDiscRadiance(sunElevationY: number): number {
  const cutoffAngle = 1.6110731556870734, steepness = 1.5, EE = 1000;
  const zenithAngle = Math.acos(THREE.MathUtils.clamp(sunElevationY, -1, 1));
  const sunE = EE * Math.max(0, 1 - Math.exp(-((cutoffAngle - zenithAngle) / steepness)));
  return sunE * 19000 * 0.04 * SKY_RADIANCE_SCALE;
}
const ATMOSPHERE_DOME_VERTEX = /* glsl */`
varying vec3 vWorldPosition;
void main() {
	vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
	vWorldPosition = worldPosition.xyz;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	gl_Position.z = gl_Position.w;
}`;
const ATMOSPHERE_DOME_FRAGMENT = /* glsl */`
uniform vec3 uSunDirection;
uniform vec3 uSunTransmittance;
uniform float uSunDiscRadiance;
uniform float uSkyIntensity;
uniform float uNight;
uniform float uGalaxy;
uniform vec3 uNebula;
uniform float uPlanetR;
uniform vec3 uPlanetTint;
${ATMOSPHERE_SKY_GLSL}
${NIGHT_SKY_GLSL}
varying vec3 vWorldPosition;
void main() {
	vec3 direction = normalize( vWorldPosition - cameraPosition );
	vec3 skyDir = normalize( vec3( direction.x, max( direction.y, 0.0 ), direction.z ) );
	vec3 skyCol = atmoSky( skyDir );
	float cosSun = dot( direction, uSunDirection );
	// the legacy knee exemption spot around the sun keeps the disc and its immediate aureole HDR
	float sunSpot = smoothstep( 0.99988, 0.99996, cosSun );
	skyCol = mix( atmoKnee( skyCol ), skyCol, sunSpot );
	// the sun disc: the legacy disc's angular size and radiance law (see legacySunDiscRadiance) through the
	// atmosphere's transmittance toward the sun
	float disc = smoothstep( ${ATMO_SUN_DISC_COS.toFixed(15)}, ${ATMO_SUN_DISC_COS.toFixed(15)} + 0.00002, cosSun );
	skyCol += uSunTransmittance * ( disc * uSunDiscRadiance );
	// the legacy compact warm forward-scatter glow (~5°) so the disc keeps its tight golden halo
	float sunGlow = pow( max( cosSun, 0.0 ), 240.0 );
	skyCol += vec3( 1.30, 1.02, 0.68 ) * sunGlow * 0.50;
	skyCol += ( fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5 ) * ${SKY_DITHER.toFixed(4)};
	vec3 nightCol = vec3( 0.0 );
	if ( uNight > 0.001 ) nightCol = cotNightSky( direction, uSunDirection, uGalaxy, uNebula, uPlanetR, uPlanetTint ) * uNight;
	gl_FragColor = vec4( max( skyCol, vec3( 0.0 ) ) * uSkyIntensity + nightCol, 1.0 );
}`;

/** Whether this renderer runs the physically based sky: the desktop tier with float render targets, unless `?atmosphere=off`. */
function atmosphereEnabledFor(renderer: THREE.WebGLRenderer): boolean {
  if (getDeviceTier() === 'mobile' || !atmosphereSupported(renderer)) return false;
  try {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('atmosphere') === 'off') return false;
  } catch { /* no location: keep the model */ }
  return true;
}

/**
 * Round 68's volumetric cloud layer was OPT-IN (`?clouds=volumetric`) from deploy 93: the owner ruled on 2026-09-25 that the
 * baked decks and the skies before it were fine, so every battlefield keeps the baked decks by default. The
 * layer stays in the tree for iteration; `?clouds=off` still names the baked decks explicitly (the pinned bake
 * receipts), and it never runs without the atmosphere.
 */
function volumetricCloudsEnabledFor(renderer: THREE.WebGLRenderer): boolean {
  if (!atmosphereEnabledFor(renderer)) return false;
  try {
    if (typeof window === 'undefined') return false;
    const requested = new URLSearchParams(window.location.search).get('clouds');
    if (requested === 'off') return false;
    // Owner 2026-09-25 evening, on the round-71 sheet: "wow our clouds look amazing" — the layer is the default on
    // every tier that renders it; `?clouds=off` (or `baked`) keeps the pinned baked decks.
    if (requested === 'baked') return false;
    return true;
  } catch { /* no location: the baked decks */ }
  return false;
}

/** What the rig publishes on scene.userData.atmosphere for the post aerial pass (read every frame, mutated in place). */
export interface AtmospherePublishedState {
  active: boolean;
  skyView: THREE.Texture | null;
  viewHeightKm: number;
  sunDir: THREE.Vector3;
  knee: THREE.Vector3;
  skyIntensity: number;
  /** Luminance of the anti-solar horizon band as the dome shows it (the elevation ratio's denominator). */
  horizonLum: number;
  /** The fog colour's luminance ceiling (HORIZON_LUM_CAP), applied per pixel to the LUT target. */
  horizonCap: number;
  fogTint: THREE.Color;
  fogMix: number;
  irradiance: THREE.Color;
  /** The live summary readback (diagnostics; the aerial pass reads only the scalars above). */
  summary: AtmosphereSummary | null;
}

/** Apply the shared atmosphere parameters to a Sky instance. @param {Sky} sky @param {THREE.Vector3} sunDir @param {object} [preset] */
function configureSkyUniforms(
  sky: Sky,
  sunDir: THREE.Vector3,
  preset: Readonly<SkyPreset> = DEFAULT_PRESET,
): void {
  const u = sky.material.uniforms;
  // Keep a stable reference: Three reuses the compiled program on a rematch
  // and does not rerun onBeforeCompile just to refresh a preset's scalar.
  u.uSkyIntensity ??= { value: 1 };
  u.uSkyIntensity.value = preset.skyIntensity;
  // round 22 (2026-09-18): a dimmed dome is a night dome — the atmosphere runtime's night preset runs
  // skyIntensity .08 — and the shader adds its starfield, galactic band and moon after that dimming
  // (inline arithmetic: the environment-cache receipt evaluates this function's source on its own —
  // full night at .08 and below, none from .30 up, the same law as nightAmount)
  u.uNight ??= { value: 0 };
  u.uNight.value = preset.nightSky ?? Math.min(1, Math.max(0, (0.30 - preset.skyIntensity) / 0.22));
  u.uGalaxy ??= { value: 1 };
  u.uGalaxy.value = preset.galaxy;
  u.uNebula ??= { value: new THREE.Color(0, 0, 0) };
  if (preset.nebulaHex == null) u.uNebula.value.setRGB(0, 0, 0); else u.uNebula.value.setHex(preset.nebulaHex);
  u.uPlanetR ??= { value: 0.007 };
  u.uPlanetR.value = preset.planetDeg * Math.PI / 360;
  u.uPlanetTint ??= { value: new THREE.Color(0xedf2ff) };
  u.uPlanetTint.value.setHex(preset.planetHex);
  u.turbidity.value = preset.turbidity;
  u.rayleigh.value = preset.rayleigh;
  // r4 ran a x1.5 Mie response so the sun registered off-azimuth; r5 pulled it
  // back to x1.1 — the widened wedge was the "gray haze band swallowing
  // two-thirds of the sky" in sun-facing frames (combat_firing). r6: x1.25 —
  // at x1.1 the critic found "no sun disc or scattering glow anywhere"; the
  // middle setting keeps blue sky above ~20 degrees on every camera while the
  // sunward frame edge carries a clearly readable warm Mie glow, and the
  // directional haze tint (below) extends that glow along the horizon.
  u.mieCoefficient.value = preset.mieCoefficient * 1.25;
  u.mieDirectionalG.value = preset.mieDirectionalG;
  u.sunPosition.value.copy(sunDir);
  // The r180+ Sky shader ships its own screen-projected FBM cloud layer
  // (cloudCoverage defaults to 0.4!) — soft 30%-smoothstep blobs with no
  // shading, the exact "airbrush smear" the critic flagged. Kill it; the
  // shaped cumulus dome below owns clouds.
  if (u.cloudCoverage) u.cloudCoverage.value = 0;
  sky.material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uSkyIntensity = u.uSkyIntensity;
    shader.uniforms.uNight = u.uNight;
    shader.uniforms.uGalaxy = u.uGalaxy;
    shader.uniforms.uNebula = u.uNebula;
    shader.uniforms.uPlanetR = u.uPlanetR;
    shader.uniforms.uPlanetTint = u.uPlanetTint;
    const patched = shader.fragmentShader.replace(
      SKY_FRAG_ANCHOR,
      `vec3 skyCol = texColor * ${SKY_RADIANCE_SCALE.toFixed(4)};
	const vec3 lumW = vec3( 0.2126, 0.7152, 0.0722 );
	// horizon haze: compress the near-white band below white and mix in a
	// DIRECTIONAL hue floor — warm toward the sun azimuth, cool blue away —
	// so the band reads as scattered sunlight, never as flat overexposure
	float hazeBand = 1.0 - smoothstep( 0.0, ${HAZE_BAND_TOP.toFixed(3)}, direction.y );
	float warmAmt = pow( max( dot( normalize( vec3( direction.x, 0.0, direction.z ) ),
		normalize( vec3( vSunDirection.x, 0.0, vSunDirection.z ) ) ), 0.0 ), ${HAZE_WARM_POW.toFixed(1)} );
	float hazeL = dot( skyCol, lumW );
	float hazeCeil = ${HAZE_MAX_LUM.toFixed(3)} * mix( 0.90, 1.00, warmAmt );
	if ( hazeL > hazeCeil && hazeBand > 0.001 ) {
		float hazeTarget = hazeCeil + ( hazeL - hazeCeil ) * ${HAZE_COMPRESS.toFixed(3)};
		skyCol *= mix( 1.0, hazeTarget / hazeL, hazeBand );
	}
	vec3 hazeTint = mix( vec3( ${HAZE_TINT_COOL[0].toFixed(3)}, ${HAZE_TINT_COOL[1].toFixed(3)}, ${HAZE_TINT_COOL[2].toFixed(3)} ),
		vec3( ${HAZE_TINT_WARM[0].toFixed(3)}, ${HAZE_TINT_WARM[1].toFixed(3)}, ${HAZE_TINT_WARM[2].toFixed(3)} ), warmAmt );
	skyCol = mix( skyCol, dot( skyCol, lumW ) * hazeTint, hazeBand * ${HAZE_TINT_MIX.toFixed(3)} );
	// sun-disc knee exemption (r6 "no sun disc or scattering glow anywhere"):
	// the dome-wide soft knee kept the WHOLE sky under the bloom threshold —
	// including the sun itself, which rendered as a flat matte circle. Exempt
	// a ~1.7x-disc-radius spot around the sun direction so the disc + its
	// immediate Mie peak keep true HDR values: the post chain's emissive
	// shoulder rolls them to <= 4.55 and they bloom into a compact glowing
	// disc + halo, while the WIDE halo (the old white-out mechanism) stays
	// fully knee-compressed.
	float sunDisc = smoothstep( 0.99988, 0.99996, dot( direction, vSunDirection ) );
	float skyL = dot( skyCol, lumW );
	if ( skyL > ${SKY_KNEE.toFixed(3)} ) {
		float kneeScale = ( ${SKY_KNEE.toFixed(3)} + ${SKY_KNEE_RANGE.toFixed(3)} * ( 1.0 - exp( -( skyL - ${SKY_KNEE.toFixed(3)} ) * ${SKY_KNEE_FALLOFF.toFixed(4)} ) ) ) / skyL;
		skyCol *= mix( kneeScale, 1.0, sunDisc );
	}
	// r2 ("no sun disc"): compact warm forward-scatter glow around the disc —
	// pow 240 spans ~5 deg, so the disc reads as the frame's hottest point
	// with a tight golden halo (the disc+glow crosses the 1.78 bloom
	// threshold and blooms locally) while the WIDE Mie halo stays fully
	// knee-compressed — the old white-out mechanism cannot return.
	float sunGlow = pow( max( dot( direction, vSunDirection ), 0.0 ), 240.0 );
	skyCol += vec3( 1.30, 1.02, 0.68 ) * sunGlow * 0.50;
	// break up gradient banding on the low-frequency sky ramps
	skyCol += ( fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) - 0.5 ) * ${SKY_DITHER.toFixed(4)};
	vec3 nightCol = vec3( 0.0 );
	if ( uNight > 0.001 ) nightCol = cotNightSky( normalize( direction ), vSunDirection, uGalaxy, uNebula, uPlanetR, uPlanetTint ) * uNight;
	gl_FragColor = vec4( max( skyCol, vec3( 0.0 ) ) * uSkyIntensity + nightCol, 1.0 );`,
    );
    if (patched === shader.fragmentShader) {
      throw new Error('sky.ts: radiance-scale injection anchor not found in Sky shader');
    }
    shader.fragmentShader = `uniform float uSkyIntensity;\nuniform float uNight;\nuniform float uGalaxy;\nuniform vec3 uNebula;\nuniform float uPlanetR;\nuniform vec3 uPlanetTint;\n${NIGHT_SKY_GLSL}\n${patched}`;
  };
  sky.material.needsUpdate = true;
}

/**
 * Wrap deterministic RGBA bytes in the same CanvasTexture used by the deck
 * shaders. Pixel generation may happen on this thread as a compatibility
 * fallback or arrive from skyCloudWorker.
 */
function cloudTextureFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sky.ts: 2D canvas context unavailable for cloud texture');
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = CLOUD_ANISOTROPY;
  return texture;
}

/**
 * Bake or install the low cumulus deck. Worker results retain the exact
 * authored bytes; the synchronous path is the compatibility fallback.
 */
function makeCloudTexture(prebaked: CloudBakePixels | null = null): THREE.CanvasTexture {
  const width = prebaked?.size || texSize(CLOUD_TEX);
  const pixels = prebaked?.pixels
    || bakeCumulusPixels(width, width, CLOUD_BAKE_CONFIG);
  return cloudTextureFromPixels(pixels, width, width);
}

/** Bake or install the high cirrus deck with the same byte-exact contract. */
function makeCirrusTexture(prebaked: CloudBakePixels | null = null): THREE.CanvasTexture {
  const width = prebaked?.size || texSize(CIRRUS_TEX);
  const pixels = prebaked?.pixels
    || bakeCirrusPixels(width, width, CLOUD_BAKE_CONFIG);
  return cloudTextureFromPixels(pixels, width, width);
}

interface HorizonColorCache {
  context: WebGLRenderingContext | WebGL2RenderingContext;
  rendererInfo: THREE.WebGLRenderer['info'];
  colors: Map<string, THREE.Color>;
  /** Round 37: luminance of the sky ~16° above the anti-solar horizon over the horizon row's, from the same probe. */
  elevationFalloff: Map<string, number>;
}

// Keep only CPU colors, never off-tree GPU probes requiring another lifetime
// owner. Four entries cover common Garage/day/night returns without turning
// a long map-browsing session into unbounded retained presentation state.
const HORIZON_COLOR_CACHE_LIMIT = 4;
const horizonColorCaches = new WeakMap<THREE.WebGLRenderer, HorizonColorCache>();

function horizonColorCache(renderer: THREE.WebGLRenderer): HorizonColorCache | null {
  const context = renderer.getContext();
  if (context.isContextLost()) {
    horizonColorCaches.delete(renderer);
    return null;
  }
  let cache = horizonColorCaches.get(renderer);
  // Three replaces renderer.info while reinitializing a restored context,
  // including when the browser retains the same native context object.
  if (!cache || cache.context !== context || cache.rendererInfo !== renderer.info) {
    cache = { context, rendererInfo: renderer.info, colors: new Map(), elevationFalloff: new Map() };
    horizonColorCaches.set(renderer, cache);
  }
  return cache;
}

function horizonColorKey(
  renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3, preset: Readonly<SkyPreset>,
): string | null {
  const scalars = [sunDir.x, sunDir.y, sunDir.z, preset.skyIntensity,
    preset.turbidity, preset.rayleigh, preset.mieCoefficient, preset.mieDirectionalG,
    renderer.toneMapping, renderer.toneMappingExposure];
  if (!scalars.every(Number.isFinite) || renderer.xr.isPresenting) return null;
  return `${scalars.join(',')}|${renderer.outputColorSpace}|${THREE.ColorManagement.workingColorSpace}|${THREE.ColorManagement.enabled}`;
}

function environmentKey(
  renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3, preset: Readonly<SkyPreset>, atmosphereSuffix = '',
): string | null {
  const skyKey = horizonColorKey(renderer, sunDir, preset);
  const clearColor = renderer.getClearColor(new THREE.Color());
  const background = [clearColor.r, clearColor.g, clearColor.b, renderer.getClearAlpha()];
  // PMREM forces NoToneMapping and disables XR; conservative output keys also
  // cover the retained horizon contract. Never round radiance or sun inputs.
  // Round 65: the physically based dome appends its exact parameter key (atmosphere.ts atmosphereKey).
  if (skyKey === null || !background.every(Number.isFinite)) return null;
  return `${skyKey}|${background.join(',')}${atmosphereSuffix ? `|atmo:${atmosphereSuffix}` : ''}`;
}

/** Three's fromScene has no exception cleanup; restore all state it mutates. */
function withEnvironmentRenderState<Result>(renderer: THREE.WebGLRenderer, work: () => Result): Result {
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const xrEnabled = renderer.xr.enabled;
  const toneMapping = renderer.toneMapping, autoClear = renderer.autoClear;
  const restore = (): void => {
    renderer.xr.enabled = xrEnabled;
    renderer.toneMapping = toneMapping;
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(target, face, mip);
  };
  let failed = true;
  try {
    const result = work();
    failed = false;
    return result;
  } finally {
    if (failed) {
      try { restore(); } catch { /* Retain the original generation/validation error. */ }
    } else restore();
  }
}

function disposeEnvironmentSky(sky: Sky): void {
  let rethrow: (() => never) | null = null;
  try { sky.geometry.dispose(); } catch (error) { rethrow = () => { throw error; }; }
  try { sky.material.dispose(); } catch (error) { rethrow ??= () => { throw error; }; }
  rethrow?.();
}

function retainHorizonColor(
  renderer: THREE.WebGLRenderer, cache: HorizonColorCache | null,
  key: string | null, color: THREE.Color, elevationFalloff: number,
): void {
  if (!cache || key === null || cache.context.isContextLost()
    || renderer.getContext() !== cache.context || renderer.info !== cache.rendererInfo) return;
  cache.colors.set(key, color.clone());
  cache.elevationFalloff.set(key, elevationFalloff);
  if (cache.colors.size > HORIZON_COLOR_CACHE_LIMIT) {
    const oldest = cache.colors.keys().next();
    if (!oldest.done) { cache.colors.delete(oldest.value); cache.elevationFalloff.delete(oldest.value); }
  }
}

// Round 37 (AAA program check 5, "a mountain is never paler than the sky behind it"): the aerial pass used to pull
// every far pixel toward the HORIZON sample, but a ridge standing 8–20° above the horizon sits against a sky that is
// already much darker than the haze band (desert: 40 vs 140 display luma at +4°). The probe's 16 rows span ±20° at
// 2.5° a row, so row 14 (about +16°) over row 8 (the horizon) is the sky's own elevation falloff for the map — the
// post pass scales its scatter-in target by it along the ray's elevation. Uniform or failed reads yield 1 (no change).
const HORIZON_ELEVATION_ROW = 14;
const HORIZON_ELEVATION_FALLOFF_FLOOR = 0.05;
/** Round 37: the retained sky-luminance ratio (~+16° over the horizon) for a sampled atmosphere, 1 when unknown. */
export function sampleHorizonElevationFalloff(
  renderer: THREE.WebGLRenderer,
  sunDir: THREE.Vector3,
  preset: Readonly<SkyPreset> = DEFAULT_PRESET,
): number {
  sampleHorizonColor(renderer, sunDir, preset);
  const key = horizonColorKey(renderer, sunDir, preset);
  return (key === null ? undefined : horizonColorCaches.get(renderer)?.elevationFalloff.get(key)) ?? 1;
}

/**
 * Return an exact retained CPU sample or render a throwaway sky to a 16×16
 * target with a horizon-level camera facing away from the sun, average the
 * middle pixel row, and return the linear color. Misses preserve the original
 * probe; failed/black reads never become a cached atmosphere result.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector3} sunDir - unit toward-sun vector
 * @returns {THREE.Color} linear-space horizon color
 */
export function sampleHorizonColor(
  renderer: THREE.WebGLRenderer,
  sunDir: THREE.Vector3,
  preset: Readonly<SkyPreset> = DEFAULT_PRESET,
): THREE.Color {
  const cache = horizonColorCache(renderer);
  const key = horizonColorKey(renderer, sunDir, preset);
  const previousColor = key === null ? null : cache?.colors.get(key);
  if (previousColor && cache && key !== null) {
    cache.colors.delete(key);
    cache.colors.set(key, previousColor);
    return previousColor.clone();
  }
  const rt = new THREE.WebGLRenderTarget(HORIZON_RT_SIZE, HORIZON_RT_SIZE, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  const sampleScene = new THREE.Scene();
  const sampleSky = new Sky();
  sampleSky.scale.setScalar(ENV_SKY_SCALE);
  configureSkyUniforms(sampleSky, sunDir, preset);
  sampleScene.add(sampleSky);

  // Horizontal camera looking directly away from the sun's azimuth, at the horizon.
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, ENV_SKY_SCALE * 2);
  cam.position.set(0, 0, 0);
  cam.lookAt(-sunDir.x, 0, -sunDir.z);
  cam.updateMatrixWorld();

  const prevTarget = renderer.getRenderTarget();
  const prevFace = renderer.getActiveCubeFace();
  const prevMip = renderer.getActiveMipmapLevel();
  // round 37: rows 8..15 in one readback — row 8 is the horizon (the original average), row 14 the +16° sky
  const block = new Uint8Array(HORIZON_RT_SIZE * 4 * (HORIZON_RT_SIZE >> 1));
  let targetRestored = false;
  let r = 0;
  let g = 0;
  let b = 0;
  let elevationLum = 0;
  try {
    renderer.setRenderTarget(rt);
    renderer.render(sampleScene, cam);
    renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    targetRestored = true;
    renderer.readRenderTargetPixels(rt, 0, HORIZON_RT_SIZE >> 1, HORIZON_RT_SIZE, HORIZON_RT_SIZE >> 1, block);

    for (let i = 0; i < HORIZON_RT_SIZE; i++) {
      r += block[i * 4];
      g += block[i * 4 + 1];
      b += block[i * 4 + 2];
    }
    const inv = 1 / (HORIZON_RT_SIZE * 255);
    r *= inv;
    g *= inv;
    b *= inv;
    const elevationRow = (HORIZON_ELEVATION_ROW - (HORIZON_RT_SIZE >> 1)) * HORIZON_RT_SIZE * 4;
    for (let i = 0; i < HORIZON_RT_SIZE; i++) {
      const o = elevationRow + i * 4;
      elevationLum += (0.2126 * block[o] + 0.7152 * block[o + 1] + 0.0722 * block[o + 2]) * inv;
    }
  } finally {
    try {
      if (!targetRestored) renderer.setRenderTarget(prevTarget, prevFace, prevMip);
    } finally {
      rt.dispose();
      sampleSky.geometry.dispose();
      sampleSky.material.dispose();
    }
  }

  // Guard the degenerate case (context hiccup → black readback): fall back to
  // the hand-tuned preset rather than fogging the world to black.
  if (r + g + b < 0.01) return new THREE.Color(FALLBACK_HORIZON_HEX);
  // r8 highlight-rolloff: everything downstream of this sample (FogExp2
  // color, the aerial scatter-in targets in post.ts, the cloud decks' haze
  // pole) inherits its luminance — cap it below diffuse-white so no amount
  // of fog/scatter stacking can pull large screen regions to a clipped
  // white-out (the desert/winter far-field wash). Hue is preserved.
  const color = capColorLuminance(
    new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace), HORIZON_LUM_CAP);
  // the falloff compares the two rows' sRGB-encoded luminance sums (the same 8-bit readback as the colour); its ratio
  // is what the post pass needs, and it is clamped so a black upper row can never zero the scatter-in
  const horizonLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const elevationFalloff = horizonLum > 0.002
    ? Math.min(1, Math.max(HORIZON_ELEVATION_FALLOFF_FLOOR, elevationLum / horizonLum)) : 1;
  retainHorizonColor(renderer, cache, key, color, elevationFalloff);
  return color;
}

// Linear-luminance ceiling for the horizon sample (see sampleHorizonColor).
// 0.55 linear lands at ~215/255 display after ACES + grade — a bright haze
// that still reads as atmosphere, never as blown white.
// r3: 0.48 → 0.45 — paired with post.ts AERIAL_HAZE_LUM_CAP 0.44 → 0.41 so
// the desert mesa band and urban far field keep silhouette value against the
// haze (the "mesas ~90% swallowed by a pink haze band" read).
const HORIZON_LUM_CAP = 0.45;

/** Scale a linear color down so its Rec709 luminance is <= maxLum (hue kept).
 * @param {THREE.Color} c @param {number} maxLum @returns {THREE.Color} c */
function capColorLuminance(c: THREE.Color, maxLum: number): THREE.Color {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum > maxLum) c.multiplyScalar(maxLum / lum);
  return c;
}

/**
 * Build the visible sky dome, sample the horizon color, and return the rig
 * that owns the environment bake and fog.
 *
 * Call order (ARCHITECTURE.md §4): createRenderer → createSky →
 * rig.bakeEnvironment() → createLighting(scene, camera, rig.sunDir) → …
 * → rig.applyFog(scene).
 *
 * @param {THREE.Scene} scene - the visible sky dome is added here
 * @param {THREE.WebGLRenderer} renderer - used for the PMREM bake + horizon sample
 * @returns {SkyRig}
 */
export function createSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): SkyRig {
  let preset = { ...DEFAULT_PRESET };
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - preset.sunElevationDeg),
    THREE.MathUtils.degToRad(preset.sunAzimuthDeg),
  );

  const sky = new Sky();
  sky.scale.setScalar(SKY_DOME_SCALE);
  configureSkyUniforms(sky, sunDir, preset);
  scene.add(sky);
  // Publish the live sun direction for post.ts's directional aerial scatter
  // (same Vector3 instance — applyPreset mutates it in place, so the post
  // chain always sees the current map's sun without an explicit re-wire).
  scene.userData.sunDirWorld = sunDir;
  // r3: publish the per-map display exposure trim for post.ts's grade.
  scene.userData.postExposure = preset.postExposure;

  // Round 65: the physically based dome and its LUTs (desktop tier). The Preetham mesh stays in the scene for
  // the mobile tier and as the fallback when a summary readback fails; exactly one of the two is visible.
  const atmosphereLuts = atmosphereEnabledFor(renderer)
    ? new AtmosphereLuts(renderer, [SKY_KNEE, SKY_KNEE_RANGE, SKY_KNEE_FALLOFF]) : null;
  const skyUniforms = sky.material.uniforms;
  const atmosphereMaterial = new THREE.ShaderMaterial({
    name: 'AtmosphereSkyMaterial',
    vertexShader: ATMOSPHERE_DOME_VERTEX,
    fragmentShader: ATMOSPHERE_DOME_FRAGMENT,
    uniforms: {
      tAtmoSky: { value: atmosphereLuts?.skyView.texture ?? null },
      uAtmoSun: { value: new THREE.Vector3(0, 1, 0) },
      uAtmoViewH: { value: ATMO_GROUND_KM + 0.05 },
      uAtmoKnee: { value: new THREE.Vector3(SKY_KNEE, SKY_KNEE_RANGE, SKY_KNEE_FALLOFF) },
      uAtmoIntensity: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uSunTransmittance: { value: new THREE.Color(1, 1, 1) },
      uSunDiscRadiance: { value: legacySunDiscRadiance(sunDir.y) },
      // shared by reference with the Preetham dome: configureSkyUniforms refreshes both at once
      uSkyIntensity: skyUniforms.uSkyIntensity, uNight: skyUniforms.uNight, uGalaxy: skyUniforms.uGalaxy,
      uNebula: skyUniforms.uNebula, uPlanetR: skyUniforms.uPlanetR, uPlanetTint: skyUniforms.uPlanetTint,
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmosphereDome = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), atmosphereMaterial);
  atmosphereDome.name = 'atmosphere-dome';
  atmosphereDome.scale.setScalar(SKY_DOME_SCALE);
  atmosphereDome.frustumCulled = false;
  atmosphereDome.visible = false;
  sky.visible = true;
  scene.add(atmosphereDome);
  const atmosphereState: AtmospherePublishedState = {
    active: false, skyView: atmosphereLuts?.skyView.texture ?? null, viewHeightKm: 0.05, sunDir,
    knee: new THREE.Vector3(SKY_KNEE, SKY_KNEE_RANGE, SKY_KNEE_FALLOFF), skyIntensity: 1, horizonLum: 0.45,
    horizonCap: HORIZON_LUM_CAP, fogTint: new THREE.Color(preset.fogTintHex), fogMix: preset.fogMix, irradiance: new THREE.Color(0.3, 0.4, 0.6),
    summary: atmosphereLuts?.summary ?? null,
  };
  scene.userData.atmosphere = atmosphereState;
  // Round 68 (2026-09-24): the volumetric cloud layer (volumetricClouds.ts) — created with the atmosphere, fed
  // its noise bakes from a worker below, keyed per preset in updateCloudDecks, marched by post.ts's hook
  // (scene.userData.volumetricClouds). Until its noise arrives, or on the mobile tier, the baked decks show.
  const volumetricClouds = atmosphereLuts && volumetricCloudsEnabledFor(renderer)
    ? new VolumetricCloudLayer(renderer, scene, atmosphereState, new THREE.Vector3(SKY_KNEE, SKY_KNEE_RANGE, SKY_KNEE_FALLOFF)) : null;
  scene.userData.volumetricClouds = volumetricClouds;
  /** Round 37's elevation falloff for the current sky (the atmosphere summary's, or the legacy probe's). */
  let atmosphereFalloff = 1;
  let atmosphereKeySuffixLive = '';
  /**
   * Rebuild whatever LUT the preset invalidated, read the summary, and point the dome, the fog and the post
   * pass at the result. A failed readback (a lost context, a driver without float readback) demotes this
   * preset to the Preetham dome so the frame is never black; returns whether the atmosphere is showing.
   */
  const refreshAtmosphere = (): boolean => {
    if (!atmosphereLuts) return false;
    const params = skyPresetToAtmosphere(preset);
    atmosphereLuts.update(params, preset.skyIntensity);
    const active = atmosphereLuts.summaryValid;
    atmosphereState.active = active;
    atmosphereDome.visible = active;
    sky.visible = !active;
    if (!active) {
      atmosphereKeySuffixLive = '';
      delete scene.userData.skyIrradiance;
      return false;
    }
    const summary = atmosphereLuts.summary;
    const u = atmosphereMaterial.uniforms;
    (u.uAtmoSun.value as THREE.Vector3).copy(sunDir);
    u.uAtmoViewH.value = ATMO_GROUND_KM + params.viewHeightKm;
    u.uAtmoIntensity.value = preset.skyIntensity;
    (u.uSunDirection.value as THREE.Vector3).copy(sunDir);
    (u.uSunTransmittance.value as THREE.Color).copy(summary.sunTransmittance);
    u.uSunDiscRadiance.value = legacySunDiscRadiance(sunDir.y);
    atmosphereState.viewHeightKm = params.viewHeightKm;
    atmosphereState.skyIntensity = preset.skyIntensity;
    atmosphereState.horizonLum = 0.2126 * summary.horizon.r + 0.7152 * summary.horizon.g + 0.0722 * summary.horizon.b;
    atmosphereState.fogTint.setHex(preset.fogTintHex);
    atmosphereState.fogMix = preset.fogMix;
    atmosphereState.irradiance.copy(summary.irradiance);
    scene.userData.skyIrradiance = atmosphereState.irradiance; // lighting.ts: the hemisphere light's hue
    atmosphereFalloff = summary.elevationFalloff;
    atmosphereKeySuffixLive = atmosphereKey(params, preset.skyIntensity);
    return true;
  };

  // Cloud decks: two horizon-flattened dome shells (low cumulus + high cirrus
  // veil) whose shader projects an INFINITE virtual deck plane (see the
  // CLOUD_DOME_* block). Transparent (render after opaques, over the Sky
  // box), never write depth, own their aerial fade (no scene fog). renderOrder
  // < 0: distance sorting would misplace the huge shells in FRONT of
  // smoke/flash sprites — force them before all default-order transparents.
  const CLOUD_VERT = /* glsl */ `
    varying vec3 vWPos;
    void main() {
      vec4 wp = modelMatrix * vec4( position, 1.0 );
      vWPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const CLOUD_FRAG = /* glsl */ `
    uniform sampler2D uMap;
    uniform vec2 uRot;    // (cos, sin): rotates world XZ so -v faces the sun azimuth
    uniform float uScale; // meters per texture repeat
    uniform vec2 uOff;    // per-deck decorrelation offset
    uniform vec3 uTint;
    uniform float uOpacity;
    uniform vec3 uHaze;   // horizon haze color (linear) the deck dissolves into
    uniform float uAlt;   // virtual deck plane altitude (m)
    uniform float uHazeK; // slant-distance haze rate (1/m)
    uniform vec2 uYFade;  // direction.y band where alpha melts at the horizon
    uniform float uShadeW; // deck-level directional mass shading strength
    uniform float uEdgeDetail; // round 22: fringe erosion strength (0 = the bake's ramp only)
    varying vec3 vWPos;
    void main() {
      vec3 d = normalize( vWPos - cameraPosition );
      float dy = max( d.y, 1e-4 );
      float t = max( uAlt - cameraPosition.y, 1.0 ) / dy; // slant range to the deck (m)
      vec2 p = cameraPosition.xz + d.xz * t;
      vec2 uv = vec2( p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x ) / uScale + uOff;
      vec4 c = texture2D( uMap, uv );
      // r2 directional mass shading: the rotated uv frame puts the sun at -v,
      // so sampling up-sun and darkening texels that sit behind denser cloud
      // gives every mass a lit sun side and a shaded lee side at ~150 m scale
      // (the baked light march only models per-texel rim depth).
      float dSun = texture2D( uMap, uv + vec2( 0.0, -0.045 ) ).a;
      c.rgb *= 1.0 - uShadeW * clamp( dSun - c.a * 0.55, 0.0, 1.0 );
      // macro variety mask at an irrational relative scale: with the deck now
      // visible out to many texture repeats, straight tiling shows periodic
      // cloud shapes near the horizon — a slow decorrelated mask thins whole
      // masses per-region so no repeat is readable.
      vec2 uv2 = vec2( uv.x * 0.31 - uv.y * 0.17, uv.x * 0.17 + uv.y * 0.31 ) + vec2( 0.37, 0.71 );
      float macro = texture2D( uMap, uv2 ).a;
      c.a *= 0.62 + 0.38 * smoothstep( 0.05, 0.72, macro );
      // round 22 edge detail: the deck's own alpha field at a higher frequency erodes THIN fringes only,
      // so mass edges keep cauliflower structure at every zoom instead of the bake's blurred ramp while
      // the opaque cores and their baked sun-side / belly shading stay untouched
      float det = texture2D( uMap, uv * 5.7 + vec2( 0.29, 0.61 ) ).a;
      float edgeW = ( 1.0 - smoothstep( 0.12, 0.70, c.a ) ) * uEdgeDetail;
      c.a *= mix( 1.0, smoothstep( 0.10, 0.60, det ), edgeW );
      // aerial perspective: slant distance pulls cloud bodies toward the
      // horizon haze color; deep in the haze they thin but never fully vanish
      // (hazy silhouettes keep texturing the low sky, WoT-style).
      float x = t * uHazeK;
      float haze = 1.0 - exp( -x * x );
      vec3 col = mix( c.rgb * uTint, uHaze, haze );
      float a = c.a * uOpacity;
      a *= smoothstep( uYFade.x, uYFade.y, d.y ); // melt at the horizon line
      a *= 1.0 - 0.72 * smoothstep( 0.5, 0.96, haze );
      gl_FragColor = vec4( col, a );
    }`;
  /** (cos,sin) rotation mapping the toward-sun XZ direction onto texture -v. */
  const cloudSunRot = (dir: THREE.Vector3): VectorPair => {
    const l = Math.hypot(dir.x, dir.z) || 1;
    return [-dir.z / l, -dir.x / l];
  };
  const mkCloudDeck = (
    tex: THREE.Texture,
    alt: number,
    uvMeters: number,
    opacity: number,
    radius: number,
    hazeK: number,
    off: VectorPair,
    name: string,
    shadeW = 0.3,
    edgeDetail = 0.6,
  ): CloudDeck => {
    const rot = cloudSunRot(sunDir);
    const mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uMap: { value: tex },
        uRot: { value: new THREE.Vector2(rot[0], rot[1]) },
        uScale: { value: uvMeters },
        uOff: { value: new THREE.Vector2(...off) },
        uTint: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: opacity },
        uHaze: { value: new THREE.Color(0xdde6ee) }, // re-set from horizon sample below
        uAlt: { value: alt },
        uHazeK: { value: hazeK },
        uYFade: { value: new THREE.Vector2(...CLOUD_Y_FADE) },
        uShadeW: { value: shadeW },
        uEdgeDetail: { value: edgeDetail },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide, // camera sits inside the shell
    });
    // Dome extends well below y=0 (phi 0.65 PI) so horizon-grazing rays from
    // any battle camera still hit shell geometry; terrain occludes the rest.
    const geo = new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = true; // GTAO's override prepass ignores alpha
    scene.add(mesh);
    return mesh;
  };
  // Verdant's sealed garage bay cannot see the outdoor cloud decks, but the
  // nine open Garage destinations can. Start their exact deterministic FBM
  // bakes in a worker while the main thread finishes boot, then install the
  // transferred RGBA buffers before an outdoor presentation becomes visible.
  // Browsers without Worker keep the synchronous compatibility path below.
  const lazyCloudTex = (): THREE.CanvasTexture => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = CLOUD_ANISOTROPY;
    return tex;
  };
  let cloudWorkerResults: CloudWorkerResults | null = null;
  let cloudWorkerSettled = false;
  const cloudWorkerPromise: Promise<CloudWorkerResults | null> | null = typeof Worker === 'undefined'
    ? null
    : (() => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./skyCloudWorker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        cloudWorkerSettled = true;
        console.warn('[sky] cloud worker unavailable; using synchronous fallback:', errorMessage(error));
        return Promise.resolve(null);
      }
      const result: CloudWorkerResults = {};
      const partialResult = (): CloudWorkerResults | null => (
        Object.keys(result).length ? result : null
      );
      const finalize = (value: CloudWorkerResults | null): CloudWorkerResults | null => {
        worker.terminate();
        cloudWorkerResults = cirrusBaked && cumulusBaked ? null : value;
        cloudWorkerSettled = true;
        return value;
      };
      // Worker errors normally report through onerror, but process pressure,
      // background throttling, and WebKit worker-start failures can leave a
      // module worker alive without ever dispatching a message or error. The
      // cloud bake is an optional acceleration; it must never hold a first
      // battle behind the loading veil indefinitely.
      const deadline = createDeferredDeadline<CloudWorkerResults | null>(
        3000,
        () => {
          console.warn('[sky] cloud worker timed out; using synchronous fallback');
          return finalize(partialResult());
        },
      );
      const finish = (value: CloudWorkerResults | null): void => {
        if (deadline.settle(value)) finalize(value);
      };
      worker.onmessage = ({ data }: MessageEvent<CloudWorkerMessage>) => {
        result[data.kind] = { size: data.size, pixels: data.pixels };
        if (result.cirrus && result.cumulus) finish(result);
      };
      worker.onerror = (error) => {
        console.warn('[sky] cloud worker failed; using synchronous fallback:', error.message);
        finish(partialResult());
      };
      worker.onmessageerror = () => {
        console.warn('[sky] cloud worker message failed; using synchronous fallback');
        finish(partialResult());
      };
      try {
        worker.postMessage({
          cumulusSize: texSize(CLOUD_TEX),
          cirrusSize: texSize(CIRRUS_TEX),
          config: CLOUD_BAKE_CONFIG,
        });
      } catch (error) {
        console.warn('[sky] cloud worker could not start; using synchronous fallback:', errorMessage(error));
        finish(partialResult());
      }
      return deadline.promise;
    })();

  // Round 68: the volumetric layer's noise bakes (cloudNoise.ts) in a second worker, the same contract as the
  // deck bakes: transferred buffers, a bounded wait, the synchronous bake as the fallback. Each buffer is
  // uploaded as it arrives; the layer shows once all three are in (updateCloudDecks re-evaluates then).
  let cloudNoiseSettled = !volumetricClouds;
  const cloudNoiseUpload: CloudNoiseUpload = {};
  const installCloudNoise = (): void => {
    if (!volumetricClouds) return;
    volumetricClouds.setNoise(cloudNoiseUpload);
    if (volumetricClouds.noiseReady) updateCloudDecks();
  };
  const cloudNoisePromise: Promise<void> | null = !volumetricClouds ? null : typeof Worker === 'undefined'
    ? null
    : (() => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./cloudNoiseWorker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        console.warn('[sky] cloud noise worker unavailable; baking on the main thread:', errorMessage(error));
        return null;
      }
      const deadline = createDeferredDeadline<void>(12000, () => {
        console.warn('[sky] cloud noise worker timed out; baking the rest on the main thread');
        worker.terminate();
        cloudNoiseSettled = true;
      });
      worker.onmessage = ({ data }: MessageEvent<{ kind: CloudNoiseKind; pixels: Uint8Array }>) => {
        cloudNoiseUpload[data.kind] = data.pixels;
        installCloudNoise();
        if (CLOUD_NOISE_KINDS.every((kind) => cloudNoiseUpload[kind])) {
          if (deadline.settle(undefined)) { worker.terminate(); cloudNoiseSettled = true; }
        }
      };
      worker.onerror = (error) => {
        console.warn('[sky] cloud noise worker failed; baking on the main thread:', error.message);
        if (deadline.settle(undefined)) { worker.terminate(); cloudNoiseSettled = true; }
      };
      try {
        worker.postMessage({});
      } catch (error) {
        console.warn('[sky] cloud noise worker could not start; baking on the main thread:', errorMessage(error));
        if (deadline.settle(undefined)) { worker.terminate(); cloudNoiseSettled = true; }
      }
      return deadline.promise;
    })();
  /** Synchronous fallback: bake whatever the worker did not deliver (idempotent). */
  const ensureCloudNoise = (): void => {
    if (!volumetricClouds || volumetricClouds.noiseReady) return;
    const missing = CLOUD_NOISE_KINDS.some((kind) => !cloudNoiseUpload[kind]);
    if (missing) {
      const bake = bakeCloudNoise();
      for (const kind of CLOUD_NOISE_KINDS) cloudNoiseUpload[kind] ??= bake[kind];
    }
    cloudNoiseSettled = true;
    installCloudNoise();
  };

  // Per-deck flags keep a mid-flight synchronous activation idempotent.
  let cirrusBaked = false;
  let cumulusBaked = false;
  const swapCloudTexture = (deck: CloudDeck, baked: THREE.CanvasTexture): void => {
    const tex = deck.material.uniforms.uMap!.value as THREE.Texture;
    // dispose BEFORE the image swap (same fix as particles.ts sprite
    // sheets): the placeholder has usually been uploaded by now, and
    // swapping `image` to a different-sized canvas with only needsUpdate
    // re-uses the old GL allocation — the upload no-ops (blank clouds) or
    // throws texSubImage offset-overflow, which the mobile tier's scaled
    // bake sizes made live (caught on the deployed build under WebKit).
    tex.dispose();
    tex.image = baked.image;
    tex.needsUpdate = true;
    baked.dispose(); // wrapper never uploaded — frees only CPU-side state
  };
  const ensureCloudTextures = (): void => {
    if (!cirrusBaked) {
      cirrusBaked = true;
      swapCloudTexture(cloudsFar, makeCirrusTexture(cloudWorkerResults?.cirrus ?? null));
    }
    if (!cumulusBaked) {
      cumulusBaked = true;
      swapCloudTexture(clouds, makeCloudTexture(cloudWorkerResults?.cumulus ?? null));
    }
    if (cirrusBaked && cumulusBaked) cloudWorkerResults = null;
  };
  /** Await off-main FBM, then install at most one canvas texture per tick. */
  const ensureCloudTexturesChunked = async (tick?: () => Promise<void>): Promise<void> => {
    if (cloudWorkerPromise && !cloudWorkerSettled) await cloudWorkerPromise;
    // round 68: the volumetric layer's noise, then its programs, all under the caller's cover
    if (volumetricClouds) {
      if (cloudNoisePromise && !cloudNoiseSettled) await cloudNoisePromise;
      if (!volumetricClouds.noiseReady) ensureCloudNoise();
      if (tick) await tick();
      volumetricClouds.warm();
    }
    if (!cirrusBaked) {
      cirrusBaked = true;
      swapCloudTexture(cloudsFar, makeCirrusTexture(cloudWorkerResults?.cirrus ?? null));
      if (tick) await tick();
    }
    if (!cumulusBaked) {
      cumulusBaked = true;
      swapCloudTexture(clouds, makeCloudTexture(cloudWorkerResults?.cumulus ?? null));
      if (tick) await tick();
    }
    if (cirrusBaked && cumulusBaked) cloudWorkerResults = null;
  };
  const cloudsFar = mkCloudDeck(
    lazyCloudTex(), CIRRUS_ALT, CIRRUS_UV_METERS, CLOUD_LAYER2_OPACITY,
    CIRRUS_DOME_RADIUS, CIRRUS_HAZE_K, [0.31, 0.77], 'cloudLayerFar',
    // cirrus rides perpendicular to the sun rotation — its -v axis is NOT
    // sunward, so the mass-shading term stays subtle there
    0.10,
    // the thin veil tears softly; the cumulus deck (default 0.6) erodes harder
    0.35,
  );
  cloudsFar.renderOrder = -3;
  // NOTE: the cirrus deck rides PERPENDICULAR to the sun-aligned cumulus
  // rotation (applied in updateCloudDecks): with both decks sun-aligned, the
  // sheared cirrus filaments ran along the battle cameras' view axis and
  // foreshortened into VERTICAL WHITE STREAKS through the zenith (the
  // "stretched billboard artifact" read). Cross-wind cirrus is also the
  // meteorologically common case.
  const clouds = mkCloudDeck(
    lazyCloudTex(), CLOUD_ALT, CLOUD_UV_METERS, 1.0,
    CLOUD_DOME_RADIUS, CLOUD_HAZE_K, [0, 0], 'cloudLayer', 0.30,
  );
  clouds.renderOrder = -2;

  // the fog colour: the atmosphere summary's anti-solar horizon band under the same luminance ceiling as the
  // legacy probe (HORIZON_LUM_CAP), or the legacy probe itself
  const horizonColor = new THREE.Color(FALLBACK_HORIZON_HEX);
  if (refreshAtmosphere()) horizonColor.copy(capColorLuminance(atmosphereLuts!.summary.horizon.clone(), HORIZON_LUM_CAP));
  else horizonColor.copy(sampleHorizonColor(renderer, sunDir, preset));

  /** Sync deck uniforms to the current preset + horizon sample. */
  const updateCloudDecks = (): void => {
    const cloudTint = new THREE.Color(preset.cloudTintHex);
    const rot = cloudSunRot(sunDir);
    const haze = horizonColor.clone().lerp(new THREE.Color(preset.fogTintHex), preset.fogMix);
    for (const deck of [clouds, cloudsFar]) {
      const u = deck.material.uniforms;
      u.uTint.value.copy(cloudTint);
      // cirrus rides perpendicular to the sun-aligned cumulus (see the
      // quarter-turn note at deck construction)
      if (deck === cloudsFar) u.uRot.value.set(-rot[1], rot[0]);
      else u.uRot.value.set(rot[0], rot[1]);
      u.uHaze.value.copy(haze);
    }
    // r3 overcast: per-map stratus altitude / slant-haze / mass scale on the
    // low (cumulus) deck — see the cloudAltM note in DEFAULT_PRESET. AUTO
    // (null) drops OVERCAST presets to a broken-stratus deck: winter's
    // establishing cameras only see the 2-12 deg elevation band, where the
    // 620 m fair-weather deck is 6-7 km of slant range out and fully hazed —
    // the r3 "completely featureless warm-grey sky" read.
    {
      const overcast = preset.cloudOpacity >= 0.95 && preset.cloudOpacity2 >= 0.9
        && preset.turbidity >= 7;
      const u = clouds.material.uniforms;
      u.uAlt.value = preset.cloudAltM ?? (overcast ? 340 : CLOUD_ALT);
      u.uHazeK.value = preset.cloudHazeK ?? (overcast ? 0.00015 : CLOUD_HAZE_K);
      u.uScale.value = preset.cloudUvM ?? (overcast ? 2400 : CLOUD_UV_METERS);
      // r5: publish the cloud-shadow depth for post.ts's aerial pass (see
      // DEFAULT_PRESET.cloudShadowAmp) — overcast maps get patchiness, not
      // crisp cloud shadows.
      scene.userData.cloudShadeAmp = preset.cloudShadowAmp ?? (overcast ? 0.10 : 0.22);
    }
    clouds.material.uniforms.uOpacity.value = preset.cloudOpacity;
    clouds.visible = preset.cloudOpacity > 0.01;
    // round 68: the volumetric layer takes the low deck's place (the cirrus veil stays); it owns the ground's
    // cloud shadows where it casts them, so the aerial pass's screen-space patchiness turns off there
    if (volumetricClouds) {
      const layerPreset = atmosphereState.active && preset.cloudOpacity > 0.01 ? deriveCloudLayerPreset(preset) : null;
      volumetricClouds.setPreset(layerPreset);
      if (volumetricClouds.active) {
        clouds.visible = false;
        if (volumetricClouds.currentPreset?.shadow) scene.userData.cloudShadeAmp = 0;
      } else {
        volumetricClouds.dome.visible = false;
      }
    }
    cloudsFar.material.uniforms.uOpacity.value = preset.cloudOpacity2;
    // round 71: the volumetric layer draws its own cirrus sheet, so the baked veil hides while the layer shows
    // (its sheared filaments crossed the layer's streaks as a lattice)
    cloudsFar.visible = preset.cloudOpacity2 > 0.01 && !(volumetricClouds?.active ?? false);
    // Per-map deck decorrelation (terrain_environment r1): with a fixed
    // uOff the SAME cumulus mass recurred at the SAME screen azimuth on
    // every map ("tall blurry vertical wisp top-center across maps").
    // Derive a stable pseudo-random UV offset from the preset's sun angles
    // (unique per map) so each map opens under a different stretch of deck.
    const h1 = Math.sin(preset.sunAzimuthDeg * 12.9898 + preset.sunElevationDeg * 78.233) * 43758.5453;
    const h2 = Math.sin(preset.sunAzimuthDeg * 39.4185 + preset.sunElevationDeg * 11.135) * 24634.6345;
    const ox = h1 - Math.floor(h1);
    const oz = h2 - Math.floor(h2);
    clouds.material.uniforms.uOff.value.set(ox, oz);
    cloudsFar.material.uniforms.uOff.value.set(0.31 + ox * 0.5, 0.77 + oz * 0.5);
  };
  updateCloudDecks();

  let pmrem: THREE.PMREMGenerator | null = null;
  let pmremContext: ReturnType<THREE.WebGLRenderer['getContext']> | null = null;
  let pmremInfo: THREE.WebGLRenderer['info'] | null = null;
  // Round 65: when the physically based dome is showing, the environment bakes from it (installed below,
  // outside this owner block) and its key carries the atmosphere parameters; null keeps the Preetham bake.
  let atmosphereBake: (() => THREE.WebGLRenderTarget) | null = null;
  let atmosphereKeySuffix = '';
  const environments = new SkyEnvironmentCache(renderer, scene);
  const environmentGenerator = (): THREE.PMREMGenerator => {
    const context = renderer.getContext();
    if (pmrem && (pmremContext !== context || pmremInfo !== renderer.info || context.isContextLost())) {
      pmrem.dispose();
      pmrem = null;
    }
    if (!pmrem) {
      pmrem = new THREE.PMREMGenerator(renderer);
      pmremContext = context;
      pmremInfo = renderer.info;
    }
    return pmrem;
  };
  const bakeProceduralEnvironment = (): THREE.WebGLRenderTarget => {
    if (atmosphereBake) return atmosphereBake();
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    let result: THREE.WebGLRenderTarget | null = null;
    try {
      envSky.scale.setScalar(ENV_SKY_SCALE);
      configureSkyUniforms(envSky, sunDir, preset);
      envScene.add(envSky);
      result = environmentGenerator().fromScene(envScene);
      disposeEnvironmentSky(envSky);
      return result;
    } catch (error) {
      // fromScene cannot expose an output allocated before it throws. Release
      // the accessible generator scratch; never reuse an interrupted bake.
      try { pmrem?.dispose(); } catch { /* Preserve the bake failure. */ }
      pmrem = null;
      try { result?.dispose(); } catch { /* Preserve the bake failure. */ }
      // Both private resources are attempted even when construction/rendering
      // failed. A successful cleanup above need not dispatch dispose twice.
      if (!result) {
        try { disposeEnvironmentSky(envSky); } catch { /* Preserve the bake failure. */ }
      }
      throw error;
    }
  };

  // Sourced-HDRI environment override (experiment flag; null = procedural
  // bake, the shipping configuration). Set to an equirect .hdr URL to test.
  const HDRI_ENV_URL: string | null = null;
  let hdriPromise: Promise<THREE.DataTexture> | null = null;
  const loadHdriEnvironment = (url: string): void => {
    if (!hdriPromise) {
      hdriPromise = import('three/examples/jsm/loaders/RGBELoader.js')
        .then(({ RGBELoader }) => new RGBELoader().loadAsync(url));
    }
    hdriPromise.then((tex) => {
      withEnvironmentRenderState(renderer, () => environments.install(
        null, () => environmentGenerator().fromEquirectangular(tex),
        Math.max(preset.envIntensity, ENV_INTENSITY_FLOOR),
        () => enforceEnvValidity(renderer, scene),
      ));
    }).catch((error: RuntimeValue) => console.warn(
      '[sky] HDRI env failed, procedural bake kept —', errorMessage(error),
    ));
  };

  // Round 65: the environment of the physically based dome — a second box sharing the dome's material (the
  // LUT and every uniform by reference) inside PMREMGenerator's far plane; the Preetham bake stays the fallback.
  if (atmosphereLuts) {
    atmosphereBake = () => {
      if (!atmosphereState.active) return bakeLegacyEnvironmentFromPreetham();
      const envScene = new THREE.Scene();
      const envDome = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), atmosphereMaterial);
      envDome.scale.setScalar(ENV_SKY_SCALE);
      envScene.add(envDome);
      try {
        return environmentGenerator().fromScene(envScene);
      } catch (error) {
        try { pmrem?.dispose(); } catch { /* Preserve the bake failure. */ }
        pmrem = null;
        throw error;
      } finally {
        envDome.geometry.dispose();
      }
    };
    atmosphereKeySuffix = atmosphereKeySuffixLive; // the boot bake keys the atmosphere the first refresh built
  }
  /** The Preetham bake for a preset the atmosphere demoted (a failed readback). */
  const bakeLegacyEnvironmentFromPreetham = (): THREE.WebGLRenderTarget => {
    const saved = atmosphereBake;
    atmosphereBake = null;
    try { return bakeProceduralEnvironment(); } finally { atmosphereBake = saved; }
  };

  const rig: SkyRig = {
    sunDir,

    /**
     * LOADING PERF (boot r9): finish the deferred cloud-deck sprite bakes
     * (idempotent, ~330 ms once). applyPreset runs it on every map re-key;
     * main.ts runs it on first world activation and from post-ready idle.
     */
    ensureCloudTextures,
    ensureCloudTexturesChunked,
    attachShadowCascades(cascades: CloudShadowCascades): void {
      volumetricClouds?.attachShadowCascades(cascades);
    },
    volumetricClouds,

    /**
     * Bake the procedural sky into a PMREM environment map and install it as
     * `scene.environment` (the IBL specular-ambient layer — the biggest single
     * AAA-ness lever per graphics-aaa.md §2). Uses a SEPARATE Sky instance
     * scaled to fit PMREMGenerator's internal far plane. Safe to call again
     * (re-bake); two exact validated day/night targets remain reusable.
     * @returns {void}
     */
    bakeEnvironment(): void {
      // Deep-hunt IBL experiment (2026-07): sourced Poly Haven HDRI as
      // scene.environment instead of the procedural-sky bake. Judged worse —
      // the HDRI's baked-in sun cannot track the per-map sun azimuth /
      // elevation driving the CSM, so specular highlights detach from the
      // shadow direction on 3 of 4 maps. Flag kept for future re-testing
      // with per-map matched HDRIs.
      if (HDRI_ENV_URL) {
        loadHdriEnvironment(HDRI_ENV_URL);
        return;
      }
      // MOBILE r4: some iOS GPUs poison the PMREM bake (NaN texels) and the
      // IBL term blackens every lit material (proven on-device by the r3
      // watchdog: rescue 'environment-off'). Validate after EVERY bake — the
      // sky re-bakes per map and would reinstall the bad texture — and swap
      // to compensated ambient when invalid (deviceDiag.ts).
      withEnvironmentRenderState(renderer, () => environments.install(
        environmentKey(renderer, sunDir, preset, atmosphereKeySuffix), bakeProceduralEnvironment,
        Math.max(preset.envIntensity, ENV_INTENSITY_FLOOR),
        () => enforceEnvValidity(renderer, scene, preset.skyIntensity),
      ));
    },

    horizonColor,

    /**
     * Install exponential-squared fog: near field stays crisp, distant hills
     * shift toward a cool desaturated blue (aerial perspective) instead of
     * washing to white, and the terrain edge still dissolves toward the
     * sky-sampled horizon color (doc §5).
     * @param {THREE.Scene} targetScene - scene to receive the fog
     * @returns {void}
     */
    applyFog(targetScene: THREE.Scene): void {
      const fogColor = horizonColor.clone()
        .lerp(new THREE.Color(preset.fogTintHex), preset.fogMix);
      // r4 LP2 hue guard: atmospheric extinction color must NEVER be
      // green-dominant (the r3 sniper "jade fog" carryover) — whatever the
      // sampled sky band or preset tint produced, clamp toward blue-grey so
      // B >= G always holds on the fog pole. (Verdant currently samples
      // blue already; this is insurance against any preset/band drift.)
      if (fogColor.g > fogColor.b) {
        const lum = 0.2126 * fogColor.r + 0.7152 * fogColor.g + 0.0722 * fogColor.b;
        fogColor.lerp(new THREE.Color(lum * 0.92, lum * 0.99, lum * 1.12), 0.6);
      }
      // preset.fogDensity is total atmosphere; the exp2 fog takes only its
      // extinction share — post.ts's aerial pass carries the scatter-in hue
      // (see FOG_EXTINCTION_SHARE).
      targetScene.fog = new THREE.FogExp2(fogColor, preset.fogDensity * FOG_EXTINCTION_SHARE);
      // round 37: the post aerial pass scales its scatter-in target by the sky's elevation falloff (see
      // sampleHorizonElevationFalloff); a cached atmosphere costs no render here. Round 65: the physically
      // based sky reports its own falloff from the summary (the post pass samples the LUT per pixel anyway).
      targetScene.userData.skyElevationFalloff = atmosphereState.active
        ? atmosphereFalloff : sampleHorizonElevationFalloff(renderer, sunDir, preset);
      // round 69 (2026-09-24): the sun-shaft pass gates itself per map on the preset's haze (sunShafts.ts)
      targetScene.userData.skyHazeInputs = {
        fogDensity: preset.fogDensity, turbidity: preset.turbidity, mieCoefficient: preset.mieCoefficient,
        sunElevationDeg: preset.sunElevationDeg, skyIntensity: preset.skyIntensity,
      };
    },

    /** Re-target visible atmosphere state without synchronously rebuilding PMREM. */
    applyPresentationPreset(
      p: Partial<SkyPreset> | null | undefined,
      targetScene: THREE.Scene,
    ): void {
      ensureCloudTextures(); // deferred boot bake — decks must be real now
      preset = { ...DEFAULT_PRESET, ...(p || {}) };
      sunDir.setFromSphericalCoords(
        1,
        THREE.MathUtils.degToRad(90 - preset.sunElevationDeg),
        THREE.MathUtils.degToRad(preset.sunAzimuthDeg),
      );
      configureSkyUniforms(sky, sunDir, preset);
      if (refreshAtmosphere()) horizonColor.copy(capColorLuminance(atmosphereLuts!.summary.horizon.clone(), HORIZON_LUM_CAP));
      else horizonColor.copy(sampleHorizonColor(renderer, sunDir, preset));
      atmosphereKeySuffix = atmosphereKeySuffixLive;
      updateCloudDecks(); // tint/opacity/sun-rotation/haze follow the preset
      scene.userData.postExposure = preset.postExposure; // post.ts grade trim
      // Garage variants keep the one boot PMREM resident. Rebuilding a cube
      // environment for every selector hover/rapid click caused visible frame
      // stalls even though the authored key lights already own tank shading.
      // Matching its strength still preserves the source map's ambient level.
      scene.environmentIntensity = Math.max(preset.envIntensity, ENV_INTENSITY_FLOOR);
      rig.applyFog(targetScene);
    },

    /**
     * Re-target the whole atmosphere to a map's sky preset (map switch):
     * sun direction + dome uniforms + cloud opacity/tint + horizon resample +
     * environment rebake + fog rebuild. `sunDir` is mutated IN PLACE so
     * lighting rigs holding the reference stay correct.
     * @param {?object} p partial preset (fields of DEFAULT_PRESET)
     * @param {THREE.Scene} targetScene scene whose fog is replaced
     * @returns {void}
     */
    applyPreset(p: Partial<SkyPreset> | null | undefined, targetScene: THREE.Scene): void {
      rig.applyPresentationPreset(p, targetScene);
      rig.bakeEnvironment();
    },
  };
  return rig;
}
