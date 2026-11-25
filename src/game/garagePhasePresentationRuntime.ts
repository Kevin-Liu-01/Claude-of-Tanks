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

type GarageSkyConfig = MapSkyConfig;

export type GaragePresentationRestoreReceipt = GarageGpuRestoreReceipt;

interface GaragePresentationRestoreContext {
  resourcesReleased: boolean;
  /** False once the caller abandoned this restore (perf-246: Battle Again over a preparation behind the report). */
  isCurrent?: () => boolean;
}

interface GarageLightingPort {
  setFarCascadeDormant(dormant: boolean): void;
  setSun(sunDirection: THREE.Vector3, config: GarageSkyConfig): void;
}

interface GaragePhasePresentationOptions {
  scene: THREE.Scene;
  stageRoot: THREE.Object3D;
  dressingRoot: THREE.Object3D;
  garagePosition: THREE.Vector3;
  lighting: GarageLightingPort;
  sunDirection: THREE.Vector3;
  getGarageSkyConfig(): GarageSkyConfig;
  getBattleSkyConfig(): GarageSkyConfig | null;
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
  restoreGpu(isCurrent?: () => boolean): Promise<GaragePresentationRestoreReceipt>;
  diagnostics(): GaragePhasePresentationDiagnostics;
}

const GARAGE_SUN_COLOR = 0xf2f0ea;
const GARAGE_SUN_INTENSITY_SCALE = 0.55;
/** The showroom's two authored spots (candela), the sealed bays' rig. */
const GARAGE_SPOT_INTENSITY = Object.freeze({ a: 64, b: 48 });
/**
 * (garage-env-276) Under an open yard's grounded light the showroom spots carry this share of the model's sun at the
 * hero, together: a readability lift, not a second key. At their authored 64 and 48 they put about a third of the sun on
 * the hero from the camera's side, straight into the shadows the camera sees; a battle's fill is its sky's environment
 * alone. Scaled to the sun the model resolves, they keep its key-to-fill ratio at every exposure (the model's exposure
 * scales every light alike). The hero's floor (garageQualityRubric.ts GARAGE_HERO_LUMA_FLOOR) guards the lift.
 */
export const GARAGE_OPEN_SPOT_SHARE = 0.1;

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
  getGarageSkyConfig,
  getBattleSkyConfig,
  getGroundHeight,
  getPhase,
  shouldReleaseGpuOnBattle,
  posePedestal,
  poseCamera,
  restorePresentationGpu,
}: GaragePhasePresentationOptions): GaragePhasePresentationRuntime {
  const required = [scene?.add, stageRoot?.removeFromParent,
    dressingRoot?.removeFromParent, lighting?.setFarCascadeDormant,
    lighting?.setSun, getGarageSkyConfig, getBattleSkyConfig, getGroundHeight, getPhase,
    shouldReleaseGpuOnBattle,
    posePedestal, poseCamera, restorePresentationGpu];
  if (!(garagePosition instanceof THREE.Vector3)
    || !(sunDirection instanceof THREE.Vector3)
    || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage phase presentation requires every scene lifecycle port');
  }

  const spotA = new THREE.SpotLight(0xf2f0e8, GARAGE_SPOT_INTENSITY.a, 60, 0.5, 0.85, 1.6);
  const spotB = new THREE.SpotLight(0xdce3ec, GARAGE_SPOT_INTENSITY.b, 60, 0.6, 0.8, 1.6);
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
  // The residency's restore callback takes no arguments: the caller's abandonment check rides here for its duration.
  let restoreIsCurrent: (() => boolean) | undefined;
  const restorePresentation = async (
    resourcesReleased: boolean,
  ): Promise<GaragePresentationRestoreReceipt> => {
    restoreDepth += 1;
    restoreReceipt = null;
    try {
      restoreReceipt = await restorePresentationGpu(restoreIsCurrent
        ? { resourcesReleased, isCurrent: restoreIsCurrent } : { resourcesReleased });
      return restoreReceipt;
    } finally {
      restoreDepth -= 1;
    }
  };
  const gpuResidency = createRetainedPhaseGpuResidency({
    root: stageRoot,
    additionalRoots: [dressingRoot],
    preserveRoots: [scene],
    restoreGpu: async () => {
      await restorePresentation(true);
    },
  });

  // 2026-11-02 audit R5: one restore at a time. An overlapping caller joins the restore in flight instead of starting
  // a second upload or replacing its abandonment check; it shares the receipt when that restore left the Garage
  // resident, and otherwise (abandoned, failed, or superseded by a context loss) runs its own if it still wants one.
  let restoreInFlight: Promise<GaragePresentationRestoreReceipt> | null = null;
  const runRestore = async (isCurrent?: () => boolean): Promise<GaragePresentationRestoreReceipt> => {
    restoreIsCurrent = isCurrent;
    try {
      const renewed = await gpuResidency.resume();
      if (!renewed) {
        await restorePresentation(false);
      }
    } finally {
      restoreIsCurrent = undefined;
    }
    if (!restoreReceipt) {
      throw new Error('Garage GPU restoration completed without a receipt');
    }
    return restoreReceipt;
  };
  const restoreGpu = async (isCurrent?: () => boolean): Promise<GaragePresentationRestoreReceipt> => {
    while (restoreInFlight) {
      const joined = restoreInFlight;
      try {
        const receipt = await joined;
        if (gpuResidency.diagnostics().phase === 'resident' || (isCurrent && !isCurrent())) return receipt;
      } catch (error) {
        if (isCurrent && !isCurrent()) throw error;
      }
      if (restoreInFlight === joined) restoreInFlight = null;
    }
    const run = runRestore(isCurrent);
    restoreInFlight = run;
    const clear = (): void => { if (restoreInFlight === run) restoreInFlight = null; };
    run.then(clear, clear);
    return run;
  };

  const setActive = (active: boolean): void => {
    if (spotA.visible === active) return;
    if (!active) lighting.setFarCascadeDormant(false);
    sceneResidency.setGarageActive(active);
    if (!active) {
      const releaseTextures = shouldReleaseGpuOnBattle();
      // Preserve the constrained device's existing stage-only policy: reuploading
      // the full workshop adds return stalls. Desktop can renew its buffers
      // while retaining the textures and programs it will use on return.
      gpuResidency.suspend({ releaseTextures,
        ...(releaseTextures ? { additionalRoots: [] } : {}),
      });
    }
  };

  const setSunTrim = (active: boolean): void => {
    // The selected workshop can belong to a different map from the live
    // battle/Studio/capture. Removing its neutral key must restore that live
    // world's light, not reapply the workshop's untrimmed preset.
    const skyConfig = active ? getGarageSkyConfig() : getBattleSkyConfig();
    if (!skyConfig) throw new Error('Battle lighting requires an active world sky preset');
    lighting.setSun(sunDirection, active
      ? {
          ...skyConfig,
          sunColorHex: GARAGE_SUN_COLOR,
          sunIntensity: (skyConfig.sunIntensity ?? 4.5) * GARAGE_SUN_INTENSITY_SCALE,
        }
      : skyConfig);
    fitSpotsToLight();
  };

  /**
   * (garage-env-276) The showroom spots follow the light the shown pack lit with: under an open yard's grounded model
   * they share GARAGE_OPEN_SPOT_SHARE of its sun at the hero between them (each spot's share by its authored weight, its
   * falloff at its distance: three's punctual law, intensity over distance to the decay), and a sealed bay's authored
   * rig keeps them as authored.
   */
  const fitSpotsToLight = (): void => {
    const model = scene.userData.lightModel as { mode?: string; sunIntensity?: number } | undefined;
    if (model?.mode !== 'physical' || !(Number(model.sunIntensity) > 0)) {
      spotA.intensity = GARAGE_SPOT_INTENSITY.a;
      spotB.intensity = GARAGE_SPOT_INTENSITY.b;
      return;
    }
    const atHero = (spot: THREE.SpotLight, intensity: number): number =>
      intensity / Math.max(1e-3, spot.position.distanceTo(spotTarget.position)) ** spot.decay;
    const authored = atHero(spotA, GARAGE_SPOT_INTENSITY.a) + atHero(spotB, GARAGE_SPOT_INTENSITY.b);
    const scale = Math.min(1, (GARAGE_OPEN_SPOT_SHARE * Number(model.sunIntensity)) / authored);
    spotA.intensity = GARAGE_SPOT_INTENSITY.a * scale;
    spotB.intensity = GARAGE_SPOT_INTENSITY.b * scale;
  };

  const place = (): void => {
    garagePosition.y = getGroundHeight(garagePosition.x, garagePosition.z);
    stageRoot.position.copy(garagePosition);
    dressingRoot.position.copy(garagePosition);
    positionLights();
    // World-service preparation also refreshes the dormant Garage anchor while
    // a battle is being assembled. The player can be borrowing the pedestal
    // visual at that point, so Garage-only pose solvers must never touch it.
    // Keeping both pose writes behind the same phase gate makes the handoff
    // atomic: the deployed tank remains at its authoritative spawn and the
    // reveal camera cannot snap to the off-map Garage coordinate.
    if (getPhase() === 'garage') {
      posePedestal();
      poseCamera();
    }
  };

  return {
    get restoringGpu() { return restoreDepth > 0; },
    setActive,
    setSunTrim,
    place,
    swapWorld: sceneResidency.swapWorld,
    setWorldActive: sceneResidency.setWorldActive,
    invalidateGpu: gpuResidency.invalidate,
    restoreGpu,
    diagnostics: () => ({
      scene: { ...sceneResidency.stats },
      gpu: gpuResidency.diagnostics(),
    }),
  };
}
