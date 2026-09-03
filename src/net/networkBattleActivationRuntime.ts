import type { RuntimeValue } from '../runtimeTypes.ts';
interface NetworkPlayerSelection {
  id: string;
  specId: string;
}

interface NetworkBattleEntity {
  spec: RuntimeValue;
  visual?: RuntimeValue;
  equip?: RuntimeValue;
  state?: { yaw?: number } | null;
}

interface NetworkBattleGame {
  mapId?: string;
  phase?: string;
  player?: NetworkBattleEntity | null;
}

interface NetworkFxPort {
  setFrozen(frozen: boolean): void;
  resetAll(): void;
}

interface SettingsPort {
  isOpen(): boolean;
  close(options: { noRelock: boolean }): void;
}

interface KillcamPort {
  cancel(): void;
  spectate: {
    targetId?: string | null;
    startObserver(): boolean;
  };
}

interface HudPort {
  shotInfo: { setPlayer(playerId: string): void };
  setMode(mode: string): void;
}

interface PlayerActionsPort {
  setTank(spec: RuntimeValue): void;
  resetConsumables(): void;
}

interface DamagePanelPort {
  setTank(spec: RuntimeValue, visual?: RuntimeValue): void;
  setEquipment(equipment: RuntimeValue): void;
}

interface CameraRigPort {
  release(): void;
  snapArcade(distance: number, yaw: number, pitch: number): void;
}

interface NetworkBridgePort {
  setPerspective(entityId: string | null | undefined): void;
}

interface WorldPort {
  resetDestructibles?(): void;
}

interface ActivationPresentationPorts {
  setShotMode(active: boolean): void;
  setCaptureHidden(hidden: boolean): void;
  setNetworkSpectator(spectator: boolean): void;
  setSelectedSpecId(specId: string): void;
  rememberSpecId(specId: string): void;
  setWorldDormant(dormant: boolean): void;
  getWorld(): WorldPort | null;
  setCamoBiome(mapId: string): void;
  hideGarage(): void;
  hideEndOverlay(): void;
  resetBattleResult(): void;
  setGarageSpots(active: boolean): void;
  setGarageSunTrim(active: boolean): void;
  emitPhaseChange(phase: 'battle'): void;
  emitConsumableReset(): void;
  stopShowroom(): void;
}

export interface NetworkBattleActivationOptions {
  game: NetworkBattleGame;
  settings: SettingsPort;
  killcam: KillcamPort;
  driveTest: { resetAim(): void };
  getHud(): HudPort | null;
  playerActions: PlayerActionsPort;
  getDamagePanel(): DamagePanelPort | null;
  rig: CameraRigPort;
  presentation: ActivationPresentationPorts;
  arcadeDistance?: number;
  arcadePitchRad?: number;
}

export interface NetworkBattleActivationRequest {
  viewerId: string;
  own: NetworkPlayerSelection;
  spectator: boolean;
  mapId: string;
  bridge: NetworkBridgePort;
  fx: NetworkFxPort;
}

export interface NetworkBattleActivationRuntime {
  activate(request: NetworkBattleActivationRequest): void;
}

/** Transfer a prepared network world/bridge into the one live battle phase. */
export function createNetworkBattleActivationRuntime({
  game,
  settings,
  killcam,
  driveTest,
  getHud,
  playerActions,
  getDamagePanel,
  rig,
  presentation,
  arcadeDistance = 2,
  arcadePitchRad = -10 * Math.PI / 180,
}: NetworkBattleActivationOptions): NetworkBattleActivationRuntime {
  const required = [settings?.isOpen, settings?.close, killcam?.cancel,
    killcam?.spectate?.startObserver, driveTest?.resetAim,
    getHud, playerActions?.setTank, playerActions?.resetConsumables,
    getDamagePanel, rig?.release, rig?.snapArcade,
    presentation?.setShotMode, presentation?.setCaptureHidden,
    presentation?.setNetworkSpectator, presentation?.setSelectedSpecId,
    presentation?.rememberSpecId, presentation?.setWorldDormant,
    presentation?.getWorld, presentation?.setCamoBiome,
    presentation?.hideGarage, presentation?.hideEndOverlay,
    presentation?.resetBattleResult, presentation?.setGarageSpots,
    presentation?.setGarageSunTrim, presentation?.emitPhaseChange,
    presentation?.emitConsumableReset, presentation?.stopShowroom];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network battle activation requires every presentation port');
  }

  return {
    activate({ viewerId, own, spectator, mapId, bridge, fx }) {
      if (!viewerId || !own?.specId || !mapId || !bridge || !fx) {
        throw new TypeError('network battle activation requires a complete request');
      }
      const hud = getHud();
      const damagePanel = getDamagePanel();
      if (typeof hud?.shotInfo?.setPlayer !== 'function'
          || typeof hud?.setMode !== 'function'
          || typeof damagePanel?.setTank !== 'function'
          || typeof damagePanel?.setEquipment !== 'function') {
        throw new Error('The battle interface is unavailable during network activation.');
      }
      presentation.setShotMode(false);
      presentation.setCaptureHidden(false);
      fx.setFrozen(false);
      if (settings.isOpen()) settings.close({ noRelock: true });
      killcam.cancel();
      presentation.setNetworkSpectator(spectator);
      if (!spectator) {
        presentation.setSelectedSpecId(own.specId);
        presentation.rememberSpecId(own.specId);
      }
      driveTest.resetAim();
      presentation.setWorldDormant(false);
      presentation.getWorld()?.resetDestructibles?.();
      game.mapId = mapId;
      presentation.setCamoBiome(mapId);
      hud.shotInfo.setPlayer(viewerId);
      fx.resetAll();

      if (!spectator) {
        const player = game.player;
        if (!player) throw new Error('The local network vehicle is unavailable.');
        playerActions.setTank(player.spec);
        damagePanel.setTank(player.spec, player.visual);
        damagePanel.setEquipment(player.equip ?? {});
      }

      presentation.hideGarage();
      presentation.hideEndOverlay();
      presentation.resetBattleResult();
      hud.setMode('battle');
      game.phase = 'battle';
      presentation.setGarageSpots(false);
      presentation.setGarageSunTrim(false);
      presentation.emitPhaseChange('battle');
      playerActions.resetConsumables();
      presentation.emitConsumableReset();
      rig.release();

      if (spectator) {
        if (!killcam.spectate.startObserver()) {
          throw new Error('No live vehicle is available to spectate.');
        }
        bridge.setPerspective(killcam.spectate.targetId);
      } else {
        rig.snapArcade(
          arcadeDistance,
          game.player?.state?.yaw ?? 0,
          arcadePitchRad,
        );
      }
      presentation.stopShowroom();
    },
  };
}
