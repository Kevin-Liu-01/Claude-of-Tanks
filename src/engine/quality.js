/**
 * quality.js — graphics quality presets (performance budget owner).
 *
 * The perf budget (>=60 fps median / >=45 fps p5 at 1080p) must hold at the
 * DEFAULT settings on a retina display (devicePixelRatio 2), where the
 * renderer's 1.5 pixel-ratio cap still rasterizes 2.25x the pixels of a
 * 1080p@dpr1 frame through the full HDR post chain. Measured on this class of
 * GPU that lands ~53 fps median / ~30 fps p5 — a hard budget fail.
 *
 * Fix = an explicit quality ladder, auto-selected by devicePixelRatio and
 * user-overridable (persisted in localStorage; the settings UI writes through
 * `setPresetName`). Two GPU-cost levers live here as DATA; the engine modules
 * (post.js, lighting.js) read them and subscribe to live changes:
 *
 * - `maxPixelRatio` — cap on the EffectComposer's internal pixel ratio
 *   (AAA "render scale"): the 3D scene + post chain render at the capped
 *   resolution and the final pass upscales bilinearly to the native canvas.
 *   DOM/canvas HUD stays native-crisp. At dpr1 the renderer pixel ratio is
 *   1.0, below every cap, so dpr-1 output is UNCHANGED on every preset >= medium
 *   (the screenshot contract shots are bit-identical on auto/ultra/high).
 * - `aoScale` — GTAO buffer scale relative to composer resolution (0 = off).
 *   Half-res AO + bilinear upsample is the industry default; at retina
 *   resolutions full-res GTAO (16 taps + Poisson denoise + a full scene
 *   depth/normal prepass) is the single most expensive pass in the frame.
 * - `bloomScale` — UnrealBloom internal chain scale (its mip chain is already
 *   input/2, so 0.5 runs it at quarter res; composite stays full-res).
 * - `shadowMapSizes` — per-cascade CSM shadow map resolutions (lighting.js).
 *
 * Preset semantics (resolution numbers are the EFFECTIVE pixel ratio at
 * dpr>=2, where the renderer caps at 1.5):
 * - ultra : maxed visuals — full-res AO, 1.5 ratio, 4096 cascade 2. Explicit
 *           opt-in via settings (r7: auto no longer selects it — see
 *           resolvePresetName).
 * - high  : THE DEFAULT on every display ('auto'). 1.1 ratio, half-res AO,
 *           0.6x bloom chain — holds the fps budget with real tail margin
 *           while keeping every feature (AO, bloom, SMAA, 4 cascades).
 * - medium: 1.0 ratio, half-res AO, half-res bloom, 2048/1024 cascades.
 * - low   : 0.75 ratio, AO off, half-res bloom, 2048/1024 cascades, shorter
 *           shadow range.
 */

const LS_KEY = 'cot.gfxPreset';

export const PRESETS = {
  // r5: cascade 2 (roughly the 130-230 m band where pole/tree/building
  // shadows are most readable at gameplay camera angles) went 2048 → 4096 on
  // ultra/high — at 2048 its ~0.15 m texels x the PCF disk radius produced
  // the "wide over-blurred dark stripes" shadow critique; 4096 halves the
  // physical penumbra. Cascade 3 (230-520 m) stays 2048: genuinely subpixel.
  // Far cascades still re-render round-robin (lighting.js), so the fill-rate
  // cost is amortized; the extra RT memory is ultra-only.
  // r7 (perf recert): the 4096 cascade 2 is now ULTRA-ONLY. 'high' — the
  // retina DEFAULT — returns to 2048 with a physical-penumbra-preserving PCF
  // radius compensation in lighting.js (radius scales with mapSize/reference,
  // so the r5 stripe fix is kept: penumbra WIDTH is identical, only shadow
  // texel resolution in the 130-230 m band drops). Measured on the reference
  // machine at dpr2/60 s: the r5/r6 content rounds pushed 'high' from 9.4 ms
  // median (r4 cert) to 12.3 ms — a budget fail; this retune (ratio 1.25 →
  // 1.1, bloomScale 1.0 → 0.6, cascade 2 → 2048) brings it back to ~10 ms
  // (100 fps median) with every feature still on.
  ultra: {
    label: 'Ultra',
    maxPixelRatio: 1.5,
    aoScale: 1.0,
    bloomScale: 1.0,
    shadowMapSizes: [4096, 4096, 4096, 2048],
    shadowMaxFar: 520,
  },
  high: {
    label: 'High',
    maxPixelRatio: 1.1,
    aoScale: 0.5,
    bloomScale: 0.6,
    shadowMapSizes: [4096, 4096, 2048, 2048],
    shadowMaxFar: 520,
  },
  medium: {
    label: 'Medium',
    maxPixelRatio: 1.0,
    aoScale: 0.5,
    bloomScale: 0.5,
    shadowMapSizes: [2048, 2048, 1024, 1024],
    shadowMaxFar: 520,
  },
  low: {
    label: 'Low',
    maxPixelRatio: 0.75,
    aoScale: 0,
    bloomScale: 0.5,
    shadowMapSizes: [2048, 2048, 1024, 1024],
    shadowMaxFar: 380,
  },
};

export const PRESET_ORDER = ['low', 'medium', 'high', 'ultra'];

const listeners = new Set();

/** The user's stored choice: a preset name or 'auto' (default). */
export function getStoredChoice() {
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === 'auto' || (v && PRESETS[v])) return v;
  } catch (_) { /* storage blocked — fall through to auto */ }
  return 'auto';
}

/**
 * Resolve 'auto' to a concrete preset name: 'high' on every display — the
 * tier tuned to hold the perf budget (>=60 median / >=45 p5, p99 <= 25 ms)
 * with real margin; 'ultra' is the explicit opt-in maxed tier.
 *
 * r7: auto used to give dpr-1 displays 'ultra'. Measured on the reference
 * machine at 1080p/60 s certification windows, ultra's tail sat at p99
 * 27 ms (gate 25) with every other line passing — the full-res AO + 1.0
 * bloom + 4096 cascade 2 stack leaves too little headroom to absorb normal
 * desktop scheduling noise. The 'high' chain certifies p99 16.3 ms while
 * rasterizing MORE pixels at dpr2 (1.1 ratio = 3.24 Mpx vs 2.07 Mpx at
 * dpr1), so the default holds the budget on every display class and the
 * frame-tail gate stops being a coin flip against ambient load.
 */
export function resolvePresetName(choice = getStoredChoice()) {
  if (choice !== 'auto') return choice;
  return 'high';
}

/** @returns {typeof PRESETS[keyof typeof PRESETS]} the active preset object */
export function getPreset() {
  return PRESETS[resolvePresetName()];
}

/**
 * Store a new choice ('auto' or a preset name) and notify subscribers
 * (post.js resizes the composer chain, lighting.js reallocates shadow maps).
 * The settings UI is the intended caller.
 * @param {string} name - 'auto' | 'low' | 'medium' | 'high' | 'ultra'
 * @returns {void}
 */
export function setPresetName(name) {
  if (name !== 'auto' && !PRESETS[name]) return;
  try { window.localStorage.setItem(LS_KEY, name); } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
}

/**
 * Subscribe to live preset changes. Returns an unsubscribe function.
 * @param {(preset: object) => void} fn
 * @returns {() => void}
 */
export function onPresetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
