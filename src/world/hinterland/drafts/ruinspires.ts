// src/world/hinterland/drafts/ruinspires.ts — Ruinspires' hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §20), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The draft from today's config gave eight 12–85 m escarpment stubs at 1.1–1.4 km over an upland far
// country ("a ruined city's low rolling country", the wrong place, D6).
//
// Sarajevo under siege, 1992–96, a summer of the siege: the city fills the floor of the Miljacka's valley at about 520 m
// and climbs both sides on terrace streets, the hills over the rooftops the front line. The battlefield is the valley
// floor at Marijin Dvor, the boulevard running west to east. Standing there (the brief):
//   - south: the city's foothills (Vraca, Debelo Brdo, the bobsleigh flank) 1.5–2.5 km out, villas and red roofs on
//     them, and over them Trebević, ~1,100 m above the floor 5–6 km out, wooded to near its top;
//   - south-west: the Sarajevo field opening toward Ilidža, and over it Igman's long wooded plateau (~1,000 m) at
//     11–17 km with Bjelašnica's bare summit (~1,550 m) behind it at ~21 km;
//   - north: the slopes the city climbs (Koševo, Breka), Hum with its TV tower 2.5 km out to the north-north-west, the
//     Mrkovići plateau behind, Žuč to the west-north-west;
//   - east: the valley narrows into the Baščaršija under its minarets, the Bijela tabija on its spur over it, the
//     hills closing in, Romanija's limestone wall and Jahorina far beyond in haze;
//   - west: the valley floor runs on, flat, into Novo Sarajevo's and Novi Grad's blocks.
// A valley city: a high skyline is the place (C1, the brief's exception candidate).
import type { HinterlandConfig } from '../spec.ts';

// (summer: no snow on the hills; the region's 900 m line is a winter's — "snow-capped in winter", the brief)
const NO_SNOW = { lineM: 5000 };

const DRAFT: HinterlandConfig = {
  place: 'Sarajevo under siege, 1992–96: the city on the Miljacka\'s valley floor and climbing both sides on terrace '
    + 'streets, the Baščaršija\'s minarets east, the blocks of Novi Grad west; Trebević over the city to the south, '
    + 'Igman and Bjelašnica south-west, Hum\'s TV tower and Žuč north, Romanija and Jahorina far east',
  region: 'bosnianValley',
  lab: true,
  season: 'summer',
  outland: {
    // (the valley floor runs on level west and east; the hills are the landforms below, not the outland's swell)
    relief: { riseM: [8, 30], wavelengthM: 900 },
    woods: 0.3, hedges: 0.12, fields: 0.08, links: 3,
    settle: {
      villages: 6, hamlets: 4, farms: 2, works: 1,
      // the city's west: the valley floor's blocks, Novo Sarajevo and Novi Grad
      town: { azDeg: 268, distM: 1900, size: 'large', name: 'Novo Sarajevo and Novi Grad' },
      // the quarters on the sightlines, each round its mosque (the region's core vertical): a minaret at middle
      // distance on every edge's view
      villagesAt: [
        { azDeg: 82, distM: 1900, name: 'the Baščaršija', towerM: 47, buildings: 70 },
        { azDeg: 60, distM: 2100, name: 'Vratnik', towerM: 30, buildings: 50 },
        { azDeg: 4, distM: 1500, name: 'Koševo', towerM: 32, buildings: 60 },
        { azDeg: 342, distM: 1700, name: 'Breka and Bjelave', towerM: 30, buildings: 50 },
        { azDeg: 148, distM: 1700, name: 'Bistrik and Kovačići', towerM: 32, buildings: 50 },
        { azDeg: 214, distM: 1500, name: 'Grbavica and Hrasno', towerM: 30, buildings: 60 },
      ],
    },
  },
  landforms: [
    // the valley floor running on west and east at the boulevard's level (the outland's datum stands ~40 m over it, on
    // the old rim's lift): the Miljacka's floor west into the Sarajevo field toward Ilidža, wider as it goes, and east
    // into the old town, narrowing to its gorge between the hills
    { kind: 'valley', at: { azDeg: 270, distM: 3400 }, heightM: 42, lengthM: 6800, widthM: 2600, strikeDeg: 90, name: 'the valley floor west' },
    { kind: 'valley', at: { azDeg: 252, distM: 8200 }, heightM: 44, lengthM: 11000, widthM: 7000, strikeDeg: 72, name: 'the Sarajevo field' },
    { kind: 'valley', at: { azDeg: 232, distM: 3000 }, heightM: 36, lengthM: 4600, widthM: 2000, strikeDeg: 52, name: 'the field toward Ilidža' },
    { kind: 'valley', at: { azDeg: 88, distM: 2600 }, heightM: 38, lengthM: 4400, widthM: 1500, strikeDeg: 92, name: 'the valley floor east' },
    // south: Trebević over the city, a long wooded mass 5-6 km out (~1,100 m), its crest falling east and west from the
    // summit block; its foothills before it, the city's red roofs on their lower slopes
    // (a massif's crest stands ~0.9 of its height, its summits over it: Trebević's long crest ~1,050 m over the floor)
    { kind: 'massif', at: { azDeg: 158, distM: 5700 }, heightM: 1150, lengthM: 8400, widthM: 5200, strikeDeg: 72, name: 'Trebević',
      geology: { snow: NO_SNOW, gullies: 0.45 }, cover: { forest: [0, 980] } },
    { kind: 'ridge', at: { azDeg: 178, distM: 2200 }, heightM: 140, lengthM: 2800, widthM: 1300, strikeDeg: 82, name: 'the bobsleigh flank',
      geology: { snow: NO_SNOW }, cover: { forest: [60, 400] }, notched: true },
    { kind: 'ridge', at: { azDeg: 214, distM: 2400 }, heightM: 120, lengthM: 2400, widthM: 1200, strikeDeg: 118, name: 'Vraca and Debelo Brdo',
      geology: { snow: NO_SNOW }, cover: { forest: [40, 300] } },
    { kind: 'ridge', at: { azDeg: 126, distM: 3700 }, heightM: 320, lengthM: 3000, widthM: 1600, strikeDeg: 38, name: 'Trebević\'s east shoulder',
      geology: { snow: NO_SNOW }, cover: { forest: [40, 500] }, notched: true },
    // north: the slopes the city climbs, Hum with its TV tower, the Mrkovići plateau over them, Žuč to the west
    { kind: 'ridge', at: { azDeg: 14, distM: 2400 }, heightM: 140, lengthM: 3000, widthM: 1500, strikeDeg: 100, name: 'the Koševo slopes',
      geology: { snow: NO_SNOW }, cover: { forest: [90, 300] } },
    { kind: 'ridge', at: { azDeg: 328, distM: 2600 }, heightM: 290, lengthM: 1800, widthM: 1200, strikeDeg: 55, name: 'Hum',
      geology: { snow: NO_SNOW }, cover: { forest: [30, 200] } },
    { kind: 'massif', at: { azDeg: 22, distM: 5600 }, heightM: 600, lengthM: 7000, widthM: 3400, strikeDeg: 104, name: 'Mrkovići and Grdonj',
      geology: { snow: NO_SNOW, gullies: 0.35 }, cover: { forest: [0, 600] } },
    { kind: 'ridge', at: { azDeg: 296, distM: 6200 }, heightM: 330, lengthM: 4400, widthM: 2200, strikeDeg: 28, name: 'Žuč',
      geology: { snow: NO_SNOW }, cover: { forest: [0, 360] }, notched: true },
    // east: the valley narrowing past the old town — the Bijela tabija's spur north of it, the hills closing in, and far
    // beyond them Romanija's west-facing limestone wall
    { kind: 'ridge', at: { azDeg: 62, distM: 2700 }, heightM: 230, lengthM: 2000, widthM: 1100, strikeDeg: 24, name: 'the Bijela tabija spur',
      geology: { snow: NO_SNOW }, cover: { forest: [80, 300] } },
    { kind: 'ridge', at: { azDeg: 96, distM: 4400 }, heightM: 420, lengthM: 2600, widthM: 1600, strikeDeg: 170, name: 'the hills over the Miljacka\'s gorge',
      geology: { snow: NO_SNOW }, cover: { forest: [0, 500] }, notched: true },
    { kind: 'notch', at: { azDeg: 93, distM: 4300 }, heightM: 70, lengthM: 900, widthM: 1100, strikeDeg: 92, name: 'the Miljacka\'s gorge' },
    { kind: 'escarpment', at: { azDeg: 70, distM: 22000 }, heightM: 1100, lengthM: 14000, widthM: 6000, strikeDeg: 340, name: 'Romanija',
      geology: { snow: NO_SNOW } },
    // south-west: Igman's long plateau over the Sarajevo field, Bjelašnica's bare summit behind
    { kind: 'massif', at: { azDeg: 226, distM: 14500 }, heightM: 1000, lengthM: 15000, widthM: 6500, strikeDeg: 128, name: 'Igman',
      geology: { snow: NO_SNOW, gullies: 0.4 }, cover: { forest: [0, 940] } },
    { kind: 'massif', at: { azDeg: 212, distM: 21500 }, heightM: 1600, lengthM: 9000, widthM: 6500, strikeDeg: 110, name: 'Bjelašnica',
      geology: { snow: NO_SNOW, erosion: 0.6 }, cover: { forest: [0, 1050] } },
    { kind: 'massif', at: { azDeg: 138, distM: 19000 }, heightM: 1400, lengthM: 9000, widthM: 6000, strikeDeg: 60, name: 'Jahorina',
      geology: { snow: NO_SNOW }, cover: { forest: [0, 1150] } },
  ],
  far: [
    { azDeg: [290, 50], distKm: [13, 28], reliefM: 650, form: 'forested', layers: 2, name: 'Ozren and the hills north of the city' },
    { azDeg: [50, 130], distKm: [26, 40], reliefM: 1000, form: 'forested', layers: 1, name: 'the Romanija plateau behind its wall' },
    { azDeg: [150, 290], distKm: [26, 42], reliefM: 1200, form: 'ridges', layers: 2, name: 'Treskavica and Visočica behind Igman' },
  ],
  landmarks: [
    { kind: 'tvTower', at: { azDeg: 328, distM: 2600 }, heightM: 150, name: 'the Hum TV tower' },
    { kind: 'castle', at: { azDeg: 63, distM: 2650 }, heightM: 14, name: 'the Bijela tabija' },
    { kind: 'churchTower', at: { azDeg: 86, distM: 1500 }, heightM: 43, name: 'the Sacred Heart Cathedral' },
    { kind: 'minaret', at: { azDeg: 90, distM: 2300 }, heightM: 34, name: 'the Emperor\'s Mosque' },
    { kind: 'chimney', at: { azDeg: 250, distM: 2600 }, heightM: 90, name: 'the Toplana heating plant' },
    { kind: 'pylonLine', from: 'exit:w', azDeg: 262, name: 'the 110 kV line down the valley' },
  ],
  exceptions: {
    C1: 'Sarajevo is a valley city: Trebević stands ~1,100 m over the floor 5–6 km out and the city climbs both sides; a high skyline is the place (the brief)',
    C2: 'the valley floor runs on level west and east; the hills start past 1.5 km',
  },
};

export default DRAFT;
