// Wind-scoured polar logistics station, not an alpine-village reskin:
// staggered snow berms screen a wide service grid and a frozen melt pan.
//
// Reference: DYE-M (Dye Main), the Distant Early Warning Line's eastern main station at Cape Dyer, Baffin Island
// (Nunavut), in the 1980s, as the North Warning System took the line over: the Upper Camp on a bare plateau some 700 m
// above Davis Strait at the island's most easterly point, among the Cumberland Peninsula's mountains, the strait's pack
// ice below. Rock and snow on permafrost, frost-shattered tors, the gravel ridges the ice left and frozen tarns, no
// tree for hundreds of kilometres. Nothing the station built stands on the ground: its modules ride on steel piles so
// their heat cannot thaw it (map revival lane 2's reference, rounds 1-5; folded in by the map-content lane).
import winter from './winter.ts';
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
import { roundRoadBends } from './roadBends.ts';
export default {
  id: 'whiteout', name: 'Whiteout Station',
  blurb: 'A remote polar station, frozen melt pans and snow-berm service corridors beneath a pale sky',
  terrain: {
    hillScale: 0.78, microScale: 0.54, rimH: 24, frozenMarshes: true,
    village: { x0: -160, x1: 76, z0: -150, z1: 146, cx: -52, cz: 0, feather: 46, flatten: 0.84, relief: 0.10 },
    roads: { paths: roundRoadBends([
      // Windbreak service court west of the melt pan, not a town spread
      // across the ice. Parallel station rows open into two snow corridors.
      [[-270, -118], [-180, -112], [-100, -104], [-20, -104], [70, -104], [252, -104]],
      [[-310, -460], [-280, -300], [-270, -118], [-274, 74], [-286, 274], [-300, 460]],
      [[-130, -462], [-98, -288], [-100, -104], [-100, 96], [-114, 262], [-90, 464]],
      [[298, -460], [270, -284], [252, -104], [258, 82], [288, 282], [326, 462]],
      [[-274, 74], [-202, 150], [-100, 96], [-20, 96], [64, 154], [202, 174], [288, 282]],
    ]) },
    lakes: [{ x: 114, z: -22, r: 77, depth: 0.55 }, { x: -302, z: 300, r: 38, depth: 0.45 }],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -186, z: -52, length: 180, width: 44, height: 5.6, yawDeg: 8 },
      { kind: 'ridge', x: 196, z: 84, length: 190, width: 48, height: 6.0, yawDeg: -6 },
      // 2026-10-03 (maps lane B): the north berm turns across the approach and moves north (it ran north-south at x -20
      // from z 158 to 378), off Verdant's northern ridge (the layout brief's skeleton rule: at most one of Verdant's
      // landforms with one of this map's within 75 m), 2 m higher so that, faded by the arc's pad clearings, it still
      // screens the two deployments from each other
      { kind: 'ridge', x: -14, z: 300, length: 170, width: 50, height: 8.4, yawDeg: 4 },
      { kind: 'ridge', x: -10, z: -270, length: 200, width: 56, height: 5.8, yawDeg: 88 },
      // 2026-10-03 (maps lane B): two snow berms the station banked against the drift. One crosses the service street's
      // northern approach, where the street runs out through a cut. The other lies across the open ground south-east of
      // the station, its rotation about the midpoint of the two deployments. Both stand more than 75 m from Verdant's
      // ridges (the layout brief's skeleton rule). With the PR head's bot fixes, both teams drove the street straight into
      // the court. battlePacing's seed 45003 ended there in 77 s, under the 90 s floor. Now the four receipt seeds take
      // 134 / 128 / 163 / 260 s, and none of twelve takes under 128 s. Over 40 all-bot seeds the split is 17-23 (14-26
      // without them). The berms stand 3.6 m: at 4.2 m a hull crossing a berm's end at speed took a 163 HP fall.
      { kind: 'ridge', x: -124, z: 186, length: 130, width: 40, height: 3.6, yawDeg: 0 },
      { kind: 'ridge', x: 22, z: -173, length: 130, width: 40, height: 3.6, yawDeg: 0 },
      { kind: 'basin', x: 98, z: 12, rx: 108, rz: 128, height: -2.2, wetScale: 0.2 },
      { kind: 'knoll', x: -346, z: 24, rx: 84, rz: 102, height: 7.0 },
      // 2026-10-03 (maps lane B): periglacial geology — an esker, the sinuous gravel ridge a meltwater tunnel left under
      // the ice, winds across the south-west tundra in three linked reaches; three pingos, the ice-cored frost mounds
      // of a polar plain, stand in the open south-east, north-east and south-west.
      { kind: 'ridge', x: -392, z: -268, length: 90, width: 16, height: 3.2, yawDeg: 62 },
      { kind: 'ridge', x: -352, z: -198, length: 80, width: 15, height: 3.6, yawDeg: 48 },
      { kind: 'ridge', x: -300, z: -146, length: 76, width: 14, height: 3.0, yawDeg: 30 },
      { kind: 'knoll', x: 318, z: -262, r: 20, height: 4.2 },
      { kind: 'knoll', x: 360, z: 330, r: 18, height: 3.8 },
      { kind: 'knoll', x: -250, z: -320, r: 17, height: 3.4 },
    ],
  },
  spawns: { player: { x: -102, z: -390 }, enemies: [
    { x: -256, z: 382 }, { x: -174, z: 422 }, { x: -90, z: 380 }, { x: -6, z: 424 },
    { x: 78, z: 382 }, { x: 162, z: 422 }, { x: 248, z: 388 },
  ] },
  // round 70 (owner 2026-09-25: yes to the Whiteout snow re-grade). Round 44's law — the lit snow must leave the tonemap
  // shoulder below the capped sky — reaches the snow that RENDERS here: winter's round-48 grassTone step grades the
  // procedural fallback only, the sourced Snow010A rendered untinted on both winter maps (applySourcedTerrain reads the
  // splat for its palette id and mudRough alone). The photo snow's albedo takes a neutral-cold multiplier, the fallback
  // law steps by the same factor (L 0.52 + 0.32·l → 0.46 + 0.28·l), postExposure 0.86 → 0.83 in the sky block below.
  // Skyline metric and the snow boxes in the round-70 section of docs/MAP-BEAUTIFICATION.md.
  splat: { sourcedPalette: 'winter', ...winter.splat,
    sourcedTint: { G: [0.88, 0.885, 0.895] },
    grassTone: (h: number, s: number, l: number) => [0.575, 0.03, clamp01(0.46 + l * 0.28)], // snowpack fallback
    // 2026-10-03 (maps lane B, the gauntlet's "dull blue-grey plaster"): snow is near neutral, and under overcast its
    // blue comes only from open sky (the skies lane's lighting side). The macro tints go from B/R 1.06 (A) and
    // 1.17 (B) to 1.04, at the same luminance (Rec. 709: A 1.039, B 0.873). C was already 1.03.
    iceDrift: 0.3, tintA: [1.021, 1.041, 1.062], tintB: [0.858, 0.875, 0.893], tintC: [1.05, 1.06, 1.08], roadTint: [0.67, 0.70, 0.72], midRelief: 0.45 },
  vegetation: {
    grassTexTone: winter.vegetation.grassTexTone, tuftTone: winter.vegetation.tuftTone,
    // A few sheltered firs break up the spruce/birch silhouette without
    // increasing the deliberately sparse station's tree placement budget.
    species: ['spruce', 'birch', 'fir'], clusterMix: [['spruce', 0.55], ['birch', 0.35], ['fir', 0.10]],
    loneMix: [['birch', 0.65], ['spruce', 0.30], ['fir', 0.05]], rimMix: [['spruce', 0.65], ['birch', 0.25], ['fir', 0.10]],
    // Trees round 2b (2026-10-03, gauntlet wave 28): Whiteout Station stands on an ice sheet — no tree, no shrub and no
    // grass grows on the ice (its rock is the bare nunataks'). Was 8 / 12 / 20 trees, grass 0.20, scrub 0.22.
    clusterCount: 0, loneCount: 0, rimCount: 0, grassDensity: 0, bushCount: 0, bushSpecies: 'birch',
    palettes: winter.vegetation.palettes,
  },
  props: {
    // the arctic kit (maps/regional/arctic.ts; map-revival lane 2's rounds 1-5, gauntlet waves 130 and 224, brought in by
    // the map-content lane, 2026-10-09): DYE-M's own buildings — the module trains on their piles under the radome, the
    // tropo billboards, the radar on its lattice tower, the steel garages, the Jamesway huts, the plywood sheds, a
    // stripped module — on the plan's seats; the kit paints its own panels (the map's tones only tone the old halls)
    architecture: 'arctic',
    sourcedPalette: 'winter',
    plan: ['depot', 'warehouse', 'watertower', 'foundryoffice', 'containerRow', 'depot', 'warehouse', 'ruin', 'firestation', 'depot', 'containerRow', 'woodshed', 'warehouse', 'ruin', 'depot', 'foundryoffice'],
    destructibleBuildings: ['quonsethut', 'relaystation', 'motorpool', 'servicegarage'],
    buildingLat: [14, 2], destructibleBuildingLat: [18, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'station-motor-pool', role: 'brawl', x: -196, z: 26, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      // 2026-10-03 (maps lane B): the weather relay moves from (288, 38), 52 m from Verdant's eastern observer, and the
      // fuel shelter from (12, 266), 13 m from Verdant's northern command fold, behind the moved north berm (the layout
      // brief's skeleton rule: no strongpoint within 60 m of one of Verdant's)
      { id: 'eastern-weather-relay', role: 'scout', x: 320, z: -10, yawDeg: -90, structure: 'relaystation', outcrop: { count: 4, radius: 8 } },
      { id: 'north-fuel-shelter', role: 'support', x: -70, z: 270, yawDeg: 180, structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true },
    ],
    industrialCladding: 'steel', // round 75: a polar station's halls are corrugated sheet, not brick
    yardDressing: 60, // round 75: a snowed-in station keeps its yards sparse
    snowCap: true, extraKits: ['winterLake'], wallStyle: 'fieldstone', wallStoneChance: 0.78,
    wallRuns: [[-148, -76, -148, -16, 2], [-148, 20, -148, 84, 3], [-66, -58, -4, -58, 2], [-66, 52, -4, 52, 3], [-26, 296, 56, 296, 2], [316, 0, 316, 74, 2]],
    well: false, hayCrates: false, fences: true,
    // (the map-content lane's round 1c, 2026-10-09) the station's pole line along its service roads; the glacial erratics
    // and frost-shattered outcrops of the plateau (was 136 rocks, 22 outcrops)
    telegraph: true, carts: false, logs: true,
    rocks: 240, outcrops: 38, craters: 50, rubblePiles: 12, sandbagLines: 16, hedgehogs: 12,
    // the map-vehicles lane (2026-10-06, the period ruling): the Arctic north in the 1980s: Norway's Leopard 1 and
    // M48, Sweden's Strv 103, the Soviet T-80B and BMP-2
    tankWrecks: { era: 'cold-war', count: 7, debris: true, ids: ['leo1a5', 'm48', 'strv103', 't80b', 'bmp2'] },
    // map revival lane 2, round 3 (gauntlet wave 130: "an untextured flat-tan box with a tent-shaped canopy, a floating
    // black tyre and steps to nowhere"; folded in by the map-content lane): the roadside camps (a canvas tent camp's kit)
    // and the park benches do not belong at a DEW station; its camps are the Jamesway camps below
    inhabit: { stalls: 0, benches: 0, coreClutter: 20, sleds: 10, drums: 8, trucks: 5, jeeps: 4, drumClusters: 5, camps: 0, modernClutter: 20, looseClutter: 20, roadFence: 'fencerail', yardFence: 'fencerail' },
    // the map-content lane (2026-10-09; owner: "some maps like whiteout crossing and mesa mines look unfinished and so
    // empty"; the census: 67 % of the playable square more than 30 m from anything standing, the station one strip along
    // the service street). Reference: DYE-M, the Distant Early Warning Line's main station at Cape Dyer on Baffin Island,
    // as it stood in 1985 (landmarks/stations.ts): the module train on its stilts with the search radar's radome at its
    // east end, the POL tank farms, the tropospheric-scatter billboards on the high ground facing the next stations east
    // (Greenland) and west, the guyed masts. Set into the finished map (ground 'veto': every pass after them draws as
    // before and only what would stand on a piece's ground is left out); off the zone discs, the pads and the field works.
    landmarks: [
      // the station: the module train with the search radar at its east end, the fuel caches by its doors
      { kind: 'moduleTrain', x: -30, z: -30, yawDeg: 0, params: { modules: 8 }, ground: 'veto', name: 'the module train' },
      { kind: 'radomeTower', x: 6, z: -29, yawDeg: 0, ground: 'veto', name: 'the search radar' },
      { kind: 'drumCache', x: 40, z: -62, yawDeg: 0, ground: 'veto', name: 'the station fuel cache' },
      // the POL tank farms: the main farm south-east of the melt pan, the motor pool's and the north berm's tanks
      { kind: 'fuelTankFarm', x: 110, z: -150, yawDeg: 0, ground: 'veto', name: 'the POL tank farm' },
      { kind: 'drumCache', x: 140, z: -170, yawDeg: 90, ground: 'veto', name: 'the tank farm drums' },
      { kind: 'fuelTankFarm', x: -240, z: -185, yawDeg: 90, params: { tanks: 2, radius: 4, height: 6 }, ground: 'veto', name: 'the motor pool tanks' },
      { kind: 'fuelTankFarm', x: 60, z: 236, yawDeg: 0, params: { tanks: 2, radius: 4, height: 6 }, ground: 'veto', name: 'the north tanks' },
      // the billboards on the high ground, facing the next stations east (Greenland) and west along the line
      { kind: 'troposcatter', x: 342, z: 22, yawDeg: 90, ground: 'veto', name: 'the east billboards (south)' },
      { kind: 'troposcatter', x: 342, z: 56, yawDeg: 90, ground: 'veto', name: 'the east billboards (north)' },
      { kind: 'troposcatter', x: -376, z: 6, yawDeg: -90, ground: 'veto', name: 'the west billboards (south)' },
      { kind: 'troposcatter', x: -376, z: 40, yawDeg: -90, ground: 'veto', name: 'the west billboards (north)' },
      // the masts
      { kind: 'guyedMast', x: 370, z: 200, ground: 'veto', name: 'the north-east mast' },
      { kind: 'guyedMast', x: -190, z: -252, ground: 'veto', name: 'the south-west mast' },
      { kind: 'guyedMast', x: 190, z: -252, params: { height: 30 }, ground: 'veto', name: 'the south-east mast' },
      // the Jamesway camps out on the tundra (the summer survey and the billboard crews), each with its fuel cache
      { kind: 'jamesway', x: -232, z: 196, yawDeg: 0, ground: 'veto', name: 'the north-west camp (west hut)' },
      { kind: 'jamesway', x: -214, z: 196, yawDeg: 0, ground: 'veto', name: 'the north-west camp (east hut)' },
      { kind: 'jamesway', x: -196, z: 230, yawDeg: 0, ground: 'veto', name: 'the north-west camp (north hut)' },
      { kind: 'drumCache', x: -250, z: 228, yawDeg: 0, ground: 'veto', name: 'the north-west camp drums' },
      { kind: 'jamesway', x: 330, z: 300, yawDeg: 20, ground: 'veto', name: 'the north-east camp (west hut)' },
      { kind: 'jamesway', x: 350, z: 296, yawDeg: 20, ground: 'veto', name: 'the north-east camp (east hut)' },
      { kind: 'drumCache', x: 340, z: 322, yawDeg: 20, ground: 'veto', name: 'the north-east camp drums' },
      { kind: 'jamesway', x: 320, z: -350, yawDeg: -30, ground: 'veto', name: 'the south-east camp (west hut)' },
      { kind: 'jamesway', x: 340, z: -340, yawDeg: -30, ground: 'veto', name: 'the south-east camp (east hut)' },
      { kind: 'drumCache', x: 300, z: -330, yawDeg: 60, ground: 'veto', name: 'the south-east camp drums' },
      { kind: 'jamesway', x: -400, z: -400, yawDeg: 10, ground: 'veto', name: 'the dump hut' },
      { kind: 'drumCache', x: -380, z: -380, yawDeg: 0, params: { rows: 4, columns: 10 }, ground: 'veto', name: 'the dump drums' },
      // the west strip's camps, the airstrip beacon, the south and south-east camps, the dump's tanks
      { kind: 'jamesway', x: -430, z: -230, yawDeg: 0, ground: 'veto', name: 'the west camp (south hut)' },
      { kind: 'jamesway', x: -412, z: -230, yawDeg: 0, ground: 'veto', name: 'the west camp (north hut)' },
      { kind: 'drumCache', x: -430, z: -258, yawDeg: 0, ground: 'veto', name: 'the west camp drums' },
      { kind: 'jamesway', x: -405, z: 150, yawDeg: 0, ground: 'veto', name: 'the billboard camp (west hut)' },
      { kind: 'jamesway', x: -387, z: 150, yawDeg: 0, ground: 'veto', name: 'the billboard camp (east hut)' },
      { kind: 'drumCache', x: -396, z: 172, yawDeg: 0, ground: 'veto', name: 'the billboard camp drums' },
      // the airstrip on the plateau's west edge, its markers, windsock and radio shack
      { kind: 'airstrip', x: -440, z: 30, yawDeg: 0, ground: 'veto', name: 'the airstrip' },
      { kind: 'guyedMast', x: -420, z: 330, params: { height: 30 }, ground: 'veto', name: 'the beacon mast' },
      { kind: 'jamesway', x: 420, z: 420, yawDeg: 90, ground: 'veto', name: 'the north-east outpost' },
      { kind: 'drumCache', x: 250, z: 330, yawDeg: 30, ground: 'veto', name: 'the north road cache' },
      { kind: 'jamesway', x: 220, z: -400, yawDeg: 0, ground: 'veto', name: 'the south-east survey hut' },
      { kind: 'drumCache', x: 240, z: -410, yawDeg: 90, ground: 'veto', name: 'the south-east survey drums' },
      { kind: 'drumCache', x: 300, z: 120, yawDeg: 0, ground: 'veto', name: 'the east road cache' },
      { kind: 'jamesway', x: 40, z: -420, yawDeg: 90, ground: 'veto', name: 'the south camp hut' },
      { kind: 'drumCache', x: 70, z: -415, yawDeg: 0, ground: 'veto', name: 'the south camp drums' },
      { kind: 'fuelTankFarm', x: -330, z: -330, yawDeg: 0, params: { tanks: 2, radius: 4, height: 6 }, ground: 'veto', name: 'the dump tanks' },
      { kind: 'jamesway', x: 200, z: 60, yawDeg: 90, ground: 'veto', name: 'the melt pan hut' },
      { kind: 'drumCache', x: 210, z: 40, yawDeg: 0, ground: 'veto', name: 'the melt pan drums' },
      // (round 1c) four more camps and two drum dumps out in the voids the census still found
      { kind: 'jamesway', x: -392, z: 250, yawDeg: 15, ground: 'veto', name: 'the lake camp' },
      { kind: 'drumCache', x: -410, z: 230, yawDeg: 15, ground: 'veto', name: 'the lake camp drums' },
      { kind: 'jamesway', x: 404, z: -262, yawDeg: -20, ground: 'veto', name: 'the south-east trail camp' },
      { kind: 'jamesway', x: 150, z: -332, yawDeg: 85, ground: 'veto', name: 'the south survey camp' },
      { kind: 'drumCache', x: 172, z: -318, yawDeg: 85, ground: 'veto', name: 'the south survey drums' },
      { kind: 'jamesway', x: 424, z: 40, yawDeg: 0, ground: 'veto', name: 'the east outpost' },
      { kind: 'drumCache', x: 380, z: -160, yawDeg: 30, params: { rows: 5, columns: 12 }, ground: 'veto', name: 'the east drum dump' },
      { kind: 'drumCache', x: -424, z: 290, yawDeg: 70, params: { rows: 4, columns: 12 }, ground: 'veto', name: 'the lake drum dump' },
      // the drift fences across the wind, windward of the station's roads
      { kind: 'snowFence', x: 0, z: -200, yawDeg: 0, ground: 'veto', name: 'the south drift fence' },
      { kind: 'snowFence', x: 160, z: -210, yawDeg: 10, ground: 'veto', name: 'the south-east drift fence' },
      { kind: 'snowFence', x: 0, z: 190, yawDeg: 0, ground: 'veto', name: 'the north drift fence' },
      { kind: 'snowFence', x: -170, z: 160, yawDeg: -10, ground: 'veto', name: 'the north-west drift fence' },
      { kind: 'snowFence', x: 400, z: -150, yawDeg: 90, ground: 'veto', name: 'the east drift fence' },
      { kind: 'snowFence', x: -398, z: -100, yawDeg: 90, ground: 'veto', name: 'the west drift fence' },
    ],
    // the station's machines (vehicleSetPiecesWorks.ts): the Bv 206 carriers, the Sno-Cats and the D8 dozers that kept the
    // roads and the drifts open (the arctic1980s fleet's trucks and pickups stay the inhabit pass's)
    vehicleSetPieces: [
      { kind: 'bv206', x: -8, z: -12, yawDeg: 80 }, { kind: 'bv206', x: -72, z: -64, yawDeg: 90 },
      { kind: 'snocat', x: 18, z: -62, yawDeg: -60 }, { kind: 'd8h', x: 132, z: -126, yawDeg: 30 },
      { kind: 'snocat', x: -212, z: -22, yawDeg: 170 }, { kind: 'bv206', x: -236, z: -138, yawDeg: 10 },
      { kind: 'd8h', x: -58, z: 246, yawDeg: 200 }, { kind: 'bv206', x: 312, z: 40, yawDeg: 2 },
      { kind: 'snocat', x: -344, z: 62, yawDeg: 20 }, { kind: 'd8h', x: 168, z: 206, yawDeg: 120 },
      { kind: 'bv206', x: -248, z: 208, yawDeg: 0 }, { kind: 'snocat', x: 318, z: 316, yawDeg: 110 },
      { kind: 'bv206', x: 300, z: -350, yawDeg: -20 },
      { kind: 'snocat', x: -392, z: -264, yawDeg: 40 }, { kind: 'bv206', x: -368, z: 166, yawDeg: 160 },
      { kind: 'd8h', x: 230, z: 300, yawDeg: 60 }, { kind: 'snocat', x: 200, z: -380, yawDeg: 20 },
      { kind: 'bv206', x: 290, z: -60, yawDeg: 180 }, { kind: 'snocat', x: 100, z: -330, yawDeg: 300 },
      { kind: 'd8h', x: -300, z: -300, yawDeg: 30 },
      // (round 1c) the stripped trail south-east of the station, its abandoned machines; more working machines out in the voids
      { kind: 'bv206', x: 206, z: -196, yawDeg: 130, wrecked: true }, { kind: 'snocat', x: 262, z: -246, yawDeg: 140, wrecked: true },
      { kind: 'bv206', x: 330, z: -296, yawDeg: 120, wrecked: true }, { kind: 'snocat', x: 392, z: -340, yawDeg: 150, wrecked: true },
      { kind: 'bv206', x: 432, z: -404, yawDeg: 135, wrecked: true },
      { kind: 'snocat', x: 290, z: 104, yawDeg: 10 }, { kind: 'bv206', x: -306, z: 218, yawDeg: 60 },
      { kind: 'd8h', x: 128, z: -300, yawDeg: 200 }, { kind: 'bv206', x: -62, z: 318, yawDeg: 95 },
      { kind: 'snocat', x: 406, z: 22, yawDeg: 300 }, { kind: 'd8h', x: 398, z: -182, yawDeg: 20 },
      // the dump's burnt-out carrier
      { kind: 'bv206', x: -410, z: -380, yawDeg: 70, wrecked: true },
    ],
  },
  // the map-content lane (2026-10-09; the owner: "so empty", and the bird view the judge): the plateau's frost-shattered
  // gneiss — tors and outcrops standing out of the snow on the knolls, the ridges and the esker, a field in each quarter
  // and on each flank, mirrored north and south of the station so neither deployment gains cover
  scenery: {
    // (round 1c) inuksuit, the Inuit's stone figures that mark a route across the land, beside the service roads and on two
    // knolls (scenery cairns of the plateau's gneiss)
    landmarks: [
      { kind: 'cairn', x: 286, z: -280, height: 2.0, scale: 0.9, geology: 'granite', name: 'an inuksuk on the east road (south)' },
      { kind: 'cairn', x: 268, z: -180, height: 1.8, scale: 0.8, geology: 'granite', name: 'an inuksuk on the east road' },
      { kind: 'cairn', x: 268, z: -20, height: 2.1, scale: 0.9, geology: 'granite', name: 'an inuksuk by the relay' },
      { kind: 'cairn', x: 274, z: 150, height: 1.9, scale: 0.85, geology: 'granite', name: 'an inuksuk on the east road (north)' },
      { kind: 'cairn', x: 304, z: 236, height: 2.0, scale: 0.9, geology: 'granite', name: 'an inuksuk at the east fork' },
      { kind: 'cairn', x: -258, z: -200, height: 1.9, scale: 0.85, geology: 'granite', name: 'an inuksuk on the west road (south)' },
      { kind: 'cairn', x: -258, z: -14, height: 2.1, scale: 0.9, geology: 'granite', name: 'an inuksuk by the motor pool' },
      { kind: 'cairn', x: -262, z: 176, height: 1.8, scale: 0.8, geology: 'granite', name: 'an inuksuk on the west road (north)' },
      { kind: 'cairn', x: -270, z: 330, height: 2.0, scale: 0.9, geology: 'granite', name: 'an inuksuk by the lake' },
      { kind: 'cairn', x: -84, z: -206, height: 1.9, scale: 0.85, geology: 'granite', name: 'an inuksuk on the south road' },
      { kind: 'cairn', x: 432, z: 76, height: 2.2, scale: 1.0, geology: 'granite', name: 'an inuksuk on the east knoll' },
      { kind: 'cairn', x: -432, z: 330, height: 2.2, scale: 1.0, geology: 'granite', name: 'an inuksuk on the west knoll' },
    ],
    rockFields: [
      { geology: 'granite', x: -380, z: -60, radius: 70, count: 9, slopeBias: 0.4, size: [3, 6], name: 'the west knoll tors' },
      { geology: 'granite', x: 210, z: 130, radius: 80, count: 10, slopeBias: 0.5, size: [3, 6.5], name: 'the east ridge rock' },
      { geology: 'granite', x: -320, z: -330, radius: 80, count: 9, size: [2.5, 5.5], name: 'the esker boulder field' },
      { geology: 'granite', x: -380, z: 370, radius: 70, count: 9, size: [2.5, 5.5], name: 'the north-west boulder field' },
      { geology: 'granite', x: 330, z: -270, radius: 70, count: 8, size: [3, 6], name: 'the south-east tor' },
      { geology: 'granite', x: 360, z: 330, radius: 70, count: 8, size: [3, 6], name: 'the north-east tor' },
      { geology: 'granite', x: 40, z: -290, radius: 70, count: 8, slopeBias: 0.5, size: [2.5, 5.5], name: 'the south ridge rock' },
      { geology: 'granite', x: 110, z: 320, radius: 70, count: 8, size: [2.5, 5.5], name: 'the north berm rock' },
      // (round 1c) the east flank's tors beyond the relay
      { geology: 'granite', x: 410, z: -110, radius: 60, count: 8, size: [2.5, 5.5], name: 'the east flank tors' },
    ],
  },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the flattest ring's tone grain 0.35 -> 0.60
  // round 49 (2026-09-23): the layers probe (ring mesh hidden: skyline ratio 1.005 -> 1.009, edge row unchanged) shows
  // the sky-w / sky-s skyline is the terrain-material rim band, not this ring — round 44's re-grade call stands. Ring
  // side: wind-scoured crests only (bareRock, rockHex 0x9da9b4 -> 0x5b6772: the pale rock read as more snow). Winter
  // is untouched.
  // round 72 (2026-09-25, owner: "the mountains look so flat and untextured and boring"): the polar character on the alpine
  // ladder — the foothill kept low (amp 1.0: at 1.45 the first ridge, a terrain-material face, walled off the ranges)
  // and the polar character's boost standing the ranges behind it to the stratus, snow on the broad faces with rock on
  // the steep ones, the scoured ribs at a third (at 1 they greyed every upper slope to heath), spruce and birch stands
  // on the lower slopes
  // the mountains lane (2026-10-03): held at the PR head's far country while its ice sheet is finished — the overcast
  // ticket (a7345bd2c) still showed the beige band over the low ring from the elevated views, pixel for pixel (the aerial
  // pass's target under a closed deck, the skies lane's); no ring forest (gauntlet wave 39: "distant conifer silhouettes
  // near the mountains" on a map that must be bare ice — buildHorizonForest and the stands painted on the ring's faces
  // both follow its treeline, and the forest builder stands down under 0.14); and no outland boulders in their place (a
  // treeless ring takes the boulder field at 0.55 by default: 256 k triangles of dark rocks strewn over the snow)
  horizon: { baseHex: 0xa3b1be, amp: 1.0, style: 'alpine', relief: 'polar', treeline: 0, snowline: 0.30, outlandRocks: 0, panorama: false, forestHex: 0x536371, rockHex: 0x5b6772, bareRock: 0.35, haze: 0.92, grain: 0.60 },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the polar deck authored explicitly instead of
  // inheriting Frosthollow's (320 m / 0.00013 / 2200 m) — a lower 300 m stratus of smaller 2000 m masses that keeps
  // its texture at the 13° sun's grazing elevations; diffuse light patchiness (cloudShadowAmp 0.08)
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  // 2026-10-04 (the skies lane; the gauntlet's waves 66–70: "a single flat grey-white gradient with zero cloud structure";
  // and "the ice plain clearly darker than the white sky"): the stratus lit as a deck — what its columns transmit
  // (deckLight 1: one lighting path; a share under 1 pays both) — with soft cells, base lumps and the detail's erosion, and
  // the snow under it lifting its base (ambientScale, the deck path's ground bounce: a quarter-albedo ground at 1). The
  // deck's structure lands in the overcast photos' band, and its level comes down toward the snow's it lights
  clouds: { regime: 'low-stratus', baseM: 300, coverage: 1, scud: 0, nightGlow: 0.2, nightGlowHex: 0xfff0d0,
    deckLight: 1, cells: 0.5, lumps: 0.6, deckDetail: 0.5, ambientScale: 3 },
  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, cloudAltM: 300, cloudHazeK: 0.00012, cloudUvM: 2000, cloudShadowAmp: 0.08, sunIntensity: 2.75, hemiIntensity: 0.58,
    postExposure: 0.83 /* round 70: 0.86 (winter's) → 0.83, the snow re-grade's exposure half */ },
  minimap: { ...winter.minimap, base: [161, 174, 186], hard: [137, 149, 159], soft: [107, 130, 149] },
  shot: { pos: [-256, 49, -262], look: [68, 0, 82] },
} satisfies import('./contracts.ts').MapCompositionConfig;
