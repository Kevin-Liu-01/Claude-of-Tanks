// src/world/civic/plans/index.ts — the civic plans by map (the maps lane, 228). A map adopts the civic-area and pathway
// kit by a plan here; every other map builds exactly what it built before. Leaf module: no three.js (the terrain's lawn
// mask and the receipts read the plans in Node).
import type { CivicAreaPlan, CivicPlan, CivicRect } from '../types.ts';
import { URBAN_CIVIC_PLAN } from './urban.ts';

const PLANS: Readonly<Record<string, CivicPlan>> = Object.freeze({
  urban: URBAN_CIVIC_PLAN,
});

/** The maps with a civic plan (the receipts iterate them). */
export const CIVIC_PLAN_MAPS: readonly string[] = Object.freeze(Object.keys(PLANS));

/** A map's civic plan, or null (the map lays its streets and squares as before). The receipts build a map without its
 *  plan (globalThis.__cotCivicOff) to hold the plan's build to the map's own seeded passes. */
export function civicPlanFor(mapId: string | null | undefined): CivicPlan | null {
  if ((globalThis as { __cotCivicOff?: boolean }).__cotCivicOff === true) return null;
  return (mapId && PLANS[mapId]) || null;
}

/** The props settings a plan sets over the map's own (no map config is edited: the overlay is applied at build). */
interface CivicOverlayTarget {
  plazaNest?: boolean;
  dressingRules?: Record<string, unknown>;
}
export function applyCivicOverlay(plan: CivicPlan, props: CivicOverlayTarget): void {
  const o = plan.overlay;
  if (o.plazaNest === false) props.plazaNest = false;
  if (o.hedgehogsAtApproaches) props.dressingRules = { ...(props.dressingRules ?? {}), hedgehogsAtApproaches: true };
}

/** The lawns a map's civic areas keep green (the terrain paints them off its road mask, its village wear off). */
export function civicLawns(mapId: string | null | undefined): readonly CivicRect[] {
  return civicPlanFor(mapId)?.areas.flatMap((area) => area.lawns) ?? [];
}

/** The rooms a map's civic areas pave frontage to frontage (the terrain paints them paved, the grass keeps off). */
export function civicPavedRooms(mapId: string | null | undefined): readonly CivicRect[] {
  return civicPlanFor(mapId)?.areas.map((area) => area.room) ?? [];
}

/** The pads whose airfield dressing a civic area drops (hardstandDressing.ts), by index. */
export function civicUndressedPads(mapId: string | null | undefined): ReadonlySet<number> {
  return new Set(civicPlanFor(mapId)?.areas.map((area: CivicAreaPlan) => area.pad) ?? []);
}

/** Whether (x, z) lies in a rectangle. */
export function inCivicRect(r: CivicRect, x: number, z: number, margin = 0): boolean {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

/** Whether a point is a civic area's mown lawn proper (the grass grows there): inside a bed's lawn, inside its dwarf wall
 *  (`inset`), off its paths, its feature's ring and the monument's bed. Null on a map without a plan. */
export function civicLawnTest(mapId: string | null | undefined, inset = 0.65): ((x: number, z: number) => boolean) | null {
  const plan = civicPlanFor(mapId);
  if (!plan) return null;
  const lawns = plan.areas.flatMap((a) => a.lawns), beds = plan.areas.flatMap((a) => a.beds);
  const monuments = plan.areas.flatMap((a) => (a.monument ? [a.monument] : []));
  return (x, z) => {
    if (!lawns.some((r) => inCivicRect(r, x, z, -0.2))) return false;
    for (const bed of beds) {
      if (!inCivicRect(bed.rect, x, z)) continue;
      if (!inCivicRect(bed.rect, x, z, -inset)) return false;
      for (const p of bed.paths) {
        const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - p.from[0]) * dx + (z - p.from[1]) * dz) / l2));
        if (Math.hypot(x - p.from[0] - dx * t, z - p.from[1] - dz * t) < p.width / 2 + 0.25) return false;
      }
      const f = bed.feature;
      if (f?.kind === 'flowerRondell' && Math.hypot(x - f.x, z - f.z) < f.ring + 0.2) return false;
      if (f?.kind === 'hedgeArc' && Math.abs(Math.hypot(x - f.x, z - f.z) - f.r) < 0.45) return false;
      return !monuments.some((mo) => Math.hypot(x - mo.x, z - mo.z) < 3.1);
    }
    return false;
  };
}

/** A map's civic tree stations with their species and scale band (vegetation.ts plants them on a stream of their own). */
export function civicTreeStations(mapId: string | null | undefined): Array<{ x: number; z: number; species: string; scale: readonly [number, number] }> {
  return civicPlanFor(mapId)?.areas.flatMap((a) => a.trees.stations.map((s) => ({ x: s.x, z: s.z, species: a.trees.species, scale: a.trees.scale }))) ?? [];
}
