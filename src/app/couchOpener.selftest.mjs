// round 8 Y4 s3-03: the couch lobby is a lazy Garage opener (2026-11-02 audit F5's rule). The Couch press loaded the couch
// runtime and the lobby's chunk and then opened the lobby with no check that the Garage still showed: a press, then
// Launch on the same Deploy foot inside a cold download, opened the lobby's modal over the loader or the battle and a
// pairing lobby nobody wanted (runtime.open(), a PadPair object and a socket). The one path is openCouchWhenCurrent
// (src/app/couchOpener.ts), driven here with the real Garage screen owner (garageScreen.ts) and a deferred load; main.ts's
// onCouch and garage.ts's press are pinned to it in garageOpenState.selftest (case 5).
import assert from 'node:assert/strict';
import { createGarageScreen } from '../ui/garageScreen.ts';

const { openCouchWhenCurrent } = await import('./couchOpener.ts').catch(() => ({}));
assert.equal(typeof openCouchWhenCurrent, 'function', 'one couch opener checks the Garage that asked (before: none)');

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** The loaded pair as main.ts's onCouch has it: the couch runtime (its open() starts the pairing lobby) and the lobby's
 *  module (its openCouchLobby calls runtime.open() and opens the modal). */
function loadedPair(calls) {
  const runtime = { open: () => { calls.push('lobby factory'); return {}; } };
  const lobby = { openCouchLobby: (target) => { calls.push('openCouchLobby'); target.open(); } };
  return [runtime, lobby];
}
const show = ([runtime, lobby]) => lobby.openCouchLobby(runtime);

// A press, then a battle start hides the Garage while the chunks download: nothing opens over what replaced it.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  screen.hide(); // Launch on the same Deploy foot: the battle entry hides the Garage
  load.resolve(loadedPair(calls));
  assert.equal(await opening, false, 'the Garage that asked hid: the press opens nothing');
  assert.deepEqual(calls, [], 'no lobby modal and no pairing lobby (before: both, over the battle)');
}

// A press whose chunks land while the Garage still shows opens the lobby once.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  load.resolve(loadedPair(calls));
  assert.equal(await opening, true);
  assert.deepEqual(calls, ['openCouchLobby', 'lobby factory'], 'exactly one lobby, over the Garage that asked');
}

// A Garage hidden and shown again before the chunks land is a new open span: the old press's ticket lapsed.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const load = deferred();
  const opening = openCouchWhenCurrent({ ticket: screen.ticket(), load: () => load.promise, open: show });
  screen.hide();
  screen.show();
  load.resolve(loadedPair(calls));
  assert.equal(await opening, false);
  assert.deepEqual(calls, []);
}

// A chunk that did not arrive rejects to the press (garage.ts reports it under the loaders' policy: the button's error
// state and Reload page), and opens nothing.
{
  const screen = createGarageScreen();
  screen.show();
  const calls = [];
  const failure = new Error('chunk failed');
  await assert.rejects(openCouchWhenCurrent({ ticket: screen.ticket(), load: () => Promise.reject(failure), open: show }),
    (error) => error === failure);
  assert.deepEqual(calls, []);
}

console.log('couchOpener.selftest: the couch lobby opens only over the Garage that asked, once, and a failed chunk reaches the press passed');
