# ADR 0026: Speculative garage work waits for a quiet window

## Status

Accepted — 2026-08-26

## Context

World construction and adjacent-tank texture preparation were cooperative, but
both began shortly after the garage became ready or a tank appeared. Their
individual slices could still overlap shader linking and procedural vehicle
construction. The selected tank converged quickly while the following frames
stuttered, which made boot and switching feel slower than their headline
latency.

## Decision

Exact pointer/focus intent remains immediate. Purely speculative adjacent-tank
work waits 1.8 seconds after a reveal, and passive battlefield construction
waits four seconds after the latest garage activity. New input invalidates or
reschedules those jobs. Battle intent still promotes the exact in-progress
world and starts its transfer/build immediately behind the loading veil.

The Battle gesture also owns a synchronous oscillator-only mechanical entry
cue. The full mixer replaces the fallback and continues the loading bed without
adding a fetch, decode, timer, or render-loop dependency.

## Consequences

- Cold tank construction is no cheaper, but it is no longer followed by an
  immediate speculative workload burst.
- A player who deliberately hovers a card or Battle still receives eager exact
  preparation.
- A fast mobile Battle tap may begin more world construction under the opaque
  loader; this is preferred to freezing the actively used garage.
- Loading always has audible feedback even on a cold audio chunk.

## Verification

- `node src/game/garagePedestalPreloader.selftest.mjs`
- `node src/audio/lazyAudio.selftest.mjs`
- `node src/audio/audioTiming.selftest.mjs`
- `node tools/switch-latency-probe.mjs --tier mobile --cpu 4 --sequence merkava4b`
- `node tools/audio-probe.mjs`
