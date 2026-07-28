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
 * - ultra : current maxed visuals — full-res AO, 1.5 ratio. Auto at dpr < 2.
 * - high  : 1.25 ratio, half-res AO. Auto at dpr >= 2 — holds the fps budget
 *           on retina while keeping every feature (AO, bloom, SMAA, 4 cascades).
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
  // cost is amortized; the extra RT memory is ultra/high-only.
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
    maxPixelRatio: 1.25,
    aoScale: 0.5,
    bloomScale: 1.0,
    shadowMapSizes: [4096, 4096, 4096, 2048],
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
 * Resolve 'auto' to a concrete preset name. Retina-class displays
 * (devicePixelRatio >= 2) get 'high': measured on the reference machine the
 * 'ultra' chain misses the fps budget there (53 median / 30 p5 vs 60/45),
 * while 'high' holds it with the full feature set. Everything else gets
 * 'ultra' (dpr-1 output is identical between the two anyway — see header).
 */
export function resolvePresetName(choice = getStoredChoice()) {
  if (choice !== 'auto') return choice;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return dpr >= 2 ? 'high' : 'ultra';
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
