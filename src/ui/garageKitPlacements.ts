import type { GarageVariant } from '../game/garageVariants.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';
import { GARAGE_KIT_FROSTHOLLOW } from './garageKitFrosthollow.ts';
import { GARAGE_KIT_GLACIER } from './garageKitGlacier.ts';
import { GARAGE_KIT_MONSOON } from './garageKitMonsoon.ts';
import { GARAGE_KIT_REDROCK } from './garageKitRedrock.ts';
import type { GarageSkyline } from './garageSkylineKit.ts';
import { IRONWORKS_KIT, IRONWORKS_SKYLINE } from './garageIronworksKit.ts';
import { CINDER_KIT, CINDER_SKYLINE } from './garageCinderKit.ts';
import { SALTMERE_KIT, SALTMERE_SKYLINE } from './garageSaltmereKit.ts';
import { SIROCCO_KIT_PLACEMENT } from './garageSiroccoKit.ts';
import { STEINBURG_KIT_PLACEMENT } from './garageSteinburgKit.ts';

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
  // Ironworks: the crane bay under the blast furnaces (garageIronworksKit.ts, the per-garage brief 10)
  factory_line: IRONWORKS_KIT,
  // Cinder Junction: the engine shed, its yard and the turntable on the coalfield (garageCinderKit.ts, brief 6)
  rail_roundhouse: CINDER_KIT,
  // Saltmere Bay: the granite graving dock on the Breton coast (garageSaltmereKit.ts, brief 5)
  naval_drydock: SALTMERE_KIT,
  // Sirocco Deployment: a forward FOB terrace at the wadi crossing (garage r9 g3; its cells: garageSiroccoKit.ts)
  shade_depot: SIROCCO_KIT_PLACEMENT,
  // Steinburg Deployment: the Zeughaus's street, crane bay and dispatch office (garage r9 g3: garageSteinburgKit.ts)
  brick_arsenal: STEINBURG_KIT_PLACEMENT,
});

/**
 * Each Garage's built skyline (garage r9, K10: garageSkylineKit.ts): its map's named landmarks at their bearings and the
 * land between them, drawn into the pack's backdrop. A Garage without a row keeps the biome bands (and its built horizon).
 */
export const GARAGE_KIT_SKYLINES: Readonly<Partial<Record<GarageVariant['architecture'], GarageSkyline>>> = Object.freeze({
  factory_line: IRONWORKS_SKYLINE,
  rail_roundhouse: CINDER_SKYLINE,
  naval_drydock: SALTMERE_SKYLINE,
});
