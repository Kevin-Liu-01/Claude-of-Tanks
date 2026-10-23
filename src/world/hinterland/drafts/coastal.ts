// src/world/hinterland/drafts/coastal.ts — Saltmere Bay's hinterland (the horizons stream, 2026-10-16; C-map-briefs §29),
// a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Drafted by `node tools/hinterland-draft.mjs --map=coastal --write` (five 45-78 m bumps from the old
// ring, the sea as one opening 300 m past the edge) and authored to the real place.
//
// The Pays de Léon around L'Aber Wrac'h, today: a turquoise bay behind a dune-backed strand, a whitewashed fishing
// village on the coast road, the bocage on rolling granite downs inland. The brief's "standing there":
//   - east: out of the bay mouth to the open sea, the Île Vierge light (82 m) on the sea horizon;
//   - north and south: the coast runs on past the corners, ragged with low granite headlands and coves, dunes behind
//     the strands;
//   - west: the low broad Léon plateau — bocage, hamlets, granite chapels and the openwork Léon spires (Plouguerneau,
//     Lannilis, Saint-Pabu) at 2.5-4 km — no range (the far country an upland of ~180 m, the brief's keep).
// The water: the battlefield's coves open at the edge into the bay mouth (a lake at the sea's level carries them past
// the red line: the sea's coast alone stood 300-600 m out and left a dry bed with a 25 m bank between it and the
// coves), and the sea past it runs as a coast, not a sector; four coves bitten into it north and south make the
// headlands between them (one sea's line alone ran straight north and south for 12 km). From edge-e the open sea
// spans ~80° between the two low headlands (1.3-2.2°), the light on its horizon at 0.9°. North, west and south the
// near band is the battlefield's own outland (its knolls 0.9-1.1 km out, as the ring stood): the spire villages stand
// where their spires clear it from the edge eyes and the spawn's chase view.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The Pays de Léon around L\'Aber Wrac\'h, today: a turquoise bay behind a dune-backed strand, a whitewashed '
    + 'fishing village on the coast road, the bocage of hedge banks and sunken lanes on rolling granite downs, granite '
    + 'chapels and the openwork Léon spires inland, the Île Vierge light on the sea horizon',
  region: 'bocage',
  lab: true,
  outland: {
    // (the downs: long low granite swells rising inland, not the region's 40 m knolls — the Léon plateau is broad)
    relief: { riseM: [8, 24], wavelengthM: 1200 },
    // (the talus hedge banks boxing small fields of cauliflower and artichoke; the woods only in the valley bottoms)
    woods: 0.16, hedges: 0.85, fields: 0.75, links: 3,
    settle: {
      villages: 5, hamlets: 18, farms: 9, works: 0, town: null,
      // the Léon spires on the sightlines west, north-west and south-west (landmarks at middle distance): each where
      // the downs' crests 0.9-1.1 km past the edge leave its spire clear from the north and north-west eyes and from the
      // spawn's chase view (Plouguerneau on its hill north-west, Lannilis far west on the plateau, Saint-Pabu south-west),
      // a chapel hamlet north and south along the coast
      villagesAt: [
        { azDeg: 325, distM: 2000, name: 'Plouguerneau', towerM: 56 },
        { azDeg: 262, distM: 3700, name: 'Lannilis', towerM: 60 },
        { azDeg: 240, distM: 2200, name: 'Saint-Pabu', towerM: 46 },
        { azDeg: 345, distM: 1550, name: 'Lilia', towerM: 34, buildings: 14 },
        { azDeg: 186, distM: 1600, name: 'Saint-Antoine', towerM: 32, buildings: 12 },
      ],
    },
  },
  landforms: [
    // the dunes behind the strands where the coast runs on past the corners (6-8 m, marram over sand)
    { kind: 'ridge', at: { azDeg: 41, distM: 900 }, heightM: 7, lengthM: 900, widthM: 200, strikeDeg: 352, name: 'the north dunes' },
    { kind: 'ridge', at: { azDeg: 136, distM: 820 }, heightM: 6, lengthM: 800, widthM: 180, strikeDeg: 188, name: 'the south dunes' },
  ],
  water: [
    // the bay mouth past the edge: the coves' water carried out to the sea at its level
    { kind: 'lake', at: { azDeg: 92, distM: 720 }, radiusM: 470, level: -4, name: 'the bay mouth' },
    // the open sea past a coast running north and south (the brief's 118° opening), its line wandering over kilometres
    { kind: 'sea', arc: { azDeg: [31, 149] }, coastM: 820, coastWanderM: 650, level: -4, name: 'the open sea off the Léon' },
    // the coves bitten into it north and south past the corners, the granite headlands standing between them
    { kind: 'lake', at: { azDeg: 31, distM: 1720 }, radiusM: 380, level: -4, name: 'a cove north' },
    { kind: 'lake', at: { azDeg: 18, distM: 3250 }, radiusM: 460, level: -4, name: 'a cove north' },
    { kind: 'lake', at: { azDeg: 152, distM: 1900 }, radiusM: 400, level: -4, name: 'a cove south' },
    { kind: 'lake', at: { azDeg: 163, distM: 3550 }, radiusM: 480, level: -4, name: 'a cove south' },
  ],
  far: [
    // the Léon plateau inland, low and broad (no range: the brief's upland 180), and a lower upland along the coast
    { azDeg: [195, 345], distKm: [4, 16], reliefM: 180, form: 'upland', layers: 1, name: 'the Léon plateau' },
    { azDeg: [0, 360], distKm: [4, 16], reliefM: 40, form: 'upland', layers: 0, name: 'the coastal downs' },
  ],
  landmarks: [
    // the Île Vierge light on the sea horizon north-east of the mouth (the granite island itself a sea cannot carry)
    { kind: 'lighthouse', at: { azDeg: 66, distM: 5200 }, heightM: 82, name: 'the Île Vierge light' },
  ],
  exceptions: {
    C1: 'a low coast: the east is open sea to the horizon over the brief\'s 118° opening; inland the plateau is low and broad',
    C2: 'the coast and the strand stand at the sea\'s level; only the downs inland rise',
  },
};

export default DRAFT;
