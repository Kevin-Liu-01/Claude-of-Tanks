# Detached Garage buffer residency — 2026-09-11

Unpublished candidate based on runtime `806bd6d61` and documentation head `909399f6e`. The accepted revision changes desktop Garage suspension and preserves constrained devices’ original stage-only policy; it does not qualify a physical mobile device.

The desktop battle previously detached both Garage roots but kept their GPU buffers resident. The candidate releases renewable geometry from the stage and workshop roots while preserving desktop textures, materials, programs and CPU ownership. Constrained devices continue releasing eligible stage textures and geometry without newly releasing workshop buffers. Active geometry and shared attribute/index/interleaved-buffer borrowers remain protected. This does not evict object-owned instance buffers or BatchedMesh private control textures.

The existing complete covered restoration, shader readiness, shadow, upload, retry and context invalidation paths remain in use. Geometry-only release still requires that preparation before reveal. Any measured return cost belongs in the acceptance decision.

## Evidence

- Six focused ownership, phase presentation, GPU warm, return and workshop lifecycle tests pass. Type and private production build pass.
- Independent code review finds no blocker in the bounded implementation, but requires actual allocation savings and native return qualification.
- Fresh production baseline index SHA-256: `c258bf5f36420e8cd1ffc5771e232e03c539f0b849ab1b9eb9af308aa706909f`. Native M5 Max, no page/console/response errors. Renderer geometry counts: initial Garage 244, battle 716, returned Garage 457. Programs: 65/190/213; textures: 68/293/148.
- Baseline resource gate fails at initial Garage 264,999 triangles, returned Garage 268,705 triangles, battle 716 geometries, 235 attached materials and 14.349 ms per rendered frame. These are raw failures. Successful probe execution (`ok: true` with `gate: false`) is not resource acceptance.
- Candidate production allocation and real-control desktop/mobile-preset transition receipts are pending. The probe retains its old zero-suspension/zero-resume expectations; those policy checks must be distinguished from actual resource ceilings, without deleting either result.

Native evidence is under `.qa-dev/launch/garage-buffer-*`; it is not committed production content. No performance improvement or release readiness is claimed before the candidate results and original screenshots are reviewed.

## First native comparison: bounded findings

The candidate reduces actual battle renderer geometry allocations from 716 to 544, with the same 671 calls, 4,630,656 submitted triangles and 190 programs. Its release receipt counts 382 geometry objects, including resources that were not uploaded; that is not the allocation saving. Scene resource inventories and program-use histograms match in all phases. Desktop disposal emits zero material and texture disposals.

The returned phase comparison is not fully matched: the baseline auto-selected medium while the candidate retained high. Initial/battle GPU texture counts differ by one/two despite matching visible texture inventories. R1 remains raw evidence, not exact visual or texture-allocation parity. A controlled HIGH rerun with explicit per-phase setting assertions, complete workshop readiness and native repeated-control snapshots is underway.

Real desktop Battle/rematch/return controls pass the unchanged functional, cover, shader, source and audio gates. The candidate really performs restored uploads (188 ms final restore, 166 ms shader preparation across ten slices and 51 upload batches). One final return is 539.1 ms versus the baseline 423.6 ms, with 88.2 ms versus 130 ms cover latency. Different workshop readiness at first reveal means their original screenshots are not content parity.

Native mobile-preset controls also pass and restore the dressed Garage. Final restore 212 ms and total 572.5 ms are observed; the earlier implicit return before rematch takes 4396 ms, including 4308 ms shader preparation. A matching baseline mobile-preset run is pending. No mobile performance approval or physical-device claim is made.


## Accepted narrowed revision and final evidence

The first candidate's newly released mobile workshop buffers produced an 85 ms upload batch in the matched R2 fixture. The accepted revision keeps the original mobile stage-only policy. The predicate is read once per suspension and an explicit empty additional-root override does not mutate the desktop default. Desktop releases both detached roots' renewable geometry while keeping textures and materials. Existing attribute/index/interleaved borrowers remain protected.

Frozen revised private index SHA-256: `92255e9c89318fec6892a1fe028d4d497c194d28498882736a808b40d0ef175b`. Native M5 Max R5 uses identical numeric cameras and the two real decoded archive textures (asset and pixel hashes), with declared archive clock controls only for the visual snapshot. All four restored image pairs are exactly equal in decoded RGBA, with zero repeated-frame changes, GL/page errors or source mutation. All eight originals received independent review; the parent also reviewed all four candidate originals. The rear view is partly column-occluded. Candidate release/resume genuinely occurs: 382 geometry disposal receipts, zero materials/textures and one successful restoration. Raw texture count differs by one, so screenshot equality is not total residency parity. R4 was cancelled before capture; earlier mismatched source/camera runs remain retained.

Matched real-control R2 desktop runs use identical complete initial workshop readiness. Final return restoration is 19 versus 69 ms and final click completion 391 versus 431 ms (baseline versus candidate). The bounded tradeoff is fewer battle allocations in exchange for renewed buffers during the existing covered return. No repeatable frame-rate improvement is claimed. Actual battle geometry allocations fell by 172 (716 to 544) in the earlier native resource fixture; 382 disposal receipts include non-uploaded resources and must not be reported as saved GPU allocations.

Final matched actual mobile-preset R3 baseline/candidate runs pass unchanged controls, cover, warm, source and passive-audio gates. Initial inventories are exact: 398 meshes, 314 geometries, 166 materials, 46 textures; 236 calls/232023 triangles; GPU 290 geometries/80 textures, 72 programs. Returned ordered inventories match: 427 meshes, 315 geometries, 192 materials, 45 textures; 274 calls/232409 triangles; GPU 393 geometries/132 textures, 335 programs. Final live camera/serial differ and remain explicit. All eight original action screenshots received independent review.

| Mobile observation | Baseline | Revised candidate |
| --- | ---: | ---: |
| Implicit restoration | 340 ms | 299 ms |
| Implicit maximum upload batch | 2 ms | 2 ms |
| Final restoration | 80 ms | 52 ms |
| Final maximum upload batch | 3 ms | 2 ms |
| Final click completion | 477.5 ms | 365.3 ms |
| Final maximum frame gap | 50.9 ms | 49.1 ms |

The old 85 ms upload observation did not recur. This single matched pair does not establish a speedup or physical-phone qualification. Acquisition hash is `7e7391a4cca8e3c94216f5ab3ee0f3d34475f4c8cdc7f4477c59d6579e36365c`; build/source manifests remained fixed and every owned preview/browser closed.

Evidence: `.qa-dev/launch/garage-buffer-fixed-native-r5/report.json`, `garage-buffer-actions-r3-comparison.json`, `garage-buffer-actions-mobile-r3-independent.json`, and `garage-buffer-desktop-scope-independent-r3.md`. Earlier raw failed/confounded receipts remain available. The canonical probe's old retained-desktop policy is updated separately to assert real geometry release and covered renewal, without changing resource or timing budgets. Initial/returned Garage triangle caps and battle material caps remain open; this is scoped acceptance of desktop buffer ownership, not fleet-wide launch certification.


## Integrated verification — 2026-09-11

Runtime integrated as54b440b83 atop the published Autumn documentation head d121db465; strict probe policy integrated as50db6ccf3. Type/core-unused, private build and public build pass. The complete registered suite has 1006 unique files (311 pre / 653 core / 42 post), all now covered by validated passing executions as documented below. The added policy test separately passes all malformed/missing/failed receipt cases while preserving every nonpolicy result and resource ceiling (battle material ceiling220).

The 60-second native high-quality Verdant camera probe ran against frozen integrated private index4100009138fe4273d6a21ee55fc61cf3f67aeb0972a25f3b62530e7751a91e0d and historical baselinec258bf5f36420e8cd1ffc5771e232e03c539f0b849ab1b9eb9af308aa706909f. Both share acquisition6a247efed71c090fce6d2332e9a3ce017814e76512f65f56c21db1f68da46faf and the complete pinned7v7roster. Both observe40.8median FPS,38.9fifth-percentile FPS and33.4ms p99; unchanged timing gates FAIL. Both receive28of29planned camera inputs and all28respond (zero missed/unsupported); one unattempted slot means input coverage is incomplete, not a complete pass. Both have zero app console exceptions.

Certification is refused in both runs: candidate observes85.2%foreign interactive-browser GPU CPU and4foreign headless GPU processes, baseline150.7%and3. Baseline also fails the unchanged terminal-submission-window admission. These samples do not establish comparative performance, a causal regression, speedup, or smoothness. No foreign process was stopped. The prior matched real-action visual/functional evidence remains the scoped desktop ownership acceptance; global timing and original triangle/material limits remain open.

Unpromoted hosted deployment dpl_7phLdUP36KRHUfcQRh1DyEg8ihDr is READY at https://claude-of-tanks-mohrlx2bm-kl01s-projects.vercel.app, versionv1.0.0+g50db6ccf3. Authenticated index SHA-256621141425af140be841b8034d44c5c86e11416eb8712dce291ec249d734a8edb. Public cot.kevinliu.studio still returns the verified Autumn version/hash. Dry upload inspection6525files/773338292bytes includes no private GLBs, QA evidence or secrets. The integrated test continuation is now complete; this hosted runtime is accepted for the bounded desktop ownership change. Publication verification is recorded below.


## Completed integrated coverage and publication assessment

At source head `35b9ea84f57911e7a5a9bb48d99581af40ba9177`, all 1006 registered unique selftests have passing evidence: 354 unchanged passes retained from R1 plus 652 explicit successful child exits in R3. Each retained test matches its original source revision and every R3 test matches the recorded current SHA-256. The full tracked source/tool/server manifest remained unchanged during R3. This is combined coverage, not a claim that the initial uninterrupted npm test run passed. Certificate: `.qa-dev/launch/garage-complete-suite-certificate-r3.json`; R3 report SHA-256 `ea5dea4c590bfa2942094c38656a58dbfbe728b6dc32c2b6600eea88bf78a72f`.

R1 exposed a stale test expectation that desktop Garage resources remain resident. The updated test exercises actual desktop and constrained-device disposal, restoration, uploads, failure/retry and CPU ownership. R2 failed the unchanged 4 MB dedicated collision memory plateau assertion. Its partial unrecorded results receive no coverage credit. The unchanged memory assertions subsequently pass both alone and within R3; that memory-sensitive file now receives exclusive test scheduling with barrier and failure-path coverage. No memory ceiling was changed and contention is not asserted as the proven cause of the earlier failure.

The changes after hosted runtime `50db6ccf3` affect tests and documentation only. The accepted native image/action evidence, successful private/public builds, full test coverage and bounded resource saving support publishing the desktop ownership fix. The earlier failed or inadmissible timing reports, remaining Garage triangle and battle material limits, and unfinished fleet/map work remain open.
