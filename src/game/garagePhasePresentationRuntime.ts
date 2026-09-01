import * as THREE from 'three';
import type { MapSkyConfig } from '../world/maps/horizon.ts';

import {
  createRetainedPhaseGpuResidency,
  type PhaseGpuResidencyStats,
} from '../engine/phaseGpuResidency.ts';
import type { GarageGpuRestoreReceipt } from '../engine/garageGpuWarmRuntime.ts';
import {
  createPhaseSceneResidency,
  type PhaseSceneResidency,
} from '../engine/phaseSceneResidency.ts';

export type GarageSkyConfig = MapSkyConfig;

export type GaragePresentationRestoreReceipt = GarageGpuRestoreReceipt;

export interface GaragePresentationRestoreContext {
  resourcesReleased: boolean;
}

interface GarageLightingPort {
  setFarCascadeDormant(dormant: boolean): void;
  setSun(sunDirection: THREE.Vector3, config: GarageSkyConfig): void;
}

export interface GaragePhasePresentationOptions {
  scene: THREE.Scene;
  stageRoot: THREE.Object3D;
  dressingRoot: THREE.Object3D;
  garagePosition: THREE.Vector3;
  lighting: GarageLightingPort;
  sunDirection: THREE.Vector3;
  getSkyConfig(): GarageSkyConfig;
  getGroundHeight(x: number, z: number): number;
  getPhase(): string;
  shouldReleaseGpuOnBattle(): boolean;
  posePedestal(): void;
  poseCamera(): void;
  restorePresentationGpu(
    context: GaragePresentationRestoreContext,
  ): Promise<GaragePresentationRestoreReceipt>;
}

export interface GaragePhasePresentationDiagnostics {
  scene: Readonly<PhaseSceneResidency['stats']>;
  gpu: PhaseGpuResidencyStats;
}

export interface GaragePhasePresentationRuntime {
  readonly restoringGpu: boolean;
  setActive(active: boolean): void;
  setSunTrim(active: boolean): void;
  place(): void;
  swapWorld(previous: THREE.Object3D | null, next: THREE.Object3D): void;
  setWorldActive(root: THREE.Object3D | null, active: boolean): void;
  invalidateGpu(): boolean;
  restoreGpu(): Promise<GaragePresentationRestoreReceipt>;
  diagnostics(): GaragePhasePresentationDiagnostics;
}

const GARAGE_SUN_COLOR = 0xf2f0ea;
const GARAGE_SUN_INTENSITY_SCALE = 0.55;

/**
 * Owns the phase-exclusive Garage scene roots, authored key lights, neutral
 * showroom sun, renewable dressing GPU residency, and terrain-relative stage
 * placement. Camera and pedestal math stay with their existing owners; this
 * runtime only invokes those ports after the shared stage anchor moves.
 */
export function createGaragePhasePresentationRuntime({
  scene,
  stageRoot,
  dressingRoot,
  garagePosition,
  lighting,
  sunDirection,
  getSkyConfig,
  getGroundHeight,
  getPhase,
  shouldReleaseGpuOnBattle,
  posePedestal,
  poseCamera,
  restorePresentationGpu,
}: GaragePhasePresentationOptions): GaragePhasePresentationRuntime {
  const required = [scene?.add, stageRoot?.removeFromParent,
    dressingRoot?.removeFromParent, lighting?.setFarCascadeDormant,
    lighting?.setSun, getSkyConfig, getGroundHeight, getPhase,
    shouldReleaseGpuOnBattle,
    posePedestal, poseCamera, restorePresentationGpu];
  if (!(garagePosition instanceof THREE.Vector3)
    || !(sunDirection instanceof THREE.Vector3)
    || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage phase presentation requires every scene lifecycle port');
  }

  const spotA = new THREE.SpotLight(0xf2f0e8, 64, 60, 0.5, 0.85, 1.6);
  const spotB = new THREE.SpotLight(0xdce3ec, 48, 60, 0.6, 0.8, 1.6);
  const spotTarget = new THREE.Object3D();

  const positionLights = (): void => {
    spotA.position.set(
      garagePosition.x + 9,
      garagePosition.y + 11,
      garagePosition.z + 7,
    );
    spotB.position.set(
      garagePosition.x - 10,
      garagePosition.y + 8,
      garagePosition.z - 6,
    );
    spotTarget.position.set(
      garagePosition.x,
      garagePosition.y + 1.2,
      garagePosition.z,
    );
  };

  positionLights();
  spotA.target = spotTarget;
  spotB.target = spotTarget;
  scene.add(spotTarget, spotA, spotB);

  const sceneResidency = createPhaseSceneResidency({
    scene,
    garageRoots: [stageRoot, dressingRoot, spotTarget, spotA, spotB],
  });
  let restoreReceipt: GaragePresentationRestoreReceipt | null = null;
  let restoreDepth = 0;
  const restorePresentation = async (
    resourcesReleased: boolean,
  ): Promise<GaragePresentationRestoreReceipt> => {
    restoreDepth += 1;
    restoreReceipt = null;
    try {
      restoreReceipt = await restorePresentationGpu({ resourcesReleased });
      return restoreReceipt;
    } finally {
      restoreDepth -= 1;
    }
  };
  const gpuResidency = createRetainedPhaseGpuResidency({
    root: stageRoot,
    preserveRoots: [scene],
    restoreGpu: async () => {
      await restorePresentation(true);
    },
  });

  const setActive = (active: boolean): void => {
    if (spotA.visible === active) return;
    if (!active) lighting.setFarCascadeDormant(false);
    sceneResidency.setGarageActive(active);
    if (!active && shouldReleaseGpuOnBattle()) gpuResidency.suspend();
  };

  const setSunTrim = (active: boolean): void => {
    const skyConfig = getSkyConfig() || {};
    lighting.setSun(sunDirection, active
      ? {
          ...skyConfig,
          sunColorHex: GARAGE_SUN_COLOR,
          sunIntensity: (skyConfig.sunIntensity ?? 4.5) * GARAGE_SUN_INTENSITY_SCALE,
        }
      : skyConfig);
  };

  const place = (): void => {
    garagePosition.y = getGroundHeight(garagePosition.x, garagePosition.z);
    stageRoot.position.copy(garagePosition);
    dressingRoot.position.copy(garagePosition);
    positionLights();
    posePedestal();
    if (getPhase() === 'garage') poseCamera();
  };

  return {
    get restoringGpu() { return restoreDepth > 0; },
    setActive,
    setSunTrim,
    place,
    swapWorld: sceneResidency.swapWorld,
    setWorldActive: sceneResidency.setWorldActive,
    invalidateGpu: gpuResidency.invalidate,
    async restoreGpu() {
      const renewed = await gpuResidency.resume();
      if (!renewed) {
        await restorePresentation(false);
      }
      if (!restoreReceipt) {
        throw new Error('Garage GPU restoration completed without a receipt');
      }
      return restoreReceipt;
    },
    diagnostics: () => ({
      scene: { ...sceneResidency.stats },
      gpu: gpuResidency.diagnostics(),
    }),
  };
}
