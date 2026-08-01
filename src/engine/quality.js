/**
 * quality.js — graphics quality presets (performance budget owner).
 *
 * The perf budget (>=60 fps median / >=45 fps p5 at 1080p) must hold at the
 * DEFAULT settings on a retina display (devicePixelRatio 2), where the
 * composer's 1.5 maxPixelRatio cap still rasterizes 2.25x the pixels of a
 * 1080p@dpr1 frame through the full HDR post chain. Measured on this class of
 * GPU that lands ~53 fps median / ~30 fps p5 — a hard budget fail.
 * (engine-aa r1: the renderer CANVAS may now back at up to dpr 2 — see
 * renderer.js PIXEL_RATIO_CAP — but only the final to-screen AA pass
 * rasterizes there; every cap below still governs the composer chain.)
 *
 * Fix = an explicit quality ladder, auto-selected by devicePixelRatio and
 * user-overridable (persisted in localStorage; the settings UI writes through
 * `setPresetName`). GPU-cost levers live here as DATA; the engine modules
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
 * - `msaaSamples` — geometry-edge samples on the scene-only HDR target. The
 *   resolve happens before post processing, so fullscreen AO/bloom/grade/SMAA
 *   passes stay single-sampled. SMAA then cleans shader/specular edges after
 *   tone mapping without making every post pass pay the MSAA bandwidth cost.
 * - `shadowMapSizes` — per-cascade CSM shadow map resolutions (lighting.js).
 *
 * Preset semantics (resolution numbers are the EFFECTIVE pixel ratio at
 * dpr>=2, where the renderer caps at 1.5):
 * - ultra : maxed visuals — 4x scene MSAA, full-res AO, 1.5 ratio, 4096
 *           cascade 2. Explicit
 *           opt-in via settings (r7: auto no longer selects it — see
 *           resolvePresetName).
 * - high  : THE DEFAULT on every display ('auto'). Uses 4x scene MSAA
 *           (engine-aa r1) and starts at 1.25 ratio on
 *           Retina and can climb to the full 1.5 composer cap, with half-res
 *           AO and a 0.6x bloom chain. The frame governor can fall back to
 *           ~1.125 under sustained load, preserving the >=45 fps floor, and
 *           recovers when the load lifts.
 * - medium: 2x scene MSAA, 1.0 ratio, half-res AO/bloom, 2048/1024 cascades.
 * - low   : SMAA only, 0.75 ratio, AO off, half-res bloom, 2048/1024
 *           cascades, shorter shadow range.
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
  // machine at dpr2/60 s: scaled AO, bloom and cascade 2 leave enough
  // headroom to restore native-class scene raster resolution. The live
  // governor owns the fallback when a device cannot sustain that resolution.
  // r5 (lighting_post: "battlefield_urban has zero cast-shadow volumes from
  // buildings onto streets at establishing-shot distance"): shadowMaxFar
  // 520 → 700 on ultra/high. The urban establishing camera reads town rows
  // out to ~500 m, and CSM's fade=true starts dissolving the last cascade
  // well before maxFar — at 520 the far half of the town rendered shadowless.
  // 700 keeps the whole town inside solid shadow range; the far cascades
  // still re-render round-robin (lighting.js), so the per-frame fill cost is
  // amortized, and the r7 penumbra compensation keeps edge softness constant.
  ultra: {
    label: 'Ultra',
    msaaSamples: 4,
    maxPixelRatio: 1.5,
    aoScale: 1.0,
    bloomScale: 1.0,
    shadowMapSizes: [4096, 4096, 4096, 2048],
    shadowMaxFar: 700,
  },
  // High starts above CSS-pixel resolution on Retina panels and can earn the
  // full 1.5 native renderer ratio. Fine geometry reaches SMAA before any
  // upscale instead of being rasterized at 1.0 then stretched across a 1.5x
  // backing store. The governor may return to ~1.125 under sustained load
  // (post.js DYN_MIN 0.75) and recovers when the load lifts.
  // engine-aa r1: msaaSamples 2 → 4 on THE DEFAULT tier. 2x MSAA leaves one
  // intermediate coverage level per geometric edge — after ACES + the grade's
  // contrast S-curve the survivors read as visible stair-steps on hull/skirt/
  // barrel silhouettes (owner garage screenshot), and SMAA cannot always
  // reconstruct them once the governor has the chain below native. 4x is the
  // WebGL2 baseline every target GPU supports (maxSamples >= 4; Apple/ANGLE
  // reports 8) and the scene-only MSAA target keeps the cost off the post
  // chain. Perf: certified against the dsf-1 and dsf-2 budgets with
  // tools/perfprobe.mjs — see shots/engine-aa-r1/ before/after reports.
  high: {
    label: 'High',
    msaaSamples: 4,
    maxPixelRatio: 1.5,
    adaptiveBasePixelRatio: 1.25,
    aoScale: 0.5,
    bloomScale: 0.6,
    shadowMapSizes: [4096, 4096, 2048, 2048],
    shadowMaxFar: 700,
  },
  medium: {
    label: 'Medium',
    msaaSamples: 2,
    maxPixelRatio: 1.0,
    aoScale: 0.5,
    bloomScale: 0.5,
    shadowMapSizes: [2048, 2048, 1024, 1024],
    shadowMaxFar: 520,
  },
  low: {
    label: 'Low',
    msaaSamples: 0,
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
 * through its adaptive fallback; 'ultra' is the explicit opt-in maxed tier.
 *
 * r7: auto used to give dpr-1 displays 'ultra'. Measured on the reference
 * machine at 1080p/60 s certification windows, ultra's tail sat at p99
 * 27 ms (gate 25) with every other line passing — the full-res AO + 1.0
 * bloom + 4096 cascade 2 stack leaves too little headroom to absorb normal
 * desktop scheduling noise. High keeps the scaled AO/bloom/shadow workload,
 * but now lets its dynamic raster ratio absorb scheduling/GPU pressure instead
 * of permanently presenting every Retina player with a 1.0x upscaled scene.
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
