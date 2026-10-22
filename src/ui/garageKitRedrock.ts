import { atmosphereBand, atmospherePlume, atmosphereStreamer, atView } from './garageAtmosphereKit.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';

/**
 * Redrock Divide's kit (garage r9, the g1 lane on the kit lane's demo): a heavy recovery yard on a red sand valley floor
 * between Wadi Rum's jebels (garageSkyline.ts draws them from the map). Coordinates are the opening view's frame
 * (garageKitPlacements.ts).
 *
 * The cells: the recovery gantry at work, a hull hanging under its spreader beam over the turning rolls (it replaces the
 * facility's box-built frame); the site office's cell at the yard's left (a computer station, the recovery board); the LED
 * trailer and its generator in the frame's right band (garageSlideshowPlacement.ts); the parts and fuel cell; the
 * recovery story's low-loader with its ramps down, chained timber on its deck, damaged road wheels and a track pallet by
 * it; an A-frame at work on a power pack beside its stand and the bench; muralled T-walls
 * and a HESCO line with its mesh banner on the perimeter; low red-dust streamers, haze at the jebels' feet and a dust plume
 * far down the trail.
 */
export const GARAGE_KIT_REDROCK: GarageKitPlacement = {
  items: [
    // the recovery gantry at work: lattice legs on rails, the hull mid-lift under a spreader beam over the turning rolls
    { kind: 'crane', crane: 'portal', at: [16, 17], yaw: Math.PI / 2,
      params: { span: 15, height: 8.2, runway: 11, lattice: true, swl: 40, load: { kind: 'hull', rigging: 'beam' }, trolleyAt: 0.68 } },
    { kind: 'sign', sign: 'post', rect: 'picto.overhead', at: [11.6, 9.8], yaw: Math.PI / 4 + 0.3, size: [0.6, 0.6] },
    // the site office cell
    { kind: 'display', display: 'station', at: [-12.8, 7.0], yaw: Math.PI / 2 - 0.25, screens: ['readout.armor.k2', 'map.badlands', 'readout.modules.burlak'], width: 2.0, rugged: true },
    // the monitor trailer's generator and its cable reel beside it (the trailer itself: garageSlideshowPlacement.ts)
    { kind: 'prop', name: 'generator', at: [22.2, 37.6], yaw: 0 },
    { kind: 'prop', name: 'cableReel', at: [21.2, 39.6], yaw: 0.4 },
    { kind: 'display', display: 'nameboard', at: [-15.4, 14.2], yaw: Math.PI / 2, width: 2.6, posts: 1.2 },
    { kind: 'display', display: 'board', rects: ['still.desert', 'still.foundry', 'still.urban'], at: [-21.4, 8.6], yaw: Math.PI / 2 - 0.1, size: [2.6, 1.1], posts: 0.9 },
    { kind: 'sign', sign: 'post', rect: 'picto.speed10', at: [-9.8, 3.6], yaw: Math.PI / 2 - 0.3, size: [0.6, 0.6] },
    { kind: 'sign', sign: 'post', rect: 'picto.tankcrossing', at: [-10.6, 5.0], yaw: Math.PI / 2 - 0.3, size: [0.7, 0.62] },
    // the parts and fuel cell behind the trailer
    { kind: 'prop', name: 'tarpStack', at: [-12.6, 32.6], yaw: 0.1 },
    { kind: 'prop', name: 'pallet', at: [-14.6, 33.4], yaw: 0 },
    { kind: 'prop', name: 'drum200', at: [-14.9, 33.2], yaw: 0 },
    { kind: 'prop', name: 'drum200', at: [-14.3, 33.7], yaw: 1.2 },
    { kind: 'prop', name: 'drum200', at: [-14.4, 32.8], yaw: 2.1 },
    { kind: 'prop', name: 'jerrycan', at: [-15.8, 32.2], yaw: 0.3 },
    { kind: 'prop', name: 'ammoCrate', at: [-11.2, 34.2], yaw: 0.05, params: { variant: 1 } },
    { kind: 'prop', name: 'spillBin', at: [-17.0, 32.8], yaw: Math.PI / 2 },
    { kind: 'prop', name: 'extinguisher', at: [-16.8, 29.4], yaw: 0 },
    // the recovery story: the low-loader parked off the trail with its ramps down, chained timber on its deck
    { kind: 'prop', name: 'lowLoader', at: [-31, 24], yaw: Math.PI / 2 },
    { kind: 'prop', name: 'roadWheel', at: [-27.5, 18.4], yaw: 0 },
    { kind: 'prop', name: 'roadWheel', at: [-27.1, 18.8], yaw: 0, y: 0.17 },
    { kind: 'prop', name: 'towBar', at: [-24.8, 20.6], yaw: 0.7 },
    { kind: 'prop', name: 'trackPallet', at: [-25.6, 22.4], yaw: 0.2 },
    // an A-frame gantry at work on a power pack, its stand and the bench beside it
    { kind: 'crane', crane: 'aframe', at: [-17.2, 12.2], yaw: Math.PI / 4, params: { span: 4.2, height: 3.8, load: { kind: 'powerpack' } } },
    { kind: 'bench', name: 'powerPackStand', at: [-18.4, 15.6], yaw: Math.PI / 4 },
    { kind: 'bench', name: 'workbench', at: [-21.8, 15.4], yaw: Math.PI / 4 + 0.15, params: { screen: 'readout.modules.t90' } },
    // perimeter: muralled T-walls on the left, a HESCO line with its mesh banner on the right
    { kind: 'wall', wall: 'twall', points: [[-34, 6], [-26, 14]], params: { mural: 'stencil.crest', muralEvery: 3 } },
    { kind: 'wall', wall: 'twall', points: [[-26, 14.6], [-23.6, 17]], params: { mural: 'stencil.wordmark', muralEvery: 9 } },
    { kind: 'wall', wall: 'hesco', points: [[28, 34], [37, 25]], params: { mural: 'brand.banner.h', muralEvery: 6 } },
    { kind: 'display', display: 'pvc', rect: 'brand.banner.h', at: [32.5, 29.5], yaw: Math.PI / 4, y: 1.37, size: [4.2, 0.66], options: { gap: 0.2 } },
  ],
  atmosphere: {
    drift: 0.025,
    cards: [
      // ankle-height red-dust streamers across the yard's left and right, never across the hero
      atmosphereStreamer(atView(-34, 0, 9), atView(-19, 0, 21), 'reddust'),
      // (r4: the right one ran in front of the HESCO's banner wall: it streams past the wall's end now)
      atmosphereStreamer(atView(39, 0, 21), atView(50, 0, 9), 'reddust', 0.4),
      atmosphereStreamer(atView(-30, 0, -14), atView(-14, 0, -26), 'reddust', 0.7),
      // haze staging the jebels' feet in the out-ring's directions (the canonical frame keeps its sky clear)
      atmosphereBand(atView(-74, 0.5, -10), atView(-66, 0.5, 34), 8, 'reddust'),
      atmosphereBand(atView(62, 0.5, -30), atView(72, 0.5, 18), 8, 'reddust', 0.5),
      atmosphereBand(atView(-40, 0.5, -62), atView(30, 0.5, -70), 7, 'reddust', 0.2),
      // a dust plume far down the recovery trail, off the frame's right
      ...atmospherePlume(atView(66, 0, 56), 13, 3.4, 'smoke', 0.4, 5),
    ],
  },
};
