// Shared deterministic framing for generated tank portraits and Garage cards.
// Keep this module DOM-free so the renderer, runtime UI, and release tooling all
// use the exact same alpha policy and placement math.

export interface PortraitFramePolicy {
  widthRatio: number;
  heightRatio: number;
  baselineRatio: number;
  coreAlphaThreshold: number;
  fullAlphaThreshold: number;
  leftQuantile: number;
  rightQuantile: number;
  topQuantile: number;
  bottomQuantile: number;
  auditMinCoreFillRatio: number;
  auditMaxCoreFillRatio: number;
  auditBaselineToleranceRatio: number;
  auditMaxFullWidthRatio: number;
  auditMaxFullHeightRatio: number;
}

export const TANK_PORTRAIT_FRAME_POLICY: Readonly<PortraitFramePolicy> = Object.freeze({
  widthRatio: 0.54,
  heightRatio: 0.68,
  baselineRatio: 0.88,
  coreAlphaThreshold: 48,
  fullAlphaThreshold: 8,
  leftQuantile: 0.06,
  rightQuantile: 0.94,
  topQuantile: 0.03,
  bottomQuantile: 0.985,
  // One dense-core axis must fill its target. The complete silhouette may extend
  // beyond that core due to barrels, antennae, cages, or a grounding shadow.
  auditMinCoreFillRatio: 0.95,
  auditMaxCoreFillRatio: 1.05,
  auditBaselineToleranceRatio: 0.025,
  auditMaxFullWidthRatio: 0.88,
  auditMaxFullHeightRatio: 1.25,
});

export interface PortraitPixelBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
  centerX: number;
  bottom: number;
}

export interface PortraitPlacement {
  x: number;
  y: number;
  scale: number;
}

export interface PortraitFrameAudit {
  passes: boolean;
  displayedFullWidth: number;
  displayedFullHeight: number;
  displayedFullWidthRatio: number;
  displayedFullHeightRatio: number;
  displayedCoreWidthRatio: number;
  displayedCoreHeightRatio: number;
  coreFillRatio: number;
  sourceCoreWidthRatio: number;
  sourceCoreHeightRatio: number;
  sourceBaselineRatio: number;
  sourceCoreFillRatio: number;
  core: PortraitPixelBounds | null;
  full: PortraitPixelBounds | null;
}

function pixelBounds(x0: number, y0: number, x1: number, y1: number): PortraitPixelBounds {
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  return {
    x0,
    y0,
    x1,
    y1,
    width,
    height,
    centerX: x0 + width * 0.5,
    bottom: y1 + 1,
  };
}

function quantileIndex(weights: Float64Array, totalWeight: number, quantile: number): number {
  const target = totalWeight * quantile;
  let cumulative = 0;
  for (let index = 0; index < weights.length; index++) {
    cumulative += weights[index];
    if (cumulative >= target) return index;
  }
  return weights.length - 1;
}

export function measurePortraitCoreBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  policy: Readonly<PortraitFramePolicy> = TANK_PORTRAIT_FRAME_POLICY,
): PortraitPixelBounds | null {
  if (!(width > 0) || !(height > 0) || pixels.length < width * height * 4) return null;
  const xWeights = new Float64Array(width);
  const yWeights = new Float64Array(height);
  let totalWeight = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = Number(pixels[(y * width + x) * 4 + 3]);
      if (alpha <= policy.coreAlphaThreshold) continue;
      xWeights[x] += alpha;
      yWeights[y] += alpha;
      totalWeight += alpha;
    }
  }
  if (!(totalWeight > 0)) return null;
  return pixelBounds(
    quantileIndex(xWeights, totalWeight, policy.leftQuantile),
    quantileIndex(yWeights, totalWeight, policy.topQuantile),
    quantileIndex(xWeights, totalWeight, policy.rightQuantile),
    quantileIndex(yWeights, totalWeight, policy.bottomQuantile),
  );
}

export function measurePortraitFullBounds(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  alphaThreshold = TANK_PORTRAIT_FRAME_POLICY.fullAlphaThreshold,
): PortraitPixelBounds | null {
  if (!(width > 0) || !(height > 0) || pixels.length < width * height * 4) return null;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Number(pixels[(y * width + x) * 4 + 3]) <= alphaThreshold) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 >= x0 && y1 >= y0 ? pixelBounds(x0, y0, x1, y1) : null;
}

/** Placement for drawing the source pixels directly into a target canvas. */
export function directPortraitPlacement(
  bounds: PortraitPixelBounds,
  targetWidth: number,
  targetHeight: number,
  policy: Readonly<PortraitFramePolicy> = TANK_PORTRAIT_FRAME_POLICY,
): PortraitPlacement {
  const scale = Math.min(
    targetWidth * policy.widthRatio / bounds.width,
    targetHeight * policy.heightRatio / bounds.height,
  );
  return {
    x: targetWidth * 0.5 - bounds.centerX * scale,
    y: targetHeight * policy.baselineRatio - bounds.bottom * scale,
    scale,
  };
}

/** CSS transform applied after an image has been object-fit:contain. */
export function containedPortraitPlacement(
  bounds: PortraitPixelBounds,
  naturalWidth: number,
  naturalHeight: number,
  boxWidth: number,
  boxHeight: number,
  policy: Readonly<PortraitFramePolicy> = TANK_PORTRAIT_FRAME_POLICY,
): PortraitPlacement {
  const fitScale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const renderedWidth = naturalWidth * fitScale;
  const renderedHeight = naturalHeight * fitScale;
  const insetX = (boxWidth - renderedWidth) * 0.5;
  const insetY = (boxHeight - renderedHeight) * 0.5;
  const visibleWidth = bounds.width * fitScale;
  const visibleHeight = bounds.height * fitScale;
  const scale = Math.min(
    boxWidth * policy.widthRatio / visibleWidth,
    boxHeight * policy.heightRatio / visibleHeight,
  );
  return {
    x: boxWidth * 0.5 - scale * (insetX + bounds.centerX * fitScale),
    y: boxHeight * policy.baselineRatio - scale * (insetY + bounds.bottom * fitScale),
    scale,
  };
}

export function auditPortraitPixels(
  pixels: ArrayLike<number>,
  naturalWidth: number,
  naturalHeight: number,
  boxWidth = 140,
  boxHeight = 88,
  policy: Readonly<PortraitFramePolicy> = TANK_PORTRAIT_FRAME_POLICY,
): PortraitFrameAudit {
  const core = measurePortraitCoreBounds(pixels, naturalWidth, naturalHeight, policy);
  const full = measurePortraitFullBounds(
    pixels,
    naturalWidth,
    naturalHeight,
    policy.fullAlphaThreshold,
  );
  if (!core || !full) {
    return {
      passes: false,
      displayedFullWidth: 0,
      displayedFullHeight: 0,
      displayedFullWidthRatio: 0,
      displayedFullHeightRatio: 0,
      displayedCoreWidthRatio: 0,
      displayedCoreHeightRatio: 0,
      coreFillRatio: 0,
      sourceCoreWidthRatio: 0,
      sourceCoreHeightRatio: 0,
      sourceBaselineRatio: 0,
      sourceCoreFillRatio: 0,
      core,
      full,
    };
  }
  const placement = containedPortraitPlacement(
    core,
    naturalWidth,
    naturalHeight,
    boxWidth,
    boxHeight,
    policy,
  );
  const fitScale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight);
  const displayedFullWidth = full.width * fitScale * placement.scale;
  const displayedFullHeight = full.height * fitScale * placement.scale;
  const displayedFullWidthRatio = displayedFullWidth / boxWidth;
  const displayedFullHeightRatio = displayedFullHeight / boxHeight;
  const displayedCoreWidthRatio = core.width * fitScale * placement.scale / boxWidth;
  const displayedCoreHeightRatio = core.height * fitScale * placement.scale / boxHeight;
  const coreFillRatio = Math.max(
    displayedCoreWidthRatio / policy.widthRatio,
    displayedCoreHeightRatio / policy.heightRatio,
  );
  const sourceCoreWidthRatio = core.width / naturalWidth;
  const sourceCoreHeightRatio = core.height / naturalHeight;
  const sourceBaselineRatio = core.bottom / naturalHeight;
  const sourceCoreFillRatio = Math.max(
    sourceCoreWidthRatio / policy.widthRatio,
    sourceCoreHeightRatio / policy.heightRatio,
  );
  return {
    passes: sourceCoreFillRatio >= policy.auditMinCoreFillRatio
      && sourceCoreFillRatio <= policy.auditMaxCoreFillRatio
      && sourceCoreWidthRatio <= policy.widthRatio * policy.auditMaxCoreFillRatio
      && sourceCoreHeightRatio <= policy.heightRatio * policy.auditMaxCoreFillRatio
      && Math.abs(sourceBaselineRatio - policy.baselineRatio) <= policy.auditBaselineToleranceRatio
      && coreFillRatio >= policy.auditMinCoreFillRatio
      && displayedFullWidthRatio <= policy.auditMaxFullWidthRatio
      && displayedFullHeightRatio <= policy.auditMaxFullHeightRatio,
    displayedFullWidth,
    displayedFullHeight,
    displayedFullWidthRatio,
    displayedFullHeightRatio,
    displayedCoreWidthRatio,
    displayedCoreHeightRatio,
    coreFillRatio,
    sourceCoreWidthRatio,
    sourceCoreHeightRatio,
    sourceBaselineRatio,
    sourceCoreFillRatio,
    core,
    full,
  };
}
