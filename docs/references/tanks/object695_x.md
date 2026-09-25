# Object 695 (`object695_x`) — reference packet

## Current owner-authored missile concept (2026-09-19)

The latest owner request supersedes the source-based turret below. Object 695
now retains its chassis under an original raised twelve-cell launcher with a
30 mm backup cannon. The two six-cell pods share a pitching cradle and cycle
independently of the cannon feed. Three hull crew operate the unmanned module.
Its distinct handling and missile-primary loadout are game design, not claims
about a historical vehicle.

The [design contract](../concepts/missile-turrets-20260919.json) owns the new
silhouette, physical tube count, datums and native validation. Source comparison
is explicitly not applicable to this original turret. Historical scores below
certify only their archived geometry; they do not certify the redesign.
Kurganets-25 retains its source-based Epokha turret and equipment.

## Superseded Epokha turret and qualification (earlier 2026-09-19)

The owner requested the corrected Kurganets Epokha turret on this retained hull.
That earlier build had a 57 mm cannon, four Kornet tubes, eight Bulat tubes and
four roof masts, through the shared `epokhaTurret.ts` builder. Its ring remains
`(0,2.15,-1.10)`; the trunnion is `(-.004,2.857,-.51)` and barrel length is
1.537 m. The existing primary firing cycle and Kornet tuning remain; Bulat
replaces the former cannon HE channel. There is no separate roof machine gun.

That historical comparison target combined the original source hull with nine complete
corrected source turret owners, through the independently replayable
[source recipe](../source-assemblies/20260919/object695_x.json). Neither source
GLB enters the playable runtime. The earlier measurement JSON and account below
remain historical records; their 30 mm turret and old gun datum are superseded.

Fresh automated geometry measures 94.7/92 and all fourteen new-turret views
pass scoped visual review. Whole-vehicle visual qualification remains open for
the retained hull's rear louvers, ramp door and simplified bow/deck detail.
The retained chassis also has documented LOW geometry-budget debt. See the
[historical construction, balance and review record](../../history/research/object695-epokha-dragun-balance-20260919.md).

## Original build history (2026-09-17–18)

**Naming.** This is the session's Kurganets-25 IFV build, fielded under the vehicle's factory index "Object 695" (owner
2026-09-18: "make the tanks you made into separate tanks with a unique name and id and have the other one in codex be the
actual versions") — the Codex-built `kurganets25_x` carries the Kurganets-25 name; both descend from the same Armored
Warfare export and stay separate tanks.

**Exact vehicle modeled:** Russia's next-generation tracked infantry fighting vehicle as the owner supplied it — the
Armored Warfare "Kurganets-25" export, `Downloads/kurganets-25_armored_warfare.glb`, 39 unnamed material meshes,
255 561 triangles, raw SHA-256 `0af5ccde…f7fd2`. Owner: "make a completely new kurganets 25 tier X russian IFV now
with a machine gun like machine gun thats very powerful. make it look extremely good following our best tank
generation procedures".

## Procedure (the source-study pipeline)

1. **Quarantine + recipe.** `node tools/source-x-oracle.mjs --prepare=<glb> --recipe=<json>` baked the reviewed recipe
   (axes x,y,z — the glTF node matrices already give +Y up with the module behind centre, so +z is forward; uniform
   0.965; translation (0.0052, 0.0135, 0); `omitIslandsBelowY −0.05` and `omitIslandsInside` x ±1.15 / y < 0.58 /
   z ±0.5) into the ignored oracle `public/models/community-candidates/object695_x_source.glb` (SHA-256
   `012dfef5…c9b3`, certified in `tools/source-world-registration.mjs`, comparison entry in
   `tools/second-wave-x-reference-overrides.ts`, ruler id in `tools/source-dimension-frame.mjs`). 0.965 puts the 7.46 m
   structural hull at the published 7.2 m; the translation seats the lowest track vertex on y = 0 and centres the hull
   on x = 0. The file parks a detached rear-ramp leaf and its fittings under the hull centre (0.9 m under the track
   sole, its upper part between the tracks); the recipe drops those detached islands whole (100 islands, 3 134
   triangles, reported by the tool), so the reference is the seated vehicle. The oracle never enters the runtime
   (`tank:native:check`).
2. **Metrology.** `.qa-dev/ztz100-source-study.mjs … --scale=0.965 --omit-below=-0.05` (welded-vertex islands, 1 cm
   depth maps, roof/flank/front/rear profile tables), `.qa-dev/kurganets-heightmap.mjs` (numeric 0.1 m top, side,
   front and rear elevation grids of the canonical oracle) and `.qa-dev/ztz100-shaded.mjs` (normal-shaded orthographic
   elevations) produced the scalars in `docs/references/tanks/object695_x.source-measurements.json` — no mesh
   payload.
3. **Independent build.** `src/vehicles/profiles/object695X.ts` transcribes those scalars into
   `OBJECT695_X_DATUMS` and lays original primitives on the measured planes: one twelve-point hull loft (belly 0.62,
   sponson floor clear of the raised end wraps, flank 1.66, rear roof 2.19 easing to 2.13 under the module, the 7°
   deck to the 1.70 m nose edge over a two-plate lower bow, the stern plate at z −3.46), seven-panel side armour
   modules a side (x 1.66–1.99, y 0.80–1.95) with chamfered ends, mudguards, rails and the tow cable, a closed ramp door
   between two stern boxes, three rear roof hatches, the rear-left roof box, driver's hatch, engine plate and louvres,
   the intake drum, bow hood and armoured lamps, smoke banks either side of the ring; seven paired road wheels on
   `KIT.buildRunningGear` (rear drive, raised front idler; FSP-03 2026-09-25: four return rollers per side fitted behind
   the modules under the measured return course — the Kurganets-25 carries four, tank-afv bare-chassis photographs — the
   source omits their meshes, so they are inferred supports, not source measurements); the unmanned module
   as a lower belt, a crowned rear block (±1.05 to 2.96, crown 3.05), a 2.62 m front block drawing to a chamfered nose,
   upper and lower side pods to x 1.50, bustle corner boxes, the 30 mm gun on the centreline (axis 2.81, trunnion
   z −0.45, muzzle z 3.20) beside the housing that carries the fleet pintle machine-gun fitting as the coaxial gun,
   gunner's and commander's sights with the periscope column, the right-rear four-tube launcher on its pedestal
   (top 3.49) and three whip masts (tallest 4.03). The module imports only the shared kit, loft and lighting helpers;
   the receipt (`object695X.selftest.mjs`) pins that independence, the datums against the record, the part census,
   the running-gear receipt, the gun anchor and that the belt out-damages every other selectable IFV per minute.
4. **Gate.** `node tools/procedural-fidelity.mjs --ids=object695_x --check --board` rasterises the oracle and the
   build from nine cameras. The first authoring pass scored 93.7 aggregate (top 98.9, rear-right 95.2, the two side
   views 91.3 / 90.9); the mask diff (`.qa-dev/x-mask-diff.mjs object695_x`) located the belly remnant of the parked
   ramp leaf in the oracle (dropped by the recipe box), the missing mudguards, the stern furniture standing proud of the
   plate, the launcher's length and the coaxial fitting's seat. Five passes (belly 0.56, the prow-shaped module ends, the slatted rear rack, ring
   guard to z 0.60, the launcher's measured box and tubes, inboard smoke banks, four masts) took the aggregate from
   93.7 to 95.2 with every view over 92 (worst 92.6, top 99.0), so the comparison entry carries the exemplar bar (92);
   the remaining side-view difference is the reference's 7 cm track against the fleet's 28 mm band.

## Combat record

`src/vehicles/russianFrontlineSpecs.ts` `object695_x`: Russia, next-generation, IFV, tier X, 30 mm belt
(0.26 s, 88 damage, 265/245/225 mm — the fleet's fastest and hardest-hitting belt, the owner's "machine gun that's
very powerful"), Kornet-EM guided HEAT (760, 2.6 s) and 30 mm HE-I; hp 2650, 25 t, 800 hp, 80 km/h; dims 7.08 / 7.23 /
3.985 / 2.19 (silhouette 3.49); module pivot (0, 2.15, −1.10), gun pivot (0, 0.66, 0.65), barrel 3.65 m to the
measured muzzle z 3.20. Signature camo `sig_object695_x` "Object 695 Digital". Public name "Object 695".

## Release-gate fallout (2026-09-18, landing as Object 695)

`tank-standard-check --gate` scored the geometry gate at 87.1 against the 92 exemplar bar: `dims` 87.1 with `hullLengthM`
2.4 % long (7.156 vs the source's 6.989 in the fixed source frame). The gate's body-extent law counts every side-mask
column thicker than 12 % of the rough height as hull, so the bow tow eyes hung at the nose (z 3.55–3.66, y 1.24–1.38)
and the stern boxes reaching z −3.60 read as a 15 cm longer hull than the source, whose stern silhouette ends at −3.56
and whose nose is a thin lip past z 3.55. `.qa-dev/body-extent-probe.mjs` applies the same law to the true-axis 1 cm
masks and prints the stern/nose column profiles. Fix: tow eyes seated on the lower bow plate at z 3.37–3.43, stern boxes
0.10 m deep (aft face −3.56). After: body length 7.080 on both masks, dims 96.7, geometry gate 92.8 PASS, fidelity 95.3.

`tankAssets.selftest` (the release check's test stage) then asked the authored bodies to be materially richer than their
bounded convex shadow casters (8×): the module's three lofts carried 60 triangles. The same planes are now tessellated
with interpolated stations and collinear ring points, the hull loft carries five interpolated stations and the gun
cylinders 32 segments — 764 → 1500 authored triangles against 148 caster triangles, silhouette unchanged (fidelity 95.3,
geometry gate 92.8).
