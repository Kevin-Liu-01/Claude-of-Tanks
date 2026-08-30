import * as THREE from 'three';

import { getGarageVariant } from './garageVariants.ts';

const WORKSHOP_VARIANT_ID = 'verdant_motor_pool';
const GARAGE_X = -1500;
const GARAGE_Z = -1500;
const DEFAULT_CAMERA_X = 7.4;
const DEFAULT_CAMERA_Z = 8;
const CAMERA_HEIGHT_M = 2.75;
export const GARAGE_CAMERA_LOOK_HEIGHT_M = 1.6;
const CAMERA_FOV_DEG = 42;

export interface GarageEnvironmentPresentationOptions {
  garagePosition: THREE.Vector3;
  getSelectedVariantId(): string;
  setWorldDormant(dormant: boolean): void;
  placeGarage(): void;
  setGarageSunTrim(active: boolean): void;
  invalidatePresentation(): void;
  setCameraPose(position: THREE.Vector3, target: THREE.Vector3, fovDegrees: number): void;
}

export interface GarageEnvironmentState {
  readonly variantId: string;
  readonly mapId: string;
  readonly mode: 'verdant-workshop' | 'custom-environment';
  readonly ready: true;
  readonly anchor: readonly [number, number, number];
}

export interface GarageEnvironmentPresentationRuntime {
  activate(variantId: string): Promise<void>;
  poseCamera(): void;
  diagnostics(): Readonly<GarageEnvironmentState>;
}

/**
 * Own the Garage presentation transaction without activating a battlefield.
 * Every variant shares one isolated coordinate and a deterministic camera;
 * the selected Garage architecture supplies the small themed environment.
 */
export function createGarageEnvironmentPresentationRuntime({
  garagePosition,
  getSelectedVariantId,
  setWorldDormant,
  placeGarage,
  setGarageSunTrim,
  invalidatePresentation,
  setCameraPose,
}: GarageEnvironmentPresentationOptions): GarageEnvironmentPresentationRuntime {
  const required = [getSelectedVariantId, setWorldDormant, placeGarage,
    setGarageSunTrim, invalidatePresentation, setCameraPose];
  if (!(garagePosition instanceof THREE.Vector3)
    || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage environment presentation requires every lifecycle port');
  }

  const initialVariant = getGarageVariant(getSelectedVariantId());
  let state: GarageEnvironmentState = {
    variantId: initialVariant.id,
    mapId: initialVariant.mapId,
    mode: initialVariant.id === WORKSHOP_VARIANT_ID
      ? 'verdant-workshop' : 'custom-environment',
    ready: true,
    anchor: [GARAGE_X, 0, GARAGE_Z],
  };
  const cameraPose = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();

  const poseCamera = (): void => {
    cameraPose.set(
      garagePosition.x + DEFAULT_CAMERA_X,
      garagePosition.y + CAMERA_HEIGHT_M,
      garagePosition.z + DEFAULT_CAMERA_Z,
    );
    cameraTarget.set(
      garagePosition.x,
      garagePosition.y + GARAGE_CAMERA_LOOK_HEIGHT_M,
      garagePosition.z,
    );
    setCameraPose(cameraPose, cameraTarget, CAMERA_FOV_DEG);
  };

  const activate = async (variantId: string): Promise<void> => {
    const variant = getGarageVariant(variantId);
    garagePosition.set(GARAGE_X, 0, GARAGE_Z);
    state = {
      variantId: variant.id,
      mapId: variant.mapId,
      mode: variant.id === WORKSHOP_VARIANT_ID
        ? 'verdant-workshop' : 'custom-environment',
      ready: true,
      anchor: [GARAGE_X, 0, GARAGE_Z],
    };
    // A battlefield retained for the next round remains detached and asleep.
    // Garage variants never ask it to update, compile, or contribute shadows.
    setWorldDormant(true);
    placeGarage();
    setGarageSunTrim(true);
    poseCamera();
    invalidatePresentation();
  };

  return {
    activate,
    poseCamera,
    diagnostics: () => Object.freeze({
      ...state,
      anchor: Object.freeze([...state.anchor]) as readonly [number, number, number],
    }),
  };
}
