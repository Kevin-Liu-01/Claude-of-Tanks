// src/world/hinterland/drafts/alpine.ts — Glacier Pass's hinterland, a lab draft (HL-2, the horizons stream,
// 2026-10-13; C-map-briefs §3), authored from the real place rather than drafted from the old ring (whose horizon block
// is palette only: the "tan desert-coloured slab" and the "flat white wall of haze with a hard, stepped top edge").
//
// The Col du Mont-Cenis in April 1945: a saddle at about 2,000 m holding its lake. North, the cirque wall and over it
// Pointe de Ronce (about 3,600 m) and Rochemelon (about 3,540 m), some 1,500 m above the col at 4–8 km, glaciated, snow
// couloirs down their faces; the rock spurs with their forts coming down into the corners; west, Mont Froid and the
// Petit Mont-Cenis; south, the col falls away toward the Val di Susa, a low skyline with the Italian peaks layered at
// 15–30 km. The col (about 2,080 m) stands above the treeline: no wood up here, the larch and pine belts only down the
// Susa side and the Arc valley, far below; in April the snow lies down to the floor, the rock showing only on the steep
// bands and the wind-scoured crests (HL-2b, against the reference photo of the lake under the Petit Mont-Cenis).
// A high skyline is true here (C1's recorded exception).
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The Col du Mont-Cenis, April 1945: a high saddle holding its lake under Pointe de Ronce and Rochemelon, rock spurs with '
    + 'their forts, the col falling south toward the Val di Susa',
  region: 'alpineCol',
  lab: true,
  outland: { woods: 0.3, settle: { villages: 1, hamlets: 3, farms: 3, works: 0 } },
  landforms: [
    // the cirque wall north of the col and the summits over it
    { kind: 'massif', at: { azDeg: 0, distM: 2900 }, heightM: 760, lengthM: 6400, widthM: 4200, strikeDeg: 90, name: 'the cirque wall',
      geology: { snow: { lineM: 0 }, gullies: 0.9 }, cover: { bare: true } },
    { kind: 'massif', at: { azDeg: 342, distM: 6400 }, heightM: 1520, lengthM: 7400, widthM: 6200, strikeDeg: 70, name: 'Pointe de Ronce',
      geology: { snow: { lineM: 0 }, gullies: 0.9, erosion: 0.95 }, cover: { bare: true } },
    { kind: 'massif', at: { azDeg: 24, distM: 8200 }, heightM: 1480, lengthM: 7000, widthM: 6000, strikeDeg: 110, name: 'Rochemelon',
      geology: { snow: { lineM: 0 }, gullies: 0.9, erosion: 0.95 }, cover: { bare: true } },
    // the rock spurs toward the corners (their forts on top), beside the diagonals so a corner looks up the col past them
    { kind: 'ridge', at: { azDeg: 328, distM: 1500 }, heightM: 240, lengthM: 1500, widthM: 560, strikeDeg: 148, name: 'the Ronce spur',
      geology: { erosion: 0.8, gullies: 0.7, snow: { lineM: 0 } }, cover: { bare: true } },
    { kind: 'ridge', at: { azDeg: 34, distM: 1550 }, heightM: 260, lengthM: 1500, widthM: 600, strikeDeg: 34, name: 'the Turra spur',
      geology: { erosion: 0.8, gullies: 0.7, snow: { lineM: 0 } }, cover: { bare: true } },
    { kind: 'ridge', at: { azDeg: 148, distM: 1450 }, heightM: 190, lengthM: 1300, widthM: 520, strikeDeg: 148, name: 'the Variselle spur',
      geology: { erosion: 0.75, gullies: 0.6, snow: { lineM: 0 } }, cover: { bare: true } },
    // west: Mont Froid and the Petit Mont-Cenis; east: the slopes up to the Lamet
    { kind: 'massif', at: { azDeg: 282, distM: 3400 }, heightM: 720, lengthM: 4600, widthM: 4000, strikeDeg: 10, name: 'Mont Froid',
      geology: { snow: { lineM: 0 } }, cover: { bare: true } },
    { kind: 'massif', at: { azDeg: 92, distM: 3200 }, heightM: 640, lengthM: 4800, widthM: 3800, strikeDeg: 170, name: 'the Lamet slopes',
      geology: { snow: { lineM: 0 } }, cover: { bare: true } },
    // south: the col falls away toward the Val di Susa
    { kind: 'valley', at: { azDeg: 182, distM: 3800 }, heightM: 520, lengthM: 6400, widthM: 2800, strikeDeg: 2, name: 'the Susa side' },
  ],
  far: [
    { azDeg: [290, 70], distKm: [8, 20], reliefM: 1700, form: 'alpine', layers: 2, name: 'the Vanoise and the Ronce massif behind' },
    { azDeg: [120, 240], distKm: [14, 32], reliefM: 1500, form: 'alpine', layers: 2, name: 'the Italian peaks over the Val di Susa' },
    { azDeg: [60, 125], distKm: [6, 18], reliefM: 1300, form: 'alpine', layers: 1 },
    { azDeg: [235, 295], distKm: [6, 18], reliefM: 1200, form: 'alpine', layers: 1 },
  ],
  landmarks: [
    { kind: 'castle', at: { azDeg: 328, distM: 1600 }, heightM: 14, name: 'Fort de Ronce' },
    { kind: 'castle', at: { azDeg: 34, distM: 1650 }, heightM: 14, name: 'Fort de la Turra' },
    { kind: 'pylonLine', from: 'exit:s', azDeg: 186, name: 'the line down to Susa' },
  ],
  exceptions: {
    C1: 'the Col du Mont-Cenis is a saddle under Ronce and Rochemelon, 1,500 m above it within 8 km: a high skyline is true here',
    C2: 'the cirque wall and the spurs stand over the col within 500 m of the edge',
  },
};

export default DRAFT;
