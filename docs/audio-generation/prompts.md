# Prompt cookbook

What to write for each kind of sound, with prompts that shipped, and the
prompts that failed with what they returned instead. All quoted prompts come
from `tools/audio/sfx-catalog.mjs` or its history.

## Rules for every sound prompt

- **One concrete event per prompt.** Layering happens in the engine (a gun is
  its report, the punch under it, a tail, the breech), not in one generation.
- **Name the perspective and the material**: "recorded 30 metres beside it",
  "heard from inside a tank turret", "close-miked inside a tank turret, weighty
  steel", "heard on the ground", "about one kilometre away".
- **End with exclusions that keep layers separable**: every prompt ends with
  "no music, no voices"; engines add "no track noise", tracks add "no engine
  sound", beds add "no engines, no gunfire", cabin layers add "no engine sound".
- **Say the form.** Loops say "Seamless loop of …" and set `loop: true`;
  one-shots say "One-shot of …" or "Sound effect: …".
- **Stay under 450 characters.** The API rejects longer prompts.
- **Describe weight, not brightness.** "ding", "chime", "beep", "bright",
  "triumphant" and "sparkle" return light, jingly sounds a serious war game
  should not have.
- **Do not ask for two events in sequence unless a gap is acceptable.** "A sharp
  ignition pop, then a fierce roaring rocket motor" came back once as the pop,
  1.5 s of silence, then the motor (see [quality.md](quality.md#failure-modes)).

Prompt influence (`inf`): 0.4 for beds (let the model fill the space), 0.45 by
default, 0.6 for shots and impacts, 0.7–0.75 for small arms, where looser
settings return bursts.

## Templates by kind

### Tank guns: a range recording, not a film

What shipped (one per bore, six takes each, `gunshot` preset):

> Gunshot sound effect: one single shot of a 120 mm smoothbore tank cannon at a
> military range, recorded 30 metres beside it: instantaneous, a violent,
> extremely sharp muzzle-blast crack, a hard concussive punch as the pressure
> wave slaps off the ground, then a dry echo rolling off distant hills.
> Realistic documentary field recording, not cinematic, no explosion, no rumble
> swell, no debris, no music, no voices. One isolated shot.

The bore scales the adjectives: 90 mm "an extremely sharp, cracking muzzle blast
with a lighter body", 152 mm "a colossal, sharp muzzle blast with a deep, heavy
report".

What failed: "deep concussive low-frequency punch … rolling outdoor echo". The
model returned cinematic explosions that peaked 60–320 ms after the shot with
25–96 % of their body under 100 Hz, which players heard as "old film" or "gamey
blasts". A real gun is an instant crack; its weight is the punch under the crack
and the echo after it.

### Autocannons and machine guns: frame it as a gunshot

> Gunshot sound effect: one single shot of a 30 mm autocannon on an armoured
> vehicle at a firing range, recorded close beside it: an instant, extremely
> sharp hard, sharp crack with a hard punch and a metallic clank of the
> mechanism, then a short outdoor echo. Realistic documentary field recording,
> not cinematic, no explosion, no rumble swell, no debris, no music, no voices.
> One isolated shot.

What failed: short "One-shot of a single round" prompts at 0.6–1.4 s came back
quiet and smeared, or as bursts. The "Gunshot sound effect … One isolated shot"
framing at 1.2 s or longer, prompt influence 0.75, 6–8 takes, single-shot
scoring and first-shot truncation (see [quality.md](quality.md)) fixed them.

### Distant reports

> One-shot of a tank cannon fired about one kilometre away: muffled boom with a
> soft attack and a rolling thunder-like echo across open terrain, no crack.
> High-quality professional field recording, no music, no voices.

Say "no crack" so the distance is believable, and let the far bank be a
loudness-mastered boom under the close crack.

### Interior and own-vehicle sounds

> One-shot heard from inside a tank turret as its own 125 mm main gun fires:
> massive muffled concussion, steel hull ringing, heavy recoil slam of the
> breech block. No music, no voices.

The AC-130's own guns are "fired from inside the cargo cabin of a military
gunship aircraft … No engine noise" so the cabin loop can carry the engines.

### Loading machinery

A shared suffix keeps the set consistent: "close-miked inside a tank turret,
weighty steel with crisp mechanical detail".

> One-shot of a tank gun's breech block slamming shut on a fresh round: a crisp,
> weighty, satisfying steel clack, close-miked inside a tank turret, weighty
> steel with crisp mechanical detail. No music, no voices.

One action per asset (breech open, shell grab, ram, latch, carousel turn): the
engine sequences them along the reload.

### Impacts

`punch: true` wraps the prompt: "Sound effect: <prompt> Very loud, with an
immediate hard attack." with prompt influence at least 0.6.

> One-shot of a large armour-piercing tank round penetrating thick steel armour:
> massive metallic slam, tearing metal, spall debris rattling.

Slow-onset events (rollovers, debris rain, collapses, a parachuted crate) opt
out with `punch: false`.

### Weight layers: punch and sub

The punch under a close report and the low end under blasts are separate
assets with their own presets (`punch`: peak-normalised and short; `sub`:
two-stage 190 Hz low-pass). Scoring rejects any take whose low band holds a
pitched tone that glides (a falling sine reads as a cartoon boing).

### Engines and running gear

Four bands per powertrain family as loops, plus start and stop:

> Seamless loop of an M1 Abrams gas turbine tank engine idling: high-pitched
> jet-like whine, airy hiss, faint low hum, no diesel knock. Constant engine
> speed, recorded close to the engine deck outside, no track noise, no music,
> no voices.

Tracks per surface and speed, "no engine sound". The drivetrain whines failed
as "a gear whine over a low hum" (all hum came back); asking for the whine
alone worked.

### Ambience beds

> Seamless loop of the ambience of open farmland: a steady wind across tall
> grass and crops, the grass hissing softly, a distant crow. Continuous at an
> even level from start to end, rich and detailed, wide stereo, no engines, no
> gunfire, no music, no voices.

"Continuous at an even level from start to end" removed the level steps at the
loop seam, and four takes per bed let the scorer reject hiss-only takes. Avoid
sirens, songbirds and sudden events inside a bed: put them in positional spot
sounds that the environment director scatters. Cicadas too (2026-10-06): asked
for in a Mediterranean bed, even "far off … faint, soft", every take came back
as one steady 6–8 kHz shrill holding 99 % of its energy over 4 kHz; the bed that
shipped asks for the waves and the breeze with "no insects", and the cicadas
are spots.

### Bells

> One-shot of a single large bronze church bell tolled once, recorded outdoors
> in the churchyard below the tower: the dull strike of the clapper, then a
> deep solemn tone ringing on and fading away slowly over five seconds. One
> strike only, no other bells. No music, no voices.

"One strike only" returned one strike in all eight takes; the engine sequences
a toll and pitches the stroke by the tower. Record it near (the churchyard),
not "a few hundred metres away": the engine adds the distance, and a far take
placed far is doubly muffled. An Orthodox tower's rhythm of small bells over the
great bell's hum came back in half the takes as a separate burst after the hum
had died; pick the take that overlaps.

### Alarms, cabin sounds and the radio

> Seamless loop of a tank's interior fire alarm sounding inside the steel crew
> compartment: a harsh, urgent electric horn pulsing on and off about twice a
> second, muffled by the hull, steady and constant. No music, no voices.

"Muffled by the hull" keeps alarms from piercing (a 2.4 kHz take was rejected
for a lower one). The radio release must say "No beep, no chirp, no tone": an
earlier key-out ended in a falling tone after every crew line.

### Interface and stingers

The interface is heavy hardware:

> One-shot heavy military hardware sound for a serious war game interface, low
> and dull, short, no beeps, no chimes, no electronic tones: a heavy
> armoured-vehicle console push button pressed, a short dull mechanical clunk
> with no ring.

Stingers are grave war-film brass and timpani, "dark and serious, no fanfare, no
vocals". Mode openers are field sounds rather than music so each mode is
recognisable by ear: an air-raid siren, a preparatory barrage, a vault door, a
ship's foghorn.

### Aircraft

> Seamless loop of a small FPV combat drone flying close by: four small electric
> motors at high rpm, an aggressive buzzing propeller whine, steady and
> constant. High-quality professional field recording, no music, no voices.

The drone has separate hover, full-throttle and wind loops that the engine
crossfades; the gunship has an orbit loop heard from the ground and a cabin
loop heard inside.

## Crew scripts

Each line is written for what that army's armoured crews actually say over the
intercom, in a terse procedure register, never as a literal translation:

- German "Brand!" for a vehicle fire, because "Feuer" is the order to fire.
- British "Contact, wait out"; Russian ammunition calls in the nominative
  ("Бронебойный"); IDF contact calls by clock position.
- Numbers are spelled out ("Thirty mike-mike", "One-five-two"), and Latin
  acronyms a speech engine would misread are avoided.
- Calls are short and controlled: no cheering, no panic. The delivery tag says
  so: "clipped, steady", "flat, controlled", "crisp, steady".
- Watch tank jargon: "hull down" means behind a crest, so the suspension line
  became "Hull lowered, set."
- Two takes per line in every language (the same count everywhere) give the
  radio variety without repeats.

The engine adds the radio character live (band limit, compression, drive,
damage dropouts), so takes are mastered dry.

## Casting

`voice-casting.mjs` searches the Voice Library per language for native male
voices without live moderation or a credit multiplier, ranked toward serious,
mature profiles (deep, calm, authoritative, narration) and away from upbeat,
energetic or social-media ones. `voice-audition.mjs` has each candidate read two
working-register calls, checks them through speech-to-text and measures pitch
and spectral centroid. The deepest clean voice becomes the commander and a
distinct, equally serious voice the crew. Speech uses `eleven_v4` at stability
0.6 and similarity 0.8; the first, livelier cast was replaced for sounding
"gamey".

## Speech model behaviours

- **Doubled short calls.** `eleven_v4` says a one- or two-word call twice on
  nearly every attempt, so more attempts do not help. The build cuts such a
  take at its pauses and keeps a cut whose own transcript reads as the script.
- **Homophones.** Some correct takes transcribe as different words (Japanese
  装填 / 争点, 徹甲弾 / 鉄鋼弾); they are flagged for review, not rejected.
- **Digits.** The transcriber may write "30 mil" for "Thirty mil."; the take is
  fine.
