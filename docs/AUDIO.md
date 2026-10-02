# Audio: the sound engine and how its sounds were made

Claude of Tanks' sound is a sample-driven engine (`src/audio/`) playing
first-party sound effects and national crew radio packs that were generated
offline with ElevenLabs and then measured, selected and mastered by the tools
in `tools/audio/`. Nothing calls ElevenLabs at runtime: only the mastered
WebM/Opus files and two generated manifests ship.

This document covers the runtime design, the generation pipeline end to end,
the feedback rounds that shaped it, and how to change or extend it. Module
contracts are summarised in [ARCHITECTURE.md §3.9](ARCHITECTURE.md); provenance
and the voice cast are in [ATTRIBUTION.md](ATTRIBUTION.md#audio-publicaudio--generated-for-this-project-with-elevenlabs-no-sampled-third-party-recordings).

## What ships

| Payload | Where | Size | Loaded |
|---|---|---|---|
| 347 sound-effect assets, 554 variant files | `public/audio/sfx/<group>/<id>_<n>.webm` | 16 MB | per battle: the battle set at the battle phase edge, everything else on first use |
| 13 crew radio packs × 98 lines × 1–4 takes | `public/audio/voice/<lang>/<line>_<n>.webm` | ~1.5 MB per language | only the crew's pack (and English if a national take is missing) |
| SFX manifest | `src/audio/sfxManifest.generated.ts` | | bundled in the lazy audio chunk |
| Voice manifest | `src/audio/voiceManifest.generated.ts` | | bundled in the lazy audio chunk |

Procedural Web Audio (`src/audio/procedural.ts`) supplies what is better
synthesized than sampled: the loading tone, the fire klaxon, the ammo-rack beep,
the heartbeat, gear and turbine whines, the radio squelch, the sub-bass thump
under heavy reports, and fallbacks for every sample while it decodes (and for
browsers without WebM/Opus decode, i.e. Safari before 17.4).

## Runtime

### Boot and loading

`src/audio/lazyAudio.ts` keeps the engine out of the boot bundle. The
AudioContext is created in the first user gesture; until then every call is a
no-op, so headless captures never touch audio hardware. The engine
(`audioEngine.ts`, a 160 kB / 52 kB gzipped lazy chunk including the manifests)
arrives after the first paint.

`assetLibrary.ts` reads the manifest, probes WebM/Opus decode with a 650-byte
embedded file, and decodes each asset on an `OfflineAudioContext` at the rate
the build chose (24 kHz for assets with almost no energy above 12 kHz, else
48 kHz; mobile caps everything at 24 kHz and keeps one variant per asset).
Crew packs decode on their own lane so the first radio call never waits behind
a battle's worth of sound effects.

At every battle phase edge the engine warms and **pins** its battle set: every
weapon report bank, the combat, occupied-hull, interface and mode sets, the
map's scene, running gear, and the roster's powertrains (the solo loader also
awaits this, bounded to 3.5 s, before the reveal). Pinned assets and live loops
are never evicted; the decoded budget (200 MB desktop, 96 MB mobile) only caps
the unpinned extras. One battle's working set is about 120–140 MB decoded on
desktop and 65–80 MB on mobile.

### Placing a sound: the voice pool

Every sample plays through `voicePool.ts`, which applies the asset's cue
profile from `soundCues.ts` (per manifest group, with per-asset overrides):

- **Space**: `world` (positioned), `hull` (attached to the occupied tank) or
  `flat` (interface, radio, beds).
- **Distance law**: `distanceAttenuationDb(distance, refM, rolloff)` plus 6 dB/km
  of excess loss. Gunfire, impacts and explosions use a compressed game-mix
  curve (weapons: reference 25 m, rolloff 0.6, so a cannon at 100 m is 8 dB
  down instead of 19, and at 400 m 17 dB instead of 33). Small clutter is
  short-ranged: props 260 m, other hulls' brakes, gears and suspension
  140–150 m, bullet impacts 120–180 m.
- **Air and terrain**: an ISO 9613 air-absorption lowpass, terrain occlusion
  from seven height samples on the line of sight (up to 9 dB and a strong
  lowpass), speed-of-sound delay beyond 18 m (Earth 343 m/s, Mars 240 m/s and
  14 dB thinner; vacuum on the Moon).
- **HDR window**: the loudest recent event sets the window top (instant attack,
  12 dB/s release). A new voice more than 18 dB below it is trimmed by half the
  excess (at most 12 dB); one more than 50 dB below is not started. The loudest
  sound always plays in full.
- **Budgets**: 32 voices on desktop, 16 on mobile, with per-asset instance caps
  and re-trigger cooldowns. When the budget is full the lowest-priority
  one-shot is stolen; loops (beds, fires) are never stolen.

### The mix

`mixer.ts` builds this graph (levels in `mixPolicy.ts`):

```
weapons, impacts, environment, vehicles ─→ world sum → snapshot lowpass/level → voice duck ─┐
own (hull engine, mechanisms), ownCombat (hull gun, interior hits) → snapshot lowpass/level ─┤
interior, cinematic, ambience (ducked under radio) ───────────────────────────────────────────┼→ body → concussion → ┐
ui, music, voice, alarm ──────────────────────────────────────────────────────────────────────────────────────────────┴→ glue → soft clip → master
```

- Gunfire leads. Weapons, impacts and the occupied hull's own gun run at full
  level with a +4–5 dB low shelf at 110 Hz; engines (0.5), ambience (0.45),
  radio (0.72) and the interface (0.5, with a high-shelf cut) sit underneath.
- The glue compressor has a 12 ms attack and 2.5:1 ratio so cannon transients
  reach the tanh soft clip, which catches the peaks.
- Settings channels from the Sound tab (`cot.settings.v1`, live via
  `ui:volumes`) scale the buses: master, engine, gunfire (combat), ambience,
  interface, voice. The occupied gun answers to the gunfire slider.
- Snapshots: battle, scoped (the occupied gun and engine move to an
  interior/headset spectrum, the world dulls), paused, kill-cam (live world
  ducked, cinematic bus up), spectating, garage. Pause and kill-cam end with the
  battle.
- Concussion: a heavy round through the occupied hull, or an HE burst or
  vehicle explosion within a bore-scaled radius (9 m per 100 mm, at most 16 m),
  muffles the mix and recovers over 4.5 s, with tinnitus on the strongest. The
  crew's own gun never triggers it, and a settings toggle turns it off.

### Vehicles

`vehicleAudioProfiles.ts` resolves each spec to a powertrain family —
`turbine_agt` (Abrams), `turbine_gtd` (T-80), `diesel_v12_soviet`,
`diesel_two_stroke` (Leopard 1/Chieftain/T-64 lineage), `diesel_v12_modern`,
`diesel_aircooled` (M48/M60/Merkava 1–3), `diesel_ifv`, `gasoline_v12` — plus
modifiers (turbo whistle, turbine auxiliaries, hybrid-electric drive, turret
drive type, loader kind, mass class).

`vehicleAudioModel.ts` turns speed, throttle, slope and module health into RPM,
load and gear. Manual and automatic gearboxes shift near the governor and hold
0.6–1.1 s between shifts, with a downshift band well below the lower gear's top
so a tank crawling at a shift point never hunts; turbines spool instead of
shifting. It also derives track speed (with yaw scrub), braking, skids,
landings, bumps, stalls and restarts.

`vehicleRig.ts` plays the result: idle/low/mid/high engine bands crossfaded and
pitched by RPM, start and wind-down, light/heavy track sets per surface (earth,
hard, mud, sand, snow; water runs the mud set under a wading loop) at slow/fast
speed, squeal, skid and damaged-engine knock loops, and shift, brake,
suspension and stall one-shots. The occupied hull adds turret drive, elevation
servo, cabin hum and rattle. Remote rigs use levels of detail: own, near
(within 140–165 m, five on desktop) and far (to 900–1000 m, eight).

### Weapons

`weaponAudio.ts` classifies every gun into one of fifteen report classes: rifle
and heavy machine guns, 20/25/30/40/50 mm autocannons, 90/105/120/125/130/152 mm
cannons, ATGM and heavy rocket launchers (sound profiles refine the trim, e.g.
the BMP-3's low-pressure 100 mm). Each class has a close bank and a distant
bank crossfaded by range, a gun tail matched to the map (open, forest, urban,
mountain), and for the occupied gun in the sight an interior report. A
synthesized sub-bass thump (a sine falling from about 78 to 26 Hz with a short
low-passed noise kick) sits under every cannon within 700 m, HE bursts,
vehicle explosions and penetrations of the occupied hull, because the
generated reports are thin below 80 Hz. Shell flybys and near-miss cracks are
timed from the shell's closest approach and muzzle velocity. Reloads play the
loader's choreography (manual, carousel, bustle, autocannon, missile,
magazine, intra-clip) at the matching reload progress.

### Environment

`environmentScenes.ts` gives each of the 33 maps a scene: a stereo bed, an
optional water or machinery layer, weighted spot sounds placed 40–380 m away at
random bearings (birds higher; no bells, birdsong, breaking glass or alarms —
crows, hawks, gulls, wind, rubble and machinery instead), a distant-war bed in
battle, the gun tail and a procedural reverb. The garage is an indoor scene:
an audible room tone (+7 dB) with workshop clanks, a crane chain and a
workshop radio 3–14 m away.
Atmosphere events (artillery, flak, AA, flyovers) and destructible props
(trees, fences, walls, cars, crates, rubble) have their own assets.

### Crew radio

`voiceLines.ts` defines 98 lines with priority (0–4), per-line and per-group
cooldowns and staleness; `crewRadio.ts` schedules them with radio discipline:
one transmission at a time, survival calls interrupt chatter, a 0.8 s gap, a
two-line queue, stale calls dropped rather than played late. Routine chatter
(reload done, shot results, kill confirms by allies) is probability-gated and
spot calls are throttled to one per five seconds unless several contacts
appear at once.

A hull's crew speaks its nation's language (en-US, en-GB, de, ru, uk, zh, fr,
sv, ja, ko, it, pl, he), or English or the interface language by setting.
Every line runs through a live intercom chain — a 24 dB/oct 320 Hz–3.4 kHz
band, a 1.9 kHz presence peak, compression, a tanh drive, a 4.6 kHz headset
speaker roll-off, a gated static bed and squelch — measured on the live
output at 77–93 % of the energy inside 300–3400 Hz and under 0.1 % above 6 kHz
in every language. A damaged radio module narrows the band, adds drive and
drops syllables.

### Settings and debugging

The Sound tab (`src/ui/settings.ts`) has the six volume sliders, the crew
language (national / English / interface), the concussion toggle and the
critical-damage heartbeat. After resume, `window.__COT_AUDIO` exposes the
context, a master PCM tap (`startTap` / `stopTap` / `readTapB64`), the sound-route
log, the sfx log (asset, start, gain, rate, distance, bus), the voice log,
library stats, listener and rig state, effective bus levels, and test hooks
(`play`, `preload`, `sayVoice`, `setEngineProbeSolo`, `forceCrewLanguage`).

## How generation worked

Everything was generated on the owner's paid ElevenLabs Creator plan on
2026-10-02 (paid plans license generated output for commercial use under
ElevenLabs' terms). The API key is read from `ELEVENLABS_API_KEY` or a file named
by `ELEVENLABS_API_KEY_FILE` and is never written to the repository.

`tools/audio/elevenlabs.mjs` is a small client for the sound-generation,
text-to-speech, speech-to-text and Voice Library endpoints. Every response is
cached content-addressed under `~/.cache/cot-elevenlabs/{sfx,tts,stt}` (keyed by
the full request), every billed call is appended to
`~/.cache/cot-elevenlabs/ledger.jsonl` with the API's own `character-cost`, and
re-running any step with unchanged inputs spends nothing.

### Sound effects

```
sfx-catalog.mjs ──→ generate-sfx.mjs ──→ sfx-qa.mjs (measure) ──→ build-sfx.mjs (score, pick, master) ──→ public/audio/sfx + manifest
   347 entries        772 raw takes         onsets, decay, seams,     master.mjs presets, picks override
   prompt, dur,       eleven_text_to_       spectral bands,
   takes, variants    sound_v2, pcm_48000   clipping
```

1. **Catalog** (`tools/audio/sfx-catalog.mjs`). One entry per asset: id, group
   (the output directory and the runtime cue group), an original prompt, a
   duration, prompt influence, loop flag, how many raw takes to generate, how
   many variants to ship, and a mastering preset.
2. **Generation** (`generate-sfx.mjs`). Each take is a separate call to
   `eleven_text_to_sound_v2` at `pcm_48000` (stereo, 16-bit). The model has no
   seed, so the take number is part of the cache key; a run replaces an asset's
   take list in `~/.cache/cot-elevenlabs/sfx-index.json`. `--ids`, `--groups`,
   `--budget` and `--dry` control a run.
3. **Measurement** (`sfx-qa.mjs`). Per take: peak and RMS, onset count and first
   onset, decay time, spectral band shares (20–150 Hz, 150–800 Hz, 0.8–4 kHz,
   4–20 kHz), loop-seam level step and spectral match, and clipped runs. It also
   renders spectrogram contact sheets for review (`--sheets`).
4. **Selection** (`build-sfx.mjs`). Takes are scored: level, clipping, a hard
   first onset for punchy presets, exactly one onset for single-shot assets (MG
   and autocannon close reports, bullets, the radio key), loop seams for loops,
   dead-air rejection, low-end weight for guns and blasts (reward 20–150 Hz,
   penalise harsh highs), and darkness for the interface, stingers and
   mechanisms. The best `variants` takes ship; an optional
   `tools/audio/sfx-picks.json` (`{ "<id>": [take, …] }`) pins specific takes. Single-shot assets are truncated after the first
   shot.
5. **Mastering** (`master.mjs`). Per preset: mono fold without phase
   cancellation, high-pass, trim, fades, a loudness target, a true-peak ceiling
   and the Opus bitrate. Loops are repaired at the seam and wrap-padded
   (`[last 4096 samples | body | first 4096]`) so `loopStart`/`loopEnd` from the
   manifest never click. Close weapon reports land at −9 LUFS momentary max,
   impacts −10, foley −14, the interface −16, ambience beds −24 LUFS integrated.
   Assets with almost no energy above 12 kHz are stored at 24 kHz.
6. **Manifest**. `build-sfx.mjs` writes `src/audio/sfxManifest.generated.ts`
   (group, variant count, durations, channels, rate, loop points, size) and the
   incremental state `tools/audio/.sfx-manifest.json`.

**Prompt lessons.**
- Short machine-gun and autocannon prompts produced bursts. "Gunshot sound
  effect: one single…" framing, longer durations, single-shot scoring and
  first-shot truncation fixed them.
- Every prompt ends with "no music, no voices"; impacts add "very loud, with an
  immediate hard attack".
- The model rolls off the deep low end, which is why cannons and blasts get the
  synthesized sub-bass layer and a low shelf.
- Words like "ding", "chime", "beep", "bright" or "triumphant" produce exactly
  the light, jingly sounds a serious war game should not have. The interface is
  described as heavy hardware ("a heavy armoured-vehicle console push button…
  a short dull mechanical clunk with no ring") and the stingers as grave
  war-film brass and timpani with "no fanfare".

### Crew radio voices

```
crew-lines.json ─┐                    crew-voices.json
 98 lines,       ├──→ build-voices.mjs ──→ eleven_v4 TTS ──→ scribe_v2 STT check ──→ master 'voice' ──→ public/audio/voice + manifest
 13 languages,   │    (per language,       [delivery] text,     best of up to 3        −18 LUFS, 24 kHz
 deliveries ─────┘     per line, per take) stability 0.6        attempts               mono Opus
```

1. **Script** (`tools/audio/crew-lines.json`). Each line has a speaking role
   (the commander's voice, or the shared gunner/loader/driver voice), an English
   delivery direction, the American English master and one rendering per
   language. Renderings follow what each army's armoured crews actually say over
   the intercom, not literal translation: German "Brand!" for a vehicle fire
   because "Feuer" is the firing order, British "Contact, wait out", Russian
   nominative ammunition calls ("Бронебойный"), IDF clock-position contact calls,
   spelled-out numbers and no Latin acronyms where a speech engine would misread
   them.
2. **Casting** (`voice-casting.mjs`, `voice-audition.mjs`). The Voice Library is
   searched per language for native male voices without live moderation or a
   credit multiplier, and candidates are ranked toward serious, mature profiles
   (deep, calm, authoritative, narration) and away from upbeat, energetic,
   social-media or young ones. Each candidate then reads two working-register
   calls; takes are round-tripped through speech-to-text and measured for pitch
   and spectral centroid. The cast (`tools/audio/crew-voices.json`) takes the
   deepest, most authoritative clean voice as commander and a distinct, equally
   serious voice as crew.
3. **Synthesis** (`build-voices.mjs`). Every take is `eleven_v4` speech in the
   crew language with the line's delivery as a bracketed audio tag (e.g.
   `[calm, clipped] Contact front.`), stability 0.6, similarity 0.8.
4. **Verification**. Each take is transcribed with `scribe_v2` and compared to
   the script (normalised Levenshtein similarity). A transcript that repeats
   the call back to back ("HE. HE.", a stuttered restart) is held under the
   bar, since by edit distance alone a doubled short call scores 0.5. Below
   0.62 (0.34 for calls of four characters or fewer) a take is regenerated —
   three attempts by default, and because earlier attempts come from the
   cache, `--attempts 8` on the flagged lines pays only for the new ones — and
   the best is kept. Takes still under 0.34 are reported for review; most
   are exact homophones the transcriber spells differently (Japanese
   装填 / 争点, 徹甲弾 / 鉄鋼弾, 奪取 / ダッシュ), which no text comparison can
   separate.
5. **Mastering**. The `voice` preset: trim, fades, −18 LUFS integrated, 24 kHz
   mono Opus at 32 kbps. The radio character is not baked in: it is the live
   intercom chain, so it can degrade with the radio module.

### Rounds

- **2026-10-02, first round.** The synthesized engine and its 111 baked files
  were replaced: 347 assets, 13 crew packs, the new engine, the Sound tab
  settings. Deployed as deploy 166.
- **2026-10-02, feedback round.** The owner reported gamey voices, too much
  sound at once, guns that were hard to hear and not bassy, inaudible garage
  ambience, and light, jingly sounds. Causes and fixes:
  - Gunfire followed a realistic inverse-distance law against constant engine,
    radio and ambience layers, and a global HDR duck lowered the whole world
    (including the cannon that triggered it) by up to 11 dB. Now a compressed
    distance curve, a per-voice HDR trim, the crew's own gun on the gunfire
    channel at full level, lower constant layers, a low shelf and a sub-bass
    layer.
  - Entry paths that skipped the solo loader left the battle set cold, so first
    shots fell back to synthesized reports; the engine now warms and pins its
    own battle set at the phase edge.
  - Density: a 32/16 voice budget, short ranges for clutter, a 0.8 s radio gap,
    probability gates on chatter, a spot-call throttle, no hover ticks, sparser
    ambient spots, and fixes for gear hunting and turret-stop / gun-limit
    clunks firing on every servo flicker.
  - The script was rewritten into a terse procedure register in all 13
    languages and recast with serious voices; the interface, stingers and light
    foley were regenerated as heavy, low, mechanical sounds, the cannon and
    blast takes re-picked for low end, and the light ambient spots (cowbells,
    buoy bells, songbirds, skylarks, tropical birds, breaking glass, car alarms)
    replaced by darker ones.
  - The garage scene got an audible room tone and indoor spot placement.

### Cost

Credits from the local ledger (`ledgerSpend()` in `elevenlabs.mjs`), both
rounds:

| Kind | Credits |
|---|---|
| Sound generation | about 29,000 |
| Text-to-speech (both casts and builds, auditions) | about 11,600 + the second voice build |
| Speech-to-text verification | about 2,100 |

## Changing or extending it

| Task | Steps |
|---|---|
| Add a sound | Add a catalog entry → `npm run audio:sfx:generate -- --ids <id>` → `npm run audio:sfx:build -- --ids <id>` → play it from the engine (and add a cue override if its group default does not fit) → `node src/audio/soundAssets.selftest.mjs` (it checks every engine reference exists in the manifest) |
| Replace a weak take | Re-run `build-sfx --ids <id>` after adjusting the prompt or `takes`, or pin takes in `tools/audio/sfx-picks.json` |
| Add or change a voice line | Edit `crew-lines.json` (all 13 languages, same number of variants) and its `VOICE_LINES` entry in `voiceLines.ts` → `npm run audio:voices:build -- --lines <id>` |
| Rebuild one language | `npm run audio:voices:build -- --langs de` |
| Recast a language | `voice-casting.mjs --search`, audition with `voice-audition.mjs --candidates <file> --langs <lang>`, update `crew-voices.json`, rebuild the language |
| Retune the mix | `mixPolicy.ts` (levels, HDR, snapshots, budgets), `soundCues.ts` (per-asset distance laws and caps), then the mix-balance probe |

All generation commands need `ELEVENLABS_API_KEY` or `ELEVENLABS_API_KEY_FILE`.
Partial rebuilds only touch the named assets or lines (take files are matched
exactly, so a rebuild of `fire` never deletes `fire_out`).

## Verification

Headless selftests (all in `npm test`):

| Test | Covers |
|---|---|
| `src/audio/audioMath.selftest.mjs` | distance law, air absorption, atmospheres, delay, Doppler, crossfades, listener frame and pan side |
| `src/audio/vehicleAudioProfiles.selftest.mjs` | powertrain mapping, families, crews, loaders, drives |
| `src/audio/weaponAudio.selftest.mjs` | bore classes, ordering, report trims, reload choreography |
| `src/audio/vehicleAudioModel.selftest.mjs` | idle, gearboxes, no gear hunting, turbine spool, braking, scrub, landings, stalls |
| `src/audio/soundAssets.selftest.mjs` | manifests against files, every engine reference, families, tracks, scenes, packs, payload budgets |
| `src/audio/assetLibrary.selftest.mjs` | pinning, eviction and reload, voice bytes, the mobile variant cap |
| `src/audio/crewRadio.selftest.mjs` | radio discipline, interrupts, stale drops, national packs with fallback, damage, language resolution |
| `src/audio/audioEngine.selftest.mjs` | the engine against the shipped manifests: rigs, crews, scenes, weapon layering and delay, HDR trim, sub-bass, reloads, hits, edge cases, destruction, concussion, kill-cam, panning, scope, pause, garage |
| `src/audio/lazyAudio.selftest.mjs` | deferred engine and loading tone |

Browser probes (they take the machine-wide GPU capture lock; set
`COT_SHOTS_LOCK_TIMEOUT_MS=10800000` on a busy machine):

| Probe | Checks |
|---|---|
| `node tools/audio-mix-balance.mjs` | garage audibility, gunfire at 15/150/400 m over the idle battle bed, the radio under a near cannon, sound starts and radio lines per second in live combat |
| `node tools/sfx-smoke.mjs` | every scene's assets, the calibre ladder, the distance crossfade and propagation delay, routing, jitter, volley headroom (battle held frozen) |
| `node tools/voice-smoke.mjs` | the national crew, live language switching through the bus and the Sound tab, all 13 packs through the radio chain |
| `node tools/audio-probe.mjs` | the full event, voice and bus matrix with recordings |
| `node tools/audio-spatial-killcam-probe.mjs` | arcade/sniper perspective, cannon and engine distance falloff, rams, the kill-cam replay |
| `node tools/pause-probe.mjs` | the pause duck and resume |

## Known limits

- Browsers without WebM/Opus decode (Safari before 17.4) hear the procedural
  fallbacks.
- `/audio/` files are revalidated by ETag (only hashed `/assets/` are
  immutable), so a regenerated file with the same name is picked up on the next
  load at the cost of a revalidation per file.
- The sound-generation model has no seed: rebuilding with an unchanged prompt
  reuses the cache, but regenerating without it produces different takes.
- The renderings were written for each army's register and checked by
  speech-to-text, not by native speakers or veterans; corrections go in
  `crew-lines.json`.
