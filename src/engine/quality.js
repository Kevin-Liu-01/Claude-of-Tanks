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

// ---------------------------------------------------------------------------
// MOBILE r1: DEVICE TIER (mobile/tablet vs desktop), resolved ONCE at boot by
// createRenderer (renderer.js) and overridable via ?tier=mobile|desktop for
// testing. Phones were bricking on the deployed build because 'auto' resolved
// to the 'high' DESKTOP preset everywhere: ~0.5 GB of GPU textures (full GLB
// roster + hero-grade canvas bakes) + 4096² shadow cascades on devices whose
// browsers OOM-kill a tab well below that. The mobile tier is a real preset
// on the same ladder (data, not scattered if-statements): every engine module
// that already reads the preset (post.js, lighting.js) picks it up, and the
// texture levers below (textureScale/textureCap/glbModels) are consumed by
// the texture creation sites (materials.js, world bakers, modelLoader).
//
// Detection inputs (cheap, boot-safe): UA/touch class, gl MAX_TEXTURE_SIZE
// (a 4096 cap identifies constrained GPUs even under desktop UAs), and
// navigator.deviceMemory where available. iPadOS 13+ masquerades as
// Macintosh — its touch points give it away.
// ---------------------------------------------------------------------------
let _deviceTier = null;      // 'mobile' | 'desktop' once resolved
let _glMaxTexSize = 16384;   // renderer capability, captured at resolve time

/**
 * Resolve the device tier once. Called by createRenderer immediately after
 * WebGLRenderer construction — before any preset consumer (post/lighting/
 * material bakes) reads the ladder.
 * @param {THREE.WebGLRenderer} [renderer] capability source (maxTextureSize)
 * @returns {'mobile'|'desktop'}
 */
export function resolveDeviceTier(renderer) {
  if (_deviceTier) return _deviceTier;
  try {
    if (renderer && renderer.capabilities && renderer.capabilities.maxTextureSize) {
      _glMaxTexSize = renderer.capabilities.maxTextureSize;
    }
  } catch (_) { /* capability probe only */ }
  let forced = null;
  try {
    const t = new URLSearchParams(window.location.search).get('tier');
    if (t === 'mobile' || t === 'desktop') forced = t;
  } catch (_) { /* no window/URL — headless import */ }
  if (forced) {
    _deviceTier = forced;
  } else {
    let mobile = false;
    try {
      const nav = navigator;
      const ua = nav.userAgent || '';
      const touchPts = nav.maxTouchPoints || 0;
      const phoneUA = /Android|iPhone|iPad|iPod|Windows Phone|Mobile|Silk/i.test(ua);
      const iPadDesktopUA = /Macintosh/.test(ua) && touchPts > 1; // iPadOS 13+
      const tightGpu = _glMaxTexSize <= 4096;
      const smallMem = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
      const coarse = typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
      mobile = phoneUA || iPadDesktopUA || tightGpu || (coarse && smallMem);
    } catch (_) { mobile = false; }
    _deviceTier = mobile ? 'mobile' : 'desktop';
  }
  try {
    // one-line boot breadcrumb probes/users can quote from a phone
    console.info(`[quality] device tier: ${_deviceTier} (maxTex ${_glMaxTexSize})`);
  } catch (_) { /* consoleless env */ }
  return _deviceTier;
}

/** @returns {'mobile'|'desktop'} resolved tier ('desktop' until resolved) */
export function getDeviceTier() { return _deviceTier || 'desktop'; }

/** True when sourced-GLB model swaps are enabled on this tier (modelLoader
 * gates its whole fetch/parse/upload pipeline on this — procedural tanks are
 * the models of record on mobile). */
export function glbModelsEnabled() { return getPreset().glbModels !== false; }

/**
 * CENTRAL texture-resolution lever. Texture/canvas creation sites pass their
 * authored dimension through this: desktop tiers return it unchanged; the
 * mobile tier scales it (textureScale) and clamps to both the tier cap and
 * the live gl MAX_TEXTURE_SIZE so no texture can exceed the device.
 * @param {number} px authored texture dimension
 * @returns {number} dimension to allocate on the active tier
 */
export function texSize(px) {
  const p = getPreset();
  const scaled = px * (p.textureScale || 1);
  return Math.max(1, Math.round(Math.min(scaled, p.textureCap || Infinity, _glMaxTexSize)));
}

/** Clamp WITHOUT the tier scale — for sizes that must not shrink on mobile
 * (readability-critical bakes) but still may never exceed device caps. */
export function clampTexSize(px) {
  const p = getPreset();
  return Math.max(1, Math.min(px, p.textureCap || Infinity, _glMaxTexSize));
}

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
  // MOBILE r1: the DEVICE tier for phones/tablets — never offered by the
  // settings picker (PRESET_ORDER below is unchanged) and never resolved on a
  // desktop-class device; resolvePresetName pins it whenever the device tier
  // is mobile. Sized against a ~192 MB GPU texture budget on a 3-4 GB-RAM
  // phone whose browser kills the tab near 1-1.5 GB total:
  // - glbModels false — the sourced-GLB swap pipeline (fetch/parse/upload of
  //   5-14 community models, 100s of MB decoded) never runs; the procedural
  //   fleet is the model of record. Single biggest win.
  // - textureScale 0.5 / textureCap 2048 — every procedural canvas bake
  //   (tank albedo/normal/rough sets, world layers) allocates at half its
  //   authored dimension through the central texSize() lever, and nothing may
  //   exceed 2048 (or the live gl cap) in any dimension.
  // - 1024/512 shadow cascades + 300 m range — the desktop 'high' cascades
  //   (2x 4096² + 2x 2048² ≈ 170 MB of RTs) were a third of the whole mobile
  //   budget; lighting.js' penumbra compensation keeps softness constant.
  // - composer at 1.0x CSS pixels, may earn 1.25x (adaptiveBase/max), MSAA 2,
  //   AO off, half bloom chain, governor floor 0.6 — the post chain's
  //   cheapest stable configuration without forking its structure.
  mobile: {
    label: 'Mobile',
    msaaSamples: 2,
    maxPixelRatio: 1.25,
    adaptiveBasePixelRatio: 1.0,
    aoScale: 0,
    bloomScale: 0.5,
    shadowMapSizes: [1024, 1024, 512, 512],
    shadowMaxFar: 300,
    textureScale: 0.5,
    textureCap: 2048,
    glbModels: false,
    dynMin: 0.6,
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
  // MOBILE r1: the device tier OWNS the ladder on phones/tablets. A stored
  // desktop choice (or a tap on the settings picker) must never re-enable the
  // desktop texture/shadow footprint on a device that OOMs under it — that is
  // exactly the deployed-build brick this tier exists to fix. ?tier=desktop
  // remains the explicit test/escape hatch (resolveDeviceTier).
  if (getDeviceTier() === 'mobile') return 'mobile';
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
