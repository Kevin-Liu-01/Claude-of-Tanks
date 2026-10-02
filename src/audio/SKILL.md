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
Start from [`docs/AUDIO.md`](../../docs/AUDIO.md): the runtime design, the generation
pipeline (SFX and crew voices) and how to change or extend it.
`audioEngine.ts` owns the bus subscriptions, listener frame, vehicle rigs,
weapons, impacts, ambience, alarms and the `window.__COT_AUDIO` debug surface.
Pure, DOM-free policy: `audioMath.ts` (distance, air absorption, delay,
Doppler, atmospheres, pan), `mixPolicy.ts` (levels, snapshots, HDR, budgets,
LOD), `soundCues.ts` (per-asset bus/space/jitter/caps), `weaponAudio.ts`
(report classes, reload choreography), `vehicleAudioProfiles.ts` +
`vehicleAudioModel.ts` (powertrain identity, RPM/gear/track model),
`environmentScenes.ts` (per-map scenes), `voiceLines.ts` (radio discipline,
crew language). Web Audio owners: `mixer.ts`, `assetLibrary.ts`,
`voicePool.ts`, `vehicleRig.ts`, `ambienceDirector.ts`, `crewRadio.ts`,
`procedural.ts`. `lazyAudio.ts` owns gesture-time context creation, mixer
transfer and the oscillator-only loading tone; `listenerPoseRuntime.ts` owns
the hybrid camera/vehicle listener. The two `*.generated.ts` manifests are
written by `tools/audio/build-sfx.mjs` and `tools/audio/build-voices.mjs`.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Initialize only after a user gesture, subscribe through the injected bus,
play through the pool (caps, cooldowns, priority) and stop stale sounds on
phase or entity teardown. Every asset id the engine names must exist in the
SFX manifest (`soundAssets.selftest.mjs` scans `play('…')` calls). New sounds
come from the offline pipeline (`tools/audio/sfx-catalog.mjs` →
`generate-sfx.mjs` → `build-sfx.mjs`), never hand-dropped files; voice lines
from `crew-lines.json` → `build-voices.mjs`. The ElevenLabs key is read from
`ELEVENLABS_API_KEY` or `ELEVENLABS_API_KEY_FILE` and never written to the
repo.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Trace the originating bus event, verify payload semantics, then extend the
engine handler and its `audioEngine.selftest.mjs` scene. Use the pure
selftests for policy, `tools/audio-mix-balance.mjs` for what a player hears
(garage tone, gunfire over the battle bed, radio level, live density),
`tools/sfx-smoke.mjs` for assets/calibres/distance, `tools/voice-smoke.mjs`
for the crews, `tools/audio-spatial-killcam-probe.mjs` for listener/distance
PCM and `tools/audio-probe.mjs` for the canonical event and bus matrix.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Camera direction and occupied-tank position form a hybrid listener;
screen-right is `forward × up` (a three.js camera looking along +Z has world
−X on its right). Network events may arrive late or duplicated, so
presentation must key/dedupe them. Scope is an interior/headset perspective,
never a mute. Keep the occupied rig regardless of distance, rank remote rigs
by proximity under the LOD budget, and tear all world loops down when leaving
battle. Node selftests run under type stripping: no enums or parameter
properties in these modules.
