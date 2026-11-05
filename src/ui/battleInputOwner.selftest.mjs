// 2026-11-02 audit F4: one battle input owner (presentation > menu > veil > play) that every Esc, pointer-lock and replay
// path asks. The browser hazard itself (one Esc skipping an ending beat AND opening Settings) is reproduced through the
// access in settingsAccess.selftest.mjs; this receipt pins the owner's transitions.
import assert from 'node:assert/strict';
import {
  battleInputOwnerFor, createBattleInputOwner, PRESENTATION_DONE_GRACE_MS,
} from './battleInputOwner.ts';
import { publishKillcamScreen } from '../game/killcamScreen.ts';

let now = 1000;
// the kill-cam controller's own flag (killcamScreen.ts, IR15): the owner reads it; its begin/done edges only notify
let replayLive = false;
const owner = createBattleInputOwner({ now: () => now, killcamLive: () => replayLive });
const replayBegins = () => { replayLive = true; owner.beginPresentation('killcam'); };
const replayDone = () => { replayLive = false; owner.endPresentation('killcam'); };
let changes = 0;
owner.onChange(() => { changes++; });

assert.equal(owner.state, 'play');
assert.equal(owner.canOpenMenu(), true);

// the veil: one at a time, refused over the menu and a live presentation
assert.equal(owner.showVeil('pause'), true);
assert.equal(owner.state, 'veil');
assert.equal(owner.veil, 'pause');
assert.equal(owner.showVeil('relock'), false, 'a veil already up keeps its trigger');
assert.equal(owner.veil, 'pause');
// the menu supersedes the veil
assert.equal(owner.openMenu(), true);
assert.equal(owner.state, 'menu');
assert.equal(owner.veil, null, 'opening the menu drops the veil');
assert.equal(owner.openMenu(), false, 'the menu opens once');
assert.equal(owner.showVeil('relock'), false, 'no veil over the open menu');
owner.closeMenu();
assert.equal(owner.state, 'play');

// a presentation owns the screen: no menu, no veil; it drops a veil already up
assert.equal(owner.showVeil('relock'), true);
owner.beginPresentation('ending');
assert.equal(owner.state, 'presentation');
assert.equal(owner.veil, null, 'a presentation drops the veil');
assert.equal(owner.presentationOwns(), true);
assert.equal(owner.openMenu(), false, 'no menu over an ending beat');
assert.equal(owner.canOpenMenu(), false);
assert.equal(owner.showVeil('pause'), false, 'no veil over an ending beat');
owner.endPresentation('ending');
assert.equal(owner.state, 'play', 'the screen is released');
assert.equal(owner.presentationOwns(), true, 'the done grace still owns the skip press');
assert.equal(owner.openMenu(), false, 'the press that skipped the beat opens no menu');
assert.equal(owner.showVeil('pause'), true, 'the veil is refused only while a presentation is live');
owner.hideVeil();
now += PRESENTATION_DONE_GRACE_MS;
assert.equal(owner.presentationOwns(), false);
assert.equal(owner.openMenu(), true, 'past the grace the menu opens');
// the menu open when a presentation begins: the presentation outranks it (the panel closes itself on the edge)
replayBegins();
assert.equal(owner.state, 'presentation');
owner.closeMenu();
assert.equal(owner.state, 'presentation');

// overlapping sources: the first done does not release the screen while the other still owns it
owner.beginPresentation('ending');
replayDone();
now += 10 * PRESENTATION_DONE_GRACE_MS;
assert.equal(owner.state, 'presentation', 'an ending beat outlives the replay\'s done');
assert.equal(owner.canOpenMenu(), false);
owner.endPresentation('ending');
assert.equal(owner.presentationOwns(), true);
now += PRESENTATION_DONE_GRACE_MS;
assert.equal(owner.canOpenMenu(), true);
// a repeated edge is idempotent; an unknown done is ignored
replayBegins();
owner.beginPresentation('killcam');
owner.endPresentation('ending');
assert.equal(owner.state, 'presentation');
replayDone();
assert.equal(owner.state, 'play');

// the reset of last resort: a lost done, then a phase flip, releases the screen with no grace
now += PRESENTATION_DONE_GRACE_MS;
owner.beginPresentation('ending');
owner.resetPresentation();
assert.equal(owner.state, 'play');
assert.equal(owner.presentationOwns(), false, 'a reset leaves no grace behind');
const before = changes;
owner.resetPresentation();
assert.equal(changes, before, 'a reset with nothing to release changes nothing');
assert.ok(changes > 10, 'every transition notifies its listeners');

// one owner per bus, fed by the presentation edges whichever consumer asked first
const handlers = new Map();
const bus = { on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); } };
const emit = (event) => { for (const handler of handlers.get(event) ?? []) handler({}); };
let busNow = 0;
let busReplay = false;
publishKillcamScreen(bus, () => busReplay);
const shared = battleInputOwnerFor(bus, { now: () => busNow });
assert.equal(battleInputOwnerFor(bus), shared, 'every consumer of a bus reads the same owner');
assert.deepEqual([...handlers.keys()].sort(), ['ending:begin', 'ending:done', 'killcam:begin', 'killcam:done', 'phase:change']);
busReplay = true;
emit('killcam:begin');
assert.equal(shared.state, 'presentation', 'the bus\'s owner reads the replay flag published on that bus');
busReplay = false;
emit('killcam:done');
assert.equal(shared.presentationOwns(), true);
busNow += PRESENTATION_DONE_GRACE_MS;
emit('ending:begin');
assert.equal(shared.canOpenMenu(), false);
emit('phase:change');
assert.equal(shared.canOpenMenu(), true);
assert.notEqual(battleInputOwnerFor({ on() {} }), shared, 'another bus has its own owner');

console.log('battleInputOwner.selftest: precedence, veil and menu refusals, the done grace, overlapping sources, the phase reset and one owner per bus pass');
