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
| winter | Snowbound farmland, low glacial undulations and distant highlands; not an alpine wall everywhere. |
| urban | A town below one dominant distant escarpment; restrained ground slopes around streets. |
| coastal | Open sea and unequal dune/bluff headlands; preserve its working eastern aperture. |
| autumn | Cultivated river valley with tributary hollows and unequal wooded interfluves. |
| steppe | Open skyline, isolated distant rises and long shallow folds through grassland. |
| railyard | Graded brownfield with low distant uplands and broad drainage grades. |
| frontier | Farming basin with branching ridges; carry the playable watershed language into the outland. |
| fjord | Open eastern water axis between unequal glacial walls; retain cliff-road supports. |
| delta | Low braided floodplain, elongated levees and islands; limited distant uplands. |
| badlands | Redrock canyon: a continuous north–south valley floor between unequal red-rock walls, connected side ravines and open canyon mouths. |
| monsoon | Rain-dissected tropical ridges and coherent branching drainage, not snowless alpine peaks. |
| alpine | Lake-aligned ranges, trough shoulders, broken spurs and oblique saddles. |
| caldera | Off-centre, breached volcanic rim with unequal shelves and radial drainage; not red mesas recoloured black. |
| foundry | Industrial basin with low regional shoulders; factories remain the landmarks. |
| ruinspires | Destroyed vertical megacity above broad urban terraces; recessive background uplands. |
| blackglass | Arcologies and directional transit-cut shoulders between offset low ridges. |
| titan_gorge | Long plateau edges with branching tributary recesses; playable changes held until access constraints pass. |
| skybridge | Opposing plateau shoulders aligned with the drowned gorge; preserve crossing approaches. |
| polders | Very low coastal skyline, long dikes and broad drainage cells; preserve the deliberately low amplitude. |
| copper_mesa | Natural tablelands surrounding distinctly engineered quarry benches. |
| airfield | Open approach sectors and distant low hills; restrained perimeter berms. |
| oasis | Asymmetric dune arms and sparse distant rock around a protected spring basin. |
| whiteout | Exposed snowy plain with broad low glacial rises and wind-shaped snow shoulders. |
| orchard | Long unequal upland valley sides with cultivated shelves and drainage folds. |
| longleaf | Interlocking wooded logging-country ridges, creek spurs and clearcut shoulders. |
| mangrove | Open estuary sectors, low islands and elongated natural levees. |
| saltwind | Western limestone bay with an open sea sector and stepped scrub headlands. |
| reservoir | Waterworks basin framed by unequal reservoir-aligned ridges and tributary shoulders. |

## Order and acceptance

Frontier and Alpine's first playable-ground changes shipped in `d948cb573`.
Badlands' subtle shelf pilot was rejected and is being replaced by a coordinated
playable-ground and horizon canyon. Frontier woodland/material work is
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
