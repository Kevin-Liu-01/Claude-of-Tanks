// src/world/hinterland/drafts/railyard.ts — Cinder Junction's hinterland (HOR-04, the horizons stream, 2026-10-16;
// C-map-briefs §28), a lab draft (lab: true) for a pair-judged migration like Verdant's. A Central European junction on
// the coalfield (the Ruhr, Upper Silesia) in 1962: the coalfield in every direction — winding towers at 1-5 km, coking-
// plant stacks, a hyperboloid cooling tower, colliery terraces and flat-topped tips, brick church towers and pylons, low
// hills under the haze; no range (the brief's keep: the upland at 160 m, "no range", its 13 summits; no smoke plumes).
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'A junction on the coalfield, 1962 (the Ruhr, Upper Silesia): winding towers and coking-plant stacks, a cooling '
    + 'tower, gasholders and a power station, colliery terraces and flat-topped tips, brick church towers and pylons, '
    + 'low hills under the haze',
  region: 'coalfield',
  lab: true,
  outland: { settle: { villages: 2, hamlets: 3, farms: 9, works: 2 } },
  landforms: [
    // the low hills: long swells round the coalfield, the tips standing on them
    { kind: 'ridge', at: { azDeg: 20, distM: 2400 }, heightM: 45, lengthM: 2600, widthM: 1200, strikeDeg: 110 },
    { kind: 'ridge', at: { azDeg: 140, distM: 2800 }, heightM: 40, lengthM: 2400, widthM: 1100, strikeDeg: 50 },
    { kind: 'ridge', at: { azDeg: 250, distM: 2600 }, heightM: 50, lengthM: 2800, widthM: 1200, strikeDeg: 160 },
    { kind: 'ridge', at: { azDeg: 320, distM: 3000 }, heightM: 42, lengthM: 2400, widthM: 1100, strikeDeg: 50 },
  ],
  far: [{ azDeg: [0, 360], distKm: [5, 16], reliefM: 160, form: 'upland', layers: 1, name: 'the coalfield\'s low hills' }],
  landmarks: [
    // the marks on every side (the brief): headframes at 1-5 km, the coking plant's stacks, the cooling tower, tips
    { kind: 'headframe', at: { azDeg: 32, distM: 1500 }, heightM: 48, name: 'Zeche Hugo shaft 2' },
    { kind: 'headframe', at: { azDeg: 118, distM: 2300 }, heightM: 42, name: 'a colliery\'s winding tower' },
    { kind: 'headframe', at: { azDeg: 212, distM: 1800 }, heightM: 52, name: 'a double-trestle headframe' },
    { kind: 'headframe', at: { azDeg: 298, distM: 3600 }, heightM: 44, name: 'a Malakoff tower' },
    { kind: 'coolingTower', at: { azDeg: 74, distM: 3200 }, name: 'the power station\'s cooling tower' },
    { kind: 'chimney', at: { azDeg: 80, distM: 3350 }, heightM: 110, name: 'the power station stack' },
    { kind: 'chimney', at: { azDeg: 168, distM: 2600 }, heightM: 85, name: 'the coking plant stacks' },
    { kind: 'chimney', at: { azDeg: 171, distM: 2650 }, heightM: 80 },
    { kind: 'slagTip', at: { azDeg: 196, distM: 3400 }, heightM: 55, name: 'a flat-topped tip' },
    { kind: 'slagTip', at: { azDeg: 338, distM: 2700 }, heightM: 48, name: 'a tip' },
    { kind: 'slagTip', at: { azDeg: 94, distM: 4600 }, heightM: 60 },
    { kind: 'churchTower', at: { azDeg: 262, distM: 2100 }, heightM: 52, name: 'the colony\'s brick church' },
    { kind: 'waterTower', at: { azDeg: 4, distM: 1200 }, name: 'the junction\'s water tower' },
    { kind: 'pylonLine', from: 'exit:s', azDeg: 196, name: 'the 220 kV line' },
  ],
  exceptions: { C6: 'The coalfield has no range: the marks and the tips carry the distance (the brief)' },
};

export default DRAFT;
