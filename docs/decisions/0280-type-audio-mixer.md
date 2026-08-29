# 0280 — The WebAudio mixer has a strict TypeScript owner

## Context

The gesture-gated browser mixer remained one of the final JavaScript runtime
owners. It combines a long-lived WebAudio graph, pooled engine and weapon
voices, spatial tank state, event-bus payloads, and a public lazy-audio facade.
Leaving those resource lifetimes implicit made teardown and event integration
harder to review while the rest of the audio boundary became typed.

## Decision

Keep the mixer in `src/audio/audio.ts` with explicit types for its WebAudio
nodes, voice pools, spatial tank projections, event payloads, and debug surface.
Adapt the structurally typed event bus once at subscription time instead of
spreading casts through the handlers. Keep policy in `audioPolicy.ts` and keep
the mixer behind `lazyAudio.ts`, so importing the player boot path still does
not create an audio context or eagerly load battle samples.

## Consequences

- Audio node ownership and teardown are checked without changing the graph,
  sample catalogs, scheduling, gains, random sequences, or spatial curves.
- The per-frame tank projection remains allocation-free and rejects malformed
  roster entries at the boundary.
- Browser audio remains locked behind the existing user-gesture lifecycle.
- Callers consume the mixer interface exported by the implementation rather
  than maintaining a duplicate facade contract.

## Verification

- `npx tsc -p tsconfig.json --noEmit`
- `node src/audio/audioTiming.selftest.mjs`
- `node src/audio/lazyAudio.selftest.mjs`
- `node src/audio/listenerPoseRuntime.selftest.mjs`
- `node src/audio/voices.selftest.mjs`
- `node src/game/eraActivation.selftest.mjs`
- `node tools/audio-probe.mjs`
- `npm test`
- `npm run build`
