// hudKillRibbon.selftest.mjs — (brand-ui 242) the kill ribbon and the personal stream (the direction's 06-battle-hud.html
// .ribbon), over the recording DOM: the victim's callsign and vehicle, the cause chip where the cause says more than a
// shot, the streak's multiplier from the second kill in its window, the stream's kills and the damage the player dealt
// the streak's victims, the 2.4 s hold, and a clean slate between battles.
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import { createKillRibbon } from './hudKillRibbon.ts';
import { formatNumber, t } from './i18n.ts';

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

  ribbon.damage('e1', 300);
  ribbon.damage('e1', 340);
  ribbon.damage('e2', 120);
  ribbon.kill({ id: 'e1', callsign: 'Orlov', vehicle: 'T-72B3', flag: '', specId: 'm1a3' }, rack);
  assert.equal(ribbon.root.classes.has('on'), true, 'the player\'s kill takes the ribbon');
  assert.equal(part('cs').textContent, 'Orlov', 'callsign first');
  assert.equal(part('vn').textContent, 'T-72B3', 'the vehicle beside it');
  assert.equal(part('w').textContent, t('hud.kill.shot'));
  const cause = part('cause').children[0];
  assert.equal(cause?.dataset.cause, 'ammorack', 'an ammo-rack kill carries its cause chip');
  assert.equal(part('x').hidden, true, 'one kill carries no multiplier');
  const stream = part('stream').children;
  assert.equal(stream[0].children[1].textContent, t('hud.ribbon.kills', { count: 1 }));
  assert.equal(stream[1].children[1].textContent, t('hud.ribbon.damage', { amount: formatNumber(640) }),
    'the damage the player dealt the victim joins the stream');

  clock += 3000;
  ribbon.kill({ id: 'e2', callsign: 'Petrov', vehicle: 'T-14 Armata', flag: '', specId: 'm1a3' }, shot);
  assert.equal(part('cause').children.length, 0, 'a plain shot needs no cause chip');
  assert.equal(part('x').hidden, false, 'a second kill in the window is a streak');
  assert.equal(part('n').textContent, '×2');
  assert.equal(part('x').children[1].textContent, t('hud.ribbon.multi.2'));
  assert.equal(stream[0].children[1].textContent, t('hud.ribbon.kills', { count: 2 }));
  assert.equal(stream[1].children[1].textContent, t('hud.ribbon.damage', { amount: formatNumber(760) }));

  timers.at(-1)();
  assert.equal(ribbon.root.classes.has('on'), false, 'the ribbon leaves after its hold');

  clock += 9000;
  ribbon.kill({ id: 'e3', callsign: 'Wang', vehicle: 'ZTZ-99A2', flag: '', specId: 'm1a3' }, shot);
  assert.equal(part('x').hidden, true, 'a kill after the window starts a new streak');
  assert.equal(stream[1].hidden, true, 'no damage dealt, no damage line');

  ribbon.damage('e4', 500);
  ribbon.clear();
  assert.equal(ribbon.root.classes.has('on'), false, 'a new battle clears the ribbon');
  ribbon.kill({ id: 'e4', callsign: 'Haas', vehicle: 'Leclerc', flag: '', specId: 'm1a3' }, shot);
  assert.equal(stream[0].children[1].textContent, t('hud.ribbon.kills', { count: 1 }), 'and its streak');
  assert.equal(stream[1].hidden, true, 'and the damage ledger');
} finally {
  globalThis.setTimeout = realTimeout;
}
console.log('hudKillRibbon.selftest: callsign first, cause chip, streak multiplier, stream (kills, dealt damage), hold and reset passed');
