/**
 * post.js — the full post-processing chain.
 *
 * Chain (extends ARCHITECTURE.md §3.1.4 / graphics-aaa.md §4 with a grade):
 *   RenderPass → GTAOPass → UnrealBloomPass → SMAAPass → OutputPass → GradePass
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
// 0.3 m read as nothing at gameplay camera distances.
const GTAO_PARAMS = { radius: 1.0, distanceExponent: 2, thickness: 1.2, scale: 1.3, samples: 16 };
const GTAO_BLEND_INTENSITY = 1.0;

// Final grade (applied AFTER OutputPass, i.e. in display sRGB space):
// S-curve contrast, +15% saturation, subtle corner vignette and a real black
// anchor — the "graded" signature the raw ACES output lacks. r2 critique:
// "blacks are grey, greens pastel, looks like unlit viewport preview" — the
// anchor pulls track/shadow cores to true black and the curve restores punch.
const GRADE_CONTRAST = 1.11;
const GRADE_SATURATION = 1.15;
const GRADE_VIGNETTE = 0.32;
const GRADE_BLACK_LIFT = 0.01;

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: GRADE_CONTRAST },
    uSaturation: { value: GRADE_SATURATION },
    uVignette: { value: GRADE_VIGNETTE },
    uBlack: { value: GRADE_BLACK_LIFT },
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
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec3 col = texel.rgb;
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

  composer.addPass(new RenderPass(scene, camera)); // 1. scene, linear HDR

  const gtao = new GTAOPass(scene, camera, size.x, size.y); // 2. AO multiply
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
