/**
 * sky.js — procedural atmosphere: visible sky dome, PMREM environment bake
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
import { Sky } from 'three/examples/jsm/objects/Sky.js';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged);
// read inside the bake functions (post-renderer), never at module eval.
import { texSize } from './quality.js';
import { enforceEnvValidity } from './deviceDiag.js';

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
// 1.45, safely under post.js's 1.55 bloom threshold — atmospheric scattering
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
// 0.48 (fog + scatter-in + cloud haze pole inherit that sample) and post.js
// AERIAL_HAZE_LUM_CAP 0.50 → 0.44.
const HAZE_MAX_LUM = 0.50; // linear pre-ACES luminance ceiling in the band
const HAZE_COMPRESS = 0.18; // slope retained above the ceiling
const HAZE_BAND_TOP = 0.24; // direction.y where the haze treatment fades out
const HAZE_TINT_COOL = [0.74, 0.88, 1.13]; // blue hue floor away from the sun
// r6 ("no sun disc or scattering glow anywhere"): the warm lobe was a barely
// warm near-white — golden it up and widen it (pow 3.0 → 2.4) so the sunward
// frame edge carries an unmistakable low-sun scattering glow in every shot
// that looks within ~70 deg of the sun azimuth.
const HAZE_TINT_WARM = [1.24, 1.02, 0.70]; // warm scatter toward the sun azimuth
// 2.4 washed a quarter of the sky milky on the bright maps; 2.9 keeps the
// golden glow readable ~50 deg around the sun azimuth without the white wash.
const HAZE_WARM_POW = 2.9; // azimuthal width of the warm lobe
const HAZE_TINT_MIX = 0.63;
// lighting_post r7 ("deep-blue-to-haze transition at top-left shows visible
// gradient banding" on desert): 0.004 → 0.008 — the steep clear-sky rayleigh
// ramp needs ~2 linear LSBs of decorrelation to stay under the banding
// threshold after the grade's contrast re-spread; pairs with the new
// display-space IGN dither at the end of post.js's grade pass.
const SKY_DITHER = 0.008; // linear-space dither amplitude ~2 display LSB
const SKY_FRAG_ANCHOR = 'gl_FragColor = vec4( texColor, 1.0 );';
const SKY_DOME_SCALE = 10000; // must stay inside camera.far
const ENV_SKY_SCALE = 50; // PMREMGenerator.fromScene far plane = 100
// IBL is fill, not key: at 1.1 it buried the sun's shadows in a flat milky
// wash, and even 0.45 diluted open-ground shadows to a ~1.3:1 luma ratio.
// r3: 0.28 → 0.20 — omnidirectional IBL fill is the flattest of the three
// ambient layers (it lights shadowed and lit faces identically), so the fill
// budget moved to the directional HemisphereLight (lighting.js hemi 0.32),
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
// offset form-wise by the hemisphere bounce floor in lighting.js carrying
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
// the depth-driven aerial-perspective pass in post.js (uniform desaturation),
// so the fog itself can stay thinner and keep midground color alive.
const FOG_DENSITY = 0.00074;
// r5 ("neutral gray fog ramp monochromes everything past 400m — cut density
// roughly in half"): the engine now interprets a preset's fogDensity as the
// map's TOTAL atmosphere thickness and splits it between the material-level
// FogExp2 (this share) and post.js's directional aerial scatter-in, which
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
const CLOUD_LIT = [1.0, 0.98, 0.94]; // warm-white sunlit faces
const CLOUD_SHADE = [0.40, 0.48, 0.67]; // cool grey-blue shaded bellies
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
const CLOUD_ALT = 620; // cumulus deck altitude (m) — projection plane height
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
// slant range t to the virtual deck. Cumulus: ~8% hazed overhead (30 deg),
// ~26% at 15 deg, ~65% at 8 deg, ~93% at 5 deg — bases melt into the horizon
// atmosphere instead of clipping. Cirrus sits higher so its rate is slower.
const CLOUD_HAZE_K = 0.00023;
const CIRRUS_HAZE_K = 0.00010;
// direction.y band where deck alpha melts out at the horizon line itself.
// r5: [0.012, 0.055] → [0.007, 0.034] — the deck used to vanish ~3 deg above
// the skyline, leaving the bleached band with zero texture; hazed cloud
// bases now grade all the way into the horizon wash (they inherit the haze
// color, so no hard silhouettes against the terrain edge).
const CLOUD_Y_FADE = [0.007, 0.034];
const CLOUD_MAX_ALPHA = 0.94;
// r2: 0.6 → 0.5 — the cirrus veil is the main "directional streaking"
// contributor in the establishing shots; thinner default keeps it a subtle
// high veil (map presets still override).
// r3: 0.5 → 0.42 — the sheared veil is the residual "directional smear
// banding" contributor on verdant; map presets still override.
const CLOUD_LAYER2_OPACITY = 0.42; // default for preset field cloudOpacity2 (cirrus)

/**
 * @typedef {object} SkyRig
 * @property {THREE.Vector3} sunDir - unit vector FROM origin TOWARD the sun (fixed)
 * @property {() => void} bakeEnvironment - PMREM bake; sets `scene.environment`
 * @property {THREE.Color} horizonColor - linear-space sky color at the horizon
 * @property {(scene: THREE.Scene) => void} applyFog - installs horizon-matched linear fog
 */

// Per-map sky preset defaults — map configs (src/world/maps/*) override any
// subset via createSky(...).applyPreset(preset, scene).
const DEFAULT_PRESET = Object.freeze({
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
  // null = AUTO: fair-weather maps keep the 620 m cumulus deck; presets that
  // read as OVERCAST (both decks near-opaque + turbid sky — winter is the
  // only current match) drop to a 340 m broken-stratus deck so grazing
  // establishing cameras see modeled cloud instead of a bare grey gradient.
  cloudAltM: null,
  cloudHazeK: null,
  cloudUvM: null,
  // r3 per-map display exposure trim, applied by post.js's grade (uExposure):
  // 1.0 = neutral. Desert should ship ~0.88 (the "sand midtones at RGB 245"
  // blowout is an exposure problem the global grade must not pay for).
  postExposure: 1,
  // r5 cloud-shadow / light-patchiness depth, applied by post.js's aerial
  // pass (uCloudShade): null = AUTO — fair-weather maps get 0.22 (soft
  // world-anchored cloud shadows breaking up the uniform field luminance),
  // OVERCAST presets (winter) drop to 0.10: a diffuse-lit deck casts no
  // crisp cloud shadows, but gentle fog patchiness still modulates the wash.
  cloudShadowAmp: null,
});

/** Apply the shared atmosphere parameters to a Sky instance. @param {Sky} sky @param {THREE.Vector3} sunDir @param {object} [preset] */
function configureSkyUniforms(sky, sunDir, preset = DEFAULT_PRESET) {
  const u = sky.material.uniforms;
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
  sky.material.onBeforeCompile = (shader) => {
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
	gl_FragColor = vec4( max( skyCol, vec3( 0.0 ) ), 1.0 );`,
    );
    if (patched === shader.fragmentShader) {
      throw new Error('sky.js: radiance-scale injection anchor not found in Sky shader');
    }
    shader.fragmentShader = patched;
  };
  sky.material.needsUpdate = true;
}

/** Deterministic PRNG (Mulberry32). @param {number} a seed @returns {() => number} */
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a multi-octave value-noise FBM sampler tileable in BOTH axes
 * (period 1 in u and v) — required so the planar cloud decks repeat
 * seamlessly across the world with no visible tile boundary.
 *
 * @param {() => number} rng - seeded PRNG that fills the per-octave lattices
 * @param {number} octaves
 * @param {number} base - lattice resolution of octave 0 (doubles per octave)
 * @returns {(u: number, v: number) => number} fbm in ~[0,1], tileable in u AND v
 */
function makeFbm(rng, octaves, base) {
  const lattices = [];
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    lattices.push({ n, grid });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  return function fbm(u, v) {
    let sum = 0;
    let amp = 0.55;
    let tot = 0;
    for (let o = 0; o < octaves; o++) {
      const { n, grid } = lattices[o];
      let uu = (u + o * 0.37) % 1;
      if (uu < 0) uu += 1;
      let vv = (v + o * 0.61) % 1;
      if (vv < 0) vv += 1;
      const x = uu * n;
      const y = vv * n;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = smooth(x - x0);
      const fy = smooth(y - y0);
      const xa = x0 % n;
      const xb = (x0 + 1) % n;
      const ya = y0 % n;
      const yb = (y0 + 1) % n;
      const g00 = grid[ya * n + xa];
      const g10 = grid[ya * n + xb];
      const g01 = grid[yb * n + xa];
      const g11 = grid[yb * n + xb];
      sum += (g00 + (g10 - g00) * fx + (g01 - g00) * fy + (g00 - g10 - g01 + g11) * fx * fy) * amp;
      tot += amp;
      amp *= 0.5;
    }
    return sum / tot;
  };
}

/**
 * Bake the cumulus deck texture (see the CLOUD_* constant block for the
 * recipe): domain-warped FBM carved by a hard coverage threshold into
 * distinct cloud masses, then shaded per-texel by a light march toward -v —
 * warm-white sun-facing rims, cool grey-blue shaded cores. Tileable in both
 * axes (the march wraps too); the deck shader rotates its sampling so the
 * baked -v march direction always points at the map's sun azimuth.
 *
 * @returns {THREE.CanvasTexture}
 */
function makeCloudTexture() {
  const W = texSize(CLOUD_TEX); // MOBILE r1: tier-scaled bake (u/v-relative painter)
  const H = texSize(CLOUD_TEX);
  const rng = mulberry32(CLOUD_SEED);
  // NOTE: keep fbmD at 6 octaves — a 7th octave shifts the seeded rng stream
  // and re-rolls the whole deck LAYOUT (the composed masses in the frozen
  // shots vanished). Interior high-frequency detail comes from fbmHF below.
  const fbmD = makeFbm(rng, 6, 8); // density field — primary cloud forms
  const fbmWX = makeFbm(rng, 3, 5); // domain warp u
  const fbmWY = makeFbm(rng, 3, 5); // domain warp v
  const fbmM = makeFbm(rng, 2, 3); // macro clustering (masses + clear gaps)
  const fbmHF = makeFbm(rng, 3, 48); // high-frequency interior alpha detail (r7)

  // Pass 1 — carve the coverage field. mask = alpha shape (hard edge),
  // core = interior opacity ramp, sigma = optical density for the light march.
  const mask = new Float32Array(W * H);
  const core = new Float32Array(W * H);
  const sigma = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let wu = (u + (fbmWX(u, v) - 0.5) * CLOUD_WARP) % 1;
      if (wu < 0) wu += 1;
      let wv = (v + (fbmWY(u, v) - 0.5) * CLOUD_WARP) % 1;
      if (wv < 0) wv += 1;
      const d = fbmD(wu, wv);
      // anisotropic macro sampling: higher frequency ALONG the wind/march
      // axis (v) breaks along-wind arms into separate masses (r4 LP2)
      const mac = fbmM(u, (v * CLOUD_MACRO_ANISO) % 1);
      const thr = CLOUD_THR + (mac - 0.5) * 2 * CLOUD_CLUSTER;
      const i = y * W + x;
      // edge sharpness varies with the macro field: dense clusters carve
      // crisp cauliflower cores, sparse outliers tear into soft wisps
      const edgeW = CLOUD_EDGE + CLOUD_EDGE_WISP * (1 - smoothstepNum(0.35, 0.62, mac));
      // terrain_environment r2: gate the mask edge with the high-frequency
      // field so mass borders read as cauliflower turbulence rather than
      // smooth threshold contours (multiplier floor >= ~0.7 or thin rims
      // dither out and the deck loses its silver lining).
      const m = smoothstepNum(thr, thr + edgeW, d)
        * (0.72 + 0.28 * smoothstepNum(0.25, 0.75, fbmHF(u * 0.25, v * 0.25)));
      const c = smoothstepNum(thr + edgeW, thr + edgeW + CLOUD_CORE, d);
      mask[i] = m;
      core[i] = c;
      sigma[i] = m * (0.3 + 0.7 * c);
    }
  }

  // Pass 2 — shade + write pixels. Transmittance from the accumulated density
  // toward -v (the in-texture sun): thin rims facing the sun stay near 1
  // (bright, silver-lined), texels behind thick cloud fall toward 0.
  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const m = mask[i];
      if (m <= 0) {
        px[o + 3] = 0;
        continue;
      }
      let occl = 0;
      for (let s = 1; s <= CLOUD_MARCH_STEPS; s++) {
        let yy = (y - s * CLOUD_MARCH_STEP_PX) % H; // wraps: tileable shading
        if (yy < 0) yy += H;
        occl += sigma[yy * W + x];
      }
      const lit = Math.pow(Math.exp(-CLOUD_SHADE_K * occl), 0.85);
      // silver lining: thin (low-core) texels whose light march came back
      // unoccluded are the sun-facing rim — push them toward warm white so
      // every mass carries a bright sun-lit edge against its shaded belly
      const silver = 1 + CLOUD_SILVER * (1 - core[i]) * lit;
      px[o] = Math.min(255, Math.round(255 * (CLOUD_SHADE[0] + (CLOUD_LIT[0] - CLOUD_SHADE[0]) * lit) * silver));
      px[o + 1] = Math.min(255, Math.round(255 * (CLOUD_SHADE[1] + (CLOUD_LIT[1] - CLOUD_SHADE[1]) * lit) * silver));
      px[o + 2] = Math.min(255, Math.round(255 * (CLOUD_SHADE[2] + (CLOUD_LIT[2] - CLOUD_SHADE[2]) * lit) * silver * 0.97));
      // per-cloud opacity variation keyed on the macro clustering field: each
      // mass gets its own density so the deck never reads as uniform cotton;
      // a high-frequency octave breaks the smooth interior alpha gradients
      const macroA = 1 - CLOUD_ALPHA_VAR * (1 - fbmM(x / W, ((y / H) * CLOUD_MACRO_ANISO) % 1));
      const hfA = 1 - CLOUD_DETAIL_AMP * (1 - core[i]) * fbmHF(x / W, y / H);
      // r6: rim floor 0.42 → 0.30 — denser cores against thinner rims give
      // the masses a modeled 3D read instead of one flat translucency.
      px[o + 3] = Math.round(255 * CLOUD_MAX_ALPHA * macroA * hfA * m * (0.30 + 0.70 * core[i]));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = CLOUD_ANISOTROPY; // grazing-angle sharpness (see const block)
  return tex;
}

/**
 * Bake the thin high-altitude veil: wind-sheared streaks (fbm sampled with a
 * 4x faster v frequency elongates features along u), low alpha, near-white.
 * Tileable in both axes.
 *
 * @returns {THREE.CanvasTexture}
 */
function makeCirrusTexture() {
  const W = texSize(CIRRUS_TEX); // MOBILE r1: tier-scaled bake
  const H = texSize(CIRRUS_TEX);
  const rng = mulberry32(CLOUD_SEED + 11);
  const fbm = makeFbm(rng, 4, 4);
  const fbmW = makeFbm(rng, 2, 3);
  // r8 ("cirrus smears diagonally with uniform soft edges — no lit/shadowed
  // cloud faces anywhere"): the veil was a single sheared fbm at one flat
  // near-white tone. Three additions:
  //  - a slow BANK mask splits the endless filament field into separate
  //    cloud banks with real gaps (no more one continuous smear),
  //  - a second, higher-frequency domain-warp octave crinkles the filament
  //    edges so they stop being uniformly soft,
  //  - TWO-TONE shading from the filament field's own directional
  //    derivative: one edge of every filament is lit warm-white, the other
  //    falls to the same cool grey-blue the cumulus shade pole uses.
  const fbmB = makeFbm(rng, 2, 2); // bank mask (~whole-sky patches)
  const fbmE = makeFbm(rng, 3, 14); // edge-crinkle octave
  const cnv = document.createElement('canvas');
  cnv.width = W;
  cnv.height = H;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const LIT = [1.0, 0.99, 0.955];
  const SHD = [0.66, 0.72, 0.85];
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // r2: edge crinkle 0.035 → 0.06 — the sheared filaments read as one
      // smooth diagonal smear ("stretched low-res texture"); harder crinkle
      // tears the filament edges so the veil reads fibrous at 1080p.
      let wu = (u + (fbmW(u, v) - 0.5) * 0.16 + (fbmE(u, v) - 0.5) * 0.06) % 1;
      if (wu < 0) wu += 1;
      const sv = (v * 3) % 1;
      const s = fbm(wu, sv);
      const bank = smoothstepNum(0.34, 0.60, fbmB(u, v));
      const a = smoothstepNum(0.56, 0.88, s) * bank
        * (0.62 + 0.38 * smoothstepNum(0.3, 0.7, fbmE(u + 0.31, v + 0.57)));
      // directional derivative across the shear axis — lit edge vs shaded
      // body (the deck shader rides this texture perpendicular to the
      // cumulus sun rotation, so the axis choice reads as oblique sunlight)
      const s2 = fbm(wu, (sv + 0.018) % 1);
      const lit = clampNum((s - s2) * 9 + 0.55, 0, 1);
      const o = (y * W + x) * 4;
      px[o] = Math.round(255 * (SHD[0] + (LIT[0] - SHD[0]) * lit));
      px[o + 1] = Math.round(255 * (SHD[1] + (LIT[1] - SHD[1]) * lit));
      px[o + 2] = Math.round(255 * (SHD[2] + (LIT[2] - SHD[2]) * lit));
      px[o + 3] = Math.round(255 * a * 0.6);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = CLOUD_ANISOTROPY; // grazing-angle sharpness (see const block)
  return tex;
}

/** Numeric smoothstep. @param {number} a @param {number} b @param {number} x @returns {number} */
function smoothstepNum(a, b, x) {
  const t = clampNum((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Numeric clamp. @param {number} x @param {number} lo @param {number} hi @returns {number} */
function clampNum(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

/**
 * Render a throwaway sky to a 16×16 target with a horizon-level camera facing
 * away from the sun, average the middle pixel row, and return the linear color.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Vector3} sunDir - unit toward-sun vector
 * @returns {THREE.Color} linear-space horizon color
 */
function sampleHorizonColor(renderer, sunDir, preset = DEFAULT_PRESET) {
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
  const row = new Uint8Array(HORIZON_RT_SIZE * 4);
  let targetRestored = false;
  let r = 0;
  let g = 0;
  let b = 0;
  try {
    renderer.setRenderTarget(rt);
    renderer.render(sampleScene, cam);
    renderer.setRenderTarget(prevTarget);
    targetRestored = true;
    renderer.readRenderTargetPixels(rt, 0, HORIZON_RT_SIZE >> 1, HORIZON_RT_SIZE, 1, row);

    for (let i = 0; i < HORIZON_RT_SIZE; i++) {
      r += row[i * 4];
      g += row[i * 4 + 1];
      b += row[i * 4 + 2];
    }
    const inv = 1 / (HORIZON_RT_SIZE * 255);
    r *= inv;
    g *= inv;
    b *= inv;
  } finally {
    if (!targetRestored) renderer.setRenderTarget(prevTarget);
    rt.dispose();
    sampleSky.geometry.dispose();
    sampleSky.material.dispose();
  }

  // Guard the degenerate case (context hiccup → black readback): fall back to
  // the hand-tuned preset rather than fogging the world to black.
  if (r + g + b < 0.01) return new THREE.Color(FALLBACK_HORIZON_HEX);
  // r8 highlight-rolloff: everything downstream of this sample (FogExp2
  // color, the aerial scatter-in targets in post.js, the cloud decks' haze
  // pole) inherits its luminance — cap it below diffuse-white so no amount
  // of fog/scatter stacking can pull large screen regions to a clipped
  // white-out (the desert/winter far-field wash). Hue is preserved.
  return capColorLuminance(
    new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace), HORIZON_LUM_CAP);
}

// Linear-luminance ceiling for the horizon sample (see sampleHorizonColor).
// 0.55 linear lands at ~215/255 display after ACES + grade — a bright haze
// that still reads as atmosphere, never as blown white.
// r3: 0.48 → 0.45 — paired with post.js AERIAL_HAZE_LUM_CAP 0.44 → 0.41 so
// the desert mesa band and urban far field keep silhouette value against the
// haze (the "mesas ~90% swallowed by a pink haze band" read).
const HORIZON_LUM_CAP = 0.45;

/** Scale a linear color down so its Rec709 luminance is <= maxLum (hue kept).
 * @param {THREE.Color} c @param {number} maxLum @returns {THREE.Color} c */
function capColorLuminance(c, maxLum) {
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
export function createSky(scene, renderer) {
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
  // Publish the live sun direction for post.js's directional aerial scatter
  // (same Vector3 instance — applyPreset mutates it in place, so the post
  // chain always sees the current map's sun without an explicit re-wire).
  scene.userData.sunDirWorld = sunDir;
  // r3: publish the per-map display exposure trim for post.js's grade.
  scene.userData.postExposure = preset.postExposure;

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
  const cloudSunRot = (dir) => {
    const l = Math.hypot(dir.x, dir.z) || 1;
    return [-dir.z / l, -dir.x / l];
  };
  const mkCloudDeck = (tex, alt, uvMeters, opacity, radius, hazeK, off, name, shadeW = 0.3) => {
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
  // LOADING PERF (boot r9): the two cloud sprite bakes (makeCloudTexture +
  // makeCirrusTexture, ~330 ms of fbm/canvas work — the bulk of the boot 'sky'
  // stage) are DEFERRED. The garage bay is fully enclosed, so nothing on the
  // boot path can see a cloud; each deck starts on a transparent placeholder
  // (alpha 0 → the deck shader outputs nothing) and ensureCloudTextures()
  // image-swaps the real bakes in later. Every path that can show the outdoor
  // sky funnels through world activation / applyPreset, and both call it —
  // main.js also runs it from a post-ready idle slice so a long garage dwell
  // absorbs the cost first. The bakes are seed-deterministic and order-
  // independent (separate mulberry32 streams), so deferral changes no pixels.
  const lazyCloudTex = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = CLOUD_ANISOTROPY;
    return tex;
  };
  // perf-r5c: per-deck flags — the chunked twin bakes one deck per tick and
  // a mid-chunk SYNC call (world activation is a finish-now guarantee) still
  // bakes exactly the remainder.
  let cirrusBaked = false;
  let cumulusBaked = false;
  const swapCloudTexture = (deck, baked) => {
    const tex = deck.material.uniforms.uMap.value;
    // dispose BEFORE the image swap (same fix as particles.js sprite
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
  const ensureCloudTextures = () => {
    if (!cirrusBaked) { cirrusBaked = true; swapCloudTexture(cloudsFar, makeCirrusTexture()); }
    if (!cumulusBaked) { cumulusBaked = true; swapCloudTexture(clouds, makeCloudTexture()); }
  };
  /** perf-r5c: one ~350-600 ms fbm deck bake per tick (loading-bar path). */
  const ensureCloudTexturesChunked = async (tick) => {
    if (!cirrusBaked) {
      cirrusBaked = true;
      swapCloudTexture(cloudsFar, makeCirrusTexture());
      if (tick) await tick();
    }
    if (!cumulusBaked) {
      cumulusBaked = true;
      swapCloudTexture(clouds, makeCloudTexture());
      if (tick) await tick();
    }
  };
  const cloudsFar = mkCloudDeck(
    lazyCloudTex(), CIRRUS_ALT, CIRRUS_UV_METERS, CLOUD_LAYER2_OPACITY,
    CIRRUS_DOME_RADIUS, CIRRUS_HAZE_K, [0.31, 0.77], 'cloudLayerFar',
    // cirrus rides perpendicular to the sun rotation — its -v axis is NOT
    // sunward, so the mass-shading term stays subtle there
    0.10,
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

  const horizonColor = sampleHorizonColor(renderer, sunDir, preset);

  /** Sync deck uniforms to the current preset + horizon sample. */
  const updateCloudDecks = () => {
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
      // r5: publish the cloud-shadow depth for post.js's aerial pass (see
      // DEFAULT_PRESET.cloudShadowAmp) — overcast maps get patchiness, not
      // crisp cloud shadows.
      scene.userData.cloudShadeAmp = preset.cloudShadowAmp ?? (overcast ? 0.10 : 0.22);
    }
    clouds.material.uniforms.uOpacity.value = preset.cloudOpacity;
    clouds.visible = preset.cloudOpacity > 0.01;
    cloudsFar.material.uniforms.uOpacity.value = preset.cloudOpacity2;
    cloudsFar.visible = preset.cloudOpacity2 > 0.01;
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

  let pmrem = null;
  let envTarget = null;

  // Sourced-HDRI environment override (experiment flag; null = procedural
  // bake, the shipping configuration). Set to an equirect .hdr URL to test.
  const HDRI_ENV_URL = null;
  let hdriPromise = null;
  const loadHdriEnvironment = (url) => {
    if (!hdriPromise) {
      hdriPromise = import('three/examples/jsm/loaders/RGBELoader.js')
        .then(({ RGBELoader }) => new RGBELoader().loadAsync(url));
    }
    hdriPromise.then((tex) => {
      const nextTarget = pmrem.fromEquirectangular(tex);
      if (envTarget !== null) envTarget.dispose();
      envTarget = nextTarget;
      scene.environment = envTarget.texture;
      scene.environmentIntensity = Math.max(preset.envIntensity, ENV_INTENSITY_FLOOR);
      enforceEnvValidity(renderer, scene); // MOBILE r4: see bakeEnvironment
    }).catch((e) => console.warn('[sky] HDRI env failed, procedural bake kept —', e.message));
  };

  const rig = {
    sunDir,

    /**
     * LOADING PERF (boot r9): finish the deferred cloud-deck sprite bakes
     * (idempotent, ~330 ms once). applyPreset runs it on every map re-key;
     * main.js runs it on first world activation and from post-ready idle.
     */
    ensureCloudTextures,
    ensureCloudTexturesChunked,

    /**
     * Bake the procedural sky into a PMREM environment map and install it as
     * `scene.environment` (the IBL specular-ambient layer — the biggest single
     * AAA-ness lever per graphics-aaa.md §2). Uses a SEPARATE Sky instance
     * scaled to fit PMREMGenerator's internal far plane. Safe to call again
     * (re-bake); the previous target is disposed.
     * @returns {void}
     */
    bakeEnvironment() {
      if (pmrem === null) pmrem = new THREE.PMREMGenerator(renderer);

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
      const envScene = new THREE.Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(ENV_SKY_SCALE);
      configureSkyUniforms(envSky, sunDir, preset);
      envScene.add(envSky);

      const nextTarget = pmrem.fromScene(envScene);
      if (envTarget !== null) envTarget.dispose();
      envTarget = nextTarget;

      scene.environment = envTarget.texture;
      scene.environmentIntensity = Math.max(preset.envIntensity, ENV_INTENSITY_FLOOR);

      envSky.geometry.dispose();
      envSky.material.dispose();

      // MOBILE r4: some iOS GPUs poison the PMREM bake (NaN texels) and the
      // IBL term blackens every lit material (proven on-device by the r3
      // watchdog: rescue 'environment-off'). Validate after EVERY bake — the
      // sky re-bakes per map and would reinstall the bad texture — and swap
      // to compensated ambient when invalid (deviceDiag.js).
      enforceEnvValidity(renderer, scene);
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
    applyFog(targetScene) {
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
      // extinction share — post.js's aerial pass carries the scatter-in hue
      // (see FOG_EXTINCTION_SHARE).
      targetScene.fog = new THREE.FogExp2(fogColor, preset.fogDensity * FOG_EXTINCTION_SHARE);
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
    applyPreset(p, targetScene) {
      ensureCloudTextures(); // deferred boot bake — decks must be real now
      preset = { ...DEFAULT_PRESET, ...(p || {}) };
      sunDir.setFromSphericalCoords(
        1,
        THREE.MathUtils.degToRad(90 - preset.sunElevationDeg),
        THREE.MathUtils.degToRad(preset.sunAzimuthDeg),
      );
      configureSkyUniforms(sky, sunDir, preset);
      horizonColor.copy(sampleHorizonColor(renderer, sunDir, preset));
      updateCloudDecks(); // tint/opacity/sun-rotation/haze follow the preset
      scene.userData.postExposure = preset.postExposure; // post.js grade trim
      rig.bakeEnvironment();
      rig.applyFog(targetScene);
    },
  };
  return rig;
}
