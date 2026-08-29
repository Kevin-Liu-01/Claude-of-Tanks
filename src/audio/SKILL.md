---
name: src-audio-skill
description: Work on event-driven spatial audio, radio voices, engines, weapons, ambience, and mix state.
---

# claude-of-tanks / src/audio

## Purpose
<!-- agent-docs:fill:purpose -->
Translate canonical game-bus events and listener state into responsive spatial
audio without owning gameplay decisions.

## Mental model & key files
<!-- agent-docs:fill:model -->
`audioPolicy.ts` owns deterministic catalogs, distance/perspective curves, and
reload timing without DOM or WebAudio access; `audio.ts` owns Web Audio routing
and synthesized/decoded effects;
`voices.ts` owns typed crew-line scheduling, priority, cooldown, and staleness;
`lazyAudio.ts` owns gesture-time context creation, retryable mixer transfer,
and the oscillator-only loading handoff;
`listenerPoseRuntime.ts` owns the allocation-free hybrid camera/vehicle
listener selected for player, scope, spectator, and kill-cam presentation.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Initialize only after user gesture, subscribe through the injected bus, cap
voices/loops, and stop stale sounds on phase or entity teardown.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace the originating bus event, verify payload semantics, then test scheduler
timing and live pause/phase behavior. Use `audioTiming.selftest.mjs` for pure
contracts, `tools/audio-spatial-killcam-probe.mjs` for listener/distance PCM,
and `tools/audio-probe.mjs` for the canonical event and bus matrix.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Camera direction and occupied-tank position form a hybrid listener. Network
events may arrive late or duplicated, so presentation must key/dedupe them.
Scope is an interior/headset perspective, never a mute. Keep the occupied
engine regardless of distance, rank capped remote engines by proximity, and
tear all world loops down when leaving battle.
