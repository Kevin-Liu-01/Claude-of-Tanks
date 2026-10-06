import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.ts';
import { OLYMPUS_SETTLEMENT } from '../src/world/maps/marsSettlement.ts';
import { getMapConfig, MAP_IDS } from '../src/world/maps/index.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import {
  collisionFootprintContainsPoint, pushHullFromObstacle, rayCollisionRecord, shellPassesThroughCollisionRecord } from '../src/world/collision.ts';
import { decodeCollisionManifest, encodeCollisionManifest } from './collisionManifestCodec.ts';

const authoredWorlds = new Map();
// Fresh completed-road placement retains coalSiteIsClear's exact obstacle,
// slope and road rejection. The native capture has five clear piles on each
// of Foundry and Skybridge; movement/shell pairs and contact tests below remain.
// 2026-09-19 hitbox pass: full recapture of every shard; a capture of pristine origin/main placed the same heaps,
// so the committed rail shards had already drifted from the current planting order (railyard 7 → 6, foundry 5 → 7).
// 2026-10-01: Cinder Junction's heaps stand on the coal stages beside its two loading stubs (railSpurs.ts coalStage).
// 2026-10-03 the map-borders lane: the dressing stream draws its rim-band props on the border landform's ground before the
// yards' heaps, so the seven heap draws of Caldera, Ironworks and Skybridge land elsewhere on their unloading strips and
// the clear-site law admits two fewer on each (was caldera 7, foundry 7, skybridge 5; Caldera on the classic border still
// admits seven, measured); Cinder Junction's stage is authored. Wave 2 of that lane (2026-10-03: the road grades past
// 430 m on the landform's rim) moves the rim-band ground those draws read again: Caldera and Ironworks admit one more
// (5 -> 6 each).
// 2026-10-03 Obsidian Caldera's rebuild (docs/MAP-LAYOUT-BRIEF.md) on that border: its seven heap draws all clear the site
// law again (the rebuilt floor moves the strip's seeded draws), so Caldera keeps seven.
// 2026-10-03 Ironworks' rebuild on that border: its streets are authored paths now, so the yard's seeded heap draws
// land on a different strip of ground and six of seven clear the site law.
// 2026-10-03 Obsidian Caldera after gauntlet wave 3 (lava flows, talus fans, the flow fields off the yards' banks): the
// yard's seeded heap draws land on new ground and six of seven clear the site law.
// 2026-10-03 merged (maps lane A's Caldera v2 and Ironworks on the borders lane's wave 2): measured on the combined
// ground, Caldera's yard admits all seven heap draws again and Ironworks five.
// 2026-10-03: Ironworks' coal heaps draw after its works, which now replay PR #9's head (props townPlan) instead of drawing
// their placement: foundry 5 -> 7 heaps on the same rail spurs.
// 2026-10-03 Skybridge Chasm's rebuild: its coal heaps draw after its settlement, which now replays PR #9's head (props
// townPlan) instead of drawing its placement, on the rebuilt floor: skybridge 3 -> 5 heaps on the same rail spurs.
const coalCensus = { railyard: 10, caldera: 7, foundry: 7, skybridge: 5 };

// 2026-09-29 roads/settlements: native all31-map recapture, terrain1337,
// props2002, vegetation2001. Counts include shared tree colliders (the capture
// console omits their duplicate storage). Explicit expected values remain
// independent of the generated index; no historical subtraction or tolerance.
// Verdant retains every placement: only two fleet wreck bounds
// differ from its old shard; its complete census is unchanged.
// 2026-10-01 maps-and-layouts lane: the drifted shards are rebuilt in Node (tools/headlessWorldCollision.mjs,
// `capture-world-collision-manifests.mjs --node`) and server/collisionManifestDrift.selftest.mjs keeps every shard
// equal to the tree.
// 2026-10-02 road footprint fix (src/world/roadFootprint.ts): the rubble, boulder, field-work, wreck and well passes keep
// a solid's whole footprint out of the road core. Sixteen censuses lose the 1-3 boulders that reached into a road;
// roadside wrecks, rubble and two pillboxes step off the carriageway with their counts unchanged.
const expected = {
  verdant: [5298, 4906, 5934], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 22 of 26 that passed through a boulder placed before them pushed clear (4 left out), 4 fewer solid; was [5302, 4910, 5934] (2026-10-03 regional kolkhoz kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [5289, 4910, 5934]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [5281, 4902, 5937] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [5279, 4900, 5935]: 2026-10-03 regional kolkhoz kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [5279, 4931, 5935]); 2026-10-03 merged: the scenery lane's rock masses and landmarks (the trees and shrubs off them; [5135, 4869, 5938] on the redesigned town) on the classic town plan restored; was [5265, 4919, 5947] for the classic town plan restored (the country cross of roads, no village-square apron, the six village wall runs: every house and village wall where main has it); was [5121, 4857, 5950] 2026-10-03 no stone walls on the Kursk farmland (the scenery lane's palette note: 184 wall modules gone); was [5305, 5040, 5950] after the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [6678, 6413, 7323] (2026-10-02 Verdant Fields redesign (docs/MAP-LAYOUT-BRIEF.md); was [6977, 6678, 7507], and [6845, 6575, 7445] before its aprons stood on their ground (apron bank law))))
  desert: [1546, 1371, 1299], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 49 of 54 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (5 left out); 68 of 79 that passed through a boulder placed before them pushed clear (11 left out), 17 fewer solid; was [1563, 1388, 1299] (2026-10-03 regional ksar kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [1427, 1270, 1299]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2632, 2475, 2808] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2634, 2477, 2810]: 2026-10-03 regional ksar kit: the market rows become ghorfa shop rows inside their plots (maps/regional/ksar.ts) (was [2634, 2487, 2810]); 2026-10-03 regional ksar kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [2634, 2574, 2810]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [2611, 2551, 2810] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [2943, 2883, 3123] (2026-10-01 Sirocco Wadi redesign (docs/MAP-LAYOUT-BRIEF.md); was [2673, 2605, 3139], and [2856, 2796, 2991] before its aprons stood on their ground (apron bank law)))))
  winter: [5185, 5045, 4178], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 7 of 8 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 49 of 52 that passed through a boulder placed before them pushed clear (3 left out), 4 fewer solid; was [5189, 5049, 4178] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [5173, 5033, 4168] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [5166, 5026, 4161]; 2026-10-03 Frosthollow layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's edge [5131, 4986, 4125]; was [5931, 5786, 4919]))
  urban: [2690, 6647, 2254], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 1 of 1 boulder that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 10 of 11 that passed through a boulder placed before them pushed clear (1 left out), 1 fewer solid; was [2691, 6648, 2254] (2026-10-03 regional franconian kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [2654, 6615, 2254]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2830, 6791, 2472] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2833, 6794, 2475]: 2026-10-03 regional franconian kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [2833, 5493, 2475]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [2837, 5497, 2488] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [3859, 6519, 3510] (2026-10-01 Steinburg redesign (docs/MAP-LAYOUT-BRIEF.md); was [3898, 9290, 3530]))))
  coastal: [3667, 3580, 3626], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 4 of 5 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 40 of 43 that passed through a boulder placed before them pushed clear (3 left out), 3 fewer solid; was [3670, 3583, 3626] (2026-10-03 regional breton kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [3627, 3522, 3626]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3405, 3300, 3402] (2026-10-03 regional breton kit: the cannery and its boiler house share the fish landing plot (maps/regional/breton.ts) (was [3405, 3299, 3402]); 2026-10-03 regional breton kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [3405, 3245, 3402]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [3393, 3233, 3416] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [4091, 3931, 4107] (2026-10-02 Saltmere Bay redesign (docs/MAP-LAYOUT-BRIEF.md); was [4161, 3964, 4249], and [4413, 4253, 4411] before its aprons stood on their ground (apron bank law)))))
  autumn: [4775, 4667, 4841], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 1 of 1 boulder that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 31 of 32 that passed through a boulder placed before them pushed clear (1 left out), 1 fewer solid; was [4776, 4668, 4841] (2026-10-03 Amberford's smooth river bank, its circular cells half a radius apart (gauntlet wave 28) [4702, 4592, 4810]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [4722, 4612, 4785] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [4717, 4607, 4780]; 2026-10-03 Amberford's river meanders (gauntlet wave 11) [4619, 4505, 4675]; 2026-10-03 Amberford layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [4692, 4546, 4645]; was [5872, 5726, 5822]))
  steppe: [1830, 1543, 703], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 10 of 10 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 61 of 66 that passed through a boulder placed before them pushed clear (5 left out), 4 fewer solid; was [1834, 1547, 703] (2026-10-03 Tarkhan Steppe's sors, six dug salt flats filled level in its basins' bottoms (gauntlet wave 28) [1847, 1557, 715]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [1858, 1568, 726] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [1856, 1566, 724]; 2026-10-03 Tarkhan Steppe's takyr flats 32-72 m apart (battlePacing 27001) [1936, 1648, 815]; 2026-10-03 Tarkhan Steppe's irregular takyr crusts, salt flats and broken shelterbelts (gauntlet wave 11) [1958, 1669, 825]; 2026-10-03 Tarkhan Steppe layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [1949, 1664, 843]; was [2426, 2138, 1302]))
  railyard: [2101, 2119, 1091], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 2 of 2 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 6 of 7 that passed through a boulder placed before them pushed clear (1 left out), 1 fewer solid; was [2102, 2120, 1091] (2026-10-03 regional ruhr kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [2051, 2120, 1091]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [1958, 2027, 994] (2026-10-03 regional ruhr kit: the yard sheds lie along their plots, the water tower and the station fit theirs (maps/regional/ruhr.ts) (was [1958, 2058, 994]); 2026-10-03 regional ruhr kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [1958, 1960, 994]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [1942, 1944, 994] (before it: 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [2174, 2176, 1224]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [2846, 2848, 1899] (2026-10-01 Cinder Junction redesign (docs/MAP-LAYOUT-BRIEF.md); was [2825, 2785, 1983]))))
  frontier: [6073, 5970, 6296], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 27 of 30 that passed through a boulder placed before them pushed clear (3 left out), 3 fewer solid; was [6076, 5973, 6296] (2026-10-03 regional hessian kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [5999, 5949, 6296]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [6313, 6263, 6643] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [6317, 6267, 6647]: 2026-10-03 regional hessian kit: the water mill fits its plot (maps/regional/hessian.ts) (was [6317, 6270, 6647]); 2026-10-03 regional hessian kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [6317, 6179, 6647]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [6316, 6180, 6691] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [7987, 7851, 8359] (2026-10-02 Frontier Basin redesign (docs/MAP-LAYOUT-BRIEF.md); was [7905, 7634, 8284], and [7730, 7594, 8120] before its aprons stood on their ground (apron bank law)))))
  fjord: [5064, 4993, 5190], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 40 of 58 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (18 left out); 100 of 113 that passed through a boulder placed before them pushed clear (13 left out), 26 fewer solid; was [5090, 5019, 5190] (2026-10-03 Nordhavn Fjord's town on the harbour road and its lighthouse on the south headland (gauntlet wave 28) [5116, 5067, 5190]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [6048, 5999, 6314] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [6041, 5992, 6306]; 2026-10-03 Nordhavn Fjord's bravo deploys in a 4 x 2 block (the deployment lean) [5635, 5576, 5851]; 2026-10-03 Nordhavn Fjord layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [5639, 5580, 5852]; was [7357, 7301, 7679]))
  delta: [6574, 6203, 8252], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 17 of 20 that passed through a boulder placed before them pushed clear (3 left out), 3 fewer solid; was [6577, 6206, 8252] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [6656, 6285, 8267] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [6651, 6280, 8263]: 2026-10-03 regional bengal kit: the bazaar row and the big homestead lie along their plots (maps/regional/bengal.ts) (was [6651, 6282, 8263]); 2026-10-03 regional bengal kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [6651, 6289, 8263]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [6654, 6301, 8284] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [8149, 7796, 9775] (2026-10-02 Jade River Delta redesign (docs/MAP-LAYOUT-BRIEF.md); was [7742, 7430, 9644], and [8114, 7761, 9770] before its aprons stood on their ground (apron bank law)))))
  badlands: [1503, 1132, 283], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 254 of 278 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (24 left out); 142 of 177 that passed through a boulder placed before them pushed clear (35 left out), 44 fewer solid; was [1547, 1176, 283] (2026-10-03 regional wadirum kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [1538, 1168, 283]); 2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [1519, 1158, 274]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2760, 2399, 1538] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2761, 2400, 1539]: 2026-10-03 regional wadirum kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [2761, 2520, 1539]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [2737, 2496, 1543] (before it: 2026-10-03 Redrock's inselbergs as jebels after gauntlet wave 4 (boulder aprons of fallen blocks on their talus, sand ramps on the lane domes, the gate pairs 26 m out so the frontline's third sector stands on the floor); was [2570, 2322, 1513] after the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [3013, 2765, 1956] (2026-10-02 Redrock Divide redesign (docs/MAP-LAYOUT-BRIEF.md); was [3011, 2915, 1920]))))
  // Native recapture with prior prop code also contains this additional wreck.
  monsoon: [7333, 7079, 9700], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 40 of 40 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 69 of 76 that passed through a boulder placed before them pushed clear (7 left out), 7 fewer solid; was [7340, 7086, 9700] (2026-10-03 regional kohima kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [7331, 7086, 9700]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [7984, 7739, 10472] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [7980, 7735, 10468]: 2026-10-03 regional kohima kit: the bazaar row, the Angami house and the bungalow inside their plots (maps/regional/kohima.ts) (was [7980, 7744, 10468]); 2026-10-03 regional kohima kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [7980, 7755, 10468]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [7976, 7751, 10469] (before it: 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [7972, 7747, 10495]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [9855, 9630, 12375] (2026-10-02 Monsoon Ridge layout-brief rebuild (docs/MAP-LAYOUT-BRIEF.md); was [9473, 9215, 12022]))))
  alpine: [2079, 1908, 882], // 2026-10-06 round 3 (gauntlet wave 109b: "spread far apart along straight roads"): every village building a planned site in two hamlets round the church and the crossroads (terrace sites), the props stream after them re-seated, the plateau above the larches treeless (12 stands, 10 lone trees, 30 rim trees); was [4262, 4018, 2992] (2026-10-05 round 2 (gauntlet wave 109b): the col nearly treeless above the larches (34 stands, 40 lone trees: were 92 and 146), the yards fenced in larch boards, the lauzes 0.34 m, snow banked against the walls, the shelled house's heaps, slabs and burnt frame; was [6884, 6661, 5659] (2026-10-05 the Savoyard kit (map revival lane 2): every building rebuilt in place as the Maurienne's and the pass's own, its walls filling the base's measured box, the Vallo Alpino casemate at the western redoubt, the yards' larch fences and woodsheds, the Grande Croix; was [6795, 6723, 5659] (2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 64 of 66 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (2 left out); 113 of 128 that passed through a boulder placed before them pushed clear (15 left out), 14 fewer solid; was [6809, 6737, 5659] (2026-10-03 the map-borders lane, waves 3-4 (the exits' portal tails held to the land, the rim trees by wave 3's hedged field system): was [6803, 6731, 5659]; 2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [6497, 6422, 5325]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [7095, 7020, 5957] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [7093, 7018, 5955]: 2026-10-03 merged: Glacier Pass's layout-brief rebuild (maps lane A, [7079, 7008, 5955] on the borders' first pass) on the map-borders lane's wave 2 (roads on the landform's rim; [7005, 6932, 5907] on the old map))))))
  // Same prior-props baseline verification as Monsoon.
  caldera: [1525, 1650, 979], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 73 of 73 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 113 of 138 that passed through a boulder placed before them pushed clear (25 left out), 24 fewer solid; was [1549, 1674, 979] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [1510, 1630, 937]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2476, 2596, 1229] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2474, 2594, 1227]: 2026-10-03 merged: Obsidian Caldera after gauntlet wave 3 (maps lane A: Canary pine and broom on bare cinder, rills, talus fans, lava flows; [2478, 2598, 1227] on the borders' first pass) on the map-borders lane's wave 2 ([4033, 4140, 2845] on the old map)))
  foundry: [3167, 3414, 2060], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 13 of 18 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (5 left out); 18 of 20 that passed through a boulder placed before them pushed clear (2 left out), 6 fewer solid; was [3173, 3420, 2060] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [3205, 3447, 2065]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3033, 3275, 1896] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [3034, 3276, 1897]: 2026-10-03 merged: Ironworks' layout-brief rebuild (maps lane A, [3033, 3275, 1897] on the borders' first pass) on the map-borders lane's wave 2 ([3249, 3360, 2082] on the old map)))
  ruinspires: [1932, 8349, 462], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 6 of 7 that passed through a boulder placed before them pushed clear (1 left out), 1 fewer solid; was [1933, 8350, 462] (2026-10-03 Ruinspires layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [2105, 8566, 343]; was [2823, 9284, 1050])
  blackglass: [2831, 5064, 1488], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 19 of 23 that passed through a boulder placed before them pushed clear (4 left out), 4 fewer solid; was [2835, 5068, 1488] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [2694, 4927, 1357]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2806, 5039, 1474] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2809, 5042, 1477]: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [3661, 5894, 2333]))
  titan_gorge: [2417, 2336, 1029], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 99 of 100 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 143 of 159 that passed through a boulder placed before them pushed clear (16 left out), 17 fewer solid; was [2434, 2353, 1029] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [2476, 2337, 983]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2489, 2350, 992] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2484, 2345, 987]: 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [2486, 2347, 987]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [2725, 2586, 1230]))
  skybridge: [2827, 3094, 1486], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 57 of 58 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 120 of 137 that passed through a boulder placed before them pushed clear (17 left out), 18 fewer solid; was [2845, 3112, 1486] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [2961, 3164, 1521]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3002, 3205, 1560] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [3001, 3204, 1559]: 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [3010, 3213, 1559]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [3522, 3725, 2079]))
  polders: [3425, 3261, 2712], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 1 of 1 boulder that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 16 of 17 that passed through a boulder placed before them pushed clear (1 left out), 1 fewer solid; was [3426, 3262, 2712] (2026-10-03 regional polder kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [3385, 3246, 2712]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3376, 3237, 2700] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [3372, 3233, 2696]: 2026-10-03 regional polder kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [3372, 3135, 2696]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [3362, 3128, 2706] (before it: 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [3363, 3129, 2706]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [4232, 3998, 3574] (2026-10-02 Tidegate Polders redesign (docs/MAP-LAYOUT-BRIEF.md); was [4268, 4025, 3604]))))
  copper_mesa: [2153, 2017, 1453], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 4 of 4 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 34 of 39 that passed through a boulder placed before them pushed clear (5 left out), 5 fewer solid; was [2158, 2022, 1453] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2194, 2058, 1491] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [2191, 2055, 1488]; 2026-10-03 Copper Mesa (its north shelf removed) layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [2240, 2140, 1429]; was [2805, 2705, 1984]))
  airfield: [2481, 2487, 1967], // 2026-10-03 Kestrel Airfield's hangar plot behind the cargo apron and its rotation (gauntlet wave 28) [2492, 2451, 1967]; 2026-10-03 regional hostomel kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [2492, 2591, 1967]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2422, 2521, 1893] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [2425, 2524, 1896]; 2026-10-03 Kestrel Airfield's hangar for the civic hall and its sheet cladding (gauntlet wave 11) [2432, 2568, 1896]; 2026-10-03 Kestrel Airfield layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [2450, 2429, 1959]; was [3671, 3650, 3173])
  oasis: [1375, 1155, 674], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 2 of 2 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 38 of 40 that passed through a boulder placed before them pushed clear (2 left out), 2 fewer solid; was [1377, 1157, 674] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2224, 2004, 1517] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [2225, 2005, 1518]; 2026-10-03 Sunscar Oasis layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [2267, 2037, 1562]; was [2740, 2510, 2031]))
  whiteout: [1326, 1192, 606], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 2 of 3 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 34 of 36 that passed through a boulder placed before them pushed clear (2 left out), 3 fewer solid; was [1329, 1195, 606] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [1300, 1166, 576] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [1299, 1165, 575]; 2026-10-03 Whiteout Station's two wind berms (battlePacing 45003) [1300, 1165, 575]; 2026-10-03 Whiteout Station layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [1303, 1169, 575]; was [1601, 1467, 875]))
  orchard: [3705, 3471, 3963], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 5 of 6 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 28 of 31 that passed through a boulder placed before them pushed clear (3 left out), 4 fewer solid; was [3709, 3475, 3963] (2026-10-03 the map-borders lane, waves 3-4 (the exits' portal tails held to the land, the rim trees by wave 3's hedged field system): was [3717, 3483, 3963]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3717, 3483, 3922] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [3712, 3478, 3917]; 2026-10-03 Orchard Valley layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [3714, 3482, 3941]; was [4923, 4691, 5160]))
  longleaf: [4894, 4691, 5798], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 2 of 2 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 32 of 38 that passed through a boulder placed before them pushed clear (6 left out), 6 fewer solid; was [4900, 4697, 5798] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [4890, 4687, 5803] (2026-10-03 Longleaf Crossing layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [4953, 4756, 5912]; was [6218, 6021, 7183]))
  mangrove: [4574, 4313, 5709], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 22 of 24 that passed through a boulder placed before them pushed clear (2 left out), 2 fewer solid; was [4576, 4315, 5709] (2026-10-03 regional mekong kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [4540, 4315, 5709]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [4524, 4299, 5679] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [4525, 4300, 5680]: 2026-10-03 regional mekong kit: the market hall row and the ground farmhouse lie along their plots (maps/regional/mekong.ts) (was [4525, 4306, 5680]); 2026-10-03 regional mekong kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [4525, 4352, 5680]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [4520, 4347, 5686] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [5377, 5204, 6535] (2026-10-02 Mangrove Reach redesign (docs/MAP-LAYOUT-BRIEF.md); was [5282, 5127, 6502]))))
  saltwind: [3037, 2880, 3408], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 3 of 7 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (4 left out); 38 of 43 that passed through a boulder placed before them pushed clear (5 left out), 8 fewer solid; was [3045, 2888, 3408] (2026-10-03 regional dalmatian kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [3009, 2826, 3408]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [2966, 2783, 3369] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [2971, 2788, 3371]: 2026-10-03 regional dalmatian kit: the market loggia lies along its plot, the tavern vine replaces the street pergola (maps/regional/dalmatian.ts) (was [2971, 2790, 3371]); 2026-10-03 regional dalmatian kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [2971, 2774, 3371]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [2970, 2773, 3428] (before it: 2026-10-03 the map-borders lane: rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [3666, 3469, 4131] (2026-10-02 Saltwind Narrows redesign (docs/MAP-LAYOUT-BRIEF.md); was [3629, 3392, 4048], and [3811, 3614, 4260] before its aprons stood on their ground (apron bank law)))))
  reservoir: [5127, 5017, 5943], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 12 of 14 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (2 left out); 50 of 52 that passed through a boulder placed before them pushed clear (2 left out), 2 fewer solid; was [5129, 5019, 5943] (2026-10-03 regional eifel kit: the side yards, the fine joinery and the airfield kit, on the merged tree of the PR head 24d0a3131 (trees round 2, maps lane A batch 4) (was [5095, 5001, 5943]); 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [5211, 5117, 6057] (2026-10-03 the ground lane's land use over PR head 52616f2db (regional buildings, scenery props, skies); before it [5207, 5113, 6053]: 2026-10-03 regional eifel kit on the merged tree of the PR head 21b4e853f (the scenery and skies merges) (was [5207, 5079, 6053]); 2026-10-03 scenery lane (world/scenery.ts): its rock masses and landmarks, the trees and shrubs off them; was [5193, 5066, 6054] (before it: 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [5194, 5067, 6054]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [6495, 6368, 7349] (2026-10-02 Highland Reservoir layout-brief revision and its aprons on their ground (docs/MAP-LAYOUT-BRIEF.md); was [6425, 6300, 7206]))))
  mars: [725, 705, 0], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 49 of 49 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 112 of 126 that passed through a boulder placed before them pushed clear (14 left out), 12 fewer solid; was [737, 717, 0] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [768, 714, 0]; 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [765, 711, 0]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [769, 715, 0])
  moon: [572, 410, 0], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 13 of 13 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 79 of 86 that passed through a boulder placed before them pushed clear (7 left out), 7 fewer solid; was [579, 417, 0] (2026-10-03 Earthrise Basin (with its middle-lane craters) layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [474, 380, 0]; was [475, 381, 0])
  cliffbridge: [4955, 5103, 4093], // 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 13 of 13 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 52 of 59 that passed through a boulder placed before them pushed clear (7 left out), 7 fewer solid; was [4962, 5110, 4093] (2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [4831, 4979, 3959] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [4834, 4982, 3962]; 2026-10-03 Aegis Crossing layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [4656, 4389, 4003]; was [5903, 5636, 5243]))
};
// Footprints in either winding (2026-10-03, world/collision.ts convexWinding; railyard battlePacing seed 28003 ran to
// the 900 s cap). A captured convex part may wind clockwise, and the shell ray, the route probe and the clearance test
// read every part as counter-clockwise: a clockwise part held no point and a shell through it passed (urban's roofs let
// 3086 of 14716 plunging shells aimed through their clockwise strips through the whole building). Every clockwise part
// of every shard, shell and movement alike, now answers exactly as its counter-clockwise twin, holds its centroid and
// stops a shell aimed through it, level at its mid-height and plunging; the census counts them per map. A part whose
// quantised points zigzag a millimetre against its own winding (not convex) fails in either winding: a separate defect,
// counted, and it must turn against its winding somewhere.
const windingCensus = [];
let quantisedFailures = 0;
const windingRay = new Vector3();
const windingNormal = new Vector3();
const LEVEL = new Vector3(1, 0, 0);
const PLUNGE = new Vector3(0, -1, 0);
function clockwiseConvexParts(records) {
  const parts = [];
  for (const record of records) {
    const shape = record.shape2;
    if (!shape) continue;
    for (const part of shape.kind === 'compound' ? shape.parts : [shape]) {
      if (part.kind !== 'convex') continue;
      let area2 = 0;
      for (let index = 0; index < part.points.length; index += 2) {
        const next = (index + 2) % part.points.length;
        area2 += part.points[index] * part.points[next + 1] - part.points[next] * part.points[index + 1];
      }
      if (area2 < 0) parts.push({ record, part });
    }
  }
  return parts;
}
function turnsAgainstClockwise(points) {
  for (let index = 0; index < points.length; index += 2) {
    const next = (index + 2) % points.length, after = (index + 4) % points.length;
    if ((points[next] - points[index]) * (points[after + 1] - points[next + 1])
      - (points[next + 1] - points[index + 1]) * (points[after] - points[next]) > 0) return true;
  }
  return false;
}
function partAnswers(record, part, points, cx, cz) {
  let minX = Infinity, maxX = -Infinity;
  for (let index = 0; index < points.length; index += 2) {
    minX = Math.min(minX, points[index]); maxX = Math.max(maxX, points[index]);
  }
  const y0 = part.y0 ?? record.min[1], y1 = part.y1 ?? record.max[1];
  const alone = { min: [minX, y0, record.min[2]], max: [maxX, y1, record.max[2]], shape2: { ...part, points } };
  const held = collisionFootprintContainsPoint(alone, cx, cz, 0);
  windingRay.set(minX - 5, 0.5 * (y0 + y1), cz);
  const level = y1 - y0 > 1e-6 ? rayCollisionRecord(windingRay, LEVEL, alone, maxX - minX + 10, windingNormal) : 0;
  windingRay.set(cx, y1 + 20, cz);
  const plunge = rayCollisionRecord(windingRay, PLUNGE, alone, 40, windingNormal);
  return { held, level, plunge };
}
function assertClockwiseHeld(mapId, kind, parts) {
  let held = 0;
  for (const { record, part } of parts) {
    let cx = 0, cz = 0;
    for (let index = 0; index < part.points.length; index += 2) { cx += part.points[index]; cz += part.points[index + 1]; }
    cx /= part.points.length / 2; cz /= part.points.length / 2;
    const twin = [];
    for (let index = part.points.length - 2; index >= 0; index -= 2) twin.push(part.points[index], part.points[index + 1]);
    const answer = partAnswers(record, part, part.points, cx, cz);
    const twinAnswer = partAnswers(record, part, twin, cx, cz);
    assert.equal(answer.held, twinAnswer.held, `${mapId} ${kind} ${record.kind}: a clockwise part holds what its twin holds`);
    assert.ok(Math.abs(answer.level - twinAnswer.level) < 1e-9 && Math.abs(answer.plunge - twinAnswer.plunge) < 1e-9,
      `${mapId} ${kind} ${record.kind}: a clockwise part stops a shell where its twin does`);
    if (answer.held && answer.level >= 0 && answer.plunge >= 0) { held++; continue; }
    assert.ok(turnsAgainstClockwise(part.points), `${mapId} ${kind} ${record.kind}: a clockwise part that fails turns against its winding`);
    quantisedFailures++;
  }
  return held;
}
const stats = dedicatedCollisionManifestStats();
assert.deepEqual(Object.keys(expected), MAP_IDS, 'every registered map has a fixed census expectation');
assert.deepEqual(Object.keys(stats), MAP_IDS, 'manifest order and map registry stay in lockstep');
assert.deepEqual(readdirSync(new URL('./world-collision-manifests/', import.meta.url))
  .filter((file) => file.endsWith('.json') && file !== 'index.json').sort(),
MAP_IDS.map((id) => `${id}.json`).sort(), 'exactly one collision shard exists for every canonical map');
for (const [mapId, counts] of Object.entries(expected)) {
  assert.deepEqual(Object.values(stats[mapId]), counts, `${mapId} manifest census`);
  const mapWorld = createDedicatedWorldCollision(mapId);
  if (mapId === 'reservoir' || mapId === 'longleaf' || mapId in coalCensus) authoredWorlds.set(mapId, mapWorld);
  const solidShell = clockwiseConvexParts(mapWorld.getColliders()).filter(({ record }) => !record.crushable);
  const shellHeld = assertClockwiseHeld(mapId, 'shell', solidShell);
  const movementHeld = assertClockwiseHeld(mapId, 'movement', clockwiseConvexParts(mapWorld.getObstacles()));
  windingCensus.push(`${mapId} ${shellHeld}/${movementHeld}`);
  const hedgehogObstacles = mapWorld.getObstacles().filter((record) => record.kind === 'hedgehog');
  const hedgehogColliders = mapWorld.getColliders().filter((record) => record.kind === 'hedgehog');
  assert.ok((getMapConfig(mapId).props.hedgehogs === 0 ? hedgehogObstacles.length === 0 : hedgehogObstacles.length >= 3) && hedgehogObstacles.length % 3 === 0,
    `${mapId} hedgehogs remain complete three-beam compounds`);
  assert.equal(hedgehogColliders.length, hedgehogObstacles.length,
    `${mapId} movement and shell hedgehog censuses agree`);
  assert.ok(hedgehogObstacles.every((record) => record.shape2?.kind === 'obb'),
    `${mapId} dedicated movement preserves narrow hedgehog beam shapes`);
  assert.ok(hedgehogColliders.every((record) => record.shape2?.kind === 'obb'),
    `${mapId} dedicated shell collision preserves narrow hedgehog beam shapes`);
  for (const kind of ['rubble', 'hedgehog', 'small-rock']) {
    const clutter = mapWorld.getObstacles().filter(record => record.kind === kind);
    assert.ok(clutter.every(record => record.crushable && record.crushMin === 0 && record.crushKeep === 1 && Number.isInteger(record.propIdx)),
      `${mapId}/${kind}: contact yields without a speed or track-damage impact`);
    for (const propIdx of new Set(clutter.map(record => record.propIdx))) {
      const members = clutter.filter(record => record.propIdx === propIdx);
      const shells = mapWorld.getColliders().filter(record => record.propIdx === propIdx);
      assert.equal(members.length, kind === 'hedgehog' ? 3 : 1);
      assert.equal(shells.length, members.length, 'movement and shell members share their destruction owner');
      assert.ok(shells.every(record => record.crushable && record.kind === kind));
    }
  }
  const treeObstacles = mapWorld.getObstacles().filter((record) => record.treeIdx != null);
  const treeColliders = mapWorld.getColliders().filter((record) => record.treeIdx != null);
  // 2026-09-19: Mars (Olympus Basin) fields no vegetation by design (its species counts are zero), so
  // the reachable-tree census is empty there; every other map still captures its trees.
  if (getMapConfig(mapId).vegetation.clusterCount + getMapConfig(mapId).vegetation.loneCount > 0) assert.ok(treeObstacles.length > 0, `${mapId} captures reachable trees as movement obstacles`);
  assert.equal(treeColliders.length, treeObstacles.length,
    `${mapId} movement and shell tree censuses agree`);
  assert.ok(treeObstacles.every((record) => record.crushable && record.kind === 'tree'),
    `${mapId} every reachable tree follows the shared destruction behavior`);
  assert.ok(treeObstacles.every((record) => record.crushMin === 0 && record.crushKeep === 1),
    `${mapId} trees topple immediately without becoming invisible speed bumps`);
}

// Native export must include every authored facility, with paired movement and
// shell records. A crowded-out site or stale server shard must fail this gate.
const colony = createDedicatedWorldCollision('mars');
for (const site of OLYMPUS_SETTLEMENT) {
  // The origin can sit in an intentional opening between paired fuel tanks;
  // identify the authored fixture by its kind and native bounds, not filled air.
  const matches = colony.getObstacles().filter(record => record.kind === site.structure
    && record.min[0] <= site.x && record.max[0] >= site.x
    && record.min[2] <= site.z && record.max[2] >= site.z);
  assert.equal(matches.length, 1, `${site.id}: exactly one native facility at the authored site`);
  const obstacle = matches[0];
  assert.ok(obstacle, `${site.id}: authored Olympus facility has server movement collision`);
  const collider = colony.getColliders().find(record => record.propIdx === obstacle.propIdx);
  assert.ok(collider && collider.kind === site.structure, `${site.id}: matching shell/LOS cover`);
  assert.equal(colony.crushObstacle(obstacle), true, `${site.id}: facility participates in destruction`);
  assert.equal(collider.dead, true, `${site.id}: destruction removes its shell cover`);
}

const world = createDedicatedWorldCollision('verdant');
assert.equal(world.getObstacles().length, expected.verdant[0]);
assert.equal(world.getColliders().length, expected.verdant[1]);
assert.equal(world.getConcealment().length, expected.verdant[2]);
assert.ok(world.getObstacles().some((record) => record.shape2?.kind === 'convex'));
const compoundStructure = world.getObstacles().find((record) => record.shape2?.kind === 'compound');
assert.ok(compoundStructure && compoundStructure.shape2.parts.length >= 2,
  'dedicated manifest preserves exact compound structure parts behind one broad-phase record');
assert.ok(world.getObstacles().some((record) => record.crushable));
const destructible = world.getObstacles().find((record) => record.crushable &&
  record.propIdx != null && world.getColliders().some((entry) => entry.propIdx === record.propIdx));
const destructibleCollider = world.getColliders().find((record) =>
  record.propIdx === destructible.propIdx);
assert.equal(world.crushObstacle(destructible), true);
assert.equal(destructibleCollider.dead, true, 'destroyed server cover opens shell and LOS paths');

const tree = world.getObstacles().find((record) => record.treeIdx != null);
const treeCollider = world.getColliders().find((record) => record.treeIdx === tree.treeIdx);
assert.equal(world.crushObstacle(tree), true, 'dedicated tree yields to shell or ram destruction');
assert.equal(treeCollider.dead, true, 'felled dedicated tree leaves the shell/LOS collider set');

const shapeCenter = (shape, record) => {
  if (!shape) return [(record.min[0] + record.max[0]) * 0.5, (record.min[2] + record.max[2]) * 0.5];
  if (shape.kind === 'compound') return shapeCenter(shape.parts[0], record);
  return [shape.cx, shape.cz];
};
let hit = null;
for (const collider of world.getColliders()) {
  if (collider.dead || collider.max[1] - collider.min[1] < 0.2) continue;
  const [centerX, centerZ] = shapeCenter(collider.shape2, collider);
  hit = world.raycast(
    new Vector3(centerX, collider.max[1] + 2, centerZ),
    new Vector3(0, -1, 0),
    collider.max[1] - collider.min[1] + 4,
  );
  if (hit?.kind === 'prop') break;
}
assert.equal(hit?.kind, 'prop', 'headless raycast resolves captured shell cover');
const compound = world.getColliders().find((record) => record.shape2?.kind === 'compound');
assert.ok(compound, 'dedicated manifest retains compound structure footprints');
assert.ok(compound.shape2.parts.length >= 2 && compound.shape2.parts.length <= 64,
  'dedicated compound remains tight and bounded after inflation');

// Reuse the actual worlds/terrain above. Only the two small authored record
// subsets are re-encoded and inflated; no browser or procedural props rebuild.
function roundTripFeatureWorld(mapId, sourceWorld, kind) {
  const manifest = decodeCollisionManifest(JSON.parse(readFileSync(
    new URL(`./world-collision-manifests/${mapId}.json`, import.meta.url), 'utf8')));
  const selected = {
    obstacles: manifest.obstacles.filter(record => record.k === kind),
    colliders: manifest.colliders.filter(record => record.k === kind), concealers: [],
  };
  const restored = decodeCollisionManifest(JSON.parse(JSON.stringify(encodeCollisionManifest(selected))));
  assert.deepEqual(restored, selected, `${mapId}: all authored bounds, shapes, metadata and order round-trip exactly`);
  const copy = createHeadlessCollisionWorld({ mapId, heightField: sourceWorld.heightField, manifest: restored });
  assert.deepEqual(copy.getObstacles(), sourceWorld.getObstacles().filter(record => record.kind === kind));
  assert.deepEqual(copy.getColliders(), sourceWorld.getColliders().filter(record => record.kind === kind));
  return copy;
}

/** Highest top among the compound parts covering (x, z); parts without their own extent span the record. */
function collisionTopAt(record, x, z) {
  const parts = record.shape2?.kind === 'compound' ? record.shape2.parts : [record.shape2];
  let top = -Infinity;
  for (const part of parts) {
    const probe = { min: [...record.min], max: [...record.max], shape2: part };
    if (!collisionFootprintContainsPoint(probe, x, z, 0)) continue;
    top = Math.max(top, part?.y1 ?? record.max[1]);
  }
  return Number.isFinite(top) ? top : record.max[1];
}

function assertAuthoredContact(mapWorld, obstacle, collider, x, z, label) {
  assert.ok(mapWorld.queryObstacles(x - 0.1, z - 0.1, x + 0.1, z + 0.1, []).includes(obstacle),
    `${label}: the dedicated broad phase indexes the authored footprint`);
  const push = { x: 0, z: 0 };
  assert.equal(pushHullFromObstacle({ x, z }, 0, 1, 1, 0, 1, 0.7, obstacle, push), true,
    `${label}: actual hull contact resolves against the inflated shape`);
  assert.ok(Number.isFinite(push.x) && Number.isFinite(push.z) && Math.hypot(push.x, push.z) > 0);
  const [cx, cz] = shapeCenter(collider.shape2, collider);
  // 2026-09-19 hitbox pass: a compound part may carry its own top (the flatbed's bed sits below its cab), so the
  // probe expects the top of the part under the footprint centre, and nothing above it
  const top = collisionTopAt(collider, cx, cz);
  const origin = new Vector3(cx, top + 0.5, cz), down = new Vector3(0, -1, 0);
  const normal = new Vector3();
  assert.ok(Math.abs(rayCollisionRecord(origin, down, collider, 0.75, normal) - 0.5) < 1e-9,
    `${label}: the top collision plane survives inflation`);
  assert.ok(top <= collider.max[1] + 1e-9 && top > collider.min[1], `${label}: the part top lies inside the record's span`);
  assert.deepEqual(normal.toArray(), [0, 1, 0]);
  const hit = mapWorld.raycast(origin, down, 0.75);
  assert.equal(hit?.record, collider, `${label}: world raycast reaches this exact cover record`);
  assert.ok(Math.abs(hit.point.y - top) < 1e-9, `${label}: the world raycast lands on the same part top`);
  return { origin, down };
}

const capturedNumber = value => Math.round(value * 10000) / 10000;

function expectedWaterworksBounds(field, name, center, width, depth, waterLevel) {
  const [x, z] = center;
  let low = Infinity, high = -Infinity;
  for (let px = x - width / 2; px <= x + width / 2; px += 0.5) {
    for (let pz = z - depth / 2; pz <= z + depth / 2; pz += 0.5) {
      const y = field.getHeightAt(px, pz);
      low = Math.min(low, y); high = Math.max(high, y);
    }
  }
  // Independent authored dimensions: dry kiosk embeds 12 cm; hydraulic feet
  // extend 1.2 m below the water plane. The taller intake body has a closed
  // full-footprint 1.04 m hood; the ordinary kiosk/bank caps add 6 cm.
  const bottom = name === 'kiosk' ? low - 0.12 : waterLevel - 1.2;
  const top = name === 'intake' ? waterLevel + 7.4 + 1.04
    : (name === 'kiosk' ? high + 3.2 : waterLevel + 1.1) + 0.06;
  return { min: [x - width / 2, bottom, z - depth / 2].map(capturedNumber),
    max: [x + width / 2, top, z + depth / 2].map(capturedNumber) };
}

function assertWaterworks(mapWorld) {
  const obstacles = mapWorld.getObstacles().filter(record => record.kind === 'waterworks');
  const colliders = mapWorld.getColliders().filter(record => record.kind === 'waterworks');
  assert.equal(obstacles.length, 3,
    'Reservoir fixture is missing the three authored waterworks obstacles; regenerate its native collision shard');
  assert.equal(colliders.length, 3, 'Reservoir must capture all three waterworks shell-cover records');
  const config = getMapConfig('reservoir').props.reservoirWaterworks;
  const level = mapWorld.heightField._layout.lakes[config.lakeIndex].level;
  assert.ok(Number.isFinite(level));
  for (const [name, width, depth] of [['kiosk', 6, 6], ['bank', 7, 12], ['intake', 7, 6]]) {
    const [x, z] = config[name];
    const selected = records => records.filter(record => record.shape2?.cx === x && record.shape2?.cz === z);
    const obs = selected(obstacles), cols = selected(colliders);
    assert.equal(obs.length, 1, `${name}: exactly one movement slot at the authored site`);
    assert.equal(cols.length, 1, `${name}: exactly one shell slot at the authored site`);
    const bounds = expectedWaterworksBounds(mapWorld.heightField, name, [x, z], width, depth, level);
    for (const record of [obs[0], cols[0]]) {
      assert.deepEqual(record.shape2, { kind: 'obb', cx: x, cz: z, hw: width / 2, hl: depth / 2, yaw: 0 },
        `${name}: old rubble circle is replaced, not retained beside the body OBB`);
      assert.deepEqual(record.min, bounds.min); assert.deepEqual(record.max, bounds.max);
      for (const key of ['crushable', 'propIdx', 'treeIdx', 'crushMin', 'crushKeep', 'dead', 'crushed']) {
        assert.equal(record[key], undefined, `${name}: permanent masonry has no destruction linkage (${key})`);
      }
      assert.equal(shellPassesThroughCollisionRecord(record), false, `${name}: shells cannot pass through solid waterworks`);
      assert.equal(rayCollisionRecord(new Vector3(record.max[0] + 0.02, record.max[1] + 0.5,
        record.max[2] + 0.02), new Vector3(0, -1, 0), record, 1, new Vector3()), -1,
      `${name}: the narrow phase does not extend beyond the real rectangular footprint`);
    }
    assertAuthoredContact(mapWorld, obs[0], cols[0], x, z, `Reservoir ${name}`);
    if (name === 'intake') assertIntakeHood(cols[0]);
  }
  const bank = colliders.find(record => record.shape2.cx === config.bank[0]);
  const intake = colliders.find(record => record.shape2.cx === config.intake[0]);
  assert.equal(bank.max[0], intake.min[0], 'bank and intake meet without a phantom water gap');
  assert.equal(bank.min[1], intake.min[1], 'both hydraulic bodies share the submerged foundation depth');
  assert.ok(intake.min[2] >= bank.min[2] && intake.max[2] <= bank.max[2],
    'the full intake interface is supported inside the bank span');
}

function assertIntakeHood(record) {
  const direction = new Vector3(-1, 0, 0), hit = new Vector3();
  const x = record.max[0] + 0.5;
  for (const z of [record.min[2] + 0.001, record.shape2.cz, record.max[2] - 0.001]) {
    const below = new Vector3(x, record.max[1] - 0.001, z);
    assert.ok(Math.abs(rayCollisionRecord(below, direction, record, 1, hit) - 0.5) < 1e-9,
      'the closed service hood blocks grazing shells across its full actual width');
    assert.equal(rayCollisionRecord(new Vector3(x, record.max[1] + 0.001, z),
      direction, record, 1, hit), -1, 'no invisible cover above the hood');
  }
  for (const z of [record.min[2] - 0.001, record.max[2] + 0.001]) {
    assert.equal(rayCollisionRecord(new Vector3(x, record.max[1] - 0.001, z),
      direction, record, 1, hit), -1, 'no invisible cover outside the hood footprint');
  }
}

function assertLoggingYard(mapWorld, independentWorld) {
  // 2026-09-29 curved roads change the seeded traffic donors. The actual
  // heavy-traffic stage independently reproduces these two scales and original
  // positions; both native records still occupy the authored loading bays.
  const sitesForFilter = getMapConfig('longleaf').props.loggingYard.flatbeds;
  const atBay = record => sitesForFilter.some(site => Math.hypot(
    (record.min[0] + record.max[0]) / 2 - site.x, (record.min[2] + record.max[2]) / 2 - site.z) < 26);
  const flatbeds = mapWorld.getObstacles().filter(record => record.kind === 'truckflatbed' && atBay(record));
  const colliders = mapWorld.getColliders().filter(record => record.kind === 'truckflatbed' && atBay(record));
  // Both original donor heights and authored destinations remain exact.
  // The original sites below still detect phantom copies after relocation.
  // 2026-10-02 (maps lane B): Longleaf Crossing's gentler relief moves the same two donors (src/world/loggingYard
  // .selftest.mjs replays them) and two props fewer precede them; was propIdx 309 / 310, heights 2.0045 / 1.9813 from
  // (-149.2308, -173.9215) and (-80.6038, 239.7031).
  const donors = [{ propIdx: 307, height: 2.0045, old: [-149.2563437955792, -173.84073125534042] },
    { propIdx: 308, height: 1.9812, old: [-80.53000567837782, 239.67939683819532] }];
  assert.deepEqual(flatbeds.map(record => record.propIdx), donors.map(record => record.propIdx));
  assert.deepEqual(colliders.map(record => record.propIdx), donors.map(record => record.propIdx));
  const sites = getMapConfig('longleaf').props.loggingYard.flatbeds;
  assert.equal(sites.length, 2, 'both existing flatbeds have explicit loading bays');
  for (const [index, obstacle] of flatbeds.entries()) {
    const { x, z } = sites[index], donor = donors[index], collider = colliders[index];
    assert.equal(obstacle.shape2?.kind, 'compound', 'final ground-bearing flatbed refit survives capture');
    assert.equal(obstacle.shape2.parts.length, 9, 'all original ground-bearing flatbed parts survive');
    assert.ok(Math.hypot(obstacle.shape2.cx - x, obstacle.shape2.cz - z) < 0.3,
      `Longleaf propIdx${donor.propIdx} is missing from its authored loading bay; regenerate its native collision shard`);
    assert.deepEqual(collider, obstacle, 'movement and shell copies share the relocated bounds, shape and identity');
    assert.equal(obstacle.crushable, true); assert.equal(obstacle.crushMin, 2); assert.equal(obstacle.crushKeep, 0.87);
    assert.equal(shellPassesThroughCollisionRecord(obstacle), true, 'relocation preserves existing breakable-cover policy');
    assert.ok(Math.abs(obstacle.max[1] - obstacle.min[1] - donor.height) < 0.000100001,
      'the original scaled height survives two independently rounded Y endpoints');
    assert.ok(!mapWorld.queryObstacles(donor.old[0] - 0.1, donor.old[1] - 0.1,
      donor.old[0] + 0.1, donor.old[1] + 0.1, []).includes(obstacle), 'no phantom donor remains indexed at its old site');
    const independent = independentWorld.getObstacles().find(record => record.propIdx === donor.propIdx);
    const independentCollider = independentWorld.getColliders().find(record => record.propIdx === donor.propIdx);
    assert.notEqual(independent, obstacle); assert.notEqual(independent.shape2.parts[0], obstacle.shape2.parts[0]);
    const before = structuredClone(independent), ray = assertAuthoredContact(mapWorld, obstacle, collider, x, z, 'Longleaf flatbed');
    assert.equal(mapWorld.crushObstacle(obstacle), true);
    assert.equal(obstacle.crushed, true); assert.equal(collider.dead, true);
    assert.equal(mapWorld.crushObstacle(obstacle), false, 'repeat destruction is idempotent');
    assert.notEqual(mapWorld.raycast(ray.origin, ray.down, 0.75)?.record, collider, 'destroyed flatbed opens its shell path');
    assert.deepEqual(independent, before, 'one match cannot destroy the same slot in another match');
    assert.equal(independentCollider.dead, undefined);
    assertAuthoredContact(independentWorld, independent, independentCollider, x, z, 'independent Longleaf flatbed');
  }
}

// The track a heap must leave drivable: the legacy yards' five north-south sidings at the heap's z; on Cinder Junction
// (2026-10-01) the loading stub its coal stage stands beside — the stub's nearest centreline point.
function coalTrackPoints(mapId, x, z) {
  const stages = (getMapConfig(mapId).terrain.railSpurs ?? []).filter((spur) => spur.coalStage);
  if (!stages.length) return [40, 49, 58, 67, 76].map((railX) => [railX, z]);
  return stages.map((spur) => {
    let best = null, bestD = Infinity;
    for (let i = 1; i < spur.path.length; i++) {
      const [ax, az] = spur.path[i - 1], [bx, bz] = spur.path[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bestD) { bestD = d; best = [px, pz]; }
    }
    return best;
  });
}

function assertCoalStockpiles(mapId, mapWorld) {
  const obstacles = mapWorld.getObstacles().filter(record => record.kind === 'coal-heap');
  const colliders = mapWorld.getColliders().filter(record => record.kind === 'coal-heap');
  assert.equal(obstacles.length, coalCensus[mapId], `${mapId}: native coal movement census`);
  assert.equal(colliders.length, obstacles.length, `${mapId}: native coal shell census`);
  for (const [index, obstacle] of obstacles.entries()) {
    const collider = colliders[index];
    assert.deepEqual(collider, obstacle);
    assert.notEqual(collider, obstacle); assert.notEqual(collider.shape2, obstacle.shape2);
    assert.equal(obstacle.shape2?.kind, 'convex', 'coal retains the actual packed vertex hull');
    const { cx: x, cz: z } = obstacle.shape2;
    assert.ok(obstacle.max[0] - obstacle.min[0] < 5 && obstacle.max[2] - obstacle.min[2] < 5,
      'small stockpiles cannot regress to giant placeholder bounds');
    assert.ok(obstacle.max[1] - mapWorld.heightField.getHeightAt(x, z) < 1,
      'captured piles remain sub-metre above their terrain support');
    assert.equal(shellPassesThroughCollisionRecord(collider), false);
    assertAuthoredContact(mapWorld, obstacle, collider, x, z, `${mapId} coal ${index}`);
    for (const [railX, railZ] of coalTrackPoints(mapId, x, z)) {
      assert.equal(pushHullFromObstacle({ x: railX, z: railZ }, 0, 1, 1, 0, 2, 1.5, obstacle, { x: 0, z: 0 }), false,
        'new solid coal leaves every adjacent rail lane driveable');
    }
    assert.equal(rayCollisionRecord(new Vector3(x - 10, collider.max[1] + 0.01, z),
      new Vector3(1, 0, 0), collider, 20, new Vector3()), -1, 'no invisible coal cover above the actual apex');
  }
}

for (const mapId of Object.keys(coalCensus)) {
  const source = authoredWorlds.get(mapId);
  const restored = roundTripFeatureWorld(mapId, source, 'coal-heap');
  assertCoalStockpiles(mapId, source);
  assertCoalStockpiles(mapId, restored);
}

const reservoir = authoredWorlds.get('reservoir');
// Compare pristine inflation before contact queries add their private grid
// stamps. Query bookkeeping is deliberately not serialized into the codec.
const reservoirRoundTrip = roundTripFeatureWorld('reservoir', reservoir, 'waterworks');
assertWaterworks(reservoir);
assertWaterworks(reservoirRoundTrip);
const longleaf = authoredWorlds.get('longleaf');
assertLoggingYard(longleaf, roundTripFeatureWorld('longleaf', longleaf, 'truckflatbed'));

console.log(`dedicatedWorldCollision.selftest: clockwise convex parts holding their centroid and stopping a shell aimed through them (solid shell/movement): ${windingCensus.join(', ')}; ${quantisedFailures} not convex (quantised points), failing in either winding`);
console.log(`dedicatedWorldCollision.selftest: all ${MAP_IDS.length} exact map manifests passed`);
