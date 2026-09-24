/** Existing ball/pickup arena extent, shared with full-footprint placement. */
export const MATCH_MODE_ARENA_HALF_EXTENT_M = 420;

/** Canonical objective hints, in metres. Both authorities validate these
 * against the current terrain, liquid, structures and reservations at entry.
 * They do not create terrain pads or bypass the shared placement checks. */
export const MATCH_OBJECTIVE_LAYOUTS: Readonly<Record<string, {
  zones: readonly { x: number; z: number }[];
}>> = {
  // Tarkhan Steppe (round 48 redesign, 2026-09-23): a 10 m lattice scan of the new height field + manifest
  // (30 m discs, relief <= 7 m, normal.y >= 0.94, firm ground, no obstacles, both teams' round-trip reach) — the
  // caravanserai forecourt at the foot of its rise, the post-road halt on the eastern ramp and the kolkhoz machine
  // yard — three graded aprons in the map file — a
  // south-west / centre / north-east diagonal. Both authorities revalidate each disc against the current terrain
  // and manifest and relocate any hint the ground no longer clears.
  steppe: { zones: [{ x: 60, z: 90 }, { x: 292, z: 312 }, { x: -330, z: -240 }] },
  // Validated full-disc results of the bounded search on these constrained
  // maps. Start with the known clearings; changed terrain still revalidates
  // every footprint and both-team connection before using the ordinary search.
  titan_gorge: { zones: [{ x: -42.91761885802029, z: 130.9474125982917 }, { x: 10, z: 50 }, { x: 70, z: 250 }] },
  desert: { zones: [{ x: -45.52923232497921, z: 3.2158595481091083 }, { x: 87.7071125445236, z: 3.273552564184371 }, { x: 110, z: 310 }] },
  skybridge: { zones: [{ x: -176.06506695110778, z: 137.3917255616368 }, { x: 89.52728122683749, z: -163.28455235885394 }, { x: 110, z: -30 }] },
  copper_mesa: { zones: [{ x: 95.75601429460295, z: 25.16493186989846 }, { x: 103.52551824388397, z: -48.38643546884091 }, { x: 159.75453586673763, z: -8.089799185507083 }] },
};
