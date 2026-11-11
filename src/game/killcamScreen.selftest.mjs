// 2026-11-02 audit F4 / IR15 (round 2): "a kill-cam replay owns the screen" has one owner, the replay controller's own
// `active` flag (killcam.ts), published on its bus (killcamScreen.ts). The battle input owner reads it, so a lost
// 'killcam:done' cannot hold the Esc menu and the veil off for the rest of the battle, a stray 'killcam:begin' cannot
// take the screen with no replay on it, and an edge never outvotes the fact. The audio overlay's half is pinned in
// src/audio/battleMode.selftest.mjs section 5; the phase policy's binding is pinned here from main.ts's source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { killcamOwnsScreen, publishKillcamScreen } from './killcamScreen.ts';
import { battleInputOwnerFor, PRESENTATION_DONE_GRACE_MS } from '../ui/battleInputOwner.ts';

const fakeBus = () => {
  const handlers = new Map();
  return {
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => handlers.set(event, (handlers.get(event) ?? []).filter((entry) => entry !== handler));
    },
    emit(event, payload) { for (const handler of handlers.get(event) ?? []) handler(payload); },
  };
};

// ------------------------------------------------------------ 1. the fact
{
  const bus = fakeBus();
  assert.equal(killcamOwnsScreen(bus), false, 'no replay controller bound: no replay can be on screen');
  assert.equal(killcamOwnsScreen(null), false);
  let active = true;
  publishKillcamScreen(bus, () => active);
  assert.equal(killcamOwnsScreen(bus), true, 'the controller\'s flag is the fact');
  active = false;
  assert.equal(killcamOwnsScreen(bus), false, 'read live, never latched');
  assert.equal(killcamOwnsScreen(fakeBus()), false, 'per bus');
  assert.throws(() => publishKillcamScreen(bus, null), TypeError);
}

// ------------------------------------------------------------ 2. the battle input owner reads it
{
  const bus = fakeBus();
  let now = 1000;
  let active = false;
  publishKillcamScreen(bus, () => active);
  const owner = battleInputOwnerFor(bus, { now: () => now });
  const begin = () => { active = true; bus.emit('killcam:begin', { kind: 'death' }); };
  const done = () => { active = false; bus.emit('killcam:done', {}); };
  const later = () => { now += 10 * PRESENTATION_DONE_GRACE_MS; };

  // a replay that ends normally: the screen is the replay's, then the skip press's grace, then the player's
  assert.equal(owner.showVeil('pause'), true);
  begin();
  assert.equal(owner.state, 'presentation');
  assert.equal(owner.veil, null, 'the replay drops the veil');
  assert.equal(owner.canOpenMenu(), false);
  done();
  assert.equal(owner.state, 'play');
  assert.equal(owner.presentationOwns(), true, 'the press that skipped the replay opens no menu (the grace)');
  later();
  assert.equal(owner.canOpenMenu(), true);

  // a lost done: the replay's teardown ran (the flag is down) but no edge reached this bus
  begin();
  active = false;
  assert.equal(owner.state, 'play', 'a replay no longer on screen does not own it, done or no done');
  assert.equal(owner.canOpenMenu(), true, 'the Esc menu is not held off for the rest of the battle');
  assert.equal(owner.showVeil('pause'), true, 'and the veil may rise');
  owner.hideVeil();

  // a stray begin: an edge with no replay on screen takes nothing
  bus.emit('killcam:begin', { kind: 'death' });
  assert.equal(owner.state, 'play', 'a begin edge with no replay on screen does not take the screen');
  assert.equal(owner.canOpenMenu(), true);

  // an edge never outvotes the fact: a done while a replay is still on screen releases nothing
  begin();
  bus.emit('killcam:done', {});
  assert.equal(owner.state, 'presentation', 'a done edge while the replay is still up keeps the screen the replay\'s');
  assert.equal(owner.canOpenMenu(), false);
  done();
  later();
  assert.equal(owner.state, 'play');

  // a phase flip leaves the replay's fact alone: the controller's cancel() is what ends a replay
  begin();
  bus.emit('phase:change', { phase: 'garage' });
  assert.equal(owner.state, 'presentation', 'the screen is the replay\'s while the controller says so');
  done();
  later();

  // (U22, round 2) one clock per bus: a later caller that names another clock is refused loudly, never silently
  // handed the first caller's
  assert.equal(battleInputOwnerFor(bus), owner, 'a caller that names no clock gets the bus\'s owner');
}
{
  const bus = fakeBus();
  const first = battleInputOwnerFor(bus);
  const clock = () => 5;
  assert.throws(() => battleInputOwnerFor(bus, { now: clock }), /clock/,
    'asking for a fake clock on a bus whose owner runs on the default clock throws');
  assert.throws(() => battleInputOwnerFor(bus, { graceMs: 1 }), /grace/);
  assert.equal(battleInputOwnerFor(bus), first);
  const other = fakeBus();
  const owned = battleInputOwnerFor(other, { now: clock });
  assert.equal(battleInputOwnerFor(other, { now: clock }), owned, 'the same clock again is the same owner');
  assert.equal(battleInputOwnerFor(other), owned);
}

// ------------------------------------------------------------ 3. the phase policy reads the same flag
{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.match(main, /isKillcamActive: \(\) => killcam\.isActive\(\),/,
    'main.ts binds the phase policy\'s isKillcamActive to the replay controller\'s own flag (killcam.isActive)');
  const killcam = readFileSync(new URL('./killcam.ts', import.meta.url), 'utf8');
  assert.match(killcam, /isActive\(\) \{ return active; \}/, 'killcam.isActive() is the controller\'s `active`');
  assert.match(killcam, /publishKillcamScreen\(bus, \(\) => active\);/, 'and bindBus publishes that same flag on its bus');
}

console.log('killcamScreen.selftest: the kill-cam replay flag is the one owner of the screen fact (lost, stray and stale edges; one clock per bus) passed');
