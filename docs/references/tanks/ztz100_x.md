# ZTZ-100 (`ztz100_x`) — reference packet (2026-09-17)

**Exact vehicle modeled:** the PLA's next-generation main battle tank as the owner supplied it — the Sketchfab
model "[OD]ZTZ-20 Test-3" by EXcaliburK117 (CC-BY-4.0), `Downloads/odztz-20_test-3.glb`, 50 unnamed material
meshes, 464 332 triangles, raw SHA-256 `387d8655…5da5d`. Owner: "add a new ztz100 tank … for the ztz100 use the glb
model and our best most up to date tank generation procedures based off of models"; "the ztz 100 should NOT be
based off of the type 100 at all. it needs to be completely separate following completely inspired generation".

## Procedure (the source-study pipeline)

1. **Quarantine + recipe.** `node tools/source-x-oracle.mjs --prepare=<glb> --recipe=<json>` baked the reviewed
   recipe (axes x,y,z — the glTF node matrices already give +Y up with the gun toward +z; uniform 0.92; translation
   (0, 0.00644, −0.12098)) into the ignored oracle `public/models/community-candidates/ztz100_x_source.glb`
   (SHA-256 `7eeb9852…758f1`, certified in `tools/source-world-registration.mjs`, comparison entry in
   `tools/second-wave-x-reference-overrides.ts`, ruler id in `tools/source-dimension-frame.mjs`). 0.92 puts the
   skirt planes at 3.70 m; the translation seats the lowest track vertex on y = 0 and centres the structural hull
   (stern plate … nose) on z = 0. The oracle never enters the runtime (`tank:native:check`).
2. **Metrology.** `.qa-dev/ztz100-source-study.mjs` (welded-vertex islands, 1 cm axis-aligned first-hit depth maps,
   roof/flank/front/rear profile tables) and `.qa-dev/ztz100-shaded.mjs` (normal-shaded orthographic elevations)
   produced the scalars in `docs/references/tanks/ztz100_x.source-measurements.json` — no mesh payload.
3. **Independent build.** `src/vehicles/profiles/ztz100X.ts` transcribes those scalars into `ZTZ100_X_DATUMS` and
   lays original primitives on the measured planes: one twelve-point hull loft (belly 0.35, sponson 1.08, fender
   1.30, roof 1.41, engine deck 1.50, 4.6° glacis to the nose line y 1.20 / z 3.56 over the stepped lower bow),
   two measured skirt bands with bolt rows and the forward sponson boxes, the glacis plate field, driver's hood,
   lamps and tow hooks, twin louvred deck grilles, the slatted deck rack, the full-width stern louvre and the
   0.70 m stern stowage bin inside its slat cage; seven road wheels on `KIT.buildRunningGear`; one ten-point turret loft (flanks ±1.50 to
   2.09, shelf 2.14, plateau 2.31, bustle ±0.91, wedge over the housing to z 1.13) with the trapezoid mantlet on
   the gun, two cylindrical sensor/launcher towers, the tall weapon station (fork, the fleet pintle machine-gun
   fitting as its gun, twin tubes, sight plate), the right-cheek missile bank, the left panoramic sight, hatches, smoke banks, rails and
   the 105 mm gun with its multi-baffle brake. The module imports only the shared kit, loft and lighting helpers;
   the receipt (`ztz100X.selftest.mjs`) pins that independence, the datums against the record, the part census,
   the running-gear receipt and the gun anchor.
4. **Gate.** `node tools/procedural-fidelity.mjs --ids=ztz100_x --check --board` rasterises the oracle and the build
   from nine cameras. Eight authoring passes, each read off `.qa-dev/ztz100-mask-diff.mjs` (true-axis XOR masks
   of the build against the oracle), took the aggregate from 90.9 to 93.4 with eight of nine views over the
   exemplar 92: whips → stub antennas, the stern reach to z −4.08, the raked lower stern and the stern tub taper,
   the roof falling to 2.05 at the housing, the narrow-lower-body / wide-pod turret section, the dense deck rack,
   the long pod bodies, the aft sponson boxes, the eight-bar slat cage around the stern and rear flanks, the
   measured skirt band spans. One side view sits at 91.9 (the concept model's bar cage and twin-tube fittings), so
   the comparison entry carries the fleet floor (90) like the KF51 X; the exemplar pass remains a follow-up.

## Combat record

`src/vehicles/chineseFrontlineSpecs.ts` `ztz100_x`: China, next-generation, MBT, tier X, 105 mm autoloaded gun
(4.8 s), hp 2600, 42 t, 1200 hp, 72 km/h; dims 6.94 / 8.98 / 3.70 / 2.31 (silhouette 3.04); turret pivot
(0, 1.41, −0.55), gun pivot (0, 0.35, 1.10), barrel 4.625 m to the measured muzzle z 5.175. Signature camo
`sig_ztz100_x` "ZTZ-100 Digital" (PLA digital woodland). Public name "ZTZ-100"; the former Type 100 build is now
the "Type 100 IFV" (`type100`).

## Release-gate fallout (2026-09-17 evening)

`tank-standard-check --gate` on the landing chain: the stern sponson floor (`sternTub` returned the sponson height
.78 behind the sprocket) put 56 voxels of hull in the rear track band → the tub alone narrows now; the top
silhouette read holes through the slat cage → a `cage-bin` body fills the cage; the hand-built weapon-station gun
counted as mg0 → the fleet `FITTINGS.pintleMG` (scale 1.15, seated so the fitting tops out at the measured 3.04 m —
a taller seat dropped the dims component to 40.8) is the station's gun. Fidelity after: 93.0 aggregate, worst view
91.6 (fleet floor 90); dims 99.5; clip 0/0, holes 0, mg1.

