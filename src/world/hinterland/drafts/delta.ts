// src/world/hinterland/drafts/delta.ts — Jade River Delta's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §7), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The braided Jamuna in Bangladesh, 2010: channels that split and rejoin round sand chars, a market
// village on the char, homesteads (bari) on mounds above the flood line, bunded paddies round them, palm, bamboo and
// mango clumps round the yards.
//
// Standing there (the brief): flat on every side, so the skyline is tree islands, each bari's clump layered at 0.5–3 km;
// north-east and south-west the river: sand bars and open water; on the far flats the brick-field kilns' chimneys, the
// region's commonest vertical, a mosque's minaret, the 2010 telecom masts. A delta has no swell: nothing stands over
// its horizon that the place lacks — the generated draft's four 30–47 m ridges (the old ring's summits) are gone, the
// far country is the plain with its homestead tree lines.
//   - the map's own channel running on past both corners, the north-east one and its 180° turn about the char
//     (the map's rotation), each joining a main channel of the braid belt 2.5–3.5 km out, which carries on to the
//     horizon with a second braid splitting from it: the open water and the chars between the channels;
//   - the flood embankments on both sides of the braid belt, 3 km out (the Brahmaputra Right Embankment's kind): a
//     4.5 m bank with a road on its crown and its planted acacia, the frame's longest line;
//   - the homesteads: dispersed hamlets and lone baris on the flats, the villages' brick fields beside them;
//   - the marks at middle distance: each village's and works' brick-field chimney (the planner's; no extra ones
//     authored, its far band already stands one every few km), a bazaar mosque's minaret, telecom masts, a 230 kV line.
// The CPU proof (skyline.mjs, eye 5.5 m): every edge and corner eye's skyline 0.2–0.7° (the tree lines at 1.5–4.5 km),
// nothing proud of it but the marks; corner-ne looks down the char channel leaving, its skyline lowest there (0.3° at
// az 40, the open water and the Jamuna beyond at 2.6 km); corner-sw over the hamlets at 1.2–2 km to the south-west
// channel; SPAWN-alpha looking north: the tree lines 0.3–0.46° at 3–5 km, a works' chimney (36 m, 1.65 km) and the
// telecom mast (48 m, 2.5 km) standing 0.8–0.9° over them, the char village's chimney north-west.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The braided Jamuna in Bangladesh, 2010: channels splitting round sand chars, a market village on the char, '
    + 'homesteads on mounds above the flood line, bunded paddies, palm and bamboo clumps round the yards, brick-field '
    + 'chimneys and the flood embankments on the flats',
  region: 'bengalDelta',
  lab: true,
  outland: {
    woods: 0.24, hedges: 0.25, fields: 0.65,
    settle: {
      villages: 3, hamlets: 16, farms: 10, works: 2, town: null,
      // the market villages on the sightlines, each with its brick field's chimney (the region's settlement vertical)
      villagesAt: [
        { azDeg: 320, distM: 1700, name: 'a bari village on the char', towerM: 34 },
        { azDeg: 140, distM: 1900, name: 'a bari village south-east', towerM: 36 },
        { azDeg: 268, distM: 2400, name: 'a market village west', towerM: 32 },
      ],
    },
  },
  landforms: [
    // the flood embankments either side of the braid belt (a road on the crown, its planted acacia)
    { kind: 'dike', at: { azDeg: 315, distM: 3000 }, heightM: 4.5, lengthM: 6000, widthM: 40, strikeDeg: 45,
      crown: { road: true, trees: 'acacia', widthM: 6 }, name: 'the west flood embankment' },
    { kind: 'dike', at: { azDeg: 135, distM: 3000 }, heightM: 4.5, lengthM: 6000, widthM: 40, strikeDeg: 45,
      crown: { road: true, trees: 'acacia', widthM: 6 }, name: 'the east flood embankment' },
  ],
  water: [
    // north-east: the map's channel running on from its corner into the main channel, and the braid splitting from it
    { kind: 'river', path: [{ azDeg: 45, distM: 740 }, { azDeg: 46.4, distM: 1450 }, { azDeg: 47.6, distM: 2301 }, { azDeg: 50, distM: 3265 }],
      widthM: 150, name: 'the char channel, north-east' },
    { kind: 'river', path: [{ azDeg: 3.3, distM: 5209 }, { azDeg: 14.4, distM: 4026 }, { azDeg: 31.3, distM: 3276 }, { azDeg: 50, distM: 3265 },
      { azDeg: 70.1, distM: 3828 }, { azDeg: 82.3, distM: 5247 }, { azDeg: 88.5, distM: 7503 }], widthM: 850, name: 'the Jamuna' },
    { kind: 'river', path: [{ azDeg: 31.3, distM: 3276 }, { azDeg: 37.6, distM: 4420 }, { azDeg: 42.9, distM: 5873 }, { azDeg: 46, distM: 8062 }],
      widthM: 320, name: 'a braid of the Jamuna, north-east' },
    // south-west: the same, turned through 180° about the char (the map's own rotation)
    { kind: 'river', path: [{ azDeg: 225, distM: 740 }, { azDeg: 226.4, distM: 1450 }, { azDeg: 227.6, distM: 2301 }, { azDeg: 230, distM: 3265 }],
      widthM: 150, name: 'the char channel, south-west' },
    { kind: 'river', path: [{ azDeg: 183.3, distM: 5209 }, { azDeg: 194.4, distM: 4026 }, { azDeg: 211.3, distM: 3276 }, { azDeg: 230, distM: 3265 },
      { azDeg: 250.1, distM: 3828 }, { azDeg: 262.3, distM: 5247 }, { azDeg: 268.5, distM: 7503 }], widthM: 850, name: 'the Jamuna, south-west' },
    { kind: 'river', path: [{ azDeg: 211.3, distM: 3276 }, { azDeg: 217.6, distM: 4420 }, { azDeg: 222.9, distM: 5873 }, { azDeg: 226, distM: 8062 }],
      widthM: 320, name: 'a braid of the Jamuna, south-west' },
  ],
  far: [{ azDeg: [0, 360], distKm: [5, 16], reliefM: 3, form: 'plain', layers: 0, name: 'the floodplain and its homestead tree lines' }],
  landmarks: [
    // a bazaar mosque's minaret, north-west and south-east
    { kind: 'minaret', at: { azDeg: 302, distM: 2600 }, heightM: 30, name: 'the bazaar mosque' },
    { kind: 'minaret', at: { azDeg: 128, distM: 3400 }, heightM: 26, name: 'a village mosque' },
    // the 2010 telecom masts
    { kind: 'mast', at: { azDeg: 352, distM: 2100 }, heightM: 48, name: 'a telecom mast' },
    { kind: 'mast', at: { azDeg: 196, distM: 2300 }, heightM: 45, name: 'a telecom mast' },
    { kind: 'mast', at: { azDeg: 284, distM: 4300 }, heightM: 55 },
    { kind: 'pylonLine', from: 'exit:e', azDeg: 118, name: 'the 230 kV line' },
  ],
  exceptions: {
    C1: 'the Jamuna floodplain is flat: its skyline is the homesteads\' tree clumps and the embankments, under 1.7°',
    C2: 'a delta has no swell: the outland stays within a few metres of the char',
    C6: 'the delta is flat to the horizon: no far layer stands over the tree lines; the kilns, minarets and masts carry the distance',
    C7: 'the pre-monsoon humid haze over the river (fog .00076)',
  },
};

export default DRAFT;
