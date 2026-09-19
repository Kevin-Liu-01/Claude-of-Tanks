# Phase performance diagnosis — 2026-09-18

The frozen candidate and untouched HEAD both fail the same 19 of 62 release checks. No new failing check is introduced in this comparison. The fixed budgets remain unmet; this is attribution evidence, not a waiver or passing release receipt.

## Provenance

- Baseline commit: 29c9ecefd22a978a4508700408ed7fa5d9fbc468; tree: b988d3f5be289cee3ce24caec4051ad33adbbeb3.
- Isolated git-archive directory: /private/tmp/cot-phase-baseline-29c9ecefd-u9nnjxh4. Only node_modules is symlinked; no shared checkout was altered.
- Baseline production build index SHA-256: e54ded672ce68d2e424058d5feb321be6834b73f11f019eeab4f8d1fc40d11b6.
- Baseline dist manifest: 75767e6f4acd9cc938a059e8135b810b6b8daf6265b93707592e8a61c70ce96c (3539 files).
- Original candidate build index SHA-256: 285e70432e5ef5c9050fe3ce2fb884057907cdeb9cee1144397a5fd3686ae788. The live dist has subsequently changed; the original report is retained separately.
- Identical acquisition SHA-256: 4141eead10273621c4a8b5997fb499348067e9d95566a7fc820feab9242d6ec2. Browser Chrome/151.0.7922.47, viewport1280×577 at1x,8-second samples and16-second Garage settle match. Source identity file records Node/npm/dependency paths and baseline source hashes.
- Build and probe used the shared FIFO in separate leases. Baseline build exited0; its gated probe exited1 with zero application/console/network errors.

## All original failures

| Check | HEAD baseline | Frozen candidate | Unchanged limit |
| --- | ---: | ---: | --- |
| garage idle visible sceneGeometries | 483 | 483 | <= 450 |
| garage idle visible sceneMaterials | 205 | 205 | <= 200 |
| garage idle complete-frame triangles | 291652 | 291652 | <= 240000 |
| active battle refreshes every shadow cascade coherently | ["7","15"] | ["7","15"] | all-cascade mask 15 on every presented battle frame |
| active battle complete-frame shadowCalls | 373 | 373 | <= 360 |
| active battle complete-frame shadowTriangles | 3623594 | 3623594 | <= 2250000 |
| active battle main-thread cost per rendered frame | 13.899 | 14.209 | <= 11.5 ms/render |
| active battle JavaScript heap | 330.1 | 331.9 | <= 315 MB |
| active battle scene objects | 1216 | 1216 | <= 1150 |
| active battle renderer geometries | 702 | 702 | <= 680 |
| active battle visible sceneGeometries | 802 | 802 | <= 680 |
| active battle visible sceneMaterials | 245 | 245 | <= 220 |
| active battle complete-frame calls | 827 | 827 | <= 780 |
| active battle complete-frame triangles | 6811052 | 6812232 | <= 4800000 |
| returned Garage JavaScript heap | 227.6 | 227.9 | <= 225 MB |
| returned Garage renderer geometries | 576 | 576 | <= 510 |
| returned Garage visible sceneGeometries | 486 | 486 | <= 475 |
| returned Garage visible sceneMaterials | 215 | 215 | <= 200 |
| returned Garage complete-frame triangles | 306922 | 306982 | <= 240000 |

## Causal limits and interpretation

Every owner-level sceneBreakdown object is byte-equal across the three phases. The initial selected pedestal is M1A3; workshop vehicles and the pinned14-actor battle roster are existing IDs. No newly authored vehicle is selected by this probe. The workshop optimization receipt, weather and roster match. Idle submitted geometry is exactly291652 triangles; the final captured battle frame is exactly6800082 triangles in both builds. The1180-triangle peak-window difference is not a changed owner-geometry total. Returned submissions differ by60 triangles with a different camera seat (baselineY2.15019,candidateY2.26247); graph geometry totals remain exact.

The candidate has one additional battle wheel-paint program (203→204), consistent with the intended wheel readability shader split. Timing is13.899→14.209ms/render and battle heap330.1→331.9MB; these two single runs do not isolate a causal cost regression. Both already exceed the fixed limits. No claim of identical timings or zero heap effect is made.

The mask failure is directly explained by unchanged src/engine/shadowRefresh.ts: OUTER_CASCADE_FRAME_DIVISOR=2 intentionally produces7/15, while the unchanged probe requires15 for every presented frame. The Garage/world/lighting/probe source files are identical to HEAD.

## Minimal repair proposal

No rollback of the new vehicle geometry or track/wheel visual repair is supported by this evidence. Treat these as inherited performance work: first address the existing HIGH-detail parked workshop stock and exact resource duplication; the workshop owns362526 graph triangles,230 geometries and120 materials. For battle, investigate existing vegetation (2115360 graph triangles) and props (712536), especially shared/LOD shadow stock, before touching unrelated tank profiles. The shadow scheduler and its full-cascade contract require one explicit coherent policy with visual and performance proof; do not silently widen the gate. These are follow-up targets, not claimed fixes.

Machine evidence is retained under `.qa-dev/tank-run/british-us-source/`: `phase-baseline-comparison.json`, `phase-baseline-report.json`, `phase-candidate-original.json`, `phase-baseline-identity.json` and `phase-baseline-dist-manifest.json`. These local captures are intentionally not committed. The comparison JSON SHA-256 is `1cf90116d330ca965308e1a0e30e7c96c71021515c05dd0726d0aaff60b1fee1`; baseline report SHA-256 is `aea24f7ca73a7b1004b0b44963e12053eb7017cac44f228701e4d6c1d90c386a`.

The report describes the identities above. Later source-supported attachment repairs to the new vehicles do not retroactively change these receipts. This probe selects existing vehicles; the new models have separate geometry budgets and selection measurements.

## Final supplied-fleet geometry budgets — 2026-09-18

The final thirteen loaded Gallery models pass their unchanged class budgets in
26 HIGH/LOW browser builds. The measurement traverses visible indexed geometry
and includes instance/batch multiplicity and normal presentation details; it is
not the profile-only triangle count or a frame-rate measurement. Each AFV is
below 80,000 HIGH triangles and 85 objects; ZTZ-100, Sabra and Type96 are below
100,000 HIGH triangles and 65 objects. Every LOW build remains below 75% of HIGH.

| Vehicle ID | HIGH triangles | LOW triangles | HIGH objects | LOW/HIGH |
|---|---:|---:|---:|---:|
| `kurganets25_x` | 59,560 | 38,978 | 44 | 65.4% |
| `ztz100_x` | 99,510 | 69,728 | 49 | 70.1% |
| `fv510_milan_x` | 65,940 | 39,628 | 42 | 60.1% |
| `aft10_x` | 71,068 | 41,282 | 41 | 58.1% |
| `bmp3m_dragun125_x` | 66,048 | 40,840 | 39 | 61.8% |
| `griffin50_x` | 61,818 | 36,008 | 41 | 58.2% |
| `kf41_lynx_x` | 76,400 | 52,808 | 45 | 69.1% |
| `k21_x` | 59,444 | 37,446 | 41 | 63.0% |
| `cv90_mkiv_x` | 51,124 | 33,500 | 43 | 65.5% |
| `ajax_x` | 79,896 | 48,012 | 45 | 60.1% |
| `sabra_mk2_x` | 74,570 | 48,172 | 44 | 64.6% |
| `cv90105_tml_x` | 50,312 | 33,410 | 44 | 66.4% |
| `type96b_x` | 65,566 | 39,514 | 40 | 60.3% |

The corresponding filled HIGH/LOW strict track audit reports zero band and
moving-shoe intersections in every front, rear and sweep zone. Raw evidence,
the class-budget assertions and the unchanged runtime-input receipt are under
`.qa-dev/tank-run/final-corrections/qualification/` in
`geometry-budget-checked.json`, `strict-tracks-checked.json` and
`geometry-tail-drift.json`. These selected-model results do not erase or
reclassify the older whole-scene failures above. Actual UI selection, complete
release and publication status remain separately recorded in the batch.
