/**
 * Output-resolution policy shared by the WebGL canvas, HUD canvases, and
 * Node regression tests. Scene/post resolution remains independently adaptive
 * in renderScalePolicy.ts; this module owns the final display backing store.
 */

export const DESKTOP_OUTPUT_DPR_CAP = 2;
export const MOBILE_OUTPUT_DPR_CAP = 3;
// Covers current DPR-3 phone viewports at native density (~3.0-3.8 MP) while
// preventing large tablets/foldables from silently allocating a 5-10 MP
// default framebuffer plus equally large reconstruction targets.
export const MOBILE_OUTPUT_PIXEL_BUDGET = 4_000_000;

type NumericInput = number | null | undefined;

export interface OutputResolutionOptions {
  width?: NumericInput;
  height?: NumericInput;
  devicePixelRatio?: NumericInput;
  mobile?: boolean;
  mobilePixelBudget?: NumericInput;
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
}: OutputResolutionOptions = {}): number {
  const dpr = finitePositive(devicePixelRatio, 1);
  const cap = mobile ? MOBILE_OUTPUT_DPR_CAP : DESKTOP_OUTPUT_DPR_CAP;
  const desired = Math.min(dpr, cap);
  if (!mobile) return desired;
  const area = Math.max(1, finitePositive(width, 1) * finitePositive(height, 1));
  const budgetRatio = Math.sqrt(finitePositive(mobilePixelBudget, MOBILE_OUTPUT_PIXEL_BUDGET) / area);
  return Math.min(desired, Math.max(1, budgetRatio));
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
    // Stryker disable next-line EqualityOperator: near native-scale values,
    // IEEE-754 spacing cannot make a subtraction equal the non-dyadic 0.001
    // literal exactly, so < and <= have no observable input distinction.
    native: Math.abs(pixelRatio - devicePixelRatio) < 0.001,
    budgetLimited: !!options.mobile && pixelRatio + 0.001 < Math.min(devicePixelRatio, MOBILE_OUTPUT_DPR_CAP),
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
