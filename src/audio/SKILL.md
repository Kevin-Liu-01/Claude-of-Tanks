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
For generating or repairing sounds and crew lines, follow the
[audio-generation skill](../../docs/audio-generation/SKILL.md) and its prompt
cookbook. Start from [`docs/AUDIO.md`](../../docs/AUDIO.md): the runtime design, the generation
pipeline (SFX and crew voices) and how to change or extend it.
`audioEngine.ts` owns the bus subscriptions, listener frame, vehicle rigs,
weapons, impacts, ambience, alarms and the `window.__COT_AUDIO` debug surface.
Pure, DOM-free policy: `audioMath.ts` (distance, air absorption, delay,
Doppler, atmospheres, pan), `mixPolicy.ts` (levels, snapshots, HDR, budgets,
LOD), `soundCues.ts` (per-asset bus/space/jitter/caps), `weaponAudio.ts`
(report classes, reload choreography), `vehicleAudioProfiles.ts` +
`vehicleAudioModel.ts` (powertrain identity, RPM/gear/track model),
`environmentScenes.ts` (per-map scenes, bells, flyovers by era, `SPOT_HOURS`
and each scene's night life), `propSounds.ts` (what every world prop kind sounds
like), `modeSounds.ts` (every mode's opener and every `mode_*` event's sounds,
exhaustive; `worldSounds.selftest.mjs` scans the controller), `voiceLines.ts`
(radio discipline, and `resolveCrewLine`: each mode's and the AC-130 crew's own
call for a tank crew's line, from the exhaustive `MODE_CREW` and `GUNSHIP_CREW`),
`crewProcedure.ts` (the crew's procedure on moments the sound handlers leave
unvoiced: the fire command and its answers, APS/ERA, the drone's flight, the
modes' own moments, the gunship's fire control; its state is two declared
scopes, the battle's, started by the engine's `resetBattlePlay`, and our
tank's life's, started by the engine's `startOwnLife` at each revive of our
hull and each seat the player takes, as it notices them). Web Audio owners: `mixer.ts`, `assetLibrary.ts`,
`voicePool.ts`, `vehicleRig.ts`, `ambienceDirector.ts`, `crewRadio.ts`.
`captions.ts` owns the caption stream (BUI-F9): every keyed transmission
(`crewRadio.ts` `onTransmit`, with the take spoken and the speaking role from
`captionSpeakers.generated.ts`) and the `CAPTION_SOUNDS` cues the engine raises
(`caption('id', x, y, z)`, with a bearing from the listener) go out on the bus
as `audio:caption`; the renderer reads text from `captionScript.generated.ts`
(both tables from `tools/audio/build-captions.mjs`, run after any crew-line edit).
`lazyAudio.ts` owns gesture-time context creation and mixer transfer (it makes
no sound of its own; the mixer's chunk is an `app/lazyChunk.ts` chunk, asked
again after a failure under its backoff, never per gesture or offline) and the
device's lifecycle (an interrupted or suspended
context re-arms the gesture unlock; a muted or silent game's gesture keeps it,
and unmuting resumes a stopped device); `listenerPoseRuntime.ts` owns
the hybrid camera/vehicle listener. `battleMode.ts` declares the engine's
battle mode (garage, loading, live, over, presented, with the pause and
kill-cam overlays) and its one transition, `stepAudioBattleMode`, shared by
the engine and the facade: build a new battle fact with `audioBattleFact` (one
reading of a payload for both layers), route it through the transition (which
refuses an overlay move that changes nothing or comes outside a battle), and
take it ungated (it is state, not a cue). The kill-cam overlay's fact is the
replay's own flag (`src/game/killcamScreen.ts`, killcam.ts `active`), read at
each edge and by the engine every frame, never the edge itself. A field the
engine resets has one of three owners: the phase edge (`modeEdge`: the ambience
intent and the reload call), the battle world's teardown (`teardownBattle`:
loops, the alarm, the heartbeat, the listener, burning), and the new battle
(`resetBattleFields()`: every other per-battle field) (2026-11-02 audit F11).
The crew's procedure hangs off the same edges (round 8 Y3): its battle starts
in `resetBattlePlay` (a battle edge, a network restart), its life at each
revive of our hull (`startOwnLife`: the respawn event, or with none the frame
that shows our hull standing again after its death) and at each seat the player
takes in a watched battle (the frame's `isPlayer` on another hull, or back on
one its brain drove: no revive, no event), so nothing a dead crew's rounds arm
is said in the next life; a seat taken keeps its hull's radio set and fire
alarm as the frame shows them. A seat its brain drives makes none of the crew's
per-life or sighting calls (`live()` reads the frame's `isPlayer`); the
battle's mode calls (`onMode`, gated on `inBattle()`) are the side's news and
still play there, as the engine's own do. The pause menu silences the net (the
line on the air and the queue go as it opens, each edge cancels the crew's
armed calls, a recalled drone's recovery included, `say()` refuses 'paused',
no radio or crew frame runs behind the menu, a network battle's included). Our
drone is read as the authority flies it: its feed live while `active`, a recall
accepted as `returnS` (the flight home, "recovered" once it is parked), never
`recallS` (the recall's gate at launch). It names only what the
player sees: `src/game/playerVisibility.ts` is the one rule (the network's
word, the watch and couch reveals, our side, the seat's own spot), handed to
`audio.update` by `listenerPoseRuntime.ts` and stamped per frame on each
indexed hull; with no rule handed in (a tool, a receipt) no hull is seen.
A dead crew says only the battle's result call (`isResultLine`: the resolved
line's group, every mode's own result call too); the mode's own ending reason
names the ending before the battle's. The reload mirror's cycle is the
reloading mount's: another mount selected mid-cycle is that mount's cycle
joined where it stands, never a burst of its passed cues.
A wanted loop whose recording failed waits, and the engine's update asks again
once the library's retry is due. The two `*.generated.ts` manifests are
written by `tools/audio/build-sfx.mjs` and `tools/audio/build-voices.mjs`.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Initialize only after a user gesture, subscribe through the injected bus,
play through the pool (caps, cooldowns, priority) and stop stale sounds on
phase or entity teardown. Every asset id the engine names must exist in the
SFX manifest (`soundAssets.selftest.mjs` scans `play('…')` calls). New sounds
come from the offline pipeline (`tools/audio/sfx-catalog.mjs` →
`generate-sfx.mjs` → `build-sfx.mjs` → `loudness-receipt.mjs --ids …`, which
records the shipped files for `sfxLoudness.selftest.mjs`), never hand-dropped
files; a new world prop kind gets its entry in `propSounds.ts`
(`propSounds.selftest.mjs` fails on a kind it does not name); voice lines
from `crew-lines.json` → `build-voices.mjs`. Never synthesize a sound or add a
fallback: every cue is a recorded asset, one still decoding stays silent
(`soundAssets.selftest.mjs` rejects any `createOscillator`), no cue is chained in
when another fails (`if (!play(a)) play(b)`) and no crew speaks another's take
(`voiceTriggers.selftest.mjs` rejects both). A new crew line needs its game
moment in that matrix, and a sound a moment depends on is pinned in the battle
set rather than covered. The ElevenLabs key
is read from `ELEVENLABS_API_KEY` or `ELEVENLABS_API_KEY_FILE` and never
written to the repo.

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
presentation must key/dedupe them (the engine latches a death per life and a
presentation per battle). A looping cue the engine wants goes through
`loopRig` (it starts once its recording decodes); a pin names its owner
group (`library.pin(ids, replace, group)`, `group` a required `PinGroup`:
'session', 'battle', 'scene', 'rigs', 'aerial', 'own-weapons'; our own
hull's banks replace their set at each gun change and go with the battle's
teardown). Scope is an interior/headset perspective,
never a mute. Keep the occupied rig regardless of distance, rank remote rigs
by proximity under the LOD budget, and tear all world loops down when leaving
battle. Node selftests run under type stripping: no enums or parameter
properties in these modules. The countdown is live audio (only weapons wait
for the rollout): a sound heard from its first frame belongs in the battle
warm's presence set (`presenceAssets`, decoded first in the library's front
lane), never at the back of the bulk; `countdownAudio.selftest.mjs` checks the
decode order and the once-a-battle edges, and `presenceFamilies.selftest.mjs`
that every vehicle warms the bank its rig plays (resolve a hull from its whole
spec, `getVehicleSpec`, never its id alone). A network seat's tank list is what
its team spots: never count a side from it (the crew's side counts read
`getTeamRoster`, the roster with the authority's deaths, where a death is final).
