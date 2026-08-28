import { Object3D, PerspectiveCamera, Vector3 } from 'three';

import type { AimController, AimFrame } from './aimController.ts';
import type {
  ArmorAimOverlayRuntime,
  ArmorOverlayModel,
  ArmorOverlayTarget,
} from './armorAimOverlay.ts';
import type { GameState } from './stateCore.ts';
import type { DamageShellSpec } from '../sim/damage.ts';

interface HudTankEntity extends ArmorOverlayTarget {
  team: string;
  combat?: { destroyed?: boolean; shellSlot?: number; eraSpent?: Set<string> } | null;
  visual?: { root: Object3D };
  spec?: {
    armor?: ArmorOverlayModel;
    gun?: { shells?: DamageShellSpec[] };
  };
}

interface HudSpottingState {
  isSpotted(id: string, team: string, receiver: HudTankEntity | null): boolean;
  getConcealment(entity: HudTankEntity, timeS: number): unknown;
}

interface HudRuntime {
  update(frame: BattleHudFrameInfo): void;
}

interface DamagePanelRuntime {
  update(combat: unknown): void;
}

interface NetworkBridgeView {
  entities: Map<string, HudTankEntity>;
  roster: unknown[];
  setPerspective(entityId: string): void;
}

interface NetworkSessionView {
  match: { client?: { rttMs?: number } | null } | null;
  spectator: boolean;
  bridge: NetworkBridgeView | null;
}

interface KillcamView {
  isActive(): boolean;
  spectate: { active: boolean; targetId: string | null };
}

interface InputView {
  getSettings(): { armorAimOverlay?: boolean };
}

interface CameraRigView {
  mode: string;
}

export interface BattleHudSpotFrame {
  receiver: HudTankEntity | null;
  isSpotted(id: string): boolean;
  player: unknown;
}

export interface BattleHudFrameInfo {
  timeS: number;
  pingMs: number;
  mode: string;
  camera: PerspectiveCamera;
  player: HudTankEntity | null;
  tanks: unknown[];
  rosterTanks?: unknown[];
  shells: unknown[];
  aim: AimFrame;
  killfeedHandledByBus: boolean;
  spotting: BattleHudSpotFrame | null;
  matchModeState: unknown | null;
}

export interface BattleHudFrameRuntimeOptions {
  game: GameState;
  camera: PerspectiveCamera;
  rig: CameraRigView;
  input: InputView;
  aimController: AimController;
  armorAimOverlay: ArmorAimOverlayRuntime;
  networkSession: NetworkSessionView;
  killcam: KillcamView;
  muzzleScratch: Vector3;
  getHud(): HudRuntime;
  getDamagePanel(): DamagePanelRuntime;
  now?: () => number;
}

export interface BattleHudFrameRuntime {
  readonly frameInfo: BattleHudFrameInfo;
  refreshSpotting(focus?: unknown): void;
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
export function createBattleHudFrameRuntime({
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
}: BattleHudFrameRuntimeOptions): BattleHudFrameRuntime {
  const required = [aimController?.update, armorAimOverlay?.update,
    armorAimOverlay?.hide, killcam?.isActive, getHud, getDamagePanel, now];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle HUD frame runtime requires every presentation port');
  }

  const frameInfo: BattleHudFrameInfo = {
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
  };

  const armorTargets: HudTankEntity[] = [];
  const spotFrame: BattleHudSpotFrame = {
    receiver: null,
    isSpotted(id) {
      const spotting = game.spotting as HudSpottingState | null;
      return spotting
        ? spotting.isSpotted(id, 'player', spotFrame.receiver || player())
        : true;
    },
    player: null,
  };

  const tanks = (): HudTankEntity[] => game.tanks as HudTankEntity[];
  const player = (): HudTankEntity | null => game.player as HudTankEntity | null;

  const refreshSpotting = (focus: unknown = game.player): void => {
    const entity = focus as HudTankEntity | null;
    const spotting = game.spotting as HudSpottingState | null;
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

  const update = (inBattle: boolean, killcamActive: boolean): void => {
    const bridge = networkSession.bridge;
    const observerFocus = networkSession.spectator && killcam.spectate.active
      ? bridge?.entities.get(killcam.spectate.targetId || '') || null
      : null;
    const focus = player() || observerFocus;
    if (observerFocus) bridge?.setPerspective(observerFocus.id);

    // Use both the frame-top latch and the live state. A replay can begin in
    // the simulation step immediately before this operation.
    if (!inBattle || !focus || killcamActive || killcam.isActive()) {
      armorAimOverlay.hide();
      return;
    }

    frameInfo.timeS = game.timeS;
    frameInfo.pingMs = networkSession.match
      ? networkSession.match.client?.rttMs ?? 0
      : 0;
    frameInfo.mode = rig.mode === 'SNIPER' ? 'sniper' : 'battle';
    frameInfo.player = focus;
    frameInfo.tanks = game.tanks;
    frameInfo.rosterTanks = bridge?.roster || game.tanks;
    frameInfo.shells = game.shells;
    frameInfo.matchModeState = game.matchModeState;
    refreshSpotting(focus);

    const localPlayer = player();
    if (localPlayer) aimController.update(frameInfo.aim);
    getHud().update(frameInfo);

    if (localPlayer) {
      const armorEnabled = !!input.getSettings().armorAimOverlay;
      const armorScoped = rig.mode === 'SNIPER' && !!camera.userData.scoped;
      armorTargets.length = 0;
      if (armorEnabled && armorScoped) {
        for (const entity of tanks()) {
          if (entity === localPlayer || entity.team === localPlayer.team ||
              entity.combat?.destroyed || !entity.visual?.root?.visible) continue;
          armorTargets.push(entity);
        }
      }
      const shellSlot = localPlayer.combat?.shellSlot ?? 0;
      armorAimOverlay.update({
        enabled: armorEnabled,
        scoped: armorScoped,
        targets: armorTargets,
        shellSpec: localPlayer.spec?.gun?.shells?.[shellSlot],
        muzzle: muzzleScratch,
        nowMs: now(),
      });
    } else {
      armorAimOverlay.hide();
    }
    getDamagePanel().update(focus.combat);
  };

  return {
    frameInfo,
    refreshSpotting,
    redrawFrozen: () => { getHud().update(frameInfo); },
    reset,
    update,
  };
}
