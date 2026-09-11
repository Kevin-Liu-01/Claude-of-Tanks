# Launch media and fleet probes

The restored capture tools use the current procedural runtime and the shared
capture queue. Run them from the repository root; do not acquire another queue
lease around them. Keep their output under ignored `.qa-dev/` or `shots/` paths.
Freeze the served public build while capturing. FFmpeg and Chromium are required;
the score tools also require the licensed Apple Loops installed on this host.
Source comparison models never enter these recordings.

## Media production

- `tools/feature-promo-capture.mjs --base <served-build> --out <ui-directory>`
  records Garage, battle entry/live controls, Studio, Gallery and documentation.
  Its battle receipt records a real shot/reload; a shot is not proof of a kill.
- `tools/feature-promo-map-rail.mjs --out <map-directory>` records a ten-map tour.
  Ten captured maps are a selection from the roster, not its total size.
- `tools/feature-promo-frontline.mjs --out <frontline-directory>` records the
  contemporary fleet clips used by the shorter cuts.
- `tools/studio-example-videos.mjs --collection duels --count 20 --fps 60
  --out <cinematic-directory>` records the twenty deterministic duel scenes.
- `tools/feature-promo-score.mjs --out <master-directory>/music/claude-of-tanks-original-score.wav`
  arranges the licensed stems into the synchronized forty-second soundtrack.
- `tools/feature-promo-video.mjs --out <master-directory>/trailer.mp4
  --ui <ui-directory> --cinematics <cinematic-directory> --map-rails <map-directory>`
  builds the forty-second master. Run a full build when sources or captions
  change; `--master-only` reuses already encoded chapters. Motion and duration
  gates remain active. Existing output versions are archived.
- `tools/feature-promo-balanced-v2.mjs --out <balanced-directory>
  --ui <ui-directory> --cinematics <cinematic-directory> --map-rails <map-directory>
  --frontline <frontline-directory>/02_kf51b_autumn.webm` creates synchronized
  versions with and without promotional labels, each 1496 frames at 60 fps.
- `tools/feature-promo-variants.mjs --work <master-directory>/work
  --out <variants-directory> --ui <ui-directory> --cinematics <cinematic-directory>
  --map-rails <map-directory>` assembles the alternate cuts from current chapters.

Invoke each command with `node`. Native captures preserve normal foreground and
background browser behavior. Converting captured frames to CFR 60 is an output
format, not evidence of sustained 60 fps rendering. Inspect actual frames and
the soundtrack in addition to automatic timing checks.

`tools/studio-ground-contact-probe.mjs` audits native staged contact against
the current terrain and writes its measured evidence. Use its configured
support footprint when interpreting a result: a pass at the sampled support
points is not proof that every track vertex clears every intervening terrain
peak. It owns the same capture lease and must not be wrapped in another one.

## Fleet measurements

`node tools/fleet-selection-probe.mjs --url=<served-build> --out=<fresh-directory>`
uses the real Garage and Gallery controls for the handoff fleet plus comparison
vehicles. `--ids=id1,id2` selects a smaller set. The output retains first selection,
revisit and warmed measurements, errors and build identity. Host contention must
be controlled before treating these measurements as a performance comparison.

`node tools/fleet-stock-census.mjs --ids=id1,id2 > <receipt.jsonl>` measures HIGH
and LOW native models and records a hash of the vehicle inputs. Without `--ids`,
it uses the handoff target list. Instance-expanded triangles and sampled shoe
sections describe the model; they do not measure GPU submissions, switching
latency, or the minimum structural thickness of every part of the complete shoe.

The September 11 run recorded all twenty duel videos, ten map rails, eleven
frontline clips and current UI footage. The forty-second master passed unchanged
motion and duration checks; both shortened masters encoded successfully. Fleet
selection covered 63 vehicles and 146 selection/revisit records without errors.
The stock census still found 46 of 63 LOW models reducing triangles by at most
ten percent. These receipts do not close that remaining optimization work or
the launch's performance limits.
