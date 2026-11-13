// Static battlefield dressing follows the public garage roster, not the saved
// spec dictionary: saved records include hidden vehicles and builder donors.
// The existing world/fleet boundary registers metadata before selecting wrecks.
// Keep this policy builder-free and read the live catalog after registration.
//
// (wrecks-270, 2026-11-05) Each map's donors are its row in maps/wreckCasts.ts, chosen for its place, year and armies;
// the era pools this module held are gone with it. A map whose cast has no public donor places no hulk.
import { PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';
import { WRECK_CASTS } from './maps/wreckCasts.ts';

export function isPublicWreckDonor(specId: string): boolean {
  return PRODUCTION_TANK_IDS.includes(specId);
}

/**
 * A cast's donors: authored order, unavailable donors and repeated entries removed. The returned array is
 * invocation-owned. An empty result places no wrecks; the placement caller must skip it, never select an undefined or
 * hidden donor.
 */
export function resolveWreckRoster(ids: readonly string[] = []): string[] {
  return [...new Set(ids.filter(isPublicWreckDonor))];
}

/** A map's donors, resolved (an unknown map has none). */
export function wreckDonorsFor(mapId: string): string[] {
  return Object.hasOwn(WRECK_CASTS, mapId) ? resolveWreckRoster(WRECK_CASTS[mapId as keyof typeof WRECK_CASTS].ids) : [];
}

/** Every map's authored donors, once each (the fleet smoke bakes each; the receipts preload them). */
export const WRECK_DONOR_IDS: readonly string[] = Object.freeze([...new Set(Object.values(WRECK_CASTS).flatMap((cast) => cast.ids))]);
