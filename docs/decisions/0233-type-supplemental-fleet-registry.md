# 0233 — Supplemental fleet registration is typed

Status: accepted

## Decision

Rename `userdrops7.js` to `supplementalFleetSpecs.ts` and type its donor-copy,
source-credit, nested patch, and procedural candidate-source contracts. Remove
the permanently disabled local recovered-GLB branch and unused sourced-id
projection.

## Why

The old name and branching described an ingestion wave rather than a runtime
domain. The module now owns supplemental combat data and a small set of
procedural comparison records; no playable source can be toggled to a recovered
model.

## Consequences

- All fifteen ids, combat data, armor fitting, credits, roster order, and
  active procedural comparison records remain unchanged.
- TypeScript checks every donor and nested patch boundary.
- Historical NC/SA assets remain attribution and offline comparison evidence,
  not a latent runtime path.
