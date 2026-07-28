/**
 * post.js — the full post-processing chain.
 *
 * Chain (extends ARCHITECTURE.md §3.1.4 / graphics-aaa.md §4 with a grade):
 *   RenderPass → AerialPass → GTAOPass → UnrealBloomPass → OutputPass →
 *   SMAAPass → GradePass
 *
 * The composer runs on a custom HalfFloat HDR target that owns a DepthTexture
 * (so fx can later sample scene depth for soft particles). OutputPass applies
 * ACES tone mapping + sRGB conversion (reading renderer.toneMapping/
 * outputColorSpace); SMAA runs AFTER it, in display space, so edge blending
 * happens on the values the eye sees (AA on linear HDR is defeated by the
 * tone map on hot speculars). GradePass runs last, in display sRGB space
 * (contrast/split-tone/vignette are perceptual ops). Bloom thresholds against
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
const BLOOM_STRENGTH = 0.20;
const BLOOM_RADIUS = 0.28;
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
const BLOOM_INPUT_CLAMP = 2.0;
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
const AERIAL_DENSITY = 0.00125; // 1/m; f = 1-exp(-(d*k)^2)
const AERIAL_DESAT = 0.55; // max saturation loss at full distance
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
const AERIAL_HAZE_DENSITY = 0.00078; // 1/m, slower second curve for scatter-in
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
const AERIAL_HAZE_LUM_CAP = 0.50;
// r9 SNIPER DE-HAZE: main.js already scales the FogExp2 density down at high
// zoom (fov < 15), but the aerial pass kept FULL density, so the x8 sight
// picture stayed a desaturated teal wash — a 450 m hillside at x8 subtends
// the screen like a 60 m object and must read correspondingly clear (WoT
// zoom behavior). Both aerial curves now follow the same FOV ramp the fog
// uses; arcade/establishing cameras (fov >= 15) are untouched.
const AERIAL_ZOOM_FOV = 15; // deg — below this the aerial curves scale down
const AERIAL_ZOOM_FLOOR = 0.26; // density multiplier floor at max zoom
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
const EM_SHOULDER_RANGE = 3.0; // asymptote = START + RANGE

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
    uniform vec3 uHazeWarm;
    uniform vec3 uHazeCool;
    uniform vec3 uSunDir;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;
    uniform vec3 uCamFwd;
    uniform vec2 uTan;
    varying vec2 vUv;
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
        float x = -viewZ * uDensity;
        float f = 1.0 - exp( -x * x );
        float lum = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        vec3 hazy = mix( texel.rgb, vec3( lum ), uDesat ) * uCool;
        texel.rgb = mix( texel.rgb, hazy, f );
        // scattering-in: distance pulls everything toward the sun-directional
        // sky haze — warm near the sun azimuth, cool blue away from it
        float x2 = -viewZ * uHazeDensity;
        float f2 = 1.0 - exp( -x2 * x2 );
        texel.rgb = mix( texel.rgb, hazeCol, f2 );
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
const GRADE_CONTRAST = 1.30;
const GRADE_PIVOT = 0.33;
const GRADE_SATURATION = 1.06;
const GRADE_VIGNETTE = 0.24; // 0.27 stacked with foreground canopy shadow into heavy corners
const GRADE_BLACK_LIFT = 0.012;
const GRADE_KNEE = 0.86; // display-space luma where the highlight shoulder starts
// (r9: the linear GRADE_KNEE_SLOPE 0.55 knee was replaced by a rational
// shoulder in the shader — see the "soft highlight shoulder" note there.)
// Warm afternoon balance, matching the sun key instead of fighting it.
const GRADE_BALANCE = [1.02, 1.0, 0.975];
// Applied only to green-dominant pixels (terrain/foliage): warms hue toward
// yellow-green without touching sky, tank camo browns, or skin-tone-ish dirt.
const GRADE_GREEN_WARM = [1.03, 1.0, 0.96];
const GRADE_GREEN_DESAT = 0.09; // chroma pull-back on green-dominant pixels
// Split-tone poles (multiplied in by shadow/highlight membership).
const GRADE_SHADOW_TINT = [0.950, 0.990, 1.070]; // cool blue-grey shadows
const GRADE_HIGH_TINT = [1.060, 1.008, 0.945]; // warm sun-kissed highlights

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
const SCOPE_VIGNETTE_START = 0.85; // radius where darkening begins (1 = mid-edge)
const SCOPE_VIGNETTE_END = 1.60; // radius of max darkening (past the corners)
const SCOPE_VIGNETTE_MAX = 0.15; // darkening at SCOPE_VIGNETTE_END
const SCOPE_BLUR_START = 0.90; // radius where the radial blur fades in
const SCOPE_BLUR_RAMP = 0.28; // blur reaches full strength at START+RAMP
const SCOPE_BLUR_STEP = 0.0055; // UV step of the 4-tap radial blur at full blur

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
          vec2 px = vec2( 0.0011 / uAspect, 0.0011 ); // ~1.2 px at 1080p
          vec3 nb = texture2D( tDiffuse, vUv + vec2( px.x, 0.0 ) ).rgb
                  + texture2D( tDiffuse, vUv - vec2( px.x, 0.0 ) ).rgb
                  + texture2D( tDiffuse, vUv + vec2( 0.0, px.y ) ).rgb
                  + texture2D( tDiffuse, vUv - vec2( 0.0, px.y ) ).rgb;
          texel.rgb = max( texel.rgb + ( texel.rgb - nb * 0.25 ) * sharpW, 0.0 );
        }
      }
      vec3 col = texel.rgb;
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
      // black anchor + linear contrast around the scene's measured midtone
      // band (uPivot ~0.33, NOT display 0.5 — see the r7 note above)
      col = max( col - vec3( uBlack ), vec3( 0.0 ) );
      col = clamp( mix( vec3( ${GRADE_PIVOT.toFixed(3)} ), col, uContrast ), 0.0, 1.0 );
      // split-tone: cool shadows / warm highlights, keyed on luminance
      float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 split = mix( uShadowTint, uHighTint, smoothstep( 0.12, 0.72, luma ) );
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
      // vignette (radial, corners only)
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep( 0.3, 0.72, dot( q, q ) * 2.0 );
      // sniper scope tube vignette: circular, much heavier than the filmic
      // corner vignette — the sight picture reads as viewed through optics
      if ( uScope > 0.001 ) {
        col *= 1.0 - uScope * ${SCOPE_VIGNETTE_MAX.toFixed(3)}
          * smoothstep( ${SCOPE_VIGNETTE_START.toFixed(3)}, ${SCOPE_VIGNETTE_END.toFixed(3)}, scopeR );
      }
      gl_FragColor = vec4( col, texel.a );
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
    const AO_FADE = 'ao = 1.0 - ( 1.0 - ao ) * smoothstep( 0.03, 0.20, 1.0 - ao );'
      + '\n\t\t\tao = mix( ao, 1., smoothstep( 300., 460., length( viewPos ) ) );';
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

  // r4 ORDER CHANGE: SMAA moved AFTER OutputPass. Anti-aliasing computed on
  // linear HDR values is defeated by the tone map: a 6.0-vs-0.4 edge blended
  // 50/50 in linear space still tone-maps to ~white against mid-grey, so hot
  // speculars (gun tube top edge vs sky) kept a jagged 1px stair. SMAA's edge
  // detection and blend now run in display sRGB space — the space the eye
  // sees — which is also where the algorithm was designed to operate.
  composer.addPass(new OutputPass()); // 4. ACES + sRGB
  composer.addPass(new SMAAPass()); // 5. AA in display space, post-tonemap
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade); // 6. display-space grade (+ scope treatment) — LAST

  // --- Quality-aware sizing --------------------------------------------------
  // The composer's pixel ratio is the renderer's, CAPPED by the preset
  // (render scale). Every buffer in the chain — scene HDR target, its private
  // DepthTexture, GTAO (further scaled above), bloom, SMAA — follows through
  // EffectComposer.setSize; the final renderToScreen pass upscales bilinearly
  // to the native-resolution canvas, so the DOM/canvas HUD keeps full
  // sharpness and only the 3D frame pays the reduced raster cost.
  let cssW = 0;
  let cssH = 0;
  function applySize(w, h) {
    cssW = w;
    cssH = h;
    composer.setPixelRatio(Math.min(renderer.getPixelRatio(), preset.maxPixelRatio));
    composer.setSize(w, h);
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
      }
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
        // r4: zoom-scaled unsharp — 0 below x3 (fov ≥ ~16°), ~0.5 at x8
        // (fov 6.25°). Follows the eased uScope so scope-in has no pop.
        grade.uniforms.uSharp.value = grade.uniforms.uScope.value *
          0.55 * Math.min(1, Math.max(0, (16 - camera.fov) / 10));
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
