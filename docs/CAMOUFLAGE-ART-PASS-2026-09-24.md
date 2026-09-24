# Selectable camouflage art pass — 2026-09-24

The older selectable finishes used sparse blob stamps, round-ended brush strokes,
or repeated small symbols. The new catalog artist builds connected colour fields,
interlocking masked facets, broken animal rosettes, swept flame silhouettes and
more deliberately spaced graphic motifs. It retains existing selection IDs,
biome bonuses, network validation and the two-metre world projection.

`src/vehicles/catalogCamoPainter.ts` owns the 44 updated finishes. The optional
`MaterialVisual.catalogPattern` chooses this art only for catalog selections;
vehicle-authored, service, national, brand, Mono, Carbon and Prism recipes keep
their existing painter. Picker swatches forward the same art identity and stream
as the hull. Shared synchronous, cooperative and worker texture paths all call
the same artist. The historical scheme remains available to material policy.

## Changes

- Summer, Desert, Winter, Tropic, MERDC, Autumn and related field patterns use
  overlapping periodic stencils with balanced colour coverage and smaller
  subordinate features. DPM no longer consists of rounded marker strokes.
- Splinter and M90 use shared polygon vertices to form connected angular fields.
  Urban and Berlin layouts use larger architectural blocks. Desert Pink uses a
  dustier rose/stone palette with broad interrupted slate bands.
- Hot Rod uses layered flame silhouettes. Leopard Print uses broken dark
  rosettes with warm centres. The other novelty paints use deliberate motif
  spacing, circuitry lanes, racing stripes/checkers and radial paint splashes.
- Reduced overlaid dirt streaks on the updated catalog art. Existing height,
  normal, roughness, material-role and shadow pipelines remain in use.

## Verification

- All 44 IDs: distinct opaque deterministic output, hull-independent pattern
  recipes, exact picker identity; periodic field seam checks.
- Six representative field/geometric/graphic paints: identical synchronous and
  worker albedo, normal and roughness maps.
- Twelve representative authored, national and branded finishes: recipes and
  native rendered pixels byte-identical to the pre-pass implementation.
- Existing camouflage policy, authored catalog, factory, brand, custom-canvas,
  world-scale, seed, worker lifecycle and swatch-access tests passed.
- Type checking and public production build passed. New painter: no explicit
  `any`/`unknown` or complexity violations under the repository's metrics gate.
- Real Garage before/after captures on M1A3 and the legacy `m1a2_sepv3` hull:
  twelve paints selected through the normal picker on each, no browser errors.
  Stable Garage drawing counts matched (377 on M1A3, 388 on the legacy hull).
  Bare M1A3 armour was reviewed in addition to the legacy hull's physical netting.

## Performance

The artist runs only during a cached texture bake or repaint. It adds no GPU
textures, material passes, meshes or per-frame work. The periodic field has a
bounded CPU scratch canvas (at most 192² pixels), reused across recipes. Digital
art uses an 80² field. Histogram thresholds avoid sorting full-resolution images.

Isolated native-canvas timing, three measured passes after one warmup, median
milliseconds for the albedo painter at 2048² (not a browser FPS measurement):

| Finish | Previous | Updated |
| --- | ---: | ---: |
| Summer | 3.82 | 9.04 |
| Desert | 4.51 | 7.57 |
| Winter | 150.02 | 9.94 |
| MERDC | 3.93 | 9.52 |
| Splinter | 5.57 | 7.26 |
| Tropic | 6.04 | 10.34 |
| Autumn | 4.48 | 10.24 |
| Desert Pink | 3.20 | 2.92 |
| DPM | 3.56 | 9.40 |
| Hot Rod | 4.84 | 3.54 |
| Leopard Print | 6.48 | 9.59 |
| Flecktarn | 153.60 | 12.06 |

Some cold paints cost several milliseconds more; the expensive winter and fleck
passes cost substantially less. Existing worker preparation, texture residency,
picker frame budgeting and cached-return behaviour remain intact.

Local review evidence is in `.qa-dev/camo/`: baseline and revised tile sheets,
`before-m1a3-garage/`, `after-m1a3-garage/`, `garage-comparison.png`,
`benchmark.json`, and verification/build logs. These local screenshots are not
published assets or a deployment receipt.
