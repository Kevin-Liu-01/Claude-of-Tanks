// src/world/hinterland/drafts/skybridge.ts — Skybridge Chasm's hinterland (the horizons stream, 2026-10-17; C-map-briefs
// §12, HOR-06 "open the walls so their far country shows"), a lab draft (lab: true) for a pair-judged migration like
// Verdant's: the ring stays until the critics find this strictly better. Started from `node tools/hinterland-draft.mjs
// --map=skybridge` (the old ring's twelve 200-250 m mesas 1.1-1.5 km out: the 10.76° wall the critics read as "sawtooth
// alpine peaks", which hid the far country and the dam's country alike) and authored to the real place.
//
// Glen Canyon and Page in 1965, the reservoir filling behind the dam closed two years before. The battlefield is the
// slickrock rim over the drowned arm; past its edge the Navajo Sandstone runs on as the plateau's own ground — bare
// cross-bedded benches stepping up in low ledges, rounded domes and knobs, sand in the hollows and blackbrush between —
// and nothing near stands tall: the canyon is below, not around. From the rim the skyline is far and low, the country's
// escarpments and buttes standing proud of the benches with sky between them:
//   - north, past the dam's country (the dam stands on the square's road 5): Manson Mesa's low bench with Page's water
//     tank and church, then the long table of the Kaiparowits Plateau — Fiftymile Mountain's straight rim — far north-west;
//   - north, through the gaps the square's own skyline leaves north and north-north-west of the spawn and mid-field (the
//     in-map rim under 1.2° on 316-350° and 10-14°, ../hzwork/sky-rim-*.txt): Tower Butte alone on the benches about 15 km
//     out, Navajo Mountain's great dome 60 km beyond, the Kaiparowits Plateau's rim north-west;
//   - east and south-east: the Kaibito Plateau's rim low and level over the slickrock;
//   - south: the Echo Cliffs' long red wall, its line running away south;
//   - west: the Vermilion Cliffs, a sheer red escarpment along the whole west, with the Paria Plateau behind.
// The township on the mesa carries the 1965 construction camp's verticals; the dam's power line strides south-west.
import type { HinterlandConfig } from '../spec.ts';

/** The Vermilion Cliffs' red (the Moenave and Kayenta ledges over the Chinle slopes). */
const VERMILION = 0x9a4a32;
/** The Echo Cliffs' and the benches' Navajo Sandstone, paler and orange. */
const NAVAJO = 0xc08a5c;
/** Navajo Mountain's dark laccolith dome, forested on its shoulders. */
const LACCOLITH = 0x6a5a4e;

const DRAFT: HinterlandConfig = {
  place: 'Glen Canyon and Page in 1965: bare Navajo Sandstone benches and domes over the drowning canyon, Page\'s construction '
    + 'township on Manson Mesa, Tower Butte alone on the slickrock, Navajo Mountain\'s dome far north-east, the Kaiparowits '
    + 'Plateau\'s long rim north-west, the Echo Cliffs south and the Vermilion Cliffs\' red wall along the west',
  region: 'coloradoPlateau',
  lab: true,
  outland: {
    // slickrock: no fields, no hedges, a little blackbrush and juniper in the sand pockets
    woods: 0.03, hedges: 0, fields: 0, links: 1,
    // the benches: low ledges and domes over long wavelengths (the old ring's 200-250 m wall gone)
    relief: { riseM: [8, 30], wavelengthM: 1300 },
    // (the square's old border stood the ring's 100-200 m mesa walls 0.6-1 km past the edge: the battlefield's outland
    // holds only the first 150 m and gives way to the benches by 650 m, so the walls open — HOR-06)
    nearHoldM: [120, 700],
    // (and the benches sit at the rim's own level, not on that old plateau's: the datum is the edge's)
    datum: 'edge',
    settle: {
      villages: 1, hamlets: 0, farms: 0, works: 1, town: null,
      villagesAt: [{ azDeg: 12, distM: 3400, name: 'Page on Manson Mesa', buildings: 22 }],
    },
  },
  landforms: [
    // the near benches and domes: rounded, bare, low — the slickrock's own, so the far country clears them
    { kind: 'inselberg', at: { azDeg: 58, distM: 1500 }, heightM: 34, lengthM: 420, widthM: 360, name: 'a slickrock dome' },
    { kind: 'inselberg', at: { azDeg: 132, distM: 1650 }, heightM: 28, lengthM: 380, widthM: 340, name: 'a slickrock dome' },
    { kind: 'inselberg', at: { azDeg: 214, distM: 1450 }, heightM: 30, lengthM: 400, widthM: 330, name: 'a slickrock dome' },
    { kind: 'inselberg', at: { azDeg: 296, distM: 1600 }, heightM: 26, lengthM: 360, widthM: 300, name: 'a slickrock knob' },
    { kind: 'mesa', at: { azDeg: 10, distM: 3500 }, heightM: 70, lengthM: 2600, widthM: 1500, strikeDeg: 75, name: 'Manson Mesa',
      geology: { rockHex: NAVAJO } },
    // north-east: Tower Butte alone on the benches, Navajo Mountain's dome far beyond
    { kind: 'butte', at: { azDeg: 338, distM: 15000 }, heightM: 380, lengthM: 900, widthM: 650, strikeDeg: 30, name: 'Tower Butte' },
    { kind: 'massif', at: { azDeg: 12, distM: 60000 }, heightM: 1650, lengthM: 16000, widthM: 13000, strikeDeg: 20, name: 'Navajo Mountain',
      peak: { along: 0.5, share: 0.3, asym: 1 }, geology: { rockHex: LACCOLITH, erosion: 0.2, gullies: 0.4 } },
    // north-west: the Kaiparowits Plateau's straight rim (Fiftymile Mountain) over the benches
    { kind: 'escarpment', at: { azDeg: 316, distM: 30000 }, heightM: 950, lengthM: 42000, widthM: 3000, strikeDeg: 140, name: 'the Kaiparowits rim' },
    // west: the Vermilion Cliffs' sheer red wall along the whole west, the Paria Plateau behind it
    { kind: 'escarpment', at: { azDeg: 262, distM: 21000 }, heightM: 600, lengthM: 30000, widthM: 2400, strikeDeg: 165, name: 'the Vermilion Cliffs',
      geology: { rockHex: VERMILION } },
    // south: the Echo Cliffs' long wall running away south
    { kind: 'escarpment', at: { azDeg: 176, distM: 14000 }, heightM: 330, lengthM: 26000, widthM: 1800, strikeDeg: 12, name: 'the Echo Cliffs',
      geology: { rockHex: NAVAJO } },
    // east and south-east: the Kaibito Plateau's level rim
    { kind: 'escarpment', at: { azDeg: 118, distM: 18000 }, heightM: 260, lengthM: 24000, widthM: 2200, strikeDeg: 28, name: 'the Kaibito rim' },
  ],
  far: [
    // past the escarpments the plateau's own tables, low on every side
    { azDeg: [0, 360], distKm: [24, 70], reliefM: 380, form: 'tables', layers: 1, name: 'the Colorado Plateau\'s tables' },
  ],
  landmarks: [
    // Page's 1965 water tank on the mesa's edge and the dam's 345 kV line striding south-west
    { kind: 'waterTower', at: { azDeg: 14, distM: 3150 }, heightM: 26, name: 'Page\'s water tank' },
    { kind: 'pylonLine', azDeg: 228, from: 'exit:s', name: 'the dam\'s power line' },
  ],
  exceptions: {
    C1: 'the slickrock rim over a drowned canyon: the walls are below, the skyline far and low (escarpments 1-2° over the benches)',
    C2: 'bare benches and domes: the outland rises 8-30 m, the dam\'s country beyond',
  },
};

export default DRAFT;
