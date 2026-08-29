# 0288 — Casemate profile geometry has a strict TypeScript owner

## Decision

Keep Strv 103B, Jagdtiger, JPz E 100, Sturmtiger, T95, ISU-152, and ISU-122S
fixed-mount geometry in `src/vehicles/profiles/casemate.ts`. Express loft
stations, track-clearance corridors, gun sections, running gear, material
roles, ISU configuration, and the procedural builder port as strict local
contracts.

## Why

This family contains several of the fleet's densest geometry programs and
combines fixed-hull guns, multi-part track runs, painted vertex fields, and
vehicle-specific material tuning. The former JavaScript owner left callback
coordinates, ISU option rows, mutable geometry traversals, and builder
capabilities implicit, making a visual-preserving change difficult to review.

## Consequences

- Geometry constants, station and vertex order, transform order, material
  parameters, fixed-mount ownership, and runtime visuals remain unchanged.
- Mesh and instanced-mesh mutations are narrowed before accessing geometry or
  material state.
- ISU-152 and ISU-122S share an explicit configuration contract instead of an
  unchecked options bag.
- The Swedish family can call the exported Strv 103B builder through the
  narrow capabilities it actually supplies.
- Future casemate changes must extend these contracts without broad `any`,
  compiler suppression, or untyped geometry callbacks.

## Verification

- `npm run typecheck`
- `node src/vehicles/profiles/strv103TowRope.selftest.mjs`
- `node src/vehicles/profiles/swedishSiegeLine.selftest.mjs`
- `node src/vehicles/profiles/jpzE100Modernization.selftest.mjs`
- `node src/vehicles/ghillieSuit.selftest.mjs`
- `node src/vehicles/recoilRig.selftest.mjs`
- `node tools/run-selftests.mjs pre`
- `npm run build`
- `npm test`
