// src/world/hinterland/drafts/longleaf.ts — Longleaf Crossing's hinterland (the horizons stream, 2026-10-16;
// C-map-briefs §22), a lab draft (lab: true) for a pair-judged migration like Verdant's: the ring stays until the
// critics find this strictly better. Longleaf, Rapides Parish, Louisiana, September 1941, crossed by the Louisiana
// Maneuvers: the Crowell company's sawmill town in the longleaf pine flatwoods.
//
// Standing there (the brief): flat to gently rolling; the skyline is open longleaf with grass under it, not a dark
// wall; cutover land of stumps and fire scars opens long views; the wigwam burner's cone and the water tank are the
// towns' verticals; a steel fire-lookout tower on a far rise; the low Kisatchie hills far off. The critics (2026-10-15,
// on the ring): "the far backdrop is a broadleaf band that doesn't match the longleaf pines inside the map" — so the far
// country is the flatwoods themselves, the region's pine canopy on the plain (not the ring's upland band), with the
// Kisatchie wold only as a low line far to the north-west.
//   - the cutover: broad, bare swells north and south-east (no wood stands on them: stumps, wiregrass and fire scars),
//     so edge-n looks out over it to the woods' edge and the lookout's rise, and corner-se to Forest Hill;
//   - the fire lookout's sandhill rise north-north-west at 3.6 km, its steel tower clear of the pines, on the bearing
//     where edge-n's view runs out between the border's knobs;
//   - Forest Hill south-east: a mill town with its burner, its railroad tank and its white frame church;
//   - a turpentine still in the woods west, its stack;
//   - the region's own low roll everywhere else (8–25 m), the flatwoods' pine on it.
// The CPU proof (skyline.mjs and the plan's marks; eyes on the battlefield's ground): edge-n looks over the cutover to
// 0.9–1 km, the skyline 1.7–3.7° (the border's knobs trimmed by the branch's head), the view running out to 2.9 km at
// az 350 where the lookout's tower stands 0.3° clear of its rise's pines; corner-se over the cutover south-east, Forest
// Hill's tank (1.95°) and burner (1.7°) at 2.1 km still under the border's 3.7° knobs in front of them; SPAWN-alpha
// looking north to the mill: the far treeline 1–2.6° at 1.5–3 km. Elsewhere the pines 0.1–0.3 km past the edge are the
// skyline (3–5°), as the brief's "the treeline makes the skyline, by design".
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = {
  place: 'Longleaf, Rapides Parish, Louisiana, September 1941: the Crowell company\'s sawmill town in the longleaf pine '
    + 'flatwoods, the cutover round it, the mill towns along the railroad with their burners and tanks, a fire lookout on '
    + 'a sandhill rise, the Louisiana Maneuvers crossing it',
  region: 'longleafFlatwoods',
  lab: true,
  outland: {
    woods: 0.48, hedges: 0.1, fields: 0.15,
    settle: {
      villages: 2, hamlets: 3, farms: 5, works: 1, town: null,
      // Forest Hill on the railroad south-east, its burner the settlement's vertical (at the cutover's far end from corner-se)
      villagesAt: [{ azDeg: 139, distM: 2650, name: 'Forest Hill', buildings: 26 }],
    },
  },
  landforms: [
    // the cutover: broad bare swells, stumps and wiregrass where the virgin longleaf was cut
    { kind: 'ridge', at: { azDeg: 0, distM: 1550 }, heightM: 4, lengthM: 3000, widthM: 2100, strikeDeg: 92,
      cover: { bare: true }, name: 'the cutover north' },
    { kind: 'ridge', at: { azDeg: 138.4, distM: 1890 }, heightM: 4, lengthM: 2600, widthM: 1000, strikeDeg: 140,
      cover: { bare: true }, name: 'the cutover south-east' },
    // (the border's own knobs 0.3–0.6 km past the edge, 50–60 m over the rolling ground, stood a 4–5° wall across
    // edge-n's and corner-se's views of the cutover: the branches' heads ease them down toward its height)
    { kind: 'valley', at: { azDeg: 6, distM: 1470 }, heightM: -30, lengthM: 900, widthM: 640, strikeDeg: 32, name: 'the branch\'s head north' },
    { kind: 'valley', at: { azDeg: 138, distM: 1540 }, heightM: -32, lengthM: 640, widthM: 480, strikeDeg: 50, name: 'the branch\'s head south-east' },
    // the fire lookout's sandhill rise, wooded
    { kind: 'ridge', at: { azDeg: 351, distM: 3600 }, heightM: 26, lengthM: 1900, widthM: 1100, strikeDeg: 80,
      name: 'the lookout\'s sandhill rise' },
  ],
  far: [
    { azDeg: [0, 360], distKm: [4, 16], reliefM: 25, form: 'plain', layers: 0, name: 'the longleaf flatwoods' },
    { azDeg: [285, 345], distKm: [18, 40], reliefM: 110, form: 'upland', layers: 1, name: 'the Kisatchie wold' },
  ],
  landmarks: [
    { kind: 'lookoutTower', at: { azDeg: 351, distM: 3620 }, heightM: 40, name: 'the fire lookout' },
    { kind: 'spire', at: { azDeg: 135, distM: 2800 }, heightM: 20, name: 'Forest Hill\'s frame church' },
    { kind: 'chimney', at: { azDeg: 252, distM: 1700 }, heightM: 12, name: 'the turpentine still' },
  ],
  exceptions: {
    C1: 'the flatwoods are flat to gently rolling: the pines past the edge are the skyline, no range stands behind them',
    C6: 'the flatwoods run flat to the horizon: only the Kisatchie wold stands far over them, faint, to the north-west',
    C7: 'the pine haze of a Southern late-summer morning (fog .00085)',
  },
};

export default DRAFT;
