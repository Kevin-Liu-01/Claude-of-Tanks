// src/world/civic/roadLife.ts — the parked vehicles and carts along every battlefield's roads (the maps lane, 229; the
// owner, 2026-10-20: "for all maps we can have destructible objects like cars and stuff on roads. helps em feel more alive
// and like actually used").
//
// A map's pieces are the props' own destructible kinds — the map's fleet's vehicles (each copy its own livery, the far form
// past 120 m: maps/vehicleFarForm.ts) and its regional carts (maps/cartKit.ts) — at kerb and verge seats along its roads,
// authored like a civic plan's street parking (props.ts composeCivicAreas): they join the destructibles after every
// seeded pass, so the map's streams draw as without them, and the separation passes leave them where they stand. A map's
// kinds are pools it already draws (no new draw). The seats come from the lane's search (cot-lanes probes/pace
// roadlife.mjs; roadLife.generated.ts names each map's provenance): kerb or verge lines along each road clear of every
// structure and record, out of the objectives' discs (zones, Frontline lines, the kickoff) and the deployments', twinned
// on a symmetric map, where the base battles' hulls left the ground alone; parked in short runs nose to tail with the
// traffic, never two across a carriageway from each other (a tank passes between any two).
import type { CivicFurniture } from './types.ts';
import { ROAD_LIFE_SEATS } from './roadLife.generated.ts';

/** A map's road life (none for a map without seats, or with `globalThis.__cotRoadLifeOff` set: the receipts' base build). */
export function roadLifeFor(mapId: string | null | undefined): readonly CivicFurniture[] {
  if ((globalThis as { __cotRoadLifeOff?: boolean }).__cotRoadLifeOff === true) return [];
  return (mapId ? ROAD_LIFE_SEATS[mapId] : undefined) ?? [];
}

/** The maps with road life. */
export function roadLifeMaps(): readonly string[] {
  return Object.keys(ROAD_LIFE_SEATS).filter((id) => ROAD_LIFE_SEATS[id].length > 0);
}
