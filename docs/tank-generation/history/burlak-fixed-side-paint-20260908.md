# Burlak fixed side-panel camouflage checkpoint — 2026-09-08

Status: **candidate; full composed release incomplete**. This is a narrow
material correction within the owner's all-new/X-tank work, not a claim that
Burlak or the broader fleet has finished running-gear/style qualification.

## Change

Eight `burlak-x-fixed-skirt` sheets emitted through `addMudguard` used the
untextured `hullRubber` bucket. These fixed painted panels now use the
side-specific `hullTrackGuardL/R` armor-paint buckets and spatial camouflage
UVs. Dimensions, positions, rig-hull ownership, always-present LOD, articulated
poses and `nonArmor` collision role remain unchanged. Flexible rubber,
mechanisms and accessory materials are not blanket-repainted.

The regression observes all 1,236 raw emissions across HIGH/LOW factory/winter
builds, preserves complete oriented stock and every independent mesh, and
fires 96 actual panel rays through three poses after all ERA is spent. All
eight panels retain their paint map and physical presence. Decoration
admission and the 2,942 decoration triangles remain exact in both qualities.
Its Canvas fixture supports Node construction only; it provides no pixel
proof. Missing paint and incorrect armor-role negative controls fail.

The existing Soviet auxiliary-armor test's historic geometry hashes include
merged material buckets and UVs. A test-only inverse restores exactly these
eight declared buckets to authenticate the unchanged literal original
HIGH/LOW hashes; it does not refresh them. All current physical, gap, facet
and ballistic checks use the real painted model and include the two newly
painted side buckets. All nine Soviet models pass that unchanged physical
suite (1,214 facets across HIGH/LOW).

## Native visual evidence and assets

The native browser capture reviewed 32 exact-ID images / 16 pairs: factory
and winter, HIGH and LOW, four views of Burlak plus original M1A2 control.
Every camera pair requires the requested actual tank root; there is no source
model fallback. The local receipt is
`.qa-dev/burlak-side-finish-main-valid-20260908/tank-assets.json`, with frozen
source SHA `86fa5c51eb3baa4b11de5608651b608d5c402c279f262d5db7734564b30cdf5f`.
The side panels now carry the body camouflage rather than appearing as plain
rubber sheets. Six Burlak asset images and its single asset-registry row were
regenerated; four other target views remained byte-identical. No unrelated
fleet icon regeneration is included.

## Release evidence and retained failures

Full combat-anatomy update and full check passed in
`.qa-dev/burlak-release-8D2gCY/`: 174 receipts across 56 groups, 1,496 modules,
348 tracks and 522 current technical diagrams. Geometry/anatomy outputs
remained byte-identical. That first composed release stopped at a browser
registry-ready timeout before the source-fidelity phase could complete.

A QA-only ignored source symlink was verified against the original oracle
SHA `db1ca6b229f9925474dfda35727d76895e9a3b825af2c3b3a326cf2a6e7d0b52`.
It is neither tracked nor a playable asset/loading path. The subsequent full
target run passed source fidelity **96.6**, geometry gate **94.9**, tank
standard, anatomy freshness, module alignment/hits, all ten assets, track
uniqueness and muzzle/roundness checks. Its first npm lifecycle attempt
correctly exposed the historic bucket-hash mismatch; the exact inverse above
repairs that expectation without weakening its physical tests.

The next full composed run, `.qa-dev/burlak-release-RYm4B8/receipt.json`, kept
all nine scoped inputs unchanged and passed those phases and the repaired
Soviet suite. It then timed out at the existing 240-second
`fleetLazy.selftest.mjs` full-fleet construction sweep. Receipt finished
2026-09-08 18:31:43 UTC with **FAIL**. This is not a completed npm lifecycle
or private-build/release pass. The small earlier source-dimension warning
(nominal width/length versus the supplied model) remains documented; no
source ruler or gate threshold changed.

Publication requires resolving/reproducing that integration failure against
current main and completing the composed release. These local receipts are
not combined into a fabricated green release, and do not supersede any of
the broader 59-ID material, running-gear or switch-lag work.

A later native failure in `.qa-dev/burlak-release-bWZIfd/` was traced to the
public HTML fallback serving the 404 document for existing Gallery/audit
HTML URLs. This routing defect was repaired independently in `90e8b9fd3`
and published with integrated evidence in `41f7eaff8`. It was not a geometry
failure or permission to bypass native checks. The subsequent combined
seven-ID bodywork run rendered all 84 requested native views successfully;
its remaining release qualification is tracked in
`fixed-stock-paint-qualified-20260908.md`.
