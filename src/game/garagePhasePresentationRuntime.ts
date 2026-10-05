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
import { createGarageLampShadow } from './garageLampShadow.ts';
import { GARAGE_PLATFORM_GEOMETRY, GARAGE_PRESENTATION_POSE } from './garagePresentationPose.ts';

type GarageSkyConfig = MapSkyConfig;

export type GaragePresentationRestoreReceipt = GarageGpuRestoreReceipt;

interface GaragePresentationRestoreContext {
  resourcesReleased: boolean;
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
  /** The selected Garage is the enclosed Verdant workshop (its studio key and kicker); outdoor packs keep the sky's
   * sun and the default spots. Absent: never. */
  isEnclosedStudio?(): boolean;
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
// 2026-10-05 (gauntlet wave 99: "a flat top-down key light; a key with direction and a rim light"). In the enclosed
// Verdant workshop the sky is never seen, so its "sun" is the studio key, the rig's only shadowed light. Measured with
// in-page toggles on one build (h23a, h23d, t90m / m1a2 / leo2a7v): the overhead beam veiled the hull (see
// garageStage.ts GARAGE_BEAM_SHARE), the spots barely reached it (the front spot 3 %, the back one 1.5 % of the hull's
// light) and the 32-degree sun lit the roofs most. The studio takes the key 10 degrees lower from the same bearing
// (the flank carries the form, the roofs less, a longer cast shadow) and turns the back spot into a cool kicker behind
// the hull's far shoulder: with the thinner beam and the halved highbays (garageStage.ts) the hull's luma spread
// (p90 - p10, default view) went 93 -> 110 (t90m), 110 -> 124 (m1a2), 87 -> 104 (leo2a7v) at a level mean (-0.7 to
// -2.8), its tracks rose 4-6 levels and the hall's mean fell 73 -> 66 (h23e).
const GARAGE_STUDIO_KEY = Object.freeze({ azimuthDeg: 115, elevationDeg: 22 });
const GARAGE_STUDIO_KICKER = Object.freeze({
  azimuthDeg: 160, elevationDeg: 32, distanceM: 12.5, intensity: 300, angle: 0.55, penumbra: 0.4,
});
const GARAGE_SPOT_B = Object.freeze({ intensity: 48, angle: 0.6, penumbra: 0.8 });
const GARAGE_SPOT_TARGET_Y_M = 1.2;

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
  isEnclosedStudio = () => false,
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

  const spotA = new THREE.SpotLight(0xf2f0e8, 64, 60, 0.5, 0.85, 1.6);
  const spotB = new THREE.SpotLight(0xdce3ec, GARAGE_SPOT_B.intensity, 60, GARAGE_SPOT_B.angle, GARAGE_SPOT_B.penumbra, 1.6);
  const spotTarget = new THREE.Object3D();
  const studioKeyDirection = new THREE.Vector3().setFromSphericalCoords(1,
    THREE.MathUtils.degToRad(90 - GARAGE_STUDIO_KEY.elevationDeg), THREE.MathUtils.degToRad(GARAGE_STUDIO_KEY.azimuthDeg));
  let studio = false;
  type SpotPose = Readonly<{ azimuthDeg: number; elevationDeg: number; distanceM: number; intensity: number;
    angle: number; penumbra: number }>;
  const poseSpot = (spot: THREE.SpotLight, pose: SpotPose): void => {
    const az = THREE.MathUtils.degToRad(pose.azimuthDeg), el = THREE.MathUtils.degToRad(pose.elevationDeg);
    spot.position.set(
      garagePosition.x + pose.distanceM * Math.cos(el) * Math.sin(az),
      garagePosition.y + GARAGE_SPOT_TARGET_Y_M + pose.distanceM * Math.sin(el),
      garagePosition.z + pose.distanceM * Math.cos(el) * Math.cos(az),
    );
    spot.intensity = pose.intensity; spot.angle = pose.angle; spot.penumbra = pose.penumbra;
  };

  const positionLights = (): void => {
    // 2026-10-04 (gauntlet wave 60, item 1: the winter roofs "clip"): the key comes down from 41° to 27° over the
    // podium, so the sides and the glacis carry the form and the roofs take less of it (−0.1 of the roofs' modelled
    // 3.4 irradiance units, +0.16 on the near side); the highbays' cut in garageStage.ts takes the rest.
    spotA.position.set(
      garagePosition.x + 10,
      garagePosition.y + 7.6,
      garagePosition.z + 8,
    );
    if (studio) {
      // the studio's kicker behind the hull's far shoulder, aimed at the hull's centre like the front spot
      poseSpot(spotB, GARAGE_STUDIO_KICKER);
    } else {
      spotB.position.set(
        garagePosition.x - 10,
        garagePosition.y + 8,
        garagePosition.z - 6,
      );
      spotB.intensity = GARAGE_SPOT_B.intensity; spotB.angle = GARAGE_SPOT_B.angle; spotB.penumbra = GARAGE_SPOT_B.penumbra;
    }
    spotTarget.position.set(
      garagePosition.x,
      garagePosition.y + GARAGE_SPOT_TARGET_Y_M,
      garagePosition.z,
    );
  };

  positionLights();
  spotA.target = spotTarget;
  spotB.target = spotTarget;
  // 2026-10-04 (gauntlet wave 60, item 4: the hull "reads as slightly hovering"): the lamps' umbra under the hull,
  // baked onto the podium (garageLampShadow.ts) — none of the Garage's lamps casts a shadow
  const lampShadow = createGarageLampShadow({
    scene,
    lampRoots: [stageRoot, dressingRoot, spotA, spotB],
    garagePosition,
    podiumTopY: GARAGE_PLATFORM_GEOMETRY.topYM,
    podiumRadius: GARAGE_PLATFORM_GEOMETRY.deckRadiusM,
    cameraOffset: GARAGE_PRESENTATION_POSE.cameraOffsetM,
  });
  scene.add(spotTarget, spotA, spotB, lampShadow.mesh);

  const sceneResidency = createPhaseSceneResidency({
    scene,
    garageRoots: [stageRoot, dressingRoot, spotTarget, spotA, spotB, lampShadow.mesh],
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
    additionalRoots: [dressingRoot],
    preserveRoots: [scene],
    restoreGpu: async () => {
      await restorePresentation(true);
    },
  });

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
    studio = active && isEnclosedStudio();
    lighting.setSun(studio ? studioKeyDirection : sunDirection, active
      ? {
          ...skyConfig,
          sunColorHex: GARAGE_SUN_COLOR,
          sunIntensity: (skyConfig.sunIntensity ?? 4.5) * GARAGE_SUN_INTENSITY_SCALE,
        }
      : skyConfig);
    positionLights();
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
