import assert from 'node:assert/strict';
import { createPreBattleOverlay } from './preBattleOverlay.ts';
function element() {
  const classes = new Set();
  return { textContent: '', reads: 0, get offsetWidth() { this.reads++; return 200; },
    classList: { add: (...items) => items.forEach(item => classes.add(item)),
      remove: (...items) => items.forEach(item => classes.delete(item)),
      contains: item => classes.has(item),
      toggle: (item, on) => on ? classes.add(item) : classes.delete(item) } };
}
const root = element(), kicker = element(), numeral = element();
const overlay = createPreBattleOverlay(root, kicker, numeral);
overlay.setWaiting(true);
for (const seconds of [5, 5, 0, 4]) overlay.countdown(seconds);
assert.equal(kicker.textContent, 'WAITING FOR COMMANDERS');
assert.equal(numeral.textContent, 'READY', 'loading snapshots cannot pretend the clock is running');
assert.equal(root.classList.contains('on'), true);
assert.equal(root.classList.contains('rollout'), false);
overlay.setWaiting(false);
for (const seconds of [5, 4.8, 4.2]) overlay.countdown(seconds);
assert.equal(numeral.textContent, '5');
assert.equal(numeral.reads, 1, 'same-second frames do not restart animation or force layout');
overlay.countdown(4);
assert.equal(numeral.textContent, '4');
overlay.countdown(0);
assert.equal(numeral.textContent, 'ROLL OUT!');
overlay.setWaiting(true);
assert.equal(root.classList.contains('rollout'), false);
overlay.reset();
assert.equal(root.classList.contains('on'), false, 'Garage teardown clears waiting and timer');
assert.equal(root.classList.contains('waiting'), false);
overlay.countdown(2);
assert.equal(numeral.textContent, '2', 'late joins retain authority time');
overlay.countdown(NaN);
assert.equal(numeral.textContent, '2');
overlay.reset();
overlay.countdown(5);
assert.equal(kicker.textContent, 'BATTLE BEGINS IN', 'solo/rematch does not inherit waiting');
assert.equal(numeral.textContent, '5');
overlay.reset();
console.log('preBattleOverlay.selftest: waiting, countdown, rematch and teardown passed');
