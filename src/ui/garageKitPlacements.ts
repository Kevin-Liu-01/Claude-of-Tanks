import type { GarageVariant } from '../game/garageVariants.ts';
import { atmosphereBand, atmospherePlume, atmosphereStreamer } from './garageAtmosphereKit.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';

/**
 * Each Garage's kit arrangement (garage r9): the per-garage lanes fill these rows; garageKitPlacement.ts builds them.
 * Coordinates are the opening view's frame: `at` = [side, depth] (side right, depth away from the camera), `yaw`
 * relative to the yard grid (0: the piece's front faces world +Z, toward the camera's left; PI/2: world +X, toward the
 * camera's right; a piece in the frame's left third turns PI/2 to face the camera, one in the right third 0). In the canonical frame only the thirds left and right of the hero's halo show new pieces (screen x 22-33 %
 * and 67-78 %); everything else fills the orbit, the bays and the out-ring views.
 */
export const GARAGE_KIT_PLACEMENTS: Readonly<Partial<Record<GarageVariant['architecture'], GarageKitPlacement>>> = Object.freeze({
  // Redrock Divide: a heavy recovery yard on a red sand valley floor (garage r9 kit demo; the Redrock lane extends it).
  // The site office's cell by the compound gate (a computer station, the recovery board, a parts and fuel cell), the
  // LED trailer and its generator past the gantry in the frame's right band (garageSlideshowPlacement.ts); the recovery story's low-loader with its
  // ramps down; an A-frame gantry at work on a power pack; muralled T-walls and a HESCO line with its mesh banner on
  // the perimeter; low red-dust streamers and haze staging the walls.
  recovery_yard: {
    items: [
      // the site office cell
      { kind: 'display', display: 'station', at: [-20.6, 30.4], yaw: Math.PI / 2, screens: ['readout.armor.k2', 'map.badlands', 'readout.modules.burlak'], width: 2.0, rugged: true },
      // the LED trailer's generator and its cable reel beside it (the trailer itself: garageSlideshowPlacement.ts)
      { kind: 'prop', name: 'generator', at: [22.2, 37.6], yaw: 0 },
      { kind: 'prop', name: 'cableReel', at: [21.2, 39.6], yaw: 0.4 },
      { kind: 'display', display: 'nameboard', at: [-15.4, 14.2], yaw: Math.PI / 2, width: 2.6, posts: 1.2 },
      { kind: 'display', display: 'board', rects: ['media.desert', 'media.foundry', 'media.urban'], at: [-19.8, 27.6], yaw: Math.PI / 2, size: [2.6, 1.1], posts: 0.9 },
      { kind: 'sign', sign: 'post', rect: 'picto.speed10', at: [-12.4, 9.6], yaw: Math.PI / 2, size: [0.6, 0.6] },
      { kind: 'sign', sign: 'post', rect: 'picto.tankcrossing', at: [-12.4, 11.2], yaw: Math.PI / 2, size: [0.7, 0.62] },
      // the parts and fuel cell behind the trailer
      { kind: 'prop', name: 'tarpStack', at: [-12.6, 32.6], yaw: 0.1 },
      { kind: 'prop', name: 'pallet', at: [-14.6, 33.4], yaw: 0 },
      { kind: 'prop', name: 'drum200', at: [-14.9, 33.2], yaw: 0 },
      { kind: 'prop', name: 'drum200', at: [-14.3, 33.7], yaw: 1.2 },
      { kind: 'prop', name: 'drum200', at: [-14.4, 32.8], yaw: 2.1 },
      { kind: 'prop', name: 'jerrycan', at: [-15.8, 32.2], yaw: 0.3 },
      { kind: 'prop', name: 'jerrycan', at: [-16.1, 32.3], yaw: 0.25 },
      { kind: 'prop', name: 'ammoCrate', at: [-11.2, 34.2], yaw: 0.05, params: { variant: 1 } },
      { kind: 'prop', name: 'ammoCrate', at: [-11.3, 34.3], yaw: 0.05, y: 0.36 },
      { kind: 'prop', name: 'spillBin', at: [-17.0, 32.8], yaw: Math.PI / 2 },
      { kind: 'prop', name: 'extinguisher', at: [-16.8, 29.4], yaw: 0 },
      { kind: 'prop', name: 'bowser', at: [-21.8, 36.4], yaw: 0.0 },
      // the recovery story: the low-loader parked off the trail with its ramps down, chained timber on its deck
      { kind: 'prop', name: 'lowLoader', at: [-31, 24], yaw: Math.PI / 2 },
      { kind: 'prop', name: 'roadWheel', at: [-27.5, 18.4], yaw: 0 },
      { kind: 'prop', name: 'roadWheel', at: [-27.1, 18.8], yaw: 0, y: 0.17 },
      { kind: 'prop', name: 'roadWheel', at: [-26.4, 18.2], yaw: 0, params: { lying: false } },
      { kind: 'prop', name: 'towBar', at: [-24.8, 20.6], yaw: 0.7 },
      { kind: 'prop', name: 'trackPallet', at: [-25.6, 22.4], yaw: 0.2 },
      // an A-frame gantry at work on a power pack, the stands and a welding cart beside it
      { kind: 'crane', crane: 'aframe', at: [-17.2, 12.2], yaw: Math.PI / 4, params: { span: 4.2, height: 3.8, load: { kind: 'powerpack' } } },
      { kind: 'bench', name: 'powerPackStand', at: [-18.4, 15.6], yaw: Math.PI / 4 },
      { kind: 'bench', name: 'weldingCart', at: [-21.5, 12.4], yaw: 0.9 },
      { kind: 'bench', name: 'workbench', at: [-21.8, 15.4], yaw: Math.PI / 4 + 0.15, params: { screen: 'readout.modules.t90' } },
      { kind: 'bench', name: 'rollCab', at: [-19.6, 17.6], yaw: Math.PI / 4 },
      // perimeter: muralled T-walls on the left, a HESCO line with its mesh banner on the right
      { kind: 'wall', wall: 'twall', points: [[-34, 6], [-26, 14]], params: { mural: 'stencil.crest', muralEvery: 3 } },
      { kind: 'wall', wall: 'twall', points: [[-26, 14.6], [-23.6, 17]], params: { mural: 'stencil.wordmark', muralEvery: 9 } },
      { kind: 'wall', wall: 'hesco', points: [[28, 34], [37, 25]], params: { mural: 'brand.banner.h', muralEvery: 6 } },
      { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [32.5, 29.5], yaw: Math.PI / 4, y: 1.37, size: [4.2, 0.66], options: { gap: 0.2 } },
    ],
    atmosphere: {
      drift: 0.025,
      cards: [
        // low red-dust streamers left and right of the hero's sector, and a haze band staging the walls
        atmosphereStreamer([-34, 0, 18], [-18, 0, 26], 'reddust'),
        atmosphereStreamer([20, 0, 34], [36, 0, 18], 'reddust', 0.4),
        atmosphereBand([-70, 1, 60], [-20, 1, 85], 9, 'reddust'),
        atmosphereBand([25, 1, 85], [75, 1, 55], 9, 'reddust', 0.5),
        ...atmospherePlume([-58, 0, 95], 14, 3.2, 'smoke', 0.4, 5),
      ],
    },
  },
});
