/** Existing ball/pickup arena extent, shared with full-footprint placement. */
export const MATCH_MODE_ARENA_HALF_EXTENT_M = 420;

/** Canonical objective hints, in metres. Both authorities validate these
 * against the current terrain, liquid, structures and reservations at entry.
 * They do not create terrain pads or bypass the shared placement checks. */
export const MATCH_OBJECTIVE_LAYOUTS: Readonly<Record<string, {
  zones: readonly { x: number; z: number }[];
  kickoff?: { x: number; z: number };
}>> = {
  // Tarkhan Steppe (round 48 redesign, 2026-09-23): a 10 m lattice scan of the new height field + manifest
  // (30 m discs, relief <= 7 m, normal.y >= 0.94, firm ground, no obstacles, both teams' round-trip reach) — the
  // caravanserai forecourt at the foot of its rise, the post-road halt on the eastern ramp and the kolkhoz machine
  // yard — three graded aprons in the map file — a
  // south-west / centre / north-east diagonal. Both authorities revalidate each disc against the current terrain
  // and manifest and relocate any hint the ground no longer clears.
  cliffbridge: { kickoff: { x: 0, z: -155 }, zones: [{ x: 0, z: -155 }, { x: 0, z: 155 }, { x: 360, z: 0 }] },
  steppe: { zones: [{ x: 60, z: 90 }, { x: 292, z: 312 }, { x: -330, z: -240 }] },
  // Validated full-disc results of the bounded search on these constrained
  // maps. Start with the known clearings; changed terrain still revalidates
  // every footprint and both-team connection before using the ordinary search.
  titan_gorge: { zones: [{ x: -42.91761885802029, z: 130.9474125982917 }, { x: 10, z: 50 }, { x: 70, z: 250 }] },
  // Sirocco Wadi (redesign 2026-10-01): three gravel bars in the wadi bed, rotationally symmetric about the ford — the
  // gap between the mesas, the souk ground at the ford (also the turbo-ball kickoff), the eastern fan. Each is a graded
  // apron in the map file, so the discs seat where they are authored and both teams drive the same distances.
  desert: { kickoff: { x: 0, z: 0 }, zones: [{ x: -300, z: 84 }, { x: 0, z: 0 }, { x: 292, z: -112 }] },
  // Steinburg (redesign 2026-10-01): three discs on the spur's crest, mirror-symmetric across it — the farm road's
  // crossing in the western orchards and the market square (also the turbo-ball kickoff), each a paved apron in the
  // map file, and the bypass in the gap beyond the castle rock, the validated seat of the bounded search on the
  // road's natural floor (an apron there would ramp the bypass past a road grade).
  urban: { kickoff: { x: -50, z: 0 }, zones: [{ x: -330, z: 24 }, { x: -50, z: 0 }, { x: 247.2, z: 0 }] },
  // Cinder Junction (redesign 2026-10-01): three paved aprons on the main line, rotationally symmetric about the
  // station square — the west level crossing, the station square (also the turbo-ball kickoff), the east level
  // crossing; each is a graded apron in the map file, so the discs seat where they are authored.
  railyard: { kickoff: { x: 0, z: 0 }, zones: [{ x: -262, z: -21 }, { x: 0, z: 0 }, { x: 262, z: 21 }] },
  // Frontier Basin (redesign 2026-10-02): three level aprons on the valley floor, rotationally symmetric about the
  // village crossroads — the west river meadow below the mill, the village square (also the turbo-ball kickoff), the
  // east river meadow.
  frontier: { kickoff: { x: 0, z: 0 }, zones: [{ x: -290, z: -30 }, { x: 0, z: 0 }, { x: 290, z: 30 }] },
  // Saltwind Narrows (redesign 2026-10-02): three discs on the bay's axis (z = 10), the line the layout is mirrored
  // across — the village square and the upper village, validated seats on the village's graded floor, and the karst
  // spine's saddle, a level apron in the map file; the turbo-ball kickoff seats at the market crossroads.
  saltwind: { kickoff: { x: 40, z: 4 }, zones: [{ x: -122, z: 8 }, { x: -44, z: 14 }, { x: 230, z: 26 }] },
  // Saltmere Bay (redesign 2026-10-02): three discs on the axis between the two shore lanes (z = 22), the line the
  // layout is mirrored across — the inland hamlet's green and the bocage crossroads' meadow (level aprons in the map
  // file) and the village's west end (a validated seat on its graded floor, also the turbo-ball kickoff).
  coastal: { kickoff: { x: 60, z: 22 }, zones: [{ x: -290, z: 22 }, { x: -155, z: 22 }, { x: 60, z: 22 }] },
  // Verdant Fields (redesign 2026-10-02): three level aprons, rotationally symmetric about the village — the southern
  // field green, the village square (also the turbo-ball kickoff), the northern field green.
  verdant: { kickoff: { x: 10, z: 20 }, zones: [{ x: -250, z: -126 }, { x: 10, z: 20 }, { x: 270, z: 166 }] },
  // Mangrove Reach (redesign 2026-10-02): three seats on the line of equal distance between the deployments — the
  // western meadow below the creek, the fishing village (also the turbo-ball kickoff), the eastern island's flats.
  mangrove: { kickoff: { x: -55, z: 10 }, zones: [{ x: -230, z: 95 }, { x: -55, z: 10 }, { x: 240, z: -90 }] },
  // Redrock Divide (redesign 2026-10-02): three level aprons on the canyon floor's line of equal distance between the
  // deployments, rotationally symmetric about the outpost — the west lane's vehicle park, the outpost's square (also
  // the turbo-ball kickoff), the east lane's vehicle park.
  badlands: { kickoff: { x: 8, z: 0 }, zones: [{ x: -122, z: 21 }, { x: 8, z: 0 }, { x: 138, z: -21 }] },
  // Tidegate Polders (redesign 2026-10-02): the farm court's paved yard (also the turbo-ball kickoff) and a field on
  // each side of it, the north field within 8 m of the south field's rotation about the farm court.
  polders: { kickoff: { x: -40, z: 0 }, zones: [{ x: -135, z: -198 }, { x: -40, z: 0 }, { x: 7, z: 230 }] },
  // Jade River Delta (redesign 2026-10-02): the market square on the char (also the turbo-ball kickoff) and a
  // rice-drying yard on each bank, rotationally symmetric about the char's centre.
  delta: { kickoff: { x: -4, z: 14 }, zones: [{ x: -151, z: 43 }, { x: -4, z: 14 }, { x: 143, z: -15 }] },
  // Highland Reservoir (redesign 2026-10-02): the waterworks' three gravel yards on the line of equal driven distance
  // between the deployments — the north bank's timber landing, the shore yard (also the turbo-ball kickoff), the
  // south yard.
  monsoon: { kickoff: { x: -60, z: 24 }, zones: [{ x: -306, z: 16 }, { x: -60, z: 24 }, { x: 400, z: 8 }] },
  reservoir: { kickoff: { x: 88, z: 8 }, zones: [{ x: -8, z: 154 }, { x: 88, z: 8 }, { x: 12, z: -170 }] },
  skybridge: { zones: [{ x: -176.06506695110778, z: 137.3917255616368 }, { x: 89.52728122683749, z: -163.28455235885394 }, { x: 110, z: -30 }] },
  copper_mesa: { zones: [{ x: 95.75601429460295, z: 25.16493186989846 }, { x: 103.52551824388397, z: -48.38643546884091 }, { x: 159.75453586673763, z: -8.089799185507083 }] },
};
