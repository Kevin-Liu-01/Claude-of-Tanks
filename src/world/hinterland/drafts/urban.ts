// src/world/hinterland/drafts/urban.ts — Steinburg's hinterland (the horizons stream, 2026-10-16; C-map-briefs §17), a
// lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this strictly
// better. Drafted from `node tools/hinterland-draft.mjs --map=urban` (the ring's eleven 18-100 m escarpment bumps at
// 1.2-1.4 km) and authored to the real place.
//
// A walled Franconian hill town in the Frankenwald, 1984 (Kronach): the old town on a ridge spur between two valleys,
// the castle on the rock where the spur ends, brickworks and the goods station down in the valleys, the bypass through
// the gap. Standing there (the brief): north and south, down into the valleys — rail, the brickworks' chimney — then the
// Frankenwald, a level forested plateau 250-350 m above at 2-8 km, cut by steep side valleys, with slate-hung villages
// and their spires in the valleys; east the castle rock and the bypass, the Rodach's valley beyond; west the spur
// running on with its orchards. The owner on the ring: "really good … empty areas" — the land past the edge is filled
// with the valleys' villages and the plateau over them, never a flat dark wall (the refused far rise, wave 288).
//   - the plateau's brows: the valley sides north, south and east rise to the Frankenwald 2.8-3.6 km out, some 250 m
//     over the valley floor, wide escarpments under spruce with the level plateau behind, rising on in rolling forest
//     (the far upland on it) toward the Rennsteig;
//   - the side valleys: steep V-shaped notches down through the brows where the Haßlach, the Kronach and the Rodach's
//     side streams come in, so the plateau's line breaks into spurs and the villages lie in them;
//   - the two valleys running on west and east past the edges along their roads, the spur between them running on west
//     with its orchards and climbing to the plateau at 4.5 km;
//   - the marks: slate-spired villages in the valleys at 1.3-2.6 km on the main sightlines, a brickworks' chimney up
//     the north valley, a relay mast on the plateau.
import type { HinterlandConfig } from '../spec.ts';

/** The Frankenwald's Culm slate and greywacke: grey, thick-bedded, no stair of ledges. */
const CULM = { rock: 'schist' as const, rockHex: 0x5f605a, strata: { bedM: 30, dipDeg: 20, contrast: 0.05 } };
/** A brow of the plateau facing the town from bearing `azDeg` (the plateau behind it). */
const brow = (azDeg: number, distM: number, heightM: number, lengthM: number, name?: string) => ({
  kind: 'escarpment' as const, at: { azDeg, distM }, heightM, lengthM, widthM: 3200, strikeDeg: azDeg - 90,
  geology: CULM, cover: { forest: [0, 500] as const }, ...(name ? { name } : {}),
});
/** A side valley down through a brow on its bearing: a notch, so the plateau opens down to the valley floor (a valley
 * cut there would sink the floor in front of the brow too). */
const notch = (azDeg: number, widthM: number, name?: string) => ({
  kind: 'notch' as const, at: { azDeg, distM: 3800 }, heightM: 100, lengthM: 3400, widthM, strikeDeg: azDeg, ...(name ? { name } : {}),
});

const DRAFT: HinterlandConfig = {
  place: 'A walled Franconian hill town in the Frankenwald, 1984 (Kronach): the old town on a ridge spur between two valleys, '
    + 'the castle on its rock, brickworks and a goods station in the valleys, the bypass through the gap; the forested '
    + 'plateau over the valleys, cut by steep side valleys with slate-hung villages',
  region: 'centralUplands',
  lab: true,
  outland: {
    woods: 0.42, hedges: 0.5, fields: 0.45,
    // (the plateau's surface is level: the region's swells eased so its brows keep one line)
    relief: { riseM: [12, 34], wavelengthM: 900 },
    settle: {
      villages: 6, hamlets: 4, farms: 12, works: 1,
      // the valley villages on the main sightlines, each with its slate-spired tower
      villagesAt: [
        { azDeg: 352, distM: 1500, name: 'Ziegelerden', towerM: 36 },
        { azDeg: 28, distM: 2300, name: 'Höfles', towerM: 34 },
        { azDeg: 186, distM: 1450, name: 'Knellendorf', towerM: 34 },
        { azDeg: 150, distM: 2400, name: 'Neuses', towerM: 36 },
        { azDeg: 96, distM: 1600, name: 'Seelach', towerM: 34 },
        { azDeg: 268, distM: 1900, name: 'Friesen', towerM: 36 },
      ],
    },
  },
  landforms: [
    // the plateau's brows over the valleys
    brow(0, 3000, 222, 5600, 'the Frankenwald north of the town'),
    brow(55, 3500, 205, 4000),
    brow(92, 2900, 200, 4400, 'the plateau across the Rodach'),
    brow(138, 3400, 195, 4000),
    brow(182, 2900, 205, 5600, 'the plateau south of the town'),
    brow(228, 3700, 185, 4000),
    brow(318, 3600, 200, 4000),
    // west: the spur running on between the valleys, its orchards, then climbing to the plateau
    { kind: 'ridge', at: { azDeg: 272, distM: 1500 }, heightM: 26, lengthM: 2200, widthM: 650, strikeDeg: 272, name: 'the spur running on',
      cover: { forest: [60, 400] } },
    brow(272, 4600, 210, 4400, 'the plateau the spur climbs to'),
    // the side valleys down through the brows every kilometre or so (the Haßlach north-west, the Kronach north-east, the
    // Rodach's side streams): the plateau's line breaks into spurs between them, the villages lie in them
    notch(338, 820, 'the Haßlach valley'),
    notch(358, 560),
    notch(18, 620),
    notch(40, 600),
    notch(66, 780, 'the Kronach valley'),
    notch(86, 560),
    notch(108, 640),
    notch(128, 600),
    notch(152, 640),
    notch(170, 560),
    notch(194, 700),
    notch(214, 600),
    notch(298, 640),
    notch(318, 560),
  ],
  far: [
    { azDeg: [0, 360], distKm: [5, 20], reliefM: 260, form: 'upland', layers: 2, name: 'the Frankenwald\'s forested plateau' },
    { azDeg: [300, 90], distKm: [12, 28], reliefM: 360, form: 'forested', layers: 1, name: 'the plateau rising toward the Rennsteig' },
  ],
  landmarks: [
    { kind: 'chimney', at: { azDeg: 340, distM: 1700 }, heightM: 46, name: 'the Ziegelerden brickworks' },
    { kind: 'mast', at: { azDeg: 12, distM: 4400 }, heightM: 70, name: 'the relay mast on the plateau' },
  ],
};

export default DRAFT;
