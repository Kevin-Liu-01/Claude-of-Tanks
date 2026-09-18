# Fortifications on every map (2026-09-17)

Owner (round 11, item 7): "more trenches/barbed wire/AA guns/bunkers on ALL maps, extra in Frontline Assault; AA
spread around map borders; distant explosions visible everywhere."

## What this slice does

- **Field works on every map** (`src/world/props.ts` `placeFieldWorks`, own rng stream `seed + 7411` so no existing
  placement shifts): three works per map (desktop richness scales the count; `PropsMapConfig.fieldWorks` overrides),
  each between the spawns — a breastwork of sourced sandbag modules (concrete barriers where the bags are absent)
  facing the threat, a barbed-wire belt 14–18 m in front, and a pillbox closing one end of every second work with
  an ammunition box behind it. Works in the near half face the enemy, works in the far half face the player.
  Placement respects roads (≥ 6 m), soft ground, the no-vegetation mask, slope, spawns (≥ 45 m) and buildings.
- **Frontline Assault extra**: the trench plan fields two more works, and every carved parapet gets a barbed-wire
  belt 7.5 m ahead of it (`placeTrenchWorks`).
- **Two first-party destructibles** (`src/world/maps/inhabitKit.ts` `DESTRUCTIBLE_TYPES`): `barbedwire` — screw
  pickets, three strands, bracing and concertina barbs; shoot-through, a hull crushes it at a walking pace with a
  10 % bite; `bunker` — chamfered concrete pillbox with a roof slab, firing embrasure, flank slits, door recess,
  earth berm and a sandbag cap; a collider hulls never crush (`crushMin 999`), shells stop on it and break it into
  rubble.
- **AA guns ring the map border** (`src/world/frontlineAtmosphere.ts` `layoutAaGuns`): 5–8 guns by intensity on an
  outer ring (385–465 m) at evenly spaced, jittered bearings; campaign scale past 1 (Frontline Assault) adds guns
  up to the instanced cap of 10. Receipt re-pinned from "behind the player" to the ring and its coverage.
- **Distant explosions everywhere** (`layoutFront`): three artillery anchors in five stay in the front fan, two ring
  the whole horizon; no map's `FRONTLINE_INTENSITY` sits under 0.4 any more (whiteout, oasis, orchard, alpine,
  mangrove raised).

## Field trenches carved on every standard map (round 13, terrain side)

`src/sim/assaultLines.ts` `planFieldTrenchLines` / `FIELD_TRENCH`: two short fire trenches (half length 26 m, the
assault cross-section) per side of the alpha→bravo axis at 30 % and 70 % of the way to the enemy, lateral offset
22 % of the axis (≤ 150 m). `src/world/terrain.ts` `fieldTrenchPlan()` (lazy, like the sector plan) drops a line
where any of five stations along it meets the settlement (mask ≥ 0.4), a road (< 12 m), the map edge, water or a
marsh bank (the same wetness law the splat mask reads plus a 75 % dry-carve floor computed with heightAt's own
marsh/bank weights), or an assault sector line (clearance = both half lengths + 10 m); the plan drawn during the
dry construction pass (no liquid surfaces yet) is provisional, the one drawn once the surfaces exist is cached.
The carve rides the same `assaultTrenchCarveDepth` hook after road grading; the assault variant carries the field
trenches on top of its sector lines; a map opts out with `fieldTrenches: false`. Exposed as
`heightField.fieldTrenchLines`. Receipt: `src/world/fieldTrenchTerrain.selftest.mjs` (six maps: cut > 0.93 m at
every line centre, ≥ 12 m off roads, out of the settlement, inside the field, far samples untouched; the assault
variant keeps its sectors and its field trenches clear of them). Probe: `.qa-dev/coastal-trench-probe.mjs <map>`
prints each line's cut profile along and across against the expected carve.

Landed (2026-09-17 night): the field lines carve their own fire-trench section (`FIELD_TRENCH.profile`: 1.15 m deep over a
4 m floor with 24° banks — the fortified 42° sector section left crossing bots crawling and pushed `server/battlePacing`
to 16/120 time-limit results; the gentle banks bring it back under the cap); `placeTrenchWorks` dresses the field lines
like the sector lines (parapet sandbags, wire belt, end drums) outside their own bank and keeps the field works out of them; the road berth is 26 m (clear of the graded shoulder) and only FINAL
height queries (roads and pads on) see the carve, so road grades, pad seats and lake levels are trench-independent —
the terrain-history receipts compare their laws on `fieldTrenches: false` fields and declare the three source deltas
(plan, carve, field entry) in their historical projections. The map-environment audit baseline is recaptured with the
landing (`npm run qa:maps`).

## Deliberately deferred

