// Independent source scalar calipers, not source topology or runtime geometry.
// See docs/research/ariete-rear-openings-20260921.md for evidence and limits.
export const ARIETE_OPENING_RASTERS = {"ariete_c1_x":{"high":{"gridW":72,"gridH":164,"bounds":{"x0":-2.1416000080108644,"x1":2.1416000080108644,"z0":-4.046373243331909,"z1":5.75146521464917},"cells":[[34,159],[35,160]]},"low":{"gridW":72,"gridH":164,"bounds":{"x0":-2.1416000080108644,"x1":2.1416000080108644,"z0":-4.046373243331909,"z1":5.752065214749414},"cells":[[34,159],[35,160]]}},"ariete_c2_x":{"high":{"gridW":72,"gridH":164,"bounds":{"x0":-2.1416000080108644,"x1":2.1416000080108644,"z0":-4.046373243331909,"z1":5.75146521464917},"cells":[[34,159],[35,160]]},"low":{"gridW":72,"gridH":164,"bounds":{"x0":-2.1416000080108644,"x1":2.1416000080108644,"z0":-4.046373243331909,"z1":5.752065214749414},"cells":[[34,159],[35,160]]}}};
const ARIETE_REAR_WITNESSES = [
  {"key":"upper-head-0","origin":[0.033600000000000005,2.24,-3.8752000000000004],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6626858711242676,"tolerance":0.002},
  {"key":"upper-head-1","origin":[0.08960000000000001,2.24,-3.8080000000000003],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6617439985275269,"tolerance":0.002},
  {"key":"upper-head-2","origin":[-0.15680000000000002,2.24,-3.7856],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6473698622743396,"tolerance":0.002},
  {"key":"upper-head-3","origin":[-0.15680000000000002,2.24,-3.8416000000000006],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6626858711242676,"tolerance":0.002},
  {"key":"flat-head-underside","origin":[0.033600000000000005,1.4560000000000002,-3.8752000000000004],"direction":[0,1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6212364435195923,"tolerance":0.002},
  {"key":"right-hinge","origin":[0.22400000000000003,1.6408000000000003,-3.5952],"direction":[-1,0,0],"far":11.200000000000001,"expect":"stock","axis":0,"value":0.0810147225856781,"tolerance":0.002},
  {"key":"C-inner-air","origin":[-0.022400000000000003,2.24,-3.7968000000000006],"direction":[0,-1,0],"far":11.200000000000001,"expect":"air"},
  {"key":"C-left-air","origin":[-0.13440000000000002,2.24,-3.7968000000000006],"direction":[0,-1,0],"far":11.200000000000001,"expect":"air"},
  {"key":"throat-air","origin":[-0.12880000000000003,1.64192,-3.7968000000000006],"direction":[0,0,1],"far":0.02016,"expect":"air"},
  {"key":"ear-upper-underside","origin":[-0.15680000000000002,1.6508800000000001,-3.8416000000000006],"direction":[0,1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6523234844207764,"tolerance":0.002},
  {"key":"ear-lower-jaw","origin":[-0.15680000000000002,1.6307200000000002,-3.8416000000000006],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.629714846611023,"tolerance":0.002},
  {"key":"lower-hook-or-deck-0","origin":[0,2.24,-3.7598400000000005],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.071270389904472,"tolerance":0.002},
  {"key":"lower-hook-or-deck-1","origin":[0,2.24,-3.7408],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.095063827214052,"tolerance":0.002},
  {"key":"lower-hook-or-deck-2","origin":[0,2.24,-3.7184000000000004],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.0224288689295453,"tolerance":0.002},
  {"key":"lower-hook-throat","origin":[0,1.064,-3.7072000000000003],"direction":[0,0,1],"far":0.1008,"expect":"air"},
  {"key":"upper-lock-jaw","origin":[0,1.1648,-3.8080000000000003],"direction":[0,0,1],"far":11.200000000000001,"expect":"stock","axis":2,"value":-3.666223019335877,"tolerance":0.002},
  {"key":"flared-right-root","origin":[0.084,1.6576000000000002,-3.696],"direction":[0,0,1],"far":11.200000000000001,"expect":"stock","axis":2,"value":-3.540717696926302,"tolerance":0.002},
  {"key":"cross-pin-head-top","origin":[-0.06720000000000001,2.24,-3.8990672000000006],"direction":[0,-1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6626858711242676,"tolerance":0.002},
  {"key":"cross-pin-head-under","origin":[-0.06720000000000001,1.4560000000000002,-3.8990672000000006],"direction":[0,1,0],"far":11.200000000000001,"expect":"stock","axis":1,"value":1.6212364435195923,"tolerance":0.002},
  {"key":"receiver--0.18-1.46","origin":[-0.2016,1.6352000000000002,-3.696],"direction":[0,0,1],"far":0.22400000000000003,"expect":"stock","axis":2,"value":-3.5363869667053223,"tolerance":0.002},
  {"key":"pin-aft--0.1-1.464","origin":[-0.11200000000000002,1.63968,-3.9424000000000006],"direction":[0,0,1],"far":0.08960000000000001,"expect":"stock","axis":2,"value":-3.9081780985842354,"tolerance":0.002},
  {"key":"neck--3.26","origin":[0,2.24,-3.6512000000000002],"direction":[0,-1,0],"far":2,"expect":"stock","axis":1,"value":1.6612277733108565,"tolerance":0.002},
  {"key":"neck--3.25","origin":[0,2.24,-3.6400000000000006],"direction":[0,-1,0],"far":2,"expect":"stock","axis":1,"value":1.6611157814325939,"tolerance":0.002},
  {"key":"neck--3.24","origin":[0,2.24,-3.6288000000000005],"direction":[0,-1,0],"far":2,"expect":"stock","axis":1,"value":1.660963387756046,"tolerance":0.002}
];
// This authority covers only the retained rear coupler. It cannot authorize
// roof equipment or give the derived C2 a source-comparison score.
export const ARIETE_OPENING_INPUTS = Object.freeze({
  'public/models/community-candidates/ariete_c1_x_source.glb':'1112ea55fab10920e78063a4aec4a6b5e5695751f176bfabc3b72a605bbf0c68',
  'docs/research/second-wave-registrations/ariete_c1_x-enlarged-20260921.json':'2fac6ad3b23939e4013002a8b53a1f3128eef16d028498ff5fd486a49694371c',
  'docs/research/second-wave-registrations/ariete_c1_x-enlarged-20260921.receipt.json':'2e75738ea98405db0e64ab6af2d4ef7632e0e391c4280c99af7852e4594162b3',
});
const SOURCE = Object.freeze({path:Object.keys(ARIETE_OPENING_INPUTS)[0],sha256:Object.values(ARIETE_OPENING_INPUTS)[0]});
const REGISTRATION = Object.freeze({
  originalSha256:'02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4',
  axes:['x','y','z'],scale:.02392760464206546,translation:[0,.0028260951150748514,.8525386621463034],
  ownerRequestedEnlargement:1.12,
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
