---
name: audio-generation-handbook
description: Generate, select, master and wire the game's ElevenLabs sound effects and multilingual crew radio lines; repair bad takes from the cache; never synthesize or stand in for a sound.
---

# Audio-generation procedure

## Purpose
<!-- agent-docs:fill:purpose -->
Take an owner's sound or voice request from a prompt to a shipped, wired and
verified asset without depending on chat memory: what to write, how many takes
to buy, how they are chosen, and how the engine plays them. This is a
repository instruction page reached through the root agent index, not an
installed plugin and not a grant to spend credits or deploy beyond the request.

## Read order
<!-- agent-docs:fill:model -->
Read the [handbook](README.md) (pipeline, files, commands, costs, recipes), the
[prompt cookbook](prompts.md) for the kind of sound you are making, and
[quality](quality.md) for scoring and failure modes. Read
[`docs/AUDIO.md`](../AUDIO.md) for the engine (mix, buses, crew radio
scheduling) and the [audio skill](../../src/audio/SKILL.md) before touching
`src/audio/`.

## Execution
<!-- agent-docs:fill:tasks -->
1. Pin down the moment: what the player does or hears, solo and in a network
   battle, and which existing event or state carries it. A sound with no moment
   is not shipped.
2. Check what exists first: the catalog, the manifests, unused shipped assets
   and the crew script. Rebuilding or re-scoring cached takes is free;
   generation is not.
3. Write the prompt from the cookbook template of its kind: one event, the
   perspective and material, the exclusions, "Seamless loop" or "One-shot",
   under 450 characters, no bright words. For a crew line, write all 13
   languages in the procedure register with the same number of takes, a role, a
   delivery and a context.
4. Estimate the credits (`--dry`), cap the run (`--budget`), then generate.
   Read the key from `ELEVENLABS_API_KEY_FILE`; never print or commit it.
5. Build with a report. Read the ranking, measure the shipped variants, and
   look at a contact sheet. If a defect class gets through, add a scoring rule
   and rebuild from the cache rather than pinning by hand.
6. Wire it: the play site, a cue override if needed, the preload set of its
   moment, and for a crew line its `VOICE_LINES` entry and its moment in
   `voiceTriggers.selftest.mjs`. Never chain a substitute
   (`if (!play(a)) play(b)`).
7. Verify: typecheck, `soundAssets`, `audioEngine`, `voiceTriggers` and
   `crewRadio` selftests, and the affected tests. Run browser probes under the
   GPU capture lock when the mix changed.
8. Document the round in `docs/AUDIO.md` (what changed, credits), commit the
   catalog or script, state manifests, generated manifests and files together,
   and publish or deploy only as requested.

## Patterns and stop conditions
<!-- agent-docs:fill:patterns -->
Generate 2–3× the variants you ship (6–8 for anything with a transient). Fix a
defect class in the scorer and rebuild everything it affects. Rebuild only the
ids or lines you changed. Stop and ask before a run that would spend more than
the owner has allowed, before replacing a sound the owner approved by ear, or
when a prompt fails twice with the same defect: change the prompt or the
approach, do not buy more takes of it.

## Gotchas
<!-- agent-docs:fill:gotchas -->
An "occasional" wrong sound is usually one bad variant (two variants that never
repeat alternate). Sequenced prompts ("a pop, then a motor") can come back
split by silence. `eleven_v4` doubles one- and two-word calls; trimming at
pauses fixes it, more attempts do not. Homophones and digits in transcripts are
not failures. The pool's debug log does not record which variant played. A
cue still decoding is silent by design, so pin what a moment needs instead of
covering it. The radio character is live DSP, so voices are mastered dry.
