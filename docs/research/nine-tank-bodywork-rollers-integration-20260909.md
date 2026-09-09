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
`731bbf3cf` and `457bc1863` were then integrated as `1f49d3dd7` and
`7a8a3624a`. Compared with the preflight candidate, only these three test
files changed under `src/`; tank runtime and generated assets stayed exact.

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

## Release boundary

One fresh composed nine-ID gate will supersede the two failed full-suite
runs. The required anatomy update/check, full regression suite and private
build remain mandatory. Diagnostic tail runs are only early blocker checks;
they are not a substitute for that complete release.
