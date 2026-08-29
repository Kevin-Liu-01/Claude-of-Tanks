# 0295 — Garage variants are open map-bound staging areas

## Status

Accepted.

## Context

Separate enclosed garage kits made the selector feel disconnected from the
battlefields, duplicated a high-detail three-tank/three-turret display graph,
and could make a first switch compile a new light/material combination. Garage
hero placement also used the lowest visible attachment as its floor datum, so a
tow hook or mud flap could leave the tracks visibly suspended above the podium.

## Decision

- Verdant Motor Pool remains the original enclosed workshop with its roof,
  clutter, and exact Burlak gantry, Abrams welding, T-90M turret/Relikt, and
  rolled K2 repair scenes.
- Those four first-party maintenance scenes remain mounted in all ten choices.
  The duplicate Abrams/T-90M/Leclerc display layout is removed.
- The other nine choices are open staging areas bound to their canonical maps.
  Each is a lazy cached cut around a named tactical beat, using the map's
  seeded heightfield, real-coordinate authored structure, horizon profile, and
  far-tree geometry/species/palette. It has zero enclosing wall or roof
  surfaces and does not invoke the battlefield builder.
- Sample the full canonical heightfield grid in a module worker, returning only
  the 37×37 terrain slice, bounded tree transforms, and source receipt. Reveal
  terrain, skyline, structure, and tree owners across separate frames.
- Grade only the immediate hardstand transition to the service datum. Preserve
  the selected map's terrain relief outside that bounded apron.
- Selection changes keep the Garage light topology stable. Staging materials
  reuse existing program families and do not introduce location-specific live
  lights.
- Garage hero seating uses the authored running-gear floor datum. The existing
  conservative visible-geometry floor remains available to gallery, collision,
  and other consumers that must account for every protrusion.

## Consequences

Open locations now carry actual map terrain, tactical structures, skyline
language, and vegetation identity while remaining a bounded presentation cut.
This avoids grass, collision, destruction, environment-map, and world-streaming
residency in the Garage. Decorative underside parts may extend below the
platform contact plane while the load-bearing track remains exactly seated.

## Verification

    node src/game/garageDressingFleet.selftest.mjs
    node src/game/garagePedestalRuntime.selftest.mjs
    node src/game/garageVariants.selftest.mjs
    node src/ui/garageArchitecture.selftest.mjs
    node src/world/garageMapStage.selftest.mjs
    node src/vehicles/fleetFloorClearance.selftest.mjs
    npm run qa:garage -- --url=http://127.0.0.1:4178 --max-gap=120
    npm run qa:garage -- --url=http://127.0.0.1:4178 --max-gap=120 --cpu-rate=4
    npm run typecheck
    npm run build
    npm test
