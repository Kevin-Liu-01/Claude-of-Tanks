# Construction-local loading work — 10 September 2026

Follow-up to [the frame-clock/audio release](frame-clock-and-shadow-warm-20260910.md).
This slice targets measured construction work. It does not identify the exact
cause of the historical 214–319 ms stalls or certify a zero-lag application.

## Evidence and attribution limits

The unprofiled live `v1.0.0+g8850e95c7` first-Battle action contained a 190.9 ms
callback-start gap during covered “Placing structures.” Only 76 ms overlaps
a recorded Long Task. The remaining 114.9 ms has no proven owner. Audio
construction had already completed before the Battle click.

A separate live, opt-in CPU-profile capture used the existing actual-control
probe with `--boot-audio-gate --audio-clock-gate --warm-readiness-gate
--source-readiness-gate --profile-actions`. It passed those functional gates.
Preserved output root: `/private/tmp/cot-interactive-baseline.gsRCvU/`.

| Profile receipt | SHA256 |
| --- | --- |
| `entry-audio-production-profile-r1/report.json` | `f52c8c7a1dd374d19953eec7d5cef6a3f3057b84a984e9e6dcb7a96a265bcc84` |
| `entry-audio-production-profile-r1/battle.cpuprofile` | `ff32b719247637fba1fede52f3961d7fc53a4ad02af9039bc9efad6b8e8c4f5b` |
| `entry-audio-production-profile-r1/battle-again.cpuprofile` | `e7a9089a1ea4c630d7dc51e42a024895eee432c03fbfd95286defe057e0670f1` |
| `entry-audio-production-profile-r1/return-to-garage.cpuprofile` | `c498267108460e0c6f54a106d43cb540d14a479dfca2ce4a59b29fb5bee4dcbb` |

Mapping was checked against the actual served `assets/map-DXy8Mxg3.js`, not a
different local source map. Across all call-tree occurrences, shared-vertex
welding (`oa`, column 56415) accounts for 166.095 ms of sampled self time;
component collection (`sa`, 56588) accounts for 162.621 ms. Their geometry-solid
owner (`la`, 57266) accounts for 484.014 ms inclusive, reached through runtime
structure collision derivation during street-row placement. These are cumulative
statistical samples, not one uninterrupted 484 ms call; inclusive and child
self times must not be added together.

The profile did not reproduce the 190.9 ms props gap. Its largest callback gap
was 96.8 ms during terrain work. Profile-start alignment has a 248.2 ms bracket,
so it cannot precisely assign a short callback gap to a sampled function. Its
timings are attribution-only, not a speed comparison. Independent props
receipts record an atomic ground-decal slice of 37.8 ms (38.3 ms in the earlier
unprofiled live action), without absolute slice timestamps.

## Implementation

- Cache referenced indexed-geometry vertices only for one `geometrySolids`
  call. Reuse decoded XYZ, the existing welded XYZ key and projected XZ key.
  Preserve every union operation, component insertion/overwrite, projected
  triangle and output order. Non-indexed geometry retains the original path.
  No cache survives geometry mutation or another extraction.
- Let the existing foreground loader yield between completed foundation,
  battle-scar and track-tear decal families. The two new checkpoints do not
  advance coarse progress. No formula, random draw, texture policy, geometry,
  collision precision, visual quality or frame-budget threshold changes.
- Suspension occurs only after a complete family transfers its meshes to the
  private props group; no partially assembled family buffers are suspended.
  Existing async cancellation closes the delegated iterator and aborts source
  acquisition before publishing a partial runtime.

## Deterministic verification

The vertex-cache regression executes the candidate against frozen pre-change
functions. It compares union history/roots, component Map writes/order,
projected triangles, final solids and public profiles. Fixtures include indexed
and non-indexed Float32/Float64, normalized/interleaved attributes, Uint32,
half-weld boundaries and signed zero, unused indices, repeated calls and input
or returned-output mutation. Actual onion-church, water-tower and megatower
builders retain identical solids and RNG usage.

| Fixture | Original XYZ + XZ key constructions | Cached constructions |
| --- | ---: | ---: |
| Repeated tetrahedra | 3,072 | 8 |
| Onion church (31 geometries) | 3,624 | 1,838 |
| Water tower (11 geometries) | 1,080 | 684 |
| Megatower (267 geometries) | 8,952 | 5,912 |

An optional warmed Node 24.13.0 ABBA extraction batch (eight repetitions,
1,016 solids) observed original/candidate/candidate/original means of
16.832/15.839/13.083/15.411 ms. This small same-process CPU observation is not
a native loading/frame-time gate or a guaranteed percentage speedup.

The cache assumes ordinary stable attributes during synchronous extraction.
There are no stateful attribute getters or concurrently mutated shared buffers
in the inspected world paths. All-unique indexed streams may pay cache overhead
without a serialization saving; no universal per-geometry speedup is claimed.

The decal test executes the actual complete function against a hash-pinned
synchronous reconstruction, comparing Three.js buffers, seeded RNG, material
policy, Canvas commands and churn alpha operations. It includes foundry
foundation reconforming and rejection at either new checkpoint. Canvas spies
are deterministic command evidence, not native raster/pixel qualification.

Eleven focused selftests pass, including all 111 structure families at two
variants (minimum certification 94.1/100), collision reuse/merge/raster gates,
props scheduling/materials/textures/resource ownership, world coordination and
the 954-entry registry. Typecheck/core-unused and the public build pass. This
is not a claim to have rerun the entire 954-check lifecycle.

Changed-scope React Doctor 0.9.13 reports a new test-only `no-eval` error for
the actual-function fixture and a serial-await warning. Its exit status is 1,
not a passing scanner gate. The evaluated text is local reviewed source with
the synchronous control hash-pinned, not user/network input; the fixture is
Node-only and never shipped to the client. Serial cancellation cases must
settle before disposing their geometry. These findings are retained rather
than suppressed or hidden by changing the regression's execution mechanism.

## Native local candidate

`structure-load-local-r1/report.json` SHA256:
`ad3071b9c3a57928329f8576db1124c32a3d62961457a16122962d6555a998c0`.
Public-build HTML SHA256:
`c08d8377c22ca68d3fb8f5f793f5cf3aa81e855c62160d4caca9729714e378d7`.
Acquisition SHA256:
`396f2f5601a637ee2c130b1796e816786b96fb3a6acf95fe1f679d46746f1499`.
Frozen `props.ts` / `structureCollision.ts` SHA256:
`61b7f8310803e9d1967aa64e97d53c9d7f29cf2c598dc59b64640e950119bc80` /
`7f8df7d5c18e30af669ec820f482ab3d51f256f02ffaba50adaa398043392a63`.

The unprofiled Urban actual-control run passes functional, trusted boot-audio,
audio-clock, warm and source-readiness checks. Error/failure/cleanup arrays are
empty. Day battle, night rematch and returned Garage screenshots were inspected;
no missing geometry, texture or obvious visual regression was observed.

| Action | Click → cover | Click → ready | Maximum frame-callback gap |
| --- | ---: | ---: | ---: |
| Battle | 2.3 ms | 6,183.9 ms | 116.5 ms |
| Battle Again | 133.4 ms | 5,499.8 ms | 64.6 ms |
| Garage | 90.3 ms | 324.1 ms | 47.0 ms |

Ground foundations are now the largest reported decal family at 22.2 ms;
the other two families fall below the eight-slowest-slice cutoff (12.1 ms).
The earlier local boot fixture recorded a combined 36.2 ms ground-decals
task. Props synchronous work is observed at 1,612.5 ms versus 1,717.5 ms in
that prior fixture. These are individual observations, not a repeatable
percentage speedup or a matched-roster total-loading comparison.

The remaining 38.4 ms street-details slice is unchanged. The worst diagnostic
callback-start gap is 116.6 ms during the transition from “Loading battlefield”
to “Building terrain meshes”; 50 ms overlaps a Long Task and 66.6 ms remains
unattributed. No claim that collision/decal changes solve this different phase.
The action includes covered loading/countdown and is not a steady-state FPS
measurement. Historical stalls and universal frame-budget guarantees remain
open, as in the preceding release record.
