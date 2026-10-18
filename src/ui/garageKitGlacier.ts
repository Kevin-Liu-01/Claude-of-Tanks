import { atmosphereBand, atmosphereStreamer, atView } from './garageAtmosphereKit.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';

/**
 * Glacier Pass's kit (garage r9, g1 lane): a military service cavern cut into a granite cliff on the Col du Mont-Cenis
 * (garageRockKit.ts builds the cliff and its bore, garageSkyline.ts the massif, the frozen lake, the Hospice, the forts and
 * the Grande Croix from the map). Coordinates are the opening view's frame (garageKitPlacements.ts).
 *
 * The cells: an overhead crane in the bore at work on a turret, seen at the mouth; the portal's header with the crest and
 * wordmark plate over the opening and its tunnel number; the guard post at the portal's right: its LED panel on legs
 * (garageSlideshowPlacement.ts: the bore and the portal stand behind the hero, in the halo no display may enter), its
 * computer station and the crest on a post; the route
 * board with three prints at the left; the heated fuel cell (the bowser, drums, the spill kit, the no-smoking and
 * flammable plates, its T-wall blast screen with the crest stencilled on it) in the frame's left; the plough yard's light tower, generator and cable reel by the portal's right;
 * the parts store's crates under a tarp; the ropeway's valley pylon at the cliff's foot, its ropes climbing the face; the
 * nameboard on its posts; cold air spilling from the bore along the floor and a spindrift plume off the crest.
 */
export const GARAGE_KIT_GLACIER: GarageKitPlacement = {
  items: [
    // the overhead crane in the bore, its runway along the tunnel, hook down on a turret (seen through the mouth)
    { kind: 'crane', crane: 'overhead', at: [8.5, 33.2], yaw: Math.PI / 4, shade: 0.38,
      params: { span: 5.4, runway: 7.2, railY: 4.25, girders: 1, swl: 20, columns: false, bridgeAt: 0.62, trolleyAt: 0.5, number: 7,
        load: { kind: 'turret', rigging: 'slings' } } },
    // the portal's header over the opening: the crest-and-wordmark plate and the tunnel number, above the track lintel
    { kind: 'display', display: 'plate', rect: 'brand.banner.h', at: [8.5, 26.75], yaw: Math.PI / 4, y: 7.88, size: [4.4, 0.66] },
    { kind: 'sign', sign: 'plate', rect: 'num.07', at: [11.55, 26.75], yaw: Math.PI / 4, y: 7.88, size: [0.62, 0.62] },
    // the guard post's station at the plant house, readouts and the pass's map
    { kind: 'display', display: 'station', at: [16.8, 14.4], yaw: Math.PI / 4 - 0.25, screens: ['readout.armor.leopard', 'map.alpine', 'readout.modules.abrams'], width: 2.0, rugged: true },
    { kind: 'prop', name: 'extinguisher', at: [18.3, 13.9], yaw: 0 },
    { kind: 'sign', sign: 'post', rect: 'brand.crest.color', at: [18.8, 16.0], yaw: Math.PI / 4 - 0.3, size: [0.8, 0.8] },
    // the route board with three prints, the frame's left
    { kind: 'display', display: 'board', rects: ['media.alpine', 'media.winter', 'media.coastal'], at: [-17.4, 17.6], yaw: Math.PI / 2 - 0.25, size: [2.6, 1.1], posts: 1.0 },
    { kind: 'display', display: 'nameboard', at: [11.6, 9.6], yaw: Math.PI / 4 + 0.32, width: 2.4, posts: 1.1 },
    { kind: 'sign', sign: 'post', rect: 'picto.speed10', at: [-12.6, 4.8], yaw: Math.PI / 2 - 0.2, size: [0.55, 0.55] },
    // the heated fuel cell on the left: the bowser, its drums and spill kit, the no-smoking plate
    { kind: 'prop', name: 'bowser', at: [-19.6, 9.6], yaw: Math.PI / 2 + 0.15 },
    { kind: 'prop', name: 'drum200', at: [-22.4, 7.6], yaw: 0.2 },
    { kind: 'prop', name: 'drum200', at: [-22.9, 8.3], yaw: 1.4 },
    { kind: 'prop', name: 'drum200', at: [-22.0, 8.5], yaw: 2.5, params: { lying: true } },
    { kind: 'prop', name: 'spillBin', at: [-17.2, 7.2], yaw: Math.PI / 2 },
    { kind: 'prop', name: 'extinguisher', at: [-17.6, 11.8], yaw: 0.4 },
    { kind: 'sign', sign: 'post', rect: 'picto.nosmoking', at: [-16.4, 12.6], yaw: Math.PI / 2 - 0.3, size: [0.55, 0.55] },
    { kind: 'sign', sign: 'post', rect: 'picto.flammable', at: [-16.4, 5.4], yaw: Math.PI / 2 - 0.3, size: [0.55, 0.55] },
    // the fuel point's blast walls: T-walls behind it, the crest stencilled on every third panel
    { kind: 'wall', wall: 'twall', points: [[-25.5, 4.6], [-25.5, 13.4]], params: { mural: 'stencil.crest', muralEvery: 3 } },
    // the plough yard by the portal's right: the light tower over it, its generator and cable reel, cones on the road edge
    { kind: 'prop', name: 'lightTower', at: [21.0, 10.6], yaw: Math.PI / 4 - 0.6 },
    { kind: 'prop', name: 'generator', at: [22.8, 12.6], yaw: 0.3 },
    { kind: 'prop', name: 'cableReel', at: [21.4, 13.6], yaw: 1.1 },
    { kind: 'prop', name: 'cone', at: [12.2, 21.4], yaw: 0 },
    { kind: 'prop', name: 'cone', at: [13.4, 19.8], yaw: 0.7 },
    // the parts store: crates under a tarp and ammunition boxes on a pallet beside the parts cage
    { kind: 'prop', name: 'tarpStack', at: [9.2, 19.2], yaw: Math.PI / 4 + 0.1 },
    { kind: 'prop', name: 'pallet', at: [7.0, 18.6], yaw: 0.2 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [6.8, 18.5], yaw: 0.25, y: 0.14 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [7.3, 18.8], yaw: 0.15, y: 0.14 },
    { kind: 'prop', name: 'gasCage', at: [-9.4, 22.6], yaw: Math.PI / 4 },
    // the ropeway's valley pylon at the cliff's foot on the left, its ropes climbing the face to the upper station
    { kind: 'crane', crane: 'ropeway', at: [-29.5, 20.5], yaw: Math.PI / 4 + Math.PI, params: { height: 9, ropeTo: [0, 19, 24] } },
    // the bays' swaps: a sledge of tool chests by the left gallery, the snow-chain and fuel heater kit by the right
    { kind: 'prop', name: 'pallet', at: [-27.2, -4.6], yaw: 0.3 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [-27.3, -4.5], yaw: 0.35, y: 0.14 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [-26.8, -4.8], yaw: 0.3, y: 0.14 },
    { kind: 'prop', name: 'compressor', at: [28.6, -2.0], yaw: Math.PI / 2 },
    { kind: 'prop', name: 'coiledHose', at: [27.4, -0.6], yaw: 0 },
  ],
  atmosphere: {
    drift: 0.018,
    cards: [
      // cold air spilling out of the bore along the floor, drifting off to the portal's right
      atmosphereStreamer(atView(14.2, 0.6, 25.2), atView(20.5, 0.6, 20.2), 'mist'),
      atmosphereStreamer(atView(15.5, 0.4, 23.8), atView(22.5, 0.4, 16.8), 'mist', 0.5),
      // the spindrift plume streaming off the crest (above the hero's halo in the frame)
      atmosphereBand(atView(-24, 19.5, 36), atView(-6, 20.5, 38), 3.2, 'mist', 0.2),
      atmosphereBand(atView(14, 20.0, 40), atView(30, 18.5, 36), 2.6, 'mist', 0.6),
      // blue haze layering the far ridges, in the out-ring's directions
      atmosphereBand(atView(-70, 1, -20), atView(-64, 1, 30), 9, 'mist'),
      atmosphereBand(atView(60, 1, -40), atView(70, 1, 10), 9, 'mist', 0.4),
      atmosphereBand(atView(-30, 1, -66), atView(40, 1, -64), 8, 'mist', 0.8),
    ],
  },
};
