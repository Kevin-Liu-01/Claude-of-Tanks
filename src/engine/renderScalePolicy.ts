/**
 * Pure render-scale policy shared by the post stack and its Node self-test.
 * Ratios are expressed relative to CSS pixels; the renderer ratio is the
 * native canvas density and the preset cap is the maximum 3D/post density.
 */

const DEFAULT_DYNAMIC_MIN = 0.75;

export interface RenderScalePreset {
  maxPixelRatio?: unknown;
  adaptiveBasePixelRatio?: unknown;
  dynMin?: number;
}

export type OverloadReliefLever = 'trim' | 'resolution' | 'tier';
export type ReconstructionMode = 'linear' | 'easu' | 'easu+rcas' | 'native-rcas';

export function cappedPixelRatio(
  rendererPixelRatio: number,
  preset: RenderScalePreset | null | undefined,
): number {
  const rendererRatio = Math.max(0.01, Number(rendererPixelRatio) || 1);
  const presetCap = Math.max(0.01, Number(preset?.maxPixelRatio) || rendererRatio);
  return Math.min(rendererRatio, presetCap);
}

/** Initial dynamic scale. A preset may start below its ceiling and earn it. */
export function baseDynamicScale(
  rendererPixelRatio: number,
  preset: RenderScalePreset | null | undefined,
): number {
  const capped = cappedPixelRatio(rendererPixelRatio, preset);
  const requested = Number(preset?.adaptiveBasePixelRatio) || capped;
  const base = Math.min(capped, Math.max(0.01, requested));
  return base / capped;
}

/** Lowest legal dynamic scale for the active preset/device class. */
export function dynamicScaleFloor(
  rendererPixelRatio: number,
  preset: RenderScalePreset | null | undefined,
): number {
  const configured = typeof preset?.dynMin === 'number' && Number.isFinite(preset.dynMin)
    ? preset.dynMin : DEFAULT_DYNAMIC_MIN;
  // A native-density desktop canvas must not be blurred below 1 CSS pixel per
  // axis. Retina/mobile presets carry their own explicit floor.
  return Math.min(1, Math.max(
    rendererPixelRatio < 1.25 ? 1 : 0,
    configured,
  ));
}

export function internalPixelRatio(
  rendererPixelRatio: number,
  preset: RenderScalePreset | null | undefined,
  dynamicScale: number,
): number {
  return cappedPixelRatio(rendererPixelRatio, preset)
    * Math.min(1, Math.max(dynamicScaleFloor(rendererPixelRatio, preset), dynamicScale));
}

/** Expensive shading is sacrificed before structural screen resolution. */
export function overloadReliefLever(
  performanceTrim: number,
  maxTrim: number,
  dynamicScale: number,
  floor: number,
): OverloadReliefLever {
  if (performanceTrim < maxTrim) return 'trim';
  if (dynamicScale > floor) return 'resolution';
  return 'tier';
}

/** RCAS recovery grows with enlargement, capped before halos become dominant. */
export function reconstructionSharpness(inputToOutputScale: number): number {
  const scale = Math.min(1, Math.max(0, Number(inputToOutputScale) || 0));
  return Math.min(0.4, Math.max(0.12, 0.12 + (1 - scale) * 0.64));
}

/**
 * Reconstruction ladder: large reductions use one hardware-linear sample to
 * preserve native output cheaply and without ringing; EASU owns moderate
 * enlargement; RCAS is worthwhile only when enough source detail survives.
 */
export function reconstructionMode(inputToOutputScale: number): ReconstructionMode {
  const scale = Math.min(1, Math.max(0, Number(inputToOutputScale) || 0));
  if (scale < 0.4) return 'linear';
  if (scale < 0.6) return 'easu';
  return scale < 1 ? 'easu+rcas' : 'native-rcas';
}
