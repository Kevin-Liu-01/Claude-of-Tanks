import assert from 'node:assert/strict';

// Exact metadata-only source edits introduced by the 2026-09-29 smoke controls.
// Reverse these literals before the existing independently committed hashes.
// No geometry coordinates, transforms, imports or other text are normalized.
const edits = {
  "leopardA6X.ts": [
    [
      "import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';\n",
      ""
    ],
    [
      "  const rim = markSmokeTube(new THREE.RingGeometry(.0305, .0437, 16));\n",
      "  const rim = new THREE.RingGeometry(.0305, .0437, 16);\n"
    ]
  ],
  "t72buX.ts": [
    [
      "import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';\n",
      ""
    ],
    [
      "      equipment(P,'turretDark',markSmokeTube(blindTube(.049,.032,.275,.100,20),[0,0,1],true).rotateX(-.27).rotateY(side*yaw),side*(x-.002),y,z);\n",
      "      equipment(P,'turretDark',blindTube(.049,.032,.275,.100,20).rotateX(-.27).rotateY(side*yaw),side*(x-.002),y,z);\n"
    ]
  ],
  "chieftain10X.ts": [
    [
      "import { markOpenSmokeTube } from '../vehicleAuxiliaryGeometry.ts';\n",
      ""
    ],
    [
      "      markOpenSmokeTube(g.rotateX(Math.PI / 2));\n",
      "      g.rotateX(Math.PI / 2);\n"
    ]
  ],
  "merkavaX.ts": [
    [
      "import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';\n",
      ""
    ],
    [
      "  topPart(P,MK3,'turretDetail',markSmokeTube(tube,[0,0,1],true),x,y-MK3.ground,z+MK3.center,rx,ry);\n",
      "  topPart(P,MK3,'turretDetail',tube,x,y-MK3.ground,z+MK3.center,rx,ry);\n"
    ],
    [
      "      put('turretDetail',markSmokeTube(cylZ(.043,.42,14)),side*(x+(side<0?-.055:0)),y,z,-.22,side*.46);\n",
      "      put('turretDetail',cylZ(.043,.42,14),side*(x+(side<0?-.055:0)),y,z,-.22,side*.46);\n"
    ]
  ],
  "namerSourceChassis.ts": [
    [
      "import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';\n",
      ""
    ],
    [
      "    put(P,'hullDetail',markSmokeTube(KIT.cylZ(.050,.035,P.q?16:10)),side*x,y,z,-.332,side*.035);\n",
      "    put(P,'hullDetail',KIT.cylZ(.050,.035,P.q?16:10),side*x,y,z,-.332,side*.035);\n"
    ]
  ]
};
export function beforeSmokeAnnotations(name, source) {
  assert.ok(edits[name], `Undeclared smoke annotation source ${name}`);
  for (const [current, before] of edits[name]) {
    assert.equal(source.split(current).length, 2, `${name}: one exact smoke annotation`);
    source = source.replace(current, before);
  }
  return source;
}
