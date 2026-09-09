# Recovered seven-Abrams publication integration

Status: local integration and generated-data validation in progress. This is
the user's authorized as-is preservation checkpoint, not a completed fidelity
or performance release. See the [source recovery record](../tank-generation/recovery/abrams-seven-preservation-20260909.md)
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

The unrelated older MBT lifecycle continuation stopped at the existing
`loadingIntent` source-pattern test; neither it nor the historical interrupted
Abrams lifecycle is a full-suite PASS. See the
[MBT-70 qualification note](mbt70-upper-fender-sides-20260909.md).
