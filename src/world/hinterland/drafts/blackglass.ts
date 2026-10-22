// src/world/hinterland/drafts/blackglass.ts — Suzhou Creek's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §8), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Shanghai in the 1937 battle: the creek between the International Settlement's banks and godowns
// (south) and Zhabei's lanes (north), North Station beyond; east down the creek to the Garden Bridge and the Bund at
// 2-4 km — its 1930s towers 50-85 m (the Park Hotel, Broadway Mansions, the Customs House's clock, Sassoon House's
// pyramid) — and the Huangpu; west mills with chimneys and concrete warehouses, then rice fields, creek villages, poplar
// rows and low hills in haze. The city carries on past the edge: lane roofs and godowns, never hedges or farms near.
// (Round 2's rim keys, horizons-owned: the battlefield's rim 36 -> 14 m, maps/blackglass.ts, so the city runs on.)
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'Shanghai, autumn 1937, on Suzhou Creek: the International Settlement\'s banks and godowns south, Zhabei\'s '
    + 'lane houses and North Station north, the Bund\'s Art Deco towers and the Huangpu east, mills, warehouses and the '
    + 'delta\'s rice fields west, low hills in the haze',
  region: 'yangtzeCity',
  lab: true,
  season: 'autumn',
  outland: {
    // the city near (lane roofs and godowns, no hedges or farms), the delta's fields only far west
    woods: 0.04, hedges: 0, fields: 0.15,
    settle: { villages: 3, hamlets: 3, farms: 0, works: 4, town: { azDeg: 160, distM: 1500, size: 'large', name: 'the International Settlement' } },
  },
  water: [
    // Suzhou Creek running on past both edges: east to its mouth at the Garden Bridge, west into the delta
    { kind: 'river', path: [{ azDeg: 80, distM: 525 }, { azDeg: 83, distM: 1209 }, { azDeg: 82.6, distM: 2017 }, { azDeg: 83.5, distM: 2920 }],
      widthM: 44, name: 'Suzhou Creek' },
    { kind: 'river', path: [{ azDeg: 265.5, distM: 515 }, { azDeg: 264.7, distM: 1305 }, { azDeg: 271.6, distM: 2201 }, { azDeg: 274.5, distM: 3310 }, { azDeg: 271.5, distM: 4602 }],
      widthM: 40, name: 'Suzhou Creek, west' },
    // the Huangpu along the Bund, the warships on it
    { kind: 'river', path: [{ azDeg: 51, distM: 4123 }, { azDeg: 70, distM: 3511 }, { azDeg: 84, distM: 3167 }, { azDeg: 105, distM: 3420 }, { azDeg: 122, distM: 4494 }],
      widthM: 400, name: 'the Huangpu' },
  ],
  far: [
    { azDeg: [0, 360], distKm: [6, 20], reliefM: 6, form: 'plain', layers: 0, name: 'the delta, flat to the horizon' },
    { azDeg: [235, 300], distKm: [24, 40], reliefM: 110, form: 'upland', layers: 1, name: 'the low hills west of the delta, in haze' },
  ],
  landmarks: [
    // the Bund as one silhouette group east, on the Huangpu's west bank by the creek's mouth
    { kind: 'decoTower', at: { azDeg: 81, distM: 2885 }, heightM: 78, name: 'Broadway Mansions' },
    { kind: 'pyramidTower', at: { azDeg: 91, distM: 2961 }, heightM: 77, name: 'Sassoon House' },
    { kind: 'clockTower', at: { azDeg: 95, distM: 2961 }, heightM: 79, name: 'the Customs House' },
    { kind: 'decoTower', at: { azDeg: 93, distM: 2990 }, heightM: 62, name: 'the Bank of China' },
    { kind: 'decoTower', at: { azDeg: 99.5, distM: 1521 }, heightM: 84, name: 'the Park Hotel' },
    // north: North Station's clock and Zhabei's water tanks
    { kind: 'clockTower', at: { azDeg: 352, distM: 2300 }, heightM: 42, name: 'North Station' },
    { kind: 'waterTower', at: { azDeg: 12, distM: 1300 }, name: 'a Zhabei water tank' },
    { kind: 'waterTower', at: { azDeg: 338, distM: 1700 }, name: 'a Zhabei water tank' },
    // west: the mills' chimneys along the creek
    { kind: 'chimney', at: { azDeg: 258, distM: 1500 }, heightM: 62, name: 'a cotton mill' },
    { kind: 'chimney', at: { azDeg: 268, distM: 2100 }, heightM: 70, name: 'a flour mill' },
    { kind: 'chimney', at: { azDeg: 284, distM: 1850 }, heightM: 55 },
    { kind: 'chimney', at: { azDeg: 298, distM: 2600 }, heightM: 60, name: 'a silk filature' },
    { kind: 'waterTower', at: { azDeg: 245, distM: 1700 }, name: 'a mill\'s water tank' },
  ],
  exceptions: { C6: 'The Yangtze delta is flat: the city\'s marks and the Bund carry the distance (the brief)' },
};

export default DRAFT;
