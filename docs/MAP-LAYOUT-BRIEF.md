# Battlefield layout brief

October 1, 2026. Owner decision: grounded realism, and everything about a map may change, its layout included.
This brief says what a battlefield must be as a place — the shape of the ground, what stands on it, where the
teams start and what they fight over — and gives each requirement a number that
`node tools/map-layout-metrics.mjs` computes from the same inputs a multiplayer host plays on. Lighting, skies,
clouds, vegetation systems and terrain materials are other briefs; this one owns landform, water, roads and rail,
settlements, structures, fortifications, props placement, spawns, objectives and the collision manifests and
tactical-map plates those produce.

## What the current maps get wrong

Census of all 33 maps on the PR branch before the pilot (`67824820d`, `tools/map-layout-metrics.mjs`; raw rows in the
lane's scratch output):

- **One skeleton under many maps.** Verdant's five landforms are two flank ridges near x = ±250, a north ridge, a
  south-east knoll and a south-west basin. Twelve maps keep at least three of them within 75 m. Twenty-five keep at
  least one of Verdant's three strongpoint sites within 60 m, and Sirocco Wadi, Saltwind and Olympus Basin keep all
  three. Sirocco Wadi and Olympus Basin also keep Verdant's default country cross for their roads. The owner's clone
  verdict of September 23 named three maps; this census finds the skeleton under nine more.
- **Lattice roads.** Steinburg (4 × 4), Cinder Junction (3 × 3), Ironworks (3 × 3 plus three diagonals) and
  Ruinspires (6 × 6) run straight streets from edge to edge. Roads should link places, not tile the square.
- **Unbalanced objectives.** Zone control and turbo-ball objectives derive from the spawns. Where a derived point
  lands in a building or on a slope, the placement search moves it toward whichever team is nearer. On seven maps
  the worst team-to-objective distance ratio is 2.5–5.9. Steinburg's centre zone lands 31 m from the bravo pad and
  655 m from alpha.
- **Close spawns.** Verdant, Sirocco and Olympus put the teams 457–470 m apart; the rest of the rotation uses
  650–870 m.
- **Maze or field.** Steinburg's town core is 88 % cover with 20 m sightlines, and its outskirts are open lawn.
  Nothing grades between them.
- **Flat brownfields.** On Cinder Junction (relief σ 2.4 m), 12.7 % of rays run 300 m or more down its straight
  streets. Only Mangrove's open water and the Badlands canyon floor let more rays run that far.
- **Dressing logic.** Twenty-seven maps have solid props in the 3.5 m carriageway (Ruinspires 33, Blackglass 19,
  Steinburg 12), and four have solid props standing in water. Most come from the shared rubble, boulder, field-work
  and wreck passes, which clear a prop's centre rather than its footprint.
- **Pacing.** The bot pacing receipt's median is 217.8 s against its 240–480 s band. Short or open maps finish
  first: Saltwind 149 s, Verdant 160 s, Ironworks 161 s.

## What a grounded, readable tank battlefield needs

1. **One geological story.** Name the process that made the ground: a wadi cut between two sandstone benches, a
   town on a hill spur above two valleys, a railway embankment across a graded basin. Every rise, cut and flat
   follows that story and its axis. Unexplained mounds and borrowed landform sets do not.
2. **Roads that link places.** Roads run between settlements, crossings and the outside world at the border. They
   follow the easy ground (valley floors, terrace edges, contours), meet at junctions, and cross water at bridges
   and fords. Settlements stand where people would build: at water, crossings and junctions, on a terrace above
   floods. Buildings face their road. Nothing solid stands in a road core. Nothing stands in water except marine
   works.
3. **A deliberate mix of sightlines.** A map offers long lanes (300 m and more) where the landform allows, and
   breaks them with crests, buildings and woods so no lane runs from spawn to spawn. Most lines break between 60 and
   200 m. Towns are close-quarters ground by design, and so are its core sectors.
4. **Three lanes.** At least three approach lanes cross the midfield, separated by sightline breaks: a crest, a
   built block, a wood or a cutting. Taking a flank is then a real choice. A flank costs at most 45 % more driving
   than the direct route.
5. **Hull-down ground and a cover gradient.** Each half offers reverse slopes that hide a hull from the enemy side
   while the gun clears. Cover rises from the spawn bands toward the contested middle without a binary step from
   maze to field. Every sector keeps some cover.
6. **Spawns.** The two anchors stand 600–860 m apart on flat, dry pads, screened from the opposing spawn, with
   first cover a short drive away.
7. **Symmetric value, not mirrored geometry.** Each mode's objectives, derived from the spawns by the shared
   placement, are reached by both teams over near-equal driven distances. Any asymmetry is authored and documented
   in the map file.
8. **A distinct identity.** No map reuses the Verdant skeleton. Each map's landform, road net and beats come from
   its own reference, recorded in its file header.
9. **Readability.** Landmarks such as a minaret, a station water tower, a church spire or a slag heap orient
   players. The tactical-map plate shows the same structure the ground has.
10. **Budget.** On the desktop high tier a redesign keeps draw calls and triangles within 10 % of the map's
    previous budget unless the owner approves more.

## Measurable checks

`node tools/map-layout-metrics.mjs [--maps=a,b] [--json=out.json] [--check]` reads the map config's height field
(terrain seed from the collision manifest index) and the committed collision manifest. It runs without a browser;
the whole fleet takes about a minute. `--check` exits 1 when a map misses a band. A map may name a deliberate
exception in `layoutBrief: { exceptions: { <key>: '<reason>' } }`; the check then reports the reason instead of a
failure. A map at a scale of its own may instead hold its own enforced bands (below, "Bands of a map's own").

| Key | What it measures | Band |
| --- | --- | --- |
| `spawnSeparationM` | Player pad to the enemy arc centroid (the anchors every objective derives from) | 600–860 m |
| `spawnScreened` | Neither anchor has line of sight to the other (eye 2.4 m, target 1.9 m) over terrain and structures | 1 (screened) |
| `routeStretch` | Driven route between the anchors over a 5 m passability raster (slopes from the shared mobility law, solid obstacles, deep water) ÷ straight line | ≤ 1.45 |
| `lanes` | Median over slices at 35 / 50 / 65 % of the axis of the drivable runs ≥ 40 m wide on a route ≤ 1.6 × the shortest, split where neighbours lose sight of each other or foliage between them adds ≥ 0.6 concealment | ≥ 3 |
| `chokeMinM` | Narrowest total passable width of any slice across the axis between 20 and 80 % | ≥ 120 m |
| `sightMedianM` | Median distance at which a ray breaks: a target 1.9 m above ground stays hidden for 24 m from an eye at 2.4 m, over terrain and every non-tree collider, from a 20 m lattice of drivable points, 24 azimuths, 445 m (the spotting cap) | 80–150 m |
| `sightLongShare` | Share of rays that run 300 m or more | 0.03–0.15 |
| `sightCloseShare` | Share of rays that break inside 100 m | 0.25–0.62 |
| `coverMidShare` | Middle band: share of drivable 10 m cells hidden (≥ 2.3 m) or hull-down (1.1–2.3 m) by a feature within 40 m toward the opposing spawn | 0.30–0.75 |
| `coverSectorMin` | The least-covered of the nine sectors (three bands along the axis × three across) | ≥ 0.15 |
| `hullDownTeamShare` | The poorer team half's share of hull-down cells | ≥ 0.10 |
| `reliefStdM` | Standard deviation of drivable ground height | ≥ 3 m |
| `orphanBuildingShare` | Buildings farther than 60 m from any road | ≤ 0.15 |
| `solidPropsInRoad` | Solid props whose footprint enters the 3.5 m carriageway (bridges excepted; hedgehog and barrier roadblocks are reported apart) | 0 |
| `solidPropsInWater` | Solid props standing in water (marine works excepted) | 0 |
| `objectiveSymmetry` | Zone-control zones and the turbo-ball kickoff: each team's driven distances, sorted and compared pair by pair (floor 60 m); the worst ratio | ≤ 1.25 |

Invariants that receipts already own stay with them: spawn-pad flatness and objective placement and
reachability (`src/sim/matchPlacement.selftest.mjs`, `server/botModes.selftest.mjs`); collision parity between
the client world and the manifest (`server/dedicatedWorldCollision.selftest.mjs`, plus a byte-identical recapture
after any layout change); and bot pacing (`server/battlePacing.selftest.mjs`).

A map rebuilt to this brief joins `src/world/maps/layoutBriefMaps.ts`. Its receipts are then:
`src/world/mapLayoutBrief.selftest.mjs` (every band above holds or carries a written exception; the zone-control
discs and the turbo-ball kickoff seat within 1 m of their hints and both teams reach them; no landform or
strongpoint on Verdant's skeleton), `src/world/maps/roadGradeSmoothing.selftest.mjs` (one connected road network
whose sampled grade stays at or under 18 % at three terrain seeds) and `src/world/mapQuality.selftest.mjs` (at
least three strongpoints, every role present, each at least 180 m from the others).
`server/collisionManifestDrift.selftest.mjs` rebuilds every shard in Node and fails on any that no longer matches
the tree.

### Bands of a map's own

A map built at a scale of its own holds its own bands instead of an exception:
`layoutBrief: { bands: { <key>: { band: [min, max], reason: '<why>' } } }`. A map band replaces the shared band for
that key and is enforced like it: a miss fails, and the check names the band and the reason. Use one only when the
scale itself is the design, and derive the band from that scale, not from the value the map happens to reach.

Olympus Basin (`mars`) is the first: the compact arena of the Mars mode (the owner, 2026-09-18), played at 0.38 g, with
its deployments about 500 m apart where the brief's fields stand 600–860 m. Its distance bands take its scale, about
0.64 of the brief's:

| Key | Shared band | Olympus Basin | Why |
| --- | --- | --- | --- |
| `spawnSeparationM` | 600–860 m | 420–520 m | centred on the arena's first 470 m; the pacing fix stands the blocks 513 m apart, inside it |
| `sightMedianM` | 80–150 m | 55–100 m | the shared band scaled by 0.64 |
| `sightLongShare` | 0.03–0.15 | 0.01–0.15 | a 300 m line is 64 % of the separation (35–50 % on the brief's fields) |
| `sightCloseShare` | 0.25–0.62 | 0.25–0.68 | more blocked rays end inside 100 m on a field this size |

Every other band (lanes, chokes, cover, hull-down, relief, dressing, objective symmetry) holds at the shared value.

### Apron banks

An apron (`terrain.hardstands`) is stamped into the road grids. The ground holds the apron's plane to 3.8 m outside
it and is back on its own height by 14 m, so the bank is about 10 m wide whatever height it has to make up. An apron
standing metres off its ground turns that band into a wall: Monsoon's first assembly apron sat at 1.0 m on a hillside
5–15 m high, and a bot fell 12 m off the cut six seconds into a match. The law holds on every map: **no apron may make
its bank steeper than 0.6 where the ground without it is gentler by 0.25.**

- `node tools/hardstand-banks.mjs [maps]` samples the band from 1 m outside each apron to a metre past its bank
  (11 m for the road blend's own) every 4 m, and counts the points steeper than 0.6 and 0.25 steeper than the same
  point with that apron removed. The game's terrain seed (1337) is the one that counts.
- `src/world/hardstandBanks.selftest.mjs` fails on any apron with such a point, except the ones its pending list
  names with their owner. The list only shrinks: an apron that is clean fails until its entry goes, and the list must
  be empty before PR #9 is ready.
- `node tools/hardstand-site.mjs <map> <index> [--seat=30,7] [--tilt] [--road] [--banks=16,24]` searches sites,
  sizes, levels, tilts, road-following planes and bank widths for one apron. It builds each candidate into the
  height field, keeps the ones whose centre still seats what the apron carries, and ranks them by walls, distance
  moved, bank width and steepening.

Siting an apron:

- Put it where its ground spreads least, at that ground's median height, not at the height of the nearest road
  (the default when `level` is omitted).
- Fix it in place before moving it, so the seats it carries keep their driven distances. Two authored fields help:
  - `bankM` widens the bank beyond the road blend's 10.2 m (the scan's band follows it). Ground a few metres off the
    plane all round then meets the apron at a slope a tank climbs.
  - `grade` tilts the apron along its length, up to 8 %, with `yawDeg` turning the length down the fall line. A zone
    disc (7 m of relief over 60 m) and a turbo goal (5 m over 36 m) still seat on it. A fitted road grade stays
    within 1 %.
  - Where a sloping road crosses the apron, omit `level` and set `grade: 'road'` with the length along the road. The
    apron then takes the road's own height and grade (up to 8 %) at every terrain seed. A fixed level or grade kinks
    the road at the apron's edges on the seeds whose ground differs, and `roadGradeSmoothing` checks three.
- Size it to the seat it carries (zone disc 30 m, turbo goal 18 m, flag 12 m). Do not size it to the area you would
  like paved.
- An apron that carries a team's turbo goal stands on the team's pad, inside the mode arena
  (`MATCH_MODE_ARENA_HALF_EXTENT_M`, 420 m, less the goal's 18 m). If no ground there is level enough, the
  deployment moves to ground that is.

## Procedure for one map

1. Write the reference and geological story into the map file header.
2. Author the layout: landforms, water, roads, rail, settlement rect, planned sites, beats, wall runs, props
   counts, spawns, and objective hints in `src/sim/matchObjectiveLayouts.ts`. Game-mode rules stay in
   `src/sim/matchRuleset.ts`.
3. Iterate with `tools/map-layout-metrics.mjs` and a plan-view plot until every band passes or carries a written
   exception.
4. Rebuild the collision shard in Node (`node tools/capture-world-collision-manifests.mjs --node --maps <id>`;
   `--check` compares shards with the tree without writing). Confirm once that the browser capture
   (`--headless`) encodes the same bytes, and re-bake the tactical plate
   (`node tools/bake-minimap-assets.mjs --maps <id>`), each under the probe mutex.
5. Run the map's receipts. Re-pin the receipts it moves, with before/after evidence in the commit.
6. Bots: run seeded matches on every supported mode. The map's median standard match must fall inside 240–480 s,
   with no stalemate and no stuck bot.
   Falls: count the damaging falls (`tank_impact` events with cause `fall`) in seeded 7v7 Standard and Endless Horde
   matches, four seeds each, on the old layout and the new one. None of three numbers may rise: the total fall
   damage, the worst single fall, and the count of falls of 50 hp or more. A drop under 50 hp is a kerb or a bank
   taken at speed and does not count; moving a road or a bank moves where such drops happen without making the map
   more dangerous. A bare count of falls is too crude: on Titan Gorge it rose 9 → 24 in Endless Horde while the total
   fell 1134 → 637 hp and the worst fall 457 → 88 hp.
7. Multiplayer: the host loads the new shard, and a headless peer-to-peer run plays the map
   (`node tools/mp-p2p-headless.mjs --map=<id> --world=dedicated`).
8. Capture chase, bird and tactical-overhead views before and after; measure draw calls, triangles and frame time
   in alternating A/B pairs.
9. Commit one map per commit.

## Authoring notes from the pilot

Sirocco Wadi, Steinburg and Cinder Junction were rebuilt first (October 1, 2026). These laws of the shared terrain and
props code shaped every layout, and the next maps should start from them:

- **Road ends.** Authored paths stop inside the square (about ±448 m). The endpoint completion
  (`src/world/maps/roadEndpoints.ts`, one intent per road) then adds the exit and grades it through the rim. A path
  drawn to ±512 is not graded and climbs the rim at the rim's slope.
- **Aprons are planes.** A hardstand is a flat plane (its grade clamped to ±1 %) feathered into the road grids over
  14 m beyond a one-cell guard. On a road steeper than about 5 %, a 60 m apron makes its approaches ramp past
  18 %. Put aprons on level ground (inside a settlement's grading), shorten them along the road, or let the zone
  seat on the road's natural floor and record the validated seat as the hint.
- **Junctions.** The legacy grading blends each pair of roads at one junction only, so a lane that leaves and
  rejoins the same road is graded at one end. Split such a lane where it meets a cross street, or use physical
  road stations (`src/world/maps/roadStations.ts`), which grade every real crossing. Junction plateaus need room:
  two crossings 50 m apart compress the grade between them.
- **Physical stations.** On a physical-station map, poles and roadside lots stand at road vertices at least 24 m
  apart, so road 0 needs a vertex every 24–25 m to carry a complete utility line.
- **Streets and the bot planner.** The planner's 25 m grid blocks any cell with a solid within 3.5 m of its centre.
  Inside a dense town, run the streets on the grid's lines (coordinates ≡ 0 mod 25 from −500) so the street-front
  rows leave chains of open cells.
- **Street rows.** Rows check their distance to other roads, not to other legs of the same road; chamfer a lane's
  corners so one leg's strip cannot reach into the next.
- **Lanes.** A lane boundary needs a feature that hides one run from the next or cannot be driven: buildings,
  works, steep banks, woods. A smooth ridge, however tall, does not separate lanes. Put such features on the
  slices at 35 % and 65 % of the axis.
- **Planned sites.** A planned site is skipped when its centre is within 7.5 m of a road or on a rail berth, and
  rejected when the ground under its footprint varies by more than the map's `maxSpread`; check that every landmark
  actually stands.
- **Worked ground.** A `workedGround` patch takes at most 24 vertices; split larger ones.
- **Footprints, not centres.** The rubble, boulder, field-work, wreck and well passes keep a solid's whole footprint
  4 m from every road centreline (`src/world/roadFootprint.ts`): the 3.5 m core plus the road-distance grid's margin.
  A wreck or rubble pile that reaches in steps straight off the road, and a well takes the nearest clear seat round its
  junction. A boulder or field-work piece that would reach in is left out, with its draws still taken so no other
  placement moves. Planned and street-row buildings still clear only their centres; that law is its own fix.
- **Bot hit rates.** The bots' moving-battle hit rate follows the ground between the hulls, so clearer sightlines raise
  it. The authoritativeBots calibration (four bots from fixed seats 250 m apart, eight seeds) runs on Verdant. Run on
  each batch-1 map with the aim model unchanged, it rose 67.0 → 71.7 % on Verdant Fields, whose even village square
  replaced the old roll. It fell 69.6 → 65.4 %, 65.8 → 61.5 % and 60.0 → 57.6 % on Frontier Basin, Saltwind Narrows
  and Saltmere Bay, where banks and hedges now stand between the seats. Re-pin that receipt's ceiling from
  before/after rates (Verdant's moved 0.70 → 0.76).
- **Placed structures and vegetation.** A structure placed after the vegetation pass that needs clear ground (Mangrove
  Reach's fishery wharf) publishes its footprint through `placedStructureClearances`
  (`src/world/vegetationClearance.ts`), computed from the same landing and pose its placement uses
  (`src/world/fisheryWharfSite.ts`). Trees and bushes keep off it. Every other map's vegetation stayed byte-identical
  on desktop and phone.
- **Rubble on dry ground.** Street rubble never takes a seat on the water mask.
- **Tidal maps keep lowland relief.** Where river landings stand, the channel receipts pin `hillScale` at or under 0.25
  and `microScale` at or under 0.3, and the lake bank blend flattens any landform beside a channel (a 10 m knoll reads
  as about 0.1 m on the bank). The relief comes from authored landforms away from the water: pond bunds, levees broken
  at the crossings, and chenier islands.
- **Planned buildings face their road.** A `compound` plan entry has no frontage axis and can stand in the
  carriageway. A map rebuilt to the brief plans frontage buildings (cottages, farmhouses) and takes the road-site law in
  `src/world/props.ts`.
- **Marine structures.** A wharf seated on its landing stands over the water by design; the map names it as a
  `solidPropsInWater` exception.
- **Shelves end in cliffs.** A long shelf whose ends taper is a ramp onto its cap, and bots drive up it and fall off
  the walls. End a shelf in cliffs (`cliffEnd` on a ridge's geology) short of the deployments. On Titan Gorge, four
  seeded standard matches took 15 damaging falls on the old mesa field (4259 hp, the worst 1274 hp) and 4 on the
  660 m shelves with cliff ends (61 hp, the worst 25 hp). Its first shelves, with tapered ends, took 29 falls in
  Endless Horde (3383 hp, the worst 1442 hp).
- **Rock without a mesa field.** A map that drops its noise mesas for authored shelves and buttes sets
  `landformRock`, so the terrain's rock gate reads its rock landforms (butte, inselberg and lava-flow profiles, and
  slag) instead (`src/world/landformGeology.ts`).
- **Canyon maps.** On Redrock Divide the canyon (`src/world/redrockCanyon.ts`) stays the regional terrain, and the
  authored landforms are floor features: inselbergs, dune ridges and sand ramps. `mapQuality` checks that each one
  stands on the canyon floor. An inselberg is a steep dome with `corridorScale: 1`, so a deployment corridor that
  crosses it leaves it whole and the bots drive round it.
- **Aprons are paved.** A hardstand paints the road mask, so a zone apron reads as packed track surface. Seat one
  where such ground belongs: a square, a farmyard, a depot's vehicle park.
- **Braided rivers.** A river that splits round a char is authored as trails: the main course and each branch, whose
  ends join the main course. environmentExpansion checks each trail's continuity and the joins (Jade River Delta).
- **Cross-road ends.** Start a cross road on a node of the road it meets, as Delta's cross road starts on the west
  road's node. Left to the endpoint completion, the extension met the other road 1.7 m lower and climbed to it at 29 %.
- **Settlements stay where they stand.** The owner's ruling (October 3, 2026): no layout change moves a settlement
  building that PR #9's head has. A town is fragile. On Titan Gorge each of these re-seated it on its own: the noise
  mesas' removal, the aprons, the shared road nodes, the landforms, alpha's spawn and the road setback (18, 1, 6, 1, 20
  and 3 of 28 houses kept their places). On Ironworks, bravo's new deployment corridors did it (33 of 46). A rebuilt map
  keeps its town in one of two ways:
  - Where the inputs the town is built from can stay as they were, keep them. Verdant keeps the country road
    generator, whose 32 m nodes are its frontage lots.
  - Otherwise record the town from the build that has it and replay it:
    `node tools/record-town-plan.mjs --root=<checkout> --write=src/world/maps/townPlans.generated.ts <maps>`, then set
    `props.townPlan` and `props.townLightPlan`. Each planned building is rebuilt from its own recorded stream at its
    recorded pose, whatever the ground, roads or aprons under it have become. Each light building (the huts, tents
    and sheds of `placeDestructibleBuildings`) stands at its recorded pose. The generated road, row and block-fill
    passes place nothing more.

  `src/world/townPlans.selftest.mjs` holds every recorded town against the footprints PR #9's head's shards carried.
- **Buildings in a carriageway.** `props.roadBuildingClearance` runs once every settlement building stands. It moves a
  building whose footprint stands within the 3.5 m road core by the least distance that clears it: rings of 0.5 m out
  to 30 m, on 15-degree bearings starting away from the road. The building keeps its ground fit and stays clear of
  every other footprint and strongpoint. Nothing draws, so every other building stays exactly where it stood. A map
  can author the place instead (`props.roadClearanceTargets`, checked alike).
  Blackglass: 8 of its 150 blocks moved 1–9.5 m. Its civic hall at (-101.9, -85.8) stood across road 3 at the
  district's crossroads, against road 1's edge, on the line between the deployments, with no clear place inside 30 m.
  Bending the roads round it was not open: the district is generated from them, and road 1 ran through a 5 m gap
  between the hall and the next block. Its nearest clear place, 36 m south beside alpha's approach, let the south
  deployment win 28 of the swap test's 40 games (22 with the hall in the road). The authored place, on the avenue's
  north-west side 59 m north, stands on that line again: the south wins 22. Weigh a big building's move like a
  layout change, with the swap test. `server/roadCrossingSweep.selftest.mjs` drives
  every bridge, deck and causeway on the lane's maps both ways at road speed (after the physics lane's crossing
  sweep, which found hulls stopped by buildings and rocks 0.4–2 m from a road's centreline). A run must reach its end
  without a hard contact or a stall.
- **Equivalent deployments.** Both teams deploy in the same shape: bravo's seven pads are alpha's 4 x 2 block mirrored.
  Then run the bots lane's swap test (`fair-swap`: the same 20 seeds with the deployments exchanged). If one deployment
  wins two thirds or more of the paired games (24 of 36), the positions differ as well. Turn the layout about its
  centre: each block, its screening feature, its near objective and its strongpoints become the other's rotation, and
  the middle disc stands on the deployments' bisector. Turn the rock with them: turning the deployments alone does not
  help when the walls around them differ. The north deployment's share of the 40 swap games, before and after the turn:
  - Titan Gorge: 27 → 24.
  - Skybridge Chasm: 27. Its deployments alone were turned three times (23, 30 and 28): its 300 m south segments
    against 160 m north ones kept the north ahead (81 of 120). With the segments turned about the shoulder system's
    middle as well: 21, and 22 once the pacing fix stood the deployments 721 m apart.
  - Olympus Basin: 34 → 22, with its rock authored in pairs about the station; 15 once the pacing fix stood its
    blocks 257 m out (the south deployment 25 of 40, binomial p 0.15).

  Glacier Pass, Obsidian Caldera, Ironworks and Blackglass were already even with blocks alone (20–24 of 40).
- **Noise mesas and roads.** A noise mesa field stands its walls wherever the noise crosses its threshold, so at some
  terrain seeds a road runs along a wall's foot or over it. Olympus Basin's country roads reached 30 % at two of the
  road-grade law's three seeds. Author the rock instead, off the roads: Olympus Basin's four mesas and two craters are
  paired about the station, and its roads stay under 14 % at all three seeds.
- **Shoulders and noses.** Where a deployment corridor or a settlement's feather crosses a narrow rock wall, it lowers
  the wall into a ramp onto its cap. Bots that climb it fall off the walls. Keep such walls whole (`corridorScale: 1`,
  `settlementScale: 1`), and the bots drive round them. End a wall segment in a nose (`cliffEnd: 'nose'`), whose wall
  and talus turn round the end, not in a cut. A cut end drops its talus apron in a step that bots drive off. Skybridge
  v6 lost 1556 hp in four standard matches at the cut ends; with noses and whole walls it lost 170 hp in twelve.
- **Separation and pacing.** `server/battlePacing.selftest.mjs` plays four 2v2 bot matches a map at its own seeds
  (21000 + the map's index x 1000 + 0..3, an idle human on alpha). No match may end inside 90 s, and at most 4 of the
  fleet's 132 inside 120 s. A layout that brings the deployments nearer, or opens the road between them, brings contact
  sooner: Skybridge's rotation stood alpha 120 m nearer and one match ended in 102 s; Olympus Basin's blocks on its
  open north–south road ended one in 81 s. Fix the layout, not the receipt. Lengthen the separation inside the map's
  band (Skybridge 677 → 717 m, Olympus Basin 469 → 513 m) and stand a gate butte beside each road approach, so a
  block's bots leave round it. Give a gate butte a sheer section with a rim (talus only at its foot): Olympus Basin's
  first pair, with the butte profile's climbable apron, cost a 235 hp fall in horde. After the fix, Skybridge played
  270 / 153 / 132 / 269 s and Olympus Basin 184 / 243 / 201 / 90 s at their seeds.
- **Budget.** All three pilots exceed point 10's 10 % triangle budget. The coordinator approved this for PR #9 on
  October 2, 2026, pending the owner. The extra triangles are content the brief wants. Trimming goes to frame-time
  work, such as shadow caching and LOD for parapets and wire, rather than to removing content. Whole-map prop
  triangles changed as follows:
  - Sirocco Wadi +16 %.
  - Steinburg −21 %; its vegetation grew 8 % on the old town core's ground, which renders 18 % more triangles at
    the fixed overhead pose.
  - Cinder Junction +33 %. Of its +282 k prop triangles, 172 k are the sandbag parapets and wire belts of the four
    standard field-trench lines, which the old street lattice left no room for.

  Draw calls fell at the fixed overhead pose: −10 %, 0 % and −21 %.


## Authoring notes from batches 5–8

Maps lane B rebuilt Aegis Crossing, Ruinspires and Kestrel Airfield (batch 5) on October 2, 2026. These laws came out
of them:

- **Viaducts.** `terrain.bridges` lays a level deck over dry ground. The brief metrics read the deck
  (`tools/map-layout-metrics.mjs`): a deck cell passes at the deck's height and joins the ground only beyond the
  abutments, so the gorge under a viaduct is neither a cliff on the deck nor a link down to the bed. The road
  constructor levels the stations over a viaduct's span to the deck (`levelViaductSpanNodes` in `src/world/terrain.ts`).
  Before, they sampled the bed under the span, and the abutment approaches ramped past 18 %. `roadGradeSmoothing`'s
  brief section grades the deck plane over a span.
- **Nothing to stand on under a deck.** Bots on a gorge floor under a viaduct and bots on its deck cannot shoot each
  other, and the planner's 2.5D grid snaps both to the deck. Aegis Crossing closes the floor under the span with a rock
  rib too steep to drive, so the floor's two reaches meet only over the bridge.
- **Sheer walls.** A gorge wall that the planner's 25 m grid reads as one cliff must be one. Troughs stacked to the
  same wall line climb at a 1.0–1.3 grade along their whole length. A terraced wall with a drivable step lets bots
  onto ledges they cannot leave.
- **Fences and decks.** A roadside fence run leaves out the modules and gates over a bridge deck's footprint and still
  takes their draws (`src/world/props.ts`). Aegis Crossing's run used to hang down the gorge wall under the span.
- **Open squares.** Street rows clear only their centres, so a city square's zone disc seated by luck.
  `props.streetRowKeepouts` keeps every row building's whole footprint out of a named disc. Author one for each square
  that seats a zone or the kickoff.
- **Paired landmarks.** The roadside plan hands out its list in road order, which stacks the tallest structures along
  the first roads. A symmetric map authors its landmarks as `plannedSites` pairs: Ruinspires rotates them about its
  central square, and Aegis Crossing mirrors them across the gorge. `mapQuality` counts planned sites with the plan.
- **Rear seats.** A 1 v 41 field seats its hostiles up to about 45 m behind the enemy pads, and `battleSides` checks
  this on Ruinspires. Keep a map's pads at least 45 m inside the playable edge.
- **Bridgehead standoffs.** Before the bots' second pass, Aegis Crossing's capped matches were standoffs between the
  two abutments, 200 m apart across the deck: over three minutes of one, six bots there fired 30 shells, and the
  shooters standing beside a deck end put theirs into its parapets. The routes from a deck end down to the gorge floor
  run 610 m, against 200 m over the deck, so no bot flanked. Removing the rim lips did not help (two of three capped
  seeds still capped, and bots fell into the gorge). On the second pass no match caps (16 all-bot, 8 standard).
- **Frozen fixtures.** When a map is rebuilt, a receipt that pinned its ground keeps that ground as a fixture.
  `botGunLane`'s Airfield crest is now the old height profile along its shot line
  (`src/sim/fixtures/airfieldCrestProfile.json`).
- **Apron banks.** Maps lane A's scan counts the points of an apron's bank steeper than 0.6 and 0.25 steeper than the
  ground without the aprons. A 100 m market square on Aegis Crossing reached 6 m from the end of a rim lip (10
  points); at 80 m it clears it. Kestrel Airfield's runway ran past its graded core into the plateau's noise (13
  points at its east end), and a shoulder berm sat inside its blend (68 more); the core now spans the runway, and the
  berm stands off it. Run the scan on every apron you author.
- **Ramps.** The bot planner's 25 m grid does not see a 12 m earthwork, so bots drive over it, and a 4.5 m revetment
  launches them: two to six damaging falls a match on Kestrel Airfield, up to 387 HP. At 3.2 m the revetments still
  split the lanes and cost about one 50-140 HP fall a match.
- **Sides.** Alpha's bots seat round the player pad within 25 m, and its rear rank stalls for about 20 s while the
  front clears; bravo's seven pads stand 40-60 m apart and leave at once. On an open map whose centre the first bots
  reach in 40 s that decides matches: with alpha in Kestrel Airfield's south half bravo won 13 of 16, with alpha in
  the north 8 of 16. Test both sides on a rotationally symmetric map and choose by the result.
- **Slowing a rush.** A boggy valley floor (`terrain.marshes`, soft ground) between each assembly ground and the
  centre slows every approach but the causeway roads. On Kestrel Airfield it lifted the fastest battlePacing seed from
  116 s to 171 s.
- **Sealed blocks.** Street rows on both sides of every street can seal a block's interior; a bot hunting a hull beyond
  it presses at the gaps until the match times out. Leave one side of a contour street open (`streetRowKeepouts`
  rectangles: Ruinspires' terrace gardens).

Batches 6–8 (Copper Mesa, Earthrise Basin, Orchard Valley, Longleaf Crossing; Tarkhan Steppe, Amberford,
Frosthollow, Nordhavn Fjord; Sunscar Oasis, Whiteout Station; October 2–3, 2026) added these:

- **Road-graded greens.** An apron a lane crosses at a fixed level kinks the lane on the terrain seeds whose ground
  differs: Amberford's greens put 47 % into a lane at seed 2025. Give such an apron `grade: 'road'` with its length
  along the lane. At a crossroads, turn it along the road that climbs (Frosthollow's moraine crossroads).
- **Exits beside cuttings.** A road exit graded through the rim cuts a corridor whose shoulders reach about 60 m.
  Tarkhan Steppe's station road ran 50 m from the rail cutting and lowered the ring's plateau beside the notch; its
  last node now turns the exit 99 m away.
- **Scarps.** A road straight up a terrace scarp exceeds 18 % (Nordhavn Fjord's northern roads: 21–26 %). Cross it
  on a diagonal. A ramp landform near deployment pads does nothing, because the pads' clearing fade (36–90 m) takes
  it out.
- **Junctions on the flat.** Where two roads meet on a slope, their elevation grids disagree at the seam, and the 4 m
  sample reads the step as a grade (a 1.2 m step read as 30 %). Join roads where the ground is level.
- **Acute corners.** The roadside plan tests a building's centre, 7.5 m off any road, so a long building in the
  acute corner of a junction reaches the other road. `props.roadBuildingKeepouts` keeps roadside centres out of a disc
  (Nordhavn Fjord's town crossroads). Deep compounds need a wider `buildingLat` (Sunscar Oasis: 16–18 m).
- **Strongpoints.** A tactical beat stands inside ±360 m and at least 60 m from each of Verdant's three. Check that
  its structure stands after a move (`.qa-dev/beats-check.mjs`): on a steep site the structure is dropped.
- **Skeleton kinds.** The skeleton rule compares landforms of one kind: a ridge with Verdant's ridges, a knoll with
  its knoll, a basin with its basin. A scree cone (a knoll) within 75 m of Verdant's southern knoll counts.
- **Screens fade.** A berm near a deployment arc loses height to the pads' clearing fade. Whiteout Station's north
  berm, moved 79 m off Verdant's ridge, screens the deployments only at 8.4 m.
- **One-sided slowing.** Slowing ground decides all-bot matches when it lies on one side's approach. Two bogs south
  of Nordhavn Fjord's western town fixed a fast pacing seed but went 15-1 to the south, and a matching pair to the
  north still went 29-11 over 40 seeds. Before keeping a pacing fix, play 40 all-bot seeds.
- **One-sided shelves.** The bots' opening goals (`botOpeningGoal` in `src/sim/authoritativeMatch.ts`) sit in
  rotational symmetry about the midpoint of the two spawn anchors. A landform under one team's goals with no match
  under the other team's goals decides all-bot matches. On Copper Mesa an 8.6 m ridge ran north-south down the middle
  of the north approach (x −58, z 120–400). It lifted the north team's central goals 4–6 m onto a forward slope, in
  view of the south rim. The south won 29–11 over 40 seeds,
  whichever team deployed there, and took 15 of 16 first kills. With the ridge removed, the split was 19–21 in each of
  two 40-seed blocks. A copy of the ridge on the south side did not fix it (30–10). Compare the ground under each
  team's goals before you move the spawns.
- **Geology.** `src/world/maps/geology.ts` holds `gully()` (three nested troughs, narrowing toward the head) and
  `talusFan()` (a steep cone at a gully mouth with a low apron down the fall line). A `gorge` landform with a positive
  height is a mesa or butte: a level cap with faces steep enough to read as rock. Keep features that change a gorge's
  walls or floor under 40-seed review: buttresses on Aegis Crossing's walls fixed a fast pacing seed but brought back
  900 s standoffs between bots on the floor's two reaches.
- **Seeds re-roll.** Any terrain or prop change re-rolls a few battlePacing seeds. The borders pass's rim trees moved
  Aegis Crossing's seed 53002 from 217 s to 118 s with no change to the map's own layout. Read the 12-seed distribution
  and fix a fast or capped seed with a change that reads right on the map, not by trying perturbations until it
  passes.

## Regional building kits

October 3, 2026 (regional-buildings lane). The settlements of a rebuilt map are built in the architecture of the real
place the map stands on. Each kit is first-party procedural geometry under `src/world/maps/regional/`, one file per
region, registered in `index.ts`:

| Kit (`architecture`) | Region | For |
| --- | --- | --- |
| `hessian` | Osthessen, Fulda Gap: Fachwerk on Buntsandstein, plain tiles | Frontier Basin |
| `dalmatian` | Brač, Šibenik hinterland: limestone and render, canal tiles, outside stairs | Saltwind Narrows |
| `breton` | Finistère: granite and limewash, slate, coped gables, dormers | Saltmere Bay |
| `kolkhoz` | Prokhorovka: whitewashed khatas, thatch and asbestos sheet, kolkhoz brick | Verdant Fields |
| `polder` | Zeeland: brick farms, pantiles, tarred barns under thatch, a smock mill | Tidegate Polders |
| `eifel` | Rur dams: black-and-white Fachwerk on greywacke, slate, the dam company's stone | Highland Reservoir |
| `mekong` | Cà Mau: stilt houses of plank and palm, nipa and corrugated iron | Mangrove Reach |
| `bengal` | Jamuna chars: tin homesteads on earthen plinths, a tin bazaar, a mosque | Jade River Delta |
| `franconian` | Kronach, Meissen: framed and rendered town houses, plain tiles | Steinburg |
| `ksar` | Dahar plateau: vaulted ghorfa ranges, flat-roofed houses, a minaret | Sirocco Wadi |
| `siwa` (in `ksar.ts`) | Siwa: kershef houses heaped in old Shali's battered blocks, palm-beam ends, the tapering mud minaret, a spring in its stone rim, palm-rib souk stalls (the ksar's stall and helpers shared; the ksar's output byte-identical) | Sunscar Oasis |
| `wadirum` | Wadi Rum: block houses, rooftop tanks, the Desert Patrol fort | Redrock Divide |
| `ruhr` | Ruhr and Silesian junctions: soot-dark brick, yellow-brick bands, slate | Cinder Junction |
| `kohima` | Kohima 1944: bungalows under painted tin, a bazaar, Angami houses | Monsoon Ridge |
| `hostomel` | Hostomel (Antonov) airport: a barrel-vaulted cargo hangar, sheet-steel maintenance hangars, a control tower's glazed cab, 1970s terminal and office blocks | Kestrel Airfield |

**Adopting a kit is one line** in the map's props settings: `architecture: '<kit>'`. The plan builders still run
first: every draw, the ground fit, the UV jitter and the road frontage see the base geometry, so every building keeps
its pose, footprint and door side, and every later placement (walls, rocks, crates, trees) stays where it was. Only
then the kit replaces the building's geometry with the region's version of the same structure, inside the same
footprint. A structure the kit has no builder for keeps its base geometry. The light destructibles (field huts,
checkpoints, tents, guard posts) keep theirs too, unless the kit names a variant of the family in
`REGIONAL_DESTRUCTIBLE_TYPES` (`structureKit.ts`: the Bengal tin homestead, the Angami house, the Mekong long house and
pond hut): a variant keeps the family's footprint, class, hit points, crush threshold and broken state, and `props.ts`
swaps it in through `LOCAL_TYPES`.

**What a kit changes, and the receipts that follow:**

- Collision is derived from the regional geometry, so adopting or changing a kit regenerates the map's shard
  (`node tools/capture-world-collision-manifests.mjs --node --maps <id>`) and re-pins its census in
  `server/dedicatedWorldCollision.selftest.mjs` (obstacles and concealers do not move; colliders do).
- The map's roof and masonry textures become the kit's painted surfaces (`src/world/regionalSurfaces.ts`); the
  plaster and timber photo sets stay when the kit opts in.
- Walls and roofs render from three to five vertex-coloured buckets (`regionalPlaster`, `regionalPlaster2`,
  `regionalPlaster3`, `regionalStone`, `regionalRoof`) and painted joinery from `structureWood`: up to six draw calls
  more than the base map, whatever the number of buildings, and one multi-draw batch each for the fine timber and
  stone joinery (below).
- `src/world/maps/regional/regionalArchitecture.selftest.mjs` runs the road-building stage with and without the kit
  for every adopting map and fails if a building, a stream draw or a contact record moves, or if a kit building's
  collision-bearing parts reach more than 0.8 m past a side of its plot (or past the base geometry's own reach there).
- Layout metrics do not move with a kit (the cover and sightline bands read the collision manifest: rerun
  `tools/map-layout-metrics.mjs` for the map after its shard is regenerated, and report any band that moves).

**What a house carries.** The house grammar (`house.ts`) lays out plinth, storeys, jetties, gable, half-hip and hip
roofs with eaves, verges, ridge caps, gutters and downpipes, chimneys and gable stacks. Every window and door is cut
into its wall with a reveal as deep as the wall is thick (`HouseSpec.reveal`). `weather.ts` gives each house its own
tint from the kit's palette, darkens the wall foot with splash and rising damp, shades reveals and soffits, runs rain
stains under the sills and moss or lichen toward the eaves. A share of houses per kit (`ArchitectureStyle.wear`)
shows war damage: burnt-out windows with soot up the wall, boarded windows, a stripped roof patch; on its rendered
storeys the render spalls (a ragged band at the wall foot, a patch under a sill, a scar in a pier) to show the kit's
masonry under it (`HouseSpec.spall`; none on clay walls), decor from the wear context's own stream. A painted sheet
roof weathers down its slope: chalky toward the ridge, rust and grime along the eaves. `dressing.ts` adds
the lived-in parts a kit uses (window boxes, the bench by the door, a woodpile, the roof ladder, an aerial); they are
dressing (no collision) and the phones leave them out, so the collision a host certifies is tier-independent.

**Fine joinery and its draw distance.** What a long view cannot resolve is fine joinery (`EmitOptions.fine` in
`geometry.ts`): window frames and glazing bars, shutter rails, door panels and battens, downpipes, and the sides and
caps of every framing member, shutter leaf, jetty joist, dressed surround, sill, door frame, quoin and string course
(`fineSides`, `span(..., coarse)`, `quoin`, `band`: the faces that read at range stay, the few centimetres of side and
ledge do not). `props.ts` merges the timber and stone dressing's fine joinery by 120 m cell into one receive-only
multi-draw batch per bucket (`THREE.BatchedMesh`, culled by the frustum per cell; the always-drawn timber dressing is
one more instance), so a bucket costs one draw call whatever the number of cells, and shows a cell only while the
camera stands within the quality preset's fine-detail distance of it (Ultra 180 m, High 120, Medium 90, Low 70),
hiding it 15 m past that; at High a 7 cm frame is half a pixel at 120 m. Steinburg's always-drawn timber and metal
dressing falls from 0.31 M to 0.08 M triangles and its shadow-casting stone from 0.19 M to 0.10 M; its establishing
view draws two of 14 cells per batch, a street view three or four. A phone builds no fine joinery and culls the rest
of its timber dressing by the same cells (70, 60 and 45 m on its three presets); `?fx=off` changes the post effects
only, so a desktop with it culls as above. Mark a new part fine when it is under about 10 cm across, or when only its
face reads from the street; `fineDetailLod.selftest.mjs` holds the batches, their cells and the hysteresis, and the
regional receipt holds that fine joinery is receive-only dressing a phone never builds.

**The yards round the houses.** A kit that names `yard` in its `ArchitectureStyle` (`kinds`, `fence`, `gate`, `shed`,
`shedSize`, `garden`) gets yards on its houses of those kinds (`src/world/maps/regional/yards.ts`). The stage runs after
the wrecks on its own stream, so nothing placed before it moves. Each house's yard goes on its freest side: up to 8 m
deep and as long as that side of the plot, its ground clear of the road frontage (`ROAD_FRONTAGE_CLEARANCE`), every other
plot, the hard solids and the larger destructibles, the authored objective targets with a 3 m margin, the aprons, the
bridge decks and the spawn pads, dry and level. Fence or wall modules (the kit's destructible kind) close its three open
sides with a gate (or an open gap), the kit's own outbuilding stands in a far corner at `shedSize`, and kitchen-garden
beds (dressing, raised on a slope, left out on phones) take the other. The yard's ground grows no grass carpet,
tall-grass crop or litter (discs over the enclosure join the scenery's ground-cover holes in `map.ts`), and a field's
sown crop rows stop at its fence. Every element is checked on its own and skipped
where it does not fit. No house body or plot moves. The props group carries the counts (`userData.regionalYards`),
`yards.selftest.mjs` holds the planner's clearances, and a kit that adopts yards regenerates its map's shard and re-pins
its census (obstacles rise by the modules, gates and sheds).

**Adding a builder or a kit.** A builder is `(ctx) => RegionalParts`: build within `ctx.info.w × ctx.info.d`, door
side +z unless the base builder's frontage says otherwise, draw only from `ctx.rng`, and keep tier-dependent parts to
dressing. Plots are not all deep: a market row is 12 × 5.2 m, a yard shed 11.7 × 7.2 m, a farmhouse lot 15 × 9 m. A
long building reads its plot along the long side (`plotAxes` in `geometry.ts`) and builds there (`alongPlot`) instead
of running across the plot and out of it (the first kits overran 39 plots by up to 4.9 m that way). Which side of a
plot meets the road differs by kind (farmhouse and market plots mostly meet it at their ±x end), so a porch or a
canopy is kept inside the plot on every side, not only the front. A look-only choice added later (render or bare stone, a paint) draws from `ctx.variant`, a second stream from
the same building identity, so it never reshuffles the geometry drawn after it. A new kit exports an `ArchitectureStyle` (region, surfaces, builders, weather palette, wear) and joins the
registry in `index.ts`; the regional receipt then builds every builder at two seeds and checks determinism, attribute
sets, night masks, the triangle budget, outward-facing faces and tier-independent collision. Judge a kit on Studio
captures of its map: an establishing view, two street-level views and each structure kind, by day and by night.

## Scenery

October 3, 2026 (the scenery lane). A battlefield needs features you can name: "the tor on the axis knoll", "the
calvary at the crossroads", "the windmotor on the retention bay". A map authors them in a top-level `scenery` block;
the generators and their placement rules live in `src/world/sceneryRocks.ts` (rock), `src/world/maps/sceneryKit.ts`
(timber, steel and stucco landmarks, pylons), `src/world/sceneryPlan.ts` (the contract and footprints) and
`src/world/scenery.ts` (the composer that places them). The map file carries only placements and parameters.

```ts
scenery: {
  rocks: [{ form: 'tor', geology: 'granite', x: -222, z: 22, radius: 7, height: 5.5, yawDeg: 24, name: 'the axis tor' }],
  rockFields: [{ geology: 'limestone', x: 40, z: -235, radius: 115, count: 14, slopeBias: 0.6, name: 'the terrace karst' }],
  landmarks: [{ kind: 'calvary', x: -78, z: -140, yawDeg: 15, name: 'the crossroads calvary' }],
  powerLines: [{ towers: [[-440, -150], [-147, -50], [147, 50], [440, 150]], heightM: 36, name: 'the 380 kV line' }],
},
```

### What there is

| Family | Kinds | Gameplay | Cost |
| --- | --- | --- | --- |
| Rock forms (`rocks`) | `tor` (granite: cuboidal blocks split by the sheeting and vertical joints, sheets of every thickness in two to four stacks, set back or overhanging, the sheet rock breaking the turf round them, clitter strewn down the slope; wave 29 read the old pillow slabs as "near-black slabs, all the same thickness"), `outcrop` (sandstone or limestone: hard beds stepping back from a scarp that faces downhill, split into joint blocks), `crag` (slate: steeply dipping plates in ranks, scree below), `pavement` (limestone: clints and grikes flush with the turf, a low scar upslope), `scree` (an angular fan, fining up its apex), `hoodoo` (sandstone: a wind-cut pedestal under a broad cap, the mushroom rocks of Wadi Rum) | a standing form is one static convex collider from the ground to its top (hard cover, never crushed); pavement and scree lie under a hull's 0.55 m step and carry none | one welded mesh on the props rock material for the whole map: one draw plus its shadow passes; a tor about 8.5 k triangles (2 k on phones), an outcrop 2 k, a pavement 3.5 k |
| Rock fields (`rockFields`) | the exposed bedrock of a hillside: forms drawn from the geology's mix (`FIELD_FORMS`), the steeper ground first | as above, per form | into the same mesh |
| Bedrock (`bedrock`) — parked | Not placed on any map: wave 16's critics read the skin on Redrock's smooth domes as masonry ("a ziggurat"), so a hill's shape has to carry its rock first (the landform's geology). The builder stays for a hill whose walls are sheer: a hill's own beds on its steep flanks, read from the live ground by rays from the entry's centre (lobes, ramps, fans and clefts move the beds with them): thick hard beds parted by thin, recessed soft ones in sandstone, now and then a massive one, from the highest ground a hull climbs (grade 0.9) up to a bare-rock crown. Each hill is bedded its own way (bed thickness, a dip of one to five degrees); every bed boundary swells and pinches along its run, a third of the hard beds stand out as ledges, and no bed rings the whole hill. The ground's own clefts (the rills down a wall, wherever the foot line falls back more than 0.9 m against the line a few metres either side) break the beds and seat the master joints, which open clefts from crown to foot, with tight staggered joints between them | none: a skin a little proud of ground no hull reaches; the hill stays the terrain, and the trees keep off its flanks (`BEDROCK_TREE_CLEAR` of the radius) | into the same mesh; Redrock's twelve domes about 41 k triangles together (a main dome 4-8 k, a lobe 2-3.5 k), phones about four fifths |
| Stone landmarks (`landmarks`) | `calvary` (granite steps, octagonal shaft, cross), `menhir` (a standing stone), `cairn` (a clearance cairn: the gomila, the rujm) | static colliders | in the rock mesh |
| Timber, steel and stucco landmarks (`landmarks`) | `bildstock` (a carved shrine on its pillar; breaks to its stump), `waysidecross` and `orthodoxcross` (topple), `windpump` (an American windmotor; topples), `tomb` (a Mekong-delta family tomb; breaks), `strawstack` (rice straw packed round a bamboo pole; breaks) | props destructibles (`SCENERY_DESTRUCTIBLE_TYPES`): crushable, their state synced like every other destructible | one instanced pool per kind a map uses |
| Field works (`fieldWorks`) | `walls`: the dry stone walls of a karst's walled fields; `banks`: the earth banks (the talus) under a bocage's hedge lines — both laid on the ground lane's land use (`landUse.ts` through the height field's `_landUseAt`): the boundary band the terrain draws, the same field gate (off villages, roads, water and slopes past ~3°), chained along their lines and swept continuously. `wallTone` / `bankTone` (sRGB HSL) set their stone and earth | none: decor, at most 1 m tall (`FIELD_WORKS_MAX_M`), so a low rubble wall or a bank reads as crossed, not as cover; should one ever matter in play it becomes crushable like the fences, never blocking. They keep off the roads' painted core (5.7 m), the spawn pads (24 m), the bridge decks and their approaches, the aprons (`terrain.hardstands`, runways included) and the yards' dressing, the carved trenches and every mode's objective discs where the match placement seats them on that world (zones 30 m, flag bases 12 m, turbo goals 18 m and kickoff 12 m, the extraction 30 m, the Frontline Assault sectors 30 m), each with a 3 m margin | one welded mesh on the props rock material, no shadow of its own, built after the props' solids are final; Saltwind's walls about 16 km and 125 k triangles, Saltmere's banks about 4 km and 30 k; seating the discs runs the match placement for four modes (a few hundred milliseconds of the world build, on those maps only) |
| Power lines (`powerLines`) | lattice towers (a double-circuit tower scaled to `heightM`) and conductors hanging a 4 % sag (wave 20: a 2 % sag read as straight hairlines); the towers rise until the lowest conductor clears every crown under its span by 3 m and the ground by 12 m (at most 70 m) | four leg colliders per tower; a hull drives between the legs | the towers fold into the props `baked` bucket (no draw of their own; about 2 k triangles a tower); the conductors are ribbons on the wire material (`wireMaterial.ts`, wave 48: "the power cables break into dashes"): turned to the eye and half a pixel either side at the least, their alpha the share the true wire covers, one blended mesh (`props-pylon-wires`), unlit, fogged, no shadow, two triangles a segment |

The rock material is the boulders' (`rockDressing.ts`): the map's moss, dust and soil laws, the triplanar detail tile
and the cascade setup, so a tor and the boulders round it are one rock. Each map's rock is named (`ROCK_CLIMATE`: granite,
gneiss, sandstone, limestone, slate or basalt) and draws the detail tile (granite's mica and feldspar speckle, gneiss
foliation, sandstone laminae, limestone solution pits, slate cleavage, basalt vesicles). The boulders themselves (wave 52:
"low-poly frustums, chamfered boxes or polyhedra … all under one even noise texture and none sunk into the ground") are
blocks their joints cut and the weather rounded (`buildBoulderForm`: the smooth maximum of a kind's joint planes, lumped,
meshed by casting a cube-sphere grid at it, its normals the surface's own, every quad split along the diagonal whose ends
shade alike), fitted inside the legacy rocks' hulls (the collision proxies the shards carry, unchanged), keeping their
girth under the ground line so a slope bares a buried flank and not an undercut; bedded and cleaved rock breaks into
blocks and slabs, granite and basalt weather round as well (`boulderKindFor`). On the instanced boulders only: their beds
in each rock's own frame and tilt, desert varnish, the climate's lichen in two species (sparse, kept to the tops and upper
flanks, a coverage-ranked colony tile), a snow map's snow laid after their tone, and contact darkening where the stone
meets the ground. 384 triangles a variant (176 on phones). The moss keeps to the damp ground a metre or two
up: a tall rock's tops dry in the wind and show the lichen its own tone paints (wave 29: "near-black slabs"). A geology's tone can be overridden with `tone`
(sRGB HSL), for example to match a map's `rockTone`. A map whose field walls are its own rock tints their rubble print
with `scenery.masonryTint` (a linear multiplier): Saltwind's dry stone walls and their heads are the weathered grey
karst limestone of its outcrops, and every other map keeps its tone. The tint never touches the house masonry (the
props stone print, which a regional kit repaints: its Dalmatian limestone under the tint burned out white).

The field walls (`props.wallRuns`, the `wallstone` module of `maps/inhabitKit.ts`) are dry-stone walls on every map
whose stone bucket is fieldstone: a battered hearting, face stones laid in rough courses on it and flattish top stones
laid across (wave 34, "coursed rubble relief"): four courses the module's own, the biggest at the foot, every stone
sitting on what is under it, now and then a jumper two courses high, two thin stones in one course or a pin, each
stone one to three centimetres proud with its corners knocked back so the hearting shows in the gaps, its face shaded
as a rounded stone (its corners' normals leaning out from its middle: wave 48 read flat-shaded rectangles as "stacked
crates or voxels") and turned a little its own way. The module keeps
the old one's envelope and its seeded draws, so the fitted wall colliders keep their plan and height. Where two runs'
ends meet, the first head there is a corner pier (wave 52, Verdant's village wall: "abruptly changes from tan stone to
dark … with a hard vertical seam" — one face in the sun and one in shade, with nothing between them): bonded like a
quoin, a stone's breadth proud of both faces and a course over the tallest module; the other heads at that corner are
spent unbuilt. The field print's occlusion is 0.5 (it was 0.82, and took the skylight out of a shaded face's joints until
the face read near-black). The maps whose
stone bucket is the sourced brick print (`sourcedStoneIsBrick`) keep the coursed module (`COURSED_WALLSTONE`) the print
was laid out for.

A wall follows its slope (`wallSpanPlacement.ts` `fitWallSpan`, wave 34: "walls on slopes step like battlements"): each
module is sheared along the run to a least-squares line through the ground under its centre (at most a 0.45 fall), so
its courses and its top follow the slope and its end faces stay upright, two neighbours meeting in one vertical plane
at a crest or a valley. Only the ground's departure from that line still stretches a module's foundation. Its collider
is the sheared module's box, as before: the high end's cover is kept, and over the low end of a steep module the box
stands a little above the stones.

The dry-stone walls, their run heads, breach stubs and tumbled blocks draw their own material, `fieldStone`
(`fieldStoneSurface.ts`). The stones are geometry, each with a window of the print of its own, so the print is one
stone's skin over its face band (`FIELD_STONE_FACE_V`): a fieldstone's colour drifting in patches about a stone
across, its grain, mineral specks and bedding, the odd pit and crustose lichen, and no joint anywhere (wave 34 read a
printed rubble on the stones as "stamped flagstone with dark outlines"). Its hearting band (`FIELD_STONE_HEARTING_V`)
is the core between the face stones, packing stones in dark voids, painted squashed because the core maps it once over
its height. Every piece's window lies inside its band: `roughStone`, the foot and tumbled stones, the snow load and
`jitterFieldStoneUV` (the props stream's four `jitterUV` draws) for the heads and breach pieces. The skin's mean colour
is the stone print's (within 4 %) under the map's stone tone, and each instanced module shifts its window along the
wall by a hash of its place (the field print's own program, u only: wave 48, "the coursing visibly repeats"), so a
run's one repeated module takes tones of its own; `liftFieldStoneMean` lifts a tone darker than an sRGB
0.36 mean in linear light (Verdant's x0.76 blacked its village walls out in shade). A map whose walls are mud or brick
paints no field print and keeps the stone print. The receipt is `fieldStoneSurface.selftest.mjs` (seamless, no void or
dark line in the skin, windows differing stone to stone, a dark core, the palette, the lift, the phone print).

How the walls meet the ground and the weather (waves 20 and 34: "shape, construction type and how things meet the
ground"; "nothing bedded"): a stone's top ledge carries a normal leaning out, so the snow cap leaves the face's ledges
alone (wave 34: "thin white slivers"); a run turns some of its modules round (a hash of the module's place) with
neighbours 4 mm apart across it, so the kit's one module does not show the same face and crown every three metres.
Each built island of a run is dressed by `maps/fieldWallDressing.ts` on its own streams: a dry-stone wall gets the
stones settled at its foot, sunk a third to a half in the ground on both faces; every run head gets the stones it lost
tumbled out past the end and along its feet (a mud wall's pier its fallen lumps; on a snow map none: the snow covers
what fell, and wave 48 read stones on it as "loose slabs strewn on the snow"). On a snow map (Winter, Alpine,
Whiteout) the module and the run heads carry a snow load along their tops, 6-24 cm in lumps a stone or two long with a
cornice here and a thin edge there (its normals leaning up so the snow cap whitens it to the lips), and the wind banks
two drifts: the bigger in the wall's lee (under half the wall: about 36 cm on the face, out two metres and more) and
a small ramp on the windward face, both smaller where the wind runs along the wall, each a rounded shoulder rolling off
to a toe sunk under the ground, a row every 30 cm, stopping 35 cm inside its island's ends (wave 48: "a smooth wedge
that rides over its top … loose slabs strewn on the snow at its end"). A mud wall is an eroded slab
(`adobeModule`): faces battered in to a crown worn round, the foot cut back by the splash, a slump up to a third of a
metre in its crown and a couple of small losses, rain gullies from the crown; it draws its own worn render (`fieldMud`,
`fieldMudSurface.ts`: a mud coat with straw, the rain's streaks and a damp, splashed foot, the render thinning out in
broad patches over sun-dried bricks a shade darker than it, most at the feet and the crown, no dark outline), one tile
a module, under the map's plaster tone. On a map whose ground is an earth (`mudEarthOfGround`: the light model's ground
albedo orange to yellow-brown) the render goes most of the way to that earth and its foot's mud all the way, so a wall
is built of the ground it stands on and the apron washed off it (with the spalled lumps on it, on the print's plain
band) is the ground's colour, not a pale strip. Receipts: `fieldMudSurface.selftest.mjs`,
`maps/fieldWallDressing.selftest.mjs`.

The field works' sandbag stacks (`sandbagbig`, `sandbagsmall`, `sandbagwall`, wherever the fortification passes put
them) are laid bag by bag (`maps/sceneryKit.ts` `buildSandbagStack`): pillows pressed flat by the courses on them (wave
52: "compressed pillow bags … header ends as squashed, seamed pillow ends rather than round log ends"), a flat top and
bed, their sides bulging, both ends drawn in — the sewn bottom straight across with its ears at the corners, the mouth
folded under — so a bag end on is a squashed lens; sagging over the joint below, one in five slack (thinner, wider, more
sagged), each in its own tone (hessian, weathered hessian, faded olive polypropylene, a few dirty ones), the lowest
courses smeared with earth, on the hessian (`paintBurlap`: a plain weave, a jute thread every 2.5 mm at the bags' weave
uv, its own material on the canvas program), in 15 cm courses each pressed a third into the one under it: every third
course below the top in headers (two bags across, seams out on the faces) between stretcher courses in a wandering half
bond, a battered parapet that has settled (wave 34, "tidy tubes"): its middle sunk up to 4 cm, the more the higher the
course, the top course's bags askew and the odd one gone; the bottom course sunk in the ground and a fillet of earth
banked against the foot; every stack also gets its own weathering tint. A laid bag draws only the faces its stack shows
(the top course is closed), and a battered core of dark spoil fills the stack behind them, so no joint shows the sky
(wave 52: "daylight between courses"; the scenery receipt casts sight lines square through every stack). Each stack fills the envelope of the sourced model it replaced, so the cover is where it was; a breached
stack is a low course and the burst bags round it. A road nest, a redoubt's stacks and a breastwork's modules are
bedded (`buildSandbagBedding`, wave 34: "a stacked prop on a bare mound, no berm or spilled sand"): the spoil banked two
fifths up the face toward the threat and out the better part of a metre, lower round the rest, a spill of fill heaped
at one end with the emptied bag by it, in the map's soil (its earth on an arid map); one receive-only mesh of their own
on the props rock material, as the bocage banks are (`props-sandbag-beds`; its detail print, the grime, the wet maps'
moss; its ground given half a metre down so the rocks' soil skirt does not paint a second soil at its foot), colliding
with nothing, a few hundred triangles a stack.

### What the composer checks

Every feature is checked before it is laid, and `props.group.userData.scenery` says what stood and why anything did
not (`status`, `reason`); nothing is moved silently.

- Inside the square (|x|, |z| + footprint at most 480 m), 22 m plus its footprint from every spawn pad.
- Out of the road core: the footprint 4 m off every road centreline (2 m for pavement and scree).
- Dry: no water under the centre or the footprint's rim.
- Off the hard solids already placed (buildings, walls, bunkers, wrecks). Soft records under a standing footprint
  (bales, fences, boulders) are allowed and listed in `overlaps`: move the feature if they read badly.
- Trees: authored rocks, landmarks and towers publish their footprints to the vegetation from the config alone
  (`sceneryClearances` through `placedStructureClearances`), so the trees and shrubs keep off them; rock fields keep
  off the trees instead.
- Every feature draws its own seeded stream (by family and index), so authoring one never moves another, and a map
  without a `scenery` block builds exactly as before.

### Choosing scenery for a place

Pick what the place's rock and people actually put there, and name it in the map file. What the rebuilt maps use:

| Place | Scenery |
| --- | --- |
| Breton bocage (Saltmere Bay) | granite tors on the knolls, granite whalebacks on the downs, calvaries at the crossroads, menhirs on the downs, earth banks under the hedge lines (`fieldWorks.banks`) |
| The Fulda country (Frontier Basin) | Buntsandstein ledges breaking out of the ridge woods, a Bildstock where a farm lane meets the valley road, a timber field cross below each saddle, a 380 kV line through the basin |
| The Dalmatian karst (Saltwind Narrows) | limestone pavement on the uplands, bedded scars on the outcrop knolls, rock fields of small pavements and ledges on the terraces, a gomila on each upland, dry stone walls round its little fields (`fieldWorks.walls`) |
| Zeeland polders (Tidegate Polders) | a steel windmotor on the bank of each low basin, every rotor in the same sea wind; a 150 kV line across the flats |
| Kursk black earth (Verdant Fields) | a standing stone on each kurgan, Orthodox crosses at the village entries, a 110 kV line across the southern fields |
| The Eifel (Highland Reservoir) | slate crags and scree on every ridge's flanks, crags above the lake's shores, a timber cross in the angle of the road fork |
| Wadi Rum (Redrock Divide) | every inselberg's own beds on its flanks, cleft by its joints, with a bare crown; bedded ledges, scree and pedestal rocks round its foot, a mushroom rock in each mouth, a rujm (cairn) at each cross track's ravine |
| The Dahar (Sirocco Wadi) | ledges and scree on the wadi's cut banks and the North Mesa's flanks, rujms beside the caravan road and the wadi track |
| The Mekong delta (Mangrove Reach) | family tombs in pairs and threes on the raised ground by the ponds |
| The Jamuna chars (Jade River Delta) | rice straw stacks at the foot of the homestead mounds |
| The Naga Hills (Monsoon Ridge) | a memorial monolith on Garrison Hill, a row of Naga memorial stones by the temple |
| The Franconian Jura (Steinburg) | limestone crags round the castle rock, Bildstocks at the farm crossings |
| The coalfield (Cinder Junction) | a 220 kV line across the south of the junction |

Area-wide land cover — field patchwork, forest masses, grass, bush forms and hedgerows — belongs to the land-cover
lane, not to this block. Restraint: no smoke (the owner removed distant plumes and hearth smoke as wrong). A feature that hides a hull or breaks
a sightline changes the map's cover: agree it with the map's layout owner and run its metrics.

### Procedure

1. Author the block with a name per feature.
2. `node src/world/scenery.selftest.mjs`: every map's features must place (the receipt fails on any skip), rock fields
   must lay at least three quarters of their count, and no tree may stand inside a standing mass.
3. Rebuild the map's collision shard (`node tools/capture-world-collision-manifests.mjs --node --maps <id>`), re-pin its
   census in `server/dedicatedWorldCollision.selftest.mjs` with the before value, and run
   `node tools/map-layout-metrics.mjs --maps=<id> --check`.
4. Capture the features close up by day and by night, and the map's census views, before and after.
