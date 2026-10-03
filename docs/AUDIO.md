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
| 386 sound-effect assets, 627 variant files | `public/audio/sfx/<group>/<id>_<n>.webm` | 18 MB | per battle: the battle set at the battle phase edge, the aircraft set on first sight of an aircraft, everything else on first use |
| 13 crew radio packs × 97 lines × 1–4 takes | `public/audio/voice/<lang>/<line>_<n>.webm` | ~1.5 MB per language | only the crew's pack (and English if a national take is missing) |
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
no-op, so headless captures never touch audio hardware. The first click or key
press anywhere also loads the engine, so the garage's hangar and its controls
are heard before any battle (until 2026-10-02 the engine waited for the Battle
button, and the garage was silent on a first visit). The engine
(`audioEngine.ts`, a 160 kB / 52 kB gzipped lazy chunk including the manifests)
arrives after the first paint.

`assetLibrary.ts` reads the manifest, probes WebM/Opus decode with a 650-byte
embedded file, and decodes each asset on an `OfflineAudioContext` at the rate
the build chose (24 kHz for assets with almost no energy above 12 kHz, else
48 kHz; mobile caps everything at 24 kHz and keeps one variant per asset).
Crew packs decode on their own lane so the first radio call never waits behind
a battle's worth of sound effects.

At every battle phase edge, and when it is adopted after that edge has passed, the engine warms and **pins** its battle set: every
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
  curve (weapons: reference 35 m, rolloff 0.55, so a cannon at 100 m is 5 dB
  down instead of 19, and at 400 m 12 dB instead of 33). Small clutter is
  short-ranged: props 260 m, other hulls' brakes, gears and suspension
  140–150 m, bullet impacts 120–180 m.
- **Air and terrain**: an ISO 9613 air-absorption lowpass, terrain occlusion
  from seven height samples on the line of sight (up to 9 dB and a strong
  lowpass), speed-of-sound delay beyond 18 m (Earth 343 m/s, Mars 240 m/s and
  14 dB thinner; vacuum on the Moon).
- **Own hits**: a round fired by the listener's tank (the occupied one, or the
  one being watched) is heard landing under `OWN_HIT_FOCUS`: three times the
  cue's reference distance, rolloff at most 0.55, at least 2.6 km of range and
  no HDR culling. It still arrives at the speed of sound, darkened by the air,
  from the target's bearing.
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
ui, music, voice, alarm ──────────────────────────────────────────────────────────────────────────────────────────────┴→ glue → limiter → soft clip → master
```

- Gunfire and our own tank lead. Weapons (1.5), impacts (1.3) and the occupied
  hull's gun (1.4) carry a +4–5 dB low shelf at 110 Hz; our own engine and
  running gear (0.6) and the loading and turret machinery inside it (0.95) sit
  above other tanks' engines (0.5); ambience (0.37, beds mastered at −21 LUFS
  and high-passed at 90 Hz on the bus), radio (0.28) and the interface (0.6,
  with a high-shelf cut) sit underneath.
- The levels are measured on the master by `tools/audio-mix-balance.mjs`. Its
  first run, on deploy 169's louder engine and ambience (0.8 and 0.65), put
  the idle battle bed at −22 dBFS with a cannon at 15 m only 11.6 dB above it.
  The bed was 79 % below 200 Hz: loudness-normalised (K-weighted) beds carry
  far more rumble than they sound like, and the near cannon cannot get louder
  (the glue compressor and soft clip hold its short-term level near −10
  dBFS). Four runs later — the ambience bus high-pass, idling engines quieter
  than loaded ones, cannons keeping their close report to about 150 m, and
  the trims above — the bed is −27.7 dBFS, a cannon stands 17.9, 11.1 and
  7.9 dB above it at 15, 150 and 400 m, and the radio sits 8.4 dB under a
  near cannon.
- The glue compressor has a 12 ms attack and 2.5:1 ratio so cannon transients
  reach the limiter after it (−2 dBFS, 20:1, 2 ms attack, 90 ms release): the
  compressor's built-in look-ahead lets it take a crack's peak down smoothly,
  and the tanh soft clip behind it is only the last resort. Before the limiter
  the cracking guns rode the clip (a near cannon put 111 samples at its knee,
  our own gun 254), which squares a crack off into old-film grit.
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
pitched by RPM (an idling engine at about a third of its full-load level),
start and wind-down, light/heavy track sets per surface (earth,
hard, mud, sand, snow; water runs the mud set under a wading loop) at slow/fast
speed, squeal, skid and damaged-engine knock loops, and shift, brake,
suspension and stall one-shots. The occupied hull adds turret drive, elevation
servo, cabin hum and rattle. Remote rigs use levels of detail: own, near
(within 140–165 m, five on desktop) and far (to 900–1000 m, eight). A rig's
range hysteresis never makes a nearby tank read as our own: until 2026-10-02 an
existing rig within 25 m was promoted to the own perspective (full level,
centred, with the cabin extras).

### Weapons

`weaponAudio.ts` classifies every gun into one of eighteen report classes:
rifle and heavy machine guns, 20/25/30/40/50 mm autocannons,
90/105/120/125/130/152 mm cannons, ATGM and heavy rocket launchers, and the
AC-130's autocannon, howitzer and missiles (sound profiles refine the trim,
e.g. the BMP-3's low-pressure 100 mm, or name a class outright, as the
gunship's shells do). Each class has a close bank and a distant bank
crossfaded by range (a cannon keeps its close report to about 150 m), a gun
tail matched to the map (open, forest, urban, mountain; a machine-gun burst
gets it once per 0.22 s beat, not once per round), and for the occupied gun
in the sight an interior report. Our own gun has a dedicated report per bore
(`gun_own_medium` for 90–105 mm, `gun_own_large` for 120–125 mm,
`gun_own_heavy` for 130–152 mm, and `missile_launch_own` for launchers),
fuller and more detailed than anyone else's, as World of Tanks keeps the
player's shot apart, with the breech's recoil and run-out (`gun_recoil_mech`)
under it.

A gun report is a crack: the close reports were regenerated on 2026-10-02 and
measure 13–22 dB of crest, their loudest millisecond 4–41 ms after the onset
and at most 22 % of their body below 100 Hz (see Sound effects below). Under
each one, within the close range, plays a procedural muzzle blast
(`renderMuzzleBlast` in `procedural.ts`, rendered once per bore and played
through the voice pool like a recorded report): the Friedlander pressure pulse
of the charge, with an instant rise and a positive phase of 0.15 ms + 0.02 ms
per millimetre of bore (0.3 ms for a rifle round, 2.6 ms for a 120 mm gun),
its reflection off the ground, the punch of the expanding gas (a heavily damped
low partial only large charges have) and the gas roar. It sits 4 dB under a
cannon's report and 6 dB under autocannons and machine guns (2 dB higher for
our own gun); air absorption leaves only a thud at range. Until then a
synthesized sine sweep from about 78 to 26 Hz sat under every cannon within
700 m; 0.5–0.8 s of falling sine is a trailer boom, it made gunfire read as
explosions, and it is gone from the firing path (HE bursts, vehicle
explosions and penetrations of the occupied hull keep their thump). Shell
flybys and near-miss cracks are timed from the shell's closest approach and
muzzle velocity.

### Your own tank: loading and machinery

Reloads play the loader's choreography (`resolveReloadCuePlan`) at the matching
reload progress, close-miked in the turret on the interior bus:

| Loader | Sequence |
|---|---|
| Manual | breech drops open, the case is thrown out, the ready-rack door slides open, a round comes out, the door shuts, the round is rammed home (a separate charge for 152 mm), the breech closes |
| Carousel autoloader | the stub is kicked out, the carousel turns, the cassette lifts, the chain rammer drives the projectile and then the charge, the breech closes |
| Bustle autoloader | the case is ejected, the next round indexes, the ram, the breech closes |
| Drum magazine | the drum turns to its first empty chamber, four rounds are fed in one by one, the drum indexes, the breech closes; between rounds of a clip, the drum turns and a round is rammed |
| Autocannon | the box latches into the feed, the belt and bolt clatter, the latch |
| Missile | the canister slides into the tube, the second one, the launcher arm swings up, the latch |

Every cycle ends in the lock that says the gun is ready. The turret drive has
a start when a real slew begins (never on a servo flicker), its electric or
hydraulic loop, and a braking clunk; the elevation servo hums. At the end of
its elevation travel the gun gives a soft strain through the mount, never more
than once in 2.5 s and with no crew call (the old "Can't depress further" was
dropped as corny).

### Hits and misses

There is no interface hit marker. A hit is confirmed the way a crew
experiences it:

- **The impact at the target.** Armour hits crossfade by range from the close
  banks (tearing metal, a heavy clang, a dull thud) into distant banks (a
  crack, knock or clang with an outdoor echo) between about 140 and 620 m, for
  every shooter. HE and HEAT add their blasts, ERA its cassettes. Our own
  rounds carry under the own-hit law above, so a penetration at 700 m is a
  distant crack two seconds after the shell lands.
- **The target going up.** A kill is the destruction itself (blast, sub-bass,
  debris, turret, cook-off), carried like our hits, with the far explosion
  layer beyond 600 m.
- **The gunner's call.** Every main-gun result is called about half a second
  after it lands, the time it takes to see it: "Penetration", "Ricochet", "No
  penetration", module and crew effects, "Target destroyed". Autocannon and
  machine-gun hits are called now and then. A main-gun miss is called too:
  "Short. Adjusting." when the round came down before the enemy it was laid on
  (the live enemy nearest the line of fire), a plain "Miss." otherwise; the
  radio can ask for a line's take by index for that.

### Aircraft and mode sounds

`aerialRig.ts` plays the aircraft of the Drone and AC-130 modes: one moving
loop placed in the listener frame (distance law, air absorption, pan, Doppler),
or an own perspective for the pilot or crew.

- **Drone.** FPV drones fly as shells, so the live shell list reaches the audio
  update. An enemy drone buzzes where it flies (loud close, gone within about
  500 m) and pitches up as it closes in. Our own spins up as it lifts off, and
  while it flies the listener rides it (`player-drone` in
  `listenerPoseRuntime.ts`): the battle is heard from the drone, our tank is
  one more vehicle heard from outside, the hull's machinery is not heard, and a
  hit on the hull is felt 10 dB down and muffled under the feed. The drone's
  motors lead (−1 dB on the own bus): a hover hum crossfades into the
  full-throttle buzz as the motors work harder (speed, climbing, correcting),
  pitched by that load, spooling up over the 2.4 s launch and sagging over the
  battery's last ten seconds; wind rises with the square of speed (high-passed
  at 150 Hz), and the link's hiss rises toward the 850 m range limit and the
  last ten seconds of battery. It cuts out in a burst of static when it
  strikes, is recalled or dies; a strike is heard up close, then the listener
  is back in the tank. Until 2026-10-02 the listener stayed in the tank, so a
  flying drone sounded like the tank's own engine with a quiet, muffled buzz
  under it.
- **AC-130.** A gunship is a roster tank pinned to its orbit; it never gets a
  tank rig. The ground hears four turboprops circling overhead, the 30 mm
  thumping (`gunship_30mm_far`) and the howitzer booming (`gunship_howitzer_far`)
  from the sky. Its crew hears the cabin: the turboprops with the airframe
  rattling and wind at the gun ports under them (`gunship_cabin_rattle_loop`),
  the 30 mm, the howitzer and the missile leaving the wing pylon inside the
  fuselage (`gunship_30mm_own`, `gunship_howitzer_own`, `gunship_missile_own`),
  the howitzer's hot case clanging onto the deck 0.45 s after each shot, the
  crew loading the howitzer by hand (breech open, `gunship_round_load`, breech
  closed; missiles arm on the pylon) and the selector arming each gun
  (`gunship_weapon_select`). The gunship's shells carry `gunship-*` sound
  profiles in `matchRuleset.ts`; until 2026-10-02 they had none, so the crew
  heard tank reports from a commander's hatch, the 180 mm guided missile played
  as a 152 mm cannon and howitzer reloads ran the hull's autoloader.
- **Mode openers.** Each mode opens on its own field sound at roll-out
  (`MODE_OPENER`, read through the `getGameMode` getter): an air-raid siren for
  the Endless Horde, a distant preparatory barrage for the Frontline Assault, a
  vault door slamming for the Juggernaut, broken radio for Infected, a foghorn
  for Turbo Ball, an armory for Gun Game and the gunship passing overhead for
  the AC-130; Realistic opens on silence and the rest on the battle horn. The
  Horde's waves come on the siren with the all-clear after them, the
  Frontline's counter-attacks and advances under the barrage, and a cache lands
  with a thud where it arrives (`cache_drop`). The Juggernaut itself (found by
  its hull, at least three times anyone else's) runs its engine bank 14 %
  deeper, lands and rams with a superheavy's mass, and its gun reports carry
  2.5 dB further, a little deeper. Gravity mode's Olympus Basin has Mars
  acoustics (sound at 240 m/s, 14 dB thinner, nothing above 3.2 kHz).
- **Gun Game.** Advancing a stage plays the weapon changeover (breech, ram or
  missile tube, latch) and the loader's call for the new round. **Infected.**
  Being turned plays a grave sting and radio interference. The drone switch
  clicks.

The aircraft set decodes on first sight of an aircraft; the Infected sting
rides every battle set.

### Environment

`environmentScenes.ts` gives each of the 33 maps a scene: a stereo bed, an
optional water or machinery layer, weighted spot sounds placed 40–380 m away at
random bearings (birds higher; mostly crows, hawks, gulls, wind, rubble and
machinery, with songbirds, bees and a distant siren among them where they
belong, and no bells, breaking glass or car alarms), a distant-war bed in
battle, the gun tail and a procedural reverb. The beds were regenerated on
2026-10-02 without songbirds, bees, sirens or radio tones (those come as
spots), selected for an
even level across the loop seam and for body under the hiss. The garage is a
working hangar: an audible room tone (+7 dB) with tools, impact wrenches, a
hammer on a track pin, the crane chain, an air compressor, a diesel being run
up and the big door 3–14 m away.

Every control in the garage and the menus sounds (`interfaceSounds.ts`): one
delegated click listener classifies the pressed element — a tab, a tank card
(which lifts its tank into place), another list option, a toggle, a back or
close button, the primary action, any other button — and a range input sounds
on change. An element can name its sound or opt out with `data-ui-sound`. In
battle only menus and dialogs sound, and a control's own `ui:click` never
doubles the delegated sound.
Atmosphere events (artillery, flak, AA, flyovers) and destructible props
(trees, fences, walls, cars, crates, rubble) have their own assets.

### Crew radio

`voiceLines.ts` defines 97 lines with priority (0–4), per-line and per-group
cooldowns and staleness; `crewRadio.ts` schedules them with radio discipline:
one transmission at a time, survival calls interrupt chatter, a 0.8 s gap, a
two-line queue, stale calls dropped rather than played late. Routine chatter
(reload done, allies' kills, autocannon results) is probability-gated, our
main-gun results are called almost every time, and spot calls are throttled to
one per five seconds unless several contacts appear at once.

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
library stats, listener, rig and aircraft state, effective bus levels, and test hooks
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
   386 entries        ~1,300 raw takes      onsets, decay, seams,     master.mjs presets, picks override
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
   dead-air rejection, transient anatomy for gun reports (below), low-end
   weight for distant reports and blasts (reward 20–150 Hz, penalise harsh
   highs), darkness for the interface and stingers, weight
   plus a clean steel transient for the loading machinery (and one event per
   clunk, not a rattle of them), and body under the hiss for ambience beds. The best `variants` takes ship; an optional
   `tools/audio/sfx-picks.json` (`{ "<id>": [take, …] }`) pins specific takes. Single-shot assets are truncated after the first
   shot.
5. **Mastering** (`master.mjs`). Per preset: mono fold without phase
   cancellation, high-pass, trim, fades, a loudness target, a true-peak ceiling
   and the Opus bitrate. Loops are repaired at the seam and wrap-padded
   (`[last 4096 samples | body | first 4096]`) so `loopStart`/`loopEnd` from the
   manifest never click. Gun reports (the `gunshot` preset) are normalised on
   their true peak (−1.5 dBTP, the limiter left above it) and shaped by the
   transient designer below; other close weapon sounds land at −9 LUFS
   momentary max, impacts −10, foley −14, the interface −16, ambience beds −21
   LUFS integrated.
   Assets with almost no energy above 12 kHz are stored at 24 kHz.
6. **Manifest**. `build-sfx.mjs` writes `src/audio/sfxManifest.generated.ts`
   (group, variant count, durations, channels, rate, loop points, size) and the
   incremental state `tools/audio/.sfx-manifest.json`.

**Gun reports** (2026-10-02). The owner heard firing as old film or gamey
blasts, and the files agreed: the cannon reports swelled to their loudest
60–320 ms after the shot with 25–96 % of their body below 100 Hz, several
machine-gun takes were clipped, selection rewarded exactly that low end, and
mastering normalised each crack to −9 LUFS momentary and limited it back,
squaring the peak. Now:
- range-recording prompts with a crack per calibre (below), 6–8 takes each;
- `transientAnatomy` (`pcm.mjs`) on every take: the rise to its loudest
  millisecond, the energy in its first 10 ms, its crest, its body below 100 Hz;
  `build-sfx.mjs` scores an instant rise, early energy and crest up and a late
  swell, low boom and any clipping down;
- a single-shot take that was really a burst is cut at its second report only
  when that report is within 8 dB of the first (a quieter onset is its own
  echo), and a cut that leaves under 0.25 s is skipped (fewer variants ship
  rather than a click);
- the `gunshot` preset normalises on the true peak, and a transient designer
  (`shapeTransient`, the entry's `shape: [holdMs, tauMs, floorDb]`) follows the
  take's envelope and pulls a sustained blast body down onto a decaying target
  (25–35 ms for machine guns, 30–55 ms for autocannons, 90–150 ms for tank guns,
  floors 15–26 dB under the peak) while the crack and the echo pass untouched.

**Prompt lessons.**
- Short machine-gun and autocannon prompts produced bursts. "Gunshot sound
  effect: one single…" framing, longer durations, single-shot scoring and
  first-shot truncation fixed them.
- Every prompt ends with "no music, no voices"; impacts add "very loud, with an
  immediate hard attack".
- Asked for a "deep concussive low-frequency punch … rolling outdoor echo",
  the model returns cinematic explosions that swell to their peak a tenth of a
  second or more after the shot. Range-recording prompts return cracks: "at a
  military range, recorded 30 metres beside it: instantaneous, … muzzle-blast
  crack, a hard concussive punch as the pressure wave slaps off the ground,
  then a dry echo rolling off distant hills. Realistic documentary field
  recording, not cinematic, no explosion, no rumble swell, no debris". A prompt
  may be at most 450 characters.
- Words like "ding", "chime", "beep", "bright" or "triumphant" produce exactly
  the light, jingly sounds a serious war game should not have. The interface is
  described as heavy hardware ("a heavy armoured-vehicle console push button…
  a short dull mechanical clunk with no ring") and the stingers as grave
  war-film brass and timpani with "no fanfare".

### Crew radio voices

```
crew-lines.json ─┐                    crew-voices.json
 97 lines,       ├──→ build-voices.mjs ──→ eleven_v4 TTS ──→ scribe_v2 STT check ──→ master 'voice' ──→ public/audio/voice + manifest
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
   cache, `--attempts 10` on the flagged lines pays only for the new ones — and
   the best is kept, a clean attempt before a repeated one. The model says a
   one- or two-word call twice on nearly every attempt, so when none passes,
   each attempt is cut at its pauses and a cut is kept when its own transcript
   reads as the script (0.75, stricter than the take bar, so a fragment of a
   longer call never passes). Takes still under 0.34 are reported for review; most
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
  - The speech model often doubled very short calls ("Loading. Loading",
    発射、発射) on every attempt; the voice build now detects repeats, prefers
    clean attempts and cuts takes at their pauses (36 flagged takes became 2).
- **2026-10-02, the crew's own tank.** The owner asked for a beautiful firing
  sound, the machinery inside the tank, reload, shell insertion, autoloader,
  missile, rotation and clanging sounds on the model of World of Tanks, louder
  own-tank sound and firing, better and louder ambience, garage ambience and
  interface sounds, and an end to the corny limit sounds. Generated: dedicated
  own-gun reports, the recoil and run-out, a re-prompted loading set (breech,
  case, rack, ram, charge, ammunition doors, carousel, cassette, chain rammer,
  bustle, drum rotation and drum loading, autocannon feed, missile tube,
  launcher arm, ready lock), the turret drive's start, loops and stop, the
  elevation servo, a quieter limit strain, all 24 battlefield beds and the
  garage bed, and six hangar sounds; the seven light spots no scene played
  were removed. Two bugs found by the production check of deploy 168 were
  fixed: an engine adopted after the battle phase edge never warmed its battle
  set, and an existing rig within 25 m was promoted to our own perspective.
- **2026-10-02, hit realism and the new modes.** The owner asked for hits to
  sound far more realistic, and six modes had landed on main. The interface
  hit markers were removed in favour of the impact at the target (new distant
  armour-hit banks, the own-hit law), the target's destruction and the gunner's
  calls including misses; the drone, gunship, Gun Game and Infected sounds
  were generated and wired as above.
- **2026-10-02, the drone's own sound.** The owner heard the tank's engine while
  flying the drone: the listener stayed in the hull, so the tank played as our
  own vehicle at full level with the drone's buzz 12 dB under it behind a feed
  filter. The listener now rides the drone, the tank is heard from outside, and
  the drone's motors lead with a new hover loop and wind.
- **2026-10-02, guns that crack.** The owner heard firing as old film or gamey
  blasts. Measured, the reports were explosions (above); all 16 close reports
  were regenerated and picked by transient anatomy, mastered on the true peak
  and shaped, a procedural muzzle blast went under every gun, the firing sub
  sweep was removed and a look-ahead limiter went in ahead of the soft clip.
- **2026-10-03, the AC-130 and every mode.** The owner asked for many AC-130
  sounds and custom sounds for every mode: the gunship's crew cabin, its guns
  inside and from the sky, its hand-loaded howitzer and selector, and an opener
  per mode with the Horde's siren, the Frontline's barrage and the caches.

### Cost

Credits from the local ledger (`ledgerSpend()` in `elevenlabs.mjs`), both
rounds:

| Kind | First round | Feedback rounds | Total |
|---|---|---|---|
| Sound generation | 26,625 | 33,503 | 60,128 |
| Text-to-speech (casts, auditions, builds, re-rolls) | 9,029 | 10,520 | 19,549 |
| Speech-to-text verification | 1,718 | 1,909 | 3,627 |
| **All** | **37,372** | **45,932** | **83,304** |

The feedback rounds' sound generation is the regenerated interface, stingers
and foley, the distant armour hits (400), the aircraft and Infected sounds
(1,350), and the own-tank round (22,819: the own-gun reports and machinery,
the turret drive, every battlefield bed twice and ten of them again with four
takes, the hangar), the drone's hover and wind (528), the regenerated gun
reports (3,044) and the AC-130 and mode packs (2,996); nearly all of their
speech is the serious recast and rebuild of all 13 packs (10,873) plus the
re-rolls of doubled calls (634).

## Changing or extending it

| Task | Steps |
|---|---|
| Add a sound | Add a catalog entry → `npm run audio:sfx:generate -- --ids <id>` → `npm run audio:sfx:build -- --ids <id>` → play it from the engine (and add a cue override if its group default does not fit) → `node src/audio/soundAssets.selftest.mjs` (it checks every engine reference exists in the manifest) |
| Replace a weak take | Re-run `build-sfx --ids <id>` after adjusting the prompt or `takes`, or pin takes in `tools/audio/sfx-picks.json` |
| Add or change a voice line | Edit `crew-lines.json` (all 13 languages, same number of variants) and its `VOICE_LINES` entry in `voiceLines.ts` → `npm run audio:voices:build -- --lines <id>` |
| Rebuild one language | `npm run audio:voices:build -- --langs de` |
| Re-roll flagged takes | `npm run audio:voices:build -- --langs ja --lines firing --attempts 10` (earlier attempts come from the cache; the shipped packs used this on their flagged lines, so rebuild those lines with the same flag to reproduce them) |
| Remove a sound | Delete its catalog entry and run `build-sfx`: assets dropped from the catalog leave the manifest and the disk |
| Remove a voice line | Delete it from `crew-lines.json` and `VOICE_LINES`, then run `build-voices` (even with a `--lines` filter that matches nothing): lines dropped from the script leave every pack and the manifest |
| Give a control its sound | Add `data-ui-sound="click|tab|select|toggle|slider|back|confirm|vehicle"` (or `none`) to the element |
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
| `src/audio/weaponAudio.selftest.mjs` | bore classes, ordering, report trims, reload choreography, the muzzle blast (instant, peak-normalised, deterministic, longer and lower with the bore) |
| `src/audio/vehicleAudioModel.selftest.mjs` | idle, gearboxes, no gear hunting, turbine spool, braking, scrub, landings, stalls |
| `src/audio/soundAssets.selftest.mjs` | manifests against files, every engine reference, families, tracks, scenes, packs, payload budgets |
| `src/audio/assetLibrary.selftest.mjs` | pinning, eviction and reload, voice bytes, the mobile variant cap |
| `src/audio/crewRadio.selftest.mjs` | radio discipline, interrupts, stale drops, national packs with fallback, damage, language resolution |
| `src/audio/audioEngine.selftest.mjs` | the engine against the shipped manifests: rigs, crews, scenes, weapon layering and delay, HDR trim, sub-bass, reloads, hits, edge cases, destruction, concussion, our hits (distant bank, own-hit law, no marker), the gunner's calls and misses, our own report and recoil, the drum refill, the turret start, kill-cam, panning, scope, aircraft (gunship, enemy and own drones), mode events, interface sounds and their dedupe, rig ownership near our hull, late adoption, pause, garage |
| `src/audio/lazyAudio.selftest.mjs` | deferred engine and loading tone |
| `src/audio/interfaceSounds.selftest.mjs` | the control classifier (tabs, tank cards, options, toggles, back, primary, sliders, opt-outs, menus) and the delegated listeners |

Browser probes (they take the machine-wide GPU capture lock; set
`COT_SHOTS_LOCK_TIMEOUT_MS=10800000` on a busy machine):

| Probe | Checks |
|---|---|
| `node tools/audio-mix-balance.mjs` | garage audibility; gunfire at 15/150/400 m and our own gun over the idle battle bed on their loudest 100 ms (14/10/4 and 16 dB), and a near crack's peak (22 dB); each shot's anatomy from its arrival (a near cannon must crack: rise ≤ 15 ms, ≤ 50 % low body) and soft-clip hits; the radio under a near cannon; sound starts and radio lines per second in live combat; the drone in flight (the listener rides it, its motors lead, the feed brightens); an AC-130 battle (the opener, the cabin, the howitzer and its case) |
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
  `crew-lines.json`. Two takes remain flagged (a scripted exhale before the
  Chinese near-miss call, a one-syllable Hebrew "goal"), besides homophones
  the transcriber spells differently.
- The first garage click loads the engine, so that click itself is silent.
- The oasis bed's loop seam steps 2.8 dB and the jungle and mangrove beds are
  mostly insect hiss; every take generated for them was like that.
