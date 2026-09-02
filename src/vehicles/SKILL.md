---
name: src-vehicles-skill
description: Work on first-party procedural tank specs, builders, materials, profiles, ordering, and asset provenance.
---

# claude-of-tanks / src/vehicles

## Purpose
<!-- agent-docs:fill:purpose -->
Own the playable fleet's canonical specs, first-party visuals, armor metadata,
materials, and garage ordering.

## Mental model & key files
<!-- agent-docs:fill:model -->
`specs.ts` is the registry, `fleetManifest.ts` and `fleetFactory.ts` own the
typed browser demand graph, `tankFactory.ts` builds/synchronizes eager audit visuals,
`profiles/` owns authored families, `taxonomy.ts` owns the strict era/role
vocabulary and complete saved-fleet assignment, `tier.ts` and `fleetOrder.ts`
own remaining metadata, `tankAssets.ts` owns UI asset mappings, and
`turretBarrelCircularity.ts` measures actual rig-local gun sections for the
fleet release gate.
`internalAnatomyVisuals.ts` is the strict shared geometry owner for Gallery and
killcam module, crew, and drivetrain presentation; keep both consumers on its
volume and resource-lifetime contracts.
The Japanese, Swedish, Italian, Chinese, T-80-family, Sheridan, Soviet
heavy-family, shared AFV, and Polish visual deltas live in strict
`profiles/japan.ts`, `profiles/sweden.ts`, `profiles/italy.ts`, and
`profiles/china.ts` packs plus `profiles/t80.ts` and `profiles/sheridan.ts`,
plus `profiles/soviet-heavy.ts`, `profiles/afvFamily.ts`, `profiles/poland.ts`,
and `profiles/t72.ts`, while the AMX-40 visual build lives in strict
`france.ts`; all eleven use narrow
procedural-builder ports. Preserve their
demand-loaded family boundaries and complete donor geometry.
`profiles/kit.ts` is the strict shared owner for generic hull/turret profiles,
donor dispatch, muzzle closures, and deterministic exterior fittings. Extend
its validated builder, profile, and fitting-option contracts instead of
reintroducing unchecked family-local copies.
`modern3.ts` owns the strict, demand-loaded Chieftain, K2/K1A1, Type 10,
Bradley/BMP, Puma, Type 89, and Ariete geometry pack. Family adapters that
reuse those donors must declare the complete runtime builder surface they
forward; do not weaken the shared port or bridge through untyped casts.
`modern2.ts` owns the strict Leopard 2A4, T-80U, Leclerc, Type 99A,
Leopard 1A5, MBT-70, and T-14 spec/geometry pack. Keep its mutable armor-lift
operation explicit, its variable loft/scale adapters narrow, and its runtime
registration idempotent.
`decorations.ts` owns deterministic cosmetic-kit construction and exact
surface seating. Keep decoration geometry merged by material and owner frame,
retain the 3,000-triangle budget and 150 m LOD, and preserve the typed
projected-ray index plus gun, turret-sweep, width, and overlap guards.
`profiles/ukraine.ts` owns the strict Ukrainian T-64BV, T-80BV, T-80U Kursk,
Oplot-M, and field-caged M1A1 builds. Keep its surface-seated ERA, cast-dome
profiles, welded-face probes, cage stations, and mutable donor-id handoff behind
the narrow Ukrainian builder port; do not move these vehicles back through an
eager or untyped fleet path.
`materials.ts` is the strict shared owner for camouflage painting, shared
texture residency and promotion, semantic vehicle materials, decals, ambient
shadow-floor hooks, and destroyed-vehicle burn resources. Preserve its painter
constants, deterministic RNG order, shader strings, and demand-owned wreck
atlases; extend its local cache and repaint-role contracts instead of casting
through an untyped material bag.
`profiles/ww2.ts` owns the strict original and recovered WWII/inter-war profile
pack. Preserve its mirror-safe slab winding, family-local builder port, seeded
fittings, and exact demand-loaded `ww2` registration boundary.
`profiles/russia.ts` owns both the strict T-44/T-54/T-62/T-64 Russian profile
pack and the shared Soviet geometry vocabulary consumed by China, Poland,
T-72, T-80, and Ukraine. Keep its hull, dome, gun, ERA, Shtora, mudguard, and
ride-height helpers behind capability-specific ports; do not replace them with
one oversized builder contract or an eager fleet dependency.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
All playables use first-party runtime geometry; source GLBs are comparison-only.
Every first-party procedural vehicle is created by Kevin B. Liu and must keep
the canonical named authorship record from `src/authorship.ts`; AI systems are
development tools, not model authors. Preserve third-party reference credits
in `docs/ATTRIBUTION.md`.
Keep turret/gun parenting correct, derive track hit geometry from the running
gear profile, and land per-tank changes atomically with audits. Every playable
tank carries the core combat modules; `combatAnatomy.ts` adds only
gameplay-backed vehicle-specific systems (autoloader, IFV feed, missile rack)
and calibrates armor/module/crew coordinates to checked geometry receipts.
Procedural low-polygon shadow hulls are presentation-invisible proxies: route
them with `markShadowOnly()` rather than relying on `colorWrite: false`, which
still incurs a forward submission in Three.js.
Destroyed-only char and ember atlases must remain demand-owned. The battle warm
pipeline prepares fielded variants before rollout, while `setDestroyed()` is
the correctness fallback for Studio and diagnostic callers that skip warming;
never restore eager wreck-map creation to ordinary vehicle construction.
Camouflaged roof fittings, sights, launchers, stowage, and machine guns must use
`P.addEquipment()` so they never expand armor hitboxes. Structural cupolas use
`P.addCupola()` (or an explicitly structural hull/turret add) and remain hittable.

Canonical running gear resolves deterministic mechanical families through
`wheelPatterns.ts`, `trackPatterns.ts`, and `suspensionPatterns.ts`. Keep road
wheels, return rollers, idlers, and sprockets on that one suspension-driven
assembly; use explicit pattern overrides only for documented vehicle geometry
and `wheelFaceLayers` for source-measured detail that must move with suspension.
Painted faces use the camouflage-aware `wheelPaint` role, while tires/insets
remain neutral. Run the three focused pattern checks plus
`wheelQuality.selftest.mjs` after any wheel or running-gear change.

Physical camouflage suits use `addVehicleGhillieSuit(P)` from
`ghillieSuit.ts`. Add a vehicle-specific registry entry with fitted top, side,
and end panels; preserve explicit gun, sight, hatch, exhaust, and service
openings; keep the hem above the smart-track corridor; and attach hull/turret
meshes to their canonical owner rigs. A suit must be a detailed suspended
equipment mesh with a visible air layer, deterministic connected netting, and
an identity-appropriate treatment (`leafy`, `nakidka`, or `ulcans`)—never a
paint alias, generic outer box, or inherited family blanket. Verify additions
with `ghillieSuit.selftest.mjs`, standard front/quarter/side/top views, and the
normal anatomy/release sequence below.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read current program state and the relevant family profile, inspect standard
side/top views, run focused geometry gates, then fleet/family/assets checks.
For a new tank or a ground-up rebuild backed by an owner-supplied reference,
use the exemplar quality bar: at least 92/100 overall and 92/100 in every
registered silhouette view, plus source/spec dimensions within three percent.
Inspect front, quarter, side, rear, and top relationships for the primary hull,
turret, gun, fenders, skirts, and running gear; an attachment census or a score
in the 80s is not evidence of high fidelity. Treat AbramsX, Challenger 2, and
Leclerc as the minimum visual-complexity and geometric-coherence exemplars.
Fused reference topology may disable dishonest component masks, but it never
waives whole-silhouette, track-profile, attachment, or multi-view inspection.
For every added or changed playable tank, run this required sequence:

1. `npm run tank:anatomy:update` — remeasure the complete playable fleet and
   regenerate every tank's armor, module, and crew cards.
2. `npm run tank:anatomy:check` — fail on stale receipts or visual drift.
3. `npm run tank:release:check -- --ids=<changed ids> --gate` — assets,
   tracks, muzzle, geometry, full tests and private build.

Never hand-edit `combatAnatomyCalibrations.ts` or the generated technical PNGs.
The authored receipt boundaries are `combatAnatomyCalibrationRegistry.ts`,
`combatAnatomyCalibrationLoader.ts`, `vehicleMarkingSeatRegistry.ts`, and
`vehicleMarkingSeatLoader.ts`. Keep grouped `*.generated.ts` payloads owned by
their generators; browser consumers must acquire receipts through the typed
loaders, while fleet-wide release tools use the eager typed `tankFactory.ts`
facade. Player boot must continue through the demand-loaded `fleetFactory.ts`.
Keep semantic finish policy in `appearanceAudit.ts`: builders tag materials,
while that module alone normalizes working-gear colors and audits armor/gear
role separation. Do not repair a palette issue by stripping geometry or by
repainting untagged armor.
Keep running-gear release receipt validation in `wheelQuality.ts`; the browser
factory may emit metadata, but must not duplicate the audit's pattern,
suspension-count, clearance, or material-role rules.
Keep shared armor, shell, module, and crew constructors in the pure
`specHelpers.ts` boundary. It must not import fleet registries, builders,
Three.js, or browser APIs.
Keep British family geometry and the cross-family Centurion base in
`profiles/uk.ts`; Swedish callers satisfy its narrow Centurion port rather than
depending on the full British builder, and kit helpers remain direct static
bindings instead of a dynamic proxy.
Keep the complete Challenger family in `profiles/challenger.ts`; extend the
British builder contract only for Challenger running-gear metadata, ERA,
equipment, and post-assembly behavior, and keep loft/receipt structures typed
at their authored owner.
Keep Ariete, Leclerc, Leclerc XLR, AMX 56, T-80U, Type 90, Type 74, and AMX-30
family geometry in `profiles/misc.ts`. Its typed builder port owns shared
running-gear layers, ERA placement, gun-frame geometry, and post-assembly
articulation; Japanese Type 90 derivatives must explicitly satisfy that donor
contract.
Keep the Pershing, Patton, M48, M60, and M60A2 family in
`profiles/patton.ts`. Preserve its asymmetric cast-loft sections, roof fitting
inventories, low-profile transformation contract, M60 surface-aligned ERA,
and explicit invalid-geometry guards behind the narrow Patton builder port.
Keep Strv 103B and the Jagdtiger, JPz E 100, Sturmtiger, T95, ISU-152, and
ISU-122S fixed-mount geometry in `profiles/casemate.ts`. Its strict builder,
loft, corridor, material, and running-gear contracts must preserve the authored
station order and fixed-hull ownership; Swedish callers depend only on the
narrow Strv-compatible subset.
Use `specContracts.ts` for boot-light fleet combat rows. Family packs may add
identity-specific metadata, but must satisfy the shared mobility, gun, armor,
dimensions, and visual contract before mutating the legacy registry. Variant
registration may clone and mutate a donor only through a bounded delta type;
do not replace that with an unchecked options bag.
Bind legacy spec/source/ID dictionaries and perform donor cloning, inherited
silhouette cleanup, armor scaling, and idempotent registration through
`fleetSpecRegistry.ts`; nation modules own only their explicit deltas.
Keep `modern1Specs.generated.ts` and `modern2Specs.generated.ts` generator-owned;
they expose boot-safe metadata while their authored visual builders remain
demand-loaded.
Keep the Type 10 / Type 10B trunnion, muzzle, throat, and mantlet-fit receipts
in the pure `profiles/type10GunSeat.ts` boundary; geometry builders consume the
datums but do not redefine them.
Do not add regional fleet bundle modules. Browser acquisition maps exact IDs to
typed family loaders through `fleetManifest.ts` and `fleetFactory.ts`; full
fleet tools use `tankFactory.ts`. Both paths must convert family profiles with
`profileBuilderAdapter.ts`; do not duplicate custom/donor/generic dispatch.
After this sequence passes, commit each tank edit atomically, integrate it from
an isolated clean worktree onto the current `origin/main`, push `HEAD:main`,
and report the resulting main hash. Never push a failing or partially verified
tank edit.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The shared checkout often contains active tank-generation WIP. Never stage
builders, profiles, icons, GLBs, or generated geometry ledgers by directory.
