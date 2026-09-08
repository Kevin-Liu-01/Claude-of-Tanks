import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Exact pre-paint sources at main 2933d5645. Only declared finish wrappers
// are reversed; night lighting, geometry, low-detail counts and every other
// byte must match that independently committed source. No fixture refresh.
export const PRE_PAINT_SHA = Object.freeze({
  "leopardA5XDetails.ts": "1403c3975cb2b0eab2e2abd8d143eb3f3b3b76050c40235e3ec8367d0bfe0e25",
  "leopardA6X.ts": "9e10be26c5e69baa4386458996f85a3933daf78d081fb3004125fc186a58feea",
  "leclercXSourceFittings.ts": "670d631586ae285ba884395694b73b7a75e0a6b19400309cb7afb67b06b3ca91",
  "amx40XHullSkirts.ts": "d9df76151697de929b2e7ed6d915d3283a679905c722aba1cbd6ae27dca715fb"
});
const edits = {
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
  for (const [before, after] of [...edits[name]].reverse()) {
    assert.equal(source.split(after).length, 2, name+': one exact material edit');
    source = source.replace(after, before);
  }
  assert.equal(createHash('sha256').update(source).digest('hex'), PRE_PAINT_SHA[name],
    name+': authenticated complete pre-paint source');
  return source;
}
