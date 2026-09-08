import { tankContactRect } from './tankContactShape.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';

export interface NavigationLiquidField {
  readonly navigationWaterPolicy?: 'avoid-liquid';
  getWaterMaskAt?(x: number, z: number): number;
}

type ContactShapeSpec = Parameters<typeof tankContactRect>[0];
export type NavigationLiquidSpec = TerrainMobilitySpec & Partial<ContactShapeSpec>;
export type NavigationLiquidSafety = (
  x: number, z: number, yaw: number, travel?: number,
) => boolean;

// Explicit map preference only: shallow water on other maps remains traversable.
// Created once per controller/route, with no allocation during its sampled sweep.
export function createNavigationLiquidSafety(
  field: NavigationLiquidField | undefined, spec: NavigationLiquidSpec,
): NavigationLiquidSafety | null {
  if (field?.navigationWaterPolicy !== 'avoid-liquid') return null;
  if (typeof field.getWaterMaskAt !== 'function') throw new TypeError('liquid navigation requires mask');
  // Point-only drivetrain fixtures have no contact dimensions. Runtime fleet
  // specs use the finalized, offset hull-contact rectangle, not published width.
  const rect = spec.dims ? tankContactRect(spec as ContactShapeSpec) : null;
  const cx = rect?.centerX ?? 0, cz = rect?.centerZ ?? 0;
  const hw = (rect?.halfWidth ?? 0) + (rect ? 0.4 : 0);
  const hl = (rect?.halfLength ?? 0) + (rect ? 0.4 : 0);
  const acrossSteps = Math.max(1, Math.ceil(hw * 2 / 2));
  const getWaterMaskAt = field.getWaterMaskAt;
  return function liquidCorridorClear(x: number, z: number, yaw: number, travel = 0): boolean {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const lo = cz - hl + Math.min(0, travel);
    const hi = cz + hl + Math.max(0, travel);
    const alongSteps = Math.max(1, Math.ceil((hi - lo) / 2));
    for (let along = 0; along <= alongSteps; along++) {
      const a = lo + (hi - lo) * along / alongSteps;
      for (let across = 0; across <= acrossSteps; across++) {
        const r = cx - hw + 2 * hw * across / acrossSteps;
        const mask = getWaterMaskAt.call(field, x + fz * r + fx * a, z - fx * r + fz * a);
        if (!Number.isFinite(mask) || mask > 0 || mask < 0) return false;
      }
    }
    return true;
  };
}
