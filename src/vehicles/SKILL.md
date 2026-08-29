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
`specs.js` is the registry, `fleetManifest.ts` and `fleetFactory.ts` own the
typed browser demand graph, `tankFactory.ts` builds/synchronizes eager audit visuals,
`profiles/` owns authored families, `taxonomy.ts` owns the strict era/role
vocabulary and complete saved-fleet assignment, `tier.ts` and `fleetOrder.ts`
own remaining metadata, `tankAssets.ts` owns UI asset mappings, and
`turretBarrelCircularity.ts` measures actual rig-local gun sections for the
fleet release gate.
`internalAnatomyVisuals.ts` is the strict shared geometry owner for Gallery and
killcam module, crew, and drivetrain presentation; keep both consumers on its
volume and resource-lifetime contracts.
The Japanese, Swedish, Italian, Chinese, T-80-family, and Sheridan visual
deltas live in strict
`profiles/japan.ts`, `profiles/sweden.ts`, `profiles/italy.ts`, and
`profiles/china.ts` packs plus `profiles/t80.ts` and `profiles/sheridan.ts`,
while the AMX-40 visual build lives in strict `france.ts`; all seven use
narrow procedural-builder ports. Preserve their demand-loaded family
boundaries and complete donor geometry.

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
For every added or changed playable tank, run this required sequence:

1. `npm run tank:anatomy:update` — remeasure the complete playable fleet and
   regenerate every tank's hit-zone, armor and systems/crew cards.
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
