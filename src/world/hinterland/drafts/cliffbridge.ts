// src/world/hinterland/drafts/cliffbridge.ts — Aegis Crossing's hinterland (the horizons stream, 2026-10-16;
// C-map-briefs §23), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics
// find this strictly better. The draft from today's config gave twelve 56–194 m ridge stubs at 1.2–1.4 km under an
// upland far country (Verdant's horizon spread onto Ronda: "Kursk shelterbelts that read as California foothills").
//
// Ronda in the summer of 1972: the Tajo of the Guadalevín cut through a limestone tableland at ~740 m, the town on its
// two lips. Standing on the rim (the brief):
//   - near: the tableland's olives, cereal and white cortijos running 2–5 km, Arriate's church tower 2.4 km to the
//     north-north-east (~3 km in fact);
//   - west: the tableland ends at its cliffs over the Hoya del Tajo, the valley the Guadalevín falls into on its way to
//     the Guadiaro, and over the drop the grey crags of the Sierra de Líbar (south-west, Montejaque and Benaoján under
//     them) and the Sierra de Grazalema far to the west-north-west;
//   - east and south: a stepped limestone edge in holm oak 3–4 km out, the tableland behind it; over it the Sierra
//     Hidalga to the east and the Oreganal and Jarastepar to the south, and the Sierra de las Nieves ~1,100 m over the
//     tableland 15–20 km to the south-east (3–4°);
//   - north: the open plateau toward Setenil and Olvera, low hills on it.
import type { HinterlandConfig } from '../spec.ts';

// (a dry Andalusian summer: no snow on the sierras)
const NO_SNOW = { lineM: 5000 };

const DRAFT: HinterlandConfig = {
  place: 'Ronda and the Tajo of the Guadalevín, summer 1972: a limestone tableland of olives, cereal and white cortijos, '
    + 'its cliffs falling west to the Hoya del Tajo; the Sierra Hidalga and the Sierra de las Nieves east and south-east, '
    + 'the Oreganal south, the grey crags of the Líbar and Grazalema west with their white villages',
  region: 'andalusianRonda',
  lab: true,
  season: 'summer',
  outland: {
    // (the tableland is open: its swells low, the eye running out over the olives and the cereal to the sierras)
    relief: { riseM: [8, 26], wavelengthM: 1000 },
    woods: 0.2, hedges: 0.25, fields: 0.7, links: 3,
    settle: {
      villages: 6, hamlets: 3, farms: 10, works: 0,
      // the pueblos blancos on the sightlines, each round its church tower: Arriate near, the sierra villages far
      villagesAt: [
        { azDeg: 15, distM: 2400, name: 'Arriate', towerM: 32, buildings: 44 },
        { azDeg: 248, distM: 9500, name: 'Montejaque', towerM: 28 },
        { azDeg: 234, distM: 11500, name: 'Benaoján', towerM: 28 },
        { azDeg: 352, distM: 12500, name: 'Setenil de las Bodegas', towerM: 32 },
        { azDeg: 150, distM: 9000, name: 'Parauta', towerM: 26 },
        { azDeg: 196, distM: 9500, name: 'Cartajima', towerM: 26 },
      ],
    },
  },
  landforms: [
    // the tableland running on level past the edge: the old rim's lift (~30–60 m on the outland's datum, Verdant's
    // swells) let down along each side, so the near band does not stand as a bank in front of the sierras
    { kind: 'valley', at: { azDeg: 0, distM: 1350 }, heightM: 45, lengthM: 4600, widthM: 2200, strikeDeg: 90, name: 'the tableland north, toward Arriate' },
    { kind: 'valley', at: { azDeg: 180, distM: 1150 }, heightM: 32, lengthM: 4200, widthM: 1500, strikeDeg: 90, name: 'the tableland south' },
    { kind: 'valley', at: { azDeg: 90, distM: 1150 }, heightM: 32, lengthM: 4200, widthM: 1500, strikeDeg: 0, name: 'the tableland east' },
    { kind: 'valley', at: { azDeg: 270, distM: 1050 }, heightM: 26, lengthM: 4200, widthM: 1300, strikeDeg: 0, name: 'the tableland west' },
    // west: the tableland's end — its cliffs falling ~150 m into the Hoya del Tajo, the valley running south-west toward
    // the Guadiaro, its far side climbing again toward the Líbar (a stepped trench in the limestone's beds)
    { kind: 'canyon', at: { azDeg: 262, distM: 3700 }, heightM: 150, lengthM: 12000, widthM: 3800, strikeDeg: 25, name: 'the Hoya del Tajo' },
    // the near frame: a stepped limestone edge with its strata and holm oak, the tableland behind it, to the south and
    // to the east-north-east (the Guadalevín's valley comes in between them from the south-east)
    { kind: 'escarpment', at: { azDeg: 184, distM: 3100 }, heightM: 120, lengthM: 5600, widthM: 1800, strikeDeg: 92, name: 'the edge toward the Oreganal',
      geology: { snow: NO_SNOW }, cover: { forest: [10, 140] } },
    { kind: 'escarpment', at: { azDeg: 66, distM: 3600 }, heightM: 140, lengthM: 4600, widthM: 1800, strikeDeg: 336, name: 'the edge toward the Hidalga',
      geology: { snow: NO_SNOW }, cover: { forest: [10, 160] } },
    { kind: 'valley', at: { azDeg: 118, distM: 3200 }, heightM: 28, lengthM: 5000, widthM: 1400, strikeDeg: 122, name: 'the Guadalevín\'s valley' },
    // the sierras over the tableland
    { kind: 'massif', at: { azDeg: 94, distM: 9000 }, heightM: 820, lengthM: 8000, widthM: 4200, strikeDeg: 8, name: 'the Sierra Hidalga',
      geology: { snow: NO_SNOW, erosion: 0.7 }, cover: { forest: [80, 420] } },
    { kind: 'massif', at: { azDeg: 124, distM: 17000 }, heightM: 1250, lengthM: 12000, widthM: 7000, strikeDeg: 34, name: 'the Sierra de las Nieves',
      geology: { snow: NO_SNOW, erosion: 0.7, gullies: 0.6 }, cover: { forest: [150, 950] } },
    { kind: 'massif', at: { azDeg: 52, distM: 13000 }, heightM: 700, lengthM: 7000, widthM: 3600, strikeDeg: 118, name: 'the Sierra Blanquilla',
      geology: { snow: NO_SNOW, erosion: 0.65 }, cover: { forest: [60, 300] } },
    { kind: 'massif', at: { azDeg: 172, distM: 10500 }, heightM: 760, lengthM: 9000, widthM: 4000, strikeDeg: 80, name: 'the Oreganal and Jarastepar',
      geology: { snow: NO_SNOW, erosion: 0.75 }, cover: { forest: [40, 380] } },
    { kind: 'massif', at: { azDeg: 232, distM: 12500 }, heightM: 820, lengthM: 11000, widthM: 4200, strikeDeg: 150, name: 'the Sierra de Líbar',
      geology: { snow: NO_SNOW, erosion: 0.85, gullies: 0.6 }, cover: { forest: [0, 260] } },
    { kind: 'massif', at: { azDeg: 290, distM: 24000 }, heightM: 1050, lengthM: 14000, widthM: 6000, strikeDeg: 20, name: 'the Sierra de Grazalema',
      geology: { snow: NO_SNOW, erosion: 0.9, gullies: 0.7 }, cover: { forest: [100, 700] } },
    // north: the plateau running on toward Setenil, low limestone hills on it
    { kind: 'ridge', at: { azDeg: 14, distM: 9500 }, heightM: 300, lengthM: 7000, widthM: 3000, strikeDeg: 100, name: 'the Sierra de los Merinos',
      geology: { snow: NO_SNOW }, cover: { forest: [20, 200] }, notched: true },
  ],
  far: [
    { azDeg: [140, 230], distKm: [26, 42], reliefM: 1100, form: 'karstRidge', layers: 2, name: 'the Serranía de Ronda and Sierra Bermeja' },
    { azDeg: [250, 330], distKm: [34, 50], reliefM: 900, form: 'karstRidge', layers: 1, name: 'the Cádiz sierras behind Grazalema' },
    { azDeg: [330, 50], distKm: [16, 32], reliefM: 350, form: 'upland', layers: 1, name: 'the campiña toward Olvera' },
    { azDeg: [60, 135], distKm: [26, 40], reliefM: 900, form: 'karstRidge', layers: 1, name: 'the ranges behind the Nieves' },
  ],
  landmarks: [
    { kind: 'pylonLine', from: 'exit:n', azDeg: 8, name: 'the line north to Setenil' },
  ],
  exceptions: {
    C6: 'the tableland is open: the sierras stand over its edges only on the bearings the place has them',
  },
};

export default DRAFT;
