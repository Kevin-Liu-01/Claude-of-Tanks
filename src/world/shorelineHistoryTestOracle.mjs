import assert from 'node:assert/strict';
import badlands from './maps/badlands.ts';
import frontier from './maps/frontier.ts';
import alpine from './maps/alpine.ts';
import { createLakeChannel } from './maps/marshChannel.ts';

// Published d948cb5733 added only landforms[*].relief. Authenticated Git blobs:
// Frontier 2ad3e2945ac1dc7edaf4b79945d8f3ba785eacb8 -> fdbd9878c5bf4bf06adc822edc4fae4258206099;
// Alpine   6029267c78dd0e4d5eb2517d2b31e2013985f168 -> 75e6783b68fa503af689bcf4c9e77ba9f97b85c2.
// Keep the original anchors and all siblings in historical receipts. Current
// relief/support is independently certified by playableRelief and actual LOD
// checks; the guard also rejects a caller replacing a canonical descriptor.
const currentRelief = new Map([frontier, alpine].map(cfg => [cfg.id,
  structuredClone(cfg.terrain.landforms.map(form => form.relief))]));
export function historicalPlayableReliefInput(cfg) {
  if (!currentRelief.has(cfg.id)) return cfg;
  assert.deepEqual(cfg.terrain.landforms.map(form => form.relief), currentRelief.get(cfg.id),
    `${cfg.id}: current playable relief must match canonical descriptors before historical projection`);
  return { ...cfg, terrain: { ...cfg.terrain, landforms: cfg.terrain.landforms.map(form => {
    const { relief: _publishedRelief, ...anchor } = form;
    return anchor;
  }) } };
}

// Only the canyon's intentionally replaced authoring is projected. Snapshot
// the actual canonical input, not a duplicate current terrain prescription.
// badlandsRelief separately certifies its current canyon/support/scope contract.
function badlandsAuthoring(cfg) {
  const terrain = cfg.terrain, props = cfg.props;
  return { blurb: cfg.blurb, terrain: {
    redrockCanyon: terrain.redrockCanyon, hillScale: terrain.hillScale,
    microScale: terrain.microScale, rimH: terrain.rimH, dunesAmp: terrain.dunes?.amp,
    mesas: terrain.mesas, landforms: terrain.landforms,
    roads: [terrain.roads?.paths?.[0], terrain.roads?.paths?.[2]],
  }, beatX: [props.tacticalBeats?.[0]?.x, props.tacticalBeats?.[2]?.x],
  wallX: props.wallRuns?.slice(0, 4).map(row => [row[0], row[2]]) };
}
const currentBadlandsAuthoring = structuredClone(badlandsAuthoring(badlands));

// Exact pre-canyon leaves from d948cb5733ebb41ba471458a6b410e2bbb3568cc:
// badlands.ts SHA256 eae9a03e75913e7c1b6ba87fae136115e5a568675d4998923da47492cd7ddada.
// These inputs preserve the callers' immutable full-config/pixel/geometry
// goldens. Unlisted terrain, route, prop, palette and vegetation fields remain
// live; no Git/runtime hook or replacement full-map fixture is needed.
export function historicalBadlandsInput(cfg) {
  if (cfg.id !== 'badlands') return cfg;
  assert.deepEqual(badlandsAuthoring(cfg), currentBadlandsAuthoring,
    'current Badlands authoring must match its canonical config before historical projection');
  const { redrockCanyon: _laterCanyon, ...terrain } = cfg.terrain;
  const roads = [
    [[-432, -452], [-360, -292], [-330, -92], [-356, 112], [-292, 306], [-210, 470]],
    [[344, -452], [302, -272], [326, -82], [286, 112], [320, 298], [382, 456]],
  ];
  const wallX = [[-302, -212], [-294, -204], [202, 298], [198, 294]];
  return { ...cfg, blurb: 'Layered red escarpments frame a fortified desert logistics outpost',
    terrain: { ...terrain, hillScale: .68, microScale: .74, rimH: 38,
      dunes: { ...terrain.dunes, amp: 3 }, mesas: { amp: 24, thr0: .74, thr1: .80 },
      roads: { ...terrain.roads, paths: terrain.roads.paths.map((path, index) =>
        index === 0 ? roads[0] : index === 2 ? roads[1] : path) },
      landforms: [
        { kind: 'ridge', x: -272, z: 18, length: 330, width: 78, height: 8.4, yawDeg: 4 },
        { kind: 'ridge', x: 276, z: 26, length: 320, width: 80, height: 8.2, yawDeg: -7 },
        { kind: 'ridge', x: -42, z: 280, length: 250, width: 70, height: 6.8, yawDeg: 82 },
        { kind: 'knoll', x: 132, z: -244, rx: 88, rz: 58, height: 6.6, yawDeg: 20 },
        { kind: 'basin', x: -126, z: -218, rx: 104, rz: 66, height: -3, yawDeg: -21 },
      ],
    }, props: { ...cfg.props,
      tacticalBeats: cfg.props.tacticalBeats.map((beat, index) => index === 0
        ? { ...beat, x: -282 } : index === 2 ? { ...beat, x: 292 } : beat),
      wallRuns: cfg.props.wallRuns.map((row, index) => index < 4
        ? [wallX[index][0], row[1], wallX[index][1], ...row.slice(3)] : row),
    } };
}

// The service-court authoring follows Foundry source blob
// c3ad3042999d7241824ad9a4670fcbd73a5fb84a (d46da09ea). Preserve that
// historical input without refreshing older pixel/config goldens. Current
// court authoring and output are independently checked by foundryServiceCourt.
// The later material-only villageWear/townWear pair is independently guarded
// by villageWear's actual Foundry masks; no historical golden is refreshed.
export function historicalFoundryServiceInput(cfg) {
  if (cfg.id !== 'foundry') return cfg;
  const { workedGround: _laterCourtWear, villageWear: _laterCoverage, ...terrain } = cfg.terrain;
  const { foundryServiceCourt: _laterCourt, ...props } = cfg.props;
  const { townWear: _laterStrength, ...splat } = cfg.splat;
  return { ...cfg, terrain, props, splat };
}

// Test-only reconstruction of the three subsequently edited inputs at
// 2b2d14b39ce3ef8cdf567ed35c3cf2d1c79c16ea. Verified against the Git blobs:
// polders.ts  1ce81f35630258159be6c9e64076bdf74e4c446f
// oasis.ts    34e0cf6ace2021eec364e389d1ed1ff5ee9b557f
// mangrove.ts b6c00c4f2a739e2d75713eed831229397804e0d1
// Everything not listed remains the current input: the original immutable
// full-config / pixel digests in the callers still reject unrelated drift.
// No Git checkout, runtime loader hook or production dependency on this file.
export function historicalShorelineConfig(cfg) {
  if (cfg.id === 'foundry') return historicalFoundryServiceInput(cfg);
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
  if (cfg.id === 'badlands') return historicalBadlandsInput(cfg);
  if (currentRelief.has(cfg.id)) return historicalPlayableReliefInput(cfg);
  // Coastal surface-only settings postdate the original palette receipt.
  // At 42ea275dfe55 neither setting existed. Current authoring is guarded by
  // terrainSandCoverage/terrainWornDirt/villageWear; preserve every other field.
  if (cfg.id === 'coastal' || cfg.id === 'saltwind') {
    const { rippleShoreOnly: _laterShoreCoverage, wornDirtStrength: _laterWornBlend, ...splat } = cfg.splat;
    const { villageWear: _laterVillageCoverage, workedGround: _laterActivityAreas, ...terrain } = cfg.terrain;
    return { ...cfg, terrain, splat };
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
