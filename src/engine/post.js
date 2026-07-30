/**
 * post.js — the full post-processing chain.
 *
 * Chain (extends ARCHITECTURE.md §3.1.4 / graphics-aaa.md §4 with a grade):
 *   RenderPass → AerialPass → GTAOPass → UnrealBloomPass → OutputPass →
 *   GradePass → SMAAPass
 *
 * The composer runs on a custom HalfFloat HDR target that owns a DepthTexture
 * (so fx can later sample scene depth for soft particles). OutputPass applies
 * ACES tone mapping + sRGB conversion (reading renderer.toneMapping/
 * outputColorSpace); the display-space GradePass resolves contrast, scope
 * sharpening and split tone before SMAA runs LAST on the values the eye sees.
 * That ordering prevents the grade from sharpening stair steps back into an
 * already-antialiased frame. Bloom thresholds against
 * the linear HDR buffer — sun, muzzle flash and fire exceed 1.0 and bloom
 * naturally.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { getPreset, onPresetChange } from './quality.js';

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
// With the rebalanced ambient (sky.js ENV_INTENSITY 0.45, hemi 0.26) diffuse
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
const GTAO_PARAMS = { radius: 2.3, distanceExponent: 2, thickness: 2.0, scale: 3.3, samples: 16 };
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
// with sky.js HAZE_MAX_LUM 0.56 -> 0.50 and HORIZON_LUM_CAP 0.55 -> 0.48 so
// all three haze sources agree on the same sub-white ceiling.
// r3 ("mesa backdrop ~90% swallowed by a pink haze band"): 0.44 → 0.41,
// paired with sky.js HORIZON_LUM_CAP 0.48 → 0.45 — the scatter-in target
// drops another step below white so far mesas/ridges keep silhouette value
// against the band instead of dissolving into it.
// lighting_post r6 (minor: "the horizon band left of center blows to
// near-white" on player_view): 0.41 -> 0.385 — one more step below white so
// the brightest scatter-in convergence stays clearly a color, not a blowout.
const AERIAL_HAZE_LUM_CAP = 0.385;
// r9 SNIPER DE-HAZE: main.js already scales the FogExp2 density down at high
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
// scene.userData.cloudShadeAmp (sky.js: fair-weather 0.22, overcast 0.10 —
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
// dome self-caps at ~1.45 (sky.js SKY_KNEE) and diffuse surfaces top out
// ~1.6, so the start only catches true emissives; asymptote 4.55 still
// tonemaps to ~0.92 so hot cores stay hot, and still crosses the 1.78 bloom
// threshold so fire/flash keep their halo.
const EM_SHOULDER_START = 1.55;
// r3: 3.0 → 3.6 (asymptote 5.15) — fire cores keep more HDR separation above
// the bloom threshold so the halo brightness tracks the core instead of every
// hot pixel compressing into the same 3.1-3.8 band. ACES(5.15 x 1.16) ~ 0.95
// display: still no clipped-white plateau.
const EM_SHOULDER_RANGE = 3.6; // asymptote = START + RANGE

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

// Final grade (applied AFTER OutputPass, i.e. in display sRGB space):
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
// (lighting.js hemi bounce floor + renderer exposure 1.08 → 1.16) moves the
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
// tone poles pushed ~20% further apart (below). Paired with renderer.js
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
    // scene.userData.postExposure (written by sky.js applyPreset from the
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
        float sharpW = uSharp * ( 1.0 - smoothstep( ${(SCOPE_BLUR_START - 0.08).toFixed(3)}, ${SCOPE_BLUR_START.toFixed(3)}, scopeR ) );
        if ( sharpW > 0.001 ) {
          vec2 px = vec2( 0.0009 / uAspect, 0.0009 ); // ~1 px at 1080p (r5: tighter kernel = crisper x8)
          vec3 nb = texture2D( tDiffuse, vUv + vec2( px.x, 0.0 ) ).rgb
                  + texture2D( tDiffuse, vUv - vec2( px.x, 0.0 ) ).rgb
                  + texture2D( tDiffuse, vUv + vec2( 0.0, px.y ) ).rgb
                  + texture2D( tDiffuse, vUv - vec2( 0.0, px.y ) ).rgb;
          texel.rgb = max( texel.rgb + ( texel.rgb - nb * 0.25 ) * sharpW, 0.0 );
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

/** Scale a linear color down so its Rec709 luminance is <= maxLum (hue kept).
 * @param {THREE.Color} c @param {number} maxLum @returns {void} */
function capLuminance(c, maxLum) {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum > maxLum) c.multiplyScalar(maxLum / lum);
}

/**
 * @typedef {object} Post
 * @property {EffectComposer} composer
 * @property {(dt: number) => void} render - THE only render call per frame
 * @property {(w: number, h: number) => void} setSize
 * @property {UnrealBloomPass} bloom
 * @property {GTAOPass} gtao
 * @property {(level: 'high'|'low') => void} setQuality
 */

/**
 * Build the EffectComposer chain on an HDR (HalfFloat) target with an
 * attached DepthTexture.
 *
 * @param {THREE.WebGLRenderer} renderer - from createRenderer
 * @param {THREE.Scene} scene - the game scene
 * @param {THREE.PerspectiveCamera} camera - the gameplay camera
 * @returns {Post}
 */
export function createPost(renderer, scene, camera) {
  // Quality preset (src/engine/quality.js): caps the composer's internal
  // pixel ratio (render scale — the final pass upscales to the native canvas)
  // and scales the AO/bloom buffers. At devicePixelRatio 1 the renderer ratio
  // is 1.0 (below every cap) and aoScale is 1 on the auto tier, so nothing
  // changes vs. the original chain; on retina (dpr >= 2) the 'high' tier is
  // what keeps the >=60 median / >=45 p5 fps budget (see quality.js header).
  let preset = getPreset();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
  });
  const composer = new EffectComposer(renderer, target);
  // Scene depth plumbing — the topology is load-bearing. The composer keeps
  // `target` as renderTarget1 but renders the SCENE into renderTarget2 (the
  // initial readBuffer), which is a clone of `target`. A cloned DepthTexture
  // shares its GL storage (same Source), so a depth-reading pass ends up
  // sampling a texture that is ALSO the depth attachment of whichever
  // ping-pong buffer it writes to: a framebuffer feedback loop
  // (GL_INVALID_OPERATION spam + intermittent all-black frames on ANGLE).
  // Give the scene buffer (renderTarget2) its own private DepthTexture, strip
  // the twin's, and sample only that private texture in the aerial pass —
  // which, running at even parity, always writes the OTHER buffer.
  const sceneDepth = new THREE.DepthTexture(size.x, size.y);
  composer.renderTarget1.depthTexture = null;
  composer.renderTarget2.depthTexture = sceneDepth;

  composer.addPass(new RenderPass(scene, camera)); // 1. scene, linear HDR

  // 2. depth-driven aerial perspective — one distance curve for every
  // material (see AerialShader above). Runs in linear HDR space, pre-bloom.
  // ORDER IS LOAD-BEARING: this pass samples `target.depthTexture` (the depth
  // attachment of composer renderTarget1). It must run at EVEN swap parity so
  // it writes into renderTarget2 — placed after GTAO (odd parity) it renders
  // INTO renderTarget1 while sampling renderTarget1's depth attachment, a
  // framebuffer feedback loop (GL_INVALID_OPERATION spam + intermittent
  // all-black frames on ANGLE).
  const aerial = new ShaderPass(AerialShader);
  aerial.uniforms.tDepth.value = sceneDepth;
  composer.addPass(aerial);

  const gtao = new GTAOPass(scene, camera, size.x, size.y); // 3. AO multiply
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
  // The scene depth is complete by the time this pass runs: the parity guard
  // in render() pins the scene render into renderTarget2 every frame.
  gtao.setGBuffer(sceneDepth);
  gtao.updateGtaoMaterial(GTAO_PARAMS);
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
      throw new Error('post.js: GTAO distance-fade anchor not found in GTAOShader');
    }
    gtao.gtaoMaterial.fragmentShader = patched;
    gtao.gtaoMaterial.needsUpdate = true;
  }
  // Quality: run the whole GTAO stack (scene depth/normal prepass, 16-tap AO,
  // Poisson denoise) at `aoScale` x composer resolution. Its internal targets
  // are LinearFilter, so the final multiply-blend bilinearly upsamples the AO
  // buffer — the standard half-res-AO scheme. aoScale 1 (ultra) is unchanged
  // full-res; aoScale 0 disables the pass entirely.
  {
    const origSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => {
      const s = preset.aoScale || 1;
      origSetSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
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

  const bloom = new UnrealBloomPass(size.clone(), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  {
    // Clamp the bloom extraction (see BLOOM_INPUT_CLAMP above).
    const hp = bloom.materialHighPassFilter;
    const patched = hp.fragmentShader.replace(
      HIGH_PASS_ANCHOR,
      `gl_FragColor = mix( outputColor, vec4( min( texel.rgb, vec3( ${BLOOM_INPUT_CLAMP.toFixed(2)} ) ), texel.a ), alpha );`,
    );
    if (patched === hp.fragmentShader) {
      throw new Error('post.js: bloom high-pass clamp anchor not found in LuminosityHighPassShader');
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

  // SMAA runs after BOTH OutputPass and the display grade. Anti-aliasing computed on
  // linear HDR values is defeated by the tone map: a 6.0-vs-0.4 edge blended
  // 50/50 in linear space still tone-maps to ~white against mid-grey, so hot
  // speculars (gun tube top edge vs sky) kept a jagged 1px stair. SMAA's edge
  // detection and blend now run in display sRGB space — the space the eye
  // sees — which is also where the algorithm was designed to operate.
  composer.addPass(new OutputPass()); // 4. ACES + sRGB
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade); // 5. display-space grade (+ scope treatment)
  const smaa = new SMAAPass();
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
  composer.addPass(smaa); // 6. final-frame AA — nothing may sharpen after this

  // --- Quality-aware sizing --------------------------------------------------
  // The composer's pixel ratio is the renderer's, CAPPED by the preset
  // (render scale). Every buffer in the chain — scene HDR target, its private
  // DepthTexture, GTAO (further scaled above), bloom, SMAA — follows through
  // EffectComposer.setSize; the final renderToScreen pass upscales bilinearly
  // to the native-resolution canvas, so the DOM/canvas HUD keeps full
  // sharpness and only the 3D frame pays the reduced raster cost.
  let cssW = 0;
  let cssH = 0;
  // --- Dynamic resolution governor (performance_budget r5) -----------------
  // EVALUATION.md F10 / critic r5 minor: the preset ladder is static, so
  // hardware weaker than the reference machine rides p5 dips with no
  // recovery. Standard AAA answer: scale the internal render resolution to
  // hold frame time. The governor tracks a ~1 s EMA of the render delta and
  // steps `dynScale` (multiplied into the composer pixel ratio below) between
  // 1.0 and DYN_MIN while the frame budget is blown, stepping back up once
  // there is clear headroom. Constraints that shape the design:
  //  - RETINA-CLASS FENCE: engages only when the renderer pixel ratio is
  //    >= 1.25 (dpr >= 2 displays cap at 1.5, laptops at 1.25+). At dsf 1 the
  //    renderer ratio is 1.0, so the screenshot harness and every dsf-1
  //    certification render bit-identical frames — the governor cannot mask
  //    a workload regression on the gate path. (At dsf 2 it is part of the
  //    shipped behavior the probe certifies, exactly like the preset ladder.)
  //  - STEPPED + RATE-LIMITED, not a per-frame lerp: every ratio change
  //    reallocates the whole composer chain (scene HDR target, GTAO, bloom,
  //    SMAA). A continuous lerp would thrash multi-MB GPU allocations; steps
  //    of ~0.09 at most once per 2.5 s cost one bounded resize each and only
  //    fire when frames are already long.
  //  - HYSTERESIS: down past 18.5 ms sustained, up below 13.5 ms — a 5 ms
  //    dead band so the governor cannot oscillate around one threshold. EMA
  //    is re-seeded to the band midpoint after each step so the next decision
  //    needs ~1 s of fresh evidence at the new resolution.
  //  - HUD/DOM stays native-crisp: only the composer's internal buffers
  //    scale; the final pass upscales to the untouched canvas, same as the
  //    preset render-scale path this reuses.
  // With High capped at 1.5, 0.67 is an effective ratio of ~1.0: the old
  // certified fallback rather than a sub-native blur. Normal operation starts
  // at 1.25 and may climb to the full 1.5 canvas ratio.
  const DYN_MIN = 0.67;
  const DYN_STEP = 0.09;
  const DYN_DOWN_MS = 18.5;
  const DYN_UP_MS = 13.5;
  const DYN_INTERVAL_S = 2.5;
  const DYN_WARMUP_S = 6; // ignore boot/shader-compile turbulence
  // High exposes the native 1.5x renderer ratio as an opportunistic ceiling
  // and starts at 1.25x. This remains relative to the live capped ratio, so
  // dpr-1 displays stay exactly 1.0 and never allocate a pointless upscale.
  function baseDynScale() {
    const capped = Math.min(renderer.getPixelRatio(), preset.maxPixelRatio);
    const base = Math.min(capped, preset.adaptiveBasePixelRatio || capped);
    return capped > 0 ? base / capped : 1;
  }
  let dynScale = baseDynScale();
  let dynEma = 0;
  let dynClock = 0;
  let dynLastStep = 0;
  function applySize(w, h) {
    cssW = w;
    cssH = h;
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), preset.maxPixelRatio) * dynScale);
    composer.setSize(w, h);
  }
  /** Advance the governor one frame; resizes the chain when a step fires. */
  function dynGovern(dt) {
    if (!(dt > 0) || dt > 0.25) return; // hitches/tab-switch: not a trend
    dynClock += dt;
    dynEma = dynEma === 0 ? dt : dynEma + (dt - dynEma) * 0.06;
    if (renderer.getPixelRatio() < 1.25) return; // retina-class only (see above)
    if (dynClock < DYN_WARMUP_S || dynClock - dynLastStep < DYN_INTERVAL_S) return;
    const ms = dynEma * 1000;
    if (ms > DYN_DOWN_MS && dynScale > DYN_MIN) {
      dynScale = Math.max(DYN_MIN, dynScale - DYN_STEP);
    } else if (ms < DYN_UP_MS && dynScale < 1) {
      dynScale = Math.min(1, dynScale + DYN_STEP);
    } else {
      return;
    }
    dynLastStep = dynClock;
    dynEma = (DYN_DOWN_MS + DYN_UP_MS) / 2000; // re-seed to the band midpoint
    if (cssW > 0 && cssH > 0) applySize(cssW, cssH);
  }
  {
    const css = renderer.getSize(new THREE.Vector2());
    applySize(css.x, css.y);
  }
  // Live preset switching (settings UI writes quality.setPresetName): retarget
  // every buffer without rebuilding the chain.
  onPresetChange((p) => {
    preset = p;
    gtao.enabled = preset.aoScale > 0;
    dynScale = baseDynScale(); // new preset = new budget baseline; governor re-earns supersampling
    dynEma = 0;
    dynLastStep = dynClock;
    if (cssW > 0 && cssH > 0) applySize(cssW, cssH);
  });

  return {
    composer,

    /**
     * Render the frame through the full chain. Never call `renderer.render`
     * alongside this — the composer is the single render entry point
     * (ARCHITECTURE.md §4 step 10).
     * @param {number} dt - render delta time in seconds (forwarded to passes)
     * @returns {void}
     */
    render(dt) {
      // dynamic resolution governor (see the DYN_* block above): may step the
      // composer's internal pixel ratio and resize the chain — run it FIRST
      // so a resize never lands between the passes below and their uniforms.
      dynGovern(dt);
      // Parity guard — the pass chain swaps the ping-pong buffers an ODD
      // number of times per frame (5 with GTAO enabled), so without this the
      // scene render (and its depth) lands in ALTERNATING buffers frame to
      // frame; every other frame the aerial pass then writes into the buffer
      // whose depth attachment it is sampling — a framebuffer feedback loop
      // (GL_INVALID_OPERATION spam + intermittent all-black frames on ANGLE).
      // Pin the canonical start-of-frame state: scene renders into
      // renderTarget2 (readBuffer, owns sceneDepth), aerial writes rt1.
      if (composer.readBuffer !== composer.renderTarget2) composer.swapBuffers();
      // sniper zoom / rig changes can retune the camera planes — keep the
      // aerial distance reconstruction exact
      aerial.uniforms.uNear.value = camera.near;
      aerial.uniforms.uFar.value = camera.far;
      // sniper de-haze (r9): scale BOTH aerial curves down with zoom, same
      // ramp main.js applies to the FogExp2 density — at x8 the far field
      // must read magnified-clear, not teal-washed (see AERIAL_ZOOM_*).
      {
        const fovK = camera.fov < AERIAL_ZOOM_FOV
          ? Math.max(AERIAL_ZOOM_FLOOR, Math.pow(camera.fov / AERIAL_ZOOM_FOV, 1.5))
          : 1;
        aerial.uniforms.uDensity.value = AERIAL_DENSITY * fovK;
        aerial.uniforms.uHazeDensity.value = AERIAL_HAZE_DENSITY * fovK;
        // far-field detail fades in as the FOV drops through scope range
        // (x2 ~ fov 27 stays clean; x4 ~ fov 12 partial; x8 ~ fov 6.9 full)
        aerial.uniforms.uDetailW.value = THREE.MathUtils.clamp(
          (AERIAL_DETAIL_FOV - camera.fov) / (AERIAL_DETAIL_FOV - 8), 0, 1);
      }
      // per-map display exposure trim (sky.js applyPreset publishes the
      // active preset's postExposure on scene.userData; default 1.0)
      grade.uniforms.uExposure.value = scene.userData.postExposure || 1;
      // per-map cloud-shadow depth (sky.js publishes cloudShadeAmp: 0.22
      // fair-weather, 0.10 overcast; see CLOUD_SHADE_DEFAULT block)
      aerial.uniforms.uCloudShade.value =
        scene.userData.cloudShadeAmp ?? CLOUD_SHADE_DEFAULT;
      // scope treatment follows the rig's live scoped flag (snapSniper sets
      // it too, so harness captures get the exact same treatment). Eased
      // over ~5 frames so live scope-in reads as a transition, not a pop;
      // deterministic captures run several settle frames, so they land on
      // the converged value.
      {
        const target = camera.userData.scoped ? 1 : 0;
        const cur = grade.uniforms.uScope.value;
        grade.uniforms.uScope.value = Math.abs(target - cur) < 0.01
          ? target
          : cur + (target - cur) * 0.45;
        grade.uniforms.uAspect.value = camera.aspect || (16 / 9);
        // r4: zoom-scaled unsharp — 0 below x3 (fov ≥ ~16°), full at x8
        // (fov 6.25°). Follows the eased uScope so scope-in has no pop.
        // r5 ("enemy Tiger at 300 m renders soft at x8 — real WoT sniper
        // mode stays tack-sharp at zoom"): 0.55 → 0.95. Textures are already
        // at their finest mip under magnification (screen-space derivatives
        // shrink with FOV), so source softness must be re-crisped here; the
        // tighter 1 px kernel above keeps it from haloing.
        grade.uniforms.uSharp.value = grade.uniforms.uScope.value *
          0.95 * Math.min(1, Math.max(0, (16 - camera.fov) / 10));
        // gameplay_feel r6 (scoped sun-side washout): bloom is a large share
        // of the milk over bright ground — pull it to ~half while scoped,
        // and take one extra step out of BOTH aerial curves beyond the r9
        // fovK ramp (the sun-directional scatter-in is what fills the upper
        // half of the frame against the sun). Arcade (uScope 0) is bit-
        // identical; pairs with the luma-keyed highlight pull in the grade.
        const scopeW = grade.uniforms.uScope.value;
        bloom.strength = BLOOM_STRENGTH * (1 - 0.5 * scopeW);
        aerial.uniforms.uDensity.value *= 1 - 0.22 * scopeW;
        aerial.uniforms.uHazeDensity.value *= 1 - 0.30 * scopeW;
      }
      // scatter-in targets follow the sky-sampled fog color (map switches),
      // split into a warm (sunward) and cool (anti-sun) pole
      if (scene.fog) {
        const fc = scene.fog.color;
        aerial.uniforms.uHazeWarm.value.setRGB(
          fc.r * AERIAL_WARM_TINT[0], fc.g * AERIAL_WARM_TINT[1], fc.b * AERIAL_WARM_TINT[2]);
        aerial.uniforms.uHazeCool.value.setRGB(
          fc.r * AERIAL_COOL_TINT[0], fc.g * AERIAL_COOL_TINT[1], fc.b * AERIAL_COOL_TINT[2]);
        capLuminance(aerial.uniforms.uHazeWarm.value, AERIAL_HAZE_LUM_CAP);
        capLuminance(aerial.uniforms.uHazeCool.value, AERIAL_HAZE_LUM_CAP);
      }
      // camera basis + sun direction for the per-pixel directional tint
      {
        const e = camera.matrixWorld.elements;
        aerial.uniforms.uCamRight.value.set(e[0], e[1], e[2]);
        aerial.uniforms.uCamUp.value.set(e[4], e[5], e[6]);
        aerial.uniforms.uCamFwd.value.set(-e[8], -e[9], -e[10]);
        aerial.uniforms.uCamPos.value.set(e[12], e[13], e[14]);
        const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        aerial.uniforms.uTan.value.set(ty * camera.aspect, ty);
        const sd = scene.userData.sunDirWorld;
        if (sd) aerial.uniforms.uSunDir.value.copy(sd).normalize();
      }
      composer.render(dt);
    },

    /**
     * Resize the whole chain. Pass CSS-pixel dimensions; the composer applies
     * its pixel ratio internally and every pass (GTAO, bloom, SMAA) is resized
     * through `EffectComposer.setSize`. The renderer itself is resized by
     * `renderer.js/onResize` — call that first.
     * @param {number} w - width in CSS pixels
     * @param {number} h - height in CSS pixels
     * @returns {void}
     */
    setSize(w, h) {
      applySize(w, h);
    },

    bloom,
    gtao,

    /** Live dynamic-resolution scale (1 = full preset resolution). Probe/
     * settings-UI observability for the governor above; read-only. */
    get dynScale() { return dynScale; },

    /**
     * Quality toggle. GTAO is the most expensive pass (~2–3 ms @1080p) and is
     * the first thing dropped on weak hardware; the rest of the chain stays.
     * @param {'high'|'low'} level
     * @returns {void}
     */
    setQuality(level) {
      gtao.enabled = level !== 'low' && preset.aoScale > 0;
    },
  };
}
