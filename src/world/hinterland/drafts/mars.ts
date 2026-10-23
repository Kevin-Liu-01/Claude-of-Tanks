// src/world/hinterland/drafts/mars.ts — Olympus Basin's hinterland (HOR-04, the horizons stream, 2026-10-16;
// C-map-briefs §16), a lab draft (lab: true) for a pair-judged migration. Invented: a rust-red impact basin and its
// research station under the galaxy sky (the owner: it stays); for the landforms a layered crater like Gale and Mount
// Sharp — a terraced crater rim continuous at 5-9 km, layered mesas and buttes at 1-4 km, dark dune fields, the
// station's masts and habitat domes.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'An invented Martian impact basin, 2100: a terraced crater rim all round 5-9 km out, layered mesas and buttes on '
    + 'the floor, dark dunes, the research station\'s masts and domes (the galaxy sky stays)',
  region: 'mars',
  lab: true,
  landforms: [
    // the crater's rim: one continuous ring, its crest 6-8 km out, ~700 m over the floor (8-10° from the station), its inner wall steep
    { kind: 'caldera', at: { azDeg: 30, distM: 900 }, heightM: 700, lengthM: 21000, widthM: 19000, strikeDeg: 60, floor: 0, wall: 0.14,
      name: 'the crater rim' },
    // layered mesas and buttes on the floor
    { kind: 'mesa', at: { azDeg: 12, distM: 2600 }, heightM: 140, lengthM: 1400, widthM: 900, strikeDeg: 70, name: 'a layered mesa' },
    { kind: 'butte', at: { azDeg: 58, distM: 1700 }, heightM: 90, lengthM: 500, widthM: 420, name: 'a butte' },
    { kind: 'mesa', at: { azDeg: 140, distM: 3300 }, heightM: 180, lengthM: 1800, widthM: 1100, strikeDeg: 20, name: 'a layered mesa' },
    { kind: 'butte', at: { azDeg: 205, distM: 2200 }, heightM: 110, lengthM: 600, widthM: 480, name: 'a butte' },
    { kind: 'mesa', at: { azDeg: 252, distM: 3800 }, heightM: 160, lengthM: 1600, widthM: 1000, strikeDeg: 150, name: 'a layered mesa' },
    { kind: 'butte', at: { azDeg: 318, distM: 1900 }, heightM: 80, lengthM: 450, widthM: 380, name: 'a butte' },
    // the central mound, Mount Sharp's analogue, stacked strata south of the station
    { kind: 'massif', at: { azDeg: 178, distM: 4600 }, heightM: 520, lengthM: 4200, widthM: 3400, strikeDeg: 80, name: 'the central mound',
      geology: { erosion: 0.6, gullies: 0.6 } },
  ],
  landmarks: [
    { kind: 'mast', at: { azDeg: 40, distM: 1100 }, heightM: 70, name: 'the station relay mast' },
    { kind: 'radome', at: { azDeg: 96, distM: 1300 }, name: 'a habitat dome' },
    { kind: 'radome', at: { azDeg: 104, distM: 1350 }, name: 'a habitat dome' },
  ],
  exceptions: { C6: 'A crater: the rim is the whole horizon; nothing stands past it under the galaxy sky' },
};

export default DRAFT;
