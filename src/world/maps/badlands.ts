// src/world/maps/badlands.ts — Redrock Divide, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The canyon (src/world/redrockCanyon.ts: its oblique axis, unequal walls, side ravines and closed heads), the outpost,
// the five tracks, the palette, sky, vegetation, name and id are the map's identity and stay; the battlefield on the
// canyon floor is new. The old floor was one open lane 420 m wide. Its sightlines ran long (19 % of the blocked rays
// at 300 m or more), the middle third had 24 % cover, and three solid props stood in the tracks. Alpha deployed in the
// south-west corner of the mouth, and the 2v2 pacing receipt's seed 32002 ended in 105 s.
//
// Reference: Wadi Rum in southern Jordan: a broad sand valley between sheer sandstone jebels, with domed inselbergs
// standing free on the valley floor, sand ramps banked against the walls, and siqs cutting through to the next valley.
//
// The story on the ground: the outpost stands at the centre of the floor where the valley track crosses it, a walled
// depot round a square. Two tracks run along the wall toes, and two cross tracks leave through the side ravines.
// Inselbergs stand on the floor. A gate dome in front of each deployment hides it from the other, and a pair of domes
// on each side of the outpost stands between the tracks, so the floor splits into a west lane, the outpost lane and an
// east lane. Dune ridges and sand ramps give hull-down ground in the open. The floor's layout turns through 180 degrees
// about the outpost (8, 0): alpha deploys in the south mouth, bravo in the north mouth, and every inselberg, ridge,
// strongpoint, floor track and objective has its counterpart. The canyon walls and their ravines keep their own shapes.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// The floor's layout turns through 180 degrees about the outpost (8, 0): every feature has its counterpart.
const pair = <T extends { x: number; z: number }>(form: T): T[] => [form, { ...form, x: 16 - form.x, z: -form.z }];
// a bar's counterpart turns with it, so a tapered ramp's high end still meets its own wall
const pairBar = <T extends { x: number; z: number; yawDeg: number }>(form: T): T[] =>
  [form, { ...form, x: 16 - form.x, z: -form.z, yawDeg: form.yawDeg + 180 }];
// The scenery lane (2026-10-03): Redrock's scenery stone in the terrain's own sandstone (sRGB HSL; the terrain's rock
// reads hue 0.03-0.05, saturation 0.22, lightness 0.5-0.57 lit): the domes' beds, the ledges and the cairns read as one
// rock with the walls they stand on, not as darker, redder cladding.
const WADI_RUM_STONE = [0.045, 0.32, 0.52] as const;

export default {
  id: 'badlands',
  name: 'Redrock Divide',
  blurb: 'An eroded red-rock canyon shelters a fortified desert logistics outpost',
  terrain: {
    // One regional drainage system defines the playable silhouette. Original
    // seeded detail is subordinate; random mesas and a closed square rim are off.
    redrockCanyon: true, hillScale: 0.24, microScale: 0.40, rimH: 0,
    dunes: { amp: 0.7 }, mesas: null, marshes: [],
    roads: { paths: [
      // The west and east tracks along the wall toes, the valley track through the outpost and the floor courses of
      // the two cross tracks are each other's rotation about the outpost; the cross tracks leave through the ravines.
      [[-432, -452], [-254, -292], [-206, -92], [-182, 112], [-190, 306], [-210, 470]],
      [[-188, -466], [-104, -306], [-28, -150], [8, 0], [44, 150], [120, 306], [204, 466]],
      [[226, -470], [206, -306], [198, -112], [222, 92], [270, 292], [448, 452]],
      [[-362, 182], [-240, 170], [-150, 236], [-2, 202], [148, 232], [272, 194]],
      [[-286, -214], [-132, -232], [18, -202], [166, -244], [304, -198]],
    ] },
    // The outpost's square and a vehicle park in each flank lane, on the line of equal distance between the
    // deployments: level aprons the zone-control placement seats its 30 m discs on.
    // (the Redrock lane, 2026-10-07: graded sand drifted back over in patches, not three ruled brown rectangles)
    // (round 10, the gauntlet's wave 270 at the outpost: the square's patches "a large dark-brown blotch ... a pasted stain
    // or fake shadow" — the packed earth fainter and its patches softer: three fifths of the apron, a third mottled)
    hardstands: [
      // (round 11, the gauntlet's wave 282: "a huge empty sand lot with a large blotchy red stain" — the square's packed
      // earth a trace, unmottled)
      { x: 8, z: 0, width: 60, length: 60, yawDeg: 0, grade: 0, paint: { cover: 0.25, mottle: 0 } },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): tilted 7 % down to the east with its ground
      { x: -122, z: 21, width: 60, length: 60, yawDeg: -87, level: 6.2, grade: 0.07, paint: { cover: 0.6, mottle: 0.35 } },
      { x: 138, z: -21, width: 60, length: 60, yawDeg: 0, grade: 0, paint: { cover: 0.6, mottle: 0.35 } },
    ],
    village: { x0: -96, x1: 112, z0: -86, z1: 106, cx: 8, cz: 0, feather: 40, flatten: 0.76, relief: 0.16 },
    landforms: [
      // The inselbergs: sandstone jebels on the floor, each a main massif and a lower lobe (landformGeology.ts
      // 'inselberg' with a rim, after gauntlet wave 16's "rounded loaf-shaped mounds": a nearly level cap broken into
      // rounded bosses, a sheer fluted wall over most of the height whose foot wanders round the massif, deep clefts
      // biting back into the cap's edge, talus fans spreading from the clefts' mouths over a concave apron, knobbly
      // rock, and a boulder apron of fallen blocks only at the foot), and a sand ramp banked against one flank. The gate pair screens each deployment from
      // the other, 26 m further out than the batch-1 domes so that Frontline Assault's third sector (85 % of the way)
      // lies on the floor in front of the north gate, not on its face; the lane pairs stand between the tracks on the
      // slices at 35 and 65 % of the way, where they split the floor into three lanes.
      ...([
        [-40, -318, 36, 30, 26, -8, -326, 22, 18, null], // gate (no ramp: the frontline's sector lines run past it)
        [-118, -128, 34, 40, 24, -140, -98, 20, 24, -70], // west lane, its ramp to the south
        [96, -112, 34, 40, 24, 118, -140, 20, 24, 110], // east lane, its ramp to the north
      ] as [number, number, number, number, number, number, number, number, number, number | null][])
        .flatMap(([x, z, rx, rz, height, lx, lz, lrx, lrz, rampDeg]) => {
        const ramp = (rampDeg ?? 0) * Math.PI / 180, reach = Math.max(rx, rz) * 0.55 + 34;
        // (the Redrock lane, 2026-10-07, owner: "redrock is really rough"; the domes read as cakes with spikes) the massif
        // and its lobe stand as one rock (`union`: their heights' maximum — their sum stood a horn where the lobe's cap met
        // the massif's wall), the cap breaks into beehive domes (more, taller bosses) where the knobbly relief (rough 1.3)
        // read as lumps, and the fans spread a short apron where 2.6 m spokes radiated from every rill
        // (round 9, the gauntlet's wave 261: "melted-wax lumps with scalloped skirts", "a granular pitted surface that reads
        // as Martian regolith"): the knobbly relief nearly off (the pits), the clefts narrower and deeper — joints dividing
        // the rock into blocks — and the flutes finer; the cap crowned (it falls a fifth of the height to its edge) under a
        // few broad bosses, so the top is a cluster of domes and not a drum's lid; and the foot steadier with short fans,
        // so the skirt is a talus apron and not a frill
        // (round 10, the gauntlet's wave 270: "melted-candle blocks with identical rounded drip grooves", "termite mounds":
        // the flutes are joints now — V-cut, irregular, each its own depth — and the wall stands in two or three bedding
        // tiers, so a dome stands on a jointed, ledged cliff base)
        return [
          ...pair({ kind: 'knoll', x, z, rx, rz, height, corridorScale: 1, union: true, geology: { profile: 'inselberg' as const,
            outline: 0.16, foot: 0.68, footVary: 0.08, apron: 0.22, rim: 0.8, capDrop: 0.2,
            bosses: { count: 4, heightM: 6, radius: 0.42 },
            // (round 11, the gauntlet's wave 282: "earth heaps", "Play-Doh lumps with painted squiggle cracks", "a soft
            // rounded pyramid": the beehive banding over cap and wall, four tiers, the joints cut as clefts into the cap)
            // (and "a fine crumbly speckle", "orange-peel crust": the surface's roughness a third)
            flutes: { count: 15, depth: 0.3, joints: true }, tiers: { count: 4, ledge: 0.32 }, beehive: { bands: 8, strength: 0.8 },
            rough: 0.02, boulders: 24,
            gullies: { count: 8, depthM: 6, width: 0.2 }, fans: { reach: 0.12, heightM: 0.6 } } }),
          ...pair({ kind: 'knoll', x: lx, z: lz, rx: lrx, rz: lrz, height: Math.round(height * 0.65), corridorScale: 1, union: true,
            geology: { profile: 'inselberg' as const, outline: 0.18, foot: 0.64, footVary: 0.09, apron: 0.24, rim: 0.78,
              capDrop: 0.18, bosses: { count: 2, heightM: 4, radius: 0.45 },
              flutes: { count: 11, depth: 0.3, joints: true }, tiers: { count: 3, ledge: 0.32 }, beehive: { bands: 6, strength: 0.8 },
              rough: 0.02, boulders: 12,
              gullies: { count: 5, depthM: 4, width: 0.2 }, fans: { reach: 0.12, heightM: 0.5 } } }),
          // the sand ramp: wind-blown sand banked against the wall, falling away from it
          ...(rampDeg === null ? [] : pairBar({ kind: 'ridge', x: x + Math.cos(ramp) * reach, z: z + Math.sin(ramp) * reach,
            length: 72, width: 26, height: 7, yawDeg: rampDeg, geology: { outline: 0.22, taper: 0.92, rough: 0.25 } })),
        ];
      }),
      // Sand ramps banked against the wall toes and dune ridges across the floor: hull-down ground in the open
      ...[[-150, -300, 120, 30], [-170, 20, 110, 80], [-20, -40, 90, 40], [110, -310, 100, 20],
        [-196, -130, 80, 10], [150, -330, 90, 60],
      ].flatMap(([x, z, length, yawDeg]) => pair({ kind: 'ridge', x, z, length, width: 34, height: 4.2, yawDeg })),
    ],
  },
  spawns: {
    // Alpha deploys in the south mouth behind its gate dome; bravo's seven pads are an arc in the north mouth behind
    // the other, its centroid the rotation of alpha's pad about the outpost. 795 m between the anchors.
    player: { x: -56, z: -392 },
    enemies: [
      { x: 71, z: 394 }, { x: 21, z: 384 }, { x: 123, z: 384 }, { x: -25, z: 366 },
      { x: 169, z: 366 }, { x: 47, z: 426 }, { x: 99, z: 426 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.075, 0.39, clamp01(0.19 + l * 0.78)],
    dirtTone: (h: number, s: number, l: number) => [0.055, 0.43, clamp01(0.24 + l * 0.48)],
    // Broad weathered beds, not high-contrast repeated marker stripes.
    // (the Redrock lane, 2026-10-07, owner: "redrock is really rough"; the walls, domes and far jebels read mauve, the
    // sandstone tile desaturated to a fifth) Wadi Rum's sandstone is red-orange: the tile keeps its saturation and more
    sandstone: true, rockTone: (h: number, s: number, l: number) => [0.036, clamp01(s * 1.35), clamp01(0.31 + (l - 0.45) * 0.38)],
    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],
    // (ground lane, wave 62: "smooth, plaster-like … identical wavy dark squiggles … a stamped pattern rather than
    // sandstone" — the squiggles were the tile's marker beds and partings, repeating every 6.45 m up each wall) the
    // bedding is the material's, at the wall's scale: a few thick beds of unequal tone, rust beds 2–5 m thick, joint
    // blocks stepping their weathering along the face and varnish under the ledges (strata 0.12: six tenths of the
    // joints, as Copper Mesa's), and the tile keeps its grain and broad beds without the stamped lines
    // (the Redrock lane: the walls are sheer now, so the beds, joints and varnish the material draws on cliffs show — at the
    // quiet wash's ceiling, 0.13, with the joints and varnish raised by wallWeather below)
    // (round 11, the gauntlet's wave 282: the tracks "crisp graded bands, not braided sand tracks" — nearer the sand's tone)
    roadTint: [0.84, 0.66, 0.55], strata: 0.13, sandstoneMarkers: 0, sandMacro: 0.9,
    // (round 10, the gauntlet's wave 270: "swirly red blotches like painted decals", "a large dark-brown pasted stain" at
    // the outpost, "a featureless sand plane with no ripples", the road "a soft smear with no ruts") the worn sand
    // patches a third as strong and the outpost's wear a third, both in a sandier soil; the near ripples on the loose sand
    // sheets at a working strength (the dune bedforms stay at the quiet wash's 0.06); the tracks' wheel lanes worn deep
    // and dark, gravel on their crowns
    wornDirtStrength: 0.3, townWear: 0.35, soilTint: [1.10, 1.03, 0.94], rippleNear: 0.26, roadRuts: [2.6, 0.16, 1.0],
    // Wadi Rum's two formations: the Umm Ishrin's red-brown cliffs, and over them the Ordovician Disi sandstone, pale cream,
    // weathered into the domes and beehives on the jebels' tops (the far jebels draw the same, horizonPanorama.ts v3b).
    // (The Redrock lane, 2026-10-07: the contact at y 98 — the east wall's highest beehives and the canyon heads' upper
    // storeys a warm cream, the walls and the floor's inselbergs red-brown below it; the ground lane's first pass had the
    // order inverted, a pale band at every foot that read as concrete)
    // (round 9, the gauntlet's wave 261: the heads' upper slopes "grey-green like grassland" — the cream went green under the
    // sky's blue at a kilometre: a warmer, pinker cream, laid on less thickly)
    // (round 10, the gauntlet's wave 270: "no cream caprock" — at 98 m only the heads reached the Disi: the contact comes
    // down to 56 m, so the high walls' upper faces and every dome on them are the pale sandstone, cream to near white,
    // over the red cliffs; the floor's inselbergs stand wholly in the red)
    // (round 11, the gauntlet's wave 282: "a hard horizontal paint-line between a pale grey cap and a saturated red
    // body", "a saturated brick hue that reads as laterite mud", "crushed in shadow" — the red lighter and less
    // saturated over a third of the rock, the pale a warmer cream; the contact ragged over 12 m with a 32 m wander of its
    // own, over a 5 m band; terrain.ts hangs pale drips and dark varnish below it)
    formation: { atFrac: 0.9, atY: 56, wobbleM: 12, lowerTint: [1.5, 1.04, 0.82, 0.3], upperTint: [1.9, 1.62, 1.32, 0.74],
      edgeM: 5 },
    // (the Redrock lane: the domes' caps, the walls' benches and the jebels' tops are bare rock — the floor, the dunes and
    // the ramps lie below 13 m, the Disi bench at 10-16 m, the domes' caps at 20-38 m)
    caprockY: [13, 16],
    // (the Redrock lane: the faces keep their joints and varnish under the map's own sun, a head-on light included)
    // (round 9, the gauntlet's wave 261: "dark rectangular blotches stamped over the wall face", "a hard diagonal light-dark
    // seam" — the joint blocks' 9 x 5 m tone steps: none; the bedding is relief now, jebelFace below)
    // (round 11, the gauntlet's wave 282: "airbrushed dark smudges" — the old weathering streaks off: the varnish is
    // jebelFace's, from the contact down)
    wallWeather: [0, 0],
    // Wadi Rum's faces: vertical flutes, the honeycomb low on the near faces, desert varnish down them (terrain.ts uJebelFace)
    jebelFace: [1, 1, 1],
    // An alluvial wash has faint wind-scoured patches, not floor-wide dunes. (The Redrock lane, 2026-10-07, owner: "redrock
    // is really rough"; the floor's mid-ground read as leopard spots: the mid-relief dapple's 59 m octave lays 1-5 m bump
    // spots that a 30-degree sun turns into a dark blotch field — uMidRelief 0 cleared it in the PR's own renderer,
    // uSandMacro 0 changed nothing. A trace of its broad roll stays; the ripples at the quiet wash's ceiling, 0.06.)
    rippleAmp: 0.06, midRelief: 0.12, midReliefFar: 780,
  },
  vegetation: {
    species: ['acacia', 'cedar', 'oak', 'palm'], clusterMix: [['acacia', 0.48], ['oak', 0.30], ['cedar', 0.17], ['palm', 0.05]],
    loneMix: [['acacia', 0.54], ['oak', 0.28], ['cedar', 0.14], ['palm', 0.04]], rimMix: [['cedar', 0.45], ['acacia', 0.35], ['oak', 0.20]],
    // Trees round 2b (2026-10-03, the gauntlet's wave 15: "lush green groves on Wadi Rum"): Wadi Rum's floor carries a
    // few wide-spaced acacias in the wadi beds and hollows, not groves; six open groves (vegetation.ts treeBiomeArid
    // seats them in the low ground), twenty lone trees in the beds, a thin sward on the sand. Was 24 / 46 / 0.38.
    clusterCount: 6, loneCount: 20, rimCount: 30, grassDensity: 0.08,
    clusterScrub: 1.5, bushCount: 0.6, bushSpecies: 'oak',
    // (round 10, the gauntlet's wave 270: the white broom's sprays "saguaro-like cactus", the acacias "lush green") the
    // wadi's trees and scrub in Acacia raddiana's and Retama raetam's dust-dulled silver-green: a fifth of a leaf's
    // saturation, paler, the card tint all but neutral (the broadleaf slots and the shrubs read the oak palette, the
    // cedar slot the pine's); the scrub a fifth sparser
    palettes: {
      oak: { cardHue: 0.19, cardSat: 0.035, texTone: (h: number, s: number, l: number) => [0.2, clamp01(s * 0.17), clamp01(l * 1.18 + 0.05)] },
      pine: { cardHue: 0.19, cardSat: 0.035, texTone: (h: number, s: number, l: number) => [0.2, clamp01(s * 0.17), clamp01(l * 1.18 + 0.05)] },
    },
    // (round 10: the tussocks were "tall, flat cross-card blades far out of scale" in the low sand view — a dry tuft stands
    // half as tall again as a green one, and every tuft here is dry; the wadi's Panicum and Stipagrostis tussocks are knee
    // high at most)
    tuftHeight: 0.5,
    // the palms grew at two springs under the lane inselbergs' west and east feet (a palm drawn anywhere else as an
    // acacia); (round 10, the gauntlet's wave 270: "a palm grows through a lush green acacia on open sand" — no spring
    // shows on the wadi's floor, and Wadi Rum's are fig and reed seeps on the cliffs) no palm site now: every palm drawn
    // grows as an acacia, and a stand a palm leads seats in the low ground as the others do
    palmSites: [], palmFallback: 'acacia',
    // (the Redrock lane, 2026-10-07: no tree on a dome's cap or a jebel's top — the floor, the ramps and the dunes lie
    // under 15 m, the domes' caps over 22 m)
    treeCeilingY: 16,
    // (the Redrock lane: each tree's, sapling's and bush's draws its own, so the walls and domes refusing a seat move no
    // other tree — the shared stream had turned the halves' tree cover 100/102 into 136/87; and the halves either side of
    // the outpost hold the same cover, as the floor's strongpoints, tracks and springs turn about it — six or seven open
    // groves fall three to one side as often as not, and the swap test's north share followed the trees)
    keyedPlacement: true,
    coverHalvesAbout: { x: 8, z: 0 },
    // ground lane (2026-10-03, the gauntlet's wave 4: "saturated green grass cards" on the red floor): the wadi's tufts
    // are cured straw, as Sirocco's are. Trees round 4 (2026-10-04, the gauntlet's wave 50: "olive reed tufts", "flat,
    // uniformly saturated billboards"): Wadi Rum's tussocks are sun-bleached — a pale buff, a third of the straw's
    // saturation left in the card and half in the tint, lighter
    // (the Redrock lane, 2026-10-07: those read as white plastic spikes on the orange sand — the tussocks are a dry buff
    // straw, darker than the sand they stand in)
    grassTexTone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.42), clamp01(l * 0.62 + 0.14)],
    tuftTone: (h: number, s: number, l: number) => [0.095, 0.30, clamp01(l * 0.45 + 0.22)],
    // (the Redrock lane: the floor's stones were an even strew of round dark lentils under every view — the wadi's sand is
    // clean between its gravel patches, so a third of the strew; the stones keep the sandstone's own red)
    // (round 10, the gauntlet's wave 270 at the outpost: "a dead-flat sand plane dotted with identical grey pebbles" — half
    // that again)
    litter: { density: 0.2, clods: 0.25, splinters: 0, stoneTint: [0.20, 0.115, 0.075] },
  },
  props: {
    // regional-buildings lane: the Wadi Rum outpost kit (maps/regional/wadirum.ts)
    architecture: 'wadirum',
    // (round 10, the gauntlet's wave 270: "a handful of flat-textured boxes, sheds and a scaffold tower over an open sand
    // lot ... no street, square or stone houses" — four steel stores, lock-ups, a lorry shelter, a water tower on its legs
    // and a second fort stood where the village should: the outpost is Rum village's, the patrol's fort and its store,
    // the mosque, the souq's shop rows and the block houses along the valley track, a ruin or two; the houses' own black
    // tanks on their roofs)
    plan: ['caravanserai', 'adobe', 'marketRow', 'adobe', 'adobe', 'minaret', 'adobe', 'marketRow', 'ruin', 'adobe',
      'adobe', 'adobe', 'adobe', 'marketRow', 'adobe', 'depot', 'adobe', 'adobe', 'ruin', 'adobe', 'marketRow',
      'adobe', 'adobe', 'adobe'],
    destructibleBuildings: ['deserttent', 'motorpool', 'quonsethut', 'checkpointhut'],
    // (the scenery lane, b16; gauntlet wave 121 on the steel checkpoint hut, "a jarring modern blue shed") the fuel points'
    // and the scattered checkpoints are desert posts of plastered mud brick (maps/regional/ksarGate.ts), same footprint
    // (round 9, the gauntlet's wave 261: the field works' pillbox, "an untextured grey box ... a flat black rectangle for a
    // door", is the desert post's sangar: stone under a mud render, sandbags on its roof, slits under timber lintels)
    // (round 9, the gauntlet's wave 261 on the fuel point's ksar gate post, "a plain tan cube with a door": the fuel points'
    // and scattered posts are the Wadi Rum kit's own fuel and water post now, structureKit makeWadiRumFuelPost)
    // (round 10, the gauntlet's wave 270: the barrack's "vertical-stripe texture with tiny black windows", the post "a plain
    // panelled box" — the light families' timber print — and the camp tent "a plain box": the barrack and the post on the
    // map's plaster, a stone core under a broken render, and the desert and camp tents the Bedouin's goat-hair bayt
    // al-sha'ar, maps/regional/wadiRumPosts.ts)
    // (round 11, the gauntlet's wave 282: "a blue-roofed shelter" — the motor pools the Desert Patrol's vehicle shade)
    structureVariants: { bunker: 'sangar', quonsethut: 'rumbarrack', checkpointhut: 'rumpost', motorpool: 'rumshed',
      deserttent: 'bedouintent', tent: 'bedouincamp' },
    // Three strongpoint pairs, each the other's rotation about the outpost: a cistern yard in each flank lane, a
    // lookout in front of the outpost on each side, and a fuel point by each deployment's flank track.
    tacticalBeats: [
      { id: 'west-lane-cistern', role: 'brawl', x: -165, z: -60, yawDeg: 90,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.5 }, wreck: true, wreckOffsetX: -16 },
      { id: 'east-lane-cistern', role: 'brawl', x: 181, z: 60, yawDeg: 270,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.5 }, wreck: true, wreckOffsetX: 16 },
      { id: 'south-butte-lookout', role: 'scout', x: 0, z: -160, yawDeg: 10,
        structure: 'deserttent', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'north-butte-lookout', role: 'scout', x: 16, z: 160, yawDeg: 190,
        structure: 'deserttent', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'southwest-fuel-point', role: 'support', x: -180, z: -250, yawDeg: 30,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: 15 },
      { id: 'northeast-fuel-point', role: 'support', x: 196, z: 250, yawDeg: 210,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: -15 },
    ],
    blockFill: true,
    wallStyle: 'adobe', wallStoneChance: 0.12, buildingLat: [11, 6], sideSkip: 0.1,
    // The outpost's perimeter walls at its four corners, open where the tracks come in.
    wallRuns: [
      [-96, -86, -40, -86, 3], [-96, -86, -96, -30, 3], [56, 86, 112, 86, 3], [112, 30, 112, 86, 3],
      [60, -86, 112, -86, 2], [112, -86, 112, -40, 2], [-44, 86, -96, 86, 2], [-96, 40, -96, 86, 2],
    ],
    well: true, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 264, outcrops: 58, craters: 74, rubblePiles: 22,
    // (the talus law, landformGeology.ts restsOnTalus, began here: gauntlet wave 48 saw "two low-poly orange boulders
    // hanging on its face" in all four of its Redrock frames; 278 of the map's 931 boulders hung on a wall, a ledge's lip
    // or a narrow bench. The law is every map's default since 2026-10-04: rockTalusDeg names another angle)
    hedgehogs: 22, sandbagLines: 24,
    // (the Redrock lane, 2026-10-07: the fallen blocks are the walls' red-brown sandstone, where the lithology's base drew a
    // grey-pink — "pillows" against the red cliffs)
    rockTone: (h: number, s: number, l: number) => [0.036, 0.40, clamp01(0.33 + (l - 0.3) * 0.8)],
    // (the Redrock lane, 2026-10-07: a pillbox stood in the west spring's palms, three trunks through its roof)
    pillboxClearOfTrees: true,
    // (round 9, the gauntlet's wave 261: "smooth red egg-shaped boulders on stamped red sand blotches" — the boulders lie
    // on the wadi's sand, so their skirt is the sand's tone, a shade darker where it banks against the stone)
    rockSoilTone: (h: number, s: number, l: number) => [0.075, 0.39, clamp01(0.15 + l * 0.74)],
    // the map-vehicles lane (2026-10-06, the period ruling): Jordan: the Al-Hussein (Challenger 1), the M60A3, the
    // Khalid's Chieftain and the Tariq's Centurion
    tankWrecks: { era: 'cold-war', count: 7, debris: true, ids: ['challenger1', 'm60a3', 'chieftain5', 'centurion5'] },
    inhabit: {
      stalls: 4, benches: 2, coreClutter: 26, drums: 12, pots: 7,
      trucks: 7, jeeps: 5, drumClusters: 8, camps: 5, modernClutter: 28,
      roadFence: 'fencerail', yardFence: 'fencewattle',
      // (round 11e, the gauntlet's waves 298b and 314: "a giant blue bottle" in the south ravine's foreground, "tiny dark
      // pill-shaped props on the sand read as chess pieces" — the dry maps' loose mix stood gas bottles, cones and bins
      // alone on the open sand by every track) the Desert Patrol's tracks carry jerry cans, a drum, a lost wheel, a pail
      looseKinds: ['jerrycan', 'drum', 'loosewheel', 'jerrycan', 'bucket', 'loosewheel'],
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): Wadi Rum's sandstone. Bedded
  // ledges, scree and the odd pedestal rock break out round the foot of every inselberg; a mushroom rock (a hoodoo,
  // its cap on a wind-cut pedestal) stands in the open floor of each mouth; a rujm, the Bedouin cairn, marks each cross
  // track where it leaves for its ravine. Turned through 180 degrees about the outpost like the rest of the floor.
  scenery: {
    // (the ledges keep to the talus round each dome, the talus law's default 35 degrees: eight of their 30 formations stood
    // on a wall or its lip and each field draws its next candidate instead; the mountains lane, 2026-10-04, wave 48)
    // (the bedrock skin on the inselbergs is parked: wave 16's critics read a skin on the jebels' smooth domes as
    // masonry, "a ziggurat"; the domes' shape is the landform's — world/sceneryRocks.ts buildBedrock stays, unplaced)
    // (round 9, the gauntlet's wave 261: "the mushroom hoodoo is a pale slab on a red stalk", "a flat box in a different
    // colour and material from the red rock ... a pasted prop": the hoodoos' hard caps read as table tops — each mouth's
    // mushroom rock is a bedded outcrop of the walls' own sandstone, the same cover on the same seat, and the fields round
    // the domes break out in ledges and scree only)
    rocks: [
      { form: 'outcrop', geology: 'sandstone', tone: WADI_RUM_STONE, x: 70, z: -330, radius: 3.4, height: 7, yawDeg: 30, name: 'the south pillar rock' },
      { form: 'outcrop', geology: 'sandstone', tone: WADI_RUM_STONE, x: -54, z: 330, radius: 3.4, height: 7, yawDeg: 210, name: 'the north pillar rock' },
    ],
    rockFields: [
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: -40, z: -318, radius: 58, count: 8, slopeBias: 0.85, size: [1.6, 5.5], forms: [['outcrop', 0.6], ['scree', 0.4]], leanUnder: 3, name: 'the ledges round the south gate dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: 56, z: 318, radius: 58, count: 8, slopeBias: 0.85, size: [1.6, 5.5], forms: [['outcrop', 0.6], ['scree', 0.4]], leanUnder: 3, name: 'the ledges round the north gate dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: -118, z: -128, radius: 58, count: 8, slopeBias: 0.85, size: [1.6, 5.5], forms: [['outcrop', 0.6], ['scree', 0.4]], leanUnder: 3, name: 'the ledges round the south-west lane dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: 134, z: 128, radius: 58, count: 8, slopeBias: 0.85, size: [1.6, 5.5], forms: [['outcrop', 0.6], ['scree', 0.4]], leanUnder: 3, name: 'the ledges round the north-east lane dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: 96, z: -112, radius: 58, count: 8, slopeBias: 0.85, size: [1.6, 5.5], forms: [['outcrop', 0.6], ['scree', 0.4]], leanUnder: 3, name: 'the ledges round the south-east lane dome' },
      { geology: 'sandstone', tone: WADI_RUM_STONE, x: -80, z: 112, radius: 58, count: 8, slopeBias: 0.85, size: [1.6, 5.5], forms: [['outcrop', 0.6], ['scree', 0.4]], leanUnder: 3, name: 'the ledges round the north-west lane dome' },
      // (round 11, the gauntlet's wave 282: "no fallen blocks or talus at its toe" — seven blocks a field, 1.5-7 m; the domes'
      // ledge fields eight, down to 1.6 m)
      // (round 11e, the r11d cost hold: chase GPU +1.0 ms over round 10 with tris +3 % — the fields' stones under 3 m take
      // the phones' facets (leanUnder), the big blocks keep theirs)
      // (round 10, the gauntlet's wave 270: the walls meet the plain "with no talus apron" — fallen blocks of the bedded
      // sandstone on the talus at four places along each wall, the east wall's and their turns about the outpost on the
      // west, 2.5-7 m stones and scree, kept to the talus by the field's own 35 degree law)
      ...[[257, -320], [260, -50], [251, 50], [348, 320]].flatMap(([x, z]) => pair({ geology: 'sandstone' as const, tone: WADI_RUM_STONE,
        x, z, radius: 26, count: 7, slopeBias: 0.9, size: [1.5, 7] as [number, number], leanUnder: 3,
        forms: [['outcrop', 0.55], ['scree', 0.45]] as [string, number][], name: 'the talus under the wall' })),
    ],
    landmarks: [
      { kind: 'cairn', x: -270, z: -228, scale: 1.6, height: 1.6, geology: 'sandstone', tone: WADI_RUM_STONE, name: 'the rujm at the south ravine' },
      { kind: 'cairn', x: 286, z: 228, scale: 1.6, height: 1.6, geology: 'sandstone', tone: WADI_RUM_STONE, name: 'the rujm at the north ravine' },
    ],
  },
  horizon: {
    // Round 29 (owner 2026-09-20, "see where the texture just stops"): treeline 0.06 let the vista paint every
    // outland surface under 8 m — the canyon-mouth floors past both deployment ends — as dark woodland (green
    // before the absolute tints, dark brown after). Redrock's outland is sand and rock; no ring forest.
    // the mountains lane (2026-10-03, gauntlet waves 15 and 24): Wadi Rum's far country — sheer jebels standing alone on
    // the sand plain, each maps lane A's inselberg section with a rim (a bossed cap, a fluted wall over most of the height,
    // a short talus apron), where the regional 'jebel' of mesa tables read as "low rounded swells"
    // (the Redrock lane, 2026-10-07, the coordinator: the far jebels read as "cardboard cutouts in a row" — the bake's air
    // at 0.8 of the law's σ, so the massifs at 3-8 km recede by their distances instead of standing equally crisp)
    // (round 9, the gauntlet's wave 261: "a row of near-identical pale flat-topped mesas, like cardboard cut-outs") the far
    // massifs fewer, with gaps of open plain between, each cap a cluster of beehive domes over a rounder shoulder, and their
    // walls more deeply varnished
    baseHex: 0x7a4936, amp: 1.36, style: 'mesa', treeline: 0, ground: 'sand', banding: 0.045, panorama: { regional: 'jebel', air: 0.8, fillLaw: 1,
      jebelShare: 0.52, jebelRim: 0.8, jebelBossM: 160, jebelVarnish: 0.72 },
    // (the outland boulders a shade sparser: they follow the ring's drained faces, and the map's horizon draws no more
    // triangles than before the mountains lane's relief work)
    outlandRocks: 0.95,
    // (round 10, the gauntlet's wave 270: the heads past the square "a stack of flat-shaded steps" over "a flat, hard-edged
    // dark-red strip the full width where the sand meets the mesa" — the mesa style's bed stair, cut into the canyon's
    // own heads after the hand-over, terraced them in 26-50 m beds over a broad talus bench. The heads are the canyon's
    // jebel sections: no stair)
    escarpment: false,
    forestHex: 0x58402f, rockHex: 0x96533b, haze: 0.92, grain: 0.58,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulus-humilis', coverage: 0.18, cirrus: 0.35, virga: 0.9 },
  sky: {
    sunElevationDeg: 30, sunAzimuthDeg: 116, turbidity: 7.2, rayleigh: 1.05,
    // 2026-10-03 (the skies lane, agreed with the mountains lane: one haze law from the camera to the far country, the map's fogDensity its one lever): arid air is clear — 0.00025 on the four arid maps (a meteorological range near 37 km; a ridge 300 m up at 7.5 km keeps about 60 % of its contrast) (was 0.00058)
    // (round 9, the gauntlet's wave 261: the far massifs "with no haze" — layered air: the heads at 1-1.5 km keep about
    // 60 % of their contrast, the far jebels at 3-8 km recede behind them)
    mieCoefficient: 0.0095, mieDirectionalG: 0.86, fogDensity: 0.00036,
    fogTintHex: 0xb18b77, fogMix: 0.56, envIntensity: 0.17,
    cloudOpacity: 0.62, cloudOpacity2: 0.26, cloudTintHex: 0xffe4cb,
    sunIntensity: 4.25, sunColorHex: 0xffd4ad, hemiIntensity: 0.25, postExposure: 0.92,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xaa8161 },
  },
  minimap: {
    base: [137, 81, 59], hard: [124, 91, 72], soft: [105, 69, 54],
    forest: 'rgba(83,64,39,.62)', forestStroke: 'rgba(58,40,28,.8)',
    water: 'rgba(70,74,72,.5)', waterStroke: 'rgba(45,48,47,.7)',
    roadCasing: 'rgba(67,42,32,.94)', roadFill: 'rgba(190,137,104,.96)', buildingFill: '#d6b294',
  },
  shot: { pos: [-236, 48, -226], look: [38, 5, 54] },
} satisfies import('./contracts.ts').MapCompositionConfig;
