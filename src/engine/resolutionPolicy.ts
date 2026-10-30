/**
 * Output-resolution policy shared by the WebGL canvas, HUD canvases, and
 * Node regression tests. Scene/post resolution remains independently adaptive
 * in renderScalePolicy.ts; this module owns the final display backing store.
 */

const DESKTOP_OUTPUT_DPR_CAP = 2;
const MOBILE_OUTPUT_DPR_CAP = 3;
// Covers current DPR-3 phone viewports at native density (~3.0-3.8 MP) while
// preventing large tablets/foldables from silently allocating a 5-10 MP
// default framebuffer plus equally large reconstruction targets.
export const MOBILE_OUTPUT_PIXEL_BUDGET = 4_000_000;
// Bound very large Retina windows to 4K output instead of 16–33 MP buffers.
export const DESKTOP_OUTPUT_PIXEL_BUDGET = 8_294_400;
/**
 * (local-fps-265, 2026-10-29) The widest aspect the desktop budget serves whole. The 3D canvas of a wider window
 * (wideAspectBudget) gets the budget of the 16:9 window of the same height: a 32:9 window has twice a 16:9 window's
 * pixels at the same height and density, and every pass of the scene and its post chain scales with them. The owner's
 * 32:9 G95NC at "looks like 3840x1080" (DPR 2) backed its canvas at 5430x1527 (the 4K budget) and High's raster with it;
 * it now backs at 3840x1080 (4.1 MP, a native-density 32:9's), the browser scaling it to the panel. A 16:9 or 16:10
 * window, a 21:9 one up to the budget, and the HUD's canvases (uiPixelRatio) keep their density.
 */
export const WIDE_ASPECT_REFERENCE = 16 / 9;

type NumericInput = number | null | undefined;

interface OutputResolutionOptions {
  width?: NumericInput;
  height?: NumericInput;
  devicePixelRatio?: NumericInput;
  mobile?: boolean;
  mobilePixelBudget?: NumericInput;
  /** The 3D canvas: a desktop window wider than WIDE_ASPECT_REFERENCE gets that aspect's share of the budget. */
  wideAspectBudget?: boolean;
}

export interface OutputResolution {
  width: number;
  height: number;
  devicePixelRatio: number;
  pixelRatio: number;
  bufferWidth: number;
  bufferHeight: number;
  outputPixels: number;
  native: boolean;
  budgetLimited: boolean;
}

function finitePositive(value: NumericInput, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Resolve the final canvas ratio. Mobile earns native DPR up to a pixel cap. */
export function outputPixelRatio({
  width,
  height,
  devicePixelRatio = 1,
  mobile = false,
  mobilePixelBudget = MOBILE_OUTPUT_PIXEL_BUDGET,
  wideAspectBudget = false,
}: OutputResolutionOptions = {}): number {
  const dpr = finitePositive(devicePixelRatio, 1);
  const cap = mobile ? MOBILE_OUTPUT_DPR_CAP : DESKTOP_OUTPUT_DPR_CAP;
  const desired = Math.min(dpr, cap);
  const w = finitePositive(width, 1), h = finitePositive(height, 1);
  const area = Math.max(1, w * h);
  const budget = mobile ? finitePositive(mobilePixelBudget, MOBILE_OUTPUT_PIXEL_BUDGET) : desktopOutputBudget(w, h, wideAspectBudget);
  const budgetRatio = Math.sqrt(budget / area);
  return Math.min(desired, mobile ? Math.max(1, budgetRatio) : budgetRatio);
}

/** The desktop output budget of a `width` x `height` window: whole up to WIDE_ASPECT_REFERENCE, its share past it. */
export function desktopOutputBudget(width: number, height: number, wideAspectBudget = false): number {
  const aspect = width / height;
  if (!wideAspectBudget || !(aspect > WIDE_ASPECT_REFERENCE)) return DESKTOP_OUTPUT_PIXEL_BUDGET;
  return DESKTOP_OUTPUT_PIXEL_BUDGET * (WIDE_ASPECT_REFERENCE / aspect);
}

/** Full diagnostic record used by renderer.userData and browser QA. */
export function outputResolution(
  options: OutputResolutionOptions = {},
): OutputResolution {
  const width = Math.max(1, Math.round(finitePositive(options.width, 1)));
  const height = Math.max(1, Math.round(finitePositive(options.height, 1)));
  const devicePixelRatio = finitePositive(options.devicePixelRatio, 1);
  const pixelRatio = outputPixelRatio({ ...options, width, height, devicePixelRatio });
  const bufferWidth = Math.max(1, Math.round(width * pixelRatio));
  const bufferHeight = Math.max(1, Math.round(height * pixelRatio));
  return {
    width,
    height,
    devicePixelRatio,
    pixelRatio,
    bufferWidth,
    bufferHeight,
    outputPixels: bufferWidth * bufferHeight,
    // Near native-scale values,
    // IEEE-754 spacing cannot make a subtraction equal the non-dyadic 0.001
    // literal exactly, so < and <= have no observable input distinction.
    native: Math.abs(pixelRatio - devicePixelRatio) < 0.001,
    budgetLimited: pixelRatio + 0.001 < Math.min(devicePixelRatio, options.mobile ? MOBILE_OUTPUT_DPR_CAP : DESKTOP_OUTPUT_DPR_CAP),
  };
}

/** Small/full-screen HUD canvases follow the same phone-native density cap. */
export function uiPixelRatio(
  width: NumericInput,
  height: NumericInput,
  devicePixelRatio: NumericInput = typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  mobile = false,
): number {
  return outputPixelRatio({ width, height, devicePixelRatio, mobile });
}
