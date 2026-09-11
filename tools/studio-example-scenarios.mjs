import {MAP_IDS,getMapConfig} from '../src/world/maps/index.ts';

const TANK_PAIRS = [
  ['desert', 'm1a2_sepv3', 't90m'],
  ['winter', 'strv122', 'k2'],
  ['desert', 'challenger_3', 'leo2a7v'],
  ['verdant', 'type10b', 'ztz99a2'],
  ['desert', 'leclerc_xlr', 't14'],
  ['winter', 'kf51b', 'abramsx'],
  ['desert', 'm1a2_tusk', 't90sm'],
  ['verdant', 'ua_t84_oplot_m', 'pt91_twardy'],
  ['desert', 'pl01_105', 'k2b'],
  ['winter', 'merkava4b', 'ariete_c2'],
  ['desert', 'm1a2_sepv2', 'type99a'],
  ['verdant', 'leo2_revolution', 't72b3m'],
  ['desert', 'challenger2', 'leclerc'],
  ['winter', 'type10', 'k1a1'],
  ['desert', 'm1a1ha', 't80u'],
  ['verdant', 'ua_m1a1', 'ua_t64bv'],
  ['desert', 'leo2a6m', 't90ms'],
  ['winter', 'merkava3d', 'amx40'],
  ['desert', 'type90a', 'pt91m'],
  ['verdant', 'm1a2', 'ua_t80u_kursk'],
];

export function stageForMap(mapId) {
  const points=getMapConfig(mapId).spawns?.enemies || [];
  let best=null;
  for(let left=0;left<points.length;left++)for(let right=left+1;right<points.length;right++){
    const distance=Math.hypot(points[right].x-points[left].x,points[right].z-points[left].z);
    if(!Number.isFinite(distance)||distance<20)continue;
    const score=Math.abs(distance-62);
    if(!best||score<best.score)best={left,right,score};
  }
  if(!best)throw new Error(`${mapId}: no two-point cinematic stage`);
  return {alpha:[points[best.left].x,points[best.left].z],bravo:[points[best.right].x,points[best.right].z]};
}
export const DUEL_SCENARIOS=MAP_IDS.map((map,index)=>{
  const [,alpha,bravo]=TANK_PAIRS[index%TANK_PAIRS.length];
  const cfg=getMapConfig(map);
  const winter=cfg.props.snowCap===true||cfg.terrain.frozenMarshes===true;
  const arid=['desert','badlands','caldera','copper_mesa','oasis','saltwind'].includes(map);
  return {index:index+1,map,alpha,bravo,stage:stageForMap(map),variant:index%4,
    camo:winter?'winter':arid?'desert':'summer',seed:24001+index*137};
});
