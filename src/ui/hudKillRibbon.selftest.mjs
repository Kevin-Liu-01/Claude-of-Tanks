// hudKillRibbon.selftest.mjs — (brand-ui 242; notices-polish-277) the kill card over the recording DOM: the victim's
// callsign, vehicle and side, the cause chip where the cause says more than a shot, the streak's multiplier from the second
// kill in its window, the hold, and a clean slate between battles. (Kevin 2026-11-25: "remove the bottom 2 lines in this":
// the round, its range and the streak's earnings are not on the card.)
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { createKillRibbon } from './hudKillRibbon.ts';
import { t } from './i18n.ts';

let clock = 1000;
Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
const timers = [];
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback) => { timers.push(callback); return timers.length; };
globalThis.clearTimeout = () => {};
try {
  const host = document.createElement('div');
  const ribbon = createKillRibbon(host);
  const part = (name) => created.find((node) => node.classes.has(name) && node !== ribbon.root);
  const shot = { cause: 'shot', icon: 'skull', label: t('hud.kill.shot') };
  const rack = { cause: 'ammorack', icon: 'ammoRack', label: t('hud.kill.ammorack') };

  ribbon.kill({ id: 'e1', callsign: 'Orlov', vehicle: 'T-72B3', flag: '', specId: 'm1a3' }, rack);
  assert.equal(ribbon.root.classes.has('on'), true, 'the player\'s kill takes the card');
  assert.equal(part('w').textContent, t('hud.kill.shot'));
  assert.equal(part('cs').textContent, 'Orlov', 'callsign first');
  assert.equal(part('vn').textContent, 'T-72B3', 'the vehicle under it');
  assert.equal(part('side').textContent, t('hud.enemy'), 'and its side');
  assert.equal(part('cause').children[0]?.dataset.cause, 'ammorack', 'an ammo-rack kill carries its cause chip');
  assert.equal(part('x').hidden, true, 'one kill carries no multiplier');
  for (const gone of ['how', 'by', 'wp', 'rg', 'stream']) assert.equal(part(gone), undefined, `no ${gone} line on the card`);
  assert.equal('damage' in ribbon || 'spot' in ribbon || 'zone' in ribbon, false, 'no earnings ledger behind it');

  clock += 3000;
  ribbon.kill({ id: 'e2', callsign: 'Petrov', vehicle: 'T-14 Armata', flag: '', specId: 'm1a3' }, shot);
  assert.equal(part('cause').children.length, 0, 'a plain shot needs no cause chip');
  assert.equal(part('x').hidden, false, 'a second kill in the window is a streak');
  assert.equal(part('n').textContent, '×2');
  assert.equal(part('x').children.length, 1, 'the streak is its count alone, no word repeating it');

  timers.at(-1)();
  assert.equal(ribbon.root.classes.has('on'), false, 'the card leaves after its hold');

  clock += 9000;
  ribbon.kill({ id: 'e3', callsign: 'Wang', vehicle: 'ZTZ-99A2', flag: '', specId: 'm1a3' }, shot);
  assert.equal(part('x').hidden, true, 'a kill after the window starts a new streak');

  ribbon.clear();
  assert.equal(ribbon.root.classes.has('on'), false, 'a new battle clears the card');
  ribbon.kill({ id: 'e4', callsign: 'Haas', vehicle: 'Leclerc', flag: '', specId: 'm1a3' }, shot);
  assert.equal(part('x').hidden, true, 'and its streak');
} finally {
  globalThis.setTimeout = realTimeout;
}
console.log('hudKillRibbon.selftest: callsign, vehicle and side, cause chip, streak multiplier, hold and reset passed; no round or earnings line');
