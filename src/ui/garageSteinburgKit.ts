import { atmosphereBand, atmospherePlume } from './garageAtmosphereKit.ts';
import { kitYawToward as toward } from './garageKitTable.ts';
import type { GarageKitPlacement } from './garageKitPlacement.ts';
import type { KitVec } from './garageKitGeometry.ts';

/**
 * Steinburg Deployment's kit (garage r9; the brief: "a red-sandstone and brick Zeughaus in an old German hill town").
 * Coordinates are the opening view's [side, depth]; the Zeughaus's facade stands at depth 33.7 across the boulevard,
 * its centre pavilion's gable over the hero. The canonical frame's halo (x 21-72 %, y 21-60 %) takes nothing new but
 * the arsenal's coat of arms on that gable, above the halo; the cells:
 * - on the Zeughaus: the coat of arms (a metal crest plate) set in the pavilion gable's stone ring over the gate, and a
 *   timber hoist beam (Kranbalken) with its pulley, rope and hook from the right dormer over the loading dock;
 * - the street on the left: a Litfasssaeule wrapped in game posters, cast-iron lamp posts, a red pillar hydrant, a park
 *   bench, bollards, a vertical crest-and-wordmark banner on its mast, the municipal notice board with three stills, a
 *   wheat-pasted poster hoarding and the cast-iron nameboard;
 * - the crane bay in front of the factory: an overhead crane on its own columns at work, a turret hanging in slings
 *   over its turret stand, the welding cart and a roll cab, the gas cage and drums;
 * - the right: the slideshow on its freestanding LED panel before the corner shop (garageSlideshowPlacement.ts), a lamp
 *   post, roll cages and pallets of crates, and the dispatch office (a container office, its doors open on a desk
 *   with the Steinburg map) with its station.
 * The facility's primitive station piles they replace are gone (GARAGE_KIT_CELL_ARCHITECTURES).
 */

const DEG = Math.PI / 180;
/** The Zeughaus faces straight down the boulevard: a piece on its facade turns its front to the view's -depth. */
const FACADE = Math.PI / 4;
/** A world point at a bearing and radius from the turntable (the horizon's town, behind the canonical camera). */
const B = (bearingDeg: number, radius: number, y: number): KitVec => [Math.cos(bearingDeg * DEG) * radius, y, Math.sin(bearingDeg * DEG) * radius];

export const STEINBURG_KIT_PLACEMENT: GarageKitPlacement = {
  items: [
    // -- the Zeughaus: its coat of arms in the pavilion gable's stone ring, a hoist beam over the dock from the dormer
    { kind: 'display', display: 'plate', rect: 'brand.crest.metal', at: [0.2, 32.95], yaw: FACADE, y: 9.72, size: [1.2, 1.2] },
    { kind: 'crane', crane: 'gable', at: [9.8, 34.6], yaw: FACADE, y: 11.7, params: { reach: 1.7, hookY: -1.3 } },
    // -- the street on the left of the forecourt
    { kind: 'prop', name: 'litfass', at: [-17.6, 16.0], yaw: toward([-17.6, 16.0]) },
    { kind: 'prop', name: 'lampPost', at: [-19.6, 21.6], yaw: 0 },
    { kind: 'prop', name: 'lampPost', at: [-14.6, 9.4], yaw: 0 },
    { kind: 'prop', name: 'hydrant', at: [-15.8, 12.6], yaw: 0.4 },
    { kind: 'prop', name: 'parkBench', at: [-20.6, 18.4], yaw: toward([-20.6, 18.4], [0, 10]) },
    { kind: 'prop', name: 'bollard', at: [-17.8, 20.2], yaw: 0, params: { color: 0x2a2e2c } },
    { kind: 'prop', name: 'bollard', at: [-18.2, 22.6], yaw: 0, params: { color: 0x2a2e2c } },
    { kind: 'prop', name: 'bollard', at: [-18.6, 25.0], yaw: 0, params: { color: 0x2a2e2c } },
    // (the mast's arm runs to the view's right, yaw PI/4; the banner hangs from it in the arm's plane)
    { kind: 'prop', name: 'bannerMast', at: [-20.2, 25.4], yaw: Math.PI / 4 },
    { kind: 'display', display: 'banner', rect: 'brand.banner.v', at: [-19.68, 25.4], yaw: Math.PI / 4, y: 6.55, size: [0.85, 3.4] },
    { kind: 'display', display: 'board', rects: ['media.urban', 'media.verdant', 'media.railyard'], at: [-22.8, 19.8], yaw: toward([-22.8, 19.8]), size: [2.6, 1.1], posts: 0.9 },
    { kind: 'prop', name: 'posterHoarding', at: [-26.2, 15.0], yaw: toward([-26.2, 15.0]) },
    { kind: 'display', display: 'nameboard', at: [-21.8, 13.2], yaw: toward([-21.8, 13.2]), width: 2.6, posts: 1.2 },
    // -- the crane bay in front of the factory: an overhead crane on its own columns, a turret coming down onto its stand
    { kind: 'crane', crane: 'overhead', at: [-24.2, 6.4], yaw: toward([-24.2, 6.4], [0, 0]),
      params: { span: 8, runway: 9, railY: 6.2, bay: 4.5, hookY: 3.8, swl: 20, number: 2, load: { kind: 'turret' } } },
    { kind: 'bench', name: 'turretStand', at: [-24.2, 6.4], yaw: 0 },
    { kind: 'bench', name: 'weldingCart', at: [-20.4, 4.0], yaw: toward([-20.4, 4.0], [0, 0]) + 0.5 },
    { kind: 'bench', name: 'rollCab', at: [-27.4, 3.0], yaw: toward([-27.4, 3.0], [0, 0]) },
    { kind: 'prop', name: 'gasCage', at: [-29.2, 10.6], yaw: toward([-29.2, 10.6], [0, 0]) },
    { kind: 'prop', name: 'drum200', at: [-27.8, 12.0], yaw: 0.3 },
    { kind: 'prop', name: 'drum200', at: [-27.3, 12.3], yaw: 1.2 },
    { kind: 'prop', name: 'skip', at: [-30.4, 1.4], yaw: toward([-30.4, 1.4], [0, 0]) + Math.PI / 2 },
    { kind: 'prop', name: 'pallet', at: [-21.0, 10.8], yaw: 0.2 },
    { kind: 'prop', name: 'ammoCrate', at: [-21.0, 10.8], yaw: 0.2, y: 0.14 },
    { kind: 'prop', name: 'ammoCrate', at: [-21.1, 10.9], yaw: 0.25, y: 0.5 },
    { kind: 'prop', name: 'ammoCrate', at: [-20.6, 11.4], yaw: 0.15, y: 0.14 },
    { kind: 'prop', name: 'chocks', at: [-22.4, 8.6], yaw: 0.6 },
    { kind: 'prop', name: 'roadWheel', at: [-26.8, 9.4], yaw: 0 },
    { kind: 'prop', name: 'roadWheel', at: [-26.7, 9.5], yaw: 0, y: 0.17 },
    { kind: 'prop', name: 'roadWheel', at: [-26.0, 10.0], yaw: 0 },
    { kind: 'prop', name: 'gasCylinder', at: [-19.8, 5.6], yaw: 0, params: { color: 0x3a5a4a } },
    { kind: 'prop', name: 'cone', at: [-19.4, 8.2], yaw: 0 },
    // -- the right: a lamp post, roll cages and crates by the corner shop, the dispatch office
    { kind: 'prop', name: 'lampPost', at: [18.8, 21.8], yaw: 0 },
    { kind: 'prop', name: 'rollCage', at: [23.6, 18.4], yaw: toward([23.6, 18.4], [0, 0]) },
    { kind: 'prop', name: 'rollCage', at: [24.6, 18.0], yaw: toward([24.6, 18.0], [0, 0]) + 0.15 },
    { kind: 'prop', name: 'pallet', at: [21.2, 19.6], yaw: 0.3 },
    { kind: 'prop', name: 'ammoCrate', at: [21.2, 19.6], yaw: 0.3, y: 0.14, params: { variant: 1 } },
    { kind: 'prop', name: 'ammoCrate', at: [21.2, 19.6], yaw: 0.3, y: 0.5, params: { variant: 1 } },
    { kind: 'prop', name: 'pallet', at: [22.4, 21.0], yaw: -0.2 },
    { kind: 'prop', name: 'ammoCrate', at: [22.4, 21.0], yaw: -0.2, y: 0.14 },
    { kind: 'prop', name: 'ammoCrate', at: [22.5, 21.05], yaw: -0.15, y: 0.5 },
    { kind: 'prop', name: 'drum200', at: [25.6, 20.2], yaw: 0.6 },
    { kind: 'prop', name: 'drum200', at: [26.1, 20.5], yaw: 1.7 },
    { kind: 'prop', name: 'drum200', at: [25.8, 20.9], yaw: 2.9 },
    { kind: 'prop', name: 'isoContainer', at: [27.6, 5.6], yaw: toward([27.6, 5.6], [0, 0]), params: { variant: 2, color: 0x5d6457 } },
    { kind: 'display', display: 'station', at: [23.4, 4.2], yaw: toward([23.4, 4.2], [0, 0]), screens: ['readout.armor.leopard', 'map.urban', 'readout.modules.abrams'], width: 2.0 },
    { kind: 'prop', name: 'extinguisher', at: [24.4, 6.6], yaw: 0 },
  ],
  atmosphere: {
    drift: 0.018,
    cards: [
      // smoke from three of the old town's chimneys and the brickworks stack, a light haze over the town (all behind the
      // canonical camera: the town fills the map's north, the Garage's bearings 60-125 deg)
      ...atmospherePlume(B(54, 62, 23.4), 10, 2.0, 'smoke', 0.35, 5),
      ...atmospherePlume(B(88, 66, 12.2), 6, 1.2, 'smoke', 0.35, 4),
      ...atmospherePlume(B(104, 65, 11.6), 6, 1.2, 'smoke', 0.35, 4),
      ...atmospherePlume(B(116, 70, 12.4), 5, 1.1, 'smoke', 0.35, 4),
      atmosphereBand(B(70, 54, 0.2), B(98, 54, 0.2), 6, 'mist', 0.2),
      atmosphereBand(B(98, 54, 0.2), B(126, 54, 0.2), 6, 'mist', 0.6),
    ],
  },
};
