import type { GarageVariant } from '../game/garageVariants.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';
import { GARAGE_KIT_FROSTHOLLOW } from './garageKitFrosthollow.ts';
import { GARAGE_KIT_GLACIER } from './garageKitGlacier.ts';
import { GARAGE_KIT_MONSOON } from './garageKitMonsoon.ts';
import { GARAGE_KIT_REDROCK } from './garageKitRedrock.ts';

/**
 * Each Garage's kit arrangement (garage r9): the per-garage lanes fill these rows; garageKitPlacement.ts builds them.
 * Coordinates are the opening view's frame: `at` = [side, depth] (side right, depth away from the camera), `yaw`
 * relative to the yard grid (0: the piece's front faces world +Z, toward the camera's left; PI/2: world +X, toward the
 * camera's right; a piece in the frame's left third turns PI/2 to face the camera, one in the right third 0). In the canonical frame only the thirds left and right of the hero's halo show new pieces (screen x 22-33 %
 * and 67-78 %); everything else fills the orbit, the bays and the out-ring views.
 */
export const GARAGE_KIT_PLACEMENTS: Readonly<Partial<Record<GarageVariant['architecture'], GarageKitPlacement>>> = Object.freeze({
  // the g1 lane's four (garage r9): each Garage's arrangement in its own module
  recovery_yard: GARAGE_KIT_REDROCK,
  rock_cavern: GARAGE_KIT_GLACIER,
  repair_bunker: GARAGE_KIT_FROSTHOLLOW,
  rain_canopy: GARAGE_KIT_MONSOON,
});
