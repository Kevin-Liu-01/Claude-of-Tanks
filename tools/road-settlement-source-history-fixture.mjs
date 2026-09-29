// Exact reviewed road/frontage source deltas against main 602b406df.
// Historical source-byte checks only; unknown edits still fail their original oracle.
import assert from 'node:assert/strict';
const deltas = {
  "coastal.ts": [
    [
      "    villageWear: 'activity-patches',\n    workedGround: [\n      // Sandy turning courts explain the two shore-road termini. They meet\n      // the existing capped lanes on dry land without paving across the bay.\n      { feather: 4, strength: 0.9, boundary: [[247, -66], [261, -70], [276, -63], [280, -50], [270, -37], [251, -38], [241, -49]] },\n      { feather: 4, strength: 0.9, boundary: [[245, 81], [262, 78], [277, 86], [280, 99], [269, 112], [250, 110], [241, 96]] },\n      // Market stalls flank the actual road junction (163.77, 95.66).\n      { feather: 8, strength: 0.92, boundary: [[140, 76], [174, 71], [192, 88], [185, 113], [149, 118], [136, 99]] },\n      // Fishery/boatshed frontages on both sides of the x\u2248168 coast road.\n      { feather: 7, strength: 0.82, boundary: [[141, -77], [171, -77], [197, -45], [190, 7], [199, 40], [176, 51], [141, 45], [145, 9], [134, -28]] },\n    ],\n    landforms: [\n",
      "    villageWear: 'activity-patches',\n    workedGround: [\n      // Market stalls flank the actual road junction (163.77, 95.66).\n      { feather: 8, strength: 0.92, boundary: [[140, 76], [174, 71], [192, 88], [185, 113], [149, 118], [136, 99]] },\n      // Fishery/boatshed frontages on both sides of the x\u2248168 coast road.\n      { feather: 7, strength: 0.82, boundary: [[141, -77], [171, -77], [197, -45], [190, 7], [199, 40], [176, 51], [141, 45], [145, 9], [134, -28]] },\n      // Existing crofts and their entrances along the z\u2248-52 cross street.\n      { feather: 7, strength: 0.84, boundary: [[48, -73], [86, -78], [128, -74], [140, -63], [140, -29], [103, -24], [65, -27], [47, -44]] },\n      // Two cottages north of the market, leaving open pasture between yards.\n      { feather: 6, strength: 0.78, boundary: [[142, 117], [171, 113], [191, 121], [189, 140], [160, 147], [140, 135]] },\n    ],\n    landforms: [\n"
    ]
  ],
  "polders.ts": [
    [
      "// A working reclaimed wetland: offset drainage cells leave a dry diagonal\n// causeway, a western farm loop and an eastern pumping-station approach.\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'polders', name: 'Tidegate Polders',\n",
      "// A working reclaimed wetland: offset drainage cells leave a dry diagonal\n// causeway, a western farm loop and an eastern pumping-station approach.\nexport default {\n  id: 'polders', name: 'Tidegate Polders',\n"
    ],
    [
      "    hillScale: 0.72, microScale: 0.64, rimH: 18, clearMarshVeg: true, softLakes: true,\n    village: { x0: -178, x1: 68, z0: -96, z1: 122, cx: -64, cz: 12, feather: 42, flatten: 0.88, relief: 0.12 },\n    roads: { paths: roundRoadBends([\n      // The mill lane folds around a compact farm court before joining the\n      // raised diagonal causeway; field bypasses stay outside the settlement.\n",
      "    hillScale: 0.72, microScale: 0.64, rimH: 18, clearMarshVeg: true, softLakes: true,\n    village: { x0: -178, x1: 68, z0: -96, z1: 122, cx: -64, cz: 12, feather: 42, flatten: 0.88, relief: 0.12 },\n    roads: { paths: [\n      // The mill lane folds around a compact farm court before joining the\n      // raised diagonal causeway; field bypasses stay outside the settlement.\n"
    ],
    [
      "      [[370, -452], [298, -274], [266, -102], [288, 72], [338, 260], [376, 456]],\n      [[-304, 104], [-220, 170], [-82, 170], [72, 202], [216, 212], [338, 260]],\n    ]) },\n    // Five distinct drainage landforms, not repeated ornamental ponds. Long\n    // eroded drains, a broad retention bay and an offset hooked basin share\n",
      "      [[370, -452], [298, -274], [266, -102], [288, 72], [338, 260], [376, 456]],\n      [[-304, 104], [-220, 170], [-82, 170], [72, 202], [216, 212], [338, 260]],\n    ] },\n    // Five distinct drainage landforms, not repeated ornamental ponds. Long\n    // eroded drains, a broad retention bay and an offset hooked basin share\n"
    ]
  ],
  "copperMesa.ts": [
    [
      "import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';\nimport desert from './desert.ts';\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'copper_mesa', name: 'Copper Mesa Mine',\n",
      "import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';\nimport desert from './desert.ts';\nexport default {\n  id: 'copper_mesa', name: 'Copper Mesa Mine',\n"
    ],
    [
      "    hillScale: 0.9, microScale: 0.8, rimH: 38, quarryBenches: true,\n    village: { x0: 64, x1: 256, z0: -190, z1: 128, cx: 160, cz: -24, feather: 40, flatten: 0.78, relief: 0.18 },\n    roads: { paths: roundRoadBends([\n      // A stepped loading apron on the eastern shelf puts the gantries and\n      // stores beside the haul road; the pit floor remains a separate lane.\n",
      "    hillScale: 0.9, microScale: 0.8, rimH: 38, quarryBenches: true,\n    village: { x0: 64, x1: 256, z0: -190, z1: 128, cx: 160, cz: -24, feather: 40, flatten: 0.78, relief: 0.18 },\n    roads: { paths: [\n      // A stepped loading apron on the eastern shelf puts the gantries and\n      // stores beside the haul road; the pit floor remains a separate lane.\n"
    ],
    [
      "      [[354, -444], [376, -230], [364, -26], [338, 170], [328, 354], [290, 470]],\n      [[-258, 90], [-104, 168], [28, 90], [136, 90], [218, 90], [338, 170]],\n    ]) },\n    marshes: [{ x: -66, z: 32, r: 38, dip: 0.8 }],\n    landforms: [\n",
      "      [[354, -444], [376, -230], [364, -26], [338, 170], [328, 354], [290, 470]],\n      [[-258, 90], [-104, 168], [28, 90], [136, 90], [218, 90], [338, 170]],\n    ] },\n    marshes: [{ x: -66, z: 32, r: 38, dip: 0.8 }],\n    landforms: [\n"
    ]
  ],
  "oasis.ts": [
    [
      "// caravan road and a long dune-back flank. Reuses only the desert materials.\nimport desert from './desert.ts';\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'oasis', name: 'Sunscar Oasis',\n",
      "// caravan road and a long dune-back flank. Reuses only the desert materials.\nimport desert from './desert.ts';\nexport default {\n  id: 'oasis', name: 'Sunscar Oasis',\n"
    ],
    [
      "    hillScale: 0.70, microScale: 0.60, rimH: 28, dunes: { amp: 5.4 }, clearMarshVeg: true, softLakes: true,\n    village: { x0: -12, x1: 230, z0: -124, z1: 134, cx: 110, cz: 0, feather: 44, flatten: 0.88, relief: 0.12 },\n    roads: { paths: roundRoadBends([\n      // A dog-legged caravan street slows the short town route; the souk\n      // approach enters across it while the open dune bypass stays fast.\n",
      "    hillScale: 0.70, microScale: 0.60, rimH: 28, dunes: { amp: 5.4 }, clearMarshVeg: true, softLakes: true,\n    village: { x0: -12, x1: 230, z0: -124, z1: 134, cx: 110, cz: 0, feather: 44, flatten: 0.88, relief: 0.12 },\n    roads: { paths: [\n      // A dog-legged caravan street slows the short town route; the souk\n      // approach enters across it while the open dune bypass stays fast.\n"
    ],
    [
      "      [[-282, -76], [30, -100], [72, -70], [156, -74], [218, -30], [302, -88]],\n      [[-314, 182], [-198, 222], [-72, 206], [66, 226], [194, 200], [334, 228]],\n    ]) },\n    // One asymmetric spring basin wraps a dry town-facing tongue. The broad\n    // western coves and unequal tapering arms replace three circular joins;\n",
      "      [[-282, -76], [30, -100], [72, -70], [156, -74], [218, -30], [302, -88]],\n      [[-314, 182], [-198, 222], [-72, 206], [66, 226], [194, 200], [334, 228]],\n    ] },\n    // One asymmetric spring basin wraps a dry town-facing tongue. The broad\n    // western coves and unequal tapering arms replace three circular joins;\n"
    ]
  ],
  "whiteout.ts": [
    [
      "import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';\nconst clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'whiteout', name: 'Whiteout Station',\n",
      "import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';\nconst clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);\nexport default {\n  id: 'whiteout', name: 'Whiteout Station',\n"
    ],
    [
      "    hillScale: 0.78, microScale: 0.54, rimH: 24, frozenMarshes: true,\n    village: { x0: -160, x1: 76, z0: -150, z1: 146, cx: -52, cz: 0, feather: 46, flatten: 0.84, relief: 0.10 },\n    roads: { paths: roundRoadBends([\n      // Windbreak service court west of the melt pan, not a town spread\n      // across the ice. Parallel station rows open into two snow corridors.\n      [[-270, -118], [-180, -112], [-100, -104], [-20, -104], [70, -104], [252, -104]],\n      [[-310, -460], [-280, -300], [-270, -118], [-274, 74], [-286, 274], [-300, 460]],\n      [[-130, -462], [-98, -288], [-100, -104], [-100, 96], [-114, 262], [-90, 464]],\n      [[298, -460], [270, -284], [252, -104], [258, 82], [288, 282], [326, 462]],\n      [[-274, 74], [-202, 150], [-100, 96], [-20, 96], [64, 154], [202, 174], [288, 282]],\n    ]) },\n    lakes: [{ x: 114, z: -22, r: 77, depth: 0.55 }, { x: -302, z: 300, r: 38, depth: 0.45 }],\n    marshes: [],\n",
      "    hillScale: 0.78, microScale: 0.54, rimH: 24, frozenMarshes: true,\n    village: { x0: -160, x1: 76, z0: -150, z1: 146, cx: -52, cz: 0, feather: 46, flatten: 0.84, relief: 0.10 },\n    roads: { paths: [\n      // Windbreak service court west of the melt pan, not a town spread\n      // across the ice. Parallel station rows open into two snow corridors.\n      [[-270, -118], [-100, -104], [-20, -104], [-20, 0], [70, -104], [252, -104]],\n      [[-310, -460], [-280, -300], [-270, -118], [-274, 74], [-286, 274], [-300, 460]],\n      [[-130, -462], [-98, -288], [-100, -104], [-100, 96], [-114, 262], [-90, 464]],\n      [[298, -460], [270, -284], [252, -104], [258, 82], [288, 282], [326, 462]],\n      [[-274, 74], [-202, 150], [-100, 96], [-20, 96], [64, 154], [202, 174], [288, 282]],\n    ] },\n    lakes: [{ x: 114, z: -22, r: 77, depth: 0.55 }, { x: -302, z: 300, r: 38, depth: 0.45 }],\n    marshes: [],\n"
    ]
  ],
  "orchard.ts": [
    [
      "// cedar edges, a bathhouse/market settlement and three stepped farm tracks.\nimport verdant from './verdant.ts';\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'orchard', name: 'Orchard Valley',\n",
      "// cedar edges, a bathhouse/market settlement and three stepped farm tracks.\nimport verdant from './verdant.ts';\nexport default {\n  id: 'orchard', name: 'Orchard Valley',\n"
    ],
    [
      "    hillScale: 1.0, microScale: 0.72, rimH: 32,\n    village: { x0: -106, x1: 108, z0: -92, z1: 112, cx: -6, cz: 12, feather: 42, flatten: 0.86, relief: 0.12 },\n    roads: { paths: roundRoadBends([\n      // The bathhouse street bends into the packing court; the second\n      // frontage below turns back around it instead of stringing homes out.\n",
      "    hillScale: 1.0, microScale: 0.72, rimH: 32,\n    village: { x0: -106, x1: 108, z0: -92, z1: 112, cx: -6, cz: 12, feather: 42, flatten: 0.86, relief: 0.12 },\n    roads: { paths: [\n      // The bathhouse street bends into the packing court; the second\n      // frontage below turns back around it instead of stringing homes out.\n"
    ],
    [
      "      [[-218, -172], [-112, -88], [-76, -18], [-20, -12], [24, -48], [98, -56], [202, -100], [308, -132]],\n      [[-324, 196], [-222, 172], [-100, 204], [50, 146], [178, 196], [330, 224]],\n    ]) },\n    marshes: [{ x: 136, z: -128, r: 28, dip: 0.7 }, { x: -120, z: 230, r: 29, dip: 0.8 }],\n    landforms: [\n",
      "      [[-218, -172], [-112, -88], [-76, -18], [-20, -12], [24, -48], [98, -56], [202, -100], [308, -132]],\n      [[-324, 196], [-222, 172], [-100, 204], [50, 146], [178, 196], [330, 224]],\n    ] },\n    marshes: [{ x: 136, z: -128, r: 28, dip: 0.7 }, { x: -120, z: 230, r: 29, dip: 0.8 }],\n    landforms: [\n"
    ]
  ],
  "longleaf.ts": [
    [
      "// bypass and a screened eastern spur. Planted belts define the cut edges.\nimport frontier from './frontier.ts';\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'longleaf', name: 'Longleaf Crossing',\n",
      "// bypass and a screened eastern spur. Planted belts define the cut edges.\nimport frontier from './frontier.ts';\nexport default {\n  id: 'longleaf', name: 'Longleaf Crossing',\n"
    ],
    [
      "    hillScale: 1.05, microScale: 0.86, rimH: 30,\n    village: { x0: -142, x1: 92, z0: -54, z1: 158, cx: -26, cz: 54, feather: 42, flatten: 0.84, relief: 0.16 },\n    roads: { paths: roundRoadBends([\n      // The timber loading lane hooks around the garage yard. The diagonal\n      // clearcut route passes its open end, creating an exposed crossing.\n",
      "    hillScale: 1.05, microScale: 0.86, rimH: 30,\n    village: { x0: -142, x1: 92, z0: -54, z1: 158, cx: -26, cz: 54, feather: 42, flatten: 0.84, relief: 0.16 },\n    roads: { paths: [\n      // The timber loading lane hooks around the garage yard. The diagonal\n      // clearcut route passes its open end, creating an exposed crossing.\n"
    ],
    [
      "      [[334, -460], [264, -314], [282, -158], [228, 10], [294, 184], [306, 332], [354, 464]],\n      [[-306, 280], [-172, 236], [-28, 256], [104, 224], [228, 254], [354, 278]],\n    ]) },\n    marshes: [{ x: -342, z: -124, r: 38, dip: 0.9 }, { x: -334, z: -32, r: 35, dip: 0.9 }, { x: -350, z: 158, r: 36, dip: 0.8 }],\n    // One worked southern harvest, following the existing stump/log stations.\n",
      "      [[334, -460], [264, -314], [282, -158], [228, 10], [294, 184], [306, 332], [354, 464]],\n      [[-306, 280], [-172, 236], [-28, 256], [104, 224], [228, 254], [354, 278]],\n    ] },\n    marshes: [{ x: -342, z: -124, r: 38, dip: 0.9 }, { x: -334, z: -32, r: 35, dip: 0.9 }, { x: -350, z: 158, r: 36, dip: 0.8 }],\n    // One worked southern harvest, following the existing stump/log stations.\n"
    ]
  ],
  "saltwind.ts": [
    [
      "// coast while inland hairpins climb behind the fishing village.\nimport coastal from './coastal.ts';\nimport { roundRoadBends } from './roadBends.ts';\nexport default {\n  id: 'saltwind', name: 'Saltwind Narrows',\n",
      "// coast while inland hairpins climb behind the fishing village.\nimport coastal from './coastal.ts';\nexport default {\n  id: 'saltwind', name: 'Saltwind Narrows',\n"
    ],
    [
      "    hillScale: 0.86, microScale: 0.70, rimH: 28, clearMarshVeg: true, softLakes: true,\n    coastRimFadeM: 110, // round 47 follow-up: the bay-mouth headlands climb to the rim over 110 m instead of standing as slabs one row past the line\n    // Include the dry inland street as working frontage; the former east\n    // bound excluded it and stranded the last three planned village buildings.\n    village: { x0: -252, x1: 40, z0: -116, z1: 138, cx: -136, cz: 10, feather: 44, flatten: 0.86, relief: 0.14 },\n    villageWear: 'activity-patches',\n    workedGround: [\n      // Existing stall ring at the harbor-road junction (-190, -36).\n      { feather: 7, strength: 0.94, boundary: [[-212, -58], [-186, -66], [-169, -52], [-163, -29], [-183, -17], [-211, -29]] },\n      // Doorstep courts follow the new inland market street. The old loop's\n      // large worn pad would leave an unexplained bare rectangle behind it.\n      { feather: 6, strength: 0.84, boundary: [[-181, -65], [-140, -68], [-105, -62], [-101, -26], [-134, -19], [-171, -21]] },\n      { feather: 6, strength: 0.8, boundary: [[-99, -59], [-65, -57], [-26, -47], [-26, -12], [-60, -13], [-94, -20]] },\n      // Dry approach from actual landing 1 (-283.54, -21.89) past its beached\n      // boat (-264.88, -21.71) toward the harbor frontage.\n",
      "    hillScale: 0.86, microScale: 0.70, rimH: 28, clearMarshVeg: true, softLakes: true,\n    coastRimFadeM: 110, // round 47 follow-up: the bay-mouth headlands climb to the rim over 110 m instead of standing as slabs one row past the line\n    village: { x0: -252, x1: -18, z0: -116, z1: 138, cx: -136, cz: 10, feather: 44, flatten: 0.86, relief: 0.14 },\n    villageWear: 'activity-patches',\n    workedGround: [\n      // Existing stall ring at the harbor-road junction (-190, -36).\n      { feather: 7, strength: 0.94, boundary: [[-212, -58], [-186, -66], [-169, -52], [-163, -29], [-183, -17], [-211, -29]] },\n      // Fishery and southern cross-street frontages; not the whole village pad.\n      { feather: 7, strength: 0.84, boundary: [[-214, -107], [-191, -125], [-154, -128], [-124, -115], [-101, -108], [-91, -86], [-104, -65], [-140, -69], [-158, -79], [-191, -64], [-214, -82]] },\n      // Crofts along the market stair-road, with a notch between court groups.\n      { feather: 7, strength: 0.8, boundary: [[-173, -30], [-137, -35], [-115, -26], [-98, -45], [-62, -43], [-62, -14], [-83, -2], [-69, 34], [-99, 45], [-106, 70], [-122, 57], [-122, 25], [-146, 27], [-169, 18]] },\n      // Dry approach from actual landing 1 (-283.54, -21.89) past its beached\n      // boat (-264.88, -21.71) toward the harbor frontage.\n"
    ],
    [
      "      { feather: 6, strength: 0.88, boundary: [[-286, -38], [-261, -44], [-221, -49], [-206, -31], [-232, -22], [-260, -17], [-280, -20]] },\n    ],\n    roads: { paths: roundRoadBends([\n      // Quayside frontages bend with the bay; the inland market stair-road\n      // meets them on the dry limestone shoulder, clear of the harbor mouth.\n",
      "      { feather: 6, strength: 0.88, boundary: [[-286, -38], [-261, -44], [-221, -49], [-206, -31], [-232, -22], [-260, -17], [-280, -20]] },\n    ],\n    roads: { paths: [\n      // Quayside frontages bend with the bay; the inland market stair-road\n      // meets them on the dry limestone shoulder, clear of the harbor mouth.\n"
    ],
    [
      "      [[-84, -464], [-20, -292], [44, -126], [-2, 32], [74, 200], [66, 332], [138, 464]],\n      [[340, -460], [272, -304], [308, -144], [228, 14], [292, 180], [266, 330], [320, 462]],\n      // A single market street leaves the harbor junction; no folded-back loop.\n      [[-190, -36], [-138, -44], [-82, -40], [-20, -30], [80, -8], [156, 6], [228, 14]],\n      [[-224, 206], [-6, 242], [126, 218], [266, 330]],\n    ]) },\n    // Round 40 (2026-09-22, AAA map program): the hooked bay is one authored shoreline. The former three overlapping\n    // circles rasterised into three straight-edged basins with sand strips between them and dried in the last\n",
      "      [[-84, -464], [-20, -292], [44, -126], [-2, 32], [74, 200], [66, 332], [138, 464]],\n      [[340, -460], [272, -304], [308, -144], [228, 14], [292, 180], [266, 330], [320, 462]],\n      [[-210, -100], [-124, -100], [-108, -36], [-190, -36], [-108, 44], [-20, -92], [228, 14]],\n      [[-224, 206], [-6, 242], [126, 218], [266, 330]],\n    ] },\n    // Round 40 (2026-09-22, AAA map program): the hooked bay is one authored shoreline. The former three overlapping\n    // circles rasterised into three straight-edged basins with sand strips between them and dried in the last\n"
    ]
  ]
};
export function beforeRoadSettlementSource(source, file) {
  for (const [current, previous] of deltas[file] ?? []) {
    assert.equal(source.split(current).length, 2, `${file}: exact road-settlement authoring delta`);
    source = source.replace(current, previous);
  }
  return source;
}
