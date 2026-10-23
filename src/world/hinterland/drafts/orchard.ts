// src/world/hinterland/drafts/orchard.ts — Orchard Valley's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §24), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The draft from today's config gave twelve 16–160 m ridge stubs at 1.2–1.4 km under an upland far
// country all round ("a flat teal-grey plane like a sea" past the rim: the sea is real, but at 15 km, not at the rim).
//
// The Chouf on Mount Lebanon in June 1982, between Deir el Qamar and Beiteddine (~850 m): olive and apple terraces on
// dry-stone walls, stone pines, villages of cream sandstone under red tiles stacked on the spurs. Standing there (the
// brief):
//   - east: the slopes climbing to the Barouk ridge, ~1,100 m above at 5–8 km, dark with cedar on its upper slopes, its
//     crest bare, the relay masts on it; Beiteddine's palace on its spur across the valley ~1.3 km out;
//   - north and south: terraced slopes with the stacked red-roofed villages (Kfarhim, Baakline, Semqanieh);
//   - west: Mount Lebanon's western slope falling toward the coast, the Damour's valley cut into it, hazy hills, then the
//     Mediterranean's pale line 15–20 km out, ~850 m below.
import type { HinterlandConfig } from '../spec.ts';

const NO_SNOW = { lineM: 5000 };

const DRAFT: HinterlandConfig = {
  place: 'The Chouf on Mount Lebanon, June 1982, between Deir el Qamar and Beiteddine: olive and apple terraces on dry-stone '
    + 'walls, villages of cream sandstone under red tiles on the spurs, Beiteddine\'s palace across the valley, the '
    + 'Barouk\'s cedars east, the mountain falling west to the Mediterranean',
  region: 'levantOrchard',
  lab: true,
  season: 'summer',
  outland: {
    relief: { riseM: [20, 70], wavelengthM: 700 },
    woods: 0.32, hedges: 0.6, fields: 0.6, links: 3,
    settle: {
      villages: 7, hamlets: 4, farms: 8, works: 0,
      // the villages on their spurs, each round its mosque or church (the region's core vertical)
      villagesAt: [
        { azDeg: 108, distM: 1200, name: 'Beiteddine', towerM: 24, buildings: 40, slim: true },
        { azDeg: 346, distM: 2400, name: 'Kfarhim', towerM: 26 },
        { azDeg: 192, distM: 2700, name: 'Baakline', towerM: 28 },
        { azDeg: 148, distM: 3300, name: 'Semqanieh', towerM: 24 },
        { azDeg: 296, distM: 2900, name: 'Dmit', towerM: 24 },
        { azDeg: 40, distM: 4800, name: 'Ain Zhalta', towerM: 26 },
        { azDeg: 168, distM: 7000, name: 'Moukhtara', towerM: 28 },
      ],
    },
  },
  landforms: [
    // east: the terraced slopes climbing to the Barouk, its long crest ~1,100 m above 6–8 km out, the cedars on its upper
    // slopes and the bare crest over them (a massif's crest stands ~0.9 of its height)
    { kind: 'ridge', at: { azDeg: 92, distM: 2700 }, heightM: 260, lengthM: 4200, widthM: 1800, strikeDeg: 18, name: 'the slopes under the Barouk',
      geology: { snow: NO_SNOW }, cover: { forest: [120, 300] }, notched: true },
    { kind: 'massif', at: { azDeg: 80, distM: 7200 }, heightM: 1250, lengthM: 16000, widthM: 5600, strikeDeg: 22, name: 'the Barouk',
      geology: { snow: NO_SNOW, erosion: 0.55 }, cover: { forest: [560, 1060] } },
    // Beiteddine's spur across the valley, pointing toward the map
    { kind: 'ridge', at: { azDeg: 110, distM: 1450 }, heightM: 60, lengthM: 1300, widthM: 600, strikeDeg: 112, name: 'the Beiteddine spur',
      geology: { snow: NO_SNOW } },
    // north and south: the terraced slopes the villages stack on
    { kind: 'ridge', at: { azDeg: 4, distM: 2700 }, heightM: 240, lengthM: 3800, widthM: 1700, strikeDeg: 96, name: 'the slopes over Kfarhim',
      geology: { snow: NO_SNOW }, cover: { forest: [100, 260] }, notched: true },
    { kind: 'ridge', at: { azDeg: 184, distM: 3000 }, heightM: 280, lengthM: 3800, widthM: 1700, strikeDeg: 84, name: 'the slopes over Baakline',
      geology: { snow: NO_SNOW }, cover: { forest: [100, 300] }, notched: true },
    { kind: 'massif', at: { azDeg: 160, distM: 9500 }, heightM: 900, lengthM: 9000, widthM: 4400, strikeDeg: 30, name: 'Jabal Niha',
      geology: { snow: NO_SNOW }, cover: { forest: [300, 800] } },
    // west: the mountain's western slope falling ~850 m to the coast over 17 km (a broad trough across the whole west,
    // its floor at the shore), the Damour's gorge cut deep into it toward the west-south-west (its floor ~500 m down
    // within 4 km: the sea seen down it), the hills between
    { kind: 'valley', at: { azDeg: 270, distM: 17800 }, heightM: 800, lengthM: 70000, widthM: 34600, strikeDeg: 0, name: 'Mount Lebanon\'s western slope' },
    { kind: 'valley', at: { azDeg: 258, distM: 8000 }, heightM: 520, lengthM: 15000, widthM: 4000, strikeDeg: 258, name: 'the Damour\'s valley' },
    { kind: 'ridge', at: { azDeg: 238, distM: 8000 }, heightM: 220, lengthM: 5000, widthM: 2200, strikeDeg: 250, name: 'the hills toward Damour',
      geology: { snow: NO_SNOW }, cover: { forest: [0, 200] }, notched: true },
    { kind: 'ridge', at: { azDeg: 290, distM: 9000 }, heightM: 240, lengthM: 5600, widthM: 2400, strikeDeg: 265, name: 'the hills toward Naameh',
      geology: { snow: NO_SNOW }, cover: { forest: [0, 200] }, notched: true },
  ],
  water: [
    // the Mediterranean, ~850 m below the valley, its coast running north–south 17 km west
    { kind: 'sea', arc: { azDeg: [250, 290] }, coastM: 17000, coastWanderM: 600, level: -780, name: 'the Mediterranean' },
  ],
  far: [
    { azDeg: [350, 60], distKm: [22, 40], reliefM: 1500, form: 'ridges', layers: 2, name: 'Mount Lebanon north: Kneisseh and Sannine' },
    { azDeg: [60, 140], distKm: [34, 55], reliefM: 1400, form: 'ridges', layers: 1, name: 'the Anti-Lebanon across the Bekaa' },
    { azDeg: [140, 200], distKm: [16, 30], reliefM: 900, form: 'upland', layers: 2, name: 'Jezzine and the southern Chouf' },
  ],
  landmarks: [
    { kind: 'castle', at: { azDeg: 113, distM: 1300 }, heightM: 18, name: 'the Beiteddine palace' },
    { kind: 'churchTower', at: { azDeg: 343, distM: 2500 }, heightM: 24, name: 'the Kfarhim church' },
    { kind: 'churchTower', at: { azDeg: 150, distM: 3450 }, heightM: 22, name: 'the Semqanieh church' },
    { kind: 'mast', at: { azDeg: 80, distM: 7200 }, heightM: 60, name: 'the Barouk relay masts' },
    { kind: 'pylonLine', from: 'exit:w', azDeg: 256, name: 'the line down to Damour' },
  ],
  exceptions: {
    C1: 'the Chouf is a mountain valley: the Barouk stands ~1,100 m over it 6–8 km east; west the mountain falls to the sea',
    C6: 'west the land falls ~850 m to the sea: no far layer stands over it',
  },
};

export default DRAFT;
