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
import { battleBands, setBattleSightShift } from '../ui/battleSight.ts';

/** (battle-camera-264) `?chaseFraming=0`: the chase camera as it stood before the framing (13 m back, 1.0 m over the
 *  turret, no lens shift), for an A/B on one build; the camera settings still apply. */
const CHASE_FRAMING = typeof location === 'undefined' || !/[?&]chaseFraming=0(&|$)/.test(location.search ?? '');

type CombatRaycast = CameraRaycast & AimControllerDependencies['worldRaycast'];

interface CombatAimCompositionOptions {
  camera: PerspectiveCamera;
  heightField: CameraRigDeps['heightField'];
  getGame(): MainGameState;
  worldRaycast: CombatRaycast;
  getShellCards(): ShellCard[];
  getIsometricView?(): boolean;
  /** The player's chase camera settings (input.ts: height, distance, shoulder, framing, field of view). */
  getCameraSettings?: CameraRigDeps['getCameraSettings'];
  /** (perf-245) a spectate handover's destination, warmed on the way (engine/cameraDestinationWarm.ts). */
  prepareDestination?: CameraRigDeps['prepareDestination'];
}

interface CombatAimComposition {
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
  getIsometricView,
  getCameraSettings,
  prepareDestination,
}: CombatAimCompositionOptions): CombatAimComposition {
  let rig!: CameraRig;
  const targetVisible: AimControllerDependencies['targetVisible'] = (target) => {
    const game = getGame();
    // the local view's side: the player's (a watcher's taken seat may be on either), the allied side otherwise
    return !game.spotting || game.spotting.isSpotted(target.id, game.player?.team ?? 'player', game.player);
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
    getIsometricView,
    prepareDestination,
    // (battle-camera-264) the chase framing clears the HUD's bands, and the HUD's sight bands follow its lens shift
    getChaseBands: CHASE_FRAMING ? battleBands : () => null,
    getCameraSettings,
    publishSightShift: setBattleSightShift,
  });

  return { battleClient, rig, targetVisible };
}
