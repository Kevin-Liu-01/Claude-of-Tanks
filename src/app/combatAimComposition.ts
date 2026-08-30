import type { PerspectiveCamera } from 'three';
import {
  createCameraRig,
  type CameraEntity,
  type CameraRaycast,
  type CameraRig,
  type CameraRigDeps,
} from '../engine/cameraRig.ts';
import {
  createBattleClientAccess,
  type BattleClientAccess,
} from '../game/battleClientAccess.ts';
import type { AimControllerDependencies } from '../game/aimController.ts';
import type { ShellCard } from '../game/playerBattleActions.ts';
import type { MainEntity, MainGameState } from './mainContracts.ts';

type CombatRaycast = CameraRaycast & AimControllerDependencies['worldRaycast'];

export interface CombatAimCompositionOptions {
  camera: PerspectiveCamera;
  heightField: CameraRigDeps['heightField'];
  getGame(): MainGameState;
  worldRaycast: CombatRaycast;
  getShellCards(): ShellCard[];
}

export interface CombatAimComposition {
  battleClient: BattleClientAccess;
  rig: CameraRig;
  targetVisible: AimControllerDependencies['targetVisible'];
}

function hasActiveTankState(
  entity: MainEntity | null,
): entity is MainEntity & { state: NonNullable<MainEntity['state']> } {
  return entity?.state != null;
}

/** Compose the shared camera, screen-reticle, and physical-bore owner. */
export function createCombatAimComposition({
  camera,
  heightField,
  getGame,
  worldRaycast,
  getShellCards,
}: CombatAimCompositionOptions): CombatAimComposition {
  let rig!: CameraRig;
  const targetVisible: AimControllerDependencies['targetVisible'] = (target) => {
    const game = getGame();
    return !game.spotting || game.spotting.isSpotted(target.id, 'player', game.player);
  };
  const battleClient = createBattleClientAccess(() => {
    const game = getGame();
    return {
      getGame: () => game,
      getRig: () => rig,
      worldRaycast,
      targetVisible,
      getShellCards,
      computeDispersion: battleClient.computeDispersionRadM,
    };
  });

  const activeCameraPlayer = (): CameraEntity | null => {
    const player = getGame().player;
    return hasActiveTankState(player) ? player : null;
  };
  rig = createCameraRig(camera, {
    heightField,
    raycast: worldRaycast,
    aimRaycast: battleClient.aimController.raycast,
    getPlayer: activeCameraPlayer,
  });

  return { battleClient, rig, targetVisible };
}
