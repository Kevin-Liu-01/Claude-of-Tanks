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
| 479 sound-effect assets, 851 variant files | `public/audio/sfx/<group>/<id>_<n>.webm` | 23.5 MB | per battle: the battle set at the battle phase edge, the aircraft set on first sight of an aircraft, everything else on first use |
| 13 crew radio packs × 119 lines × 1–4 takes | `public/audio/voice/<lang>/<line>_<n>.webm` | ~1.6 MB per language | only the crew's pack (every pack carries every line; nothing stands in for a missing take) |
| SFX manifest | `src/audio/sfxManifest.generated.ts` | | bundled in the lazy audio chunk |
| Voice manifest | `src/audio/voiceManifest.generated.ts` | | bundled in the lazy audio chunk |

Every sound is one of these recordings (2026-10-03). Nothing is synthesized:
no oscillator, rendered buffer or noise burst is ever heard, and a cue whose
asset is still decoding, or that the browser cannot decode (Safari before 17.4
has no WebM/Opus), is silent rather than replaced by a stand-in.
`soundAssets.selftest.mjs` fails on any `createOscillator` in `src/audio/` or
the HUD. The only generated signal left is the reverb's impulse response,
which is never heard on its own.

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
a battle's worth of sound effects. Sound effects share six decode slots in two
lanes: the front lane is served first, and an asset joins it when it is loaded
`{ front: true }` or the first time something asks to play it before it has
decoded (a rig's loop, an ambience bed, a report), so a sound wanted now never
waits behind banks queued for later.

At every battle phase edge, and when it is adopted after that edge has passed, the engine warms and **pins** its battle set: every
weapon report bank, the combat, occupied-hull, interface and mode sets, the
map's scene, running gear, and the roster's powertrains (the solo loader also
awaits this, bounded to 3.5 s, before the reveal; a network round passes its
lobby roster as it starts loading, and every later warm of the battle keeps the
roster it was given). Its **presence set** decodes first, in the front lane:
each powertrain's start-up and idle, the map's beds, the running gear, the
other engine bands, every loop a rig can start, then the count's tick, the
mode's opener, the hatch and the horn, so the countdown is heard from its first
frame (on Verdant with six tanks: 44 assets, 45 files, 2.1 MB of the about 670
files a cold entry queues; our idle used to decode 638th, now 7th). Each roster
hull's powertrain is resolved from its whole spec (`getVehicleSpec`, the
fleet's `getSpec`), as its rig will be: a family turns on role and weight too,
and by id alone every IFV warmed another family's bank
(`presenceFamilies.selftest.mjs` checks all 220 vehicles). Pinned
assets and live loops
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

- Gunfire and our own tank lead. Weapons (1.5) and the occupied hull's gun
  (1.6) carry a +3 dB low shelf at 110 Hz and impacts (1.3) +4 dB; our own
  engine and running gear (0.36) and the loading and turret machinery inside
  it (0.95) sit above other tanks' engines (0.31); ambience (0.18, beds
  mastered at −21 LUFS and high-passed at 90 Hz on the bus) and the interface
  (0.6, with a high-shelf cut) sit underneath. The crew radio (0.24) is heard
  over the battle: while a line plays the beds drop 10 dB and the world 4. A
  gun's echo tail sits 12 dB under its report (14 under our own), its distant
  bank 3 dB under in the crossfade, and its punch 6 dB under a cannon's
  report, 16 under an autocannon's and 19 under a machine gun's.
- The levels are measured on the master by `tools/audio-mix-balance.mjs`. Its
  first run, on deploy 169's louder engine and ambience (0.8 and 0.65), put
  the idle battle bed at −22 dBFS with a cannon at 15 m only 11.6 dB above it.
  The bed was 79 % below 200 Hz: loudness-normalised (K-weighted) beds carry
  far more rumble than they sound like, and the near cannon cannot get louder
  (the glue compressor and soft clip hold its short-term level near −10
  dBFS). Four runs later — the ambience bus high-pass, idling engines quieter
  than loaded ones, cannons keeping their close report to about 150 m, and
  the trims of the time — the bed was −27.7 dBFS, a cannon stood 17.9, 11.1
  and 7.9 dB above it at 15, 150 and 400 m, and the radio 8.4 dB under a near
  cannon.
- Then the guns became cracks (2026-10-02/03), and six more measurements
  rebuilt the mix around them. A crack is judged on its loudest 100 ms (a
  400 ms window rewards a long boom), its peak and its decay, from its arrival
  over the bed. A near crack is bounded by the master's ceiling, and its
  100 ms sits its crest (about 11 dB) under that peak, so more gun level only
  squashes it: each louder step took a near cannon's decay (its loudest 50 ms
  in the first 100 ms against 250–700 ms) from 7.1 dB to 1.5 dB, because the
  limiter flattened the crack while the echo tail, unchanged while the reports
  became peak-mastered and about 8 dB lower in loudness, passed under its
  threshold at nearly the shot's level: half a second within 2–9 dB of the
  peak is a blast. The tails came down 10 dB, the blast 4, the gun shelves 3,
  the limiter learned to release slowly, the cannon reports were re-shaped to
  decay a third faster, and the guns came back down until the limiter only
  trims the top of a near crack (the probe reads its gain reduction), with
  the bed about 4 dB lower to keep them dominant. Gates: a near
  cannon 12 dB over the bed on its loudest 100 ms with its crack peaking at
  least 22 dB over it and decaying at least 8 dB; 10 and 4 dB at 150 and
  400 m; our own gun 14 dB with a 22 dB crack; at most 40 samples at the soft
  clip's knee; the radio 6 dB under a near cannon. The final measurement (d52e45620): the bed −32.0 dBFS; a near cannon 13.6 dB over it on its loudest 100 ms, its crack peaking 24.1 dB over it and decaying 10.6 dB, held down 2.3 dB by the limiter with nothing at the clip's knee; 10.7 and 6.2 dB at 150 and 400 m; our own gun 17.2 dB with a 28.0 dB crack (3.3 dB of limiting); the radio 7.4 dB under a near cannon; the garage −31.3 dBFS.
- The glue compressor has a 12 ms attack and 2.5:1 ratio so cannon transients
  reach the limiter after it (−2.6 dBFS, 20:1, 2 ms attack, 250 ms release):
  the compressor's built-in look-ahead lets it take a crack's peak down
  smoothly, and the tanh soft clip behind it is only the last resort. A Web
  Audio compressor adds its own makeup gain ((1 / curve(0 dBFS))^0.6, +1.5 dB
  here) that cannot be switched off; a trim after the limiter takes it back
  out, or the limiter would raise everything, the bed included. Before the
  limiter the cracking guns rode the clip (a near cannon put 111 samples at
  its knee, our own gun 254), which squares a crack off into old-film grit.
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
each one, within the close range, plays the punch of the muzzle blast: a
recorded slam of air with the air rushing back behind it (`blast_punch_light`
under machine guns, `blast_punch_medium` under autocannons,
`blast_punch_heavy` under guns), pitched lower as the bore grows and cut after
0.22, 0.32 and 0.5 s so it weights the attack without blurring the decay. It
sits 6 dB under a cannon's report, 16 under an autocannon's and 19 under a
machine gun's (2 dB higher for our own gun); air absorption leaves only a
thud at range. Until 2026-10-03 the punch was rendered (a Friedlander pressure
pulse per bore); before that a synthesized sine sweep from about 78 to 26 Hz
sat under every cannon within 700 m, and 0.5–0.8 s of falling sine is a
trailer boom that made gunfire read as explosions. HE bursts, vehicle
explosions and penetrations of the occupied hull carry their weight in
recorded, low-passed layers (`blast_sub`, `hull_thud_sub`). Shell flybys and
near-miss cracks are timed from the shell's closest approach and muzzle
velocity.

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
belong, and no breaking glass or car alarms; bells ring only from a map's own
towers, below), a distant-war bed in
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
have their own assets. A flyover sounds of its era (`scene.flyovers`): the
Second World War maps fly piston fighters and twin-engine bombers
(`flyover_piston`, `flyover_bomber`: Prokhorovka's Il-2s, Shanghai's G3Ms, the
Saar's Thunderbolts and Marauders), the later ones jets; an event that names its
`aircraft` type plays that type's sound (`FLYOVER_BY_AIRCRAFT`).

**Props.** `propSounds.ts` names every kind the world builds (the inhabiting
and scenery kits, the light buildings, the sandbag stacks, the telegraph poles,
the front's AA guns, the trees) with the layers it plays at the prop, and
`propSounds.selftest.mjs` fails on a world kind it does not name. A toppled
telegraph pole cracks at the foot (`pole_snap`), its wires whip as it goes over
(`pole_wires`, 0.3 s) and it lands (`pole_fall`) 0.8 s after the crush, when the
props' hinge topple reaches the ground; lamp posts, road signs, wayside crosses
and the wind pump land on the same beat. Carts splinter (`cart_break`), straw
crunches (`straw_crush`), tents and stalls tear down (`tent_collapse`), clay jars
shatter (`pottery_smash`), the red fuel drum explodes (`fuel_drum_blast`) and a
loose drum, churn, bin, bucket, jerrycan or gas bottle a hull shoves clangs and
rolls (`can_knock`, at most once per 0.3 s). Only a plastic traffic cone is
silent, by name. The world reports these through the destructibles seam
(`prop:destroyed`): the poles' topples as `utility_pole` and the loose dressing's
knocks with `loose: true` (`props.ts` `crushProp`, `kickLooseRecord`). Until
2026-10-06 a regex chose: a haycart crushed as a car ("cart" matched /car/),
sedans, bales and tents broke as wooden crates, a steel guard post as a wooden
fence, a wooden barrel as a steel drum, and the poles and the loose dressing made
no sound at all.

**Bells.** On the six maps whose towers ring (`scene.bells`: Verdant's Orthodox
village church, Frontier's and Steinburg's churches, Glacier Pass's hospice and
chapel, the Podhale's wooden churches and belfry, Saltwind's campanile) the
ambience director tolls the nearest tower within 1.6 km every 110–240 s (the
first after 25–75 s), only after the battle has rolled out (the countdown, and
every probe that holds a battle in its pre-battle, never tolls) and only once
the HDR window has stayed under 118 dB for 25 s: a cannon within a kilometre or
two, an explosion or our own gun holds the bells. The towers come from the world's feature list (a planned building's plan
id, `church`, `onionchurch`, `chapel`, or a set piece's `landmark`, `church`,
`belfry`, `campanile`) through the `getLandmarks` option, read once per scene
when the first toll falls due. A Western toll is one to three strokes of
`bell_toll` 3.4–4.2 s apart; an Orthodox tower rings `bell_orthodox` once (the
great bell's stroke, and in one take the small bells' rhythm over its hum). The
size of the tower's bell sets its pitch (`BELL_TOWERS`): the campanile's great
bell lowest (0.78), a church 0.93, a chapel or belfry higher. Bells ride the
ambience bus, under the radio and the ambience slider.

### Crew radio

`voiceLines.ts` defines 119 lines with priority (0–4), per-line and per-group
cooldowns and staleness; `crewRadio.ts` schedules them with radio discipline:
one transmission at a time, a 0.8 s gap, a two-line queue, stale calls dropped
rather than played late. Survival calls cut anything below them, decisive
events cut situational calls, and reports (what our round did, what our
equipment just did) cut the loader's flavour, so "Penetration" never goes stale
behind "Firing". Every main-gun result is called; only flavour (firing, reload
done, allies' kills, near misses, autocannon and machine-gun results) is
probability-gated, and spot calls are throttled to one per five seconds unless
several contacts appear at once. The team's count (last tank, last enemy,
outnumbered) waits out the kill call that usually comes with it. It counts the
whole field, never what a seat can see: a solo battle's list is the field; a
network seat is sent only the hulls its team spots, so it counts the lobby
roster with the authority's deaths (`getTeamRoster`, the roster the HUD's team
tally reads; every seat is sent every destroyed hull), and only where a death is
final (`deathsAreFinal` in `src/sim/matchRuleset.ts`: no respawn, no waves). In
a respawn or wave mode, or with no roster wired, a network battle (its hulls
carry `networkVisible`) calls no side counts at all.

What the crew says for the tank's own systems and the modes (2026-10-04):

| Moment | Heard | Crew |
|---|---|---|
| Smoke volley (`auxiliary:smokeScreens`, ours within 4 m) | launcher, burst | "Smoke out" |
| Roof gun on / off (the sim's auxiliary state) | weapon-station servo / switch | "Roof gun active" (on) |
| Lights on / off | headlight relay / switch | — |
| Hydropneumatic aim engaged | suspension | "Suspension set" |
| Our drone lifts off / its battery or link gives out | spin-up / feed cut | "Drone up" / "Lost the drone" (not on a recall, a hit or our death) |
| Drone pressed while recharging | refusal | — |
| Magazine reload accepted / refused | magazine swap / refusal | "Reloading" (only when it happens) |
| Special action or an empty round refused | refusal | "Out of that type" (empty round) |
| Sensor view changed (tank sight, drone, gunship) | sight ratchet | — |
| Our gunship's weapon selected | selector | "Thirty mike-mike" / "Howitzer" / "Missile selected" |
| Our gunship's supply drop (`mode_pickup_spawned` with `by`) | cache | "Ammo crate away" / "Repair crate away" |
| Enemy on a point we hold (`mode_zone_contested`) | — | "They're contesting the point" |
| Respawn | respawn | "Back in the fight" (and the one-per-life calls re-armed) |
| Countdown (3, 2, 1, never while PREPARING holds it) | a tick each second | — |
| Rollout (once a battle; a network battle joined after its count rolls out with no cues) | mode opener, hatch, horn | "All crews, advance" |
| A reasoning medal (`service:medal` Chain of Thought or Let Me Think Step by Step), or 3 % of first shots | — | "Let me think step by step." then the gunner: "Step one: aim. Step two: fire." |

The reasoning exchange (2026-10-05, the Claude of Tanks / chain-of-thought
joke) is once a battle and never costs a real call. Both lines are priority-0
flavour that `yields`: any call of priority 1 or more cuts them. A request
waits up to 8 s for a quiet net (the radio's `quiet`: nothing queued, the last
line and its gap over), so the kill call that earned the medal goes first; the
gunner's answer is never queued — the engine speaks it only when the net is
quiet again and the commander's line was the last thing said, so an
interruption drops the punchline instead of leaving it to follow a damage
call. Both lines also keep a ten-minute cooldown on the net, and the 3 %
first-shot chance draws from its own seeded stream.

A network battle reaches the same handlers: the presentation maps the
authority's `tank_spotted` and `tank_autoflip` to solo's `tank:spotted` (the
spotting side as the viewer sees it), `player:spotted` and `tank:autoflip`, and
emits `player:reload` from the viewer's row, so spot calls, the sixth sense,
the self-right and the loading machinery work there too.

A hull's crew speaks its operating nation's language by default (en-US,
en-GB, de, ru, uk, zh, fr, sv, ja, ko, it, pl, he). **Settings → Sound →
Crew voices** offers **National crews**, or one nation's existing pack for
every tank. The shared nation dropdown shows flags and localized nation
names. Choosing a crew applies immediately and persists in the `crewVoice`
field of `cot.settings.v1` as `national` or a pack ID; resetting Sound restores
`national`. `crewVoice.ts` owns validation, resolution and legacy migration:
`english` becomes `en-US`, and `interface` becomes the currently resolved
interface-language pack once (English if unsupported). Later UI locale changes
do not change that fixed crew choice.

The engine resolves the choice at first audio initialization, on live
`ui:volumes` changes, and when the player's entity or operating nation changes
(including vehicle replacement on the same entity). Switching language stops
the old transmission and clears queued calls. While a chosen pack decodes,
the radio waits. No crew stands in for another: a take a pack lacked would be
silent, and the radio selftest fails unless every pack carries every line.
Every line runs through a live intercom chain — a 24 dB/oct 320 Hz–3.4 kHz
band, a 1.9 kHz presence peak, compression, a tanh drive, a 4.6 kHz headset
speaker roll-off, and the recorded net static (`radio_static_loop`) gated
with the line between the recorded key-up and release (`radio_key_in`,
`radio_key_out`) — measured on the live output at 77–93 % of the energy inside
300–3400 Hz and under 0.1 % above 6 kHz in every language. The release does
not chirp: the synthesized squelch it replaced let a tone fall from 1250 to
900 Hz after every line, a little boing. A damaged radio module narrows the
band, adds drive and drops syllables.

### Settings and debugging

The Sound tab (`src/ui/settings.ts`) has the six volume sliders, the crew
voices (National crews / one nation's pack), the concussion toggle and the
critical-damage heartbeat. After resume, `window.__COT_AUDIO` exposes the
context, a master PCM tap (`startTap` / `stopTap` / `readTapB64`), the sound-route
log, the sfx log (asset, start, gain, rate, distance, bus), the voice log,
the crew request log (`sayLog`: every line asked for and whether the net took
it, beside `voiceLog`, the lines actually spoken), library stats, listener, rig
and aircraft state, effective bus levels, and test hooks (`play`, `preload`,
`sayVoice`, `setEngineProbeSolo`, `forceCrewLanguage`).

## How generation worked

The hands-on guide (prompt cookbook, take scoring and failure modes, costs,
recipes) is the [audio-generation handbook](audio-generation/README.md); this
section is the record of how the shipped set was made.

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
   398 entries        ~1,100 raw takes      onsets, decay, seams,     master.mjs presets, picks override
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
   clunk, not a rattle of them), body under the hiss for ambience beds, and
   for the punch and low layers an instant slam over within 200 ms and no
   pitched tone in the low band: a take whose 25–250 Hz content holds a
   regular pitch for 60 ms while it glides 12 % (or for 150 ms at all) is a
   falling sine, a cartoon boing, and loses (`lowToneGlide` in `pcm.mjs`). The best `variants` takes ship; an optional
   `tools/audio/sfx-picks.json` (`{ "<id>": [take, …] }`) pins specific takes. Single-shot assets are truncated after the first
   shot.
5. **Mastering** (`master.mjs`). Per preset: mono fold without phase
   cancellation, high-pass, trim, fades, a loudness target, a true-peak ceiling
   and the Opus bitrate. Loops are repaired at the seam and wrap-padded
   (`[last 4096 samples | body | first 4096]`) so `loopStart`/`loopEnd` from the
   manifest never click. Gun reports (the `gunshot` preset) are normalised on
   their true peak (−1.5 dBTP, the limiter left above it) and shaped by the
   transient designer below, and so are the punches under them (`punch`); the
   low layers under blasts (`sub`) keep only what passes a two-stage 190 Hz
   low-pass and are normalised on their peak; other close weapon sounds land at −9 LUFS
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
 119 lines,      ├──→ build-voices.mjs ──→ eleven_v4 TTS ──→ scribe_v2 STT check ──→ master 'voice' ──→ public/audio/voice + manifest
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
- **2026-10-03, nothing synthesized.** The owner heard a little boing all
  through battles and found it on a listening page: the impact fallback, a
  triangle wave sweeping from about 1.2 to 2.8 kHz that played at a fixed level,
  unplaced, on every hit whose recorded impact had been culled for distance or
  by the HDR window. Every synthesized sound went with it. The fallbacks
  (shots, explosions, impacts, clicks, the engine, the loading rumble) are
  gone, and the radio's key-up, release and static, the punch under the guns,
  the low end under blasts and hull hits, the cabin alarms, the heartbeat, the
  drivetrain whines, the loading bed and the sixth-sense lamp are recordings:
  13 new assets and a release regenerated without its chirp (1,806 credits). The
  same round put the crew over the battle, added the incoming-drone call,
  silenced calls that were wrong while standing still and opened up the sight.
- **2026-10-04, the crew on top of the tank, and no stand-ins.** The owner asked
  for lines when launching smoke, drones and the rest, every line playing when
  it should, and then: "I still hear audio fallbacks." Nine lines in 13
  languages (1,202 credits): the drone's launch and loss, the roof gun, the
  suspension, the gunship's three weapons and its two supply drops. Wired with
  them: the contested point (a new `mode_zone_contested`), the gunship drop's
  requester (`by`), the lights, the sensor switch, the hatch at rollout, and the
  network battle's spots, autoflips and reloads. Fixed on the way: smoke went
  silent after the first battle (its clock outlived the battle), the low-hull
  and last-enemy calls went stale behind the call before them, the respawn call
  was swallowed as "dead", our results queued behind "Firing", feature calls
  were coin-flipped, and the reload key said "Reloading" with a magazine swap
  even when the reload was refused (refusals now sound as refusals). The stand-ins went: the external report covering our
  own gun, the generic stall covering a tank's own engine stop (each roster
  powertrain's stop is now pinned), the battle horn covering a mode's opener
  (now pinned), a switch click standing in for the drone launch, a tank
  loader's lines in the gunship, the US crew covering a missing national
  take, and a coin toss between wood and concrete for every round into a prop
  (it now sounds of what it struck: steel, timber, earthworks, stone or
  masonry, with the steel clang that had shipped unused).
  `voiceTriggers.selftest.mjs` drives all 109 lines from their game moments and
  fails on any sound chained in for another. The pop the owner still heard on
  the AC-130's missile was a take, not a fallback: take 0 of
  `gunship_missile_own` was an ignition pop, 1.5 s of nothing, then the motor,
  and with two takes that never repeat it played on every other launch.
  `build-sfx` now measures a take split by silence (`splitGap` in `pcm.mjs`:
  sound, more than 400 ms over 25 dB under the peak, then sound within 10 dB
  of it) and scores it out for single-event sounds (calls, beds and stings may
  pause); rebuilt from the cached takes at no cost, the missile ships two
  clean launches and the repair kit lost a take whose clank came 1.65 s late.
- **2026-10-06, the 2.0 revival.** PR #9 rebuilt many maps as real places and
  added landmarks and props; the sound had not kept up. Twenty assets
  (5,280 credits, including a first-take preview of every prompt and two prompt
  revisions): the telegraph pole's snap, wires and landing, carts, straw, tents,
  steel topples, clay jars, a loose drum's knock and the fuel drum's blast (props
  above); calm-water beds for Nordhavn's fjord (`amb_fjord`) and Saltwind's
  sheltered Dalmatian bay (`amb_adriatic`), which had played amb_coastal's
  breaking surf; Suzhou Creek's water (`layer_creek`) and DYE-M's station drone
  (`layer_station`); oystercatchers and moored boats (`spot_oystercatcher`,
  `spot_boat_creak`); the bells (`bell_toll`, `bell_orthodox`); and the period
  flyovers. Monument Valley lost the river layer it never had, and it and Wadi
  Rum moved from amb_canyon (a steady distant river under the wind) to the
  desert bed. Prompt lessons: cicadas asked for in a bed came back as one steady
  6–8 kHz shrill holding 99 % of the take's energy over 4 kHz, twice, so they
  stay spots; "one strike only" works for a bell, while the Orthodox rhythm of
  small bells comes back as a separate burst after the great bell in half the
  takes (the picks keep the one that rings over its hum). Five assets are pinned
  in `sfx-picks.json`: the weight scoring preferred rumble over the wires' twang
  and over a pole's audible thud, a straw take that thumped like footsteps, a
  pole crack that rattled, and the Orthodox takes without the small bells.
  Every new file is measured as it ships (`tools/audio/loudness-receipt.mjs`,
  `tools/audio/sfx-loudness.json`) and held to its preset by
  `sfxLoudness.selftest.mjs`. The battle set now pins every prop sound (17 more
  assets, about 8 MB decoded on desktop and 3 MB on mobile), so no first crush
  of a battle is silent while it decodes.
- **2026-10-13, destruction round 1 (AU.03).** The owner (10-12): "a lot of
  stuff like destructions and impacts ... so its not quiet all the time". The
  gap list (every bus event against the engine's subscriptions) found buildings
  breaking as brick whatever they were, section falls (`structure:breach`) silent,
  set pieces breaking as wooden crates, a hull's crash and landing a coin toss
  between rock and wall, and every missile family on one launch bank. 38 new
  assets and `turret_land` re-rolled to four variants (6,288 credits): a wall
  giving way and a building coming down in each of six materials (brick, stone,
  timber, concrete, plaster or adobe, sheet steel), read from the structure's
  damage anatomy (`world.structureDamage(id).anatomy.rubble`, the same shares
  the fx dust uses; main.ts hands the mixer the world through `getWorld`); a roof
  caving in and a storey dropping; a round through brick or mud-brick, an HE
  burst on masonry, big windows going, heavy pieces landing on the heap; distant
  collapses, breaches, building strikes and ground strikes crossfaded in by range
  (`STRUCTURE_FAR`: 180–560 m in, 320–820 m out); heavy plant, an aircraft
  fuselage, a lorry, the village well, the monument's crack and fall and the coal
  heaps; a hull landing and a hull ramming steel (`tank:impact` now carries the
  struck record's kind from the solo step); a far ammunition blast; and four
  launches (tube, soft eject, rail, gun barrel) chosen by the round's name, then
  its launch profile (`weaponAudio.missileLaunchFor`, the fx lane's families).
  The long debris sounds use a new `debris` preset (56 kbps mono). The report
  banks moved to `weaponAudio.ts`, and `weaponCoverage.selftest.mjs` walks every
  playable vehicle's rounds and roof stations (220 vehicles, 643 rounds, 75
  stations, the M551A1 TTS's 30 mm among them) to a shipped report. The
  payload cap rose from 20 to 28 MB for this and the next rounds.
- **2026-10-13, crew lines for the silent stretches (AU.04, AU.05).** Ten lines
  in all 13 languages (23 takes per pack, 11,226 credits): between fights the
  commander keeps the crew watching (`quiet_scan`, `quiet_hold`, `quiet_move`,
  the gunner's `quiet_crew`, `objective_push` in the objective modes, and
  `hull_status` after damage), a building coming down within 160 m
  (`building_down`), the front's aircraft passing within 900 m
  (`aircraft_overhead`, half the time), the far guns (`artillery_far`, a quarter
  of the time) and pulling up in cover within 8 s of a hit (`in_cover`). The
  quiet calls come from `QUIET_RADIO` in the engine: only once nothing over
  118 dB has sounded for 25 s and the net has been silent as long, at most one
  every 50–85 s, in turn rather than at random (their own seeded stream), each
  flavour that yields to any real call, so the radio never becomes "way too much
  audio". The first take of a new library voice in each language hit a 409
  (`already_running`, the voice added twice at once); re-running the line fills
  it from the cache.
- **2026-10-13, ambience variety and the known limits (AU.06, AU.07).** 19 new
  spots and three beds regenerated (6,155 credits). The far war
  (`environmentScenes.ts` `WAR_SPOTS`: a tank column, a brew-up, a machine-gun
  duel, mortars, a town coming down, an engine behind a hill, each recorded a
  kilometre or more away) joins every scene whose distant-war bed plays, at half
  the place's own spot weight, so about a third of the spots are the war's; each
  place adds its own life (cattle, sheep, horses, a rooster, goats, camels, loose
  shutters and roofing, falling branches, ravens, howler monkeys, a hornbill, a
  cold wind). The jungle and mangrove beds were 99 % 6–12 kHz insect hiss; asked
  for water, leaves and animals with insects only faint and low, they come back
  at 71 % and 75 % there with the rest from 3–6 kHz drips and under 3 kHz water
  and frogs. The oasis bed's loop seam stepped 2.8 dB; the new take steps
  0.15 dB. The first press anywhere loads the engine, so its own click was
  silent. The facade now transfers the mixer module and decodes the
  interface's press sounds at boot idle after the first frame, with no audio
  device (`prepareInterfaceSounds` → `assetLibrary.predecodeAssets`, an
  OfflineAudioContext); the engine built at the first press starts with them
  (the library's `seed`), so that press plays at once. A press that beats the
  decode waits for it at most 120 ms and is dropped after that: a late click
  reads as input lag, worse than silence (`interfacePress.selftest.mjs`).
- **2026-10-13, variety round.** 31 of the most frequent impacts, breaks,
  fires and collisions shipped one or two variants (the ground strikes, glass,
  crates, containers, sandbags, fences, cars, falling trees, debris, the HE and
  tank blasts, the wreck's creak, hull knocks). Each now ships two or three: the
  shipped takes kept by pin (`sfx-picks.json`) and the best new take added
  (2,073 credits); snow strikes stay at two (every new take sat 9-21 LU under
  the impact preset). The loudness receipt now covers 26 of them; five keep
  older variants outside their preset (two ground strikes, the snow, the wire
  snag's and the metal debris's true peaks) and stay unrecorded as before.
  With the roof stations armed on 75 vehicles, machine-gun rounds strike walls,
  wrecks, cars and timber all battle, and every one landed as a puff of dirt:
  `bullet_masonry`, `bullet_metal` and `bullet_wood` (180 credits) now sound by
  what was struck (a building by its walls, a prop by its kind, hard ground as
  stone), with no ricochet whine. A hull shoving a burnt-out wreck strikes dead
  steel (`hit_metal`), not a live tank's ram.
  The field nets and garnish on 75 hulls (`ghillieSuit.ts`, which marks their
  meshes `userData.fieldSuit`) rustle as the hull moves: the engine walks a
  hull's visual once to find a suit, and the vehicle rig plays
  `net_rustle_loop` (200 credits) under the running gear by speed, on every
  suited hull in the near LOD, a touch nearer on our own.
  A collapse's rubble is rigid bodies (`fx/rubbleBodies.ts`, deploy 223): the
  debris pool reports each hard landing through `fx/clock.ts`
  `emitDebrisLanding`, and a piece of 20 kg or more landing at 2.5 m/s or more
  thuds where it lands (`rubble_chunk_land`, louder for heavier and faster
  pieces, one per 0.15 s at most). The one-line report sits on
  `item/audio-rubble-hook` (from `item/destruct-all`).
  A burst's near miss on a parked vehicle (`props.ts` `blastNear`: dented, its
  glass blown, shoved) is heard: past a strength of 0.3 the world reports it on
  the destroyed-prop seam with `nearMiss`, and the engine plays the glass and a
  steel dent by its strength, one per 0.1 s (a car park's worth from one shell
  is one sound), never the car crushed.
  Measured on `tools/audio-mix-balance.mjs` (2026-10-13, this branch at
  06f2c6e96, `report.json`): bed −35.3 dBFS; a brick house collapsing at 40 m
  19.9 dB over it and 0.7 dB over a near cannon's loudest 100 ms (the guns still
  lead within 2 dB), at 450 m 5.9 dB over it on its distant recording; a wall
  giving way at 40 m 19.9 dB; a tube launch at 30 m 24.6 dB (its sustained roar;
  the new launch banks are 2 dB quieter than the old `atgm_launch`). The existing
  checks: cannon 19.1 / 9.5 / 6.3 dB at 15 / 150 / 400 m, our gun 19.3, radio
  17.2 over the bed and 1.9 under a near cannon, 4.5 starts/s, garage −31.4 dBFS.
  The 150 m cannon sat 0.5 dB under its 10 dB gate, inherited from main (a CPU
  A/B of the engine on both trees gave identical bed loops, spot rate and shot
  voices). A6 then gave the 125 mm its distant thunder from 20 m (`farFadeM`
  [20, 450], was [100, 450]) and its crack a longer reach (`gun_125_close`
  refM 56, was 35): the next probe (6d7a1ebd4) read the 150 m shot 2.3 dB
  louder (the CPU estimate was 2.29), 10.9 dB over a bed that ran 0.9 dB louder
  than the run before, 15 m −0.5 dB and 400 m +0.5 dB, GREEN.
- **2026-10-14, the countdown.** The owner: the tanks and the world were not
  heard until after the countdown. Nothing gated them: every countdown sound
  ran, but on a cold entry its recordings sat at the back of one first-in,
  first-out decode queue behind the whole combat set (our idle 638th of 673
  files on Verdant, the bed 603rd, the horn 500th), so the first sounds of a
  battle were the horn and the crew's start call. The battle warm now queues its presence set
  first in a front lane, a sound asked for before it decodes jumps the bulk,
  network rounds warm their lobby roster, and the start-up waits up to a second
  for its recording (the bank held down) instead of being lost. With it: the
  count ticks its last three seconds, a network battle rolls out when its count
  reaches 0 (it never did, so its horn, start call, bells, team counts and
  quiet-stretch radio were all off), a battle rolls out once, and the loader
  keeps its bed from the battle phase edge to the reveal. Two verifier
  counterexamples followed: the network rollout turned the side counts on over
  a seat's spotted list (the first enemy spotted read as "last enemy" with four
  alive and hidden), so they now count the roster where a death is final and
  nothing otherwise; and the warm resolved engine families by id alone, so 40
  of 220 vehicles (every IFV) warmed a heavy's diesel instead of their own.

### Cost

Credits from the local ledger (`ledgerSpend()` in `elevenlabs.mjs`), both
rounds:

| Kind | First round | Feedback rounds | Total |
|---|---|---|---|
| Sound generation | 26,625 | 35,309 | 61,934 |
| Text-to-speech (casts, auditions, builds, re-rolls) | 9,029 | 11,688 | 20,717 |
| Speech-to-text verification | 1,718 | 2,115 | 3,833 |
| **All** | **37,372** | **49,112** | **86,484** |

The 2.0 revival (2026-10-06) added 5,280 credits of sound generation on the
owner's key (read from a file through `ELEVENLABS_API_KEY_FILE`): 1,639 of them
previewed the first take of every prompt and of the revised ones, the rest
bought the remaining takes.

The feedback rounds' sound generation is the regenerated interface, stingers
and foley, the distant armour hits (400), the aircraft and Infected sounds
(1,350), and the own-tank round (22,819: the own-gun reports and machinery,
the turret drive, every battlefield bed twice and ten of them again with four
takes, the hangar), the drone's hover and wind (528), the regenerated gun
reports (3,044), the AC-130 and mode packs (2,996) and the recordings that
replaced every synthesized sound (1,806); nearly all of their speech is the
serious recast and rebuild of all 13 packs (10,873), the re-rolls of doubled
calls (634), the incoming-drone call (172) and the nine lines for the tank's own
systems, the gunship and its drops (1,202).

## Changing or extending it

Start from the [audio-generation skill](audio-generation/SKILL.md); the table
below is the short form.

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
| `src/audio/weaponAudio.selftest.mjs` | bore classes, ordering, report trims, reload choreography |
| `src/audio/vehicleAudioModel.selftest.mjs` | idle, gearboxes, no gear hunting, turbine spool, braking, scrub, landings, stalls |
| `src/audio/soundAssets.selftest.mjs` | manifests against files, every engine reference, families, tracks, scenes, packs, payload budgets, and no oscillator anywhere in the sound engine or the HUD |
| `src/audio/assetLibrary.selftest.mjs` | pinning, eviction and reload, voice bytes, the mobile variant cap |
| `src/audio/crewVoice.selftest.mjs` | all 13 selectable packs, national/fixed resolution, flags and localized labels, legacy migration, invalid stored values |
| `src/audio/crewRadio.selftest.mjs` | radio discipline, interrupts (a report cuts flavour), stale drops, every pack carrying every line and a missing take staying silent, damage, live switching and cold-pack behavior, the recorded key-up, release and net static (and silence, never a tone, while they decode) |
| `src/audio/voiceTriggers.selftest.mjs` | all 109 crew lines from their game moments through the real engine (shot results back to back, the reasoning exchange after a Chain of Thought, our systems, the drone, the gunship, supply drops, objectives, hits, mobility, the count, results), a second battle's smoke, and no sound or crew chained in for another |
| `src/audio/audioEngine.selftest.mjs` | the engine against the shipped manifests: rigs, crews, scenes, weapon layering and delay, HDR trim, the punch and low layers, reloads, hits, edge cases, destruction, concussion, our hits (distant bank, own-hit law, no marker), the gunner's calls and misses, our own report and recoil, the drum refill, the turret start, kill-cam, panning, scope, aircraft (gunship, enemy and own drones), mode events, interface sounds and their dedupe, the cabin alarms, the sixth-sense lamp and the loading bed, no oscillator in a whole session, rig ownership near our hull, late adoption, pause, garage |
| `src/audio/lazyAudio.selftest.mjs` | deferred engine; the facade makes no sound of its own |
| `src/audio/countdownAudio.selftest.mjs` | the countdown through the real frame owner, rollout runtime and engine: our hull (its start-up once), the other tanks and the world sound from the count, master and channel volume and mute apply during it, nothing of a weapon before the rollout, 3-2-1 ticks and one horn solo and network, a late join rolling out silently, the presence set decoding before the combat banks, the front lane, the start-up waiting for its recording, the loader's bed kept to the reveal |
| `src/audio/propSounds.selftest.mjs` | every world kind (the kits, the light buildings, the sandbags, the poles, the AA guns, the trees) has its own prop sound and every asset ships; the old regex's slips stay fixed; topples land with the hinge; `props.ts` reports the poles and the loose knocks through the seam |
| `src/audio/audioRevival.selftest.mjs` | the engine on the shipped manifests: a pole's snap, wires and landing in time, a haycart, a knocked drum (and its rate), the fuel drum, a silent cone; the rebuilt maps' beds and layers; flyovers by era and by named type; bells from the nearest tower in earshot, rare, held by the fighting until 25 s of quiet, Orthodox and campanile bells, none where none ring or in the garage |
| `src/audio/sfxLoudness.selftest.mjs` | each measured asset's files against `tools/audio/sfx-loudness.json` by SHA-256: duration, channels, WebM/Opus container, loudness and true peak on the mastering preset |
| `src/audio/interfaceSounds.selftest.mjs` | the control classifier (tabs, tank cards, options, toggles, back, primary, sliders, opt-outs, menus) and the delegated listeners |

Browser probes use the machine-wide GPU capture lock; set
`COT_SHOTS_LOCK_TIMEOUT_MS=10800000` on a busy machine. The lightweight
`crew-voice.browser.mjs` fixture expects its caller to hold the capture lease
and supply a running Vite server, like `custom-select.browser.mjs`.

| Probe | Checks |
|---|---|
| `node tools/audio-mix-balance.mjs` | garage audibility; gunfire at 15/150/400 m and our own gun over the idle battle bed on their loudest 100 ms (14/10/4 and 16 dB), and a near crack's peak (22 dB); each shot's anatomy from its arrival (a near cannon must crack: rise ≤ 15 ms, ≤ 50 % low body) and soft-clip hits; the radio at least 12 dB over the bed and at most 4 dB over a near cannon; sound starts and radio lines per second in live combat; the drone in flight (the listener rides it, its motors lead, the feed brightens); an AC-130 battle (the opener, the cabin, the howitzer and its case) |
| `node tools/sfx-smoke.mjs` | every scene's assets, the calibre ladder, the distance crossfade and propagation delay, routing, jitter, volley headroom (battle held frozen) |
| `node tools/voice-smoke.mjs` | the national crew, live language switching through the bus and the Sound tab, all 13 packs through the radio chain |
| `node tools/crew-voice.browser.mjs --url=http://127.0.0.1:5173` | real Settings and persistence in English/Chinese on desktop, phone and landscape; flags, keyboard focus, dismissal, reset, reload, and all 13 packs decoded and played through Web Audio |
| `node tools/audio-probe.mjs` | the full event, voice and bus matrix with recordings |
| `node tools/audio-spatial-killcam-probe.mjs` | arcade/sniper perspective, cannon and engine distance falloff, rams, the kill-cam replay |
| `node tools/pause-probe.mjs` | the pause duck and resume |

## Known limits

- Browsers without WebM/Opus decode (Safari before 17.4) are silent: there are
  no synthesized fallbacks.
- `/audio/` files are revalidated by ETag (only hashed `/assets/` are
  immutable), so a regenerated file with the same name is picked up on the next
  load at the cost of a revalidation per file.
- The sound-generation model has no seed: rebuilding with an unchanged prompt
  reuses the cache, but regenerating without it produces different takes.
- The renderings were written for each army's register and checked by
  speech-to-text, not by native speakers or veterans; corrections go in
  `crew-lines.json`. The two takes flagged until 2026-10-13 are re-rolled: the
  near-miss call's delivery no longer asks for an exhale (the Chinese pack
  rebuilt with it), and the Hebrew goal call is two words in both takes ("גול
  נכבש", "שער לטובתנו"). Homophones the transcriber spells differently remain
  flagged and are harmless (the Chinese "近失弹" heard as "进食蛋").
- A press before the boot-idle warm has run (the first frame plus an idle
  slot) stays silent; one that finds its sound still decoding waits at most
  120 ms.
- The jungle and mangrove beds still carry most of their energy above 6 kHz
  (drips, leaves and faint insects; 71 % and 75 %, down from 99 %).
- Bells ring only from towers the world has placed: Verdant's church, Saltwind's
  campanile and the Podhale belfry arrive with the landmarks lane, and a map
  without a tower in earshot stays silent. The front's flyover event does not
  name its aircraft yet, so a map with fighters and bombers picks between their
  sounds at random until it does.
- **2026-10-19, the AC-130's kill calls (lane ac130-fx-228).** The gunship crew
  confirms its own kills: `gunship_kill` ("Good hit. Target destroyed." /
  "Splash. Target down.") and `gunship_double` ("Second target destroyed." /
  "Another one down. Good effect."), the gunner's voice in all 13 languages, two
  takes each (1,754 credits, 0 flagged takes). The engine picks them by the
  kill's source, which the authority stamps on `tank:destroyed`
  (`sim/aerialCombat.ts` `killSourceOf`): an `ac130` kill is the gunship crew's
  call, never the tank crew's `target_destroyed` / `double_kill`
  ("Tank knocked out.", "Target stop.").
