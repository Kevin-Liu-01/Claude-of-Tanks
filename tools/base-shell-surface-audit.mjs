#!/usr/bin/env node
// Authored primary stock only. Decorations, guns, fills and combat overlays
// are not inputs. Asymmetry is a review candidate, never automatically erased.
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {shellPart,auditShellParts} from './base-shell-audit-math.mjs';
const args=process.argv.slice(2),opt=(n,d)=>args.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3)??d;
const root=resolve(opt('root','.')),out=resolve(opt('out','.qa-dev/base-shell-warp-audit/audit.json'));
// CPU-only source census; no browser, renderer, or GPU readback. Run one
// low-priority process. Native visual verification owns the capture FIFO.
{
 await import(pathToFileURL(resolve(root,'tools/tank-surface-collect.mjs')));
 const {createTank}=await import(pathToFileURL(resolve(root,'src/vehicles/tankFactory.ts')));
 const {ALL_TANK_IDS}=await import(pathToFileURL(resolve(root,'src/vehicles/specs.ts')));
 const ids=opt('ids','')?opt('ids','').split(','):ALL_TANK_IDS.filter(id=>!id.endsWith('_x'));
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
 const head=git('rev-parse','HEAD');
 const fingerprint=()=>{
   const hash=createHash('sha256');
   for(const p of readdirSync(resolve(root,'src'),{recursive:true}).filter(p=>/\.(ts|js|mjs)$/.test(p)).sort()){
     hash.update(p);hash.update(readFileSync(resolve(root,'src',p)));
   }
   return hash.digest('hex');
 };
 const sourceHash=fingerprint();
 const qualities=opt('quality','high')==='both'?['high','low']:[opt('quality','high')];
 if(qualities.some(q=>!['high','low'].includes(q)))throw new Error('quality must be high, low or both');
 if(ids.some(id=>!ALL_TANK_IDS.includes(id)))throw new Error('Unknown vehicle ID');
 const report={head,sourceHash,root,scope:ids,excluded:ALL_TANK_IDS.filter(id=>!ids.includes(id)),status:'running',rows:[],errors:[],
  auditHash:createHash('sha256').update(readFileSync(import.meta.filename)).update(readFileSync(new URL('./base-shell-audit-math.mjs',import.meta.url))).digest('hex'),
  limitations:['Primary stock filter: hull/turret/permanent external armor, span >= 0.75m and surface area >= 0.35m².','Unmatched boundary vertices may be intentional asymmetry; reported separately.','Hidden or covered surfaces require native visual review before repair.','Warps on intended curved casting are candidates, not automatic planar-face failures.']};
 mkdirSync(dirname(out),{recursive:true});
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n');save();
 for(const id of ids){for(const quality of qualities){
  try {
  const parts=[];let ordinal=0;
  const tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,
   partCensus(bucket,g,source){
    if(source!=='add'||!['hull','turret','hullExternalArmor','turretExternalArmor'].includes(bucket)||Array.isArray(g.userData.eraHitFaceVertexStarts))return;
    g.computeBoundingBox();const b=g.boundingBox;if(Math.max(b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z)<.75)return;
    const stack=new Error().stack??'';
    const site=stack.split('\n').filter(s=>(s.includes('/profiles/')||/\/vehicles\/modern[^/]*\.ts/.test(s))&&!s.includes('/kit.ts')).slice(0,3).map(s=>s.trim().replaceAll(root+'/',''));
    const part=shellPart(g,{bucket,ordinal:ordinal++,site});if(part.area>=.35)parts.push(part);
   }});
  const result=auditShellParts(parts);tank.dispose();
  report.rows.push({id,quality,...result});save();
  console.log(id,quality,'primary',result.primaryParts,'mirrored >5mm',result.mirroredPairs.filter(r=>r.maxM>.005).length,'warped slabs',result.warpedSlabs.length);
  }catch(error){report.errors.push({id,quality,error:String(error.stack??error)});save();console.error(id,quality,error);}
 }}
 report.status=report.errors.length?'incomplete':'complete';report.sourceStable=git('rev-parse','HEAD')===head&&fingerprint()===sourceHash;save();
 if(!report.sourceStable||report.errors.length)process.exitCode=1;
}
