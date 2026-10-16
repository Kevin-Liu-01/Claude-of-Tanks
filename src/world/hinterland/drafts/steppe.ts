// src/world/hinterland/drafts/steppe.ts — Tarkhan Steppe's hinterland (the horizons stream, 2026-10-16; C-map-briefs §5),
// a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Drafted by `node tools/hinterland-draft.mjs --map=steppe --write` (four 32-37 m bumps from the old
// ring, the plain L0 far country) and authored to the real place.
//
// The Sary-Arka grain steppe at the Virgin Lands harvest of 1958 (north of Tselinograd): wheat and stubble on a plain
// that falls in long steps toward the Ishim. The brief's "standing there":
//   - south and east: wheat to a dead-flat horizon, broken only by verticals — a second sovkhoz's elevator, a
//     Rozhnovsky water tower at a brigade camp, the siding's tower out along the rail spur, the junction's elevator;
//   - north: the battlefield's own plateau edge with its kurgans, then the plateau, a long low swell 1.3-1.9 km out
//     with more kurgans along its crest, then the bald melkosopochnik hills — short rounded ranges and lone sopkas
//     6-9 km out, their summits and cols a broken line over the swell;
//   - west: the glare of a sor (a shallow salt lake) on the lowland, shelterbelts on the field edges.
// The brief's numbers (a 40-60 m swell at 1.1-1.4 km, hills 100-150 m at 5-9 km) put the hills under the swell's line
// (50 m at 1.25 km stands ~2.3° from the edge-n eye, 150 m at 7 km ~1.2°), so the swell is kept low (17-19 m, ~1.0°)
// and the hills stand 140-270 m (the melkosopochnik's own 100-300 m), 1.6-1.7° from edge-n, the far sector behind.
// The kurgans are landforms (low domes), not the `kurgan` vertical (drawn as a stone block). The settlement is the
// Virgin Lands' own: no old villages near — brigade field camps and machine yards on the tracks, a few farmsteads; the
// sovkhoz centres' elevators and water towers stand on the skyline as landmarks.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The Sary-Arka grain steppe at the 1958 Virgin Lands harvest: wheat and stubble to a flat horizon, a dry braided '
    + 'wadi, the low plateau edge with its kurgans to the north and the bald melkosopochnik hills far beyond it, sovkhoz '
    + 'elevators and Rozhnovsky water towers on the skyline, the rail spur east, a salt lake west, Barayev shelterbelts',
  region: 'forestSteppe',
  lab: true,
  outland: {
    // (the plain: a few metres of swell over kilometres, the frame left to the north's swell and the verticals)
    relief: { riseM: [2, 7], wavelengthM: 1600 },
    // (open wheat and stubble to the horizon; the woods only the Barayev belts on the field edges, no balka woods)
    woods: 0.03, hedges: 0.4, fields: 0.92, links: 2,
    // (no old villages near: the virgin lands were broken in 1954-56 — brigade field camps and machine yards on the tracks,
    // a few farmsteads; the sovkhoz centres stand far, their elevators and towers placed below)
    settle: { villages: 0, hamlets: 4, farms: 3, works: 2, town: null },
  },
  landforms: [
    // north: the plateau's long low swell, two broad lobes with the highway's saddle between them, 17-19 m (~1.0° from
    // the edge-n eye): no wall — the far hills stand over it
    { kind: 'ridge', at: { azDeg: 322, distM: 1650 }, heightM: 19, lengthM: 2400, widthM: 1100, strikeDeg: 78, name: 'the plateau swell, west' },
    { kind: 'ridge', at: { azDeg: 34, distM: 1800 }, heightM: 17, lengthM: 2400, widthM: 1100, strikeDeg: 104, name: 'the plateau swell, east' },
    // the kurgans on the swell's crest and the plateau (Bronze Age and Saka mounds, 6-9 m, 60-90 m across)
    { kind: 'inselberg', at: { azDeg: 348, distM: 1150 }, heightM: 7, lengthM: 70, widthM: 64, name: 'a kurgan' },
    { kind: 'inselberg', at: { azDeg: 326, distM: 1720 }, heightM: 9, lengthM: 90, widthM: 84, name: 'the great kurgan of the swell' },
    { kind: 'inselberg', at: { azDeg: 312, distM: 1880 }, heightM: 6, lengthM: 64, widthM: 60, name: 'a kurgan' },
    { kind: 'inselberg', at: { azDeg: 22, distM: 1420 }, heightM: 7, lengthM: 74, widthM: 66, name: 'a kurgan' },
    { kind: 'inselberg', at: { azDeg: 38, distM: 1900 }, heightM: 8, lengthM: 80, widthM: 76, name: 'a kurgan' },
    // the melkosopochnik 6-10 km north: bald rounded hills of granite and schist in short ranges and lone sopkas, their
    // summits and cols a low broken line over the swell (1.6-1.7° from edge-n), grass to their tops
    { kind: 'ridge', at: { azDeg: 314, distM: 7400 }, heightM: 230, lengthM: 4200, widthM: 2200, strikeDeg: 55, name: 'a bald range, north-west', cover: { bare: true } },
    { kind: 'ridge', at: { azDeg: 342, distM: 8600 }, heightM: 270, lengthM: 5200, widthM: 2600, strikeDeg: 92, name: 'the melkosopochnik', cover: { bare: true } },
    { kind: 'inselberg', at: { azDeg: 4, distM: 6600 }, heightM: 160, lengthM: 2000, widthM: 1600, name: 'a lone sopka' },
    { kind: 'ridge', at: { azDeg: 26, distM: 9200 }, heightM: 250, lengthM: 4600, widthM: 2400, strikeDeg: 112, name: 'a bald range, north-east', cover: { bare: true } },
    { kind: 'inselberg', at: { azDeg: 50, distM: 7000 }, heightM: 140, lengthM: 1800, widthM: 1500, name: 'a lone sopka' },
  ],
  water: [
    // west: a sor on the lowland, a shallow salt lake under a white crust margin (its glare the brief's)
    { kind: 'lake', at: { azDeg: 288, distM: 2700 }, radiusM: 520, name: 'the sor' },
  ],
  far: [
    // the plain all round, flat to the horizon (its belts the only skyline), and north the uplands behind the hills
    { azDeg: [0, 360], distKm: [3, 15], reliefM: 10, form: 'plain', layers: 0, name: 'the grain plain' },
    { azDeg: [296, 64], distKm: [10, 18], reliefM: 160, form: 'upland', layers: 1, name: 'the uplands behind the melkosopochnik' },
  ],
  landmarks: [
    // one elevator a side at most (the brief): the battlefield's grain station south-east, a second sovkhoz south, a
    // third west on the station road, the junction's north-east where the spur meets the main line; the water towers
    // at the brigade camp and the rail spur's siding
    // (the south one tall and near enough to stand over the belts from edge-s: 44 m at 2.7 km, ~0.9°)
    { kind: 'elevator', at: { azDeg: 196, distM: 2700 }, heightM: 44, name: 'the next sovkhoz\'s elevator, south' },
    { kind: 'elevator', at: { azDeg: 72, distM: 4200 }, heightM: 40, name: 'the junction station\'s elevator on the main line, north-east' },
    { kind: 'elevator', at: { azDeg: 264, distM: 4200 }, heightM: 32, name: 'the sovkhoz centre\'s elevator, west' },
    { kind: 'waterTower', at: { azDeg: 152, distM: 2100 }, heightM: 22, name: 'a Rozhnovsky tower at the brigade camp' },
    { kind: 'waterTower', at: { azDeg: 99, distM: 2900 }, heightM: 24, name: 'the siding\'s water tower on the rail spur' },
    { kind: 'waterTower', at: { azDeg: 258, distM: 4000 }, heightM: 24, name: 'the sovkhoz centre\'s water tower' },
  ],
  exceptions: {
    C1: 'the Sary-Arka plain is flat: its skyline is the low north swell, the belts and the verticals (Verdant\'s case)',
    C2: 'a flat grain plain: the outland rises a few metres; only the north swell stands',
    C6: 'south and east the plain runs flat to the horizon; the far hills stand north only (the brief)',
  },
};

export default DRAFT;
