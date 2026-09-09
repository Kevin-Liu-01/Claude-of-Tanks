import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { battleSideStack } from './battleHudLayout.ts';

for(const height of [0,30,62,100,150,200,320,600])for(const chat of [false,true])for(const count of [0,1,3,8]){
  const layout=battleSideStack(height,chat,count);
  assert.ok(layout.toastRows<=3&&layout.toastRows<=count);
  assert.ok(layout.toastHeight<=height);
  assert.ok(layout.chatOffset+layout.chatHeight<=height);
  if(chat&&height>=62)assert.ok(layout.chatHeight>=54,'the composer retains room below the alerts');
}
assert.equal(battleSideStack(100,true,3).toastRows,0,'tight chat lanes collapse transient alerts, not the input');
assert.equal(battleSideStack(320,false,3).toastRows,3);
const layout=readFileSync(new URL('./battleHudLayout.ts',import.meta.url),'utf8');
assert.match(layout,/new ResizeObserver\(schedule\)/,'map zoom and roster size changes relayout the lanes');
assert.match(layout,/visualViewport\?\.addEventListener\('resize'/,'virtual keyboard/visual viewport changes reflow');
const hud=readFileSync(new URL('./hud.ts',import.meta.url),'utf8');
assert.match(hud,/installBattleHudLayout\(root\)/);
const shot=readFileSync(new URL('./shotInfo.ts',import.meta.url),'utf8');
assert.doesNotMatch(shot,/t\('shotInfo\.(yourShots|yourShotsLast|damageReceived)'/,'log headings use existing GT catalog entries');
console.log('battleHudLayout.selftest: bounded lanes, responsive ownership and localized headers passed');
