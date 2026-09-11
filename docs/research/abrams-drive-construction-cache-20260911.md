# Abrams fixed drive-surface construction

Implemented on `codex/launch-abrams-construction-20260911`, based on
`31827ead9`, and integrated into main as `4bdbbb14e`. This is part of the fleet selection-performance work, not a
replacement for the outstanding SEP v2 source/track qualification.

## Problem and change

Every source-X Abrams construction recalculated the same two cone surfaces,
including iterative triangulation balancing, even after another family member
had built that quality. An attribution-only Node profile of 60 alternating
HIGH/LOW drive builds recorded 935 of 1777 samples in `balancePass`, another
196 in `balancedTriangles`, and 102 in `oppositeAngle`.

The change memoizes the immutable numeric position template for each of the two
qualities. It creates a fresh geometry and all attributes on every call, in
the same allocation order. It retains no GPU resource, material, mutable
attribute or tank object. The first construction at each quality still computes
the original surface. Legacy stock uses the existing HIGH surface path.

This changes construction work only. Axles, track stock, drive-wheel shape,
topology, normal generation and material order are unchanged. No altered
silhouette or performance threshold is accepted by this change.

## Verification and retained failures

- R1 CPU profile: `.qa-dev/launch/abrams-construction-r1/`.
- R4 exact comparison: six quality/legacy/revisit combinations preserve every
  drive attribute, index, group and draw range, with the same number of geometry
  allocations. All seven source-X Abrams at HIGH and LOW preserve the complete
  geometry scene, including transforms and instance attributes, against the
  unmodified source-frame worktree.
- Mutation/disposal test: corrupting a tank's geometry cannot change a live
  sibling or a later build; tested both qualities and legacy stock.
- Native TypeScript and core unused checks pass.
- The first two comparison harness attempts used the wrong `createTank`
  argument position and entered the canvas path. Both failures are retained.
  R4 uses the actual `null` engine context and third-argument options.
- All 28 affected family/gear tests pass, including source guide, end-wheel,
  wheel-quality and source-X construction checks. Private build passes, version
  `v1.0.0+g4c9841436`, index SHA256
  `39b198a665921ad3f385139f61ea39332e6af220967b5342a200ec0e581c5a87`.
- R5 repeats the attribution profile on the candidate. The dominant balancing
  samples fall to 27 of 325, with seven in `balancedTriangles`; later calls
  spend their work constructing fresh attributes and remaining stock instead.
  These are sampled CPU-attribution results, not a controlled browser timing
  comparison or a first-construction speed claim.

The browser protocol uses actual country/card clicks in Garage and Gallery,
first visits, fleet eviction/revisits and warm alternation. It records long
tasks, frame gaps, available construction phase timings and readiness after
model/UI convergence and animation callbacks (plus a completed Garage post
frame). This is not physical display-presentation latency. Foreign CPU/GPU
activity remains a limitation; no favorable smoothness threshold is invented.
The initial browser wrapper stopped before acquisition on the incorrect
`challenger3` control identifier; R2 uses registered `challenger_3`.

Source models, temporary probes, build outputs and QA captures remain outside
the publication set. The scoped construction change is published; see the deployment receipt below.

## Native selection and independent review

Baseline and candidate R2 each pass all 42 real Garage/Gallery selections,
with zero browser/request errors, native Apple M5 Max Metal, DPR1 and unchanged
compiled artifact/tool manifests. The protocol uses desktop/default-reset
settings; the final Garage screenshots show HIGH, scale1 and 1440x900 buffers.
Root inspected all four final images. The Gallery PNG is byte-identical
(`d0fc30dd34505fd26f114243cf21ef4e538fb88e89689888a13066a2a1024203`).
The Garage images have matching tank presentation but different diagnostics
and asynchronous resident inventories; they are not an exact resource-state
comparison and do not establish GPU memory savings.

Observed first-pass readiness p50/p95: Garage261.2/517.0ms baseline and
219.5/420.0ms candidate; Gallery279.4/689.5ms baseline and296.6/763.8ms candidate.
Warm-alternation p50 is55.4/55.1ms Garage and223.0/223.0ms Gallery. Revisit
readiness is mixed as well. Long tasks and frame gaps remain in both runs.
Raw per-action cache state, phase timings and long tasks are preserved in
`.qa-dev/launch/abrams-selection-{baseline,candidate}-r2/report.json`, with
summary `abrams-selection-comparison-r2.json`. No paired/counterbalanced clean
host run or physical presentation measurement is claimed, and these results
do not close the fleet smooth-switching or FPS requirements.

An independent code review confirmed complete two-quality cache keys,
independent mutable output buffers, unchanged geometry/material allocation
order and legacy HIGH-path semantics. Combined with exact output comparisons,
the affected checks and native functional results, this supports the narrow
construction cleanup without representing a geometry/source qualification.


## Publication — September 11

Runtime change `4bdbbb14e`, proof documentation `9d1c7ea3a`, and deployment
input exclusion `fbe1d72ea` were pushed normally to main. Public version is
`v1.0.0+gfbe1d72ea`, deployment `dpl_DCHXNGMwXMLsuBRXThBQaZi7PJqF`.
The authenticated deployment and public `https://cot.kevinliu.studio/` index
are byte-identical, SHA256
`7555742ec541ddcb339ebc4b6dbae34825b76956ccbc6a8feea2ce77bf0c863b`.

The public build passed. Deployment dry-run R1 found 28 tracked authoring
captures in the source upload, so `shots` was added to `.vercelignore`.
R2 verified 6507 inputs / 766152972 bytes, excluding QA, Git internals, source
geometry, authoring captures, and real environment files. The hosted build
used the full `fbe1d72ea2e43ce517f016af67315442baa26cc9` revision and reached
READY before promotion. Local public-build index differs because it predates
the upload-exclusion-only commit; the public/authenticated hosted comparison
uses the same final revision.

Fresh live functional R1 passes native room creation, invite navigation and
membership, Winter map selection, both Ready controls, Start, both live
battles receiving new snapshots/inputs, and native exit/room close. Two fresh
browser contexts use verified native launch flags; zero page errors and both
room/browser cleanup receipts pass. Raw result is
`.qa-dev/launch/abrams-cache-live-native-r1.log`. This is a functional check,
not a performance sample.
