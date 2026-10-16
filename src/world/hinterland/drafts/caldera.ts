// src/world/hinterland/drafts/caldera.ts — Obsidian Caldera's hinterland (HZ.20, the horizons stream, 2026-10-15;
// C-map-briefs §4), authored from the real place. The critics failed the ring at −1.00 (an incoherent story: a mesa
// ring, rolling relief and an upland far country; "smooth blue-grey forms with a bright green rim drawn along the
// crests"; the straight earth bank where the floor meets the wall), and the coordinator's keys for this item are
// (1) a tall, continuous caldera escarpment ringing the floor and (2) the central volcanic cones, seen from the floor.
//
// The Aso caldera, Kyushu, 2015: a farmed floor of about 18 x 25 km inside a continuous somma, its inner wall 300–600 m
// high, wooded below and grassy over its level top, notched where the Shirakawa leaves through the Tateno gorge in the
// west; the central cones — Naka-dake (active 2014–16) with its crater, Taka-dake and the jagged Neko-dake, Eboshi-dake,
// Kishima-dake and the little green cone of Komezuka — stand in a row across the caldera's middle. The battlefield is a
// piece of the northern floor (the Aso valley), so the rim stands 6–8 km out to the north, east and west, and south
// the cones stand 3–7 km out over the floor with the far rim behind them.
// Obsidian Caldera ships it through its map file's switch (maps/caldera.ts `hinterland: true`); `?hinterland=0` draws
// the old ring.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The Aso caldera, Kyushu, in 2015: a farmed floor of paddies, bunds and hamlets inside a continuous somma rim '
    + '300–600 m high, wooded below and grassy along its level top; the central cones (Naka-dake, active, with its '
    + 'crater; Taka-dake; the jagged Neko-dake; Eboshi-dake; Kishima-dake; the little green Komezuka) across its middle',
  region: 'volcanicCaldera',
  landforms: [
    // the somma: one continuous ring round the floor, its centre 2.5 km south of the map's (the battlefield lies on
    // the northern floor): the rim's crest ~6 km out to the north, ~7.9 km east and west and ~11 km south, 620 m over
    // the floor (about 6° from the middle of the map to the north, 4-5° east and west, 3° behind the cones); its inner
    // wall a steep face over its last ~1 km (wall 0.08: ~33°), wooded to 340 m, the grass over it to the crest; the
    // floor carried on level from the edge to the wall's foot (floor 0)
    { kind: 'caldera', at: { azDeg: 180, distM: 2500 }, heightM: 620, lengthM: 22000, widthM: 24000, strikeDeg: 90, floor: 0,
      wall: 0.08, name: 'the somma', cover: { forest: [0, 340] } },
    // the Tateno gorge: where the Shirakawa leaves the caldera through the western rim
    { kind: 'canyon', at: { azDeg: 254, distM: 7700 }, heightM: 420, lengthM: 3000, widthM: 900, strikeDeg: 74, name: 'the Tateno gorge' },
    // the central cones across the caldera's middle, south of the map, from east to west
    { kind: 'massif', at: { azDeg: 146, distM: 7200 }, heightM: 860, lengthM: 2600, widthM: 2000, strikeDeg: 40, name: 'Neko-dake',
      geology: { erosion: 0.95, gullies: 0.95, rockSlopeDeg: 30 }, cover: { forest: [0, 260] } },
    { kind: 'massif', at: { azDeg: 164, distM: 6400 }, heightM: 1000, lengthM: 3800, widthM: 3000, strikeDeg: 100, name: 'Taka-dake',
      geology: { erosion: 0.8, gullies: 0.85 }, cover: { forest: [0, 220] } },
    { kind: 'cone', at: { azDeg: 178, distM: 5800 }, heightM: 880, lengthM: 3400, name: 'Naka-dake', cover: { forest: [0, 160] } },
    { kind: 'massif', at: { azDeg: 197, distM: 5200 }, heightM: 620, lengthM: 2800, widthM: 2200, strikeDeg: 60, name: 'Eboshi-dake',
      cover: { forest: [0, 200] } },
    { kind: 'cone', at: { azDeg: 214, distM: 4600 }, heightM: 420, lengthM: 2300, name: 'Kishima-dake', cover: { forest: [0, 120] } },
    { kind: 'cone', at: { azDeg: 192, distM: 3300 }, heightM: 150, lengthM: 900, name: 'Komezuka' },
  ],
  // past the somma the outer slopes run down to the Kyushu uplands; nothing stands over the rim (the brief: Aso's
  // skyline is low and continuous)
  far: [
    { azDeg: [0, 360], distKm: [14, 36], reliefM: 420, form: 'upland', layers: 2, name: 'the Kyushu uplands past the somma' },
  ],
};

export default DRAFT;
