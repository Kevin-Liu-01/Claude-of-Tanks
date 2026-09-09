# Recovered seven-Abrams publication integration

Status: **published to origin/main at `92b328a83d4dca5cb9d155ca8ad69d37b5203bf4`**.
This is the user's authorized as-is preservation checkpoint; the strict checks
are still in progress, not a completed fidelity or performance release.
See the [source recovery record](../tank-generation/recovery/abrams-seven-preservation-20260909.md)
and [whole-task inventory](tank-work-recovery-inventory-20260909.md).

## Exact integration

- Scoped source checkpoint: `194afae702ad00372c246b8842902fdfe4ab18a3`,
  116 selected files. Its original/integrated provenance and known failures
  remain recorded in the source manifest and historical archive.
- Applied as `aecf3439c516ee4e01f43d8f3d83053555f06a8b` after published main
  `4ba49da7515dec4a844d9111ba579d2aad53b87a`.
- The automatic merges retain the already-published `gunMountCanvasSkin`
  material bucket/LOD ownership and all MBT-70/canvas/smoke test registrations.
  The immutable source-port manifest describes its own source checkpoint;
  subsequent composed core/registry and generated-data hashes must not be
  represented as identical to that earlier private tree.
- Runtime IDs: `m1a1_x`, `m1a1ha_x`, `m1a2_x`, `m1a2_tusk_x`,
  `m1a2_sepv2_x`, `m1a2_sepv3_x`, `ua_m1a1_x`.
- Existing Abrams, AbramsX and M1A3 are not replaced. Raw supplied models,
  temporary QA, old full-fleet manifests and unrelated inactive gear pilots
  are excluded.

## Current checks and remaining boundary

The source owner passed fourteen actual HIGH/LOW lazy constructions, authored
physical tests, the opt-in core's default-motion controls, armor edge/default
regressions, movement/combat/spotting, metadata/registration tests, final
type checking and the public build (181 playable procedural IDs, zero runtime
GLB entries). Its proof-only follow-up `fd6557bd1` is applied as `a7eaac32f`.

The full presentation update produced 208 catalog records, including the seven
new IDs. Existing A7V X framing changed by 1.8 mm and M1A3/MBT-70 by 0.5 mm;
only their generated presentation/asset records are refreshed, not their
authored geometry. The complete anatomy update measured 181 playable tanks
across 57 demand groups; only the Abrams anatomy group changed. The generation
log is `.qa-dev/abrams-recovered-generation.log` in the publication worktree.

The publication owner must regenerate presentation anchors, run the complete
anatomy update/check, capture the seven current asset sets, and attempt the
targeted release command. No queued phase is recorded as passed. Historical
failed source/visual checks and six unavailable independent variant oracles
remain explicit, even if the preservation checkpoint is published.

Generation is now complete: 181 marking receipts (no further byte changes),
208 catalog technical-image sets / 624 outputs, then all ten required files
for each of the seven new tanks and three framing-affected existing tanks.
The final 100 selected files pass offline size/SHA-256 verification; exactly
ten manifest rows differ and 95 asset paths changed or were added. Unselected
manifest rows remain byte-equivalent as parsed records. All seven angle
portraits were visually inspected for complete rendering and variant presence;
this limited inspection is not a new 9/10 source-fidelity acceptance score.
The complete anatomy/release checks remain separately logged while running.
The fresh 181-row anatomy check has passed; the marking check and subsequent
checks are still pending. The published checkpoint is not presented as their
result. Remote `refs/heads/main` was explicitly resolved to the full hash above
after the non-force push; the publication tree was clean.

The unrelated older MBT lifecycle continuation stopped at the existing
`loadingIntent` source-pattern test; neither it nor the historical interrupted
Abrams lifecycle is a full-suite PASS. See the
[MBT-70 qualification note](mbt70-upper-fender-sides-20260909.md).

## Newly exposed performance debt

Fresh current-schema generation, not copying an archived manifest, exposes a
large armor-plate payload in the recovered specs: A1/HA/Ukrainian A1 each have
2,258 plates, A2 has 2,421, TUSK 2,966, SEP v2 5,216 and SEP v3 2,378.
These are gameplay plate records, not rendered triangle counts. The seven new
rows grow the pretty-printed icon manifest from 14,530,247 to 28,442,182 bytes.
The row comparison found only seven new IDs and the three documented
framing refreshes, not unrelated fleet data replacement. The large diff is
therefore real recovered payload and an additional open performance issue;
it must not be called an optimization or hidden by stripping collision data
from the generator's receipts. Profiling/coalescing the authored finite plates
and measuring switching/ballistics cost remain unfinished work.
This is not a measured diagnosis of the reported switching lag. Current
`src/` references the JSON manifest only from its self-test, not a runtime
fetch path; the authored spec/plate construction and trace costs need separate
profiling before attributing a frame-time regression to them.
