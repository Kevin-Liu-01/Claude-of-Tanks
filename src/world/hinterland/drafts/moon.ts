// src/world/hinterland/drafts/moon.ts — Earthrise Basin's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §15), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. A mode map. The draft from today's config gave ten 119–238 m ridge stubs at 1.1–1.3 km and a martian
// far country of tables (the brief's old stuff out: "the martian tables", "the vertical-sided pale slabs").
//
// Taurus-Littrow, December 1972 (Apollo 17): a flat-floored valley ~7 km wide between the South Massif (~2,300 m over
// the floor) and the North Massif (~2,000 m), its mouth opening west onto Mare Serenitatis; the hummocky Sculptured
// Hills to the north-east, the East Massif closing the valley's head, Family Mountain to the south-east between it and
// the South Massif. Standing on the floor (the brief):
//   - north and south: smooth rounded massifs, crisp in no air, their long faces at ~25°, their crests rolling into
//     several summits (no erosion, no gullies: the regolith's slopes are mass-wasted smooth);
//   - east: the Sculptured Hills' rounded knobs, the East Massif and Family Mountain behind them;
//   - west: the mare's near horizon ~3 km away (the Moon's small radius), crater rims on it, nothing beyond.
// No air and no settlement: nothing stands beyond the massifs (no far country), no village, no tree.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'Taurus-Littrow, December 1972 (Apollo 17): a flat-floored valley between the smooth North and South Massifs, '
    + 'the Sculptured Hills and the East Massif closing its head, Family Mountain south-east, its mouth opening west onto '
    + 'Mare Serenitatis; craters on the floor, boulder tracks down the massifs\' flanks',
  region: 'moon',
  lab: true,
  outland: {
    // (the valley floor and the mare: gently cratered, not swelling — the craters are landforms below)
    relief: { riseM: [6, 22], wavelengthM: 900 },
    woods: 0, hedges: 0, fields: 0, links: 0,
    settle: { villages: 0, hamlets: 0, farms: 0, works: 0, town: null },
  },
  landforms: [
    // the massifs: long rounded masses, their crests rolling into summits and saddles (ridges at low erosion: a dome
    // section, not an arête's pyramid), their toes ~2.5–3 km out, their crests 6–8 km out
    { kind: 'ridge', at: { azDeg: 358, distM: 6400 }, heightM: 2050, lengthM: 11000, widthM: 8400, strikeDeg: 84, name: 'the North Massif',
      geology: { erosion: 0.12, gullies: 0 } },
    { kind: 'ridge', at: { azDeg: 186, distM: 7800 }, heightM: 2350, lengthM: 11500, widthM: 9400, strikeDeg: 96, name: 'the South Massif',
      geology: { erosion: 0.12, gullies: 0 } },
    // Bear Mountain under the South Massif's west end, a lower rounded hill
    { kind: 'ridge', at: { azDeg: 226, distM: 5600 }, heightM: 700, lengthM: 3600, widthM: 3000, strikeDeg: 70, name: 'Bear Mountain',
      geology: { erosion: 0.1, gullies: 0 } },
    // north-east: the Sculptured Hills, hummocky rounded knobs (short low-erosion ridges: domed sections, not the
    // inselberg's steep-walled bornhardt)
    { kind: 'ridge', at: { azDeg: 50, distM: 7400 }, heightM: 900, lengthM: 4600, widthM: 3400, strikeDeg: 30, name: 'the Sculptured Hills',
      geology: { erosion: 0.08, gullies: 0 } },
    { kind: 'ridge', at: { azDeg: 68, distM: 9400 }, heightM: 1100, lengthM: 5200, widthM: 3800, strikeDeg: 60,
      geology: { erosion: 0.08, gullies: 0 } },
    { kind: 'ridge', at: { azDeg: 36, distM: 10600 }, heightM: 820, lengthM: 4400, widthM: 3200, strikeDeg: 10,
      geology: { erosion: 0.08, gullies: 0 } },
    { kind: 'ridge', at: { azDeg: 82, distM: 6900 }, heightM: 560, lengthM: 3400, widthM: 2600, strikeDeg: 100,
      geology: { erosion: 0.08, gullies: 0 } },
    // east: the East Massif closing the valley's head; south-east Family Mountain between it and the South Massif
    { kind: 'ridge', at: { azDeg: 102, distM: 12500 }, heightM: 1750, lengthM: 9000, widthM: 7600, strikeDeg: 18, name: 'the East Massif',
      geology: { erosion: 0.12, gullies: 0 } },
    { kind: 'ridge', at: { azDeg: 136, distM: 9800 }, heightM: 1150, lengthM: 5200, widthM: 4600, strikeDeg: 48, name: 'Family Mountain',
      geology: { erosion: 0.1, gullies: 0 } },
    // west: the mare falling below the near horizon (the Moon's curvature, ~4× the earth's: a point 10 km out stands ~20 m
    // lower than the earth's drop the projection applies; a broad trough across the west stands in for it)
    { kind: 'valley', at: { azDeg: 270, distM: 30500 }, heightM: 90, lengthM: 34000, widthM: 60000, strikeDeg: 0, name: 'the mare\'s fall below the horizon' },
    // craters on the floor and the mare past the edge: a raised rim round a bowl
    { kind: 'caldera', at: { azDeg: 288, distM: 1700 }, heightM: 14, lengthM: 760, widthM: 760, floor: 0, wall: 0.2, name: 'a crater\'s rim' },
    { kind: 'valley', at: { azDeg: 288, distM: 1700 }, heightM: 22, lengthM: 520, widthM: 520 },
    { kind: 'caldera', at: { azDeg: 252, distM: 2700 }, heightM: 20, lengthM: 1000, widthM: 1000, floor: 0, wall: 0.2, name: 'a crater\'s rim' },
    { kind: 'valley', at: { azDeg: 252, distM: 2700 }, heightM: 34, lengthM: 700, widthM: 700 },
    { kind: 'caldera', at: { azDeg: 296, distM: 3100 }, heightM: 12, lengthM: 560, widthM: 560, floor: 0, wall: 0.2 },
    { kind: 'valley', at: { azDeg: 296, distM: 3100 }, heightM: 18, lengthM: 380, widthM: 380 },
    { kind: 'caldera', at: { azDeg: 96, distM: 2300 }, heightM: 10, lengthM: 420, widthM: 420, floor: 0, wall: 0.2 },
    { kind: 'valley', at: { azDeg: 96, distM: 2300 }, heightM: 14, lengthM: 280, widthM: 280 },
  ],
  // (no air: nothing stands beyond the massifs, and nothing over the mare — the brief)
  far: [],
  exceptions: {
    C1: 'Taurus-Littrow is a valley between massifs 2,000–2,300 m over the floor 6–8 km out: a high skyline north and south is the place',
    C6: 'nothing stands beyond the massifs; the mare west has only its near horizon',
    C8: 'the Moon: no farmstead',
  },
};

export default DRAFT;
