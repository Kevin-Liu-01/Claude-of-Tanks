# 0194 — Fleet presentation contracts are strict TypeScript

Status: accepted

## Decision

`src/vehicles/tankLabels.ts` is the canonical typed interface for public vehicle
names, short labels, and search aliases. `src/vehicles/tankAssets.ts` separately
owns the typed release contract for the nine generated presentation views, the
stable armor/module metadata receipt, and procedural geometry fingerprints.

The two modules remain separate: labels are consumed by live UI and search,
while asset receipts are consumed by generation and release tooling. Combining
them would pull asset-pipeline policy into every label caller without removing
any caller complexity.

## Why

Stable vehicle IDs are save and protocol keys, not display copy. Likewise, the
asset generator and release checker must agree exactly about filenames,
dimensions, metadata, and fingerprints. Implicit JavaScript records made both
contracts easy to widen accidentally and let invalid view keys or malformed
receipt inputs fail late.

The deletion test is direct: removing the label module redistributes naming
policy across UI callers; removing the asset module redistributes the release
schema across the renderer, generator, and checker. Each existing module hides
real policy behind a small interface and therefore remains a useful seam.

## Consequences

- TypeScript callers receive immutable label records and a closed asset-view
  key union.
- Asset metadata accepts a documented structural tank-spec subset rather than
  depending on the much larger runtime simulation shape.
- Geometry fingerprinting stays allocation-equivalent and behaviorally
  unchanged; no render, scene, or gameplay path was added.
- Fleet asset, local-import, build, and public-repository hygiene gates cover
  the `.ts` paths used by browser tooling and Node release checks.
