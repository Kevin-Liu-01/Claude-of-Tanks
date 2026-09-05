import type { RuntimeValue } from '../runtimeTypes.ts';
import { MathUtils, type Scene, type Vector3 } from 'three';
import { mulberry32 } from '../game/stateCore.ts';
import type { ShotViewName } from './shotContract.ts';
import type {
  ShotBus,
  ShotEntity,
  ShotFx,
  ShotGame,
  ShotGarage,
  ShotGarageDressing,
  ShotHud,
  ShotKillcam,
  ShotRig,
  ShotShowroom,
  ShotViewDependencies,
  ShotVisual,
  ShotWorld,
} from './shotViews.ts';

const VIEW_TIME: Readonly<Partial<Record<ShotViewName, number>>> = {
  battlefield: 2.0,
  player_view: 1.0,
  sniper_view: 1.2,
  tank_closeup_modern: 0.8,
  tank_closeup_ww2: 0.9,
  tank_closeup_t90m: 0.8,
  tank_closeup_leo2a7: 0.8,
  combat_firing: 0.5,
  explosion: 1.5,
  garage: 0.7,
  battlefield_desert: 2.0,
  battlefield_winter: 2.0,
  battlefield_urban: 2.0,
  battlefield_coastal: 2.0,
  battlefield_autumn: 2.0,
  battlefield_steppe: 2.0,
  battlefield_railyard: 2.0,
  battlefield_frontier: 2.0,
  battlefield_fjord: 2.0,
  battlefield_delta: 2.0,
  battlefield_badlands: 2.0,
  battlefield_monsoon: 2.0,
  battlefield_alpine: 2.0,
  battlefield_caldera: 2.0,
  battlefield_foundry: 2.0,
  battlefield_ruinspires: 2.0,
  battlefield_blackglass: 2.0,
  battlefield_titan_gorge: 2.0,
  battlefield_skybridge: 2.0,
  killcam_firing: 1.0,
  killcam_collision: 1.0,
  killcam_xray: 1.0,
};

const VIEW_MAP: Partial<Record<ShotViewName, string>> = {
  battlefield_desert: 'desert',
  battlefield_winter: 'winter',
  battlefield_urban: 'urban',
  battlefield_coastal: 'coastal',
  battlefield_autumn: 'autumn',
  battlefield_steppe: 'steppe',
  battlefield_railyard: 'railyard',
  battlefield_frontier: 'frontier',
  battlefield_fjord: 'fjord',
  battlefield_delta: 'delta',
  battlefield_badlands: 'badlands',
  battlefield_monsoon: 'monsoon',
  battlefield_alpine: 'alpine',
  battlefield_caldera: 'caldera',
  battlefield_foundry: 'foundry',
  battlefield_ruinspires: 'ruinspires',
  battlefield_blackglass: 'blackglass',
  battlefield_titan_gorge: 'titan_gorge',
  battlefield_skybridge: 'skybridge',
};

interface ShotRuntimeEntity extends ShotEntity {
  input: { throttle: number; steer: number; brake: boolean; fire: boolean };
  equip?: RuntimeValue;
  visual: ShotVisual & {
    setGroundSampler?(sampler: RuntimeValue): void;
  };
}

interface ShotRuntimeGame extends Omit<ShotGame, 'player' | 'tanks'> {
  phase: string;
  tanks: ShotRuntimeEntity[];
  allTanks: ShotRuntimeEntity[];
  player: ShotRuntimeEntity;
  shells: RuntimeValue[];
}

interface ForcedAim {
  distM: number;
  dispersionRadM: number;
  penRatio: number | null;
  gunDistM?: number;
  gunTargetId?: string | null;
  reload: { t: number; totalS: number; kind?: string };
  magazine?: { rounds: number; capacity: number };
  shellSlot: number;
  zoom?: number;
  [key: string]: RuntimeValue;
}

interface RuntimeShotWorld extends ShotWorld {
  mapId: string;
  config: {
    shot: {
      pos: readonly [number, number, number];
      look: readonly [number, number, number];
    };
  };
  setSniperFade(value: number, immediate: boolean, fovDeg: number, aimDistM: number): void;
  setWindTime(timeS?: number): void;
}

interface RuntimeShotHud extends ShotHud {
  update(frame: ShotFrameInfo): void;
  forceAimDisplay(frame: RuntimeValue): void;
}

interface RuntimeShotFx extends ShotFx {
  resetAll(): void;
  resetSeed(seed: number): void;
  setFrozen(frozen: boolean, timeS?: number | null): void;
}

interface RuntimeShotKillcam extends ShotKillcam {
  cancel(): void;
}

interface ShotFrameAim {
  point: Vector3;
  distM: number;
  dispersionRadM: number;
  penRatio: number | null;
  gunDistM: number;
  gunTargetId: string | null;
  singleReticle: boolean;
  blockedDistM: number | null;
  blockedLabel: boolean;
  atGunLimit: boolean;
  gunLimitSpec: boolean;
  reload: { t: number; totalS: number; kind: string };
  magazine: { rounds: number; capacity: number };
  shellSlot: number;
  shells: readonly RuntimeValue[];
  zoom: number;
  gunMarker: Vector3;
}

interface ShotFrameInfo {
  timeS: number;
  mode: string;
  player: ShotRuntimeEntity;
  shells: RuntimeValue[];
  aim: ShotFrameAim;
}

interface ShotRuntimeContext {
  preloadSoloBattleRuntime(): Promise<RuntimeValue>;
  preloadBattleClientRuntime(): Promise<RuntimeValue>;
  ensureBattleHud(): Promise<RuntimeValue>;
  ensureTouchControls(): Promise<RuntimeValue>;
  ensureFullFleet(): Promise<RuntimeValue>;
  ensureFxRuntime(): Promise<RuntimeValue>;
  ensureKillcamRuntime(): Promise<RuntimeValue>;
  preloadBattleWarm(): Promise<RuntimeValue>;
  preloadArmorAimOverlay(): Promise<RuntimeValue>;
  switchMap(mapId: string): Promise<RuntimeValue>;
  setWorldDormant(dormant: boolean): void;
  setCamoBiome(mapId: string): void;
  applyCamoPatterns(): void;
  setupBattle(game: ShotRuntimeGame, playerSpecId: string, world: RuntimeShotWorld): void;
  resetCombatWarm(): void;
  drainCombatWarm(): void;
  buildShellCards(spec: ShotEntity['spec']): void;
  setDamagePanelTank(spec: ShotEntity['spec'], visual: ShotVisual): void;
  setDamagePanelEquipment(equipment: RuntimeValue): void;
  groundSampler: RuntimeValue;
  input: { setEnabled(enabled: boolean): void };
  settings: { isOpen(): boolean; close(): void };
  showroom: ShotShowroom & { stop(): void };
  setShotMode(enabled: boolean): void;
  setCaptureHidden(hidden: boolean): void;
  resetPostPerfTrims(): void;
  setShotHudFrame(enabled: boolean): void;
  setGarageSpots(enabled: boolean): void;
  setGarageSunTrim(enabled: boolean): void;
  hideGarage(): void;
  hideEndOverlay(): void;
  setLastFov(fov: number): void;
  refreshSpotFrame(): void;
  getWorld(): RuntimeShotWorld;
  getHud(): RuntimeShotHud;
  getFx(): RuntimeShotFx;
  getKillcam(): RuntimeShotKillcam;
  getShellCards(): readonly RuntimeValue[];
  game: ShotRuntimeGame;
  frameInfo: ShotFrameInfo;
  rig: ShotRig & { aimPoint: Vector3; mode: string; aimDist: number };
  camera: {
    fov: number;
    updateProjectionMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
  };
  lighting: {
    setFarCascadeDormant(dormant: boolean): void;
    updateFrustums(): void;
    update(force?: boolean): void;
  };
  scene: Scene;
  scratch1: Vector3;
  scratch2: Vector3;
  scratch3: Vector3;
  computeDispersionRadM: ShotViewDependencies['computeDispersionRadM'];
  bus: ShotBus;
  setPedestalTank: ShotViewDependencies['setPedestalTank'];
  garage: ShotGarage;
  garageDressing: ShotGarageDressing;
  tankPoseFromState: ShotViewDependencies['tankPoseFromState'];
  traceTank: ShotViewDependencies['traceTank'];
  createShell: ShotViewDependencies['createShell'];
  resolveShellHit: ShotViewDependencies['resolveShellHit'];
  createCombatState: ShotViewDependencies['createCombatState'];
}

async function ensureShotWorld(
  context: ShotRuntimeContext,
  mapId: string,
  playerSpecId: string,
): Promise<void> {
  await Promise.all([
    context.preloadSoloBattleRuntime(),
    context.preloadBattleClientRuntime(),
    context.ensureBattleHud(),
    context.ensureTouchControls(),
  ]);
  let world = context.getWorld();
  if (!world || world.mapId !== mapId) await context.switchMap(mapId);
  world = context.getWorld();
  context.lighting.setFarCascadeDormant(false);
  context.setWorldDormant(false);
  context.setCamoBiome(mapId);
  context.applyCamoPatterns();
  context.setupBattle(context.game, playerSpecId, world);
  context.resetCombatWarm();
  context.buildShellCards(context.game.player.spec);
  context.setDamagePanelTank(context.game.player.spec, context.game.player.visual);
  context.setDamagePanelEquipment(context.game.player.equip);
  for (const entity of context.game.allTanks) {
    entity.visual?.setGroundSampler?.(context.groundSampler);
  }
}

function createRecipeHelpers(context: ShotRuntimeContext) {
  const { game, rig, scratch1, scratch2 } = context;

  const mapEstablishingShot = (): void => {
    const world = context.getWorld();
    context.getHud().setMode('hidden');
    const shot = world.config.shot;
    scratch1.set(
      shot.pos[0],
      world.heightField.getHeightAt(shot.pos[0], shot.pos[2]) + shot.pos[1],
      shot.pos[2],
    );
    scratch2.set(
      shot.look[0],
      world.heightField.getHeightAt(shot.look[0], shot.look[2]) + shot.look[1],
      shot.look[2],
    );
    rig.setExternalPose(scratch1, scratch2, 55);
  };

  const closeupStage = (entity: ShotEntity): void => {
    entity.state.yaw = MathUtils.degToRad(98);
    entity.visual.syncFromState(entity.state);
  };

  const orbitPose = (
    entity: ShotEntity,
    distM: number,
    azimuthDeg: number,
    elevationDeg: number,
    fovDeg: number,
  ): void => {
    const azimuth = entity.state.yaw + azimuthDeg * MathUtils.DEG2RAD;
    const elevation = elevationDeg * MathUtils.DEG2RAD;
    scratch2.copy(entity.state.pos);
    scratch2.y += entity.spec.dims.heightM * 0.55;
    scratch1.set(
      scratch2.x + Math.sin(azimuth) * Math.cos(elevation) * distM,
      scratch2.y + Math.sin(elevation) * distM,
      scratch2.z + Math.cos(azimuth) * Math.cos(elevation) * distM,
    );
    rig.setExternalPose(scratch1, scratch2, fovDeg);
  };

  const forcedHudFrame = (mode: string, forcedAim: ForcedAim): void => {
    context.setShotHudFrame(true);
    const hud = context.getHud();
    hud.setMode(mode);
    const frame = context.frameInfo;
    frame.timeS = VIEW_TIME.player_view ?? 1;
    frame.mode = mode;
    frame.player = game.player;
    frame.shells = game.shells;
    const aim = frame.aim;
    aim.point.copy(rig.aimPoint);
    aim.distM = forcedAim.distM;
    aim.dispersionRadM = forcedAim.dispersionRadM;
    aim.penRatio = forcedAim.penRatio;
    aim.gunDistM = forcedAim.gunDistM ?? forcedAim.distM;
    aim.gunTargetId = forcedAim.gunTargetId ?? null;
    aim.singleReticle = !!(game.player.spec.hydropneumaticAim
      && game.player.spec.armor?.turretless);
    aim.blockedDistM = null;
    aim.blockedLabel = false;
    aim.atGunLimit = false;
    aim.gunLimitSpec = false;
    aim.reload.t = forcedAim.reload.t;
    aim.reload.totalS = forcedAim.reload.totalS;
    aim.reload.kind = forcedAim.reload.kind || 'shell';
    aim.magazine.rounds = forcedAim.magazine?.rounds || 0;
    aim.magazine.capacity = forcedAim.magazine?.capacity || 0;
    aim.shellSlot = forcedAim.shellSlot;
    aim.shells = context.getShellCards();
    aim.zoom = forcedAim.zoom || 1;
    game.player.visual.gunMuzzleWorld(scratch1);
    aim.gunMarker.copy(rig.aimPoint);
    context.refreshSpotFrame();
    hud.update(frame);
    hud.forceAimDisplay({
      ...forcedAim,
      point: aim.point,
      gunMarker: aim.gunMarker,
      gunDistM: aim.gunDistM,
      gunTargetId: aim.gunTargetId,
      singleReticle: aim.singleReticle,
    });
  };

  return { mapEstablishingShot, closeupStage, orbitPose, forcedHudFrame };
}

/**
 * Acquire and stage one deterministic engineering capture. This entire owner
 * stays out of the normal garage/battle graph until a capture tool explicitly
 * calls window.__SHOTS.set().
 */
export async function setShotView(
  name: ShotViewName,
  context: ShotRuntimeContext,
): Promise<void> {
  const shotViewsPromise = import('./shotViews.ts');
  await Promise.all([
    shotViewsPromise,
    context.ensureFullFleet(),
    context.ensureFxRuntime(),
    context.ensureKillcamRuntime(),
    context.preloadBattleWarm(),
    context.preloadArmorAimOverlay(),
  ]);

  context.showroom.stop();
  context.setShotMode(true);
  context.setCaptureHidden(true);
  context.resetPostPerfTrims();
  context.setShotHudFrame(false);
  context.game.phase = 'shot';
  context.setGarageSpots(true);
  for (const entity of context.game.tanks) {
    entity.input.throttle = 0;
    entity.input.steer = 0;
    entity.input.brake = false;
    entity.input.fire = false;
  }
  context.input.setEnabled(true);
  if (context.settings.isOpen()) context.settings.close();
  context.getKillcam().cancel();

  const featuredPlayerId = name.startsWith('killcam_')
    ? 'm1a2_sepv3'
    : name === 'tank_closeup_t90m'
      ? 't90m'
      : name === 'tank_closeup_leo2a7'
        ? 'leo2a7v'
        : 'm1a2';
  await ensureShotWorld(
    context,
    VIEW_MAP[name] || 'verdant',
    featuredPlayerId,
  );
  const helpers = createRecipeHelpers(context);
  const world = context.getWorld();
  const fx = context.getFx();
  const killcam = context.getKillcam();
  const { createShotViews } = await shotViewsPromise;
  const recipe = createShotViews({
    hud: context.getHud(),
    world,
    _v1: context.scratch1,
    _v2: context.scratch2,
    _v3: context.scratch3,
    rig: context.rig,
    DEG: MathUtils.DEG2RAD,
    forcedHudFrame: helpers.forcedHudFrame,
    computeDispersionRadM: context.computeDispersionRadM,
    game: context.game,
    shellCards: context.getShellCards(),
    scene: context.scene,
    closeupStage: helpers.closeupStage,
    orbitPose: helpers.orbitPose,
    bus: context.bus,
    fx,
    setPedestalTank: context.setPedestalTank,
    garage: context.garage,
    garageDressing: context.garageDressing,
    showroom: context.showroom,
    mapEstablishingShot: helpers.mapEstablishingShot,
    tankPoseFromState: context.tankPoseFromState,
    traceTank: context.traceTank,
    createShell: context.createShell,
    resolveShellHit: context.resolveShellHit,
    createCombatState: context.createCombatState,
    mulberry32,
    VIEW_TIME,
    killcam,
  })[name];

  context.drainCombatWarm();
  context.setGarageSunTrim(name === 'garage');
  context.hideGarage();
  context.hideEndOverlay();
  fx.resetAll();
  fx.resetSeed(5000);
  fx.setFrozen(true, VIEW_TIME[name]);
  world?.setWindTime(VIEW_TIME[name]);
  await recipe();
  const currentWorld = context.getWorld();
  currentWorld?.setSniperFade(
    context.rig.mode === 'SNIPER' ? 1 : 0,
    true,
    context.camera.fov,
    context.rig.aimDist,
  );
  context.camera.updateProjectionMatrix();
  context.camera.updateMatrixWorld(true);
  context.lighting.updateFrustums();
  context.lighting.update(true);
  context.setLastFov(context.camera.fov);
}
