# Recovered seven-Abrams publication integration

Status: **published to origin/main at `92b328a83d4dca5cb9d155ca8ad69d37b5203bf4`**.
This is the user's authorized as-is preservation checkpoint; the final check
driver finished with the complete anatomy procedure passing and the targeted
release failing at reference availability. This is not a completed fidelity or
performance release; no new source-comparison score was measured.
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

Presentation, anatomy and selected assets were regenerated using the maintained
tools, and the complete anatomy check and targeted release were subsequently
attempted. Historical failed source/visual checks and six unavailable independent
variant oracles remain explicit; publication was not a qualification waiver.

Generation is now complete: 181 marking receipts (no further byte changes),
208 catalog technical-image sets / 624 outputs, then all ten required files
for each of the seven new tanks and three framing-affected existing tanks.
The final 100 selected files pass offline size/SHA-256 verification; exactly
ten manifest rows differ and 95 asset paths changed or were added. Unselected
manifest rows remain byte-equivalent as parsed records. All seven angle
portraits were visually inspected for complete rendering and variant presence;
this limited inspection is not a new 9/10 source-fidelity acceptance score.
The final anatomy/release outcome is recorded below, separately from the
publication result. Remote `refs/heads/main` was explicitly resolved to the
full hash above
after the non-force push; the publication tree was clean.

The unrelated older MBT lifecycle continuation stopped at the existing
`loadingIntent` source-pattern test; neither it nor the historical interrupted
Abrams lifecycle is a full-suite PASS. See the
[MBT-70 qualification note](mbt70-upper-fender-sides-20260909.md).

## Final qualification receipt

The existing driver completed without a replacement run or input changes.
Its terminal result was observed at **2026-09-09 19:26:05 UTC** in
`cot-tank-recovery-publication-20260909`, with the source/assets published
through `92b328a83` and documentation HEAD `7351f0b4a`. The complete log is
`.qa-dev/abrams-recovered-final-checks.log`, SHA-256
`f7e58e947b01f20d76e8c75d410c607f12f3049baa93727dd683a201c6bc49fe`.
It ends with `ANATOMY_CHECK PASS` and, after the targeted release attempt,
`RELEASE_CHECK_FAIL 1`.

The complete anatomy procedure passed all five phases: combat-anatomy receipt
freshness (181 tanks), marking-seat freshness (181), `combatAnatomy.selftest`
(181 tanks / 4,153 closed collision cells), the full module-hit probe
(1,552 modules / 362 track sides, zero failed or outside-envelope cases), and
the three technical-view asset check (181 tanks / 543 files). The technical-only
asset phase explicitly used `--skip-bore`; the later seven-ID checks below did
verify bores. The full module-hit probe retained 83 dimension-drift warnings.

| Targeted seven-ID release phase | Actual outcome |
| --- | --- |
| Combat-anatomy receipt freshness | PASS, all 181 playable receipts current. |
| Presentation centering | PASS, maximum rendered residual 0.00 px; exported top residual 0.14 px. |
| Visual/module alignment | PASS, seven scanned and zero failing calibrated receipts. |
| Module-hit probe | PASS, 56 modules / 14 track sides; zero failures, four dimension-drift warnings. |
| Complete tank assets | PASS, 70 files / nine named views plus thumbnails; metadata, geometry and bores verified. |
| Track duplication | PASS, seven integrated animated shoe layers; no overlapping extra courses or static full-length proxies. |
| Dedicated muzzle probe | PASS, seven muzzle classes; each reports `authored:0`, `fallback:1`, not source-authored bore classification. |
| Barrel circularity | PASS, seven measured barrels, ratio 1.034 and lateral error 0.0 mm; no fixed-mount skips. |
| Strict source comparison | FAIL, exit 1: seven unavailable references, zero measured references. |
| Tank-standard / geometry composition | UNRUN: the release stopped at the preceding source phase. |
| Full `npm test` | UNRUN in this release attempt. Earlier focused passes are not a full-suite pass. |
| `npm run build:private` | UNRUN in this release attempt. The prior public-build pass remains separate evidence. |

The four selected dimension warnings concern `m1a2_x`, `m1a2_tusk_x`,
`m1a2_sepv2_x` and `m1a2_sepv3_x`. They were not suppressed or converted into
source-accuracy passes. The six derived variants still have no independent
local GLB registration. SEP v2 has a registered reference, but
`public/models/community-candidates/m1a2_sepv2_dc_source.glb` was absent from
this publication worktree during the run. Its 22,848,792-byte preserved file
still exists at the same relative path in `cot-abrams-source-x-20260907`;
this availability failure is not evidence that its source was lost. No
reference was provisioned and no comparison was rerun during this closeout.
The tool's `median 0.0` accompanies zero measured references and must not be
reported as a measured zero fidelity score. Historical source/visual/lifecycle
failures remain unchanged. Only this receipt and its inventory status are
published by the closeout; runtime, generated assets and transient reports
are not included in that documentation commit.

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
