import {tankSeedId} from '../src/vehicles/tankIdAliases.ts';

/** QA-only canonical filename aliases; no runtime source loading. A vehicle renamed through the tank id alias layer
 * keeps its study's source file name (its schema-1 id, SSOT 2.19). */
export function canonicalConfigurationPath(id){
  if(!/^[a-z0-9_]+$/.test(id))return null;
  const stem=id==='merkava4_barak'?'merkava4_barak_x':tankSeedId(id);
  return `public/models/community-candidates/${stem}_source.glb`;
}
