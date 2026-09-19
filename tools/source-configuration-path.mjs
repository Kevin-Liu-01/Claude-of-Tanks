/** QA-only canonical filename aliases; no runtime source loading. */
export function canonicalConfigurationPath(id){
  if(!/^[a-z0-9_]+$/.test(id))return null;
  const stem=id==='merkava4_barak'?'merkava4_barak_x':id;
  return `public/models/community-candidates/${stem}_source.glb`;
}
