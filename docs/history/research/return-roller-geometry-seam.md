# Explicit native return-roller geometry option

Status: non-activated factory capability. No playable profile supplies the
new field; fitted per-vehicle opt-ins still need actual visible support,
station/shaft clearance, native views and the normal anatomy/release gates.

`RunningGearConfig.returnRollerGeometry` accepts one already-sized, closed,
X-axis rotor buffer with material groups `[rubber, painted wheel metal]`.
The factory adopts that buffer exactly once into its existing animated
`rollerEntries` / `made` assembly as `gearReturnRollerRotors`. Its materials
are exactly `[mats.rubber, mats.wheels]`; no object-level appearance role can
override the two finishes. The option requires explicit roller stations and
does not apply the old width scale a second time. Omission retains the old
tire/dish construction block and every existing default.

The caller invokes `efficientReturnRoller()` once and keeps the returned
spindle for its own measured, finite hull-to-hub mount. Core owns the rotor;
the model helper owns the spindle. Both must remain real submitted stock at
far LOD. Keep the finite mount named `gearReturnRollerSpindles`, preserve its
native running-gear owner/metadata, and count both rotor and spindle instances
in the 160 HIGH / 80 LOW complete-roller budget. The option adds no roller
stations and never changes a rollerless vehicle by default.

The shared test-only `returnRollerContactTest.mjs` now prefers the complete
rotor name and falls back to legacy tires. It still measures actual eligible
band/near/far-shoe surfaces with the same fixed 6 mm support-gap gate. This
name adaptation alone is not a new vehicle contact result.

## Focused proof

The focused selftest uses actual `KIT.buildRunningGear` assemblies in both
qualities, complete material groups, exact adopted buffer identity, unchanged
width, real left/right native spin and terrain-conformance calls, exact
unchanged non-roller buffers, and exact-once geometry/instance disposal.
It also exercises the actual full A6M X factory with a **test-only** option
wrapper, preserving all other model stock, real material identities and hull
ownership at 15 / 75 / 200 m LOD choices. That lifecycle fixture is not an
activated A6M change or an assertion that its inherited stations fit a new
roller. The local fixture's full rotor-plus-shaft budget remains 160/80.

A separate prechange/current comparison constructs `m1a2`, `leo2a5`,
`leo2a6m_x`, and rollerless `t62mv1_x` in HIGH/LOW at three actual pose/track
scroll states. It hashes all actual geometry attributes, indices, groups,
draw ranges, material colors/roles, object/parent transforms, instance buffers
and counts. The baseline was collected before the core edit on published
`2dbddba5b` (core SHA256
`3b32df86cb9b1197f2f275b41c08880920df92dfe6c6260ecbd1dde6e3b82ee3`).
This is Node-native procedural construction and render-state evidence, not
GPU screenshots or a Gallery switching-latency measurement.

Prechange receipt `.qa-dev/roller-seam-before-0hnegY/receipt.json` passes with
unchanged captured inputs. The incomplete-state `lNuXPT` attempt fails and is
retained; `leVhVT` is superseded because its QA driver used ignored `left/right`
scroll keys instead of the actual `l/r` fields. The initial `CN3KfY` test
failed because only one fixture received appearance normalization; both now
undergo the same public normalizer. The next `o6tcT2` attempt passes focused,
actual default comparison, pure primitive and outset controls but fails at a
nonexistent `wheelPatterns.selftest.mjs` command. The real pattern checks are
`trackPatterns`, `suspensionPatterns`, and `wheelQuality`; no real gate was
removed.

Final `.qa-dev/roller-seam-after-nOcOzz/receipt.json` passes all eight checks
with unchanged captured inputs: the 70-phase focused native assembly test,
the eight model/quality three-pose exact default comparisons, pure primitive,
original return-outset preservation, full TypeScript, track patterns,
suspension patterns and wheel quality. The last three exercise all 174
unchanged playable defaults; all 12 wheel/track families and five suspension
families remain represented. No actual profile opts in during ordinary
construction. The contact sampler name adaptation is ready for the separate
per-vehicle contact qualification; this checkpoint does not claim those
unrun fit gates passed.

## Group-aware quality interoperability

A later Merkava trial exposed an inherited checker assumption: it counted
separate tire/dish objects, so a single closed two-material rotor was reported
as single-material when its real shaft used the model-specific name
`gearMerkavaReturnSpindles`. This was a checker mismatch, not authority to
delete or hide the shaft. The factory seam was held from publication.

`wheelQuality.ts` now recognizes only the exact composite rotor name and
requires two distinct actual rubber/`wheelPaint` materials, fully covering
positive nonoverlapping triangle groups 0/1, nonzero draw/instance counts,
visible/color-writing materials, and no uniform object-level finish override.
Its two counted parts are actual rendered finish regions, not invented mesh
instances. Malformed composite stock gets an explicit issue even if another
named spindle is present; the old missing-dish single-material rejection stays.

Final follow-up `.qa-dev/roller-seam-after-AVs8KY/receipt.json` passes all
eight checks with unchanged inputs. The focused test now has 32 rejecting
controls, including missing/overlapping/unpainted/undrawn groups, an invisible
rubber material, a uniform-role override, and the preserved legacy missing-dish
failure. Both actual factory qualities pass the full wheel audit. All 174
unchanged default models, types and original exact-pose comparisons also pass.
No new vehicle fit, rendered pixel review or profile activation is claimed.
