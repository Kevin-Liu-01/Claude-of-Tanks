# Road and settlement review — September 29, 2026

The pass starts at `602b406df`. Verdant Fields is the protected visual/layout
reference. All 31 current map overview images and road configurations were
reviewed before changes. The review targets believable street access, entrances,
turning geometry, shared intersection heights, and placement on dry supported
terrain; it does not replace deliberately planned industrial grids.

## Changes

- Sirocco's north/south road follows the eastern wadi around the mesa instead
  of climbing its steep face. A bounded road profile limits the measured
  grade to 16.60% across three seeds, down from 35.10% on the central
  mesa approach. It retains the two-route graph, 33 stations per road, and
  32m longitudinal station spacing. The lateral bypass has a measured maximum
  73.43m diagonal segment, explicitly bounded at 75m; other roads keep the 34m
  sampling ceiling. Crossing and boundary profile heights stay fixed.
  Finite 104m earthwork banks replace the narrow raised fill wall, tapering in
  outside the central 48m settlement core. Only overlapping outer banks blend
  their road planes; the 14m road grid core remains untouched. Across seeds
  1337, 2025, 7719, 110 central settlement samples and 537 distant samples per seed
  retain their old heights (distant tolerance: one micrometer). Outer village
  rows and mesa foothills inside the finite corridor can change.
  Roadside slopes sampled out to 18m peak at38.89%, 39.26%, 55.39%, below the 85%
  regression ceiling. Broad bank samples out to 108m must stay below 1.4m/m or
  within 0.1m/m of already steeper natural relief; untouched cliffs are preserved.
  Three photographed narrow-wall negative controls exceed 2.8m/m in the rejected
  version and fall below 0.5m/m with the new bank. Four native Desert pilot views
  received independent visual review: the raised sawtooth banks are gone while
  the central mesa silhouette, steep natural face and village road fronts remain.
- Saltwind's folded-back village loop becomes one market street leaving the
  existing harbor junction. Worn doorstep courts follow the revised street.
  The village's eastern boundary includes the existing dry inland road so all
  18 planned buildings fit; sampled coastal heights and water masks stay exact.
- Whiteout's 104m triangular service detour becomes a direct connected street.
- Saltwind, Whiteout, Polders, Copper Mesa, Orchard, Longleaf and Oasis use bounded
  turning arcs. Shared intersections, terminal approaches and border tangents
  stay authored. The arcs stay inside their original corner triangle.
- Those seven maps separate curve geometry from physical dressing stations.
  Extra curve vertices do not multiply poles or house parcels. Fence modules
  retain physical spacing and follow the curved path between stations.
- Road grading retains a 32m smoothing footprint. Every real crossing, including
  both intersections of a loop with a spine, receives a shared elevation.
  Polders' adjacent northeast causeways share one boundary grade plane; this
  removes the sharp bank caused by incompatible road heights near their exits.
- Saltmere Bay’s two capped shore roads now end in sandy turning courts,
  keeping the bay unpaved.
- Settlement squares use true segment intersections. Previously the square
  could be selected by nearby sample vertices, with Reservoir's point 25.8m
  away from its nearest real intersection.
- Ordinary roadside building entrances face their road. Cottage/barn/adobe,
  granary, cabin and alpine entrances use +Z; farmhouse uses -X; woodshed +X.
  Actual geometry bounds determine setbacks. Corrections must clear roads,
  neighboring parcels, water, village limits and terrain support. A proposed
  orientation correction that fails retains its authored yaw. If that footprint
  still infringes the road, a bounded local parcel search finds a clear, dry,
  supported setback without displacing later proposals. Seven such repairs
  clear the final ordinary-building audit; counts and random-stream tails stay
  unchanged across all 31 maps. Specialist waterfront, orbital and service-court
  owners remain separate.

## Map disposition

| Map | Road decision | Settlement decision |
|---|---|---|
| Verdant Fields | Preserve exact layout | Preserve exact placement |
| Sirocco Wadi | Mesa-foot detour and gentler road profile | Doorway frontage and setback |
| Frosthollow | Existing pass/crossing retained | Doorway frontage and setback |
| Steinburg | Orthogonal streets retained | Street-row owner retained; exact square |
| Saltmere Bay | Grid and shore termini retained | Doorway frontage and setback |
| Amberford | Bridge approach retained | Doorway frontage and setback |
| Tarkhan Steppe | Station/rail alignment retained | Ordinary frontage; station owner retained |
| Cinder Junction | Rail grid retained | Rail/industrial owner retained |
| Frontier Basin | Gentle existing route retained | Doorway frontage and setback |
| Nordhavn Fjord | Harbor approaches retained | Doorway frontage and setback |
| Jade River Delta | Wetland crossings retained | Doorway frontage and setback |
| Redrock Divide | Canyon routes retained | Doorway frontage and setback |
| Monsoon Ridge | Dry-bank crossings retained | Doorway frontage and setback |
| Glacier Pass | Frozen-lake approaches retained | Doorway frontage and setback |
| Obsidian Caldera | Closed mining loop retained | Industrial owner retained |
| Ironworks | Industrial grid retained | Authored service court retained |
| Ruinspires | City grid retained | Street-row/landmark owner retained |
| Suzhou Creek (was Blackglass District) | Planned diagonal avenues retained; the creek crosses them on four bridges | Street-row/landmark owner retained; the landmarks the creek reached re-sited |
| Titan Gorge | Cliff routes retained | Ordinary frontage correction |
| Skybridge Chasm | Chasm approaches retained | Existing specialist layout retained |
| Tidegate Polders | Gentle turning arcs; dike graph retained | Ordinary frontage correction |
| Copper Mesa Mine | Gentle hauling-route arcs | Existing industrial layout retained |
| Kestrel Airfield | Straight runway/apron preserved | Existing specialist layout retained |
| Sunscar Oasis | Gentle village/outer arcs | Ordinary frontage correction |
| Whiteout Station | Remove service-street spike; gentle arcs | Ordinary frontage correction |
| Orchard Valley | Gentle orchard approaches | Ordinary frontage correction |
| Longleaf Crossing | Gentle forest approaches; grade both loop joins | Ordinary frontage correction |
| Mangrove Reach | Dry-bank/wharf alignment retained | Authored fishery/wharf retained |
| Saltwind Narrows | Coherent market street; gentle outer arcs | Ordinary frontage; revised doorstep courts |
| Highland Reservoir | Spawn pockets/hardstands retained | Exact square and ordinary frontage |
| Olympus Basin | Research-station routes retained | Orbital settlement owner retained |

## Reproducible evidence

`tools/media-production/produce.mjs --task=settlements` captures a native 4K map
master and three reciprocal/oblique settlement views per map, plus live road and
building records. Source digest, camera recipes and file hashes remain in its
receipt. Capture coverage is not automatic visual acceptance.

Focused regression owners: `roadBends`, `roadGradeSmoothing`,
`roadPhysicalStations`, `roadBuildingFrontage`, `roadSettlementJunction`,
`roadFencePath`, `roadStations`, and existing road continuity/map quality tests.
The frontage regression executes the real candidate/build/ground/collision
stage with real kits and terrain for all 31 maps, independently measures clearance,
and compares building counts and random-stream tails with frontage disabled.

Local review artifacts live in `.qa-dev/roads-settlements-r1/`. These are work
receipts, not public marketing assets. Published map derivatives are regenerated
from reviewed native captures through the existing media publisher. All 124 final views received visual review, with file hashes bound to the
publication receipt. Dedicated server collision shards were recaptured on this
runtime tree. The public manifest preserves the provenance of existing films;
this refresh replaces map stills and their derived cards and thumbnails.
