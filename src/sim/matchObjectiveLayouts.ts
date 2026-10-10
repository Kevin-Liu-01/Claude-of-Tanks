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
  // Aegis Crossing (redesign 2026-10-02): mirror-symmetric across the gorge's axis — the two bridgehead market squares
  // (level aprons in the map file) and the gorge floor west of the viaduct, where the mills stood; the turbo-ball
  // kickoff on the gorge floor east of it. Both teams reach the floor from the fords at the gorge's two ends.
  cliffbridge: { kickoff: { x: 130, z: 0 }, zones: [{ x: 0, z: -172 }, { x: 0, z: 172 }, { x: -130, z: 0 }] },
  // Suzhou Creek (the map-revival lane, 2026-10-05): the creek runs between the deployments, alpha's side owning the west
  // bridge and bravo's the three others; the discs stand on the line of equal driven distance on both banks — the west
  // bank's open ground north of the creek (alpha crosses for it), the waterfront south of the diagonals' crossing and
  // the east quarter's yards (bravo crosses for them); the kickoff between them on the south bank.
  blackglass: { kickoff: { x: -97, z: -7 }, zones: [{ x: -285, z: 33 }, { x: 34, z: -50 }, { x: 140, z: -34 }] },
  // Amberford (layout brief, 2026-10-03): the three greens — the sunken lane's green in the south-bank orchards near the
  // southern deployment, the ford green on the line of equal drives and the fair green near the northern arc; the
  // kickoff on the north-bank meadow between the bridge and the ford (2026-10-03: 8 m north, where the bounded search
  // seats it beside the meandering river).
  autumn: { kickoff: { x: 119, z: 42 }, zones: [{ x: 22, z: -192 }, { x: 154, z: 54 }, { x: 0, z: 102 }] },
  // Frosthollow (layout brief, 2026-10-03): three zones across the valley's waist — the terrace hay meadow behind the
  // sawmill, the Bystra crossing's east-bank landing and the moraine crossroads (the last two graded aprons in the map
  // file); the kickoff on the Bystra crossing itself.
  winter: { kickoff: { x: 10, z: 0 }, zones: [{ x: -175, z: 65 }, { x: 95, z: -5 }, { x: 190, z: -40 }] },
  // Nordhavn Fjord (layout brief, 2026-10-03): three zones on the line of equal drives from the upper town under the
  // western cliff, through the harbour road in the lower town (also the turbo-ball kickoff), to the curing yards above
  // the harbour; each team's nearest, middle and farthest zone lie within 1 % of the other's.
  fjord: { kickoff: { x: 40, z: -65 }, zones: [{ x: -200, z: 35 }, { x: 40, z: -65 }, { x: 150, z: -110 }] },
  // Sunscar Oasis (layout brief, 2026-10-03): three zones across the spring's waist — the palm grove on the spring's
  // east shore, the palm belt west of the town (also the turbo-ball kickoff) and the souk; the bounded search's seats,
  // each team's nearest, middle and farthest zone within 2 % of the other's.
  oasis: { kickoff: { x: 29.1, z: 4.4 }, zones: [{ x: -72.5, z: -11.2 }, { x: 29.1, z: 4.4 }, { x: 157.8, z: 12.6 }] },
  // Whiteout Station (layout brief, 2026-10-03): three zones across the station — the motor pool yard, the service
  // court (also the turbo-ball kickoff, beside it) and the melt pan's frozen west shore; the bounded search's seats,
  // each team's nearest, middle and farthest zone within 3 % of the other's.
  whiteout: { kickoff: { x: -53.7, z: 5 }, zones: [{ x: -154.9, z: 25.1 }, { x: -48.1, z: 10.7 }, { x: 50.5, z: -7.7 }] },
  // Tarkhan Steppe (layout brief, 2026-10-02): the three aprons — the station's grain yard by the ford on the line of
  // equal drives, the post-road halt on the plateau near the northern arc and the kolkhoz yard near the southern
  // deployment, each team's home zone as far from it as the other's; the kickoff on the wadi's north bank (the bounded
  // search's seat, 420 / 375 m: the bed between them is the crusts' soft ground).
  steppe: { kickoff: { x: -77.1, z: 76.4 }, zones: [{ x: 271, z: -64 }, { x: 206, z: 360 }, { x: -330, z: -240 }] },
  // Glacier Pass (redesign 2026-10-03): three discs on the line of equal driven distance — the col yard east of the
  // west pass road (a level apron in the map file), the lake ice off the village (also the turbo-ball kickoff) and the
  // lake ice by the east shore. The frozen lake is firm, level ground, so the two ice discs seat as they lie.
  alpine: { kickoff: { x: -25, z: -28 }, zones: [{ x: -266, z: 44 }, { x: -25, z: -28 }, { x: 150, z: -60 }] },
  // Ironworks (redesign 2026-10-03): three discs on the line of equal driven distance, each on a paved yard in the map
  // file — the west street's yard, the casting yard below the blast furnace block (also the turbo-ball kickoff) and the
  // slag road's yard in the south-east.
  foundry: { kickoff: { x: 0, z: -72 }, zones: [{ x: -258, z: 50 }, { x: 0, z: -72 }, { x: 200, z: -176 }] },
  // Titan Gorge (redesign 2026-10-03, the deployments at the gorge's two ends): three discs on the line of equal driven
  // distance across the canyon floor — the western switchback's yard (a tilted apron in the map file), the crossroads
  // below the old town on the deployments' bisector (a validated seat on the floor, also the turbo-ball kickoff) and
  // the eastern shelf road's yard, the western yard's rotation about the centre (a level apron). Driven reach
  // 549 / 454 m, 417 / 398 m and 449 / 554 m.
  titan_gorge: { kickoff: { x: 0, z: 10 }, zones: [{ x: -250, z: 50 }, { x: 0, z: 10 }, { x: 250, z: -50 }] },
  // Validated full-disc results of the bounded search on these constrained
  // maps. Start with the known clearings; changed terrain still revalidates
  // every footprint and both-team connection before using the ordinary search.
  // Sirocco Wadi (redesign 2026-10-01): three gravel bars in the wadi bed, rotationally symmetric about the ford — the
  // gap between the mesas, the souk ground at the ford (also the turbo-ball kickoff), the eastern fan. Each is a graded
  // apron in the map file, so the discs seat where they are authored and both teams drive the same distances.
  desert: { kickoff: { x: 0, z: 0 }, zones: [{ x: -300, z: 84 }, { x: 0, z: 0 }, { x: 292, z: -112 }] },
  // Steinburg (redesign 2026-10-01): three discs on the spur's crest, mirror-symmetric across it — the farm road's
  // crossing in the western orchards and the market square (also the turbo-ball kickoff), each a paved apron in the
  // map file, and the bypass in the gap beyond the castle rock, the validated seat of the bounded search on the
  // road's natural floor (an apron there would ramp the bypass past a road grade).
  urban: { kickoff: { x: -50, z: 0 }, zones: [{ x: -330, z: 4 }, { x: -50, z: 0 }, { x: 247.2, z: 0 }] },
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
  // Verdant Fields (redesign 2026-10-02; the classic town plan restored 2026-10-03): the southern and northern field
  // greens, level aprons that are each other's rotation about the village (10, 20), and the middle disc on the
  // deployments' perpendicular bisector at the town's south-east edge (64.4, -5.4), the nearest place on it where the
  // houses leave a 30 m disc clear; the turbo-ball kickoff seats on the same bisector beside the town's centre
  // (-11.7, 30.2). Driven reach: 273 / 712 m, 457 / 462 m, 712 / 273 m; the kickoff 461 / 458 m. Rotating the greens
  // about the middle disc instead would leave one team's green 96 m nearer (objective symmetry 1.43).
  verdant: { kickoff: { x: -11.7, z: 30.2 }, zones: [{ x: -250, z: -126 }, { x: 64.4, z: -5.4 }, { x: 270, z: 166 }] },
  // Mangrove Reach (redesign 2026-10-02): three seats on the line of equal distance between the deployments — the
  // western meadow below the creek, the fishing village (also the turbo-ball kickoff), the eastern island's flats.
  mangrove: { kickoff: { x: -55, z: 10 }, zones: [{ x: -230, z: 95 }, { x: -55, z: 10 }, { x: 240, z: -90 }] },
  // Redrock Divide (redesign 2026-10-02): three level aprons on the canyon floor's line of equal distance between the
  // deployments, rotationally symmetric about the outpost — the west lane's vehicle park, the outpost's square (also
  // the turbo-ball kickoff), the east lane's vehicle park.
  badlands: { kickoff: { x: 8, z: 0 }, zones: [{ x: -122, z: 21 }, { x: 8, z: 0 }, { x: 138, z: -21 }] },
  // Tidegate Polders (redesign 2026-10-02): the farm court's paved yard (also the turbo-ball kickoff) and a field on
  // each side of it, the north field within 8 m of the south field's rotation about the farm court. (2026-10-07, the
  // map-revival lane, step 6: with the oxbow basin gone the north field's ground rose 0.2 m to its west and its disc's
  // relief passed the 7 m bound; its seat is the bounded search's, 8 m south-west, on the same field)
  polders: { kickoff: { x: -40, z: 0 }, zones: [{ x: -135, z: -198 }, { x: -40, z: 0 }, { x: 1.3, z: 224.3 }] },
  // Jade River Delta (redesign 2026-10-02): the market square on the char (also the turbo-ball kickoff) and a
  // rice-drying yard on each bank, rotationally symmetric about the char's centre.
  delta: { kickoff: { x: -4, z: 14 }, zones: [{ x: -151, z: 43 }, { x: -4, z: 14 }, { x: 143, z: -15 }] },
  // Monsoon Ridge (redesign 2026-10-02): three discs on the line of equal driven distance between the deployments — the
  // temple forecourt astride the west road and the tea estate's drying yard (aprons in the map file) and the hill
  // town's square (also the turbo-ball kickoff).
  monsoon: { kickoff: { x: -60, z: 24 }, zones: [{ x: -306, z: 16 }, { x: -60, z: 24 }, { x: 400, z: 8 }] },
  // Obsidian Caldera (redesign 2026-10-03): three discs on the line of equal driven distance — the Sulphur Works' yard
  // by the west road, the settlement's west end on the basin floor (also the turbo-ball kickoff), the eastern Loading
  // Yard. The two yards are graded aprons in the map file; the settlement's floor seats its disc as it lies.
  caldera: { kickoff: { x: -120, z: 0 }, zones: [{ x: -332, z: 96 }, { x: -120, z: 0 }, { x: 340, z: -200 }] },
  // Highland Reservoir (redesign 2026-10-02): the waterworks' three gravel yards on the line of equal driven distance
  // between the deployments — the north bank's timber landing, the shore yard (also the turbo-ball kickoff), the
  // south yard.
  reservoir: { kickoff: { x: 88, z: 8 }, zones: [{ x: -8, z: 154 }, { x: 88, z: 8 }, { x: 12, z: -170 }] },
  // Ruinspires (redesign 2026-10-02): the boulevard's three squares, level aprons in the map file, rotationally
  // symmetric about the Square of the Republic (also the turbo-ball kickoff).
  // Ruinspires, the Miljacka's valley (the map-revival lane, 2026-10-06; the deployments at the valley's two ends): three
  // discs across the valley's waist on the line of equal drives — the north bench's square, the north bank's square by
  // the central bridge, the south bench's square (the north bench's rotation twin). The river through the centre leaves no
  // dry disc at the rotation centre, so the bank's square has no twin: its value is symmetric (equal planned drives, the
  // 40-seed win split per side within 45-55 %), its geometry is not. The kickoff at the bank square's rotation twin.
  ruinspires: { kickoff: { x: -14, z: -67.3 }, zones: [{ x: 25, z: 296 }, { x: 14, z: 67.3 }, { x: -25, z: -296 }] },
  // Kestrel Airfield (redesign 2026-10-02): the cargo apron, the runway's centre (also the turbo-ball kickoff) and the
  // terminal apron, rotationally symmetric about the runway's centre; the two aprons and the holding apron at the
  // runway's centre are level aprons in the map file.
  airfield: { kickoff: { x: 0, z: 0 }, zones: [{ x: -225, z: -150 }, { x: 0, z: 0 }, { x: 225, z: 150 }] },
  // Earthrise Basin (redesign 2026-10-02): the outpost's landing field (also the turbo-ball kickoff) and the open
  // floor either side of it on the valley track, rotationally symmetric about the landing field.
  moon: { kickoff: { x: 0, z: 0 }, zones: [{ x: -102, z: 30 }, { x: 0, z: 0 }, { x: 102, z: -30 }] },
  // Orchard Valley (layout brief, 2026-10-02): the bounded search's validated seats, west of the bathhouse village, in
  // its square and east of it on the valley road; the kickoff beside the square.
  orchard: { kickoff: { x: -36.4, z: 3.9 }, zones: [{ x: -98.7, z: 60.1 }, { x: -36.4, z: -4.1 }, { x: 68.2, z: -4.5 }] },
  // Longleaf Crossing (layout brief, 2026-10-02): the western loading bays (nearer the northern landing), the crossing
  // south of the timber yard (nearer the southern height) and the eastern cut on the line of equal drives, so each
  // team's nearest, middle and farthest zones lie within 6 % of the other's; the kickoff on that line.
  longleaf: { kickoff: { x: 25, z: -20 }, zones: [{ x: -147.5, z: 83.2 }, { x: -10, z: -45 }, { x: 95, z: -20 }] },
  // Skybridge Chasm (redesign 2026-10-03, the layout turned about the shoulder system's middle (5, 60)): three discs on
  // the line of equal driven distance, each on an apron in the map file — the west lane's yard, the gorge's west shore
  // between the lake and the west middle segment (also the turbo-ball kickoff) and the east lane's yard. Driven reach
  // 495 / 484 m, 407 / 428 m and 465 / 508 m.
  skybridge: { kickoff: { x: -139, z: 49 }, zones: [{ x: -300, z: 62 }, { x: -139, z: 49 }, { x: 310, z: 42 }] },
  // Olympus Basin (layout 2026-10-03, turned about the station): three discs on yards of equal driven reach — the
  // north-west yard (bravo's near zone) and the south-east yard (alpha's near zone), each the other's rotation about the
  // station and each an apron in the map file, and the station's west yard on the deployments' bisector (a validated seat
  // on its floor, also the turbo-ball kickoff). Driven reach (the blocks 257 m out) 417 / 274 m, 278 / 273 m and
  // 269 / 415 m.
  mars: { kickoff: { x: -40, z: 36 }, zones: [{ x: -170, z: 120 }, { x: -40, z: 36 }, { x: 185, z: -80 }] },
  // Copper Mesa (layout brief, 2026-10-02): the zones keep their validated seats on the loading shelf; the turbo-ball
  // kickoff is the bounded search's validated seat by the pit's rim, which both teams reach over near-equal drives.
  copper_mesa: { kickoff: { x: -42.48600289336476, z: -3.085425678063796 }, zones: [
    { x: 95.75601429460295, z: 25.16493186989846 }, { x: 103.52551824388397, z: -48.38643546884091 },
    { x: 159.75453586673763, z: -8.089799185507083 }] },
};
