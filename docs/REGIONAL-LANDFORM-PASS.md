# Regional landforms: playable ground and outland

The September 10 request extends the environment pass to playable hills, not
just distant mountains. Location and land use must shape geometry, vegetation,
rock exposure, roads and settlements together. A different palette over the
same symmetric ridges and elliptical knolls is not enough.

## Visual references, not a geology simulator

- Countryside: broad interfluves, unequal shoulders, tributary hollows and open
  saddles. Frontier is authored as temperate farming/training country; it must
  not inherit an alpine wall. Preserve the separately accepted Verdant horizon.
- Alpine: connected ridges and asymmetric trough sides around the frozen lake,
  with descending spurs rather than freestanding round humps. Yosemite shows
  how an asymmetric uplifted range is reshaped into broad glacial valleys,
  steep walls, hanging tributaries, domes and sharp exposed peaks.
  [NPS Yosemite geology](https://www.nps.gov/yose/learn/nature/geology.htm)
- Titan Gorge: irregular plateau remnants with alternating cliffs and softer
  benches, side drains and talus shoulders. Grand Canyon's resistant strata
  form cliffs while softer beds weather into slopes; drainage connects those
  forms across the landscape.
  [NPS Grand Canyon formations](https://www.nps.gov/grca/learn/nature/geologicformations.htm)
- Fold/fault/volcanic/dome/erosional terminology informs regional structure; it
  is not a set of mutually exclusive mesh presets. Folded belts have related
  long axes, tilted blocks have unequal flanks, and volcanoes range from broad
  shields to steeper composite forms. Rounded forms can be natural, but every
  map must not repeat the same symmetric mound.
  [NPS tectonic landforms](https://home.nps.gov/subjects/geology/tectonic-landforms.htm),
  [USGS volcano types](https://pubs.usgs.gov/gip/volc/types.html)

## First playable-ground scope

Frontier and Alpine are the two playable-ground pilots. The remaining 28 maps,
including Titan Gorge, retain their previous height arithmetic until their own regional changes are
reviewed. This is the start of the requested pass, not all-map completion.

Replace existing authored relief evaluations with bounded, asymmetric,
connected forms. Do not add another blanket noise octave, retained height grid,
mesh density, texture set, live erosion simulation or random-stream draw.
Resolve axes/constants during construction; do not allocate in height queries.

Legacy road elevations, water levels and spawn support targets must be frozen
before new relief activates. New relief still passes through the existing
road, water, settlement and pad conditioning. Objective placement is a separate
owner: validate the full footprints and access routes rather than assume spawn
conditioning protects every game mode. Final visual geometry, height queries,
fast grids and server collision data must describe the same ground.

Titan's pilot is held: all Titan source authoring is restored byte-for-byte to
the unchanged parent, with explicit source and multi-seed height-parity tests.
Its first terraced-basin draft failed Turbo Ball bidirectional access; both the
widened-bench revision and legacy-basin/five-shoulder revision exceeded the
existing Zone Control construction-read limits. The three failed packets and
attribution probe remain external evidence (`playable-relief-checks-r1.70Mwvg`,
`playable-relief-checks-r2.kiUeHZ`, `playable-relief-checks-r3.4oWZTO` and
`playable-relief-route-diagnostic-r1.HSK845`). No placement or cost gate is
relaxed. Titan's plateau design remains a future goal, not a shipped change.

## Acceptance

Use matched cameras for shape, near-ground seams and motion. Check day/night,
roads and banks, prop seating, every affected spawn/objective, collision and
minimap outputs. Compare actual CPU/frame/resource costs against the unchanged
parent; unchanged texture/vertex counts alone do not prove performance parity.
Regenerate only affected collision records after the geometry is accepted.
Never replace failed evidence with an edited report or publish rejected art.

## September 10 playable-ground checkpoint

Frontier's five tactical forms now follow unequal, bent interfluves with side
branches; Alpine's five forms have unequal trough walls and oblique saddles.
The original signed height budgets remain. No new terrain grid, texture,
geometry density or per-frame callback was added. The existing fast height
cache samples the same new surface used by analytical collision queries.

- `playable-relief-checks-r4.92V2mp`: focused shape/support parity, full placement,
  TypeScript and direct public Vite/strip passed. Two seeds verify the other
  28 maps' sampled heights/normals and all road/water/pad support arrays unchanged.
- `playable-relief-narrow-checks-r1.ihEcTN`: strict helper complexity/types,
  fast-height-grid and terrain LOD tests passed.
- Four actual daytime native 1440×900 views were inspected in
  `playable-relief-native-r1.QAGtd5`. No obvious new cracks or floating props in
  these poses. That packet failed afterward because the collision subprocess
  used different browser launch options and replaced its context; the failure
  is retained, not labeled a complete acquisition.
- `playable-relief-collision-r1.8y4kRZ`: the maintained canonical exporter with
  identical launch options completed the two collision shards and index.
  Only justified changed placement counts were refreshed in the server test.
- `playable-relief-final-collision-checks-r1.J9F5T1`: codec, loader, dedicated
  collision, full placement, relief and signaling tests passed. All 30 maps ×
  five modes, 2,100 spawns and 480 bidirectional route checks pass using the
  final shards. Construction reads peak at 45,203/23,342/3,965 against unchanged
  limits 65,536/32,768/6,000. The other 28 shard bytes/index entries are unchanged.
- The maintained tools regenerated only the two north-up minimaps, native
  3840×2160 heroes and 512×288 picker images. Only these minimap cache URLs change.

This accepts an incremental playable-ground change, not the entire environment
pass. Alpine's very dark roads, the old smooth distant mountains and repetitive
tree/rock art remain visible issues outside this checkpoint. There is no new
physical iPad/nighttime qualification or global FPS/heap certification. The
separate experimental Frontier woodland/material branch is not part of this
checkpoint. The standard npm build localization prehook cannot run without
the unavailable `gt` CLI; direct public Vite plus asset stripping is reported
separately and does not waive that hook.
