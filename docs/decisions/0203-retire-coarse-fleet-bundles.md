# 0203 — Exact family loading retires coarse fleet bundles

Status: accepted

## Decision

Delete the unreferenced `g1Nato`, `g2East`, `g3Us`, and `g4CasemateAsia`
profile aggregators under `src/vehicles/fleet/`. Exact ID-to-family ownership in
`fleetManifest.ts` and acquisition in `fleetFactory.ts` are the only browser
fleet-loading topology.

Do not recreate regional or geopolitical bundle modules as a compatibility
layer. Release tools that intentionally require every profile use the eager
`tankFactory.ts` facade.

## Why

The coarse bundles were an intermediate lazy-loading design. They became dead
code when exact family loading landed, but retained duplicate merge order and
profile ownership rules. Their existence made the codebase suggest two valid
loading architectures and invited future imports that would pull unrelated
vehicle families into a cold request.

## Consequences

- Four dead JavaScript modules and their duplicate aggregation rules are gone.
- One selected vehicle cannot reintroduce a region-sized profile import through
  a legacy bundle.
- The existing lazy-fleet ownership sweep remains the regression gate for all
  demand-loaded profiles.
