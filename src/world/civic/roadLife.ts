// src/world/civic/roadLife.ts — the parked vehicles and carts along every battlefield's roads (the maps lane, 229; the
// owner, 2026-10-20: "for all maps we can have destructible objects like cars and stuff on roads. helps em feel more alive
// and like actually used").
//
// A map's pieces are the props' own destructible kinds — the map's fleet's vehicles (each copy its own livery, the far form
// past 120 m: maps/vehicleFarForm.ts) and its regional carts (maps/cartKit.ts) — at kerb and verge seats along its roads,
// authored like a civic plan's street parking (props.ts composeCivicAreas): they join the destructibles after every
// seeded pass, so the map's streams draw as without them, and the separation passes leave them where they stand. A map's
// kinds are pools it already draws (no new draw). The seats come from the lane's search (cot-lanes probes/pace
// roadlife.mjs; plans/roadLifeSeats.generated.ts names each map's provenance; plans/roadLifeLive.ts the maps live): kerb or verge lines along each road clear of every
// structure and record, out of the objectives' discs (zones, Frontline lines, the kickoff) and the deployments', twinned
// on a symmetric map, where the base battles' hulls left the ground alone; parked in short runs nose to tail with the
// traffic, never two across a carriageway from each other (a tank passes between any two).
import type { CivicFurniture } from './types.ts';
import { ROAD_LIFE_SEATS } from './plans/roadLifeSeats.generated.ts';
import { ROAD_LIFE_LIVE as LIVE } from './plans/roadLifeLive.ts';

/** The QA switches: `?roadlife=0` builds a map without it, `?roadlife=1` with it on a map not yet live (before/after
 *  pairs and the frame probe from one build); in Node, `COT_ROAD_LIFE_ALL=1` or `globalThis.__cotRoadLifeAll` the latter. */
function roadLifeQuery(): string | null {
  const search = (globalThis as { location?: { search?: string } }).location?.search;
  return typeof search === 'string' ? new URLSearchParams(search).get('roadlife') : null;
}
function roadLifeAll(): boolean {
  const g = globalThis as { __cotRoadLifeAll?: boolean; process?: { env?: Record<string, string | undefined> } };
  return g.__cotRoadLifeAll === true || g.process?.env?.COT_ROAD_LIFE_ALL === '1' || roadLifeQuery() === '1';
}

/** A map's road life: none for a map without seats or not yet live (unless forced), with `globalThis.__cotRoadLifeOff`
 *  set (the receipts' base build) or with `?roadlife=0`. */
export function roadLifeFor(mapId: string | null | undefined): readonly CivicFurniture[] {
  if ((globalThis as { __cotRoadLifeOff?: boolean }).__cotRoadLifeOff === true || roadLifeQuery() === '0' || !mapId) return [];
  if (!LIVE.has(mapId) && !roadLifeAll()) return [];
  return ROAD_LIFE_SEATS[mapId] ?? [];
}

/** The maps with road life (the live ones; every map with seats when forced). */
export function roadLifeMaps(): readonly string[] {
  return Object.keys(ROAD_LIFE_SEATS).filter((id) => ROAD_LIFE_SEATS[id].length > 0 && (LIVE.has(id) || roadLifeAll()));
}
