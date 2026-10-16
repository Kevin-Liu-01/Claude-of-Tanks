// src/world/hinterland/drafts/badlands.ts — Redrock Divide's hinterland (the horizons stream, 2026-10-15; C-map-briefs
// §2), authored from the real place. The owner: "looks really bad"; the critics: "the background jebel walls are smooth
// grey cards", "a row of near-identical pale flat-topped mesas, like cardboard cut-outs".
//
// Wadi Rum, southern Jordan, 2008: a red sand valley between sheer sandstone jebels — Jebel Rum about 750 m over the
// 950 m floor — domed inselbergs, sand ramps banked against the walls, siqs. The battlefield is a reach of the valley:
// its own canyon benches (80-100 m) stand along the east and west edges, the floor runs out through the north and south
// mouths. So the east and west sides are the great walls behind the benches, broken by siqs with a jebel showing
// through each, and the mouths open onto the next sand valley with its jebels standing alone 2-8 km out, sky between.
// Redrock Divide ships it through its map file's switch (maps/badlands.ts `hinterland: true`); `?hinterland=0` draws the
// old ring.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'Wadi Rum, southern Jordan, 2008: a red sand valley between sheer fluted sandstone jebels with beehive-domed '
    + 'caps, sand ramps banked against their walls, siqs between them; the next valleys out through the mouths, their '
    + 'jebels standing alone on the sand; Bedouin camps and 4x4 tracks',
  region: 'wadiRum',
  landforms: [
    // east: the wall behind the canyon's benches, three jebels shoulder to shoulder 1.4-1.6 km out, 400-480 m, the
    // siqs between them showing the jebels behind
    { kind: 'jebel', at: { azDeg: 68, distM: 1550 }, heightM: 420, lengthM: 1900, widthM: 1150, strikeDeg: 160, name: 'Jebel um Ishrin north' },
    { kind: 'jebel', at: { azDeg: 94, distM: 1450 }, heightM: 480, lengthM: 1700, widthM: 1250, strikeDeg: 175, name: 'Jebel um Ishrin' },
    { kind: 'jebel', at: { azDeg: 120, distM: 1600 }, heightM: 400, lengthM: 1800, widthM: 1100, strikeDeg: 15, name: 'Jebel um Ishrin south' },
    { kind: 'jebel', at: { azDeg: 81, distM: 3300 }, heightM: 520, lengthM: 2000, widthM: 1400, strikeDeg: 165 },
    { kind: 'jebel', at: { azDeg: 107, distM: 3500 }, heightM: 500, lengthM: 1900, widthM: 1300, strikeDeg: 5 },
    // west: Jebel Rum's wall, the same way, a little higher
    { kind: 'jebel', at: { azDeg: 248, distM: 1550 }, heightM: 460, lengthM: 1800, widthM: 1200, strikeDeg: 340, name: 'Jebel Rum south' },
    { kind: 'jebel', at: { azDeg: 273, distM: 1450 }, heightM: 520, lengthM: 1800, widthM: 1300, strikeDeg: 355, name: 'Jebel Rum' },
    { kind: 'jebel', at: { azDeg: 298, distM: 1600 }, heightM: 440, lengthM: 1700, widthM: 1150, strikeDeg: 20, name: 'Jebel Rum north' },
    { kind: 'jebel', at: { azDeg: 261, distM: 3300 }, heightM: 560, lengthM: 2100, widthM: 1400, strikeDeg: 350 },
    { kind: 'jebel', at: { azDeg: 286, distM: 3500 }, heightM: 520, lengthM: 1900, widthM: 1300, strikeDeg: 10 },
    // the mouths: the valley's sand floor running on north and south (past the hand-over the land behind the canyon's
    // benches holds their ~150 m level; each mouth is cut down through it as a sand valley ~0.6 km across its floor
    // between stepped walls: a short cut whose end tapers in over 0.8-1.0 km, where the canyon's own floor ends, and a
    // long one past it, overlapping so the floor runs on)
    { kind: 'canyon', at: { azDeg: 0, distM: 2000 }, heightM: 160, lengthM: 2400, widthM: 2800, strikeDeg: 0, name: 'the north mouth' },
    { kind: 'canyon', at: { azDeg: 0, distM: 6600 }, heightM: 160, lengthM: 8000, widthM: 2800, strikeDeg: 0 },
    { kind: 'canyon', at: { azDeg: 180, distM: 2000 }, heightM: 160, lengthM: 2400, widthM: 2800, strikeDeg: 0, name: 'the south mouth' },
    { kind: 'canyon', at: { azDeg: 180, distM: 6600 }, heightM: 160, lengthM: 8000, widthM: 2800, strikeDeg: 0 },
    // north mouth: the next valley's jebels standing alone, sky between them
    { kind: 'jebel', at: { azDeg: 344, distM: 2700 }, heightM: 340, lengthM: 1300, widthM: 950, strikeDeg: 20 },
    { kind: 'inselberg', at: { azDeg: 8, distM: 2100 }, heightM: 120, lengthM: 600, widthM: 480, name: 'a domed inselberg' },
    { kind: 'jebel', at: { azDeg: 18, distM: 4000 }, heightM: 470, lengthM: 1600, widthM: 1200, strikeDeg: 40 },
    { kind: 'jebel', at: { azDeg: 352, distM: 6600 }, heightM: 600, lengthM: 2400, widthM: 1600, strikeDeg: 10 },
    { kind: 'jebel', at: { azDeg: 32, distM: 7700 }, heightM: 560, lengthM: 2200, widthM: 1500, strikeDeg: 60 },
    // south mouth: the same, toward the Disi side
    { kind: 'jebel', at: { azDeg: 168, distM: 2500 }, heightM: 330, lengthM: 1250, widthM: 950, strikeDeg: 170 },
    { kind: 'inselberg', at: { azDeg: 188, distM: 1900 }, heightM: 110, lengthM: 560, widthM: 460, name: 'a domed inselberg' },
    { kind: 'jebel', at: { azDeg: 196, distM: 4300 }, heightM: 500, lengthM: 1700, widthM: 1250, strikeDeg: 200 },
    { kind: 'jebel', at: { azDeg: 158, distM: 6900 }, heightM: 580, lengthM: 2300, widthM: 1600, strikeDeg: 150 },
    { kind: 'jebel', at: { azDeg: 212, distM: 7800 }, heightM: 540, lengthM: 2200, widthM: 1500, strikeDeg: 220 },
  ],
  // past the authored jebels the desert's own, fewer and farther (the brief: the next valley's jebels at 6-9 km)
  far: [
    { azDeg: [0, 360], distKm: [9, 18], reliefM: 620, form: 'jebels', layers: 1, name: 'the jebels of the next valleys' },
  ],
};

export default DRAFT;
