// src/world/hinterland/drafts/polders.ts — Tidegate Polders' hinterland, drafted by `node tools/hinterland-draft.mjs
// --map=polders --write` (2026-10-13) and edited to the real place (C-map-briefs §9).
//
// The draft from today's config gave the old ring's four 24–33 m bumps (its 0.18 amp: a 0.71° skyline, 0 summits, a
// 6 m outland — "a ring of stretched saw-tooth streaks, then a flat white void ... a disc floating in fog") and a plain
// far country. The real place is flat everywhere: the skyline is dykes with poplar and elm rows, church towers every
// 2–4 km, tower mills and farm roofs. So the bumps are gone and the frame is built from what stands on the polder:
//   - the polder's dykes boxing its fields past the edge, on the land-use grid's heading (about -14°), 3–4 m high, the
//     long ones with a road on the crown and poplars along it (the "frame of dykes and tree rows at least 17 m high");
//   - the sea dyke along the Westerschelde to the south (7 m), the estuary beyond it with its ships' channel;
//   - flooded Walcheren to the west: the island's sea dykes were breached in October 1944, so its low fields lie under
//     a sheet of water with roofs and trees standing in it, and Middelburg's Lange Jan (about 90 m) stands over the flood;
//   - the Oosterschelde far to the north;
//   - dyke villages along the roads with their church towers, farms round paved yards, tower mills on the dykes.
// The pilot (HZ.16, 2026-10-13): Tidegate Polders ships it through its map file's switch (maps/polders.ts
// `hinterland: true`); `?hinterland=0` draws the old ring.
import type { HinterlandConfig } from '../spec.ts';

/** The polder grid's heading (landUse.ts polders: -0.25 rad), as a compass strike for the dykes. */
const ALONG = 76; // the long dykes' strike (deg): the grid's u axis turned to a bearing
const ACROSS = ALONG + 90;

const DRAFT: HinterlandConfig = {
  place: 'The Scheldt polders, South Beveland and Walcheren, autumn 1944: clay fields boxed by dykes, roads on the dyke crowns, '
    + 'poplar windbreaks, farms round paved yards, church towers every few km; Walcheren flooded through its breached sea dykes',
  region: 'zeelandPolder',
  lab: true,
  // (the Battle of the Scheldt, October–November 1944: the crowns mostly bare, the last leaves brown-olive)
  season: 'lateAutumn',
  outland: {
    woods: 0.08, hedges: 0.6, fields: 0.85, links: 3,
    settle: {
      villages: 3, hamlets: 4, farms: 14, works: 0, town: null,
      // (the pilot's frames: a landmark at middle distance on every sightline — a dyke village with its church tower
      // within 1.5–2.2 km on the four edges' views, and a farther one on each diagonal)
      // (their towers clear the dyke poplars before them: the pilot's eye frames lost a 34 m tower behind the rows)
      villagesAt: [
        { azDeg: 352, distM: 1550, name: "'s-Heer Arendskerke", towerM: 48 }, { azDeg: 92, distM: 1750, name: 'Kapelle', towerM: 56 },
        { azDeg: 186, distM: 2050, name: 'Ellewoutsdijk', towerM: 46 }, { azDeg: 271, distM: 1650, name: 'Nisse', towerM: 50 },
        { azDeg: 42, distM: 2600, name: 'Wemeldinge', towerM: 52 }, { azDeg: 136, distM: 2500, name: 'Baarland', towerM: 48 },
        { azDeg: 222, distM: 2650, name: 'Borssele', towerM: 54 }, { azDeg: 316, distM: 2500, name: 'Wolphaartsdijk', towerM: 50 },
      ],
    },
  },
  landforms: [
    // the polder dykes past the edge (each a long low bank; the long ones carry a road and poplars on the crown)
    { kind: 'dike', at: { azDeg: 8, distM: 1050 }, heightM: 3.5, lengthM: 2600, widthM: 22, strikeDeg: ALONG, crown: { road: true, trees: 'poplar', widthM: 6 }, name: 'the north polder dyke' },
    { kind: 'dike', at: { azDeg: 22, distM: 2300 }, heightM: 3.2, lengthM: 3400, widthM: 22, strikeDeg: ALONG, crown: { road: true, trees: 'poplar', widthM: 6 } },
    { kind: 'dike', at: { azDeg: 95, distM: 1100 }, heightM: 3, lengthM: 2200, widthM: 20, strikeDeg: ACROSS, crown: { trees: 'poplar', widthM: 5 }, name: 'the east cross dyke' },
    { kind: 'dike', at: { azDeg: 120, distM: 2600 }, heightM: 3.4, lengthM: 3000, widthM: 22, strikeDeg: ACROSS, crown: { road: true, trees: 'oak', widthM: 6 } },
    { kind: 'dike', at: { azDeg: 170, distM: 1200 }, heightM: 3.2, lengthM: 2400, widthM: 22, strikeDeg: ALONG, crown: { road: true, trees: 'poplar', widthM: 6 }, name: 'the south polder dyke' },
    { kind: 'dike', at: { azDeg: 245, distM: 1150 }, heightM: 3, lengthM: 2000, widthM: 20, strikeDeg: ACROSS, crown: { trees: 'poplar', widthM: 5 } },
    { kind: 'dike', at: { azDeg: 300, distM: 1300 }, heightM: 3.6, lengthM: 2600, widthM: 24, strikeDeg: ACROSS, crown: { road: true, trees: 'poplar', widthM: 6 }, name: 'the Walcheren canal dyke' },
    { kind: 'dike', at: { azDeg: 335, distM: 2000 }, heightM: 3, lengthM: 2200, widthM: 20, strikeDeg: ALONG, crown: { trees: 'willow', widthM: 5 } },
    // the Westerschelde's sea dyke, the estuary's grassed bank against the tide
    { kind: 'dike', at: { azDeg: 180, distM: 3050 }, heightM: 7, lengthM: 9000, widthM: 46, strikeDeg: 82, crown: { road: true, widthM: 7 }, name: 'the Westerschelde sea dyke' },
  ],
  water: [
    // the estuary south of the sea dyke, Zeeuws-Vlaanderen's shore 4.5 km across it
    { kind: 'sea', arc: { azDeg: [172, 188] }, coastM: 3250, coastWanderM: 160, widthM: 4500, level: -0.5, name: 'the Westerschelde' },
    // Walcheren past the canal, under the October flood: its low fields a sheet of water, the higher ground standing out
    { kind: 'flood', arc: { azDeg: [266, 278] }, coastM: 2300, level: 1.2, name: 'flooded Walcheren' },
    // the Oosterschelde to the north, Schouwen-Duiveland across it
    { kind: 'sea', arc: { azDeg: [6, 22] }, coastM: 6200, coastWanderM: 500, widthM: 5200, level: -0.5, name: 'the Oosterschelde' },
    { kind: 'canal', path: [{ azDeg: 286, distM: 620 }, { azDeg: 284, distM: 2200 }, { azDeg: 282, distM: 5200 }], widthM: 40, level: -0.6, name: 'the Kanaal door Walcheren' },
  ],
  far: [{ azDeg: [0, 360], distKm: [4, 15], reliefM: 4, form: 'plain', layers: 0 }],
  landmarks: [
    { kind: 'churchTower', at: { azDeg: 266, distM: 7600 }, heightM: 90, name: 'Lange Jan, Middelburg' },
    { kind: 'churchTower', at: { azDeg: 58, distM: 4800 }, heightM: 52, name: 'the Grote Kerk tower, Goes' },
    { kind: 'lighthouse', at: { azDeg: 238, distM: 9800 }, heightM: 48, name: 'the Vlissingen lights' },
    { kind: 'pylonLine', from: 'exit:e', azDeg: 96, name: 'the 150 kV line from the old land to the new' },
  ],
  exceptions: {
    C1: 'Zeeland is flat: the skyline is dykes with poplar rows, tower mills and church towers, not land',
    C2: 'a flat polder: the frame is its dykes and their trees',
    C3: 'the dykes past the edge form the skyline inside 1 km on the bearings where no tower stands',
    C6: 'Zeeland is flat to the horizon: no far layer stands over the dykes; the towers and rows carry the distance',
    C9: 'the polder lies below its dykes: rimH 18 is the dyke',
  },
};

export default DRAFT;
