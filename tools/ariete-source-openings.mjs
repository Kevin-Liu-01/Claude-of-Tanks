// Independent source scalar calipers, not source topology or runtime geometry.
// See docs/research/ariete-rear-openings-20260921.md for evidence and limits.
export const ARIETE_OPENING_RASTERS = {"ariete_c1_x":{"high":{"gridW":79,"gridH":180,"bounds":{"x0":-2.3437598896026612,"x1":2.3437598896026612,"z0":-4.439010257720947,"z1":6.3146120699000985},"cells":[[38,174],[38,175],[38,176],[39,176],[39,175]]},"low":{"gridW":79,"gridH":180,"bounds":{"x0":-2.3437598896026612,"x1":2.3437598896026612,"z0":-4.439010257720947,"z1":6.315212069601902},"cells":[[38,174],[38,175],[38,176],[39,176],[39,175]]}},"ariete_c2_x":{"high":{"gridW":79,"gridH":196,"bounds":{"x0":-2.3437598896026612,"x1":2.3437598896026612,"z0":-4.439010257720947,"z1":7.313811937148634},"cells":[[38,190],[38,191],[38,192],[39,192],[39,191]]},"low":{"gridW":79,"gridH":196,"bounds":{"x0":-2.3437598896026612,"x1":2.3437598896026612,"z0":-4.439010257720947,"z1":7.314411937121467},"cells":[[38,190],[38,191],[38,192],[39,192],[39,191]]}}};
const ARIETE_REAR_WITNESSES = [
  {
    "key": "upper-head-0",
    "origin": [
      0.03696000000000001,
      2.4640000000000004,
      -4.262720000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.8289544582366946,
    "tolerance": 0.002
  },
  {
    "key": "upper-head-1",
    "origin": [
      0.09856000000000002,
      2.4640000000000004,
      -4.1888000000000005
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.8279183983802796,
    "tolerance": 0.002
  },
  {
    "key": "upper-head-2",
    "origin": [
      -0.17248000000000005,
      2.4640000000000004,
      -4.164160000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.8121068485017737,
    "tolerance": 0.002
  },
  {
    "key": "upper-head-3",
    "origin": [
      -0.17248000000000005,
      2.4640000000000004,
      -4.225760000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.8289544582366946,
    "tolerance": 0.002
  },
  {
    "key": "flat-head-underside",
    "origin": [
      0.03696000000000001,
      1.6016000000000004,
      -4.262720000000001
    ],
    "direction": [
      0,
      1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.7833600878715516,
    "tolerance": 0.002
  },
  {
    "key": "right-hinge",
    "origin": [
      0.24640000000000006,
      1.8048800000000005,
      -3.9547200000000005
    ],
    "direction": [
      -1,
      0,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 0,
    "value": 0.08911619484424592,
    "tolerance": 0.002
  },
  {
    "key": "C-inner-air",
    "origin": [
      -0.024640000000000006,
      2.4640000000000004,
      -4.176480000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "air"
  },
  {
    "key": "C-left-air",
    "origin": [
      -0.14784000000000003,
      2.4640000000000004,
      -4.176480000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "air"
  },
  {
    "key": "throat-air",
    "origin": [
      -0.14168000000000003,
      1.8061120000000002,
      -4.176480000000001
    ],
    "direction": [
      0,
      0,
      1
    ],
    "far": 0.022176,
    "expect": "air"
  },
  {
    "key": "ear-upper-underside",
    "origin": [
      -0.17248000000000005,
      1.8159680000000002,
      -4.225760000000001
    ],
    "direction": [
      0,
      1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.817555832862854,
    "tolerance": 0.002
  },
  {
    "key": "ear-lower-jaw",
    "origin": [
      -0.17248000000000005,
      1.7937920000000003,
      -4.225760000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.7926863312721253,
    "tolerance": 0.002
  },
  {
    "key": "lower-hook-or-deck-0",
    "origin": [
      0.0,
      2.4640000000000004,
      -4.135824000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.1783974288949193,
    "tolerance": 0.002
  },
  {
    "key": "lower-hook-or-deck-1",
    "origin": [
      0.0,
      2.4640000000000004,
      -4.11488
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.2045702099354574,
    "tolerance": 0.002
  },
  {
    "key": "lower-hook-or-deck-2",
    "origin": [
      0.0,
      2.4640000000000004,
      -4.0902400000000005
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.1246717558225,
    "tolerance": 0.002
  },
  {
    "key": "lower-hook-throat",
    "origin": [
      0.0,
      1.1704,
      -4.077920000000001
    ],
    "direction": [
      0,
      0,
      1
    ],
    "far": 0.11088,
    "expect": "air"
  },
  {
    "key": "upper-lock-jaw",
    "origin": [
      0.0,
      1.2812800000000002,
      -4.1888000000000005
    ],
    "direction": [
      0,
      0,
      1
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 2,
    "value": -4.032845321269465,
    "tolerance": 0.002
  },
  {
    "key": "flared-right-root",
    "origin": [
      0.09240000000000001,
      1.8233600000000003,
      -4.065600000000001
    ],
    "direction": [
      0,
      0,
      1
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 2,
    "value": -3.894789466618932,
    "tolerance": 0.002
  },
  {
    "key": "cross-pin-head-top",
    "origin": [
      -0.07392000000000001,
      2.4640000000000004,
      -4.288973920000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.8289544582366946,
    "tolerance": 0.002
  },
  {
    "key": "cross-pin-head-under",
    "origin": [
      -0.07392000000000001,
      1.6016000000000004,
      -4.288973920000001
    ],
    "direction": [
      0,
      1,
      0
    ],
    "far": 12.320000000000002,
    "expect": "stock",
    "axis": 1,
    "value": 1.7833600878715516,
    "tolerance": 0.002
  },
  {
    "key": "receiver--0.18-1.46",
    "origin": [
      -0.22176,
      1.7987200000000003,
      -4.065600000000001
    ],
    "direction": [
      0,
      0,
      1
    ],
    "far": 0.24640000000000006,
    "expect": "stock",
    "axis": 2,
    "value": -3.8900256633758548,
    "tolerance": 0.002
  },
  {
    "key": "pin-aft--0.1-1.464",
    "origin": [
      -0.12320000000000003,
      1.8036480000000001,
      -4.336640000000001
    ],
    "direction": [
      0,
      0,
      1
    ],
    "far": 0.09856000000000002,
    "expect": "stock",
    "axis": 2,
    "value": -4.298995908442659,
    "tolerance": 0.002
  },
  {
    "key": "neck--3.26",
    "origin": [
      0.0,
      2.4640000000000004,
      -4.01632
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2.2,
    "expect": "stock",
    "axis": 1,
    "value": 1.8273505506419423,
    "tolerance": 0.002
  },
  {
    "key": "neck--3.25",
    "origin": [
      0.0,
      2.4640000000000004,
      -4.004000000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2.2,
    "expect": "stock",
    "axis": 1,
    "value": 1.8272273595758535,
    "tolerance": 0.002
  },
  {
    "key": "neck--3.24",
    "origin": [
      0.0,
      2.4640000000000004,
      -3.991680000000001
    ],
    "direction": [
      0,
      -1,
      0
    ],
    "far": 2.2,
    "expect": "stock",
    "axis": 1,
    "value": 1.8270597265316506,
    "tolerance": 0.002
  }
];
// This authority covers only the retained rear coupler. It cannot authorize
// roof equipment or give the derived C2 a source-comparison score.
export const ARIETE_OPENING_INPUTS = Object.freeze({
  "public/models/community-candidates/ariete_c1_x_source.glb": "1f33b3966189c876c8e507a57c59def5e6f3a70334d42315e0366911aedb6177",
  "docs/research/second-wave-registrations/ariete_c1_x-tier10-20260921.json": "a94040de976c7ee8d3f17bb65fd5791892a332c9d5f79996aa4e343662cd7c79",
  "docs/research/second-wave-registrations/ariete_c1_x-tier10-20260921.receipt.json": "8f3d5f29561dd121b309f27aee0ac9105421408e9cb38106eb8fdfde2cb5dec5"
});
const SOURCE = Object.freeze({path:Object.keys(ARIETE_OPENING_INPUTS)[0],sha256:Object.values(ARIETE_OPENING_INPUTS)[0]});
const REGISTRATION = Object.freeze({
  originalSha256:'02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4',
  axes:['x','y','z'],scale:0.026320365106272007,translation:[0.0, 0.003108704626582337, 0.9377925283609337],
  ownerRequestedEnlargement:1.2320000000000002,
});
export function isArieteOpeningTarget(id) { return Object.hasOwn(ARIETE_OPENING_RASTERS,id); }
export function arieteOpeningConfiguration(id) {
  return isArieteOpeningTarget(id) ? {id,scope:'retained-rear-coupler-only',source:SOURCE,
    registration:REGISTRATION,inputs:ARIETE_OPENING_INPUTS} : null;
}
export function arieteOpeningSourceReceipt(id,inputs) {
  return {id,...SOURCE,scope:'retained-rear-coupler-only',inputs,
    verified:isArieteOpeningTarget(id) && Object.entries(ARIETE_OPENING_INPUTS).every(([p,h])=>inputs?.[p]===h)};
}
export function validArieteOpeningSource(id,configuration,receipt) {
  const expected=arieteOpeningConfiguration(id);
  return expected!==null && JSON.stringify(configuration)===JSON.stringify(expected)
    && receipt?.verified===true && receipt.id===id && receipt.path===SOURCE.path && receipt.sha256===SOURCE.sha256
    && receipt.scope===expected.scope && arieteOpeningSourceReceipt(id,receipt.inputs).verified;
}
function raster(id,quality) { return ARIETE_OPENING_RASTERS[id]?.[quality]; }
function center(scan,gx,gy,sx=1,sy=1) {
  return [scan.bounds.x0+(gx+(sx+.5)/3)*(scan.bounds.x1-scan.bounds.x0)/scan.gridW,
    scan.bounds.z1-(gy+(sy+.5)/3)*(scan.bounds.z1-scan.bounds.z0)/scan.gridH];
}
export function validArieteOpeningRaster(id,scan,quality='high') {
  const expected=raster(id,quality);
  if(!expected || !scan || scan.holeCells!==expected.cells.length || scan.cellM!==.06
      || scan.gridW!==expected.gridW || scan.gridH!==expected.gridH
      || !Array.isArray(scan.samples) || scan.samples.length!==expected.cells.length) return false;
  if(!Object.entries(expected.bounds).every(([k,v])=>Math.abs(scan.bounds?.[k]-v)<=1e-9)) return false;
  return scan.samples.every(s=>expected.cells.some(([gx,gy])=>s.gx===gx&&s.gy===gy));
}
export function arieteOpeningCell(id,x,z,quality='high') {
  const expected=raster(id,quality);
  return Boolean(expected?.cells.some(([gx,gy])=>{
    const [cx,cz]=center(expected,gx,gy);return Math.abs(x-cx)<=1e-9&&Math.abs(z-cz)<=1e-9;
  }));
}
export function arieteOpeningWitnesses(id,quality='high') {
  const expected=raster(id,quality);if(!expected)return [];
  const air=expected.cells.flatMap(([gx,gy],i)=>Array.from({length:9},(_,p)=>{
    const [x,z]=center(expected,gx,gy,p%3,Math.floor(p/3));
    return {key:`raster-${i}-subpixel-${p}`,origin:[x,6,z],direction:[0,-1,0],far:20,expect:'air'};
  }));
  return [...ARIETE_REAR_WITNESSES,...air];
}
