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
`specs.js` is the registry, `tankFactory.js` builds/synchronizes visuals,
`profiles/` owns authored families, `taxonomy.ts` owns the strict era/role
vocabulary and complete saved-fleet assignment, `tier.js` and `fleetOrder.js`
own remaining metadata, and `tankAssets.js` owns UI asset mappings.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
All playables use first-party runtime geometry; source GLBs are comparison-only.
Every first-party procedural vehicle is created by Kevin B. Liu and must keep
the canonical named authorship record from `src/authorship.js`; AI systems are
development tools, not model authors. Preserve third-party reference credits
in `docs/ATTRIBUTION.md`.
Keep turret/gun parenting correct, derive track hit geometry from the running
gear profile, and land per-tank changes atomically with audits. Every playable
tank carries the core combat modules; `combatAnatomy.js` adds only
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

Canonical running gear resolves a deterministic family motif through
`wheelPatterns.js`. Keep road wheels, return rollers, idlers, and sprockets on
that one suspension-driven assembly; use `wheelPattern` only for a documented
vehicle override and `wheelFaceLayers` for source-measured detail that must
move with suspension. Painted faces use the camouflage-aware `wheelPaint`
role, while tires/insets remain neutral. Run `wheelQuality.selftest.mjs` after
any wheel or running-gear change to certify every selectable tank.

Physical camouflage suits use `addVehicleGhillieSuit(P)` from
`ghillieSuit.js`. Add a vehicle-specific registry entry with fitted top, side,
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

Never hand-edit `combatAnatomyCalibrations.js` or the generated technical PNGs.
After this sequence passes, commit each tank edit atomically, integrate it from
an isolated clean worktree onto the current `origin/main`, push `HEAD:main`,
and report the resulting main hash. Never push a failing or partially verified
tank edit.

## Gotchas
<!-- agent-docs:fill:gotchas -->
The shared checkout often contains active tank-generation WIP. Never stage
builders, profiles, icons, GLBs, or generated geometry ledgers by directory.
