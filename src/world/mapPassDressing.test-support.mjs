// Map pass 2026-09-12: authenticated dressing/haze leaves on the map files
// (bush/rock/outcrop/lone-tree/haystack counts and the far-range haze of the
// flattest maps). Relief and palette history receipts project ONLY these
// exact leaves back to the historical authoring before their byte compare;
// any other map authoring change still fails those receipts.
export const MAP_PASS_DRESSING_LEAVES = {
  "airfield.ts": [
    [
      "    clusterCount: 26, loneCount: 42, rimCount: 80, grassDensity: 0.72, bushCount: 0.82, bushSpecies: 'birch', // map pass 2026-09-12: perimeter scrub (tree/rock counts at the first-pass ceilings)",
      "    clusterCount: 26, loneCount: 42, rimCount: 80, grassDensity: 0.72, bushCount: 0.6, bushSpecies: 'birch',"
    ]
  ],
  "alpine.ts": [
    [
      "    bushCount: 0.62, bushSpecies: 'spruce', // map pass 2026-09-12: exposed stone/scrub on the snowfields",
      "    bushCount: 0.48, bushSpecies: 'spruce',"
    ],
    [
      "    roadTint: [1.30, 1.46, 1.70], shoulderDirt: 0.30, midRelief: 0.58, // map pass 2026-09-12: packed-snow pass roads, not black mud slashes",
      "    roadTint: [0.65, 0.69, 0.72], midRelief: 0.58,"
    ],
    [
      "    rocks: 330, outcrops: 72, craters: 66, rubblePiles: 20, // map pass 2026-09-12: exposed windward stone on the snowfields",
      "    rocks: 275, outcrops: 54, craters: 66, rubblePiles: 20,"
    ]
  ],
  "coastal.ts": [
    [
      "    // map pass 2026-09-12: the pasture between the strand and the crofts read\n    // as an empty lawn from the establishing shot; gorse/marram scrub, more\n    // windswept lone trees and grey shore boulders close the foreground.\n    clusterCount: 42,\n    loneCount: 116,",
      "    clusterCount: 34,\n    loneCount: 88,"
    ],
    [
      "    bushCount: 1.25,",
      "    bushCount: 0.9,"
    ],
    [
      "    haystacks: 14, rocks: 262, outcrops: 30, craters: 30, rubblePiles: 0,",
      "    haystacks: 8, rocks: 200, outcrops: 22, craters: 30, rubblePiles: 0,"
    ],
    [
      "    forestHex: 0x3d5539, rockHex: 0x757a6c, haze: 1.08, grain: 0.8,",
      "    forestHex: 0x3d5539, rockHex: 0x757a6c, haze: 1.25, grain: 0.8,"
    ]
  ],
  "desert.ts": [
    [
      "    bushCount: 1.1, // r4: more wadi scrub — mid-map emptiness critique (map pass 2026-09-12: denser)",
      "    bushCount: 0.92, // r4: more wadi scrub — mid-map emptiness critique"
    ],
    [
      "    haystacks: 0, rocks: 320, outcrops: 44, craters: 48,",
      "    haystacks: 0, rocks: 275, outcrops: 36, craters: 48,"
    ]
  ],
  "fjord.ts": [
    [
      "    // map pass 2026-09-12: the harbour terraces read as smooth lawn; dwarf\n    // spruce scrub and more coastal rock give the slopes a fjord texture.\n    clusterCount: 86, loneCount: 146, rimCount: 132, grassDensity: 0.78,\n    bushCount: 1.15, bushSpecies: 'spruce',",
      "    clusterCount: 86, loneCount: 124, rimCount: 132, grassDensity: 0.78,\n    bushCount: 0.8, bushSpecies: 'spruce',"
    ],
    [
      "    rocks: 330, outcrops: 60, craters: 54, rubblePiles: 18, hedgehogs: 14,",
      "    rocks: 245, outcrops: 42, craters: 54, rubblePiles: 18, hedgehogs: 14,"
    ]
  ],
  "railyard.ts": [
    [
      "    forestHex: 0x35402f, rockHex: 0x62655c, haze: 1.06, grain: 0.8,",
      "    forestHex: 0x35402f, rockHex: 0x62655c, haze: 1.25, grain: 0.8,"
    ]
  ],
  "saltwind.ts": [
    [
      "    // map pass 2026-09-12: limestone-terrace identity — scrub, pale rock and\n    // outcrops instead of a green pasture (establishing shot read as generic);\n    // tree and rock counts stay at the environmentExpansion first-pass ceilings.\n    clusterCount: 34, loneCount: 52, rimCount: 62, grassDensity: 0.68, bushCount: 1.3, bushSpecies: 'acacia', clusterScrub: 1.9,",
      "    clusterCount: 34, loneCount: 52, rimCount: 62, grassDensity: 0.68, bushCount: 0.86, bushSpecies: 'acacia', clusterScrub: 1.5,"
    ]
  ],
  "steppe.ts": [
    [
      "    bushCount: 0.72,",
      "    bushCount: 0.55,"
    ],
    [
      "    haystacks: 44, rocks: 230, outcrops: 34, craters: 42, rubblePiles: 0,",
      "    haystacks: 34, rocks: 230, outcrops: 34, craters: 42, rubblePiles: 0,"
    ],
    [
      "    forestHex: 0x565232, rockHex: 0x7d7663, haze: 1.08, grain: 0.6,",
      "    forestHex: 0x565232, rockHex: 0x7d7663, haze: 1.25, grain: 0.6,"
    ]
  ],
  "urban.ts": [
    [
      "    // map pass 2026-09-12: allotment and lane-edge trees so the town does not\n    // sit on a bare lawn (establishing shot); hedges thicken below.\n    clusterCount: 22,\n    loneCount: 68,",
      "    clusterCount: 14,\n    loneCount: 40,"
    ],
    [
      "    bushCount: 1.2, // r6: garden hedges/shrubs in the yards and block edges (map pass 2026-09-12: denser)",
      "    bushCount: 0.85, // r6: garden hedges/shrubs in the yards and block edges"
    ],
    [
      "    forestHex: 0x323f30, haze: 1.0,",
      "    forestHex: 0x323f30, haze: 1.15,"
    ]
  ],
  "winter.ts": [
    [
      "    bushCount: 0.28, // map pass 2026-09-12: bare birch scrub breaks the empty snowfield",
      "    bushCount: 0.15,"
    ],
    [
      "    haystacks: 12, rocks: 270, outcrops: 32, craters: 36, rubblePiles: 0,",
      "    haystacks: 12, rocks: 190, outcrops: 19, craters: 36, rubblePiles: 0,"
    ]
  ]
};

export function historicalMapPassDressingSource(source, file, assert) {
  const pairs = MAP_PASS_DRESSING_LEAVES[file];
  if (!pairs) return source;
  for (const [current, historical] of pairs) {
    assert.equal(source.split(current).length, 2, `${file}: one exact map-pass dressing leaf`);
    source = source.replace(current, historical);
  }
  return source;
}

// The same leaves as runtime config values: [path, authored 2026-09-12 value,
// historical value]. Receipts authenticate today's value before projecting
// the historical one back, so a silent third value still fails.
export const MAP_PASS_DRESSING_VALUES = {
  coastal: [
    [['vegetation', 'clusterCount'], 42, 34], [['vegetation', 'loneCount'], 116, 88],
    [['vegetation', 'bushCount'], 1.25, 0.9], [['props', 'haystacks'], 14, 8],
    [['props', 'rocks'], 262, 200], [['props', 'outcrops'], 30, 22], [['horizon', 'haze'], 1.08, 1.25],
  ],
  fjord: [
    [['vegetation', 'loneCount'], 146, 124], [['vegetation', 'bushCount'], 1.15, 0.8],
    [['props', 'rocks'], 330, 245], [['props', 'outcrops'], 60, 42],
  ],
  urban: [
    [['vegetation', 'clusterCount'], 22, 14], [['vegetation', 'loneCount'], 68, 40],
    [['vegetation', 'bushCount'], 1.2, 0.85], [['horizon', 'haze'], 1.0, 1.15],
  ],
  saltwind: [[['vegetation', 'bushCount'], 1.3, 0.86], [['vegetation', 'clusterScrub'], 1.9, 1.5]],
  steppe: [
    [['vegetation', 'bushCount'], 0.72, 0.55],
    [['props', 'haystacks'], 44, 34], [['horizon', 'haze'], 1.08, 1.25],
  ],
  railyard: [[['horizon', 'haze'], 1.06, 1.25]],
  alpine: [[['vegetation', 'bushCount'], 0.62, 0.48], [['props', 'rocks'], 330, 275], [['props', 'outcrops'], 72, 54],
    [['splat', 'roadTint'], [1.30, 1.46, 1.70], [0.65, 0.69, 0.72]], [['splat', 'shoulderDirt'], 0.30, undefined]],
  winter: [[['vegetation', 'bushCount'], 0.28, 0.15], [['props', 'rocks'], 270, 190], [['props', 'outcrops'], 32, 19]],
  airfield: [[['vegetation', 'bushCount'], 0.82, 0.6]],
  desert: [[['vegetation', 'bushCount'], 1.1, 0.92], [['props', 'rocks'], 320, 275], [['props', 'outcrops'], 44, 36]],
};

export function historicalMapPassDressingInput(config, assert) {
  const rows = MAP_PASS_DRESSING_VALUES[config?.id];
  if (!rows) return config;
  const out = { ...config };
  for (const [[group, key], current, historical] of rows) {
    assert.deepEqual(config[group]?.[key], current, `${config.id}.${group}.${key}: authored map-pass dressing value`);
    out[group] = { ...out[group], [key]: historical };
    if (historical === undefined) delete out[group][key]; // the leaf did not exist before the pass
  }
  return out;
}
