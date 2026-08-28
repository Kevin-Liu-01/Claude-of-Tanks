# 0147: Public media lifecycles are typed and viewport-scoped

## Status

Accepted — 2026-08-28

## Decision

`src/presentation/publicPages.ts` owns the landing and documentation media
lifecycles: the hero rail, keyboard-accessible screenshot rail, deferred stills,
and viewport-scoped video loading. Browser connection and device-memory hints
are isolated behind optional typed extensions.

Reduced-motion, save-data, compact-surface, visibility, and low-memory policies
remain inputs to the existing behavior. Offscreen video sources retain a short
scroll-back grace window before release to avoid repeated fetch/decode churn.

## Consequences

- Public media behavior is type checked without joining the game boot graph.
- Slow and low-memory clients retain explicit manual playback and reclamation.
- Landing-page visuals and interaction timing are unchanged.
