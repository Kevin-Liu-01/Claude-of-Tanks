# M1A2 SEP v2 X — supplied-model qualification

## Owner-selected target, 2026-09-11

The owner selected: **“Use the supplied model’s roof equipment and antennas.”**
This resolves the dimension-target question retained in the
[Abrams height diagnosis](../../tank-generation/recovery/abrams-history/abrams-source-x-track-height-diagnosis.md).
It does not waive source shape, track mechanics, visual, anatomy or performance
checks. Other Abrams variants keep their existing comparison contracts.

The direct supplied canonical model remains
`m1a2_sepv2_dc_source.glb`, SHA-256
`7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16`.
The complete unchanged source stays private. The selected frame is the existing
hash-verified, identity-metre source frame with independently measured rig
datums. No source or procedural geometry, camera-fit parameter, mask inclusion,
per-component threshold, or published gameplay specification was edited.

The comparison now uses the existing source-only dimension ruler and full
physical-envelope safeguards, also used for the other registered supplied
models. A failed hash or source-frame registration cannot enable this mode.
The old published 3.44 m comparison remains a recorded conflicting target, not
a description of the supplied source's full antenna envelope.

## Fresh results and remaining defects

The canonical R2 geometry check still exits 1: hull-side minimum
**87.6158867154285 / 92**; whole shape **90.50746140471016 / 92**.
Turret and stations pass at 95.4 and 95.2; dimensions and floaters are 100.
The source-frame update resolves only dimensions; it does not turn this tank
into a passing release. Every tracked source/tool file remained unchanged
during the run (2586 files).

| Height measurement | Procedural | Supplied source | Difference |
| --- | ---: | ---: | ---: |
| Same-frame filtered silhouette | 3.678341 m | 3.647256 m | 0.8523% |
| Complete physical envelope | 4.218975 m | 4.176975 m | 1.0055% |

The retained prior report measured the procedural height against 3.44 m and
failed dimensions at 52.6. It is preserved at
`.qa-dev/launch/sepv2-source-frame-r1/legacy-published-ruler.json`. Its raw
SHA-256 is `7a6f7ffbc65ea83b169e9f464ed06f9b59e421418454f0f9bf903d2a4baadade`.
The initial local R1 attempt failed before measurement because the source link
used the wrong registered filename; that failed log/ledger history is retained.
The correct R2 source is hash verified before use.

A fresh native-launch board capture completed with zero recorded errors and
unchanged input hashes. Root inspected its complete shaded source/procedural,
articulation and turntable board. All nine whole silhouette views exceed92,
but the track component scores90.8 and keeps fidelity failed despite aggregate
96.47. The board supports further track-course/body-outline diagnosis, not an
independent official14-view9/10 approval. Browser launch flags are verified;
the board page does not expose its WebGL canvas, so the attempted hardware
renderer read is null and this receipt makes no hardware/FPS qualification.

Evidence: `.qa-dev/launch/sepv2-source-frame-r2.log`,
`sepv2-source-frame-r2-manifest.json`, and
`sepv2-native-board-r1/{report.json,board.png}`. The unchanged LOW stock draft
is not integrated into this tree. Source-dimension, source-world-registration
and geometry-policy focused checks pass; runtime remains the published Garage
source. No anatomy/asset regeneration is needed for this QA-only ruler change.
