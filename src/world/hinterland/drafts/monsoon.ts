// src/world/hinterland/drafts/monsoon.ts — Monsoon Ridge's hinterland (the horizons stream, 2026-10-16; C-map-briefs
// §18), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the critics find this
// strictly better. Kohima in the Naga Hills, April–June 1944: the hill town on its saddle between jungle spurs, the
// Dimapur–Imphal road winding through, the valley bottoms flooding in the monsoon.
//
// Standing there (the brief): steep ridges forested to their crests in every direction, cloud in the valleys between
// them; south, the Pulie Badze ridge some 850 m above the town at 4–5 km, and behind it, left of it, Japfü (3,048 m),
// some 1,600 m above at 11–13 km, the range between them one continuous wall; Naga villages on the crests north-east
// and west (Kohima Village, Merema, Jotsoma), their crowns cleared for the houses and the terraces below them.
//   - the near spurs past the edge stay low (Aradura south-east, the Kohima Village ridge north-east, Merema north,
//     Jotsoma west), each 150–190 m over its foot, so the far ridges show over them (the first 700 m past the edge are
//     the battlefield's own border hills, 60–160 m: a draft only cuts them);
//   - the ground falls past them into the valleys, the Zubza north-west (the Dimapur road's way down) and the Dzüza
//     east, 200–260 m under the saddle, and south the valley the Imphal road runs down, which opens edge-s onto Japfü;
//   - Pulie Badze and the Japfü range: two masses on one north–south line, a col between them at ~6.5 km;
//   - east of the Imphal road the lower Kigwema ridges, and east over the Dzüza the Chiechama ridge;
//   - the Khonoma ridges behind Jotsoma to the west;
//   - the far ridges layered behind all of it (the ring's `ridges` 750 m, kept), starting past the named ranges.
// No pagodas, no masts, no pylons: 1944 Kohima had none. The villages' chapels are small: the region's church tower is
// the settlement's vertical, so each anchored village names a 14–18 m slim belfry rather than a 34 m tower, and the
// planner adds no village of its own.
// The CPU proof (skyline.mjs, eyes on the battlefield's ground): edge-s — Pulie Badze 14.1° at az 229 (3.2 km), the range
// falling from it to Japfü's summit 9.0° at az 197.5 (11.1 km, 5° proud of the valley before it), the Aradura spur 8.5°
// at az 158; corner-ne — Kohima Village on the crest at az 48, 1.34 km, its ground 11° up with only the 9 km ridges
// (≤ 5°) behind it; SPAWN-alpha looking north — the Merema ridge and the hills 4–7° at 1.6–3 km.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'Kohima in the Naga Hills, April–June 1944: a hill town on a saddle between jungle spurs, Garrison Hill and Jail '
    + 'Hill above its streets, the road winding through, Naga villages on the ridge crests, Pulie Badze and Japfü to the '
    + 'south, the valley bottoms flooding in the monsoon',
  region: 'nagaHills',
  lab: true,
  outland: {
    woods: 0.62, hedges: 0.1, fields: 0.25,
    settle: {
      villages: 3, hamlets: 3, farms: 2, works: 0, town: null,
      // the ridge-top villages on the main sightlines, each on its cleared crown (the ridges below carry them)
      villagesAt: [
        { azDeg: 47, distM: 1930, name: 'Kohima Village', towerM: 18, buildings: 26, slim: true },
        { azDeg: 352, distM: 2600, name: 'Merema', towerM: 14, buildings: 18, slim: true },
        { azDeg: 271, distM: 2600, name: 'Jotsoma', towerM: 16, buildings: 22, slim: true },
      ],
    },
  },
  landforms: [
    // the near spurs: low, forested, their crowns cleared where the villages stand
    { kind: 'ridge', at: { azDeg: 42, distM: 1900 }, heightM: 150, lengthM: 1500, widthM: 720, strikeDeg: 140,
      cover: { forest: [0, 70] }, name: 'the Kohima Village ridge' },
    { kind: 'ridge', at: { azDeg: 354, distM: 2650 }, heightM: 170, lengthM: 2300, widthM: 820, strikeDeg: 80, notched: true,
      cover: { forest: [0, 125] }, name: 'the Merema ridge' },
    { kind: 'ridge', at: { azDeg: 272, distM: 2650 }, heightM: 190, lengthM: 2500, widthM: 900, strikeDeg: 175, notched: true,
      cover: { forest: [0, 145] }, name: 'the Jotsoma ridge' },
    { kind: 'ridge', at: { azDeg: 150, distM: 1900 }, heightM: 150, lengthM: 1900, widthM: 720, strikeDeg: 40, notched: true,
      name: 'the Aradura spur' },
    // the valleys past them: the Zubza north-west, the Dzüza east
    { kind: 'valley', at: { azDeg: 318, distM: 4200 }, heightM: -260, lengthM: 6400, widthM: 1900, strikeDeg: 315, name: 'the Zubza valley' },
    { kind: 'valley', at: { azDeg: 190, distM: 2600 }, heightM: -120, lengthM: 3600, widthM: 1100, strikeDeg: 192, name: 'the valley the Imphal road runs south down' },
    { kind: 'valley', at: { azDeg: 82, distM: 3300 }, heightM: -200, lengthM: 4600, widthM: 1300, strikeDeg: 170, name: 'the Dzüza valley' },
    // south: Pulie Badze, and the Japfü range behind it, one continuous wall on one line
    { kind: 'massif', at: { azDeg: 214, distM: 4600 }, heightM: 920, lengthM: 5200, widthM: 3200, strikeDeg: 6, name: 'Pulie Badze',
      peak: { along: 0.5, share: 0.42, asym: 1.3 }, cover: { forest: [0, 900] } },
    { kind: 'massif', at: { azDeg: 197, distM: 12000 }, heightM: 1900, lengthM: 9000, widthM: 5200, strikeDeg: 8, name: 'Japfü',
      peak: { along: 0.1, share: 0.4, asym: 1.4 }, cover: { forest: [0, 1450] } },
    // east of the Imphal road, the lower Kigwema ridges; east over the Dzüza, the Chiechama ridge
    { kind: 'ridge', at: { azDeg: 166, distM: 6600 }, heightM: 420, lengthM: 5200, widthM: 1700, strikeDeg: 15, notched: true,
      name: 'the Kigwema ridges' },
    { kind: 'massif', at: { azDeg: 96, distM: 6400 }, heightM: 480, lengthM: 6200, widthM: 2600, strikeDeg: 5, name: 'the Chiechama ridge',
      cover: { forest: [0, 520] } },
    // west: the Khonoma ridges behind Jotsoma
    { kind: 'massif', at: { azDeg: 262, distM: 7200 }, heightM: 600, lengthM: 6400, widthM: 3000, strikeDeg: 165, name: 'the Khonoma ridges',
      cover: { forest: [0, 650] } },
  ],
  far: [
    // the Naga hills' ridges layered to the north, east and west (the ring's `ridges` 750 m)
    { azDeg: [230, 160], distKm: [9, 26], reliefM: 750, form: 'ridges', layers: 2, name: 'the Naga hills' },
    // south, behind Japfü: the Barail's ridges over the Dzükou
    { azDeg: [160, 230], distKm: [18, 34], reliefM: 900, form: 'ridges', layers: 1, name: 'the Barail behind Japfü' },
  ],
  exceptions: {
    C1: 'Kohima stands on a saddle in the Naga hills: forested ridges stand all round within 2–5 km, Pulie Badze 850 m over the town',
    C7: 'Kohima\'s monsoon storm (fog .00088): cloud banks below the ridge tops (the brief\'s storm class)',
    C9: 'the battlefield\'s 44 m rim is the saddle\'s own shoulders between the spurs',
  },
};

export default DRAFT;
