# Audio generation handbook

How this game's sounds and crew voices are made: the structure of the pipeline,
the prompts that worked and the ones that did not, how takes are chosen, and the
recipes for adding or repairing a sound. Every shipped sound effect and crew
line was generated with ElevenLabs and processed by the tools in `tools/audio/`.
Nothing in the game is synthesized at runtime, and nothing stands in for a
missing sound.

Start an audio-generation task from [SKILL.md](SKILL.md). Read
[`docs/AUDIO.md`](../AUDIO.md) for how the engine plays these files (mix, buses,
crew radio scheduling) and for the history of each round.

| Page | What it covers |
|---|---|
| this README | the pipeline and its files, data formats, commands, costs, guardrails, recipes |
| [prompts.md](prompts.md) | the prompt cookbook: templates per kind of sound, real prompts that shipped, prompts that failed and why, crew scripts and casting |
| [quality.md](quality.md) | how takes are measured, scored and picked; the catalogue of failure modes (bursts, swells, boings, split takes, seams, doubled calls) and how each was caught |

## The two pipelines

```
Sound effects
  sfx-catalog.mjs ──→ generate-sfx.mjs ──→ sfx-qa.mjs ──→ build-sfx.mjs ──────────→ public/audio/sfx/<group>/<id>_<n>.webm
  (prompt, length,     (raw takes into     (measure     (score, pick, master)        src/audio/sfxManifest.generated.ts
   takes, variants,     the local cache)    each take)   sfx-picks.json pins          tools/audio/.sfx-manifest.json
   preset)

Crew voices
  crew-lines.json ──┐
  crew-voices.json ─┴→ build-voices.mjs ──→ TTS → speech-to-text check → trim → master ──→ public/audio/voice/<lang>/<line>_<n>.webm
  (script, roles,       (per language,                                                     src/audio/voiceManifest.generated.ts
   deliveries, cast)     line and take)                                                    tools/audio/.voice-manifest.json
```

Generation spends credits; everything after it is local and deterministic. A
raw take is cached by its full request, so rebuilding, re-scoring and
re-mastering cost nothing.

## Files

| File | Role |
|---|---|
| `tools/audio/sfx-catalog.mjs` | The sound design: one entry per asset with its prompt, length, prompt influence, loop flag, takes to generate, variants to ship, mastering preset, channels and (for gun reports) a transient shape |
| `tools/audio/generate-sfx.mjs` | Calls `eleven_text_to_sound_v2` (`pcm_48000`, stereo) once per take; `--ids`, `--groups`, `--dry` (plan and credit estimate), `--budget` |
| `tools/audio/sfx-qa.mjs` | Measures a take (level, onsets, decay, spectral bands, loop seams, transient anatomy, low-band glides, silences); `--sheets` renders spectrogram contact sheets |
| `tools/audio/build-sfx.mjs` | Scores the takes, ships the best `variants`, masters them and writes the manifest; `--ids`, `--groups`, `--report out.json`; `tools/audio/sfx-picks.json` pins takes by index |
| `tools/audio/master.mjs` | Mastering presets: mono fold, high-pass, onset-aware trim, fades, loudness or peak normalisation, true-peak ceiling, transient shaping, seamless loop repair with wrap padding, Opus encoding |
| `tools/audio/pcm.mjs` | Measurements: band energy, transient anatomy, `lowToneGlide` (the boing detector), `splitGap` (a take split by silence) |
| `tools/audio/sheet.mjs` | Spectrogram and waveform sheet for shipped files |
| `tools/audio/loudness-receipt.mjs` | Measures shipped files as they ship (decoded WebM/Opus, the same R128 meter) into `tools/audio/sfx-loudness.json`: loudness, true peak, duration, channels and SHA-256 per variant; `--ids` records, `--check` re-measures every recorded asset |
| `tools/audio/elevenlabs.mjs` | The API client: sound generation, text-to-speech, speech-to-text, Voice Library; a content-addressed cache and a credit ledger |
| `tools/audio/crew-lines.json` | The crew script: 13 languages, one entry per line with role, delivery, context and the takes in every language |
| `tools/audio/crew-voices.json` | The cast: a commander voice and a crew voice per language, with their audition measurements |
| `tools/audio/voice-casting.mjs`, `voice-audition.mjs` | Search the Voice Library and audition candidates on working-register calls |
| `tools/audio/build-voices.mjs` | Speaks, verifies, trims and masters the crew packs; `--langs`, `--lines`, `--attempts`, `--budget`, `--no-verify` |

The engine side of a new sound or line lives in `src/audio/`: the play site in
`audioEngine.ts`, a cue override in `soundCues.ts` when the group default does
not fit, a preload set when a moment depends on it, and for a crew line its
priority, cooldown, group and staleness in `voiceLines.ts`. A prop's sound is a
recipe in `propSounds.ts` (every world kind is named there; its layers and their
delays), a map's bed, layer, spots, bells and flyovers are its scene in
`environmentScenes.ts`.

## Data formats

A catalog entry, built by the `sfx()` helper:

```js
sfx('gun_120_close', 'weapons', '<prompt>', 3.5, {
  inf: 0.6,          // prompt_influence: 0.4 beds, 0.45 default, 0.6 shots and impacts, 0.75 small arms
  variants: 3,       // files shipped (the engine picks one per play, never the same twice running)
  takes: 6,          // raw takes generated to choose from (more takes, better picks, more credits)
  proc: 'gunshot',   // mastering preset in master.mjs
  shape: [12, 80, -20],  // transient designer: hold ms, decay tau ms, floor dB under the peak
})
```

`loop: true` makes a loop (the preset repairs the seam and the manifest carries
the loop points); `ch: 'stereo'` keeps a bed, sting or flyover in stereo;
`punch: true` (the default for the `impact` preset) wraps the prompt as a loud,
hard-attack sound effect.

A crew line:

```json
{
  "id": "drone_launch",
  "role": "commander",
  "delivery": "clipped, focused",
  "context": "We launch our own FPV drone from the tank.",
  "en-US": ["Drone up.", "Launching drone."],
  "de": ["Drohne startet.", "Drohne gestartet."]
}
```

`role` picks the voice (`commander`, or the shared gunner/loader/driver voice).
`delivery` goes to the speech model as an audio tag, `context` tells writers
and the trigger test what game moment the line belongs to, and every language
carries the same number of takes. Rewriting the file with Python's
`json.dumps(data, indent=2, ensure_ascii=False)` round-trips it byte for byte.

## Commands

All generation commands read the key from `ELEVENLABS_API_KEY` or from a file
named by `ELEVENLABS_API_KEY_FILE`. Keep the key in a file outside the
repository and never print it.

```bash
npm run audio:sfx:generate -- --ids gunship_missile_own --dry
```

```bash
npm run audio:sfx:generate -- --ids gunship_missile_own
```

```bash
npm run audio:sfx:build -- --ids gunship_missile_own --report /tmp/build-report.json
```

```bash
npm run audio:voices:build -- --lines drone_launch,drone_lost
```

```bash
npm run audio:voices:build -- --langs ja --lines firing --attempts 10
```

## Costs

From the local ledger (`ledgerSpend()` in `elevenlabs.mjs`, which sums
`~/.cache/cot-elevenlabs/ledger.jsonl`), 2026-10-02 to 10-04:

| Kind | Credits |
|---|---|
| Sound generation | 61,934 |
| Text-to-speech | 20,717 |
| Speech-to-text verification | 3,833 |
| **All** | **86,484** |

Rules of thumb: sound generation costs about 11 credits per second of
requested audio per take, so a 3 s asset with 4 takes is about 130 credits. A
crew line in all 13 languages with two takes and verification costs about 130
credits (nine lines cost 1,202). A full recast and rebuild of all 13 packs was
about 10,900. Use `--dry` and `--budget` before any large run. Rebuilding from
the cache is free; regenerating is not.

## Guardrails

- The key never enters the repository, a log or chat. If it was ever pasted,
  rotate it.
- Every sound is a generated recording. Do not synthesize a tone, and do not
  play one sound when another is missing (`if (!play(a)) play(b)`): a cue a
  moment depends on is pinned in the battle set instead, and one still decoding
  stays silent. `src/audio/voiceTriggers.selftest.mjs` fails on a chained play
  and on a crew covering for another's missing take.
- New sounds come from the catalog, never hand-dropped files. Commit the
  catalog, the state manifests (`tools/audio/.sfx-manifest.json`,
  `.voice-manifest.json`), the generated manifests and the shipped files
  together.
- Rebuild only what you changed (`--ids`, `--lines`): a full rebuild re-masters
  everything and churns hundreds of files.
- The output is licensed for commercial use under ElevenLabs' terms for paid
  plans; the attribution record is in [`docs/ATTRIBUTION.md`](../ATTRIBUTION.md).

## Recipes

**Add a sound effect.**
1. Write the catalog entry (see [prompts.md](prompts.md) for the template of
   its kind). Pick `takes` at 2–3× `variants`; guns and anything with a
   transient get 6–8.
2. `npm run audio:sfx:generate -- --ids <id> --dry`, then without `--dry`.
3. `npm run audio:sfx:build -- --ids <id> --report <file>`; read the ranking in
   the report and look at a contact sheet (`node tools/audio/sfx-qa.mjs --ids <id> --sheets <dir>`).
   Then `node tools/audio/loudness-receipt.mjs --ids <id>`: `sfxLoudness.selftest.mjs`
   holds the shipped files to their preset by hash.
4. Play it from the engine, add a cue override if needed, add it to the preload
   set of the moment that plays it, and give it a check in the engine or
   trigger selftest.
5. `node src/audio/soundAssets.selftest.mjs` (every engine reference must exist
   in the manifest), then the audio selftests.

**Repair a bad take.** First rebuild from the cache, which is free: a scoring
rule in `build-sfx.mjs` that catches the defect (see [quality.md](quality.md)),
or a pin in `sfx-picks.json`. Regenerate only when every cached take has the
defect, and then change the prompt rather than just adding takes.

**Add a crew line.**
1. Add it to `crew-lines.json` in all 13 languages with the same number of takes,
   a role, a delivery and a context (see [prompts.md](prompts.md#crew-scripts)).
2. Add its `VOICE_LINES` entry in `src/audio/voiceLines.ts` (priority,
   cooldown, group, staleness).
3. `npm run audio:voices:build -- --lines <id>` and read the flagged takes at
   the end of the log.
4. Trigger it from the engine and add its game moment to
   `src/audio/voiceTriggers.selftest.mjs`. That test fails for a line no moment
   asks for, and `crewRadio.selftest.mjs` fails unless every pack carries every
   line.

**Re-roll flagged crew takes.** `--attempts 10` on just those languages and
lines; earlier attempts come from the cache.

**Remove a sound or line.** Delete it from the catalog or script and rebuild
(even with a filter that matches nothing): dropped assets and lines leave the
disk and the manifests.
