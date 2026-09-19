import {AFT_SOURCE_SLOTS,requiredOpeningGuardKeys,sourceOpeningWitnesses} from './source-opening-witnesses.mjs';
export {AFT_SOURCE_SLOTS,requiredOpeningGuardKeys} from './source-opening-witnesses.mjs';

/** An explicit owner decision can identify exterior air, never waive a leak.
 * Classify every actual raster center against its bounded source region;
 * retain raw counts and reject missing/malformed evidence. */
export function sourceOpeningsVerdict({id,scan,sourceReceipt,configuration,samples,guards}) {
  const raw = scan?.holeCells;
  const registered = ['fv510_milan_x','aft10_x'].includes(id);
  const fail = reason => ({passed:false,rawHoleCells:raw,intentionalCells:0,unexpectedCells:raw,reason});
  if (!Number.isInteger(raw) || raw<0 || scan.error) return fail('Missing continuity scan');
  if (!registered) return {passed:raw===0,rawHoleCells:raw,intentionalCells:0,unexpectedCells:raw};
  if (sourceReceipt?.verified!==true || configuration?.id!==id || sourceReceipt.id!==id
      || sourceReceipt.path!==configuration.source?.path || sourceReceipt.sha256!==configuration.source?.sha256)
    return fail('Approved opening source is missing or changed');
  if (!Array.isArray(samples) || samples.length!==raw || !Array.isArray(scan.samples)
      || scan.samples.length!==raw || !guards?.length || guards.some(guard=>guard.passed!==true))
    return fail('Incomplete raster or finite stock/air witnesses');
  const rasterError = validateRaster(scan, raw);
  if (rasterError) return fail(rasterError);
  const manifestError = validateGuardManifest(id, guards);
  if (manifestError) return fail(manifestError);
  const witnesses=new Map(sourceOpeningWitnesses(id).map(witness=>[witness.key,witness]));
  for(const guard of guards){
    const witness=witnesses.get(guard.key);
    for(const measurement of guard.measurements){
      const measurementError = validateMeasurement(witness, measurement);
      if (measurementError) return fail(measurementError);
    }
  }
  return classifyRaster(id, scan, samples, guards, raw);
}

export function approvedOpeningRegion(id,x,z){
  if(id==='aft10_x')return AFT_SOURCE_SLOTS.some(slot=>Math.abs(x-slot.x)<slot.width/2 && Math.abs(z-slot.z)<slot.length/2);
  // This bounds only where source/native air may be classified. It does not
  // claim that the whole rectangle is empty; complete-source rays still
  // reject every point occupied by an edge lip, ledge or mounting bracket.
  if(id==='fv510_milan_x')return Math.abs(x)>1.55 && Math.abs(x)<1.91
    && z> -2.766 && z<(x<0?2.14:2.666);
  return false;
}

function validateRaster(scan, raw) {
  const {gridW,gridH,bounds}=scan;
  if(!Number.isInteger(gridW)||!Number.isInteger(gridH)||gridW<=0||gridH<=0
      || !bounds || ![bounds.x0,bounds.x1,bounds.z0,bounds.z1].every(Number.isFinite)
      || bounds.x1<=bounds.x0 || bounds.z1<=bounds.z0
      || new Set(scan.samples.map(sample=>`${sample.gx},${sample.gy}`)).size!==raw)
    return 'Invalid or duplicate raster coordinates';
  for(const sample of scan.samples){
    if(!Number.isInteger(sample.gx)||!Number.isInteger(sample.gy)
        ||sample.gx<0||sample.gx>=gridW||sample.gy<0||sample.gy>=gridH
        ||Math.abs(sample.x-(bounds.x0+(sample.gx+.5)*(bounds.x1-bounds.x0)/gridW))>1e-9
        ||Math.abs(sample.z-(bounds.z1-(sample.gy+.5)*(bounds.z1-bounds.z0)/gridH))>1e-9)
      return 'Opening evidence does not use actual raster centers';
  }
  return null;
}

function validateGuardManifest(id, guards) {
  const requiredKeys=requiredOpeningGuardKeys(id), actualKeys=guards.map(guard=>guard.key);
  if(!requiredKeys.length || actualKeys.length!==requiredKeys.length
      || new Set(actualKeys).size!==actualKeys.length
      || requiredKeys.some(key=>!actualKeys.includes(key))
      || guards.some(guard=>!Array.isArray(guard.measurements) || guard.measurements.length!==2
        || guard.measurements[0].owner!=='source' || guard.measurements[1].owner!=='native'
        || guard.measurements.some(measurement=>measurement.passed!==true)))
    return 'Incomplete source/native finite-witness manifest';
  return null;
}

function validateMeasurement(witness, measurement) {
      if(witness.expect==='air'){
        if(measurement.point!==null || measurement.mesh!==null)return 'Air witness contains stock or lacks a measured result';
        return null;
      }
      const point=measurement.point;
      if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)
          ||typeof measurement.mesh!=='string'
          ||Math.abs(point[witness.axis]-witness.value)>witness.tolerance)
        return 'Finite stock witness is missing or outside the measured source depth';
      const offset=point.map((value,axis)=>value-witness.origin[axis]);
      const distance=offset.reduce((sum,value,axis)=>sum+value*witness.direction[axis],0);
      if(distance<0 || distance>(witness.far??20)
          ||offset.some((value,axis)=>Math.abs(value-distance*witness.direction[axis])>1e-6))
        return 'Stock witness does not lie on its finite measurement ray';
  return null;
}

function classifyRaster(id, scan, samples, guards, raw) {
  let intentionalCells=0;
  const failures=[];
  for(let i=0;i<samples.length;i++){
    const sample=samples[i], expected=scan.samples[i];
    const valid=Number.isFinite(sample.x)&&Number.isFinite(sample.z)
      && sample.x===expected.x && sample.z===expected.z
      && sample.gx===expected.gx && sample.gy===expected.gy;
    if(valid && approvedOpeningRegion(id,sample.x,sample.z)
        && sample.sourceAir===true && sample.nativeAir===true)intentionalCells++;
    else failures.push({index:i,...sample});
  }
  return {passed:failures.length===0,rawHoleCells:raw,intentionalCells,
    unexpectedCells:failures.length,failures,guardCount:guards.length};
}
