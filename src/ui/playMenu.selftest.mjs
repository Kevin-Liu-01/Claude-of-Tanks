import { revealMenuSelectOption } from './menuSelectScroll.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('./playMenu.ts', import.meta.url), 'utf8');
const responsive = await readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8');
assert.deepEqual([...source.matchAll(/class="mode" data-mode="([^"]+)"/g)].map(match => match[1]),
  ['solo', 'private', 'lan'], 'only supported modes have player-facing entry controls');
assert.doesNotMatch(source, /rankedServiceClient|rankedQueueLifecycle|onRankedStart|data-ranked|data-mode="ranked"/,
  'the removed mode cannot warm, queue, or render through the Play menu');
assert.match(source, /showRoomFailure\(reason: string, mode\?: PlayMode\): void/);
assert.match(source, /class="room-failure" hidden role="alert" aria-atomic="true" tabindex="-1"/);
assert.match(source, /aria-labelledby="cot-room-failure-title" aria-describedby="cot-room-failure-detail"/);
for (const action of ['retry', 'code', 'settings', 'garage']) {
  assert.match(source, new RegExp(`<button[^>]+data-room-failure="${action}"[^>]+type="button"`));
}
assert.match(source, /failureTitle\.textContent = failure\.title/);
assert.match(source, /failureDetail\.textContent = failure\.detail/);
assert.match(source, /retryBtn\.hidden = !failure\.canRetry \|\| !lastConnectionKind/);
assert.match(source, /generation === requestGeneration\) showFailure\(error\)/,
  'a retired request must not repaint a closed or replacement menu');
assert.match(source, /if \(session \|\| activeRoom \|\| connecting \|\| privateRoomConnection\.current\s*\|\| privateRoomConnection\.connecting\) return/,
  'late external failure presentation cannot cancel a newer lobby acquisition');
assert.match(source, /onClose: \(reason\) => \{\s*const wasHandedOff = handedOff \|\| !!activeRoom;\s*closeCurrentSession\(reason, \{ skipTransportClose: true \}\);[\s\S]*?if \(!wasHandedOff\) showRoomFailure\(reason\);\s*onNetworkClose\(reason\)/,
  'retained room ownership is captured before teardown so only parent cleanup presents its failure');
const detach = source.slice(source.indexOf('  function detachActiveRoom()'), source.indexOf('  function showCurrentRoom()'));
assert.match(detach, /if \(connecting \|\| privateRoomConnection\.connecting \|\| \(!handedOff && !activeRoom\)\) return/,
  'delayed room teardown cannot retire an in-flight or waiting replacement');
assert.match(detach, /if \(connection && \(!handedOff \|\| connection\.session !== session\)\) return/,
  'only the exact handed-off acquisition can be retired by frame cleanup');
assert.match(detach, /privateRoomConnection\.close\('room_connection_closed', \{ transportAlreadyClosed: true \}\)/,
  'intentional frame teardown retires the stale acquisition without closing its session twice');
assert.match(detach, /unsubscribeState = null;[\s\S]*roomIce = null/);
assert.match(detach, /clearRoomUrl\(\);\s*resetInvitation\(\)/,
  'retired room cleanup removes its durable invite only after the ownership guards pass');
assert.match(source, /room\.setAttribute\('aria-busy', String\(next\)\)/);
assert.match(source, /invalidInput\?\.setAttribute\('aria-describedby', 'cot-room-failure-detail'\)/);
assert.match(source, /\.room-failure button\.action\{min-height:44px/);
assert.match(source, /\.room-failure:focus-visible\{outline:2px/);
assert.match(responsive, /body\[data-cot-width='compact'\] \.cot-play \.room-failure-actions,\s*body\[data-cot-width='phone'\] \.cot-play \.room-failure-actions\{display:grid;grid-template-columns:1fr\}/,
  'room recovery actions use the shared compact and phone viewport policy');
assert.match(source, /readyBtn\.disabled = spectator \|\| !player\.connected \|\| !player\.specId \|\| next\.phase !== 'waiting'/,
  'ready players retain the enabled unready action while waiting');
assert.match(source, /const ready = !me\?\.ready;\s*if \(me && setReady\(ready\) && ready\) onReadyIntent\?\.\(\);/,
  'only a locally eligible Ready click prepares audio; Unready and guard rejection do not');
assert.equal([...source.matchAll(/onReadyIntent\?\.\(/g)].length, 1,
  'automatic join, replicated state and programmatic setReady never unlock audio');
const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /onReadyIntent: \(\) => audio\.prepare\(\)/);
assert.match(main, /const accepted = currentNetworkRoom\(\)\?\.setReady\(ready\);[\s\S]{0,230}if \(accepted && ready\) audio\.prepare\(\);/,
  'Garage prepares in the same gesture only after the coordinator accepts Ready');
// Execute the actual small event bindings, without constructing the menu or
// importing the render graph. The command owners retain their own guard tests.
const readyBinding = source.slice(source.indexOf("  readyBtn.addEventListener('click'"),
  source.indexOf("  leaveBtn.addEventListener('click'"));
for (const [ready, accepted, present] of [[false, true, true], [true, true, true],
  [false, false, true], [false, true, false]]) {
  const calls = [];
  let click;
  runInNewContext(readyBinding, {
    readyBtn: { addEventListener(type, callback) { assert.equal(type, 'click'); click = callback; } },
    state: { players: present ? [{ id: 'viewer', ready }] : [] },
    ownId: () => 'viewer',
    setReady(value) { calls.push(['command', value]); return accepted; },
    onReadyIntent() { calls.push(['prepare']); },
  });
  click();
  assert.deepEqual(calls, present
    ? [['command', !ready], ...(!ready && accepted ? [['prepare']] : [])] : [],
  'the native drawer binding preserves command/gesture order and excludes Unready or stale identity');
}
const garageReadyBinding = main.slice(main.indexOf("bus.on('ui:roomReady'"),
  main.indexOf("bus.on('ui:roomStart'"));
for (const [ready, accepted] of [[true, true], [false, true], [true, false]]) {
  const calls = [];
  let receive;
  runInNewContext(garageReadyBinding, {
    bus: { on(type, callback) { assert.equal(type, 'ui:roomReady'); receive = callback; } },
    currentNetworkRoom: () => ({ setReady(value) {
      calls.push(['command', value]);
      if (accepted) Promise.resolve().then(() => calls.push(['deferred-menu']));
      return accepted;
    } }),
    audio: { prepare() { calls.push(['prepare']); } },
  });
  receive({ ready });
  assert.deepEqual(calls, [['command', ready], ...(ready && accepted ? [['prepare']] : [])],
    'Garage device preparation stays synchronous, before deferred room resolution');
  await Promise.resolve();
  if (accepted) assert.deepEqual(calls.at(-1), ['deferred-menu']);
}
assert.match(source, /setReady\(ready: boolean\): boolean/);
assert.match(source, /\(!activeRoom && !session\) \|\| handedOff \|\| state\?\.phase !== 'waiting'/,
  'the quick control cannot change a handed-off or retired lobby');
const garage = await readFile(new URL('./garage.ts', import.meta.url), 'utf8');
const garageCss = await readFile(new URL('./garage.css', import.meta.url), 'utf8');
assert.match(garage, /class="cot-room-ready" type="button" disabled aria-pressed="false"/);
assert.match(garage, /if \(!roomStatus\?\.canSetReady\) return;\s*emit\('ui:click', \{\}\);\s*emit\('ui:roomReady', \{ ready: !roomStatus\.ready \}\)/,
  'the Garage toggles canonical readiness, without changing it optimistically');
assert.match(garage, /roomReady\.disabled = !status\?\.canSetReady/);
assert.match(garageCss, /\.cot-room-reminder,\.cot-room-ready\{min-height:44px/,
  'both room actions keep full mobile touch targets');
console.log('playMenu.selftest: supported mode boundary, safe persistent alert/actions, and stale request presentation guards');

// A selected option must not scroll the surrounding room panel and dismiss
// its own popup. Cover upper/lower/visible options and a scrolled popup.
for (const [optionTop, optionBottom, initialScroll, expected] of [
  [40,80,100,39],[260,300,0,39],[125,165,75,75],[101,261,0,0],
]) {
  let panelScroll=57,focused=false;
  const list={clientTop:1,clientHeight:160,scrollTop:initialScroll,getBoundingClientRect:()=>({top:100})};
  const option={getBoundingClientRect:()=>({top:optionTop,bottom:optionBottom}),
    focus(options){assert.deepEqual(options,{preventScroll:true});focused=true;},
    scrollIntoView(){panelScroll++;throw new Error('Ancestor-scrolling option reveal');}};
  revealMenuSelectOption(list,option);
  assert.equal(focused,true);assert.equal(panelScroll,57);assert.equal(list.scrollTop,expected);
}
assert.equal((source.match(/revealMenuSelectOption\(list, /g)||[]).length,2,
  'opening and keyboard navigation share the same list-only reveal');
