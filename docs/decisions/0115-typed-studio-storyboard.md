# 0115 — Studio storyboards have a strict serializable contract

## Context

The Scene Studio timeline is shared by JSON import/export, editor mutations,
and allocation-free render-loop sampling. Its JavaScript implementation
validated malformed authored data at runtime, but left the normalized camera,
actor-track, transition, and caller-owned sample shapes implicit.

## Decision

`studioTimeline.ts` is the strict TypeScript owner for storyboard
normalization and sampling. It exports the canonical JSON-safe model, accepts
unknown raw field values at the normalization boundary, and writes camera and
actor samples into caller-owned records. Duration, key-count, deduplication,
Catmull-Rom, angle-wrap, and cut semantics are unchanged.

## Consequences

- Studio authoring and playback share one compiler-checked schema.
- Malformed imported values are still bounded by the existing runtime guards.
- Per-frame sampling remains allocation-free.
- No DOM, WebGL, timing, camera, or visual behavior moves into this pure leaf.

## Verification

- `npm run typecheck`
- `node src/game/studioTimeline.selftest.mjs`
- `npm run build`
