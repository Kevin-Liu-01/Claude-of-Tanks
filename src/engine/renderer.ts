/**
 * renderer.ts — WebGLRenderer construction per docs/history/research/graphics-aaa.md §1.
 *
 * Context AA is intentionally OFF because the EffectComposer never presents
 * the default framebuffer directly. post.ts instead gives the actual 3D scene
 * a quality-aware MSAA target, resolves it once, then runs the single-sampled
 * post chain and final display-space SMAA. Tone mapping and sRGB output are
 * configured here but actually applied by OutputPass (r185 behavior).
 *
 * The renderer pixel ratio here sizes only the canvas/default framebuffer;
 * the composer's INTERNAL resolution is capped separately by the quality
 * preset (quality.ts maxPixelRatio) and scaled live by the post.ts dynamic
 * resolution governor.
 */
import * as THREE from 'three';
import { t } from '../ui/i18n.ts';
import { getDeviceTier, resolveDeviceTier, noteGpuRenderer, noteGraphicsContextLoss } from './quality.ts';
import { outputResolution, type OutputResolution } from './resolutionPolicy.ts';
import { routeShadowOnlyLayer } from './renderLayers.ts';
import { installContextResourceLifetime } from './contextResourceLifetime.ts';

import { createContextRecovery, type ContextRecoveryOwner, type RecoveryNotice } from './contextRecovery.ts';

type GameRenderer = THREE.WebGLRenderer & {
  userData: {
    outputResolution?: OutputResolution;
    contextRecovery?: ContextRecoveryOwner;
  };
};

// The canvas is the final display surface, not the expensive scene/post
// resolution. DPR-3 phones now get a true native backing store instead of a
// DPR-2 canvas that the browser stretches a second time. Large mobile/tablet
// viewports remain bounded by resolutionPolicy's output-pixel budget; the
// composer's independently adaptive resolution still owns the heavy work.
function applyOutputResolution(
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
): OutputResolution {
  const resolution = outputResolution({
    width,
    height,
    devicePixelRatio: window.devicePixelRatio || 1,
    mobile: getDeviceTier() === 'mobile',
  });
  renderer.setPixelRatio(resolution.pixelRatio);
  (renderer as GameRenderer).userData.outputResolution = resolution;
  return resolution;
}

/**
 * Create the game's WebGLRenderer and append its canvas to `container`.
 *
 * @param {HTMLElement} container - DOM element that receives the canvas; its
 *   client size (falling back to the window size) drives the initial viewport.
 * @returns {THREE.WebGLRenderer} configured renderer (AgX, sRGB out, PCF soft shadows)
 */
export function createRenderer(container: HTMLElement): GameRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  }) as GameRenderer;
  // Install before scene resources are allocated, and before recovery listeners.
  const contextResources = installContextResourceLifetime(renderer.getContext() as WebGL2RenderingContext, renderer.domElement);
  // WebGLRenderer is not an Object3D and therefore has no built-in userData.
  // Reserve a small integration bag for lifecycle hooks installed by main.ts.
  renderer.userData = renderer.userData || {};

  // MOBILE r1: resolve the device tier (quality.ts) before ANY preset
  // consumer runs — sky bake, lighting, post and every texture bake read the
  // ladder after this point. Also captures gl MAX_TEXTURE_SIZE for the
  // central texSize() clamp.
  resolveDeviceTier(renderer);
  // perf-r2e ADAPTIVE AUTO TIER: hand quality.ts the unmasked GPU string so
  // the auto preset can start conservatively on integrated/software parts
  // (a weak dpr-1 laptop is NOT the mobile tier but cannot hold 'high').
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const reportedRenderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    noteGpuRenderer(typeof reportedRenderer === 'string' ? reportedRenderer : '');
  } catch (_) { noteGpuRenderer(''); }
  const recovery = createContextRecovery({
    owner: () => renderer.userData.contextRecovery,
    // Three replaces shadowMap before dispatching our restoration listener.
    beforeRestore: () => routeShadowOnlyLayer(renderer),
    recordLoss: noteGraphicsContextLoss,
    notice: showContextLossOverlay,
  });
  // (2026-10-08, the owner's black screens) a point or spot light's falloff 1 / max(d^decay, 0.01) reaches 100x at 0.1 m:
  // a pooled explosion or muzzle light a few centimetres from glossy paint, glass or water pushed GGX specular past the
  // half-float HDR range (Inf, then NaN through TAA and bloom: a black frame). The floor sits at 0.25 m (16x).
  limitPointLightFalloff();
  renderer.domElement.addEventListener('webglcontextlost', recovery.lost, false);
  renderer.domElement.addEventListener('webglcontextrestored', recovery.restored, false);
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    recovery.dispose();
    renderer.domElement.removeEventListener('webglcontextlost', recovery.lost);
    renderer.domElement.removeEventListener('webglcontextrestored', recovery.restored);
    try { dispose(); } finally { contextResources.dispose(); }
  };

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  applyOutputResolution(renderer, width, height);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 2026-10-01 (the lighting lane, grounded realism): AgX replaces ACES. The fitted ACES curve skewed every
  // saturated colour on its way to white (cyan skies, acid greens, orange skin on sunlit sand) and clipped the
  // sky's highlights near 2; the r3-r7 grade stack spent itself compensating. AgX (three's implementation of the
  // log-encoded sigmoid with a path to white) keeps hue, rolls highlights off over ~16 stops and leaves the
  // look to a light grade (post.ts). Exposure is the light model's (lightModel.ts: an adapting camera per map and
  // time of day, applied in the output pass), so the renderer's own stays at unity.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r185
  routeShadowOnlyLayer(renderer);

  renderer.domElement.dataset.battleCanvas = '';
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Automatic recovery owns the compact cover. Offer a manual reload only after
 * a delay/failure; never assume a device reset was caused by memory exhaustion.
 */
function showContextLossOverlay(state: RecoveryNotice): void {
  if (state === 'ready') { document.getElementById('cot-ctxlost')?.remove(); return; }
  try {
    let el = document.getElementById('cot-ctxlost');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cot-ctxlost';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'cot-ctxlost-title');
      el.tabIndex = -1;
      el.style.cssText = "position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:#080d13;color:#eef4f9;font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box";
      el.innerHTML = `<div style="width:min(420px,100%)">
        <div style="color:#f0ad45;font-size:11px;font-weight:700;letter-spacing:.2em;margin-bottom:20px">CLAUDE OF TANKS</div>
        <h2 id="cot-ctxlost-title" style="font-size:22px;margin:0 0 12px"></h2>
        <p data-recovery-copy role="status" aria-live="polite" style="font-size:14px;line-height:1.6;color:#9fb0bf;margin:0"></p>
        <button id="cot-ctxlost-btn" hidden style="margin-top:24px;padding:12px 24px;background:#f0ad45;color:#101820;border:0;font:700 14px Inter,system-ui,sans-serif;cursor:pointer"></button>
      </div>`;
      (document.body || document.documentElement).appendChild(el);
      el.focus({ preventScroll: true });
      el.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          event.preventDefault();
          const reload = el?.querySelector<HTMLButtonElement>('#cot-ctxlost-btn');
          if (reload && !reload.hidden) reload.focus();
        }
      });
      el.querySelector('#cot-ctxlost-btn')?.addEventListener('click', () => window.location.reload());
    }
    const title = el.querySelector('#cot-ctxlost-title');
    const copy = el.querySelector('[data-recovery-copy]');
    const button = el.querySelector<HTMLButtonElement>('#cot-ctxlost-btn');
    const fallback = state === 'failed' || state === 'delayed';
    if (title) title.textContent = t(`graphics.recovery.${state}`);
    if (copy) copy.textContent = t(`graphics.recovery.${state === 'failed' ? 'failedCopy' : state === 'delayed' ? 'delayedCopy' : 'workingCopy'}`);
    if (button) { button.hidden = !fallback; button.textContent = t('graphics.recovery.reload'); }
    el.dataset.recoveryState = state;
  } catch { /* recovery must remain possible even if presentation fails */ }
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
export function onResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
  const parent = renderer.domElement.parentElement;
  const width = (parent && parent.clientWidth) || window.innerWidth;
  const height = (parent && parent.clientHeight) || window.innerHeight;

  applyOutputResolution(renderer, width, height);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

/** three's getDistanceAttenuation floor (lights_pars_begin): 0.1 m -> 0.25 m for decay 2; idempotent, before compiles. */
export function limitPointLightFalloff(): boolean {
  const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunk.lights_pars_begin;
  if (typeof src !== 'string') return false;
  if (src.includes('max( pow( lightDistance, decayExponent ), 0.0625 )')) return true;
  if (!src.includes('max( pow( lightDistance, decayExponent ), 0.01 )')) return false;
  chunk.lights_pars_begin = src.replace('max( pow( lightDistance, decayExponent ), 0.01 )',
    'max( pow( lightDistance, decayExponent ), 0.0625 )');
  return true;
}
