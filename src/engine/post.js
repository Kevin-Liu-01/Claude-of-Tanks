/**
 * post.js — the full post-processing chain.
 *
 * Chain locked by ARCHITECTURE.md §3.1.4 / graphics-aaa.md §4:
 *   RenderPass → GTAOPass → UnrealBloomPass(0.35, 0.55, 0.85) → SMAAPass → OutputPass
 *
 * The composer runs on a custom HalfFloat HDR target that owns a DepthTexture
 * (so fx can later sample scene depth for soft particles). SMAA operates in
 * linear space so it sits BEFORE OutputPass; OutputPass applies ACES tone
 * mapping + sRGB conversion (reading renderer.toneMapping/outputColorSpace)
 * and is therefore LAST. Bloom threshold 0.85 works because the buffer is
 * linear HDR — sun, muzzle flash and fire exceed 1.0 and bloom naturally.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const BLOOM_STRENGTH = 0.3;
const BLOOM_RADIUS = 0.55;
// Integration note: raised from the doc's 0.85 — sun-facing plaster walls and
// the hazy horizon band sit at ~1.0-1.5 in the linear HDR buffer and read as
// emissive fog with the lower threshold. 1.6 keeps bloom for genuinely hot
// sources only (sun disc, muzzle flash, fire, tracers).
const BLOOM_THRESHOLD = 1.6;
const GTAO_PARAMS = { radius: 0.3, distanceExponent: 1, thickness: 1, scale: 1, samples: 12 };
const GTAO_BLEND_INTENSITY = 0.9;

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
  composer.addPass(gtao);

  const bloom = new UnrealBloomPass(size.clone(), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  composer.addPass(bloom); // 3. HDR bloom — muzzle flash / fire pop here

  composer.addPass(new SMAAPass()); // 4. AA in linear space, pre-output
  composer.addPass(new OutputPass()); // 5. ACES + sRGB — LAST

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
