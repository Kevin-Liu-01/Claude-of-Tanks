// src/world/hinterland/drafts/autumn.ts — Amberford's hinterland (the horizons stream, 2026-10-16; C-map-briefs §14), a
// lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this strictly
// better. Drafted from `node tools/hinterland-draft.mjs --map=autumn` (the ring's five 13-77 m bumps at 1.2-1.4 km, a
// generic "German central uplands" place line) and authored to the real place.
//
// The Moselle valley between Pont-à-Mousson and Metz, autumn 1944, where the Third Army crossed at Dornot and Arnaville
// under the Metz forts (the Lorraine landing, `fdcf013f9`; the map file's header still says "Norman / English": its
// rewrite is the map's own item). A market town above its stone bridge, the river south-west to north-east down a
// floodplain of poplars and meadows, mirabelle orchards, street villages of the maison lorraine. Standing there (the
// brief): east, the wooded côte — the Côtes de Moselle, a limestone cuesta 120-180 m high at 1-3 km, cut by dry combes
// — with a Metz fort's grassed casemates on its crest; west, the valley floor, poplars, the river running on and the
// opposite côte; north and south, street villages every 2-3 km, square towers under slate spires.
//   - the côte: four escarpments on the valley's south-east side 1.75-2.6 km out (kept off the river's line down the
//     valley), their wooded faces some 150 m over the floor (5-8° from the east edge and the spawn), the limestone
//     plateau behind, three dry combes notched into it; Fort Driant's grassed casemates on its brow east;
//   - the opposite côte: the same cuesta on the valley's north-west side, 3.6-4.3 km out, low in the haze (2-2.5°);
//   - the valley running on: the floodplain carried on past both edges along the river (a shallow trough past the
//     knolls the outland rises over), the Moselle itself on along its low ground — upstream 3.5 km toward Arnaville,
//     downstream a kilometre toward Metz;
//   - the street villages up and down the valley and at the côtes' feet, each with its tower; Metz's cathedral tower
//     far down the valley; Lorraine's forested côtes behind (the far upland, over 150 m).
// Not expressible in a draft: the lorrain building kit (the map has none on main, so the outland's houses take the
// default render-and-tile palette), a château in its park, the Roman aqueduct's arches at Jouy.
import type { HinterlandConfig } from '../spec.ts';

/** The Côtes de Moselle's Bajocian limestone: pale, thin ledges under the brow. */
const LIMESTONE = { rock: 'limestone' as const, rockHex: 0xc4b89c, strata: { bedM: 16, dipDeg: 2, contrast: 0.1 } };
/** A cuesta's face toward the valley from bearing `azDeg` (its plateau behind, away from the centre). */
const cote = (azDeg: number, distM: number, heightM: number, lengthM: number, name?: string) => ({
  kind: 'escarpment' as const, at: { azDeg, distM }, heightM, lengthM, widthM: 2800, strikeDeg: azDeg - 90,
  geology: LIMESTONE, cover: { forest: [0, 400] as const }, ...(name ? { name } : {}),
});
/** A dry combe notched into the côte on its bearing. */
const combe = (azDeg: number, widthM: number) => ({
  kind: 'notch' as const, at: { azDeg, distM: 2600 }, heightM: 90, lengthM: 2400, widthM, strikeDeg: azDeg,
});
/** The floodplain carried on along the river: a long shallow trough, and a deeper one over a knoll on its line. */
const floodplain = (azDeg: number, distM: number, heightM: number, lengthM: number, widthM: number) => ({
  kind: 'valley' as const, at: { azDeg, distM }, heightM, lengthM, widthM, strikeDeg: azDeg,
});

/** The river's lines past the edge: from its south-west end (-450, -330) on 234°, from its north-east end (440, 390) on 48°. */
const UP = 234, DOWN = 48;

const DRAFT: HinterlandConfig = {
  place: 'The Moselle valley between Pont-à-Mousson and Metz, autumn 1944: a walled market town above its stone bridge, '
    + 'the river down a floodplain of poplars and meadows, mirabelle orchards and street villages of the maison lorraine; '
    + 'the Côtes de Moselle\'s wooded limestone cuesta east with a Metz fort on its crest, the opposite côte west',
  region: 'centralUplands',
  lab: true,
  season: 'autumn',
  outland: {
    // (Lorraine is open field round its street villages: few hedges, orchards and vines on the côtes' feet)
    woods: 0.36, hedges: 0.25, fields: 0.7,
    relief: { riseM: [10, 28], wavelengthM: 1000 },
    settle: {
      villages: 6, hamlets: 3, farms: 5, works: 0,
      villagesAt: [
        { azDeg: 30, distM: 1700, name: 'Dornot', towerM: 32 },
        { azDeg: 56, distM: 1900, name: 'Corny-sur-Moselle', towerM: 34 },
        { azDeg: 322, distM: 2100, name: 'Novéant', towerM: 34 },
        { azDeg: 212, distM: 1800, name: 'Arnaville', towerM: 32 },
        { azDeg: 152, distM: 1300, name: 'Champey', towerM: 30 },
        { azDeg: 252, distM: 2600, name: 'Vandières', towerM: 32 },
      ],
    },
  },
  landforms: [
    // the côte on the valley's south-east side
    cote(80, 2600, 140, 2000, 'the côte over Corny'),
    cote(102, 1750, 152, 3200, 'the côte under Fort Driant'),
    cote(140, 1900, 148, 3000),
    cote(180, 2300, 138, 3000, 'the côte toward Pont-à-Mousson'),
    combe(86, 480), combe(122, 540), combe(160, 500),
    // the opposite côte on the north-west side
    cote(280, 3600, 140, 3600, 'the opposite côte'),
    cote(320, 3700, 135, 3400),
    cote(2, 4200, 130, 3000),
    cote(262, 4300, 128, 3000),
    // the floodplain carried on along the river, up- and downstream
    floodplain(UP, 3600, 26, 4400, 1200),
    floodplain(DOWN, 2900, 30, 4200, 1200),
  ],
  water: [
    // the Moselle on past both edges along the floodplain's low ground (its upstream reach listed from its far end, so
    // its level falls toward the town; downstream it runs on a kilometre to the knolls the floodplain rises over)
    { kind: 'river', path: [{ azDeg: 231.3, distM: 3522 }, { azDeg: 233.5, distM: 2860 }, { azDeg: 234.6, distM: 2453 }, { azDeg: 233.7, distM: 2110 }, { azDeg: 231.8, distM: 1780 }, { azDeg: 231.3, distM: 1601 }, { azDeg: 229.9, distM: 1242 }, { azDeg: 229.8, distM: 851 }, { azDeg: 233.8, distM: 600 }],
      widthM: 50, name: 'the Moselle, upstream toward Arnaville' },
    { kind: 'river', path: [{ azDeg: 48.4, distM: 647 }, { azDeg: 49.4, distM: 922 }, { azDeg: 52.8, distM: 1256 }], widthM: 50, level: -4, name: 'the Moselle, downstream toward Metz' },
  ],
  far: [
    { azDeg: [0, 360], distKm: [6, 20], reliefM: 170, form: 'upland', layers: 2, name: 'Lorraine\'s forested côtes' },
  ],
  landmarks: [
    { kind: 'castle', at: { azDeg: 102, distM: 1850 }, heightM: 12, name: 'Fort Driant\'s casemates' },
    { kind: 'churchTower', at: { azDeg: 40, distM: 13500 }, heightM: 88, name: 'the cathedral\'s Tour de Mutte, Metz' },
  ],
};

export default DRAFT;
