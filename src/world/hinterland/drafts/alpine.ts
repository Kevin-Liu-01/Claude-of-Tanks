// src/world/hinterland/drafts/alpine.ts — Glacier Pass's hinterland, shipped by its map file's switch (HL-2, the horizons stream,
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
  // (the coordinator on the first Glacier frames: the battlefield's spruce woods carry on into the outland below the
  // treeline, and the church village returns under the cirque at edge-n, its tower clear of the woods)
  outland: { woods: 0.34, settle: { villages: 1, hamlets: 3, farms: 3, works: 0,
    // (round 4, the coordinator on edge-n: the ring's church read larger — its border village stood ~300 m from the eye
    // in front of the cirque's dark rock; Les Tavernettes comes in to 740 m on the flat before the knoll, eighteen
    // houses, its slim pale tower 42 m, read whole from the edge)
    villagesAt: [{ azDeg: 2, distM: 740, name: 'Les Tavernettes', towerM: 42, buildings: 18, slim: true }] } },
  landforms: [
    // the near walls (the coordinator on the first Glacier frames: "drama at the right distance" — at Mont-Cenis the walls
    // rise some 1,000 m within 2–3 km of the lake; the ring's wall subtended 12–20° from the edge eyes, so the cirque,
    // the Ronce shoulder and Mont Froid stand 0.8–1.5 km past the edge, their rock banded, snow on the ledges)
    // (round 3, the in-game frames against the ring: the wall looms at edge-n — 820 m, its crest 1.3 km past the edge —
    // and its foot is wooded, the spruce running up its apron to ~160 m; the rock bands above)
    { kind: 'massif', at: { azDeg: 0, distM: 1850 }, heightM: 820, lengthM: 5000, widthM: 2000, strikeDeg: 90, name: 'the cirque wall',
      geology: { snow: { lineM: 0 }, gullies: 0.9 }, cover: { forest: [0, 160] } },
    { kind: 'massif', at: { azDeg: 330, distM: 2300 }, heightM: 700, lengthM: 2600, widthM: 2000, strikeDeg: 60, name: 'the Ronce shoulder',
      geology: { snow: { lineM: 0 }, gullies: 0.9, erosion: 0.9 }, cover: { forest: [0, 140] } },
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
    // (round 4, the coordinator on edge-w: "Mont Froid reads as a flat-topped table mountain" — its summit stands just
    // north of the west view's middle, a shoulder either side, the crest falling from it to both ends)
    { kind: 'massif', at: { azDeg: 282, distM: 2050 }, heightM: 620, lengthM: 3400, widthM: 2300, strikeDeg: 10, name: 'Mont Froid',
      geology: { snow: { lineM: 0 } }, cover: { forest: [0, 150] }, peak: { along: -0.15, share: 0.5 } },
    { kind: 'massif', at: { azDeg: 92, distM: 2500 }, heightM: 560, lengthM: 4200, widthM: 2600, strikeDeg: 170, name: 'the Lamet slopes',
      geology: { snow: { lineM: 0 } }, cover: { forest: [0, 200] } },
    // south: the col's own shoulder over the Grande Croix, wooded, standing over the rim so the south view keeps a dark
    // forested ridge with the Susa ranges over it (the ring's edge-s had one; the first frames' edge-s was empty sky)
    { kind: 'ridge', at: { azDeg: 188, distM: 1700 }, heightM: 300, lengthM: 2600, widthM: 900, strikeDeg: 98, name: 'the Grande Croix shoulder',
      geology: { snow: { lineM: 0 }, gullies: 0.6 }, cover: { forest: [0, 240] } },
    // south: the col falls away toward the Val di Susa — the valley drops some 1,500 m in 10 km between its walls (the
    // Rocciamelone's shoulder east, the Ambin's west), so from the col the eye runs down into it and over it to the
    // Italian ranges layered beyond
    // (round 3: the descent begins past the Grande Croix, ~2.2 km out — the valley no longer carves the col's own near
    // shoulder away, so edge-s keeps its wooded ridge over the rim with the Italian ranges beyond)
    { kind: 'valley', at: { azDeg: 180, distM: 8600 }, heightM: 1100, lengthM: 12800, widthM: 5200, strikeDeg: 4, name: 'the Val di Susa' },
    { kind: 'massif', at: { azDeg: 150, distM: 7600 }, heightM: 1150, lengthM: 8200, widthM: 4600, strikeDeg: 10, name: 'the Rocciamelone shoulder',
      geology: { snow: { lineM: 250 } } },
    { kind: 'massif', at: { azDeg: 212, distM: 7400 }, heightM: 1050, lengthM: 8000, widthM: 4400, strikeDeg: 170, name: 'the Ambin side',
      geology: { snow: { lineM: 250 } } },
  ],
  far: [
    { azDeg: [290, 70], distKm: [8, 20], reliefM: 1700, form: 'alpine', layers: 2, name: 'the Vanoise and the Ronce massif behind' },
    { azDeg: [120, 240], distKm: [14, 40], reliefM: 1600, form: 'alpine', layers: 3, name: 'the Italian ranges stepping back over the Val di Susa' },
    { azDeg: [60, 125], distKm: [6, 18], reliefM: 1300, form: 'alpine', layers: 1 },
    { azDeg: [235, 295], distKm: [6, 18], reliefM: 1200, form: 'alpine', layers: 1 },
  ],
  landmarks: [
    { kind: 'castle', at: { azDeg: 328, distM: 1600 }, heightM: 14, name: 'Fort de Ronce' },
    { kind: 'castle', at: { azDeg: 34, distM: 1650 }, heightM: 14, name: 'Fort de la Turra' },
    { kind: 'pylonLine', from: 'exit:s', azDeg: 186, name: 'the line down to Susa' },
  ],
  exceptions: {
    C1: 'the Col du Mont-Cenis is a saddle under Ronce and Rochemelon, 1,500 m above it within 8 km, its walls rising some 1,000 m within 2–3 km of the lake: a high near skyline is the place (the near wall is its character)',
    C2: 'the cirque wall and the spurs stand over the col within 500 m of the edge',
    C3: "the col's own shoulders, the battlefield's pass climbing to its north and south edges, stand the near skyline on a quarter of the bearings; the cirque and the Susa ranges stand over them",
  },
};

export default DRAFT;
