import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNetworkRoundLifecycle } from './networkRoundLifecycle.ts';

const calls = [];
const game = {
  result: { winner: 'alpha' },
  resultReason: 'elimination',
  timeS: 92,
  preBattleS: 0,
};
const lifecycle = createNetworkRoundLifecycle({
  game,
  session: {
    disposePresentation() { calls.push('dispose-presentation'); },
    clearRound() { calls.push('clear-round'); },
    close(reason) { calls.push(`close-session:${reason}`); },
  },
  getEntryOwner: () => ({
    cancel(reason) { calls.push(`cancel-entry:${reason}`); },
  }),
  getRoomOwner: () => ({
    clear() { calls.push('clear-room'); },
  }),
});

lifecycle.disposePresentation();
lifecycle.clearRound();
assert.deepEqual(calls, ['dispose-presentation', 'clear-round'],
  'rematch cleanup must retain both entry and room owners');

lifecycle.resetBattleState();
assert.deepEqual(game, {
  result: null,
  resultReason: null,
  timeS: 0,
  preBattleS: Infinity,
}, 'a new round cannot expose the previous verdict or clock');

lifecycle.close('entry_failed');
assert.deepEqual(calls.slice(2), [
  'cancel-entry:entry_failed',
  'close-session:entry_failed',
  'clear-room',
], 'full close must abort entry before transport and room teardown');

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /createNetworkRoundLifecycle\(\{/,
  'the composition root must install the shared round lifecycle');
assert.doesNotMatch(mainSource, /function closeNetworkMatch\(/,
  'network close ordering must not drift back into main');
assert.doesNotMatch(mainSource, /function resetNetworkBattleState\(/,
  'network result reset policy must not drift back into main');

console.log('[networkRoundLifecycle.selftest] PASS');
