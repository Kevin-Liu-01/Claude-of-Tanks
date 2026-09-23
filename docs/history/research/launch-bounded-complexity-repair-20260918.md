# Bounded complexity repair — 2026-09-18

Completed only the three assigned vehicle modules and six assigned verification tools. The change extracts named validation, measurement and accounting steps. No source profiles, scalar dimensions, physical stock, policy decisions, tolerances, comparison targets, registrations or gate thresholds changed. British native baseline/after acquisition finished before shared-file mutation.

## Strict metrics

All nine modules pass the existing analyzer:194 functions,0 violations,0 explicit any/unknown. Every function is strictly below22 cyclomatic,22 cognitive and80 Halstead difficulty. Whole-file maxima:

| Module | Cyclomatic | Cognitive | Difficulty |
|---|---:|---:|---:|
| src/vehicles/physicalMuzzleBore.ts | 19 | 15 | 26.67 |
| src/vehicles/shadowCasterWork.ts | 14 | 20 | 31.06 |
| src/vehicles/suppliedSourceFleetSpecs.ts | 11 | 20 | 22.23 |
| tools/native-interior-fill-policy.mjs | 17 | 14 | 39.19 |
| tools/source-assembly-replay.mjs | 12 | 16 | 42.5 |
| tools/source-equipment-policy.mjs | 17 | 12 | 33.27 |
| tools/source-openings-policy.mjs | 21 | 15 | 24.57 |
| tools/tank-selection-probe.mjs | 15 | 15 | 24.29 |
| tools/track-band-separation.mjs | 15 | 15 | 26.21 |

## Preserved behavior

- Physical muzzle verification: terminal envelope and radial-wall checks extracted; all original sample coordinates, validation order and errors retained. Fifteen old/new calls have exact return/error equality, with actual geometry attributes/index and local/world transforms equal after each call, including malformed dimensions, missing/wrong-facing walls, capped/missing backstops, invisible stock and lip negatives.
- Shadow work: one eligible mesh's material submissions extracted from traversal. Sixteen old/new calls preserve counts, errors, geometry and transforms, including hidden ancestors, near LOD selection, instance limits, group clipping, negative draw start and wireframe rejection.
- Supplied specs: caliber adaptation and guided-shell naming extracted in their original order. Entire193-spec registry, model-source map and ID ordering serialize byte-identically before and after two synchronization calls:SHA-256 d13bc88dede1cff55dab3d81c7883150c8a51352e762ee2dba79ef421726c11f. The private harness initially failed from missing eager donor initialization; that harness error was fixed by importing the standard eager factory, not by changing registration behavior.
- Five policy/geometry tools:249 old/new calls from unchanged focused fixtures preserve exact structured outputs or error name/message. These include68 generated fill groups, literal source replay bytes and selector/hash/transform negatives, physical equipment negatives, opening-manifest/ray negatives, and all36 closed-band separation controls. First-failure order, triangle-pair counts and containment evidence remain unchanged.
- Selection probe: only its in-page thumbnail receipt assembly was extracted. Eighteen mocked DOM readiness cases compare the actual old/new observation callback, including absent/clipped images, fallback, opacity and visibility. No fresh native browser was launched; this does not independently establish new browser timing or screenshots.

All existing focused tests pass after integration; full TypeScript and core-unused checks pass. No full-fleet visual claim is made by this refactor. Evidence, old snapshots, candidates, exact comparison calls, logs and final hashes are in .qa-dev/tank-run/critic-complexity/. The changed code is build-time or verification work, not a new frame-loop operation.

## Remaining changed-tool metrics

The private audit covers36 changed/untracked runtime tool modules against88592876f, including inline HTML scripts and excluding selftests. Initial inventory had30 violations; after this scoped repair and concurrent root-owned fixes,19 remain across7 pre-existing modules. Every remaining violating function has the same whitespace-normalized function text and identical metrics as the baseline. No remaining violation is introduced by this cohort's changes. Do not interpret this as a repository-wide complexity pass.

Remaining inherited modules: fleet-geometry-audit.html (1), gen-interior-fills.mjs (4), icons-page.html (1), procedural-fidelity.html (5), tank-sealed-check.mjs (1), track-clip-audit.html (2), visual-evaluator-page.html (5). Their exact function names, current/baseline numbers and provenance are preserved in tool-metric-inheritance.json. They were not edited as part of this task.
