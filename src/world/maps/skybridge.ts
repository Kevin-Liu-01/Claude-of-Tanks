// src/world/maps/skybridge.ts — Skybridge Chasm, redesigned 2026-10-03 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The drowned gorge and its lakes, the five roads, the control district (standing exactly as PR #9's head seated it:
// props.ts townPlan), the bridge, the palette, sky, name and id are the map's identity and stay; the canyon's ground
// is new. The old floor was a seed-random mesa field (shelves wherever the noise crossed its threshold) over two 770 m
// ridges laid end to end across the middle. Its sightlines closed to a 76 m median (1.7 % at 300 m or more), six
// structures stood in the carriageways, the deployments stood 863 m apart (alpha's block in the south-west corner,
// bravo's seven pads spread 494 m along the north edge), and the zone-control discs stood up to 3.1 times farther from
// one team; bots drove off the shelves (twelve standard matches: 26 damaging falls, 2177 hp in all, the worst 489 hp).
//
// Reference: Glen Canyon above Lake Powell: a canyon drowned by its reservoir, bedded sandstone walls standing in
// segments between the side canyons that break them, talus under every wall, and a high crossing at the narrows.
//
// The story on the ground: the gorge runs north to south between rock shoulders, bedded sandstone walls 18 m high in
// three segments a side, broken where the cross roads pass so the floor splits into a west lane, the gorge and an east
// lane. Every segment ends in a nose (its wall and talus turning round the end, so no taper ramps onto a cap and no
// apron stops in a cut) and stands whole through the deployment corridors and the district's feather. The drowned
// gorge's basin holds the lakes below the control district. The layout turns about (5, 60), the middle of the shoulder
// system: the teams come in from the gorge's two ends, each in a 4 x 2 block between the end segments and behind a gate
// butte that screens it down the gorge's axis, and each block, its segments, its butte and its strongpoints are the
// other's rotation there. The zone-control discs stand on the line of equal driven distance: the west lane's yard, the
// gorge's west shore (also the turbo-ball kickoff) and the east lane's yard.
//
// The control district (the map-revival lane, 2026-10-05): the Bureau of Reclamation's works at Glen Canyon Dam and
// its town, Page, built where the town plan seats them in the glencanyon kit (maps/regional/glencanyon.ts). The
// powerhouse of board-formed concrete with its penstocks coming down from the anchor block and the catwalk truss broken
// between them (the broken high crossing); the control building, the surge tower, the switchyard's lattice dead-end
// towers and the transformer yards; the microwave relay tower; the gate-hoist houses and the penstock runs on their
// saddles; the visitor centre with its overlook, or the town's school; the field offices and steel warehouses; and
// Page's ranch houses under shingled gables with their carports, its fire station and its water tower.
//
// Lake Powell's arm and Glen Canyon Dam (the map-revival lane, 2026-10-06, Skybridge round 4; gauntlet waves 170-171:
// "the landform must be inverted into a deep, sheer-walled canyon arm holding the water against a curved dam, with the
// township and works on the slickrock rim above"; "the reservoir reads as a pit lake or shallow milky trench in a flat
// sand plain"). The district stands on the slickrock at the plain's level. Below it a canyon arm 68 m wide is cut 22 m
// into the rock, with sheer walls straight into the water from a rounded head under the district's south to a square
// end at the road across the north (road 5). The water lies wall to wall: the lake's discs are round and pulled 3 m into
// the walls, so no dry ground lies under the waterline anywhere. The dam stands on that road (reservoirDam.ts): an arch
// convex to the reservoir, its intakes and gantry over the water, its battered downstream face dropping 28 m into a
// tailwater pocket that holds the powerhouse at its toe. Bots route round all water ('avoid-liquid'). Nothing can reach
// a floor: the walls give no way down, and parapets and a kerb guard the road over the dam and the pocket's rim. The
// ring's own dam and its canyon (round 2) are retired, so the map has one dam, in reach.

import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import type { ReservoirDamSite } from './reservoirDam.ts';
import { SKYBRIDGE_ARM } from './skybridgeArm.generated.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './townPlans.generated.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The five roads (their junction nodes below, in the terrain's `roads`). */
const ROAD_PATHS: Array<Array<[number, number]>> = [
  [[-430, -450], [-350, -314], [-278, -172], [-239.23, -93.35], [-208, -30], [-132, 118], [-73.9, 235.78], [-58, 268], [-35.25, 319.61], [24, 454]],
  [[-116, -458], [-72, -318], [-18, -178], [24.53, -81.61], [42, -42], [116, 92], [198, 230], [198.48, 230.63], [292, 354], [380, 456]],
  [[356, -454], [294, -310], [236, -166], [205.36, -99.16], [170, -22], [92, 116], [42.72, 204.19], [16, 252], [-35.25, 319.61], [-78, 376], [-164, 466]],
  [[-382, -126], [-246, -92], [-239.23, -93.35], [-116, -118], [18, -80], [24.53, -81.61], [148, -112], [205.36, -99.16], [282, -82], [394, -104]],
  [[-326, 252], [-204, 210], [-82, 238], [-73.9, 235.78], [42, 204], [42.72, 204.19], [168, 238], [198.48, 230.63], [292, 208]],
];

/** (round 6) the brow's fallen blocks keep off the roads: the south cross road skirts the head's lip on its fill, and the
 * scenery pass leaves a rock out within 4 m of a road's line and its radius (scenery.ts admission); a block that
 * close is not authored. */
const ROCK_ROAD_CLEAR_M = 4.2;
function clearOfRoads(rock: { x: number; z: number; radius: number }): boolean {
  for (const path of ROAD_PATHS) for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((rock.x - ax) * dx + (rock.z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(rock.x - ax - dx * t, rock.z - az - dz * t) < ROCK_ROAD_CLEAR_M + rock.radius) return false;
  }
  return true;
}

/** The reservoir arm (round 6): its course, side canyons, water, brow boulders, kerbs and the dam's site, computed by
 * skybridgeArm.ts and stored as data (skybridgeArm.generated.ts) so no fitting runs as the map configs load. */
const ARM = SKYBRIDGE_ARM;

/** The dam on road 5 over the arm's end (reservoirDam.ts, laid by the 'dam' dressing kit). */
export const SKYBRIDGE_DAM: ReservoirDamSite = SKYBRIDGE_ARM.dam;

export default {
  id: 'skybridge',
  name: 'Skybridge Chasm',
  blurb: 'A broken high crossing and fortress-scale control works span a deep flooded canyon',
  // (round 4) the canyon's water is a barrier: bots route round it (the walls give no way down to it)
  navigationWaterPolicy: 'avoid-liquid',
  // (round 6) the layout metric's rays read the drowned meander's bed: one that crosses the water finds a hidden stretch
  // at the near rim, although a hull on the far rim stays in view over the open water
  layoutBrief: { bands: {
    sightLongShare: { band: [0.025, 0.15], reason: 'the rays end at the drowned meander\'s near rim, where its bed drops out '
      + 'of sight, though a hull on the far rim stays in view over the water: 0.028 as measured (the PR head\'s straight arm '
      + '0.034), 0.050 with the water\'s cells taken as open (the head 0.045)' },
  } },
  terrain: {
    hillScale: 0.62, microScale: 0.66, rimH: 58, softLakes: true,
    // the authored shoulders replace the noise mesas, and the rock gate reads them (terrain.ts landformRock)
    mesas: null, landformRock: true,
    marshes: [],
    // (round 4: the reservoir's arm and the tailwater pocket, wall to wall; armTerrain above)
    lakes: ARM.lakes,
    // three aprons for the zone-control discs on the line of equal driven distance: the west lane's yard, the gorge's
    // west shore between the lake and the west middle segment (tilted to its ground) and the east lane's yard (tilted
    // to its ground)
    hardstands: [
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): each sited by tools/hardstand-site.mjs on its ground
      // (round 8, gauntlet wave 259, head-bird: "a dark rectangular decal patch") graded sand the wind drifts back over
      // in patches, as Redrock's yards (hardstandSurface.ts paint): paint only, every level, grade and road query the same
      { x: -300, z: 62, width: 56, length: 56, yawDeg: 0, level: -2.9, grade: 0, bankM: 16, paint: { cover: 0.85, mottle: 0.65 } },
      // (round 8: the apron bank law, hardstandBanks.selftest) round 6's meander brought the arm's rim within this apron's
      // 20 m bank, which lifted a ledge below the rim into an 0.76 step at (-96, 9); a 17 m bank ends short of the rim (no
      // walls, the steepest it steepens 0.53 at (-103, 69)) and still seats the zone disc (30 m, 7 m relief)
      { x: -139, z: 49, width: 56, length: 56, yawDeg: -100, level: 0, grade: 0.08, bankM: 17, paint: { cover: 0.85, mottle: 0.65 } },
      { x: 310, z: 42, width: 56, length: 56, yawDeg: -170, level: -1.2, grade: 0.074, bankM: 16, paint: { cover: 0.85, mottle: 0.65 } },
    ],
    village: { x0: -176, x1: 186, z0: -170, z1: 196, cx: 8, cz: 16, feather: 54, flatten: 0.72, relief: 0.28 },
    // each cross road's junctions and the northern fork are nodes both roads share, so the junction blend grades one
    // point there (no step between two bakes)
    roads: { paths: ROAD_PATHS },
    landforms: [
      // The canyon's rock shoulders: bedded sandstone walls (cliff bands, benches, talus; landformGeology.ts) along the
      // west and east, broken where the two cross roads pass, so the floor splits into a west lane, the gorge and an east
      // lane. Every segment ends in a nose: its wall and talus apron turn round the end, so no taper ramps up onto a cap
      // and no apron stops in a cut. The segments are each other's rotation about (5, 60), the middle of the system, so
      // each deployment stands between two 176 m end segments with a 100 m gap 150-250 m ahead of it (the swap test,
      // 2026-10-03: with 300 m south segments the north deployment won 81 of 120 games over three layouts).
      ...[[-215, -238, 176], [-215, 60, 220], [-215, 358, 176], [225, -238, 176], [225, 60, 220], [225, 358, 176]]
        .map(([x, z, length]) => ({ kind: 'ridge', x, z, length, width: 34, height: 18, yawDeg: 90, corridorScale: 1, settlementScale: 1,
          geology: { profile: 'butte' as const, wall: [0.35, 0.6] as const, apron: 0.28, cliffEnd: 'nose' as const,
            strata: { stepM: 4.5, riser: 0.35 },
            outline: 0.25, rough: 0.8, gullies: { count: 3, depthM: 2, width: 0.5 } } })),
      // the gate buttes: one in front of each deployment, each the other's rotation about (5, 60), screening the
      // deployments from each other down the gorge's axis (whole through the deployment corridors: bots drive round them)
      // (round 3, gauntlet wave 133: "a smooth, evenly textured sandcastle-like mound with no cap-rock, ledges or talus":
      // Titan Gorge's accepted butte section over the same footprints and toes — a level cap to a sharp rim at 0.94 of
      // the wall's foot, a near-vertical wall in thick beds down to a concave talus apron with its boulders, shallow
      // flutes — standing 16 -> 24 m, as tall as the wall is wide)
      ...[[10, -220], [0, 340]].map(([x, z]) => ({ kind: 'knoll', x, z, rx: 22, rz: 20, height: 24, corridorScale: 1, settlementScale: 1,
        geology: { profile: 'inselberg' as const, outline: 0.2, foot: 0.55, footVary: 0.08, apron: 0.34, rim: 0.94,
          flutes: { count: 5, depth: 0.12 }, rough: 0.45, boulders: 14, strata: { stepM: 6, riser: 0.2 },
          gullies: { count: 3, depthM: 1.2, width: 0.4 } } })),
      // (round 6, gauntlet wave 259: "a dead-flat plain of noisy shag-carpet texture", "no slickrock domes") the slickrock's
      // petrified dunes: low domes of cross-bedded Navajo sandstone stepped by their beds, in pairs that are each other's
      // rotation about (5, 60) — on the south and north floors in front of the deployments' flanks and out in the west and
      // east lanes — whalebacks 40-90 m long, each 24 m or more from a road, 90 m from a deployment, 20 m from a zone
      // apron and clear of the shoulders (sited by mr3's dome-sites probe); 5-7.5 m high, drivable over their stepped
      // flanks
      ...([[-130, -230, 30, 5.5, 20], [420, -250, 44, 7, 70], [-410, -220, 44, 6.5, 140], [410, -160, 32, 5, 200],
        [330, -210, 38, 6.5, 250], [-410, 50, 42, 7.5, 310]] as const).flatMap(([x, z, r, height, yaw]) => [[x, z, yaw], [10 - x, 120 - z, yaw + 180]]
        .map(([px, pz, yawDeg]) => ({ kind: 'knoll' as const, x: px, z: pz, rx: r, rz: Math.round(r * 0.65), height, yawDeg,
          geology: { profile: 'dome' as const, outline: 0.22, strata: { stepM: 2.2, riser: 0.8 }, rough: 0.4 } }))),
      // (round 4, gauntlet waves 170-171: the basin under the lakes and the round-2 trough round them go — the reservoir
      // is the canyon arm, its dam and the tailwater pocket; armTerrain above)
      ...ARM.landforms,
    ],
  },
  spawns: {
    // The teams come in from opposite ends of the gorge: bravo's seven pads on the northern floor and alpha's 4 x 2 block
    // as their rotation about (5, 60) on the southern floor, 721 m apart (the swap test, 2026-10-03: alpha's south-west
    // corner block lost 27 of 40 games to bravo's northern block, the deployments exchanged or not; the pacing receipt:
    // at 677 m a 2v2 ended in 102 s).
    player: { x: 10.6, z: -296.3 },
    enemies: [{ x: 11.4, z: 416.3 }, { x: 3.4, z: 416.3 }, { x: -4.6, z: 416.3 }, { x: -12.6, z: 416.3 }, { x: 11.4, z: 426.3 }, { x: 3.4, z: 426.3 }, { x: -4.6, z: 426.3 }],
  },
  splat: {
    // round 47 (2026-09-23, owner: "ground patterns are too black"): lightness FLOORS like every sibling canyon map
    // (Titan 0.19/0.24, Redrock 0.19/0.24, Mars 0.20/0.24) — `l * 0.52` with no floor let the procedural fallback
    // bottom out at black; hue and saturation unchanged. These tone hooks shape the procedural layers only; the
    // rendered albedo is the sourced 'skybridge' row in sourcedTextures.ts.
    grassTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.40), clamp01(0.21 + l * 0.62)],
    dirtTone: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.42), clamp01(0.24 + l * 0.48)],
    sandstone: true,
    // (round 3, gauntlet wave 133: "a smooth, evenly coloured pinkish wall": Navajo sandstone is red-orange, its beds
    // light and dark — the rock a shade more orange, half again as saturated, its beds in twice the tonal range)
    rockTone: (h: number, s: number, l: number) => [0.05, clamp01(s * 0.85 + 0.08), clamp01(0.36 + (l - 0.5) * 0.9)],
    // round 47 (2026-09-23, owner: "ground patterns are too black"): without this the sourced-texture resolver fell
    // through to Verdant — photo grass/dirt and raw near-black Rock058 in place of the sandstone strata above
    sourcedPalette: 'skybridge',
    mudTone: (h: number, s: number, l: number) => [0.54, clamp01(s * 0.72), clamp01(l * 0.58)],
    // The drowned gorge is navigable liquid, not a blue-grey terrain stain.
    // It shares the terrain material and interaction mask, so this adds no
    // water mesh or draw pass while tracks receive the common wake/spray path.
    seaLake: true, seaFoam: 0.10, seaRamp: [0.18, 0.54], iceDrift: 0.02,
    marshGloss: 0.90, iceSky: [0.18, 0.30, 0.38],
    // round 47: tintB was the darkest macro darkener in the game (0.61/0.40/0.34, luma ×0.46 inside the dark-clover
    // patches) — same red-orange hue (12°), every channel ≥ 0.75 (luma ×0.81), the desert register (0.84/0.78/0.67)
    tintA: [1.02, 0.67, 0.49], tintB: [0.88, 0.78, 0.75], tintC: [1.00, 0.69, 0.49],
    // (round 3: the strata bands stay 0.18 — the gate buttes now stand in Titan's round section, whose 0.22 beds read
    // as "wood grain" and "sawtooth stripes" wrapped round a stump in wave 134; the walls' bedding comes from the rock's
    // wider tonal range above)
    roadTint: [0.61, 0.53, 0.47], strata: 0.18, sandMacro: 0.62,
    // (round 8, gauntlet wave 259, head-bird: "a dead-flat plain of noisy shag-carpet texture"): the floor's dark blotches
    // were the mid-relief dapple — its 59 m octave lays 1-5 m bump spots that the canyon's low sun turns into a field of
    // dark spots (the Redrock lane's finding on its own floor, 2026-10-07: uMidRelief 0 cleared it, uSandMacro 0 did
    // not). A trace of its broad roll stays (Redrock's 0.12); the sand's ripples, the macro sheets and the slickrock
    // domes carry the floor's character.
    rippleAmp: 0.14, midRelief: 0.12, midReliefFar: 840,
  },
  vegetation: {
    // (round 3, gauntlet wave 133: "uniform orange dune sand dotted with lush green trees": Glen Canyon's trees are the
    // juniper and the pinyon (treeBiomes.ts: cedar and pine take their forms); the cottonwoods were four in ten and the
    // scrub was theirs — now a few, and the scrub the junipers')
    // (round 6, gauntlet wave 259: "dense clumps of lush green broadleaf trees on both sides ... a single tree sprouting
    // from the summit of the banded butte ... a temperate park instead of Glen Canyon's bare slickrock desert") the
    // plateau's cover thinned to its own: juniper and pinyon in open, scattered stands and alone, the scrub between
    // them; hardly a tree on a rim or a cap. The cottonwoods stand only by the water or in the low ground (treeBiomes.ts
    // riparian): the meander's walls leave no gentle ground at its waterline, so of the lone trees' draws (six in a
    // hundred) the six that stand are in the low ground east of the dam
    species: ['pine', 'poplar', 'cedar'], clusterMix: [['cedar', 0.58], ['pine', 0.40], ['poplar', 0.02]],
    loneMix: [['cedar', 0.576], ['pine', 0.364], ['poplar', 0.06]], rimMix: [['pine', 0.5], ['cedar', 0.5]],
    clusterCount: 12, loneCount: 36, rimCount: 8, grassDensity: 0.22,
    clusterScrub: 1.0, bushCount: 0.7, bushSpecies: 'cedar',
    // (Skybridge round 2, the map-revival lane: Glen Canyon's bunchgrass is cured straw on the slickrock's sand, as Titan
    // Gorge's; the default tufts were the meadow's green)
    grassTexTone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.5), clamp01(l * 0.95 + 0.10)],
    tuftTone: (h: number, s: number, l: number) => [0.10, 0.24, clamp01(l * 0.70 + 0.12)],
  },
  props: {
    // the map-revival lane (2026-10-05): Glen Canyon Dam and Page, Arizona (maps/regional/glencanyon.ts)
    architecture: 'glencanyon',
    plan: [
      'arcology', 'factory', 'gantry', 'parkingdeck', 'ruin', 'foundryoffice',
      'warehouse', 'needletower', 'containerRow', 'depot', 'ruin', 'civichall',
      'broadcasttower', 'watertower', 'firestation', 'parkingdeck', 'gantry', 'ruin',
      'foundryoffice', 'warehouse', 'terracetower', 'depot', 'containerRow', 'ruin',
      'civichall', 'factory', 'parkingdeck', 'megatower', 'gantry', 'ruin',
    ],
    destructibleBuildings: [
      'motorpool', 'quonsethut', 'transformershed', 'guardpost',
      'securityoffice', 'servicegarage', 'relaystation',
    ],
    // the strongpoints stand in pairs that are each other's rotation about (5, 60), 60 m or more from Verdant's old
    // strongpoint sites (which the brief keeps clear): the western abutment in the south-west lane and the eastern
    // control yard in the north-east, the spillway scout post below the district and the northern relay post above it
    tacticalBeats: [
      { id: 'western-abutment', role: 'brawl', x: -266, z: -20, yawDeg: -4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 13, scaleMax: 4.0 }, wreck: true, wreckOffsetZ: -18 },
      { id: 'spillway-scout-post', role: 'scout', x: -100, z: -200, yawDeg: 18,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 2.9 } },
      { id: 'northern-relay-post', role: 'scout', x: 110, z: 320, yawDeg: 198,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 2.9 } },
      { id: 'eastern-control-yard', role: 'support', x: 276, z: 140, yawDeg: 176,
        structure: 'transformershed', redoubt: true, outcrop: { count: 7, radius: 11, scaleMax: 3.5 }, wreck: true, wreckOffsetX: 18 },
    ],
    // (round 3, gauntlet wave 133: "a fan of parallel rail lines running straight down into" the reservoir, "orphan rail
    // segments describing nothing in 1960s Page": Page never had a railway — the yard's lines, coal heaps and stores go)
    // (round 4: the dam on road 5 over the arm's end, reservoirDam.ts by mapKits.ts dressMapExtras)
    blockFill: true, extraKits: ['dam'], wallStyle: 'fieldstone', wallStoneChance: 0.82,
    // the control district's blocks keep their footprints off every carriageway
    // the control district stands as PR #9's head seated it (the owner's town-plan ruling, 2026-10-03); a building of it
    // that stands in a carriageway moves by the least distance that clears it
    townPlan: TOWN_PLANS.skybridge,
    // (round 6) the arm's meander and its side canyons run through the seated district: a planned building the water
    // reaches is packed to dry ground, a light building there is left out (props.ts settlementOverWater)
    settlementOverWater: true,
    townLightPlan: TOWN_LIGHT_PLANS.skybridge,
    roadBuildingClearance: true,
    // the kit owns the renders' tones; the field walls keep the city preset's stone
    tones: { stone: makeRealisticCityBuildingTones({ value: 0.92, saturation: 1.06, soot: 0.015, roofValue: 0.90 }).stone },
    buildingLat: [13, 7], sideSkip: 0.07, spacingPad: 3.5, maxSpread: 4.2,
    wallRuns: [
      [-312, -148, -214, -112, 2], [-306, 138, -208, 174, 3],
      [208, -146, 308, -110, 3], [206, 140, 306, 176, 2],
      [-150, 258, -46, 290, 3], [64, -286, 168, -252, 2],
      [-338, 44, -294, 98, 1], [300, -82, 344, -26, 4],
    ],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: true,
    rocks: 286, outcrops: 78, craters: 88, rubblePiles: 58,
    hedgehogs: 30, sandbagLines: 28,
    tankWrecks: { era: 'modern', count: 8, debris: true,
      ids: ['k2', 'type10', 'type90', 'k1a1', 'm2a2_bradley', 'pl01', 'leclerc_xlr', 'm1a2_sepv3'] },
    inhabit: {
      stalls: 0, benches: 2, coreClutter: 32, drums: 18,
      trucks: 10, jeeps: 7, drumClusters: 10, camps: 4, modernClutter: 36,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  // (round 5, gauntlet wave 207 and the coordinator: round 4's arm walls "flat vertical planes" under a soft brow) the
  // arm's walls in relief — buttresses between the seeps' alcoves, the rain's flutes, the cross-beds, the varnish's
  // curtains from the brow and the bathtub ring at the water (canyonWall.ts) — and the hard bed of the slickrock along
  // both brows, its lip over the void (caprockRim.ts, trench). (round 6) Both follow the meander and its side canyons'
  // curves (their `path`s); the carved landforms are the rock
  scenery: {
    rocks: ARM.rocks.filter(clearOfRoads),
    canyonWalls: [
      { x: ARM.arm.centre[0], z: ARM.arm.centre[1], length: ARM.arm.length, width: ARM.arm.endHalf * 1.6, yawDeg: 0, path: ARM.arm.path,
        waterLevel: ARM.arm.waterLevel, span: 0.82, name: "Lake Powell's arm, its walls" },
      ...ARM.sides.map((c, i) => ({ x: c.centre[0], z: c.centre[1], length: 1, width: c.half * 1.6, yawDeg: 0,
        path: c.path, waterLevel: ARM.arm.waterLevel, span: 0.6, name: `the arm's side canyon ${i + 1}, its walls` })),
    ],
    caprock: [
      { x: ARM.arm.centre[0], z: ARM.arm.centre[1], length: ARM.arm.length, width: ARM.arm.endHalf * 1.6, yawDeg: 0, path: ARM.arm.path,
        trench: true, span: 0.82, tone: [0.06, 0.3, 0.64], thickness: [1.0, 1.8], blockM: [10, 22], name: "the arm's slickrock brows" },
      ...ARM.sides.map((c, i) => ({ x: c.centre[0], z: c.centre[1], length: 1, width: c.half * 1.6, yawDeg: 0,
        path: c.path, trench: true, span: 0.6, tone: [0.06, 0.3, 0.64] as const, thickness: [1.0, 1.6] as const, blockM: [8, 16] as const,
        name: `the arm's side canyon ${i + 1}, its brows` })),
    ],
  },
  horizon: {
    baseHex: 0x59433a, amp: 2.0, style: 'mesa', treeline: 0.10,
    // (the map-revival lane, Skybridge round 2, gauntlet wave 120: "a repeating sawtooth ridge silhouette" — the mesa
    // character's far country stood as a row of rounded hazy peaks behind the ring. Glen Canyon's far skyline is the
    // slickrock plateau's long flat-topped escarpments and lone buttes (Kaiparowits, Tower Butte): the far country
    // becomes sheer flat-capped massifs on the plain with the sky between them, broad mesas rather than Wadi Rum's
    // fluted, bossed jebels)
    panorama: { regional: 'jebel', jebelBossM: 0, jebelRim: 0.95, jebelFlutes: 4, jebelFluteDepth: 0.12, jebelApron: 0.3,
      jebelFoot: 0.64, jebelM: 380, jebelRadiusM: 900, jebelShare: 0.6, jebelFootVary: 0.08, jebelVarnish: 0.4 },
    // the mountains lane (2026-10-03): the outland boulders a shade sparser — they follow the ring's drained faces, and
    // the map's horizon draws no more triangles than before that relief work
    outlandRocks: 0.94,
    // (the map-revival lane, 2026-10-06, Skybridge round 3; gauntlet wave 133: "smooth grey-mauve peaks", "a sharp
    // central pyramid ... rather than flat-topped bedded sandstone mesas") Glen Canyon's skyline is the slickrock
    // plateau's flat-topped escarpments: the outer ranges capped into mesas at a few strata past 1.1 km
    // (horizonTablelands.ts), the bed stair in thicker beds with more of each in cliff, so the tables stand as tiers of
    // cliff over talus
    summitCap: { levelM: 260, fromRadiusM: 1100, vary: 0.25, stepM: 25 },
    escarpment: { bedM: [60, 95], cliffShare: [0.4, 0.6], talusRise: 0.26, talusCurve: 2.6 },
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): authored strata for the beige-brown
    // chasm walls (the style default 0.16 left the abutment cliffs nearly unbedded)
    banding: 0.20,
    // (round 3: the desert air is clear; the ranges keep their red sandstone rather than greying to the fog's mauve)
    forestHex: 0x3c4237, rockHex: 0x80604d, haze: 0.62, grain: 0.62,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', baseM: 700, coverage: 0.42, farBand: 0.5, streets: 0.3, virga: 0.5, rain: 0.2 },
  sky: {
    sunElevationDeg: 25, sunAzimuthDeg: 120, turbidity: 7.4, rayleigh: 1.22,
    // (round 3, gauntlet wave 133: "smooth grey-mauve peaks": the plateau's dry air is clear — its ranges keep their red
    // sandstone at a kilometre and a half; 0.00056 greyed them to the fog's mauve)
    mieCoefficient: 0.010, mieDirectionalG: 0.86, fogDensity: 0.00040,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the haze a step cooler than the 0xffc19a sun
    // (0xa08475 -> 0x9d9188); the near-overcast deck (1.04 / 0.78) missed the low-stratus auto branch (it needs
    // 0.95 / 0.90), so the 620 m fair-weather deck stood 6-7 km out and fully hazed in the 2-12° band — an explicit
    // 380 m broken deck of 2500 m masses keeps texture there; diffuse light patchiness (cloudShadowAmp 0.14)
    fogTintHex: 0x9d9188, fogMix: 0.55, envIntensity: 0.18,
    cloudOpacity: 1.04, cloudOpacity2: 0.78, cloudTintHex: 0xdac8bb,
    cloudAltM: 380, cloudHazeK: 0.00015, cloudUvM: 2500, cloudShadowAmp: 0.14,
    sunIntensity: 3.85, sunColorHex: 0xffc19a, hemiIntensity: 0.31, postExposure: 0.93,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xaa8161 },
  },
  minimap: {
    base: [102, 77, 63], hard: [113, 91, 76], soft: [80, 65, 56],
    forest: 'rgba(55,66,48,.66)', forestStroke: 'rgba(35,43,31,.82)',
    water: 'rgba(47,76,91,.84)', waterStroke: 'rgba(28,49,61,.92)',
    roadCasing: 'rgba(47,37,33,.96)', roadFill: 'rgba(153,127,108,.95)', buildingFill: '#beb2a4',
  },
  shot: { pos: [-280, 60, -236], look: [22, 4, 92] },
  // round 66 (2026-09-24, the FFT ocean): the mountain lake under the wind funnelled down the gorge — a clear,
  // lively chop over the spillway reach where the sheet lay flat
  ocean: { windSpeed: 3.8, windDirDeg: 40, fetchKm: 4, amplitude: 1, foam: 0.1, breakers: 0.25, caustics: 0.55 },
} satisfies import('./contracts.ts').MapCompositionConfig;
