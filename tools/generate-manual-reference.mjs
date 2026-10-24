// Offline source projection: public manual must never import fleet builders. The tanks chapter's fleet reference
// (src/docs/reference.ts) reads every production vehicle's base values from it; maps and mode rules are the battlefields
// and modes chapters' own (src/docs/chapters), so they are not projected here.
import {readFileSync,writeFileSync} from 'node:fs';
import '../src/vehicles/tankFactory.ts';
import {PRODUCTION_TANK_IDS,TANK_SPECS} from '../src/vehicles/specs.ts';
import {tankTier} from '../src/vehicles/tier.ts';
import {viewRangeOf} from '../src/sim/spotting.ts';
import {auxiliaryCapabilities} from '../src/vehicles/auxiliaryInventory.ts';
const data={
  vehicles:PRODUCTION_TANK_IDS.map(id=>{const s=TANK_SPECS[id],a=auxiliaryCapabilities(s);return {
    id,name:s.name,nation:s.nation,role:s.role,tier:tankTier(id),hp:s.hp,
    speed:s.topSpeedKmh,reverse:s.reverseSpeedKmh,hull:s.hullTraverseDegS,turret:s.turretTraverseDegS,
    dispersion:s.gun.baseAccuracy,reload:s.gun.reloadS,aim:s.gun.aimTimeS,view:viewRangeOf(s),
    smoke:a?.smoke.length??0,lights:!!a?.lights,roofGun:!!a?.guns.length,
    missile:s.gun.shells.some(shell=>shell.guided),suspension:!!s.hydropneumaticAim,
  };}),
};
const path=new URL('../src/docs/reference.generated.json',import.meta.url);
const output=JSON.stringify(data,null,2)+'\n';
if(process.argv.includes('--check')){
 if(readFileSync(path,'utf8')!==output)throw new Error('Manual reference is stale: run node tools/generate-manual-reference.mjs');
}else writeFileSync(path,output);
console.log(`Manual reference: ${data.vehicles.length} vehicles`);
