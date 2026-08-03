/**
 * renderer.js — WebGLRenderer construction per docs/research/graphics-aaa.md §1.
 *
 * Context AA is intentionally OFF because the EffectComposer never presents
 * the default framebuffer directly. post.js instead gives the actual 3D scene
 * a quality-aware MSAA target, resolves it once, then runs the single-sampled
 * post chain and final display-space SMAA. Tone mapping and sRGB output are
 * configured here but actually applied by OutputPass (r185 behavior).
 *
 * The renderer pixel ratio here sizes only the canvas/default framebuffer;
 * the composer's INTERNAL resolution is capped separately by the quality
 * preset (quality.js maxPixelRatio) and scaled live by the post.js dynamic
 * resolution governor.
 */
import * as THREE from 'three';
import { resolveDeviceTier } from './quality.js';

// engine-aa r1: 1.5 → 2. This caps the CANVAS BACKING STORE, not the render
// cost: the composer renders the scene + post chain at the preset's
// maxPixelRatio (still 1.5 — quality.js owns that budget lever) and only the
// final to-screen AA pass rasterizes at the canvas resolution. At the old 1.5
// cap a dpr-2 display took TWO stacked upscales (composer → 1.5x canvas,
// then the browser stretching the canvas 1.33x onto physical pixels), which
// softened every frame and re-magnified whatever stair-steps survived; the
// final subpix-AA pass also ran below physical resolution. Now the canvas is
// 1:1 with physical pixels on dpr <= 2 displays, the single linear upscale
// happens inside the AA pass, and dpr-1 machines are bit-identical (ratio
// 1.0 either way). Cost: one fullscreen pass + compositor at 2x instead of
// 1.5x — certified against the dsf-2 budget (see shots/engine-aa-r1/).
const PIXEL_RATIO_CAP = 2;

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

  // MOBILE r1: resolve the device tier (quality.js) before ANY preset
  // consumer runs — sky bake, lighting, post and every texture bake read the
  // ladder after this point. Also captures gl MAX_TEXTURE_SIZE for the
  // central texSize() clamp.
  resolveDeviceTier(renderer);
  // MOBILE r1: a lost WebGL context used to be a SILENT PERMANENT black
  // screen (no handler anywhere) — on phones, where the OS reclaims the GPU
  // under memory pressure, that was indistinguishable from a crash. Keep the
  // context restorable (preventDefault) and give the player a branded
  // explanation + reload path; a successful in-place restore reloads
  // outright, which re-runs the whole boot cleanly.
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showContextLossOverlay();
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    try { window.location.reload(); } catch (_) { /* overlay reload remains */ }
  }, false);

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
  // r6: A/B'd 1.20 alongside the deeper grade S-curve (post.js 1.36) — the
  // lift blew the high-albedo maps out (desert sand + winter snowfield went
  // textureless near-white) while buying almost nothing on verdant. Stays
  // 1.16; the grade pivot (0.33) keeps the lit playfield stable under the
  // stronger contrast on its own.
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r185

  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * MOBILE r1: branded context-loss overlay. Built lazily from JS (no index.html
 * dependency), idempotent, sits above every game surface. The message keeps to
 * the boot splash's visual language (dark steel, orange accent, Inter stack).
 */
function showContextLossOverlay() {
  try {
    if (document.getElementById('cot-ctxlost')) return;
    const el = document.createElement('div');
    el.id = 'cot-ctxlost';
    el.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:100000',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:#05080b', 'color:#eef4f9',
      "font-family:'Inter',system-ui,sans-serif", 'text-align:center',
    ].join(';'));
    el.innerHTML = [
      '<div style="max-width:min(520px,86vw)">',
      '<div style="font-size:22px;font-weight:800;letter-spacing:.34em;color:#f0ad45">CLAUDE&nbsp;OF&nbsp;TANKS</div>',
      '<div style="margin-top:18px;font-size:15px;font-weight:600">Graphics device was reset</div>',
      '<div style="margin-top:10px;font-size:12.5px;line-height:1.6;color:#9fb0bf">',
      'The browser reclaimed the game’s graphics memory (this can happen on phones and tablets under memory pressure). ',
      'Reload to jump back in — your garage and progress are saved.',
      '</div>',
      '<button id="cot-ctxlost-btn" style="margin-top:22px;padding:12px 34px;border:1px solid rgba(240,173,69,.6);',
      'border-left:3px solid #f0ad45;background:rgba(240,173,69,.12);color:#ffd27a;font:800 12px/1 \'Inter\',system-ui,sans-serif;',
      'letter-spacing:.22em;text-transform:uppercase;cursor:pointer">Reload</button>',
      '</div>',
    ].join('');
    (document.body || document.documentElement).appendChild(el);
    const btn = el.querySelector('#cot-ctxlost-btn');
    if (btn) btn.addEventListener('click', () => { try { window.location.reload(); } catch (_) { /* ignore */ } });
  } catch (_) { /* overlay is best-effort — never throw from a GL event */ }
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
