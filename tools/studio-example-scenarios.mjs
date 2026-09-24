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
function camoForMap(map){
  const cfg=getMapConfig(map);
  const winter=cfg.props.snowCap===true||cfg.terrain.frozenMarshes===true;
  const arid=['desert','badlands','caldera','copper_mesa','oasis','saltwind'].includes(map);
  return winter?'winter':arid?'desert':'summer';
}
export const DUEL_SCENARIOS=MAP_IDS.map((map,index)=>{
  const [,alpha,bravo]=TANK_PAIRS[index%TANK_PAIRS.length];
  return {index:index+1,map,alpha,bravo,stage:stageForMap(map),variant:index%4,
    camo:camoForMap(map),seed:24001+index*137};
});

// The Docs battle-reel library (public/media/battle-reels-v3, listed in
// src/docs/battleReels.ts) is a pinned twenty-reel set rendered on 2026-08-19
// from the sixteen maps registered then plus four repeats (desert, winter,
// verdant, coastal) with the tank pairs above, `directDuel({variant: index})`
// and the seeds 24001 + 137 (index - 1). Its ids are `NN_alpha_vs_bravo_map`;
// `battleReels.selftest` pins them to this table.
export const BATTLE_REEL_MAPS=Object.freeze([
  'verdant','desert','winter','urban','coastal','autumn','steppe','railyard',
  'frontier','fjord','delta','badlands','monsoon','alpine','caldera','foundry',
  'desert','winter','verdant','coastal',
]);

// Round 54 (2026-09-24): the round-48 redesigns of Frosthollow and Tarkhan
// Steppe moved the enemy pads to the map edges, so the stage rule (two enemy
// spawns about 62 m apart) puts their reels on bare snowfield at the north
// wall and on the plateau behind the escarpment, where no redesigned landmark
// is in frame. These reels are staged on the new battlefields by hand. Both
// hulls start inside r - 15 of a frozen pond so every duel-track drive stays on
// the ice; `directDuel` keeps the lenses on the +p side of alpha→bravo for an
// even variant (reels 18) and on the -p side for an odd one (3, 7).
export const BATTLE_REEL_STAGES=Object.freeze({
  // Challenger 3 vs Leopard 2A7V: south across the neck between the c(54,150)
  // r36 and c(38,70) r40 ponds north of the Bystra crossing; the lenses on
  // the open east bank look west over the ice at the terrace village's east
  // edge and the ridge (the ponds 3–4 neck further south is wooded on both
  // banks — birch trunks and a pole line stood inside the wide style's
  // 52 m lateral excursion).
  3:{alpha:[56,132],bravo:[38,86]},
  // M1A2 TUSK vs T-90SM: east→west on the open grass south of the wadi
  // (z -160..-60, x 0..200 is open plain); the lenses on the south side look
  // north across the plain and the takyr wadi at the escarpment and its
  // kurgan line.
  7:{alpha:[150,-110],bravo:[88,-110]},
  // Merkava Mk 3D vs AMX-40: north–south across the neck between the
  // c(-16,-150) r38 and c(-14,-60) r30 ponds, east of the village crossroads;
  // the lenses on the east bank look west at the village street and the pass
  // road climbing to the saddle.
  18:{alpha:[-16,-126],bravo:[-14,-76]},
});

export function battleReelId(scenario){
  return `${String(scenario.index).padStart(2,'0')}_${scenario.alpha}_vs_${scenario.bravo}_${scenario.map}`;
}

export const BATTLE_REEL_SCENARIOS=BATTLE_REEL_MAPS.map((map,index)=>{
  const [,alpha,bravo]=TANK_PAIRS[index];
  const authored=BATTLE_REEL_STAGES[index+1];
  return {index:index+1,map,alpha,bravo,
    stage:authored?{alpha:[...authored.alpha],bravo:[...authored.bravo]}:stageForMap(map),
    authoredStage:!!authored,variant:index+1,camo:camoForMap(map),seed:24001+index*137};
});
