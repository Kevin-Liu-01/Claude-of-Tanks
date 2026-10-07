# Choosing takes and catching bad ones

The model has no seed and returns a different sound every time, so each asset
is generated several times and the shipped variants are chosen on measurements.
This page lists what is measured, how takes are scored, and every failure mode
found so far with the rule that now catches it.

## Measurements (`sfx-qa.mjs`, `pcm.mjs`)

Per raw take:

| Measure | Meaning |
|---|---|
| peak, RMS | signal level |
| onsets, first onset | how many events, and how soon the first lands |
| decay | how long the energy lasts (dead air if a "4 s" take is over in 0.2 s) |
| bands | energy shares in 20–150 Hz, 150–800 Hz, 0.8–4 kHz, 4–20 kHz |
| seam | for loops: the level step and spectral mismatch across the loop point |
| clipped runs | consecutive samples at full scale |
| transient anatomy | gun reports and punches: rise to the loudest millisecond, energy in the first 10/50/200/600 ms, crest, body under 100 Hz |
| low-band glide | `lowToneGlide`: the longest run of regular zero crossings in 25–250 Hz and how far its pitch moves |
| split gap | `splitGap`: a run of 250 ms or more over 25 dB under the peak between sound and a loud body |

`node tools/audio/sfx-qa.mjs --ids <id> --sheets <dir>` writes spectrogram and
waveform contact sheets of every take; `node tools/audio/sheet.mjs out.png <files…>`
does the same for shipped files.

## Scoring (`build-sfx.mjs`)

Higher is better; the best `variants` takes ship unless `sfx-picks.json` pins
others.

- Level up to a ceiling; clipping down.
- Punchy presets: a first onset inside 0.4 s; single-shot assets lose 1.5 per
  extra onset.
- Loops: a small seam step and spectral mismatch.
- Gun reports: an instant rise, early energy and crest up; a late swell, low
  boom and clipping down.
- Punch layers: an instant slam over within 200 ms, all weight and no crack.
- Punch and sub layers: −8 for a pitched low tone that glides 12 % over 60 ms
  or holds for 150 ms.
- Single-event sounds: −4 to −8 for a take split by 400 ms or more of silence
  (spot calls, beds and stings may pause).
- Dead air: −1.
- Weight by family: distant reports and blasts are rewarded for low end and
  penalised for harsh highs; the interface, stings, equipment and edge sounds
  for staying dark; loading machinery for weight plus a clean steel transient
  and one event per clunk; beds for body under the hiss.

Single-shot assets (machine guns, autocannons, bullets, the radio key, the
punches) are cut before a second report within 8 dB of the first, and a cut
that leaves under 0.25 s is dropped, so fewer variants ship rather than a click.

## Failure modes

| Symptom (what a player hears) | Cause | Caught by |
|---|---|---|
| Guns sound like old film or explosions | Prompts for "low-frequency punch … rolling echo" returned blasts peaking 60–320 ms late, picked for low end, then limited flat by loudness mastering | Range-recording prompts; transient-anatomy scoring; the `gunshot` preset normalises on the true peak; `shapeTransient` pulls a held body down |
| A machine gun fires a burst for one round | Short prompts return several shots | "Gunshot sound effect … One isolated shot."; single-shot scoring; first-shot truncation |
| A little "boing" under hits or blasts | A falling low sine: once a synthesized fallback, then a risk in generated weight layers | No synthesis anywhere (`soundAssets.selftest.mjs` rejects oscillators); `lowToneGlide` scoring |
| A lone pop with the real sound arriving late ("occasionally", e.g. every other AC-130 missile) | A split take: the AC-130 missile's take 0 was an ignition pop, 1.5 s of silence, then the motor; two variants that never repeat play it every other time | `splitGap` scoring; the missile now ships takes 3 and 1 |
| A bed jumps in level every 20 s | A level step at the loop seam | "Continuous at an even level from start to end"; seam scoring; four takes |
| A bed is all hiss | The take has no body under its air | Body-under-hiss scoring |
| Interface sounds jingle | Bright words in the prompt | Heavy-hardware prompts; darkness scoring |
| A tone falls after every crew line | The radio release chirped | "No beep, no chirp, no tone" in the key-out prompt |
| A crew call is said twice ("HE. HE.") | `eleven_v4` doubles one- and two-word calls | Repeat detection holds such a take under the bar; pause trimming keeps a clean cut |
| A correct take is flagged as wrong | Homophones and digits in the transcript | Reported for review, never auto-rejected |
| An alarm pierces | A bright take (2.4 kHz) | Pinned a lower take; "muffled by the hull" |
| A thud or a twang loses to rumble | The weight score (`4·low`) on the `impact` preset rewards a take whose body is low-band noise over one with the event (a telegraph wire's twang; a pole's thud 31 dB down that mastering would lift 30 dB) | Pinned (`pole_wires`, `pole_fall`, 2026-10-06); look at the sheet before trusting a weight-scored pick |

When a player reports something "occasional", suspect one bad variant first:
with two variants that never repeat, a defect plays on every other use.

## Finding a bad take

1. Find what plays at that moment: `window.__COT_AUDIO.sfxLog` lists every
   started sound (asset, start, gain, rate, distance, bus; not which variant,
   so measure them all), and `sayLog` and `voiceLog` the crew lines asked for
   and spoken.
2. Measure the asset's shipped variants (envelope, onsets, split gaps, glides)
   and compare them; a contact sheet shows a split or a swell at a glance.
3. When the owner has to pick by ear, build a listening page: every candidate
   as a labelled clip on one page, so the owner can say "it's B". That is how
   the boing was found.
4. Fix it at the source: a scoring rule that catches the class of defect, then
   a rebuild from the cache. A pin in `sfx-picks.json` is for a one-off.

## Verification after a rebuild

- `node src/audio/soundAssets.selftest.mjs`: manifests against files, every
  engine reference, families, payload budgets, no oscillator.
- `node src/audio/audioEngine.selftest.mjs` and
  `node src/audio/voiceTriggers.selftest.mjs`: the engine on the shipped
  manifests, every crew line driven by its game moment, no chained plays.
- `node src/audio/crewRadio.selftest.mjs`: every pack carries every line.
- `node tools/audio/loudness-receipt.mjs --ids <ids>` after the build, then
  `node src/audio/sfxLoudness.selftest.mjs`: the files as they ship, by hash,
  against their preset; `--check` re-measures every recorded asset.
- `node src/audio/propSounds.selftest.mjs` when a prop sound or a world kind
  changes: every kind has its own recipe and every recipe's asset ships.
- Mix and loudness in a browser: `node tools/audio-mix-balance.mjs`, plus the
  probes in [`docs/AUDIO.md`](../AUDIO.md#verification). These take the
  machine-wide GPU capture lock.
