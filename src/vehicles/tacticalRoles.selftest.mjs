import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import './fleetFactory.ts';
import { ALL_TANK_IDS, TANK_SPECS } from './specs.ts';
import { VEHICLE_ROLE_PROFILES } from './roleProfiles.ts';
import { viewRangeOf, baseCamoOf, spotRangeM, MAX_SPOT_RANGE_M, createSpottingSystem } from '../sim/spotting.ts';
import { movementDispersionFactor } from '../sim/movementDispersion.ts';
import { auditFleetBalance } from './balanceAudit.ts';

assert.deepEqual(Object.keys(VEHICLE_ROLE_PROFILES).sort(), [...ALL_TANK_IDS].sort(), 'every vehicle has an explicit role profile');
assert.equal(ALL_TANK_IDS.length, 220);
const ranges = ALL_TANK_IDS.map(id => viewRangeOf(TANK_SPECS[id]));
assert.equal(viewRangeOf(TANK_SPECS.m551a1_tts), Math.max(...ranges));
assert.equal(viewRangeOf(TANK_SPECS.m551_sheridan), 480);
assert.ok(ranges.filter(v => v > 480).length === 1, 'only the upgraded Sheridan scouts farther');
assert.ok(new Set(ranges).size >= 20, 'fleet scouting is differentiated');
assert.ok(viewRangeOf(TANK_SPECS.m3a3_bradley) > viewRangeOf(TANK_SPECS.m1a3));
for (const id of ALL_TANK_IDS) {
  const s = TANK_SPECS[id], p = VEHICLE_ROLE_PROFILES[id];
  assert.ok(p.viewM >= 300 && p.viewM <= 500, id);
  assert.ok(p.moving > 0 && p.moving <= p.still && p.still < .5, id);
  assert.equal(baseCamoOf(s, true), p.moving);
  assert.equal(baseCamoOf(s, false), p.still);
  assert.ok(s.hullTraverseDegS > 0 && s.turretTraverseDegS >= 0);
}
const scout = TANK_SPECS.m551_sheridan, assault = TANK_SPECS.t90m;
assert.equal(baseCamoOf(scout, true), baseCamoOf(scout, false), 'scout retains concealment while relocating');
assert.ok(baseCamoOf(assault, true) < baseCamoOf(assault, false));
assert.ok(spotRangeM(viewRangeOf(scout), .3) > spotRangeM(viewRangeOf(assault), .3), 'same concealed target is detected earlier by a scout');
assert.equal(spotRangeM(900, 0), MAX_SPOT_RANGE_M, 'equipment and scouting do not bypass the hard sight cap');
assert.equal(movementDispersionFactor(.05,.05,.05,0,0,0,.8), 1);
const stock = movementDispersionFactor(.05,.05,.05,30,20,20);
const equipped = movementDispersionFactor(.05,.05,.05,30,20,20,.8);
assert.ok(equipped > 1 && equipped < stock);
assert.ok(Math.abs((equipped - 1) / (stock - 1) - .8) < 1e-10, 'stabilizer reduces excess dispersion, not stationary accuracy');

// The same donor penetration must not gain another median vote simply because
// its clone has a different aim time. Include a known outlier as a negative control.
const rows = {};
for (const [id,pen] of [['a',100],['b',200],['c',300],['d',400],['bad',2000]]) {
  const s=structuredClone(TANK_SPECS.m1a2); s.id=id; s.gun.shells[0].pen100Mm=pen; rows[id]=s;
}
rows.copy=structuredClone(rows.a); rows.copy.id='copy'; rows.copy.balancePeerOf='a';
const penetration = () => auditFleetBalance(Object.keys(rows),rows,()=>10).filter(x=>x.metric==='penetration');
const baseline=penetration(); assert.ok(baseline.some(x=>x.id==='bad'&&x.direction==='high'));
rows.copy.gun.aimTimeS *= 1.5;
assert.deepEqual(penetration(),baseline,'unrelated clone tuning cannot move penetration median');

// Production browser/dedicated facades can load in either order. Re-running a
// donor synchronization after final assembly must never reset approved values.
for(const order of [['fleetFactory','tankFactory'],['tankFactory','fleetFactory']]) {
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    await import('./src/vehicles/${order[0]}.ts');
    const {TANK_SPECS,ALL_TANK_IDS}=await import('./src/vehicles/specs.ts');
    const stats=()=>JSON.stringify(ALL_TANK_IDS.map(id=>{const s=TANK_SPECS[id];return [id,s.hp,s.hullTraverseDegS,s.turretTraverseDegS,s.gun]}));
    const before=stats(); await import('./src/vehicles/${order[1]}.ts');
    for(const [file,fn] of [['sourceXFleetSpecs','synchronizeSourceXCombatMetadata'],['sourceXSecondWaveSpecs','synchronizeSecondWaveXCombatMetadata'],['suppliedSourceFleetSpecs','synchronizeSuppliedSourceCombatMetadata'],['ifvReplicaSpecs','synchronizeIfvReplicaCombatMetadata'],['xk2Specs','synchronizeXk2CombatMetadata']]) (await import('./src/vehicles/'+file+'.ts'))[fn]();
    assert.equal(stats(),before,'facade order and synchronization preserve fleet balance');
  `],{cwd:process.cwd(),stdio:'pipe',timeout:120000});
}
console.log('tacticalRoles: 220 profiles, scouting/handling tradeoffs, equipment law, independent audit medians and facade parity passed');

// Same battlefield witness, rather than only a range formula comparison.
const entity=(id,spec,z)=>({id,team:id==='target'?'enemy':'player',spec,state:{pos:{x:0,y:0,z},speed:0},combat:{destroyed:false}});
const scoutEntity=entity('scout',TANK_SPECS.m551_sheridan,0);
const assaultEntity=entity('assault',TANK_SPECS.t90m,0);
const targetEntity=entity('target',TANK_SPECS.m1a2,360);
const spotting=createSpottingSystem({getTanks:()=>[scoutEntity,assaultEntity,targetEntity],rng:()=>.5});
assert.equal(spotting.testSpot(scoutEntity,targetEntity,1),true,'scout detects concealed vehicle at 360m');
assert.equal(spotting.testSpot(assaultEntity,targetEntity,1),false,'assault optics cannot resolve same target');
scoutEntity.combat.modules={optics:{state:'yellow'}};
assert.equal(spotting.testSpot(scoutEntity,targetEntity,1),false,'damaged optics removes scouting advantage');
