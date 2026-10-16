// src/world/hinterland/drafts/reservoir.ts — Highland Reservoir's hinterland (the horizons stream, 2026-10-16;
// C-map-briefs §31), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics
// find this strictly better. Drafted from `node tools/hinterland-draft.mjs --map=reservoir` (the ring's twelve 12-142 m
// bumps at 1.1-1.5 km) and authored to the real place.
//
// The Rur dams in the Eifel, winter 1944-45: the reservoir lies in a basin cut into a dissected plateau of slate and
// greywacke. Standing by the lake (the brief): every direction shows long level skylines at nearly one height — the
// plateau's brow over the wooded valley sides — cut by deep V-shaped wooded valleys; dark spruce blocks among bare
// beech; the plateau villages' church towers on the skyline (the Hürtgen battle villages: Vossenack on its ridge,
// Kommerscheidt, Schmidt over the lake, Bergstein on its spur); the Hohes Venn's flat moor rim far to the south-west.
// What the ring did well and this keeps (the brief's Keep): an upland frame at 5-8° round the basin, a broken skyline
// with 20-30 summits from every eye, the battlefield's own outland (its knolls and 39 m rise) and lake, its six farms.
// What is new: behind the basin's knolls the frame is the plateau itself —
//   - the plateau's brow: eight escarpments facing the basin 2.25 km out square to the edges and 2.7 km on the
//     diagonals (past the knolls the old ring stood on, so the brow's line is level, the plateau's own), the valley side
//     under each a wooded slate stair, the plateau behind at one height some 210 m over the lake, a dusting of snow on it;
//   - the valleys: eight V-shaped wooded valleys between the brows, radiating from the basin — the Rur down to the dams
//     north-east and up toward Monschau south-west, the Urft from the south, the Kall from the north-west — each notch
//     a summit pair on the skyline;
//   - the plateau villages on the brow, their church towers standing whole over the skyline: from the spawn east across
//     the lake Schmidt, Vossenack, Kommerscheidt and Bergstein (with the Krawutschke tower on its Burgberg); from the
//     east edge back across the lake Steckenborn and Hürtgen;
//   - beyond: the plateau running on (the far upland at 4-16 km), the Hohes Venn south-west at 14-26 km up the Rur.
import type { HinterlandConfig } from '../spec.ts';

/** The plateau's brow over the basin: past the battlefield's own knolls (the near outland the ring stood on holds to
 * 0.7 km past the edge and eases out by 1.6 km), so its level line is the plateau's own; its height over the land under
 * it; its slate. */
const BROW = 2250, BROW_DIAG = 2700, RISE = 128;
const SLATE = { rock: 'schist' as const, rockHex: 0x5d5c58, strata: { bedM: 14, dipDeg: 24, contrast: 0.06 },
  snow: { lineM: RISE - 14 } };

/** An escarpment facing the basin from bearing `azDeg` (its plateau behind it, away from the centre). */
const brow = (azDeg: number, lengthM: number, heightM = RISE, distM = BROW, name?: string) => ({
  kind: 'escarpment' as const, at: { azDeg, distM }, heightM, lengthM, widthM: 1800, strikeDeg: azDeg - 90,
  geology: SLATE, cover: { forest: [0, 400] as const }, ...(name ? { name } : {}),
});
/** A V-shaped wooded valley out of the basin on its bearing: a notch opening the plateau down to the land under it, and
 * a trough under that sinking its floor toward the lake (a single deep cut sank the floor below the lake past the
 * plateau's back). */
const valley = (azDeg: number, heightM: number, widthM: number, name?: string) => [
  { kind: 'notch' as const, at: { azDeg, distM: 3600 }, heightM: 100, lengthM: 4400, widthM: widthM * 1.25, strikeDeg: azDeg, ...(name ? { name } : {}) },
  { kind: 'valley' as const, at: { azDeg, distM: 3400 }, heightM, lengthM: 4200, widthM, strikeDeg: azDeg },
];

const DRAFT: HinterlandConfig = {
  place: 'The Rur dams in the Eifel (the Urft and Schwammenauel reservoirs), winter 1944-45: an upland lake in a basin cut '
    + 'into the slate plateau, spruce and pine on the valley sides among bare beech, the waterworks and a service village; '
    + 'the Hürtgen battle villages on the plateau, the Hohes Venn far to the south-west',
  region: 'centralUplands',
  lab: true,
  season: 'winter',
  outland: {
    woods: 0.5, hedges: 0.15, fields: 0.2,
    // (the plateau's surface is level: the region's swells eased so its brows keep one height)
    relief: { riseM: [10, 28], wavelengthM: 1000 },
    settle: {
      villages: 6, hamlets: 3, farms: 6, works: 0,
      // the plateau villages on the brow, their towers over the skyline (the brief's marks at 2-5 km)
      villagesAt: [
        { azDeg: 92, distM: 2330, name: 'Schmidt', towerM: 42 },
        { azDeg: 6, distM: 2330, name: 'Vossenack', towerM: 46 },
        { azDeg: 50, distM: 2780, name: 'Kommerscheidt', towerM: 34 },
        { azDeg: 140, distM: 2760, name: 'Bergstein', towerM: 36 },
        { azDeg: 268, distM: 2330, name: 'Steckenborn', towerM: 36 },
        { azDeg: 318, distM: 2780, name: 'Hürtgen', towerM: 40 },
      ],
    },
  },
  landforms: [
    // the plateau's brow round the basin, square to the edges and on the diagonals
    brow(0, 3200, RISE + 6, BROW, 'the Vossenack ridge'),
    brow(45, 3000, RISE, BROW_DIAG),
    brow(92, 3200, RISE + 4, BROW, 'the plateau over the lake at Schmidt'),
    brow(136, 3000, RISE - 4, BROW_DIAG, 'the Kermeter'),
    brow(180, 3200, RISE + 2, BROW),
    brow(225, 3000, RISE - 10, BROW_DIAG + 100),
    brow(270, 3200, RISE, BROW, 'the Steckenborn plateau'),
    brow(315, 3000, RISE - 2, BROW_DIAG),
    // the valleys between the brows, out of the basin
    ...valley(22, 80, 900, 'the Rur down to the dams'),
    ...valley(68, 55, 700),
    ...valley(114, 55, 720),
    ...valley(160, 62, 800, 'the Urft valley'),
    ...valley(204, 60, 880, 'the Rur up toward Monschau'),
    ...valley(248, 52, 700),
    ...valley(294, 60, 760, 'the Kall valley'),
    ...valley(338, 52, 700),
  ],
  far: [
    { azDeg: [0, 360], distKm: [4, 16], reliefM: 180, form: 'upland', layers: 2, name: 'the plateau running on' },
    { azDeg: [205, 248], distKm: [14, 26], reliefM: 360, form: 'upland', layers: 1, name: 'the Hohes Venn' },
  ],
  landmarks: [
    { kind: 'lookoutTower', at: { azDeg: 145, distM: 2760 }, heightM: 24, name: 'the Krawutschke tower on the Burgberg' },
  ],
};

export default DRAFT;
