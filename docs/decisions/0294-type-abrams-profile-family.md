# 0294 — The Abrams profile family has a strict TypeScript owner

## Decision

Move the Abrams family from `src/vehicles/profiles/abrams.js` to
`src/vehicles/profiles/abrams.ts`. Model its builder capabilities, material
roles, running gear, hull and turret receipts, transform tuples, and profile
registration explicitly. Keep the browser's exact `abrams` demand-loader and
the eager audit facade pointed at this single owner.

## Why

Abrams was the largest remaining unchecked vehicle profile owner. It combines
several authored generations, asymmetric armor lofts, physical ghillie
geometry, configurable running gear, surface-fitted equipment, and a Ukrainian
donor handoff. Leaving those contracts implicit made a malformed adapter fail
deep inside approximately 10,000 lines of geometry and obscured which values
belong to a complete articulated turret versus a shell-only helper.

## Consequences

- Every Abrams variant, AbramsX, M1A3, the AIM family, and the Ukrainian M1A1
  donor now compile under the strict project configuration.
- The exported bare-hull donor and profile adapter accept the legacy boundary
  as `unknown` and validate the required builder surface before construction.
- Shell-only configuration is distinct from a complete turret rig, so helpers
  cannot accidentally depend on a gun or articulation pivot they do not own.
- Geometry constants, build order, transforms, materials, anatomy, markings,
  presentation anchors, and the exact fleet demand-loading group are unchanged.
- The Ukrainian donor now calls the canonical one-argument profile adapter;
  the former ignored second argument had no runtime effect.
- The unchecked Leopard, Merkava, and `tankFactoryCore.js` owners remain active
  migration work rather than a permanent architecture tier.
- The complete release workflow still reports the same pre-existing running-
  gear sweep counts for nine vehicles and the same continuity holes for
  M1A2 SEPv3 and the Ukrainian M1A1. An isolated check of pre-migration commit
  `3c1eb54de` produced byte-for-byte identical standards output; this migration
  neither introduces nor hides that fleet-quality debt.

## Verification

- `npm run typecheck`
- `npm run tank:anatomy:update`
- `npm run tank:anatomy:check`
- Focused ten-playable Abrams release gate and isolated `3c1eb54de` standards
  comparison
- `npm run build`
- `npm test`
