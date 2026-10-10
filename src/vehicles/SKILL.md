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
The factory core's read-only analyses live beside it (round 46,
`docs/CLEANUP-2026-09-23-structure.md`): `eraSurfaceFrame.ts` (ERA plate frames
and PCA fit), `muzzleCapProfiles.ts` (barrel cap/mouth-edge walkers),
`restPoseContact.ts` (dense-shell floor, rest contact, presentation floor),
`vehicleMarkingSeating.ts` (marking-seat solver and verified-seat replay) and
`vehicleMesh.ts` (mesh guards); shared pack helpers are `profiles/fittingMount.ts`
and `profiles/armorFaceSampling.ts`. Fold a duplicated helper into one of these
owners instead of copying it into a family pack.
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
keep the 6,000-triangle near budget (2026-10-05, tank-accessories lane; the
coarse level runs at about two fifths of it), and preserve the typed
projected-ray index plus gun, turret-sweep, width, and overlap guards. Piece
shapes come from `accessoryKits.ts` on the shared `accessoryPrimitives.ts`
vocabulary (molded boxes, sewn fabric lofts whose straps cinch the fabric,
round members, swept tubes): author every new piece there, drawing all random
values before any `detail` branch, with a coarse level (`detail: 0`) in the
same envelope. Each material family draws its near forms to 28 m, its coarse
forms to 150 m, nothing beyond; the mobile tier builds only the coarse forms.
Cosmetic decor is `combatHitboxRole: 'nonArmor'` so battle distance detail may
drop it; the smoke banks are working equipment in their own resident group,
which also carries the camo-painted hard kit (one `kit` draw per frame). Keep
decor draws per tank at or below the pre-rebuild count
(`decorDrawBudget.selftest.mjs`): webbing (`strap`) and small wooden parts
(`trim`) ride the painted-hardware draw, glass and tyre rubber fold into steel
and hardware, and a new family on a frame needs a reason.
Leaves on vehicles (suit garnish, the per-spec opt-in branch bundles) are spray
cards on the trees lane's atlases through `vehicleFoliage.ts`, never a second
foliage system. The Browning-family roof gun is one construction,
`machineGunGeometry.ts`, shared by `KIT.fittings.pintleMG`, the legacy
`KIT.pintleMG` and the decor roof gun: keep envelopes and muzzle points when
changing it (remote parity). The 20 L jerrycan is one construction too
(`accessoryKits.ts` `jerrycanParts`: decor cans, `KIT.jerryCan`,
`FITTINGS.jerryCans`), and the profile kit's soft stowage, tarp rolls, ammo
cans, shovels and stowage-rack loads use the same primitives inside their old
envelopes and random draws, as do the decor roof furniture (cupolas, hatches,
sights, searchlights, exhausts, the travel lock; `accessoryKits.ts`). Decor probes skip running gear by name
(`isDecorRunningGearName`); track guards and skirts are supports and obstacles. Round 2 of the blind critics
(2026-10-06) set four more rules: loose hard loads carry webbing tie-downs to D-rings and every loose piece a dark
contact pad (`secureLoadParts`, decor casts no shadow); branch bundles lie lashed along a wall or deck, never
upright; nets are knotted on an uneven lattice and billow, sag and pleat between tie points; and the machine gun's can
is issue olive with a belt of dull-brass rounds into a feed tray. Primitives close their shells (lathe and tube caps,
straps sunk into the fabric), because the sealed-hull census counts any inside seen from outside as a hole.
Round 3 (2026-10-07) seats loads on the support they actually have. A load (`isLoadPiece`: cargo, cans, bags, rolls,
drums, wheels) on a roof, bustle, deck or fender takes `supportedSeat`: a 3 x 3 probe grid over its whole footprint
and a fitted support plane. Rigid loads need 3 cm or less of residual and lean at most 12 degrees. Soft loads
(`sagsOnSupport`) take up to 5 cm and sag onto the high points. Loads ride 2-7 degrees off square and a few
centimetres off their station (`transitYaw`). The rear-plate rack slot builds a real cantilever rack under its load
(`rearRackParts`), and the turret-side slot builds welded L-arms with a strap (`sideLedgeParts`). Both drop the
contact pad, which now sits inset inside the footprint so it never shows as a rectangle. Rear-hung pieces hang from
a hook bracket. Commander rings in `KEEP_CLEAR_HULL` stay free for the gun's traverse. `.qa-dev`-style support audits
(rays from inside each placed piece onto the tank's own geometry) measured 46 % of deck-seated loads floating
before and 2 % after, with 441 loads in mid-air before and 18 after.
For player-reported Garage defects, also verify the actual carousel/pedestal
path with its live engine context, AI geometry quality, static batching and
cache return. Bare procedural or Gallery captures are insufficient. Record
the served `application-version`; `origin/main` is not automatically deployed.
The Griffin Viper regression and manual publication check are documented in
`tools/SKILL.md` and `docs/DEPLOYS.md`.
Covered battle loading consumes `createTankSteps` through `fleetFactory.ts`;
the original `createTank` remains synchronous for authoring and Gallery callers.
Construction checkpoints expose no partial visual. Decoration work keeps its
exact RNG/order and stages unpublished groups privately; closing the iterator
must dispose its private geometry and release owning-context shadow-material
registrations. Never yield inside a family builder's temporary spec mutation or
change authored detail to satisfy the loading budget.
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
Camouflage is production's system (fix/camo-defaults, 2026-10-09; the owner on launch day: "why did you break camos?
they only show generic camos now instead of the cool camos we had before", then "yeah our entire camo system before was
better"; R113: "the default camos of our tanks to be what they were before, but just organized a lot better"). Factory
is each tank's stock scheme (`camoPolicy.ts` stockCamoPatternIdFor: its Signature, a named stock or the nation's service
pattern); AUTO draws per (vehicle, biome) from `materials.ts` BIOME_PATTERN; a bot keeps its own paint on 40 % of rolls
(`rosterState.ts` autoCamoIdsForBattle). `camoCatalogProductionIndices.selftest.mjs` holds every tank's selection, stock,
Factory visual and AUTO, and every catalog index, to production (`camoProductionBaseline.json`, afc5018e9). A paint
generated later appends after GT (`AUTHORED_PAINT_IDS_AFTER_GT`), never among the earlier ids. PR #9's national/theatre
AUTO, theatre-matched bots, round-4 Factory coats and painter v2/v3 left with this restore; any change to them needs the
owner's ruling first.
`profiles/russia.ts` owns both the strict T-44/T-54/T-62/T-64 Russian profile
pack and the shared Soviet geometry vocabulary consumed by China, Poland,
T-72, T-80, and Ukraine. Keep its hull, dome, gun, ERA, Shtora, mudguard, and
ride-height helpers behind capability-specific ports; do not replace them with
one oversized builder contract or an eager fleet dependency.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
A new whole-fleet check is a fleet audit (`{ check(id, tank), finish() }`) added to the fleet pass whose build it
reads (`fleetPassDefault`, `fleetPassHigh`, `fleetPassLow`; rules in `fleetPass.test-support.mjs`), not another
receipt that rebuilds all 217 tanks: the build is nearly all of a sweep's cost.
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
Battle and Garage builds (`batchStatic`) fold every contiguous run of the final
coplanar depth-layer order that shares an owner, material, vertex layout, raster
flags, LOD switch, near-hull shadow and distance-detail membership into one draw
(`staticDrawMerge.ts`, P21; at most 16,384 vertices per merged draw); unmerged
meshes keep their layer, so no coplanar winner changes. A folded source keeps its name, userData, layer, geometry and
frame chain in the merged draw's side table (`staticMergeParts.ts`): resolve a
name with `findStaticMergePart`, a raycast face with `staticMergePartForFace`,
and replay per-mesh measurements through `staticMergePartMatrixWorld` (rest
contact, the presentation floor and showroom framing do). A runtime system that
edits a vehicle buffer in place must be pinned in the factory's merge options
(`ownsGeometry`), or the merge folds it; running gear never folds.
Only parts already at their owner's frame fold by default, so every vertex byte
is unchanged; `staticDrawMerge: 'translations'` also bakes pure translations but
moved up to 1,615 px in the P21 float-target captures (float rounding of baked
positions), so it stays an opt-in. `?staticmerge=off|translations` switches the
mode on one build for probes.
Destroyed-only char and ember atlases must remain demand-owned. The battle warm
pipeline prepares fielded variants before rollout, while `setDestroyed()` is
the correctness fallback for Studio and diagnostic callers that skip warming;
never restore eager wreck-map creation to ordinary vehicle construction.
Camouflaged roof fittings, sights, smoke dispensers, stowage, and machine guns
must use `P.addEquipment()` so they never expand the main armor shell. Offensive
rocket/missile launchers are damageable: scope their housings, canisters and
supports with `weaponAssembly()` from `profiles/weaponStock.ts`. Regenerate
anatomy to publish their exact external hit surfaces and module links. Keep
inter-pod gaps open, retain native yaw/pitch ownership, and test direct/blast
damage with one module roll per shot. Do not put a broad armor box over a rack. Structural cupolas use
`P.addCupola()` (or an explicitly structural hull/turret add) and remain hittable.

Canonical running gear resolves deterministic mechanical families through
`wheelPatterns.ts`, `trackPatterns.ts`, and `suspensionPatterns.ts`. Road-wheel
faces are standardized by nation (owner 2026-09-22): `nationWheelSets.ts` is the
one table of donor tanks, per-nation rules and per-hull exceptions, and
`nationWheelConstructions.ts` draws a donor's face at any hull's radius, never
narrower than the hull's authored tire width (`wheelW`) nor wider than its
standard cap envelope (1.48 × that width) or 0.90 × the track width, whichever
is larger, and never outside 0.85–1.15 of the donor's proportion (round 40;
the fleet audit flags a hull whose bounds ask for more). A donor hull keeps its own wheel
code; every other hull's authored wheel solids, `wheelFaceLayers` and post-build
`addRoadWheelLayer` dressing are not drawn, and its authored `suspensionDimensions`
(measured against the wheel it no longer carries) give way to the fleet arm,
which seats itself against the wheel it actually carries. Period (ww2)
hulls keep their constructions. A profile may restate, never contradict, its
nation wheel pattern. Keep road wheels, return rollers, idlers, and sprockets on
that one suspension-driven assembly. Running-gear finish (owner 2026-09-22, `runningGearFinish.ts`): one table says
what every gear role may be — tires and insets the fleet rubber, every painted
face (dishes, hub caps, rims, roller discs, end-wheel bodies) the hull's one
scheme `wheelPaint` material, hardware dark steel. `normalizeTankAppearance`
re-seats any clone or fitting paint onto the hull paint and undoes in-place
retints; `wheelQuality.ts` audits the table on every hull. Never author a
per-hull wheel hex, clone the wheel paint, or retint it in a profile. Run the three focused
pattern checks, `nationWheelSets.selftest.mjs`, `fleetPassHigh.selftest.mjs` (the wheel-quality audit) and
`node tools/wheel-review.mjs --all --gate` after any wheel or running-gear
change; `node tools/wheel-inventory.mjs --all` lists every hull's wheel.
Material roles (owner 2026-09-25, FSP-06): camouflage belongs to painted bodywork — hull, turret, guards,
bins, cases, mounts and their hardware plates — through the camo buckets (`hull*`/`turret*`/`*Detail`/`*Equipment`);
everything a crew does not spray takes its own bucket: `hullCloth`/`turretCloth` (OD canvas: tarps, packs,
bedrolls, mantlet boots via `gunMountCanvasSkin`), `hullCanvasPale`/`turretCanvasPale` (sand-khaki desert / IDF
kit), `hullFittingPaint`/`turretFittingPaint` (solid scheme paint for small painted steel such as jerry cans, which
a hull-scale camouflage tile would splash), `hullRubber` (flaps, tires), `hullWood`, `hullBark`/`turretBark` (round 4:
unditching logs, `barkLog({ relief: 2, tinted: true })` in the vertex-coloured log wood), `hullGlass`/`turretGlass`
(lenses, vision blocks), `hullDark`/`turretDark` (gunmetal: tow cables, coils, whip rods and antenna bases, MG
bodies, exhaust pipes, tool heads). Parts authored inside an ERA cluster always take the camouflaged external-armor
bucket (they collapse with the brick) — emit hardware that must stay dark after the cluster closes. Census with
`node tools/material-roles-audit.mjs [--ids=… | --all] --md=<path>` (part census hook `partCensus`, lexical evidence
per part, per-tank role and material counts); the audit and its verdicts are
[`docs/tank-generation/material-roles-audit-20260925.md`](../../docs/tank-generation/material-roles-audit-20260925.md).
Read actual assembled wheel centers: the ground-seating law can override an
authored `wheelY`. Source-backed track courses must fit finite wheel stock,
including the central drum, tread rings and tooth crowns at their actual axial
positions. A smaller `trackR` can clear the hull while burying the band inside
a solid rim. Use source-sized shoe components, preserve circular hinge pins,
and verify loaded contact and end-wheel engagement in both HIGH and LOW through
motion before accepting a course change.

Physical camouflage suits use `addVehicleGhillieSuit(P)` from
`ghillieSuit.ts`. Add a vehicle-specific registry entry with fitted top, side,
and end panels; preserve explicit gun, sight, hatch, exhaust, and service
openings; keep the hem above the smart-track corridor; and attach hull/turret
meshes to their canonical owner rigs. A suit must be a detailed suspended
equipment mesh with a visible air layer, deterministic connected netting, and
an identity-appropriate treatment (`leafy`, `nakidka`, or `ulcans`)—never a
paint alias, generic outer box, or inherited family blanket. The garnish is
spray cards seated stem-first on the carrier (`foliageKind`: a species atlas of
the trees lane, or the painted multispectral garnish for `ulcans`/`nakidka`),
kept whole on the net, off every opening and inside the certified width; suit
cloth and garnish clone the canvas through `cloneVehicleMaterial(source,
configure)` (a plain `Material.clone()` lights with every cascade's sun at once).
Both meshes are `continuityRole: 'open-lattice'`. Verify additions with
`ghillieSuit.selftest.mjs`, `accessoryMaterials.selftest.mjs`, standard
front/quarter/side/top views, and the normal anatomy/release sequence below.
Round 3 of the critics (2026-10-07) set the garnish and drape rules: garnish goes in clumps on a seeded point process
(`placeGarnishClumps`: one to nine sprays a clump, irregular gaps, never one spray per lattice cell), sprays fan out of
one tuck point and stand out of the net, folded along their stems at HIGH (`FoliageCard.fold`; LOW flattens the same
cards), keep a margin round every opening (`garnishOpeningMarginM`), and stay inside a suit's `maxHalfWidth`; a hull
deck under the turret and gun sweep carries garnish only in a low band along its edges (`garnishEdgeBandM`,
`garnishRiseM`), never on the glacis or in the driver's view (`foliageExclude`). The cloth lies on seeded noise
(swell, wrinkles, gathered folds, tie-downs) that only lifts it off its carrier; a flank hem is tied at irregular points
drawn per side; a flank drape that would end in a free top edge rolls over into its roof net (`SidePanel.shoulder`).
Vehicle foliage atlases are 512 px with their own coverage-preserving mip chain (lighting.ts builds that chain only for
canvas images). Decor branch bundles and the decor whip stay inside their old near-level triangle counts (the decor's
first rows; the 6,000-triangle budget is full on several hulls); whips, fitting and decor, are one bowed construction
(`whipAntennaParts`) whose foot and tip height are the straight rod's.
The owner's fleet field nets (2026-10-09) are registry rows in `ghillieFleetSuits.ts`, one fitted entry per vehicle,
called from each family builder (`addVehicleGhillieSuit` is idempotent per build). They use the builder's opt-in
keep-outs: `yFromArmour`/`clipToArmour` lay a roof or deck net on the armour and end it at the armour's edges (it passes
under a raised frame, is cut round anything standing taller than `riseLimitM`, and never falls onto the running gear),
`autoOpeningsM` opens every lens, hatch lid and cupola and slots the net ahead of each lens, `SidePanel.cuts` keep
drapes off dischargers, lights and exhausts (from the cut's top down to the hem), and `fieldClearanceM` keeps the whole
suit clear of the turret's traverse both ways (the turret's swept body by radius, lowest to highest, its hollow
included), of the main gun's swept volume (a lopsided box by station at every yaw that brings it across a point, with the
per-yaw depression curves; flat cloth only where the bare gun already comes to within 4 cm of its own deck), of lens
views (garnish always, cloth where it stands off the armour) and of smoke lines (each bank as `alignSmokeBanks` will
turn it). A hull drape whose roll over the deck's edge would lie in a clearance is tied lower on its wall; a drape
station with no roof net above it and no armour beside it hangs nothing. The decor holds such a suit to its clearances
too: loads stay out of its drapes and from under a turret load's swing (`suit-drape`, `hull-suit`), what it draws up
over its loads is re-tested (`GHILLIE_FIELD_OK`, ghillieDrape.ts; the cards ride the net's lift vertex by vertex), and
its own smoke banks cut their lines of fire through the suit (`clearGhillieForSmoke`). New entries still need explicit
openings for sight heads without glass and exhaust keep-outs.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
For source-backed creation, explicit family derivation or Gallery-markup repair,
start with [the tank-generation handbook](../../docs/tank-generation/README.md)
and its repo-local procedure. It consolidates intake decisions, source-only
registration, negative-space construction, current tool coverage, strict gates,
reusable prompts and handoffs. Its chronology notes distinguish current
source-X requirements from historical oracle-repair recipes and scoped as-is
publication exceptions; a published model is not necessarily qualified.

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
Before fleet-wide generation, check each added ID's explicit surface anchor in
`vehicleMarkings.ts`, actual solved insignia/designation visibility in HIGH and
LOW, core module ownership (including optics), and internal-layout confidence
category. A generated marking record with `seats: []` is still missing visible
markings; a generator's record count alone does not qualify that vehicle.

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
Keep the Strv 103 base build in `profiles/casemate.ts`; its strict builder,
loft, material, and running-gear contracts must preserve the authored station
order and fixed-hull ownership, and Swedish callers depend only on that narrow
Strv-compatible subset. The Jagdtiger, JPz E 100, Sturmtiger, T95, ISU-152 and
ISU-122S builds and the `profiles/ww2.ts` pack left with their archived hulls
on 2026-09-25 (owner: no archived WWII / casemate tanks outside production).
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
demand-loaded. The registry holds that generated metadata on every path
(`modern1.ts`/`modern2.ts` import it); their live `MODERN1_SPECS` /
`MODERN2_SPECS` tables are only the generator's source, never registered.
Keep the Type 10 / Type 10B trunnion, muzzle, throat, and mantlet-fit receipts
in the pure `profiles/type10GunSeat.ts` boundary; geometry builders consume the
datums but do not redefine them.
Do not add regional fleet bundle modules. Browser acquisition maps exact IDs to
typed family loaders through `fleetManifest.ts` and `fleetFactory.ts`; full
fleet tools use `tankFactory.ts`. Both paths must convert family profiles with
`profileBuilderAdapter.ts`; do not duplicate custom/donor/generic dispatch.
Every facade registers specs through the one ordered `fleetRegistration.ts`
(spec packs in donor order, then the registration passes): `fleetFactory.ts`,
the spec-only `authorityFleet.ts` (the host Worker and the Node match service;
`ensureAuthorityFleet(roster)` loads only the roster's calibration groups) and
`tankFactory.ts` (whose builder packs keep the tools' historical catalog
order). Add a spec pack to `fleetRegistration.ts`, never to one facade;
`fleetParity.selftest.mjs` digests every spec as each facade finalizes it.
After this sequence passes, commit each tank edit atomically, integrate it from
an isolated clean worktree onto the current `origin/main`, push `HEAD:main`,
and report the resulting main hash. Never push a failing or partially verified
tank edit.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Vehicle material clones (2026-10-04, the vehicle-look lane): `Material.clone()` keeps none of a vehicle material's
cascade registration — three resets a standard material's `defines` and never copies `onBeforeCompile` or
`customProgramCacheKey` — so a plain clone lights with every cascade's sun at once (about four times the sun) and writes
no sun state or vehicle tag for the aerial pass. Clone through `cloneVehicleMaterial(source)` (materials.ts), which
re-registers the clone exactly as its source and keeps its shader switches (`COT_WHEEL_PAINT_READABILITY`);
`vehicleMaterialClone.selftest.mjs` pins the running-gear clones (shoes, isolated gear roles, band finishes). About
forty profile-pack clones still re-hook by hand (`rehook`, `'veh-ambient-floor-v2'`) and predate it.
The field camouflages (`catalogCamoPainter.ts` paintField) and the digital patterns paint production's 2 m tile
(fix/camo-defaults, 2026-10-09: the v2/v3 patch fields, 4 m wide tiles, digital clusters, per-triangle box projection,
bore-wrapped gun UVs and camouflage panels are retired with the rest of PR #9's camouflage system).
Weathering marks in the plate painter (`materialPainter.ts`) are stains, so they multiply into the paint. Since
2026-10-06 the rust weeps multiply a warm brown. The old 1.4-3 px orange stroke laid over the paint lit up on black
camo bands as "an unresolved texture seam", repeating with the 2 m tile (wave 165, Challenger 1). Never paint a bright,
narrow, saturated mark over the paint. A new weathering mark multiplies (or darkens), keeps a core of at least 2.5 mm,
and falls off softly at its sides.
Field wear (2026-10-07/08): the round 2-4 wear (a height-graded dust, mud and soot shader term behind `COT_FIELD_WEAR`,
baked edge chips in the plate painter, a decor dust ramp) was stripped before batch 5: blind waves 240 and 264 scored
it flat up close ("a gravity-blind overlay"), although wave 265 found it helped at battle distance. The redesign
(per-material surfaces, dust and wet earth graded up from the running gear in the map's soil colour, wear where use puts
it, contact occlusion, readable at 15-60 m, priced under cost rule v3) lands on its own wave; the stripped code is at
95afc36d6 for reference.
The shared checkout often contains active tank-generation WIP. Never stage
builders, profiles, icons, GLBs, or generated geometry ledgers by directory.
Chassis closure (FSP-05, 2026-09-25): a mirrored `for s of [-1, 1]` slab, a
ring listed rear row first, a wedge whose top sits below its floor and a
self-intersecting hexahedron all ship inside-out and open the hull to the chase
camera; bind slabs through `orientedSlab`, hand twisted rings to `convexSlab`,
and prove the result with `node tools/tank-sealed-check.mjs --ids=<id>
--ledger=docs/geometry-gate/sealed.json` (0 open views) — the audit and the
per-family causes are in `docs/tank-generation/chassis-closure-audit-20260925.md`.
