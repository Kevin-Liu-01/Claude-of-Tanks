# 0183 — Device diagnostics and renderer rescue are strict TypeScript

Status: accepted

## Decision

Boot-time GPU probes, scene-band readback, environment validation, shadow
reclamation, the black-scene rescue ladder, and the opt-in diagnostic overlay
are owned by `src/engine/deviceDiag.ts` behind explicit Three.js, WebGL, DOM,
diagnostic-state, and recovery-result contracts.

The rescue ladder stores shadow, environment, and fog rollback state in typed
lexical slots. A stage may remain active only when its measured scene band
recovers; earlier stages are reverted and remeasured before the result is
accepted.

## Why

This path runs precisely when a browser or GPU is already failing. The former
JavaScript implementation relied on unchecked renderer objects, nullable DOM
queries, ad-hoc window state, and mutable `this` fields inside recovery stages.
An error in the fallback could turn a recoverable black-scene or shader failure
into a blocked first visit.

## Consequences

- Healthy-device probe thresholds, render-target sizes, rescue ordering, and
  visuals are unchanged.
- Every diagnostic render restores the caller's render target and disposes its
  temporary scene, material, geometry, shadow map, and target resources.
- The explicit diagnostic overlay remains opt-in; silent compatibility rescue
  remains active for normal sessions.
- Reduced headless and mobile fixtures keep their existing tested behavior.
- Strict typecheck, renderer-resource diagnostics, 51 responsive viewports, and
  the production build certify this boundary.
