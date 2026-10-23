// src/world/hinterland/drafts/desert.ts — Sirocco Wadi's hinterland (the horizons stream, 2026-10-16; C-map-briefs §27),
// a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The ring is rated EXCELLENT, so the draft keeps what made it good (the brief's Keep: the mesa ring
// with its tables, the tabled far country standing over it, clear air, the arid farms, the wadi braids) and builds the
// real place round it.
//
// The eroded edge of the Dahar in southern Tunisia, 1985 (Tataouine, Chenini, Ghomrassen): wadis leave the sandstone-
// and-limestone cuesta between mesa outliers (gour) and braid across a sand basin toward the Jeffara and the coast; ksour
// stand at the crossings among draa and star dunes. Standing there: west, the cuesta itself, a ledged scarp ~360 m high
// ~3 km out running the whole west side (8-9° from edge-w, over the battlefield's own rim), the Wadi Sirocco leaving it
// through a gap with its ksar at the mouth, a Berber crest village's white mosque on the crest, the plateau running on
// west to the Dahar's dissected tables; in front of it and all round the basin the outliers, flat-capped mesas and buttes
// 1.45-2.4 km out (9-17° from the edge eyes, as the ring's tables stood) with sky between them; east, the last low
// outliers, then the Jeffara falling away toward the coast, a ghorfa ksar on its rise; north, mesas and two star dunes,
// the draa beyond; south, mesas; the caravan road running on to a ksar at its next crossing each way.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'The eroded edge of the Dahar in southern Tunisia, 1985: wadis leaving the ledged cuesta between flat-capped mesa '
    + 'outliers and braiding across a sand basin toward the Jeffara; ksour at the wadi crossings among draa and star '
    + 'dunes, a Berber crest village on the scarp, a ghorfa ksar on its rise, the caravan road running on',
  region: 'saharaOasis',
  lab: true,
  outland: {
    woods: 0.03, hedges: 0, fields: 0, links: 2,
    // the sand basin's own swell past the near band: low draa, not hills (the region's 20-60 m stood the basin up
    // round the battlefield as a rising plain)
    relief: { riseM: [8, 24], wavelengthM: 900 },
    settle: {
      villages: 4, hamlets: 2, farms: 4, works: 0, town: null,
      // the ksour at the crossings, each with its minaret: under the cuesta where the wadi leaves it, on the caravan
      // road's next crossings north and south, and the ghorfa ksar on its rise toward the Jeffara
      villagesAt: [
        { azDeg: 281, distM: 2300, name: 'the ksar at the wadi mouth', towerM: 30, buildings: 26 },
        { azDeg: 118, distM: 2300, name: 'the ghorfa ksar', towerM: 26, buildings: 24 },
        { azDeg: 4, distM: 2300, name: 'the ksar on the caravan road north', towerM: 28, buildings: 20 },
        { azDeg: 186, distM: 2500, name: 'the ksar on the caravan road south', towerM: 28, buildings: 20 },
      ],
    },
  },
  landforms: [
    // west: the Dahar cuesta, a ledged scarp ~360 m over the basin (the Dahar's crest near Chenini stands 300-400 m
    // over Tataouine's plain), its crest ~3.1 km out, running the whole west side from the south-west to the north-west
    // (strike 180: the plateau rises behind it to the west); its edge wanders in alcoves and spurs, its face ~600 m deep
    // (the CPU eyes: the battlefield's own rim stands ~6.7° from edge-w, so the crest must clear it)
    { kind: 'escarpment', at: { azDeg: 270, distM: 3000 }, heightM: 360, lengthM: 26000, widthM: 3000, strikeDeg: 180,
      name: 'the Dahar cuesta' },
    // the plateau's depth behind the crest: a second bed stair whose face stands inside the first's plateau (it rises
    // from the first's crest and tops out before the first's back falls), so the Dahar runs on west as one level table
    { kind: 'escarpment', at: { azDeg: 270, distM: 3915 }, heightM: 360, lengthM: 25000, widthM: 4800, strikeDeg: 180,
      name: 'the Dahar plateau' },
    // the gap where the Wadi Sirocco leaves the cuesta, and its bed carried on across the basin to the battlefield's edge
    { kind: 'notch', at: { azDeg: 281, distM: 3100 }, heightM: 75, lengthM: 2400, widthM: 900, strikeDeg: 92,
      name: 'the wadi gap in the cuesta' },
    { kind: 'valley', at: { azDeg: 274, distM: 2400 }, heightM: 7, lengthM: 5000, widthM: 220, strikeDeg: 91,
      name: 'the Wadi Sirocco, upstream' },
    // east: the Jeffara falling away toward the coast, and the wadi braiding out over its fan across it
    { kind: 'valley', at: { azDeg: 112, distM: 6500 }, heightM: 40, lengthM: 13000, widthM: 9000, strikeDeg: 112,
      name: 'the Jeffara\'s fall' },
    { kind: 'valley', at: { azDeg: 95, distM: 2700 }, heightM: 6, lengthM: 6000, widthM: 280, strikeDeg: 95,
      name: 'the Wadi Sirocco, downstream' },
    // north: two star dunes, the sirocco's sand heaped into pyramids with their arms (the battlefield's Erg Dune's kin)
    { kind: 'massif', at: { azDeg: 32, distM: 3100 }, heightM: 75, lengthM: 1700, widthM: 1400, strikeDeg: 37,
      peak: { along: 0.1, share: 0.5, asym: 1.4 }, geology: { rockHex: 0xd2b080, gullies: 0, erosion: 0.2 }, cover: { bare: true },
      name: 'a star dune' },
    { kind: 'massif', at: { azDeg: 336, distM: 3600 }, heightM: 60, lengthM: 1500, widthM: 1300, strikeDeg: 37,
      peak: { along: -0.2, share: 0.5, asym: 1.3 }, geology: { rockHex: 0xd2b080, gullies: 0, erosion: 0.2 }, cover: { bare: true },
      name: 'a star dune' },
    // the outliers: the mesa ring the ring had, as real gour — caprock tables on talus, standing apart
    { kind: 'mesa', at: { azDeg: 345, distM: 1550 }, heightM: 190, lengthM: 1300, widthM: 700, strikeDeg: 70, name: 'Gara Nord' },
    { kind: 'butte', at: { azDeg: 18, distM: 2400 }, heightM: 150, lengthM: 600, widthM: 450, strikeDeg: 20 },
    { kind: 'mesa', at: { azDeg: 48, distM: 1700 }, heightM: 120, lengthM: 900, widthM: 500, strikeDeg: 140 },
    { kind: 'butte', at: { azDeg: 75, distM: 1450 }, heightM: 95, lengthM: 500, widthM: 380, strikeDeg: 160 },
    // the ghorfa ksar's rise: a flat-topped hill the ksar stands on, over the Jeffara's first fall
    { kind: 'mesa', at: { azDeg: 118, distM: 2300 }, heightM: 70, lengthM: 650, widthM: 520, strikeDeg: 10, name: 'the ksar rise' },
    { kind: 'butte', at: { azDeg: 140, distM: 1550 }, heightM: 85, lengthM: 450, widthM: 350, strikeDeg: 60 },
    { kind: 'mesa', at: { azDeg: 160, distM: 1500 }, heightM: 200, lengthM: 900, widthM: 600, strikeDeg: 95, name: 'Gara Sud' },
    { kind: 'butte', at: { azDeg: 200, distM: 2300 }, heightM: 140, lengthM: 650, widthM: 480, strikeDeg: 120 },
    { kind: 'mesa', at: { azDeg: 222, distM: 1600 }, heightM: 170, lengthM: 1100, widthM: 650, strikeDeg: 140 },
    { kind: 'mesa', at: { azDeg: 240, distM: 1800 }, heightM: 160, lengthM: 900, widthM: 600, strikeDeg: 160 },
    // an outlier standing out in front of the scarp, lower than its crest
    { kind: 'butte', at: { azDeg: 254, distM: 2100 }, heightM: 120, lengthM: 600, widthM: 450, strikeDeg: 0 },
    { kind: 'mesa', at: { azDeg: 305, distM: 1700 }, heightM: 180, lengthM: 1200, widthM: 700, strikeDeg: 30 },
  ],
  far: [
    // past the plateau's depth the Dahar's dissected tables (the ring's 900 m tabled far country, kept in the west: its
    // tables stand at about the plateau's level, hidden from the basin behind the crest, a broken tableland from above)
    { azDeg: [205, 335], distKm: [6, 20], reliefM: 900, form: 'tables', layers: 1, name: 'the Dahar\'s dissected tables' },
    // north: the draa and star dunes; south: the Dahar's outliers standing far across the basin (the ring's tables)
    { azDeg: [335, 60], distKm: [4, 14], reliefM: 120, form: 'erg', layers: 0, name: 'the draa and star dunes north' },
    { azDeg: [140, 205], distKm: [6, 18], reliefM: 650, form: 'tables', layers: 1, name: 'the outliers south' },
    // east: the Jeffara falling toward the coast
    { azDeg: [60, 140], distKm: [5, 16], reliefM: 40, form: 'plain', layers: 0, name: 'the Jeffara' },
  ],
  landmarks: [
    { kind: 'minaret', at: { azDeg: 258, distM: 3200 }, heightM: 24, name: 'the crest village\'s white mosque' },
    { kind: 'mast', at: { azDeg: 300, distM: 5200 }, heightM: 55, name: 'the PTT relay on the Dahar' },
    { kind: 'pylonLine', from: 'exit:e', azDeg: 100, name: 'the line to the coast' },
  ],
};

export default DRAFT;
