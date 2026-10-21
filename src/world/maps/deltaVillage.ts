// src/world/maps/deltaVillage.ts — Jade River Delta's market village on the char (the maps lane, 2026-10-14), its own
// module so the map file's other rounds (the paddies, the fabric) merge beside it.

// The market village on the char (the maps lane, 2026-10-14; the owner: Jade River Delta among the maps to bring up,
// built the way Verdant was). The char's village stood as a handful of buildings round the square. A Jamuna char's
// market village is the haat round its square — the bazaar's long tin sheds and the brick shops facing it, the mosque
// across the square from the temple — and round it the homesteads (bari): three or four tin houses on their raised
// plinth round a swept courtyard, the rice granary beside them; the boat sheds at the ghats on both branches. The plan
// is authored in the char's own frame (u along the char from the split toward the rejoin, v across it), and every site
// has its rotation twin about the char's centre (-4, 14), as the river, the deployments and the objectives do.
const CHAR_U = [0.702, 0.712] as const, CHAR_V = [0.712, -0.702] as const;
// `twinVacated`: a set piece stands on the twin's site instead (props.ts plannedSites `vacated`: the twin keeps its plan
// draws, spacing and footprint, so every later site, yard and clutter piece keeps its seat; its geometry and collision are
// the piece's)
const charSite = (structure: string, u: number, v: number, face: readonly [number, number], twin = structure, twinVacated = false) => {
  const at = (uu: number, vv: number) => [-4 + uu * CHAR_U[0] + vv * CHAR_V[0], 14 + uu * CHAR_U[1] + vv * CHAR_V[1]];
  const [x, z] = at(u, v), [tx, tz] = at(-u, -v);
  // the front (local +z) toward the point `face` (char coordinates) — the square, a courtyard's middle
  const [fx, fz] = at(face[0], face[1]), [tfx, tfz] = at(-face[0], -face[1]);
  const yaw = Math.atan2(fx - x, fz - z) * 180 / Math.PI, tyaw = Math.atan2(tfx - tx, tfz - tz) * 180 / Math.PI;
  return [{ structure, x: +x.toFixed(2), z: +z.toFixed(2), yawDeg: +yaw.toFixed(1), terrace: true },
    { structure: twin, x: +tx.toFixed(2), z: +tz.toFixed(2), yawDeg: +tyaw.toFixed(1), terrace: true, ...(twinVacated ? { vacated: true } : {}) }];
};
// the char's spine past the haat: its dry ground runs from 32 m wide at the haat's end to a few metres at its tip, its
// middle line drifting from 12 m to 2 m south-west of the axis (the river's banks, measured on the height field)
const spine = (u: number) => -12 + Math.min(1, Math.max(0, (u - 70) / 48)) * 10;
export const CHAR_VILLAGE = [
  // the haat: the bazaar's sheds facing the square across its north-east and south-west sides, the brick shops and stalls
  // on its corners (the cross road keeps its course past the square's south-east side)
  // (2026-10-17, MAPS Lane A, the coordinator's ruling: the landmark keeps its site) the corner shop's twin across the
  // square, at (-47.35, -5.04), stood on the aat-chala temple's site (delta.ts props.landmarks, (-44, -6)): its solid
  // refused the temple ("solid structure"), so only the temple's brick court stood. The twin's site is vacated — the
  // temple stands as the corner shop's counterpart across the square, as the mosque stands across it from the temple
  ...charSite('marketRow', 24, 38, [24, 0]), ...charSite('marketRow', 40, 36, [40, 0]),
  ...charSite('cornershop', 44, 17.5, [0, 0], 'cornershop', true),
  ...charSite('market', 40, -30, [0, 0]),
  // the village mosque by the haat, across the square from the temple
  ...charSite('chapel', 54, -22, [0, 0], 'depot'),
  // the homesteads along the char's spine: two rows facing the lane down its middle while the char is wide, one row as it
  // narrows; every fourth a big house, a granary behind every third
  ...[70, 81, 92, 103].flatMap((u, i) => [
    ...charSite(i % 4 === 0 ? 'farmhouse' : 'cottage', u, spine(u) - 8, [u, spine(u)]),
    ...charSite(i % 4 === 2 ? 'farmhouse' : 'cottage', u + 5, spine(u) + 8, [u + 5, spine(u)]),
    ...(i % 3 === 0 ? charSite('granary', u + 5, spine(u) - 17, [u, spine(u)]) : []),
  ]),
  ...[114, 124].flatMap((u) => charSite('cottage', u, spine(u), [u - 10, spine(u)])),
];
