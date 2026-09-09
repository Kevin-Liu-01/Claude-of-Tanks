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

## Release boundary

One fresh composed nine-ID gate will supersede the two failed full-suite
runs. The required anatomy update/check, full regression suite and private
build remain mandatory. Diagnostic tail runs are only early blocker checks;
they are not a substitute for that complete release.
