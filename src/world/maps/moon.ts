// src/world/maps/moon.ts — Earthrise Basin, redesigned 2026-10-02 (maps-and-layouts lane B; docs/MAP-LAYOUT-BRIEF.md).
// The regolith palette, the airless sky with its Earth, the outpost's modules and the name are the map's identity and
// stay; the ground under them is new. The old basin let each team's pad see the other across open ground, offered two
// lanes, and stood its research outpost off to one side with one module far from any track.
//
// Reference: the Taurus-Littrow valley of Apollo 17 (December 1972): a flat-floored valley between two massifs, its floor
// pitted with craters of every size (Camelot, Horatio, Shorty), boulders shed from the massif flanks, and the landing
// site in the middle of the floor with the rover tracks radiating from it.
//
// The story on the ground: the valley runs west to east between the South and North massifs, each team assembling
// behind one of them. The massifs are each broken by one saddle where a rover track climbs over to the valley floor.
// The floor is a mare plain pitted with craters (bowls with raised rims and their ejecta), and the research outpost
// stands in the middle of it round its landing field, where the tracks meet.
//
// The layout is rotationally symmetric about the landing field (0, 0) in its massifs, craters, tracks, pads,
// strongpoints and objectives: alpha deploys behind the South Massif west of its saddle, bravo behind the North Massif
// east of its saddle, so neither saddle opens a view from pad to pad. The zone-control discs stand on the landing field
// (also the turbo-ball kickoff) and on two crater-free stretches of the floor either side of it.
import mars from './mars.ts';
import type { MapCompositionConfig } from './contracts.ts';
const grey = (_h: number, _s: number, l: number): [number, number, number] => [0.60, .025, .30 + l * .35];
export default {
  id: 'moon', name: 'Earthrise Basin',
  blurb: 'Lunar crater rims, a research outpost and long shadows beneath a vast blue Earth',
  terrain: {
    hillScale: .40, microScale: .46, rimH: 24, marshes: [], lakes: [], fieldTrenches: false,
    // the outpost round its landing field
    village: { x0: -95, x1: 95, z0: -95, z1: 95, cx: 0, cz: 0, feather: 35, flatten: .9 },
    // the landing field: a level apron where the zone-control disc and the turbo-ball kickoff seat
    hardstands: [{ x: 0, z: 0, width: 72, length: 72, yawDeg: 0, grade: 0 }],
    roads: { paths: [
      // 0 — the north-south rover track: from the south edge over the South Massif's saddle to the landing field, and on
      // over the North Massif's saddle to the north edge (its two halves are each other's rotation).
      [[150, -448], [136, -400], [118, -340], [100, -280], [76, -220], [48, -150], [24, -80], [0, 0], [-24, 80],
        [-48, 150], [-76, 220], [-100, 280], [-118, 340], [-136, 400], [-150, 448]],
      // 1 — the west-east rover track along the valley floor through the landing field.
      [[-448, 70], [-380, 64], [-300, 50], [-220, 34], [-150, 20], [-80, 8], [0, 0], [80, -8], [150, -20], [220, -34],
        [300, -50], [380, -64], [448, -70]],
      // 2 / 3 — the survey loops: from the landing field round the craters on each side and back to the long track.
      [[-80, 8], [-120, -60], [-200, -110], [-290, -96], [-330, -40], [-320, 10], [-300, 50]],
      [[80, -8], [120, 60], [200, 110], [290, 96], [330, 40], [320, -10], [300, -50]],
    ] },
    landforms: [
      // The South and North massifs, each broken by its saddle (rotation pairs): the south massif's west and east
      // blocks leave the saddle at x 70..160; the north massif's at x -160..-70.
      { kind: 'ridge', x: -230, z: -345, length: 520, width: 130, height: 13, yawDeg: -3, corridorScale: 1 },
      { kind: 'ridge', x: 330, z: -340, length: 300, width: 120, height: 11, yawDeg: 4, corridorScale: 1 },
      { kind: 'ridge', x: 230, z: 345, length: 520, width: 130, height: 13, yawDeg: -3, corridorScale: 1 },
      { kind: 'ridge', x: -330, z: 340, length: 300, width: 120, height: 11, yawDeg: 4, corridorScale: 1 },
      // The craters of the valley floor (rotation pairs): each a bowl inside a raised rim of ejecta. The last pair
      // (2026-10-03) keeps the middle lane's cover over the layout brief's band once the map-borders lane's edge
      // pass had moved the props beside it (0.156 -> 0.146; now 0.164).
      ...[[-230, -150, 56, 16], [205, -190, 40, 12], [-70, -230, 34, 10], [320, -150, 46, 13], [-120, 165, 30, 9],
        [-60, -110, 22, 7], [-5, -122, 20, 6], [200, -75, 20, 6], [-74, -34, 16, 5]]
        .flatMap(([x, z, r, depth]) => [
          { kind: 'knoll', x, z, r: r * 1.32, height: depth * 0.62, settlementScale: 1, corridorScale: 1 },
          { kind: 'basin', x, z, r, height: -depth * 1.45, settlementScale: 1, corridorScale: 1 },
          { kind: 'knoll', x: -x, z: -z, r: r * 1.32, height: depth * 0.62, settlementScale: 1, corridorScale: 1 },
          { kind: 'basin', x: -x, z: -z, r, height: -depth * 1.45, settlementScale: 1, corridorScale: 1 },
        ]),
    ],
  },
  spawns: {
    // Alpha assembles behind the South Massif west of its saddle; bravo's seven pads are its rotation behind the North
    // Massif east of its saddle.
    player: { x: -60, z: -420 },
    enemies: [
      { x: -60, z: 440 }, { x: 0, z: 410 }, { x: 60, z: 440 }, { x: 120, z: 410 },
      { x: 180, z: 440 }, { x: 30, z: 400 }, { x: 90, z: 400 },
    ],
  },
  splat: { ...mars.splat, sourcedPalette: 'moon', sandstone: false,
    grassTone: grey, dirtTone: grey, rockTone: grey, mudTone: grey,
    tintA: [.94,.96,1], tintB: [.82,.84,.88], tintC: [1,1,1], roadTint: [.76,.78,.82], rippleAmp: .05, strata: 0,
  },
  vegetation: { ...mars.vegetation },
  props: { ...mars.props, sourcedPalette: 'winter', plan: [],
    // Olympus Basin's recorded station (props townPlan / townLightPlan) stays on Mars
    townPlan: undefined, townLightPlan: undefined, roadBuildingClearance: undefined,
    // the outpost's own module families are its strongpoints' structures
    destructibleBuildings: ['habmodule', 'commsmast', 'fueltanks'],
    // Three strongpoint pairs, each the other's rotation about the landing field: the track posts below the saddles,
    // the crater-rim masts on the survey loops, the fuel caches on the long track.
    tacticalBeats: [
      { id: 'south-saddle-post', role: 'brawl', x: 75, z: -118, yawDeg: -20, structure: 'habmodule', redoubt: true,
        outcrop: { count: 5, radius: 9 } },
      { id: 'north-saddle-post', role: 'brawl', x: -75, z: 118, yawDeg: 160, structure: 'habmodule', redoubt: true,
        outcrop: { count: 5, radius: 9 } },
      { id: 'west-crater-mast', role: 'scout', x: -180, z: -40, yawDeg: 0, structure: 'commsmast',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'east-crater-mast', role: 'scout', x: 180, z: 40, yawDeg: 180, structure: 'commsmast',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'west-fuel-cache', role: 'support', x: -340, z: 100, yawDeg: 90, structure: 'fueltanks', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
      { id: 'east-fuel-cache', role: 'support', x: 340, z: -100, yawDeg: -90, structure: 'fueltanks', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
    ],
    rockTone: grey, rocks: 260, outcrops: 48, craters: 90, rubblePiles: 0, hedgehogs: 0,
    // The hitbox lane (2026-10-08): the stones' own colliders took from the brief's cover the empty corners their legacy
    // records had counted, and the valley's middle band fell under its band (coverMidShare 0.308 -> 0.296 of 0.30).
    // Three pairs of outcrops of the valley's own boulders, each pair the other's rotation about the landing field and
    // clear of the zone-control discs, each a crescent bulging toward the side it shelters from, put real hull-down cover
    // back on the open floor where the layout metric found it short.
    coverOutcrops: [
      { x: 106, z: 88, towardDeg: -108, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders north-east of the outpost' },
      { x: -106, z: -88, towardDeg: 72, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders south-west of the outpost' },
      { x: 244, z: -26, towardDeg: -128, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders on the east floor' },
      { x: -244, z: 26, towardDeg: 52, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders on the west floor' },
      { x: -224, z: 58, towardDeg: -71, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders on the west floor, north' },
      { x: 224, z: -58, towardDeg: 109, count: 5, radius: 7, scaleMin: 2.3, scaleMax: 3.2, name: 'the boulders on the east floor, south' },
    ],
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'cold-war', count: 0, debris: true, ids: [] },
    // 2026-10-06 (the map-vehicles lane, P5): Apollo 17's rover where the crews left it — the Lunar Roving Vehicle by
    // the ascent stage, its twin by the landing pad at the outpost's rotation (maps/vehicleSetPieces.ts)
    vehicleSetPieces: [
      { kind: 'lrv' as const, x: 108, z: -64, yawDeg: 215 },
      { kind: 'lrv' as const, x: -108, z: 64, yawDeg: 35 },
    ],
    // The outpost round the landing field, each module paired with one at its rotation.
    orbitalSettlement: [
      { id: 'lunar-control', structure: 'missioncontrol', x: 58, z: 54, yawDeg: 0 },
      { id: 'lunar-crew-dome', structure: 'habdome', x: -58, z: -54, yawDeg: 180 },
      { id: 'lunar-crew-a', structure: 'habmodule', x: -62, z: 52, yawDeg: 90 },
      { id: 'lunar-crew-b', structure: 'habmodule', x: 62, z: -52, yawDeg: 90 },
      { id: 'lunar-lander', structure: 'ascentlander', x: 88, z: -82, yawDeg: 0 },
      { id: 'lunar-pad', structure: 'landingpad', x: -88, z: 82, yawDeg: 0 },
      { id: 'lunar-rovers', structure: 'rovergarage', x: -90, z: -84, yawDeg: 180 },
      { id: 'lunar-fuel', structure: 'fueltanks', x: 90, z: 84, yawDeg: 0 },
      { id: 'lunar-relay', structure: 'commsmast', x: 34, z: 96, yawDeg: 0 },
      { id: 'crater-relay', structure: 'commsmast', x: -34, z: -96, yawDeg: 0 },
      ...[0, 1, 2].flatMap((i) => [
        { id: `lunar-power-${i}`, structure: 'solararray', x: 95 + i * 30, z: 175, yawDeg: 25 },
        { id: `lunar-power-${i + 3}`, structure: 'solararray', x: -95 - i * 30, z: -175, yawDeg: 25 },
      ]),
    ],
  },
  horizon: { baseHex: 0x686b73, rockHex: 0x858a94, amp: 1.35, style: 'rolling', treeline: 0,
    treelineLayers: 0, ground: 'sand', relief: 'martian', haze: 0, grain: .7, farRange: true,
    // the mountains lane (2026-10-02): the moon keeps its own walls — the carved landform drew straight-flanked
    // pyramids on these airless ranges (the skyline cone measure, horizonMassif.selftest.mjs: 0 -> 13 over three seeds)
    massif: false },
  sky: { skyIntensity: 0, nightSky: 1, galaxy: .35, nebulaHex: 0, earth: 1, planetDeg: 18, planetHex: 0x8abdff,
    sunElevationDeg: 28, sunAzimuthDeg: 48, turbidity: 1, rayleigh: 0, mieCoefficient: 0,
    fogDensity: 0, fogMix: 0, envIntensity: .3, cloudOpacity: 0, cloudOpacity2: 0, cloudShadowAmp: 0,
    sunIntensity: 3.5, sunColorHex: 0xf1f4ff, hemiIntensity: .38, fillIntensity: .16, postExposure: .98,
    atmosphere: { rayleighScale: 0, mieScale: 0, ozoneScale: 0, groundAlbedoHex: 0x676b73 },
  },
  minimap: { ...mars.minimap, base: [108,111,118], hard: [145,148,155], soft: [90,93,100],
    roadFill: 'rgba(180,185,195,.95)', roadCasing: 'rgba(60,65,75,.9)' },
  shot: { pos: [-175,38,-195], look: [110,167.55,65] },
} satisfies MapCompositionConfig;
