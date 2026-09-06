/** Optional independently measured dimensions of the native moving suspension. */
export interface SuspensionDimensions {
  armWidthM: number;
  armHeightM?: number;
  armAxleHeightM?: number;
  armCenterAbsXM: number;
  armCenterLeftAbsXM?: number;
  armCenterRightAbsXM?: number;
  anchorBossWidthM: number;
  anchorBossRadiusM: number;
  anchorBossCenterAbsXM: number;
  axleBossWidthM: number;
  axleBossRadiusM: number;
  axleBossCenterAbsXM: number;
  anchorLiftM: number;
}

export function resolveSuspensionDimensions(
  source: SuspensionDimensions | undefined,
): Readonly<SuspensionDimensions> | undefined {
  if (source === undefined) return undefined;
  const result = { ...source };
  const names: readonly (keyof SuspensionDimensions)[] = [
    'armWidthM', 'armCenterAbsXM', 'anchorBossWidthM', 'anchorBossRadiusM',
    'anchorBossCenterAbsXM', 'axleBossWidthM', 'axleBossRadiusM',
    'axleBossCenterAbsXM', 'anchorLiftM',
  ];
  for (const key of names) {
    const value = result[key];
    const maximum = key.endsWith('CenterAbsXM') ? 3 : 1;
    if (value === undefined || !Number.isFinite(value) || value <= 0 || value > maximum) {
      throw new Error(`Suspension dimension ${key} must be finite, positive and at most ${maximum} m`);
    }
  }
  for (const key of ['armCenterLeftAbsXM','armCenterRightAbsXM'] as const) {
    const value=result[key];
    if(value!==undefined&&(!Number.isFinite(value)||value<=0||value>3)) {
      throw new Error(`Suspension dimension ${key} must be finite, positive and at most 3 m`);
    }
  }
  for (const key of ['armHeightM','armAxleHeightM'] as const) {
    const value=result[key];
    if(value!==undefined&&(!Number.isFinite(value)||value<=0||value>1)) {
      throw new Error(`Suspension dimension ${key} must be finite, positive and at most 1 m`);
    }
  }
  if((result.armHeightM===undefined)!==(result.armAxleHeightM===undefined)) {
    throw new Error('Source suspension arm endpoint heights must be supplied together');
  }
  return Object.freeze(result);
}

export function sourceArmCenter(dimensions: Readonly<SuspensionDimensions> | undefined, side: -1|1): number|undefined {
  if(!dimensions)return undefined;
  return (side<0?dimensions.armCenterLeftAbsXM:dimensions.armCenterRightAbsXM)??dimensions.armCenterAbsXM;
}

export function endpointAxialScale(
  endpoint: {axialScaleLeft?:number;axialScaleRight?:number},side:-1|1,
): number {
  const value=(side<0?endpoint.axialScaleLeft:endpoint.axialScaleRight)??1;
  if(!Number.isFinite(value)||value<=0||value>2)throw new Error('End-wheel axial scale must be finite, positive and at most 2');
  return value;
}

interface SuspensionShapeRatios {
  anchorLiftRatio: number;
  armWidthRatio: number;
  jointRadiusRatio: number;
  jointWidthRatio: number;
}

export function resolveSuspensionShape(
  source: SuspensionDimensions | undefined, wheelR: number, wheelW: number,
  pattern: SuspensionShapeRatios,
) {
  const dimensions = resolveSuspensionDimensions(source);
  const lift = dimensions?.anchorLiftM ?? wheelR * pattern.anchorLiftRatio;
  const armWidth = dimensions?.armWidthM ?? Math.max(0.05, wheelW * pattern.armWidthRatio);
  const jointRadius = Math.max(0.042, wheelR * pattern.jointRadiusRatio);
  const jointWidth = Math.max(0.05, wheelW * pattern.jointWidthRatio);
  return {
    dimensions, lift, armWidth,
    assemblyHalfDepth: (dimensions ? armWidth : Math.max(armWidth, jointWidth)) * 0.5,
    bossRadius: dimensions ? 1 : jointRadius,
    bossWidth: dimensions ? 1 / 1.12 : jointWidth,
  };
}
