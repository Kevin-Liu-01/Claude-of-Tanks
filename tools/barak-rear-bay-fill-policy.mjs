// Authoring only: retain the measured rear room behind the owner's closed
// door (2026-09-20). No native/source triangle is removed from any audit.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {BARAK_SOURCE_CONFIGURATION} from './barak-source-openings.mjs';
import {sourceOpeningRayProbe} from './source-opening-rays.mjs';

const CONFIG=JSON.stringify(BARAK_SOURCE_CONFIGURATION);
export const BARAK_BAY_STOCK_WITNESSES=Object.freeze([
  ...[-.15,0,.15].flatMap(x=>[
    {key:`closed-door_${x}`,origin:[x,.9,-4.3],direction:[0,0,1],axis:2,value:-2.633583,far:4},
    {key:`back_${x}`,origin:[x,.9,-2.4],direction:[0,0,1],axis:2,value:-.6815763,far:4},
    {key:`slope_${x}`,origin:[x,1.35,-2.4],direction:[0,0,1],axis:2,value:-1.080278731,far:4},
    {key:`header_${x}`,origin:[x,1.5,-4.3],direction:[0,0,1],axis:2,value:-2.5955832,far:4},
  ]),
  {key:'floor',origin:[0,1,-2],direction:[0,-1,0],axis:1,value:.5134441,far:1},
  {key:'ceiling',origin:[0,1,-2],direction:[0,1,0],axis:1,value:1.503806,far:1},
  {key:'header-top',origin:[0,2,-2.55],direction:[0,-1,0],axis:1,value:1.628430,far:1},
  {key:'sill',origin:[0,.9,-2.55],direction:[0,-1,0],axis:1,value:.586397,far:1},
  {key:'left-wall',origin:[0,.9,-2],direction:[-1,0,0],axis:0,value:-.900982,far:1.2},
  {key:'right-wall',origin:[0,.9,-2],direction:[1,0,0],axis:0,value:.900477,far:1.2},
]);

export function verifyBarakBayIdentity(configuration,sourceSha256){
  assert.equal(JSON.stringify(configuration),CONFIG,'Barak bay source configuration/registration changed');
  assert.equal(sourceSha256,BARAK_SOURCE_CONFIGURATION.source.sha256,'Barak bay canonical source changed');
}
export function verifyBarakBayNativeStock(root){
  const probe=sourceOpeningRayProbe(root);
  try{return BARAK_BAY_STOCK_WITNESSES.map(w=>{
    const hit=probe.cast(w.origin,w.direction,w.far);
    assert.ok(hit&&Math.abs(hit.point.getComponent(w.axis)-w.value)<=.002,`Barak bay structural first-hit mismatch: ${w.key}`);
    return {key:w.key,mesh:hit.object.name,point:hit.point.toArray()};
  });}finally{probe.dispose();}
}
const ceiling=z=>z<=-1.481983?1.503806:1.503806-(z+1.481983)*(.306463/.800407);
const overlaps=(min,max,lo,hi)=>max>lo+1e-9&&min<hi-1e-9;
function portalOverlap(min,max){
  if(!overlaps(min[2],max[2],-2.555583,-2.475583))return false;
  // Closest point of this voxel to the rounded rectangle's center. A voxel
  // touching only solid corner stock is not part of the opening.
  const x=Math.min(max[0],Math.max(min[0],-.0005))+.0005;
  const y=Math.min(max[1],Math.max(min[1],1.0078825))-1.0078825;
  const dx=Math.max(Math.abs(x)-(.551554/2-.0769),0);
  const dy=Math.max(Math.abs(y)-(.842971/2-.0769),0);
  return dx*dx+dy*dy<.0769**2-1e-12;
}
export function barakBayIntersectsCell(min,max){
  assert.ok(min.length===3&&max.length===3&&min.every((v,i)=>Number.isFinite(v)&&Number.isFinite(max[i])&&v<max[i]),'finite positive voxel bounds');
  if(portalOverlap(min,max))return true;
  if(!overlaps(min[2],max[2],-2.475583,-.681576))return false;
  if(!overlaps(min[0],max[0],-.900982,.900477))return false;
  return overlaps(min[1],max[1],.513444,ceiling(Math.max(min[2],-2.475583)));
}

export function createBarakBayFillPolicy(id,root,{configuration=BARAK_SOURCE_CONFIGURATION,sourceBytes}={}){
  if(id!=='merkava4_barak')return null;
  const bytes=sourceBytes??readFileSync(BARAK_SOURCE_CONFIGURATION.source.path);
  verifyBarakBayIdentity(configuration,createHash('sha256').update(bytes).digest('hex'));
  const structuralWitnesses=verifyBarakBayNativeStock(root),cells=new Map();
  return {
    protects(grid,x,y,z){
      const min=[x,y,z].map((v,i)=>grid.origin[i]+v*grid.voxel),max=min.map(v=>v+grid.voxel);
      if(!barakBayIntersectsCell(min,max))return false;
      cells.set(`${x},${y},${z}`,{index:[x,y,z],min,max});return true;
    },
    receipt(){return {id,source:BARAK_SOURCE_CONFIGURATION,structuralWitnesses,
      rule:'Only voxel cells intersecting the remaining rounded entrance behind the owner-selected closed leaf or finite source bay air; complete source/native stock remains in all audits.',
      cells:[...cells.values()]};},
  };
}
