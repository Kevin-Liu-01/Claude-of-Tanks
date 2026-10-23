// src/world/hinterland/drafts/foundry.ts — Ironworks' hinterland (the horizons stream, 2026-10-16; C-map-briefs §21), a
// lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this strictly
// better. Drafted from `node tools/hinterland-draft.mjs --map=foundry` (the ring's nine 12-77 m bumps at 1.2-1.4 km) and
// authored to the real place.
//
// The Völklingen ironworks on the Saar, March 1945: the furnace line and its stacks, the ore yard, the rail fan, the
// rolling mill, slag tipped into banks and cones at the works' edge. Standing there (the brief): north and south the
// valley sides rise 150-200 m, wooded — the Saarkohlenwald north, the Warndt south-west — with the workers' colonies
// climbing them under slate; along the valley colliery headframes at 2-5 km, barges on the Saar, Saarbrücken's towers
// about 10 km east. March: the trees bare, the land grey-brown.
//   - the valley sides: wide escarpments of the Saar coal measures under bare oak and beech, the north side 2.2-2.5 km
//     out and the Warndt's beyond the river 2.6-2.9 km, some 150 m over the floor, the plateau behind; side valleys
//     notched into them (the Köllertal north, the Rossel's south-west);
//   - the valley floor running on east and west between them toward Saarbrücken and Saarlouis;
//   - the collieries: their colonies on the floor and the slopes, each with its headframe; Viktoria's headframe on the
//     north brow beside the Köllertal, whole over the skyline from edge-n and the spawn; the tips beside them — flat-topped tables and cones of dark spoil;
//   - the stacks: the Fenne power station a little up the valley, the Burbach works and Saarbrücken's church towers far
//     east, the Bous works west; the far country wooded hills (the upland, 160 m).
// Not drawn: the Saar itself and its barges — a river past the south edge would cut a slot through the outland's knolls
// there (its water levels run down monotone and carve to them) unless its floodplain were graded level first.
import type { HinterlandConfig } from '../spec.ts';

/** The Saar coal measures: grey-brown sandstone and shale in thick beds (no stair of ledges under the woods). */
const MEASURES = { rock: 'shale' as const, rockHex: 0x6c665c, strata: { bedM: 30, dipDeg: 8, contrast: 0.06 } };
/** Colliery spoil: dark, bare. */
const SPOIL = { rock: 'shale' as const, rockHex: 0x34312e, rockSlopeDeg: 18, strata: { bedM: 0, contrast: 0 } };
/** A valley side facing the works from bearing `azDeg` (its plateau behind it). */
const side = (azDeg: number, distM: number, heightM: number, lengthM: number, name?: string) => ({
  kind: 'escarpment' as const, at: { azDeg, distM }, heightM, lengthM, widthM: 2800, strikeDeg: azDeg - 90,
  geology: MEASURES, cover: { forest: [0, 400] as const }, ...(name ? { name } : {}),
});
/** A side valley notched into a valley side on its bearing. */
const notch = (azDeg: number, widthM: number, name?: string) => ({
  kind: 'notch' as const, at: { azDeg, distM: 3200 }, heightM: 100, lengthM: 3000, widthM, strikeDeg: azDeg, ...(name ? { name } : {}),
});

const DRAFT: HinterlandConfig = {
  place: 'The Völklingen ironworks on the Saar, March 1945: the furnace line and its stacks, the ore yard, the rail fan and '
    + 'the rolling mill, slag tipped into banks and cones; the wooded valley sides of the Saarkohlenwald and the Warndt '
    + 'with the workers\' colonies climbing them, collieries with their headframes and tips along the valley',
  region: 'coalfield',
  lab: true,
  season: 'winter',
  outland: {
    woods: 0.3, hedges: 0.3, fields: 0.4,
    relief: { riseM: [10, 30], wavelengthM: 900 },
    settle: {
      villages: 6, hamlets: 3, farms: 4, works: 2,
      // the colliery colonies on the sightlines, each round its pit's headframe
      villagesAt: [
        { azDeg: 346, distM: 1500, name: 'Heidstock', towerM: 46 },
        { azDeg: 80, distM: 2700, name: 'Luisenthal', towerM: 52 },
        { azDeg: 188, distM: 1700, name: 'Wehrden', towerM: 40 },
        { azDeg: 226, distM: 2400, name: 'Geislautern', towerM: 44 },
        { azDeg: 150, distM: 2300, name: 'Fürstenhausen', towerM: 42 },
        { azDeg: 290, distM: 2600, name: 'Wadgassen', towerM: 44 },
      ],
    },
  },
  landforms: [
    // the north side (the Saarkohlenwald)
    side(0, 2200, 160, 3600, 'the Saarkohlenwald'),
    side(330, 2500, 150, 3000),
    side(32, 2500, 150, 3000),
    notch(14, 700, 'the Köllertal'), notch(344, 560),
    // the south side beyond the Saar (the Warndt south-west)
    side(180, 2700, 140, 3600),
    side(212, 2900, 150, 3000, 'the Warndt'),
    side(150, 2900, 135, 3000),
    notch(198, 640, 'the Rossel valley'), notch(166, 540),
    // the tips of the collieries along the valley: flat-topped tables and cones of dark spoil
    { kind: 'butte', at: { azDeg: 72, distM: 2900 }, heightM: 62, lengthM: 700, widthM: 520, name: 'the Luisenthal tip', geology: SPOIL, cover: { bare: true } },
    { kind: 'cone', at: { azDeg: 124, distM: 3900 }, heightM: 72, lengthM: 640, name: 'the Velsen tip', geology: SPOIL, cover: { bare: true } },
    { kind: 'butte', at: { azDeg: 283, distM: 5600 }, heightM: 90, lengthM: 1100, widthM: 760, name: 'the Duhamel tip', geology: SPOIL, cover: { bare: true } },
    { kind: 'cone', at: { azDeg: 18, distM: 2900 }, heightM: 58, lengthM: 560, name: 'the Viktoria tip', geology: SPOIL, cover: { bare: true } },
  ],
  far: [
    // the wooded hills over both valley sides; up and down the valley the far country stands farther off, so the valley
    // runs on toward Saarbrücken and Saarlouis
    { azDeg: [300, 60], distKm: [5, 18], reliefM: 160, form: 'upland', layers: 1, name: 'the Saarkohlenwald\'s hills' },
    { azDeg: [120, 240], distKm: [5, 18], reliefM: 160, form: 'upland', layers: 1, name: 'the Warndt and the Lorraine hills' },
    { azDeg: [60, 120], distKm: [9, 20], reliefM: 140, form: 'upland', layers: 1, name: 'the hills round Saarbrücken' },
    { azDeg: [240, 300], distKm: [9, 20], reliefM: 130, form: 'upland', layers: 1 },
  ],
  landmarks: [
    { kind: 'headframe', at: { azDeg: 5, distM: 2330 }, heightM: 54, name: 'Grube Viktoria' },
    { kind: 'headframe', at: { azDeg: 122, distM: 4200 }, heightM: 48, name: 'Grube Velsen' },
    { kind: 'headframe', at: { azDeg: 281, distM: 6000 }, heightM: 52, name: 'Grube Duhamel' },
    { kind: 'chimney', at: { azDeg: 94, distM: 2000 }, heightM: 100, name: 'the Fenne power station' },
    { kind: 'chimney', at: { azDeg: 96, distM: 2060 }, heightM: 95 },
    { kind: 'chimney', at: { azDeg: 91, distM: 7400 }, heightM: 90, name: 'the Burbach works' },
    { kind: 'chimney', at: { azDeg: 93, distM: 7500 }, heightM: 85 },
    { kind: 'chimney', at: { azDeg: 276, distM: 5000 }, heightM: 80, name: 'the Bous works' },
    { kind: 'churchTower', at: { azDeg: 96, distM: 10400 }, heightM: 60, name: 'the Ludwigskirche, Saarbrücken' },
    { kind: 'churchTower', at: { azDeg: 92, distM: 10900 }, heightM: 56, name: 'St. Johann, Saarbrücken' },
    { kind: 'churchTower', at: { azDeg: 340, distM: 1650 }, heightM: 38, name: 'the colony church' },
    { kind: 'pylonLine', from: 'edge', azDeg: 96, name: 'the 110 kV line from Fenne' },
  ],
};

export default DRAFT;
