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
 * - the street cell on the yard floor by its right bank: a Litfasssaeule wrapped in game posters, cast-iron lamp posts,
 *   a red pillar hydrant, a park bench, bollards, a vertical crest-and-wordmark banner on its mast, the municipal notice
 *   board with three stills and the cast-iron nameboard;
 * - the lift cell at the yard's left: a pillar jib crane at work, a turret hanging in slings over its turret stand, a
 *   wheat-pasted poster hoarding behind it, the welding cart, the gas cage, drums, crates and wheels (all clear of the
 *   line from the turntable to the T-90M bay);
 * - the right: the slideshow on its freestanding LED panel on the yard floor by the right bank
 *   (garageSlideshowPlacement.ts), a lamp post, roll cages and pallets of crates by the corner shop;
 * - the dispatch office on the yard's west terrace: a container office, its doors open on a desk with the Steinburg
 *   map, with its station.
 * Every grounded piece stands on a level pad (garageKitPads); the yard's banks keep their grass.
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
    // -- the street cell by the yard's right bank, on the empty yard floor beside the hero (the forecourt's street is
    // the canonical frame's halo): the Litfasssaeule, lamp posts, the hydrant, a bench, bollards, the banner mast, the
    // municipal notice board and the cast-iron nameboard
    { kind: 'prop', name: 'litfass', at: [11.2, 3.6], yaw: toward([11.2, 3.6]) },
    { kind: 'prop', name: 'lampPost', at: [12.6, 7.4], yaw: 0 },
    { kind: 'prop', name: 'lampPost', at: [9.8, -0.8], yaw: 0 },
    { kind: 'prop', name: 'hydrant', at: [13.0, 1.6], yaw: 0.4 },
    { kind: 'prop', name: 'parkBench', at: [8.6, 7.6], yaw: toward([8.6, 7.6], [0, 0]) },
    { kind: 'prop', name: 'bollard', at: [7.0, 4.4], yaw: 0, params: { color: 0x2a2e2c } },
    { kind: 'prop', name: 'bollard', at: [7.2, 2.6], yaw: 0, params: { color: 0x2a2e2c } },
    { kind: 'prop', name: 'bollard', at: [7.4, 0.8], yaw: 0, params: { color: 0x2a2e2c } },
    // (the mast's arm runs to the view's right, yaw PI/4; the banner hangs from it in the arm's plane)
    { kind: 'prop', name: 'bannerMast', at: [11.0, 8.8], yaw: Math.PI / 4 },
    { kind: 'display', display: 'banner', rect: 'brand.banner.v', at: [11.52, 8.8], yaw: Math.PI / 4, y: 6.55, size: [0.85, 3.4] },
    { kind: 'display', display: 'board', rects: ['media.urban', 'media.verdant', 'media.railyard'], at: [12.8, -1.4], yaw: toward([12.8, -1.4], [0, 0]), size: [2.6, 1.1], posts: 0.9 },
    { kind: 'display', display: 'nameboard', at: [9.4, -4.6], yaw: toward([9.4, -4.6], [0, 0]), width: 2.6, posts: 1.2 },
    // -- the lift cell at the yard's left: a pillar jib crane at work, a turret coming down onto its stand, the welding
    // cart, a roll cab, the gas cage, drums, crates, wheels and the skip
    // (the hook hangs 2.53 m from the pillar over the stand: slew 1.107 rad, the hook at 0.72 of a 3.51 m arm)
    { kind: 'crane', crane: 'jib', at: [-13.8, 4.2], yaw: 0, params: { height: 5.0, reach: 3.51, slew: 1.107, swl: 20, hookY: 3.75, load: { kind: 'turret' } } },
    { kind: 'bench', name: 'turretStand', at: [-11.4, 5.0], yaw: 0 },
    // (the hoarding stands behind the crane, its back to the bank: at the cell's front it hid the T-90M bay from the
    // turntable and the bay's own frame, r2)
    { kind: 'prop', name: 'posterHoarding', at: [-15.4, 8.6], yaw: toward([-15.4, 8.6], [0, 0]) },
    { kind: 'bench', name: 'weldingCart', at: [-11.2, 0.2], yaw: toward([-11.2, 0.2], [0, 0]) + 0.5 },
    { kind: 'prop', name: 'gasCage', at: [-27.4, -2.2], yaw: toward([-27.4, -2.2], [0, 0]) },
    { kind: 'prop', name: 'drum200', at: [-12.6, -8.0], yaw: 0.3 },
    { kind: 'prop', name: 'drum200', at: [-12.0, -8.3], yaw: 1.2 },
    { kind: 'prop', name: 'pallet', at: [-12.6, -3.6], yaw: 0.2 },
    { kind: 'prop', name: 'ammoCrate', at: [-12.6, -3.6], yaw: 0.2, y: 0.14 },
    { kind: 'prop', name: 'ammoCrate', at: [-12.7, -3.5], yaw: 0.25, y: 0.5 },
    { kind: 'prop', name: 'ammoCrate', at: [-12.2, -3.0], yaw: 0.15, y: 0.14 },
    { kind: 'prop', name: 'chocks', at: [-10.4, 2.6], yaw: 0.6 },
    { kind: 'prop', name: 'roadWheel', at: [-11.4, -7.4], yaw: 0 },
    { kind: 'prop', name: 'roadWheel', at: [-11.3, -7.3], yaw: 0, y: 0.17 },
    { kind: 'prop', name: 'roadWheel', at: [-10.6, -6.9], yaw: 0 },
    { kind: 'prop', name: 'gasCylinder', at: [-10.2, 3.6], yaw: 0, params: { color: 0x3a5a4a } },
    { kind: 'prop', name: 'cone', at: [-9.6, 2.2], yaw: 0 },
    // -- the right: a lamp post, roll cages and crates by the corner shop
    { kind: 'prop', name: 'lampPost', at: [14.0, 20.6], yaw: 0 },
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
    // -- the dispatch office on the yard's west terrace: a container office, its doors open on a desk with the Steinburg
    // map, and its station outside
    { kind: 'prop', name: 'isoContainer', at: [-34.0, 3.2], yaw: toward([-34.0, 3.2], [0, 0]), params: { variant: 2, color: 0x5d6457 } },
    { kind: 'display', display: 'station', at: [-30.4, 2.6], yaw: toward([-30.4, 2.6], [0, 0]), screens: ['readout.armor.leopard', 'map.urban', 'readout.modules.abrams'], width: 2.0 },
    { kind: 'prop', name: 'extinguisher', at: [-31.2, 4.8], yaw: 0 },
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
