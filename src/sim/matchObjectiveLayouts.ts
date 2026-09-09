/** Existing ball/pickup arena extent, shared with full-footprint placement. */
export const MATCH_MODE_ARENA_HALF_EXTENT_M = 420;

/** Canonical objective hints, in metres. Both authorities validate these
 * against the current terrain, liquid, structures and reservations at entry.
 * They do not create terrain pads or bypass the shared placement checks. */
export const MATCH_OBJECTIVE_LAYOUTS: Readonly<Record<string, {
  zones: readonly { x: number; z: number }[];
}>> = {
  // Independent 4 m scan of the current Steppe height field + manifest found
  // these three separated 30 m firm clearings; a 20 m lattice misses the last.
  steppe: { zones: [{ x: -38, z: -18 }, { x: 66, z: 30 }, { x: -22, z: 166 }] },
  // Validated full-disc results of the bounded search on these constrained
  // maps. Start with the known clearings; changed terrain still revalidates
  // every footprint and both-team connection before using the ordinary search.
  titan_gorge: { zones: [{ x: -42.91761885802029, z: 130.9474125982917 }, { x: 10, z: 50 }, { x: 70, z: 250 }] },
  desert: { zones: [{ x: -45.52923232497921, z: 3.2158595481091083 }, { x: 87.7071125445236, z: 3.273552564184371 }, { x: 110, z: 310 }] },
  skybridge: { zones: [{ x: -176.06506695110778, z: 137.3917255616368 }, { x: 89.52728122683749, z: -163.28455235885394 }, { x: 110, z: -30 }] },
  copper_mesa: { zones: [{ x: 95.75601429460295, z: 25.16493186989846 }, { x: 103.52551824388397, z: -48.38643546884091 }, { x: 159.75453586673763, z: -8.089799185507083 }] },
};
