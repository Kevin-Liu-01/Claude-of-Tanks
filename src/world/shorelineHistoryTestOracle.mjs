import { createLakeChannel } from './maps/marshChannel.ts';

// Test-only reconstruction of the three subsequently edited inputs at
// 2b2d14b39ce3ef8cdf567ed35c3cf2d1c79c16ea. Verified against the Git blobs:
// polders.ts  1ce81f35630258159be6c9e64076bdf74e4c446f
// oasis.ts    34e0cf6ace2021eec364e389d1ed1ff5ee9b557f
// mangrove.ts b6c00c4f2a739e2d75713eed831229397804e0d1
// Everything not listed remains the current input: the original immutable
// full-config / pixel digests in the callers still reject unrelated drift.
// No Git checkout, runtime loader hook or production dependency on this file.
export function historicalShorelineConfig(cfg) {
  if (cfg.id === 'oasis') return { ...cfg, terrain: { ...cfg.terrain, lakes: [
    { x: -138, z: -16, r: 52, depth: 0.75, level: -1.2 },
    { x: -182, z: 32, r: 57, depth: 0.75, level: -1.2 },
    { x: -134, z: 84, r: 48, depth: 0.65, level: -1.2 },
  ] } };
  if (cfg.id === 'mangrove') return { ...cfg, vegetation: { ...cfg.vegetation,
    authoredTrees: cfg.vegetation.authoredTrees.map(tree => tree.id === 'southern-tidal-bank'
      ? { ...tree, path: [[122, -306], [122, -208], [154, -130]] } : tree),
  } };
  if (cfg.id !== 'polders') return cfg;
  const { shoreDirt: _laterOptIn, ...splat } = cfg.splat;
  return { ...cfg, terrain: { ...cfg.terrain, lakes: [
    ...createLakeChannel([{ x: -218, z: -312, r: 22 }, { x: -168, z: -312, r: 22 }, { x: -168, z: -240, r: 22 }], 1.4),
    ...createLakeChannel([{ x: 80, z: -220, r: 26 }, { x: 80, z: -286, r: 26 }, { x: 164, z: -286, r: 26 }], -2.6),
    ...createLakeChannel([{ x: 136, z: -36, r: 24 }, { x: 136, z: 16, r: 24 }, { x: 204, z: 16, r: 24 }], -3.3),
    ...createLakeChannel([{ x: -196, z: 252, r: 23 }, { x: -154, z: 252, r: 23 }, { x: -154, z: 278, r: 23 }], 0),
    { x: 100, z: 282, r: 23, level: -5.4 }, { x: 74, z: 282, r: 23, level: -5.4 },
    { x: 126, z: 282, r: 23, level: -5.4 }, { x: 100, z: 308, r: 23, level: -5.4 },
  ] }, spawns: { player: { x: -112, z: -390 }, enemies: [
    { x: -246, z: 390 }, { x: -170, z: 426 }, { x: -92, z: 378 }, { x: -10, z: 420 },
    { x: 76, z: 386 }, { x: 162, z: 422 }, { x: 248, z: 388 },
  ] }, splat: { ...splat, fieldPatch: 1 },
  vegetation: { ...cfg.vegetation, authoredTrees: [
    { id: 'west-field-headland', species: 'poplar', path: [[-226, -174], [-232, -50], [-238, 102], [-214, 192]], count: 34, width: 0.4 },
    { id: 'east-drain-willow-edge', species: 'willow', path: [[144, -320], [176, -318], [199, -298], [198, -268]], count: 18, width: 0.5 },
  ] }, horizon: { ...cfg.horizon, amp: 0.50, treeline: 0.55 } };
}

// The original palette other29 and Reservoir RGBA receipts predate c8476fa77
// (the commit immediately before the tests landed). The exact parent is
// f4854d5132577f0be491de542ea5a850a82800dc; Reservoir's source Git blob is
// df9812021b188253d21fe029dba193fe4d8f124d. Retain those inputs too.
export function historicalReservoirConfig(cfg) {
  const { navigationWaterPolicy: _laterPolicy, ...base } = cfg;
  const { hardstands: _laterHardstand, ...terrain } = cfg.terrain;
  return { ...base, terrain: { ...terrain, roads: { paths: [
    [[-102, -464], [-138, -116], [-138, -42], [-82, -42], [-82, 100], [-124, 222], [-62, 464]],
    [[-362, -462], [-334, -280], [-320, -94], [-344, 94], [-302, 282], [-242, 464]],
    [[302, -458], [42, -244], [-22, -102], [-82, -42], [-22, 42], [-4, 78], [40, 242], [308, 464]],
    [[374, -448], [342, -276], [348, -96], [346, 92], [340, 280], [370, 464]],
    [[-302, 282], [-124, 222], [40, 242], [180, 266], [340, 280]],
  ] } }, spawns: { player: { x: -108, z: -392 }, enemies: [
    { x: -252, z: 386 }, { x: -168, z: 424 }, { x: -84, z: 380 }, { x: 0, z: 426 },
    { x: 84, z: 382 }, { x: 168, z: 424 }, { x: 252, z: 386 },
  ] } };
}

export function historicalPaletteConfig(cfg) {
  // The coastal sand-relief opt-in postdates the original palette receipt.
  // At 42ea275dfe55 coastal/saltwind had no rippleShoreOnly field. Current
  // authoring is guarded in terrainSandCoverage; preserve every other field.
  if (cfg.id === 'coastal' || cfg.id === 'saltwind') {
    const { rippleShoreOnly: _laterShoreCoverage, ...splat } = cfg.splat;
    return { ...cfg, splat };
  }
  // Published 1e0b2608bc6e5fec2a3c2f32225358c6fcc62b97 restored Verdant's
  // original backdrop. The palette receipt predates that restoration; retain
  // its exact horizon input from source blob 16ec7c8a93f5362ddfd64ebc2af32b067cfa09e1.
  // The caller separately locks the CURRENT horizon so this historical view
  // cannot conceal a later runtime change. Never mutate the live config.
  if (cfg.id === 'verdant') return { ...cfg, horizon: {
    baseHex: 0x4d6540, amp: 1.0, style: 'rolling', treeline: 0.94, treelineLayers: 2,
    forestHex: 0x33502e, rockHex: 0x77725f, haze: 0.95, grain: 0.7,
  } };
  if (cfg.id === 'reservoir') return historicalReservoirConfig(cfg);
  if (cfg.id === 'longleaf') {
    const { workedGround: _laterHarvest, ...terrain } = cfg.terrain;
    const { townWear: _laterWear, ...splat } = cfg.splat;
    return { ...cfg, terrain, splat };
  }
  return historicalShorelineConfig(cfg);
}
