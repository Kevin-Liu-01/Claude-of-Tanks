# 0238 — Combat-anatomy receipts are generated as strict TypeScript

Status: accepted

## Decision

`tools/gen-combat-anatomy.mjs` emits the eager fleet receipt, the 27
demand-loaded family receipts, and their loader table as `.ts` modules. The
large numeric payloads expose a narrow `Readonly<Record<string, unknown>>`
boundary; authored registry code validates and narrows each record before it
enters armor, module, crew, or presentation systems.

The generator continues to own every receipt. The migration changes module
types and import paths only: family chunking, measured collision cells, module
volumes, track envelopes, and serialized numbers remain unchanged.

## Consequences

- Generated anatomy data can no longer bypass the strict TypeScript graph.
- Demand loading still emits one immutable chunk per fleet family.
- Regeneration remains the only supported way to change a receipt.
- Release checks compare every generated module byte-for-byte with fresh
  measurements, so a type migration cannot conceal visual or combat drift.

## Verification

    npm run typecheck
    node tools/local-import-integrity.selftest.mjs
    node src/vehicles/combatAnatomy.selftest.mjs
    npm run tank:anatomy:check
    npm run build
