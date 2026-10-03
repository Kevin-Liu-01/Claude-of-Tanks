import { bridgeDeckOver, type NavigationBridgeDeck } from './bridgeDeckNavigation.ts';
import { tankContactRect } from './tankContactShape.ts';
import type { TerrainMobilitySpec } from './terrainMobility.ts';

interface NavigationLiquidField {
  readonly navigationWaterPolicy?: 'avoid-liquid';
  /** Round 61: a hull over a bridge deck is on the deck, not in the water the mask reports under it. */
  readonly bridgeDecks?: readonly NavigationBridgeDeck[];
  getWaterMaskAt?(x: number, z: number): number;
}

type ContactShapeSpec = Parameters<typeof tankContactRect>[0];
type NavigationLiquidSpec = TerrainMobilitySpec & Partial<ContactShapeSpec>;
type NavigationLiquidSafety = (
  x: number, z: number, yaw: number, travel?: number,
) => boolean;

// Explicit map preference only: shallow water on other maps remains traversable.
// Created once per controller/route, with no allocation during its sampled sweep.
//
// A hull already in the liquid (bots lane, 2026-10-02; Reservoir pacing seed 120006 on the maps lane's tree): the last
// bravo M1A2 ended its fight on the soft lake-shore flat at (88, -92) with its hull's east corners over the shallow
// mask, and the corridor test refused every move, forward, reverse and standing still, so the controller's final
// liquid brake held it there for the last 720 s. A hull whose own footprint already touches liquid may still move, so
// long as it takes on no more: its footprint's summed mask, sampled every LIQUID_EXIT_STEP_M along the move, never
// grows. The way out is never refused; the way further in still is.
const LIQUID_EXIT_STEP_M = 2;
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
  const decks = field.bridgeDecks?.length ? field.bridgeDecks : null;
  const footprintSteps = Math.max(1, Math.ceil(hl * 2 / 2));
  /** The summed mask under the hull's footprint moved `offset` along its heading (Infinity on an unreadable sample). */
  function footprintWetness(x: number, z: number, fx: number, fz: number, offset: number): number {
    let wet = 0;
    for (let along = 0; along <= footprintSteps; along++) {
      const a = cz - hl + offset + 2 * hl * along / footprintSteps;
      for (let across = 0; across <= acrossSteps; across++) {
        const r = cx - hw + 2 * hw * across / acrossSteps;
        const px = x + fz * r + fx * a, pz = z - fx * r + fz * a;
        if (decks !== null && bridgeDeckOver(decks, px, pz)) continue;
        const mask = getWaterMaskAt.call(field, px, pz);
        if (!Number.isFinite(mask) || mask < 0) return Infinity;
        wet += mask;
      }
    }
    return wet;
  }
  return function liquidCorridorClear(x: number, z: number, yaw: number, travel = 0): boolean {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const lo = cz - hl + Math.min(0, travel);
    const hi = cz + hl + Math.max(0, travel);
    const alongSteps = Math.max(1, Math.ceil((hi - lo) / 2));
    let dry = true;
    for (let along = 0; along <= alongSteps && dry; along++) {
      const a = lo + (hi - lo) * along / alongSteps;
      for (let across = 0; across <= acrossSteps; across++) {
        const r = cx - hw + 2 * hw * across / acrossSteps;
        const px = x + fz * r + fx * a, pz = z - fx * r + fz * a;
        if (decks !== null && bridgeDeckOver(decks, px, pz)) continue;
        const mask = getWaterMaskAt.call(field, px, pz);
        if (!Number.isFinite(mask) || mask > 0 || mask < 0) { dry = false; break; }
      }
    }
    if (dry) return true;
    // the hull already stands in liquid: the move may not take on more (see LIQUID_EXIT_STEP_M); a standing pose or a
    // hull still dry before the move is refused as before
    if (travel === 0) return false;
    let previous = footprintWetness(x, z, fx, fz, 0);
    if (!(previous > 0) || !Number.isFinite(previous)) return false;
    const steps = Math.max(1, Math.ceil(Math.abs(travel) / LIQUID_EXIT_STEP_M));
    for (let step = 1; step <= steps; step++) {
      const wet = footprintWetness(x, z, fx, fz, travel * step / steps);
      if (!(wet <= previous)) return false;
      previous = wet;
    }
    return true;
  };
}
