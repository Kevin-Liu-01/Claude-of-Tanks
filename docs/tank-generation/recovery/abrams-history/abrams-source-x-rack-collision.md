# Abrams X rack collision alignment — 2026-09-07

This is a gameplay-metadata correction, not a new visual or source qualification.
All seven native profiles, source assets, reference transforms and comparison
thresholds remained frozen.

## Confirmed defect

All seven X specs inherited the donor `bustle_rack` external quad at turret-local
Z−3.34 (canonical world Z−2.947288), spanning world Y1.663295…2.263295.
The complete native scene missed all 35 fixed finite segments per variant at
X−1.3…1.3, Y1.7…2.22, Z−3.00→−2.90, while the live tracer hit that quad:
245/245 phantom contacts. Immutable evidence:
`.qa-dev/reports/abrams-rack-collision-before-lSwL5m/receipt.json`.

## Scoped replacement

`src/vehicles/abramsSourceXRackArmor.ts` independently constructs finite collision
faces from the sparse dimensions of the first-party native rack. It imports only
types and the boot-light scalar frame; it imports no Three.js factory, source
loader, source vertex array or reference asset. Rawls wired its armor-level hook
once in the shared provisional-armor path used by initial registration and sync.

The six non-SEP-v2 configurations retain their actual four-course main U rack:
51 authored stocks / 2,183 exposed faces. SEP v2 additionally carries its actual
extended frame and folded source79-derived screen: 90 stocks / 2,769 faces.
The central folded screen is real stock; neither its surrounding bays nor the
open floor are replaced by a full rectangle. All replacement faces retain the
donor's 10 mm physical, 10 mm KE and 10 mm CE values, permanent turret ownership,
and non-ERA status. The helper changes no non-rack armor metadata.

Adjacent round pieces of each continuous U course overlap in the native authoring.
Simply registering their closed faces caused two protection charges at 12/30
joint probes. The helper now subtracts only adjacent same-course interiors,
coalesces genuinely coplanar convex fragments, and assigns half-open interior-cut
edge ownership. It does not move any surface. Shared opt-in tracer support uses
finite convex polygons, physical edge-distance tolerance, ≤1 µm coincident
same-frame/same-group deduplication, 1 pm half-open cut-edge ownership, and
conservative physical face bounds. Distinct depths are not merged.

## Frozen focused result

`.qa-dev/reports/abrams-rack-armor-final-1hUMDs/summary.json` records `pass:true`,
completed **2026-09-07T14:33:14.373Z**, with unchanged before/after file hashes.
The actual JSON output, not merely the process exit, records:

- 14 high/low builds × 3 poses; 1,470 complete-scene phantom-plane misses.
- 228 actual stock first contacts and `resolveShellHit` events; 24 independently
  fixed full-scene side-bay air checks.
- 1,260 continuous-course junction checks, each charging protection exactly once.
- 13,510 finite center/inset-corner comparisons with actual first-party native
  stock: maximum canonical-high difference **0.150038 µm**.
- 71 helper functions, zero quality violations, zero explicit any/unknown.

Canonical main rails use the unchanged high 12-sided round stock. The unchanged
low renderer uses 8 sides. Its maximum measured occupied-triangle distance is
**0.722869 mm**; 1,116 very narrow clipped-cap/edge-normal rays miss that lower-LOD
polygon and are explicitly evaluated by closest occupied-triangle distance.
This is a disclosed existing chord-tessellation difference, not exact low/high
surface equivalence or permission to alter the physical axes/radii.

The repository regression pins all 14 full visual SHA fingerprints from the immutable
pre-hook `gZjGG6` receipt: node hierarchy, visibility, local/world matrices,
attributes, indices and instance buffers. Rawls independently confirmed those
14 visual hashes and all nine original full-spec hashes in
`.qa-dev/reports/abrams-armor-metadata-visual-BsrsnZ/receipt.json`.

## Cost and remaining integration

The rejected unbounded raw face map measured approximately 119 µs per trace;
the exposed fragment map without physical bounds measured approximately 161 µs.
The bounded final map measured median **56.995 µs**, versus **1.907 µs** for the
inherited quad, on the same 81 rear hit/miss rays (five paired batches):
`.qa-dev/reports/abrams-rack-cost-cHGWCF/receipt.json`. This is bounded CPU evidence,
not a fleet performance certification or a relaxed release gate.

The final API was also measured on **88 mixed front/rear/side/roof/miss rays**
against actual warmed complete armor objects, keeping every non-rack field
identical in the comparison clone. Five paired batches measured median M1A1 X
**3.729→72.906 µs/trace**, and SEP v2 X **3.958→91.158 µs/trace**.
The exact ray list, hit checksums and counts are retained in
`.qa-dev/reports/abrams-rack-full-cost-5ejEyv/receipt.json`.

Fresh generated main-shell anatomy remains root-owned. The pre-hook receipt has
zero generated hull/turret cells for these seven IDs; therefore a warmed current
armor benchmark must not be mislabeled a post-generation finalized-cell result.
The full anatomy update/check and final release diagnostics remain mandatory.

The requested post-generation rerun on 2026-09-07 failed before producing its
complete receipt: SEP v2 construction rejected 912 generated faces sharing the
single logical name `m1a2_sepv2_skirt_era_L` because `reactiveSkirts` still required
one physical plate row. Read-only registry inspection confirmed **11 hull / 14
turret cells** for both measured IDs, but there is **no successful post-generation
timing result**. The sole FIFO session10569 exited1 and was drained; no source or
harness edit and no retry was performed. Exact failure and input hashes:
`.qa-dev/reports/abrams-rack-full-cost-postgen-failure-10569.json`.

After the separate unique-logical-ERA-bank lookup fix, the one authorized retry
completed at **2026-09-07T15:05:24.472Z** and drained its FIFO session32271 with
exit0. Both actual armor objects now contain **11 hull / 14 turret collision
cells and 2 track shapes**. The unchanged 88-ray workload and five paired
20-cycle batches measured:

| Finalized armor | Old-rack control | Actual rack | Rack difference |
| --- | ---: | ---: | ---: |
| M1A1 X | 5.570 µs | 81.958 µs | +76.387 µs |
| SEP v2 X | 149.514 µs | 254.924 µs | +105.409 µs |

The control retains the same newly finalized anatomy and every non-rack field;
only the rack is reverted in an in-memory comparison clone. SEP v2 now carries
1,864 hull / 3,352 turret plate records, so its higher absolute cost includes the
generated-ERA workload already present in the 149.514 µs control. Each paired
batch retained stable hit counts: M1A1 4,020→3,900; SEP v2 4,320→4,280. Raw rays,
all timings and populated cell counts are preserved in
`.qa-dev/reports/abrams-rack-full-cost-4cEByr/receipt.json`. This completes the
requested post-generation measurement, not a performance gate, a frame-budget
guarantee, or overall release certification. No source file was edited.

Frozen helper SHA256:
`ab6697d9a2b9a6ad317b31bcced4ce3009c752813b9126f8092d2583ccc9d256`.
Frozen focused-test SHA256:
`596740dee60030b3688fe031e3db1e48a0fee671ccd36923b037abbdf1b94190`.

