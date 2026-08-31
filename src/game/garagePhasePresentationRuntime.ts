import * as THREE from 'three';
import type { MapSkyConfig } from '../world/maps/horizon.ts';

import {
  createRetainedPhaseGpuResidency,
  type PhaseGpuResidencyStats,
} from '../engine/phaseGpuResidency.ts';
import {
  createPhaseSceneResidency,
  type PhaseSceneResidency,
} from '../engine/phaseSceneResidency.ts';

export type GarageSkyConfig = MapSkyConfig;

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
  posePedestal(): void;
  poseCamera(): void;
  warmRender(): void;
  nextFrame(): Promise<unknown>;
}

export interface GaragePhasePresentationDiagnostics {
  scene: Readonly<PhaseSceneResidency['stats']>;
  gpu: PhaseGpuResidencyStats;
}

export interface GaragePhasePresentationRuntime {
  setActive(active: boolean): void;
  setSunTrim(active: boolean): void;
  place(): void;
  swapWorld(previous: THREE.Object3D | null, next: THREE.Object3D): void;
  setWorldActive(root: THREE.Object3D | null, active: boolean): void;
  resumeGpu(): Promise<void>;
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
  posePedestal,
  poseCamera,
  warmRender,
  nextFrame,
}: GaragePhasePresentationOptions): GaragePhasePresentationRuntime {
  const required = [scene?.add, stageRoot?.removeFromParent,
    dressingRoot?.removeFromParent, lighting?.setFarCascadeDormant,
    lighting?.setSun, getSkyConfig, getGroundHeight, getPhase,
    posePedestal, poseCamera, warmRender, nextFrame];
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
  const gpuResidency = createRetainedPhaseGpuResidency({
    root: stageRoot,
    preserveRoots: [scene],
    warmRender,
    nextFrame,
  });

  const setActive = (active: boolean): void => {
    if (spotA.visible === active) return;
    if (!active) lighting.setFarCascadeDormant(false);
    sceneResidency.setGarageActive(active);
    if (!active) gpuResidency.suspend();
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
    setActive,
    setSunTrim,
    place,
    swapWorld: sceneResidency.swapWorld,
    setWorldActive: sceneResidency.setWorldActive,
    resumeGpu: gpuResidency.resume,
    diagnostics: () => ({
      scene: { ...sceneResidency.stats },
      gpu: gpuResidency.diagnostics(),
    }),
  };
}
