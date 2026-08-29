# 0240 — Presentation-anchor receipts are generated as strict TypeScript

Status: accepted

## Decision

`tools/presentation-centering.mjs` emits
`src/vehicles/presentationAnchors.generated.ts` with explicit anchor and
orthographic-projection contracts. Garage framing, vehicle construction, icon
assets, and combat hit diagrams consume the same generated lookup functions.

The rendered-pixel solver, cannon and antenna exclusion, schema version,
four-decimal serialization, and public constants are unchanged. The file
remains generator-owned.

## Consequences

- Anchor and projection consumers receive checked shapes and nullable lookups.
- Garage and diagram framing cannot drift into separate implicit contracts.
- The full render-and-export audit remains the acceptance gate.

## Verification

    npm run typecheck
    node tools/local-import-integrity.selftest.mjs
    node src/ui/shotDiagramProjection.selftest.mjs
    npm run tank:centering:check
    npm run build
