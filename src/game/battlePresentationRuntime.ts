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

type PresentedTankState = TankState;

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
    warmFastTilesAround?(points: Array<{ x: number; z: number; radiusM: number }>): Iterable<number>;
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
  getPedestalVisual(): object | null;
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

  const tanks = (): TankEntity[] => game.tanks as TankEntity[];
  const player = (): TankEntity | null => game.player as TankEntity | null;
  const spotting = (): SpottingState | null => game.spotting as SpottingState | null;

  const setVisualResident = (visual: TankVisual, resident: boolean): void => {
    const root = visual.root;
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

  const updateActorVisibility = (
    entity: TankEntity,
    dtFrame: number | undefined,
    spotState: SpottingState | null,
    currentPlayer: TankEntity | null,
  ): boolean => {
    const visual = entity.visual as TankVisual;
    const combat = entity.combat as NonNullable<TankEntity['combat']>;
    if (game.phase !== 'battle') return true;
    if (spotState && entity.team === 'enemy') {
      const spotted = combat.destroyed
        || spotState.isSpotted(entity.id, 'player', currentPlayer);
      const target = spotted ? 1 : 0;
      if (entity._spotFade === undefined) entity._spotFade = target;
      entity._spotFade += (target - entity._spotFade)
        * (dtFrame === undefined ? 1 : Math.min(1, dtFrame / 0.35));
      const actorVisible = entity._spotFade > 0.02;
      setVisualResident(visual, actorVisible);
      visual.setVisible(actorVisible);
      return actorVisible;
    }
    if (!entity.isPlayer) visual.setVisible(true);
    return true;
  };

  const isDetailVisible = (
    entity: TankEntity,
    presented: PresentedTankState,
  ): boolean => {
    if (entity.isPlayer || game.phase !== 'battle') return true;
    detailScreenPosition.copy(presented.pos);
    detailScreenPosition.y += entity.spec.dims.heightM * 0.5;
    detailScreenPosition.project(camera);
    return detailScreenPosition.z >= -1.2 && detailScreenPosition.z <= 1.2
      && Math.abs(detailScreenPosition.x) <= 1.35
      && Math.abs(detailScreenPosition.y) <= 1.45;
  };

  const syncTankVisual = (
    entity: TankEntity,
    presented: PresentedTankState,
    dtFrame: number | undefined,
    pedestalVisual: object | null,
  ): number => {
    const state = entity.state as TankState;
    const visual = entity.visual as TankVisual;
    const viewDistanceM = camera.position.distanceTo(presented.pos);
    const detailVisible = isDetailVisible(entity, presented);
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
    return viewDistanceM;
  };

  const emitDust = (
    entity: TankEntity,
    fx: VehicleFx,
    presented: PresentedTankState,
    speed: number,
    topSpeedMps: number,
    fxTicks: number,
  ): void => {
    if (speed <= 0.8) {
      entity._dustTravelAcc = 0;
      return;
    }
    const dimensions = entity.spec.dims;
    const intensity = Math.min(1, speed / topSpeedMps);
    const spacingM = MathUtils.lerp(0.70, 0.45, intensity);
    entity._dustTravelAcc = Math.min(
      spacingM * 2,
      (entity._dustTravelAcc || 0) + speed * (fxTicks / 60),
    );
    if (entity._dustTravelAcc < spacingM) return;
    entity._dustTravelAcc -= spacingM;
    right.set(forward.z, 0, -forward.x);
    for (let side = -1; side <= 1; side += 2) {
      effectPosition.copy(presented.pos)
        .addScaledVector(forward, -dimensions.hullLengthM * 0.45)
        .addScaledVector(right, side * dimensions.widthM * 0.45);
      fx.dust(effectPosition, forward, intensity);
    }
  };

  const emitExhaust = (
    entity: TankEntity,
    fx: VehicleFx,
    presented: PresentedTankState,
    speed: number,
    topSpeedMps: number,
  ): void => {
    const dimensions = entity.spec.dims;
    const throttle = Math.abs(entity.input.throttle || 0);
    const load = Math.max(
      0.10,
      isCinematicActive() && entity.isPlayer ? 0.3 : 0,
      Math.min(1, throttle * 0.7 + speed / topSpeedMps * 0.5),
    );
    effectPosition.copy(presented.pos)
      .addScaledVector(forward, -dimensions.hullLengthM * 0.42);
    effectPosition.y += dimensions.heightM * 0.72;
    fx.exhaust(
      effectPosition,
      load,
      !battleClient.isPostwarVehicleEra(entity.spec.era),
    );
  };

  const crushNearbyProps = (
    entity: TankEntity,
    fx: VehicleFx,
    world: PresentationWorld | null,
    speed: number,
  ): void => {
    const crushables = world?.crushables;
    const state = entity.state as TankState;
    if (speed <= 1.2 || !crushables?.length || !world) return;
    const hullReach = entity.spec.dims.hullLengthM * 0.5 + 0.5;
    travelDirection.copy(forward).multiplyScalar(Math.sign(state.speed));
    for (let index = 0; index < crushables.length; index += 1) {
      const prop = crushables[index];
      if (prop.toppled) continue;
      const dx = prop.x - state.pos.x;
      const dz = prop.z - state.pos.z;
      if (dx * dx + dz * dz > hullReach * hullReach) continue;
      if (!world.crushProp(index, travelDirection.x, travelDirection.z, speed)) continue;
      effectPosition.set(prop.x, prop.y, prop.z);
      if (prop.dynamic && fx.loosePropHit) {
        fx.loosePropHit(effectPosition, travelDirection, prop.h);
      } else {
        fx.propCrush(effectPosition, travelDirection, prop.h);
      }
    }
  };

  const updateVehicleFx = (
    entity: TankEntity,
    fx: VehicleFx | null,
    world: PresentationWorld | null,
    presented: PresentedTankState,
    viewDistanceM: number,
    dtFrame: number | undefined,
  ): void => {
    const visual = entity.visual as TankVisual;
    const vehicleFxVisible = visual.root.visible && viewDistanceM < 360;
    if (!vehicleFxVisible) entity._dustTravelAcc = 0;
    if (!fx || game.phase !== 'battle' || entity.combat?.destroyed || !vehicleFxVisible) return;
    // Fixed 60 Hz emission keeps the authored density identical at
    // 60/120/240 Hz and limits catch-up to two ticks after a stall.
    entity._fxAcc = (entity._fxAcc || 0) + (dtFrame === undefined ? 1 / 60 : dtFrame);
    if (entity._fxAcc < 1 / 60) return;
    const fxTicks = Math.min(2, Math.floor(entity._fxAcc * 60));
    entity._fxAcc -= fxTicks / 60;
    const speed = Math.abs(presented.speed);
    const topSpeedMps = entity.spec.topSpeedKmh / 3.6;
    forward.set(Math.sin(presented.yaw), 0, Math.cos(presented.yaw));
    emitDust(entity, fx, presented, speed, topSpeedMps, fxTicks);
    emitExhaust(entity, fx, presented, speed, topSpeedMps);
    crushNearbyProps(entity, fx, world, speed);
  };

  const updateTank = (
    entity: TankEntity,
    dtFrame: number | undefined,
    presentationAlpha: number,
    networkActive: boolean,
    fx: VehicleFx | null,
    world: PresentationWorld | null,
    spotState: SpottingState | null,
    currentPlayer: TankEntity | null,
    pedestalVisual: object | null,
  ): void => {
    if (!entity.state || !entity.combat || !entity.visual) return;
    if (!updateActorVisibility(entity, dtFrame, spotState, currentPlayer)) {
      entity._offscreenPresentationS = OFFSCREEN_PRESENTATION_INTERVAL_S;
      entity._wasDetailVisible = false;
      return;
    }
    const presented = presentationStateFor(entity, presentationAlpha, networkActive);
    const viewDistanceM = syncTankVisual(entity, presented, dtFrame, pedestalVisual);
    updateVehicleFx(entity, fx, world, presented, viewDistanceM, dtFrame);
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
      const fx = getFx();
      const world = getWorld();
      const spotState = spotting();
      const currentPlayer = player();
      const networkActive = isNetworkMatchActive();
      const pedestalVisual = getPedestalVisual();
      camera.updateMatrixWorld();

      for (const entity of tanks()) {
        updateTank(
          entity,
          dtFrame,
          presentationAlpha,
          networkActive,
          fx,
          world,
          spotState,
          currentPlayer,
          pedestalVisual,
        );
      }
    },
  };
}
