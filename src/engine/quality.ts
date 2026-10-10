/**
 * quality.ts — graphics quality presets (performance budget owner).
 *
 * The perf budget (>=60 fps median / >=45 fps p5 at 1080p) must hold at the
 * DEFAULT settings on a retina display (devicePixelRatio 2), where the
 * composer's High 1.5 pixel ratio rasterizes 2.25x the pixels of a 1080p@dpr1
 * frame through the full HDR post chain. Measured on this class of GPU that
 * requires scaled bloom and adaptive raster relief to stay inside the budget.
 * (native-output r1: the renderer CANVAS may back at mobile DPR 3 under the
 * output-pixel budget — see resolutionPolicy.ts — but only the final
 * reconstruction pass rasterizes there; every cap below still governs the
 * expensive composer chain.)
 *
 * Fix = an explicit quality ladder, auto-selected by devicePixelRatio and
 * user-overridable (persisted in localStorage; the settings UI writes through
 * `setPresetName`). GPU-cost levers live here as DATA; the engine modules
 * (post.ts, lighting.ts) read them and subscribe to live changes:
 *
 * - `maxPixelRatio` — cap on the EffectComposer's internal pixel ratio
 *   (AAA "render scale"): the 3D scene + post chain render at the capped
 *   resolution and the final FSR1 pass reconstructs to the native canvas.
 *   DOM/canvas HUD stays native-crisp. At dpr1 the renderer pixel ratio is
 *   1.0, below every cap, so dpr-1 output is UNCHANGED on every preset >= medium
 *   (the screenshot contract shots are bit-identical on auto/ultra/high).
 * - `aoScale` — GTAO buffer scale relative to composer resolution (0 = off).
 *   Gameplay presets keep this off: temporal screen-space AO produced visible
 *   grain and boil on foliage, snow, and moving shadow receivers. Material AO,
 *   CSM, and authored contact detail provide stable depth instead.
 * - `bloomScale` — UnrealBloom internal chain scale (its mip chain is already
 *   input/2, so 0.5 runs it at quarter res; composite stays full-res).
 * - `msaaSamples` — geometry-edge samples on the scene-only HDR target. The
 *   resolve happens before post processing, so fullscreen AO/bloom/grade/SMAA
 *   passes stay single-sampled. SMAA then cleans shader/specular edges after
 *   tone mapping without making every post pass pay the MSAA bandwidth cost.
 * - `shadowMapSizes` — per-cascade CSM shadow map resolutions (lighting.ts).
 *
 * Preset semantics (resolution numbers are the EFFECTIVE internal 3D/post
 * pixel ratio, independent of the final display canvas density):
 * Desktop presets share one shadow footprint and range. Quality changes alter
 * raster density, antialiasing, and bloom only; they never swap the lighting
 * model underneath a running battle.
 */
import type { WebGLRenderer } from 'three';

type DeviceTier = 'mobile' | 'desktop';
type DesktopPresetName = 'low' | 'medium' | 'high' | 'ultra';
type MobilePresetName = 'mobile-low' | 'mobile' | 'mobile-high';
export type PresetName = DesktopPresetName | MobilePresetName;
type PresetChoice = 'auto' | DesktopPresetName;

export interface QualityPreset {
  readonly label: string;
  readonly msaaSamples: number;
  /**
   * Temporal anti-aliasing (2026-09-12): sub-pixel jitter + reprojected history
   * on the HDR scene buffer. Settles foliage, ground relief and shadow dapple
   * that MSAA/SMAA cannot; one resolve + one copy at internal resolution.
   * Absent means off (mobile presets, Low).
   */
  readonly taa?: boolean;
  /**
   * Round 69 (2026-09-24): the desktop light effects, each its own lever (postLightFxPolicy.ts resolves them with
   * the device tier and the `?fx=` query): screen-space contact shadows and sun shafts / lens flare in post.ts,
   * ground bounce in lighting.ts. Absent means off (the mobile presets and Low).
   */
  readonly contactShadows?: boolean;
  readonly groundBounce?: boolean;
  readonly sunShafts?: boolean;
  readonly lensFlare?: boolean;
  /**
   * Owner 2026-10-02: cavity occlusion on vehicle pixels only (vehicleOcclusion.ts, in the aerial pass) — the shaded
   * side of a hull keeps its bustle, skirt and wheel-bay depth while scene-wide GTAO stays off. Absent means off.
   */
  readonly vehicleOcclusion?: boolean;
  /**
   * 2026-10-10 (the shadows lane, overhaul r3): contact-hardening soft shadows on the nearest cascade
   * (contactHardeningShadows.ts). Absent means three's five-tap PCF (Low, the phones).
   */
  readonly pcss?: boolean;
  /**
   * Round 73 (2026-09-25): the tall-grass tier's density scale (world/tallGrass.ts) — 1 the full sward, Low a
   * quarter, Medium half; absent means no tier (the mobile presets keep today's ground). Read live per cell build.
   */
  readonly tallGrass?: number;
  readonly maxPixelRatio: number;
  readonly adaptiveBasePixelRatio?: number;
  readonly dynMin: number;
  /**
   * 2026-10-02 (the frame-budget lane): the governor's floor on displays below the retina threshold
   * (renderScalePolicy.RETINA_PIXEL_RATIO). Absent keeps the native fence (never below 1 CSS pixel per axis).
   */
  readonly nativeDynMin?: number;
  readonly aoScale: number;
  readonly bloomScale: number;
  readonly shadowMapSizes: readonly [number, number, number, number];
  readonly shadowMaxFar: number;
  /**
   * 2026-10-09 (the shadows lane, overhaul r2): the cascades' explicit breaks, metres from the camera, one fewer than the
   * cascades (shadowCascadeLayout.ts). Absent: three's practical split over shadowMaxFar.
   */
  readonly shadowBreaksM?: readonly number[];
  readonly textureScale?: number;
  readonly vehicleTextureScale?: number;
  readonly textureCap?: number;
}

/**
 * Stable desktop CSM contract. Updating all four modest maps every presented
 * battle frame costs approximately the same shadow fill as the former 2K
 * near + 20 Hz far scheme, but removes the mixed-timestamp tree/building
 * flashes and keeps quality switching visually continuous.
 */
export const DESKTOP_SHADOW_MAP_SIZES = [2048, 2048, 1024, 1024] as const;

type AutoTier = 'low' | 'medium' | 'high';
type PresetListener = (preset: QualityPreset) => void;
type DeviceNavigator = Navigator & { deviceMemory?: number };

const LS_KEY = 'cot.gfxPreset';
const LS_MOBILE_KEY = 'cot.gfxMobilePreset';
let _graphicsResetHandled = false;

/** Explicit repair link: reset graphics only, retaining progression and controls. */
function resetSavedGraphicsIfRequested(): void {
  if (_graphicsResetHandled) return;
  _graphicsResetHandled = true;
  try {
    if (!new URLSearchParams(window.location.search).has('gfxreset')) return;
    window.localStorage.removeItem(LS_KEY);
    window.localStorage.removeItem(LS_MOBILE_KEY);
    window.localStorage.removeItem(LS_AUTO_TIER);
    clearGraphicsRecovery();
  } catch { /* blocked storage still uses the normal safe defaults */ }
}

// ---------------------------------------------------------------------------
// MOBILE r1: DEVICE TIER (mobile/tablet vs desktop), resolved ONCE at boot by
// createRenderer (renderer.ts) and overridable via ?tier=mobile|desktop for
// testing. Phones were bricking on the deployed build because 'auto' resolved
// to the 'high' DESKTOP preset everywhere: ~0.5 GB of GPU textures (full GLB
// roster + hero-grade canvas bakes) + 4096² shadow cascades on devices whose
// browsers OOM-kill a tab well below that. The mobile tier is a real preset
// on the same ladder (data, not scattered if-statements): every engine module
// that already reads the preset (post.ts, lighting.ts) picks it up, and the
// texture levers below (textureScale/textureCap) are consumed by the texture
// creation sites (materials.js and world bakers).
//
// Detection inputs (cheap, boot-safe): UA/touch class, gl MAX_TEXTURE_SIZE
// (a 4096 cap identifies constrained GPUs even under desktop UAs), and
// navigator.deviceMemory where available. iPadOS 13+ masquerades as
// Macintosh — its touch points give it away.
// ---------------------------------------------------------------------------
let _deviceTier: DeviceTier | null = null; // resolved once
let _glMaxTexSize = 16384;   // renderer capability, captured at resolve time

function captureTextureCapability(renderer?: WebGLRenderer): void {
  try {
    const maxTextureSize = renderer?.capabilities?.maxTextureSize;
    if (maxTextureSize) _glMaxTexSize = maxTextureSize;
  } catch (_) { /* capability probe only */ }
}

function requestedDeviceTier(): DeviceTier | null {
  try {
    const requested = new URLSearchParams(window.location.search).get('tier');
    return requested === 'mobile' || requested === 'desktop' ? requested : null;
  } catch (_) {
    return null;
  }
}

function isConstrainedDevice(): boolean {
  try {
    const nav = navigator as DeviceNavigator;
    const userAgent = nav.userAgent || '';
    const touchPoints = nav.maxTouchPoints || 0;
    const mobileUserAgent = /Android|iPhone|iPad|iPod|Windows Phone|Mobile|Silk/i
      .test(userAgent);
    const desktopIpad = /Macintosh/.test(userAgent) && touchPoints > 1;
    const tightGpu = _glMaxTexSize <= 4096;
    const smallMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
    const coarsePointer = typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    return mobileUserAgent || desktopIpad || tightGpu || (coarsePointer && smallMemory);
  } catch (_) {
    return false;
  }
}

function publishDeviceTier(tier: DeviceTier): void {
  try {
    console.info(`[quality] device tier: ${tier} (maxTex ${_glMaxTexSize})`);
  } catch (_) { /* consoleless env */ }
}

/**
 * Resolve the device tier once. Called by createRenderer immediately after
 * WebGLRenderer construction — before any preset consumer (post/lighting/
 * material bakes) reads the ladder.
 * @param {THREE.WebGLRenderer} [renderer] capability source (maxTextureSize)
 * @returns {'mobile'|'desktop'}
 */
export function resolveDeviceTier(renderer?: WebGLRenderer): DeviceTier {
  if (_deviceTier) return _deviceTier;
  captureTextureCapability(renderer);
  const requestedTier = requestedDeviceTier();
  _deviceTier = requestedTier ?? (isConstrainedDevice() ? 'mobile' : 'desktop');
  publishDeviceTier(_deviceTier);
  return _deviceTier;
}

/** @returns {'mobile'|'desktop'} resolved tier ('desktop' until resolved) */
export function getDeviceTier(): DeviceTier { return _deviceTier || 'desktop'; }

// A reset is stronger evidence than a frame-rate dip. Keep the relief through
// a same-tab reload, without overwriting the player's saved quality choice.
const RECOVERY_KEY = 'cot.graphicsRecovery.v1';
let recoveryPreset: PresetName | null | undefined;
function graphicsRecoveryPreset(): PresetName | null {
  if (recoveryPreset !== undefined) return recoveryPreset;
  let saved: string | null = null;
  try {
    saved = window.sessionStorage.getItem(RECOVERY_KEY);
  } catch { /* session-only fallback */ }
  recoveryPreset = saved && Object.prototype.hasOwnProperty.call(PRESETS, saved) ? saved as PresetName : null;
  return recoveryPreset;
}
function clearGraphicsRecovery(): void {
  recoveryPreset = null;
  try { window.sessionStorage.removeItem(RECOVERY_KEY); } catch { /* storage unavailable */ }
}
export function noteGraphicsContextLoss(): void {
  const current = resolvePresetName();
  const ladder: readonly PresetName[] = getDeviceTier() === 'mobile' ? MOBILE_PRESET_ORDER : PRESET_ORDER;
  recoveryPreset = ladder[Math.max(0, ladder.indexOf(current) - 1)];
  try { window.sessionStorage.setItem(RECOVERY_KEY, recoveryPreset); } catch { /* retain in memory */ }
}
/** Apply relief only once the context is usable; loss handlers must not upload. */
export function applyGraphicsRecovery(): void {
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
}

/**
 * Detached phase roots have no draw cost, so normal desktops retain their GPU
 * allocations for fast transitions. Phones, tablets, and low-memory desktops
 * release them to stay within the browser's smaller graphics-memory budget.
 */
export function shouldReleaseInactivePhaseGpu(): boolean {
  if (getDeviceTier() === 'mobile' || graphicsRecoveryPreset()) return true;
  try {
    const memoryGb = (navigator as DeviceNavigator).deviceMemory;
    return typeof memoryGb === 'number' && Number.isFinite(memoryGb) && memoryGb <= 4;
  } catch (_) {
    return false;
  }
}

/**
 * CENTRAL texture-resolution lever. Texture/canvas creation sites pass their
 * authored dimension through this: desktop tiers return it unchanged; the
 * mobile tier scales it (textureScale) and clamps to both the tier cap and
 * the live gl MAX_TEXTURE_SIZE so no texture can exceed the device.
 * @param {number} px authored texture dimension
 * @returns {number} dimension to allocate on the active tier
 */
export function texSize(px: number, textureClass: 'world' | 'vehicle' = 'world'): number {
  const p = getPreset();
  const scale = textureClass === 'vehicle'
    ? (p.vehicleTextureScale || p.textureScale || 1)
    : (p.textureScale || 1);
  const scaled = px * scale;
  return Math.max(1, Math.round(Math.min(scaled, p.textureCap || Infinity, _glMaxTexSize)));
}

export const PRESETS: Readonly<Record<PresetName, QualityPreset>> = {
  ultra: {
    label: 'Ultra',
    msaaSamples: 4,
    // 2026-09-14 (owner: 1049e4e "looks a lot better … on low graphics too"): temporal AA is off by
    // default on every desktop tier. The tree-shadow flashing it was added for (2026-09-12) was the
    // shadow-cull upload bug, fixed at the root in r8; what TAA leaves behind is a pixel-footprint
    // box filter that halves ground and foliage micro-contrast against the reference at identical
    // poses (verdant gradient 13.3 with TAA vs 21.7 without, reference 20.8). Drive-mode flicker (production, 110 frames): per-pixel blip rate 2.57 with TAA, 3.29 without — the reference's own foliage shimmer, no shadow flashing (r8).
    // The pass, its RCAS floor and receipts stay in place: set taa: true on a preset to re-enable it.
    taa: false,
    contactShadows: true, groundBounce: true, sunShafts: true, lensFlare: true, // round 69 (2026-09-24)
    vehicleOcclusion: true, // owner 2026-10-02: vehicle-only cavity occlusion (vehicleOcclusion.ts)
    pcss: true, // 2026-10-10 (overhaul r3): contact-hardening shadows on the nearest cascade
    tallGrass: 1.0, // round 73 (2026-09-25): the full sward
    maxPixelRatio: 2.0,
    // Native DPR-2 is the explicit Ultra promise. Under sustained overload it
    // may fall to 1.5 — still the complete High raster, never below it.
    dynMin: 0.75,
    // Owner preference (2026-09-28): the clean AO-free presentation on every
    // tier. Cascaded sun shadows and screen-space contact shadows retain
    // grounding without the speckled GTAO crevice wash or its frame cost.
    aoScale: 0,
    bloomScale: 1.0,
    shadowMapSizes: [4096, 4096, 4096, 2048], // 2026-09-12: the 1049e4e 4K mid cascade is back (2K read soft at 100-330 m)
    shadowMaxFar: 700,
    // 2026-10-09 (overhaul r2): the first cascade over the chase camera's ground (shadowCascadeLayout.ts): 1.7 cm a texel
    // to 28 m (5.2 cm under the practical split's 89 m first break)
    shadowBreaksM: [28, 110, 320],
  },
  // High now starts at the full 1.5 ratio on Retina panels. Fine geometry
  // reaches SMAA before the smaller native-canvas upscale instead of being
  // rasterized at 1.25 (or the old 1.125 floor) and enlarged into watercolor.
  // Only persistent pressure may lower raster density, with 0.9 keeping the
  // effective floor at 1.35. AO stays off even when the governor recovers.
  // perf-120 r2: default High no longer pays for scene MSAA before its
  // already-enabled high-preset display-space SMAA + FSR reconstruction.
  // The real 14-tank player-entry probe isolated 2x scene MSAA as a 40 FPS
  // cost at native 1080p (116 -> 156 median) while the final SMAA still owns
  // geometry, foliage and hot-specular edge cleanup. This also avoids mixing
  // a multisample resolve with the post sharpen, which could make fine edges
  // read soft. Ultra remains the explicit 4x inspection tier.
  high: {
    label: 'High',
    msaaSamples: 0,
    taa: false, // 2026-09-14: off by default, see the Ultra note
    contactShadows: true, groundBounce: true, sunShafts: true, lensFlare: true, // round 69 (2026-09-24)
    vehicleOcclusion: true, // owner 2026-10-02: vehicle-only cavity occlusion (vehicleOcclusion.ts)
    pcss: true, // 2026-10-10 (overhaul r3): contact-hardening shadows on the nearest cascade
    tallGrass: 1.0, // round 73 (2026-09-25): the full sward
    maxPixelRatio: 1.5,
    adaptiveBasePixelRatio: 1.5,
    dynMin: 0.9,
    // 2026-10-02 (owner: "60 fps desktop"; the frame-budget lane): a 1080p laptop at 100-150 % scaling renders High
    // at its native density with nothing above it to give up, so under load the governor may lower the raster to
    // two thirds per axis there — FSR1's quality ratio, reconstructed by EASU + RCAS to the native canvas — and
    // raise it again only when the measured GPU time predicts room (adaptiveQualityPolicy.ts). Retina keeps 0.9.
    nativeDynMin: 0.67,
    aoScale: 0,
    bloomScale: 0.6,
    shadowMapSizes: [2048, 2048, 2048, 1024],
    shadowMaxFar: 700,
    // 2026-10-09 (overhaul r2): 3.4 cm a texel to 28 m, where the practical split gave 10.4 (shadowCascadeLayout.ts)
    shadowBreaksM: [28, 110, 320],
  },
  medium: {
    label: 'Medium',
    msaaSamples: 0,
    taa: false, // 2026-09-14: off by default, see the Ultra note
    contactShadows: true, groundBounce: true, sunShafts: true, lensFlare: true, // round 69 (2026-09-24)
    vehicleOcclusion: true, // owner 2026-10-02: vehicle-only cavity occlusion (vehicleOcclusion.ts)
    pcss: true, // 2026-10-10 (overhaul r3): contact-hardening shadows on the nearest cascade
    tallGrass: 0.5, // round 73 (2026-09-25): half the sward
    maxPixelRatio: 1.0,
    // Medium/Low already shed AA, AO and shadow cost. Do not multiply that
    // fallback by another hidden 0.75 dynamic scale: desktop readability
    // remains at least one internal sample per CSS pixel.
    dynMin: 1.0,
    aoScale: 0,
    bloomScale: 0.5,
    shadowMapSizes: DESKTOP_SHADOW_MAP_SIZES,
    shadowMaxFar: 520, // 2026-09-12: reference texel density; 600 m spread the same 2K/1K maps thinner
  },
  low: {
    label: 'Low',
    msaaSamples: 0,
    tallGrass: 0.25, // round 73 (2026-09-25): a quarter of the sward
    maxPixelRatio: 1.0,
    dynMin: 1.0,
    aoScale: 0,
    bloomScale: 0.5,
    // Concentrate the same shadow texels into the older Low range. This keeps
    // nearby vehicles, trees and buildings crisp while the higher tiers retain
    // the current 520 m coverage.
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
    // Never raster below one 3D sample per CSS pixel. The final DPR-3 output
    // is reconstructed separately; sub-CSS input was the blocky failure mode.
    maxPixelRatio: 1.0,
    adaptiveBasePixelRatio: 1.0,
    aoScale: 0,
    bloomScale: 0.35,
    shadowMapSizes: [768, 768, 512, 512],
    shadowMaxFar: 260,
    textureScale: 0.5,
    vehicleTextureScale: 0.75,
    textureCap: 2048,
    dynMin: 1.0,
  },
  // MOBILE r1: the DEVICE tier for phones/tablets — never offered by the
  // settings picker (PRESET_ORDER below is unchanged) and never resolved on a
  // desktop-class device; resolvePresetName pins it whenever the device tier
  // is mobile. Sized against a ~192 MB GPU texture budget on a 3-4 GB-RAM
  // phone whose browser kills the tab near 1-1.5 GB total:
  // - textureScale 0.5 / textureCap 2048 — world layers and distant AI
  //   allocate at half their authored dimensions. Close player/preview
  //   vehicles use vehicleTextureScale 0.75 so their markings and material
  //   breakup survive a phone screen; nothing may exceed 2048 (or the live GL
  //   cap) in either dimension.
  // - 1024/512 shadow cascades + 300 m range — the desktop 'high' cascades
  //   (2x 4096² + 2x 2048² ≈ 170 MB of RTs) were a third of the whole mobile
  //   budget; lighting.ts' penumbra compensation keeps softness constant.
  // - composer starts at 1.25x CSS pixels and may earn 1.4x, scene MSAA off,
  //   AO off, half bloom chain, and a >1 CSS-pixel governor floor. The final
  //   display-space SMAA still owns edge cleanup; avoiding the multisampled
  //   half-float scene target saves both bandwidth and a meaningful block of
  //   graphics memory on the devices most likely to lose their context.
  mobile: {
    label: 'Balanced',
    msaaSamples: 0,
    maxPixelRatio: 1.4,
    adaptiveBasePixelRatio: 1.25,
    aoScale: 0,
    bloomScale: 0.5,
    shadowMapSizes: [1024, 768, 512, 512],
    shadowMaxFar: 300,
    textureScale: 0.5,
    // Vehicle quality already has high/preview/AI tiers. Applying the generic
    // 0.5 world scale again reduced the player's close preview to 512 px.
    // materials.js applies this gentler scale only to preview/high subjects;
    // distant AI stays compact so battle entry and residency remain bounded.
    vehicleTextureScale: 0.75,
    textureCap: 2048,
    dynMin: 0.715,
  },
  'mobile-high': {
    label: 'Quality',
    msaaSamples: 2,
    maxPixelRatio: 1.7,
    adaptiveBasePixelRatio: 1.5,
    aoScale: 0,
    bloomScale: 0.55,
    shadowMapSizes: [1536, 1024, 768, 512],
    shadowMaxFar: 340,
    textureScale: 0.5,
    vehicleTextureScale: 0.75,
    textureCap: 2048,
    dynMin: 0.75,
  },
};

export const PRESET_ORDER: readonly DesktopPresetName[] = ['low', 'medium', 'high', 'ultra'];
export const MOBILE_PRESET_ORDER: readonly MobilePresetName[] = ['mobile-low', 'mobile', 'mobile-high'];

const listeners = new Set<PresetListener>();

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
//  - the live frame governor (post.ts) calls reportSustainedOverload() when
//    the frame budget has been missed for several consecutive decision
//    windows with no resolution lever left — the auto tier steps down one
//    notch for this session. Stable boot heuristics re-evaluate every visit;
//    transient background load or thermal pressure must not pin a capable
//    machine to Low indefinitely.
// ---------------------------------------------------------------------------
const LS_AUTO_TIER = 'cot.gfxAutoTier';
const LS_AUTO_POLICY = 'cot.gfxAutoTierPolicy';
const AUTO_POLICY_VERSION = 'session-r3';
const AUTO_ORDER: readonly AutoTier[] = ['low', 'medium', 'high']; // ultra stays explicit opt-in
let _gpuRendererString = '';
let _autoPolicyHandled = false;
let _sessionAutoTier: AutoTier | null = null;

/** Record the unmasked GL renderer string (createRenderer calls this once). */
export function noteGpuRenderer(str: string): void {
  _gpuRendererString = String(str || '');
  try { console.info(`[quality] gpu: ${_gpuRendererString || '(masked)'}`); } catch (_) { /* ok */ }
}

/** Conservative hardware classification: null = no cap (full 'high'). */
function heuristicAutoCap(): AutoTier | null {
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
  // 2026-10-02 (the frame-budget lane): the RDNA iGPUs name their model ("AMD Radeon 780M Graphics", "Radeon(TM)
  // 680M", 760M / 880M / 890M) and slipped past the generic "Radeon(TM) Graphics" pattern into High; a 780M is about
  // an eighth of the M5 Max the frame budget is measured on (3DMark Wild Life Extreme 4,945 vs 39,389), a third of an
  // RTX 4050 Laptop. Strix Halo's 8060S / 8050S ("S", a 4060-class part) and the RX / Pro dGPUs stay uncapped.
  const amdIntegrated = /(?:amd|radeon)/.test(gpu)
    && !/\bradeon\s+(?:rx|pro)\b/.test(gpu)
    && /\b(?:radeon(?:\(tm\))?\s+(?:graphics|\d{3}m)|vega)\b/.test(gpu);
  // Meteor Lake's "Intel(R) Arc(TM) Graphics" and Lunar Lake's "Arc(TM) 140V / 130V" are integrated (780M class);
  // the Arc dGPUs carry an A / B model ("Arc(TM) A770", "B580") and stay uncapped.
  const intelArcIntegrated = /intel/.test(gpu) && /\barc(?:\(tm\))?\s+(?:graphics|1\d0[vt])\b/.test(gpu);
  if (intelIntegrated || amdIntegrated || intelArcIntegrated
    || /\b(mali|adreno|powervr|videocore)\b/.test(gpu)) return 'medium';
  let mem: number | null | undefined = null;
  let cores: number | null | undefined = null;
  try {
    mem = (navigator as DeviceNavigator).deviceMemory;
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

/** Remove verdicts written by the old cross-session governor policy. */
function clearLegacyAutoTier(): void {
  if (_autoPolicyHandled) return;
  _autoPolicyHandled = true;
  try {
    window.localStorage.removeItem(LS_AUTO_TIER);
    window.localStorage.setItem(LS_AUTO_POLICY, AUTO_POLICY_VERSION);
  } catch (_) { /* headless */ }
}

/** Resolve what 'auto' means on this device right now. */
export function resolveAutoTier(): AutoTier {
  clearLegacyAutoTier();
  let tier: AutoTier = 'high';
  const cap = heuristicAutoCap();
  for (const t of [cap, _sessionAutoTier]) {
    if (t && AUTO_ORDER.indexOf(t) < AUTO_ORDER.indexOf(tier)) tier = t;
  }
  return tier;
}

/**
 * The governor's escalation path: sustained frame-budget misses with no
 * resolution lever left. Steps the AUTO tier down one notch (high → medium
 * → low) for this session and rebroadcasts the preset so every engine module
 * resizes live. No-op (returns false) when the user pinned an explicit
 * preset or the tier is already at the floor.
 * @returns {boolean} true if a tier step was applied
 */
export function reportSustainedOverload(): boolean {
  if (getDeviceTier() === 'mobile') return false;
  if (getStoredChoice() !== 'auto') return false;
  const cur = resolveAutoTier();
  const i = AUTO_ORDER.indexOf(cur);
  if (i <= 0) return false;
  const next = AUTO_ORDER[i - 1];
  if (!next) return false;
  _sessionAutoTier = next;
  try {
    console.info(`[quality] sustained overload at '${cur}' with no headroom — auto tier now '${next}' (pick a preset in Settings to override; ?gfxreset clears)`);
  } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
  return true;
}

/** Whether measured stability can restore one auto tier without exceeding the hardware cap. */
export function canRecoverAutoTier(): boolean {
  if (getDeviceTier() === 'mobile' || getStoredChoice() !== 'auto') return false;
  const currentIndex = AUTO_ORDER.indexOf(resolveAutoTier());
  const ceilingIndex = AUTO_ORDER.indexOf(heuristicAutoCap() ?? 'high');
  return currentIndex >= 0 && currentIndex < ceilingIndex;
}

/**
 * Reverse one session-only overload demotion after prolonged stable evidence.
 * Hardware heuristics remain a ceiling, and explicit user choices remain
 * authoritative.
 */
export function reportSustainedRecovery(): boolean {
  if (!canRecoverAutoTier()) return false;
  const current = resolveAutoTier();
  const next = AUTO_ORDER[AUTO_ORDER.indexOf(current) + 1];
  if (!next) return false;
  _sessionAutoTier = next;
  try {
    console.info(`[quality] sustained stability at '${current}' — auto tier restored to '${next}'`);
  } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
  return true;
}

/** The user's stored choice: a preset name or 'auto' (default). */
export function getStoredChoice(): PresetChoice {
  resetSavedGraphicsIfRequested();
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === 'auto' || v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') return v;
  } catch (_) { /* storage blocked — fall through to auto */ }
  return 'auto';
}

/** Mobile-safe quick quality choice, separate from the desktop picker. */
export function getMobilePresetChoice(): MobilePresetName {
  resetSavedGraphicsIfRequested();
  try {
    const v = window.localStorage.getItem(LS_MOBILE_KEY);
    if (v === 'mobile-low' || v === 'mobile' || v === 'mobile-high') return v;
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
 * 27 ms (gate 25) with every other line passing. High keeps the scaled bloom
 * workload and lets its dynamic raster ratio absorb scheduling/GPU pressure
 * instead
 * of permanently presenting every Retina player with a 1.0x upscaled scene.
 */
export function resolvePresetName(choice: PresetChoice = getStoredChoice()): PresetName {
  // MOBILE r1: the device tier OWNS the ladder on phones/tablets. A stored
  // desktop choice (or a tap on the settings picker) must never re-enable the
  // desktop texture/shadow footprint on a device that OOMs under it — that is
  // exactly the deployed-build brick this tier exists to fix. ?tier=desktop
  // remains the explicit test/escape hatch (resolveDeviceTier).
  const mobile = getDeviceTier() === 'mobile';
  const desired = mobile ? getMobilePresetChoice() : choice === 'auto' ? resolveAutoTier() : choice;
  const recovery = graphicsRecoveryPreset();
  const ladder: readonly PresetName[] = mobile ? MOBILE_PRESET_ORDER : PRESET_ORDER;
  return recovery && ladder.includes(recovery) && ladder.indexOf(recovery) < ladder.indexOf(desired)
    ? recovery : desired;
}

/** Apply one of the three mobile-safe live presets. */
export function setMobilePresetName(name: string): void {
  if (name !== 'mobile-low' && name !== 'mobile' && name !== 'mobile-high') return;
  clearGraphicsRecovery();
  try { window.localStorage.setItem(LS_MOBILE_KEY, name); } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
}

/** @returns {typeof PRESETS[keyof typeof PRESETS]} the active preset object */
export function getPreset(): QualityPreset {
  return PRESETS[resolvePresetName()];
}

/**
 * Store a new choice ('auto' or a preset name) and notify subscribers
 * (post.ts resizes the composer chain, lighting.ts reallocates shadow maps).
 * The settings UI is the intended caller.
 * @param {string} name - 'auto' | 'low' | 'medium' | 'high' | 'ultra'
 * @returns {void}
 */
export function setPresetName(name: string): void {
  if (name !== 'auto' && name !== 'low' && name !== 'medium'
    && name !== 'high' && name !== 'ultra') return;
  clearGraphicsRecovery();
  try { window.localStorage.setItem(LS_KEY, name); } catch (_) { /* ok */ }
  // Every user choice starts a fresh auto-policy session. Explicit presets
  // take control immediately; choosing Auto asks the hardware classifier and
  // live governor to re-evaluate instead of resurrecting an earlier dip.
  _sessionAutoTier = null;
  try { window.localStorage.removeItem(LS_AUTO_TIER); } catch (_) { /* ok */ }
  const preset = getPreset();
  for (const fn of listeners) fn(preset);
}

/**
 * Subscribe to live preset changes. Returns an unsubscribe function.
 * @param {(preset: object) => void} fn
 * @returns {() => void}
 */
export function onPresetChange(fn: PresetListener): () => boolean {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
