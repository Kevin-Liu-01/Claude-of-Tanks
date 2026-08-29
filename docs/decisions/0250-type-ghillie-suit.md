# 0250 — Fitted ghillie geometry has a strict TypeScript owner

Status: accepted

## Decision

`src/vehicles/ghillieSuit.ts` owns the fitted physical-camouflage registry and
builder behind explicit top, side, face, style, material, group, and disposable
resource contracts. Vehicle profiles import that owner directly through the
incremental TypeScript boundary.

The migration preserves every cloth outline and opening, carrier surface,
deterministic ripple and ragged edge, foliage seed and density, cut-net texture,
shadow flag, material hook, merged geometry, and owner attachment. Ghillie
geometry remains demand-loaded with its exact vehicle family and never enters
pristine Garage boot by itself.

## Consequences

- Malformed panel recipes and incomplete profile-builder ports fail typecheck.
- Canvas texture, material, and disposal ownership are checked without adding
  work to the geometry-building path.
- Each owner still produces at most the established net, light-foliage, and
  dark-foliage meshes, preserving the draw-call policy.

## Verification

    npm run typecheck
    node src/vehicles/ghillieSuit.selftest.mjs
    node src/vehicles/profiles/leopard2A6UA.selftest.mjs
    node tools/local-import-integrity.selftest.mjs
    node tools/public-repo-hygiene.selftest.mjs
    npm run build
