# Regional environment direction

September 10, 2026. The map audit at `d948cb573` found 30 maps using four shared
horizon families. Map-specific noise changes their silhouette, but most share
the same nested rows and shape formulas. This is a design backlog, not a claim
that all 30 maps have been redesigned or visually accepted.

Geological structure informs art without adding a geology simulation. Related
ridge axes, asymmetric flanks, tributary cuts and coherent rock exposure are
more useful than another blanket noise octave. Plateau landscapes need cliffs
and softer benches; glacial landscapes need connected troughs and shoulders;
volcanic basins need their own rim/flow structure. Rounded hills are valid in
lowlands—the problem is repeating the same symmetric mound everywhere.

References: [NPS Yosemite geology](https://www.nps.gov/yose/learn/nature/geology.htm),
[NPS Grand Canyon formations](https://www.nps.gov/grca/learn/nature/geologicformations.htm),
[NPS tectonic landforms](https://home.nps.gov/subjects/geology/tectonic-landforms.htm),
[NPS calderas](https://home.nps.gov/articles/000/calderas.htm).
The identities below derive from each map's authored setting, not a claim that
the fictional map reproduces a particular real-world location.

| Map ID | Regional identity and direction |
| --- | --- |
| verdant | Preserve the accepted pastoral watersheds and woodland; no return to the rejected mountain ring. |
| desert | Wind-aligned dunes meeting offset sandstone cuestas; branching dry washes. |
| winter | Carpathian / Tatra winter valley (round 48, 2026-09-23): a beaded frozen river down a flat kotlina floor, a linear timber street village on the west river terrace with a sawmill yard, a steep two-armed ridge with a saddle pass on the west flank, rolling moraine knolls on the east; the alpine ring stays a distant highland, not a wall everywhere. |
| urban | A town below one dominant distant escarpment; restrained ground slopes around streets. |
| coastal | Open sea and unequal dune/bluff headlands; preserve its working eastern aperture. |
| autumn | Norman / English river-ford market town (round 48): a SW→NE river in a sculpted valley crossed by a stone bridge and a ford, the walled town on the north-bank rise, weir and mill, orchards and hedged fields, the wooded escarpment, the manor park and lake. |
| steppe | Open skyline, isolated distant rises and long shallow folds through grassland. |
| railyard | Graded brownfield with low distant uplands and broad drainage grades. |
| frontier | Farming basin with branching ridges; carry the playable watershed language into the outland. |
| fjord | Open eastern water axis between unequal glacial walls; retain cliff-road supports. |
| delta | Low braided floodplain, elongated levees and islands; limited distant uplands. |
| badlands | Redrock canyon: a continuous north–south valley floor between unequal red-rock walls, connected side ravines and open canyon mouths. |
| monsoon | Rain-dissected tropical ridges and coherent branching drainage, not snowless alpine peaks. |
| alpine | The Col du Mont-Cenis, April 1945 (map revival 2026-10-05): lake-aligned ranges, trough shoulders, broken spurs and oblique saddles round the frozen lake; the village in the Savoyard kit (grey rubble houses under lauze roofs with whitewashed bands and larch galleries, granges, mazots, chapels with bell turrets, the parish church's tin bulb, the hospice, the Italian frontier barracks, the Vallo Alpino's blockhouses and casemate, houses roofless from the April 1945 shelling), the Grande Croix. Round 2 (gauntlet wave 109b): the gneiss grey and the lauzes heavy and blue-grey, snow banked against the walls, the lake under snow, the col above the treeline nearly bare. |
| caldera | The Aso caldera, Kyushu (settlement and trees 2026-10-05): an off-centre, breached volcanic rim with unequal shelves and radial drainage over a farmed and settled floor; not red mesas recoloured black. |
| foundry | The Völklingen ironworks on the Saar, March 1945 (the map-revival lane 2026-10-05): the blast furnaces and their Cowper stoves, the rolling mills under north lights, gas holders, conveyor galleries and the colliery headframe in an industrial basin with low regional shoulders; the works remain the landmarks. |
| ruinspires | Destroyed vertical megacity above broad urban terraces; recessive background uplands. |
| blackglass | Suzhou Creek: Shanghai in the autumn of 1937 (the map-revival lane 2026-10-05), the creek between the International Settlement and burning Zhabei with four bridges; Art Deco towers and the Bund's banks over shikumen lanes and shophouses; a flat delta horizon. |
| titan_gorge | Monument Valley (layout 2026-10-03, settlement and land cover 2026-10-05): stepped sandstone shelves with cliff bands over talus, buttes standing free on a sand floor, braided dry washes; the Oljato chapter's hogans and trading posts. |
| skybridge | Glen Canyon above Lake Powell (layout 2026-10-03, settlement 2026-10-05): opposing plateau shoulders aligned with the drowned gorge, the dam's concrete works and Page; preserve crossing approaches. |
| polders | Very low coastal skyline, long dikes and broad drainage cells; preserve the deliberately low amplitude. |
| copper_mesa | Natural tablelands surrounding distinctly engineered quarry benches. |
| airfield | Open approach sectors and distant low hills; restrained perimeter berms. |
| oasis | Siwa (settlement 2026-10-05): asymmetric dune arms and sparse distant rock around a protected spring basin; old Shali's kershef town. |
| whiteout | Exposed snowy plain with broad low glacial rises and wind-shaped snow shoulders. |
| orchard | Long unequal upland valley sides with cultivated shelves and drainage folds. |
| longleaf | Longleaf, Louisiana: the Crowell Long Leaf Lumber Company's sawmill town in the pine flatwoods, crossed by the Louisiana Maneuvers of 1941 (the map-revival lane, 2026-10-05): interlocking wooded logging-country ridges, creek spurs and clearcut shoulders under longleaf pine; the town in the longleaf kit — the sawmill and its wigwam burner, the commissary, the engine shed and water tank, shotgun and dogtrot houses on brick piers under tin. |
| mangrove | Open estuary sectors, low islands and elongated natural levees. |
| saltwind | Western limestone bay with an open sea sector and stepped scrub headlands. |
| reservoir | Waterworks basin framed by unequal reservoir-aligned ridges and tributary shoulders. |

## Order and acceptance

Frontier and Alpine's first playable-ground changes shipped in `d948cb573`.
Badlands' subtle shelf pilot was rejected and replaced by a coordinated
playable-ground and horizon canyon with refreshed collision, minimap and map
art (see `REDROCK-CANYON-REVIEW.md`). Frontier woodland/material work is
a separate unshipped art experiment; it is not included in that terrain release.

The next bounded horizon batch should be Saltwind and Fjord: both already have
directional bay geometry, but only Coastal currently supplies `seaOpening`.
Reuse that seam, keep playable heights unchanged, compare sea/land continuity
and preserve Coastal as the control. Caldera and then Monsoon follow because
their authored settings warrant different structures from their current shared
profiles. Do not globally alter a shared profile to fix one map.

For playable changes, final terrain, height queries, fast caches, collision
shards, minimaps and props must agree. Retain road/water/spawn support targets,
all-mode access and construction-read limits. Regenerate only affected outputs
after actual matched-camera inspection. Keep an honest distinction between
unchanged resource counts, measured timing and full memory/FPS qualification.
