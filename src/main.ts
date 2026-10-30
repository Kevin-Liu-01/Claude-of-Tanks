import './ui/richTooltip.css';
import { createVehicleGroundSampler } from './world/vehicleGroundSampler.ts';
import './ui/battleUiVisibility.css';
import './ui/hudCustomization.css';
import type { RuntimeValue } from './runtimeTypes.ts';
/**
 * main.ts — typed integration entry point (ARCHITECTURE.md §4, §5).
 *
 * Startup order (locked): createRenderer → createSky → bakeEnvironment →
 * createLighting (CSM before any material compiles) → EngineCtx →
 * applyFog (before the first program submission) → spawn tanks → createFx →
 * HUD/garage → createAudio → createCameraRig → warm frames → window.__GAME_READY.
 *
 * BOOT SCREENS (boot r8): the module body is now a STAGED, frame-yielding boot
 * sequence (top-level await between stages) behind the branded entry/loading
 * screen whose markup lives inline in index.html. Every stage reports real
 * progress to src/ui/bootScreen.ts, so the bar tracks work instead of a timer,
 * and the browser gets a frame between stages so it can actually paint it.
 *
 * The 1 km battlefield is NOT part of boot any more — nothing on the garage
 * screen can see it (the bay is fully enclosed), so ensureWorld() builds it on
 * first real need, chunked behind the pre-battle loading screen. In the garage
 * the battle world is dormant: hidden (which also drops it from every shadow
 * cascade) and skipped by the per-frame LOD/wind update.
 *
 * Game flow: entry splash → garage (pedestal showcase at -1500,-1500) →
 * battle loading screen → battle (player vs 7 AI tanks) → victory/defeat
 * overlay → back to garage.
 */
import * as THREE from 'three';
// Side-effect import: registers the i18n catalog as the source of truth so
// any `t('module.key')` call resolved later in the boot sequence finds a
// populated dictionary. Keep this line above the rest of the imports.
// Bind the static-HTML i18n applier so the boot splash copy (credits button,
// gate prompt, retry) respects the active locale from first paint.
import { bindStaticI18nAuto } from './presentation/staticI18n.ts';
import type {
  WorldActivationRuntime,
  WorldActivationOptions,
} from './world/worldActivationRuntime.ts';
import type { PlayerBattleActions } from './game/playerBattleActions.ts';
import type { FxWorldSeam } from './fx/effects.ts';
import type { BattleVisualStreamer } from './game/battleVisualStreamer.ts';
import type {
  MainEntity,
  MainFxModule,
  MainFxRuntime,
  MainGameState,
  MainGarageRuntime,
  MainLightingRuntime,
  MainWorld,
} from './app/mainContracts.ts';
import {
  createMainBattleHudRuntime,
  type MainBattleHudRuntime,
} from './app/mainBattleHudRuntime.ts';
import { createMainFrameRuntime } from './app/mainFrameRuntime.ts';
import { createLazyRuntimeOwner } from './app/lazyRuntimeOwner.ts';
import { createCombatAimComposition } from './app/combatAimComposition.ts';
import { checkedIntegrationPort } from './app/checkedIntegrationPort.ts';
import { createCombatWarmComposition } from './app/combatWarmComposition.ts';
import { createRenderer } from './engine/renderer.ts';
import {
  installShaderErrorCollector, relaxShaderChecks, runDeviceDiag, applyDiagRescue,
  mountDiagOverlay, runSceneBlackWatchdogAsync, reclaimShadows, scheduleSceneWatchdog, runSceneWatchdogNow, warmSceneProbePrograms,
  battleProbeRadianceScale, setSceneProbeTargetSource, type SceneWatchdogResult,
} from './engine/deviceDiag.ts';
import {
  resolveDeviceTier, resolvePresetName, resolveAutoTier,
  reportSustainedOverload, setPresetName, setMobilePresetName,
  noteGpuRenderer, getDeviceTier, shouldReleaseInactivePhaseGpu, applyGraphicsRecovery, onPresetChange, getPreset,
} from './engine/quality.ts';
import { createSky, DEFAULT_SKY_PRESET } from './engine/sky.ts';
import { deriveCloudLayerPreset } from './engine/cloudPresets.ts';
import { createBattleAtmosphereAccess } from './engine/battleAtmosphereAccess.ts';
import { EXPOSURE_REFERENCE_ILLUMINANCE, loadGroundedLightModel } from './engine/lightModelCore.ts';
import { loadCloudscapeLayers } from './engine/cloudPresets.ts';
import { battlePreferences } from './game/battlePreferences.ts';
import { createFrontlineAtmosphereAccess } from './world/frontlineAtmosphereAccess.ts';
import { createMapAmbienceAccess } from './world/mapAmbienceAccess.ts';
import { createNightLightingAccess } from './engine/nightLightingAccess.ts';
import { createMissionBrief } from './ui/missionBrief.ts';
import { createLighting } from './engine/lighting.ts';
import { createPost, type PostRuntime } from './engine/post.ts';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextFrame,
  nextPaintFrame,
  onPaintStall,
} from './engine/frameScheduler.ts';
import { createBootLifecycle } from './engine/bootLifecycle.ts';
import { createViewportRuntime } from './engine/viewportRuntime.ts';
import { createFrameLoopScheduler, PRESENTATION_MAX_FRAME_RATE } from './engine/frameLoopScheduler.ts';
import { createGarageFramePacer } from './engine/garageFramePacer.ts';
import { STRICT_DRAIN_STALL_MS, createForwardProgramWarmOwner, type ForwardProgramCompileTiming } from './engine/programWarm.ts';
import { renderCoveredComposerWarm, type CoveredComposerWarmTiming } from './engine/coveredComposerWarm.ts';
import { LATE_FX_LAYER } from './fx/layers.ts';
import {
  restoreGarageGpuPipeline,
  warmGarageGpuPipeline,
  type GarageGpuRestoreReceipt,
} from './engine/garageGpuWarmRuntime.ts';
import { programReceipt, type ProgramOriginWatch, type ReceiptProgram } from './engine/programReceipt.ts';
import { createDeploymentForwardWarmBatches, createIsolatedForwardWarmBatches, renderWithoutShadowUpdates } from './engine/deploymentWarm.ts';
import { createGpuCatchUpGate } from './engine/gpuCatchUp.ts';
import { stageTextureUploads, waitForGpuCatchUp } from './engine/textureUploadStaging.ts';
import { createCameraDestinationWarmer } from './engine/cameraDestinationWarm.ts';
// DESTRUCTIBLES r1: prop-destruction bus seam (audio subscribes to the event)
import { setDestroyedEventSink } from './world/destructibles.ts';
import {
  MAP_IDS,
  getLocalizedMapName,
  resolveMapId,
} from './world/maps/catalog.ts';
import type { MapCompositionConfig } from './world/maps/contracts.ts';
import { t } from './ui/i18n.ts';
import { isChunkFailure, markLoadFailed, pressFailed } from './ui/components/loadFailure.ts';
import { getGarageSkyPreset } from './game/garageSkyPresets.ts';
import { withGarageWeather } from './game/garageWeather.ts';
import { createWorldActivationRuntime } from './world/worldActivationRuntime.ts';
import { createWorldFramePresentationRuntime } from './world/worldFramePresentationRuntime.ts';
import { createDugHeightFieldProxy, createLiveHeightFieldProxy } from './world/liveHeightFieldProxy.ts';
import type { WaterDisturbance } from './world/shallowWater.ts';
import { waterContactMaskAt } from './world/waterContactMask.ts';
import { sceneWindOf } from './world/sceneWind.ts';
import type { GroundDisturbance } from './world/groundPressure.ts';
import { tankContactRect } from './sim/tankContactShape.ts';
import { MAP_HEROES, MAP_THUMBS } from './ui/mapThumbs.ts';
import { currentViewport, mapBackdropFor } from './ui/mapBackdrop.ts';
import { preloadImageWhenIdle } from './ui/imagePreload.ts';
import { createGarageCamoTryOn } from './game/garageCamoTryOn.ts';
import { minimapAssetUrl as getMinimapAssetUrl } from './ui/minimapAssetUrl.ts';
import { VISIBLE_TANK_IDS, getSpec } from './vehicles/specs.ts';
import {
  createTank, createTankSteps, ensureFullFleet, ensureTankBuilder, ensureTankBuilders, offThreadDecorPlanner,
} from './vehicles/fleetFactory.ts';
// CAMO WIRING: pattern persistence + live repaint (garage picker, AUTO biome)
import {
  CAMO_CATALOG_PATTERN_IDS, getCamoSelection, setCamoSelection,
  getCustomCamoSelection, setCustomCamoSelection, getMultiplayerCamoSelection, STORED_CAMO_SELECTION,
  setCamoBiome, setCamoOverride, applyCamoPatterns, applyCamoPatternsChunked, paintCamoTryOn,
  clearCamoOverrides, warmWreckTextures,
  prebakeSharedTextures, prebakeBurntSteps, discardPrebakedSharedTextures,
} from './vehicles/materials.ts';
import './ui/motion.css';
import './ui/responsiveSurfaces.css';
import './ui/components/components.css';
import './ui/components/figures.css';
import './ui/components/notices.css';
import './ui/components/pickers.css';
import './ui/garage.css';
import './ui/showroom.css';
import './ui/tablet.css';
import './ui/battleTimeChoices.css';
import { createGarage } from './ui/garage.ts';
import { battleOrdinalBase, installBattleRecords } from './game/profile.ts';
import { installCampaignProgress } from './game/campaignProgress.ts';
import { installServiceRecord } from './game/serviceRecord.ts';
import { installMedalToasts } from './ui/medalToast.ts';
import {
  createGarageStage, createGarageStageSteps, GARAGE_PODIUM_TOP_Y_M, GARAGE_TRACK_AXIS_YAW_RAD,
} from './ui/garageStage.ts';
import { createGarageDressingAccess } from './game/garageDressingAccess.ts';
import { createGarageDressingScheduler } from './game/garageDressingScheduler.ts';
import { classifyChunkFailure } from './app/lazyImportRetry.ts';
import {
  GARAGE_VARIANTS, getGarageVariant, loadGarageVariantId, saveGarageVariantId,
} from './game/garageVariants.ts';
import {
  createGarageEnvironmentPresentationRuntime,
  type GarageEnvironmentPresentationRuntime,
} from './game/garageEnvironmentPresentationRuntime.ts';
import {
  GARAGE_CAMERA_AZIMUTH_RAD,
  GARAGE_CAMERA_PITCH_RAD,
  GARAGE_PLATFORM_GEOMETRY,
} from './game/garagePresentationPose.ts';
import { createGaragePedestalRuntime } from './game/garagePedestalRuntime.ts';
import { createGarageModePreviewRuntime, prepareGarageModePrograms } from './app/garageModePreviewRuntime.ts';
import { parkGarageTankEnergyVisual, prepareGarageTankEnergyVisual } from './game/juggernautVisual.ts';
import { createGarageShowroomRuntime } from './game/garageShowroomRuntime.ts';
import { createGarageIdleWorkCoordinator } from './game/garageIdleWorkCoordinator.ts';
import { createGarageReturnAccess } from './game/garageReturnAccess.ts';
import { createBattleAgainAction } from './game/battleAgainAction.ts';
import { createGaragePhasePresentationRuntime } from './game/garagePhasePresentationRuntime.ts';
import { createGarageWorkshopDiagnostics } from './game/garageWorkshopDiagnostics.ts';
import { createBattleIntentRuntime } from './game/battleIntentRuntime.ts';
import { createBattlePhasePolicy } from './game/battlePhasePolicy.ts';
import { createBattleRolloutRuntime } from './game/battleRolloutRuntime.ts';
import { createKillcamAccess } from './game/killcamAccess.ts';
import { createPlayerBattleActions } from './game/playerBattleActions.ts';
import { createPlayerFrameInput } from './game/playerFrameInput.ts';
import { createBattleFrameRuntime } from './game/battleFrameRuntime.ts';
import { createBattlePresentationRuntime, loadMissionAttachmentVisual } from './game/battlePresentationRuntime.ts';
import { createBattleHudFrameRuntime } from './game/battleHudFrameRuntime.ts';
import { createLazyMatchModeWorldPresentation } from './game/matchModeWorldLazy.ts';
import { createBattleResultPresentationRuntime } from './game/battleResultPresentationRuntime.ts';
import { createBattleEndingCamera } from './game/battleEndingCamera.ts';
import { createSoloBattleDeploymentAccess } from './game/soloBattleDeploymentAccess.ts';
import { createSoloBattleLoadingAccess } from './game/soloBattleLoadingAccess.ts';
import type { SoloBattleLoadingStartOptions } from './game/soloBattleLoadingRuntime.ts';
import { createSoloBattleStartAccess } from './game/soloBattleStartAccess.ts';
import {
  createSoloBattleEntryRuntime,
  type SoloBattleEntryRequest,
} from './game/soloBattleEntryRuntime.ts';
import { createBattleVisualPool } from './game/battleVisualPool.ts';
import { createBattleVisualStreamerAccess } from './game/battleVisualStreamerAccess.ts';
import {
  clearBattleAfterExit,
  resetBattleTankForGarage,
} from './game/garageTankLifecycle.ts';
// Engineering diagnostics stay out of ordinary production boot. A tiny typed
// facade transfers the exact HUD/telemetry runtime only for explicit QA,
// development, or automation sessions.
import { debugModeRequested } from './dev/debugIntent.ts';
import type {
  BotPressureTelemetry,
  CombatTelemetryOptions,
  PlayerShellTelemetryRecord,
} from './dev/combatTelemetry.ts';
import type { DebugSurfaceDependencies } from './dev/debugSurface.ts';
import { createDriveTestAccess } from './dev/driveTestAccess.ts';
import type { DriveTestControllerOptions } from './dev/driveTestController.ts';
import { createPerfDiagnosticsAccess } from './dev/perfDiagnosticsAccess.ts';
import { createLazyAudio } from './audio/lazyAudio.ts';
import { createListenerPoseRuntime } from './audio/listenerPoseRuntime.ts';
import { createInput, getStoredDifficulty } from './game/input.ts';
import { createArmorAimOverlayAccess } from './game/armorAimOverlayAccess.ts';
import { createBattleWarmAccess } from './game/battleWarmAccess.ts';
import { createBattleModuleAccess } from './game/battleModuleAccess.ts';
import { createPlaySurfaceRuntime } from './game/playSurfaceRuntime.ts';
import { createCompositionAccess } from './mp/session/compositionAccess.ts';
import { resetRoundState } from './mp/session/roundState.ts';
import type { ActivationRuntimeOptions } from './mp/session/activationRuntime.ts';
import type { BrowserComposition, BrowserCompositionPorts, BrowserLaunchRequest } from './mp/session/browserComposition.ts';
import type { MatchActor } from './mp/presentation/battlePresentation.ts';
import type { LobbyIntent } from './mp/session/lobbyIntent.ts';
import { createIntentCover } from './mp/session/intentCover.ts';
import { loadEquipment as loadSelectedEquipment } from './game/equipment.ts';
import { consumableSpecFor, loadConsumables } from './game/consumableLoadout.ts';
import { createSettingsAccess } from './ui/settingsAccess.ts';
import { createMobileBattleInputAccess } from './game/mobileBattleInputAccess.ts';
import { installResponsiveLayout } from './ui/responsiveLayout.ts';
import { installAccessibility } from './ui/accessibilityPreferences.ts';
import { installPinchZoomGuard } from './ui/pinchZoomGuard.ts';
import {
  spawnTanks, ensureStagedVisuals, ensureStagedVisualsSteps, nextStagedBake, planBattleParticipantIds, planBattleSeats,
  planBattleCamoOverrides, type BattleVisual,
} from './game/rosterState.ts';
import { clearMatchSession, createBus, createGameState, watchRevealsAll } from './game/stateCore.ts';
import { campaignOperationById } from './game/campaignOperations.ts';
// Pure roster planning: the solo battle authority stays behind soloBattleAccess (boot-static-closure receipt).
import { soloRosterPlan } from './game/soloRosterPlan.ts';
import { readBrainSettings, readTeamArrangement } from './game/teamArrangement.ts';
import { deathsAreFinal, matchRulesetFor, roomSizeRulesFor, terrainVariantFor } from './sim/matchRuleset.ts';
import { BATTLE_MODE_IDS, normalizeGameMode } from './sim/gameModeCatalog.ts';
import { teamNationsFlags } from './sim/teamNations.ts';
import { SHOT_VIEWS, type ShotViewName } from './dev/shotContract.ts';
import { createSoloBattleRuntimeAccess } from './game/soloBattleAccess.ts';
import { createProvingControls } from './game/provingGroundSession.ts';
import { readTestDriveIntent, withoutTestDriveIntent } from './game/testDriveLink.ts';
import { createBattleEntryAcquisition } from './game/battleEntryAcquisition.ts';
import { createBattleEntryLifecycle, revealTimeoutForField } from './game/battleEntryLifecycle.ts';
import { createStudioAccess } from './game/studioAccess.ts';
import { createFxRuntimeAccess } from './fx/fxRuntimeAccess.ts';
import { releaseObject3DGpuResources } from './engine/resourceLifetime.ts';
// BOOT SCREENS: the entry/loading gate (markup inline in index.html so first
// paint never waits on this module graph) and the pre-battle roster screen.
import { createBootScreen } from './ui/bootScreen.ts';
// ENTRY TELEMETRY (docs/ENTRY-RESILIENCE.md): the anonymous beacon that turns
// a friend's "it did not load" into a stage, a build and an error message.
import { describeError, getEntryTelemetry, installEntryErrorTelemetry } from './entry/telemetry.ts';
// CAPABILITY GATE: WebGL2, texture units, renderer family, storage and
// workers are checked on a throwaway context before the real renderer.
import {
  bootCapabilityScreen, browserCapabilityHost, capabilitySummary, haltRefusedRenderer, runBootCapabilityGate,
} from './engine/capabilityGate.ts';
import { battleLoadModeLabel, createBattleLoadScreen, primeMapLqipWhenIdle } from './ui/battleLoad.ts';
import { createEndOverlayRuntime } from './ui/endOverlayRuntime.ts';
import { createStartupIntent } from './game/startupIntent.ts';
import { createSelectedVehicleSelection } from './game/selectedVehicleSelection.ts';
import { migrateStoredTankIds } from './game/tankIdStorageMigration.ts';
import { createPointerLockFeedbackRuntime } from './game/pointerLockFeedbackRuntime.ts';
import { createSniperFillRuntime } from './game/sniperFillRuntime.ts';
import { createCombatFeedbackRuntime } from './game/combatFeedbackRuntime.ts';
import { createRosterPresentation } from './game/rosterPresentation.ts';
import { displayTier, tierNumeral } from './techTree/tiers.ts';
import { createTransition } from './ui/transition.ts';
import type { DamagePanelController } from './ui/damagePanel.ts';
import { prepareEntryPanelMasks } from './ui/damagePanelEntryMasks.ts';
import type { HudMatchModeState, HudMode } from './ui/hud.ts';

type DamagePanelSpec = Parameters<DamagePanelController['setTank']>[0];
type DamagePanelVisual = Parameters<DamagePanelController['setTank']>[1];
type DamagePanelEquipment = Parameters<DamagePanelController['setEquipment']>[0];

// Direct /studio navigation is a distinct boot target, not "boot the garage,
// reveal it, then start a second load".  The intent is captured before any
// staged work so the inline boot screen can report Studio-specific progress
// and main.ts can hand the already-visible veil to createStudio().
const startupIntent = createStartupIntent(globalThis.location);
const STUDIO_BOOT_INTENT = startupIntent.studioRequested;
const STUDIO_BOOT_MAP = startupIntent.studioMapId;

const DEG = Math.PI / 180;
const SIM_DT = 1 / 60;
const VERDANT_GARAGE_POS = Object.freeze({ x: -1500, z: -1500 });
const GARAGE_POS = new THREE.Vector3(VERDANT_GARAGE_POS.x, 0, VERDANT_GARAGE_POS.z);
const pendingRoomInvitePromise = startupIntent.pendingRoomInvite;
/** A tab the room invite leaves in the Garage gets its idle work (neighbour heroes, dressing) this long after ready. */
const INVITE_GARAGE_IDLE_DELAY_MS = 12_000;
/**
 * 2026-10-20 (item/mp-rejoin-229): the network round this browser last entered (the composition's rememberRound port),
 * so a tab reopened on that room's invite builds the match's battlefield during its boot. Twenty minutes at most: a
 * return is a reload or a reopened invite, and past that the match has most likely ended (a wrong guess costs boot time).
 */
const REMEMBERED_ROUND_KEY = 'cot.mp.rememberedRound.v1';
/**
 * The boot is done (set beside __GAME_READY). The Garage's own first map selection during the boot is no player's pick:
 * it must not cancel the returning tab's battlefield (the 229 block: every returning build was cancelled there).
 */
let garageBootDone = false;
const REMEMBERED_ROUND_MAX_AGE_MS = 20 * 60 * 1000;
function rememberRound(round: { roomCode: string; matchId: string; mapId: string; terrainVariant: 'assault-trenches' | null } | null): void {
  try {
    if (round) localStorage.setItem(REMEMBERED_ROUND_KEY, JSON.stringify({ ...round, at: Date.now() }));
    else localStorage.removeItem(REMEMBERED_ROUND_KEY);
  } catch { /* storage unavailable: a reload only loses the head start */ }
}
function rememberedRoundFor(roomCode: string): { mapId: string; terrainVariant: 'assault-trenches' | null } | null {
  try {
    const raw = localStorage.getItem(REMEMBERED_ROUND_KEY);
    const round = raw ? JSON.parse(raw) as { roomCode?: unknown; mapId?: unknown; terrainVariant?: unknown; at?: unknown } : null;
    if (!round || round.roomCode !== roomCode || typeof round.mapId !== 'string' || !(MAP_IDS as readonly string[]).includes(round.mapId)) return null;
    if (typeof round.at !== 'number' || !(Date.now() - round.at < REMEMBERED_ROUND_MAX_AGE_MS)) return null;
    return { mapId: round.mapId, terrainVariant: round.terrainVariant === 'assault-trenches' ? 'assault-trenches' : null };
  } catch { return null; }
}
// FE-P13: battle loading art follows the viewport (a 1280 card on small and medium screens, else the 4K hero).
const battleBackdrop = (mapId: string): string => mapBackdropFor(mapId, currentViewport());
const minimapAssetUrl = (mapId: string): string => (
  getMinimapAssetUrl(mapId, import.meta.env.BASE_URL || '/')
);
const isShotViewName = (value: string): value is ShotViewName => (
  SHOT_VIEWS.some((name) => name === value)
);

const {
  preload: preloadSoloBattleRuntime,
  isReady: isSoloBattleRuntimeReady,
  setupBattle,
  simStep,
  createCollider,
  prepareNextOpeningRoute,
  resetProvingRange,
  setProvingTargetsMoving,
} = createSoloBattleRuntimeAccess();
const battleWarm = createBattleWarmAccess();
const battleEntryAcquisition = createBattleEntryAcquisition();

// Saved tank ids follow the id renames (SSOT 2.19) before anything reads them.
migrateStoredTankIds((() => { try { return globalThis.localStorage; } catch { return null; } })());

// Resolve the remembered hero and begin its exact family transfers before
// renderer/garage construction. This overlaps network work with the staged
// boot without constructing a tank or touching WebGL ahead of startup order.
const selectedVehicle = createSelectedVehicleSelection({
  visibleIds: VISIBLE_TANK_IDS,
  defaultId: 'm1a3',
});
const bootSelectedBuilderP = STUDIO_BOOT_INTENT
  ? Promise.resolve()
  : ensureTankBuilder(selectedVehicle.id);

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
/** The camera's view for the night lamps (nightLightingAccess getCameraForward). */
const _nightCameraForward = new THREE.Vector3();
const _rayO = new THREE.Vector3();

// ---------------------------------------------------------------------------
// BOOT STAGES (src/ui/bootScreen.ts)
//
// The module body below is a staged boot sequence: each heavy step runs inside
// bootStage(), which names the stage on the loading screen, yields a frame so
// the bar paints, runs the work, then advances the bar. Stage keys and their
// weights (measured shares of boot wall-clock) live in bootScreen.ts STAGES.
//
// `bootComplete` gates the render loop: the rAF-starvation fallback below
// registers its listeners mid-module and must never fire tick() while later
// top-level consts are still in their temporal dead zone.
// ---------------------------------------------------------------------------
const boot = createBootScreen({ mode: STUDIO_BOOT_INTENT ? 'studio' : 'garage' });
// The beacon shares the inline watchdog's session id and reports the first
// uncaught errors against the stage they interrupted (opt-outs: telemetry.ts).
const entryTelemetry = getEntryTelemetry();
installEntryErrorTelemetry(entryTelemetry, window);
// A visible paint wait that outruns its budget extends once and continues
// (frameScheduler.ts, 2026-09-25); each phase is one beacon, never a failed entry.
onPaintStall(({ phase, waitedMs }) => entryTelemetry.send({
  kind: 'slow_reveal', stage: 'paint', code: phase, ms: waitedMs,
}));
// Every UI surface consumes the same semantic viewport contract. Install it
// before HUD/garage construction so their first visible frame already has the
// correct width, height, orientation and interaction-mode attributes.
installResponsiveLayout();
// Browser pinch-zoom is never a page zoom here (2026-09-20; the guard used to exist only inside the touch
// controls). index.html's inline copy guards the splash from first paint; this hands over from it (2026-10-15).
installPinchZoomGuard();
// The player's accessibility choices (text and HUD size, colour preset, contrast, motion, shake, flash, toggles):
// index.html seeded them on :root before first paint; from here they stay live (src/ui/accessibilityPreferences.ts).
installAccessibility();
// Apply static i18n attributes to the boot screen so the credits button,
// gate prompt, and retry button respect the active locale from first paint.
bindStaticI18nAuto();
let bootComplete = false;
// (boot-261) optional Garage work held until the boot completes (the stage's hardstand textures): run when it does
const afterBootComplete: Array<() => void> = [];
const whenBootSettled = (work: () => void): void => {
  if (bootComplete) work();
  else afterBootComplete.push(work);
};
const bootLifecycle = createBootLifecycle({
  screen: boot,
  yieldFrame: nextFrame,
  onStage: (stage, phase, ms) => entryTelemetry.stage(stage, phase, ms),
});
const BOOT_TIMINGS = bootLifecycle.timings;
const BOOT_T0 = bootLifecycle.startedAt;
const bootStage = bootLifecycle.run;
// ---------------------------------------------------------------------------
// Engine bootstrap (§4 startup order)
// ---------------------------------------------------------------------------
const container = document.getElementById('app');
if (!container) throw new Error('application root #app is missing');
boot.begin('renderer');
entryTelemetry.stage('renderer', 'begin');
// A hard capability stop (no WebGL2, refused context, too few texture units)
// leaves its sentence and action on the boot screen and never resolves: the
// document stays put instead of spending the chunk-recovery reloads on it.
const bootCapability = await runBootCapabilityGate({
  translate: t,
  send: (event) => entryTelemetry.send(event),
  screen: bootCapabilityScreen(document),
  host: browserCapabilityHost(),
  halt: (code, message) => window.__COT_BOOT_RECOVERY?.halt?.(code, message),
  reload: () => location.reload(),
});
const renderer = await (async () => {
  try {
    return createRenderer(container);
  } catch (error) {
    entryTelemetry.error('renderer', error, 'context_refused');
    entryTelemetry.send({ kind: 'capability', outcome: 'halted', code: 'context_refused', reason: 'renderer_threw',
      capability: capabilitySummary(bootCapability.probe) });
    return haltRefusedRenderer({
      translate: t,
      screen: bootCapabilityScreen(document),
      halt: (code, message) => window.__COT_BOOT_RECOVERY?.halt?.(code, message),
      reload: () => location.reload(),
    });
  }
})();
// The real context confirms (and records) the verdict; a cached one that no longer matches re-runs the gate on it.
await bootCapability.confirm(renderer.getContext());
let graphicsContextLost = false;
let rearmRafAfterContext = () => {}; // installed when the main loop is ready
// MOBILE r2: GPU self-test + rescue ladder. The owner's iPhone renders every
// LIT mesh black (unlit sky/HUD fine) and no desktop browser reproduces it —
// so the device itself proves at boot which pipeline stage it can render,
// auto-disables shadow maps when only the depth-compare stage fails
// (flat-lit beats black), and ?diag=1 overlays verdicts + captured shader
// link errors so one phone screenshot names the fault. Runs BEFORE
// createLighting so the CSM compiles against the rescued state.
installShaderErrorCollector(renderer);
const _diag = runDeviceDiag(renderer);
const _diagRescue = applyDiagRescue(renderer, _diag);
// The capability summary travels once per session, with the tiers the real
// renderer resolved (a notice code names software rendering or blocked storage).
entryTelemetry.send({
  kind: 'capability',
  outcome: bootCapability.verdict.notices.length ? 'notice' : 'ok',
  ...(bootCapability.verdict.notices[0] ? { code: bootCapability.verdict.notices[0].code } : {}),
  capability: capabilitySummary(bootCapability.probe, {
    tier: resolveDeviceTier(renderer), autoTier: resolveAutoTier(),
  }),
});
const scene = new THREE.Scene();
// campaign slice 3 (2026-09-12): trench works follow the live ground under each sector.
// (2026-10-16, the perf lane: 226's bundle budget) the presentation's module is its own chunk, fetched when the boot is
// idle (matchModeWorldLazy.ts): the Garage draws no objective
const matchModeWorld = createLazyMatchModeWorldPresentation(scene, {
  groundHeight: (x, z) => groundSampler(x, z),
  // tactical map 2026-09-15: objective icons fade near the camera and hold their screen size far away
  viewerPosition: () => camera.position,
  setupMaterial: (material) => engineCtx.setupShadowMaterial(material),
  releaseMaterial: (material) => engineCtx.releaseShadowMaterial(material),
  // (props lane A #28) a capture zone's post takes the battlefield's form
  mapId: () => game.mapId,
});
// The scene root is permanently identity. Leaving matrixAutoUpdate enabled
// marks it dirty every render and propagates `force=true` through every world
// and vehicle descendant, defeating the static-world matrix freeze below.
// Dynamic child roots still update themselves during the normal traversal.
scene.matrixAutoUpdate = false;
// zero-viewport boot hardening: booting inside a pane that has not laid out
// yet (innerWidth/innerHeight 0) used to seed a NaN aspect (0/0) that poisons
// the projection matrix; fall back to 16:9 — the first real layout re-derives
// it through the shared resize seam below.
const _bootVw = container.clientWidth || window.innerWidth;
const _bootVh = container.clientHeight || window.innerHeight;
const camera = new THREE.PerspectiveCamera(
  60, _bootVw > 0 && _bootVh > 0 ? _bootVw / _bootVh : 16 / 9,
  0.5, 4000,
);
bootLifecycle.completeManualStage('renderer', BOOT_T0);

const sky = await bootStage('sky', () => {
  const s = createSky(scene, renderer);
  s.bakeEnvironment();
  return s;
});
// Loading-budget r1: Verdant's sealed bay cannot see the cloud decks, while
// any outdoor Garage, battle, or direct Studio entry can need them immediately.
// Start their two deterministic canvas bakes now and overlap the remaining
// boot stages. ensureWorld still awaits the shared promise before activation.
const bootCloudWarmP = sky.ensureCloudTexturesChunked
  ? sky.ensureCloudTexturesChunked(() => nextFrame()).catch(() => {})
  : Promise.resolve();
const lighting: MainLightingRuntime = await bootStage(
  'lighting',
  () => createLighting(scene, camera, sky.sunDir),
);
// The sealed garage can only see the near/contact shadow bands. Request far
// dormancy now; lighting deliberately renders every native CSM depth map once
// before honoring it because all PCF samplers remain active in the shader.
// Subsequent garage frames skip the invisible 100-700 m shadow redraws.
if (!STUDIO_BOOT_INTENT) lighting.setFarCascadeDormant(true);
// (2026-10-16, the engine-cs lane) every flip out of the Garage's sealed bay lights the open ground with the grounded
// model's environment, never the bay's full-dome bake (sky.ts syncEnvironmentEnclosure)
lighting.onEnclosureChange((enclosed) => { if (!enclosed) sky.syncEnvironmentEnclosure(); });
mountDiagOverlay({ tier: resolveDeviceTier(renderer), diag: _diag, rescue: _diagRescue, renderer });

// perf-247: bound once the forward program owner exists (below); world builds start after it.
let submitWorldPrograms = (_root: THREE.Object3D): void => {};
// perf-248: a Studio entry at dusk or night lights the lamps after the build, re-keying every lit program: no early links
let studioEarlyPrograms = true;
const engineCtx = {
  renderer,
  scene,
  camera,
  setupShadowMaterial: (
    mat: THREE.Material,
    extraHook: THREE.Material['onBeforeCompile'] | null = null,
  ) => (
    lighting.setupShadowMaterial(mat, extraHook)
  ),
  releaseShadowMaterial: (mat: THREE.Material) => lighting.releaseShadowMaterial(mat),
  anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  quality: 'high',
  submitBuiltPrograms: (root: THREE.Object3D) => submitWorldPrograms(root),
};
// --- MAP-CONFIG WIRING + DEFERRED WORLD BUILD ------------------------------
// Worlds are lazy-built per map config and cached. One typed runtime owns the
// active-world choice, atmosphere, collider/minimap readiness, GPU warm,
// dormancy and trace. Long-lived systems reach terrain through the stable
// proxy below, so a map switch — or a boot with no world at all — never leaves
// them holding a stale or missing heightfield.
//
// PERF (boot r8): the battlefield used to be built synchronously right here,
// on the boot-critical path, even though the garage bay is fully enclosed and
// cannot see a single triangle of it. The 1 km terrain bake + vegetation +
// props + minimap capture are now deferred to ensureWorld(), which the battle
// entry (behind the pre-battle loading screen) and the __SHOTS staging path
// call. Boot never touches them.
// Deterministic engineering captures keep the analytic terrain function.
// Ordinary live presentation uses the measured 1 m cache: its sub-centimeter
// error is below the rendered terrain grid while avoiding the complete
// multi-octave height stack in camera, HUD, FX and kill-cam hot paths.
let shotMode = false;
const _upNormal = new THREE.Vector3(0, 1, 0);
let worldRuntime: WorldActivationRuntime<MainWorld, RuntimeValue>;
let battleHudRuntime: MainBattleHudRuntime | null = null;
const currentWorld = () => worldRuntime?.current ?? null;
/**
 * 2026-10-01 (the grounded light model, engine/lightModel.ts): the light reads a deck's overcast from the cloudscape, so
 * the live world's cloudscape rides with its sky block wherever the light is set — as in the battle atmosphere's
 * authored preset below (the sky block itself stays byte-identical to the Garage's copy).
 */
const withWorldCloudscape = <T extends MainWorld['config']['sky'] | null>(skyConfig: T): T => {
  const config: MapCompositionConfig | undefined = currentWorld()?.config;
  // (2026-10-05: and the battlefield's scene wind, world/sceneWind.ts)
  return skyConfig && config && config.sky === skyConfig
    ? { ...skyConfig, ...(config.clouds ? { cloudscape: config.clouds } : {}), ...sceneWindOf(config as { id?: string }) } as T : skyConfig;
};
const currentHud = () => battleHudRuntime?.currentHud() ?? null;
const currentDamagePanel = () => battleHudRuntime?.currentDamagePanel() ?? null;
const hfProxy = createLiveHeightFieldProxy({
  getWorld: currentWorld,
  useExactHeight: () => shotMode,
  upNormal: _upNormal,
});

const garageIdleWorkCoordinator = createGarageIdleWorkCoordinator();
const garageFramePacer = createGarageFramePacer();
let garagePresentationDirty = true;
let invalidateGaragePresentation = () => { garagePresentationDirty = true; };
// the camo try-on (INTERACTION-REDESIGN B); its timings ride on window.__CAMO_TRY_ON for click-timeline's camo paths
const camoTryOnStats = { tries: 0, lastTryMs: 0, wears: 0, lastWearMs: 0 };
(window as Window & { __CAMO_TRY_ON?: typeof camoTryOnStats }).__CAMO_TRY_ON = camoTryOnStats;
const camoTryOn = createGarageCamoTryOn({
  paint: paintCamoTryOn,
  onChange: () => invalidateGaragePresentation(),
  onTiming: (kind, ms) => {
    if (kind === 'try') { camoTryOnStats.tries++; camoTryOnStats.lastTryMs = ms; } else { camoTryOnStats.wears++; camoTryOnStats.lastWearMs = ms; }
  },
});
if (typeof window !== 'undefined') window.__GARAGE_IDLE_WORK = garageIdleWorkCoordinator.stats;
worldRuntime = createWorldActivationRuntime<
  MainWorld,
  RuntimeValue,
  MainWorld['config']['sky']
>({
  initialMapId: 'verdant',
  coordinatorDependencies: {
    engineContext: engineCtx,
    scene,
    renderer,
    deviceTier: getDeviceTier(),
    getGarageActivity: () => ({
      phase: game.phase,
      transitionActive: transition.active,
      lastActivityAt: garageDressingScheduler.getLastActivityAt(),
    }),
    loadModule: () => import('./world/map.ts'),
    releaseShadowMaterial: (resource) => lighting.releaseShadowMaterial(resource),
    acquireBackgroundWork: (kind, stillValid) =>
      garageIdleWorkCoordinator.acquire(kind, stillValid),
  },
  swapSceneWorld: (previous, next) => garagePhasePresentation.swapWorld(previous, next),
  setSceneWorldActive: (root, active) => garagePhasePresentation.setWorldActive(root, active),
  ensureCloudTextures: () => sky.ensureCloudTextures(),
  ensureCloudTexturesChunked: sky.ensureCloudTexturesChunked
    ? (yieldFrame) => sky.ensureCloudTexturesChunked?.(yieldFrame) ?? Promise.resolve()
    : undefined,
  awaitInitialCloudWarm: () => bootCloudWarmP,
  applySkyPreset: (skyConfig) => sky.applyPreset(skyConfig, scene),
  applySkyPresentation: (skyConfig) => sky.applyPresentationPreset(skyConfig, scene),
  setSun: (skyConfig) => lighting.setSun(sky.sunDir, withWorldCloudscape(skyConfig)),
  getFogDensity: () => scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0,
  onFogDensityChanged: (density) => { baseFogDensity = density; },
  canCreateCollider: () => isSoloBattleRuntimeReady(),
  createCollider: (next) => createCollider(game, next),
  placeGarage: () => garagePhasePresentation.place(),
  isMinimapReady: () => !!currentHud(),
  buildMinimap: (next, textured) => {
    const hud = currentHud();
    if (!hud) return;
    // the plate's water is the world's visible-water raster (visibleWater.ts), handed over beside the features: never
    // inside getMinimapFeatures, which the battle's audio reads mid-fight
    hud.buildMinimap(next.heightField, { ...next.getMinimapFeatures(), visibleWater: next.getVisibleWaterRaster() },
      next.config.minimap, textured ? minimapSnapCtx() : null);
  },
  loadMinimapAsset: (next, url) => (
    currentHud()?.buildMinimapFromAsset(next.heightField, url) ?? false
  ),
  compilePrograms: (root) => forwardProgramWarm.compile(root),
  linkerBreathingSlices: (maxSlices) => forwardProgramWarm.linkerBreathingSlices(maxSlices),
  updateShadowFrustums: () => lighting.updateFrustums?.(),
  warmShadowFrame: () => warmRender(),
  nextFrame,
  baseUrl: import.meta.env.BASE_URL || '/',
  publishActivationTrace: (trace) => { window.__WORLD_LOAD = trace; },
  publishMinimapTrace: (trace) => { window.__MINIMAP_LOAD = trace; },
});
const worldCache = worldRuntime.cache;
const residentLimits = worldRuntime.resourceLimits;
const worldPrefetchStats = worldRuntime.prefetchStats;
if (typeof window !== 'undefined') window.__WORLD_PREFETCH = worldPrefetchStats;
const loadWorldModule = worldRuntime.loadModule;
const prefetchWorld = worldRuntime.prefetch;
const cancelBackgroundWorldBuildsExcept = worldRuntime.cancelBackgroundExcept;

/** World raycast that is safe before any battlefield exists. */
function worldRaycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) {
  return worldRuntime.raycast(origin, direction, maxDistance);
}

// --- game state + tanks -----------------------------------------------------
// Device QA: `?debug=1` opts a production build into the same bounded flight
// recorder used in development. The recorder remains a lazy chunk and has
// zero listeners/frame work for ordinary players; the explicit QA URL gives
// remote/mobile testers an optimized-build trace they can export themselves.
const diagnosticsRequested = import.meta.env.DEV || debugModeRequested() || navigator.webdriver;
const traceRequested = import.meta.env.DEV || debugModeRequested();
const devTrace = traceRequested
  ? (await import('./dev/perfTrace.ts')).createDevTrace({
    renderer,
    enabled: true,
    traceMode: import.meta.env.DEV ? 'development' : 'production-qa',
  })
  : null;
const bus = createBus(devTrace ? (ev, payload) => devTrace.event(ev, payload) : null);
installBattleRecords(bus);
installCampaignProgress(bus); // campaign slice 4 (2026-09-12): Frontline Assault sorties persist locally
const game: MainGameState = createGameState<
  MainEntity,
  NonNullable<MainGameState['spotting']>,
  HudMatchModeState
>({ rosterSeed: crypto.getRandomValues(new Uint32Array(1))[0] });
// Completed matches remain the ordinal base. Independent session entropy keeps
// reloads/abandoned battles from replaying the same roster at that ordinal.
game.battleCount = battleOrdinalBase();
// Medals and achievements read the battle from the same state in solo and network play.
installServiceRecord(bus, {
  playerId: () => game.player?.id ?? null,
  playerTeam: () => game.player?.team ?? null,
  teamOf: (id) => game.tankById.get(id)?.team ?? null,
  gameMode: () => game.gameMode,
  watched: () => !!game.ruleset?.watch,
  clockS: () => game.timeS,
  playerHpFraction: () => {
    const combat = game.player?.combat;
    return combat && combat.maxHp > 0 ? Math.max(0, combat.hp) / combat.maxHp : null;
  },
  playerMaxHp: () => game.player?.combat?.maxHp ?? null,
  playerNation: () => game.player?.spec?.nation ?? null,
  playerAerialKind: () => game.player?.aerial?.kind ?? null,
  playerObjectiveTeam: () => game.matchModeState?.perspectiveTeam ?? null,
  respawns: () => game.ruleset?.respawnS != null,
});
installMedalToasts(bus);
const rosterPresentation = createRosterPresentation({
  getVehicleName: (specId) => getSpec(specId)?.name,
  getTier: tierNumeral,
  getNation: (specId) => getSpec(specId)?.nation,
});
const playerShellLog: PlayerShellTelemetryRecord[] = [];
const botPressure: BotPressureTelemetry = {
  enemyShells: 0,
  aimedAtPlayer: 0,
  hitsOnPlayer: 0,
  dmgOnPlayer: 0,
};
// Randomized rosters made the two-entry detached bot cache a poor hit-rate
// trade: it retained complete procedural tank graphs, paint canvases and GPU
// programs throughout the mostly-static Garage, yet usually missed the next
// battle's exact roster. The selected player visual still transfers directly
// into the pedestal; all other battle actors now release at the phase edge.
const battleVisualPool = createBattleVisualPool<BattleVisual>({
  capacity: 0,
});
game._battleVisualPool = battleVisualPool;
devTrace?.configure({ game });
spawnTanks(game, engineCtx);
// perf-r2f: handle of the in-flight chunked camo sweep startBattle kicks —
// The covered entry warm awaits it before the wreck dances (burnt bakes copy
// the camo canvases, so paint must be final first).
let camoSweepP = Promise.resolve();
let battleWarmPending = false;
let battleWarmGeneration = 0;
let sceneWatchdogEntryGeneration = 0;
let coveredBattleWatchdog: (() => Promise<SceneWatchdogResult | void>) | null = null;

// --- fx ----------------------------------------------------------------------
// The complete particles/effects graph is battle-only. Parsing and building it
// during garage boot delayed first interaction and created GPU objects the
// garage could not display. Intent preloads the module; the opaque battle,
// Studio, and deterministic-shot entry gates below construct exactly one live
// instance before any consumer can emit an effect. The typed owner keeps code
// intent separate from GPU construction and makes either failure retryable
// without a page refresh.
/**
 * (battle-spikes-253) The scene's visible lights at a named moment (the MP entry's compile, its watchdog): three keys every
 * program on the counts of visible lights by kind, and nav-perf's program log found the depth programs compiled with 7
 * point lights and drawn with 8. Read as window.__LIGHT_CENSUS[label]; diagnostics only, a few hundred objects walked.
 */
function recordLightCensus(label: string): void {
  if (typeof window === 'undefined') return;
  const counts: Record<string, number> = {};
  const lights: string[] = [];
  scene.traverseVisible((object) => {
    const light = object as THREE.Light;
    if (!light.isLight) return;
    counts[light.type] = (counts[light.type] ?? 0) + 1;
    if (lights.length < 40) lights.push(`${light.type}:${light.name || '?'}<${light.parent?.name || light.parent?.type || '-'}`);
  });
  (window.__LIGHT_CENSUS ??= {})[label] = { counts, lights };
}
/**
 * (2026-10-27, the room-stalls lane) The draws that link a program while armed, each as `material<object<parent<grandparent`
 * (at most eight), for the network entry's revealPrograms receipt: renderBufferDirect is wrapped only from arming to stop(),
 * or for ORIGIN_WATCH_MS at most, so no live frame carries the check after the reveal's window.
 */
const ORIGIN_WATCH_MS = 10_000;
function watchProgramOrigins(annotate?: (object: THREE.Object3D) => string):
  { readonly origins: readonly string[]; stop(): void } {
  const origins: string[] = [];
  const previous = renderer.renderBufferDirect;
  const watched: typeof previous = function (this: THREE.WebGLRenderer, camera, drawScene, geometry, material, object, group) {
    const before = renderer.info.programs?.length ?? 0;
    previous.call(this, camera, drawScene, geometry, material, object, group);
    if ((renderer.info.programs?.length ?? 0) > before && origins.length < 8) {
      const path: string[] = [material.type];
      for (let node: THREE.Object3D | null = object; node && path.length < 5; node = node.parent) path.push(node.name || node.type);
      origins.push(`${path.join('<')}${annotate?.(object) ?? ''}`);
    }
  };
  renderer.renderBufferDirect = watched;
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (renderer.renderBufferDirect === watched) renderer.renderBufferDirect = previous;
  };
  setTimeout(stop, ORIGIN_WATCH_MS);
  return { origins, stop };
}
/**
 * (2026-10-27, the room-stalls lane) The Garage return's lateLinks receipt (programReceipt.ts): the programs linked after
 * the restore's program warm, through its covered shadow, upload and settle draws and GARAGE_LATE_LINK_FRAMES frames
 * after it (the cover lifts and the loader fades inside them). The rooms census's leave linked one there, 0.4-1.1 s. A
 * program linked there warns once, so the census's leave gate (no console warnings) holds the receipt at 0.
 */
const GARAGE_LATE_LINK_FRAMES = 90;
/**
 * (2026-10-27, the room-stalls lane) The workshop dressing's remaining chunks, finished under a covered Garage restore
 * before its program warm, one a paint frame (each is a quiet-lease step of 100 ms or less): a dressing left unbuilt at
 * the battle (a room joined within seconds of boot) otherwise streamed into the first Garage frames after the leave,
 * and each chunk's first draw linked its programs there (the rooms census rs39-40, the guest: the slideshow screen and
 * two clutter depth programs, every one added after the warm). Returns how many it finished.
 */
async function finishGarageDressingUnderCover(isCurrent?: () => boolean): Promise<number> {
  const stillValid = (): boolean => (isCurrent?.() ?? true) && game.phase === 'garage';
  let finished = 0;
  while (!garageDressing.isBuilt() && stillValid()) {
    let more: boolean;
    // (a chunk that fails is the quiet scheduler's to retry, as before; the return goes on with the dressing it has)
    try { more = await garageDressing.pump(stillValid); } catch { break; }
    finished++;
    if (!more) break;
    await nextPaintFrame();
  }
  return finished;
}
/** The workshop dressing's finished chunks, in order (garageDressing.ts group.userData.buildTimings). */
const dressingBuildTimings = (): ReadonlyArray<{ chunk?: string }> =>
  (garageDressing.group.userData.buildTimings as Array<{ chunk?: string }> | undefined) ?? [];
async function recordGarageLateLinks(receipt: GarageGpuRestoreReceipt,
  { baseline, watch, dressingChunks, dressingBuilt }: { baseline: ReadonlySet<ReceiptProgram>; watch: ProgramOriginWatch;
    dressingChunks: number; dressingBuilt: boolean }): Promise<void> {
  const entryInfo = renderer.info;
  try {
    receipt.lateLinks = programReceipt(renderer.info.programs ?? [], baseline, 0, watch);
    for (let frames = 1; frames <= GARAGE_LATE_LINK_FRAMES; frames++) {
      await nextPaintFrame();
      if (renderer.info !== entryInfo || game.phase !== 'garage') break;
      receipt.lateLinks = programReceipt(renderer.info.programs ?? [], baseline, frames, watch);
    }
  } finally { watch.stop(); }
  const { lateLinks } = receipt;
  if (!lateLinks?.made) return;
  // (short lines: the rooms census keeps a warning's first 240 characters; one for the restore, one for each program)
  const failures = receipt.programCompileFailures;
  const since = dressingBuildTimings().slice(dressingChunks).map((timing) => timing.chunk ?? '?');
  console.warn(`Garage late links: dressing built at the warm ${dressingBuilt} (${receipt.dressingChunksFinished ?? 0} finished `
    + `under the cover), ${receipt.shadowCasterBatches ?? 0} caster batches, ${receipt.uploadCatchUpFrames ?? 0} upload waits, `
    + `chunks since ${since.length}: ${since.join(' ')}`);
  console.warn(`Garage return linked ${lateLinks.made} program(s) after its program warm; released ${lateLinks.released}; `
    + `warm ${receipt.programsPrepared ?? 0} prepared in ${receipt.programCohorts ?? 0} cohorts, ${receipt.programWarmSlices} slices, `
    + `deferred ${receipt.programWarmDeferred ?? 0}, compile failures ${failures?.count ?? 0}${failures?.first ? ` (${failures.first})` : ''}`);
  lateLinks.names.forEach((name, index) => {
    console.warn(`Garage late link ${index + 1}/${lateLinks.made}: ${lateLinks.origins?.[index] ?? name} [${lateLinks.diffs[index]}]`);
  });
}
const fxRuntimeAccess = createFxRuntimeAccess<MainFxModule, MainFxRuntime>({
  loadModule: () => import('./fx/effects.ts'),
  initialize: async ({ createFxChunked }) => {
    // the battle-only mission-attachment visual (the drone dock on its carrier) lands with the FX graph
    await loadMissionAttachmentVisual();
    const live = await createFxChunked(engineCtx, hfProxy, {
      seed: 5000,
      auxiliaryEntities: () => networkMatchActive() ? game.tankById.values() : game.tanks, // v2 is the only multiplayer (cutover)
      auxiliaryTime: () => game.timeS,
      auxiliaryVisible: entity => entity.networkVisible !== undefined ? entity.networkVisible
        : watchRevealsAll(game) || entity.team === (game.player?.team ?? 'player')
          || game.spotting?.isSpotted(entity.id, game.player?.team ?? 'player', game.player) === true,
      auxiliaryReport: (id,p,caliberMm) => bus.emit('auxiliary:fired',{id,x:p.x,y:p.y,z:p.z,caliberMm}),
      // Decals must resolve every live struck entity in production. The old
      // window.__DEBUG lookup silently dropped all marks whenever diagnostics
      // were not installed, including incoming hits on the player's tank.
      resolveEntity: (targetId) => resolveFxSubject(String(targetId)),
      // destruction-fx: the world whose structure materials take the collapse patch (world.patchStructureMaterials)
      world: () => (currentWorld() as unknown as FxWorldSeam | null) ?? null,
    }, createOpaqueLoadingYielder(6, 16, { yieldFrame: nextPaintFrame }));
    live.bindBus(bus);
    // createPost runs during garage boot, before this demand-loaded graph
    // exists. Hand its late-composite activity/depth state to the existing
    // pass now; otherwise every layer-30 effect is simulated but invisible.
    // (the map's air, 2026-10-22) the ambience draws in the same pass and keeps it running while the pools are idle
    const softParticles = live.group.userData.softParticles as { isActive?: () => boolean } | undefined;
    post.attachLateFxState(softParticles ? {
      ...softParticles, isActive: () => softParticles.isActive?.() === true || mapAmbience.isActive(),
    } : softParticles);
    return live;
  },
  activate: (live) => {
    scene.add(live.group);
  },
  suspend: (live) => {
    live.group.removeFromParent();
    // The pool graph remains reusable, but the inactive Garage must not retain
    // its battle-only buffers, textures, or shader programs. Three resources
    // are renewable after dispose(), and the covered battle warm restores the
    // exact authored graph before it can become visible again.
    releaseObject3DGpuResources(live.group, { preserveRoots: [scene] });
  },
});
const preloadFxModule = fxRuntimeAccess.preloadModule;
const ensureFxRuntime = fxRuntimeAccess.ensureRuntime;
function requireFxRuntime() {
  const live = fxRuntimeAccess.current;
  if (!live) throw new Error('combat effects runtime has not been acquired');
  return live;
}

// Per-wheel suspension: give every battle tank the live heightfield so road
// wheels conform to terrain (garage pedestal tank stays rigid on its disc).
// Movement and wheels read the same cached triangles as the near terrain.
// An analytic/bilinear approximation can sit above the visible ground at a
// ridge or rut, leaving daylight below otherwise correctly conformed tracks.
// The wheels and track debris also stand on the standable collision tops the
// movement solve stands hulls on (bridge decks, roofs, slabs): see
// world/vehicleGroundSampler.ts (the vehicle-contact lane, 2026-10-09).
// The ground the battle dug (DST-04): the running gear stands on the craters' bowls and the heaps the simulation's hulls
// ride (the world's bound overlay as drawn, world/liveHeightFieldProxy.ts createDugHeightFieldProxy).
const hfDug = createDugHeightFieldProxy(hfProxy, () => currentWorld()?.groundOverlay?.() ?? null);
const groundSampler = createVehicleGroundSampler((x, z) => hfDug.getContactHeightAt(x, z), currentWorld);
// PERF (performance_budget r4): pool visuals are lazy — remember the sampler
// on the game state so ensureTankVisual applies it to visuals built later.
game._groundSampler = groundSampler;
for (const ent of game.allTanks) {
  if (ent.visual && ent.visual.setGroundSampler) ent.visual.setGroundSampler(groundSampler);
}

// De-track visuals: thrown/repaired track bands follow the module state.
bus.on('module:state', (payload) => {
  if (typeof payload !== 'object' || payload === null) return;
  const moduleId = Reflect.get(payload, 'module');
  const entityId = Reflect.get(payload, 'id');
  const state = Reflect.get(payload, 'state');
  if (typeof moduleId !== 'string' || typeof entityId !== 'string' || (state !== 'ok' && state !== 'yellow' && state !== 'red')) return;
  const tank = game.tankById.get(entityId);
  if (moduleId === 'trackL' || moduleId === 'trackR') tank?.visual?.setTrackState?.(moduleId, state === 'red');
  else tank?.visual?.setWeaponModuleState?.(moduleId, state);
});

// --- garage stage (12 m disc pad + 2 integration-owned spotlights) -----------
// Garage environments live at an isolated zero-height service coordinate.
// They never inherit the active battlefield's terrain, collision, or services.
GARAGE_POS.y = 0;
let selectedGarageVariantId = loadGarageVariantId();
const { stage: garageStage, dressing: garageDressing } = await bootStage('garage', async () => {
  // (2026-10-26, the boot census) the stage a section at a time under the boot screen (one task of 120 ms on a cold
  // desktop, 604 ms on the 4x phone), at the vehicle stage's cadence
  const stageSteps = createGarageStageSteps(
    engineCtx,
    GARAGE_POS,
    selectedGarageVariantId,
    () => invalidateGaragePresentation(),
    whenBootSettled,
  );
  const stageYield = createOpaqueLoadingYielder(12, 80);
  let gs: ReturnType<typeof createGarageStage>;
  for (;;) {
    const step = stageSteps.next();
    if (step.done) { gs = step.value; break; }
    await stageYield();
  }
  scene.add(gs.group);
  const gd = createGarageDressingAccess(engineCtx, GARAGE_POS, selectedGarageVariantId);
  scene.add(gd.group);
  // The access owner contributes only the final fill light at boot, preserving
  // the compiled light signature. Its authored workshop module and geometry
  // stream after readiness in the same quiet slices used by later repair bays.
  return { stage: gs, dressing: gd };
});
// 2026-10-20 (item/mp-rejoin-229; the MP-05 rejoin row): a tab reopened on the invite of the room whose match it last
// entered is on its way back into that match, and its battlefield was built only after the whole boot (15.5 s of the
// 227 rejoins' 37 s). The remembered round's battlefield now builds from here, beside the rest of the boot, on the
// room-intent lane at a covered load's pace (the boot screen covers this tab, and its battle needs the world before
// anything else); the battle entry promotes the build instead of starting it (worldBuildCoordinator). A wrong guess
// (the match ended, the room moved on) is a build the room's lobby state cancels. Phones keep their boot memory.
const returningRound = pendingRoomInvitePromise && getDeviceTier() !== 'mobile'
  ? pendingRoomInvitePromise.then((invite) => (invite ? rememberedRoundFor(invite.roomCode) : null), () => null)
  : null;
void returningRound?.then((round) => {
  if (round) prefetchWorld(round.terrainVariant ? `${round.mapId}#${round.terrainVariant}` : round.mapId, { intent: true, pace: 'loading' });
}).catch(() => { /* the entry builds it */ });
// FEEL r12: stable zero-work diagnostics facade. Explicit QA and automation
// acquire the exact existing HUD + telemetry owner near the ready boundary,
// after every dependency exists. Ordinary players never transfer either
// module and every frame call below remains a single null-checked no-op.
const perfHud = createPerfDiagnosticsAccess(async () => {
  const [{ createPerfHud }, { createDebugTelemetryOwner }] = await Promise.all([
    import('./ui/perfHud.ts'),
    import('./dev/debugTelemetry.ts'),
  ]);
  const telemetry = createDebugTelemetryOwner({
    renderer,
    scene,
    camera,
    lighting,
    post,
    game,
    getWorld: currentWorld,
    getNetworkTelemetry: () => {
      const v2 = multiplayerV2.current;
      return v2?.active ? { connected: v2.inMatch, rttMs: v2.networkStatus.rttMs ?? undefined } : null;
    },
    resolvePresetName,
    getDeviceTier,
  });
  const hudRuntime = createPerfHud({ renderer, game, trace: devTrace,
    readRenderFrame: () => post.lastCompletedFrame,
    // its close and Escape turn the saved setting off, as the Interface switch and F9 do
    onClose: () => {
      input.setSetting('showDebugHud', false);
      perfHud.setVisible(false);
    } });
  hudRuntime.setTelemetryProvider(telemetry.collect);
  devTrace?.configure({ getTelemetry: telemetry.collect });
  return { hud: hudRuntime, telemetry };
});
if (typeof window !== 'undefined') window.__PERF_HUD = perfHud;
// One typed phase owner keeps the Garage's authored neutral lighting exact,
// detaches its complete scene graph during battle, renews dressing GPU
// residency under the return veil, and re-seats every stage root together.
// Existing camera and pedestal owners remain the only pose solvers.
let garageEnvironmentPresentation: GarageEnvironmentPresentationRuntime;
// Before the showroom exists, the environment owner supplies one deterministic
// boot fallback. Afterwards every placement/variant/return transaction resets
// the same UI-aware showroom solver; no second camera path can win a frame.
let resetGarageShowroom: (() => boolean) | null = null;
const garagePhasePresentation = createGaragePhasePresentationRuntime({
  scene,
  stageRoot: garageStage.group,
  dressingRoot: garageDressing.group,
  garagePosition: GARAGE_POS,
  lighting,
  sunDirection: sky.sunDir,
  getGarageSkyConfig: () => {
    const variant = getGarageVariant(selectedGarageVariantId);
    return withGarageWeather(variant.mapId, getGarageSkyPreset(variant.mapId));
  },
  getBattleSkyConfig: () => withWorldCloudscape(currentWorld()?.config.sky ?? null),
  getGroundHeight: () => 0,
  getPhase: () => game.phase,
  // Desktop releases detached stage/workshop geometry while retaining textures
  // and programs. Constrained devices retain their stage-only release policy.
  // The existing covered return restores every evicted allocation.
  shouldReleaseGpuOnBattle: shouldReleaseInactivePhaseGpu,
  posePedestal: () => pedestal.poseCurrent(),
  poseCamera: () => {
    if (!resetGarageShowroom?.()) garageEnvironmentPresentation.poseCamera();
  },
  // Renderer ports are initialized before any covered return can run. The
  // engine owner splits restoration into paintable shadow/upload batches.
  restorePresentationGpu: async ({ resourcesReleased, isCurrent }) => {
    // (2026-10-26, the rooms A/B) every covered return links the Garage's programs before its frames: a hero a battle
    // borrowed comes back under the same root with other materials (its skin parked and put back, the battle build's
    // program-variant twins), and the frames that skipped this warm compiled them (Return to Garage: 349 + 249 ms)
    const programsNeedWarm = true;
    const dressingChunksFinished = await finishGarageDressingUnderCover(isCurrent);
    let late: { baseline: Set<ReceiptProgram>; watch: ProgramOriginWatch; dressingChunks: number; dressingBuilt: boolean } | null = null;
    let receipt: GarageGpuRestoreReceipt;
    try {
      receipt = await restoreGarageGpuPipeline({
        renderer,
        scene,
        camera,
        lighting,
        forwardPrograms: forwardProgramWarm,
        post,
        simDt: SIM_DT,
        resourcesReleased,
        programsNeedWarm,
        isCurrent,
        onProgramsWarmed: () => {
          late?.watch.stop();
          // (a late draw's object tagged +added: not in the scene when the warms ended; +hidden: in it, off its visible walk)
          const inScene = new Set<THREE.Object3D>(), shown = new Set<THREE.Object3D>();
          scene.traverse((object) => { inScene.add(object); });
          scene.traverseVisible((object) => { shown.add(object); });
          const annotate = (object: THREE.Object3D): string => (!inScene.has(object) ? ' +added' : !shown.has(object) ? ' +hidden' : '');
          late = { baseline: new Set(renderer.info.programs ?? []), watch: watchProgramOrigins(annotate),
            dressingChunks: dressingBuildTimings().length, dressingBuilt: garageDressing.isBuilt() };
        },
      });
    } catch (error) {
      (late as { watch: ProgramOriginWatch } | null)?.watch.stop();
      throw error;
    }
    if (dressingChunksFinished) receipt.dressingChunksFinished = dressingChunksFinished;
    if (late) void recordGarageLateLinks(receipt, late);
    return receipt;
  },
});
// campaign slice 5 (2026-09-14): the mission brief card for Frontline Assault sorties
const missionBrief = createMissionBrief();
let pendingCampaignOperationId: string | null = null;
// transitions-249: the Garage's light set is up; the kill-cam's replay lights leave the light count while it is
// (killcam.ts setBattleLights), so a return relinks nothing its boot linked
let garageLightsUp = true;
const setGarageSpots = (active: boolean): void => {
  if (active) { battleAtmosphere.reset(); nightLighting.reset(); frontline.reset(); mapAmbience.reset(); missionBrief.hide(); }
  garagePhasePresentation.setActive(active);
  garageLightsUp = active;
  killcamAccess.current?.setBattleLights(!active);
};
const setGarageSunTrim = (active: boolean): void => {
  // Network activation follows covered weather preparation. It must not
  // replace the match's moonlight with the selected Garage's daylight.
  if (!active && battleAtmosphere.current?.weather) return;
  garagePhasePresentation.setSunTrim(active);
};
const placeGarage = garagePhasePresentation.place;
garageEnvironmentPresentation = createGarageEnvironmentPresentationRuntime({
  garagePosition: GARAGE_POS,
  getSelectedVariantId: () => selectedGarageVariantId,
  setWorldDormant,
  applySkyPreset: () => {
    battleAtmosphere.reset();
    nightLighting.reset();
    frontline.reset();
    mapAmbience.reset();
    const variant = getGarageVariant(selectedGarageVariantId);
    // (2026-10-15, the SKY lane) the overcast battlefields' yards under the Garage's fair weather (garageWeather.ts)
    sky.applyPresentationPreset(withGarageWeather(variant.mapId, getGarageSkyPreset(variant.mapId)), scene);
    worldRuntime.invalidateSkyPresentation();
    baseFogDensity = scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0;
  },
  placeGarage,
  setGarageSunTrim,
  invalidatePresentation: invalidateGaragePresentation,
  setCameraPose: (position, target, fovDegrees) => {
    rig.setExternalPose(position, target, fovDegrees);
  },
});

// The repair bays and component displays remain normal garage content, but
// their complete visual stream is owned by a typed quiet-window scheduler.
const requestQuietIdle = (callback: IdleRequestCallback) => {
  if (window.requestIdleCallback) return window.requestIdleCallback(callback);
  return setTimeout(callback, 800);
};
const garageDressingScheduler = createGarageDressingScheduler({
  dressing: garageDressing,
  getPhase: () => game.phase,
  isTransitionActive: () => transition.active,
  isBattleEntryPending: () => battleEntryLifecycle.pending
    || battleEntryLifecycle.renderingCovered || battleLoad.covering,
  requestIdle: (callback) => requestQuietIdle(callback),
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  onVisualChange: () => invalidateGaragePresentation(),
  // INFRA-P11: failures back off and stop; a removed hashed chunk (this tab outlived its deployment)
  // surfaces the inline watchdog's reload action instead of retrying.
  classifyFailure: (error) => classifyChunkFailure(error),
  onChunkMissing: () => window.__COT_BOOT_RECOVERY?.showRetry?.('module'),
});
const scheduleGarageDressingBuild = garageDressingScheduler.schedule;

// Explicit Battle hover/focus and the covered roster handoff share one
// lifecycle owner. Passive Garage dwell is deliberately not Battle intent.
// Keeping the policy here used to expose
// several independent timers/generations in the composition root and made a
// Random-map hover race the eventual click. The typed runtime preserves the
// exact loaders and visuals while owning their ordering and cancellation.
const battleIntent = createBattleIntentRuntime({
  getBattleCount: () => game.battleCount,
  resolveMapId: (mapId, previousMapId) => resolveMapId(mapId, Math.random, previousMapId),
  loadWorldModule,
  prefetchWorld,
  ensureTankBuilders,
  // the hover prefetch plans the battle the garage's mode would field (TEAM NATIONS included), as the loading plan does
  planRoster: (specId) => {
    const plan = soloRosterPlan(garagePreviewMode, null, true);
    return planBattleParticipantIds(game, specId, true, plan.nations, plan.slots, plan.formationLead, plan.national)
      .filter(id => garagePreviewMode !== 'ac130' || id !== specId);
  },
  getSpec,
  prebakeSharedTextures,
  createBudgetYield: createFrameBudgetYielder,
  anisotropy: engineCtx.anisotropy ?? 4,
  setCamoBiome,
  clearCamoOverrides,
  setCamoOverride,
  applyCamoPatterns: applyCamoPatternsChunked,
  preloadBattleVisuals: () => battleVisualStreamerAccess.preload(),
  preloadAudio: () => audio.preload(),
  preloadSettings: () => settings.preload(),
  preloadArmorOverlay: () => armorAimOverlay.preload(),
  preloadBattleHud: () => ensureBattleHud(),
  preloadTouchControls: () => ensureTouchControls(),
  // the quick battle's authority (soloAuthorityFor): by default (261) the solo sim Worker, whose chunk and battlefield the
  // intent prepares; under ?soloAuthority=host a local host, through the network composition (mp/session/soloHostEntry.ts),
  // whose host thread it prepares; on the page (?soloAuthority=page, the mobile tier) the page's own solo alone
  preloadSoloBattle: () => {
    const { authority } = soloAuthorityFor('standard');
    if (authority === 'host') return Promise.all([preloadSoloBattleRuntime(), multiplayerV2.preload(), prepareSoloHost()]);
    // (the solo sim Worker's chunk, and a Worker building the selected battlefield ahead of the press)
    if (authority === 'worker') return Promise.all([preloadSoloBattleRuntime(), soloSim.preload(), prepareSoloSimWorker()]);
    return preloadSoloBattleRuntime();
  },
  preloadBattleClient: () => preloadBattleClientRuntime(),
  preloadKillcam: () => preloadKillcamModule(),
  ensureFxRuntime,
  preloadMinimap: (mapId) => ensureBattleHud()
    .then(() => currentHud()?.preloadMinimapAsset(minimapAssetUrl(mapId))),
});

// Garage vehicle selection now crosses one typed lifecycle boundary. The
// runtime owns construction, shader submission, LRU residency, convergence,
// and visual handoff; main owns only the player's requested spec.
const pedestal = createGaragePedestalRuntime({
  scene,
  garagePosition: GARAGE_POS,
  podiumTopY: GARAGE_PODIUM_TOP_Y_M,
  trackAxisYawRad: GARAGE_TRACK_AXIS_YAW_RAD,
  residentLimit: residentLimits.pedestalVisuals,
  anisotropy: engineCtx.anisotropy ?? 4,
  createVisual: (specId, options) => createTank(specId, engineCtx, options),
  // stage 2b: the pedestal's stepped builds plan their decoration in the decor worker (it awaits the waits)
  createVisualSteps: (specId, options) => createTankSteps(specId, engineCtx, { ...options, decorPlanner: offThreadDecorPlanner() ?? undefined }),
  getSpec,
  ensureTankBuilder,
  ensureTankBuilders,
  prebakeSharedTextures,
  discardSharedTextures: discardPrebakedSharedTextures,
  createBudgetYield: createFrameBudgetYielder,
  // forwardProgramWarm is initialized before the first pedestal warm is
  // invoked; the closure keeps this early lifecycle declaration independent
  // of the later renderer-target owner.
  // transitions-249: a hero adopted back from a battle first drops the battle's disarmed burn hooks, so its Garage skin
  // compiles the chain the Garage linked (a fresh build has none)
  prepareVisual: (visual) => {
    (visual as { releaseBurnHooks?(): void }).releaseBurnHooks?.();
    prepareGarageTankEnergyVisual(visual.root, getSpec(visual.specId).dims);
  },
  // (the time-to-battle lane, 2026-10-08) the dormant skin ends where the hero becomes the battle's, on every entry path
  releaseVisual: (visual) => parkGarageTankEnergyVisual(visual.root),
  compilePrograms: (root) => forwardProgramWarm.compile(root),
  // FSP-01: strict first-use preparation (submission, readiness polling,
  // uniform reflection) of the parked hero's forward programs against the
  // real scene target, so the reveal frame never blocks on a pending link.
  prepareProgramSteps: (root, timing) => forwardProgramWarm.prepareSceneSteps({
    visibleRoot: root, strict: true, sliceMs: 4, timing,
  }),
  nextFrame,
  // click-perf-244: a roster press paints before an uncached hero's build starts
  waitForPaint: nextPaintFrame,
  getDeviceTier,
  getPhase: () => game.phase,
  isBootComplete: () => bootComplete,
  getSelectedId: () => selectedVehicle.id,
  getNeighborIds: () => garage?.getNeighborIds?.(2) || [],
  // FSP-01 R2: the two adjacent cards are built ahead in the quiet window.
  getSpeculativeIds: () => garage?.getNeighborIds?.(1) || [],
  getBattlePlayer: () => game.player,
  getBattleEntity: (specId) => game.tankById.get(specId),
  groundSampler,
  scheduleDelay: (callback, delayMs) => setTimeout(callback, delayMs),
  acquireBackgroundWork: (kind, stillValid) =>
    garageIdleWorkCoordinator.acquire(kind, stillValid),
  invalidatePresentation: () => invalidateGaragePresentation(),
  debugTarget: typeof window !== 'undefined' ? window : null,
});

// A press paints its own interface first; the Garage scene's activity frames (and their shadow refresh) start one
// paint later (click-perf-244: every Garage press's paint carried a full scene render). The dressing and preload pauses
// still start at the press. Wheel and resize move the view itself, so they wake it at once.
let garageActivityAfterPaint = false;
const noteGarageViewActivity = () => {
  if (game.phase !== 'garage') return;
  invalidateGaragePresentation();
  garageDressingScheduler.noteActivity();
  pedestal.invalidatePreload();
};
const noteGarageActivity = () => {
  if (game.phase !== 'garage') return;
  garageDressingScheduler.noteActivity();
  pedestal.invalidatePreload();
  if (garageActivityAfterPaint) return;
  garageActivityAfterPaint = true;
  void nextPaintFrame().then(() => {
    garageActivityAfterPaint = false;
    invalidateGaragePresentation(); // outside the Garage it only marks the return dirty
  });
};
// Resize can arrive without pointer input (split view, orientation, browser
// chrome collapse). Treat it as presentation activity so the new viewport is
// painted immediately instead of waiting for the five-second safety frame.
for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart', 'resize']) {
  window.addEventListener(type, type === 'wheel' || type === 'resize' ? noteGarageViewActivity : noteGarageActivity,
    { capture: true, passive: true });
}
// The garage hero uses the dedicated close-up preview tier. A 2048²/1024²
// repaint was visually redundant at showroom distance and added a large cold
// boot task (or, when deferred, an equally disruptive post-ready stall).
// Gallery inspection and battle-player paths still request their own authored
// quality tiers; this changes only the garage presentation cache.
// Sniper close-quarters fill (gameplay_feel r1): with the camera at the gun
// trunnion, aiming into nearby shadowed/backfacing geometry (a bush wall, a
// building 5-10 m out) rendered a 100% black scope — zero feedback about the
// blockage. A small camera-riding point light, active only in SNIPER and only
// when the server-aim hit is CLOSE, keeps the obstacle readable exactly like
// WoT's scope does. Range-limited (18 m, quadratic decay) so it can never
// relight the midfield; intensity eases in below ~20 m aim distance.
// (2026-10-15, the perf lane) Created here, before the hero's build, so the garage's light set is complete when its
// programs are submitted below; the camera rig is declared further down and read only in frames (update()).
const sniperFill = createSniperFillRuntime(scene, camera, {
  get mode() { return rig.mode; },
  get aimDist() { return rig.aimDist; },
});
// 2026-10-15 (the perf lane): the garage scene's programs go to the driver's parallel compile before the hero's build,
// so they link while it runs. The 10-15 boot profile (Verdant, load ~165): the first live garage frame waited 1.2 s in
// getUniforms for links (0.49 s on Sept 30), right after a 1.6 s hero build (the m1a3's suit). A plain render target
// gives the post target's program keys (linear output, no tone mapping); the light set is final here (the garage stage,
// its phase spots, the sniper fill above). The post stage's warm then finds them in three's cache and compiles the
// hero's own. Boot r9's compileAsync overlap targeted the canvas after the hero's build (the canvas keys, no overlap);
// this one has neither problem. ?bootprecompile=0 keeps the old order for the A/B; the receipt records both light sets.
// 2026-10-19 (the 229 perf pass): the fog first (ARCHITECTURE.md §4: applyFog before any compile). Applied after this
// submission, it re-keyed every fogged program (USE_FOG, FOG_EXP2) and the hero's warm below: 25 programs linked twice
// at boot, 2.1 MB of shader source (perf-boot 10-17).
sky.applyFog(scene);
const bootLightCount = (): number => { let n = 0; scene.traverseVisible((object) => { if ((object as THREE.Light).isLight) n++; }); return n; };
if (!STUDIO_BOOT_INTENT && !/[?&]bootprecompile=0(&|$)/.test(location.search)) {
  const probeTarget = new THREE.WebGLRenderTarget(1, 1);
  const previousTarget = renderer.getRenderTarget();
  const startedAt = performance.now();
  try {
    renderer.setRenderTarget(probeTarget);
    renderer.compile(scene, camera);
  } catch { /* the post stage's warm compiles them */ } finally {
    renderer.setRenderTarget(previousTarget);
    probeTarget.dispose();
  }
  BOOT_TIMINGS.earlyCompile = Math.round(performance.now() - startedAt);
  BOOT_TIMINGS.earlyCompileLights = bootLightCount();
}
await bootStage('vehicle', async () => {
  if (STUDIO_BOOT_INTENT) return;
  // The branded boot screen is opaque. Keep its animation painting at a
  // bounded cadence, but do not charge one entire display frame for every
  // procedural texture checkpoint in the selected hero's cold bake.
  const bootVehicleYield = createOpaqueLoadingYielder(12, 80);
  await pedestal.prepareInitial(selectedVehicle.id, {
    builderReady: bootSelectedBuilderP,
    yieldForBudget: bootVehicleYield,
  });
});
// LOADING PERF note (boot r9): a KHR_parallel_shader_compile overlap
// (renderer.compileAsync kicked here, awaited in the 'post' stage) was
// measured and REMOVED — headless/ANGLE A/B showed no repeatable win (the
// 'post' stage is dominated by the CSM cascade renders and the post-chain's
// own fullscreen-pass compiles, which compileAsync(scene, camera) does not
// cover), and compileAsync carries a known disposal race (camo_spotting r5).


// --- MAP-CONFIG WIRING: map switching --------------------------------------
function prepareBattleWorldServices(next = currentWorld()) {
  worldRuntime.prepareBattleServices(next);
}

function switchMap(mapId: string) {
  return worldRuntime.switchMap(mapId);
}

// Frontline Assault (2026-09-13): the selected mode decides the terrain build.
// A frontline battle carves its trench system into the height field, so the
// battle world is the map's 'assault-trenches' variant (its own cache entry);
// only covered battle loads take it (never the garage staging area, Studio or
// minimap captures), and the flag clears when the battle returns to the garage.
let pendingTerrainVariant: 'assault-trenches' | null = null;
function ensureWorld(
  mapId?: string | null,
  onProgress?: ((fraction: number, label: string) => void) | null,
  opts?: WorldActivationOptions | null,
) {
  // Every battle-context ensure (covered entry, then the battle owner's own
  // re-ensure) builds the variant; Studio and minimap captures (services off,
  // no covered atmosphere) and the garage staging area (switchMap) keep the
  // standard map.
  const battleContext = opts?.atmosphere === 'covered-battle' || opts?.services !== false;
  // an explicit variant (network rooms) wins; the solo entries leave theirs in pendingTerrainVariant
  const terrainVariant = opts?.terrainVariant ?? (pendingTerrainVariant && battleContext ? pendingTerrainVariant : null);
  return worldRuntime.ensure(mapId, onProgress, terrainVariant ? { ...(opts ?? {}), terrainVariant } : opts);
}

/**
 * GARAGE PERF (boot r8): make the battle world genuinely dormant while the
 * garage screen is up. Hiding the group drops its ~370 draw calls and 1.35 M
 * triangles from the main pass AND from every shadow cascade (three skips
 * invisible subtrees in the shadow render), and `worldDormant` also skips the
 * per-frame terrain-LOD / vegetation-wind / prop-animation update in tick().
 * The garage bay is fully sealed, so none of it was ever visible from there.
 * @param {boolean} on true = dormant (garage), false = live (battle/shots)
 */
function setWorldDormant(on: boolean) {
  worldRuntime.setDormant(on);
}

// hud_ui r6: live-scene handles for the minimap's one-time orthographic
// top-down capture (tanks hidden during the capture; ui falls back to the
// procedural cartography when absent).
function minimapSnapCtx() {
  return {
    renderer, scene,
    // Moving flags, caches and ownership colors belong to the live overlay,
    // never the retained terrain image.
    exclude: [matchModeWorld.root, ...(game.tanks || []).flatMap((tank) => (
      tank.visual ? [tank.visual.root] : []
    ))],
  };
}

// --- HUD / garage / panels ----------------------------------------------------
// boot r8: the minimap build (a real orthographic top-down capture of the
// battlefield) moved to activateWorld — the HUD is hidden in the garage, so
// nothing on the boot path can see it.
battleHudRuntime = createMainBattleHudRuntime({
  bus,
  engineContext: engineCtx,
  perfMeterEnabled: () => !!input.getSettings().showPerfMeter,
  directionalHitValuesEnabled: () => !!input.getSettings().showDirectionalHitValues,
  queueMinimap: () => { worldRuntime.queueMinimap(); },
});
async function ensureBattleHud() {
  if (!battleHudRuntime) throw new Error('battle HUD runtime is not initialized');
  // (2026-10-16, the perf lane) the mode objectives' presentation is its own chunk (matchModeWorldLazy.ts): every battle's
  // interface load (solo, network, debug) waits for it here, so its markers are in from the battle's first frame
  const [hud] = await Promise.all([battleHudRuntime.preload(), matchModeWorld.ready()]);
  return hud;
}
// Preserve the staged progress contract without transferring battle-only UI
// into a garage first visit. Battle intent/entry joins ensureBattleHud().
await bootStage('hud');

const garageMaps = [
  { id: 'random', name: t('map.random'), thumb: '', hero: '' },
  ...MAP_IDS.map((id) => ({
    id,
    name: getLocalizedMapName(id),
    thumb: MAP_THUMBS[id] || '',
    hero: MAP_HEROES[id] || '',
  })),
];
// Multiplayer (docs/MULTIPLAYER-V2.md §13.10, the cutover of 2026-09-29): the Play menu drives the room
// connection itself (src/mp/session/playMenuAdapter.ts, the room host from src/mp/session/endpoint.ts);
// the lobby's Garage presence loads with the menu and the battle composition loads on the first start,
// both behind explicit multiplayer intent, so the solo boot path never imports src/mp.
let multiplayerLobby: LobbyIntent | null = null;
const loadMultiplayerLobby = (): Promise<LobbyIntent> => import('./mp/session/lobbyIntent.ts').then(({ createLobbyIntent }) => {
  multiplayerLobby ??= createLobbyIntent({
    getMenu: () => playSurface.getMenuPromise(),
    setGarageStatus: (status) => garage.setRoomStatus(status),
    // Joined-room intent is stronger than browsing the picker but weaker than a round start: the
    // composition, the battle client, the visuals, the missing roster builders and the fixed map warm.
    preloader: {
      getGamePhase: () => game.phase,
      preloadPresentation: () => multiplayerV2.preload(),
      preloadVisuals: () => battleVisualStreamerAccess.preload(),
      preloadBattleModules: () => preloadBattleClientRuntime(),
      ensureTankBuilders,
      loadWorldModule,
      cancelBackgroundWorldBuildsExcept,
      prefetchWorld,
    },
  });
  return multiplayerLobby;
});
const multiplayerV2 = createCompositionAccess(loadMultiplayerV2Composition);
// Plan step 11 (2026-10-13): a hosting tab that closes, reloads or navigates away hands its match on at once instead of
// leaving its peers to the room's socket lease (the command leaves on the room socket inside the event).
window.addEventListener('pagehide', () => { multiplayerV2.current?.handOffHosting('pagehide'); });
// A free sortie on the solo sim Worker (RUST-ENGINE-DECISION §7; soloAuthorityFor): its own lazy chunk, loaded by the
// Battle intent and the sortie alone.
const soloSim = createCompositionAccess(loadSoloSimBattle);
/** A network match owns the battle frame: a round loading or live, or a sortie on the solo sim Worker. */
const networkMatchActive = (): boolean => !!multiplayerV2.current?.active || !!soloSim.current?.active;
/** The one network pump every phase shares. */
const networkPump = {
  pump(dtSeconds: number, nowMs: number): void {
    multiplayerV2.current?.pump(dtSeconds, nowMs);
    soloSim.current?.pump(dtSeconds, nowMs);
  },
};
const { loadPlayMenuModule } = createBattleModuleAccess();

const playSurface = createPlaySurfaceRuntime({
  // The lobby's Garage presence loads with the menu (both behind explicit multiplayer intent).
  loadMenuModule: () => Promise.all([loadPlayMenuModule(), loadMultiplayerLobby()]).then(([menu]) => menu),
  createMenuOptions: () => ({
      maps: garageMaps,
      vehicles: VISIBLE_TANK_IDS.map((id) => {
        const spec = getSpec(id);
        return { id, name: spec.name, tier: displayTier(id), nation: spec.nation };
      }),
      getSelection: () => ({
        specId: garage.getSelected(),
        mapId: garage.getSelectedMap(),
        equipment: loadSelectedEquipment(garage.getSelected(), getSpec(garage.getSelected())),
        consumables: loadConsumables(garage.getSelected(), consumableSpecFor(getSpec(garage.getSelected()))),
        camo: getMultiplayerCamoSelection(garage.getSelected()),
      }),
      getVehicleLoadout: (specId: string) => ({
        equipment: loadSelectedEquipment(specId, getSpec(specId)),
        consumables: loadConsumables(specId, consumableSpecFor(getSpec(specId))),
        camo: getMultiplayerCamoSelection(specId),
      }),
      isVehicleAllowed: (specId: string) => VISIBLE_TANK_IDS.includes(specId),
      getCamoName: (camo: string) => t(`camoPattern.${camo}`) || t('camoPattern.factory'),
      getVehicleName: (specId: string) => getSpec(specId).name,
      onReadyIntent: () => audio.prepare(),
      onNetworkStart: (request) => beginMultiplayerV2Battle(request),
      onLobbyChange: (context) => { multiplayerLobby?.handleLobbyChange(context); },
  }),
  getSelectedSpecId: () => garage.getSelected(),
  getSelectedMapId: () => garage.getSelectedMap(),
  startSolo: (request) => beginSoloBattle(request),
  preloadCommon: [
    ensureBattleHud,
    preloadFxModule,
    // killcam access is composed later in the battle-only section. Keep the
    // lazy port itself behind a closure so a pristine browser can finish the
    // composition root without touching its temporal-dead-zone binding.
    () => preloadKillcamModule(),
  ],
  preloadNetworkPresentation: () => Promise.all([
    multiplayerV2.preload(),
    preloadBattleClientRuntime(),
  ]),
});

// Battle entry owns the play modal's visibility. Every player-facing entry
// path emits this event, so first matches, retained-room rematches,
// and solo all dismiss the operation picker before the next painted frame.
// transitions-249: the hero's dormant Garage skin is parked (off its meshes, kept with its programs for the return's
// adoption) before the mode preview's clear, which leaves a parked skin alone
bus.on('ui:battleStart', () => {
  sceneWatchdogEntryGeneration++;
  if(pedestal.current)parkGarageTankEnergyVisual(pedestal.current.root);
  garageModePreview.clear();
  coveredBattleWatchdog = null;
  playSurface.hideForBattle();
});

let garagePreviewMode = 'standard';
const garageModePreview = createGarageModePreviewRuntime({
  load: () => import('./game/garageModePreview.ts').then(module => module.createGarageModePreview(engineCtx)),
  prepare: async (root, current) => {
    // Match the real Garage forward targets and light layers. A generic
    // composer compile can leave the revealed frame to link a new variant.
    const lateMask = 1 << LATE_FX_LAYER;
    const passes = post?.composer ? [
      { layerMask: camera.layers.mask & ~lateMask, target: post.sceneAA.sceneTarget },
      { layerMask: lateMask, target: post.lateFx.target },
    ] : undefined;
    await prepareGarageModePrograms(
      () => forwardProgramWarm.prepareSceneSteps({ visibleRoot: root, passes, strict: true, sliceMs: 4 }),
      () => current() && game.phase === 'garage',
      nextFrame,
    );
  },
  invalidate: () => invalidateGaragePresentation(),
  warn: error => console.error('[garage mode preview]', error),
});
const garagePreviewAnimated = () => garagePreviewMode === 'juggernaut' || garagePreviewMode === 'capture_the_flag' || garagePreviewMode === 'infected';

// The Garage's Studio button: the Studio access boundary's own open once it is wired below (a press before then does
// nothing, as an F8 then did)
let openStudio = (): void => {};
const garage: MainGarageRuntime = await bootStage('ui', () => createGarage({
  specs: VISIBLE_TANK_IDS.map(getSpec),
  bus,
  onGameModeSelect: mode => {
    garagePreviewMode = mode;
    if (['juggernaut', 'drone', 'capture_the_flag', 'infected'].includes(mode)) void garageModePreview.preload();
    invalidateGaragePresentation();
  },
  onGameModeIntent: () => { void garageModePreview.preload(); },
  onSelect: (specId: string) => {
    battleIntent.invalidateMapPlan();
    selectedVehicle.select(specId);
    pedestal.set(specId);
    applyCamoPatternsChunked({ priorityIds: [specId], onlySpecIds: [specId] })
      .then(() => invalidateGaragePresentation());
    multiplayerLobby?.syncSelection();
  },
  onBattle: (specId, mapId, options) => (
    beginBattleEntry(specId, mapId, options)
  ), // loading screen owns entry
  onPlayRequest: (request) => playSurface.open(request).catch((error) => {
    console.error('[play-menu] failed to open', error);
  }),
  onPlayModeIntent: playSurface.preload,
  onBattleIntent: (options) => {
    // A retained Solo button must not start competing map/roster preparation
    // while this player is already preparing an authoritative room.
    if (!multiplayerLobby?.prepareLobby()) battleIntent.preload(options);
  },
  onTankIntent: pedestal.preloadIntent,
  onOverlayChange: () => invalidateGaragePresentation(),
  actionKeyFor: (binding) => input.labelFor(input.getBinding(binding, 0)),
  onStudioIntent: preloadStudioIntent,
  onStudio: () => openStudio(),
  // MAP-CONFIG WIRING: every registered battlefield plus Random.
  maps: garageMaps,
  garageVariants: GARAGE_VARIANTS.map((variant) => ({
    ...variant,
    thumb: MAP_THUMBS[variant.mapId as keyof typeof MAP_THUMBS] || '',
    hero: MAP_HEROES[variant.mapId as keyof typeof MAP_HEROES] || '',
  })),
  selectedGarageVariantId,
  onGarageVariantMenuIntent: () => {
    // Opening the selector is a strong navigation intent. Warm one actual
    // outdoor pack behind the still-open menu so its shared shader/material
    // family and environment asset library cannot land on the first click.
    // Keep the bounded two-pack LRU contract: this is the first non-selected
    // outdoor choice, not an eager sweep across all nine environments.
    const previewWarmVariant = GARAGE_VARIANTS.find((variant) => (
      variant.id !== selectedGarageVariantId && variant.architecture !== 'field_shed'
    ));
    void Promise.all([
      garageStage.prepareSelector(),
      previewWarmVariant
        ? garageStage.prepareVariant(previewWarmVariant.id)
        : Promise.resolve(),
    ]).catch(() => undefined);
  },
  onGarageVariantIntent: (variantId: string) => {
    void garageStage.prepareVariant(variantId).catch(() => undefined);
  },
  onGarageVariantSelect: (variantId: string) => {
    selectedGarageVariantId = saveGarageVariantId(variantId);
    const variant = getGarageVariant(selectedGarageVariantId);
    garageStage.setVariant(selectedGarageVariantId);
    garageDressing.setVariant(selectedGarageVariantId);
    void garageEnvironmentPresentation.activate(variant.id);
    garageDressingScheduler.noteActivity();
    invalidateGaragePresentation();
  },
  // CAMO WIRING: per-tank paint picker — persists the choice and repaints the
  // shared albedo in place, so the pedestal tank updates immediately.
  camo: {
    // the try-on (INTERACTION-REDESIGN B): the hovered or focused paint on the hero, painted small and swapped in
    preview: (specId: string, patternId: string | null) => {
      const shown = pedestal.switchPending ? null : pedestal.current;
      camoTryOn.preview(shown && shown.specId === specId ? shown.root : null, patternId);
    },
    patterns: CAMO_CATALOG_PATTERN_IDS,
    // Read each pattern through t() so the active locale decides the displayed label (the previous
    // `...CAMO_PATTERN_LABEL` spread leaked English text into zh-CN for every service_* / sig_* pattern).
    // Round 31: the catalog now also carries the national colours and the generated authored paints, so the
    // map is built from the catalog ids instead of a hand-kept list — every id reads `camoPattern.<id>`.
    label: Object.fromEntries(CAMO_CATALOG_PATTERN_IDS.map((patternId) => [
      patternId, patternId === 'auto' ? t('garage.camo.auto') : t(`camoPattern.${patternId}`),
    ])),
    get: (specId: string) => getCamoSelection(specId),
    getCustom: (specId: string) => getCustomCamoSelection(specId),
    set: (specId: string, patternId: string) => {
      const shown = pedestal.switchPending ? null : pedestal.current;
      camoTryOn.wear(shown && shown.specId === specId ? shown.root : null, patternId);
      setCamoSelection(specId, patternId);
      // Keep the exact high-resolution paint, but yield the triggering UI
      // frame before a cold pattern bake instead of blocking the click; its
      // try-on tile stands in until the bake lands.
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [specId], onlySpecIds: [specId],
      }).then(() => camoTryOn.settle(patternId)).then(() => invalidateGaragePresentation());
      multiplayerLobby?.syncSelection();
    },
    // "Wear on every <nation> tank" (INTERACTION-REDESIGN B): one paint on many tanks; the shown hero bakes first
    setMany: (specIds: readonly string[], patternId: string) => {
      for (const id of specIds) setCamoSelection(id, patternId);
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [selectedVehicle.id], onlySpecIds: [...specIds],
      }).then(() => invalidateGaragePresentation());
      multiplayerLobby?.syncSelection();
    },
    setCustom: (specId, value) => {
      setCustomCamoSelection(specId, value);
      camoSweepP = applyCamoPatternsChunked({
        priorityIds: [specId], onlySpecIds: [specId],
      }).then(() => camoTryOn.settle('custom')).then(() => invalidateGaragePresentation());
      // Deliberately sends Factory: custom paint is local single-player only.
      multiplayerLobby?.syncSelection();
    },
  },
  // CAMO WIRING (r8): AUTO(map) tanks preview the pattern they will actually
  // wear on the highlighted battlefield. 'random' falls back to verdant
  // inside setCamoBiome; startBattle re-calls setCamoBiome(world.mapId) after
  // the roll, so battle state is always correct regardless.
  onMapSelect: (mapId: string) => {
    battleIntent.invalidateMapPlan();
    if (mapId !== 'random') worldRuntime.setPendingMapId(mapId);
    // 2026-10-12 (the perf stream): the loading screen's art for the chosen battlefield, fetched and decoded in idle time
    if (mapId !== 'random') preloadImageWhenIdle(battleBackdrop(mapId));
    // Guests can browse locally without changing the host's room map. Keep
    // that build alive until canonical room state accepts another map.
    // (2026-10-21, item/mp-rejoin-229) the boot's own selection keeps a returning tab's battlefield (garageBootDone)
    if (!multiplayerLobby?.prepareLobby() && garageBootDone) {
      cancelBackgroundWorldBuildsExcept(mapId === 'random' ? null : mapId);
    }
    setCamoBiome(mapId);
    // perf-r2f: chunked — the sync sweep froze the garage ~0.3-1.4 s PER
    // cached tank on a map-card click. The visible hero repaints in the
    // first slice; parked/roster entries follow one frame apart.
    applyCamoPatternsChunked({
      priorityIds: [selectedVehicle.id], onlySpecIds: [selectedVehicle.id],
    }).then(() => invalidateGaragePresentation());
    multiplayerLobby?.syncSelection();
  },
}));

// Stable read-only diagnostics plus an explicit QA switch hook. Workshop
// verification can enumerate every environment and measure its lazily built
// real-fleet exhibits without leaking that policy into the composition root.
window.__GARAGE_WORKSHOP = createGarageWorkshopDiagnostics({
  variants: GARAGE_VARIANTS,
  garage,
  dressing: garageDressing,
  stage: garageStage,
  pedestal,
  environment: garageEnvironmentPresentation,
  phase: garagePhasePresentation,
  renderer,
  garagePosition: GARAGE_POS,
  podiumTopYM: GARAGE_PODIUM_TOP_Y_M,
  getRetainedWorldMapId: () => currentWorld()?.mapId || null,
  invalidatePresentation: invalidateGaragePresentation,
  camera,
  canvas: renderer.domElement,
});

// PRE-BATTLE LOADING SCREEN (src/ui/battleLoad.ts): map art + both rosters +
// real build progress + countdown. Created here so its stylesheet/DOM is warm
// before the first BATTLE press.
const battleLoad = createBattleLoadScreen();
// 2026-10-13 (the perf stream): the Garage's decorative work (the camo picker's cold swatches) holds under the battle
// loader, so a battle's entry keeps the main thread for its world build
garage.setDecorativeWorkGate(() => battleLoad.covering);

// STATE TRANSITIONS (src/ui/transition.ts): the shared branded veil/loading
// screen every non-battle state swap passes through — garage↔studio (wired
// through the studio ctx below) and battle→garage. Headless probes never see
// it (navigator.webdriver ⇒ synchronous no-op, per the screenshot contract).
const transition = createTransition();

// --- audio --------------------------------------------------------------------
const audio = await bootStage('audio', () => {
  const a = createLazyAudio({ getMapId: () => game.phase === 'battle'
    ? game.mapId : currentWorld()?.mapId ?? game.mapId,
  getGameMode: () => game.gameMode,
  getObjectiveTeam: () => game.matchModeState?.perspectiveTeam ?? null,
  // Surface under each hull (track sounds), water depth and terrain occlusion.
  getTerrain: () => (currentWorld() ? hfProxy : null),
  // The world: the churches, belfries and campanile the bells ring from, and what each structure is built of.
  getWorld: currentWorld,
  // The crew's side counts in a network battle (last tank, last enemy, outnumbered): the lobby roster with the
  // authority's deaths, where a death is final; never the spotted list (2026-10-14). Solo: none (its list is the field).
  getTeamRoster: () => {
    if (!game.rosterTanks) return null;
    const mode = normalizeGameMode(game.gameMode);
    return deathsAreFinal(game.ruleset?.mode === mode ? game.ruleset : matchRulesetFor(mode)) ? game.rosterTanks : null;
  },
  // Each warmed hull's powertrain from its whole spec, as its rig will resolve it (an IFV's diesel turns on its role).
  getVehicleSpec: getSpec });
  a.bindBus(bus);
  return a;
});

// --- camera rig -----------------------------------------------------------------
// One typed owner resolves both the camera anchor and the articulated physical
// bore. Solo, private-room and diagnostic presentation therefore share the
// same reticle, obstruction and penetration contract.
let playerBattleActions: PlayerBattleActions | null = null;
// (2026-10-24, perf-245) a camera about to be thrown somewhere it has not drawn — a Watch hop, a spectate handover, the
// killcam's look at the attacker — warms that place on the way: the terrain stream aimed there, its view drawn
// offscreen a batch a frame (engine/cameraDestinationWarm.ts; mainFrameRuntime calls update on battle frames)
const cameraDestinationWarm = createCameraDestinationWarmer({
  renderer, scene, camera,
  samples: () => post.msaaSamples,
  setTerrainStreamFocus: (position) => currentWorld()?.setTerrainStreamFocus?.(position),
});
const prepareCameraDestination = (position: THREE.Vector3, lookAt: THREE.Vector3, durationS: number): void => {
  if (game.phase === 'battle') cameraDestinationWarm.prepare(position, lookAt, durationS);
};
const {
  battleClient: battleClientAccess,
  rig,
  targetVisible: playerTargetVisible,
} = createCombatAimComposition({
  camera,
  heightField: hfProxy,
  getGame: () => game,
  worldRaycast,
  getShellCards: () => playerBattleActions?.shellCards || [],
  getIsometricView: () => input.getSettings().isometricView,
  getCameraSettings: () => input.getSettings(),
  prepareDestination: prepareCameraDestination,
});
const {
  aimController,
  computeDispersionRadM,
  shotRecoilScale,
  tankPoseFromState,
  traceTank,
  resolveShellHit,
  createCombatState,
  createShell,
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
  mobileAutoAimCenter,
  pickMobileAutoAimTarget,
} = battleClientAccess;
const preloadBattleClientRuntime = battleClientAccess.preload;

// GARAGE SHOWROOM CAMERA: auto-framed hero pose + damped drag orbit
// (engine/cameraRig.ts createShowroomOrbit). This adapter owns the on/off
// latch, the canvas pointer wiring, and the per-frame pump — tick() runs it
// in the garage phase only, so shot staging ('shot') and battle keep their
// own camera owners. startBattle()/enterGarage() call stop()/start().
const showroom = createGarageShowroomRuntime({
  camera,
  rig,
  element: renderer.domElement,
  getSubject: () => pedestal.current?.root || null,
  getStageRect: () => (garage.getStageRect ? garage.getStageRect() : null),
  // Canonical front-right three-quarter camera: glacis toward the viewer,
  // bow and gun toward screen-left. All dimensions and camera math remain owned by the existing engine solver, which
  // frames the hero's own box, centred in the Garage's free stage (owner 10-25 via Main: "closer to center and showing
  // stuff off better"), easing from one hero to the next; this root supplies the scene anchors and a mode preview's
  // headroom (the flag, the drone over the tank).
  heroYawRad: GARAGE_CAMERA_AZIMUTH_RAD,
  heroPitchRad: GARAGE_CAMERA_PITCH_RAD,
  frameTopPadM: () => (garagePreviewMode === 'capture_the_flag' ? 2.6 : garagePreviewMode === 'drone' ? .7 : 0),
  keepRing: () => ({ x: GARAGE_POS.x, y: GARAGE_POS.y, z: GARAGE_POS.z,
    r: GARAGE_PLATFORM_GEOMETRY.baseRadiusM, h: GARAGE_PLATFORM_GEOMETRY.topYM }),
  getKeepRect: () => (garage.getRingRect ? garage.getRingRect() : null),
  // the tracks rest on the name line; photo mode's whole-screen stage centres the hero
  anchorFoot: () => !document.body.classList.contains('cot-photo-on'),
  floorY: () => GARAGE_POS.y,
});
resetGarageShowroom = () => showroom.reset();

// (the sniper close-quarters fill is created before the hero's build, with the boot's early program submission)

// --- KILL-CAM (src/game/killcam.ts) -----------------------------------------
// End-of-battle cinematic: slow-mo tracer replay of the killing shell + x-ray
// module breakdown. Capture hooks live in the KILL-CAM sections of state.ts
// (game.killcam); the camera is driven only via rig.setExternalPose.
const killcamAccess = createKillcamAccess({
  loadModule: () => import('./game/killcam.ts'),
  initialize: ({ createKillCam }) => {
    type KillcamDependencies = Parameters<typeof createKillCam>[0];
    const live = createKillCam(checkedIntegrationPort<KillcamDependencies>({
      scene, camera, rig, heightField: hfProxy, getPlayer: () => game.player,
      getGame: () => game,
      isBattleEntryCovered: () => battleEntryLifecycle.renderingCovered || battleLoad.covering,
      getEntity: (id: string) => game.tankById.get(id),
      getWorld: currentWorld, // r6: flight-cam LOS solve (foliage/terrain/props)
      // Replay impact uses the real pooled destruction effects.
      getFx: () => fxRuntimeAccess.current,
      prepareDestination: prepareCameraDestination, // perf-245: the attacker's surroundings warmed as the replay opens
      battleLightsActive: () => !garageLightsUp,
    }, 'killcam', ['getPlayer', 'getGame', 'isBattleEntryCovered', 'getEntity', 'getWorld', 'getFx', 'prepareDestination',
      'battleLightsActive']));
    live.bindBus(bus);
    // Solo fixed-step capture gets the direct implementation after entry;
    // main/debug consumers keep the stable access facade below.
    game.killcam = live;
    return live;
  },
});
const killcam = killcamAccess.presentation;
const preloadKillcamModule = killcamAccess.preloadModule;
const ensureKillcamRuntime = killcamAccess.ensureRuntime;
game.killcam = killcam;

/**
 * KILL-CAM: hide/show the battle HUD around a replay WITHOUT hud.setMode —
 * the hidden→battle mode round-trip resets the shot-info session stats, and
 * the end-of-battle report must survive the cinematic. The stats card lives
 * outside hud.root, so it gets its own visibility veil.
 * @param {boolean} on veiled (replay running)
 */
function veilHud(on: boolean) {
  // Studio and garage are valid before the battle-only HUD graph exists.
  battleHudRuntime?.veil(on);
}

// Discrete shell, ERA, camera-recoil, prop and Garage-residency reactions have
// one typed owner. Its callbacks resolve the late network session lazily, so
// the pristine composition root keeps the existing startup order.
createCombatFeedbackRuntime({
  bus,
  game,
  rig,
  getFx: () => fxRuntimeAccess.current,
  hasNetworkMatch: networkMatchActive,
  shotRecoilScale,
  setDestroyedEventSink,
  trimGarageTanks: (capacity: number) => pedestal.trim(capacity),
  getDeviceTier,
});

// High-zoom de-fog (WoT sniper behavior): remember the base density so the
// render loop can scale it by FOV without mutating the sky's baseline.
let baseFogDensity = scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0;
let battleWatchdogRadianceScale = 1;
const battleAtmosphere = createBattleAtmosphereAccess(() => ({
  getGameMode: () => game.phase === 'studio' ? 'standard' : game.gameMode,
  getWorldRoot: () => currentWorld()?.group ?? null,
  // 2026-10-01 (engine/lightModel.ts): the vehicles' readability lift follows the applied light
  getLightReadability: () => (scene.userData.lightModel as { vehicleReadability?: number } | undefined)?.vehicleReadability ?? 1,
  // 2026-10-08 (the nightsky lane): the far panorama re-bakes under the applied light inside the covered prepare
  getRenderer: () => renderer,
  getAuthoredPreset: () => {
    const config: MapCompositionConfig | undefined = currentWorld()?.config;
    if (!config) return {};
    const sky = config.sky ?? {};
    // round 71: the map's authored cloudscape (its `clouds` block) rides with its sky block so the volumetric
    // layer derives per map (cloudPresets.ts); the sky block itself stays byte-identical to the Garage's copy
    return { ...sky, ...(config.clouds ? { cloudscape: config.clouds } : {}), ...sceneWindOf(config as { id?: string }) };
  },
  applyPreset: (preset) => {
    sky.applyPreset(preset, scene);
    lighting.setSun(sky.sunDir, preset);
    battleWatchdogRadianceScale = preset.skyIntensity ?? 1;
    baseFogDensity = scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0;
    worldRuntime.markEnvironmentPrepared(currentWorld());
  },
}));
// frontline atmosphere 2026-09-12: the distant front behind the enemy side
// (smoke columns, artillery flashes + rumble, flak, flyovers). Lazy like the
// weather owner; prepared behind the covered entry, reset with the Garage.
const frontline = createFrontlineAtmosphereAccess(() => ({
  parent: scene,
  camera,
  bus,
  setupMaterial: (material) => engineCtx.setupShadowMaterial(material),
  releaseMaterial: (material) => engineCtx.releaseShadowMaterial(material),
  getHeightField: () => currentWorld()?.heightField ?? null,
  getSpawns: () => currentWorld()?.spawnPoints ?? null,
}));
// 2026-10-22 (the owner: "add better map ambience like particles or leaves or petals ... depending on map"): what floats
// in each battlefield's air (world/mapAmbienceTable.ts). Lazy like the front; prepared behind the covered entry with the
// battle's time of day, reset with the Garage, drawn in the late-FX pass on the fx clock.
const mapAmbience = createMapAmbienceAccess(() => ({
  parent: scene,
  scene,
  getHeightAt: (x, z) => currentWorld()?.heightField?.getHeightAt?.(x, z) ?? null,
  getSunDirection: () => sky.sunDir,
  isSightView: () => rig.mode === 'SNIPER' && game.phase === 'battle',
  getTierScale: () => getPreset().ambience ?? 0,
}));
const battleAmbienceTime = () => battleAtmosphere.current?.weather?.timeOfDay ?? 'day';
/** A covered entry revealed before the player's top-down masks linked; the damage panel's retry ladder finishes them. */
function deferredPanelMasks(specId: string): void {
  console.warn(`[battle] top-down view of ${specId} still linking at reveal; the damage panel retries it`);
}
/** (battle-spikes-253) The panel's mask programs start linking when a covered warm starts (tankThumbs warmTopMaskPrograms). */
function kickPanelMaskPrograms(root: THREE.Object3D | null | undefined): void {
  if (!root) return;
  void import('./ui/tankThumbs.ts').then(({ warmTopMaskPrograms }) => { warmTopMaskPrograms(root); })
    .catch(() => { /* the panel's stage compiles them */ });
}
function currentSceneWatchdogOptions() {
  if (game.phase !== 'battle') return {};
  if (battleAtmosphere.current?.weather?.timeOfDay === 'night') return { nightRadianceScale: battleWatchdogRadianceScale };
  // 2026-10-09 (the MP-entry lane): a low sun or a closed deck draws the probe under the light model's metered ratio
  const lowLightScale = battleProbeRadianceScale(scene.userData.lightModel?.illuminance, EXPOSURE_REFERENCE_ILLUMINANCE);
  return lowLightScale === null ? {} : { nightRadianceScale: lowLightScale };
}
const nightLighting = createNightLightingAccess({
  scene,
  // desktop: both headlights of the player and of the nearest other vehicle plus two building lamps; mobile keeps
  // the two-spot / one-point budget (owner 2026-09-18: "lights seem to only come from one headlight")
  getBudget: () => getDeviceTier() === 'mobile' ? { spotLights: 2, pointLights: 1 } : { spotLights: 4, pointLights: 2 },
  getWorldRoot: () => currentWorld()?.group ?? null,
  // A network round publishes its complete actor registry here, including hidden
  // actors; game.tanks alone is only the currently visible network roster.
  getEntities: () => networkMatchActive() ? game.tankById.values() : game.tanks,
  getCameraPosition: () => camera.position,
  // (the looks lane, 228) a town's lamps light the street the camera looks down
  getCameraForward: () => camera.getWorldDirection(_nightCameraForward),
  isNight: () => battleAtmosphere.current?.weather?.timeOfDay === 'night',
  isBattlePresentation: () => game.phase !== 'garage' && !studio.active,
  isEntityVisible: (entity) => entity.networkVisible !== undefined ? entity.networkVisible
    : watchRevealsAll(game) || entity.team === (game.player?.team ?? 'player')
      || game.spotting?.isSpotted(entity.id, game.player?.team ?? 'player', game.player) === true,
});
const post = createPost(renderer, scene, camera);
// transitions-249: the scene probes (the black-world watchdogs) draw in the scene target's format, so the GPU pipelines
// they build are the frames' own (deviceDiag.ts)
setSceneProbeTargetSource(() => post.sceneAA.sceneTarget);
// (black-screen-228) the network entry arms the black-world guard through the engine context
(engineCtx as { post?: PostRuntime }).post = post;
// 2026-10-01 (engine/post.ts AERIAL_LAYER_H): the aerial haze is a layer over the battlefield's ground
post.setGroundHeightSource((x, z) => hfProxy.getHeightAt(x, z));
const viewport = createViewportRuntime({
  container,
  renderer,
  camera,
  post,
  lighting,
});
const forwardProgramWarm = createForwardProgramWarmOwner({
  renderer,
  scene,
  camera,
  getTarget: () => post?.composer?.renderTarget1 || null,
});
// perf-247: a Studio world submits each finished subsystem's forward programs while the rest of it builds (map.ts), so
// the GPU process links them beside the build's CPU work instead of under the first covered frame (5.7 s of link waits
// on the profile). Studio only: a battle's covered atmosphere must precede its program warm (worldActivationRuntime),
// and a background build behind the Garage presents nothing.
submitWorldPrograms = (root) => { if (game.phase === 'studio' && studioEarlyPrograms) forwardProgramWarm.compile(root); };
// Shader, FX, shadow, private-render-target, and deferred rollout warm state
// share one renderer-lifetime owner. Its lazy ports preserve the boot order:
// battle visuals and the frame owner may be declared later, but are only read
// behind covered Battle/Studio entry after the complete graph exists.
const combatWarmComposition = createCombatWarmComposition({
  game,
  renderer,
  scene,
  camera,
  post,
  lighting,
  battleWarm,
  forwardProgramWarm,
  getFx: requireFxRuntime,
  getWorld: currentWorld,
  getBattleVisuals: () => {
    if (!battleVisuals) throw new Error('battle visual streamer was not loaded');
    return battleVisuals;
  },
  getGeneration: () => battleWarmGeneration,
  setPending: (pending: boolean) => { battleWarmPending = pending; },
  prepareNextOpeningRoute: () => Boolean(prepareNextOpeningRoute(game)),
  ensureStagedVisuals: (count: number) => ensureStagedVisuals(game, count),
  prepareModeVisuals: () => battlePresentation.prepareModeVisuals(),
  prebakeBurntSteps,
  warmWreckTextures,
  createIsolatedForwardWarmBatches,
  scratch1: _v1,
  scratch2: _v2,
  scratch3: _v3,
  anisotropy: engineCtx.anisotropy ?? 4,
  noteFovPrimed: (fov: number) => mainFrame.noteFovPrimed(fov),
  simDt: SIM_DT,
  publishStudioTrace: (trace: RuntimeValue) => { window.__STUDIO_WARM = trace; },
  devTrace,
});
// (fx-ir-hull-heat-229) every shot heats its shooter's barrel in the heat lens, on the shot's simulation time
bus.on('shell:fired', (payload) => {
  if (typeof payload !== 'object' || payload === null) return;
  combatWarmComposition.thermalVehicles.noteShot(String(Reflect.get(payload, 'shooterId') ?? ''),
    Number(Reflect.get(payload, 'timeS')), Number(Reflect.get(payload, 'caliberMm')));
});
const {
  combatWarm,
  warmRender,
  deploymentShadowWarm,
} = combatWarmComposition;
const cancelDeferredCombatWarm = combatWarmComposition.cancelDeferred;
const scheduleDeferredCombatWarm = combatWarmComposition.scheduleDeferred;
// WebGL context restoration is recoverable in place. Three rebuilds its GL
// state first; we then apply temporary device-appropriate relief, trim optional
// residents, resize the post targets and redraw the shadow set. The sim stays
// frozen while the graphics device is unavailable instead of racing ahead
// behind a blocking warning or throwing away the battle with a page reload.
renderer.userData.contextRecovery = {
  onLost() {
    graphicsContextLost = true;
    garagePhasePresentation.invalidateGpu();
    post.setAdaptiveSuspended(true);
  },
  async onRestored() {
    const restoredInfo = renderer.info;
    const isCurrentRestoration = () => renderer.info === restoredInfo && !renderer.getContext().isContextLost();
    // CPU depth-texture objects survive a WebGL reset; their previous contents
    // do not. Invalidate them before any dormant Garage can accept a partial warm.
    lighting.invalidateShadowMaps();
    // A restored WebGL context has no linked programs or uploaded buffers,
    // even though the JavaScript-side warm receipts survive. Invalidate every
    // renderer-lifetime combat latch so the next covered transition rebuilds
    // the exact production variants instead of trusting stale GPU state.
    combatWarmComposition.resetRendererWarmState();
    applyGraphicsRecovery();
    pedestal.trim(1);
    worldRuntime.enforceCacheBudget();
    await nextFrame();
    if (!isCurrentRestoration()) throw new Error('Graphics recovery was superseded by another context loss.');
    viewport.apply();
    post.resetAdaptiveResolution();
    // Render-target textures have no CPU image to re-upload after a reset.
    // Rebuild the current sky reflection before any restored material draws.
    sky.bakeEnvironment();
    lighting.update(true);
    if (game.phase === 'garage') {
      const recoveredReturn = await garageReturn.recoverAfterContextRestore(isCurrentRestoration);
      if (!isCurrentRestoration()) throw new Error('Graphics recovery was superseded by another context loss.');
      if (game.phase === 'garage') {
        if (!recoveredReturn) await garagePhasePresentation.restoreGpu();
        if (!isCurrentRestoration()) throw new Error('Graphics recovery was superseded by another context loss.');
        garagePresentationDirty = false;
      }
    }
    if (!isCurrentRestoration()) throw new Error('Graphics recovery was superseded by another context loss.');
    // Confirm a complete scene before removing the cover or advancing the sim.
    post.render(0);
    if (!isCurrentRestoration()) throw new Error('Graphics recovery was superseded by another context loss.');
    graphicsContextLost = false;
    post.setAdaptiveSuspended(false);
    // Some mobile browsers discard the outstanding rAF when the WebGL device
    // is reclaimed. The loop's queued latch would then stay true forever even
    // though no callback exists. Cancel/re-arm explicitly after restoration;
    // restartRaf() owns the handle so a browser that retained it cannot create
    // a duplicate simulation/render loop.
    rearmRafAfterContext();
    return true;
  },
};
// Pixel-density state is workload-local. A pressured battle must never carry
// a reduced render scale back into the garage, and a fresh battle gets a new
// measured baseline instead of inheriting showroom cadence.
bus.on('phase:change', () => post.resetAdaptiveResolution());
// Map construction, roster painting and shader compilation intentionally
// create long frames behind an opaque screen. They are loading throughput,
// not gameplay performance, so exclude them from the live quality governor.
bus.on('ui:battleStart', () => post.setAdaptiveSuspended(true));

// ---------------------------------------------------------------------------
// End-of-battle overlay (integration-owned DOM)
// ---------------------------------------------------------------------------
const endOverlay = createEndOverlayRuntime({
  bus,
  onReturnToGarage: () => leaveBattleToGarage(),
});

// battle_hud r1 (owner): the always-visible LEAVE BATTLE button is GONE — a
// persistent exit control is not WoT battle chrome and it shadowed the
// minimap corner. Leaving stays one Esc away: the settings overlay (Esc, or
// the touch HUD's menu button) carries its red 'Leave Battle' row in every
// battle/spectator/end state (settings.ts canLeaveBattle/onLeaveBattle,
// wired below), and the end-of-battle overlay keeps RETURN TO GARAGE.

// ---------------------------------------------------------------------------
// Input — routed through the rebindable action layer (src/game/input.ts) and
// the settings panel (src/ui/settings.ts). Zoom is the zoomIn/zoomOut actions (wheel by default).
// ---------------------------------------------------------------------------
const debugFlags: { forceFire: boolean; lastEndFlow?: RuntimeValue } = { forceFire: false };
// Battle endings (owner 2026-09-25): the director (src/game/battleEnding.ts) chooses every verdict's close —
// the final-kill replay through the killcam, or a camera beat (time's up, objective orbit, wreck orbit,
// pull-back) posed through the rig by the ending camera; 'ending:begin' / 'ending:done' gate the report,
// flash the HUD clock and carry the caption.
const battleEndingCamera = createBattleEndingCamera({
  rig,
  camera,
  getPlayerYaw: () => game.player?.state?.yaw ?? null,
  getHeightAt: (x: number, z: number) => hfProxy.getHeightAt(x, z),
});
const battleResultPresentation = createBattleResultPresentationRuntime({
  game,
  killcam,
  rig,
  veilHud,
  showEndOverlay: endOverlay.show,
  emitPresented: (result: RuntimeValue) => bus.emit('battle:presented', { result }),
  exitPointerLock: () => { document.exitPointerLock?.(); },
  recordFlow: (receipt: RuntimeValue) => { debugFlags.lastEndFlow = receipt; },
  ending: {
    camera: battleEndingCamera,
    modeState: () => game.matchModeState,
    emitBeat: (phase, plan) => bus.emit(phase === 'begin' ? 'ending:begin' : 'ending:done', {
      beat: plan.beat,
      durationS: plan.durationS,
      clockFlash: plan.clockFlash,
      captionKey: plan.caption?.key ?? null,
      captionValues: plan.caption?.values ?? null,
    }),
  },
});
for (const type of ['mode:flag_captured', 'mode:zone_captured', 'mode:goal_scored', 'mode:wave_started', 'tank:destroyed']) {
  bus.on(type, (payload) => battleResultPresentation.observe(type, payload));
}
const battlePhase = createBattlePhasePolicy({
  getPhase: () => game.phase,
  hasResult: () => !!game.result,
  // a watcher flying or riding along owns the view as a player does (settings on Esc, the pointer recaptured)
  hasControllablePlayer: () => !!(
    game.player?.combat && !game.player.combat.destroyed
  ) || !!watchOwner.current?.controller.active,
  isKillcamActive: () => killcam.isActive(),
  isBattleLoadVisible: () => !!document.querySelector('.cot-bl.on'),
});

const input = createInput({ lockElement: renderer.domElement });
bus.on('ui:debugHud', (payload) => {
  const enabled = typeof payload === 'object' && payload !== null
    && Reflect.get(payload, 'on') === true;
  perfHud.setVisible(enabled);
});
const armorAimOverlay = createArmorAimOverlayAccess();
// transitions-249: wait, between tasks, until the renderer's queued program links are in, so the draw that binds them
// does not wait inside one task. Bounded: a link still pending at the deadline waits at its draw, as before.
// (battle-spikes-253) One completion query a poll, and only once the GPU caught up to the previous poll (gpuCatchUp.ts):
// asking every pending program each poll was a synchronous round trip apiece behind the GPU's queue. Linked programs
// answer from three's cache; a last full check covers a program the live array dropped under the cursor.
const awaitRendererProgramLinks = async (yieldForBudget: (force?: boolean) => Promise<void> | undefined): Promise<void> => {
  const deadline = performance.now() + 12_000;
  const programs = renderer.info.programs as unknown as Array<{ isReady?(): boolean }> | null;
  if (!programs) return;
  const gate = createGpuCatchUpGate(renderer.getContext());
  let cursor = 0;
  try {
    while (performance.now() < deadline) {
      if (gate.caughtUp()) {
        while (cursor < programs.length && programs[cursor].isReady?.() !== false) cursor++;
        if (cursor >= programs.length) {
          if (programs.every((program) => program.isReady?.() !== false)) return;
          cursor = 0;
        }
      }
      await yieldForBudget(true);
    }
  } finally { gate.dispose(); }
};
const battleVisualStreamerAccess = createBattleVisualStreamerAccess<MainGameState>({
  game,
  scene,
  renderer,
  anisotropy: engineCtx.anisotropy ?? 4,
  ensureTankBuilders,
  nextStagedBake,
  ensureStagedVisualsSteps,
  getSpec,
  prebakeSharedTextures,
  armorAimOverlay,
  // (265) the armour paint's panels bake at staging only while the overlay is on
  armorPanelsWanted: () => !!input.getSettings().armorAimOverlay,
  forwardProgramWarm,
  // (perf-245) a staged tank draws once offscreen, every mesh at once, whatever the warm camera frames
  drawWarm: (root) => {
    for (const _batch of createIsolatedForwardWarmBatches({ scene, root, warmRender, cohortSize: Infinity })) { /* one cohort */ }
  },
  // (battle-spikes-253) a stream's deferred draws: sixteen meshes a step, so no one task first-binds a whole tank's buffers
  drawWarmSteps: (root) => createIsolatedForwardWarmBatches({ scene, root, warmRender, cohortSize: 16 }),
  // transitions-249: a stream draws its staged tanks after every build, once the programs their compiles submitted have
  // linked between tasks
  awaitProgramLinks: awaitRendererProgramLinks,
  recordTiming(timing) {
    if (typeof window !== 'undefined') (window.__VISUAL_LOAD_TIMINGS ||= []).push(timing);
  },
  // (mode-sheen-perf-243) the mode's energy skin goes on before the staging's burn hook and program compile
  onVisualReady: (entity) => { nightLighting.appendEntity(entity); battlePresentation.prepareModeEnergy(entity); },
});
let battleVisuals: BattleVisualStreamer<MainEntity> | null = null;
async function ensureBattleVisualStreamer() {
  battleVisuals = await battleVisualStreamerAccess.preload();
  return battleVisuals;
}
// perf-246: bound once the Garage return owner exists (below); settings is composed first.
let garageAwaitingHandoff = (): boolean => false;
const settings = createSettingsAccess({
  input,
  bus,
  // A dead player is spectating even though the team battle continues. This
  // keeps pointer-unlock from opening settings over the death camera.
  isBattleActive: battlePhase.canOpenBattleSettings,
  isSpectating: () => !!killcam.spectate?.active,
  // perf-246: a Garage prepared behind the battle report is still the battle's end to the player: its Esc menu
  // leaves (the handoff) and the Garage gear stays hidden until the handoff.
  canLeaveBattle: () => battlePhase.canLeaveBattle() || garageAwaitingHandoff(),
  onLeaveBattle: () => leaveBattleToGarage(),
  gearVisible: () => battlePhase.isGarage() && !garageAwaitingHandoff(),
  // PAUSE: the overlay shows its PAUSED treatment exactly when opening it
  // freezes a live battle — same predicate the tick() pause gate derives its
  // livePaused from (kill-cam replays close the panel themselves; the end
  // overlay keeps the old non-paused Esc behavior).
  isGamePaused: battlePhase.isPauseEligible,
});
garage.attachSettingsControl(settings.gear);
// the Deploy screen's bot tier is the settings' own (the next battle's), so both pickers read one value
garage.attachDifficulty({ get: () => input.getSettings().aiDifficulty, set: (tier) => input.setSetting('aiDifficulty', tier) });
// the Garage's photo mode (garage.ts attachPhoto): the stage, the showroom orbit held for framing, and the renderer, post
// chain and lighting its lazy module draws a still with
garage.attachPhoto({
  stage: renderer.domElement,
  showroom,
  still: { renderer, camera, post, lighting, size: () => renderer.getSize(new THREE.Vector2()) },
});
const mobileBattleInput = createMobileBattleInputAccess<MainEntity>({
  input,
  bus,
  camera,
  isBattleActive: battlePhase.isBattle,
  openSettings: () => settings.open(),
  setSoundMuted: (muted) => audio.mute(muted),
  isSniper: () => rig.mode === 'SNIPER',
  getPhase: () => game.phase,
  getTanks: () => game.tanks,
  getPlayer: () => game.player,
  getTankById: (id) => game.tankById.get(id) || null,
  isVisible: playerTargetVisible,
  pickTarget: pickMobileAutoAimTarget,
  targetCenter: mobileAutoAimCenter,
});
const ensureTouchControls = mobileBattleInput.preload;
// The frame scheduler is created before the lazy Studio access boundary below
// and may deliver its first callback immediately (especially after Vite HMR).
// Keep a fully initialized inert presentation in place until that boundary is
// wired so frame/dev-trace getters can never cross a temporal dead zone.
let studio: ReturnType<typeof createStudioAccess>['presentation'] = Object.freeze({
  active: false,
  tick(_deltaSeconds: number) {},
});
devTrace?.configure({
  input,
  getContext: () => ({
    paused: settings.isOpen(),
    killcam: killcam.isActive(),
    shotMode,
    studio: !!studio?.active,
    cameraMode: rig.mode,
    renderScale: post.dynScale,
  }),
});

// Pointer-lock denial, recovery gestures, the cursor-aim notice, and touch
// refresh now have one typed listener/timer owner outside the composition root.
createPointerLockFeedbackRuntime({
  input,
  bus,
  canvas: renderer.domElement,
  audioResume: () => audio.resume(),
  isBattleStageVisible: battlePhase.isBattleStageVisible,
  canRecapturePointer: () => battlePhase.canRecapturePointer({
    settingsOpen: settings.isOpen(),
    spectating: !!killcam.spectate?.active,
  }),
  ensureTouchControls,
});

// Shell inventory, consumable cooldowns, special actions, and the exact
// local-versus-network command split have one typed, renderer-free owner.
// Its ports are stable battle-client facades, so garage boot still transfers
// no combat implementation and input remains inert outside a live battle.
playerBattleActions = createPlayerBattleActions({
  game,
  bus,
  input,
  isSettingsOpen: () => settings.isOpen(),
  network: {
    isActive: networkMatchActive,
    queueConsumable: (slot) => { multiplayerV2.current?.queueConsumable(slot); soloSim.current?.queueConsumable(slot); },
    queueAction: (action) => { multiplayerV2.current?.queueAction(action); soloSim.current?.queueAction(action); },
  },
  rules: {
    selectShell: battleClientAccess.selectShell,
    repairAllModules: battleClientAccess.repairAllModules,
    magazineReloadDenialReason: battleClientAccess.magazineReloadDenialReason,
    startMagazineReload: battleClientAccess.startMagazineReload,
    activateSpecialAction: battleClientAccess.activateSpecialAction,
    guidedMissileSlot: battleClientAccess.guidedMissileSlot,
    specialActionKind: battleClientAccess.specialActionKind,
    hasAmmunition: battleClientAccess.hasAmmunition,
    shellAmmunitionCapacity: battleClientAccess.shellAmmunitionCapacity,
    rulesetUnlimitedFor: battleClientAccess.rulesetUnlimitedFor,
    hasConsumableRule: battleClientAccess.hasConsumableRule,
    useSoloConsumable: battleClientAccess.useSoloConsumable,
    requestTankSelfRight: battleClientAccess.requestTankSelfRight,
    requestTankJump: battleClientAccess.requestTankJump,
  },
});
const playerFrameInput = createPlayerFrameInput({
  input,
  hasAmmo: playerBattleActions.hasAmmo,
  forceFire: () => !!debugFlags.forceFire,
});
const battlePresentation = createBattlePresentationRuntime({
  game,
  camera,
  scene,
  battleClient: battleClientAccess,
  getFx: () => fxRuntimeAccess.current,
  getWorld: currentWorld,
  isNetworkMatchActive: networkMatchActive,
  getPedestalVisual: () => pedestal.current,
  isCinematicActive: () => rig.cinematicActive,
});
// The opaque deployment transition has one typed owner. main.ts coordinates
// acquisition and phase changes; this runtime owns the exact shader, shadow,
// terrain, FX and first-frame warm order plus cancellation/fallback policy.
const soloBattleDeployment = createSoloBattleDeploymentAccess({
  options: () => ({
    game,
    renderer,
    scene,
    camera,
    battleLoad,
    battleWarm,
    armorAimOverlay,
    forwardProgramWarm,
    combatWarm,
    post,
    lighting,
    createShell,
    getWorld: currentWorld,
    getBattleVisuals: () => {
      if (!battleVisuals) throw new Error('battle visual streamer was not loaded');
      return battleVisuals;
    },
    getFx: requireFxRuntime,
    getWarmRender: () => warmRender,
    getDeploymentShadowWarm: () => deploymentShadowWarm,
    getEntryLifecycle: () => battleEntryLifecycle,
    prepareRevealCamera: prepareBattleRevealCamera,
    kickPlayerPanel: () => {
      if (game.player?.aerial?.kind !== 'gunship') kickPanelMaskPrograms(game.player?.visual?.root);
    },
    preparePlayerPanel: async () => {
      const player = game.player;
      if (player?.aerial?.kind === 'gunship') return;
      const panel = currentDamagePanel();
      if (!player || !panel) throw new Error('Player damage panel was not prepared');
      // 2026-10-09 (the black-screen lane): a slow mask link never refuses the battle (damagePanelEntryMasks.ts)
      await prepareEntryPanelMasks(panel, player.spec, player.visual, deferredPanelMasks);
    },
    prepareAtmosphere: async () => {
      // the proving ground keeps its own light (sim/matchRuleset.ts PROVING_GROUND_RULES.timeOfDay)
      const provingTime = game.ruleset?.provingGround?.timeOfDay;
      await battleAtmosphere.prepare(game.battleCount, game.mapId, provingTime ? [provingTime] : battlePreferences.times);
      await frontline.prepare(game.battleCount, game.mapId);
      await mapAmbience.prepare(game.battleCount, game.mapId, battleAmbienceTime());
    },
    prepareNightLighting: () => nightLighting.prepare(),
    runSceneWatchdog: async (assertCurrent: () => void) => {
      assertCurrent();
      const run = coveredBattleWatchdog;
      coveredBattleWatchdog = null;
      // Keep the established webdriver opt-out; real covered controls own
      // exactly one request armed by startBattle, never a second delayed probe.
      if (navigator.webdriver) return;
      if (!run) throw new Error('Covered battle scene watchdog was not armed');
      const result = await run();
      assertCurrent();
      return result;
    },
    awaitProgramLinks: awaitRendererProgramLinks,
    getGeneration: () => battleWarmGeneration,
    advanceGeneration: () => ++battleWarmGeneration,
    setPending: (pending: boolean) => { battleWarmPending = pending; },
    setDestructionWarmed: combatWarmComposition.setDestructionWarmed,
    devTrace,
  }),
});
// The same persisted setting owns F9, the Interface switch and the panel's close. The lazy
// facade makes this available in production without adding ordinary-player
// transfer or per-frame work.
input.onAction('perfHud', () => {
  // the diagnostics stand aside while the Studio is open, its keys and panel its own (F8 its exit, studio.ts)
  if (studio.active) return;
  const next = !perfHud.isVisible();
  input.setSetting('showDebugHud', next);
  perfHud.setVisible(next);
});
// Multiplayer v2 status surface (src/ui/multiplayerStatus.ts): F3 expands the network strip; F4 arms the
// leave and a second press confirms it. Outside a v2 battle the leave key opens the settings overlay,
// whose LEAVE BATTLE row is the same exit for every other battle.
input.onAction('networkPanel', () => { multiplayerV2.current?.toggleStatusPanel(); });
input.onAction('leaveBattle', () => {
  const v2 = multiplayerV2.current;
  if (v2?.inMatch && v2.pressLeave() !== 'ignored') return;
  if (battlePhase.canLeaveBattle() || garageAwaitingHandoff()) settings.open();
});
// The proving ground (v2 progression, 2026-10-17): R resets the range, Y switches moving targets; the range card's buttons
// say the same through the bus. Inert in every other battle (a network battle's local session never plays the range).
const provingControls = createProvingControls({
  active: () => game.phase === 'battle' && !!game.ruleset?.provingGround && game.result === null && isSoloBattleRuntimeReady(),
  reset: () => Boolean(resetProvingRange(game)),
  setMoving: (moving) => Boolean(setProvingTargetsMoving(game, moving)),
  moving: () => !!game.ruleset?.provingGround?.moving,
});
const pressRangeReset = () => { if (provingControls.reset()) bus.emit('ui:click', {}); };
const pressRangeMoving = () => { if (provingControls.toggleMoving()) bus.emit('ui:click', {}); };
input.onAction('rangeReset', pressRangeReset);
input.onAction('rangeMoving', pressRangeMoving);
bus.on('ui:rangeReset', pressRangeReset);
bus.on('ui:rangeMoving', pressRangeMoving);
// the range card's Garage button: straight back to the Garage (the range keeps no verdict and no record)
bus.on('ui:rangeExit', () => {
  if (!provingControls.active()) return;
  bus.emit('ui:click', {});
  void leaveBattleToGarage().catch((error) => console.error('[proving ground] leave failed', error));
});

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------

// WoT-style player-path countdown after the opaque deployment transition.
const PRE_BATTLE_HOLD_S = 5;
const MIN_VISIBLE_PRE_BATTLE_S = 3; // countdown 2026-09-13: always a whole 3-2-1 after the loader (was 2)
const battleRollout = createBattleRolloutRuntime({
  game,
  bus,
  audio,
  getHud: currentHud,
  defaultPreBattleSeconds: PRE_BATTLE_HOLD_S,
});

// The solo battle loader is an opaque DOM surface. Rendering the newly
// activated 3D world behind it made ordinary `nextFrame()` budget yields pay
// the complete first world/shadow draw before the explicit offscreen warm,
// producing 0.5–1.4 s "Assembling rosters" stalls. Keep rAF alive for the
// loader/progress UI, but suppress redundant scene frames until the covered
// warm is complete and the loader is being dismissed.
// Headless probes drive the battle entry through __DEBUG.startBattle (which is
// synchronous) and skip the in-battle countdown (startBattle arms it only on
// the player path — see opts.preBattleHold). Player/network entry and the
// default-frame reveal share one typed lifecycle owner.
const battleEntryLifecycle = createBattleEntryLifecycle({
  nextFrame,
  wakeFrameLoop: () => frameLoop.restart(),
  // sides (2026-09-18): a 14 v 14 or 1 v 41 field compiles more programs on its first frame than the 7 v 7 budget allows
  revealTimeoutMs: () => revealTimeoutForField(game.tanks.length),
  getRevealContext: () => ({
    phase: game.phase,
    garageHidden: !garage.isOpen,
    loaderVisible: battleLoad?.visible === true,
  }),
  onReveal: (receipt) => {
    if (typeof window !== 'undefined') window.__BATTLE_REVEAL = receipt;
    // The first presented battle frame is the successful end of every entry path.
    entryTelemetry.send({
      kind: 'entry_result', mode: multiplayerV2.current?.active ? 'network' : 'solo', outcome: 'ok',
      ms: receipt.waitMs, ...(receipt.slow ? { code: `slow_${receipt.slow}` } : {}),
    });
  },
  // Entry resilience (2026-09-25): a reveal past its wall-clock budget is a
  // beacon, not a failed entry; the lifecycle extends once and then waits.
  onSlowReveal: ({ phase, waitedMs, budgetMs }) => entryTelemetry.send({
    kind: 'slow_reveal', stage: 'primeReveal', code: phase, ms: waitedMs,
    mode: multiplayerV2.current?.active ? 'network' : 'solo', timings: { budgetMs },
  }),
});
const networkBattleIntentCover = createIntentCover({
  game,
  battleLoad,
  rosterRows: rosterPresentation.lobbyRows,
  getMapPresentation: (mapId, fallback) => ({
    name: mapId ? getLocalizedMapName(mapId) : fallback,
    thumb: mapId ? battleBackdrop(mapId) : '',
    biome: mapId || 'none',
  }),
  coverRendering: battleEntryLifecycle.coverRendering,
  uncoverRendering: battleEntryLifecycle.uncoverRendering,
});
const soloBattleStart = createSoloBattleStartAccess({
  options: () => ({
    state: {
      game,
      getPendingMapId: () => worldRuntime.pendingMapId,
      setSelectedSpecId: selectedVehicle.set,
      rememberSpecId: selectedVehicle.remember,
      setShotMode: (value: boolean) => { shotMode = value; },
      setCaptureHidden: (value: boolean) => perfHud.setCaptureHidden(value),
      setSimulationAccumulator: () => { battleFrame.resetSimulationAccumulator(); },
      setCamoSweep: (work: Promise<void> | void) => { camoSweepP = Promise.resolve(work); },
    },
    world: {
      resolveMapId,
      switchMap,
      getActive: () => {
        const world = currentWorld();
        if (!world) throw new Error('solo battle start requires an active world');
        return world;
      },
      setDormant: setWorldDormant,
      scheduleBlackWatchdog: (covered: boolean) => {
        const entryGeneration = ++sceneWatchdogEntryGeneration;
        const requestedWorld = currentWorld();
        coveredBattleWatchdog = null;
        if (!navigator.webdriver) {
          const isCurrentBattleWatchdog = () => game.phase === 'battle' && !studio.active && currentWorld() === requestedWorld
            && sceneWatchdogEntryGeneration === entryGeneration;
          const watchdog: Omit<Parameters<typeof scheduleSceneWatchdog>[0], 'delayMs'> = {
            isCurrent: isCurrentBattleWatchdog,
            diagnosticContext: { phase: 'battle', entryGeneration, mapId: requestedWorld?.mapId ?? null },
            run: onMeasurements => runSceneBlackWatchdogAsync(renderer, scene, camera, {
              ...currentSceneWatchdogOptions(), isCurrent: isCurrentBattleWatchdog, measureTimings: true, onMeasurements,
            }),
          };
          if (covered) coveredBattleWatchdog = () => runSceneWatchdogNow(watchdog);
          else scheduleSceneWatchdog({ ...watchdog, delayMs: 1800 });
        }
      },
    },
    round: {
      getFx: requireFxRuntime,
      settings,
      killcam,
      armorAim: armorAimOverlay,
      resetDriveAim: () => driveTestController.resetAim(),
      setCamoBiome,
      // the hero leaves for battle in the paint it wears, never a try-on's tile
      lendPlayerVisual: (specId: string, useTank = true) => { camoTryOn.preview(null, null); return pedestal.lendToBattle(specId, useTank); },
      setupBattle,
      combatWarm,
      presentation: battlePresentation,
      applyPlayerCamo: (specId: string) => applyCamoPatterns(specId),
      applyRosterCamo: applyCamoPatternsChunked,
    },
    ui: {
      hud: {
        shotInfo: { setPlayer: (playerId: string) => currentHud()?.shotInfo.setPlayer(playerId) },
        setMode: (mode: HudMode) => currentHud()?.setMode(mode),
      },
      playerActions: playerBattleActions,
      damagePanel: {
        setTank: (spec: DamagePanelSpec, visual: DamagePanelVisual) => (
          currentDamagePanel()?.setTank(spec, visual)
        ),
        setEquipment: (equipment: DamagePanelEquipment) => (
          currentDamagePanel()?.setEquipment(equipment)
        ),
      },
      hideGarage: () => garage.hide(),
      hideEndOverlay: endOverlay.hide,
      resetBattleResult: () => battleResultPresentation.reset(),
      setGarageLighting: (active: boolean) => {
        setGarageSpots(active);
        setGarageSunTrim(active);
      },
      emitPhaseChange: (phase: string) => bus.emit('phase:change', { phase }),
      emitConsumableReset: () => bus.emit('ui:consumableReset', {}),
      rig,
      stopShowroom: () => showroom.stop(),
      openBattle: () => openBattleRound(),
    },
    recordTrace: (trace: RuntimeValue) => {
      if (typeof window !== 'undefined') window.__START_BATTLE_TIMINGS = trace;
    },
  }),
});
const soloBattleLoading = createSoloBattleLoadingAccess({
  options: () => ({
    game,
    post,
    battleIntent,
    battleLoad,
    audio,
    acquisition: battleEntryAcquisition,
    deployment: soloBattleDeployment,
    lifecycle: battleEntryLifecycle,
    getPendingMapId: () => worldRuntime.pendingMapId,
    getMapName: getLocalizedMapName, // the loading screen names the battlefield in the active locale (BUI-F8)
    loadMapConfig: (mapId: string) => import('./world/maps/index.ts')
      .then(({ getMapConfig }) => getMapConfig(mapId)),
    getMapThumb: (mapId: string) => battleBackdrop(mapId),
    hasCachedWorld: (mapId: string) => !!worldCache.get(mapId),
    getWorld: () => {
      const world = currentWorld();
      if (!world) throw new Error('solo battle loading requires an active world');
      return world;
    },
    ensureWorld,
    ensureBattleVisuals: ensureBattleVisualStreamer,
    getBattleVisuals: () => {
      if (!battleVisuals) throw new Error('battle visual streamer was not loaded');
      return battleVisuals;
    },
    ensureBattleHud,
    preloadMinimap: (mapId: string) => ensureBattleHud()
      .then(() => currentHud()?.preloadMinimapAsset(minimapAssetUrl(mapId))),
    ensureTouchControls,
    preloadSettings: () => settings.preload(),
    preloadArmorAim: () => armorAimOverlay.preload(),
    preloadGarageReturn: () => garageReturn.preload(),
    // campaign: the plan follows the operation's formation so the right profiles transfer early
    // team arrangement (2026-09-15): the plan sizes the field and leads with the arranged nation like setupBattle
    planRoster: (specId: string, randomRoster: boolean, campaignOperationId: string | null = null, gameMode: string | null = null) => {
      const plan = soloRosterPlan(gameMode, campaignOperationId, randomRoster);
      return planBattleParticipantIds(game, specId, randomRoster, plan.nations, plan.slots, plan.formationLead, plan.national);
    },
    planCamoOverrides: (specId: string, mapId: string, randomRoster: boolean, campaignOperationId: string | null = null, gameMode: string | null = null) => {
      const plan = soloRosterPlan(gameMode, campaignOperationId, randomRoster);
      return planBattleCamoOverrides(game, specId, mapId, randomRoster, plan.nations, plan.slots, plan.formationLead, plan.national);
    },
    ensureTankBuilders,
    preloadSoloAuthority: preloadSoloBattleRuntime,
    preloadBattleClient: preloadBattleClientRuntime,
    preloadBattleWarm: () => battleWarm.preload(),
    preloadBattleStart: () => soloBattleStart.preload(),
    ensureKillcam: ensureKillcamRuntime,
    ensureFx: ensureFxRuntime,
    startBattle: soloBattleStart.start,
    prepareBattleWorldServices,
    getPedestalVisual: () => pedestal.current,
    prebakeSharedTextures,
    anisotropy: engineCtx.anisotropy ?? 4,
    rosterRows: (team: string) => rosterPresentation.battleRows(game.tanks, team),
    // the load card's both teams from its first frame: the seats setupBattle will field, planned before the world
    plannedRosters: plannedCardTeams,
    warmShotCards: (specIds: readonly string[]) => currentHud()?.warmShotCards(specIds),
    getCamoSweep: () => camoSweepP,
    prepareRevealCamera: prepareBattleRevealCamera,
    resolveVisiblePreBattleSeconds,
    preBattleHoldSeconds: PRE_BATTLE_HOLD_S,
    minimumVisiblePreBattleSeconds: MIN_VISIBLE_PRE_BATTLE_S,
    openBattle: (seconds: number) => openBattleRound(seconds),
    ensureWatch: () => watchOwner.preload(),
    scheduleDeferredWarm: scheduleDeferredCombatWarm,
    // (battle-spikes-253) a session's first battle warms its GPU-heavy stages behind the veil; later battles skip it
    warmFirstBattleCovered: (yieldForBudget, onProgress) => combatWarmComposition.warmFirstBattleCovered(yieldForBudget, onProgress),
    nextFrame,
    createLoadingYielder: createOpaqueLoadingYielder,
  }),
});

/**
 * Establish the exact camera pose that the loader fade will reveal. Covered
 * warm-up frames and pointer-lock acquisition can leave aim deltas queued;
 * the render loop drains those deltas while battleLoad.covering is true, so
 * this pose remains unchanged until the loader has fully left the viewport.
 */
/** The countdown starts; a watched battle hands the human seat to its bot and the watcher to the drone. */
function openBattleRound(preBattleSeconds?: number) {
  battleRollout.open(preBattleSeconds);
  if (game.ruleset?.watch) watchOwner.current?.open();
}

function prepareBattleRevealCamera() {
  // a watched battle opens on the drone's frame over the field, never on the human seat's chase
  if (game.ruleset?.watch && watchOwner.current?.prepareReveal()) return;
  if (!game.player || !game.player.state) return;
  rig.release();
  rig.snapArcade(2, game.player.state.yaw, -10 * DEG);
}
// Persistent subject-owned FX resolve against the presentation entity the
// player actually sees: a network round's actors and the solo roster both
// publish into the registry.
function resolveFxSubject(id: string) {
  return game.tankById.get(id) || null;
}

/**
 * The Play menu's start for a room: the same synchronous intent cover on the first start (the
 * composition chunk is still loading), then the browser composition (src/mp/session/browserComposition.ts)
 * enters the room's match. Avoiding an `async` wrapper is deliberate: even awaiting an already-resolved
 * promise would defer the loading veil by one microtask and expose a Garage frame. A failed cold
 * import is retryable, which is essential for first-visit clients on unstable mobile connections.
 */
function beginMultiplayerV2Battle(request: BrowserLaunchRequest): Promise<boolean> {
  const current = multiplayerV2.current;
  if (current) return current.beginRoom(request);
  networkBattleIntentCover.show(request);
  return multiplayerV2.preload()
    .then((runtime) => runtime.beginRoom(request))
    .catch(async (error) => {
      await networkBattleIntentCover.releaseAfterFailure();
      throw error;
    });
}

/** The composition's modules (one list: a returning tab's boot loads the same chunks ahead of its entry, lever 3c). */
function importMultiplayerV2Modules() {
  return Promise.all([
    import('./mp/session/browserComposition.ts'),
    import('./mp/session/activationRuntime.ts'),
    import('./mp/host/browserHostPort.ts'),
    import('./mp/host/worldCollision.ts'),
    import('./mp/transport/iceConfig.ts'),
    // already in this chunk's graph (the composition paints its rounds with it): the roster prewarm below
    import('./mp/presentation/battlePresentation.ts'),
  ]);
}

function loadMultiplayerV2Composition(): Promise<BrowserComposition> {
  return importMultiplayerV2Modules().then(([{ createBrowserComposition }, { createActivationRuntime }, { createBrowserHostPort, SIM_KERNELS_URL }, { COLLISION_MANIFEST_ROUTE, loadObstacleIdentities }, { createRoomIceResolver }, { prewarmRosterVisuals, prebuildRosterVisuals }]) => {
    // The launch runs on the app's ports: the loader, the world, the warm owners, the activation.
    const options = multiplayerAppPorts();
    const activation = createActivationRuntime(options.activation);
    const runtime = createBrowserComposition({
      // clientBuild: the composition's default, this build's match line (src/mp/wire/matchBuild.ts, the same-wire check)
      ports: {
        lifecycle: battleEntryLifecycle,
        // a world laid out otherwise than the host's manifest reads the destroyed list through the manifest's identities
        load: { ...options.load, loadAuthorityObstacles: (mapId, signal, variant) => loadObstacleIdentities(mapId, COLLISION_MANIFEST_ROUTE, { signal, variant }),
          // 2026-10-15 (the MP stream): the named seats' builders and textures beside the world load (the rejoin row)
          prewarmRoster: (seats, signal) => prewarmRosterVisuals(seats, { anisotropy: engineCtx.anisotropy ?? 4, signal }),
          // 2026-10-23 (item/mp-rejoin-levers-242): and their vehicles themselves, built there too (the roster takes them)
          prebuildRoster: (seats, signal) => prebuildRosterVisuals(seats, { engineCtx, anisotropy: engineCtx.anisotropy ?? 4, signal }) },
        roster: options.roster,
        scene: presentationScenePorts(),
        warm: options.warm,
        presentation: { activate: activation.activate, ...options.presentation },
        room: {
          getMenu: playSurface.getMenuPromise,
          setGarageStatus: (status) => garage.setRoomStatus(status),
          emitRoomState: (payload) => bus.emit('network:roomState', payload),
          clearInput: () => input.setEnabled(false),
          enterGarage: () => garageReturn.enter(),
          returnToGarage: () => garageReturn.leave(),
          getPhase: () => game.phase,
          hasResult: () => !!game.result,
        },
        status: {
          // The strip, its panel and its banner (src/ui/multiplayerStatus.ts) load with the first activated v2 round.
          mount: () => import('./ui/multiplayerStatus.ts').then(({ createMultiplayerStatusSurface }) => createMultiplayerStatusSurface({
            host: 'battle',
            storage: localStorage,
            onLeave: () => { void leaveBattleToGarage().catch((error) => console.error('[multiplayer v2] leave failed', error)); },
          })),
          // The link folds into the session record: reconnects, drops, hosting and elections count, the exit leaves one note (never per tick).
          event: (event) => {
            if (event.kind === 'reconnect') entryTelemetry.send({ kind: 'mp_reconnect', reason: event.scope });
            else if (event.kind === 'dropped') entryTelemetry.send({ kind: 'mp_drop', code: event.reason });
            else if (event.kind === 'host' && event.role === 'host') entryTelemetry.send({ kind: 'mp_host', reason: event.migrated ? 'migrate' : 'start' });
            else if (event.kind === 'migration' && event.phase === 'begin') entryTelemetry.send({ kind: 'mp_migrate', code: event.role ?? 'peer', reason: event.reason });
          },
          report: (summary, reason) => entryTelemetry.send({ kind: 'mp_exit', mode: 'network', code: reason, reason: summary.health, link: summary }),
        },
        // Peer-to-peer (docs/MULTIPLAYER-V2.md §13): the host actor's Worker chunk, the collision manifests the build serves,
        // ICE from the room this seat holds (§13.14: its relay credentials through src/mp/transport/iceConfig.ts), the
        // device tier (the mobile tier never hosts).
        p2p: {
          createHostPort: createBrowserHostPort,
          manifestBase: COLLISION_MANIFEST_ROUTE,
          // the world kernels, on unless ?simKernels=ts (src/mp/host/browserHostPort.ts, docs/RUST-KERNELS.md)
          simKernelsUrl: SIM_KERNELS_URL,
          tier: getDeviceTier(),
          // a seat linking without a relay (a fallback, or a grant with no TURN server) leaves one `ice_degraded` note per reason
          createIceResolver: (mode, room) => createRoomIceResolver({
            mode, room, onDegraded: (reason) => entryTelemetry.send({ kind: 'ice_degraded', mode: 'network', code: reason }),
          }),
        },
      },
    });
    if (diagnosticsRequested) window.__MULTIPLAYER_V2 = runtime;
    return runtime;
  });
}

/** The scene a network presentation draws into: a multiplayer round's, or a sortie's on the solo sim Worker. */
function presentationScenePorts(): BrowserCompositionPorts['scene'] {
  return {
    engineCtx,
    game,
    bus,
    getWorldCollision: currentWorld,
    groundSampler,
    getFx: requireFxRuntime,
    resetRoundState: () => resetRoundState(game),
    clearVehicleDecals: (visual) => requireFxRuntime().clearVehicleDecals(visual),
    onVisualReady: (actor) => { nightLighting.appendEntity(actor); battlePresentation.prepareModeEnergy(actor); },
  };
}

/**
 * A free sortie's battle on the solo sim Worker (src/game/soloSimBattleRuntime.ts; RUST-ENGINE-DECISION §7 step 5): the
 * app's load, warm and activation ports, the network presentation's prebuild and obstacle identities, and the Worker's
 * port. No room, session, status strip or multiplayer telemetry.
 */
function loadSoloSimBattle() {
  return Promise.all([
    import('./game/soloSimBattleRuntime.ts'),
    import('./game/soloSimBrowserPort.ts'),
    import('./mp/session/activationRuntime.ts'),
    import('./mp/presentation/battlePresentation.ts'),
    import('./mp/host/worldCollision.ts'),
  ]).then(([{ createSoloSimBattleRuntime }, { openSoloSimWorker, SOLO_SIM_WORLD }, { createActivationRuntime }, { prebuildRosterVisuals }, { COLLISION_MANIFEST_ROUTE, loadObstacleIdentities }]) => {
    const options = multiplayerAppPorts();
    const activation = createActivationRuntime(options.activation);
    const runtime = createSoloSimBattleRuntime({
      lifecycle: battleEntryLifecycle,
      load: {
        ...options.load,
        loadAuthorityObstacles: (mapId, signal, variant) => loadObstacleIdentities(mapId, COLLISION_MANIFEST_ROUTE, { signal, variant }),
        prebuildRoster: (seats, signal) => prebuildRosterVisuals(seats, { engineCtx, anisotropy: engineCtx.anisotropy ?? 4, signal }),
        recordTrace: (trace) => { (window as { __SOLO_SIM_LOAD?: unknown }).__SOLO_SIM_LOAD = trace; },
      },
      roster: options.roster,
      scene: presentationScenePorts(),
      warm: options.warm,
      presentation: { activate: activation.activate, ...options.presentation },
      openWorker: ({ mapId, mode }) => openSoloSimWorker(mapId, mode),
      world: SOLO_SIM_WORLD,
      visibility: {
        hidden: () => document.hidden,
        onChange(listener) {
          document.addEventListener('visibilitychange', listener);
          return () => document.removeEventListener('visibilitychange', listener);
        },
      },
    });
    if (diagnosticsRequested) (window as { __SOLO_SIM?: unknown }).__SOLO_SIM = runtime;
    return runtime;
  });
}

/** The roster as the warm owners read it: the composition's actors (the shape of a solo TankEntity). */
interface MultiplayerWarmView { entities: Map<string, MatchActor> }

/** The app ports the multiplayer composition is built from. */
interface MultiplayerAppPorts {
  load: BrowserCompositionPorts['load'];
  roster: BrowserCompositionPorts['roster'];
  warm: NonNullable<BrowserCompositionPorts['warm']>;
  presentation: Omit<BrowserCompositionPorts['presentation'], 'activate'>;
  activation: ActivationRuntimeOptions;
}

function multiplayerAppPorts(): MultiplayerAppPorts {
    if (!playerBattleActions) {
      throw new Error('Network composition requires player battle actions.');
    }
    // the network vehicles' wreck and program warms (under the cover, and a solo room's seats after its reveal)
    const vehicleWarm = (bridge: MultiplayerWarmView, signal?: AbortSignal) => ({
      entities: bridge.entities.values(),
      signal,
      prebakeBurntSteps,
      anisotropy: engineCtx.anisotropy ?? 4,
      renderer,
      scene,
      camera,
      compilePrograms: (root: THREE.Object3D) => forwardProgramWarm.compile(root),
      warmRender,
    });
    return {
        load: {
          battleLoad,
          audio,
          lighting,
          ensureBattleVisuals: ensureBattleVisualStreamer,
          nextFrame,
          setAdaptiveSuspended: (value: boolean) => post.setAdaptiveSuspended(value),
          loadModules: () => Promise.all([
            preloadBattleClientRuntime(),
            ensureBattleHud(),
            ensureTouchControls(),
            // Acquire the return owner under the private-room loading cover,
            // never on the first result/exit click or during pristine boot.
            garageReturn.preload(),
            armorAimOverlay.preload().catch((error) => {
              console.warn('[loading] Optional armor overlay unavailable:', error);
              return null;
            }),
            ensureFxRuntime().then((live) => {
              // Overlap optional atlas download/decode with map construction.
              // Never join it to entry: covered warming reuses ready assets or
              // cooperatively generates the same textures if unavailable.
              void Promise.resolve().then(() => live.preloadTextures()).catch(() => {});
              return live;
            }),
            ensureKillcamRuntime(),
            battleWarm.preload(),
            audio.warmBattleEvents(),
          ]),
          // Final combat warming follows Garage-light removal and authority
          // weather. Early world warming compiles a different light variant;
          // retain world/services here and the covered real-frame gates below.
          // batch 27: a Frontline Assault room carves the trench variant on every client
          loadWorld: (mapId: string, onProgress: (fraction: number, label: string) => void, terrainVariant: 'assault-trenches' | null = null) => (
            ensureWorld(mapId, onProgress, { precompile: false, atmosphere: 'covered-battle', ...(terrainVariant ? { terrainVariant } : {}) })
          ),
          recordTrace: (trace) => { window.__NETWORK_LOAD = trace; },
          rememberRound,
          recordEntryFailure: (failure) => {
            window.__NETWORK_ENTRY_FAILURE = failure;
            // A null clears the diagnostic at entry start; a diagnostic is a failed network entry (the funnel's beacon).
            if (failure) {
              entryTelemetry.send({
                kind: 'entry_result', mode: 'network', outcome: 'failed', code: `entry_failed_${failure.stage}`,
                error: describeError(failure.message, location.origin),
              });
            }
          },
          // Entry resilience: a strict shader preparation that outran its window (compile_extended) or reached its last
          // resort (compile_deferred: the covered reveal links the rest), and an entry wait extended for a round still
          // progressing (entry_extended), are beacons, never a failed entry — the kind the reveal and paint budgets report.
          recordSlowEntry: ({ stage, code, ms, pending }) => entryTelemetry.send({
            kind: 'slow_reveal', stage, code: `${stage}_${code}`, ms, mode: 'network', ...(pending !== null ? { timings: { pending } } : {}),
          }),
        },
        roster: {
          getMap: (mapId: string) => {
            return {
              name: getLocalizedMapName(mapId),
              thumb: battleBackdrop(mapId),
              biome: mapId,
            };
          },
          rows: (players, team, viewerId, gameMode) => (
            rosterPresentation.lobbyRows({ players, gameMode }, team, viewerId)
          ),
          vehicleName: (specId: string) => getSpec(specId)?.name || specId,
          emitBattleStart: (payload) => bus.emit('ui:battleStart', payload),
          setCamoBiome,
        },
        warm: {
          nightLighting: () => nightLighting.prepare(),
          atmosphere: async (initial) => {
            const seed = typeof initial.meta?.weatherSeed === 'number' ? initial.meta.weatherSeed : undefined;
            const mapId = currentWorld()?.mapId ?? game.mapId;
            await battleAtmosphere.prepare(seed, mapId);
            await frontline.prepare(seed, mapId);
            await mapAmbience.prepare(seed, mapId, battleAmbienceTime());
          },
          terrain: () => {
            const world = currentWorld();
            if (!world) throw new Error('network terrain warm requires an active world');
            return battleWarm.warmBattleTerrainTiles({
              game, world, yieldForBudget: createFrameBudgetYielder(16),
            });
          },
          presentation: (signal) => battleWarm.primeOpeningTerrainPresentation({
            game, world: currentWorld(), camera, signal,
            focusEntity: rig.spectateTargetEnt ?? game.player,
            yieldForBudget: createFrameBudgetYielder(16),
          }),
          wrecks: (bridge: MultiplayerWarmView, signal?: AbortSignal) => battleWarm.warmNetworkWrecks(vehicleWarm(bridge, signal)),
          // (a solo room's other seats, under the cover after the viewer's warms)
          streamedVehicles: (bridge: MultiplayerWarmView, signal?: AbortSignal) => battleWarm.warmStreamedVehicles(vehicleWarm(bridge, signal)),
          playerPanelPrograms: (bridge: MultiplayerWarmView, viewerId: string) => {
            kickPanelMaskPrograms(bridge.entities.get(viewerId)?.visual?.root);
          },
          playerPanel: async (bridge: MultiplayerWarmView, viewerId: string) => {
            const entity = bridge.entities.get(viewerId);
            if (!entity) return;
            const panel = currentDamagePanel();
            if (!panel) throw new Error('network panel warm requires the prepared battle HUD');
            // (2026-10-09) a slow mask link never refuses the round (damagePanelEntryMasks.ts)
            await prepareEntryPanelMasks(panel, entity.spec, entity.visual, deferredPanelMasks);
          },
          openingEffects: async (
            fx: ReturnType<typeof requireFxRuntime>, bridge: MultiplayerWarmView, signal?: AbortSignal,
            options?: { pacing?: 'gpu' | 'covered' },
          ) => {
            const timing: ForwardProgramCompileTiming & {
              openingRenderMs?: number; openingPasses?: CoveredComposerWarmTiming['passes'];
            } = {
              uniformCount: 0, uniformFailures: 0, uniformYields: 0, uniformPending: 0,
            };
            // (2026-10-26, the 257 rooms census: the room entry's longest task, 1.5 s, was the opening composer warm below
            // uploading the battlefield's textures and buffers in its one render) the battlefield draws offscreen a cohort
            // at a time, a frame between cohorts, as the solo deployment's forward warm does: the composer warm then meets
            // resident textures, buffers and programs
            // (2026-10-26, the room-stalls lane: after the cohorts, one cohort's draw still held 1033 ms of texSubImage2D)
            // the battlefield's textures uploaded first, one at a time under a frame budget, so the cohorts' draws meet
            // them resident (textureUploadStaging.ts: the materials' maps and the compiled programs' sampler uniforms)
            // (the room A/B: a large upload behind a GPU process fallen behind waited for it in the call, 0.3-1.7 s) each
            // large texture and each cohort draw first lets the GPU finish what was issued before it (gpuCatchUp.ts)
            // (262, the merged solo sim Worker's 7v7 entry: this pacing took its combat warm from 0.2-1.1 s to 8.3-9.2 s on a
            // loaded machine) the Worker's sortie paces as the page's solo deployment warm does: no staging, no wait, and the
            // page's covered yield between batches, a task and a painted frame at most every 32 ms (a frame after each of the
            // 110 batches still held it at 7.8 s, 57 ms frames at load 800)
            const gpuPaced = options?.pacing !== 'covered';
            const forwardYield = createFrameBudgetYielder(8);
            const batchYield = gpuPaced ? forwardYield : createOpaqueLoadingYielder(12, 32);
            const catchUp = { gl: renderer.getContext(), waitFrame: () => forwardYield(true) };
            const textureStaging = gpuPaced
              ? await stageTextureUploads(renderer, [scene], createFrameBudgetYielder(8), { signal, catchUp })
              : null;
            const forwardBatches: number[] = [];
            let catchUpFrames = 0;
            // (the room A/B: the stall moved into the cohorts' own bufferData, behind the first-draw pipelines of the draws
            // just ahead of it) each cohort first uploads its buffers with every draw count at 0 (preUpload), and every
            // batch, upload or draw, lets the GPU catch up before the next: a cohort's uploads meet an idle GPU process
            const uploadBatches: number[] = [];
            for (const batch of createDeploymentForwardWarmBatches({
              scene,
              csmLights: lighting.csm?.lights,
              worldGroup: currentWorld()?.group,
              playerRoot: game.player?.visual?.root,
              warmRender,
              preUpload: gpuPaced,
            })) {
              (batch.phase === 'upload' ? uploadBatches : forwardBatches).push(batch.ms);
              signal?.throwIfAborted();
              if (batch.phase !== 'upload') await batchYield(true);
              if (gpuPaced) catchUpFrames += await waitForGpuCatchUp(catchUp);
            }
            const deploymentForward = { batches: forwardBatches.length, maxMs: Math.max(0, ...forwardBatches),
              totalMs: forwardBatches.reduce((sum, ms) => sum + ms, 0), catchUpFrames,
              uploads: { batches: uploadBatches.length, maxMs: Math.max(0, ...uploadBatches) } };
            let decalVisual: { root: THREE.Object3D } | null = null;
            for (const entity of bridge.entities.values()) {
              const root = entity.visual?.root;
              if (root instanceof THREE.Object3D) {
                decalVisual = { root };
                break;
              }
            }
            await battleWarm.warmNetworkOpeningEffects({
              fx,
              post,
              camera,
              renderer,
              signal,
              timing,
              shells: game.shells,
              decalVisual,
              compilePrograms: (root: THREE.Object3D, compileTiming?: ForwardProgramCompileTiming) =>
                forwardProgramWarm.compile(root, compileTiming),
              warmRender: () => {
                // Keep the actual compositor path and its pooled FX atomic.
                // Pass measurements locate indivisible first-use work before
                // deciding where a cooperative preparation boundary is safe.
                // (battle-spikes-253) No shadow pass, as the solo deployment's warm: this render drew every caster's depth
                // program at the battle's light counts in one task (nav-perf's root-r room: 1.6 s), ahead of finalShadows'
                // prime, which makes them a batch at a time between painted frames.
                renderWithoutShadowUpdates(lighting.csm?.lights ?? [], () => {
                  const rendered = renderCoveredComposerWarm(post.composer);
                  timing.openingRenderMs = rendered.totalMs;
                  timing.openingPasses = rendered.passes;
                });
              },
            });
            return { ...timing, pacing: gpuPaced ? 'gpu' : 'covered', textureStaging, deploymentForward };
          },
          shotCards: (specIds: readonly string[]) => currentHud()?.warmShotCards(specIds),
          finalShadows: async (signal?: AbortSignal) => {
            signal?.throwIfAborted();
            const entryInfo = renderer.info;
            const casterBatchMs: number[] = [];
            let casterCount = 0;
            // Activation owns the final battlefield camera. Leave Garage's
            // dormant shadow state before fitting it, while entry still covers
            // all ordinary scene paints. The first revealed frame reuses these
            // exact maps rather than invalidating their fit again.
            lighting.setStaticPresentationDormant(false);
            lighting.updateFov();
            mainFrame.noteFovPrimed(camera.fov);
            lighting.update(true, SIM_DT);
            const cascadeMs = await lighting.primeShadowMaps(renderer, scene, camera, {
              signal,
              isCurrent: () => !graphicsContextLost && renderer.info === entryInfo,
              yieldBeforeCascade: nextPaintFrame,
              casterWarmup: {
                yieldBeforeBatch: nextPaintFrame,
                onBatch: (batch) => {
                  casterBatchMs.push(batch.elapsedMs);
                  casterCount += batch.casterCount;
                },
                // (battle-spikes-253) the actors this view holds hidden (unspotted): their depth programs warm too, inside
                // the batches only (shadowPrime.ts hiddenRoots), never in the final maps
                hiddenRoots: () => {
                  const roots: THREE.Object3D[] = [];
                  for (const entity of game.tankById.values()) {
                    const root = entity.visual?.root;
                    if (root && !root.visible) roots.push(root);
                  }
                  return roots;
                },
              },
            });
            // (battle-spikes-253) and the post chain's first frame under the cover, as the solo deployment warms it (nav-perf's
            // program log: LateFxPass.Copy and its pass programs linked in the first live frame of a room)
            let postPasses: RuntimeValue = null;
            try {
              postPasses = await post.warmFirstFrame(async () => { await nextPaintFrame(); signal?.throwIfAborted(); }) as RuntimeValue;
            } catch (error) {
              if (signal?.aborted) throw error;
              postPasses = { failed: String((error as Error)?.message ?? error) };
            }
            return { cascadeCount: cascadeMs.length,
              totalMs: cascadeMs.reduce((total, ms) => total + ms, 0),
              maxMs: Math.max(0, ...cascadeMs),
              casterWarmup: { batches: casterBatchMs.length, casterCount,
                batchMs: casterBatchMs,
                totalMs: casterBatchMs.reduce((total, ms) => total + ms, 0),
                maxMs: Math.max(0, ...casterBatchMs) },
              postPasses };
          },
          // 2026-10-15 (the MP stream, after the perf lane's link census): the scene's programs, on the strict compile's own
          // passes (so the keys match), submitted to the driver once the battle's light signature is final at the WELCOME;
          // they link while the roster is painted, and the strict compile below answers them from three's cache
          submitPrograms: async (signal?: AbortSignal) => {
            const timing: ForwardProgramCompileTiming = {};
            const lateMask = 1 << LATE_FX_LAYER;
            const passes = post?.composer ? [
              { layerMask: camera.layers.mask & ~lateMask, target: post.sceneAA.sceneTarget },
              { layerMask: lateMask, target: post.lateFx.target },
            ] : undefined;
            for (const _ of forwardProgramWarm.compileSceneSteps({ signal, timing, passes, sliceMs: 8 })) {
              signal?.throwIfAborted();
              await nextPaintFrame();
            }
            return { ...timing };
          },
          compile: async (signal?: AbortSignal) => {
            battlePresentation.prepareModeVisuals();
            // (battle-spikes-253) the world's structure materials patched for the collapse mask before the strict
            // preparation compiles them: patched after (the opening effects' warm), every structure bucket re-keyed and
            // the black watchdog's render linked twelve masked variants synchronously (nav-perf's room entry, 1.4 s)
            fxRuntimeAccess.current?.prepareWorldMaterials();
            recordLightCensus('compile');
            // (battle-spikes-253) and the black watchdog's readback copy, linked with the rest rather than at the watchdog
            warmSceneProbePrograms(renderer);
            // (battle-spikes-253) and the far trees' impostor atlas, as the solo loading bakes it: the room's world is built
            // without activation's precompile, so its bake programs linked at the first live frame that showed the far tier
            // (nav-perf's MP program log: the two COT_BAKE_BILLBOARD ShaderMaterials). Their links are awaited between
            // painted frames before the bake draws (a synchronous link in the bake was a 1.1 s task at root-r).
            // (battle-spikes-253) and the world's GPU simulations (ocean, ripples, ground pressure), whose passes run only on a
            // frame that advances time: their links ran in the first live frame (nav-perf's root-u room, 353 ms)
            try { currentWorld()?.warmSimulationPrograms?.(); } catch { /* the first live pass links them */ }
            try {
              const world = currentWorld();
              if (world?.warmImpostorsAsync) {
                await world.warmImpostorsAsync(async () => {
                  for (const _ of forwardProgramWarm.linkerBreathingSlices(90)) {
                    signal?.throwIfAborted();
                    await nextPaintFrame();
                  }
                });
              } else world?.warmImpostors?.();
            } catch (error) { if (signal?.aborted) throw error; /* the first update bakes lazily */ }
            const timing: ForwardProgramCompileTiming = {};
            const lateMask = 1 << LATE_FX_LAYER;
            // Match SceneAAPass and LateFxPass light selection and their exact
            // destinations; do not compile late FX under ordinary scene lights.
            const passes = post?.composer ? [
              { layerMask: camera.layers.mask & ~lateMask, target: post.sceneAA.sceneTarget },
              { layerMask: lateMask, target: post.lateFx.target },
            ] : undefined;
            // Strict preparation admits bounded groups and returns an explicit
            // first-use result. Covered entry checks it before any real draw.
            // (2026-10-14) the covered network entry alone stops a stalled window 2 s after its last link (programWarm)
            const steps = forwardProgramWarm.prepareSceneSteps({ signal, timing, passes, strict: true, stallMs: STRICT_DRAIN_STALL_MS });
            try {
              while (true) {
                const step = steps.next();
                if (step.done) return { ...timing, preparation: step.value };
                await nextPaintFrame();
              }
            } finally {
              // A failed paint must close the suspended generator as well.
              steps.return({ status: 'incomplete', pending: null, reason: 'invalidated' });
            }
          },
        },
        presentation: {
          setWaitingForPeers: (waiting: boolean) => {
            const hud = currentHud();
            hud?.setPreBattleWaiting(waiting);
            if (!waiting) hud?.preBattleCountdown(game.preBattleS);
            // network rooms play the ruleset their WELCOME named (the room's mode bent by its arrangement, set on game.ruleset by the
            // battle presentation); the mode's own table until it arrives
            if (!waiting) hud?.setPreBattleRules(game.ruleset.mode === normalizeGameMode(game.gameMode) ? game.ruleset : matchRulesetFor(normalizeGameMode(game.gameMode)));
            // campaign slice 5: the brief opens with the countdown and fades a few seconds into play
            if (!waiting && game.gameMode === 'frontline_assault') {
              missionBrief.show({ operationId: pendingCampaignOperationId, mapId: game.mapId, durationS: game.preBattleS + 14 });
            }
          },
          setGarageLighting: (active: boolean) => {
            setGarageSpots(active);
            setGarageSunTrim(active);
          },
          runBlackWatchdog: (signal?: AbortSignal) => (recordLightCensus('watchdog'), runSceneBlackWatchdogAsync(
            renderer, scene, camera, { signal, measureTimings: true, ...currentSceneWatchdogOptions() },
          )),
          programs: () => renderer.info.programs,
          watchProgramOrigins,
        },
      activation: {
        game,
        settings,
        killcam,
        // Engineering-only controller is created after ordinary boot
        // composition; keep this port lazy so startup never crosses its TDZ.
        driveTest: { resetAim: () => driveTestController.resetAim() },
        getHud: currentHud,
        playerActions: playerBattleActions,
        getDamagePanel: currentDamagePanel,
        rig,
        presentation: {
          setShotMode: (value: boolean) => { shotMode = value; },
          setCaptureHidden: (value: boolean) => perfHud.setCaptureHidden(value),
          setNetworkSpectator: (value: boolean) => {
            void value; // the round's presentation carries the spectator's perspective itself
            sceneWatchdogEntryGeneration++;
            coveredBattleWatchdog = null;
          },
          setSelectedSpecId: selectedVehicle.set,
          rememberSpecId: selectedVehicle.remember,
          setWorldDormant,
          getWorld: currentWorld,
          setCamoBiome,
          hideGarage: () => garage.hide(),
          hideEndOverlay: endOverlay.hide,
          resetBattleResult: () => battleResultPresentation.reset(),
          setGarageSpots,
          setGarageSunTrim,
          emitPhaseChange: (phase) => bus.emit('phase:change', { phase }),
          emitConsumableReset: () => bus.emit('ui:consumableReset', {}),
          stopShowroom: () => showroom.stop(),
        },
      },
    };
}

/** The last solo entry was a watched battle (Battle Again watches again). */
let lastEntryWatched = false;

/** A solo battle's both teams as the load card draws them, planned before its world (rosterState.planBattleSeats). */
function plannedCardTeams(specId: string, request: { randomRoster: boolean; gameMode: string; campaignOperationId: string | null; watch: boolean }) {
  const plan = planBattleSeats(game, specId, request);
  return plan ? {
    allies: rosterPresentation.battleRows(plan.seats, 'player'),
    enemies: rosterPresentation.battleRows(plan.seats, 'enemy'),
    teamNations: plan.teamNations,
  } : null;
}

/**
 * Who runs a solo battle's authority (RUST-ENGINE-DECISION §7). A solo game against bots never creates a multiplayer
 * session (the owner, 2026-10-26, release 256), and it runs locally, on the page's own simulation: no match client, no
 * prediction against an authority, no interpolation buffer (the owner, 2026-10-29: "everything is now delayed laggy as if it
 * was using the multiplayer architecture"; release 261's solo sim Worker default, DECISIONS 2026-10-27, is reverted).
 * `?soloAuthority=worker` puts any versus mode on the solo sim Worker (src/game/soloSimBattleRuntime.ts), and
 * `?soloAuthority=host` on a local host (mp/session/soloHostEntry.ts), for diagnosis; `?soloAuthority=page` names the default.
 */
const SOLO_AUTHORITY_PARAM = /[?&]soloAuthority=(host|worker|page)\b/.exec(location.search)?.[1] ?? null;
function soloAuthorityFor(
  gameMode: string | null | undefined, { campaign = false, watch = false }: { campaign?: boolean; watch?: boolean } = {},
): { authority: 'host' | 'worker' | 'page'; reason: string } {
  const mode = normalizeGameMode(gameMode ?? 'standard');
  const page = (reason: string) => ({ authority: 'page' as const, reason });
  if (SOLO_AUTHORITY_PARAM === 'page') return page('opt_out');
  if (campaign) return page('campaign');
  if (watch) return page('watch');
  if (!(BATTLE_MODE_IDS as readonly string[]).includes(mode) || roomSizeRulesFor(mode).sides !== 'versus') return page('mode');
  // (a battle Jev commands asks Jev each turn over the network: the page's own controller holds it)
  if (readBrainSettings().opponent === 'jev') return page('jev');
  if (typeof Worker !== 'function') return page('no_worker');
  if (SOLO_AUTHORITY_PARAM === 'host') return { authority: 'host', reason: 'forced' };
  if (SOLO_AUTHORITY_PARAM === 'worker') return { authority: 'worker', reason: 'forced' };
  return page('local');
}

/** A battle's authority, once an entry: the session note `solo:<authority>:<reason>` on its entry record. */
function noteSoloAuthority({ authority, reason }: { authority: 'host' | 'worker' | 'page'; reason: string }): void {
  entryTelemetry.send({ kind: 'solo_authority', code: authority, reason });
}

let soloHostPrepared = false;
/** The Battle intent's host thread for a free sortie on a local host (the battlefield selected in the Garage). */
function prepareSoloHost(): Promise<void> {
  soloHostPrepared = true;
  return import('./mp/session/soloHostEntry.ts').then((entry) => entry.prepareSoloHost({
    specId: garage.getSelected(), mapId: garage.getSelectedMap(), gameMode: 'standard' }));
}
/** A battle the page simulates lets the intent's prepared host thread (and its second world) go. */
function releasePreparedSoloHost(): void {
  if (!soloHostPrepared) return;
  soloHostPrepared = false;
  void import('./mp/session/soloHostEntry.ts').then((entry) => entry.releasePreparedSoloHost()).catch(() => {});
}

/** Who runs the next solo entry's battle once its cover is up: the page's own simulation, or the solo sim Worker. */
type SoloEntryAuthority = 'page' | 'worker';
let soloEntryAuthority: SoloEntryAuthority = 'page';
let soloSimPrepared = false;
function routeSoloEntry(authority: SoloEntryAuthority): void {
  soloEntryAuthority = authority;
  if (authority === 'page' && soloSimPrepared) {
    // a battle the page simulates lets the hover's Worker (and its battlefield) go
    soloSimPrepared = false;
    void import('./game/soloSimBrowserPort.ts').then((port) => port.releasePreparedSoloSim()).catch(() => {});
  }
}
/** The Battle hover's Worker for a free sortie (the battlefield the press will consume, the roster it will seat). */
function prepareSoloSimWorker(): Promise<void> {
  const specId = garage.getSelected();
  const mapId = battleIntent.peekMap(specId, garage.getSelectedMap() || worldRuntime.pendingMapId);
  const specIds = planBattleSeats(game, specId, { gameMode: 'standard' })?.seats.map((seat) => seat.specId) ?? [specId];
  soloSimPrepared = true;
  return import('./game/soloSimBrowserPort.ts').then((port) => port.prepareSoloSim(mapId, 'standard', specIds));
}
/** The solo entry's loading owner: solo's own (the page's simulation) or, for a sortie on the Worker, the Worker's battle. */
const soloEntryLoading = {
  begin(specId: string, mapId: string | null = null, options: SoloBattleLoadingStartOptions | undefined = undefined): Promise<void> {
    const authority = soloEntryAuthority;
    soloEntryAuthority = 'page';
    return authority === 'worker' ? beginSoloSimSortie(specId, mapId, options) : soloBattleLoading.begin(specId, mapId, options);
  },
};
/**
 * A free sortie on the solo sim Worker, under the press's cover (soloBattleEntryRuntime): the seats the cover drew
 * (rosterState.planBattleSeats, this battle's ordinal), the card's both teams from them, then the Worker's battle. A Worker
 * that cannot start hands the battle to the page's own loading under the same cover.
 */
async function beginSoloSimSortie(specId: string, mapId: string | null, options: SoloBattleLoadingStartOptions | undefined): Promise<void> {
  soloSimPrepared = false;
  const mode = normalizeGameMode(options?.gameMode ?? 'standard');
  const randomRoster = options?.randomRoster ?? true;
  const [runtime, { soloSimSortieSeats }] = await Promise.all([soloSim.preload(), import('./game/soloSimSortie.ts')]);
  const resolved = battleIntent.consumeMap(specId, mapId || worldRuntime.pendingMapId);
  const arrangement = readTeamArrangement(mode);
  const plan = planBattleSeats(game, specId, { randomRoster, gameMode: mode, arrangement });
  if (!plan) throw new Error('The battle could not be planned.');
  // the card: both teams from the plan, every seat named, as the page's loading owner draws them
  const allies = rosterPresentation.battleRows(plan.seats, 'player');
  const enemies = rosterPresentation.battleRows(plan.seats, 'enemy');
  const sides = { allies: allies.length, enemies: enemies.length };
  battleLoad.show({
    mapName: getLocalizedMapName(resolved) || resolved, thumb: battleBackdrop(resolved), biome: resolved,
    mode: battleLoadModeLabel(mode), modeId: mode, allies, enemies, seats: sides,
  });
  battleLoad.rosters(allies, enemies, teamNationsFlags(plan.teamNations), sides);
  const camoPlan = soloRosterPlan(mode, null, randomRoster);
  const { seats, camo } = soloSimSortieSeats(plan.seats, {
    ruleset: matchRulesetFor(mode, null, arrangement),
    difficulty: getStoredDifficulty(),
    playerName: '',
    // (the stored paint, custom paint included, as the page's own battle paints its tanks: it never leaves the page)
    playerCamo: STORED_CAMO_SELECTION,
    playerEquipment: loadSelectedEquipment(specId, getSpec(specId)),
    autoCamoSpecIds: planBattleCamoOverrides(game, specId, resolved, randomRoster, camoPlan.nations, camoPlan.slots, camoPlan.formationLead, camoPlan.national),
    selectionFor: () => STORED_CAMO_SELECTION,
    callsigns: rosterPresentation.seatCallsigns(plan.seats),
  });
  // the battle's ordinal is spent as setupBattle spends it: the next sortie plans the next roster
  game.battleCount++;
  try {
    await runtime.begin({
      specId, mapId: resolved, mode, seed: crypto.getRandomValues(new Uint32Array(1))[0]!, seats, arrangement,
      countdownS: MIN_VISIBLE_PRE_BATTLE_S, camoFor: (playerId) => camo.get(playerId) ?? 'factory',
    });
  } catch (error) {
    if ((error as { soloSimStage?: string } | null)?.soloSimStage !== 'boot') throw error;
    console.warn('[solo sim] the Worker could not start; the page simulates this battle', error);
    noteSoloAuthority({ authority: 'page', reason: 'fallback' });
    game.battleCount--;
    return soloBattleLoading.begin(specId, resolved, options);
  }
}

/** A free sortie on a local host; a room that cannot start hands the battle to `page`, the page's own entry. */
function beginSoloOnHost(specId: string | null | undefined, mapId: string | null | undefined, gameMode: string, page: () => Promise<unknown>) {
  soloHostPrepared = false;
  const chosen = specId ?? garage.getSelected();
  return import('./mp/session/soloHostEntry.ts').then((entry) => entry.beginSoloOnLocalHost({
    specId: chosen, mapId: mapId ?? garage.getSelectedMap(), gameMode,
    equipment: loadSelectedEquipment(chosen, getSpec(chosen)),
    consumables: loadConsumables(chosen, consumableSpecFor(getSpec(chosen))), camo: getMultiplayerCamoSelection(chosen),
  }, beginMultiplayerV2Battle, () => {
    noteSoloAuthority({ authority: 'page', reason: 'fallback' });
    return page();
  }));
}
function beginBattleEntry(
  specId: string,
  mapId: string | null = null,
  options: SoloBattleLoadingStartOptions | undefined = undefined,
) {
  const authority = soloAuthorityFor(options?.gameMode, { campaign: !!options?.campaignOperationId, watch: options?.watch === true });
  noteSoloAuthority(authority);
  if (authority.authority === 'host') {
    return beginSoloOnHost(specId, mapId, normalizeGameMode(options?.gameMode ?? 'standard'), () => beginPageBattleEntry(specId, mapId, options));
  }
  return beginPageBattleEntry(specId, mapId, options, authority.authority === 'worker' ? 'worker' : 'page');
}

function beginPageBattleEntry(
  specId: string,
  mapId: string | null = null,
  options: SoloBattleLoadingStartOptions | undefined = undefined,
  authority: SoloEntryAuthority = 'page',
) {
  releasePreparedSoloHost();
  routeSoloEntry(authority);
  // batch 19 (2026-09-14): the Garage BATTLE button is a free sortie in the chosen rules — a Frontline
  // Assault pick carves the trenches like a ladder launch does (it used to reach the field without them)
  pendingTerrainVariant = terrainVariantFor(options?.gameMode); // the mode's battlefield, as the authority builds it
  // a campaign operation launched from the Deploy screen names its sortie (its brief and its map)
  pendingCampaignOperationId = options?.gameMode === 'frontline_assault' ? options.campaignOperationId ?? null : null;
  lastEntryWatched = options?.watch === true;
  return soloBattleEntry.begin(specId, mapId, options);
}

/**
 * Keep bot play on the original in-page simulation path. Multiplayer's
 * authority, snapshot bridge, prediction, WebRTC, and signaling modules are
 * intentionally absent here: loading them for a local battle duplicated work
 * without adding any useful authority boundary.
 */
async function beginSoloBattle({
  specId,
  mapId,
  randomRoster = true,
  gameMode = 'standard',
  campaignOperationId = null,
}: SoloBattleEntryRequest = {}) {
  // (soloAuthorityFor) the solo sim Worker for a quick battle's standard rules, a local host under ?soloAuthority=host,
  // else the page's own simulation
  const authority = soloAuthorityFor(gameMode, { campaign: !!campaignOperationId });
  noteSoloAuthority(authority);
  if (authority.authority === 'host') {
    return beginSoloOnHost(specId, mapId, normalizeGameMode(gameMode),
      () => beginPageSoloBattle({ specId, mapId, randomRoster, gameMode, campaignOperationId }));
  }
  return beginPageSoloBattle({ specId, mapId, randomRoster, gameMode, campaignOperationId }, authority.authority === 'worker' ? 'worker' : 'page');
}

function beginPageSoloBattle({
  specId,
  mapId,
  randomRoster = true,
  gameMode = 'standard',
  campaignOperationId = null,
}: SoloBattleEntryRequest = {}, authority: SoloEntryAuthority = 'page') {
  releasePreparedSoloHost();
  routeSoloEntry(authority);
  pendingTerrainVariant = terrainVariantFor(gameMode);
  // campaign slice 5: the mission brief names the ladder operation when the sortie came from it
  pendingCampaignOperationId = gameMode === 'frontline_assault' ? campaignOperationId : null;
  // batch 19: a ladder operation always fights on its own map, whatever the Garage has selected
  const operation = campaignOperationById(pendingCampaignOperationId);
  return soloBattleEntry.beginSelected({
    // Mars changes the rules and sky on the selected battlefield.
    specId, mapId: operation?.mapId ?? mapId, randomRoster, gameMode, campaignOperationId: pendingCampaignOperationId,
  });
}

/** QA-only cold entry. Production paths already own a loading veil and call
 * the activation owner only after the selected world and roster builders are ready. */
async function debugStartBattle(
  specId: string,
  mapId: string | null = null,
  opts: Record<string, RuntimeValue> = {},
) {
  const { startDebugBattle } = await import('./dev/debugBattleEntryRuntime.ts');
  return startDebugBattle({
    getPendingMapId: () => worldRuntime.pendingMapId,
    resolveMapId,
    ensureFullFleet,
    ensureWorld: (nextMapId) => ensureWorld(nextMapId, null, { precompile: false }),
    preloadSoloAuthority: preloadSoloBattleRuntime,
    preloadBattleClient: preloadBattleClientRuntime,
    ensureBattleHud,
    ensureTouchControls,
    preloadArmorAim: () => armorAimOverlay.preload(),
    ensureFx: ensureFxRuntime,
    ensureKillcam: ensureKillcamRuntime,
    preloadBattleWarm: () => battleWarm.preload(),
    preloadBattleStart: () => soloBattleStart.preload(),
    prepareWorldServices: () => prepareBattleWorldServices(currentWorld()),
    startBattle: (nextSpecId, nextMapId, options) => (
      soloBattleStart.start(nextSpecId, nextMapId, options)
    ),
  }, specId, mapId, opts);
}

// Returning from battle or Studio is one typed transaction. It owns the
// teardown order, retained-room policy, transition coalescing, and rematch
// sequencing while main supplies concrete browser/rendering adapters.
const garageReturn = createGarageReturnAccess<BattleVisual>({
  options: () => ({
  game,
  getSelectedSpecId: () => selectedVehicle.id,
  presentation: {
    setAdaptiveSuspended: (suspended: boolean) => post.setAdaptiveSuspended(suspended),
    clearBattle: ({ keepScreens = false }: { readonly keepScreens?: boolean } = {}) => {
      armorAimOverlay.clear();
      battleResultPresentation.clearPending();
      killcam.cancel();
      if (killcam.spectate?.active) killcam.spectate.stop(true);
      watchOwner.current?.stop();
      if (keepScreens) return;
      veilHud(false);
      // cancel() can flush a buffered report, so hide battle UI afterward.
      currentHud()?.setMode?.('hidden');
      endOverlay.hide();
    },
    resetBattleTank: () => resetBattleTankForGarage({
      fx: { resetAll: () => fxRuntimeAccess.current?.resetAll() },
      visual: game.player?.visual,
    }),
    suspendEffects: () => { fxRuntimeAccess.suspendRuntime(); },
    setShotMode: (enabled: boolean) => { shotMode = enabled; },
    setCaptureHidden: (hidden: boolean) => perfHud.setCaptureHidden(hidden),
    unfreezeEffects: () => fxRuntimeAccess.current?.setFrozen(false),
    resetHudFrame: () => battleHudFrame.reset(),
  },
  network: {
    shouldPreserveRoom: () => multiplayerV2.current?.shouldPreserveRoom() ?? false,
    disposePresentation: () => { multiplayerV2.current?.disposePresentation(); soloSim.current?.disposePresentation(); },
    closeMatch: (reason: string) => { multiplayerV2.current?.closeMatch(reason); soloSim.current?.disposePresentation(); },
  },
  warm: {
    invalidate: () => { battleWarmGeneration += 1; sceneWatchdogEntryGeneration++; coveredBattleWatchdog = null; },
    cancel: cancelDeferredCombatWarm,
    setPending: (pending: boolean) => { battleWarmPending = pending; },
  },
  work: {
    noteActivity: () => garageDressingScheduler.noteActivity(),
    resetFramePacer: (nowMs: number) => garageFramePacer.reset(nowMs),
    scheduleDressing: scheduleGarageDressingBuild,
  },
  world: {
    currentMapId: () => currentWorld()?.mapId || null,
    ensureGaragePlacement: () => garageEnvironmentPresentation.activate(selectedGarageVariantId),
    setDormant: (dormant: boolean) => setWorldDormant(dormant),
    setFarCascadeDormant: (dormant: boolean) => lighting.setFarCascadeDormant(dormant),
    clearCamoOverrides,
  },
  roster: {
    adoptBattlePlayer: (specId: string) => pedestal.adoptBattlePlayer(specId)
      ? pedestal.current as BattleVisual
      : null,
    clearBattle: (preservedVisual: BattleVisual | null) => clearBattleAfterExit<BattleVisual>({
      game,
      preservedVisual,
      visualPool: battleVisualPool,
    }),
    repaintHero: (specId: string) => applyCamoPatternsChunked({
      priorityIds: [specId], onlySpecIds: [specId],
    }),
  },
  settings,
  ui: {
    setGarageSpots,
    setGarageSunTrim,
    emitGaragePhase: () => bus.emit('phase:change', { phase: 'garage' }),
    hideEndOverlay: endOverlay.hide,
    exitPointerLock: () => { if (document.exitPointerLock) document.exitPointerLock(); },
    hideHud: () => currentHud()?.setMode?.('hidden'),
    showGarage: (specId: string) => garage.show(specId),
    poseGarageCamera: garageEnvironmentPresentation.poseCamera,
    startShowroom: () => showroom.start(),
    triggerBattle: () => {
      // Battle Again replays the entry it follows: a watched battle is watched again (the Deploy foot's Watch)
      const button = document.querySelector<HTMLButtonElement>(lastEntryWatched ? '[data-battle-watch]' : '.cot-battle');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
  },
  audio,
  transition,
  restoreGaragePresentation: async (isCurrent?: () => boolean) => {
    const receipt = await garagePhasePresentation.restoreGpu(isCurrent);
    garagePresentationDirty = false;
    return receipt;
  },
  createEntryScheduler: () => {
    const entryInfo = renderer.info;
    const entryContext = renderer.getContext();
    const yieldEntry = createOpaqueLoadingYielder(8, 32, { yieldFrame: nextPaintFrame });
    return {
      isCurrent: () => renderer.info === entryInfo
        && renderer.getContext() === entryContext && !entryContext.isContextLost(),
      // The owner already checked its 8 ms work budget. This call must provide
      // an actual task/paint opportunity, including hidden-document fallback.
      yieldControl: () => yieldEntry(true),
    };
  },
  isBattleEntryPending: () => battleEntryLifecycle.pending,
  isBattleEntryCovering: () => battleLoad.covering,
    publishTrace: (trace: RuntimeValue) => { window.__GARAGE_ENTRY = trace; },
  }),
});
const enterGarage = garageReturn.enter;
garageAwaitingHandoff = () => garageReturn.awaitingHandoff;
// perf-246: the Garage return paid behind the battle report (src/app/battleEndGarageWarm.ts). Loaded with the first
// battle, off the boot graph; it registers itself as the report's backdrop owner (src/ui/reportBackdrop.ts).
let battleEndGarageWarmLoad: Promise<void> | null = null;
const loadBattleEndGarageWarm = (): void => {
  battleEndGarageWarmLoad ??= import('./app/battleEndGarageWarm.ts').then(({ installBattleEndGarageWarm }) => {
    const warm = installBattleEndGarageWarm({
      bus,
      prepare: () => garageReturn.prepare(),
      isEligible: () => game.phase === 'battle' && game.result !== null && !shotMode && !studio.active
        && !multiplayerV2.current?.active && !multiplayerV2.current?.room && !battleEntryLifecycle.pending
        && !garageReturn.transitioning && !graphicsContextLost,
      renderFrame: () => {
        if (graphicsContextLost) return null;
        post.render(0);
        return renderer.domElement;
      },
      enabled: new URLSearchParams(location.search).get('garagePrewarm') !== '0',
      reportError: (message, error) => console.warn(message, error),
    });
    window.__GARAGE_PREWARM = warm.stats;
  }, (error: RuntimeValue) => {
    battleEndGarageWarmLoad = null;
    console.warn('battle-end Garage warm unavailable', error);
  });
};
bus.on('ui:battleStart', loadBattleEndGarageWarm);
bus.on('phase:change', loadBattleEndGarageWarm);
const leaveBattleToGarage = (): Promise<void> => {
  const v2 = multiplayerV2.current;
  if (v2?.active && battleEntryLifecycle.pending) {
    // A round still loading: leaving the room ends the entry under its own covered restore.
    v2.leaveRoom('explicit_leave');
    return Promise.resolve();
  }
  return garageReturn.leave();
};
const soloBattleEntry = createSoloBattleEntryRuntime({
  lifecycle: battleEntryLifecycle,
  loading: soloEntryLoading,
  battleLoad,
  audio,
  enterGarage,
  nextFrame: nextPaintFrame,
  isVisibleSpecId: (specId: string) => VISIBLE_TANK_IDS.includes(specId),
  getSelectedSpecId: () => garage.getSelected(),
  getSelectedMapId: () => garage.getSelectedMap(),
  // 2026-10-13 (the perf stream): the pending cover names the battlefield (a Random pick planned now, as the loading
  // owner will consume it) while the loading owner itself still downloads
  describePendingMap: (specId: string, mapId: string | null, options?: SoloBattleLoadingStartOptions) => {
    const resolved = battleIntent.peekMap(specId, mapId || worldRuntime.pendingMapId);
    const known = (MAP_IDS as readonly string[]).includes(resolved);
    // and both teams, planned now: the cover's first frame lists every seat (the owner, 2026-10-26)
    const teams = plannedCardTeams(specId, {
      randomRoster: options?.randomRoster ?? true, gameMode: options?.gameMode ?? 'standard',
      campaignOperationId: options?.campaignOperationId ?? null, watch: options?.watch === true,
    });
    if (!known && !teams) return null;
    return {
      mapId: known ? resolved : 'random', ...(known ? { mapName: getLocalizedMapName(resolved), thumb: battleBackdrop(resolved) } : {}),
      ...(teams ? { allies: teams.allies, enemies: teams.enemies, teams: teamNationsFlags(teams.teamNations) } : {}),
      // (the rules row's mode: the entry's own, soloBattleEntryRuntime.ts withChosenMode)
    };
  },
  // Entry resilience (2026-09-25): the reason reaches the player over the
  // recovered Garage, and the beacon, instead of only the console.
  // A chunk that did not arrive is not asked for again in this document (components/loadFailure.ts): the Battle button keeps
  // the kit's error state, which needs no chunk (the notice below is one), and the notice offers Reload page, not a retry.
  presentFailure: (error, retry) => {
    const reload = isChunkFailure(error);
    if (reload) garage.noteBattleLoadFailed();
    return import('./ui/garageReturnFailure.ts').then(({ showSoloEntryFailure }) => showSoloEntryFailure(error, reload ? null : retry));
  },
  onFailure: (error) => entryTelemetry.send({
    kind: 'entry_result', mode: 'solo', outcome: 'failed', code: 'entry_failed', error: describeError(error, location.origin),
  }),
});

const battleAgainAction = createBattleAgainAction({
  action: (trigger) => garageReturn.battleAgain(trigger),
  loadFailure: () => import('./ui/garageReturnFailure.ts'),
  getPhase: () => game.phase,
  getEntryGeneration: () => sceneWatchdogEntryGeneration,
  getRoom: () => multiplayerV2.current?.room ?? null,
  reportError: (message, error) => console.error(message, error),
});
bus.on('ui:battleAgain', () => { void battleAgainAction.run(); });
bus.on('ui:battleStart', battleAgainAction.invalidate);
bus.on('phase:change', battleAgainAction.invalidate);
bus.on('ui:roomOpen', battleAgainAction.invalidate);
bus.on('network:roomState', battleAgainAction.onRoomState);

bus.on('ui:roomOpen', async () => {
  await playSurface.showCurrentRoom();
});

bus.on('ui:roomReady', (payload) => {
  const ready = typeof payload === 'object' && payload !== null
    && Reflect.get(payload, 'ready') === true;
  const accepted = multiplayerLobby?.setReady(ready) ?? false;
  // Keep device unlock in the Garage gesture; the pending-room command may
  // resolve its menu asynchronously and would otherwise lose that boundary.
  if (accepted && ready) audio.prepare();
});
bus.on('ui:roomStart', () => { multiplayerLobby?.startRound(); });
// The composition's room (after a handoff) reaches the lobby owner through its state event.
bus.on('network:roomState', (payload) => { multiplayerLobby?.handleRoomState(payload); });

// batch 19 (2026-09-14): the end screen's NEXT / RETRY OPERATION button — the covered return owns the
// dismissal exactly like Battle Again, then the ladder sortie starts in place of the Garage's BATTLE click
// batch 21: the objective plate's BRIEF button re-opens (or dismisses) the mission brief mid-sortie
bus.on('ui:missionBrief', () => {
  if (game.phase !== 'battle' || game.gameMode !== 'frontline_assault') return;
  if (missionBrief.isShowing()) { missionBrief.hide(); return; }
  missionBrief.show({ operationId: game.campaignOperationId ?? pendingCampaignOperationId, mapId: game.mapId, durationS: 14 });
});
bus.on('ui:campaignNext', (payload) => {
  const request = payload && typeof payload === 'object' ? payload as { operationId?: unknown; mapId?: unknown } : null;
  const operationId = typeof request?.operationId === 'string' ? request.operationId : null;
  const mapId = typeof request?.mapId === 'string' ? request.mapId : null;
  if (!operationId || !mapId) return;
  void battleAgainAction.run(() => {
    void beginSoloBattle({ specId: selectedVehicle.id, mapId, gameMode: 'frontline_assault', campaignOperationId: operationId });
    return true;
  });
});

// ---------------------------------------------------------------------------
// HUD frame assembly (§4 step 7)
// ---------------------------------------------------------------------------
// Spectator perspective, spotting disclosure, aiming, armor inspection, and
// damage presentation share one allocation-free typed transaction. Capture
// tooling receives the same retained frame instead of building a second HUD.
const battleHudFrame = createBattleHudFrameRuntime({
  game,
  camera,
  rig,
  input,
  aimController,
  armorAimOverlay,
  killcam,
  muzzleScratch: _rayO,
  getHud: currentHud,
  getDamagePanel: currentDamagePanel,
  // A v2 round's measured round trip feeds the HUD's ping cell from the status model (no per-frame copy).
  pingMs: () => { const v2 = multiplayerV2.current; return v2?.active ? v2.networkStatus.rttMs : null; },
  // Watch mode: the ridden tank's HUD, read-only; flying, every tank and the drone on the map
  watch: {
    focus: () => watchOwner.current?.hudView.focus() ?? null,
    flying: () => watchOwner.current?.hudView.flying() ?? false,
    sight: () => watchOwner.current?.hudView.sight() ?? false,
    zoom: () => watchOwner.current?.hudView.zoom() ?? 1,
    revealAll: () => watchRevealsAll(game),
  },
});
const frameInfo = battleHudFrame.frameInfo;
const refreshSpotFrame = battleHudFrame.refreshSpotting;

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
// A typed, allocation-free owner samples every device and publishes the one
// mutable camera-input record consumed by the existing rig.
const camInput = playerFrameInput.camera;
// Watch mode (watch-mode-243): the drone, the ride-along and the seat controller of a watched battle. Its chunk loads
// with a watched battle's covered work (soloBattleLoading ensureWatch); nothing of it is on the boot graph.
const watchOwner = createLazyRuntimeOwner(
  () => import('./app/watchRuntime.ts'),
  (module) => module.createWatchRuntime<MainEntity>({
    game,
    camera,
    heightField: hfProxy,
    raycast: worldRaycast,
    prepareDestination: prepareCameraDestination,
    rig,
    input,
    cameraInput: camInput,
    bus,
    killcam,
    resultPresentation: battleResultPresentation,
    hud: { root: () => currentHud()?.root ?? null, setWatchDrone: (pose) => currentHud()?.setWatchDrone(pose),
      setWatchSide: (team) => currentHud()?.setWatchSide(team) },
    onSeat: (entity) => {
      // a taken seat's shot log and consumables are the player's from here; the panels follow watch:change
      if (entity) currentHud()?.shotInfo.setPlayer(entity.id);
      playerBattleActions?.resetConsumables();
    },
    isInputHeld: () => settings.isOpen(),
    pickSurface: (target) => target === renderer.domElement
      || (target instanceof Element && !!target.closest('.cot-touch-aim')),
  }),
);
// the HUD's shells and the damage panel name the tank a watcher rides or drives (read-only while riding)
let watchPanelEntity: MainEntity | null = null;
bus.on('watch:change', (payload) => {
  const id = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'id') : null;
  const entity = typeof id === 'string' ? game.tankById.get(id) ?? null : null;
  if (!entity || entity === watchPanelEntity) { if (!entity) watchPanelEntity = null; return; }
  watchPanelEntity = entity;
  playerBattleActions?.setTank(entity.spec);
  const panel = currentDamagePanel();
  panel?.setTank(entity.spec, entity.visual);
  panel?.setEquipment(entity.equip ?? null);
});
const audioListener = createListenerPoseRuntime({ camera, game, rig, killcam, audio });
const baseWorldFramePresentation = createWorldFramePresentationRuntime({
  camera,
  rig,
  getWorld: currentWorld,
  isWorldDormant: () => worldRuntime.dormant,
  getCameraFocus: () => game.player ?? (watchOwner.current?.controller.focusId
    ? game.tankById.get(watchOwner.current.controller.focusId) ?? null : null),
});
// The frontline ticks with the world presentation: live battle frames only,
// never the Garage, a paused battle, or a dormant world.
const wakeSources: WaterDisturbance[] = [];
// Round 73 (2026-09-25): every hull's footprint this frame, in water or not — the tall grass lies down under it
const groundSources: GroundDisturbance[] = [];
const worldFramePresentation = {
  update(dtSeconds: number, inBattle: boolean, killcamActive: boolean): void {
    baseWorldFramePresentation.update(dtSeconds, inBattle, killcamActive);
    if (inBattle && !worldRuntime.dormant) {
      // contact round 4 (2026-10-10): the wakes and the front run with live play; the sward's press runs paused too
      const live = !pauseInfo.paused;
      // Water pass 6 (2026-09-14): vehicles standing or driving in water push
      // wake rings and churn into the surface — the water reacts to the battle.
      const wakeWorld = currentWorld();
      if (wakeWorld) {
        const field = wakeWorld.heightField;
        wakeSources.length = 0;
        groundSources.length = 0;
        const entities = networkMatchActive() ? game.tankById.values() : game.tanks;
        for (const ent of entities) {
          const st = ent?.state; const p = st?.pos;
          if (!p) continue;
          const speed = st.speed ?? 0;
          const rect = ent.spec ? tankContactRect(ent.spec) : null;
          const travel = speed < -0.05 ? -1 : 1;
          const fx = Math.sin(st.yaw ?? 0), fz = Math.cos(st.yaw ?? 0);
          if (st.grounded !== false && groundSources.length < 8) {
            groundSources.push({
              x: p.x, z: p.z, dirX: fx * travel, dirZ: fz * travel, speed: Math.abs(speed),
              halfLength: rect?.halfLength, halfWidth: rect?.halfWidth,
            });
          }
          if (!live || !field.getWaterMaskAt || wakeSources.length >= 8) continue;
          const mask = waterContactMaskAt(field, p.x, p.y + (ent.contactGeom?.bottomYM ?? 0), p.z);
          if (!(mask > 0.05)) continue;
          // Water pass 7 (2026-09-20): the hull's footprint, heading and direction of travel
          // shape the wake. A standing hull still laps the water around it (0.6); a moving
          // one throws a full wake; a reversing one trails it ahead of the bow.
          wakeSources.push({
            x: p.x, z: p.z, strength: Math.min(1, mask * (0.6 + Math.abs(speed) / 6)),
            dirX: fx * travel, dirZ: fz * travel, speed: Math.abs(speed),
            halfLength: rect?.halfLength, halfWidth: rect?.halfWidth,
          });
        }
        if (live) wakeWorld.setWaterDisturbances(wakeSources);
        // contact round 4 (2026-10-10; the critics on wave 340: "no crushed blades or sinkage under the tracks"): the
        // sward's press is presentation only — the tall grass reads it, the simulation and the wire never do — so a paused
        // battle, and the Studio's and the shots' staged frames, keep the hulls' footprints pressed into the grass as play does
        wakeWorld.setGroundDisturbances?.(groundSources);
      }
      if (live) {
        // Frontline Assault brings the front closer with every sector taken.
        const line = game.matchModeState?.line;
        // 2026-09-14 campaign flavour: the front runs hotter — every battle at 1.15, Frontline
        // Assault from 1.25 and climbing with every sector taken (setScale clamps at 2).
        frontline.current?.setScale(line ? 1.25 + 0.35 * (line.index ?? 0) : 1.15);
        frontline.update(dtSeconds);
      }
    }
  },
};
// Pause transitions, input sampling, network cadence, pre-battle hold,
// fixed-step debt, result progression, and presentation interpolation are one
// typed state machine. The render loop consumes only its stable receipt.
const battleFrame = createBattleFrameRuntime({
  game,
  settings,
  killcam,
  input: playerFrameInput,
  network: {
    isActive: networkMatchActive,
    pump: networkPump.pump,
    // a solo battle on a local host or the solo sim Worker holds its authority as the page's solo simulation holds
    setHeld: (held: boolean) => { multiplayerV2.current?.setPaused(held); soloSim.current?.setPaused(held); },
  },
  countdown: {
    isWarmPending: () => battleWarmPending,
    advance: advancePreBattleCountdown,
    show: (seconds: number, warmPending = false) => {
      currentHud()?.preBattleCountdown(seconds, warmPending);
      // batch 19: the rules of engagement sit under the count (Standard shows none)
      currentHud()?.setPreBattleRules(game.ruleset);
      // campaign slice 5: the solo countdown opens the mission brief once per sortie
      if (game.gameMode === 'frontline_assault' && !missionBrief.isShowing()) {
        missionBrief.show({ operationId: pendingCampaignOperationId, mapId: game.mapId, durationS: seconds + 14 });
      }
    },
    // once a battle, solo and network alike; a network battle joined after its count rolls out late (no cues)
    rollout: (late = false) => bus.emit('battle:rollout', late ? { late: true } : {}),
    // the running count's whole seconds (the audio ticks 3, 2, 1)
    second: (seconds: number) => bus.emit('battle:countdown', { seconds }),
  },
  presentation: {
    captureSoloPose: battlePresentation.captureSoloPoses,
    update: battlePresentation.update,
    updateResult: battleResultPresentation.update,
  },
  getRigMode: () => rig.mode,
  stepSimulation: () => simStep(
    game, bus, currentWorld(), rig, worldRuntime.collider,
  ),
  emitPause: (paused: boolean) => bus.emit('ui:pause', { on: paused }),
  simulationDt: SIM_DT,
});
const pauseInfo = battleFrame.pauseInfo;
// controls_gunnery r5: true while the current __SHOTS view staged a live HUD
// frame (player_view / sniper_view) — those views re-run hud.update each
// shot-mode frame so the reticle canvas stays live (forceHitMark etc.).
let shotHudFrame = false;

let lastAuxiliaryNight: boolean | null = null;
const mainFrame = createMainFrameRuntime({
  thermalVehicles: combatWarmComposition.thermalVehicles,
  scene,
  camera,
  game,
  scheduleFrame: () => frameLoop.schedule(),
  isGraphicsContextLost: () => graphicsContextLost,
  syncViewportPixelRatio: viewport.syncPixelRatio,
  battleEntryLifecycle,
  getFx: () => fxRuntimeAccess.current,
  getWorld: currentWorld,
  getBaseFogDensity: () => baseFogDensity,
  getStudio: () => studio,
  getShotMode: () => shotMode,
  getShotHudFrame: () => shotHudFrame,
  sniperFill,
  updateNightLighting: () => {
    nightLighting.update();
    const on=battleAtmosphere.current?.weather?.timeOfDay==='night';
    if(on!==lastAuxiliaryNight){lastAuxiliaryNight=on;bus.emit('auxiliary:defaultLights',{on});}
  },
  resolveFxSubject,
  battleHudFrame,
  lighting,
  post,
  showroom,
  pedestal,
  garageModePreview: {
    get animated() { return garagePreviewAnimated(); },
    get pending() { return garageModePreview.pending; },
    clear: () => garageModePreview.clear(),
    update: dt => {
      const visual = pedestal.current;
      garageModePreview.update(visual?.root ?? null, visual ? getSpec(visual.specId) : null, garagePreviewMode, dt);
    },
  },
  garageOverlay: { frame: () => garage.frameHotspots(camera, pedestal.switchPending ? null : pedestal.current?.root ?? null) },
  networkSession: networkPump,
  garageFramePacer,
  battleFrame,
  isBattleLoadCovering: () => battleLoad.covering === true,
  // perf-247: a direct /studio boot draws nothing until its covered entry's own frame (studio.ts) and the boot's end.
  // (2026-10-26, the boot census) Nor does the Garage boot: the hero's switch scheduled a frame as the vehicle stage
  // ended, before the post stage's warm compiled anything, and that frame compiled and first-used all of the hero's
  // programs in one task (1.4 s on a cold desktop, 13.8 s on the 4x phone, the GPU process linking them one by one
  // while every compositor frame, the boot card's tank included, waited). The warm now links them between frames first.
  isBootCovering: () => !bootComplete,
  isTransitionHoldingSceneForFadeIn: () => transition.holdingSceneForFadeIn,
  isPresentationRestoreCovering: () => garagePhasePresentation.restoringGpu || (game.phase === 'garage' && (garageReturn.current?.lastTrace?.presentationUnready === true || garageReturn.current?.lastTrace?.awaitingHandoff === true)),
  cameraInput: camInput,
  getMobileAutoAim: mobileBattleInput.getAutoAim,
  rig,
  watchFrame: (dt) => watchOwner.current?.frame(dt) ?? false,
  killcam,
  veilHud,
  worldFramePresentation,
  destinationWarm: cameraDestinationWarm,
  matchModeWorld,
  audioListener,
  isGaragePresentationDirty: () => garagePresentationDirty,
  clearGaragePresentationDirty: () => { garagePresentationDirty = false; },
  perfHud,
  trace: devTrace,
});

// rAF-STARVATION FALLBACK (embedded panes): some embedded Chromium panes
// report visibilityState 'hidden' PERMANENTLY (while still focused, receiving
// real input events and compositing on demand) and never deliver
// requestAnimationFrame — a purely rAF-driven loop means the sim never steps,
// the 250 ms fire-press buffer expires before it is ever sampled, and the
// game reads as "controls dead". Two rescue paths drive the very same tick:
//  1. a 100 ms interval while the hidden document still claims focus (hidden
//     pages clamp intervals to >= 1 s, hence also path 2) — a genuinely
//     backgrounded tab (no focus) keeps presentation frozen; an active network
//     session has a separate render-free transport/authority timer below;
//  2. real input events (they arrive unthrottled): each pumps a tick so a
//     click is simulated long before its 250 ms fire edge can expire. These
//     listeners register AFTER the input layer's own (same target + phase,
//     registration order), so the pumped tick samples the fresh press.
// rAF re-arming is latched (rafQueued) so fallback ticks can never stack
// extra rAF callbacks for a speed burst when frames come back.
const frameLoop = createFrameLoopScheduler({
  tick: mainFrame.tick,
  isBootComplete: () => bootComplete,
  hasBackgroundWork: networkMatchActive,
  backgroundTick: (nowMs) => { multiplayerV2.current?.pumpBackground(nowMs); },
  // The authoritative simulation is fixed at 60 Hz. Presenting the complete
  // post/shadow pipeline above that rate only doubles GPU work on 120 Hz /
  // ProMotion displays without creating additional simulation states.
  maximumFrameRate: PRESENTATION_MAX_FRAME_RATE,
  // A settled, room-free Garage is event-driven. CSS/UI transitions remain
  // browser-owned; the complete Three.js clock wakes for camera motion,
  // vehicle swaps, transition coverage, loading, input, or retained network
  // authority, and otherwise runs only its five-second safety paint.
  shouldUseIdleCadence: () => bootComplete && battlePhase.isGarage() &&
    !battleEntryLifecycle.renderingCovered && !transition.active &&
    !studio.active && !shotMode && !showroom.moving &&
    !pedestal.switchPending && !garagePreviewAnimated(),
  idleIntervalMs: 5000,
});
rearmRafAfterContext = frameLoop.restart;
invalidateGaragePresentation = () => {
  garagePresentationDirty = true;
  // Retained Garage producers may finish during Battle/Studio. Remember the
  // change for return, without rebasing the active phase's animation clock.
  if (game.phase !== 'garage') return;
  garageFramePacer.noteActivity(performance.now());
  lighting.setStaticPresentationDormant(false);
  frameLoop.restart();
};
// Quality changes mutate shadow projections and post targets even in a sleeping Garage.
onPresetChange(() => { invalidateGaragePresentation(); mapAmbience.refreshTier(); });
bus.on('phase:change', () => {
  if (game.phase === 'garage') {
    pendingTerrainVariant = null;
    // batch 19: the finished match's objective state, ruleset and operation never outlive the return
    pendingCampaignOperationId = null;
    clearMatchSession(game);
  }
  frameLoop.restart();
});

// Deterministic engineering captures keep a synchronous discovery facade for
// screenshot tooling, while the orchestration and recipes stay out of every
// ordinary garage/battle download until set() is explicitly called.
window.__SHOTS = {
  views: [...SHOT_VIEWS],
  async set(name: string) {
    if (!isShotViewName(name)) {
      throw new Error(`Unknown screenshot view: ${name}`);
    }
    const [{ setShotView }] = await Promise.all([import('./dev/shotRuntime.ts'), loadGroundedLightModel(), loadCloudscapeLayers()]);
    // (the staged map's open sky takes the grounded light model and its cloudscape, as a battle's does: the boot weight)
    type ShotRuntimeContext = Parameters<typeof setShotView>[1];
    const staged = await setShotView(name, checkedIntegrationPort<ShotRuntimeContext>({
      preloadSoloBattleRuntime,
      preloadBattleClientRuntime,
      ensureBattleHud,
      ensureTouchControls,
      ensureFullFleet,
      ensureFxRuntime,
      ensureKillcamRuntime,
      preloadBattleWarm: () => battleWarm.preload(),
      preloadArmorAimOverlay: () => armorAimOverlay.preload(),
      switchMap,
      setWorldDormant,
      setCamoBiome,
      applyCamoPatterns,
      setupBattle,
      resetCombatWarm: () => combatWarm.reset(),
      drainCombatWarm: () => combatWarm.drain(),
      buildShellCards: playerBattleActions.setTank,
      setDamagePanelTank: (spec: DamagePanelSpec, visual: DamagePanelVisual) => (
        currentDamagePanel()?.setTank(spec, visual)
      ),
      setDamagePanelEquipment: (equipment: DamagePanelEquipment) => (
        currentDamagePanel()?.setEquipment(equipment)
      ),
      groundSampler,
      input,
      settings,
      showroom,
      setShotMode: (value: boolean) => { shotMode = value; },
      setCaptureHidden: (value: boolean) => perfHud.setCaptureHidden(value),
      resetPostPerfTrims: () => post.resetPerfTrims(),
      setShotHudFrame: (value: boolean) => { shotHudFrame = value; },
      setGarageSpots,
      setGarageSunTrim,
      restoreGarageGpuIfSuspended: async () => {
        if (garagePhasePresentation.diagnostics().gpu.suspended) {
          await garagePhasePresentation.restoreGpu();
        }
      },
      hideGarage: () => garage.hide(),
      hideEndOverlay: endOverlay.hide,
      setLastFov: mainFrame.noteFovPrimed,
      refreshSpotFrame,
      getWorld: currentWorld,
      getHud: currentHud,
      getFx: () => fxRuntimeAccess.current,
      getKillcam: () => killcam,
      getShellCards: () => playerBattleActions.shellCards,
      getSelectedSpecId: () => selectedVehicle.id,
      game,
      frameInfo,
      rig,
      camera,
      lighting,
      scene,
      scratch1: _v1,
      scratch2: _v2,
      scratch3: _v3,
      computeDispersionRadM,
      bus,
      setPedestalTank: pedestal.set,
      garage,
      garageDressing,
      tankPoseFromState,
      traceTank,
      createShell,
      resolveShellHit,
      createCombatState,
    }, 'shot runtime', [
      'ensureFullFleet', 'ensureFxRuntime', 'ensureKillcamRuntime',
      'switchMap', 'setupBattle', 'getWorld', 'getHud', 'getFx', 'getKillcam',
    ]));
    // (2026-10-09, the shadows lane) a staged map's ground occlusion (structureGroundOcclusion.ts) lands before any frame
    // is taken, at full strength: the worker's bake is what the capture waits for, never a fade
    const groundOcclusion = currentWorld()?.groundOcclusion ?? null;
    if (groundOcclusion) {
      groundOcclusion.setInstant(true);
      await Promise.race([groundOcclusion.whenReady(), new Promise((resolve) => { setTimeout(resolve, 30000); })]);
    }
    return staged;
  },
  /** (2026-10-12, effects by time of day) a battle's own sunset or night preset over the staged view, as a battle at
   *  that hour applies it, so captures can judge the effects and the light together ('day' restores the day). */
  async battleTime(time: 'day' | 'sunset' | 'night') {
    await battleAtmosphere.prepare(0, currentWorld()?.mapId ?? game.mapId, [time]);
    await mapAmbience.prepare(0, currentWorld()?.mapId ?? game.mapId, battleAmbienceTime());
    return battleAtmosphere.current?.weather?.timeOfDay ?? null;
  },
};

// ---------------------------------------------------------------------------
// Boot: garage first, warm the pipeline, then declare readiness.
// ---------------------------------------------------------------------------
// No battle roster or player entity exists on the Garage boot path. Prime the
// shell-card presentation from the selected spec; the solo/network start
// owners replace it with the real player after covered roster construction.
playerBattleActions.setTank(getSpec(selectedVehicle.id));
// perf-247: a direct /studio boot presents no Garage behind its veil. Showing it selected the hero (its build, 1.2 s on
// the profile) and started the showroom, and the Garage frames that woke linked the Garage's programs (5.4 s) before the
// Studio's chunk could run. The Studio's exit enters the Garage the canonical way (garageReturn); the hero builds in the
// idle after boot (below).
if (!STUDIO_BOOT_INTENT) {
  garage.show(selectedVehicle.id);
  garageEnvironmentPresentation.poseCamera(); // fallback pose until the orbit measures the hero
  showroom.start();
}
garageFramePacer.reset(performance.now());
setGarageSunTrim(true); // camo_spotting r2: boot lands on the garage screen
currentHud()?.setMode('hidden');

// BOOT DEFERRAL seam: the battlefield build is deferred until BATTLE is
// pressed, so `world` is legitimately null on the garage boot path — the
// garage bay renders without it. When a world IS already active (harness
// staging a battlefield view before readiness), warm it as before.
const bootWorld = currentWorld();
if (bootWorld) {
  bootWorld.update(0, camera.position);
  battlePresentation.update();
}
// 2026-10-20 (item/mp-rejoin-229, lever 3c): a returning tab (its remembered round, above) loads its battle's own
// modules while the post stage links its programs: the network composition's chunks and the effects and killcam
// modules (module loads only: their runtimes are built by the entry as before). Every load is retryable, and the entry
// joins whatever is still in flight.
void returningRound?.then((round) => (round
  ? Promise.all([importMultiplayerV2Modules(), preloadFxModule(), preloadKillcamModule()])
  : null)).catch(() => { /* the entry loads them */ });
await bootStage('post', async () => {
  // The lazily loaded post passes (SMAA: engine/post.ts) take their places before any frame is warmed or shown.
  await post.ready;
  // Direct Studio boot has no garage hero or dressing to present. Its own
  // covered entry renders the real world/camera before the boot veil lifts.
  if (STUDIO_BOOT_INTENT) return;
  // (2026-10-26) the cloud decks are real before the warm uploads them: a worker past its deadline leaves them baking in
  // slices, and the Garage's sky preset no longer bakes them in one task meanwhile (sky.ts applyPresentationPreset).
  // The decks only: the volumetric layer's noise was never awaited here, and still shows when it arrives.
  await sky.ensureCloudDecksChunked(() => nextFrame());
  BOOT_TIMINGS.postCompileLights = bootLightCount(); // (the early submission's light set must equal this one)
  await warmGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting,
    forwardPrograms: forwardProgramWarm,
    post,
    timings: BOOT_TIMINGS,
    reportProgress: (fraction: number) => boot.sub(fraction),
    simDt: SIM_DT,
    awaitProgramLinks: awaitRendererProgramLinks,
  });
});
// PERF (performance_budget r1): the combat-pipeline warms below are needed
// before FIRST COMBAT, not before readiness — they used to run synchronously
// ahead of __GAME_READY and billed ~120 ms straight onto load-to-ready.
// Deferred to post-ready idle; combatWarm.drain() is idempotent and
// battle entry runs it synchronously as a first-combat fallback if no idle
// slice arrived first (immediate battle entry, backgrounded tab).
//
// - wreck warm: the first kill of a battle otherwise pays the burnt-material
//   program compile + burnt/ember texture uploads inside a combat frame
//   (probe measured 125 ms at first blood). renderer.compile is
//   view-independent, so compiling against the garage-staged pool is valid.
// - fx warm: flipbook/atlas textures otherwise upload inside the
//   first-contact combat frame (muzzle flash, tracer, impact, smoke).
// Light-set, shared FX, private HDR target, and deployment shadow warming are
// owned by combatWarmComposition. Heavy combat caches remain absent from the
// interactive Garage and Studio only prepares effects it can actually use.

// Heavy combat caches intentionally do not warm in the interactive garage or
// the Studio. Battles own the complete roster/wreck/shadow warm; Studio uses
// the focused shared-FX warm above and compiles only actors it actually adds.

// SCENE STUDIO (staging rig + scripted marketing-shot API, src/game/studio.ts):
// entered via ?studio=1 (map via ?map=…) or F8 from the garage; scriptable via
// window.__STUDIO (schema in docs/STUDIO.md). main.ts only hands it these
// integration seams plus the one tick() branch above — entry keys, panel,
// actors, effects, capture all live in the studio module.
const studioLinks = (): NodeListOf<Element> => document.querySelectorAll('[data-nav="studio"], [data-mobile-nav="studio"]');
let studioLightRuntime: Promise<import('./game/studioLightRuntime.ts').StudioLightRuntime> | null = null;
let studioLightLive: import('./game/studioLightRuntime.ts').StudioLightRuntime | null = null;
const studioAccess = createStudioAccess({
  // the Studio's own catalog strings, which the game's catalogs leave out, and its panel's sheet load beside its chunk
  loadModule: () => Promise.all([import('./game/studio.ts'), import('./ui/studioPanel.css'),
    import('./ui/studioStrings.ts').then((strings) => strings.ensureStudioStrings())])
    .then(([module]) => module),
  preloadFxModule,
  ensureFxRuntime,
  prepareRuntime: () => lighting.setFarCascadeDormant(false),
  createContext: (studioFx: RuntimeValue) => ({
    renderer, scene, camera, post, lighting, game, hud: currentHud(), garage, showroom,
    hfProxy, getWorld: currentWorld,
    ensureWorld: async (
      id: string,
      onProgress: (fraction: number, label: string) => void,
      { earlyPrograms = true }: { readonly earlyPrograms?: boolean } = {},
    ) => {
      studioEarlyPrograms = earlyPrograms;
      try {
        return await ensureWorld(id, onProgress, { precompile: false, compilePrograms: true, services: false });
      } finally {
        studioEarlyPrograms = true;
      }
    },
    setWorldDormant,
    setGarageSpots, setGarageSunTrim, enterGarage,
    // media r5: Studio times of day and sun direction. The battle owner keeps the authored day (its Garage-return
    // reset restores the sky); the demand-loaded Studio light runtime applies the plan over it and restores the
    // world's baked horizon light on exit.
    prepareStudioAtmosphere: async (
      time: import('./game/studioLight.ts').StudioTimeOfDay,
      light: import('./game/studioLight.ts').StudioLight | null = null,
    ) => {
      await battleAtmosphere.prepare(0, currentWorld()?.mapId ?? game.mapId, ['day']);
      studioLightRuntime ??= import('./game/studioLightRuntime.ts').then(({ createStudioLightRuntime }) => {
        const runtime = createStudioLightRuntime({
          scene,
          getWorld: currentWorld,
          cloudIdentity: (authored) => {
            const layer = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...authored } as Parameters<typeof deriveCloudLayerPreset>[0]);
            return { offset: [layer.offset[0], layer.offset[1]], windDirRad: layer.windDirRad };
          },
          applySky: (preset, keyDirection) => {
            sky.applyPreset(preset, scene);
            lighting.setSun(keyDirection ?? sky.sunDir, preset);
            battleWatchdogRadianceScale = preset.skyIntensity ?? 1;
            baseFogDensity = scene.fog instanceof THREE.FogExp2 ? scene.fog.density : 0;
            worldRuntime.markEnvironmentPrepared(currentWorld());
          },
          resetTemporalHistory: () => post.taa?.resetHistory(),
          nightLightBudget: () => getDeviceTier() === 'mobile' ? { spotLights: 2, pointLights: 1 } : { spotLights: 4, pointLights: 2 },
        });
        studioLightLive = runtime;
        return runtime;
      }); // (a chunk that did not arrive is not asked for again in this document: components/loadFailure.ts)
      const applied = await (await studioLightRuntime).apply(time, light);
      // (the map's air) the Studio films the full count at its own hour, on its pinned fx clock
      mapAmbience.setDensityOverride(1);
      await mapAmbience.prepare(0, currentWorld()?.mapId ?? game.mapId, time);
      return applied;
    },
    setAmbienceEnabled: (on: boolean) => mapAmbience.setEnabled(on),
    restoreStudioAtmosphere: () => {
      studioLightLive?.restore();
      // the Studio's toggle and full count never follow it into a battle
      mapAmbience.setDensityOverride(null);
      mapAmbience.setEnabled(true);
    },
    getStudioLight: () => studioLightLive,
    programWarm: forwardProgramWarm,
    // (2026-10-26) the first view's casters drawn into the cascades a batch at a time behind the Studio's cover, so their
    // depth programs link between frames; a batch whose programs are linked goes on in the same frame (warm entries)
    prepareFirstViewShadows: () => {
      const budget = createFrameBudgetYielder(8);
      return deploymentShadowWarm.prime(() => budget(false));
    },
    // (2026-10-26) the renderer's queued program links, waited for between frames
    awaitProgramLinks: () => awaitRendererProgramLinks(() => nextFrame()),
    warmStudioPipeline: combatWarmComposition.warmStudioPipeline,
    transition,
    // main.ts owns both direct boot and the first lazy F8 handoff.
    autoEnter: false,
    fx: studioFx,
    // Studio never enters scoped sniper view, so the permanent sniper fill is
    // idle there: lend it for flares/night firelight (scene light count fixed).
    borrowLight: () => sniperFill.light,
  }),
  // perf-246: a Garage prepared behind the battle report is not on screen yet: F8 waits for the handoff.
  getPhase: () => (garageAwaitingHandoff() ? 'battle' : game.phase),
  keyTarget: window,
  // the Garage's Studio links read busy while the Studio's code loads (garage.css)
  onPending: (pending) => {
    for (const link of studioLinks()) link.toggleAttribute('aria-busy', pending);
  },
  // a Studio whose code did not arrive is not asked for again in this document: its links keep the kit's error state, and their
  // next press (or F8) reloads the page once online (components/loadFailure.ts)
  onEntryError: (error) => {
    console.error('[studio] lazy entry failed', error);
    markLoadFailed(studioLinks());
  },
  pressFailed: () => pressFailed(...studioLinks()),
});
studio = studioAccess.presentation;
openStudio = () => studioAccess.open();
function preloadStudioIntent() { studioAccess.preloadIntent(); }
function loadStudioRuntime() { return studioAccess.loadRuntime(); }

if (!STUDIO_BOOT_INTENT) {
  // Capture owns the first F8/navigation click until the Studio chunk exists;
  // createStudio installs the permanent toggle listener after import.
  studioAccess.installKeyboard();
}

// A /studio boot URL may carry a scene (a shared #scene= link or a ?scene= path link, studio.ts bootScene): the boot
// enters on the scene's own battlefield, and the scene opens once the game is ready (below __GAME_READY).
const studioBoot: { scene: { readonly map: Promise<string | null>; open(fallbackMap: string): Promise<void> } | null } = { scene: null };
if (STUDIO_BOOT_INTENT) {
  await bootStage('studio', async () => {
    const runtime = await loadStudioRuntime();
    studioBoot.scene = runtime.bootScene?.() ?? null;
    const sceneMap = studioBoot.scene ? await studioBoot.scene.map : null;
    return runtime.enter({
      map: sceneMap || STUDIO_BOOT_MAP,
      coveredByBoot: true,
      onProgress: (fraction: number, label: string) => {
        boot.sub(fraction);
        if (label) boot.note(label);
      },
    });
  });
}

// (2026-10-26, the boot census) every program the boot submitted links between frames before the first live frame:
// three's first use of a program still linking reads its log inside that frame (1.3-1.5 s on a cold desktop)
try { await awaitRendererProgramLinks(() => nextFrame()); } catch { /* the first frame waits for them as before */ }
bootComplete = true;
frameLoop.schedule();
for (const work of afterBootComplete.splice(0)) work();
// (boot-261) the gamepad service starts once the Garage has settled, not inside its build (input.ts watchGamepads)
if (window.requestIdleCallback) window.requestIdleCallback(() => input.watchGamepads(), { timeout: 5000 });
else setTimeout(() => input.watchGamepads(), 1500);
if (!STUDIO_BOOT_INTENT && selectedGarageVariantId !== 'verdant_motor_pool') {
  // Keep the normal Verdant boot fast. A persisted outdoor choice hydrates
  // after readiness and never presents the removed synthetic map diorama.
  void garageEnvironmentPresentation.activate(selectedGarageVariantId);
}

// ---------------------------------------------------------------------------
// Debug / drive-test hooks (not part of the screenshot contract).
// ---------------------------------------------------------------------------

const driveTestRequested = import.meta.env.DEV
  || debugModeRequested()
  || navigator.webdriver;
const driveTestController = createDriveTestAccess({
  enabled: driveTestRequested,
  options: () => ({
    getGame: () => game,
    getWorld: currentWorld,
    getRig: () => rig,
    getCollider: () => worldRuntime.collider,
    bus,
    input,
    aimController,
    debugFlags,
    playerShellLog,
    heightField: hfProxy,
    simStep,
    resetPresentationPoses: battlePresentation.resetSoloPoses,
    resetSimAccumulator: battleFrame.resetSimulationAccumulator,
  } satisfies DriveTestControllerOptions),
});
if (driveTestRequested) await driveTestController.preload();

if (diagnosticsRequested) {
  const { installMainDiagnosticsRuntime } = await import('./dev/mainDiagnosticsRuntime.ts');
  await installMainDiagnosticsRuntime({
    telemetry: {
      enabled: true,
      bus,
      getGame: () => game,
      getPinnedTargetId: () => driveTestController.aimTargetId,
      getAimBlockedDistance: () => frameInfo.aim.blockedDistM,
      playerShellLog,
      botPressure,
    } satisfies CombatTelemetryOptions,
    perfHud,
    showDebugHud: debugModeRequested() || input.getSettings().showDebugHud,
    debugSurface: {
      scene, camera, renderer, post, lighting, game, rig, bus, input, settings,
      getBattleAtmosphere: () => battleAtmosphere,
      getNightLighting: () => nightLighting,
      getMapAmbience: () => mapAmbience,
      pauseInfo, garage, flags: debugFlags, frameInfo, playerShellLog, botPressure,
      killcam, showroom, garageDressing, devTrace,
      quality: {
        resolvePresetName, resolveAutoTier, reportSustainedOverload,
        setPresetName, setMobilePresetName, noteGpuRenderer,
      },
      getFx: () => fxRuntimeAccess.current,
      getPedestalVisual: () => pedestal.current,
      isGarageModePreviewPending: () => garageModePreview.pending,
      isPedestalOnStage: () => pedestal.isOnStage(),
      getSelectedSpecId: () => selectedVehicle.id,
      getWatchController: () => watchOwner.current?.controller ?? null,
      getPedestalCacheIds: () => [...pedestal.cacheIds],
      getWorldCacheIds: () => [...worldCache.keys()],
      getResidentLimits: () => ({ ...residentLimits }),
      getBattleVisualPoolStats: () => battleVisualPool.stats(),
      getGarageFramePacerStats: () => ({ ...garageFramePacer.stats }),
      getFrameLoopSchedulerStats: () => ({ ...frameLoop.stats }),
      observeFrameLoopScheduler: (observer) => frameLoop.observeAnimationDecisions(observer),
      getPhaseSceneResidency: () => garagePhasePresentation.diagnostics().scene,
      getGarageGpuResidency: () => garagePhasePresentation.diagnostics().gpu,
      getLastWorldRelease: () => (worldRuntime.lastRelease
        ? { ...worldRuntime.lastRelease } : null),
      isGraphicsContextLost: () => graphicsContextLost,
      selectGarageTank: (id: string) => garage.setSelected(id),
      stagePedestalTank: (id: string) => {
        selectedVehicle.set(id);
        return pedestal.set(id, true);
      },
      getWorld: currentWorld,
      switchMap,
      aimAtNearest: driveTestController.aimAtNearest,
      gunAimError: driveTestController.gunAimError,
      aimState: driveTestController.aimState,
      fastForward: driveTestController.fastForward,
      slayEnemies: driveTestController.slayEnemies,
      startBattle: debugStartBattle,
      bakeMinimapForMap: async (mapId: string) => {
        const { awaitMapCaptureReadiness } = await import('./dev/mapCaptureReadiness.ts');
        await ensureBattleHud();
        const next = await ensureWorld(mapId, null, { precompile: false, services: false });
        await awaitMapCaptureReadiness(next, currentWorld);
        const hud = currentHud();
        if (!hud) throw new Error('capture HUD is unavailable');
        hud.buildMinimap(next.heightField, { ...next.getMinimapFeatures(), visibleWater: next.getVisibleWaterRaster() },
          next.config.minimap, { ...minimapSnapCtx(), requireTextured: true });
        return hud.exportMinimapBackground('image/webp', 0.92, true) || '';
      },
      // the debug entries keep the page's own simulation (its fast-forward, forced fire and full roster the probes read)
      // unless ?soloAuthority=host asks for the free sortie's local host
      beginBattleEntry: (specId: string, mapId: string | null = null, options?: SoloBattleLoadingStartOptions) => (
        SOLO_AUTHORITY_PARAM === 'host' ? beginBattleEntry(specId, mapId, options) : beginPageBattleEntry(specId, mapId, options)),
      beginSoloBattle: (request?: SoloBattleEntryRequest) => (
        SOLO_AUTHORITY_PARAM === 'host' ? beginSoloBattle(request) : beginPageSoloBattle(request)),
      beginNetworkBattle: beginMultiplayerV2Battle,
      enterGarage,
      leaveBattleToGarage,
      spawnKillShell: driveTestController.spawnKillShell,
      getShotMode: () => shotMode,
      setShotMode: (value: boolean) => { shotMode = !!value; },
      forceHitMark: async (bounced: boolean) => {
        await ensureBattleHud();
        currentHud()?.forceHitMark(!!bounced);
      },
      getDamagePanel: currentDamagePanel,
      getNetworkDiagnostics: () => multiplayerV2.current?.stats() ?? null,
      collectTelemetry: () => perfHud.collectTelemetry(),
      sampleShadowContribution: () => perfHud.sampleShadowContribution(),
    } satisfies DebugSurfaceDependencies,
  });
}
await bootStage('ready', null);
// perf-r2: the boot pipeline is compiled and error-checked; battle-time
// program links (lazy fx/wreck/killcam materials) drop the synchronous
// info-log wait from here on (see deviceDiag.relaxShaderChecks — ?diag keeps
// full checks for diagnosis runs).
relaxShaderChecks(renderer);
// ready() arms the "press any key" entry gate (auto-dismissed under
// ?nosplash / webdriver). Deliberately not awaited: __GAME_READY means
// "fully initialised" and must not depend on a keypress.
const entryReady = boot.ready(() => audio.prepare());
if (pendingRoomInvitePromise) {
  Promise.all([entryReady, pendingRoomInvitePromise]).then(([, invite]) => {
    if (!invite) return;
    return playSurface.open({
      mode: invite.mode,
      invite: { ...invite, autoJoin: true },
    });
  }).catch((error) => {
    console.error('[room-invite] failed to open', error);
  });
}
// The Gallery's "Test drive" opens the game at /?testdrive=<id> (game/provingGroundSession.ts): once the entry gate is
// passed the Garage launches it, and the address drops the intent so a reload lands in the Garage.
const testDriveSpecId = !STUDIO_BOOT_INTENT && !pendingRoomInvitePromise ? readTestDriveIntent(location.search) : null;
if (testDriveSpecId) {
  try { history.replaceState(history.state, '', withoutTestDriveIntent(location.href)); } catch { /* the address keeps it */ }
  void entryReady.then(() => {
    if (game.phase === 'garage' && !battleEntryLifecycle.pending) garage.testDrive(testDriveSpecId);
  }).catch((error) => console.error('[test-drive] failed to launch', error));
}
// 2026-10-22 (nav-perf-240): the two Garage panels a click opens, the settings and the play menu, are built hidden in
// the first quiet idle after the entry gate (their chunks are about 16 + 22 kB gzip), so neither click waits on a
// download or on building the panel; a phone has no hover to warm them.
if (!STUDIO_BOOT_INTENT && !pendingRoomInvitePromise) {
  void entryReady.then(() => requestQuietIdle(() => {
    if (game.phase !== 'garage' || battleEntryLifecycle.pending) return;
    settings.preload().catch((error) => console.warn('[settings] idle preload failed', error));
    playSurface.prepareMenu();
  }));
}
garageBootDone = true;
window.__GAME_READY = true;
studioBoot.scene?.open(STUDIO_BOOT_MAP).catch((error: unknown) => console.error('[studio] boot scene failed', error));
// 2026-10-12 (the perf stream): the pending battlefield's loading art, in idle time (onMapSelect does it for a new pick)
if (worldRuntime.pendingMapId && worldRuntime.pendingMapId !== 'random') preloadImageWhenIdle(battleBackdrop(worldRuntime.pendingMapId));
// 2026-10-13: the loading screen's blurred per-map placeholders (a ~15 kB lazy chunk), so its first frame is the map's own
primeMapLqipWhenIdle();
// 2026-10-15 (the MP stream, the §7 side-by-side's rejoin row): a tab opened on a room invite is on its way into a room
// and, on a return, straight into a running match. The Garage's idle work (the neighbouring heroes, the dressing set
// pieces) would share the main thread with the room's join and the battle entry, so it waits: a return to the Garage
// schedules the dressing itself (garageReturnRuntime), and a tab the invite leaves in the Garage gets both after
// INVITE_GARAGE_IDLE_DELAY_MS unless a battle entry holds the lifecycle then.
const runGarageIdleWork = () => {
  pedestal.queueNeighbors();
  if (!STUDIO_BOOT_INTENT) scheduleGarageDressingBuild();
};
if (pendingRoomInvitePromise) {
  void pendingRoomInvitePromise.then((invite) => {
    if (!invite) { runGarageIdleWork(); return; }
    setTimeout(() => { if (game.phase === 'garage' && !battleEntryLifecycle.pending) runGarageIdleWork(); }, INVITE_GARAGE_IDLE_DELAY_MS);
  }, () => runGarageIdleWork());
} else runGarageIdleWork();
window.__BOOT_TIMINGS = BOOT_TIMINGS;
window.__BOOT_MS = Math.round(performance.now() - BOOT_T0);
entryTelemetry.send({
  kind: 'boot_ready',
  ms: window.__BOOT_MS,
  mode: STUDIO_BOOT_INTENT ? 'studio' : 'unknown',
  // Stage durations and gaps only (the client keeps 24, named stages first):
  // BOOT_TIMINGS also carries nested per-pass diagnostics.
  timings: Object.fromEntries(Object.entries(BOOT_TIMINGS).filter(([, value]) => typeof value === 'number')),
});
// Direct Studio navigation skips garage-only construction on the critical
// path. (261) The workshop shell and the hero wait for a sign the Studio is being
// left (its Exit under the pointer or the focus, studioPanel.ts): built in the idle
// after boot they cost the Studio 2.5-3 s of build and program links while it was
// in use. An exit without that sign builds them behind its cover (garageReturn).
if (STUDIO_BOOT_INTENT) {
  const prepareGarageForExit = () => {
    window.removeEventListener('cot:studio-exit-intent', prepareGarageForExit);
    requestQuietIdle(async () => {
      await garageDressing.pump();
      if (!pedestal.current) await pedestal.set(selectedVehicle.id, true);
    });
  };
  window.addEventListener('cot:studio-exit-intent', prepareGarageForExit);
}
// MOBILE r3: black-scene watchdog — the owner's iPhone passes every synthetic
// probe yet renders the REAL scene's lit meshes black. Sample the actual
// garage frame shortly after ready; if the lit band reads black, shadows-off
// rescue + recompile (deviceDiag.ts). Skipped under webdriver so harness
// captures stay deterministic; a second check runs at battle start.
if (!navigator.webdriver || new URLSearchParams(location.search).has('diagforce')) {
  const garageWatchdogGeneration = sceneWatchdogEntryGeneration;
  const garageWatchdogWorld = currentWorld();
  const isCurrentGarage = () => game.phase === 'garage' && !studio.active && !battleEntryLifecycle.pending
    && currentWorld() === garageWatchdogWorld && sceneWatchdogEntryGeneration === garageWatchdogGeneration;
  const garageWatchdogSettled = scheduleSceneWatchdog({ delayMs: 1200, isCurrent: isCurrentGarage,
    diagnosticContext: { phase: 'garage', entryGeneration: garageWatchdogGeneration, mapId: garageWatchdogWorld?.mapId ?? null },
    run: onMeasurements => runSceneBlackWatchdogAsync(renderer, scene, camera, {
      isCurrent: isCurrentGarage, measureTimings: true, onMeasurements,
    }),
  });
  // MOBILE r5: if the boot probe turned shadows off (one-boot false-negatives
  // happen — the owner's phone), try them back on once the live scene proves
  // healthy; keep only if the measured frame stays healthy (deviceDiag.ts).
  scheduleSceneWatchdog({ delayMs: 3400, isCurrent: isCurrentGarage,
    run: async () => {
      await garageWatchdogSettled;
      if (isCurrentGarage()) reclaimShadows(renderer, scene, camera);
    },
  });
}
