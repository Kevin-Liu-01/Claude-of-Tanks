// The drone control as the HUD shows it (owner 2026-10-14): it reads the view the authority sends and never decides.
// Launch when ready; in flight the return stands disabled until the pilot is in the drone's feed; a recalled drone
// cannot launch while it flies home and lands, nor through the recall cooldown after; a recall closes the feed cleanly,
// a loss in static.
import assert from 'node:assert/strict';
import { droneControl, dronePhase } from './droneControlState.ts';
import { createDroneFeedTransition } from './droneFeedTransition.ts';
import { t } from './i18n.ts';

const view = (o) => ({ active: false, cooldownS: 0, recallS: 0, returnS: 0, ...o });
const cases = [
  [view({}), true, 'ready', false],
  [undefined, true, 'ready', false],
  [view({ active: true, recallS: 1.2 }), true, 'locked', true],
  [view({ active: true, recallS: 0 }), true, 'flying', false],
  [view({ returnS: 6.1, cooldownS: 11.1 }), true, 'returning', true],
  [view({ cooldownS: 4.2 }), true, 'cooldown', true],
  [view({ cooldownS: 25 }), true, 'cooldown', true],
  [view({ active: true }), false, 'flying', true],
  // Older views without the recall fields (a host before this change) read as before: in flight, a return.
  [{ active: true, cooldownS: 0 }, true, 'flying', false],
];
for (const [flight, canControl, phase, disabled] of cases) {
  assert.equal(dronePhase(flight), phase);
  assert.deepEqual({ ...droneControl(flight, canControl) }, { phase, disabled }, JSON.stringify({ flight, canControl }));
}
for (const key of ['flight.return.locked', 'flight.hint.recallLocked']) assert.notEqual(t(key), key, `${key} is in the catalog`);

// The feed: a recall the authority accepted closes it without the signal-loss static; a loss still breaks it.
for (const [recalled, expected] of [[true, 0], [false, 1]]) {
  const feed = createDroneFeedTransition();
  feed.step(false, true, true, 0); feed.step(true, true, true, 100);
  assert.equal(feed.step(false, false, true, 200, recalled), expected, recalled ? 'a recall cuts cleanly' : 'a loss shows static');
  assert.equal(feed.step(false, false, true, 900, recalled), 0);
}
console.log('droneControlState: ready, locked, flying, returning and cooldown phases; a recall closes the feed without static');
