import {
  MathUtils,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
} from 'three';

import type { BattleClientAccess } from './battleClientAccess.ts';
import type { TankPresentationTracker } from './presentationPose.ts';
import type { GameState } from './stateCore.ts';

interface TankState {
  pos: Vector3;
  yaw: number;
  speed: number;
}

interface PresentedTankState extends TankState {}

interface TankVisual {
  root: Object3D;
  setVisible(visible: boolean): void;
  syncFromState(
    state: TankState,
    dtFrame?: number,
    viewDistanceM?: number,
    presentationState?: PresentedTankState,
    detailVisible?: boolean,
  ): void;
}

interface TankEntity {
  id: string;
  team: string;
  isPlayer?: boolean;
  state: TankState | null;
  combat: { destroyed?: boolean } | null;
  visual: TankVisual | null;
  spec: {
    era: string;
    topSpeedKmh: number;
    dims: { heightM: number; widthM: number; hullLengthM: number };
  };
  input: { throttle?: number };
  _soloRenderPose?: TankPresentationTracker;
  _spotFade?: number;
  _fxAcc?: number;
  _dustTravelAcc?: number;
  _offscreenPresentationS?: number;
  _wasDetailVisible?: boolean;
}

interface SpottingState {
  isSpotted(id: string, team: string, receiver: TankEntity | null): boolean;
}

interface VehicleFx {
  dust(position: Vector3, forward: Vector3, intensity: number): void;
  exhaust(position: Vector3, load: number, diesel: boolean): void;
  loosePropHit?(position: Vector3, direction: Vector3, height: number): void;
  propCrush(position: Vector3, direction: Vector3, height: number): void;
}

interface CrushableProp {
  x: number;
  y: number;
  z: number;
  h: number;
  toppled?: boolean;
  dynamic?: boolean;
}

interface PresentationWorld {
  heightField?: {
    warmFastTilesAround?(points: Array<{ x: number; z: number; radiusM: number }>): Iterable<unknown>;
  };
  crushables?: CrushableProp[];
  crushProp(index: number, dirX: number, dirZ: number, speed: number): boolean;
}

type PosePorts = Pick<BattleClientAccess,
  | 'advanceTankPresentationPose'
  | 'createTankPresentationPose'
  | 'resetTankPresentationPose'
  | 'sampleTankPresentationPose'
  | 'isPostwarVehicleEra'
>;

export interface BattlePresentationRuntime {
  resetSoloPoses(): void;
  primeDeploymentTerrainTiles(): void;
  captureSoloPoses(): void;
  update(dtFrame?: number, presentationAlpha?: number): void;
}

export interface BattlePresentationRuntimeOptions {
  game: Pick<GameState, 'phase' | 'tanks' | 'player' | 'spotting'>;
  camera: PerspectiveCamera;
  scene: Scene;
  battleClient: PosePorts;
  getFx(): VehicleFx | null;
  getWorld(): PresentationWorld | null;
  isNetworkMatchActive(): boolean;
  getPedestalVisual(): TankVisual | null;
  isCinematicActive(): boolean;
}

/**
 * Owns allocation-free rendered tank presentation for solo and network play.
 * Authority state remains outside this module; this owner only selects the
 * legal presented pose, visual residency/detail cadence, and vehicle media.
 */
export function createBattlePresentationRuntime({
  game,
  camera,
  scene,
  battleClient,
  getFx,
  getWorld,
  isNetworkMatchActive,
  getPedestalVisual,
  isCinematicActive,
}: BattlePresentationRuntimeOptions): BattlePresentationRuntime {
  // A tank outside a generous camera guard band cannot contribute a visible
  // articulated pose. Keep authoritative state and FX at their existing
  // cadence, but collapse its expensive hierarchy/running-gear presentation
  // to 30 Hz. Re-entry is edge-triggered and therefore exact on the first
  // frame that can reach the viewport; the player and every visible actor
  // remain full-rate at any display refresh.
  const OFFSCREEN_PRESENTATION_INTERVAL_S = 1 / 30;
  const detailScreenPosition = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const effectPosition = new Vector3();
  const travelDirection = new Vector3();

  const tanks = () => game.tanks as TankEntity[];
  const player = () => game.player as TankEntity | null;
  const spotting = () => game.spotting as SpottingState | null;

  const setVisualResident = (visual: TankVisual, resident: boolean) => {
    const root = visual.root;
    if (!root) return;
    if (resident) {
      if (root.userData.battleVisibilityDetached && !root.parent) scene.add(root);
      root.userData.battleVisibilityDetached = false;
      return;
    }
    // Only roots detached by this owner may be restored. A spotting edge must
    // never resurrect a visual parked or disposed by another lifecycle owner.
    if (root.parent === scene) {
      root.removeFromParent();
      root.userData.battleVisibilityDetached = true;
    }
  };

  const presentationStateFor = (
    entity: TankEntity,
    alpha: number,
    networkActive: boolean,
  ): PresentedTankState => {
    const state = entity.state as PresentedTankState;
    // BrowserBattleBridge already supplies Hermite-interpolated remote poses
    // and corrected local prediction. A second interpolation adds latency and
    // smears corrections, so the fixed-step pose buffer is solo-only.
    if (networkActive || game.phase !== 'battle') return state;
    if (!entity._soloRenderPose) {
      entity._soloRenderPose = battleClient.createTankPresentationPose();
      battleClient.resetTankPresentationPose(entity._soloRenderPose, state);
    }
    return battleClient.sampleTankPresentationPose(
      entity._soloRenderPose,
      state,
      alpha,
    ) as PresentedTankState;
  };

  return {
    resetSoloPoses() {
      for (const entity of tanks()) {
        if (!entity.state) continue;
        if (!entity._soloRenderPose) {
          entity._soloRenderPose = battleClient.createTankPresentationPose();
        }
        battleClient.resetTankPresentationPose(entity._soloRenderPose, entity.state);
      }
    },

    primeDeploymentTerrainTiles() {
      const world = getWorld();
      const heightField = world?.heightField;
      const warmer = heightField?.warmFastTilesAround;
      if (typeof warmer !== 'function') return;
      const points: Array<{ x: number; z: number; radiusM: number }> = [];
      for (const entity of tanks()) {
        const position = entity.state?.pos;
        if (position) points.push({ x: position.x, z: position.z, radiusM: 0 });
      }
      for (const _tile of warmer.call(heightField, points)) { /* drain */ }
    },

    captureSoloPoses() {
      for (const entity of tanks()) {
        if (!entity.state) continue;
        if (!entity._soloRenderPose) {
          entity._soloRenderPose = battleClient.createTankPresentationPose();
          battleClient.resetTankPresentationPose(entity._soloRenderPose, entity.state);
        } else {
          battleClient.advanceTankPresentationPose(entity._soloRenderPose, entity.state);
        }
      }
    },

    update(dtFrame, presentationAlpha = 1) {
      const cameraPosition = camera.position;
      const fx = getFx();
      const world = getWorld();
      const spotState = spotting();
      const currentPlayer = player();
      const networkActive = isNetworkMatchActive();
      const pedestalVisual = getPedestalVisual();
      camera.updateMatrixWorld();

      for (const entity of tanks()) {
        if (!entity.state || !entity.combat || !entity.visual) continue;
        const state = entity.state;
        const combat = entity.combat;
        const visual = entity.visual;
        const spec = entity.spec;
        const dimensions = spec.dims;
        const topSpeedMps = spec.topSpeedKmh / 3.6;

        let actorVisible = true;
        if (game.phase === 'battle' && spotState && entity.team === 'enemy') {
          const spotted = combat.destroyed ||
            spotState.isSpotted(entity.id, 'player', currentPlayer);
          const target = spotted ? 1 : 0;
          if (entity._spotFade === undefined) entity._spotFade = target;
          entity._spotFade += (target - entity._spotFade) *
            (dtFrame === undefined ? 1 : Math.min(1, dtFrame / 0.35));
          actorVisible = entity._spotFade > 0.02;
          setVisualResident(visual, actorVisible);
          visual.setVisible(actorVisible);
        } else if (game.phase === 'battle' && !entity.isPlayer) {
          visual.setVisible(true);
        }
        if (!actorVisible) {
          entity._offscreenPresentationS = OFFSCREEN_PRESENTATION_INTERVAL_S;
          entity._wasDetailVisible = false;
          continue;
        }

        const presented = presentationStateFor(
          entity,
          presentationAlpha,
          networkActive,
        );
        const viewDistanceM = cameraPosition.distanceTo(presented.pos);
        detailScreenPosition.copy(presented.pos);
        detailScreenPosition.y += dimensions.heightM * 0.5;
        detailScreenPosition.project(camera);
        const detailVisible = entity.isPlayer || game.phase !== 'battle'
          || (detailScreenPosition.z >= -1.2 && detailScreenPosition.z <= 1.2
            && Math.abs(detailScreenPosition.x) <= 1.35
            && Math.abs(detailScreenPosition.y) <= 1.45);
        const wasDetailVisible = entity._wasDetailVisible;
        entity._wasDetailVisible = detailVisible;
        let presentationDt = dtFrame;
        let shouldSync = true;
        if (game.phase === 'battle' && !detailVisible && !entity.isPlayer
            && dtFrame !== undefined) {
          entity._offscreenPresentationS = Math.min(
            0.12,
            (entity._offscreenPresentationS || 0) + Math.max(0, dtFrame),
          );
          shouldSync = wasDetailVisible !== false
            || entity._offscreenPresentationS >= OFFSCREEN_PRESENTATION_INTERVAL_S;
          if (shouldSync) {
            presentationDt = entity._offscreenPresentationS;
            entity._offscreenPresentationS = 0;
          }
        } else {
          entity._offscreenPresentationS = 0;
        }
        if (shouldSync && (game.phase !== 'garage' || visual !== pedestalVisual)) {
          visual.syncFromState(
            state,
            presentationDt,
            viewDistanceM,
            presented,
            detailVisible,
          );
        }

        const vehicleFxVisible = visual.root.visible && viewDistanceM < 360;
        if (fx && game.phase === 'battle' && !combat.destroyed && vehicleFxVisible) {
          // Fixed 60 Hz emission keeps the authored density identical at
          // 60/120/240 Hz and limits catch-up to two ticks after a stall.
          entity._fxAcc = (entity._fxAcc || 0) + (dtFrame === undefined ? 1 / 60 : dtFrame);
          if (entity._fxAcc < 1 / 60) continue;
          const fxTicks = Math.min(2, Math.floor(entity._fxAcc * 60));
          entity._fxAcc -= fxTicks / 60;
          const speed = Math.abs(presented.speed);
          const throttle = Math.abs(entity.input.throttle || 0);
          forward.set(Math.sin(presented.yaw), 0, Math.cos(presented.yaw));
          if (speed > 0.8) {
            const intensity = Math.min(1, speed / topSpeedMps);
            const spacingM = MathUtils.lerp(0.70, 0.45, intensity);
            entity._dustTravelAcc = Math.min(
              spacingM * 2,
              (entity._dustTravelAcc || 0) + speed * (fxTicks / 60),
            );
            if (entity._dustTravelAcc >= spacingM) {
              entity._dustTravelAcc -= spacingM;
              right.set(forward.z, 0, -forward.x);
              for (let side = -1; side <= 1; side += 2) {
                effectPosition.copy(presented.pos)
                  .addScaledVector(forward, -dimensions.hullLengthM * 0.45)
                  .addScaledVector(right, side * dimensions.widthM * 0.45);
                fx.dust(effectPosition, forward, intensity);
              }
            }
          } else {
            entity._dustTravelAcc = 0;
          }

          const load = Math.max(
            0.10,
            isCinematicActive() && entity.isPlayer ? 0.3 : 0,
            Math.min(1, throttle * 0.7 + speed / topSpeedMps * 0.5),
          );
          effectPosition.copy(presented.pos)
            .addScaledVector(forward, -dimensions.hullLengthM * 0.42);
          effectPosition.y += dimensions.heightM * 0.72;
          fx.exhaust(effectPosition, load, !battleClient.isPostwarVehicleEra(spec.era));

          if (speed > 1.2 && world?.crushables?.length) {
            const hullReach = dimensions.hullLengthM * 0.5 + 0.5;
            travelDirection.copy(forward).multiplyScalar(Math.sign(state.speed) || 1);
            for (let index = 0; index < world.crushables.length; index++) {
              const prop = world.crushables[index];
              if (prop.toppled) continue;
              const dx = prop.x - state.pos.x;
              const dz = prop.z - state.pos.z;
              if (dx * dx + dz * dz > hullReach * hullReach) continue;
              if (world.crushProp(index, travelDirection.x, travelDirection.z, speed)) {
                effectPosition.set(prop.x, prop.y, prop.z);
                if (prop.dynamic && fx.loosePropHit) {
                  fx.loosePropHit(effectPosition, travelDirection, prop.h);
                } else {
                  fx.propCrush(effectPosition, travelDirection, prop.h);
                }
              }
            }
          }
        } else if (!vehicleFxVisible) {
          entity._dustTravelAcc = 0;
        }
      }
    },
  };
}
