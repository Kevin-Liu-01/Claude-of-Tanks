// src/world/maps/urban.ts — Steinburg, redesigned 2026-10-01 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, building tones, name and id are the map's identity and stay; the battlefield under
// them is new. The old layout was a 4 × 4 street lattice drawn edge to edge across a flat field, every building inside
// one square, under Verdant's landform skeleton (two flank ridges, a north ridge, a south-east knoll, a south-west
// basin) and Verdant's three beat sites. Zone control placed its centre zone 31 m from the bravo pad.
//
// Reference: the walled hill towns of Franconia and Saxony (Kronach, Meissen, Pappenheim). An old town stands on the
// back of a ridge spur between two valleys, its main street along the crest and a market square where the old trade
// road crosses it. A castle crowns the rock where the spur ends. Back lanes run parallel to the main street, and the
// town wall survives in stretches. Brickworks and a goods station sit down in the valleys beside the valley roads,
// and a modern bypass runs through the gap beyond the castle rock.
//
// The story on the ground: the Steinberg spur runs from the west edge to the castle rock east of centre, above the two
// valleys, broad and gentle on its back. The old town covers the spur's back between the west gate and the castle.
// The Hauptstrasse runs along the crest, bending with it, and the trade road crosses it at the market square. Two back
// lanes run behind the street rows, north and south of the Hauptstrasse, crooked with the ground and unlike each other,
// each meeting the trade road on its way round, and four alleys at uneven intervals join them to the Hauptstrasse.
// The town wall survives in stretches outside the lanes, broken at the four gates and shot out in two places; the
// castle's ring wall, its keep, a second tower and the chapel crown the Burgberg. Off the town's east end the
// Hauptstrasse drops in a long slant past the castle rock's south foot, crosses the bypass in the gap beyond the rock
// and runs on to the east. Each valley has its own road and suburb: brickworks in the south, a goods station in the
// north. A farm road crosses the spur's open west end through the orchards, a garage yard stands on the spur's flank
// above each valley road, and a farmstead on each lower slope of the castle rock.
//
// The map-revival lane (2026-10-05; the gauntlet's wave 116 read the old town as "a too-perfect symmetric hexagon"):
// the old town's plan is a hill town's, organic along the crest, not the mirror of itself it was. The rest of the
// battlefield keeps its mirror across the spur's crest. Alpha comes up from the south valley, bravo from the north. The
// town, the castle rock and the three zone-control objectives stand on the spur (the market square, the west farm
// crossing on the crest line, the bypass gap) and are equally far from both teams. Three lanes cross the midfield: the
// open west ridge, the town's streets, and the east gap under the castle rock; the garage yards and the farmsteads mark
// them off.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Street-wall plan: mostly rowhouses so every block frontage reads built-up,
// ruins interleaved (1 in 5) for shelled-town texture, plus real vertical
// landmarks — a factory (chimney stack) — and two squat towers. 'church'/'factory'
// come from maps/urbanKit.ts (registered in props.ts BUILDER_BY_NAME; they
// degrade to cottages if unregistered). (The map-revival lane, 2026-10-06: the town
// church stands on the market square as a planned site below; the block fill's
// fifth plot, which had put it outside the town wall, takes a rowhouse.)
const PLAN = [];
for (let i = 0; i < 108; i++) {
  if (i === 11) PLAN.push('factory');
  else if (i === 15) PLAN.push('firestation');
  else if (i === 25) PLAN.push('tavern');
  else if (i === 37) PLAN.push('schoolhouse');
  else if (i === 49) PLAN.push('foundryoffice');
  else if (i === 61) PLAN.push('depot');
  else if (i === 73) PLAN.push('warehouse');
  else if (i === 85) PLAN.push('civichall');
  else if (i === 9 || i === 41) PLAN.push('tower');
  // world-dressing r1: corner shops (chamfered corner entrance, display
  // glass both faces) salt the block interiors — a third street archetype
  else if (i === 7 || i === 19 || i === 33 || i === 52) PLAN.push('cornershop');
  // r1 (content_breadth): second ruin cadence — the town read too intact for
  // a battle-ready map ("rubble/destruction dressing too sparse"); ~1 in 3.5
  // interior slots is now a shelled ruin, clustering into visibly collapsed
  // blocks where the two cadences overlap
  else if (i % 5 === 2 || i % 9 === 5) PLAN.push('ruin');
  else PLAN.push('rowhouse');
}

export default {
  id: 'urban',
  name: 'Steinburg',
  blurb: 'A walled hill town on a ridge spur between two valleys, crowned by a castle rock',

  terrain: {
    hillScale: 0.55,
    microScale: 0.7,
    rimH: 25,
    marshes: [],
    // The old town on the spur's back, west gate to castle rock. The spur keeps 60 % of its height inside the town
    // (settlementScale 0.6), so the streets climb its crown gently instead of sitting on a pancake.
    village: { x0: -232, x1: 72, z0: -102, z1: 102, cx: -50, cz: 0, feather: 42, flatten: 0.86, relief: 0.15 },
    landforms: [
      // The Steinberg spur: one long ridge from past the west edge to the castle rock, its crest a few metres north
      // of the square's centreline; the east end tapers into the rock.
      { kind: 'ridge', x: -210, z: 22, length: 700, width: 236, height: 11, yawDeg: -2.6, settlementScale: 0.6, corridorScale: 0.85 },
      // The Burgberg: the castle rock where the spur ends.
      { kind: 'knoll', x: 152, z: 6, r: 62, height: 19, settlementScale: 1 },
      // The two valleys, each a long shallow trough under its road.
      { kind: 'basin', x: -60, z: -236, rx: 330, rz: 104, height: -3.2, yawDeg: -3 },
      { kind: 'basin', x: -60, z: 248, rx: 330, rz: 104, height: -3.2, yawDeg: 3 },
      // Valley-floor hillocks (field hedges and spoil), each with its mirror across the crest.
      { kind: 'knoll', x: 176, z: -300, rx: 58, rz: 44, height: 4.2, yawDeg: 20 },
      { kind: 'knoll', x: 176, z: 312, rx: 58, rz: 44, height: 4.2, yawDeg: -20 },
      { kind: 'knoll', x: -390, z: -320, rx: 64, rz: 46, height: 4.6, yawDeg: -14 },
      { kind: 'knoll', x: -390, z: 332, rx: 64, rz: 46, height: 4.6, yawDeg: 14 },
    ],
    // Authored paths stop inside the square; the endpoint completion adds each exit and grades it through the rim.
    roads: { paths: [
      // 0 — the Hauptstrasse: in through the west gate along the crest, through the market square, then down off the
      // town's east end in a long slant past the castle rock's south foot, across the bypass and out to the east.
      // Road 0 carries the utility-pole line (mapQuality); a node every 24-25 m, since Steinburg's road stations are
      // physical (maps/roadStations.ts) and the poles stand at the road's vertices. Inside the old town the
      // Hauptstrasse bends with the crest within 5 m of the bot planner's 25 m lattice line z = 0 (and the trade road
      // within 3 m of x = -50), so the street-front rows still leave a chain of open cells down each, and both run
      // straight through the market so its 30 m disc stays clear of the rows.
      [[-448, 39], [-423, 35], [-398, 31], [-373, 27], [-349, 24], [-324, 19], [-299, 14], [-275, 9], [-250, 4],
        [-225, 3], [-200, 4], [-175, 5], [-150, 4], [-125, 2], [-100, 0], [-75, 0], [-50, 0], [-25, 0], [0, -2],
        [25, -4], [50, -2], [73, -5], [88, -23], [99, -43], [114, -62], [131, -77], [153, -85], [176, -90],
        [199, -93], [223, -94], [246, -95], [270, -96], [294, -98], [318, -100], [342, -102], [366, -104],
        [390, -106], [414, -108], [438, -110], [448, -111]],
      // 1 — the old trade road: up out of the south valley, across the market square, down into the north valley.
      [[-30, -448], [-32, -420], [-40, -330], [-46, -240], [-50, -150], [-48, -100], [-52, -75], [-50, -45], [-50, 0],
        [-50, 40], [-49, 75], [-52, 100], [-54, 170], [-62, 250], [-78, 340], [-88, 420], [-92, 448]],
      // 2 — the bypass: edge to edge through the gap between the castle rock and the east edge.
      [[304, -448], [306, -400], [300, -290], [284, -180], [270, -96], [262, 0], [270, 96], [284, 180],
        [300, 290], [306, 400], [304, 448]],
      // 3 / 4 — the valley roads, west edge to the bypass, each through its suburb.
      [[-448, -232], [-400, -230], [-300, -226], [-200, -232], [-120, -238], [-46, -240], [40, -232],
        [120, -214], [200, -190], [284, -180]],
      [[-448, 240], [-400, 238], [-300, 234], [-200, 238], [-120, 244], [-62, 250], [40, 242], [120, 224],
        [200, 200], [284, 180]],
      // 5 — the farm road over the spur's open west end, valley road to valley road through the orchards.
      [[-300, -226], [-318, -130], [-330, 24], [-318, 130], [-300, 234]],
      // 6–9 — the old town's back lanes behind the street rows, north and south of the Hauptstrasse, each in two legs
      // that meet on the trade road: they follow the spur's ground round the town, crooked and not each other's mirror
      // (their lengths agree within 3 %: 331 and 339 m)
      [[-200, 4], [-190, 40], [-160, 66], [-120, 80], [-85, 84], [-49, 77]],
      [[-49, 77], [-15, 72], [15, 62], [40, 40], [50, -2]],
      [[-200, 4], [-185, -30], [-155, -62], [-110, -80], [-52, -74]],
      [[-52, -74], [-10, -80], [20, -66], [42, -38], [50, -2]],
      // 10–13 — the alleys from the Hauptstrasse to the back lanes, two a side at uneven spacing. No alley meets the
      // Hauptstrasse within 100 m west of the market: the network grade solve levels a road 32 m either side of each
      // crossing (roadGradeSmoothing.ts), and a crossing nearer the square would leave the street's 1.8 m fall to the
      // apron to its 14 m bank (19 % at x = -97; the layout brief's road grade law is 18 %)
      [[-150, 4], [-146, 40], [-150, 70]],
      [[0, -2], [3, 30], [5, 65]],
      [[-166, 5], [-163, -27], [-166, -50.27]],
      [[22, -4], [20, -35], [20, -66]],
    ] },
    // The market square and the farm crossing: level paved aprons the zone-control placement seats its 30 m discs on
    // (the square also keeps the rowhouse strips and the monument back from the crossing). The bypass zone seats on
    // the road's natural floor in the gap: an apron there would ramp the bypass past a road grade.
    hardstands: [
      { x: -50, z: 0, width: 64, length: 64, yawDeg: 6, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): on the west road's own grade, a 16 m bank
      { x: -330, z: 4, width: 60, length: 60, yawDeg: 100, grade: 'road', bankM: 16 },
    ],
  },

  spawns: {
    // Alpha deploys in the south valley west of the trade road; bravo's seven pads are its mirror in the north valley.
    // The spur and the old town screen each anchor from the other; 803 m apart.
    player: { x: -36, z: -404 },
    enemies: [
      { x: -36, z: 404 }, { x: -88, z: 392 }, { x: 16, z: 392 }, { x: -136, z: 372 },
      { x: 64, z: 372 }, { x: -62, z: 432 }, { x: -10, z: 432 },
    ],
  },

  splat: {
    grassTone: (h: number, s: number, l: number) => [0.19, clamp01(s * 0.5), clamp01(l * 0.86)], // worn town green
    dirtTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.35), clamp01(l * 1.02 + 0.03)], // ash-grey rubble dust
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.5), clamp01(l * 1.0)],
    mudTone: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.6), clamp01(l * 0.9)],
    tintA: [1.04, 1.02, 0.92], tintB: [0.86, 0.90, 0.84], tintC: [1.05, 1.03, 0.95],
    // r6: [0.62,0.63,0.72] (B > R) over the pale sourced sett sheet + blue sky
    // fill rendered every street as a bluish-white water channel in the
    // establishing shot — pull the carriageway DOWN to a neutral warm asphalt
    // grey (R >= B) so streets read paved, not flooded.
    // (rebalanced up from 0.445: the splat shader now darkens the sett sheet
    // itself — 0.72+0.22 pvar — so the two stacked went near-black)
    roadTint: [0.58, 0.565, 0.53],
    // street paving strength: the splat shader lays the cobble/sett layer
    // across the full carriageway at all distances (uRoadTex uniform)
    roadTexMix: 0.85,
    // r5: town-core ground reads packed dirt/rubble dust, not lawn
    // terrain_environment r3: 2.3 -> 1.7 — at 2.3 the wear channel painted
    // one continuous muddy noise smear between the blocks; the new courtyard
    // wear DECALS (props.ts) carry structured paths/yards instead
    townWear: 1.7,
  },

  vegetation: {
    species: ['poplar', 'oak', 'cypress'],
    clusterMix: [['poplar', 0.42], ['oak', 0.38], ['cypress', 0.20]],
    loneMix: [['poplar', 0.48], ['oak', 0.35], ['cypress', 0.17]],
    rimMix: [['poplar', 0.38], ['cypress', 0.34], ['oak', 0.28]],
    // map pass 2026-09-12: allotment and lane-edge trees so the town does not
    // sit on a bare lawn (establishing shot); hedges thicken below.
    clusterCount: 22,
    loneCount: 68,
    rimCount: 72, // r7: fuller rim forest under the serrated backdrop tree line
    grassDensity: 0.5,
    tuftTone: (h: number, s: number, l: number) => [0.185, clamp01(s * 0.7), clamp01(l * 0.92)],
    bushCount: 1.2, // r6: garden hedges/shrubs in the yards and block edges (map pass 2026-09-12: denser)
    bushSpecies: 'oak',
    parks: [ // the hill-park belts where town trees are allowed
      { x: -255, z: -170, r: 95 }, { x: 260, z: -190, r: 85 },
      { x: -80, z: 275, r: 80 }, { x: 250, z: 265, r: 70 },
    ],
  },

  props: {
    // regional-buildings lane: the Franconian town kit (maps/regional/franconian.ts)
    architecture: 'franconian',
    plan: PLAN, // consumed by blockFill for the block interiors
    destructibleBuildings: [
      'guardpost', 'checkpointhut', 'fieldhospital', 'transformershed', 'motorpool',
      'securityoffice', 'servicegarage', 'relaystation', 'corneroffice',
    ],
    // Mirror pairs across the spur's crest, and posts on the crest itself (equally far from both teams): a garage
    // yard in each valley suburb, the castle forecourt and the bypass gap.
    tacticalBeats: [
      { id: 'south-garage-yard', role: 'brawl', x: -246, z: -124, yawDeg: 0,
        structure: 'servicegarage', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
      { id: 'north-garage-yard', role: 'brawl', x: -216, z: 114, yawDeg: 180,
        structure: 'servicegarage', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 14 },
      { id: 'castle-forecourt', role: 'support', x: 112, z: 46, yawDeg: 270,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 } },
      { id: 'bypass-gap-post', role: 'scout', x: 320, z: 40, yawDeg: 270,
        structure: 'motorpool', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
    ],
    // The valley suburbs and the castle: authored lots outside the old town (the street rows own the town).
    plannedSites: [
      { structure: 'factory', x: 70, z: -258, yawDeg: 10 },
      { structure: 'rowhouse', x: -86, z: -264, yawDeg: 0 },
      { structure: 'rowhouse', x: -12, z: -264, yawDeg: 0 },
      { structure: 'cottage', x: -128, z: -212, yawDeg: 180 },
      { structure: 'depot', x: 50, z: 280, yawDeg: 190 },
      { structure: 'rowhouse', x: -94, z: 272, yawDeg: 180 },
      { structure: 'rowhouse', x: -20, z: 270, yawDeg: 180 },
      { structure: 'cottage', x: -136, z: 222, yawDeg: 0 },
      // the castle on the Burgberg: the keep, a second tower on the ring's south-east corner, the chapel by the keep (a
      // church's 23 m nave spreads past the plot law on the rock's crown)
      { structure: 'tower', x: 156, z: 12, yawDeg: 0 },
      { structure: 'tower', x: 166, z: -12, yawDeg: 18 },
      { structure: 'chapel', x: 145, z: 18, yawDeg: 96 },
      // the farmsteads on the castle rock's lower slopes, one in each valley
      { structure: 'barn', x: 128, z: -126, yawDeg: 10 },
      { structure: 'farmhouse', x: 152, z: -136, yawDeg: 10 },
      { structure: 'barn', x: 160, z: 114, yawDeg: 170 },
      { structure: 'farmhouse', x: 152, z: 136, yawDeg: 170 },
      { structure: 'ruin', x: 140, z: -4, yawDeg: 30 },
      // the town church on the market square's north side (the map-revival lane, 2026-10-06; wave 150 found the church
      // on bare ground): its tower and west door face the square, its front square to the apron's turned north edge
      // (yawDeg 6) and 4 m off the paving (the layout brief keeps every solid 3.5 m out of a road's core, and an apron is
      // a road); the nave runs back north off the crest's street rows
      { structure: 'church', x: -76, z: 52, yawDeg: 186 },
    ],
    // street frontage is built by CONTIGUOUS rowhouse strips (shared walls,
    // varied heights, collapsed slots spilling rubble) + kerbed pavements
    streetRows: true,
    curbs: true,
    monument: true,
    blockFill: true,
    tones: {
      // (the facades lane, 2026-10-08) the cream lime render the photo set gave the town's primary family, its mean kept
      // (hue 0.106, saturation 0.16, lightness 0.58) now the kit paints the render (franconian.ts surfaces.render);
      // (2026-10-09, mapQuality's city-tone bound: lightness <= 0.62 at a mid sample) its lightest mottles eased in over
      // a knee at 0.585, so a bright tone never washes out to white
      plaster: (h: number, s: number, l: number) => {
        const x = l * 1.26;
        return [0.106, clamp01(s * 0.55 + 0.11), clamp01(x < 0.585 ? x : 0.585 + (x - 0.585) * 0.3)];
      },
      // r3 (content_breadth): two more render families for the street walls —
      // the whole town recycled ONE white-plaster box ("kit-bash at mid
      // distance" critique). plaster2 = warm ochre-cream (Central European
      // lime render), plaster3 = muted grey-green (weathered distemper).
      // Consumed by the props.ts facade-variety patch (handoff r3); inert
      // until that lands.
      plaster2: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.45 + 0.14), clamp01(l * 0.84)],
      plaster3: (h: number, s: number, l: number) => [0.21, clamp01(s * 0.28 + 0.05), clamp01(l * 0.80)],
      // aged clay roofscape. r5: the old two-class split (red tiles vs hue-0.60
      // slate rows) striped every roof red/blue in wide shots — and even
      // neutral grey rows go blue under the sky fill. Keep the whole sheet in
      // one warm clay family: bright tile faces dusty red, dark rows deep
      // warm brown (row shadow), so roofs read tiled, not striped.
      roof: (h: number, s: number, l: number) => (l > 0.35
        ? [0.032, 0.30, clamp01(l * 0.72)]
        : [0.038, 0.24, clamp01(l * 0.55)]),
      stone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.6), clamp01(l * 0.95)],
      wood: null,
      straw: null,
    },
    ruinChance: 0.38, // r1: street-front collapse rate up (war-torn read)
    townCraters: true, // shell holes pock the streets/squares inside the rect
    // r1 (content_breadth): darker, slightly warm-grey rubble — the old pale
    // near-white smooth boulders read as "grey tent blobs" in the foreground
    // fields (critique); dropping the value keeps them below the grass tone
    rockTone: (h: number, s: number, l: number) => [0.085, 0.09, clamp01(l * 0.80)], // concrete rubble chunks
    wallStoneChance: 0.55,
    buildingLat: [9.5, 1.5], // tight, near-constant setback => street walls
    sideSkip: 0.04,
    spacingPad: 2,
    maxSpread: 2.4,
    // The surviving stretches of the town wall round the spur's back, following the ground outside the back lanes:
    // broken at the four gates (the Hauptstrasse's west and east gates, the trade road's north and south gates) and
    // shot out in two places (north of the lanes' west bend, south-east of the alleys); the castle's ring wall round
    // the Burgberg's top, open to its forecourt on the town side; and the field walls in the valleys, every one with
    // its mirror across the crest.
    wallRuns: [
      // the town wall: north side, west gate to east gate
      [-226, 18, -216, 50, -1], [-216, 50, -188, 80, 2], [-150, 96, -104, 104, 3], [-104, 104, -64, 101, -1],
      [-36, 100, 0, 94, 1], [0, 94, 34, 80, -1], [34, 80, 58, 56, 2], [58, 56, 68, 22, -1],
      // the town wall: south side, west gate to east gate
      [-226, -12, -218, -44, 1], [-218, -44, -196, -76, -1], [-196, -76, -156, -98, -1], [-156, -98, -104, -104, 2],
      [-104, -104, -66, -100, -1], [-38, -102, -2, -104, -1], [-2, -104, 34, -90, 3], [58, -64, 68, -26, 1],
      // the castle's ring wall on the Burgberg
      [178, 6, 170, 26, 1], [170, 26, 150, 33, -1], [150, 33, 132, 24, 2], [128, -4, 138, -20, -1],
      [138, -20, 160, -22, 1], [160, -22, 176, -12, -1], [176, -12, 178, 6, -1],
      // field walls in the valleys, mirrored across the crest
      [-250, -150, -190, -150, 2], [-250, 170, -190, 170, 2], [40, -150, 100, -150, 3], [40, 170, 100, 170, 3],
      [-420, -180, -360, -180, 1], [-420, 200, -360, 200, 1], [150, -250, 210, -250, 2], [150, 270, 210, 270, 2],
    ],
    // r6: fences on — split-rail runs break up the open outskirt fields
    well: true, hayCrates: false, fences: true, telegraph: true, carts: true, logs: false,
    // r1: fewer bare boulders (they read as blobs on lawn), more rubble piles
    // r7 terrain_environment: craters 88 -> 102, rubble 132 -> 152 — the
    // fought-over brief needs debris fields reading along the main streets
    // 2026-10-01: rubble 152 -> 64 — the street rubble (placeStreetRubble lays piles 4.5-16 m off a road) clogged the
    // old town's through-streets for hulls and the bot planner; the ruined rows still spill their own rubble
    haystacks: 0, rocks: 70, outcrops: 6, craters: 102, rubblePiles: 64,
    // r6 terrain_environment: street furniture + battle debris — lampposts
    // march the paved grid, anti-tank hedgehogs hold intersections/approaches
    // and two more road wrecks ("urban streets missing furniture, wrecks and
    // debris variety" critique)
    lampposts: true, hedgehogs: 8, // 2026-10-01: 16 -> 8, roadblocks at the gates rather than every crossing
    // DESTRUCTIBLES r1: modern hulks in the streets (baked roster tanks) —
    // the shelled-town read finally includes the armor that died taking it
    // the map-vehicles lane (2026-10-06, the period ruling): the inner-German border of the 1980s: the Bundeswehr's
    // Leopards and Marder, the NVA's T-72M and BMP, an M1A1
    tankWrecks: { era: 'cold-war', count: 6, debris: true, ids: ['leo2a4', 't72m1_jaguar', 'marder1a3', 'bmp2', 'leo1a5', 'm1a1'] },
    sandbagLines: 12,
    // world-dressing r1: brick boundary walls w/ coping; street inhabitants —
    // a market ring on the central square, oil drums + pallet/crate work
    // clutter down the alleys, benches on the pavements (all destructible;
    // the lamppost systems above now ride the topple layer too)
    wallStyle: 'brick',
    inhabit: {
      stalls: 3, benches: 5, coreClutter: 12,
      drums: 12,
      handcarts: 1, carts: 2,
      roadFence: 'fenceplank',
      // DESTRUCTIBLES r1: abandoned vehicles + fuel points down the blocks
      trucks: 3, jeeps: 2, drumClusters: 3, camps: 1,
      modernClutter: { barrier: 8, roadsign: 7, cone: 10, transformer: 5, cablespool: 5 },
    },
  },


  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Franconian Jura. The castle
  // rock shows its bedded limestone in crags round the Burgberg's flanks; a carved Bildstock stands at the farm
  // crossing on the west road and another where the farm track leaves the east valley road.
  scenery: {
    rocks: [
      { form: 'outcrop', geology: 'limestone', x: 176, z: -20, radius: 6, height: 6.5, name: 'the castle rock\'s south crag' },
      { form: 'outcrop', geology: 'limestone', x: 186, z: 32, radius: 5, height: 5.5, name: 'the castle rock\'s east crag' },
      { form: 'outcrop', geology: 'limestone', x: 132, z: -44, radius: 4.5, height: 4.5, name: 'the castle rock\'s west crag' },
    ],
    landmarks: [
      { kind: 'bildstock', x: -362, z: 66, yawDeg: 135, name: 'the shrine at the farm crossing' },
      { kind: 'bildstock', x: 248, z: -226, yawDeg: 0, name: 'the shrine on the east valley road' },
    ],
  },
  horizon: {
    // r7: treeline 0.5 -> 0.92 — kills the bald-ramp band above the forest
    // cutoff (see verdant.js note)
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): Upper Franconia's Frankenwald:
    // a forested plateau cut by valleys, no peaks
    baseHex: 0x525c50, amp: 0.7, style: 'escarpment', treeline: 0.92, panorama: { regional: 'upland' },
    forestHex: 0x323f30, haze: 1.0,
  },

  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'altocumulus', coverage: 0.55, cirrus: 0.3, contrails: 0.6, contrailAge: 0.6, nightGlow: 0.8, nightGlowHex: 0xffb46a },
  sky: {
    sunElevationDeg: 36, sunAzimuthDeg: 115,
    // lighting_post r5: turbidity 5.5->4.0, mie 0.007->0.005, fog 0.00092->
    // 0.00078 — finishes the engine-side haze-cap/far-shadow work; the urban
    // horizon share read as bleached white.
    turbidity: 4.0, rayleigh: 1.4, mieCoefficient: 0.005, mieDirectionalG: 0.8,
    // lighting_post r3 (round 3): 0.00078 -> 0.00062 — milky midfield; the
    // engine's FOG_EXTINCTION_SHARE split keeps hue in the aerial pass and
    // buildings at 300 m keep local contrast.
    fogDensity: 0.00062, fogTintHex: 0x8d99a8, fogMix: 0.62, envIntensity: 0.2,
    cloudOpacity: 0.85, cloudOpacity2: 0.5, cloudTintHex: 0xe8e4dc,
    sunIntensity: 4.2, sunColorHex: 0xffedd6, hemiIntensity: 0.36,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x736f69 },
  },

  minimap: {
    base: [98, 104, 90], hard: [92, 92, 98], soft: [70, 84, 72],
    forest: 'rgba(48,72,40,0.85)', forestStroke: 'rgba(30,46,26,0.9)',
    water: 'rgba(70,88,90,0.7)', waterStroke: 'rgba(40,54,56,0.8)',
    roadCasing: 'rgba(34,34,40,0.9)', roadFill: 'rgba(138,138,142,0.95)',
    buildingFill: '#d9d2c4',
  },

  // r9: camera pulled ~30 m closer and 8 m higher — from z=-238 nearly half
  // the establishing frame was the empty grass approach field; the town brief
  // is "street grid, rowhouses, rubble", so the grid should fill the frame
  // from the south valley up the trade road to the market square, the castle rock on the right
  shot: { pos: [-110, 40, -236], look: [-30, 8, 20] },
} satisfies import('./contracts.ts').MapCompositionConfig;
