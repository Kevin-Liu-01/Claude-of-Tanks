// src/world/hinterland/drafts/fjord.ts — Nordhavn Fjord's hinterland (the horizons stream, 2026-10-16; C-map-briefs §25),
// a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Drafted by `node tools/hinterland-draft.mjs --map=fjord --write` (twelve 300 m massif bumps from the
// old ring, the arms' two sea openings, the alpine far country) and authored to the real place.
//
// Bjerkvik at the head of the Herjangsfjord, Ofoten, May 1940: the harbour on its terraces at the fjord's head, painted
// timber houses on the shore, the mountains straight up from the water. The brief's "standing there":
//   - east: the three arms join past the red line and run out as one fjord between its walls to the Ofotfjord, the
//     Narvik peaks on its far shore 10-13 km out (1,150-1,270 m), snow down to ~400 m in May;
//   - north, west and south: birch-clad shoulders straight up from the shore terraces (150-180 m at 1.5 km), and over
//     them the mountain walls 3.3-3.5 km out, ~1,050 m: long gneiss walls with level serrated crests, a summit block and
//     its gendarme on each, couloirs and a headwall on the face toward the head, the May snow over ~380 m (the ring's
//     `massif: false` aiguilles kept as crests, not domes); at the corners their ends fall to cols where the side
//     valleys run up, and the snow peaks behind (1,200-1,250 m at 5.6 km) stand in them.
// The brief's keep: the aiguilles, the gneiss ribs and outcrops, the arms and their single mouth, the summits (the ring
// counted 20 from the centre; this 26), the far country standing over the near frame (the walls' crests 10-12° over the
// shoulders' 8-9° from the centre, the summits 15-16°), the low sun. A high near frame is the place (C1-C3). From edge-e
// the fjord opens ~40° between its walls, the Narvik peaks 3.5-4.7° on its far shore.
import type { HinterlandConfig } from '../spec.ts';

/** The May snow on the peaks (the region's 450 m line a little lower on the shaded high faces). */
const MAY = { snow: { lineM: 380 }, erosion: 0.9, gullies: 0.85 } as const;
/** The near walls: birch to ~300 m, the gneiss bare on the steep, the crests sharp. */
const WALL = { erosion: 0.85, gullies: 0.75 } as const;

const DRAFT: HinterlandConfig = {
  place: 'Bjerkvik at the head of the Herjangsfjord, Ofoten, in May 1940: painted timber houses and boathouses on the shore '
    + 'terraces, birch slopes straight up from the water to serrated gneiss crests, snow peaks behind, the fjord running '
    + 'out to the Ofotfjord and the Narvik peaks',
  region: 'fjord',
  lab: true,
  season: 'spring',
  outland: {
    woods: 0.44, hedges: 0.05, fields: 0.12, links: 2,
    settle: {
      villages: 1, hamlets: 3, farms: 8, works: 0, town: null,
      // (the white timber church of the next settlement along the fjord's north shore, its slim pale tower read against
      // the birch from the north, east and west edges and the centre)
      villagesAt: [{ azDeg: 45, distM: 1050, name: 'the white church on the fjord shore', towerM: 26, buildings: 10, slim: true }],
    },
  },
  landforms: [
    // the birch shoulders off the shore terraces, 1.5 km out: 150-180 m, notched gneiss knolls, the foot of the walls
    { kind: 'ridge', at: { azDeg: 354, distM: 1500 }, heightM: 160, lengthM: 2600, widthM: 1100, strikeDeg: 84, notched: true,
      geology: WALL, cover: { forest: [0, 200] }, name: 'the north shoulder' },
    { kind: 'ridge', at: { azDeg: 268, distM: 1550 }, heightM: 180, lengthM: 2600, widthM: 1100, strikeDeg: 176, notched: true,
      geology: WALL, cover: { forest: [0, 200] }, name: 'the west shoulder' },
    { kind: 'ridge', at: { azDeg: 184, distM: 1500 }, heightM: 160, lengthM: 2600, widthM: 1100, strikeDeg: 94, notched: true,
      geology: WALL, cover: { forest: [0, 200] }, name: 'the south shoulder' },
    // the mountain walls straight up from the shore, north, west and south, 3.3-3.5 km out: long gneiss walls ~1,050-
    // 1,100 m with their crests level and serrated (the ring's aiguilles: several summits and cols along each, a gendarme
    // by the main summit), birch to ~300 m, the May snow over ~380 m, a headwall and snow couloirs on the face toward the
    // head; their ends overlap at the corners in low cols where the side valleys run up
    { kind: 'massif', at: { azDeg: 352, distM: 3300 }, heightM: 1050, lengthM: 6400, widthM: 3200, strikeDeg: 84, name: 'the north wall',
      geology: MAY, cover: { forest: [0, 300] }, peak: { along: -0.15, share: 0.18, asym: 1.4, gendarme: true, tent: false },
      headwall: { heightM: 140 }, couloirs: 4 },
    { kind: 'massif', at: { azDeg: 272, distM: 3450 }, heightM: 1060, lengthM: 6800, widthM: 3200, strikeDeg: 178, name: 'the west wall',
      geology: MAY, cover: { forest: [0, 300] }, peak: { along: 0.2, share: 0.18, asym: 1.5, gendarme: true, tent: false },
      headwall: { heightM: 160 }, couloirs: 4 },
    { kind: 'massif', at: { azDeg: 188, distM: 3300 }, heightM: 1050, lengthM: 6400, widthM: 3200, strikeDeg: 96, name: 'the south wall',
      geology: MAY, cover: { forest: [0, 300] }, peak: { along: -0.25, share: 0.18, asym: 1.4, gendarme: true, tent: false },
      headwall: { heightM: 140 }, couloirs: 4 },
    // the fjord's walls east of the head, straight up from the water on both sides
    { kind: 'massif', at: { azDeg: 46, distM: 2900 }, heightM: 760, lengthM: 4800, widthM: 2500, strikeDeg: 98, name: 'the fjord\'s north wall',
      geology: MAY, cover: { forest: [0, 300] }, peak: { along: 0.3, share: 0.24, asym: 1.3, tent: false } },
    { kind: 'massif', at: { azDeg: 134, distM: 2900 }, heightM: 780, lengthM: 4800, widthM: 2500, strikeDeg: 82, name: 'the fjord\'s south wall',
      geology: MAY, cover: { forest: [0, 300] }, peak: { along: -0.3, share: 0.24, asym: 1.3, gendarme: true, tent: false } },
    // the snow peaks behind the walls' cols at the corners, 5-6 km
    { kind: 'massif', at: { azDeg: 314, distM: 5600 }, heightM: 1250, lengthM: 4200, widthM: 3200, strikeDeg: 44, name: 'the north-west peaks',
      geology: MAY, cover: { forest: [0, 300] } },
    { kind: 'massif', at: { azDeg: 228, distM: 5600 }, heightM: 1200, lengthM: 4200, widthM: 3200, strikeDeg: 136, name: 'the south-west peaks',
      geology: MAY, cover: { forest: [0, 300] } },
    // east across the Ofotfjord: the Narvik peaks on its far shore
    { kind: 'massif', at: { azDeg: 82, distM: 12600 }, heightM: 1230, lengthM: 5200, widthM: 3400, strikeDeg: 170, name: 'Rombakstøtta',
      geology: MAY, cover: { forest: [0, 330] }, peak: { along: 0.2, share: 0.32, asym: 1.4 } },
    { kind: 'massif', at: { azDeg: 96, distM: 11800 }, heightM: 1270, lengthM: 5400, widthM: 3400, strikeDeg: 6, name: 'Fagernesfjellet',
      geology: MAY, cover: { forest: [0, 330] }, peak: { along: -0.1, share: 0.32, asym: 1.5, gendarme: true } },
    { kind: 'massif', at: { azDeg: 110, distM: 12700 }, heightM: 1150, lengthM: 5000, widthM: 3200, strikeDeg: 20, name: 'the Beisfjord peaks',
      geology: MAY, cover: { forest: [0, 330] }, peak: { along: 0.3, share: 0.3, asym: 1.3 } },
  ],
  water: [
    // the three arms carried past the red line into their junction (lakes at the arms' level), the fjord running out
    // east between its walls, and the Ofotfjord across its mouth
    { kind: 'lake', at: { azDeg: 72, distM: 740 }, radiusM: 300, level: -8.2, name: 'the north arm' },
    { kind: 'lake', at: { azDeg: 100, distM: 720 }, radiusM: 320, level: -8.2, name: 'the south arm' },
    { kind: 'lake', at: { azDeg: 88, distM: 1150 }, radiusM: 480, level: -8.2, name: 'the arms\' junction' },
    { kind: 'lake', at: { azDeg: 89, distM: 1850 }, radiusM: 640, level: -8.2, name: 'the Herjangsfjord' },
    { kind: 'lake', at: { azDeg: 90, distM: 2700 }, radiusM: 700, level: -8.2 },
    { kind: 'lake', at: { azDeg: 91, distM: 3600 }, radiusM: 720, level: -8.2 },
    { kind: 'lake', at: { azDeg: 92, distM: 4500 }, radiusM: 740, level: -8.2 },
    { kind: 'lake', at: { azDeg: 92, distM: 5400 }, radiusM: 760, level: -8.2 },
    { kind: 'lake', at: { azDeg: 92, distM: 6300 }, radiusM: 800, level: -8.2 },
    { kind: 'sea', arc: { azDeg: [60, 120] }, coastM: 7000, coastWanderM: 500, widthM: 3600, level: -8.2, name: 'the Ofotfjord' },
  ],
  far: [
    // the alpine country behind the peaks (the ring's far layer), seen at their cols and out of the fjord, in layers
    { azDeg: [0, 360], distKm: [16, 30], reliefM: 1500, form: 'alpine', layers: 2, name: 'Ofoten\'s mountains' },
    // east past Narvik: the border mountains toward Sweden
    { azDeg: [60, 130], distKm: [18, 34], reliefM: 1500, form: 'alpine', layers: 2, name: 'the border mountains past Narvik' },
  ],
  exceptions: {
    C1: 'a fjord head: the mountains rise straight from the shore 300-550 m within 2 km and 1,000-1,200 m within 5 km (the place)',
    C2: 'the near walls stand over the shore terraces within 1 km of the edge',
    C3: 'the walls stand the near skyline on the north, west and south; the snow peaks and the far country stand over them at their cols',
  },
};

export default DRAFT;
