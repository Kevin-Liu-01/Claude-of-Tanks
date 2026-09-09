# Nine-tank bodywork and return-roller integration

This checkpoint composes the independently reviewed seven-tank bodywork pass
with fitted return rollers on `leo2a7v_x` and `leo2_revolution`. It does not
activate the unpublished Merkava, A4M, A5, KF51, K2, T14 or Centurion roller
candidates, or claim that the wider fleet performance backlog is finished.

## Exact integration scope

Base: published `3dc8f08a0`. Seven-tank source: `3d486e7de`; two-Leopard
source: `f4512b2f5`. Already-published browser-lifecycle and world-test fixes
were not duplicated. The source histories remain separate commits.

The seven bodywork IDs are `t90a_burlak_x`, `leo2a5_x`, `leo2a6_x`,
`leclerc_x`, `amx40_x`, `merkava3d_x` and `merkava4_x`. Their fixed metal
panels use camouflage-aware materials, and the Merkava shoulder/end returns
have finite receiving stock. Scope, source fidelity, finite-contact and
historical-preservation evidence are maintained in
[the seven-tank packet](seven-tank-bodywork-integration-20260909.md).

The two Leopards each gain four real return rollers per side with finite
painted shafts. Full-stroke fit, stock clearance, retained road-wheel/body
geometry, native HIGH/LOW rendering and the strict 92-point comparison are
documented in [the Leopard packet](leopard-priority-return-rollers.md).

The clean union at `44e34b413` has exactly nine changed manifest rows and 67
changed images: all 51 seven-tank images and all 16 two-Leopard images are
byte-identical to their respective reviewed source branches. Other manifest
rows remain identical to main. All 161 ledger rows retain their respective
source values; the sole cherry-pick conflict was its generation timestamp.
The shared factory is exactly the seven-tank factory plus the two-Leopard
`RunningGearConfig` interface export. No raw GLB or temporary QA is tracked.
These assertions were also independently reviewed by the seven-tank owner.

Local pre-execution proof: `.qa-dev/nine-integration-inputs.json`. It records
the nine ignored source-oracle hashes and verifies exact rows, images and
shared-core composition. It is not a release-pass receipt.

## Preserved regression failure and repair

Both original composed releases passed their target-specific gates and then
failed npm PRE at the same Mk5 historical-scene check. Neither failed run is
relabelled as a release pass. Published `deaf6bf11` intentionally stopped
UV/dirt-color baking for geometry-only consumers; the older fixture included
those paint channels in its complete scene hash.

Test-only repair `731bbf3cf` measures the original snapshot through the
supported rendered/geometry-receipt path. Both original HIGH/LOW hashes
remain literal and pass, as do all existing Mk10 checks. A paired optimized
build must retain every non-paint scene/geometry attribute; paint differences
are confined to the exact original camouflage bucket list. Twenty-six
rejecting controls cover physical attributes, hierarchy, transforms and
unauthorized non-camouflage attribute changes.

The authentic parent `7b91b838b` also passes its original test. The independent
repair receipt is `.qa-dev/chieftain-history-proof-corrected/receipt.json`
in the isolated Chieftain repair tree, SHA-256
`0e871a699ef987bb280893d8b15299f74816b03e5a494b388467a7b9bb8504ce`.
No golden was refreshed and no tank runtime changed for this repair.

After the frozen preflight completed, the candidate was rebased onto
`afdad2440`, retaining published ground-cover fixture repair `9fcc26fc9` and
the intervening environment documentation. Reviewed test-only repairs
`731bbf3cf` and `457bc1863` were integrated, then rebased onto published
`7a26c2690` as `953f3e527` and `c433e5ef7`. Compared with the preflight,
five test files changed under `src/`: these two, ground-cover clearance,
terrain-resource lifecycle and horizon/Mesa surface. The latter two preserve
the published readiness-owner/cache contract and reject false matches;
they do not change world runtime. Tank runtime and generated assets stayed
exact across those test-only integrations.

The formation repair preserves the historical nominal spawn formula and
tests its composition with the published safe-placement resolver. It keeps
explicit-spawn bypass semantics and exercises overlap, wet, steep and
obstructed rejection controls. The ground-cover fixture recognizes the
published generator finalization path and rejects missing/reordered stages.
Neither repair changes simulation/world runtime or relaxes a tank gate.

## Fresh union preflight

The nine-phase preflight passed at `44e34b413` from 08:06:02 to 08:49:28 UTC
on 2026-09-09. It includes native type checking/core-unused, anatomy and
marking regeneration/checks, all technical-view regeneration, the complete
combat-anatomy test, full-fleet module hits and technical-view freshness.
The input fingerprint remained exactly
`c44879180bfe596695dd018a1246b17918d0e9a065749fd2a465c340b1fedb6b`.

Anatomy covers 174 playable tanks. Module hits checked 1,496 modules and 348
track sides with zero failures/outside-envelope hits; the 79 pre-existing
dimension-drift warnings remain documented, not silently cleared. All 522
required technical files for the 174 playable tanks are current. Regeneration
also checked the 201-entry asset catalog without unexpected tracked changes.
The technical-only phase intentionally skipped bore checking; the complete
release below still requires its dedicated bore gates.

Local receipt: `.qa-dev/nine-preflight-1ZwvfN/receipt.json`, SHA-256
`774005048c9dee0dbd5ce4f064130563ece50c03183d78daf17659f6e1d6648d`.
This preflight is not the complete release or permission to publish.

## First nine-ID complete release: failed, preserved

Candidate `74d189dfa` ran from 09:00:23 to 09:52:43 UTC on 2026-09-09.
Type checking and all nine target gates passed, including source fidelity,
the unchanged 92-point geometry floor, physical contact/clipping, barrel
bores, fittings and track continuity. All 277 PRE tests passed. CORE then
failed at `tankAssets.selftest.mjs`: runtime hit-marker projections were
stale relative to the newly captured Leopard images. Revolution's saved
vertical center was 1.9843 m versus runtime 1.9893 m; A7V X's was 2.7753 m
versus 2.7825 m. The other 199 catalog entries matched their saved receipts.
CORE/POST and both builds therefore did **not** complete. This is not a
release pass or permission to publish.

Local immutable receipt: `.qa-dev/nine-complete-8VUYww/receipt.json`, SHA-256
`45cb9a551a39f448519046360b821c0592201ad009d74b1c4a3fe19b971e8df9`.
The frozen source fingerprint and all nine source-oracle hashes stayed
unchanged. The dedicated Chieftain and formation repairs passed inside
this actual run. Existing dimension and battle-pacing warnings were not
silently cleared.

The first attempted repair used the full-fleet centering generator. Its
native generation passed, but the repair harness correctly failed its
scope invariant: that generator proposes new pixel-centroid anchors,
including small A7V, M1A3 and MBT-70 changes. Those new fits are not the
camera fits of the retained images. Its output is preserved at
`.qa-dev/leopard-projection-repair-BXkM6y/full-generated-scope-rejected.ts`;
none of that broad regeneration was adopted. The original incomplete
harness receipt is retained, not relabelled a pass.

The maintained `presentation-centering --sync-assets --ids=...` correction
verifies all selected image/thumbnail hashes and fresh native geometry,
metadata and projection at the existing anchor. It then updates only the
selected projection rows. Existing centroid residual limits remain separate
checks; neither the full generator nor its exact global check is relaxed.
Both release preflights now reject stale saved/runtime or native/captured
projections early. The pure regression has 169 rejecting controls.

An initial native sync caught a missing browser import before any write;
`.qa-dev/verified-scoped-projection-sync-B7kMpU/receipt.json` preserves that
failure. The import and binding test were corrected. The fresh four-phase
repair passed from 10:14:34 to 10:20:04 UTC: native selected sync, nine-tank
centering, nine-tank assets and the complete `tankAssets.selftest.mjs`.
Only the two measured Y projection values changed. All 201 anchors and
projection pairs now match the saved catalog; every one of the 2,010 image
files and the entire manifest stayed byte-identical. Maximum nine-tank
rendered/exported center residuals remain 0.08/0.14 pixels.

Repair receipt: `.qa-dev/verified-scoped-projection-sync-YEhRsG/receipt.json`,
SHA-256 `8f8aa260b57db8f796282e353a44f073a724f398b181f0f57ec6dc17c1d02525`.
Its catalog test confirms metadata for all 174 playable tanks, not a
fleet-wide style/performance release. Full-suite registration is now
278 PRE + 545 CORE + 35 POST = 858 ordered checks.

## Native test-process failure — preserved, not waived

The clean `a3777557f` complete run passed type checking, every nine-tank
target gate and all 278 PRE checks. At 10:53:18 UTC, the CORE observer
test process terminated with SIGSEGV/exit 139, without an assertion failure.
The matching local macOS report `node-2026-09-09-035318.ips` identifies
PID 92357, `EXC_BAD_ACCESS` at address `0xe`, and V8 garbage-collection
frames headed by `ClearStaleLeftTrimmedPointerVisitor`, followed by
`ContextifyScript`. This identifies the native crash boundary, not its
underlying engine defect. No runtime or test code was changed in response.

The exact observer test passed three subsequent unchanged runs through the
shared FIFO runner. Those diagnostic passes do not turn the complete run
into a pass. Its frozen source and all nine oracle hashes stayed unchanged:
`.qa-dev/nine-complete-MjteF5/receipt.json`, SHA-256
`4cba7d4341dba19cff2845a6b425d670d7b5928a98d35ee07ae93366c5b1cd28`.
The hygiene log's 857 count is tracked self-test files; the suite contains
858 ordered entries. It does not indicate a missing check or wrong checkout.
At that failed boundary, CORE, POST and both builds still required a fresh
complete successful run; the unchanged retry below supplies it.

## Complete nine-ID release — PASS

The clean retry at `6c27d4f2dcd7439f47f2e855aea2472c2689a0bb`, based on
published `7a26c2690`, ran from 10:55:46 to 12:03:12 UTC on 2026-09-09.
It passed native type checking/core-unused, the complete command below,
and then `npm run build` for the public artifact:

```sh
node tools/tank-release-check.mjs --ids=t90a_burlak_x,leo2a5_x,leo2a6_x,leclerc_x,amx40_x,merkava3d_x,merkava4_x,leo2a7v_x,leo2_revolution --gate
```

All target gates passed: anatomy freshness, native centering, module
alignment/hits, all 90 selected assets, track duplicates, muzzle bores,
barrel circularity, source fidelity for all nine tanks, strict geometry, stock
contact/clipping/sweep, continuity and fittings. No source was missing and
no floor was relaxed. The complete npm lifecycle passed **278 PRE + 545
CORE + 35 POST = 858 ordered checks**, followed by the normal private build.
Both earlier failure points passed inside this actual run. Public stripping
confirmed 174 procedural playables and zero GLB-sourced playable entries.

Terminal receipt: `.qa-dev/nine-complete-OriY2f/receipt.json`, SHA-256
`1767d3b9e1560aa9cb8aa4c90fba2801a471f95c3937d05ca202f2e25e35bb10`.
All 2,270 tracked runtime/tool/config input files remained at fingerprint
`ed28ba99b9258f47d754aa04b30a338df6944d5c00f0d73f1f310ce2d2d60684`;
all nine source-oracle hashes also stayed unchanged. The earlier full
anatomy update/check and native visual review remain recorded above and in
the two source packets. Subsequent closeout edits are documentation and the
generator-owned ledger timestamp only, not a different tested implementation.

This is the release evidence for the nine-ID checkpoint, not a claim that
all fleet work is finished. Existing 79 full-fleet dimension warnings,
15/120 battle-pacing timeouts and build chunk-size warnings remain. The
Revolution's geometry minimum remains narrowly above 92 (92.031900), not
a perfect-fidelity claim. No production FPS, zero-lag tank switching,
unpublished roller candidate, raw source model or temporary QA artifact is
included in this acceptance. The earlier failed receipts remain failures.
