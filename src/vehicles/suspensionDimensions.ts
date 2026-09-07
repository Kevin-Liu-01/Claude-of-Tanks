/** Optional independently measured dimensions of the native moving suspension. */
export interface SuspensionDimensions {
  armWidthM: number;
  armHeightM?: number;
  armAxleHeightM?: number;
  armCenterAbsXM: number;
  /** Source axle-end minus anchor-end axial center. Positive is outward.
   * Web thickness stays armWidthM; this is not an enlarged bounding box. */
  armAxialShearM?: number;
  armCenterLeftAbsXM?: number;
  armCenterRightAbsXM?: number;
  anchorBossWidthM: number;
  anchorBossRadiusM: number;
  anchorBossCenterAbsXM: number;
  axleBossWidthM: number;
  axleBossRadiusM: number;
  axleBossCenterAbsXM: number;
  /** Nominal anchor height above its axle; zero supports measured horizontal arms. */
  anchorLiftM: number;
  /** Independently measured fore/aft arm-anchor separation. Absent preserves the native pattern. */
  anchorTrailM?: number;
}

function validateAxialShear(dimensions: SuspensionDimensions): void {
  const shear = dimensions.armAxialShearM;
  if (shear !== undefined && (!Number.isFinite(shear) || Math.abs(shear) > .5
    || dimensions.armHeightM === undefined)) {
    throw new Error('Source arm axial shear requires dimensioned endpoints and must be within half a metre');
  }
}

function validateRequiredDimensions(result: SuspensionDimensions): void {
  const names: readonly (keyof SuspensionDimensions)[] = [
    'armWidthM', 'armCenterAbsXM', 'anchorBossWidthM', 'anchorBossRadiusM',
    'anchorBossCenterAbsXM', 'axleBossWidthM', 'axleBossRadiusM',
    'axleBossCenterAbsXM', 'anchorLiftM',
  ];
  for (const key of names) {
    const value = result[key];
    const maximum = key.endsWith('CenterAbsXM') ? 3 : 1;
    const invalidMinimum = key === 'anchorLiftM' ? value! < 0 : value! <= 0;
    if (value === undefined || !Number.isFinite(value) || invalidMinimum || value > maximum) {
      const minimum = key === 'anchorLiftM' ? 'nonnegative' : 'positive';
      throw new Error(`Suspension dimension ${key} must be finite, ${minimum} and at most ${maximum} m`);
    }
  }
}

export function resolveSuspensionDimensions(
  source: SuspensionDimensions | undefined,
): Readonly<SuspensionDimensions> | undefined {
  if (source === undefined) return undefined;
  const result = { ...source };
  validateRequiredDimensions(result);
  for (const key of ['armCenterLeftAbsXM','armCenterRightAbsXM'] as const) {
    const value=result[key];
    if(value!==undefined&&(!Number.isFinite(value)||value<=0||value>3)) {
      throw new Error(`Suspension dimension ${key} must be finite, positive and at most 3 m`);
    }
  }
  for (const key of ['armHeightM','armAxleHeightM','anchorTrailM'] as const) {
    const value=result[key];
    if(value!==undefined&&(!Number.isFinite(value)||value<=0||value>1)) {
      throw new Error(`Suspension dimension ${key} must be finite, positive and at most 1 m`);
    }
  }
  validateAxialShear(result);
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

export function endpointAxleOutset(
  endpoint: {axleOutsetM?:number;axleOutsetLeftM?:number;axleOutsetRightM?:number},side?:-1|1,
): number {
  const sideValue=side===-1?endpoint.axleOutsetLeftM:side===1?endpoint.axleOutsetRightM:undefined;
  const value=sideValue??endpoint.axleOutsetM??0;
  if(!Number.isFinite(value)||Math.abs(value)>.5)throw new Error('End-wheel axle outset must be finite and within half a metre');
  return value;
}

export function sourceToothTip(endpoint: {toothTipRadiusM?: number},fallback:number): number {
  const value=endpoint.toothTipRadiusM;
  if(value===undefined)return fallback;
  if(!Number.isFinite(value)||value<=.05||value>1.5)throw new Error('Source tooth tip radius must be finite and between .05 and 1.5 metres');
  // sprocketGeo adds its historical 6mm crown after accepting toothOuter.
  return value-.006;
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
    assemblyHalfDepth: (dimensions ? armWidth + Math.abs(dimensions.armAxialShearM ?? 0)
      : Math.max(armWidth, jointWidth)) * 0.5,
    bossRadius: dimensions ? 1 : jointRadius,
    bossWidth: dimensions ? 1 / 1.12 : jointWidth,
  };
}
