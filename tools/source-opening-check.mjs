import {loadSource} from './source-x-oracle.mjs';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {ensureInteriorFills,hasInteriorFills} from '../src/vehicles/interiorFills.ts';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
import {sourceOpeningWitnesses} from './source-opening-witnesses.mjs';
import {sourceOpeningRayProbe} from './source-opening-rays.mjs';

/** Native loaded-fill geometry and the complete original source are measured
 * at the real browser raster coordinates, never nominal rounded labels. */
export async function measureSourceOpenings(id,scan,configuration,sourceReceipt){
 if(!['aft10_x','fv510_milan_x','merkava4_barak'].includes(id))return sourceOpeningsVerdict({id,scan});
 if(!sourceReceipt?.verified)return sourceOpeningsVerdict({id,scan,configuration,sourceReceipt});
 const {scene:source,digest}=await loadSource(configuration.source.path);
 if(digest!==configuration.source.sha256)throw new Error('Opening source changed during acquisition');
 await ensureInteriorFills([id]);
 if(!hasInteriorFills(id))throw new Error(`Missing native interior-fill record for ${id}`);
 const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality:'high',camoSeed:4242});
 const sourceMaterials=new Set();source.traverse(object=>{if(object.isMesh)for(const material of(Array.isArray(object.material)?object.material:[object.material]))sourceMaterials.add(material)});
 const setup=root=>{
  root.traverse(object=>{
   if(object.isLOD){object.autoUpdate=false;object.levels.forEach((level,i)=>level.object.visible=i===0);}
  });root.updateMatrixWorld(true);
 };
 setup(source);setup(tank.root);
 const sourceProbe=sourceOpeningRayProbe(source),nativeProbe=sourceOpeningRayProbe(tank.root);
 const cast=(root,...args)=>(root===source?sourceProbe:nativeProbe).cast(...args);
 try{
  const samples=(scan.samples??[]).map(sample=>({...sample,
   sourceAir:!cast(source,[sample.x,6,sample.z],[0,-1,0]),nativeAir:!cast(tank.root,[sample.x,6,sample.z],[0,-1,0]),
  }));
  const guards=sourceOpeningWitnesses(id).map(witness=>{
   const measurements=[['source',source],['native',tank.root]].map(([owner,root])=>{
    const hit=cast(root,witness.origin,witness.direction,witness.far),point=hit?.point.toArray()??null;
    const passed=witness.expect==='air'?!hit:Boolean(point&&Math.abs(point[witness.axis]-witness.value)<=witness.tolerance);
    return {owner,passed,point,mesh:hit?.object.name??null};
   });return {key:witness.key,passed:measurements.every(m=>m.passed),measurements};
  });
  return {...sourceOpeningsVerdict({id,scan,configuration,sourceReceipt,samples,guards}),samples,guards};
 }finally{
  sourceProbe.dispose();nativeProbe.dispose();
  tank.dispose();source.traverse(o=>{if(o.isMesh)o.geometry.dispose()});
  for(const material of sourceMaterials){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}
 }
}
