// Source-only scalar calipers and the actual 2026-09-19 corrected bow raster.
// These finite witnesses protect real mounting stock as well as exterior air.
// No source topology or runtime vehicle geometry is stored in this QA module.
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
const raster = Object.freeze({
  "gridW": 67,
  "gridH": 153,
  "bounds": {
    "x0": -1.9813799629211424,
    "x1": 1.9813799629211424,
    "z0": -4.221280212402344,
    "z1": 4.905499982833862
  }
});
const rows = Object.freeze({
  "12": [
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    37,
    41
  ],
  "13": [
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    36,
    37,
    38,
    39,
    40,
    41,
    42
  ],
  "14": [
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    36,
    37,
    38,
    39,
    40,
    41,
    42
  ],
  "15": [
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    36,
    37,
    38,
    39,
    40,
    41,
    42
  ],
  "16": [
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    36,
    37,
    38,
    39,
    40,
    41,
    42
  ],
  "17": [
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    36,
    37,
    38,
    39,
    40,
    41,
    42
  ]
});
export function barakOpeningCell(x,z){
  const gx=(x-raster.bounds.x0)/(raster.bounds.x1-raster.bounds.x0)*raster.gridW-.5;
  const gy=(raster.bounds.z1-z)/(raster.bounds.z1-raster.bounds.z0)*raster.gridH-.5;
  return Math.abs(gx-Math.round(gx))<1e-8 && Math.abs(gy-Math.round(gy))<1e-8
    && (rows[Math.round(gy)]??[]).includes(Math.round(gx));
}
export function validBarakOpeningRaster(scan){
  return scan?.holeCells===79 && scan.gridW===raster.gridW && scan.gridH===raster.gridH
    && Object.entries(raster.bounds).every(([key,value])=>Math.abs(scan.bounds?.[key]-value)<1e-9)
    && scan.samples?.length===79 && scan.samples.every(sample=>barakOpeningCell(sample.x,sample.z));
}
export function validBarakSourceConfiguration(config){
  const expected=BARAK_SOURCE_CONFIGURATION;
  return config?.id===expected.id && config.source?.path===expected.source.path
    && config.source?.sha256===expected.source.sha256 && config.roofMachineGuns===1
    && config.originalSha256===expected.originalSha256
    && JSON.stringify(config.registration)===JSON.stringify(expected.registration);
}
