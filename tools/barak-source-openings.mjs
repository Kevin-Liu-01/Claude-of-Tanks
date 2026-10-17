// Source-only scalar calipers and the corrected bow opening (first pinned 2026-09-19; hull-frame lattice cells
// since 227).
// These finite witnesses protect real mounting stock as well as exterior air.
// No source topology or runtime vehicle geometry is stored in this QA module.
import {isLatticeCellCenter,scanMatchesLatticeCells} from './contig-grid.mjs';
export const BARAK_SOURCE_CONFIGURATION = Object.freeze({
  "id": "merkava4_barak",
  "source": {
    "path": "public/models/community-candidates/merkava4_barak_x_source.glb",
    "sha256": "0549b50430cd8df0ebf9d095b617e64e8c6274747bea1dd99e4dec0e987b8f4d"
  },
  "roofMachineGuns": 1,
  "originalSha256": "81cc2cf027af4475c5890089067dd9b1f77d9fbd306939e24f973ad68e099aa5",
  "registration": {
    "axes": [
      "+x",
      "+y",
      "+z"
    ],
    "scale": 0.989867,
    "translation": [
      -0.0005,
      0.000594,
      0.2097
    ]
  }
});
export const BARAK_OPENING_WITNESSES = Object.freeze([
  {
    "key": "right-upper-strap-a",
    "origin": [
      0.6,
      2,
      3.888
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2,
    "expect": "stock",
    "axis": 1,
    "value": 0.9329903484689837,
    "tolerance": 0.002
  },
  {
    "key": "left-upper-strap-a",
    "origin": [
      -0.6,
      2,
      3.888
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2,
    "expect": "stock",
    "axis": 1,
    "value": 0.9329903484689837,
    "tolerance": 0.002
  },
  {
    "key": "right-upper-strap-b",
    "origin": [
      0.6,
      2,
      4.064
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2,
    "expect": "stock",
    "axis": 1,
    "value": 0.8508881450702859,
    "tolerance": 0.002
  },
  {
    "key": "left-upper-strap-b",
    "origin": [
      -0.6,
      2,
      4.064
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2,
    "expect": "stock",
    "axis": 1,
    "value": 0.8508881450702859,
    "tolerance": 0.002
  },
  {
    "key": "right-strap-aperture",
    "origin": [
      0.54,
      0.825,
      3.95
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.1,
    "expect": "air"
  },
  {
    "key": "left-strap-aperture",
    "origin": [
      -0.54,
      0.825,
      3.95
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.1,
    "expect": "air"
  },
  {
    "key": "right-strap-bottom-arm",
    "origin": [
      0.54,
      0.77,
      3.95
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.1,
    "expect": "stock",
    "axis": 0,
    "value": 0.5712471604347229,
    "tolerance": 0.002
  },
  {
    "key": "left-strap-bottom-arm",
    "origin": [
      -0.54,
      0.77,
      3.95
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.1,
    "expect": "stock",
    "axis": 0,
    "value": -0.5722472071647644,
    "tolerance": 0.002
  },
  {
    "key": "right-mount-corner",
    "origin": [
      0.5,
      0.94,
      3.83
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.1,
    "expect": "stock",
    "axis": 0,
    "value": 0.5525386929512024,
    "tolerance": 0.002
  },
  {
    "key": "left-mount-corner",
    "origin": [
      -0.5,
      0.94,
      3.83
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.1,
    "expect": "stock",
    "axis": 0,
    "value": -0.5535387396812439,
    "tolerance": 0.002
  },
  {
    "key": "right-main-body",
    "origin": [
      0.56,
      2,
      3.52
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2,
    "expect": "stock",
    "axis": 1,
    "value": 1.1596474801082044,
    "tolerance": 0.002
  },
  {
    "key": "left-main-body",
    "origin": [
      -0.56,
      2,
      3.52
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2,
    "expect": "stock",
    "axis": 1,
    "value": 1.1596729092944704,
    "tolerance": 0.002
  },
  {
    "key": "right-lower-receiver",
    "origin": [
      0.54,
      0.85,
      3.72
    ],
    "direction": [
      1,
      0,
      0
    ],
    "far": 0.11,
    "expect": "stock",
    "axis": 0,
    "value": 0.5698613524436951,
    "tolerance": 0.002
  },
  {
    "key": "left-lower-receiver",
    "origin": [
      -0.54,
      0.85,
      3.72
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 0.11,
    "expect": "stock",
    "axis": 0,
    "value": -0.5708613991737366,
    "tolerance": 0.002
  }
]);
// The corrected bow opening as hull-frame lattice cells [kx, kz] of the §B2 raster (tools/contig-grid.mjs).
// Measured 2026-10-17 on main 16aeab482 from the page's own gate scan (high quality).
// The pre-227 pin (gridW 67, gridH 153, AABB bounds, 79 cells in rows 12-17) broke on any AABB change: on
// main 16aeab482 the AABB's bow end sits 2 cm further forward and the re-phased grid reads 71 cells there.
export const BARAK_OPENING_CELLS = Object.freeze([[-9,69],[-5,69],[-3,69],[-9,68],[-8,68],[-7,68],[-6,68],[-5,68],[-4,68],[-3,68],[2,68],[3,68],[4,68],[5,68],[6,68],[7,68],[8,68],[-9,67],[-8,67],[-7,67],[-6,67],[-5,67],[-4,67],[-3,67],[2,67],[3,67],[4,67],[5,67],[6,67],[7,67],[8,67],[-9,66],[-8,66],[-7,66],[-6,66],[-5,66],[-4,66],[-3,66],[2,66],[3,66],[4,66],[5,66],[6,66],[7,66],[8,66],[-9,65],[-8,65],[-7,65],[-6,65],[-5,65],[-4,65],[-3,65],[2,65],[3,65],[4,65],[5,65],[6,65],[7,65],[8,65],[-9,64],[-8,64],[-7,64],[-6,64],[-5,64],[-4,64],[-3,64],[2,64],[3,64],[4,64],[5,64],[6,64],[7,64],[8,64]].map(cell=>Object.freeze(cell)));
export function barakOpeningCell(x,z){
  return isLatticeCellCenter(x,z,BARAK_OPENING_CELLS);
}
export function validBarakOpeningRaster(scan){
  return scanMatchesLatticeCells(scan,BARAK_OPENING_CELLS);
}
export function validBarakSourceConfiguration(config){
  const expected=BARAK_SOURCE_CONFIGURATION;
  return config?.id===expected.id && config.source?.path===expected.source.path
    && config.source?.sha256===expected.source.sha256 && config.roofMachineGuns===1
    && config.originalSha256===expected.originalSha256
    && JSON.stringify(config.registration)===JSON.stringify(expected.registration);
}
