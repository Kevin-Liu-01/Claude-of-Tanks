# Harvest and Delta crop identity

Runtime checkpoint: `3bfd72f9080cb3f0215ae8440edd040e163bf121`, the exact
five-file `4c9a1911f` change integrated on the accepted Mangrove/reed release.
Only Autumn and Delta opt in. The other 28 maps keep the original crop painter.

Autumn uses short broken golden stubble with occasional standing heads. Delta
uses narrower green stems, attached leaves and branching heads in its existing
dry wetland-edge plots. This does not add flooded paddies or reauthor fields.
The two forms remove the old four rectangular alpha cutouts. All nine random
draws per candidate stalk remain in their original order, including skipped
stalks, so field placement does not shift.

## Reviewed appearance

Root and an independent reviewer viewed all eight original native A/B images:
Autumn and Delta, close and establishing, at identical saved camera poses.

- Autumn loses the stark pale card ranks. Stubble blends beneath the existing
  grass; plot identity is faint in the establishing view. Coarse grass and
  field composition remain unfinished.
- Delta is thinner, greener and more open. Regular dotted rows remain visible
  at distance, but are less fence-like than the original opaque wheat pegs.
- No new seam, halo or grounding defect was apparent in these matched pairs.

This is an accepted incremental identity change, not completion of farm,
shoreline, tree or whole-map beautification.

## Evidence and limits

Evidence root: `/Users/kevinliu/.codex/visualizations/2026/environment-recovery-20260907/`.

- `crop-biome-cpu-r4.4Qtevy`: all 40 raster cases, existing crop lighting,
  placement, TS7 and scoped Doctor checks pass. The 40 cases are 28 config
  selections of the legacy painter plus six seeds for each new form; they
  are not 40 native map renders. Production crop seed 2517 is included.
  Earlier failed parser/density candidates remain in R1/R2/R3 receipts.
- Changed/new functions pass the strict complexity gate. The whole-file gate
  still reports two byte-identical inherited functions (`addWallRun` and
  `createPropsAsync`); this is not a clean full-file quality claim.
- `crop-biome-native-r1.i6x9FX`: clean baseline `3cdbf6149` versus clean
  candidate `4c9a1911f`, actual production crop ownership, Apple M5 Max/Metal
  Chrome, High, 1440×900, DPR 1, trim 0, scale 1, fixed wind time. All four
  comparisons retain exact row geometry, material, texture storage/settings,
  camera and quality. Both browsers/previews closed and the FIFO released;
  no observed page, GL, program or context errors. Acquisition took 90.442 s.
- Native alpha-covered texels at 256/64/16 px are 29,379/1,977/137 originally,
  13,058/701/40 for Autumn and 19,810/893/69 for Delta. Texture storage remains
  256² with nine existing mip levels, 349,524 bytes. These native values differ
  slightly from Node Canvas and are intentionally recorded separately.
- `crop-biome-integration-r2.NXGBPw`: registry, diff check, crop identity,
  crop lighting, Mangrove contact, far seams, reeds, TS7 and public build all
  pass. Source/tool pins remain stable. The focused/type lease releases before
  the build rejoins the ordinary FIFO. R1 was canceled before admission solely
  to make that fairness adjustment; it did not execute or fail a test.

Integrated build index SHA256:
`a63e5c7d8ba5f7bf9d245aa627940951e9b73f3dc3ebed135e8d2e41e406e8b6`.

No geometry, material, texture, draw family or per-frame work is added by this
crop change. Lower alpha coverage and identical crop-owned storage do not
certify complete frame cost or world memory parity. The native renderer counters
record the last postprocessing pass, not the full frame; one extra geometry
warms in the candidate's first Autumn near view, and the establishing view
matches. Physical iPad/Safari and whole-environment performance remain open.
