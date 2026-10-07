import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { minimapYawForHeading } from './minimapOrientation.ts';
import { BattleKillLedger } from '../game/battleEventStats.ts';

// Exercise the production HUD's retained contacts and event listeners without
// constructing the rest of the DOM/WebGL presentation.
const source = await readFile(new URL('./hud.ts', import.meta.url), 'utf8');
const spotById = new Map();
const functions = source.slice(source.indexOf('  function spotMemoryFor('), source.indexOf('  function isSpotted('));
const player = { id:'player', isPlayer:true, state:{pos:{x:0,y:0,z:0},yaw:0} };
// Spotting and blips read the player's team (Infected converts players); this player keeps the default side.
const update = new Function('spotById', 'SPOT_RANGE_M', 'SPOT_PERSIST_S', 'hasLOS', 'playerRef',
  stripTypeScriptTypes(functions) + '\nreturn updateSpotting;')(spotById, 500, 5, () => true, player);
const enemy = { id:'enemy', team:'enemy', modeActive:true, state:{pos:{x:100,y:0,z:30},yaw:0.7}, combat:{destroyed:false} };
let seen = true;
const frame = { player, tanks:[player,enemy], timeS:10, spotting:{isSpotted:()=>seen} };
const tick = () => { frame.timeS += 1; update(frame); };
const ghosts=[], live=[];
const blipSource = source.slice(source.indexOf('  function pushTankMinimapBlip('), source.indexOf('  function collectMinimapTankBlips('));
const drawBlip = new Function('spotById','worldToMap','pushLiveBlip','drawGhostMarker','mmCtx','PEN_GREEN','PEN_RED','playerRef',
  stripTypeScriptTypes(blipSource)+'\nreturn pushTankMinimapBlip;')(
  spotById,(x,z)=>[x,z],(...args)=>live.push(args),(...args)=>ghosts.push(args),{},'green','red',player);

tick();
assert.equal(spotById.get(enemy.id).vis,true);
drawBlip(enemy,enemy.state);
assert.equal(live.length,1);
seen=false; enemy.state.pos.x=250; enemy.state.yaw=2;
tick();
const contact=spotById.get(enemy.id);
assert.deepEqual([contact.vis,contact.lastX,contact.lastZ,contact.lastYaw],[false,100,30,.7],
  'lost contact never learns hidden position or heading');
drawBlip(enemy,enemy.state);
assert.deepEqual(ghosts[0].slice(1),[100,30,.7], 'hollow contact uses only last observed position and heading');

for(let life=0;life<8;life++){
  enemy.combat.destroyed=true; tick();
  assert.equal(spotById.has(enemy.id),false,'death clears contact instead of remembering wreck as a live enemy');
  enemy.combat.destroyed=false;enemy.state.pos.x=-300+life;tick();
  assert.deepEqual([spotById.get(enemy.id).vis,spotById.get(enemy.id).ever],[false,false],
    'unseen respawn cannot leave a ghost at the wreck or reveal the new spawn');
  const count=ghosts.length+live.length;drawBlip(enemy,enemy.state);
  assert.equal(ghosts.length+live.length,count,'unseen new life draws no minimap contact');
  seen=true;tick();drawBlip(enemy,enemy.state);
  assert.equal(live.at(-1)[0],enemy.state.pos.x,'respotted tank appears at its new observed position');
  seen=false;
}
enemy.modeActive=false;tick();assert.equal(spotById.has(enemy.id),false,'Horde reserves clear last wave contacts');
enemy.modeActive=true;tick();assert.equal(spotById.get(enemy.id).ever,false);

// Death and respawn events must invalidate enemy contacts even when the render
// loop never receives the intermediate destroyed frame (e.g. snapshot handoff).
const listeners={};
for(const event of ['tank:destroyed','mode:respawn']){
  const start=source.indexOf(`  on('${event}',`);
  const end=source.indexOf('\n  });',start)+6;
  assert.ok(start>=0&&end>start);
  // main's 8c1ed73c9: the handlers keep the battle kill ledger and the drone-target set
  new Function('on','spotById','playerId','pushKill','reviveCountdown','showAlert','t','killLedger','teamById','lethalDroneTargets',
    stripTypeScriptTypes(source.slice(start,end)))(
    (name,fn)=>{listeners[name]=fn;},spotById,player.id,()=>{},
    {onDestroyed(){},hide(){}},()=>{},()=>'',new BattleKillLedger(),new Map(),new Set()
  );
  seen=true;tick();assert.equal(spotById.get(enemy.id).ever,true);
  listeners[event]({id:enemy.id});
  assert.equal(spotById.has(enemy.id),false,`${event}: clear enemies before the player-only alert guard`);
  seen=false;tick();assert.equal(spotById.get(enemy.id).ever,false);
}

// Fallback screenshots/test frames use linger, but last-known coordinates must
// still stop following the tank as soon as the range/LOS observation ends.
frame.spotting=null;enemy.state.pos.x=20;tick();
enemy.state.pos.x=900;tick();
assert.equal(spotById.get(enemy.id).vis,true);
assert.equal(spotById.get(enemy.id).lastX,20);
frame.timeS+=5;tick();assert.equal(spotById.get(enemy.id).vis,false);
assert.equal(spotById.get(enemy.id).lastX,20);

// The last-known symbol is an unfilled directional outline, not a generic diamond.
const ops=[];
const ctx=new Proxy({}, {get:(target,key)=>target[key]??((...args)=>ops.push([key,...args])),set:(target,key,val)=>(target[key]=val,true)});
const painter=source.slice(source.indexOf('  function drawGhostMarker('),source.indexOf('  function drawMinimapBases('));
new Function('minimapYawForHeading',stripTypeScriptTypes(painter)+'\nreturn drawGhostMarker;')(minimapYawForHeading)(ctx,40,50,.7);
assert.deepEqual(ops.slice(0,3),[['save'],['translate',40,50],['rotate',minimapYawForHeading(.7)]]);
assert.equal(ops.some(([op])=>op==='fill'),false,'hollow contacts cannot be mistaken for filled live arrows');
assert.equal(ops.at(-1)[0],'restore');
console.log('minimapContacts: hidden pose, repeated respawns, skipped death frames, reserve waves and directional contacts passed');
