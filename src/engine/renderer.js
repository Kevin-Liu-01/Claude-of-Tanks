/**
 * renderer.js — WebGLRenderer construction per docs/research/graphics-aaa.md §1.
 *
 * AA is intentionally OFF at the context level: anti-aliasing comes from the
 * post chain (SMAAPass in post.js) so we never pay for MSAA twice. Tone mapping
 * and sRGB output are configured here but actually applied by OutputPass when
 * rendering through the EffectComposer (r185 behavior).
 */
import * as THREE from 'three';

const PIXEL_RATIO_CAP = 1.5;

/**
 * Create the game's WebGLRenderer and append its canvas to `container`.
 *
 * @param {HTMLElement} container - DOM element that receives the canvas; its
 *   client size (falling back to the window size) drives the initial viewport.
 * @returns {THREE.WebGLRenderer} configured renderer (ACES, sRGB out, PCF soft shadows)
 */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 1.05 compensates the deeper key:fill rebalance (lighting.js/sky.js r2) so
  // midtones sit where they did while shadow cores drop. r6: 1.05 → 1.08 —
  // the stronger grade S-curve (post.js GRADE_CONTRAST 1.34) pulled midtone
  // foliage below the WoT reference band; a slight exposure lift restores
  // midtones while the contrast + black anchor keep shadow cores dense.
  // r7: 1.08 → 1.16 — pixel-measured lit playfield luma sat at 0.20-0.30
  // display (WoT reference ~0.35): the whole foreground read underexposed
  // against the hazy far field. Paired with the post.js grade-pivot fix
  // (0.5 → 0.33) so the lift lands in the midtones instead of being crushed
  // back down by the old above-pivot-only contrast.
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r185

  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Resize handler: re-fit the renderer to its canvas' parent (or the window)
 * and update the camera's aspect + projection matrix.
 *
 * The caller is responsible for also calling `post.setSize` and
 * `lighting.updateFrustums()` afterwards (see ARCHITECTURE.md §4).
 *
 * @param {THREE.WebGLRenderer} renderer - renderer created by {@link createRenderer}
 * @param {THREE.PerspectiveCamera} camera - gameplay camera
 * @returns {void}
 */
export function onResize(renderer, camera) {
  const parent = renderer.domElement.parentElement;
  const width = (parent && parent.clientWidth) || window.innerWidth;
  const height = (parent && parent.clientHeight) || window.innerHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP));
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
