// src/world/hinterland/drafts/titan_gorge.ts — Titan Gorge's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §11), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. The ring's 12.25° wall (p90 17.3°) hid its own jebels; the critics read its backdrop as "steep,
// pointed, blue-tinted alpine peaks". The real place is the opposite: an open plain with the skyline low.
//
// Monument Valley in the Oljato chapter, 1965: a sandy floor of sage and juniper with dry washes, the buttes standing
// free on it as the eroded outliers of the stepped De Chelly escarpments — each a flat cap of sandstone over a sheer
// wall ~200 m high on a concave talus of Organ Rock shale a third of its height. Standing there, on every side past the
// West and East Shelf cliffs the skyline is low (1-3°) and the buttes and mesas stand proud of it 2-8 km out with sky
// between them: north-east the Mittens and Merrick Butte, north the lone buttes down the valley (Brigham's Tomb, the
// Stagecoach, Eagle Mesa), east Rain God and Thunderbird Mesas, south Hunts Mesa's long rim with a butte standing in the
// valley's mouth before it and Agathla's volcanic neck far off at about 1°, south-west Mitchell Butte in the gap between
// Mitchell and Sentinel Mesas, west Sentinel Mesa and Oljato Mesa with
// Goulding's trading post at its foot; hogan camps on the floor. (The battlefield's own outland carries the old border's
// hills 100-160 m high 0.6-1.3 km past the edge; the troughs below take their crowns down so the plain reads low.)
import type { HinterlandConfig } from '../spec.ts';

/** The De Chelly sandstone's red over the talus (the region's), the volcanic neck's dark breccia. */
const AGATHLA_ROCK = 0x4c3e37;

const DRAFT: HinterlandConfig = {
  place: 'Monument Valley in the Oljato chapter, 1965: a sandy floor of sage, juniper and dry washes, flat-capped sheer-walled '
    + 'buttes and mesas standing free on it over their talus with sky between them (the Mittens, Merrick Butte, Hunts and '
    + 'Oljato Mesas), Agathla\'s volcanic neck far off, hogan camps and Goulding\'s trading post',
  region: 'coloradoPlateau',
  lab: true,
  outland: {
    woods: 0.02, hedges: 0, fields: 0, links: 2,
    // the valley floor: sand and sage over low swells, washes between (the region's 20-60 m stood a ring of hills)
    relief: { riseM: [6, 22], wavelengthM: 1100 },
    settle: {
      villages: 1, hamlets: 2, farms: 6, works: 0, town: null,
      villagesAt: [{ azDeg: 262, distM: 3600, name: 'Goulding\'s trading post', buildings: 14 }],
    },
  },
  landforms: [
    // north-east: the Mittens and Merrick Butte, the valley's own view (each Mitten a block with its slim thumb outboard)
    { kind: 'butte', at: { azDeg: 35, distM: 3200 }, heightM: 290, lengthM: 900, widthM: 560, strikeDeg: 10, name: 'West Mitten Butte' },
    { kind: 'butte', at: { azDeg: 31, distM: 3420 }, heightM: 275, lengthM: 150, widthM: 120, strikeDeg: 0, name: 'West Mitten\'s thumb' },
    { kind: 'butte', at: { azDeg: 50, distM: 3600 }, heightM: 285, lengthM: 860, widthM: 540, strikeDeg: 20, name: 'East Mitten Butte' },
    { kind: 'butte', at: { azDeg: 54, distM: 3820 }, heightM: 270, lengthM: 150, widthM: 120, strikeDeg: 0, name: 'East Mitten\'s thumb' },
    { kind: 'butte', at: { azDeg: 63, distM: 3000 }, heightM: 260, lengthM: 1000, widthM: 600, strikeDeg: 120, name: 'Merrick Butte' },
    // north: the lone buttes down the valley, Eagle Mesa beyond
    { kind: 'butte', at: { azDeg: 8, distM: 4600 }, heightM: 230, lengthM: 700, widthM: 480, strikeDeg: 40, name: 'Brigham\'s Tomb' },
    { kind: 'butte', at: { azDeg: 334, distM: 3400 }, heightM: 190, lengthM: 620, widthM: 380, strikeDeg: 70, name: 'the Stagecoach' },
    { kind: 'mesa', at: { azDeg: 350, distM: 6800 }, heightM: 280, lengthM: 1900, widthM: 1000, strikeDeg: 10, name: 'Eagle Mesa' },
    // east: Rain God and Thunderbird Mesas, Spearhead Mesa's long table behind
    { kind: 'mesa', at: { azDeg: 104, distM: 4200 }, heightM: 260, lengthM: 1800, widthM: 900, strikeDeg: 30, name: 'Rain God Mesa' },
    { kind: 'mesa', at: { azDeg: 128, distM: 3500 }, heightM: 220, lengthM: 1300, widthM: 700, strikeDeg: 70, name: 'Thunderbird Mesa' },
    { kind: 'mesa', at: { azDeg: 88, distM: 7200 }, heightM: 320, lengthM: 4200, widthM: 1600, strikeDeg: 0, name: 'Spearhead Mesa' },
    // south: the valley's mouth between two mesas, a butte standing in it, Hunts Mesa's rim behind
    { kind: 'mesa', at: { azDeg: 150, distM: 3200 }, heightM: 300, lengthM: 1700, widthM: 900, strikeDeg: 100, name: 'the mesa east of the mouth' },
    { kind: 'mesa', at: { azDeg: 215, distM: 3500 }, heightM: 320, lengthM: 2000, widthM: 1000, strikeDeg: 80, name: 'Mitchell Mesa' },
    { kind: 'butte', at: { azDeg: 180, distM: 4000 }, heightM: 300, lengthM: 760, widthM: 520, strikeDeg: 90, name: 'the butte in the mouth' },
    // south-west: Mitchell Butte off Mitchell Mesa's tip, end-on in the gap between it and Sentinel Mesa — the butte the
    // south edge's chase camera sees framed (the 54 m rim in front of that camera hides the mouth's butte at 180°, and the
    // edge's own ground is low on 220-250°, where the battlefield's wash leaves: the butte's wall stands 3.7° over the rim
    // there on 232-234° from (0, -442); the coordinator's ruling 2026-10-16: Titan keeps rim 54, the butte moves in the draft)
    { kind: 'butte', at: { azDeg: 228.6, distM: 4580 }, heightM: 300, lengthM: 760, widthM: 480, strikeDeg: 53, name: 'Mitchell Butte' },
    { kind: 'mesa', at: { azDeg: 172, distM: 9500 }, heightM: 400, lengthM: 7000, widthM: 2600, strikeDeg: 95, name: 'Hunts Mesa' },
    { kind: 'massif', at: { azDeg: 197, distM: 22000 }, heightM: 460, lengthM: 1900, widthM: 1500, strikeDeg: 30, name: 'Agathla Peak',
      peak: { along: 0.15, share: 0.55, asym: 1.5, gendarme: true }, geology: { rockHex: AGATHLA_ROCK, erosion: 0.95, gullies: 0.7 },
      cover: { bare: true } },
    // west: Sentinel Mesa near, Oljato Mesa's long wall with Goulding's below it
    { kind: 'mesa', at: { azDeg: 240, distM: 3000 }, heightM: 280, lengthM: 1500, widthM: 800, strikeDeg: 160, name: 'Sentinel Mesa' },
    { kind: 'mesa', at: { azDeg: 280, distM: 5600 }, heightM: 330, lengthM: 6000, widthM: 2400, strikeDeg: 5, name: 'Oljato Mesa' },
    { kind: 'butte', at: { azDeg: 305, distM: 3300 }, heightM: 200, lengthM: 650, widthM: 420, strikeDeg: 150, name: 'King on his Throne' },
    // the near frame lowered (the brief: the ring's amp toward 1.0-1.3, with mouths): the battlefield's own outland
    // carries the old border's hills 100-160 m high 0.6-1.3 km past the edge, lumps that stood 5-11° from the edge eyes
    // and hid the buttes; broad troughs over that band take their crowns down toward the plain's level — the valley's
    // mouths north and south (55 m at their axes ~900 m past the edge, under 10 m at the square's own near band), the
    // north-east corner on the Mittens' sightline, and a gentler cut past each shelf; each ends inside the band, so the
    // plain beyond keeps its level
    { kind: 'valley', at: { azDeg: 0, distM: 1400 }, heightM: 55, lengthM: 3000, widthM: 1300, strikeDeg: 90, name: 'the north mouth' },
    { kind: 'valley', at: { azDeg: 180, distM: 1400 }, heightM: 45, lengthM: 3000, widthM: 1300, strikeDeg: 90, name: 'the south mouth' },
    { kind: 'valley', at: { azDeg: 45, distM: 1750 }, heightM: 50, lengthM: 2400, widthM: 1200, strikeDeg: 135, name: 'toward the Mittens' },
    { kind: 'valley', at: { azDeg: 90, distM: 1400 }, heightM: 55, lengthM: 3000, widthM: 1300, strikeDeg: 0, name: 'past the East Shelf' },
    { kind: 'valley', at: { azDeg: 270, distM: 1400 }, heightM: 50, lengthM: 3000, widthM: 1300, strikeDeg: 0, name: 'past the West Shelf' },
    // (one spike of that band, ~150 m and 200 m across, stood straight in the south mouth before the edge-s eye)
    { kind: 'valley', at: { azDeg: 182.5, distM: 1151 }, heightM: 105, lengthM: 380, widthM: 420, strikeDeg: 0, name: 'the spike in the south mouth' },
    // (and the near band's lump in that gap, ~1.7 km on the camera's sightline, taken down like the mouths')
    { kind: 'valley', at: { azDeg: 223.7, distM: 2000 }, heightM: 50, lengthM: 1800, widthM: 900, strikeDeg: 54, name: 'the gap toward Mitchell Butte' },
    // the washes leaving the valley north and south (the battlefield's own wash, carried on)
    { kind: 'valley', at: { azDeg: 2, distM: 2400 }, heightM: 5, lengthM: 4000, widthM: 200, strikeDeg: 4, name: 'the wash north' },
    { kind: 'valley', at: { azDeg: 182, distM: 2400 }, heightM: 5, lengthM: 4000, widthM: 200, strikeDeg: 4, name: 'the wash south' },
  ],
  far: [
    // past the buttes the plateau's own tables, low on every side (Cedar Mesa, Hoskininni, Black Mesa)
    { azDeg: [0, 360], distKm: [11, 30], reliefM: 450, form: 'tables', layers: 1, name: 'the Colorado Plateau\'s tables' },
  ],
  exceptions: {
    C9: 'the valley floor stands between its West and East Shelf cliffs: rimH 54 is the map\'s own',
  },
};

export default DRAFT;
