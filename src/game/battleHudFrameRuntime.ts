import type { RuntimeValue } from '../runtimeTypes.ts';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';

import type { AimController, AimFrame } from './aimController.ts';
import type {
  ArmorAimOverlayRuntime,
  ArmorOverlayTarget,
} from './armorAimOverlay.ts';
import type { GameState } from './stateCore.ts';
import type { DamagePanelController } from '../ui/damagePanel.ts';
import type {
  ConcealmentView,
  HudFrame,
  HudMatchModeState,
  HudMode,
  HudRuntime,
  HudSpottingView,
  HudTank,
} from '../ui/hud.ts';

type HudTankEntity = HudTank & ArmorOverlayTarget & {
  team: string;
  visual?: (NonNullable<HudTank['visual']> & { root: Object3D }) | null;
};

interface HudSpottingState<TEntity extends HudTankEntity> {
  isSpotted(id: string, team: string, receiver: TEntity | null): boolean;
  getConcealment(entity: TEntity, timeS: number): ConcealmentView;
}

type HudUpdateRuntime = Pick<HudRuntime, 'update'>;
type DamagePanelRuntime = Pick<DamagePanelController, 'update'>;

interface NetworkBridgeView {
  entities: ReadonlyMap<string, RuntimeValue>;
  roster?: HudTank[];
  setPerspective?(entityId: string): RuntimeValue;
}

interface NetworkSessionView {
  match: {
    client?: { getStats?(): Record<string, RuntimeValue> | null } | null;
  } | null;
  spectator: boolean;
  bridge: NetworkBridgeView | null;
}

interface KillcamView {
  isActive(): boolean;
  spectate: { active: boolean; targetId: string | null };
}

interface InputView {
  getSettings(): { armorAimOverlay?: boolean };
  getBinding(actionId: 'selfRight'): string | null;
  labelFor(code: string | null): string;
}

interface CameraRigView {
  mode: string;
}

function isHudTankEntity(value: RuntimeValue): value is HudTankEntity {
  return !!value && typeof value === 'object'
    && typeof Reflect.get(value, 'id') === 'string'
    && typeof Reflect.get(value, 'team') === 'string'
    && (Reflect.get(value, 'state') == null
      || typeof Reflect.get(value, 'state') === 'object')
    && (Reflect.get(value, 'combat') == null
      || typeof Reflect.get(value, 'combat') === 'object')
    && (Reflect.get(value, 'spec') == null
      || typeof Reflect.get(value, 'spec') === 'object')
    && (Reflect.get(value, 'visual') == null
      || typeof Reflect.get(value, 'visual') === 'object');
}

export interface BattleHudSpotFrame<TEntity extends HudTankEntity = HudTankEntity>
  extends HudSpottingView {
  receiver: TEntity | null;
  isSpotted(id: string): boolean;
  player: ConcealmentView | null;
}

export interface BattleHudFrameInfo<TEntity extends HudTankEntity = HudTankEntity>
  extends HudFrame {
  timeS: number;
  pingMs: number;
  mode: HudMode;
  camera: PerspectiveCamera;
  player: TEntity | null;
  tanks: TEntity[];
  rosterTanks?: HudTank[];
  shells: RuntimeValue[];
  aim: AimFrame;
  killfeedHandledByBus: boolean;
  spotting: BattleHudSpotFrame<TEntity> | null;
  matchModeState: HudMatchModeState | null;
}

type BattleHudGameState<TEntity extends HudTankEntity> = Omit<
  GameState<TEntity, HudSpottingState<TEntity>>,
  'matchModeState'
> & { matchModeState: HudMatchModeState | null };

export interface BattleHudFrameRuntimeOptions<TEntity extends HudTankEntity> {
  game: BattleHudGameState<TEntity>;
  camera: PerspectiveCamera;
  rig: CameraRigView;
  input: InputView;
  aimController: AimController;
  armorAimOverlay: ArmorAimOverlayRuntime;
  networkSession: NetworkSessionView;
  killcam: KillcamView;
  muzzleScratch: Vector3;
  getHud(): HudUpdateRuntime | null;
  getDamagePanel(): DamagePanelRuntime | null;
  now?: () => number;
}

export interface BattleHudFrameRuntime<TEntity extends HudTankEntity = HudTankEntity> {
  readonly frameInfo: BattleHudFrameInfo<TEntity>;
  refreshSpotting(): void;
  redrawFrozen(): void;
  reset(): void;
  update(inBattle: boolean, killcamActive: boolean): void;
}

/**
 * Owns the complete live HUD frame transaction. The mutable frame and target
 * arrays are retained for the lifetime of the runtime, so callers receive one
 * allocation-free update operation instead of rebuilding presentation policy
 * inside the renderer loop.
 */
export function createBattleHudFrameRuntime<TEntity extends HudTankEntity>({
  game,
  camera,
  rig,
  input,
  aimController,
  armorAimOverlay,
  networkSession,
  killcam,
  muzzleScratch,
  getHud,
  getDamagePanel,
  now = () => performance.now(),
}: BattleHudFrameRuntimeOptions<TEntity>): BattleHudFrameRuntime<TEntity> {
  const required = [aimController?.update, armorAimOverlay?.update,
    armorAimOverlay?.hide, killcam?.isActive, getHud, getDamagePanel, now];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle HUD frame runtime requires every presentation port');
  }

  const requireHud = (): HudUpdateRuntime => {
    const runtime = getHud();
    if (!runtime) throw new Error('battle HUD runtime has not been acquired');
    return runtime;
  };
  const requireDamagePanel = (): DamagePanelRuntime => {
    const runtime = getDamagePanel();
    if (!runtime) throw new Error('battle damage panel has not been acquired');
    return runtime;
  };

  const frameInfo: BattleHudFrameInfo<TEntity> = {
    timeS: 0,
    pingMs: 0,
    mode: 'battle',
    camera,
    player: null,
    tanks: game.tanks,
    shells: game.shells,
    aim: {
      point: new Vector3(),
      distM: 0,
      dispersionRadM: 1,
      penRatio: null,
      blockedDistM: null,
      blockedLabel: false,
      gunMarker: new Vector3(),
      gunDistM: 0,
      gunTargetId: null,
      singleReticle: false,
      atGunLimit: false,
      gunLimitSpec: false,
      reload: { t: 0, totalS: 1, kind: 'ready' },
      magazine: { rounds: 0, capacity: 0 },
      shellSlot: 0,
      shells: [],
      zoom: 1,
    },
    killfeedHandledByBus: true,
    spotting: null,
    matchModeState: null,
    selfRightKeyLabel: 'F',
  };

  const armorTargets: TEntity[] = [];
  const spotFrame: BattleHudSpotFrame<TEntity> = {
    receiver: null,
    isSpotted(id) {
      const spotting = game.spotting;
      return spotting
        ? spotting.isSpotted(id, 'player', spotFrame.receiver || player())
        : true;
    },
    player: null,
  };

  const tanks = (): TEntity[] => game.tanks;
  const player = (): TEntity | null => game.player;

  const bridgeEntity = (value: RuntimeValue): TEntity | null => {
    // Network presentation entities implement the same HUD contract as the
    // local roster. Validate that contract at the transport boundary; the
    // generic identity itself cannot be recovered from erased wire data.
    return isHudTankEntity(value) ? value as TEntity : null;
  };

  const updateSpotting = (entity: TEntity | null): void => {
    const spotting = game.spotting;
    spotFrame.receiver = entity;
    spotFrame.player = spotting && entity?.state
      ? spotting.getConcealment(entity, game.timeS)
      : null;
    frameInfo.spotting = spotFrame;
  };

  const reset = (): void => {
    frameInfo.player = null;
    frameInfo.tanks = game.tanks;
    frameInfo.shells = game.shells;
    frameInfo.matchModeState = game.matchModeState;
  };

  const observerFocus = (bridge: NetworkBridgeView | null): TEntity | null => {
    if (!networkSession.spectator || !killcam.spectate.active) return null;
    return bridgeEntity(bridge?.entities.get(killcam.spectate.targetId || ''));
  };

  const writeFrameInfo = (
    focus: TEntity,
    bridge: NetworkBridgeView | null,
  ): void => {
    frameInfo.timeS = game.timeS;
    const rttMs = networkSession.match?.client?.getStats?.()?.rttMs;
    frameInfo.pingMs = Number.isFinite(Number(rttMs)) ? Number(rttMs) : 0;
    frameInfo.mode = rig.mode === 'SNIPER' ? 'sniper' : 'battle';
    frameInfo.player = focus;
    frameInfo.tanks = game.tanks;
    frameInfo.rosterTanks = bridge?.roster || game.tanks;
    frameInfo.shells = game.shells;
    frameInfo.matchModeState = game.matchModeState;
    frameInfo.selfRightKeyLabel = input.labelFor(input.getBinding('selfRight'));
    updateSpotting(focus);
  };

  const collectArmorTargets = (localPlayer: TEntity, enabled: boolean): void => {
    armorTargets.length = 0;
    if (!enabled) return;
    for (const entity of tanks()) {
      if (entity === localPlayer || entity.team === localPlayer.team) continue;
      if (entity.combat?.destroyed || !entity.visual?.root?.visible) continue;
      armorTargets.push(entity);
    }
  };

  const updateArmorOverlay = (localPlayer: TEntity | null): void => {
    if (!localPlayer) {
      armorAimOverlay.hide();
      return;
    }
    const armorEnabled = !!input.getSettings().armorAimOverlay;
    const armorScoped = rig.mode === 'SNIPER' && !!camera.userData.scoped;
    collectArmorTargets(localPlayer, armorEnabled && armorScoped);
    const shellSlot = localPlayer.combat?.shellSlot ?? 0;
    armorAimOverlay.update({
      enabled: armorEnabled,
      scoped: armorScoped,
      targets: armorTargets,
      shellSpec: localPlayer.spec?.gun?.shells?.[shellSlot],
      muzzle: muzzleScratch,
      nowMs: now(),
    });
  };

  const update = (inBattle: boolean, killcamActive: boolean): void => {
    const bridge = networkSession.bridge;
    const observer = observerFocus(bridge);
    const focus = player() || observer;
    if (observer) bridge?.setPerspective?.(observer.id);

    // Use both the frame-top latch and the live state. A replay can begin in
    // the simulation step immediately before this operation.
    if (!inBattle || !focus || killcamActive || killcam.isActive()) {
      armorAimOverlay.hide();
      return;
    }

    writeFrameInfo(focus, bridge);
    const localPlayer = player();
    if (localPlayer) aimController.update(frameInfo.aim);
    requireHud().update(frameInfo);
    updateArmorOverlay(localPlayer);
    if (focus.combat) requireDamagePanel().update(focus.combat);
  };

  return {
    frameInfo,
    refreshSpotting: () => { updateSpotting(game.player); },
    redrawFrozen: () => { requireHud().update(frameInfo); },
    reset,
    update,
  };
}
