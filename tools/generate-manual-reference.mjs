// Offline source projection: public manual must never import fleet builders.
import {readFileSync,writeFileSync} from 'node:fs';
import '../src/vehicles/tankFactory.ts';
import {PRODUCTION_TANK_IDS,TANK_SPECS} from '../src/vehicles/specs.ts';
import {tankTier} from '../src/vehicles/tier.ts';
import {viewRangeOf} from '../src/sim/spotting.ts';
import {auxiliaryCapabilities} from '../src/vehicles/auxiliaryInventory.ts';
import {MAP_IDS,getMapName,RANDOM_BATTLE_MAP_IDS} from '../src/world/maps/mapIds.ts';
import {GAME_MODE_IDS} from '../src/sim/matchModes.ts';
import {matchRulesetFor,RULESET_SCORE_TARGETS} from '../src/sim/matchRuleset.ts';
const data={
  vehicles:PRODUCTION_TANK_IDS.map(id=>{const s=TANK_SPECS[id],a=auxiliaryCapabilities(s);return {
    id,name:s.name,nation:s.nation,role:s.role,tier:tankTier(id),hp:s.hp,
    speed:s.topSpeedKmh,reverse:s.reverseSpeedKmh,hull:s.hullTraverseDegS,turret:s.turretTraverseDegS,
    dispersion:s.gun.baseAccuracy,reload:s.gun.reloadS,aim:s.gun.aimTimeS,view:viewRangeOf(s),
    smoke:a?.smoke.length??0,lights:!!a?.lights,roofGun:!!a?.guns.length,
    missile:s.gun.shells.some(shell=>shell.guided),suspension:!!s.hydropneumaticAim,
  };}),
  maps:MAP_IDS.map(id=>({id,name:getMapName(id),random:RANDOM_BATTLE_MAP_IDS.includes(id)})),
  modes:GAME_MODE_IDS.map(id=>{const r=matchRulesetFor(id);return {
    id,clock:r.timeLimitS,respawn:r.respawnS,score:RULESET_SCORE_TARGETS[id]??null,
    speed:r.speedMultiplier,hp:r.hpScale,reload:r.reloadScale,ammo:r.ammo,
    equipment:r.equipmentSlots,consumables:r.consumables,jump:r.jumpMps,
  };}),
};
const path=new URL('../src/docs/reference.generated.json',import.meta.url);
const output=JSON.stringify(data,null,2)+'\n';
if(process.argv.includes('--check')){
 if(readFileSync(path,'utf8')!==output)throw new Error('Manual reference is stale: run node tools/generate-manual-reference.mjs');
}else writeFileSync(path,output);
console.log(`Manual reference: ${data.vehicles.length} vehicles, ${data.maps.length} maps, ${data.modes.length} modes`);
