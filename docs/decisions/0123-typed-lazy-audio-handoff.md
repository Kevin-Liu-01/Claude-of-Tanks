# 0123 — Gesture-time audio handoff is strict TypeScript

## Context

The boot-light audio facade owns autoplay-sensitive context creation, a
fallback oscillator bed, deferred mixer import, graph construction order,
retry state, and the public audio port. Those contracts were still implicit
JavaScript on the first-interaction path.

## Decision

Migrate `lazyAudio.js` to `lazyAudio.ts` with explicit mixer, module, fallback,
listener, bus, and facade contracts. Promise rejection remains retryable and
the full mixer still constructs only after explicit sound intent.

## Consequences

- Type checking now prevents a partial mixer from missing a method consumed by
  the frame loop or UI.
- The gesture-created `AudioContext` remains the one adopted by the full mixer.
- The fallback tone, gain ramps, loading behavior, and transfer timing are
  unchanged.
- No full-mixer code moves into the Garage boot chunk.

## Verification

- `npm run typecheck`
- `node src/audio/lazyAudio.selftest.mjs`
- `node src/audio/listenerPoseRuntime.selftest.mjs`
- `node tools/audio-spatial-killcam-probe.mjs`
- `npm run build`
