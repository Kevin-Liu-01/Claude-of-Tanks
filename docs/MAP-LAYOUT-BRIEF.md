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
failure.

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
