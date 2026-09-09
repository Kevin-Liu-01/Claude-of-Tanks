# Map rendering foundations — verification checkpoint

Status: **committed locally, not pushed; performance acceptance remains open.**
This is two rendering corrections, not completion of the whole beautification.
The reference study and 30-map plan were pushed in `9b65f4bfa`.

## Isolated candidate

Base: `9b65f4bfa49c62812782362c24d0a1565091f2de` (current main at capture).
Candidate: `28d5fd378f1ca89acf80ba274599d9d58e6b2639` in
`/Users/kevinliu/.codex/worktrees/cot-map-beautification-publish-20260908`.

- `7fea2585b`: coherent deformation of shared tree-canopy corners. Same
  attributes, vertex/index counts and subsequent random state. Fixes far
  oak/pine/palm/birch crowns and the one shared near-palm core.
- `28d5fd378`: world-fixed meadow UV chart and correctly counter-rotated
  normal samples. Same material masks, activation/LOD weights and sample count.
  This does not claim camera-independent final lighting or a general vertical
  rock projection fix.

The isolated candidate contains no R12/R13/R14 horizon ancestry or experimental
Verdant watersheds. Study-branch equivalents are `c88615e69` and `97f8a0382`.

## Completed verification

- Production public builds pass on both roots: 18 localized routes, 174
  procedural playable vehicles, zero GLB-sourced playables.
- TypeScript 7.0.2 no-emit and core-unused policy pass. The reused dependency
  cache lacks main's new `@typescript/native` alias; validation selected the
  same installed 7.0.2 package via `node_modules/typescript/bin/tsc`. The
  core-unused checker policy was unchanged; no dependency files were edited.
- 225 real joined-corner primitive cases, 32 complete far-tree builders and
  three bounded near-palm cases pass. Historical tear fixtures still fail.
- Canopy lighting, program keys, all-30-map vegetation resource lifetime,
  terrain surface detail and 72-bearing road-mask tests pass.
- Terrain projection test passes 300 camera/signed-slope cases, independent
  analytic normal-frame checks and retired-bug/wrong-frame/mask/sample mutations.
  It also runs from a two-file export without Git history or dependencies.
- Native Chrome / ANGLE Metal Apple M5 Max: Verdant, Coastal and Winter,
  1440×900, desktop high, real sourced textures; no console/page errors or
  lost contexts. Twenty-six saved camera receipts are exactly equal.
- Whole-scene instance, triangle, geometry, material and texture counts are
  exactly equal before/after on all three maps. These are scene/resource
  counts, not a blanket heap or construction-time certificate.

The reviewed images preserve the compositions. Near foliage is mostly
unchanged; the fixes are not a dramatic whole-scene transformation. Current
Verdant mountain enclosure, Coastal inland sand marbling, Winter black road
ribbons, grass color and settlement organization still need art work. The
static images do not certify slow-pan stability or physical iPad Safari.

## Timing result — do not waive

The independent timing-only pair uses the same committed acquisition harness,
fixed roster/camera/quality and three 75-frame samples per map. Screenshot
timings are deliberately not treated as a performance baseline.

| Map | Frame median before → after | CPU render median before → after | CPU render p95 before → after | Gate |
|---|---|---|---|---|
| Verdant | 22.1 → 13.2 ms | 4.4 → 10.3 ms | 4.8 → 11.9 ms | **Fail** |
| Coastal | 21.1 → 21.0 ms | 3.3 → 3.3 ms | 3.5 → 3.6 ms | Pass |
| Winter | 21.5 → 21.5 ms | 4.1 → 3.9 ms | 4.4 → 4.2 ms | Pass |

Verdant frame p95 also increased, 23.2 → 29.1 ms. Faster frame median does not
cancel its failed CPU render gate. There is a similar fast-cadence/high-render
mode in one baseline Winter run; that suggests acquisition/driver scheduling
may contribute, but does **not** prove the candidate innocent. All submitted
draw/triangle maxima remain equal. Keep both fixes off main until a bounded
isolation/control comparison explains the result. Do not repeatedly sample
until one passes, discard the failure, or change thresholds.

Next diagnostic: isolate canopy-only versus the shared base and distinguish
native asynchronous CPU submission from serialized whole-frame GPU throughput
with a separately labeled matched control. Preserve the existing failed pair.
No full-fleet performance/memory or construction-time acceptance is implied.

## Preserved evidence

All output directories below are under
`/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`:

- `map-render-foundations-before-r1/report.json` and `shots/`
- `map-render-foundations-after-r1/report.json` and `shots/`
- `map-render-foundations-timing-before-r1/report.json`
- `map-render-foundations-timing-after-r1/report.json` (failed Verdant gate)

Capture processes, browsers and preview servers completed and closed. No
shared lock was bypassed or removed. Builds/roots remain preserved for exact
follow-up. None of these receipts certifies the unpublished horizon drafts.
