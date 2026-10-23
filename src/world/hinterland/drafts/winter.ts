// src/world/hinterland/drafts/winter.ts — Frosthollow's hinterland (HOR-04, the horizons stream, 2026-10-16;
// C-map-briefs §26), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics
// find this strictly better. The Podhale under the Tatras, January 1945: a snowbound timber valley, a frozen river, góral
// country; south the High Tatras' granite wall 1,500-1,800 m over the basin at 10-20 km (4-9°), Giewont's "sleeping
// knight" among them; west the two-armed ridge and its saddle, then the West Tatras, Babia Góra's lone dome far north-west;
// north the open basin to Gorce's rounded spruce ridges at 15-25 km; east moraine knolls, then the Pieniny.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The Podhale under the Tatras, January 1945: a snowbound timber valley with a frozen river and góral villages '
    + 'of log houses, spruce on the foreland; the High Tatras\' granite wall to the south with Giewont, the West Tatras, '
    + 'Gorce\'s spruce ridges north, the Pieniny east, Babia Góra\'s dome far north-west',
  region: 'tatraValley',
  lab: true,
  season: 'winter',
  landforms: [
    // south: the High Tatras' wall, its granite massifs shoulder to shoulder 11-15 km out, snow-plastered, sharp
    { kind: 'massif', at: { azDeg: 182, distM: 11500 }, heightM: 1350, lengthM: 4200, widthM: 3200, strikeDeg: 95, name: 'Giewont',
      geology: { snow: { lineM: 0 }, erosion: 0.9, gullies: 0.9 }, cover: { forest: [0, 300] }, peak: { along: 0.25, share: 0.3, asym: 1.4 } },
    { kind: 'massif', at: { azDeg: 166, distM: 13500 }, heightM: 1750, lengthM: 7000, widthM: 4200, strikeDeg: 80, name: 'the High Tatras',
      geology: { snow: { lineM: 0 }, erosion: 0.95, gullies: 0.95 }, cover: { forest: [0, 250] } },
    { kind: 'massif', at: { azDeg: 198, distM: 14500 }, heightM: 1600, lengthM: 6500, widthM: 4000, strikeDeg: 110, name: 'the Czerwone Wierchy',
      geology: { snow: { lineM: 0 }, erosion: 0.85, gullies: 0.9 }, cover: { forest: [0, 280] } },
    { kind: 'massif', at: { azDeg: 147, distM: 15500 }, heightM: 1650, lengthM: 6000, widthM: 4000, strikeDeg: 60, name: 'the Belianske Tatras',
      geology: { snow: { lineM: 0 }, erosion: 0.9, gullies: 0.85 }, cover: { forest: [0, 260] } },
    // west: the two-armed ridge and its saddle near, the West Tatras behind
    { kind: 'ridge', at: { azDeg: 252, distM: 3600 }, heightM: 230, lengthM: 3800, widthM: 1200, strikeDeg: 340, notched: true,
      geology: { snow: { lineM: 0 } }, cover: { forest: [0, 200] }, name: 'the ridge south of the saddle' },
    { kind: 'ridge', at: { azDeg: 288, distM: 3900 }, heightM: 210, lengthM: 3400, widthM: 1100, strikeDeg: 20, notched: true,
      geology: { snow: { lineM: 0 } }, cover: { forest: [0, 200] }, name: 'the ridge north of the saddle' },
    { kind: 'massif', at: { azDeg: 232, distM: 13000 }, heightM: 1300, lengthM: 9000, widthM: 4200, strikeDeg: 140, name: 'the West Tatras',
      geology: { snow: { lineM: 0 }, erosion: 0.8 }, cover: { forest: [0, 350] } },
    // far north-west: Babia Góra's lone dome
    { kind: 'massif', at: { azDeg: 304, distM: 34000 }, heightM: 1150, lengthM: 9000, widthM: 6000, strikeDeg: 80, name: 'Babia Góra',
      geology: { snow: { lineM: 0 } }, cover: { forest: [0, 500] } },
    // east: moraine knolls on the basin
    { kind: 'inselberg', at: { azDeg: 78, distM: 1900 }, heightM: 45, lengthM: 700, widthM: 500, name: 'a moraine knoll' },
    { kind: 'inselberg', at: { azDeg: 112, distM: 2400 }, heightM: 38, lengthM: 600, widthM: 450, name: 'a moraine knoll' },
  ],
  far: [
    { azDeg: [140, 225], distKm: [17, 30], reliefM: 1500, form: 'alpine', layers: 2, name: 'the High Tatras behind their wall' },
    { azDeg: [320, 50], distKm: [15, 26], reliefM: 650, form: 'forested', layers: 2, name: 'Gorce\'s spruce ridges' },
    { azDeg: [50, 135], distKm: [14, 24], reliefM: 480, form: 'upland', layers: 1, name: 'the Pieniny' },
  ],
  exceptions: {
    C6: 'Podhale: north the open basin runs to Gorce\'s low forested ridges; only the south stands as a wall',
  },
};

export default DRAFT;
