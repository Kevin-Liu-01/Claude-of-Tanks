// src/world/maps/winter.ts — Frosthollow: a Carpathian / Tatra winter valley.
//
// Round 48 redesign (owner 2026-09-23: "Frosthollow, Amberford and Tarkhan
// Steppe look good and have unique colour schemes but are straight rips of
// Verdant Field, exact same maps — not good, need redesign"). Until this round
// the map fell through to DEFAULT_TERRAIN's village rect and marsh centres,
// ran the procedural 'country' roads, copied Verdant's tactical anchors byte
// for byte and nudged its five landforms by a few metres. The snow palette,
// the frozen-sheet identity, the overcast sky, the vegetation and the dressing
// tones stay; the battlefield underneath is new:
//   - a frozen river (a chain of frozen pools) meanders north–south through
//     a valley trough; two land necks carry the crossings;
//   - a linear timber village on the WEST river terrace, its crossroads where
//     the pass road meets the valley road, a sawmill yard at its north end;
//   - the west flank is a steep two-armed ridge with a saddle pass between
//     the arms (the pass road switchbacks up to it); the east flank rolls as
//     moraine knolls with a cross-bar the crossing road cuts through;
//   - fieldstone walls edge the terrace and moraine fields, spruce blocks
//     stand on the slopes with cut clearings, birch hedgerows on the fields;
//   - the roads are authored: the valley road (utility line), the pass road,
//     the Bystra crossing, the moraine track, the sawmill lateral, a village
//     back lane and the yard loop (roadEndpoints.ts owns their endpoints).

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'winter',
  name: 'Frosthollow',
  blurb: 'A frozen river winds through a snowbound timber valley below a saddle pass',

  terrain: {
    hillScale: 0.62, // round 48: a broad kotlina floor under the ridge arms (the +-8 m base hills made 10-18 m river banks)
    microScale: 0.9,
    rimH: 25,
    frozenMarshes: true,
    // no soggy marsh bowls — everything frozen reads as a crisp ice sheet
    marshes: [],
    // The frozen river: a beaded chain of frozen ponds from the south edge to
    // the north edge, each sheet just under its lowest bank (depth). Centres
    // sit 92-112 m apart so no pond's bank band (1.32 r) reaches its
    // neighbour's sheet: two ponds' auto levels can differ by metres between
    // seeds and an overlap would turn that step into a ramp INSIDE the ice
    // (the round-48 berm audit caught exactly that); the steps now fall in
    // the short snow necks between ponds. Two wider necks carry the crossings
    // (the Bystra crossing at z -30..32, the sawmill lateral at z 184..224).
    lakes: [
      { x: -36, z: -434, r: 34, depth: 0.5 },
      { x: -44, z: -340, r: 38, depth: 0.5 },
      { x: -24, z: -246, r: 40, depth: 0.55 },
      { x: -16, z: -150, r: 38, depth: 0.5 },
      { x: -14, z: -60, r: 30, depth: 0.45 },
      // Bystra neck
      { x: 38, z: 70, r: 40, depth: 0.55 },
      { x: 54, z: 150, r: 36, depth: 0.5 },
      // sawmill neck
      { x: 44, z: 262, r: 40, depth: 0.55 },
      { x: 18, z: 356, r: 42, depth: 0.55 },
      { x: -36, z: 424, r: 30, depth: 0.45 },
    ],
    // The linear terrace village: a Carpathian street village along the
    // valley road on the west bank, the sawmill yard at its north end. The
    // rect keeps clear of the river sheets (x1 -54) and of the ridge toe.
    village: { x0: -206, x1: -54, z0: -150, z1: 150, cx: -110, cz: -40, feather: 42, flatten: 0.85, relief: 0.12 },
    roads: { paths: [
      // 0 — the valley road on the west terrace (the utility line, the
      //     village street, the sawmill yard frontage), south edge to north edge
      [[-108, -480], [-112, -400], [-104, -310], [-92, -220], [-80, -130], [-80, -40], [-74, 40], [-84, 130],
        [-98, 220], [-118, 310], [-126, 400], [-128, 480]],
      // 1 — the pass road: from the west border up the switchback onto the
      //     saddle between the two ridge arms and down to the village crossroads
      [[-480, 44], [-440, 18], [-404, 64], [-366, 34], [-322, 54], [-272, 20], [-214, -10], [-160, -30], [-118, -40], [-80, -40]],
      // 2 — the Bystra crossing: crossroads → the southern pool neck → the
      //     moraine crossroads → through the moraine bar to the east border
      [[-80, -40], [-40, -16], [0, 4], [40, 10], [90, -2], [150, -24], [190, -40], [262, -30], [330, 4], [400, -10], [480, -2]],
      // 3 — the moraine track on the east flank, south edge to north edge
      [[280, -480], [262, -380], [236, -280], [214, -180], [196, -100], [190, -40], [214, 60], [250, 160], [262, 260], [236, 360], [214, 480]],
      // 4 — the sawmill lateral: yard → the northern pool neck → the moraine track
      [[-84, 130], [-40, 152], [10, 186], [60, 208], [130, 196], [200, 178], [250, 160]],
      // 5 — the village back lane behind the church row
      [[-80, -130], [-140, -120], [-172, -70], [-160, -30]],
      // 6 — the sawmill yard loop
      [[-84, 130], [-130, 140], [-150, 100], [-120, 74], [-74, 40]],
    ] },
    landforms: [
      // west flank — the steep Tatra-side ridge in two arms; the saddle pass
      // lies between them (z 5..96) over a low hump the switchback climbs
      { kind: 'ridge', x: -300, z: -160, length: 330, width: 105, height: 13.0, yawDeg: 84 },
      { kind: 'ridge', x: -312, z: 246, length: 300, width: 100, height: 12.0, yawDeg: 96 },
      { kind: 'knoll', x: -330, z: 46, rx: 110, rz: 70, height: 9.0, yawDeg: 0 },
      // the valley trough the river follows
      { kind: 'basin', x: 8, z: 10, rx: 150, rz: 500, height: -3.2, yawDeg: -3 },
      // the floodplain meadow east of the southern reach (a base-noise hill stood 9 m over the sheets)
      { kind: 'basin', x: 66, z: -330, rx: 84, rz: 96, height: -5.5, yawDeg: 0 },
      // east flank — rolling moraine: two knolls and a bar the crossing road cuts
      { kind: 'knoll', x: 244, z: -206, rx: 122, rz: 84, height: 6.8, yawDeg: -18 },
      { kind: 'knoll', x: 288, z: 214, rx: 118, rz: 96, height: 7.6, yawDeg: 14 },
      { kind: 'ridge', x: 330, z: 40, length: 220, width: 80, height: 4.4, yawDeg: 60 },
      // the north-west shoulder under the enemy deployment's west pads
      { kind: 'knoll', x: -170, z: 350, rx: 100, rz: 70, height: 4.2, yawDeg: 20 },
    ],
  },

  spawns: {
    // The player deploys on the south terrace beside the valley road; the
    // seven enemy pads form an arc across the north end — four on the moraine
    // side of the river, three on the north-west shoulder — on flat ground
    // (relief probed with the round-48 layout scan), off the frozen sheets,
    // >= 38 m apart and >= 750 m from the player pad.
    player: { x: -160, z: -400 },
    enemies: [
      { x: 262, z: 352 }, { x: 334, z: 382 }, { x: 202, z: 400 }, { x: 124, z: 430 },
      { x: -210, z: 346 }, { x: -240, z: 388 }, { x: -186, z: 436 },
    ],
  },

  splat: {
    // lighting_post r5: saturation 0.05 -> 0.03 — shadowed snow read as blue paint
    // round 48 (owner-approved round-44 re-grade, 2026-09-23): snowpack L
    // 0.62 + 0.38·l -> 0.52 + 0.32·l. The skyline could not exist while the
    // lit snow sat on the tonemap shoulder above the capped sky (round 44);
    // with postExposure 0.94 -> 0.86 below the pair leaves the shoulder and
    // the sky is again the brightest surface (skyline metric in the round-48
    // section of docs/MAP-BEAUTIFICATION.md).
    grassTone: (h: number, s: number, l: number) => [0.575, 0.03, clamp01(0.52 + l * 0.32)], // snowpack
    dirtTone: (h: number, s: number, l: number) => [0.075, 0.11, clamp01(l * 0.85 + 0.10)], // frozen mud
    // pale snow-dusted rock: keeps steep lake banks / cut slopes from reading
    // as dark holes punched into the snowfield
    rockTone: (h: number, s: number, l: number) => [0.585, 0.05, clamp01(l * 1.0 + 0.22)],
    mudTone: (h: number, s: number, l: number) => [0.565, 0.24, clamp01(0.60 + l * 0.34)], // (fallback if iceLake off)
    mudRough: 0.18,
    marshGloss: 1.0, // r6: full ice response — the sheet needs a real sheen
    // dedicated ice-sheet layer: blue-grey albedo, bright refrozen pressure
    // cracks, dark depth blotches, glossy clear-ice roughness (history of the
    // drift value: 0.85 -> 0.45 -> 0.30 -> 0.18 -> 0.12 -> 0.20 across the
    // content_breadth rounds — 0.20 keeps partial snow-drift patches while
    // the crack veins still read)
    iceLake: true,
    iceDrift: 0.20,
    // terrain_environment r3/r4: fresnel sky tint the clear-ice fields reflect
    // at grazing view angles (terrain.js uIceSky)
    iceSky: [0.76, 0.82, 0.92],
    // lighting_post r5: tintB desaturated toward neutral (was [0.90,0.93,1.00])
    tintA: [1.03, 1.04, 1.09], tintB: [0.95, 0.965, 1.005], tintC: [1.04, 1.04, 1.07],
    roadTint: [0.74, 0.68, 0.62], // worn dark slush tracks through the snow
  },

  vegetation: {
    species: ['birch', 'spruce', 'fir', 'aspen'],
    // round 48: spruce-led stands — the forest blocks on the ridge slopes are
    // Carpathian spruce with fir, birch and aspen on the lower ground
    clusterMix: [['spruce', 0.40], ['fir', 0.24], ['birch', 0.24], ['aspen', 0.12]],
    loneMix: [['birch', 0.34], ['aspen', 0.28], ['spruce', 0.23], ['fir', 0.15]],
    rimMix: [['spruce', 0.48], ['fir', 0.27], ['birch', 0.15], ['aspen', 0.10]],
    clusterCount: 74, // denser stands on the two ridge arms and the moraine (was 66)
    loneCount: 92,
    rimCount: 64,
    // round 48: the sawmill's cut blocks — no random stand lands in the four
    // clearings (three cuts on the ridge arms, the open saddle pass)
    avoid: [{ x: -300, z: -226, r: 56 }, { x: -362, z: -66, r: 46 }, { x: -262, z: 302, r: 54 }, { x: -336, z: 42, r: 72 }],
    // round 48: planted lines — spruce forest edges along the ridge toes, a
    // birch line on the terrace scarp above the river and birch hedgerows
    // on the moraine fields (real cover: belts go through the tree admission)
    belts: [
      { x0: -206, z0: -330, x1: -212, z1: -176, gap: 11, jitter: 4, skip: 0.16, species: 'spruce' },
      { x0: -214, z0: 176, x1: -222, z1: 330, gap: 11, jitter: 4, skip: 0.16, species: 'spruce' },
      { x0: -44, z0: -300, x1: -48, z1: -196, gap: 12, jitter: 4, skip: 0.2, species: 'birch' },
      { x0: 136, z0: -150, x1: 136, z1: -62, gap: 10, jitter: 3, skip: 0.18, species: 'birch' },
      { x0: 150, z0: 236, x1: 150, z1: 330, gap: 10, jitter: 3, skip: 0.18, species: 'birch' },
    ],
    // sparser, FROSTED tufts: the old dark dense scatter read as uniform
    // speckle noise across the snowfield in wide shots (r5 -> r7 -> r8: 0.24
    // -> 0.10 -> 0.07; the surviving tufts ride lighter, waxier rime tones so
    // they read as frost-bound straw, not debris)
    grassDensity: 0.07,
    grassTexTone: (h: number, s: number, l: number) => [0.105, 0.10, clamp01(l * 1.0 + 0.36)], // rimed straw
    tuftTone: (h: number, s: number, l: number) => [0.11, 0.07, clamp01(l * 0.9 + 0.40)],
    bushCount: 0.28, // map pass 2026-09-12: bare birch scrub breaks the empty snowfield
    // pine scrub, not birch twig-balls: the dark leafless bush scatter read
    // as speckle noise against the snow in establishing shots
    bushSpecies: 'spruce',
    palettes: {
      // r3 (content_breadth): both species run a HOAR-FROST palette — twig/
      // needle textures pushed toward pale rime, near-card tints cooled and
      // lifted, the `snow` knob lays a white top-weighted snow load on the
      // card cloud; `jitterHue` clamps the per-instance hue jitter to near
      // value-only so no lone summer-green tree survives on a snow map.
      birch: {
        // r4 (content_breadth): snow 0.60 -> 0.75 — feeds the branch-
        // conforming snow-cap lobes in vegetation.ts buildBirchGeometry
        cardHue: 0.58, cardSat: 0.03, cardL0: 0.46,
        texTone: (h: number, s: number, l: number) => [0.58, clamp01(s * 0.14), clamp01(l * 0.62 + 0.34)],
        canopy: { hue: 0.575, sat: 0.045, l0: 0.42, l1: 0.60 },
        snow: 0.75, jitterHue: 0.22,
      },
      pine: { // winter spruce under snow load: frosted blue-green underlayer
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.98), clamp01(s * 0.32), clamp01(l * 1.02 + 0.18)],
        cardHue: 0.40, cardSat: 0.07, cardL0: 0.42,
        canopy: { hue: 0.46, sat: 0.05, l0: 0.42, l1: 0.66 },
        // r6 terrain_environment: 0.55 -> 0.90 — conifers carry a real snow load
        snow: 0.90, jitterHue: 0.22,
      },
    },
  },

  props: {
    // round 48: the timber-valley catalog — log cabins, steep-roof alpine
    // houses, the onion-dome church and open woodsheds make the terrace
    // village; depots, a warehouse and woodsheds make the sawmill yard at its
    // north end (buildings land on the road nodes inside the village rect)
    plan: ['rangerlodge', 'alpine', 'schoolhouse', 'onionchurch', 'logcabin', 'woodshed', 'barn', 'alpine',
      'logcabin', 'cottage', 'woodshed', 'depot', 'warehouse', 'woodshed', 'alpine', 'barn',
      'logcabin', 'ruin', 'depot', 'woodshed'],
    destructibleBuildings: ['saunahut', 'alpinerefuge', 'fieldhospital', 'huntingblind', 'leanto'],
    buildingLat: [12, 3], sideSkip: 0.10,
    // round 48: the three strongpoints follow the new lanes — the brawl in
    // the terrace village, the scout on the north-east moraine knoll, the
    // support on the saddle shoulder above the pass road
    tacticalBeats: [
      { id: 'terrace-village-refuge', role: 'brawl', x: -126, z: -96, yawDeg: 84,
        structure: 'alpinerefuge', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 16 },
      { id: 'moraine-knoll-blind', role: 'scout', x: 288, z: 226, yawDeg: -70,
        structure: 'huntingblind', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'saddle-aid-station', role: 'support', x: -296, z: 94, yawDeg: 20,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
    ],
    // round 48: the sawmill yard — two flatbeds load beside grounded timber
    // bundles inside the yard loop; the cut route runs through the clearings
    // on the southern ridge arm (composeLoggingYard moves accepted props,
    // never adds them: <= 2 flatbeds, <= 10 bundles, 2..6 cut stations)
    loggingYard: {
      flatbeds: [{ x: -112, z: 106, yaw: 0 }, { x: -112, z: 128, yaw: 0 }],
      bundles: [
        { x: -128, z: 106, yaw: -Math.PI / 2 }, { x: -127.2, z: 106, yaw: -Math.PI / 2 },
        { x: -126.4, z: 106, yaw: -Math.PI / 2 }, { x: -125.6, z: 106, yaw: -Math.PI / 2 },
        { x: -124.8, z: 106, yaw: -Math.PI / 2 },
        { x: -128, z: 128, yaw: -Math.PI / 2 }, { x: -127.2, z: 128, yaw: -Math.PI / 2 },
        { x: -126.4, z: 128, yaw: -Math.PI / 2 }, { x: -125.6, z: 128, yaw: -Math.PI / 2 },
        { x: -124.8, z: 128, yaw: -Math.PI / 2 },
      ],
      clearcut: [[-318, -250], [-286, -198], [-346, -100], [-372, -60]],
    },
    tones: {
      plaster: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.7), clamp01(l * 1.02 + 0.03)],
      roof: (h: number, s: number, l: number) => [0.58, clamp01(s * 0.25), clamp01(l * 1.35 + 0.18)], // snow-capped
      stone: (h: number, s: number, l: number) => [0.60, clamp01(s * 0.35), clamp01(l * 1.05 + 0.05)],
      wood: (h: number, s: number, l: number) => [h, clamp01(s * 0.7), clamp01(l * 0.95 + 0.02)],
      // terrain_environment r3: frosted warm straw keeps the haystack identity
      // under a pale rime (the all-white tone erased the thatch texture)
      straw: (h: number, s: number, l: number) => [0.105, clamp01(s * 0.42 + 0.06), clamp01(l * 1.02 + 0.10)],
    },
    // terrain_environment r3: under the BRIGHT overcast fill even mid-grey
    // albedo renders pale, so boulder sides go properly dark; the geometry's
    // up-facing gradient (props.ts) keeps snow-dusted caps
    rockTone: (h: number, s: number, l: number) => [0.60, 0.05, clamp01(l * 0.70 + 0.02)],
    wallStoneChance: 0.25,
    // round 48: fieldstone walls edge the valley fields — the terrace strips
    // between the village lane and the river bank, the village yards, the
    // sawmill yard fence line, the moraine fields and hay ground, the pass
    // approach and the north terrace boundary ([x0, z0, x1, z1, style])
    wallRuns: [
      [-66, -262, -66, -200, 2],
      [-190, -310, -120, -310, 2], [-120, -310, -120, -262, 1],
      [-196, -126, -196, -66, 2], [-150, -140, -100, -140, 3],
      [-170, 100, -170, 160, 2], [-170, 160, -108, 160, 4],
      [-200, 200, -140, 200, 2],
      [120, -136, 180, -136, 2], [120, -136, 120, -80, 1],
      [160, 226, 232, 226, 3], [232, 226, 232, 286, 2],
      [108, 300, 172, 300, 2],
      [-390, -24, -330, -24, 1],
      [-96, 330, -52, 330, 2],
    ],
    // r3 terrain_environment: winter boulders sink to ~45% — half-drifted rock
    // shoulders read natural and keep their cover role
    rockSink: 0.45,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // dressing counts (map pass 2026-09-12 leaves pinned by mapPassDressing):
    // snow-capped stacks as mid-field silhouettes, drifted rocks, outcrops,
    // battle scarring that reads loudest on snow
    haystacks: 12, rocks: 270, outcrops: 32, craters: 36, rubblePiles: 0,
    // Legacy-map quality backport: snow-bound modern hulks (the
    // snow-cap shader dusts them like every prop), frozen supply columns
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['cv90', 'strv122', 'k2', 'type10', 't80u'],
    },
    sandbagLines: 10,
    hedgehogs: 8,
    // world-dressing r1: winter inhabitants — sleds on the snowfield, firewood
    // in every yard, rail fences along the lanes; round 48 adds hay bales in
    // the terrace and moraine fields (the hay-barn clusters)
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 1, benches: 1, coreClutter: 6,
      sleds: 6, bales: 8,
      troughs: 1, handcarts: 1, carts: 2,
      roadFence: 'fencerail', yardFence: 'fenceplank',
      // DESTRUCTIBLES r1: a frozen supply column + winter bivouacs
      trucks: 3, jeeps: 1, drumClusters: 3, camps: 2,
      modernClutter: { barrier: 4, roadsign: 4, cone: 6, transformer: 3, cablespool: 3 },
    },
  },

  horizon: {
    // r3: snowline dropped to the valley floor, base/rock pushed cold
    // blue-grey and the caps near-white so the ring reads FROZEN through fog
    // + warm grade; r8: snowHex 0xf4f8fe -> 0xdfe7f1 and haze 0.68 -> 0.60
    // (the near-white wall sat on the tonemap shoulder where the sastrugi/
    // rib texture compressed to nothing)
    baseHex: 0x76839a, amp: 1.04, style: 'alpine', snowline: 0.24,
    rockHex: 0x424c66, snowHex: 0xdfe7f1, haze: 0.60,
  },

  sky: {
    // FLAT OVERCAST: higher-but-weak sun (no warm horizon glow), heavy grey
    // cloud deck, raised ambient/env fill so light reads diffuse
    sunElevationDeg: 33, sunAzimuthDeg: 115,
    // turbidity 13 -> 8.5 -> 7.2: the mie-loaded sky sampled a warm CREAM
    // horizon that tanned the alpine ring; 7.2 keeps the milky overcast
    turbidity: 7.2, rayleigh: 2.2, mieCoefficient: 0.002, mieDirectionalG: 0.7,
    // fog 0.0018 -> 0.0011 -> 0.00088 -> 0.00064 -> 0.00058: each step let more
    // of the ring's baked snow/rock structure survive the white wash stack
    // (scene fog + aerial scatter-in); the aerial pass owns depth grading
    fogDensity: 0.00058, fogTintHex: 0xaebdce, fogMix: 0.82, envIntensity: 0.30,
    // lighting_post r3: a lower/darker broken stratus deck reads against the
    // bright snow bounce in the 2-12° establishing band
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0x9aa3ae,
    cloudAltM: 320, cloudHazeK: 0.00013, cloudUvM: 2200,
    // round 48 (owner-approved round-44 re-grade, 2026-09-23): postExposure
    // 0.94 -> 0.86 with the snowpack L step above — the lit snow leaves the
    // tonemap shoulder so the skyline against the capped sky can exist
    sunIntensity: 1.35, sunColorHex: 0xdfe7f2, hemiIntensity: 0.74, postExposure: 0.86,
  },

  minimap: {
    base: [170, 178, 186], hard: [128, 122, 114], soft: [150, 168, 186],
    forest: 'rgba(64,80,72,0.85)', forestStroke: 'rgba(38,50,44,0.9)',
    water: 'rgba(158,190,214,0.85)', waterStroke: 'rgba(104,134,158,0.9)',
    roadCasing: 'rgba(60,54,46,0.9)', roadFill: 'rgba(120,108,96,0.95)',
    buildingFill: '#e4e7ec',
  },

  // round 48: from the south-west terrace over the village roofs to the
  // frozen river and the moraine — the valley's signature read (river, the
  // street village on its terrace, the far ridge arm on the right)
  shot: { pos: [-236, 46, -318], look: [46, -2, 40] },
} satisfies import('./contracts.ts').MapCompositionConfig;
