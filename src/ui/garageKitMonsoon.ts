import { atmosphereBand, atmosphereDrips, atmosphereStreamer, atView } from './garageAtmosphereKit.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';

/**
 * Monsoon Ridge's kit (garage r9, g1 lane): a hill-station field bay just after the rain under the Naga Hills
 * (garageSkyline.ts draws the misted ridges, the flood channel, Kohima on its saddle and the tea estate from the map).
 * Coordinates are the opening view's frame (garageKitPlacements.ts); the rain canopy's floor stands 0.45 m on its plinth.
 *
 * The cells: bamboo lashed round the canopy's columns; the canopy busy, not bare: a light A-frame gantry at work on a power pack beside its stand, the bench and
 * roll cabs at its back, the welding cart and the raised drum rack on the right; the LED panel bolted to the canopy's
 * front-right column (garageSlideshowPlacement.ts) with the field computer beside it on its rugged case; the tarp banner
 * lashed between bamboo poles; the bamboo-framed notice board with three prints at the left; sandbags along the drain,
 * sealed cases and the radio's generator; the nameboard; drips off the right gutter, mist in the hills' folds and steam
 * rising off the sunlit laterite.
 */
const FLOOR = 0.46; // the canopy's plinth over its ground

/** Bamboo lashed round the lower third of the canopy's steel columns, on their outer faces (a pole each side). */
const BAMBOO_CLADDING = [-1, 1].flatMap((side) => [20, 24, 28, 32].flatMap((depth) => [-0.28, 0.28].map((offset) => ({
  kind: 'prop' as const, name: 'pole', at: [side * 12.3, depth + offset] as const, yaw: 0, y: FLOOR, params: { variant: 0 },
})))).filter((pole) => !(pole.at[0] > 0 && pole.at[1] < 20)); // the panel's bracket takes the front-right column's face

export const GARAGE_KIT_MONSOON: GarageKitPlacement = {
  items: [
    ...BAMBOO_CLADDING,
    // under the canopy: the A-frame at work on a power pack, its stand, the bench and roll cabs at the back
    { kind: 'crane', crane: 'aframe', at: [-6.6, 27.2], yaw: Math.PI / 4, y: FLOOR, params: { span: 4.0, height: 3.6, load: { kind: 'powerpack' } } },
    { kind: 'bench', name: 'powerPackStand', at: [-3.6, 28.6], yaw: Math.PI / 4, y: FLOOR },
    { kind: 'bench', name: 'workbench', at: [-9.6, 30.9], yaw: Math.PI / 4, y: FLOOR, params: { screen: 'readout.modules.abrams' } },
    { kind: 'bench', name: 'rollCab', at: [-11.0, 28.4], yaw: Math.PI / 4 + 0.3, y: FLOOR },
    { kind: 'bench', name: 'partsTrolley', at: [-4.4, 25.0], yaw: Math.PI / 4 - 0.4, y: FLOOR },
    { kind: 'bench', name: 'weldingCart', at: [6.8, 29.6], yaw: Math.PI / 4 + 0.5, y: FLOOR },
    { kind: 'prop', name: 'oilRack', at: [9.8, 30.8], yaw: Math.PI / 4, y: FLOOR },
    { kind: 'prop', name: 'spillBin', at: [11.0, 28.2], yaw: Math.PI / 2, y: FLOOR },
    // (r2: the canopy's front half stood bare) the stores staged for the next pull, all low so they sit behind the
    // hero's hull in the opening view: blue and green tarps over pallets, a track pallet and road wheels, the pallet jack
    // that brought them, a cable reel, crates on a pallet
    { kind: 'prop', name: 'tarpStack', at: [-1.4, 23.0], yaw: Math.PI / 4 + 0.2, y: FLOOR, params: { color: 0x2e5a86 } },
    { kind: 'prop', name: 'tarpStack', at: [0.2, 24.5], yaw: Math.PI / 4 - 0.1, y: FLOOR, params: { color: 0x41683c } },
    { kind: 'prop', name: 'trackPallet', at: [3.0, 23.2], yaw: Math.PI / 4, y: FLOOR },
    { kind: 'prop', name: 'roadWheel', at: [4.7, 24.4], yaw: 0.4, y: FLOOR },
    { kind: 'prop', name: 'roadWheel', at: [5.5, 23.6], yaw: 1.1, y: FLOOR },
    { kind: 'prop', name: 'palletJack', at: [1.8, 26.6], yaw: 0.9, y: FLOOR },
    { kind: 'prop', name: 'cableReel', at: [-2.4, 25.9], yaw: 0.3, y: FLOOR },
    { kind: 'prop', name: 'pallet', at: [4.6, 27.6], yaw: Math.PI / 4, y: FLOOR },
    { kind: 'prop', name: 'ammoCrate', at: [4.4, 27.5], yaw: Math.PI / 4, y: FLOOR + 0.14 },
    { kind: 'prop', name: 'ammoCrate', at: [4.9, 27.8], yaw: Math.PI / 4 + 0.1, y: FLOOR + 0.14 },
    // the field computer beside the panel's column, on its rugged case; the radio's generator and sealed cases by it
    { kind: 'display', display: 'station', at: [16.0, 19.6], yaw: Math.PI / 4 - 0.25, screens: ['readout.armor.leopard', 'map.monsoon'], width: 1.7, rugged: true },
    { kind: 'prop', name: 'generator', at: [18.4, 19.0], yaw: 0.2 },
    { kind: 'sign', sign: 'post', rect: 'picto.electric', at: [19.8, 21.2], yaw: Math.PI / 4 - 0.3, size: [0.5, 0.5] },
    // gabions holding the terrace's edge behind the field computer, and on the left by the board
    { kind: 'wall', wall: 'gabion', points: [[20.8, 17.8], [25.8, 22.2]] },
    { kind: 'wall', wall: 'gabion', points: [[-22.6, 11.0], [-19.8, 19.4]] },
    { kind: 'prop', name: 'ammoBoxSteel', at: [17.4, 17.6], yaw: 0.3 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [17.4, 17.6], yaw: 0.25, y: 0.2 },
    // the tarp banner lashed between bamboo poles on the canopy's right, the frame's right edge
    { kind: 'prop', name: 'pole', at: [20.0, 12.4], yaw: 0, params: { variant: 0 } },
    { kind: 'prop', name: 'pole', at: [23.0, 10.4], yaw: 0, params: { variant: 0 } },
    { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [21.5, 11.4], yaw: 0.2, y: 2.2, size: [3.1, 0.48], options: { gap: 0.25 } },
    // the crest hanging under the canopy's right eave, in the frame's right band
    { kind: 'sign', sign: 'hanging', rect: 'brand.crest.color', at: [13.5, 20.6], yaw: Math.PI / 4 + 0.2, y: 4.35, size: [0.8, 0.8] },
    // the bamboo-framed notice board with three prints, the frame's left
    { kind: 'display', display: 'board', rects: ['still.monsoon', 'still.verdant', 'still.railyard'], at: [-16.4, 14.6], yaw: Math.PI / 2 - 0.25, size: [2.4, 1.05], posts: 0.95 },
    { kind: 'display', display: 'nameboard', at: [-11.4, 6.6], yaw: Math.PI / 2 - 0.35, width: 2.4, posts: 1.1 },
    // sandbags along the right drain, a sealed case on them
    { kind: 'prop', name: 'sandbag', at: [14.9, 24.6], yaw: 0.1 },
    { kind: 'prop', name: 'sandbag', at: [14.9, 25.3], yaw: -0.1, params: { variant: 1 } },
    { kind: 'prop', name: 'sandbag', at: [14.9, 26.0], yaw: 0.2, params: { variant: 2 } },
    { kind: 'prop', name: 'sandbag', at: [14.9, 24.95], yaw: 0, y: 0.18, params: { variant: 1 } },
    { kind: 'prop', name: 'sandbag', at: [14.9, 25.65], yaw: 0.1, y: 0.18 },
    // mud-splashed jerrycans and a pallet on blocks on the left, out of the water
    { kind: 'prop', name: 'pallet', at: [-15.2, 20.4], yaw: 0.3, y: 0.2 },
    { kind: 'prop', name: 'jerrycan', at: [-15.0, 20.3], yaw: 0.3, y: 0.34 },
    { kind: 'prop', name: 'jerrycan', at: [-15.4, 20.5], yaw: 0.35, y: 0.34 },
    { kind: 'prop', name: 'jerrycan', at: [-14.6, 20.6], yaw: 0.25, y: 0.34 },
    // the bays' swaps: a water pump (compressor) and its hose by the right pavilion, track pallets by the left
    { kind: 'prop', name: 'compressor', at: [28.2, -1.6], yaw: Math.PI / 2 },
    { kind: 'prop', name: 'coiledHose', at: [27.0, -0.2], yaw: 0.6 },
    { kind: 'prop', name: 'trackPallet', at: [-27.6, -4.2], yaw: 0.8 },
  ],
  atmosphere: {
    drift: 0.022,
    cards: [
      // drips off the canopy's right gutter (the left one stands behind the hero in the frame)
      // (r4: from behind the hanging crest on, never a curtain in front of it)
      atmosphereDrips(atView(13.8, 5.05, 22.0), atView(13.8, 5.05, 25.6), 1.0),
      // steam rising off the sunlit laterite, the yard's left and right
      atmosphereStreamer(atView(-30, 0.1, 4), atView(-18, 0.1, -10), 'mist'),
      atmosphereStreamer(atView(20, 0.1, 6), atView(32, 0.1, -10), 'mist', 0.5),
      // mist lying in the folds of the hills, in the out-ring's directions
      atmosphereBand(atView(-70, 1.5, -20), atView(-60, 2.5, 34), 7, 'mist'),
      atmosphereBand(atView(58, 1.5, -46), atView(70, 2.5, 8), 7, 'mist', 0.5),
      atmosphereBand(atView(-36, 1.5, -66), atView(34, 2.0, -68), 7, 'mist', 0.3),
    ],
  },
};
