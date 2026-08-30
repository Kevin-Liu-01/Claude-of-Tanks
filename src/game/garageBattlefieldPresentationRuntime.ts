import * as THREE from 'three';

import {
  resolveGarageBattlefieldPlacement,
  type GarageBattlefieldPlacement,
  type GaragePlacementWorld,
} from './garageBattlefieldPlacement.ts';
import { getGarageVariant } from './garageVariants.ts';

const WORKSHOP_VARIANT_ID = 'verdant_motor_pool';
const WORKSHOP_X = -1500;
const WORKSHOP_Z = -1500;
const DEFAULT_CAMERA_X = 7.4;
const DEFAULT_CAMERA_Z = 8;
const CAMERA_HEIGHT_M = 2.75;
export const GARAGE_CAMERA_LOOK_HEIGHT_M = 1.6;
const CAMERA_FOV_DEG = 42;
const CAMERA_DISTANCE_M = Math.hypot(DEFAULT_CAMERA_X, DEFAULT_CAMERA_Z);

export interface GarageBattlefieldWorld extends GaragePlacementWorld {
  update(deltaSeconds: number, cameraPosition: THREE.Vector3): void;
}

export interface GarageBattlefieldPresentationOptions<
  World extends GarageBattlefieldWorld = GarageBattlefieldWorld,
> {
  garagePosition: THREE.Vector3;
  cameraPosition: THREE.Vector3;
  getSelectedVariantId(): string;
  loadWorld(mapId: string): Promise<World>;
  setWorldDormant(dormant: boolean): void;
  placeGarage(): void;
  setGarageSunTrim(active: boolean): void;
  invalidatePresentation(): void;
  setCameraPose(position: THREE.Vector3, target: THREE.Vector3, fovDegrees: number): void;
  reportError?(message: string, error: unknown): void;
}

export interface GarageBattlefieldState {
  readonly variantId: string;
  readonly mapId: string;
  readonly mode: 'verdant-workshop' | 'active-battlefield';
  readonly ready: boolean;
  readonly placement: Readonly<GarageBattlefieldPlacement> | null;
  readonly error: string;
}

export interface GarageBattlefieldPresentationRuntime {
  activate(variantId: string): Promise<void>;
  poseCamera(): void;
  diagnostics(): Readonly<GarageBattlefieldState>;
}

function copyState(state: GarageBattlefieldState): Readonly<GarageBattlefieldState> {
  return Object.freeze({
    ...state,
    placement: state.placement ? Object.freeze({ ...state.placement }) : null,
  });
}

/**
 * Owns the complete outdoor-Garage activation transaction: cancellation,
 * measured placement in the real battlefield, camera framing, phase effects,
 * diagnostics, and failure state. The composition root supplies only the
 * concrete world and presentation ports.
 */
export function createGarageBattlefieldPresentationRuntime<
  World extends GarageBattlefieldWorld = GarageBattlefieldWorld,
>({
  garagePosition,
  cameraPosition,
  getSelectedVariantId,
  loadWorld,
  setWorldDormant,
  placeGarage,
  setGarageSunTrim,
  invalidatePresentation,
  setCameraPose,
  reportError = (message, error) => console.error(message, error),
}: GarageBattlefieldPresentationOptions<World>): GarageBattlefieldPresentationRuntime {
  const required = [getSelectedVariantId, loadWorld, setWorldDormant, placeGarage,
    setGarageSunTrim, invalidatePresentation, setCameraPose, reportError];
  if (!(garagePosition instanceof THREE.Vector3)
    || !(cameraPosition instanceof THREE.Vector3)
    || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage battlefield presentation requires every lifecycle port');
  }

  const initialVariant = getGarageVariant(getSelectedVariantId());
  let generation = 0;
  let cameraOffsetX = DEFAULT_CAMERA_X;
  let cameraOffsetZ = DEFAULT_CAMERA_Z;
  let state: GarageBattlefieldState = {
    variantId: initialVariant.id,
    mapId: initialVariant.mapId,
    mode: initialVariant.id === WORKSHOP_VARIANT_ID
      ? 'verdant-workshop' : 'active-battlefield',
    ready: initialVariant.id === WORKSHOP_VARIANT_ID,
    placement: null,
    error: '',
  };
  const cameraPose = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();

  const poseCamera = (): void => {
    cameraPose.set(
      garagePosition.x + cameraOffsetX,
      garagePosition.y + CAMERA_HEIGHT_M,
      garagePosition.z + cameraOffsetZ,
    );
    cameraTarget.set(
      garagePosition.x,
      garagePosition.y + GARAGE_CAMERA_LOOK_HEIGHT_M,
      garagePosition.z,
    );
    setCameraPose(cameraPose, cameraTarget, CAMERA_FOV_DEG);
  };

  const activate = async (variantId: string): Promise<void> => {
    const activationGeneration = ++generation;
    const variant = getGarageVariant(variantId);
    if (variant.id === WORKSHOP_VARIANT_ID) {
      state = {
        variantId: variant.id,
        mapId: variant.mapId,
        mode: 'verdant-workshop',
        ready: true,
        placement: null,
        error: '',
      };
      garagePosition.set(WORKSHOP_X, 0, WORKSHOP_Z);
      cameraOffsetX = DEFAULT_CAMERA_X;
      cameraOffsetZ = DEFAULT_CAMERA_Z;
      setWorldDormant(true);
      placeGarage();
      setGarageSunTrim(true);
      invalidatePresentation();
      return;
    }

    state = {
      variantId: variant.id,
      mapId: variant.mapId,
      mode: 'active-battlefield',
      ready: false,
      placement: null,
      error: '',
    };
    invalidatePresentation();

    try {
      const world = await loadWorld(variant.mapId);
      if (activationGeneration !== generation || getSelectedVariantId() !== variant.id) return;
      const placement = resolveGarageBattlefieldPlacement(world);
      if (!placement.clear) {
        throw new Error(
          `${variant.mapId} deployment failed Garage clearance `
          + `(obstacle ${placement.obstacleClearanceM} m, relief ${placement.reliefM} m, `
          + `normal ${placement.minNormalY})`,
        );
      }
      garagePosition.set(placement.x, placement.y, placement.z);
      cameraOffsetX = placement.cameraX * CAMERA_DISTANCE_M;
      cameraOffsetZ = placement.cameraZ * CAMERA_DISTANCE_M;
      setWorldDormant(false);
      placeGarage();
      setGarageSunTrim(true);
      world.update(0, cameraPosition);
      state = {
        variantId: variant.id,
        mapId: variant.mapId,
        mode: 'active-battlefield',
        ready: true,
        placement,
        error: '',
      };
      invalidatePresentation();
    } catch (error) {
      if (activationGeneration !== generation) return;
      state = {
        variantId: variant.id,
        mapId: variant.mapId,
        mode: 'active-battlefield',
        ready: false,
        placement: null,
        error: String(error),
      };
      reportError(`[garageBattlefield] ${variant.mapId} activation failed`, error);
    }
  };

  return {
    activate,
    poseCamera,
    diagnostics: () => copyState(state),
  };
}
