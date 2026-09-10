import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {beforeType10SkirtOptimization,beforeType10GearRebuild,TYPE10_ROLLER_SUPPORT_LINE} from './type10SkirtHistory.test-support.mjs';

// Exact pre-paint sources at main 2933d5645. Only declared finish wrappers
// are reversed; night lighting, geometry, low-detail counts and every other
// byte must match that independently committed source. No fixture refresh.
export const PRE_PAINT_SHA = Object.freeze({
  "leopardA5XDetails.ts": "1403c3975cb2b0eab2e2abd8d143eb3f3b3b76050c40235e3ec8367d0bfe0e25",
  "leopardA6X.ts": "9e10be26c5e69baa4386458996f85a3933daf78d081fb3004125fc186a58feea",
  "leclercXSourceFittings.ts": "670d631586ae285ba884395694b73b7a75e0a6b19400309cb7afb67b06b3ca91",
  "amx40XHullSkirts.ts": "d9df76151697de929b2e7ed6d915d3283a679905c722aba1cbd6ae27dca715fb",
  // Type 10 sources are pinned to main 7351f0b4a, before the finish-only pass.
  "type10X.ts": "b4ecf8c3d8839ceb2a019fafa5fbe0b96976aa6d86d49d5bc668845f1e20c0a2",
  "type10XSkirts.ts": "cb2e5e980d0bb11524f7f67bed370c1a82925eb4bf7943587047e313dce6265e"
});
const edits = {
  "type10X.ts": [
    ["import {addType10Skirts} from './type10XSkirts.ts';", "import {addType10Skirts} from './type10XSkirts.ts';\nimport {markFixedPaintedPanel} from './fixedPaintedPanel.ts';"],
    ["P.addEquipment('hullDetail',box(.030964,.4627,6.0704),side*1.559035,.99065,.5545);", "P.addEquipment('hullPaintedDetail',markFixedPaintedPanel(box(.030964,.4627,6.0704),\n    'type10-painted-upper-fascia','hullDetail'),side*1.559035,.99065,.5545);"],
    ["P.addEquipment('hullDetail',box(.030964,.4065,.9621),side*1.559035,.96097,-2.95899);", "P.addEquipment('hullPaintedDetail',markFixedPaintedPanel(box(.030964,.4065,.9621),\n    'type10-painted-rear-fascia','hullDetail'),side*1.559035,.96097,-2.95899);"],
  ],
  "type10XSkirts.ts": [
    ["import {KIT} from './kit.ts';", "import {KIT} from './kit.ts';\nimport {markFixedPaintedPanel} from './fixedPaintedPanel.ts';"],
    ["P.addEquipment('hullDetail',sectionSolid(sections));", "P.addEquipment('hullPaintedDetail',markFixedPaintedPanel(sectionSolid(sections),\n    'type10-painted-folded-skirt','hullDetail'));"],
  ],
  "leopardA5XDetails.ts": [
    [
      "import * as THREE from 'three';",
      "import * as THREE from 'three';\nimport { boxUV } from '../factoryGeometry.ts';"
    ],
    [
      "  const mesh = new THREE.Mesh(geometry, P.mats.detail);",
      "  // Fixed steel service covers share the body finish; separate optics and\n  // hoist fittings retain their own equipment paint.\n  const paintedCover = owner === 'hull' && (name === 'ServiceCoverRight' || name === 'ServiceCoverLeft');\n  if (paintedCover) boxUV(geometry, P.spec.visual.camoScale ?? .34);\n  const mesh = new THREE.Mesh(geometry, paintedCover ? P.mats.hull : P.mats.detail);"
    ],
    [
      "mesh.userData = { appearanceRole: 'fittingPaint',",
      "mesh.userData = { appearanceRole: paintedCover ? 'armorPaint' : 'fittingPaint',"
    ]
  ],
  "leopardA6X.ts": [
    [
      "import * as THREE from 'three';",
      "import { markFixedPaintedPanel } from './fixedPaintedPanel.ts';\nimport * as THREE from 'three';"
    ],
    [
      "P.addMudguard(`a6x_front_guard_${side}`, 'hullDetail', wall([",
      "P.addMudguard(`a6x_front_guard_${side}`, 'hullPaintedDetail', markFixedPaintedPanel(wall(["
    ],
    [
      "[3.75, x0, x1, 1.115, 1.194], [3.815, x0, x1, 1.000, 1.009],\n    ]));",
      "[3.75, x0, x1, 1.115, 1.194], [3.815, x0, x1, 1.000, 1.009],\n    ]), 'a6-fixed-front-guard', 'hullDetail'));"
    ],
    [
      "P.addEquipment('hullDetail', sectionSolid([{ z: back, ring: mirrored }, { z: front, ring: mirrored }]));",
      "P.addEquipment('hullPaintedDetail', markFixedPaintedPanel(\n      sectionSolid([{ z: back, ring: mirrored }, { z: front, ring: mirrored }]),\n      'a6-fixed-upper-sheet', 'hullDetail'));"
    ]
  ],
  "leclercXSourceFittings.ts": [
    [
      "import { sectionSolid } from './sectionSolid.ts';",
      "import { markFixedPaintedPanel } from './fixedPaintedPanel.ts';\nimport { sectionSolid } from './sectionSolid.ts';"
    ],
    [
      "P.addMudguard(`leclerc_x_bow_guard_${side}`, 'hullDetail', guard(left, right));",
      "P.addMudguard(`leclerc_x_bow_guard_${side}`, 'hullPaintedDetail',\n      markFixedPaintedPanel(guard(left, right), 'leclerc-fixed-bow-guard', 'hullDetail'));"
    ]
  ],
  "amx40XHullSkirts.ts": [
    [
      "import {KIT} from './kit.ts';",
      "import { markFixedPaintedPanel } from './fixedPaintedPanel.ts';\nimport {KIT} from './kit.ts';"
    ],
    [
      "P.addMudguard(`amx40-x-${rear?'aft-skin':'fore-apron'}`,'hullDetail',sectionSolid(rows));",
      "P.addMudguard(`amx40-x-${rear?'aft-skin':'fore-apron'}`,'hullPaintedDetail',\n    markFixedPaintedPanel(sectionSolid(rows),'amx40-fixed-folded-skirt','hullDetail'));"
    ]
  ]
};
export function beforeFixedStockPaint(name, source) {
  assert.ok(edits[name], 'undeclared paint source '+name);
  if(name==='type10XSkirts.ts')source=beforeType10SkirtOptimization(source);
  if(name==='type10X.ts') {
    source=beforeType10GearRebuild(source);
    assert.equal(source.split(TYPE10_ROLLER_SUPPORT_LINE).length,2);
    source=source.replace(TYPE10_ROLLER_SUPPORT_LINE,'');
  }
  for (const [before, after] of [...edits[name]].reverse()) {
    assert.equal(source.split(after).length, 2, name+': one exact material edit');
    source = source.replace(after, before);
  }
  assert.equal(createHash('sha256').update(source).digest('hex'), PRE_PAINT_SHA[name],
    name+': authenticated complete pre-paint source');
  return source;
}
