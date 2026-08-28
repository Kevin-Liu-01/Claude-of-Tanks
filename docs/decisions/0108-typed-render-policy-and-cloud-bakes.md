# 0108 — Render policy and cloud bakes are strict TypeScript

## Context

Output resolution, internal render scale, shadow refresh scheduling, and cloud
texture generation directly affect load cost, frame pacing, GPU memory, and
visual stability. These deterministic policies were JavaScript modules consumed
by both browser owners and Node regressions, leaving their option and result
shapes implicit.

## Decision

`resolutionPolicy.ts`, `renderScalePolicy.ts`, `shadowRefresh.ts`,
`skyCloudBake.ts`, and `skyCloudWorker.ts` are strict TypeScript. Their numeric
constants and algorithms are unchanged. Cloud pixel buffers retain exact
deterministic output, and the worker remains a transferred-buffer module rather
than copying baked textures across the main thread.

## Consequences

- Display DPR, adaptive scene scale, reconstruction mode, and shadow cadence
  have explicit checked contracts.
- Four-cascade scheduling retains its 60/120/144 Hz behavior and bounded
  high-refresh work.
- Cumulus and cirrus hashes remain byte-for-byte stable.
- No new frame work, texture resolution reduction, or visual-quality change is
  introduced.

## Verification

- `npm run typecheck`
- `node src/engine/resolutionPolicy.selftest.mjs`
- `node src/engine/renderScalePolicy.selftest.mjs`
- `node src/engine/shadowRefresh.selftest.mjs`
- `node src/engine/skyCloudBake.selftest.mjs`
- `npm run build`
