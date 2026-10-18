import { atmosphereBand, atmospherePlume, atmosphereStreamer } from './garageAtmosphereKit.ts';
import { kitViewPoint as V, kitYawToward as toward } from './garageKitTable.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';

/**
 * Sirocco Deployment's kit (garage r9; the brief: "a forward FOB maintenance terrace at a wadi crossing under a ksar:
 * sun, shade, HESCO and sand"). Coordinates are the opening view's [side, depth]. The canonical frame keeps the hero
 * calm: its halo (the hero's screen box plus 8 %, x 21-72 %, y 21-60 %) takes nothing new, so only the slideshow stands
 * in the band right of it; the cells fill the frame's edges, the orbit and the out-ring views:
 * - the perimeter on the left: a HESCO line with its mesh wordmark banner, the rebuilt guard tower (braced legs, a
 *   sandbag parapet with its firing gap, a camouflage net, a caged ladder) and a short T-wall run with the stencilled
 *   crest;
 * - the LED trailer running the slideshow under the shade sail's back edge, in the canonical frame's right band clear of
 *   the hero's halo (garageSlideshowPlacement.ts), with its generator;
 * - the engine cell at the canonical frame's right edge: an A-frame gantry at work with a power pack hanging plumb over
 *   its stand, the bench and the welding cart;
 * - the fuel point on the level yard right of the camera: the bowser, a hose, the no-smoking post, the spill kit and an
 *   extinguisher;
 * - the water point: the water buffalo trailer and a jerrycan rack;
 * - the tactical operations centre: an ISO container with its doors open (a desk and two monitors inside), a rugged
 *   station under a camouflage net at its door, the map board and the nameboard;
 * - the ammunition point: a closed container revetted with HESCO, crates on pallets;
 * - a light tower, a windsock on its mast past the sail, prints on a board by the water point.
 * Every grounded piece stands on a level pad (garageKitPads).
 * The facility's primitive drums, jerrycans, crates, HESCO cells, guard tower and water trailer they replace are gone
 * (garageFacilityDetails.ts addShadeDepot).
 */

export const SIROCCO_KIT_PLACEMENT: GarageKitPlacement = {
  items: [
    // -- the perimeter on the left and the LED trailer's power
    { kind: 'wall', wall: 'hesco', points: [[-29.2, 18.8], [-19.4, 17.8]], params: { mural: 'brand.banner.h', muralEvery: 7 } },
    { kind: 'display', display: 'pvc', rect: 'brand.wordmark.light', at: [-25.0, 17.8], yaw: toward([-25.0, 17.8]), y: 1.42, size: [3.4, 0.64], options: { gap: 0.2 } },
    { kind: 'prop', name: 'guardTower', at: [-16.4, 17.9], yaw: toward([-16.4, 17.9]) },
    { kind: 'wall', wall: 'twall', points: [[-31.4, 15.0], [-27.0, 14.6]], params: { mural: 'stencil.crest', muralEvery: 2 } },
    { kind: 'prop', name: 'sandbag', at: [-18.6, 16.2], yaw: 0.2, params: { variant: 1 } },
    { kind: 'prop', name: 'sandbag', at: [-18.1, 16.0], yaw: -0.3, params: { variant: 2 } },
    { kind: 'prop', name: 'sandbag', at: [-18.3, 16.1], yaw: 0.1, y: 0.15 },
    // -- the LED trailer under the sail's back edge (garageSlideshowPlacement.ts), its generator and cable reel
    { kind: 'prop', name: 'generator', at: [16.6, 21.6], yaw: toward([16.6, 21.6]) + 1.2 },
    { kind: 'prop', name: 'cableReel', at: [11.4, 20.6], yaw: 0.5 },
    // -- the engine cell at the canonical frame's right edge: an A-frame at work on a power pack
    { kind: 'crane', crane: 'aframe', at: [15.2, 8.6], yaw: toward([15.2, 8.6]), params: { span: 4.2, height: 3.8, load: { kind: 'powerpack' } } },
    { kind: 'bench', name: 'powerPackStand', at: [17.8, 11.0], yaw: toward([17.8, 11.0]) },
    { kind: 'bench', name: 'workbench', at: [18.2, 7.0], yaw: toward([18.2, 7.0]) - 0.6, params: { screen: 'readout.modules.t90', bare: true } },
    { kind: 'bench', name: 'weldingCart', at: [12.6, 10.6], yaw: toward([12.6, 10.6]) + 0.6 },
    { kind: 'prop', name: 'drum200', at: [19.6, 9.6], yaw: 0.4 },
    { kind: 'prop', name: 'drum200', at: [20.1, 9.9], yaw: 1.1 },
    // -- the fuel point on the level yard right of the camera: the bowser, its hose, the no-smoking post, the spill kit,
    // an extinguisher and drums
    { kind: 'prop', name: 'bowser', at: [12.4, -3.6], yaw: toward([12.4, -3.6], [0, 0]) + 1.3 },
    { kind: 'prop', name: 'coiledHose', at: [10.2, -2.2], yaw: 0 },
    { kind: 'sign', sign: 'post', rect: 'picto.nosmoking', at: [9.2, -4.8], yaw: toward([9.2, -4.8], [0, 0]), size: [0.6, 0.6] },
    { kind: 'prop', name: 'extinguisher', at: [8.8, -3.4], yaw: 0 },
    { kind: 'prop', name: 'spillBin', at: [14.4, -5.8], yaw: toward([14.4, -5.8], [0, 0]) },
    { kind: 'prop', name: 'drum200', at: [13.8, -1.2], yaw: 0.2 },
    { kind: 'prop', name: 'drum200', at: [14.4, -0.9], yaw: 1.4 },
    // -- the water point
    { kind: 'prop', name: 'waterBuffalo', at: [-21.4, 9.2], yaw: toward([-21.4, 9.2], [0, 0]) + 0.5 },
    { kind: 'prop', name: 'jerrycanRack', at: [-24.6, 11.4], yaw: toward([-24.6, 11.4], [0, 0]) },
    { kind: 'prop', name: 'lightTower', at: [-17.2, 7.6], yaw: toward([-17.2, 7.6], [0, 0]) },
    // -- the tactical operations centre
    { kind: 'prop', name: 'isoContainer', at: [-35.4, 3.6], yaw: toward([-35.4, 3.6], [0, 0]), params: { variant: 1 } },
    { kind: 'prop', name: 'camoNetFrame', at: [-31.6, 3.2], yaw: toward([-31.6, 3.2], [0, 0]), blot: false },
    { kind: 'display', display: 'station', at: [-30.8, 1.8], yaw: toward([-30.8, 1.8], [0, 0]), screens: ['readout.armor.abrams', 'map.desert', 'readout.modules.t90'], width: 2.0, rugged: true },
    { kind: 'display', display: 'board', rects: ['map.desert', 'media.desert', 'media.alpine'], at: [-28.4, 6.4], yaw: toward([-28.4, 6.4], [0, 0]), size: [2.6, 1.1], posts: 0.9 },
    { kind: 'display', display: 'nameboard', at: [-25.4, 7.6], yaw: toward([-25.4, 7.6]), width: 2.6, posts: 1.2 },
    // -- the ammunition point: a container revetted with HESCO, crates on pallets at its door
    { kind: 'prop', name: 'isoContainer', at: [-33.0, -7.0], yaw: toward([-33.0, -7.0], [0, 0]) },
    { kind: 'wall', wall: 'hesco', points: [[-36.0, -9.8], [-36.9, -5.7]] },
    { kind: 'prop', name: 'sandbag', at: [-31.4, -4.6], yaw: 0.2 },
    { kind: 'prop', name: 'sandbag', at: [-31.0, -4.5], yaw: 0.25, params: { variant: 1 } },
    { kind: 'prop', name: 'sandbag', at: [-31.2, -4.55], yaw: 0.22, y: 0.15, params: { variant: 2 } },
    { kind: 'prop', name: 'pallet', at: [-28.4, -5.6], yaw: 0.2 },
    { kind: 'prop', name: 'ammoCrate', at: [-28.4, -5.6], yaw: 0.2, y: 0.14, params: { variant: 1 } },
    { kind: 'prop', name: 'ammoCrate', at: [-28.4, -5.6], yaw: 0.2, y: 0.5, params: { variant: 1 } },
    { kind: 'prop', name: 'ammoBoxSteel', at: [-28.0, -7.4], yaw: 0.25 },
    { kind: 'prop', name: 'ammoBoxSteel', at: [-27.6, -7.2], yaw: 0.3 },
    // -- the right perimeter: muralled T-walls, the windsock, prints under the sail
    { kind: 'prop', name: 'windsock', at: [20.4, 26.4], yaw: 0.6, blot: false },
    { kind: 'display', display: 'board', rects: ['media.desert', 'media.urban', 'media.winter'], at: [-20.2, 13.6], yaw: toward([-20.2, 13.6], [0, 0]), size: [2.8, 1.1], posts: 0.9 },
  ],
  atmosphere: {
    drift: 0.03,
    cards: [
      // ankle-height sand streamers across the yard's flanks, outside the canonical frame (the hero's sector stays clear)
      atmosphereStreamer(V(-27, 0.03, 4), V(-19, 0.03, 0), 'dust'),
      atmosphereStreamer(V(-30, 0.03, -6), V(-22, 0.03, -10), 'dust', 0.35),
      atmosphereStreamer(V(19, 0.03, 0), V(27, 0.03, 4), 'dust', 0.6),
      atmosphereStreamer(V(-6, 0.03, -25), V(6, 0.03, -27), 'dust', 0.2),
      // dust haze in the wadi under the Gara (behind the canonical camera) and along the bed toward the ksar
      atmosphereBand(V(-24, 0.4, -49), V(-47, 0.4, -27), 7, 'dust', 0.1),
      atmosphereBand(V(0, 0.4, -58), V(-29, 0.4, -50), 5, 'dust', 0.45),
      // smoke from the ksar's bread ovens
      ...atmospherePlume(V(-18.7, 7.5, -61), 9, 2.4, 'smoke', 0.4, 5),
    ],
  },
};
