// src/world/hinterland/drafts/mangrove.ts — Mangrove Reach's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §6), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The shrimp coast of Cà Mau at the Mekong Delta's tip, 2012: tidal creeks fringed with mangrove,
// square ponds boxed by earth bunds, stilt hamlets on the levee roads and the canals, cheniers a few metres proud.
//
// Standing there (the brief): flat, so objects make the skyline. Seaward (east, past the tidal spine) the mangrove
// stands in stepped walls at 0.7, 1.0 and 1.3 km; inland (west) the bunds, the nipa and coconut lines on the cheniers,
// the stilt houses and a pagoda's roof; the steel telecom masts and the power pylons are 2012's true verticals. Nothing
// stands over its horizon that the place lacks: the generated draft's four 21–30 m ridges (the old ring's summits) are
// gone, and the far country is the plain with its tree-line islands.
//   - east: three mangrove belts on the creek banks (each a mud bank under a row: the pond-side fringe at 0.7 km, the
//     tidal creek's bank at 1.0 km, the forest's edge behind the creek at 1.3 km), the tidal river beyond at 2.2 km, the East Sea's coast at 6 km;
//   - west: two cheniers with their coconut lines (0.9 and 2.1 km), the straight kênh west and a cross canal at 1.5 km,
//     the stilt hamlets on them, the pagoda;
//   - the region's woods (the coast's mangrove and the bunds' palms) and the ponds' bund grid all round;
//   - the marks: each stilt hamlet's telecom mast, the pagoda, a 110 kV line west;
//   - two open stretches cleared of the region's woods (bare landforms 0.3 m high): the ponds and flats east of the
//     spine, where only the mangrove belts stand, and the shrimp ponds south-west before the levee road's hamlet.
// The CPU proof (skyline.mjs and the plan's tree tops, eyes on the battlefield's ground): every eye's land skyline
// 0.1–0.5° (the tree-line islands at 1.6–5 km), nothing proud of it but the masts; edge-e (its eye on the 11 m terrace)
// over the pond-side fringe at 0.27 km (6–8 m crowns, just under eye level), the creek belt at 0.56 km (0.5°) and the
// forest's edge behind it (0.3° at 0.9–1.3 km); corner-sw over the open ponds to the stilt hamlet at 0.92 km, its trees
// ~1°, its mast 2.7°; SPAWN-alpha looking north-east: the tree lines 0.4–0.8° at 1–1.6 km.
// (the rows' species: a draft names a row's trees by species and the outland plants a willow row as pollards 5–8 m
// high, which near the edge the map's impostor atlas draws in its tidal-mangrove form — the pond-side fringe; the two
// creek belts name 'acacia' (broad crowns 8–15 m) — not in this map's atlas, so near the edge they are drawn from the
// map's rim mix, its tidal mangrove for the most part, at that stature: the taller Rhizophora wall behind the fringe)
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The shrimp coast of Cà Mau at the Mekong Delta\'s tip, 2012: tidal creeks fringed with mangrove, square ponds '
    + 'boxed by earth bunds, stilt hamlets on the levee roads and canals, cheniers with their coconut lines, telecom masts',
  region: 'mekongMangrove',
  lab: true,
  outland: {
    woods: 0.4, hedges: 0, fields: 0.3,
    settle: {
      villages: 3, hamlets: 6, farms: 6, works: 0, town: null,
      // the stilt hamlets on the sightlines west, each with its telecom mast (the region's settlement vertical)
      villagesAt: [
        { azDeg: 282, distM: 1600, name: 'a stilt hamlet on the kênh', towerM: 42 },
        { azDeg: 228, distM: 1500, name: 'a stilt hamlet on the levee road', towerM: 45 },
        { azDeg: 320, distM: 2100, name: 'a stilt hamlet on the cross canal', towerM: 50 },
      ],
    },
  },
  landforms: [
    // east: the ponds and tidal flats between the spine and the creek, open (no palm or eucalyptus stand on them: the
    // region's woods are the bunds' trees, so here only the mangrove belts below stand, the walls the brief steps)
    { kind: 'ridge', at: { azDeg: 90, distM: 1050 }, heightM: 0.3, lengthM: 3600, widthM: 1000, strikeDeg: 0,
      cover: { bare: true }, name: 'the ponds and flats east of the spine' },
    // east: the mangrove belts on their mud banks, stepped back from the ponds to the creek
    { kind: 'dike', at: { azDeg: 90, distM: 700 }, heightM: 0.6, lengthM: 2600, widthM: 14, strikeDeg: 0,
      crown: { trees: 'willow', widthM: 4 }, name: 'the pond-side mangrove fringe' },
    { kind: 'dike', at: { azDeg: 90, distM: 990 }, heightM: 0.8, lengthM: 3200, widthM: 16, strikeDeg: 2,
      crown: { trees: 'acacia', widthM: 5 }, name: 'the mangrove on the creek\'s west bank' },
    { kind: 'dike', at: { azDeg: 90, distM: 1300 }, heightM: 1, lengthM: 3600, widthM: 18, strikeDeg: 178,
      crown: { trees: 'acacia', widthM: 5 }, name: 'the mangrove forest behind the creek' },
    // south-west: the shrimp ponds open before the levee road's stilt hamlet (corner-sw's proof: ponds and a stilt
    // hamlet; the woods on the bunds stood a 2° wall 100–300 m past the corner that hid the hamlet but for its mast)
    { kind: 'ridge', at: { azDeg: 232, distM: 1000 }, heightM: 0.3, lengthM: 1500, widthM: 900, strikeDeg: 142,
      cover: { bare: true }, name: 'the shrimp ponds south-west' },
    // west: the cheniers, old beach ridges a few metres proud, their coconut lines on the crown
    { kind: 'dike', at: { azDeg: 270, distM: 900 }, heightM: 2.2, lengthM: 3200, widthM: 70, strikeDeg: 8,
      crown: { trees: 'palm', widthM: 24 }, name: 'the near chenier' },
    { kind: 'dike', at: { azDeg: 278, distM: 2100 }, heightM: 2.6, lengthM: 3000, widthM: 80, strikeDeg: 12,
      crown: { road: true, trees: 'palm', widthM: 26 }, name: 'the far chenier and its road' },
  ],
  water: [
    // east: the tidal creek between the belts, the tidal river beyond, the East Sea
    { kind: 'river', path: [{ azDeg: 161.7, distM: 3371 }, { azDeg: 149, distM: 2099 }, { azDeg: 119.7, distM: 1209 }, { azDeg: 60.7, distM: 1227 },
      { azDeg: 28.7, distM: 2166 }, { azDeg: 18.3, distM: 3371 }], widthM: 70, name: 'the tidal creek east' },
    { kind: 'river', path: [{ azDeg: 160.3, distM: 6374 }, { azDeg: 146.7, distM: 4188 }, { azDeg: 119.2, distM: 2462 }, { azDeg: 66, distM: 2462 },
      { azDeg: 32.5, distM: 3912 }, { azDeg: 20.6, distM: 6408 }], widthM: 420, name: 'the tidal river' },
    { kind: 'sea', arc: { azDeg: [60, 120] }, coastM: 6000, coastWanderM: 500, level: -0.5, name: 'the East Sea' },
    // west: the straight kênh from the west edge and the cross canal
    { kind: 'canal', path: [{ azDeg: 253.9, distM: 541 }, { azDeg: 265.7, distM: 2006 }, { azDeg: 267.9, distM: 4003 }, { azDeg: 268.6, distM: 6002 }],
      widthM: 28, name: 'the kênh west' },
    { kind: 'canal', path: [{ azDeg: 200.6, distM: 4272 }, { azDeg: 225, distM: 2121 }, { azDeg: 315, distM: 2121 }, { azDeg: 339.4, distM: 4272 }],
      widthM: 22, name: 'the cross canal' },
  ],
  far: [{ azDeg: [0, 360], distKm: [5, 16], reliefM: 2, form: 'plain', layers: 0, name: 'the delta\'s tree-line islands' }],
  landmarks: [
    { kind: 'pagoda', at: { azDeg: 262, distM: 2300 }, heightM: 18, name: 'the hamlet pagoda' },
    { kind: 'pylonLine', from: 'exit:w', azDeg: 292, name: 'the 110 kV line' },
  ],
  exceptions: {
    C1: 'the Cà Mau coast is flat: its skyline is the mangrove belts and the coconut lines, under 1.7°',
    C2: 'a tidal coast has no swell: the outland stays within a metre or two of the tide',
    C6: 'flat to the horizon: no far layer stands over the tree lines; the masts and the pagoda carry the distance',
    C9: 'the coast lies at the tide: its 18 m rim is the levees and the old terraces',
  },
};

export default DRAFT;
