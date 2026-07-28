/**
 * post.js — the full post-processing chain.
 *
 * Chain (extends ARCHITECTURE.md §3.1.4 / graphics-aaa.md §4 with a grade):
 *   RenderPass → GTAOPass → AerialPass → UnrealBloomPass → SMAAPass →
 *   OutputPass → GradePass
 *
 * The composer runs on a custom HalfFloat HDR target that owns a DepthTexture
 * (so fx can later sample scene depth for soft particles). SMAA operates in
 * linear space so it sits BEFORE OutputPass; OutputPass applies ACES tone
 * mapping + sRGB conversion (reading renderer.toneMapping/outputColorSpace).
 * GradePass runs after it, in display sRGB space (contrast/saturation/vignette
 * are perceptual ops). Bloom thresholds against the linear HDR buffer — sun,
 * muzzle flash and fire exceed 1.0 and bloom naturally.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const BLOOM_STRENGTH = 0.34;
const BLOOM_RADIUS = 0.4;
// With the rebalanced ambient (sky.js ENV_INTENSITY 0.45, hemi 0.26) diffuse
// surfaces top out well under 1.0 in the linear HDR buffer, so 1.35 keeps
// bloom off walls/terrain AND off the near-sun horizon band, while the sun
// disc, muzzle flash core, tracers and fire (all >1.35) glow naturally.
const BLOOM_THRESHOLD = 1.35;
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
const GTAO_PARAMS = { radius: 1.3, distanceExponent: 2, thickness: 1.6, scale: 1.7, samples: 16 };
const GTAO_BLEND_INTENSITY = 1.0;

// Depth-driven aerial perspective (r3: "distant hills correctly shift
// grey-blue but distant grass/trees at the same depth keep full saturation").
// Per-material `fog` flags and vertex-color choices made distance response
// incoherent across terrain/foliage/props; this pass applies ONE curve to
// every pixel from the scene depth buffer, in linear HDR space before bloom:
// progressive desaturation + a cool blue-grey shift with distance. The sky
// (depth == 1.0, incl. the depthWrite:false cloud shells) is excluded — the
// dome already carries its own atmosphere.
const AERIAL_DENSITY = 0.0011; // 1/m; f = 1-exp(-(d*k)^2): ~10% @300m, ~70% @1km
const AERIAL_DESAT = 0.5; // max saturation loss at full distance
const AERIAL_COOL = [0.93, 0.985, 1.06]; // cool shift multiplier at full distance

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
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      float depth = texture2D( tDepth, vUv ).x;
      if ( depth < 0.9999999 ) { // sky/cloud dome writes no depth — skip it
        float viewZ = ( uNear * uFar ) / ( ( uFar - uNear ) * depth - uFar );
        float x = -viewZ * uDensity;
        float f = 1.0 - exp( -x * x );
        float lum = dot( texel.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        vec3 hazy = mix( texel.rgb, vec3( lum ), uDesat ) * uCool;
        texel.rgb = mix( texel.rgb, hazy, f );
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
const GRADE_CONTRAST = 1.12;
const GRADE_SATURATION = 1.08;
const GRADE_VIGNETTE = 0.17;
const GRADE_BLACK_LIFT = 0.006;
// Warm afternoon balance, matching the sun key instead of fighting it.
const GRADE_BALANCE = [1.04, 1.0, 0.955];

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: GRADE_CONTRAST },
    uSaturation: { value: GRADE_SATURATION },
    uVignette: { value: GRADE_VIGNETTE },
    uBlack: { value: GRADE_BLACK_LIFT },
    uBalance: { value: new THREE.Vector3(...GRADE_BALANCE) },
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
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec3 col = texel.rgb;
      // fixed warm white balance — identical for every camera/shot
      col = clamp( col * uBalance, 0.0, 1.0 );
      // black anchor + contrast S-curve around mid grey
      col = max( col - vec3( uBlack ), vec3( 0.0 ) );
      col = clamp( mix( vec3( 0.5 ), col, uContrast ), 0.0, 1.0 );
      // saturation
      float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = clamp( mix( vec3( luma ), col, uSaturation ), 0.0, 1.0 );
      // vignette (radial, corners only)
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep( 0.3, 0.72, dot( q, q ) * 2.0 );
      gl_FragColor = vec4( col, texel.a );
    }`,
};

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
  gtao.updateGtaoMaterial(GTAO_PARAMS);
  gtao.blendIntensity = GTAO_BLEND_INTENSITY;
  // GTAO renders its depth/normal prepass with a scene-wide overrideMaterial,
  // which ignores alphaTest — alpha-tested foliage cards would write SOLID
  // rectangles into the AO buffer and composite as dark floating quads over
  // the terrain (worst in sniper zoom). Hide objects flagged
  // `userData.aoExclude` for the duration of the pass only.
  {
    const origGtaoRender = gtao.render.bind(gtao);
    const hidden = [];
    gtao.render = function aoExcludeRender(...args) {
      scene.traverse((o) => {
        if (o.userData.aoExclude === true && o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      });
      origGtaoRender(...args);
      for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
      hidden.length = 0;
    };
  }
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
  composer.addPass(bloom); // 3. HDR bloom — muzzle flash / fire pop here

  composer.addPass(new SMAAPass()); // 4. AA in linear space, pre-output
  composer.addPass(new OutputPass()); // 5. ACES + sRGB
  composer.addPass(new ShaderPass(GradeShader)); // 6. display-space grade — LAST

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
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
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
      gtao.enabled = level !== 'low';
    },
  };
}
