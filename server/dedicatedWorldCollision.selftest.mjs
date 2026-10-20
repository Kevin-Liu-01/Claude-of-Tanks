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
import { civilianVehicleOverrides } from '../src/world/maps/civilianVehicleKit.ts';
import { localShellSlabs, placeLocalShellSlabs } from '../src/world/rockCollision.ts';
import { TERRAIN_VARIANTS } from '../src/sim/matchRuleset.ts';

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
// (2026-10-06, Skybridge's canyon: the props stream re-draws past the old lake banks' boulders and seats four heaps at
// the yard's sidings where it seated five)
// (2026-10-06, Skybridge round 3: Page never had a railway — the yard's lines, heaps and stores are gone from Skybridge)
const coalCensus = { railyard: 10, caldera: 0, foundry: 6 }; // (2026-10-17, the Ironworks re-landing, item/maps-ironworks-227: the receiving yard's ore and coke windrows (maps/saarWorks.ts) stand where one coal heap stood, the stranded rounds' own pin: was foundry 7) (2026-10-11, the map-revival lane: Caldera's rounds 3-5 laid its two cross roads over the rail kit's old coal-strip draws, was 7)

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
  verdant: [6874, 6932, 7940], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [6874, 6728, 7940]
  desert: [1757, 1834, 1289], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [1762, 1839, 1289]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [1762, 1781, 1289]
  winter: [8413, 8517, 7256], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [8413, 8371, 7256]
  urban: [2962, 8132, 2501], // the maps lane 228 r3b, the routes' corridors widened and the lantern left out: was [2963, 8132, 2501]; the maps lane 228 r3b (the gameplay critic's routes to line-2 kept clear: the north market one row, the north-east pieces off the diagonal; the corner and mouth paving; the west suburb kerbed; the town's oil drums cleared): was [2972, 8136, 2505]; the maps lane 228 r2 (the blind critics' round: the oaks inside the beds and three left out, the Wochenmarkt's eleven stalls, the cars at the kerb, the garage, checkpoint hut, drums and pallets cleared round the room, the lanes kerbed): was [2974, 8143, 2506]; the maps lane 228: the Friedensplatz (world/civic: the green's railings, bollards and benches, the column, the parked cars, 34 trees, 11 lamps; its ring lanes and the extraction's disc kept clear) and the fronted kerbs carried on to their corners: was [2821, 8121, 2472]
  coastal: [4539, 4683, 4325], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [4549, 4693, 4325]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [4549, 4527, 4325]
  autumn: [6220, 6770, 6033], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [6228, 6778, 6033]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [6228, 6610, 6033]
  steppe: [2252, 2318, 1210], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [2282, 2348, 1210]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [2282, 2145, 1210]
  railyard: [2529, 2948, 1337], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [2529, 2713, 1337]
  frontier: [7973, 8168, 8087], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [7973, 7934, 8087]
  fjord: [7162, 8005, 6814], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [7166, 8009, 6814]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [7166, 7677, 6814]
  delta: [8780, 8783, 10067], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee fencesClearBuildings/fenceStubsOut + Delta temple e8649571a, over fence v2, seats and r3): was [8785, 8769, 10067]; integ/227 recapture 5 (bengal 4bbaf3977 on top of fence-records); integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [8775, 8558, 10067]
  badlands: [2259, 2308, 213], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [2264, 2314, 213]; integ/227 recapture 6 (redrock-defects a6842a213 over fence-records), was [2264, 2322, 213]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [2264, 2033, 213]
  // Native recapture with prior prop code also contains this additional wreck.
  monsoon: [9673, 10086, 11564], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [9682, 10095, 11564]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [9682, 9778, 11564]
  alpine: [2583, 2694, 1139], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [2622, 2733, 1139]; the seats head over integ/227 0b6b5b672 (fence v2 on integ): was [2622, 2723, 1139]
  // Same prior-props baseline verification as Monsoon.
  caldera: [2654, 2817, 1035], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [2654, 2560, 1035]
  foundry: [4110, 5002, 2730], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [4110, 4765, 2730]
  ruinspires: [2350, 8819, 382], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [2350, 8731, 382]
  blackglass: [3215, 5593, 1916], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [3260, 5637, 1916]; integ/227 recapture 4 (fence-records colliders on top of shanghai); integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [3260, 4631, 1916]
  titan_gorge: [3119, 3222, 1226], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [3119, 2945, 1226]
  skybridge: [2608, 2845, 1003], // the seats head over integ/227 0b6b5b672 (fence v2 on integ): was [2608, 2844, 1003]
  polders: [4221, 4902, 3380], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [4230, 4919, 3380]; integ/227 recapture 5 (polders-defects 827267394 on top of fence-records); integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [4253, 4510, 3380]
  copper_mesa: [2054, 2758, 958], // the seats head over integ/227 0b6b5b672 (fence v2 on integ): was [2054, 2757, 958]
  airfield: [4720, 5400, 3872], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [4720, 5203, 3872]
  oasis: [1622, 1883, 822], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [1624, 1885, 822]; integ/227 recapture 6 (siwa b249964e5 over fence-records), was [1622, 1884, 822]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [1622, 1764, 822]
  whiteout: [1261, 1712, 0], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [1293, 1744, 0]; the seats head over integ/227 0b6b5b672 (fence v2 on integ): was [1293, 1742, 0]
  orchard: [4542, 4656, 4807], // integ/226 v4 recapture at the world cutoff (09:00, 6da6efefd): the r2 sweep, hutKit, triage and ledger heads: was [4542, 4583, 4807]; integ/226 v2 recapture on 836e15baa (DST-04 crater sites and sections, PH.15 dry-stone spans, DST-03 rubble/huts/wall shells, set-piece parity, the props and maps rounds): was [4507, 4520, 4807]; (integ/225 merge: both sides moved it; ours [4505, 4518, 4807] + theirs [4507, 4520, 4807] - base [4505, 4518, 4807]) 2026-10-14 Lane C r2d (item/propsC-mapvehicles-r2d: the seat passes and the relocation): obstacles by kind against item 7 truckbox +1, truck +1; was [4505, 4518, 4807]; 2026-10-13 the looks lane's bunkers (item/looks-bunkers: fortifications-r1-m213 43d8977a8 and bunker-dense-cover 936b456cd on main fd437ea9e), recaptured in Node: each pillbox's earthwork its own static collision (an earthwork obstacle and collider each); the orchard's two pillboxes kept (beb65d719: a seat the road refuses steps along its line, as on main): was [4503, 4516, 4807]; 2026-10-11 integ/215, the merged tree recaptured in Node: maprev-land-360 (439014022) over hitboxes r2m (a4fff83de) — Orchard Valley round 5 with its transformer kiosk: tree +3608/-3492, wallstone +366/-433, small-rock +118/-132, ? +106/-96, barbedwire +40/-39, 33 hedgehog records reshaped, ...; was [4458, 4471, 4593] (2026-10-09 the hitbox lane, round 2 on main (fix/hitboxes-r2m): the stones' movement tiers (nested columns), the shells' toe ring, authored cover in each map's own stone (Reservoir's slate crags and greywacke blocks; the Moon's and Mars's breccia, Orchard's limestone and Copper Mesa's conglomerate in block fields; props.coverOutcrops retired): was [4456, 4469, 4595]; 2026-10-08 batch 6 integration (integ/batch6-stage), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: modes-tuning(symmetric deployments: stream-neutral clearings at the deployment slots, 3e8fc4020), map-vehicles(round 5: the seated fleet, carts and set pieces, 273b714a1; hulks and slid carts off the clearings, 35954a692); their merged streams counted together here: 8 handcart records reshaped, 5 tank-wreck records reshaped, truck +2/-3, truckbox +1/-2, 1 wagon record reshaped, 1 sedan record reshaped, ...; was [4458, 4471, 4595] (2026-10-08 symmetric deployments over batch 5 (modes lane: 590f51aaf merged into feature/modes-tuning and recaptured in Node with sim/deployment.ts's clearings: both sides' first 14 deployment slots, the scatter left out after its draws — trees 26 m, destructibles 20 m + r, boulders 16 m, rock-field formations 22 m + reach): near the slots 303 tree, 2 small-rock, 1 record; nothing farther moved (the trees' and props' record indices renumber past the left-out records); was [4764, 4777, 4898] (2026-10-08 batch 5 integration (integ/batch5-stage), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: hitboxes(colliders from meshes, ada699c21), maps-orchard(round 4, 6736df11a [4697, 4663, 4902] on the batch-4 stage; its merge f77f0b591 carried the stage shard); their merged streams counted together here: tree +3807/-3819, wallstone +433/-430, small-rock +134/-128, 39 barbedwire records reshaped, 33 hedgehog records reshaped, ? +27/-31, ...; was [4767, 4772, 4911] (2026-10-08 the hitbox lane: the props' shell slabs (sandbag stacks, tank wrecks, hedgehog beams, pylon legs), formations' own outlines from 0.35 m, cover outcrops (reservoir, moon), convex outlines, the rise read over the rendered ground: was [4766, 4732, 4911]; 2026-10-07 the hitbox lane: every stone's colliders from its own mesh (rockCollision.ts; stones under 0.45 m driven over, taller ones given one): was [4706, 4672, 4911]; 2026-10-07 batch 4 (after the push): the landmarks lane's Ottoman fountain on the square's setts (d7082351f), vetoing its ground in the finished village, recaptured on the merged tree: +1 obstacle, +7 colliders, -1 concealment, exactly as on the branch; was [4705, 4665, 4912] (2026-10-07 batch 4 (after the push): Orchard Valley rounds 1-3 (fe04aef5b: the Chouf kit, the contour terraces with their olive rows, the land-use row dropped, no well, camps or tents), recaptured on the merged tree: every structure and dressing kind moves as on the branch (+5 structures, +216 dry-stone wall stones, +6 gates, -139 wattle and -38 picket fence modules, ...); the trees +290 (3529 -> 3819) where the branch's own move is +4 (the Chouf's cedar, Aleppo pine and olive row under the merged trees lane's rules); was [4423, 4201, 4626] (2026-10-06 batch 4 integration (integ/batch4-20261006), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: scenery-b15(field-stacks), trees-longleaf(closed-woods,round5); their merged streams counted together here; was [3705, 3471, 3963] (2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 5 of 6 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 28 of 31 that passed through a boulder placed before them pushed clear (3 left out), 4 fewer solid; was [3709, 3475, 3963] (2026-10-03 the map-borders lane, waves 3-4 (the exits' portal tails held to the land, the rim trees by wave 3's hedged field system): was [3717, 3483, 3963]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3717, 3483, 3922] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [3712, 3478, 3917]; 2026-10-03 Orchard Valley layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [3714, 3482, 3941]; was [4923, 4691, 5160]))))))))); and 2026-10-13 the looks lane's bunkers (item/looks-bunkers: fortifications-r1-m213 43d8977a8 and bunker-dense-cover 936b456cd on main fd437ea9e), recaptured in Node: each pillbox's earthwork its own static collision (an earthwork obstacle and collider each); the orchard's two pillboxes kept (beb65d719: a seat the road refuses steps along its line, as on main): was [4503, 4516, 4807]; 2026-10-11 integ/215, the merged tree recaptured in Node: maprev-land-360 (439014022) over hitboxes r2m (a4fff83de) — Orchard Valley round 5 with its transformer kiosk: tree +3608/-3492, wallstone +366/-433, small-rock +118/-132, ? +106/-96, barbedwire +40/-39, 33 hedgehog records reshaped, ...; was [4458, 4471, 4593] (2026-10-09 the hitbox lane, round 2 on main (fix/hitboxes-r2m): the stones' movement tiers (nested columns), the shells' toe ring, authored cover in each map's own stone (Reservoir's slate crags and greywacke blocks; the Moon's and Mars's breccia, Orchard's limestone and Copper Mesa's conglomerate in block fields; props.coverOutcrops retired): was [4456, 4469, 4595]; 2026-10-08 batch 6 integration (integ/batch6-stage), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: modes-tuning(symmetric deployments: stream-neutral clearings at the deployment slots, 3e8fc4020), map-vehicles(round 5: the seated fleet, carts and set pieces, 273b714a1; hulks and slid carts off the clearings, 35954a692); their merged streams counted together here: 8 handcart records reshaped, 5 tank-wreck records reshaped, truck +2/-3, truckbox +1/-2, 1 wagon record reshaped, 1 sedan record reshaped, ...; was [4458, 4471, 4595] (2026-10-08 symmetric deployments over batch 5 (modes lane: 590f51aaf merged into feature/modes-tuning and recaptured in Node with sim/deployment.ts's clearings: both sides' first 14 deployment slots, the scatter left out after its draws — trees 26 m, destructibles 20 m + r, boulders 16 m, rock-field formations 22 m + reach): near the slots 303 tree, 2 small-rock, 1 record; nothing farther moved (the trees' and props' record indices renumber past the left-out records); was [4764, 4777, 4898] (2026-10-08 batch 5 integration (integ/batch5-stage), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: hitboxes(colliders from meshes, ada699c21), maps-orchard(round 4, 6736df11a [4697, 4663, 4902] on the batch-4 stage; its merge f77f0b591 carried the stage shard); their merged streams counted together here: tree +3807/-3819, wallstone +433/-430, small-rock +134/-128, 39 barbedwire records reshaped, 33 hedgehog records reshaped, ? +27/-31, ...; was [4767, 4772, 4911] (2026-10-08 the hitbox lane: the props' shell slabs (sandbag stacks, tank wrecks, hedgehog beams, pylon legs), formations' own outlines from 0.35 m, cover outcrops (reservoir, moon), convex outlines, the rise read over the rendered ground: was [4766, 4732, 4911]; 2026-10-07 the hitbox lane: every stone's colliders from its own mesh (rockCollision.ts; stones under 0.45 m driven over, taller ones given one): was [4706, 4672, 4911]; 2026-10-07 batch 4 (after the push): the landmarks lane's Ottoman fountain on the square's setts (d7082351f), vetoing its ground in the finished village, recaptured on the merged tree: +1 obstacle, +7 colliders, -1 concealment, exactly as on the branch; was [4705, 4665, 4912] (2026-10-07 batch 4 (after the push): Orchard Valley rounds 1-3 (fe04aef5b: the Chouf kit, the contour terraces with their olive rows, the land-use row dropped, no well, camps or tents), recaptured on the merged tree: every structure and dressing kind moves as on the branch (+5 structures, +216 dry-stone wall stones, +6 gates, -139 wattle and -38 picket fence modules, ...); the trees +290 (3529 -> 3819) where the branch's own move is +4 (the Chouf's cedar, Aleppo pine and olive row under the merged trees lane's rules); was [4423, 4201, 4626] (2026-10-06 batch 4 integration (integ/batch4-20261006), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: scenery-b15(field-stacks), trees-longleaf(closed-woods,round5); their merged streams counted together here; was [3705, 3471, 3963] (2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 5 of 6 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (1 left out); 28 of 31 that passed through a boulder placed before them pushed clear (3 left out), 4 fewer solid; was [3709, 3475, 3963] (2026-10-03 the map-borders lane, waves 3-4 (the exits' portal tails held to the land, the rim trees by wave 3's hedged field system): was [3717, 3483, 3963]; 2026-10-03 trees round 2b on maps lane B's merge (4b20975bb): woodlots, hedge seats, open groves and the arid border over the rebuilt layouts; was [3717, 3483, 3922] (2026-10-03 merged: maps lane B (6f787d2d0) over PR head 14c43cca5 (the ground lane's land use and the regional kits under lane B's layout) [3712, 3478, 3917]; 2026-10-03 Orchard Valley layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [3714, 3482, 3941]; was [4923, 4691, 5160])))))))))
  longleaf: [2772, 2799, 2285], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [2772, 2607, 2285]
  mangrove: [5592, 5569, 6579], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [5630, 5607, 6579]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [5630, 5433, 6579]
  saltwind: [8493, 8664, 4095], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [8493, 8471, 4095]
  reservoir: [6387, 6574, 7024], // integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [6387, 6373, 7024]
  mars: [963, 973, 0], // 2026-10-17 item/maps-olympus-227 (the Olympus kit from item/looks-mars 15d808388, recaptured in Node): the plan's gantries as the regolith works and its container rows as cargo modules banked in sintered regolith, six fewer colliders: was [963, 979, 0]; integ/226 v4 recapture at the world cutoff (09:00, 6da6efefd): the r2 sweep, hutKit, triage and ledger heads: was [963, 978, 0]; integ/226 v2 recapture on 836e15baa (DST-04 crater sites and sections, PH.15 dry-stone spans, DST-03 rubble/huts/wall shells, set-piece parity, the props and maps rounds): was [822, 837, 0]; (integ/225 merge: both sides moved it; ours [822, 829, 0] + theirs [822, 837, 0] - base [822, 829, 0]) props #3 industrial yard (lane B 2026-10-14): was [822, 829, 0]; 2026-10-13 the looks lane's bunkers (item/looks-bunkers: fortifications-r1-m213 43d8977a8 and bunker-dense-cover 936b456cd on main fd437ea9e), recaptured in Node: each pillbox's earthwork its own static collision (an earthwork obstacle and collider each): was [820, 827, 0]; 2026-10-11 the map-revival lane's 219 landing on 217's merged tree (Caldera rounds 3-5, the Moon and Mars round 2, Longleaf round 4): was [861, 868, 0] (2026-10-09 the hitbox lane, round 2 on main (fix/hitboxes-r2m): the stones' movement tiers (nested columns), the shells' toe ring, authored cover in each map's own stone (Reservoir's slate crags and greywacke blocks; the Moon's and Mars's breccia, Orchard's limestone and Copper Mesa's conglomerate in block fields; props.coverOutcrops retired): was [857, 864, 0]; 2026-10-08 symmetric deployments over batch 5 (modes lane: 590f51aaf merged into feature/modes-tuning and recaptured in Node with sim/deployment.ts's clearings: both sides' first 14 deployment slots, the scatter left out after its draws — trees 26 m, destructibles 20 m + r, boulders 16 m, rock-field formations 22 m + reach): near the slots 8 record, 5 small-rock, 1 transformer; nothing farther moved (the trees' and props' record indices renumber past the left-out records); was [871, 878, 0] (2026-10-08 the hitbox lane: the props' shell slabs (sandbag stacks, tank wrecks, hedgehog beams, pylon legs), formations' own outlines from 0.35 m, cover outcrops (reservoir, moon), convex outlines, the rise read over the rendered ground: was [873, 853, 0]; 2026-10-07 the hitbox lane: every stone's colliders from its own mesh (rockCollision.ts; stones under 0.45 m driven over, taller ones given one): was [725, 705, 0]; 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 49 of 49 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 112 of 126 that passed through a boulder placed before them pushed clear (14 left out), 12 fewer solid; was [737, 717, 0] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [768, 714, 0]; 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [765, 711, 0]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [769, 715, 0]))); and 2026-10-13 the looks lane's bunkers (item/looks-bunkers: fortifications-r1-m213 43d8977a8 and bunker-dense-cover 936b456cd on main fd437ea9e), recaptured in Node: each pillbox's earthwork its own static collision (an earthwork obstacle and collider each): was [820, 827, 0]; 2026-10-11 the map-revival lane's 219 landing on 217's merged tree (Caldera rounds 3-5, the Moon and Mars round 2, Longleaf round 4): was [861, 868, 0] (2026-10-09 the hitbox lane, round 2 on main (fix/hitboxes-r2m): the stones' movement tiers (nested columns), the shells' toe ring, authored cover in each map's own stone (Reservoir's slate crags and greywacke blocks; the Moon's and Mars's breccia, Orchard's limestone and Copper Mesa's conglomerate in block fields; props.coverOutcrops retired): was [857, 864, 0]; 2026-10-08 symmetric deployments over batch 5 (modes lane: 590f51aaf merged into feature/modes-tuning and recaptured in Node with sim/deployment.ts's clearings: both sides' first 14 deployment slots, the scatter left out after its draws — trees 26 m, destructibles 20 m + r, boulders 16 m, rock-field formations 22 m + reach): near the slots 8 record, 5 small-rock, 1 transformer; nothing farther moved (the trees' and props' record indices renumber past the left-out records); was [871, 878, 0] (2026-10-08 the hitbox lane: the props' shell slabs (sandbag stacks, tank wrecks, hedgehog beams, pylon legs), formations' own outlines from 0.35 m, cover outcrops (reservoir, moon), convex outlines, the rise read over the rendered ground: was [873, 853, 0]; 2026-10-07 the hitbox lane: every stone's colliders from its own mesh (rockCollision.ts; stones under 0.45 m driven over, taller ones given one): was [725, 705, 0]; 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 49 of 49 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 112 of 126 that passed through a boulder placed before them pushed clear (14 left out), 12 fewer solid; was [737, 717, 0] (2026-10-04 merged: maps lane A batch 4 (85a62773f) over PR head dc2c992a7 (trees round 2, the floating-tank fix, Monsoon's far country) [768, 714, 0]; 2026-10-03 the map-borders lane (wave 2, the roads authored on the landform's rim and the railways' open line; first pass [765, 711, 0]): rim trees past the playable edge stand by the border woods, outer props on its cleared ground; was [769, 715, 0])))
  moon: [840, 1168, 0], // integ/228 recapture 1 (MAPS Earthrise 228 rebuild 8018118a90 over seats; base + assault-trenches in Node): was [755, 654, 0]; integ/226 v2 recapture on 836e15baa (DST-04 crater sites and sections, PH.15 dry-stone spans, DST-03 rubble/huts/wall shells, set-piece parity, the props and maps rounds): was [646, 545, 0]; (integ/225 merge: both sides moved it; ours [646, 543, 0] + theirs [646, 545, 0] - base [646, 543, 0]) 2026-10-14 Lane C, item 7 on main (item/propsC-setpiece-break): the two intact lunar rovers are destructible set pieces with a shell collider each (+2 colliders; recaptured in Node, base and assault-trenches); was [646, 543, 0] (2026-10-13 the looks lane's bunkers (item/looks-bunkers: fortifications-r1-m213 43d8977a8 and bunker-dense-cover 936b456cd on main fd437ea9e), recaptured in Node: each pillbox's earthwork its own static collision (an earthwork obstacle and collider each): was [644, 541, 0]; 2026-10-11 the map-revival lane's 219 landing on 217's merged tree (Caldera rounds 3-5, the Moon and Mars round 2, Longleaf round 4): was [688, 585, 0] (2026-10-09 the hitbox lane, round 2 on main (fix/hitboxes-r2m): the stones' movement tiers (nested columns), the shells' toe ring, authored cover in each map's own stone (Reservoir's slate crags and greywacke blocks; the Moon's and Mars's breccia, Orchard's limestone and Copper Mesa's conglomerate in block fields; props.coverOutcrops retired): was [705, 602, 0]; 2026-10-08 batch 6 integration (integ/batch6-stage), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: modes-tuning(symmetric deployments: stream-neutral clearings at the deployment slots, 3e8fc4020), map-vehicles(round 5: the seated fleet, carts and set pieces, 273b714a1; hulks and slid carts off the clearings, 35954a692); their merged streams counted together here: tank-wreck +0/-3, 1 handcart record reshaped, set-piece-lrv +2/-0; was [706, 605, 0] (2026-10-08 symmetric deployments over batch 5 (modes lane: 590f51aaf merged into feature/modes-tuning and recaptured in Node with sim/deployment.ts's clearings: both sides' first 14 deployment slots, the scatter left out after its draws — trees 26 m, destructibles 20 m + r, boulders 16 m, rock-field formations 22 m + reach): near the slots 6 small-rock; nothing farther moved (the trees' and props' record indices renumber past the left-out records); was [712, 611, 0] (2026-10-08 the hitbox lane: the props' shell slabs (sandbag stacks, tank wrecks, hedgehog beams, pylon legs), formations' own outlines from 0.35 m, cover outcrops (reservoir, moon), convex outlines, the rise read over the rendered ground: was [694, 532, 0]; 2026-10-07 the hitbox lane: every stone's colliders from its own mesh (rockCollision.ts; stones under 0.45 m driven over, taller ones given one): was [572, 410, 0]; 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 13 of 13 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 79 of 86 that passed through a boulder placed before them pushed clear (7 left out), 7 fewer solid; was [579, 417, 0] (2026-10-03 Earthrise Basin (with its middle-lane craters) layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [474, 380, 0]; was [475, 381, 0]))))); and 2026-10-13 the looks lane's bunkers (item/looks-bunkers: fortifications-r1-m213 43d8977a8 and bunker-dense-cover 936b456cd on main fd437ea9e), recaptured in Node: each pillbox's earthwork its own static collision (an earthwork obstacle and collider each): was [644, 541, 0]; 2026-10-11 the map-revival lane's 219 landing on 217's merged tree (Caldera rounds 3-5, the Moon and Mars round 2, Longleaf round 4): was [688, 585, 0] (2026-10-09 the hitbox lane, round 2 on main (fix/hitboxes-r2m): the stones' movement tiers (nested columns), the shells' toe ring, authored cover in each map's own stone (Reservoir's slate crags and greywacke blocks; the Moon's and Mars's breccia, Orchard's limestone and Copper Mesa's conglomerate in block fields; props.coverOutcrops retired): was [705, 602, 0]; 2026-10-08 batch 6 integration (integ/batch6-stage), the merged tree recaptured in Node: the lanes that re-pinned it on their branches: modes-tuning(symmetric deployments: stream-neutral clearings at the deployment slots, 3e8fc4020), map-vehicles(round 5: the seated fleet, carts and set pieces, 273b714a1; hulks and slid carts off the clearings, 35954a692); their merged streams counted together here: tank-wreck +0/-3, 1 handcart record reshaped, set-piece-lrv +2/-0; was [706, 605, 0] (2026-10-08 symmetric deployments over batch 5 (modes lane: 590f51aaf merged into feature/modes-tuning and recaptured in Node with sim/deployment.ts's clearings: both sides' first 14 deployment slots, the scatter left out after its draws — trees 26 m, destructibles 20 m + r, boulders 16 m, rock-field formations 22 m + reach): near the slots 6 small-rock; nothing farther moved (the trees' and props' record indices renumber past the left-out records); was [712, 611, 0] (2026-10-08 the hitbox lane: the props' shell slabs (sandbag stacks, tank wrecks, hedgehog beams, pylon legs), formations' own outlines from 0.35 m, cover outcrops (reservoir, moon), convex outlines, the rise read over the rendered ground: was [694, 532, 0]; 2026-10-07 the hitbox lane: every stone's colliders from its own mesh (rockCollision.ts; stones under 0.45 m driven over, taller ones given one): was [572, 410, 0]; 2026-10-04 the talus law, every map's default (landformGeology.ts restsOnTalus, 35 degrees), and the no-overlap law, both re-siting (the mountains lane after gauntlet waves 48 and 52): 13 of 13 boulders that hung on a wall, a ledge's lip or a narrow bench slid down the fall line to rest at the foot (0 left out); 79 of 86 that passed through a boulder placed before them pushed clear (7 left out), 7 fewer solid; was [579, 417, 0] (2026-10-03 Earthrise Basin (with its middle-lane craters) layout pass (docs/MAP-LAYOUT-BRIEF.md), on the map-borders lane's second pass [474, 380, 0]; was [475, 381, 0]))))
  cliffbridge: [6668, 7764, 5359], // integ/227 recapture 8 (MAPS fleet dressing 49d4122ee: fencesClearBuildings/fenceStubsOut, over fence v2, seats and r3): was [6677, 7773, 5359]; integ/227 (LOOKS fence records 555994745: every timber fence module a collider, its band the drawn silhouette; obstacles unchanged): was [6677, 7565, 5359]
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
/** A convex outline's least width (the smallest projection over its edge normals). */
function narrowPart(points) {
  let least = Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length, ex = points[j] - points[i], ez = points[j + 1] - points[i + 1], len = Math.hypot(ex, ez);
    if (len < 1e-9) continue;
    const nx = -ez / len, nz = ex / len;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < points.length; k += 2) { const p = points[k] * nx + points[k + 1] * nz; lo = Math.min(lo, p); hi = Math.max(hi, p); }
    least = Math.min(least, hi - lo);
  }
  return least < 0.6;
}
const stats = dedicatedCollisionManifestStats();
assert.deepEqual(Object.keys(expected), MAP_IDS, 'every registered map has a fixed census expectation');
assert.deepEqual(Object.keys(stats), MAP_IDS, 'manifest order and map registry stay in lockstep');
const shardFiles = readdirSync(new URL('./world-collision-manifests/', import.meta.url))
  .filter((file) => file.endsWith('.json') && file !== 'index.json').sort();
assert.deepEqual(shardFiles.filter((file) => !file.includes('@')),
  MAP_IDS.map((id) => `${id}.json`).sort(), 'exactly one collision shard exists for every canonical map');
// and one per map for each mode's battlefield variant (Frontline's trenches; frontlineVariant.selftest)
assert.deepEqual(shardFiles.filter((file) => file.includes('@')),
  TERRAIN_VARIANTS.flatMap((variant) => MAP_IDS.map((id) => `${id}@${variant}.json`)).sort(),
  'exactly one variant shard exists for every canonical map and variant');
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
  // (2026-10-07, the hitbox lane: a beam is its own slabs, each a narrow section leaning with the steel, src/world/slabCollision.ts)
  const narrowBeam = (record) => record.shape2?.kind === 'obb'
    || (record.shape2?.kind === 'convex' && narrowPart(record.shape2.points))
    || (record.shape2?.kind === 'compound' && record.shape2.parts.every((part) => part.kind === 'convex' && narrowPart(part.points)));
  assert.ok(hedgehogObstacles.every(narrowBeam),
    `${mapId} dedicated movement preserves narrow hedgehog beam shapes`);
  assert.ok(hedgehogColliders.every(narrowBeam),
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

// the Longleaf fleet's flatbed: the solid its movement and shell copies are both cut from (assertLoggingYard)
const longleafFlatbed = civilianVehicleOverrides('longleaf', false).truckflatbed;
const longleafFlatbedSlabs = localShellSlabs(longleafFlatbed.collisionSolid());

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
  // (-149.2308, -173.9215) and (-80.6038, 239.7031). 2026-10-05 (the map-revival lane, Longleaf round 2): the same two
  // donors at the same heights and origins, with 121 props fewer before them — the fieldstone wall runs and the
  // outcrops gone, the scattered rocks 30 (was propIdx 307 / 308).
  const donors = [{ propIdx: 186, height: 2.0045, old: [-149.2563437955792, -173.84073125534042] },
    { propIdx: 187, height: 1.9812, old: [-80.53000567837782, 239.67939683819532] }];
  assert.deepEqual(flatbeds.map(record => record.propIdx), donors.map(record => record.propIdx));
  assert.deepEqual(colliders.map(record => record.propIdx), donors.map(record => record.propIdx));
  const sites = getMapConfig('longleaf').props.loggingYard.flatbeds;
  assert.equal(sites.length, 2, 'both existing flatbeds have explicit loading bays');
  for (const [index, obstacle] of flatbeds.entries()) {
    const { x, z } = sites[index], donor = donors[index], collider = colliders[index];
    assert.equal(obstacle.shape2?.kind, 'compound', 'final ground-bearing flatbed refit survives capture');
    assert.equal(obstacle.shape2.parts.length, 21, 'all the flatbed\'s ground-bearing parts survive the relocation');
    assert.ok(Math.hypot(obstacle.shape2.cx - x, obstacle.shape2.cz - z) < 0.3,
      `Longleaf propIdx${donor.propIdx} is missing from its authored loading bay; regenerate its native collision shard`);
    // (physics, 2026-10-16) one solid, two forms: since the hitboxes r3 port (f10b574d7) a heavy truck's shell copy is its
    // solid's slabs (props.ts SLAB_SHELL_KINDS), its movement copy that solid's contact band, both from the kit's
    // tier-independent solid (civilianVehicleKit.ts canonicalSolid: the fleet's flatbed). The two copies share the
    // relocated pose and the identity; the shell copy is exactly the solid's slabs set at the movement copy's pose.
    for (const key of ['kind', 'propIdx', 'crushable', 'crushMin', 'crushKeep']) {
      assert.equal(collider[key], obstacle[key], `movement and shell copies share their identity (${key})`);
    }
    {
      // (the donor's scale and seat from the movement copy's own parts: the band's tops scaled, its foot on the seat; its
      // bounds keep the table's height, pinned below)
      const band = longleafFlatbed.contactBand, top = (parts) => Math.max(...parts.map((part) => part.y1));
      const foot = (parts) => Math.min(...parts.map((part) => part.y0));
      const scale = (top(obstacle.shape2.parts) - foot(obstacle.shape2.parts)) / (top(band.parts) - foot(band.parts));
      const seat = foot(obstacle.shape2.parts) - foot(band.parts) * scale;
      const expected = { min: [0, 0, 0], max: [0, 0, 0] };
      placeLocalShellSlabs(expected, longleafFlatbedSlabs, x, seat, z, sites[index].yaw, scale);
      assert.equal(collider.shape2.parts.length, expected.shape2.parts.length, 'the shell copy is the solid\'s slabs');
      collider.shape2.parts.forEach((part, k) => {
        const want = expected.shape2.parts[k];
        assert.ok(Math.abs(part.y0 - want.y0) <= 0.0101 && Math.abs(part.y1 - want.y1) <= 0.0101
          && part.points.length === want.points.length && part.points.every((v, i) => Math.abs(v - want.points[i]) <= 0.0101),
        `the shell copy's slab ${k} is the movement copy's solid's, at its relocated pose`);
      });
    }
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
    // (destruction stream, 2026-10-13) a pile is crushable clutter now: a hull flattens it and a round breaks it as it
    // flies through (sim/shellLightCover.ts), as the loose rocks are
    assert.equal(shellPassesThroughCollisionRecord(collider), true, 'a round breaks the pile it flies through');
    assert.ok(obstacle.crushable && collider.crushable && Number.isInteger(obstacle.propIdx), 'the pile is crushable clutter');
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
