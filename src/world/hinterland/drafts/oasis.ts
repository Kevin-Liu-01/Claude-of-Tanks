// src/world/hinterland/drafts/oasis.ts — Sunscar Oasis's hinterland (the horizons stream, 2026-10-16; C-map-briefs §13),
// a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The ring drew a flat erg of soft dunes with no far layer ("a curved rim ... a flat, featureless cream
// plane", 23 % of its skylines formed inside 1 km); the real place has a story on every side.
//
// Siwa, in Egypt's Western Desert, 2010: a depression below sea level, its floor of springs, salt lakes and walled palm
// gardens, old Shali's melted kershef town heaped on its hill (the battlefield's own). Standing there: north, the
// depression's scarp, a long pale ledged wall ~140 m high ~3.7 km out with the plateau running on behind it, gour
// standing out in front of it and Gebel al-Mawta's tombed knoll 1.6 km out; east, Aghurmi's rock with the Oracle's
// temple on it, Gebel Dakrur's ochre ridge south-east; west, Lake Siwa's water and salt shores with Fatnas's palm
// spit reaching into it; south, the palm belts, then the Great Sand Sea's seif dunes past 10 km.
import type { HinterlandConfig } from '../spec.ts';

/** Dakrur's ochre sandstone, Aghurmi's grey-buff limestone. */
const DAKRUR_ROCK = 0xb07a48;

const DRAFT: HinterlandConfig = {
  place: 'Siwa, in Egypt\'s Western Desert, 2010: a depression below sea level, its floor of springs, salt lakes and walled '
    + 'palm gardens under the pale ledged northern scarp; Aghurmi\'s rock and the Oracle\'s temple east, Gebel Dakrur\'s '
    + 'ochre ridge, Lake Siwa and Fatnas west, the Great Sand Sea\'s dunes south',
  region: 'saharaOasis',
  lab: true,
  outland: {
    // (the palm gardens: Siwa's floor holds some 300,000 palms round its springs, more than the region's Dahar share)
    woods: 0.16, hedges: 0, fields: 0, links: 2,
    // the depression's floor: flat salt and sand, low dune swell (the region's 20-60 m stood a ring of hills)
    relief: { riseM: [3, 12], wavelengthM: 900 },
    settle: {
      villages: 2, hamlets: 3, farms: 4, works: 0, town: null,
      villagesAt: [
        { azDeg: 93, distM: 4100, name: 'Aghurmi', towerM: 24, buildings: 16 },
        { azDeg: 205, distM: 2600, name: 'a garden village', towerM: 22, buildings: 14 },
      ],
    },
  },
  landforms: [
    // north: the depression's scarp, ledged limestone (strike 270: the plateau rises behind it to the north), and a
    // second bed stair inside its plateau so the table runs on north (the desert's construction)
    // (its crest ~3.7 km out: at 5.5 km the CPU eyes read it 1.4° from edge-n, under the near band's 2-2.7°)
    { kind: 'escarpment', at: { azDeg: 0, distM: 3600 }, heightM: 140, lengthM: 30000, widthM: 2400, strikeDeg: 270,
      name: 'the northern scarp', cover: { bare: true } },
    { kind: 'escarpment', at: { azDeg: 0, distM: 4325 }, heightM: 140, lengthM: 29000, widthM: 3800, strikeDeg: 270,
      name: 'the plateau', cover: { bare: true } },
    // gour standing out in front of the scarp, and Gebel al-Mawta's knoll with its rock tombs
    { kind: 'butte', at: { azDeg: 5, distM: 1600 }, heightM: 48, lengthM: 340, widthM: 280, strikeDeg: 30, name: 'Gebel al-Mawta',
      cover: { bare: true } },
    { kind: 'mesa', at: { azDeg: 322, distM: 2500 }, heightM: 40, lengthM: 700, widthM: 420, strikeDeg: 80, name: 'a gara', cover: { bare: true } },
    { kind: 'butte', at: { azDeg: 38, distM: 2900 }, heightM: 34, lengthM: 380, widthM: 300, strikeDeg: 120, name: 'a gara', cover: { bare: true } },
    { kind: 'mesa', at: { azDeg: 345, distM: 2700 }, heightM: 55, lengthM: 800, widthM: 480, strikeDeg: 95, name: 'an outlier of the scarp', cover: { bare: true } },
    // east: Aghurmi's rock (the village and the temple on it), Gebel Dakrur's ochre ridge south-east
    { kind: 'mesa', at: { azDeg: 93, distM: 4100 }, heightM: 30, lengthM: 420, widthM: 320, strikeDeg: 20, name: 'Aghurmi\'s rock', cover: { bare: true } },
    { kind: 'ridge', at: { azDeg: 128, distM: 4600 }, heightM: 75, lengthM: 2000, widthM: 760, strikeDeg: 60, notched: true,
      name: 'Gebel Dakrur', geology: { rockHex: DAKRUR_ROCK, erosion: 0.7 }, cover: { bare: true } },
    { kind: 'butte', at: { azDeg: 152, distM: 1700 }, heightM: 26, lengthM: 300, widthM: 240, strikeDeg: 10, name: 'a gara', cover: { bare: true } },
    // south-west: the floor falling gently from the gardens to the lake (the corner's view down to its water), and
    // Fatnas, the low palm spit reaching into the lake between its two basins
    { kind: 'valley', at: { azDeg: 219, distM: 2390 }, heightM: 22, lengthM: 5000, widthM: 3000, strikeDeg: 217, name: 'the fall to the lake' },
    { kind: 'inselberg', at: { azDeg: 236, distM: 3700 }, heightM: 5, lengthM: 900, widthM: 380, strikeDeg: 236, name: 'Fatnas' },
    // the bare desert past the depression: no palm stands out on the plateau north or in the Sand Sea south (the
    // gardens keep to the floor's springs) — two sheets of bare ground a metre or two high under the far forms
    { kind: 'inselberg', at: { azDeg: 0, distM: 15000 }, heightM: 2, lengthM: 30000, widthM: 16000, strikeDeg: 90,
      name: 'the plateau\'s bare desert', cover: { bare: true } },
    { kind: 'inselberg', at: { azDeg: 185, distM: 17000 }, heightM: 2, lengthM: 30000, widthM: 16000, strikeDeg: 95,
      name: 'the Great Sand Sea\'s bare sand', cover: { bare: true } },
  ],
  water: [
    // Lake Siwa: its two basins either side of Fatnas, south-west and west, below the gardens
    { kind: 'lake', at: { azDeg: 218, distM: 5400 }, radiusM: 1900, level: -4, name: 'Lake Siwa, the south-west basin' },
    { kind: 'lake', at: { azDeg: 252, distM: 4800 }, radiusM: 1500, level: -4, name: 'Lake Siwa, the west basin' },
  ],
  far: [
    // north: the plateau's low scarp country (the brief: a low scarp far country in place of the erg)
    { azDeg: [300, 60], distKm: [9, 24], reliefM: 260, form: 'tables', layers: 1, name: 'the Libyan plateau' },
    // south: the Great Sand Sea's seif dunes
    { azDeg: [120, 250], distKm: [10, 30], reliefM: 150, form: 'erg', layers: 1, name: 'the Great Sand Sea' },
  ],
  landmarks: [
    { kind: 'castle', at: { azDeg: 95, distM: 4120 }, heightM: 12, name: 'the Oracle\'s temple, Aghurmi' },
    { kind: 'mast', at: { azDeg: 14, distM: 6400 }, heightM: 60, name: 'the relay mast on the scarp' },
    { kind: 'pylonLine', from: 'exit:n', azDeg: 4, name: 'the line up the scarp to Marsa Matruh' },
  ],
  exceptions: {
    C1: 'the Siwa depression is a flat floor: its skyline is the low northern scarp, Dakrur and the palm belts, not a range',
  },
};

export default DRAFT;
