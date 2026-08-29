# 0224 — Abrams concept registration has a truthful typed owner

Status: accepted

## Decision

Replace the historical `userdrops4.js` runtime name with
`src/vehicles/abramsConceptSpecs.ts`. Keep the legal procedural AbramsX and
explicit legacy M1A2 registration behind strict fleet contracts while retaining
the local-only source commentary as provenance.

Update both eager and demand-loaded fleet facades and the public-build registry
probe to use the truthful module name.

## Why

The old filename implied an active recovered-asset loading path even though the
module has deliberately shipped procedural vehicles in every build for years.
That obscured ownership and made the public repository appear to depend on an
obsolete source-drop pipeline.

## Consequences

- AbramsX and legacy M1A2 identity, stats, visuals, order, and procedural
  runtime paths are unchanged.
- The external recovered model gate remains permanently disabled.
- Public-build provenance checks no longer depend on the misleading
  `userdrops4.js` path.
- Typecheck, Abrams asset/anatomy checks, public build stripping, and import
  integrity certify the migration.
