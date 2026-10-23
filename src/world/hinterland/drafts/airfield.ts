// src/world/hinterland/drafts/airfield.ts — Kestrel Airfield's hinterland (the horizons stream, 2026-10-16;
// C-map-briefs §10), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics
// find this strictly better. The draft from today's config gave five 31–47 m swells at 1.3–1.4 km under a plain far
// country, its outland a fifth woods (the critics: "isolated lollipop trees or a single-file tree row ... no continuous
// forest mass").
//
// Hostomel airport, 2022 (in the map's growing season, not the February of the assault): the runway on a level plateau in the Polissia pine forest north-west of Kyiv, the
// ground falling a few tens of metres into the boggy valleys of the Irpin's tributaries, the Irpin itself in its marshy
// floodplain to the south-east and east. Standing there (the brief):
//   - north and west: the pine forest, a level dark skyline of 20–25 m pines broken by clearings, dacha villages
//     (Ozera, Kozarovychi) in their clearings with a church's dome;
//   - south: the wooded valley, then Hostomel's panel blocks, its water tower and boiler-house stack 2.5–3.5 km out,
//     the gold domes of Bucha and Irpin beyond at 5–8 km;
//   - east: the Irpin's floodplain and Moshchun, the 330 kV line striding off toward Kyiv;
//   - Kyiv's edge 20 km south-east, under the haze.
// A flat place: no ridge stands over the forest; the skyline is the pines, the domes, the blocks and the pylons (C6).
// The map keeps its growing season (the 10-15 MA.37 ruling, maps/airfield.ts): the draft takes the default summer — the
// birch in leaf, the clearings green, the pines dark.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'Hostomel (Antonov) airport, summer 2022: the runway on a level plateau in the Polissia pine forest, '
    + 'the boggy valleys of the Irpin\'s tributaries round it, dacha villages in the clearings, Hostomel\'s panel blocks '
    + 'and water tower south, the gold domes of Bucha and Irpin beyond, the Irpin\'s floodplain east',
  region: 'kyivPinelands',
  lab: true,
  outland: {
    // (the critics: continuous forest mass past the border — the pine forest the outland's main cover, the fields the
    // clearings between its stands; few single-file rows)
    woods: 0.62, hedges: 0.12, fields: 0.3, links: 3,
    settle: {
      villages: 7, hamlets: 4, farms: 5, works: 1,
      // Hostomel south of the airfield, its houses reaching up toward the plateau's edge: its panel blocks, its water
      // tower, its boiler house (near, so its own ground clears the forest and the eye sees across it to the valley)
      town: { azDeg: 172, distM: 2080, size: 'large', name: 'Hostomel' },
      // the villages on the sightlines, each round its church (the region's onion dome): a dome at middle distance on
      // every edge's view, the towns' gold domes beyond to the south
      villagesAt: [
        { azDeg: 318, distM: 2500, name: 'Ozera', towerM: 26 },
        { azDeg: 28, distM: 2900, name: 'Kozarovychi', towerM: 26 },
        { azDeg: 102, distM: 2600, name: 'Moshchun', towerM: 24 },
        { azDeg: 262, distM: 3600, name: 'Blystavytsia', towerM: 26 },
        { azDeg: 140, distM: 4600, name: 'Horenka', towerM: 28 },
        { azDeg: 192, distM: 5600, name: 'Bucha', towerM: 40, buildings: 90 },
        { azDeg: 158, distM: 7600, name: 'Irpin', towerM: 38, buildings: 110 },
      ],
    },
  },
  landforms: [
    // the plateau's edges: the boggy tributary valleys past the north and south edges (the battlefield's own valleys at
    // z ±395 running on), draining east to the Irpin
    { kind: 'valley', at: { azDeg: 4, distM: 1350 }, heightM: 16, lengthM: 4200, widthM: 800, strikeDeg: 96, name: 'the north tributary\'s valley' },
    { kind: 'valley', at: { azDeg: 184, distM: 1350 }, heightM: 16, lengthM: 4200, widthM: 800, strikeDeg: 84, name: 'the south tributary\'s valley' },
    // the Irpin's valley round the south and east, ~30 m under the plateau, its floodplain marsh (in three straight
    // reaches along the river's bend)
    { kind: 'valley', at: { azDeg: 193, distM: 6100 }, heightM: 28, lengthM: 4400, widthM: 2000, strikeDeg: 66, name: 'the Irpin at Bucha' },
    { kind: 'valley', at: { azDeg: 151, distM: 3400 }, heightM: 30, lengthM: 5400, widthM: 1900, strikeDeg: 29, name: 'the Irpin at Hostomel' },
    { kind: 'valley', at: { azDeg: 68, distM: 4050 }, heightM: 30, lengthM: 5400, widthM: 2000, strikeDeg: 20, name: 'the Irpin at Moshchun' },
  ],
  water: [
    // the Irpin, upstream (Irpin and Bucha) to downstream (toward the Kyiv reservoir), its level falling along it
    { kind: 'river', path: [{ azDeg: 205, distM: 7500 }, { azDeg: 175, distM: 5200 }, { azDeg: 140, distM: 3600 }, { azDeg: 105, distM: 3000 },
      { azDeg: 75, distM: 3800 }, { azDeg: 50, distM: 6000 }, { azDeg: 40, distM: 9000 }], widthM: 30, name: 'the Irpin' },
  ],
  far: [{ azDeg: [0, 360], distKm: [4, 15], reliefM: 25, form: 'plain', layers: 0, name: 'the Polissia pine plain' }],
  landmarks: [
    { kind: 'waterTower', at: { azDeg: 178, distM: 2200 }, heightM: 32, name: 'Hostomel\'s water tower' },
    { kind: 'chimney', at: { azDeg: 165, distM: 2500 }, heightM: 60, name: 'the town boiler house' },
    { kind: 'mast', at: { azDeg: 74, distM: 1300 }, heightM: 45, name: 'the airfield\'s radio mast' },
    { kind: 'pylonLine', from: 'exit:e', azDeg: 118, name: 'the 330 kV line toward Kyiv' },
    { kind: 'pylonLine', from: 'exit:w', azDeg: 276, name: 'the 110 kV line west' },
  ],
  exceptions: {
    C1: 'Hostomel stands on a plateau in the pine forest: the skyline is the pines\' level canopy, not land',
    C6: 'Polissia is flat: no far layer stands over the forest; the domes, blocks and pylons carry the distance',
  },
};

export default DRAFT;
