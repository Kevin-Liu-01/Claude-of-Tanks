// blackglass.js — collapsed arcologies and a bombed civic district laid over
// rolling transit cuts. The skyline is deliberately different from Steinburg:
// fewer buildings, far larger masses, and long diagonal firing corridors.

import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import { createMarshChannel } from './marshChannel.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS, TOWN_ROW_PLANS } from './townPlans.generated.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// The map-revival lane (2026-10-05): Suzhou Creek (Wusong River) runs west to east through the district, the
// International Settlement's banks and godowns on its south side, Zhabei's lilong and shophouses on its north. Its
// course follows the old flooded quarter's low ground; the four roads that meet it cross on bridges (terrain.ts
// resolves each `crossing: 'bridge'` station's deck from the road and the wet reach; the street kit dresses them).
// Elsewhere the creek is soft water a hull fords slowly.
const CREEK_STATIONS = [
  { x: -512, z: -40 }, { x: -420, z: -36 }, { x: -330, z: -26 }, { x: -265, z: -16 },
  { x: -213.3, z: -10, r: 10, dip: 0.7, crossing: 'bridge' as const }, // road 4's bridge
  { x: -165, z: 10 }, { x: -130, z: 34 }, { x: -100, z: 70 },
  { x: -65.2, z: 100, r: 10, dip: 0.7, crossing: 'bridge' as const }, // road 1's bridge (the north-west diagonal)
  { x: -20, z: 105 }, { x: 25, z: 104 },
  { x: 69.7, z: 100, r: 10, dip: 0.7, crossing: 'bridge' as const }, // road 0's bridge (the north-east diagonal)
  { x: 120, z: 96 }, { x: 165, z: 95 },
  // road 5's bridge: its deck stands 1.5 m over the water, so the south bank's road climbs onto it (the crossing sweep's
  // hull stopped against a deck laid level with the bank's falling road)
  { x: 210.2, z: 95, r: 10, dip: 0.7, crossing: 'bridge' as const, deckClearM: 1.5 },
  { x: 300, z: 95 }, { x: 400, z: 92 }, { x: 512, z: 90 },
].map((m) => ({ r: 17, dip: 1.4, ...(m.crossing ? { deckClearM: 0.6 } : {}), ...m }));
const BRIDGES = CREEK_STATIONS.filter((station) => station.crossing === 'bridge');
// the bank line read smooth (Amberford's: circles at 0.96 of their radius, laid half a radius apart)
const CREEK_BANK = [0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96,
  0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96] as const;
// the interpolated cells near a bridge keep inside the bridge station's own bank envelope, so the span stays short
const CREEK = createMarshChannel(CREEK_STATIONS, 0.5).map((station) => ({ ...station, radii: CREEK_BANK })).map((station) => {
  let r = station.r;
  for (const bridge of BRIDGES) {
    const index = CREEK_STATIONS.indexOf(bridge);
    const previous = CREEK_STATIONS[index - 1], next = CREEK_STATIONS[index + 1];
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    const tx = (next.x - previous.x) / length, tz = (next.z - previous.z) / length;
    const dx = station.x - bridge.x, dz = station.z - bridge.z;
    const along = Math.abs(dx * tx + dz * tz);
    if (along >= r) continue;
    const across = Math.max(0, bridge.r - Math.abs(-dx * tz + dz * tx));
    r = Math.min(r, Math.hypot(along, across));
  }
  return r === station.r ? station : { ...station, r };
});

export default {
  id: 'blackglass',
  // Suzhou Creek (the map-revival lane, 2026-10-05): Shanghai in the autumn of 1937, the creek between the
  // International Settlement and Zhabei; the id stays (saves, links, the census and the shards key on it)
  name: 'Suzhou Creek',
  blurb: 'Shanghai, autumn 1937: Art Deco towers and stone-gate lanes across four bridges from burning Zhabei',
  terrain: {
    hillScale: 0.62, microScale: 0.72, rimH: 36,
    // the creek (was the flooded quarter's two marshes on its course)
    marshes: CREEK,
    village: { x0: -294, x1: 304, z0: -288, z1: 302, cx: 6, cz: 16, feather: 54, flatten: 0.82, relief: 0.46 },
    roads: { paths: [
      [[-450, -430], [-330, -302], [-210, -174], [-76, -34], [74, 104], [212, 246], [354, 430]],
      [[390, -452], [276, -304], [160, -164], [42, -22], [-88, 126], [-218, 278], [-354, 444]],
      [[-438, -120], [-286, -110], [-142, -92], [8, -106], [162, -88], [318, -112], [446, -100]],
      [[-430, 178], [-284, 154], [-136, 178], [18, 150], [168, 180], [316, 156], [442, 180]],
      [[-238, -438], [-210, -280], [-232, -120], [-204, 42], [-230, 208], [-202, 432]],
      [[226, -438], [204, -278], [232, -118], [202, 42], [228, 210], [204, 432]],
    ] },
    landforms: [
      { kind: 'ridge', x: -288, z: 20, length: 520, width: 86, height: 8.0, yawDeg: -8, settlementScale: 0.72 },
      { kind: 'ridge', x: 292, z: 18, length: 520, width: 86, height: 8.2, yawDeg: 9, settlementScale: 0.72 },
      { kind: 'ridge', x: 10, z: 292, length: 360, width: 74, height: 6.8, yawDeg: 88, settlementScale: 0.70 },
      { kind: 'knoll', x: -164, z: -182, rx: 94, rz: 72, height: 6.0, yawDeg: 24, settlementScale: 0.65 },
      { kind: 'basin', x: 24, z: 54, rx: 122, rz: 104, height: -4.8, yawDeg: -12, settlementScale: 0.82 },
      { kind: 'knoll', x: 176, z: -214, rx: 86, rz: 62, height: 5.4, yawDeg: -18, settlementScale: 0.66 },
    ],
  },
  spawns: {
    player: { x: -248, z: -392 },
    // Bravo deploys in a 4 x 2 block like alpha's, centred where its old line of pads had its centroid, so every
    // objective keeps its reach (the bots lane, 2026-10-03: a corner block against a 500 m line of pads leans the battle).
    enemies: [{ x: 24.3, z: 391.7 }, { x: 16.3, z: 391.7 }, { x: 8.3, z: 391.7 }, { x: 0.3, z: 391.7 }, { x: 24.3, z: 401.7 }, { x: 16.3, z: 401.7 }, { x: 8.3, z: 401.7 }],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.37, clamp01(s * 0.18), clamp01(l * 0.44 + 0.03)],
    dirtTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.22), clamp01(l * 0.52 + 0.025)],
    rockTone: (h: number, s: number, l: number) => [0.62, clamp01(s * 0.18), clamp01(l * 0.52)],
    // round 47 (2026-09-23): the volcanic-glass district's own lifted sourced sets (sourcedTextures.ts TERRAIN_PLAN,
    // the Caldera recipe in this map's cool register) — it used to fall through to Verdant's sets
    sourcedPalette: 'blackglass',
    tintA: [0.65, 0.72, 0.76], tintB: [0.38, 0.43, 0.46], tintC: [0.82, 0.72, 0.61],
    roadTint: [0.32, 0.35, 0.37], roadTexMix: 0.88, townWear: 2.0, midRelief: 0.95,
    // the creek's water (the map-revival lane, 2026-10-05): liquid, its banks tight (Amberford's river ramp), the
    // city creek's grey-brown silt water, a dull sheen under the storm front, no surf
    seaLake: true, seaRamp: [0.10, 0.45], seaFoam: 0.05, iceDrift: 0.04, marshGloss: 0.7,
    mudTone: (h: number, s: number, l: number) => [0.11, clamp01(s * 0.45), clamp01(l * 0.62)],
    iceSky: [0.30, 0.33, 0.35],
  },
  // the city's broadleaves (the plane trees of the Settlement's avenues and the camphors read as broad oak crowns), the
  // creek's willows, the poplar rows of the delta's fields past the city
  vegetation: {
    species: ['oak', 'willow', 'poplar'], clusterMix: [['oak', 0.55], ['willow', 0.25], ['poplar', 0.20]],
    loneMix: [['oak', 0.5], ['willow', 0.3], ['poplar', 0.2]], rimMix: [['poplar', 0.4], ['oak', 0.35], ['willow', 0.25]],
    clusterCount: 18, loneCount: 36, rimCount: 62, grassDensity: 0.32,
    bushCount: 0.38, bushSpecies: 'oak',
  },
  props: {
    plan: [
      'arcology', 'needletower', 'parkingdeck', 'civichall', 'ruin', 'terracetower',
      'factory', 'parkingdeck', 'broadcasttower', 'foundryoffice', 'ruin', 'civichall',
      'arcology', 'parkingdeck', 'warehouse', 'megatower', 'ruin', 'firestation',
      'civichall', 'parkingdeck', 'needletower', 'ruin', 'terracetower', 'foundryoffice',
      'warehouse', 'parkingdeck', 'broadcasttower', 'civichall', 'ruin', 'megatower',
      'depot', 'parkingdeck', 'arcology', 'ruin', 'civichall', 'needletower',
    ],
    destructibleBuildings: [
      'motorpool', 'transformershed', 'commandtent', 'checkpointhut',
      'servicegarage', 'relaystation', 'corneroffice',
    ],
    tacticalBeats: [
      { id: 'sunken-exchange', role: 'brawl', x: -58, z: 42, yawDeg: 45,
        structure: 'motorpool', redoubt: true, wreck: true, wreckOffsetX: -18 },
      { id: 'transit-scar', role: 'scout', x: -228, z: -148, yawDeg: -8,
        structure: 'checkpointhut', outcrop: { count: 5, radius: 9, scaleMax: 2.7 } },
      { id: 'arcology-overlook', role: 'support', x: 232, z: 172, yawDeg: 8,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: 16 },
    ],
    blockFill: true, streetRows: true, streetRowsAfterLandmarks: true,
    // the creek runs through the district as it stood: every building keeps its place but those its water reaches
    // (props.ts settlementOverWater: a landmark moves off the water after the district stands, a row is left out)
    settlementOverWater: true,
    // the district stands as PR #9's head seated it (the owner's town-plan ruling), its street rows too, so the creek moves
    // only what its water reaches whatever it does to the ground under the rest
    townPlan: TOWN_PLANS.blackglass, townLightPlan: TOWN_LIGHT_PLANS.blackglass, townRowPlan: TOWN_ROW_PLANS.blackglass,
    // Shanghai in 1937 (maps/regional/shanghai*.ts): the Settlement's lanes, blocks and godowns, Zhabei's shophouses, the
    // Bund's banks and the Art Deco towers in the landmarks' footprints
    architecture: 'shanghai',
    // the creek's bridges (maps/mapKits.ts)
    extraKits: ['shanghai'],
    // the district's massive blocks keep their footprints off every carriageway, not only their own street's
    roadBuildingClearance: true,
    // The civic hall stood across road 3 at the district's crossroads and against road 1's edge, on the line between the
    // deployments, with no clear place within 30 m. Its nearest clear place (36 m south, beside alpha's approach) let
    // the south deployment win 28 of the swap test's 40 games (with the hall in the road: 22). On the avenue's north-west
    // side, 59 m north, it stands on that line again, off every carriageway, and the south wins 22.
    roadClearanceTargets: [{ from: [-101.8, -85.7], to: [-111.9, -27.8] }],
    streetRowRoadStride: 2, ruinChance: 0.54, curbs: true, lampposts: true,
    tones: makeRealisticCityBuildingTones({
      value: 0.73, saturation: 0.82, soot: 0.035, roofValue: 0.72, coolAccent: 0.015,
    }),
    wallStyle: 'brick', wallStoneChance: 0.82, buildingLat: [15, 7],
    sideSkip: 0.06, spacingPad: 4.0, maxSpread: 4.6,
    wallRuns: [
      [-310, -172, -210, -142, 2], [-304, 164, -204, 194, 3],
      [208, -170, 310, -140, 3], [208, 166, 310, 196, 2],
      [-154, -278, -50, -250, 1], [60, 260, 162, 290, 4],
      [-282, -20, -282, 86, 3], [284, -66, 284, 42, 2],
    ],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 124, outcrops: 18, craters: 116, rubblePiles: 164,
    hedgehogs: 34, sandbagLines: 28, townCraters: true,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: {
      stalls: 0, benches: 6, coreClutter: 38, drums: 22,
      trucks: 11, jeeps: 7, drumClusters: 10, camps: 4, modernClutter: 42,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    // Suzhou Creek (the map-revival lane, 2026-10-05): the Yangtze delta round Shanghai lies flat to the horizon — the
    // city's edge, the fields and their poplar rows, a far line of low hills in the haze — where the volcanic-glass
    // district kept a weathered volcanic field (the mountains lane, gauntlet wave 15); the coastal relief is the delta's
    // (horizonRelief.ts: an authored key wins over the map's identity)
    baseHex: 0x5f6a58, amp: 0.2, style: 'rolling', relief: 'coastal', treeline: 0.55,
    panorama: { regional: 'plain', trees: 12 },
    outlandRocks: 0.1, forestHex: 0x33473a, rockHex: 0x6d7068, haze: 0.98, grain: 0.5,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'ash-veil', nightGlow: 0.7, nightGlowHex: 0xffc890 },
  sky: {
    sunElevationDeg: 18, sunAzimuthDeg: 242, turbidity: 8.4, rayleigh: 1.3,
    mieCoefficient: 0.013, mieDirectionalG: 0.88, fogDensity: 0.00082,
    fogTintHex: 0x788794, fogMix: 0.65, envIntensity: 0.18,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the overcast deck authored explicitly (it took
    // the auto branch's 340 m / 0.00015 / 2400 m) — a 330 m deck of 2300 m masses with a thinner slant haze
    // (0.00013) so the low sky between the arcologies keeps modeled cloud; diffuse light patchiness (cloudShadowAmp 0.12)
    cloudOpacity: 1.34, cloudOpacity2: 1.12, cloudTintHex: 0xaeb8c1,
    cloudAltM: 330, cloudHazeK: 0.00013, cloudUvM: 2300, cloudShadowAmp: 0.12,
    sunIntensity: 3.9, sunColorHex: 0xffc697, hemiIntensity: 0.32, postExposure: 0.91, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.5 / 0xffb77e / 0.38); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x4b4845 },
  },
  minimap: {
    base: [58, 68, 73], hard: [74, 81, 86], soft: [48, 57, 61],
    forest: 'rgba(35,52,47,.70)', forestStroke: 'rgba(22,33,30,.88)',
    water: 'rgba(52,78,90,.76)', waterStroke: 'rgba(31,51,60,.88)',
    roadCasing: 'rgba(20,25,29,.96)', roadFill: 'rgba(91,101,107,.95)', buildingFill: '#b9b8b4',
  },
  shot: { pos: [-344, 48, -308], look: [18, 12, 46] },
  // the creek's sea state (round 66's FFT ocean runs on every water sheet): a slow, silted tidal creek between quays —
  // a light breeze down its length, short fetch, low swell-free chop, no foam, and little light reaching the mud
  ocean: { windSpeed: 2.2, windDirDeg: 80, fetchKm: 1.5, amplitude: 0.5, foam: 0, breakers: 0.05, caustics: 0.15 },
} satisfies import('./contracts.ts').MapCompositionConfig;
