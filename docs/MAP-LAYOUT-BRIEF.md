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

