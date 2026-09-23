# Repository cleanup — phase 2, source structure (round 46, 2026-09-23)

Executes the phase-2 structural items of [`CLEANUP-2026-09-22.md`](CLEANUP-2026-09-22.md)
§4.1–§4.4 (owner approved the plan as written). Record deletions, the Python
pipeline, marketing generators and research notes are a separate lane. Base:
`origin/main` f152000f6 (deploy 65). Branch: `r46-cleanup-structure`.

Proof standard for every step: every saved and manifest tank (230 ids) builds
byte-identically through the eager `tankFactory.ts` facade at HIGH, LOW and the
battle path (HIGH + `batchStatic` + `battleDetailLod`), measured by a
material-inclusive whole-model digest (geometry attribute bytes, materials,
textures, transforms, LOD/instance data, presentation anchors) before and after.
No frozen fleet-digest receipt was edited; none moved.

## 1. Stage wrappers inlined (§4.1)

`createTankOwnedSteps` in `src/vehicles/tankFactoryCore.ts` was threaded through
93 machine-generated closures — 91 `createTank<Family>StageN` (60 with a body,
31 pure forwarders) and 2 `Course` closures — each declared and invoked once.
All 93 are inlined at their call site (AST-guided, text-edited, innermost first,
re-indented to the enclosing block). Two carried closure-level `return`s and
were restructured equivalently: the per-muzzle `Course` body's `return;` became
the loop's `continue;`; `Stage44`'s two early returns became nested `if` blocks
(its destructured names stay block-scoped). The shadow-finalizer statements
that `tankFactoryStaging.selftest` pins verbatim with their indentation are
byte-identical. Core: 13,154 → 12,879 lines.

Receipts changed: `eraWholeFitReuse.selftest` (pinned the wrapper call inside
the whole-fit `try`; now pins the `} finally { wholeEraFitReuse.close(); }`
shape), `tools/wreck-build-profile.mjs` and its selftest (attribute every direct
call of the owned generator body as a stage instead of matching the wrapper
names; the negative control that renames the owner still fails coverage).

## 2. Shadowed legacy builders removed (§4.2)

`buildM4A3E8`, `buildTiger` (+ `buildTigerHull/Deck/Turret/RunningGear`,
`TIGER_TURRET_HALF_WIDTH`), `buildT34`, `buildM1A2` (+ `buildM1A2Public`,
`KIT.buildM1A2`) and `buildT90M` (+ `addT90MRearSlatCage`) — 932 lines — were
unreachable: `profiles/ww2.ts`, `abrams.ts` and `t90.ts` register `m4a3e8`,
`tiger1`, `t34_85`, `m1a2_legacy` and `t90m` as profiled builders, which
`registerConfiguredBuilders` lets override the core table; no profile names a
core id as its `base`; `KIT.buildM1A2` had no caller. `BUILDERS` keeps `is2`,
`panther_g` and `leo2a7` (their only builders; hidden-fleet decision pending).
`tankFactoryCore.selftest`'s duplicate-builder probe now uses `panther_g`.
Core: 12,879 → 11,950 lines.

## 3. Duplicated helpers folded (§4.3)

| Group (identical bodies) | Copies | Owner now | Consumers |
| --- | --- | --- | --- |
| `trackPadRecipeWidth`, `shoeBox`, `oneCappedCylinderX`, `appendTrackShoeBox/Bar/Chevron/Pad/Surface`, `SHOE_BOX_TOP/BOTTOM`, `TrackShoeAssembly`, `DimensionedTrackPattern` | core + `profiles/abramsSourceXTrackShoe.ts` | `abramsSourceXTrackShoe.ts` (imports only types back) | core (its own `trackShoeGeometry` path) |
| `signedArea`, `validateFootprint`, `distance`, `geometry` | `sourceEraCover.ts` + `abramsSourceXCover.ts` | `sourceEraCover.ts` | `abramsSourceXCover.ts` |
| fitting `mount()` (rotation optional) | afvFamily, china, germany, italy (`addFitting`), japan, korea, leopard (`wrapMount`), poland, sweden, ukraine (`seat`) | new `profiles/fittingMount.ts` `mount` | the ten packs (aliased imports keep call sites; japan's owner-last signature delegates) |
| `mount()` (rotation always applied) | cv90, pumaS1, type89LightTiger | `fittingMount.ts` `mountRotated` | the three IFV packs |
| armor-face bilinear sampler | italy (`sampleArmorFace`), japan, ukraine (`sampleFace`) | new `profiles/armorFaceSampling.ts` | the three packs |
| `materialsOf` | `appearanceAudit.ts` + `wheelQuality.ts` | `appearanceAudit.ts` | `wheelQuality.ts` |
| `turned` (lathe) | `nationWheelConstructions.ts` + `profiles/leclercXWheels.ts` | `nationWheelConstructions.ts` | `leclercXWheels.ts` |

The dead `appendTrackShoeStructure` copy in `abramsSourceXTrackShoe.ts` and the
`TransformObjectPort` alias left without an importer were removed.

Left in place (31 of the 47 identical-body groups), by reason:

- **bound to a per-hull datum or file-local function** (a fold would have to
  re-thread every call site): `turretPart`/`onTurret`/`topPart` ×5 (`YAW`),
  `equipment` ×3 ×2 (`D`), `sight` ×2 (`YAW`), `addEdges` ×2 (`vertexKey`
  differs), `bindPartitionedEraCover` ×2 (`partitionEraCover` differs),
  `horizontalPlate`/`deckPlate` (`clippedPlate`), `block`/`box` (`add`),
  `armorWithoutEra` (`copy`/`requireFleetSpec`), `pattern`
  (`WHEEL_PATTERN_DEFINITIONS`), `bounds` (`REAR`/`FRONT`);
- **inside a source slice hashed by a do-not-edit receipt**: the seven ZTZ-100
  hull helpers (`bellyY`, `flankX`, `sternTub`, `hullSection`, `louvreField`,
  `hullBody`, `skirts`) in `ztz100Prototype.ts`, whose hull slice
  `ztz100Prototype.selftest` digests; `t62mv1X.ts` is hashed by
  `fixedSourceSkirtPaint.test-support`;
- **3–12-line pure locals in two files** where a shared module would add an
  import for no structural gain, or would couple demand-loaded family packs
  (`muzzleBore99`/`muzzleBore` across modern2/modern3): `lineAt`, `strip`/
  `slab`/`prism`, `isRecord`/`record`, `amxLower`/`lower`, `area`, `add`,
  `towHook2`/`towHook`, `stock`, `runningGear`, `heightAt`/`height`, `cable`.

## 4. Oversized files split (§4.4)

Four self-contained analysis sections of the core depended on nothing else in
it but the two mesh type guards; they moved verbatim:

| New module | Lines | Contents |
| --- | --- | --- |
| `vehicleMesh.ts` | 13 | `VehicleMesh`, `VehicleInstancedMesh`, `isVehicleMesh`, `isVehicleInstancedMesh` |
| `eraSurfaceFrame.ts` | 231 | ERA per-plate frame, PCA point-cloud fit, fitted-surface collection (`eraWholeFitReuse.selftest` byte-compares it against the pinned upstream core blob) |
| `muzzleCapProfiles.ts` | 134 | centreline cap and mouth-edge profile walkers, `MUZZLE_COUNTERBORE_MAX_M`, `objectRadialRadiusInFrame` |
| `restPoseContact.ts` | 351 | dense-shell floor sampling (`robustFloorY`, re-exported by the core for its receipt), rest contact receipt, presentation floor |
| `vehicleMarkingSeating.ts` | 588 | marking-seat solver, visibility receipt, verified-seat replay and the marking-only types |

`VehicleOwner`, `VehicleDecal` and `FactoryTankSpec` became exported types of
the core for the marking module (type-only imports; no runtime cycle). Core:
11,950 → 10,475 lines (13,154 at origin/main; −20%).

Not split, with the measured reason:

- **Running gear** (`tankFactoryCore.ts` 2,761–5,881 at origin/main, ~3,100
  lines): the section references 28 runtime declarations outside itself
  (track band and wheel helpers, the module-level scratch vectors `_m/_q/_s/_v/
  _X/_E`, `lodWrap`, `LOD1_DIST`, `D2R`, `SIM_STEP`, …) and seven of its own
  are used elsewhere; a clean cut needs the track-band section and a shared
  scratch module to move first (the same singletons must stay shared).
- **Per-tank builders** (`buildIS2`, `buildPanther*`, `buildLeo2A7*`, ~700
  lines): they call the core's fitting assemblies (`cupola`, `fenders`,
  `buildGun`, `buildRunningGear`, …); moving them alone creates a runtime
  import cycle. They follow the hidden-fleet decision for `is2`/`panther_g`/
  `leo2a7` anyway.
- **Family profiles** `leopard.ts` (15,788), `merkava.ts` (13,943),
  `abrams.ts` (11,117), `t90.ts` (8,828), `patton.ts` (7,838), `casemate.ts`
  (6,024): `t90.ts` is whole-file hashed by the do-not-edit
  `historicalT90MLamps.test-support`; the others have no text pins but each is
  one authored module of shared local helpers whose split is the 0.5–1 day per
  family the plan estimated, with the family digest receipts as the guard.
- `world/props.ts`, `ui/hud.ts`, `game/killcam.ts` are outside the vehicles
  owner; `hud.ts` is source-read by 19 receipts.

## 5. Verification record

Fleet digest (`$SP/r46c/fleet-digest.mjs`, kept outside the repo): 230 ids × 3
variants; run-to-run determinism confirmed; identical after §1 (full run),
after §2 (8 core-builder ids + 2 controls), after §3 (13 hulls across both
shoe/cover paths; 65 hulls of every touched pack), and after §4 (full run).
`npm run typecheck` (tsc + `core-unused-check`) after every commit;
`tools/unused-exports.mjs` at the origin/main row set (32 rows; none in the
touched files); receipts passing: tankFactoryStaging (do-not-edit, unchanged),
eraWholeFitReuse, eraSurfaceDeduplication, plateDistanceScratch,
camoWorldScale, materialQuality, nearVehicleShadowDetail, tankFactoryCore,
vehicleMarkings, wreck-build-profile, plus the module and pack receipts of every
touched file (see the round report). `presentation-centering --check` and
`tank:anatomy:check` unchanged (no regen needed; output is byte-identical).
