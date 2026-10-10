#!/usr/bin/env node
// Complete playable-fleet source diagnostic. Defaults include X variants and
// both quality paths. These metrics nominate source and native-view review;
// neither a clean metric row nor this tool qualifies a tank for release.
// Usage: node tools/base-shell-surface-audit.mjs --out=.qa-dev/base-shell/audit.json
// Optional --ids=a,b narrows explicitly; excluded playable IDs stay in report.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {baseShellAuditScope,baseShellInputFingerprint} from './base-shell-audit-inputs.mjs';

const args=process.argv.slice(2), opt=(n,d)=>args.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3)??d;
const root=path.resolve(opt('root',process.cwd()));
const out=path.resolve(opt('out','.qa-dev/base-shell-surface-audit/audit.json'));
// Freeze before importing runtime geometry/spec/policy modules; importing
// first can otherwise pair stale cached inputs with a fresh source digest.
const sourceFingerprint=()=>baseShellInputFingerprint(root);
const sourceBefore=sourceFingerprint(),head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await import(pathToFileURL(path.join(root,'tools/tank-surface-collect.mjs')));
const THREE=await import('three');
const {properSurfaceCrossings}=await import(pathToFileURL(path.join(root,'tools/base-shell-integrity.mjs')));
const {shellPart,slabWarps}=await import(pathToFileURL(path.join(root,'tools/base-shell-audit-math.mjs')));
const {nativeStructuralStock,mapCapturedStock}=await import(pathToFileURL(path.join(root,'tools/base-shell-live-stock.mjs')));
const {createTank}=await import(pathToFileURL(path.join(root,'src/vehicles/tankFactory.ts')));
const {ALL_TANK_IDS,getSpec}=await import(pathToFileURL(path.join(root,'src/vehicles/specs.ts')));
const scope=baseShellAuditScope(ALL_TANK_IDS,opt('ids',''),opt('quality','both'));
const {ids,qualities}=scope;
const key=p=>p.map(n=>Math.round(n*1e5)).join(',');
const vk=v=>key(v.toArray());
const triKey=t=>t.points.map(key).sort().join('|');
const tree=(tris)=>{const box=new THREE.Box3();for(const t of tris)box.union(t.bounds);if(tris.length<10)return{box,tris};const size=box.getSize(new THREE.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';const sorted=[...tris].sort((a,b)=>(a.bounds.min[axis]+a.bounds.max[axis])-(b.bounds.min[axis]+b.bounds.max[axis]));const mid=sorted.length>>1;return{box,left:tree(sorted.slice(0,mid)),right:tree(sorted.slice(mid))};};
const nearest=(node,p,best=Infinity)=>{if(node.box.distanceToPoint(p)>=best)return best;if(node.tris){const q=new THREE.Vector3();for(const t of node.tris){if(t.bounds.distanceToPoint(p)>=best)continue;t.triangle.closestPointToPoint(p,q);best=Math.min(best,q.distanceTo(p));}return best;}const da=node.left.box.distanceToPoint(p),db=node.right.box.distanceToPoint(p),a=da<db?node.left:node.right,b=da<db?node.right:node.left;return nearest(b,p,nearest(a,p,best));};
const mirrorDistance=(p,q)=>{let max=0,sum=0,w=0,witness;const bvh=q.bvh??=tree(q.triangles);for(let ti=0;ti<p.triangles.length;ti++){const t=p.triangles[ti];for(const bary of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){const v=new THREE.Vector3().addScaledVector(t.triangle.a,bary[0]).addScaledVector(t.triangle.b,bary[1]).addScaledVector(t.triangle.c,bary[2]);v.x=-v.x;const d=nearest(bvh,v);sum+=d*t.area;w+=t.area;if(d>max){max=d;witness={triangle:ti,point:v.toArray(),sourceTriangle:t.points};}}}return{maxM:max,meanM:sum/w,witness};};
function topology(p){
 const edges=new Map(),normals=p.triangles.map(t=>t.triangle.getNormal(new THREE.Vector3()));
 for(let i=0;i<p.triangles.length;i++){const t=p.triangles[i];for(let j=0;j<3;j++){const a=key(t.points[j]),b=key(t.points[(j+1)%3]);const k=a<b?a+'|'+b:b+'|'+a;const e=edges.get(k)??[];e.push({triangle:i,forward:a<b,a:t.points[j],b:t.points[(j+1)%3],opposite:t.points[(j+2)%3]});edges.set(k,e);}}
 let boundary=0,nonmanifold=0,inconsistent=0;const folds=[];
 for(const rows of edges.values()){if(rows.length===1){boundary++;continue;}if(rows.length!==2){nonmanifold++;continue;}const[a,b]=rows;if(a.forward===b.forward)inconsistent++;const ta=p.triangles[a.triangle],tb=p.triangles[b.triangle],na=normals[a.triangle],nb=normals[b.triangle];const angle=Math.acos(THREE.MathUtils.clamp(na.dot(nb),-1,1))*180/Math.PI;const off=na.dot(new THREE.Vector3(...b.opposite).sub(ta.triangle.a));const len=new THREE.Vector3(...a.a).distanceTo(new THREE.Vector3(...a.b));if(off>.008&&angle>4&&len>.2&&Math.min(ta.area,tb.area)>.009)folds.push({triangles:[a.triangle,b.triangle],angleDeg:angle,deviationM:off,edgeLengthM:len,normalY:[na.y,nb.y],areaM2:ta.area+tb.area,edge:[a.a,a.b],corners:[...ta.points,b.opposite]});}
 const closed=boundary===0&&nonmanifold===0&&inconsistent===0;
 return{boundaryEdges:boundary,nonmanifoldEdges:nonmanifold,inconsistentEdges:inconsistent,closedCoherent:closed,negativeClosedVolume:closed&&p.volume<-.0001,concaveFolds:folds.sort((a,b)=>b.deviationM-a.deviationM)};
}
function intersections(p){
 return {status:'all-triangles-screened-for-proper-crossing',hits:properSurfaceCrossings(p).map(hit=>({
   ...hit,corners:hit.triangles.map(i=>p.triangles[i].points),kind:'proper-face-crossing',
 }))};
}
function exposedAt(p,triIndex,parts){
 const t=p.triangles[triIndex],n=t.triangle.getNormal(new THREE.Vector3()),c=t.triangle.getMidpoint(new THREE.Vector3());
 const owner=p.bucket.startsWith('turret')?'turret':'hull';
 return[1,-1].map(sign=>{const outward=n.clone().multiplyScalar(sign),origin=c.clone().addScaledVector(outward,20),ray=new THREE.Ray(origin,outward.negate()),hit=new THREE.Vector3();let nearest=20.002,block=null;for(const q of parts){if((q.bucket.startsWith('turret')?'turret':'hull')!==owner)continue;if(!ray.intersectsBox(q.bounds))continue;for(let j=0;j<q.triangles.length;j++){if(q===p&&j===triIndex)continue;const r=q.triangles[j];if(!ray.intersectsBox(r.bounds))continue;if(ray.intersectTriangle(r.triangle.a,r.triangle.b,r.triangle.c,false,hit)){const d=origin.distanceTo(hit);if(d<nearest){nearest=d;block={part:q.ordinal,triangle:j};}}}}return{normalSign:sign,clearToFace:nearest>=19.998,blockingDistanceM:20-nearest,block};});
}
const report={head,sourceBefore,sourceAfterImports:sourceFingerprint(),scope:ids,qualities,excluded:ALL_TANK_IDS.filter(id=>!ids.includes(id)),rows:[],errors:[],status:'running',limitations:['Candidate triage only; no native visual acceptance.','Part census captures additions before later P.clear/replacement; each part now carries independent final drawable-buffer correspondence in its canonical owner frame. Unmapped captures require source adjudication and are never automatically discarded.','Closed negative signed volume nominates reversed or self-crossed stock; source, crossing and exposure adjudication remain required.','Mirror sample discrepancy is nearest-surface distance on equal reflected boundary sets; not a fidelity gate.','Part source filtering may include legacy equipment or untagged ERA; source review remains required.','All emitted triangles are screened for strict noncoplanar crossings; shared-vertex and coplanar contact/overlap require separate topology or source review.','Historical exposureWitness uses all captured same-owner stock, possibly including removed donors. nativePrimaryOnlyExposureWitness includes only fully mapped same-owner stock; equipment, fills and opposite-owner stock may still cover it.', 'Native correspondence is winding-aware and count-aware at 10 micrometres and uses drawable ranges/materials/transforms. Equal duplicate captured geometry cannot be assigned unique original-object identity from buffers alone.', 'Unsupported native mesh representations make correspondence incomplete; raw source witnesses remain retained.']};
fs.mkdirSync(path.dirname(out),{recursive:true});const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');save();
for(const id of ids)for(const quality of qualities){
 let tank;try{
 const collected=[];let ordinal=0;
 tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,batchStatic:false,partCensus(bucket,g,source){if(source!=='add'||!['hull','turret','hullExternalArmor','turretExternalArmor'].includes(bucket))return;const site=(new Error().stack??'').split('\n').filter(s=>s.includes('/src/vehicles/')&&!s.includes('/tankFactoryCore.ts:6917')).slice(0,5).map(s=>s.trim().replaceAll(root+'/',''));collected.push({g,bucket,ordinal:ordinal++,site});}});
 const nativeStock=nativeStructuralStock(tank.root,['hull','turret','hullExternalArmor','turretExternalArmor']);
 const parts=[];let small=0,era=0;for(const c of collected){if(Array.isArray(c.g.userData.eraHitFaceVertexStarts)){era++;continue;}const p=shellPart(c.g,{bucket:c.bucket,ordinal:c.ordinal,site:c.site,geometryType:c.g.type});if(Math.max(p.size.x,p.size.y,p.size.z)<.75||p.area<.35){small++;continue;}p.nativeMapping=mapCapturedStock(p,nativeStock.buckets.get(p.bucket));parts.push(p);}
 const fullyMappedParts=parts.filter(p=>p.nativeMapping.status==='all-native-triangles');
 const primaries=[];for(const p of parts){const top=topology(p),warp=slabWarps(p),cross=intersections(p);const r={part:p.ordinal,bucket:p.bucket,site:p.site,geometryType:p.geometryType,triangles:p.triangles.length,vertices:p.vertices.length,bounds:{min:p.bounds.min.toArray(),max:p.bounds.max.toArray()},areaM2:p.area,signedVolumeM3:p.volume,nativeMapping:p.nativeMapping,...top,warps:warp,intersections:cross};if(top.negativeClosedVolume||cross.hits.length||top.concaveFolds.length){const ti=cross.hits[0]?.triangles[0]??top.concaveFolds[0]?.triangles[0]??0;r.exposureWitness={triangle:ti,views:exposedAt(p,ti,parts)};if(p.nativeMapping.status==='all-native-triangles')r.nativePrimaryOnlyExposureWitness={triangle:ti,views:exposedAt(p,ti,fullyMappedParts)};}primaries.push(r);}
 const mirrored=[];const bySignature=new Map(parts.map(p=>[p.bucket+':'+p.signature,p]));const seen=new Set();let unmatched=0;for(const p of parts){if(seen.has(p.ordinal))continue;const q=bySignature.get(p.bucket+':'+p.mirrorSignature);if(!q){unmatched++;continue;}seen.add(p.ordinal);seen.add(q.ordinal);let m=mirrorDistance(p,q);if(p!==q){const b=mirrorDistance(q,p);if(b.maxM>m.maxM)m=b;}if(m.maxM>.005)mirrored.push({parts:[p.ordinal,q.ordinal],bucket:p.bucket,site:p.site,...m});}
 const definite=primaries.filter(p=>p.negativeClosedVolume||p.intersections.hits.length);
 report.rows.push({id,name:getSpec(id)?.name,quality,capturedStructuralParts:collected.length,excludedSmall:small,excludedTaggedEra:era,primaryParts:parts.length,nativeStockMapping:{capturedPrimaryParts:parts.length,fullyMappedCapturedParts:fullyMappedParts.length,partialMatches:parts.filter(p=>p.nativeMapping.status==='partial-native-match').map(p=>p.ordinal),noMatches:parts.filter(p=>p.nativeMapping.status==='no-native-match').map(p=>p.ordinal),nativeMeshes:nativeStock.meshes,unsupported:nativeStock.unsupported},unmatchedParts:unmatched,disposition:definite.length?'SOURCE-ADJUDICATION-REQUIRED: topology/crossing candidate':mirrored.length||primaries.some(p=>p.warps.length||p.concaveFolds.length)?'SOURCE-ADJUDICATION-REQUIRED: warped or asymmetric surface':'NO-SCREENED-DEFECT; NATIVE-REVIEW-NOT-RUN',mirrorCandidates:mirrored.sort((a,b)=>b.maxM-a.maxM),parts:primaries});
 save();console.log(id,quality,'parts',parts.length,'negative',primaries.filter(p=>p.negativeClosedVolume).length,'cross',primaries.filter(p=>p.intersections.hits.length).length,'folds',primaries.filter(p=>p.concaveFolds.length).length,'mirror',mirrored.length);
 }catch(error){report.errors.push({id,quality,error:String(error.stack??error)});save();console.error(id,quality,error);}finally{tank?.dispose();}
}
report.sourceAfter=sourceFingerprint();report.headAfter=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.sourceStable=report.head===report.headAfter&&report.sourceBefore===report.sourceAfter&&report.sourceBefore===report.sourceAfterImports;report.status=report.errors.length||!report.sourceStable?'incomplete':'census-complete; source and native visual adjudication pending';
report.completePlayableScope=scope.completePlayableScope;
save();if(report.errors.length||!report.sourceStable)process.exitCode=1;
