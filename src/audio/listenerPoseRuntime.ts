import { Vector3, type Camera } from 'three';

type AudioListenerKind =
  | 'camera'
  | 'killcam-camera'
  | 'player-tank'
  | 'player-drone'
  | 'spectated-tank';

export interface AudioListenerPose {
  pos: Vector3;
  forward: Vector3;
  kind: AudioListenerKind;
  ownerId: string | null;
  scoped: boolean;
}

interface AudioTank {
  id: string;
  state?: { pos?: Vector3 } | null;
  spec?: { dims?: { heightM?: number } } | null;
  /** Drone mode: the tank's FPV drone, while `active` flying at x, y, z. */
  aerial?: { kind?: string; active?: boolean; x?: number; y?: number; z?: number } | null;
}

interface AudioGame {
  player: AudioTank | null;
  tanks: readonly AudioTank[];
  tankById: ReadonlyMap<string, AudioTank>;
  /** Live projectiles: FPV drones fly as shells in the Drone mode. */
  shells?: readonly unknown[];
}

interface AudioRig {
  mode: string;
}

interface AudioKillcam {
  isActive(): boolean;
  spectate: { active: boolean; targetId: string | null };
}

interface AudioMixer {
  update(dtSeconds: number, listener: AudioListenerPose, tanks: readonly AudioTank[], shells?: readonly unknown[]): void;
}

interface ListenerPoseRuntimeOptions {
  camera: Camera;
  game: AudioGame;
  rig: AudioRig;
  killcam: AudioKillcam;
  audio: AudioMixer;
}

export interface ListenerPoseRuntime {
  readonly pose: AudioListenerPose;
  update(dtSeconds: number, inBattle: boolean, killcamActive: boolean): void;
}

/**
 * Resolve the hybrid listener used by tank audio without allocating per frame.
 * Azimuth follows the camera while world distance follows the occupied or
 * spectated vehicle. While the player flies the drone the listener rides it,
 * so the world (and the tank left behind) is heard from the drone. Kill-cam
 * and non-battle views use the camera position.
 */
export function createListenerPoseRuntime({
  camera,
  game,
  rig,
  killcam,
  audio,
}: ListenerPoseRuntimeOptions): ListenerPoseRuntime {
  const tankPosition = new Vector3();
  const dronePosition = new Vector3();
  const forward = new Vector3();
  const pose: AudioListenerPose = {
    pos: camera.position,
    forward,
    kind: 'camera',
    ownerId: null,
    scoped: false,
  };

  return {
    pose,
    update(dtSeconds, inBattle, killcamActive): void {
      camera.getWorldDirection(forward);
      let entity: AudioTank | null | undefined = null;
      if (inBattle && !killcamActive && !killcam.isActive()) {
        const spectateId = killcam.spectate.active ? killcam.spectate.targetId : null;
        entity = spectateId ? game.tankById.get(spectateId) : game.player;
      }

      const sourcePosition = entity?.state?.pos;
      const drone = entity && entity === game.player && !killcam.spectate.active ? entity.aerial : null;
      if (drone?.kind === 'drone' && drone.active && Number.isFinite(drone.x) && Number.isFinite(drone.y) && Number.isFinite(drone.z)) {
        dronePosition.set(drone.x!, drone.y!, drone.z!);
        pose.pos = dronePosition;
        pose.kind = 'player-drone';
        pose.ownerId = entity!.id;
        pose.scoped = false;
      } else if (entity && sourcePosition) {
        tankPosition.copy(sourcePosition);
        tankPosition.y += entity.spec?.dims?.heightM != null
          ? entity.spec.dims.heightM * 0.68
          : 1.6;
        pose.pos = tankPosition;
        pose.kind = killcam.spectate.active ? 'spectated-tank' : 'player-tank';
        pose.ownerId = entity.id;
        pose.scoped = rig.mode === 'SNIPER' && camera.userData.scoped === true;
      } else {
        pose.pos = camera.position;
        pose.kind = killcamActive || killcam.isActive() ? 'killcam-camera' : 'camera';
        pose.ownerId = null;
        pose.scoped = false;
      }
      audio.update(dtSeconds, pose, game.tanks, game.shells);
    },
  };
}
