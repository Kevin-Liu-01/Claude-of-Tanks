import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCombatState,tickModuleRepairs,REPAIR_S} from '../sim/damage.ts';
import {TANK_SPECS} from '../vehicles/specs.ts';
import {createVehicleStatusReader,vehicleStatusCapacity} from './vehicleStatusPolicy.ts';
const combat=createCombatState(TANK_SPECS.m1a1_abrams_hc),read=createVehicleStatusReader();
assert.equal(read(combat).length,0);
assert.equal(read(combat,{inBush:true,spotted:false})[0].id,'conceal');
assert.equal(read(combat,{inBush:true,fired:true,camo:.1}).length,0);
assert.equal(read(combat,{inBush:true,spotted:true,camo:.8}).length,0);
const left=combat.modules.trackL,right=combat.modules.trackR;
left.state='red';left.hp=0;left.repairT=0;
assert.equal(read(combat)[0].id,'tracks');assert.equal(read(combat)[0].progress,0);
combat.equipMults={repair:1.25};tickModuleRepairs(combat,4);
assert.equal(read(combat)[0].progress,50,'uses real equipment-adjusted repair accumulation');
right.state='red';right.hp=0;right.repairT=REPAIR_S*.2;
assert.equal(read(combat)[0].progress,20,'both tracks share the slower remaining repair');
right.state='ok';tickModuleRepairs(combat,4);
assert.equal(read(combat)[0].tone,'warning');assert.equal(read(combat)[0].progress,null,'restored movement remains damaged');
left.state='ok';assert.equal(read(combat).length,0);
left.state='red';left.repairT=8;combat.modeModuleOnlyDamage=true;
assert.equal(read(combat)[0].progress,null,'Realistic has no automatic repair');
combat.modeModuleOnlyDamage=false;combat.moduleRepairProgressKnown=false;
assert.equal(read(combat)[0].progress,null,'snapshots without timers never invent progress');
combat.moduleRepairProgressKnown=true;combat.fire.burning=true;
combat.modules.engine.state='red';combat.modules.optics.state='yellow';combat.crew.driver=false;
const list=read(combat,{inBush:true});
assert.deepEqual(list.slice(0,3).map(x=>x.id),['fire','tracks','engine']);
assert.equal(list.at(-1).id,'conceal');assert.equal(list.find(x=>x.id==='crew').count,1);
assert.strictEqual(read(combat),list,'retained output buffer');
combat.destroyed=true;assert.equal(read(combat,{inBush:true}).length,0);
assert.equal(read(null).length,0);
for(const room of [104,112,150,160,240,500])for(const chip of [32,34,44]){
 const capacity=vehicleStatusCapacity(room,chip,4);assert.ok(capacity>=2&&capacity<=4);
 assert.ok(capacity*chip+(capacity-1)*4<=room,`${capacity} chips of ${chip} px fit ${room} px`);
}
// The room is what the strip may take, never the strip's own width (266): a touch strip hugs its chips, so its width is
// the count it already shows, and a capacity read from it held fire, tracks, engine and crew at two chips and a "+3".
{
 const chip=44,gap=4,active=4,hugging=(shown)=>shown?shown*chip+(shown-1)*gap:0;
 const settle=(measure)=>{
  let capacity=vehicleStatusCapacity(measure(0),chip,gap);
  for(let pass=0;pass<8;pass++){
   const shown=Math.min(capacity,active),next=vehicleStatusCapacity(measure(shown),chip,gap);
   if(next===capacity)return shown;
   capacity=next;
  }
  return -1;
 };
 assert.equal(settle(hugging),2,'measured on the hugging strip itself, capacity never leaves its floor (the 266 bug)');
 assert.equal(settle(()=>200),4,'measured on the room, every status that fits shows');
 assert.equal(settle(()=>142),3,'and a narrower room fits fewer');
 const source=readFileSync(new URL('./vehicleStatus.ts',import.meta.url),'utf8'),hud=readFileSync(new URL('./hud.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/vehicleStatusCapacity\(root\./,'the strip never sizes its capacity from its own box');
 assert.match(source,/vehicleStatusCapacity\(room\.clientWidth-/,'the strip sizes its capacity from its room');
 assert.match(hud,/vehicleStatus\.mount\(panel\.root\)/,'the damage panel is the strip\'s room');
 assert.match(hud,/\.cot-touch-layout \.cot-vehicle-status\{left:auto;right:0;width:auto;\s*--status-room-inset:8px;max-width:calc\(100% - var\(--status-room-inset\)\)\}/,
  'the touch strip\'s room keeps the dock\'s margin on the joystick\'s side, in CSS and in the fit alike');
}
console.log('vehicleStatusPolicy: priority, real repair progress, recovery, concealment, lifecycle, caps and the room PASS');
