import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {type10SkirtSection} from './profiles/type10XSkirts.ts';
import {sectionSolid} from './profiles/sectionSolid.ts';
import {KIT} from './tankFactoryCore.ts';

const SPANS=[[-2.4732,-1.4735],[-1.4782,-.2190],[-.2167,1.0250],
  [1.0285,2.2909648],[2.2940,3.1363]];
export const TYPE10_ROLLER_SUPPORT_LINE='    returnRollerHullHalfWidthM:.878,\n';

// Reverse only the two declared call-site edits. The caller still authenticates
// every other byte against the independently committed pre-paint source hash.
export function beforeType10GearRebuild(source) {
  const imported="import {buildType10XGear} from './type10XGear.ts';\n";
  const called='P.gear=buildType10XGear(P,{';
  assert.equal(source.split(imported).length,2,'one fitted-gear import');
  assert.equal(source.split(called).length,2,'one fitted-gear call');
  return source.replace(imported,'').replace(called,'P.gear=KIT.buildRunningGear(P,{');
}

export function withHistoricalType10Supports(build) {
  const original=KIT.buildRunningGear;let calls=0;
  KIT.buildRunningGear=(P,cfg)=>{
    assert.equal(P.spec.id,'type10_x');
    assert.equal(cfg.returnRollerHullHalfWidthM,.878,'declared six spindle attachments');
    assert.equal(cfg.trackTh,.09,'declared fitted carrier');
    assert.equal(cfg.botY,.02083,'declared lowered course');
    assert.deepEqual(cfg.trackCarrierWidthStations,[{z:-2.40,widthM:.42},{z:-2.30,widthM:.486738}],
      'declared sprocket recess, not a new whole-course source witness');
    assert.equal(cfg.fitLoadedRun,true,'declared live lower-course fit');
    calls++;
    const {returnRollerHullHalfWidthM,roadWheelGeometry,idlerGeometry,sprocketStockGeometry,
      returnRollerGeometry,returnRollerWidthM,returnRollerInsetM,frontArcSteps,rearArcSteps,
      smoothRearTopTangent,dedupeLoopPoints,trackShoeBuilder,loopPoints,
      trackCarrierWidthStations,fitLoadedRun,...old}=cfg;
    // These fresh candidate leaves never enter the historical builder. Release
    // them here; no shared stock or actual candidate model is disposed.
    const leaves=new Set([returnRollerGeometry,...Object.values(roadWheelGeometry),
      ...Object.values(idlerGeometry),...Object.values(sprocketStockGeometry)]);
    for(const geometry of leaves)geometry?.dispose();
    const {trackR:frontTrackR,...idler}=old.idler;
    const {trackR:rearTrackR,...sprocket}=old.sprocket;
    assert.equal(frontTrackR,idler.r+.004);assert.equal(rearTrackR,sprocket.r+.004);
    return original(P,{...old,trackTh:.035,botY:.0805,idler,sprocket});
  };
  try {const result=build();assert.equal(calls,1);return result;}
  finally {KIT.buildRunningGear=original;}
}

// Preserve the existing pre-paint full-source hashes, not a newly accepted
// whole-file fixture. Only this authenticated station-allocation edit reverses.
export function beforeType10SkirtOptimization(source) {
  const start=source.indexOf('// Breaks of the authored');
  const end=source.indexOf('function addSheet');
  assert.ok(start>0&&end>start);
  assert.equal(createHash('sha256').update(source.slice(start,end)).digest('hex'),
    'eb51c7d1830afc8ddcd925a66a9f8ee7edc80d8adfc6c45f38ec954918761b25');
  source=source.slice(0,start)+source.slice(end);
  const declaration='export function type10SkirtSection(';
  assert.equal(source.split(declaration).length,2);
  source=source.replace(declaration,'function sheetSection(');
  const changed='  const sections=type10SkirtStations(panel).map(z=>type10SkirtSection(panel,side,z));';
  assert.equal(source.split(changed).length,2);
  return source.replace(changed,`  const [a,b]=SPANS[panel];
  // Regular authoring subdivisions approximate the analytic bend functions,
  // rather than repeating source vertices or its triangulation.
  const sections=Array.from({length:49},(_,i)=>sheetSection(panel,side,a+(b-a)*i/48));`);
}

// Only used by the historical whole-model witness. Current source/contact/
// ballistics tests always see the efficient actual candidate instead.
export function historicalType10Skirt(geometry,index) {
  assert.equal(geometry.userData.fixedPaintedPanel,'type10-painted-folded-skirt');
  assert.ok(Number.isInteger(index)&&index>=0&&index<10);
  const panel=index%5,side=index<5?-1:1,[a,b]=SPANS[panel];
  geometry.computeBoundingBox();
  assert.ok(side*(geometry.boundingBox.min.x+geometry.boundingBox.max.x)>0);
  assert.ok(Math.abs(geometry.boundingBox.min.z-a)<1e-6&&Math.abs(geometry.boundingBox.max.z-b)<1e-6);
  const old=sectionSolid(Array.from({length:49},(_,i)=>type10SkirtSection(panel,side,a+(b-a)*i/48)));
  old.userData={...geometry.userData};geometry.dispose();return old;
}
