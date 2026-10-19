import { atmosphereBand, atmospherePlume, atmosphereStreamer, atView } from './garageAtmosphereKit.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';

/**
 * Frosthollow's kit (garage r9, g1 lane): an earth-covered repair bunker at the edge of a Podhale timber village under the
 * High Tatra (garageFacilityDetails.ts builds the bunker, garageSkyline.ts the massif, the frozen river, the wooden church,
 * the village and the sawmill from the map). Coordinates are the opening view's frame (garageKitPlacements.ts).
 *
 * The cells: the bunker's right pier carries the LED panel (garageSlideshowPlacement.ts), its number and the crest plate;
 * the duty office under the timber lean-to (a computer station, the PVC banner on its front, the notice board with three
 * prints beside it); a forklift parked in the lit bay beyond the half-open blast door; a monorail on its portal frame at work on a road-wheel station over its stands; the cold-start
 * cell (the booster compressor, its hose, the frosted bowser, jerrycans); the bays' swaps (a tarp-covered stack, a sledge
 * of tool chests on a pallet, track pallets); snow poles (cones) along the road; the nameboard on its posts at the left;
 * wood smoke from the lodge's chimney, steam from the bunker's vents, spindrift off the crests in the out-ring.
 */
export const GARAGE_KIT_FROSTHOLLOW: GarageKitPlacement = {
  items: [
    // the bunker's right pier: its number and the crest plate over the LED panel
    { kind: 'sign', sign: 'plate', rect: 'num.02', at: [15.9, 26.02], yaw: Math.PI / 4, y: 4.2, size: [0.7, 0.7] },
    { kind: 'display', display: 'plate', rect: 'brand.crest.metal', at: [17.4, 26.02], yaw: Math.PI / 4, y: 3.9, size: [0.9, 0.9] },
    // the duty office under the timber lean-to: the station, the notice board, the PVC banner on the lean-to's front
    { kind: 'display', display: 'station', at: [19.6, 22.6], yaw: Math.PI / 4 - 0.15, screens: ['readout.armor.abrams', 'map.winter'], width: 1.7 },
    { kind: 'display', display: 'board', rects: ['still.winter', 'still.alpine', 'still.verdant'], at: [24.2, 19.6], yaw: Math.PI / 4 - 0.4, size: [2.2, 1.0], posts: 1.0 },
    { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [19.8, 20.15], yaw: Math.PI / 4, y: 1.45, size: [4.6, 0.72], options: { gap: 0.3 } },
    // a monorail on its portal frame at work: a road-wheel station lifted over its stands
    { kind: 'crane', crane: 'monorail', at: [-16.2, 15.6], yaw: Math.PI / 2 - 0.2, params: { length: 5.2, height: 4.6, trolleyAt: 0.72, load: { kind: 'roadwheels' } } },
    { kind: 'bench', name: 'standSet', at: [-18.0, 18.8], yaw: Math.PI / 2 - 0.2 },
    { kind: 'bench', name: 'workbench', at: [-21.0, 13.4], yaw: Math.PI / 2 - 0.2, params: { screen: 'readout.modules.burlak' } },
    { kind: 'bench', name: 'rollCab', at: [-20.4, 16.6], yaw: Math.PI / 2 },
    { kind: 'sign', sign: 'post', rect: 'picto.overhead', at: [-14.2, 12.4], yaw: Math.PI / 2 - 0.3, size: [0.55, 0.55] },
    // the village's timber palisade closing the cell's back
    { kind: 'wall', wall: 'palisade', points: [[-30.5, 9.5], [-26.5, 20.5]] },
    // the cold-start cell: the booster compressor and its hose, the frosted bowser, jerrycans
    { kind: 'prop', name: 'compressor', at: [-18.4, 9.6], yaw: Math.PI / 2 + 0.3 },
    { kind: 'prop', name: 'coiledHose', at: [-16.8, 8.2], yaw: 0.4 },
    { kind: 'prop', name: 'bowser', at: [-22.8, 13.0], yaw: Math.PI / 2 - 0.1 },
    { kind: 'prop', name: 'jerrycan', at: [-20.2, 11.8], yaw: 0.2 },
    { kind: 'prop', name: 'jerrycan', at: [-20.6, 11.9], yaw: 0.3 },
    { kind: 'prop', name: 'jerrycan', at: [-20.4, 12.3], yaw: 0.1 },
    { kind: 'prop', name: 'extinguisher', at: [-19.0, 13.4], yaw: 0 },
    { kind: 'display', display: 'nameboard', at: [-13.2, 8.6], yaw: Math.PI / 2 - 0.3, width: 2.4, posts: 1.15 },
    // snow poles (cones) along the ploughed road's verges
    { kind: 'prop', name: 'cone', at: [4.9, 13.6], yaw: 0 },
    { kind: 'prop', name: 'cone', at: [-1.4, 14.2], yaw: 0.5 },
    // the forklift parked in the lit bay beyond the half-open door
    { kind: 'prop', name: 'forklift', at: [7.6, 30.4], yaw: Math.PI / 4 + 0.35 },
    // the bays' swaps: a tarp-covered stack by the left shed, a sledge of tool chests and track pallets by the right
    { kind: 'prop', name: 'tarpStack', at: [-27.8, -3.6], yaw: Math.PI / 4 },
    { kind: 'prop', name: 'pallet', at: [27.6, -1.6], yaw: 0.4 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [27.5, -1.5], yaw: 0.45, y: 0.14 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [28.0, -1.8], yaw: 0.35, y: 0.14 },
    { kind: 'prop', name: 'trackPallet', at: [26.4, 1.4], yaw: 2.4 },
    { kind: 'prop', name: 'generator', at: [24.8, -13.8], yaw: Math.PI / 2 },
  ],
  atmosphere: {
    drift: 0.02,
    cards: [
      // steam from the bunker's vent stacks (over the hero's halo in the frame), wood smoke from the lodge's chimney
      ...atmospherePlume(atView(5.0, 9.4, 32.0), 6, 1.4, 'steam', 2.2, 5),
      ...atmospherePlume(atView(-22.0, 9.6, 30.6), 9, 1.8, 'smoke', 2.0, 6),
      // spindrift streaming off the snowbanks at ankle height, the yard's left and right
      atmosphereStreamer(atView(-34, 0.1, 2), atView(-22, 0.1, -12), 'mist'),
      atmosphereStreamer(atView(24, 0.1, 6), atView(36, 0.1, -8), 'mist', 0.5),
      // the valley's haze in the out-ring's directions
      atmosphereBand(atView(-72, 0.5, -18), atView(-62, 0.5, 30), 9, 'mist'),
      atmosphereBand(atView(56, 0.5, -44), atView(70, 0.5, 6), 9, 'mist', 0.6),
    ],
  },
};
