// src/world/maps/steppe.ts — Tarkhan Steppe, round 48 redesign (owner 2026-09-23:
// "Frosthollow, Amberford and Tarkhan Steppe look good and have unique colour
// schemes but are straight rips of Verdant Field, exact same maps — need
// redesign"). The palette, sky, vegetation species, prop tones, name and id are
// the map's identity and stay; the battlefield underneath is new.
//
// Reference: the Kazakh Sary-Arka grain steppe of the Virgin Lands campaign —
// a dry braided riverbed (a wide gravel sor-wadi, shallow, crossable everywhere
// and exposed everywhere) running east–west through the middle; a long gentle
// escarpment north of it, the edge of a low plateau, opened by two natural
// ramps; a line of kurgan burial mounds with stone kerbs along the plateau; a
// Soviet-era rail-spur grain station (elevator head tower, long grain stores,
// platform hall, loading gantry) as the built-up anchor in the south-east; a
// collective-farm compound with stone corrals in the west; a salt pan in the
// north-western lowland; an old caravanserai fort ruin on a rise between the
// wadi and the escarpment; a straight steppe highway crossing the wadi at a
// ford and climbing the western ramp; farm tracks; poplar shelterbelts instead
// of forests. Wide-open sightlines are the point — the wadi banks and the
// escarpment crest are the cover geometry.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The wadi centreline (metres): z per x, a gentle meander from the west edge to
// the east edge. The basins below, the gravel bed and the ford all follow it.
const WADI = [[-450, -30], [-300, -8], [-150, 16], [0, 30], [150, 26], [300, 6], [450, -22]] as const;

// The takyr crusts: one shallow pale marsh every 48 m along the wadi
// centreline across the playable square.
function wadiCrusts(): { x: number; z: number; r: number; dip: number }[] {
  const out: { x: number; z: number; r: number; dip: number }[] = [];
  const zAt = (x: number): number => {
    if (x <= WADI[0][0]) return WADI[0][1] + (x - WADI[0][0]) * 0.14;
    if (x >= WADI[WADI.length - 1][0]) return WADI[WADI.length - 1][1] - (x - WADI[WADI.length - 1][0]) * 0.18;
    for (let i = 1; i < WADI.length; i++) {
      if (x <= WADI[i][0]) {
        const t = (x - WADI[i - 1][0]) / (WADI[i][0] - WADI[i - 1][0]);
        return WADI[i - 1][1] + (WADI[i][1] - WADI[i - 1][1]) * t;
      }
    }
    return 0;
  };
  // the crusts stop where the border rim begins to lift (|x| > 470); the basins themselves run on past the edge
  for (let x = -456; x <= 456; x += 48) out.push({ x, z: Math.round(zAt(x)), r: 28, dip: 0.8 });
  return out;
}

// Stone kerb (kromlech) around a kurgan: a hexagon of low fieldstone walls with
// one gap on the south side, radius r around (cx, cz).
function kurganKerb(cx: number, cz: number, r: number): readonly [number, number, number, number, number][] {
  const p = (k: number): [number, number] => [cx + r * Math.cos((k * Math.PI) / 3), cz + r * Math.sin((k * Math.PI) / 3)];
  const ring: [number, number, number, number, number][] = [];
  for (let k = 0; k < 6; k++) {
    if (k === 4) continue; // the entrance gap faces south
    const [x0, z0] = p(k), [x1, z1] = p(k + 1);
    ring.push([Math.round(x0), Math.round(z0), Math.round(x1), Math.round(z1), (k % 3) + 1]);
  }
  return ring;
}

export default {
  id: 'steppe',
  name: 'Tarkhan Steppe',
  blurb: 'Golden grassland — a dry gravel riverbed, a plateau edge and a grain station',

  terrain: {
    hillScale: 0.36,   // a flat steppe: the authored wadi, scarp and kurgans carry the relief (was 0.85)
    microScale: 1.2,   // still hull-down folds on the open plain, softer than r2's 1.35
    rimH: 18,
    // The wadi's takyr floor: a chain of shallow pale crusts (the M layer with
    // the salt-pan tone below) 48 m apart along WADI inside the basin chain —
    // a dry silt bed that slows a crossing hull, banked by firm gravel
    // shoulders — plus the salt pan (sor): two pale dry basins in the
    // north-western lowland between the wadi's north bank and the escarpment
    // foot. dip well under the 2.6 m soggy-bowl default — crusts, not bogs.
    marshes: [
      ...wadiCrusts(),
      { x: -318, z: 128, r: 66, dip: 0.6 },
      { x: -404, z: 62, r: 40, dip: 0.5 },
    ],
    clearMarshVeg: true, // a dry crust grows no tufts
    // The grain station: one graded rect around the station road / east track
    // junction in the south-east.
    village: { x0: 150, x1: 410, z0: -330, z1: -120, cx: 284, cz: -222, feather: 44, flatten: 0.86, relief: 0.12 },
    roads: { paths: [
      // 0 — the steppe highway: one straight bearing from the south edge across
      // the wadi ford, through the western escarpment ramp and over the plateau.
      // Road 0 also carries the utility-pole line (mapQuality).
      [[-138, -512], [-118, -330], [-98, -160], [-80, -14], [-62, 130], [-40, 356], [-22, 512]],
      // 1 — the station road: west edge → kolkhoz → highway crossing → grain
      // station → east edge, along the south bank of the wadi.
      [[-512, -150], [-386, -146], [-300, -142], [-190, -158], [-92, -172], [40, -196], [160, -212], [284, -222], [410, -226], [512, -232]],
      // 2 — the east track: south edge → station → wadi crossing → the eastern
      // escarpment ramp → plateau → north edge.
      [[336, -512], [318, -400], [296, -290], [284, -222], [272, -120], [262, 20], [256, 150], [248, 344], [244, 400], [240, 512]],
      // 3 — the plateau road: across the plateau behind the kurgan line.
      [[-512, 368], [-380, 364], [-230, 360], [-40, 356], [110, 350], [248, 344], [400, 338], [512, 334]],
      // 4 — the sor track: from the kolkhoz across the wadi to the salt pan's shore (a dead end).
      [[-300, -142], [-306, -60], [-302, 20], [-282, 96], [-250, 136]],
    ] },
    // Three graded aprons (hardstandSurface.ts): the kolkhoz machine yard south
    // of the corrals, the caravanserai's beaten forecourt at the foot of its
    // rise, and the post-road halt beside the east track on the eastern ramp
    // — firm level ground the objective placement seats its 30 m zones on
    // (the open folds, the road banks and the seeded props leave no such disc
    // west of centre or on the ramps).
    hardstands: [
      { x: -330, z: -240, width: 64, length: 68, yawDeg: 0, level: -2.0, grade: 0 },
      { x: 60, z: 90, width: 60, length: 60, yawDeg: 0, level: 2.2, grade: 0 },
      { x: 292, z: 312, width: 58, length: 58, yawDeg: 0, level: 7.5, grade: 0 },
    ],
    // Gravel: the wadi bed is bare worked ground (the D layer's pale dusty dirt)
    // between the banks; the station forecourt and the kolkhoz yard are trodden.
    workedGround: [
      { feather: 24, strength: 0.9, boundary: [
        [-512, 6], [-450, 6], [-300, 30], [-150, 56], [0, 72], [150, 66], [300, 44], [450, 14], [512, 6],
        [512, -46], [450, -58], [300, -32], [150, -14], [0, -12], [-150, -24], [-300, -46], [-450, -66], [-512, -66],
      ] },
      { feather: 16, strength: 0.7, boundary: [[226, -292], [372, -292], [372, -150], [226, -150]] },
      { feather: 14, strength: 0.6, boundary: [[-372, -206], [-246, -206], [-246, -96], [-372, -96]] },
    ],
    landforms: [
      // The wadi: a chain of shallow basins along WADI, 150 m apart with rx 130 so
      // the bed stays within 8 % of one level between centres; the outer two
      // reach past the red line, so the riverbed continues into the outland.
      ...WADI.map(([x, z], i) => ({
        kind: 'basin', x, z, rx: 130,
        rz: [58, 62, 66, 68, 66, 62, 58][i],
        height: [-4.6, -5.1, -5.6, -5.8, -5.6, -5.1, -4.6][i],
        yawDeg: [8, 9, 7, 2, -5, -9, -10][i],
        wetScale: 1, // the takyr crusts lie IN the bed: the marsh must not lift the basin back up
      })),
      // The escarpment (the plateau edge): three ridge segments with the crest
      // near z ≈ 220, with two gaps — the highway ramp (x ≈ −120..0) and the
      // east-track ramp (x ≈ 230..310). The segments end with the ridge's own
      // 28 % taper, so the gaps read as saddles, not cuts.
      { kind: 'ridge', x: -330, z: 232, length: 420, width: 170, height: 12.0, yawDeg: -3 },
      { kind: 'ridge', x: 112, z: 222, length: 230, width: 170, height: 11.4, yawDeg: -3 },
      { kind: 'ridge', x: 440, z: 206, length: 260, width: 170, height: 11.8, yawDeg: -4 },
      // The plateau behind the crest: one broad low ridge whose southern
      // shoulder lengthens the back slope and which has tapered out before the
      // enemy deployment ground (pads sit on base terrain: the spawn-clear
      // fade would otherwise dimple every pad into a landform). The plateau
      // road runs across it behind the kurgans.
      { kind: 'ridge', x: 0, z: 270, length: 1400, width: 170, height: 4.5, yawDeg: -3 },
      // The kurgan line: five burial mounds on the crest of the plateau edge —
      // the valley-edge placement of the real steppe, seen on the skyline from
      // the southern approach and hull-down ground for the plateau side. The
      // highway ramp breaks the line between the third and fourth mounds.
      { kind: 'knoll', x: -400, z: 236, r: 32, height: 7.2 },
      { kind: 'knoll', x: -270, z: 231, r: 28, height: 6.2 },
      { kind: 'knoll', x: -150, z: 227, r: 36, height: 8.4 },  // the great kurgan
      { kind: 'knoll', x: 60, z: 224, r: 30, height: 6.6 },
      { kind: 'knoll', x: 170, z: 220, r: 32, height: 7.0 },
      // The caravanserai rise between the wadi's north bank and the escarpment foot.
      // (its forecourt apron below flattens the toe; the mound stands 20 m up-slope of the apron's edge)
      { kind: 'knoll', x: 70, z: 142, rx: 56, rz: 46, height: 6.5, yawDeg: 12 },
    ],
  },

  spawns: {
    // The player team deploys on the low southern steppe west of the highway
    // (round 48 pacing, 2026-09-24: the corner pad at (-210, -424) put the arc
    // 869 m away and its last bots — a Strv 103 on the border rim among them —
    // ran out of clock; the 10 m grid scan's flattest cell 120 m up the approach,
    // minNy 0.981, relief 1.5 m, 44 m off the highway); the enemy arc stands on
    // the plateau ~180 m behind the kurgan crest (the spawn-clear fade ends at
    // 90 m, so the mounds keep their height), with the highway and the east
    // track passing between pads, short of the rim lift (past z ≈ 470).
    player: { x: -160, z: -310 },
    enemies: [
      { x: -262, z: 416 }, { x: -172, z: 424 }, { x: -84, z: 410 }, { x: 10, z: 422 },
      { x: 100, z: 414 }, { x: 186, z: 426 }, { x: 300, z: 402 },
    ],
  },

  splat: {
    // cured feather-grass gold (fallback; sourced withered_grass set is the
    // real albedo — sourcedTextures TERRAIN_PLAN.steppe)
    grassTone: (h: number, s: number, l: number) => [0.118, clamp01(s * 0.8), clamp01(l * 1.04 + 0.05)],
    dirtTone: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.8), clamp01(l * 1.0 + 0.04)],
    // r2: warm sun-bleached outcrop stone — the neutral grey read as cold
    // blue slag wherever a fold crest picked up partial rock
    rockTone: (h: number, s: number, l: number) => [0.082, clamp01(s * 0.30 + 0.10), clamp01(l * 1.05 + 0.05)],
    // round 48: the marsh layer is the salt pan — a pale, near-white crust
    mudTone: (h: number, s: number, l: number) => [0.10, 0.10, clamp01(l * 1.45 + 0.22)],
    mudRough: 1.2,
    // straw lift / olive-brown DARKENER / pale hay — the macro range that
    // keeps 300-800 m readable on an open plain (the desert r3 lesson)
    // r3: darkener pulled off red toward olive — the brown fields read as
    // ploughed dirt smears on the first render
    tintA: [1.12, 1.04, 0.76], tintB: [0.78, 0.76, 0.56], tintC: [1.08, 1.02, 0.80],
    roadTint: [0.95, 0.88, 0.74], // dusty tracks
    fieldPatch: 1,       // worked-field patchwork
    midRelief: 0.85,
    midReliefFar: 760,   // the dapple must carry the long sightlines
    microAmp: 0.85,
  },

  vegetation: {
    // Narrow poplars carry the planted shelterbelt silhouette; broad oaks and
    // sparse pines keep the open plain from reading as a repeated tree stamp.
    species: ['poplar', 'oak', 'pine'],
    clusterMix: [['poplar', 0.50], ['oak', 0.35], ['pine', 0.15]],
    loneMix: [['poplar', 0.54], ['oak', 0.34], ['pine', 0.12]],
    rimMix: [['poplar', 0.40], ['oak', 0.35], ['pine', 0.25]],
    clusterCount: 5,   // the plain is the point — groves are rare landmarks
    loneCount: 24,
    rimCount: 34,
    grassDensity: 1.1,
    bushCount: 0.72,
    bushSpecies: 'oak',
    // Shelterbelts (vegetation.ts belts): poplar rows along the highway and the
    // station road, oak windbreaks on the kolkhoz and the plateau — the
    // steppe's man-made tree geometry and its concealment corridors.
    belts: [
      { x0: -150, z0: -470, x1: -102, z1: -60, species: 'poplar', gap: 9 },   // highway, west verge (south)
      { x0: -118, z0: -470, x1: -70, z1: -60, species: 'poplar', gap: 9 },    // highway, east verge (south)
      { x0: -82, z0: 90, x1: -58, z1: 330, species: 'poplar', gap: 9 },       // highway, west verge (north)
      { x0: -50, z0: 90, x1: -27, z1: 330, species: 'poplar', gap: 9 },       // highway, east verge (north)
      { x0: -380, z0: -130, x1: -190, z1: -142, species: 'poplar', gap: 8 },  // station road, kolkhoz reach
      { x0: -190, z0: -142, x1: 150, z1: -196, species: 'poplar', gap: 8 },   // station road, to the station
      { x0: 300, z0: -470, x1: 266, z1: -240, species: 'poplar', gap: 9 },    // east track approach
      { x0: -370, z0: -86, x1: -250, z1: -80, species: 'oak', gap: 8 },       // kolkhoz windbreak
      { x0: -440, z0: 386, x1: -300, z1: 382, species: 'oak', gap: 10 },      // plateau field boundary
    ],
    grassTexTone: (h: number, s: number, l: number) => [0.118, clamp01(s * 0.75 + 0.05), clamp01(l * 1.05 + 0.07)],
    tuftTone: (h: number, s: number, l: number) => [0.122, 0.30, clamp01(l * 0.85 + 0.14)],
    palettes: {
      oak: { // late-summer shelterbelt green-gold: full crowns, dusty olive
        texTone: (h: number, s: number, l: number) => [clamp01(0.10 + (h - 0.22) * 0.35), clamp01(s * 0.72 + 0.06), clamp01(l * 1.0 + 0.04)],
        cardHue: 0.115, cardSat: 0.32,
        canopy: { hue: 0.12, sat: 0.32, l0: 0.28, l1: 0.42 },
        jitterHue: 0.6,
      },
      pine: { // r3: dust the rare pines — full verdant green read terrarium
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.96), clamp01(s * 0.55), clamp01(l * 1.0 + 0.05)],
        canopy: { hue: 0.28, sat: 0.16, l0: 0.18, l1: 0.32 },
      },
    },
  },

  props: {
    // The grain station (round 48): the elevator's head tower, long grain
    // stores, the platform hall, the loading gantry, freight ranks and the
    // railway workers' houses along the station road and the east track.
    plan: ['watertower', 'warehouse', 'depot', 'granary', 'gantry', 'warehouse', 'cornershop',
      'shed', 'containerRow', 'farmhouse', 'stack', 'granary', 'cottage', 'warehouse', 'shed',
      'cottage', 'ruin', 'barn', 'containerRow', 'cottage'],
    destructibleBuildings: ['longhouse', 'deserttent', 'motorpool', 'quonsethut'],
    // rail-kit stores are wide: the same lateral step and ground-fit tolerance
    // as Cinder Junction
    sideSkip: 0.15, spacingPad: 7, buildingLat: [12, 5], maxSpread: 2.4,
    tacticalBeats: [
      // the kolkhoz: a long cattle barn inside the stone corrals, west lane
      { id: 'kolkhoz-cattle-barn', role: 'brawl', x: -318, z: -118, yawDeg: 90,
        structure: 'longhouse', redoubt: true, outcrop: false, wreck: true, wreckOffsetX: -18 },
      // the caravanserai ruin on its rise: broken fort walls, tumbled stone, a herders' camp
      { id: 'tarkhan-caravanserai-ruin', role: 'scout', x: 70, z: 142, yawDeg: 12,
        structure: 'deserttent', outcrop: { count: 7, radius: 12, scaleMax: 3.0 } },
      // the station's machine yard under the elevator, east lane
      { id: 'elevator-machine-yard', role: 'support', x: 330, z: -160, yawDeg: 0,
        structure: 'motorpool', redoubt: true, outcrop: false, wreck: true, wreckOffsetZ: 16 },
    ],
    tones: {
      plaster: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.4), clamp01(l * 1.08 + 0.06)], // sun-baked lime wash
      roof: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.7), clamp01(l * 0.95)],
      stone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.45), clamp01(l * 1.0)],
      wood: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.85), clamp01(l * 1.0)],
      straw: (h: number, s: number, l: number) => [0.11, clamp01(s * 0.9), clamp01(l * 1.05 + 0.05)],
    },
    rockTone: (h: number, s: number, l: number) => [0.085, 0.09, clamp01(l * 0.95)], // granite spur boulders
    wallStoneChance: 0.3,
    wallRuns: [
      // kolkhoz stone corrals south of the station road, and the yard wall north of it
      [-360, -200, -290, -200, 2], [-360, -200, -360, -166, 1], [-290, -200, -290, -166, 3], [-330, -166, -330, -200, 2],
      [-350, -104, -286, -104, 3], [-350, -104, -350, -134, 1], [-260, -92, -260, -128, 2],
      // the caravanserai fort: three breached walls on the rise
      [48, 122, 80, 122, 2], [96, 130, 96, 164, 3], [48, 164, 74, 164, 1], [48, 130, 48, 152, 2],
      // stone kerbs around the great kurgan and the western kurgan
      ...kurganKerb(-150, 227, 46),
      ...kurganKerb(-400, 236, 42),
      // station yard walls
      [230, -300, 300, -300, 3], [366, -296, 366, -250, 2],
      // plateau field boundaries
      [-440, 396, -350, 400, 2], [330, 372, 420, 366, 1],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // the steppe's dressing IS hay + stone: bale silhouettes on every fold
    haystacks: 44, rocks: 230, outcrops: 34, craters: 42, rubblePiles: 0,
    // Legacy-map quality backport: modern hulks scattered on the open
    // plain (baked roster tanks, paired duel beats), tank-trap lines
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['pl01', 'pt91m', 't72b3m', 'type99a', 't90m'],
    },
    sandbagLines: 10,
    hedgehogs: 6,
    cropFields: 5,
    // world-dressing r1: open-plain hay economy — heavy bale/stook scatter,
    // stone-post rail fences, troughs at the farmsteads
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 1, benches: 1, coreClutter: 6,
      bales: 16, stooks: 10,
      troughs: 1, churns: 1, handcarts: 1, carts: 2,
      roadFence: 'fencerail', yardFence: 'fencewattle',
      // DESTRUCTIBLES r1: steppe columns — trucks + field cars on the road
      // net, fuel dumps, bivouac clusters in the balkas
      trucks: 3, jeeps: 2, drumClusters: 3, camps: 3,
      modernClutter: { barrier: 4, roadsign: 5, cone: 7, transformer: 3, cablespool: 3 },
    },
  },

  horizon: {
    // low, endless: the ring must whisper, not wall — smallest amp in the
    // roster + heavy dust haze so the plain reads as if it continues forever
    baseHex: 0x77704a, amp: 0.65, style: 'rolling', treeline: 0.82,
    forestHex: 0x565232, rockHex: 0x7d7663, haze: 1.08, grain: 0.6,
  },

  sky: {
    // high dry-season sun through light dust: warm-white light, hazy skirt.
    // r2: rayleigh up / turbidity + warm casts down — the first render came
    // out sand-desert orange under a saturated navy zenith
    sunElevationDeg: 40, sunAzimuthDeg: 115,
    turbidity: 4.2, rayleigh: 1.15, mieCoefficient: 0.007, mieDirectionalG: 0.78,
    fogDensity: 0.00052, fogTintHex: 0xb3ab94, fogMix: 0.62, envIntensity: 0.18,
    cloudOpacity: 0.55, cloudOpacity2: 0.32, cloudTintHex: 0xfdf6ea,
    sunIntensity: 4.25, sunColorHex: 0xfff0d6, hemiIntensity: 0.30,
  },

  minimap: {
    base: [140, 124, 74], hard: [126, 116, 96], soft: [110, 102, 64],
    forest: 'rgba(74,88,40,0.85)', forestStroke: 'rgba(44,54,24,0.9)',
    // round 48: the only "water" is the salt pan — a pale crust on the plate
    water: 'rgba(216,210,190,0.78)', waterStroke: 'rgba(150,142,118,0.7)',
    roadCasing: 'rgba(70,58,38,0.9)', roadFill: 'rgba(212,192,148,0.95)',
    buildingFill: '#e8e2d0',
  },

  // behind the player deployment looking north-east: ally tanks near-field,
  // the kolkhoz road and the wadi running away to the caravanserai rise and
  // the escarpment in the dust haze
  shot: { pos: [-330, 36, -470], look: [60, 6, 60] },
} satisfies import('./contracts.ts').MapCompositionConfig;
