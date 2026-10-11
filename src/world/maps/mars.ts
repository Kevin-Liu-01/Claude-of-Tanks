import { OLYMPUS_SETTLEMENT } from './marsSettlement.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './townPlans.generated.ts';
import { MARS_SKY_PRESET } from '../../engine/marsAtmosphere.ts';
// src/world/maps/mars.ts — Olympus Basin: a rust-red impact basin under a galaxy sky, its research
// station scattered across the floor (owner 2026-09-18: "add mars map mode (called mars mode), make it have
// space bases and make it look like a proper galaxy map"). The sky preset forces the night dome's starfield
// with a wide galactic band, magenta nebula clouds and a large pale planet; a low cold key light keeps the
// dunes and mesas readable. No vegetation: the station pieces, boulders, craters and wrecks carry the field.
//
// Layout (maps-and-layouts lane, 2026-10-03; docs/MAP-LAYOUT-BRIEF.md, with the map's own distance bands): the arena
// keeps its compact scale, the deployments 470 m apart. The floor had been laid out on Verdant's swells and strongpoint
// sites under a seed-random noise mesa field, whose walls stood under the country roads at two of three terrain seeds
// (30 % grades); alpha deployed at the station's south edge and bravo on the open northern floor, and the south won 34
// of 40 swap-test games. Now the layout turns about the station (7.5, 20): the teams come in on the north-south road,
// each block 257 m from the station; four authored mesas (flat-topped buttes of layered rock with talus aprons, every end
// a nose) stand in pairs north-west and south-east, south-west and north-east of it, off the roads; Arsia Crater west of
// the station has its twin to the east; the strongpoints pair about it too (the habitat ring and the relay station in
// the lanes, a fuel depot in front of each deployment); and the zone-control discs stand on paired yards of equal reach
// with the middle disc on the deployments' bisector at the station's west yard (also the turbo-ball kickoff). The
// station stands as PR #9's head seated it (props townPlan / townLightPlan).

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The fractured blocks' basalt (sceneryRocks.ts 'breccia'): dark rust, the dust paler at the foot. */
const MARS_BASALT: readonly [number, number, number] = [0.03, 0.36, 0.3];

export default {
  id: 'mars',
  name: 'Olympus Basin',
  blurb: 'A galaxy-lit Mars colony with crew habitats, research greenhouses, rover depots and an ascent landing field',

  terrain: {
    hillScale: 0.8,
    microScale: 0.75,
    rimH: 34,
    dunes: { amp: 5.5 },
    // the authored mesas and craters replace the noise mesa field (its walls stood wherever the noise crossed its
    // threshold, under the country roads at two of three terrain seeds), and the rock gate reads them (landformRock)
    mesas: null, landformRock: true,
    marshes: [],
    // the two outer zone yards, each the other's rotation about the station (apron bank law: docs/MAP-LAYOUT-BRIEF.md)
    hardstands: [
      { x: -170, z: 120, width: 56, length: 56, yawDeg: 0, level: 3.1, grade: 0, bankM: 16 },
      { x: 185, z: -80, width: 56, length: 56, yawDeg: 119, level: 5.4, grade: 0.08, bankM: 16 },
    ],
    // the station compound on the basin floor
    village: { x0: -110, x1: 110, z0: -80, z1: 120, cx: 0, cz: 20, feather: 44, flatten: 0.94 },
    landforms: [
      // The layout turns about the station (7.5, 20): every landform below stands paired with its rotation there.
      // Arsia Crater west of the station and its twin east of it: raised rims round sunken bowls (landformGeology.ts
      // 'cone' with a wide crater), the basin floor's own impact scars
      ...[[-300, 130], [315, -90]].map(([x, z]) => ({ kind: 'knoll', x, z, rx: 74, rz: 68, height: 7, yawDeg: 12,
        geology: { profile: 'cone' as const, crater: { rim: 0.72, depthM: 6 }, outline: 0.12, rough: 0.6,
          gullies: { count: 14, depthM: 1.2, width: 0.5 } } })),
      // the gate buttes: one beside the road in front of each deployment, each the other's rotation about the station, so
      // a block's bots leave round it and the deployments stay screened (the pacing receipt, 2026-10-03: with the blocks
      // 235 m out on the open road a 2v2 ended in 81 s)
      ...[[-52, -182], [67, 222]].map(([x, z]) => ({ kind: 'knoll', x, z, rx: 20, rz: 24, height: 14, yawDeg: 8,
        corridorScale: 1, settlementScale: 1,
        // sheer walls with the talus only at the foot (landformGeology inselbergSection's rim, Redrock's jebels), so a hull
        // cannot climb onto one and fall off it
        geology: { profile: 'inselberg' as const, outline: 0.18, foot: 0.66, footVary: 0.12, apron: 0.18, rim: 0.86,
          bosses: { count: 3, heightM: 2 }, flutes: { count: 10, depth: 0.5 }, rough: 1.0,
          gullies: { count: 5, depthM: 3, width: 0.35 } } })),
      // the mesas: flat-topped buttes of layered rock with talus aprons, a long pair north-west and south-east of the
      // station and a shorter pair south-west and north-east of it, each off the roads and the deployment corridors,
      // every end a nose (no taper ramps onto a cap)
      ...[[-200, 250, 220, 64, 24, -40], [215, -210, 220, 64, 24, -40], [-215, -160, 180, 56, 20, 50], [230, 200, 180, 56, 20, 50]]
        .map(([x, z, length, width, height, yawDeg]) => ({ kind: 'ridge', x, z, length, width, height, yawDeg,
          corridorScale: 1, settlementScale: 1,
          geology: { profile: 'butte' as const, wall: [0.35, 0.6] as const, apron: 0.28, cliffEnd: 'nose' as const,
            strata: { stepM: 4, riser: 0.35 }, outline: 0.22, rough: 0.8, gullies: { count: 4, depthM: 2, width: 0.5 } } })),
    ],
  },

  // Olympus Basin keeps its scale (the owner's Mars mode, 2026-09-18: a compact arena under the mars ruleset's 0.38 g):
  // its deployments stand 470 m apart where the brief's fields stand 600-860 m, so the distance bands take the map's
  // own scale (about 0.64 of the brief's) and stay enforced (docs/MAP-LAYOUT-BRIEF.md "Bands of a map's own").
  layoutBrief: { bands: {
    spawnSeparationM: { band: [420, 520], reason: 'the compact low-gravity arena stands its deployments about 500 m apart (518 m: each block 257 m from the station on its road)' },
    sightMedianM: { band: [55, 100], reason: 'the brief\'s 80-150 m median scaled to a 470 m field (x 0.64): crater rims, dunes and mesas break lines shorter here' },
    sightLongShare: { band: [0.01, 0.15], reason: 'a 300 m line is 64 % of the separation here (35-50 % on the brief\'s fields), so fewer rays reach it' },
    sightCloseShare: { band: [0.25, 0.68], reason: 'on a 470 m field more of the blocked rays end inside 100 m; the ceiling rises with the scale' },
  } },

  spawns: {
    // The teams come in from the basin's two ends on the north-south road, each block 257 m from the station, bravo's
    // seven pads the rotation of alpha's block about the station (the swap test, 2026-10-03: alpha's block at the
    // station's south edge won 34 of 40 games against bravo's on the northern floor, the deployments exchanged or not).
    player: { x: -20.9, z: -232.7 },
    enemies: [{ x: 47.9, z: 272.7 }, { x: 39.9, z: 272.7 }, { x: 31.9, z: 272.7 }, { x: 23.9, z: 272.7 }, { x: 47.9, z: 282.7 }, { x: 39.9, z: 282.7 }, { x: 31.9, z: 282.7 }],
  },

  splat: {
    // regolith: rust-orange with a compressed luminance range under the dim cold key light
    grassTone: (h: number, s: number, l: number) => [0.048, 0.50, clamp01(0.20 + l * 0.66)],
    dirtTone: (h: number, s: number, l: number) => [0.040, 0.42, clamp01(0.24 + l * 0.36)],
    sandstone: true,
    // round 47 (2026-09-23, owner: "ground patterns are too black"): strata midpoint 0.40 → 0.48 (desert 0.53) — this
    // IS the rendered rock here (sourcedPalette 'badlands' keeps R procedural), so the mesa walls lift a step
    rockTone: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.55), clamp01(0.48 + (l - 0.5) * 0.62)],
    mudTone: (h: number, s: number, l: number) => [0.05, 0.36, clamp01(l * 1.2 + 0.06)],
    mudRough: 1.1,
    // round 47: tintB 0.82/0.66/0.56 → 0.86/0.74/0.66 (same 23° hue, luma ×0.70 → ×0.77) under the dim cold key
    tintA: [1.06, 0.90, 0.76], tintB: [0.86, 0.74, 0.66], tintC: [1.08, 0.94, 0.82],
    roadTint: [0.86, 0.74, 0.64],
    strata: 0.12,
    microAmp: 0.42,
    rippleDir: [0.7, 0.7],
    rippleAmp: 0.48,
    midRelief: 0.6,
    midReliefFar: 820,
    sandMacro: 1.0,
    // the sourced ground sets: Redrock's rust sand palette (sourcedTextures.ts TERRAIN_PLAN) until Mars owns one
    sourcedPalette: 'badlands',
  },

  vegetation: {
    // no life: the three-archetype species table keeps the vegetation pipeline typed, every count is zero
    species: ['acacia', 'cedar', 'oak'],
    clusterMix: [['acacia', 0.5], ['cedar', 0.3], ['oak', 0.2]],
    loneMix: [['acacia', 0.5], ['cedar', 0.3], ['oak', 0.2]],
    rimMix: [['acacia', 0.5], ['cedar', 0.3], ['oak', 0.2]],
    clusterCount: 0,
    loneCount: 0,
    rimCount: 0,
    clusterScrub: 0,
    grassDensity: 0,
    // the ground detail and tuft textures follow the regolith, not the temperate green defaults
    grassTexTone: (h: number, s: number, l: number) => [0.048, clamp01(s * 0.55), clamp01(l * 0.88 + 0.08)],
    tuftTone: (h: number, s: number, l: number) => [0.045, 0.30, clamp01(l * 0.7 + 0.12)],
    bushCount: 0,
    bushSpecies: 'acacia',
  },

  props: {
    orbitalSettlement: OLYMPUS_SETTLEMENT,
    yardClutter: false,
    // sourced building tints (sourcedTextures BUILDING plan): the badlands dust set for the station's huts
    sourcedPalette: 'badlands',
    // the research station: station pieces carry the compound; the town plan keeps to yard gantries and
    // container rows so nothing reads as a terrestrial street
    plan: ['gantry', 'containerRow', 'containerRow', 'gantry', 'containerRow', 'gantry'],
    // one placement per id (props.ts destructibleBuildings loop; the structureKit receipt pins
    // uniqueness): ten orbital families supplement the authored settlement districts.
    destructibleBuildings: ['habdome', 'habmodule', 'solararray', 'commsmast', 'fueltanks', 'landingpad',
      'missioncontrol', 'greenhouse', 'ascentlander', 'rovergarage'],
    tacticalBeats: [
      // the strongpoints stand in pairs about the station (each 60 m or more from Verdant's old strongpoint sites, which
      // the brief keeps clear): the habitat ring in the west lane and the relay station in the east lane, and a fuel depot
      // in front of each deployment
      { id: 'west-habitat-ring', role: 'brawl', x: -170, z: 0, yawDeg: 14,
        structure: 'habdome', redoubt: true, outcrop: { count: 7, radius: 12, scaleMax: 3.4 }, wreck: true, wreckOffsetX: -16 },
      { id: 'east-relay-station', role: 'scout', x: 185, z: 40, yawDeg: 194,
        structure: 'commsmast', outcrop: { count: 6, radius: 10, scaleMax: 3.0 } },
      { id: 'north-fuel-depot', role: 'support', x: -10, z: 205, yawDeg: 4,
        structure: 'fueltanks', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: -15 },
      { id: 'south-fuel-depot', role: 'support', x: 25, z: -165, yawDeg: 184,
        structure: 'fueltanks', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: 15 },
    ],
    sideSkip: 0.14, spacingPad: 8,
    // the station's yard plan stands as PR #9's head seated it (the owner's town-plan ruling, 2026-10-03); a piece of it
    // that stands in a carriageway moves by the least distance that clears it
    townPlan: TOWN_PLANS.mars,
    townLightPlan: TOWN_LIGHT_PLANS.mars,
    roadBuildingClearance: true,
    buildingLat: [12, 5], maxSpread: 2.0,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.58, 0.05, clamp01(l * 0.92 + 0.10)],
      roof: (h: number, s: number, l: number) => [0.6, clamp01(s * 0.3), clamp01(l * 1.0)],
      stone: (h: number, s: number, l: number) => [0.04, clamp01(s * 0.9 + 0.05), clamp01(l * 1.0)],
      wood: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.6), clamp01(l * 0.9)],
      straw: null,
    },
    rockTone: (h: number, s: number, l: number) => [0.035, 0.40, clamp01(l * 0.92 + 0.04)],
    wallStoneChance: 1.0,
    wallRuns: [],
    well: false, hayCrates: false, fences: false, telegraph: false, carts: false, logs: false,
    haystacks: 0, rocks: 380, outcrops: 72, craters: 128,
    rubblePiles: 10,
    // the map-vehicles lane (2026-10-06, the period ruling): Olympus Basin: the next generation's hulls
    tankWrecks: { era: 'next-generation', count: 5, debris: true, ids: ['abramsx', 't14', 'challenger_3', 'm1a3', 'kf51'] },
    // 2026-09-19: the station perimeter keeps a ring of steel anti-tank
    // hedgehogs (every map fields complete three-beam compounds).
    sandbagLines: 0,
    hedgehogs: 12,
    wallStyle: 'adobe',
    inhabit: {
      stalls: 0, benches: 0, coreClutter: 6,
      pots: 0,
      troughs: 0, laundry: 0, handcarts: 0, carts: 0,
      trucks: 0, jeeps: 0, drumClusters: 8, camps: 0,
      modernClutter: { barrier: 6, roadsign: 0, cone: 6, transformer: 3, cablespool: 4 },
    },
  },

  // The hitbox lane (2026-10-08; round 2): the stones' own colliders let the fights round the station through where the
  // boulders' old prisms had stood, and bravo, deploying north, fell from 53.8 to 41.2 % of the swap-balanced games
  // (batch 5's fairness at 80): its tanks died more 40-100 m north of the station (f17's death census; round 2's kill trace). Fields of the
  // basin's own shattered basalt there, size-graded, half sunk in the dust banked against them, give bravo's line the
  // cover the prisms had faked.
  scenery: {
    rocks: [
      { form: 'blocks', geology: 'breccia', x: -14, z: 106, radius: 6, height: 2.6, yawDeg: 30, tone: MARS_BASALT, name: 'the basalt blocks north of the station' },
      { form: 'blocks', geology: 'breccia', x: -62, z: 104, radius: 6, height: 2.4, yawDeg: 110, tone: MARS_BASALT, name: 'the basalt blocks north-west of the station' },
      { form: 'blocks', geology: 'breccia', x: 41, z: 58, radius: 6, height: 2.5, yawDeg: 160, tone: MARS_BASALT, name: 'the basalt blocks north-east of the station' },
      // (2026-10-10, round 2 on main) 7 m further from zone 2's authored seat (-40, 36): a zone keeps 30 m clear of solids
      // (matchPlacement), and the field's nearest blocks stood inside that disc, so the seat slid to (-36.9, 28.6)
      { form: 'blocks', geology: 'breccia', x: -3, z: 60, radius: 5.5, height: 2.4, yawDeg: 70, tone: MARS_BASALT, name: 'the basalt blocks by the north road' },
    ],
  },
  horizon: {
    baseHex: 0x6a3a2b, amp: 1.2, style: 'mesa', banding: 0.22,
    rockHex: 0x8a4a34, haze: 0.38, grain: 0.85,
    // the mountains lane (2026-10-03): the outland boulders a shade sparser — they follow the ring's tilted beds, and
    // the map's horizon draws no more triangles than the PR head's
    outlandRocks: 0.97,
  },

  sky: MARS_SKY_PRESET,

  minimap: {
    base: [128, 70, 48], hard: [146, 90, 66], soft: [104, 58, 42],
    forest: 'rgba(90,60,44,0.6)', forestStroke: 'rgba(60,38,28,0.8)',
    water: 'rgba(80,60,60,0.5)', waterStroke: 'rgba(50,36,36,0.7)',
    roadCasing: 'rgba(70,40,30,0.92)', roadFill: 'rgba(196,150,120,0.95)',
    buildingFill: '#e2e6ea',
  },

  shot: { pos: [-90, 44, -170], look: [50, 8, 160] },
} satisfies import('./contracts.ts').MapCompositionConfig;
