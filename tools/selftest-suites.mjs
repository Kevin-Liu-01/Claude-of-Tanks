/** Ordered regression groups; npm test runs all of them in one invocation. */
export const SELFTEST_SUITES = Object.freeze({
  pre: Object.freeze([
    // main's c6b60311c pins its provenance receipt first, ahead of the four whole-fleet scans (selftest-suites.selftest).
    'tools/asset-provenance.selftest.mjs',
    // Group independent full-fleet builders to fill the four CPU slots before
    // the 45-second FIFO drain. 2026-10-02: one fleet pass per build (fleetPass.test-support.mjs) hosts the
    // ten former whole-fleet receipts' audits: HIGH (wheelQuality, surfaceMarkupFleet) and LOW (gunArticulation,
    // eraGameplayRegistration) here, the default build in core; fleetLazy and fleetFloorClearance keep their own.
    'src/vehicles/fleetLazy.selftest.mjs',
    'src/vehicles/fleetPassHigh.selftest.mjs',
    'tools/wheel-axial-extents.selftest.mjs',
    'src/vehicles/fleetPassLow.selftest.mjs',
    // 2026-10-10: every Leopard 2A5-family spec at both qualities across camouflage seeds; markExact on a duplicate three
    'src/vehicles/leopard2A5Family.selftest.mjs',
    // 2026-10-10: no mesh that can reach a scene reads vertex colour without a colour attribute (fleet as rendered, drones,
    // garage packs, world prop and map-vehicle kits; KNOWN ratchets hits in flight elsewhere)
    'tools/vertex-color-coverage.selftest.mjs',
    // 2026-09-29: the three receipts of 0e5fc79e2 sit after the four whole-fleet CPU scans the receipt pins first (runner admission).
    'src/sim/modeConfiguration.selftest.mjs',
    'src/sim/sixModes.selftest.mjs',
    'src/sim/infectedLifecycle.selftest.mjs',
    // 2026-10-17 (owner): fragile zombies and sturdy humans in Infected and the Horde (rules, hunt, measured band), and
    // unlimited rounds in every special and arcade mode
    'src/sim/zombieBalance.selftest.mjs',
    // the zombies' tier-down wiring in both bot builders (the authority per seat, the solo battle per setting)
    'src/game/zombieBotTier.selftest.mjs',
    'src/sim/specialModeAmmo.selftest.mjs',
    'src/sim/modeAdditions.selftest.mjs',
    'src/fx/sceneLightTint.selftest.mjs',
    'src/fx/droneModel.selftest.mjs',
    'src/fx/droneRotorWinding.selftest.mjs',
    'src/ui/droneFeedTransition.selftest.mjs',
    'src/ui/aerialMinimap.selftest.mjs',
    'src/ui/droneAltimeter.selftest.mjs',
    'src/sim/droneRecon.selftest.mjs',
    'src/sim/droneArmor.selftest.mjs',
    'src/sim/droneAvoidance.selftest.mjs',
    'src/sim/botDroneAttack.selftest.mjs',
    'src/sim/droneLowFlight.selftest.mjs',
    'src/sim/droneLaunch.selftest.mjs',
    'src/game/missionAttachmentVisual.selftest.mjs',
    'src/fx/droneReturn.selftest.mjs',
    // round 8 Y6 s4-02 (fix-up r1): the solo step's drone:down reaches the FX runtime keyed to its shell: no flight home
    'src/fx/droneDownedSolo.selftest.mjs',
    'src/game/missionAttachmentMotion.selftest.mjs',
    'src/game/garageModePreview.selftest.mjs',
    'src/app/garageModePreviewRuntime.selftest.mjs',
    'src/engine/aerialVision.selftest.mjs',
    'src/engine/thermalVehicles.selftest.mjs',
    'src/engine/visionWarm.selftest.mjs',
    'src/game/juggernautVisual.selftest.mjs',
    // 2026-10-19 (owner): the AC-130 on the October tracers and missile looks, the old ribbon retired, and its kills
    // credited to the AC-130 (the drone's to the drone) on every surface
    'src/fx/gunshipRounds.selftest.mjs',
    'src/fx/retiredTracers.selftest.mjs',
    'src/fx/shockRingLight.selftest.mjs',
    'src/fx/thermalFireGain.selftest.mjs',
    'src/fx/hullBurstEarth.selftest.mjs',
    'src/fx/strikeLooks.selftest.mjs',
    // 2026-10-27 (261, premiere-battle on live 259): the APS interception's flash, fragments and grey-white puff
    'src/fx/apsIntercept.selftest.mjs',
    'src/fx/heavyColumn.selftest.mjs',
    'src/fx/thermalGroundAndEmbers.selftest.mjs',
    // (orange-rings-230) the crater marks lit as the ground they lie on (Steinburg's glowing rings)
    'src/fx/craterMarksLight.selftest.mjs',
    'src/engine/thermalWreckCooling.selftest.mjs',
    'src/engine/thermalHullHeat.selftest.mjs',
    'src/engine/thermalLensBloom.selftest.mjs',
    // (fx-redo-240) the night pool's town lamps as lanterns
    'src/engine/lampLightShape.selftest.mjs',
    'src/ui/aerialHitMark.selftest.mjs',
    'src/ui/killFeedSource.selftest.mjs',
    'src/ui/endScreenAircraft.selftest.mjs',
    'src/sim/killSource.selftest.mjs',
    'src/ui/killSurfaces.selftest.mjs',
    // (r2) the AC-130's airframe, its own chunk staged under the cover, hidden only in its own lens; the warm path
    'src/game/gunshipAirframe.selftest.mjs',
    // 2026-11-02 audit R6 (review round 2): a failed airframe chunk is asked past the policy's backoff by its sync and the
    // lens guns, which ask every frame (it was asked again on every frame)
    'src/game/gunshipAirframeLoadFailure.selftest.mjs',
    // (ac130-barrels-230, the owner) the guns beside the gimbal lens: seen firing and recoiling, their rounds, missile and
    // smoke leaving their muzzles
    'src/fx/gunshipLens.selftest.mjs',
    'src/fx/timeOfDayMarks.selftest.mjs',
    'src/fx/localLights.selftest.mjs',
    'src/fx/worldWindPalette.selftest.mjs',
    'src/fx/salvoGovernor.selftest.mjs',
    'src/fx/heLookV2.selftest.mjs',
    'src/fx/killGlow.selftest.mjs',
    'src/fx/strikeSignatures.selftest.mjs',
    'src/sim/gunshipEscort.selftest.mjs',
    'src/sim/gunshipSupplyDrive.selftest.mjs',
    'src/sim/gunshipEscortMaps.selftest.mjs',
    'src/fx/droneMotion.selftest.mjs',
    // 2026-10-14 (owner): the drone recall, only from the drone's feed; it flies home and lands; a shorter recall cooldown
    'src/sim/droneRecall.selftest.mjs',
    // 2026-11-02 audit M4: a carrier's revive retires its airframe in flight; a restored airframe keeps its velocity
    'src/sim/droneLife.selftest.mjs',
    'src/mp/host/droneRecallWire.selftest.mjs',
    'src/fx/droneRecallReturn.selftest.mjs',
    'src/ui/droneControlState.selftest.mjs',
    // 2026-10-15: the Returning cue wins the cascade on the desktop strip, the touch strip and the touch action dock
    'src/ui/droneReturningCascade.selftest.mjs',
    'src/engine/aerialCamera.selftest.mjs',
    'src/sim/sixModesAuthority.selftest.mjs',
  'src/mp/host/sixModesMigration.selftest.mjs',
    'src/mp/host/objectiveModesMigration.selftest.mjs', // 2026-11-02 audit M1: Zone Control, Mars, CTF and Turbo Ball survive a host handoff
    'src/mp/host/combatMigration.selftest.mjs', // 2026-11-02 audit M1: reload channels, module hp, fires, magazines, consumables, smoke and pillboxes survive a host handoff; a newer frame's rows win, mode stamps hold
    'src/mp/host/reviveMigration.selftest.mjs', // 2026-11-02 audit M1 (review round 2): a hull revived between the keyframe and the newest frame keeps its fresh life and is not revived again
    'src/mp/host/resumeAging.selftest.mjs', // 2026-11-02 audit U2 (round 2): resumed extras age by the sim time between the battle clocks, an untouched row's to the resume frame too
    'src/mp/host/resumeHullBody.selftest.mjs', // 2026-11-02 audit U2 (round 2): a migrated host restores each hull's ground contact, body mode, spring and ride from its row
    'src/mp/host/migrationExtrasSize.selftest.mjs', // 2026-11-02 audit U2 (round 2): keyframe extras carry only what differs from a fresh host's state; the restore is unchanged
    'src/mp/host/resumeSmoke.selftest.mjs', // 2026-11-02 audit U2 (round 2): a migrated host keeps standing smoke screens; a resumed host's frames carry them on the battle clock
    'src/mp/host/modeEventKeyframe.selftest.mjs', // 2026-11-02 audit U2 (round 2): a migration keyframe follows a mode event within a housekeeping beat, not the 2 s cadence
    'src/mp/host/modeFrameReconcile.selftest.mjs', // 2026-11-02 audit U2 (round 2): a migrated host resumes the score, zones, flags and ball as the seat's newest frame shows them
    'src/mp/host/resumePhase.selftest.mjs', // 2026-11-02 audit M1: a migrated countdown counts on, an ended match stays ended, an unreadable keyframe never restarts a battle
    'src/vehicles/tacticalRoles.selftest.mjs',
    'src/world/maps/earthriseCrossing.selftest.mjs',
    'src/sim/auxiliarySystems.selftest.mjs',
    'src/sim/roofStations.selftest.mjs',
    // 2026-10-19 (owner): roof guns hold fire where their rounds cannot hurt; every round judged where it lands, host = solo
    'src/sim/roofHoldFire.selftest.mjs',
    // 2026-10-16 (227 guards; guards 229): counter-drone as the owner's 226 rule: the levers as data (keyable, ~0.5 s),
    // then every pinned pilot run on the authority (~7 s; keyed on its closure with item/tests-speed-229's i18nChunkImport)
    'src/sim/counterDroneEngagement.selftest.mjs',
    'src/sim/counterDroneRuns.selftest.mjs',
    'src/vehicles/remoteGunFleet.selftest.mjs',
    'src/vehicles/profiles/mbt70Rh202.selftest.mjs',
    'src/vehicles/roofWeaponPolicy.selftest.mjs',
    // 2026-10-20 (the fleet ZTZ-99A2 lane): the QJC-88's arc stops short of the commander's sight (the whole moving mass
    // swept both ways at 25 mm; the old arc and the bare depression table as negative controls)
    'src/vehicles/ztz99a2RoofArc.selftest.mjs',
    'src/vehicles/profiles/challenger3MachineGunAssembly.selftest.mjs',
    'src/vehicles/profiles/amx30B2Roof.selftest.mjs',
    'src/vehicles/fleetRenewal.selftest.mjs',
    'src/vehicles/nationalModernization.selftest.mjs',
    'src/vehicles/nationalDonorTurrets.selftest.mjs',
    'src/vehicles/profiles/nationalUkraineProtection.selftest.mjs',
    'src/vehicles/nationalPolandProtection.selftest.mjs',
    'src/vehicles/nationalRoof.selftest.mjs',
    // 2026-10-20 (release 227, national lamp guards): every national turret lamp's base plate runs 10 mm past its guard
    // posts (no post flat coplanar with a plate end), by the exact coplanar census (coplanarOverlap.test-support.mjs)
    'src/vehicles/nationalLampGuards.selftest.mjs',
    // 2026-10-16 (release 227, CN track): the Yun's and Qilin's add-ons wrapped round their base turrets, the Qilin 10 %
    // shorter, the clearances; the three roof stations calibre-true and automatic inside their arcs
    'src/vehicles/cnAddOns.selftest.mjs',
    'src/vehicles/cnStations.selftest.mjs',
    // 2026-10-20 (release 229): every working FITTINGS.pintleMG call rides its cradle, the riding rig of each class and
    // shield clear of its own mount (the whole fleet is measured in fleetPassDefault's workingPintleCradle audit)
    'src/vehicles/workingPintleCradle.selftest.mjs',
    // 2026-10-17 (release 227 CN M5): the moving-part clearances (main gun over the hull and the add-ons, the underside and
    // the ring collars, the roof stations over their arcs, the box sights on the boots): about 300 s of CPU unloaded
    // (Qilin ~110-170 s, Kunlun ~130 s, Yun ~50-190 s; 430-830 s wall on a loaded box)
    'src/vehicles/cnClearance.selftest.mjs',
    // 2026-10-28 (release 262 CN, the Type 59 / T-55A and Longwei rebuilds): each gun stays inside its mantlet at every
    // degree from full depression to full elevation
    'src/vehicles/cnGunMantlet.selftest.mjs',
    // 2026-10-19 (release 227 CN round 8, owner: "the rear of qilinns turret is exposed and nnot filled"): the Qilin's cut
    // bustle closed underneath (the ring collar hidden from behind) and its full-width rear rack loaded
    'src/vehicles/qilinRearFill.selftest.mjs',
    // 2026-10-18 (release 227 land stage; critics CN4-2, UAPL-R6C-1/2/3): the bored-trunnion yoke under the wedge, cradle
    // and casemate stations (no moving part through its yoke over pitch and recoil), and the Zubr II illuminator's
    // own-gun mask (its beam never lights its own barrel)
    'src/vehicles/nationalStationYoke.selftest.mjs',
    'src/vehicles/searchlightOwnGunMask.selftest.mjs',
    'src/sim/smokeBallistics.selftest.mjs',
    'src/vehicles/smokeFan.selftest.mjs',
    'src/sim/smokeScreenCover.selftest.mjs',
    'src/sim/smokeWind.selftest.mjs',
    'src/sim/smokeCollision.selftest.mjs', // 2026-10-09 the hitbox lane: canisters bounce off walls; screens stay out of houses
    'src/sim/smokeBlocksExact.selftest.mjs', // 2026-10-13 the MP stream: the footprint early-out answers exactly as before
    'src/sim/roofTargetOrder.selftest.mjs', // 2026-10-13 the MP stream: nearest-first roof-gun scan picks the same target
    'src/sim/sightlineBush.selftest.mjs', // 2026-10-13 the MP stream: the sightline bush bonus read from a grid, to the bit
    'src/fx/auxiliaryPresentation.selftest.mjs',
    'src/fx/projectileTracers.selftest.mjs',
    'src/fx/missileLooks.selftest.mjs',
    'src/fx/missileWires.selftest.mjs',
    'src/fx/missileTrails.selftest.mjs',
    'src/fx/missileBodies.selftest.mjs',
    'src/ui/vehicleControlCooldown.selftest.mjs',
    'src/ui/vehicleSpecialAction.selftest.mjs',
    'src/vehicles/vehicleAuxiliaryGeometry.selftest.mjs',
    'src/vehicles/smokeLauncherFleet.selftest.mjs',
    'src/vehicles/internalLayoutRegistry.selftest.mjs',
    'src/vehicles/suppliedSourceWeapons.selftest.mjs',
    'src/vehicles/dragunAssaultBalance.selftest.mjs',
    'src/vehicles/missileConceptCombat.selftest.mjs',
    'src/vehicles/profiles/tos1aTagil.selftest.mjs',
    // 268: the GM-352 air-defence pair (Tunguska-M, Pantsir-S1): datums, fire axes, launch exits, the shared chassis, sweeps
    'src/vehicles/profiles/gm352AirDefense.selftest.mjs',
    // 268: the PLA air-defence pair (PGZ-95, PGZ-09): datums, every bore, the QW-2 exits, the clearance scans
    'src/vehicles/profiles/chineseAirDefense.selftest.mjs',
    'src/vehicles/profiles/arieteC2X.selftest.mjs',
    'src/vehicles/profiles/xk2.selftest.mjs',
    'src/sim/rocketBattery.selftest.mjs',
    'src/sim/missileRoles.selftest.mjs',
    'src/sim/magazineIndicator.selftest.mjs',
    'src/vehicles/profiles/griffinViper.selftest.mjs',
    'src/sim/gunPitchLimits.selftest.mjs',
    // 2026-10-20 (the CN lane's measured depression, carried to the national concepts and the fleet's curves): every
    // published gunPitchByYawDeg keeps the whole gun 25 mm off its hull at every yaw; the bare depression meets the hull
    'src/vehicles/nationalGunClearance.selftest.mjs',
    // 259 (owner on both Strv 103s: "dont allow the strv 103 bs gun to like glitch through the front of its gate"): each
    // fixed tube leaves through its glacis housing's port and clears every hull part at every hull pitch
    'src/vehicles/strv103GunPort.selftest.mjs',
    // 261 (owner: "the stb 1 and type 74 still need completgely new mantlets and turret geometrry around the mantlets"):
    // each gun pitches in its own shield, seated in a channel cut into its own turret front, clear of it and filling it
    // over the whole travel
    'src/vehicles/japaneseMantlet.selftest.mjs',
    // 262 (owner: "we should upgrade the hulls and everything about the tanks too"): the STB-1's and the Type 74's guns
    // keep off their rebuilt hulls at every yaw on their source travel and published curves
    'src/vehicles/japaneseGunHull.selftest.mjs',
    'src/vehicles/challengerXGunPort.selftest.mjs',
    // release 262: the Christian II (a fresh Danish concept on the release's Leopard 2-pattern hull): its own spec and stock
    // (none of the Type 90 X's), its datums drawn, its gun clear of its hull at its published stops, its concept datums
    'src/vehicles/profiles/christian2.selftest.mjs',
    // release 265 (owner: "add a bunch more denmark tanks"): the Danish Leopards within their photo packets at both
    // qualities, each mark's Danish kit, the Denmark tree on the 1A3 DK with the Christian II as its special, the country
    'src/vehicles/profiles/denmark.selftest.mjs',
    // release 266 (owner: "lets build brazil ... flesh it out with all its own tanks"; "EE-T1 Osório"): the Brazilian line's
    // X1, X1A2, Tamoyos and Osórios in their trees, tiers and photo packets at both qualities, each mark's kit
    'src/vehicles/profiles/brazil.selftest.mjs',
    // release 269 (owner: "flesh out south african and australian tank trees"): the South African line's Semel and Olifants
    // on the Centurion family and the TTD in their tree, tiers and photo packets at both qualities, each mark's kit
    'src/vehicles/profiles/southAfrica.selftest.mjs',
    // release 269 (owner: "flesh out south african and australian tank trees"): the Australian line's M113s, Leopard AS1,
    // Abrams pair and Redback in their tree, tiers and photo packets at both qualities, each one's own kit
    'src/vehicles/profiles/australia.selftest.mjs',
    // 265: the M41 family on its supplied print's datums, each mark's kit and tree
    'src/vehicles/profiles/m41.selftest.mjs',
    'src/vehicles/ztz20GunClearance.selftest.mjs',
    // 262 (owner: the new T-84BM Oplot-M and Oplot-T): each KBA-3 keeps its hull clear over -5..+14 at every yaw, its
    // measured curve over the stern drums and the Thai APU, and the full -5 degrees over the glacis
    'src/vehicles/oplotBMGun.selftest.mjs',
    // 262: the Challenger 3 TD's deep mantlet and tube clear its two cheeks and every turret fitting through the gun's
    // whole travel, in battery and at full recoil (a rod across the slot fails)
    'src/vehicles/profiles/challenger3TdGun.selftest.mjs',
    // release 262: the fourth batch's Leopard 2A3 on the same hull: the 2A3's combat data, the shared construction, its gun
    // clear of its hull at its published stops
    'src/vehicles/profiles/leopard2a3B4.selftest.mjs',
    // release 264: the 2A4-era Leopards on the same hull (the photo packets' native fixture): the owner's square/wedge
    // split, each one's gun forward, the ring on the deck and the 2A4 turret's roof, at both qualities
    'src/vehicles/profiles/leopard2A4Family.selftest.mjs',
    'src/sim/moduleArticulation.selftest.mjs',
    'src/sim/weaponHousing.selftest.mjs',
    'src/sim/weaponModuleDamage.selftest.mjs',
    // 2026-11-02 audit M4: a red roof-gun module silences the station without throwing its switch; the repair restores it
    'src/sim/roofGunRepair.selftest.mjs',
    'src/vehicles/detachedGear.selftest.mjs',
    'src/vehicles/weaponDamageVisuals.selftest.mjs',
    'src/game/objectiveSurface.selftest.mjs',
    'src/vehicles/externalWeapons.selftest.mjs',
    'src/vehicles/missileConceptMarkings.selftest.mjs',
    'src/game/missilePresentation.selftest.mjs',
    'tools/first-party-concept-policy.selftest.mjs',
    'src/vehicles/arieteModernSpecs.selftest.mjs',
    'src/vehicles/suppliedSourceArmorRegistration.selftest.mjs',
    'src/sim/convexArmorPlate.selftest.mjs',
    'src/sim/armorSurfaceGroup.selftest.mjs',
    'src/vehicles/calibrationStockGeometry.selftest.mjs',
    'src/vehicles/physicalMuzzleBore.selftest.mjs',
    'src/vehicles/carvedMuzzleBore.selftest.mjs',
    'src/vehicles/profiles/lathedWheelStock.selftest.mjs',
    // 2026-10-25 (the owner's profile skirts): skirts swept on their hull's side and glacis lines, closed on both sides
    'src/vehicles/profiles/profileSkirt.selftest.mjs',
    'src/vehicles/profiles/kf41LynxWheelStock.selftest.mjs',
    'src/vehicles/nationWheelSets.selftest.mjs',
    'src/vehicles/profiles/europeSourceRunningGear.selftest.mjs',
    'src/vehicles/profiles/aft10X.selftest.mjs',
    'src/vehicles/profiles/easternSourceContact.selftest.mjs',
    'src/vehicles/profiles/europeSourceDetail.selftest.mjs',
    'src/vehicles/profiles/kurganetsSourceDetail.selftest.mjs',
    'src/vehicles/profiles/type96SourceFittings.selftest.mjs',
    'src/vehicles/profiles/sourceStudyAttachmentSeats.selftest.mjs',
    'src/vehicles/profiles/warriorRearFenderSeating.selftest.mjs',
    'src/vehicles/profiles/warriorSideLedgeStock.selftest.mjs',
    'src/vehicles/profiles/dragunAssembledHull.selftest.mjs',
    'src/vehicles/profiles/kurganetsRoofFittings.selftest.mjs',
    'src/vehicles/profiles/griffinAssembledHull.selftest.mjs',
    'src/vehicles/profiles/sabraFrontFender.selftest.mjs',
    'src/vehicles/profiles/ajaxRearFlapSeating.selftest.mjs',
    'src/vehicles/profiles/sourceStudyGunCradles.selftest.mjs',
    'src/vehicles/profiles/kurganetsGun.selftest.mjs',
    'src/vehicles/profiles/europeGunOwnership.selftest.mjs',
    'src/vehicles/profiles/cv90MkivCaliber.selftest.mjs',
    'src/vehicles/profiles/type96GunOwnership.selftest.mjs',
    'src/vehicles/shadowCasterWork.selftest.mjs',
    'src/vehicles/profiles/suppliedShadowCoverage.selftest.mjs',
    'src/vehicles/profiles/k21Launcher.selftest.mjs',
    'src/vehicles/profiles/k21RearHullStock.selftest.mjs',
    'src/vehicles/profiles/k21BowStock.selftest.mjs',
    'src/vehicles/profiles/dragunHullFittings.selftest.mjs',
    'src/vehicles/profiles/dragunForwardRoofStock.selftest.mjs',
    'tools/interior-fill-body-policy.selftest.mjs',
    // 2026-10-08: deep interior needs exact body cover over a voxel's whole footprint (or a narrow slot)
    'tools/tank-voxel-body.selftest.mjs',
    'tools/m1a1-fill-clearance.selftest.mjs',
    'tools/track-lane-boxes.selftest.mjs',
    // 2026-10-03: declared physical bore air is open, never filled and reported apart from leaks
    'tools/physical-bore-air.selftest.mjs',
    // 2026-10-06: moving-part clearance air (pockets under the gun group, declared clearance cells) is reported apart
    'tools/moving-clearance-air.selftest.mjs',
    // 2026-10-02: the fleet watertight gate's own controls (the gate itself runs in fleetPassDefault)
    'src/vehicles/watertightAudit.selftest.mjs',
    // 2026-10-16 (test-speed R7c): the gate's named carries (docs/geometry-gate/watertight-carry.json) and their rules
    'tools/watertight-carry.selftest.mjs',
    // 2026-10-16 (tank-opt HIDDEN): fills drawn as their exact, conforming boundary surface; closed boxes bit-identical
    'src/vehicles/interiorFillSurface.selftest.mjs',
    // 2026-10-16 (tank-opt HIDDEN): a wreck draws the closed boxes again (setDestroyed), the rematch the surface
    'src/vehicles/interiorFillWreck.selftest.mjs',
    // 2026-11-05 (owner: "when destroyed you can still see the double barrles"): every public tank's battle wreck kinks
    // each drawn gun piece along the crease (cutAtKink), plain and cook-off; no straight chord beside the bent barrel
    'src/vehicles/wreckGunBend.selftest.mjs',
    'tools/barak-rear-bay-fill-policy.selftest.mjs',
    'src/vehicles/profiles/kurganetsRearDoorStock.selftest.mjs',
    'src/vehicles/profiles/kurganetsBowStock.selftest.mjs',
    'src/vehicles/roundedBoxGeometryCache.selftest.mjs',
    'src/vehicles/ownedFittingGeometry.selftest.mjs',
    'src/vehicles/eraSurfaceDeduplication.selftest.mjs',
    'src/vehicles/eraWholeFitReuse.selftest.mjs',
    'tools/chieftain10-collision.selftest.mjs',
    'tools/tos1a-tagil-collision.selftest.mjs',
    'tools/ariete-c2-collision.selftest.mjs',
    'src/vehicles/jagdpanzerE100XArmor.selftest.mjs',
    'src/vehicles/sourceXOtherAuxArmor.selftest.mjs',
    'src/vehicles/convexArmorTraceBounds.selftest.mjs',
    'src/vehicles/sourceXAuxArmorOptimization.selftest.mjs',
    'src/vehicles/sourceXWesternAuxArmor.selftest.mjs',
    'src/vehicles/sourceXSovietAuxArmor.selftest.mjs',
    'src/vehicles/fixedSourceSkirtPaint.selftest.mjs',
    'tools/appVersion.selftest.mjs',
    'tools/shared-main-preflight.selftest.mjs',
    'tools/vercel-config.selftest.mjs',
    'tools/publicBuildEnv.selftest.mjs',
    'tools/vercel-output-immutable.selftest.mjs',
    'tools/typescriptToolchain.selftest.mjs',
    'tools/existing-document-route.selftest.mjs',
    'tools/geometry-gate-policy.selftest.mjs',
    'tools/tank-sealed-check.selftest.mjs',
    // 2026-10-17 (227 gun-gaps): the nine closed gun junctions at rest/elevation/depression and a seeded tube pull
    'tools/gun-junction-census.selftest.mjs',
    // release 264 (Main 2026-10-28): the roofs-without-walls ledger, shrink-only fleet-wide, two rows re-measured
    'tools/roof-pocket-census.selftest.mjs',
    // 2026-10-19 (owner Gallery markups): real-contact hull census — closed bellies and hung flaps
    'tools/hull-contact-census.selftest.mjs',
    // the build-time flap hangers (P.hangMudguard) and the fleet flaps they hang
    'src/vehicles/mudguardHangers.selftest.mjs',
    // the build-time fitting snap (P.snapGroup, seatOnRig): floating fittings seated onto the hull/turret stock
    'src/vehicles/fittingSnap.selftest.mjs',
    'tools/reference-supplement.selftest.mjs',
    // 262 (Main's ruling on the owner's Oplot kit): each set-aside owner-kit part is one rigid group under its rig
    'tools/owner-kit-targets.selftest.mjs',
    'tools/fidelity-component-floor.selftest.mjs',
    'tools/fidelity-visibility.selftest.mjs',
    // 262 (Main's ruling on the Challenger 3 TD): each oracle-blind fleet part is named, ruled and carried once
    'tools/oracle-blind-parts.selftest.mjs',
    'tools/procedural-fidelity-lifecycle.selftest.mjs',
    'tools/isolated-capture-browser.selftest.mjs',
    'tools/reference-gun-pivot.selftest.mjs',
    'tools/source-world-registration.selftest.mjs',
    // 266: the gate page's reference table names each id once; certified ids register their private local oracle
    'tools/reference-override-registry.selftest.mjs',
    'tools/source-dimension-frame.selftest.mjs',
    // 266 (Main's ruling 2026-10-30): the gate's dims measure the body; a 1 m whip leaves its height, a raised hull moves it
    'tools/body-height-parts.selftest.mjs',
    // 266 (Main 2026-10-31): a fused source names its roof gun by registered boxes; the boxed ids' records compare body to body
    'tools/fused-roof-gun-boxes.selftest.mjs',
    // 267 (Main 2026-10-31): whips found by their geometry (a thin rod whose tip stands clear) carry the antenna role
    'tools/whip-rods.selftest.mjs',
    // 267 (Main 2026-10-31): stowage (drums, cradles, racks, baskets) leaves the gate's body on both sides, the ruler whole
    'tools/gate-stowage.selftest.mjs',
    // 267 (Main 2026-11-01): an oracle is measured only as the version its pin names; the ledger holds only the fleet's ids
    'tools/gate-oracle-pins.selftest.mjs',
    // 266: gate:repin's chunks (one capture ticket each) stop at the first failing chunk; a row it cannot re-pin is named
    'tools/gate-repin.selftest.mjs',
    'tools/source-comparison-cameras.selftest.mjs',
    'tools/native-interior-fill-policy.selftest.mjs',
    'tools/interior-fill-selection.selftest.mjs',
    // 2026-10-29 (the owner's voxel blocks): committed fills inside the current body; seeded stale fills caught
    'tools/interior-fill-exposure.selftest.mjs',
    // 2026-10-16 (test-speed R4c): duplicate ids fail loudly in every fleet tool; browser tools' ports and first loads
    'tools/id-list.selftest.mjs',
    'tools/tool-page-load.selftest.mjs',
    // 266: the GPU steps' page is served only the public directories their keys read; any other public file is refused
    'tools/icons-page-public.selftest.mjs',
    // 267: the icons page keys only the catalog strings it draws; an undeclared key fails its tools' runs
    'tools/page-catalog-keys.selftest.mjs',
    'tools/sealed-ledger-policy.selftest.mjs',
    'tools/muzzle-seat-policy.selftest.mjs',
    'tools/receipt-repin.selftest.mjs',
    // the shared receipt kit (near, nearStrict, geometryHash, graphLabels) about 150 receipts import
    'tools/receipt-kit.selftest.mjs',
    // 2026-10-16 (test-speed R10): no assert equality on three.js graph objects in any receipt (the 226 T-72 receipts
    // dumped and diffed two scene graphs to 28-40 GB); a per-file byte-keyed cache keeps an unchanged tree under 1 s
    'tools/object3d-assert-lint.selftest.mjs',
    // 229: the runtime half (every child preloads it): a failing graph-object assert fails fast with labels.
    'tools/assert-graph-guard.selftest.mjs',
    'tools/muzzle-bore-inventory.selftest.mjs',
    'tools/source-x-oracle.selftest.mjs',
    'src/vehicles/eraAuthoredFaces.selftest.mjs',
    'src/vehicles/eraBindingReceipt.selftest.mjs',
    'src/vehicles/battleEraReceipt.selftest.mjs',
    'src/world/wreckEraReceipt.selftest.mjs',
    'tools/section-slab-bounds.selftest.mjs',
    'tools/board-camera.selftest.mjs',
    'tools/technical-framing.selftest.mjs',
    'tools/presentation-receipt.selftest.mjs',
    'tools/portrait-camera.selftest.mjs',
    'src/vehicles/sourceXMarkings.selftest.mjs',
    'src/vehicles/trackShoeDimensions.selftest.mjs',
    'src/vehicles/continuousShoeFloor.selftest.mjs',
    'tools/track-course-intervals.selftest.mjs',
    'src/vehicles/roadWheelRestHeights.selftest.mjs',
    'src/vehicles/suspensionArmGeometry.selftest.mjs',
    'src/vehicles/returnRollerOutset.selftest.mjs',
    'src/vehicles/efficientReturnRoller.selftest.mjs',
    'src/vehicles/pairedRunningGearStock.selftest.mjs',
    'src/vehicles/loadedTrackContact.selftest.mjs',
    // 229 perf: the allocation-free hypot the per-frame track paths use equals Math.hypot bit for bit
    'src/vehicles/scalarHypot.selftest.mjs',
    'src/vehicles/roadWheelTrackSpan.selftest.mjs',
    'src/vehicles/trackRollerSag.selftest.mjs',
    'src/vehicles/runningGearGroundRun.selftest.mjs',
    'src/vehicles/restPoseBatchedGear.selftest.mjs',
    'src/vehicles/trackCarrierSections.selftest.mjs',
    'src/vehicles/profiles/type10XRunningGear.selftest.mjs',
    'src/vehicles/returnRollerGeometry.selftest.mjs',
    'src/vehicles/profiles/merkavaXReturnRollers.selftest.mjs',
    'src/vehicles/nativeGearStockOverrides.selftest.mjs',
    'src/vehicles/abramsSourceXGeometry.selftest.mjs',
    'src/vehicles/profiles/abramsSourceXDrive.selftest.mjs',
    'src/vehicles/profiles/abramsSourceXCover.selftest.mjs',
    'src/vehicles/abramsSourceXSpecs.selftest.mjs',
    'src/vehicles/abramsSourceXRecovery.selftest.mjs',
    'src/vehicles/abramsSourceXShoulderClosure.selftest.mjs',
    'src/vehicles/abramsSourceXUserSurfaces.selftest.mjs',
    'src/vehicles/abramsSourceXMuzzle.selftest.mjs',
    'src/vehicles/abramsSourceXSkirtReturns.selftest.mjs',
    'src/vehicles/abramsSourceXRearGrilles.selftest.mjs',
    'src/vehicles/profiles/abramsSourceXUkraineKit.selftest.mjs',
    'src/vehicles/profiles/abramsSourceXSepv3Kit.selftest.mjs',
    'src/vehicles/abramsSourceXWheels.selftest.mjs',
    'src/vehicles/abramsSourceXEndGear.selftest.mjs',
    'src/vehicles/abramsSourceXTrackGuide.selftest.mjs',
    'src/vehicles/returnRollerPhysics.selftest.mjs',
    'src/vehicles/upperReturnBandStock.selftest.mjs',
    'src/vehicles/suspensionClearance.selftest.mjs',
    'src/vehicles/profiles/t90AwXDetails.selftest.mjs',
    'src/vehicles/profiles/shtora.selftest.mjs',
    'src/vehicles/profiles/t90AwXHullEnds.selftest.mjs',
    'src/vehicles/profiles/t90BurlakXRear.selftest.mjs',
    'src/vehicles/profiles/t90BurlakXSkirtMounts.selftest.mjs',
    'src/vehicles/burlakFixedSidePaint.selftest.mjs',
    // 262: the hull's rubber (skirts, flaps, mats) its own material, painted by place; the tyres bare
    'src/vehicles/hullRubber.selftest.mjs',
    'src/vehicles/fixedPaintedPanel.selftest.mjs',
    'src/vehicles/broadFixedStockPaint.selftest.mjs',
    'src/vehicles/registeredGuardPaint.selftest.mjs',
    'src/vehicles/profiles/t90msXGunBase.selftest.mjs',
    'src/vehicles/profiles/t90msXMast.selftest.mjs',
    'src/vehicles/profiles/t90msXOpticalHead.selftest.mjs',
    'src/vehicles/profiles/t90msXHullEnds.selftest.mjs',
    'src/vehicles/profiles/type10XSkirts.selftest.mjs',
    'src/vehicles/profiles/t90msXSideAssembly.selftest.mjs',
    'src/vehicles/profiles/t72b3XMachineGunBody.selftest.mjs',
    'src/vehicles/balancePeerWeighting.selftest.mjs',
    'tools/track-clip-classification.selftest.mjs',
    'tools/track-clip-result.selftest.mjs',
    'tools/track-clip-options.selftest.mjs',
    'tools/standard-continuity-policy.selftest.mjs',
    // 2026-10-16 (test-speed R4b part 1): tank-standard-check --stages runs and reports every stage after a red one
    'tools/standard-check-stages.selftest.mjs',
    // 2026-10-16 (guards 227): the §B2 hull-anchored contiguity lattice; AABB-only add-ons never move a hole (226 class)
    'tools/contig-grid.selftest.mjs',
    // 2026-10-19 (guards 229): the fleet hidden-gap audit, committed (docs/geometry-gate/contig-hidden.json): listed gaps
    // are known work orders, an unlisted, second or grown gap fails §B2; pure plan rectangles and the ledger JSON
    'tools/contig-hidden-gaps.selftest.mjs',
    'tools/concept-fixture-runner.selftest.mjs',
    'tools/source-equipment-policy.selftest.mjs',
    'tools/photo-reference-policy.selftest.mjs',
    'tools/source-configuration-record.selftest.mjs',
    'tools/source-openings-policy.selftest.mjs',
    'tools/ariete-source-openings.selftest.mjs',
    'tools/source-opening-rays.selftest.mjs',
    'tools/track-band-separation.selftest.mjs',
    'tools/source-assembly-replay.selftest.mjs',
    'tools/preservation-oracle.selftest.mjs',
    'tools/object695-epokha-reference.selftest.mjs',
    'tools/attribution-audit.mjs',
    'src/vehicles/suspensionPatterns.selftest.mjs',
    'src/sim/ammunition.selftest.mjs',
    'src/sim/ammunitionFlow.selftest.mjs',
    'src/sim/consumableRules.selftest.mjs',
    // 2026-11-02 audit M5: equipMults as named layers (equipment, mode stamps, consumables); the boss keeps x0.5 through items
    'src/sim/modeMultiplierLayers.selftest.mjs',
    'src/sim/autoloader.selftest.mjs',
    'src/sim/weaponReload.selftest.mjs',
    // 2026-11-02 audit M5: a mode weapon swap (Gun Game, the AC-130) repoints the cannon channel with the rest
    'src/sim/modeWeaponReload.selftest.mjs',
    'src/game/studioTimeline.selftest.mjs',
    'src/game/studioCrush.selftest.mjs',
    // 2026-11-02 audit A7 (round 3, U28 x Studio teardown): a teardown step that throws skips none of the rest (the crushes' release)
    'src/game/studioTeardown.selftest.mjs',
    'src/game/studioSceneLink.selftest.mjs',
    'src/game/studioSceneShare.selftest.mjs',
    'src/ui/studioPlanView.selftest.mjs',
    'src/game/studioFilmPlan.selftest.mjs',
    'src/game/studioFilmSupport.selftest.mjs',
    'src/game/studioFilmHolds.selftest.mjs', // 2026-11-02 audit U30 (round 2): a film entry that throws gives its governor and temporal-AA holds back
    'src/engine/filmDepthProbe.selftest.mjs',
    'src/game/studioFilmMux.selftest.mjs',
    'src/game/studioFilmAudio.selftest.mjs',
    'src/game/studioPicture.selftest.mjs',
    'src/game/studioProduction.selftest.mjs',
    'src/game/studioProductionPersistence.selftest.mjs',
    'src/game/studioLight.selftest.mjs',
    'src/ui/studioProductionPanel.selftest.mjs',
    'src/ui/studioQueue.selftest.mjs',
    // 2026-11-02 audit F9: Clear during a queue run skips no job, Export film waits for the queue, a hidden sound lane stops
    'src/ui/studioPanelBusy.selftest.mjs',
    // 2026-11-02 audit X9 (round 3, R6/Q17): the field-frames archive's failed sheet closes it, says so once and marks its button;
    // its next press reloads, never over the Studio's running work
    'src/ui/studioArchiveOpener.selftest.mjs',
    'tools/media-production/campaign.selftest.mjs',
    'tools/media-production/campaignPublication.selftest.mjs',
    'tools/publish-gameplay-capture.selftest.mjs',
    'tools/media-production/campaignArtwork.selftest.mjs',
    'src/game/studioRecording.selftest.mjs',
    'src/game/studioActorSupport.selftest.mjs',
    'src/game/studioSuspensionAim.selftest.mjs',
    'src/game/studioFxSettings.selftest.mjs',
    'src/game/studioTrackDust.selftest.mjs',
    'src/fx/cinematicFx.selftest.mjs',
    'src/fx/cinematicShotBlast.selftest.mjs',
    'src/fx/shellBurstColumn.selftest.mjs',
    'src/fx/killLight.selftest.mjs',
    'src/fx/absenceGrace.selftest.mjs', // 2026-11-02 audit F10: a round missing from a frame has not ended (tracers, trails, wires, drones)
    'src/fx/fxLifecycles.selftest.mjs', // 2026-11-02 audit F10: the battle FX runtime's deferred beats, stage ledger, columns, visibility, HE dedupe, bus binding; a hull's event point on the hull where it stands (round 4 merge review r2), never measured from a hidden network hull's last sample (round 5 U16)
    'src/fx/heRoundRecords.selftest.mjs', // 2026-11-02 audit U31/U33 (round 2): an HE round's records outlast other rounds and a rebase; a late ground expiry keeps its marks; (round 5 U11) a record keeps its grace after its round's last drawn frame
    'src/fx/replayVeil.selftest.mjs', // 2026-11-02 audit U31 (round 2): the killcam's suppression hides the FX veil, never an owner's own flag (the lens guns)
    // 2026-10-08 (destruction core lane, P2): the Studio films the sim's own holes and falls
    'src/game/studioDestruction.selftest.mjs',
    // 2026-10-09 (destruction core lane): a Studio burst fells light props as a battle's does; strike rounds burst on the ground.
    'src/game/studioBlastFell.selftest.mjs',
    'tools/studio-example-scenarios.selftest.mjs',
    'src/vehicles/spareTrackAttachment.selftest.mjs',
    // 2026-10-15 (VEH-13): one seat solver for every spare-track run; the Strv 103 family builds clean; the fleet ledger
    'src/vehicles/spareTrackSeat.selftest.mjs',
    // 2026-10-16 (VEH-13 outline rule): the receipt's PROUD class and its seeded break
    'tools/spare-track-outline.selftest.mjs',
    // 2026-10-18 (228): ledger keys hold no line number; a line-shifted tree gates green; --update then --gate round-trips
    'tools/spare-track-key.selftest.mjs',
    // 247: plate-fitted collision cells lie on their slice's plates, hold its hull to the tolerance, carry no sliver
    'tools/plate-fitted-cell.selftest.mjs',
    'src/vehicles/turretBarrelCircularity.selftest.mjs',
    'src/vehicles/profiles/gunTopFixturePlacement.selftest.mjs',
    'src/vehicles/profiles/bradleyHullClosure.selftest.mjs',
    'src/vehicles/profiles/bradleyRunningGear.selftest.mjs',
    'src/vehicles/profiles/t90BurlakRearScale.selftest.mjs',
    'src/vehicles/profiles/t90XTwins.selftest.mjs',
    'src/vehicles/profiles/t90MachineGunForward.selftest.mjs',
    'src/vehicles/profiles/t90RoofStudioSelectability.selftest.mjs',
    'src/vehicles/profiles/sovietChevronEraFleet.selftest.mjs',
    'src/vehicles/profiles/t84OplotTurret.selftest.mjs',
    'src/vehicles/profiles/t64RunningGearTurretCenter.selftest.mjs',
    'src/vehicles/profiles/t64Foundation.selftest.mjs',
    'src/vehicles/profiles/t64GunClearance.selftest.mjs',
    'src/vehicles/profiles/t80CastTurretFamily.selftest.mjs',
    'src/vehicles/profiles/t80MachineGunSeat.selftest.mjs',
    'src/vehicles/profiles/turretEraSurfaceSeating.selftest.mjs',
    'src/vehicles/profiles/mbt70Fidelity.selftest.mjs',
    'src/vehicles/profiles/mbt70UpperFenders.selftest.mjs',
    'src/sim/specialActions.selftest.mjs',
    'src/vehicles/profiles/leopard1A5Source.selftest.mjs',
    // 268: the Flakpanzer Gepard 1A2 on the shared Leopard 1 hull: frame, bores, crew, height, gun and hull clearance
    'src/vehicles/profiles/gepard.selftest.mjs',
    'src/vehicles/profiles/leopard1A2A1Source.selftest.mjs',
    'src/vehicles/profiles/leclercTrackCourse.selftest.mjs',
    'src/vehicles/profiles/japaneseCastTurrets.selftest.mjs',
    'src/vehicles/profiles/abramsTuskCheek.selftest.mjs',
    'src/vehicles/profiles/abramsTuskBellyLip.selftest.mjs',
    'src/vehicles/profiles/abramsTrackLayer.selftest.mjs',
    'src/vehicles/profiles/abramsSepv3RoofStation.selftest.mjs',
    'src/vehicles/profiles/abramsRoofSeating.selftest.mjs',
    'src/vehicles/profiles/abramsCwsRoofSeating.selftest.mjs',
    'src/vehicles/profiles/m1a1Mantlet.selftest.mjs',
    'src/vehicles/profiles/abramsXRoofSeating.selftest.mjs',
    'src/vehicles/profiles/abramsXTurretPivot.selftest.mjs',
    'src/vehicles/profiles/m1a3Concept.selftest.mjs',
    'src/vehicles/profiles/abramsUpgradePackage.selftest.mjs',
    'src/vehicles/profiles/openYokeRwsFleet.selftest.mjs',
    'src/vehicles/profiles/arieteProportions.selftest.mjs',
    'src/vehicles/profiles/arieteTurretOwnership.selftest.mjs',
  'src/vehicles/vehicleSize.selftest.mjs',
  'src/vehicles/escortModernization.selftest.mjs',
  'src/vehicles/chineseMantletFit.selftest.mjs',
  'src/vehicles/aresFlanking.selftest.mjs',
    'src/vehicles/profiles/vickersGlacisSeating.selftest.mjs',
    'src/vehicles/profiles/ukScaleWeapons.selftest.mjs',
    'src/vehicles/profiles/kf51bTurretCenter.selftest.mjs',
    'src/vehicles/profiles/leopardStructuralRepairs.selftest.mjs',
    'src/vehicles/profiles/kf51FrontFinish.selftest.mjs',
    'src/vehicles/profiles/pumaS1.selftest.mjs',
    'src/vehicles/profiles/marder2.selftest.mjs',
    'src/vehicles/profiles/m6Linebacker.selftest.mjs',
    // 268: the M3A2 under the classic turret (its photo packet fixture)
    'src/vehicles/profiles/m3a2Bradley.selftest.mjs',
    'src/vehicles/profiles/m3BradleyGunMount.selftest.mjs',
    'src/vehicles/profiles/type89LightTiger.selftest.mjs',
    'src/vehicles/profiles/cv90.selftest.mjs',
    'src/vehicles/profiles/ifvMantletAndBow.selftest.mjs',
    'src/vehicles/profiles/modern3PrimaryStock.selftest.mjs',
    'src/vehicles/profiles/type100.selftest.mjs',
    'src/vehicles/profiles/type100RunningGear.selftest.mjs',
    'src/vehicles/profiles/ztz20Family.selftest.mjs',
    'src/vehicles/profiles/ztz100Prototype.selftest.mjs',
    'src/vehicles/profiles/object695X.selftest.mjs',
    'src/vehicles/profiles/aresApcX.selftest.mjs',
    'tools/ares-apc-x-reference.selftest.mjs',
    // 262: the T-84BM Oplot-M's registered comparison oracle
    'tools/oplot-bm-x-reference.selftest.mjs',
    'src/vehicles/trackGlitchSimulation.selftest.mjs',
    'src/vehicles/trackEndRamp.selftest.mjs',
    'src/vehicles/guidedLauncherTubes.selftest.mjs',
    'src/vehicles/launcherOrigins.selftest.mjs',
    'src/vehicles/ifvReplicas.selftest.mjs',
    'src/vehicles/europePhotoIfvs.selftest.mjs',
  'src/vehicles/amx10p.selftest.mjs',
    'src/vehicles/staggeredTrackGround.selftest.mjs',
    'src/vehicles/profiles/leopardRevolutionTurretCenter.selftest.mjs',
    'src/vehicles/profiles/leopardRevolutionGeometry.selftest.mjs',
    'src/vehicles/profiles/leopardReturnRollers.selftest.mjs',
    'src/vehicles/profiles/sectionSolid.selftest.mjs',
    'tools/base-shell-audit-math.selftest.mjs',
    'src/vehicles/profiles/abramsCheekSurfaces.selftest.mjs',
    'src/vehicles/profiles/abramsReturnCourses.selftest.mjs',
    'src/game/missionAttachmentMechanical.selftest.mjs',
    'src/vehicles/missionAttachmentReceiver.selftest.mjs',
    'tools/mission-attachment-support.selftest.mjs',
    'tools/mission-attachment-seat-trials.selftest.mjs',
    'src/vehicles/profiles/weldedShellSurfaces.selftest.mjs',
    'src/vehicles/profiles/baseShellResidualRepairs.selftest.mjs',
    'tools/base-shell-integrity.selftest.mjs',
    'tools/base-shell-live-stock.selftest.mjs',
    'src/vehicles/profiles/abramsPlanarCheek.selftest.mjs',
    'src/vehicles/profiles/facetedSlab.selftest.mjs',
    'src/vehicles/profiles/nationalBaseShell.selftest.mjs',
    'src/vehicles/profiles/nationalRussiaChevrons.selftest.mjs',
    'src/vehicles/profiles/chineseChevronEra.selftest.mjs',
  'src/vehicles/profiles/fieldEquipment.selftest.mjs',
    'src/vehicles/profiles/chineseFuelDrum.selftest.mjs',
    'src/vehicles/profiles/oplotWing.selftest.mjs',
    'src/vehicles/profiles/t14XGeometry.selftest.mjs',
    'src/vehicles/profiles/t14XReturnRollers.selftest.mjs',
    'src/vehicles/sourceXFleet.selftest.mjs',
    'src/vehicles/t90XCanvasFinish.selftest.mjs',
    'src/vehicles/sourceXSecondWave.selftest.mjs',
    'src/vehicles/sourceXSecondWaveLazy.selftest.mjs',
    'src/vehicles/sourceXSecondWaveMarkings.selftest.mjs',
    'src/vehicles/sourceXSecondWaveOptics.selftest.mjs',
    'src/vehicles/profiles/t62mv1XSight.selftest.mjs',
    'src/vehicles/profiles/k1a1X.selftest.mjs',
    'src/vehicles/profiles/leopardA6X.selftest.mjs',
    'src/vehicles/profiles/leclercX.selftest.mjs',
    'src/vehicles/profiles/leclercClassicX.selftest.mjs',
    'src/vehicles/profiles/leclercXFrontSkirts.selftest.mjs',
    'src/vehicles/profiles/leclercXRearRack.selftest.mjs',
    'src/vehicles/profiles/leclercXSourceFittings.selftest.mjs',
    'src/vehicles/profiles/leclercXPortRoof.selftest.mjs',
    'src/vehicles/profiles/chieftain10X.selftest.mjs',
    'src/vehicles/profiles/chieftain10XMk5Foundation.selftest.mjs',
    'src/vehicles/profiles/chieftain10XStillbrewCollision.selftest.mjs',
    'src/vehicles/profiles/chieftain10XFenderCases.selftest.mjs',
    'src/vehicles/profiles/chieftain10XServiceFrame.selftest.mjs',
    'src/vehicles/profiles/chieftain10XCastCupola.selftest.mjs',
    'src/vehicles/profiles/amx30X.selftest.mjs',
    'src/vehicles/profiles/sourceXVisibleWheelFaces.selftest.mjs',
    'src/vehicles/profiles/amx30XAftReturn.selftest.mjs',
    'src/vehicles/profiles/amx40X.selftest.mjs',
    'src/vehicles/profiles/amx40XHullSkirts.selftest.mjs',
    'src/vehicles/profiles/amx40XFrontFittings.selftest.mjs',
    'src/vehicles/profiles/amx40XRoofFixtures.selftest.mjs',
    'src/vehicles/profiles/amx40XTurretEquipment.selftest.mjs',
    'src/vehicles/profiles/t72b3XGeometry.selftest.mjs',
    'src/vehicles/profiles/t72b3mXGeometry.selftest.mjs',
    'src/vehicles/profiles/t72b3mXSideMounts.selftest.mjs',
    'src/vehicles/profiles/t72b3XEquipment.selftest.mjs',
    'src/vehicles/profiles/jagdpanzerE100X.selftest.mjs',
    'src/vehicles/profiles/type10X.selftest.mjs',
    'src/vehicles/profiles/type10XRoofPanels.selftest.mjs',
    // release 267: the TK-X and the Type 10B on the modern Type 10 (their photo packets' fixture), and the Type 90 (B)
    'src/vehicles/profiles/type10Marks.selftest.mjs',
    'src/vehicles/profiles/type90X.selftest.mjs',
    'src/vehicles/profiles/type90B.selftest.mjs',
    'src/vehicles/profiles/arieteX.selftest.mjs',
    'src/vehicles/profiles/arieteXSupplied.selftest.mjs',
    'src/vehicles/profiles/arieteXSuppliedRearTow.selftest.mjs',
    'src/vehicles/profiles/challenger1XSupplied.selftest.mjs',
    'src/vehicles/profiles/challenger1XSourceHood.selftest.mjs',
    // 264c: the TOGS barbette past LOD1 and in the turret shadow proxy (rangeSilhouette)
    'src/vehicles/profiles/challenger1XRangeSilhouette.selftest.mjs',
    'src/vehicles/profiles/strv122X.selftest.mjs',
    'src/vehicles/profiles/strv122XSupplied.selftest.mjs',
    'src/vehicles/profiles/strv122XSuppliedGear.selftest.mjs',
    'src/vehicles/profiles/strv122XSuppliedFrontClearance.selftest.mjs',
    'src/vehicles/profiles/strv122XSuppliedBow.selftest.mjs',
    'src/vehicles/profiles/strv122XSuppliedEquipment.selftest.mjs',
    'src/vehicles/profiles/strv122XSuppliedCupola.selftest.mjs',
    'src/vehicles/profiles/strv122XSurfaceAssembly.selftest.mjs',
    'src/vehicles/profiles/k1a1XWheels.selftest.mjs',
    'src/vehicles/profiles/k1a1XMachineGun.selftest.mjs',
    'src/vehicles/profiles/arieteXPhotoDetails.selftest.mjs',
    'src/vehicles/profiles/chieftain10XEngineDeck.selftest.mjs',
    'src/vehicles/profiles/chieftain10XGunCarriage.selftest.mjs',
    'src/vehicles/profiles/t90AwXTowCables.selftest.mjs',
    'src/vehicles/profiles/t90AwXCheekLeaves.selftest.mjs',
    'src/vehicles/profiles/t90AwXApsHousings.selftest.mjs',
    'src/vehicles/profiles/t90AwXAAContainers.selftest.mjs',
    'src/vehicles/profiles/t90AwXSideMounts.selftest.mjs',
    'src/vehicles/profiles/t90AwXSmallOptics.selftest.mjs',
    'src/vehicles/profiles/t90AwXCastUnderside.selftest.mjs',
    'src/vehicles/profiles/t90AwXRearStowage.selftest.mjs',
    'src/vehicles/profiles/t90AwXRemainingRoof.selftest.mjs',
    'src/vehicles/profiles/t90AwXMachineGun.selftest.mjs',
    'src/vehicles/profiles/chieftain10XBasket.selftest.mjs',
    'src/vehicles/profiles/chieftain10XClosureFittings.selftest.mjs',
    'src/vehicles/profiles/leclercXTrackLinks.selftest.mjs',
    'src/vehicles/profiles/leclercXRearShoulders.selftest.mjs',
    'src/vehicles/sourceXSecondWaveEra.selftest.mjs',
    'src/vehicles/turretSeatEraSpans.selftest.mjs',
    'src/vehicles/profiles/t72buXGeometry.selftest.mjs',
    'src/vehicles/profiles/awSecondWaveGeometry.selftest.mjs',
    'src/vehicles/profiles/chieftain5XSource.selftest.mjs',
    'src/vehicles/profiles/chieftain5XSourceClosure.selftest.mjs',
    'src/vehicles/profiles/roundedTrackContact.selftest.mjs',
    'tools/second-wave-x-reference.selftest.mjs',
    'src/vehicles/profiles/sovietSecondWaveGeometry.selftest.mjs',
    'src/vehicles/sourceXArticulation.selftest.mjs',
    'src/vehicles/sourceXEra.selftest.mjs',
    'src/vehicles/sourceXEraMultiplicity.selftest.mjs',
    'src/vehicles/profiles/sourceEraCover.selftest.mjs',
    'src/vehicles/profiles/leopardXEraBinding.selftest.mjs',
    'src/vehicles/profiles/t14XEraBinding.selftest.mjs',
    'src/vehicles/profiles/t90XEraBindings.selftest.mjs',
    'src/vehicles/profiles/t90AXFenderClosures.selftest.mjs',
    'src/vehicles/profiles/leopardX.selftest.mjs',
    'src/vehicles/profiles/leopardGunOpening.selftest.mjs',
    'src/vehicles/profiles/leopardA5XDetails.selftest.mjs',
    'src/vehicles/profiles/t90XGeometry.selftest.mjs',
    'src/vehicles/profiles/t90AXGun.selftest.mjs',
    'src/vehicles/profiles/t90MXHullEnds.selftest.mjs',
    'src/vehicles/profiles/t90MXEngineDeck.selftest.mjs',
    'src/vehicles/profiles/t90MXRwsHousing.selftest.mjs',
    'src/vehicles/profiles/t90SMXRearBasket.selftest.mjs',
    'src/vehicles/profiles/t90SMXEngineDeck.selftest.mjs',
    'src/vehicles/profiles/t90SMXHullTub.selftest.mjs',
    'src/vehicles/profiles/t90SMXFenderShoulders.selftest.mjs',
    'src/vehicles/profiles/t90SMXTowCable.selftest.mjs',
    'src/vehicles/profiles/t90SMXFrontEra.selftest.mjs',
    'src/vehicles/profiles/t90SMXRwsBase.selftest.mjs',
    'src/vehicles/profiles/t90SMXSmoke.selftest.mjs',
    'src/vehicles/profiles/t90SMXLauncherShelf.selftest.mjs',
    'src/vehicles/profiles/t90SMXRightLauncherBracket.selftest.mjs',
    'src/vehicles/profiles/t90SMXLeftSmokeMounts.selftest.mjs',
    'src/vehicles/profiles/t90SMXGunSaddles.selftest.mjs',
    'src/vehicles/profiles/t90AXRwsBracket.selftest.mjs',
    'src/vehicles/profiles/t90AXSmoke.selftest.mjs',
    'src/vehicles/profiles/t90AXRearGuard.selftest.mjs',
    'src/vehicles/profiles/t90VXRearGuards.selftest.mjs',
    'src/vehicles/profiles/t90VXFrontGuards.selftest.mjs',
    'src/vehicles/profiles/sourceMachineGun.selftest.mjs',
    'src/vehicles/profiles/westXGeometry.selftest.mjs',
    'src/vehicles/profiles/merkava3dLeftCheek.selftest.mjs',
    'src/vehicles/merkavaModernSpecs.selftest.mjs',
    'src/vehicles/profiles/merkavaModernGeometry.selftest.mjs',
    'src/vehicles/profiles/merkavaModernOptics.selftest.mjs',
    'src/vehicles/profiles/namerSourceAssembly.selftest.mjs',
    'src/vehicles/profiles/namerWheelStock.selftest.mjs',
    'src/vehicles/profiles/merkavaBarakSourceStock.selftest.mjs',
    'src/vehicles/profiles/merkavaBarakRearEquipment.selftest.mjs',
    'src/vehicles/profiles/merkavaBarakClosedDoor.selftest.mjs',
    'src/vehicles/profiles/merkavaAttachmentSeats.selftest.mjs',
    'src/vehicles/profiles/merkava4XRearHull.selftest.mjs',
    'src/vehicles/profiles/merkava4XEndReturns.selftest.mjs',
    'src/vehicles/profiles/merkavaXShoulderReturns.selftest.mjs',
    'src/vehicles/profiles/merkava3dXFrontReturn.selftest.mjs',
    'src/vehicles/profiles/leopardSmokeFrame.selftest.mjs',
    'src/vehicles/profiles/westXEraBinding.selftest.mjs',
    'src/vehicles/profiles/kf51XGunFit.selftest.mjs',
    'src/vehicles/profiles/k2XDetail.selftest.mjs',
    'src/vehicles/profiles/k2XReturnRollers.selftest.mjs',
    'src/vehicles/profiles/sourceK2Equipment.selftest.mjs',
    'src/vehicles/profiles/leopardA5NL.selftest.mjs',
    'src/vehicles/profiles/leopardA6MTurretSeat.selftest.mjs',
    'src/vehicles/profiles/leopardChevronTurretFront.selftest.mjs',
    'src/vehicles/profiles/turretSeatClosure.selftest.mjs',
    'src/vehicles/profiles/chieftainFidelity.selftest.mjs',
    'src/vehicles/underbodyBackdrops.selftest.mjs',
    'src/vehicles/profiles/amx40AttachmentSeat.selftest.mjs',
    'src/vehicles/profiles/amx30Mantlet.selftest.mjs',
    'src/vehicles/profiles/t72CamoCoverage.selftest.mjs',
    'src/vehicles/profiles/t72TrackFinish.selftest.mjs',
    'src/vehicles/profiles/t72MaterialLifetime.selftest.mjs',
    'src/vehicles/profiles/t72TurretCleanup.selftest.mjs',
    // 267 (lane bmpt-family-267): the Ob'yekt 199 "Ramka" BMPT Terminator's native fixture (frame, tubes, crew, height)
    'src/vehicles/profiles/bmptTerminator.selftest.mjs',
    'src/vehicles/profiles/ztz99a2RearService.selftest.mjs',
    // release 227 (CN critic round 5): the fleet Type 96B's and ZTZ-99A2's donor parts each seated on real stock
    'src/vehicles/profiles/donorStockSeating.selftest.mjs',
    // release 227: the fleet Type 96B's gun clears its hull through traverse and pitch (trimmed boot, rear-deck curve)
    'src/vehicles/profiles/type96MantletClearance.selftest.mjs',
    // release 227: the fleet Type 96B's box sight rides the gun at its measured top; the mantlet stands over the hull
    'src/vehicles/profiles/type96bSightBoot.selftest.mjs',
    'src/vehicles/profiles/type99AAngularTurret.selftest.mjs',
    // release 262: the Longwei concept's native profile fixture (its first-party concept route's test)
    'src/vehicles/profiles/longwei.selftest.mjs',
    // release 264: the Longwei family, four hosts' hulls under the Longwei turret with their own kits
    'src/vehicles/profiles/longweiFamily.selftest.mjs',
    'src/vehicles/profiles/chineseGunMountEraSpent.selftest.mjs',
    'src/vehicles/profiles/eraSeating.selftest.mjs',
    // 267: the per-tank ERA seating pins (id-scoped tanks suite) and the whole-fleet ERA agreement sweep (manual fleet
    // suite); eraSeating.selftest.mjs keeps the rule's negative controls and held list in the default tier
    'src/vehicles/profiles/eraSeatingPins.selftest.mjs',
    'src/vehicles/profiles/eraSeatingFleet.selftest.mjs',
    'src/vehicles/profiles/fleetEraFinish.selftest.mjs',
    'src/vehicles/profiles/pl01GunGlacisCrows.selftest.mjs',
    'src/vehicles/profiles/pl01FieldTurret.selftest.mjs',
    // release 261: both PL-01 gun fits stay in their turret-face housings and clear their hulls at every pitch
    'src/vehicles/profiles/pl01GunHousing.selftest.mjs',
    // release 262: the Leclerc turret's false roofs (owner-marked) stay closed on the S1, S2 and SXXI
    'src/vehicles/profiles/leclercRoofPockets.selftest.mjs',
    // release 264: the T-72B 1987's and T-62MV1's open commander's hatch opens into its cupola
    'src/vehicles/profiles/t72b1987HatchWell.selftest.mjs',
    'src/vehicles/profiles/uaT80Modernization.selftest.mjs',
    'src/vehicles/profiles/strv103TowRope.selftest.mjs',
    'src/vehicles/profiles/strv103ATowRope.selftest.mjs',
    'src/vehicles/profiles/udes03Fidelity.selftest.mjs',
  ]),
  core: Object.freeze([
    // Group independent full-fleet builders to fill the four CPU slots before
    // the 45-second FIFO drain. The default-build pass hosts combatAnatomy, mudguardFenderSeating,
    // vehicleMarkings and tankAssets (2026-10-02).
    'src/vehicles/fleetPassDefault.selftest.mjs',
    'src/vehicles/fleetFloorClearance.selftest.mjs',
    // release 268 (Main): a suit-painted marking is backed by its suit within the armour's 5 cm, and by nothing farther
    'src/vehicles/vehicleMarkingSuitBacking.selftest.mjs',
    // 267 (Main): every internal module sketch mostly inside its armour, with a KNOWN ratchet (fleet suite)
    'tools/module-outside-share.selftest.mjs',
    // 2026-10-25 (the coordinator's pinned-math ruling): the authority's deterministic math is the Rust jsmath bit for
    // bit, and its import graph calls no native transcendental (tools/det-math-lint.mjs)
    'src/sim/detMath.selftest.mjs',
    // 2026-10-16 (release 227; the owner: "brand new era packages ... innovate for the hetman 2 and zubr 2 and also the
    // zubr ... machine gun emplacements that are aut ocontrolled"): the three frontal ERA packages, lights, WKM-B stations
    // and rear-arc gun curves
    'src/vehicles/frontEraPackages.selftest.mjs',
    'src/vehicles/profiles/eraModuleKit.selftest.mjs',
    // 2026-10-21 (release 230, UA/PL round 11): the three ids' main gun over their own hulls with the shallower mantlet
    // chin and the gun-depression lane's curves (the barrel 25 mm, the mount 20 mm off the hull at every yaw)
    'src/vehicles/nationalGunMantlet.selftest.mjs',
    // the fleet pass harness itself, on a scripted factory (no fleet build)
    'src/vehicles/fleetPass.selftest.mjs',
    // 2026-10-01: the fleet geometry ledger (one full-fleet HIGH+LOW sweep) replaces the frozen per-receipt geometry pins.
    'src/vehicles/fleetGeometryLedger.selftest.mjs',
    // 2026-10-17 (227 guards, after the 226 T-90M blade): every tank's belly pan, track bottom and combat hull box within
    // 5 cm of docs/geometry-gate/sim-floors.json, read from the committed calibration (data only; a drifting id is built
    // once to name the parts responsible); gen-combat-anatomy gates its own fresh measurement the same way.
    'tools/anatomy-floor-drift.selftest.mjs',
    // 2026-10-01: one fleet on every path (each facade alone, every saved spec digested).
    'src/vehicles/fleetParity.selftest.mjs',
    'tools/media-production/pipeline.selftest.mjs',
    // 2026-11-02 audit S5: cinema's lease-over exit is its own number, not the selftests' STARVED 75
    'tools/media-production/lease-exit.selftest.mjs',
    'tools/media-r5/motion-type.selftest.mjs',
    'tools/media-r5/site50.selftest.mjs',
    'tools/media-r5/motion.selftest.mjs',
    'tools/media-r5/world-model.selftest.mjs',
    'tools/media-r5/wire-model.selftest.mjs',
    'tools/media-r5/films/restore.selftest.mjs',
    'tools/media-r5/fleet-media.selftest.mjs',
    'tools/media-r5/site-video-budget.selftest.mjs',
    // 2026-11-02 audit S5: site-loops writes each format whole or not at all, and resumes only from whole takes
    'tools/media-r5/site-loops-resume.selftest.mjs',
    // 2026-11-02 audit S4: the media lane's payback to the normal band, one rule for the lab and the finals
    'tools/media-r5/priority-yield.selftest.mjs',
    // brand-ui BUI-F7: the site's one playback policy and still helper, and the media receipts (fallbacks, rounds,
    // one still per page)
    'src/presentation/mediaPlayer.selftest.mjs',
    'src/presentation/responsivePicture.selftest.mjs',
    'tools/media-fallback.selftest.mjs',
    'tools/media-freshness.selftest.mjs',
    'tools/media-page-unique.selftest.mjs',
    'tools/viteGameEntryMeta.selftest.mjs',
    'tools/media-r5/fleet.selftest.mjs',
    // 267: the fleet's media backlog (every vehicle leads a take, the survey bars): the manual media suite
    'tools/media-r5/fleet-coverage.selftest.mjs',
    'tools/media-r5/fleet-rekey.selftest.mjs',
    'tools/media-r5/combat.selftest.mjs',
    // 2026-10-26: the duel wall in motion, takes 234-245 (site50.mjs DUEL_TABLE): races, quiet fire, a knockout each
    'tools/media-r5/duels.selftest.mjs',
    'tools/media-r5/master-filter.selftest.mjs',
    'tools/public-repo-hygiene.selftest.mjs',
    'tools/tool-only-public-files.selftest.mjs',
    'tools/strip-nc-probe-cache.selftest.mjs',
    'server/processShutdown.selftest.mjs',
    'tools/local-import-integrity.selftest.mjs',
    'tools/bundle-budget.selftest.mjs',
    'tools/hot-path-alloc.selftest.mjs',
    'tools/frontend-budget.selftest.mjs',
    'tools/viteSharedWorkers.selftest.mjs',
    'tools/viteGlslMinify.selftest.mjs',
    // 2026-10-18 (brand-ui BUI-F3): the CSS-in-TS minifier keeps every literal the same stylesheet (Lightning CSS)
    'tools/viteCssInTsMinify.selftest.mjs',
    'tools/viteSpeculationRules.selftest.mjs',
    'tools/viteResponsiveSeed.selftest.mjs',
    'tools/vercel-static-preview.selftest.mjs',
    'tools/telemetry-report.selftest.mjs',
    'tools/browser-failure-evidence.selftest.mjs',
    'tools/battle-entry-sweep.selftest.mjs',
    'tools/multiplayer-frame-trace.selftest.mjs',
    'tools/terrain-stream-benchmark.selftest.mjs',
    'tools/terrain-fast-cache-benchmark.selftest.mjs',
    'tools/selftest-suites.selftest.mjs',
    'tools/run-selftests.selftest.mjs',
    'tools/selftest-process-groups.selftest.mjs',
    // 266 (owner 2026-10-30): the default and manual tiers, their callers, lane mode and the heavy-suite recommender
    'tools/selftest-tiers.selftest.mjs',
    'tools/test-commands-exit.selftest.mjs',
    'tools/test-base.selftest.mjs',
    'tools/selftest-cache.selftest.mjs',
    'tools/selftest-cache-dir.selftest.mjs',
    // 2026-10-20 (after 228p): listing receipts select and key on what they list (tools/selftest-scans.mjs)
    'tools/selftest-scans.selftest.mjs',
    'tools/selftest-cpu-pool.selftest.mjs',
    'tools/selftest-schedule.selftest.mjs',
    'tools/gate.selftest.mjs',
    // 267: test:lane's red classes (OWN, INHERITED, FLAKY) and the base results kept by input fingerprint
    'tools/lane-reds.selftest.mjs',
    'tools/release.selftest.mjs',
    // 2026-11-02 audit S5: a live deploy recorded before verify, an owned cache lock, each Worker's commit on record
    'tools/release-record.selftest.mjs',
    'src/vehicles/fleetSweep.selftest.mjs',
    'tools/code-quality-metrics.selftest.mjs',
    'tools/capture-lock.selftest.mjs',
    // 2026-11-02 audit S4: one acquire per instance (no leaked render slot, no wait on its own pid) and nested holds
    'tools/capture-lock-reentry.selftest.mjs',
    // 2026-11-02 audit S4: a lock class taken by default (exclusive) is said and recorded; the media renderers name theirs
    'tools/capture-lock-class.selftest.mjs',
    'tools/capture-hold.selftest.mjs',
    // 2026-11-02 audit S4: one owner of a hold's cap, budget, grace and yield (withCaptureHold, runWarmHold)
    'tools/capture-hold-phases.selftest.mjs',
    // 2026-10-26 (item 244): the browser guard trips on a hog page (tree killed, lock released, exit 86), and every browser
    // launch in the checkout goes through it; 266: every browser over tank ids takes its chunks from browser-id-chunks.mjs
    'tools/browser-launch.selftest.mjs',
    // 2026-11-02 audit S4: a trip that keeps the process running releases only the holds its caller names
    'tools/browser-guard-holds.selftest.mjs',
    // 2026-11-02 audit B16 (round 3): a guarded launch hands puppeteer handleSIGINT false, so a hold's unwind and a tool's own
    // SIGINT handler run on Ctrl-C as on SIGTERM; with no other owner SIGINT still exits 130 and kills the browser
    'tools/browser-launch-sigint.selftest.mjs',
    'tools/browser-launch-census.selftest.mjs',
    // 2026-11-02 audit S4: the capture-hold census (no retired memory-guard gate; the hold wrapper and its direct acquirers)
    'tools/capture-hold-census.selftest.mjs',
    // 2026-10-05: the polite lock's patient head — the older waiter of one session keeps the head while the session mutex
    // is busy and takes it when it frees (the old step-behind rule handed it to the newer); the cap; no FIFO lock waiting
    'tools/visual-census-lock.selftest.mjs',
    // 2026-11-02 audit S4: the probe mutex has an owner (a dead holder's reaped, a live or shell holder's never)
    'tools/session-mutex.selftest.mjs',
    // 2026-11-02 audit U38 (round 2): the hold CLI, one normal-ticket hold per command whose tools nest in it; exit 77 on a wait
    'tools/with-capture-lock.selftest.mjs',
    'tools/frame-budget-probe.selftest.mjs',
    // 2026-11-02 audit A5 (round 3): a cap stop mid-unit leaves the unit for the next run (exit 3) in each acquireProbeLocks
    // caller (frame-budget-probe, battle-memory-probe, battle-spike-census and its gate, shadow-cache-truth, time-to-battle)
    'tools/probe-unit-stop.selftest.mjs',
    // 2026-11-02 audit F12/E10 (round 4): turret-parent-audit, marketing-shots/shoot and studio-example-videos, on a stand-in
    // lock and browser (mock clock), yield at the cap inside their graces, keep what finished past a stop (exit 3) and exit
    // 128 + n on a signal
    'tools/long-hold-users.selftest.mjs',
    'tools/battle-spike-analysis.selftest.mjs', // battle-spikes-253: the spike census's attribution on a synthetic battle of known causes
    'tools/battle-spike-census.selftest.mjs', // battle-spikes-253: the streamed trace's splitter, the census's arguments
    'tools/battle-spike-budget.selftest.mjs', // battle-spikes-253: the spike-budget receipt's judge and the shipped budget
    'tools/battle-memory-probe.selftest.mjs', // battle-spikes-253: the memory receipt's growth across battles and its judge
    'tools/heap-retainers.selftest.mjs', // battle-spikes-253: a leaked object's strong retainer paths from a streamed heap snapshot
    'tools/pr-census.selftest.mjs', // 2026-10-07 (the perf census lane, ported 2026-10-23): the whole-PR draw census's report, batches, FIFO hold and terrain settle
    'tools/capture-command.selftest.mjs',
    'tools/tank-release-plan.selftest.mjs',
    // 2026-10-16 (227, owner: "no regenerating for tanks or anything else that didn't change"): the changed-only
    // resolver on a fixture fleet, then the real fleet's partition, pinned dynamic reads and the chain order.
    'tools/changed-only/resolver.selftest.mjs',
    'tools/changed-only/fleet-partition.selftest.mjs',
    // The world steps' per-map keys on a fixture world (map configs, world core, wreck donors, fail-closed reads).
    'tools/changed-only/world.selftest.mjs',
    // The real chain end to end on a fixture fleet: changed-only == whole-fleet regen byte for byte, order, --verify.
    'tools/changed-only/chain.selftest.mjs',
    // 2026-11-02 audit S5: one chain per tree (an owned lock, no check-then-write), a stop that sweeps every child group
    // before the unlock, and a budget that tears down before it exits
    'tools/chain-lifecycle.selftest.mjs',
    // 268: the anatomy step's parallel parts merge byte for byte as one run; a part never writes a shared file
    'tools/combat-anatomy-parts.selftest.mjs',
    // Generator freshness at resolver cost (R8d): committed fleet outputs current for release/fingerprints.tsv.
    'tools/changed-only/fresh.selftest.mjs',
    // 266 (Main): the balance pass keyed per id through the spec rows: a one-id lever on the real fleet marks that id on
    // the combat readers alone (manual: fleet suite).
    'tools/changed-only/balance-keys.selftest.mjs',
    'src/app/checkedIntegrationPort.selftest.mjs',
    'src/app/lazyRuntimeOwner.selftest.mjs',
    'src/app/lazyImportRetry.selftest.mjs',
    // 2026-11-02 audit R6: one lazy-chunk failure policy (a failed stylesheet in any part, a removed chunk or an opener terminal;
    // a module asked again past a backoff capped at a minute, with no budget)
    'src/app/lazyChunk.selftest.mjs',
    // 2026-11-02 audit R6: the named lazy chunks and the session-long memos hold their load in app/lazyChunk.ts; no new
    // hand-made memo or failure-cleared latch; a default-policy load of several parts settles them with importAll; every
    // lazy stylesheet is held and has one owner per document; (round 4 F2 review) the lifecycle-edge asks (backoff:
    // false, entry: true, the Studio relight in the spellings it reads) held to their callers, (round 5 U8) with
    // relights planted on a per-move path that it must name
    'src/app/lazyChunkSites.selftest.mjs',
    // 2026-11-02 audit R6 (review round 2): the hero cards' one load keeps a failed heroCard.css for every surface
    'src/ui/heroCardChunk.selftest.mjs',
    // 2026-11-02 audit R6: a failed notice kit or battle notice region chunk is asked again by the next battle notice
    'src/ui/battleNoticesLoadFailure.selftest.mjs',
    // 2026-11-02 audit R6: a failed paint is painted again (three in a row at most); no DOM still caches its null
    'src/vehicles/paintCaches.selftest.mjs',
    // 2026-11-02 audit R6: the Gallery's load failure edge and latest-show waiters; the HUD editor's backdrop decode
    'src/ui/cachedFailures.selftest.mjs',
    // 2026-11-02 audit R6 (round 2 U35): no Gallery anatomy scene is disposed mid-link, so every prepare settles
    'src/gallery/anatomyViewLinkDispose.selftest.mjs',
    // 2026-11-02 audit R6: a failed interior-fill, turret-ring or prebuild chunk is asked again; the builder predicate needs the fills
    'src/vehicles/builderLoadFailure.selftest.mjs',
    'src/dev/debugSurface.selftest.mjs',
    'src/ui/i18n.selftest.mjs',
    'src/ui/i18nRuntime.selftest.mjs',
    'src/ui/i18nLazyCatalog.selftest.mjs',
    // 2026-10-16 (test-speed): the registry's chunk import keeps the locale runtime's receipts reusable
    'src/ui/i18nChunkImport.selftest.mjs',
    // 2026-10-18 BUI-F8: ICU/Intl formatting, the pseudo-locale and the catalog-shape check; the glossary as the single
    // source of SPEC 11.2 names; the literal-ban lint's ratchet; build-time /cn body localization.
    'src/ui/i18nFormat.selftest.mjs',
    'src/ui/glossary.selftest.mjs',
    'tools/i18n-literal-lint.selftest.mjs',
    'src/presentation/localizedBody.selftest.mjs',
    'tools/i18n-page-catalogs.selftest.mjs',
    'src/dev/mapCaptureReadiness.selftest.mjs',
    'src/dev/debugTelemetry.selftest.mjs',
    'src/dev/driveTestAccess.selftest.mjs',
    'src/dev/driveTestController.selftest.mjs',
    'src/dev/combatTelemetry.selftest.mjs',
    'src/dev/shotViews.selftest.mjs',
    'src/dev/shotRuntime.selftest.mjs',
    'src/engine/csmShaderRelease.selftest.mjs',
    // 2026-10-16 (the perf lane): one material per program variant — live prototype twins, one uniform map
    'src/engine/programVariants.selftest.mjs',
    'src/engine/renderLayers.selftest.mjs',
    'src/engine/opaqueProgramOrder.selftest.mjs',
    // local-fps-266: a regional window's farther faces (its pane behind the frame, the dark behind the pane) layered behind
    'src/world/paneStack.selftest.mjs',
    'src/engine/shadowCasterProfiles.selftest.mjs',
    'src/engine/nearVehicleShadowDetail.selftest.mjs',
    'src/engine/articulatedShadowBatch.selftest.mjs',
    'src/engine/lodShadowFade.selftest.mjs',
    'src/engine/quality.selftest.mjs',
    // 2026-11-02 audit R3: the preset broadcast's one owner (isolated, never nested) and governor steps under a recovery cap
    'src/engine/qualityBroadcast.selftest.mjs',
    'src/engine/temporalAA.selftest.mjs',
    // 2026-11-02 audit R4: one temporal-AA owner; a Studio film holds it off and restores nothing stale
    'src/engine/temporalAaHolds.selftest.mjs',
    // round 69 (2026-09-24): the desktop light effects — policy, contact shadows, ground bounce, sun shafts, lens flare
    'src/engine/postLightFxPolicy.selftest.mjs',
    'src/engine/contactShadows.selftest.mjs',
    // 2026-10-14 (the engine-cs lane, contact r2): the scene alpha's snow band — the terrain's own snow cover for the ground occlusion
    'src/engine/sceneAlpha.selftest.mjs',
    'src/engine/vehicleOcclusion.selftest.mjs',
    'src/engine/groundBounce.selftest.mjs',
    'src/engine/sunShafts.selftest.mjs',
    'src/engine/lensFlare.selftest.mjs',
    'src/engine/cinemaPost.selftest.mjs',
    'src/engine/adaptiveQualityPolicy.selftest.mjs',
    // 2026-11-02 audit R3: the governor's suspension as named holds (a restore mid-load, a film across a load release)
    'src/engine/adaptiveHolds.selftest.mjs',
    // 2026-11-02 audit R4: the governor's tier-down warmup is each workload's, measured from its reset
    'src/engine/governorWarmup.selftest.mjs',
    'src/engine/postViewportScale.selftest.mjs',
    'src/engine/postFrameAccounting.selftest.mjs',
    'src/engine/sceneSourcePass.selftest.mjs',
    'src/engine/lateFxColorHandoff.selftest.mjs',
    'src/engine/lateFxSceneView.selftest.mjs',
    'src/engine/resolvedDepthCopy.selftest.mjs',
    'src/engine/simplexFast.selftest.mjs',
    'src/engine/resolutionPolicy.selftest.mjs',
    'src/engine/viewportRuntime.selftest.mjs',
    // 2026-11-02 audit R4: a tiny parent waits in one first-layout recovery instead of rebuilding it every 250 ms
    'src/engine/viewportRecovery.selftest.mjs',
    // 2026-10-19 (black-screen-228): the battle's black-world guard (detection, the heal ladder, receipts, zero allocation),
    // the first-frame warm's one-pass transactions, the finite guards on the temporal paths, the live warms that restore
    // before every yield, and the repro harness's summary arithmetic
    'src/engine/blackWorldGuard.selftest.mjs',
    'src/engine/postWarmFirstFrame.selftest.mjs',
    'src/engine/nanGuards.selftest.mjs',
    'src/game/liveCombatWarm.selftest.mjs',
    'tools/black-world-repro-summary.selftest.mjs',
    'src/engine/frameLoopScheduler.selftest.mjs',
    'src/engine/cameraRig.selftest.mjs',
    'src/engine/cameraRigOwner.selftest.mjs', // 2026-11-02 audit F7: one camera owner; entering one tears the last down
    // battle-camera-264: the chase framing solved from the HUD's bands (every supported layout clear of the bottom band)
    'src/engine/chaseFraming.selftest.mjs',
    // battle-camera-264: the lens shift in every rebuilt view ray (aerial, contact, clouds) and the near trees' cull
    'src/engine/cameraLens.selftest.mjs',
    'src/engine/showroomLateParts.selftest.mjs',
    // watch-mode-243: the drone's world clamp and flight, the ride-along's chase, sight, wreck hold and handovers
    'src/engine/watchCamera.selftest.mjs',
    'src/engine/garageFramePacer.selftest.mjs',
    'src/engine/phaseSceneResidency.selftest.mjs',
    'src/engine/phaseGpuResidency.selftest.mjs',
    // 2026-11-02 audit R5: the Garage GPU restore is a state; a suspend or context loss during it is kept, overlapping
    // restores share one upload
    'src/engine/phaseGpuResidencyRestoreRace.selftest.mjs',
    'src/engine/resourceLifetime.selftest.mjs',
    'src/fx/lazyRuntime.selftest.mjs',
    'src/fx/flipbookOrientation.selftest.mjs',
    'src/fx/clock.selftest.mjs',
    'src/fx/clockRebase.selftest.mjs', // 2026-11-02 audit R7: one registry of fx-clock shifts; embers, fracture holds and pieces keep their time
    // 2026-11-02 audit U33/Q15 (round 2): a rebase leaves no fx-clock stamp the runtime holds (by census, no list); (round
    // 3 B5) its scenario drives the drones, the gunship, the auxiliary systems, wires and the composer, and V8's block
    // coverage measures its reach: an fx-clock site it never runs that is not in its named KNOWN_UNREACHED list fails it,
    // and so does a listed site it now runs; (round 4 F7) a key names one site, and a clock handed under another name and
    // a read of the shared uTime uniform are sites; an unloaded src/fx module that reads the clock fails it, and so does a
    // stamp moved twice; its scenario drives the Studio cinematic layer and a round drawn past its record's bound
    // (round 5 U11: the record the drawn round's renewal keeps is walked at the rebase); (round 5 U12) it leaves the
    // two houses' destruction, what it stamps wherever that lives and the sites only it reaches, to the census whole
    // (next)
    'src/fx/fxClockStampCensus.selftest.mjs',
    // 2026-11-02 audit U12 (round 5): the census whole, with the two houses' destruction the default receipt leaves out
    // (manual: fx)
    'src/fx/fxClockStampCensusFull.selftest.mjs',
    // 2026-10-10 (physics lane, for the destruction core's natural collapses): the presentation pool of falling pieces.
    'src/fx/debrisPhysics.selftest.mjs',
    'src/gallery/chunkRecovery.selftest.mjs',
    'src/gallery/overlays.selftest.mjs',
    // 2026-10-20: the Gallery anatomy layers draw the combat data exactly, all vehicles (traceTank rays, module parts,
    // crew head shapes, hit volumes, armor model untouched)
    'src/gallery/anatomyFidelity.selftest.mjs',
    // 262: every forward turret face over a mantlet or gun-notch plate reads it (combatAnatomy.ts gunFacePlate)
    'src/vehicles/gunFacePlates.selftest.mjs',
    // 265 (FAIRNESS-265 §3, release 266): a forward turret face only partly over the gun reads, point by point, the plate
    // it lies over (sim/gunFaceSplit.ts); the M1A2 reads its SEPv2 twin across the gun face; the control without splits
    'src/vehicles/gunFaceSplit.selftest.mjs',
    // 266 (FAIRNESS-265 §8): the KF51 EVO's level rounds meet its gun slot's face and read its mantlet; the cheeks keep the front
    'src/vehicles/kf51EvoGunFace.selftest.mjs',
    'src/gallery/damageLab.selftest.mjs',
    'src/gallery/combatHitboxes.selftest.mjs',
    'src/game/armorAimOverlay.selftest.mjs',
    // 263: the armour paint by panel (a cluster's one zone; gear bare; the pose's parts live) and a battle build's draws
    'src/game/armorPaintPanels.selftest.mjs',
    // 265 (the world-reds lane, Main: every vehicle's panels baked at staging, the overlay off by default): no bake
    // while the overlay is off, staging or frames; every primed vehicle baked once it is on; its control bakes
    'src/game/armorPanelsOnDemand.selftest.mjs',
    // 243: the armour skin (the cells' outer surface the flashlight and the Gallery heat map draw) is closed and exact
    'src/game/armorSkin.selftest.mjs',
    // 262 phase 2 (off by default): zone plates — the paint's zone at a shell's entry, the slices' seams sealed
    'src/sim/armorZonePlates.selftest.mjs',
    // 267 (Main's ruling, a fleet balance move): a round whose face's plate cannot meet it reads the plate across its path
    'src/sim/armorAlongShot.selftest.mjs',
    'src/game/loadingIntent.selftest.mjs',
    'src/game/battleIntentRuntime.selftest.mjs',
    'src/game/combatFeedbackRuntime.selftest.mjs',
    'src/game/garagePedestalRuntime.selftest.mjs',
    // 2026-11-02 audit R5: each pedestal visual's residency is declared (lent stays lent until the return adopts it)
    'src/game/garagePedestalResidency.selftest.mjs',
    'src/game/garageCamoTryOn.selftest.mjs',
    'src/ui/camoPicker.selftest.mjs',
    'src/ui/garageEquipmentPicker.selftest.mjs',
    'src/ui/components/pickerMenu.selftest.mjs',
    // 2026-10-27 (owner: "the old surface needs to go away while new one comes in"): one transient surface per level, and
    // every surface the source opens registered with its owner and its place
    'src/ui/components/surfaceStack.selftest.mjs',
    // 2026-11-02 audit F5: a hidden page takes its surfaces with it; the stack is the one "a modal is open" truth
    'src/ui/components/surfaceStackOwnership.selftest.mjs',
    // 2026-11-02 audit F5: the Garage's one open state, the epoch its lazy openers check, the shared ready wait
    'src/ui/garageOpenState.selftest.mjs',
    // 2026-11-02 audit Q11/U24 (round 2): the ready wait rides the boot latch's edge; a read runs no waiter (the callouts once)
    'src/ui/gameReady.selftest.mjs',
    // 2026-11-02 audit U24 (round 2): a first show waits under the boot splash only while it covers; the return sweeps
    // the battle's hidden surfaces
    'src/ui/garageShow.selftest.mjs',
    // 2026-11-02 audit U24 / 05-ui-2 #6 (round 2): the consumables wait survives a layout sweep; a tank change or the
    // room's lock closes the picker
    'src/ui/garageConsumablesPicker.selftest.mjs',
    'src/ui/transientSurfaceRegistry.selftest.mjs',
    // 2026-10-27 (owner: "lets ensure we have good loadin gstates for everything"): every loading surface registered with
    // its lane and box for tools/loading-census.mjs, and the kit's fade-on-decode
    'src/ui/loadingSurfaceRegistry.selftest.mjs',
    'src/ui/components/reveal.selftest.mjs',
    'src/ui/components/loadFailure.selftest.mjs',
    'src/game/garagePresentationPose.selftest.mjs',
    'src/game/garageShowroomRuntime.selftest.mjs',
    'src/game/pointerLockFeedbackRuntime.selftest.mjs',
    'src/game/mobileAutoAimRuntime.selftest.mjs',
    'src/game/mobileBattleInputAccess.selftest.mjs',
    'src/game/battlePhasePolicy.selftest.mjs',
    'src/game/battleRolloutRuntime.selftest.mjs',
    'src/game/soloBattleEntryRuntime.selftest.mjs',
    'src/game/garagePhasePresentationRuntime.selftest.mjs',
    'src/game/garageEnvironmentPresentationRuntime.selftest.mjs',
    'src/game/garageSkyPresets.selftest.mjs',
    'src/game/garageWeather.selftest.mjs',
    'src/game/garageGantry.selftest.mjs',
    'src/game/garageDressingOptimization.selftest.mjs',
    'src/game/garageBayFloor.selftest.mjs',
    'src/game/garageDressingDrawRange.selftest.mjs',
    'tools/garage-draw-range-probe.selftest.mjs',
    'src/game/garageVariants.selftest.mjs',
    'src/game/garageWallLayout.selftest.mjs',
    'src/ui/garageArchitecture.selftest.mjs',
    // 2026-11-02 audit R5: one record per Garage scene pack (cancellable prewarms, a true upload latch, context-loss renewal)
    'src/ui/garageArchitectureRecords.selftest.mjs',
    // 2026-11-02 audit U25 (round 2): a cancelled hover prewarm stops at its next prepare slice; a revived one prepares the rest
    'src/ui/garagePrewarmCancel.selftest.mjs',
    // 2026-11-02 audit 06-ui-3 #7: the stage reveals a variant whole (tints with its scene), supersedes, stops on dispose
    'src/ui/garageVariantReveal.selftest.mjs',
    'src/ui/garageYardWear.selftest.mjs',
    'src/ui/garageVerdantHall.selftest.mjs',
    'src/ui/garageQualityRubric.selftest.mjs',
    // tech-tree view 252 (2026-10-25): the read-only national trees (shape, layout, the fleet once each, no progression)
    'src/techTree/techTree.selftest.mjs',
    // garage r9 (2026-10-17): the shared kit (pieces, cranes, walls, displays, platform, placement), its display atlas
    // (generator check, rect names, the swap test) and the atmosphere
    'src/ui/garageKit.selftest.mjs',
    // 2026-11-02 audit 05-ui-2 #4: a failed surface set leaves once unheld and reloads; per-handle render listeners
    'src/ui/garageTextureResidency.selftest.mjs',
    'src/ui/garageDisplayAtlas.selftest.mjs',
    // 2026-11-02 audit 05-ui-2 #5: a failed display atlas load is asked for again by the next display
    'src/ui/garageDisplayAtlasRetry.selftest.mjs',
    'src/ui/garageAtmosphere.selftest.mjs',
    'src/ui/garageDisplayPlacement.selftest.mjs',
    // garage 231 (2026-10-21): the slideshow's CRT clear of every deck, rail, column, structure and kit piece
    'src/ui/garageSlideshowClearance.selftest.mjs',
    // garage r9 (g1 lane): the outside environment from each map (generator check, landmarks, budgets)
    'src/ui/garageSkyline.selftest.mjs',
    // garage r9 (g1 lane, criterion 16): the near facility's primitives rebuilt as kit geometry
    'src/ui/garageFacilityNear.selftest.mjs',
    // garage r9 per-garage lanes: the built skylines (named map landmarks at their bearings, deterministic, bounded)
    'src/ui/garageSkylineKit.selftest.mjs',
    // garage r9 (g3): Sirocco's and Steinburg's map landmarks at their bearings, bounded and deterministic
    'src/ui/garageHorizonLandmarks.selftest.mjs',
    'tools/garage-terrain-patches.selftest.mjs',
    'tools/garage-variants-probe.selftest.mjs',
    'src/game/rosterPlanning.selftest.mjs',
    'src/game/rosterRotationMemory.selftest.mjs',
    'src/game/waveFormationSplit.selftest.mjs',
    'src/game/battleSides.selftest.mjs',
    'src/game/soloModeVerdict.selftest.mjs', // 2026-11-02 audit M3: a solo verdict the mode did not reach latches its controller (Zone Control scores no more in the hold)
    'src/game/battleSeatPlan.selftest.mjs', // the load card's teams before the world are the seated battle's (2026-10-26)
    'src/game/openingRouteLegs.selftest.mjs', // battle-spikes-253: the bots' opening routes a leg a step, each the eager route
    // 2026-10-17 (v2 progression): the proving ground run for real on its range, and the test drive's entry points.
    'src/game/provingSession.selftest.mjs',
    // 2026-10-20: the range's furniture — plates on the simulation's faces, boards, the course, the draw budget.
    'src/game/provingRangeDressing.selftest.mjs',
    // 2026-10-08 (modes lane): the solo sim and the host seat every side on the same deployment slots.
    'src/game/deploymentParity.selftest.mjs',
    'src/game/rosterVisualStaging.selftest.mjs',
    'src/game/rosterPresentation.selftest.mjs',
    'src/ui/botCallsigns.selftest.mjs',
    'src/presentation/publicCopy.selftest.mjs',
    'src/presentation/socialProof.selftest.mjs',
    'src/presentation/publicLoading.selftest.mjs',
    'src/presentation/optionalProduction.selftest.mjs',
    'src/presentation/publicNav.selftest.mjs',
    'src/presentation/notFound.selftest.mjs',
    // 2026-11-02 audit R6 (round 2 U35): the 404 search asks once, never offline; a failure marks the field, its press reloads
    'src/presentation/notFoundSearchLoad.selftest.mjs',
    'src/presentation/seoMetadata.selftest.mjs',
    'tools/marketing-shots/og-images.selftest.mjs',
    // og-r2: a tank link shares its tank (the table, the cards, the rewrite)
    'tools/media-r5/tank-share.selftest.mjs',
    'src/ui/localeRouting.selftest.mjs',
    'tools/gt-enforcement.selftest.mjs',
    'src/docs/docsIcons.selftest.mjs',
    'src/docs/docsSearch.selftest.mjs',
    'src/docs/topics.selftest.mjs',
    // 261: the Field Manual printed: one print block in the overrides layer, paper inks at 4.5:1, chrome off, page breaks
    'src/docs/docsPrint.selftest.mjs',
    'src/docs/chapters/controls.selftest.mjs',
    'src/docs/chapters/chapters.selftest.mjs',
    'src/docs/filming.selftest.mjs',
    'tools/generate-manual-reference.selftest.mjs',
    'src/productStats.selftest.mjs',
    'src/ui/garageDossier.selftest.mjs',
    // 253: the technical diagrams' labels as DOM text (en/zh text, rail packing, sidecar parsing)
    'src/ui/technicalDiagramLabels.selftest.mjs',
    // 258: the technical drawings (the ID-buffer trace; the published plates' resolution, fill, overlays and labels)
    'tools/technicalDrawingTrace.selftest.mjs',
    'src/ui/technicalDrawing.selftest.mjs',
    'src/ui/damagePanel.selftest.mjs',
    'src/ui/damagePanelMarkers.selftest.mjs',
    // plates-overlap-269 (owner 2026-11-04): the hull bars over tanks on their own seats, overlapping, never pushed apart
    'src/ui/hullBarMarkers.selftest.mjs',
    'src/ui/damagePanelMaskRetry.selftest.mjs',
    'src/ui/damagePanelEntryMasks.selftest.mjs',
    // 2026-10-13 (owner: "even if im destroyed, the tank in bottom left corner can have its turret rotating"): a
    // wreck's panel holds its last live pose and the frame input locks a dead player's gun
    'src/ui/damagePanelWreckPose.selftest.mjs',
    'src/engine/rgba8Readback.selftest.mjs',
    'src/ui/topMaskProgramWarm.selftest.mjs',
    'src/ui/topMaskEntryKick.selftest.mjs', // battle-spikes-253: the panel's mask programs link from the covered warm's start
    'src/ui/tankThumbs.selftest.mjs',
    'src/ui/topMaskCoverage.selftest.mjs',
    'src/ui/equipmentPreview.selftest.mjs',
    'src/ui/camoSwatchAccess.selftest.mjs',
    'src/ui/customCamoStudioAccess.selftest.mjs',
    'src/ui/imagePreload.selftest.mjs',
    'src/ui/responsiveLayout.selftest.mjs',
    'src/ui/pinchZoomGuard.selftest.mjs',
    'tools/pinch-zoom-probe.selftest.mjs',
    'src/ui/hudEditorPreview.selftest.mjs',
    'src/ui/runtimeStyles.selftest.mjs',
    // 2026-10-17 (brand-ui BUI-F1): tokens.json -> tokens.css + tokens.ts in sync; SPEC 4.4 contrast and 4.5
    // colour-vision floors from the token values; the legacy names alias the tokens
    'src/ui/tokens/tokens.selftest.mjs',
    'src/ui/tokens/modeColours.selftest.mjs',
    // item 259 (owner: "color code settings so its easier"): one CVD-checked colour per Settings category, glyphs and rules only
    'src/ui/tokens/settingsColours.selftest.mjs',
    // 261 (owner: consumables "represented uniquely but as cool-y as eqquipment"): the item badge's category hues, one
    // token group, consumables CVD-checked against equipment, Settings, teams and ink
    'src/ui/tokens/badgeColours.selftest.mjs',
    // 2026-10-18 (brand-ui BUI-F3): every stylesheet declares into the cascade layers, CSS-in-TS only through
    // ensureStyle(), every linked stylesheet hashed; the style-literal ratchet (counts may only fall)
    'src/ui/styleLayers.selftest.mjs',
    // 2026-10-22 (brand-ui BUI-F5): the shared component kit (markup, ARIA, roving focus, one tokens-only sheet)
    'src/ui/components/components.selftest.mjs',
    'src/ui/components/picker.selftest.mjs',
    'src/ui/components/hoverTip.selftest.mjs',
    'src/ui/brandMarkRoll.selftest.mjs',
    'tools/style-literal-census.selftest.mjs',
    // 2026-10-25 (UI-LOCKDOWN part D): the static motion lint — compositor-only properties, the --dur-* tokens, a
    // reduced-motion path for moving or looping motion, no rAF style loops, no raster UI chrome (counts may only fall)
    'tools/motion-lint.selftest.mjs',
    // 2026-10-18 (brand-ui BUI-F9): the accessibility core — the record, :root as its runtime source (the head seed and
    // applyAccessibility agree), text and HUD scale, colour presets through tokens.ts, Custom pairs under the floors
    // refused, Reduce motion over the OS both ways, shake/flash/static consumers, the 1 KB boot reader; hold or toggle
    // and the perf meter default; the caption stream for radio, alarms and key sounds
    'src/ui/accessibilityPreferences.selftest.mjs',
    'src/ui/colorVision.selftest.mjs',
    'src/game/inputHoldToggle.selftest.mjs',
    'src/audio/captions.selftest.mjs',
    'src/ui/topAccentBorders.selftest.mjs',
    // 2026-10-24 (brand-ui 247, the public-site a11y pass): element colour resets sit under the components (the primary
    // buttons' ink); the landing's and the Gallery's remaining resets are a ratchet
    'tools/surface-element-resets.selftest.mjs',
    // 2026-10-24 (brand-ui 247, the public-site perf pass): the Gallery's nation and class rows ship in its first layout
    'tools/gallery-shell.selftest.mjs',
    'src/vehicles/camoPolicy.selftest.mjs',
    // 2026-10-09 (fix/camo-defaults): production's camouflage system, row for row (R113; the owner's 10-09 messages)
    'src/vehicles/camoCatalogProductionIndices.selftest.mjs',
    'src/vehicles/authoredPaintCatalog.selftest.mjs',
    'src/vehicles/customCamoCanvas.selftest.mjs',
    'src/vehicles/factoryCamo.selftest.mjs',
    'src/vehicles/camoPatternSeed.selftest.mjs',
    'src/vehicles/camoWorldScale.selftest.mjs',
    'src/vehicles/brandCamo.selftest.mjs',
    'src/vehicles/catalogCamoPainter.selftest.mjs',
    'src/vehicles/vehicleMarkingsCanvas.selftest.mjs',
  'src/vehicles/decorationsEquipment.selftest.mjs',
    'src/vehicles/decorationsStaging.selftest.mjs',
    'src/vehicles/decorDockKeepOut.selftest.mjs',
    // 2026-10-30 (the owner: "for tanks like griffin, dont allow decorations to be on the missile pods"): every launcher id
    'src/vehicles/launcherDecorKeepOut.selftest.mjs',
    // 2026-10-30 (266): the hull's turret-sweep guard knows the launchers riding the gun, swept over its pitch range
    'src/vehicles/launcherSweepGuard.selftest.mjs',
    // 266 (the net-hoop class): no decor stows under a field suit's roof or deck cloth, on every field-suited hull
    'src/vehicles/suitRoofDecor.selftest.mjs',
    // 2026-10-16 (test-speed): the dock's launch column is the ruleset's value, read from a leaf by the decor path
    'src/sim/droneDockRules.selftest.mjs',
    'src/sim/missionDockSeats.selftest.mjs',
    'src/vehicles/equipmentPrimitives.selftest.mjs',
    'src/vehicles/fleetBalance.selftest.mjs',
    'src/vehicles/balanceMatchups.selftest.mjs',
    'src/vehicles/fleetOrder.selftest.mjs',
    'src/vehicles/profiles/abramsRoadWheelSpacing.selftest.mjs',
    'src/vehicles/profiles/abramsTurretLift.selftest.mjs',
    'src/vehicles/profiles/abramsWheelBayPanels.selftest.mjs',
    'src/vehicles/profiles/japaneseHydropneumaticSuspension.selftest.mjs',
    'src/vehicles/profiles/k1a1Geometry.selftest.mjs',
    'src/vehicles/profiles/k2RunningGearSeat.selftest.mjs',
    'src/vehicles/profiles/leopard2A7VGunEra.selftest.mjs',
    'src/vehicles/profiles/leopardImprovedHull.selftest.mjs',
    'src/vehicles/profiles/browningMachineGunStandard.selftest.mjs',
    'src/vehicles/profiles/americanModernization.selftest.mjs',
    'src/vehicles/profiles/m60FamilyAttachments.selftest.mjs',
    'src/vehicles/profiles/t14RoofFidelity.selftest.mjs',
    'src/vehicles/profiles/t90SprocketTier.selftest.mjs',
    'src/vehicles/profiles/ztz85iii.selftest.mjs',
    // 2026-10-17 (227 gun-gaps): CV90 Mk 4 sight head on its neck and side plates on the wall; CV90 cradle root in the shell
    'src/vehicles/profiles/cv90TurretSeating.selftest.mjs',
    // 2026-10-18 (227 gun-gaps r3): the chevron ERA cassettes' caps on the gun channel walls are closed (no sawtooth)
    'src/vehicles/profiles/chineseChannelWallCaps.selftest.mjs',
    'src/vehicles/runningGearCadence.selftest.mjs',
    'src/world/sourcedTextures.selftest.mjs',
    'src/world/sourcedImageCache.selftest.mjs',
    'src/world/sourcedBuildingDataSource.selftest.mjs',
    'src/world/sourcedTextureComposer.selftest.mjs',
    'src/world/sourcedTextureCompositionWorker.selftest.mjs',
    'src/world/sourcedTextureCompositionClient.selftest.mjs',
    'src/world/sourcedTextureCompositionAdoption.selftest.mjs',
    'src/world/foundryMasonry.selftest.mjs',
    'src/world/foundryRoof.selftest.mjs',
    'src/world/sourcedTerrainPreparation.selftest.mjs',
    'src/world/spawnClearance.selftest.mjs',
    'src/world/treeGrounding.selftest.mjs',
    'src/world/terrainRoadMaterial.selftest.mjs',
    'src/world/treeSpecies.selftest.mjs',
    'src/world/treeTrunkQuality.selftest.mjs',
    'src/world/treeAttachments.selftest.mjs',
    'src/world/farTreeBase.selftest.mjs',
    'src/world/woodyRootOrientation.selftest.mjs',
    'src/world/battlefieldBounds.selftest.mjs',
    'tools/coplanar-surface-overlap.selftest.mjs',
    'tools/circular-cap-overlap.selftest.mjs',
    'src/engine/frameScheduler.selftest.mjs',
    'src/engine/deferredDeadline.selftest.mjs',
    'src/engine/programWarm.selftest.mjs',
    'src/engine/sceneProgramWarm.selftest.mjs',
    'src/engine/deploymentWarm.selftest.mjs',
    'src/engine/deploymentShadowWarm.selftest.mjs',
    // 2026-11-02 audit R4: named castShadow holds (the covered warm and an articulated batch give back only their own)
    'src/engine/castShadowHolds.selftest.mjs',
    'src/engine/deploymentUploadPrograms.selftest.mjs',
    'src/engine/bootLifecycle.selftest.mjs',
    'src/engine/capabilityGate.selftest.mjs',
    'src/engine/capabilityGateCache.selftest.mjs',
    // 2026-11-02 audit R3: a worker refusal seen before confirm() is this boot's answer only (no 14-day record)
    'src/engine/capabilityGateRefusal.selftest.mjs',
    'src/engine/garageGpuWarmRuntime.selftest.mjs',
    // 2026-11-02 audit R4: an abandoned Garage restore never re-freezes the cascades; the enclosure apart from the far sleep
    'src/engine/shadowLatchOwners.selftest.mjs',
    'src/game/battleEntryAcquisition.selftest.mjs',
    'src/game/battleEntryLifecycle.selftest.mjs',
    'src/game/battleEntryReveal.selftest.mjs', // 2026-11-02 audit F2: the reveal has exits; entry edges and serial (F3 waits)
    'src/game/soloBattleEntryAnnounce.selftest.mjs', // 2026-11-02 audit F2/F3: every solo start announces; waits for a return
    'src/game/soloBattleDeploymentRuntime.selftest.mjs',
    'src/game/soloBattleFxReadiness.selftest.mjs',
    'src/game/deploymentFxPrograms.selftest.mjs',
    'src/game/soloBattleFxPrograms.selftest.mjs',
    'src/game/soloBattleLoadingRuntime.selftest.mjs',
    'src/game/battleLifecycleAccess.selftest.mjs',
    'src/game/soloBattleStartAccess.selftest.mjs',
    'src/game/soloBattleStartRuntime.selftest.mjs',
    'src/game/battleWarmRuntime.selftest.mjs',
    'src/game/combatWarmCoordinator.selftest.mjs',
    'src/game/deferredCombatWarmRuntime.selftest.mjs',
    'src/game/deferredWarmReceipt.selftest.mjs', // 2026-11-02 audit S3: the deferred warm receipt declares running/finished/failed/cancelled
    'src/game/studioAccess.selftest.mjs',
    'src/game/studioEntry.selftest.mjs',
    'src/game/studioEntrySuperseded.selftest.mjs', // 2026-11-02 audit R1: an entry its exit abandons mid-build settles silently
    'src/game/studioEntryHandBack.selftest.mjs', // 2026-11-02 audit IR1 (round 2): a failed entry's Garage is announced once, by its return
    // 2026-11-02 audit A10 (round 3, U36): a scene link whose entry an exit took back, whose build failed after its session
    // ended, or that was pasted into a Studio an exit closed while it decoded, loads and says nothing in the Studio entered again
    'src/game/studioLinkSession.selftest.mjs',
    // 2026-11-02 audit F9: one Studio session (phase, tokens, cancels, held work); an exit during a map switch, a load, a
    // light change or a film export lands nothing after the teardown
    'src/game/studioSession.selftest.mjs',
    // 2026-11-02 audit A10 (round 3 review r1): an undo whose session ended before its build failed is no step in a later Studio
    'src/game/studioSessionExit.selftest.mjs',
    // 2026-11-02 audit F9: the take owns the playhead (one busy reading); pointercancel releases the history hold
    'src/game/studioTransport.selftest.mjs',
    // 2026-11-02 audit R6 (round 4 F2 review): a Studio light never waits on a re-ask and is lit again once what it was
    // applied without lands (light model, cloudscapes, atmosphere runtime, map air); never after its session or in a take;
    // (round 5 U8) once per apply however many land together, a skipped landing leaving it to the next
    'src/game/studioLightLanding.selftest.mjs',
    // 2026-10-08 (fix/studio-world-step): an export step advances the props' clock and syncs the drawn ground
    'src/game/studioWorldStep.selftest.mjs',
    // 2026-10-08 (destruction core lane): an effect naming an actor the scene does not stage never hangs a film
    'src/game/studioOrphanEffect.selftest.mjs',
    // 2026-10-08 (destruction core lane): a Studio strike round breaks the light cover in its path and flies on
    'src/game/studioStrikeCover.selftest.mjs',
    'src/game/stateCore.selftest.mjs',
    'src/game/startupIntent.selftest.mjs',
    'src/game/selectedVehicleSelection.selftest.mjs',
    'src/game/sniperFillRuntime.selftest.mjs',
    'src/game/soloBattleAccess.selftest.mjs',
    // local-fps-265: the page's step on the world's obstacle grid on its kernels plays the TypeScript grid's battle byte for byte
    'src/game/soloKernelObstacleQuery.selftest.mjs',
    // fix-detached-buffer-265: the kernels' views across a memory growth (Desert's first step threw on live 264c)
    'src/game/soloKernelMemoryGrowth.selftest.mjs',
    // 2026-11-02 audit S2: a solo battle's kernel choice is made once at its setup (kernels landing before its first step
    // carry the next battle, never half of this one)
    'src/game/soloKernelChoice.selftest.mjs',
    // 2026-11-02 audit X10 (round 3): the solo battle entry waits for its chunk's world kernels (bounded), so a first
    // battle is not set up on the TypeScript by a race with its own load
    'src/game/soloKernelEntry.selftest.mjs',
    // dev-battle-freeze: the dev battle hold (__DEBUG.battleHold) keeps a solo battle alive and still; off, the step byte for byte
    'src/game/devBattleHold.selftest.mjs',
    'src/game/soloBattleRuntime.selftest.mjs',
    'tools/boot-static-closure.selftest.mjs',
    // 265: the core imports no driver code; a local battle never reaches src/mp or the room host (seeded violations caught)
    'tools/driver-boundaries.selftest.mjs',
    'src/vehicles/coplanarDepthLayers.selftest.mjs',
    // 243: markings painted on the armour under their seats (the owner's "insignias and marks ... still glitching")
    'src/vehicles/markingFilm.selftest.mjs',
    'src/fx/effectAttachments.selftest.mjs',
    'src/fx/trackContact.selftest.mjs',
    'src/fx/trailCadence.selftest.mjs',
    'src/fx/exhaustTrail.selftest.mjs',
    'src/world/trackSurface.selftest.mjs',
    'src/world/roadPave.selftest.mjs',
    'src/presentation/analytics.selftest.mjs',
    'src/presentation/fleetWall.selftest.mjs',
    'src/game/presentationPose.selftest.mjs',
    'src/game/battlePresentationRuntime.selftest.mjs',
    'src/game/battleVisualPool.selftest.mjs',
    'src/game/battleVisualStreamer.selftest.mjs',
    'src/game/battleVisualStreamerAccess.selftest.mjs',
    'src/game/garageTankLifecycle.selftest.mjs',
    'src/game/garageReturnRuntime.selftest.mjs',
    'src/game/battleAgainAction.selftest.mjs',
    'src/game/garageReturnState.selftest.mjs', // 2026-11-02 audit F3: explicit return state, named busy refusals, no polling
    'src/game/appLifecycle.selftest.mjs', // 2026-11-02 audit F1: one guarded phase writer that always announces
    'src/app/bootReadiness.selftest.mjs', // 2026-11-02 audit S3: a product boot latch; the harness flag is its write-only mirror
    'src/app/automationPath.selftest.mjs', // 2026-11-02 audit S3: one automation reader, an explicit player path, the tools census
    'tools/game-readiness.selftest.mjs', // 2026-11-02 audit S3: one readiness probe over the published lifecycle; hand-built waits listed
    'src/game/networkVerdictPhase.selftest.mjs', // 2026-11-02 audit F1: a network verdict owns its time; its report follows the hold
    'src/game/battleEntryIntent.selftest.mjs', // 2026-11-02 audit F2: one solo intent record; a room world never inherits it
    'src/game/battleClientAccess.selftest.mjs',
    'src/game/garageIdleWorkCoordinator.selftest.mjs',
    'src/vehicles/garagePresentation.selftest.mjs',
    'src/world/terrainFastGrid.selftest.mjs',
    'src/world/liveHeightFieldProxy.selftest.mjs',
    'src/world/worldBuildCoordinator.selftest.mjs',
    'src/world/worldActivationRuntime.selftest.mjs',
    'src/world/worldActivationLatestWins.selftest.mjs', // 2026-11-02 audit R1: the latest activation presents; a warming world is held
    // 2026-11-02 audit U26 (round 2): an orphaned build is speculative again, a superseded warm hides its world at once
    'src/world/worldActivationOrphans.selftest.mjs',
    'src/world/worldBuildRecordPhases.selftest.mjs', // 2026-11-02 audit R1: one build phase; prefetch after cancel; live release keep list
    'src/world/worldBuildRollback.selftest.mjs', // 2026-11-02 audit R1: a build ended part way releases what it built
    'src/world/worldBuildPresetClass.selftest.mjs', // 2026-11-02 audit R1: a cached world is reused only under its own preset
    // 2026-11-02 audit R6 (round 2 U35): a failed map module transfer no longer fails every later world build
    'src/world/worldModuleLoadFailure.selftest.mjs',
    'src/world/worldBuildCloseContracts.selftest.mjs', // 2026-11-02 audit R1: vegetation closes on cancel; ring stage kept; no late atlas draw
    'src/world/terrainIndexPool.selftest.mjs',
    'src/ui/driveTelemetry.selftest.mjs',
    'src/world/terrainLodPolicy.selftest.mjs',
    'src/world/terrainStreaming.selftest.mjs',
    'src/world/terrainSplatFields.selftest.mjs',
    'src/world/terrainPresetListeners.selftest.mjs', // 2026-11-02 audit R1: a closed terrain build leaves no preset listener
    'src/world/textureUploadOrientation.selftest.mjs',
    'src/world/normalMapOrientation.selftest.mjs',
    'src/world/roadPathStyles.selftest.mjs',
    'src/world/roadSurfaces.selftest.mjs',
    'src/world/roadSurfaceShader.selftest.mjs',
    'src/world/terrainWetLayer.selftest.mjs',
    'src/world/groundContrastStep2.selftest.mjs',
    'src/world/groundTrainIrregularity.selftest.mjs', // 264b: the sand trains' irregularity, a turned field's lift per channel
    'src/world/snowRockSlope.selftest.mjs',
    'src/world/roadPuddleGloss.selftest.mjs',
    'src/world/snowFaces.selftest.mjs',
    'src/world/worldFramePresentationRuntime.selftest.mjs',
    'src/fx/particleTextureAssets.selftest.mjs',
    'src/fx/volumeMedia.selftest.mjs',
    'src/fx/structureStages.selftest.mjs',
    // destruction-slabs 227 round 3: what a building's damage leaves hanging comes down (a roof's chimney and ladder, a mill's
    // sails, a loose room or face piece)
    'src/fx/structureHanging.selftest.mjs',
    // destruction-slabs 227 round 4: no debris plate rests on its edge, no remnant stands over the building as drawn
    'src/fx/uprightPlates.selftest.mjs',
    'src/fx/millimetreWeld.selftest.mjs', // perf-240: the destruction welds' integer keys weld as their string keys did
    'src/fx/structureStagesPieceHides.selftest.mjs', // 2026-10-16 props lane B (227 co-hold): a live run's named-piece hides wait for its wreck's birth, a settled run's apply at once
    'src/fx/structureDebris.selftest.mjs', // 2026-10-12: thrown pieces lie where their flight meets the ground; still pieces belong to their building
    'src/fx/rubbleBodies.selftest.mjs', // 2026-10-12: a building's larger falling pieces are bodies of the one physics engine
    // 2026-10-15 (the fracture package on integ/226): walls break where struck as cells, a section's fall keeps its stub and
    // gaps its doors; a building cut into its own pieces (doors gapped in the stubs), brought down as bodies; the stages
    // driving both, sections on and off, every piece at rest on what is under it, a lift bridge's named pieces as bodies
    'src/fx/wallFracture.selftest.mjs',
    'src/fx/structureFracture.selftest.mjs',
    'src/fx/collapsePieces.selftest.mjs',
    'src/fx/collapseBodies.selftest.mjs',
    'src/fx/fractureStages.selftest.mjs',
    'tools/destruction-check.selftest.mjs', // 2026-10-12: Steinburg's buildings destroyed and judged (textured, nothing hanging, rubble at rest on the ground)
    'tools/destruction-slab-check.selftest.mjs', // 2026-10-17: the stray-slab detector's judgement (a room past the walls, a floating plate, a flattened matrix)
    'src/fx/structureMask.selftest.mjs', // 2026-10-13: nothing hangs from a falling building (straddling triangles come down with the front)
    'src/fx/latticeGround.selftest.mjs', // 2026-10-13: the landing solves read the ground as drawn from its lattice's vertices, once each
    'src/ui/hitEventFormat.selftest.mjs',
    'src/ui/shotDiagramProjection.selftest.mjs',
    'src/ui/shotSchematic.selftest.mjs',
    'src/ui/dom.selftest.mjs',
    'src/ui/keyboardOwnership.selftest.mjs',
    'src/ui/settingsControls.selftest.mjs',
    'src/ui/battleUiVisibility.selftest.mjs',
    'src/ui/hudPreferences.selftest.mjs',
    'src/ui/vehicleStatusPolicy.selftest.mjs',
    'src/vehicles/specHelpers.selftest.mjs',
    'src/dev/perfTrace.selftest.mjs',
    'src/ui/perfHud.selftest.mjs',
    // owner 2026-10-28: every default key by the phases its owner is live in, no synthetic key events (the diagnostics' F8)
    'src/game/keybindingCensus.selftest.mjs',
    // owner 2026-10-28: every battle key cap is its action's live binding, keyboard and pad
    'src/game/battleKeyCaps.selftest.mjs',
    'src/dev/mainDiagnosticsRuntime.selftest.mjs',
    'src/dev/debugBattleEntryRuntime.selftest.mjs',
    'src/dev/perfDiagnosticsAccess.selftest.mjs',
    'src/engine/deploymentSkew.selftest.mjs',
    'src/engine/offscreenWarm.selftest.mjs',
    'src/engine/cameraDestinationWarm.selftest.mjs', // perf-245 (2026-10-24): a camera hop's destination warmed on the way (batches alone and uncull'd, the terrain focus)
    'src/engine/lodEmptySentinels.selftest.mjs',
    // sealed lane round 2 (2026-10-10): screen-size vehicle LODs, the sniper sight draws near detail
    'src/engine/lodDistanceScale.selftest.mjs',
    'src/engine/battleWeatherPolicy.selftest.mjs',
    'src/engine/battleAtmosphereRuntime.selftest.mjs',
    'src/engine/nightLightingRuntime.selftest.mjs',
    'src/engine/nightLightingAccess.selftest.mjs',
    'src/engine/battleLitSet.selftest.mjs',
    'src/engine/nightEmissionMaterial.selftest.mjs',
    'src/world/worldNightLighting.selftest.mjs',
    'src/world/worldNightFixtureInstances.selftest.mjs',
    'src/world/worldNightEmissionGeometry.selftest.mjs',
    'src/world/townNightLights.selftest.mjs', // 227 looks: the town kits' dwellings light their panes; Steinburg's street lamps beside its planned rows
    'src/dev/nightWindowInspection.selftest.mjs',
    'src/dev/nightWorldFixtureInspection.selftest.mjs',
    'src/world/villageWindowPlacement.selftest.mjs',
    'src/world/poldersShoreline.selftest.mjs',
    'src/world/oasisShoreline.selftest.mjs',
    'src/world/authoredLakeComposition.selftest.mjs',
    'src/world/treePoolCapacity.selftest.mjs',
    // trees perf (2026-10-07): the near pools (the adopted ones over the line too) culled to the main camera's view and their shadows' reach
    'src/world/treeViewCull.selftest.mjs',
    // the trees lane (2026-10-08, wave 260): a bush grown as its slot's leafy birch draws its leaves as the slot's trees do
    'src/world/leafyBush.selftest.mjs',
    'src/vehicles/vehicleNightLighting.selftest.mjs',
    'src/engine/battleAtmosphereAccess.selftest.mjs',
    // 2026-11-02 audit R6 (round 2 U35): a failed light model or cloudscape chunk is asked again by the next battle;
    // (round 3 A4) under the lazy-chunk policy, never per Studio sun-dial move
    'src/engine/battleAtmosphereChunkReask.selftest.mjs',
    // 2026-11-02 audit R6 (round 4 F2): a battle entry asks the light model, the cloudscapes and the atmosphere runtime at
    // once whatever the backoff a Studio drag raised; a Studio light apply keeps the backoff and never awaits a stalled re-ask
    'src/engine/battleAtmosphereEntryAsk.selftest.mjs',
    // 2026-11-02 audit R6 (round 5 U8 review): a sky part in flight is a prepare's landing, a relight's too while it
    // is not installed; a relight leaves out a part installed before its light applied, and any other prepare keeps it
    'src/engine/battleAtmosphereLanding.selftest.mjs',
    // 2026-11-02 audit R6 (round 4 F2 review): a Moon battle entered inside the backoff a Studio drag raised binds the
    // Earth's land mask (its entry asks it at once), not the all-sea placeholder
    'src/engine/earthLandEntryAsk.selftest.mjs',
    'tools/daynight-atmosphere-probe.selftest.mjs',
    'tools/night-window-census.selftest.mjs',
    'tools/night-fixture-census.selftest.mjs',
    'src/vehicles/equipmentDamage.selftest.mjs',
    'src/vehicles/vehicleReadability.selftest.mjs',
    // 2026-10-04 (the vehicle-look lane): a cloned vehicle material (the track shoes) joins its source's cascade registration
    'src/vehicles/vehicleMaterialClone.selftest.mjs',
    // 2026-10-17 (the wheel-band lane): no new raw Material.clone() of a vehicle material (the Garage skin's road-wheel band)
    'src/vehicles/vehicleMaterialRawClone.selftest.mjs',
    // 2026-10-17 (the wheel-band lane, round 2): every opaque lit material a tank draws holds its own vehicle registration
    // (the band's tanks: the M46/M47 wheels, the KF51 tyres, the Abrams track grime, the Merkava voids ...)
    'src/vehicles/vehicleMaterialRegistration.selftest.mjs',
    'src/vehicles/fleetRoundOneSurfaces.selftest.mjs',
    'src/engine/skyCloudBake.selftest.mjs',
    // 2026-11-02 audit R3: one cloud install in flight, each caller its own fate; the noise worker retired after the fallback
    'src/engine/sharedInstall.selftest.mjs',
    'src/engine/skyHorizonCache.selftest.mjs',
    'src/engine/skyEnvironmentCache.selftest.mjs',
    // 2026-10-18 (the 228 entry diet): the Moon's land mask loads with the world that draws it, not with the entry chunk
    'src/engine/earthLandAccess.selftest.mjs',
    // 2026-11-02 audit A4 (round 3, U35): the Moon's land mask is asked again under the lazy-chunk policy, never per Studio
    // sky apply (forty dial applies after a failure ask nothing inside the backoff, none offline)
    'src/engine/earthLandReask.selftest.mjs',
    'src/engine/skyEnvironmentEnclosure.selftest.mjs',
    'src/engine/atmosphere.selftest.mjs',
    // 2026-10-01: the grounded light model (lighting lane): sun through the atmosphere, the sky's own light, the deck, the exposure law
    'src/engine/lightModel.selftest.mjs',
    // 2026-10-02 (lighting lane): the materials' scene fog on the battlefield's haze layer
    'src/engine/fogLayer.selftest.mjs',
    // 2026-10-03 (the skies-and-atmosphere lane): the Beer–Lambert aerial perspective on the physically based sky
    'src/engine/hazeLaw.selftest.mjs',
    'src/engine/volumetricClouds.selftest.mjs',
    // 2026-11-02 audit R3: a restored context re-bakes the GPU-only noise volumes; a layer disposed mid-link bakes nothing
    'src/engine/volumetricCloudsLifetime.selftest.mjs',
    // 2026-10-13 (the owner: "no more of the cloud type depicted in fjord"): broken-stratocumulus banned from every map, time
    // of day, weather variant, Studio plan, Garage sky and phone deck; fjord, polders and copper_mesa on fair-weather cumulus
    'src/engine/cloudsBan.selftest.mjs',
    // 2026-10-14 (the SKY lane, SKY-02): a real night — moonlit clouds, no stars over cloud, the pixel law's sparse stars
    'src/engine/nightSky.selftest.mjs',
    'src/engine/cloudBase.selftest.mjs',
    // 2026-10-06 (Clouds 2.0): every map's preset as the layered medium's lanes and their packing
    'src/engine/cloudLayers.selftest.mjs',
    'src/engine/cloudBeerShadow.selftest.mjs',
    'src/engine/cloudDeckCover.selftest.mjs',
    // clouds-269 (2026-11-04): the cloud field without rows or a lattice, the cumulus domed, the phones' deck unrepeated
    'src/engine/cloudField.selftest.mjs',
    // clouds-269: every map's cumulus as the medium places it, aperiodic (round 71's ruled rolls the negative control)
    'src/engine/cloudPlacement.selftest.mjs',
    // 2026-10-05 (the skies-and-atmosphere lane): one wind per battlefield — every map's surface wind from its source, its
    // clouds' drift veered from it (never opposed)
    'src/world/sceneWind.selftest.mjs',
    // 2026-10-03 (the skies-and-atmosphere lane): the clouds' shadows by one undithered map on every lit material
    'src/engine/cloudShadeMap.selftest.mjs',
    // 2026-10-05 (the skies-and-atmosphere lane): the terrain's program counted as the GPU binds it — the expanded
    // shader's active samplers in both stages, three's DFG LUT included: sixteen units at most
    'src/engine/textureUnits.selftest.mjs',
    // 2026-10-03 (the skies-and-atmosphere lane): the ground's sky under and beside the near hulls
    'src/engine/vehicleGroundOcclusion.selftest.mjs',
    // 2026-10-09 (the shadows lane): the ground's sky beside the world's solids; the thin deck's beam
    'src/engine/structureGroundOcclusion.selftest.mjs',
    // 2026-11-02 audit R3: after the worker fails, its unanswered bakes and every later one run on the main thread
    'src/engine/structureGroundOcclusionFallback.selftest.mjs',
    // 2026-10-17 (the SKY lane, 227 SKY-03): a thin deck's aureole — the solids' soft shadow under Whiteout's stratus
    'src/engine/structureAureole.selftest.mjs',
    // 2026-10-14 (the engine-cs lane; media wave f1 "hulls hover" on snow): the Studio support seats the snow takes' heroes on
    // the rendered ground, and the ground occlusion grounds them there (the snow cap, the crease's core; ordinary ground unchanged)
    'tools/studio-snow-contact.selftest.mjs',
    // 2026-10-03 (the shade-fill lane): shade on dark materials kept off black — the photographic toe, the dim's facing rule
    'src/engine/shadeFill.selftest.mjs',
    'src/engine/toneR1.selftest.mjs',
    // 2026-10-04 (the sun-bloom lane): the sun's glow a gradient toward a visible disc — only the disc HDR, the glow under the
    // knee, the knee as the camera shows the dome
    'src/engine/sunGlare.selftest.mjs',
    // 2026-10-01 (the clouds-and-skyboxes lane): the layered sky — mid layers, contrails, storm cells, rain, fog banks, lightning, the time of day
    'src/engine/cloudWeatherLayers.selftest.mjs',
    'src/engine/rendererContextRecovery.selftest.mjs',
    'src/engine/contextResourceLifetime.selftest.mjs',
    // 2026-11-02 audit R3: one restoration at a time (aborted by a newer loss), the loss counted first, a typed outcome
    'src/engine/contextRestoreOwner.selftest.mjs',
    'src/engine/aerialDetail.selftest.mjs',
    'src/engine/deviceDiag.selftest.mjs',
    // 2026-11-02 audit R4: the rescue ladder reverts only its own writes (a newer owner's null stands, no retired texture)
    'src/engine/watchdogStageOwners.selftest.mjs',
    'src/engine/sceneBlackWatchdog.selftest.mjs',
    'src/engine/sceneBlackWatchdogAsync.selftest.mjs',
    'src/engine/sceneProbeTarget.selftest.mjs',
    'src/engine/coverageMipQuantile.selftest.mjs',
    'src/engine/deviceEnvRadiance.selftest.mjs',
    'src/engine/renderScalePolicy.selftest.mjs',
    'src/engine/shadowStability.selftest.mjs',
    // 2026-10-14 (SKY shadows r2a): the cascades' one linear fade law and its readers, High's 30/89/320 m table, the contact seam
    'src/engine/shadowCascadeFade.selftest.mjs',
    // 2026-10-14 (SKY shadows r2a): the cascades' tent PCF coded on their radius; three's getShadow call sites kept
    'src/engine/shadowTent.selftest.mjs',
    'src/engine/shadowReceiverOnly.selftest.mjs', // 2026-10-04 (visual/shadow-bias): the ground takes no caster's acne terms
    'src/engine/materialEnvIntensity.selftest.mjs', // 2026-10-08 (visual/world-ibl-trim): a material's own share of the sky light
    'src/engine/shadowFitCache.selftest.mjs',
    'src/engine/shadowRefresh.selftest.mjs',
    'src/engine/shadowStaticCache.selftest.mjs', // 2026-10-02: the static shadow-caster cache (P20)
    'src/engine/shadowDepthKinds.selftest.mjs', // 2026-10-12: one shadow depth material per caster kind (the perf stream)
    // 2026-11-02 audit R6 (round 2 U35): a failed caster-kind or static-cache chunk is asked again past the policy's backoff
    'src/engine/shadowChunkLoadFailure.selftest.mjs',
    'src/engine/cascadePoseHold.selftest.mjs', // 2026-10-13 (the perf stream): held cascade poses let the static cache reuse while driving
    'src/engine/resolutionGovernor.selftest.mjs', // 2026-10-02: the resolution governor's state machine
    'src/engine/shadowPrime.selftest.mjs',
    'src/engine/programReceipt.selftest.mjs', // 2026-10-27 (the room-stalls lane): programs linked past a warm, as a receipt
    'src/engine/networkShadowPrimeAdapter.selftest.mjs',
    'src/engine/coveredComposerWarm.selftest.mjs',
    'src/engine/postLazySmaa.selftest.mjs', // 2026-10-13 (the perf stream): SMAA as its own chunk, out of the game entry
    'src/engine/shadowGeometryClaims.selftest.mjs',
    // (local-fps-266) __SHADOW_DEBUG held as the window's own property: the per-caster shadow hooks' reads skip the
    // browser's named-element lookup
    'src/engine/shadowDebugGlobal.selftest.mjs',
    'src/engine/shadowCasterCells.selftest.mjs',
    'src/engine/temporalAoPolicy.selftest.mjs',
    'src/audio/audioMath.selftest.mjs',
    'src/audio/vehicleAudioProfiles.selftest.mjs',
    'src/audio/weaponAudio.selftest.mjs',
    'src/audio/weaponCoverage.selftest.mjs',
    // gun-reports-269: the weapon census (every key the fleet fires has a row; loader makes from the layouts) is the fleet's
    'src/audio/weaponCensus.selftest.mjs',
    'src/audio/vehicleAudioModel.selftest.mjs',
    'src/audio/soundAssets.selftest.mjs',
    'src/audio/sfxLoudness.selftest.mjs',
    'src/audio/sfxVerdicts.selftest.mjs',
    'src/audio/propSounds.selftest.mjs',
    'src/audio/destructionSounds.selftest.mjs',
    // 2026-11-03 (world-sfx-269): the vehicles, the world and the modes sound of what they are (exhaustive tables, the
    // mode controller's events scanned, the engine heard)
    'src/audio/worldSounds.selftest.mjs',
    // 2026-11-04 (world-sfx-269, crew-lines' finding 11): a settings channel at 0 sends nothing to the reverb
    'src/audio/reverbSends.selftest.mjs',
    // 2026-11-04 (world-sfx-269): nothing of the hangar after the battle phase edge, on every entry path
    'src/audio/battleEntryAmbience.selftest.mjs',
    'src/audio/assetLibrary.selftest.mjs',
    // 2026-11-02 audit F11: failed assets retried after a backoff, owned pins (the battle warm replaces its own only)
    'src/audio/assetLibraryRetry.selftest.mjs',
    'src/audio/crewRadio.selftest.mjs',
    // 2026-11-02 audit F11: an interrupted transmission takes its scheduled release click, crackle and static swell with it
    'src/audio/crewRadioInterrupt.selftest.mjs',
    'src/audio/crewVoice.selftest.mjs',
    'src/audio/audioEngine.selftest.mjs',
    // 2026-11-03 (impact-materials-269): every impact sounds of what it struck; only steel rings
    'src/audio/impactMaterials.selftest.mjs',
    'src/audio/reverbImpulse.selftest.mjs',
    'src/audio/audioRevival.selftest.mjs',
    'src/audio/voiceTriggers.selftest.mjs',
    // (crew-lines-269) every mode's crew calls, the AC-130 crew's, the team counts by deathsAreFinal
    'src/audio/voiceLines.selftest.mjs',
    'src/audio/interfaceSounds.selftest.mjs',
    'src/audio/interfacePress.selftest.mjs',
    'src/audio/listenerPoseRuntime.selftest.mjs',
    // 2026-10-14: the countdown is heard (the hull, the tanks, the world, once; 3-2-1 and one horn, solo and network)
    'src/audio/countdownAudio.selftest.mjs',
    // 2026-10-14: every vehicle's countdown bank is the one its rig plays (the warm resolves each hull from its whole spec)
    'src/audio/presenceFamilies.selftest.mjs',
    // 2026-11-02 audit F11: the engine's battle mode is one state with one transition function (next round, duplicate deaths
    // and presentations, facts before the graph, the lazy carry)
    'src/audio/battleMode.selftest.mjs',
    // 2026-11-02 audit Q16 (round 2): sfx-smoke's synthetic deaths, read from the tool, revive first and are heard once a life
    // (round 3 B9: the tool's own scene loop and volley run on the real engine, cut from its source)
    'src/audio/sfxSmokeDeaths.selftest.mjs',
    // 2026-11-02 audit F11: under the battle loader only its bed (the director's scene goes with the teardown's loops; the
    // battle's ambience intent is per battle)
    'src/audio/ambienceTeardown.selftest.mjs',
    // 2026-11-02 audit F11: wanted loops (loader, fire alarm, cook-off, heartbeat) start once decoded, never after their battle
    'src/audio/wantedLoops.selftest.mjs',
    // 2026-11-02 audit F11: delayed captions on the audio clock and per battle, the gunship start-up disarmed; a mode
    // respawn starts the hull's module states whole (round 4 merge review r1)
    'src/audio/audioLatches.selftest.mjs',
    'src/mp/wire/wire.selftest.mjs',
    'src/mp/wire/wireFuzz.selftest.mjs',
    // 2026-10-10 (physics lane): wire 5's WRECK_BODY group — a wreck's turret body on the rows.
    'src/mp/wire/wreckBody.selftest.mjs',
    'src/mp/transport/transport.selftest.mjs',
    'src/mp/transport/webRtcTransport.selftest.mjs',
    'src/mp/transport/transportLifecycle.selftest.mjs', // 2026-11-02 audit M2: one retry timer per reconnect; a reopened WebRTC link hears signals; the swap names its state
    'src/mp/match/clock.selftest.mjs',
    'src/mp/match/inputStream.selftest.mjs',
    'src/mp/match/snapshotStream.selftest.mjs',
    'src/mp/match/interpolation.selftest.mjs',
    'src/mp/match/events.selftest.mjs',
    'src/mp/match/recovery.selftest.mjs',
    'src/mp/match/movementCheckpoint.selftest.mjs',
    'src/mp/match/prediction.selftest.mjs',
    // 2026-11-02 audit M8: wire 10's TUMBLING and STACKED flags; the clients' hull copies split tank contacts as the authority
    'src/mp/match/hullBodyRow.selftest.mjs',
    'src/mp/match/predictionStall.selftest.mjs', // 2026-10-13 MP plan step 9: a stalled seat's gap stepped on the authority's hold-and-release
    'src/mp/match/matchClient.selftest.mjs',
    'src/mp/match/migrationStore.selftest.mjs', // 242 security round 2 (3a55e00a60); in no suite since
    'src/mp/match/matchBuildGate.selftest.mjs',
    'src/mp/wire/matchBuild.selftest.mjs',
    'src/mp/wire/destroyedSet.selftest.mjs',
    'src/mp/wire/viewerMask.selftest.mjs', // 2026-10-15 MP stream: wire 7, a delta's movement checkpoint as a changed-value mask
    'src/mp/wire/eventPayload.selftest.mjs', // mp-scale-251: wire 8, event payloads in binary decode to their JSON
    'src/mp/match/snapshotRate.selftest.mjs',
    'src/mp/match/rtcClientLink.selftest.mjs',
    'src/mp/host/seatTokenWeb.selftest.mjs',
    'src/mp/host/hostPlan.selftest.mjs',
    'src/mp/host/migrationState.selftest.mjs',
    'src/mp/host/matchHost.selftest.mjs',
    'src/mp/host/hostStopRace.selftest.mjs', // 2026-10-13 the MP stream: a core stopped during its world load starts no actor
    'src/mp/host/hostRuntimeStates.selftest.mjs', // 2026-11-02 audit M1/M3: a stopped or failed host stays so on a late ready; a core whose actor ended is stopped
    'src/mp/host/hostStandby.selftest.mjs', // 2026-10-14 the MP stream: a standby host thread boots on the world it prepared (§13.21)
    // 2026-11-02 audit round 5 Q1 (review r2): the host's fetch of the world kernels has a bound (HOST_KERNELS_FETCH_MS): a
    // request with no answer, or a body stalled after its headers, is aborted and the boot goes live on the TypeScript,
    // its ready 'timeout'
    'src/mp/host/hostKernelsFetch.selftest.mjs',
    'src/sim/preparedAuthorityGround.selftest.mjs', // 2026-10-14 the MP stream: a prepared navigation ground plays digest for digest as a fresh one (§13.21)
    // 2026-10-10 (MP lane): a migrated host holds its world still until the seats that were playing are back
    'src/mp/host/resumeHold.selftest.mjs',
    'src/mp/host/resumeHoldClocks.selftest.mjs', // 2026-11-02 audit M1: a held seat's stall clock allows the resume hold; a seat whose link closed is not counted back
    'src/mp/host/holdNotice.selftest.mjs', // 2026-11-02 audit round 3 B1/X6: a host that holds a HELLO says how long (HOLD); a kept host's and its own seat wait, a silent host's stalls at its announced end and release margin (virtual time moves only once the core's real async work has settled); round 4 F0: the host runtime tells every link its boot hold from its main thread, idle or booting, so a peer behind a Worker evaluating 8 s, or one whose HELLO reaches the runtime before start(), is told at its HELLO
    // 2026-11-02 audit U1 (round 2; round 3 A3): a client follows a host that restarts the battle (clocks re-anchored, inputs admitted, the abandoned battle's
    // retained state dropped), told by the battle's id at the WELCOME: a plain reconnect's late first snapshot restarts nothing, a restart after its countdown is seen
    'src/mp/match/timelineRestart.selftest.mjs',
    'src/mp/host/battleIdentity.selftest.mjs', // 2026-11-02 audit round 3 A3: a match's first battle is 0, a fallback restart names its own, a resume keeps it to its WELCOMEs; a real client told by the restarted core's WELCOME drops the old battle's keyframe
    // 2026-10-11 (MP lane): a late HELLO is admitted; a seat closed with "hello timeout" says hello again
    'src/mp/host/helloGate.selftest.mjs',
    'src/mp/host/worldCollision.selftest.mjs',
    'src/mp/host/worldCollisionMobileTier.selftest.mjs', // 2026-10-16 physics PH.15: a phone-tier host plays the desktop's shard records
    // 2026-10-08 (destruction core lane): Frontline's authority plays the trench variant every client builds
    'src/mp/host/frontlineVariant.selftest.mjs',
    'src/mp/host/hostRuleset.selftest.mjs',
    // 2026-10-01: the host Worker carries specs, not vehicles; the roster's anatomy loads at boot.
    'src/mp/host/hostFleet.selftest.mjs',
    'src/mp/presentation/battlePresentation.selftest.mjs',
    'src/mp/presentation/wreckCause.selftest.mjs', // 2026-11-02 audit F10: a late cook-off cause reaches the wreck; a respawn forgets the last life's cause
    'src/mp/presentation/settledFalls.selftest.mjs', // 2026-11-02 audit U27: a late joiner's settled props lie as they fell (wire 11 falls, withheld as their events are), a withheld one along its own heading (one prop in 64 hashes to +Z), not every one toward +Z
    'src/mp/presentation/battleRestartReset.selftest.mjs', // 2026-11-02 audit round 3 X5: a battle restart stands the old battle's settled props, structures and heaps on the seat, and the effects' stages on the bus; the restarted battle lays and draws its own; review r1: it takes the world as every battle start does (resetWorldForBattle)
    'src/mp/presentation/battleRestartLives.selftest.mjs', // 2026-11-02 audit round 3 merge review r1: a battle restart is a new life for every hull in every per-life listener (the killcam's chase, the audio engine's death latches, alarm and wrecks, the service record, the presentation's actors; round 4 E4: whole, hull points and modules, review r2: the living hulls' visuals and the audio's module states and battle play too; the HUD and report case moved to battleRestartTallies)
    'src/mp/presentation/respawnRevive.selftest.mjs', // 2026-11-02 audit round 4 E6a: a hull a mode revives out of this seat's view is alive and whole on the seat (through the real MatchClient); a revive under a held wreck row leaves the life to the rows, and is settled once no row reaches the hull (review r1)
    'src/mp/presentation/battleRestartTallies.selftest.mjs', // 2026-11-02 audit round 4 E6b: a battle restart opens a new battle for every per-battle record (the real HUD's kill counts, feed, sixth sense, contact memory and consumable tray, its report, the service record, the career record, the result flow's ending facts, death flow and camera with the real killcam (review r2), the medal toasts)
    'src/mp/presentation/unseenRounds.selftest.mjs', // 2026-11-02 audit U31: a round that left the view in flight is named unseen (wire 11) and held by the effects, not ended; A13 (round 3): a 512-round burst still encodes, a drone whose hold ends unseen never flies home
    // 2026-10-07 (destruction core lane): the authority's stages on a peer's world, the log on the wire and through a migration.
    'src/mp/presentation/destructionMirror.selftest.mjs',
    // 2026-10-08 (destruction core lane, crater-render-spec §F): craters across the network — stamped once on a live view
    // (the log held for an owed event), settled once for a late joiner, restored without an event on a migrated host
    'src/mp/presentation/craterSync.selftest.mjs',
    // 2026-10-10 (physics lane): the host's turret body through the rows, the peer's interpolated pose, a migrated host.
    'src/mp/presentation/wreckTurretSync.selftest.mjs',
    'tools/mp-client-soak.selftest.mjs',
    'src/mp/room/roomPolicy.selftest.mjs',
    'src/mp/room/roomSizeRules.selftest.mjs', // mp-scale-251: room size as each mode's ruleset, the LAN dev override
    'src/mp/room/p2pMatchHost.selftest.mjs',
    'src/mp/room/roomActor.selftest.mjs',
    'src/mp/room/roomLock.selftest.mjs', // 2026-11-02 audit M2: the admin's lock outlives rounds; a start re-reads the room after its host answers
    'src/world/simKernelsReport.selftest.mjs', // the kernels' fallback named and reported, never silent
    'src/mp/room/roomWorkerProgram.selftest.mjs',
    'src/mp/room/roomClient.selftest.mjs',
    'src/mp/room/roomClientSignals.selftest.mjs',
    'src/mp/room/roomClientLeave.selftest.mjs', // 2026-11-02 audit M2: a leave while reconnecting leaves on the resume; a disconnect keeps no stale host
    // 2026-10-30 (phone-controller-266, docs/PHONE-CONTROLLER.md): the phone controller's pairing, link, input model and QR
    'src/pad/padProtocol.selftest.mjs',
    'src/pad/padActor.selftest.mjs',
    'src/pad/padInput.selftest.mjs',
    'src/pad/padCues.selftest.mjs', // phone-feel-269: what a paired phone feels, the wire, the buzzes
    'src/pad/padPhoneHalf.selftest.mjs', // phone-feel-269: no desktop-only export rides to the phone's page
    'src/pad/padLink.selftest.mjs',
    'src/pad/padLobby.selftest.mjs', // 2026-11-01 (couch-mode-268, docs/COUCH-MODE.md): one lobby, a receiver per seat
    'src/game/couchSeats.selftest.mjs', // couch-mode-268: which roster tank each phone drives, and a seat's controls
    'src/game/couchCamera.selftest.mjs', // couch-mode-268: the shared camera frames every seat
    'src/pad/qr.selftest.mjs',
    'server/rooms/localPadService.selftest.mjs',
    'server/rooms/roomEvents.selftest.mjs', // 2026-11-02 audit S1: Room and PadPair end every event through one end and deallocate by one rule
    'server/rooms/lanServices.selftest.mjs', // 2026-11-02 audit S1: a LAN room runs its events in order and owns its timer and p2p host; a pairing is removed only as itself
    'tools/mp-rooms-e2e.selftest.mjs',
    'tools/mp-rooms-p2p-e2e.selftest.mjs',
    'tools/mp-exit-e2e.selftest.mjs',
    'tools/mp-p2p-headless.selftest.mjs',
    'tools/mp-p2p-headless-crash.selftest.mjs', // 2026-10-14 the MP stream: a crashed host's peers elect at once on their evidence (§13.22)
    'tools/mp-world-events-audit.selftest.mjs',
    // 2026-10-02 (ghost-crunch lane): the audit's ghost findings as deterministic authority → presentation scenarios.
    'tools/mp-world-events-scenarios.selftest.mjs',
    'tools/sim-determinism-audit.selftest.mjs',
    'tools/mp-p2p-peer.selftest.mjs',
    'tools/mp-p2p-decline.selftest.mjs',
    'tools/mp-p2p-stepdown.selftest.mjs',
    'tools/mp-p2p-early-link.selftest.mjs', // 2026-10-20 item/mp-rejoin-229: a running match's re-entry links beside its load
    'tools/mp-room-lifecycle.selftest.mjs',
    'tools/mp-states.selftest.mjs', // 2026-11-02 audit S3: the MP harnesses take the protocol's state words from their owners
    'src/mp/session/browserComposition.selftest.mjs',
    'src/mp/session/lobbyIntent.selftest.mjs',
    'src/mp/session/playMenuAdapter.selftest.mjs',
    'src/mp/session/playMenuAdapterSeat.selftest.mjs', // 2026-11-02 audit F6: a close during the limit check cancels the attempt; a released seat's round names its owner
    'src/mp/session/networkStatus.selftest.mjs',
    'src/mp/session/exitFlow.selftest.mjs',
    'src/mp/session/matchSessionP2p.selftest.mjs',
    'src/mp/session/matchSessionEntryReports.selftest.mjs', // 2026-10-13 MP plan step 8: the loading host reports until its actor does
    'src/mp/session/hostHeadroom.selftest.mjs', // 2026-10-13 MP plan step 10: a slow tab declines to host while it waits in the room
    'src/mp/session/matchSessionHandOff.selftest.mjs', // 2026-10-13 MP plan step 11: a hosting tab going away hands its match on at once
    'src/mp/session/matchSessionRematchHost.selftest.mjs', // 2026-11-02 audit M2: a host's in-place rematch never declines its own next round
    'src/mp/session/matchSessionDecline.selftest.mjs', // 2026-11-02 audit M2: a host decline lasts its match; a seat that cannot host says so again
    'src/mp/session/matchSessionRole.selftest.mjs', // 2026-11-02 audit M2: the session's p2p role is one declared state; a finished host hands nothing on
    'src/mp/session/matchSessionBootRace.selftest.mjs', // 2026-11-02 audit M2: an election boot a newer election supersedes is no failure
    // 2026-11-03 integration IR11 (audit M1 x M2): an elected seat with no state of a running battle declines through the role machine and setDecline
    'src/mp/session/matchSessionFallbackDecline.selftest.mjs',
    'src/mp/session/matchSessionLiveHostFailure.selftest.mjs', // 2026-11-02 audit Q2 (round 2): a live host whose thread fails hands the match on at once (an unable decline, the hosting role left)
    'src/mp/session/matchSessionLoadingElection.selftest.mjs', // 2026-11-02 audit M2: a seat elected while it loads keeps the election and hosts
    'src/mp/session/matchSessionEntry.selftest.mjs', // 2026-11-02 audit M2: a leave cancels a loading entry; a re-sent match_start joins it
    'src/mp/session/matchSessionTimers.selftest.mjs', // 2026-11-02 audit M2: the re-entry fallback at the room's generation; the standby on injected timers
    'src/mp/session/endpoint.selftest.mjs',
    'src/mp/session/playMode.selftest.mjs',
    'src/mp/session/playerNames.selftest.mjs',
    'src/sim/worldSnapshot.selftest.mjs',
    'src/sim/predictionAuthorityState.selftest.mjs',
    'src/sim/movementPredictionState.selftest.mjs',
    'src/mp/transport/iceConfig.selftest.mjs',
    'src/mp/session/roomFailure.selftest.mjs',
    'src/mp/session/roomServiceLimit.selftest.mjs', // 243 Workers Free: one limit state over real sockets
    'src/ui/multiplayerStatus.selftest.mjs',
    'src/ui/roomFailurePresentation.selftest.mjs',
    'src/ui/playMenu.selftest.mjs',
    'src/ui/playMenuSeat.selftest.mjs', // 2026-11-02 audit F6: the Play menu's seat is one declared state; the handoff stops the hidden lobby
    'src/mp/session/compositionAccess.selftest.mjs',
    'src/mp/session/intentCover.selftest.mjs',
    'src/mp/session/lobbyPreloader.selftest.mjs',
    'src/mp/session/activationRuntime.selftest.mjs',
    'src/mp/session/roomInvite.selftest.mjs',
    'src/game/localWeaponPresentation.selftest.mjs',
    'server/githubStars.selftest.mjs',
    'server/relayCredentials.selftest.mjs',
    'server/telemetryRecord.selftest.mjs',
    'server/telemetry.selftest.mjs',
    'server/jev.selftest.mjs',
    'tools/deployment-policy.selftest.mjs',
    'tools/vercel-routes.selftest.mjs',
    'tools/contentSecurityPolicy.selftest.mjs', // 243 security: the report-only script-src names every inline script
    'tools/middleware-diet.selftest.mjs',
    'tools/worker-generated-types.selftest.mjs',
    'server/dedicatedWorldCollision.selftest.mjs',
    'server/collisionRestoreIndex.selftest.mjs', // 2026-10-16 physics: a whole destroyed set restores in linear time (Saltwind's walls)
    'server/convexOutlines.selftest.mjs', // 2026-10-08 the hitbox lane: every convex part holds its outline
    'server/mapResourceCache.selftest.mjs',
    'server/collisionManifestLoader.selftest.mjs',
    'server/collisionManifestCodec.selftest.mjs',
    // 2026-10-14 (physics stream): every base and variant shard matches its index.json entry (the loaders' check)
    'server/collisionManifestIndex.selftest.mjs',
    'server/collisionManifestRoutes.selftest.mjs', // 2026-10-16 physics: v2 serves 226's manifests (256 parts); /mp-collision holds production 224's byte for byte
    'server/dedicatedWorldCollisionMemory.selftest.mjs',
    'server/match/loop.selftest.mjs',
    'server/match/inputBuffer.selftest.mjs',
    'server/match/seatToken.selftest.mjs',
    'server/match/matchActor.selftest.mjs',
    'server/match/unseenShellMarks.selftest.mjs', // 2026-11-02 audit A13 (round 3): a viewer's unseen rounds stay within the wire's 256, ascending, every departure named in its frame; F4/E11 (round 4): no storage made again per frame (new-space bytes under --expose-gc), a kept frame keeps its own names
    'server/match/skipStarvation.selftest.mjs', // 2026-11-02 audit S1: a viewer withheld snapshots past the starvation limit is closed; a transient skip is not
    'server/match/forcedKeyframes.selftest.mjs', // 243 security: forced keyframes from a bucket of 8, refilling at 2/s
    'server/match/interestTiers.selftest.mjs',
    'server/match/snapshotBudget.selftest.mjs', // mp-scale-251: the per-viewer snapshot budget, keyframe slots, the row weigher
    'server/match/frameView.selftest.mjs', // mp-scale-251: viewer frames from the authority's view, the same bytes; past 32 hulls
    'server/match/matchActorResume.selftest.mjs',
    'server/match/matchPhase.selftest.mjs', // 2026-11-02 audit M3: one match phase through the ending hold to the stop; a clock verdict freezes the mode controller
    'src/sim/verdictHold.selftest.mjs', // 2026-11-04 round 2 U4: through the ending hold a falling crate lands, the ball comes down, a carried flag rides its carrier; nothing scores
    'src/sim/verdictBallShot.selftest.mjs', // 2026-11-06 round 3 A1: a round in flight at the clock verdict flies through the Turbo Ball on the authority's step; no hit, touch or launch
    'server/match/actorEnds.selftest.mjs', // 2026-11-02 audit M3: a self-stopped actor leaves the service, a failed WELCOME detaches, a roster change follows its batch
    'server/match/stallTimeline.selftest.mjs', // 267: through a server stall the timeline keeps the wall's grid; no control past the input ring
    'server/match/service.selftest.mjs',
    'server/match/tickCost.selftest.mjs',
    'tools/mp-soak.selftest.mjs',
    'tools/starvation-meter.selftest.mjs', // 267: the soak's starvation meter on driven clocks
    'server/authoritativeBots.selftest.mjs',
    'server/soakRams.selftest.mjs', // 2026-11-06 round 3 B8: the bot soak's ally gate and per-ram viewer check judge a staged battle with rams (the soak's own battles had none)
    'server/botModes.selftest.mjs',
    'server/botObjectives.selftest.mjs',
    // 2026-10-16 (test-speed R9a): the 132 pacing matches play in eight one-thread shards; battlePacing merges their
    // records and judges them (the runner admits it last; it plays any share without records from this run).
    'server/battlePacingShard1.selftest.mjs',
    'server/battlePacingShard2.selftest.mjs',
    'server/battlePacingShard3.selftest.mjs',
    'server/battlePacingShard4.selftest.mjs',
    'server/battlePacingShard5.selftest.mjs',
    'server/battlePacingShard6.selftest.mjs',
    'server/battlePacingShard7.selftest.mjs',
    'server/battlePacingShard8.selftest.mjs',
    'server/battlePacing.selftest.mjs',
    'server/battlePacingRun.selftest.mjs', // the shards' partition, report check, merge and hand-over, on fixtures
    // 2026-10-05 (owner: "floor as a tail rate"): the pacing gate's arithmetic and the tail's shard merge.
    'tools/pacing-tail.selftest.mjs',
    'server/roadCrossingSweep.selftest.mjs', // 2026-10-03: the maps lane's road crossings, driven both ways (nothing standing in a carriageway)
    'src/sim/poseHistory.selftest.mjs',
    // 2026-11-02 audit M4: a revive is a life boundary for lag compensation's pose history (no rewind into a wreck's pose)
    'server/match/lagCompensationLife.selftest.mjs',
    'src/sim/movement.selftest.mjs',
    // 2026-10-04 (physics lane round 8): every playable tank publishes its track contact; the host and solo read it alike.
    'src/sim/trackContact.selftest.mjs',
    // 2026-10-05: the contact audit's rules, the run within 5 mm and the belly pan 5 mm below to 1 cm above (the K2 LOW gear).
    'src/vehicles/trackContactDerivationAudit.selftest.mjs',
    'src/sim/impact.selftest.mjs',
    'src/sim/impactPhysics.selftest.mjs',
    'src/sim/impactParity.selftest.mjs',
    'src/sim/ramModuleLaw.selftest.mjs', // 2026-11-02 audit M6: one module law, and a lethal ram's module damage on both drivers
    // 2026-11-06 round 5 S2 (audit M6 ram rule after the 268 merge): a teammate ram deals nothing on the solo step or a room's
    // authority, and its report reaches the page's bus, the audio and the paired phone with no damage event or cue (MANUAL:
    // sims, tools/selftest-tiers.mjs); its default-tier half holds the two events' listeners in src and the phone's cue
    'src/sim/teammateRam.selftest.mjs',
    'src/sim/teammateRamListeners.selftest.mjs',
    // 265 (the owner, 2026-10-29: one core, two drivers): the local step and the authority's leave the same world, byte for byte
    // (2026-11-02 audit M6: and what each team sees, tick for tick — spotting through one factory)
    'src/sim/driverStepParity.selftest.mjs',
    // 2026-11-06 round 4 F8 (audit M6 spotting parity): the solo spotting reads the gated kit (combat.equip), as the authority's
    'src/sim/spottingKitParity.selftest.mjs',
    'src/sim/crushPress.selftest.mjs', // 2026-11-02 audit M6: the crush press is the battle's, per hull and record, on both drivers
    'src/game/battleExitLedgers.selftest.mjs', // 2026-11-04 round 2 U13: the crush press and ram cooldowns leave with their battle at the Garage return
    // 268 (couch mode): one seat's input stage, the authority's and the local seats' alike
    'src/sim/playerInputStage.selftest.mjs',
    'src/sim/structureSupport.selftest.mjs',
    // 2026-10-10 (physics lane, owner: "the turret snaps into a pre-ordained resting position ... just let physics work"):
    // the game's own rigid bodies, and a dead hull's turret as one.
    'src/sim/rigidBody.selftest.mjs',
    'src/sim/wreckTurrets.selftest.mjs',
    // 2026-11-02 audit 11-sim-2 #9: one owner for a wreck turret's phase; revived, benched and parked hulls, a full world, reset
    'src/sim/wreckTurretLifecycle.selftest.mjs',
    'src/vehicles/wreckTurretDriver.selftest.mjs',
    // 2026-10-11 (218's bundle budget): the tank factory reaches the wreck physics only through its lazy loader.
    'src/vehicles/wreckTurretDriverLoader.selftest.mjs',
    'src/vehicles/wreckLifecycle.selftest.mjs', // 2026-11-02 audit F10: one wreck state per visual: cook-off upgrade, reset cursors, disposed latch
    'src/vehicles/wreckTurretMode.selftest.mjs', // 2026-11-02 audit F10: one declared turret mode; late physics hands over to the authority
    // 2026-10-09 (vehicle-contact lane, owner: "tracks shouldnt glitch through the bridge"): the drawn tracks rest on the
    // bridge decks the hull stands on (Aegis Crossing's viaduct, Amberford, Suzhou Creek), driven and parked.
    'src/world/vehicleGroundContact.selftest.mjs',
    'src/sim/rollover.selftest.mjs',
    'src/sim/hullLifeParity.selftest.mjs', // 2026-11-02 audit M6: a revive's crash memory and the rollover gate, alike on both drivers
    // 2026-11-02 audit M8: one owner for the hull body mode; no overturned or righting latch outside the rigid phase
    'src/sim/hullBodyMode.selftest.mjs',
    // 2026-11-02 audit M8: ground contact's two copies have one writer, a checkpoint restore included
    'src/sim/groundContactCopies.selftest.mjs',
    'src/sim/tankBodyContacts.selftest.mjs',
    'src/sim/tankBodyRest.selftest.mjs',
    'src/sim/obstacleDepenetration.selftest.mjs', // 2026-10-12: an overlap leaves over a few steps; travel into a wall stops at once
    'tools/physics-torture.selftest.mjs',
    // 2026-10-13 (physics stream): a stone under its drawn top is climbed or stops a hull by its face grade and height
    'tools/rock-drawn-top.selftest.mjs',
    // 2026-10-13 (physics stream F2): a roof rides its building's movement record as a floor-only deck
    'tools/roof-decks.selftest.mjs',
    // 2026-10-14 (physics stream F4(b)): a hull at rest on a roof holds its attitude (no flipping between plane fits)
    'tools/roof-rest.selftest.mjs',
    // 2026-10-14 (physics stream F5): a hull on its shell rests and rebounds off still ground, no springs
    'tools/shell-contact.selftest.mjs',
    // 2026-10-14 (physics stream F6): a hull at a roof's edge stands on it or rolls off it by its centre of mass
    'tools/roof-edge.selftest.mjs',
    // 2026-10-14 (physics stream F7a): roof pivots no longer hop: a support step is position, a rebound no launch
    'tools/roof-hops.selftest.mjs',
    // 2026-10-14 (physics stream F8): roof falls: the edge under the box is a contact, walls under the roof are passed
    'tools/roof-falls.selftest.mjs',
    // 2026-10-14 (physics stream F9): a hull set level on a steep face lies onto it, no snap, never over
    'tools/steep-plane.selftest.mjs',
    'src/sim/tankContactShape.selftest.mjs',
    'src/sim/combat.selftest.mjs',
    'src/sim/combatMaintenance.selftest.mjs',
    'src/sim/spotting.selftest.mjs',
    // 2026-11-02 audit M4: a hull the mode keeps off the field is neither spotted nor spotting; the linger ends on time
    'src/sim/spottingLife.selftest.mjs',
    'src/sim/hiddenShotEvents.selftest.mjs', // 242 security round 2 (3a55e00a60, the hidden-shooter shell_hit); in no suite since
    'src/sim/spottingHullBushGrid.selftest.mjs',
    'src/sim/shellSurface.selftest.mjs',
    // 2026-11-03 (impact-materials-269): what a round struck, every fleet plate's material, stamped by the damage law
    'src/sim/plateMaterial.selftest.mjs',
    // 2026-10-07 (destruction core lane): the munition blast catalog over every round in the game (docs/DESTRUCTION.md §4).
    'src/sim/munitionBlast.selftest.mjs',
    'src/sim/structureDamage.selftest.mjs',
    'src/sim/shellLightCover.selftest.mjs', // 2026-10-12: a round breaks the light cover it flies through (fences, crates, cars)
    'src/sim/destructionParity.selftest.mjs',
    // 2026-10-29 (ram-yield-prediction-264): a building the own ram brings down yields to the drawn hull as to the authority's
    'src/mp/presentation/predictionStructureYield.selftest.mjs',
    // 2026-10-09 (destruction core lane): the pillbox stops every round and falls only to accumulated heavy blows.
    'src/sim/fortifiedCover.selftest.mjs',
    'src/sim/setPieceShellBreak.selftest.mjs',
    'src/sim/terrainDeformation.selftest.mjs',
    // 2026-11-02 audit S2: the overlay's clock as a state: reset unsets it (no heap starts on the last battle's time), and
    // a risen ground keeps its lattice cache while the clock runs
    'src/sim/terrainOverlayClock.selftest.mjs',
    'src/sim/destructionNavigation.selftest.mjs',
    'src/sim/destructionShard.selftest.mjs',
    'src/sim/destructionLogBudget.selftest.mjs', // 243 security C3: the destruction log's budget
    'src/sim/destructionCraters.selftest.mjs',
    // 2026-10-15 (destruction lane, DST-04): the world's ray march reads the dug ground (craters' bowls, heaps), both worlds
    'src/world/groundOverlayRaycast.selftest.mjs',
    // 2026-10-15 (destruction lane, DST-04): a map's pre-placed craters as real bowls, laid first by every match
    'src/world/mapCraters.selftest.mjs',
    // 2026-10-08 (destruction core lane, P2): sections — holes, fallen panels, roofs and storeys that rays pass
    'src/sim/structureSections.selftest.mjs',
    'src/sim/destructionSections.selftest.mjs',
    'src/sim/hiddenWorldEvents.selftest.mjs',
    'src/sim/botEvents.selftest.mjs', // 2026-11-02 audit M6: shots, hits and blocked shots reach the bots through one delivery on both drivers
    // ground lane (2026-10-08, crater-render-spec §B, §C): the drawn terrain and the ground cover follow the overlay
    'src/world/terrainCraterMesh.selftest.mjs',
    'src/world/groundCoverCraters.selftest.mjs',
    // 2026-10-08 (destruction core lane, P2; wave 277): the collapse comes down storey by storey before its swap
    'src/sim/collapseCascade.selftest.mjs',
    // 2026-10-16 (destruction lane): a collapse leaves a ruin, never a raft (the r2 sweep's anti-raft floors), every kit
    'src/world/collapseRuin.selftest.mjs',
    // 2026-10-17 (destruction-slabs 227, the owner's church slabs): one drawn enclosure per structure; the room, floor
    // and ruin writers place through it
    'src/world/structureEnclosure.selftest.mjs',
    // 2026-10-18 (destruction-slabs 227 round 4): the intact and enclosure measures made off the parts when first asked
    // for (never in the props build), the same read back through the placement
    'src/world/structureDeferredMeasure.selftest.mjs',
    // the kit seam's world side: the default kit, the aDamage tags, spans, depth materials and shadow touch (§16.4)
    'src/world/destructionKit.selftest.mjs',
    'src/world/fractureAnatomy.selftest.mjs',
    // 2026-10-08 (destruction core lane, layout identity): a phone places the desktop's records, index for index
    'src/world/phoneLayoutIdentity.selftest.mjs',
    'src/sim/botRoutePlanner.selftest.mjs',
    'src/sim/botRouteClearance.selftest.mjs',
    // 2026-10-28 (bot-wedge-264): no route starts from a grid cell the hull cannot drive out of (the Badlands mesa flank)
    'src/sim/botRouteStartCell.selftest.mjs',
    // 2026-10-16 (bots lane, READY-227): the hard bot's Verdant approach, after the clearance bevel (the smock mill's needles)
    'src/sim/botVerdantApproach.selftest.mjs',
    // 2026-10-03 (bots lane): an edge holds the side slope across it to the two-way slope rule.
    'src/sim/botRouteSideSlope.selftest.mjs',
    'src/sim/botNavigationWater.selftest.mjs',
    'src/sim/navigationLiquidSafety.selftest.mjs',
    'src/sim/navigationLiquidStart.selftest.mjs',
    'src/sim/bridgeDeckNavigation.selftest.mjs',
    // 2026-10-08 (modes lane): symmetric deployments on every map — rotations, clear, spaced, seated as is.
    'src/sim/deployment.selftest.mjs',
    'src/sim/matchModes.selftest.mjs',
    // 2026-10-03 (bots lane): the frontline attack regroups before the last sector.
    'src/sim/frontlineRegroup.selftest.mjs',
    // 268 (Main item 9): Frontline's opening line out of the attack's reach and sight on 64 seeds (manual: pacing).
    'src/sim/frontlineLineGuard.selftest.mjs',
    // 2026-10-18 (owner, gameplay-modes-228): per-mode bot doctrine (classic byte-identical), the Horde's wave law and
    // arrival ring, the honest hunt, Frontline's line and counter-attack, CTF and Turbo Ball roles, the revived bot's
    // fresh route, a mission owns its waypoints, TEAM NATIONS (planner, nation index, room seating) and the harness gate
    'src/sim/botDoctrine.selftest.mjs',
    'src/sim/hordeWaveLaw.selftest.mjs',
    // 2026-11-02 audit M4: one life state per tank (alive/down/benched/rescued) through one transition; a refused Horde
    // arrival retries as an arrival and stays owed, not alive; a restore benches its resting hulls
    'src/sim/modeLife.selftest.mjs',
    'src/sim/honestHunt.selftest.mjs',
    'src/sim/frontlineDefenders.selftest.mjs',
    'src/sim/flagBots.selftest.mjs',
    'src/sim/ballIntercept.selftest.mjs',
    'src/sim/reviveClearsModeTarget.selftest.mjs',
    'src/game/ai.missionOwnership.selftest.mjs',
    // round 2 (the critic's E5/E6): the scout kite, the no-ram lane and the zone sortie act only on hulls the side spots
    'src/game/ai.honestSenses.selftest.mjs',
    // round 3 (the critic's M3/M4): the jockey and the rolling turn — classic stands and pivots as before
    'src/game/ai.jockey.selftest.mjs',
    // round 3 (the critic's M2/M3): the hunt's run-in beside its quarry and the orbit rings spread by the pack
    'src/game/ai.huntRunIn.selftest.mjs',
    'src/sim/teamNations.selftest.mjs',
    'src/sim/nationIndex.selftest.mjs',
    'src/mp/room/roomBots.selftest.mjs',
    'tools/mode-aggression-harness.selftest.mjs',
    'src/sim/matchRuleset.selftest.mjs',
    // 2026-10-17 (v2 progression): the proving ground's ruleset row, practice partition, range layout, card and drive.
    'src/sim/provingGround.selftest.mjs',
    'src/sim/assaultLines.selftest.mjs',
    'src/sim/matchPlacement.selftest.mjs',
    'src/sim/authoritativeMatch.selftest.mjs',
    'src/sim/consumableAuthority.selftest.mjs',
    'src/sim/authoritativeBotControls.selftest.mjs',
    'src/sim/ai.aim.selftest.mjs',
    'src/sim/botGunLane.selftest.mjs',
    'src/game/ai.selftest.mjs',
    'src/game/ai.targeting.selftest.mjs',
    'src/game/ai.stalls.selftest.mjs',
    'src/game/ai.levels.selftest.mjs',
    'src/game/ai.passiveTarget.selftest.mjs',
    // 2026-10-03 (bots lane): a zone centred on a face is held from holdable ground beside it.
    'src/game/ai.zoneHold.selftest.mjs',
    // 2026-10-03 (bots lane): a route corner the hull pivots toward is held through the rechecks.
    'src/game/ai.cornerHold.selftest.mjs',
    // 268 (Main item 10): a planned leg is judged by the planner's clearance; a hull off it rejoins it before corners.
    'src/game/ai.plannedLeg.selftest.mjs',
    // 268 (Main item 10b): exactly one hull of an ally pair yields; the follower in a following pair, whatever the ids.
    'src/game/ai.allyYield.selftest.mjs',
    // 268 (Main item 10 (A)): a hull pressed into a static solid with no way releases at once (Desert seed 12's boulder gap).
    'src/game/ai.rockWedge.selftest.mjs',
    // 269 (Main item 11): a bot with a shot open turns its hull within its share of the turret's traverse and lays its gun.
    'src/game/ai.layGunFirst.selftest.mjs',
    // 2026-10-03 (bots lane): an engaged casemate keeps its bow on its target (scoots, jinks, cover).
    'src/game/ai.casemateLay.selftest.mjs',
    // 2026-10-03 (bots lane): a patrol leg the grid cannot route still drives (the bridge gate's no-route hold).
    'src/game/ai.patrolNoRoute.selftest.mjs',
    // 2026-10-04 (physics lane): a fresh contact is no starved trigger; under fire in the open a settle holds nothing.
    'src/game/ai.underFire.selftest.mjs',
    // 2026-10-04 (physics lane): a collider stop backs the hull off at once, through an engagement that starts on it.
    'src/game/ai.colliderStop.selftest.mjs',
    'src/game/ai.gridOrderShared.selftest.mjs', // battle-spikes-253: the bots' grid-order check one walk a list, not one a bot
    // 2026-10-07 (bots lane): an empty rack with no teammate left that can fire runs at a passive target (Polders 41000).
    'src/game/ai.lastRun.selftest.mjs',
    // 2026-10-09 (gameplay lane): a pivot never drives past 4 m/s (botModes Aegis Crossing Turbo Ball, the 896-point fall).
    'src/game/ai.pivotRoll.selftest.mjs',
    // 2026-10-09 (gameplay lane): an escalated stuck recovery releases the careful rules for 10 s (Blackglass 38001).
    'src/game/ai.wedgeRelease.selftest.mjs',
    // 2026-11-02 audit M7: the drive owners, doctrine starts and drive layers run from declared tables in the old order
    'src/game/ai.driveOwner.selftest.mjs',
    // 2026-11-02 audit M7: every mode change runs the exit actions of the mode it leaves (a flank's count, a cover roll)
    'src/game/ai.modeExit.selftest.mjs',
    // 2026-11-02 audit M7: the waypoints carry their writer; a route ending where the mission's does is not the mission's
    'src/game/ai.routeOwner.selftest.mjs',
    // 2026-11-02 audit M7: news between ticks lands at the next update in one declared order (any telling, one bot)
    'src/game/ai.eventOrder.selftest.mjs',
    // 2026-11-02 audit M7: a brain Watch mode hands back resumes from the hull as it stands (no burst, shot or spike)
    'src/game/ai.watchResume.selftest.mjs',
    // 2026-11-02 audit M7: both drivers apply the bots' news at the end of the fire-and-shells phase; teammates read it
    'src/game/ai.newsFlush.selftest.mjs',
    // 2026-11-02 audit M7 (round 2 U18): the authority's revive hands the bot's brain back (no progress spike on the new
    // life); round 3 M3: so does a migrated host's restore (no progress spike or burst on its first tick)
    'src/game/ai.reviveResume.selftest.mjs',
    // 2026-11-02 audit M7 (round 2 U18, split off in round 3 B17): the solo battle's revive hands the bot's brain back
    'src/game/ai.reviveResumeSolo.selftest.mjs',
    'src/game/botAbilities.selftest.mjs',
    'src/sim/botTerrainSafety.selftest.mjs',
    // (2026-11-02 audit M6: and the orders as recorded input a replay applies again, the sim-second deadline, the commander's
    // forward-only life, the session's halt)
    'src/game/jevCommander.selftest.mjs',
    'src/game/profile.selftest.mjs',
    'src/game/serviceRecord.selftest.mjs',
    'src/ui/serviceRecordView.selftest.mjs',
    'src/ui/battlefieldFacts.selftest.mjs',
    'src/game/campaignProgress.selftest.mjs',
    'src/game/campaignOperations.selftest.mjs',
    'src/game/teamArrangement.selftest.mjs',
    'src/game/battlePreferences.selftest.mjs',
    'src/game/campaignDebrief.selftest.mjs',
    'src/ui/missionBrief.selftest.mjs',
    'src/game/battleModuleAccess.selftest.mjs',
    'src/game/playSurfaceRuntime.selftest.mjs',
    'src/game/equipment.selftest.mjs',
    'src/game/consumables.selftest.mjs',
    'src/game/consumableLoadout.selftest.mjs',
    // 2026-11-02 audit R6 (round 2 U35): the consumables' smoke table is asked again under the lazy-chunk policy, never per hover
    'src/ui/garageSmokeTableLoad.selftest.mjs',
    'src/game/wheelNotches.selftest.mjs',
    'src/game/input.selftest.mjs',
    // 2026-10-23 (aim-focus 243): refused Settings relocks never latch cursor aim; a menu click is never an aim point
    'src/game/inputPointerLockFocus.selftest.mjs',
    'src/game/playerBattleActions.selftest.mjs',
    // 2026-11-02 audit F8: Q's ATGM toggle is the game's, not the HUD tile's (round 3 B9: the pad's LB through the sim's own
    // activateGuidedMissile)
    'src/game/atgmToggle.selftest.mjs',
    'src/game/battleKeyActions.selftest.mjs',
    // 2026-10-25 (owner): one vehicle-action table, each action on its own key and in one order on every vehicle
    'src/game/vehicleActions.selftest.mjs',
    'src/game/playerFrameInput.selftest.mjs',
    'src/app/combatWarmComposition.selftest.mjs',
    // 2026-11-02 audit R6/F2: a failed deferred-warm or mission-attachment chunk no longer fails every later battle
    'src/app/battleEntryLoadFailure.selftest.mjs',
    'src/app/battleEndGarageWarm.selftest.mjs',
    'src/app/mainFrameRuntime.selftest.mjs',
    'src/app/programOriginWatch.selftest.mjs', // 2026-11-02 audit F2: one shared draw wrapper; any stop order restores it
    'src/app/mainFlowPorts.selftest.mjs', // 2026-11-02 audit F2/F3: main's own flow-port bindings, run from its compositions
    'src/app/mainBattleHudRuntime.selftest.mjs',
    'src/game/battleFrameRuntime.selftest.mjs',
    'src/game/battleHudFrameRuntime.selftest.mjs',
    'src/game/matchModeWorldPresentation.selftest.mjs',
    // 2026-10-16 (the perf lane): the presentation behind its own chunk (226's game entry budget)
    'src/game/matchModeWorldLazy.selftest.mjs',
    'src/game/preBattleCountdown.selftest.mjs',
    'src/game/battleCountdownEdges.selftest.mjs', // 2026-11-02 audit F1: one rollout a battle; a capped warm-hold limit; one countdown writer
    'src/game/battleWarmHold.selftest.mjs', // 2026-11-02 audit F2: one warm-hold owner; a successor never inherits a stale warm
    'src/ui/preBattleOverlay.selftest.mjs',
    'src/game/aimController.selftest.mjs',
    'src/game/ammoSelectionPresentation.selftest.mjs',
    'src/game/eraActivation.selftest.mjs',
    'src/game/mobileAutoAim.selftest.mjs',
    'src/game/matchmaking.selftest.mjs',
    'src/game/replayPose.selftest.mjs',
    'src/game/killcamCapture.selftest.mjs',
    'src/game/killcamGhostPolicy.selftest.mjs',
    'src/game/killcamPresentation.selftest.mjs',
    'src/game/killcamObserverInput.selftest.mjs',
    'src/game/killcamWreckReceipt.selftest.mjs', // 2026-11-02 audit F10: a restaged wreck, victim or attacker, keeps its look and its authority's turret pose
    // watch-mode-243: the ride-along's handoff on death, picking and cycling, Take control / Leave through the rig
    'src/game/watchController.selftest.mjs',
    // watch-mode-243: the Watch ruleset entry, bot -> player -> bot, the replay over the swap, every mode with no human seat
    'src/game/watchSeat.selftest.mjs',
    // (watch-drone-244) Take control in every watchable mode: the boss, a convert, a carrier, revives, a drone; AC-130 and rooms
    'src/game/watchTakeover.selftest.mjs',
    'src/game/battleResultPresentationRuntime.selftest.mjs',
    'src/game/battleResultBeatClock.selftest.mjs', // 2026-11-02 audit F4: death and ending beats hold through a pause
    'src/game/deathFlowExits.selftest.mjs', // 2026-11-02 audit round 5 U4: every exit that ends the player's death flow (a teardown, a fresh or left Watch seat, a mode's revive) leaves the result runtime owing no hand-back and no late replay; a revive hands the HUD and camera back and re-arms the death flow, at its row or its next death's event (real runtime, rig, killcam and watch controller)
    'src/game/battleEnding.selftest.mjs',
    'src/game/battleEndingHold.selftest.mjs',
    'src/game/killcamSelection.selftest.mjs',
    'src/game/killcamGround.selftest.mjs',
    'src/fx/impactDecals.selftest.mjs',
    'src/fx/impactAtlasPacing.selftest.mjs',
    'src/gallery/catalog.selftest.mjs',
    'src/gallery/viewGlyphs.selftest.mjs',
    'src/gallery/cameraFit.selftest.mjs',
    'src/gallery/trueScale.selftest.mjs',
    'src/gallery/modeDockLayout.selftest.mjs',
    'src/gallery/surfaceMarkup.selftest.mjs',
    'src/vehicles/rosterPolicy.selftest.mjs',
    // 2026-10-13 (SSOT 2.19 ID.01): the tank id rename table's slug engine and the owner's Leopard example.
    'tools/tank-id-rename-table.selftest.mjs',
    // 2026-10-13 (SSOT 2.19 ID.03): the versioned tank id alias layer and its boundaries (save, replay, scene link,
    // gallery URL, room seat, telemetry) resolve swapped ids by schema.
    'src/vehicles/tankIdAliases.selftest.mjs',
    'src/game/tankIdBoundaries.selftest.mjs',
    // 2026-10-13 (SSOT 2.19 ID.04/05): the tank id codemod renames a tree once and, as the lanes' merge helper, converts
    // only a lane's own old-id lines and id-only conflicts; a second run changes nothing.
    'tools/tank-id-codemod.selftest.mjs',
    // 2026-10-13 (SSOT 2.19 ID.04/05): id-named icons, thumbnails and geometry gate records move through swaps once.
    'tools/tank-id-move-files.selftest.mjs',
    // 2026-10-14 (SSOT 2.19 ID.04/05): the tank asset manifest is keyed to the current ids; the CPU re-key reproduces
    // the browser generator's id-bearing fields byte for byte.
    'tools/tank-id-rekey-assets.selftest.mjs',
    // 2026-10-30 (266): the tank asset manifest is a row file per tank: every file under the 5 MB cap, canonical, named
    // for its row, joined and re-split byte for byte in the pinned id order; negative controls on fixtures.
    'tools/tank-assets-layout.selftest.mjs',
    // 2026-10-13: no two vehicles read the same (display and card names roster-wide; no X suffix).
    'src/vehicles/tankLabelUniqueness.selftest.mjs',
    'src/vehicles/taxonomy.selftest.mjs',
    // 2026-10-17 (owner): class, battle role and design status for every playable id, once per facet.
    'src/vehicles/vehicleFacets.selftest.mjs',
    'src/vehicles/afvBalance.selftest.mjs',
    'src/vehicles/tier.selftest.mjs',
    'src/vehicles/materialQuality.selftest.mjs',
    // 2026-11-02 audit R5: one paint owner for a shared camo entry (A-B-A, sync over chunked, private promotion), release
    // by identity
    'src/vehicles/camoPaintOwner.selftest.mjs',
    'src/vehicles/materialPainterWorker.selftest.mjs',
    'src/vehicles/sharedTextureLease.selftest.mjs',
    'src/vehicles/sootTextureSharing.selftest.mjs',
    'src/vehicles/decorKitTextureSelection.selftest.mjs',
    'src/vehicles/wreckBurn.selftest.mjs',
    'src/vehicles/sharedTextureWorkerLease.selftest.mjs',
    'src/vehicles/appearanceAudit.selftest.mjs',
    'src/vehicles/wheelPaintFloor.selftest.mjs',
    'src/vehicles/runningGearFinish.selftest.mjs',
    'src/vehicles/ghillieSuit.selftest.mjs',
    // 2026-10-11 (the coordinator's determinism ruling): a suit lays identical cloth alone and after other hulls under load
    'src/vehicles/ghilliePlacementDeterminism.selftest.mjs',
    'tools/cpu-burners.selftest.mjs',
    // 2026-10-13 (netting-proper; the owner: "aren't as ridiculously placed like peacock feathers"): field garnish lies on
    // its net (roof cards within 12 cm of it and their faces on its, no drape card standing up)
    'src/vehicles/ghillieGarnishLie.selftest.mjs',
    // 263 (the GPU-still critic: "black specks and dark fringes", "the net reads flat"): the suits' cut textures keep
    // straight alpha flooded with their cloth's colour, coverage mips, and the gaps under thick garnish shaded
    'src/vehicles/alphaCutTexture.selftest.mjs',
    // 265 (the 264b preview, the owner: box-shaped shadows beside netted tanks): every alpha-cut caster casts through
    // its map's level 0, never the coverage mips' near-solid texels; its control finds a suit draw without it
    'src/vehicles/alphaCutShadow.selftest.mjs',
    // 264 (Main's ruling on the 263 critic's "no shadow under any laid net"): a suit's shade baked on the armour under
    // it, one vertex layout per owner and material, 0 past its edge and on every draw without it
    'src/vehicles/suitOcclusion.selftest.mjs',
    // 2026-10-14 (netting-225; the coordinator's seat-stability ruling): a marking re-solve keeps every seat that still
    // reads its recorded count, and searches one that does not within 0.5 m of where it stood
    'src/vehicles/markingSeatStability.selftest.mjs',
    // 2026-10-11 (netting lane): the runtime keeps camouflage out of hits, scars, contact and LOD, as the receipts do
    'src/vehicles/camouflageRuntime.selftest.mjs',
    'src/vehicles/accessoryMaterials.selftest.mjs',
    // 2026-10-09 (fleet-weapons lane): no weapon mesh is a flat single colour; unknown fitting slots throw
    'src/vehicles/weaponFinish.selftest.mjs',
    // 2026-10-05 (tank-accessories lane): decor draws per tank at or below their count before the accessory rebuild
    'src/vehicles/decorDrawBudget.selftest.mjs',
    // 2026-10-08 (tank-accessories round 5): every accessory piece touches the vehicle within 15 mm (a ratchet to zero)
    'src/vehicles/accessoryContact.selftest.mjs',
    'src/vehicles/profiles/leopard2A6UA.selftest.mjs',
    'src/vehicles/profiles/type99Armor.selftest.mjs',
    // 262 (the Merkava family builder): the six marks' structure, guns and packages, and their guns over their hulls; the
    // old pile's fit receipts (merkavaGunCradle, merkavaRunningGear, merkava1bFit, merkava2Fit, merkava3Fit,
    // merkavaEraFinish, merkava4bGeometry) retired with the geometry they pinned
    'src/vehicles/profiles/merkavaFamily.selftest.mjs',
    'src/vehicles/profiles/merkavaFamilyGunClearance.selftest.mjs',
    'src/vehicles/profiles/swedishSiegeLine.selftest.mjs',
    'src/vehicles/profiles/t72JaguarRedesign.selftest.mjs',
    'src/vehicles/profiles/challenger2Geometry.selftest.mjs',
    'src/vehicles/profiles/challenger2Family.selftest.mjs',
    'src/vehicles/profiles/challenger3HullClosure.selftest.mjs',
    'src/vehicles/profiles/challenger3RearTurret.selftest.mjs',
    'src/vehicles/profiles/challenger3RunningGear.selftest.mjs',
    // 264: the Challenger 3 TD's Hydrogas units on the oracle's casting, the arms in the track lane's shadow
    'src/vehicles/profiles/challenger3TdSuspension.selftest.mjs',
    'src/vehicles/battleDetailLod.selftest.mjs',
    'src/vehicles/combatVisibility.selftest.mjs',
    'src/vehicles/articulatedShadowBatchIntegration.selftest.mjs',
    'src/vehicles/battleGeometrySharing.selftest.mjs',
    'src/vehicles/staticDrawMerge.selftest.mjs',
    'src/vehicles/battleStaticDrawMerge.selftest.mjs', // perf-250/251: the source-X Abrams' battle builds take the dual merge
    'src/vehicles/tankVisualClone.selftest.mjs', // perf-252: a copied visual (battle builds too) draws as a fresh build
    'src/vehicles/farLod.selftest.mjs', // perf-255: the far LOD past 180 m, the near law after a far trip
    'src/vehicles/recoilRig.selftest.mjs',
    // 2026-11-02 audit M9: the hit/recoil hull rock is the visual's own spring; the sim never reads or carries it
    'src/vehicles/hullFlinchPresentation.selftest.mjs',
    'src/fx/fxRuntimeAccess.selftest.mjs',
    'src/game/garageDressingAccess.selftest.mjs',
    'src/game/garageDressingFleet.selftest.mjs',
    'src/game/garageWorkshopMaterials.selftest.mjs',
    'src/game/garageWorkshopTransfer.selftest.mjs',
    'src/game/garageDressingLifecycle.selftest.mjs',
    'src/game/garageDressingRetry.selftest.mjs',
    'src/game/garageWorkshopDiagnostics.selftest.mjs',
    'src/game/garagePedestalPreloader.selftest.mjs',
    'src/game/armorAimOverlayAccess.selftest.mjs',
    'src/game/killcamAccess.selftest.mjs',
    'src/world/propGeometry.selftest.mjs',
    'src/world/randomBattleMaps.selftest.mjs',
    'src/world/mapCatalog.selftest.mjs',
    'src/world/mapIntegration.selftest.mjs',
    'src/world/mapQuality.selftest.mjs',
    'src/world/waterMobility.selftest.mjs',
    'src/world/terrainContactSurface.selftest.mjs',
    // 2026-10-25 (workstream #3, the Rust core's flagged kernels): the WebAssembly contact surface and grids, bit for bit
    'src/world/wasmWorldKernels.selftest.mjs',
    // 2026-11-02 audit S2: the kernels' cross-call protocols checked per call (write-once lattice, walk ids, a hull's
    // query/begin/samples, grid handles), on the package and at the seam
    'src/world/wasmKernelProtocols.selftest.mjs',
    // 2026-11-02 audit S2, round 2 U37: every refusal names the call it refused (the code is the last checked call's), a
    // refused sample's NaN and a replayed crater the kernel refused throw at the seam, a heap rises from its given start
    'src/world/wasmKernelRefusals.selftest.mjs',
    // 2026-11-02 audit S2: the kernel's copy of the match's ground is a binding (bound twice, rebound, unbound: each change
    // once), and a heap laid on a clock that ran before the bind rises on it on both
    'src/world/wasmGroundMirror.selftest.mjs',
    // 2026-10-15 (ground lane): the steep-cell diagonal — one split for the drawn mesh, the contact surface, the overlay
    'src/world/terrainDiagonal.selftest.mjs',
    'tools/render-frame-sampler.selftest.mjs',
    'tools/environment-shot-camera.selftest.mjs',
    'tools/water-shore-camera.selftest.mjs',
    'tools/map-probe-runtime.selftest.mjs',
    'tools/map-metrics.selftest.mjs',
    'tools/map-layout-metrics.selftest.mjs',
    // the horizons stream (2026-10-13, HB-1a): the horizon envelope reproduces H1's ring skylines (Verdant 1.72°, Titan 12.25°, Polders 0.71°)
    'tools/horizon-envelope.selftest.mjs',
    'src/world/mapLayoutBrief.selftest.mjs',
    'server/collisionManifestDrift.selftest.mjs',
    'src/world/wreckBakePlanDrift.selftest.mjs', // 2026-10-08: the wreck bake plan holds every map, tier and terrain the tree builds
    'src/world/roadFootprint.selftest.mjs', // 2026-10-02: solids from the scatter passes keep their footprints out of the road core
    'tools/visual-census.selftest.mjs', // 2026-10-01: the redesign baseline census (camera set, site selection, metrics, reports)
    'tools/worldColliderAudit.selftest.mjs', // 2026-10-07 the hitbox lane: the world collider audit's measures
    'tools/environment-motion-probe.selftest.mjs',
    'tools/horizon-construction-bench.selftest.mjs',
    'tools/map-art-guards.selftest.mjs',
    'tools/map-environment-quality.selftest.mjs',
    'tools/world-residency-policy.selftest.mjs',
    'tools/pinned-scene-acquisition.selftest.mjs',
    'tools/phase-environment-receipt.selftest.mjs',
    'tools/perfprobe.selftest.mjs',
    'tools/perfprobe-submission.selftest.mjs',
    'tools/perfprobe-draw-attribution.selftest.mjs',
    'tools/perfprobe-scheduler-trace.selftest.mjs',
    'tools/perfprobe-profile-window.selftest.mjs',
    'tools/shot-schematic-parity-probe.selftest.mjs',
    'tools/perfprobe-camera-input.selftest.mjs',
    'tools/garage-battle-actions-contract.selftest.mjs',
    'tools/garage-action-timing.selftest.mjs',
    'tools/phase-resource-frame-accounting.selftest.mjs',
    'tools/phase-resource-probe.selftest.mjs',
    'tools/sourced-texture-readiness.selftest.mjs',
    'tools/sourced-image-composition.selftest.mjs',
    'tools/sourced-image-worker.selftest.mjs',
    'tools/sourced-image-persistent.selftest.mjs',
    'tools/garage-audio-intent.selftest.mjs',
    'tools/audio-default-sink.selftest.mjs',
    'tools/solo-cold-import-cover.selftest.mjs',
    'src/ui/garageReturnFailure.selftest.mjs',
    'src/ui/modalFocusLifecycle.selftest.mjs',
    'src/ui/transitionCover.selftest.mjs',
    'src/ui/transitionRuntime.selftest.mjs',
    'src/ui/transitionFadeFrame.selftest.mjs',
    'tools/residency-camera-acquisition.selftest.mjs',
    'tools/map-environment-acquisition.selftest.mjs',
    'tools/world-residency-diagnostics.selftest.mjs',
    'src/world/sourcedTextureFailures.selftest.mjs',
    'src/world/shoreline.selftest.mjs',
    'src/world/liquidMarshSurface.selftest.mjs',
    'src/world/hardstandSurface.selftest.mjs',
    'src/world/hardstandBanks.selftest.mjs', // 2026-10-02: the apron bank law, every map, with its pending list
    // props lane A #19 (2026-10-15): the paved pads' render-only dressing (no step in the drive surface)
    'src/world/hardstandDressing.selftest.mjs',
    'src/world/landformGeology.selftest.mjs', // 2026-10-03: landform geology, and every smooth landform unchanged
    'src/world/landformPath.selftest.mjs', // 2026-10-08: a ridge's curved axis (Skybridge round 6's meander) and the carved union
    'src/world/maps/skybridgeArm.selftest.mjs', // 2026-10-08: Skybridge's reservoir arm generated as data, current
    'src/world/verdantTownPlan.selftest.mjs', // 2026-10-03: Verdant's classic town plan (every planned building on main's plot, the village walls)
    'src/world/townPlans.selftest.mjs', // 2026-10-03: recorded town plans and the carriageway post-pass (each settlement where PR #9's head seated it)
    'src/world/terrainMounds.selftest.mjs', // 2026-10-07: built mounds (Polders' molenbergen) level on their crests over the finished ground
    'src/world/canals.selftest.mjs', // 2026-10-07: canals (the shared linear water primitive; Polders' vaart and weteringen) at one level, and every map without one identical to the terrain before it
    'src/world/paddies.selftest.mjs', // 2026-10-12 (item 4): real paddies — level basins held by bunds, their water square-ended canals; Delta's ten level, wet bund to bund and paired about the char
    'src/world/roadCrownLift.selftest.mjs', // 2026-10-07: a styled road path's crown lift (Polders' lanes on the dyke crowns), and every map that lifts no path identical to the terrain before it
    'src/world/terrainSurfaceDetail.selftest.mjs',
    'src/world/terraceBenches.selftest.mjs', // 2026-10-07: Orchard's terrace zones cut after the near-field relief, the benches at their levels
    'src/world/terrainMaterialOwnership.selftest.mjs',
    'src/world/terrainProjection.selftest.mjs',
    'src/world/terrainSandCoverage.selftest.mjs',
    'src/world/terrainWornDirt.selftest.mjs',
    'src/world/villageWear.selftest.mjs',
    'src/world/shoreDirtMask.selftest.mjs',
    'src/world/workedGroundMask.selftest.mjs',
    'src/world/mangroveWaterPalette.selftest.mjs',
    'src/world/shallowWater.selftest.mjs',
    // 2026-10-17 (ground lane, MASTER #14/#15): level water held in its banks; Monsoon's channel at 0.5
    'src/world/waterBank.selftest.mjs',
    'src/world/waterRipples.selftest.mjs',
    'src/world/oceanFft.selftest.mjs',
    'src/world/roadMaskProfile.selftest.mjs',
    'src/world/roadDistanceField.selftest.mjs',
    'src/world/fieldTrenchTerrain.selftest.mjs',
    'src/world/frontlineAtmosphere.selftest.mjs',
    // 2026-10-22: the map's air — the per-map table, tier and time gates, seeded cards, the pinned frame
    'src/world/mapAmbience.selftest.mjs',
    // 2026-11-02 audit R6 (round 4 F2 review): a battle entry asks the map's air at once whatever the backoff a Studio
    // drag raised; a Studio light apply waits on its first ask only, never on or for a re-ask
    'src/world/mapAmbienceEntryAsk.selftest.mjs',
    'src/world/flyoverAircraft.selftest.mjs',
    'src/world/groundLitter.selftest.mjs',
    // round 73 (2026-09-25): the ground redux — the profile table and material contract, the pressure field, the tall-grass tier
    'src/world/groundRedux.selftest.mjs',
    // 2026-10-14 (the engine-cs lane; media wave f1 "concentric contour rings on snow"): the snow maps' drift and sastrugi
    // phases monotone along the wind over the whole square (no rings), the sunset terminator kept, the GLSL's law
    'src/world/snowDrifts.selftest.mjs',
    'src/world/terrainMaterialV2.selftest.mjs',
    'src/world/steepFaces.selftest.mjs', // ground lane (2026-10-15): sheer faces bedded on every map, steep normals over three spans
    'src/world/groundPressure.selftest.mjs',
    'src/world/trackMarks.selftest.mjs',
    'src/world/tallGrass.selftest.mjs',
    'src/world/swardPatch.selftest.mjs', // grass r2 (2026-10-15): the sward's patches, one field for the blades and the tufts
    'src/world/cinderYard.selftest.mjs', // ground lane (2026-10-08, wave 260): Cinder Junction's cinder yard and its weed clumps
    'src/world/swardTerrain.selftest.mjs', // ground lane (2026-10-08, wave 274): the field gate's band, the sward on its slopes, the thatch
    'src/world/landUse.selftest.mjs', // ground lane (2026-10-03): the field system and its CPU twin
    'src/world/saltwindSoil.selftest.mjs', // ground lane (2026-10-08, waves 286b/287): Saltwind's terra rossa, footing and garrigue
    'src/world/landUseBake.selftest.mjs', // ground lane (2026-10-03): the land use baked under the ground mask
    'src/world/paddyFloodLevel.selftest.mjs', // 2026-10-12: a flooded paddy holds water only on a level floor
    'src/world/roadLookupGrid.selftest.mjs',
    'src/world/roadAuthoredExits.selftest.mjs',
    'src/world/roadBankComposition.selftest.mjs',
    'src/world/roadBorderCorridor.selftest.mjs',
     'src/world/maps/roadBends.selftest.mjs',
    'src/world/maps/roadGradeSmoothing.selftest.mjs',
    'src/world/roadBuildingFrontage.selftest.mjs',
    'src/world/roadPhysicalStations.selftest.mjs',
    'src/world/roadSettlementJunction.selftest.mjs',
    'src/world/roadFencePath.selftest.mjs',
    'src/world/roadContinuity.selftest.mjs',
    'src/world/roadCutRecovery.selftest.mjs',
    'src/world/roadInheritedGrades.selftest.mjs',
    'src/world/roadPortalIndex.selftest.mjs',
    'src/world/roadStations.selftest.mjs',
    'src/world/roadPlacementAdmission.selftest.mjs',
    'src/world/terrainResources.selftest.mjs',
    'src/world/propsResources.selftest.mjs',
    'src/world/plasterSurfaceSharing.selftest.mjs',
    'src/world/plasterBaseMemo.selftest.mjs', // 2026-10-08: the render families paint one untoned base per build
    'src/world/nearMeshVertexMemo.selftest.mjs', // 2026-10-08: the near mesh's vertex heights asked once per props build
    'src/world/propsScheduling.selftest.mjs',
    'src/world/worldAssemblySteps.selftest.mjs', // battle-spikes-253: the world's assembly paced in steps, the seal per grass mesh
    'src/world/worldBuildLazyKits.selftest.mjs', // battle-spikes-253: a page's world build under lazy kits through the prefetch path
    'src/world/footprintPointIndex.selftest.mjs', // battle-spikes-253: the binned footprint query answers as the scan
    'src/game/worldMaterialsBeforeCompile.selftest.mjs', // battle-spikes-253: both entries patch the world before compiling it
    'src/game/simStepRetention.selftest.mjs', // battle-spikes-253: simStep stores no closure that keeps a battle's world
    'src/engine/gpuCatchUp.selftest.mjs', // battle-spikes-253: link polls ask only once the GPU caught up to their last poll
    'src/engine/nearVehicleShadowMerge.selftest.mjs', // battle-spikes-253: the near hulls' opaque detail cast through merged casters
    'src/engine/textureUploadStaging.selftest.mjs', // room-stalls-258: a scene's texture uploads one at a time under a frame budget before its draws
    'src/world/simulationProgramWarm.selftest.mjs', // battle-spikes-253: the GPU simulations' programs linked under the cover
    'src/world/propsMaterialGeometry.selftest.mjs',
    'src/world/crushableClutter.selftest.mjs',
    'src/world/smallPropsDestructible.selftest.mjs', // 2026-10-13: the village well, the square's monument and the rail yard's coal break under a hull and a round
    // (the maps lane, 228) the civic-area and pathway kit (world/civic): its plans and generality, every planned map's areas
    // (filled, seated, lit, stream-neutral against the map without its plan) and pathways (fronted, clear, continuous)
    'src/world/civic/civicPlans.selftest.mjs',
    'src/world/civic/civicFurniture.selftest.mjs',
    'src/world/civic/civicArea.selftest.mjs',
    'src/world/civic/roadLife.selftest.mjs', // (229) every map's road life: at its seats, out of the discs, no new pool, stream-neutral
    'src/world/civic/civicPathways.selftest.mjs',
    // the map-revival lane (round 2b, 2026-10-10; ported 2026-10-22, maps-stalled 240): Whiteout's drifts against its
    // buildings and windrows along its roads
    'src/world/maps/buildingSnowDrifts.selftest.mjs',
    'src/world/maps/wellKit.selftest.mjs', // 2026-10-13 the looks lane: each place's village well and square monument
    'src/world/propsTextureRows.selftest.mjs',
    'src/world/yardDressing.selftest.mjs',
    'src/world/rockDressing.selftest.mjs',
    'src/world/rockCollision.selftest.mjs', // 2026-10-07 the hitbox lane: a stone's colliders from its own mesh
    'src/world/crushedStones.selftest.mjs', // 2026-10-10 the hitbox lane, round 3: a crushed stone splits and presses into its ground
    'src/world/rockDriveOver.selftest.mjs', // 2026-10-08 the hitbox lane: a drive-over stone has no collider; shells meet its ground; (2026-10-10) a low one is a crushable small rock
    'src/world/rubbleCollision.selftest.mjs', // 2026-10-09 the hitbox lane, round 3: a rubble pile's records from its drawn chunks
    'src/world/fieldHutCover.selftest.mjs', // 2026-10-16 physics DST-03: a field hut stops rounds on its own slabs; canvas lets them through
    // the scenery lane (after wave 57): the telegraph poles' weathered timber
    'src/world/poleTimber.selftest.mjs',
    'src/world/scenery.selftest.mjs',
    'src/world/jebelSkin.selftest.mjs', // 2026-10-14 (maps lane, MA.12): a dome's jointed face — all round, normals out, proud, in budget, no mass
    'src/world/sceneryTierIdentity.selftest.mjs', // 2026-10-11 the hitbox lane: a phone builds the desktop's formation masses
    // the map-revival lane (Sirocco Wadi round 1, wave 235): the erg's seif draa and star dunes; the gour's caprock cliffs
    'src/world/duneForms.selftest.mjs',
    'src/world/gourSkin.selftest.mjs',
    // the scenery lane (2026-10-03): the dry-stone field walls' own rubble print
    'src/world/fieldStoneSurface.selftest.mjs',
    // the scenery lane (wave 20): the mud walls' worn render; the walls' feet, drifts and snow loads
    'src/world/fieldMudSurface.selftest.mjs',
    // the scenery lane (b14, wave 97): the mud walls' crown, render losses and stains in world space
    'src/world/mudWalls.selftest.mjs',
    // the scenery lane (b14, wave 97): the dry-stone modules irregular and coped, settled and lichened by world place
    'src/world/stoneWalls.selftest.mjs',
    // the scenery lane (b13, wave 87): the karst field walls laid as dry stone, their face print, the T cut back
    'src/world/fieldWalls.selftest.mjs',
    'src/world/fieldWallCollision.selftest.mjs', // 2026-10-15 physics PH.15: the field walls' crushable spans and their press
    'src/world/fieldWorkSeat.selftest.mjs', // 2026-10-20 maps 229: the breastworks' modules seated on their own ground, sheared to it
    // the scenery lane (b15, wave 106): the regions' field stacks and the straw props' hay print
    'src/world/haystacks.selftest.mjs',
    'src/world/maps/sceneryR2.selftest.mjs', // 2026-10-16 props lane A, the r2 sweep: the scenery and field-stack kinds to the bunker r2 standard
    'src/world/maps/periodClutter.selftest.mjs',
    'src/world/maps/recordClearance.selftest.mjs', // 2026-10-13 (the perf stream): the street kits' clearance from a grid, as the walk
    // the scenery lane (b16, wave 121): the ksar gate post in place of the steel checkpoint hut on Desert and Redrock
    'src/world/maps/regional/ksarGate.selftest.mjs',
    // the fortifications lane (2026-10-09, R259; wave 315): the field works' pillbox rebuilt, its bank an earthwork
    'src/world/maps/fortKit.selftest.mjs',
    'src/world/bunkerShells.selftest.mjs', // 2026-10-16 physics: rounds go in through a concrete pillbox's drawn embrasures and to its door's leaf
    // props census #10 (2026-10-14): the field works' period forms, draws, records and wrecks (maps/fieldworksKit.ts)
    'src/world/maps/fieldworksKit.selftest.mjs',
    'src/world/maps/lightWreck.selftest.mjs',
    'src/world/maps/regional/wadiRumPosts.selftest.mjs',
    // the map-content lane (L2, wave 358a): a polar station's field works in its own stock (drums, drift fence)
    'src/world/maps/regional/polarWorks.selftest.mjs',
    // (the 229 follow-up) Taurus-Littrow's dish arms seated in their bowls' shells, none proud of a bowl's face
    'src/world/maps/regional/littrow.selftest.mjs',
    // (the Earthrise 228 rebuild, 2026-10-18) a lunar station's works and clutter in its own stock (regolith bags, the tether)
    'src/world/maps/regional/lunarWorks.selftest.mjs',
    // props census #12 (2026-10-15): the stations as the Moon and Mars build them (maps/spaceKit.ts)
    'src/world/maps/spaceKit.selftest.mjs',
    'src/world/wireMaterial.selftest.mjs',
    'src/world/maps/fieldWallDressing.selftest.mjs',
    'src/world/steelAtlasDemand.selftest.mjs',
    'src/world/loggingYard.selftest.mjs',
    // props lane A #19 (2026-10-15): the field's fallen timber by species, from its members
    'src/world/maps/timberForms.selftest.mjs',
    'src/world/maps/craterEjecta.selftest.mjs',
    'src/world/maps/felledPoles.selftest.mjs',
    'src/world/foundryServiceCourt.selftest.mjs',
    // the map-revival lane (2026-10-09): no ISO box before 1966; the pre-container yards hold period freight
    'src/world/maps/periodFreight.selftest.mjs',
    // the looks lane (2026-10-15): the container rows as built — draws kept, parts in their boxes, period liveries
    'src/world/maps/containerRowKit.selftest.mjs',
    'src/world/autumnHeadlands.selftest.mjs',
    'src/world/loggingYardGrass.selftest.mjs',
    'src/world/grassChunkWork.selftest.mjs',
    'src/world/grassCarpetWork.selftest.mjs',
    'src/world/reservoirWaterworks.selftest.mjs',
    'src/world/deltaPlasterPalette.selftest.mjs',
    'src/world/liquidSurfaceDetail.selftest.mjs',
    'src/world/iceSurfaceDetail.selftest.mjs',
    'src/world/iceCracks.selftest.mjs',
    'src/world/vegetationLighting.selftest.mjs',
    'src/world/vegetationFarSeams.selftest.mjs',
    'src/world/vegetationProgramKey.selftest.mjs',
    'src/world/canopyNeedleTransmit.selftest.mjs', // GND (2026-10-15): a back-lit needle crown transmits its needles' dulled green, never a lime glow (Kestrel chase-s)
    'src/world/vegetationResources.selftest.mjs',
    'src/world/foliageOcclusionSweep.selftest.mjs',
    'src/world/foliageSeeThrough.selftest.mjs', // item 259: See-through foliage is off by default, and off clears no foliage
    'src/world/authoredTreePlacement.selftest.mjs',
    'src/world/tidalMangrove.selftest.mjs',
    'src/world/vegetationClearance.selftest.mjs',
    'src/world/nearTierShadowReach.selftest.mjs',
    'src/world/groundCoverClearance.selftest.mjs',
    'src/world/shrubClearance.selftest.mjs', // b12 (the scenery lane): no shrub stands inside a boulder or a structure
    'src/world/civilianVehicleGeometry.selftest.mjs',
    'src/world/maps/vehicleFarForm.selftest.mjs', // (229) the parked vehicles' far form: inside the body's box, tagged, a black livery dark far off
    'src/world/grassLighting.selftest.mjs',
    'src/world/grassAtlasPadding.selftest.mjs',
    'src/world/grassBladeShape.selftest.mjs',
    'src/world/autumnSeasonalPalette.selftest.mjs',
    'src/world/autumnLeafSprays.selftest.mjs',
    'src/world/birchCrownForm.selftest.mjs',
    'src/world/palmStemDirection.selftest.mjs',
    'src/world/bushOverlappingSprays.selftest.mjs',
    'src/world/shrubGrowthPlacement.selftest.mjs',
    // round 77 (2026-09-26): the vegetation round — the tree climate (wind, moss) and the understorey
    'src/world/treeClimate.selftest.mjs',
    'src/world/understorey.selftest.mjs',
    // round 77b (2026-09-26): the far-tier impostors baked from the near trees and the leaf-scale crown detail
    'src/world/treeImpostors.selftest.mjs',
    // trees Fix B (2026-10-15): the impostor bake keeps the near tier's crown coverage (the give-back before the bake's cut)
    'tools/impostor-bake-coverage.selftest.mjs',
    'src/world/leafDetail.selftest.mjs',
    // round 77c (2026-09-26): the horizon ring's forest drawn from the far tier's impostor atlas
    'src/world/horizonForestImpostors.selftest.mjs',
    // 2026-10-15 (ground lane, the coordinator's ruling): the ring's trees at each species' own stature where a map says so;
    // Verdant's owner-approved ring byte for byte
    'src/world/ringSpeciesStature.selftest.mjs',
    'src/world/outlandTreeAdoption.selftest.mjs', // GND (2026-10-14): the ring's and the Hinterland's trees near the square drawn by the battlefield's tiers
    // trees round 2 (2026-10-03): the ring forest's shapes keep their own streams (a taller ring moves trees, not shapes)
    'src/world/horizonForestShapes.selftest.mjs',
    // p2 trees lane (2026-10-01): the grown near trees, their branch-spray atlases and the build's routing
    'src/world/treeGrowth.selftest.mjs',
    'src/world/treeCrownShading.selftest.mjs',
    // the trees lane (2026-10-08, the gauntlet's wave 278): the Ca Mau coast's Rhizophora, grey mangrove and stemless nipa
    'src/world/mangroveForms.selftest.mjs',
    // the woods catch-up (item 41, 2026-10-22): Monsoon's Naga Hills forms, Wadi Rum's and the oasis's tortilis, Glacier
    // Pass's April snow, round 8's canopy form by place
    'src/world/woodsCatchup.selftest.mjs',
    // the trees lane (2026-10-08, the gauntlet's wave 278): Saltmere's shrubs the coast's gorse, swept inland by the wind
    'src/world/coastalScrub.selftest.mjs',
    // trees round 2b (2026-10-03): where trees stand: woodland edges and verges, Wadi Rum's groves, the palms' sites
    'src/world/treeSpacing.selftest.mjs',
    'src/world/hedgeTrees.selftest.mjs',
    // the trees lane (2026-10-07, wave 205): Polders' woods off its cropped ground, its willow rows along the field boundaries
    'src/world/polderTrees.selftest.mjs',
    // the trees lane (2026-10-06, wave 178): the landscape-woods hook (a map's woods on its ridges and slopes)
    'src/world/landscapeWoods.selftest.mjs',
    // the trees lane (2026-10-06, Skybridge round 4): a place's riparian slot by its water
    'src/world/riparianTrees.selftest.mjs',
    // the trees lane (2026-10-06, wave 177): Saltwind's olive groves, holm oak and Aleppo pine, maquis
    'src/world/saltwindTrees.selftest.mjs',
    'src/world/foliageAtlasPadding.selftest.mjs',
    'src/world/broadleafBranchlets.selftest.mjs',
    'src/world/structureSurface.selftest.mjs',
    'src/world/environmentSurfaceColor.selftest.mjs',
    'src/world/cropLighting.selftest.mjs',
    'src/world/cropBiomeIdentity.selftest.mjs',
    'src/world/maps/cropKit.selftest.mjs', // 2026-10-14 props lane A (#18b): the regional crops (maize, sunflower, beet, cauliflower) on the wheat's plot stream
    'src/world/horizonResources.selftest.mjs',
    'src/world/horizonRelief.selftest.mjs',
    // the mountains lane (2026-10-02): the eroded landform, the bed stair and the skyline cone measure
    'src/world/horizonMassif.selftest.mjs',
    'src/world/horizonPanorama.selftest.mjs',
    // the mountains lane (2026-10-05): the far earth's deck greying is the dome's (sky.ts keeps it inline, so the copy is held here)
    'src/world/horizonPanoramaDeck.selftest.mjs',
    // the mountains lane (2026-10-05): and its cloud composite the cloud dome's (volumetricClouds.ts keeps it inline too)
    'src/world/horizonPanoramaClouds.selftest.mjs',
    // the nightsky lane (2026-10-08): the far country re-baked under a battle's sunset and night (the owner: "the far skybox
    // is still like glowing") — the bake's own light and haze statements per map, against the sky above and the near ground
    'src/world/horizonPanoramaRelight.selftest.mjs',
    'src/world/horizonCliffNormals.selftest.mjs', // the mountains lane (2026-10-04): the ring's cliffs take their geometry's normals
    'src/world/horizonCloudShade.selftest.mjs',
    'src/world/horizonRockfield.selftest.mjs',
  'src/world/horizonAutumnGround.selftest.mjs',
    'src/world/edgeWater.selftest.mjs',
  'src/world/autumnHorizonSeam.selftest.mjs',
    'src/world/horizonSeamSampler.selftest.mjs', // the time-to-battle lane (2026-10-08): the seam byte for byte with half the samples
    'src/world/horizonRingWorker.selftest.mjs', // the time-to-battle lane (2026-10-08): the ring's pipeline in a worker, worker against inline on every map
    'src/world/horizonMesaTexture.selftest.mjs',
    'src/world/horizonNoiseSampling.selftest.mjs',
    'src/world/horizonMesaSurface.selftest.mjs',
    'src/world/titanGorgeHorizon.selftest.mjs',
    'src/world/copperQuarrySurface.selftest.mjs',
    'src/world/playableRelief.selftest.mjs',
    'src/world/landformSupportBounds.selftest.mjs', // the perf stream (2026-10-13): a height sample skips landforms outside their support
    'src/world/assaultTrenchTerrain.selftest.mjs',
    'src/world/badlandsRelief.selftest.mjs',
    'src/world/redrockMaterial.selftest.mjs',
    'src/world/redrockCanyonHorizon.selftest.mjs',
    'src/world/terrainWallNormals.selftest.mjs',
    'src/world/wallSkyLight.selftest.mjs',
    'src/world/mapRoadCoverage.selftest.mjs',
    'src/world/maps/environmentExpansion.selftest.mjs',
    'src/world/maps/authoredChannels.selftest.mjs',
    'src/world/maps/riverLandings.selftest.mjs',
    'src/world/maps/riverReedContact.selftest.mjs',
    'src/world/maps/beachedBoat.selftest.mjs',
    'src/world/maps/boatHulls.selftest.mjs',
    'src/world/maps/cartKit.selftest.mjs',
    // b45 (visual/scenery-b45): the ammunition crates as painted wooden crates, stacked with contact; a phone keeps the
    // legacy boxes
    'src/world/maps/ammoCrates.selftest.mjs',
    'src/world/maps/rollingStock.selftest.mjs',
    'src/world/maps/vehicleSetPieces.selftest.mjs',
    // the map-content lane's R6 (wave 358a): the works vehicles on their own gear, their prints and ground contact
    'src/world/maps/setPieceSeat.selftest.mjs',
    'src/world/maps/strandWrack.selftest.mjs',
    'src/world/maps/shoreJetty.selftest.mjs',
    // #16 r2 (Lane C, 2026-10-14): the waterside family in its members (jetty forms, gangway, driftwood, buoys, fords, reeds)
    'src/world/maps/waterside.selftest.mjs',
    'src/world/maps/mooredHullMotion.selftest.mjs',
    'src/world/maps/railWashout.selftest.mjs',
    'src/world/maps/railCoalStockpiles.selftest.mjs',
    'src/world/railBallast.selftest.mjs', // ground lane (2026-10-08, waves 234/278/285): the rail kit's ballast bed
    'src/world/maps/archedBridgeCollision.selftest.mjs',
    'src/world/railSpurs.selftest.mjs',
    'src/world/railSpurBerth.selftest.mjs',
    'src/world/railCutting.selftest.mjs',
    // 2026-11-02 audit M9: the height field's build modes are scoped (a throwing read keeps the live field's cuttings)
    'src/world/terrainBuildModes.selftest.mjs',
    // the map-revival lane (Skybridge round 4): Lake Powell's arm and Glen Canyon Dam in the battlefield
    'src/world/maps/reservoirDam.selftest.mjs',
    // the map-borders lane (gauntlet wave 30): the land past the edge is the terrain seed's, never the map id's
    'src/world/borderLandform.selftest.mjs',
    // ... and its villages string along the exit roads from 110 m, each with its church (Frosthollow's north)
    'src/world/borderFarmsteads.selftest.mjs',
    // the horizons stream (2026-10-13, HL-0): the Hinterland's spec, its 26 regions and its field (dark: no map has a block)
    'src/world/hinterland/hinterlandField.selftest.mjs',
    // ... (HL-1) its pipeline: the outland plan on the Polders draft, roads run on, yards level, waters as coasts, the bake
    'src/world/hinterland/hinterlandPlan.selftest.mjs',
    // ... (HL-2) its landform primitives and far sectors: the stair, the tables, the sheer jebel, the massif's summits, snow and belts
    'src/world/hinterland/hinterlandLandforms.selftest.mjs',
    // ... (HL-3) its mesh: the depth compression and curvature, the CDLOD selection, the worker's answer and the hook
    'src/world/hinterland/hinterlandMesh.selftest.mjs',
    'src/world/hinterland/hinterlandLifetime.selftest.mjs', // 2026-11-02 audit R1: the world owns its Hinterland; ring fallback; one root
    'src/world/maps/snowDrift.selftest.mjs',
    'src/world/maps/winterLakeGeometry.selftest.mjs',
    'src/world/propsModelStore.selftest.mjs',
    'src/world/structureKit.selftest.mjs',
    // the maps-restyle lane (2026-10-22, from the destructible-kits lane 2026-10-11): the roadside light buildings and
    // random hulks in 180-degree twins on a map that declares its rotation centre (the fairness ask)
    'src/world/roadsideTwins.selftest.mjs',
    'src/world/maps/marsSettlement.selftest.mjs',
    // (the Earthrise 228 rebuild, 2026-10-18) Taurus-Littrow Station's plan, set pieces and stock (maps/earthriseStation.ts)
    'src/world/maps/earthriseStation.selftest.mjs',
    'src/world/orchardBathhouse.selftest.mjs',
    // regional-buildings lane (2026-10-03): the regional architecture kits and their placement-preserving swap
    'src/world/maps/regional/regionalArchitecture.selftest.mjs',
    // 2026-10-15 (the perf lane): the kit registries — one row per style and set piece, every kit in Node, a map's own in the browser
    'src/world/kitRegistry.selftest.mjs',
    // the buildings stream (2026-10-12; the owner: "make sure our roofs dont have empty spots in them"): every kit
    // builder, catalog builder and set piece closed and seated — no floating part, open underside, hole, inside seen
    // through a gap, sky through the building or inside-out face — held to its ledger row
    'tools/building-integrity-check.selftest.mjs',
    'src/world/maps/regional/facade.selftest.mjs', // 2026-10-05: the facade craft adds dressing only, on desktop, from its own streams
    'src/world/maps/mapBuildScopes.selftest.mjs', // 2026-11-02 audit R1: kit build slots in one registry, asserted at yields; no cross-build latches
    'src/world/maps/regional/phoneIdentity.selftest.mjs', // 2026-10-08: a phone's kit builds draw the desktop's streams and solids (DESTRUCTION.md §8.4)
    'src/world/maps/regional/skyline.selftest.mjs', // 2026-10-05: the tall- and big-building kit, every builder and damage state sound
    'src/world/maps/northStation.selftest.mjs', // 2026-10-07: Suzhou's North Station a terminus on its own ground (mullions, pointed shed, forecourt, tracks)
    'src/world/maps/regional/yards.selftest.mjs', // 2026-10-03: the yards round a kit's houses, clear of roads, plots, objectives and pads
    'src/world/maps/regional/fineDetailLod.selftest.mjs', // 2026-10-03: a kit's fine joinery drawn near the camera only
    'src/world/maps/regional/fineSides.selftest.mjs', // 2026-10-26 (259): a part's sides fine joinery only within its wall's contact
    'src/world/groundMarkings.selftest.mjs', // 2026-10-15 (maps lane, Kestrel): paint on the paved ground — Kestrel's apron markings
    'src/world/maps/regional/choufEarthRoof.selftest.mjs', // 2026-10-07: the Chouf's earth roofs in clay inside stone parapets, every other kit's build unchanged by the parapet hook
    'src/world/maps/regional/houseDamage.selftest.mjs', // 2026-10-07: the house kits' damage through the destruction seam (DESTRUCTION.md §16)
    'src/world/maps/regional/shellDamage.selftest.mjs', // 2026-10-08: houseless buildings read off their parts, dressed by their kit (§16)
    'src/world/maps/regional/latticeDamage.selftest.mjs', // 2026-10-14 props census #3: open frames recorded, read as lattices, folded over in their members
    'src/world/maps/regional/ruinGrammar.selftest.mjs', // 2026-10-14 props census #7: kit ruins on the ruin grammar, walls recorded, no dark plates; the rubble pile keeps the street's draws
    'src/world/maps/regional/towerDamage.selftest.mjs', // 2026-10-15 props census #9 (E13): every placed tower kind records its bodies, read in storey bands through the multi-body route
    // the landmarks lane (2026-10-05): the set-piece library — budgets, collision, open gates, drivable bridges, the pass
    'src/world/landmarks/landmarks.selftest.mjs',
    'src/world/mangroveFisheryWharf.selftest.mjs',
    'src/world/structureConnectivity.selftest.mjs',
    // the buildings and landmarks lane (2026-10-10, the owner's relay mast): exact member contact in every assembled kit
    'src/world/kitConnectivity.selftest.mjs',
    'src/world/maps/planFallbacks.selftest.mjs', // 2026-10-14 props census #4: no map places the plan's warehouse/depot/shed but the allowlisted three (until 225's kits)
    'src/world/buildingDetail.selftest.mjs', // 2026-10-14 BLD-04/HB-1b: the building-detail census's ratchet (tools/building-detail-census.mjs)
    'src/world/structureCollision.selftest.mjs',
    // (the 225 gate, 2026-10-15) a world build never depends on the maps built before it in the process
    'tools/worldBuildIndependence.selftest.mjs',
    'src/world/structureShellPool.selftest.mjs', // 2026-10-13 (the perf stream, Plan W): pooled structure shells equal the inline build
    'src/world/propsShellPoolCancel.selftest.mjs', // 2026-11-02 audit R1: a cancelled props build stops its shell pool's workers
    'src/world/brokenVehiclePool.selftest.mjs', // perf-248: pooled broken vehicle bodies equal the inline build
    'src/world/structureCollisionVertexCache.selftest.mjs',
    'src/world/structureCollisionReuse.selftest.mjs',
    'src/world/structureCollisionMergeKeys.selftest.mjs',
    'src/world/structureCollisionRaster.selftest.mjs',
    'src/world/structureInstanceAppearance.selftest.mjs',
    'src/world/exteriorDetailKit.selftest.mjs',
    'src/world/destructibleRenderPolicy.selftest.mjs',
    'src/world/destructibles.selftest.mjs',
    // 2026-11-02 audit R2: a map's trench variant registers and queues its measures as its own world (build key)
    'src/world/destructibleWorldKey.selftest.mjs',
    // 2026-11-02 audit R2: what a cached world carried into the next battle (Studio sweeps, the toss stream, water, sward)
    'src/world/battleResetLeftovers.selftest.mjs',
    'src/world/maps/setPieceDestructibles.selftest.mjs',
    'src/world/destructibleAuthority.selftest.mjs',
    // 2026-11-02 audit M9: one crush transition for a destructible's records in the page and headless worlds, the guards
    'src/world/crushRecords.selftest.mjs',
    'src/world/utilityNetwork.selftest.mjs',
    'src/world/maps/utilityPoles.selftest.mjs', // 2026-10-14 props lane A (#21): each region's line (its pole, its timber, its conductors on its insulators)
    'src/world/wrecks.selftest.mjs',
    // 2026-10-09 (destruction core lane): the light dressing's broken states made from their own intact builds.
    'src/world/maps/propFracture.selftest.mjs',
    'src/world/maps/gateKit.selftest.mjs', // 2026-10-13 the looks lane: every fence family's own gate, region by region
    'src/world/maps/fenceKit.selftest.mjs', // 2026-10-15 props lane A #6: the timber fences in their region's build, legacy collision
    'src/world/maps/coursedWallKit.selftest.mjs', // 2026-10-16 props lane A #6: the brick-print field walls by region, legacy collision and fit
    'src/world/maps/adobeWallKit.selftest.mjs', // 2026-10-16 props lane A #6: the mud field walls by region on the legacy section, legacy collision and fit
    'src/world/maps/kitBuildLatch.selftest.mjs', // 2026-11-02 audit R2: the wall and fence kits' bands and fit throw when read before their build
    'src/world/maps/terraceRisers.selftest.mjs', // 2026-10-16 props lane A #6: the village terraces' risers built along their contours
    'tools/r2-standard.selftest.mjs', // 2026-10-14 props lane A (E14): the bunker r2 standard's receipt and its painted-opening detector
    'tools/cost-census.selftest.mjs', // 2026-10-14 props lane A (#2): the landing protocol's cost census (draws, triangles, programs, pools; base against branch)
    'src/world/maps/clutterKit.selftest.mjs', // 2026-10-14 props lane A (#2): every map's clutter forms (draws spent, caps, the shadow rule, r2Standard, +45k a map)
    'src/world/landmarks/landmarkDamage.selftest.mjs', // 2026-10-14 props lane A (E12): set pieces' named pieces, ruptures, open frames, light set pieces' fall
    'src/world/wreckCollision.selftest.mjs',
    'src/world/wreckRoster.selftest.mjs',
    'src/world/wreckFleet.selftest.mjs',
    // 2026-10-09 (destruction core lane): crumpled wrecks — the baked hulks, the burnt map vehicles, the live kill.
    'src/world/wreckCrumple.selftest.mjs',
    // (dcore 2026-10-10) a prop gives where a hull meets it: pressed from contact, pancaked, never rising, the same twice;
    // the presentation's copy keeps its livery, the sim's crush swaps nothing, unseen crushes sweep, heaps flatten again.
    'src/world/propCrush.selftest.mjs',
    'src/world/wrecksSteps.selftest.mjs',
    // 2026-10-16 (tank-opt RING; the owner: "when the turret blows off we should see that"): the ring a kill leaves — the
    // measure, the anatomy's ring on it, the live plate's lifecycle (fingerprint byte-identical), the hulk's well
    'src/vehicles/turretRingWell.selftest.mjs',
    // 2026-10-23 (wreck-cracks 243): the dented live cut keeps the hull watertight (a split face's corners on an edge are
    // its neighbour's too: the synthetic pair in one mesh and in two, the vt4a1's wreck at seed 77)
    'src/vehicles/turretRingWatertight.selftest.mjs',
    // 2026-10-22 (crew-fit 235): every crew station a seated P50 body inside the shell at every turret yaw
    'src/vehicles/crewSeats.selftest.mjs',
    // 2026-10-30 (crew-side 266): +X is the vehicle's left; every side-named station on its side, no ring crossings, no
    // crew or module hit shape inside another module (default tier: the fleet's finalized anatomy, no builds)
    'src/vehicles/internalPlacement.selftest.mjs',
    'src/world/wreckPaintDedup.selftest.mjs',
    'src/world/wreckDiscardedPaint.selftest.mjs',
    'src/world/wreckBakeWire.selftest.mjs',
    'src/world/wreckBakeClient.selftest.mjs',
    'src/world/wreckBakePrefetch.selftest.mjs',
    'src/world/surfacePaintPrefetch.selftest.mjs',
    'src/world/wreckBakeWorker.selftest.mjs',
    'src/world/wreckWorkerFallback.selftest.mjs', // 2026-10-09: a failed or silent wreck worker never fails the props build
    'src/world/exactWreckGeometry.selftest.mjs',
    'src/world/topple.selftest.mjs',
    // 2026-11-02 audit M9: a felled tree, its trunk record and its canopy fall and stand together (felledTrees.ts)
    'src/world/felledTrees.selftest.mjs',
    // 2026-11-02 audit U28 (round 2): the world's crush owns a felled tree's records and canopy; the Studio declares the falls' driver
    'src/world/felledTreeOwners.selftest.mjs',
    // 2026-11-02 audit M9: a felled tree's canopy found in constant time; a whole destroyed set restores linearly (concealerIndex.ts)
    'src/world/concealerIndex.selftest.mjs',
    'src/world/loosePropPhysics.selftest.mjs',
    'src/world/loosePropBodies.selftest.mjs', // 2026-10-12: the kicked clutter on the one physics engine
    'src/world/collision.selftest.mjs',
    'src/world/colliderRayMarch.selftest.mjs',
    'src/world/battleScaleExactness.selftest.mjs', // perf-249: the battle step's cheaper reads answer as before, to the bit
    'src/world/propPlacement.selftest.mjs',
    'src/world/wallSpanPlacement.selftest.mjs',
    'src/world/civilianVehicles.selftest.mjs',
    'src/world/mapVehicleGaps.selftest.mjs',
    'src/world/parkedVehicleSeparation.selftest.mjs',
    'src/ui/contextInfo.selftest.mjs',
    'src/ui/endOverlayRuntime.selftest.mjs',
    'src/ui/endScreen.selftest.mjs',
    'src/ui/battleBeats.selftest.mjs',
    // (watch-mode-243) a watched battle's HUD frame and its neutral report: the sides by name, the ridden tank highlighted
    'src/ui/watchBattleReport.selftest.mjs',
    'src/game/battleEventStats.selftest.mjs',
    'src/ui/killPresentation.selftest.mjs',
    'src/ui/shotInfo.selftest.mjs',
    // 2026-10-31: every damage figure and total is the hull points the hit took off (owner: "the amount u took off the
    // enemy"), stamped where the hit resolves and carried over the wire
    'src/sim/hullPointsRemoved.selftest.mjs',
    'src/ui/shotReadoutPolicy.selftest.mjs',
    'src/ui/damageNumberBurst.selftest.mjs',
    'src/ui/finalBlow.selftest.mjs',
    'src/ui/battleHudAccess.selftest.mjs',
    'src/ui/minimapAssetRuntime.selftest.mjs',
    'src/ui/touchControlsAccess.selftest.mjs',
    'src/ui/settingsAccess.selftest.mjs',
    'src/ui/battleInputOwner.selftest.mjs', // 2026-11-02 audit F4: one battle input owner (presentation > menu > veil > play)
    // 2026-11-02 audit IR15 (round 2): the kill-cam replay's own flag is the one screen fact the input owner reads
    'src/game/killcamScreen.selftest.mjs',
    // 2026-11-02 audit A9 (round 3): a replay that throws while built, in onDone or in a restore still clears its flag,
    // emits killcam:done (the input owner's edge) and lifts its fade; the real controller and the real input owner
    'src/game/killcamReplayLifecycle.selftest.mjs',
    'src/ui/battleReportGate.selftest.mjs', // 2026-11-02 audit F4: the report gate holds for every presentation, decides again
    'src/ui/battleReportGateHud.selftest.mjs', // 2026-11-02 audit F4: shotInfo's report gate through the real HUD (replay, stale decision)
    'src/ui/hudMagazine.selftest.mjs',
    // 2026-10-17 (owner): out of ammo, every reload indicator shows its empty state; unlimited rounds never run dry
    'src/ui/hudAmmoOut.selftest.mjs',
    // ...and the live HUD paints those states (reticle, rack, tray, struck controls) over a recording canvas
    'src/ui/hudAmmoOutPaint.selftest.mjs',
    // ...and the rendered capture reads its saved frames' tray marks, never clipping a shot (critic r4b)
    'tools/hud-ammo-frame-ink.selftest.mjs',
    'src/ui/hudAmmunitionPresentation.selftest.mjs',
    'src/ui/hudConsumablePresentation.selftest.mjs',
    'src/ui/hudConsumableTray.selftest.mjs', // 2026-11-02 audit M4: a revive refills the tray (the state, or the own respawn)
    'src/ui/roofGunTile.selftest.mjs', // 2026-11-05 round 2 U9: the roof-gun tile marks a switched-on red gun silenced, takes the switch off, refuses only on
    'src/ui/hudLifecycle.selftest.mjs', // 2026-11-02 audit F8: one HUD lifecycle; hidden cleanup; one display owner
    // brand-ui 242 (the direction's battle HUD): the team strip under the score and the kill ribbon
    'src/ui/hudTeamPips.selftest.mjs',
    // (UI-LOCKDOWN A) the one canvas primitive's rule (sizing, hidden release, no compounding, a DPR flip) and the census
    // that fails on any on-screen canvas built outside it
    'src/ui/uiCanvas.selftest.mjs',
    'src/ui/uiCanvasCensus.selftest.mjs',
    // a canvas's words and figures as DOM runs over it (the sight's readouts, the glyphs' letters)
    'src/ui/canvasText.selftest.mjs',
    'src/ui/hudKillRibbon.selftest.mjs',
    // 2026-10-25 (owner): the battle's notices on the kit's notice grammar, no stripe or one-sided coloured border
    'src/ui/hudNotices.selftest.mjs',
    // 2026-10-14 (owner): a jump mode puts the jump farthest left in the vehicle-controls row, for every loadout
    'src/ui/vehicleControlOrder.selftest.mjs',
    'src/ui/battleHudLayout.selftest.mjs',
    // (local-fps-266) the HUD layout's queries skip the Garage, the icon sprite and the play screen, the document's order kept
    'src/ui/hudQueryScope.selftest.mjs',
    // the security audit's receipt (item/security-audit-240)
    'src/ui/htmlEscape.selftest.mjs',
    // 2026-10-16 (desk notices): the mouse centre notices clear the reticle, the instruments and the lanes on every census size.
    'src/ui/mouseNoticePlan.selftest.mjs',
    // r10e: a touch layout's centre notices keep off the reticle's footprint and the HUD's panels
    'src/ui/touchNoticePlan.selftest.mjs',
    // battle-camera-264: the risen battle sight (the chase framing's lens shift): its datum, the notices, the countdown and
    // a portrait phone's systems row follow it; the scope stays centred
    'src/ui/battleSight.selftest.mjs',
    'src/ui/loadingScreens.selftest.mjs',
    'src/ui/mapBackdrop.selftest.mjs',
    'src/ui/fonts.selftest.mjs',
    // 2026-10-17: Chakra Petch + IBM Plex replace Monument; pinned OFL files, one marker per document,
    // real weights only, the 11 px floor, tabular figures only through .num, metric-matched fallbacks, zh-CN resets
    'src/ui/typeSystem.selftest.mjs',
    // 264: each Chakra Petch fallback (a capitals rule and a rule for the rest) sets a caps title within 1 % of the face
    'src/ui/typeFallbackMetrics.selftest.mjs',
    'src/ui/bootScreen.selftest.mjs',
    'src/ui/battleLoadProgress.selftest.mjs',
    'src/ui/mapLqip.selftest.mjs',
    'src/ui/chunkRecovery.selftest.mjs',
    'src/entry/telemetry.selftest.mjs',
    'src/entry/inlineWatchdogSink.selftest.mjs',
    'src/ui/icons.selftest.mjs',
    // 2026-10-18 (brand-ui BUI-F4): the one icon sprite: drawing rules, one stroke per optical size, the 10 KB sprite
    // and 3 KB boot-slice budgets, the generated index in sync, the icon() host markup, no retired product marks
    'src/ui/icons/icon.selftest.mjs',
    'src/ui/flags.selftest.mjs',
    'src/ui/garageLocaleNavigation.selftest.mjs',
    'src/ui/garageVariantPicker.selftest.mjs',
    'src/ui/garageBattleQuick.selftest.mjs',
    'src/ui/garageOrder.selftest.mjs',
    'src/ui/garageFacetFilter.selftest.mjs',
    'src/ui/garageAuxiliarySummary.selftest.mjs',
    'src/vehicles/auxiliaryRoofGuns.selftest.mjs',
    // 2026-10-16 (the perf lane): the roof-gun table's compact form
    'src/vehicles/auxiliaryRoofGunsCodec.selftest.mjs',
    'src/ui/randomPreviews.selftest.mjs',
    'src/ui/touchControls.selftest.mjs',
    'src/ui/touchClimbRelease.selftest.mjs', // 2026-11-02 audit F8: leaving the battle releases a held climb
    'src/ui/mobileLayout.selftest.mjs',
    'src/ui/minimapOrientation.selftest.mjs',
    'src/ui/minimapObjectives.selftest.mjs',
    // 2026-10-25 (UI-LOCKDOWN B and C, owner: "prevent things like that silly double ping indicator from happening
    // again"): one row a datum, placed only by its owner, its glyph through the registry
    'src/ui/surfaceRegistry.selftest.mjs',
    // 2026-10-26 (owner, the battle load: "there are still black bars above and below the images here!!! fix that!!! no more
    // object containns"): contain only on registered transparent cutouts, every cover rule's focal point declared (a
    // shrinking baseline), and the letterbox-band judge the browser check runs on the load, end and media pages
    'tools/image-fit-lint.selftest.mjs',
    'tools/letterbox-bands.selftest.mjs',
    // 2026-10-26 (INTERACTION-REDESIGN part D, owner: "i really mean update all legacy interaction surfaces and systems"):
    // every choose-one registered against the kit picker, failing sites only in a shrinking baseline, common-path presses
    // that only fall; the keyboard and touch judge the gauntlet and click-timeline captures run
    'src/ui/interactionRegistry.selftest.mjs',
    'tools/interaction-access.selftest.mjs',
    // 2026-10-14 (owner, Kestrel: "water spots by spawn even though you can't actually see any water"): the tactical
    // map paints water only where the world draws it — all 33 maps, Kestrel's pads, the liquid maps' wet discs
    'src/ui/minimapLiquidWater.selftest.mjs',
    // 2026-10-15 (the Kestrel water plan's phase 2): the tactical map's water is the water a player can see — every 2 m
    // cell of the twelve liquid maps against the water sheet's real geometry and the CPU mask, plus the level paddies
    'src/world/visibleWater.selftest.mjs',
    'src/ui/minimapContacts.selftest.mjs',
    'src/ui/minimapCapturePolicy.selftest.mjs',
    'src/vehicles/trackPatterns.selftest.mjs',
    'tools/track-geometry.selftest.mjs',
    'tools/marketing-shots/battle-campaign.selftest.mjs',
    'tools/marketing-shots/showcase-r2.selftest.mjs',
    // 2026-10-17 tank hero cards: the showroom camera with the whole tank facing left, the turret turned modestly
    // toward the lens (owner 2026-10-20, policy v5), one flag mask and one placement rule for the compositor and the Garage CSS, the
    // whole tank inside every card, the obverse flag, band-fit tricolours
    'tools/hero-cards.selftest.mjs',
    // 2026-10-18 tank hero cards: every fleet vehicle has its shipped card (its nation's flag, hull and gun left
    // by projection, no clip, files matching the manifest, byte budgets); stale rows are reported for the
    // changed-only re-render
    'tools/hero-cards-check.mjs',
    // the multiplayer dual view: the published WebP is the one its manifest names, from one match
    'tools/marketing-shots/capture-multiplayer-dual-screen.selftest.mjs',
    // 2026-10-12 (home r2): the live-battle capture director's clock, freezes, bursts and staging helpers
    'tools/marketing-shots/mode-battle-director.selftest.mjs',
  ]),
  post: Object.freeze([
    'src/audio/lazyAudio.selftest.mjs',
    // 2026-11-02 audit X8 (round 3): the audio mixer's chunk is asked again under the lazy-chunk policy, never per press
    // (thirty presses after a failed transfer ask nothing inside the backoff, none offline)
    'src/audio/lazyAudioMixerChunk.selftest.mjs',
    // 2026-11-02 audit F11: the audio device's lifecycle (an interruption re-arms the gesture unlock, visibility retries,
    // 'interrupted' resumes like 'suspended')
    'src/audio/audioDevice.selftest.mjs',
    // 2026-11-02 audit F11: one device across the facade and a mixer built before any gesture; a rebound mixer listens once
    'src/audio/audioHandoff.selftest.mjs',
    'src/vehicles/profiles/centurionFamily.selftest.mjs',
    'src/vehicles/profiles/centurionGunClearance.selftest.mjs',
    'src/vehicles/profiles/pt91mPendekarFidelity.selftest.mjs',
    'src/vehicles/profiles/leclercRoofRig.selftest.mjs',
    'src/vehicles/profiles/leclercGunHousingRig.selftest.mjs',
    'src/vehicles/profiles/carro45tRoof.selftest.mjs',
    // release 262: the M46, M47 and M48A5 rebuilt as measured castings (profiles/pattonCast.ts) replace the old
    // Patton continuity, low-turret and M48 roof-seating receipts
    'src/vehicles/profiles/pattonCastProportions.selftest.mjs',
    'src/vehicles/profiles/pattonGunClearance.selftest.mjs',
    'src/vehicles/profiles/m60a2Starship.selftest.mjs',
    'src/vehicles/profiles/sheridan.selftest.mjs',
    'src/vehicles/profiles/sheridanTtsAttachmentSeats.selftest.mjs',
    'src/vehicles/profiles/kv2Dimensions.selftest.mjs',
    'src/vehicles/profiles/kv2GunClearance.selftest.mjs',
    'src/vehicles/profiles/leopardHullClosure.selftest.mjs',
    'src/vehicles/tankFactoryCore.selftest.mjs',
    'src/vehicles/tankFactoryStaging.selftest.mjs',
    'src/vehicles/tankFactoryDeferredAssembly.selftest.mjs',
    'src/vehicles/plateDistanceScratch.selftest.mjs',
    'src/vehicles/profileBuilderAdapter.selftest.mjs',
    'src/vehicles/ridingPartsWire.selftest.mjs',
    'src/vehicles/decorPlanWire.selftest.mjs',
    // 2026-11-02 audit R6: one worker-client pattern (a deadline from dispatch, messageerror, a fresh worker after a failure)
    'src/vehicles/workerClients.selftest.mjs',
    'src/vehicles/fleetSpecRegistry.selftest.mjs',
    'src/vehicles/leopardRevolutionRegistry.selftest.mjs',
    'src/ui/spectatorSwitcher.selftest.mjs',
    'tools/marketing-shots/feature-evidence.selftest.mjs',
    'tools/marketing-shots/site50-media.selftest.mjs',
    // 2026-10-15: the versus stills, the social cards' and marketing's foundations (public/media/versus-r1)
    'tools/marketing-shots/versus-media.selftest.mjs',
    'src/ui/studioSiteTakes.selftest.mjs',
    // 2026-10-12: every tank's own take (src/ui/fleetTakes.ts) in the Gallery, the manual, the Garage and the Director
    'src/ui/fleetTakes.selftest.mjs',
    'src/gallery/inAction.selftest.mjs',
    'src/docs/referenceTakes.selftest.mjs',
    'src/ui/garageFleetTake.selftest.mjs',
    // 2026-10-23: the Garage's numbered hotspots (the Premiere direction's 05-garage page)
    'src/ui/garageHotspots.selftest.mjs',
  'src/game/battleLoadEstimate.selftest.mjs',
  'src/game/favouriteTanks.selftest.mjs',
    'tools/marketing-shots/landing-media.selftest.mjs',
    // 2026-10-19: the media library (public/media/library-r3 since 10-21: the finished pictures of the current rounds), by pack range and sheet
    'tools/marketing-shots/media-library.selftest.mjs',
    // home r2 (2026-10-12): the home page's feature, mechanic and mode slots, their picks and the modes' registry order
    'tools/marketing-shots/home-shots.selftest.mjs',
    'src/docs/battleReels.selftest.mjs',
    'src/vehicles/profiles/type59Overhaul.selftest.mjs',
    'tools/source-dimension-frame.browser.selftest.mjs',
    'tools/resolved-depth-copy.browser.selftest.mjs',
    'tools/cloud-history.browser.selftest.mjs',
    'tools/late-fx-matrix.browser.selftest.mjs',
    'tools/vehicle-ground-occlusion.browser.selftest.mjs',
    'tools/articulated-shadow-batch.browser.selftest.mjs',
    'tools/battle-geometry-sharing.browser.selftest.mjs',
    'tools/track-texture-source.browser.selftest.mjs',
    'tools/sourced-building-source.browser.selftest.mjs',
    'tools/horizon-panorama-bake.browser.selftest.mjs',
    // 2026-10-19 (black-screen-228): a real battle fails on a black world at its start and after Esc and Resume, and the
    // guard heals the owner's signature (a camera without layer 0) within half a second
    'tools/black-world.browser.selftest.mjs',
    // 2026-10-30 (garage-roster-thrash-265): every nation's roster strip settles at the desktop windows and stepped widths
    'tools/garage-roster-settle.browser.selftest.mjs',
    // 2026-10-30 (hud-self-measure-266): the battle HUD's touch status strip, hull bars and an idle page measure nothing
    // they set
    'tools/hud-self-measure.browser.selftest.mjs',
    // 268 (the 267 production smoke): the multiplayer end-to-end opens the rooms panel the way the Garage's layout offers
    // it, at the tool's 1024x640 and a desktop's 1440x900
    'tools/mp-rooms-entry.browser.selftest.mjs',
    // local-fps-266: a regional window's stack (dark, pane, frame) draws the same at 20-700 m in any draw order
    'tools/pane-stack-layer.browser.selftest.mjs',
    // fx-first-use-261: a battle's first broken building (a scripted strike after the reveal) links no FX program
    'tools/destruction-first-use.browser.selftest.mjs',
    // 269 (the 268 drive smoke's second battle at 97%): a second solo battle in one page, started while the Leave's Garage
    // restore runs under a loaded GPU, reveals on its first frame
    'tools/second-solo-battle.browser.selftest.mjs',
    // the drawn-geometry shape's control and garages (the maps ride on collisionManifestDrift, the tanks on fleetPassHigh)
    'src/world/maps/drawnGeometryShape.selftest.mjs',
    'tools/props-build-profile.selftest.mjs',
    'tools/wreck-build-profile.selftest.mjs',
    'tools/wreck-paint-bench.selftest.mjs',
    // FSP-01: real Garage, warm switches gated on main-thread blocking and
    // first painted frame; cold switches reported only.
    'tools/garage-switch-probe.selftest.mjs',
    // destruction-slabs 227 (2026-10-17, the owner's church slabs): the stray-slab detector over every destructible kind of
    // every map, one props build per map in a worker pool (no plate, wall or run standing past the walls, none floating)
    'tools/destruction-slab-kinds.selftest.mjs',
  ]),
});
