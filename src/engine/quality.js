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
 *   resolution and the final FSR1 pass reconstructs to the native canvas.
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
const LS_MOBILE_KEY = 'cot.gfxMobilePreset';
let _mobileResetHandled = false;

// ---------------------------------------------------------------------------
// MOBILE r1: DEVICE TIER (mobile/tablet vs desktop), resolved ONCE at boot by
// createRenderer (renderer.js) and overridable via ?tier=mobile|desktop for
// testing. Phones were bricking on the deployed build because 'auto' resolved
// to the 'high' DESKTOP preset everywhere: ~0.5 GB of GPU textures (full GLB
// roster + hero-grade canvas bakes) + 4096² shadow cascades on devices whose
// browsers OOM-kill a tab well below that. The mobile tier is a real preset
// on the same ladder (data, not scattered if-statements): every engine module
// that already reads the preset (post.js, lighting.js) picks it up, and the
// texture levers below (textureScale/textureCap) are consumed by the texture
// creation sites (materials.js and world bakers).
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
  // Mobile quick-switch levels keep the constrained texture budget fixed —
  // live switching cannot (and should not) rebuild the world's texture
  // atlas. They only retarget raster, AA, bloom and shadow buffers, which are
  // safe to resize while a battle is running. Balanced remains the original
  // mobile default.
  'mobile-low': {
    label: 'Performance',
    msaaSamples: 0,
    maxPixelRatio: 0.9,
    adaptiveBasePixelRatio: 0.78,
    aoScale: 0,
    bloomScale: 0.35,
    shadowMapSizes: [768, 768, 512, 512],
    shadowMaxFar: 260,
    textureScale: 0.5,
    textureCap: 2048,
    dynMin: 0.55,
  },
  // MOBILE r1: the DEVICE tier for phones/tablets — never offered by the
  // settings picker (PRESET_ORDER below is unchanged) and never resolved on a
  // desktop-class device; resolvePresetName pins it whenever the device tier
  // is mobile. Sized against a ~192 MB GPU texture budget on a 3-4 GB-RAM
  // phone whose browser kills the tab near 1-1.5 GB total:
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
    label: 'Balanced',
    msaaSamples: 2,
    maxPixelRatio: 1.25,
    adaptiveBasePixelRatio: 1.0,
    aoScale: 0,
    bloomScale: 0.5,
    shadowMapSizes: [1024, 1024, 512, 512],
    shadowMaxFar: 300,
    textureScale: 0.5,
    textureCap: 2048,
    dynMin: 0.6,
  },
  'mobile-high': {
    label: 'Quality',
    msaaSamples: 2,
    maxPixelRatio: 1.35,
    adaptiveBasePixelRatio: 1.1,
    aoScale: 0,
    bloomScale: 0.55,
    shadowMapSizes: [1536, 1024, 768, 512],
    shadowMaxFar: 340,
    textureScale: 0.5,
    textureCap: 2048,
    dynMin: 0.65,
  },
};

export const PRESET_ORDER = ['low', 'medium', 'high', 'ultra'];
export const MOBILE_PRESET_ORDER = ['mobile-low', 'mobile', 'mobile-high'];

const listeners = new Set();

// ---------------------------------------------------------------------------
// ADAPTIVE AUTO TIER (perf-r2e, owner report: "someone with a weaker laptop
// didn't get the mobile version but it's still laggy"). 'auto' used to
// resolve to 'high' on EVERY desktop; the dynamic-resolution governor only
// engages on retina-class ratios, so a dpr-1 integrated-GPU laptop had no
// relief at all. Two inputs now pick the auto tier, and ONLY 'auto' adapts —
// an explicit stored preset choice always wins and clears any adaptation:
//  - boot heuristics: the unmasked GL renderer string (software rasterizers,
//    non-Arc Intel integrated, mobile-class parts under a desktop UA) plus
//    low deviceMemory seed a conservative starting tier;
//  - the live frame governor (post.js) calls reportSustainedOverload() when
//    the frame budget has been missed for several consecutive decision
//    windows with no resolution lever left — the auto tier steps down one
//    notch and persists, so the next session starts where this one settled.
// ---------------------------------------------------------------------------
const LS_AUTO_TIER = 'cot.gfxAutoTier';
const AUTO_ORDER = ['low', 'medium', 'high']; // ultra stays explicit opt-in
let _gpuRendererString = '';

/** Record the unmasked GL renderer string (createRenderer calls this once). */
export function noteGpuRenderer(str) {
  _gpuRendererString = String(str || '');
  try { console.info(`[quality] gpu: ${_gpuRendererString || '(masked)'}`); } catch (_) { /* ok */ }
}

/** Conservative hardware classification: null = no cap (full 'high'). */
function heuristicAutoCap() {
  const gpu = _gpuRendererString.toLowerCase();
  // software rasterizers: nothing rescues these — floor tier
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  // integrated / mobile-class parts under a desktop UA. Intel Arc and Iris
  // Xe MAX are dedicated-class and deliberately NOT matched.
  // ANGLE strings usually repeat the vendor and insert trademark/model
  // tokens (for example "Intel(R) Iris(TM) Plus Graphics" or "Iris Xe
  // Graphics"). The old adjacent-token regex missed both and started those
  // integrated laptops at High. Arc and Iris Xe MAX remain dedicated-class.
  const intelIntegrated = /intel/.test(gpu)
    && !/\b(?:arc|iris.*xe\s*max)\b/.test(gpu)
    && /\b(?:u?hd(?:\s+graphics)?|iris|graphics\s+[456]\d{2})\b/.test(gpu);
  const amdIntegrated = /(?:amd|radeon)/.test(gpu)
    && !/\bradeon\s+(?:rx|pro)\b/.test(gpu)
    && /\b(?:radeon(?:\(tm\))?\s+graphics|vega)\b/.test(gpu);
  if (intelIntegrated || amdIntegrated
    || /\b(mali|adreno|powervr|videocore)\b/.test(gpu)) return 'medium';
  let mem = null;
  let cores = null;
  try {
    mem = navigator.deviceMemory;
    cores = navigator.hardwareConcurrency;
  } catch (_) { /* unavailable */ }
  // Masked GPU strings are common. A small-memory/four-core desktop is much
  // more likely to be an older integrated machine than a modern discrete-GPU
  // box; begin at the safe floor and let the live governor restore headroom.
  // The choice is auto-only, so an explicit user preset still wins.
  if ((typeof cores === 'number' && cores <= 2)
    || (typeof mem === 'number' && mem <= 4
      && typeof cores === 'number' && cores <= 4)) return 'low';
  if ((typeof mem === 'number' && mem <= 4)
    || (typeof cores === 'number' && cores <= 4)) return 'medium';
  return null;
}

/** The persisted governor demotion ('medium'|'low'), if any. ?gfxreset clears. */
function storedAutoTier() {
  try {
    if (new URLSearchParams(window.location.search).has('gfxreset')) {
      window.localStorage.removeItem(LS_AUTO_TIER);
      return null;
    }
  } catch (_) { /* headless */ }
  try {
    const v = window.localStorage.getItem(LS_AUTO_TIER);
    return AUTO_ORDER.includes(v) ? v : null;
  } catch (_) { return null; }
}

/** Resolve what 'auto' means on this device right now. */
export function resolveAutoTier() {
  let tier = 'high';
  const cap = heuristicAutoCap();
  const stored = storedAutoTier();
  for (const t of [cap, stored]) {
    if (t && AUTO_ORDER.indexOf(t) < AUTO_ORDER.indexOf(tier)) tier = t;
  }
  return tier;
}

/**
 * The governor's escalation path: sustained frame-budget misses with no
 * resolution lever left. Steps the AUTO tier down one notch (high → medium
 * → low), persists it, and rebroadcasts the preset so every engine module
 * resizes live. No-op (returns false) when the user pinned an explicit
 * preset or the tier is already at the floor.
 * @returns {boolean} true if a tier step was applied
 */
export function reportSustainedOverload() {
  if (getDeviceTier() === 'mobile') return false;
  if (getStoredChoice() !== 'auto') return false;
  const cur = resolveAutoTier();
  const i = AUTO_ORDER.indexOf(cur);
  if (i <= 0) return false;
  const next = AUTO_ORDER[i - 1];
  try { window.localStorage.setItem(LS_AUTO_TIER, next); } catch (_) { /* ok */ }
  try {
    console.info(`[quality] sustained overload at '${cur}' with no headroom — auto tier now '${next}' (pick a preset in Settings to override; ?gfxreset clears)`);
  } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
  return true;
}

/** The user's stored choice: a preset name or 'auto' (default). */
export function getStoredChoice() {
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === 'auto' || PRESET_ORDER.includes(v)) return v;
  } catch (_) { /* storage blocked — fall through to auto */ }
  return 'auto';
}

/** Mobile-safe quick quality choice, separate from the desktop picker. */
export function getMobilePresetChoice() {
  try {
    if (!_mobileResetHandled) {
      _mobileResetHandled = true;
      if (new URLSearchParams(window.location.search).has('gfxreset')) {
        window.localStorage.removeItem(LS_MOBILE_KEY);
        return 'mobile';
      }
    }
    const v = window.localStorage.getItem(LS_MOBILE_KEY);
    if (MOBILE_PRESET_ORDER.includes(v)) return v;
  } catch (_) { /* storage blocked — balanced is the safe default */ }
  return 'mobile';
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
  if (getDeviceTier() === 'mobile') return getMobilePresetChoice();
  if (choice !== 'auto') return choice;
  // perf-r2e: 'auto' adapts to the hardware (see ADAPTIVE AUTO TIER above).
  return resolveAutoTier();
}

/** Apply one of the three mobile-safe live presets. */
export function setMobilePresetName(name) {
  if (!MOBILE_PRESET_ORDER.includes(name)) return;
  try { window.localStorage.setItem(LS_MOBILE_KEY, name); } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
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
  if (name !== 'auto' && !PRESET_ORDER.includes(name)) return;
  try { window.localStorage.setItem(LS_KEY, name); } catch (_) { /* ok */ }
  // perf-r2e: an explicit preset pick takes control back from the adaptive
  // auto tier — clear any persisted governor demotion so a later return to
  // 'auto' re-detects from scratch instead of resurrecting an old verdict.
  if (name !== 'auto') {
    try { window.localStorage.removeItem(LS_AUTO_TIER); } catch (_) { /* ok */ }
  }
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
