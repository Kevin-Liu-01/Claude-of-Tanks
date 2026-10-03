// The Mangrove fishery wharf's site: the creek landing it places on, its pose from that landing and its local bounds.
// The wharf composer (mangroveFisheryWharf.ts) and the vegetation keepout (vegetationClearance.ts) share it, so the
// ground kept clear of trees and bushes always stands where the wharf does (maps-and-layouts lane, 2026-10-02).
import { planRiverLanding, type RiverLanding, type RiverLandingAnchor } from './maps/riverLandings.ts';
import type { StructureClearance } from './vegetationClearance.ts';

/** The creek landing whose fishery becomes the working wharf. props.ts reads this index; tidalMangrove.ts keeps its own
 * 36 m keepout round lake 20, so the two must change together. */
export const FISHERY_WHARF_LAKE_INDEX = 20;
/** The adapted fishery's local bounds: makeFishery is fixed-size (10.2 x 15.5 m) with its dock reaching the jetty.
 * mangroveFisheryWharf.selftest checks that every composed wharf stays inside them. */
export const FISHERY_WHARF_LOCAL_BOUNDS = Object.freeze({ x0: -8.9, x1: 8.25, z0: -8.5, z1: 11.8 });

/** The wharf's pose from its landing. The long dock meets the west side of the existing jetty; the boat keeps its
 * complete east-side beach and approach, and no landing kit is moved. */
export function fisheryWharfPose(landing: RiverLanding): { x: number; y: number; z: number; yaw: number } {
  const yaw = Math.atan2(Math.cos(landing.angle), Math.sin(landing.angle));
  return { x: landing.x - Math.cos(yaw) * 8.7 - Math.sin(yaw) * 9.75,
    z: landing.z + Math.sin(yaw) * 8.7 - Math.cos(yaw) * 9.75, y: 0, yaw };
}

type LandingField = Parameters<typeof planRiverLanding>[0] & { _layout: { lakes: Parameters<typeof planRiverLanding>[1] } };

/**
 * The ground the wharf needs clear of trees and bushes, from the same landing and pose its placement uses: the world
 * box of its local bounds, grown by the 0.3 m its crown test adds. Null where no wharf can place.
 */
export function fisheryWharfClearance(mapId: string | undefined, field: LandingField,
  riverLandings: readonly RiverLandingAnchor[]): StructureClearance | null {
  if (mapId !== 'mangrove') return null;
  const anchor = riverLandings.find((site) => site.lakeIndex === FISHERY_WHARF_LAKE_INDEX);
  const landing = anchor ? planRiverLanding(field, field._layout.lakes, anchor) : null;
  if (!landing) return null;
  const p = fisheryWharfPose(landing), c = Math.cos(p.yaw), s = Math.sin(p.yaw), b = FISHERY_WHARF_LOCAL_BOUNDS;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const u of [b.x0, b.x1]) for (const v of [b.z0, b.z1]) {
    const x = p.x + c * u + s * v, z = p.z - s * u + c * v;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, halfWidth: (x1 - x0) / 2 + 0.3, halfLength: (z1 - z0) / 2 + 0.3, cos: 1, sin: 0 };
}
