// src/world/hinterland/drafts/saltwind.ts — Saltwind Narrows' hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §30), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Drafted by `node tools/hinterland-draft.mjs --map=saltwind --write` (twelve 300 m bumps from the old
// ring, the sea as one opening 370 m past the edge, the karstRidge far country) and authored to the real place.
//
// A Dalmatian limestone coast on the Pelješac channel, 1992: the bay hooked behind its headland, the harbour village,
// dry-stone terraces (gromače) up bare limestone, scrub and olive walls, the karst spine running inland. The brief's
// "standing there":
//   - west: the bay and the channel; across it the island's ridge (Korčula's, 400-600 m) rising from its far shore at
//     ~4.6 km — the ring's `karstRidge` far shore kept, now land at its place: dark maquis and Aleppo pine climbing the
//     gullies of its lower slopes, pale bare limestone on its upper faces, its beds in ledges; a stone village with its
//     campanile on the far shore;
//   - east: the karst spine rising off the battlefield in terraced foothills, and over them Sveti Ilija's bare grey
//     summit ridge (~920 m over the coast, 5 km) with its chapel, Pelješac's spine running on north and south of it;
//   - north and south: the coast runs on along the channel, the terraced slopes rising inland, hill villages with their
//     campaniles on their knolls, the mainland ranges far up the channel.
// The water: the bay's mouth carried past the red line by a lake at its level (the sea's coast alone stood 370 m out,
// a dry bed between), the channel with its far shore at ~4.6 km and two coves along the near coast, the open Adriatic
// past the island. From edge-w the island's crest stands 4-6.3° across 225-320° (its high summit 6.3° at 6 km, a level
// crest of minor summits 5.3-5.8° north of it — the old far shore's ~5.8°); from the centre Sveti Ilija stands 6.9°
// at 5.2 km, ~2° over its foothills, its shoulders 5-5.8° either side.
import type { HinterlandConfig } from '../spec.ts';

/** The karst's beds: thin limestone beds in ledges (the brief: "blobby karst … needs ledges and strata"). */
const BEDS = { bedM: 7, dipDeg: 14, contrast: 0.2 } as const;

const DRAFT: HinterlandConfig = {
  place: 'The Pelješac channel in 1992: a limestone coast of dry-stone terraces, olive walls, Aleppo pine and macchia under '
    + 'Sveti Ilija\'s bare grey ridge; across the channel the island\'s karst ridge with its stone villages and campaniles',
  region: 'karstCoast',
  lab: true,
  outland: {
    // (the gromače terraces and olive walls on the slopes; maquis and pine in the gullies)
    woods: 0.2, hedges: 0.4, fields: 0.32, links: 2,
    settle: {
      villages: 6, hamlets: 4, farms: 5, works: 0, town: null,
      // the hill villages with their campaniles where the slopes leave them clear from the edge eyes and the spawn (the
      // old villages stand on their knolls above the coast, the terraces round them), the island's on its far shore
      villagesAt: [
        { azDeg: 345, distM: 1400, name: 'Kućište', towerM: 30 },
        { azDeg: 2, distM: 1300, name: 'Viganj', towerM: 28 },
        { azDeg: 198, distM: 1400, name: 'Orebić', towerM: 32 },
        { azDeg: 120, distM: 1400, name: 'Pijavičino', towerM: 26 },
        { azDeg: 60, distM: 1700, name: 'Potomje', towerM: 26 },
        { azDeg: 268, distM: 5000, name: 'the island village across the channel', towerM: 30 },
      ],
    },
  },
  landforms: [
    // east: the karst spine's terraced foothills off the battlefield, notched, its beds in ledges
    { kind: 'ridge', at: { azDeg: 92, distM: 1700 }, heightM: 120, lengthM: 2600, widthM: 1100, strikeDeg: 172, notched: true,
      geology: { strata: BEDS }, cover: { forest: [0, 70] }, name: 'the spine\'s foothills' },
    // east: Sveti Ilija, a long bare grey ridge with its summit a little south of the bay's axis, Pelješac's spine
    // running on north-west and south-east of it
    { kind: 'massif', at: { azDeg: 96, distM: 5200 }, heightM: 920, lengthM: 7400, widthM: 4200, strikeDeg: 166, name: 'Sveti Ilija',
      geology: { strata: BEDS, erosion: 0.7, gullies: 0.6, rockHex: 0xb4b0a4 }, cover: { forest: [0, 340] },
      peak: { along: 0.08, share: 0.34, asym: 1.3 } },
    { kind: 'ridge', at: { azDeg: 50, distM: 6200 }, heightM: 520, lengthM: 6400, widthM: 2800, strikeDeg: 150, notched: true,
      geology: { strata: BEDS, erosion: 0.7 }, cover: { forest: [0, 300] }, name: 'Pelješac\'s spine, north' },
    { kind: 'ridge', at: { azDeg: 142, distM: 6200 }, heightM: 500, lengthM: 6400, widthM: 2800, strikeDeg: 18, notched: true,
      geology: { strata: BEDS, erosion: 0.7 }, cover: { forest: [0, 300] }, name: 'Pelješac\'s spine, south' },
    // north and south: the terraced coastal slopes rising inland, broken into spurs and saddles
    { kind: 'ridge', at: { azDeg: 30, distM: 2000 }, heightM: 110, lengthM: 2400, widthM: 1100, strikeDeg: 112, notched: true,
      geology: { strata: BEDS }, cover: { forest: [0, 80] }, name: 'the north slopes' },
    { kind: 'ridge', at: { azDeg: 150, distM: 2000 }, heightM: 110, lengthM: 2400, widthM: 1100, strikeDeg: 68, notched: true,
      geology: { strata: BEDS }, cover: { forest: [0, 80] }, name: 'the south slopes' },
    // west, across the channel: the island's ridge from its far shore, several summits and cols along it
    { kind: 'ridge', at: { azDeg: 270, distM: 6000 }, heightM: 500, lengthM: 30000, widthM: 2800, strikeDeg: 2, notched: true,
      geology: { strata: BEDS, erosion: 0.7 }, cover: { forest: [0, 260] }, name: 'the island\'s ridge' },
    { kind: 'massif', at: { azDeg: 250, distM: 6600 }, heightM: 600, lengthM: 5200, widthM: 2600, strikeDeg: 8, name: 'the island\'s high summit',
      geology: { strata: BEDS, erosion: 0.7 }, cover: { forest: [0, 280] } },
    { kind: 'massif', at: { azDeg: 296, distM: 6600 }, heightM: 540, lengthM: 4600, widthM: 2400, strikeDeg: 176, name: 'the island\'s north summit',
      geology: { strata: BEDS, erosion: 0.7 }, cover: { forest: [0, 260] } },
    { kind: 'massif', at: { azDeg: 273, distM: 6300 }, heightM: 560, lengthM: 3800, widthM: 2200, strikeDeg: 4, name: 'the island\'s middle summit',
      geology: { strata: BEDS, erosion: 0.7 }, cover: { forest: [0, 260] }, peak: { along: -0.2, share: 0.3, asym: 1.4 } },
  ],
  water: [
    // the bay's mouth past the edge: its water carried out to the channel at its level
    { kind: 'lake', at: { azDeg: 270, distM: 720 }, radiusM: 440, level: -7.8, name: 'the bay mouth' },
    // the channel, its far shore at ~4.6 km (the ring's shoreM), the coast along it wandering
    { kind: 'sea', arc: { azDeg: [230, 310] }, coastM: 680, coastWanderM: 320, widthM: 3900, level: -7.8, name: 'the Pelješac channel' },
    // the open Adriatic past the island
    { kind: 'sea', arc: { azDeg: [230, 310] }, coastM: 9600, coastWanderM: 600, level: -7.8, name: 'the open Adriatic' },
    // coves along the coast north and south of the bay
    { kind: 'lake', at: { azDeg: 318, distM: 1500 }, radiusM: 330, level: -7.8, name: 'a cove north' },
    { kind: 'lake', at: { azDeg: 222, distM: 1500 }, radiusM: 330, level: -7.8, name: 'a cove south' },
  ],
  far: [
    // north up the channel: the mainland's ranges (Biokovo) far beyond its head
    { azDeg: [325, 35], distKm: [22, 40], reliefM: 1500, form: 'karstRidge', layers: 2, name: 'the mainland ranges, Biokovo' },
    // east, through the cols beside Sveti Ilija: the peninsula's spine running on and the mainland behind it
    { azDeg: [30, 160], distKm: [9, 22], reliefM: 700, form: 'karstRidge', layers: 1, name: 'the peninsula and the mainland behind' },
    // south down the channel: the island and the peninsula running on, lower, to the open sea
    { azDeg: [150, 230], distKm: [14, 26], reliefM: 450, form: 'karstRidge', layers: 1, name: 'the coasts running on south' },
  ],
  landmarks: [
    { kind: 'churchTower', at: { azDeg: 97, distM: 5150 }, heightM: 14, name: 'the chapel on Sveti Ilija' },
    { kind: 'lighthouse', at: { azDeg: 318, distM: 950 }, heightM: 14, name: 'the channel light on the north headland' },
  ],
};

export default DRAFT;
