# Marked underbody backdrops — September 30

The owner supplied Gallery surface selections and requested removal of the solid
wheel-bay backdrops and inner-track filler blocks. This is a removal of auxiliary
opaque stock, not a wheel, track, primary hull or turret redesign.

| Displayed vehicle | Stable ID | Removed source stock |
| --- | --- | --- |
| Chieftain Mk 9 | `chieftain_mk10` | Paired `hullShadow` walls at inner X ±0.98; regenerated the selected `hullInteriorFill` slab at X −0.9555 away from the open bay. |
| Chieftain Mk 3 | `chieftain5` | Segmented right inner-track filler blocks (X 0.89 faces) and the left wall (X −1.095 face). |
| Jagdpanzer E100 | `jpz_e100_x` | Both interleaved-wheel shadow walls (inner X ±0.9768). The opt-out retains all wheel layers. |
| K2B | `k2b` | Center and raked front/rear wheel-bay backdrops, on both sides. |
| XK2 Black Panther | `k2` | Same donor backdrops as K2B; the current K2 (`k2_x`) is unchanged. |
| Stridsvagn 103B | `strv103` | Paired long walls (inner X ±1.01). |
| Stridsvagn 103A | `strv103a` | Paired long walls (inner X ±0.99). |
| UDES 03 | `udes03` | Paired long walls (inner X ±0.7975). |

Selections came from September 30 Gallery exports, 22:45–22:51 UTC. Stable mesh
names and local positions identify the source components; transient UUIDs and
merged face indices are not runtime selectors. Complete unwanted components
are removed in their builders instead of deleting faces from closed primitives.
Actual rendered shadows, suspension, wheels, tread courses and armor remain.

## Verification

- `underbodyBackdrops.selftest.mjs`: PASS for all eight IDs, HIGH/LOW, with
  generated interior fills loaded. Rays through each marked region check both
  sides and also reject generated fill replacing a removed backdrop.
- Exact before/after geometry and transform snapshots: PASS for real running
  gear, primary hulls, turrets and guns at both detail levels.
- Existing Chieftain family fidelity regression and Jagdpanzer E100 X physical
  regression: PASS.
- Typecheck: PASS.
- Centering refreshed for all eight IDs; 80 affected presentation/technical
  assets regenerated successfully.
- Full-fleet anatomy and marking-seat receipt freshness: PASS (205 IDs).
  Full-fleet module hit probes: PASS (1,789 modules, 410 track sides; existing
  dimension-drift warnings are retained in the log).
- `npm run tank:anatomy:check` reached the asset check, which reports 49 stale
  or missing presentation values on other September 30 batch IDs. None of
  those failures is on one of the eight removal IDs; the full command is
  recorded as FAIL rather than silently waived.
- Visual review: PASS for normal garage and raised underside views of all
  eight vehicles, 1280-pixel captures of `v1.0.0+g0857fff5c.dirty` on
  September 30. The marked inner walls/blocks are absent and the real running
  gear remains visible. Per-ID images and build/pose receipts are in
  `.qa-dev/underbody-removal-20260930/`.
- Interior fills regenerated only for the eight selected records with the
  normal generator settings. Residual voxel volumes are retained in the log;
  this is not a claim of zero leakage or a complete release pass.

- Targeted asset freshness: PASS, all eight IDs / 80 files / nine view types
  (`--skip-bore`; barrel geometry is unchanged in the before/after snapshots).
- Sealed-hull audit: PASS against the existing ledger, with zero failing open
  views of 33 for each ID. This retains the raw pixel and winding diagnostics;
  it does not relabel every raw diagnostic as zero.
- Production build: PASS.
- Requested removal fingerprints updated for the two Chieftains and the
  Jagdpanzer at the applicable detail levels. The broader second-wave tests
  still fail on the earlier batch's `strv122` geometry checksum and combined
  donor-spec checksum; those unrelated expected values were not overwritten.

## Reference qualification

The initial release attempt reported four missing comparison files. Exact local
copies were restored for the two Strv targets and Jagdpanzer. The registered
Chieftain comparison was recovered from
`952561ea7a70ab643a4ba390f1323b7ad0059b70^` at its original path. The files remain
ignored local authoring inputs; no external geometry is added to the runtime.
Their paths and SHA-256 values are saved in `restored-references.json` beside
the logs. Fresh results after restoring all four files:

| ID | Geometry minimum / floor | Visual fidelity / floor | Result |
| --- | --- | --- | --- |
| `chieftain5` | 0 / 90 | 30.8 / 90 | FAIL |
| `jpz_e100_x` | 93 / 92 | 98.7 / 92 | PASS |
| `strv103` | 72.9 / 90 | 85.3 / 90 | FAIL |
| `strv103a` | 22.4 / 90 | 89.2 / 90 | FAIL |

These are the harness's current whole-model results, not a measurement of the
isolated removal delta. In particular, the Chieftain's zero score is retained
as failed comparison evidence rather than used to justify an unrelated redesign.
The other four IDs have no registered 3D comparison in the geometry gate; the
release fidelity step also rejects three of those unreferenced entries. No
reference or release exception was added.

## Current status

Implementation is local and unpublished. Required anatomy and release commands
were run and their failed stages remain explicitly recorded. Asset refresh,
focused physical checks, visual review and production build are complete. Logs, snapshots and actual garage captures are
under `.qa-dev/underbody-removal-20260930/` in the isolated authoring worktree.
The capture recipe retains the normal garage view, then raises the same live
model for an unobstructed underside diagnostic; that diagnostic is not a
normal gameplay pose. Earlier captures obscured by garage geometry are not
qualification evidence.

## Publication follow-up

The owner subsequently requested the complete thread batch on `origin/main`.
See `fleet-renewal-publication-20260930.md` for checklist accounting and the
retained qualification limitations. This supersedes the earlier local-only
status above; it does not change failed reference scores into passes.
