// module-boundaries.pin.mjs — the shrink-only debt tools/module-boundaries.mjs allows (arch-1, 2026-11-27).
// Every line is an edge or cycle that existed when its rule was written. Remove a line when its migration lands (the
// receipt fails until you do); never add one: a new edge across a layer is fixed at its source, or the rule changes in
// docs/architecture/adr/ first. The comments name the task in docs/architecture/BACKLOG.md that retires each group.
// First-party tooling: Kevin B. Liu.

/** Static import cycles, each sorted (T-cycles in docs/architecture/BACKLOG.md). */
export const PINNED_CYCLES = Object.freeze([
  ['src/sim/auxiliarySystems.ts', 'src/sim/damage.ts'],
  ['src/vehicles/nationWheelConstructions.ts', 'src/vehicles/profiles/leclercXWheels.ts'],
  ['src/vehicles/profiles/kf51Evo.ts', 'src/vehicles/profiles/leopard.ts'],
  ['src/vehicles/profiles/russia.ts', 'src/vehicles/profiles/t54Family.ts', 'src/vehicles/profiles/t62Family.ts'],
  ['src/world/maps/regional/arctic.ts', 'src/world/maps/regional/arcticShed.ts', 'src/world/maps/regional/arcticStation.ts'],
  ['src/world/maps/stoneLandmarks.ts', 'src/world/sceneryRocks.ts'],
]);

/** Layer edges by rule: 'from -> to'. */
export const PINNED_EDGES = Object.freeze({
  'foundation-layers-import-no-shell': [
    'src/audio/audioEngine.ts -> src/game/eraActivation.ts', // T-shared-1
    'src/audio/audioEngine.ts -> src/game/killcamScreen.ts', // T-shared-1
    'src/audio/audioEngine.ts -> src/game/shotCadence.ts', // T-shared-1
    'src/audio/audioEngine.ts -> src/game/weaponHitKind.ts', // T-shared-1
    'src/audio/audioEngine.ts -> src/ui/i18n.ts', // T-ui-leaf-1
    'src/audio/lazyAudio.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/audio/lazyAudio.ts -> src/game/killcamScreen.ts', // T-shared-1
    'src/audio/listenerPoseRuntime.ts -> src/game/playerVisibility.ts', // T-shared-1
    'src/engine/battleAtmosphereAccess.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/engine/battleAtmosphereAccess.ts -> src/app/lazyRuntimeOwner.ts', // T-lazy-1
    'src/engine/blackWorldGuardInstall.ts -> src/game/battleScope.ts', // T-shared-2
    'src/engine/cameraRig.ts -> src/game/strikeViewState.ts', // T-shared-2
    'src/engine/cameraRig.ts -> src/ui/accessibilityPreferences.ts', // T-ui-leaf-1
    'src/engine/cloudPresets.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/engine/deviceDiag.ts -> src/ui/i18n.ts', // T-ui-leaf-1
    'src/engine/earthLandAccess.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/engine/lighting.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/engine/lighting.ts -> src/dev/debugIntent.ts', // T-ui-leaf-1
    'src/engine/nightLightingAccess.ts -> src/app/lazyRuntimeOwner.ts', // T-lazy-1
    'src/engine/post.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/engine/renderer.ts -> src/ui/components/modalLayer.ts', // T-ui-leaf-1
    'src/engine/renderer.ts -> src/ui/i18n.ts', // T-ui-leaf-1
    'src/engine/volumetricClouds.ts -> src/ui/accessibilityPreferences.ts', // T-ui-leaf-1
    'src/engine/watchCamera.ts -> src/ui/accessibilityPreferences.ts', // T-ui-leaf-1
    'src/fx/effects.ts -> src/game/eraActivation.ts', // T-shared-1
    'src/fx/effects.ts -> src/game/gunshipVisual.ts', // T-shared-2
    'src/fx/effects.ts -> src/game/missionAttachmentVisual.ts', // T-shared-2
    'src/fx/effects.ts -> src/game/shotCadence.ts', // T-shared-1
    'src/fx/effects.ts -> src/game/weaponHitKind.ts', // T-shared-1
    'src/fx/effects.ts -> src/ui/accessibilityPreferences.ts', // T-ui-leaf-1
    'src/fx/fxRuntimeAccess.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/vehicles/combatAnatomyCalibrationLoader.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/vehicles/fleetFactory.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/vehicles/interiorFills.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/vehicles/materials.ts -> src/ui/glacisText.ts', // T-ui-leaf-1
    'src/vehicles/tankAssets.ts -> src/techTree/tiers.ts', // T-ui-leaf-1
    'src/vehicles/tankAssets.ts -> src/ui/flagCodes.ts', // T-ui-leaf-1
    'src/vehicles/tier.ts -> src/techTree/tiers.ts', // T-ui-leaf-1
    'src/vehicles/turretRingLoader.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/vehicles/vehicleMarkingSeatLoader.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/vehicles/vehicleMarkings.ts -> src/ui/flagCodes.ts', // T-ui-leaf-1
    'src/vehicles/vehicleMarkings.ts -> src/ui/glacisText.ts', // T-ui-leaf-1
    'src/vehicles/wreckTurretDriverLoader.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/world/frontlineAtmosphereAccess.ts -> src/app/lazyRuntimeOwner.ts', // T-lazy-1
    'src/world/mapAmbienceAccess.ts -> src/app/lazyRuntimeOwner.ts', // T-lazy-1
    'src/world/worldActivationRuntime.ts -> src/ui/minimapAssetRuntime.ts', // T-ui-leaf-1
    'src/world/worldActivationRuntime.ts -> src/ui/minimapAssetUrl.ts', // T-ui-leaf-1
    'src/world/worldBuildCoordinator.ts -> src/app/lazyChunk.ts', // T-lazy-1
  ],
  'online-driver-imports-no-page-shell': [
    'src/mp/host/hostRuleset.ts -> src/game/campaignOperations.ts', // T-mp-1
    'src/mp/presentation/battlePresentation.ts -> src/game/gunshipVisual.ts', // T-shared-2
    'src/mp/presentation/battlePresentation.ts -> src/game/preBattleCountdown.ts', // T-mp-1
    'src/mp/session/activationRuntime.ts -> src/game/appLifecycle.ts', // T-mp-1
    'src/mp/session/activationRuntime.ts -> src/game/couchSeats.ts', // T-mp-1
    'src/mp/session/compositionAccess.ts -> src/app/lazyChunk.ts', // T-lazy-1
    'src/mp/session/roundState.ts -> src/game/preBattleCountdown.ts', // T-mp-1
  ],
  'services-import-no-page': [
    'api/jev.ts -> src/game/jevProtocol.ts', // T-mp-1
  ],
});
