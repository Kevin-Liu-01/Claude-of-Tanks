// src/world/hinterland/drafts/frontier.ts — Frontier Basin's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §32), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Drafted from `node tools/hinterland-draft.mjs --map=frontier` (the ring's eight 18-116 m bumps at
// 1.1-1.4 km) and authored to the real place.
//
// The Fulda Gap's Hünfeld basin in eastern Hesse, 1984: a farming basin drained west to east by a small river between
// two wooded Buntsandstein ridges. Standing in it (the brief): north and south the wooded ridges, then more ridges
// behind them; east, where the river leaves, the valley opens on the Kuppenrhön's cone hills — the "Hessisches
// Kegelspiel", basalt knolls 150-260 m over the basin at 5-10 km — and on the far skyline the inner German border at
// 10-15 km; south-east the Rhön plateau at about 25 km; west, up the valley, Hünfeld itself.
// What the ring did well and this keeps (the brief's Keep): a rolling wooded frame at 3-6°, low rounded forested hills
// with no peaks, a dozen summits and more from every eye, farms and church villages. What is new: the frame is the real
// ridges at their distances — a near row of rounded Buntsandstein ridges 1.55-2.0 km out, their crests 100-140 m over the
// basin, broken by saddles where the row behind and the upland show — and it opens east where the river leaves, so the
// Kegelspiel stands in the gap (three or four of its summits at 3-3.7° from the edge eyes).
//   - the north and south ridges: four rounded wooded ridges a side, striking with the valley, staggered in distance so
//     their ends overlap as saddles, not one wall; two lower shoulders west, up the valley toward Hünfeld;
//   - the ridges behind: a second, higher row 3.7-4 km out showing through the saddles;
//   - the valley east and west: the floor kept low past the edge (the outland's swells and the knolls the old ring stood
//     on eased down in it) so the view runs out along the river;
//   - the Kegelspiel: eight wooded basalt Kuppen 6.4-10.4 km east-south-east on the Kuppenrhön's upland, of unequal
//     heights and sizes, the Soisberg the highest, grouped with cols between them (never one lone cone);
//   - the Rhön plateau south-east at 18-32 km, the upland all round behind (the ring's upland 260, no peaks);
//   - the marks: slate-spired church villages in the saddles and on the valley floor, Hünfeld up the valley, the 380 kV
//     line striding on out of both sides, Observation Post Alpha's tower on the border at 12 km.
// Not expressible in a draft: the border's cleared strip through the forest (a linear cover the Hinterland lacks).
import type { HinterlandConfig } from '../spec.ts';

/** The valley's strike (the river runs from the west edge at z ≈ +34 to the east edge at z ≈ −34). */
const VALLEY = 96;

const DRAFT: HinterlandConfig = {
  place: 'The Fulda Gap\'s Hünfeld basin in eastern Hesse, 1984: a farming basin drained west to east between two wooded '
    + 'Buntsandstein ridges, a village at the crossing, mills, estates and lynchets; the Kuppenrhön\'s cone hills (the '
    + '"Hessisches Kegelspiel") east where the river leaves, the inner German border beyond them, the Rhön south-east',
  region: 'centralUplands',
  lab: true,
  outland: {
    woods: 0.36, hedges: 0.6, fields: 0.6,
    // (the basin's farmland swells gently between the ridges: the region's 22-60 m hummocks would stand a second frame)
    relief: { riseM: [8, 26], wavelengthM: 1100 },
    settle: {
      villages: 4, hamlets: 3, farms: 10,
      // (slate-spired church villages at middle distance on the main sightlines: in the saddles of the ridge rows, on
      // the valley floor up- and downstream)
      villagesAt: [
        { azDeg: 352, distM: 1250, name: 'Michelsrombach', towerM: 38 },
        { azDeg: 186, distM: 1200, name: 'Mackenzell', towerM: 36 },
        { azDeg: 84, distM: 2300, name: 'Nüst', towerM: 34 },
        { azDeg: 276, distM: 2500, name: 'Großenbach', towerM: 36 },
      ],
      town: { azDeg: 268, distM: 4300, size: 'medium', name: 'Hünfeld' },
    },
  },
  landforms: [
    // the north ridges: rounded Buntsandstein ridges under spruce and beech, their crests rising and falling gently,
    // each overlapping the next at a saddle
    { kind: 'ridge', at: { azDeg: 318, distM: 1700 }, heightM: 64, lengthM: 2000, widthM: 950, strikeDeg: 62, name: 'the north-west ridge',
      cover: { forest: [8, 400] } },
    { kind: 'ridge', at: { azDeg: 350, distM: 1550 }, heightM: 66, lengthM: 2200, widthM: 1000, strikeDeg: 84, name: 'the north ridge',
      cover: { forest: [8, 400] } },
    { kind: 'ridge', at: { azDeg: 18, distM: 1650 }, heightM: 68, lengthM: 2300, widthM: 1050, strikeDeg: 102, name: 'the north ridge\'s east arm',
      cover: { forest: [8, 400] } },
    { kind: 'ridge', at: { azDeg: 46, distM: 1900 }, heightM: 60, lengthM: 1800, widthM: 900, strikeDeg: 128, name: 'the ridge end over the east gap',
      cover: { forest: [8, 400] } },
    // the south ridges (the battlefield's south ridge carried on, the same rounded forms)
    { kind: 'ridge', at: { azDeg: 148, distM: 1850 }, heightM: 62, lengthM: 1700, widthM: 900, strikeDeg: 60, name: 'the ridge end south of the east gap',
      cover: { forest: [8, 400] } },
    { kind: 'ridge', at: { azDeg: 168, distM: 1550 }, heightM: 68, lengthM: 2300, widthM: 1000, strikeDeg: 78, name: 'the south ridge',
      cover: { forest: [8, 400] } },
    { kind: 'ridge', at: { azDeg: 198, distM: 1650 }, heightM: 66, lengthM: 2200, widthM: 1000, strikeDeg: 104, name: 'the south ridge\'s west arm',
      cover: { forest: [8, 400] } },
    { kind: 'ridge', at: { azDeg: 230, distM: 1750 }, heightM: 60, lengthM: 2000, widthM: 950, strikeDeg: 128, name: 'the south-west ridge',
      cover: { forest: [8, 400] } },
    // west: the valley's low shoulders up toward Hünfeld
    { kind: 'ridge', at: { azDeg: 294, distM: 1950 }, heightM: 62, lengthM: 2000, widthM: 950, strikeDeg: 28, cover: { forest: [6, 400] } },
    { kind: 'ridge', at: { azDeg: 250, distM: 2000 }, heightM: 58, lengthM: 2000, widthM: 950, strikeDeg: 152, cover: { forest: [6, 400] } },
    // the ridges behind: a second, higher row through the saddles
    { kind: 'ridge', at: { azDeg: 2, distM: 3700 }, heightM: 155, lengthM: 4800, widthM: 1700, strikeDeg: 92, name: 'the ridges behind, north',
      cover: { forest: [10, 500] } },
    { kind: 'ridge', at: { azDeg: 322, distM: 4000 }, heightM: 140, lengthM: 3600, widthM: 1500, strikeDeg: 50, cover: { forest: [10, 500] } },
    { kind: 'ridge', at: { azDeg: 184, distM: 3700 }, heightM: 150, lengthM: 4800, widthM: 1700, strikeDeg: 90, name: 'the ridges behind, south',
      cover: { forest: [10, 500] } },
    { kind: 'ridge', at: { azDeg: 222, distM: 4000 }, heightM: 135, lengthM: 3600, widthM: 1500, strikeDeg: 130, cover: { forest: [10, 500] } },
    // the valley floor running on east and west: the outland's swells eased down along the river
    // (the river's trough carried on past the edge at its own level, so the eye on the east edge sees out along it)
    { kind: 'valley', at: { azDeg: 96, distM: 1300 }, heightM: 18, lengthM: 1700, widthM: 700, strikeDeg: VALLEY, name: 'the river leaving' },
    // (the knolls a kilometre out across the river's line — the old ring stood on them — eased down, so the floor runs
    // on toward the Kegelspiel)
    { kind: 'valley', at: { azDeg: 98, distM: 1700 }, heightM: 42, lengthM: 1500, widthM: 1700, strikeDeg: 98, name: 'the valley floor east' },
    { kind: 'valley', at: { azDeg: 106, distM: 4600 }, heightM: 55, lengthM: 7600, widthM: 3000, strikeDeg: 106, name: 'the valley east' },
    { kind: 'valley', at: { azDeg: 274, distM: 3000 }, heightM: 20, lengthM: 4400, widthM: 1300, strikeDeg: VALLEY, name: 'the valley west' },
    // the Kegelspiel: wooded basalt Kuppen east-south-east down the valley, unequal and grouped, the Soisberg the
    // highest (some 350 m over the basin in the real place)
    { kind: 'inselberg', at: { azDeg: 104, distM: 8800 }, heightM: 330, lengthM: 1900, widthM: 1600, name: 'the Soisberg', cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 112, distM: 6400 }, heightM: 240, lengthM: 1500, widthM: 1250, name: 'the Stallberg', cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 96, distM: 7300 }, heightM: 200, lengthM: 1300, widthM: 1100, cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 120, distM: 8200 }, heightM: 260, lengthM: 1600, widthM: 1300, cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 127, distM: 6800 }, heightM: 210, lengthM: 1300, widthM: 1050, cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 92, distM: 9600 }, heightM: 240, lengthM: 1400, widthM: 1150, cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 133, distM: 9600 }, heightM: 270, lengthM: 1700, widthM: 1400, cover: { forest: [0, 400] } },
    { kind: 'inselberg', at: { azDeg: 108, distM: 10400 }, heightM: 225, lengthM: 1500, widthM: 1200, cover: { forest: [0, 400] } },
  ],
  far: [
    { azDeg: [0, 360], distKm: [8, 20], reliefM: 260, form: 'upland', layers: 1, name: 'the Hessian uplands' },
    // (the Kuppenrhön: the Kegelspiel's cones stand on an upland a hundred-odd metres over the basin)
    { azDeg: [78, 140], distKm: [5.5, 12], reliefM: 170, form: 'upland', layers: 0, name: 'the Kuppenrhön' },
    { azDeg: [120, 170], distKm: [18, 32], reliefM: 620, form: 'upland', layers: 1, name: 'the Rhön plateau' },
  ],
  landmarks: [
    { kind: 'lookoutTower', at: { azDeg: 96, distM: 12000 }, heightM: 22, name: 'Observation Post Alpha' },
    // the battlefield's 380 kV line striding on out of both sides of the basin (its towers leave the square on these
    // bearings)
    { kind: 'pylonLine', from: 'edge', azDeg: 71, name: 'the 380 kV line east' },
    { kind: 'pylonLine', from: 'edge', azDeg: 251, name: 'the 380 kV line west' },
  ],
};

export default DRAFT;
